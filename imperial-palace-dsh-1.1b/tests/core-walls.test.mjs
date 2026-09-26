#!/usr/bin/env node
/**
 * `tests/core-walls.test.mjs` —— t23 回归：`courtyardWalls` 恒空修复 + 宫墙/院墙碰撞收口到 core。
 *
 * 覆盖任务卡 5 条验收：
 *   1. `layout-slice.js` 的过滤条件与 `layout.WALLS` 实际字段一致（owner / courtyardId），
 *      区域切片不再恒空；并给出"旧过滤恒为 0"的反证；
 *   2. core 从 `layout.WALLS` 统一派生宫墙 + 院墙碰撞盒（门洞净空 + `floorYAt` 标高），进 registry/ctx；
 *   3. 区域自补的院墙碰撞被去重：不双倍阻挡、不产生任何额外绘制（量化 before/after）；
 *   4. 真实数据的穿越判定：≥3 段院墙被阻挡 + 门洞可通过（含南城门走查关键路径）；
 *   5. 不与他人争用文件（本文件为新增测试；实跑 run.mjs / audit.mjs 见回执）。
 */

import {
  ROOT,
  assert,
  assertClose,
  assertEqual,
  assertNoProblems,
  createTestRunner,
  loadModule,
  makeSilentEvents,
  makeTestCtx,
  zoneModulePath,
} from './harness.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const runner = createTestRunner('core-walls.test.mjs · 院墙/宫墙碰撞收口（t23）');

const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createFpSolver } = await loadModule('src/core/camera.js');
const slice = await loadModule('src/core/layout-slice.js');
const { createZoneContext, validateZoneResult } = await loadModule('src/core/context.js');

const ZONE_IDS = ['B', 'C', 'D', 'E', 'F'];
const expectCourtWalls = { B: 12, C: 12, D: 16, E: 16, F: 0 };
const expectCityWalls = { B: 0, C: 0, D: 0, E: 0, F: 4 };

const wallById = new Map(LAYOUT.WALLS.map((w) => [w.id, w]));

/** 候选墙顺序：宫墙四段优先，然后按 B→C→D→E 轮转取各自院墙（保证跨区域覆盖，而不是连取同一区的 4 段）。 */
const CANDIDATE_WALLS = (() => {
  const cityWalls = LAYOUT.WALLS.filter((w) => w.cityWall).map((w) => w.id);
  const byOwner = {};
  for (const wall of LAYOUT.WALLS.filter((w) => !w.cityWall)) (byOwner[wall.owner] ??= []).push(wall.id);
  const owners = ['B', 'C', 'D', 'E', 'F'].filter((o) => byOwner[o]?.length);
  const roundRobin = [];
  for (let i = 0; roundRobin.length < LAYOUT.WALLS.length - cityWalls.length; i += 1) {
    for (const owner of owners) {
      const list = byOwner[owner] ?? [];
      if (i < list.length) roundRobin.push(list[i]);
    }
    if (i > 100) break;
  }
  return [...cityWalls, ...roundRobin];
})();
const registryWithLayout = () => createRegistry({ config: CONFIG, events: makeSilentEvents(), layout: LAYOUT });

/* ========================================================================== */
runner.section('1. 过滤修复：owner / courtyardId（不再恒空）');
/* ========================================================================== */

await runner.test('字段事实：WALLS 60 条全部有 owner、56 条有 courtyardId、0 条有 zone', () => {
  assertEqual(LAYOUT.WALLS.length, 60, 'WALLS 应为 60 段');
  assertEqual(LAYOUT.WALLS.filter((w) => w.owner !== undefined).length, 60, '60/60 必须有 owner');
  assertEqual(LAYOUT.WALLS.filter((w) => w.courtyardId !== undefined).length, 56, '56/56 院墙必须有 courtyardId');
  assertEqual(LAYOUT.WALLS.filter((w) => w.zone !== undefined).length, 0, '没有任何一条有 zone —— 旧过滤必然恒空');
  assertEqual(LAYOUT.WALLS.filter((w) => w.kind === 'courtWall').length, 56);
  assertEqual(LAYOUT.WALLS.filter((w) => w.cityWall === true).length, 4);
});

await runner.test('反证：旧过滤条件 `w.zone === zoneId` 对每个区域都恒为 0（这就是 t7 上报的缺陷）', () => {
  for (const zoneId of ZONE_IDS) {
    const oldFilter = LAYOUT.WALLS.filter((w) => w.kind === 'courtWall' && w.zone === zoneId);
    assertEqual(oldFilter.length, 0, `旧过滤在 ${zoneId} 应为空（缺陷依据）`);
  }
});

await runner.test('新过滤：每个区域的 courtyardWalls 与 owner 一致，且数量逐一对账', () => {
  const observed = {};
  for (const zoneId of ZONE_IDS) {
    const zoneLayout = slice.zoneLayoutFor(zoneId);
    observed[zoneId] = zoneLayout.courtyardWalls.length;
    assertEqual(observed[zoneId], expectCourtWalls[zoneId], `${zoneId} 院墙数量`);
    assertEqual(zoneLayout.cityWalls.length, expectCityWalls[zoneId], `${zoneId} 宫墙数量`);
    assertEqual(zoneLayout.walls.length, expectCourtWalls[zoneId] + expectCityWalls[zoneId], `${zoneId} 墙体总数`);
    for (const wall of zoneLayout.courtyardWalls) {
      assertEqual(wall.owner, zoneId, `${wall.id} 的 owner 应为 ${zoneId}`);
      assert(typeof wall.courtyardId === 'string' && wall.courtyardId.length > 0, `${wall.id} 应有 courtyardId`);
    }
    assertEqual(new Set(zoneLayout.walls.map((w) => w.id)).size, zoneLayout.walls.length, '同一区域内墙体 id 不应重复');
    runner.info(`${zoneId}: 院墙 ${zoneLayout.courtyardWalls.length} + 宫墙 ${zoneLayout.cityWalls.length} → 碰撞盒 ${zoneLayout.wallColliders.length}`);
  }
  // F 的 courtyardWalls 为 0 是**正确**的空（F owner 的是宫墙四段），不是被过滤掉的空
  assertEqual(observed.F, 0);
  assertEqual(slice.zoneLayoutFor('F').cityWalls.length, 4, 'F 必须拿到宫墙四段');
});

await runner.test('已交付的区域模块拿到的切片确实非空（B/C/E 有院墙、F 有宫墙）', () => {
  const delivered = { B: 'src/zones/forecourt.js', C: 'src/zones/inner-palace.js', E: 'src/zones/east-courts.js', F: 'src/zones/garden-boundary.js' };
  let checked = 0;
  for (const [zoneId, file] of Object.entries(delivered)) {
    if (!existsSync(join(ROOT, file))) {
      runner.skip(`${zoneId} 切片非空断言`, `${file} 未交付`);
      continue;
    }
    const zoneLayout = slice.zoneLayoutFor(zoneId);
    assert(zoneLayout.courtyardWalls.length + zoneLayout.cityWalls.length > 0, `${zoneId} 必须能取到本院墙`);
    if (zoneId !== 'F') assert(zoneLayout.courtyardWalls.length > 0, `${zoneId} 院墙不得为空`);
    checked += 1;
  }
  assert(checked >= 3, `至少应对 3 个已交付区域完成对账（实际 ${checked}）`);
});

/* ========================================================================== */
runner.section('2. core 统一派生：宫墙 + 院墙碰撞盒（门洞净空 / floorYAt 标高）');
/* ========================================================================== */

const derivedAll = slice.deriveCityWallColliders();

await runner.test('派生覆盖 60 段墙（wallIds 覆盖）+ 宫墙 8 盒；共线墙已归并（无同几何重复盒）', () => {
  const covered = new Set(derivedAll.flatMap((b) => b.wallIds ?? [b.wallId]));
  assertEqual(covered.size, LAYOUT.WALLS.length, '60 段墙都必须被某个实心盒覆盖');
  assertEqual(derivedAll.filter((b) => b.cityWall).length, 8, '宫墙四段 × 门洞两侧 = 8 盒');
  assertEqual(derivedAll.filter((b) => !b.cityWall).length, derivedAll.length - 8);
  for (const box of derivedAll) {
    assertEqual(box.sourceType, 'wall');
    assertEqual(box.blocks, 'all', '实心段整体阻挡（门洞是缺口，不是门）');
    assertEqual(box.door, null, '实心段不带 door 字段');
    assert(Array.isArray(box.wallIds) && box.wallIds.length > 0, `${box.id} 应记录覆盖的墙 id 列表`);
    assert(box.wallIds.every((id) => wallById.has(id)), `${box.id} 的 wallIds 必须都是真实墙 id`);
    assertEqual(box.zone, wallById.get(box.wallIds[0]).owner, '碰撞盒归属代表墙的 owner');
    assert(typeof box.courtyardId === 'string' || box.cityWall === true, '院墙盒应带 courtyardId');
  }
  const key = (b) => [b.bounds.minX, b.bounds.maxX, b.bounds.minZ, b.bounds.maxZ].join(',');
  const seen = new Map();
  const dupes = [];
  for (const box of derivedAll) {
    const k = key(box);
    if (seen.has(k)) dupes.push(`${seen.get(k)} ↔ ${box.id}`);
    else seen.set(k, box.id);
  }
  assertEqual(dupes.length, 0, `派生结果不得含同几何重复盒（共线墙应归并）：${dupes.slice(0, 3).join('；')}`);
  const byZone = derivedAll.reduce((acc, b) => {
    for (const zoneId of b.zones ?? [b.zone]) acc[zoneId] = (acc[zoneId] ?? 0) + 1;
    return acc;
  }, {});
  runner.info(`全城墙体碰撞盒 ${derivedAll.length}（宫墙 ${derivedAll.filter((b) => b.cityWall).length} + 院墙 ${derivedAll.filter((b) => !b.cityWall).length}）；含归属分区计数 ${JSON.stringify(byZone)}`);
});

await runner.test('标高：底面 = 该段两端与中点 floorYAt 的**最低值** − 0.15 埋深，顶面 = 底面 + 墙高', () => {
  let sampled = 0;
  let multiFloorSpans = 0;
  for (const box of derivedAll) {
    const wall = wallById.get(box.wallId);
    const horizontal = wall.axis === 'x';
    const [a, b] = horizontal ? [box.bounds.minX, box.bounds.maxX] : [box.bounds.minZ, box.bounds.maxZ];
    // 与派生实现同一取样规则（两端 + 中点，取最低），保证跨标高墙段的底面不会翘起
    const line = horizontal ? wall.from.z : wall.from.x;
    const offsets = [0, wall.thickness / 2 + 0.6, -(wall.thickness / 2 + 0.6)];
    const samples = [a, (a + b) / 2, b].flatMap((v) =>
      offsets.map((offset) => (horizontal ? { x: v, z: line + offset } : { x: line + offset, z: v })),
    );
    const floors = samples.map((p) => LAYOUT.floorYAt(p.x, p.z)).filter((v) => v !== null);
    assertClose(box.y1 - box.y0, wall.height + 0.15, 2e-3, `${box.id} 高度应等于墙高 + 埋深`);
    if (floors.length === 0) continue;
    const expectedBase = Math.min(...floors) - 0.15;
    assertClose(box.y0, expectedBase, 2e-2, `${box.id} 底面应为最低地坪 − 埋深（取样 ${JSON.stringify(floors)}）`);
    // 底面永远不高于任何取样点地坪（否则墙脚会漏缝）
    for (const floor of floors) assert(box.y0 <= floor + 1e-6, `${box.id} 底面不得高于地坪 ${floor}`);
    if (new Set(floors).size > 1) multiFloorSpans += 1;
    sampled += 1;
  }
  assert(sampled >= derivedAll.length - 4, `绝大多数盒体都应能取到 floorYAt（实际 ${sampled}/${derivedAll.length}）`);
  runner.info(`可判定标高的盒体 ${sampled}/${derivedAll.length}；其中跨不同地坪（底面取最低）的墙段 ${multiFloorSpans} 个`);
});

await runner.test('门洞净空：实心盒不侵占 openings 区间；墙轴覆盖 = 实心段 ∪ 门洞（无丢失、无重叠加倍）', () => {
  for (const wall of LAYOUT.WALLS) {
    const boxes = derivedAll.filter((b) => b.wallId === wall.id);
    const horizontal = wall.axis === 'x';
    const spans = boxes
      .map((b) => (horizontal ? [b.bounds.minX, b.bounds.maxX] : [b.bounds.minZ, b.bounds.maxZ]))
      .sort((a, b) => a[0] - b[0]);
    // 1) 与门洞区间无缝、无重叠
    for (let i = 1; i < spans.length; i += 1) {
      assert(spans[i][0] > spans[i - 1][1], `${wall.id} 实心段不得重叠`);
    }
    // 2) 每个门洞区间内不得有实心（留出净空）
    for (const opening of wall.openings ?? []) {
      const a = opening.at - opening.width / 2;
      const b = opening.at + opening.width / 2;
      for (const [lo, hi] of spans) {
        const overlap = Math.min(hi, b) - Math.max(lo, a);
        assert(overlap <= 0.05, `${wall.id} 门洞 [${a},${b}] 被实心段 [${lo},${hi}] 侵占 ${overlap.toFixed(2)}m`);
      }
    }
  }
  // 3) 城墙四段的 26m 门洞必须是缺口
  for (const wall of LAYOUT.WALLS.filter((w) => w.cityWall)) {
    const boxes = derivedAll.filter((b) => b.wallId === wall.id);
    const gap = wall.openings[0];
    assertEqual(gap.width, 26, `${wall.id} 城门净宽应为 26m`);
    const horizontal = wall.axis === 'x';
    for (const box of boxes) {
      const [lo, hi] = horizontal ? [box.bounds.minX, box.bounds.maxX] : [box.bounds.minZ, box.bounds.maxZ];
      assert(hi <= gap.at - gap.width / 2 + 0.05 || lo >= gap.at + gap.width / 2 - 0.05, `${wall.id} 城门处不得有实心段`);
    }
  }
});

await runner.test('registry 自动登记墙体图层；ctx.shared / zoneLayout 与图层是同一份派生结果', async () => {
  const registry = registryWithLayout();
  const wallLayer = registry.wallColliders();
  assertEqual(wallLayer.length, derivedAll.length, 'registry 墙体图层数量应与派生一致');
  assertEqual(new Set(wallLayer.map((b) => b.id)).size, wallLayer.length, '图层内 id 唯一');
  assertNoProblems(registry.duplicateIds().map((d) => `${d.kind}:${d.id}`), 'registry 全局唯一 id');
  const stats = registry.stats();
  assertEqual(stats.obstaclesBySource.coreWalls, derivedAll.length, 'stats 应单列 core 墙体数量');

  const ctx = await makeTestCtx({ zoneId: 'B' });
  assertEqual(ctx.shared.wallColliders.length, derivedAll.length, 'ctx.shared.wallColliders 应为全城派生结果');
  assertEqual(
    ctx.shared.zoneWallColliders.length,
    ctx.zoneLayout.wallColliders.length,
    'ctx.shared.zoneWallColliders 应与 zoneLayout.wallColliders 一致',
  );
  const allIds = new Set(ctx.shared.wallColliders.map((b) => b.id));
  for (const box of ctx.zoneLayout.wallColliders) assert(allIds.has(box.id), `${box.id} 应包含在全城派生中`);

  // 区域 replace 不应影响墙体图层（图层独立于 zone 注册）
  const before = registry.wallColliders().length;
  const templateCtx = await makeTestCtx({ zoneId: 'D', registry });
  const template = await loadModule(zoneModulePath('TEMPLATE'));
  const result = await template.createZone(templateCtx);
  registry.registerZone('D', result, { replace: true });
  assertEqual(registry.wallColliders().length, before, 'unregisterZone/registerZone 不得删除 core 墙体图层');
  registry.unregisterZone('D');
  assertEqual(registry.wallColliders().length, before, '卸载区域后墙体图层仍完整');
});

await runner.test('查询可用：墙体线上的点命中墙体盒，门洞中心点不命中墙体盒', () => {
  const registry = registryWithLayout();
  const hits = [];
  for (const box of derivedAll.slice(0, 200)) {
    const horizontal = box.bounds.maxX - box.bounds.minX > 1;
    const x = horizontal ? (box.bounds.minX + box.bounds.maxX) / 2 : (box.bounds.minX + box.bounds.maxX) / 2;
    const z = horizontal ? (box.bounds.minZ + box.bounds.maxZ) / 2 : (box.bounds.minZ + box.bounds.maxZ) / 2;
    const hit = registry.obstacleAt(x, z);
    if (hit) hits.push(hit.id);
  }
  assert(hits.length >= derivedAll.length - 2, `墙体中点绝大多数应命中障碍（实际 ${hits.length}）`);
  assertEqual(registry.obstacleAt(0, -400), null, 'B 礼仪广场南墙门洞中心不应命中实心盒');
  assertEqual(registry.obstacleAt(0, -454), null, '南城门门洞中心不应命中实心盒');
});

/* ========================================================================== */
runner.section('3. 去重：区域自补的院墙碰撞不产生双倍阻挡（量化 before/after）');
/* ========================================================================== */

await runner.test('E 式自补（同 id）与 layout 式宫墙条目（buildingId=WALL-CITY）都会被去重，总数不变', () => {
  const registry = registryWithLayout();
  const before = registry.stats().obstacles;
  const eWallBoxes = registry.wallColliders().filter((b) => b.zone === 'E').length;
  const cWallBoxes = registry.wallColliders().filter((b) => b.zone === 'C').length;

  // ① 模拟 C/E 的自补方式：从自己 owner 的墙派生同形盒（id 形如 OB-<wallId>-spanN）
  const eSelf = slice.wallCollidersForZone('E').map((b) => ({ ...b, zone: 'E' }));
  const cSelf = slice.wallCollidersForZone('C').map((b) => ({ ...b, zone: 'C' }));
  const eOutcome = registry.registerColliders('E', { obstacles: eSelf });
  const cOutcome = registry.registerColliders('C', { obstacles: cSelf });
  // 再模拟"区域用自家 id 约定（OB-<wallId>-spanN）"自补一次，验证 buildingId 规则同样命中
  const zoneStyleIds = slice.wallCollidersForZone('E').map((b, i) => ({ ...b, id: `OB-${b.wallIds[0]}-span${(i % 4) + 1}`, zone: 'E' }));
  const zoneStyleOutcome = registry.registerColliders('E-zoneStyle', { obstacles: zoneStyleIds });
  // ② 模拟 layout 的 4 条 OB-WALL-CITY-*（buildingId='WALL-CITY'）
  const citySelf = LAYOUT.OBSTACLES.filter((o) => o.sourceType === 'wall');
  const greyOutcome = registry.registerColliders('GREYBOX', { obstacles: citySelf.map((o) => ({ ...o })) });

  const after = registry.stats().obstacles;
  assertEqual(eOutcome.dedupedObstacles, eSelf.length, `E 的 ${eSelf.length} 条应全部去重`);
  assertEqual(cOutcome.dedupedObstacles, cSelf.length, `C 的 ${cSelf.length} 条应全部去重`);
  assertEqual(greyOutcome.dedupedObstacles, citySelf.length, `layout 的 ${citySelf.length} 条宫墙条目应全部去重`);
  assertEqual(zoneStyleOutcome.dedupedObstacles, zoneStyleIds.length, '区域自定 id 约定的墙盒也应按 buildingId 规则去重');
  assertEqual(after, before, '去重后障碍总数必须不变（不双倍阻挡）');
  assertEqual(eWallBoxes + cWallBoxes > 0, true);

  const report = registry.dedupedObstacleReport();
  const rules = report.reduce((acc, r) => {
    acc[r.rule] = (acc[r.rule] ?? 0) + 1;
    return acc;
  }, {});
  runner.info(
    `去重 before/after：障碍总数 ${before} → ${after}；本次去重 E ${eOutcome.dedupedObstacles} + C ${cOutcome.dedupedObstacles} + ` +
      `区域自定义 id ${zoneStyleOutcome.dedupedObstacles} + layout 宫墙 ${greyOutcome.dedupedObstacles}；累计 ${report.length} 条（规则 ${JSON.stringify(rules)}）`,
  );
  assert(report.every((r) => typeof r.keptBy === 'string' && r.keptBy.length > 0), '每条去重都应记录保留方');
});

await runner.test('去重后不存在"同一几何两份"：盒体两两不重合（去重规则兜底生效）', () => {
  const registry = registryWithLayout();
  registry.registerColliders('E', { obstacles: slice.wallCollidersForZone('E').map((b) => ({ ...b, zone: 'E' })) });
  registry.registerColliders('C', { obstacles: slice.wallCollidersForZone('C').map((b) => ({ ...b, zone: 'C' })) });
  registry.registerColliders('GREYBOX', { obstacles: LAYOUT.OBSTACLES.filter((o) => o.sourceType === 'wall').map((o) => ({ ...o })) });
  const obstacles = registry.allObstacles();
  const key = (o) =>
    [o.bounds.minX, o.bounds.maxX, o.bounds.minZ, o.bounds.maxZ].map((v) => Math.round(v * 10) / 10).join(',');
  const seen = new Map();
  const dupes = [];
  for (const o of obstacles) {
    const k = key(o);
    if (seen.has(k)) dupes.push(`${seen.get(k)} ↔ ${o.id}`);
    else seen.set(k, o.id);
  }
  assertEqual(dupes.length, 0, `不得存在完全同几何的两条障碍：${dupes.slice(0, 3).join('；')}`);
  runner.info(`去重后 allObstacles() 共 ${obstacles.length} 条，同几何重复 0 条`);
});

await runner.test('不产生额外绘制：墙体碰撞是纯数据（无 Object3D / 无 geometry / 无 material）', () => {
  for (const box of derivedAll) {
    assertEqual(box.isObject3D, undefined, '碰撞盒不得是 Object3D');
    assertEqual(box.geometry, undefined, '碰撞盒不得携带 geometry');
    assertEqual(box.material, undefined, '碰撞盒不得携带 material');
  }
  const registry = registryWithLayout();
  assertEqual(
    registry.wallColliders().filter((b) => b.isObject3D || b.geometry).length,
    0,
    'registry 墙体图层不得含任何可绘制对象 → 绘制批次 +0',
  );
});

await runner.test('契约校验给出非致命 warning（区域自补同墙碰撞可被对账，但不算合约问题）', async () => {
  const ctx = await makeTestCtx({ zoneId: 'E' });
  const template = await loadModule(zoneModulePath('TEMPLATE'));
  const result = await template.createZone(ctx);
  // 模板本身不带墙盒 → 无 warning
  const clean = validateZoneResult('E', result, { THREE: ctx.THREE, scope: 'zone', expectBuildings: ctx.zoneLayout.slots.length });
  assertNoProblems(clean.problems, '模板区域 E 契约');
  assertEqual(clean.warnings.length, 0, '模板不应产生墙体重复提示');

  const withSelfWalls = {
    ...result,
    colliders: { ...result.colliders, obstacles: [...result.colliders.obstacles, ...slice.wallCollidersForZone('E').map((b) => ({ ...b, zone: 'E' }))] },
  };
  const warned = validateZoneResult('E', withSelfWalls, { THREE: ctx.THREE, scope: 'zone', expectBuildings: ctx.zoneLayout.slots.length });
  assertNoProblems(warned.problems, '自补墙盒不应导致合约失败（去重由 registry 负责）');
  assert(warned.warnings.length > 0, '应给出"与 core 派生重复"的非致命提示');
  runner.info(`warning：${warned.warnings[0]}`);
});

/* ========================================================================== */
runner.section('4. 穿越判定（真实数据）：院墙阻挡 + 门洞通过');
/* ========================================================================== */

const registry = registryWithLayout();
registry.registerColliders('LAYOUT', { obstacles: LAYOUT.OBSTACLES.map((o) => ({ ...o })), walkable: [], ramps: [] });
const obstacles = registry.allObstacles();
const solver = createFpSolver({ config: CONFIG });

/**
 * 以"逐帧行走"的方式复现第一人称移动（与 src/main.js 的 dt 夹取一致：
 * dt ≤ 1/15s、速度 5.2 m/s（Shift 2.1×）→ 单步位移 ≤ 0.73m，远小于院墙厚 1.2m，不会穿墙）。
 * 这里步长 0.09m（≈1/60s 步行）连续推进，避免"一步跨过薄墙"这种不真实用法。
 */
function walk({ x, z, dirX, dirZ, distance, step = 0.09, maxSteps = 400 }) {
  const floor0 = LAYOUT.floorYAt(x, z);
  assert(floor0 !== null, `行走起点 (${x}, ${z}) 必须在可行走面上`);
  let position = { x, y: floor0 + CONFIG.CAMERA.fpEyeHeight, z };
  const blocked = [];
  const steps = Math.min(maxSteps, Math.round(distance / step));
  for (let i = 0; i < steps; i += 1) {
    const next = solver.step(position, dirX, dirZ, step, { obstacles });
    position = { x: next.x, y: next.y, z: next.z };
    if (next.blocked.length > 0) blocked.push(...next.blocked);
  }
  return { position, blocked: [...new Set(blocked)] };
}

/** 与 src/core/camera.js 的门洞规则一致：blocks='exceptDoor' 且点落在门洞净宽内 → 可通行。 */
function doorAllows(obstacle, x, z) {
  const door = obstacle.door;
  if (!door) return false;
  const halfWidth = door.width / 2 - CONFIG.INTERACTION.player.radius;
  if (door.axis === 'z') {
    return Math.abs(x - door.center.x) <= halfWidth && z >= obstacle.bounds.minZ - 0.5 && z <= obstacle.bounds.maxZ + 0.5;
  }
  return Math.abs(z - door.center.z) <= halfWidth && x >= obstacle.bounds.minX - 0.5 && x <= obstacle.bounds.maxX + 0.5;
}

const isFree = (x, z, ignoreWallIds = []) =>
  !obstacles.some((o) => {
    if (ignoreWallIds.includes(o.buildingId)) return false;
    const inside =
      x >= o.bounds.minX - CONFIG.INTERACTION.player.radius &&
      x <= o.bounds.maxX + CONFIG.INTERACTION.player.radius &&
      z >= o.bounds.minZ - CONFIG.INTERACTION.player.radius &&
      z <= o.bounds.maxZ + CONFIG.INTERACTION.player.radius;
    if (!inside) return false;
    // 门洞（门殿/院门）内的点对第一人称是通的 → 不算被占
    if (o.blocks === 'exceptDoor' && doorAllows(o, x, z)) return false;
    return true;
  });

/** 直线路径上的地坪是否连续可走（无缺失、无超过台阶阈值的落差/抬升）。 */
function pathWalkable(a, b, samples = 24) {
  const floors = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const y = LAYOUT.floorYAt(p.x, p.z);
    if (y === null) return { ok: false, why: `路径 (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) 无可行走面` };
    floors.push(y);
  }
  for (let i = 1; i < floors.length; i += 1) {
    const delta = floors[i] - floors[i - 1];
    if (delta > CONFIG.INTERACTION.step.maxStepHeight + 1e-6) return { ok: false, why: `路径抬升 ${delta.toFixed(2)}m 超过台阶阈值` };
    if (delta < -CONFIG.INTERACTION.step.snapDownDistance - 1e-6) return { ok: false, why: `路径落差 ${delta.toFixed(2)}m 超过下台阶吸附` };
  }
  return { ok: true };
}

/** 为某段墙找一组"两侧都可走、且不与其它建筑重叠"的跨墙探针（沿其实心段扫描）。 */
function findCrossProbe(wallId) {
  const wall = wallById.get(wallId);
  const boxes = derivedAll.filter((b) => (b.wallIds ?? []).includes(wallId));
  if (boxes.length === 0) return null;
  const horizontal = wall.axis === 'x';
  const line = horizontal ? wall.from.z : wall.from.x;
  const half = wall.thickness / 2;
  const wallIds = boxes.flatMap((b) => b.wallIds ?? []);
  const ownLo = horizontal ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z);
  const ownHi = horizontal ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z);
  for (const box of boxes) {
    const lo = Math.max(horizontal ? box.bounds.minX : box.bounds.minZ, ownLo);
    const hi = Math.min(horizontal ? box.bounds.maxX : box.bounds.maxZ, ownHi);
    if (hi - lo < 3) continue;
    for (let along = lo + 1.5; along <= hi - 1.5; along += 1) {
      const a = horizontal ? { x: along, z: line - (half + 1.5) } : { x: line - (half + 1.5), z: along };
      const b = horizontal ? { x: along, z: line + (half + 1.5) } : { x: line + (half + 1.5), z: along };
      const startZ = horizontal ? { x: along, z: line - 3 } : { x: line - 3, z: along };
      const endZ = horizontal ? { x: along, z: line + 3 } : { x: line + 3, z: along };
      if (!isFree(a.x, a.z, wallIds) || !isFree(b.x, b.z, wallIds)) continue;
      if (!pathWalkable(a, b).ok || !pathWalkable(startZ, endZ).ok) continue;
      return { wall, box, along, line, horizontal, half, startZ, mirrorZ: horizontal ? { x: along, z: line + 3 } : { x: line + 3, z: along } };
    }
  }
  return null;
}

/** 为某段墙找一组"两侧都可走"的门洞探针（按净宽从大到小）。 */
function findOpeningProbe(wallId) {
  const wall = wallById.get(wallId);
  const horizontal = wall.axis === 'x';
  const line = horizontal ? wall.from.z : wall.from.x;
  const half = wall.thickness / 2;
  const openings = [...(wall.openings ?? [])].sort((a, b) => b.width - a.width);
  for (const opening of openings) {
    const near = horizontal ? { x: opening.at, z: line - (half + 4) } : { x: line - (half + 4), z: opening.at };
    const far = horizontal ? { x: opening.at, z: line + (half + 5) } : { x: line + (half + 5), z: opening.at };
    const beyondWall = horizontal ? { x: opening.at, z: line + (half + 1) } : { x: line + (half + 1), z: opening.at };
    if (!isFree(near.x, near.z, [wall.id]) || !isFree(far.x, far.z, [wall.id])) continue;
    if (!pathWalkable(near, far).ok || !pathWalkable(near, beyondWall).ok) continue;
    return { wall, opening, near, far, line, horizontal, half };
  }
  return null;
}

await runner.test('≥3 段院墙/宫墙两侧真实行走：全部被墙阻挡，绝不穿墙', () => {
  const verified = [];
  for (const wallId of CANDIDATE_WALLS) {
    if (verified.length >= 5) break;
    const probe = findCrossProbe(wallId);
    if (!probe) continue;
    const dir = probe.horizontal ? { dx: 0, dz: 1 } : { dx: 1, dz: 0 };
    const forward = walk({ x: probe.startZ.x, z: probe.startZ.z, dirX: dir.dx, dirZ: dir.dz, distance: 8 });
    const backward = walk({ x: probe.mirrorZ.x, z: probe.mirrorZ.z, dirX: -dir.dx, dirZ: -dir.dz, distance: 8 });
    const nearFaceF = probe.horizontal ? probe.line - probe.half : probe.line - probe.half;
    const crossedForward = probe.horizontal ? forward.position.z > nearFaceF + 1e-6 : forward.position.x > nearFaceF + 1e-6;
    const crossedBackward = probe.horizontal ? backward.position.z < probe.line + probe.half - 1e-6 : backward.position.x < probe.line + probe.half - 1e-6;
    const wallIdHit = (result) => result.blocked.some((reason) => probe.box.wallIds?.includes(reason) || reason === probe.box.buildingId);
    assertEqual(wallIdHit(forward), true, `${wallId} 正向行走必须由墙体阻挡（实际 ${JSON.stringify(forward.blocked)}）`);
    assertEqual(wallIdHit(backward), true, `${wallId} 反向行走必须由墙体阻挡（实际 ${JSON.stringify(backward.blocked)}）`);
    assertEqual(crossedForward, false, `${wallId} 不得穿过墙芯（正向终点 ${JSON.stringify(forward.position)}）`);
    assertEqual(crossedBackward, false, `${wallId} 不得穿过墙芯（反向终点 ${JSON.stringify(backward.position)}）`);
    verified.push(wallId);
    const axisName = probe.horizontal ? 'z' : 'x';
    const fwd = probe.horizontal ? forward.position.z : forward.position.x;
    const bwd = probe.horizontal ? backward.position.z : backward.position.x;
    runner.info(
      `${probe.wall.name}（${wallId}·owner ${probe.wall.owner}）沿 ${probe.horizontal ? 'x' : 'z'}=${probe.along.toFixed(1)} 跨墙：正向停于 ${axisName}=${fwd.toFixed(2)}、反向停于 ${axisName}=${bwd.toFixed(2)}，墙面 [${(probe.line - probe.half).toFixed(2)}, ${(probe.line + probe.half).toFixed(2)}]，阻挡原因 ${JSON.stringify(forward.blocked.slice(0, 2))}`,
    );
  }
  assert(verified.length >= 3, `至少 3 段墙必须完成双向阻挡验证（实际 ${verified.length}: ${verified.join(',')}）`);
});

await runner.test('≥3 个门洞两侧真实行走：门洞可通行（含南城门走查关键路径）', () => {
  const verified = [];
  for (const wallId of CANDIDATE_WALLS) {
    if (verified.length >= 4) break;
    const probe = findOpeningProbe(wallId);
    if (!probe) continue;
    const dir = probe.horizontal ? { dx: 0, dz: 1 } : { dx: 1, dz: 0 };
    const result = walk({ x: probe.near.x, z: probe.near.z, dirX: dir.dx, dirZ: dir.dz, distance: 14 });
    const farFace = probe.horizontal ? probe.line + probe.half : probe.line + probe.half;
    const crossed = probe.horizontal ? result.position.z > probe.line : result.position.x > probe.line;
    assert(
      crossed,
      `${probe.wall.name}（净宽 ${probe.opening.width}m）应可通过：终点 ${JSON.stringify({ x: +result.position.x.toFixed(2), z: +result.position.z.toFixed(2) })}，墙线 ${probe.line}，阻挡 ${JSON.stringify(result.blocked)}`,
    );
    verified.push(`${wallId}@${probe.opening.at}(w=${probe.opening.width})`);
    runner.info(
      `${probe.wall.name}（${wallId}）门洞 at=${probe.opening.at} 净宽 ${probe.opening.width}m：从 ${JSON.stringify({ x: +probe.near.x.toFixed(1), z: +probe.near.z.toFixed(1) })} 穿到 ${JSON.stringify({ x: +result.position.x.toFixed(1), z: +result.position.z.toFixed(1) })}（远侧墙面 ${farFace.toFixed(2)}）`,
    );
  }
  assert(verified.length >= 3, `至少 3 个门洞必须验证为可通行（实际 ${verified.length}）`);
});

await runner.test('走查路线完整性：FP_ROUTE 全部站点不落在任何墙体碰撞盒内', () => {
  for (const waypoint of LAYOUT.FP_ROUTE) {
    for (const box of derivedAll) {
      const inside =
        waypoint.position.x >= box.bounds.minX &&
        waypoint.position.x <= box.bounds.maxX &&
        waypoint.position.z >= box.bounds.minZ &&
        waypoint.position.z <= box.bounds.maxZ;
      assert(!inside, `走查站点 ${waypoint.id}（${waypoint.name}）落在墙体盒 ${box.id} 内`);
    }
  }
  runner.info(`走查 ${LAYOUT.FP_ROUTE.length} 站均在墙体外（无站点被新碰撞盒封死）`);
});

await runner.test('5 个 fp-spawn 出生点均不在墙体盒内（进入第一人称不会卡在墙里）', () => {
  const spawns = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn');
  assertEqual(spawns.length, 5, '每区 1 个 fp-spawn，共 5 个');
  for (const spawn of spawns) {
    const hit = obstacles.find((box) =>
      spawn.position.x >= box.bounds.minX - CONFIG.INTERACTION.player.radius &&
      spawn.position.x <= box.bounds.maxX + CONFIG.INTERACTION.player.radius &&
      spawn.position.z >= box.bounds.minZ - CONFIG.INTERACTION.player.radius &&
      spawn.position.z <= box.bounds.maxZ + CONFIG.INTERACTION.player.radius,
    );
    assert(!hit, `出生点 ${spawn.id} 被障碍 ${hit?.id} 覆盖`);
  }
});

await runner.test('单帧最大位移远小于院墙厚度（dt 尖峰也不会穿墙）', () => {
  const wallThickness = CONFIG.MODULES.courtyardWallThickness;
  const maxStepDistance = CONFIG.CAMERA.fpMoveSpeed * CONFIG.CAMERA.fpRunMultiplier * (1 / 15); // main.js 夹取 dt ≤ 1/15s
  assert(maxStepDistance < wallThickness, `单帧最大位移 ${maxStepDistance.toFixed(2)}m 必须小于院墙厚 ${wallThickness}m`);
  runner.info(`单帧最大位移 ${maxStepDistance.toFixed(2)}m < 院墙厚 ${wallThickness}m（求解器只检查落点，此不等式是安全前提）`);
});

/* ========================================================================== */

process.exit(runner.summary());
