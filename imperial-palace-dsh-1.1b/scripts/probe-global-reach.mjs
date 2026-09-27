#!/usr/bin/env node
/**
 * scripts/probe-global-reach.mjs —— t143 只读诊断：**局部 vs 全局可达性口径分离 + 全局断点逐格定位**
 * =============================================================================
 * 归属：verifier（本卡 inScope：`docs/report-completeness.md`、`scripts/probe-global-reach.mjs`）
 * 纪律：**只读**——不修改任何几何/断言/判据；本脚本不 import 任何会写盘的工具。
 *
 * 为什么要分开量：
 *   · **局部口径**（t137/t140 用的）：从该栋 `door.facade`（门外锚点）出发 → 室内 ⇒ 只回答"门能不能进"；
 *   · **全局口径**（本席 B1/B10/5.3 的字面含义）：从 `FP_ROUTE` 起点 / `fp-spawn` 出发 → 门外锚点 → 室内
 *     ⇒ 回答"玩家从出生点能不能走到这扇门"。
 *   两者可以同时为真 ⇒ 必须分开量、并把"全局"断点定到具体相邻格对。
 *
 * 建图选项（与生产一致，逐条写明）：`createWalkGraph(solver, { cellSize: 1, maxCells: 2_000_000 })`；
 *   另跑 `cellSize: 2` 作对照。断点定位用**与 graph 同规则的 1m 网格 BFS**（`solver.probe(x,z,null)` 取高度 +
 *   `maxStepHeight 0.5` / `snapDownDistance 0.6`），并与 `graph.path` 逐点交叉校验（见 §校验）。
 *
 * 用法：node scripts/probe-global-reach.mjs            # 打印结论（并写出 /tmp/t143-global-reach.json）
 */

import { writeFileSync } from 'node:fs';
import { assembleCity } from './verify-walk.mjs';

const TARGETS = ['C-side-west-main', 'C-side-east-main'];
const ORIGINS = [
  { key: 'local:facade', label: '局部（门外锚点）', of: (t) => t.facade },
  { key: 'global:spawnB', label: '全局（VP-B-fp-spawn）', of: () => null },
  { key: 'global:routeStart', label: '全局（FP_ROUTE[0] 南桥北端）', of: () => null },
];
const CELL = 1;
const STEP = { up: 0.5, down: 0.6 };

const city = await assembleCity();
const { LAYOUT, CONFIG, solver, createWalkGraph } = city;
const up = CONFIG.INTERACTION.step.maxStepHeight;
const down = CONFIG.INTERACTION.step.snapDownDistance;
const spawnB = LAYOUT.VIEWPOINTS.find((v) => v.id === 'VP-B-fp-spawn').position;
const routeStart = LAYOUT.FP_ROUTE[0].position;

const graphs = {
  c1: createWalkGraph(solver, { cellSize: 1, maxCells: 2000000 }),
  c2: createWalkGraph(solver, { cellSize: 2, maxCells: 2000000 }),
};
console.log('=== t143 局部 vs 全局可达性口径分离 ===');
console.log(`LAYOUT ${LAYOUT.LAYOUT_VERSION} · 建图：createWalkGraph(solver,{cellSize:1,maxCells:2000000}) 主口径；cellSize:2 对照`);
console.log(`步规则（生产）：上台阶 ≤${up}m / 下台阶 ≤${down}m；起点 B=${fmt(spawnB)} · 路线起点=${fmt(routeStart)}`);
console.log(`graph.stats(c1)=${JSON.stringify(graphs.c1.stats())}`);

const targets = TARGETS.map((id) => {
  const slot = LAYOUT.SLOT_BY_ID[id];
  const rec = Object.entries(LAYOUT.INTERIOR_BY_SLOT).find(([sid]) => sid === id)[1];
  const face = LAYOUT.WALKABLE.find((w) => w.id === rec.walkableId);
  const vp = LAYOUT.VIEWPOINT_BY_ID[rec.viewpointId];
  return { id, slot, rec, face, vp, facade: slot.door.facade, facesAtFacade: LAYOUT.walkableAt(slot.door.facade.x, slot.door.facade.z).map((w) => `${w.id}/${w.kind}/${w.y}`) };
});

/* ------------------------------------------------------------------ 1) 两口径读数 */
console.log('\n--- 1) 两口径读数（graph.path；cellSize 1 与 2 并列）---');
const readings = [];
for (const t of targets) {
  const legs = {
    'local:facade→室内': [t.facade, { x: t.vp.position.x, z: t.vp.position.z }],
    '全局:spawnB→门外锚点': [spawnB, t.facade],
    '全局:spawnB→室内': [spawnB, { x: t.vp.position.x, z: t.vp.position.z }],
    '全局:routeStart→门外锚点': [routeStart, t.facade],
    '全局:routeStart→室内': [routeStart, { x: t.vp.position.x, z: t.vp.position.z }],
  };
  const rows = [];
  for (const [name, [from, to]] of Object.entries(legs)) {
    const a = graphs.c1.path({ x: from.x, z: from.z }, { x: to.x, z: to.z });
    const b = graphs.c2.path({ x: from.x, z: from.z }, { x: to.x, z: to.z });
    const row = { leg: name, c1: { ok: a.ok, len: a.length ?? null, reason: a.reason ?? null }, c2: { ok: b.ok, len: b.length ?? null, reason: b.reason ?? null } };
    rows.push(row);
    console.log(`  ${t.id} · ${name}: cellSize1=${a.ok ? `✓ ${a.length}m` : `✗ ${a.reason}`} · cellSize2=${b.ok ? `✓ ${b.length}m` : `✗ ${b.reason}`}`);
  }
  readings.push({ id: t.id, door: { center: t.slot.door.center, facing: t.slot.facing, sillY: t.slot.door.sillY, passable: t.slot.door.passable, blockedBy: t.slot.door.blockedBy }, facade: t.facade, facesAtFacade: t.facesAtFacade, interiorFace: t.rec.walkableId, interiorY: t.face.y, vp: t.vp.position, legs: rows });
}

/* ------------------------------------------------------------------ 2) 断点定位（1m 网格 BFS，镜像生产步规则） */
const ext = LAYOUT.TERRAIN_EXTENT;
const cols = Math.floor((ext.maxX - ext.minX) / CELL) + 1;
const rowsN = Math.floor((ext.maxZ - ext.minZ) / CELL) + 1;
const idx = (c, r) => r * cols + c;
const wx = (c) => ext.minX + c * CELL;
const wz = (r) => ext.minZ + r * CELL;
const toCell = (p) => ({ c: Math.round((p.x - ext.minX) / CELL), r: Math.round((p.z - ext.minZ) / CELL) });
const okCache = new Uint8Array(cols * rowsN).fill(255);
const hCache = new Float32Array(cols * rowsN);
function sample(c, r) {
  if (c < 0 || r < 0 || c >= cols || r >= rowsN) return { ok: false, y: null, reason: 'outOfGrid' };
  const i = idx(c, r);
  if (okCache[i] === 255) { const p = solver.probe(wx(c), wz(r), null); okCache[i] = p.ok ? 1 : 0; hCache[i] = p.surfaceY ?? NaN; }
  return { ok: okCache[i] === 1, y: Number.isFinite(hCache[i]) ? hCache[i] : null, reasons: [] };
}
function stepVerdict(a, b) {
  if (!a.ok || !b.ok || a.y === null || b.y === null) return 'noSurface';
  if (b.y - a.y > up + 1e-9) return 'stepTooHigh';
  if (b.y - a.y < -down - 1e-9) return 'dropTooDeep';
  return 'ok';
}
function bfs(from) {
  const reach = new Uint8Array(cols * rowsN);
  const start = toCell(from);
  const s = sample(start.c, start.r);
  if (!s.ok) return { reach, count: 0, start: null };
  const q = [start]; reach[idx(start.c, start.r)] = 1; let count = 1;
  for (let head = 0; head < q.length; head += 1) {
    const { c, r } = q[head];
    const a = sample(c, r);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rowsN) continue;
      const i = idx(nc, nr);
      if (reach[i]) continue;
      const b = sample(nc, nr);
      if (stepVerdict(a, b) !== 'ok') continue;
      reach[i] = 1; count += 1; q.push({ c: nc, r: nr });
    }
  }
  return { reach, count, start };
}
const landmarks = [
  { id: 'spawnB', p: spawnB }, { id: 'routeStart', p: routeStart },
  { id: 'C-fp-spawn', p: LAYOUT.VIEWPOINTS.find((v) => v.id === 'VP-C-fp-spawn').position },
  { id: 'C-ground-中心', p: { x: 0, z: 190 } },
];
const frontier = [];
for (const t of targets) {
  console.log(`\n--- 2) 断点定位：${t.id}（目标：spawnB → 门外锚点 ${fmt(t.facade)}）---`);
  const { reach, count, start } = bfs(spawnB);
  const inReach = (p) => { const { c, r } = toCell(p); return (c >= 0 && r >= 0 && c < cols && r < rowsN) ? reach[idx(c, r)] === 1 : false; };
  console.log(`  BFS 起点格=${start ? `(${wx(start.c)}, ${wz(start.r)})` : 'n/a'} · 可达格 ${count}（cellSize=${CELL}m）`);
  for (const lm of [...landmarks, { id: '该栋门外锚点', p: t.facade }, { id: '该栋室内中心', p: { x: (t.face.bounds.minX + t.face.bounds.maxX) / 2, z: (t.face.bounds.minZ + t.face.bounds.maxZ) / 2 } }]) {
    console.log(`   · ${lm.id} ${fmt(lm.p)} ⇒ ${inReach(lm.p) ? '在 spawnB 分量内 ✓' : '**不在 spawnB 分量内** ✗'}`);
  }
  // 前沿格对：可达格 → 不可达邻居中，离目标最近的若干对
  const targetCell = toCell(t.facade);
  const pairs = [];
  for (let r = 0; r < rowsN; r += 1) for (let c = 0; c < cols; c += 1) {
    if (!reach[idx(c, r)]) continue;
    const a = sample(c, r);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rowsN) continue;
      if (reach[idx(nc, nr)]) continue;
      const b = sample(nc, nr);
      if (!b.ok) continue; // 只报“两侧都可站但跨不过去”的真断点
      const v = stepVerdict(a, b);
      if (v === 'ok') continue;
      const d = Math.hypot(nc - targetCell.c, nr - targetCell.r) * CELL;
      pairs.push({ A: { x: wx(c), z: wz(r), y: a.y }, B: { x: wx(nc), z: wz(nr), y: b.y }, dh: b.y === null ? null : +(b.y - a.y).toFixed(3), verdict: v, distToTarget: +d.toFixed(1) });
    }
  }
  pairs.sort((x, y) => x.distToTarget - y.distToTarget);
  const uniq = [];
  const seen = new Set();
  for (const p of pairs) {
    const key = `${p.verdict}|${Math.round(p.A.x / 8)}|${Math.round(p.A.z / 8)}`;
    if (seen.has(key)) continue;
    seen.add(key); uniq.push(p);
    if (uniq.length >= 6) break;
  }
  console.log(`  前沿（两侧都可站但跨不过去的相邻格对，按离目标距离排序，去重后前 ${uniq.length} 处）：`);
  for (const p of uniq) {
    const fa = LAYOUT.walkableAt(p.A.x, p.A.z).map((w) => `${w.id}(${w.kind},y${w.y})`).slice(0, 2).join(' + ');
    const fb = LAYOUT.walkableAt(p.B.x, p.B.z).map((w) => `${w.id}(${w.kind},y${w.y})`).slice(0, 2).join(' + ');
    console.log(`   · A(${p.A.x}, ${p.A.z}, y${p.A.y}) [${fa}] → B(${p.B.x}, ${p.B.z}, y${p.B.y}) [${fb}] : Δy=${p.dh} ⇒ ${p.verdict}（离目标 ${p.distToTarget}m）`);
  }
  frontier.push({ id: t.id, bfsCells: count, start: start ? { x: wx(start.c), z: wz(start.r) } : null, landmarkMembership: [...landmarks, { id: 'facade', p: t.facade }, { id: 'interiorCenter', p: { x: (t.face.bounds.minX + t.face.bounds.maxX) / 2, z: (t.face.bounds.minZ + t.face.bounds.maxZ) / 2 } }].map((lm) => ({ id: lm.id, p: lm.p, inSpawnComponent: inReach(lm.p) })), frontier: uniq, frontierTotal: pairs.length });
}

/* ------------------------------------------------------------------ 3) 与 graph.path 交叉校验（镜像是否忠实） */
console.log('\n--- 3) 交叉校验：自建 1m BFS vs 生产 graph.path（同一 spawnB 起点）---');
const checkPoints = [
  { id: 'spawnB', p: spawnB }, { id: 'routeStart', p: routeStart }, { id: 'C-fp-spawn', p: LAYOUT.VIEWPOINTS.find((v) => v.id === 'VP-C-fp-spawn').position },
  { id: 'C-ground-中心', p: { x: 0, z: 190 } }, { id: 'C-bed-门前', p: { x: 0, z: 160 } },
  ...targets.map((t) => ({ id: `${t.id}-facade`, p: t.facade })),
  ...targets.map((t) => ({ id: `${t.id}-内`, p: { x: t.vp.position.x, z: t.vp.position.z } })),
];
const { reach: reachCheck } = bfs(spawnB);
let agree = 0;
const checkRows = [];
for (const cp of checkPoints) {
  const { c, r } = toCell(cp.p);
  const mine = (c >= 0 && r >= 0 && c < cols && r < rowsN) ? reachCheck[idx(c, r)] === 1 : false;
  const prod = graphs.c1.path({ x: spawnB.x, z: spawnB.z }, { x: cp.p.x, z: cp.p.z }).ok;
  if (mine === prod) agree += 1;
  checkRows.push({ id: cp.id, mine, prod, agree: mine === prod });
  console.log(`  ${cp.id}: 自建BFS=${mine ? '可达' : '不可达'} · graph.path=${prod ? '可达' : '不可达'} ⇒ ${mine === prod ? '一致' : '**不一致**'}`);
}
console.log(`  一致 ${agree}/${checkRows.length}`);
console.log(`\n结论：见 docs/report-completeness.md §21（两口径定义 / 逐栋读数 / 断点格对 / 归因）。JSON ⇒ /tmp/t143-global-reach.json`);

writeFileSync('/tmp/t143-global-reach.json', JSON.stringify({ epoch: { LAYOUT: LAYOUT.LAYOUT_VERSION, graphs: { c1: graphs.c1.stats(), c2: graphs.c2.stats() }, step: { up, down }, spawnB, routeStart }, readings, frontier, crossCheck: { agree, total: checkRows.length, rows: checkRows } }, null, 1));

function fmt(p) { return `(${Math.round(p.x)}, ${Math.round(p.z)})`; }
