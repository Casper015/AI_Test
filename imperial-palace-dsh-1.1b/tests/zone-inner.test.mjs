#!/usr/bin/env node
/**
 * `tests/zone-inner.test.mjs` —— C 区后宫（t7）专项机器校验。
 *
 * 覆盖任务卡的 7 条验收：
 *   1. `createZone(ctx)` 返回 §3.3 全字段，只用 ctx 与 kit 构件/材质；
 *   2. layout 中 zone=C 的 12 个槽位逐一落地 + ≥3 进主要内廷院落（内廷门/寝殿/配殿/配房/小院）；
 *   3. 寝殿一处提供可进入内景 + 1 个 interior 机位（限制在室内包围盒内）；
 *   4. 与 B / F / D / E 的接口按 layout 连接 ID 完全一致（位置/宽度/标高共享、单一 owner）；
 *   5. ≥1 zone 机位 + ≥1 fp-spawn（落在可行走面、朝向中轴）；不可进入建筑 visitable=false 且在 colliders；
 *   6. 绘制调用 ≤ 分区预算（config.BUDGET.drawCalls.perZone.C）；
 *   7. 契约校验零问题（与 `tests/zones.test.mjs` 同一入口 `validateZoneResult`）。
 *
 * 另外校验最容易出错的"看不见的东西"：第一人称走查通路未被院墙碰撞盒堵死、
 * 院墙门洞净空 ≥ 玩家身高、共享材质不被区域 dispose 掉。
 *
 * 一律使用**真 kit**（`src/kit/index.js`）注入 ctx；灰盒替身路径由 `tests/zones.test.mjs` 覆盖。
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

const runner = createTestRunner('zone-inner.test.mjs · C 区后宫（12 槽位 / 3 进院落 / 寝殿内景 / 跨区接口）');

const THREE = await loadThree();
const { CONFIG, MODULES, TERRAIN, INTERACTION, BUDGET } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createKit } = await loadModule('src/kit/index.js');
const { validateZoneResult } = await loadModule('src/core/context.js');
const { zoneLayoutFor } = await loadModule('src/core/layout-slice.js');
const zoneModule = await loadModule('src/zones/inner-palace.js');

const ZONE = 'C';
const zone = zoneLayoutFor(ZONE);
const slots = LAYOUT.SLOTS.filter((s) => s.zone === ZONE);
const kit = createKit({ THREE, config: CONFIG, quality: 'medium' });
const ctx = await makeTestCtx({ zoneId: ZONE, kit });
const result = await zoneModule.createZone(ctx);
const facts = new Map((result.stats.buildingFacts ?? []).map((f) => [f.id, f]));
const PLANE_BOX = { x: 0, z: 0 };
void PLANE_BOX;

const PLAYER = INTERACTION.player;
const STEP = INTERACTION.step;

/** 第一人称可行性判定：把玩家当成半径 0.35 / 高 1.8 的圆柱，逐障碍盒做"是否可通行"判断。 */
function blockedAt(x, z, feetY) {
  for (const o of result.colliders.obstacles) {
    const b = o.bounds;
    if (x < b.minX - PLAYER.radius || x > b.maxX + PLAYER.radius) continue;
    if (z < b.minZ - PLAYER.radius || z > b.maxZ + PLAYER.radius) continue;
    if (feetY < o.y0 - 1e-6 || feetY + PLAYER.height > o.y1 + 1e-6) continue;
    if (o.blocks === 'exceptDoor' && o.door) {
      const d = o.door;
      const along = d.axis === 'z' ? x : z; // 门洞平面法线沿 z 时，洞口宽度沿 x
      const centerAlong = d.axis === 'z' ? d.center.x : d.center.z;
      const fits = Math.abs(along - centerAlong) <= d.width / 2 - PLAYER.radius;
      const bottom = d.sillY ?? o.y0;
      const top = bottom + d.height;
      if (fits && feetY >= bottom - 1e-6 && feetY + PLAYER.height <= top + 1e-6) continue;
    }
    return o;
  }
  return null;
}

/* ========================================================================== */
runner.section('1. 模块导出与 createZone 契约（§3.1 / §3.3）');
/* ========================================================================== */

await runner.test('模块导出 ZONE_ID="C"、createZone（含 default）', () => {
  assertEqual(zoneModule.ZONE_ID, ZONE, 'ZONE_ID 必须是区域 id');
  assert(typeof zoneModule.createZone === 'function', '必须导出 createZone(ctx)');
  assertEqual(zoneModule.default, zoneModule.createZone, 'default 导出应指向 createZone');
});

await runner.test('返回值含 §3.3 全部字段且类型正确', () => {
  for (const field of ['root', 'buildings', 'connectors', 'colliders', 'viewpoints', 'lightAnchors']) {
    assert(field in result, `返回值缺少字段 ${field}`);
  }
  assert(typeof result.update === 'function', 'update 必须是函数');
  assert(typeof result.dispose === 'function', 'dispose 必须是函数');
  assert(result.root instanceof THREE.Group || result.root.isObject3D, 'root 必须是 Object3D');
  assertEqual(result.root.parent, null, 'root 不得自行 scene.add（挂载归 main.js）');
  for (const key of ['position', 'rotation', 'scale']) {
    const v = result.root[key];
    const want = key === 'scale' ? [1, 1, 1] : [0, 0, 0];
    assertClose(v.x, want[0], 1e-6, `root.${key}.x`);
    assertClose(v.y, want[1], 1e-6, `root.${key}.y`);
    assertClose(v.z, want[2], 1e-6, `root.${key}.z`);
  }
  assert(result.colliders && Array.isArray(result.colliders.obstacles), 'colliders.obstacles 必须是数组');
  assert(Array.isArray(result.colliders.walkable) && Array.isArray(result.colliders.ramps), 'colliders 必须含 walkable/ramps');
});

await runner.test('返回值通过 §3.3/§4/§5/§6/§8.3 全量契约校验（零问题）', () => {
  const { problems } = validateZoneResult(ZONE, result, { THREE, scope: 'zone', expectBuildings: slots.length });
  assertNoProblems(problems, 'C 区契约');
});

await runner.test('只用 kit 构件与 kit 共享材质：每个几何/材质都归属 kit（区域零自建资源）', () => {
  let meshes = 0;
  let geometries = 0;
  result.root.traverse((node) => {
    if (!node.isMesh) return;
    meshes += 1;
    geometries += 1;
    assert(node.geometry?.userData?.kitOwned === true, `网格 ${node.name} 使用了非 kit 几何（区域不得自建几何）`);
    assert(kit.materials.isOwned(node.material) === true, `网格 ${node.name} 使用了非 kit 材质`);
  });
  assert(meshes > 0, '必须真的产出几何');
  runner.info(`C 区网格 ${meshes} 个，几何 ${geometries} 个，全部来自 kit（零自建 geometry/material）`);
});

await runner.test('源码纪律：无十六进制色值 / Math.random / 渲染循环 / scene.add / 直接导入 three', () => {
  const src = readSource('src/zones/inner-palace.js');
  assert(src, 'inner-palace.js 必须存在');
  assert(!/#[0-9a-fA-F]{6}\b/.test(src), '区域代码不得出现十六进制色值（颜色必须走 config 令牌）');
  assert(!/Math\.random/.test(src), '不得使用 Math.random（须用 ctx.rng）');
  assert(!/requestAnimationFrame|setInterval\(/.test(src), '不得自建渲染循环/定时器（§8.3 只有一个动画循环）');
  assert(!/scene\.add|renderer\.render/.test(src), '不得自行挂载/渲染（归 main.js）');
  assert(!/from ['"]three['"]/.test(src), '区域必须使用 ctx.THREE，不直接 import three');
});

/* ========================================================================== */
runner.section('2. 建筑：12 槽位逐一对应（§4 / 计划 §5.3 第一、二条）');
/* ========================================================================== */

await runner.test('建筑数量 = layout 分配给 C 的槽位数，且 id 集合逐一相等（不新增、不遗漏）', () => {
  assertEqual(result.buildings.length, slots.length, '建筑数量必须等于 layout 分配数');
  const got = result.buildings.map((b) => b.id).sort();
  const want = slots.map((s) => s.id).sort();
  assertEqual(got.join(','), want.join(','), '建筑 id 必须与 layout 完全一致');
  runner.info(`C 区 ${result.buildings.length} 栋：${got.join(' / ')}`);
});

await runner.test('每栋建筑逐字段回显 layout（含 bounds/entrance/door 数值）', () => {
  for (const b of result.buildings) {
    const src = LAYOUT.getSlot(b.id);
    assert(src, `${b.id} 必须是 layout 槽位`);
    for (const key of ['name', 'kind', 'category', 'zone', 'x', 'z', 'w', 'd', 'bays', 'terraceH', 'roofType', 'grade', 'facing', 'rotationYDeg', 'visitable', 'baseY', 'bodyBaseY', 'eaveHeight', 'totalHeight', 'lodHint']) {
      assertEqual(b[key], src[key], `${b.id}.${key} 必须回显 layout`);
    }
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
      assertClose(b.bounds[key], src.bounds[key], 1e-6, `${b.id}.bounds.${key}`);
    }
    assertClose(b.entrance.x, src.entrance.x, 1e-6, `${b.id}.entrance.x`);
    assertClose(b.entrance.z, src.entrance.z, 1e-6, `${b.id}.entrance.z`);
    if (src.door === null) assertEqual(b.door, null, `${b.id}.door 应为 null`);
    else assertEqual(b.door.width, src.door.width, `${b.id}.door.width`);
  }
});

await runner.test('三进内廷院落的要素齐备：内廷门 / 寝殿正殿 / 后寝殿 / 东西配殿配房 / 庭院亭', () => {
  assertEqual(zone.courtyards.length, 3, 'C 区必须有 ≥3 进主要内廷院落');
  const ids = new Set(result.buildings.map((b) => b.id));
  for (const id of ['C-gate-inner', 'C-hall-bed-main', 'C-hall-bed-rear', 'C-side-west-main', 'C-side-east-main', 'C-side-west-rear', 'C-side-east-rear', 'C-gate-west', 'C-gate-east', 'C-annex-west', 'C-annex-east', 'C-pavilion-rear']) {
    assert(ids.has(id), `缺少槽位 ${id}`);
  }
  const courtyardIds = zone.courtyards.map((c) => c.id);
  assertEqual(courtyardIds.join(','), 'CY-C-front,CY-C-main,CY-C-rear', '三进院落 id 必须与 layout 一致');
  assert(zone.courtyards.every((c) => c.bounds.maxZ - c.bounds.minZ > 40), '每进院落应有实际进深（不是空壳）');
  // 院落-建筑归属：内廷门在一进院、寝殿在主院、后寝殿在后院
  assertEqual(LAYOUT.getSlot('C-gate-inner').courtyard, 'CY-C-front');
  assertEqual(LAYOUT.getSlot('C-hall-bed-main').courtyard, 'CY-C-main');
  assertEqual(LAYOUT.getSlot('C-hall-bed-rear').courtyard, 'CY-C-rear');
  runner.info(`院落：${zone.courtyards.map((c) => `${c.id}(${c.bounds.minZ}~${c.bounds.maxZ})`).join(' ')}`);
});

await runner.test('尺度收敛：后宫建筑面阔/檐高整体小于前朝同类（计划 §5.3 第二条）', () => {
  const maxW = (pred) => Math.max(...LAYOUT.SLOTS.filter(pred).map((s) => Math.max(s.w, s.d)));
  const cHall = maxW((s) => s.zone === 'C' && s.kind === 'hall');
  const bHall = maxW((s) => s.zone === 'B' && s.kind === 'hall');
  assert(cHall < bHall, `后宫最大殿堂 ${cHall}m 应小于前朝 ${bHall}m`);
  const cGate = LAYOUT.getSlot('C-gate-inner');
  const bGate = LAYOUT.getSlot('B-gate-front');
  assert(cGate.w < bGate.w, `内廷门 ${cGate.w}m 应小于前朝门殿 ${bGate.w}m`);
  runner.info(`寝殿面阔 ${cHall}m < 金銮殿 ${bHall}m；内廷门 ${cGate.w}m < 前朝门殿 ${bGate.w}m`);
});

await runner.test('竖直定位自洽：kit 檐口 = layout 檐口估值 + 后宫地坪 0.9（容差 6mm）', () => {
  const groundY = TERRAIN.innerPalaceY;
  for (const fact of facts.values()) {
    const src = LAYOUT.getSlot(fact.id);
    assert(fact.eaveHeightAbsolute !== null, `${fact.id} 应带回 kit 实测檐口高`);
    // 内廷门按 layout 原值定位（台基即 B→C 高差）：檐口与 layout 估值逐字段相同；
    // 其余（含立于 TR-C-bed 平台顶的寝殿）整体抬到后宫地坪，故比 layout 估值高一个地坪高度。
    const expected = fact.id === 'C-gate-inner' ? src.eaveHeight : src.eaveHeight + groundY;
    assertClose(fact.eaveHeightAbsolute, expected, 0.006, `${fact.id} kit 檐口 vs layout 估值(+地坪)`);
  }
  const bedHall = facts.get('C-hall-bed-main');
  assertClose(bedHall.groundLevel, LAYOUT.TERRACES.find((t) => t.id === 'TR-C-bed').y1, 1e-6, '寝殿应立于 TERRACES.TR-C-bed 平台顶');
  // 寝殿室内地面 = kit 台基顶 = layout 的室内可行走面（二者必须重合，否则内景地面错位）
  const interior = LAYOUT.WALKABLE.find((w) => w.id === 'WK-C-bed-interior');
  assertClose(bedHall.baseY, interior.y, 1e-6, '寝殿台基顶必须等于 WK-C-bed-interior.y');
});

await runner.test('逐栋三角面 ≤ config.BUDGET.triangles.perBuildingMax', () => {
  for (const fact of facts.values()) {
    assert(fact.triangles !== null, `${fact.id} 应带回三角面统计`);
    assert(fact.triangles <= BUDGET.triangles.perBuildingMax, `${fact.id} 三角面 ${fact.triangles} 超单栋上限 ${BUDGET.triangles.perBuildingMax}`);
  }
  const worst = [...facts.values()].sort((a, b) => b.triangles - a.triangles)[0];
  runner.info(`单栋最大三角面：${worst.id} ${worst.triangles}（上限 ${BUDGET.triangles.perBuildingMax}）`);
});

/* --------------------------------------------------------------------------
 * t24：重檐庑殿的"几何事实"探针（不使用槽位数据自证）
 * 说明：构件工厂的几何在**局部坐标**（面阔沿 X、正面朝 -Z、原点在足迹中心地面），
 *      因此下面的断言全部是"几何量之间的关系"，与 layout 槽位字段无关。
 * ------------------------------------------------------------------------ */

/** 若干部件网格的并集包围盒（局部坐标）。 */
function partBBox(meshes = []) {
  const box = new THREE.Box3();
  box.makeEmpty();
  for (const mesh of meshes) {
    if (!mesh.geometry) continue;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox);
  }
  return box.isEmpty() ? null : box;
}

/** 三角形形心集合（可只取某个分量）。 */
function triangleCentroids(meshes = [], axis = 'y') {
  const out = [];
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const at = axis === 'x' ? 'getX' : axis === 'y' ? 'getY' : 'getZ';
      out.push((pos[at](i) + pos[at](i + 1) + pos[at](i + 2)) / 3);
    }
  }
  return out;
}

/** 一维值聚类成带（gap 超过 tol 就开新带）。 */
function clusterValues(values, tol) {
  const sorted = [...values].sort((a, b) => a - b);
  const bands = [];
  for (const v of sorted) {
    const last = bands[bands.length - 1];
    if (last && v - last.max <= tol) {
      last.max = v;
      last.count += 1;
    } else {
      bands.push({ min: v, max: v, count: 1 });
    }
  }
  return bands;
}

/** 主屋面"朝上"三角形的方位象限计数（[+Z, -X, -Z, +X]）→ 四面坡应为 4 个非零象限。 */
function roofSlopeQuadrants(meshes = []) {
  const quad = [0, 0, 0, 0];
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i); const ay = pos.getY(i); const az = pos.getZ(i);
      const bx = pos.getX(i + 1); const by = pos.getY(i + 1); const bz = pos.getZ(i + 1);
      const cx = pos.getX(i + 2); const cy = pos.getY(i + 2); const cz = pos.getZ(i + 2);
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const len = Math.hypot(nx, ny, nz) || 1;
      if (ny / len < 0.2) continue; // 只要朝上的坡面
      if (Math.abs(nx) >= Math.abs(nz)) quad[nx >= 0 ? 3 : 1] += 1;
      else quad[nz >= 0 ? 0 : 2] += 1;
    }
  }
  return quad;
}

/** 正立面墙在门洞净高带内的 X 覆盖缺口（顶点法）→ 返回门洞净宽。 */
function frontWallDoorGap(wallMeshes = [], metrics) {
  const frontZ = -metrics.bodyD / 2 + 0.45; // 前墙中心（inset + 墙厚/2）
  const intervals = [];
  for (const mesh of wallMeshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      if (cy < 1.5 || cy > 3.0) continue; // 门洞净高带
      if (Math.abs(cz - frontZ) > 0.6) continue; // 只取前墙
      const xs = [pos.getX(i), pos.getX(i + 1), pos.getX(i + 2)].sort((a, b) => a - b);
      intervals.push([xs[0], xs[2]]);
    }
  }
  const left = intervals.filter(([, b]) => b <= 0.01);
  const right = intervals.filter(([a]) => a >= -0.01);
  if (left.length === 0 || right.length === 0) return { width: 0, triangleCount: intervals.length };
  const leftEdge = Math.max(...left.map(([, b]) => b));
  const rightEdge = Math.min(...right.map(([a]) => a));
  return { width: rightEdge - leftEdge, leftEdge, rightEdge, triangleCount: intervals.length };
}

/** 门扇在中央留下的净空（|x| 最小间隙）。 */
function doorCentralClearance(doorMeshes = []) {
  const intervals = [];
  for (const mesh of doorMeshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const xs = [pos.getX(i), pos.getX(i + 1), pos.getX(i + 2)].sort((a, b) => a - b);
      intervals.push([xs[0], xs[2]]);
    }
  }
  const left = intervals.filter(([, b]) => b <= 0.01);
  const right = intervals.filter(([a]) => a >= -0.01);
  if (left.length === 0 || right.length === 0) return 0;
  return Math.min(...right.map(([a]) => a)) - Math.max(...left.map(([, b]) => b));
}

/* ========================================================================== */
runner.section('2b. 寝殿重檐庑殿的几何事实（t24：撤销以形制换门洞的绕过）');
/* ========================================================================== */

await runner.test('本区实际建造：寝殿按槽位 kind 建为重檐庑殿（上/下檐口分离、腰檐、长正脊、四面坡）', () => {
  const slot = LAYOUT.getSlot('C-hall-bed-main');
  const fact = facts.get('C-hall-bed-main');
  assertEqual(slot.roofType, 'doubleEaveHip', 'layout 槽位必须是重檐庑殿');
  assertEqual(slot.grade, 3, 'layout 槽位等级');
  assertEqual(fact.kind, 'hall', '必须按槽位 kind 建造');
  assertEqual(fact.bodyBranch, 'hall', '不得再走 gateHall 等"以形制换门洞"的分支');
  // 以下全部取自 kit.userData.kit.metrics（几何推导），不是槽位回显
  assertEqual(fact.doubleEave, true, 'kit 几何判定必须是重檐');
  const storey = fact.upperEaveY - fact.eaveHeight;
  assert(storey > MODULES.eaveHeight * 0.2 && storey < MODULES.eaveHeight * 0.8, `上层屋身高 ${storey.toFixed(2)}m 应在檐高 20%~80% 之间（上檐口高于下檐口）`);
  assert(fact.apronRise > 0.5, `腰檐举高 ${fact.apronRise} 必须为正（下层腰檐存在）`);
  assert(fact.ridgeLength >= 0.3 * fact.bodyW, `正脊长 ${fact.ridgeLength} 应 ≥ 0.3×面阔 ${fact.bodyW}（长正脊，不是尖顶/无脊亭顶）`);
  assertEqual(fact.slopes, 4, '必须是四面坡（庑殿）');
  assert(fact.worldBounds.maxY >= fact.baseY + fact.doubleEave ? fact.baseY + fact.upperEaveY : 0, '实测包围盒顶必须高过上檐口');
  runner.info(`寝殿 kit 几何：下檐口 ${fact.eaveHeight}m → 上檐口 ${fact.upperEaveY}m（上层屋身 ${storey.toFixed(2)}m）、腰檐举高 ${fact.apronRise.toFixed(2)}m、正脊 ${fact.ridgeLength}m / 面阔 ${fact.bodyW}m、${fact.slopes} 坡`);
});

await runner.test('已合批的渲染路径里确实含腰檐部件（lowerRoof）：重檐进入最终绘制批次', () => {
  const parts = new Set();
  result.root.traverse((node) => {
    if (node.isMesh || node.isInstancedMesh) parts.add(node.userData?.part ?? '?');
  });
  // lowerRoof 只由 kit 的重檐分支产生（buildings.js：apron.parts.rename('roof','lowerRoof')）
  assert(parts.has('lowerRoof'), `合批后的绘制批次里缺少腰檐部件 lowerRoof（说明重檐没进渲染路径）；实际部件：${[...parts].sort().join(' ')}`);
  assert(parts.has('roof') && parts.has('ridge'), '主屋面与正脊必须在绘制批次里');
  runner.info('合批后绘制批次含：lowerRoof（腰檐）+ roof（主屋面）+ ridge（正脊）');
});

await runner.test('几何事实（按本区同参数独立重建）：双屋面层分离 + 上下两层额枋', () => {
  const slot = LAYOUT.getSlot('C-hall-bed-main');
  const fact = facts.get('C-hall-bed-main');
  const probe = kit[slot.kind]({ ...slot, quality: 'medium', lod: fact.detail, baseY: fact.baseY, terraceH: fact.terraceH });
  const pm = probe.userData.kit.metrics;
  assertEqual(pm.doubleEave, fact.doubleEave, '独立重建的形制判定必须与本区实际建造一致');
  assertClose(pm.upperEaveY, fact.upperEaveY, 1e-6, '独立重建的上檐口高');
  const parts = new Map();
  probe.traverse((node) => {
    if (!node.isMesh) return;
    const key = node.userData.part;
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(node);
  });
  const lower = partBBox(parts.get('lowerRoof'));
  const main = partBBox(parts.get('roof'));
  assert(lower && main, '腰檐（lowerRoof）与主屋面（roof）都必须存在');
  assert(lower.min.y < main.min.y - 1, `腰檐底 ${lower.min.y.toFixed(2)} 必须低于主屋面底 ${main.min.y.toFixed(2)} 1m 以上（两层屋面分离）`);
  assertClose(main.min.y, pm.upperEaveY, 0.4, '主屋面必须从上檐口起坡');
  assertClose(lower.min.y, pm.eaveHeight, 0.4, '腰檐必须从下檐口起坡');
  assert(lower.max.x - lower.min.x > main.max.x - main.min.x, '腰檐（下层）出檐范围应大于主屋面（上层收进）');
  // 上下两层额枋 = 上层屋身存在的几何证据
  const bands = clusterValues(triangleCentroids(parts.get('painting'), 'y'), 1.0);
  assert(bands.length >= 2, `额枋应分上下两带（上层屋身存在），实际 ${bands.length} 带`);
  assert(bands.some((b) => Math.abs(b.max - pm.eaveHeight) < 0.35), '应有额枋带落在下檐口');
  assert(bands.some((b) => Math.abs(b.max - pm.upperEaveY) < 0.6), '应有额枋带落在上檐口');
  runner.info(`屋面两层：腰檐 y[${lower.min.y.toFixed(2)},${lower.max.y.toFixed(2)}] / 主屋面 y[${main.min.y.toFixed(2)},${main.max.y.toFixed(2)}]；额枋 ${bands.length} 带（${bands.map((b) => `${b.min.toFixed(2)}~${b.max.toFixed(2)}`).join(' / ')}）`);
});

await runner.test('几何事实：长正脊位于屋脊最高处 + 主屋面四面坡（方位象限）', () => {
  const slot = LAYOUT.getSlot('C-hall-bed-main');
  const fact = facts.get('C-hall-bed-main');
  const probe = kit[slot.kind]({ ...slot, quality: 'medium', lod: fact.detail, baseY: fact.baseY, terraceH: fact.terraceH });
  const pm = probe.userData.kit.metrics;
  const parts = new Map();
  probe.traverse((node) => {
    if (!node.isMesh) return;
    const key = node.userData.part;
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(node);
  });
  const ridge = partBBox(parts.get('ridge'));
  assert(ridge, '正脊几何必须存在');
  assert(ridge.max.x - ridge.min.x >= 0.3 * pm.bodyW, `正脊水平长度 ${(ridge.max.x - ridge.min.x).toFixed(2)}m 应 ≥ 0.3×面阔 ${pm.bodyW}m`);
  assert(ridge.max.y >= pm.totalHeight - 0.6, `正脊应在屋脊最高处（ridge.maxY=${ridge.max.y.toFixed(2)} vs totalHeight=${pm.totalHeight}）`);
  const quad = roofSlopeQuadrants(parts.get('roof'));
  assertEqual(quad.filter((n) => n > 0).length, 4, `主屋面必须四面坡，实际 ${quad.filter((n) => n > 0).length} 面（[+Z,-X,-Z,+X]=${quad.join('/')}）`);
  runner.info(`正脊水平 ${(ridge.max.x - ridge.min.x).toFixed(2)}m、脊顶 ${ridge.max.y.toFixed(2)}m；朝上三角形象限分布 [+Z,-X,-Z,+X]=${quad.join('/')}`);
});

await runner.test('丹陛台阶方向：高端贴台基、向院子递降（防 kit 台阶朝向变更回归）', () => {
  // kit 台阶本体事实：高端在组原点（本地 z≈0），向本地 -Z 递降
  const probe = kit.stairs({ id: 'probe-stairs', x: 0, z: 0, width: 14, rise: 1.5, baseY: 0, rotationYDeg: 0, detail: 'mid' });
  const box = new THREE.Box3().setFromObject(probe);
  assertClose(box.max.z, 0, 0.4, 'kit 台阶高端应贴组原点（本地 z≈0）');
  assertClose(box.max.y, 1.5, 0.25, '最高踏步应等于抬升高度');
  assert(box.min.z < -1, '台阶应向本地 -Z 递降');
  // 本区摆放：南端贴台基前沿（TR-C-bed.minZ）、北端贴台基后沿（maxZ），朝向使高端朝台基
  const terrace = LAYOUT.TERRACES.find((t) => t.id === 'TR-C-bed');
  const placements = result.stats.stairsPlacements ?? [];
  assertEqual(placements.length, 2, '寝殿台基应有南北两处台阶');
  const south = placements.find((p) => p.side === 'south');
  const north = placements.find((p) => p.side === 'north');
  assertClose(south.z, terrace.bounds.minZ, 1e-6, '南丹陛高端必须贴台基南沿');
  assertEqual(south.rotationYDeg, 0, '南丹陛朝向：向 -Z（院南）递降');
  assertClose(south.rise, terrace.y1 - terrace.y0, 1e-6, '丹陛抬升 = 台基高');
  assertClose(north.z, terrace.bounds.maxZ, 1e-6, '北台阶高端必须贴台基北沿');
  assertEqual(north.rotationYDeg, 180, '北台阶朝向：向 +Z（院北）递降');
  runner.info(`丹陛：南 z=${south.z}（rot ${south.rotationYDeg}°）、北 z=${north.z}（rot ${north.rotationYDeg}°），抬升 ${south.rise}m`);
});

await runner.test('几何事实：正立面门洞净宽 = layout.door.width，且门扇中央净空 ≥ 玩家直径', () => {
  const slot = LAYOUT.getSlot('C-hall-bed-main');
  const fact = facts.get('C-hall-bed-main');
  const probe = kit[slot.kind]({ ...slot, quality: 'medium', lod: fact.detail, baseY: fact.baseY, terraceH: fact.terraceH });
  const pm = probe.userData.kit.metrics;
  const parts = new Map();
  probe.traverse((node) => {
    if (!node.isMesh) return;
    const key = node.userData.part;
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(node);
  });
  const gap = frontWallDoorGap(parts.get('wall'), pm);
  assertClose(gap.width, slot.door.width, 1.0, `前墙门洞净宽 ${gap.width.toFixed(2)}m 必须等于 layout.door.width ${slot.door.width}m`);
  assertClose(pm.doorWidth, slot.door.width, 1e-6, 'kit 门洞净宽必须回显 layout.door.width');
  assert(pm.doorHeight >= INTERACTION.player.height, `门洞净高 ${pm.doorHeight} 必须 ≥ 玩家身高 ${INTERACTION.player.height}`);
  const clear = doorCentralClearance(parts.get('door'));
  assert(clear >= 2 * INTERACTION.player.radius, `门扇中央净空 ${clear.toFixed(2)}m 必须 ≥ 玩家直径 ${(2 * INTERACTION.player.radius).toFixed(2)}m（第一人称居中可通行）`);
  // 门洞净宽必须与碰撞门洞一致（OBSTACLES.door.width）
  const obstacle = result.colliders.obstacles.find((o) => o.buildingId === 'C-hall-bed-main');
  assertEqual(obstacle.door.width, slot.door.width, '障碍门洞净宽必须与 layout 一致');
  runner.info(`前墙洞口 x[${gap.leftEdge.toFixed(2)},${gap.rightEdge.toFixed(2)}]（净宽 ${gap.width.toFixed(2)}m，${gap.triangleCount} 个前墙三角形参与测量）；门扇中央净空 ${clear.toFixed(2)}m；门洞净高 ${pm.doorHeight}m`);
});

/* ========================================================================== */
runner.section('3. 寝殿内景与机位（§5.2 / 计划 §5.3 第三条）');
/* ========================================================================== */

await runner.test('可进入建筑唯一：C-hall-bed-main visitable=true + 门洞，其余全部 visitable=false', () => {
  const visitable = result.buildings.filter((b) => b.visitable === true).map((b) => b.id);
  assertEqual(visitable.join(','), 'C-hall-bed-main', 'C 区只有寝殿正殿可进入内景');
  const bed = result.buildings.find((b) => b.id === 'C-hall-bed-main');
  assert(bed.door && bed.door.width > 0, '可进入建筑必须有门洞数据');
  assertEqual(bed.entrance.z, 149, '寝殿主入口应在南侧（正面朝南）');
});

await runner.test('interior 机位落在 WK-C-bed-interior 包围盒内，视线高 = 面高 + 1.65', () => {
  const vps = result.viewpoints.filter((v) => v.mode === 'interior');
  assertEqual(vps.length, 1, '寝殿必须有且仅有 1 个 interior 机位');
  const vp = vps[0];
  const surface = LAYOUT.WALKABLE.find((w) => w.id === 'WK-C-bed-interior');
  assert(surface, 'layout 必须登记 WK-C-bed-interior');
  const b = surface.bounds;
  assert(vp.position.x > b.minX && vp.position.x < b.maxX, 'interior 机位 x 必须在室内包围盒内');
  assert(vp.position.z > b.minZ && vp.position.z < b.maxZ, 'interior 机位 z 必须在室内包围盒内');
  assertClose(vp.position.y, surface.y + CONFIG.CAMERA.fpEyeHeight, 0.05, 'interior 视线高');
  // 视线不出顶、不进墙：目标点同样在室内范围内、y 低于檐口
  assert(vp.target.z > b.minZ && vp.target.z < b.maxZ, 'interior 目标点应在室内');
  const fact = facts.get('C-hall-bed-main');
  assert(vp.position.y < fact.eaveHeightAbsolute, 'interior 机位必须低于檐口（不出顶）');
  assert(b.minX > fact.worldBounds.minX && b.maxX < fact.worldBounds.maxX, '室内包围盒应在建筑实测包围盒内');
  assert(b.minZ > fact.worldBounds.minZ && b.maxZ < fact.worldBounds.maxZ, '室内包围盒应在建筑实测包围盒内');
});

await runner.test('内景陈设全部在室内包围盒内（床榻/屏风/铜器/宫灯由 kit 构件组成）', () => {
  const box = result.stats.interior.bounds;
  assertEqual(result.stats.interior.floorY, LAYOUT.WALKABLE.find((w) => w.id === 'WK-C-bed-interior').y, '室内地面标高');
  assert(result.stats.interior.props.length >= 3, '内景至少有 3 件陈设');
  for (const prop of result.stats.interior.props) {
    assert(prop.x > box.minX && prop.x < box.maxX && prop.z > box.minZ && prop.z < box.maxZ, `陈设 ${prop.id} 越出室内包围盒`);
  }
  const interiorLights = result.lightAnchors.filter((a) => a.role === 'interiorLantern');
  assert(interiorLights.length >= 2, '室内应有 ≥2 座宫灯灯位（夜景照度）');
  for (const lamp of interiorLights) {
    assert(lamp.position.x > box.minX && lamp.position.x < box.maxX, `${lamp.id} x 越界`);
    assert(lamp.position.z > box.minZ && lamp.position.z < box.maxZ, `${lamp.id} z 越界`);
    assertClose(lamp.position.y, result.stats.interior.floorY, 1e-6, `${lamp.id} 应立于室内地面`);
  }
  runner.info(`内景：地面 ${result.stats.interior.floorY}m，陈设 ${result.stats.interior.props.map((p) => p.id).join('/')}，室内灯位 ${interiorLights.length} 座`);
});

await runner.test('登记 ≥1 zone 机位 + ≥1 fp-spawn，且 fp-spawn 在可行走面上、朝向中轴', () => {
  const byMode = result.viewpoints.reduce((acc, v) => {
    acc[v.mode] = (acc[v.mode] ?? 0) + 1;
    return acc;
  }, {});
  assert((byMode.zone ?? 0) >= 1, '至少 1 个 zone 机位');
  assert((byMode['fp-spawn'] ?? 0) >= 1, '至少 1 个 fp-spawn');
  for (const vp of result.viewpoints.filter((v) => v.mode === 'fp-spawn')) {
    const surface = LAYOUT.walkableAt(vp.position.x, vp.position.z)[0];
    assert(surface, `${vp.id} 必须落在可行走面上`);
    assertClose(vp.position.y, surface.y + CONFIG.CAMERA.fpEyeHeight, 0.05, `${vp.id} 视线高`);
    assertClose(vp.target.x, 0, 1e-6, `${vp.id} 应朝向中轴（x=0）`);
  }
  // 机位数值必须与 layout 冻结表逐一相同（区域不得改机位）
  assertEqual(result.viewpoints.length, LAYOUT.VIEWPOINTS.filter((v) => v.area === ZONE).length, '视角数量应与 layout 一致');
  for (const vp of result.viewpoints) {
    const src = LAYOUT.VIEWPOINT_BY_ID[vp.id];
    assert(src, `${vp.id} 不在 layout.VIEWPOINTS 中`);
    assertEqual(JSON.stringify(vp.position), JSON.stringify(src.position), `${vp.id} 坐标被改动`);
    assertEqual(JSON.stringify(vp.target), JSON.stringify(src.target), `${vp.id} 目标点被改动`);
  }
});

/* ========================================================================== */
runner.section('4. 跨区接口对齐（§2.3 边界与连接规则）');
/* ========================================================================== */

await runner.test('本人 owner 的连接全部回显，且不越权登记他人连接（单一 owner）', () => {
  const mine = LAYOUT.CONNECTORS.filter((c) => c.owner === ZONE);
  assertEqual(result.connectors.length, mine.length, '必须回显本人 owner 的全部连接');
  const got = new Set(result.connectors.map((c) => c.id));
  for (const c of mine) {
    assert(got.has(c.id), `缺少连接 ${c.id}`);
    if (!got.has(c.id)) continue;
    const echo = result.connectors.find((x) => x.id === c.id);
    assertClose(echo.position.x, c.position.x, 1e-3, `${c.id}.position.x`);
    assertClose(echo.position.z, c.position.z, 1e-3, `${c.id}.position.z`);
    assertEqual(echo.width, c.width, `${c.id}.width`);
    assertEqual(echo.elevation, c.elevation, `${c.id}.elevation`);
  }
  // E 拥有的东侧通路不得出现在 C 的返回值里
  assert(!got.has('CXN-C-E-side-east'), 'CXN-C-E-side-east 的 owner 是 E，C 不得重复登记');
  assertEqual(LAYOUT.getConnector('CXN-C-E-side-east').owner, 'E', '该连接 owner 应为 E');
  runner.info(`C 拥有的连接：${[...got].join(' / ')}`);
});

await runner.test('B→C 内廷门接口：位置在内廷地界首线 z=80，宽度 = 门洞净宽，标高 = 内廷台基', () => {
  const cxn = LAYOUT.getConnector('CXN-B-C-inner-gate');
  const gate = LAYOUT.getSlot('C-gate-inner');
  assertEqual(cxn.position.z, LAYOUT.INNER_PALACE_Z.minZ, '门洞必须在 B/C 地界线上');
  assertEqual(cxn.position.x, 0, '门洞必须在南北中轴上');
  assertEqual(cxn.width, gate.doorWidth, '通道宽度必须等于门殿门洞净宽');
  assertEqual(cxn.elevation, TERRAIN.innerGateTerraceY, '标高必须等于内廷门台基标高');
  assertEqual(cxn.gate, gate.id, '连接必须指向门殿槽位');
  assertEqual(gate.courtyard, 'CY-C-front', '内廷门属于一进院');
});

await runner.test('C→F 御花园接口：北墙线 z=300、x=±84，且院墙确实开了同宽门洞', () => {
  const west = LAYOUT.getConnector('CXN-C-F-garden-west');
  const east = LAYOUT.getConnector('CXN-C-F-garden-east');
  for (const cxn of [west, east]) {
    assertEqual(cxn.position.z, LAYOUT.INNER_PALACE_Z.maxZ, '花园入口必须在 C/F 地界线上');
    assertEqual(Math.abs(cxn.position.x), 84, '花园入口在两侧（后寝殿居中）');
    assertEqual(cxn.elevation, TERRAIN.gardenPathsY, '标高必须等于花园步道标高');
  }
  const wall = LAYOUT.WALLS.find((w) => w.id === 'CY-C-rear-wall-north');
  assert(wall && wall.owner === ZONE, '后寝院北墙归 C 负责');
  for (const cxn of [west, east]) {
    const opening = wall.openings.find((o) => Math.abs(o.at - cxn.position.x) < 1);
    assert(opening, `北墙必须在 x=${cxn.position.x} 开门洞`);
    assert(opening.width >= cxn.width - 1e-6, `北墙门洞净宽 ${opening.width} 应 ≥ 连接宽度 ${cxn.width}`);
  }
  // 北墙不开中轴门（后寝殿居中，花园入口在两侧）
  assert(!wall.openings.some((o) => Math.abs(o.at) < 1), '后寝院北墙不应在中轴开门');
});

await runner.test('C↔D / C↔E 侧院接口：一进院侧墙 z=124 开门洞，位置在中央区边界 x=±100', () => {
  assertEqual(LAYOUT.INNER_PALACE_Z.minZ, 80);
  assertEqual(LAYOUT.CENTRAL_X.minX, -100);
  assertEqual(LAYOUT.CENTRAL_X.maxX, 100);
  assertEqual(LAYOUT.getConnector('CXN-C-D-side-west').position.x, LAYOUT.CENTRAL_X.minX, '西侧门在 C/D 地界线上');
  assertEqual(LAYOUT.getConnector('CXN-C-E-side-east').position.x, LAYOUT.CENTRAL_X.maxX, '东侧门在 C/E 地界线上');
  for (const [wallId, x] of [['CY-C-front-wall-west', -96], ['CY-C-front-wall-east', 96]]) {
    const wall = LAYOUT.WALLS.find((w) => w.id === wallId);
    assert(wall && wall.owner === ZONE, `${wallId} 归 C 负责`);
    const opening = wall.openings.find((o) => Math.abs(o.at - 124) < 1);
    assert(opening, `${wallId} 必须在 z=124 开侧门洞`);
    assert(opening.width >= 10 - 1e-6, `${wallId} 侧门洞净宽应 ≥ 10m`);
    void x;
  }
  // 门洞位置与两侧侧门槽位对齐（C-gate-west/east 位于 x=∓90）
  assertEqual(LAYOUT.getSlot('C-gate-west').z, 124);
  assertEqual(LAYOUT.getSlot('C-gate-east').z, 124);
});

await runner.test('院墙门洞净空 ≥ 玩家身高 + 一级台阶（含落在寝殿月台上的门洞）', () => {
  const openings = result.stats.wallOpenings ?? [];
  assert(openings.length >= 6, `院墙门洞数量异常：${openings.length}`);
  const groundY = TERRAIN.innerPalaceY;
  for (const o of openings) {
    assert(o.height >= o.neededHeight - 1e-6, `${o.wallId} 门洞净高 ${o.height} < 需要 ${o.neededHeight}`);
    assert(o.floorY + PLAYER.height + MODULES.stairsStepHeight <= groundY + o.height + 1e-6, `${o.wallId} 门洞净空不足`);
  }
  const tight = openings.filter((o) => o.floorY > groundY + 0.1);
  runner.info(`院墙门洞 ${openings.length} 处；其中落在高台上（净空已抬高）${tight.length} 处：${tight.map((o) => o.wallId).join('/') || '（无）'}`);
});

/* ========================================================================== */
runner.section('5. 碰撞数据与非进入建筑（§6.1 / §6.3 / §6.4）');
/* ========================================================================== */

await runner.test('不可进入建筑全部登记为障碍：12 栋槽位障碍 + 院墙实心段，id 全局唯一', () => {
  const obstacles = result.colliders.obstacles;
  assert(obstacles.length > slots.length, '障碍物必须包含全部建筑与院墙实心段');
  const ids = new Set();
  for (const o of obstacles) {
    assert(!ids.has(o.id), `障碍 id 重复：${o.id}`);
    ids.add(o.id);
    assert(o.bounds && Number.isFinite(o.y0) && Number.isFinite(o.y1), `${o.id} 缺 bounds/y0/y1`);
    assert(o.blocks === 'all' || o.blocks === 'exceptDoor', `${o.id}.blocks 非法`);
  }
  for (const slot of slots) {
    const o = obstacles.find((x) => x.buildingId === slot.id && x.sourceType === 'building');
    assert(o, `建筑 ${slot.id} 必须登记障碍`);
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
      assertClose(o.bounds[key], slot.bounds[key], 1e-6, `${slot.id} 障碍 ${key}`);
    }
    if (!slot.visitable) {
      assert(!slot.hasDoor || o.blocks === 'exceptDoor', `${slot.id} 不可进入建筑应为整体阻挡或仅门洞可通行`);
    }
  }
  const wallSpans = obstacles.filter((o) => o.sourceType === 'wall');
  assert(wallSpans.length > 0, '院墙必须登记实心段碰撞（否则第一人称可穿过院墙）');
  runner.info(`障碍 ${obstacles.length} 条：建筑 ${slots.length} + 院墙实心段 ${wallSpans.length}`);
});

await runner.test('可行走面 3 面回显 layout，坡道斜率 ≤ rampMaxSlope', () => {
  assertEqual(result.colliders.walkable.length, LAYOUT.WALKABLE.filter((w) => w.zone === ZONE).length, '可行走面数量');
  for (const w of result.colliders.walkable) {
    const src = LAYOUT.WALKABLE.find((x) => x.id === w.id);
    assert(src, `${w.id} 不在 layout.WALKABLE 中`);
    assertEqual(w.y, src.y, `${w.id}.y`);
    assertEqual(w.kind, src.kind, `${w.id}.kind`);
  }
  assert(result.colliders.ramps.length > 0, 'C 区存在台阶/坡道，ramps 不应为空');
  for (const r of result.colliders.ramps) {
    assert(r.slope <= STEP.rampMaxSlope + 1e-6, `${r.id} 斜率 ${r.slope} 超过可走坡上限`);
    assert(r.width > 0, `${r.id}.width`);
  }
  runner.info(`可行走面 ${result.colliders.walkable.length} 面，坡道/台阶 ${result.colliders.ramps.length} 段（最大斜率 ${Math.max(...result.colliders.ramps.map((r) => r.slope))}）`);
});

await runner.test('第一人称走查通路可通：内廷门 → 一进院 → 丹陛 → 月台 → 穿院墙门洞 → 寝殿内景', () => {
  const path = [
    ['内廷门内', 0, 95],
    ['一进院', 0, 120],
    ['丹陛前', 0, 132],
    ['月台边缘', 0, 137],
    ['穿主院院墙门洞', 0, 142],
    ['月台南', 0, 146],
    ['寝殿门洞', 0, 150],
    ['寝殿内景', 0, 165],
  ];
  for (const [label, x, z] of path) {
    const floor = LAYOUT.floorYAt(x, z);
    assert(floor !== null, `${label} (${x},${z}) 必须在可行走面上`);
    const hit = blockedAt(x, z, floor);
    assert(!hit, `${label} (${x},${z}) 被 ${hit?.id} 阻挡（floorY=${floor}）`);
  }
  // 反向校验：障碍判定不是"永远放行"
  const hall = LAYOUT.getSlot('C-hall-bed-main');
  const outsideDoorX = hall.x + hall.door.width / 2 + 2;
  assert(blockedAt(outsideDoorX, hall.z, 2.4), '寝殿门洞之外应被墙体阻挡');
  assert(blockedAt(-60, 142, 2.4), '主院院墙实心段应阻挡（不能从墙上穿过）');
  runner.info(`走查通路 8 个采样点全部可通；反例（门洞旁 + 实心院墙）判定为阻挡 ✓`);
});

await runner.test('场景包围盒落在 C 区地界内（无飞散、无下沉几何）', () => {
  const box = new THREE.Box3().setFromObject(result.root);
  const tol = 3; // 檐口出檐/角部起翘允许越界少量（kit 出檐 2.4m + 起翘 0.55m）
  assert(box.min.x >= LAYOUT.CENTRAL_X.minX - tol, `x 下界 ${box.min.x.toFixed(2)} 越界`);
  assert(box.max.x <= LAYOUT.CENTRAL_X.maxX + tol, `x 上界 ${box.max.x.toFixed(2)} 越界`);
  assert(box.min.z >= LAYOUT.INNER_PALACE_Z.minZ - tol, `z 下界 ${box.min.z.toFixed(2)} 越界`);
  assert(box.max.z <= LAYOUT.INNER_PALACE_Z.maxZ + tol, `z 上界 ${box.max.z.toFixed(2)} 越界`);
  // 竖向：最低 = 铺装底面（后宫地坪 - 台基高），最高 = 最高建筑的实测包围盒顶（不得有飞散/沉降几何）
  assert(box.min.y >= TERRAIN.innerPalaceY - MODULES.plinthHeightMin - 0.1, `y 下界 ${box.min.y.toFixed(2)} 过低（建筑下沉？）`);
  assert(box.min.y <= TERRAIN.innerPalaceY + 0.01, `y 下界 ${box.min.y.toFixed(2)} 高于地坪（缺铺装？）`);
  const tallest = Math.max(...[...facts.values()].map((f) => f.worldBounds.maxY));
  assert(Math.abs(box.max.y - tallest) <= 1, `场景 y 上界 ${box.max.y.toFixed(2)} 与最高建筑实测 ${tallest.toFixed(2)} 不符`);
  runner.info(`C 区包围盒 x[${box.min.x.toFixed(1)},${box.max.x.toFixed(1)}] y[${box.min.y.toFixed(1)},${box.max.y.toFixed(1)}] z[${box.min.z.toFixed(1)},${box.max.z.toFixed(1)}]（最高建筑 ${[...facts.values()].sort((a, b) => b.worldBounds.maxY - a.worldBounds.maxY)[0].id}）`);
});

/* ========================================================================== */
/* ========================================================================== */

/* ========================================================================== */
runner.section('6. 资源与预算（§8.2 分区预算 C=50）');
/* ========================================================================== */

await runner.test('合批后绘制调用 ≤ 分区预算；三角面在可见上限内', () => {
  const budget = BUDGET.drawCalls.perZone[ZONE];
  assertEqual(result.stats.drawCallBudget, budget, '区域必须声明正确预算');
  assert(result.stats.drawCalls <= budget, `C 区绘制调用 ${result.stats.drawCalls} 超预算 ${budget}`);
  assert(result.stats.triangles <= BUDGET.triangles.visibleMax, 'C 区三角面不应超过全城可见上限');
  assert(result.stats.merge, '必须执行整区合批（kit.mergeZone）');
  assert(result.stats.merge.after <= result.stats.merge.before, '合批必须降低（或不增加）批次');
  runner.info(`C 区绘制调用 ${result.stats.drawCalls}/${budget}（合批前 ${result.stats.merge?.before} → 后 ${result.stats.merge?.after}），三角面 ${result.stats.triangles}`);
});

/* ========================================================================== */
runner.section('7. 生命周期（§3.3：update 不动他人、dispose 只释放自有资源）');
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

await runner.test('dispose() 只释放自有几何，不销毁 kit 共享材质/贴图，且幂等', () => {
  const shared = kit.materials.get('plasterRed');
  let materialDisposed = 0;
  const onDispose = () => {
    materialDisposed += 1;
  };
  shared.addEventListener('dispose', onDispose);
  const texturesBefore = kit.materials.stats().textures;
  result.dispose();
  result.dispose(); // 幂等
  shared.removeEventListener('dispose', onDispose);
  assertEqual(materialDisposed, 0, 'dispose 不得销毁 kit 共享材质');
  assertEqual(kit.materials.stats().textures, texturesBefore, 'dispose 不得销毁 kit 共享贴图');
  assertEqual(result.root.children.length, 0, 'dispose 后 root 应清空');
  assertEqual(kit.materials.get('plasterRed'), shared, '共享材质仍可复用');
});

/* ========================================================================== */

process.exit(runner.summary());
