import { CITY, FP } from '../shared/config.js';

const rotY = (deg) => ((deg || 0) * Math.PI) / 180;
const facing = (deg) => {
  const a = rotY(deg);
  return [Math.sin(a), -Math.cos(a)];
};

function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 0.01) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

function makeWallRun(kit, obstacles) {
  return (axis, fixed, from, to, gaps, opts) => {
    const h = (opts && opts.h) ?? CITY.wallH * 0.62;
    const t = (opts && opts.t) ?? 1.8;
    const merged = mergeRanges(gaps.filter((g) => g[1] > from && g[0] < to));
    const group = new kit.THREE.Group();
    let cursor = from;
    const push = (a, b) => {
      if (b - a < 6) return;
      const len = b - a;
      const mid = (a + b) / 2;
      const x = axis === 'x' ? mid : fixed;
      const z = axis === 'x' ? fixed : mid;
      const seg = kit.wall({ x: 0, z: 0, len, axis, h });
      seg.position.set(x, 0, z);
      group.add(seg);
      if (axis === 'x') obstacles.push({ min: [a, 0, fixed - t], max: [b, h + 0.6, fixed + t] });
      else obstacles.push({ min: [fixed - t, 0, a], max: [fixed + t, h + 0.6, b] });
    };
    for (const g of merged) {
      if (g[0] > cursor) push(cursor, g[0]);
      cursor = Math.max(cursor, g[1]);
    }
    if (cursor < to) push(cursor, to);
    return group;
  };
}

function roadGaps(roads, axis, fixed, from, to, margin = 5) {
  const gaps = [];
  for (const r of roads) {
    if (axis === 'x') {
      const zNear = Math.abs(r.z - fixed) <= r.d / 2 + 3;
      if (!zNear) continue;
      const a = Math.max(from, r.x - r.w / 2 - margin);
      const b = Math.min(to, r.x + r.w / 2 + margin);
      if (b > a) gaps.push([a, b]);
    } else {
      const xNear = Math.abs(r.x - fixed) <= r.w / 2 + 3;
      if (!xNear) continue;
      const a = Math.max(from, r.z - r.d / 2 - margin);
      const b = Math.min(to, r.z + r.d / 2 + margin);
      if (b > a) gaps.push([a, b]);
    }
  }
  return gaps;
}

function insideRect(x, z, r, pad = 0) {
  return x >= r.x - r.w / 2 - pad && x <= r.x + r.w / 2 + pad && z >= r.z - r.d / 2 - pad && z <= r.z + r.d / 2 + pad;
}

function platformHeight(slot, tier) {
  if (slot.tier === 'royal' && slot.kind === 'hall' && slot.terrace) return tier.terrace;
  if (slot.tier === 'major' && (slot.kind === 'hall' || slot.visitable) && slot.terrace) return tier.terrace;
  if (slot.kind === 'cornerTower') return 1.6;
  if (slot.kind === 'pavilion') return slot.tier === 'royal' ? 2.6 : 1.8;
  if (slot.kind === 'gateHall') return slot.drum ? 1.8 : tier.terrace;
  if (slot.kind === 'courtyardGate') return 1.2;
  if (slot.kind === 'hall' || slot.kind === 'sideHall') return 0.9;
  return 0;
}

function platformSpec(slot, tier) {
  const mk = (tiers, total, wPad = 2.4, dPad = 2.4) => {
    const per = total / tiers;
    const out = [];
    for (let i = 0; i < tiers; i++) {
      const pad = tiers > 1 ? 5.5 * (tiers - i - 1) + 2.4 : 2.4;
      out.push({ hw: slot.w / 2 + (tiers > 1 ? pad : wPad), hd: slot.d / 2 + (tiers > 1 ? pad : dPad), y: per * (i + 1) });
    }
    return out;
  };
  switch (slot.kind) {
    case 'hall':
      return slot.terrace
        ? { tiers: mk(tier.tiers, tier.terrace), total: tier.terrace, stairs: true }
        : { tiers: mk(1, 0.9), total: 0.9, stairs: true };
    case 'sideHall':
      return { tiers: mk(1, tier.terrace), total: tier.terrace, stairs: true };
    case 'gateHall':
      return slot.drum ? null : { tiers: mk(1, tier.terrace), total: tier.terrace, stairs: true, passThrough: true };
    case 'courtyardGate':
      return { tiers: null, total: 1.2, stairs: false, passThrough: true, wPad: 0.8, dPad: 0.8 };
    case 'pavilion': {
      const total = slot.tier === 'royal' ? 2.2 : 1.4;
      return { tiers: mk(1, total, 2.5, 2.5), total, stairs: true };
    }
    default:
      return null;
  }
}

function pushTierSurfaces(slot, dir, t, isTop, stairsHalf, surfaces) {
  const x0 = slot.x - t.hw;
  const x1 = slot.x + t.hw;
  const z0 = slot.z - t.hd;
  const z1 = slot.z + t.hd;
  const push = (ax0, az0, ax1, az1, tag) => {
    if (ax1 - ax0 < 0.05 || az1 - az0 < 0.05) return;
    surfaces.push({ id: slot.id + '.tier' + t.y + tag, min: [ax0, 0, az0], max: [ax1, 0, az1], y: t.y, kind: isTop ? 'terrace' : 'ground' });
  };
  if (isTop) {
    push(x0, z0, x1, z1, '');
    return;
  }
  if (dir[1] < 0) {
    const zp = slot.z - slot.d / 2 - 2.4;
    push(x0, zp, x1, z1, '.back');
    push(x0, z0, slot.x - stairsHalf, zp, '.l');
    push(slot.x + stairsHalf, z0, x1, zp, '.r');
  } else if (dir[1] > 0) {
    const zp = slot.z + slot.d / 2 + 2.4;
    push(x0, z0, x1, zp, '.back');
    push(x0, zp, slot.x - stairsHalf, z1, '.l');
    push(slot.x + stairsHalf, zp, x1, z1, '.r');
  } else if (dir[0] < 0) {
    const xp = slot.x - slot.d / 2 - 2.4;
    push(xp, z0, x1, z1, '.back');
    push(x0, z0, xp, slot.z - stairsHalf, '.l');
    push(x0, slot.z + stairsHalf, xp, z1, '.r');
  } else {
    const xp = slot.x + slot.d / 2 + 2.4;
    push(x0, z0, xp, z1, '.back');
    push(xp, z0, x1, slot.z - stairsHalf, '.l');
    push(xp, slot.z + stairsHalf, x1, z1, '.r');
  }
}

export async function buildZone(ctx, opt = {}) {
  const { THREE, kit, config, layout, zone, slots, corridors, roads, rng } = ctx;
  const rnd = rng('zone.' + zone.id);
  const root = new THREE.Group();
  root.name = 'zone-' + zone.id;
  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];

  for (const r of roads) root.add(kit.slabRect({ kind: r.kind, ...r }));
  for (const cor of corridors) {
    const g = kit.corridor({ x: 0, z: 0, len: cor.len, w: 4.6, h: 3.6 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
    const half = cor.len / 2;
    if (cor.axis === 'z') obstacles.push({ min: [cor.x - 2.4, 0, cor.z - half], max: [cor.x + 2.4, 3.4, cor.z + half] });
    else obstacles.push({ min: [cor.x - half, 0, cor.z - 2.4], max: [cor.x + half, 3.4, cor.z + 2.4] });
  }

  const courts = layout.COURTYARDS.filter((c) => c.zone === zone.id);
  if (opt.courtyardWalls !== false) {
    for (const c of courts) {
      const gapsX = roadGaps(roads, 'x', c.minZ, c.minX, c.maxX).concat(roadGaps(roads, 'x', c.maxZ, c.minX, c.maxX));
      const gapsZ = roadGaps(roads, 'z', c.minX, c.minZ, c.maxZ).concat(roadGaps(roads, 'z', c.maxX, c.minZ, c.maxZ));
      root.add(makeWallRun(kit, obstacles)('x', c.minZ, c.minX, c.maxX, gapsX, { h: opt.courtWallH ?? 6.5 }));
      root.add(makeWallRun(kit, obstacles)('x', c.maxZ, c.minX, c.maxX, gapsX, { h: opt.courtWallH ?? 6.5 }));
      root.add(makeWallRun(kit, obstacles)('z', c.minX, c.minZ, c.maxZ, gapsZ, { h: opt.courtWallH ?? 6.5 }));
      root.add(makeWallRun(kit, obstacles)('z', c.maxX, c.minZ, c.maxZ, gapsZ, { h: opt.courtWallH ?? 6.5 }));
    }
  }

  const pondList = layout.PONDS.filter((p) => p.x > zone.minX - 60 && p.x < zone.maxX + 60 && p.z > zone.minZ - 60 && p.z < zone.maxZ + 60);
  for (const p of pondList) {
    root.add(kit.props({ kind: 'pond', x: p.x, z: p.z, r: p.r, seed: rnd() * 6 }));
    surfaces.push({ id: `${zone.id}.pond.${p.x}_${p.z}`, min: [p.x - p.r, 0, p.z - p.r], max: [p.x + p.r, 0, p.z + p.r], y: 0.35, kind: 'water' });
  }

  for (const slot of slots) {
    const res = kit.building(slot);
    root.add(res.group);
    const tier = kit.tier(slot.tier);
    const platY = platformHeight(slot, tier);
    const bb = res.bounds;
    const dir = facing(slot.rot);
  
    if (slot.visitable) {
      const kind = opt.interiorKind ? opt.interiorKind(slot) : (slot.tier === 'royal' ? 'throne' : 'chamber');
      const inner = kit.interior({ kind, x: 0, z: 0, w: slot.w - 8, d: slot.d - 8 });
      inner.position.set(slot.x, platY, slot.z);
      inner.rotation.y = rotY(slot.rot);
      root.add(inner);
      surfaces.push({
        id: `${slot.id}.floor`,
        min: [slot.x - slot.w / 2 + 4, 0, slot.z - slot.d / 2 + 4],
        max: [slot.x + slot.w / 2 - 4, 0, slot.z + slot.d / 2 - 4],
        y: platY + 0.32,
        kind: 'interior'
      });
      const doorHalf = (slot.w * 0.34) / 2;
      const thick = 1.1;
      const back = [-dir[1], dir[0]];
      const bo = [slot.x + back[0] * slot.w * 0.41, slot.z + back[1] * slot.w * 0.41];
      const bh = slot.w * 0.07;
      const bx = [Math.abs(dir[0]) * (slot.d / 2 + thick) + Math.abs(back[0]) * bh, Math.abs(dir[1]) * (slot.d / 2 + thick) + Math.abs(back[1]) * bh];
      const b0 = [slot.x - back[0] * slot.w * 0.5, slot.z - back[1] * slot.w * 0.5];
      const b1 = [slot.x + back[0] * slot.w * 0.5, slot.z + back[1] * slot.w * 0.5];
      obstacles.push({ min: [Math.min(b0[0], bo[0] - bx[0]), 0, Math.min(b0[1], bo[1] - bx[1])], max: [bo[0] - bx[0], platY + 13, bo[1] + bx[1]] });
      obstacles.push({ min: [bo[0] + bx[0], 0, bo[1] - bx[1]], max: [Math.max(b1[0], bo[0] + bx[0]), platY + 13, Math.max(b1[1], bo[1] + bx[1])] });
      obstacles.push({ min: [slot.x - slot.w / 2 - thick, 0, slot.z - slot.d / 2], max: [slot.x - slot.w / 2 + thick, platY + 13, slot.z + slot.d / 2] });
      obstacles.push({ min: [slot.x + slot.w / 2 - thick, 0, slot.z - slot.d / 2], max: [slot.x + slot.w / 2 + thick, platY + 13, slot.z + slot.d / 2] });
      obstacles.push({ min: [slot.x - slot.w / 2, 0, slot.z - slot.d / 2 - thick], max: [slot.x - doorHalf, platY + 13, slot.z - slot.d / 2 + thick] });
      obstacles.push({ min: [slot.x + doorHalf, 0, slot.z - slot.d / 2 - thick], max: [slot.x + slot.w / 2, platY + 13, slot.z - slot.d / 2 + thick] });
    } else {
      obstacles.push({ min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    }

    const spec = platformSpec(slot, tier);
    const passThrough = !!(spec && spec.passThrough);
    if (passThrough) {
      const perp = [-dir[1], dir[0]];
      const doorHalf = (slot.w * 0.34) / 2;
      const half = doorHalf + 1.2;
      const depth = slot.d / 2 + 3;
      const along = [Math.abs(dir[0]) * depth, Math.abs(dir[1]) * depth];
      const side = [Math.abs(perp[0]) * half, Math.abs(perp[1]) * half];
      surfaces.push({
        id: slot.id + '.passage',
        min: [slot.x - along[0] - side[0], 0, slot.z - along[1] - side[1]],
        max: [slot.x + along[0] + side[0], 0, slot.z + along[1] + side[1]],
        y: 0,
        kind: 'ground'
      });
      const cx2 = (slot.w / 2 + doorHalf) / 2;
      const sx2 = (slot.w / 2 - doorHalf) / 2;
      const top = bb.max.y * 0.9;
      for (const sg of [-1, 1]) {
        const ox = slot.x + perp[0] * sg * cx2;
        const oz = slot.z + perp[1] * sg * cx2;
        const ex = Math.abs(dir[0]) * (slot.d / 2 + 1) + Math.abs(perp[0]) * sx2;
        const ez = Math.abs(dir[1]) * (slot.d / 2 + 1) + Math.abs(perp[1]) * sx2;
        obstacles.push({ min: [ox - ex, 0, oz - ez], max: [ox + ex, top, oz + ez] });
      }
    } else if (spec && spec.total > 0.2) {
      const list = spec.tiers || [{ hw: slot.w / 2 + (spec.wPad || 2.4), hd: slot.d / 2 + (spec.dPad || 2.4), y: spec.total }];
      const topY = spec.total;
      const stairsHalf = slot.w * 0.2;
      list.forEach((t) => pushTierSurfaces(slot, dir, t, Math.abs(t.y - topY) < 0.01, stairsHalf, surfaces));
      if (spec.stairs) {
        const steps = Math.max(3, Math.ceil(spec.total / 0.5));
        const stepH = spec.total / steps;
        const stepD = 0.9;
        const halfW = slot.w * 0.2;
        for (let i = 0; i < steps; i++) {
          const y = stepH * (i + 1);
          const off = (steps - 1 - i) * stepD;
          const cx = slot.x + dir[0] * (slot.d / 2 + 2.4 + off);
          const cz = slot.z + dir[1] * (slot.d / 2 + 2.4 + off);
          const w = dir[0] !== 0 ? stepD : halfW * 2;
          const d = dir[1] !== 0 ? stepD : halfW * 2;
          surfaces.push({ id: slot.id + '.step' + i, min: [cx - w / 2, 0, cz - d / 2], max: [cx + w / 2, 0, cz + d / 2], y, kind: 'stairs' });
        }
      }
    }
    if (slot.drum) {
      obstacles.push({ min: [bb.min.x, 0, bb.min.z], max: [bb.min.x + 6, 10, bb.max.z] });
      obstacles.push({ min: [bb.max.x - 6, 0, bb.min.z], max: [bb.max.x, 10, bb.max.z] });
      surfaces.push({ id: `${slot.id}.tunnel`, min: [slot.x - 7, 0, slot.z - 8], max: [slot.x + 7, 0, slot.z + 8], y: 0, kind: 'ground' });
    }

    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: zone.id,
      rot: slot.rot || 0,
      visitable: !!slot.visitable,
      info: slot.info || '',
      entrance: [slot.x + dir[0] * (slot.d / 2 + 6), platY, slot.z + dir[1] * (slot.d / 2 + 6)],
      bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }
    });

    if (slot.kind === 'hall' || slot.kind === 'gateHall' || slot.kind === 'pavilion' || slot.kind === 'cornerTower') {
      lightAnchors.push({ id: `${slot.id}.lamp`, type: 'lantern', position: [slot.x, platY + (bb.max.y - bb.min.y) * 0.45, slot.z], color: 0xffb46b, intensity: 6 });
    }
    if (slot.kind === 'hall' || slot.kind === 'gateHall') {
      const c = kit.props({ kind: 'censer', x: slot.x + dir[0] * (slot.d / 2 + 7), z: slot.z + dir[1] * (slot.d / 2 + 7), id: `${slot.id}.censer` });
      root.add(c);
      for (const a of c.userData.lightAnchors || []) lightAnchors.push({ ...a, id: `${slot.id}.${a.id}` });
    }
    if (slot.kind === 'gateHall' || slot.kind === 'courtyardGate') {
      const perp = [-dir[1], dir[0]];
      for (const sg of [-1, 1]) {
        const lx = slot.x + dir[0] * (slot.d / 2 + 5) + perp[0] * sg * (slot.w / 2 + 4);
        const lz = slot.z + dir[1] * (slot.d / 2 + 5) + perp[1] * sg * (slot.w / 2 + 4);
        root.add(kit.props({ kind: 'lion', at: [lx, lz, rotY(slot.rot) + (sg > 0 ? -0.2 : 0.2)] }));
      }
    }
  }

  const themeTrees = opt.trees || { pine: 0.45, broad: 0.4, willow: 0.15 };
  const treeCfg = layout.TREES[zone.id];
  if (treeCfg && treeCfg.count > 0) {
    const kinds = ['pine', 'broad', 'willow'];
    const weights = [themeTrees.pine, themeTrees.broad, themeTrees.willow];
    const buckets = { pine: [], broad: [], willow: [] };
    let placed = 0;
    let guard = 0;
    while (placed < treeCfg.count && guard < treeCfg.count * 40) {
      guard++;
      const area = treeCfg.areas[Math.floor(rnd() * treeCfg.areas.length)] || treeCfg.areas[0];
      if (!area) break;
      const x = area.x - area.w / 2 + rnd() * area.w;
      const z = area.z - area.d / 2 + rnd() * area.d;
      if (x < zone.minX + 4 || x > zone.maxX - 4 || z < zone.minZ + 4 || z > zone.maxZ - 4) continue;
      let bad = roads.some((r) => insideRect(x, z, r, 3));
      if (!bad) bad = pondList.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 5) ** 2);
      if (!bad) {
        for (const o of obstacles) {
          if (x > o.min[0] - 6 && x < o.max[0] + 6 && z > o.min[2] - 6 && z < o.max[2] + 6) { bad = true; break; }
        }
      }
      if (bad) continue;
      let pick = 'pine';
      const r = rnd();
      let acc = weights[0];
      if (r > acc) { pick = 'broad'; acc += weights[1]; }
      if (r > acc) pick = 'willow';
      buckets[pick].push({ x, z, s: 0.75 + rnd() * 0.6, r: rnd() * Math.PI * 2 });
      placed++;
    }
    for (const k of kinds) {
      if (buckets[k].length) root.add(kit.treeCluster(buckets[k], k));
    }
  }

  if (opt.rockeries) {
    const list = [];
    for (let i = 0; i < opt.rockeries; i++) {
      list.push({ x: zone.minX + 20 + rnd() * (zone.maxX - zone.minX - 40), z: zone.minZ + 20 + rnd() * (zone.maxZ - zone.minZ - 40), s: 1.6 + rnd() * 2.4, r: rnd() * 3 });
    }
    root.add(kit.props({ kind: 'rockery', list }));
  }

  if (opt.stoneLamps !== false) {
    const lamps = [];
    const axisRoads = roads.filter((r) => r.kind === 'axis' || r.kind === 'plaza' || r.kind === 'court');
    for (const r of axisRoads) {
      if (r.kind === 'axis') {
        for (let z = r.z - r.d / 2 + 30; z < r.z + r.d / 2 - 30; z += 46) {
          lamps.push({ x: r.x - r.w / 2 - 4, z, id: `${zone.id}.lamp.w.${Math.round(z)}` });
          lamps.push({ x: r.x + r.w / 2 + 4, z, id: `${zone.id}.lamp.e.${Math.round(z)}` });
        }
      } else if (r.kind === 'court') {
        lamps.push({ x: r.x - r.w / 2 + 18, z: r.z - r.d / 2 - 4, id: `${zone.id}.lamp.c1.${Math.round(r.z)}` });
        lamps.push({ x: r.x + r.w / 2 - 18, z: r.z + r.d / 2 + 4, id: `${zone.id}.lamp.c2.${Math.round(r.z)}` });
      }
    }
    if (lamps.length) {
      const g = kit.props({ kind: 'stoneLamp', list: lamps });
      root.add(g);
      for (const a of g.userData.lightAnchors || []) lightAnchors.push(a);
    }
  }

  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
  }

  surfaces.push({ id: `ground.${zone.id}`, min: [zone.minX, 0, zone.minZ], max: [zone.maxX, 0, zone.maxZ], y: 0, kind: 'ground' });

  const zoneView = (config.ZONE_VIEWS[`zone.${zone.id}`]) || {
    position: [zone.minX + (zone.maxX - zone.minX) * 0.5, 150, zone.minZ - 240],
    target: [zone.minX + (zone.maxX - zone.minX) * 0.5, 10, zone.minZ + (zone.maxZ - zone.minZ) * 0.4]
  };
  viewpoints.push({ id: `zone.${zone.id}`, name: zone.name, mode: 'zone', position: zoneView.position, target: zoneView.target, fov: zoneView.fov || 42 });
  const visitable = slots.filter((s) => s.visitable);
  for (const s of visitable) {
    const dir = facing(s.rot);
    const tier = kit.tier(s.tier);
    const platY = platformHeight(s, tier);
    viewpoints.push({
      id: `interior.${s.id}`,
      name: `${s.name}·内景`,
      mode: 'interior',
      position: [s.x + dir[0] * (s.d / 2 - 10), platY + 5.5, s.z + dir[1] * (s.d / 2 - 10)],
      target: [s.x - dir[0] * 8, platY + 3.6, s.z - dir[1] * 8],
      fov: 58,
      area: { minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2 }
    });
  }
  const spawn = opt.fpSpawn || [zone.minX + (zone.maxX - zone.minX) * 0.5, 0, zone.minZ + 8];
  const spawnTarget = opt.fpTarget || [spawn[0], 1.6, spawn[2] + 70];
  viewpoints.push({ id: `fp.${zone.id}`, name: `${zone.name}·第一人称出生点`, mode: 'fp-spawn', position: spawn, target: spawnTarget });

  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}

export async function buildBoundary(ctx) {
  const { THREE, kit, layout, zone, slots, roads, rng } = ctx;
  const rnd = rng('zone.boundary');
  const root = new THREE.Group();
  root.name = 'zone-boundary';
  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];

  const hx = CITY.halfX;
  const hz = CITY.halfZ;
  const runs = [
    { axis: 'x', fixed: -hz, from: -hx, to: hx, gap: [{ at: 0, w: 46 }] },
    { axis: 'x', fixed: hz, from: -hx, to: hx, gap: [{ at: 0, w: 42 }] },
    { axis: 'z', fixed: -hx, from: -hz, to: hz, gap: [{ at: 0, w: 40 }] },
    { axis: 'z', fixed: hx, from: -hz, to: hz, gap: [{ at: 0, w: 40 }] }
  ];
  const wallRun = makeWallRun(kit, obstacles);
  for (const run of runs) {
    const gaps = run.gap.map((g) => [g.at - g.w / 2, g.at + g.w / 2]);
    root.add(wallRun(run.axis, run.fixed, run.from, run.to, gaps, { h: CITY.wallH, t: CITY.wallT }));
  }

  for (const slot of slots) {
    const res = kit.building(slot);
    root.add(res.group);
    const bb = res.bounds;
    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: 'boundary',
      rot: slot.rot || 0,
      visitable: false,
      info: slot.info || '',
      entrance: [slot.x, 2, slot.z],
      bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }
    });
    if (slot.drum) {
      const wide = slot.rot === 0 || slot.rot === 180;
      if (wide) {
        obstacles.push({ min: [bb.min.x, 0, bb.min.z], max: [bb.min.x + 8, 11, bb.max.z] });
        obstacles.push({ min: [bb.max.x - 8, 0, bb.min.z], max: [bb.max.x, 11, bb.max.z] });
        surfaces.push({ id: `${slot.id}.tunnel`, min: [slot.x - 8, 0, slot.z - 12], max: [slot.x + 8, 0, slot.z + 12], y: 0, kind: 'ground' });
      } else {
        obstacles.push({ min: [bb.min.x, 0, bb.min.z], max: [bb.max.x, 11, bb.min.z + 8] });
        obstacles.push({ min: [bb.min.x, 0, bb.max.z - 8], max: [bb.max.x, 11, bb.max.z] });
        surfaces.push({ id: `${slot.id}.tunnel`, min: [slot.x - 12, 0, slot.z - 8], max: [slot.x + 12, 0, slot.z + 8], y: 0, kind: 'ground' });
      }
    } else {
      obstacles.push({ min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    }
    lightAnchors.push({ id: `${slot.id}.lamp`, type: 'lantern', position: [slot.x, bb.max.y * 0.7, slot.z], color: 0xffb46b, intensity: 7 });
  }

  const bridgeSpots = [
    { x: 0, z: -(hz + CITY.moatW / 2), rot: 90, w: 24, id: 'conn.south-bridge' },
    { x: 0, z: hz + CITY.moatW / 2, rot: 90, w: 22, id: 'conn.north-bridge' },
    { x: -(hx + CITY.moatW / 2), z: 0, rot: 0, w: 22, id: 'conn.west-bridge' },
    { x: hx + CITY.moatW / 2, z: 0, rot: 0, w: 22, id: 'conn.east-bridge' }
  ];
  for (const b of bridgeSpots) {
    const len = CITY.moatW + 16;
    const rise = 1.8;
    const br = kit.bridge({ x: 0, z: 0, len, w: b.w, rise });
    br.position.set(b.x, 0, b.z);
    br.rotation.y = rotY(b.rot);
    root.add(br);
    const slices = 21;
    const sliceLen = len / slices;
    for (let i = 0; i < slices; i++) {
      const y = Math.sin((Math.PI * i) / (slices - 1)) * rise;
      const off = -len / 2 + (i + 0.5) * sliceLen;
      if (b.rot === 90) surfaces.push({ id: `${b.id}.deck${i}`, min: [b.x - b.w / 2, 0, b.z + off - sliceLen / 2 - 0.05], max: [b.x + b.w / 2, 0, b.z + off + sliceLen / 2 + 0.05], y, kind: 'bridge' });
      else surfaces.push({ id: `${b.id}.deck${i}`, min: [b.x + off - sliceLen / 2 - 0.05, 0, b.z - b.w / 2], max: [b.x + off + sliceLen / 2 + 0.05, 0, b.z + b.w / 2], y, kind: 'bridge' });
    }
  }

  const banks = [];
  for (const s of [-1, 1]) {
    banks.push({ x: s * (hx + 2), z: 0, w: 3, d: 900, h: 2.2 });
    banks.push({ x: 0, z: s * (hz + 2), w: 690, d: 3, h: 2.2 });
  }
  for (const b of banks) {
    root.add(kit.boxAt(b.w, b.h, b.d, b.x, b.h / 2 - 0.5, b.z, kit.materials.stoneDark));
    if (Math.abs(b.x) > 1) obstacles.push({ min: [b.x - b.w / 2, 0, b.z - b.d / 2], max: [b.x + b.w / 2, b.h, b.z + b.d / 2] });
    else obstacles.push({ min: [b.x - b.w / 2, 0, b.z - b.d / 2], max: [b.x + b.w / 2, b.h, b.z + b.d / 2] });
  }

  const trees = layout.TREES.boundary;
  if (trees) {
    const list = [];
    let guard = 0;
    while (list.length < trees.count && guard < trees.count * 40) {
      guard++;
      const area = trees.areas[Math.floor(rnd() * trees.areas.length)];
      const x = area.x - area.w / 2 + rnd() * area.w;
      const z = area.z - area.d / 2 + rnd() * area.d;
      if (Math.abs(x) < hx + CITY.moatW + 12 && Math.abs(z) < hz + CITY.moatW + 12) continue;
      if (x < -1200 || x > 1200 || z < -1500 || z > 1500) continue;
      list.push({ x, z, s: 0.9 + rnd() * 0.8, r: rnd() * 6 });
    }
    if (list.length) root.add(kit.treeCluster(list, 'broad'));
  }

  for (const c of layout.CONNECTORS) {
    if (c.owner !== 'boundary') continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
  }

  surfaces.push({ id: 'ground.boundary.in', min: [-hx + 1, 0, -hz + 1], max: [hx - 1, 0, hz - 1], y: 0, kind: 'ground' });
  surfaces.push({ id: 'ground.boundary.out.s', min: [-1200, 0, -1500], max: [1200, 0, -hz - CITY.moatW], y: -0.5, kind: 'ground' });
  surfaces.push({ id: 'ground.boundary.out.n', min: [-1200, 0, hz + CITY.moatW], max: [1200, 0, 1500], y: -0.5, kind: 'ground' });
  surfaces.push({ id: 'ground.boundary.out.w', min: [-1200, 0, -1500], max: [-hx - CITY.moatW, 0, 1500], y: -0.5, kind: 'ground' });
  surfaces.push({ id: 'ground.boundary.out.e', min: [hx + CITY.moatW, 0, -1500], max: [1200, 0, 1500], y: -0.5, kind: 'ground' });

  viewpoints.push({ id: 'zone.gate-south', name: '南城门', mode: 'zone', position: [0, 128, -648], target: [0, 26, -450], fov: 40 });
  viewpoints.push({ id: 'fp.boundary', name: '南桥·第一人称出生点', mode: 'fp-spawn', position: [0, 0, -466], target: [0, 1.6, -380] });
  viewpoints.push({ id: 'fp.boundary.out', name: '城外南侧', mode: 'fp-spawn', position: [0, -0.5, -560], target: [0, 1.1, -470] });

  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}

export async function buildGarden(ctx) {
  const { THREE, kit, config, layout, zone, slots, corridors, roads, rng } = ctx;
  const rnd = rng('zone.garden');
  const root = new THREE.Group();
  root.name = 'zone-garden';
  const buildings = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];
  const connectors = [];

  for (const r of roads) root.add(kit.slabRect({ kind: r.kind, ...r }));
  for (const cor of corridors) {
    const g = kit.corridor({ x: 0, z: 0, len: cor.len, w: 4.6, h: 3.6 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
  }

  for (const p of layout.PONDS) {
    root.add(kit.props({ kind: 'pond', x: p.x, z: p.z, r: p.r, seed: rnd() * 6 }));
    surfaces.push({ id: `garden.pond.${p.x}_${p.z}`, min: [p.x - p.r, 0, p.z - p.r], max: [p.x + p.r, 0, p.z + p.r], y: 0.35, kind: 'water' });
  }
  root.add(kit.props({
    kind: 'rockery',
    list: [
      { x: -32, z: 344, s: 3.4, r: 0.6 },
      { x: -18, z: 350, s: 2.2, r: 2.1 },
      { x: 38, z: 340, s: 2.8, r: 3.4 },
      { x: 120, z: 396, s: 3.0, r: 1.2 },
      { x: -124, z: 392, s: 2.6, r: 4.4 }
    ]
  }));

  for (const slot of slots) {
    const res = kit.building(slot);
    root.add(res.group);
    const bb = res.bounds;
    const tier = kit.tier(slot.tier);
    const platY = slot.kind === 'pavilion' ? (slot.tier === 'royal' ? 2.6 : 1.8) : slot.kind === 'courtyardGate' ? 1.2 : 0.9;
    obstacles.push({ min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    surfaces.push({
      id: `${slot.id}.platform`,
      min: [slot.x - slot.w / 2 - 2, 0, slot.z - slot.d / 2 - 2],
      max: [slot.x + slot.w / 2 + 2, 0, slot.z + slot.d / 2 + 2],
      y: platY,
      kind: 'ground'
    });
    const steps = Math.max(3, Math.ceil(platY / 0.5));
    const dir = facing(slot.rot);
    for (let i = 0; i < steps; i++) {
      const off = (steps - 1 - i) * 1.4;
      const cx = slot.x + dir[0] * (slot.d / 2 + 2 + off);
      const cz = slot.z + dir[1] * (slot.d / 2 + 2 + off);
      surfaces.push({ id: `${slot.id}.step${i}`, min: [cx - 3, 0, cz - 1.4], max: [cx + 3, 0, cz + 1.4], y: (platY / steps) * (i + 1), kind: 'stairs' });
    }
    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: 'garden',
      rot: slot.rot || 0,
      visitable: false,
      info: slot.info || '',
      entrance: [slot.x + dir[0] * (slot.d / 2 + 6), platY, slot.z + dir[1] * (slot.d / 2 + 6)],
      bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }
    });
    lightAnchors.push({ id: `${slot.id}.lamp`, type: 'lantern', position: [slot.x, platY + 4, slot.z], color: 0xffc07a, intensity: 6 });
    void tier;
    void res;
  }

  const trees = layout.TREES.garden;
  const buckets = { pine: [], broad: [], willow: [] };
  let placed = 0;
  let guard = 0;
  while (placed < trees.count && guard < trees.count * 40) {
    guard++;
    const area = trees.areas[Math.floor(rnd() * trees.areas.length)];
    const x = area.x - area.w / 2 + rnd() * area.w;
    const z = area.z - area.d / 2 + rnd() * area.d;
    if (x < zone.minX + 4 || x > zone.maxX - 4 || z < zone.minZ + 4 || z > zone.maxZ - 4) continue;
    if (roads.some((r) => insideRect(x, z, r, 3))) continue;
    if (layout.PONDS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 4) ** 2)) continue;
    let bad = false;
    for (const o of obstacles) {
      if (x > o.min[0] - 5 && x < o.max[0] + 5 && z > o.min[2] - 5 && z < o.max[2] + 5) { bad = true; break; }
    }
    if (bad) continue;
    const r = rnd();
    const pick = r < 0.3 ? 'pine' : r < 0.72 ? 'broad' : 'willow';
    buckets[pick].push({ x, z, s: 0.8 + rnd() * 0.7, r: rnd() * 6 });
    placed++;
  }
  for (const k of Object.keys(buckets)) {
    if (buckets[k].length) root.add(kit.treeCluster(buckets[k], k));
  }
  const lamps = [];
  for (const r of roads.filter((x) => x.kind === 'path')) {
    lamps.push({ x: r.x - r.w / 2 - 3, z: r.z - r.d / 2 - 3, id: `garden.lamp.${Math.round(r.x)}_${Math.round(r.z)}` });
  }
  if (lamps.length) {
    const g = kit.props({ kind: 'stoneLamp', list: lamps });
    root.add(g);
    for (const a of g.userData.lightAnchors || []) lightAnchors.push(a);
  }

  for (const c of layout.CONNECTORS) {
    if (c.owner !== 'garden') continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
  }

  surfaces.push({ id: 'ground.garden', min: [zone.minX, 0, zone.minZ], max: [zone.maxX, 0, zone.maxZ], y: 0, kind: 'ground' });
  viewpoints.push({ id: 'zone.garden', name: '御花园', mode: 'zone', position: config.ZONE_VIEWS['zone.garden'].position, target: config.ZONE_VIEWS['zone.garden'].target, fov: 40 });
  viewpoints.push({ id: 'fp.garden', name: '御花园·第一人称出生点', mode: 'fp-spawn', position: [0, 0, 298], target: [0, 1.6, 380] });

  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}

export { insideRect, roadGaps, makeWallRun, rotY, facing, FP };
