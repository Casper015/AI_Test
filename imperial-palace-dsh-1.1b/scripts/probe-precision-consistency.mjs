#!/usr/bin/env node
/**
 * t12（t77-F16）**只读取证**：图侧高度精度（`walk-graph.heights`）与 `solver.probe` 精度不一致
 * 导致"同一棵树、同一判据、仅因调用历史不同而结论不同"的不确定性。
 *
 * 口径（写明，避免与生产混淆）：
 *   · 装配 = `scripts/verify-walk.mjs` 的 `assembleCity()`（真 kit + core registry + B/C/D/E/F 五区域 registerZone）
 *     —— 与游戏、与 `tests/walk-reachability.test.mjs` **同一条生产装配路径**；
 *   · 建图 = `createWalkGraph`（生产实现，本探针**不改任何源码**、不另造替身）；
 *   · 阈值 = `config.INTERACTION.step`（上 0.5 / 下 0.6，含界 + `BOUNDARY_EPS = 1e-9`），本探针不新设判据。
 *
 * 三组读数：
 *   ① **调用历史敏感性**：同一份点集，在"全新图"与"被其它调用预热过的图"上分别求 `connected()`，
 *      比较 `ok` 与 `unreachable` 集合 ⇒ 这就是 t77-F16 的"±1~2 项不稳定"；
 *   ② **图侧精度实证**：同一格 `sample()` 首次（返回 `probe` 的 double）与缓存后（返回 `heights[i]`）的
 *      `y` 之差；以及 `heights[i]` 是否等于 `Math.fround(probe.y)`；
 *   ③ **判定面校验和**：遍历细口径全图所有相邻格对，用生产 `canStep` 取判定，滚成 FNV-1a 校验和
 *      ⇒ "跨构建逐值一致"的可比指纹。
 *
 * 用法：`node scripts/probe-precision-consistency.mjs [--json 输出路径]`
 *       `VARIANT=pre|float64|f32-unified node scripts/probe-precision-consistency.mjs`
 * 本脚本**只读**：不写交付物（`--json` 显式给出时才写证据文件）。
 */
import { writeFileSync } from 'node:fs';
import { loadModule } from '../tests/harness.mjs';
import { assembleCity } from './verify-walk.mjs';

const VARIANT = process.env.VARIANT ?? 'current';
const OUT = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();

const LAYOUT = await loadModule('src/shared/layout.js');
const CONFIG = await loadModule('src/shared/config.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');

const city = await assembleCity();
const { solver } = city;
const STEP = CONFIG.INTERACTION.step;
const OUTSIDE = { x: 0, z: -480 };

/* 点集 = `verify-completeness 5.3` 的**同源**集合（FP 起点 + fp-spawn 机位 + 走查路点 + 内景机位），
   逐字对齐该脚本的取点方式，避免"换了点集就换了结论"。 */
const START = { x: LAYOUT.FP_ROUTE[0].position.x, z: LAYOUT.FP_ROUTE[0].position.z, name: 'FP起点' };
const spawnPoints = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
const fpPoints = LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name }));
const interiorPoints = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
const POINTS = [START, ...spawnPoints, ...fpPoints, ...interiorPoints].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));

const makeFine = () => createWalkGraph(solver, { cellSize: 1, maxCells: 2_000_000 });

/* ---------- ① 调用历史敏感性 ---------- */
function armCold() {
  const g = makeFine();
  return { g, r: g.connected(POINTS) };
}
function armWarmOther() {
  const g = makeFine();
  // 先用**别处**的调用预热一批格（真实调用历史：`path()`/`nearestCell()` 会先落地若干格）
  for (let k = 0; k < 40; k += 1) g.nearestCell(-140 + k * 7, 40 + k * 11);
  g.sample(g.toCell(0, -480).col, g.toCell(0, -480).row);
  return { g, r: g.connected(POINTS) };
}
function armPathFirst() {
  const g = makeFine();
  g.path({ x: -150, z: 49.5 }, { x: -150, z: 257 });
  return { g, r: g.connected(POINTS) };
}
const arms = { cold: armCold(), warmOther: armWarmOther(), pathFirst: armPathFirst() };
const idsOf = (r) => r.unreachable.map((u) => `${u.point?.name ?? u.index}:${u.reason}`).sort().join(',');
const history = {
  cold: { ok: arms.cold.r.ok, unreachable: arms.cold.r.unreachable.length, ids: idsOf(arms.cold.r), visited: arms.cold.r.visited },
  warmOther: { ok: arms.warmOther.r.ok, unreachable: arms.warmOther.r.unreachable.length, ids: idsOf(arms.warmOther.r), visited: arms.warmOther.r.visited },
  pathFirst: { ok: arms.pathFirst.r.ok, unreachable: arms.pathFirst.r.unreachable.length, ids: idsOf(arms.pathFirst.r), visited: arms.pathFirst.r.visited },
};
const historyOkSet = new Set([idsOf(arms.cold.r), idsOf(arms.warmOther.r), idsOf(arms.pathFirst.r)]);
const historyStable = historyOkSet.size === 1;

/* ---------- ①b 冷/暖 flood 翻转（与 `probe-e-ladder.mjs --flip` 同协议） ---------- */
/** 同一张图：先由 `connected()` 触发一次"冷" flood，再单独 flood 一次 ⇒ visited 之差即"调用历史"效应。 */
function coldWarmFlip() {
  const g = makeFine();
  const cold = g.connected(POINTS);
  const warm = g.flood(g.nearestCell(POINTS[0].x, POINTS[0].z));
  return { coldVisited: cold.visited, warmVisited: warm.visited, delta: warm.visited - cold.visited };
}
/** 独立运行：每次全新图，记录 `connected()` 的分量规模与结论（≥3 次逐值一致才算确定）。 */
function independentRun() {
  const g = makeFine();
  const r = g.connected(POINTS);
  return { visited: r.visited, ok: r.ok, unreachable: r.unreachable.length };
}
const flip = coldWarmFlip();
const runs = [independentRun(), independentRun(), independentRun()];
const runStable = new Set(runs.map((r) => `${r.visited}|${r.ok}|${r.unreachable}`)).size === 1;

/* ---------- ② 图侧精度实证 ---------- */
const g2 = makeFine();
const probeCells = [];
for (let k = 0; k < 300; k += 1) {
  const c = g2.toCell(-140 + k * 3, 30 + ((k * 37) % 200));
  if (c) probeCells.push(c);
}
let maxDeltaY = 0; let froundMismatch = 0; let checked = 0; let f32RoundTripExact = 0;
const samples = [];
for (const c of probeCells) {
  const x = g2.bounds.minX + c.col * g2.cellSize;
  const z = g2.bounds.minZ + c.row * g2.cellSize;
  const fresh = g2.sample(c.col, c.row); // 首次：返回 solver.probe 的 double
  if (fresh.y === null) continue;
  const cached = g2.sample(c.col, c.row); // 缓存后：返回 heights[i]
  const delta = Math.abs(cached.y - fresh.y);
  if (delta > maxDeltaY) maxDeltaY = delta;
  checked += 1;
  if (cached.y === fresh.y) f32RoundTripExact += 1;
  const direct = solver.probe(x, z, null);
  if (Number.isFinite(direct.surfaceY)) {
    if (Math.fround(direct.surfaceY) !== cached.y) froundMismatch += 1;
    if (samples.length < 5) samples.push({ col: c.col, row: c.row, probeDouble: direct.surfaceY, firstSampleY: fresh.y, cachedY: cached.y, fround: Math.fround(direct.surfaceY) });
  }
}

/* ---------- ②b **精度决定性**相邻对：double 与 float32 给出**相反**判定的真实格对 ---------- */
/**
 * 判据（与生产 `canStep` 逐字同源）：可跨 ⟺ 上行 ≤ `maxStepHeight + eps` 且 下行 ≤ `snapDownDistance + eps`。
 * 对每一对相邻可走格分别用 **probe 的 double** 与 **`Math.fround`（= 图侧 Float32 缓存值）** 求判定；
 * 两者不同 ⇒ 该格对的结论**取决于该格是否已被缓存过**（= 调用历史）⇒ t77-F16 的"±1~2 项不稳定"。
 */
function precisionDecisivePairs() {
  const g = makeFine();
  const n = g.cols * g.rows;
  const y64 = new Float64Array(n);
  const y32 = new Float32Array(n);
  const walk = new Uint8Array(n);
  let probed = 0;
  for (let row = 0; row < g.rows; row += 1) {
    for (let col = 0; col < g.cols; col += 1) {
      const x = g.bounds.minX + col * g.cellSize;
      const z = g.bounds.minZ + row * g.cellSize;
      const r = solver.probe(x, z, null);
      if (!r.ok || !Number.isFinite(r.surfaceY)) continue;
      const i = row * g.cols + col;
      y64[i] = r.surfaceY;
      y32[i] = r.surfaceY;
      walk[i] = 1;
      probed += 1;
    }
  }
  const upOk = (a, b) => b - a <= STEP.maxStepHeight + 1e-9;
  const dnOk = (a, b) => a - b <= STEP.snapDownDistance + 1e-9;
  let decisive = 0; let decisiveUp = 0; let decisiveDown = 0;
  const examples = [];
  const decisivePairs = [];
  for (let row = 0; row < g.rows; row += 1) {
    for (let col = 0; col < g.cols; col += 1) {
      const i = row * g.cols + col;
      if (!walk[i]) continue;
      for (const [nc, nr] of [[col + 1, row], [col, row + 1]]) {
        if (nc >= g.cols || nr >= g.rows) continue;
        const j = nr * g.cols + nc;
        if (!walk[j]) continue;
        const pass64 = upOk(y64[i], y64[j]) && dnOk(y64[i], y64[j]);
        const pass32 = upOk(y32[i], y32[j]) && dnOk(y32[i], y32[j]);
        if (pass64 === pass32) continue;
        decisive += 1;
        decisivePairs.push({ a: { col, row }, b: { col: nc, row: nr } });
        if (upOk(y64[i], y64[j]) !== upOk(y32[i], y32[j])) decisiveUp += 1;
        if (dnOk(y64[i], y64[j]) !== dnOk(y32[i], y32[j])) decisiveDown += 1;
        if (examples.length < 6) {
          examples.push({
            a: { col, row, y64: y64[i], y32: y32[i] },
            b: { col: nc, row: nr, y64: y64[j], y32: y32[j] },
            d64: Math.abs(y64[j] - y64[i]), d32: Math.abs(y32[j] - y32[i]),
            verdictDouble: pass64, verdictFloat32: pass32,
          });
        }
      }
    }
  }
  return { probed, decisive, decisiveUp, decisiveDown, examples, all: decisivePairs };
}
const decisive = precisionDecisivePairs();
const decisiveExamplesAll = decisive.all;

/* ---------- ②c **产品级**历史翻转：同一格对"首次调用 vs 缓存后调用"的 `canStep` 是否相反 ---------- */
/**
 * 这是**不依赖任何精度模拟**的直接证据：对每对"精度决定性"格对，
 *   ① 新建一张图，**立刻** `canStep(a,b)`（两格都未缓存 ⇒ 走 `solver.probe` 的 double）；
 *   ② 同一张图上**再** `canStep(a,b)`（两格已缓存 ⇒ 走 `heights[i]`）；
 * 两次结论不同 ⇒ **同一棵树、同一对格、仅因调用历史不同而结论相反**。
 * 每次新建图只探测 2 格（`sample` 是惰性的），成本可忽略。
 */
function productHistoryFlips() {
  let flips = 0; const rows = [];
  for (const e of decisive.examples.length ? decisiveExamplesAll : []) {
    const g = makeFine();
    const first = g.canStep(e.a.col, e.a.row, e.b.col, e.b.row);
    const second = g.canStep(e.a.col, e.a.row, e.b.col, e.b.row);
    if (first !== second) {
      flips += 1;
      if (rows.length < 6) rows.push({ a: [e.a.col, e.a.row], b: [e.b.col, e.b.row], first, second, yFirst: g.sample(e.a.col, e.a.row).y, ySecond: g.sample(e.a.col, e.a.row).y });
    }
  }
  return { pairs: decisiveExamplesAll.length, flips, rows };
}
const productFlips = productHistoryFlips();

/* ---------- ③ 判定面校验和（细口径全图相邻对） ---------- */
const gEdge = makeFine();
let fnv = 0x811c9dc5;
let pass = 0; let fail = 0; let considered = 0;
const hashByte = (b) => { fnv ^= b & 0xff; fnv = Math.imul(fnv, 0x01000193) >>> 0; };
for (let row = 0; row < gEdge.rows; row += 1) {
  for (let col = 0; col < gEdge.cols; col += 1) {
    for (const [nc, nr] of [[col + 1, row], [col, row + 1]]) {
      if (nc >= gEdge.cols || nr >= gEdge.rows) continue;
      const a = gEdge.sample(col, row);
      const b = gEdge.sample(nc, nr);
      if (!a.ok || !b.ok) continue;
      considered += 1;
      const v = gEdge.canStep(col, row, nc, nr) ? 1 : 0;
      if (v) pass += 1; else fail += 1;
      hashByte(v);
    }
  }
}
const edgeHash = fnv.toString(16).padStart(8, '0');

const label = gEdge.componentOf(OUTSIDE.x, OUTSIDE.z);
const stats = gEdge.stats();
const report = {
  variant: VARIANT,
  layout: LAYOUT.LAYOUT_VERSION,
  thresholds: { maxStepHeight: STEP.maxStepHeight, snapDownDistance: STEP.snapDownDistance, boundaryEps: 1e-9 },
  points: POINTS.length,
  history: { stable: historyStable, distinctVerdicts: historyOkSet.size, arms: history },
  coldWarmFlip: flip,
  independentRuns: { stable: runStable, runs },
  precision: { checked, maxDeltaY, f32RoundTripExact, froundMismatch, samples },
  precisionDecisive: { probed: decisive.probed, pairs: decisive.decisive, up: decisive.decisiveUp, down: decisive.decisiveDown, examples: decisive.examples },
  productHistory: productFlips,
  edges: { considered, pass, fail, hash: edgeHash },
  fine: { cols: gEdge.cols, rows: gEdge.rows, walkable: stats.walkable, sampled: stats.sampled, mainComponent: label ? label.size : null },
};
console.log(`[t12 精度探针] variant=${VARIANT}｜LAYOUT ${LAYOUT.LAYOUT_VERSION}｜点集 ${POINTS.length}`);
console.log(` ① 调用历史敏感性：${historyStable ? '稳定 ✓' : `**不稳定 ✗**（${historyOkSet.size} 种结论）`}`);
for (const [name, h] of Object.entries(history)) console.log(`     ${name.padEnd(10)} ok=${h.ok} 不可达 ${h.unreachable}｜分量 ${h.visited}｜${h.ids || '(无)'}`);
console.log(` ①b 冷/暖 flood：冷 ${flip.coldVisited} 格 → 暖 ${flip.warmVisited} 格（差 ${flip.delta}）${flip.delta === 0 ? ' ✓' : ' **翻转 ✗**'}`);
console.log(` ①c 独立运行 ×3：${runStable ? '逐值一致 ✓' : '**不一致 ✗**'}｜${runs.map((r) => `${r.visited}/${r.ok ? 'ok' : 'no'}/${r.unreachable}`).join(' , ')}`);
console.log(` ② 图侧精度：检查 ${checked} 格｜首次 vs 缓存 max|Δy| = ${maxDeltaY.toExponential(3)}｜逐值相同 ${f32RoundTripExact}/${checked}｜heights≠fround(probe) ${froundMismatch}`);
for (const s of samples) console.log(`     (${s.col},${s.row}) probe=${s.probeDouble} 首次=${s.firstSampleY} 缓存=${s.cachedY} fround=${s.fround}`);
console.log(` ②b **精度决定性**相邻对：${decisive.decisive} 对（上行 ${decisive.decisiveUp} / 下行 ${decisive.decisiveDown}）⇒ 这些格对的结论**取决于该格是否已被缓存**`);
for (const e of decisive.examples) console.log(`     (${e.a.col},${e.a.row})y64=${e.a.y64}/y32=${e.a.y32} ↔ (${e.b.col},${e.b.row})y64=${e.b.y64}/y32=${e.b.y32}｜Δ64=${e.d64.toExponential(6)} Δ32=${e.d32.toExponential(6)}｜double⇒${e.verdictDouble ? '可跨' : '拒'} float32⇒${e.verdictFloat32 ? '可跨' : '拒'}`);
console.log(` ②c **产品级**历史翻转（不依赖精度模拟）：${productFlips.flips}/${productFlips.pairs} 对「首次 vs 缓存后」结论相反${productFlips.flips === 0 ? ' ✓' : ' **✗**'}`);
for (const r of productFlips.rows) console.log(`     a(${r.a}) ↔ b(${r.b})：首次 ${r.first ? '可跨' : '拒'} → 缓存后 ${r.second ? '可跨' : '拒'}｜y 首次 ${r.yFirst} / 缓存 ${r.ySecond}`);
console.log(` ③ 判定面：相邻可走对 ${considered}｜可跨 ${pass} / 不可跨 ${fail}｜校验和 ${edgeHash}`);
console.log(`    细口径 ${gEdge.cols}×${gEdge.rows}｜可走 ${stats.walkable}｜主分量 ${label ? label.size : null}`);
if (OUT) { writeFileSync(OUT, JSON.stringify(report, null, 1)); console.log(` ⇒ ${OUT}`); }
process.stdout.write(`${JSON.stringify({ variant: VARIANT, historyStable, coldWarmDelta: flip.delta, runStable, runs, maxDeltaY, decisivePairs: decisive.decisive, decisiveUp: decisive.decisiveUp, decisiveDown: decisive.decisiveDown, productHistoryFlips: productFlips.flips, edgeHash, pass, fail, mainComponent: label ? label.size : null, walkable: stats.walkable })}\n`);
