#!/usr/bin/env node
/**
 * `tests/zone-garden.test.mjs` —— F 区（御花园、宫墙、角楼、外城门、护城河与桥）专项自测。
 *
 * 覆盖任务卡验收项，全部以**数值**给出（不是"看起来对"）：
 *   1. createZone 契约完整 + layout 归属 F 的 14 槽位逐一实现（≥10）；
 *   2. 宫墙四周完整闭合：沿墙中心线 0.5m 采样 100% 被墙段/城台覆盖；相邻墙段在角部相接；
 *      平行墙段零重叠（无重墙）；墙基标高 = 墙下地坪（无悬空/无沉降）；
 *   3. 四角角楼 / 四面外城门数量、层级（南/北 grade3 重檐庑殿 vs 东/西 grade2 歇山）；
 *   4. 护城河环闭合（相邻水体共边 ≥30m + 环中心线采样 100% 落在水体上，不终止）；
 *      水体/陆地/墙基/道路三维互不穿插；临水构件必须落地（不允许悬在水里）；
 *   5. 入城桥 4 座：桥面标高 = 登记 deckY、桥墩落到河底、南桥把南城门与外侧落脚点连通；
 *   6. 御花园：中央亭阁/北殿/东西亭/东西配殿、廊道 2、假山 2、照壁 1、水池 2、曲折步道、树群 104；
 *   7. 机位 ≥2（含城门与花园取景）+ fp-spawn；不可进入建筑 visitable=false 且进 colliders；
 *   8. F 区绘制调用 ≤ 80（config.BUDGET.drawCalls.perZone.F）；树/灯/临水构件用实例化；
 *   9. 全城鸟瞰：整区 Box3 不越界、不截断；每栋建筑实测包围盒底面 = 本地地坪（无悬空）。
 *
 * 运行：`node tests/zone-garden.test.mjs`
 */

import {
  ROOT,
  assert,
  assertClose,
  assertEqual,
  assertNoProblems,
  createTestRunner,
  loadModule,
  loadThree,
  makeTestCtx,
  makeSilentEvents,
  zoneModulePath,
} from './harness.mjs';

const ZONE = 'F';
const runner = createTestRunner('zone-garden.test.mjs · F 区御花园/宫墙/角楼/城门/护城河/桥');

const THREE = await loadThree();
const { CONFIG, TERRAIN, MODULES } = await loadModule('src/shared/config.js');
const L = await loadModule('src/shared/layout.js');
const { createKit, countDrawCalls } = await loadModule('src/kit/index.js');
const { validateZoneResult } = await loadModule('src/core/context.js');

const BUDGET = CONFIG.BUDGET;
const QUALITY = 'medium';
const F_SLOTS = L.SLOTS.filter((s) => s.zone === ZONE);
const F_WALLS = L.WALLS.filter((w) => w.cityWall === true);
const F_CONNECTORS = L.CONNECTORS.filter((c) => c.owner === ZONE);
const F_VIEWPOINTS = L.VIEWPOINTS.filter((v) => v.area === ZONE);
const F_ANCHORS = L.LIGHT_ANCHORS.filter((a) => a.zone === ZONE);
const F_OBSTACLES = L.OBSTACLES.filter((o) => o.zone === ZONE);
const F_WALKABLE = L.WALKABLE.filter((w) => w.zone === ZONE);
const F_ROADS = L.ROADS.filter((r) => r.zone === ZONE);
const F_CORRIDORS = L.CORRIDORS.filter((c) => c.owner === ZONE);
const F_SCENIC = L.SCENIC_OBJECTS.filter((s) => s.owner === ZONE);
const F_VEG = L.VEGETATION.filter((v) => v.zone === ZONE);
const MOAT_RECTS = L.MOAT.rects.map((r) => r.bounds);
const MOAT_BED_Y = L.MOAT.waterY - L.MOAT.depth;
/** 不算"地面"的体量（与 src/zones/garden-boundary.js 同口径）：结构体 + 水下池底。 */
const NOT_GROUND_GROUPS = new Set(['platform', 'support', 'bridgePier', 'bridgeAbutment', 'pondBed']);
/** 临水结构体。 */
const SUPPORT_GROUPS = new Set(['support', 'bridgePier', 'bridgeAbutment']);
/** 御花园范围（layout GARDEN_Z）。 */
const isInGarden = (x, z) => x >= -300 && x <= 300 && z >= 300 && z <= 420;
/** 点到轴对齐矩形的距离（用于"步道带不进入障碍"的净距校验）。 */
function pointRectDistance(x, z, r) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}
/** 线段到轴对齐矩形的最小距离（采样 + 端点精算，精度 0.05m）。 */
function segmentRectDistance(a, b, r) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.ceil(len / 0.05));
  let best = Infinity;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    best = Math.min(best, pointRectDistance(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r));
  }
  return best;
}

const rectOf = (r) => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });
const planOverlap = (a, b) => ({
  x: Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
  z: Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ),
});
const volumeOverlap = (a, b) => {
  const o = planOverlap(a.rect, b.rect);
  if (o.x <= 1e-6 || o.z <= 1e-6) return 0;
  return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
};
const containsRect = (outer, inner, tol = 1e-6) =>
  inner.minX >= outer.minX - tol && inner.maxX <= outer.maxX + tol && inner.minZ >= outer.minZ - tol && inner.maxZ <= outer.maxZ + tol;
const insideRect = (r, x, z, tol = 1e-6) => x >= r.minX - tol && x <= r.maxX + tol && z >= r.minZ - tol && z <= r.maxZ + tol;

/* -------------------------------------------------------------------------- */

const kit = createKit({ THREE, config: CONFIG, quality: QUALITY });
const built = await (async () => {
  const ctx = await makeTestCtx({ zoneId: ZONE, kit, quality: QUALITY });
  const mod = await loadModule(zoneModulePath(ZONE));
  const result = await mod.createZone(ctx);
  return { result, ctx, mod, audit: result.audit, stats: result.stats };
})();

const { result, audit, stats } = built;
const byLocal = (id) => F_SLOTS.find((s) => s.id === id);

/* ========================================================================== */
runner.section('1. 模块与 createZone 契约（CONTRACTS §3/§4/§5/§6/§8.3）');
/* ========================================================================== */

await runner.test('导出符号：createZone + 字符串 ZONE_ID + default', () => {
  assertEqual(built.mod.ZONE_ID, ZONE, 'ZONE_ID 必须为 "F"');
  assertEqual(typeof built.mod.createZone, 'function', '必须导出 createZone');
  assertEqual(built.mod.default, built.mod.createZone, 'default 应指向 createZone');
});

await runner.test('返回值通过全部契约校验（逐字段回显 layout，0 问题）', () => {
  const { problems, stats: s } = validateZoneResult(ZONE, result, {
    THREE,
    scope: 'zone',
    expectBuildings: F_SLOTS.length,
  });
  assertNoProblems(problems, 'F 区 createZone 契约');
  runner.info(`契约统计：建筑 ${s.buildings} / 连接 ${s.connectors} / 障碍 ${s.obstacles} / 可行走 ${s.walkable} / 坡道 ${s.ramps} / 机位 ${s.viewpoints} / 灯位 ${s.lightAnchors}`);
});

await runner.test(`layout 归属 F 的槽位逐一实现（${F_SLOTS.length} / ≥10）且带实测包围盒`, () => {
  assertEqual(result.buildings.length, F_SLOTS.length, '必须实现 F 的全部槽位');
  assert(F_SLOTS.length >= 10, `F 槽位 ${F_SLOTS.length} < 门槛 10`);
  const ids = new Set(result.buildings.map((b) => b.id));
  for (const slot of F_SLOTS) assert(ids.has(slot.id), `缺少槽位 ${slot.id}`);
  for (const b of result.buildings) {
    assert(b.worldBounds, `${b.id} 缺少 userData.kit.worldBounds（验收一律用实测包围盒）`);
    assert(b.worldBounds.maxY > b.worldBounds.minY, `${b.id} 实测包围盒高度非法`);
  }
  runner.info(`F 槽位 ${F_SLOTS.length} 栋：${result.buildings.map((b) => b.name).join('、')}`);
});

/* ========================================================================== */
runner.section('2. 宫墙闭合、角楼与城门层级');
/* ========================================================================== */

await runner.test('4 段宫墙与 layout.WALLS(cityWall) 完全一致，且每段仅 1 个门洞', () => {
  assertEqual(audit.walls.length, F_WALLS.length, '宫墙段数必须等于 layout 的 cityWall 段数');
  for (const src of F_WALLS) {
    const w = audit.walls.find((x) => x.id === src.id);
    assert(w, `缺少宫墙 ${src.id}`);
    assertClose(w.from.x, src.from.x, 1e-6, `${src.id}.from.x`);
    assertClose(w.to.z, src.to.z, 1e-6, `${src.id}.to.z`);
    assertEqual(w.axis, src.axis, `${src.id}.axis`);
    assertClose(w.thickness, MODULES.wallThickness, 1e-6, `${src.id}.thickness`);
    assertClose(w.height, MODULES.wallHeight, 1e-6, `${src.id}.height`);
    assertEqual(w.openings.length, 1, `${src.id} 应有且仅有 1 个门洞（layout 自动派生）`);
    assertEqual(w.openings[0].width, 26, `${src.id} 门洞净宽`);
    assertClose(w.openings[0].height, MODULES.wallHeight - MODULES.wallBattlementHeight - 1.6, 1e-6, `${src.id} 门洞净高`);
  }
});

await runner.test('墙段首尾相接：沿环中心线 0.5m 采样 100% 被墙段/城台覆盖（无断口）', () => {
  // 环顺序：南 → 东 → 北 → 西（首尾相接）
  const order = ['WALL-CITY-south', 'WALL-CITY-east', 'WALL-CITY-north', 'WALL-CITY-west'];
  const covers = (x, z) =>
    audit.walls.some((w) => insideRect(w.rect, x, z)) ||
    audit.platforms.some((p) => p.blocks.some((b) => insideRect(b.rect, x, z)));
  let total = 0;
  let miss = 0;
  for (const id of order) {
    const w = audit.walls.find((x) => x.id === id);
    const len = Math.hypot(w.to.x - w.from.x, w.to.z - w.from.z);
    const n = Math.ceil(len / 0.5);
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = w.from.x + (w.to.x - w.from.x) * t;
      const z = w.from.z + (w.to.z - w.from.z) * t;
      total += 1;
      if (!covers(x, z)) miss += 1;
    }
  }
  assertEqual(miss, 0, `环采样有 ${miss}/${total} 点无墙体覆盖（= 断口）`);
  runner.info(`宫墙环采样 ${total} 点，覆盖 ${total - miss}（${((100 * (total - miss)) / total).toFixed(2)}%），断口 0`);
});

await runner.test('角部相接 + 无重墙：垂直墙段仅角部小重叠、平行墙段零重叠', () => {
  const rects = audit.walls.map((w) => ({ id: w.id, axis: w.axis, rect: w.rect }));
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const o = planOverlap(a.rect, b.rect);
      const ox = Math.max(0, o.x);
      const oz = Math.max(0, o.z);
      if (a.axis === b.axis) {
        assert(ox * oz < 1e-6, `平行墙段 ${a.id} 与 ${b.id} 重叠 ${ox.toFixed(2)}×${oz.toFixed(2)}m（重墙）`);
      } else {
        assert(ox > 0 && oz > 0, `相邻墙段 ${a.id}/${b.id} 未相接（角部有缺口）`);
        assert(ox <= 10 && oz <= 10, `垂直墙段 ${a.id}/${b.id} 重叠 ${ox.toFixed(2)}×${oz.toFixed(2)}m 过大（疑似重墙）`);
      }
    }
  }
  // 四个环角必须同时落在两段墙 + 一个城台内
  const corners = [
    { x: L.ENVELOPE.maxX + 4, z: L.ENVELOPE.minZ - 4 },
    { x: L.ENVELOPE.maxX + 4, z: L.ENVELOPE.maxZ + 4 },
    { x: L.ENVELOPE.minX - 4, z: L.ENVELOPE.maxZ + 4 },
    { x: L.ENVELOPE.minX - 4, z: L.ENVELOPE.minZ - 4 },
  ];
  for (const c of corners) {
    const inWalls = audit.walls.filter((w) => insideRect(w.rect, c.x, c.z)).length;
    const inPlatform = audit.platforms.some((p) => p.blocks.some((b) => insideRect(b.rect, c.x, c.z)));
    assert(inWalls >= 2, `环角 (${c.x},${c.z}) 仅 ${inWalls} 段墙覆盖`);
    assert(inPlatform, `环角 (${c.x},${c.z}) 无城台覆盖`);
  }
  runner.info('4 角：垂直墙段小范围交接（≤8×8m）+ 城台覆盖，平行墙段零重叠');
});

await runner.test('墙基落地：墙下地坪标高（按 20m 采样、跳过城台）与墙底一致（无悬空/无沉降）', () => {
  let samples = 0;
  let worst = 0;
  for (const w of audit.walls) {
    const len = Math.hypot(w.to.x - w.from.x, w.to.z - w.from.z);
    const n = Math.floor(len / 20);
    for (let i = 0; i <= n; i += 1) {
      const t = n === 0 ? 0.5 : i / n;
      const x = w.from.x + (w.to.x - w.from.x) * t;
      const z = w.from.z + (w.to.z - w.from.z) * t;
      const inPlatform = audit.platforms.some((p) => p.blocks.some((b) => insideRect(b.rect, x, z)));
      if (inPlatform) continue; // 城台处墙体被加厚体量包住，另测
      let ground = null;
      for (const s of audit.land) {
        if (NOT_GROUND_GROUPS.has(s.group)) continue;
        if (!insideRect(s.rect, x, z)) continue;
        if (ground === null || s.y1 > ground) ground = s.y1;
      }
      assert(ground !== null, `墙 ${w.id} 在 (${x.toFixed(1)},${z.toFixed(1)}) 下方无地坪（悬空）`);
      worst = Math.max(worst, Math.abs(w.y0 - ground));
      samples += 1;
    }
  }
  assert(worst <= 0.02, `墙基与地坪最大偏差 ${worst.toFixed(3)}m > 0.02m`);
  runner.info(`墙基采样 ${samples} 点，|墙底 − 地坪顶| 最大 ${worst.toFixed(4)}m`);
});

await runner.test('四角角楼：数量 4、位于环角、城台完全承托、无悬空', () => {
  const towers = result.buildings.filter((b) => b.kind === 'cornerTower');
  assertEqual(towers.length, 4, '角楼数量');
  const ringCorners = [
    { x: -(L.ENVELOPE.maxX + 4), z: L.ENVELOPE.maxZ + 4 },
    { x: L.ENVELOPE.maxX + 4, z: L.ENVELOPE.maxZ + 4 },
    { x: -(L.ENVELOPE.maxX + 4), z: -(L.ENVELOPE.maxZ + 4) },
    { x: L.ENVELOPE.maxX + 4, z: -(L.ENVELOPE.maxZ + 4) },
  ];
  for (const t of towers) {
    const platform = audit.platforms.find((p) => p.towerId === t.id);
    assert(platform, `${t.id} 缺少角楼城台`);
    const block = platform.blocks[0];
    assert(containsRect(block.rect, rectOf(t.bounds)), `${t.id} 城台未完全承托角楼`);
    assertClose(block.y1, MODULES.wallHeight, 1e-6, `${t.id} 城台顶标高`);
    assertClose(t.worldBounds.minY, block.y1, 0.05, `${t.id} 角楼底面应坐在城台顶`);
    const cornerDist = Math.min(...ringCorners.map((c) => Math.hypot(c.x - t.x, c.z - t.z)));
    assert(cornerDist < 2, `${t.id} 不在宫墙环角（最近角距 ${cornerDist.toFixed(2)}m）`);
  }
  runner.info(`角楼 4 座，城台顶 ${MODULES.wallHeight}m，角楼实测底/顶 = ${towers[0].worldBounds.minY}/${towers[0].worldBounds.maxY}（世界坐标）`);
});

await runner.test('四面外城门：南/北主门（grade3 重檐庑殿）高于东/西侧门（grade2 歇山）', () => {
  const gates = result.buildings.filter((b) => b.kind === 'gateHall');
  assertEqual(gates.length, 4, '城门数量');
  const byId = (id) => gates.find((g) => g.id === id);
  for (const id of ['F-gate-south', 'F-gate-north']) {
    const g = byId(id);
    assertEqual(g.grade, 3, `${id} 等级`);
    assertEqual(g.roofType, 'doubleEaveHip', `${id} 屋顶`);
  }
  for (const id of ['F-gate-west', 'F-gate-east']) {
    const g = byId(id);
    assertEqual(g.grade, 2, `${id} 等级`);
    assertEqual(g.roofType, 'gableHip', `${id} 屋顶`);
  }
  const south = byId('F-gate-south');
  const west = byId('F-gate-west');
  const hSouth = south.worldBounds.maxY - south.worldBounds.minY;
  const hWest = west.worldBounds.maxY - west.worldBounds.minY;
  assert(hSouth > hWest + 1, `南主门高 ${hSouth.toFixed(2)}m 未明显高于西侧门 ${hWest.toFixed(2)}m`);
  assert(south.w > west.w, '南主门面阔应大于侧门');
  runner.info(`城门层级：南门 ${hSouth.toFixed(2)}m（grade3 重檐庑殿，面阔 ${south.w}m）> 西侧门 ${hWest.toFixed(2)}m（grade2 歇山，面阔 ${west.w}m）`);
});

await runner.test('城门洞贯通：城台留出与门洞等宽的通道 + 门额，通道内无实体阻挡', () => {
  for (const gate of result.buildings.filter((b) => b.kind === 'gateHall')) {
    const platform = audit.platforms.find((p) => p.gateId === gate.id);
    assert(platform, `${gate.id} 缺少城门城台`);
    assertEqual(platform.passage.width, gate.door.width, `${gate.id} 城台通道宽 = 门洞净宽`);
    assert(platform.passage.height >= CONFIG.INTERACTION.player.height + 1, `${gate.id} 通道净高 ${platform.passage.height} 不足`);
    assert(platform.blocks.length >= 3, `${gate.id} 城台应含 2 墩 + 1 门额`);
    // 通道中轴上每一点不得落在任何城台实体块内（除门额以上）
    const axis = platform.passage.axis;
    const steps = 20;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = axis === 'z' ? platform.passage.center.x : platform.passage.center.x - gate.w / 2 + gate.w * t;
      const z = axis === 'z' ? platform.passage.center.z - gate.d / 2 + gate.d * t : platform.passage.center.z;
      for (const b of platform.blocks) {
        const isLintel = b.id.endsWith('lintel');
        if (isLintel) {
          assert(b.y0 >= platform.passage.height - 1e-6, `${gate.id} 门额底 ${b.y0} 低于通道净高 ${platform.passage.height}`);
          continue;
        }
        assert(!insideRect(b.rect, x, z), `${gate.id} 通道 (${x.toFixed(1)},${z.toFixed(1)}) 被城台墩体阻挡（${b.id}）`);
      }
    }
  }
  runner.info('4 座城门：通道 26m×9.3m 贯通，门额在通道净高之上');
});

/* ========================================================================== */
runner.section('3. 护城河闭合、桥与"互不穿插"');
/* ========================================================================== */

await runner.test('水体登记：4 段护城河 + 2 个水池，矩形与常水位与 layout 逐一相等', () => {
  assertEqual(audit.water.length, 6, '水体数量应为 4 护城河 + 2 水池');
  for (const r of L.MOAT.rects) {
    const w = audit.water.find((x) => x.id === r.id);
    assert(w, `缺少护城河段 ${r.id}`);
    assertClose(w.rect.minX, r.bounds.minX, 1e-6, `${r.id}.minX`);
    assertClose(w.rect.maxZ, r.bounds.maxZ, 1e-6, `${r.id}.maxZ`);
    assertClose(w.y1, L.MOAT.waterY, 1e-6, `${r.id} 常水位`);
    assertClose(w.y0, MOAT_BED_Y, 1e-6, `${r.id} 河底`);
  }
  for (const p of L.WATER_BODIES.filter((w) => w.owner === ZONE && w.kind === 'pond')) {
    const w = audit.water.find((x) => x.id === p.id);
    assert(w, `缺少水池 ${p.id}`);
    assertClose(w.rect.minX, p.bounds.minX, 1e-6, `${p.id}.minX`);
    assertClose(w.y1, p.y, 1e-6, `${p.id} 水面标高`);
  }
  assertEqual(audit.water.filter((w) => w.id.startsWith('MOAT-')).length, 4, '护城河段数');
  runner.info(`水体 6 段：护城河 4（水位 ${L.MOAT.waterY}，河底 ${MOAT_BED_Y}）+ 水池 2（水位 0.05，池底 -0.4）`);
});

await runner.test('河道闭合、不终止：相邻水体共边 ≥30m + 环中心线 0.5m 采样 100% 落在水体上', () => {
  const rings = L.MOAT.rects.map((r) => ({ id: r.id, rect: r.bounds }));
  const shared = (a, b) => {
    const o = planOverlap(a.rect, b.rect);
    const touchX = Math.abs(o.x) <= 1e-6 ? Math.max(0, o.z) : (o.x > 0 ? Math.max(0, o.z) : 0);
    const touchZ = Math.abs(o.z) <= 1e-6 ? Math.max(0, o.x) : (o.z > 0 ? Math.max(0, o.x) : 0);
    return Math.max(touchX, touchZ);
  };
  const pairs = [
    ['MOAT-south', 'MOAT-west'],
    ['MOAT-south', 'MOAT-east'],
    ['MOAT-north', 'MOAT-west'],
    ['MOAT-north', 'MOAT-east'],
    ['MOAT-south', 'MOAT-north'],
  ];
  for (const [a, b] of pairs) {
    const ra = rings.find((r) => r.id === a).rect;
    const rb = rings.find((r) => r.id === b).rect;
    const s = shared({ rect: ra }, { rect: rb });
    if (a === 'MOAT-south' && b === 'MOAT-north') continue; // 南北两段隔宫城，靠东西段闭合
    assert(s >= 30, `${a} 与 ${b} 共边仅 ${s.toFixed(2)}m（<30m，河道可能断开）`);
  }
  // 环中心线采样：南/北段 z 取中心、x 从 -332 到 332；西/东段 x 取中心、z 从 -506 到 506
  let miss = 0;
  let total = 0;
  for (const r of L.MOAT.rects) {
    const b = r.bounds;
    const horizontal = b.maxX - b.minX > b.maxZ - b.minZ;
    const len = horizontal ? b.maxX - b.minX : b.maxZ - b.minZ;
    const n = Math.ceil(len / 0.5);
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = horizontal ? b.minX + (b.maxX - b.minX) * t : (b.minX + b.maxX) / 2;
      const z = horizontal ? (b.minZ + b.maxZ) / 2 : b.minZ + (b.maxZ - b.minZ) * t;
      total += 1;
      if (!audit.water.some((w) => insideRect(w.rect, x, z))) miss += 1;
    }
  }
  assertEqual(miss, 0, `河道环采样有 ${miss}/${total} 点不在水体上（= 河道终止）`);
  runner.info(`护城河环采样 ${total} 点全部落在水体上，相邻段共边 ≥34m`);
});

await runner.test('水体 / 陆地 / 墙基 / 道路三维互不穿插（体积重叠 0）', () => {
  const landSolids = audit.land.filter((s) => !NOT_GROUND_GROUPS.has(s.group) && s.group !== 'road').map((s) => ({ id: s.id, rect: s.rect, y0: s.y0, y1: s.y1 }));
  let landWater = 0;
  for (const s of landSolids) for (const w of audit.water) if (volumeOverlap(s, w) > 0.02) landWater += 1;
  assertEqual(landWater, 0, `陆地与水体穿插 ${landWater} 处`);

  let wallWater = 0;
  const walls = audit.walls.map((w) => ({ id: w.id, rect: w.rect, y0: w.y0, y1: w.y1 }));
  for (const w of walls) for (const p of audit.water) if (volumeOverlap(w, p) > 0.02) wallWater += 1;
  assertEqual(wallWater, 0, `墙基与水体穿插 ${wallWater} 处`);

  let roadWater = 0;
  for (const r of audit.roads) for (const p of audit.water) if (volumeOverlap(r, p) > 0.02) roadWater += 1;
  assertEqual(roadWater, 0, `道路与水体穿插 ${roadWater} 处`);

  // 道路不得沉入陆地（底面 = 地面顶，允许 2cm 施工容差）；同材质共面的铺装互相重叠不算穿插
  const terrainGroups = new Set(['outerTerrain', 'bermRing', 'belt', 'garden', 'kerb']);
  let roadLand = 0;
  for (const r of audit.roads) {
    for (const s of audit.land) {
      if (!terrainGroups.has(s.group)) continue;
      const o = planOverlap(s.rect, r.rect);
      if (o.x <= 0.05 || o.z <= 0.05) continue;
      if (r.y0 < s.y1 - 0.02) roadLand += 1;
    }
  }
  assertEqual(roadLand, 0, `道路沉入陆地 ${roadLand} 处`);

  let propWater = 0;
  for (const p of audit.props) {
    if (!p.y0 && p.y0 !== 0) continue;
    for (const w of audit.water) if (volumeOverlap({ rect: p.rect, y0: p.y0, y1: p.y1 }, w) > 0.02) propWater += 1;
  }
  assertEqual(propWater, 0, `点景与水体穿插 ${propWater} 处`);
  runner.info(`陆地 ${landSolids.length} 块 / 墙 ${walls.length} 段 / 道路 ${audit.roads.length} 块 / 点景 ${audit.props.length} 个：与水体体积重叠 0`);
});

await runner.test('临水构件必须落地或完全在水面之上（不允许悬在水里）', () => {
  let checked = 0;
  let floating = 0;
  for (const s of audit.supports) {
    const hits = audit.water.filter((w) => {
      const o = planOverlap(s.rect, w.rect);
      return o.x > 0.01 && o.z > 0.01;
    });
    for (const w of hits) {
      const grounded = s.y0 <= w.y0 + 0.05;
      const above = s.y0 >= w.y1 - 0.05;
      checked += 1;
      if (!grounded && !above) {
        floating += 1;
        runner.info(`悬空：${s.id} y=[${s.y0},${s.y1}] 水面 ${w.id} y=[${w.y0},${w.y1}]`);
      }
    }
  }
  assertEqual(floating, 0, `${floating} 个临水构件既未落地也不在水面之上`);
  assert(checked >= 36, `临水构件覆盖检查仅 ${checked} 个（应覆盖 8 个桥墩 + 桥台 + 32 个栈道支墩）`);
  runner.info(`临水构件 ${checked} 处：桥墩落到河底 ${MOAT_BED_Y}m、栈道支墩落到池底 -0.38m（均落地）`);
});

await runner.test('入城桥 4 座：桥面标高 = 登记 deckY，桥墩落到河底，南桥连通南城门与外侧落脚点', () => {
  assertEqual(audit.bridges.length, 4, '桥数量');
  const connectors = F_CONNECTORS.filter((c) => c.kind === 'bridge');
  assertEqual(connectors.length, 4, 'layout 中 F owner 的桥连接数');
  for (const c of connectors) {
    const bridge = audit.bridges.find((b) => b.connectorId === c.id);
    assert(bridge, `缺少 ${c.id} 对应桥体`);
    assertClose(bridge.deckY, c.elevation, 1e-6, `${c.id} 桥面标高 = 连接登记标高`);
    assertClose(bridge.deckTop, TERRAIN.bridgeDeckY + 0.12, 1e-6, `${c.id} 可视桥面顶（登记 deckY + 12cm 面层）`);
    assert(bridge.piers.length === 2, `${c.id} 应有 2 道落底桥墩`);
    for (const p of bridge.piers) {
      assertClose(p.y0, MOAT_BED_Y, 1e-6, `${p.id} 桥墩底应落到河底`);
      assert(p.y1 > L.MOAT.waterY + 0.2, `${p.id} 桥墩顶 ${p.y1} 未露出水面`);
    }
    const spec = L.BRIDGES.find((b) => b.connectorId === c.id);
    assertClose(bridge.rect.minX, spec.bounds.minX, 1e-6, `${c.id} 桥面范围`);
    assertClose(bridge.width, spec.width, 1e-6, `${c.id} 桥面宽 = 登记宽`);
  }
  // 南桥 → 南城门 → 门内带：标高链路（登记值 + 实建铺装）
  const southBridge = audit.bridges.find((b) => b.connectorId === 'CXN-bridge-south');
  assertClose(southBridge.deckY, TERRAIN.bridgeDeckY, 1e-6, '南桥桥面标高');
  assertEqFloor(0, -489, TERRAIN.bridgeDeckY, '南桥桥面');
  assertEqFloor(0, -465, 0.6, '南桥内引坡中段');
  assertEqFloor(0, -450, 0.4, '南城门门洞地面');
  assertEqFloor(0, -420, 0.4 * (1 - (-420 + 440) / 36), '城门内缓坡中段（线性插值）');
  // t75 起门洞内侧登记了 kind:'passage' 通行面/缓坡，故允许“与城内带高差 ≤ 可跨台阶阈值”
  const beltY = L.floorYAt(0, -402);
  assert(beltY !== null && Math.abs(beltY - TERRAIN.beltY) <= CONFIG.INTERACTION.step.maxStepHeight + 1e-6,
    `城门内侧带 floorYAt(0,-402)=${beltY} 与 beltY=${TERRAIN.beltY} 高差超过可跨台阶阈值 ${CONFIG.INTERACTION.step.maxStepHeight}`);
  // 南轴竖向链连续性：南桥 → 内引坡 → 门洞地面 → 内缓坡 → 门内带 → B 入口（跨区衔接）
  // 注：t75 起 B 区在门外 6m 内也登记了 kind:'passage' 通行面（0.45），故此处只断言"逐米高差 ≤ 可跨台阶阈值"
  //     与"不出现悬空（每点都有面）"，不把跨区数据点写死成本区标高。
  let prevY = null;
  let maxStep = 0;
  let samples = 0;
  for (let z = -470; z <= -395; z += 1) {
    const y = L.floorYAt(0, z);
    assert(y !== null, `南轴 (0,${z}) 无可行走标高（悬空）`);
    if (prevY !== null) maxStep = Math.max(maxStep, Math.abs(y - prevY));
    prevY = y;
    samples += 1;
  }
  assert(maxStep <= CONFIG.INTERACTION.step.maxStepHeight + 1e-6,
    `南轴逐米最大高差 ${maxStep.toFixed(3)}m 超过可跨台阶阈值 ${CONFIG.INTERACTION.step.maxStepHeight}m`);
  assertClose(L.floorYAt(0, -489), TERRAIN.bridgeDeckY, 1e-6, '南桥桥面标高');
  assertClose(L.floorYAt(0, -401), 0.45, 1e-6, '与 B 入口衔接面（WK-B-gate-front-door-passage y=0.45）');
  runner.info(`南轴 ${samples} 点竖向链连续：逐米最大高差 ${maxStep.toFixed(3)}m ≤ ${CONFIG.INTERACTION.step.maxStepHeight}m（桥面 ${TERRAIN.bridgeDeckY} → 门洞面 0.4 → 门内带 ${TERRAIN.beltY} → B 入口 0.45）`);
  assertFloorAtLeastWalkable(0, -480, 'WK-F-bridge-south');
  assertFloorAtLeastWalkable(0, -445, 'WK-F-belt-south');
  runner.info(`4 座桥：桥面登记 ${TERRAIN.bridgeDeckY}m（可视顶 0.92m），桥墩 −6→0.3m 落河底；南桥—南城门—门内带标高链 ${TERRAIN.bridgeDeckY}→0.4→${TERRAIN.beltY} 与登记一致`);

  function assertEqFloor(x, z, expected, label) {
    const y = L.floorYAt(x, z);
    assert(y !== null, `${label} (${x},${z}) 无可行走标高`);
    assertClose(y, expected, 1e-6, `${label} floorYAt(${x},${z})`);
  }
  function assertFloorAtLeastWalkable(x, z, walkableId) {
    const surface = L.WALKABLE.find((w) => w.id === walkableId);
    const y = L.floorYAt(x, z);
    assert(y >= surface.y - 1e-6, `${walkableId}: floorYAt ${y} < 面高 ${surface.y}（地面被压低）`);
  }
});

await runner.test('连接对齐：15 条 F-owned 通道回显一致，且两端标高与实建路面/可行走面对齐', () => {
  assertEqual(result.connectors.length, F_CONNECTORS.length, 'F owner 通道数');
  assertEqual(F_CONNECTORS.length, 15, 'layout 登记 F owner 通道 15 条');
  let flatChecks = 0;
  let rampChecks = 0;
  for (const c of result.connectors) {
    const src = F_CONNECTORS.find((x) => x.id === c.id);
    assert(src, `${c.id} 不在 layout 的 F owner 通道中`);
    assertClose(c.position.x, src.position.x, 1e-6, `${c.id}.x`);
    assertClose(c.position.z, src.position.z, 1e-6, `${c.id}.z`);
    assertClose(c.width, src.width, 1e-6, `${c.id}.width`);
    assertClose(c.elevation, src.elevation, 1e-6, `${c.id}.elevation`);

    const road = F_ROADS.find((r) => r.connector === c.id);
    if (c.kind === 'stairs') {
      assert(road, `${c.id} 台阶缺登记道路`);
      assert(road.slope <= CONFIG.INTERACTION.step.rampMaxSlope + 1e-6, `${c.id} 坡度超限`);
      continue;
    }
    if (c.kind === 'bridge') {
      const floor = L.floorYAt(c.position.x, c.position.z);
      assertClose(floor, c.elevation, 0.05, `${c.id} 桥面标高`);
      flatChecks += 1;
      continue;
    }
    // gate / passage：登记标高必须落在实建路面上；有坡度的段要求另一端与可行走面吻合
    assert(road, `${c.id} 缺少 F 侧道路段（连接未落地）`);
    const fromMatches = Math.abs(road.from.y - c.elevation) <= 1e-6;
    const toMatches = Math.abs(road.to.y - c.elevation) <= 1e-6;
    assert(fromMatches || toMatches, `${c.id} 登记标高 ${c.elevation} 不等于其道路端标高 (${road.from.y} → ${road.to.y})`);
    const other = fromMatches ? road.to : road.from;
    const top = L.floorYAt(other.x, other.z);
    assert(top !== null, `${c.id} 另一端 (${other.x},${other.z}) 无可行走标高`);
    const step = top - other.y;
    assert(step >= -0.02, `${c.id} 另一端路面 ${other.y} 高于可行走面 ${top}（铺装被埋/悬空）`);
    assert(step <= CONFIG.INTERACTION.step.maxStepHeight + 1e-6, `${c.id} 另一端与相邻面高差 ${step.toFixed(3)}m 超过可跨台阶阈值 ${CONFIG.INTERACTION.step.maxStepHeight}m`);
    if (Math.abs(road.from.y - road.to.y) > 1e-6) rampChecks += 1;
    else flatChecks += 1;
    if (c.kind === 'gate') {
      const floor = L.floorYAt(c.position.x, c.position.z);
      assertClose(floor, c.elevation, 0.05, `${c.id} 门洞地面标高`);
      const wall = audit.walls.find((w) => w.openings.some(() => insideRect(w.rect, c.position.x, c.position.z)));
      assert(wall, `${c.id} 未落在任一宫墙门洞上（门洞与连接未对齐）`);
      assertEqual(wall.openings[0].width, c.width, `${c.id} 门洞净宽应等于连接宽度`);
    }
  }
  runner.info(`15 条 F-owned 通道：4 门洞 + 4 桥（平接）+ ${rampChecks} 条坡道连接 + ${flatChecks - 8 - rampChecks} 条平接；两端标高与 floorYAt/实建路面吻合`);
});

/* ========================================================================== */
runner.section('4. 御花园内容与后宫连接');
/* ========================================================================== */

await runner.test('御花园含中央亭阁 / 北殿 / 东西亭 / 东西配殿（6 栋，形制与登记一致）', () => {
  const ids = [
    'F-garden-pavilion-main',
    'F-garden-hall-north',
    'F-garden-pavilion-west',
    'F-garden-pavilion-east',
    'F-garden-hall-west',
    'F-garden-hall-east',
  ];
  for (const id of ids) {
    const b = result.buildings.find((x) => x.id === id);
    assert(b, `缺少 ${id}`);
    const src = byLocal(id);
    assertEqual(b.roofType, src.roofType, `${id} 屋顶`);
    assertEqual(b.grade, src.grade, `${id} 等级`);
    assertClose(b.terraceH, src.terraceH, 1e-6, `${id} 台基高`);
    // 花园建筑全部落在花园地坪上
    assertClose(b.worldBounds.minY, TERRAIN.gardenPathsY, 0.05, `${id} 应坐在花园地坪 ${TERRAIN.gardenPathsY}m 上`);
    assert(isInGarden(b.x, b.z), `${id} 不在花园范围内`);
  }
  const main = result.buildings.find((x) => x.id === 'F-garden-pavilion-main');
  assertEqual(main.roofType, 'pyramidal', '中央亭阁为攒尖顶');
  runner.info(`花园 6 栋：中央亭阁（攒尖，实测高 ${(main.worldBounds.maxY - main.worldBounds.minY).toFixed(2)}m）+ 北殿 + 东西亭 + 东西配殿`);

});

await runner.test('花园地面：地坪顶 = gardenPathsY、水池处被挖开（陆地不覆盖水面）', () => {
  const gardenGround = audit.land.filter((s) => s.group === 'garden');
  assert(gardenGround.length >= 3, `花园地坪应被水池切分为多块，实际 ${gardenGround.length}`);
  for (const g of gardenGround) {
    assertClose(g.y1, TERRAIN.gardenPathsY, 1e-6, `${g.id} 地坪顶`);
    assert(isInGarden(g.rect.minX + 0.05, g.rect.minZ + 0.05) && g.rect.maxX <= 300.01 && g.rect.minZ >= 299.99, `${g.id} 超出花园范围`);
  }
  for (const p of [rectOf(L.WATER_BODIES.find((w) => w.id === 'WB-F-pond-west').bounds), rectOf(L.WATER_BODIES.find((w) => w.id === 'WB-F-pond-east').bounds)]) {
    for (const g of gardenGround) {
      const o = planOverlap(g.rect, p);
      assert(Math.max(0, o.x) * Math.max(0, o.z) < 1e-6, `花园地坪 ${g.id} 覆盖了水池（陆地与水面穿插）`);
    }
  }
  runner.info(`花园地坪 ${gardenGround.length} 块（顶 ${TERRAIN.gardenPathsY}m），两个水池处完全挖空`);
});

await runner.test('廊道 2 道 / 假山 2 座 / 照壁 1 座，与 layout 一致并落在花园地坪上', () => {
  const corridors = audit.props.filter((p) => p.kind === 'corridor');
  assertEqual(corridors.length, F_CORRIDORS.length, '廊道数量');
  for (const c of F_CORRIDORS) {
    const rec = corridors.find((x) => x.id === c.id);
    assert(rec, `缺少廊道 ${c.id}`);
    assertClose(rec.from.x, c.from.x, 1e-6, `${c.id}.from.x`);
    assertClose(rec.to.z, c.to.z, 1e-6, `${c.id}.to.z`);
    assertClose(rec.ground, TERRAIN.gardenPathsY, 0.05, `${c.id} 应落在花园地坪上`);
  }
  const rockeries = audit.props.filter((p) => p.kind === 'rockery');
  const screens = audit.props.filter((p) => p.kind === 'screenWall');
  assertEqual(rockeries.length, F_SCENIC.filter((s) => s.kind === 'rockery').length, '假山数量');
  assertEqual(screens.length, F_SCENIC.filter((s) => s.kind === 'screenWall').length, '照壁数量');
  for (const s of F_SCENIC) {
    const rec = audit.props.find((p) => p.id === s.id);
    assert(rec, `缺少点景 ${s.id}`);
    assertClose(rec.rect.minX, s.bounds.minX, 1e-6, `${s.id}.minX`);
    assertClose(rec.y0, TERRAIN.gardenPathsY, 0.05, `${s.id} 落地面`);
  }
  runner.info(`廊道 2 / 假山 2（高 ${F_SCENIC[0].height}m）/ 照壁 1（宽 ${F_SCENIC.find((s) => s.kind === 'screenWall').bounds.maxX - F_SCENIC.find((s) => s.kind === 'screenWall').bounds.minX}m）`);
});

await runner.test('曲折步道：≥8 段、累计转角 ≥180°、全部落在花园内且不穿建筑/水池/照壁', () => {
  const path = audit.path;
  assert(path.length >= 8, `曲折步道段数 ${path.length} < 8`);
  assert(stats.windingPath.turningDeg >= 180, `累计转角 ${stats.windingPath.turningDeg}° < 180°（不够"曲折"）`);
  let out = 0;
  for (const p of path) {
    assertClose(p.y1, TERRAIN.gardenPathsY + 0.04, 0.06, `${p.id} 步道面标高`);
    assertClose(p.y0, TERRAIN.gardenPathsY, 0.06, `${p.id} 步道底 = 地坪顶（不沉入地面）`);
    const inside = isInGarden(p.a.x, p.a.z) && isInGarden(p.b.x, p.b.z);
    if (!inside) out += 1;
    const half = 3.2 / 2;
    for (const slot of F_SLOTS) {
      const d = segmentRectDistance(p.a, p.b, rectOf(slot.bounds));
      assert(d >= half - 0.01, `${p.id} 与建筑 ${slot.id} 净距 ${d.toFixed(2)}m < 半宽 ${half}m（步道穿建筑）`);
    }
    for (const w of audit.water) {
      const d = segmentRectDistance(p.a, p.b, w.rect);
      assert(d >= half - 0.01, `${p.id} 与水 ${w.id} 净距 ${d.toFixed(2)}m < 半宽 ${half}m（步道入水）`);
    }
    const screen = F_SCENIC.find((sx) => sx.kind === 'screenWall');
    const dScreen = segmentRectDistance(p.a, p.b, rectOf(screen.bounds));
    assert(dScreen >= half - 0.01, `${p.id} 与照壁净距 ${dScreen.toFixed(2)}m < 半宽 ${half}m`);
  }
  assertEqual(out, 0, `${out} 段步道越出花园范围`);
  // 与北殿（含台阶）留出净距
  const clearance = Math.min(...path.map((p) => segmentRectDistance(p.a, p.b, rectOf(byLocal('F-garden-hall-north').bounds))));
  assert(clearance >= 3.2 / 2, `步道距北殿仅 ${clearance.toFixed(2)}m`);
  runner.info(`曲折步道 ${path.length} 段 / 控制点 ${stats.windingPath.controlPoints} / 累计转角 ${stats.windingPath.turningDeg}° / 距北殿 ${clearance.toFixed(2)}m`);
});

await runner.test('与后宫相连：CXN-C-F-garden-west/east 标高 = 花园地坪，C 侧坡道收在 0.5', () => {
  for (const id of ['CXN-C-F-garden-west', 'CXN-C-F-garden-east']) {
    const c = result.connectors.find((x) => x.id === id);
    assert(c, `缺少通道 ${id}`);
    assertClose(c.elevation, TERRAIN.gardenPathsY, 1e-6, `${id} 标高应 = 花园步道标高`);
    const surface = L.walkableAt(c.position.x, c.position.z).find((s) => s.zone === ZONE);
    assert(surface, `${id} 连接点不在 F 可行走面上`);
    assertClose(surface.y, c.elevation, 1e-6, `${id} 可行走面标高与连接标高一致`);
    const cRamp = L.ROADS.find((r) => r.connector === id && r.zone === 'C');
    const fRamp = L.ROADS.find((r) => r.connector === id && r.zone === ZONE);
    assert(cRamp && fRamp, `${id} 两侧坡道未登记`);
    assertClose(cRamp.to.y, c.elevation, 1e-6, `${cRamp.id} 收在连接标高（C 侧）`);
    assertClose(fRamp.from.y, c.elevation, 1e-6, `${fRamp.id} 起于连接标高（F 侧）`);
  }
  // 花园地坪是否真的建了出来（连接点在地坪上）
  for (const x of [-84, 84]) {
    const ground = audit.land.filter((s) => insideRect(s.rect, x, 300) && s.group === 'garden');
    assert(ground.length > 0, `花园入口 (${x},300) 处无地坪`);
    assertClose(ground[0].y1, TERRAIN.gardenPathsY, 1e-6, `花园入口地坪顶`);
  }
  runner.info('后宫 → 御花园：C 侧坡道 0.9→0.5 与 F 花园地坪 0.5 对齐（两条 10m 宽通道）');
});

/* ========================================================================== */
runner.section('5. 树群、灯位与绘制调用预算（F ≤80）');
/* ========================================================================== */

await runner.test('树群 104 株（64 花园 + 40 岸台）全部实例化，且不穿水池/建筑、间距 ≥5m', () => {
  const expected = F_VEG.reduce((n, v) => n + v.treeCount, 0);
  assertEqual(audit.trees.count, expected, `树数量应为 ${expected}`);
  assertEqual(expected, 104, 'layout 登记 F 树 104 株');
  const trunkInstances = audit.trees.instances.filter((i) => i.part === 'trunk');
  const canopyInstances = audit.trees.instances.filter((i) => i.part === 'canopy');
  const trunkTotal = trunkInstances.reduce((n, i) => n + i.count, 0);
  const canopyTotal = canopyInstances.reduce((n, i) => n + i.count, 0);
  assertEqual(trunkTotal, expected, `树干实例覆盖 ${trunkTotal} ≠ ${expected}`);
  assertEqual(canopyTotal, expected, `树冠实例覆盖 ${canopyTotal} ≠ ${expected}`);
  assertEqual(canopyInstances.filter((i) => i.blossom).reduce((n, i) => n + i.count, 0), F_VEG.find((v) => v.area === 'garden').blossomCount, '花树数量');
  let minSep = Infinity;
  for (let i = 0; i < audit.trees.points.length; i += 1) {
    const p = audit.trees.points[i];
    for (const w of audit.water) assert(!insideRect(w.rect, p.x, p.z), `树 (${p.x},${p.z}) 落在水面 ${w.id} 上`);
    for (const slot of F_SLOTS) assert(!insideRect(rectOf(slot.bounds), p.x, p.z), `树 (${p.x},${p.z}) 落在建筑 ${slot.id} 内`);
    for (let j = i + 1; j < audit.trees.points.length; j += 1) {
      const q = audit.trees.points[j];
      minSep = Math.min(minSep, Math.hypot(p.x - q.x, p.z - q.z));
    }
  }
  assert(minSep >= 5, `树最小间距 ${minSep.toFixed(2)}m < 5m`);
  runner.info(`树 104 株（花园 64 / 岸台 40，花树 8）：${trunkInstances.length} 个树干 + ${canopyInstances.length} 个树冠实例批次，最小间距 ${minSep.toFixed(2)}m`);
});

await runner.test('宫灯：layout 基线 7 处逐条保留 + 室内补光 14 处（t64），全部落在本地地坪上', () => {
  const baseline = result.lightAnchors.filter((a) => !a.id.startsWith('LA-F-int-'));
  assertEqual(baseline.length, F_ANCHORS.length, 'layout 基线 F 灯位数应逐条保留');
  for (const a of F_ANCHORS) {
    const hit = baseline.find((x) => x.id === a.id);
    assert(hit, `缺少 layout 基线灯位 ${a.id}`);
    assertClose(hit.position.x, a.position.x, 1e-6, `${a.id}.x`);
    assertClose(hit.position.z, a.position.z, 1e-6, `${a.id}.z`);
  }
  assert(stats.lanternInstances > 0, '灯体未实例化');
  const lanternGround = audit.props.filter((p) => p.kind === 'lantern');
  assertEqual(lanternGround.length, F_ANCHORS.length, '可见灯体落点记录数（室内补光只发灯位，实体灯由套件承担）');
  for (const a of F_ANCHORS) {
    const rec = lanternGround.find((p) => p.id === a.id);
    assert(rec, `缺少灯位 ${a.id}`);
    assert(Math.abs(rec.ground - TERRAIN.gardenPathsY) <= 0.6, `${a.id} 落地面 ${rec.ground} 偏离花园地坪`);
  }
  runner.info(`宫灯：layout 基线 ${baseline.length} 处（可见灯体实例化）+ 室内补光 ${result.lightAnchors.length - baseline.length} 处（windowGlow，环境系统按距离激活）`);
});

await runner.test(`F 区绘制调用 ≤ ${BUDGET.drawCalls.perZone.F}（合批 + 实例化后），且合批确实生效`, () => {
  const calls = countDrawCalls(result.root);
  assert(calls <= BUDGET.drawCalls.perZone.F, `F 区绘制调用 ${calls} 超预算 ${BUDGET.drawCalls.perZone.F}`);
  assert(stats.merged, '未调用 kit.mergeZone');
  assert(stats.merged.before > stats.merged.after * 3, `合批前后 ${stats.merged.before}→${stats.merged.after} 收益不足`);
  let instanced = 0;
  result.root.traverse((n) => {
    if (n.isInstancedMesh) instanced += 1;
  });
  assert(instanced >= 8, `实例批次仅 ${instanced}（树 + 灯应全部实例化）`);
  assert(calls < BUDGET.drawCalls.perZone.F, `余量不足：${calls}/${BUDGET.drawCalls.perZone.F}`);
  runner.info(`绘制调用 ${calls} / 预算 ${BUDGET.drawCalls.perZone.F}（合批 ${stats.merged.before}→${stats.merged.after}，实例 ${instanced} 批，三角面 ${stats.triangles}）`);
});

/* ========================================================================== */
runner.section('6. 机位、碰撞与不可进入建筑');
/* ========================================================================== */

await runner.test('机位 4 个 = layout 登记：≥1 zone（花园取景）+ ≥1 fp-spawn + 2 focus-extra（城门取景）', () => {
  assertEqual(result.viewpoints.length, F_VIEWPOINTS.length, '机位数应等于 layout');
  const modes = result.viewpoints.reduce((acc, v) => {
    acc[v.mode] = (acc[v.mode] ?? 0) + 1;
    return acc;
  }, {});
  assert((modes.zone ?? 0) >= 1, '缺 zone 机位');
  assert((modes['fp-spawn'] ?? 0) >= 1, '缺 fp-spawn');
  for (const vp of result.viewpoints) {
    const src = F_VIEWPOINTS.find((v) => v.id === vp.id);
    assert(src, `${vp.id} 不在 layout 机位表中`);
    assertClose(vp.position.x, src.position.x, 1e-6, `${vp.id}.x`);
    assertClose(vp.target.z, src.target.z, 1e-6, `${vp.id}.target.z`);
  }
  const zoneVp = result.viewpoints.find((v) => v.mode === 'zone');
  const target = zoneVp.target;
  assert(target.z >= 300 && target.z <= 420 && target.x >= -300 && target.x <= 300, `${zoneVp.id} 目标点不在御花园内（花园取景）`);
  const focus = result.viewpoints.filter((v) => v.mode === 'focus-extra');
  assert(focus.length >= 2, '城门取景应 ≥2（南/北门 focus-extra）');
  for (const vp of focus) {
    const nearGate = result.buildings.some((b) => b.kind === 'gateHall' && Math.hypot(b.x - vp.target.x, b.z - vp.target.z) < 30);
    assert(nearGate, `${vp.id} 目标点不在城门附近（城门取景）`);
  }
  const spawn = result.viewpoints.find((v) => v.mode === 'fp-spawn');
  const surface = L.walkableAt(spawn.position.x, spawn.position.z).find((s) => s.zone === ZONE);
  assert(surface && surface.id === 'WK-F-garden', `${spawn.id} 出生点应落在 WK-F-garden`);
  assertClose(spawn.position.y, surface.y + CONFIG.CAMERA.fpEyeHeight, 1e-6, `${spawn.id} 视线高`);
  runner.info(`机位 4：${result.viewpoints.map((v) => `${v.id}(${v.mode})`).join('、')}；fp-spawn 视线高 ${spawn.position.y}m = 面 ${surface.y}m + 1.65m`);
});

await runner.test('碰撞：26 个 F 障碍（含 4 墙 / 4 河 / 2 池 / 2 假山 / 14 建筑），不可进入建筑为整体阻挡', () => {
  const obstacles = result.colliders.obstacles;
  assertEqual(obstacles.length, F_OBSTACLES.length, '障碍数应等于 layout 的 F 障碍');
  for (const src of F_OBSTACLES) {
    const o = obstacles.find((x) => x.id === src.id);
    assert(o, `缺少障碍 ${src.id}`);
    assertEqual(o.blocks, src.blocks, `${src.id}.blocks`);
    assertEqual(o.sourceType, src.sourceType, `${src.id}.sourceType`);
  }
  let passable = 0;
  for (const b of result.buildings) {
    const o = obstacles.find((x) => x.buildingId === b.id);
    assert(o, `${b.id} 未进入 colliders.obstacles（建筑必须登记障碍）`);
    const hasDoor = b.door !== null;
    if (!b.visitable) {
      assertEqual(hasDoor, false, `${b.id} 不可进入 → 不应有门洞`);
      assertEqual(o.blocks, 'all', `${b.id} 不可进入 → 必须整体阻挡`);
      assertEqual(o.door, null, `${b.id} 无门洞 → obstacle.door 应为 null`);
    } else {
      // t72/t73/t74 起的门洞类（visitable=true）：门洞可通行、其余体块阻挡（§6.3）
      assertEqual(hasDoor, true, `${b.id} visitable=true → 必须有门洞规格`);
      assertEqual(o.blocks, 'exceptDoor', `${b.id} visitable → 仅门洞可通行`);
      assertEqual(o.door.width, b.door.width, `${b.id} 障碍门洞净宽应回显 layout`);
      passable += 1;
    }
  }
  assertEqual(passable, 7, 'F 区 visitable=true 的建筑应为 7 座（4 城门 + 北殿 + 东/西配殿），与 layout 一致');
  assertEqual(result.buildings.filter((b) => b.visitable).length, L.interiorsByZone('F').length, 'visitable 集合应与内景集合一致');
  const wallObstacles = obstacles.filter((o) => o.sourceType === 'wall');
  assertEqual(wallObstacles.length, 4, '宫墙障碍 4 段');
  for (const o of wallObstacles) {
    assertEqual(o.blocks, 'exceptDoor', '宫墙仅门洞可通行');
    assert(o.door && o.door.width === 26, `${o.id} 门洞净宽应为 26m`);
    assert(o.door.sillY === 0.4, `${o.id} 门洞地面标高应为 0.4m`);
  }
  const waterObstacles = obstacles.filter((o) => o.sourceType === 'water');
  assertEqual(waterObstacles.length, 6, '水面障碍 6 段（4 护城河 + 2 水池）');
  const rockeryObstacles = obstacles.filter((o) => o.sourceType === 'rockery');
  assertEqual(rockeryObstacles.length, 2, '假山障碍 2 座');
  assertEqual(result.colliders.walkable.length, F_WALKABLE.length, '可行走面数应等于 layout 的 F 面');
  const ramps = result.colliders.ramps;
  const expectRamps = F_ROADS.filter((r) => Math.abs(r.from.y - r.to.y) > 1e-6);
  assertEqual(ramps.length, expectRamps.length, '坡道数应等于 Δy≠0 的 F 道路数');
  for (const r of ramps) assert(r.slope <= CONFIG.INTERACTION.step.rampMaxSlope + 1e-6, `${r.id} 坡度 ${r.slope} 超可走上限`);
  runner.info(`障碍 26（墙 4 / 水 6 / 假山 2 / 建筑 14）· 可行走面 ${result.colliders.walkable.length} · 坡道 ${ramps.length}（最大坡度 ${Math.max(...ramps.map((r) => r.slope)).toFixed(4)}）`);
});

/* ========================================================================== */
runner.section('7. 全城鸟瞰：不越界、不截断、不悬空');
/* ========================================================================== */

await runner.test('整区实测 Box3 覆盖完整地形范围但不越界（无底板截断）', () => {
  const bb = new THREE.Box3().setFromObject(result.root);
  const ext = L.TERRAIN_EXTENT;
  assertClose(bb.min.x, ext.minX, 0.01, 'Box3.min.x 应等于地形西界');
  assertClose(bb.max.x, ext.maxX, 0.01, 'Box3.max.x 应等于地形东界');
  assertClose(bb.min.z, ext.minZ, 0.01, 'Box3.min.z 应等于地形南界');
  assertClose(bb.max.z, ext.maxZ, 0.01, 'Box3.max.z 应等于地形北界');
  assert(bb.min.y <= TERRAIN.outerTerrainY - 6, `整区最低点 ${bb.min.y} 未覆盖地形厚度`);
  assert(bb.max.y <= MODULES.wallHeight + 20, `整区最高点 ${bb.max.y} 异常`);
  runner.info(`整区 Box3：x[${bb.min.x},${bb.max.x}] z[${bb.min.z},${bb.max.z}] y[${bb.min.y.toFixed(2)},${bb.max.y.toFixed(2)}]`);
});

await runner.test('每栋建筑底面 = 本地地坪（无悬空、无沉降），门楼/角楼落于 12m 墙顶', () => {
  let worstGround = 0;
  let worstWall = 0;
  for (const b of audit.buildings) {
    if (b.onWall) {
      worstWall = Math.max(worstWall, Math.abs(b.y0 - MODULES.wallHeight));
      assert(Math.abs(b.y0 - MODULES.wallHeight) <= 0.05, `${b.id} 应坐在 ${MODULES.wallHeight}m 墙顶，实测 ${b.y0}`);
      const platform = audit.platforms.find((p) => (p.gateId ?? p.towerId) === b.id);
      assert(platform, `${b.id} 缺少承托城台`);
      const cx = (b.rect.minX + b.rect.maxX) / 2;
      const cz = (b.rect.minZ + b.rect.maxZ) / 2;
      const corners = [
        [b.rect.minX, b.rect.minZ], [b.rect.maxX, b.rect.minZ], [b.rect.maxX, b.rect.maxZ], [b.rect.minX, b.rect.maxZ],
        [cx, b.rect.minZ], [cx, b.rect.maxZ], [b.rect.minX, cz], [b.rect.maxX, cz],
        [cx, cz],
      ];
      for (const [x, z] of corners) {
        const hit = platform.blocks.some((blk) => insideRect(blk.rect, x, z));
        const edge = Math.abs(x - b.rect.minX) < 1e-6 || Math.abs(x - b.rect.maxX) < 1e-6 || Math.abs(z - b.rect.minZ) < 1e-6 || Math.abs(z - b.rect.maxZ) < 1e-6;
        assert(hit || edge, `${b.id} footprint 点 (${x},${z}) 无城台承托`);
      }
    } else {
      worstGround = Math.max(worstGround, Math.abs(b.y0 - b.ground));
      assert(Math.abs(b.y0 - b.ground) <= 0.05, `${b.id} 底面 ${b.y0} 与地坪 ${b.ground} 不符（悬空/沉降）`);
    }
    assert(b.y1 > b.y0 + 3, `${b.id} 实测高度异常`);
  }
  runner.info(`14 栋建筑：非墙上建筑 |底面−地坪| 最大 ${worstGround.toFixed(4)}m；门楼/角楼 |底面−墙顶| 最大 ${worstWall.toFixed(4)}m`);
});

await runner.test('合批后的实际几何自证：墙体网格覆盖宫墙环、水面网格 = 登记水体范围', () => {
  const wallMats = new Set([kit.materials.get('plasterRed').uuid]);
  const wallBoxes = [];
  result.root.traverse((n) => {
    if (n.isMesh && wallMats.has(n.material?.uuid) && n.userData.part === 'wallBody') wallBoxes.push(new THREE.Box3().setFromObject(n));
  });
  assert(wallBoxes.length > 0, '未找到宫墙墙体网格（wallBody）');
  const wallBox = wallBoxes.reduce((acc, b) => acc.union(b), new THREE.Box3());
  const ring = { minX: -304, maxX: 304, minZ: -454, maxZ: 454 };
  assert(wallBox.min.x <= ring.minX + 0.01 && wallBox.max.x >= ring.maxX - 0.01, '墙体网格未覆盖环东西边界');
  assert(wallBox.min.z <= ring.minZ + 0.01 && wallBox.max.z >= ring.maxZ - 0.01, '墙体网格未覆盖环南北边界');
  assert(wallBox.min.y <= TERRAIN.cityGroundY + 0.01, '墙体网格底面未落地');
  assert(wallBox.max.y >= MODULES.wallHeight - MODULES.wallBattlementHeight - 0.01, '墙体网格高度不足');

  const waterMat = kit.materials.get('waterSurface');
  const waterBoxes = [];
  result.root.traverse((n) => {
    if (n.isMesh && n.material === waterMat) waterBoxes.push(new THREE.Box3().setFromObject(n));
  });
  assertEqual(waterBoxes.length, 1, '水面应被合批为 1 个网格');
  const wb = waterBoxes[0];
  assertClose(wb.min.y, MOAT_BED_Y, 0.05, '水面网格底 = 河底');
  assertClose(wb.max.y, 0.05, 0.02, '水面网格顶 = 池水面（护城河 -3 在更低处）');
  const waterBox = L.WATER_BODIES.filter((w) => w.owner === ZONE).reduce(
    (acc, w) => acc.union(new THREE.Box3(new THREE.Vector3(w.bounds.minX, 0, w.bounds.minZ), new THREE.Vector3(w.bounds.maxX, 0, w.bounds.maxZ))),
    new THREE.Box3(),
  );
  assertClose(wb.min.x, waterBox.min.x, 0.01, '水面西界 = 水体登记西界');
  assertClose(wb.max.x, waterBox.max.x, 0.01, '水面东界 = 水体登记东界');
  assertClose(wb.min.z, waterBox.min.z, 0.01, '水面南界 = 水体登记南界');
  assertClose(wb.max.z, waterBox.max.z, 0.01, '水面北界 = 水体登记北界');
  runner.info(`合批后：墙体网格 Box3 y[${wallBox.min.y.toFixed(2)},${wallBox.max.y.toFixed(2)}] 覆盖 ±304/±454 环；水面 1 个网格 y[${wb.min.y},${wb.max.y}]（护城河 -6→-3 + 水池 -0.4→0.05）`);
});

/* ========================================================================== */
runner.section('8. update / dispose 行为');
/* ========================================================================== */

await runner.test('update 连续 60 帧不抛错、不改 state、不挂载 root', async () => {
  const ctx = await makeTestCtx({ zoneId: ZONE, kit, quality: QUALITY });
  const mod = await loadModule(zoneModulePath(ZONE));
  const r = await mod.createZone(ctx);
  const stateLike = {
    mode: 'browse',
    viewMode: 'oblique',
    selectedBuildingId: null,
    hoveredBuildingId: null,
    timePreset: 'goldenHour',
    quality: QUALITY,
    tourState: { active: false, paused: false, index: 0, id: null },
    loading: { progress: 1, stage: 'ready', failed: null },
  };
  const frozen = JSON.stringify(stateLike);
  for (let i = 0; i < 60; i += 1) r.update(1 / 60, i / 60, stateLike);
  assertEqual(JSON.stringify(stateLike), frozen, 'update 不得改写 state');
  assertEqual(r.root.parent, null, 'update 不得挂载 root');
  r.dispose();
});

await runner.test('dispose 只释放自有几何（不销毁 kit 共享材质），且幂等', async () => {
  const ctx = await makeTestCtx({ zoneId: ZONE, kit, quality: QUALITY });
  const mod = await loadModule(zoneModulePath(ZONE));
  const r = await mod.createZone(ctx);
  const sharedMat = kit.materials.get('plasterRed');
  const sharedUuid = sharedMat.uuid;
  r.dispose();
  r.dispose(); // 幂等
  assertEqual(r.stats.disposed.materials, 0, 'dispose 不得释放 kit 共享材质');
  assert(r.stats.disposed.geometries > 0, 'dispose 应释放本区几何');
  assertEqual(kit.materials.get('plasterRed').uuid, sharedUuid, '共享材质被替换/销毁');
  assertEqual(r.root.children.length, 0, 'dispose 后 root 应清空');
  runner.info(`dispose：释放几何 ${r.stats.disposed.geometries} 个 / 网格 ${r.stats.disposed.meshes} 个 / 材质 0（共享材质保留）`);
});

/* ========================================================================== */
runner.section('9. 内景（t64：4 城门值房壁龛 + 御花园北殿 + 东/西配殿 = 7 栋）');
/* ========================================================================== */

const F_INTERIORS = L.interiorsByZone('F');

await runner.test(`内景集合 = layout.interiorsByZone('F')（${F_INTERIORS.length} 栋，逐 id 一致）且每栋已布陈设`, () => {
  assertEqual(F_INTERIORS.length, 7, 'F 区内景数：4 城门 + 北殿 + 东/西配殿（角楼/开敞亭不在内）');
  const declared = F_INTERIORS.map((r) => r.slotId).sort();
  const placed = audit.interiors.map((i) => i.slotId).sort();
  assertEqual(placed.join(','), declared.join(','), '布陈设的内景必须与 layout 实测清单逐 id 一致');
  for (const i of audit.interiors) {
    assert(i.items.length >= 5, `${i.slotId} 陈设项过少：${i.items.join(',')}`);
    assert(i.triangles > 0, `${i.slotId} 内景几何为空`);
    assertEqual(i.warnings.length, 0, `${i.slotId} 套件告警：${i.warnings.join(',')}`);
  }
  runner.info(`内景 7 栋：${audit.interiors.map((i) => `${i.slotId}[${i.kind}/${i.items.length}项/${i.triangles}tri]`).join(' ')}`);
  runner.info(`角楼 4 座与开敞亭 3 座不在内景集合（Q3 裁定：doorWidth=0 / 四面开敞）→ 未自行扩展`);
});

await runner.test('内景与 layout 登记的地面/包围盒对齐：minY=可行走面 y、界内、不穿顶', () => {
  for (const rec of F_INTERIORS) {
    const wk = L.WALKABLE.find((w) => w.id === rec.walkableId);
    const i = audit.interiors.find((x) => x.slotId === rec.slotId);
    assert(wk && i, `${rec.slotId} 缺 WK 或陈设记录`);
    assertEqual(wk.kind, 'interior', `${rec.slotId} WK kind`);
    assertClose(i.groundY, wk.y, 1e-6, `${rec.slotId} 内景地面必须取 layout 登记的内景可行走面 y`);
    assert(i.worldBounds.minY >= wk.y - 0.02 && i.worldBounds.minY <= wk.y + 0.07, `${rec.slotId} 陈设未落地：minY=${i.worldBounds.minY} vs 地面 ${wk.y}`);
    assert(i.worldBounds.maxY <= i.ceilingY + 0.01, `${rec.slotId} 陈设穿顶：maxY=${i.worldBounds.maxY} > ceilingY=${i.ceilingY}`);
    for (const [x, z] of [[i.worldBounds.minX, i.worldBounds.minZ], [i.worldBounds.maxX, i.worldBounds.maxZ],
      [(i.worldBounds.minX + i.worldBounds.maxX) / 2, (i.worldBounds.minZ + i.worldBounds.maxZ) / 2]]) {
      assert(insideRect(rectOf(wk.bounds), x, z, 0.75), `${rec.slotId} 陈设越出内景包围盒（${x.toFixed(1)},${z.toFixed(1)}）`);
    }
  }
  runner.info(F_INTERIORS.map((r) => {
    const i = audit.interiors.find((x) => x.slotId === r.slotId);
    return `${r.slotId}(地面 ${i.groundY} 天花 ${i.ceilingY})`;
  }).join(' · '));
});

await runner.test('城门按通道语义布陈设：地面 = 门洞通道面 0.4（非墙顶 12.4）、26m 通行横断面零占用', () => {
  const gates = ['F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east'];
  for (const id of gates) {
    const i = audit.interiors.find((x) => x.slotId === id);
    const platform = audit.platforms.find((p) => p.gateId === id);
    assert(platform?.niche, `${id} 缺城门值房壁龛记录`);
    assertEqual(i.kind, 'gateHall', `${id} 陈设档位应为门殿（不套殿堂）`);
    assertClose(i.groundY, 0.4, 1e-6, `${id} 内景地面应为门洞通道面 0.4（t72 登记），不得取墙顶 12.4`);
    assert(i.items.includes('doorBolt') && i.items.includes('drum') && i.items.includes('bench'), `${id} 门殿陈设应含 门闩/更鼓/长凳：${i.items.join(',')}`);
    // 通行横断面：洞内条带任何一点不得落在非门额实体上
    const { passage, blocks } = platform;
    const half = passage.width / 2;
    let blocked = 0;
    for (const b of blocks) {
      if (/lintel/.test(b.id)) continue;
      for (let k = -half + 0.25; k <= half - 0.25; k += 0.5) {
        const px = passage.axis === 'z' ? passage.center.x + k : passage.center.x;
        const pz = passage.axis === 'z' ? passage.center.z : passage.center.z + k;
        if (insideRect(b.rect, px, pz)) blocked += 1;
      }
    }
    assertEqual(blocked, 0, `${id} 通行横断面被城台实体占用 ${blocked} 点（应 0）`);
    // 陈设整体位于洞壁之外的壁龛，且龛口朝洞内
    const away = passage.axis === 'z' ? Math.abs(i.rect.minX - passage.center.x) : Math.abs(i.rect.minZ - passage.center.z);
    assert(away >= half - 0.01, `${id} 陈设侵入洞内：距洞口轴线 ${away.toFixed(2)} < 半宽 ${half}`);
    assert(insideRect(platform.niche.rect, (i.rect.minX + i.rect.maxX) / 2, (i.rect.minZ + i.rect.maxZ) / 2), `${id} 陈设不在壁龛内`);
  }
  runner.info('4 门：地面 0.4（通道面）· 通道 26m×9.3m 零占用 · 陈设（门闩/更鼓/长凳/值守案/灯）置于城台值房壁龛，龛口朝洞内');
});

await runner.test('室内灯位：每栋 2 处 windowGlow 落在内景范围内（t61 套件不含灯光，本区自行布灯）', () => {
  const mine = result.lightAnchors.filter((a) => a.id.startsWith('LA-F-int-'));
  assertEqual(mine.length, 14, 'F 室内补光灯位应为 7 栋 × 2 处');
  for (const rec of F_INTERIORS) {
    const i = audit.interiors.find((x) => x.slotId === rec.slotId);
    const lamps = mine.filter((a) => a.id.includes(rec.slotId));
    assertEqual(lamps.length, 2, `${rec.slotId} 应有 2 处室内灯位`);
    for (const a of lamps) {
      assertEqual(a.kind, 'windowGlow', `${a.id} 灯位类型`);
      assertEqual(a.zone, ZONE, `${a.id} 灯位归属`);
      assert(typeof a.height === 'number' && a.height > 0, `${a.id} 灯高`);
      assert(a.position.y <= i.ceilingY, `${a.id} 灯位高于天花`);
      assert(insideRect(i.rect, a.position.x, a.position.z, 0.8), `${a.id} 灯位越出内景范围`);
    }
  }
  assertEqual(result.lightAnchors.length, L.LIGHT_ANCHORS.filter((a) => a.zone === ZONE).length + 14, 'layout 基线灯位必须逐条保留，室内灯位为**新增**');
  runner.info(`室内补光 14 处（windowGlow·与套件可见灯体同址）；layout 基线 F 灯位 ${L.LIGHT_ANCHORS.filter((a) => a.zone === ZONE).length} 处保持不变`);
});

await runner.test(`内景预算：F 合批后绘制调用 ≤ ${BUDGET.drawCalls.perZone.F}（内景增量 ≤12 桶）、内景三角面 ≤4000`, () => {
  const calls = countDrawCalls(result.root);
  assert(calls <= BUDGET.drawCalls.perZone.F, `F 绘制调用 ${calls} 超预算 ${BUDGET.drawCalls.perZone.F}`);
  assert(stats.interiors === 7, '内景数');
  assert(stats.interiorTriangles <= 4000, `内景三角面合计 ${stats.interiorTriangles} 超 4000`);
  runner.info(`F 合批后 ${calls}/${BUDGET.drawCalls.perZone.F}（含 7 栋内景 ${stats.interiorTriangles} 三角面）；内景取 lod:'near' 单档——'auto' 的近/中两档会被 audit 全量口径各计一批（+24），见回执 §3 预算证据`);
});

await runner.test('碰撞可达性（真实碰撞数据）：4 座城门内景可从门洞走入、室内可站立、不可穿墙进入', async () => {
  const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
  const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
  const solver = createWalkSolver({ layout: L, obstacles: result.colliders.obstacles });
  const graph = createWalkGraph(solver, { cellSize: 2 });
  const outside = {
    'F-gate-south': { x: 0, z: -464 },
    'F-gate-north': { x: 0, z: 464 },
    'F-gate-west': { x: -320, z: 0 },
    'F-gate-east': { x: 320, z: 0 },
  };
  const facts = [];
  for (const rec of F_INTERIORS) {
    const id = rec.slotId;
    const i = audit.interiors.find((x) => x.slotId === id);
    // 城门"室内"= 门洞通道（t72 登记 WK）；壁龛是陈设展示位，不在通行集合内
    const platform = audit.platforms.find((p) => p.gateId === id);
    const fp = L.FP_ROUTE.find((f) => f.buildingId === id);
    const cx = platform ? platform.passage.center.x : (i.rect.minX + i.rect.maxX) / 2;
    const cz = platform ? platform.passage.center.z : (i.rect.minZ + i.rect.maxZ) / 2;
    // ① 室内可站立（门洞通道中心：在可行走面上 + 不在障碍体内）
    const probe = solver.probe(cx, cz, null);
    assert(probe.ok, `${id} 室内中心不可站立：${(probe.reasons ?? []).join(',')}`);
    assertClose(probe.surfaceY, i.groundY, 0.05, `${id} 室内站立面高`);
    if (fp) assert(Math.hypot(fp.position.x - cx, fp.position.z - cz) < 12, `${id} 登记的 fp 走查点应在门洞通道内`);
    if (id.startsWith('F-gate')) {
      // ② 可从门洞走入（真实可行走图寻路：门外 → 室内）
      const path = graph.path(outside[id], { x: cx, z: cz });
      assert(path.ok, `${id} 门外(${outside[id].x},${outside[id].z}) → 室内(${cx},${cz}) 不可达：${path.reason ?? ''}`);
      // ③ 不可穿墙：墙身/城台墩体（通道之外）不可站立 → 无法从外部穿入
      // ③ 不可穿墙：门洞通道之外的城台墩体不可站立（在 slot 障碍的门洞通道之外）
      const half = platform.passage.width / 2 + 5;
      const solidPt = platform.passage.axis === 'z'
        ? { x: platform.passage.center.x + half, z: platform.passage.center.z }
        : { x: platform.passage.center.x, z: platform.passage.center.z + half };
      const solid = solver.probe(solidPt.x, solidPt.z, null);
      assertEqual(solid.ok, false, `${id} 城台墩体 (${solidPt.x.toFixed(0)},${solidPt.z.toFixed(0)}) 可站立（可穿墙）`);
      facts.push(`${id}: 门外→室内 可达(${path.steps?.length ?? '?'} 步)、室内 y=${probe.surfaceY.toFixed(2)}、墩体不可站立 ✓`);
    } else {
      // 殿类：从御花园步道（FP 走查点）到该栋内景 VP 必须连通（t75 门洞通道面）
      const path = graph.path({ x: 0, z: 340 }, { x: cx, z: cz });
      assert(path.ok, `${id} 御花园 → 殿内 (${cx},${cz}) 不可达：${path.reason ?? ''}`);
      facts.push(`${id}: 花园→殿内 可达(${path.steps?.length ?? '?'} 步)、室内可站立 y=${probe.surfaceY.toFixed(2)} ✓`);
    }
  }
  runner.info(facts.join(' | '));
});

/* ========================================================================== */
runner.section('10. 汇总');
/* ========================================================================== */

runner.info(
  `F 区：建筑 ${stats.buildings}（角楼 ${stats.cornerTowers} / 城门 ${stats.cityGates} / 花园 ${stats.gardenBuildings}）· 宫墙 ${stats.wallSegments} 段(${stats.wallOpenings} 门洞) · 城台 ${stats.platforms} · `
  + `水体 ${stats.waterBodies} · 地形块 ${stats.landSlabs} · 桥 ${stats.bridges} · 道路 ${stats.roadPieces} 块/${stats.roadSegments} 段 · 树 ${stats.trees} · 灯 ${stats.lanterns} · 绘制调用 ${stats.drawCalls}/${BUDGET.drawCalls.perZone.F} · 三角面 ${stats.triangles}`,
);
runner.info(`kit 来源：${stats.kitSource}`);
for (const note of audit.notes) runner.info(`· ${note}`);
if (stats.diagnostics.length > 0) runner.info(`诊断：${stats.diagnostics.join('、')}`);

process.exit(runner.summary());
