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

  /** 世界包围盒（含 y 值；优先区域实测包围盒，退化到 layout 估算）。 */
  function worldBounds(building) {
    const kit = building?.group?.userData?.kit?.worldBounds ?? building?.mesh?.userData?.kit?.worldBounds ?? null;
    if (kit && typeof kit.minX === 'number') return { ...kit, source: 'kit' };
    const b = building?.bounds;
    if (!b) return null;
    return {
      minX: b.minX,
      maxX: b.maxX,
      minZ: b.minZ,
      maxZ: b.maxZ,
      minY: building.baseY ?? 0,
      maxY: (building.baseY ?? 0) + (building.totalHeight ?? CONFIG.MODULES.eaveHeight),
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
