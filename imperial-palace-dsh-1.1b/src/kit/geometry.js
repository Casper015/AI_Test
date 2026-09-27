/**
 * geometry.js — 参数化几何基元 + 官式构件几何（屋面 / 屋身 / 台基 / 栏杆 / 台阶）
 * =============================================================================
 * 形制一致性靠"同一公式 + 同一 config 令牌"实现（计划 §3.1「同类建筑采用一致的屋顶坡度、飞檐弧度、
 * 柱径、檐高与开间模数」）：
 *   - 庑殿顶 = 4 面坡 + 长正脊（顶边收成一条线段，不是尖顶）
 *   - 攒尖顶 = 顶边收成一个点（宝顶）；硬山 = 2 面坡 + 山墙；歇山 = 4 面坡 + 山花
 *   - 屋面凹曲：y = rise·t^p（举架）；檐口起翘 (eaveLift+eaveRiseAtCorner)·|2v−1|^n 按 (1−t)² 衰减
 *   - UV 一律"米制"：u/v = 真实尺寸 / kit.tileMeters(材质)，因此全城瓦垄/铺地/石作图案尺度一致
 * 三角面预算：单建筑 ≤ config.BUDGET.triangles.perBuildingMax（24000），由 tests/kit.test.mjs 断言。
 */

import { THREE } from './three-ref.js';
import { mergeGeometries } from './merge.js';
import { PROPORTIONS } from './tokens.js';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _mid = new THREE.Vector3();

/** 统一转 non-indexed（three 的 PolyhedronGeometry 本身已是非索引，直接调用会打警告）。 */
function nonIndexed(geometry) {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/* ------------------------------------------------------------------ 累积器 */

/** 按 part + material 收集几何，最后每桶合并成单个几何（减少绘制调用）。 */
export class Parts {
  constructor() {
    this.buckets = new Map();
    this.dims = {};
    this.notes = [];
  }

  add(part, material, geometry, { dims = null } = {}) {
    if (!geometry) return this;
    const key = `${part}|${material}`;
    if (!this.buckets.has(key)) this.buckets.set(key, { part, material, geometries: [] });
    this.buckets.get(key).geometries.push(geometry);
    if (dims) this.dims[part] = dims;
    return this;
  }

  note(text) {
    this.notes.push(text);
    return this;
  }

  /** 把一个桶的 part 改名（例如重檐的下层腰檐 roof → lowerRoof）。 */
  rename(from, to) {
    for (const [key, bucket] of [...this.buckets.entries()]) {
      if (bucket.part !== from) continue;
      this.buckets.delete(key);
      const next = { ...bucket, part: to };
      const nextKey = `${to}|${bucket.material}`;
      if (!this.buckets.has(nextKey)) this.buckets.set(nextKey, next);
      else this.buckets.get(nextKey).geometries.push(...bucket.geometries);
    }
    return this;
  }

  /** 吸收另一组几何（合成同一个建筑）。 */
  absorb(other) {
    if (!other) return this;
    for (const bucket of other.buckets.values()) {
      const key = `${bucket.part}|${bucket.material}`;
      if (!this.buckets.has(key)) this.buckets.set(key, { part: bucket.part, material: bucket.material, geometries: [] });
      this.buckets.get(key).geometries.push(...bucket.geometries);
    }
    Object.assign(this.dims, other.dims);
    this.notes.push(...other.notes);
    other.buckets.clear();
    return this;
  }

  /** 合并成 [{ part, material, geometry }]，几何统一带 kitOwned 标记。 */
  merge(T) {
    const out = [];
    for (const bucket of this.buckets.values()) {
      const geometry = mergeGeometries(T, bucket.geometries);
      geometry.userData.kitOwned = true;
      geometry.userData.part = bucket.part;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      out.push({ part: bucket.part, material: bucket.material, geometry, dims: this.dims[bucket.part] ?? null });
    }
    this.buckets.clear();
    return out;
  }

  get partNames() {
    return [...new Set([...this.buckets.values()].map((b) => b.part))].sort();
  }

  triangleCount() {
    let n = 0;
    for (const bucket of this.buckets.values()) {
      for (const g of bucket.geometries) {
        const pos = g.attributes.position;
        n += pos ? Math.floor(pos.count / 3) : 0;
      }
    }
    return n;
  }
}

/* ------------------------------------------------------------------ 基元 */

export function translate(T, geometry, x, y, z) {
  geometry.applyMatrix4(_m4.makeTranslation(x, y, z));
  return geometry;
}

/** 盒体 6 个面的 UV 换算成米制（px,nx,py,ny,pz,nz，与 three 的面序一致）。 */
export function metricBoxUVs(geometry, { w, h, d, tile = 1 }) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  const faces = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f += 1) {
    const [du, dv] = faces[f];
    for (let k = 0; k < 6; k += 1) {
      const i = f * 6 + k;
      if (i >= uv.count) break;
      uv.setXY(i, (uv.getX(i) * du) / tile, (uv.getY(i) * dv) / tile);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/** 轴对齐盒（y = 底面高度）。 */
/**
 * **世界锚定**的墙面 UV 重算（t49：门两侧/门额/立面分块的贴图相位）。
 * -----------------------------------------------------------------------------
 * 缺陷：`metricBoxUVs()` 只用每个盒体**自身的 0..1 面内坐标**乘 (真实尺寸/tile) ⇒ 每块相位从 0 起。
 *   `makeWall` 按洞口把墙切成左段/门额/右段（`facadeWall` 同理按门窗切格子）⇒ **相邻块相位跳变**
 * （实测右段 u 0→14.6875，应为 16.5625 ⇒ 偏 106.00m；门额 0→1.875，应为 14.6875 ⇒ 偏 94.00m）。
 * 修法：**不改 tile 尺度、不换贴图、不关材质绕**，改为按**三角形主法线**用**平移后（= 墙内绝对）坐标**填 u/v：
 *   · ±z 面 ⇒ u = x/tile + offsetU，v = y/tile + offsetV
 *   · ±x 面 ⇒ u = z/tile + offsetU，v = y/tile + offsetV
 *   · ±y 面 ⇒ u = x/tile + offsetU，v = z/tile + offsetV
 * ⇒ 同一堵墙的相邻分块在同一位置得到同一相位（1e-3 格内），且 **±z 两面各自按世界坐标**（不给所有面加同一常数）。
 * `offsetU/offsetV` 用于把墙内局部坐标平移到**世界沿墙轴坐标**（多段共线宫墙之间也不留缝）。
 */
export function anchorFaceUVs(geometry, { tile = 1, offsetU = 0, offsetV = 0, offsetPerpU = 0 } = {}) {
  const uv = geometry.attributes.uv;
  const pos = geometry.attributes.position;
  if (!uv || !pos) return geometry;
  const inv = 1 / tile;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const ax = pos.getX(i); const ay = pos.getY(i); const az = pos.getZ(i);
    const bx = pos.getX(i + 1); const by = pos.getY(i + 1); const bz = pos.getZ(i + 1);
    const cx = pos.getX(i + 2); const cy = pos.getY(i + 2); const cz = pos.getZ(i + 2);
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
    const nx = Math.abs(uy * vz - uz * vy); const ny = Math.abs(uz * vx - ux * vz); const nz = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k += 1) {
      const px = pos.getX(i + k); const py = pos.getY(i + k); const pz = pos.getZ(i + k);
      let u; let v;
      if (nz >= nx && nz >= ny) { u = px * inv + offsetU; v = py * inv + offsetV; }        // ±z 墙面
      else if (nx >= ny) { u = pz * inv + offsetPerpU; v = py * inv + offsetV; }           // ±x 端面（垂直轴）
      else { u = px * inv + offsetU; v = pz * inv + offsetPerpU; }                         // 顶/底
      uv.setXY(i + k, u, v);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

export function box(T, { w, h, d, x = 0, y = 0, z = 0, tile = 1, uvAnchor = false, uvOffsetU = 0, uvOffsetV = 0, uvOffsetPerpU = 0 }) {
  const g = nonIndexed(new T.BoxGeometry(w, h, d));
  metricBoxUVs(g, { w, h, d, tile });
  const out = translate(T, g, x, y + h / 2, z);
  if (uvAnchor) anchorFaceUVs(out, { tile, offsetU: uvOffsetU, offsetV: uvOffsetV, offsetPerpU: uvOffsetPerpU });
  return out;
}

/** 圆柱（y = 底面高度，UV 米制）。 */
export function cylinder(T, { rt, rb = rt, h, seg = 8, x = 0, y = 0, z = 0, tile = 1, capped = true }) {
  const g = nonIndexed(new T.CylinderGeometry(rt, rb, h, seg, 1, !capped));
  const uv = g.attributes.uv;
  const circumference = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (uv.getX(i) * circumference) / tile, (uv.getY(i) * h) / tile);
  }
  uv.needsUpdate = true;
  return translate(T, g, x, y + h / 2, z);
}

/** 球体（树冠、宝珠、门钉）。 */
export function sphere(T, { r, seg = 10, rings = 6, x = 0, y = 0, z = 0, scaleY = 1, scaleXZ = 1 }) {
  const g = nonIndexed(new T.SphereGeometry(r, seg, rings));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    p.setXYZ(i, p.getX(i) * scaleXZ, p.getY(i) * scaleY, p.getZ(i) * scaleXZ);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return translate(T, g, x, y, z);
}

/** 锥体（攒尖、树冠）。 */
export function cone(T, { r, h, seg = 8, x = 0, y = 0, z = 0 }) {
  return translate(T, nonIndexed(new T.ConeGeometry(r, h, seg)), x, y + h / 2, z);
}

/** 旋转体（铜器/宝顶/灯具/香炉）。 */
export function lathe(T, { points, seg = 12, x = 0, y = 0, z = 0, phiLength = Math.PI * 2 }) {
  const pts = points.map((p) => new T.Vector2(p[0], p[1]));
  return translate(T, nonIndexed(new T.LatheGeometry(pts, seg, 0, phiLength)), x, y, z);
}

/** 多面体（山石）。 */
export function polyhedron(T, { r, detail = 0, x = 0, y = 0, z = 0, stretch = [1, 1, 1] }) {
  const g = nonIndexed(new T.IcosahedronGeometry(r, detail));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    p.setXYZ(i, p.getX(i) * stretch[0], p.getY(i) * stretch[1], p.getZ(i) * stretch[2]);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return translate(T, g, x, y, z);
}

/** 任意三维方向的"梁"（垂脊、博风板、桥栏、廊架）。 */
export function beam(T, { from, to, thickness = 0.2, tile = 1 }) {
  const a = new THREE.Vector3(from.x, from.y, from.z);
  const b = new THREE.Vector3(to.x, to.y, to.z);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 0.001;
  const g = nonIndexed(new T.BoxGeometry(thickness, len, thickness * 2));
  metricBoxUVs(g, { w: thickness, h: len, d: thickness * 2, tile });
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _q.setFromUnitVectors(_up, dir.clone().normalize());
  g.applyMatrix4(_m4.makeRotationFromQuaternion(_q));
  g.applyMatrix4(_m4.makeTranslation(_mid.x, _mid.y, _mid.z));
  return g;
}

/** 三角棱柱（硬山/歇山山墙）。profile 为 (z,y) 折线，沿 X 挤出厚度。 */
export function triPrism(T, { profile, thickness, x = 0, y = 0, z = 0, tile = 1 }) {
  const h = thickness / 2;
  const positions = [];
  const uvs = [];
  const push = (px, py, pz, u, v) => {
    positions.push(px + x, py + y, pz + z);
    uvs.push(u / tile, v / tile);
  };
  const n = profile.length;
  for (let i = 0; i < n; i += 1) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    push(-h, a[1], a[0], a[0], a[1]);
    push(h, a[1], a[0], a[0], a[1]);
    push(h, b[1], b[0], b[0], b[1]);
    push(-h, a[1], a[0], a[0], a[1]);
    push(h, b[1], b[0], b[0], b[1]);
    push(-h, b[1], b[0], b[0], b[1]);
  }
  for (let i = 1; i < n - 1; i += 1) {
    push(-h, profile[0][1], profile[0][0], profile[0][0], profile[0][1]);
    push(-h, profile[i + 1][1], profile[i + 1][0], profile[i + 1][0], profile[i + 1][1]);
    push(-h, profile[i][1], profile[i][0], profile[i][0], profile[i][1]);
    push(h, profile[0][1], profile[0][0], profile[0][0], profile[0][1]);
    push(h, profile[i][1], profile[i][0], profile[i][0], profile[i][1]);
    push(h, profile[i + 1][1], profile[i + 1][0], profile[i + 1][0], profile[i + 1][1]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ 屋面 */

function orientOutward(T, geometry, outward) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  if (pos.count < 3) return g;
  const ax = pos.getX(0);
  const ay = pos.getY(0);
  const az = pos.getZ(0);
  const ux = pos.getX(1) - ax;
  const uy = pos.getY(1) - ay;
  const uz = pos.getZ(1) - az;
  const vx = pos.getX(2) - ax;
  const vy = pos.getY(2) - ay;
  const vz = pos.getZ(2) - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  if (nx * outward.x + ny * outward.y + nz * outward.z < 0) {
    const arr = pos.array;
    for (let i = 0; i + 8 < arr.length; i += 9) {
      for (let k = 0; k < 3; k += 1) {
        const tmp = arr[i + 3 + k];
        arr[i + 3 + k] = arr[i + 6 + k];
        arr[i + 6 + k] = tmp;
      }
    }
    pos.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/**
 * 单面坡曲面（凹曲 + 檐口起翘 + 角部外挑）。
 * t = 0 檐口、t = 1 顶缘；水平线性 t，竖直 rise·t^p（p 由 ROOF_TYPES[*].curvature 推）；
 * 檐口起翘 (eaveLift + eaveRiseAtCorner)·|2v−1|^(2.4−curve) 按 (1−t)² 衰减；角部水平外挑 eaveLift·|2v−1|²。
 */
/**
 * 屋面曲面的参数函数（roofPatch 与垂脊共用同一公式：垂脊必须贴着凹曲曲面，不能是"架空直线"）。
 * t = 0 檐口、t = 1 顶缘；v = 沿檐口方向 0..1。
 */
export function roofSurfacePoint({ bottomA, bottomB, topA, topB, rise = 0, curve = 0.9, eaveLift = 0, eaveRiseAtCorner = 0 }, t, v) {
  const liftExp = 2.4 - Math.min(1, Math.max(0, curve));
  const p = 1.35 + 0.5 * Math.min(1, Math.max(0, curve));
  const bx = bottomA.x + (bottomB.x - bottomA.x) * v;
  const bz = bottomA.z + (bottomB.z - bottomA.z) * v;
  const tx = topA.x + (topB.x - topA.x) * v;
  const tz = topA.z + (topB.z - topA.z) * v;
  const lv = Math.abs(2 * v - 1);
  const decay = (1 - t) * (1 - t);
  const lift = (eaveLift + eaveRiseAtCorner) * Math.pow(lv, liftExp) * decay;
  const thrust = eaveLift * Math.pow(lv, 2) * decay;
  const hx = bx - tx;
  const hz = bz - tz;
  const hl = Math.hypot(hx, hz) || 1;
  return {
    x: bx + (tx - bx) * t + (hx / hl) * thrust,
    y: rise * Math.pow(t, p) + lift,
    z: bz + (tz - bz) * t + (hz / hl) * thrust,
  };
}

/**
 * 单面坡曲面（凹曲 + 檐口起翘 + 角部外挑）。
 * t = 0 檐口、t = 1 顶缘；水平线性 t，竖直 rise·t^p（p 由 ROOF_TYPES[*].curvature 推）；
 * 檐口起翘 (eaveLift + eaveRiseAtCorner)·|2v−1|^(2.4−curve) 按 (1−t)² 衰减；角部水平外挑 eaveLift·|2v−1|²。
 */
export function roofPatch(T, {
  bottomA, bottomB, topA, topB, rise, rows = 4, cols = 6, curve = 0.9, eaveLift, eaveRiseAtCorner, outward, tile = 1,
}) {
  const cfg = { bottomA, bottomB, topA, topB, rise, curve, eaveLift, eaveRiseAtCorner };
  const at = (t, v) => roofSurfacePoint(cfg, t, v);
  const positions = [];
  const uvs = [];
  const edgeLen = Math.hypot(bottomB.x - bottomA.x, bottomB.z - bottomA.z);
  const runLen = Math.hypot(topA.x - bottomA.x, topA.z - bottomA.z) || rise;

  for (let i = 0; i < rows; i += 1) {
    const t0 = i / rows;
    const t1 = (i + 1) / rows;
    for (let j = 0; j < cols; j += 1) {
      const v0 = j / cols;
      const v1 = (j + 1) / cols;
      const a = at(t0, v0);
      const b = at(t0, v1);
      const c = at(t1, v1);
      const d = at(t1, v0);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const u0 = (v0 * edgeLen) / tile;
      const u1 = (v1 * edgeLen) / tile;
      const w0 = (t0 * runLen) / tile;
      const w1 = (t1 * runLen) / tile;
      uvs.push(u0, w0, u1, w0, u1, w1);
      uvs.push(u0, w0, u1, w1, u0, w1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return orientOutward(T, g, outward);
}

/**
 * 屋面（庑殿 / 攒尖 / 硬山 / 歇山 / 重檐通用）。
 * topHalfW/topHalfD 决定顶缘：topHalfD = 0 且 topHalfW > 0 → 长正脊；两者都 0 → 攒尖顶点；都 > 0 → 腰檐围脊。
 */
export function buildRoof(T, {
  halfW, halfD, rise, roofType, curve, eaveLift, eaveRiseAtCorner, roofThickness, ridgeRatio = null,
  detail = 'near', tile = 1, grade = 2, baseY = 0, topHalfW = null, topHalfD = null, bays = 1, roofRisePerBay = 0, hipRidgeWidth = 1,
}) {
  const parts = new Parts();
  const isGable = roofType === 'gable';
  const isApex = roofType === 'pyramidal';
  const isGableHip = roofType === 'gableHip';
  const colsFor = (len) => {
    if (detail === 'far') return 2;
    if (detail === 'mid') return Math.max(4, Math.min(10, Math.round(len / 4)));
    return Math.max(6, Math.min(24, Math.round(len / 2)));
  };
  const sideCols = detail === 'far' ? 1 : detail === 'mid' ? 3 : 6;
  const rowCount = detail === 'far' ? 1 : detail === 'mid' ? 3 : 6;

  const tW = Math.max(0, topHalfW ?? (isGable ? halfW : isApex ? 0 : Math.max(halfW - halfD, halfW * 0.32)));
  const tD = Math.max(0, topHalfD ?? 0);
  const cy = baseY;
  const metrics = {
    roofType, slopes: isGable ? 2 : 4, ridge: null, apex: isApex, rise, halfW, halfD, topHalfW: tW, topHalfD: tD, rows: rowCount,
  };

  const surfaces = [];
  const patch = (bottomA, bottomB, topA, topB, outward, cols) => {
    const g = roofPatch(T, {
      bottomA: { x: bottomA[0], z: bottomA[1] },
      bottomB: { x: bottomB[0], z: bottomB[1] },
      topA: { x: topA[0], z: topA[1] },
      topB: { x: topB[0], z: topB[1] },
      rise,
      rows: rowCount,
      cols,
      curve,
      eaveLift,
      eaveRiseAtCorner,
      outward,
      tile,
    });
    translate(T, g, 0, cy, 0);
    surfaces.push(g);
  };

  patch([-halfW, -halfD], [halfW, -halfD], [-tW, -tD], [tW, -tD], { x: 0, y: 0.3, z: -1 }, colsFor(halfW * 2));
  patch([halfW, halfD], [-halfW, halfD], [tW, tD], [-tW, tD], { x: 0, y: 0.3, z: 1 }, colsFor(halfW * 2));
  if (!isGable) {
    patch([-halfW, halfD], [-halfW, -halfD], [-tW, tD], [-tW, -tD], { x: -1, y: 0.3, z: 0 }, sideCols);
    patch([halfW, -halfD], [halfW, halfD], [tW, -tD], [tW, tD], { x: 1, y: 0.3, z: 0 }, sideCols);
  }
  for (const g of surfaces) parts.add('roof', 'glazeTile', g);
  metrics.surfaceTriangles = parts.triangleCount();

  // 檐口封边（瓦口）：沿四边一圈，遮住单面壳下沿
  const fh = roofThickness;
  parts.add('eaveFascia', 'glazeRidge', box(T, { w: halfW * 2 + fh * 2, h: fh, d: fh * 2, z: -halfD, y: cy - fh, tile }));
  parts.add('eaveFascia', 'glazeRidge', box(T, { w: halfW * 2 + fh * 2, h: fh, d: fh * 2, z: halfD, y: cy - fh, tile }));
  parts.add('eaveFascia', 'glazeRidge', box(T, { w: fh * 2, h: fh, d: halfD * 2, x: -halfW, y: cy - fh, tile }));
  parts.add('eaveFascia', 'glazeRidge', box(T, { w: fh * 2, h: fh, d: halfD * 2, x: halfW, y: cy - fh, tile }));

  // 正脊（庑殿/歇山/硬山共有；攒尖顶无正脊，只有宝顶）
  const ridgeLen = tW * 2;
  const rh = Math.max(roofThickness, PROPORTIONS.ridgeSectionHeight * halfD);
  const rw = Math.max(0.2, rh * 0.7);
  if (!isApex && ridgeLen > 0.01) {
    const ridgeY = cy + rise;
    parts.add('ridge', 'glazeRidge', box(T, { w: ridgeLen + rw, h: rh, d: rw, x: 0, y: ridgeY - rh * 0.45, z: 0, tile }));
    metrics.ridge = { length: ridgeLen, y: ridgeY, halfLength: tW, sectionHeight: rh };
  }
  if (isApex) {
    const base = Math.max(0.3, rise * 0.12);
    parts.add('finial', 'giltMetal', cylinder(T, { rt: base * 0.7, rb: base, h: rise * 0.26, seg: 12, y: cy + rise - base * 0.5, tile }));
    parts.add('finial', 'giltMetal', sphere(T, { r: base * 0.9, seg: 12, rings: 8, y: cy + rise + rise * 0.2 }));
  }
  // 垂脊（戗脊）：沿屋面凹曲曲面分段贴合（避免"架空直线"穿出屋面）
  if (detail === 'near' && !isApex) {
    const thickness = Math.max(0.18, rw * hipRidgeWidth * 0.5);
    const segments = detail === 'near' ? 3 : 1;
    const lines = isGable
      ? [
        [{ x: -halfW, z: -halfD }, { x: -halfW, z: 0 }],
        [{ x: halfW, z: -halfD }, { x: halfW, z: 0 }],
        [{ x: -halfW, z: halfD }, { x: -halfW, z: 0 }],
        [{ x: halfW, z: halfD }, { x: halfW, z: 0 }],
      ]
      : [
        [{ x: -halfW, z: -halfD }, { x: -tW, z: -tD }],
        [{ x: halfW, z: -halfD }, { x: tW, z: -tD }],
        [{ x: -halfW, z: halfD }, { x: -tW, z: tD }],
        [{ x: halfW, z: halfD }, { x: tW, z: tD }],
      ];
    for (const [bottom, top] of lines) {
      const surfaceCfg = {
        bottomA: bottom,
        bottomB: bottom,
        topA: top,
        topB: top,
        rise,
        curve,
        eaveLift,
        eaveRiseAtCorner,
      };
      let prev = null;
      for (let k = 0; k <= segments; k += 1) {
        const t = k / segments;
        const point = roofSurfacePoint(surfaceCfg, t, isGable ? 0.5 : 0);
        const current = { x: point.x, y: cy + point.y + thickness * 0.35, z: point.z };
        if (prev) parts.add('hipRidge', 'glazeRidge', beam(T, { from: prev, to: current, thickness, tile }));
        prev = current;
      }
    }
  }
  // 脊兽 + 龙吻（鎏金，grade ≥ 2 且非远景）
  if (!isApex && detail !== 'far' && grade >= 2 && tW > 0.5) {
    const count = detail === 'near' && grade >= 3 ? 3 : 2;
    const size = Math.max(0.3, roofThickness * 1.1);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < count; i += 1) {
        parts.add('ridgeBeast', 'giltMetal', box(T, {
          w: size * 0.5,
          h: size * (1 - i * 0.15),
          d: size * 0.45,
          x: sx * (tW - size * 0.5 - i * size * 0.8),
          y: cy + rise + size * (i === 0 ? 0.5 : 0.15),
          tile,
        }));
      }
      parts.add('ridgeEnd', 'giltMetal', box(T, { w: size * 0.6, h: size * 2.2, d: size * 0.7, x: sx * (tW + size * 0.2), y: cy + rise - size * 0.2, tile }));
    }
  }
  // 山墙（硬山）/ 山花（歇山）：垂直三角棱柱，profile 沿 (z,y)
  if (isGable && detail !== 'far') {
    // 硬山：山墙与檐端齐平，profile 即屋架剖面
    const thickness = roofThickness * 2;
    const profile = [
      [-halfD, 0],
      [halfD, 0],
      [halfD * 0.5, rise * 0.82],
      [0, rise],
      [-halfD * 0.5, rise * 0.82],
    ];
    for (const sx of [-1, 1]) {
      parts.add('gableWall', 'plasterRed', triPrism(T, { profile, thickness, x: sx * halfW, y: cy, z: 0, tile }));
    }
  } else if (isGableHip && detail !== 'far') {
    // 歇山：山花是"脊端的小三角竖板"，底边抬到屋面之上（否则会穿出前后坡）
    const thickness = roofThickness * 1.6;
    const gx = Math.max(tW, halfW * 0.2);
    const baseY = rise * 0.42;
    const zw = Math.max(halfD * 0.12, roofThickness * 3);
    const profile = [
      [-zw, baseY],
      [zw, baseY],
      [zw * 0.55, baseY + (rise - baseY) * 0.72],
      [0, rise],
      [-zw * 0.55, baseY + (rise - baseY) * 0.72],
    ];
    for (const sx of [-1, 1]) {
      parts.add('gableWall', 'plasterRed', triPrism(T, { profile, thickness, x: sx * gx, y: cy, z: 0, tile }));
    }
    // 博风板（沿脊端两条斜边，贴在屋面上）
    const board = Math.max(0.22, roofThickness * 0.7);
    for (const sx of [-1, 1]) {
      const a = roofSurfacePoint({ bottomA: { x: sx * halfW, z: -halfD }, bottomB: { x: sx * halfW, z: -halfD }, topA: { x: sx * tW, z: -tD }, topB: { x: sx * tW, z: -tD }, rise, curve, eaveLift, eaveRiseAtCorner }, 0, 0.5);
      const b = roofSurfacePoint({ bottomA: { x: sx * halfW, z: -halfD }, bottomB: { x: sx * halfW, z: -halfD }, topA: { x: sx * tW, z: -tD }, topB: { x: sx * tW, z: -tD }, rise, curve, eaveLift, eaveRiseAtCorner }, 1, 0.5);
      parts.add('bargeBoard', 'timberLacquer', beam(T, { from: { x: a.x, y: cy + a.y + board, z: a.z }, to: { x: b.x, y: cy + b.y + board, z: b.z }, thickness: board, tile }));
    }
  }
  metrics.triangles = parts.triangleCount();
  metrics.bays = bays;
  metrics.roofRisePerBay = roofRisePerBay;
  metrics.ridgeSectionRatio = PROPORTIONS.ridgeSectionHeight;
  metrics.legacyRidgeRatio = ridgeRatio;
  return { parts, metrics };
}

/* ------------------------------------------------------------------ 屋身 */

/**
 * 屋身：柱网、墙体、门、窗、彩画额枋、斗栱、檐下。
 * 识别特征：朱红柱（plasterRed）、青绿彩画（paintingTeal）、斗栱（paintingTeal+giltMetal）、
 * 木作门窗（timberLacquer）、鎏金门钉（giltMetal）。
 *
 * 解耦约定（t22）：**门洞**只由 `door`（或工厂层的 doorOpening/openFront）决定；**屋顶形制**只由 kind + roofType 决定；
 * **窗**只由 kind（殿堂有、门殿/院门无、亭全开敞）决定；**门扇开启比例**只由 kind 决定。三者互不牵连。
 */
export function buildBody(T, {
  bodyW, bodyD, eaveTopY, baseY = 0, grade = 2, bays = 3, detail = 'near', kind = 'hall',
  columnDiameter, columnFootDiameter, bayPitch, tile = 1, door = null, windows = true, openFront = false, through = false,
}) {
  const parts = new Parts();
  const colR = columnDiameter / 2;
  const colSeg = detail === 'far' ? 4 : detail === 'mid' ? 6 : 8;
  const footR = columnFootDiameter / 2;
  const h = eaveTopY - baseY;
  const halfW = bodyW / 2;
  const halfD = bodyD / 2;
  const rows = detail === 'far' ? 1 : Math.max(1, Math.min(4, Math.round(bodyD / (bayPitch * 0.85))));
  const cols = Math.max(2, bays + 1);
  const inset = Math.min(columnDiameter * PROPORTIONS.columnInset * 0.15, Math.min(bodyW, bodyD) * 0.06);

  const colX = (i) => -halfW + inset + ((bodyW - inset * 2) * i) / (cols - 1);
  const colZ = (j) => (rows === 1 ? 0 : -halfD + inset + ((bodyD - inset * 2) * j) / (rows - 1));

  const doorWidth = door?.width ?? 0;
  const doorHeight = door?.height ?? Math.min(h * 0.8, 3.2);
  const doorHalf = doorWidth / 2;

  // 隔扇窗矩形（t33「透光窗扇」）：**同一份矩形既用于墙上开洞，也用于窗扇本身**，
  // 因此洞口与窗扇严丝合缝（外墙平面/外形不变，只在窗位形成真实几何缺口让天光进入）。
  const winFrameT = Math.max(0.15, columnDiameter * 0.28);
  const winH = Math.max(1, doorHeight * 0.92);
  const winTop = baseY + columnFootDiameter + doorHeight;
  const winRects = [];
  if (windows && detail !== 'far' && kind !== 'gateHall' && kind !== 'courtyardGate') {
    for (let b = 0; b < bays; b += 1) {
      const cx = -halfW + (bodyW * (b + 0.5)) / bays;
      if (doorHalf > 0.05 && Math.abs(cx) < doorHalf + 0.5) continue;
      winRects.push({ cx, w: bodyW / bays - winFrameT * 2, y0: winTop - winH, y1: winTop });
    }
  }

  if (detail !== 'far') {
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const x = colX(i);
        const z = colZ(j);
        // 门洞内的前檐柱跳过：判据是"有门洞"（doorHalf>0），与 kind 无关（形制解耦）
        if (j === 0 && doorHalf > 0.05 && Math.abs(x) < doorHalf) continue;
        parts.add('column', 'plasterRed', cylinder(T, { rt: colR * 0.92, rb: colR, h: h - columnFootDiameter, seg: colSeg, x, y: baseY + columnFootDiameter, z, tile, capped: false }));
        parts.add('columnFoot', 'stoneWhite', cylinder(T, { rt: footR, rb: footR, h: columnFootDiameter, seg: Math.min(colSeg, 6), x, y: baseY, z, tile, capped: false }));
      }
    }
  }

  const wallH = h * 0.72;
  const wallThick = Math.max(0.4, columnDiameter * 0.8);
  if (!openFront) {
    // 正立面：**由真实开口决定**（门洞 + 各开间隔扇窗洞），用"切点网格 + 洞"生成：
    //   - 门洞（doorWidth > 0.2）：整高缺口，净宽 = layout.door.width；
    //   - 隔扇窗洞：每个窗位在 y ∈ [窗台, 窗顶] 处留缺口（窗扇本身填在洞里，见下方 window 段）；
    //   - 无任何开口：整面一块实心墙（单块，避免 x=0 对接留下零宽缝）。
    //   外墙平面（z = −halfD + inset）与墙厚均不变 → 外立面外形不变；变的是"墙上有洞 + 窗扇透光"。
    //
    // t6（门洞两侧开口）：**同一函数**生成背面墙。`through = true` 时背面用与正面**同宽、同高**的门洞，
    //   即"门洞贯穿"（门殿/院门 = 通道口）；两侧开口由同一份切点网格代码产出 ⇒ 两面口径必然一致。
    //   背面**不切窗、不设门扇门钉**（门扇只在正面），也不动屋顶/额枋/斗栱（开口只在墙带内）。
    const xMin = -halfW + inset;
    const xMax = halfW - inset;
    const yMin = baseY;
    const yMax = baseY + wallH;
    const eps = 1e-3;
    const frontOpenings = [];
    if (doorWidth > 0.2) frontOpenings.push({ x0: -doorHalf, x1: doorHalf, y0: -Infinity, y1: Infinity });
    for (const rect of winRects) frontOpenings.push({ x0: rect.cx - rect.w / 2, x1: rect.cx + rect.w / 2, y0: rect.y0, y1: rect.y1 });
    const backOpenings = through && doorWidth > 0.2 ? [{ x0: -doorHalf, x1: doorHalf, y0: -Infinity, y1: Infinity }] : [];
    const facadeWall = (face, openings) => {
      // face = -1 正面（z = −halfD + inset + 墙厚/2）/ +1 背面（z = +halfD − inset − 墙厚/2）
      const zCenter = face * (halfD - inset - wallThick / 2);
      if (openings.length === 0) {
        parts.add('wall', 'plasterRed', box(T, { w: xMax - xMin, h: wallH, d: wallThick, x: (xMin + xMax) / 2, z: zCenter, y: baseY, tile, uvAnchor: true }));
        return;
      }
      const cutPoints = (lo, hi, values) => {
        const set = new Set([lo, hi]);
        for (const v of values) if (Number.isFinite(v) && v > lo + eps && v < hi - eps) set.add(v);
        return [...set].sort((a, b) => a - b);
      };
      const xs = cutPoints(xMin, xMax, openings.flatMap((o) => [o.x0, o.x1]));
      const ys = cutPoints(yMin, yMax, openings.flatMap((o) => [o.y0, o.y1]));
      for (let i = 0; i < xs.length - 1; i += 1) {
        for (let j = 0; j < ys.length - 1; j += 1) {
          const cx = (xs[i] + xs[i + 1]) / 2;
          const cy = (ys[j] + ys[j + 1]) / 2;
          const inHole = openings.some((o) => cx > o.x0 + eps && cx < o.x1 - eps && cy > o.y0 + eps && cy < o.y1 - eps);
          if (inHole) continue;
          parts.add('wall', 'plasterRed', box(T, { w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j], d: wallThick, x: cx, y: ys[j], z: zCenter, tile, uvAnchor: true }));
        }
      }
    };
    facadeWall(-1, frontOpenings);
    facadeWall(1, backOpenings);
    const sideWallD = bodyD - inset * 2;
    parts.add('wall', 'plasterRed', box(T, { w: wallThick, h: wallH, d: sideWallD, x: halfW - inset - wallThick / 2, y: baseY, tile, uvAnchor: true }));
    parts.add('wall', 'plasterRed', box(T, { w: wallThick, h: wallH, d: sideWallD, x: -halfW + inset + wallThick / 2, y: baseY, tile, uvAnchor: true }));
  }

  // 额枋彩画带（青绿彩画）+ 鎏金线
  const bandH = Math.max(0.35, h * PROPORTIONS.architraveBand);
  const bandY = baseY + h - bandH;
  const bandT = Math.max(0.35, columnDiameter * 0.7);
  parts.add('painting', 'paintingTeal', box(T, { w: bodyW, h: bandH, d: bandT, z: -halfD, y: bandY, tile }));
  parts.add('painting', 'paintingTeal', box(T, { w: bodyW, h: bandH, d: bandT, z: halfD, y: bandY, tile }));
  parts.add('painting', 'paintingTeal', box(T, { w: bandT, h: bandH, d: bodyD, x: -halfW, y: bandY, tile }));
  parts.add('painting', 'paintingTeal', box(T, { w: bandT, h: bandH, d: bodyD, x: halfW, y: bandY, tile }));
  parts.add('giltLine', 'giltMetal', box(T, { w: bodyW + bandT, h: bandT * 0.25, d: bandT * 1.1, z: -halfD, y: bandY - bandT * 0.3, tile }));
  parts.add('giltLine', 'giltMetal', box(T, { w: bodyW + bandT, h: bandT * 0.25, d: bandT * 1.1, z: halfD, y: bandY - bandT * 0.3, tile }));

  // 斗栱
  if (detail !== 'far' && grade >= 2) {
    const pitch = Math.max(1.2, bayPitch / 3);
    const bracketW = Math.max(0.32, columnDiameter * 0.75);
    const bracketH = Math.max(0.3, columnDiameter * 0.7);
    const nFront = Math.max(2, Math.min(detail === 'near' ? 24 : 12, Math.floor(bodyW / pitch)));
    for (let i = 0; i <= nFront; i += 1) {
      const x = -halfW + (bodyW * i) / nFront;
      for (const sz of [-1, 1]) {
        parts.add('bracket', 'paintingTeal', box(T, { w: bracketW * 1.6, h: bracketH, d: bracketW, x, z: sz * (halfD + bracketW * 0.6), y: bandY - bracketH, tile }));
        parts.add('bracketTip', 'giltMetal', box(T, { w: bracketW * 0.6, h: bracketH * 0.35, d: bracketW * 0.6, x, z: sz * (halfD + bracketW * 0.6), y: bandY - bracketH * 0.4, tile }));
      }
    }
    const nSide = Math.max(2, Math.min(detail === 'near' ? 12 : 6, Math.floor(bodyD / pitch)));
    for (let i = 0; i <= nSide; i += 1) {
      const z = -halfD + (bodyD * i) / nSide;
      for (const sx of [-1, 1]) {
        parts.add('bracket', 'paintingTeal', box(T, { w: bracketW, h: bracketH, d: bracketW * 1.6, x: sx * (halfW + bracketW * 0.6), z, y: bandY - bracketH, tile }));
      }
    }
  }

  // 檐下（斗栱层底板，深木色）
  if (detail !== 'far') {
    const soffitH = Math.max(0.2, columnDiameter * 0.5);
    parts.add('soffit', 'timberDark', box(T, { w: bodyW + columnDiameter, h: soffitH, d: bodyD + columnDiameter, y: baseY + h - soffitH * 0.5, tile }));
  }

  // 门（朱红门扇 + 鎏金门钉）；门洞保持真实连通（供第一人称走查）
  if (doorWidth > 0.2) {
    const leafT = Math.max(0.18, columnDiameter * 0.35);
    // 门扇开启比例：仍由 kind 决定（门殿/院门常开 0.72；殿堂 0.18），与"是否留门洞"无关
    const openFrac = door?.openFraction ?? (kind === 'gateHall' || kind === 'courtyardGate' ? 0.72 : 0.18);
    const leafW = doorHalf * (1 - openFrac);
    if (leafW > 0.15) {
      for (const sx of [-1, 1]) {
        parts.add('door', 'plasterRedDark', box(T, { w: leafW, h: doorHeight, d: leafT, x: sx * (doorHalf - leafW / 2), z: -halfD + inset + leafT, y: baseY + columnFootDiameter, tile }));
      }
    }
    const lintelH = Math.max(0.4, columnDiameter * 0.8);
    parts.add('doorFrame', 'timberLacquer', box(T, { w: doorWidth * 1.14, h: lintelH, d: leafT * 2, z: -halfD + inset + leafT, y: baseY + columnFootDiameter + doorHeight, tile }));
    const aboveH = h - (columnFootDiameter + doorHeight + lintelH);
    if (aboveH > 0.1) {
      parts.add('wall', 'plasterRed', box(T, { w: doorWidth * 1.14, h: aboveH, d: wallThick, z: -halfD + inset + wallThick / 2, y: baseY + columnFootDiameter + doorHeight + lintelH, tile, uvAnchor: true }));
    }
    // t6：贯穿门洞的**背面门额 + 背面门上墙**（与正面同高、同宽；背面不设门扇与门钉）。
    // 复用既有部位名（doorFrame / wall）⇒ 不新增合批桶，§8.2 分区绘制调用不变。
    if (through) {
      parts.add('doorFrame', 'timberLacquer', box(T, { w: doorWidth * 1.14, h: lintelH, d: leafT * 2, z: halfD - inset - leafT, y: baseY + columnFootDiameter + doorHeight, tile }));
      if (aboveH > 0.1) {
        parts.add('wall', 'plasterRed', box(T, { w: doorWidth * 1.14, h: aboveH, d: wallThick, z: halfD - inset - wallThick / 2, y: baseY + columnFootDiameter + doorHeight + lintelH, tile, uvAnchor: true }));
      }
    }
    if (detail === 'near' && grade >= 2 && leafW > 0.15) {
      const studR = Math.max(0.07, columnDiameter * 0.1);
      const nx = 3;
      const ny = grade >= 3 ? 4 : 3;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < nx; i += 1) {
          for (let j = 0; j < ny; j += 1) {
            parts.add('doorStud', 'giltMetal', sphere(T, {
              r: studR,
              seg: 5,
              rings: 3,
              x: sx * (doorHalf - leafW * (0.3 + (0.45 * i) / Math.max(1, nx - 1))),
              y: baseY + columnFootDiameter + doorHeight * (0.2 + (0.6 * j) / Math.max(1, ny - 1)),
              z: -halfD + inset + leafT * 1.6,
            }));
          }
        }
      }
    }
  }

  // 隔扇窗（木作棂条窗）：**只由 kind 决定**（殿堂有、门殿/院门无、亭开敞）；窗顶与门顶同高线。
  // t33：窗扇矩形与墙上的窗洞**同一份数据**（winRects），因此窗扇正好嵌在洞口里；
  //      窗扇按"裱纸/棂条窗"处理为**透光**（不投影，见 buildings.js 的 NON_CASTING_PARTS），
  //      天光即可穿过窗洞进入室内 —— 这不是自发光贴片，而是几何开口 + 透光遮蔽口径。
  if (winRects.length > 0) {
    for (const rect of winRects) {
      parts.add('window', 'timberLacquer', box(T, { w: rect.w, h: rect.y1 - rect.y0, d: winFrameT, x: rect.cx, z: -halfD + inset + winFrameT, y: rect.y0, tile }));
    }
  }

  const dims = { bodyW, bodyD, h, rows, cols, inset, doorWidth, doorHeight, bandH, bandY, wallThick };
  parts.dims.body = dims;
  return { parts, dims };
}

/* ------------------------------------------------------------------ 台基 / 栏杆 / 台阶 */

/** 台基（单层台明；footprint 已含台明。多层台基由 kit.terrace 负责）。 */
export function buildPlinth(T, { w, d, terraceH, baseY = 0, tile = 1, cap = true }) {
  const parts = new Parts();
  if (terraceH <= 0.001) return { parts, dims: { w, d, terraceH, capH: 0 } };
  const capH = Math.max(0.08, terraceH * PROPORTIONS.terraceCapThickness);
  parts.add('terrace', 'stoneWhite', box(T, { w, h: terraceH - capH, d, y: baseY, tile }));
  if (cap) parts.add('terraceCap', 'stoneWhiteShade', box(T, { w: w + capH * 0.6, h: capH, d: d + capH * 0.6, y: baseY + terraceH - capH, tile }));
  return { parts, dims: { w, d, terraceH, capH } };
}

/**
 * 白石栏杆（望柱 + 栏板），沿矩形周边，正面可留缺口。
 * 高 = MODULES.stairsStepHeight × PROPORTIONS.railingHeightSteps。
 */
export function buildRailing(T, {
  w, d, baseY = 0, height, tile = 1, detail = 'near', gapFront = 0, postPitch = null, material = 'stoneWhite',
}) {
  const parts = new Parts();
  const railH = height;
  const post = Math.max(0.16, railH * 0.42);
  const pitch = postPitch ?? Math.max(2.2, railH * 7);
  const addRun = (length, place, skip) => {
    const n = Math.max(1, Math.round(length / pitch));
    for (let i = 0; i <= n; i += 1) {
      const t = -length / 2 + (length * i) / n;
      if (skip && skip(t)) continue;
      parts.add('railing', material, place(t, true));
    }
    if (detail === 'far') return;
    for (let i = 0; i < n; i += 1) {
      const t = -length / 2 + (length * (i + 0.5)) / n;
      if (skip && skip(t)) continue;
      parts.add('railingPanel', material, place(t, false, length / n));
    }
  };
  for (const sz of [-1, 1]) {
    addRun(
      w,
      (t, isPost, seg) =>
        isPost
          ? box(T, { w: post * 0.8, h: railH, d: post * 0.8, x: t, z: sz * (d / 2), y: baseY, tile })
          : box(T, { w: seg - post, h: railH * 0.62, d: post * 0.5, x: t, z: sz * (d / 2), y: baseY + railH * 0.18, tile }),
      sz === -1 && gapFront > 0 ? (t) => Math.abs(t) < gapFront / 2 : null,
    );
  }
  for (const sx of [-1, 1]) {
    addRun(
      d,
      (t, isPost, seg) =>
        isPost
          ? box(T, { w: post * 0.8, h: railH, d: post * 0.8, x: sx * (w / 2), z: t, y: baseY, tile })
          : box(T, { w: post * 0.5, h: railH * 0.62, d: seg - post, x: sx * (w / 2), z: t, y: baseY + railH * 0.18, tile }),
      null,
    );
  }
  const dims = { w, d, railH, post, pitch, gapFront };
  parts.dims.railing = dims;
  return { parts, dims };
}

/**
 * 台阶（含休息平台与丹陛）。单级高/深取 config.MODULES.stairsStepHeight/stairsStepDepth。
 * 几何沿本地 -Z 向下降（前端 z = 0，向上收到 z = -run）。
 */
export function buildStairs(T, {
  width, rise, stepHeight, stepDepth, maxRun, tile = 1, baseY = 0, imperialRamp = false, rampWidth = null,
}) {
  const parts = new Parts();
  if (rise <= 0.01) return { parts, dims: { steps: 0, run: 0 } };
  const totalSteps = Math.max(1, Math.round(rise / stepHeight));
  const actualStep = rise / totalSteps;
  const maxStepsPerRun = Math.max(2, Math.floor(maxRun / stepDepth));
  const runCount = Math.max(1, Math.ceil(totalSteps / maxStepsPerRun));
  const stepsPerRun = Math.ceil(totalSteps / runCount);
  const landingDepth = stepDepth * PROPORTIONS.stairLandingDepth;

  let z = 0;
  let done = 0;
  for (let r = 0; r < runCount; r += 1) {
    const n = Math.min(stepsPerRun, totalSteps - done);
    for (let i = 0; i < n; i += 1) {
      // 踏面高度：贴台明一侧最高（y = rise），向远端逐级降到 actualStep（最后一级离地一级高），
      // 与同函数的丹陛御路（+Z 高端贴台明）方向一致。
      const y1 = Math.max(actualStep, rise - (done + i) * actualStep);
      parts.add('stairs', 'stoneWhite', box(T, { w: width, h: y1, d: stepDepth, x: 0, z: z - i * stepDepth - stepDepth / 2, y: baseY, tile }));
    }
    z -= n * stepDepth;
    done += n;
    if (r < runCount - 1) {
      const landingH = Math.max(actualStep, rise - done * actualStep);
      parts.add('stairs', 'stoneWhite', box(T, { w: width, h: landingH, d: landingDepth, x: 0, z: z - landingDepth / 2, y: baseY, tile }));
      z -= landingDepth;
    }
  }
  const run = Math.abs(z);
  if (imperialRamp) {
    // 丹陛（御路）：中央斜坡板，沿坡向旋转
    const rw = rampWidth ?? width * 0.32;
    const angle = Math.atan2(rise, run);
    const len = Math.hypot(rise, run);
    const g = box(T, { w: rw, h: Math.max(0.12, rise * 0.06), d: len, x: 0, y: 0, z: 0, tile });
    g.applyMatrix4(_m4.makeRotationX(-angle));
    translate(T, g, 0, baseY + rise / 2, z / 2);
    parts.add('imperialRamp', 'stoneWhiteShade', g);
  }
  const dims = { width, rise, steps: totalSteps, stepHeight: actualStep, stepDepth, runCount, stepsPerRun, run, landingDepth };
  parts.dims.stairs = dims;
  return { parts, dims };
}

/** 平铺面（广场/道路/水面/地坪）。 */
export function buildSlab(T, { w, d, h = 0.02, x = 0, y = 0, z = 0, tile = 1 }) {
  return box(T, { w, h, d, x, y, z, tile });
}

export { mergeGeometries };
