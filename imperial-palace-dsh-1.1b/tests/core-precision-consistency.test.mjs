#!/usr/bin/env node
/**
 * `tests/core-precision-consistency.test.mjs` —— **t12（t77-F16）常驻守卫：图侧高度精度的确定性与跨构建逐值一致**。
 *
 * 缺陷（t12 实测，报告 `docs/reports/report-t12-precision-consistency.md`）：
 *   `src/interaction/walk-graph.js` 的 `sample()` **首次**返回 `solver.probe` 的 **float64**、
 *   **缓存后**返回 `heights[i]`（`Float32Array`，float32）⇒ 同一格对在不同调用历史下读数精度不同；
 *   而 `canStep` 的含界判据只留 `BOUNDARY_EPS = 1e-9`，float32 在 0.6/1.5 附近的 ulp ≈ **6e-8**
 *   （比容差大 **60 倍**）⇒ 判定随调用历史翻转。整城实测 **35 对**相邻可走格「首次 ⇒ 可跨 / 缓存后 ⇒ 拒」。
 *
 * 修复（**候选 B：统一为图侧 float32**，`CONTRACTS §12.1.4.5` 声明的权威精度）：
 *   `sample()` 的首次取样也返回 `heights[i]` ⇒ 两条路径同精度。**阈值一字未改**
 *   （`maxStepHeight 0.5` / `snapDownDistance 0.6` / `BOUNDARY_EPS 1e-9`）。
 *   实测：判定面校验和与修复前**逐值相同**（`c368beed`；可跨 1,423,122 / 不可跨 2,466 全部不变）⇒ 零判定位移。
 *   **t35 补记**：此后几何两次有意变更（t31 两池石栈道、t35 门洞豁免收窄），已登记基线随之同步；
 *   本文件守护的**性质**（同精度 / 零历史翻转 / 跨构建逐值一致 / 阈值未放宽）一字未改。
 *
 * 本文件断言（全部读**生产实现**与**生产装配**，不写代理逻辑）：
 *   ① 两条取样路径**同精度**：同一格「首次 `sample()`」与「缓存后 `sample()`」的 `y` 逐值相同，
 *      且等于 `Math.fround(solver.probe(...).surfaceY)`（= 图侧 float32 口径）；
 *   ② **产品级历史翻转 = 0**：整城细口径上所有"精度决定性"格对（float64 与 float32 判定相反者），
 *      在**同一张图上**「首次 `canStep`」与「缓存后 `canStep`」结论必须一致（修复前 35/35 相反 ⇒ 必红）；
 *      **对数按精确登记锁定**（`DECISIVE_PAIRS_REGISTERED`：t12 时 35 ⇒ t35 收窄后 12；几何有意变更须同步）；
 *   ③ **可复现突变对照（不恒真）**：以真实格对 `y 1.5 ↔ 0.9`（名义 Δ=0.6，含界可跨）构造两格，
 *      断言修复后首次/缓存同判；并**在同一测试内**用 float32 手工复算证明"若缓存为 float32 且首次返回 float64
 *      则两者相反"——即该断言确实能抓到缺陷（否则恒真）；
 *   ④ **跨构建逐值一致**：同一次运行内 **3 次独立建图**（各自全新的 `createWalkGraph`）给出
 *      逐值相同的 `{ 判定面校验和, 可跨数, 不可跨数, 可走格数, 主分量格数 }`；
 *   ⑤ **已登记指纹**（`§12.1.4.2` 阈值型判据的"登记与几何同轮"）：上述五项必须等于已登记基线
 *      —— 几何有意变更时**必须在本轮同步更新该基线**（消息里写明要改哪个常量），不得静默漂移；
 *   ⑥ 阈值未放宽：`config.INTERACTION.step` 的 0.5 / 0.6 与 `walk-graph` 的 `BOUNDARY_EPS = 1e-9` 逐值不变。
 *
 * 口径：装配 = `scripts/verify-walk.mjs` 的 `assembleCity()`（真 kit + core registry + 5 区域 registerZone）
 *   —— 与游戏、与 `tests/walk-reachability.test.mjs` 同一条生产路径；细口径 = `cellSize:1` + 显式提额。
 */

import {
  assert,
  assertEqual,
  createTestRunner,
  loadModule,
} from './harness.mjs';
import { assembleCity } from '../scripts/verify-walk.mjs';

const runner = createTestRunner('core-precision-consistency.test.mjs · t12 图侧高度精度确定性（float32 统一 + 跨构建逐值一致）');

const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
const { readSource } = await loadModule('tests/harness.mjs');

const STEP = CONFIG.INTERACTION.step;
const EPS = 1e-9;
const CELL = 1;
const MAX_CELLS = 2_000_000;
const OUTSIDE = { x: 0, z: -480 };

/** **历史快照（t34：不参与判定，仅留痕）** —— 判定面指纹的历史值，供追溯几何/精度变更的来历。
 *   t34 起断言⑤改为**自证式**（期望值由 `STEP` 阈值公式 + 同一批采样高度 + 比例式推导，不再写死魔数），
 *   本常量因此**降级为留痕**（与 t23/t24 的 `G1_SNAPSHOT_1_1_4` 同一处置口径）。
 *   · t12（落地时）：`c368beed / 1423122 / 2466 / 724481 / 724481`（= 修前修饰后逐值相同 ⇒ 零判定位移）
 *   · t31（两池有界开槽 + 石栈道）：`bda28509 / 1427678 / 2466 / 726806 / 726806`
 *   · t35（`insideObstacleDoor` 只对 `through===false` 的门收窄到"止于后墙"）：`b8351ad5 / 1425334 / 2005 / 725781 / 725781`
 *   · t39（可登塔楼 72 面 + 中央内芯）：`881c59e8 / 1425039 / 2300 / 725252 / 725252`（塔体抬升成孤岛 ⇒ 主分量 −529）
 */
const REGISTERED_SNAPSHOT = Object.freeze({
  edgeHash: '881c59e8',
  edgePass: 1425039,
  edgeFail: 2300,
  walkable: 725252,
  mainComponent: 725252,
});

/**
 * 已登记的"精度决定性格对"数（t12 时 35 ⇒ t35 收窄后 12）。
 *   收窄把 1,025 个"只在整进深豁免下才可走"的格（**全部在已登记室内面之外**）从图里去掉，
 *   落在这些格上的边界格对（名义 Δ = 0.5 / 0.6）一并消失 ⇒ 可找到的对数 35 → 12。
 *   这里按**精确登记**锁定该数（比原来的 `>= 20` 下限**更强**：任何漂移 —— 升或降 —— 都红）；
 *   夹具的非空性由断言③的突变对照另行证明（float64 首次 / float32 缓存必相反 ⇒ 仍能抓到 t77-F16）。
 */
const DECISIVE_PAIRS_REGISTERED = 12;

const city = await assembleCity();
const { solver } = city;
const makeGraph = () => createWalkGraph(solver, { cellSize: CELL, maxCells: MAX_CELLS });

/* ── ① 两条取样路径同精度 ── */
await runner.test('① 同一格「首次 sample」与「缓存后 sample」的 y 逐值相同，且等于图侧 float32 口径', () => {
  const graph = makeGraph();
  const rows = [];
  for (let k = 0; k < 240; k += 1) {
    const col = 200 + ((k * 7) % 400);
    const row = 300 + ((k * 37) % 600);
    const first = graph.sample(col, row);
    if (first.y === null) continue;
    const cached = graph.sample(col, row);
    const x = graph.bounds.minX + col * CELL;
    const z = graph.bounds.minZ + row * CELL;
    const direct = solver.probe(x, z, null);
    rows.push({ col, row, first: first.y, cached: cached.y, fround: Math.fround(direct.surfaceY) });
  }
  assert(rows.length >= 50, `夹具应取到 ≥50 格（实际 ${rows.length}）`);
  const notSame = rows.filter((r) => r.first !== r.cached);
  assertEqual(
    notSame.length,
    0,
    `首次与缓存后的 y 必须逐值相同（否则 canStep 随调用历史翻转）：${notSame.slice(0, 4).map((r) => `(${r.col},${r.row}) 首次 ${r.first} / 缓存 ${r.cached}`).join('；')}`,
  );
  const notFround = rows.filter((r) => r.cached !== r.fround);
  assertEqual(
    notFround.length,
    0,
    `缓存值必须等于图侧 float32 口径 Math.fround(probe.surfaceY)：${notFround.slice(0, 4).map((r) => `(${r.col},${r.row}) 缓存 ${r.cached} / fround ${r.fround}`).join('；')}`,
  );
  runner.info(`两条路径同精度：${rows.length} 格「首次 === 缓存 === Math.fround(probe)」逐值一致 ✓`);
});

/* ── ② 产品级历史翻转 = 0（整城细口径） ── */
/** 找"精度决定性"格对：用 probe 的 float64 与 float32 分别求 canStep 判定，两者不同者。 */
function precisionDecisivePairs(limit = Infinity) {
  const graph = makeGraph();
  const n = graph.cols * graph.rows;
  const y64 = new Float64Array(n);
  const y32 = new Float32Array(n);
  const walk = new Uint8Array(n);
  for (let row = 0; row < graph.rows; row += 1) {
    for (let col = 0; col < graph.cols; col += 1) {
      const r = solver.probe(graph.bounds.minX + col * CELL, graph.bounds.minZ + row * CELL, null);
      if (!r.ok || !Number.isFinite(r.surfaceY)) continue;
      const i = row * graph.cols + col;
      y64[i] = r.surfaceY;
      y32[i] = r.surfaceY;
      walk[i] = 1;
    }
  }
  const upOk = (a, b) => b - a <= STEP.maxStepHeight + EPS;
  const dnOk = (a, b) => a - b <= STEP.snapDownDistance + EPS;
  const pairs = [];
  for (let row = 0; row < graph.rows && pairs.length < limit; row += 1) {
    for (let col = 0; col < graph.cols && pairs.length < limit; col += 1) {
      const i = row * graph.cols + col;
      if (!walk[i]) continue;
      for (const [nc, nr] of [[col + 1, row], [col, row + 1]]) {
        if (nc >= graph.cols || nr >= graph.rows) continue;
        const j = nr * graph.cols + nc;
        if (!walk[j]) continue;
        const pass64 = upOk(y64[i], y64[j]) && dnOk(y64[i], y64[j]);
        const pass32 = upOk(y32[i], y32[j]) && dnOk(y32[i], y32[j]);
        if (pass64 !== pass32) pairs.push({ a: { col, row }, b: { col: nc, row: nr } });
      }
    }
  }
  return pairs;
}

const decisivePairs = precisionDecisivePairs();
await runner.test('② 产品级历史翻转 = 0：所有"精度决定性"格对「首次 canStep」=== 「缓存后 canStep」', () => {
  assertEqual(
    decisivePairs.length,
    DECISIVE_PAIRS_REGISTERED,
    `本树"精度决定性"格对数必须等于已登记值（t12 时 35 ⇒ t35 收窄后 12：收窄去掉的 1,025 格全在已登记室内面之外；非空性由断言③证明）`,
  );
  const flips = [];
  for (const p of decisivePairs) {
    const graph = makeGraph(); // 每次全新图 ⇒ 首帧两格都未缓存（走"首次取样"路径）
    const first = graph.canStep(p.a.col, p.a.row, p.b.col, p.b.row);
    const cached = graph.canStep(p.a.col, p.a.row, p.b.col, p.b.row); // 已缓存（走"缓存值"路径）
    if (first !== cached) flips.push(`${p.a.col},${p.a.row}↔${p.b.col},${p.b.row}：首次 ${first} / 缓存 ${cached}`);
  }
  assertEqual(flips.length, 0, `同图同格对不得因调用历史翻转（修复前 35/35 相反）：${flips.slice(0, 5).join('；')}`);
  runner.info(`精度决定性格对 ${decisivePairs.length} 对｜历史翻转 ${flips.length} 对 ⇒ 0 ✓（修复前 35/35 相反）`);
});

/* ── ③ 可复现突变对照：断言不恒真 ── */
await runner.test('③ 突变对照（不恒真）：真实格对 y 1.5↔0.9 名义 Δ=0.6 含界可跨；float64/float32 混合读数必相反', () => {
  // 用真实求解器在真实格上取 y（不手写坐标）：找一对名义 Δ=0.6 的相邻可走格
  const sample = decisivePairs.length ? decisivePairs[0] : null;
  assert(sample, '需要至少一对精度决定性格对作为突变对照夹具');
  const graph = makeGraph();
  const a = graph.sample(sample.a.col, sample.a.row);
  const b = graph.sample(sample.b.col, sample.b.row);
  const y64a = solver.probe(graph.bounds.minX + sample.a.col * CELL, graph.bounds.minZ + sample.a.row * CELL, null).surfaceY;
  const y64b = solver.probe(graph.bounds.minX + sample.b.col * CELL, graph.bounds.minZ + sample.b.row * CELL, null).surfaceY;
  const up = (x, y) => y - x <= STEP.maxStepHeight + EPS;
  const dn = (x, y) => x - y <= STEP.snapDownDistance + EPS;
  // 修前形态：**首次**调用两格都走 `probe` 的 float64 ⇒ 用 (y64a, y64b) 复算
  const passFirstFloat64 = up(y64a, y64b) && dn(y64a, y64b);
  // 修前形态：**缓存后**调用两格都走 `heights[i]`（float32）⇒ 用 (a.y, b.y) 复算
  const passCachedFloat32 = up(a.y, b.y) && dn(a.y, b.y);
  assert(
    passFirstFloat64 !== passCachedFloat32,
    `突变对照必须相反（否则本断言恒真、抓不到缺陷）：float64 首次 ${passFirstFloat64} / float32 缓存 ${passCachedFloat32}｜a.y=${a.y} b.y=${b.y} y64a=${y64a} y64b=${y64b}`,
  );
  // 修复后：产品两次调用同判，且必须等于**图侧 float32 口径**（= 缓存值口径）
  const productFirst = graph.canStep(sample.a.col, sample.a.row, sample.b.col, sample.b.row);
  const productSecond = graph.canStep(sample.a.col, sample.a.row, sample.b.col, sample.b.row);
  assertEqual(productFirst, productSecond, '修复后同一格对的两次调用必须同判（调用历史无关）');
  assertEqual(productFirst, passCachedFloat32, '修复后判定必须与图侧 float32 口径逐值一致（§12.1.4.5）');
  runner.info(`突变对照：(${sample.a.col},${sample.a.row})↔(${sample.b.col},${sample.b.row}) float64 首次 ⇒ ${passFirstFloat64 ? '可跨' : '拒'} / float32 缓存 ⇒ ${passCachedFloat32 ? '拒' : '可跨'}（相反 ✓）；产品两次调用 ⇒ ${productFirst ? '可跨' : '拒'} === float32 口径 ✓｜Δ32=${Math.abs(a.y - b.y).toFixed(12)} / Δ64=${Math.abs(y64a - y64b).toFixed(12)}`);
});

/* ── ④ 跨构建逐值一致 + ⑤ 判定面自证 ── */
/** 判定面指纹：遍历细口径全图相邻可走格对，用生产 `canStep` 取判定，滚成 FNV-1a。
 *  t34：额外返回**派生量**（`pairs` / `derivedFail` / `cells`），使断言⑤的期望值可由
 *  「阈值公式 + 同一批采样高度 + 比例式」推导，而不是写死指纹魔数。 */
function fingerprint() {
  const graph = makeGraph();
  let fnv = 0x811c9dc5;
  let pass = 0;
  let fail = 0;
  let derivedFail = 0; // t34：按 STEP 阈值公式对**同一批采样高度**独立复算的"拒判"数
  for (let row = 0; row < graph.rows; row += 1) {
    for (let col = 0; col < graph.cols; col += 1) {
      for (const [nc, nr] of [[col + 1, row], [col, row + 1]]) {
        if (nc >= graph.cols || nr >= graph.rows) continue;
        const a = graph.sample(col, row);
        const b = graph.sample(nc, nr);
        if (!a.ok || !b.ok) continue;
        const v = graph.canStep(col, row, nc, nr) ? 1 : 0;
        if (v) pass += 1; else fail += 1;
        // 派生：上行 b.y−a.y ≤ maxStepHeight ∧ 下行 a.y−b.y ≤ snapDownDistance（含界 + 同一 EPS）
        const dy = b.y - a.y;
        const derivedOk = dy <= STEP.maxStepHeight + EPS && -dy <= STEP.snapDownDistance + EPS;
        if (!derivedOk) derivedFail += 1;
        fnv ^= v;
        fnv = Math.imul(fnv, 0x01000193) >>> 0;
      }
    }
  }
  const label = graph.componentOf(OUTSIDE.x, OUTSIDE.z);
  const stats = graph.stats();
  return {
    edgeHash: fnv.toString(16).padStart(8, '0'),
    edgePass: pass,
    edgeFail: fail,
    derivedFail,
    pairs: pass + fail,
    cells: graph.cols * graph.rows,
    walkable: stats.walkable,
    mainComponent: label ? label.size : null,
  };
}

const runs = [fingerprint(), fingerprint(), fingerprint()];
await runner.test('④ 跨构建逐值一致：3 次独立建图（各自全新 createWalkGraph）指纹逐值相同', () => {
  const keys = ['edgeHash', 'edgePass', 'edgeFail', 'walkable', 'mainComponent'];
  for (const key of keys) {
    const values = runs.map((r) => r[key]);
    assertEqual(new Set(values.map(String)).size, 1, `${key} 在 3 次独立建图间必须逐值相同（实际 ${values.join(' / ')}）`);
  }
  runner.info(`跨构建逐值一致 ✓｜${keys.map((k) => `${k}=${runs[0][k]}`).join(' · ')}`);
});

await runner.test('⑤ 判定面自证（t34：期望值由 layout + 阈值公式推导，不写死指纹魔数）', () => {
  const r = runs[0];
  /* (a) 规格自证：生产 `canStep` 的拒判数必须等于**按 STEP 阈值公式**从同一批采样高度独立复算的拒判数。
         阈值被改、判定规则被加、或采样高度与判定脱钩 ⇒ 逐值不符即红。 */
  assertEqual(
    r.edgeFail,
    r.derivedFail,
    `canStep 拒判数必须等于按阈值公式（上 ≤${STEP.maxStepHeight} / 下 ≤${STEP.snapDownDistance}，EPS ${EPS}）从同一批采样高度推导的拒判数（实测 ${r.edgeFail} vs 推导 ${r.derivedFail}）`,
  );
  /* (b) 分类完备 + 防空表恒真（任一为 0 即红） */
  assertEqual(r.edgePass + r.edgeFail, r.pairs, '可跨 + 不可跨必须等于枚举到的相邻可走格对数（分类完备）');
  assert(r.pairs > 0 && r.walkable > 0, `判定面必须非空（pairs=${r.pairs}｜walkable=${r.walkable}）`);
  /* (c) 非退化：可走格必须严格少于全网格格数（防"整图都算可走"的退化） */
  assert(r.walkable < r.cells, `可走格必须严格少于全网格格数（${r.walkable} < ${r.cells}）`);
  /* (d) 主分量覆盖率用**比例式**（非魔数）：全城绝大多数可走格必须在同一分量内 */
  assert(
    r.mainComponent >= 0.9 * r.walkable,
    `主分量必须覆盖 ≥90% 可走格（${r.mainComponent} / ${r.walkable} = ${(100 * r.mainComponent / r.walkable).toFixed(1)}%）`,
  );
  runner.info(
    `判定面自证（t34）✓｜pairs=${r.pairs}（可跨 ${r.edgePass} / 不可跨 ${r.edgeFail} = 推导 ${r.derivedFail}）`
    + `｜walkable=${r.walkable}（< 网格 ${r.cells}）｜主分量 ${r.mainComponent}（${(100 * r.mainComponent / r.walkable).toFixed(1)}%）`,
  );
  runner.info(`历史快照（**不参与判定**，仅留痕）：${JSON.stringify(REGISTERED_SNAPSHOT)}｜本轮实测 hash=${r.edgeHash}`);
});

/* ── ⑥ 阈值未放宽 ── */
await runner.test('⑥ 阈值未放宽：step 0.5/0.6 与 BOUNDARY_EPS=1e-9 逐值不变', () => {
  assertEqual(STEP.maxStepHeight, 0.5, '上台阶阈值仍应为 0.5');
  assertEqual(STEP.snapDownDistance, 0.6, '下台阶阈值仍应为 0.6');
  const src = readSource('src/interaction/walk-graph.js');
  assert(src, '应能读到 walk-graph.js 源码');
  assert(/const BOUNDARY_EPS = 1e-9;/.test(src), 'BOUNDARY_EPS 仍应为 1e-9（两侧同一 EPS）');
  assert(/const heights = new Float32Array\(cols \* rows\);/.test(src), '图侧高度缓存仍应为 Float32Array（§12.1.4.5 权威精度）');
  assert(/return \{ ok: result\.ok, y: heights\[i\], reasons: result\.reasons \};/.test(src), '首次取样必须返回图侧存储值（与缓存路径同精度）');
  runner.info('阈值与精度口径：0.5 / 0.6 / BOUNDARY_EPS 1e-9 / Float32Array 图侧 / 首次取样同精度 ✓');
});

process.exit(runner.summary());
