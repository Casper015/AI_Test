/**
 * 小地图（计划 §6.2："基于统一布局显示宫墙、区域与当前位置，可选择区域定位"）。
 *
 * 结构：
 *   - `planMinimap()` —— **纯函数**：把 `layout` 的宫墙/区域/护城河/院落 + 相机位置 + 朝向
 *     换算成屏幕矩形与标记点（Node 内可直接断言，无需 canvas）；
 *   - `drawMinimap(ctx2d, plan)` —— 只负责把 plan 画到 2D 画布（浏览器内调用）；
 *   - `zoneAreaAt(plan, x, y)` —— 点按定位：点在哪个分区矩形内 → 返回 `city|B|C|D|E|F`。
 *
 * 尺寸全部取自 `CONFIG.UI.minimap`（size/padding/playerMarkerRadius），不散落字面量。
 */

import { CONFIG, UI } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';

export const MINIMAP_AREAS = Object.freeze(['B', 'C', 'D', 'E', 'F']);

/** 世界坐标 → 小地图屏幕坐标的线性变换。 */
export function makeProjector({ bounds, size, padding }) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const inner = size - padding * 2;
  const scale = inner / Math.max(width, depth);
  const offsetX = padding + (inner - width * scale) / 2;
  const offsetZ = padding + (inner - depth * scale) / 2;
  return {
    scale,
    // 屏幕 y 向下 = 世界 z 减小（南在上），符合"南门在下方、花园在上方"的宫城直觉
    toScreen(x, z) {
      return { x: offsetX + (x - bounds.minX) * scale, y: offsetZ + (bounds.maxZ - z) * scale };
    },
    toWorld(sx, sy) {
      return { x: bounds.minX + (sx - offsetX) / scale, z: bounds.maxZ - (sy - offsetZ) / scale };
    },
    rect(b) {
      const a = this.toScreen(b.minX, b.maxZ);
      const c = this.toScreen(b.maxX, b.minZ);
      return { x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
    },
  };
}

/**
 * @param {{ layout?: object, cameraPosition: {x:number,z:number}, cameraYawDeg?: number,
 *           size?: number, padding?: number, currentArea?: string, config?: object }} options
 */
export function planMinimap({
  layout = LAYOUT,
  cameraPosition = { x: 0, z: 0 },
  cameraYawDeg = 0,
  size = UI.minimap.size,
  padding = UI.minimap.padding,
  currentArea = null,
  config = CONFIG,
} = {}) {
  const bounds = layout.TERRAIN_EXTENT;
  const projector = makeProjector({ bounds, size, padding });

  const walls = layout.WALLS.filter((w) => w.cityWall).map((w) => ({
    id: w.id,
    name: w.name,
    rect: projector.rect(w.bounds),
    kind: 'cityWall',
  }));

  const zoneRects = [];
  for (const zone of layout.ZONES) {
    for (const tile of zone.tiles) {
      zoneRects.push({
        id: tile.id,
        area: zone.id,
        name: zone.name,
        rect: projector.rect(tile.bounds),
        kind: 'zone',
        current: zone.id === currentArea,
      });
    }
  }

  const moats = layout.WATER_BODIES.filter((w) => w.kind === 'moat').map((w) => ({ id: w.id, rect: projector.rect(w.bounds), kind: 'water' }));
  const ponds = layout.WATER_BODIES.filter((w) => w.kind === 'pond').map((w) => ({ id: w.id, rect: projector.rect(w.bounds), kind: 'water' }));

  const courtyards = layout.COURTYARDS.map((c) => ({ id: c.id, area: c.zone, name: c.name, rect: projector.rect(c.bounds), kind: 'courtyard' }));

  const bridges = layout.BRIDGES.map((b) => ({ id: b.id, rect: projector.rect(b.bounds), kind: 'bridge' }));

  const marker = {
    ...projector.toScreen(cameraPosition.x, cameraPosition.z),
    headingDeg: cameraYawDeg,
    radius: UI.minimap.playerMarkerRadius,
    inside: cameraPosition.x >= bounds.minX && cameraPosition.x <= bounds.maxX && cameraPosition.z >= bounds.minZ && cameraPosition.z <= bounds.maxZ,
  };

  return {
    size,
    padding,
    bounds: { ...bounds },
    projector,
    walls,
    zoneRects,
    moats,
    ponds,
    courtyards,
    bridges,
    marker,
    /** 图例：分区按钮可用的区域（与按钮同源，保证点按一致） */
    legend: MINIMAP_AREAS.map((area) => {
      const zone = layout.ZONES.find((z) => z.id === area);
      return { area, name: zone?.name ?? area, color: config.COLORS.palaceRed };
    }),
  };
}

/** 点按定位：屏幕点 → 区域 id（找不到时回落 `city`）。 */
export function zoneAreaAt(plan, x, y) {
  for (const zone of plan.zoneRects) {
    const r = zone.rect;
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return zone.area;
  }
  return 'city';
}

/**
 * 绘制（浏览器内）。ctx2d 为空时静默返回 false（Node/DOM 替身下不抛错）。
 * @returns {boolean} 是否真正绘制
 */
export function drawMinimap(ctx2d, plan, { colors = CONFIG.COLORS } = {}) {
  if (!ctx2d) return false;
  const { size } = plan;
  ctx2d.clearRect?.(0, 0, size, size);
  // 底板
  ctx2d.fillStyle = 'rgba(18, 17, 16, 0.9)';
  ctx2d.fillRect?.(0, 0, size, size);

  // 区域底
  for (const zone of plan.zoneRects) {
    const r = zone.rect;
    ctx2d.fillStyle = zone.current ? 'rgba(223, 161, 18, 0.22)' : 'rgba(240, 236, 225, 0.06)';
    ctx2d.fillRect?.(r.x, r.y, r.width, r.height);
  }
  // 水体
  ctx2d.fillStyle = 'rgba(51, 84, 79, 0.85)';
  for (const water of [...plan.moats, ...plan.ponds]) ctx2d.fillRect?.(water.rect.x, water.rect.y, water.rect.width, water.rect.height);
  // 院落（暗金细线）
  ctx2d.strokeStyle = 'rgba(223, 161, 18, 0.42)';
  ctx2d.lineWidth = 1;
  for (const courtyard of plan.courtyards) {
    const r = courtyard.rect;
    ctx2d.strokeRect?.(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
  }
  // 桥
  ctx2d.fillStyle = 'rgba(240, 236, 225, 0.55)';
  for (const bridge of plan.bridges) ctx2d.fillRect?.(bridge.rect.x, bridge.rect.y, bridge.rect.width, bridge.rect.height);
  // 宫墙（朱红）
  ctx2d.strokeStyle = colors.palaceRed;
  ctx2d.lineWidth = 2;
  for (const wall of plan.walls) {
    const r = wall.rect;
    ctx2d.strokeRect?.(r.x + 1, r.y + 1, Math.max(1, r.width - 2), Math.max(1, r.height - 2));
  }
  // 当前位置标记
  const marker = plan.marker;
  ctx2d.fillStyle = colors.gilt;
  ctx2d.beginPath?.();
  ctx2d.arc?.(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
  ctx2d.fill?.();
  ctx2d.strokeStyle = colors.gilt;
  ctx2d.beginPath?.();
  const rad = ((marker.headingDeg ?? 0) - 90) * (Math.PI / 180);
  ctx2d.moveTo?.(marker.x, marker.y);
  ctx2d.lineTo?.(marker.x + Math.cos(rad) * marker.radius * 3, marker.y + Math.sin(rad) * marker.radius * 3);
  ctx2d.stroke?.();
  return true;
}

export default planMinimap;
