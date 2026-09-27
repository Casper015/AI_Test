/**
 * 区域布局切片（CONTRACTS §3.2 `ctx.zoneLayout`）—— 由 `src/shared/layout.js` 派生，不含任何自造数值。
 *
 * 每个区域只拿到"属于自己的那一份"：slots/courtyards/roads/terraces/walkable/obstacles 按区过滤，
 * connectors 只给本人 owner 的条目，neighbours 由几何相邻探测得出（不硬编码）。
 *
 * 零 three / 零 DOM，可在 Node 直接 import。
 */

import { CONFIG, TERRAIN, INTERACTION } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';

const { ZONES, SLOTS, COURTYARDS, CONNECTORS, ROADS, TERRACES, WALKABLE, OBSTACLES, WALLS, VIEWPOINTS, LIGHT_ANCHORS, VEGETATION, OUTER_BOUNDS, ENVELOPE, WATER_BODIES, SCENIC_OBJECTS, BRIDGES, INTERIOR_BY_SLOT } = LAYOUT;

/** 区域 id 列表（B/C/D/E/F）。 */
export const ZONE_IDS = Object.freeze(ZONES.map((z) => z.id));

const ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]));

const inBounds = (bounds, x, z) => !!bounds && x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;

/* =============================================================================
 * 墙体碰撞派生（t23 修复）：`layout.WALLS` 是唯一真相源，全城只派生一次
 * =============================================================================
 * 背景（两条独立上报）：① `layout.WALLS`（60 条）只有 `owner`（0 条有 `zone`），
 * 旧切片用 `w.zone === zoneId` 过滤 → 所有区域的 `courtyardWalls` 恒空；
 * ② 56 段院墙既不在 `layout.OBSTACLES`，灰盒也未登记 → 第一人称不会被院墙阻挡（G3）。
 *
 * 裁定：碰撞归属收口到 core —— 从 `WALLS` 统一派生宫墙 + 院墙的实心碰撞盒
 * （扣除 `openings` 门洞 → 门洞自然成为可通行缺口；底座标高取 `floorYAt`），
 * D/E/F 今后无需各自实现同一逻辑（C/E 已自补的条目由 registry 去重）。
 */

/** 墙脚埋深：把碰撞盒底面稍微下沉，避免地面微差导致"从缝里挤过去"。 */
const WALL_COLLIDER_EMBED = 0.15;

/** 派生统计（测试与审计用；数值在模块加载时由冻结布局算出）。 */
export const WALL_COLLIDER_STATS = { walls: 0, wallsDerived: 0, wallsCoveredByLayout: 0, spans: 0, openings: 0, byZone: {} };

/**
 * 一段墙的"实心区间"（沿墙轴的世界坐标 `[[lo, hi], ...]`）：扣除 `openings` 门洞后的墙身。
 * 门洞净宽直接取 `openings[].width`；开口重叠时取并集。
 */
export function wallSolidSpans(wall, { tolerance = 0.05 } = {}) {
  const horizontal = wall.axis === 'x';
  const lo = horizontal ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z);
  const hi = horizontal ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z);
  const gaps = (wall.openings ?? [])
    .map((o) => [o.at - o.width / 2, o.at + o.width / 2])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const gap of gaps) {
    const last = merged[merged.length - 1];
    if (last && gap[0] <= last[1] + tolerance) last[1] = Math.max(last[1], gap[1]);
    else merged.push([gap[0], gap[1]]);
  }

  const spans = [];
  let cursor = lo;
  for (const [a, b] of merged) {
    const start = Math.max(lo, a);
    if (start > cursor + tolerance) spans.push([cursor, start]);
    cursor = Math.max(cursor, b);
  }
  if (hi > cursor + tolerance) spans.push([cursor, hi]);
  return spans;
}

/**
 * 沿一段墙取该处地坪：沿墙取 3 点（两端 + 中点），每点再向墙**两侧**各偏移一次，
 * 取全部有效采样的**最低值**。这样墙脚不会在某一侧悬空（例如 B/C 交界的 z=80 墙，
 * 北侧 C 地坪 0.9、南侧 B 地坪 0，盒底必须落到 0 一侧），跨标高的墙段也仍然阻挡。
 */
function floorAlongWall(helpers, wall, a, b, fallback = 0) {
  const horizontal = wall.axis === 'x';
  const line = horizontal ? wall.from.z : wall.from.x;
  const offsets = [0, wall.thickness / 2 + 0.6, -(wall.thickness / 2 + 0.6)];
  const values = [];
  for (const v of [a, (a + b) / 2, b]) {
    for (const offset of offsets) {
      const point = horizontal ? { x: v, z: line + offset } : { x: line + offset, z: v };
      const y = typeof helpers?.floorYAt === 'function' ? helpers.floorYAt(point.x, point.z) : null;
      if (Number.isFinite(y)) values.push(y);
    }
  }
  if (values.length === 0) {
    const ground = typeof helpers?.groundYAt === 'function' ? helpers.groundYAt(horizontal ? (a + b) / 2 : line, horizontal ? line : (a + b) / 2) : null;
    return Number.isFinite(ground) ? ground : fallback;
  }
  return Math.min(...values);
}

/**
 * 由 `layout.WALLS` 统一派生墙体碰撞盒（宫墙 + 院墙），返回冻结格式的 Obstacle 数组
 * （CONTRACTS §6.3：`{ id, sourceType:'wall', zone, buildingId, bounds, y0, y1, blocks:'all', door:null }`）。
 *
 * 关于宫墙：`layout.OBSTACLES` 里另有 4 条 `OB-WALL-CITY-*`，其 `door.axis` 是"墙的走向轴"，
 * 与环境/第一人称对建筑用的"正面法线轴"语义相反（第一人称求解器按建筑语义解释 → 整条宫墙都变成可穿）。
 * 因此这里对宫墙也**统一派生**（门洞取 `openings`，26m 净宽），并让 registry 去重时以本派生为准。
 */
export function deriveWallColliders(walls = WALLS, { helpers = LAYOUT, embed = WALL_COLLIDER_EMBED } = {}) {
  const out = [];
  /**
   * 先按（owner + 轴向 + 墙线 + 厚度 + 墙高）分组：`layout.WALLS` 里同一道实体墙可能被拆成两条
   * 相邻院落的墙记录（例如 `CY-B-plaza-wall-north` 与 `CY-B-throne-wall-south` 同在 z=-180），
   * 若不归并就会得到两份完全重合的碰撞盒（重复阻挡 + 冗余盒）。归并规则与区域侧的历史实现一致。
   */
  const groups = new Map();
  for (const wall of walls) {
    const horizontal = wall.axis === 'x';
    const line = horizontal ? wall.from.z : wall.from.x;
    // 注意：key **不含 owner** —— B 的后殿院北墙与 C 的内廷院南墙同在 z=80，是同一道实体墙；
    // 归并后由 `wallIds` 同时归属两个区域（各区的 wallColliders 用 wallIds 交集过滤）。
    const key = `${wall.axis}|${line.toFixed(2)}|${wall.thickness}|${wall.height}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        owner: wall.owner,
        horizontal,
        line,
        thickness: wall.thickness,
        height: wall.height,
        walls: [],
        intervals: [],
        gaps: [],
        owners: new Set(),
      });
    }
    const group = groups.get(key);
    group.walls.push(wall);
    group.owners.add(wall.owner);
    for (const span of wallSolidSpans(wall)) group.intervals.push(span);
    for (const opening of wall.openings ?? []) group.gaps.push([opening.at - opening.width / 2, opening.at + opening.width / 2]);
  }

  let groupIndex = 0;
  for (const group of groups.values()) {
    groupIndex += 1;
    // 墙身并集
    const mergedSpans = [];
    for (const span of group.intervals.slice().sort((a, b) => a[0] - b[0])) {
      const last = mergedSpans[mergedSpans.length - 1];
      if (last && span[0] <= last[1] + 0.05) last[1] = Math.max(last[1], span[1]);
      else mergedSpans.push([span[0], span[1]]);
    }
    // 门洞并集（并集后再扣除，避免归并后的盒体落在任何一方的门洞里）
    const mergedGaps = [];
    for (const gap of group.gaps.slice().sort((a, b) => a[0] - b[0])) {
      const last = mergedGaps[mergedGaps.length - 1];
      if (last && gap[0] <= last[1] + 0.05) last[1] = Math.max(last[1], gap[1]);
      else mergedGaps.push([gap[0], gap[1]]);
    }
    const solid = [];
    for (const [a, b] of mergedSpans) {
      let cursor = a;
      for (const [gapLo, gapHi] of mergedGaps) {
        if (gapHi <= cursor || gapLo >= b) continue;
        if (gapLo > cursor) solid.push([cursor, Math.min(gapLo, b)]);
        cursor = Math.max(cursor, Math.min(gapHi, b));
      }
      if (b > cursor + 0.05) solid.push([cursor, b]);
    }

    solid.forEach(([a, b], index) => {
      const representative = group.walls[0];
      const floor = floorAlongWall(helpers, representative, a, b, 0);
      const y0 = +(floor - embed).toFixed(3);
      const y1 = +(floor + group.height).toFixed(3);
      const wallIds = group.walls.map((w) => w.id);
      const zones = [...group.owners];
      out.push({
        id: `OB-WALLRUN-${group.owner}-${group.horizontal ? 'x' : 'z'}${group.line.toFixed(2)}-span${index + 1}`,
        sourceType: 'wall',
        zone: representative.owner,
        zones,
        buildingId: representative.id,
        wallId: representative.id,
        wallIds,
        courtyardId: representative.courtyardId ?? null,
        cityWall: group.walls.every((w) => w.cityWall === true),
        bounds: group.horizontal
          ? {
              minX: +a.toFixed(3),
              maxX: +b.toFixed(3),
              minZ: +(group.line - group.thickness / 2).toFixed(3),
              maxZ: +(group.line + group.thickness / 2).toFixed(3),
            }
          : {
              minX: +(group.line - group.thickness / 2).toFixed(3),
              maxX: +(group.line + group.thickness / 2).toFixed(3),
              minZ: +a.toFixed(3),
              maxZ: +b.toFixed(3),
            },
        y0,
        y1,
        blocks: 'all',
        door: null,
        note: `core 派生：${group.walls.map((w) => w.name).join(' + ')}（共线墙已归并；门洞已在墙身中扣除，门洞处为可通行缺口）`,
      });
    });
    void groupIndex;
  }
  return out;
}

/** 某个区域自己 owner 的墙体碰撞盒（切片用，区域无需再自己实现）。 */
export function wallCollidersForZone(zoneId) {
  const owned = new Set(WALLS.filter((w) => w.owner === zoneId).map((w) => w.id));
  return deriveCityWallColliders().filter(
    (box) => box.zone === zoneId || (box.zones ?? []).includes(zoneId) || (box.wallIds ?? []).some((id) => owned.has(id)),
  );
}

/** 全城一次派生（registry / ctx.shared 消费同一份结果）。 */
export function deriveCityWallColliders() {
  return deriveWallColliders(WALLS);
}

/** 某个区域的墙体清单（含宫墙与院墙，按 owner 过滤）。 */
export function wallsForZone(zoneId) {
  return WALLS.filter((w) => w.owner === zoneId);
}


/**
 * 邻居探测：在区域边界外 2m 取中点，用 `layout.tileAt` 找对面属于谁。
 * 这样 neighbours 完全由冻结布局推出，不写死"B 的西边是 D"。
 */
function computeNeighbours(zone) {
  const r = zone.bounds;
  const midX = (r.minX + r.maxX) / 2;
  const midZ = (r.minZ + r.maxZ) / 2;
  const probe = (x, z) => {
    const hit = LAYOUT.tileAt(x, z);
    if (!hit || hit.zone === zone.id) return null;
    return hit.zone;
  };
  return {
    south: probe(midX, r.minZ - 2) ?? null,
    north: probe(midX, r.maxZ + 2) ?? null,
    west: probe(r.minX - 2, midZ) ?? null,
    east: probe(r.maxX + 2, midZ) ?? null,
  };
}

/** 区域自身的全部布局切片。 */
/* -------------------------------------------------------------------------- */
/*  t65：内景**显式寻址**（按机位/室内地面，而不是按区名猜）                      */
/*                                                                             */
/*  背景：t72/t73/t74 之后一区可有多个内景（全区 43 个）。旧的"按 zone 过滤取第一个"  */
/*  会把相机夹到**别的建筑**的室内盒里（同区多内景 ⇒ 并集/首元素，必然错）。       */
/*  这里只做**解析**（id → 记录/面/机位），包围盒格式化仍归 src/core/camera.js。    */
/* -------------------------------------------------------------------------- */

const INTERIOR_SURFACES = Object.freeze(WALKABLE.filter((w) => w.kind === 'interior'));
const INTERIOR_VIEWPOINT_LIST = Object.freeze(VIEWPOINTS.filter((v) => v.mode === 'interior'));

/** 按内景机位 id（`VP-<slotId>-interior`）取映射记录。 */
export function interiorRecordForViewpointId(viewpointId) {
  if (!viewpointId) return null;
  const direct = Object.values(INTERIOR_BY_SLOT).find((r) => r.viewpointId === viewpointId) ?? null;
  if (direct) return direct;
  // 兼容既有别名机位（VP-B-interior / VP-C-interior）：由 layout 的映射表反查
  return Object.values(INTERIOR_BY_SLOT).find((r) => r.viewpointId === viewpointId || r.slotId === viewpointId) ?? null;
}

/** 按室内可行走面 id（`WK-<slotId>-interior`）取映射记录。 */
export function interiorRecordForSurfaceId(surfaceId) {
  if (!surfaceId) return null;
  return Object.values(INTERIOR_BY_SLOT).find((r) => r.walkableId === surfaceId) ?? null;
}

/** 按建筑 slotId 取映射记录。 */
export function interiorRecordForSlot(slotId) {
  if (!slotId) return null;
  return INTERIOR_BY_SLOT[slotId] ?? null;
}

/** 室内可行走面（按 id 精确取）。 */
export function interiorSurfaceById(surfaceId) {
  if (!surfaceId) return null;
  return INTERIOR_SURFACES.find((w) => w.id === surfaceId) ?? null;
}

/** 内景机位（按 id 精确取）。 */
export function interiorViewpointById(viewpointId) {
  if (!viewpointId) return null;
  return INTERIOR_VIEWPOINT_LIST.find((v) => v.id === viewpointId) ?? null;
}

/** 某区全部室内面（按 id 排序，保证确定性）。 */
export function interiorsForZone(zoneId) {
  if (!zoneId) return [...INTERIOR_SURFACES];
  return INTERIOR_SURFACES.filter((w) => w.zone === zoneId).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** 某区全部内景机位（按 id 排序，保证确定性）。 */
export function interiorViewpointsForZone(zoneId) {
  if (!zoneId) return [...INTERIOR_VIEWPOINT_LIST];
  return INTERIOR_VIEWPOINT_LIST.filter((v) => v.area === zoneId || v.zone === zoneId).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** 内景总数（一区多内景的判定依据）。 */
export const INTERIOR_SURFACE_COUNT = INTERIOR_SURFACES.length;

export function zoneLayoutFor(zoneId) {
  const zone = ZONE_BY_ID.get(zoneId);
  if (!zone) throw new Error(`zoneLayoutFor: 未知区域 "${zoneId}"（合法：${ZONE_IDS.join('/')}）`);
  return {
    id: zone.id,
    name: zone.name,
    area: zone.area,
    owner: zone.owner,
    file: zone.file,
    bounds: zone.bounds,
    tiles: zone.tiles,
    groundY: zone.groundY,
    drawCallBudget: zone.drawCallBudget,
    boundaryZone: zone.boundaryZone === true,
    outerOverhang: LAYOUT.WALL_OUTER_OVERHANG,
    slots: SLOTS.filter((s) => s.zone === zoneId),
    courtyards: COURTYARDS.filter((c) => c.zone === zoneId),
    /**
     * 院墙：`layout.WALLS` 的条目只有 `owner`（60/60）与 `courtyardId`（56/56），**没有** `zone`。
     * t23 修复：过滤条件改为 `owner === zoneId`（旧代码用 `w.zone` → 恒空数组）。
     */
    courtyardWalls: wallsForZone(zoneId).filter((w) => w.kind === 'courtWall'),
    /** 宫墙四段（仅 F owner；与 courtyardWalls 一起构成"本区全部墙体"）。 */
    cityWalls: wallsForZone(zoneId).filter((w) => w.cityWall === true),
    /** 本区全部墙体（宫墙 + 院墙），按 owner 过滤。 */
    walls: wallsForZone(zoneId),
    /** 本区墙体的**碰撞盒**（core 统一派生，含门洞净空与 floorYAt 标高）——区域无需自己实现。 */
    wallColliders: wallCollidersForZone(zoneId),
    /** 本区水体（t27 新增）：区域不必再从障碍盒反推水池；水体碰撞由 core 的基线图层统一提供。 */
    waterBodies: waterBodiesForZone(zoneId),
    /** 本区点景（t27 新增：假山 / 影壁 / 钟鼓）。 */
    scenicObjects: scenicObjectsForZone(zoneId),
    /** 本区障碍的**归一版本**（y0 下钳到足迹地坪 + door 轴语义统一）——仅供区域参考，registry 用的是全城基线图层。 */
    obstaclesNormalized: OBSTACLES.filter((o) => o.zone === zoneId).map((o) => normalizeObstacle(o)),
    corridors: LAYOUT.CORRIDORS.filter((c) => c.owner === zoneId),
    connectors: CONNECTORS.filter((c) => c.owner === zoneId),
    roads: ROADS.filter((r) => r.zone === zoneId),
    terraces: TERRACES.filter((t) => t.zone === zoneId || t.owner === zoneId),
    walkable: WALKABLE.filter((w) => w.zone === zoneId),
    obstacles: OBSTACLES.filter((o) => o.zone === zoneId),
    viewpoints: VIEWPOINTS.filter((v) => v.area === zoneId),
    lightAnchors: LIGHT_ANCHORS.filter((a) => a.zone === zoneId),
    vegetation: VEGETATION.filter((v) => v.zone === zoneId),
    neighbours: computeNeighbours(zone),
    helpers: {
      floorYAt: LAYOUT.floorYAt,
      walkableAt: LAYOUT.walkableAt,
      zoneAt: LAYOUT.zoneAt,
      tileAt: LAYOUT.tileAt,
      groundYAt: LAYOUT.groundYAt,
      insideEnvelope: LAYOUT.insideEnvelope,
      getSlot: LAYOUT.getSlot,
      getConnector: LAYOUT.getConnector,
      slotsByZone: LAYOUT.slotsByZone,
      courtyardsByArea: LAYOUT.courtyardsByArea,
    },
  };
}

/** 全部区域切片（灰盒 / audit / 测试用）。 */
export function allZoneLayouts() {
  return ZONE_IDS.map((id) => zoneLayoutFor(id));
}

/* =============================================================================
 * 障碍语义修正（t27）：y0 从足迹地坪起算 + 水体由 WATER_BODIES 派生 + door 轴语义统一
 * =============================================================================
 * 两条区域上报（E t11 / C t7）指向同一缺陷：
 *   ① `layout.OBSTACLES.y0` 记录的是**建筑台基顶**（B 的 OB-B-hall-mid gap=2.0、F 的角楼/城门 gap=12~12.4），
 *      而 "足迹处地坪" 可能低得多 → 任何按 y 区间判定的消费方都会放行"从建筑下方穿入"；
 *      各区（B/C/D/E）只好各自 `y0: Math.min(o.y0, groundY)` 打补丁 → 五份实现。
 *   ② 水体障碍盒是"水体本身"（池面顶 0.05 < E/D 地坪 0.4），拦不住人；
 *      而 `WK-<zone>-ground` 又覆盖池面（`floorYAt` 给 0.4）⇒ 可以"站在水上"；E/D 只好自补水面拦阻盒。
 * 收口策略：core 统一派生（本文件）→ registry 做成**内建基线图层** → 区域无需再打补丁（其自补条目会被去重）。
 */

/** 水体拦阻盒在地坪之上保留的净高（> 台阶阈值 0.5，保证 `feetY < y1 − maxStep/2` 成立 → 一定拦人）。 */
export const WATER_BLOCK_HEADROOM = 0.6;

/** 足迹采样点（中心 + 四角内缩 1m），用于取"建筑下方的最低地坪"。 */
function footprintSamples(bounds) {
  const insetX = Math.min(1, (bounds.maxX - bounds.minX) / 4);
  const insetZ = Math.min(1, (bounds.maxZ - bounds.minZ) / 4);
  const xs = [(bounds.minX + bounds.maxX) / 2, bounds.minX + insetX, bounds.maxX - insetX];
  const zs = [(bounds.minZ + bounds.maxZ) / 2, bounds.minZ + insetZ, bounds.maxZ - insetZ];
  const out = [];
  for (const x of [...new Set(xs)]) out.push({ x, z: (bounds.minZ + bounds.maxZ) / 2 });
  for (const z of [...new Set(zs)]) out.push({ x: (bounds.minX + bounds.maxX) / 2, z });
  for (const x of [bounds.minX + insetX, bounds.maxX - insetX]) {
    for (const z of [bounds.minZ + insetZ, bounds.maxZ - insetZ]) out.push({ x, z });
  }
  return out;
}

/** 足迹处地坪（多点取最低）；无可行走面时返回 null。 */
export function footprintFloor(bounds, { helpers = LAYOUT } = {}) {
  const values = footprintSamples(bounds)
    .map((p) => (typeof helpers?.floorYAt === 'function' ? helpers.floorYAt(p.x, p.z) : null))
    .filter((v) => Number.isFinite(v));
  return values.length > 0 ? Math.min(...values) : null;
}

/**
 * 障碍 y0 语义统一：`y0 = min(记录值, 足迹地坪)`。
 * 保证阻挡体从地面起算，抬高台基的建筑/城楼不能被"从下方穿入"（同时保留 `y0Recorded` 便于审计）。
 */
/**
 * t82 定论：`OBSTACLES[].y0` 的 **canonical 语义**（代码为准，文档曾表述含糊）
 *
 *     y0 = min( 记录值 layout.OBSTACLES[].y0 , footprintFloor(该障碍足迹) )
 *
 * - `layout.OBSTACLES[].y0` 是**记录值**（设计基座标高，如门洞/台基顶），**不是**权威障碍底；
 *   权威底由本函数按上式计算，并**同时回写** `y0Recorded`（记录值）与 `y0Source`：
 *     · `y0Source === 'floorYAt'` ⇒ 记录值 > 足迹地坪，被**下钳**（防"从台基下方穿入"）
 *     · `y0Source === 'layout'`   ⇒ 足迹地坪 ≥ 记录值，`min()` 为**恒等**（不再下钳）
 * - **足迹地坪 `footprintFloor(bounds)` = 该足迹内最高可行走面**（含台基顶 / 内景面 / `kind:'passage'` 门洞通道面）。
 *   t73/t74/t75 之后大量建筑足迹地坪抬高到与记录值相等 ⇒ 下钳条数从 40+ 降到 ~15，
 *   这**不是语义变化**，而是"记录值本来就等于地坪"的条目变多（`y0Source` 可逐条自证）。
 * - 消费方（碰撞/求解器/审计）**一律使用 `y0`**，不得自行用记录值判断"底部"。
 *
 * @returns 归一后的障碍条目：`{ ...obstacle, y0, y0Recorded, y0Source }`
 */
export function normalizeObstacleY0(obstacle, { helpers = LAYOUT } = {}) {
  const floor = footprintFloor(obstacle.bounds, { helpers });
  const recorded = obstacle.y0;
  const y0 = floor === null ? recorded : Math.min(recorded, floor);
  return {
    ...obstacle,
    y0: +y0.toFixed(3),
    y0Recorded: recorded,
    y0Source: y0 === recorded ? 'layout' : 'floorYAt',
  };
}

/**
 * t82 常驻守卫：逐条复算 canonical `y0`，返回任何与 `min(记录值, 足迹地坪)` 不一致的条目。
 * 供 `scripts/audit.mjs` 作为一条检查项调用（非空 ⇒ 预算/契约违规），也可在任何 Node 进程内直接调用。
 * @returns {{ total:number, clamped:number, kept:number, sources:Record<string,number>, problems:string[] }}
 */
export function y0CanonicalProblems({ obstacles = OBSTACLES, helpers = LAYOUT } = {}) {
  const problems = [];
  const sources = { floorYAt: 0, layout: 0, null: 0 };
  let clamped = 0;
  let kept = 0;
  for (const raw of obstacles) {
    const entry = normalizeObstacleY0(raw, { helpers });
    const floor = footprintFloor(raw.bounds, { helpers });
    const expected = floor === null ? entry.y0Recorded : Math.min(entry.y0Recorded, floor);
    if (Math.abs(entry.y0 - expected) > 1e-6) {
      problems.push(`${entry.id}: y0=${entry.y0} 与 canonical min(记录值 ${entry.y0Recorded}, 足迹地坪 ${floor}) = ${+Number(expected).toFixed(3)} 不一致`);
    }
    const expectedSource = floor === null || entry.y0Recorded <= floor + 1e-6 ? 'layout' : 'floorYAt';
    if (entry.y0Source !== expectedSource) {
      problems.push(`${entry.id}: y0Source="${entry.y0Source}" 与复算来源 "${expectedSource}" 不一致（记录值 ${entry.y0Recorded} / 足迹地坪 ${floor}）`);
    }
    sources[entry.y0Source ?? 'null'] = (sources[entry.y0Source ?? 'null'] ?? 0) + 1;
    if (entry.y0Source === 'floorYAt') clamped += 1;
    else kept += 1;
  }
  if (clamped + kept !== obstacles.length) {
    problems.push(`下钳 ${clamped} + 保持 ${kept} ≠ 障碍总数 ${obstacles.length}（统计漏计）`);
  }
  return { total: obstacles.length, clamped, kept, sources, problems };
}

/** t127：基线障碍列表缓存（水体在基线上是**派生版**；谓词实测必须用这份） */
let baselineObstacleCache = null;
function baselineObstacles({ helpers = LAYOUT } = {}) {
  if (!baselineObstacleCache) {
    baselineObstacleCache = assembleBaselineObstacles({ obstacles: OBSTACLES, waters: WATER_BODIES, helpers }).list;
  }
  return baselineObstacleCache;
}

/** t127：按 slotId 取该建筑的障碍条目（已做 `y0` 归一，门字段已按 `door` 原样携带）。 */
function obstacleEntryFor(slotId, { helpers = LAYOUT } = {}) {
  const list = baselineObstacles({ helpers });
  const found = list.find((o) => o.buildingId === slotId || o.id === slotId || o.id === `OB-${slotId}`);
  return found ?? null;
}

/**
 * t127：某点在门带上是否被**任意障碍**阻挡 —— 一律走谓词层 `obstacleBlocksPoint()`（唯一真相源）。
 * 该建筑自身的障碍在门洞内由谓词层的 `exceptDoor + insideObstacleDoor` 自动放行。
 */
function isDoorBandBlocked(entry, point, feetY, { helpers = LAYOUT, radius = INTERACTION.player.radius, height = INTERACTION.player.height } = {}) {
  for (const other of baselineObstacles({ helpers })) {
    const target = other.id === entry.id ? entry : other;
    if (obstacleBlocksPoint(target, { x: point.x, z: point.z, feetY, height, radius })) return true;
  }
  return false;
}

/**
 * t127：**门洞净宽实测探针**（供下游把 `door.passable/blockedBy` 从"声明自洽"升级为"实测守住"）。
 *
 * 语义（与 `insideObstacleDoor()` 的门带口径一致，**不新造第二套阻挡判定**）：
 *   · 门带横向 = 垂直于 `door.axis` 的方向（`axis==='z'` ⇒ 横向是 x；`axis==='x'` ⇒ 横向是 z）；
 *     这正是 `insideObstacleDoor()` 用 `door.width/2 - radius` 收窄的那条带；
 *   · 在门洞中心平面（沿 `door.axis` 取 `door.center`）上，自 `center ± (width/2 - radius)` 之间**逐 `step`(默认 0.1m) 采样**；
 *   · 每点用**谓词层** `obstacleBlocksPoint()` 判定（脚高默认取该点可行走面 `floorYAt()`，无面则退 `door.sillY` ⇒ `obstacle.y0`）；
 *   · 返回**最长连续未被阻挡的宽度（米）**，四舍五入到 `step` 精度。
 *
 * 返回值：`number`（净宽）｜ `0`（该槽位无门 / 非 `exceptDoor` ⇒ 本来就没有门洞）｜ `null`（**无效 slotId**，不静默当 0）。
 * 另提供 `probeDoorClearanceReport(slotId)` 返回逐项诊断（`{slotId, doorWidth, clearWidth, samples, passable, ...}`）。
 */
export function probeDoorClearanceReport(slotId, { step = 0.1, helpers = LAYOUT, feetY = null } = {}) {
  if (typeof slotId !== 'string' || slotId.trim() === '') {
    throw new TypeError('probeDoorClearance(slotId) 需要非空字符串 slotId（建筑 id）');
  }
  const entry = obstacleEntryFor(slotId, { helpers });
  if (!entry) return { slotId, found: false, reason: 'unknown-slot', doorWidth: null, clearWidth: null, samples: 0, passable: null, points: [] };
  const door = entry.door;
  // 声明口径在门字段上：`door.passable` / `door.blockedBy`（见 src/shared/layout.js:353-356）
  const declaredPassable = typeof door?.passable === 'boolean' ? door.passable : null;
  const declaredBlockedBy = door?.blockedBy ?? null;
  if (!door || entry.blocks !== 'exceptDoor') {
    return {
      slotId,
      found: true,
      reason: 'no-door',
      doorWidth: door?.width ?? null,
      clearWidth: 0,
      samples: 0,
      passable: declaredPassable,
      blockedBy: declaredBlockedBy,
      points: [],
    };
  }
  const radius = INTERACTION.player.radius;
  const height = INTERACTION.player.height;
  const half = Math.max(0, door.width / 2 - radius);
  const count = Math.max(1, Math.floor((half * 2) / step) + 1);
  const points = [];
  let best = 0;
  let run = 0;
  let blockedSamples = 0;
  for (let i = 0; i < count; i += 1) {
    const u = -half + i * step;
    const p = door.axis === 'z' ? { x: door.center.x + u, z: door.center.z } : { x: door.center.x, z: door.center.z + u };
    const floor = typeof helpers.floorYAt === 'function' ? helpers.floorYAt(p.x, p.z) : null;
    const feet = feetY ?? floor ?? door.sillY ?? entry.y0 ?? 0;
    const blocked = isDoorBandBlocked(entry, p, feet, { helpers, radius, height });
    if (blocked) {
      blockedSamples += 1;
      run = 0;
    } else {
      run += step;
      if (run > best) best = run;
    }
    points.push({ u: +u.toFixed(3), x: +p.x.toFixed(3), z: +p.z.toFixed(3), feetY: +Number(feet).toFixed(3), blocked });
  }
  const clearWidth = +Math.min(half * 2 + step, best).toFixed(3);
  /**
   * t127：**声明 vs 实测**的第二半 —— 若 `door.passable === false` 且给了 `blockedBy`，
   * 就沿 `door.facade.outward` 从锚点向外采样，找**声明的那个阻挡者**（水体 id 形如 `WB-*-pond`，
   * 在碰撞层里以 `OB-<id>` 存在）第一次真正挡住接近路径的位置。这样"声明的不可通行"是**可实测的**。
   */
  const facade = door.facade ?? null;
  let declaredBlockerId = null;
  let declaredBlockerResolved = false;
  let approachBlockedAt = null;
  if (door.passable === false && declaredBlockedBy) {
    declaredBlockerId = declaredBlockedBy;
    const resolved = baselineObstacles({ helpers }).find(
      (o) => o.id === declaredBlockedBy || o.id === `OB-${declaredBlockedBy}` || (o.waterId ?? o.sourceId) === declaredBlockedBy,
    );
    declaredBlockerResolved = Boolean(resolved);
    if (resolved && facade) {
      const blocker = resolved;
      const sign = facade.outward === 'north' || facade.outward === 'east' ? 1 : -1;
      const lateral = facade.outward === 'north' || facade.outward === 'south';
      // 从门洞内侧 6m 一直扫到外侧 12m（`t` 以 facade 锚点为原点、负值朝门洞内侧）——
      // 声明的"阻挡"可能落在锚点内侧（水体压在墙脚外），只朝外扫会漏掉
      for (let t = -6; t <= 12 + step; t += step) {
        const z = lateral ? facade.z + sign * t : facade.z;
        const x = lateral ? facade.x : facade.x + sign * t;
        const f = typeof helpers.floorYAt === 'function' ? helpers.floorYAt(x, z) : null;
        if (obstacleBlocksPoint(blocker, { x, z, feetY: f ?? 0 })) {
          approachBlockedAt = +(lateral ? z : x).toFixed(3);
          break;
        }
      }
    }
  }
  return {
    slotId,
    found: true,
    reason: clearWidth > 0 ? 'open' : 'blocked',
    facade,
    declaredBlockerId,
    declaredBlockerResolved,
    approachBlockedAt,
    doorWidth: door.width,
    doorAxis: door.axis,
    bandHalfWidth: +half.toFixed(3),
    clearWidth,
    samples: points.length,
    blockedSamples,
    passable: declaredPassable,
    blockedBy: declaredBlockedBy,
    points,
  };
}

/** 门洞净宽（米）：见 `probeDoorClearanceReport()` 的口径；无效 id ⇒ `null`（不静默 0）。 */
export function probeDoorClearance(slotId, opts = {}) {
  const r = probeDoorClearanceReport(slotId, opts);
  return r.found ? r.clearWidth : null;
}

/** 某区域的水体 / 点景切片（区域不必再从障碍盒反推水池）。 */
export function waterBodiesForZone(zoneId) {
  return WATER_BODIES.filter((w) => (w.owner ?? w.zone) === zoneId);
}

export function scenicObjectsForZone(zoneId) {
  return SCENIC_OBJECTS.filter((s) => (s.owner ?? s.zone) === zoneId);
}

/** 矩形相交（可选外扩 padding）。 */
/** t13：`outer` 是否包含 `inner`（含容差）—— 用于"桥面真的横跨水体"的判定。 */
function boundsContain(outer, inner, tol = 0.05) {
  if (!outer || !inner) return false;
  return inner.minX >= outer.minX - tol && inner.maxX <= outer.maxX + tol
    && inner.minZ >= outer.minZ - tol && inner.maxZ <= outer.maxZ + tol;
}

function rectsOverlap(a, b, padding = 0) {
  return a.minX - padding <= b.maxX && a.maxX + padding >= b.minX && a.minZ - padding <= b.maxZ && a.maxZ + padding >= b.minZ;
}

/**
 * door 轴语义统一（t27）。
 *
 * **约定（canonical）：`door.axis` = 面法线轴（洞口穿越方向）；`door.lateralAxis` = 洞口横向轴（= 墙走向轴）。**
 * `layout.OBSTACLES` 里 18 条建筑门洞已经是这个约定，但 4 条宫墙条目（南/北 `axis:'x'`、西/东 `axis:'z'`）
 * 写的是"墙走向轴" → 按建筑语义解释时，**整条 608m 宫墙在 26m 侧向带内都成了门洞通道**
 * （G 实测当前"不可穿越"只是靠墙带内没有可行走面兜住，属侥幸）。这里按几何自动判定并翻正：
 *   lateralAxis = 包围盒较长边（墙走向）；若记录值恰好是 lateralAxis，说明写的是走向轴 → 翻成法线轴。
 */
export function normalizeDoorFields(door, bounds) {
  if (!door || !bounds) return door ?? null;
  const lateralAxis = (bounds.maxX - bounds.minX) >= (bounds.maxZ - bounds.minZ) ? 'x' : 'z';
  const normalAxis = lateralAxis === 'x' ? 'z' : 'x';
  const stored = door.axis === 'x' || door.axis === 'z' ? door.axis : normalAxis;
  const flipped = stored === lateralAxis;
  return {
    ...door,
    axis: flipped ? normalAxis : stored,
    lateralAxis,
    wallAxis: lateralAxis,
    sourceAxis: stored,
    axisFlipped: flipped,
  };
}

/** 障碍归一：door 轴统一 + y0 下钳。 */
export function normalizeObstacle(obstacle, { helpers = LAYOUT } = {}) {
  const withY = normalizeObstacleY0(obstacle, { helpers });
  return { ...withY, door: normalizeDoorFields(withY.door, withY.bounds) };
}

/**
 * 由 `layout.WATER_BODIES` 派生**不可站立**的水体阻挡盒。
 *   底面 y0 = min(水面, 岸边地坪) − 埋深；顶面 y1 = 岸边地坪 + WATER_BLOCK_HEADROOM（保证拦得住站在池畔/池面的人）。
 *   被桥梁跨越的水体（护城河）改成 `blocks:'exceptDoor'` + 一条**桥面通道**（宽 = 桥面宽、法线轴 = 过河方向），
 *   因此"桥可过、水不可进"；id 与 layout 的 8 条水体障碍完全一致（`OB-<waterBodyId>`），便于基线对账。
 *
 * t13：**有界开槽的两条来源**（先只读取证结论：谓词层只支持"单矩形 + 门洞通道"，不支持多矩形/带洞，
 *   故沿用本仓既有先例 `door`，而非修改判定模型）：
 *     ① **桥面横跨**（既有）：`WALKABLE` 里落在水体上的 `bridgeDeck` 面 ⇒ 通道 = 该桥面；
 *     ② **槽位显式登记**（t13 新增）：`layout.OBSTACLES` 里对应水体条目自带 `door` 且 `blocks==='exceptDoor'`
 *        ⇒ **以槽位声明的通道为准**（登记与几何同轮；`STONE_STEP_LANES` 的两条汀步走廊即走此路）。
 *   ② 的存在理由：汀步走廊**不得**由"任意落在水体上的 bridgeDeck 面"推出 —— 否则任何新加的跨水面
 *   都会**静默**给水体开洞；显式登记使开槽范围（宽度/轴向/中心）可被逐条审计。
 */
export function deriveWaterColliders(waters = WATER_BODIES, { helpers = LAYOUT, headroom = WATER_BLOCK_HEADROOM, decks = null } = {}) {
  const deckRects = decks ?? WALKABLE.filter((w) => w.kind === 'bridgeDeck').map((w) => ({ id: w.id, bounds: w.bounds }));
  const layoutObstacleById = new Map((helpers?.OBSTACLES ?? OBSTACLES).map((o) => [o.id, o]));
  const out = [];
  for (const water of waters) {
    const b = water.bounds;
    // 岸边地坪：矩形四周（内缩/外扩 0.8m）采样，取有效值的**最大值** = 玩家实际站立的地面；
    // 桥面地坪不计入（否则护城河顶面会被桥面抬高）。
    const samples = [];
    const step = Math.max(4, Math.min(24, Math.round(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 12)));
    for (let x = b.minX + 0.8; x <= b.maxX - 0.8; x += step) {
      samples.push({ x, z: b.minZ - 0.8 }, { x, z: b.maxZ + 0.8 });
    }
    for (let z = b.minZ + 0.8; z <= b.maxZ - 0.8; z += step) {
      samples.push({ x: b.minX - 0.8, z }, { x: b.maxX + 0.8, z });
    }
    const inDeck = (p) => deckRects.some((d) => p.x >= d.bounds.minX - 1 && p.x <= d.bounds.maxX + 1 && p.z >= d.bounds.minZ - 1 && p.z <= d.bounds.maxZ + 1);
    const bankFloors = samples
      .filter((p) => !inDeck(p))
      .map((p) => (typeof helpers?.floorYAt === 'function' ? helpers.floorYAt(p.x, p.z) : null))
      .filter((v) => Number.isFinite(v));
    const bank = bankFloors.length > 0 ? Math.max(...bankFloors) : (Number.isFinite(water.y) ? water.y : 0);
    const depth = Number.isFinite(water.depth) ? water.depth : 0.4;
    const y0 = +(Math.min(water.y ?? 0, bank) - Math.max(0.2, depth)).toFixed(3);
    const y1 = +(bank + headroom).toFixed(3);

    const crossing = deckRects.find((d) => rectsOverlap(d.bounds, b) && (b.maxX - b.minX) > (b.maxZ - b.minZ) ? true : false);
    /* t13 ②：槽位显式登记优先（**登记与几何同轮**；由 layout 的 `STONE_STEP_LANES` 驱动）。 */
    const declared = layoutObstacleById.get(`OB-${water.id}`);
    const declaredDoor = declared && declared.blocks === 'exceptDoor' && declared.door ? declared.door : null;
    /* 通道：护城河被桥面横跨时，桥面宽度即净宽，方向 = 法线轴（穿越水体的方向）。
       t13：桥面判定收紧为"**桥面被水体包含**"（原来的"任意相交"会让一条只搭到池边一角的水面
       （如花园水池上的汀步步道）把**整个池子**翻成通道。闸门：只有真横跨（桥面 ⊆ 水体）才开。 */
    const deck = deckRects.find((d) => rectsOverlap(d.bounds, b) && boundsContain(b, d.bounds));
    const horizontalWater = b.maxX - b.minX >= b.maxZ - b.minZ;
    const derivedDoor = deck
      ? {
          axis: horizontalWater ? 'z' : 'x',
          lateralAxis: horizontalWater ? 'x' : 'z',
          wallAxis: horizontalWater ? 'x' : 'z',
          sourceAxis: horizontalWater ? 'z' : 'x',
          axisFlipped: false,
          center: {
            x: horizontalWater ? (deck.bounds.minX + deck.bounds.maxX) / 2 : (b.minX + b.maxX) / 2,
            z: horizontalWater ? (b.minZ + b.maxZ) / 2 : (deck.bounds.minZ + deck.bounds.maxZ) / 2,
          },
          width: horizontalWater ? deck.bounds.maxX - deck.bounds.minX : deck.bounds.maxZ - deck.bounds.minZ,
          height: Math.max(0.5, y1 - y0),
          sillY: y0,
          source: deck.id,
        }
      : null;
    const door = declaredDoor
      ? {
          axis: declaredDoor.axis,
          lateralAxis: declaredDoor.lateralAxis ?? (declaredDoor.axis === 'z' ? 'x' : 'z'),
          wallAxis: declaredDoor.wallAxis ?? declaredDoor.lateralAxis ?? (declaredDoor.axis === 'z' ? 'x' : 'z'),
          sourceAxis: declaredDoor.sourceAxis ?? declaredDoor.axis,
          axisFlipped: false,
          center: { ...declaredDoor.center },
          width: declaredDoor.width,
          height: declaredDoor.height ?? Math.max(0.5, y1 - y0),
          sillY: declaredDoor.sillY ?? y0,
          source: `layout:OB-${water.id}`,
          declared: true,
        }
      : derivedDoor;
    out.push({
      id: `OB-${water.id}`,
      sourceType: 'water',
      zone: water.owner ?? water.zone,
      buildingId: water.id,
      waterBodyId: water.id,
      kind: water.kind,
      bounds: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ },
      y0,
      y1,
      blocks: door ? 'exceptDoor' : 'all',
      door,
      note: `core 派生（t27）：水体不可站立；岸边地坪 ${bank}、顶面 = 岸边 + ${headroom}m${door ? `；通道宽 ${door.width}m（${door.declared ? '槽位显式登记的汀步走廊' : '桥面横跨'}）` : ''}`,
    });
    void crossing;
  }
  return out;
}

/**
 * 组装 `layout.OBSTACLES` 的**基线图层**（81 条，id 与 layout 逐条一致）：
 *   - 水体 8 条 → 用 `deriveWaterColliders` 的派生版本 **同 id 替换**（顶面抬到可拦人）；
 *   - 其余 73 条 → y0 下钳到足迹地坪 + door 轴语义统一；
 *   - 返回 `{ list, stats }`，`stats` 记录替换/下钳/翻轴数量，便于回执与审计对账。
 */
export function assembleBaselineObstacles({ obstacles = OBSTACLES, waters = WATER_BODIES, helpers = LAYOUT } = {}) {
  const waterIds = new Set(waters.map((w) => `OB-${w.id}`));
  const derivedWater = new Map(deriveWaterColliders(waters, { helpers }).map((box) => [box.id, box]));
  const list = [];
  const stats = { total: obstacles.length, waterReplaced: 0, y0Clamped: 0, doorAxisFlipped: 0, ids: [] };
  for (const obstacle of obstacles) {
    let entry;
    if (obstacle.sourceType === 'water' && derivedWater.has(obstacle.id)) {
      entry = { ...derivedWater.get(obstacle.id), legacy: { y0: obstacle.y0, y1: obstacle.y1, blocks: obstacle.blocks } };
      stats.waterReplaced += 1;
    } else {
      entry = normalizeObstacle(obstacle, { helpers });
      if (entry.y0Source === 'floorYAt') stats.y0Clamped += 1;
      if (entry.door?.axisFlipped) stats.doorAxisFlipped += 1;
    }
    list.push(entry);
    stats.ids.push(entry.id);
  }
  void waterIds;
  return { list, stats };
}

/**
 * t35：**按登记几何解析"室内进深"** —— 障碍包围盒 → 唯一 `SLOTS` 条目 → `INTERIOR_BY_SLOT` → `WALKABLE` 室内面。
 *   不新造常量、不猜：包围盒与槽位几何**逐值相等**才算命中；命中数 ≠ 1（0 或多）一律返回 `null`
 *   （⇒ 调用方**回退整进深**，绝不因"解析失败"制造新的阻挡）。
 */
function registeredInteriorRect(bounds) {
  if (!bounds) return null;
  let hit = null;
  for (const slot of SLOTS) {
    const sb = slot.bounds;
    if (!sb) continue;
    if (
      Math.abs(sb.minX - bounds.minX) > 1e-9 || Math.abs(sb.maxX - bounds.maxX) > 1e-9
      || Math.abs(sb.minZ - bounds.minZ) > 1e-9 || Math.abs(sb.maxZ - bounds.maxZ) > 1e-9
    ) continue;
    if (hit) return null; // 非唯一 ⇒ 不解析（绝不猜）
    hit = slot;
  }
  if (!hit) return null;
  const record = INTERIOR_BY_SLOT[hit.id];
  if (!record?.walkableId) return null;
  return WALKABLE.find((w) => w.id === record.walkableId) ?? null;
}

/** t35：进深（米）按包围盒对象记忆化（基线条目的 `bounds` 引用跨调用稳定）。 */
const doorBandDepthCache = new WeakMap();

/**
 * t35：**门洞豁免的进深**（canonical，沿 `door.axis` 的进深轴）。
 *
 *   · `door.through !== false`（16 门类 + 10 开敞亭 + **未登记 `through`** 的桥面/汀步/宫墙城门）
 *     ⇒ 返回 `null` = **整进深**（原语义逐字不变）；
 *   · `door.through === false`（hall / sideHall：只有正立面开门、背面实心后墙）
 *     ⇒ 返回 `|门侧外墙外沿 − 室内面远边|` —— 门洞带 + 室内进深，**止于后墙**（后墙内侧即室内面远边）。
 *
 * 缺陷（t22 只读定位、t31 三证、本卡落地）：收窄前 63 条建筑门一律 `[lo−r, hi+r]` = **贯穿整栋**，
 * 于是 37 栋非贯穿建筑在碰撞层被开了一条"从后墙穿出"的幻影走廊（`camera.js` / `registry.js` /
 * `walk-solver.js` 三个消费方共用本谓词 ⇒ 玩家真能穿出）。收窄后门侧端**保持原样**（含外侧 `radius` 环），
 * 只把远端从 `外墙外沿 + radius` 收到**室内面远边**。阈值（`radius`）一字未动。
 */
export function doorBandDepthOf(door, bounds) {
  if (!door || !bounds || door.through !== false) return null;
  const cached = doorBandDepthCache.get(bounds);
  if (cached !== undefined) return cached;
  let depth = null;
  const lateralAxis = door.lateralAxis ?? ((bounds.maxX - bounds.minX) >= (bounds.maxZ - bounds.minZ) ? 'x' : 'z');
  const normalAxis = lateralAxis === 'x' ? 'z' : 'x';
  const vector = CONFIG.ORIENTATION.facingVectors[door.facade?.outward];
  const sign = vector ? Math.sign(normalAxis === 'z' ? vector.z : vector.x) : 0;
  const rect = registeredInteriorRect(bounds);
  if (sign !== 0 && rect) {
    const lo = normalAxis === 'z' ? bounds.minZ : bounds.minX;
    const hi = normalAxis === 'z' ? bounds.maxZ : bounds.maxX;
    const doorSide = sign > 0 ? hi : lo;
    const far = sign > 0
      ? (normalAxis === 'z' ? rect.bounds.minZ : rect.bounds.minX)
      : (normalAxis === 'z' ? rect.bounds.maxZ : rect.bounds.maxX);
    const candidate = Math.abs(doorSide - far);
    if (candidate > 0) depth = +candidate.toFixed(3);
  }
  doorBandDepthCache.set(bounds, depth);
  return depth;
}

/** 进深轴上的门带区间判定：`bandDepth === null` ⇒ **整进深**（原式逐字不变），否则止于室内面远边。 */
function insideDoorNormalSpan(door, bounds, coord, radius, bandDepth) {
  const lateralAxis = door.lateralAxis ?? ((bounds.maxX - bounds.minX) >= (bounds.maxZ - bounds.minZ) ? 'x' : 'z');
  const normalAxis = lateralAxis === 'x' ? 'z' : 'x';
  const lo = normalAxis === 'z' ? bounds.minZ : bounds.minX;
  const hi = normalAxis === 'z' ? bounds.maxZ : bounds.maxX;
  const vector = CONFIG.ORIENTATION.facingVectors[door.facade?.outward];
  const sign = vector ? Math.sign(normalAxis === 'z' ? vector.z : vector.x) : 0;
  if (bandDepth !== null && bandDepth !== undefined && sign !== 0) {
    const doorSide = sign > 0 ? hi : lo;
    const far = doorSide - sign * bandDepth;
    // 门侧端 = 原式（外墙外沿 ± radius）；远端 = 室内面远边（止于后墙）
    return sign > 0 ? coord >= far && coord <= hi + radius : coord >= lo - radius && coord <= far;
  }
  return coord >= lo - radius && coord <= hi + radius; // 回退：整进深（不制造新阻挡）
}

/** 点是否落在门洞通道内（canonical：`door.axis` 为面法线轴）；t35 起 `through === false` 的门**止于后墙**。 */
export function insideObstacleDoor(door, bounds, x, z, radius = INTERACTION.player.radius) {
  if (!door || !bounds) return false;
  const lateralAxis = door.lateralAxis ?? ((bounds.maxX - bounds.minX) >= (bounds.maxZ - bounds.minZ) ? 'x' : 'z');
  const halfWidth = Math.max(0, (door.width ?? 0) / 2 - radius);
  const bandDepth = doorBandDepthOf(door, bounds);
  if (bandDepth === null) {
    // 整进深（原式逐字不变）
    if (lateralAxis === 'x') {
      return Math.abs(x - (door.center?.x ?? 0)) <= halfWidth && z >= bounds.minZ - radius && z <= bounds.maxZ + radius;
    }
    return Math.abs(z - (door.center?.z ?? 0)) <= halfWidth && x >= bounds.minX - radius && x <= bounds.maxX + radius;
  }
  if (lateralAxis === 'x') {
    return Math.abs(x - (door.center?.x ?? 0)) <= halfWidth && insideDoorNormalSpan(door, bounds, z, radius, bandDepth);
  }
  return Math.abs(z - (door.center?.z ?? 0)) <= halfWidth && insideDoorNormalSpan(door, bounds, x, radius, bandDepth);
}

/**
 * 共享的"该点是否被该障碍阻挡"判定（canonical 语义，供消费方复用）：
 *   足迹圆与包围盒相交 + 玩家垂直区间 `[feetY, feetY+height]` 与 `[y0, y1]` 相交 + 门洞通道豁免。
 * 与 `src/interaction/walk-solver.js` 的 `blocks()` 同义（后者不看 y0；本判定更严格，二者对"被阻挡"的结论一致）。
 */
export function obstacleBlocksPoint(obstacle, { x, z, feetY, height = INTERACTION.player.height, radius = INTERACTION.player.radius } = {}) {
  if (!obstacle?.bounds) return false;
  const b = obstacle.bounds;
  if (x < b.minX - radius || x > b.maxX + radius) return false;
  if (z < b.minZ - radius || z > b.maxZ + radius) return false;
  const y0 = Number.isFinite(obstacle.y0) ? obstacle.y0 : -Infinity;
  const y1 = Number.isFinite(obstacle.y1) ? obstacle.y1 : Infinity;
  const head = feetY + height;
  if (head < y0 || feetY > y1) return false;
  if (obstacle.blocks === 'exceptDoor' && insideObstacleDoor(normalizeDoorFields(obstacle.door, b), b, x, z, radius)) return false;
  return true;
}

/**
 * 整城切片：灰盒（`src/zones/_greybox.js`）与审计工具需要"全城一份"，与区域切片同构，
 * 只是不做按区过滤（额外带 `zoneLayouts` 与 `zoneIds`）。
 */
export function cityLayout() {
  return {
    id: 'CITY',
    name: '整座宫城（灰盒 G0）',
    area: 'city',
    owner: 't2 core-engineer',
    file: 'src/zones/_greybox.js',
    bounds: OUTER_BOUNDS,
    envelope: ENVELOPE,
    innerFace: ENVELOPE,
    tiles: ZONES.flatMap((z) => z.tiles),
    groundY: TERRAIN.cityGroundY,
    drawCallBudget: CONFIG.BUDGET.drawCalls.mainSceneMax,
    boundaryZone: true,
    outerBounds: OUTER_BOUNDS,
    terrainExtent: LAYOUT.TERRAIN_EXTENT,
    cityWall: LAYOUT.CITY_WALL,
    moat: LAYOUT.MOAT,
    bridges: LAYOUT.BRIDGES,
    zoneIds: ZONE_IDS,
    zoneLayouts: allZoneLayouts(),
    slots: SLOTS,
    courtyards: COURTYARDS,
    courtyardWalls: WALLS.filter((w) => w.kind === 'courtWall'),
    cityWalls: WALLS.filter((w) => w.cityWall === true),
    walls: WALLS,
    /** 全城墙体碰撞盒（宫墙 + 院墙），与 registry 自动登记的是同一份派生结果。 */
    wallColliders: deriveWallColliders(WALLS),
    corridors: LAYOUT.CORRIDORS,
    connectors: CONNECTORS,
    roads: ROADS,
    terraces: TERRACES,
    walkable: WALKABLE,
    obstacles: OBSTACLES,
    waterBodies: LAYOUT.WATER_BODIES,
    scenicObjects: LAYOUT.SCENIC_OBJECTS,
    scenicObjects: LAYOUT.SCENIC_OBJECTS,
    viewpoints: VIEWPOINTS,
    tourPoints: LAYOUT.TOUR_POINTS,
    fpRoute: LAYOUT.FP_ROUTE,
    lightAnchors: LIGHT_ANCHORS,
    vegetation: VEGETATION,
    neighbours: { south: 'outside', north: 'outside', east: 'outside', west: 'outside' },
    helpers: {
      floorYAt: LAYOUT.floorYAt,
      walkableAt: LAYOUT.walkableAt,
      zoneAt: LAYOUT.zoneAt,
      tileAt: LAYOUT.tileAt,
      groundYAt: LAYOUT.groundYAt,
      insideEnvelope: LAYOUT.insideEnvelope,
      getSlot: LAYOUT.getSlot,
      getConnector: LAYOUT.getConnector,
      slotsByZone: LAYOUT.slotsByZone,
    },
  };
}

/**
 * 由道路派生坡道/台阶记录（CONTRACTS §6.2）：`from.y !== to.y` 的段。
 * 区域切片里的 `colliders.ramps` 由区域作者回显；灰盒与 audit 用这里的派生结果。
 */
export function rampsFromRoads(roads = ROADS) {
  return roads
    .filter((r) => Math.abs(r.from.y - r.to.y) > 1e-6)
    .map((r) => ({
      id: `RAMP-${r.id}`,
      zone: r.zone,
      name: r.name,
      from: { x: r.from.x, z: r.from.z, y: r.from.y },
      to: { x: r.to.x, z: r.to.z, y: r.to.y },
      width: r.width,
      slope: r.slope,
      surface: r.surface,
      connector: r.connector,
    }));
}

/** 校验：切片里的数值必须与 layout 一致（供 tests 与 audit 断言）。 */
export function zoneLayoutConsistency(zoneId) {
  const slice = zoneLayoutFor(zoneId);
  const problems = [];
  const slotIds = new Set(slice.slots.map((s) => s.id));
  for (const slot of slice.slots) {
    if (slot.zone !== zoneId) problems.push(`slot ${slot.id} 的 zone=${slot.zone} 与切片 ${zoneId} 不符`);
    for (const key of ['x', 'z', 'w', 'd']) {
      const source = SLOTS.find((s) => s.id === slot.id);
      if (!source || source[key] !== slot[key]) problems.push(`slot ${slot.id}.${key} 与 layout 不一致`);
    }
  }
  const layoutIds = SLOTS.filter((s) => s.zone === zoneId).map((s) => s.id);
  if (layoutIds.length !== slotIds.size) problems.push(`切片 ${zoneId} 的槽位数量 ${slotIds.size} != layout ${layoutIds.length}`);
  for (const id of layoutIds) if (!slotIds.has(id)) problems.push(`切片 ${zoneId} 缺少槽位 ${id}`);
  if (!inBounds(OUTER_BOUNDS, slice.bounds.minX, slice.bounds.minZ)) problems.push(`切片 ${zoneId} 的 bounds 不在 OUTER_BOUNDS 内`);
  return problems;
}

export default zoneLayoutFor;
