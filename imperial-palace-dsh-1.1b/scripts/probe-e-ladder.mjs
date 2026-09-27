#!/usr/bin/env node
/**
 * `scripts/probe-e-ladder.mjs` —— **t10 只读取证**：E 侧门外阶梯（文华殿 / 陈设正堂）
 * “4 点不可达”的**逐格剖面 + canStep 原因码 + 口径三要素**，并复算 `verify-completeness 5.3`。
 *
 * 口径（写明，避免与生产/粗口径混淆）：
 *   · 障碍/可行走面来源 = **真实 5 个区域模块 + core registry**（与 `scripts/verify-completeness.mjs` 5.3 同源）；
 *   · 台阶阈值 = `config.INTERACTION.step`（上 0.5 / 下 0.6，含界 + 1e-9），**不另设判据**；
 *   · 高度读数 = `createWalkGraph` 的**图侧 `Float32Array`**（`graph.sample` 缓存后即 float32；
 *     首次取样返回 `solver.probe` 的 float64 —— 两者并列给出，这正是 §12.1.4.5 / t77-F16 的不确定性来源）；
 *   · 网格 = `cellSize:1`，起点 = `TERRAIN_EXTENT`（整数）⇒ 格心落在整数世界坐标，与整城图同对齐。
 *
 * 用法：`node scripts/probe-e-ladder.mjs`（全局：复算 5.3 + 分量归属 + 断点前沿）
 *       `node scripts/probe-e-ladder.mjs --local`（逐格剖面）
 * 本脚本**只读**：不写任何文件、不改任何交付物。
 */

import { loadModule, loadThree, buildZone, makeSilentEvents, ROOT } from '../tests/harness.mjs';

const LOCAL = process.argv.includes('--local');
const FLIP = process.argv.includes('--flip');
const TARGETS = ['E-court1-hall', 'E-court2-hall'];
const f32 = Math.fround;

const THREE = await loadThree();
const CONFIG = (await loadModule('src/shared/config.js')).CONFIG;
const LAYOUT = await loadModule('src/shared/layout.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createKit } = await loadModule('src/kit/index.js');
const kit = createKit({ THREE, config: CONFIG, quality: 'medium' });
const events = makeSilentEvents();
const registry = createRegistry({ events, layout: LAYOUT });
for (const zoneId of ['B', 'C', 'D', 'E', 'F']) {
  const built = await buildZone(zoneId, { kit, registry, events });
  if (built.skipped) throw new Error(`区域 ${zoneId} 未交付（${built.reason}）`);
  registry.registerZone(zoneId, built.result, { replace: true });
}
const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');

const STEP = CONFIG.INTERACTION.step;
const EPS = 1e-9;
const solver = createWalkSolver({ registry });
const f = (v) => (v === null || v === undefined ? String(v) : (+v).toFixed(6));

console.log('=========================================================');
console.log(` t10 只读取证：E 侧门外阶梯（${LOCAL ? '逐格剖面' : '全局连通性 + 断点前沿'}）`);
console.log(` root ${ROOT}`);
console.log(` LAYOUT ${LAYOUT.LAYOUT_VERSION} · 阈值 上 ${STEP.maxStepHeight} / 下 ${STEP.snapDownDistance}（含界 + ${EPS}）· 障碍 ${solver.stats().obstacles} 条`);
console.log('=========================================================');

const verdictOf = (a, b) => {
  const up = b.y - a.y;
  const down = a.y - b.y;
  if (up > STEP.maxStepHeight + EPS) return `stepTooHigh（上 Δ=${up.toFixed(9)} > ${STEP.maxStepHeight}）`;
  if (down > STEP.snapDownDistance + EPS) return `dropTooDeep（下 Δ=${down.toFixed(9)} > ${STEP.snapDownDistance}）`;
  return `可跨（上 Δ=${up.toFixed(9)} / 下 Δ=${down.toFixed(9)}）`;
};

/* ------------------------------------------------------------------ 登记面（唯一权威源） */
function facesOf(id) {
  const all = LAYOUT.WALKABLE.filter((w) => w.id === `WK-${id}-door-passage` || w.id === `WK-${id}-interior` || w.id.startsWith(`WK-${id}-transition-`));
  return {
    passage: all.find((w) => /-door-passage$/.test(w.id)) ?? null,
    interior: all.find((w) => /-interior$/.test(w.id)) ?? null,
    ladder: all.filter((w) => /-transition-/.test(w.id)).sort((a, b) => b.y - a.y),
  };
}
function printFaces(id) {
  const slot = LAYOUT.getSlot(id);
  const { passage, interior, ladder } = facesOf(id);
  console.log(`① ${id}「${slot.name}」facing=${slot.facing} 门轴=${slot.door?.axis} terraceH=${slot.terraceH} sillY=${slot.door?.sillY}`);
  for (const w of [passage, ...ladder, interior]) {
    if (!w) continue;
    const depth = +(Math.min(w.bounds.maxX - w.bounds.minX, w.bounds.maxZ - w.bounds.minZ)).toFixed(2);
    console.log(`   · ${w.id} y=${f(w.y)} kind=${w.kind} 短边净宽/进深=${depth} x[${w.bounds.minX},${w.bounds.maxX}] z[${w.bounds.minZ},${w.bounds.maxZ}]`);
  }
  /* 逐跳序列只取**真实相邻**的链条：通道面 → 各级 → 门外地面（`zoneGroundY`）。
     室内面与通道面同高（同一门槛面），不属于“门外阶梯”，单独列出以免误读成一级。 */
  const outdoor = LAYOUT.ZONES.find((z) => z.id === slot.zone).groundY;
  const seq = [passage?.y, ...ladder.map((w) => w.y), outdoor];
  console.log(`   ⇒ 门外高度序列（通道面 → 各级 → 门外地面 ${outdoor}）：${seq.map((v) => f(v)).join(' → ')}（室内面 ${f(interior?.y)}，与通道面同高）`);
  for (let i = 0; i + 1 < seq.length; i += 1) {
    const d64 = seq[i + 1] - seq[i];
    const d32 = f32(seq[i + 1]) - f32(seq[i]);
    console.log(`     · ${i}→${i + 1}：float64 Δ=${d64.toFixed(9)} · **float32 Δ=${d32.toFixed(9)}** ⇒ ${Math.abs(d32) > STEP.maxStepHeight + EPS ? '超阈值（图侧拒）' : `含界通过（距阈值 ${(STEP.maxStepHeight - Math.abs(d32)).toFixed(9)}）`}`);
  }
}

if (LOCAL) {
  const AREA = { minX: 120, maxX: 300, minZ: -420, maxZ: 20 };
  const graph = createWalkGraph(solver, { cellSize: 1, bounds: AREA, maxCells: 400000 });
  console.log(`局部图 ${graph.cols}×${graph.rows} @${graph.cellSize}m（x∈[${AREA.minX},${AREA.maxX}] z∈[${AREA.minZ},${AREA.maxZ}]）`);
  for (const id of TARGETS) {
    const slot = LAYOUT.getSlot(id);
    const axisX = slot.door?.axis === 'x';
    printFaces(id);
    const v0 = axisX ? Math.round(slot.bounds.minX - 12) : Math.round(slot.bounds.minZ - 12);
    const v1 = axisX ? Math.round(slot.bounds.minX + 2) : Math.round(slot.bounds.minZ + 2);
    console.log(`② 逐格剖面（${axisX ? `z=${slot.z} 固定，x` : `x=${slot.x} 固定，z`} ∈ [${v0},${v1}]）：`);
    const cells = [];
    for (let v = v0; v <= v1; v += 1) {
      const x = axisX ? v : slot.x;
      const z = axisX ? slot.z : v;
      const { col, row } = graph.toCell(x, z);
      const first = graph.sample(col, row); // 首次：float64
      const y64 = first.y;
      const cached = graph.sample(col, row); // 缓存后：float32
      const covers = LAYOUT.walkableAt(x, z).map((w) => `${w.id}@${f(w.y)}`).join(' | ') || '(无可行走面)';
      cells.push({ v, x, z, col, row, ok: cached.ok, y: cached.y });
      console.log(`   · ${axisX ? `x=${x}` : `z=${z}`} 可走=${cached.ok ? 'Y' : 'N'} 图侧y=${f(cached.y)}（首取 float64=${f(y64)}） floorYAt=${f(LAYOUT.floorYAt(x, z))} 覆盖=[${covers}]`);
    }
    console.log('③ 相邻格判定（图侧 float32 读数）：');
    for (let i = 0; i + 1 < cells.length; i += 1) {
      const a = cells[i];
      const b = cells[i + 1];
      const stepOk = graph.canStep(a.col, a.row, b.col, b.row);
      console.log(`   · ${axisX ? `x=${a.x}→${b.x}` : `z=${a.z}→${b.z}`}：${verdictOf(a, b)} ⇒ canStep=${stepOk}${a.ok && b.ok && !stepOk ? '  ← **断点**' : ''}`);
    }
    const vp = LAYOUT.VIEWPOINTS.find((p) => p.id === `VP-${id}-interior`);
    const outside = axisX ? { x: slot.bounds.minX - 25, z: slot.z } : { x: slot.x, z: slot.bounds.minZ - 25 };
    const p = graph.path(outside, { x: vp.position.x, z: vp.position.z });
    console.log(`④ 局部口径（室外邻点 → 内景机位）：${p.ok ? `✓ 可达 ${p.length}m` : `✗ 不可达（${p.reason}）`}`);
  }
} else {
  /* ------------------------------------------------------- 全局：复算 5.3 + 分量归属 + 断点前沿 */
  const graph = createWalkGraph(solver, { cellSize: 1, maxCells: 2000000 });
  const wx = (col) => graph.bounds.minX + col * graph.cellSize;
  const wz = (row) => graph.bounds.minZ + row * graph.cellSize;
  const startPoint = LAYOUT.FP_ROUTE[0].position;
  const fpPoints = LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name }));
  const spawnPoints = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
  const interiorPoints = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
  const points = [{ x: startPoint.x, z: startPoint.z, name: 'FP起点(南桥外)' }, ...spawnPoints, ...fpPoints, ...interiorPoints];
  const conn = graph.connected(points);
  console.log(`全局图 ${graph.cols}×${graph.rows} @${graph.cellSize}m · 可走 ${graph.stats().walkable} 格 · 障碍 ${solver.stats().obstacles} 条`);
  console.log(`⑤ 复算 verify-completeness 5.3（${points.length} 点 = 1 起点 + ${spawnPoints.length} fp-spawn + ${fpPoints.length} 走查点 + ${interiorPoints.length} 内景机位）：${conn.ok ? '✓ 同一连通分量' : `✗ 不连通 ${conn.unreachable.length} 点：\n     ${conn.unreachable.map((u) => `${u.point.name}(${(u.point.x ?? 0).toFixed(1)},${(u.point.z ?? 0).toFixed(1)})[${u.reason}]`).join('\n     ')}`}`);

  const start = { x: startPoint.x, z: startPoint.z };
  const startCell = graph.nearestCell(start.x, start.z);
  const startFlood = graph.flood(startCell);
  const inStart = (x, z) => {
    const c = graph.nearestCell(x, z);
    return c ? startFlood.parents[c.row * graph.cols + c.col] !== -2 : null;
  };
  for (const id of TARGETS) {
    const slot = LAYOUT.getSlot(id);
    const axisX = slot.door?.axis === 'x';
    printFaces(id);
    const vp = LAYOUT.VIEWPOINTS.find((p) => p.id === `VP-${id}-interior`);
    const line = (label, x, z) => `   · ${label} (${x},${z}) 属于起点分量=${inStart(x, z)}`;
    console.log('⑥ 关键点分量归属（起点 = 南桥外）：');
    console.log(line('院外地面', axisX ? slot.bounds.minX - 25 : slot.x, axisX ? slot.z : slot.bounds.minZ - 25));
    console.log(line('门外锚点', slot.door.facade.x, slot.door.facade.z));
    console.log(line('阶梯最高级格心', axisX ? slot.bounds.minX - 6 : slot.x, axisX ? slot.z : slot.bounds.minZ - 6));
    console.log(line('通道面外端格心', axisX ? slot.bounds.minX + 2 : slot.x, axisX ? slot.z : slot.bounds.minZ + 2));
    console.log(line('内景机位', vp.position.x, vp.position.z));

    const vpCell = graph.nearestCell(vp.position.x, vp.position.z);
    const vpFlood = graph.flood(vpCell);
    const inVp = new Set(vpFlood.queue);
    const breaks = [];
    for (const idx of vpFlood.queue) {
      const col = idx % graph.cols;
      const row = Math.floor(idx / graph.cols);
      for (const [nc, nr] of [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]]) {
        if (nc < 0 || nr < 0 || nc >= graph.cols || nr >= graph.rows) continue;
        const ni = nr * graph.cols + nc;
        if (inVp.has(ni)) continue;
        const both = graph.sample(nc, nr);
        if (!both.ok) continue;
        const here = graph.sample(col, row);
        const ok = graph.canStep(col, row, nc, nr);
        const back = graph.canStep(nc, nr, col, row);
        if (!ok || !back) {
          breaks.push(`     ${here.y.toFixed(6)}@(${wx(col)},${wz(row)}) → ${both.y.toFixed(6)}@(${wx(nc)},${wz(nr)}) 正向=${ok ? '✓可跨' : `✗ ${verdictOf(here, both)}`}｜反向=${back ? '✓可跨' : `✗ ${verdictOf(both, here)}`}｜该邻格属起点分量=${startFlood.parents[ni] !== -2}`);
        }
      }
    }
    console.log(`⑦ 内景分量（自机位 flood）：${vpFlood.visited} 格；与起点分量之间的**不可跨前沿** ${breaks.length} 处：`);
    for (const b of breaks.slice(0, 12)) console.log(b);
    if (breaks.length === 0) console.log('     （无前沿：两分量之间没有相邻可走格 ⇒ 属“缺栅格/无接续面”，不是阈值问题）');
  }

  /* ---------------------------------------------- 冷/暖翻转定位（t77-F16 现象的直接取证） */
  if (FLIP) {
    console.log('\n⑧ 冷/暖翻转定位（同一张图、同一锚点，仅调用历史不同）：');
    const cold = graph.componentOf(start.x, start.z, start); // 复用 connected() 缓存的冷 flood
    console.log(`   冷 flood（connected() 内部那次）visited=${cold.size} 格`);
    const warm = graph.flood(graph.nearestCell(start.x, start.z));
    console.log(`   暖 flood（随后单独再 flood 一次）visited=${warm.visited} 格 ⇒ 差 ${warm.visited - cold.size} 格`);
    const coldParents = graph.componentOf(start.x, start.z, start);
    void coldParents;
    const coldIn = (col, row) => graph.componentOf(wx(col), wz(row), start).ok;
    const warmIn = (col, row) => warm.parents[row * graph.cols + col] !== -2;
    const flips = [];
    for (let row = 0; row < graph.rows; row += 1) {
      for (let col = 0; col < graph.cols; col += 1) {
        if (!warmIn(col, row) || coldIn(col, row)) continue; // 只找「暖可达但冷不可达」
        for (const [nc, nr] of [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]]) {
          if (nc < 0 || nr < 0 || nc >= graph.cols || nr >= graph.rows) continue;
          if (!coldIn(nc, nr)) continue; // 邻格在冷分量内 ⇒ 这就是冷 flood 的断口
          const a = graph.sample(nc, nr);
          const b = graph.sample(col, row);
          const p64a = solver.probe(wx(nc), wz(nr), null).surfaceY;
          const p64b = solver.probe(wx(col), wz(row), null).surfaceY;
          const up32 = b.y - a.y;
          const up64 = p64b - p64a;
          flips.push(`   断口：冷分量侧 ${a.y.toFixed(6)}@(${wx(nc)},${wz(nr)})[float64 ${p64a.toFixed(9)}] → 冷不可达侧 ${b.y.toFixed(6)}@(${wx(col)},${wz(row)})[float64 ${p64b.toFixed(9)}]`
            + `｜上台阶：float32 Δ=${up32.toFixed(9)}（${up32 > STEP.maxStepHeight + EPS ? '✗超阈' : '✓含界'}）· float64 Δ=${up64.toFixed(9)}（${up64 > STEP.maxStepHeight + EPS ? '✗超阈' : '✓含界'}）`
            + `｜canStep(冷缓存态)=${graph.canStep(nc, nr, col, row)}`);
        }
      }
    }
    console.log(`   冷 flood 的断口共 ${flips.length} 处（暖可达 ∧ 冷不可达 ∧ 邻格冷可达）：`);
    for (const line of flips.slice(0, 20)) console.log(line);
    if (flips.length === 0) console.log('   （无断口 ⇒ 冷/暖差异不在“相邻可走格”上，需查起点锚点或格采样顺序）');
  }
}
