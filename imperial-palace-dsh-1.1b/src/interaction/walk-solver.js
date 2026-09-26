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

const EPS = 1e-6;
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
export function createWalkSolver({ config = CONFIG, obstacles = null, layout = LAYOUT, registry = null, onBlocked = null } = {}) {
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
  function groundAt(x, z) {
    return floor(x, z);
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

  /** 单个障碍是否阻挡玩家（精确 AABB，含玩家半径膨胀）。 */
  function blocks(obstacle, x, z, feetY) {
    const b = obstacle.bounds;
    if (!b) return false;
    if (x < b.minX - player.radius || x > b.maxX + player.radius) return false;
    if (z < b.minZ - player.radius || z > b.maxZ + player.radius) return false;
    if (obstacle.sourceType === 'water') {
      // 水面：只有位于登记的桥面通道（桥面可行走面 / 桥坡道路段）上才允许通过；
      // 水池位于地坪矩形之内，必须先判水面，否则"站在水面之上"会被误判为可走。
      return !bridgeSurfaceAt(x, z);
    }
    // 站在障碍顶面之上（例如台基上的建筑顶）不算被挡
    if (feetY >= (obstacle.y1 ?? 0) - step.maxStepHeight * 0.5) return false;
    if (obstacle.blocks === 'exceptDoor' && insideDoorChannel(obstacle.door, b, x, z, player.radius)) return false;
    return true;
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
      if (surfaceY - feet > step.maxStepHeight + EPS) return { ok: false, x, z, surfaceY, reasons: ['stepTooHigh'], obstacles: hits };
      if (surfaceY - feet < -step.snapDownDistance) return { ok: false, x, z, surfaceY, reasons: ['dropTooDeep'], obstacles: hits };
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

    const tryMove = (dx, dz) => {
      const nx = x + dx;
      const nz = z + dz;
      if (collision.clampToEnvelope) {
        const clampedX = clamp(nx, extent.minX + player.radius, extent.maxX - player.radius);
        const clampedZ = clamp(nz, extent.minZ + player.radius, extent.maxZ - player.radius);
        if (Math.abs(clampedX - nx) > EPS || Math.abs(clampedZ - nz) > EPS) {
          blocked.push('envelope');
          return false;
        }
      }
      const surfaceY = groundAt(nx, nz);
      if (surfaceY === null) {
        blocked.push('noSurface');
        return false;
      }
      if (surfaceY - feetY > step.maxStepHeight + EPS) {
        blocked.push('stepTooHigh');
        return false;
      }
      if (surfaceY - feetY < -step.snapDownDistance) {
        blocked.push('dropTooDeep');
        return false;
      }
      for (const index of g.candidates(nx, nz)) {
        const obstacle = list[index];
        if (obstacle && blocks(obstacle, nx, nz, feetY)) {
          blocked.push(obstacle.id);
          return false;
        }
      }
      return true;
    };

    const dx = dirX * distance;
    const dz = dirZ * distance;
    if (tryMove(dx, dz)) {
      x += dx;
      z += dz;
    } else {
      const iterations = Math.max(1, collision.slideIterations);
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
