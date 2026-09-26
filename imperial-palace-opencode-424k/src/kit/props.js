/**
 * 紫禁天朝 · 摆件与地被（A 资源与建筑库）
 * 树木、山石、陈设、宫灯、桥面、路面与水面几何。
 */

import * as THREE from 'three';
import { boxGeo, cylGeo, coneGeo, icoGeo, merge, TILE } from './geom.js';

export function treeParts(kind, variant) {
  const s = [1, 0.86, 1.14][variant % 3];
  const trunk = [];
  const foliage = [];
  const blossom = [];
  if (kind === 'blossom') {
    trunk.push(cylGeo(0.24 * s, 0.34 * s, 2.8 * s, 7, 2.4, 0, 1.4 * s, 0));
    trunk.push(cylGeo(0.12 * s, 0.16 * s, 1.6 * s, 6, 2.4, 0.5 * s, 3.3 * s, 0.3 * s));
    blossom.push(new THREE.IcosahedronGeometry(2.3 * s, 1).translate(0, 4.6 * s, 0));
    blossom.push(new THREE.IcosahedronGeometry(1.7 * s, 1).translate(1.5 * s, 3.9 * s, 0.6 * s));
    blossom.push(new THREE.IcosahedronGeometry(1.5 * s, 1).translate(-1.3 * s, 4.2 * s, -0.7 * s));
    blossom.push(new THREE.IcosahedronGeometry(1.3 * s, 1).translate(0.2 * s, 6.0 * s, -0.4 * s));
  } else {
    trunk.push(cylGeo(0.26 * s, 0.4 * s, 2.4 * s, 7, 2.4, 0, 1.2 * s, 0));
    foliage.push(coneGeo(2.9 * s, 3.4 * s, 9, 2.4, 0, 3.0 * s, 0));
    foliage.push(coneGeo(2.3 * s, 2.9 * s, 9, 2.4, 0, 4.9 * s, 0));
    foliage.push(coneGeo(1.6 * s, 2.4 * s, 9, 2.4, 0, 6.6 * s, 0));
    foliage.push(coneGeo(0.9 * s, 1.6 * s, 8, 2.4, 0, 8.1 * s, 0));
    if (kind === 'pineB') {
      foliage.length = 0;
      foliage.push(coneGeo(2.2 * s, 5.6 * s, 9, 2.4, 0, 4.0 * s, 0));
      foliage.push(coneGeo(1.5 * s, 3.6 * s, 8, 2.4, 0, 7.0 * s, 0));
    }
  }
  return {
    trunk: merge(trunk),
    foliage: merge(foliage),
    blossom: merge(blossom) || null
  };
}

export function rockParts(seed, r, h) {
  const g = icoGeo(r, 1, seed, 1, Math.max(0.5, h / r), 1);
  const g2 = icoGeo(r * 0.62, 0, seed * 3 + 7, 1, Math.max(0.5, h / r * 0.9), 1);
  g2.translate(r * 0.7, -h * 0.14, r * 0.3);
  return merge([g, g2]);
}

export function monumentParts(kind, h, r) {
  const marble = [];
  const bronze = [];
  if (kind === 'huabiao') {
    marble.push(boxGeo(r * 2.2, 0.5, r * 2.2, 2, 0, 0.25, 0));
    marble.push(cylGeo(r * 0.5, r * 0.62, h - 1.6, 8, 2.4, 0, (h - 1.6) / 2 + 0.5, 0));
    marble.push(boxGeo(r * 2.6, 0.22, r * 1.2, 2, 0, h - 2.0, 0));
    marble.push(boxGeo(r * 1.2, 0.22, r * 2.6, 2, 0, h - 2.0, 0));
    bronze.push(boxGeo(r * 0.9, 0.5, r * 0.9, 2, 0, h - 1.1, 0));
    bronze.push(cylGeo(r * 0.42, r * 0.42, r * 0.9, 8, 1.6, 0, h - 0.45, 0));
    bronze.push(new THREE.SphereGeometry(r * 0.3, 8, 6).translate(0, h + 0.1, 0));
  } else if (kind === 'lion') {
    marble.push(boxGeo(r * 2.4, r * 1.3, r * 2.4, 2, 0, r * 0.65, 0));
    bronze.push(boxGeo(r * 1.1, r * 0.5, r * 1.7, 2, 0, r * 1.55, 0));
    bronze.push(boxGeo(r * 0.9, r * 1.0, r * 0.9, 2, 0, r * 2.2, -r * 0.35));
    bronze.push(new THREE.SphereGeometry(r * 0.5, 8, 6).translate(0, r * 2.95, -r * 0.4));
    bronze.push(new THREE.SphereGeometry(r * 0.24, 6, 5).translate(r * 0.34, r * 3.3, -r * 0.4));
    bronze.push(new THREE.SphereGeometry(r * 0.24, 6, 5).translate(-r * 0.34, r * 3.3, -r * 0.4));
  } else if (kind === 'ding') {
    marble.push(boxGeo(r * 2.0, r * 0.5, r * 2.0, 2, 0, r * 0.25, 0));
    bronze.push(cylGeo(r * 0.9, r * 0.7, h * 0.55, 10, 2, 0, h * 0.5, 0));
    bronze.push(cylGeo(r * 0.95, r * 0.9, r * 0.2, 10, 2, 0, h * 0.8, 0));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      bronze.push(cylGeo(r * 0.12, r * 0.14, h * 0.4, 6, 1.4, Math.cos(a) * r * 0.55, h * 0.2, Math.sin(a) * r * 0.55));
    }
    bronze.push(boxGeo(r * 0.3, r * 0.6, r * 0.3, 1.4, -r * 0.8, h * 0.95, 0));
    bronze.push(boxGeo(r * 0.3, r * 0.6, r * 0.3, 1.4, r * 0.8, h * 0.95, 0));
  } else if (kind === 'sundial') {
    marble.push(boxGeo(r * 2.0, r * 0.6, r * 1.4, 2, 0, r * 0.3, 0));
    marble.push(boxGeo(r * 1.4, r * 0.3, r * 1.0, 2, 0, r * 0.75, 0));
    const disc = cylGeo(r * 0.8, r * 0.8, 0.14, 12, 1.6, 0, 0, 0);
    disc.rotateX(0.42);
    disc.translate(0, r * 1.1, 0);
    bronze.push(disc);
    bronze.push(cylGeo(0.05, 0.05, r * 1.5, 5, 1, 0, r * 1.2, 0));
  } else if (kind === 'jiadian') {
    marble.push(boxGeo(r * 1.8, r * 0.5, r * 1.2, 2, 0, r * 0.25, 0));
    bronze.push(boxGeo(r * 1.0, r * 0.8, r * 0.7, 2, 0, r * 0.9, 0));
    bronze.push(boxGeo(r * 1.15, r * 0.12, r * 0.85, 2, 0, r * 1.36, 0));
  } else if (kind === 'gui') {
    marble.push(boxGeo(r * 2.2, r * 0.5, r * 1.6, 2, 0, r * 0.25, 0));
    const body = new THREE.SphereGeometry(r * 0.8, 10, 7);
    body.scale(1.15, 0.7, 1);
    body.translate(0, r * 0.85, 0);
    bronze.push(body);
    bronze.push(cylGeo(r * 0.16, r * 0.2, r * 0.8, 7, 1.4, r * 0.85, r * 0.95, 0));
  } else {
    marble.push(boxGeo(r * 2.2, r * 0.5, r * 1.6, 2, 0, r * 0.25, 0));
    const body = new THREE.SphereGeometry(r * 0.56, 10, 7);
    body.scale(0.9, 1.25, 0.9);
    body.translate(0, r * 1.35, 0);
    bronze.push(body);
    bronze.push(cylGeo(0.07, 0.1, r * 1.3, 6, 1, 0, r * 2.2, 0));
    bronze.push(new THREE.SphereGeometry(r * 0.16, 6, 5).translate(0, r * 2.95, 0));
  }
  return { marble: merge(marble), bronze: merge(bronze) };
}

export function lanternParts(kind, scale) {
  const s = scale || 1;
  const post = [];
  const body = [];
  const glow = [];
  if (kind === 'terrace') {
    body.push(cylGeo(0.34 * s, 0.28 * s, 0.62 * s, 8, 1.6, 0, 0.7 * s, 0));
    glow.push(cylGeo(0.3 * s, 0.3 * s, 0.5 * s, 8, 1.6, 0, 0.7 * s, 0));
    post.push(boxGeo(0.7 * s, 0.4 * s, 0.7 * s, 1.6, 0, 0.2 * s, 0));
  } else if (kind === 'garden') {
    post.push(cylGeo(0.16 * s, 0.22 * s, 2.6 * s, 7, 1.8, 0, 1.3 * s, 0));
    post.push(boxGeo(0.34 * s, 0.16 * s, 1.5 * s, 1.6, 0, 2.62 * s, 0));
    body.push(cylGeo(0.36 * s, 0.3 * s, 0.7 * s, 8, 1.6, 0, 2.1 * s, 0));
    glow.push(cylGeo(0.3 * s, 0.3 * s, 0.56 * s, 8, 1.6, 0, 2.1 * s, 0));
    body.push(coneGeo(0.34 * s, 0.3 * s, 8, 1.6, 0, 2.6 * s, 0));
  } else {
    post.push(cylGeo(0.18 * s, 0.24 * s, 4.2 * s, 8, 1.8, 0, 2.1 * s, 0));
    post.push(boxGeo(0.36 * s, 0.18 * s, 2.0 * s, 1.6, 0, 4.24 * s, 0));
    post.push(boxGeo(0.18 * s, 0.3 * s, 0.18 * s, 1.4, -0.9 * s, 4.0 * s, 0));
    post.push(boxGeo(0.18 * s, 0.3 * s, 0.18 * s, 1.4, 0.9 * s, 4.0 * s, 0));
    body.push(cylGeo(0.44 * s, 0.38 * s, 0.9 * s, 10, 1.8, -0.9 * s, 3.4 * s, 0));
    body.push(cylGeo(0.44 * s, 0.38 * s, 0.9 * s, 10, 1.8, 0.9 * s, 3.4 * s, 0));
    body.push(coneGeo(0.42 * s, 0.3 * s, 10, 1.8, -0.9 * s, 3.95 * s, 0));
    body.push(coneGeo(0.42 * s, 0.3 * s, 10, 1.8, 0.9 * s, 3.95 * s, 0));
    glow.push(cylGeo(0.36 * s, 0.32 * s, 0.8 * s, 10, 1.8, -0.9 * s, 3.4 * s, 0));
    glow.push(cylGeo(0.36 * s, 0.32 * s, 0.8 * s, 10, 1.8, 0.9 * s, 3.4 * s, 0));
  }
  return { post: merge(post), body: merge(body), glow: merge(glow) };
}

export function planeGeo(w, d, tile, x, y, z, rotY) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / (tile || 6), uv.getY(i) * d / (tile || 6));
  g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

export function slabGeo(w, d, y, thick, tile, x, z) {
  return boxGeo(w, thick || 0.08, d, tile || 2.4, x || 0, y - (thick || 0.08) / 2, z || 0);
}

export function terrainGeo(w, d, y, tile, x, z) {
  return planeGeo(w, d, tile || 40, x || 0, y, z || 0);
}
