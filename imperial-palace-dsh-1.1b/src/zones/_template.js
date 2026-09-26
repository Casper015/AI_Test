/**
 * 区域模板（`createZone(ctx)` 的空白起点）—— 覆盖到就能通过全部契约校验，作者只需替换体块。
 *
 * 复制本文件为 `src/zones/<your-zone>.js`，改 `ZONE_ID` 为 `ctx.zoneLayout.id`（B/C/D/E/F），然后：
 *   TODO-1 用 `ctx.kit` 的真实构件替换 `buildSkeleton()` 的灰体块（保持世界坐标、不得整体变换 root）；
 *   TODO-2 按 STYLE_GUIDE 的参考图补出本区细节（廊庑、栏杆、铺地、绿化、点景）；
 *   TODO-3 若本区有可进入内景（只有 B/C 需要），把 `interior` 机位指向真实室内并保留登记坐标；
 *   TODO-4 让 `update()` 只动自有对象（烟、水、树、灯闪烁），不得读写相机/state；
 *   TODO-5 `dispose()` 只释放自己创建的 geometry/material/texture（共享 kit 资源不得销毁）；
 *   TODO-6 用 `node tests/zones.test.mjs` 自检契约（会打印缺失/不一致字段）。
 *
 * 契约来源：docs/CONTRACTS.md §3（返回值）、§4（建筑字段）、§5（视角）、§6（碰撞）、§8.3（灯位）。
 */

import * as THREE from 'three';
import { CONFIG } from '../shared/config.js';
import { buildingPieces, createGreyMaterials, mergeFlatGeometries } from '../core/greybox.js';
import { rampsFromRoads } from '../core/layout-slice.js';

/** 模板不是真实区域 id，真实区域请改成 'B'|'C'|'D'|'E'|'F'（模块必须导出字符串 ZONE_ID）。 */
export const ZONE_ID = 'TEMPLATE';
export const TEMPLATE_STATUS = 'skeleton';

/**
 * 骨架体块：与灰盒同一套几何，保证"复制即可运行"。
 * TODO-1：替换为 `ctx.kit.hall({...})` 等真实构件。
 */
function buildSkeleton(THREEImpl, config, slots) {
  const materials = createGreyMaterials(config, THREEImpl);
  const group = new THREEImpl.Group();
  group.name = 'zone-skeleton';
  const buckets = { terrace: [], wall: [], roof: [], roofRidge: [] };
  for (const slot of slots) {
    const pieces = buildingPieces(THREEImpl, slot, config);
    for (const geo of pieces.terrace) buckets.terrace.push(geo);
    for (const geo of pieces.body) buckets.wall.push(geo);
    for (const geo of pieces.roof) buckets.roof.push(geo);
    for (const geo of pieces.ridge) buckets.roofRidge.push(geo);
  }
  for (const [role, list] of Object.entries(buckets)) {
    if (list.length === 0) continue;
    const mesh = new THREEImpl.Mesh(mergeFlatGeometries(list), materials[role]);
    mesh.name = `skeleton:${role}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, materials };
}

/**
 * 区域入口。返回对象必须**逐字段**满足 CONTRACTS §3.3。
 * @param {object} ctx
 */
export async function createZone(ctx) {
  const THREEImpl = ctx?.THREE ?? THREE;
  const config = ctx?.config ?? CONFIG;
  const zoneLayout = ctx?.zoneLayout;
  if (!zoneLayout) throw new Error('_template: ctx.zoneLayout 缺失（由 src/core/context.js 提供）');

  const root = new THREEImpl.Group();
  root.name = `zone-root:${ZONE_ID}`;
  const skeleton = buildSkeleton(THREEImpl, config, zoneLayout.slots);
  root.add(skeleton.group);

  // §4 建筑：逐字段回显 layout 的槽位（本模板不做风格化，只保证契约完整）
  const buildings = zoneLayout.slots.map((slot) => ({ ...slot }));

  // §5 连接：只回显"本人 owner"的通道（zoneLayout.connectors 已按 owner 过滤）
  const connectors = zoneLayout.connectors.map((c) => ({ ...c, position: { ...c.position } }));

  // §6 碰撞：障碍/可行走面按本区过滤；坡道由本区道路派生（Δy ≠ 0 的段）
  const colliders = {
    obstacles: zoneLayout.obstacles.map((o) => ({ ...o, bounds: { ...o.bounds } })),
    walkable: zoneLayout.walkable.map((w) => ({ ...w, bounds: { ...w.bounds } })),
    ramps: rampsFromRoads(zoneLayout.roads).map((r) => ({ ...r })),
  };

  // §5.2 视角：回显 layout 分配给我的机位（含 B/C 的 interior）
  const viewpoints = zoneLayout.viewpoints.map((v) => ({
    ...v,
    position: { ...v.position },
    target: { ...v.target },
  }));

  // §8.3 灯位：只声明灯位与类型，灯光由 src/core/environment.js 统一激活
  const lightAnchors = zoneLayout.lightAnchors.map((a) => ({ ...a, position: { ...a.position } }));

  const stats = {
    kind: 'template-skeleton',
    buildings: buildings.length,
    connectors: connectors.length,
    obstacles: colliders.obstacles.length,
    walkable: colliders.walkable.length,
    ramps: colliders.ramps.length,
    viewpoints: viewpoints.length,
    lightAnchors: lightAnchors.length,
  };

  let elapsedSeen = 0;
  return {
    root,
    buildings,
    connectors,
    colliders,
    viewpoints,
    lightAnchors,
    /** TODO-4：只动自有对象；dt/elapsed 单位为秒 */
    update(dtSeconds) {
      elapsedSeen += dtSeconds;
    },
    /** TODO-5：只释放自有资源 */
    dispose() {
      root.traverse((node) => {
        if (node.isMesh) node.geometry?.dispose();
      });
      for (const material of Object.values(skeleton.materials)) material.dispose();
      root.clear();
    },
    stats,
    get elapsedSeen() {
      return elapsedSeen;
    },
  };
}

export default createZone;
