/**
 * 第一人称碰撞与可行走面解算（G 实现；CONTRACTS §6、计划 §6.4）。
 *
 * 本模块是**唯一**碰撞实现：通过 `rig.setCollisionSolver(solver)` 注入 core 的唯一相机装置，
 * 由 core 的 `updateFp()` 每帧调用 `solver.step(...)`；G **不移动相机**，只提供几何判定。
 * 数值全部取自 `CONFIG.INTERACTION` / `CONFIG.CAMERA`，坐标全部取自 `layout`（无字面量）。
 *
 * 判定顺序（与 core 内置求解器一致，便于逐点比对）：
 *   1. 包络夹取：不得离开 `TERRAIN_EXTENT`（玩家半径内缩）→ `'envelope'`
 *   2. 无可行走面（护城河水面、河道、包络外）→ `'noSurface'`
 *   3. 台阶阈值：抬升 > `step.maxStepHeight` → `'stepTooHigh'`；下落 > `step.snapDownDistance` → `'dropTooDeep'`
 *   4. AABB 障碍：建筑 / 宫墙 / 水面 / 假山 → `'<障碍 id>'`（core 据此上报 `interaction:blocked-building`）
 *
 * 与 core 内置求解器的**唯一有意差异**（已在回执标注）：水面的阻挡判定改为"支撑面是否为桥面"，
 * 使水池（位于地坪内）不可踩、而桥面（跨越护城河）可通行。
 */

import { CONFIG, INTERACTION } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
// t87（闭合 t86-F1）：阻挡判定委托**谓词层唯一真相源**（core 的 `obstacleBlocksPoint`），
// 与 core 内置求解器同构；本文件不再自带一套"简易阻挡判定"（旧实现缺 `y0` 下界与门洞轴线语义）。
import { obstacleBlocksPoint } from '../core/layout-slice.js';

const EPS = 1e-6;
/** t142：台阶阈值含等号（契约）——仅吸收浮点噪声（例：1.6-1 = 0.6000000000000001）。 */
const BOUNDARY_EPS = 1e-9;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** 阻挡原因中属于"世界约束"而非具体构件的词（core 不把它们当作建筑 id 上报）。 */
export const WORLD_BLOCK_REASONS = Object.freeze(['envelope', 'noSurface', 'stepTooHigh', 'dropTooDeep']);

/** 障碍来源类型 → 中文提示词（不可进入建筑/墙/水/假山的可见提示用）。 */
export const SOURCE_TYPE_LABELS = Object.freeze({
  building: '建筑',
  wall: '墙体',
  water: '水面',
  rockery: '假山',
});

/**
 * 单元格宽相位（`config.INTERACTION.collision.broadphase === 'aabbGrid'`）。
 * 只按 XZ 分格，每格记录覆盖它的障碍下标；查询时取候选集合做精确 AABB 判定。
 */
export function createAabbGrid(obstacles, cellSize = INTERACTION.collision.cellSize) {
  const cells = new Map();
  const key = (cx, cz) => `${cx}:${cz}`;
  obstacles.forEach((obstacle, index) => {
    const b = obstacle.bounds;
    if (!b) return;
    const cx0 = Math.floor(b.minX / cellSize);
    const cx1 = Math.floor(b.maxX / cellSize);
    const cz0 = Math.floor(b.minZ / cellSize);
    const cz1 = Math.floor(b.maxZ / cellSize);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        const k = key(cx, cz);
        let bucket = cells.get(k);
        if (!bucket) {
          bucket = [];
          cells.set(k, bucket);
        }
        bucket.push(index);
      }
    }
  });
  return {
    cellSize,
    cellCount: cells.size,
    /** 查询点所在格及其 8 邻居（玩家半径可能跨格）。 */
    candidates(x, z) {
      const cx = Math.floor(x / cellSize);
      const cz = Math.floor(z / cellSize);
      const seen = new Set();
      const out = [];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = cells.get(key(cx + dx, cz + dz));
          if (!bucket) continue;
          for (const index of bucket) {
            if (seen.has(index)) continue;
            seen.add(index);
            out.push(index);
          }
        }
      }
      return out;
    },
  };
}

/** 门洞判定：门洞是"穿透体块"的通道，横向受门宽限制，纵向覆盖整个体块厚度。 */
export function insideDoorChannel(door, bounds, x, z, radius) {
  if (!door || !bounds) return false;
  const halfWidth = door.width / 2 - radius;
  if (halfWidth <= 0) return false;
  if (door.axis === 'z') {
    return Math.abs(x - door.center.x) <= halfWidth && z >= bounds.minZ - radius && z <= bounds.maxZ + radius;
  }
  return Math.abs(z - door.center.z) <= halfWidth && x >= bounds.minX - radius && x <= bounds.maxX + radius;
}

/**
 * 合并障碍集合（**必须合并**，不能二选一）：
 *   - `layout.OBSTACLES` 是冻结基线：**不可进入建筑**（`OB-<buildingId>`）、护城河/水池、假山都在这里；
 *   - `registry.allObstacles()` 是运行时真值：core 派生的墙体碰撞盒（`OB-WALLRUN-*`）与各区域自报的障碍；
 *   两者 id 冲突时以注册表为准（运行时装得更细），但**基线条目不得被丢掉**——
 *   否则"不可进入建筑"会失去阻挡、第一人称可直接穿模（实测教训：只看注册表时 81 条基线被 83 条墙体替换）。
 */
export function mergeObstacles({ layout = LAYOUT, registry = null, obstacles = null } = {}) {
  if (Array.isArray(obstacles)) return obstacles;
  const map = new Map();
  for (const obstacle of layout.OBSTACLES) map.set(obstacle.id, obstacle);
  const live = registry?.allObstacles?.() ?? [];
  for (const obstacle of live) map.set(obstacle.id, obstacle);
  return [...map.values()];
}

/**
 * 创建第一人称求解器。
 * @param {{
 *   config?: object, obstacles?: object[], layout?: object, registry?: object|null,
 *   onBlocked?: null | ((info: { obstacles: string[], reasons: string[], x: number, z: number, feetY: number }) => void)
 * }} [options]
 */
export function createWalkSolver({
  config = CONFIG,
  obstacles = null,
  layout = LAYOUT,
  registry = null,
  onBlocked = null,
  traversalGuard = null,
  connectorRamps = true,
} = {}) {
  const player = config.INTERACTION.player;
  const step = config.INTERACTION.step;
  const collision = config.INTERACTION.collision;
  const extent = layout.TERRAIN_EXTENT;
  const walkableTable = layout.WALKABLE;
  const roadTable = layout.ROADS;
  const floor = layout.floorYAt;
  const surfacesAt = layout.walkableAt;

  /** 障碍集合：显式传入 > 注册表 ∪ layout 基线（合并，见 mergeObstacles）。 */
  function currentObstacles() {
    return mergeObstacles({ layout, registry, obstacles });
  }

  /** 网格重建上限间隔（毫秒）：区域装载后由 `invalidate()` 立即重建，其余情况最多滞后这么久。 */
  const REBUILD_MS = 500;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  let cachedList = null;
  let cachedGrid = null;
  let cachedLength = -1;
  let lastBuildAt = -Infinity;

  /** 区域装载/卸载后调用：下次 `step` 立刻重建宽相位网格。 */
  function invalidate() {
    cachedList = null;
    cachedGrid = null;
    cachedLength = -1;
    lastBuildAt = -Infinity;
  }

  function gridFor(list) {
    const at = now();
    // 内容签名：长度变化 or 距上次重建超过 REBUILD_MS → 重建（core 每帧都传新数组，不能用引用比较）
    if (!cachedGrid || list.length !== cachedLength || at - lastBuildAt > REBUILD_MS) {
      cachedList = list;
      cachedLength = list.length;
      cachedGrid = createAabbGrid(list, collision.cellSize);
      lastBuildAt = at;
    }
    return cachedGrid;
  }

  /** 支撑面高度（含道路/坡道/台阶线性插值）。 */
  /* ------------------------------------------------------------------ t88：消费 layout.CONNECTORS（坡道/台阶语义） */
  /**
   * `layout.CONNECTORS` 是"跨区通道"的**权威登记**（唯一 id + owner + 两端 position/width/elevation；
   * `kind='stairs'` 额外给 `elevationLow`）。旧走查层对它**引用数为 0** ⇒ 任何**只在 connector 里登记**的
   * 高差（丹陛/台阶）在碰撞层不成立。本实现对每个"确有台阶落差"的 connector 生成一条**有界坡道带**：
   *
   *   · **依据**：connector 自报的 `elevationLow → elevation`（layout 的几何真值），不发明任何标高；
   *   · **边界**：横向 |lateral| ≤ `width/2`（仅该 connector 覆盖的**横断面**）∩ 沿轴位于
   *     `[edge - run, edge]`（edge = 数据实测的台阶边缘，run = clamp(|Δelev| / RAMP_SLOPE, 1.5, 8)）；
   *   · **带内**：有效地面 = 沿轴线性插值的过渡面（起点 = elevationLow，终点 = elevation），
   *     与带外既有地面**取较高者**（绝不把玩家沉进地形）；
   *   · **带外**：完全走原判据（全局 `maxStepHeight 0.5` / `snapDownDistance 0.6` 一字未改）。
   *
   * 因此这是"**局部放行有界的过渡面**"，不是"放宽全局阈值"。
   */
  const RAMP_SLOPE = 0.75; // 过渡面最陡坡度（1:1.33 ≈ 36.9°）；只为让每一步 ≤ 全局阈值，不代表真实踏步数
  const RAMP_RUN_MIN = 1.5;
  const RAMP_RUN_MAX = 8;
  /**
   * connector 清单 = `layout.CONNECTORS` ∪ 注册表 `registry.allConnectors()`（同 id 去重，layout 优先）。
   * 联合口径（与 layout 侧 F8-① 不冲突）：layout 侧负责登记过渡（可行走面/connector），
   * 本层负责消费；任一侧新增"有落差的通道"，只要形状合法就会被本层纳入坡道带评估（cliff ⇒ ramp）。
   */
  function collectConnectors() {
    const list = [];
    const seen = new Set();
    const push = (c) => {
      if (!c || typeof c.id !== 'string' || !c.position || !Number.isFinite(c.elevation)) return;
      if (seen.has(c.id)) return;
      seen.add(c.id);
      list.push(c);
    };
    for (const c of Array.isArray(layout.CONNECTORS) ? layout.CONNECTORS : []) push(c);
    const fromRegistry = typeof registry?.allConnectors === 'function' ? registry.allConnectors() : null;
    if (Array.isArray(fromRegistry)) for (const c of fromRegistry) push(c);
    return list;
  }
  const connectors = collectConnectors();
  const connectorRampsDisabled = connectorRamps === false;

  /**
   * 只为"**数据里确实存在落差（cliff）**"的 connector 生成坡道带：
   *   · 沿 4 个候选轴从中心向外逐 0.25m 扫描，找到第一处 `|Δy| > maxStepHeight` 的**突变**（台阶边缘，
   *     取两侧采样点的中点作为边缘线 —— 上升/下降两种朝向都识别）；
   *   · 依据只取**实测两侧地面**，并要求高端 ≈ connector 自报 `elevation`（±0.5m），**不发明标高**；
   *   · 找不到突变（说明既有地面已把这段高差铺成连续面）⇒ **不生成坡道**，行为与既有完全一致（零足迹）；
   *   · 过渡带铺在**低侧**、坡向高端：低端 = 边缘沿低侧外推 `run`，高端 = 边缘本身，
   *     因此与带外既有地面**在边缘处连续**（端点值 = 高端地面），不会在脚下造出新的陡坎。
   */
  function findRampFor(connector) {
    const tol = step.maxStepHeight + 1e-6;
    const declaredHigh = connector.elevation;
    if (!Number.isFinite(declaredHigh)) return null;
    let best = null;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let prev = null;
      for (let d = 0; d <= 12; d += 0.25) {
        const x = connector.position.x + ax * d;
        const z = connector.position.z + az * d;
        const y = floor(x, z);
        if (y === null) { prev = null; continue; }
        if (prev && Math.abs(y - prev.y) > tol) {
          const lowY = Math.min(prev.y, y);
          const highY = Math.max(prev.y, y);
          if (Math.abs(highY - declaredHigh) <= 0.5 && highY - lowY > tol) {
            const score = Math.abs(highY - declaredHigh);
            if (!best || score < best.score) {
              // 边缘 = 两采样点中点；低侧方向 = 从边缘指向较低的那个采样点
              const edge = { x: (prev.x + x) / 2, z: (prev.z + z) / 2 };
              const lowIsPrev = prev.y < y;
              const lowPoint = lowIsPrev ? prev : { x, z, y };
              const dx = lowPoint.x - edge.x;
              const dz = lowPoint.z - edge.z;
              const len = Math.hypot(dx, dz) || 1;
              best = {
                score,
                edge,
                lowDir: { x: dx / len, z: dz / len },
                lowY,
                highY,
                edgeDistance: +d.toFixed(2),
                axis: { x: ax, z: az },
              };
            }
          }
          break; // 只看第一处突变
        }
        prev = { x, z, y, d };
      }
    }
    if (!best) return null;
    const { edge, lowDir, lowY, highY } = best;
    const run = Math.min(RAMP_RUN_MAX, Math.max(RAMP_RUN_MIN, (highY - lowY) / RAMP_SLOPE));
    const halfWidth = Math.max(0.5, connector.width / 2);
    const lateral = { x: -lowDir.z, z: lowDir.x };
    const lowEnd = { x: edge.x + lowDir.x * run, z: edge.z + lowDir.z * run };
    return {
      id: connector.id,
      kind: connector.kind,
      width: connector.width,
      elevationLow: +lowY.toFixed(4),
      elevation: +highY.toFixed(4),
      declared: { elevation: declaredHigh, elevationLow: connector.elevationLow ?? null },
      run: +run.toFixed(3),
      edgeDistance: best.edgeDistance,
      axis: { x: -lowDir.x, z: -lowDir.z }, // 指向高侧（从低端到边缘）
      lateral,
      lowEnd,
      edge,
      halfWidth,
    };
  }

  const ramps = connectorRampsDisabled ? [] : connectors.map(findRampFor).filter(Boolean);

  /** 该点的"connector 过渡面"标高（不在任何坡道带内 ⇒ null）。 */
  function connectorRampAt(x, z) {
    for (const ramp of ramps) {
      const relX = x - ramp.lowEnd.x;
      const relZ = z - ramp.lowEnd.z;
      const along = relX * ramp.axis.x + relZ * ramp.axis.z; // 从低端指向台阶边缘（axis 指向高侧）
      if (along < -1e-6 || along > ramp.run + 1e-6) continue;
      const lateral = relX * ramp.lateral.x + relZ * ramp.lateral.z;
      if (Math.abs(lateral) > ramp.halfWidth + 1e-6) continue;
      const t = Math.min(1, Math.max(0, along / ramp.run));
      return { id: ramp.id, kind: ramp.kind, y: ramp.elevationLow + (ramp.elevation - ramp.elevationLow) * t, t, ramp };
    }
    return null;
  }

  /**
   * 有效地面：**带内**取"过渡面与既有地面较高者"（不会把玩家沉进地形），**带外**完全走 layout 原值。
   */
  function groundAt(x, z) {
    const base = floor(x, z);
    const ramp = connectorRampAt(x, z);
    if (!ramp) return base;
    if (base === null) return ramp.y;
    return Math.max(base, ramp.y);
  }

  /** 该点是否位于"桥面通道"上（`bridgeDeck` 可行走面 或 `bridgeRamp`/`bridgeDeck` 道路段）。 */
  function bridgeSurfaceAt(x, z) {
    for (const surface of surfacesAt(x, z)) {
      if (surface.kind === 'bridgeDeck') return surface;
    }
    for (const road of roadTable) {
      if (road.surface !== 'bridgeDeck' && road.surface !== 'bridgeRamp') continue;
      const { x: x1, z: z1 } = road.from;
      const { x: x2, z: z2 } = road.to;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len2 = dx * dx + dz * dz;
      if (len2 === 0) continue;
      const t = ((x - x1) * dx + (z - z1) * dz) / len2;
      if (t < -0.02 || t > 1.02) continue;
      const px = x1 + dx * t;
      const pz = z1 + dz * t;
      if (Math.hypot(x - px, z - pz) <= road.width / 2) return road;
    }
    return null;
  }

  /** t87：单向陷阱守卫（由 `traversal.js` 提供；未装/未就绪时一律放行，绝不误伤）。 */
  let guard = typeof traversalGuard === 'function' ? traversalGuard : null;
  /** t87：卡死追踪 —— core 每帧的位移意图 vs 实得位移（驱动"HUD 提示 + 一键脱困"）。 */
  const stuck = { seconds: 0, lastDistance: 0, lastMoved: 0, attempts: 0, refusals: 0, lastIntent: false, lastMovedValue: 0, lastSpeed: 0, intentSource: 'internal' };

  /**
   * 单个障碍是否阻挡玩家（精确判定）。
   *   · **非水面**：委托谓词层 `obstacleBlocksPoint`（与 core 求解器同源：足迹圆 ∩ 包围盒 +
   *    玩家垂直区间 `[feetY, feetY+height]` ∩ `[y0, y1]` + 门洞通道豁免）——t87 起这里**不再**自己判，
   *    以免再次出现"求解器与谓词层两套口径"（DEFECT-T76-01 的温床）；
   *   · **水面**：保留 g 侧的有意口径（只有登记桥面/桥坡道之上才可通过；见模块头注释），
   *    该差异由 E7 的"仅水面允许不同"豁免覆盖，且有 E5/E6 的正反断言守着。
   */
  function blocks(obstacle, x, z, feetY) {
    const b = obstacle.bounds;
    if (!b) return false;
    if (x < b.minX - player.radius || x > b.maxX + player.radius) return false;
    if (z < b.minZ - player.radius || z > b.maxZ + player.radius) return false;
    if (obstacle.sourceType === 'water') return !bridgeSurfaceAt(x, z);
    return obstacleBlocksPoint(obstacle, { x, z, feetY, height: player.height, radius: player.radius });
  }

  /** 只判定"该点能否站立"，不移动（UI 提示、出生点校验、测试用）。 */
  function probe(x, z, feetY = null) {
    const surfaceY = groundAt(x, z);
    const feet = feetY ?? (surfaceY === null ? 0 : surfaceY);
    const reasons = [];
    const hits = [];
    if (collision.clampToEnvelope) {
      if (
        x < extent.minX + player.radius ||
        x > extent.maxX - player.radius ||
        z < extent.minZ + player.radius ||
        z > extent.maxZ - player.radius
      ) {
        return { ok: false, x, z, surfaceY, reasons: ['envelope'], obstacles: hits };
      }
    }
    if (surfaceY === null) return { ok: false, x, z, surfaceY, reasons: ['noSurface'], obstacles: hits };
    if (feetY !== null) {
      if (surfaceY - feet > step.maxStepHeight + BOUNDARY_EPS) return { ok: false, x, z, surfaceY, reasons: ['stepTooHigh'], obstacles: hits };  // t142：含界
      if (feet - surfaceY > step.snapDownDistance + BOUNDARY_EPS) return { ok: false, x, z, surfaceY, reasons: ['dropTooDeep'], obstacles: hits };  // t142：含界
    }
    const list = currentObstacles();
    const g = gridFor(list);
    for (const index of g.candidates(x, z)) {
      const obstacle = list[index];
      if (obstacle && blocks(obstacle, x, z, feet)) {
        hits.push(obstacle.id);
        reasons.push(obstacle.id);
      }
    }
    return { ok: reasons.length === 0, x, z, surfaceY, reasons, obstacles: hits };
  }

  /**
   * 求解一步移动（core 相机装置每帧调用的唯一接口）。
   * @returns {{x:number, z:number, y:number, blocked:string[]}}
   */
  function step1(from, dirX, dirZ, distance, options = {}) {
    const list = Array.isArray(options.obstacles) ? options.obstacles : currentObstacles();
    const g = gridFor(list);
    const feetY = (from.y ?? 0) - config.CAMERA.fpEyeHeight;
    let x = from.x;
    let z = from.z;
    const blocked = [];
    /** t87：子步进会反复命中同一障碍，`blocked` 只记去重原因（上限 8，与 core 一致）。 */
    const pushReason = (reason) => {
      if (reason && !blocked.includes(reason) && blocked.length < 8) blocked.push(reason);
    };

    const tryMove = (dx, dz) => {
      const nx = x + dx;
      const nz = z + dz;
      if (collision.clampToEnvelope) {
        const clampedX = clamp(nx, extent.minX + player.radius, extent.maxX - player.radius);
        const clampedZ = clamp(nz, extent.minZ + player.radius, extent.maxZ - player.radius);
        if (Math.abs(clampedX - nx) > EPS || Math.abs(clampedZ - nz) > EPS) {
          pushReason('envelope');
          return false;
        }
      }
      const surfaceY = groundAt(nx, nz);
      if (surfaceY === null) {
        pushReason('noSurface');
        return false;
      }
      if (surfaceY - feetY > step.maxStepHeight + BOUNDARY_EPS) {  // t142：含界
        pushReason('stepTooHigh');
        return false;
      }
      if (feetY - surfaceY > step.snapDownDistance + BOUNDARY_EPS) {  // t142：含界
        pushReason('dropTooDeep');
        return false;
      }
      for (const index of g.candidates(nx, nz)) {
        const obstacle = list[index];
        if (obstacle && blocks(obstacle, nx, nz, feetY)) {
          pushReason(obstacle.id);
          return false;
        }
      }
      /**
       * t87：单向陷阱守卫 —— 目标格若"进得去出不来"则拒绝踏进去
       * （主理人原则：宁可禁止进入，也不允许进得去出不来；只加约束，不放宽任何既有判据）。
       */
      if (guard) {
        const verdict = guard({ x, z, feetY }, { x: nx, z: nz, feetY });
        if (verdict && verdict.allowed === false) {
          stuck.refusals += 1;
          pushReason(verdict.reason ?? 'oneWayTrap');
          return false;
        }
      }
      return true;
    };

    /**
     * t87（DEFECT-T76-01，与 core t86 同构修法）：**必须子步进**。
     * 旧实现把整段 `distance` 一次性位移、只对**终点**判阻挡：当一步长度大于建筑进深时，
     * 终点已落在建筑另一侧之外 ⇒ 判定放行、`blocked` 为空 ⇒ **整栋穿过去**（实测 30m+）。
     * 步长取 `min(player.radius, step.maxStepHeight)`：任何厚度 ≥ 玩家直径的阻挡体都不可能被跨过。
     * 未放宽任何判据（阈值/门洞/包络语义一概不动），只是把"判定采样"加密到不可能跳过。
     */
    const maxIncrement = Math.max(EPS, Math.min(player.radius, step.maxStepHeight));
    const totalDistance = Math.max(0, distance);
    const subSteps = Math.max(1, Math.ceil(totalDistance / maxIncrement));
    const inc = totalDistance / subSteps;
    const iterations = Math.max(1, collision.slideIterations);
    for (let s2 = 0; s2 < subSteps; s2 += 1) {
      const dx = dirX * inc;
      const dz = dirZ * inc;
      if (tryMove(dx, dz)) {
        x += dx;
        z += dz;
        continue;
      }
      let moved = false;
      // 单轴滑动：只在对应分量非零时尝试（零位移的"成功"是假成功，会卡住）
      if (Math.abs(dx) > EPS && tryMove(dx, 0)) {
        x += dx;
        moved = true;
      }
      if (!moved && Math.abs(dz) > EPS && tryMove(0, dz)) {
        z += dz;
        moved = true;
      }
      if (!moved) {
        for (let i = 1; i <= iterations; i += 1) {
          const scale = 1 / 2 ** i;
          if (tryMove(dx * scale, dz * scale)) {
            x += dx * scale;
            z += dz * scale;
            break;
          }
        }
      }
    }

    const surfaceY = groundAt(x, z);
    const y = surfaceY === null ? from.y : surfaceY + config.CAMERA.fpEyeHeight;
    // t87：记录"这一步想走多远 / 实际走了多远"（卡死检测的唯一输入；时间由调用方 dt 累加，测试可注入）
    stuck.lastDistance = Math.max(0, distance);
    stuck.lastMoved = Math.hypot(x - from.x, z - from.z);
    stuck.attempts += 1;
    if (blocked.length > 0 && typeof onBlocked === 'function') {
      onBlocked({ obstacles: blocked, reasons: [...new Set(blocked)], x, z, feetY });
    }
    return { x, z, y, blocked };
  }

  return {
    /** core 契约名：`step(from, dirX, dirZ, distance, options)` */
    step: step1,
    probe,
    groundAt,
    blocks,
    /** t87：安装/替换单向陷阱守卫（传 null 卸载）。 */
    setTraversalGuard(next) {
      guard = typeof next === 'function' ? next : null;
    },
    hasTraversalGuard: () => guard !== null,
    /** t88：connector 坡道带清单（走查层确实消费 layout.CONNECTORS 的证据）。 */
    connectorRamps: () => ramps.map((r) => ({ ...r })),
    connectorAt: (x, z) => connectorRampAt(x, z),
    connectorStats() {
      return {
        declared: connectors.length,
        ramps: ramps.length,
        disabled: connectorRampsDisabled,
        ids: ramps.map((r) => r.id),
      };
    },
    /**
     * t87：卡死计时推进（由交互层唯一 `update(dt)` 调用，故测试可注入 dt，不依赖挂钟）。
     *
     * **t104（t99-F1）修复**：意图/位移**必须由调用方按真实移动路径传入**
     *   · `intent`：玩家是否正在按移动键（rig 输入态）；
     *   · `moved` ：本帧 `rig.position` 的实得位移。
     * 历史缺陷：本函数原先只读 `step()/move()` 写入的内部记录，而**生产路径从不调用本求解器的 step**
     * （真实移动由 core 自带 `createFpSolver` 承担）⇒ 意图恒 false、计时恒 0、卡死 HUD 不可达（t99-F1）。
     * 兼容：`intent/moved` 传 undefined 时退回内部记录（仅供旧测试/离线诊断），并如实标注来源。
     * @returns {{seconds:number, stuck:boolean, intent:boolean, moved:number, source:'explicit'|'internal'}}
     */
    noteStuckTick(dt, { intent = null, moved = null, threshold = 1.5, minIntent = 1e-4, minMoved = 1e-4, minSpeed = null, airborne = false } = {}) {
      /**
       * t2：**空中豁免** —— 第一人称跳跃飞行期间不计"卡死"。
       * 语义：跳跃是合法的暂态（原地跳、贴墙跳都会让水平位移暂时为 0），不能判成卡住；
       * 判据不放宽：落地后 airborne=false，"有意图 + 无位移"照常累计。
       */
      if (airborne) {
        stuck.seconds = 0;
        stuck.lastIntent = intent === true;
        stuck.lastMovedValue = moved === null ? stuck.lastMoved : moved;
        stuck.lastSpeed = 0;
        stuck.intentSource = 'explicit';
        return { seconds: 0, stuck: false, intent: intent === true, moved: +(stuck.lastMovedValue ?? 0).toFixed(4), speed: 0, source: 'airborne-exempt' };
      }
      const explicit = intent !== null || moved !== null;
      const hasIntent = intent === null ? stuck.lastDistance > minIntent : intent === true;
      const movedValue = moved === null ? stuck.lastMoved : moved;
      /**
       * t104：帧率无关的"实得位移"判定 —— 有 `minSpeed` 时比**速度**（moved/dt），否则退化为逐帧位移阈值。
       * 依据：正常步行 3–6 m/s；被墙顶住时求解器滑动残差 <0.1 m/s（实测蠕蠕 ~0.02–0.08 m/s）。
       * 取 0.6 m/s 作分界 ⇒ 两侧余量各 5–10 倍；且 headless/低帧率下逐帧位移会随 dt 放大，
       * 用速度才能避免"静态位置被误判为在动"（浏览器 t99-F1 复核时实测到的坑）。
       */
      const speed = dt > 0 ? movedValue / dt : (movedValue > 0 ? Infinity : 0);
      const hasMoved = minSpeed === null ? movedValue > minMoved : speed > minSpeed;
      stuck.lastIntent = hasIntent;
      stuck.lastMovedValue = movedValue;
      stuck.lastSpeed = speed;
      stuck.intentSource = explicit ? 'explicit' : 'internal';
      if (hasIntent && !hasMoved) stuck.seconds += dt;
      else stuck.seconds = 0;
      return {
        seconds: +stuck.seconds.toFixed(3),
        stuck: stuck.seconds >= threshold,
        intent: hasIntent,
        moved: +movedValue.toFixed(4),
        speed: +speed.toFixed(4),
        source: stuck.intentSource,
      };
    },
    resetStuckTimer() {
      stuck.seconds = 0;
    },
    traversalState() {
      return {
        guarded: guard !== null,
        refusals: stuck.refusals,
        stuckSeconds: +stuck.seconds.toFixed(3),
        attempts: stuck.attempts,
        // t87/t104：卡死检测的输入（意图 / 实得位移）与来源，便于诊断"为何判/未判卡死"
        lastDistance: +stuck.lastDistance.toFixed(4),
        lastMoved: +stuck.lastMoved.toFixed(4),
        intent: stuck.lastIntent,
        movedValue: +stuck.lastMovedValue.toFixed(4),
        speed: +stuck.lastSpeed.toFixed(4),
        intentSource: stuck.intentSource,
      };
    },
    insideDoorChannel: (door, bounds, x, z) => insideDoorChannel(door, bounds, x, z, player.radius),
    stats() {
      const list = currentObstacles();
      const g = gridFor(list);
      return {
        obstacles: list.length,
        cells: g.cellCount,
        cellSize: g.cellSize,
        walkable: walkableTable.length,
        player: { ...player },
        step: { ...step },
      };
    },
    /** 测试/诊断：当前使用的障碍集合。 */
    obstacles: currentObstacles,
    invalidate,
    dispose() {
      cachedList = null;
      cachedGrid = null;
    },
  };
}

export default createWalkSolver;
