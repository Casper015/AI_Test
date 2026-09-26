/**
 * 紫禁天朝 · 建筑构件库与实例化装配（A 资源与建筑库 · style-baseline-v1）
 * 形制统一：同类建筑共享屋面坡度、柱径、檐高与彩画等级；重复构件按分区聚类实例化。
 */

import * as THREE from 'three';
import { boxGeo, cylGeo, coneGeo, icoGeo, merge, TILE } from './geom.js';
import {
  hipRoof, skirtRoof, ridgeBeams, finial, gableRoof, gableEnds,
  hallBody, terraceStack, railing, stairsGeo, wallSegGeo, corridorGeo, bridgeGeo
} from './parts.js';
import { treeParts, rockParts, monumentParts, lanternParts, planeGeo, slabGeo } from './props.js';

export const ARCH_SIZES = {};

const REG = {};

function def(name, w, d, h, fn) {
  ARCH_SIZES[name] = { w, d, h };
  REG[name] = fn;
}

const BAND = 2.45;

function doubleEaveBody(o, opts) {
  const w = o.w, d = o.d, h = o.h;
  const lowerH = opts.lowerH;
  const upperW = opts.upperW, upperD = opts.upperD;
  const upperBody = Math.max(2.2, h - opts.roofH - lowerH - BAND - opts.skirtH);
  const body = hallBody({ w, d, wallH: lowerH, bays: opts.bays, doorW: opts.doorW, openDoor: opts.openDoor, backDoor: opts.backDoor });
  const out = body;
  const b2 = hallBody({ w: upperW, d: upperD, wallH: upperBody, bays: Math.max(3, opts.bays - 4), doorW: 0 });
  const dy = lowerH + BAND + opts.skirtH;
  for (const k of ['wall', 'col', 'lattice', 'paint', 'bracket', 'door']) {
    if (!b2[k]) continue;
    b2[k] = b2[k].map(g => { g.translate(0, dy, 0); return g; });
  }
  out.wall = out.wall.concat(b2.wall);
  out.col = out.col.concat(b2.col);
  out.lattice = out.lattice.concat(b2.lattice);
  out.paint = out.paint.concat(b2.paint);
  out.bracket = out.bracket.concat(b2.bracket);
  const low = skirtRoof({ w: w + 3.4, d: d + 3.4, h: opts.skirtH, innerW: upperW - 1.6, innerD: upperD - 1.6, lift: opts.lift * 0.8 });
  low.translate(0, lowerH + BAND, 0);
  out.roof = [low];
  const top = hipRoof({ w: upperW + 1.6, d: upperD + 1.6, h: opts.roofH, lift: opts.lift * 1.25, thick: 0.5 });
  top.translate(0, h - opts.roofH, 0);
  out.roof.push(top);
  out.ridge = [ridgeBeams({ w: upperW + 1.6, d: upperD + 1.6, h: h, lift: opts.lift * 1.25 })];
  return out;
}

def('hall11', 66, 34, 30, () => doubleEaveBody({ w: 66, d: 34, h: 30 }, {
  lowerH: 13, skirtH: 3, roofH: 8, upperW: 57, upperD: 26, bays: 11, doorW: 22, openDoor: true, backDoor: 22, lift: 0.95
}));

function hall9Def(back) {
  return () => {
    const wallH = 11;
    const p = hallBody({ w: 50, d: 28, wallH, bays: 9, doorW: 10, openDoor: true, backDoor: back });
    const roofH = 24 - wallH - BAND;
    const roof = hipRoof({ w: 54, d: 32, h: roofH, lift: 0.75, thick: 0.5 });
    roof.translate(0, wallH + BAND, 0);
    p.roof = [roof];
    p.ridge = [ridgeBeams({ w: 54, d: 32, h: 24, lift: 0.75 })];
    return p;
  };
}
def('hall9', 50, 28, 24, hall9Def(0));
def('hall9b', 50, 28, 24, hall9Def(10));

def('hall7', 38, 22, 17, () => {
  const wallH = 7.2;
  const p = hallBody({ w: 38, d: 22, wallH, bays: 7, doorW: 8 });
  const eaveY = wallH + BAND;
  const skirtH = 2.0;
  const low = skirtRoof({ w: 41, d: 25, h: skirtH, innerW: 30, innerD: 15, lift: 0.6 });
  low.translate(0, eaveY, 0);
  const upH = 17 - eaveY - skirtH - 1.1;
  const up = gableRoof({ w: 31, d: 16, h: upH, lift: 0.5, ridgeAxis: 'x' });
  up.translate(0, eaveY + skirtH + 1.1, 0);
  p.roof = [low, up];
  const ge = gableEnds({ w: 30.6, d: 15.6, h: upH, ridgeAxis: 'x' });
  ge.translate(0, eaveY + skirtH + 1.1, 0);
  p.gable = [ge];
  p.ridge = [ridgeBeams({ w: 31, d: 16, h: 17, lift: 0.5 })];
  return p;
});

def('hall5', 28, 16, 14, () => {
  const wallH = 6.2;
  const p = hallBody({ w: 28, d: 16, wallH, bays: 5, doorW: 7 });
  const eaveY = wallH + BAND;
  const skirtH = 1.8;
  const low = skirtRoof({ w: 31, d: 19, h: skirtH, innerW: 21, innerD: 11, lift: 0.55 });
  low.translate(0, eaveY, 0);
  const upH = 14 - eaveY - skirtH - 1.0;
  const up = gableRoof({ w: 22, d: 12, h: upH, lift: 0.42, ridgeAxis: 'x' });
  up.translate(0, eaveY + skirtH + 1.0, 0);
  p.roof = [low, up];
  const ge = gableEnds({ w: 21.6, d: 11.6, h: upH, ridgeAxis: 'x' });
  ge.translate(0, eaveY + skirtH + 1.0, 0);
  p.gable = [ge];
  p.ridge = [ridgeBeams({ w: 22, d: 12, h: 14, lift: 0.42 })];
  return p;
});

function houseDef(w, d, h, bays) {
  return () => {
    const wallH = Math.max(3.6, h * 0.42);
    const p = hallBody({ w, d, wallH, bays, doorW: Math.min(5, w * 0.34) });
    const eaveY = wallH + BAND;
    const roofH = h - eaveY;
    const roof = gableRoof({ w: w + 1.6, d: d + 1.6, h: roofH, lift: 0.4, ridgeAxis: 'x' });
    roof.translate(0, eaveY, 0);
    p.roof = [roof];
    const ge = gableEnds({ w: w, d, h: roofH, ridgeAxis: 'x' });
    ge.translate(0, eaveY, 0);
    p.gable = [ge];
    p.ridge = [ridgeBeams({ w: w + 1.6, d: d + 1.6, h, lift: 0.4 })];
    return p;
  };
}

def('house3', 16, 10, 11, houseDef(16, 10, 11, 3));
def('house5', 26, 11, 12, houseDef(26, 11, 12, 5));

def('square3', 26, 26, 20, () => {
  const wallH = 7.6;
  const p = hallBody({ w: 26, d: 26, wallH, bays: 4, doorW: 8 });
  const eaveY = wallH + BAND;
  const roof = hipRoof({ w: 30, d: 30, h: 20 - eaveY, lift: 0.85, thick: 0.5, ridgeHalf: 0 });
  roof.translate(0, eaveY, 0);
  p.roof = [roof];
  p.gold = [finial(20, 2.4)];
  return p;
});

function openPavilion(o, opts) {
  const w = o.w, d = o.d, h = o.h;
  const wallH = opts.wallH;
  const p = { col: [], wall: [], roof: [], ridge: [], paint: [], bracket: [], gold: [], rail: [], base: [] };
  const bays = opts.bays;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (w / bays) * i;
    p.col.push(cylGeo(0.36, 0.4, wallH, 10, 2.2, x, wallH / 2, -d / 2 + 0.4));
    p.col.push(cylGeo(0.36, 0.4, wallH, 10, 2.2, x, wallH / 2, d / 2 - 0.4));
  }
  for (let i = 1; i < bays; i++) {
    const z = -d / 2 + (d / bays) * i;
    p.col.push(cylGeo(0.36, 0.4, wallH, 10, 2.2, -w / 2 + 0.4, wallH / 2, z));
    p.col.push(cylGeo(0.36, 0.4, wallH, 10, 2.2, w / 2 - 0.4, wallH / 2, z));
  }
  p.rail.push(railing({ w: w - 2.4, d: d - 2.4, y: 0, h: 0.95 }));
  p.paint.push(boxGeo(w + 1.2, 0.7, d + 1.2, 1.4, 0, wallH + 0.45, 0));
  p.bracket.push(boxGeo(w + 2.1, 0.55, d + 2.1, 1.2, 0, wallH + 1.1, 0));
  const eaveY = wallH + 1.7;
  if (opts.double) {
    const skirtH = 1.9;
    const low = skirtRoof({ w: w + 3.2, d: d + 3.2, h: skirtH, innerW: w * 0.62, innerD: d * 0.62, lift: 0.55 });
    low.translate(0, eaveY, 0);
    p.roof.push(low);
    const upEave = eaveY + skirtH + 1.5;
    const up = hipRoof({ w: w * 0.62 + 1.6, d: d * 0.62 + 1.6, h: h - upEave, lift: 0.8, thick: 0.42, ridgeHalf: 0 });
    up.translate(0, upEave, 0);
    p.roof.push(up);
    p.gold.push(finial(h, 2));
  } else {
    const up = hipRoof({ w: w + 2.8, d: d + 2.8, h: h - eaveY, lift: 0.7, thick: 0.42, ridgeHalf: 0 });
    up.translate(0, eaveY, 0);
    p.roof.push(up);
    p.gold.push(finial(h, 2));
  }
  p.base.push(terraceStack({ w: w + 1.6, d: d + 1.6, h: 0.9 }));
  return p;
}

def('pav2', 16, 16, 17, () => openPavilion({ w: 16, d: 16, h: 17 }, { wallH: 5.4, bays: 3, double: true }));
def('pav1', 11, 11, 12, () => openPavilion({ w: 11, d: 11, h: 12 }, { wallH: 3.8, bays: 3, double: false }));

function gateHall(o, opts) {
  const w = o.w, d = o.d, h = o.h;
  const wallH = opts.wallH;
  const opens = opts.opens;
  const p = { wall: [], col: [], roof: [], ridge: [], paint: [], bracket: [], door: [], lattice: [], marble: [] };
  const sorted = opens.slice().sort((a, b) => a.x0 - b.x0);
  let cursor = -w / 2;
  for (const op of sorted) {
    if (op.x0 > cursor) p.wall.push(boxGeo(op.x0 - cursor, wallH, d, TILE, (cursor + op.x0) / 2, wallH / 2, 0));
    p.wall.push(boxGeo(op.x1 - op.x0, wallH - (op.top || 6), d, TILE, (op.x0 + op.x1) / 2, (wallH + (op.top || 6)) / 2, 0));
    const lw = Math.min(2.8, (op.x1 - op.x0) * 0.26), lh = (op.top || 6) - 0.4;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.door.push(boxGeo(lw, lh, 0.24, 2.4, (op.x0 + op.x1) / 2 + sx * ((op.x1 - op.x0) / 2 - lw / 2), lh / 2, sz * (d / 2 + 0.12)));
      }
    }
    cursor = op.x1;
  }
  if (cursor < w / 2) p.wall.push(boxGeo(w / 2 - cursor, wallH, d, TILE, (cursor + w / 2) / 2, wallH / 2, 0));
  const bays = Math.max(3, Math.round(w / 4.5));
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (w / bays) * i;
    p.col.push(cylGeo(0.4, 0.44, wallH + 0.3, 9, 2.2, x, (wallH + 0.3) / 2, -d / 2 - 0.7));
    p.col.push(cylGeo(0.4, 0.44, wallH + 0.3, 9, 2.2, x, (wallH + 0.3) / 2, d / 2 + 0.7));
  }
  p.paint.push(boxGeo(w + 2, 1.0, d + 2, 1.4, 0, wallH + 0.5, 0));
  p.bracket.push(boxGeo(w + 3, 0.7, d + 3, 1.2, 0, wallH + 1.35, 0));
  const roof = hipRoof({ w: w + 5, d: d + 4.4, h: h - wallH - BAND, lift: opts.lift, thick: 0.5 });
  roof.translate(0, wallH + BAND, 0);
  p.roof.push(roof);
  p.ridge.push(ridgeBeams({ w: w + 5, d: d + 4.4, h, lift: opts.lift }));
  return p;
}

def('gate3', 54, 24, 22, () => gateHall({ w: 54, d: 24, h: 22 }, {
  wallH: 9.5, lift: 0.8,
  opens: [{ x0: -7, x1: 7, top: 7.5 }, { x0: -30, x1: -22, top: 6 }, { x0: 22, x1: 30, top: 6 }]
}));

def('gate1', 26, 16, 13, () => {
  const p = gateHall({ w: 26, d: 16, h: 13 }, { wallH: 5.2, lift: 0.6, opens: [{ x0: -3.6, x1: 3.6, top: 4.4 }] });
  p.marble.push(boxGeo(28, 0.5, 18, 2.4, 0, 0.25, 0));
  return p;
});

def('gateMain', 122, 17, 30, () => {
  const w = 122, d = 17, wallH = 12.5;
  const p = { wall: [], col: [], roof: [], ridge: [], paint: [], bracket: [], door: [], lattice: [], gold: [] };
  const opens = [{ x0: -7, x1: 7, top: 9 }, { x0: -46, x1: -34, top: 6.5 }, { x0: 34, x1: 46, top: 6.5 }];
  let cursor = -w / 2;
  for (const op of opens) {
    if (op.x0 > cursor) p.wall.push(boxGeo(op.x0 - cursor, wallH, d, TILE, (cursor + op.x0) / 2, wallH / 2, 0));
    p.wall.push(boxGeo(op.x1 - op.x0, wallH - op.top, d, TILE, (op.x0 + op.x1) / 2, (wallH + op.top) / 2, 0));
    const lw = Math.min(3.4, (op.x1 - op.x0) * 0.26), lh = op.top - 0.5;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.door.push(boxGeo(lw, lh, 0.26, 2.4, (op.x0 + op.x1) / 2 + sx * ((op.x1 - op.x0) / 2 - lw / 2), lh / 2, sz * (d / 2 + 0.14)));
      }
    }
    cursor = op.x1;
  }
  if (cursor < w / 2) p.wall.push(boxGeo(w / 2 - cursor, wallH, d, TILE, (cursor + w / 2) / 2, wallH / 2, 0));
  const main = hallBody({ w: 34, d: 20, wallH: 8.4, bays: 5, doorW: 0 });
  for (const k of Object.keys(main)) p[k] = (p[k] || []).concat(main[k]);
  const towerLow = skirtRoof({ w: 42, d: 26, h: 2.6, innerW: 26, innerD: 14, lift: 0.8 });
  towerLow.translate(0, wallH + 2.3, 0);
  p.roof.push(towerLow);
  const towerTop = hipRoof({ w: 27, d: 15, h: 7.6, lift: 0.9, thick: 0.5 });
  towerTop.translate(0, 22.4, 0);
  p.roof.push(towerTop);
  p.ridge.push(ridgeBeams({ w: 27, d: 15, h: 30, lift: 0.9 }));
  for (const sx of [-1, 1]) {
    const wing = hallBody({ w: 22, d: 16, wallH: 8.4, bays: 3, doorW: 0 });
    wing.wall = wing.wall.map(g => { g.translate(sx * 50, 0, -8); return g; });
    wing.col = wing.col.map(g => { g.translate(sx * 50, 0, -8); return g; });
    wing.lattice = wing.lattice.map(g => { g.translate(sx * 50, 0, -8); return g; });
    for (const k of ['wall', 'col', 'lattice']) p[k] = (p[k] || []).concat(wing[k]);
    const wr = hipRoof({ w: 25, d: 18, h: 5.2, lift: 0.6, thick: 0.42 });
    wr.translate(sx * 50, 13.5, -8);
    p.roof.push(wr);
    p.paint.push(boxGeo(23, 0.8, 17, 1.4, sx * 50, 9.2, -8));
    p.wall.push(boxGeo(18, 8.4, 2.4, TILE, sx * 50, 4.2, -14.5));
  }
  return p;
});

def('wallSeg', 30, 4, 12, (o, m) => {
  const r = wallSegGeo({ len: 30, h: 12, t: 4 });
  return { wall: [r.body] };
});

def('terrain', 1, 1, 1, () => ({}));

export function archetypeGeometry(name, materials, decor) {
  const fn = REG[name];
  if (!fn) throw new Error('unknown archetype ' + name);
  const parts = fn({}, materials);
  const out = {};
  for (const key of Object.keys(parts)) {
    const list = (parts[key] || []).filter(Boolean);
    if (!list.length) continue;
    if (decor === false && (key === 'lattice' || key === 'painting' || key === 'exemption')) continue;
    const matKey = key;
    out[matKey] = merge(list);
  }
  return out;
}

export function makeCorridorGeometry(run, decor) {
  const g = corridorGeo({ x0: run.x0, x1: run.x1, z0: run.z0, z1: run.z1, axis: run.axis, h: run.axis === 'x' ? 4.6 : 4.6 });
  return g;
}

export function makeTreeGeometry(kind, variant) {
  return treeParts(kind, variant);
}

export function makeRockGeometry(seed, r, h) {
  return rockParts(seed, r, h);
}

export function makeMonumentGeometry(kind, h, r) {
  return monumentParts(kind, h, r);
}

export function makeLanternGeometry(kind, scale) {
  return lanternParts(kind, scale);
}

export function makeBridgeGeometry(o) {
  return bridgeGeo(o);
}

export function makeTerraceGeometry(t) {
  const h = t.y;
  const g = terraceStack({ w: t.x1 - t.x0, d: t.z1 - t.z0, h });
  const rail = railing({ w: t.x1 - t.x0, d: t.z1 - t.z0, y: h, h: 1.25, gaps: t.gaps });
  return { base: g, rail };
}

export function makeStairsGeometry(s) {
  return stairsGeo(s);
}

export function makePlane(w, d, tile, x, y, z) {
  return planeGeo(w, d, tile, x, y, z);
}

export function makeSlab(w, d, y, thick, tile, x, z) {
  return slabGeo(w, d, y, thick, tile, x, z);
}

export { merge, boxGeo, cylGeo, coneGeo, icoGeo, TILE };
