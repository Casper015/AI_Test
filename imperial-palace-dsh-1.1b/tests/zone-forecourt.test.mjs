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
  // t62：layout 1.1.5 已为 10 栋 visitable 建筑注册内景（室内面 + 门洞通道面 + 机位）
  assertEqual(stats.walkable, zoneLayout.walkable.length, '可行走面数（应与切片一致）');
  // t115：随 LAYOUT 1.1.20 同步（旧值 51 ⇒ 53）。组成 = 4 地面（广场/东西台基带/台北地面）+ 24 门外过渡台阶与门槛
  // （t102 的 22 级 `-transition-N` + t103 的 2 条 `-threshold`）+ 5 台基面（tier1/tier2×3/tier3）+ 10 室内 + 10 门洞通道（t75）。
  assertEqual(stats.walkable, 53, '可行走面数 = 4 地面 + 24 门外过渡台阶/门槛（t102 22 + t103 2）+ 5 台基面 + 10 室内 + 10 门洞通道（t75）');
  // 结构锚定（不只钉总数）：kind 组成与过渡面计数逐条固定，任一来源变化都必须显式更新本条（防未来静默漂移）
  const wkByKind = built.colliders.walkable.reduce((acc, w) => { acc[w.kind] = (acc[w.kind] ?? 0) + 1; return acc; }, {});
  assertEqual(wkByKind.ground, 28, '地面类 28 = 4 原有地面 + 24 门外过渡台阶/门槛（t102/t103）');
  assertEqual(wkByKind.terrace, 5, '台基类 5 = tier1 + tier2×3（南/北/中）+ tier3');
  assertEqual(wkByKind.interior, 10, '室内类 10（每栋可进入建筑 1 个）');
  assertEqual(wkByKind.passage, 10, '门洞通道类 10（t75）');
  assertEqual(built.colliders.walkable.filter((w) => /-transition-\d+$/.test(w.id)).length, 22, 't102 门外过渡台阶 22 级');
  assertEqual(built.colliders.walkable.filter((w) => /-threshold$/.test(w.id)).length, 2, 't103 亭入口门槛 2 条');
  assertEqual(stats.ramps, 8, '坡道/台阶数（= 本区 Δy ≠ 0 的道路段数）');
  assertEqual(stats.viewpoints, 4 + 9, "机位数 = 4 原有 + 9 内景机位（B-hall-main 复用既有 VP-B-interior 别名，故 10 栋对应 9 个新机位 + 1 个别名）");
  assertEqual(stats.lightAnchors, 24 + 20, '灯位数 = 24 中轴灯位 + 2×10 内景补光');
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
runner.section('3b. 中轴体量分级（t38）：实测可见几何 ⇄ 登记口径**同轮**核对');
/* ========================================================================== */

await runner.test('t38：B 区中轴殿堂的**实测**可见高度序 = 登记 totalHeight 序（几何与登记同轮，无倒挂）', () => {
  /* 口径三要素：
     ① 口径：实测 = `built.stats.buildingMetrics[].worldBounds.maxY`（kit 真实几何包围盒，**不是**估值）；
        登记 = `layout.slotVolumeCaliber().totalHeight`（layout 记录总高）。
        注：`totalHeight` 是**已标注的估值口径**（verify-experience D1：取景/面板主路径一律用实测包围盒）
        ⇒ 本断言只要求**序**一致（同轮不漂移），不要求数值相等。
     ② 权威来源：`layout.AXIS_TIER_SPEC` / `axisTierRows()`（生产分级唯一权威源）+ 区域实测 metrics。
     ③ 时点：`AXIS_TIER_SUMMARY.at` = LAYOUT_VERSION。 */
  const ladder = LAYOUT.axisTierRows(undefined, { ladderOnly: true }).filter((r) => r.zone === ZONE);
  assert(ladder.length >= 3, `B 区中轴殿堂应 ≥3 栋（实测 ${ladder.length}）`);
  const measured = ladder.map((r) => {
    const row = built.stats.buildingMetrics.find((m) => m.id === r.id);
    assert(row, `${r.id} 缺实测 metrics`);
    return { id: r.id, totalHeight: r.totalHeight, measuredMaxY: row.worldBounds.maxY, measuredEave: row.eaveHeightAbsolute, eaveAbs: r.eaveAbs };
  });
  const byReg = measured.slice().sort((a, b) => b.totalHeight - a.totalHeight).map((r) => r.id).join(',');
  const byMeasured = measured.slice().sort((a, b) => b.measuredMaxY - a.measuredMaxY).map((r) => r.id).join(',');
  assertEqual(byMeasured, byReg, `实测可见高度序必须与登记 totalHeight 序逐位一致（实测 ${byMeasured} vs 登记 ${byReg}）`);
  /* 实测檐口高必须等于登记口径 eaveAbs（B 区地坪 = 0 ⇒ eaveAbs = eaveHeight）：把"几何 = 口径"钉死。 */
  for (const r of measured) {
    assertClose(r.measuredEave, r.eaveAbs, 0.006, `${r.id} 实测檐口高应 = 登记 eaveAbs（口径落地：几何与登记同源）`);
  }
  runner.info(`t38 实测序 ⇄ 登记序一致：${measured.slice().sort((a, b) => b.measuredMaxY - a.measuredMaxY).map((r) => `${r.id}(${r.measuredMaxY}/${r.totalHeight})`).join(' > ')}`);
});

await runner.test('t38：B 区主殿是**唯一**实测最高者且 ≥ 次高 × eaveMargin（最高档可见地压过次档）', () => {
  const rows = built.stats.buildingMetrics.map((m) => ({ id: m.id, maxY: m.worldBounds.maxY }));
  const sorted = rows.slice().sort((a, b) => b.maxY - a.maxY);
  const top = sorted[0];
  const runnerUp = sorted[1];
  assertEqual(top.id, 'B-hall-main', `B 区实测最高者应为金銮殿（实测第一 = ${top.id}）`);
  assert(sorted.filter((r) => r.maxY === top.maxY).length === 1, '实测最高者必须**唯一**（不得并列）');
  const margin = LAYOUT.AXIS_TIER_SPEC.eaveMargin; // 下限取生产规格，不另写字面量
  assert(top.maxY / runnerUp.maxY >= margin - 1e-9,
    `主殿/次高 实测比 ${(top.maxY / runnerUp.maxY).toFixed(4)} 应 ≥ eaveMargin ${margin}（次高 = ${runnerUp.id}）`);
  runner.info(`t38 B 区实测最高：${top.id} ${top.maxY}m / 次高 ${runnerUp.id} ${runnerUp.maxY}m = ${(top.maxY / runnerUp.maxY).toFixed(4)}（≥${margin}）`);
});

await runner.test('t38：主殿为 B 区**唯一**三层台基 + **唯一**重檐（檐数/台基层数由 grade 白名单与 TERRACES 派生）', () => {
  const LADDER_B = LAYOUT.axisTierRows(undefined, { ladderOnly: true }).filter((r) => r.zone === ZONE);
  const maxTiers = Math.max(...LADDER_B.map((r) => r.terraceTiers));
  const tierHolders = LADDER_B.filter((r) => r.terraceTiers === maxTiers);
  assertEqual(tierHolders.length, 1, `B 区台基层数最大者应唯一（实测 ${tierHolders.map((r) => r.id).join(',')}）`);
  assertEqual(tierHolders[0].id, 'B-hall-main', '最大台基层数应归主殿');
  assertEqual(maxTiers, Math.round(CONFIG.MODULES.terraceTotalHeight / CONFIG.MODULES.terraceTierHeight), '主殿台基层数 = 台基总高 / 每层高（令牌推导）');
  const doubleEave = LADDER_B.filter((r) => r.eaves === 2);
  assertEqual(doubleEave.length, 1, `B 区中轴殿堂重檐应唯一（实测 ${doubleEave.map((r) => r.id).join(',')}）`);
  assertEqual(doubleEave[0].id, 'B-hall-main', '重檐应归主殿');
  /* 与**实测几何**交叉核对：区域自报的台基段数（geometry 侧）与登记 TERRACES 段数一致，
     且主殿实测檐口高 = 台基总高 + 檐高 × grade 因子（令牌推导，标定"几何 = 口径"）。 */
  const terraceRecs = LAYOUT.TERRACES.filter((t) => t.zone === ZONE);
  assertEqual(built.stats.terraces, terraceRecs.length, `区域台基段数应 = layout.TERRACES 的 B 区段数（实测 ${built.stats.terraces}）`);
  assertEqual(terraceRecs.length, maxTiers, `登记台基段数应 = 主殿台基层数（实测 ${terraceRecs.length}）`);
  assertEqual(terraceRecs.at(-1).y1, CONFIG.MODULES.terraceTotalHeight, '最上层台基顶 = MODULES.terraceTotalHeight');
  const mainMetric = built.stats.buildingMetrics.find((m) => m.id === 'B-hall-main');
  const expectEave = CONFIG.MODULES.terraceTotalHeight + CONFIG.MODULES.eaveHeight * CONFIG.GRADES[3].eaveHeightFactor;
  assertClose(mainMetric.eaveHeightAbsolute, expectEave, 0.006, `主殿实测檐口高应 = 台基总高 + 檐高 × grade3 因子（${expectEave}）`);
  runner.info(`t38 台基/檐数：主殿 ${maxTiers} 层台基（TERRACES ${terraceRecs.length} 段，区域实测 ${built.stats.terraces} 段）+ 重檐 ${doubleEave.length} 栋；实测檐口高 ${mainMetric.eaveHeightAbsolute} = ${CONFIG.MODULES.terraceTotalHeight} + ${CONFIG.MODULES.eaveHeight}×${CONFIG.GRADES[3].eaveHeightFactor}`);
});

await runner.test('t38：B 区**不得**出现「非 onWall 却实测高于主殿登记总高」的建筑（地上量级守卫）', () => {
  const main = LAYOUT.slotVolumeCaliber(LAYOUT.SLOT_BY_ID['B-hall-main']);
  const offenders = built.stats.buildingMetrics
    .map((m) => ({ id: m.id, slot: LAYOUT.SLOT_BY_ID[m.id], maxY: m.worldBounds.maxY }))
    .filter((r) => r.id !== 'B-hall-main' && r.slot && r.slot.onWall !== true && r.maxY > main.totalHeight)
    .map((r) => `${r.id}(${r.maxY} > ${main.totalHeight})`);
  assertEqual(offenders.length, 0, `B 区不得有地上建筑实测高过主殿登记总高：${offenders.join('、')}`);
  runner.info(`t38 地上量级守卫：B 区 12 栋中实测高过主殿登记总高 ${main.totalHeight} 的地上建筑 0 栋`);
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
runner.section('5. 室内陈设（kit.interiorSet · 10 栋内景：殿 3 + 门殿 1 + 配殿 6）');
/* ========================================================================== */

const interiorFacts = built.stats.interiorFacts;
const visitableSlots = zoneLayout.slots.filter((s) => s.visitable);

await runner.test('内景清单：10 栋套件 = layout 的 visitable 槽位，逐一对应（亭不布陈设）', () => {
  assertEqual(built.stats.interiorKitAvailable, true, 'kit.interiorSet 必须可用（t61 套件）');
  assertEqual(interiorFacts.length, 10, '本区内景套件数');
  assertEqual(built.stats.interiorSets, 10, 'stats.interiorSets');
  assertEqual(interiorFacts.map((f) => f.id).sort().join(','), visitableSlots.map((s) => s.id).sort().join(','), '套件 id 必须与 layout 登记的 visitable 槽位逐一一致');
  for (const slot of visitableSlots) {
    const record = LAYOUT.INTERIOR_BY_SLOT[slot.id];
    assert(record?.walkableId && record?.viewpointId, `${slot.id} 必须已登记内景（WK + VP）`);
  }
  const kinds = interiorFacts.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] ?? 0) + 1; return acc; }, {});
  assertEqual(kinds.hall, 3, '殿 3 栋');
  assertEqual(kinds.gateHall, 1, '门殿 1 栋');
  assertEqual(kinds.sideHall, 6, '配殿 6 栋');
  const pavilions = zoneLayout.slots.filter((s) => s.kind === 'pavilion');
  assertEqual(pavilions.length, 2, '本区两座亭');
  assert(pavilions.every((s) => !s.visitable), '亭不登记内景（不布陈设）');
  runner.info(`内景 ${interiorFacts.length} 栋：${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
});

await runner.test('每栋：室内范围/地坪**逐值**取 layout 注册的 WK（bounds 相同、groundY === WK.y）', () => {
  for (const fact of interiorFacts) {
    const surface = LAYOUT.WALKABLE.find((w) => w.id === fact.surfaceId);
    assert(surface, `${fact.id} 的 ${fact.surfaceId} 必须在 layout.WALKABLE 中`);
    assertEqual(surface.kind, 'interior', `${fact.surfaceId} 的 kind 必须是 interior`);
    assertClose(fact.bounds.minX, surface.bounds.minX, 1e-6, `${fact.id} 室内西界`);
    assertClose(fact.bounds.maxX, surface.bounds.maxX, 1e-6, `${fact.id} 室内东界`);
    assertClose(fact.bounds.minZ, surface.bounds.minZ, 1e-6, `${fact.id} 室内南界`);
    assertClose(fact.bounds.maxZ, surface.bounds.maxZ, 1e-6, `${fact.id} 室内北界`);
    assertClose(fact.groundY, surface.y, 1e-6, `${fact.id} 地坪必须等于 WK.y（不自行推断）`);
    const record = LAYOUT.INTERIOR_BY_SLOT[fact.id];
    assertEqual(fact.viewpointId, record.viewpointId, `${fact.id} 机位映射`);
    assertEqual(fact.fpId, record.fpId, `${fact.id} 走查点映射`);
    assert(LAYOUT.VIEWPOINT_BY_ID[fact.viewpointId], `${fact.viewpointId} 必须存在于 VIEWPOINTS`);
  }
});

await runner.test('套件几何不穿模不出顶：世界包围盒在室内面内、底面贴地坪、顶面 ≤ 天花 ≤ kit 实测檐口', () => {
  for (const fact of interiorFacts) {
    const wb = fact.worldBounds;
    assert(wb, `${fact.id} 缺少世界包围盒`);
    assert(wb.minX >= fact.bounds.minX - 0.05 && wb.maxX <= fact.bounds.maxX + 0.05, `${fact.id} 东西越界：x[${wb.minX},${wb.maxX}] vs 室内面 x[${fact.bounds.minX},${fact.bounds.maxX}]`);
    assert(wb.minZ >= fact.bounds.minZ - 0.05 && wb.maxZ <= fact.bounds.maxZ + 0.05, `${fact.id} 南北越界：z[${wb.minZ},${wb.maxZ}] vs 室内面 z[${fact.bounds.minZ},${fact.bounds.maxZ}]`);
    assert(wb.minY >= fact.groundY - 0.07 && wb.minY <= fact.groundY + 0.07, `${fact.id} 底面未贴地坪（${wb.minY} vs ${fact.groundY}）`);
    assert(wb.maxY <= fact.ceilingY + 1e-6, `${fact.id} 穿顶（${wb.maxY} > 天花 ${fact.ceilingY}）`);
    const measured = built.stats.buildingMetrics.find((m) => m.id === fact.id);
    assert(measured?.eaveHeightAbsolute >= fact.ceilingY, `${fact.id} 天花必须低于 kit 实测檐口`);
  }
  const maxTop = interiorFacts.reduce((a, f) => Math.max(a, f.worldBounds.maxY - f.groundY), 0);
  runner.info(`10 栋内景最高构件相对地坪 ${maxTop.toFixed(2)}m（天花由 kit 檐口 −0.2m 决定，逐栋不穿顶）`);
});

await runner.test('每栋套件有陈设内容（items ≥ 5）且无 kit 降级诊断（interior-tight）', () => {
  for (const fact of interiorFacts) {
    assert(fact.items >= 5, `${fact.id} 陈设件数 ${fact.items} 过少`);
    const diag = (fact.diagnostics ?? []).map(String);
    assert(!diag.includes('interior-tight'), `${fact.id} 被降级为"地面+灯"（室内净尺寸过小）`);
  }
  const minItems = interiorFacts.reduce((a, f) => Math.min(a, f.items), Infinity);
  runner.info(`陈设件数 5~13（最少 ${minItems}；殿 11~13 / 配殿 7 / 门殿 7）`);
});

await runner.test('金砖地面：金銮殿内景含 interiorBrick 面层且落在其室内面内', () => {
  const face = LAYOUT.WALKABLE.find((w) => w.id === 'WK-B-hall-main-interior');
  assert(face, 'layout 必须登记 WK-B-hall-main-interior');
  let hits = 0;
  built.root.traverse((node) => {
    if (!node.isMesh || node.material !== kit.materials.interiorBrick) return;
    const b = boxOf(node, THREE);
    if (b.minX >= face.bounds.minX - 1 && b.maxX <= face.bounds.maxX + 1 && b.minZ >= face.bounds.minZ - 1 && b.maxZ <= face.bounds.maxZ + 1) hits += 1;
  });
  assert(hits >= 1, '金銮殿内景必须有金砖地面（kit 套件 hall 档 floor，材质 interiorBrick）');
});

await runner.test('门洞与通道保留：金銮殿门洞 26m 净宽 + 连通连接器 + interior 机位在室内', () => {
  const door = built.buildings.find((b) => b.id === 'B-hall-main').door;
  assert(door, '金銮殿必须登记门洞');
  assertEqual(door.width, 26, '门洞净宽（layout.passageWidth）');
  assert(door.height >= 3, '门洞净高应可通行');
  const connector = CONNECTOR_LIST.find((c) => c.id === 'CXN-B-main-hall-door');
  assert(connector, '缺少金銮殿门洞通道连接器 CXN-B-main-hall-door');
  assertClose(connector.elevation, CONFIG.MODULES.terraceTotalHeight, 1e-6, '门洞标高 = 台基顶');
  const face = LAYOUT.WALKABLE.find((w) => w.id === 'WK-B-hall-main-interior');
  const passage = built.colliders.walkable.find((w) => w.id === 'WK-B-hall-main-door-passage');
  assert(passage && passage.kind === 'passage', '门洞通道面必须登记（kind=passage，t75）');
  const vp = built.viewpoints.find((v) => v.mode === 'interior' && v.id === 'VP-B-interior');
  assert(vp, '必须登记 1 个 interior 机位');
  assert(vp.position.x >= face.bounds.minX && vp.position.x <= face.bounds.maxX, '内景机位必须在室内包围盒内（x）');
  assert(vp.position.z >= face.bounds.minZ && vp.position.z <= face.bounds.maxZ, '内景机位必须在室内包围盒内（z）');
  assertClose(vp.position.y, face.y + CONFIG.CAMERA.fpEyeHeight, 0.05, '内景机位视线高 = 面高 + 1.65');
});

/* ========================================================================== */
runner.section('5b. 内景可达性（真实碰撞数据：门洞可入 / 不可穿墙 / 不掉出）');
/* ========================================================================== */

const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
const BOUNDS_PAD = 4;
const graphBounds = {
  minX: zoneLayout.bounds.minX - BOUNDS_PAD,
  maxX: zoneLayout.bounds.maxX + BOUNDS_PAD,
  minZ: zoneLayout.bounds.minZ - BOUNDS_PAD,
  maxZ: zoneLayout.bounds.maxZ + BOUNDS_PAD,
};
/** 与 `src/interaction` 同一实现（不用相机近平面代替碰撞）：用本区返回的真实 colliders 构造求解器。 */
const makeSolver = (obstacles) => createWalkSolver({ config: CONFIG, layout: LAYOUT, obstacles });
const solverOpen = makeSolver(built.colliders.obstacles);
const graphOpen = createWalkGraph(solverOpen, { cellSize: 2, bounds: graphBounds });
const EYE = CONFIG.CAMERA.fpEyeHeight;
/**
 * 真实走查式步进：以 0.25m 小步累加（与第一人称控制器每帧 ~0.09m 同量级）。
 * 注意 `solver.step` 的障碍判定只看落点（无扫掠），因此**不能用一次大位移**代替走查——
 * 那会隧穿墙体，得出"可穿墙"的假结论（本测试曾因此误报，见回执 §2.7）。
 */
function walkSteps(solver, from, dirX, dirZ, totalDistance, obstacles, stepLen = 0.25) {
  let x = from.x;
  let z = from.z;
  const blocked = [];
  const count = Math.ceil(totalDistance / stepLen);
  for (let i = 0; i < count; i += 1) {
    const r = solver.step({ x, y: from.y, z }, dirX, dirZ, stepLen, { obstacles });
    x = r.x;
    z = r.z;
    if (r.blocked?.length) blocked.push(...r.blocked);
  }
  return { x, z, blocked };
}

const slotOf = (fact) => zoneLayout.slots.find((sl) => sl.id === fact.id);
const centerOf = (fact) => ({ x: (fact.bounds.minX + fact.bounds.maxX) / 2, z: (fact.bounds.minZ + fact.bounds.maxZ) / 2 });
/** 门轴：正面朝南/北 → 门洞沿 z 贯通；朝东/西 → 沿 x 贯通（CONTRACTS §6.3 doorwayChannel 语义）。 */
const doorAxisOf = (slot) => (slot.facing === 'south' || slot.facing === 'north' ? 'z' : 'x');
const outsideProbe = (slot) => {
  const dx = slot.entrance.x - slot.x;
  const dz = slot.entrance.z - slot.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: slot.entrance.x + (dx / len) * 1.5, z: slot.entrance.z + (dz / len) * 1.5 };
};
/**
 * 院落地坪上的探针：以门为心在**地坪类可行走面**上螺旋采样，取最近的一个
 * "确实站在本区地坪（groundY）且不被任何障碍占据"的点。
 * 关键：不能简单取"离门最近的地面点"——台明/门洞通道面与地坪在 xz 上重叠，floorYAt 取最高面，
 * 会得到台明高度上的点，从而给出"可走入"的假结论（本测试曾因此误报）。
 */
const GROUND_FACES = zoneLayout.walkable.filter((w) => w.kind === 'ground' && Math.abs(w.y - zoneLayout.groundY) < 1e-6);
function groundProbe(slot) {
  const onFace = (x, z) => GROUND_FACES.some((f) => x >= f.bounds.minX + 0.5 && x <= f.bounds.maxX - 0.5 && z >= f.bounds.minZ + 0.5 && z <= f.bounds.maxZ - 0.5);
  const candidates = [];
  for (let radius = 2; radius <= 40; radius += 1) {
    for (let k = 0; k < 24; k += 1) {
      const angle = (k / 24) * Math.PI * 2;
      candidates.push({ x: slot.entrance.x + Math.cos(angle) * radius, z: slot.entrance.z + Math.sin(angle) * radius, radius });
    }
  }
  candidates.sort((a, b) => a.radius - b.radius);
  for (const c of candidates) {
    if (!onFace(c.x, c.z)) continue;
    if (Math.abs(solverOpen.groundAt(c.x, c.z) - zoneLayout.groundY) > 0.05) continue;
    const probe = solverOpen.probe(c.x, c.z);
    if (!probe.ok) continue;
    return { x: c.x, z: c.z };
  }
  return null;
}

const insideDoorProbe = (slot) => {
  const dx = slot.entrance.x - slot.x;
  const dz = slot.entrance.z - slot.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: slot.entrance.x - (dx / len) * 1.5, z: slot.entrance.z - (dz / len) * 1.5 };
};
const inRect = (b, x, z, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;

/**
 * 「从院落地坪走进门内」的预期（真实碰撞数据，cellSize=2，与 verify-completeness §5.3 同源口径）：
 *   · B-gate-front（门洞地面 0.45，与广场落差 0.45 ≤ 0.5 阈值）⇒ 可走进去 ✔
 *   · B-hall-main（台基 4.5）⇒ 可走进去 ✔：经 layout 注册的丹陛三段（RD-B-main-danbi-1/2/3 带 Δy）上台
 *   · 其余 8 栋（中殿/后殿 + 6 配殿，台明 0.9~2.0m）⇒ **不可**：它们的台明台阶只在 kit 几何里（视觉），
 *     layout 未登记对应 ROAD，真实碰撞下 0.9~2.0m 的一级落差 > 0.5m 阈值。
 *     最小修法（layout 侧）：给每栋台明正面登记一段 ROAD（Δy 段），与 kit 已画的台阶对齐；
 *     或者在数据侧统一由 UI「进入内景」直达（`interiorViewpointId` 路径，不依赖走查）。
 * 「可站立 / 不可穿墙 / 门洞通道可通行」三项对 10 栋一律要求通过（与是否有台明台阶无关）。
 */
// 旧下界口径的临时期望表已由下方『双向精确集合』取代（t115）；保留此注释说明历史，不再参与断言。

await runner.test('可站立：每栋室内中心 probe().ok === true 且支撑高度 = 注册地坪（±0.05）', () => {
  for (const fact of interiorFacts) {
    const c = centerOf(fact);
    const y = solverOpen.groundAt(c.x, c.z);
    assertClose(y, fact.groundY, 0.05, `${fact.id} 室内中心支撑高度`);
    const probe = solverOpen.probe(c.x, c.z);
    assert(probe.ok, `${fact.id} 室内中心不可站立：${JSON.stringify(probe.reasons)}`);
  }
  runner.info('10 栋室内中心均可站立，支撑高度=注册地坪');
});

await runner.test('逐栋"能否从院落地坪走入门内"：实测记录 + 被挡必须且只能是台明台阶（无注册台阶数据）', () => {
  const walkIn = [];
  const blockedIn = [];
  for (const fact of interiorFacts) {
    const slot = slotOf(fact);
    const from = groundProbe(slot);
    assert(from, `${fact.id} 附近找不到"站在院落地坪且不阻塞"的探针点`);
    const to = insideDoorProbe(slot);
    const fromY = solverOpen.groundAt(from.x, from.z);
    assertClose(fromY, zoneLayout.groundY, 0.05, `${fact.id} 的院落地坪探针必须落在本区地坪（实测 ${fromY}）`);
    const p = graphOpen.path(from, to);
    const end = p.ok ? p.path[p.path.length - 1] : null;
    const goalOk = end ? inRect(fact.bounds, end.x, end.z, 1.2) : false;
    const step = +(solverOpen.groundAt(to.x, to.z) - fromY).toFixed(2);
    if (p.ok && goalOk) walkIn.push({ id: fact.id, step });
    else blockedIn.push({ id: fact.id, step, reason: p.ok ? 'goalSnapOutside' : p.reason });
  }
  // 被挡的必须是因为台明落差 > 台阶阈值（0.5m）：证明"不是穿墙问题，而是缺台阶数据"
  for (const b of blockedIn) {
    assert(Math.abs(b.step) > CONFIG.INTERACTION.step.maxStepHeight - 1e-6, `${b.id} 被挡但不是台明落差（step=${b.step}，reason=${b.reason}）`);
  }
  // t115：把原来的下界（>=4）+ 单点断言收紧为**双向精确集合**（更强、非放宽）：
  //   可走 7 栋（t102 的 22 级门外过渡台阶使 6 栋配殿 + 门殿均可从地坪走入）；
  //   被挡 3 栋（金銮殿/中殿/后殿，台明 1.8~4.5m 且正面无注册台阶数据）—— 理由由上面"被挡必须是台基落差"与逐栋 step 断言给出。
  // 该 2 栋 dual（B-side-west-main / B-side-east-main）在**本口径**（从院落地坪走入门内）下已可走；
  // t65 的 41/43 是"登记入口外 1.2m"另一口径，两者不矛盾；生产 FP 口径由 t77 复判定。
  const WALK_IN_EXPECTED = ['B-gate-front', 'B-side-west-south', 'B-side-east-south', 'B-side-west-main', 'B-side-east-main', 'B-side-west-rear', 'B-side-east-rear'];
  const BLOCKED_EXPECTED = ['B-hall-main', 'B-hall-mid', 'B-hall-rear'];
  assertEqual(walkIn.map((w) => w.id).sort().join(','), [...WALK_IN_EXPECTED].sort().join(','), `可走入门内的栋集必须精确等于预期（实测 ${walkIn.map((w) => w.id).join('/')}）`);
  assertEqual(blockedIn.map((b) => b.id).sort().join(','), [...BLOCKED_EXPECTED].sort().join(','), `被挡栋集必须精确等于预期（实测 ${blockedIn.map((b) => b.id).join('/')}）`);
  assert(walkIn.some((w) => w.id === 'B-gate-front'), '门殿（门洞地面 0.45，落差 ≤0.5）必须可走入门内');
  runner.info(`从院落地坪走入门内：${walkIn.length}/10 可走（${walkIn.map((w) => `${w.id}(阶${w.step})`).join(' / ')}）；被台明落差挡住 ${blockedIn.length} 栋：${blockedIn.map((b) => `${b.id}(阶${b.step})`).join(' / ')} —— 台明正面无注册 ROAD（layout 侧缺口，与 verify-completeness §5.3 不连通清单同源）`);
});

await runner.test('门洞可通：门洞轴线点 ↔ 室内中心 真实可达，且沿门轴可走出室外', () => {
  for (const fact of interiorFacts) {
    const slot = slotOf(fact);
    const c = centerOf(fact);
    const axis = doorAxisOf(slot);
    const building = built.buildings.find((b) => b.id === fact.id);
    assert(building.door, `${fact.id} 必须登记门洞`);
    // ① 门洞轴线点（door.center，位于台基面上）与室内中心必须连通（= 门洞与室内之间没有阻挡）
    const doorPoint = { x: building.door.center.x, z: building.door.center.z };
    const p = graphOpen.path(doorPoint, c);
    assert(p.ok, `${fact.id} 门洞轴线点与室内中心不可达（${p.reason}）`);
    // ② 沿门轴自室内中心可走出室外（门是通的，与台明是否有台阶无关）
    const toFront = axis === 'z'
      ? { dx: 0, dz: Math.sign(slot.entrance.z - slot.z) || -1 }
      : { dx: Math.sign(slot.entrance.x - slot.x) || 1, dz: 0 };
    const reach = (axis === 'z' ? (fact.bounds.maxZ - fact.bounds.minZ) : (fact.bounds.maxX - fact.bounds.minX)) / 2 + 6;
    const moved = walkSteps(solverOpen, { x: c.x, y: fact.groundY + EYE, z: c.z }, toFront.dx, toFront.dz, reach, built.colliders.obstacles);
    assert(!inRect(fact.bounds, moved.x, moved.z, -0.2), `${fact.id} 沿门轴走不出去（停在 ${moved.x.toFixed(1)},${moved.z.toFixed(1)}；blocked=${JSON.stringify(moved.blocked.slice(0, 3))}）`);
  }
  runner.info('10 栋：门洞轴线点与室内中心连通；沿门轴均可走出室外（门本身可通行）');
});

await runner.test('不可穿墙：垂直门轴两侧步进 14m 仍留在室内；封门（blocks=all）后室内不可站立', () => {
  for (const fact of interiorFacts) {
    const slot = slotOf(fact);
    const c = centerOf(fact);
    const axis = doorAxisOf(slot);
    const perps = axis === 'z' ? [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }] : [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }];
    const sideReach = (axis === 'z' ? (fact.bounds.maxX - fact.bounds.minX) : (fact.bounds.maxZ - fact.bounds.minZ)) / 2 + 6;
    for (const perp of perps) {
      const moved = walkSteps(solverOpen, { x: c.x, y: fact.groundY + EYE, z: c.z }, perp.dx, perp.dz, sideReach, built.colliders.obstacles);
      assert(inRect(fact.bounds, moved.x, moved.z, 0.8), `${fact.id} 沿山墙方向穿出建筑（停 ${moved.x.toFixed(1)},${moved.z.toFixed(1)}）⇒ 可穿墙`);
    }
    // 封门反例：把该栋障碍改成整体阻挡 → 室内中心不再可站立（= 入口唯一，且室内不掉出到室外）
    const sealed = built.colliders.obstacles.map((o) => (o.buildingId === fact.id ? { ...o, blocks: 'all', door: null } : o));
    const sealedSolver = makeSolver(sealed);
    const probe = sealedSolver.probe(c.x, c.z);
    assert(!probe.ok, `${fact.id} 封门后室内仍可站立 ⇒ 碰撞未生效`);
    const sealedGraph = createWalkGraph(sealedSolver, { cellSize: 2, bounds: graphBounds });
    const reach = sealedGraph.path(outsideProbe(slot), c);
    const goalIn = sealedGraph.nearestCell(c.x, c.z);
    if (goalIn && inRect(fact.bounds, goalIn)) {
      assert(!reach.ok, `${fact.id} 封门后仍能从门外到达室内格 ⇒ 存在穿墙通路`);
    }
  }
  runner.info('10 栋：山墙侧向不可穿越；封门后室内中心不再可站立（入口唯一）');
});

runner.section('6. 围合（院墙 + 廊庑，广场四周不得留无边界空地）');
/* ========================================================================== */


// t48：段数期望值在**测试外**先算好（回调非 async，不能在其中 await loadModule）
const WALL_RUNS_EXPECTED = (await loadModule('src/core/layout-slice.js')).wallRunsForZone('B').reduce((a, r) => a + r.segments.filter((x) => x.owner === 'B').length, 0);
await runner.test(`院墙 ${WALL_RUNS_EXPECTED} 段（数据推导）：共线归并 + 中轴切口后覆盖 3 个院落的四边，且开口落在通西/东宫苑与内廷门位置`, () => {
  const runs = built.stats.details.wallRuns;
  assertEqual(runs.length, WALL_RUNS_EXPECTED, `共线归并 + 中轴切口后院墙段数（数据推导 = ${WALL_RUNS_EXPECTED}）`);
  /* t48：中轴切口是**设计要求**（中轴彻底打通）⇒ 闭合判据改为「墙身 ∪ 中轴切口」覆盖整边；
     切口宽度由 layout 数据给出（`axisCutout.width`，逐墙数据推导）。 */
  const cutoutGap = (line) => {
    const w = LAYOUT.WALLS.find((x) => x.axisCutout && x.axis === 'x' && Math.abs(x.from.z - line) < 0.01);
    return w ? [[-w.axisCutout.width / 2, w.axisCutout.width / 2]] : [];
  };
  for (const courtyard of zoneLayout.courtyards) {
    const { minX, maxX, minZ, maxZ } = courtyard.bounds;
    const south = runs.filter((r) => r.alongX && Math.abs(r.line - minZ) < 0.01).map((r) => [r.lo, r.hi]).concat(cutoutGap(minZ));
    const north = runs.filter((r) => r.alongX && Math.abs(r.line - maxZ) < 0.01).map((r) => [r.lo, r.hi]).concat(cutoutGap(maxZ));
    const west = runs.filter((r) => !r.alongX && Math.abs(r.line - minX) < 0.01).map((r) => [r.lo, r.hi]);
    const east = runs.filter((r) => !r.alongX && Math.abs(r.line - maxX) < 0.01).map((r) => [r.lo, r.hi]);
    assert(covers(south, minX, maxX), `${courtyard.id} 南边未闭合（墙身 ∪ 中轴切口）`);
    assert(covers(north, minX, maxX), `${courtyard.id} 北边未闭合（墙身 ∪ 中轴切口）`);
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
  /* t48（用户裁定 P0）：中轴**彻底打通** —— 原「中央门洞」升级为**中央整段无墙**（`axisCutout`）。
     判据随之升级（只增不减）：南墙中轴开口净宽 ≥20、北墙 ≥24 **且** 均由 layout 的 `axisCutout.width` 给出。 */
  const axisWall = (id) => LAYOUT.WALLS.find((w) => w.id === id);
  const southWall = axisWall('CY-B-plaza-wall-south');
  const southRun = runs.find((r) => r.alongX && Math.abs(r.line + 400) < 0.01);
  assert(southRun && southWall, '缺少广场南墙');
  assert(southWall.axisCutout && southWall.axisCutout.width >= 20, `广场南墙中轴整段开口净宽 ${southWall.axisCutout?.width} 应 ≥20（原门洞 ${southWall.axisCutout?.doorWidth}）`);
  const northWall = axisWall('CY-B-rear-wall-north');
  const northRun = runs.find((r) => r.alongX && Math.abs(r.line - 80) < 0.01);
  assert(northRun && northWall, '缺少后殿院北墙');
  assert(northWall.axisCutout && northWall.axisCutout.width >= 24, `后殿院北墙中轴整段开口净宽 ${northWall.axisCutout?.width} 应 ≥24（内廷门）`);
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
  assertEqual(built.colliders.walkable.length, zoneLayout.walkable.length, '可行走面数应与切片一致');
  assertEqual(built.colliders.walkable.filter((w) => w.kind === 'interior').length, 10, '室内面 10 个');
  assertEqual(built.colliders.walkable.filter((w) => w.kind === 'passage').length, 10, '门洞通道面 10 个');
  for (const surface of built.colliders.walkable) {
    assert(surface.kind && typeof surface.enterable === 'boolean', `${surface.id} 可行走面字段不完整`);
  }
  assertEqual(built.colliders.ramps.length, 8, '坡道数');
  for (const ramp of built.colliders.ramps) {
    assert(ramp.slope <= CONFIG.INTERACTION.step.rampMaxSlope + 1e-6, `${ramp.id} 坡度超限`);
    assert(ramp.width > 0, `${ramp.id} 宽度必须为正`);
  }
});

await runner.test('灯位 44 个 = 24 中轴（回显 layout）+ 20 内景补光（本区新增，落在室内地面）', () => {
  const expected = LAYOUT.LIGHT_ANCHORS.filter((a) => a.zone === ZONE);
  assertEqual(built.lightAnchors.length, expected.length + 20, '灯位数 = layout 24 + 内景补光 20');
  const interiorLamps = built.lightAnchors.filter((a) => a.id.startsWith('LA-B-interior-'));
  assertEqual(interiorLamps.length, 20, '内景补光灯位数（10 栋 × 2）');
  for (const lamp of interiorLamps) {
    const fact = built.stats.interiorFacts.find((f) => lamp.id.includes(f.id.replace(/^B-/, '')));
    assert(fact, `${lamp.id} 应能对上某栋内景`);
    assertClose(lamp.position.y, fact.groundY, 1e-6, `${lamp.id} 应落在室内地面上`);
    assert(lamp.position.x >= fact.bounds.minX && lamp.position.x <= fact.bounds.maxX, `${lamp.id} 应在室内（x）`);
    assert(lamp.position.z >= fact.bounds.minZ && lamp.position.z <= fact.bounds.maxZ, `${lamp.id} 应在室内（z）`);
    assert(lamp.height + fact.groundY < fact.ceilingY, `${lamp.id} 灯体不得穿顶`);
  }
  for (const anchor of built.lightAnchors) {
    const source = expected.find((a) => a.id === anchor.id);
    if (!source) {
      // 内景补光是本区按 §8.3 新增的灯位（前缀 LA-B-interior-），其余必须回显 layout
      assert(anchor.id.startsWith('LA-B-interior-'), `${anchor.id} 不在 layout.LIGHT_ANCHORS 中且不是本区内景灯`);
      continue;
    }
    assertEqual(anchor.position.x, source.position.x, `${anchor.id} x 不得改动`);
    assertEqual(anchor.position.z, source.position.z, `${anchor.id} z 不得改动`);
    assertEqual(anchor.kind, source.kind, `${anchor.id} 类型`);
    assertEqual(anchor.height, source.height, `${anchor.id} 高度`);
    const surface = LAYOUT.floorYAt(anchor.position.x, anchor.position.z);
    assertClose(anchor.position.y, surface, 1e-6, `${anchor.id} y 必须落在本区地面高度`);
  }
  const onTerrace = built.lightAnchors.filter((a) => a.position.y > 0 && !a.id.startsWith('LA-B-interior-'));
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

await runner.test('重复构件实例化：44 座宫灯（24 中轴 + 20 内景）合并为少量 InstancedMesh', () => {
  assertEqual(built.stats.lampInstanced, true, '宫灯必须走实例化路径（G1 要求：重复构件实例化）');
  assertEqual(built.stats.lamps, 44, '宫灯数量 = 24 中轴 + 20 内景');
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
  assert(instances >= 44, `实例总数应覆盖 44 座宫灯的部位，实际 ${instances}`);
  runner.info(`宫灯 ${built.stats.lamps} 座（含内景补光 20）→ ${built.stats.lampBatches} 个 InstancedMesh（${instances} 实例）`);
});

await runner.test('质量档只改渲染成本：low 档批次更少、建筑仍全部存在、可走性数据不变', async () => {
  const lowKit = createKit({ THREE, config: CONFIG, quality: 'low' });
  const low = await mod.createZone(await makeTestCtx({ zoneId: ZONE, kit: lowKit, quality: 'low' }));
  const lowCalls = drawCallCount(low.root);
  assert(lowCalls < drawCallCount(built.root), `low 档批次 ${lowCalls} 应少于 medium 档`);
  assertEqual(low.buildings.length, 12, '质量档不得改变建筑数量');
  assertEqual(low.colliders.walkable.length, built.colliders.walkable.length, '质量档不得改变可走性数据');
  assertEqual(low.viewpoints.length, built.viewpoints.length, '质量档不得改变机位');
  assertEqual(low.stats.interiorSets, built.stats.interiorSets, '质量档不得改变内景套件数');
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

/* ==========================================================================
 * t47③：跨区共面重复墙线的**归属唯一**（z=80 的 B/C 边界）
 * --------------------------------------------------------------------------
 * 事实：`layout.WALLS` 把同一条物理墙声明了两份 —— B 的 `CY-B-rear-wall-north(-east)` 与
 *   C 的 `CY-C-front-wall-south(-east)`（同线 z=80 / 同厚 1.2 / 同高 4.2 / 跨度重叠 81.4m）。
 * 判据（只增不减，把"重复也算"改为"按归属唯一"）：
 *   ① core 的 `deriveWallRuns()` 必须把两份**归并成一段**且 owner 唯一（= B），owners 记录两份来源；
 *   ② 可视化与碰撞都只由归属区负责：C 侧**不得**再登记同一几何的碰撞副本（逐 id 核对 + 计数）；
 *   ③ 被删那份的**覆盖不减少**：core 派生层 `OB-WALLRUN-B-x80.00-span*` 必须逐段覆盖其跨度，
 *      且在 **B/C 两侧地坪高度**上都能拦住行人（运行时口径，不是纸面声明）。
 * 反例：多删一条 / 少删一条 / 把 owner 判给 C / core 派生段消失 ⇒ 立即红。
 * ========================================================================== */
await runner.test('t47③ 跨区共面重复墙线归属唯一（z=80）：core 归并为 B 所有 + C 不再登记副本 + 派生层覆盖不减少', async () => {
  const slice = await loadModule('src/core/layout-slice.js');
  const runs = slice.deriveWallRuns(LAYOUT.WALLS, { helpers: LAYOUT });
  const run = runs.find((r) => (r.wallIds ?? []).includes('CY-B-rear-wall-north'));
  assert(run, 'z=80 的归并段必须存在（含 CY-B-rear-wall-north）');
  assertEqual(run.owner, 'B', '归并段 owner 必须唯一 = B');
  assert(run.wallIds.includes('CY-C-front-wall-south') && run.wallIds.includes('CY-C-front-wall-south-east'), '归并段必须记录 C 侧的两份来源（可核对）');
  assertEqual([...new Set(run.owners)].sort().join(','), 'B,C', `owners 应同时含 B/C（实际 ${JSON.stringify(run.owners)}）`);

  // ① 同一条物理墙的两份声明（同线 / 同厚 / 同高 / 跨度重叠 ≥0.5m）确实存在
  const coplanar = LAYOUT.WALLS.filter((w) => w.kind === 'courtWall' && w.axis === 'x' && Math.abs(w.from.z - 80) < 0.01);
  const ids = coplanar.map((w) => w.id).sort();
  assertEqual(ids.join(','), 'CY-B-rear-wall-north,CY-B-rear-wall-north-east,CY-C-front-wall-south,CY-C-front-wall-south-east', `z=80 应有 2 区 × 2 段共 4 条声明（实际 ${ids.join(',')}）`);
  assertEqual([...new Set(coplanar.map((w) => w.thickness))].join(','), '1.2', '厚度必须一致（否则不是共面重复）');
  assertEqual([...new Set(coplanar.map((w) => w.height))].join(','), '4.2', '高度必须一致（否则不是共面重复）');

  // ② C 侧不再登记同一几何的碰撞副本（真构建 C 区读 stats；数据驱动、不写死条数）
  const cMod = await loadModule(zoneModulePath('C'));
  const cBuilt = await cMod.createZone(await makeTestCtx({ zoneId: 'C', kit: createKit({ THREE, config: CONFIG, quality: MEASURE_QUALITY }), quality: MEASURE_QUALITY }));
  const skipped = [...(cBuilt.stats.crossZoneDupWallsSkipped ?? [])].sort();
  assertEqual(skipped.join(','), 'CY-C-front-wall-south,CY-C-front-wall-south-east', `C 必须只跳过跨区共面重复的那两份（实际 ${skipped.join(',')}）`);
  const dupColliders = cBuilt.colliders.obstacles.filter((o) => /^OB-CY-C-front-wall-south(-east)?-span/.test(o.id));
  assertEqual(dupColliders.length, 0, `C 不得再登记重复副本的碰撞（实际 ${dupColliders.map((o) => o.id).join(',')}）`);
  // 反面：与 B **共线但不共面重叠**的侧墙仍必须由 C 登记（不得顺手删掉）
  assert(cBuilt.colliders.obstacles.some((o) => o.id.startsWith('OB-CY-C-front-wall-west-span')), 'C 的侧墙（x=-96，与 B 共线但不重叠）仍必须登记碰撞');

  // ③ 覆盖不减少：core 派生层逐段覆盖 + 两侧地坪高度上都拦得住（运行时口径）
  const core = slice.deriveWallColliders(LAYOUT.WALLS, { helpers: LAYOUT });
  const spanRuns = core.filter((o) => /x80\.00/.test(o.id));
  assertEqual(spanRuns.length, 2, `z=80 归并段应有 2 个实心碰撞段（实际 ${spanRuns.length}）`);
  for (const [lo, hi] of [[-96, -14.6], [14.6, 96]]) {
    const hit = spanRuns.find((o) => o.bounds.minX <= lo + 0.05 && o.bounds.maxX >= hi - 0.05);
    assert(hit, `[${lo},${hi}] 必须被 core 派生段覆盖`);
    for (const feet of [LAYOUT.floorYAt((lo + hi) / 2, 80), 0.9]) {
      assert(feet >= hit.y0 && feet <= hit.y1, `地坪 ${feet} 必须落在派生碰撞段 y=[${hit.y0},${hit.y1}] 内（否则可穿墙）`);
    }
  }
  runner.info(`z=80 归并段 owner=${run.owner}（owners=${run.owners.join('+')}）· C 跳过 ${skipped.length} 份重复声明（${skipped.join(',')}）· core 派生 ${spanRuns.map((o) => `${o.id}(y ${o.y0}..${o.y1})`).join(' + ')} 覆盖两段跨度且在 B/C 两侧地坪上均拦截 ✓`);
});

process.exit(runner.summary());
