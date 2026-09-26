/**
 * 建筑拾取（Hover / 点选）：射线 × 建筑包围盒（CONTRACTS §4.1：取景/面板一律以实测包围盒为准）。
 *
 * - 唯一 three 消费点之一：`THREE.Raycaster` + core 相机装置（`rig.camera`），**不新建相机**；
 * - 不做网格级 raycast（区域可能只有灰盒/无 mesh），用实测或 layout 包围盒做 AABB 判定，
 *   结果对灰盒与真实区域一致，也便于在 Node 内用纯几何断言；
 * - `?ui=0` / `?shot=1` 时 `setEnabled(false)`：完全不参与命中检测（CONTRACTS §11.3 第 1 条）。
 */

import * as THREE from 'three';
import { CONFIG } from '../shared/config.js';

const _box = new THREE.Box3();
const _vec = new THREE.Vector3();
const _ndc = new THREE.Vector2();

/**
 * 纯几何：给定射线与候选包围盒列表，返回最近的命中（可 Node 内断言）。
 * @param {{origin:{x,y,z}, direction:{x,y,z}}} ray
 * @param {{id:string, bounds:object|null}[]} pickables
 * @returns {{id:string, distance:number, point:{x,y,z}}|null}
 */
export function pickNearestByRay(ray, pickables) {
  const origin = new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z);
  const direction = new THREE.Vector3(ray.direction.x, ray.direction.y, ray.direction.z).normalize();
  const raycasterRay = new THREE.Ray(origin, direction);
  let best = null;
  for (const item of pickables) {
    const b = item.bounds;
    if (!b) continue;
    _box.min.set(b.minX, b.minY ?? 0, b.minZ);
    _box.max.set(b.maxX, b.maxY ?? ((b.minY ?? 0) + CONFIG.MODULES.eaveHeight), b.maxZ);
    const hit = raycasterRay.intersectBox(_box, _vec);
    if (!hit) continue;
    const distance = hit.distanceTo(origin);
    if (!best || distance < best.distance) best = { id: item.id, distance, point: { x: hit.x, y: hit.y, z: hit.z } };
  }
  return best;
}

/**
 * 创建拾取器。
 * @param {{ registry?: object, catalog?: object, rig: object, domElement?: object|null,
 *           config?: object, pickables?: object[] }} options
 */
export function createPicker({ catalog, rig, domElement = null, config = CONFIG, pickables = null } = {}) {
  if (!rig || !rig.camera) throw new Error('createPicker 需要唯一相机装置（rig）');
  const raycaster = new THREE.Raycaster();
  const stats = { queries: 0, hits: 0, misses: 0 };
  let enabled = true;

  const candidates = pickables ?? catalog?.pickables ?? [];

  function ndcFromClient(clientX, clientY, rect) {
    _ndc.set(((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1);
    return _ndc;
  }

  /** 单点射线拾取；返回 { id, distance, point } 或 null。 */
  function pick(clientX, clientY) {
    if (!enabled) return null;
    stats.queries += 1;
    const rect = domElement?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: rig.viewport?.width ?? 1440, height: rig.viewport?.height ?? 900 };
    raycaster.setFromCamera(ndcFromClient(clientX, clientY, rect), rig.camera);
    const hit = pickNearestByRay(raycaster.ray, candidates);
    if (hit) stats.hits += 1;
    else stats.misses += 1;
    return hit;
  }

  /**
   * 悬停拾取：先做中心射线，未命中时在 `INTERACTION.selection.hoverRadiusPx` 半径内做 4 点容差采样
   * （小体量建筑/亭子的可点面积小，容差让悬停更可用）。
   */
  function hover(clientX, clientY) {
    if (!enabled) return null;
    const direct = pick(clientX, clientY);
    if (direct) return direct;
    const radius = config.INTERACTION.selection.hoverRadiusPx;
    const offsets = [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ];
    let best = null;
    for (const [dx, dy] of offsets) {
      const hit = pick(clientX + dx, clientY + dy);
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    return best;
  }

  return {
    pick,
    hover,
    setEnabled(value) {
      enabled = value !== false;
      return enabled;
    },
    get enabled() {
      return enabled;
    },
    stats: () => ({ ...stats, enabled, candidates: candidates.length }),
    dispose() {
      stats.queries = 0;
    },
  };
}

export default createPicker;
