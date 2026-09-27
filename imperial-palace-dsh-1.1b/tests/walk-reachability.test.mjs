/**
 * t140 · 常驻「结果级」可达性断言（第 4 层，只读消费 core/interaction，不改 `src/**`）
 *
 * 层次分工（五条互补，不得互相掩盖）：
 *   ⓪ 分量级/结果级（**t152 新增**）：每一个 `-transition-*` / `-threshold` / `-door-passage`（门外接近类）面
 *      **必须与主户外分量（FP_ROUTE[0] 南桥北端）同属一个连通分量**（`componentOf(...).ok`）。
 *      **为何必须在这一层**：t150/t151 实测——"足印 ∪ 四周 1m 邻带"与"进深轴两端临界格"两种**面/格级**尝试
 *      各造 **417 处假红**（典型 `WK-B-side-west-main-door-passage@1.5` 边格被 `tier2@3` 覆盖 Δ1.50，而 B 两栋**实际全局可达**）；
 *      本质：C 两殿的缺陷是**集群级**属性——集群内**任一单体与其直接邻居的 |Δ| 都在可跨带内**（0.9↔1.3 = +0.4）
 *      ⇒ 面级/格级判据**原理上看不到它**（这正是 t134 格级护栏的缝，也是 t140 结果级护栏（恒真）未能守住的真实原因）。
 *   ① 面级（t128 遮蔽）· ② 链级（t131 通路）· ③ 格级（t134 门中心/门带）· ④ 结果级（本文件 门洞逐门可达）
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
 *
 * t21（**口径修正：把恒真假绿改成生产装配口径**；断言只增不减）：
 *   · **修前的假绿**（独立审查 BLOCKER A1）：本文件原先 `createWalkSolver({ config, layout })` **不传 registry**
 *     ⇒ `mergeObstacles` 只返回 `layout.OBSTACLES`（**93 条基线**）⇒ 测的是「**没有墙的城**」⇒ 171 个可行走面
 *     必然全连通 ⇒ 「内景不可达 = 0」**恒真**（判据与守护对象脱钩）。
 *   · **修后**：改用 `scripts/verify-walk.mjs` 的 `assembleCity()`（真 kit + core registry + B/C/D/E/F 5 区域
 *     `registerZone`；solver 由其内部 `createWalkSolver({ registry })` 构造）⇒ **与游戏同一装配路径**。
 *   · **改前/改后对照读数**（同一棵树 LAYOUT 1.1.22、同一判据）：
 *       ｜口径｜建图障碍｜cellSize:1 主户外分量｜内景不可达｜
 *       ｜A 无 registry（修前）｜ 93 ｜ 739,959 格 ｜ 0（**恒真**）｜
 *       ｜B 生产装配（修后）  ｜ 751 ｜ 723,785 格 ｜ **0（真绿；t10 已修 E 侧阶梯留裕量）**｜
 *     墙体层的敏感性实证：同格逐格对照两口径，**16,174 格**可走性相反/被切出主分量 ⇒ 本判据确实消费了墙体。
 *   · **注意**：修前口径下该断言**恒真**，故「修前也是 0」**不构成**该断言有效的证据；有效性来自由上表的
 *     「障碍 93 → 751」「分量 739,959 → 723,785」与 16,174 格差异。**不得**换回无 registry 构造回绿。
 */
import { loadModule } from './harness.mjs';
/** t21：**生产装配入口**（与游戏同一装配路径，非替身）——`scripts/verify-walk.mjs` 导出的 `assembleCity()`。 */
import { assembleCity } from '../scripts/verify-walk.mjs';

const LAYOUT = await loadModule('src/shared/layout.js');
const CONFIG = await loadModule('src/shared/config.js');
const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');

/* ===== t21：口径修正——从「无 registry 的基线替身」改为「生产装配（含 registry 751 条障碍）」=====
   修前（假绿）：`createWalkSolver({ config, layout })` **不传 registry** ⇒ `mergeObstacles` 只返回
     `layout.OBSTACLES`（**93 条基线**：不可进入建筑/护城河/水池/假山），**完全不含**各区域
     `registry.registerZone(...)` 派生的墙体碰撞盒 ⇒ 它测的是「**没有墙的城**」，171 个可行走面必然全连通
     ⇒ 「43 处内景不可达 = 0」这句**恒真**（判据与守护对象脱钩；`report-false-green-sweep.md` 点名的类别）。
   修后（本文件）：`assembleCity()` = 真 kit + core registry + 5 区域 `registerZone` ⇒ **与游戏同一装配路径**，
     且 solver 由 `assembleCity` **内部**用 `createWalkSolver({ registry })` 构造 ⇒ 墙体碰撞盒必然在册。
   注意：**不得**为了回绿而换回无 registry 构造、放宽判据、缩小点集，或把不可达点列为例外。 */
const city = await assembleCity();
const { solver, registry, createWalkGraph: createWalkGraphProd } = city;
const baselineObstacles = LAYOUT.OBSTACLES.length;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` :: ${detail}`}`);
  if (!ok) failures += 1;
};

console.log('t140 结果级可达性断言（生产 solver + 真实建图；只读）');
console.log(`  LAYOUT ${LAYOUT.LAYOUT_VERSION} · 可行走面 ${LAYOUT.WALKABLE.length} · maxStepHeight ${CONFIG.INTERACTION.step.maxStepHeight} · snapDownDistance ${CONFIG.INTERACTION.step.snapDownDistance}`);

/* ===== t21 自证：本文件测的就是**生产装配入口**，非替身（口径三要素见下） =====
   口径三要素（如实标注）：
     ① 网格参数：`cellSize:1` 细口径（`TERRAIN_EXTENT` 全域 841×1121 = 942,761 格；**显式提额**
        `maxCells:3_000_000`，默认 400k 会抛错）+ `cellSize:2` 粗口径（默认上限内，非权威）；
     ② 锚点：主户外分量起点 = `FP_ROUTE[0]` 南桥外 `OUTSIDE = (0,-480)`（与 E8/E11/E18 同源）；
     ③ 点集与判据：有门槽位（`SLOTS.filter(s => s.door)` + 存在 `WK-<slot>-door-passage` 者）的
        「门中 + 室内面中心」逐点 `componentOf(x,z,OUTSIDE).ok`（**`.ok` 布尔，严禁 `!= null` / `if (!p)`**）。 */
{
  const liveObstacles = registry.allObstacles().length;
  const solverObstacles = solver.stats().obstacles; // 生产 solver **实际入库**的障碍数（宽相位网格来源）
  console.log(`  t21 装配口径：LAYOUT.OBSTACLES 基线 ${baselineObstacles} 条 · registry.allObstacles() ${liveObstacles} 条`
    + `（含 core 派生墙体层）· 生产 solver.stats().obstacles ${solverObstacles} 条 · 区域 ${city.zones.size} 个`
    + `（${[...city.zones.keys()].join('/')}）`);
  console.log('  t21 口径三要素：① cellSize:1（提额 3,000,000）+ cellSize:2（非权威）；② 锚点 FP_ROUTE[0] 南桥外 (0,-480)；③ 门中/室内面中心 componentOf(...).ok');
  check('t21 口径①：测试用图的建图函数**逐字取自** `assembleCity()` 的 `createWalkGraph`（非另造替身）',
    createWalkGraph === createWalkGraphProd, `assembleCity 导出 ${typeof createWalkGraphProd} / 本文件 import ${typeof createWalkGraph}`);
  check('t21 口径②：registry 障碍必须 **严格多于** `layout.OBSTACLES` 基线（= 派生墙体层在册；恒真修复的根判据）',
    liveObstacles > baselineObstacles, `registry ${liveObstacles} 条 vs 基线 ${baselineObstacles} 条`);
  check('t21 口径③：生产 solver 实际入库障碍也必须 **严格多于** 基线（封死"无 registry 替身"回归）',
    solverObstacles > baselineObstacles, `solver ${solverObstacles} 条 vs 基线 ${baselineObstacles} 条`);
  check('t21 口径④：solver 入库数 === registry 在册数（证明测的是**同一份**生产装配，未走 `obstacles` 显式覆盖或宽松替身）',
    solverObstacles === liveObstacles, `solver ${solverObstacles} 条 vs registry ${liveObstacles} 条`);
  check('t21 敏感性实证：5 个区域全部**真装配**（缺失即 `assembleCity` 抛错，不会静默退化为无墙替身）',
    city.zones.size === 5, `区域 ${city.zones.size}`);
}

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
/* t153/F2：粗口径**不具权威性**（t146 裁定）⇒ 保留断言但**锁已登记伪影集合**（精确相等，非 `<=`）：新增粗口径命中仍会红。 */
const COARSE_KNOWN_DOORS = Object.freeze(['B-hall-mid', 'B-hall-rear']);
check(`粗口径（cellSize:2，非权威；仅锁 t146/t148 登记伪影）不可达集合必须 === 已登记集合（新增即红）`,
  realCoarse.length === COARSE_KNOWN_DOORS.length && realCoarse.every((x) => COARSE_KNOWN_DOORS.includes(x.id)), fmt(realCoarse));
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


/* ===== t153：⓪ 分量级护栏（**合取式**判据）=====
   判据 = `floorYAt(面中心) === 面自身 y`（t134 的“未被取高”，作用在**面中心**上）
        ∧ `componentOf(面中心, FP_ROUTE[0]).ok`（分量/结果级，t152）
   为何合取：单用分量判据时，修前**面中心点也落在主分量的低面**（如 ground 0.9）⇒ 对“连接格被高面取走”可能**恒绿**（与 t140 恒真护栏同族）。
   口径权威性（引 t146）：**细口径 `cellSize:1`（提额）= 唯一过关口径**；`cellSize:2` 因 3m/2m 格心下 1.05m 窄面可能不含格心而**不具权威性**（t146 裁定），
   其命中**只允许等于已登记的 7 处伪影集合**（逐条枚举，引 t146/t148）⇒ **任何新增粗口径命中仍会红**。 */
const isApproachFace = (w) => /-transition-\d+$/.test(w.id) || /-threshold$/.test(w.id) || /-door-passage$/.test(w.id);
const ownerOf = (id) => (id.match(/^WK-(.+?)-(?:transition|threshold|door-passage)/) ?? [null, id])[1];
const approachHits = (g, layout) => {
  const hits = [];
  for (const w of layout.WALKABLE.filter(isApproachFace)) {
    const c = { x: (w.bounds.minX + w.bounds.maxX) / 2, z: (w.bounds.minZ + w.bounds.maxZ) / 2 };
    const y = layout.floorYAt(c.x, c.z);
    const heightOk = y !== null && Math.abs(y - w.y) <= 0.5 + 1e-9;   // 未被更高面取高（t134 判据）
    const memb = g.componentOf(c.x, c.z, OUTSIDE).ok;                 // 与主户外分量同属一分量
    if (!(heightOk && memb)) {
      const coverer = layout.WALKABLE.filter((x) => x !== w && x.y > w.y + 1e-9
        && c.x >= x.bounds.minX && c.x <= x.bounds.maxX && c.z >= x.bounds.minZ && c.z <= x.bounds.maxZ)
        .map((x) => `${x.id}@${x.y}`).join(',') || '(无更高面覆盖 ⇒ 集群其他成员不在主分量)';
      hits.push(`${w.id}@y${w.y}（栋 ${ownerOf(w.id)}）中心解析 ${y === null ? 'null' : y.toFixed(2)}；覆盖者 ${coverer}`);
    }
  }
  return hits;
};
/* t146/t148 登记的 **cellSize:2 已知伪影集合**（逐条枚举；非权威口径，仅用于“新增即红”的护栏） */
const COARSE_KNOWN_ARTIFACTS = Object.freeze([
  'WK-B-hall-mid-door-passage@y2',
  'WK-B-hall-rear-door-passage@y1.8',
  'WK-B-hall-mid-transition-1@y1.5',
  'WK-B-hall-mid-transition-2@y1',
  'WK-B-hall-rear-transition-1@y1.35',
  'WK-B-hall-rear-transition-2@y0.9',
  'WK-B-hall-rear-transition-3@y0.45',
]);
{
  const f = approachHits(graphFine, LAYOUT);
  check('t153 ⓪ 分量级护栏（细口径=唯一过关口径，合取式）：94 条门外接近类面命中必须 === 0（精确；失败逐条打印面 id/y/栋/分歧证据）',
    f.length === 0, f.join(' | '));
  const cd = approachHits(graphCoarse, LAYOUT);
  const cdIds = cd.map((x) => x.split('（')[0]);
  check('t153 ⓪ 分量级护栏（粗口径=非权威，仅锁已登记伪影）：命中集合必须 === t146/t148 登记的 7 处（新增即红）',
    cdIds.length === COARSE_KNOWN_ARTIFACTS.length && cdIds.every((id) => COARSE_KNOWN_ARTIFACTS.includes(id)),
    `实际 ${cdIds.join(' , ')}`);
  const approachFaces = LAYOUT.WALKABLE.filter(isApproachFace).length;
  /* 三证 ③：B 两栋不假红 */
  const bFaces = LAYOUT.WALKABLE.filter((w) => /^WK-B-side-(west|east)-main-door-passage$/.test(w.id));
  const bHits = approachHits(graphFine, LAYOUT).filter((x) => /WK-B-side-(west|east)-main/.test(x));
  check('t153 三证‑③：`WK-B-side-{west,east}-main-door-passage` 不假红（边格被 tier2@3 覆盖却实际全局可达）',
    bFaces.length === 2 && bHits.length === 0, `faces=${bFaces.length} hits=${bHits.length}`);
  /* 三证 ②：修后全绿（当前树真实输出） */
  console.log(` - t153 三证‑②（修后全绿）：真实几何 LAYOUT ${LAYOUT.LAYOUT_VERSION} ⇒ 细口径命中 ${f.length} / 粗口径命中 ${cdIds.length}（已登记）`);
  console.log(` - t153 ⓪ 分量级护栏：门外接近类面 ${approachFaces} 条 · 细口径（唯一过关口径，${LAYOUT.LAYOUT_VERSION}）命中 ${f.length} / 粗口径（非权威）命中 ${cdIds.length}`);
}

console.log(`t140 结果：${failures === 0 ? '全部通过 ✓' : `失败 ${failures} 项`}`);
process.exit(failures === 0 ? 0 : 1);
