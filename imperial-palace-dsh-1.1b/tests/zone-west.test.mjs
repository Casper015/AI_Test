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
 * `blocks='exceptDoor'` 的条目按 CONTRACTS §6.3 只在门洞净宽之外阻挡（门轴 'x' → 门洞是 x 方向的一段）。
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
      const axis = o.door.axis ?? 'x';
      const inDoor = axis === 'x'
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
  assertEqual(contract.stats.walkable, 1, '可行走面数（WK-D-ground）');
  assertEqual(contract.stats.ramps, 1, '坡道数（RD-D-garden-ramp 的 Δy）');
  assertEqual(contract.stats.viewpoints, 3, '机位数（zone + fp-spawn + focus-extra）');
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

await runner.test('池心岛含亭、汀步接到岛边（D 独有：池心亭可走到，E 的水榭为纯观赏）', () => {
  const facts = built.stats.water;
  const pavilion = zoneLayout.slots.find((s) => s.id === 'D-court3-pavilion');
  assert(facts.island, '缺少池心岛事实');
  assertClose(facts.island.x, pavilion.x, 0.01, '池心岛应对准池上小亭 x');
  assertClose(facts.island.z, pavilion.z, 0.01, '池心岛应对准池上小亭 z');
  assert(facts.island.half * 2 > 14, '池心岛应大于亭的占地（14×14）');
  assert(facts.walkway, '缺少汀步石桥');
  assertClose(facts.walkway.x, (POND.bounds.minX + POND.bounds.maxX) / 2, 0.01, '汀步应自池南岸居中进入');
  assert(facts.walkway.half * 2 >= 4, `汀步净宽应 ≥4m（实测 ${facts.walkway.half * 2}）`);
  assert(facts.walkway.fromZ <= POND.bounds.minZ + 0.01, '汀步应自池南岸起');
  assert(facts.walkway.toZ >= POND.bounds.minZ + 8, '汀步应伸入池面 ≥8m');
  assertClose(facts.walkway.toZ, facts.island.z - facts.island.half, 0.01, '汀步终点应正好接在池心岛南沿（不重叠、不留缝）');
  // 对应的可见几何：池心岛与汀步各成节点
  assert(built.root.getObjectByName('D-pond-island'), '缺少池心岛几何');
  assert(built.root.getObjectByName('D-pond-walkway'), '缺少汀步几何');
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

await runner.test('真实走查探针：池面阻挡 / 汀步可通 / 院墙阻挡 / 院门可通（D 独有池心路径）', () => {
  const feet = GROUND_Y;
  // 反例 1：池面（汀步之外）必须被挡住
  const waterProbe = { x: POND.bounds.maxX - 8, z: (POND.bounds.minZ + POND.bounds.maxZ) / 2 };
  assert(blockedAt(obstacles, waterProbe.x, waterProbe.z, feet), `池面 (${waterProbe.x},${waterProbe.z}) 未被拦阻`);
  // 正例 1：汀步中心线必须可通（拦阻盒在汀步处留缺口）
  const walk = built.stats.water.walkway;
  for (const t of [0.2, 0.5, 0.8]) {
    const z = walk.fromZ + (walk.toZ - walk.fromZ) * t;
    const hit = blockedAt(obstacles, walk.x, z, feet);
    assert(!hit, `汀步 (${walk.x},${z}) 被 ${hit?.id} 挡住，池心亭不可达`);
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
  // 正例 4：池心岛台面（亭之外）可走
  const island = built.stats.water.island;
  for (const [dx, dz] of [[-(island.half - 1), 0], [island.half - 1, 0], [0, -(island.half - 1)]]) {
    const hit = blockedAt(obstacles, island.x + dx, island.z + dz, feet);
    assert(!hit, `池心岛 (${island.x + dx},${island.z + dz}) 被 ${hit?.id} 挡住，亭台不可站`);
  }
  runner.info(`走查探针：池面阻挡 ✓ / 汀步 ${(walk.toZ - walk.fromZ).toFixed(0)}m 可通 ✓ / 院墙阻挡 ✓ / 院门 ${gateObstacle.door.width}m 门洞可通 ✓`);
});

/* ========================================================================== */
runner.section('8. 机位与灯位');
/* ========================================================================== */

await runner.test('3 个机位 = layout（坐标逐字段一致），含 1 zone + 1 fp-spawn，视线高合规', () => {
  const modes = built.viewpoints.reduce((acc, v) => { acc[v.mode] = (acc[v.mode] ?? 0) + 1; return acc; }, {});
  assert((modes.zone ?? 0) >= 1, '至少 1 个 zone 机位');
  assert((modes['fp-spawn'] ?? 0) >= 1, '至少 1 个 fp-spawn');
  const expected = LAYOUT.VIEWPOINTS.filter((v) => v.area === ZONE);
  assertEqual(built.viewpoints.length, expected.length, '机位数应与 layout 一致');
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

await runner.test('灯位 = layout 的 2 个 + 本区 11 处；id 唯一、落在本区地坪、不在障碍内', () => {
  const base = LAYOUT.LIGHT_ANCHORS.filter((a) => a.zone === ZONE);
  assertEqual(base.length, 2, 'layout 给 D 的灯位数');
  assertEqual(built.lightAnchors.length, 13, '实现灯位数（layout 2 + 本区 11）');
  const ids = new Set();
  const extra = [];
  for (const anchor of built.lightAnchors) {
    assert(!ids.has(anchor.id), `${anchor.id} 灯位 id 重复`);
    ids.add(anchor.id);
    assert(anchor.zone === ZONE, `${anchor.id} zone 必须是 D`);
    assert(['lantern', 'torch', 'windowGlow'].includes(anchor.kind), `${anchor.id} kind 非法`);
    const surface = LAYOUT.floorYAt(anchor.position.x, anchor.position.z);
    assertClose(anchor.position.y, surface, 1e-6, `${anchor.id} y 必须落在本区地坪`);
    assert(!blockedAt(obstacles, anchor.position.x, anchor.position.z, anchor.position.y), `${anchor.id} 不应落在障碍内`);
    if (anchor.id.startsWith('LA-D-extra-')) extra.push(anchor.id);
    else assert(base.some((a) => a.id === anchor.id), `${anchor.id} 不是 layout 登记的灯位，也不是本区新增`);
  }
  assertEqual(extra.length, 11, '本区新增灯位数（4 院 × 院门两侧 2 + 池畔 2 + 后园 1）');
  runner.info(`灯位 ${built.lightAnchors.length}：layout ${base.length} + 本区 ${extra.length}（院门 8 / 池畔 2 / 后园 1）`);
});

/* ========================================================================== */
runner.section('9. 预算与实例化');
/* ========================================================================== */

await runner.test(`D 区绘制批次 ≤ 预算 ${BUDGET.drawCalls.perZone.D}（medium 档，audit 同口径）`, () => {
  const measured = drawCallCount(built.root);
  assert(measured <= BUDGET.drawCalls.perZone.D, `绘制批次 ${measured} 超过 D 区预算 ${BUDGET.drawCalls.perZone.D}`);
  const kitCount = kit.countDrawCalls(built.root);
  assert(kitCount <= BUDGET.drawCalls.perZone.D, `kit 口径 ${kitCount} 超预算`);
  assert(built.stats.drawCalls.preMerge > built.stats.drawCalls.postMerge, '合批必须真的减少批次');
  runner.info(`合批：${built.stats.drawCalls.preMerge} → ${built.stats.drawCalls.postMerge} 批次（audit 口径 ${measured}）；三角面 ${built.stats.triangles}`);
});

await runner.test('树群与宫灯实例化（同形制只保留一份顶点数据）', () => {
  assertEqual(built.stats.treeInstanced, true, '树群必须实例化');
  assertEqual(built.stats.lampInstanced, true, '宫灯必须实例化');
  const instanced = countInstanced(built.root);
  assert(instanced.meshes >= 5, `实例化网格数应 ≥5（实测 ${instanced.meshes}）`);
  assert(instanced.instances >= built.stats.trees + built.stats.lightAnchors, `实例总数应覆盖树 ${built.stats.trees} + 灯 ${built.stats.lightAnchors}`);
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
  assertEqual(low.viewpoints.length, 3, '质量档不得改变机位');
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
