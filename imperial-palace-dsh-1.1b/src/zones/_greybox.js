/**
 * 全城灰盒（G0）—— 依据 `src/shared/layout.js` 一次性把整座宫城体块化。
 *
 * 本模块是一个**特殊区域**：它覆盖全部 5 个区域（B/C/D/E/F），因此
 *   - `scope = 'city'`；返回 buildings = layout.SLOTS 全部 67 栋（逐字段回显，契约 §4）；
 *   - 每个区域一个子 Group（`greybox:zone:<id>`），真实区域就位后由 main.js 调 `setZoneVisible(zone, false)`
 *     隐藏对应灰盒，同时用 `registry.registerZone(zone, realZone, { replace: true })` 顶替注册条目；
 *   - 用 `ctx.shared.greyboxSkipZones` 可以一开始就跳过已装载的区域。
 *
 * 首屏（`?view=oblique`）即可看到完整宫城：宫墙 + 四角楼 + 四城门 + 护城河 + 四桥 + 67 栋建筑 + 14 个院落围墙。
 */

import * as THREE from 'three';
import { CONFIG, MODULES, TERRAIN } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
import { cityLayout, rampsFromRoads } from '../core/layout-slice.js';
import {
  createGreyMaterials,
  buildingPieces,
  wallSpanBoxes,
  roadQuad,
  mergeFlatGeometries,
  boxGeometry,
  roofGeometry,
} from '../core/greybox.js';

export const ZONE_ID = 'GREYBOX';
export const ZONE_KIND = 'greybox';

/* -------------------------------------------------------------------------- */
/*  区域作者的 kit 替身（t3 的 src/kit/** 就位后由 main.js 优先注入真 kit）        */
/* -------------------------------------------------------------------------- */

/**
 * 最小构件工厂替身：名称与 CONTRACTS §3.4 完全一致，几何为体块（**仅用于灰盒与 Node 侧测试**）。
 * 区域作者在 t3 的 kit 到位前可用它跑通 createZone 契约；不得据此交付最终画面。
 */
export function createFallbackKit(THREEImpl = THREE, config = CONFIG) {
  const materials = createGreyMaterials(config, THREEImpl);
  const roleOf = (params) => (params?.kind === 'cornerTower' ? 'wall' : 'wall');

  function asSlot(params, kind) {
    return {
      id: params.id ?? 'kit-part',
      name: params.name ?? '',
      kind: kind ?? params.kind ?? 'hall',
      category: kind ?? params.kind ?? 'hall',
      zone: params.zone ?? 'B',
      x: params.x ?? 0,
      z: params.z ?? 0,
      w: params.w ?? 12,
      d: params.d ?? 10,
      bays: params.bays ?? 3,
      terraceH: params.terraceH ?? 0.45,
      roofType: params.roofType ?? 'gableHip',
      grade: params.grade ?? 2,
      facing: params.facing ?? 'south',
      rotationYDeg: params.rotationYDeg ?? 0,
      visitable: false,
      baseY: params.baseY ?? (params.terraceH ?? 0.45),
      bodyBaseY: params.bodyBaseY ?? (params.terraceH ?? 0.45),
      eaveHeight: params.eaveHeight ?? (params.terraceH ?? 0.45) + 4.6,
      totalHeight: params.totalHeight ?? (params.terraceH ?? 0.45) + 9.4,
      bounds: {
        minX: (params.x ?? 0) - (params.w ?? 12) / 2,
        maxX: (params.x ?? 0) + (params.w ?? 12) / 2,
        minZ: (params.z ?? 0) - (params.d ?? 10) / 2,
        maxZ: (params.z ?? 0) + (params.d ?? 10) / 2,
      },
      entrance: { x: params.x ?? 0, y: params.bodyBaseY ?? 0.45, z: params.z ?? 0 },
      door: null,
      usage: '',
      info: '',
      courtyard: null,
      lodHint: 'mid',
      doorWidth: 0,
    };
  }

  function build(params = {}, kind = 'hall', role = null) {
    const group = new THREEImpl.Group();
    group.name = params.id ?? `fallback-${kind}`;
    const slot = asSlot(params, kind);
    const pieces = buildingPieces(THREEImpl, slot, config);
    const groups = [
      ['terrace', pieces.terrace],
      [role ?? roleOf(params), pieces.body],
      ['roof', pieces.roof],
      ['roofRidge', pieces.ridge],
    ];
    for (const [r, list] of groups) {
      if (list.length === 0) continue;
      const mesh = new THREEImpl.Mesh(mergeFlatGeometries(list), materials[r]);
      mesh.name = `${group.name}:${r}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (params.rotationYDeg) group.rotation.y = (params.rotationYDeg * Math.PI) / 180;
    return group;
  }

  return {
    __fallback: true,
    materials,
    hall: (p) => build(p, 'hall'),
    gateHall: (p) => build(p, 'gateHall'),
    sideHall: (p) => build(p, 'sideHall'),
    pavilion: (p) => build(p, 'pavilion'),
    cornerTower: (p) => build(p, 'cornerTower'),
    courtyardGate: (p) => build(p, 'courtyardGate'),
    wall: (p) => build(p, 'wall'),
    corridor: (p) => build(p, 'corridor'),
    terrace: (p) => build({ ...p, kind: 'terrace', roofType: 'gable' }, 'terrace', 'terrace'),
    stairs: (p) => build({ ...p, kind: 'stairs', roofType: 'gable', terraceH: p.terraceH ?? 0 },
      'stairs',
      'terrace',
    ),
    bridge: (p) => build({ ...p, kind: 'bridge', roofType: 'gable', terraceH: 0.6 }, 'bridge', 'bridge'),
    tree: (p) => {
      const g = new THREEImpl.Group();
      const trunk = new THREEImpl.Mesh(
        new THREEImpl.CylinderGeometry((p?.radius ?? 0.4) * 0.4, (p?.radius ?? 0.4) * 0.5, (p?.height ?? 8) * 0.4, 6),
        materials.courtWall,
      );
      trunk.position.y = (p?.height ?? 8) * 0.2;
      const canopy = new THREEImpl.Mesh(new THREEImpl.IcosahedronGeometry((p?.radius ?? 3), 1), materials.courtWall);
      canopy.position.y = (p?.height ?? 8) * 0.7;
      g.add(trunk, canopy);
      return g;
    },
    rockery: (p) => {
      const g = new THREEImpl.Group();
      const rock = new THREEImpl.Mesh(new THREEImpl.DodecahedronGeometry(p?.height ?? 4, 0), materials.terrace);
      rock.scale.set(1.4, 0.8, 1.1);
      g.add(rock);
      return g;
    },
    lantern: (p) => build({ ...p, kind: 'pavilion', roofType: 'pyramidal', w: p?.w ?? 1.2, d: p?.d ?? 1.2, terraceH: 0 },
      'lantern',
      'terrace',
    ),
    railing: (p) => build({ ...p, kind: 'railing', roofType: 'gable', terraceH: 0.1, w: p?.w ?? 2, d: p?.d ?? 0.3 }, 'railing', 'terrace'),
    bronze: (p) => build({ ...p, kind: 'bronze', roofType: 'pyramidal', w: p?.w ?? 1, d: p?.d ?? 1, terraceH: 0.2 }, 'bronze', 'roofRidge'),
    instance(mesh, count) {
      const instanced = new THREEImpl.InstancedMesh(mesh.geometry, mesh.material, count);
      instanced.name = `${mesh.name ?? 'instance'}x${count}`;
      return instanced;
    },
    lod(levels = []) {
      const lod = new THREEImpl.LOD();
      for (const level of levels) lod.addLevel(level.object, level.distance ?? 0);
      return lod;
    },
    roofGeometry: (params) => roofGeometry(THREEImpl, params),
  };
}

/* -------------------------------------------------------------------------- */
/*  灰盒本体                                                                    */
/* -------------------------------------------------------------------------- */

/** 灰盒几何装配（纯函数式：输入 layout 切片与 THREE，输出 mesh 组），供 audit 与测试在 Node 内直接调用。 */
export function assembleGreybox(THREEImpl, config, options = {}) {
  const skipZones = new Set(options.skipZones ?? []);
  const layout = options.layout ?? LAYOUT;
  const city = cityLayout();
  const materials = createGreyMaterials(config, THREEImpl);
  /** @type {Map<string, Map<string, object[]>>} zoneId → role → geometries */
  const buckets = new Map();
  const zoneGroups = new Map();
  const anchors = [];
  const buildings = [];
  const meshes = [];

  const bucket = (zoneId, role) => {
    if (!buckets.has(zoneId)) buckets.set(zoneId, new Map());
    const byRole = buckets.get(zoneId);
    if (!byRole.has(role)) byRole.set(role, []);
    return byRole.get(role);
  };

  const groundYOf = (x, z, fallback = 0) => {
    const y = layout.groundYAt(x, z);
    return y === null ? fallback : y;
  };

  /* 1. 区域地坪 */
  for (const zone of layout.ZONES) {
    if (skipZones.has(zone.id)) continue;
    for (const tile of zone.tiles) {
      const b = tile.bounds;
      const thickness = tile.id === 'T-F-outer-terrain' ? 1.2 : 0.6;
      bucket(zone.id, 'ground').push(
        boxGeometry(THREEImpl, {
          minX: b.minX,
          maxX: b.maxX,
          minY: tile.groundY - thickness,
          maxY: tile.groundY,
          minZ: b.minZ,
          maxZ: b.maxZ,
        }),
      );
    }
  }

  /* 2. 建筑体块（全部 67 栋，逐字段回显 layout.SLOTS） */
  for (const slot of layout.SLOTS) {
    const building = { ...slot };
    const anchor = new THREEImpl.Object3D();
    anchor.name = `building-anchor:${slot.id}`;
    anchor.position.set(slot.x, slot.baseY ?? 0, slot.z);
    anchor.userData.buildingId = slot.id;
    building.anchor = anchor;
    anchors.push(anchor);
    buildings.push(building);
    if (skipZones.has(slot.zone)) continue;
    const pieces = buildingPieces(THREEImpl, slot, config);
    for (const geo of pieces.terrace) bucket(slot.zone, 'terrace').push(geo);
    for (const geo of pieces.body) bucket(slot.zone, 'wall').push(geo);
    for (const geo of pieces.roof) bucket(slot.zone, 'roof').push(geo);
    for (const geo of pieces.ridge) bucket(slot.zone, 'roofRidge').push(geo);
  }

  /* 3. 院落围墙 + 宫墙 */
  for (const wall of layout.WALLS) {
    const zoneId = wall.owner ?? wall.zone ?? 'F';
    if (skipZones.has(zoneId)) continue;
    const mid = {
      x: (wall.from.x + wall.to.x) / 2,
      z: (wall.from.z + wall.to.z) / 2,
    };
    const y0 = wall.cityWall ? TERRAIN.cityGroundY : groundYOf(mid.x, mid.z, 0);
    const role = wall.cityWall ? 'terrace' : 'courtWall';
    for (const geo of wallSpanBoxes(THREEImpl, wall, y0)) bucket(zoneId, role).push(geo);
    if (wall.cityWall) {
      // 墙顶压顶/女墙
      const t = wall.thickness * 0.72;
      const horizontal = wall.axis === 'x';
      const y = y0 + wall.height;
      bucket(zoneId, 'courtWall').push(
        horizontal
          ? boxGeometry(THREEImpl, {
              minX: Math.min(wall.from.x, wall.to.x),
              maxX: Math.max(wall.from.x, wall.to.x),
              minY: y,
              maxY: y + layout.CITY_WALL.battlementHeight,
              minZ: wall.from.z - t / 2,
              maxZ: wall.from.z + t / 2,
            })
          : boxGeometry(THREEImpl, {
              minX: wall.from.x - t / 2,
              maxX: wall.from.x + t / 2,
              minY: y,
              maxY: y + layout.CITY_WALL.battlementHeight,
              minZ: Math.min(wall.from.z, wall.to.z),
              maxZ: Math.max(wall.from.z, wall.to.z),
            }),
      );
    }
  }

  /* 4. 台基 */
  for (const terrace of layout.TERRACES) {
    const zoneId = terrace.zone ?? terrace.owner;
    if (skipZones.has(zoneId)) continue;
    bucket(zoneId, 'terrace').push(
      boxGeometry(THREEImpl, {
        minX: terrace.bounds.minX,
        maxX: terrace.bounds.maxX,
        minY: terrace.y0,
        maxY: terrace.y1,
        minZ: terrace.bounds.minZ,
        maxZ: terrace.bounds.maxZ,
      }),
    );
  }

  /* 5. 水面（护城河 + 水池；标记 userData.waterSurface，由环境系统统一做微波动画） */
  const waterList = [
    ...layout.MOAT.rects.map((r) => ({ zone: 'F', bounds: r.bounds, y: layout.MOAT.waterY, depth: layout.MOAT.depth })),
    ...layout.WATER_BODIES.filter((w) => w.kind === 'pond').map((w) => ({ zone: w.owner, bounds: w.bounds, y: w.y, depth: w.depth })),
  ];
  for (const water of waterList) {
    if (skipZones.has(water.zone)) continue;
    bucket(water.zone, 'water').push(
      boxGeometry(THREEImpl, {
        minX: water.bounds.minX,
        maxX: water.bounds.maxX,
        minY: water.y - Math.max(0.4, water.depth),
        maxY: water.y,
        minZ: water.bounds.minZ,
        maxZ: water.bounds.maxZ,
      }),
    );
  }

  /* 6. 桥面 */
  for (const bridge of layout.BRIDGES) {
    if (skipZones.has(bridge.owner)) continue;
    bucket(bridge.owner, 'bridge').push(
      boxGeometry(THREEImpl, {
        minX: bridge.bounds.minX,
        maxX: bridge.bounds.maxX,
        minY: bridge.deckY - 0.8,
        maxY: bridge.deckY,
        minZ: bridge.bounds.minZ,
        maxZ: bridge.bounds.maxZ,
      }),
    );
  }

  /* 7. 道路 / 坡道 / 台阶条带 */
  for (const road of layout.ROADS) {
    if (skipZones.has(road.zone)) continue;
    bucket(road.zone, 'road').push(roadQuad(THREEImpl, road));
  }

  /* 8. 廊庑（体块围合感） */
  for (const corridor of layout.CORRIDORS) {
    if (skipZones.has(corridor.owner)) continue;
    const { from, to, width } = corridor;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    const y0 = groundYOf((from.x + to.x) / 2, (from.z + to.z) / 2, 0);
    const height = MODULES.courtyardWallHeight * 0.72;
    const corners = [
      { x: from.x - nx, z: from.z - nz },
      { x: from.x + nx, z: from.z + nz },
      { x: to.x + nx, z: to.z + nz },
      { x: to.x - nx, z: to.z - nz },
    ];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minZ = Math.min(a.z, b.z);
      const maxZ = Math.max(a.z, b.z);
      bucket(corridor.owner, 'courtWall').push(
        boxGeometry(THREEImpl, { minX, maxX, minY: y0, maxY: y0 + height, minZ, maxZ }),
      );
    }
  }

  /* 9. 点景（假山 / 影壁 / 钟鼓） */
  const scenicRole = { rockery: 'terrace', screenWall: 'courtWall', drum: 'roofRidge', bell: 'roofRidge' };
  for (const scenic of layout.SCENIC_OBJECTS) {
    if (skipZones.has(scenic.owner)) continue;
    bucket(scenic.owner, scenicRole[scenic.kind] ?? 'courtWall').push(
      boxGeometry(THREEImpl, {
        minX: scenic.bounds.minX,
        maxX: scenic.bounds.maxX,
        minY: 0,
        maxY: scenic.height,
        minZ: scenic.bounds.minZ,
        maxZ: scenic.bounds.maxZ,
      }),
    );
  }

  /* 10. 合并：zone × role → 一个 mesh */
  const zoneIdList = layout.ZONES.map((z) => z.id);
  for (const zoneId of zoneIdList) {
    const group = new THREEImpl.Group();
    group.name = `greybox:zone:${zoneId}`;
    group.userData.zoneId = zoneId;
    group.visible = !skipZones.has(zoneId);
    zoneGroups.set(zoneId, group);
    const byRole = buckets.get(zoneId);
    if (!byRole) continue;
    for (const [role, geometries] of byRole) {
      if (geometries.length === 0) continue;
      const geometry = mergeFlatGeometries(geometries);
      const mesh = new THREEImpl.Mesh(geometry, materials[role]);
      mesh.name = `greybox:${zoneId}:${role}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.role = role;
      if (role === 'water') {
        mesh.userData.waterSurface = true;
        mesh.castShadow = false;
      }
      group.add(mesh);
      meshes.push({ zoneId, role, mesh, triangles: geometry.getAttribute('position').count / 3 });
    }
    if (skipZones.has(zoneId)) {
      // 跳过的区域：不挂 children（也不注册其注册条目）
      continue;
    }
  }

  const preMergePieces = [...buckets.values()].reduce(
    (sum, byRole) => sum + [...byRole.values()].reduce((n, list) => n + list.length, 0),
    0,
  );

  return { zoneGroups, buildings, anchors, materials, meshes, preMergePieces, waterList, city, zoneIdList };
}

/**
 * 区域入口（契约 §3.1）。灰盒是整城范围，`scope='city'`。
 * @param {object} ctx
 */
export async function createZone(ctx) {
  const THREEImpl = ctx?.THREE ?? THREE;
  if (ctx && ctx.THREE && ctx.THREE !== THREE) throw new Error('_greybox: ctx.THREE 必须是同一份 three（契约 §3.1）');
  const config = ctx?.config ?? CONFIG;
  const skipZones = ctx?.shared?.greyboxSkipZones ?? [];
  const assembled = assembleGreybox(THREEImpl, config, { skipZones });
  const layout = LAYOUT;

  const root = new THREEImpl.Group();
  root.name = `zone-root:${ZONE_ID}`;
  for (const zoneId of assembled.zoneIdList) {
    if (skipZones.includes(zoneId)) continue;
    const group = assembled.zoneGroups.get(zoneId);
    if (!group) continue;
    root.add(group);
    for (const anchor of assembled.anchors) {
      if (anchor.userData.buildingId?.startsWith(`${zoneId}-`)) group.add(anchor);
    }
  }

  const buildings = assembled.buildings.filter((b) => !skipZones.includes(b.zone));
  const connectors = layout.CONNECTORS.map((c) => ({ ...c }));
  const colliders = {
    obstacles: layout.OBSTACLES.map((o) => ({ ...o })),
    walkable: layout.WALKABLE.map((w) => ({ ...w })),
    ramps: rampsFromRoads(layout.ROADS).map((r) => ({ ...r })),
  };
  const viewpoints = layout.VIEWPOINTS.map((v) => ({ ...v }));
  const lightAnchors = layout.LIGHT_ANCHORS.map((a) => ({ ...a, position: { ...a.position } }));

  const stats = {
    kind: ZONE_KIND,
    buildings: buildings.length,
    /** 合批前：生成的体块几何数量（台基/屋身/屋面/正脊逐块） */
    preMergePieces: assembled.preMergePieces,
    /** 合批后：区域×材质角色 → 1 个 Mesh（= 绘制批次） */
    meshes: assembled.meshes.length,
    triangles: assembled.meshes.reduce((sum, m) => sum + m.triangles, 0),
    perZone: assembled.zoneIdList.map((zoneId) => {
      const list = assembled.meshes.filter((m) => m.zoneId === zoneId);
      return {
        zone: zoneId,
        drawCalls: list.length,
        triangles: list.reduce((sum, m) => sum + m.triangles, 0),
      };
    }),
    connectors: connectors.length,
    obstacles: colliders.obstacles.length,
    walkable: colliders.walkable.length,
    ramps: colliders.ramps.length,
    viewpoints: viewpoints.length,
    lightAnchors: lightAnchors.length,
    skippedZones: [...skipZones],
  };

  let disposed = false;
  return {
    root,
    buildings,
    connectors,
    colliders,
    viewpoints,
    lightAnchors,
    update(/* dtSeconds, elapsedSeconds, state */) {
      // 灰盒是静态体块：动画（水面微波/烟雾/微尘/灯光）全部归 src/core/environment.js 统一处理
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh } of assembled.meshes) {
        mesh.geometry.dispose();
        root.remove(mesh);
      }
      for (const material of Object.values(assembled.materials)) material.dispose();
      root.clear();
    },
    /** 真实区域就位后隐藏对应灰盒 */
    setZoneVisible(zoneId, visible) {
      const group = assembled.zoneGroups.get(zoneId);
      if (!group) return false;
      group.visible = visible;
      return true;
    },
    zoneGroups: assembled.zoneGroups,
    stats,
  };
}

export default createZone;
