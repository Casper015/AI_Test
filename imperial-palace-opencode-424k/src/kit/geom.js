/**
 * 紫禁天朝 · 几何基元（A 资源与建筑库）
 * 所有构件返回可直接合并的 BufferGeometry，UV 以世界米为单位保证全城贴图密度一致。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TILE = 6;

export function boxGeo(w, h, d, tile, ox, oy, oz) {
  const t = tile || TILE;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const px = ox || 0, py = oy || 0, pz = oz || 0;
  const faces = [
    { n: [1, 0, 0], c: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], c: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], c: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], c: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    { n: [0, 0, 1], c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] }
  ];
  const pos = [], nor = [], uv = [];
  for (const f of faces) {
    const c = f.c;
    const order = [0, 1, 2, 0, 2, 3];
    const du = [0, 0], dv = [0, 0];
    for (const i of order) {
      const v = c[i];
      pos.push(v[0] + px, v[1] + py, v[2] + pz);
      nor.push(f.n[0], f.n[1], f.n[2]);
    }
    const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]];
    const e2 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]];
    const su = Math.hypot(e1[0], e1[1], e1[2]) / t;
    const sv = Math.hypot(e2[0], e2[1], e2[2]) / t;
    const uvs = [[0, 0], [su, 0], [su, sv], [0, sv]];
    for (const i of order) uv.push(uvs[i][0], uvs[i][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function cylGeo(rTop, rBot, h, seg, tile, ox, oy, oz, open) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg || 10, 1, !!open);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (2 * Math.PI * rBot / (tile || TILE)), uv.getY(i) * h / (tile || TILE));
  }
  g.translate(ox || 0, oy || 0, oz || 0);
  return g;
}

export function coneGeo(r, h, seg, tile, ox, oy, oz) {
  const g = new THREE.ConeGeometry(r, h, seg || 8, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h / (tile || TILE));
  g.translate(ox || 0, oy || 0, oz || 0);
  return g;
}

export function sphereGeo(r, seg, tile, ox, oy, oz, sy) {
  const g = new THREE.SphereGeometry(r, seg || 8, (seg || 8) / 2 | 0);
  g.translate(ox || 0, oy || 0, oz || 0);
  if (sy) g.scale(1, sy, 1);
  return g;
}

export function icoGeo(r, detail, seed, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(r, detail === undefined ? 0 : detail);
  const p = g.attributes.position;
  let a = (seed || 1) >>> 0;
  const rand = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < p.count; i++) {
    const k = 0.72 + rand() * 0.56;
    p.setXYZ(i, p.getX(i) * k * (sx || 1), p.getY(i) * k * (sy || 1), p.getZ(i) * k * (sz || 1));
  }
  g.computeVertexNormals();
  return g;
}

export function quadStrip(topPts, botPts, uvTop, uvBot) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < topPts.length - 1; i++) {
    const a = topPts[i], b = topPts[i + 1], c = botPts[i + 1], d = botPts[i];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    for (let k = 0; k < 6; k++) nor.push(0, 1, 0);
    if (uvTop && uvBot) {
      const ta = uvTop[i], tb = uvTop[i + 1], bb = uvBot[i + 1], ba = uvBot[i];
      uv.push(ta[0], ta[1], tb[0], tb[1], bb[0], bb[1]);
      uv.push(ta[0], ta[1], bb[0], bb[1], ba[0], ba[1]);
    } else {
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function merge(list) {
  const clean = list.filter(Boolean).map(g => (g.index ? g.toNonIndexed() : g));
  if (!clean.length) return null;
  if (clean.length === 1) return clean[0];
  const out = mergeGeometries(clean, false);
  for (const g of clean) g.dispose();
  return out;
}

export function at(geo, x, y, z, rotY) {
  if (rotY) geo.rotateY(rotY);
  geo.translate(x || 0, y || 0, z || 0);
  return geo;
}

export function scaleGeo(geo, sx, sy, sz) {
  geo.scale(sx, sy, sz);
  return geo;
}
