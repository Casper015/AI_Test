/**
 * 建筑标签的显隐与排版规划（纯函数，可在 Node 内断言）。
 *
 * 规则（计划 §6.2 "标签按缩放层级显隐，避免全城密集重叠"）：
 *   1. 相机到建筑中心的 XZ 距离 > `INTERACTION.selection.labelMinZoomDistance` → 隐藏
 *      （全城鸟瞰/等距沙盘下不铺标签）；
 *   2. 按距离升序最多保留 `INTERACTION.selection.labelMaxCount` 个；
 *   3. 屏幕投影后在视口外的剔除；两标签屏幕间距 < `UI.spacing.lg` 时只保留更近的一个；
 *   4. 选中 / 悬停的标签**始终优先**（即使超出距离上限或数量上限）；
 *   5. 第一人称下额外要求"近处 + 大致在视线前方"（用投影 z 与距离共同判断）。
 */

import { CONFIG, UI } from '../shared/config.js';

export const LABEL_RULES = Object.freeze({
  minSeparationPx: UI.spacing.lg,
  hoverLabelScale: 1,
});

/**
 * @param {{
 *   buildings: {id:string, name:string, center:{x:number,z:number}, bounds?:object, zone?:string}[],
 *   cameraPosition: {x:number,y:number,z:number},
 *   project: (x:number, y:number, z:number) => {x:number, y:number, visible:boolean, depth:number},
 *   viewport: {width:number, height:number},
 *   selectedId?: string|null, hoveredId?: string|null, mode?: string, config?: object,
 *   excludeRects?: {x:number,y:number,width:number,height:number}[]
 * }} options
 * @returns {{ items: object[], hidden: number, considered: number, excluded: number }}
 */
export function planLabels({
  buildings = [],
  cameraPosition,
  project,
  viewport = { width: 1440, height: 900 },
  selectedId = null,
  hoveredId = null,
  mode = 'oblique',
  config = CONFIG,
  excludeRects = [],
}) {
  const selection = config.INTERACTION.selection;
  const maxDistance = selection.labelMinZoomDistance;
  const maxCount = selection.labelMaxCount;
  const isFp = mode === 'fp';
  const inRect = (x, y) => excludeRects.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
  let excluded = 0;

  const candidates = [];
  for (const building of buildings) {
    const center = building.center ?? {
      x: building.bounds ? (building.bounds.minX + building.bounds.maxX) / 2 : building.x,
      z: building.bounds ? (building.bounds.minZ + building.bounds.maxZ) / 2 : building.z,
    };
    if (!Number.isFinite(center?.x) || !Number.isFinite(center?.z)) continue;
    const dx = center.x - cameraPosition.x;
    const dz = center.z - cameraPosition.z;
    const distance = Math.hypot(dx, dz);
    const isPriority = building.id === selectedId || building.id === hoveredId;
    if (!isPriority && distance > maxDistance) continue;
    if (isFp && !isPriority && distance > maxDistance / 2) continue;
    const topY = (building.bounds?.maxY ?? 0) + 2.5;
    const projected = project(center.x, topY, center.z);
    if (!projected || projected.visible === false) continue;
    const { x, y } = projected;
    if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
    // 落在面板矩形内 → 不显示（避免标签压住 HUD/面板文字）；选中与悬停标签仍然保留
    if (!isPriority && inRect(x, y)) {
      excluded += 1;
      continue;
    }
    candidates.push({
      id: building.id,
      name: building.name,
      zone: building.zone ?? '',
      distance,
      x,
      y,
      priority: isPriority,
      selected: building.id === selectedId,
      hovered: building.id === hoveredId,
    });
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    return a.distance - b.distance;
  });

  const placed = [];
  for (const candidate of candidates) {
    if (!candidate.priority && placed.length >= maxCount) break;
    const tooClose = placed.some((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) < LABEL_RULES.minSeparationPx);
    if (tooClose && !candidate.priority) continue;
    placed.push(candidate);
  }

  return { items: placed, hidden: candidates.length - placed.length, considered: candidates.length, excluded };
}

export default planLabels;
