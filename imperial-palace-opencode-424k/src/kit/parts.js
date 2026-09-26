/**
 * 紫禁天朝 · 建筑构件（A 资源与建筑库 · style-baseline-v1）
 * 形制统一：金瓦、朱柱、青绿彩画、白石台基、飞檐翘角。
 */

import * as THREE from 'three';
import { boxGeo, cylGeo, coneGeo, icoGeo, quadStrip, merge, at, TILE } from './geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function eaveCurve(a, b, corner, n, lift) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    const edge = corner ? Math.min(t, 1 - t) * 2 : 1;
    pts.push(V(x, y + lift * Math.pow(1 - edge, 2.4), z));
  }
  return pts;
}

export function hipRoof(o) {
  const w = o.w, d = o.d, h = o.h, lift = o.lift === undefined ? 0.5 : o.lift;
  const thick = o.thick === undefined ? 0.42 : o.thick;
  const rx = Math.max(0, (o.ridgeHalf === undefined ? Math.max(0, (w - d) * 0.5) : o.ridgeHalf));
  const tile = o.tile || 6;
  const n = o.seg || 6;
  const loop = [];
  const c1 = V(-w / 2, 0, -d / 2), c2 = V(w / 2, 0, -d / 2), c3 = V(w / 2, 0, d / 2), c4 = V(-w / 2, 0, d / 2);
  loop.push(...eaveCurve(c1, c2, true, n, lift));
  loop.push(...eaveCurve(c2, c3, true, n, lift).slice(1));
  loop.push(...eaveCurve(c3, c4, true, n, lift).slice(1));
  loop.push(...eaveCurve(c4, c1, true, n, lift).slice(1));
  const top = loop.map(p => V(Math.max(-rx, Math.min(rx, p.x)), h, 0));
  const loopLow = loop.map(p => V(p.x, p.y - thick, p.z));
  const topLow = top.map(p => V(p.x, p.y, p.z));
  const arc = [0];
  for (let i = 1; i < loop.length; i++) arc.push(arc[i - 1] + loop[i].distanceTo(loop[i - 1]));
  const total = arc[arc.length - 1] + loop[0].distanceTo(loop[loop.length - 1]);
  const t = o.tile || 6;
  const uvBot = loop.map((p, i) => [arc[i] / t, p.distanceTo(top[i]) / t]);
  const uvTop = loop.map((p, i) => [arc[i] / t, 0]);
  const uvBotLow = loop.map((p, i) => [arc[i] / t, thick / t]);
  const uvTopLow = loop.map((p, i) => [arc[i] / t, p.distanceTo(top[i]) / t + thick / t]);
  const areas = [];
  areas.push(quadStrip(top, loop, uvTop, uvBot));
  areas.push(quadStrip(loopLow, topLow, uvBotLow, uvTopLow));
  const fasciaTop = loop.concat([loop[0]]);
  const fasciaBot = loopLow.concat([loopLow[0]]);
  const uvFasTop = loop.map((p, i) => [arc[i] / t, 0]).concat([[total / t, 0]]);
  const uvFasBot = loop.map((p, i) => [arc[i] / t, thick / t]).concat([[total / t, thick / t]]);
  areas.push(quadStrip(fasciaTop, fasciaBot, uvFasTop, uvFasBot));
  const g = merge(areas);
  g.rotateY(o.rot || 0);
  return g;
}

export function skirtRoof(o) {
  const w = o.w, d = o.d, h = o.h;
  const iw = o.innerW, id = o.innerD;
  const lift = o.lift === undefined ? 0.35 : o.lift;
  const thick = o.thick === undefined ? 0.36 : o.thick;
  const n = o.seg || 5;
  const slabs = [];
  const t = o.tile || 6;
  function slab(oa, ob, ia, ib) {
    const outer = eaveCurve(oa, ob, true, n, lift);
    const inner = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      inner.push(V(ia.x + (ib.x - ia.x) * k, h, ia.z + (ib.z - ia.z) * k));
    }
    const outerLow = outer.map(p => V(p.x, p.y - thick, p.z));
    const innerLow = inner.map(p => V(p.x, p.y, p.z));
    const arc = [0];
    for (let i = 1; i < outer.length; i++) arc.push(arc[i - 1] + outer[i].distanceTo(outer[i - 1]));
    const uvOut = outer.map((p, i) => [arc[i] / t, p.distanceTo(inner[i]) / t]);
    const uvIn = outer.map((p, i) => [arc[i] / t, 0]);
    const uvOutLow = outer.map((p, i) => [arc[i] / t, p.distanceTo(inner[i]) / t + thick / t]);
    const uvInLow = outer.map((p, i) => [arc[i] / t, thick / t]);
    slabs.push(quadStrip(inner, outer, uvIn, uvOut));
    slabs.push(quadStrip(outerLow, innerLow, uvOutLow, uvInLow));
    const ft = outer.concat([outer[0]]), fb = outerLow.concat([outerLow[0]]);
    const total = arc[arc.length - 1] + outer[0].distanceTo(outer[outer.length - 1]);
    slabs.push(quadStrip(ft, fb, outer.map((p, i) => [arc[i] / t, 0]).concat([[total / t, 0]]), outer.map((p, i) => [arc[i] / t, thick / t]).concat([[total / t, thick / t]])));
  }
  slab(V(-w / 2, 0, -d / 2), V(w / 2, 0, -d / 2), V(-iw / 2, 0, -id / 2), V(iw / 2, 0, -id / 2));
  slab(V(w / 2, 0, d / 2), V(-w / 2, 0, d / 2), V(iw / 2, 0, id / 2), V(-iw / 2, 0, id / 2));
  slab(V(w / 2, 0, -d / 2), V(w / 2, 0, d / 2), V(iw / 2, 0, -id / 2), V(iw / 2, 0, id / 2));
  slab(V(-w / 2, 0, d / 2), V(-w / 2, 0, -d / 2), V(-iw / 2, 0, id / 2), V(-iw / 2, 0, -id / 2));
  return merge(slabs);
}

export function ridgeBeams(o) {
  const w = o.w, d = o.d, h = o.h, lift = o.lift === undefined ? 0.5 : o.lift;
  const rx = Math.max(0.3, (o.ridgeHalf === undefined ? Math.max(0, (w - d) * 0.5) : o.ridgeHalf));
  const g = [];
  g.push(boxGeo(rx * 2 + 1.4, 0.5, 0.62, TILE, 0, h + 0.22, 0));
  g.push(boxGeo(0.5, 0.62, 0.5, TILE, -rx - 0.65, h + 0.72, 0));
  g.push(boxGeo(0.5, 0.62, 0.5, TILE, rx + 0.65, h + 0.72, 0));
  g.push(coneGeo(0.45, 1.0, 6, TILE, -rx - 0.65, h + 1.4, 0));
  g.push(coneGeo(0.45, 1.0, 6, TILE, rx + 0.65, h + 1.4, 0));
  const hips = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const s of hips) {
    const x0 = s[0] * w / 2, z0 = s[1] * d / 2;
    const x1 = s[0] * rx, z1 = 0;
    const dx = x1 - x0, dz = z1 - z0, dy = h + 0.2 - lift * 0.5;
    const len = Math.hypot(dx, dz, dy);
    const bar = boxGeo(len, 0.34, 0.42, TILE, 0, 0, 0);
    const yy = Math.atan2(-dy, Math.hypot(dx, dz));
    const zz = Math.atan2(-dz, dx);
    bar.rotateZ(yy);
    bar.rotateY(zz);
    bar.translate((x0 + x1) / 2, (lift * 0.5 + h + 0.2) / 2 + 0.1, (z0 + z1) / 2);
    g.push(bar);
    g.push(boxGeo(0.42, 0.5, 0.42, TILE, x0, lift * 1.05 + 0.3, z0));
  }
  return merge(g);
}

export function gableRoof(o) {
  const w = o.w, d = o.d, h = o.h;
  const lift = o.lift === undefined ? 0.3 : o.lift;
  const thick = o.thick === undefined ? 0.36 : o.thick;
  const n = o.seg || 5;
  const slabs = [];
  const zDir = o.ridgeAxis === 'x' ? true : false;
  const t = o.tile || 6;
  function pair(oa, ob, ia, ib) {
    const outer = eaveCurve(oa, ob, true, n, lift);
    const inner = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      inner.push(V(ia.x + (ib.x - ia.x) * k, h, ia.z + (ib.z - ia.z) * k));
    }
    const outerLow = outer.map(p => V(p.x, p.y - thick, p.z));
    const innerLow = inner.map(p => V(p.x, p.y, p.z));
    const arc = [0];
    for (let i = 1; i < outer.length; i++) arc.push(arc[i - 1] + outer[i].distanceTo(outer[i - 1]));
    slabs.push(quadStrip(inner, outer, outer.map((p, i) => [arc[i] / t, 0]), outer.map((p, i) => [arc[i] / t, p.distanceTo(inner[i]) / t])));
    slabs.push(quadStrip(outerLow, innerLow, outer.map((p, i) => [arc[i] / t, p.distanceTo(inner[i]) / t + thick / t]), outer.map((p, i) => [arc[i] / t, thick / t])));
    const total = arc[arc.length - 1] + outer[0].distanceTo(outer[outer.length - 1]);
    slabs.push(quadStrip(outer.concat([outer[0]]), outerLow.concat([outerLow[0]]), outer.map((p, i) => [arc[i] / t, 0]).concat([[total / t, 0]]), outer.map((p, i) => [arc[i] / t, thick / t]).concat([[total / t, thick / t]])));
  }
  if (zDir) {
    pair(V(-w / 2, 0, -d / 2), V(w / 2, 0, -d / 2), V(-w / 2, 0, 0), V(w / 2, 0, 0));
    pair(V(w / 2, 0, d / 2), V(-w / 2, 0, d / 2), V(w / 2, 0, 0), V(-w / 2, 0, 0));
  } else {
    pair(V(-w / 2, 0, d / 2), V(-w / 2, 0, -d / 2), V(0, 0, d / 2), V(0, 0, -d / 2));
    pair(V(w / 2, 0, -d / 2), V(w / 2, 0, d / 2), V(0, 0, -d / 2), V(0, 0, d / 2));
  }
  return merge(slabs);
}

export function gableEnds(o) {
  const w = o.w, d = o.d, h = o.h;
  const t = 0.4;
  const g = [];
  const tri = (ax, az, bx, bz, cx2, cz2) => {
    const pos = [ax, 0, az, bx, 0, bz, cx2, h, cz2];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / 6, 0, w / 12, h / 6], 2));
    geo.computeVertexNormals();
    return geo;
  };
  if (o.ridgeAxis === 'x') {
    g.push(boxGeo(t, h * 0.5, d, 2, -w / 2 + t / 2, h * 0.25, 0));
    g.push(boxGeo(t, h * 0.5, d, 2, w / 2 - t / 2, h * 0.25, 0));
  } else {
    g.push(boxGeo(w, h * 0.5, t, 2, 0, h * 0.25, -d / 2 + t / 2));
    g.push(boxGeo(w, h * 0.5, t, 2, 0, h * 0.25, d / 2 - t / 2));
  }
  return merge(g);
}

export function finial(h, tile) {
  return merge([
    boxGeo(1.5, 0.3, 1.5, tile || TILE, 0, h, 0),
    cylGeo(0.34, 0.5, 0.9, 8, tile || TILE, 0, h + 0.6, 0),
    sphereGeoLocal(0.62, h + 1.5),
    coneGeo(0.3, 0.9, 6, tile || TILE, 0, h + 2.5, 0)
  ]);
}

function sphereGeoLocal(r, y) {
  const g = new THREE.SphereGeometry(r, 10, 6);
  g.translate(0, y, 0);
  return g;
}

export function hallBody(o) {
  const w = o.w, d = o.d, h = o.wallH, bays = o.bays || 5;
  const t = 0.7;
  const doorW = o.doorW === undefined ? 8 : o.doorW;
  const parts = { wall: [], col: [], paint: [], bracket: [], door: [], lattice: [] };
  parts.wall.push(boxGeo(w, h, t, TILE, 0, h / 2, -d / 2 + t / 2));
  if (o.backDoor) {
    const bw = o.backDoor;
    const bside = (w - bw) / 2;
    parts.wall.push(boxGeo(bside, h, t + 0.1, TILE, -(bw / 2 + bside / 2), h / 2, d / 2 - t / 2));
    parts.wall.push(boxGeo(bside, h, t + 0.1, TILE, bw / 2 + bside / 2, h / 2, d / 2 - t / 2));
    parts.wall.push(boxGeo(bw, 0.9, t + 0.1, TILE, 0, h - 0.45, d / 2 - t / 2));
    const leafW = Math.min(2.6, bw * 0.26);
    for (const sx of [-1, 1]) {
      parts.door.push(boxGeo(leafW, h - 1.4, 0.2, 2.4, sx * (bw / 2 - leafW / 2), (h - 1.4) / 2, d / 2 - t - 0.06));
      parts.door.push(boxGeo(leafW, h - 1.4, 0.2, 2.4, sx * (bw / 2 - leafW / 2), (h - 1.4) / 2, d / 2 + 0.02));
    }
  } else {
    parts.wall.push(boxGeo(w, h, t, TILE, 0, h / 2, d / 2 - t / 2));
  }
  parts.wall.push(boxGeo(t, h, d - t * 2, TILE, -w / 2 + t / 2, h / 2, 0));
  parts.wall.push(boxGeo(t, h, d - t * 2, TILE, w / 2 - t / 2, h / 2, 0));
  if (doorW > 0) {
    const side = (w - doorW) / 2;
    parts.wall.push(boxGeo(side, h, t + 0.1, TILE, -(doorW / 2 + side / 2), h / 2, -d / 2 + t / 2));
    parts.wall.push(boxGeo(side, h, t + 0.1, TILE, doorW / 2 + side / 2, h / 2, -d / 2 + t / 2));
    parts.wall.push(boxGeo(doorW, 0.9, t + 0.1, TILE, 0, h - 0.45, -d / 2 + t / 2));
    const leafW = o.openDoor ? Math.min(3.2, doorW * 0.24) : doorW;
    if (o.openDoor) {
      for (const sx of [-1, 1]) {
        parts.door.push(boxGeo(leafW, h - 1.4, 0.2, 2.4, sx * (doorW / 2 - leafW / 2), (h - 1.4) / 2, -d / 2 + t + 0.06));
        parts.door.push(boxGeo(leafW, h - 1.4, 0.2, 2.4, sx * (doorW / 2 - leafW / 2), (h - 1.4) / 2, -d / 2 - 0.02));
      }
    } else {
      parts.door.push(boxGeo(doorW, h - 1.4, 0.22, 2.4, 0, (h - 1.4) / 2, -d / 2 + t + 0.06));
    }
  }
  const colH = h + 0.4;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (w / bays) * i;
    parts.col.push(cylGeo(0.42, 0.46, colH, 10, 2.2, x, colH / 2, -d / 2 - 0.55));
    parts.col.push(cylGeo(0.42, 0.46, colH, 10, 2.2, x, colH / 2, d / 2 + 0.55));
  }
  const sideBays = Math.max(2, Math.round(bays / 2));
  for (let i = 1; i < sideBays; i++) {
    const z = -d / 2 + (d / sideBays) * i;
    parts.col.push(cylGeo(0.42, 0.46, colH, 10, 2.2, -w / 2 - 0.55, colH / 2, z));
    parts.col.push(cylGeo(0.42, 0.46, colH, 10, 2.2, w / 2 + 0.55, colH / 2, z));
  }
  parts.paint.push(boxGeo(w + 1.6, 0.95, d + 1.6, 1.4, 0, h + 0.85, 0));
  parts.bracket.push(boxGeo(w + 2.5, 0.75, d + 2.5, 1.2, 0, h + 1.7, 0));
  const winW = (w - 2) / bays - 1.4;
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + (w / bays) * (i + 0.5);
    parts.lattice.push(boxGeo(winW, h - 2.2, 0.16, 2.6, x, (h - 2.2) / 2 + 1.2, -d / 2 - 0.9));
  }
  for (let i = 0; i < sideBays; i++) {
    const z = -d / 2 + (d / sideBays) * (i + 0.5);
    parts.lattice.push(boxGeo(0.16, h - 2.4, (d / sideBays) - 1.6, 2.6, -w / 2 - 0.9, (h - 2.4) / 2 + 1.3, z));
    parts.lattice.push(boxGeo(0.16, h - 2.4, (d / sideBays) - 1.6, 2.6, w / 2 + 0.9, (h - 2.4) / 2 + 1.3, z));
  }
  return parts;
}

export function terraceStack(o) {
  const w = o.w, d = o.d, h = o.h;
  const g = [];
  const waist = Math.max(0.35, h - 0.9);
  g.push(boxGeo(w + 1.1, 0.42, d + 1.1, 2.5, 0, 0.21, 0));
  g.push(boxGeo(w + 0.55, waist, d + 0.55, 2.5, 0, 0.42 + waist / 2, 0));
  g.push(boxGeo(w + 1.0, 0.48, d + 1.0, 2.5, 0, h - 0.24, 0));
  for (let i = 0; i < 8; i++) {
    const x = -w / 2 + (w / 7) * i;
    g.push(boxGeo(0.42, 0.3, 0.42, 2, x, h - 0.75, -d / 2 - 0.62));
    g.push(boxGeo(0.42, 0.3, 0.42, 2, x, h - 0.75, d / 2 + 0.62));
  }
  return merge(g);
}

export function railing(o) {
  const w = o.w, d = o.d, y = o.y || 0, gaps = o.gaps || [];
  const h = o.h || 1.2;
  const g = [];
  function span(side, a0, a1) {
    const len = a1 - a0;
    if (len < 1.4) return;
    const n = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const p = a0 + (len / n) * i;
      if (side === 'z-') g.push(boxGeo(0.24, h, 0.24, 1.6, p, y + h / 2, -d / 2 - 0.55));
      if (side === 'z+') g.push(boxGeo(0.24, h, 0.24, 1.6, p, y + h / 2, d / 2 + 0.55));
      if (side === 'x-') g.push(boxGeo(0.24, h, 0.24, 1.6, -w / 2 - 0.55, y + h / 2, p));
      if (side === 'x+') g.push(boxGeo(0.24, h, 0.24, 1.6, w / 2 + 0.55, y + h / 2, p));
    }
    const rail = (yy, th) => {
      if (side === 'z-') g.push(boxGeo(len, th, 0.3, 1.6, a0 + len / 2, yy, -d / 2 - 0.55));
      if (side === 'z+') g.push(boxGeo(len, th, 0.3, 1.6, a0 + len / 2, yy, d / 2 + 0.55));
      if (side === 'x-') g.push(boxGeo(0.3, th, len, 1.6, -w / 2 - 0.55, yy, a0 + len / 2));
      if (side === 'x+') g.push(boxGeo(0.3, th, len, 1.6, w / 2 + 0.55, yy, a0 + len / 2));
    };
    rail(y + h - 0.16, 0.22);
    rail(y + h * 0.45, 0.15);
  }
  const sides = [
    { id: 'z-', a0: -w / 2, a1: w / 2 },
    { id: 'z+', a0: -w / 2, a1: w / 2 },
    { id: 'x-', a0: -d / 2, a1: d / 2 },
    { id: 'x+', a0: -d / 2, a1: d / 2 }
  ];
  for (const s of sides) {
    const cut = gaps.filter(gp => gp.side === s.id).sort((a, b) => a.x0 - b.x0);
    let cursor = s.a0;
    for (const gp of cut) {
      span(s.id, cursor, gp.x0);
      cursor = gp.x1;
    }
    span(s.id, cursor, s.a1);
  }
  return merge(g);
}

export function stairsGeo(o) {
  const steps = o.steps, w = o.w, d = o.d;
  const y0 = o.y0, y1 = o.y1;
  const dir = o.dir;
  const g = [];
  const rise = (y1 - y0) / steps;
  const run = d / steps;
  for (let i = 0; i < steps; i++) {
    const y = y0 + rise * (i + 1);
    const off = -d / 2 + run * (i + 0.5);
    let x = 0, z = 0;
    if (dir === 'z+') { z = off; }
    else if (dir === 'z-') { z = -off; }
    else if (dir === 'x+') { x = off; }
    else { x = -off; }
    const bw = (dir === 'x+' || dir === 'x-') ? run : w;
    const bd = (dir === 'x+' || dir === 'x-') ? w : run;
    const hy = y - y0;
    g.push(boxGeo(bw, hy, bd, 1.8, x, y0 + hy / 2, z));
    if (o.style === 'imperial') {
      const w2 = (dir === 'x+' || dir === 'x-') ? run : w * 0.3;
      const d2 = (dir === 'x+' || dir === 'x-') ? w * 0.3 : run;
      g.push(boxGeo(w2, 0.09, d2, 1.2, x, y + 0.045, z));
    }
  }
  return merge(g);
}

export function wallSegGeo(o) {
  const len = o.len, h = o.h, t = o.t || 4;
  const g = [];
  g.push(boxGeo(len, 1.0, t + 0.5, 2.2, 0, 0.5, 0));
  g.push(boxGeo(len, h - 1, t, TILE, 0, 1 + (h - 1) / 2, 0));
  g.push(boxGeo(len + 0.7, 0.34, t + 0.9, 2.4, 0, h + 0.17, 0));
  const cap = boxGeo(len + 0.3, 0.5, t + 0.2, 3, 0, h + 0.55, 0);
  cap.rotateZ(0);
  g.push(cap);
  return { body: merge(g), cap: null };
}

export function corridorGeo(o) {
  const x0 = o.x0, x1 = o.x1, z0 = o.z0, z1 = o.z1;
  const axis = o.axis, h = o.h || 5.2;
  const len = axis === 'x' ? x1 - x0 : z1 - z0;
  const wid = axis === 'x' ? z1 - z0 : x1 - x0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const g = { col: [], roof: [], floor: [], paint: [], bracket: [] };
  g.floor.push(boxGeo(axis === 'x' ? len : wid, 0.24, axis === 'x' ? wid : len, 2.4, cx, 0.12, cz));
  const n = Math.max(2, Math.round(len / 3.4));
  for (let i = 0; i <= n; i++) {
    const t = len / n * i;
    const px = axis === 'x' ? x0 + t : x0 + wid / 2;
    const pz = axis === 'x' ? z0 + wid / 2 : z0 + t;
    const o1 = axis === 'x' ? wid / 2 - 0.6 : 0;
    const o2 = axis === 'x' ? z0 + 0.6 : x0 + (axis === 'z' ? 0.6 : 0);
    if (axis === 'x') {
      g.col.push(cylGeo(0.32, 0.34, h, 8, 2, px, h / 2, z0 + 0.6));
      g.col.push(cylGeo(0.32, 0.34, h, 8, 2, px, h / 2, z1 - 0.6));
    } else {
      g.col.push(cylGeo(0.32, 0.34, h, 8, 2, x0 + 0.6, h / 2, pz));
      g.col.push(cylGeo(0.32, 0.34, h, 8, 2, x1 - 0.6, h / 2, pz));
    }
  }
  if (axis === 'x') {
    g.paint.push(boxGeo(len, 0.8, wid, 1.4, cx, h + 0.4, cz));
    g.bracket.push(boxGeo(len + 0.4, 0.6, wid + 0.7, 1.2, cx, h + 1.1, cz));
    const ridge = hipRoof({ w: len + 1.4, d: wid + 1.6, h: 2.2, lift: 0.3, thick: 0.3, ridgeHalf: (len - wid) / 2 });
    ridge.translate(cx, h + 1.4, cz);
    g.roof.push(ridge);
  } else {
    const band = boxGeo(wid, 0.8, len, 1.4, cx, 0, cz);
    band.translate(0, 0, 0);
    g.paint.push(boxGeo(wid, 0.8, len, 1.4, cx, h + 0.4, cz));
    g.bracket.push(boxGeo(wid + 0.7, 0.6, len + 0.4, 1.2, cx, h + 1.1, cz));
    const ridge = hipRoof({ w: wid + 1.6, d: len + 1.4, h: 2.2, lift: 0.3, thick: 0.3, ridgeHalf: (len - wid) / 2 });
    ridge.rotateY(Math.PI / 2);
    ridge.translate(cx, h + 1.4, cz);
    g.roof.push(ridge);
  }
  return g;
}

export function bridgeGeo(o) {
  const x0 = o.x0, x1 = o.x1, z0 = o.z0, z1 = o.z1, y = o.y;
  const axis = o.axis;
  const len = axis === 'x' ? x1 - x0 : z1 - z0;
  const wid = axis === 'x' ? z1 - z0 : x1 - x0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const g = { deck: [], rail: [] };
  g.deck.push(boxGeo(axis === 'x' ? len : wid, 0.3, axis === 'x' ? wid : len, 2.4, cx, y - 0.15, cz));
  g.deck.push(boxGeo(axis === 'x' ? len : wid + 1.4, 0.5, axis === 'x' ? wid + 1.4 : len, 2.6, cx, y - 0.5, cz));
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    if (axis === 'x') g.deck.push(boxGeo(len / 5 - 0.6, 0.8, wid, 2, x0 + len * t, y - 0.8, cz));
    else g.deck.push(boxGeo(wid, 0.8, len / 5 - 0.6, 2, cx, y - 0.8, z0 + len * t));
  }
  const railH = 1.1;
  const n = Math.max(2, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const t = len / n * i;
    if (axis === 'x') {
      g.rail.push(boxGeo(0.22, railH, 0.22, 1.6, x0 + t, y + railH / 2, z0 + 0.5));
      g.rail.push(boxGeo(0.22, railH, 0.22, 1.6, x0 + t, y + railH / 2, z1 - 0.5));
    } else {
      g.rail.push(boxGeo(0.22, railH, 0.22, 1.6, x0 + 0.5, y + railH / 2, z0 + t));
      g.rail.push(boxGeo(0.22, railH, 0.22, 1.6, x1 - 0.5, y + railH / 2, z0 + t));
    }
  }
  if (axis === 'x') {
    g.rail.push(boxGeo(len, 0.16, 0.3, 1.6, cx, y + railH, z0 + 0.5));
    g.rail.push(boxGeo(len, 0.16, 0.3, 1.6, cx, y + railH, z1 - 0.5));
  } else {
    g.rail.push(boxGeo(0.3, 0.16, len, 1.6, x0 + 0.5, y + railH, cz));
    g.rail.push(boxGeo(0.3, 0.16, len, 1.6, x1 - 0.5, y + railH, cz));
  }
  return g;
}

export function columnHall(o) {
  const w = o.w, d = o.d, h = o.h;
  const g = [];
  const n = o.bays || 4;
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + (w / n) * i;
    g.push(cylGeo(0.32, 0.36, h, 8, 2, x, h / 2, -d / 2 + 0.4));
    g.push(cylGeo(0.32, 0.36, h, 8, 2, x, h / 2, d / 2 - 0.4));
  }
  return merge(g);
}
