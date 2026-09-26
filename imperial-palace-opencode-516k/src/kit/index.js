import { createMaterials } from './materials.js';
import { mergeByMaterial } from './merge.js';
import {
  detailProfile, tileLines, dougongRow, ridgeBeast, railingExtras,
  pavingPattern, rockery, stoneLamp, censerProps, willowTree
} from './details.js';
import { assetRegistry } from './assets.js';

function roofShape(p) {
  const { hw, hd, h, r, curve, lift, W, D } = p;
  return function height(x, z) {
    const ax = Math.min(Math.abs(x), hw);
    const az = Math.min(Math.abs(z), hd);
    const t = Math.min(1, Math.max(az / hd, Math.max(0, ax - r) / Math.max(1e-3, hw - r)));
    let y = h * Math.pow(Math.max(0, 1 - t), curve);
    const corner = Math.pow((Math.abs(x) / W) * (Math.abs(z) / D), 2);
    return y + lift * corner;
  };
}

function roofGeometry(THREE, cfg, o) {
  if (!Number.isFinite(o.h) || o.h <= 0) throw new Error('roof: 需要有效高度 h，收到 ' + o.h);
  if (!Number.isFinite(o.w) || !Number.isFinite(o.d) || o.w <= 0 || o.d <= 0) throw new Error('roof: 需要有效 w/d，收到 ' + o.w + 'x' + o.d);
  const hw = o.w / 2, hd = o.d / 2;
  const ridgeHalf = Math.max(1e-3, Math.min(o.w * (o.ridgeRatio ?? 0.62), o.w - o.d * 0.85) / 2);
  const W = hw + (o.overhang ?? cfg.overhang) * o.w * 0.5;
  const D = hd + (o.overhang ?? cfg.overhang) * o.d * 0.5;
  const p = { hw, hd, h: o.h, r: ridgeHalf, curve: o.curve ?? cfg.curve, lift: o.lift ?? cfg.lift, W, D };
  const height = roofShape(p);
  const segX = Math.max(4, Math.round((o.segX ?? cfg.gridX) * Math.min(1.2, o.w / 40 + 0.4)));
  const segZ = Math.max(3, Math.round((o.segZ ?? cfg.gridZ) * Math.min(1.2, o.d / 40 + 0.4)));
  const positions = [];
  const push = (x, z) => positions.push(x, height(x, z), z);
  for (let i = 0; i < segX; i++) {
    for (let j = 0; j < segZ; j++) {
      const x0 = -W + (2 * W * i) / segX, x1 = -W + (2 * W * (i + 1)) / segX;
      const z0 = -D + (2 * D * j) / segZ, z1 = -D + (2 * D * (j + 1)) / segZ;
      push(x0, z0); push(x1, z1); push(x1, z0);
      push(x0, z0); push(x0, z1); push(x1, z1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.computeVertexNormals();
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0, k = 0; i < positions.length; i += 3, k += 2) {
    uv[k] = (positions[i] / W) * 0.5 + 0.5;
    uv[k + 1] = (positions[i + 2] / D) * 0.5 + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return { geometry: geo, p, height };
}

function boxAt(THREE, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function cylAt(THREE, rt, rb, h, x, y, z, material, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  return m;
}

function instanced(THREE, geo, mat, list, castShadow = true) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const dummy = new THREE.Object3D();
  list.forEach((t, i) => {
    dummy.position.set(t.x || 0, t.y || 0, t.z || 0);
    dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    const s = t.s ?? 1;
    dummy.scale.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = castShadow;
  im.receiveShadow = true;
  return im;
}

export const TIERS = {
  royal: { body: 12, roof: 11, col: 0.62, terrace: 4.5, tiers: 3, rails: true, shade: true, colSeg: 8 },
  major: { body: 9, roof: 8, col: 0.5, terrace: 1.8, tiers: 1, rails: false, shade: true, colSeg: 7 },
  minor: { body: 7, roof: 6, col: 0.4, terrace: 1.0, tiers: 1, rails: false, shade: false, colSeg: 6 }
};

export function createKit({ THREE, config, rng, assets }) {
  const M = createMaterials(THREE, config.PALETTE);
  const R = config.ROOF;
  const tier = (name) => TIERS[name] || TIERS.minor;
  const registry = Array.isArray(assets && assets.registry) ? assets.registry : assetRegistry;

  function railing(rects, y, opts = {}) {
    const g = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.26, 1.15, 0.26);
    const posts = [];
    const railGeo = new THREE.BoxGeometry(1, 0.18, 0.34);
    for (const r of rects) {
      const steps = Math.max(2, Math.round(r.len / (opts.postSpacing || 3)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        posts.push({ x: r.axis === 'x' ? r.x - r.len / 2 + r.len * t : r.x, y, z: r.axis === 'x' ? r.z : r.z - r.len / 2 + r.len * t });
      }
      const rail = new THREE.Mesh(railGeo, opts.material || M.stone);
      rail.scale.set(r.len, 1, 1);
      if (r.axis === 'z') rail.rotation.y = Math.PI / 2;
      rail.position.set(r.x, y + 1.05, r.z);
      g.add(rail);
      const rail2 = rail.clone();
      rail2.position.y = y + 0.55;
      g.add(rail2);
    }
    g.add(instanced(THREE, postGeo, opts.material || M.stone, posts));
    g.add(railingExtras(THREE, M, {
      posts,
      rects,
      y,
      material: opts.material,
      panelMaterial: opts.panelMaterial,
      caps: opts.caps,
      capsEvery: opts.capsEvery
    }));
    return g;
  }

  function stairs(o) {
    const g = new THREE.Group();
    const steps = o.steps || 5;
    const stepH = o.stepH || (o.height || 1.8) / steps;
    const stepD = o.stepD || 1.6;
    const curb = o.curbs !== false;
    for (let i = 0; i < steps; i++) {
      const h = stepH * (i + 1);
      const z = -stepD * (steps - 1) + i * stepD + stepD / 2;
      g.add(boxAt(THREE, o.w, h, stepD, 0, h / 2, z, M.stoneSide));
      if (curb) {
        for (const sx of [-1, 1]) {
          g.add(boxAt(THREE, 0.62, h + 0.12, stepD, sx * (o.w / 2 + 0.28), (h + 0.12) / 2, z, M.stone));
        }
      }
    }
    return g;
  }

  function roof(o) {
    const g = new THREE.Group();
    const { geometry, height, p } = roofGeometry(THREE, R, o);
    const slope = new THREE.Mesh(geometry, o.material || M.roofGold);
    g.add(slope);
    const profile = o.profile || null;
    if (profile && o.tiles !== false) {
      g.add(tileLines(THREE, { height, W: p.W, D: p.D, mat: o.tileMaterial || M.roofGoldDark, profile }));
    }
    const fh = R.fasciaH;
    const W = p.W, D = p.D;
    g.add(boxAt(THREE, W * 2, fh, 0.5, 0, -fh / 2, D, M.roofUnderside));
    g.add(boxAt(THREE, W * 2, fh, 0.5, 0, -fh / 2, -D, M.roofUnderside));
    g.add(boxAt(THREE, 0.5, fh, D * 2, W, -fh / 2, 0, M.roofUnderside));
    g.add(boxAt(THREE, 0.5, fh, D * 2, -W, -fh / 2, 0, M.roofUnderside));
    const ridgeLen = p.r * 2;
    if (ridgeLen > 1.2) {
      g.add(boxAt(THREE, ridgeLen + 0.9, R.ridgeH, 1.05, 0, o.h + R.ridgeH / 2 - 0.15, 0, M.ridge));
      if (profile && profile.beasts) {
        const bs = o.beastScale ?? Math.max(0.75, Math.min(1.35, o.w / 70));
        for (const sx of [-1, 1]) {
          g.add(ridgeBeast(THREE, M, { x: sx * (ridgeLen / 2 + 0.35), y: o.h + R.ridgeH - 0.2, z: 0, s: bs, dir: sx }));
        }
      } else {
        const orn = new THREE.ConeGeometry(0.42, 1.1, 6);
        for (const sx of [-1, 1]) {
          const c = new THREE.Mesh(orn, M.ridge);
          c.position.set(sx * (ridgeLen / 2 + 0.5), o.h + R.ridgeH + 0.35, 0);
          g.add(c);
        }
      }
    } else {
      g.add(cylAt(THREE, 0.3, 0.5, 0.9, 0, o.h + 0.25, 0, M.ridge, 8));
      const ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), M.ridge);
      ball2.position.y = o.h + 1.05;
      g.add(ball2);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.3, 8), M.ridge);
      spike.position.y = o.h + 2.0;
      g.add(spike);
    }
    const tip = new THREE.ConeGeometry(0.3, 1.0, 6);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const c = new THREE.Mesh(tip, M.ridge);
        c.position.set(sx * W, height(sx * W, sz * D) - 0.2, sz * D);
        c.rotation.z = -sx * 0.35;
        c.rotation.x = sz * 0.35;
        g.add(c);
      }
    }
    return g;
  }

  function terraceBase(o) {
    const g = new THREE.Group();
    const t = tier(o.tier);
    const tiers = o.terrace ? t.tiers : 1;
    const total = o.terrace ? t.terrace : 0.9;
    const per = total / tiers;
    for (let i = 0; i < tiers; i++) {
      const pad = 5.5 * (tiers - i - 1) + 2.4;
      g.add(boxAt(THREE, o.w + pad * 2, per, o.d + pad * 2, 0, per * i + per / 2, 0, i % 2 ? M.stone : M.stoneDark));
    }
    if (o.rails && o.terrace) {
      const pad = 2.4;
      const y = total;
      const hw = o.w / 2 + pad, hd = o.d / 2 + pad;
      const rects = [
        { x: 0, z: -hd + 3.2, len: o.w + pad * 2 - 7, axis: 'x' },
        { x: -hw, z: -hd / 2 - 1, len: hd - 6.4, axis: 'z' },
        { x: hw, z: -hd / 2 - 1, len: hd - 6.4, axis: 'z' },
        { x: -hw / 2 - 2, z: hd, len: hw - 4, axis: 'x' },
        { x: hw / 2 + 2, z: hd, len: hw - 4, axis: 'x' }
      ];
      g.add(railing(rects, y, { capsEvery: o.capsEvery, postSpacing: o.postSpacing }));
    }
    return { group: g, height: total };
  }

  function bandAt(w, h, d, x, y, z, material) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const repeats = Math.max(1, Math.round(w / 5));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeats, uv.getY(i));
    uv.needsUpdate = true;
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    return m;
  }

  function body(o, baseY) {
    const t = tier(o.tier);
    const prof = o.profile || detailProfile(o.tier, o);
    const g = new THREE.Group();
    const w = o.w, d = o.d, bays = o.bays || 5;
    const bodyH = o.bodyH || t.body;
    const colGeo = new THREE.CylinderGeometry(t.col, t.col * 1.06, bodyH, o.colSeg || t.colSeg || 8);
    const cols = [];
    for (let i = 0; i <= bays; i++) {
      const x = -w / 2 + (i * w) / bays;
      cols.push({ x, y: baseY + bodyH / 2, z: -d / 2 + 1.0 });
      cols.push({ x, y: baseY + bodyH / 2, z: d / 2 - 1.0 });
    }
    cols.push({ x: -w / 2 + 0.6, y: baseY + bodyH / 2, z: d / 2 - 1.0 });
    cols.push({ x: w / 2 - 0.6, y: baseY + bodyH / 2, z: d / 2 - 1.0 });
    g.add(instanced(THREE, colGeo, M.wallRed, cols, t.shade));
    const wallH = bodyH;
    g.add(boxAt(THREE, 0.7, wallH, d * 0.92, -w / 2, baseY + wallH / 2, 0.2, M.wallRed));
    g.add(boxAt(THREE, 0.7, wallH, d * 0.92, w / 2, baseY + wallH / 2, 0.2, M.wallRed));
    const openW = o.openW ?? w * 0.34;
    const openH = bodyH * 0.72;
    if (o.kind === 'gateHall') {
      // 宫门三开间板门：门洞通透，门扇、门钉、门环齐全
      const n = bays >= 5 ? 3 : 1;
      const span = w / (n + 1.4);
      const leafW = Math.min(openW * 0.8, span * 0.8);
      const doors = [];
      for (let i = 0; i < n; i++) doors.push({ x: (i - (n - 1) / 2) * span, w: leafW });
      const sorted = doors.slice().sort((a, b) => a.x - b.x);
      const frontZ = -d / 2 + 0.35, backZ = d / 2 - 0.35;
      const wallRun = (z) => {
        let cursor = -w / 2;
        for (const dr of sorted) {
          const gs = dr.x - dr.w / 2;
          if (gs - cursor > 0.4) g.add(boxAt(THREE, gs - cursor, wallH, 0.7, (cursor + gs) / 2, baseY + wallH / 2, z, M.wallRed));
          g.add(boxAt(THREE, dr.w + 0.7, wallH - openH, 0.7, dr.x, baseY + openH + (wallH - openH) / 2, z, M.wallRed));
          cursor = dr.x + dr.w / 2;
        }
        if (w / 2 - cursor > 0.4) g.add(boxAt(THREE, w / 2 - cursor, wallH, 0.7, (cursor + w / 2) / 2, baseY + wallH / 2, z, M.wallRed));
      };
      wallRun(frontZ);
      wallRun(backZ);
      const studs = [];
      const rows = Math.max(2, Math.round(openH / 2.8));
      const colsN = Math.max(2, Math.round(leafW / 2.6));
      for (const dr of doors) {
        g.add(boxAt(THREE, dr.w, openH, 0.34, dr.x, baseY + openH / 2 + 0.05, -d / 2 + 0.5, M.woodDark));
        for (let a = 0; a < colsN; a++) {
          for (let b = 0; b < rows; b++) {
            studs.push({
              x: dr.x - dr.w * 0.32 + (a * dr.w * 0.64) / Math.max(1, colsN - 1),
              y: baseY + openH * 0.26 + (b * openH * 0.5) / Math.max(1, rows - 1),
              z: -d / 2 + 0.7
            });
          }
        }
      }
      g.add(instanced(THREE, new THREE.SphereGeometry(0.13, 6, 5), M.ridge, studs, false));
      const ringGeo = new THREE.TorusGeometry(0.16, 0.045, 3, 6);
      for (const dr of doors) {
        const ring = new THREE.Mesh(ringGeo, M.ridge);
        ring.position.set(dr.x + dr.w * 0.28, baseY + openH * 0.6, -d / 2 + 0.72);
        g.add(ring);
      }
    } else {
      g.add(boxAt(THREE, w, wallH, 0.7, 0, baseY + wallH / 2, d / 2 - 0.35, M.wallRed));
      g.add(boxAt(THREE, w - 2.4, wallH * 0.92, d - 2.4, 0, baseY + wallH * 0.46, d * 0.12, M.dark));
      g.add(boxAt(THREE, openW, openH, 0.5, 0, baseY + openH / 2 + 0.2, -d / 2 + 0.7, M.dark));
      g.add(boxAt(THREE, 0.16, openH, 0.62, -openW / 2, baseY + openH / 2 + 0.2, -d / 2 + 0.8, M.wood));
      g.add(boxAt(THREE, 0.16, openH, 0.62, openW / 2, baseY + openH / 2 + 0.2, -d / 2 + 0.8, M.wood));
      g.add(boxAt(THREE, openW, 0.2, 0.62, 0, baseY + openH + 0.3, -d / 2 + 0.8, M.wood));
    }
    const bandY = baseY + bodyH;
    const bandMat = o.tier === 'minor' ? M.caihuaGreen : M.caihuaPainted;
    g.add(bandAt(w + 0.9, 0.55, d + 0.9, 0, bandY - 0.5, 0, bandMat));
    g.add(boxAt(THREE, w + 0.75, 0.4, d + 0.75, 0, bandY - 0.12, 0, M.caihuaBlue));
    g.add(boxAt(THREE, w + 1.0, 0.26, d + 1.0, 0, bandY + 0.14, 0, M.ridge));
    g.add(dougongRow(THREE, M, { w: w + 1.0, d: d + 1.0, y: bandY - 0.98, profile: prof, max: o.dougongMax }));
    g.add(boxAt(THREE, 3.6, 1.4, 0.34, 0, bandY - 0.6, -d / 2 - 0.5, M.plaque));
    g.add(boxAt(THREE, 4.2, 0.5, 0.5, 0, baseY + openH + 0.9, -d / 2 + 0.55, M.ridge));
    return g;
  }

  function hall(o) {
    const g = new THREE.Group();
    const t = tier(o.tier);
    const grand = o.tier === 'royal' && !!o.double && o.w >= 90;
    const prof = o.profile || detailProfile(o.tier, { grand });
    const colSeg = grand ? t.colSeg : (o.tier === 'royal' ? 7 : t.colSeg);
    const base = terraceBase({ ...o, rails: t.rails, capsEvery: o.capsEvery ?? prof.capsEvery, postSpacing: o.postSpacing ?? prof.postSpacing });
    g.add(base.group);
    const baseY = base.height;
    g.add(body({ ...o, profile: prof, colSeg }, baseY));
    const roofH = o.roofH || t.roof;
    if (o.double) {
      const lowProf = grand ? prof : { ...prof, beasts: false };
      const low = roof({ w: o.w + 7, d: o.d + 6, h: roofH * 0.55, ridgeRatio: 0.66, material: M.roofGoldDark, profile: lowProf, segX: 13, segZ: 8 });
      low.position.y = baseY + (o.bodyH || t.body) * 0.6;
      g.add(low);
      const upW = o.w * 0.64, upD = o.d * 0.64;
      const upBodyH = (o.bodyH || t.body) * 0.42;
      g.add(boxAt(THREE, upW, upBodyH, upD, 0, baseY + (o.bodyH || t.body) * 0.6 + upBodyH / 2, 0, M.wallRed));
      g.add(boxAt(THREE, upW + 1.0, 0.5, upD + 1.0, 0, baseY + (o.bodyH || t.body) * 0.6 + upBodyH + 0.1, 0, M.caihuaBlue));
      g.add(boxAt(THREE, upW + 2.6, 0.55, upD + 2.6, 0, baseY + (o.bodyH || t.body) * 0.6 - 0.2, 0, M.stone));
      const up = roof({ w: upW + 3, d: upD + 3, h: roofH * 0.72, profile: prof, segX: grand ? undefined : 12, segZ: grand ? undefined : 9 });
      up.position.y = baseY + (o.bodyH || t.body) * 0.6 + upBodyH + 0.7;
      g.add(up);
      g.add(dougongRow(THREE, M, { w: upW + 1.4, d: upD + 1.4, y: baseY + (o.bodyH || t.body) * 0.6 + upBodyH - 0.5, profile: prof, max: Math.max(8, Math.round((o.dougongMax || prof.dougongMax) * 0.4)) }));
    } else {
      const r = roof({ w: o.w + 3.4, d: o.d + 3, h: roofH, profile: prof });
      r.position.y = baseY + (o.bodyH || t.body) + 0.2;
      g.add(r);
    }
    const stW = o.w * 0.34;
    const st = stairs({ w: stW, height: baseY, steps: Math.max(3, Math.round(baseY / 0.9)), stepD: 1.5 });
    st.position.set(0, 0, -o.d / 2 - 2.4);
    g.add(st);
    return g;
  }

  function sideHall(o) {
    const g = new THREE.Group();
    const t = tier(o.tier);
    const prof = o.profile || detailProfile(o.tier, o);
    const base = terraceBase({ ...o, terrace: o.terrace !== false, rails: false });
    g.add(base.group);
    const baseY = base.height;
    g.add(body({ ...o, bodyH: t.body * 0.85, profile: prof }, baseY));
    const r = roof({ w: o.w + 3, d: o.d + 2.6, h: t.roof * 0.8, ridgeRatio: 0.72, profile: prof });
    r.position.y = baseY + t.body * 0.85 + 0.2;
    g.add(r);
    const st = stairs({ w: o.w * 0.4, height: baseY, steps: Math.max(2, Math.round(baseY / 0.9)), stepD: 1.3 });
    st.position.set(0, 0, -o.d / 2 - 2);
    g.add(st);
    return g;
  }

  function pavilion(o) {
    const g = new THREE.Group();
    const t = tier(o.tier);
    const prof = o.profile || detailProfile(o.tier, o);
    const w = o.w, d = o.d, side = o.bays || 3;
    const baseH = o.tier === 'royal' ? 2.2 : 1.4;
    g.add(boxAt(THREE, w + 5, baseH, d + 5, 0, baseH / 2, 0, M.stoneDark));
    g.add(boxAt(THREE, w + 3.4, 0.4, d + 3.4, 0, baseH + 0.1, 0, M.stone));
    const bodyH = t.body * 0.72;
    const cols = [];
    for (let i = 0; i <= side; i++) {
      const f = i / side - 0.5;
      cols.push({ x: f * w, y: baseH + bodyH / 2, z: -d / 2 });
      cols.push({ x: f * w, y: baseH + bodyH / 2, z: d / 2 });
      cols.push({ x: -w / 2, y: baseH + bodyH / 2, z: f * d });
      cols.push({ x: w / 2, y: baseH + bodyH / 2, z: f * d });
    }
    g.add(instanced(THREE, new THREE.CylinderGeometry(t.col * 0.85, t.col * 0.9, bodyH, t.colSeg || 8), M.wallRed, cols, t.shade));
    g.add(bandAt(w + 0.9, 0.45, d + 0.9, 0, baseH + bodyH - 0.3, 0, o.tier === 'minor' ? M.caihuaGreen : M.caihuaPainted));
    g.add(boxAt(THREE, w + 1.0, 0.24, d + 1.0, 0, baseH + bodyH, 0, M.ridge));
    g.add(dougongRow(THREE, M, { w: w + 1.0, d: d + 1.0, y: baseH + bodyH - 0.7, profile: prof, max: Math.round(prof.dougongMax * 0.7) }));
    const bench = railing([
      { x: 0, z: -d / 2 + 0.5, len: w - 1.6, axis: 'x' },
      { x: 0, z: d / 2 - 0.5, len: w - 1.6, axis: 'x' },
      { x: -w / 2 + 0.5, z: 0, len: d - 1.6, axis: 'z' },
      { x: w / 2 - 0.5, z: 0, len: d - 1.6, axis: 'z' }
    ], baseH + 0.4, { material: M.wood, panelMaterial: M.woodDark });
    g.add(bench);
    const r = roof({ w: w + 3.4, d: d + 3.4, h: t.roof * 0.95, ridgeRatio: 0.02, lift: R.lift * 1.1, profile: prof });
    r.position.y = baseH + bodyH + 0.3;
    g.add(r);
    return g;
  }

  function gateHall(o) {
    if (o.drum) {
      const g = new THREE.Group();
      const w = o.w + 16, d = o.d + 10, dh = 9.5;
      g.add(boxAt(THREE, w, dh, d, 0, dh / 2, 0, M.stoneSide));
      g.add(boxAt(THREE, w + 1.2, 0.7, d + 1.2, 0, dh + 0.35, 0, M.stoneDark));
      const merlons = [];
      const step = 5.6;
      const nx = Math.floor(w / step), nz = Math.floor(d / step);
      for (let i = 0; i <= nx; i++) {
        const x = -w / 2 + (i * w) / nx;
        merlons.push({ x, y: dh + 1.1, z: -d / 2 });
        merlons.push({ x, y: dh + 1.1, z: d / 2 });
      }
      for (let i = 1; i < nz; i++) {
        const z = -d / 2 + (i * d) / nz;
        merlons.push({ x: -w / 2, y: dh + 1.1, z });
        merlons.push({ x: w / 2, y: dh + 1.1, z });
      }
      g.add(instanced(THREE, new THREE.BoxGeometry(1.7, 1.5, 0.85), M.wallRed, merlons, true));
      g.add(boxAt(THREE, 13, 7.6, d + 1, 0, 3.8, 0, M.dark));
      const arch = cylAt(THREE, 6.4, 6.4, d + 1.2, 0, 6.2, 0, M.dark, 12);
      arch.rotation.x = Math.PI / 2;
      g.add(arch);
      const upper = hall({ ...o, kind: 'gateHall', drum: false, terrace: false, double: true, w: o.w, d: o.d, tier: o.tier });
      upper.position.y = dh + 0.7;
      g.add(upper);
      return g;
    }
    const g = new THREE.Group();
    const t = tier(o.tier);
    const prof = o.profile || detailProfile(o.tier, o);
    const base = terraceBase({ ...o, terrace: true, rails: false });
    g.add(base.group);
    const baseY = base.height;
    g.add(body({ ...o, kind: 'gateHall', profile: prof }, baseY));
    const r = roof({ w: o.w + 4, d: o.d + 3.4, h: t.roof * 0.9, ridgeRatio: 0.7, profile: prof });
    r.position.y = baseY + (o.bodyH || t.body) + 0.2;
    g.add(r);
    const st = stairs({ w: o.w * 0.4, height: baseY, steps: Math.max(2, Math.round(baseY / 0.9)), stepD: 1.4 });
    st.position.set(0, 0, -o.d / 2 - 2.2);
    g.add(st);
    return g;
  }

  function courtyardGate(o) {
    const g = new THREE.Group();
    const t = tier(o.tier);
    const prof = o.profile || detailProfile(o.tier, o);
    const baseH = 1.2;
    g.add(boxAt(THREE, o.w + 1.6, baseH, o.d + 1.6, 0, baseH / 2, 0, M.stoneDark));
    const bodyH = t.body * 0.6;
    const openW = o.w * 0.34;
    const openH = bodyH * 0.78;
    const pier = (o.w - openW) / 2;
    for (const sx of [-1, 1]) {
      g.add(boxAt(THREE, pier, bodyH, o.d, sx * (openW / 2 + pier / 2), baseH + bodyH / 2, 0, M.wallRed));
    }
    g.add(boxAt(THREE, openW + 0.6, bodyH - openH, o.d, 0, baseH + openH + (bodyH - openH) / 2, 0, M.wallRed));
    // 板门 + 门钉 + 门环，门洞开敞
    g.add(boxAt(THREE, openW * 0.96, openH * 0.98, 0.3, 0, baseH + openH / 2, -o.d / 2 + 0.2, M.woodDark));
    const studs = [];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        studs.push({ x: -openW * 0.3 + a * openW * 0.3, y: baseH + openH * 0.22 + b * openH * 0.26, z: -o.d / 2 + 0.4 });
      }
    }
    g.add(instanced(THREE, new THREE.SphereGeometry(0.12, 6, 5), M.ridge, studs, false));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 3, 6), M.ridge);
    ring.position.set(openW * 0.28, baseH + openH * 0.58, -o.d / 2 + 0.44);
    g.add(ring);
    const stub = (o.w + 10) * 0.5;
    g.add(boxAt(THREE, stub, bodyH * 0.9, 1.6, -stub / 2 - o.w / 2 + 1, baseH + bodyH * 0.45, 0, M.wallRed));
    g.add(boxAt(THREE, stub, bodyH * 0.9, 1.6, stub / 2 + o.w / 2 - 1, baseH + bodyH * 0.45, 0, M.wallRed));
    const r = roof({ w: o.w + 6, d: o.d + 2.4, h: t.roof * 0.62, ridgeRatio: 0.74, profile: prof });
    r.position.y = baseH + bodyH + 0.2;
    g.add(r);
    g.add(dougongRow(THREE, M, { w: o.w + 1.2, d: o.d + 0.8, y: baseH + bodyH - 0.55, profile: prof, max: 14 }));
    g.add(boxAt(THREE, 2.6, 1.0, 0.3, 0, baseH + bodyH - 0.5, -o.d / 2 - 0.7, M.plaque));
    return g;
  }

  function cornerTower(o) {
    const g = new THREE.Group();
    const w = o.w, d = o.d;
    const prof = o.profile || detailProfile(o.tier, o);
    const levels = [
      { scale: 1, h: 6.2, wall: M.wallRed },
      { scale: 0.84, h: 5.0, wall: M.wallRed },
      { scale: 0.68, h: 4.2, wall: M.wallRed }
    ];
    const winZ = [];
    const winX = [];
    let y = 0;
    levels.forEach((lv, i) => {
      const lw = w * lv.scale, ld = d * lv.scale;
      g.add(boxAt(THREE, lw, lv.h, ld, 0, y + lv.h / 2, 0, lv.wall));
      if (i === 0) g.add(boxAt(THREE, lw + 1.6, 0.8, ld + 1.6, 0, lv.h * 0.32, 0, M.stoneDark));
      const winH = 2.1;
      for (const sx of [-0.28, 0.28]) {
        winZ.push({ x: sx * lw, y: y + lv.h * 0.6, z: -ld / 2 });
        winZ.push({ x: sx * lw, y: y + lv.h * 0.6, z: ld / 2 });
        winX.push({ x: -lw / 2, y: y + lv.h * 0.6, z: sx * ld });
        winX.push({ x: lw / 2, y: y + lv.h * 0.6, z: sx * ld });
      }
      g.add(dougongRow(THREE, M, { w: lw + 1.4, d: ld + 1.4, y: y + lv.h - 0.55, profile: prof, max: 14 }));
      const r = roof({ w: lw + 6 - i * 1.4, d: ld + 6 - i * 1.4, h: 3.4 - i * 0.3, ridgeRatio: 0.05, lift: R.lift * 1.15, profile: prof });
      r.position.y = y + lv.h + 0.15;
      g.add(r);
      y += lv.h + 4.1 - i * 0.2;
    });
    const winGeoZ = new THREE.BoxGeometry(1.5, 2.1, 0.3);
    const winGeoX = new THREE.BoxGeometry(0.3, 2.1, 1.5);
    g.add(instanced(THREE, winGeoZ, M.dark, winZ, false));
    g.add(instanced(THREE, winGeoX, M.dark, winX, false));
    return g;
  }

  function corridor(o) {
    const g = new THREE.Group();
    const len = o.len, w = o.w || 4.6, h = o.h || 3.6;
    g.add(boxAt(THREE, len, 0.5, w + 1.2, 0, 0.25, 0, M.stoneDark));
    const cols = [];
    const n = Math.max(2, Math.round(len / 4));
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + (i * len) / n;
      cols.push({ x, y: 0.5 + h / 2, z: -w / 2 });
      cols.push({ x, y: 0.5 + h / 2, z: w / 2 });
    }
    g.add(instanced(THREE, new THREE.CylinderGeometry(0.32, 0.34, h, 8), M.wallRed, cols, false));
    g.add(boxAt(THREE, len, h * 0.62, 0.5, 0, 0.5 + h * 0.31, w / 2 + 0.1, M.wallRed));
    g.add(boxAt(THREE, len, 0.45, w + 1.0, 0, 0.5 + h - 0.2, 0, M.caihuaGreen));
    g.add(boxAt(THREE, len, 0.2, w + 1.1, 0, 0.5 + h, 0, M.ridge));
    const r = roof({ w: len, d: w + 1.5, h: 1.5, ridgeRatio: 0.97, segX: 26, segZ: 4 });
    r.position.y = 0.5 + h + 0.1;
    g.add(r);
    g.add(boxAt(THREE, len, 0.06, 0.14, 0, 0.5 + h + 0.62, -w * 0.35, M.roofGoldDark));
    g.add(boxAt(THREE, len, 0.06, 0.14, 0, 0.5 + h + 0.62, w * 0.35, M.roofGoldDark));
    return g;
  }

  function wallSeg(o) {
    const g = new THREE.Group();
    const h = o.h || config.CITY.wallH, t = o.t || config.CITY.wallT;
    const len = o.len;
    g.add(boxAt(THREE, len, h, t, 0, h / 2, 0, M.wallRed));
    g.add(boxAt(THREE, len + 0.8, 0.9, t + 2.6, 0, h + 0.1, 0, M.wallRedDark));
    g.add(boxAt(THREE, len + 1.2, 0.3, t + 3.0, 0, h + 0.6, 0, M.roofGoldDark));
    g.add(boxAt(THREE, len + 1.4, 0.5, 1.0, 0, h + 1.0, 0, M.ridge));
    for (const sz of [-1, 1]) {
      g.add(boxAt(THREE, len + 0.6, 0.08, 0.5, 0, h + 0.66, sz * (t + 1.1), M.roofGoldDark));
    }
    g.add(boxAt(THREE, len, 1.4, t + 0.6, 0, 0.7, 0, M.stoneDark));
    return g;
  }

  function bridge(o) {
    const g = new THREE.Group();
    const len = o.len || 46, w = o.w || 22;
    const segs = 7;
    const rise = o.rise ?? 2.2;
    for (let i = 0; i < segs; i++) {
      const t = (i + 0.5) / segs;
      const y = Math.sin(Math.PI * t) * rise;
      const segLen = len / segs + 0.4;
      const deck = boxAt(THREE, segLen, 0.9, w, 0, y - 0.45, 0, M.stone);
      deck.position.x = -len / 2 + (i + 0.5) * (len / segs);
      deck.rotation.z = Math.cos(Math.PI * t) * 0.16;
      g.add(deck);
    }
    for (const sz of [-1, 1]) {
      const rects = [{ x: 0, z: sz * (w / 2 - 0.4), len: len - 2, axis: 'x' }];
      const rail = railing(rects, 1.9, {});
      rail.position.y = 0;
      g.add(rail);
    }
    const piers = [];
    for (const px of [-0.28, 0.28]) piers.push({ x: px * len, y: -1.6, z: 0, sy: 3.2 });
    g.add(instanced(THREE, new THREE.BoxGeometry(6, 1, w * 0.9), M.stoneSide, piers, false));
    return g;
  }

  function interior(o) {
    const g = new THREE.Group();
    const w = o.w, d = o.d;
    g.add(boxAt(THREE, w, 0.3, d, 0, 0.15, 0, M.goldFloor));
    g.add(boxAt(THREE, w, 0.2, d, 0, 0.32, 0, M.dark));
    const cx = w * 0.42, cz = d * 0.38;
    const cols = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        cols.push({ x: sx * cx, y: 4.4, z: sz * cz });
        cols.push({ x: sx * cx * 0.55, y: 4.4, z: sz * cz });
      }
    }
    g.add(instanced(THREE, new THREE.CylinderGeometry(0.72, 0.78, 8.2, 10), M.wallRed, cols, false));
    const coil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.85, 0.1, 40, 6, 2, 3), M.ridge);
    coil.scale.set(0.35, 8.2 / 6, 0.35);
    coil.position.set(-cx, 4.4, -cz);
    g.add(coil);
    if (o.kind === 'chamber') {
      const bedY = 1.2;
      g.add(boxAt(THREE, w * 0.42, bedY, d * 0.42, 0, bedY / 2, d * 0.05, M.woodDark));
      g.add(boxAt(THREE, w * 0.4, 0.5, d * 0.4, 0, bedY + 0.25, d * 0.05, M.wallRed));
      for (const sx of [-1, 1]) {
        g.add(boxAt(THREE, 0.35, 4.6, 0.35, sx * w * 0.2, bedY + 2.3, d * 0.05 - d * 0.2, M.woodDark));
        g.add(boxAt(THREE, 0.35, 4.6, 0.35, sx * w * 0.2, bedY + 2.3, d * 0.05 + d * 0.2, M.woodDark));
      }
      g.add(boxAt(THREE, w * 0.42, 0.4, d * 0.42, 0, bedY + 4.6, d * 0.05, M.caihuaGreen));
      g.add(boxAt(THREE, w * 0.6, 5.4, 0.4, 0, 2.9, -d * 0.32, M.woodDark));
      for (const sx of [-1, 1]) {
        g.add(boxAt(THREE, 0.6, 3.4, 0.6, sx * w * 0.36, 1.9, -d * 0.12, M.wood));
        g.add(boxAt(THREE, 3.2, 2.0, 0.3, sx * (w * 0.36 - 1.9), 2.6, -d * 0.28, M.woodDark));
      }
      g.add(boxAt(THREE, w * 0.3, 1.2, d * 0.24, 0, 0.9, d * 0.3, M.wood));
    } else {
      g.add(boxAt(THREE, w * 0.5, 1.1, d * 0.28, 0, 0.85, d * 0.1, M.stoneDark));
      g.add(boxAt(THREE, w * 0.28, 1.5, d * 0.2, 0, 2.15, d * 0.1, M.ridge));
      g.add(boxAt(THREE, w * 0.12, 1.2, d * 0.14, 0, 3.5, d * 0.16, M.woodDark));
      g.add(boxAt(THREE, w * 0.62, 5.6, 0.5, 0, 3.0, -d * 0.34, M.woodDark));
      g.add(boxAt(THREE, w * 0.6, 5.0, 0.28, 0, 2.9, -d * 0.3, M.wallRed));
      for (const sx of [-1, 1]) {
        g.add(boxAt(THREE, 0.35, 2.0, 0.35, sx * w * 0.2, 1.9, -d * 0.18, M.ridge));
      }
    }
    for (const sx of [-1, 1]) {
      g.add(boxAt(THREE, 0.6, 9.2, d, sx * (w / 2 - 0.3), 4.6, 0, M.innerWall));
    }
    for (const sz of [-1, 1]) {
      g.add(boxAt(THREE, w, 9.2, 0.6, 0, 4.6, sz * (d / 2 - 0.3), M.innerWall));
    }
    g.add(boxAt(THREE, w + 1, 0.5, d + 1, 0, 9.3, 0, M.dark));
    const ceilY = 8.6;
    for (let i = 0; i < 4; i++) {
      const s = 1 - i * 0.22;
      g.add(boxAt(THREE, w * s * 0.6, 0.42, d * s * 0.6, 0, ceilY - i * 0.42, 0, i % 2 ? M.caihuaGreen : M.ridge));
    }
    g.add(boxAt(THREE, w * 0.28, 0.5, d * 0.28, 0, ceilY - 1.85, 0, M.ridge));
    const lamps = [];
    for (const sx of [-1, 1]) lamps.push({ x: sx * w * 0.3, y: 6.4, z: d * 0.18 });
    g.add(instanced(THREE, new THREE.SphereGeometry(0.55, 10, 8), M.lanternRed, lamps, false));
    return g;
  }

  function tree(kind, x, z, s = 1) {
    if (kind === 'willow') {
      const w = willowTree(THREE, M, { s, strands: 20 });
      w.position.set(x, 0, z);
      return w;
    }
    const g = new THREE.Group();
    const h = (kind === 'pine' ? 11 : 9.5) * s;
    g.add(cylAt(THREE, 0.5 * s, 0.62 * s, h * 0.5, 0, h * 0.25, 0, M.trunk, 7));
    if (kind === 'pine') {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry((3.4 - i * 0.8) * s, (4.6 - i * 0.7) * s, 7), M.treeA);
        c.position.y = h * (0.42 + i * 0.2);
        g.add(c);
      }
    } else {
      const blobs = [[0, 0.62, 3.5], [-1.6, 0.5, 2.5], [1.5, 0.52, 2.6], [0.2, 0.78, 2.4]];
      blobs.forEach(([bx, by, br], i) => {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(br * s, 0), i % 2 ? M.treeB : M.treeA);
        b.position.set(bx * s, h * by, (i % 2 ? 1 : -1) * 0.8 * s);
        g.add(b);
      });
    }
    g.position.set(x, 0, z);
    return g;
  }

  function treeCluster(list, kind) {
    const g = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.62, 5.5, 7);
    const trunks = [];
    if (kind === 'willow') {
      const blobsA = [];
      const blobsB = [];
      const strands = [];
      list.forEach((t) => {
        const s = t.s ?? 1;
        const h = 9 * s;
        const rot = t.r || 0;
        trunks.push({ x: t.x, z: t.z, y: h * 0.25, sx: s, sy: s, sz: s });
        blobsA.push({ x: t.x, y: h * 0.6, z: t.z, s: 2.6 * s, ry: rot });
        blobsB.push({ x: t.x - 1.3 * s, y: h * 0.56, z: t.z + 0.7 * s, s: 1.7 * s, ry: rot + 0.6 });
        blobsB.push({ x: t.x + 1.3 * s, y: h * 0.57, z: t.z - 0.7 * s, s: 1.8 * s, ry: rot + 1.2 });
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + (i % 2) * 0.14 + rot;
          const r = (1.7 + (i % 3) * 0.35) * s;
          strands.push({
            x: t.x + Math.cos(a) * r,
            y: h * 0.52,
            z: t.z + Math.sin(a) * r,
            rx: Math.sin(a) * 0.2,
            rz: Math.cos(a) * 0.2
          });
        }
      });
      g.add(instanced(THREE, trunkGeo, M.trunk, trunks, false));
      g.add(instanced(THREE, new THREE.IcosahedronGeometry(1, 0), M.treeA, blobsA, false));
      g.add(instanced(THREE, new THREE.IcosahedronGeometry(0.8, 0), M.treeB, blobsB, false));
      g.add(instanced(THREE, new THREE.CylinderGeometry(0.045, 0.02, 2.8, 4), M.treeB, strands, false));
      return g;
    }
    const pineGeos = [];
    const pineA = new THREE.ConeGeometry(3.4, 4.6, 7);
    const pineB = new THREE.ConeGeometry(2.6, 3.9, 7);
    const pineC = new THREE.ConeGeometry(1.8, 3.2, 7);
    const blobGeo = new THREE.IcosahedronGeometry(1, 0);
    const blobsA = [];
    const blobsB = [];
    list.forEach((t) => {
      const s = t.s ?? 1;
      trunks.push({ x: t.x, z: t.z, sx: s, sy: s * (kind === 'pine' ? 1 : 0.9), sz: s });
      if (kind === 'pine') {
        pineGeos.push(
          { x: t.x, y: 4.8 * s, z: t.z, s: s, geo: pineA },
          { x: t.x, y: 7.0 * s, z: t.z, s: s, geo: pineB },
          { x: t.x, y: 9.1 * s, z: t.z, s: s, geo: pineC }
        );
      } else {
        const rot = t.r || 0;
        blobsA.push({ x: t.x, y: 6.2 * s, z: t.z, s: 3.5 * s, ry: rot });
        blobsB.push({ x: t.x - 1.6 * s, y: 5.2 * s, z: t.z + 0.8 * s, s: 2.5 * s, ry: rot + 0.5 });
        blobsB.push({ x: t.x + 1.5 * s, y: 5.4 * s, z: t.z - 0.8 * s, s: 2.6 * s, ry: rot + 1.1 });
      }
    });
    g.add(instanced(THREE, trunkGeo, M.trunk, trunks, false));
    if (kind === 'pine') {
      for (const geo of [pineA, pineB, pineC]) {
        const items = pineGeos.filter((p) => p.geo === geo);
        if (items.length) g.add(instanced(THREE, geo, M.treeA, items, false));
      }
    } else {
      g.add(instanced(THREE, blobGeo, M.treeA, blobsA, false));
      g.add(instanced(THREE, blobGeo, M.treeB, blobsB, false));
    }
    return g;
  }

  function props(o) {
    switch (o.kind) {
      case 'rock': {
        const geo = new THREE.DodecahedronGeometry(1, 0);
        return instanced(THREE, geo, M.rock, o.list.map((r) => ({ x: r.x, y: (r.s ?? 1) * 0.6, z: r.z, s: r.s ?? 1, ry: r.r ?? 0, sy: (r.s ?? 1) * 0.75 })), false);
      }
      case 'lantern': {
        const g = new THREE.Group();
        const list = o.list;
        const baseGeo = new THREE.BoxGeometry(1.1, 0.4, 1.1);
        const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.6, 8);
        const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const capGeo = new THREE.ConeGeometry(0.8, 0.7, 4);
        g.add(instanced(THREE, baseGeo, M.stoneSide, list.map((p) => ({ x: p.x, y: 0.2, z: p.z })), false));
        g.add(instanced(THREE, postGeo, M.stoneSide, list.map((p) => ({ x: p.x, y: 1.2, z: p.z })), false));
        g.add(instanced(THREE, boxGeo, M.lanternRed, list.map((p) => ({ x: p.x, y: 2.3, z: p.z })), false));
        g.add(instanced(THREE, capGeo, M.stoneSide, list.map((p) => ({ x: p.x, y: 3.05, z: p.z, ry: Math.PI / 4 })), false));
        g.userData.lightAnchors = list.map((p, i) => ({
          id: p.id || `${o.id || 'lantern'}.${i}`,
          type: 'lantern',
          position: [p.x, 2.3, p.z],
          color: 0xffb46b,
          intensity: 5
        }));
        return g;
      }
      case 'censer':
        return censerProps(THREE, M, o);
      case 'stoneLamp':
        return stoneLamp(THREE, M, o);
      case 'rockery':
        return rockery(THREE, M, o);
      case 'stoneRail':
        return railing((o.list || []).map((r) => ({ x: r.x, z: r.z, len: r.len, axis: r.axis })), o.y || 0, { material: M.stone, panelMaterial: M.stoneDark });
      case 'path': {
        const g = new THREE.Group();
        for (const r of o.rects || []) g.add(slabRect({ kind: 'path', ...r }));
        return g;
      }
      case 'lion': {
        const g = new THREE.Group();
        const [x, z, ry = 0] = o.at;
        const base = boxAt(THREE, 2.2, 1.6, 1.6, 0, 0.8, 0, M.stoneDark);
        const bodyM = boxAt(THREE, 1.3, 1.1, 2.0, 0, 2.0, 0, M.stoneSide);
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), M.stoneSide);
        head.position.set(0, 2.9, -0.7);
        const mane = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), M.stoneDark);
        mane.position.set(0, 2.85, -0.45);
        g.add(base, bodyM, head, mane);
        g.position.set(x, 0, z);
        g.rotation.y = ry;
        return g;
      }
      case 'banner': {
        const g = new THREE.Group();
        const [x, z] = o.at;
        g.add(cylAt(THREE, 0.16, 0.18, 9, 0, 4.5, 0, M.woodDark, 6));
        const cloth = boxAt(THREE, 0.16, 4.4, 1.5, 0, 6.4, 0.85, M.wallRed);
        g.add(cloth);
        g.add(boxAt(THREE, 0.3, 0.7, 1.7, 0, 8.85, 0.85, M.ridge));
        g.position.set(x, 0, z);
        g.rotation.y = o.ry || 0;
        return g;
      }
      case 'pond': {
        const g = new THREE.Group();
        const seg = 22;
        const pts = [];
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          const r = o.r * (0.88 + 0.12 * Math.sin(a * 3 + (o.seed || 0)));
          pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
        }
        const shape = new THREE.Shape(pts);
        const geo = new THREE.ShapeGeometry(shape, 12);
        geo.rotateX(-Math.PI / 2);
        const water = new THREE.Mesh(geo, M.water);
        water.position.set(o.x, 0.32, o.z);
        water.receiveShadow = true;
        g.add(water);
        const rim = [];
        const rocks = Math.max(10, Math.round(o.r / 2.2));
        for (let i = 0; i < rocks; i++) {
          const a = (i / rocks) * Math.PI * 2;
          const r = o.r * (0.94 + 0.1 * Math.sin(a * 3 + (o.seed || 0)));
          rim.push({ x: o.x + Math.cos(a) * r, y: 0.42, z: o.z + Math.sin(a) * r, s: 0.9 + 0.5 * Math.abs(Math.sin(a * 5)), ry: a });
        }
        g.add(instanced(THREE, new THREE.IcosahedronGeometry(0.9, 0), M.rock, rim, false));
        return g;
      }
      default:
        return new THREE.Group();
    }
  }

  function slabRect(o) {
    const mat = o.kind === 'axis' || o.kind === 'plaza' ? M.pavingWarm : o.kind === 'court' ? M.paving : M.pavingWarm;
    const g = new THREE.Group();
    const base = boxAt(THREE, o.w, 0.24, o.d, o.x, 0.005, o.z, mat);
    base.receiveShadow = true;
    base.castShadow = false;
    g.add(base);
    if (o.kind === 'axis' || o.kind === 'plaza') {
      g.add(boxAt(THREE, o.w * 0.42, 0.06, o.d, o.x, 0.16, o.z, M.stoneDark));
    }
    if (o.plan !== false) g.add(pavingPattern(THREE, M, o));
    return g;
  }

  function building(slot, opts = {}) {
    const t = tier(slot.tier);
    let group;
    switch (slot.kind) {
      case 'gateHall': group = gateHall(slot); break;
      case 'sideHall': group = sideHall(slot); break;
      case 'pavilion': group = pavilion(slot); break;
      case 'cornerTower': group = cornerTower(slot); break;
      case 'courtyardGate': group = courtyardGate(slot); break;
      case 'wall': group = wallSeg(slot); break;
      case 'corridor': group = corridor(slot); break;
      case 'bridge': group = bridge(slot); break;
      case 'hall':
      default: group = hall(slot);
    }
    if (slot.kind === 'gateHall' && slot.drum) group = gateHall(slot);
    const merged = mergeByMaterial(THREE, group, { name: slot.id, castShadow: t.shade && opts.castShadow !== false });
    merged.position.set(slot.x, 0, slot.z);
    merged.rotation.y = ((slot.rot || 0) * Math.PI) / 180;
    merged.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(merged);
    const height = bbox.max.y;
    return { group: merged, bounds: bbox, height };
  }

  function mergeStatic(root) {
    const merged = mergeByMaterial(THREE, root, { name: root.name });
    root.clear();
    for (const child of Array.from(merged.children)) root.add(child);
    return root;
  }

  return {
    THREE, materials: M, tier, roof, hall, sideHall, pavilion, gateHall, courtyardGate,
    cornerTower, corridor, wall: wallSeg, bridge, stairs, terraceBase, interior, railing,
    instanced, tree, treeCluster, props, slabRect, building, mergeStatic, mergeByMaterial: (g, o) => mergeByMaterial(THREE, g, o), boxAt: (w, h, d, x, y, z, m) => boxAt(THREE, w, h, d, x, y, z, m), cylAt: (rt, rb, h, x, y, z, m, s) => cylAt(THREE, rt, rb, h, x, y, z, m, s),
    registry
  };
}
