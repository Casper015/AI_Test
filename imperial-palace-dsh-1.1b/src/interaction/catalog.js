/**
 * 建筑 / 障碍目录（只读快照）：信息面板文案、悬停名称、阻挡提示的唯一来源。
 *
 * 数据只来自 `registry`（区域注册的建筑/障碍）与 `layout`（冻结基线），G **不新增**建筑数值。
 * 名称、用途、是否可入内全部取自 `layout.SLOTS` 的 `name / usage / info / visitable`（CONTRACTS §4）。
 */

import { CONFIG } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
import { SOURCE_TYPE_LABELS, mergeObstacles } from './walk-solver.js';

/** 障碍 id → 展示信息（`OB-<buildingId>` / `OB-WALL-*` / `OB-MOAT-*` / `OB-SC-*`）。 */
function labelForObstacle(obstacle, buildingById) {
  const building = obstacle.buildingId ? buildingById.get(obstacle.buildingId) : null;
  const sourceLabel = SOURCE_TYPE_LABELS[obstacle.sourceType] ?? '障碍';
  const name = building?.name ?? (obstacle.sourceType === 'wall' ? '宫墙' : obstacle.note?.split('：')[0] ?? sourceLabel);
  return {
    id: obstacle.id,
    sourceType: obstacle.sourceType,
    sourceLabel,
    buildingId: obstacle.buildingId ?? null,
    name,
    blocks: obstacle.blocks ?? 'all',
    visitable: building?.visitable === true,
    hasDoor: !!obstacle.door,
  };
}

/**
 * 不可通行提示文案（§6.4："不可进入的建筑给出可见提示"）。
 * @returns {{ title: string, detail: string, tone: 'warn' }}
 */
export function blockedHint(entry) {
  if (!entry) return { title: '此路不通', detail: '前方不可通行，请绕行。', tone: 'warn' };
  switch (entry.sourceType) {
    case 'water':
      return { title: '水面不可行走', detail: `${entry.name}：请沿桥面或岸边步道通行。`, tone: 'warn' };
    case 'rockery':
      return { title: '假山不可穿越', detail: `${entry.name}：请绕行假山外侧。`, tone: 'warn' };
    case 'wall':
      return { title: '宫墙阻挡', detail: `${entry.name}：请从城门 / 侧门门洞通行。`, tone: 'warn' };
    default:
      if (entry.blocks === 'exceptDoor') {
        return { title: `${entry.name} · 墙体阻挡`, detail: '该建筑仅门洞可通行，请对准门洞正面进入。', tone: 'warn' };
      }
      return {
        title: `${entry.name} 不可进入`,
        detail: entry.visitable ? '该建筑内景入口未登记，请在门外观看。' : `${entry.name}：${entry.sourceLabel}已登记为障碍物，不可穿行。`,
        tone: 'warn',
      };
  }
}

/**
 * 构造目录快照。
 * @param {{ registry?: object|null, layout?: object, config?: object }} [options]
 */
export function buildCatalog({ registry = null, layout = LAYOUT, config = CONFIG } = {}) {
  const registryBuildings = registry?.allBuildings?.() ?? [];
  const byId = new Map();
  for (const slot of layout.SLOTS) byId.set(slot.id, { ...slot, source: 'layout' });
  for (const building of registryBuildings) {
    const base = byId.get(building.id) ?? {};
    byId.set(building.id, { ...base, ...building, source: 'registry' });
  }

  const buildings = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));

  const obstacles = new Map();
  // 与 walk-solver 同一套合并口径：layout 冻结基线 ∪ 注册表运行时条目（缺一不可）
  const pool = mergeObstacles({ layout, registry });
  for (const obstacle of pool) obstacles.set(obstacle.id, obstacle);

  const obstacleLabels = new Map();
  for (const obstacle of obstacles.values()) obstacleLabels.set(obstacle.id, labelForObstacle(obstacle, byId));

  /**
   * 世界包围盒（含 y 值）。**实测优先**：
   *   · `userData.kit.worldBounds` = kit 对真实几何求 Box3 的实测结果（CONTRACTS §4.1 要求的权威来源）；
   *   · 仅当建筑未带 kit 实测（如灰盒/Node 无几何上下文）时才退化到 layout 槽位的**估值**，
   *     并把 `measured: false` / `source: 'layout估算'` 一路带出去，消费方据此标注"实测/估值"（t80/F7）。
   */
  function worldBounds(building) {
    const kit = building?.group?.userData?.kit?.worldBounds ?? building?.mesh?.userData?.kit?.worldBounds ?? null;
    if (kit && typeof kit.minX === 'number' && typeof kit.maxY === 'number') {
      const height = kit.maxY - kit.minY;
      if (Number.isFinite(height) && height > 0) {
        return { ...kit, height: +height.toFixed(2), measured: true, source: 'kit实测' };
      }
    }
    const b = building?.bounds;
    if (!b) return null;
    const minY = building.baseY ?? 0;
    const maxY = minY + (building.totalHeight ?? CONFIG.MODULES.eaveHeight);
    return {
      minX: b.minX,
      maxX: b.maxX,
      minZ: b.minZ,
      maxZ: b.maxZ,
      minY,
      maxY,
      height: +(maxY - minY).toFixed(2),
      measured: false,
      source: 'layout估算',
    };
  }

  /** 拾取/标签用的扁平行（不持有 three 对象，测试可在 Node 直接断言）。 */
  const pickables = buildings.map((building) => ({
    id: building.id,
    name: building.name,
    zone: building.zone,
    kind: building.kind,
    visitable: building.visitable === true,
    usage: building.usage ?? '',
    info: building.info ?? '',
    bounds: worldBounds(building),
  }));

  /* ------------------------------------------------------------------ 内景机位（数据推导，不硬编码） */

  const zoneNameById = new Map((layout.ZONES ?? []).map((z) => [z.id, z.name ?? z.id]));
  const courtyardById = new Map((layout.COURTYARDS ?? []).map((c) => [c.id, c]));

  /** 全部内景机位（注册表优先，layout 兜底；与 core 的 resolveViewpoint 同一优先级）。 */
  function allInteriorViewpoints() {
    const fromRegistry = registry?.allViewpoints ? registry.allViewpoints() : null;
    const list = fromRegistry && fromRegistry.length >= (layout.VIEWPOINTS?.length ?? 0) ? fromRegistry : layout.VIEWPOINTS ?? [];
    return list.filter((v) => v.mode === 'interior');
  }

  /** 某个建筑的"内景地面"：与建筑所在区一致、且包含建筑中心的 interior 可行走面（否则取最近面）。 */
  function interiorSurfaceFor(building) {
    if (!building) return null;
    const surfaces = (layout.WALKABLE ?? []).filter((s) => s.kind === 'interior' && (!building.zone || s.zone === building.zone));
    if (surfaces.length === 0) return null;
    const b = building.bounds;
    const center = b
      ? { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }
      : { x: building.x ?? 0, z: building.z ?? 0 };
    const contains = (s) => center.x >= s.bounds.minX && center.x <= s.bounds.maxX && center.z >= s.bounds.minZ && center.z <= s.bounds.maxZ;
    const hit = surfaces.find(contains);
    if (hit) return hit;
    // 兜底：取中心最近的面（仍需落在建筑体量内，避免把别处内景错配给本栋）
    let best = null;
    let bestDist = Infinity;
    for (const s of surfaces) {
      const cx = (s.bounds.minX + s.bounds.maxX) / 2;
      const cz = (s.bounds.minZ + s.bounds.maxZ) / 2;
      const dist = Math.hypot(cx - center.x, cz - center.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    const reach = b ? Math.max(6, (b.maxX - b.minX) * 0.5 + (b.maxZ - b.minZ) * 0.5) : Infinity;
    return best && bestDist <= reach ? best : null;
  }

  /**
   * 建筑 → 内景机位（**由区/布局数据推导**，不写死建筑 id）：
   *   ① 取该建筑所在区的 `interior` 可行走面（包含建筑中心者）；
   *   ② 在 `interior` 机位里选位置落在该面内的那个；
   *   ③ 若无（多候选/机位在面外）则取距该面中心最近的同区机位。
   * Phase 2 扩到 47 栋时，只要 layout/区域按同规则登记机位即可自动生效。
   * @returns {{ viewpointId: string, area: string|null, surfaceId: string|null, source: string, position: object }|null}
   */
  function interiorViewpointFor(buildingId) {
    const building = byId.get(buildingId);
    if (!building) return null;
    const surface = interiorSurfaceFor(building);
    if (!surface) return null;
    const candidates = allInteriorViewpoints().filter((v) => (v.area ?? v.zone) === surface.zone || (v.area ?? v.zone) === building.zone);
    if (candidates.length === 0) return null;
    const inside = candidates.find((v) => {
      const p = v.position;
      return p && p.x >= surface.bounds.minX && p.x <= surface.bounds.maxX && p.z >= surface.bounds.minZ && p.z <= surface.bounds.maxZ;
    });
    const chosen =
      inside ??
      candidates
        .map((v) => ({ v, d: Math.hypot((surface.bounds.minX + surface.bounds.maxX) / 2 - v.position.x, (surface.bounds.minZ + surface.bounds.maxZ) / 2 - v.position.z) }))
        .sort((a, b) => a.d - b.d)[0]?.v;
    if (!chosen) return null;
    return {
      viewpointId: chosen.id,
      area: surface.zone ?? building.zone ?? null,
      surfaceId: surface.id,
      source: chosen.registrySource ?? 'layout',
      position: chosen.position ? { ...chosen.position } : null,
    };
  }

  /**
   * 详情面板字段（等级/屋顶/区/院落/尺寸等，全部由构造数据推导）。
   * 高度口径（t80 / F7 修复）：**只把实测高度当权威**
   *   · `heightMeasured` = kit 对真实几何求 Box3 的高度（`userData.kit.worldBounds`）；无实测时为 null；
   *   · `heightEstimated` = layout 槽位 `totalHeight`，**显式标注为估值**，仅供无实测时以"约…（估值）"降级显示；
   *   · 原来的 `totalHeight` 字段**已移除**（避免任何消费方把它当权威），改用上述两个带来源的字段。
   */
  function detail(buildingId) {
    const building = byId.get(buildingId);
    if (!building) return null;
    const b = building.bounds;
    const width = b ? +(b.maxX - b.minX).toFixed(1) : building.w ?? null;
    const depth = b ? +(b.maxZ - b.minZ).toFixed(1) : building.d ?? null;
    const grade = building.grade ?? null;
    const gradeInfo = grade !== null ? (config.GRADES?.[grade] ?? null) : null;
    const gradeKeys = Object.keys(config.GRADES ?? {}).map(Number).sort((a, b) => a - b);
    const courtyard = building.courtyard ? courtyardById.get(building.courtyard) ?? null : null;
    const measured = worldBounds(building);
    const heightMeasured = measured?.measured ? measured.height : null;
    const heightEstimated = building.totalHeight ?? null;
    return {
      width,
      depth,
      areaM2: width !== null && depth !== null ? +(width * depth).toFixed(0) : null,
      grade,
      gradeLabel: gradeInfo?.label ?? (grade !== null ? `${grade} 级` : ''),
      gradeEaveFactor: gradeInfo?.eaveHeightFactor ?? null,
      gradeIsTop: grade !== null && gradeKeys.length > 0 && grade === gradeKeys[gradeKeys.length - 1],
      gradeIsLowest: grade !== null && gradeKeys.length > 0 && grade === gradeKeys[0],
      roofType: building.roofType ?? '',
      roofLabel: config.ROOF_TYPES?.[building.roofType]?.label ?? building.roofType ?? '',
      doubleEave: config.ROOF_TYPES?.[building.roofType]?.doubleEave === true,
      bays: building.bays ?? null,
      terraceH: building.terraceH ?? null,
      /** 实测高度（权威；无实测为 null）。 */
      heightMeasured,
      /** 估值高度（layout totalHeight；仅降级显示，必须显式标注"估值"）。 */
      heightEstimated,
      /** 高度来源：'kit实测' | 'layout估值'（消费方据此标注，UI 不得直接把估值当实测）。 */
      heightSource: heightMeasured !== null ? 'kit实测' : heightEstimated !== null ? 'layout估值' : null,
      /** 实测包围盒（含 measured/source/height），供需要完整盒的消费方使用。 */
      boundsMeasured: measured,
      facing: building.facing ?? '',
      lodHint: building.lodHint ?? '',
      zoneName: zoneNameById.get(building.zone) ?? building.zone ?? '',
      courtyardId: building.courtyard ?? null,
      courtyardName: courtyard?.name ?? null,
    };
  }

  return {
    buildings,
    pickables,
    obstacleLabels,
    /** 信息面板数据（名称 / 用途 / 是否可入内）。 */
    info(buildingId) {
      const building = byId.get(buildingId);
      if (!building) return null;
      return {
        id: building.id,
        name: building.name,
        kind: building.kind ?? '',
        zone: building.zone ?? '',
        usage: building.usage ?? '',
        info: building.info ?? '',
        visitable: building.visitable === true,
        courtyard: building.courtyard ?? null,
        entrance: building.entrance ? { ...building.entrance } : null,
        bounds: building.bounds ? { ...building.bounds } : null,
        center: building.bounds
          ? { x: (building.bounds.minX + building.bounds.maxX) / 2, z: (building.bounds.minZ + building.bounds.maxZ) / 2 }
          : { x: building.x, z: building.z },
      };
    },
    name(buildingId) {
      return byId.get(buildingId)?.name ?? buildingId ?? '';
    },
    /** 详情字段（等级/屋顶/区/院落/尺寸…），供左上角详情面板使用。 */
    detail,
    /** 建筑 → 内景机位（数据推导；不可进入或无内景登记时返回 null）。 */
    interiorViewpointFor,
    /** 建筑的"内景地面"（WALKABLE 里 kind='interior' 的那一面）。 */
    interiorSurfaceFor,
    /** 全部内景机位（诊断/测试用）。 */
    interiorViewpoints: () => allInteriorViewpoints().map((v) => ({ id: v.id, area: v.area ?? v.zone ?? null, name: v.name, source: v.registrySource ?? 'layout' })),
    obstacle(obstacleId) {
      return obstacleLabels.get(obstacleId) ?? null;
    },
    hintFor(obstacleId) {
      return blockedHint(obstacleLabels.get(obstacleId) ?? null);
    },
    get(id) {
      return byId.get(id) ?? null;
    },
    stats() {
      return {
        buildings: buildings.length,
        pickables: pickables.length,
        obstacles: obstacleLabels.size,
        visitable: pickables.filter((p) => p.visitable).map((p) => p.id),
      };
    },
  };
}

export default buildCatalog;
