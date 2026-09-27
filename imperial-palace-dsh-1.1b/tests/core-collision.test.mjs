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
const { createFpSolver, createCameraRig, interiorBoundsFor } = await loadModule('src/core/camera.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createStateStore, createStateController } = await loadModule('src/core/state.js');
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
  // t76：条数不再硬编码 40 —— t75 之后多数建筑足迹地坪抬高（台基/内景面成为可行走面），
  // "记录值 > 足迹地坪"的条数由 40+ 降到 15；语义未变，故改为与**派生计数**逐值相等（不放宽）：
  //   被下钳 ⇔ y0Recorded > footprintFloor
  let expectedClamped = 0;
  let expectedKept = 0;
  for (const entry of baseline.list) {
    if (entry.sourceType === 'water') continue;
    const floor = footprintFloor(entry.bounds, { helpers: LAYOUT });
    if (floor === null) continue;
    if (entry.y0Recorded > floor + 1e-6) expectedClamped += 1;
    else expectedKept += 1;
  }
  assertEqual(
    stats.y0Clamped,
    expectedClamped,
    `被下钳条数应恰等于“记录值 > 足迹地坪”的条数（实际 ${stats.y0Clamped} vs 派生 ${expectedClamped}；t75 后地坪抬高是数量下降的唯一原因）`,
  );
  assert(stats.y0Clamped >= 1, `至少应有 1 条被下钳（否则下钳逻辑失效；实际 ${stats.y0Clamped}）`);
  assertEqual(
    stats.y0Clamped + expectedKept,
    baseline.list.filter((o) => o.sourceType !== 'water').length,
    '下钳 + 保持原值 应等于非水体障碍总数（不漏计）',
  );
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
  // t76：不再硬编码“≥2 例”。原意 = “原始盒（y0=台基顶）会在 gap > 玩家高时放行，下钳后才阻挡”，
  // 故改为**等价性**断言（严格更强）+ 合成对照（保证这条对照永远有样本，不随数据波动）：
  const rawReleased = rows.filter((r) => !r.rawBlocked);
  const gapExceeds = rows.filter((r) => r.gap > INTERACTION.player.height);
  assertEqual(
    rawReleased.length,
    gapExceeds.length,
    `“原始盒放行”必须恰为 gap > 玩家高 的用例（实际 ${rawReleased.length} vs ${gapExceeds.length}；放行例：${rawReleased.map((r) => r.id).join(',') || '无'}）`,
  );
  assert(
    rows.every((r) => r.rawBlocked === (r.gap <= INTERACTION.player.height)),
    '逐区：原始盒判定必须与 gap vs 玩家高 一致（无例外）',
  );
  assert(rawReleased.length >= 1, `至少应有 1 例可判定的“原始盒放行”（实际 ${rawReleased.length}）`);
  // 合成对照：原始盒放行 / 下钳后阻挡 —— 与布局数据无关，永久守住“从下方穿入”防护
  const synth = {
    id: 'SYNTH-raw-release',
    sourceType: 'building',
    zone: 'B',
    bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
    y0: 12,
    y1: 20,
    blocks: 'all',
    y0Recorded: 12,
    door: null,
  };
  const synthRaw = obstacleBlocksPoint({ ...synth, y0: synth.y0Recorded }, { x: 0, z: 0, feetY: 0 });
  const synthClamped = obstacleBlocksPoint({ ...synth, y0: Math.min(synth.y0Recorded, 0) }, { x: 0, z: 0, feetY: 0 });
  assert(!synthRaw, '合成对照：原始盒（y0=12m）在地坪 0m 处应放行（这就是缺陷形态）');
  assert(synthClamped, '合成对照：下钳到足迹地坪（y0=0m）后必须阻挡（防护有效）');
});

await runner.test('t86：门洞墙面侧翼实心处**必须被阻挡**（t76 的 DEFECT-T76-01 已修，skip 升级为真实断言）', () => {
  const registry = makeRegistry();
  const obstacles = registry.allObstacles();
  const solver = createFpSolver({ config: CONFIG });
  const cases = ['OB-D-court1-hall', 'OB-E-court1-hall', 'OB-F-garden-hall-north'];
  const rows = [];
  for (const id of cases) {
    const entry = baselineById.get(id);
    const b = entry.bounds;
    const door = entry.door;
    const axis = door?.axis === 'x' ? 'x' : 'z';
    const perpSpan = axis === 'z' ? b.maxX - b.minX : b.maxZ - b.minZ;
    const off = Math.max(door ? door.width / 2 + INTERACTION.player.radius + 1 : 0, perpSpan / 2 - INTERACTION.player.radius - 1.5);
    const start = axis === 'z' ? { x: (b.minX + b.maxX) / 2 + off, z: b.maxZ + 6 } : { x: b.maxX + 6, z: (b.minZ + b.maxZ) / 2 + off };
    const dir = axis === 'z' ? [0, -1] : [-1, 0];
    const edge = axis === 'z' ? b.maxZ : b.maxX;
    const distance = (axis === 'z' ? b.maxZ - b.minZ : b.maxX - b.minX) + 12;
    const floor = LAYOUT.floorYAt(start.x, start.z);
    assert(floor !== null, `${id} 起点应有可行走面`);
    const r = solver.step({ x: start.x, y: floor + CONFIG.CAMERA.fpEyeHeight, z: start.z }, dir[0], dir[1], distance, { obstacles });
    const stoppedShortOfWall = axis === 'z' ? r.z >= edge - INTERACTION.player.radius - 0.2 : r.x >= edge - INTERACTION.player.radius - 0.2;
    assert(stoppedShortOfWall, `${id} 侧翼实心处必须停在墙面之外（axis=${axis}，停在 ${axis === 'z' ? r.z.toFixed(2) : r.x.toFixed(2)}，墙面 ${edge}）`);
    assert(r.blocked.length > 0, `${id} 侧翼实心处被挡时必须给出原因（实际 blocked=${JSON.stringify(r.blocked)}）`);
    assert(r.blocked.some((x) => String(x).includes(id.replace(/^OB-/, ''))), `${id} 阻挡原因应点名该建筑（实际 ${JSON.stringify(r.blocked)}）`);
    rows.push(`${id}: 停在 ${axis === 'z' ? r.z.toFixed(2) : r.x.toFixed(2)}（距墙 ${Math.abs((axis === 'z' ? edge - r.z : edge - r.x)).toFixed(2)}m）blocked=${JSON.stringify(r.blocked)}`);
  }
  runner.info(`侧翼实心 3/3 被挡：${rows.join(' | ')}`);
});

await runner.test('t65：43 栋逐栋 —— 从登记入口可**真实走入**自己的内景（图搜索 + 真实碰撞数据），2 栋 layout 冲突如实登记', async () => {
  const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
  const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
  const solver = createWalkSolver({ config: CONFIG, layout: LAYOUT });
  const graph = createWalkGraph(solver, { cellSize: 2 });
  const interiors = LAYOUT.WALKABLE.filter((w) => w.kind === 'interior');
  assertEqual(interiors.length, 43, `可进入内景应为 43 栋（实际 ${interiors.length}）`);
  // 已知 layout 冲突（回执 §2.4）：这两栋的东向门洞外侧紧贴主殿台基第二层（门外地面 3.0 vs 门洞 1.5，
  // 落差 1.5m > 台阶阈值 0.5m）⇒ 数据侧走不进门。**不得静默跳过**：下面显式断言它们确实走不进且原因是台阶。
  // t142：B-side-west-main 已可真实走入内景（t65 报「在例外表内却已可达」）⇒ 收窄例外表（加强，非放宽）
  // t142：B-side-east-main 也已可真实走入内景 ⇒ 例外表再收窄（加强，非放宽）
  const KNOWN_BLOCKED = new Set([]);
  const allBoxes = interiors.map((w) => ({ id: w.id, ...w.bounds }));
  const walkIn = [];
  const blocked = [];
  for (const surface of interiors) {
    const record = slice.interiorRecordForSurfaceId(surface.id);
    assert(record?.slotId, `${surface.id} 应能解析出建筑 slotId`);
    const slot = LAYOUT.SLOT_BY_ID[record.slotId];
    const cx = (surface.bounds.minX + surface.bounds.maxX) / 2;
    const cz = (surface.bounds.minZ + surface.bounds.maxZ) / 2;
    // ① 室内中心可站立，且支撑高度 = 该内景注册地坪（真实碰撞数据）
    assert(solver.probe(cx, cz).ok, `${record.slotId} 室内中心必须可站立`);
    // 支撑高度：多数等于该内景注册地坪；配殿与主殿台基/月台在 xz 重叠时取**最高面**（t74 语义）⇒ 只会更高
    const supportY = solver.groundAt(cx, cz);
    assert(supportY >= surface.y - 0.05, `${record.slotId} 室内支撑高度不得低于注册地坪（实测 ${supportY} vs ${surface.y}）`);
    assert(supportY <= surface.y + 8, `${record.slotId} 室内支撑高度异常（实测 ${supportY}）`);
    // ② 从登记入口外侧 1.2m 走进室内中心
    const dx = slot.entrance.x - slot.x;
    const dz = slot.entrance.z - slot.z;
    const len = Math.hypot(dx, dz) || 1;
    const outside = { x: slot.entrance.x + (dx / len) * 1.2, z: slot.entrance.z + (dz / len) * 1.2 };
    const p = graph.path(outside, { x: cx, z: cz });
    const end = p.ok ? p.path[p.path.length - 1] : null;
    const goalIn = end ? end.x >= surface.bounds.minX - 1.2 && end.x <= surface.bounds.maxX + 1.2 && end.z >= surface.bounds.minZ - 1.2 && end.z <= surface.bounds.maxZ + 1.2 : false;
    if (KNOWN_BLOCKED.has(record.slotId)) {
      assert(!(p.ok && goalIn), `${record.slotId} 在已知例外表内，却已可走入门内（请更新例外表）`);
      const step = solver.groundAt(outside.x, outside.z) - surface.y;
      assert(step > CONFIG.INTERACTION.step.maxStepHeight, `${record.slotId} 走不进的原因应是台基落差（实测 ${step.toFixed(2)}m ≤ 阈值）`);
      blocked.push({ id: record.slotId, step: +step.toFixed(2) });
      continue;
    }
    assert(p.ok && goalIn, `${record.slotId} 应能从登记入口真实走入自己的内景（reason=${p.reason ?? 'goalSnapOutside'}）`);
    // ③ 入径不得串到**别的**内景盒内（一区多内景最容易出错的点）
    for (const q of p.path) {
      for (const box of allBoxes) {
        if (box.id === surface.id) continue;
        const insideOther = q.x > box.minX && q.x < box.maxX && q.z > box.minZ && q.z < box.maxZ;
        assert(!insideOther, `${record.slotId} 的入径经过另一个内景 ${box.id}（一区多内景串栋）`);
      }
    }
    walkIn.push(record.slotId);
  }
  // t142：期望值由例外表推导（例外为空 ⇒ 43/43），不再硬编码，避免"例外已失效但期望仍写 41"的陈旧形态
  const EXPECTED_WALKIN = 43 - KNOWN_BLOCKED.size;
  assertEqual(walkIn.length, EXPECTED_WALKIN, `可从入口真实走入的内景应为 ${EXPECTED_WALKIN} 栋（43 减去 ${KNOWN_BLOCKED.size} 条例外；实际 ${walkIn.length}）`);
  assertEqual(blocked.length, KNOWN_BLOCKED.size, '已知冲突栋数应与登记一致');
  runner.info(`真实走入内景 ${walkIn.length}/43（例外 ${blocked.map((b) => `${b.id} 阶差 ${b.step}m`).join(' / ')}：layout 台基贴门洞，见回执 §2.4）`);
});

await runner.test('t65：43 栋逐栋 —— 室内四向真实走查（0.25m 小步）不穿墙、不掉出', () => {
  const solver = createFpSolver({ config: CONFIG });
  /**
   * 点是否位于该建筑**门洞净空带**内（门宽 + 玩家半径余量，沿门轴外延 6m 覆盖门洞出口段）。
   * 用于"越出室内盒的采样点必须是从门洞出去的"——即排除穿墙。
   */
  const inDoorway = (door, bounds, x, z) => {
    if (!door) return false;
    const halfWidth = door.width / 2 + 0.35 + 0.5;
    if (door.axis === 'z') return Math.abs(x - door.center.x) <= halfWidth && z >= bounds.minZ - 6 && z <= bounds.maxZ + 6;
    return Math.abs(z - door.center.z) <= halfWidth && x >= bounds.minX - 6 && x <= bounds.maxX + 6;
  };
  const EYE = CONFIG.CAMERA.fpEyeHeight;
  const interiors = LAYOUT.WALKABLE.filter((w) => w.kind === 'interior');
  const failures = [];
  let totalSteps = 0;
  for (const surface of interiors) {
    const record = slice.interiorRecordForSurfaceId(surface.id);
    const cx = (surface.bounds.minX + surface.bounds.maxX) / 2;
    const cz = (surface.bounds.minZ + surface.bounds.maxZ) / 2;
    const spanX = (surface.bounds.maxX - surface.bounds.minX) / 2 + 4;
    const spanZ = (surface.bounds.maxZ - surface.bounds.minZ) / 2 + 4;
    for (const [dirX, dirZ, distance] of [[1, 0, spanX], [-1, 0, spanX], [0, 1, spanZ], [0, -1, spanZ]]) {
      let x = cx;
      let z = cz;
      const steps = Math.ceil(distance / 0.25);
      for (let i = 0; i < steps; i += 1) {
        const r = solver.step({ x, y: surface.y + EYE, z }, dirX, dirZ, 0.25, {});
        x = r.x;
        z = r.z;
        totalSteps += 1;
        // 掉出可行走面 / 落到别的层高
        const surfaceY = LAYOUT.floorYAt(x, z);
        // 允许重叠面（配殿与主殿台基重叠时取最高面，t74 语义）；不允许无面或掉层
        if (surfaceY === null || surfaceY < surface.y - 0.6) failures.push(`${record.slotId} 掉出室内面（${dirX},${dirZ} → y=${surfaceY} vs ${surface.y}）`);
      }
      // 越出室内盒的点必须落在门洞净空内，否则 = 穿墙
      const leftBox = x < surface.bounds.minX - 0.8 || x > surface.bounds.maxX + 0.8 || z < surface.bounds.minZ - 0.8 || z > surface.bounds.maxZ + 0.8;
      if (leftBox) {
        const entry = baselineById.get(`OB-${record.slotId}`);
        const inDoor = inDoorway(entry?.door, entry?.bounds ?? {}, x, z);
        if (!inDoor) failures.push(`${record.slotId} 越出室内盒且不在门洞内（${dirX},${dirZ} → ${x.toFixed(2)},${z.toFixed(2)}）`);
      }
    }
  }
  assertEqual(failures.length, 0, `四向走查不得穿墙/掉出（${failures.slice(0, 4).join('；')}）`);
  runner.info(`43 栋 × 4 向 × 0.25m 小步 = ${totalSteps} 步：无穿墙、无掉出（越出室内盒的采样点全部落在门洞净空内）`);
});

await runner.test('t86：全部 43 栋可进入建筑逐栋验证 —— 门洞通道不被墙盒阻挡、侧翼实心必挡', () => {
  const registry = makeRegistry();
  const obstacles = registry.allObstacles();
  const solver = createFpSolver({ config: CONFIG });
  const interiors = LAYOUT.WALKABLE.filter((w) => w.kind === 'interior');
  assertEqual(interiors.length, 43, `可进入内景应为 43 栋（实际 ${interiors.length}）`);
  const failures = [];
  const notPassable = [];
  let checked = 0;
  for (const surface of interiors) {
    // 用显式映射解析 slotId（既有两栋内景的 id 与建筑 id 不同名：WK-C-bed-interior → C-hall-bed-main）
    const slotId = slice.interiorRecordForSurfaceId(surface.id)?.slotId ?? surface.id.replace(/^WK-/, '').replace(/-interior$/, '');
    const entry = baselineById.get(`OB-${slotId}`);
    assert(entry, `${slotId} 应有障碍条目`);
    const door = entry.door;
    assert(door, `${slotId} 为可进入建筑，应有门规格`);
    const b = entry.bounds;
    const axis = door.axis === 'x' ? 'x' : 'z';
    const edge = axis === 'z' ? b.maxZ : b.maxX;
    const perpSpan = axis === 'z' ? b.maxX - b.minX : b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    // ① 门洞通道：中轴线上（体块内 1m 处）谓词层必须放行
    const doorPoint = axis === 'z' ? { x: door.center.x, z: edge - 1 } : { x: edge - 1, z: door.center.z };
    const feetAtDoor = LAYOUT.floorYAt(doorPoint.x, doorPoint.z) ?? entry.y0;
    if (obstacleBlocksPoint(entry, { x: doorPoint.x, z: doorPoint.z, feetY: feetAtDoor })) {
      notPassable.push(`${slotId}(门洞中轴被墙盒挡住 @${doorPoint.x},${doorPoint.z})`);
    }
    // ② 侧翼实心：沿墙面法线轴从外侧走，必须停在墙外且给出原因
    const off = Math.max(door.width / 2 + INTERACTION.player.radius + 1, perpSpan / 2 - INTERACTION.player.radius - 1.5);
    const start = axis === 'z' ? { x: cx + off, z: edge + 6 } : { x: edge + 6, z: cz + off };
    const sign = axis === 'z' ? -1 : -1;
    const floor = LAYOUT.floorYAt(start.x, start.z);
    if (floor === null) {
      // 该栋侧翼起点落在无可行走面处（体型/环境所致）⇒ 退化为**谓词层等价判定**（墙外 0.1m 必挡），
      // 仍逐栋计入检查数（不得因取不到地坪就跳过该栋）
      const outside = axis === 'z' ? { x: start.x, z: edge + 0.1 } : { x: edge + 0.1, z: start.z };
      const probeFloor = entry.y0;
      if (!obstacleBlocksPoint(entry, { x: outside.x, z: outside.z, feetY: probeFloor })) {
        failures.push(`${slotId}(侧翼墙外谓词层未阻挡、且起点无面无法求解)`);
      }
      checked += 1;
      continue;
    }
    const r = solver.step({ x: start.x, y: floor + CONFIG.CAMERA.fpEyeHeight, z: start.z }, axis === 'z' ? 0 : sign, axis === 'z' ? sign : 0, perpSpan + 12, { obstacles });
    const stopped = axis === 'z' ? r.z >= edge - INTERACTION.player.radius - 0.2 : r.x >= edge - INTERACTION.player.radius - 0.2;
    if (!stopped) failures.push(`${slotId}(侧翼穿行到 ${axis === 'z' ? r.z.toFixed(2) : r.x.toFixed(2)}，墙面 ${edge})`);
    if (r.blocked.length === 0) failures.push(`${slotId}(侧翼被挡但无原因)`);
    checked += 1;
  }
  assertEqual(checked, 43, `应逐栋检查 43 栋（实际 ${checked}）`);
  assertEqual(failures.length, 0, `侧翼必须全挡（失败 ${failures.length} 栋）：${failures.slice(0, 6).join('；')}`);
  assertEqual(notPassable.length, 0, `门洞通道必须全通（失败 ${notPassable.length} 栋）：${notPassable.slice(0, 6).join('；')}`);
  runner.info(`43 栋逐栋：侧翼实心 43/43 阻挡（含原因）、门洞通道 43/43 不被墙盒阻挡`);
});

await runner.test('t86：求解器 ≡ 谓词层（等价性）＋ 旧"单跳"实现必隧穿的突变对照', () => {
  const registry = makeRegistry();
  const obstacles = registry.allObstacles();
  const solver = createFpSolver({ config: CONFIG });
  const entry = baselineById.get('OB-D-court1-hall');
  const b = entry.bounds;
  // 代表点：建筑内部若干点 + 四面外墙外的点 + 门洞中轴点
  const points = [
    { x: b.minX + 1, z: (b.minZ + b.maxZ) / 2 },
    { x: (b.minX + b.maxX) / 2, z: b.minZ + 1 },
    { x: b.maxX - 1, z: b.maxZ - 1 },
    { x: b.maxX + 0.1, z: (b.minZ + b.maxZ) / 2 },
    { x: (b.minX + b.maxX) / 2, z: b.minZ - 0.1 },
    { x: entry.door.center.x, z: (b.minZ + b.maxZ) / 2 },
  ];
  let same = 0;
  for (const p of points) {
    const feet = LAYOUT.floorYAt(p.x, p.z) ?? entry.y0;
    const predicate = obstacleBlocksPoint(entry, { x: p.x, z: p.z, feetY: feet });
    // 求解器口径：向该点走 0.01m（子步进后必落在该点邻域，被挡则停 + 记该障碍原因）
    const from = { x: p.x + 0.5, y: feet + CONFIG.CAMERA.fpEyeHeight, z: p.z };
    const r = solver.step(from, -1, 0, 0.5, { obstacles: [entry] });
    const solverBlocked = r.blocked.some((x) => String(x).includes('D-court1-hall'));
    const moved = Math.abs(r.x - from.x) > 0.01;
    // 等价性：谓词说"挡" ⇒ 求解器必须停下并点名该障碍；谓词说"通" ⇒ 求解器必须走完
    if (predicate) {
      assert(solverBlocked && !moved, `求解器应被判词层一致地挡住（点 ${p.x},${p.z}：predicate=true, solverBlocked=${solverBlocked}, moved=${moved}）`);
    } else {
      assert(!solverBlocked && moved, `谓词层放行时求解器不得凭空阻挡（点 ${p.x},${p.z}）`);
    }
    same += 1;
  }
  assertEqual(same, points.length, '应对全部代表点做等价性判定');

  // 突变对照：复刻旧"单跳全量位移"实现 → 对同一侧翼起点必然隧穿（30m）
  const axis = 'x';
  const off = entry.door.width / 2 + INTERACTION.player.radius + 1;
  const start = { x: b.maxX + 6, z: (b.minZ + b.maxZ) / 2 + off };
  const dist = b.maxX - b.minX + 12;
  const floor = LAYOUT.floorYAt(start.x, start.z);
  const legsLegacy = (() => {
    // 旧算法：只测终点
    const nx = start.x - dist;
    const nz = start.z;
    const blocked = obstacleBlocksPoint(entry, { x: nx, z: nz, feetY: floor });
    return { x: nx, blocked };
  })();
  const tunneled = !legsLegacy.blocked; // 终点落在建筑之外 ⇒ 旧实现放行 ⇒ 隧穿
  assert(tunneled, '突变对照：旧"只测终点"实现在该侧翼起点上必然放行（隧穿）');
  const fixed = solver.step({ x: start.x, y: floor + CONFIG.CAMERA.fpEyeHeight, z: start.z }, -1, 0, dist, { obstacles });
  const fixedStopped = fixed.x >= b.maxX - INTERACTION.player.radius - 0.2;
  assert(fixedStopped, `修复后必须停在墙外（实际 x=${fixed.x.toFixed(2)}，墙面 ${b.maxX}）`);
  runner.info(`等价性 ${same}/${points.length} 通过；突变对照：旧实现终点判定=放行（隧穿）vs 修复后停在距墙 ${(b.maxX - fixed.x).toFixed(2)}m 且 blocked=${JSON.stringify(fixed.blocked)}`);
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
runner.section('t65：一区多内景的第一人称进出（真实碰撞数据 + 逐值恢复）');
/* ========================================================================== */

/** 一区多内景场景所需的最小 core：事件 / 状态 / 注册表 / 相机装置。 */
function makeInteriorCore() {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  registry.registerBuildings('GREYBOX', LAYOUT.SLOTS.map((sl) => ({ ...sl })), { replace: true });
  const store = createStateStore({ events });
  const rig = createCameraRig({ config: CONFIG, registry, store, events });
  createStateController({ events, store, camera: rig, config: CONFIG });
  store.subscribe((payload) => rig.onStateChange(payload));
  const { EVENTS: EV } = CONFIG_EVENTS;
  const settle = (seconds = CONFIG.CAMERA.transitionSeconds + 0.05) => {
    const step = 1 / 60;
    for (let t = 0; t < seconds; t += step) rig.update(step, t, store.state);
  };
  const requestInterior = (viewpointId) => {
    events.request(EV.viewMode, { mode: 'interior', source: 'test', viewpointId });
    settle();
  };
  return { events, registry, store, rig, settle, requestInterior };
}
const CONFIG_EVENTS = { EVENTS: { viewMode: 'view:request-mode' } };

await runner.test('同一 zone 两个内景：FP 从各自门洞进出，位置落在**自己**的室内盒内（不串到另一栋）', () => {
  const { rig, settle, requestInterior } = makeInteriorCore();
  const hall = interiorBoundsFor({ viewpointId: 'VP-B-interior' });          // 金銮殿（zone B）
  const mid = interiorBoundsFor({ viewpointId: 'VP-B-hall-mid-interior' });  // B-hall-mid（**同区**）
  assert(hall && mid && hall.id !== mid.id, '同区应有两个不同内景（本用例前提）');

  for (const [name, box] of [['金銮殿', hall], ['B-hall-mid', mid]]) {
    requestInterior(box.viewpointId);
    const before = rig.describe();
    assertEqual(before.mode, 'interior', `${name}：应进入 interior`);
    assertEqual(before.interiorViewpointId, box.viewpointId, `${name}：应使用显式指定的内景机位`);
    assert(
      before.position.x >= box.minX && before.position.x <= box.maxX && before.position.z >= box.minZ && before.position.z <= box.maxZ,
      `${name}：室内机位应在**自己**的盒内（pos=${before.position.x.toFixed(2)},${before.position.z.toFixed(2)} box=${box.id}）`,
    );
    // 进入 FP：把玩家强制放在**该内景自己的**室内中心（等价"从门洞走进去后的站位"）
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const entered = rig.enterFp({ source: 'test', position: { x: cx, z: cz } });
    assert(entered && entered.position, `${name}：应能进入第一人称`);
    const fp = rig.describe();
    assertEqual(fp.fpActive, true, `${name}：fpActive 应为真`);
    assertClose(fp.position.x, cx, 1e-6, `${name}：FP 应站在该内景室内中心（x）`);
    assertClose(fp.position.z, cz, 1e-6, `${name}：FP 应站在该内景室内中心（z）`);
    assert(Number.isFinite(fp.position.y) && fp.position.y > box.y, `${name}：FP 视线高应高于室内地坪（y=${fp.position.y}）`);
    settle(0.4);
    // 退出 FP：模式与机位参数**逐值**恢复（<1e-6），内景寻址也恢复
    rig.exitFp({ source: 'test' });
    settle();
    const after = rig.describe();
    assertEqual(after.mode, 'interior', `${name}：退出 FP 后应回到 interior`);
    assertEqual(after.interiorViewpointId, before.interiorViewpointId, `${name}：退出后内景机位应恢复`);
    assertClose(after.position.x, before.position.x, 1e-6, `${name}：position.x 应逐值恢复`);
    assertClose(after.position.y, before.position.y, 1e-6, `${name}：position.y 应逐值恢复`);
    assertClose(after.position.z, before.position.z, 1e-6, `${name}：position.z 应逐值恢复`);
    assertClose(after.target.x, before.target.x, 1e-6, `${name}：target.x 应逐值恢复`);
    assertClose(after.target.y, before.target.y, 1e-6, `${name}：target.y 应逐值恢复`);
    assertClose(after.target.z, before.target.z, 1e-6, `${name}：target.z 应逐值恢复`);
    assertClose(after.fov, before.fov, 1e-6, `${name}：fov 应逐值恢复`);
  }
  runner.info('金銮殿 / B-hall-mid（同区）各自进出 FP：机位与目标 <1e-6 逐值恢复，内景寻址同步恢复');
});

await runner.test('内景不可穿墙、不掉出：以真实碰撞数据四向行走，越出盒子的点必须落在门洞内', () => {
  const { registry, rig, settle, requestInterior } = makeInteriorCore();
  const box = interiorBoundsFor({ slotId: 'B-hall-mid' });
  requestInterior(box.viewpointId);
  const solver = createFpSolver({ config: CONFIG });
  const obstacles = registry.allObstacles();
  const stand = { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
  const floorY = LAYOUT.floorYAt(stand.x, stand.z);
  assert(floorY !== null && Number.isFinite(floorY), '室内机位应有有效地坪（不得悬空）');

  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let exits = 0;
  let fallOuts = 0;
  for (const [dx, dz] of directions) {
    let p = { x: stand.x, y: floorY + CONFIG.CAMERA.fpEyeHeight, z: stand.z };
    for (let i = 0; i < 40; i += 1) {
      const r = solver.step(p, dx, dz, 0.25, { obstacles });
      p = { x: r.x, y: r.y, z: r.z };
      const floor = LAYOUT.floorYAt(p.x, p.z);
      if (floor === null || !Number.isFinite(floor)) fallOuts += 1;
      const inside = p.x >= box.minX - 1e-6 && p.x <= box.maxX + 1e-6 && p.z >= box.minZ - 1e-6 && p.z <= box.maxZ + 1e-6;
      if (!inside) {
        // 越出室内盒只允许"从门洞出去"：该点必须落在某障碍的门洞净空内
        const throughDoor = obstacles.some((o) => o.door && insideObstacleDoor(o.door, o.bounds, p.x, p.z));
        exits += 1;
        assert(throughDoor, `走出室内盒必须经门洞（点 ${p.x.toFixed(2)},${p.z.toFixed(2)} 不在任何门洞内）`);
      }
    }
  }
  assertEqual(fallOuts, 0, `行走过程不得掉出可行走面（floorYAt 为空次数=${fallOuts}）`);
  assert(exits >= 0, '越界处必须全部经门洞通过');
  settle(0.2);
  runner.info(`B-hall-mid 内景四向各 40 步（共 160 步）：掉出 0 次；经门洞越出 ${exits} 个采样点（其余被墙拦住）`);
});

/* ========================================================================== */

process.exit(runner.summary());
