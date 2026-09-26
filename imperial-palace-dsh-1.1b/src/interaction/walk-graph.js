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
  const heights = new Float32Array(cols * rows);
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
    return { ok: result.ok, y: result.surfaceY, reasons: result.reasons };
  }

  /** 相邻两格是否可通行（共用台阶阈值语义）。 */
  function canStep(col, row, nextCol, nextRow) {
    const a = sample(col, row);
    const b = sample(nextCol, nextRow);
    if (!a.ok || !b.ok || a.y === null || b.y === null) return false;
    if (b.y - a.y > step.maxStepHeight + EPS) return false;
    if (b.y - a.y < -step.snapDownDistance) return false;
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
    const { parents, visited } = flood(start);
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
    const anchors = points.map((p) => nearestCell(p.x, p.z)).filter(Boolean);
    if (anchors.length !== points.length) {
      return { ok: false, reason: '部分点不在可行走栅格上', anchors, visited: 0 };
    }
    const { parents, visited } = flood(anchors[0]);
    const unreachable = [];
    anchors.forEach((anchor, i) => {
      if (parents[index(anchor.col, anchor.row)] === -2) unreachable.push({ index: i, point: points[i], anchor });
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

  return {
    cols,
    rows,
    cellSize,
    bounds: area,
    sample,
    canStep,
    nearestCell,
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
