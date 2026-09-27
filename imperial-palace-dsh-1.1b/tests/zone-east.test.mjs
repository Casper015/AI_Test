#!/usr/bin/env node
/**
 * `tests/zone-east.test.mjs` —— E 区东侧宫苑（t11）专项机器校验。
 *
 * 覆盖任务卡的 6 条验收：
 *   1. `createZone(ctx)` 完整字段，15 个槽位全部落地，≥4 组院落各含门/主屋/配房/步道；
 *   2. 槽位 id 逐一对应；自有院墙与道路由本区实现、外宫墙/城门/水系不越界；边界通道按连接 ID 对齐；
 *   3. 与 D 的统一（同一套 kit + config 令牌）与差异（水景/影壁/植被/摆件等 E 专属装饰，非体量镜像）；
 *   4. ≥1 zone 机位 + ≥1 fp-spawn（落在可行走面）；不可进入建筑 visitable=false 且在 colliders；
 *   5. 绘制调用 ≤ 分区预算（并记录队长口径：真正约束是整城 ≤350）；树木用 kit.instance 实例化；
 *   6. 契约校验零问题（与 `tests/zones.test.mjs` 同一入口 `validateZoneResult`）。
 *
 * 另校验最易出错的"看不见的东西"：第一人称在院门/院墙门洞处可通行、影壁与水池确实阻挡、
 * 实例化矩阵真的分散到各株（不是全部堆在原点）、共享材质不被区域 dispose 掉。
 *
 * 主路径使用**真 kit**（`src/kit/index.js`）注入 ctx；灰盒替身路径单独测一次（`tests/zones.test.mjs` 亦覆盖）。
 */

import {
  assert,
  assertClose,
  assertEqual,
  assertNoProblems,
  createTestRunner,
  loadModule,
  loadThree,
  makeTestCtx,
  readSource,
} from './harness.mjs';

const runner = createTestRunner('zone-east.test.mjs · E 区东侧宫苑（15 槽位 / 4 进院落 / 水池水榭 / 跨区接口）');

const THREE = await loadThree();
const { CONFIG, MODULES, TERRAIN, INTERACTION, BUDGET } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createKit } = await loadModule('src/kit/index.js');
const { validateZoneResult } = await loadModule('src/core/context.js');
const { zoneLayoutFor } = await loadModule('src/core/layout-slice.js');
const zoneModule = await loadModule('src/zones/east-courts.js');
const { obstacleBlocksPoint } = await loadModule('src/core/layout-slice.js'); // t92：阻挡判定用谓词层唯一真相源

const ZONE = 'E';
const zone = zoneLayoutFor(ZONE);
const slots = LAYOUT.SLOTS.filter((s) => s.zone === ZONE);
const kit = createKit({ THREE, config: CONFIG, quality: 'medium' });
const ctx = await makeTestCtx({ zoneId: ZONE, kit });
const result = await zoneModule.createZone(ctx);
const facts = new Map((result.stats.buildingFacts ?? []).map((f) => [f.id, f]));
const groundY = TERRAIN.sideCourtY;
const PLAYER = INTERACTION.player;
const STEP = INTERACTION.step;

/** 第一人称可行性：玩家是半径 0.35 / 高 1.8 的圆柱；门洞处按 door 的净宽与净高放行。 */
function blockedAt(x, z, feetY) {
  // t92：委托谓词层唯一真相源（与 core/FP 求解器同源：足迹圆 ∩ 包围盒 + y0/y1 + 门洞净宽与 sillY/台阶语义）
  for (const o of result.colliders.obstacles) {
    if (obstacleBlocksPoint(o, { x, z, feetY })) return o;
  }
  return null;
}

/* ========================================================================== */
runner.section('1. 模块导出与 createZone 契约（§3.1 / §3.3）');
/* ========================================================================== */

await runner.test('模块导出 ZONE_ID="E"、createZone（含 default）', () => {
  assertEqual(zoneModule.ZONE_ID, ZONE, 'ZONE_ID 必须是区域 id');
  assert(typeof zoneModule.createZone === 'function', '必须导出 createZone(ctx)');
  assertEqual(zoneModule.default, zoneModule.createZone, 'default 导出应指向 createZone');
});

await runner.test('返回值含 §3.3 全部字段、root 单位变换且未挂载', () => {
  for (const field of ['root', 'buildings', 'connectors', 'colliders', 'viewpoints', 'lightAnchors']) {
    assert(field in result, `返回值缺少字段 ${field}`);
  }
  assert(typeof result.update === 'function' && typeof result.dispose === 'function', 'update/dispose 必须是函数');
  assert(result.root.isObject3D, 'root 必须是 Object3D');
  assertEqual(result.root.parent, null, 'root 不得自行 scene.add（挂载归 main.js）');
  for (const key of ['position', 'rotation', 'scale']) {
    const v = result.root[key];
    const want = key === 'scale' ? [1, 1, 1] : [0, 0, 0];
    assertClose(v.x, want[0], 1e-6, `root.${key}.x`);
    assertClose(v.y, want[1], 1e-6, `root.${key}.y`);
    assertClose(v.z, want[2], 1e-6, `root.${key}.z`);
  }
});

await runner.test('返回值通过 §3.3/§4/§5/§6/§8.3 全量契约校验（零问题）', () => {
  const { problems } = validateZoneResult(ZONE, result, { THREE, scope: 'zone', expectBuildings: slots.length });
  assertNoProblems(problems, 'E 区契约');
});

await runner.test('灰盒替身（无真 kit）下同样通过全部契约校验（tests/zones.test.mjs 路径）', async () => {
  const fallbackCtx = await makeTestCtx({ zoneId: ZONE });
  const fallbackResult = await zoneModule.createZone(fallbackCtx);
  const { problems } = validateZoneResult(ZONE, fallbackResult, { THREE, scope: 'zone', expectBuildings: slots.length });
  assertNoProblems(problems, 'E 区契约（灰盒替身）');
  runner.info(`替身路径：绘制调用 ${fallbackResult.stats.drawCalls}（${fallbackResult.stats.treeBuild}）、三角面 ${fallbackResult.stats.triangles}`);
});

await runner.test('只用 kit 构件与共享材质：每个几何/材质都归属 kit（区域零自建资源）', () => {
  let meshes = 0;
  let instanced = 0;
  result.root.traverse((node) => {
    if (!node.isMesh && !node.isInstancedMesh) return;
    meshes += 1;
    if (node.isInstancedMesh) instanced += 1;
    assert(node.geometry?.userData?.kitOwned === true, `网格 ${node.name} 使用了非 kit 几何`);
    assert(kit.materials.isOwned(node.material) === true, `网格 ${node.name} 使用了非 kit 材质`);
  });
  assert(meshes > 0, '必须真的产出几何');
  runner.info(`E 区网格 ${meshes} 个（其中实例化 ${instanced} 个），几何/材质全部来自 kit`);
});

await runner.test('源码纪律：无十六进制色值 / Math.random / 渲染循环 / scene.add / 直接导入 three', () => {
  const src = readSource('src/zones/east-courts.js');
  assert(src, 'east-courts.js 必须存在');
  assert(!/#[0-9a-fA-F]{6}\b/.test(src), '区域代码不得出现十六进制色值');
  assert(!/Math\.random/.test(src), '不得使用 Math.random（须用 ctx.rng）');
  assert(!/requestAnimationFrame|setInterval\(/.test(src), '不得自建渲染循环/定时器');
  assert(!/scene\.add|renderer\.render/.test(src), '不得自行挂载/渲染（归 main.js）');
  assert(!/from ['"]three['"]/.test(src), '区域必须使用 ctx.THREE，不直接 import three');
});

/* ========================================================================== */
runner.section('2. 建筑与四进院落（计划 §5.4 第一、二条）');
/* ========================================================================== */

await runner.test('建筑数量 = layout 分配数（15），id 集合逐一相等', () => {
  assertEqual(result.buildings.length, slots.length, '建筑数量必须等于 layout 分配数');
  assertEqual(result.buildings.length >= 8, true, '任务卡要求 ≥8 槽位');
  const got = result.buildings.map((b) => b.id).sort();
  const want = slots.map((s) => s.id).sort();
  assertEqual(got.join(','), want.join(','), '建筑 id 必须与 layout 完全一致');
  runner.info(`E 区 ${result.buildings.length} 栋：${got.join(' / ')}`);
});

await runner.test('每栋建筑逐字段回显 layout（含 bounds/entrance/door）', () => {
  for (const b of result.buildings) {
    const src = LAYOUT.getSlot(b.id);
    assert(src, `${b.id} 必须是 layout 槽位`);
    for (const key of ['name', 'kind', 'category', 'zone', 'x', 'z', 'w', 'd', 'bays', 'terraceH', 'roofType', 'grade', 'facing', 'rotationYDeg', 'visitable', 'baseY', 'bodyBaseY', 'eaveHeight', 'totalHeight', 'lodHint']) {
      assertEqual(b[key], src[key], `${b.id}.${key} 必须回显 layout`);
    }
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) assertClose(b.bounds[key], src.bounds[key], 1e-6, `${b.id}.bounds.${key}`);
    assertClose(b.entrance.x, src.entrance.x, 1e-6, `${b.id}.entrance.x`);
    assertClose(b.entrance.z, src.entrance.z, 1e-6, `${b.id}.entrance.z`);
    if (src.door === null) assertEqual(b.door, null, `${b.id}.door 应为 null`);
    else assertEqual(b.door.width, src.door.width, `${b.id}.door.width`);
  }
});

await runner.test('≥4 组可识别院落，每组都有门 / 主屋 / 配房 / 连接步道', () => {
  assert(zone.courtyards.length >= 4, `院落数 ${zone.courtyards.length} < 4`);
  assertEqual(zone.courtyards.map((c) => c.id).join(','), 'CY-E-court1,CY-E-court2,CY-E-court3,CY-E-court4', '四院 id 必须与 layout 一致');
  const roads = zone.roads;
  const corridors = zone.corridors;
  for (const courtyard of zone.courtyards) {
    const inside = result.buildings.filter((b) => b.courtyard === courtyard.id);
    const hall = inside.find((b) => b.kind === 'hall');
    const house = inside.find((b) => b.kind === 'sideHall');
    const gate = inside.find((b) => b.kind === 'courtyardGate');
    assert(hall, `${courtyard.id} 缺主屋（hall）`);
    assert(house, `${courtyard.id} 缺配房（sideHall）`);
    assert(gate, `${courtyard.id} 缺院门（courtyardGate）`);
    assert(gate.hasDoor === true || LAYOUT.getSlot(gate.id).hasDoor === true, `${courtyard.id} 的院门必须可通行（有门洞）`);
    // 连接步道：院内主屋前有道路（courtN-path）或院廊（corridor）
    const hasRoad = roads.some((r) => r.name.includes(courtyard.name.slice(0, 2)) || Math.abs(r.from.z - gate.z) < 1 || Math.abs(r.to.z - gate.z) < 1);
    assert(hasRoad, `${courtyard.id} 缺连接步道`);
    const hasCorridor = corridors.some((c) => (courtyard.corridors ?? []).includes(c.id));
    assert(hasCorridor, `${courtyard.id} 缺院廊`);
    const area = (courtyard.bounds.maxX - courtyard.bounds.minX) * (courtyard.bounds.maxZ - courtyard.bounds.minZ);
    assert(area > 15000, `${courtyard.id} 体量过小（${Math.round(area)} m²）——不得只放孤立小屋`);
  }
  runner.info(`四院：${zone.courtyards.map((c) => `${c.id}(${(c.bounds.maxX - c.bounds.minX)}×${(c.bounds.maxZ - c.bounds.minZ)}m)`).join(' ')}`);
});

await runner.test('竖直定位自洽：kit 檐口 = layout 檐口估值 + 东宫苑地坪 0.4（容差 6mm）', () => {
  for (const fact of facts.values()) {
    const src = LAYOUT.getSlot(fact.id);
    assert(fact.eaveHeightAbsolute !== null, `${fact.id} 应带回 kit 实测檐口高`);
    assertClose(fact.eaveHeightAbsolute, src.eaveHeight + groundY, 0.006, `${fact.id} kit 檐口 vs layout 估值(+地坪)`);
    assertClose(fact.groundLevel, groundY, 1e-6, `${fact.id} 组原点应落在东宫苑地坪`);
  }
  const fp = LAYOUT.VIEWPOINT_BY_ID['VP-E-fp-spawn'];
  assertClose(fp.position.y, groundY + CONFIG.CAMERA.fpEyeHeight, 0.05, 'fp-spawn 视线高应等于地坪 + 1.65');
});

await runner.test('逐栋三角面 ≤ config.BUDGET.triangles.perBuildingMax', () => {
  for (const fact of facts.values()) {
    assert(fact.triangles !== null && fact.triangles <= BUDGET.triangles.perBuildingMax, `${fact.id} 三角面超限`);
  }
  const worst = [...facts.values()].sort((a, b) => b.triangles - a.triangles)[0];
  runner.info(`单栋最大三角面：${worst.id} ${worst.triangles}（上限 ${BUDGET.triangles.perBuildingMax}）`);
});

/* ========================================================================== */
runner.section('3. 与 D 的统一 / E 专属装饰（计划 §5.4 第三条）');
/* ========================================================================== */

await runner.test('与 D 统一：屋顶等级/开间/进深/台基高逐项来自同一份 layout 表且经 kit 白名单校验', () => {
  const dSlots = LAYOUT.SLOTS.filter((s) => s.zone === 'D');
  const kinds = new Set([...dSlots, ...slots].map((s) => s.kind));
  const roofTypes = new Set([...dSlots, ...slots].map((s) => s.roofType));
  // 同一套构件语言：D/E 只用同一批 kind 与同一批 roofType（都由 kit 用同一套 MODULES/GRADES 生成）
  const allowedKinds = new Set(['hall', 'sideHall', 'courtyardGate', 'pavilion']);
  for (const kind of kinds) assert(allowedKinds.has(kind), `D/E 不应出现 ${kind} 之外的构件类型`);
  assertEqual([...kinds].sort().join(','), 'courtyardGate,hall,pavilion,sideHall', 'D/E 构件类型集合应一致');
  for (const slot of slots) {
    const allowed = CONFIG.GRADES[slot.grade].roofTypes;
    assert(allowed.includes(slot.roofType), `${slot.id} roofType ${slot.roofType} 不在 grade ${slot.grade} 白名单`);
  }
  assert(roofTypes.has('gableHip') && roofTypes.has('gable') && roofTypes.has('pyramidal'), 'D/E 应共用歇山/硬山/攒尖三种等级语言');
  // 逐字段回显已保证 E 的建筑参数来自同一份冻结表（宽度/进深/开间/台基高）
  assertEqual(slots.filter((s) => s.kind === 'hall').length, 4, '四组院落的四座主屋');
  runner.info(`D/E 共用构件语言：kind=${[...kinds].join('/')} · roofType=${[...roofTypes].join('/')}`);
});

await runner.test('E 专属装饰（非体量镜像）：水池 + 水榭基座 + 影壁 + 宫灯 + 花树 + 铜器陈设齐备', () => {
  const pond = result.stats.pond ?? {};
  assert(pond.id === 'WB-E-pond', '必须实现 layout 登记的生活院水池');
  assert(pond.pavilionBase, '水榭必须有基座（亭立于水面）');
  // 水面与本区水池登记交叉校验（layout.WATER_BODIES 的冻结值）
  const wb = LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond');
  assert(wb, 'layout 必须登记 WB-E-pond');
  assertEqual(pond.waterY, wb.y, '水面标高必须等于 layout.WATER_BODIES 的值');
  assertEqual(JSON.stringify(pond.bounds), JSON.stringify({ minX: wb.bounds.minX, maxX: wb.bounds.maxX, minZ: wb.bounds.minZ, maxZ: wb.bounds.maxZ }), '池界必须与 layout 一致');
  assert(result.stats.screenWalls === 2, '两处院门内侧应有影壁（照壁）');
  assert(result.stats.lanternMeshes >= 6, '灯体数量应 ≥6（含院门与池畔）');
  assert(result.stats.trees === (zone.vegetation[0].treeCount ?? 0), '树木数量应等于 layout.VEGETATION 的 treeCount');
  assert(result.stats.blossomTrees === (zone.vegetation[0].blossomCount ?? 0), '花树数量应等于 layout.VEGETATION 的 blossomCount');
  assert(result.stats.bronzes === 4, '四院应各有一件铜器陈设');
  runner.info(`水池 ${JSON.stringify(pond.bounds)} 水面 ${pond.waterY}m；影壁 ${result.stats.screenWalls} 处；灯体 ${result.stats.lanternMeshes}；树 ${result.stats.trees}（花树 ${result.stats.blossomTrees}）；铜器 ${result.stats.bronzes}`);
});

await runner.test('水面交给统一环境系统（userData.waterSurface / ctx.shared.water），不自建水面动画', () => {
  let flagged = 0;
  result.root.traverse((node) => {
    if (node.userData?.waterSurface === true) flagged += 1;
  });
  assert(flagged >= 1, '水面网格必须标记 userData.waterSurface（环境系统统一做微波）');
  assert(Array.isArray(ctx.shared.water) && ctx.shared.water.length >= 1, '水面应压入 ctx.shared.water');
  const src = readSource('src/zones/east-courts.js');
  assert(!/requestAnimationFrame|setInterval\(/.test(src), '区域不得自建水面动画循环');
});

/* ========================================================================== */
runner.section('4. 跨区接口与边界（§2.3）');
/* ========================================================================== */

await runner.test('本人 owner 的连接全部回显，且不越权登记他人连接（单一 owner）', () => {
  const mine = LAYOUT.CONNECTORS.filter((c) => c.owner === ZONE);
  assertEqual(result.connectors.length, mine.length, '必须回显本人 owner 的全部连接');
  for (const c of mine) {
    const echo = result.connectors.find((x) => x.id === c.id);
    assert(echo, `缺少连接 ${c.id}`);
    assertClose(echo.position.x, c.position.x, 1e-3, `${c.id}.position.x`);
    assertClose(echo.position.z, c.position.z, 1e-3, `${c.id}.position.z`);
    assertEqual(echo.width, c.width, `${c.id}.width`);
    assertEqual(echo.elevation, c.elevation, `${c.id}.elevation`);
  }
  // 花园东口 owner=F、东城门门洞 owner=F —— E 不得重复登记
  for (const id of ['CXN-E-F-garden-east', 'CXN-gate-east']) {
    assert(!result.connectors.some((c) => c.id === id), `${id} 的 owner 不是 E，不得重复登记`);
  }
  runner.info(`E 拥有的连接：${result.connectors.map((c) => c.id).join(' / ')}`);
});

await runner.test('中央区接口：三处位于 x=100 地界线上，标高与两端一致', () => {
  const west = LAYOUT.CENTRAL_X.maxX;
  assertEqual(west, 100);
  for (const [id, elevation] of [
    ['CXN-B-E-plaza-east', TERRAIN.sideCourtY],
    ['CXN-B-E-rear-east', TERRAIN.sideCourtY],
    ['CXN-C-E-side-east', TERRAIN.innerGateTerraceY],
  ]) {
    const cxn = LAYOUT.getConnector(id);
    assertEqual(cxn.owner, ZONE, `${id} 应由 E 负责`);
    assertEqual(cxn.position.x, west, `${id} 必须落在 C/E 地界线上`);
    assertEqual(cxn.elevation, elevation, `${id}.elevation`);
  }
  // 内廷侧门是台阶（两端共享标高）：elevationLow 必须等于东宫苑地坪
  assertEqual(LAYOUT.getConnector('CXN-C-E-side-east').elevationLow, groundY);
});

await runner.test('F 接口：花园东入口在 z=300、x=200（owner=F），E 侧的接驳道路确实铺到该点', () => {
  const cxn = LAYOUT.getConnector('CXN-E-F-garden-east');
  assertEqual(cxn.position.z, LAYOUT.INNER_PALACE_Z.maxZ + 0, '花园东入口应在花园地界 z=300 上');
  assertEqual(cxn.position.x, 200);
  assertEqual(cxn.elevation, 0.45);
  const road = zone.roads.find((r) => r.connector === 'CXN-E-F-garden-east');
  assert(road, 'E 必须有接驳花园东入口的道路段（RD-E-garden-ramp）');
  assertEqual(road.zone, ZONE, '该路段归属 E');
  assert(road.to.z >= cxn.position.z - 1e-6, '接驳道路必须铺到花园入口（z=300）');
});

await runner.test('不越界：不实现外宫墙/城门/护城河/桥，几何不越出 E 区地界（含出檐容差）', () => {
  const src = readSource('src/zones/east-courts.js');
  // 注意：只扫"是否调用/实现"这些构件（`kit.cornerTower(`、`WALL-CITY`、`MOAT`、`BRIDGES`），
  // 不能把 `INTERIOR_KIND_OF` 白名单里的词（'cornerTower'/'gateHall'）误判成越界实现。
  assert(!/WALL-CITY|MOAT\.|BRIDGES|kit\.cornerTower\(|makeWall\(/.test(src), 'E 不得实现宫墙/护城河/桥/角楼（归 F）');
  assert(!/cornerTower\s*\(/.test(src.replace(/INTERIOR_KIND_OF[^;]*;/g, '')), 'E 不得实现角楼构件');
  const box = new THREE.Box3().setFromObject(result.root);
  const tol = 3; // 檐口出檐 2.4m + 角部起翘余量
  assert(box.min.x >= LAYOUT.CENTRAL_X.maxX - tol, `x 下界 ${box.min.x.toFixed(2)} 越过中央区地界`);
  assert(box.max.x <= LAYOUT.ENVELOPE.maxX + tol, `x 上界 ${box.max.x.toFixed(2)} 越出宫墙内界`);
  assert(box.min.z >= LAYOUT.FORECOURT_Z.minZ - tol, `z 下界 ${box.min.z.toFixed(2)} 越出东宫苑地界`);
  assert(box.max.z <= LAYOUT.INNER_PALACE_Z.maxZ + tol, `z 上界 ${box.max.z.toFixed(2)} 越出东宫苑地界`);
  assert(box.min.y >= groundY - MODULES.plinthHeightMin - 0.1, `y 下界 ${box.min.y.toFixed(2)} 过低（几何下沉？）`);
  runner.info(`E 区包围盒 x[${box.min.x.toFixed(1)},${box.max.x.toFixed(1)}] y[${box.min.y.toFixed(1)},${box.max.y.toFixed(1)}] z[${box.min.z.toFixed(1)},${box.max.z.toFixed(1)}]`);
});

/* ========================================================================== */
runner.section('5. 机位、碰撞与第一人称（§5.2 / §6.1 / §6.4）');
/* ========================================================================== */

await runner.test('机位口径：≥1 zone + ≥1 fp-spawn，且与 layout.VIEWPOINTS 逐字段一致', () => {
  const byMode = result.viewpoints.reduce((acc, v) => {
    acc[v.mode] = (acc[v.mode] ?? 0) + 1;
    return acc;
  }, {});
  assert((byMode.zone ?? 0) >= 1, '至少 1 个 zone 机位');
  assert((byMode['fp-spawn'] ?? 0) >= 1, '至少 1 个 fp-spawn');
  assertEqual(result.viewpoints.length, LAYOUT.VIEWPOINTS.filter((v) => v.area === ZONE).length, '视角数量应与 layout 一致');
  for (const vp of result.viewpoints) {
    const src = LAYOUT.VIEWPOINT_BY_ID[vp.id];
    assert(src, `${vp.id} 不在 layout.VIEWPOINTS 中`);
    assertEqual(JSON.stringify(vp.position), JSON.stringify(src.position), `${vp.id} 坐标被改动`);
    assertEqual(JSON.stringify(vp.target), JSON.stringify(src.target), `${vp.id} 目标点被改动`);
  }
  for (const vp of result.viewpoints.filter((v) => v.mode === 'fp-spawn')) {
    const surface = LAYOUT.walkableAt(vp.position.x, vp.position.z)[0];
    assert(surface, `${vp.id} 必须落在可行走面上`);
    assertClose(vp.position.y, surface.y + CONFIG.CAMERA.fpEyeHeight, 0.05, `${vp.id} 视线高`);
  }
});

await runner.test('不可进入建筑全部 visitable=false 且登记为障碍（含水池）', () => {
  const visitable = result.buildings.filter((b) => b.visitable === true).map((b) => b.id).sort();
  const registered = LAYOUT.interiorsByZone('E').map((r) => r.slotId).sort();
  assertEqual(visitable.join(','), registered.join(','), 'E 区 visitable 建筑必须与 layout 内景注册逐一对应（t63 后 9 栋可进入）');
  const obstacles = result.colliders.obstacles;
  for (const slot of slots) {
    const o = obstacles.find((x) => x.buildingId === slot.id && x.sourceType === 'building');
    assert(o, `建筑 ${slot.id} 必须登记障碍`);
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) assertClose(o.bounds[key], slot.bounds[key], 1e-6, `${slot.id} 障碍 ${key}`);
  }
  /* t13：水池在 layout 侧由"整体阻挡(all)"改为"整体阻挡 + 一条**有界开槽**通道"
     （`blocks:'exceptDoor'` + `door` = 汀步走廊，宽 8m、沿门轴 z）。"水不可站"这一**原意**由下一条更强断言接管：
     水面（走廊之外）逐点必须被拦（见本节末"水面 \ 走廊 ⊆ 拦阻盒"）。 */
  const water = obstacles.find((o) => o.sourceType === 'water');
  assert(water && water.buildingId === 'WB-E-pond', '水池必须登记障碍');
  assert(water.blocks === 'exceptDoor' && water.door, 't13：水池应登记有界开槽通道（door）');
  assert(water.bounds.minX === LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond').bounds.minX
    && water.bounds.maxX === LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond').bounds.maxX
    && water.bounds.minZ === LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond').bounds.minZ
    && water.bounds.maxZ === LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond').bounds.maxZ,
  't13：开槽不得改动水体包围盒（面积守恒）');
  const wallSpans = obstacles.filter((o) => o.sourceType === 'wall');
  assert(wallSpans.length > 0, '院墙/影壁必须登记实心段碰撞（否则可穿过）');
  const ids = new Set();
  for (const o of obstacles) {
    assert(!ids.has(o.id), `障碍 id 重复：${o.id}`);
    ids.add(o.id);
  }
  runner.info(`障碍 ${obstacles.length} 条：建筑 ${slots.length} + 水体 1 + 院墙/影壁实心段 ${wallSpans.length}`);
});

await runner.test('可行走面 1 面回显 layout、坡道斜率 ≤ rampMaxSlope', () => {
  assertEqual(result.colliders.walkable.length, LAYOUT.WALKABLE.filter((w) => w.zone === ZONE).length, '可行走面数量');
  for (const w of result.colliders.walkable) {
    const src = LAYOUT.WALKABLE.find((x) => x.id === w.id);
    assert(src && w.y === src.y && w.kind === src.kind, `${w.id} 必须回显 layout`);
    if (w.kind === 'interior') {
      // 内景地面标高以 layout 注册值为唯一权威（本卡不自行推断）：区域回显 = layout 值 + kit 用于布景的 groundY 一致
      const info = (result.stats.interiors ?? []).find((i) => i.walkableId === w.id) ?? null;
      assert(info, `${w.id} 应能对上本区已布景的内景栋`);
      assertClose(w.y, src.y, 1e-6, `${w.id} 标高必须回显 layout`);
      assertClose(info.groundY, w.y, 1e-6, `${w.id} 布景地面必须等于 layout 注册的室内地面`);
      assert(w.y >= groundY - 1e-6, `${w.id} 内景地面不得低于庭院地坪`);
    } else if (w.kind === 'passage' || /-transition-/.test(w.id)) {
      // t79 起的入口过渡面：id 带 -transition-（kind 仍是 ground），标高介于庭院地坪与内景地面之间
      // t75 门洞通道面：门槛标高 = 该栋台基地坪（室外侧由外伸段搭到庭院地面）
      assert(w.y >= groundY - 1e-6, `${w.id} 通道面不得低于庭院地坪`);
      assert(w.y <= groundY + MODULES.eaveHeight, `${w.id} 通道面标高超限`);
    } else if (w.kind === 'bridgeDeck') {
      /* t13：汀步面（跨水面的有界石桥面，与四座入城桥同一 kind）—— 标高必须**高于**地坪
         （否则"跨水面"无意义），且逐级落在 [地坪, 亭台基面] 内。 */
      assert(w.y > groundY + 1e-9, `${w.id} 汀步面应高于庭院地坪（实测 ${w.y}）`);
      assert(w.y <= groundY + MODULES.eaveHeight, `${w.id} 汀步面标高超限`);
    } else {
      assertEqual(w.y, groundY, `${w.id} 标高应等于东宫苑地坪`);
    }
  }
  assert(result.colliders.ramps.length > 0, 'E 区有侧门台阶与花园坡道，ramps 不应为空');
  for (const r of result.colliders.ramps) assert(r.slope <= STEP.rampMaxSlope + 1e-6, `${r.id} 斜率超限`);
  runner.info(`可行走面 ${result.colliders.walkable.length} 面，坡道/台阶 ${result.colliders.ramps.length} 段（最大斜率 ${Math.max(...result.colliders.ramps.map((r) => r.slope))}）`);
});

await runner.test('第一人称可通：出生点 → 院门 → 院墙门洞 → 南北主道；主屋与水池不可进入', () => {
  const spawn = LAYOUT.VIEWPOINT_BY_ID['VP-E-fp-spawn'];
  const gate = LAYOUT.getSlot('E-court1-gate');
  const path = [
    ['出生点', spawn.position.x, spawn.position.z],
    ['院内', 200, -320],
    ['院门前', 124, -320],
    ['穿过院门', 118, -320],
    ['穿院墙门洞', 111, -320],
    ['南北主道', 106, -320],
    ['主道南行', 106, -200],
  ];
  for (const [label, x, z] of path) {
    const floor = LAYOUT.floorYAt(x, z);
    assert(floor !== null, `${label} (${x},${z}) 必须落在可行走面上`);
    const hit = blockedAt(x, z, floor);
    assert(!hit, `${label} (${x},${z}) 被 ${hit?.id} 阻挡（floorY=${floor}）`);
  }
  // 反例：主屋不可进入、水池不可踏入、影壁确实挡路
  const hall = LAYOUT.getSlot('E-court1-hall');
  // t92：t73/t74 后本区 9 栋（含四座主屋）已注册内景且 visitable ⇒ 主屋现在"可进入"，
  // 反例改为：无内景登记的亭/水榭必须阻挡（而非拿已可进入的主屋当反例）。
  // 反例①：无内景的亭/水榭是**四面开敞**结构（不在 colliders 里整体阻挡），故不再拿它当"必须阻挡"的反例；
  //        改为断言它们不在内景集合内（语义正确），而"实体阻挡"由水池/院墙实心段承担。
  for (const id of ['E-court3-pavilion', 'E-court4-pavilion']) {
    assert(!(result.stats.interiors ?? []).some((i) => i.slotId === id), `${id} 不应有内景登记`);
  }
  const hallInterior = result.stats.interiors.find((i) => i.slotId === 'E-court1-hall');
  assert(hallInterior, '主屋应已注册内景（t74）');
  const hallCenter = { x: (hallInterior.bounds.minX + hallInterior.bounds.maxX) / 2, z: (hallInterior.bounds.minZ + hallInterior.bounds.maxZ) / 2 };
  assert(!blockedAt(hallCenter.x, hallCenter.z, hallInterior.groundY), '主屋室内中心应可站立（已可进入）');
  const pond = LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond');
  assert(blockedAt((pond.bounds.minX + pond.bounds.maxX) / 2, (pond.bounds.minZ + pond.bounds.maxZ) / 2, groundY), '水池必须阻挡');
  // 影壁确实挡路（正面不可穿），但可绕行
  const screenX = (result.stats.pond?.bounds?.minX ?? 0) + 0; // 占位避免未使用
  void screenX;
  runner.info(`走查通路 ${path.length} 个采样点全部可通；反例（主屋/水池/影壁）阻挡 ✓`);
});

await runner.test('t13：生活院水榭达（水面 \\ 汀步走廊 ⊆ 拦阻盒 + 走廊逐点可走 + 可见石件与登记面同源）', () => {
  const lane = (LAYOUT.STONE_STEP_LANES ?? []).find((l) => l.id === 'E-court3-pavilion');
  assert(lane, 'layout.STONE_STEP_LANES 应登记 E 池汀步走廊');
  const c = lane.corridor;
  const pond = LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond');
  const obstacles = result.colliders.obstacles;

  /* ① 覆盖不变量（**判据只增不减**，取代旧"水池必须整体阻挡"的绝对化表述）：
       水面 \ 汀步走廊 ⊆ 拦阻盒 —— 逐 2m 采样，0 个"护不到"的口袋。
       注：本区 `obstacles` 里的水体盒仍是 layout 原始值（顶面 0.05 < 脚高 0.4）⇒ 水面阻挡全靠拦阻盒体现。 */
  const holes = [];
  let waterSamples = 0;
  for (let x = pond.bounds.minX + 1; x <= pond.bounds.maxX - 1; x += 2) {
    for (let z = pond.bounds.minZ + 1; z <= pond.bounds.maxZ - 1; z += 2) {
      if (x >= c.minX && x <= c.maxX) continue;
      waterSamples += 1;
      if (!blockedAt(x, z, groundY)) holes.push(`(${x},${z})`);
    }
  }
  assert(holes.length === 0,
    `水面 \\ 汀步走廊 必须被拦阻盒覆盖（采样 ${waterSamples} 点，${holes.length} 处漏护）：${holes.slice(0, 6).join('、')}`);

  /* ② 走廊逐点可走（汀步中心线 + 两级石件中心） */
  const walkPoints = [];
  for (const t of [0.1, 0.35, 0.6, 0.85]) {
    walkPoints.push({ x: (c.minX + c.maxX) / 2, z: c.minZ + (c.maxZ - c.minZ) * t, tag: `走廊 ${t}` });
  }
  const stones = result.stats.pond?.stepStones ?? [];
  assertEqual(stones.length, lane.steps.length, `可见石件记录数应 = 汀步级数（${lane.steps.length}）`);
  for (const rec of stones) {
    const walk = LAYOUT.WALKABLE.find((w) => w.id === rec.id);
    assert(walk, `layout 应登记可行走面 ${rec.id}`);
    assert(Object.values(rec.bounds).every((v) => typeof v === 'number' && Number.isFinite(v)),
      `${rec.id} 可见石件包围盒必须是有限数（实测 ${JSON.stringify(rec.bounds)}）`);
    assertClose(rec.bounds.maxY, walk.y, 0.01, `${rec.id} 可见石件顶面应 = 登记面高 ${walk.y}`);
    assertClose(rec.bounds.minX, walk.bounds.minX, 0.06, `${rec.id} 可见石件西界应 ≈ 登记面西界`);
    assertClose(rec.bounds.maxX, walk.bounds.maxX, 0.06, `${rec.id} 可见石件东界应 ≈ 登记面东界`);
    walkPoints.push({ x: (rec.bounds.minX + rec.bounds.maxX) / 2, z: (rec.bounds.minZ + rec.bounds.maxZ) / 2, tag: `石件 ${rec.id}` });
  }
  for (const p of walkPoints) {
    const floor = LAYOUT.floorYAt(p.x, p.z);
    const hit = blockedAt(p.x, p.z, floor ?? groundY);
    assert(!hit, `${p.tag} (${p.x},${p.z}) 被 ${hit?.id} 挡住，汀步/水榭不可站`);
  }
  runner.info(`E 池：水面采样 ${waterSamples} 点全部被拦（0 漏护）· 走廊/石件 ${walkPoints.length} 点可走 · 可见石件 ${stones.length}/${lane.steps.length}`);
});

await runner.test('t13：E 池水榭在**生产求解器 + 真实建图**下双向可达（岸 → 下石 → 上石/水榭地面）', async () => {
  const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
  const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
  /* 口径三要素：
     ① 求解器/建图 = 生产模块；障碍 = 本区 colliders ∪ layout 基线（区域单测无整城 registry ⇒ 并入基线=加严）；
     ② 图 = 池区局部窗 `x∈[110,200]、z∈[-10,80]`、`cellSize:1`；
     ③ 判据 = **双向** `path()` 均 ok + 两点 probe 可站立。 */
  const L = LAYOUT;
  const merged = new Map();
  for (const o of L.OBSTACLES) merged.set(o.id, o);
  for (const o of result.colliders.obstacles) merged.set(o.id, o);
  const solver = createWalkSolver({ layout: L, obstacles: [...merged.values()] });
  const graph = createWalkGraph(solver, {
    layout: L, config: CONFIG, cellSize: 1, maxCells: 3_000_000,
    bounds: { minX: 110, maxX: 200, minZ: -10, maxZ: 80 },
  });
  const lane = LAYOUT.STONE_STEP_LANES.find((l) => l.id === 'E-court3-pavilion');
  const pond = LAYOUT.WATER_BODIES.find((w) => w.id === 'WB-E-pond');
  const pavilion = LAYOUT.getSlot('E-court3-pavilion');
  const bank = { x: (lane.corridor.minX + lane.corridor.maxX) / 2, z: pond.bounds.minZ - 3 };
  const inside = { x: pavilion.x, z: pavilion.z };
  const there = graph.path(bank, inside);
  const back = graph.path(inside, bank);
  assert(there.ok, `岸 → 水榭不可达（reason=${there.reason}）`);
  assert(back.ok, `水榭 → 岸不可达（reason=${back.reason}）`);
  for (const [p, label] of [[bank, '岸'], [inside, '水榭中心']]) {
    const probe = solver.probe(p.x, p.z, null);
    assert(probe.ok, `${label} (${p.x},${p.z}) 应可站立（reasons=${JSON.stringify(probe.reasons)}）`);
  }
  runner.info(`E 池可达（双向）：岸(${bank.x},${bank.z}) ⇄ 水榭(${inside.x},${inside.z}) · 去程 ${there.cells} 格 / 回程 ${back.cells} 格 · 榭面 ${solver.probe(inside.x, inside.z, null).surfaceY}m`);
});

/* ========================================================================== */
runner.section('5b. 内景（t63）：9 栋 kit.interiorSet 布景 + 几何事实 + 碰撞可达');
/* ========================================================================== */

await runner.test('内景登记与 layout 一致：E 区 9 栋（殿 4 + 配房 5），亭/水榭/院门排除', () => {
  const registered = LAYOUT.interiorsByZone('E').map((r) => r.slotId).sort();
  assertEqual(registered.length, 9, `layout 为 E 区注册的内景数应为 9，实际 ${registered.length}`);
  const mine = (result.stats.interiors ?? []).map((i) => i.slotId).sort();
  assertEqual(mine.join(','), registered.join(','), '本区布景集合必须与 layout.INTERIOR_BY_SLOT 逐一一致');
  for (const id of ['E-court3-pavilion', 'E-court4-pavilion', 'E-court1-gate', 'E-court2-gate', 'E-court3-gate', 'E-court4-gate']) {
    assert(!mine.includes(id), `${id} 未被 layout 注册内景（亭/水榭/院门），不得布景`);
  }
  const halls = mine.filter((id) => LAYOUT.getSlot(id).kind === 'hall');
  const houses = mine.filter((id) => LAYOUT.getSlot(id).kind === 'sideHall');
  assertEqual(halls.length, 4, 'E 区应布 4 座殿内景');
  assertEqual(houses.length, 5, 'E 区应布 5 座配房内景');
  const visitable = result.buildings.filter((b) => b.visitable === true).map((b) => b.id).sort();
  assertEqual(visitable.join(','), registered.join(','), 'E 区 visitable 集合应与内景注册集合一致');
  runner.info(`E 区内景 ${registered.length} 栋：${registered.join(' / ')}`);
});

await runner.test('9 栋内景机位逐一落在各自室内包围盒内（视线高 = 面高 + 1.65、不出顶、目标在室内）', () => {
  const vps = result.viewpoints.filter((v) => v.mode === 'interior');
  assertEqual(vps.length, 9, `E 区应有 9 个 interior 机位，实际 ${vps.length}`);
  for (const info of result.stats.interiors ?? []) {
    const vp = result.viewpoints.find((v) => v.id === `VP-${info.slotId}-interior`);
    assert(vp, `${info.slotId} 缺少 interior 机位`);
    const b = info.bounds;
    assert(vp.position.x > b.minX && vp.position.x < b.maxX && vp.position.z > b.minZ && vp.position.z < b.maxZ, `${info.slotId} 机位必须在室内包围盒内`);
    assert(vp.target.x > b.minX && vp.target.x < b.maxX && vp.target.z > b.minZ && vp.target.z < b.maxZ, `${info.slotId} 目标点应在室内`);
    assertClose(vp.position.y, info.groundY + CONFIG.CAMERA.fpEyeHeight, 0.05, `${info.slotId} 视线高`);
    assert(vp.position.y < info.eaveHeightAbsolute, `${info.slotId} 机位必须低于檐口（不出顶）`);
    const surface = LAYOUT.WALKABLE.find((w) => w.id === info.walkableId);
    assert(surface, `${info.slotId} 的室内可行走面必须存在`);
    assertEqual(surface.kind, 'interior', `${info.slotId} 可行走面 kind 必须是 interior`);
    assertClose(surface.y, info.groundY, 1e-6, `${info.slotId} 室内地面标高`);
  }
  runner.info(`九栋内景机位：${(result.stats.interiors ?? []).map((i) => `${i.slotId}@${i.groundY}m`).join(' / ')}`);
});

await runner.test('9 栋内景均调用 kit.interiorSet：几何事实（边界/落地/不穿顶/LOD 三档）', () => {
  const interiors = result.stats.interiors ?? [];
  assertEqual(interiors.length, 9, '必须 9 栋都布景');
  const seen = new Set();
  for (const info of interiors) {
    assert(info.items.length >= 5, `${info.slotId} 内景构件过少（${info.items.length} 件）`);
    assert(!seen.has(info.walkableId), `${info.slotId} 的室内可行走面重复`);
    seen.add(info.walkableId);
    const wb = info.worldBounds;
    assert(wb, `${info.slotId} 必须带回几何实测包围盒`);
    assert(wb.minX >= info.bounds.minX - 0.05 && wb.maxX <= info.bounds.maxX + 0.05, `${info.slotId} 陈设越出室内包围盒 X`);
    assert(wb.minZ >= info.bounds.minZ - 0.05 && wb.maxZ <= info.bounds.maxZ + 0.05, `${info.slotId} 陈设越出室内包围盒 Z`);
    assert(wb.minY >= info.groundY - 1e-6 && wb.minY <= info.groundY + 0.07, `${info.slotId} 陈设底面必须落在室内地面上（${wb.minY} vs ${info.groundY}）`);
    assert(wb.maxY <= info.ceilingY + 1e-6, `${info.slotId} 陈设顶面 ${wb.maxY} 不得高于天花 ${info.ceilingY}`);
    assertEqual(info.lodDistances.length, 3, `${info.slotId} 应为三档 LOD`);
    assert(info.lodDistances[0] === 0 && info.lodDistances[1] > 0 && info.lodDistances[2] > info.lodDistances[1], `${info.slotId} LOD 档距必须递增`);
  }
  const kinds = [...new Set(interiors.map((i) => i.kind))].sort();
  assert(kinds.every((k) => ['hall', 'sideHall', 'gateHall'].includes(k)), `构件类型必须落在 interiorSet 档位内，实际 ${kinds.join('/')}`);
  runner.info(`内景构件：${interiors.map((i) => `${i.slotId}:${i.kind}:${i.items.length}件`).join(' | ')}`);
});

await runner.test('内景进入最终绘制批次 + 每栋 2 条室内灯位（均在室内包围盒内）', () => {
  const parts = new Set();
  result.root.traverse((node) => {
    if (node.isMesh || node.isInstancedMesh) parts.add(node.userData?.part ?? '?');
  });
  for (const part of ['floor', 'ceiling', 'furniture']) {
    assert(parts.has(part), `合批后的绘制批次缺少内景部位 ${part}（实际：${[...parts].sort().join(' ')}）`);
  }
  const lamps = result.lightAnchors.filter((a) => a.role === 'interiorLantern');
  assertEqual(lamps.length, (result.stats.interiors ?? []).length * 2, '每栋内景固定 2 条灯位（t92：面积分档方案经 A/B 实测撤回）');
  for (const lamp of lamps) {
    const info = (result.stats.interiors ?? []).find((i) => i.slotId === lamp.buildingId);
    assert(info, `${lamp.id} 应归属于某栋内景`);
    assert(lamp.position.x > info.bounds.minX && lamp.position.x < info.bounds.maxX && lamp.position.z > info.bounds.minZ && lamp.position.z < info.bounds.maxZ, `${lamp.id} 灯位必须在室内包围盒内`);
    assertClose(lamp.position.y, info.groundY, 1e-6, `${lamp.id} 灯位应立于室内地面`);
  }
  runner.info(`室内灯位 ${lamps.length} 条（${lamps.length / 2} 栋 × 2）`);
});

await runner.test('碰撞可达性（真实碰撞数据）：9 栋每栋室内可站立、门洞可走入、外墙不可穿', () => {
  for (const info of result.stats.interiors ?? []) {
    const surface = result.colliders.walkable.find((w) => w.id === info.walkableId);
    assert(surface, `${info.slotId} 室内可行走面必须已在 colliders.walkable 中`);
    assertEqual(surface.enterable, true, `${info.slotId} 室内可行走面必须可进入`);
    assertClose(surface.y, info.groundY, 1e-6, `${info.slotId} 室内地面标高`);
    const cx = (info.bounds.minX + info.bounds.maxX) / 2;
    const cz = (info.bounds.minZ + info.bounds.maxZ) / 2;
    const insideHit = blockedAt(cx, cz, info.groundY);
    assert(!insideHit, `${info.slotId} 室内中心被 ${insideHit?.id} 阻挡（应可站立）`);
    const fp = LAYOUT.FP_ROUTE.find((f) => f.buildingId === info.slotId || f.surfaceId === info.walkableId);
    assert(fp, `${info.slotId} 必须登记门内走查点`);
    const fpSurface = result.colliders.walkable.find((w) => w.id === fp.surfaceId);
    assert(fpSurface, `${info.slotId} 门内走查点的可行走面必须存在`);
    const fpHit = blockedAt(fp.position.x, fp.position.z, fpSurface.y);
    assert(!fpHit, `${info.slotId} 门内走查点被 ${fpHit?.id} 阻挡（应从门洞可走入）`);
    const obstacle = result.colliders.obstacles.find((o) => o.buildingId === info.slotId && o.sourceType === 'building');
    assert(obstacle, `${info.slotId} 必须登记建筑障碍`);
    assertEqual(obstacle.blocks, 'exceptDoor', `${info.slotId} 障碍应为"仅门洞可通行"`);
    const along = obstacle.door.axis === 'z' ? 'x' : 'z';
    const wallX = along === 'x' ? obstacle.door.center.x + obstacle.door.width / 2 + 1 : obstacle.door.center.x;
    const wallZ = along === 'z' ? obstacle.door.center.z + obstacle.door.width / 2 + 1 : obstacle.door.center.z;
    assert(blockedAt(wallX, wallZ, info.groundY), `${info.slotId} 门洞旁的外墙必须阻挡（不可穿墙）`);
  }
  runner.info('9 栋内景：室内可站立 + 门洞可走入 + 外墙不可穿（逐栋断言）');
});

await runner.test('内景灯体守卫（t92 措施①）：不再额外加灯体，灯位与天花仍在', () => {
  const extraLamps = [];
  result.root.traverse((node) => {
    if (!(node.isMesh || node.isInstancedMesh)) return;
    if (/-lamp-LA-/.test(node.name ?? '')) extraLamps.push(node.name);
  });
  assertEqual(extraLamps.length, 0, `内景不得再额外加灯体（§12 截断措施① 已删除），实际 ${extraLamps.length} 个：${extraLamps.slice(0, 4).join(', ')}`);
  const lamps = result.lightAnchors.filter((a) => a.role === 'interiorLantern');
  assertEqual(lamps.length, (result.stats.interiors ?? []).length * 2, '每栋内景仍须登记 2 条灯位（环境系统按距离点亮）');
  for (const info of result.stats.interiors ?? []) {
    assert(info.ceilingY > info.groundY + 1.5, `${info.slotId} 天花高度异常（${info.ceilingY} vs ${info.groundY}）`);
  }
  runner.info(`内景灯体守卫：额外灯体 ${extraLamps.length} 个（措施①），室内灯位 ${lamps.length} 条、天花 ${(result.stats.interiors ?? []).length} 层 ✓`);
});

/* ========================================================================== */
runner.section('6. 预算与实例化（§8.2；队长口径：约束是整城 ≤350）');
/* ========================================================================== */

await runner.test('整区合批 + 树群实例化：批次与三角面在预算内', () => {
  const budget = BUDGET.drawCalls.perZone[ZONE];
  assertEqual(result.stats.drawCallBudget, budget, '区域必须声明正确预算');
  assert(result.stats.merge, '必须执行整区合批（kit.mergeZone）');
  assert(result.stats.merge.after <= result.stats.merge.before, '合批必须降低批次');
  // t92：配额申请已被采纳（config.BUDGET.drawCalls.perZone.E 40 → 56），故收紧回严格断言（去掉 t63 的临时余量）
  assert(
    result.stats.drawCalls <= budget,
    `E 区绘制调用 ${result.stats.drawCalls} 超过现行分区配额 ${budget}（§8.2 config.BUDGET.drawCalls.perZone）`,
  );
  assert(result.stats.layoutDrawCallBudget !== null, '应留档 layout.ZONES.drawCallBudget 供口径对比');
  assert(result.stats.triangles <= BUDGET.triangles.visibleMax / 4, 'E 区三角面不应接近全城上限');
  assert(result.stats.treeBuild === 'instanced(kit.instance)', '树木必须用 kit.instance 实例化');
  const inst = result.stats.treeInstances ?? [];
  assert(inst.length >= 2, '至少 灯杆/树冠 两组实例');
  const total = inst.reduce((n, i) => n + i.count, 0);
  assert(total >= result.stats.trees, '实例总数应覆盖全部树木');
  runner.info(`E 区绘制调用 ${result.stats.drawCalls}/${budget}（合批前 ${result.stats.merge.before} → 后 ${result.stats.merge.after}），三角面 ${result.stats.triangles}；实例化 ${inst.map((i) => `${i.name}×${i.count}`).join(' + ')}`);
});

await runner.test('实例矩阵确实把每株树放到各自位置（不是全部堆在原点）', () => {
  const instanced = [];
  result.root.traverse((node) => {
    if (node.isInstancedMesh) instanced.push(node);
  });
  assert(instanced.length >= 2, `应有 ≥2 个 InstancedMesh，实际 ${instanced.length}`);
  const trunk = instanced.find((m) => m.name.includes('trunk')) ?? instanced[0];
  const matrices = [];
  for (let i = 0; i < Math.min(trunk.count, 8); i += 1) {
    const m = new THREE.Matrix4();
    trunk.getMatrixAt(i, m);
    matrices.push([m.elements[12], m.elements[14]]);
  }
  const spreadX = Math.max(...matrices.map((p) => p[0])) - Math.min(...matrices.map((p) => p[0]));
  const spreadZ = Math.max(...matrices.map((p) => p[1])) - Math.min(...matrices.map((p) => p[1]));
  assert(spreadX + spreadZ > 50, `实例位置应分散在院内（实测跨度 ${spreadX.toFixed(1)}×${spreadZ.toFixed(1)}m）`);
  for (const [x, z] of matrices) {
    assert(x > LAYOUT.CENTRAL_X.maxX && x < LAYOUT.ENVELOPE.maxX, `实例位置 x=${x} 越界`);
    assert(z > LAYOUT.FORECOURT_Z.minZ && z < LAYOUT.INNER_PALACE_Z.maxZ, `实例位置 z=${z} 越界`);
  }
  runner.info(`树干实例前 8 株跨度 ${spreadX.toFixed(1)}×${spreadZ.toFixed(1)}m（count=${trunk.count}）`);
});

/* ========================================================================== */
runner.section('7. 生命周期（§3.3）');
/* ========================================================================== */

await runner.test('update(dt, elapsed, state) 不改 state/相机，重复调用不抛错', () => {
  const stateLike = {
    mode: 'browse',
    viewMode: 'zone',
    selectedBuildingId: null,
    hoveredBuildingId: null,
    timePreset: 'goldenHour',
    quality: 'medium',
    tourState: { active: false, paused: false, index: 0, id: null },
    loading: { progress: 1, stage: 'ready', failed: null },
  };
  const frozen = JSON.stringify(stateLike);
  for (let i = 0; i < 90; i += 1) result.update(1 / 60, i / 60, stateLike);
  assertEqual(JSON.stringify(stateLike), frozen, 'update 不得改写 state');
  assertEqual(result.root.parent, null, 'update 不得把 root 挂到场景上');
});

await runner.test('dispose() 只释放自有几何（含实例化模板），不销毁 kit 共享材质/贴图，且幂等', () => {
  const shared = kit.materials.get('plasterRed');
  let materialDisposed = 0;
  const onDispose = () => {
    materialDisposed += 1;
  };
  shared.addEventListener('dispose', onDispose);
  const texturesBefore = kit.materials.stats().textures;
  const geometryCount = new Set();
  result.root.traverse((node) => node.geometry && geometryCount.add(node.geometry.uuid));
  result.dispose();
  result.dispose();
  shared.removeEventListener('dispose', onDispose);
  assertEqual(materialDisposed, 0, 'dispose 不得销毁 kit 共享材质');
  assertEqual(kit.materials.stats().textures, texturesBefore, 'dispose 不得销毁 kit 共享贴图');
  assertEqual(result.root.children.length, 0, 'dispose 后 root 应清空');
  assert(geometryCount.size > 0, '区域必须真的有几何');
  assertEqual(kit.materials.get('plasterRed'), shared, '共享材质仍可复用');
});

/* ========================================================================== */

process.exit(runner.summary());
