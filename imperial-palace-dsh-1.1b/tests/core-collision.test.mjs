#!/usr/bin/env node
/**
 * `tests/core-collision.test.mjs` —— t27 回归：碰撞语义修正
 *   ① 障碍 y0 从足迹地坪起算（抬高台基的建筑不能"从下方穿入"）
 *   ② 水体不可站立（由 WATER_BODIES 派生阻挡；桥面仍可通行）
 *   ③ zoneLayout 补 waterBodies / scenicObjects 切片
 *   ④ 与 B/C/E/D 各区自补兜底兼容去重（不改总数的量化证据）
 *   ⑤ `layout.OBSTACLES` 81 条基线做成 core 一等内建图层（任何装配顺序都在册）
 *   ⑥ `door.axis` 语义统一（面法线轴）+ 沿 x 宫墙不得整条当门洞的反例
 */

import {
  ROOT,
  REAL_ZONE_IDS,
  assert,
  assertClose,
  assertEqual,
  assertNoProblems,
  createTestRunner,
  loadModule,
  loadThree,
  makeSilentEvents,
  makeTestCtx,
  zoneModulePath,
} from './harness.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const runner = createTestRunner('core-collision.test.mjs · 碰撞语义（y0 下钳 / 水体不站立 / 基线图层 / door 轴）');

const THREE = await loadThree();
const { CONFIG, INTERACTION } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const slice = await loadModule('src/core/layout-slice.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createFpSolver } = await loadModule('src/core/camera.js');
const { validateZoneResult } = await loadModule('src/core/context.js');

const {
  assembleBaselineObstacles,
  deriveWaterColliders,
  normalizeObstacle,
  normalizeDoorFields,
  obstacleBlocksPoint,
  insideObstacleDoor,
  footprintFloor,
  waterBodiesForZone,
  scenicObjectsForZone,
} = slice;

const baseline = assembleBaselineObstacles();
const baselineById = new Map(baseline.list.map((o) => [o.id, o]));
const makeRegistry = () => createRegistry({ config: CONFIG, events: makeSilentEvents(), layout: LAYOUT });

/**
 * `src/interaction/walk-solver.js` 的**原始**门洞判定（旧约定：把 `door.axis` 直接当"面法线轴"）。
 * 注意这正是"沿 x 宫墙整条成门洞"的隐患来源 —— 归一后的判定是 `insideObstacleDoor`（canonical）。
 */
function legacyInsideDoorChannel(door, bounds, x, z) {
  if (!door || !bounds) return false;
  const halfWidth = door.width / 2 - INTERACTION.player.radius;
  if (door.axis === 'z') {
    return Math.abs(x - door.center.x) <= halfWidth && z >= bounds.minZ - INTERACTION.player.radius && z <= bounds.maxZ + INTERACTION.player.radius;
  }
  return Math.abs(z - door.center.z) <= halfWidth && x >= bounds.minX - INTERACTION.player.radius && x <= bounds.maxX + INTERACTION.player.radius;
}

/** 与 src/interaction/walk-solver.js 等价的"旧语义"：只看 y1（不看 y0）——用于对照。 */
function legacySolverBlocks(obstacle, x, z, feetY) {
  const b = obstacle.bounds;
  if (x < b.minX - INTERACTION.player.radius || x > b.maxX + INTERACTION.player.radius) return false;
  if (z < b.minZ - INTERACTION.player.radius || z > b.maxZ + INTERACTION.player.radius) return false;
  if (feetY >= (obstacle.y1 ?? 0) - INTERACTION.step.maxStepHeight * 0.5) return false;
  if (obstacle.blocks === 'exceptDoor' && legacyInsideDoorChannel(obstacle.door, b, x, z)) return false;
  return true;
}

/* ========================================================================== */
runner.section('1. y0 基准统一：从足迹地坪起算（抬高台基不能"从下方穿入"）');
/* ========================================================================== */

await runner.test('基线组装：41 条 y0 下钳到足迹地坪、其余保持 layout 原值，并记录 y0Recorded', () => {
  const stats = baseline.stats;
  assertEqual(stats.total, LAYOUT.OBSTACLES.length, '基线条目数应等于 layout.OBSTACLES');
  assert(stats.y0Clamped >= 40, `应有 ≥40 条被下钳（实际 ${stats.y0Clamped}）`);
  let checked = 0;
  for (const entry of baseline.list) {
    if (entry.sourceType === 'water') continue; // 水体走派生路径（下一节）
    const recorded = entry.y0Recorded;
    const floor = footprintFloor(entry.bounds, { helpers: LAYOUT });
    if (floor === null) continue;
    assert(entry.y0 <= floor + 1e-6, `${entry.id} 的 y0(${entry.y0}) 不得高于足迹地坪(${floor})`);
    assert(entry.y0 === Math.min(recorded, floor) || Math.abs(entry.y0 - Math.min(recorded, floor)) < 1e-6, `${entry.id} 的 y0 应 = min(记录值, 足迹地坪)`);
    checked += 1;
  }
  assert(checked >= 60, `应核对 ≥60 条建筑/点景障碍（实际 ${checked}）`);
  runner.info(`基线 ${baseline.list.length} 条：y0 下钳 ${stats.y0Clamped}、水体派生替换 ${stats.waterReplaced}、door 翻轴 ${stats.doorAxisFlipped}`);
});

await runner.test('B/C/D/E/F 每区 ≥1 栋高台基建筑：地面高度"从下方穿入"判定必须被阻挡（附原始盒对照）', () => {
  const rows = [];
  for (const zoneId of REAL_ZONE_IDS) {
    const candidates = baseline.list
      .filter((o) => o.zone === zoneId && o.sourceType === 'building')
      .map((o) => {
        const floor = footprintFloor(o.bounds, { helpers: LAYOUT });
        return { entry: o, floor, gap: floor === null ? null : +(o.y0Recorded - floor).toFixed(2), raw: LAYOUT.OBSTACLES.find((x) => x.id === o.id) };
      })
      .filter((r) => r.floor !== null)
      .sort((a, b) => b.gap - a.gap);
    const worst = candidates[0];
    assert(worst, `${zoneId} 应有可判定地坪的建筑障碍`);
    const b = worst.entry.bounds;
    // 建筑可能有"门洞"（如 F 的城门/宫门）：取**侧翼实心处**探测（门洞中心是设计上的可通点，单独验证）
    const lateralHalf = worst.entry.door ? worst.entry.door.width / 2 + INTERACTION.player.radius + 1 : 0;
    const x = (b.minX + b.maxX) / 2 + lateralHalf;
    const z = (b.minZ + b.maxZ) / 2;
    const feetY = worst.floor;

    // ① 归一后（core 基线）：必须阻挡（这就是"不能从下方穿入"）
    const blockedByBase = obstacleBlocksPoint(worst.entry, { x, z, feetY });
    assert(blockedByBase, `${zoneId} 最不利建筑 ${worst.entry.id}（gap=${worst.gap}）在足迹地坪 ${feetY}m 处必须被阻挡`);
    if (worst.entry.door) {
      const doorPoint = { x: worst.entry.door.center.x, z: worst.entry.door.center.z, feetY };
      assert(!obstacleBlocksPoint(worst.entry, doorPoint), `${worst.entry.id} 的设计门洞必须可通（门 ≠ 实心）`);
      assert(worst.entry.door.axis !== worst.entry.door.lateralAxis, `${worst.entry.id} 门洞轴必须是面法线轴`);
    }

    // ② 原始 layout 盒（y0 = 台基顶）在同样位置：gap > 玩家高时**不会**阻挡 → 这就是上报的缺陷
    const rawBlocked = obstacleBlocksPoint({ ...worst.raw, y0: worst.raw.y0 }, { x, z, feetY });
    assertEqual(
      rawBlocked,
      worst.gap <= INTERACTION.player.height,
      `${zoneId} 原始盒 y 区间判定应与 gap(${worst.gap}) vs 玩家高(${INTERACTION.player.height}) 一致`,
    );
    rows.push({ zone: zoneId, id: worst.entry.id, gap: worst.gap, floor: feetY, y0Recorded: worst.entry.y0Recorded, y0Now: worst.entry.y0, rawBlocked });
  }
  for (const r of rows) {
    runner.info(`${r.zone}: ${r.id} 足迹地坪 ${r.floor}m、y0 记录 ${r.y0Recorded} → 下钳 ${r.y0Now}（gap ${r.gap}m）｜原始盒 y 判定=${r.rawBlocked ? '阻挡' : '放行(缺陷)'}｜归一后=阻挡`);
  }
  assert(rows.filter((r) => !r.rawBlocked).length >= 2, '至少应复现 ≥2 例"原始盒放行"（B/F 的 gap 超过玩家高）');
});

await runner.test('真实第一人称求解器：玩家从外侧走进高台基建筑足迹 → 被阻挡（位置不进入）', () => {
  const registry = makeRegistry();
  const obstacles = registry.allObstacles();
  const solver = createFpSolver({ config: CONFIG });
  // 取 D 区主屋（gap 0.5、地坪 0.4）与 E 区主屋（gap 0.6）作为"可达"用例
  const cases = ['OB-D-court1-hall', 'OB-E-court1-hall', 'OB-F-garden-hall-north'];
  let verified = 0;
  for (const id of cases) {
    const entry = baselineById.get(id);
    const b = entry.bounds;
    const start = { x: (b.minX + b.maxX) / 2, z: b.minZ - 6 };
    const floor = LAYOUT.floorYAt(start.x, start.z);
    if (floor === null) {
      runner.skip(`${id} 求解器穿越判定`, '起点无可行走面');
      continue;
    }
    const result = solver.step({ x: start.x, y: floor + CONFIG.CAMERA.fpEyeHeight, z: start.z }, 0, 1, 6, { obstacles });
    const entered = result.z > b.minZ + 0.01;
    assert(!entered, `${id} 不得走进建筑足迹（终点 z=${result.z.toFixed(2)}，足迹南缘 z=${b.minZ}）`);
    assert(result.blocked.length > 0, `${id} 应给出阻挡原因`);
    verified += 1;
  }
  assert(verified >= 2, `至少 2 例求解器穿越判定（实际 ${verified}）`);
});

/* ========================================================================== */
runner.section('2. 水体不可站立（WATER_BODIES 派生；桥面仍可通行）');
/* ========================================================================== */

/** 池面上"无建筑覆盖、且地板给值"的可站立点（真正能站上去的水面点）。 */
function freePondPoints(waterId, limit = 5) {
  const water = LAYOUT.WATER_BODIES.find((w) => w.id === waterId);
  const buildings = LAYOUT.OBSTACLES.filter((o) => o.sourceType === 'building');
  const out = [];
  for (let x = water.bounds.minX + 3; x <= water.bounds.maxX - 3 && out.length < limit; x += 4) {
    for (let z = water.bounds.minZ + 3; z <= water.bounds.maxZ - 3 && out.length < limit; z += 4) {
      const covered = buildings.some((o) => x >= o.bounds.minX && x <= o.bounds.maxX && z >= o.bounds.minZ && z <= o.bounds.maxZ);
      const floor = LAYOUT.floorYAt(x, z);
      if (!covered && floor !== null) out.push({ x, z, floor });
    }
  }
  return out;
}

await runner.test('派生水体盒：id 与 layout 的 8 条一致、顶面 = 岸边地坪 + 0.6m、底面覆盖水体', () => {
  const derived = deriveWaterColliders();
  assertEqual(derived.length, 8, '应派生 8 个水体阻挡盒（4 段护城河 + 4 个水池）');
  for (const box of derived) {
    assert(LAYOUT.OBSTACLES.some((o) => o.id === box.id), `${box.id} 必须对应 layout 的水体障碍 id`);
    assert(box.y1 > box.y0, `${box.id} y0/y1 有误`);
    assert(box.y1 - box.y0 >= 0.6, `${box.id} 厚度应足以拦人`);
    assert(['all', 'exceptDoor'].includes(box.blocks), `${box.id} blocks 语义非法`);
    if (box.blocks === 'exceptDoor') {
      assert(box.door && box.door.width > 0, `${box.id} 有桥面通道时必须给出 door`);
      assert(box.door.axis !== box.door.lateralAxis, `${box.id} 通道轴必须是面法线轴`);
    }
  }
  runner.info(
    `水体盒：${derived.map((b) => `${b.id}(y1=${b.y1}${b.blocks === 'exceptDoor' ? `,桥面通道${b.door.width}m` : ''})`).join(' ')}`,
  );
});

await runner.test('E 区水池：池面站立判定必须失败（原始盒放行 → 派生盒阻挡）', () => {
  const points = freePondPoints('WB-E-pond', 3);
  assert(points.length >= 2, 'E 池面应有可站立采样点');
  const derived = baselineById.get('OB-WB-E-pond');
  const legacy = LAYOUT.OBSTACLES.find((o) => o.id === 'OB-WB-E-pond');
  let legacyAllowed = 0;
  for (const p of points) {
    assert(obstacleBlocksPoint(derived, { x: p.x, z: p.z, feetY: p.floor }), `E 池面 (${p.x},${p.z}) 必须被阻挡`);
    if (!obstacleBlocksPoint(legacy, { x: p.x, z: p.z, feetY: p.floor })) legacyAllowed += 1;
  }
  assertEqual(legacyAllowed, points.length, '原始水体盒（顶面 0.05 < 地坪 0.4）应全部放行 —— 这就是"可站在水上"的缺陷');
  runner.info(`E 池面 ${points.length} 点：原始盒放行 ${legacyAllowed}/${points.length} → 派生盒全部阻挡`);
});

await runner.test('D 区荷池：同样必须拦截（站立判定 + 求解器从池畔走入被挡）', () => {
  const points = freePondPoints('WB-D-pond', 3);
  assert(points.length >= 2, 'D 荷池面应有可站立采样点');
  const derived = baselineById.get('OB-WB-D-pond');
  for (const p of points) {
    assert(obstacleBlocksPoint(derived, { x: p.x, z: p.z, feetY: p.floor }), `D 荷池面 (${p.x},${p.z}) 必须被阻挡`);
  }
  // 求解器：从池畔（同一地坪）向池心走一步 → 被挡
  const registry = makeRegistry();
  const solver = createFpSolver({ config: CONFIG });
  const target = points[0];
  const startX = target.x - 6;
  const floor = LAYOUT.floorYAt(startX, target.z);
  assert(floor !== null, '池畔起点应有可行走面');
  const result = solver.step({ x: startX, y: floor + CONFIG.CAMERA.fpEyeHeight, z: target.z }, 1, 0, 6, { obstacles: registry.allObstacles() });
  const insideWater = result.x >= derived.bounds.minX - 0.5;
  assert(!insideWater, `不得走进 D 荷池（终点 x=${result.x.toFixed(2)}，池西缘 ${derived.bounds.minX}）`);
  assert(result.blocked.length > 0, '应给出阻挡原因');
  runner.info(`D 荷池：从 x=${startX} 朝池心走 6m → 停在 x=${result.x.toFixed(2)}（池西缘 ${derived.bounds.minX}），原因 ${JSON.stringify(result.blocked.slice(0, 2))}`);
});

await runner.test('护城河：水不可进，但四座桥面通道仍可通行（否则走查关键路径被堵）', () => {
  const moatSouth = baselineById.get('OB-MOAT-south');
  const moatWest = baselineById.get('OB-MOAT-west');
  // 水面（bank 上）被挡
  assert(obstacleBlocksPoint(moatSouth, { x: 100, z: -490, feetY: 0 }), '护城河水面必须阻挡');
  assert(obstacleBlocksPoint(moatWest, { x: -349, z: 100, feetY: 0 }), '西护城河水面必须阻挡');
  // 桥面通道放行
  assert(!obstacleBlocksPoint(moatSouth, { x: 0, z: -490, feetY: 0.8 }), '南桥桥面必须可通行');
  assert(!obstacleBlocksPoint(moatWest, { x: -349, z: 0, feetY: 0.8 }), '西桥桥面必须可通行');
  // 求解器：从桥外引道走上南桥 → 可通行
  const registry = makeRegistry();
  const solver = createFpSolver({ config: CONFIG });
  const startZ = -540;
  const floor = LAYOUT.floorYAt(0, startZ);
  assert(floor !== null, '南桥外引道应有可行走面');
  let position = { x: 0, y: floor + CONFIG.CAMERA.fpEyeHeight, z: startZ };
  const blockedReasons = [];
  for (let i = 0; i < 1400; i += 1) {
    const next = solver.step(position, 0, 1, 0.09, { obstacles: registry.allObstacles() });
    position = { x: next.x, y: next.y, z: next.z };
    if (next.blocked.length > 0) blockedReasons.push(...next.blocked);
  }
  assert(position.z > -458, `应能沿南桥走到城门（实际停在 z=${position.z.toFixed(2)}）`);
  runner.info(`南桥通行：从 z=${startZ} 走到 z=${position.z.toFixed(2)}（越过护城河 -472～-506 与城门 -454）；阻挡记录 ${blockedReasons.length} 次`);
});

/* ========================================================================== */
runner.section('3. zoneLayout 补切片：waterBodies / scenicObjects');
/* ========================================================================== */

await runner.test('每区都拿到 waterBodies / scenicObjects 切片（与 layout 逐条一致）', () => {
  const expectedWater = { B: 0, C: 0, D: 1, E: 1, F: 6 }; // F: 4 段护城河 + 2 个水池
  const expectedScenic = { B: 2, C: 0, D: 0, E: 0, F: 3 }; // B: 钟/鼓；F: 两处假山 + 影壁
  for (const zoneId of ['B', 'C', 'D', 'E', 'F']) {
    const zoneLayout = slice.zoneLayoutFor(zoneId);
    assertEqual(zoneLayout.waterBodies.length, expectedWater[zoneId], `${zoneId} 水体数量`);
    assertEqual(zoneLayout.scenicObjects.length, expectedScenic[zoneId], `${zoneId} 点景数量`);
    const ids = zoneLayout.waterBodies.map((w) => w.id);
    assertEqual(ids.length, new Set(ids).size, `${zoneId} 水体 id 不应重复`);
    for (const w of zoneLayout.waterBodies) assertEqual(w.owner, zoneId, `${w.id} 的 owner 应为 ${zoneId}`);
    for (const s of zoneLayout.scenicObjects) assertEqual(s.owner, zoneId, `${s.id} 的 owner 应为 ${zoneId}`);
    // 与切片外的独立查询一致
    assertEqual(zoneLayout.waterBodies.length, waterBodiesForZone(zoneId).length);
    assertEqual(zoneLayout.scenicObjects.length, scenicObjectsForZone(zoneId).length);
  }
  runner.info(`水体切片：${slice.zoneLayoutFor('F').waterBodies.map((w) => w.id).join('/')}；点景切片：F ${slice.zoneLayoutFor('F').scenicObjects.map((s) => s.id).join('/')} / B ${slice.zoneLayoutFor('B').scenicObjects.map((s) => s.id).join('/')}`);
});

await runner.test('区域不必从障碍盒反推水池：E/D 的水体可直接从切片取到包围盒与水面标高', () => {
  for (const [zoneId, waterId] of [['E', 'WB-E-pond'], ['D', 'WB-D-pond']]) {
    const zoneLayout = slice.zoneLayoutFor(zoneId);
    const water = zoneLayout.waterBodies.find((w) => w.id === waterId);
    assert(water, `${zoneId} 切片应含 ${waterId}`);
    assert(Number.isFinite(water.y) && Number.isFinite(water.depth), `${waterId} 应带水面标高与深度`);
    assert(water.bounds && water.bounds.maxX > water.bounds.minX, `${waterId} 应带包围盒`);
    // 该水体在 registry 基线图层里也有对应阻挡盒（区域无需自补）
    assert(baselineById.get(`OB-${waterId}`), `基线图层应含 OB-${waterId}`);
  }
});

await runner.test('bumped 的 zoneLayout 契约字段仍完整（obstaclesNormalized 归一版可用）', () => {
  const zoneLayout = slice.zoneLayoutFor('E');
  assert(Array.isArray(zoneLayout.obstaclesNormalized) && zoneLayout.obstaclesNormalized.length === zoneLayout.obstacles.length);
  for (const o of zoneLayout.obstaclesNormalized) {
    assert(o.y0Source === 'layout' || o.y0Source === 'floorYAt', `${o.id} 应标注 y0 来源`);
    const floor = footprintFloor(o.bounds, { helpers: LAYOUT });
    if (floor !== null && o.sourceType !== 'water') assert(o.y0 <= floor + 1e-6, `${o.id} 归一后 y0 不得高于地坪`);
  }
});

/* ========================================================================== */
runner.section('4. 与区域兜底兼容：去重策略 + 碰撞盒总数前后对比');
/* ========================================================================== */

await runner.test('B/C/E/D 的历史补丁（y0 下钳副本 / 水体拦阻盒）全部去重，总数不变', () => {
  const registry = makeRegistry();
  const before = registry.stats();
  // ① E 式：layout 回显 + y0 下钳 + OB-E-pond-guard
  const eGround = LAYOUT.ZONES.find((z) => z.id === 'E').groundY;
  const eEcho = LAYOUT.OBSTACLES.filter((o) => o.zone === 'E').map((o) => ({ ...o, y0: Math.min(o.y0, eGround) }));
  const pondE = LAYOUT.OBSTACLES.find((o) => o.id === 'OB-WB-E-pond');
  eEcho.push({
    id: 'OB-E-pond-guard',
    sourceType: 'water',
    zone: 'E',
    bounds: { ...pondE.bounds },
    y0: eGround,
    y1: +(eGround + INTERACTION.player.height + 0.5).toFixed(2),
    blocks: 'all',
    door: null,
  });
  // ② D 式：同类下钳 + 5 段池面守卫（矩形子块）
  const dGround = LAYOUT.ZONES.find((z) => z.id === 'D').groundY;
  const dEcho = LAYOUT.OBSTACLES.filter((o) => o.zone === 'D').map((o) => ({ ...o, y0: Math.min(o.y0, dGround) }));
  const pondD = LAYOUT.OBSTACLES.find((o) => o.id === 'OB-WB-D-pond');
  const midX = (pondD.bounds.minX + pondD.bounds.maxX) / 2;
  const midZ = (pondD.bounds.minZ + pondD.bounds.maxZ) / 2;
  dEcho.push(
    { id: 'OB-D-pond-guard-west', sourceType: 'water', zone: 'D', bounds: { minX: pondD.bounds.minX, maxX: midX, minZ: pondD.bounds.minZ, maxZ: pondD.bounds.maxZ }, y0: dGround, y1: dGround + 2.3, blocks: 'all', door: null },
    { id: 'OB-D-pond-guard-east', sourceType: 'water', zone: 'D', bounds: { minX: midX, maxX: pondD.bounds.maxX, minZ: pondD.bounds.minZ, maxZ: pondD.bounds.maxZ }, y0: dGround, y1: dGround + 2.3, blocks: 'all', door: null },
    { id: 'OB-D-pond-guard-north', sourceType: 'water', zone: 'D', bounds: { minX: pondD.bounds.minX, maxX: pondD.bounds.maxX, minZ: midZ, maxZ: pondD.bounds.maxZ }, y0: dGround, y1: dGround + 2.3, blocks: 'all', door: null },
  );
  const eOutcome = registry.registerColliders('E', { obstacles: eEcho });
  const dOutcome = registry.registerColliders('D', { obstacles: dEcho });
  const after = registry.stats();
  assertEqual(eOutcome.dedupedObstacles, eEcho.length, `E 的 ${eEcho.length} 条历史补丁应全部去重`);
  assertEqual(dOutcome.dedupedObstacles, dEcho.length, `D 的 ${dEcho.length} 条历史补丁应全部去重`);
  assertEqual(after.obstacles, before.obstacles, `去重后障碍总数必须不变（${before.obstacles} → ${after.obstacles}）`);
  assertEqual(after.obstaclesBySource.zones, 0, '不应有任何区域自报障碍进入图层（全部被基线/墙层覆盖）');
  const rules = registry.dedupedObstacleReport().reduce((acc, r) => {
    acc[r.rule] = (acc[r.rule] ?? 0) + 1;
    return acc;
  }, {});
  runner.info(`历史补丁去重：E ${eEcho.length} + D ${dEcho.length} 条；总数 ${before.obstacles} → ${after.obstacles}（不变）｜规则 ${JSON.stringify(rules)}`);
  assertNoProblems(registry.duplicateIds().map((d) => `${d.kind}:${d.id}`), '全局唯一 id');
});

await runner.test('三层（基线 + 墙 + 区域）之间无同几何重复盒；跨区登记他区基线 id 必须抛错', () => {
  const registry = makeRegistry();
  registry.registerColliders('GREYBOX', { obstacles: LAYOUT.OBSTACLES.map((o) => ({ ...o })) });
  const all = registry.allObstacles();
  const key = (o) => [o.bounds.minX, o.bounds.maxX, o.bounds.minZ, o.bounds.maxZ].map((v) => Math.round(v * 100) / 100).join(',');
  const seen = new Map();
  const dupes = [];
  for (const o of all) {
    const k = key(o);
    if (seen.has(k)) dupes.push(`${seen.get(k)} ↔ ${o.id}`);
    else seen.set(k, o.id);
  }
  assertEqual(dupes.length, 0, `三层之间不得有同几何重复：${dupes.slice(0, 3).join('；')}`);
  // 跨区登记：C 区登记 B 区的基线障碍 id → 冲突（抛错，不静默去重）
  let threw = false;
  try {
    registry.registerColliders('C', { obstacles: [{ ...LAYOUT.OBSTACLES.find((o) => o.zone === 'B' && o.sourceType === 'building') }] });
  } catch (error) {
    threw = true;
    assert(/跨区重复登记/.test(error.message), `错误信息应说明跨区冲突：${error.message}`);
  }
  assert(threw, '真实区域登记别的区域的基线障碍 id 必须抛错');
});

await runner.test('真实装配（灰盒 + B/C/E/F）后：总数与去重报告可量化，且无冲突', async () => {
  const registry = makeRegistry();
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  const greyboxModule = await loadModule('src/zones/_greybox.js');
  const events = makeSilentEvents();
  const shared = { materials: {}, geometries: {}, textures: {}, disposeRegistry: [], water: [], greyboxSkipZones: [] };
  const kit = greyboxModule.createFallbackKit(THREE, CONFIG);
  const greyCtx = await makeTestCtx({ zoneId: 'GREYBOX', scope: 'city', kit, shared, events, registry });
  const greyResult = await greyboxModule.createZone(greyCtx);
  registry.registerZone('GREYBOX', greyResult, { replace: true });
  const afterGreybox = registry.stats();
  assertEqual(afterGreybox.obstacles, baseline.list.length + registry.wallColliders().length, '灰盒后应 = 基线 + 墙层（灰盒的 81 条回显被去重）');
  let loaded = 0;
  for (const zoneId of REAL_ZONE_IDS) {
    const path = zoneModulePath(zoneId);
    if (!existsSync(join(ROOT, path))) {
      runner.skip(`区域 ${zoneId} 装配对账`, `${path} 未交付`);
      continue;
    }
    const mod = await loadModule(path);
    const ctx = await makeTestCtx({ zoneId, kit, shared, events, registry, greyboxSkipZones: ['GREYBOX'] });
    const result = await mod.createZone(ctx);
    assertNoProblems(validateZoneResult(zoneId, result, { THREE, scope: 'zone' }).problems, `${zoneId} 契约`);
    registry.registerZone(zoneId, result, { replace: true });
    loaded += 1;
  }
  const stats = registry.stats();
  assertNoProblems(registry.duplicateIds().map((d) => `${d.kind}:${d.id}`), '装配后全局唯一 id');
  assert(stats.obstaclesBySource.layoutBaseline === baseline.list.length, '基线图层应始终完整');
  const zoneExtras = registry
    .allObstacles()
    .filter((o) => o.registrySource === 'zone')
    .map((o) => `${o.zone}:${o.id}`);
  runner.info(
    `真实装配：加载区域 ${loaded} 个｜障碍 ${stats.obstacles} = 基线 ${stats.obstaclesBySource.layoutBaseline} + 墙 ${stats.obstaclesBySource.coreWalls} + 区域 ${stats.obstaclesBySource.zones}｜累计去重 ${stats.obstaclesBySource.deduped}` +
      (zoneExtras.length > 0 ? `｜区域净新增 ${zoneExtras.length} 条：${zoneExtras.join(', ')}` : ''),
  );
});

/* ========================================================================== */
runner.section('5. layout.OBSTACLES 81 条基线做成一等内建图层（任何装配顺序都在册）');
/* ========================================================================== */

await runner.test('全新 registry（未装配任何区域）：81 条基线全部在册，逐条 id/几何对账', () => {
  const registry = makeRegistry();
  const stats = registry.stats();
  assertEqual(stats.obstaclesBySource.layoutBaseline, LAYOUT.OBSTACLES.length, '基线图层应含全部 81 条');
  const ids = new Set(registry.allObstacles().map((o) => o.id));
  const missing = LAYOUT.OBSTACLES.filter((o) => !ids.has(o.id)).map((o) => o.id);
  assertEqual(missing.length, 0, `基线不得缺失：${missing.join(', ')}`);
  assertEqual(stats.obstacles, LAYOUT.OBSTACLES.length + registry.wallColliders().length, '总数 = 81 基线 + 83 墙盒');
  runner.info(`全新 registry：障碍 ${stats.obstacles}（基线 ${stats.obstaclesBySource.layoutBaseline} + 墙 ${stats.obstaclesBySource.coreWalls}）；缺失 0`);
});

await runner.test('非水体基线：包围盒与 layout 一致；水体基线：同 id 的"可拦人"派生版（记录原始值）', () => {
  let checked = 0;
  for (const source of LAYOUT.OBSTACLES) {
    const entry = baselineById.get(source.id);
    assert(entry, `${source.id} 应在基线图层`);
    if (source.sourceType === 'water') {
      assert(entry.y1 > source.y1 + 0.3, `${source.id} 派生版顶面应显著高于原始水体盒（可拦人）`);
      assertEqual(entry.bounds.minX, source.bounds.minX, `${source.id} 包围盒应保持（水面范围不变）`);
      assertEqual(entry.bounds.maxZ, source.bounds.maxZ, `${source.id} 包围盒应保持`);
      assert(entry.legacy && entry.legacy.y1 === source.y1, `${source.id} 应记录原始 y1 便于审计`);
      continue;
    }
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) assertClose(entry.bounds[key], source.bounds[key], 1e-9, `${source.id}.${key} 不应改变`);
    assertEqual(entry.blocks, source.blocks, `${source.id} blocks 语义应保持`);
    checked += 1;
  }
  assert(checked >= 70, `应核对 ≥70 条非水体基线（实际 ${checked}）`);
});

await runner.test('装配顺序无关：先灰盒后区域 / 先区域后灰盒，both 都含全部基线且总数一致', async () => {
  const greyboxModule = await loadModule('src/zones/_greybox.js');
  const kit = greyboxModule.createFallbackKit(THREE, CONFIG);
  const buildGreybox = async (registry, events, shared) => {
    const ctx = await makeTestCtx({ zoneId: 'GREYBOX', scope: 'city', kit, shared, events, registry });
    return greyboxModule.createZone(ctx);
  };
  const buildZone = async (registry, events, shared, zoneId) => {
    const mod = await loadModule(zoneModulePath(zoneId));
    const ctx = await makeTestCtx({ zoneId, kit, shared, events, registry });
    return mod.createZone(ctx);
  };

  // 顺序 A：灰盒 → 区域
  const regA = makeRegistry();
  const evA = makeSilentEvents();
  const shA = { materials: {}, geometries: {}, textures: {}, disposeRegistry: [], water: [], greyboxSkipZones: [] };
  regA.registerZone('GREYBOX', await buildGreybox(regA, evA, shA), { replace: true });
  regA.registerZone('B', await buildZone(regA, evA, shA, 'B'), { replace: true });
  const statsA = regA.stats();

  // 顺序 B：先把 B 区的**障碍**登记进来（模拟"区域在基线图层之前就登记碰撞"），再装配灰盒与区域
  const regB = makeRegistry();
  const evB = makeSilentEvents();
  const shB = { materials: {}, geometries: {}, textures: {}, disposeRegistry: [], water: [], greyboxSkipZones: [] };
  const bResultB = await buildZone(regB, evB, shB, 'B');
  regB.registerColliders('B', { obstacles: bResultB.colliders?.obstacles ?? [], wallColliders: bResultB.colliders?.wallColliders ?? [] });
  const statsBeforeGreybox = regB.stats();
  assertEqual(statsBeforeGreybox.obstaclesBySource.layoutBaseline, LAYOUT.OBSTACLES.length, '区域先登记障碍时，基线图层也必须已经在册');
  regB.registerZone('GREYBOX', await buildGreybox(regB, evB, shB), { replace: true });
  regB.registerZone('B', bResultB, { replace: true });
  const statsB = regB.stats();

  const registryRegister = (registry, result, zoneId) => registry.registerZone(zoneId, result, { replace: true });
  for (const [label, stats, registry] of [['灰盒→区域', statsA, regA], ['区域→灰盒', statsB, regB]]) {
    assertEqual(stats.obstaclesBySource.layoutBaseline, LAYOUT.OBSTACLES.length, `${label}：基线必须完整`);
    const ids = new Set(registry.allObstacles().map((o) => o.id));
    for (const o of LAYOUT.OBSTACLES) assert(ids.has(o.id), `${label}：缺少基线 ${o.id}`);
  }
  assertEqual(statsB.obstacles, statsBeforeGreybox.obstacles, `区域先登记时障碍总数不应随后改变（${statsBeforeGreybox.obstacles} → ${statsB.obstacles}）`);
  assertEqual(statsA.obstacles, statsB.obstacles, `两种装配顺序的障碍总数应一致（${statsA.obstacles} vs ${statsB.obstacles}）`);
  runner.info(`装配顺序无关：A(灰盒→B)=${statsA.obstacles} / B(B 障碍先登记→灰盒→B)=${statsB.obstacles}；基线均为 ${statsA.obstaclesBySource.layoutBaseline} 条`);
});

/* ========================================================================== */
runner.section('6. door.axis 语义统一：面法线轴 + 沿 x 宫墙不得整条当门洞');
/* ========================================================================== */

await runner.test('归一：4 条宫墙 door.axis 由"墙走向轴"翻正为面法线轴，其余 18 条建筑门洞保持不变', () => {
  const flipped = [];
  for (const source of LAYOUT.OBSTACLES) {
    if (!source.door) continue;
    const entry = baselineById.get(source.id);
    assert(entry.door, `${source.id} 应保留 door`);
    assert(entry.door.axis !== entry.door.lateralAxis, `${source.id} 归一后 axis 必须是面法线轴（≠ 横向轴）`);
    if (entry.door.axisFlipped) flipped.push(source.id);
    if (source.sourceType === 'building') {
      assertEqual(entry.door.axis, source.door.axis, `${source.id} 建筑门洞轴不应被改动`);
    }
  }
  const wallFlipped = LAYOUT.OBSTACLES.filter((o) => o.sourceType === 'wall').map((o) => o.id);
  assertEqual(flipped.sort().join(','), wallFlipped.sort().join(','), `应恰为 4 条宫墙条目被翻正：${flipped.join(', ')}`);
  runner.info(`door 归一：翻正 ${flipped.length} 条（${flipped.join(', ')}）；其余建筑门洞保持原轴`);
});

await runner.test('反例：按旧约定（axis=墙走向）解释时整条 608m 宫墙都是门洞；归一后仅 26m 城门可通', () => {
  const source = LAYOUT.OBSTACLES.find((o) => o.id === 'OB-WALL-CITY-south');
  const entry = baselineById.get('OB-WALL-CITY-south');
  const b = entry.bounds;
  const probe = { x: 200, z: -454, feetY: 0.4 };

  // 旧约定：把记录值直接当"面法线轴"（layout 的 axis='x'）→ |z - center.z| ≤ width/2 ⇒ 整条墙侧向带都成为通道
  const legacyBox = { ...source, blocks: 'exceptDoor', door: { axis: 'x', center: { x: 0, z: -454 }, width: 26, height: 12 } };
  const legacyAllows = legacyInsideDoorChannel(legacyBox.door, legacyBox.bounds, probe.x, probe.z);
  assertEqual(legacyAllows, true, '旧约定下 x=200 也会被判成"门洞通道内"（这就是隐患）');
  assertEqual(legacySolverBlocks(legacyBox, probe.x, probe.z, probe.feetY), false, '旧约定 + 求解器 → 墙芯不被阻挡（仅靠墙带无可行走面兜住）');

  // 归一后：只有 |x| ≤ 13 − 半径 的城门通道可通，墙芯必须阻挡
  assertEqual(insideObstacleDoor(entry.door, b, 0, -454), true, '城门中心应在通道内');
  assertEqual(insideObstacleDoor(entry.door, b, 200, -454), false, '远离城门（x=200）不得在通道内');
  assert(obstacleBlocksPoint(entry, probe), '归一后墙芯必须阻挡');
  assert(!obstacleBlocksPoint(entry, { x: 0, z: -454, feetY: 0.4 }), '城门门洞必须可通');
  runner.info(`南段宫墙：旧约定 x=200 可穿（隐患）→ 归一后阻挡；城门净宽 26m 仍可通（|x| ≤ ${(26 / 2 - INTERACTION.player.radius).toFixed(2)}m）`);
});

await runner.test('等价性证明：t23 派生墙盒与 4 条基线宫墙条目覆盖同一实体、门洞净空一致', () => {
  const registry = makeRegistry();
  const wallBoxes = registry.wallColliders();
  for (const id of ['WALL-CITY-south', 'WALL-CITY-north', 'WALL-CITY-west', 'WALL-CITY-east']) {
    const wall = LAYOUT.WALLS.find((w) => w.id === id);
    const entry = baselineById.get(`OB-${id}`);
    const spans = wallBoxes.filter((box) => (box.wallIds ?? []).includes(id));
    assert(spans.length >= 2, `${id} 派生盒应有 ≥2 段`);
    const horizontal = wall.axis === 'x';
    const gate = wall.openings[0];
    // ① 覆盖：派生实心段的总长度 = 墙长 − 门洞宽（±0.2m）
    const totalSpan = spans.reduce((sum, box) => sum + (horizontal ? box.bounds.maxX - box.bounds.minX : box.bounds.maxZ - box.bounds.minZ), 0);
    const wallLength = horizontal ? Math.abs(wall.to.x - wall.from.x) : Math.abs(wall.to.z - wall.from.z);
    assertClose(totalSpan, wallLength - gate.width, 0.2, `${id} 实心段长度应 = 墙长 − 门洞宽`);
    // ② 门洞净空一致：派生段不覆盖 x∈(−13,13)
    for (const box of spans) {
      const [lo, hi] = horizontal ? [box.bounds.minX, box.bounds.maxX] : [box.bounds.minZ, box.bounds.maxZ];
      assert(hi <= gate.at - gate.width / 2 + 0.05 || lo >= gate.at + gate.width / 2 - 0.05, `${id} 派生段不得侵占 26m 城门`);
    }
    // ③ 基线条目几何包住派生段（同一实体），且门洞净宽与 openings 一致
    assertClose(entry.door.width, gate.width, 1e-6, `${id} 基线门洞净宽应 = layout openings 的 ${gate.width}m`);
    assert(entry.door.lateralAxis === (horizontal ? 'x' : 'z'), `${id} 通道横向轴应为 ${horizontal ? 'x' : 'z'}`);
    const baselineCoversSpans = spans.every((box) =>
      box.bounds.minX >= entry.bounds.minX - 0.01 && box.bounds.maxX <= entry.bounds.maxX + 0.01 && box.bounds.minZ >= entry.bounds.minZ - 0.01 && box.bounds.maxZ <= entry.bounds.maxZ + 0.01,
    );
    assert(baselineCoversSpans, `${id} 基线盒子应完全覆盖派生实心段（替代表达的是同一道墙）`);
    // ④ 两者对"阻挡/可通"的结论逐点一致（墙芯、门洞中线、两侧端点）
    const probes = horizontal
      ? [{ x: 200, z: wall.from.z, feetY: 0.4 }, { x: 0, z: wall.from.z, feetY: 0.4 }, { x: -300, z: wall.from.z, feetY: 0.4 }]
      : [{ x: wall.from.x, z: 200, feetY: 0.4 }, { x: wall.from.x, z: 0, feetY: 0.4 }, { x: wall.from.x, z: -300, feetY: 0.4 }];
    for (const p of probes) {
      const byBaseline = obstacleBlocksPoint(entry, p);
      const bySpans = spans.some((box) => obstacleBlocksPoint(box, p));
      assertEqual(bySpans, byBaseline, `${id} 在 (${p.x},${p.z}) 处"基线 vs 派生段"结论应一致`);
    }
  }
  runner.info('4 段宫墙：派生实心段与基线条目覆盖同一实体、26m 门洞净空一致、探针结论逐点一致（有意替代关系成立）');
});

await runner.test('consumers 无需自行 union：allObstacles() 已含基线，且与 layout ∪ registry 的旧写法结果一致', () => {
  const registry = makeRegistry();
  registry.registerZone('GREYBOX', { buildings: [], connectors: [], colliders: { obstacles: LAYOUT.OBSTACLES.map((o) => ({ ...o })) }, viewpoints: [], lightAnchors: [] }, { replace: true });
  const mine = registry.allObstacles().map((o) => o.id).sort();
  // G 侧旧写法：layout ∪ registry（按 id 去重）
  const legacyMerge = new Map();
  for (const o of LAYOUT.OBSTACLES) legacyMerge.set(o.id, o);
  for (const o of registry.allObstacles()) legacyMerge.set(o.id, o);
  const legacyIds = [...legacyMerge.keys()].sort();
  assertEqual(mine.join(','), legacyIds.join(','), '内建基线与"layout ∪ registry"应得到同一份 id 集合');
  runner.info(`allObstacles() = ${mine.length} 条，与 layout ∪ registry 的 ${legacyIds.length} 条逐 id 一致（消费方无需再 union）`);
});

/* ========================================================================== */

process.exit(runner.summary());
