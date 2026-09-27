/**
 * 通行性审计与"防卡死/防单向陷阱"守卫（t87 / T7.5，用户需求："修改一下空气墙，让我不会卡在什么奇奇怪怪的地方"）。
 *
 * 本模块把 `createWalkSolver` 的判定栅格化（复用 `createWalkGraph` 的 `probe`/`canStep`，不重复实现判据），
 * 然后回答四类"糟糕的阻挡"：
 *   ① **单向陷阱**（进得去、出不来）：正向可达 ∧ ¬逆向可返回的格子；
 *   ② **净宽不足的缝**：门洞/通道面的净宽 < 玩家直径 + 余量（依据 `config.INTERACTION.player.radius`）；
 *   ③ **空气墙**（视觉开放却整足迹阻挡）：`blocks:'all'` 且语义上"四面开敞"的构筑物（亭/廊/院门）；
 *   ④ **单向高差**：上下阈值不对称造成的"能下不能上"的边（`maxStepHeight` < Δy ≤ `snapDownDistance`）。
 *
 * 修复原则（主理人定调）：
 *   · 宁可禁止进入，也不允许"进得去出不来" ⇒ `guardStep()` 拒绝踏进陷阱格（不改任何碰撞数据）；
 *   · 视觉开放的东西要么能进、要么给出**可见提示** ⇒ `airWalls` 清单交 UI 出提示（数据不可改，故取"提示"分支）；
 *   · 不放宽任何判据、不删障碍/可行走面 ⇒ 本模块**只读** layout 数据，只做"拒绝进入"这一种更强的约束。
 *
 * ⚠ 本模块不得修改 `layout` / `registry`（越界）。根因若在碰撞数据，量化后交回主理人派单。
 */

import { CONFIG } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
import { createWalkGraph } from './walk-graph.js';

const EPS = 1e-6;

/** 玩家可通行所需的净宽余量（除直径外的两侧各留 0.15m）——见 `requiredPassageWidth()`。 */
export const PASSAGE_MARGIN = 0.15;

/** 净宽判据：玩家直径 + 两侧余量。 */
export function requiredPassageWidth(config = CONFIG) {
  const radius = config.INTERACTION.player.radius;
  return +(radius * 2 + PASSAGE_MARGIN * 2).toFixed(2);
}

/**
 * 构造通行性审计器。
 * @param {{ solver: object, layout?: object, config?: object, cellSize?: number, start?: {x:number,z:number} }} options
 */
export function createTraversalAudit({ solver, layout = LAYOUT, config = CONFIG, cellSize = 2, start = null } = {}) {
  const graph = createWalkGraph(solver, { layout, config, cellSize });
  const radius = config.INTERACTION.player.radius;
  const step = config.INTERACTION.step;
  const cellCount = graph.cols * graph.rows;

  /**
   * 三个场（起点/正向可达/逆向可返回）**惰性求解**：
   * `probe` 采样是唯一的重活（≈每格一次障碍迭代），生产环境用 `warmupStep()` 分帧预热，
   * 避免挂载时一次性卡顿；测试里 `ensureFields()` 直接一次算完。
   */
  let anchor = null;
  let forward = null;
  let backward = null;
  function ensureFields() {
    if (forward && backward) return { anchor, forward, backward };
    const startPoint = start ?? { x: 0, z: -480 };
    anchor = anchor ?? graph.nearestCell(startPoint.x, startPoint.z) ?? graph.nearestCell(0, 0);
    if (!anchor) throw new Error('通行性审计：找不到任何可行走格作为起点（地形/可行走面数据异常）');
    forward = graph.flood(anchor);
    backward = graph.reverseFlood(anchor);
    return { anchor, forward, backward };
  }

  /** 分帧预热：每调用一次采样 `rows` 行（返回进度）。全部采完后首次 `ensureFields()` 只花 BFS 的 O(格数)。 */
  let warmupRow = 0;
  function warmupStep({ rows = 20 } = {}) {
    const end = Math.min(graph.rows, warmupRow + rows);
    for (let row = warmupRow; row < end; row += 1) {
      for (let col = 0; col < graph.cols; col += 1) graph.sample(col, row);
    }
    warmupRow = end;
    return { done: warmupRow >= graph.rows, sampledRows: warmupRow, totalRows: graph.rows };
  }

  /** 通行性统计（闭包内实现，`warmupAll`/对外 `stats()` 共用）。 */
  function computeStats() {
    if (forward === null || backward === null) {
      let walkable = 0;
      for (let col = 0; col < graph.cols; col += 1) {
        for (let row = 0; row < warmupRow; row += 1) {
          if (graph.worldAt(col, row)?.ok) walkable += 1;
        }
      }
      return { cellSize, cols: graph.cols, rows: graph.rows, walkable, sampledRows: warmupRow, ready: false };
    }
    let main = 0;
    let trap = 0;
    let sealed = 0;
    let walkable = 0;
    for (let i = 0; i < cellCount; i += 1) {
      if (graph.worldAt(i % graph.cols, Math.floor(i / graph.cols))?.ok !== true) continue;
      walkable += 1;
      const region = regionOfIndex(i);
      if (region === 'main') main += 1;
      else if (region === 'trap') trap += 1;
      else sealed += 1;
    }
    return { cellSize, cols: graph.cols, rows: graph.rows, walkable, main, trap, sealed, anchor: ensureFields().anchor, ready: true };
  }

  /** 预热 + 求解一次到位（测试/审计用）。 */
  function warmupAll() {
    while (!warmupStep({ rows: Math.max(1, graph.rows) }).done) {
      /* 一次到位 */
    }
    ensureFields();
    return computeStats();
  }

  /** 格状态：'main'（进出皆可）/ 'trap'（进得去出不来）/ 'sealed'（根本进不去）/ 'blocked'（不可走）。 */
  function regionOfIndex(i) {
    const fields = ensureFields();
    const reachable = fields.forward.parents[i] !== -2;
    const returnable = fields.backward.reaches[i] === 1;
    if (reachable && returnable) return 'main';
    if (reachable && !returnable) return 'trap';
    return 'sealed';
  }

  /** 把连续的陷阱格聚成区域块（便于逐条给出位置与数字）。 */
  function clusterTrapCells() {
    const seen = new Uint8Array(cellCount);
    const clusters = [];
    for (let i = 0; i < cellCount; i += 1) {
      if (seen[i] || regionOfIndex(i) !== 'trap') continue;
      // BFS（8 邻域）聚块
      const queue = [i];
      seen[i] = 1;
      const members = [];
      while (queue.length > 0) {
        const current = queue.pop();
        members.push(current);
        const col = current % graph.cols;
        const row = Math.floor(current / graph.cols);
        for (let dc = -1; dc <= 1; dc += 1) {
          for (let dr = -1; dr <= 1; dr += 1) {
            const nc = col + dc;
            const nr = row + dr;
            if (nc < 0 || nr < 0 || nc >= graph.cols || nr >= graph.rows) continue;
            if (dc === 0 && dr === 0) continue;
            const ni = nr * graph.cols + nc;
            if (seen[ni]) continue;
            if (regionOfIndex(ni) !== 'trap') continue;
            seen[ni] = 1;
            queue.push(ni);
          }
        }
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let sumX = 0;
      let sumZ = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const m of members) {
        const w = graph.worldAt(m % graph.cols, Math.floor(m / graph.cols));
        minX = Math.min(minX, w.x);
        maxX = Math.max(maxX, w.x);
        minZ = Math.min(minZ, w.z);
        maxZ = Math.max(maxZ, w.z);
        sumX += w.x;
        sumZ += w.z;
        minY = Math.min(minY, w.y);
        maxY = Math.max(maxY, w.y);
      }
      clusters.push({
        cells: members.length,
        areaM2: +(members.length * cellSize * cellSize).toFixed(0),
        center: { x: +(sumX / members.length).toFixed(1), z: +(sumZ / members.length).toFixed(1) },
        bounds: { minX, maxX, minZ, maxZ },
        surfaceY: { min: +minY.toFixed(2), max: +maxY.toFixed(2) },
        span: { x: +(maxX - minX).toFixed(1), z: +(maxZ - minZ).toFixed(1) },
      });
    }
    return clusters.sort((a, b) => b.cells - a.cells);
  }

  /** ③ 空气墙：整足迹阻挡、但语义上"四面开敞/可穿行"的构筑物。 */
  function auditAirWalls() {
    const openKinds = new Set(['pavilion', 'corridor', 'courtyardGate', 'gateHall']);
    const bySlot = new Map((layout.SLOTS ?? []).map((s) => [s.id, s]));
    const rows = [];
    for (const obstacle of solver.obstacles()) {
      if (obstacle.blocks !== 'all') continue;
      const slot = obstacle.buildingId ? bySlot.get(obstacle.buildingId) : null;
      const kind = obstacle.buildingKind ?? slot?.kind ?? null;
      if (!kind || !openKinds.has(kind)) continue;
      rows.push({
        id: obstacle.id,
        buildingId: obstacle.buildingId ?? slot?.id ?? null,
        name: obstacle.buildingName ?? slot?.name ?? obstacle.id,
        kind,
        visitable: slot?.visitable === true,
        blocks: obstacle.blocks,
        center: slot ? { x: slot.x, z: slot.z } : { x: (obstacle.bounds.minX + obstacle.bounds.maxX) / 2, z: (obstacle.bounds.minZ + obstacle.bounds.maxZ) / 2 },
        footprint: slot?.bounds
          ? { w: +(slot.bounds.maxX - slot.bounds.minX).toFixed(1), d: +(slot.bounds.maxZ - slot.bounds.minZ).toFixed(1) }
          : null,
        zone: obstacle.zone ?? slot?.zone ?? null,
      });
    }
    return rows;
  }

  /** ② 净宽：门洞（障碍 door.width）与门洞通道面（kind 'passage'）的净宽 vs 判据。 */
  function auditNarrowGaps() {
    const required = requiredPassageWidth(config);
    const rows = [];
    for (const obstacle of solver.obstacles()) {
      const width = obstacle.door?.width;
      if (!Number.isFinite(width)) continue;
      const net = +(width - 0).toFixed(2); // door.width 是几何净宽（玩家半径由通道判定另行内缩）
      const passableNet = +(width - radius * 2).toFixed(2); // 实际可走净宽（两侧各内缩一个半径）
      if (passableNet + EPS >= required - radius * 2) continue; // 通过"半径内缩后仍为正"的判据
      rows.push({ id: obstacle.id, kind: 'door', width: net, passableNet, required, at: obstacle.id });
    }
    for (const surface of layout.WALKABLE ?? []) {
      if (surface.kind !== 'passage') continue;
      const w = surface.bounds.maxX - surface.bounds.minX;
      const d = surface.bounds.maxZ - surface.bounds.minZ;
      const net = +Math.min(w, d).toFixed(2);
      const passableNet = +(net - radius * 2).toFixed(2);
      if (passableNet <= EPS) rows.push({ id: surface.id, kind: 'passage', width: net, passableNet, required, at: surface.id });
    }
    return rows;
  }

  /** ④ 单向高差：A→B 允许但 B→A 不允许的相邻边（阈值不对称导致"能下不能上"）。 */
  function auditOneWayHeight(maxRows = 0) {
    const rows = [];
    let count = 0;
    graph.forEachWalkable((cell) => {
      const a = graph.worldAt(cell.col, cell.row);
      if (!a?.ok) return;
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const b = graph.worldAt(cell.col + dc, cell.row + dr);
        if (!b?.ok) continue;
        const up = graph.canStep(a.col, a.row, b.col, b.row);
        const down = graph.canStep(b.col, b.row, a.col, a.row);
        if (up === down) continue;
        const drop = +(a.y - b.y).toFixed(3);
        count += 1;
        if (maxRows > 0 && rows.length < maxRows) {
          rows.push({
            from: { x: a.x, z: a.z, y: +a.y.toFixed(2) },
            to: { x: b.x, z: b.z, y: +b.y.toFixed(2) },
            drop,
            allowed: up ? 'from→to' : 'to→from',
            direction: up ? '能上不能下' : '能下不能上',
          });
        }
      }
    });
    return { count, rows };
  }

  /** 成对可达性：给定路点，逐点判定 进得去（正向） 与 出得来（逆向）。 */
  function pairedReachability(points) {
    const fields = ensureFields();
    return points.map((point) => {
      const cell = graph.nearestCell(point.x, point.z);
      if (!cell) return { ...point, ok: false, reason: 'notOnWalkableCell' };
      const i = cell.row * graph.cols + cell.col;
      const enterable = fields.forward.parents[i] !== -2;
      const returnable = fields.backward.reaches[i] === 1;
      return {
        ...point,
        cell: { x: graph.worldAt(cell.col, cell.row).x, z: graph.worldAt(cell.col, cell.row).z },
        enterable,
        returnable,
        ok: enterable && returnable,
        reason: enterable && returnable ? 'ok' : !enterable ? 'unreachable' : 'oneWayTrap',
      };
    });
  }

  /** 格状态查询（世界坐标）。 */
  function regionAt(x, z) {
    const cell = graph.toCell(x, z);
    if (!cell) return 'outside';
    const w = graph.worldAt(cell.col, cell.row);
    if (!w?.ok) return 'blocked';
    return regionOfIndex(cell.index);
  }

  /** 是否"安全格"（进出皆可）。 */
  function isSafe(x, z) {
    return regionAt(x, z) === 'main';
  }

  /**
   * 防卡死守卫：拒绝**踏进陷阱格**。
   * 容忍栅格误差：只有当目标格及其 3×3 邻域**全部**都不是安全格时才拒绝（避免粗栅格误伤正常路线）。
   * @returns {{allowed:boolean, reason:string|null}}
   */
  function guardStep(from, to) {
    const cell = graph.toCell(to.x, to.z);
    if (!cell) return { allowed: false, reason: 'oneWayTrap' };
    if (regionOfIndex(cell.index) === 'main') return { allowed: true, reason: null };
    // 3×3 邻域里只要有一个安全格，就认为可以原路退回来（不拒绝）
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        const w = graph.worldAt(cell.col + dc, cell.row + dr);
        if (!w?.ok) continue;
        if (regionOfIndex(w.index) === 'main') return { allowed: true, reason: null };
      }
    }
    return { allowed: false, reason: 'oneWayTrap', region: regionOfIndex(cell.index), from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z } };
  }

  /** 最近的安全可行走格（**仅诊断/展示**；脱困的实际落点由 core 的 `nearestFpSpawn` 决定）。 */
  function nearestSafePoint(x, z, maxCells = 40) {
    const cell = graph.toCell(x, z) ?? graph.nearestCell(x, z) ?? anchor;
    let best = null;
    let bestDistance = Infinity;
    for (let ring = 0; ring <= maxCells; ring += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        for (let dr = -ring; dr <= ring; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue; // 只扫当前环
          const w = graph.worldAt(cell.col + dc, cell.row + dr);
          if (!w?.ok) continue;
          if (regionOfIndex(w.index) !== 'main') continue;
          const distance = Math.hypot(w.x - x, w.z - z);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = { x: w.x, z: w.z, y: w.y, distance: +distance.toFixed(2), region: 'main' };
          }
        }
      }
      if (best) return best; // 逐环扩张 ⇒ 第一个命中即最近
    }
    return best;
  }

  /** 审计汇总（四类 + 成对可达性）。 */
  function audit({ paired = [] } = {}) {
    ensureFields();
    const traps = clusterTrapCells();
    const airWalls = auditAirWalls();
    const narrow = auditNarrowGaps();
    const oneWayHeight = auditOneWayHeight(5);
    let mainCells = 0;
    let trapCells = 0;
    let sealedCells = 0;
    for (let i = 0; i < cellCount; i += 1) {
      if (graph.worldAt(i % graph.cols, Math.floor(i / graph.cols))?.ok !== true) continue;
      const region = regionOfIndex(i);
      if (region === 'main') mainCells += 1;
      else if (region === 'trap') trapCells += 1;
      else sealedCells += 1;
    }
    const pairedResult = pairedReachability(paired);
    return {
      cellSize,
      anchor: ensureFields().anchor,
      mainCells,
      trapCells,
      sealedCells,
      trapCount: traps.length,
      traps,
      airWalls,
      narrowGaps: narrow,
      oneWayHeight,
      paired: pairedResult,
      pairedProblems: pairedResult.filter((p) => !p.ok),
    };
  }

  return {
    graph,
    cellSize,
    get anchor() {
      return ensureFields().anchor;
    },
    warmupStep,
    warmupAll,
    ensureFields,
    get ready() {
      return forward !== null && backward !== null;
    },
    regionOfIndex,
    regionAt,
    isSafe,
    guardStep,
    nearestSafePoint,
    clusterTrapCells,
    auditAirWalls,
    auditNarrowGaps,
    auditOneWayHeight,
    pairedReachability,
    audit,
    stats() {
      return computeStats();
    },
  };
}

export default createTraversalAudit;
