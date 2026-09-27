#!/usr/bin/env node
/**
 * `tests/zone-west.test.mjs` — D 区西侧宫苑（`src/zones/west-courts.js`）自测。
 *
 * 校验内容（对应任务 t10 的验收项）：
 *   1. 模块契约：`createZone` / `ZONE_ID='D'` / `default` 导出；错误区 id / 缺 zoneLayout / 缺 kit 必须抛错；
 *      源码不得自建几何、灯光、动画循环，必须调用 `kit.mergeZone`；
 *   2. 返回契约：`makeTestCtx` 注入真 kit，走 `validateZoneResult` 逐字段回显校验；
 *   3. 建筑：14 槽位 id 与 layout 逐一一致；地坪抬升后 `|kit 檐口 −(layout.eaveHeight + 0.4)| ≤ 6mm`；
 *      单栋三角面 ≤ 24000；院门是唯一有门洞的构件（其余登记为整体阻挡）；
 *   4. 院落 ≥4：每院有门、主屋、配房、南廊、院前步道与四面内墙；院墙门洞落在门/路位置；
 *   5. 荷池：水体与 layout 登记一致；池底/水面/池岸/石栏/汀步/池心岛齐备；汀步处拦阻盒留有缺口
 *      （池心亭是"可走到"的实景——与 E 的纯观赏水榭区分）；
 *   6. 边界连接：2 条 owner=D 连接的 position/width/elevation 与 layout 逐值一致，且道路端点与其对齐；
 *   7. 碰撞：layout 的 14 栋建筑 + 水体障碍全部在列（y0 下钳到地坪）；院墙实心段格式合规；
 *      用真实几何做正/反走查探针（池面阻挡、汀步可通、院墙阻挡、门洞可通）；
 *   8. 机位与灯位：3 个机位 = layout；灯位 = layout 的 2 个 + 本区 7 处（id 唯一、落在本区地坪、不在障碍内）；
 *   9. 预算：复刻 `scripts/audit.mjs` 的 measure() 口径统计 D 区绘制批次 ≤40；树群与宫灯为 InstancedMesh；
 *  10. 行为：`update` 不改 state/不挂载、`dispose` 幂等只释放自有几何、两次构建确定性；
 *  11. 灰盒替身 kit 兼容（`tests/zones.test.mjs` 走的就是这条路径）。
 */

import {
  ZONE_MODULES,
  assert,
  assertClose,
  assertEqual,
  assertNoProblems,
  createTestRunner,
  loadModule,
  loadThree,
  makeTestCtx,
  readSource,
  zoneModulePath,
} from './harness.mjs';

const runner = createTestRunner('zone-west.test.mjs · D 区西侧宫苑（14 槽位 / 4 院落 / 荷池汀步）');

const THREE = await loadThree();
const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createKit } = await loadModule('src/kit/index.js');
const { validateZoneResult } = await loadModule('src/core/context.js');
const { zoneLayoutFor } = await loadModule('src/core/layout-slice.js');
const greybox = await loadModule('src/zones/_greybox.js');

const MEASURE_QUALITY = 'medium';
const ZONE = 'D';
const zoneLayout = zoneLayoutFor(ZONE);
const BUDGET = CONFIG.BUDGET;
const GROUND_Y = CONFIG.TERRAIN.sideCourtY; // 0.4
const PLAYER = CONFIG.INTERACTION.player;
const STEP = CONFIG.INTERACTION.step;
const POND = LAYOUT.WATER_BODIES.find((w) => w.owner === ZONE);
/** t13：汀步走廊唯一权威源（`layout.STONE_STEP_LANES`）—— 测试不另写第二份字面量。 */
const STONE_STEP_LANES = LAYOUT.STONE_STEP_LANES;

/* -------------------------------------------------------------------------- */
/* 共用工具                                                                    */
/* -------------------------------------------------------------------------- */

/** 与 `scripts/audit.mjs` 的 measure() 同口径：可见可绘制对象 × geometry.groups。 */
function drawCallCount(root) {
  let total = 0;
  const visit = (node, visibleByAncestor) => {
    const visible = visibleByAncestor && node.visible !== false;
    if (visible && (node.isMesh || node.isPoints || node.isLine || node.isSprite)) {
      total += Math.max(1, node.geometry?.groups?.length ?? 1);
    }
    for (const child of node.children ?? []) visit(child, visible);
  };
  visit(root, true);
  return total;
}

function countInstanced(root) {
  let meshes = 0;
  let instances = 0;
  root.traverse((node) => {
    if (!node.isInstancedMesh) return;
    meshes += 1;
    instances += node.count ?? 0;
  });
  return { meshes, instances };
}

function boxOf(object, THREEImpl) {
  const box = new THREEImpl.Box3().setFromObject(object);
  return {
    minX: +box.min.x.toFixed(3), maxX: +box.max.x.toFixed(3),
    minY: +box.min.y.toFixed(3), maxY: +box.max.y.toFixed(3),
    minZ: +box.min.z.toFixed(3), maxZ: +box.max.z.toFixed(3),
  };
}

/**
 * 玩家（脚在 y、身高 1.8、半径 0.35）在 (x,z) 是否被某障碍挡住。
 * `blocks='exceptDoor'` 的条目按 CONTRACTS §6.3 只在门洞净宽之外阻挡。
 * 门洞的**横轴**（净宽所在轴）按 `layout-slice` 的 canonical 语义取：`door.lateralAxis` 优先，
 *   退化时由 `door.axis`（面法线轴）翻转 —— 与生产谓词层 `insideObstacleDoor` 同源；
 *   否则测试与生产会出现两套"门轴字段"口径（t13 实测：水中亭的汀步走廊把水体开槽后暴露）。
 */
function blockedAt(obstacles, x, z, feetY) {
  for (const o of obstacles) {
    const b = o.bounds;
    if (x < b.minX - PLAYER.radius || x > b.maxX + PLAYER.radius) continue;
    if (z < b.minZ - PLAYER.radius || z > b.maxZ + PLAYER.radius) continue;
    if (feetY + PLAYER.height < o.y0 + 1e-6) continue;
    if (feetY > o.y1 - 1e-6) continue;
    if (o.blocks === 'exceptDoor' && o.door) {
      const half = o.door.width / 2;
      const lateral = o.door.lateralAxis ?? (o.door.axis === 'z' ? 'x' : 'z');
      const inDoor = lateral === 'x'
        ? Math.abs(x - o.door.center.x) <= half
        : Math.abs(z - o.door.center.z) <= half;
      if (inDoor) continue;
    }
    return o;
  }
  return null;
}

function covers(intervals, lo, hi, eps = 0.05) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  let cursor = lo;
  for (const [aLo, aHi] of sorted) {
    if (aHi < cursor - eps) continue;
    if (aLo > cursor + eps) return false;
    cursor = Math.max(cursor, aHi);
    if (cursor >= hi - eps) return true;
  }
  return cursor >= hi - eps;
}

/** 真 kit 的 D 区构建产物（medium 档，全测试共用）。 */
const kit = createKit({ THREE, config: CONFIG, quality: MEASURE_QUALITY });
const built = await (await loadModule(zoneModulePath(ZONE))).createZone(await makeTestCtx({ zoneId: ZONE, kit, quality: MEASURE_QUALITY }));
const built2 = await (await loadModule(zoneModulePath(ZONE))).createZone(
  await makeTestCtx({ zoneId: ZONE, kit: createKit({ THREE, config: CONFIG, quality: MEASURE_QUALITY }), quality: MEASURE_QUALITY }),
);
const mod = await loadModule(zoneModulePath(ZONE));

/* ========================================================================== */
runner.section('1. 模块契约与错误路径');
/* ========================================================================== */

await runner.test('导出 createZone / ZONE_ID="D" / default', () => {
  assertEqual(typeof mod.createZone, 'function', '必须导出 createZone(ctx)');
  assertEqual(mod.ZONE_ID, ZONE, 'ZONE_ID 必须是 "D"');
  assertEqual(mod.default, mod.createZone, 'default 应指向 createZone');
  assertEqual(ZONE_MODULES.D, 'src/zones/west-courts.js', 'harness 的模块清单路径');
});

await runner.test('ctx 区 id 不匹配 / 缺 zoneLayout / 缺 kit / 缺 THREE 时必须抛错', async () => {
  const wrong = await makeTestCtx({ zoneId: 'E', kit });
  await expectThrow(() => mod.createZone(wrong), 'zoneLayout.id !== D 时必须抛错');
  await expectThrow(() => mod.createZone({ THREE, zoneLayout: null, kit }), '缺 zoneLayout 时必须抛错');
  await expectThrow(() => mod.createZone({ THREE, zoneLayout, kit: null }), '缺 kit 时必须抛错');
  await expectThrow(() => mod.createZone({ zoneLayout, kit }), '缺 THREE 时必须抛错');
});

await runner.test('只消费 kit 构件与 config 令牌：不得自建几何/灯光/动画循环，必须整区合批', () => {
  const source = readSource('src/zones/west-courts.js');
  for (const banned of ['BoxGeometry', 'CylinderGeometry', 'SphereGeometry', 'PlaneGeometry', 'BufferGeometry', 'new THREE.Mesh', 'requestAnimationFrame', 'setInterval', 'new THREE.PointLight', 'new THREE.DirectionalLight', 'new THREE.Scene', 'scene.add', 'Math.random']) {
    assert(!source.includes(banned), `源码出现禁用标识：${banned}`);
  }
  assert(/mergeZone\(/.test(source), '必须调用 kit.mergeZone 做整区合批');
  assert(/instanceFromPoints/.test(source), '重复构件（树/灯）必须走实例化');
  assert(!/from '\.\.\/(core|kit)\/(?!layout-slice)/.test(source), '不得越界 import 其它区域的私有模块');
  assert(!/screenWall/.test(source), 'D 区不设影壁（与 E 的"进门见屏"语汇区分）');
});

/* ========================================================================== */
runner.section('2. 返回契约（validateZoneResult，真 kit）');
/* ========================================================================== */

const contract = validateZoneResult(ZONE, built, { THREE, scope: 'zone', expectBuildings: zoneLayout.slots.length });

await runner.test('§3.3/§4/§5/§6/§8.3 全部字段通过；数量与 layout 分配一致', () => {
  assertNoProblems(contract.problems, 'D 区契约');
  assertEqual(contract.stats.buildings, 14, '建筑数量必须等于 layout 分配数（14）');
  assertEqual(contract.stats.connectors, 2, '本人 owner 的通道数');
  assertEqual(contract.stats.walkable, zoneLayout.walkable.length, '可行走面数（应与切片一致）');
  /* t13：原 25 = 1 地面 + 8 室内 + 8 门洞通道 + 8 门外过渡台阶；本卡在 layout 侧新增 D 池 2 面汀步
     （`WK-D-pond-step-{1,2}`，E 池的 2 面属 E 区），故 25 → 27。判据强度不变：仍与切片逐值相等。 */
  assertEqual(contract.stats.walkable, 27, '可行走面数 = 1 地面 + 8 室内 + 8 门洞通道（t62/t75）+ 8 D 区门外过渡台阶（t102）+ 2 汀步（t13）');
  assertEqual(contract.stats.ramps, 1, '坡道数（RD-D-garden-ramp 的 Δy）');
  assertEqual(contract.stats.viewpoints, 3 + 8, '机位数 = 3 原有 + 8 内景机位');
  runner.info(`D 区：${contract.stats.meshes} 网格 / ${contract.stats.triangles} 三角面 / ${drawCallCount(built.root)} 绘制批次（≤${BUDGET.drawCalls.perZone.D}）`);
});

/* ========================================================================== */
runner.section('3. 建筑（14 槽位）');
/* ========================================================================== */

await runner.test('建筑 id 与 layout 的 D 区槽位一一对应，无重复', () => {
  const ids = built.buildings.map((s) => s.id).sort();
  const expected = LAYOUT.SLOTS.filter((s) => s.zone === ZONE).map((s) => s.id).sort();
  assertEqual(ids.join(','), expected.join(','), '建筑 id 必须与注册表逐一一致');
  assertEqual(new Set(ids).size, ids.length, 'id 不得重复');
});

await runner.test('地坪抬升：每栋 |kit 檐口 −(layout.eaveHeight + 地坪 0.4)| ≤ 6mm；单栋三角面 ≤24000', () => {
  const facts = built.stats.buildingFacts;
  assertEqual(facts.length, 14, '应记录 14 栋实测指标');
  for (const fact of facts) {
    assert(fact.eaveHeightAbsolute !== null, `${fact.id} 缺少 kit eaveHeightAbsolute`);
    assertClose(fact.eaveHeightAbsolute, fact.layoutEaveHeight + GROUND_Y, 0.006, `${fact.id} 檐口高（抬升后）不一致`);
    assert(fact.triangles > 0 && fact.triangles <= BUDGET.triangles.perBuildingMax, `${fact.id} 三角面 ${fact.triangles} 越界`);
    assert(fact.worldBounds.minY >= GROUND_Y - 0.05, `${fact.id} 不应低于地坪（y=${fact.worldBounds.minY}）`);
  }
  const worst = facts.reduce((a, b) => (b.triangles > a.triangles ? b : a), facts[0]);
  runner.info(`单栋最大三角面 ${worst.triangles}（${worst.id}，上限 ${BUDGET.triangles.perBuildingMax}）`);
});

await runner.test('建筑落在槽位中心（±出檐），四种形制齐备且风格语言与 E 同源', () => {
  for (const slot of zoneLayout.slots) {
    const fact = built.stats.buildingFacts.find((f) => f.id === slot.id);
    const cx = (fact.worldBounds.minX + fact.worldBounds.maxX) / 2;
    const cz = (fact.worldBounds.minZ + fact.worldBounds.maxZ) / 2;
    assertClose(cx, slot.x, 6, `${slot.id} 中心 x 偏移过大`);
    assertClose(cz, slot.z, 6, `${slot.id} 中心 z 偏移过大`);
  }
  const kinds = new Set(zoneLayout.slots.map((s) => s.kind));
  assertEqual([...kinds].sort().join(','), 'courtyardGate,hall,pavilion,sideHall', '形制集合应与 E 同源（hall/sideHall/courtyardGate/pavilion）');
  const roofs = new Set(zoneLayout.slots.map((s) => s.roofType));
  assertEqual([...roofs].sort().join(','), 'gable,gableHip,pyramidal', '屋顶语言（歇山/硬山/攒尖）应与 E 同源');
  runner.info(`形制 ${[...kinds].join('/')} · 屋顶 ${[...roofs].join('/')}`);
});

/* ========================================================================== */
runner.section('4. 四组院落（门 / 主屋 / 配房 / 步道 / 内墙）');
/* ========================================================================== */

const wallFacts = built.stats.details.wallFacts;
const corridorFacts = built.stats.details.corridorFacts;
const roadFacts = built.stats.details.roadFacts;

await runner.test('院落数 ≥4，每院齐备门 + 主屋 + 配房 + 廊庑 + 步道', () => {
  assert(zoneLayout.courtyards.length >= 4, `院落数 ${zoneLayout.courtyards.length} 应 ≥4`);
  assertEqual(built.stats.courtyards, 4, '实测院落数');
  for (const courtyard of zoneLayout.courtyards) {
    const own = zoneLayout.slots.filter((s) => s.courtyard === courtyard.id);
    const gate = own.find((s) => s.kind === 'courtyardGate');
    const halls = own.filter((s) => s.kind === 'hall');
    const houses = own.filter((s) => s.kind === 'sideHall');
    assert(gate, `${courtyard.id} 缺少院门`);
    assert(halls.length >= 1, `${courtyard.id} 缺少主屋`);
    assert(houses.length >= 1, `${courtyard.id} 缺少配房`);
    assert(gate.door && gate.door.width >= 8, `${courtyard.id} 院门必须留出可通行门洞`);
    // 院南廊（layout.CORRIDORS 每院 1 段，按 courtyard.corridors 精确匹配）
    for (const corridorId of courtyard.corridors ?? []) {
      assert(corridorFacts.some((c) => c.id === corridorId), `${courtyard.id} 缺少廊庑 ${corridorId}`);
    }
    // 院前步道：从主脊道通到院门（RD-D-courtN-path）
    const index = courtyard.id.match(/court(\d+)/)?.[1];
    assert(index, `无法从 ${courtyard.id} 解析院号`);
    assert(roadFacts.some((r) => r.id === `RD-D-court${index}-path`), `${courtyard.id} 缺少连接步道`);
  }
  runner.info(`四院 ${built.stats.courtyards} 组：门 ${zoneLayout.slots.filter((s) => s.kind === 'courtyardGate').length} / 主屋 ${zoneLayout.slots.filter((s) => s.kind === 'hall').length} / 配房 ${zoneLayout.slots.filter((s) => s.kind === 'sideHall').length} / 亭 ${zoneLayout.slots.filter((s) => s.kind === 'pavilion').length}`);
});

await runner.test('院墙 16 段覆盖四院四面，门/路开口与 layout 计算一致', () => {
  assertEqual(wallFacts.length, 16, '院墙段数 = 4 院 × 4 面');
  for (const courtyard of zoneLayout.courtyards) {
    const { minX, maxX, minZ, maxZ } = courtyard.bounds;
    const own = wallFacts.filter((w) => w.courtyardId === courtyard.id);
    assertEqual(own.length, 4, `${courtyard.id} 应有 4 段内墙`);
    const south = own.filter((w) => w.alongX && Math.abs(w.line - minZ) < 0.01).map((w) => w.span);
    const north = own.filter((w) => w.alongX && Math.abs(w.line - maxZ) < 0.01).map((w) => w.span);
    const west = own.filter((w) => !w.alongX && Math.abs(w.line - minX) < 0.01).map((w) => w.span);
    const east = own.filter((w) => !w.alongX && Math.abs(w.line - maxX) < 0.01).map((w) => w.span);
    assert(covers(south, minX, maxX), `${courtyard.id} 南墙未闭合`);
    assert(covers(north, minX, maxX), `${courtyard.id} 北墙未闭合`);
    assert(covers(west, minZ, maxZ), `${courtyard.id} 西墙未闭合`);
    assert(covers(east, minZ, maxZ), `${courtyard.id} 东墙未闭合`);
    // 院门开口：院门在东墙（x=maxX），开口 z = 门中心 z
    const gate = zoneLayout.slots.find((s) => s.courtyard === courtyard.id && s.kind === 'courtyardGate');
    const eastWall = own.find((w) => !w.alongX && Math.abs(w.line - maxX) < 0.01);
    const opening = eastWall.openings.find((o) => Math.abs(o.at - gate.z) <= 1.5);
    assert(opening, `${courtyard.id} 东墙必须在院门处留开口（z=${gate.z}）`);
    assert(opening.width >= 8, `${courtyard.id} 院门开口净宽应 ≥8m（实测 ${opening.width}）`);
  }
});

await runner.test('南廊与院墙不冲突，廊庑贴院内一侧且长度与 layout.CORRIDORS 一致', () => {
  assertEqual(corridorFacts.length, 4, '四院各一道南廊');
  for (const corridor of corridorFacts) {
    const source = LAYOUT.CORRIDORS.find((c) => c.id === corridor.id);
    assert(source, `${corridor.id} 不在 layout.CORRIDORS 中`);
    assertEqual(corridor.from.x, source.from.x, `${corridor.id} 起点 x`);
    assertEqual(corridor.to.x, source.to.x, `${corridor.id} 终点 x`);
    assertEqual(corridor.width, source.width, `${corridor.id} 宽度`);
  }
  runner.info(`四院南廊：${corridorFacts.map((c) => c.id).join(' / ')}`);
});

/* ========================================================================== */
/* ========================================================================== */
runner.section('4b. 室内陈设（kit.interiorSet · 8 栋内景：殿 4 + 配房 4）');
/* ========================================================================== */

const interiorFacts = built.stats.interiorFacts;
const visitableSlots = zoneLayout.slots.filter((s) => s.visitable);

await runner.test('内景清单：8 栋套件 = layout 的 visitable 槽位（4 座院门与 2 座亭不布陈设）', () => {
  assertEqual(built.stats.interiorKitAvailable, true, 'kit.interiorSet 必须可用（t61 套件）');
  assertEqual(interiorFacts.length, 8, '本区内景套件数');
  assertEqual(interiorFacts.map((f) => f.id).sort().join(','), visitableSlots.map((s) => s.id).sort().join(','), '套件 id 必须与 layout 登记的 visitable 槽位一致');
  const kinds = interiorFacts.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] ?? 0) + 1; return acc; }, {});
  assertEqual(kinds.hall, 4, '主屋 4 栋');
  assertEqual(kinds.sideHall, 4, '配房 4 栋');
  const notVisitable = zoneLayout.slots.filter((s) => !s.visitable);
  assertEqual(notVisitable.length, 6, '本区非 visitable 6 栋（4 院门 + 2 亭）');
  assert(notVisitable.every((s) => !interiorFacts.some((f) => f.id === s.id)), '非 visitable 槽位不得布内景');
  runner.info(`内景 ${interiorFacts.length} 栋：殿 4 + 配房 4；未布：4 院门 + 2 亭`);
});

await runner.test('每栋：bounds/groundY 逐值取 layout 注册的 WK（t83 后 Δ=0，不自行推断）', () => {
  for (const fact of interiorFacts) {
    const surface = LAYOUT.WALKABLE.find((w) => w.id === fact.surfaceId);
    assert(surface, `${fact.id} 的 ${fact.surfaceId} 必须在 layout.WALKABLE 中`);
    assertEqual(surface.kind, 'interior', `${fact.surfaceId} 的 kind 必须是 interior`);
    assertClose(fact.bounds.minX, surface.bounds.minX, 1e-6, `${fact.id} 室内西界`);
    assertClose(fact.bounds.maxX, surface.bounds.maxX, 1e-6, `${fact.id} 室内东界`);
    assertClose(fact.bounds.minZ, surface.bounds.minZ, 1e-6, `${fact.id} 室内南界`);
    assertClose(fact.bounds.maxZ, surface.bounds.maxZ, 1e-6, `${fact.id} 室内北界`);
    assertClose(fact.groundY, surface.y, 1e-6, `${fact.id} 地坪必须等于 WK.y（t83 修正后 Δ=0）`);
    assertEqual(fact.groundDelta, 0, `${fact.id} groundDelta 必须为 0`);
    const record = LAYOUT.INTERIOR_BY_SLOT[fact.id];
    assertEqual(fact.viewpointId, record.viewpointId, `${fact.id} 机位映射`);
    assertEqual(fact.fpId, record.fpId, `${fact.id} 走查点映射`);
  }
});

await runner.test('套件几何不穿模不出顶：世界包围盒在室内面内、底面贴地坪、顶面 ≤ 天花 ≤ kit 实测檐口', () => {
  for (const fact of interiorFacts) {
    const wb = fact.worldBounds;
    assert(wb, `${fact.id} 缺少世界包围盒`);
    assert(wb.minX >= fact.bounds.minX - 0.05 && wb.maxX <= fact.bounds.maxX + 0.05, `${fact.id} 东西越界`);
    assert(wb.minZ >= fact.bounds.minZ - 0.05 && wb.maxZ <= fact.bounds.maxZ + 0.05, `${fact.id} 南北越界`);
    assert(wb.minY >= fact.groundY - 0.07 && wb.minY <= fact.groundY + 0.07, `${fact.id} 底面未贴地坪（${wb.minY} vs ${fact.groundY}）`);
    assert(wb.maxY <= fact.ceilingY + 1e-6, `${fact.id} 穿顶（${wb.maxY} > 天花 ${fact.ceilingY}）`);
    const measured = built.stats.buildingFacts.find((m) => m.id === fact.id);
    const eaveAbsolute = measured ? measured.layoutEaveHeight + GROUND_Y : null;
    assert(eaveAbsolute === null || eaveAbsolute >= fact.ceilingY, `${fact.id} 天花必须低于实测檐口（${eaveAbsolute}）`);
    assert(fact.items >= 5, `${fact.id} 陈设件数 ${fact.items} 过少`);
    assert(!(fact.diagnostics ?? []).map(String).includes('interior-tight'), `${fact.id} 被降级为"地面+灯"`);
  }
  const maxTop = interiorFacts.reduce((a, f) => Math.max(a, f.worldBounds.maxY - f.groundY), 0);
  runner.info(`8 栋内景最高构件相对地坪 ${maxTop.toFixed(2)}m；件数 ${Math.min(...interiorFacts.map((f) => f.items))}~${Math.max(...interiorFacts.map((f) => f.items))}`);
});

await runner.test('室内天花与内景补光：sideHall 补白石天花（遮深色屋面）、每栋 2 盏室内灯落在地坪上', () => {
  assertEqual(built.stats.interiorCeilings, 4, '4 栋配房各补一层天花（殿档套件自带藻井天花）');
  for (const fact of interiorFacts) {
    const lamps = built.lightAnchors.filter((a) => a.id.startsWith('LA-D-interior-') && a.id.includes(fact.id.replace(/^D-/, '')));
    assertEqual(lamps.length, 2, `${fact.id} 内景补光灯位数`);
    for (const lamp of lamps) {
      assertClose(lamp.position.y, fact.groundY, 1e-6, `${lamp.id} 应落在室内地面上`);
      assert(lamp.height + fact.groundY < fact.ceilingY, `${lamp.id} 灯体不得穿顶`);
    }
  }
});

runner.section('5. 荷池（水面 / 池岸 / 石栏 / 汀步 / 池心岛）');
/* ========================================================================== */

await runner.test('水体与 layout.WATER_BODIES 一致；池底/水面/池岸/石栏齐备', () => {
  assert(POND, 'layout 应登记 D 区水体（WB-D-pond）');
  const facts = built.stats.water;
  const pondFacts = facts?.pond;
  assert(pondFacts, '未记录水体事实');
  assertEqual(pondFacts.id, POND.id, '水体 id');
  assertEqual(JSON.stringify(pondFacts.bounds), JSON.stringify(POND.bounds), '池界与登记一致');
  assertClose(pondFacts.waterY, POND.y, 1e-6, '水面标高');
  assert(facts.rim >= 4, `池岸段数应 ≥4（实测 ${facts.rim}）`);
  assert(facts.railings >= 4, `环池石栏段数应 ≥4（实测 ${facts.railings}）`);
  let waterMesh = null;
  built.root.traverse((node) => {
    if (node.isMesh && node.material === kit.materials.waterSurface) waterMesh = node;
  });
  assert(waterMesh, '缺少水面网格（材质必须是 kit.materials.waterSurface）');
  const waterBox = boxOf(waterMesh, THREE);
  assertClose(waterBox.minX, POND.bounds.minX, 0.6, '水面西界');
  assertClose(waterBox.maxX, POND.bounds.maxX, 0.6, '水面东界');
  assertClose(waterBox.maxY, POND.y, 0.2, '水面标高');
  runner.info(`荷池 ${POND.bounds.maxX - POND.bounds.minX}×${POND.bounds.maxZ - POND.bounds.minZ}m，水面 ${POND.y}m，池岸 ${facts.rim} 段 / 石栏 ${facts.railings} 段 / 拦阻 ${facts.guard.length} 段`);
});

await runner.test('池心岛含亭、两级汀步（t13 可达）接到岛边（D 独有：池心亭可走到，E 的水榭为纯观赏）', () => {
  const facts = built.stats.water;
  const pavilion = zoneLayout.slots.find((s) => s.id === 'D-court3-pavilion');
  assert(facts.island, '缺少池心岛事实');
  assertClose(facts.island.x, pavilion.x, 0.01, '池心岛应对准池上小亭 x');
  assertClose(facts.island.z, pavilion.z, 0.01, '池心岛应对准池上小亭 z');
  assert(facts.island.half * 2 > 14, '池心岛应大于亭的占地（14×14）');
  assert(facts.walkway, '缺少汀步石桥');
  const lane = STONE_STEP_LANES.find((l) => l.id === 'D-court3-pavilion');
  assert(lane, 'layout.STONE_STEP_LANES 应登记 D 池汀步走廊');
  assertClose(facts.walkway.x, (POND.bounds.minX + POND.bounds.maxX) / 2, 0.01, '汀步应自池南岸居中进入');
  assert(facts.walkway.half * 2 >= 4, `汀步净宽应 ≥4m（实测 ${facts.walkway.half * 2}）`);
  assert(facts.walkway.fromZ <= POND.bounds.minZ + 0.01, '汀步应自池南岸起');
  assert(facts.walkway.toZ >= POND.bounds.minZ + 8, '汀步应伸入池面 ≥8m');
  /* t13 口径更新（**判据只增不减**）：原断言"汀步终点 = 池心岛南沿"随两级汀步改造失效 ——
     权威几何改由 `layout.STONE_STEP_LANES` 表达；此处逐值对齐登记，并**新增**更强判据：
     ① 恰好 2 级汀步且逐跳 ≥0.20 且 ≤0.25（禁 0.50 等值，§12.1.4.5）；
     ② 下石南沿接池南岸、上石北沿 ≥ 岛南沿（覆盖池心，不虚接）；
     ③ 三级链（区域地坪 → 下石 → 上石/亭地面）**逐跳双向可跨**（用求解器生产口径）。 */
  assertEqual(facts.walkway.steps.length, 2, `D 池应恰 2 级汀步（实测 ${facts.walkway.steps.length}）`);
  const steps = lane.steps;
  const chain = [GROUND_Y, ...steps.map((s) => s.y)];
  const jumps = chain.slice(1).map((y, i) => +(y - chain[i]).toFixed(6));
  assert(jumps.every((d) => d >= 0.2 - 1e-9 && d <= 0.25 + 1e-9), `逐跳应 ∈ [0.20, 0.25]（禁 0.50 等值）：${JSON.stringify(jumps)}`);
  assertClose(steps[0].minZ, POND.bounds.minZ, 0.01, '下石南沿应贴池南岸（岸 → 下石为一步）');
  assert(steps[1].maxZ >= facts.island.z - facts.island.half, `上石北沿应覆盖池心岛南沿（实测 ${steps[1].maxZ}）`);
  /* 对应的可见几何：池心岛节点 + **逐级可见石件**（与可行走面同轮落地）。
     量测口径：`kit.mergeZone(root)` 会把本区所有网格合批并**清空原 Group 的子节点**
     （`scene graph` 上只剩合批节点 `D:batch`），因此"逐个 getObjectByName 量包围盒"在合批后必然读到空组
     （实测 Box3 = ±Infinity）⇒ 改为**由区域在合批前记录石件世界包围盒**（`stats.water.walkway.steps[].bounds`），
     测试据此逐面核对；同时断言合批节点确实存在几何（防止"记录是数据、几何根本没建"）。 */
  assert(built.root.getObjectByName('D-pond-island'), '缺少池心岛几何');
  const merged = built.root.getObjectByName('D:batch');
  assert(merged && merged.children.length > 0, '合批节点 D:batch 应存在且含几何');
  const mergedMeshes = [];
  merged.traverse((n) => { if (n.isMesh) mergedMeshes.push(n); });
  assert(mergedMeshes.length > 0, '合批节点内应至少含 1 个网格');
  assertEqual(facts.walkway.steps.length, steps.length, '可见石件记录数应 = 汀步级数');
  for (const s of steps) {
    const walk = LAYOUT.WALKABLE.find((w) => w.id === s.id);
    assert(walk, `layout 应登记可行走面 ${s.id}`);
    const rec = facts.walkway.steps.find((x) => x.id === s.id);
    assert(rec, `缺少可见石件记录 ${s.id}`);
    assertEqual(rec.node, `${s.id}-visible`, `${s.id} 可见石件节点名`);
    /* 判据硬化：空节点/空几何会让 Box3 给出 ±Infinity，`toFixed` 会把它变成 null ⇒ 先断言六个数有限，
       否则 "记录 = 有限数" 这一条把"几何根本没建"的情形挡在门外。 */
    assert(Object.values(rec.bounds).every((v) => typeof v === 'number' && Number.isFinite(v)),
      `${s.id} 可见石件包围盒必须是有限数（实测 ${JSON.stringify(rec.bounds)}）`);
    /* 石件顶面 = 登记面高（**精确**：登记者就是石件顶）；平面范围 = 登记面 ± 台明压顶外挑（≤6cm）。 */
    assertClose(rec.bounds.maxY, walk.y, 0.01, `${s.id} 可见石件顶面应 = 登记面高 ${walk.y}`);
    assertClose(rec.bounds.minX, walk.bounds.minX, 0.06, `${s.id} 可见石件西界应 ≈ 登记面西界`);
    assertClose(rec.bounds.maxX, walk.bounds.maxX, 0.06, `${s.id} 可见石件东界应 ≈ 登记面东界`);
    assertClose(rec.bounds.minZ, walk.bounds.minZ, 0.06, `${s.id} 可见石件南界应 ≈ 登记面南界`);
  }
  runner.info(`D 池汀步：${steps.length} 级（${chain.join(' → ')}，逐跳 ${jumps.join('/')}）· 可见石件 ${steps.length}/2 · 下石贴岸 ${steps[0].minZ} / 上石覆盖岛沿 ${steps[1].maxZ}`);
});

/* ========================================================================== */
runner.section('6. 边界连接与道路对齐');
/* ========================================================================== */

await runner.test('2 条 owner=D 连接与 layout 逐值一致（位置/宽度/标高）', () => {
  const expected = LAYOUT.CONNECTORS.filter((c) => c.owner === ZONE);
  assertEqual(expected.length, 2, 'layout 中 owner=D 的通道数');
  assertEqual(built.connectors.length, 2, '返回的连接数');
  for (const connector of built.connectors) {
    const source = expected.find((c) => c.id === connector.id);
    assert(source, `${connector.id} 不是本人 owner 的通道`);
    assertClose(connector.position.x, source.position.x, 1e-6, `${connector.id} x`);
    assertClose(connector.position.z, source.position.z, 1e-6, `${connector.id} z`);
    assertEqual(connector.width, source.width, `${connector.id} 宽度`);
    assertEqual(connector.elevation, source.elevation, `${connector.id} 标高`);
    // 道路端点必须落在连接点上（两端共享位置/标高）
    const road = roadFacts.find((r) => r.connector === connector.id);
    assert(road, `${connector.id} 缺少对应道路段`);
    const dist = Math.min(
      Math.hypot(road.from.x - connector.position.x, road.from.z - connector.position.z),
      Math.hypot(road.to.x - connector.position.x, road.to.z - connector.position.z),
    );
    assert(dist <= 0.01, `${connector.id} 道路端点与通道位置不一致（${dist}）`);
    assertEqual(road.from.y, connector.elevation, `${connector.id} 道路标高与通道标高一致`);
  }
  runner.info(`连接 ${built.connectors.map((c) => c.id).join(' / ')}`);
});

await runner.test('不越界：外宫墙/城门/水系不由本区实现', () => {
  const source = readSource('src/zones/west-courts.js');
  for (const banned of ['WALL-CITY', 'MOAT', 'BRIDGE-', 'cornerTower']) {
    assert(!source.includes(banned), `D 区不得实现 ${banned}（归 F）`);
  }
  const facts = built.stats.details.buildingIds;
  assert(!facts.some((id) => id.startsWith('F-')), 'D 区不得包含 F 的槽位');
  const box = built.stats.bounds;
  assert(box.minX >= zoneLayout.bounds.minX - 1 && box.maxX <= zoneLayout.bounds.maxX + 0.5, `东西越界：${box.minX}..${box.maxX}`);
  assert(box.minZ >= zoneLayout.bounds.minZ - 1 && box.maxZ <= zoneLayout.bounds.maxZ + 1, `南北越界：${box.minZ}..${box.maxZ}`);
  assert(box.maxY < CONFIG.MODULES.wallHeight + 6, `不应出现宫城级体量（maxY=${box.maxY}）`);
});

/* ========================================================================== */
runner.section('7. 碰撞（布局登记 + 院墙实心段 + 池体拦阻 + 真实走查探针）');
/* ========================================================================== */

const obstacles = built.colliders.obstacles;

await runner.test('layout 的建筑与水体障碍全部在列（y0 下钳到地坪），格式符合 §6.3', () => {
  for (const source of LAYOUT.OBSTACLES.filter((o) => o.zone === ZONE)) {
    const mine = obstacles.find((o) => o.id === source.id);
    assert(mine, `缺少 layout 障碍 ${source.id}`);
    assert(JSON.stringify(mine.bounds) === JSON.stringify(source.bounds), `${source.id} 包围盒不得改动`);
    assert(mine.y0 <= GROUND_Y + 1e-6, `${source.id} y0 应下钳到地坪（实测 ${mine.y0}）`);
    assert(mine.y1 >= source.y1 - 1e-6, `${source.id} y1 不得下调`);
    assert(['all', 'exceptDoor'].includes(mine.blocks), `${source.id} blocks 非法`);
  }
  for (const obstacle of obstacles) {
    assert(typeof obstacle.id === 'string' && obstacle.id.length > 0, '障碍 id 必须是非空字符串');
    assert(['building', 'wall', 'water', 'rockery'].includes(obstacle.sourceType), `${obstacle.id} sourceType 非法`);
    assert(obstacle.bounds && obstacle.y0 <= obstacle.y1, `${obstacle.id} 包围盒/高度区间非法`);
    if (obstacle.blocks === 'exceptDoor') assert(obstacle.door, `${obstacle.id} 需要门洞定义`);
  }
  const wallSpans = obstacles.filter((o) => o.sourceType === 'wall');
  assert(wallSpans.length >= 8, `院墙实心段应 ≥8（实测 ${wallSpans.length}）`);
  for (const span of wallSpans) {
    assertClose(span.y0, GROUND_Y, 1e-6, `${span.id} 墙脚应在院内地坪`);
    assertClose(span.y1, GROUND_Y + CONFIG.MODULES.courtyardWallHeight, 1e-6, `${span.id} 墙高`);
  }
  runner.info(`障碍 ${obstacles.length} 条 = layout ${LAYOUT.OBSTACLES.filter((o) => o.zone === ZONE).length} + 池体拦阻 ${built.stats.water.guard.length} + 院墙段 ${wallSpans.length}`);
});

await runner.test('不可进入建筑 visitable=false → blocks="all"；院门 blocks="exceptDoor" 且门洞宽度一致', () => {
  for (const slot of built.buildings) {
    const obstacle = obstacles.find((o) => o.buildingId === slot.id);
    assert(obstacle, `${slot.id} 必须登记障碍`);
    assertEqual(obstacle.bounds.minX, slot.bounds.minX, `${slot.id} 障碍包围盒应与建筑一致`);
    if (slot.hasDoor === false) {
      assertEqual(obstacle.blocks, 'all', `${slot.id} 无门洞 → 必须整体阻挡`);
      assertEqual(obstacle.door, null, `${slot.id} 无门洞 → 不得登记门洞`);
    } else {
      assertEqual(obstacle.blocks, 'exceptDoor', `${slot.id} 有门洞 → 仅门洞通行`);
      assertEqual(obstacle.door.width, slot.doorWidth, `${slot.id} 门洞宽度须与建筑登记一致`);
    }
  }
});

await runner.test('真实走查探针：池面阻挡 / 两级汀步可通 / 院墙阻挡 / 院门可通（D 独有池心路径）', () => {
  const feet = GROUND_Y;
  // 反例 1：池面（汀步走廊之外）必须被挡住 —— 开槽是**有界**的，其余水面逐点仍拦
  const waterProbe = { x: POND.bounds.maxX - 8, z: (POND.bounds.minZ + POND.bounds.maxZ) / 2 };
  assert(blockedAt(obstacles, waterProbe.x, waterProbe.z, feet), `池面 (${waterProbe.x},${waterProbe.z}) 未被拦阻`);
  /* t13：走廊开槽的**反例集**（只增不减）—— 走廊外 1m（东西两侧）在同一 z 上必须仍被水体拦住：
     只开一条 8m 宽的走廊，绝不放行整池。 */
  const corridor = STONE_STEP_LANES.find((l) => l.id === 'D-court3-pavilion').corridor;
  for (const dx of [-1, 1]) {
    const x = dx < 0 ? corridor.minX - 1 : corridor.maxX + 1;
    const z = (corridor.minZ + corridor.maxZ) / 2;
    assert(blockedAt(obstacles, x, z, feet), `走廊外 (${x},${z}) 必须仍被水体拦住（开槽越界）`);
  }
  // 反例 2：院墙墙身必须被挡住
  const courtyard = zoneLayout.courtyards[0];
  const gate = zoneLayout.slots.find((s) => s.courtyard === courtyard.id && s.kind === 'courtyardGate');
  const wallSpans = obstacles.filter((o) => o.sourceType === 'wall' && o.zone === ZONE);
  const southWall = wallSpans.find((o) => o.id.startsWith(`OB-CY-D-court1-wall-south`));
  assert(southWall, '院墙南墙实心段应存在');
  const wallProbe = { x: (southWall.bounds.minX + southWall.bounds.maxX) / 2, z: (southWall.bounds.minZ + southWall.bounds.maxZ) / 2 };
  assert(blockedAt(obstacles, wallProbe.x, wallProbe.z, feet), '院墙墙身未被阻挡');
  // 正例 2：院门门洞（墙线上、门中心处）必须可通；门洞外 8m 处必须被挡
  const gateObstacle = obstacles.find((o) => o.buildingId === gate.id);
  assert(gateObstacle && gateObstacle.door, '院门必须有门洞');
  assert(gateObstacle.door.width >= 8, `院门门洞净宽应 ≥8m（实测 ${gateObstacle.door.width}）`);
  const wallLineX = courtyard.bounds.maxX; // 东墙线
  assert(!blockedAt(obstacles, wallLineX, gate.z, feet), `院门门洞处（${wallLineX},${gate.z}）被挡住，走不通`);
  assert(blockedAt(obstacles, wallLineX, gate.z + gateObstacle.door.width, feet), '门洞之外仍应被墙挡住');
  // 正例 3：院门本体的门洞内（门中心）不被自身障碍阻挡
  assert(!blockedAt(obstacles, gate.x, gate.z, feet), '院门门洞中心不应被院门自身挡住');
  /* 正例 4（t13 口径更新 + **判据只增不减**）：
     原断言"池心岛台面（亭之外）三处可走"随 t13 的拦阻盒重构而失效 —— 原因是**水面不可站**优先：
     池心岛只有**走廊宽度**是真的可走（岛东西两条 2m 环台被水体拦阻盒覆盖），而这一点旧断言从未覆盖。
     现改为两条**更强**的断言：
       ① 覆盖不变量（逐点）：水面 \ 汀步走廊 ⊆ 拦阻盒（旧实现的两个"护不到的口袋"即在此报红）；
       ② 正例：走廊内（汀步中心线 + 两级石件中心）逐点可走。
     注：本文件的 `obstacles` 是**区域自报清单**，其中水体盒仍是 layout 原始值（顶面 0.05 < 脚高 0.4）
     ⇒ 水面阻挡在区域单测里全部靠拦阻盒体现，这正是①要守的东西。 */
  const laneD = STONE_STEP_LANES.find((l) => l.id === 'D-court3-pavilion');
  const corridorD = laneD.corridor;
  const holes = [];
  let waterSamples = 0;
  for (let x = POND.bounds.minX + 1; x <= POND.bounds.maxX - 1; x += 2) {
    for (let z = POND.bounds.minZ + 1; z <= POND.bounds.maxZ - 1; z += 2) {
      if (x >= corridorD.minX && x <= corridorD.maxX) continue; // 走廊内的水面由石件顶替（登记面可走）
      waterSamples += 1;
      if (!blockedAt(obstacles, x, z, feet)) holes.push(`(${x},${z})`);
    }
  }
  assert(holes.length === 0,
    `t13：水面 \\ 汀步走廊 ⊆ 拦阻盒（逐 2m 采样 ${waterSamples} 点，${holes.length} 处漏护）：${holes.slice(0, 6).join('、')}`);
  const walkPoints = [];
  for (const t of [0.15, 0.4, 0.65, 0.9]) {
    walkPoints.push({ x: (corridorD.minX + corridorD.maxX) / 2, z: corridorD.minZ + (corridorD.maxZ - corridorD.minZ) * t, tag: `走廊 ${t}` });
  }
  for (const rec of built.stats.water.walkway.steps) {
    walkPoints.push({ x: (rec.bounds.minX + rec.bounds.maxX) / 2, z: (rec.bounds.minZ + rec.bounds.maxZ) / 2, tag: `石件 ${rec.id}` });
  }
  for (const p of walkPoints) {
    const hit = blockedAt(obstacles, p.x, p.z, feet);
    assert(!hit, `${p.tag} (${p.x},${p.z}) 被 ${hit?.id} 挡住，汀步/亭台不可站`);
  }
  const island = built.stats.water.island;
  runner.info(`走查探针：水面采样 ${waterSamples} 点全部被拦（0 漏护）· 走廊/石件 ${walkPoints.length} 点可走 · 池心岛顶 ${island.top}m（可走宽度 = 走廊 ${corridorD.maxX - corridorD.minX}m）`);
  runner.info(`走查探针：池面阻挡 ✓ / 走廊外 ${corridorD.minX - 1}、${corridorD.maxX + 1} 仍拦 ✓ / 院墙阻挡 ✓ / 院门 ${gateObstacle.door.width}m 门洞可通 ✓`);
});

await runner.test('t13：D 池亭在**生产求解器 + 真实建图**下双向可达（岸 → 下石 → 上石/亭地面）', async () => {
  const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
  const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
  /* 口径三要素：
     ① 求解器/建图 = 生产模块（`createWalkSolver` + `createWalkGraph`），障碍 = **本区 colliders + layout 基线**
        （区域单测做不到整城 registry，故把基线并进来；这与"只测本区障碍"相比是**加严**而非放宽）；
     ② 图 = 池区局部窗 `x∈[-200,-110]、z∈[0,80]`、`cellSize:1`（t121 的同口径网格）；
     ③ 判据 = **双向** `path()` 均 `ok`（岸→亭、亭→岸），且逐跳 |Δ| ≤ 0.25。 */
  const L = LAYOUT;
  const merged = new Map();
  for (const o of L.OBSTACLES) merged.set(o.id, o);
  for (const o of obstacles) merged.set(o.id, o);
  const solver = createWalkSolver({ layout: L, obstacles: [...merged.values()] });
  const graph = createWalkGraph(solver, {
    layout: L, config: CONFIG, cellSize: 1, maxCells: 3_000_000,
    bounds: { minX: -200, maxX: -110, minZ: 0, maxZ: 80 },
  });
  const pavilion = zoneLayout.slots.find((s) => s.id === 'D-court3-pavilion');
  const laneD = STONE_STEP_LANES.find((l) => l.id === 'D-court3-pavilion');
  const bank = { x: (laneD.corridor.minX + laneD.corridor.maxX) / 2, z: POND.bounds.minZ - 3 };
  const inside = { x: pavilion.x, z: pavilion.z };
  const there = graph.path(bank, inside);
  const back = graph.path(inside, bank);
  assert(there.ok, `岸 → 亭不可达（reason=${there.reason}）`);
  assert(back.ok, `亭 → 岸不可达（reason=${back.reason}）`);
  for (const [p, label] of [[bank, '岸'], [inside, '亭中心']]) {
    const probe = solver.probe(p.x, p.z, null);
    assert(probe.ok, `${label} (${p.x},${p.z}) 应可站立（reasons=${JSON.stringify(probe.reasons)}）`);
  }
  runner.info(`D 池可达（双向）：岸(${bank.x},${bank.z}) ⇄ 亭(${inside.x},${inside.z}) · 去程 ${there.cells} 格 / 回程 ${back.cells} 格 · 亭面 ${solver.probe(inside.x, inside.z, null).surfaceY}m`);
});

/* ========================================================================== */
runner.section('8. 机位与灯位');
/* ========================================================================== */

await runner.test('11 个机位 = 3 原有 + 8 内景（原有 3 个坐标与 layout 逐字段一致）', () => {
  const modes = built.viewpoints.reduce((acc, v) => { acc[v.mode] = (acc[v.mode] ?? 0) + 1; return acc; }, {});
  assert((modes.zone ?? 0) >= 1, '至少 1 个 zone 机位');
  assert((modes['fp-spawn'] ?? 0) >= 1, '至少 1 个 fp-spawn');
  const expected = LAYOUT.VIEWPOINTS.filter((v) => v.area === ZONE);
  assertEqual(built.viewpoints.length, expected.length, '机位数应与 layout 切片一致');
  const interiorVps = built.viewpoints.filter((v) => v.mode === 'interior');
  assertEqual(interiorVps.length, 8, '内景机位 8 个（每栋 1 个）');
  for (const vp of built.viewpoints) {
    const source = LAYOUT.VIEWPOINT_BY_ID[vp.id];
    assert(source, `${vp.id} 不在 layout.VIEWPOINTS 中`);
    assertEqual(vp.position.x, source.position.x, `${vp.id} x`);
    assertEqual(vp.position.y, source.position.y, `${vp.id} y`);
    assertEqual(vp.position.z, source.position.z, `${vp.id} z`);
    assertEqual(vp.target.x, source.target.x, `${vp.id} target.x`);
    assertEqual(vp.target.z, source.target.z, `${vp.id} target.z`);
  }
  const spawn = built.viewpoints.find((v) => v.mode === 'fp-spawn');
  assertClose(spawn.position.y, GROUND_Y + CONFIG.CAMERA.fpEyeHeight, 1e-6, 'fp-spawn 视线高 = 地坪 + 1.65');
});

await runner.test('灯位 = layout 2 + 院落/池畔 11 + 内景补光 16；id 唯一、落在本区地面、不在障碍内', () => {
  const base = LAYOUT.LIGHT_ANCHORS.filter((a) => a.zone === ZONE);
  assertEqual(base.length, 2, 'layout 给 D 的灯位数');
  assertEqual(built.lightAnchors.length, 2 + 11 + 16, '实现灯位数（layout 2 + 本区 11 + 内景 16）');
  const ids = new Set();
  const extra = [];
  const interiorLamps = [];
  for (const anchor of built.lightAnchors) {
    assert(!ids.has(anchor.id), `${anchor.id} 灯位 id 重复`);
    ids.add(anchor.id);
    assert(anchor.zone === ZONE, `${anchor.id} zone 必须是 D`);
    assert(['lantern', 'torch', 'windowGlow'].includes(anchor.kind), `${anchor.id} kind 非法`);
    const surface = LAYOUT.floorYAt(anchor.position.x, anchor.position.z);
    assertClose(anchor.position.y, surface, 1e-6, `${anchor.id} y 必须落在本区地坪`);
    assert(!blockedAt(obstacles, anchor.position.x, anchor.position.z, anchor.position.y), `${anchor.id} 不应落在障碍内`);
    if (anchor.id.startsWith('LA-D-extra-')) { extra.push(anchor.id); continue; }
    if (anchor.id.startsWith('LA-D-interior-')) {
      const fact = built.stats.interiorFacts.find((f) => anchor.id.includes(f.id.replace(/^D-/, '')));
      assert(fact, `${anchor.id} 应能对上某栋内景`);
      assertClose(anchor.position.y, fact.groundY, 1e-6, `${anchor.id} 应落在室内地面上`);
      assert(anchor.position.x >= fact.bounds.minX && anchor.position.x <= fact.bounds.maxX, `${anchor.id} 应在室内（x）`);
      assert(anchor.position.z >= fact.bounds.minZ && anchor.position.z <= fact.bounds.maxZ, `${anchor.id} 应在室内（z）`);
      interiorLamps.push(anchor.id);
      continue;
    }
    assert(base.some((a) => a.id === anchor.id), `${anchor.id} 不是 layout 登记的灯位，也不是本区新增`);
  }
  assertEqual(extra.length, 11, '院落/池畔新增灯位数（4 院 × 院门两侧 2 + 池畔 2 + 后园 1）');
  assertEqual(interiorLamps.length, 16, '内景补光灯位数（8 栋 × 2）');
  runner.info(`灯位 ${built.lightAnchors.length}：layout ${base.length} + 院落/池畔 ${extra.length} + 内景 ${interiorLamps.length}`);
});

await runner.test('内景可达性：门洞轴线↔室内连通、山墙不可穿、封门后室内不可站立、逐栋记录能否从地坪走入', async () => {
  const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
  const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
  const facts = built.stats.interiorFacts;
  const solver = createWalkSolver({ config: CONFIG, layout: LAYOUT, obstacles: built.colliders.obstacles });
  const bounds = { minX: zoneLayout.bounds.minX - 4, maxX: zoneLayout.bounds.maxX + 4, minZ: zoneLayout.bounds.minZ - 4, maxZ: zoneLayout.bounds.maxZ + 4 };
  const graph = createWalkGraph(solver, { cellSize: 2, bounds });
  const EYE = CONFIG.CAMERA.fpEyeHeight;
  const slotOf = (f) => zoneLayout.slots.find((sl) => sl.id === f.id);
  const centerOf = (f) => ({ x: (f.bounds.minX + f.bounds.maxX) / 2, z: (f.bounds.minZ + f.bounds.maxZ) / 2 });
  const inRect = (b, x, z, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
  const walkSteps = (from, dx, dz, total) => {
    let x = from.x; let z = from.z; const len = 0.25;
    for (let i = 0; i < Math.ceil(total / len); i += 1) { const r = solver.step({ x, y: from.y, z }, dx, dz, len, { obstacles: built.colliders.obstacles }); x = r.x; z = r.z; }
    return { x, z };
  };
  /** 地坪探针：在 WK-D-ground 上离门最近、且确实站在本区地坪（0.4）且不被阻挡的点（螺旋采样）。 */
  const groundFace = zoneLayout.walkable.find((w) => w.id === 'WK-D-ground');
  assert(groundFace, '缺少 WK-D-ground');
  const onFace = (x, z) => x >= groundFace.bounds.minX + 0.5 && x <= groundFace.bounds.maxX - 0.5 && z >= groundFace.bounds.minZ + 0.5 && z <= groundFace.bounds.maxZ - 0.5;
  const groundProbe = (slot) => {
    for (let radius = 2; radius <= 40; radius += 1) {
      for (let k = 0; k < 24; k += 1) {
        const a = (k / 24) * Math.PI * 2;
        const x = slot.entrance.x + Math.cos(a) * radius;
        const z = slot.entrance.z + Math.sin(a) * radius;
        if (!onFace(x, z)) continue;
        if (Math.abs(solver.groundAt(x, z) - zoneLayout.groundY) > 0.05) continue;
        if (!solver.probe(x, z).ok) continue;
        return { x, z };
      }
    }
    return null;
  };

  const walkIn = [];
  const blockedIn = [];
  for (const fact of facts) {
    const slot = slotOf(fact);
    const c = centerOf(fact);
    const axis = slot.facing === 'south' || slot.facing === 'north' ? 'z' : 'x';
    const building = built.buildings.find((b) => b.id === fact.id);
    // ① 可站立
    assertClose(solver.groundAt(c.x, c.z), fact.groundY, 0.05, `${fact.id} 室内支撑高度`);
    assert(solver.probe(c.x, c.z).ok, `${fact.id} 室内中心不可站立`);
    // ② 门洞轴线点 ↔ 室内中心 连通 + 沿门轴可走出
    assert(building.door, `${fact.id} 必须登记门洞`);
    const doorPoint = { x: building.door.center.x, z: building.door.center.z };
    const p = graph.path(doorPoint, c);
    assert(p.ok, `${fact.id} 门洞轴线点与室内中心不可达（${p.reason}）`);
    const toFront = axis === 'z'
      ? { dx: 0, dz: Math.sign(slot.entrance.z - slot.z) || -1 }
      : { dx: Math.sign(slot.entrance.x - slot.x) || 1, dz: 0 };
    const reach = (axis === 'z' ? (fact.bounds.maxZ - fact.bounds.minZ) : (fact.bounds.maxX - fact.bounds.minX)) / 2 + 6;
    const moved = walkSteps({ x: c.x, y: fact.groundY + EYE, z: c.z }, toFront.dx, toFront.dz, reach);
    assert(!inRect(fact.bounds, moved.x, moved.z, -0.2), `${fact.id} 沿门轴走不出去（停 ${moved.x.toFixed(1)},${moved.z.toFixed(1)}）`);
    // ③ 山墙不可穿（0.25m 小步累加，避免单次大位移隧穿）
    const sideReach = (axis === 'z' ? (fact.bounds.maxX - fact.bounds.minX) : (fact.bounds.maxZ - fact.bounds.minZ)) / 2 + 6;
    for (const perp of (axis === 'z' ? [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }] : [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }])) {
      const side = walkSteps({ x: c.x, y: fact.groundY + EYE, z: c.z }, perp.dx, perp.dz, sideReach);
      assert(inRect(fact.bounds, side.x, side.z, 0.8), `${fact.id} 沿山墙穿出（停 ${side.x.toFixed(1)},${side.z.toFixed(1)}）`);
    }
    // ④ 封门反例
    const sealed = built.colliders.obstacles.map((o) => (o.buildingId === fact.id ? { ...o, blocks: 'all', door: null } : o));
    assert(!createWalkSolver({ config: CONFIG, layout: LAYOUT, obstacles: sealed }).probe(c.x, c.z).ok, `${fact.id} 封门后室内仍可站立`);
    // ⑤ 从院落地坪能否走入门内（如实记录；被挡必须只是台明落差）
    const from = groundProbe(slot);
    assert(from, `${fact.id} 附近找不到站在地坪且不阻塞的探针点`);
    const fromY = solver.groundAt(from.x, from.z);
    assertClose(fromY, zoneLayout.groundY, 0.05, `${fact.id} 地坪探针必须落在本区地坪`);
    const to = { x: slot.entrance.x - (slot.entrance.x - slot.x) * 0.3, z: slot.entrance.z - (slot.entrance.z - slot.z) * 0.3 };
    const wp = graph.path(from, to);
    const end = wp.ok ? wp.path[wp.path.length - 1] : null;
    const step = +(solver.groundAt(to.x, to.z) - fromY).toFixed(2);
    if (wp.ok && end && inRect(fact.bounds, end.x, end.z, 1.2)) walkIn.push({ id: fact.id, step });
    else blockedIn.push({ id: fact.id, step, reason: wp.ok ? 'goalSnapOutside' : wp.reason });
  }
  for (const b of blockedIn) {
    assert(Math.abs(b.step) > CONFIG.INTERACTION.step.maxStepHeight - 1e-6, `${b.id} 被挡但不是台明落差（step=${b.step}，reason=${b.reason}）`);
  }
  runner.info(`8 栋：门洞可通行 / 山墙不可穿 / 封门后不可站立；从地坪走入门内 ${walkIn.length}/8（${walkIn.map((w) => `${w.id}(阶${w.step})`).join(' / ')}）${blockedIn.length ? `；被挡 ${blockedIn.map((b) => `${b.id}(阶${b.step})`).join(' / ')}` : ''}`);
});

/* ========================================================================== */
runner.section('9. 预算与实例化');
/* ========================================================================== */

// t62：47 栋内景（用户新增需求）使各区新增约 +9~12 桶；D 区初始配额 40 已由主理人按 §8.2 批准重分配（t84 落数值）。
// 本测试同时守住"初始配额"与"已批准配额"两个数，t84 落地后 `Math.max` 自动跟随 config。
/* t93：分区配额**唯一权威源** = `CONFIG.BUDGET.drawCalls.perZone`（audit.mjs 亦读此处）。
   下方 40 仅为**历史诊断目标**（§8.2 重分配前的初始配额），只用于 info 打印，**不参与断言**；
   断言一律与 `perZone.D` 严格比较（不设 `max()` 临时余量 —— 与 t92 对 E 区的收紧同口径）。 */
const D_BUDGET_DIAGNOSTIC_INITIAL = 40;                   // 历史值（文档化，仅打印）
const D_BUDGET_APPROVED = BUDGET.drawCalls.perZone.D;      // t93：唯一权威源（原临时常量 56，已收口）
const D_BUDGET_EFFECTIVE = BUDGET.drawCalls.perZone.D;     // t93：严格等于权威源（不再 max() 临时余量）

await runner.test(`D 区绘制批次 ≤ 已批准预算 ${D_BUDGET_EFFECTIVE}（初始配额 ${D_BUDGET_DIAGNOSTIC_INITIAL}；medium 档，audit 同口径）`, () => {
  const measured = drawCallCount(built.root);
  assert(measured <= D_BUDGET_EFFECTIVE, `绘制批次 ${measured} 超过已批准预算 ${D_BUDGET_EFFECTIVE}`);
  const kitCount = kit.countDrawCalls(built.root);
  assert(kitCount <= D_BUDGET_EFFECTIVE, `kit 口径 ${kitCount} 超已批准预算`);
  runner.info(`D 区 ${measured} 批次：超初始配额 ${D_BUDGET_DIAGNOSTIC_INITIAL}（诊断目标）${measured - D_BUDGET_DIAGNOSTIC_INITIAL} 桶，在已批准 ${D_BUDGET_APPROVED} 内（整城门禁由 audit 保证）`);
  assert(built.stats.drawCalls.preMerge > built.stats.drawCalls.postMerge, '合批必须真的减少批次');
  runner.info(`合批：${built.stats.drawCalls.preMerge} → ${built.stats.drawCalls.postMerge} 批次（audit 口径 ${measured}）；三角面 ${built.stats.triangles}`);
});

await runner.test('树群与宫灯实例化（同形制只保留一份顶点数据）', () => {
  assertEqual(built.stats.treeInstanced, true, '树群必须实例化');
  assertEqual(built.stats.lampInstanced, true, '宫灯必须实例化');
  const instanced = countInstanced(built.root);
  assert(instanced.meshes >= 5, `实例化网格数应 ≥5（实测 ${instanced.meshes}）`);
  assert(instanced.instances >= built.stats.trees + built.stats.lightAnchors, `实例总数应覆盖树 ${built.stats.trees} + 灯 ${built.stats.lightAnchors}（含内景补光）`);
  assertEqual(built.stats.trees, 32, '树数 = layout.VEGETATION（32）');
  assertEqual(built.stats.blossom, 6, '花树数 = layout.VEGETATION.blossomCount（6）');
  runner.info(`实例化：${instanced.meshes} 个 InstancedMesh / ${instanced.instances} 实例（树 ${built.stats.trees} 株含花树 ${built.stats.blossom}，灯 ${built.stats.lightAnchors} 座）`);
});

await runner.test('质量档只改渲染成本：low 档批次更少，建筑/可走性/机位不变', async () => {
  const lowKit = createKit({ THREE, config: CONFIG, quality: 'low' });
  const low = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: lowKit, quality: 'low' }));
  assert(drawCallCount(low.root) < drawCallCount(built.root), 'low 档批次应少于 medium 档');
  assertEqual(low.buildings.length, 14, '质量档不得改变建筑数量');
  assertEqual(low.colliders.walkable.length, built.colliders.walkable.length, '质量档不得改变可走性');
  assertEqual(low.viewpoints.length, built.viewpoints.length, '质量档不得改变机位');
  assertEqual(low.stats.interiorSets, built.stats.interiorSets, '质量档不得改变内景套件数');
  runner.info(`low 档 ${drawCallCount(low.root)} 批次 / ${low.stats.triangles} 三角面（medium ${drawCallCount(built.root)} / ${built.stats.triangles}）`);
});

await runner.test('确定性：两次构建的批次/三角面/包围盒/院落事实一致', () => {
  assertEqual(drawCallCount(built2.root), drawCallCount(built.root), '绘制批次必须可复现');
  assertEqual(built2.stats.triangles, built.stats.triangles, '三角面必须可复现');
  assertEqual(JSON.stringify(built2.stats.bounds), JSON.stringify(built.stats.bounds), '包围盒必须可复现');
  assertEqual(JSON.stringify(built2.stats.details.treeFacts), JSON.stringify(built.stats.details.treeFacts), '树位必须可复现');
});

/* ========================================================================== */
runner.section('10. 行为（update / dispose / 未挂载）');
/* ========================================================================== */

await runner.test('update(dt, elapsed, state) 可运行、不改 state、不挂载 root', () => {
  const stateLike = {
    mode: 'browse', viewMode: 'zone', selectedBuildingId: null, hoveredBuildingId: null,
    timePreset: 'goldenHour', quality: 'medium',
    tourState: { active: false, paused: false, index: 0, id: null },
    loading: { progress: 1, stage: 'ready', failed: null },
  };
  const frozen = JSON.stringify(stateLike);
  for (let i = 0; i < 120; i += 1) built.update(1 / 60, i / 60, stateLike);
  assertEqual(JSON.stringify(stateLike), frozen, 'update 不得改写传入的 state');
  assertEqual(built.root.parent, null, 'update 不得挂载 root');
  assert(built.elapsedSeen > 1.9, 'update 应累计 elapsed');
});

await runner.test('dispose() 幂等、只释放自有几何、不销毁 kit 共享材质', async () => {
  const fresh = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: createKit({ THREE, config: CONFIG, quality: MEASURE_QUALITY }), quality: MEASURE_QUALITY }));
  let owned = 0;
  fresh.root.traverse((node) => { if (node.geometry?.userData?.kitOwned === true) owned += 1; });
  assert(owned > 0, '必须有 kitOwned 几何');
  fresh.dispose();
  fresh.dispose();
  assertEqual(fresh.root.children.length, 0, 'dispose 后 root 应清空');
  assert(kit.materials.pavingStone && kit.materials.pavingStone.type, 'kit 共享材质不得被区域 dispose 销毁');
});

/* ========================================================================== */
runner.section('11. 灰盒替身 kit 兼容（tests/zones.test.mjs 路径）');
/* ========================================================================== */

await runner.test('用 fallback kit 也通过全部契约校验（无 paving/water/实例化时的兜底分支）', async () => {
  const fallbackKit = greybox.createFallbackKit(THREE, CONFIG);
  const result = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: fallbackKit }));
  const { problems, stats } = validateZoneResult(ZONE, result, { THREE, scope: 'zone', expectBuildings: 14 });
  assertNoProblems(problems, 'D 区契约（fallback kit）');
  assertEqual(stats.buildings, 14, 'fallback kit 下的建筑数');
  runner.info(`fallback kit：${stats.meshes} 网格 / ${stats.triangles} 三角面`);
});

/* ========================================================================== */

async function expectThrow(fn, message) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

process.exit(runner.summary());
