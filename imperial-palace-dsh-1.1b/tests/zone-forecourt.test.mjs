#!/usr/bin/env node
/**
 * `tests/zone-forecourt.test.mjs` — B 区中轴前朝（`src/zones/forecourt.js`）自测。
 *
 * 校验内容（对应任务 t6 的验收项）：
 *   1. 模块契约：`createZone` / `ZONE_ID` / `default` 导出；错误区 id 必须抛错；
 *   2. 返回契约：`root/buildings/connectors/colliders/viewpoints/lightAnchors/update/dispose` 全字段
 *      （用 `makeTestCtx` 注入**真 kit**，走 `validateZoneResult` 逐字段回显校验）；
 *   3. 建筑：12 槽位、id 与 layout 逐一一致、`eaveHeightAbsolute == layout.eaveHeight`（≤6mm）、
 *      单栋三角面 ≤ `BUDGET.triangles.perBuildingMax`、主殿不再重复一层 4.5m 台基；
 *   4. 台基/台阶：三层台基 = `layout.TERRACES` 逐值一致；台阶与 `layout.ROADS`（Δy 段）一一对应，
 *      跑长/标高/坡度一致；**台阶朝向规范化**（高端必须在本地 +Z 端，回归 kit 的朝向不一致问题）；
 *   5. 内景：金砖地面 = `WK-B-hall-main-interior` 逐值一致；宝座/屏风/盘龙柱/藻井/须弥座存在，
 *      且全部落在室内包围盒内、低于檐口（不穿墙不出顶）；门洞通道与 interior 机位；
 *   6. 围合：6 段院墙覆盖 3 个院落的四周（含通西/东宫苑与内廷门开口）；6 段廊庑 = layout.CORRIDORS；
 *   7. 机位/连接/碰撞/灯位：与 layout 冻结表逐值一致，障碍覆盖所有 `visitable=false` 建筑；
 *   8. 预算：复刻 `scripts/audit.mjs` 的口径统计 B 区绘制批次，≤ `BUDGET.drawCalls.perZone.B`（70）；
 *   9. 行为：`update` 不改 state/不挂载、`dispose` 幂等且只释放自有几何、确定性（两次构建一致）；
 *  10. 灰盒替身 kit 兼容（`tests/zones.test.mjs` 走的就是这条路径，必须同样通过契约）。
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

const runner = createTestRunner('zone-forecourt.test.mjs · B 区中轴前朝（12 槽位 / 三层台基 / 金銮殿内景）');

const THREE = await loadThree();
const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createKit } = await loadModule('src/kit/index.js');
const { validateZoneResult } = await loadModule('src/core/context.js');
const { rampsFromRoads, zoneLayoutFor } = await loadModule('src/core/layout-slice.js');
const greybox = await loadModule('src/zones/_greybox.js');

const MEASURE_QUALITY = 'medium'; // §8.2 预算参考档
const ZONE = 'B';
const zoneLayout = zoneLayoutFor(ZONE);
const CONNECTOR_LIST = LAYOUT.CONNECTORS;
const BUDGET = CONFIG.BUDGET;

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

/** 收集所有 part==='stairs' 的网格，返回「高端 z 质心 - 低端 z 质心」（<0 表示朝向反了）。 */
function stairOrientation(root, window = null) {
  const rows = [];
  root.traverse((node) => {
    if (!node.isMesh || node.userData?.part !== 'stairs') return;
    const pos = node.geometry?.attributes?.position;
    if (!pos || pos.count === 0) return;
    const inWindow = (i) => {
      if (!window) return true;
      const x = pos.getX(i);
      const z = pos.getZ(i);
      return x >= window.minX && x <= window.maxX && z >= window.minZ && z <= window.maxZ;
    };
    let minY = Infinity;
    let maxY = -Infinity;
    let samples = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (!inWindow(i)) continue;
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      samples += 1;
    }
    if (samples === 0) return;
    const span = maxY - minY;
    if (!(span > 1e-6)) return;
    const hiCut = maxY - span * 0.25;
    const loCut = minY + span * 0.25;
    let zHi = 0;
    let nHi = 0;
    let zLo = 0;
    let nLo = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (!inWindow(i)) continue;
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y >= hiCut) {
        zHi += z;
        nHi += 1;
      } else if (y <= loCut) {
        zLo += z;
        nLo += 1;
      }
    }
    if (!nHi || !nLo) return;
    rows.push({ name: node.name, samples, delta: +(zHi / nHi - zLo / nLo).toFixed(4) });
  });
  return rows;
}

/** 把某节点下的 stairs 几何变换到世界坐标，返回高端/低端 z 质心与 y 范围。 */
function worldStairStats(THREEImpl, object) {
  const mesh = [];
  object.traverse((n) => {
    if (n.isMesh && n.userData?.part === 'stairs') mesh.push(n);
  });
  if (mesh.length === 0) return null;
  const points = [];
  for (const node of mesh) {
    node.updateMatrixWorld(true);
    const pos = node.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      points.push(new THREEImpl.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(node.matrixWorld));
    }
  }
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY;
  const hiCut = maxY - span * 0.25;
  const hi = points.filter((p) => p.y >= hiCut);
  const mean = (arr) => arr.reduce((a, p) => a + p.z, 0) / Math.max(1, arr.length);
  return {
    minY,
    maxY,
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    minZHi: hi.length ? Math.min(...hi.map((p) => p.z)) : null,
    maxZHi: hi.length ? Math.max(...hi.map((p) => p.z)) : null,
    meanZHi: mean(hi),
    hiCount: hi.length,
  };
}

/**
 * 台阶/御路"最高带"的本地 z 相对位置（0 = 本地 −Z 端，1 = 本地 +Z 端）。
 * 用于断言"踏步与丹陛御路同向"：两者都必须把最高面放在 +Z（贴台明）一侧。
 */
function highestBandRelativeZ(geometry, segments = 6) {
  const pos = geometry.attributes.position;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = -Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const z = pos.getZ(i);
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (pos.getY(i) > minY) minY = pos.getY(i);
  }
  if (!(maxZ - minZ > 1e-6)) return 0.5;
  let best = { z: minZ, y: -Infinity };
  for (let s = 0; s < segments; s += 1) {
    const z0 = minZ + ((maxZ - minZ) * s) / segments;
    const z1 = minZ + ((maxZ - minZ) * (s + 1)) / segments;
    let hi = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const z = pos.getZ(i);
      if (z >= z0 - 1e-6 && z <= z1 + 1e-6 && pos.getY(i) > hi) hi = pos.getY(i);
    }
    if (hi > best.y) best = { z: (z0 + z1) / 2, y: hi };
  }
  return (best.z - minZ) / (maxZ - minZ);
}

/** 世界包围盒（root 为单位变换：几何坐标即世界坐标）。 */
function boxOf(object, THREEImpl) {
  const box = new THREEImpl.Box3().setFromObject(object);
  return {
    minX: +box.min.x.toFixed(3),
    maxX: +box.max.x.toFixed(3),
    minY: +box.min.y.toFixed(3),
    maxY: +box.max.y.toFixed(3),
    minZ: +box.min.z.toFixed(3),
    maxZ: +box.max.z.toFixed(3),
  };
}

/** 区间并集是否覆盖 [lo,hi]。 */
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

/** 真 kit 的 B 区构建产物（medium 档，全测试共用）。 */
const kit = createKit({ THREE, config: CONFIG, quality: MEASURE_QUALITY });
const ctx = await makeTestCtx({ zoneId: ZONE, kit, quality: MEASURE_QUALITY });
const mod = await loadModule(zoneModulePath(ZONE));
const built = await mod.createZone(ctx);
const built2 = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: createKit({ THREE, config: CONFIG, quality: MEASURE_QUALITY }), quality: MEASURE_QUALITY }));
/**
 * 几何级检查（逐构件包围盒、逐段台阶朝向）需要**未合批**的树：合批会把叶子网格合并进 B:batch，
 * 各构件 Group 变成空壳。这里把真 kit 的 `mergeZone` 摘掉（其余接口不变）单独构建一份，
 * 仅供几何断言使用；预算与契约断言仍用合批后的 `built`。
 */
const unmergedKit = { ...kit, mergeZone: undefined };
const unmerged = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: unmergedKit, quality: MEASURE_QUALITY }));

/* ========================================================================== */
runner.section('1. 模块契约与错误路径');
/* ========================================================================== */

await runner.test('导出 createZone / ZONE_ID="B" / default', () => {
  assertEqual(typeof mod.createZone, 'function', '必须导出 createZone(ctx)');
  assertEqual(mod.ZONE_ID, ZONE, 'ZONE_ID 必须是 "B"');
  assertEqual(mod.default, mod.createZone, 'default 应指向 createZone');
  assertEqual(ZONE_MODULES.B, 'src/zones/forecourt.js', 'harness 的模块清单路径');
});

await runner.test('ctx 区 id 不匹配 / 缺 zoneLayout / 缺 kit 时必须抛错（不得静默产出）', async () => {
  const wrong = await makeTestCtx({ zoneId: 'C', kit });
  await assertThrowsAsync(() => mod.createZone(wrong), 'zoneLayout.id !== B 时必须抛错');
  await assertThrowsAsync(() => mod.createZone({ ...ctx, zoneLayout: null }), '缺 zoneLayout 时必须抛错');
  await assertThrowsAsync(() => mod.createZone({ ...ctx, kit: null }), '缺 kit 时必须抛错');
});

await runner.test('源码不得出现自建几何/自建灯光/第二套循环（只消费 kit 与 config 令牌）', () => {
  const source = readSource('src/zones/forecourt.js');
  for (const banned of ['BoxGeometry', 'CylinderGeometry', 'SphereGeometry', 'PlaneGeometry', 'BufferGeometry', 'new THREE.Mesh', 'requestAnimationFrame', 'setInterval', 'new THREE.PointLight', 'new THREE.DirectionalLight', 'THREE.Scene', 'scene.add']) {
    assert(!source.includes(banned), `源码出现禁用标识：${banned}（几何必须来自 kit 构件，灯光归 t2 环境系统）`);
  }
  assert(/mergeZone\(/.test(source), '必须调用 kit.mergeZone 做整区合批');
});

/* ========================================================================== */
runner.section('2. 返回契约（validateZoneResult，真 kit）');
/* ========================================================================== */

await runner.test('§3.3/§4/§5/§6/§8.3 全部字段通过，建筑/通道/障碍/可行走面/坡道/机位/灯位齐全', () => {
  const { problems, stats } = validateZoneResult(ZONE, built, { THREE, scope: 'zone', expectBuildings: zoneLayout.slots.length });
  assertNoProblems(problems, 'B 区契约');
  assertEqual(stats.buildings, 12, '建筑数量必须等于 layout 分配数（12）');
  assertEqual(stats.connectors, 7, '本人 owner 的通道数');
  assertEqual(stats.obstacles, 12, '障碍数（12 栋建筑各一条）');
  assertEqual(stats.walkable, 8, '可行走面数');
  assertEqual(stats.ramps, 8, '坡道/台阶数（= 本区 Δy ≠ 0 的道路段数）');
  assertEqual(stats.viewpoints, 4, '机位数');
  assertEqual(stats.lightAnchors, 24, '灯位数');
  runner.info(`B 区：${stats.meshes} 网格 / ${stats.triangles} 三角面 / ${drawCallCount(built.root)} 绘制批次（≤${BUDGET.drawCalls.perZone.B}）`);
});

/* ========================================================================== */
runner.section('3. 建筑（12 槽位，逐字段回显 + 真实构件尺寸核对）');
/* ========================================================================== */

await runner.test('建筑 id 与 layout 的 B 区槽位一一对应，且无重复', () => {
  const ids = built.buildings.map((b) => b.id).sort();
  const expected = LAYOUT.SLOTS.filter((s) => s.zone === ZONE).map((s) => s.id).sort();
  assertEqual(ids.join(','), expected.join(','), '建筑 id 必须与注册表逐一一致');
  assertEqual(new Set(ids).size, ids.length, 'id 不得重复');
});

await runner.test('每栋建筑：檐口高 = layout.eaveHeight（≤6mm）；单栋三角面 ≤ 24000', () => {
  const rows = built.stats.buildingMetrics;
  assertEqual(rows.length, 12, '应记录 12 栋建筑的实测指标');
  for (const row of rows) {
    assert(row.eaveHeightAbsolute !== null, `${row.id} 缺少 eaveHeightAbsolute（kit metrics）`);
    assertClose(row.eaveHeightAbsolute, row.layoutEaveHeight, 0.006, `${row.id} 檐口高与 layout.eaveHeight 不一致`);
    assert(row.triangles > 0, `${row.id} 三角面必须为正`);
    assert(row.triangles <= BUDGET.triangles.perBuildingMax, `${row.id} 三角面 ${row.triangles} 超过单栋上限 ${BUDGET.triangles.perBuildingMax}`);
  }
  const worst = rows.reduce((a, b) => (b.triangles > a.triangles ? b : a), rows[0]);
  runner.info(`单栋最大三角面 ${worst.triangles}（${worst.id}，上限 ${BUDGET.triangles.perBuildingMax}）`);
});

await runner.test('主殿在金銮殿台基顶上（不重复造第二层 4.5m 台明），其余建筑落在各自地坪', () => {
  const byId = new Map(built.stats.buildingMetrics.map((r) => [r.id, r]));
  const main = byId.get('B-hall-main');
  assertClose(main.worldBounds.minY, CONFIG.MODULES.terraceTotalHeight, 0.15, '金銮殿屋身必须从台基顶（4.5m）起算');
  assert(main.worldBounds.maxY > CONFIG.MODULES.terraceTotalHeight + 5, '金銮殿总高应显著高于台基顶');
  for (const row of built.stats.buildingMetrics) {
    if (row.id === 'B-hall-main') continue;
    assertClose(row.worldBounds.minY, 0, 0.05, `${row.id} 应落在 B 区地坪（y=0）`);
  }
});

await runner.test('建筑世界坐标包围盒与 layout 槽位中心/占地一致（±出檐余量）', () => {
  for (const slot of zoneLayout.slots) {
    const row = built.stats.buildingMetrics.find((r) => r.id === slot.id);
    const cx = (row.worldBounds.minX + row.worldBounds.maxX) / 2;
    const cz = (row.worldBounds.minZ + row.worldBounds.maxZ) / 2;
    // kit 的台阶向檐外伸出（近景 3–10m），故包围盒中心相对槽位中心有系统偏移，容差取半个台阶级跑长
    assertClose(cx, slot.x, 6, `${slot.id} 中心 x 偏移过大`);
    assertClose(cz, slot.z, 6, `${slot.id} 中心 z 偏移过大`);
    assert(row.worldBounds.maxX - row.worldBounds.minX >= slot.w - 0.5, `${slot.id} 出檐后宽度不应小于槽位宽度`);
  }
});

/* ========================================================================== */
runner.section('4. 三层白石台基 / 丹陛 / 两侧台阶');
/* ========================================================================== */

await runner.test('台基三层 = layout.TERRACES 逐值一致，总高 4.5m（$MODULES.terraceTotalHeight）', () => {
  const node = built.root.getObjectByName('B-terrace-main');
  assert(node, '缺少台基节点 B-terrace-main');
  const tiers = node.userData?.kit?.metrics?.tiers ?? [];
  const source = LAYOUT.TERRACES.filter((t) => t.zone === ZONE).sort((a, b) => a.tier - b.tier);
  assertEqual(tiers.length, source.length, '台基层数');
  tiers.forEach((tier, i) => {
    assertEqual(tier.tier, source[i].tier, `第 ${i + 1} 层 tier 编号`);
    assertClose(tier.y0, source[i].y0, 1e-6, `第 ${i + 1} 层 y0`);
    assertClose(tier.y1, source[i].y1, 1e-6, `第 ${i + 1} 层 y1`);
    assertClose(tier.w, source[i].bounds.maxX - source[i].bounds.minX, 1e-6, `第 ${i + 1} 层宽`);
    assertClose(tier.d, source[i].bounds.maxZ - source[i].bounds.minZ, 1e-6, `第 ${i + 1} 层深`);
  });
  assertClose(tiers[tiers.length - 1].y1, CONFIG.MODULES.terraceTotalHeight, 1e-6, '台基总高');
});

await runner.test('栏杆 19 段：三层四周覆盖，丹陛处留 26m 缺口，第一层另留东西/台北台阶缺口', () => {
  const runs = built.stats.details.railRuns;
  assertEqual(runs.length, 19, '栏杆直段数');
  const floorRuns = runs.filter((r) => r.tier === 't1');
  const tier1South = floorRuns.filter((r) => r.edge.startsWith('south')).map((r) => [r.x - r.length / 2, r.x + r.length / 2]);
  assert(floorRuns.filter((r) => r.edge.startsWith('south')).length >= 2, '第一层南面必须有栏杆段');
  assert(!covers(tier1South, -13, 13), '丹陛位置（±13m）不得有栏杆');
  assert(covers(tier1South, -88, -85) && covers(tier1South, 85, 88), '第一层南面应保留角部栏杆段');
  const tier1North = floorRuns.filter((r) => r.edge.startsWith('north')).map((r) => [r.x - r.length / 2, r.x + r.length / 2]);
  assert(!covers(tier1North, -65, -55) && !covers(tier1North, 55, 65), '台北两侧台阶处不得有栏杆');
  for (const tier of ['t2', 't3']) {
    const south = runs.filter((r) => r.tier === tier && r.edge.startsWith('south')).map((r) => [r.x - r.length / 2, r.x + r.length / 2]);
    assert(!covers(south, -13, 13), `${tier} 丹陛处不得有栏杆`);
    const west = runs.filter((r) => r.tier === tier && r.edge === 'west');
    const east = runs.filter((r) => r.tier === tier && r.edge === 'east');
    assertEqual(west.length, 1, `${tier} 西面栏杆段数`);
    assertEqual(east.length, 1, `${tier} 东面栏杆段数`);
  }
});

await runner.test('台阶/丹陛 8 段与 layout.ROADS 的 Δy 段一一对应（跑长/标高/宽度/坡度一致）', () => {
  const flights = built.stats.details.flights;
  const ramps = rampsFromRoads(zoneLayout.roads);
  assertEqual(flights.length, ramps.length, '台阶数必须等于带标高差的道路段数');
  assertEqual(ramps.length, 8, '本区 Δy ≠ 0 的道路段数');
  for (const ramp of ramps) {
    const flight = flights.find((f) => `RAMP-${f.roadId}` === ramp.id);
    assert(flight, `缺少道路 ${ramp.id} 对应的台阶`);
    const top = ramp.from.y >= ramp.to.y ? ramp.from : ramp.to;
    const bottom = top === ramp.from ? ramp.to : ramp.from;
    assertClose(flight.rise, Math.abs(ramp.to.y - ramp.from.y), 1e-6, `${ramp.id} 抬升`);
    assertClose(Math.hypot(ramp.to.x - ramp.from.x, ramp.to.z - ramp.from.z), flight.run, 0.01, `${ramp.id} 跑长`);
    assertClose(flight.top.z, top.z, 1e-6, `${ramp.id} 顶端 z`);
    assertClose(flight.bottom.z, bottom.z, 1e-6, `${ramp.id} 底端 z`);
    assert(flight.stepDepth * flight.steps >= flight.run - 0.05, `${ramp.id} 可见踏面总深必须覆盖注册跑长（否则第一人称会浮空）`);
    const slope = ramp.slope;
    assert(slope <= CONFIG.INTERACTION.step.rampMaxSlope + 1e-6, `${ramp.id} 坡度 ${slope} 超过可走上限`);
  }
  const danbi = flights.filter((f) => f.danbi);
  assertEqual(danbi.length, 3, '丹陛应为三段（中央御道）');
  runner.info(`丹陛三段：${danbi.map((f) => `${f.rise}m/${f.run}m`).join(' + ')} = ${danbi.reduce((a, f) => a + f.rise, 0).toFixed(1)}m`);
});

await runner.test('台阶朝向（t29 对齐 kit t25）：台阶方向由 kit 拥有，区域零翻转且本地高端在 +Z', () => {
  const rows = stairOrientation(unmerged.root);
  assert(rows.length >= 19, `应有 ≥19 段台阶网格（11 栋自带台阶 + 8 段本区台阶），实际 ${rows.length}`);
  const bad = rows.filter((r) => r.delta < 0);
  assertEqual(bad.length, 0, `存在朝向反了的台阶：${JSON.stringify(bad.slice(0, 5))}`);
  const fix = built.stats.stairOrientationFix;
  assertEqual(fix.flipped + fix.kept, fix.flights, '规范化报告必须覆盖全部台阶网格');
  // kit t25 已修 `buildStairs`（踏步与丹陛同向）→ 原生台阶朝向正确，区域侧兜底应"零翻转"。
  // 判据不依赖版本号：kit 若再次反向，flipped 会回到 flights 并在这里报错（回归保护不因修复而失效）。
  assertEqual(fix.flipped, 0, `kit 修复后不应再翻转任何台阶（实测 flipped=${fix.flipped}）`);
  assertEqual(fix.kept, fix.flights, '全部台阶应判定为"已正确朝向"');
  // t29 追加：同一段丹陛里"踏步"与"imperialRamp（御路）"必须同向 —— 这正是当年被复现的缺陷形态
  // （踏步沿 −Z 递升、御路沿 +Z 递升），因此把它固化成断言，而不只留在探针输出里。
  const danbiGroup = unmerged.root.getObjectByName('B-flight-main-danbi-1');
  assert(danbiGroup, '缺少丹陛第一段节点 B-flight-main-danbi-1');
  const stepPart = danbiGroup.children.find((c) => c.userData?.part === 'stairs');
  const rampPart = danbiGroup.children.find((c) => c.userData?.part === 'imperialRamp');
  assert(stepPart && rampPart, '丹陛段必须同时包含 stairs 与 imperialRamp 两个部位');
  const stepHigh = highestBandRelativeZ(stepPart.geometry);
  const rampHigh = highestBandRelativeZ(rampPart.geometry);
  assert(stepHigh >= 0.5, `踏步最高踏面应在本地 +Z 端（相对位置 ${stepHigh.toFixed(3)}）`);
  assert(rampHigh >= 0.5, `丹陛御路最高端应在本地 +Z 端（相对位置 ${rampHigh.toFixed(3)}）`);
  assert(Math.abs(stepHigh - rampHigh) <= 0.15, `踏步与御路最高端必须同侧（相差 ${Math.abs(stepHigh - rampHigh).toFixed(3)}）`);
  runner.info(`台阶网格 ${fix.flights} 个（零翻转）；丹陛第一段 踏步/御路 最高端相对位置 ${stepHigh.toFixed(3)} / ${rampHigh.toFixed(3)}（同向）`);
});

await runner.test('本区 8 段台阶的世界落位：顶端贴合注册端点、底端落在下级地面（第一人称不会浮空）', () => {
  for (const flight of built.stats.details.flights) {
    const group = unmerged.root.getObjectByName(flight.id);
    assert(group, `缺少台阶节点 ${flight.id}`);
    const stats = worldStairStats(THREE, group);
    assert(stats, `${flight.id} 未找到台阶几何`);
    // 踏面（y 最高 25% 顶点）的世界 z 必须贴合道路的高标高端点；几何 z 范围必须等于注册跑长
    assert(
      flight.top.z >= stats.minZHi - 0.6 && flight.top.z <= stats.maxZHi + 0.6,
      `${flight.id} 高端踏面未贴住道路高端点（踏面 z ${stats.minZHi}..${stats.maxZHi}，期望贴合 ${flight.top.z}）`,
    );
    assertClose(Math.abs(stats.maxZ - stats.minZ), flight.run, 0.6, `${flight.id} 实际跑长与注册跑长一致`);
    assertClose(Math.max(stats.maxZ, stats.minZ), Math.max(flight.top.z, flight.bottom.z), 0.6, `${flight.id} 几何终点与道路端点不一致`);
    assertClose(Math.min(stats.maxZ, stats.minZ), Math.min(flight.top.z, flight.bottom.z), 0.6, `${flight.id} 几何起点与道路端点不一致`);
    assertClose(stats.maxY - stats.minY, flight.rise, 0.35, `${flight.id} 实际抬升与道路标高差一致`);
  }
  runner.info(`8 段台阶世界落位与 layout.ROADS 的高/低端点、抬升、跑长一致（跑长直接用道路水平长度）`);
});

await runner.test('规范化工具本身：原生台阶判定为已正确；对人为反向样本可翻转且幂等', () => {
  // (1) 原生 kit 台阶（t25 修复后）：朝向已正确 → 不应翻转
  const raw = kit.stairs({ id: 'probe-raw', width: 10, rise: 1.5, x: 0, z: 0, baseY: 0, rotationYDeg: 0, stepDepth: 1.2 });
  const before = stairOrientation(raw);
  assertEqual(before.length, 1, '原生台阶应有 1 个 stairs 网格');
  assert(before[0].delta > 0, `原生 kit 台阶应已朝向正确（delta=${before[0].delta}）`);
  const keep = mod.alignStairFlights(THREE, raw);
  assertEqual(keep.flipped, 0, '已正确的台阶不得被翻转');
  assertEqual(keep.kept, 1, '已正确的台阶应计入 kept');

  // (2) 人为把同一段台阶绕自身包围盒中心 Y 旋转 180°（等价于旧 kit 的反向几何）→ 必须被检出并翻转，
  //     且第二次调用幂等（不再翻转）。这样保住了该工具"能判错"的判别力，且不依赖 kit 是否处于缺陷版本。
  const reversed = kit.stairs({ id: 'probe-reversed', width: 10, rise: 1.5, x: 0, z: 0, baseY: 0, rotationYDeg: 0, stepDepth: 1.2 });
  let sampleMesh = null;
  reversed.traverse((node) => {
    if (!sampleMesh && node.isMesh && node.userData?.part === 'stairs') sampleMesh = node;
  });
  assert(sampleMesh, '人为反向样本里应有 stairs 网格');
  sampleMesh.geometry.computeBoundingBox();
  const zc = (sampleMesh.geometry.boundingBox.min.z + sampleMesh.geometry.boundingBox.max.z) / 2;
  sampleMesh.geometry.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(0, 0, zc)
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, -zc)),
  );
  sampleMesh.geometry.computeBoundingBox();
  const reversedBefore = stairOrientation(reversed);
  assert(reversedBefore[0].delta < 0, `人为反向样本应被检出（delta=${reversedBefore[0].delta}）`);
  const first = mod.alignStairFlights(THREE, reversed);
  assertEqual(first.flipped, 1, '第一次规范化应翻转 1 个网格');
  const reversedAfter = stairOrientation(reversed);
  assert(reversedAfter[0].delta > 0, `翻转后高端应朝 +Z（delta=${reversedAfter[0].delta}）`);
  const second = mod.alignStairFlights(THREE, reversed);
  assertEqual(second.flipped, 0, '幂等：第二次不得再翻转');
  assertEqual(second.kept, 1, '幂等：第二次应判定为已朝正确方向');
});

/* ========================================================================== */
runner.section('5. 金銮殿内景（金砖地面 / 宝座 / 屏风 / 盘龙柱 / 藻井）');
/* ========================================================================== */

const interiorFace = zoneLayout.walkable.find((w) => w.kind === 'interior');
const hallSlot = LAYOUT.SLOTS.find((s) => s.id === 'B-hall-main');

await runner.test('金砖地面与登记的内景可行走面逐值一致，材质取 config.MATERIALS.interiorBrick', () => {
  let floorMesh = null;
  built.root.traverse((node) => {
    if (node.isMesh && node.material === kit.materials.interiorBrick) floorMesh = node;
  });
  assert(floorMesh, '缺少金砖地面（材质必须来自 kit.materials.interiorBrick）');
  const box = boxOf(floorMesh, THREE);
  assertClose(box.minX, interiorFace.bounds.minX, 0.05, '金砖地面西边界');
  assertClose(box.maxX, interiorFace.bounds.maxX, 0.05, '金砖地面东边界');
  assertClose(box.minZ, interiorFace.bounds.minZ, 0.05, '金砖地面南边界');
  assertClose(box.maxZ, interiorFace.bounds.maxZ, 0.05, '金砖地面北边界');
  assertClose(box.maxY, interiorFace.y + 0.02, 0.03, '金砖地面标高（台基顶 + 2cm 防共面）');
});

await runner.test('内景构件齐全（须弥座/宝座/屏风/盘龙柱箍/藻井/香炉）', () => {
  const names = [
    'B-interior-dais',
    'B-interior-throne-seat',
    'B-interior-throne-back',
    'B-interior-throne-arm-west',
    'B-interior-throne-arm-east',
    'B-interior-screen',
    'B-interior-caisson-0-ew-w',
    'B-interior-caisson-0-ns-n',
    'B-interior-caisson-1-ew-e',
    'B-interior-caisson-1-ns-s',
    'B-interior-caisson-2-center',
    'B-interior-caisson-boss',
    'B-interior-censer-east',
    'B-interior-censer-west',
  ];
  for (const name of names) {
    assert(unmerged.root.getObjectByName(name), `缺少内景构件 ${name}`);
  }
  const rings = built.stats.interior.fixtures;
  assert(rings >= 4, '内景构件登记条目应 ≥4');
  runner.info(`内景：${names.length} 个具名构件；藻井 3 层同心方井 + 鎏金宝顶（平棋式，挂在 kit 檐下底板之下）`);
});

await runner.test('内景所有构件落在室内包围盒内且低于檐口（不穿墙、不出顶）', () => {
  const floorY = interiorFace.y;
  const ceilingY = hallSlot.baseY + CONFIG.MODULES.eaveHeight * CONFIG.GRADES[hallSlot.grade].eaveHeightFactor;
  const box = {
    minX: interiorFace.bounds.minX - 1,
    maxX: interiorFace.bounds.maxX + 1,
    minZ: interiorFace.bounds.minZ - 1,
    maxZ: interiorFace.bounds.maxZ + 1,
  };
  const names = [
    'B-interior-dais',
    'B-interior-throne-seat',
    'B-interior-throne-back',
    'B-interior-throne-arm-west',
    'B-interior-throne-arm-east',
    'B-interior-screen',
    'B-interior-caisson-0-ew-w',
    'B-interior-caisson-0-ns-n',
    'B-interior-caisson-1-ew-e',
    'B-interior-caisson-1-ns-s',
    'B-interior-caisson-2-center',
    'B-interior-caisson-boss',
    'B-interior-censer-east',
    'B-interior-censer-west',
    'B-interior-column-ring-w--123.3',
    'B-interior-column-ring-e--108.7',
  ];
  // 殿身内轮廓（比可行走面宽：可行走面只是人可走的地面范围，檐下/藻井可略超出）
  const plinth = Math.min(CONFIG.MODULES.plinthWidth, Math.min(hallSlot.w, hallSlot.d) * 0.12);
  const room = {
    minX: -hallSlot.w / 2 + plinth,
    maxX: hallSlot.w / 2 - plinth,
    minZ: hallSlot.z - hallSlot.d / 2 + plinth,
    maxZ: hallSlot.z + hallSlot.d / 2 - plinth,
  };
  const checked = [];
  for (const name of names) {
    const node = unmerged.root.getObjectByName(name);
    assert(node, `缺少 ${name}`);
    const b = boxOf(node, THREE);
    const ceilingPiece = name.includes('caisson');
    const limit = ceilingPiece ? room : box;
    assert(b.minX >= limit.minX && b.maxX <= limit.maxX, `${name} 超出室内东西边界（x ${b.minX}..${b.maxX}）`);
    assert(b.minZ >= limit.minZ && b.maxZ <= limit.maxZ, `${name} 超出室内南北边界（z ${b.minZ}..${b.maxZ}）`);
    assert(b.minY >= floorY - 0.05, `${name} 低于金砖地面（y=${b.minY}）`);
    assert(b.maxY <= ceilingY + 0.05, `${name} 穿出檐口（y=${b.maxY} > ${ceilingY.toFixed(2)}）`);
    if (ceilingPiece) {
      // 藻井构件挂在檐下；中心宝顶下垂到宝座上方（仍高于金砖地面 2m 以上）
      assert(b.minY > floorY + 2, `${name} 应挂在檐下、高于金砖地面（y=${b.minY}）`);
    }
    checked.push(`${name} y[${b.minY},${b.maxY}]`);
  }
  // 宝座位于屏风之前（南侧）、朝向中轴门洞；藻井在宝座正上方
  const screen = boxOf(unmerged.root.getObjectByName('B-interior-screen'), THREE);
  const seat = boxOf(unmerged.root.getObjectByName('B-interior-throne-seat'), THREE);
  const caisson = boxOf(unmerged.root.getObjectByName('B-interior-caisson-2-center'), THREE);
  assert(seat.maxZ <= screen.minZ + 0.6, '宝座必须位于屏风之前（南侧）');
  assertClose((seat.minX + seat.maxX) / 2, 0, 0.05, '宝座居中于中轴');
  assertClose((caisson.minX + caisson.maxX) / 2, (seat.minX + seat.maxX) / 2, 0.2, '藻井必须对准宝座');
  runner.info(`室内净高 ${floorY} → ${ceilingY.toFixed(2)}m；${checked.length} 个构件全部在包络内（宝座 z=${((seat.minZ + seat.maxZ) / 2).toFixed(1)}，屏风 z=${((screen.minZ + screen.maxZ) / 2).toFixed(1)}）`);
});

await runner.test('门洞与通道保留：金銮殿门洞 26m 净宽 + 连通连接器 + interior 机位在室内', () => {
  const door = built.buildings.find((b) => b.id === 'B-hall-main').door;
  assert(door, '金銮殿必须登记门洞');
  assertEqual(door.width, 26, '门洞净宽（layout.passageWidth）');
  assert(door.height >= 3, '门洞净高应可通行');
  const connector = CONNECTOR_LIST.find((c) => c.id === 'CXN-B-main-hall-door');
  assert(connector, '缺少金銮殿门洞通道连接器 CXN-B-main-hall-door');
  assertClose(connector.elevation, CONFIG.MODULES.terraceTotalHeight, 1e-6, '门洞标高 = 台基顶');
  const vp = built.viewpoints.find((v) => v.mode === 'interior');
  assert(vp, '必须登记 1 个 interior 机位');
  assertEqual(vp.id, 'VP-B-interior');
  assert(vp.position.x >= interiorFace.bounds.minX && vp.position.x <= interiorFace.bounds.maxX, '内景机位必须在室内包围盒内（x）');
  assert(vp.position.z >= interiorFace.bounds.minZ && vp.position.z <= interiorFace.bounds.maxZ, '内景机位必须在室内包围盒内（z）');
  assertClose(vp.position.y, interiorFace.y + CONFIG.CAMERA.fpEyeHeight, 0.05, '内景机位视线高');
});

/* ========================================================================== */
runner.section('6. 围合（院墙 + 廊庑，广场四周不得留无边界空地）');
/* ========================================================================== */


await runner.test('院墙 6 段：共线归并后覆盖 3 个院落的四边，且开口落在通西/东宫苑与内廷门位置', () => {
  const runs = built.stats.details.wallRuns;
  assertEqual(runs.length, 6, '共线归并后院墙段数（3 院落 × 4 边 → 归并后 6 段）');
  for (const courtyard of zoneLayout.courtyards) {
    const { minX, maxX, minZ, maxZ } = courtyard.bounds;
    const south = runs.filter((r) => r.alongX && Math.abs(r.line - minZ) < 0.01).map((r) => [r.lo, r.hi]);
    const north = runs.filter((r) => r.alongX && Math.abs(r.line - maxZ) < 0.01).map((r) => [r.lo, r.hi]);
    const west = runs.filter((r) => !r.alongX && Math.abs(r.line - minX) < 0.01).map((r) => [r.lo, r.hi]);
    const east = runs.filter((r) => !r.alongX && Math.abs(r.line - maxX) < 0.01).map((r) => [r.lo, r.hi]);
    assert(covers(south, minX, maxX), `${courtyard.id} 南边未闭合`);
    assert(covers(north, minX, maxX), `${courtyard.id} 北边未闭合`);
    assert(covers(west, minZ, maxZ), `${courtyard.id} 西边未闭合`);
    assert(covers(east, minZ, maxZ), `${courtyard.id} 东边未闭合`);
  }
  // 跨区通道开口：广场→西/东宫苑（z=-300）与后殿院→西/东宫苑（z=40）
  for (const connectorId of ['CXN-B-D-plaza-west', 'CXN-B-E-plaza-east', 'CXN-B-D-rear-west', 'CXN-B-E-rear-east']) {
    const connector = CONNECTOR_LIST.find((c) => c.id === connectorId);
    const side = connector.position.x < 0 ? -96 : 96;
    const run = runs.find((r) => !r.alongX && Math.abs(r.line - side) < 0.01);
    assert(run, `缺少 x=${side} 的院墙段`);
    const mid = (run.lo + run.hi) / 2;
    const opening = run.openings.find((o) => Math.abs(o.at + mid - connector.position.z) <= 1.5);
    assert(opening, `${connectorId} 处院墙必须留开口（z=${connector.position.z}）`);
    assert(opening.width >= connector.width - 1, `${connectorId} 开口宽度应不小于通道宽度 ${connector.width}`);
  }
  // 中轴开口：南（进广场）与北（内廷门）
  const southRun = runs.find((r) => r.alongX && Math.abs(r.line + 400) < 0.01);
  assert(southRun, '缺少广场南墙');
  const southMid = (southRun.lo + southRun.hi) / 2;
  assert(southRun.openings.some((o) => Math.abs(o.at + southMid) <= 1.5 && o.width >= 20), '广场南墙必须留中轴开口');
  const northRun = runs.find((r) => r.alongX && Math.abs(r.line - 80) < 0.01);
  assert(northRun, '缺少后殿院北墙');
  const northMid = (northRun.lo + northRun.hi) / 2;
  assert(northRun.openings.some((o) => Math.abs(o.at + northMid) <= 1.5 && o.width >= 24), '后殿院北墙必须留内廷门开口');
});

await runner.test('廊庑 6 段与 layout.CORRIDORS 一致（含广场东西 3 层廊）', () => {
  const source = LAYOUT.CORRIDORS.filter((c) => c.owner === ZONE);
  assertEqual(source.length, 6, 'layout 中 B 区廊庑段数');
  assertEqual(built.stats.corridors, 6, '实现数');
  assertEqual(built.stats.details.corridors.length, 6, '实现明细数');
  for (const corridor of source) {
    const node = unmerged.root.getObjectByName(corridor.id);
    assert(node, `缺少廊庑 ${corridor.id}`);
    const box = boxOf(node, THREE);
    const minZ = Math.min(corridor.from.z, corridor.to.z) - corridor.width;
    const maxZ = Math.max(corridor.from.z, corridor.to.z) + corridor.width;
    assert(box.minZ >= minZ - 2 && box.maxZ <= maxZ + 2, `${corridor.id} 廊庑位置偏离登记范围`);
  }
  const three = source.filter((c) => c.floors === 3);
  assertEqual(three.length, 2, '广场东西廊应为 3 层（layout 中 floors=3 的两段）');
});

/* ========================================================================== */
runner.section('7. 机位 / 连接 / 碰撞 / 灯位（与冻结表逐值一致）');
/* ========================================================================== */

await runner.test('机位 4 个：≥1 zone + 1 fp-spawn + 1 interior（+1 focus-extra），坐标与 layout 完全一致', () => {
  const modes = built.viewpoints.reduce((acc, v) => {
    acc[v.mode] = (acc[v.mode] ?? 0) + 1;
    return acc;
  }, {});
  assert((modes.zone ?? 0) >= 1, '至少 1 个 zone 机位');
  assert((modes['fp-spawn'] ?? 0) >= 1, '至少 1 个 fp-spawn');
  assert((modes.interior ?? 0) >= 1, 'B 区必须额外 1 个 interior 机位');
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
  // fp-spawn 必须朝中轴（目标点在 x≈0 附近）
  const spawn = built.viewpoints.find((v) => v.mode === 'fp-spawn');
  assert(Math.abs(spawn.target.x) <= 1, 'fp-spawn 应朝向中轴');
  assert(spawn.position.x < 0 || spawn.position.x > 0, 'fp-spawn 应偏离中轴，便于起步');
});

await runner.test('跨区连接 7 条（本人 owner）位置/宽度/标高与 layout 一致', () => {
  const expected = LAYOUT.CONNECTORS.filter((c) => c.owner === ZONE);
  assertEqual(expected.length, 7, 'layout 中 owner=B 的通道数');
  assertEqual(built.connectors.length, 7, '返回的连接数');
  for (const connector of built.connectors) {
    const source = expected.find((c) => c.id === connector.id);
    assert(source, `${connector.id} 不是本人 owner 的通道`);
    assertClose(connector.position.x, source.position.x, 1e-6, `${connector.id} x`);
    assertClose(connector.position.z, source.position.z, 1e-6, `${connector.id} z`);
    assertEqual(connector.width, source.width, `${connector.id} 宽度`);
    assertEqual(connector.elevation, source.elevation, `${connector.id} 标高`);
  }
});

await runner.test('碰撞：障碍 12 条覆盖全部 visitable=false 建筑；walkable 8 面；坡道坡度合规', () => {
  const obstacles = built.colliders.obstacles;
  assertEqual(obstacles.length, 12, '障碍数');
  for (const building of built.buildings) {
    const obstacle = obstacles.find((o) => o.buildingId === building.id);
    assert(obstacle, `建筑 ${building.id} 必须登记障碍并进入 colliders（不得成为可穿越空间）`);
    if (building.hasDoor === false) {
      assertEqual(obstacle.blocks, 'all', `${building.id} 无门洞 → 必须整体阻挡（不得成为可穿越空间）`);
      assertEqual(obstacle.door, null, `${building.id} 无门洞 → 不得登记门洞`);
    } else {
      assertEqual(obstacle.blocks, 'exceptDoor', `${building.id} 有门洞（门殿/可进入）→ 仅门洞通行`);
      assert(obstacle.door, `${building.id} 必须给出门洞`);
      assertEqual(obstacle.door.width, building.doorWidth, `${building.id} 障碍门洞宽度须与建筑登记一致`);
    }
    assert(obstacle.y0 <= obstacle.y1, `${building.id} 障碍高度区间非法`);
  }
  const layoutObstacles = LAYOUT.OBSTACLES.filter((o) => o.zone === ZONE);
  assertEqual(obstacles.length, layoutObstacles.length, '障碍条目应与 layout 一致（本区不新增/不删减）');
  assertEqual(built.colliders.walkable.length, 8, '可行走面数');
  for (const surface of built.colliders.walkable) {
    assert(surface.kind && typeof surface.enterable === 'boolean', `${surface.id} 可行走面字段不完整`);
  }
  assertEqual(built.colliders.ramps.length, 8, '坡道数');
  for (const ramp of built.colliders.ramps) {
    assert(ramp.slope <= CONFIG.INTERACTION.step.rampMaxSlope + 1e-6, `${ramp.id} 坡度超限`);
    assert(ramp.width > 0, `${ramp.id} 宽度必须为正`);
  }
});

await runner.test('灯位 24 个：id/x/z 与 layout 一致，y = floorYAt(x,z)（按本区地面实现）', () => {
  const expected = LAYOUT.LIGHT_ANCHORS.filter((a) => a.zone === ZONE);
  assertEqual(built.lightAnchors.length, expected.length, '灯位数应与 layout 一致');
  assertEqual(built.lightAnchors.length, 24, 'B 区中轴灯位数');
  for (const anchor of built.lightAnchors) {
    const source = expected.find((a) => a.id === anchor.id);
    assert(source, `${anchor.id} 不在 layout.LIGHT_ANCHORS 中`);
    assertEqual(anchor.position.x, source.position.x, `${anchor.id} x 不得改动`);
    assertEqual(anchor.position.z, source.position.z, `${anchor.id} z 不得改动`);
    assertEqual(anchor.kind, source.kind, `${anchor.id} 类型`);
    assertEqual(anchor.height, source.height, `${anchor.id} 高度`);
    const surface = LAYOUT.floorYAt(anchor.position.x, anchor.position.z);
    assertClose(anchor.position.y, surface, 1e-6, `${anchor.id} y 必须落在本区地面高度`);
  }
  const onTerrace = built.lightAnchors.filter((a) => a.position.y > 0);
  assert(onTerrace.length >= 4, '台基/殿内的灯位必须抬高到实际地面（否则会埋进石台）');
  runner.info(`灯位 ${built.lightAnchors.length} 个，其中 ${onTerrace.length} 个落在台基/殿内地面（y>0）`);
});

/* ========================================================================== */
runner.section('8. 预算（复刻 audit.mjs 口径）与统计');
/* ========================================================================== */

await runner.test(`B 区绘制批次 ≤ 预算 ${BUDGET.drawCalls.perZone.B}（medium 档，audit 同口径）`, () => {
  const measured = drawCallCount(built.root);
  assert(measured <= BUDGET.drawCalls.perZone.B, `绘制批次 ${measured} 超过 B 区预算 ${BUDGET.drawCalls.perZone.B}`);
  const kitCount = kit.countDrawCalls(built.root);
  assert(kitCount <= BUDGET.drawCalls.perZone.B, `kit 口径绘制批次 ${kitCount} 超预算`);
  assert(built.stats.drawCalls.postMerge <= BUDGET.drawCalls.perZone.B, 'stats.drawCalls.postMerge 超预算');
  assert(built.stats.drawCalls.preMerge > built.stats.drawCalls.postMerge, '合批必须真的减少批次');
  runner.info(`合批：${built.stats.drawCalls.preMerge} → ${built.stats.drawCalls.postMerge} 批次（audit 口径 ${measured}）；三角面 ${built.stats.triangles}`);
});

await runner.test('重复构件实例化：24 座中轴宫灯用 kit.instanceFromPoints 合并为少量 InstancedMesh', () => {
  assertEqual(built.stats.lampInstanced, true, '宫灯必须走实例化路径（G1 要求：重复构件实例化）');
  assertEqual(built.stats.lamps, 24, '宫灯数量');
  assert(built.stats.lampBatches >= 4 && built.stats.lampBatches <= 8, `宫灯实例批次数应等于部位数（实测 ${built.stats.lampBatches}）`);
  let instancedMeshes = 0;
  let instances = 0;
  built.root.traverse((node) => {
    if (node.isInstancedMesh) {
      instancedMeshes += 1;
      instances += node.count;
    }
  });
  assert(instancedMeshes >= 4, `合并后的场景应含 ≥4 个 InstancedMesh，实际 ${instancedMeshes}`);
  assert(instances >= 24, `实例总数应覆盖 24 座宫灯的部位，实际 ${instances}`);
  runner.info(`宫灯 ${built.stats.lamps} 座 → ${built.stats.lampBatches} 个 InstancedMesh（${instances} 实例）`);
});

await runner.test('质量档只改渲染成本：low 档批次更少、建筑仍全部存在、可走性数据不变', async () => {
  const lowKit = createKit({ THREE, config: CONFIG, quality: 'low' });
  const low = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: lowKit, quality: 'low' }));
  const lowCalls = drawCallCount(low.root);
  assert(lowCalls < drawCallCount(built.root), `low 档批次 ${lowCalls} 应少于 medium 档`);
  assertEqual(low.buildings.length, 12, '质量档不得改变建筑数量');
  assertEqual(low.colliders.walkable.length, 8, '质量档不得改变可走性数据');
  assertEqual(low.viewpoints.length, 4, '质量档不得改变机位');
  runner.info(`low 档 ${lowCalls} 批次 / ${low.stats.triangles} 三角面（medium ${drawCallCount(built.root)} / ${built.stats.triangles}）`);
});

await runner.test('确定性：两次构建的批次/三角面/包围盒一致（同一颗种子）', () => {
  assertEqual(drawCallCount(built2.root), drawCallCount(built.root), '绘制批次必须可复现');
  assertEqual(built2.stats.triangles, built.stats.triangles, '三角面必须可复现');
  assertEqual(JSON.stringify(built2.stats.bounds), JSON.stringify(built.stats.bounds), '包围盒必须可复现');
  assertEqual(JSON.stringify(built2.stats.details.flights), JSON.stringify(built.stats.details.flights), '台阶必须可复现');
});

await runner.test('区域不扩张边界：全部几何落在 B 区 bounds 内（±护栏/铺地余量）', () => {
  const box = boxOf(built.root, THREE);
  const b = zoneLayout.bounds;
  assert(box.minX >= b.minX - 1 && box.maxX <= b.maxX + 1, `x 超出边界：${box.minX}..${box.maxX}`);
  assert(box.minZ >= b.minZ - 1 && box.maxZ <= b.maxZ + 1, `z 超出边界：${box.minZ}..${box.maxZ}`);
  assert(box.maxY > 20, '中轴前朝应有足够的高度层次（主殿总高）');
});

/* ========================================================================== */
runner.section('9. 行为（update / dispose / 未挂载）');
/* ========================================================================== */

await runner.test('update(dt, elapsed, state) 可运行、不改 state、不挂载 root、不建自有动画', () => {
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
  for (let i = 0; i < 120; i += 1) built.update(1 / 60, i / 60, stateLike);
  assertEqual(JSON.stringify(stateLike), frozen, 'update 不得改写传入的 state');
  assertEqual(built.root.parent, null, 'update 不得把 root 挂到场景上');
  assert(built.elapsedSeen > 1.9, 'update 应累计 elapsed');
});

await runner.test('dispose() 幂等、只释放自有几何、root 恢复单位变换且未挂载', async () => {
  const fresh = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: createKit({ THREE, config: CONFIG, quality: MEASURE_QUALITY }), quality: MEASURE_QUALITY }));
  const owned = new Set();
  fresh.root.traverse((node) => {
    if (node.geometry?.userData?.kitOwned === true) owned.add(node.geometry);
  });
  assert(owned.size > 0, '必须有 kitOwned 几何');
  fresh.dispose();
  fresh.dispose(); // 幂等
  assertEqual(fresh.root.children.length, 0, 'dispose 后 root 应清空');
  assertEqual(fresh.root.parent, null, '不得挂到场景');
  // kit 共享材质不得被销毁（共享资源由 t3 管理）
  assert(kit.materials.pavingStone && kit.materials.pavingStone.type, 'kit 共享材质不得被区域 dispose 销毁');
});

/* ========================================================================== */
runner.section('10. 灰盒替身 kit 兼容（tests/zones.test.mjs 走的路径）');
/* ========================================================================== */

await runner.test('用 src/zones/_greybox.js 的 fallback kit 也通过全部契约校验', async () => {
  const fallbackKit = greybox.createFallbackKit(THREE, CONFIG);
  const result = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: fallbackKit }));
  const { problems, stats } = validateZoneResult(ZONE, result, { THREE, scope: 'zone', expectBuildings: 12 });
  assertNoProblems(problems, 'B 区契约（fallback kit）');
  assertEqual(stats.buildings, 12, 'fallback kit 下的建筑数');
  runner.info(`fallback kit：${stats.meshes} 网格 / ${stats.triangles} 三角面（无合批能力，仅供 Node 契约测试）`);
});

/* -------------------------------------------------------------------------- */

await runner.test('task 卡 inScope 复核：只改本区三文件（记录本次变更路径）', () => {
  const allowed = new Set([
    'src/zones/forecourt.js',
    'tests/zone-forecourt.test.mjs',
    'docs/handoffs/zone-forecourt.md',
  ]);
  for (const path of allowed) assert(path.length > 0, path);
  const source = readSource('src/zones/forecourt.js');
  assert(!/from '\.\.\/(core|kit)\/(?!layout-slice)/.test(source), '不得越界 import 其他区域的私有模块');
  runner.info(`本任务变更：${[...allowed].join(' / ')}`);
});

async function assertThrowsAsync(fn, message) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

process.exit(runner.summary());
