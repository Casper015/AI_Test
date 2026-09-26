/**
 * 注册表（唯一）：建筑 / 碰撞 / 视角 / 灯位（CONTRACTS §3.3、§4、§5、§6、§8.3）。
 *
 * 职责：
 *   1. 汇总各区域 `createZone()` 返回的 buildings / connectors / colliders / viewpoints / lightAnchors；
 *   2. **全局唯一 id 校验**：任何重复 id（跨区域、或与 layout 冻结表冲突）立即抛错，不静默覆盖；
 *   3. 提供查询：按 id / 按包围盒 / 按区域；fp-spawn 邻近查询；灯位按距离排序（环境系统用）；
 *   4. **墙体碰撞收口（t23）**：由 `layout.WALLS` 统一派生宫墙 + 院墙碰撞盒（含门洞净空与 floorYAt 标高），
 *      放入独立图层 `wallObstacles`（永不被 `unregisterZone` 删除），并对其余来源的同墙条目**去重**，
 *      保证"不双倍阻挡、不额外绘制"（碰撞盒是纯数据，不产生任何 Object3D/绘制批次）。
 *   5. **layout 障碍基线做成一等图层（t27）**：`layout.OBSTACLES` 81 条在 `createRegistry({layout})` 时
 *      即由 core 派生入册（`baselineObstacles`，同样不被 `unregisterZone` 删除；水体 8 条换成"可拦人"的派生版本、
 *      y0 下钳到足迹地坪、宫墙 4 条的 `door.axis` 翻正为面法线轴）——因此 `allObstacles()` 在**任何装配顺序**
 *      下都包含全部基线，消费方**无需**再自行 `layout.OBSTACLES ∪ registry`（也不该用条数启发式判断）。
 *
 * 灰盒（`_greybox`）先注册全套；真实区域就位后以 `replace: true` 顶替同一区域的灰盒条目，
 * 这样"G0 灰盒 → 真实区域"的过渡不会产生重复 id，也不会出现两个区域同时拥有同一建筑。
 *
 * 零 three / 零 DOM（只比较数值结构），可在 Node 直接 import。
 */

import { CONFIG } from '../shared/config.js';
import { deriveWallColliders, assembleBaselineObstacles, insideObstacleDoor, normalizeDoorFields } from './layout-slice.js';

export class RegistryError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'RegistryError';
    this.detail = detail;
  }
}

const buildingIndexKey = (b) => b.id;

/** 粗略包围盒相交（与 y 无关，用于拾取/邻近查询）。 */
export function boundsOverlap(a, c, padding = 0) {
  if (!a || !c) return false;
  return (
    a.minX - padding <= c.maxX && a.maxX + padding >= c.minX && a.minZ - padding <= c.maxZ && a.maxZ + padding >= c.minZ
  );
}

export function boundsContains(bounds, x, z) {
  return !!bounds && x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * 创建注册表。
 * @param {{ config?: object, events?: object, layout?: object }} options
 */
export function createRegistry({ config = CONFIG, events = null, layout = null, deriveWallColliders: deriveWalls = true } = {}) {
  /** @type {Map<string, object>} 建筑（建筑 id → building，含 zone/registrySource） */
  const buildings = new Map();
  /** @type {Map<string, string>} 建筑 id → 提供方（'GREYBOX' | 'B' | ...） */
  const buildingSource = new Map();
  /** 碰撞（区域自报的条目；院墙/宫墙碰撞在 wallObstacles 独立图层） */
  const colliders = { obstacles: new Map(), walkable: new Map(), ramps: new Map() };
  /** @type {Map<string, object>} core 统一派生的墙体碰撞盒（宫墙 + 院墙），不受 unregisterZone 影响 */
  const wallObstacles = new Map();
  /** @type {Map<string, object>} layout.OBSTACLES 的一等基线图层（81 条；水体已换成可拦人的派生版） */
  const baselineObstacles = new Map();
  /** 真实单区 id 集合：用于区分"区域回显本区障碍"与"跨区登记他人障碍"（后者是冲突） */
  const SINGLE_ZONE_IDS = new Set((layout?.ZONES ?? []).map((z) => z.id));
  /** 基线组装统计（对账用） */
  let baselineStats = { total: 0, waterReplaced: 0, y0Clamped: 0, doorAxisFlipped: 0 };
  /** 已去重的同墙条目（诊断/量化证据） */
  const dedupedObstacles = [];
  /** @type {Map<string, object>} 视角（全局表 + 区域回显） */
  const viewpoints = new Map();
  /** layout 冻结基线（区域遮蔽后仍保留，区域卸载时回滚） */
  const viewpointBase = new Map();
  /** @type {Map<string, object>} 灯位 */
  const lightAnchors = new Map();
  /** layout 冻结灯位基线 */
  const lightAnchorBase = new Map();
  /** @type {Map<string, object>} 跨区通道（每个 id 只能有一个 owner，契约 §5 唯一 owner） */
  const connectors = new Map();
  /** @type {Map<string, object>} layout 冻结连接基线（跨区通道）；区域可遮蔽，不删除 */
  const connectorBase = new Map();
  /** @type {Map<string, object>} 已装载区域 */
  const zones = new Map();
  /** 事件计数 */
  const counter = { registered: 0, replaced: 0, rejected: 0, dedupedObstacles: 0, connectorDeduped: 0 };

  const ownerOfBuilding = new Map(); // buildingId → zoneId

  function fail(message, detail) {
    counter.rejected += 1;
    throw new RegistryError(message, detail);
  }

  /* ------------------------------------------------------------- 墙体碰撞层 */

  /**
   * 登记 core 派生的墙体碰撞盒（幂等：同 id 覆盖）。
   * @param {object[]} list
   * @returns {number} 图层内条目数
   */
  function registerWallColliders(list) {
    if (!Array.isArray(list)) fail('registerWallColliders 需要数组', {});
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || item.id.length === 0) fail('墙体碰撞盒缺少字符串 id', { item });
      if (!item.bounds || !Number.isFinite(item.y0) || !Number.isFinite(item.y1)) fail(`墙体碰撞盒 ${item.id} 字段不全（需要 bounds/y0/y1）`, { item });
      wallObstacles.set(item.id, item);
    }
    return wallObstacles.size;
  }

  /**
   * 派生墙 id 集合（惰性 + 按图层规模缓存）：图层在装配期才填充，因此不能在定义时就算好，
   * 否则 `WALL-CITY` 这类聚合 id 会因为集合为空而漏判（曾经的实际缺陷）。
   */
  /**
   * 登记 layout 障碍基线图层（幂等：同 id 覆盖）。水体条目已由 `assembleBaselineObstacles` 换成可拦人的派生版。
   * @param {object[]} list
   */
  function registerBaselineObstacles(list) {
    if (!Array.isArray(list)) fail('registerBaselineObstacles 需要数组', {});
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || item.id.length === 0) fail('基线障碍缺少字符串 id', { item });
      if (!item.bounds || !Number.isFinite(item.y0) || !Number.isFinite(item.y1)) fail(`基线障碍 ${item.id} 字段不全（需要 bounds/y0/y1）`, { item });
      baselineObstacles.set(item.id, { ...item, registrySource: 'layout-baseline' });
    }
    return baselineObstacles.size;
  }

  let derivedWallIdCache = { size: -1, ids: [], set: new Set() };
  function derivedWallIdList() {
    if (derivedWallIdCache.size === wallObstacles.size) return derivedWallIdCache;
    const ids = [...wallObstacles.values()]
      .flatMap((o) => (Array.isArray(o.wallIds) && o.wallIds.length > 0 ? o.wallIds : [o.wallId ?? o.buildingId]))
      .filter(Boolean);
    derivedWallIdCache = { size: wallObstacles.size, ids, set: new Set(ids) };
    return derivedWallIdCache;
  }

  /** 该 buildingId 是否指向一段已派生的墙（含 `WALL-CITY` → `WALL-CITY-south` 这类前缀匹配）。 */
  function refersToDerivedWall(buildingId) {
    if (typeof buildingId !== 'string' || buildingId.length === 0) return false;
    const cache = derivedWallIdList();
    if (cache.set.has(buildingId)) return true;
    for (const wallId of cache.ids) {
      if (wallId.startsWith(`${buildingId}-`)) return true;
    }
    return false;
  }

  /** 与墙体图层几何重合的已有条目（兜底：id/身份都对不上但盒体相同）。 */
  function geometryDuplicateOfWall(item) {
    if (!item?.bounds) return null;
    for (const box of wallObstacles.values()) {
      const b = box.bounds;
      if (Math.abs(b.minX - item.bounds.minX) > 0.3) continue;
      if (Math.abs(b.maxX - item.bounds.maxX) > 0.3) continue;
      if (Math.abs(b.minZ - item.bounds.minZ) > 0.3) continue;
      if (Math.abs(b.maxZ - item.bounds.maxZ) > 0.3) continue;
      const y0 = Number.isFinite(item.y0) ? item.y0 : b.y0;
      const y1 = Number.isFinite(item.y1) ? item.y1 : b.y1;
      const overlap = Math.min(b.y1, y1) - Math.max(b.y0, y0);
      const minHeight = Math.min(b.y1 - b.y0, y1 - y0);
      if (minHeight > 0 && overlap / minHeight >= 0.5) return box;
    }
    return null;
  }

  /**
   * 判断某个（区域自报的）碰撞盒是否与 core 派生的墙体碰撞重复。
   * 规则：① id 命中图层；② sourceType='wall' 且 buildingId 指向已派生墙；③ 盒体几何重合。
   */
  function wallDuplicate(item, zoneId = null) {
    if (!item) return null;
    // ① 基线图层已内建：同 id 的条目以基线为准。但**只有**以下情形才允许去重：
    //    · 条目属于本区（正常的"本区回显"）或墙体类（t23 已收口）或登记方是基础层（GREYBOX 覆盖全城）；
    //    · 其它情形说明某个区域登记了**别的区域**的基线障碍 id → 这是真实冲突，必须抛错（不得静默去重）。
    const byBaselineId = baselineObstacles.get(item.id);
    if (byBaselineId) {
      const ownerZone = item.zone ?? zoneId;
      const sameZone = zoneId === null || ownerZone === zoneId;
      // 城市级装配器（GREYBOX / LAYOUT 等非单区 scope）会回显全城基线 → 允许；
      // 真实区域（SINGLE_ZONE_IDS）登记**别的**区域的基线 id → 冲突，抛错。
      const cityAssembler = !SINGLE_ZONE_IDS.has(zoneId);
      const allowed = sameZone || item.sourceType === 'wall' || cityAssembler;
      return allowed ? { box: byBaselineId, rule: 'baseline-id' } : { box: byBaselineId, rule: 'baseline-id-cross-zone', conflict: true };
    }
    // ② 水体：被基线水体盒**包含**的拦阻盒（E 的 OB-E-pond-guard、D 的 5 段池面守卫）都是冗余的
    if (item.sourceType === 'water' && item.bounds) {
      for (const box of baselineObstacles.values()) {
        if (box.sourceType !== 'water') continue;
        const b = box.bounds;
        const contained =
          item.bounds.minX >= b.minX - 0.5 && item.bounds.maxX <= b.maxX + 0.5 && item.bounds.minZ >= b.minZ - 0.5 && item.bounds.maxZ <= b.maxZ + 0.5;
        if (contained) return { box, rule: 'water-contained' };
      }
    }
    if (wallObstacles.size === 0) return null;
    const byId = wallObstacles.get(item.id);
    if (byId) return { box: byId, rule: 'id' };
    if (item.sourceType !== 'wall') {
      // ③ 兜底：与基线/墙体图层几何完全一致的条目（同几何即冗余）
      for (const box of [...baselineObstacles.values(), ...wallObstacles.values()]) {
        const b = box.bounds;
        if (!b || !item.bounds) continue;
        const same =
          Math.abs(b.minX - item.bounds.minX) <= 0.05 &&
          Math.abs(b.maxX - item.bounds.maxX) <= 0.05 &&
          Math.abs(b.minZ - item.bounds.minZ) <= 0.05 &&
          Math.abs(b.maxZ - item.bounds.maxZ) <= 0.05 &&
          Math.abs((box.y0 ?? 0) - (item.y0 ?? 0)) <= 0.3;
        if (same) return { box, rule: 'geometry' };
      }
      return null;
    }
    if (refersToDerivedWall(item.buildingId)) {
      const owner = [...wallObstacles.values()].find((box) =>
        (Array.isArray(box.wallIds) && box.wallIds.includes(item.buildingId)) || box.wallId === item.buildingId,
      );
      // layout 的聚合宫墙条目（buildingId='WALL-CITY'）匹配墙名前缀
      const byPrefix = owner ?? [...wallObstacles.values()].find((box) => (box.wallIds ?? []).some((id) => id.startsWith(`${item.buildingId}-`)));
      return { box: byPrefix ?? null, rule: 'buildingId' };
    }
    const byGeometry = geometryDuplicateOfWall(item);
    return byGeometry ? { box: byGeometry, rule: 'geometry' } : null;
  }

  if (layout && Array.isArray(layout.WALLS) && deriveWalls !== false) {
    registerWallColliders(deriveWallColliders(layout.WALLS, { helpers: layout }));
  }
  if (layout && Array.isArray(layout.CONNECTORS)) {
    // 连接基线：任何装配顺序下 allConnectors() 都有全城 32 条（区域装配后接管 owner）
    registerLayoutConnectors(layout.CONNECTORS);
  }
  if (layout && Array.isArray(layout.OBSTACLES) && deriveWalls !== false) {
    const { list, stats } = assembleBaselineObstacles({ obstacles: layout.OBSTACLES, helpers: layout });
    registerBaselineObstacles(list);
    baselineStats = stats;
  }

  /* ------------------------------------------------------------------ 建筑 */

  /**
   * 注册一个区域的建筑列表（逐字段回显 layout.SLOTS 的数值由契约校验负责，这里只保证 id 语义）。
   * @param {string} zoneId
   * @param {object[]} list
   * @param {{ replace?: boolean, source?: string }} [options]
   */
  function registerBuildings(zoneId, list, options = {}) {
    if (!Array.isArray(list)) fail(`区域 ${zoneId} 的 buildings 必须是数组`, { zoneId });
    const source = options.source ?? zoneId;
    const accepted = [];
    for (const building of list) {
      if (!building || typeof building !== 'object') fail(`区域 ${zoneId} 的 buildings 含非对象条目`, { zoneId });
      if (typeof building.id !== 'string' || building.id.length === 0) fail(`区域 ${zoneId} 的建筑缺少字符串 id`, { zoneId, building });
      const existing = buildings.get(building.id);
      const existingSource = buildingSource.get(building.id);
      if (existing && existingSource !== source) {
        const existingZone = existing.zone;
        const sameZone = existingZone === zoneId;
        if (!(options.replace && sameZone)) {
          fail(
            `建筑 id 全局重复："${building.id}"（已由 ${existingSource}/${existingZone} 注册，${source} 再次注册）`,
            { buildingId: building.id, existingSource, source },
          );
        }
        counter.replaced += 1;
      }
      buildings.set(building.id, building);
      buildingSource.set(building.id, source);
      ownerOfBuilding.set(building.id, building.zone ?? zoneId);
      accepted.push(building.id);
    }
    counter.registered += accepted.length;
    return accepted;
  }

  function unregisterZone(zoneId) {
    let removed = 0;
    for (const [id, zone] of ownerOfBuilding) {
      if (zone !== zoneId) continue;
      buildings.delete(id);
      buildingSource.delete(id);
      ownerOfBuilding.delete(id);
      removed += 1;
    }
    for (const [id, item] of colliders.obstacles) if (item.zone === zoneId) colliders.obstacles.delete(id);
    for (const [id, item] of colliders.walkable) if (item.zone === zoneId) colliders.walkable.delete(id);
    for (const [id, item] of colliders.ramps) if (item.zone === zoneId) colliders.ramps.delete(id);
    // 视角/灯位/通道：只删该区域自己提供的条目；layout 冻结基线被遮蔽时**回滚**而不是删除
    for (const [id, item] of viewpoints) {
      if (item.registrySource === 'layout') continue;
      if (item.zone !== zoneId) continue;
      if (viewpointBase.has(id)) viewpoints.set(id, viewpointBase.get(id));
      else viewpoints.delete(id);
    }
    for (const [id, item] of lightAnchors) {
      if (item.registrySource === 'layout') continue;
      if (item.zone !== zoneId) continue;
      if (lightAnchorBase.has(id)) lightAnchors.set(id, lightAnchorBase.get(id));
      else lightAnchors.delete(id);
    }
    for (const [id, item] of connectors) {
      if (item.registrySource === 'layout') continue;
      if (item.ownerZone !== zoneId) continue;
      if (connectorBase.has(id)) connectors.set(id, connectorBase.get(id));
      else connectors.delete(id);
    }
    return removed;
  }

  function getBuilding(id) {
    return buildings.get(id) ?? null;
  }

  function allBuildings() {
    return [...buildings.values()];
  }

  function buildingsByZone(zoneId) {
    return allBuildings().filter((b) => b.zone === zoneId);
  }

  /** 按世界坐标点查询命中的建筑（包围盒内，按 y1 升序取最小体量者）。 */
  function buildingsAt(x, z) {
    return allBuildings()
      .filter((b) => boundsContains(b.bounds, x, z))
      .sort((a, b) => (a.totalHeight ?? 0) - (b.totalHeight ?? 0));
  }

  function buildingsInBounds(bounds) {
    return allBuildings().filter((b) => boundsOverlap(b.bounds, bounds));
  }

  /* ------------------------------------------------------------------ 碰撞 */

  /**
   * 注册碰撞数据。obstacles / walkable / ramps 的 id 同样要求全局唯一。
   * @param {string} zoneId
   * @param {{ obstacles?: object[], walkable?: object[], ramps?: object[] }} data
   */
  function registerColliders(zoneId, data = {}) {
    const buckets = [
      ['obstacles', data.obstacles ?? []],
      ['walkable', data.walkable ?? []],
      ['ramps', data.ramps ?? []],
    ];
    const counts = {};
    const dedupedThisCall = [];
    for (const [kind, list] of buckets) {
      if (!Array.isArray(list)) fail(`区域 ${zoneId} 的 colliders.${kind} 必须是数组`, { zoneId, kind });
      for (const item of list) {
        if (!item || typeof item.id !== 'string' || item.id.length === 0) {
          fail(`区域 ${zoneId} 的 colliders.${kind} 条目缺少字符串 id`, { zoneId, kind, item });
        }
        if (!item.bounds && kind !== 'ramps') fail(`碰撞条目 ${item.id} 缺少 bounds`, { zoneId, kind, id: item.id });
        if (kind === 'obstacles') {
          // 墙体碰撞收口（t23）+ layout 基线图层（t27）：重合条目去重；**跨区登记他区基线 id 视为冲突**
          const duplicate = wallDuplicate(item, zoneId);
          if (duplicate?.conflict) {
            fail(
              `区域 ${zoneId} 登记了属于 ${item.zone ?? '其它区域'} 的基线障碍 id "${item.id}"（跨区重复登记）`,
              { zoneId, id: item.id, ownerZone: item.zone ?? null },
            );
          }
          if (duplicate) {
            counter.dedupedObstacles += 1;
            dedupedThisCall.push(item.id);
            dedupedObstacles.push({
              id: item.id,
              zone: zoneId,
              rule: duplicate.rule,
              keptBy: duplicate.box?.id ?? 'core:walls',
              note: '与 core 派生的墙体碰撞重合 → 不再重复登记（不产生额外 Object3D/绘制批次）',
            });
            continue;
          }
        }
        if (colliders[kind].has(item.id)) {
          fail(`碰撞 id 全局重复："${item.id}"（colliders.${kind}）`, { zoneId, kind, id: item.id });
        }
        colliders[kind].set(item.id, { ...item, zone: item.zone ?? zoneId });
      }
      counts[kind] = colliders[kind].size;
    }
    counts.wallObstacles = wallObstacles.size;
    /** 本次调用被去重的条数（每次注册单独计数） */
    counts.dedupedObstacles = dedupedThisCall.length;
    /** 累计去重条数（诊断用） */
    counts.dedupedTotal = dedupedObstacles.length;
    counts.dedupedIds = dedupedThisCall;
    // 跨区通道：兼容"把 connectors 塞进 colliders 负载"的写法 —— 统一走 registerConnectors（同一套唯一 owner 校验）
    if (Array.isArray(data.connectors) && data.connectors.length > 0) {
      counts.connectors = registerConnectors(zoneId, data.connectors).accepted.length;
    }
    return counts;
  }

  /**
   * 全部障碍：core 内建基线图层（layout.OBSTACLES 81 条）+ 派生墙体图层 + 区域自报条目（已去重）。
   * **任何装配顺序**下基线都在册，消费方无需再自行 union。
   */
  function allObstacles() {
    return [...baselineObstacles.values(), ...wallObstacles.values(), ...colliders.obstacles.values()];
  }

  /**
   * 点查询：返回**真正会阻挡该点**的障碍（门洞通道内的点被豁免，语义与 `obstacleBlocksPoint` 一致）。
   * 旧实现只看包围盒包含关系，会把"门洞中心"也当成命中。
   */
  function obstacleAt(x, z) {
    for (const item of allObstacles()) {
      if (!boundsContains(item.bounds, x, z)) continue;
      if (item.blocks === 'exceptDoor' && insideObstacleDoor(normalizeDoorFields(item.door, item.bounds), item.bounds, x, z)) continue;
      return item;
    }
    return null;
  }

  function allWalkable() {
    return [...colliders.walkable.values()].sort((a, b) => (b.y ?? 0) - (a.y ?? 0));
  }

  function allRamps() {
    return [...colliders.ramps.values()];
  }

  /* ------------------------------------------------------------------ 视角 */

  /**
   * 注册视角。允许的替换只有两种：
   *   a) 同一个区域（source 相同）自更新；
   *   b) **顶替 layout 冻结基线**——契约 §5.1 要求区域按 id 回显 layout.VIEWPOINTS 的值，
   *      因此同 id 覆盖基线是预期行为（基线条目永不被删除，只是被区域版本遮蔽）。
   * @param {string} zoneId
   * @param {object[]} list
   * @param {{ replace?: boolean, source?: string }} [options]
   */
  function registerViewpoints(zoneId, list, options = {}) {
    if (!Array.isArray(list)) fail(`区域 ${zoneId} 的 viewpoints 必须是数组`, { zoneId });
    const source = options.source ?? zoneId;
    const accepted = [];
    for (const vp of list) {
      if (!vp || typeof vp.id !== 'string' || vp.id.length === 0) fail(`区域 ${zoneId} 的 viewpoint 缺少字符串 id`, { zoneId, vp });
      const existing = viewpoints.get(vp.id);
      if (existing && existing.registrySource !== source && existing.registrySource !== 'layout') {
        if (!(options.replace && existing.zone === zoneId)) {
          fail(`视角 id 全局重复："${vp.id}"（已由 ${existing.registrySource} 注册）`, { zoneId, id: vp.id });
        }
        counter.replaced += 1;
      }
      viewpoints.set(vp.id, { ...vp, zone: vp.zone ?? vp.area ?? zoneId, registrySource: source });
      accepted.push(vp.id);
    }
    return accepted;
  }

  /**
   * 跨区通道（连接）登记 —— t36 修复的核心。
   *
   * 历史缺陷（V1/t12 报告 §5 C-2）：登记循环写在 `registerColliders()` 里读 `data.connectors`，
   * 而 `registerZone()` 只传 `result.colliders` → **那段分支永不执行**，于是：
   *   · `allConnectors()` 恒为空、`stats().connectors === 0`；
   *   · "连接 id 唯一 owner"校验形同不存在（无输入 ⇒ 永不报错）—— 静默失效，长期未暴露。
   * 现在：连接由 `registerConnectors()` 统一登记（`registerZone` 显式传入 `result.connectors`），
   * 校验真实生效，并把 `layout.CONNECTORS` 作为冻结基线（任何装配顺序下都在册、区域可遮蔽、卸载回滚）。
   */
  function registerConnectors(zoneId, list, options = {}) {
    if (!Array.isArray(list)) fail(`区域 ${zoneId} 的 connectors 必须是数组`, { zoneId });
    const isSingleZone = SINGLE_ZONE_IDS.has(zoneId); // 真实单区（B/C/D/E/F）；城市级装配器（GREYBOX/LAYOUT）为 false
    const accepted = [];
    let deduped = 0;
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || item.id.length === 0) fail(`区域 ${zoneId} 的 connector 缺少字符串 id`, { zoneId, item });
      if (!item.position || !Number.isFinite(item.position.x) || !Number.isFinite(item.position.z)) {
        fail(`连接 ${item.id} 缺少合法 position（{x,z} 有限数）`, { zoneId, id: item.id, position: item.position ?? null });
      }
      const declaredOwner = item.owner ?? zoneId;
      // ① 真实区域不得登记声明 owner 属于别的区域的连接（唯一 owner 规则的"声明侧"）
      if (isSingleZone && declaredOwner !== zoneId) {
        fail(`连接 ${item.id} 声明 owner="${declaredOwner}"，却由区域 ${zoneId} 登记（唯一 owner 规则：声明 owner 必须等于登记区域）`, {
          zoneId,
          id: item.id,
          declaredOwner,
        });
      }
      const existing = connectors.get(item.id);
      if (existing) {
        const previousOwner = existing.owner ?? existing.ownerZone;
        const previousIsBaseline = existing.registrySource === 'layout';
        const previousIsCity = !SINGLE_ZONE_IDS.has(existing.ownerZone);
        // ② 同一 id 被两个不同 owner 登记 → 必须报错（唯一 owner 的核心校验）
        if (previousOwner !== declaredOwner) {
          fail(
            `跨区通道 id 重复："${item.id}"（唯一 owner 规则：已由 owner="${previousOwner}" 登记，现又被 owner="${declaredOwner}"（${zoneId}）登记）`,
            { zoneId, id: item.id, existingOwner: previousOwner, declaredOwner },
          );
        }
        // ③ 城市级装配器（GREYBOX/LAYOUT）回显已被真实区域接管的连接 → 幂等保留更具体的 owner，不报错
        if (!isSingleZone && !previousIsBaseline && !previousIsCity && existing.ownerZone !== zoneId) {
          deduped += 1;
          continue;
        }
        // ④ 两个真实区域抢同一 id → 报错
        if (!previousIsBaseline && !previousIsCity && existing.ownerZone !== zoneId) {
          fail(`跨区通道 id 重复："${item.id}"（唯一 owner 规则：已由区域 ${existing.ownerZone} 登记，区域 ${zoneId} 再次登记）`, {
            zoneId,
            id: item.id,
            existingOwner: existing.ownerZone,
          });
        }
        // ⑤ 同区域重复登记同一条 → 幂等（去重，不报错）
        if (existing.ownerZone === zoneId) {
          deduped += 1;
        }
      }
      connectors.set(item.id, { ...item, ownerZone: zoneId, registrySource: isSingleZone ? zoneId : 'layout-baseline' });
      accepted.push(item.id);
    }
    counter.connectorDeduped += deduped;
    return { accepted, deduped };
  }

  /** 全局冻结连接表（layout.CONNECTORS）作为基线（source='layout'）：区域可遮蔽，卸载时回滚。 */
  function registerLayoutConnectors(list) {
    for (const c of list) {
      const entry = { ...c, ownerZone: 'LAYOUT', registrySource: 'layout' };
      connectorBase.set(c.id, entry);
      connectors.set(c.id, entry);
    }
    return connectors.size;
  }

  /** 全局冻结视角表（layout.VIEWPOINTS）作为基线注册（source='layout'）。 */
  function registerLayoutViewpoints(list) {
    for (const vp of list) {
      const entry = { ...vp, zone: vp.area, registrySource: 'layout' };
      viewpointBase.set(vp.id, entry);
      viewpoints.set(vp.id, entry);
    }
    return viewpoints.size;
  }
  /** layout 冻结灯位基线（区域可遮蔽，不删除）。 */
  function registerLayoutLightAnchors(list) {
    for (const anchor of list) {
      const entry = { ...anchor, registrySource: 'layout' };
      lightAnchorBase.set(anchor.id, entry);
      lightAnchors.set(anchor.id, entry);
    }
    return lightAnchors.size;
  }

  function getViewpoint(id) {
    return viewpoints.get(id) ?? null;
  }

  function allViewpoints() {
    return [...viewpoints.values()];
  }

  function viewpointsByMode(mode) {
    return allViewpoints().filter((v) => v.mode === mode);
  }

  function viewpointsByArea(area) {
    return allViewpoints().filter((v) => (v.area ?? v.zone) === area);
  }

  /** 最近的 fp-spawn（第一人称进入用，§5.4）。 */
  function nearestFpSpawn(position, fallbackArea = null) {
    const candidates = viewpointsByMode('fp-spawn').filter((v) => (fallbackArea ? (v.area ?? v.zone) === fallbackArea : true));
    const pool = candidates.length > 0 ? candidates : viewpointsByMode('fp-spawn');
    let best = null;
    let bestDist = Infinity;
    for (const vp of pool) {
      const dx = vp.position.x - position.x;
      const dz = vp.position.z - position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = vp;
      }
    }
    return best ? { viewpoint: best, distance: bestDist } : null;
  }

  /* ------------------------------------------------------------------ 灯位 */

  function registerLightAnchors(zoneId, list, options = {}) {
    if (!Array.isArray(list)) fail(`区域 ${zoneId} 的 lightAnchors 必须是数组`, { zoneId });
    const source = options.source ?? zoneId;
    for (const anchor of list) {
      if (!anchor || typeof anchor.id !== 'string' || anchor.id.length === 0) fail(`区域 ${zoneId} 的 lightAnchor 缺少字符串 id`, { zoneId, anchor });
      if (!anchor.position || !Number.isFinite(anchor.position.x)) fail(`灯位 ${anchor.id} 缺少 position`, { zoneId, anchor });
      const existing = lightAnchors.get(anchor.id);
      // 与视角同理：layout 冻结基线条目可以被区域版本遮蔽（契约 §8.3 区域"按此实现"）
      if (existing && existing.registrySource !== source && existing.registrySource !== 'layout' && !(options.replace && existing.zone === zoneId)) {
        fail(`灯位 id 全局重复："${anchor.id}"`, { zoneId, id: anchor.id });
      }
      lightAnchors.set(anchor.id, { ...anchor, zone: anchor.zone ?? zoneId, registrySource: source });
    }
    return list.length;
  }

  function allLightAnchors() {
    return [...lightAnchors.values()];
  }

  /** 按到 position 的距离升序取前 n 个灯位（环境系统按距离/重要性激活）。 */
  function nearestLightAnchors(position, limit = Infinity, maxDistance = Infinity) {
    return allLightAnchors()
      .map((a) => ({ anchor: a, distance: Math.hypot(a.position.x - position.x, (a.position.y ?? 0) - (position.y ?? 0), a.position.z - position.z) }))
      .filter((r) => r.distance <= maxDistance)
      .sort((p, q) => p.distance - q.distance)
      .slice(0, limit);
  }

  /* ------------------------------------------------------------------ 区域 */

  /**
   * 注册一个已通过契约校验的区域（buildings/connectors/colliders/viewpoints/lightAnchors）。
   * @param {string} zoneId
   * @param {object} result createZone 的返回值
   * @param {{ replace?: boolean }} [options]
   */
  function registerZone(zoneId, result, options = {}) {
    if (!result || typeof result !== 'object') fail(`区域 ${zoneId} 的返回值不是对象`, { zoneId });
    const replace = options.replace === true;
    if (replace) unregisterZone(zoneId);
    const registered = {
      zoneId,
      buildings: registerBuildings(zoneId, result.buildings ?? [], { replace, source: zoneId }),
      colliders: registerColliders(zoneId, result.colliders ?? {}),
      // t36：连接必须在装配时真正登记（V1 §5 C-2：此前只有 colliders 被传入 → 连接分支永不执行）
      connectors: registerConnectors(zoneId, result.connectors ?? [], { replace }).accepted.length,
      viewpoints: registerViewpoints(zoneId, result.viewpoints ?? [], { replace, source: zoneId }),
      lightAnchors: registerLightAnchors(zoneId, result.lightAnchors ?? [], { replace, source: zoneId }),
    };
    zones.set(zoneId, { zoneId, stats: registered, registeredAt: Date.now() });
    if (events) {
      events.emit(config.EVENTS.zoneLoaded, { zone: zoneId, stats: registered });
    }
    return registered;
  }

  function unregisterZoneAndNotify(zoneId) {
    const existed = zones.has(zoneId);
    unregisterZone(zoneId);
    zones.delete(zoneId);
    return existed;
  }

  function stats() {
    return {
      zones: [...zones.keys()],
      buildings: buildings.size,
      buildingsByZone: allBuildings().reduce((acc, b) => {
        acc[b.zone] = (acc[b.zone] ?? 0) + 1;
        return acc;
      }, {}),
      connectors: connectors.size,
      connectorOwners: [...connectors.keys()].reduce((acc, id) => {
        const entry = connectors.get(id);
        acc[entry.ownerZone] = (acc[entry.ownerZone] ?? 0) + 1;
        return acc;
      }, {}),
      connectorsDeduped: counter.connectorDeduped,
      viewpoints: viewpoints.size,
      viewpointsByMode: allViewpoints().reduce((acc, v) => {
        acc[v.mode] = (acc[v.mode] ?? 0) + 1;
        return acc;
      }, {}),
      lightAnchors: lightAnchors.size,
      obstacles: colliders.obstacles.size + wallObstacles.size + baselineObstacles.size,
      obstaclesBySource: {
        layoutBaseline: baselineObstacles.size,
        coreWalls: wallObstacles.size,
        zones: colliders.obstacles.size,
        deduped: dedupedObstacles.length,
      },
      baseline: { ...baselineStats },
      wallColliders: wallObstacles.size,
      wallCollidersByZone: [...wallObstacles.values()].reduce((acc, o) => {
        acc[o.zone] = (acc[o.zone] ?? 0) + 1;
        return acc;
      }, {}),
      walkable: colliders.walkable.size,
      ramps: colliders.ramps.size,
      counter: { ...counter },
    };
  }

  return {
    registerZone,
    registerBuildings,
    registerColliders,
    registerWallColliders,
    registerBaselineObstacles,
    registerConnectors,
    registerLayoutConnectors,
    wallColliders: () => [...wallObstacles.values()],
    /** layout.OBSTACLES 的一等基线图层（81 条；水体已换成可拦人的派生版） */
    baselineColliders: () => [...baselineObstacles.values()],
    baselineStats: () => ({ ...baselineStats }),
    dedupedObstacleReport: () => dedupedObstacles.map((d) => ({ ...d })),
    registerViewpoints,
    registerLayoutViewpoints,
    registerLayoutLightAnchors,
    registerLightAnchors,
    unregisterZone: unregisterZoneAndNotify,
    getBuilding,
    allBuildings,
    buildingsByZone,
    buildingsAt,
    buildingsInBounds,
    obstacleAt,
    allObstacles,
    allWalkable,
    allRamps,
    getViewpoint,
    allViewpoints,
    viewpointsByMode,
    viewpointsByArea,
    nearestFpSpawn,
    allLightAnchors,
    nearestLightAnchors,
    allConnectors: () => [...connectors.values()],
    zones: () => [...zones.values()],
    stats,
    /** 诊断：全部已注册 id（测试断言全局唯一用） */
    ids() {
      return {
        buildings: [...buildings.keys()],
        viewpoints: [...viewpoints.keys()],
        lightAnchors: [...lightAnchors.keys()],
        obstacles: [...baselineObstacles.keys(), ...wallObstacles.keys(), ...colliders.obstacles.keys()],
        walkable: [...colliders.walkable.keys()],
        ramps: [...colliders.ramps.keys()],
        connectors: [...connectors.keys()],
      };
    },
    /** 断言全局唯一：返回重复 id 的清单（空数组 = 通过） */
    duplicateIds() {
      const dupes = [];
      const all = [
        ['buildings', [...buildings.keys()]],
        ['viewpoints', [...viewpoints.keys()]],
        ['lightAnchors', [...lightAnchors.keys()]],
        ['obstacles', [...baselineObstacles.keys(), ...wallObstacles.keys(), ...colliders.obstacles.keys()]],
        ['walkable', [...colliders.walkable.keys()]],
        ['ramps', [...colliders.ramps.keys()]],
        ['connectors', [...connectors.keys()]],
      ];
      for (const [kind, ids] of all) {
        const seen = new Set();
        for (const id of ids) {
          if (seen.has(id)) dupes.push({ kind, id });
          seen.add(id);
        }
      }
      return dupes;
    },
  };
}

export { buildingIndexKey };
export default createRegistry;
