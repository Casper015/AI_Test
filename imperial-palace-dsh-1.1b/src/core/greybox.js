/**
 * 灰盒几何工厂（G0）—— 只按 `layout` 的冻结数值把整城"体块化"：
 * 台基 / 屋身 / 屋顶（庑殿·重檐·歇山·硬山·攒尖）/ 院墙（自动避让门洞）/ 宫墙 / 桥 / 水面 / 道路。
 *
 * 用途：
 *   - `src/zones/_greybox.js`：整城灰盒（首屏可见完整宫城，G0）；
 *   - `src/zones/_template.js`：区域模板复用同一套几何，保证模板开箱即合约。
 *
 * 性能取向：几何**按 区域 × 材质角色** 合并成单一 BufferGeometry（一个角色 = 1 个 draw call），
 * 不依赖任何 addon，纯 position/normal 顶点流（灰盒无贴图）。
 */

import * as THREE from 'three';
import {
  COLORS,
  COLORS_DERIVED,
  COLOR_ROLES,
  MODULES,
  GRADES,
  ROOF_TYPES,
  TERRAIN,
} from '../shared/config.js';

/** 材质角色（灰盒用的最小集合） */
export const GREY_ROLES = Object.freeze(['terrace', 'wall', 'roof', 'roofRidge', 'courtWall', 'ground', 'road', 'water', 'bridge']);

const ROLE_MATERIAL = Object.freeze({
  terrace: { role: 'terraceStone', roughness: 0.72, metalness: 0.0 },
  wall: { role: 'wallPrimary', roughness: 0.82, metalness: 0.0 },
  roof: { role: 'roofPrimary', roughness: 0.42, metalness: 0.06 },
  roofRidge: { role: 'roofRidge', roughness: 0.4, metalness: 0.08 },
  courtWall: { role: 'courtyardWallTop', roughness: 0.78, metalness: 0.0 },
  ground: { role: 'pavingPlaza', roughness: 0.86, metalness: 0.0 },
  road: { role: 'pavingRoad', roughness: 0.82, metalness: 0.0 },
  water: { role: 'water', roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.9 },
  bridge: { role: 'balustrade', roughness: 0.66, metalness: 0.0 },
});

const colorOf = (config, roleKey) => {
  const token = COLOR_ROLES[roleKey] ?? roleKey;
  return config.COLORS[token] ?? COLORS[token] ?? COLORS_DERIVED[token] ?? token;
};

/** 共享灰盒材质（按角色，材质数 = 角色数，不随建筑数量增长）。 */
export function createGreyMaterials(config, THREEImpl = THREE) {
  const materials = {};
  for (const role of GREY_ROLES) {
    const spec = ROLE_MATERIAL[role];
    materials[role] = new THREEImpl.MeshStandardMaterial({
      color: new THREEImpl.Color(colorOf(config, spec.role)),
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: spec.transparent === true,
      opacity: spec.opacity ?? 1,
      side: THREEImpl.FrontSide,
    });
    materials[role].name = `grey-${role}`;
  }
  return materials;
}

/* -------------------------------------------------------------------------- */
/*  基础几何：把 THREE 几何统一成"只有 position + normal 的非索引三角流"          */
/* -------------------------------------------------------------------------- */

function toFlatTriangles(geometry) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const count = position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  pos.set(position.array.subarray(0, count * 3));
  if (normal) nor.set(normal.array.subarray(0, count * 3));
  return { position: pos, normal: nor, count };
}

/** 合并一组已变换的几何（角色内合并 = 1 draw call）。 */
export function mergeFlatGeometries(list) {
  let total = 0;
  const parts = list.map((geo) => {
    const flat = toFlatTriangles(geo);
    total += flat.count;
    geo.dispose?.();
    return flat;
  });
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  let offset = 0;
  for (const part of parts) {
    position.set(part.position, offset * 3);
    normal.set(part.normal, offset * 3);
    offset += part.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** 轴对齐盒体（世界坐标直接烘焙）。 */
export function boxGeometry(THREEImpl, { minX, maxX, minY, maxY, minZ, maxZ }) {
  const w = Math.max(0.01, maxX - minX);
  const h = Math.max(0.01, maxY - minY);
  const d = Math.max(0.01, maxZ - minZ);
  const geo = new THREEImpl.BoxGeometry(w, h, d);
  geo.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  return geo;
}

export function boundsBox(THREEImpl, bounds, y0, y1) {
  return boxGeometry(THREEImpl, { minX: bounds.minX, maxX: bounds.maxX, minY: y0, maxY: y1, minZ: bounds.minZ, maxZ: bounds.maxZ });
}

/** 由 4 个角点构成的双三角面（道路 / 坡道 / 广场条带，支持不同标高）。 */
export function quadGeometry(THREEImpl, corners) {
  const geo = new THREEImpl.BufferGeometry();
  const [a, b, c, d] = corners;
  const vertices = new Float32Array([
    a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
    a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
  ]);
  geo.setAttribute('position', new THREEImpl.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

/* -------------------------------------------------------------------------- */
/*  屋顶                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 屋顶几何：由底面矩形 + 脊线/顶点构成，重新计算法线（平直着色，灰盒够用）。
 * `type` 取 config.ROOF_TYPES 的键。
 */
export function roofGeometry(THREEImpl, { w, d, height, type = 'hip', ridgeRatio = 0.55 }) {
  const hw = w / 2;
  const hd = d / 2;
  const h = Math.max(0.8, height);
  const tris = [];
  const push = (p1, p2, p3) => tris.push(p1, p2, p3);
  const c0 = { x: -hw, y: 0, z: -hd };
  const c1 = { x: hw, y: 0, z: -hd };
  const c2 = { x: hw, y: 0, z: hd };
  const c3 = { x: -hw, y: 0, z: hd };
  const ridge = ROOF_TYPES[type] ?? ROOF_TYPES.hip;

  if (ridge.hip && !ridge.ridge) {
    // 攒尖顶：四坡交于一点
    const apex = { x: 0, y: h, z: 0 };
    push(c0, c1, apex);
    push(c1, c2, apex);
    push(c2, c3, apex);
    push(c3, c0, apex);
  } else {
    const alongX = w >= d;
    const long = Math.max(w, d);
    const short = Math.min(w, d);
    const rl = ridge.id === 'gable' ? long / 2 : Math.max(short * 0.18, ((long - short) / 2) * ridgeRatio * 2);
    const r0 = alongX ? { x: -rl, y: h, z: 0 } : { x: 0, y: h, z: -rl };
    const r1 = alongX ? { x: rl, y: h, z: 0 } : { x: 0, y: h, z: rl };
    if (alongX) {
      push(c0, c1, r1);
      push(c0, r1, r0);
      push(c2, c3, r0);
      push(c2, r0, r1);
      if (ridge.id === 'gable') {
        push(c3, c0, r0);
        push(c1, c2, r1);
      } else {
        push(c3, c0, r0);
        push(c1, c2, r1);
      }
    } else {
      push(c1, c2, r1);
      push(c1, r1, r0);
      push(c3, c0, r0);
      push(c3, r0, r1);
      push(c0, c1, r0);
      push(c2, c3, r1);
    }
  }

  const position = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => {
    position[i * 3] = p.x;
    position[i * 3 + 1] = p.y;
    position[i * 3 + 2] = p.z;
  });
  const geo = new THREEImpl.BufferGeometry();
  geo.setAttribute('position', new THREEImpl.BufferAttribute(position, 3));
  geo.computeVertexNormals();
  return geo;
}

/* -------------------------------------------------------------------------- */
/*  建筑体块                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 按槽位生成体块（世界坐标已烘焙）。返回 `{ terrace, body, roof, ridge, tierCount }` 几何数组。
 * 屋身按 kind 区分：门殿/院门留门洞（两侧墙垛 + 门楣），角楼三层重檐，其余为整块屋身。
 */
export function buildingPieces(THREEImpl, slot, config) {
  const grade = GRADES[slot.grade] ?? GRADES[2];
  const roofSpec = ROOF_TYPES[slot.roofType] ?? ROOF_TYPES.hip;
  const groundY = (slot.baseY ?? 0) - (slot.terraceH ?? 0);
  const bodyBase = slot.bodyBaseY ?? groundY;
  const eaveY = slot.eaveHeight ?? bodyBase + MODULES.eaveHeight;
  const overhang = MODULES.eaveOverhang * grade.eaveOverhangFactor;
  const terracePieces = [];
  const bodyPieces = [];
  const roofPieces = [];
  const ridgePieces = [];
  const w = slot.w;
  const d = slot.d;
  const cx = slot.x;
  const cz = slot.z;

  // 台基（外扩台明）
  if ((slot.terraceH ?? 0) > 0.01) {
    const pw = MODULES.plinthWidth;
    terracePieces.push(
      boxGeometry(THREEImpl, {
        minX: cx - w / 2 - pw,
        maxX: cx + w / 2 + pw,
        minY: groundY,
        maxY: groundY + slot.terraceH,
        minZ: cz - d / 2 - pw,
        maxZ: cz + d / 2 + pw,
      }),
    );
  }

  const bodyH = Math.max(1.2, eaveY - bodyBase);
  const isGate = slot.kind === 'gateHall' || slot.kind === 'courtyardGate';
  const tiers = slot.kind === 'cornerTower' ? 3 : 1;
  const tierHeight = slot.kind === 'cornerTower' ? bodyH / 3 : bodyH;

  for (let tier = 0; tier < tiers; tier += 1) {
    const shrink = slot.kind === 'cornerTower' ? 1 - tier * 0.12 : 1;
    const tierW = w * shrink;
    const tierD = d * shrink;
    const tierBase = bodyBase + tier * tierHeight;
    const tierTop = tierBase + tierHeight * (slot.kind === 'cornerTower' ? 0.92 : 1);
    if (isGate && tier === 0) {
      // 门洞：两侧墙垛 + 门楣（门洞可通行，与 layout.OBSTACLES 的 door 数据一致）
      const doorW = slot.doorWidth || Math.min(w * MODULES.gateOpeningRatio, 26);
      const doorH = Math.min(9, MODULES.eaveHeight * 0.7);
      const pierW = Math.max(1.2, (tierW - doorW) / 2);
      const alongZ = slot.facing === 'south' || slot.facing === 'north';
      for (const side of [-1, 1]) {
        bodyPieces.push(
          alongZ
            ? boxGeometry(THREEImpl, {
                minX: cx + side * (doorW / 2 + pierW / 2) - pierW / 2,
                maxX: cx + side * (doorW / 2 + pierW / 2) + pierW / 2,
                minY: tierBase,
                maxY: tierTop,
                minZ: cz - tierD / 2,
                maxZ: cz + tierD / 2,
              })
            : boxGeometry(THREEImpl, {
                minX: cx - tierW / 2,
                maxX: cx + tierW / 2,
                minY: tierBase,
                maxY: tierTop,
                minZ: cz + side * (doorW / 2 + pierW / 2) - pierW / 2,
                maxZ: cz + side * (doorW / 2 + pierW / 2) + pierW / 2,
              }),
        );
      }
      bodyPieces.push(
        boxGeometry(THREEImpl, {
          minX: cx - tierW / 2,
          maxX: cx + tierW / 2,
          minY: tierBase + doorH,
          maxY: tierTop,
          minZ: cz - tierD / 2,
          maxZ: cz + tierD / 2,
        }),
      );
    } else {
      bodyPieces.push(
        boxGeometry(THREEImpl, {
          minX: cx - tierW / 2,
          maxX: cx + tierW / 2,
          minY: tierBase,
          maxY: tierTop,
          minZ: cz - tierD / 2,
          maxZ: cz + tierD / 2,
        }),
      );
    }

    const roofH = (slot.totalHeight ?? tierTop + 4) - eaveY;
    if (roofSpec.doubleEave) {
      const lowerH = Math.max(1.4, (roofH - MODULES.eaveHeight * 0.35) * 0.55);
      const bandH = Math.max(0.6, roofH * 0.2);
      const upperH = Math.max(1.4, roofH - lowerH - bandH);
      roofPieces.push(
        roofGeometry(THREEImpl, { w: tierW + overhang * 2, d: tierD + overhang * 2, height: lowerH, type: 'hip' }).translate(cx, tierTop, cz),
      );
      bodyPieces.push(
        boxGeometry(THREEImpl, {
          minX: cx - (tierW * 0.86) / 2,
          maxX: cx + (tierW * 0.86) / 2,
          minY: tierTop + lowerH,
          maxY: tierTop + lowerH + bandH,
          minZ: cz - (tierD * 0.86) / 2,
          maxZ: cz + (tierD * 0.86) / 2,
        }),
      );
      roofPieces.push(
        roofGeometry(THREEImpl, { w: tierW * 0.72 + overhang, d: tierD * 0.72 + overhang, height: upperH, type: 'hip' }).translate(
          cx,
          tierTop + lowerH + bandH,
          cz,
        ),
      );
      ridgePieces.push(
        boxGeometry(THREEImpl, {
          minX: cx - Math.min(tierW * 0.3, 6),
          maxX: cx + Math.min(tierW * 0.3, 6),
          minY: tierTop + lowerH + bandH + upperH,
          maxY: tierTop + lowerH + bandH + upperH + 0.6,
          minZ: cz - 0.5,
          maxZ: cz + 0.5,
        }),
      );
    } else {
      roofPieces.push(
        roofGeometry(THREEImpl, {
          w: tierW + overhang * 2,
          d: tierD + overhang * 2,
          height: roofH,
          type: slot.roofType,
        }).translate(cx, tierTop, cz),
      );
      if (roofSpec.ridge) {
        const alongX = tierW >= tierD;
        ridgePieces.push(
          alongX
            ? boxGeometry(THREEImpl, {
                minX: cx - Math.min(tierW * 0.32, 8),
                maxX: cx + Math.min(tierW * 0.32, 8),
                minY: tierTop + roofH - 0.2,
                maxY: tierTop + roofH + 0.5,
                minZ: cz - 0.5,
                maxZ: cz + 0.5,
              })
            : boxGeometry(THREEImpl, {
                minX: cx - 0.5,
                maxX: cx + 0.5,
                minY: tierTop + roofH - 0.2,
                maxY: tierTop + roofH + 0.5,
                minZ: cz - Math.min(tierD * 0.32, 8),
                maxZ: cz + Math.min(tierD * 0.32, 8),
              }),
        );
      }
    }
  }

  return { terrace: terracePieces, body: bodyPieces, roof: roofPieces, ridge: ridgePieces, tierCount: tiers };
}

/* -------------------------------------------------------------------------- */
/*  墙体（自动避让门洞）                                                        */
/* -------------------------------------------------------------------------- */

/** 把一段墙按 openings 切成若干实心段（门洞处留空）。`y0` = 该墙的落地标高。 */
export function wallSpanBoxes(THREEImpl, wall, y0 = 0) {
  const from = wall.from;
  const to = wall.to;
  const horizontal = wall.axis === 'x';
  const lo = horizontal ? Math.min(from.x, to.x) : Math.min(from.z, to.z);
  const hi = horizontal ? Math.max(from.x, to.x) : Math.max(from.z, to.z);
  const line = horizontal ? from.z : from.x;
  const t = wall.thickness;
  const gaps = (wall.openings ?? [])
    .map((o) => [o.at - o.width / 2, o.at + o.width / 2])
    .sort((a, b) => a[0] - b[0]);

  const spans = [];
  let cursor = lo;
  for (const [a, b] of gaps) {
    const start = Math.max(lo, a);
    if (start > cursor + 0.05) spans.push([cursor, start]);
    cursor = Math.max(cursor, Math.min(hi, b));
  }
  if (hi > cursor + 0.05) spans.push([cursor, hi]);

  return spans.map(([a, b]) =>
    horizontal
      ? boxGeometry(THREEImpl, { minX: a, maxX: b, minY: y0, maxY: y0 + wall.height, minZ: line - t / 2, maxZ: line + t / 2 })
      : boxGeometry(THREEImpl, { minX: line - t / 2, maxX: line + t / 2, minY: y0, maxY: y0 + wall.height, minZ: a, maxZ: b }),
  );
}

/** 道路/坡道条带（支持两端不同标高，因此台阶与坡道在灰盒里也是斜坡面）。 */
export function roadQuad(THREEImpl, road) {
  const { from, to } = road;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * (road.width / 2);
  const nz = (dx / len) * (road.width / 2);
  return quadGeometry(THREEImpl, [
    { x: from.x - nx, y: from.y + 0.04, z: from.z - nz },
    { x: from.x + nx, y: from.y + 0.04, z: from.z + nz },
    { x: to.x + nx, y: to.y + 0.04, z: to.z + nz },
    { x: to.x - nx, y: to.y + 0.04, z: to.z - nz },
  ]);
}

/** 灰盒的共享材质角色 → 供 `_greybox` / `_template` 复用。 */
export const GREY_ROLE_MATERIAL = ROLE_MATERIAL;
export { colorOf as greyColorOf };
