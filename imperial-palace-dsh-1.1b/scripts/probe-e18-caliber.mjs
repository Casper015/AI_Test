/**
 * t146：E18/E8/E11 的口径裁定探针（**只读**；不改任何阈值/默认值/几何）。
 * 对 43 处内景，在**同一逻辑**下比较两套口径：
 *   ① 粗口径 cellSize=3（E18/E8/E11 当前口径）
 *   ② 细口径 cellSize=1 + 显式提额 maxCells（t140/t143 同源）
 * 判定用**生产 `graph.path`**（非自建搜索）；自建 BFS（`graph.flood`）用于交叉校验。
 */
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'three') return { url: pathToFileURL(process.cwd() + '/public/vendor/three/three.module.js').href, shortCircuit: true };
    return next(spec, ctx);
  },
});
const P = (p) => pathToFileURL(process.cwd() + '/' + p).href;
const L = await import(P('src/shared/layout.js'));
const { CONFIG } = await import(P('src/shared/config.js'));
const { createWalkSolver } = await import(P('src/interaction/walk-solver.js'));
const { createWalkGraph } = await import(P('src/interaction/walk-graph.js'));

const ANCHOR = { x: 0, z: -480 }; // 南桥外（与 E8/E11/E18 的入口口径一致）
const solver = createWalkSolver({});

const run = (cellSize, maxCells) => {
  const graph = createWalkGraph(solver, { cellSize, maxCells });
  const anchor = graph.nearestCell(ANCHOR.x, ANCHOR.z);
  const main = graph.flood(anchor).parents; // 自建 BFS（交叉校验用）
  const inMain = (col, row) => main[row * graph.cols + col] !== -2;
  const rows = [];
  for (const vp of L.VIEWPOINTS.filter((v) => v.mode === 'interior')) {
    const cell = graph.nearestCell(vp.position.x, vp.position.z);
    const p = graph.path(ANCHOR, vp.position); // ★ 生产 API
    rows.push({
      vp: vp.id,
      pathOk: p.ok === true,   // path() 返回对象 ⇒ 必须判 .ok（初版误用 !!p，恒 true）
      pathLen: p.ok ? (p.length ?? p.cells ?? null) : null,
      bfsOk: cell ? inMain(cell.col, cell.row) : false,
      cell: cell ? `${cell.col},${cell.row}` : null,
    });
  }
  return { graph, rows, stats: graph.stats ? graph.stats() : null };
};

const coarse = run(3, 400000);
const fine = run(1, 1200000);
const byVp = new Map(fine.rows.map((r) => [r.vp, r]));
const t142Red = [
  'VP-B-side-west-south-interior', 'VP-B-side-east-south-interior', 'VP-B-side-west-main-interior', 'VP-B-side-east-main-interior',
  'VP-B-side-west-rear-interior', 'VP-B-side-east-rear-interior', 'VP-C-side-west-rear-interior', 'VP-C-side-east-rear-interior',
  'VP-B-hall-mid-interior', 'VP-B-hall-rear-interior', 'VP-C-hall-bed-rear-interior',
  'VP-D-court1-hall-interior', 'VP-D-court2-hall-interior', 'VP-D-court3-hall-interior', 'VP-D-court4-hall-interior',
  'VP-E-court1-hall-interior', 'VP-E-court2-hall-interior', 'VP-E-court4-hall-interior',
];

console.log(`口径①  粗 cellSize=3（maxCells 400000，无提额）`);
console.log(`口径②  细 cellSize=1（maxCells 1200000，显式提额）`);
console.log(`生产 API = graph.path ｜ 自建 BFS = graph.flood（交叉校验）`);
console.log('');
// 交叉校验：粗口径下两者逐栋一致？
let agree = 0;
for (const r of coarse.rows) if (r.pathOk === r.bfsOk) agree += 1;
const agreeFine = fine.rows.filter((r) => r.pathOk === r.bfsOk).length;
console.log(`交叉校验（粗）：path 与自建 BFS 一致 ${agree}/${coarse.rows.length}`);
console.log(`交叉校验（细）：path 与自建 BFS 一致 ${agreeFine}/${fine.rows.length}`);
console.log(`粗口径可达 ${coarse.rows.filter((r) => r.pathOk).length}/43 ｜ 细口径可达 ${fine.rows.filter((r) => r.pathOk).length}/43`);
console.log('');
console.log('t142 报红（12+ 栋）在两套口径下的逐栋结果：');
for (const id of t142Red) {
  const c = coarse.rows.find((r) => r.vp === id);
  const f = byVp.get(id);
  if (!c || !f) continue;
  console.log(`  ${id.padEnd(34)} 粗(3m): ${c.pathOk ? '可达' : '不可达'}  细(1m): ${f.pathOk ? '可达' : '不可达'}${c.pathOk !== f.pathOk ? '   ← 口径差异' : ''}`);
}
const artifact = t142Red.filter((id) => {
  const c = coarse.rows.find((r) => r.vp === id);
  const f = byVp.get(id);
  return c && f && !c.pathOk && f.pathOk;
});
const real = t142Red.filter((id) => {
  const f = byVp.get(id);
  return f && !f.pathOk;
});
console.log('');
console.log(`裁定：粗口径不可达但细口径可达 = ${artifact.length} 栋（粗口径伪影）`);
console.log(`      细口径仍不可达 = ${real.length} 栋（真实缺口）：${real.join('、')}`);
// 细口径仍不可达者的断点（最近可达格 + 目标面/可行走面高差）
const fineUnreachable = fine.rows.filter((r) => !r.pathOk).map((r) => r.vp);
console.log('细口径仍不可达（全部，非仅 12 栋名单）：', fineUnreachable.join('、') || '（无）');
const coarseUnreachable = coarse.rows.filter((r) => !r.pathOk).map((r) => r.vp);
console.log('粗口径不可达（全部）：', coarseUnreachable.join('、') || '（无）');
const detail = [];
for (const id of real.concat(fineUnreachable.filter((x) => !real.includes(x)))) {
  const vp = L.VIEWPOINTS.find((v) => v.id === id);
  const surface = L.WALKABLE.find((w) => vp.position.x >= w.bounds.minX && vp.position.x <= w.bounds.maxX && vp.position.z >= w.bounds.minZ && vp.position.z <= w.bounds.maxZ);
  const cell = fine.graph.nearestCell(vp.position.x, vp.position.z);
  const probe = solver.probe(vp.position.x, vp.position.z);
  detail.push({ id, surface: surface?.id ?? null, surfaceY: surface?.y ?? null, probeOk: probe.ok, reasons: probe.reasons, cell: cell ? `${cell.col},${cell.row}` : null });
}
console.log('细口径仍不可达者明细：', JSON.stringify(detail, null, 1));
