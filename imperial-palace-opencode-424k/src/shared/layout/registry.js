/**
 * 紫禁天朝 · 布局登记器（主 Agent 冻结接口）
 * layout-v1 · 各分区布局模块通过本登记器写入数据，运行时与测试共用。
 */

import { WORLD } from '../config.js';

export const ZONES = [
  { id: 'B', name: '中轴前朝', code: '前朝', bounds: { x0: -135, x1: 135, z0: -420, z1: 80 } },
  { id: 'C', name: '内廷后宫', code: '后宫', bounds: { x0: -135, x1: 135, z0: 80, z1: 300 } },
  { id: 'D', name: '西侧宫苑', code: '西宫苑', bounds: { x0: -300, x1: -135, z0: -420, z1: 300 } },
  { id: 'E', name: '东侧宫苑', code: '东宫苑', bounds: { x0: 135, x1: 300, z0: -420, z1: 300 } },
  { id: 'F', name: '御花园与边界', code: '御花园', bounds: { x0: -135, x1: 135, z0: 300, z1: 420 } }
];

const KEYS = ['buildings', 'courtyards', 'terraces', 'stairs', 'walls', 'corridors', 'waters', 'bridges', 'paths', 'rocks', 'monuments', 'lanterns', 'obstacles', 'connectors', 'viewpoints'];

export const ctx = {};
for (const k of KEYS) ctx[k] = [];
ctx.courtyards = [];
export const scope = {};
for (const z of ZONES) {
  scope[z.id] = {};
  for (const k of KEYS) scope[z.id][k] = [];
}

export function zoneOf(x, z) {
  for (const zz of ZONES) {
    const b = zz.bounds;
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return zz.id;
  }
  return 'F';
}

function track(zone, key, id) {
  if (scope[zone] && scope[zone][key]) scope[zone][key].push(id);
}

export function boxObstacle(id, r, y0, y1, kind) {
  ctx.obstacles.push({ id: id + ':block', kind: kind || 'block', x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0, y1 });
}

export function gateObstacles(id, cx, cz, w, d, opens, y0, y1, rot) {
  const deg = ((rot || 0) % 360 + 360) % 360;
  const rotated = (deg > 45 && deg < 135) || (deg > 225 && deg < 315);
  const sgn = (deg > 45 && deg < 135) ? 1 : -1;
  const hw = w / 2, hd = d / 2;
  function push(tag, lx0, lx1, lz0, lz1, yy0, yy1) {
    let x0, x1, z0, z1;
    if (rotated) {
      x0 = cx + Math.min(lz0 * sgn, lz1 * sgn);
      x1 = cx + Math.max(lz0 * sgn, lz1 * sgn);
      z0 = cz + Math.min(-lx0 * sgn, -lx1 * sgn);
      z1 = cz + Math.max(-lx0 * sgn, -lx1 * sgn);
    } else {
      x0 = cx + lx0;
      x1 = cx + lx1;
      z0 = cz + lz0;
      z1 = cz + lz1;
    }
    if (x1 - x0 < 0.02 && z1 - z0 < 0.02) return;
    ctx.obstacles.push({ id: id + ':' + tag, kind: yy1 - yy0 < 12 ? 'lintel' : 'block', x0, x1, z0, z1, y0: yy0, y1: yy1 });
  }
  const sorted = opens.slice().sort((a, b) => a.x0 - b.x0);
  let cursor = -hw;
  for (const op of sorted) {
    if (op.x0 > cursor) push('wall' + Math.round(cursor), cursor, op.x0, -hd, hd, y0, y1);
    const top = op.top || 6;
    push('lintel' + Math.round(op.x0), op.x0, op.x1, -hd, hd, y0 + top, y1);
    cursor = op.x1;
  }
  if (cursor < hw) push('wall' + Math.round(cursor), cursor, hw, -hd, hd, y0, y1);
}

export function building(o) {
  const zone = o.zone || zoneOf(o.x, o.z);
  const b = {
    id: o.id, name: o.name, category: o.category, archetype: o.archetype,
    x: o.x, z: o.z, rot: o.rot || 0, w: o.w, d: o.d, h: o.h || 14,
    base: o.base || 0, level: o.level || 3, courtyard: o.courtyard || null,
    visitable: !!o.visitable, opens: o.opens || null, info: o.info || '', zone
  };
  b.bounds = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
  ctx.buildings.push(b);
  track(zone, 'buildings', b.id);
  if (o.solid !== false) {
    if (o.interiorShell) {
      b.interiorShell = true;
      hallShellObstacles(b.id, b, o.frontDoor || 10, o.backDoorW || 10, b.base, b.base + b.h);
    } else if (b.opens) gateObstacles(b.id, b.x, b.z, b.w, b.d, b.opens, b.base, b.base + b.h, b.rot);
    else boxObstacle(b.id, b.bounds, b.base, b.base + b.h, 'building');
  }
  return b;
}

export function hallShellObstacles(id, b, frontW, backW, y0, y1) {
  const hw = b.w / 2, hd = b.d / 2, th = 1.0;
  const fw = frontW / 2, bw2 = backW / 2;
  const zS0 = b.z - hd, zS1 = b.z - hd + th;
  const zN0 = b.z + hd - th, zN1 = b.z + hd;
  const xW0 = b.x - hw, xW1 = b.x - hw + th;
  const xE0 = b.x + hw - th, xE1 = b.x + hw;
  const zW0 = b.z - hd + th, zW1 = b.z + hd - th;
  const lintelY = y0 + Math.min(7, (y1 - y0) * 0.55);
  const push = (tag, x0, x1, z0, z1, yy0, yy1, kind) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    ctx.obstacles.push({ id: id + ':' + tag, kind: kind || 'wall', x0, x1, z0, z1, y0: yy0, y1: yy1 });
  };
  push('wall-s1', b.x - hw, b.x - fw, zS0, zS1, y0, y1);
  push('wall-s2', b.x + fw, b.x + hw, zS0, zS1, y0, y1);
  push('lintel-s', b.x - fw, b.x + fw, zS0, zS1, lintelY, y1, 'lintel');
  push('wall-n1', b.x - hw, b.x - bw2, zN0, zN1, y0, y1);
  push('wall-n2', b.x + bw2, b.x + hw, zN0, zN1, y0, y1);
  push('lintel-n', b.x - bw2, b.x + bw2, zN0, zN1, lintelY, y1, 'lintel');
  push('wall-w', xW0, xW1, zW0, zW1, y0, y1);
  push('wall-e', xE0, xE1, zW0, zW1, y0, y1);
}

export function courtyard(o) {
  const zone = o.zone || zoneOf(o.cx, o.cz);
  const c = {
    id: o.id, name: o.name, zone, cx: o.cx, cz: o.cz, w: o.w, d: o.d,
    wallHeight: o.wallHeight || 5, level: o.level || 3, theme: o.theme || 'court'
  };
  c.bounds = { x0: c.cx - c.w / 2, x1: c.cx + c.w / 2, z0: c.cz - c.d / 2, z1: c.cz + c.d / 2 };
  ctx.courtyards.push(c);
  track(zone, 'courtyards', c.id);
  return c;
}

export function courtWall(id, zone, x0, x1, z0, z1, y, h) {
  ctx.walls.push({ id, zone, x0, x1, z0, z1, y, h: h || 5 });
  track(zone, 'walls', id);
  ctx.obstacles.push({ id: id + ':block', kind: 'wall', x0, x1, z0, z1, y0: 0, y1: y + (h || 5) });
}

export function terrace(o) {
  const zone = o.zone || zoneOf((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
  const t = {
    id: o.id, zone, x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y: o.y,
    tier: o.tier || 1, railing: o.railing !== false, gaps: o.gaps || [], style: o.style || 'marble'
  };
  ctx.terraces.push(t);
  track(zone, 'terraces', t.id);
  return t;
}

export function stairs(o) {
  const zone = o.zone || zoneOf(o.x, o.z);
  const s = {
    id: o.id, zone, x: o.x, z: o.z, w: o.w, d: o.d, y0: o.y0, y1: o.y1,
    dir: o.dir || 'z+', steps: o.steps || Math.max(2, Math.round(Math.abs(o.y1 - o.y0) / 0.32)),
    style: o.style || 'marble'
  };
  ctx.stairs.push(s);
  track(zone, 'stairs', s.id);
  return s;
}

export function corridor(o) {
  const zone = o.zone || zoneOf((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
  const c = {
    id: o.id, zone, x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y: o.y || 0, h: o.h || 5.2,
    axis: o.axis || ((o.x1 - o.x0) >= (o.z1 - o.z0) ? 'x' : 'z')
  };
  ctx.corridors.push(c);
  track(zone, 'corridors', c.id);
  const t = 1.6;
  if (c.axis === 'z') {
    ctx.obstacles.push({ id: c.id + ':w0', kind: 'wall', x0: c.x0, x1: c.x0 + t, z0: c.z0, z1: c.z1, y0: 0, y1: c.y + c.h });
    ctx.obstacles.push({ id: c.id + ':w1', kind: 'wall', x0: c.x1 - t, x1: c.x1, z0: c.z0, z1: c.z1, y0: 0, y1: c.y + c.h });
  } else {
    ctx.obstacles.push({ id: c.id + ':w0', kind: 'wall', x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z0 + t, y0: 0, y1: c.y + c.h });
    ctx.obstacles.push({ id: c.id + ':w1', kind: 'wall', x0: c.x0, x1: c.x1, z0: c.z1 - t, z1: c.z1, y0: 0, y1: c.y + c.h });
  }
  return c;
}

export function water(o) {
  const zone = o.zone || zoneOf((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
  const w = { id: o.id, zone, x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y: o.y !== undefined ? o.y : WORLD.waterY, kind: o.kind || 'pond' };
  ctx.waters.push(w);
  track(zone, 'waters', w.id);
  return w;
}

export function bridge(o) {
  const zone = o.zone || zoneOf((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
  const b = {
    id: o.id, zone, x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y: o.y || 0.45,
    axis: o.axis || ((o.x1 - o.x0) >= (o.z1 - o.z0) ? 'x' : 'z'), name: o.name || '石桥'
  };
  ctx.bridges.push(b);
  track(zone, 'bridges', b.id);
  return b;
}

export function deck(id, zone, x0, x1, z0, z1, y) {
  ctx.waters.push({ id: id, zone, x0, x1, z0, z1, y, kind: 'deck' });
  track(zone, 'waters', id);
}

export function path(o) {
  const zone = o.zone || zoneOf((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
  const p = { id: o.id, zone, x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y: o.y || 0.02, style: o.style || 'paving' };
  ctx.paths.push(p);
  track(zone, 'paths', p.id);
  return p;
}

export function axisCarpet(id, zone, x, z0, z1, w) {
  path({ id, zone, x0: x - w / 2, x1: x + w / 2, z0, z1, style: 'carpet', y: 0.04 });
}

export function rock(o) {
  const zone = o.zone || zoneOf(o.x, o.z);
  const r = { id: o.id, zone, x: o.x, z: o.z, r: o.r || 3, ra: o.ra || o.r || 3, h: o.h || 3, seed: o.seed || 1, kind: o.kind || 'rock' };
  ctx.rocks.push(r);
  track(zone, 'rocks', r.id);
  if (o.solid !== false) ctx.obstacles.push({ id: r.id + ':block', kind: 'rock', x0: r.x - r.ra * 0.8, x1: r.x + r.ra * 0.8, z0: r.z - r.ra * 0.8, z1: r.z + r.ra * 0.8, y0: 0, y1: r.h });
  return r;
}

export function monument(o) {
  const zone = o.zone || zoneOf(o.x, o.z);
  const m = { id: o.id, zone, x: o.x, z: o.z, kind: o.kind, h: o.h || 8, r: o.r || 1.2, rot: o.rot || 0, name: o.name || '陈设' };
  ctx.monuments.push(m);
  track(zone, 'monuments', m.id);
  if (o.solid !== false) ctx.obstacles.push({ id: m.id + ':block', kind: 'monument', x0: m.x - m.r, x1: m.x + m.r, z0: m.z - m.r, z1: m.z + m.r, y0: 0, y1: m.h });
  return m;
}

export function lantern(o) {
  const zone = o.zone || zoneOf(o.x, o.z);
  const l = { id: o.id, zone, x: o.x, z: o.z, y: o.y || 0, kind: o.kind || 'palace', scale: o.scale || 1 };
  ctx.lanterns.push(l);
  track(zone, 'lanterns', l.id);
  return l;
}

export function connector(o) {
  const c = { id: o.id, a: o.a, b: o.b, position: o.position, width: o.width, elevation: o.elevation || 0, kind: o.kind || 'gate' };
  ctx.connectors.push(c);
  track(o.a, 'connectors', c.id);
  track(o.b, 'connectors', c.id);
  return c;
}

export function viewpoint(o) {
  const v = { id: o.id, name: o.name, zone: o.zone, mode: o.mode, position: o.position, target: o.target, fov: o.fov || 0, area: o.area || null };
  ctx.viewpoints.push(v);
  track(o.zone, 'viewpoints', v.id);
  return v;
}

export function outerWallSegments(zone) {
  const { x0, x1, z0, z1 } = WORLD.enclosure;
  const T = WORLD.wall.thickness, H = WORLD.wall.height;
  const gateSouth = 60, gateNorth = 30, gateSide = 20, sideZ = 40;
  let count = 0;
  function run(axis, fixed, a0, a1) {
    for (let a = a0; a < a1; a += 30) {
      const len = Math.min(30, a1 - a);
      const mid = a + len / 2;
      const r = axis === 'x'
        ? { x0: mid - len / 2, x1: mid + len / 2, z0: fixed - T / 2, z1: fixed + T / 2 }
        : { x0: fixed - T / 2, x1: fixed + T / 2, z0: mid - len / 2, z1: mid + len / 2 };
      const id = 'F-wall-' + axis + fixed + '-' + Math.round(a);
      ctx.walls.push({ id, zone, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y: 0, h: H, kind: 'outer' });
      track(zone, 'walls', id);
      ctx.obstacles.push({ id: id + ':block', kind: 'wall', x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: 0, y1: H });
      count++;
    }
  }
  run('x', z0, x0, -gateSouth);
  run('x', z0, gateSouth, x1);
  run('x', z1, x0, -gateNorth);
  run('x', z1, gateNorth, x1);
  run('z', x0, z0, sideZ - gateSide);
  run('z', x0, sideZ + gateSide, z1);
  run('z', x1, z0, sideZ - gateSide);
  run('z', x1, sideZ + gateSide, z1);
  return count;
}

export { KEYS };
