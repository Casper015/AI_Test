/**
 * t140 · 常驻「结果级」可达性断言（第 4 层，只读消费 core/interaction，不改 `src/**`）
 *
 * 层次分工（四条互补，不得互相掩盖）：
 *   ① 面级（t128，`layout.test.mjs`）：任何可行走面**不得被更高面完全内含**（平面投影）。
 *   ② 链级（t131，`layout.test.mjs`）：每处门洞的「门外接近面 → 通道面 → 室内面」链**存在且相邻可跨**。
 *   ③ 格级（t134，`layout.test.mjs`）：门中心/门带中点的**解析高度**与自身 y 之差在可跨带内。
 *   ④ **结果级（本文件）**：在**生产求解器 + 真实建图**下，逐门断言
 *      「门外可达点 → 门中 → 室内」**真的能走到** ⇒ 精确断言「不可达 = 0」。
 *
 * 口径（如实标注，不得冒充）：
 *   · 整城 `cellSize:1` 的格数约 94 万 > 默认 `maxCells` 40 万 ⇒ **默认口径下会抛错**（t116 已证）。
 *     本文件**显式提额** `maxCells: 3_000_000` 才可用 1m 整城图 —— 这是本断言的**细口径**。
 *   · 同时构建**默认上限内**的 `cellSize:2` 整城图作为**粗口径**，两条口径**分别断言**、
 *     结果并列打印；**不得**用粗口径结果代表细口径。
 *   · 局部细口径即 1m 整城图上的逐门 `nearestCell` 取样（范围内 1m，与 t132/t137 探针同源）。
 *
 * t148（性能，口径与断言强度**一字不改**）：
 *   · 旧实现每门调 2 次 `graph.path()`，而 `path()` 内部就是**一次全图 flood**（约 94 万格）
 *     ⇒ 252 门 × 2 = **504 次全图 flood** ⇒ 单测 ≈25s。
 *   · 现改为 `graph.componentOf(x,z)`（t148 新增导出，复用同一 `flood`）：**每个口径只做 1 次全图标注**，
 *     之后每门为 **O(1)** 成员判定 ⇒ 全测 **2 次 flood**。
 *   · `PROOF=1` 时额外跑**逐门对照**：`componentOf(...).ok` 必须与 `path(...).ok` 逐门一致
 *     （证明两套写法结果逐值相同；默认为快路径，不跑这步）。
 */
import { loadModule } from './harness.mjs';

const LAYOUT = await loadModule('src/shared/layout.js');
const CONFIG = await loadModule('src/shared/config.js');
const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');

const solver = createWalkSolver({ config: CONFIG, layout: LAYOUT });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` :: ${detail}`}`);
  if (!ok) failures += 1;
};

console.log('t140 结果级可达性断言（生产 solver + 真实建图；只读）');
console.log(`  LAYOUT ${LAYOUT.LAYOUT_VERSION} · 可行走面 ${LAYOUT.WALKABLE.length} · maxStepHeight ${CONFIG.INTERACTION.step.maxStepHeight} · snapDownDistance ${CONFIG.INTERACTION.step.snapDownDistance}`);

const graphFine = createWalkGraph(solver, { cellSize: 1, layout: LAYOUT, config: CONFIG, maxCells: 3_000_000 });
const graphCoarse = createWalkGraph(solver, { cellSize: 2, layout: LAYOUT, config: CONFIG });
// t148：每个口径**各 1 次**全图连通分量标注（起点 = 南桥外 (0,-480)，与 E8/E11/E18 同源）；
// 之后所有门的成员判定都是 O(1)。
const OUTSIDE = { x: 0, z: -480 };
const tLabel0 = Date.now();
const labelFine = graphFine.componentOf(OUTSIDE.x, OUTSIDE.z);
const labelCoarse = graphCoarse.componentOf(OUTSIDE.x, OUTSIDE.z);
const tLabel = Date.now() - tLabel0;
console.log(`  分量标注（每口径 1 次 flood）：耗时 ${tLabel}ms（细 ${labelFine.size} 格 / 粗 ${labelCoarse.size} 格）`);
console.log(`  口径：细 = cellSize:1（**显式提额 maxCells=3,000,000**；默认 400k 会抛错，t116 已证）；粗 = cellSize:2（默认上限内）`);

const centreOf = (w) => ({ x: (w.bounds.minX + w.bounds.maxX) / 2, z: (w.bounds.minZ + w.bounds.maxZ) / 2 });
const coveringHigher = (band) => LAYOUT.WALKABLE.filter((w) => w.bounds.maxX > band.minX - 1e-6 && w.bounds.minX < band.maxX + 1e-6
  && w.bounds.maxZ > band.minZ - 1e-6 && w.bounds.minZ < band.maxZ + 1e-6 && w.y > band.y + 1e-9);

const slots = LAYOUT.SLOTS.filter((s) => s.door);
const unreachableFine = [];
const unreachableCoarse = [];
let affectedPressed = 0;

for (const slot of slots) {
  const rec = LAYOUT.INTERIOR_BY_SLOT?.[slot.id] ?? null;
  const passage = LAYOUT.WALKABLE.find((w) => w.id === `WK-${slot.id}-door-passage`);
  if (!passage) continue;
  const from = { x: slot.door.facade.x, z: slot.door.facade.z };
  const doorC = { x: slot.door.center.x, z: slot.door.center.z };
  const inWk = rec ? LAYOUT.WALKABLE.find((w) => w.id === rec.walkableId) : null;
  const inC = inWk ? centreOf(inWk) : null;
  const declaredBlocked = slot.door.passable === false;
  const pressed = coveringHigher(passage).length > 0;
  if (pressed) affectedPressed += 1;

  const evalGraph = (g, label) => {
    const cF = g.nearestCell(from.x, from.z);
    const cD = g.nearestCell(doorC.x, doorC.z);
    const cI = inC ? g.nearestCell(inC.x, inC.z) : null;
    const sF = cF ? g.sample(cF.col, cF.row) : null;
    const sD = cD ? g.sample(cD.col, cD.row) : null;
    const sI = cI ? g.sample(cI.col, cI.row) : null;
    const step1 = cF && cD ? g.canStep(cF.col, cF.row, cD.col, cD.row) : null;
    const step2 = cD && cI ? g.canStep(cD.col, cD.row, cI.col, cI.row) : null;
    // t148：O(1) 成员判定（同一口径的 1 次标注；不得以粗代细）
    const p1 = g.componentOf(doorC.x, doorC.z, OUTSIDE).ok;
    const p2 = inC ? g.componentOf(inC.x, inC.z, OUTSIDE).ok : null;
    return { label, sF: sF?.y ?? null, sD: sD?.y ?? null, sI: sI?.y ?? null, step1, step2, p1, p2 };
  };
  const fine = evalGraph(graphFine, 'cellSize:1');
  const coarse = evalGraph(graphCoarse, 'cellSize:2');

  const broken = (r) => !r.p1 || (r.p2 !== null && !r.p2);
  const why = (r) => (!r.step1 ? 'canStep(门外→门中)=false' : (r.step2 === false ? 'canStep(门中→室内)=false' : (!r.p1 ? '与门外起点不同分量(门中)' : '与门外起点不同分量(室内)')));
  if (broken(fine)) unreachableFine.push({ id: slot.id, r: fine, why: why(fine), declaredBlocked, pressed });
  if (broken(coarse)) unreachableCoarse.push({ id: slot.id, r: coarse, why: why(coarse), declaredBlocked, pressed });
}

const fmt = (rows) => rows.map((x) => `      · ${x.id}：${x.why}；门外 ${x.r.sF} / 门中 ${x.r.sD} / 室内 ${x.r.sI}${x.declaredBlocked ? '（已声明 blockedBy）' : ''}${x.pressed ? '；门带被更高面覆盖' : ''}`).join('\n');
const realFine = unreachableFine.filter((x) => !x.declaredBlocked);
const realCoarse = unreachableCoarse.filter((x) => !x.declaredBlocked);
const affected = realFine.filter((x) => x.pressed).length;

console.log(`  基线：有门槽位 ${slots.length} · 图中不可达（且未声明 blockedBy）细口径 ${realFine.length} / 粗口径 ${realCoarse.length} · 存在「门带被更高面覆盖」${affectedPressed} · 影响可达性（不可达 ∧ 被压）${affected}`);
check(`细口径（cellSize:1，提额）全城门洞「不可达 = 0」（精确；含声明 blockedBy 的 ${unreachableFine.length - realFine.length} 处例外）`, realFine.length === 0, fmt(realFine));
check(`粗口径（cellSize:2，默认上限）全城门洞「不可达 = 0」（精确）`, realCoarse.length === 0, fmt(realCoarse));
check('细口径逐门「通道面 ↔ 室内面」同层或可跨（门中↔室内 canStep 不为 false）',
  slots.every((s) => { const r = LAYOUT.INTERIOR_BY_SLOT?.[s.id]; if (!r) return true; const g = graphFine; const cD = g.nearestCell(s.door.center.x, s.door.center.z); const w = LAYOUT.WALKABLE.find((x) => x.id === r.walkableId); const c = centreOf(w); const cI = g.nearestCell(c.x, c.z); return !cD || !cI || g.canStep(cD.col, cD.row, cI.col, cI.row) !== false; }), '');

// t148：常驻守卫——`path()` 返回**对象**（非 null）⇒ 不得用 `!= null` 当"可达"判据（旧写法的恒真陷阱）
check('`path()` 返回对象（不得再用 `!= null` 作可达判据；t148）', typeof graphCoarse.path({ x: 0, z: -480 }, { x: 0, z: -20 }) === 'object', '');

if (process.env.PROOF === '1') {
  // t148 证明：**逐门**比较 componentOf 与 path(.ok) 两套写法（口径各自独立，不混用）
  let n = 0; let mismatches = [];
  for (const slot of slots) {
    const rec = LAYOUT.INTERIOR_BY_SLOT?.[slot.id] ?? null;
    if (!LAYOUT.WALKABLE.find((w) => w.id === `WK-${slot.id}-door-passage`)) continue;
    const inWk = rec ? LAYOUT.WALKABLE.find((w) => w.id === rec.walkableId) : null;
    const inC = inWk ? centreOf(inWk) : null;
    for (const [g, name] of [[graphFine, 'cellSize:1'], [graphCoarse, 'cellSize:2']]) {
      const targets = [slot.door.center].concat(inC ? [inC] : []);
      for (const t of targets) {
        n += 1;
        const byLabel = g.componentOf(t.x, t.z, OUTSIDE).ok;
        const byPath = g.path(OUTSIDE, { x: t.x, z: t.z }).ok === true;
        if (byLabel !== byPath) mismatches.push(`${name}/${slot.id}@${t.x.toFixed(1)},${t.z.toFixed(1)} label=${byLabel} path=${byPath}`);
      }
    }
  }
  console.log(`  PROOF：逐门对照 ${n} 项（componentOf vs path.ok，细/粗各自独立）⇒ 不一致 ${mismatches.length} 项`);
  if (mismatches.length) console.log(mismatches.slice(0, 10).map((m) => `      · ${m}`).join('\n'));
  check(`PROOF：componentOf 与 path(.ok) 逐门逐值一致（${n} 项）`, mismatches.length === 0, mismatches.slice(0, 5).join('；'));
}

console.log(`t140 结果：${failures === 0 ? '全部通过 ✓' : `失败 ${failures} 项`}`);
process.exit(failures === 0 ? 0 : 1);
