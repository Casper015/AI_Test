/**
 * 可行走图（诊断/验证用）：把 `createWalkSolver` 的可走性判定栅格化，回答
 * "A 点能否走到 B 点"（计划 §6.4 完整走查路线必须可通）。
 *
 * 用途：
 *   1. `tests/interaction.test.mjs` 用它证明 `layout.FP_ROUTE` 的 9 个路点属于**同一个连通分量**
 *      （直线上有建筑/假山时，真实玩家会绕行，因此必须用图搜索而不是直线推演）；
 *   2. 挂载时校验 fp-spawn 出生点是否落在主连通分量上，否则给出可见提示（不静默）。
 *
 * 与 `walk-solver` 共用同一套参数：台阶阈值、包络夹取、障碍集合，不重复实现判定。
 */

import { CONFIG } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';

const EPS = 1e-6;
/** t142：台阶阈值含等号（契约）；容差仅吸收浮点噪声，与 core/walk-solver 同值。 */
const BOUNDARY_EPS = 1e-9;

/**
 * 构造栅格可行走图。
 * @param {{ probe: Function, groundAt: Function }} solver
 * @param {{ cellSize?: number, layout?: object, config?: object, bounds?: object, maxCells?: number }} [options]
 */
export function createWalkGraph(solver, { layout = LAYOUT, cellSize = 4, bounds = null, maxCells = 400000, config = CONFIG } = {}) {
  // 默认覆盖外侧地形全域（= 包络夹取范围）：桥面、岸台、护城河外引道都在图内
  const area = bounds ?? {
    minX: layout.TERRAIN_EXTENT.minX,
    maxX: layout.TERRAIN_EXTENT.maxX,
    minZ: layout.TERRAIN_EXTENT.minZ,
    maxZ: layout.TERRAIN_EXTENT.maxZ,
  };
  const step = config.INTERACTION.step;
  const cols = Math.ceil((area.maxX - area.minX) / cellSize) + 1;
  const rows = Math.ceil((area.maxZ - area.minZ) / cellSize) + 1;
  if (cols * rows > maxCells) throw new Error(`可行走图规模过大：${cols}×${rows} > ${maxCells}`);

  /** 单元缓存：-1 未知 / 0 不可走 / 1 可走。 */
  const cells = new Int8Array(cols * rows).fill(-1);
  /**
   * 格高缓存。**t12（t77-F16）：两条取样路径必须同精度** ——
   * 精度口径 = **图侧 `Float32Array`**（`CONTRACTS §12.1.4.5`「可跨判定以图侧存储精度为准」），
   * 因此 `sample()` 的**首次取样也返回 `heights[i]`**（见该函数内注释），不再返回 `probe` 的 float64。
   *
   * 旧缺陷（实测证据 `scripts/probe-precision-consistency.mjs` / `work/precision-consistency/`）：
   *   `sample()` 首次返回 `solver.probe` 的 **float64**、缓存后返回 **float32** ⇒ 同一格对在
   *   "首次调用"与"缓存后调用"下拿到不同高度；而 `canStep` 的含界判据只留 `BOUNDARY_EPS = 1e-9`，
   *   float32 在 0.6/1.5 附近的 ulp ≈ **6e-8**（比容差大 60 倍）⇒ 判定**随调用历史翻转**。
   *   整城实测：**35 对**相邻可走格「首次 ⇒ 可跨 / 缓存后 ⇒ 拒」（全部是设计好的 0.6 下行级差，
   *   如 `y 1.5 ↔ 0.9`：float64 Δ=0.6 含界可跨，float32 Δ=0.600000023842 > 0.6 被拒）。
   *   这正是 `report-completeness.md` t77-F16 登记的"±1~2 项不稳定"。
   *
   * 修法选择（实测择优，见报告）：**统一为图侧 float32**（本节候选 B）而不是把 `heights` 改 `Float64Array`（候选 A）。
   *   · 候选 B：判定面校验和与修复前**逐值相同**（`c368beed`，可跨 1,423,122 / 不可跨 2,466 全部不变）⇒ 零判定位移；
   *   · 候选 A（Float64）：整城 +35 条 0.6 下行边由"双向拒"变"仅下行可跨"，`interaction.test` 的
   *     **F27 过渡带双向审计**在 `cellSize:3` 粗口径上由绿转红（C 侧两配房梯链 1.5/1.2/0.9 的中间级被 3m 网格跳过 ⇒
   *     0.9↔1.5 直接相邻成 0.6 单向）⇒ 需先补几何/改粗口径登记，超出本卡范围（已上报）。
   *   · **阈值一字未改**：`maxStepHeight 0.5` / `snapDownDistance 0.6` / `BOUNDARY_EPS 1e-9`（两侧同一 EPS）。
   */
  const heights = new Float32Array(cols * rows);
  let labelCache = null; // t148：componentOf 的全图标注缓存（图不可变 ⇒ 可复用）
  const index = (col, row) => row * cols + col;
  const toCol = (x) => Math.round((x - area.minX) / cellSize);
  const toRow = (z) => Math.round((z - area.minZ) / cellSize);
  const worldX = (col) => area.minX + col * cellSize;
  const worldZ = (row) => area.minZ + row * cellSize;

  function sample(col, row) {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return { ok: false, y: null, reasons: ['outOfGrid'] };
    const i = index(col, row);
    if (cells[i] !== -1) return { ok: cells[i] === 1, y: heights[i], reasons: [] };
    const x = worldX(col);
    const z = worldZ(row);
    const result = solver.probe(x, z, null);
    cells[i] = result.ok ? 1 : 0;
    heights[i] = result.surfaceY ?? NaN;
    /**
     * t12（t77-F16）：**返回图侧存储值**（与缓存分支 `return { ok: cells[i] === 1, y: heights[i] }` 同精度）。
     * 旧实现此处返回 `result.surfaceY`（float64）⇒ 同一格"首次 float64 / 缓存 float32"，
     * 使 `canStep` 的含界判据随调用历史翻转（详见 `heights` 声明处注释）。
     */
    return { ok: result.ok, y: heights[i], reasons: result.reasons };
  }

  /** 相邻两格是否可通行（共用台阶阈值语义）。 */
  function canStep(col, row, nextCol, nextRow) {
    const a = sample(col, row);
    const b = sample(nextCol, nextRow);
    if (!a.ok || !b.ok || a.y === null || b.y === null) return false;
    if (b.y - a.y > step.maxStepHeight + BOUNDARY_EPS) return false; // t142：含界（恰等阈值可跨）
    if (a.y - b.y > step.snapDownDistance + BOUNDARY_EPS) return false; // t142：含界（恰等阈值可跨）
    return true;
  }

  /** 最近可走格（把任意世界坐标吸附到图上）。 */
  function nearestCell(x, z, radiusCells = 6) {
    const col = toCol(x);
    const row = toRow(z);
    let best = null;
    let bestDist = Infinity;
    for (let dc = -radiusCells; dc <= radiusCells; dc += 1) {
      for (let dr = -radiusCells; dr <= radiusCells; dr += 1) {
        const c = col + dc;
        const r = row + dr;
        const s = sample(c, r);
        if (!s.ok) continue;
        const dist = Math.hypot(worldX(c) - x, worldZ(r) - z);
        if (dist < bestDist) {
          bestDist = dist;
          best = { col: c, row: r };
        }
      }
    }
    return best ? { ...best, distance: bestDist } : null;
  }

  /** 广度优先：从起点出发的可达集合（返回 Int32Array 父指针 + 访问顺序）。 */
  function flood(start) {
    const parents = new Int32Array(cols * rows).fill(-2);
    const startIndex = index(start.col, start.row);
    parents[startIndex] = -1;
    const queue = [startIndex];
    let head = 0;
    let visited = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      visited += 1;
      const col = current % cols;
      const row = Math.floor(current / cols);
      const neighbours = [
        [col + 1, row],
        [col - 1, row],
        [col, row + 1],
        [col, row - 1],
      ];
      for (const [nc, nr] of neighbours) {
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = index(nc, nr);
        if (parents[ni] !== -2) continue;
        if (!canStep(col, row, nc, nr)) continue;
        parents[ni] = current;
        queue.push(ni);
      }
    }
    return { parents, visited, queue };
  }

  /** 起点→终点的最短路径（世界坐标折线）。 */
  function path(from, to) {
    const start = nearestCell(from.x, from.z);
    const goal = nearestCell(to.x, to.z);
    if (!start || !goal) return { ok: false, reason: 'noCell', path: [] };
    const { parents, visited } = labelAll({ x: from.x, z: from.z }); // t156：复用按锚点缓存的标注（同一 flood ⇒ 与原来逐值相同）
    const goalIndex = index(goal.col, goal.row);
    if (parents[goalIndex] === -2) return { ok: false, reason: 'unreachable', path: [], visited, start, goal };
    const nodes = [];
    let cursor = goalIndex;
    while (cursor !== -1 && cursor !== -2) {
      nodes.push(cursor);
      cursor = parents[cursor];
    }
    nodes.reverse();
  
  return {
      ok: true,
      visited,
      cells: nodes.length,
      length: +(nodes.length * cellSize).toFixed(1),
      path: nodes.map((i) => ({ x: worldX(i % cols), z: worldZ(Math.floor(i / cols)), y: heights[i] })),
    };
  }

  /** 一组世界坐标点是否同属一个连通分量。 */
  function connected(points) {
    // t156（F11）：与 `path()` **同口径** —— 同一 `flood(首点)` + 逐点 `parents[idx] !== -2`。
    //   旧实现的根因：整集守卫 `anchors.length !== points.length ⇒ ok:false` 会把"个别点取不到最近格"
    //   误报成"整组不连通"（74/94 点一次性调用时的 4 点假红），而 `path()` 逐点判定 ⇒ 两条 API 答案不一致。
    //   判据强度不变：任一取不到格 / 不同分量 ⇒ `ok:false`。
    const list = Array.isArray(points) ? points : [];
    if (list.length === 0) return { ok: false, reason: '空点集', anchors: [], unreachable: [], visited: 0 };
    const startCell = nearestCell(list[0].x, list[0].z);
    if (!startCell) {
      return { ok: false, reason: '起点不在可行走栅格上', anchors: [null], unreachable: [{ index: 0, point: list[0], reason: 'noCell' }], visited: 0 };
    }
    const { parents, visited } = labelAll(list[0]);
    const anchors = [];
    const unreachable = [];
    list.forEach((p, i) => {
      const cell = nearestCell(p.x, p.z);
      anchors.push(cell);
      if (!cell) {
        unreachable.push({ index: i, point: p, reason: 'noCell' });
        return;
      }
      if (parents[index(cell.col, cell.row)] === -2) unreachable.push({ index: i, point: p, anchor: cell, reason: 'differentComponent' });
    });
    return { ok: unreachable.length === 0, visited, anchors, unreachable };
  }

  /**
   * t87：**逆向 BFS**（沿反向边遍历）= "哪些格子能走回起点"。
   * 与 `flood`（正向可达）配对即可得出单向陷阱：`正向可达 ∧ ¬能返回`。
   * 注意 `canStep` 是**有向**的（上台阶 0.5 / 下台阶 0.6 的阈值不对称），因此必须真做逆向遍历，
   * 不能假设图无向。
   */
  function reverseFlood(start) {
    const reaches = new Uint8Array(cols * rows);
    const startIndex = index(start.col, start.row);
    reaches[startIndex] = 1;
    const queue = [startIndex];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      const col = current % cols;
      const row = Math.floor(current / cols);
      const neighbours = [
        [col + 1, row],
        [col - 1, row],
        [col, row + 1],
        [col, row - 1],
      ];
      for (const [nc, nr] of neighbours) {
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = index(nc, nr);
        if (reaches[ni]) continue;
        // 反向边：邻居 → 当前
        if (!canStep(nc, nr, col, row)) continue;
        reaches[ni] = 1;
        queue.push(ni);
      }
    }
    return { reaches, visited: queue.length };
  }

  /** 单元格世界坐标（含面高；不可走格的面高为 NaN）。 */
  function worldAt(col, row) {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    const i = index(col, row);
    return { col, row, index: i, x: worldX(col), z: worldZ(row), y: heights[i], ok: cells[i] === 1 };
  }

  /** 世界坐标 → 最近格坐标（不做吸附搜索，仅取整）。 */
  function toCell(x, z) {
    const col = toCol(x);
    const row = toRow(z);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    return { col, row, index: index(col, row) };
  }

  /** 遍历所有已采样为可走的格。 */
  function forEachWalkable(visit) {
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] !== 1) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      visit({ col, row, index: i, x: worldX(col), z: worldZ(row), y: heights[i] });
    }
  }

  /**
   * t148：**连通分量访问器**（纯暴露，零行为变更）。
   * 复用内部 `flood`/`nearestCell`：首次调用时做 **1 次** `flood(全图标注)`，之后每次调用 O(1)。
   * 返回 `{ ok, cell, root, size }`：`ok` = 该点有最近格且与 `from`（默认起点 0,-480 之外）同属一个分量…
   * 说明：`root/size` 来自**同一次 flood**，`path()` 的行为与耗时特征**不变**（未改其实现）。
   */
  function labelAll(from = null) {
    const anchor = nearestCell(from?.x ?? 0, from?.z ?? -480);
    if (!anchor) return null;
    if (labelCache && labelCache.anchor.col === anchor.col && labelCache.anchor.row === anchor.row) return labelCache;
    const { parents, visited } = flood(anchor);
    labelCache = { anchor, parents, visited };
    return labelCache;
  }
  function componentOf(x, z, from = null) {
    const cell = nearestCell(x, z);
    if (!cell) return { ok: false, cell: null, root: null, size: 0 };
    const cache = labelAll(from);
    if (!cache) return { ok: false, cell, root: null, size: 0 };
    const parent = cache.parents[index(cell.col, cell.row)];
    return { ok: parent !== -2, cell, root: parent === -2 ? null : parent, size: cache.visited };
  }

  return {
    cols,
    rows,
    cellSize,
    bounds: area,
    sample,
    canStep,
    nearestCell,
    componentOf, // t148：连通分量访问器（1 次 flood 标注 + O(1) 成员判定）
    flood,
    reverseFlood,
    worldAt,
    toCell,
    forEachWalkable,
    path,
    connected,
    stats() {
      let walkable = 0;
      for (let i = 0; i < cells.length; i += 1) if (cells[i] === 1) walkable += 1;
      return {
        cols,
        rows,
        cellSize,
        cells: cols * rows,
        walkable,
        sampled: [...cells].filter((v) => v !== -1).length,
        // t88：本图的可走性全部经由 `solver.probe → groundAt`，因此**继承**
        // `layout.CONNECTORS` 的坡道/台阶过渡面；这里把消费情况一并报出（图不再对 connector 零引用）。
        connectors: typeof solver.connectorStats === 'function' ? solver.connectorStats() : null,
        connectorDeclared: Array.isArray(layout.CONNECTORS) ? layout.CONNECTORS.length : 0,
      };
    },
  };
}

export default createWalkGraph;
