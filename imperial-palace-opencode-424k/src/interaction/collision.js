/**
 * 紫禁天朝 · 碰撞与第一人称行走（G 交互）
 * 可行走面：地面、台基顶、台阶、桥面与室内地面；障碍：建筑、墙体、廊庑、山石、陈设与水面。
 */

import { WORLD } from '../shared/config.js';
import { ZONES } from '../shared/layout/registry.js';

export function buildCollisionModel(layout, extraColliders) {
  const surfaces = [];
  const groundRects = [];
  const outer = { x0: -760, x1: 760, z0: -900, z1: 900 };
  surfaces.push({ id: 'outer-terrain', x0: outer.x0, x1: outer.x1, z0: outer.z0, z1: outer.z1, y: WORLD.terrainY - 0.2, kind: 'terrain' });
  const g = 442;
  surfaces.push({ id: 'ground', x0: -g, x1: g, z0: -g, z1: g, y: 0, kind: 'ground' });
  groundRects.push('ground');

  for (const t of layout.terraces) {
    surfaces.push({ id: t.id, x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y: t.y, kind: 'terrace' });
  }
  for (const s of layout.stairs) {
    const steps = s.steps;
    const rise = (s.y1 - s.y0) / steps;
    const run = s.d / steps;
    const halfW = s.w / 2, halfD = s.d / 2;
    const lip = 2.8, tail = 0.8;
    for (let i = 0; i < steps; i++) {
      const y = s.y0 + rise * (i + 1);
      const off = -halfD + run * (i + 0.5);
      const growA = i === 0 ? tail : 0;
      const growB = i === steps - 1 ? lip : 0;
      let x0, x1, z0, z1;
      if (s.dir === 'z+') { x0 = s.x - halfW; x1 = s.x + halfW; z0 = s.z + off - run / 2 - growA; z1 = s.z + off + run / 2 + growB; }
      else if (s.dir === 'z-') { x0 = s.x - halfW; x1 = s.x + halfW; z0 = s.z - off - run / 2 - growB; z1 = s.z - off + run / 2 + growA; }
      else if (s.dir === 'x+') { z0 = s.z - halfW; z1 = s.z + halfW; x0 = s.x + off - run / 2 - growA; x1 = s.x + off + run / 2 + growB; }
      else { z0 = s.z - halfW; z1 = s.z + halfW; x0 = s.x - off - run / 2 - growB; x1 = s.x - off + run / 2 + growA; }
      surfaces.push({ id: s.id + '-' + i, x0, x1, z0, z1, y, kind: 'step' });
    }
  }
  for (const b of layout.bridges) {
    surfaces.push({ id: b.id, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y: b.y, kind: 'bridge' });
  }
  for (const w of layout.waters) {
    if (w.kind !== 'deck') continue;
    surfaces.push({ id: w.id, x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, y: w.y, kind: 'bridge' });
  }

  const waters = layout.waters.filter(w => w.kind === 'moat' || w.kind === 'lake' || w.kind === 'pond');
  const obstacles = layout.obstacles.slice();
  if (extraColliders) for (const c of extraColliders) obstacles.push(c);

  function inWater(x, z, pad) {
    const p = pad || 0;
    for (const w of waters) {
      if (x > w.x0 + p && x < w.x1 - p && z > w.z0 + p && z < w.z1 - p) return true;
    }
    return false;
  }

  function surfaceAt(x, z) {
    let best = null;
    const wet = inWater(x, z, 0.3);
    for (const s of surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      if (wet && (s.kind === 'ground' || s.kind === 'terrain')) continue;
      if (!best || s.y > best.y) best = s;
    }
    return best;
  }

  function blocked(x, z, y, radius) {
    const r = radius || WORLD.fp.radius;
    const top = y + 1.75, bottom = y + 0.25;
    for (const o of obstacles) {
      if (x + r < o.x0 || x - r > o.x1 || z + r < o.z0 || z - r > o.z1) continue;
      if (top < o.y0 || bottom > o.y1) continue;
      return o;
    }
    return null;
  }

  return { surfaces, obstacles, waters, surfaceAt, blocked, inWater };
}

export function createPlayer(model, opts) {
  const state = {
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    vel: { x: 0, z: 0 },
    eye: WORLD.fp.eye,
    speed: 0,
    blockedInfo: null,
    bob: 0,
    phase: 0,
    footprint: { x0: -22, x1: 22, z0: -7, z1: 15 }
  };
  const keys = Object.create(null);

  function spawn(view) {
    if (!view) return state;
    const s = model.surfaceAt(view.position.x, view.position.z);
    state.pos.x = view.position.x;
    state.pos.z = view.position.z;
    state.pos.y = s ? s.y : (view.position.y || 0);
    const t = view.target || { x: view.position.x, z: view.position.z + 10 };
    state.yaw = Math.atan2(-(t.x - view.position.x), -(t.z - view.position.z));
    state.pitch = -0.03;
    return state;
  }

  function setKey(code, down) { keys[code] = down; }

  function update(dt, input) {
    const inp = input || {};
    const yaw = state.yaw + (inp.lookYaw || 0);
    const pitch = Math.max(-1.15, Math.min(1.05, state.pitch + (inp.lookPitch || 0)));
    state.yaw = inp.absYaw !== undefined ? inp.absYaw : state.yaw + (inp.lookYaw || 0);
    state.pitch = pitch;
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    let wx = 0, wz = 0;
    const k = inp.keys || keys;
    if (k.KeyW || k.ArrowUp) { wx += fx; wz += fz; }
    if (k.KeyS || k.ArrowDown) { wx -= fx; wz -= fz; }
    if (k.KeyD || k.ArrowRight) { wx += rx; wz += rz; }
    if (k.KeyA || k.ArrowLeft) { wx -= rx; wz -= rz; }
    const stick = inp.stick;
    if (stick && (stick.dx || stick.dy)) {
      wx += fx * -stick.dy + rx * stick.dx;
      wz += fz * -stick.dy + rz * stick.dx;
    }
    const len = Math.hypot(wx, wz);
    const want = (k.ShiftLeft || k.ShiftRight) ? WORLD.fp.run : WORLD.fp.walk;
    if (len > 0) { wx = wx / len * want * Math.min(1, len); wz = wz / len * want * Math.min(1, len); }
    const damp = Math.min(1, dt * 9);
    state.vel.x += (wx - state.vel.x) * damp;
    state.vel.z += (wz - state.vel.z) * damp;
    state.speed = Math.hypot(state.vel.x, state.vel.z);

    state.blockedInfo = null;
    const step = (dx, dz) => {
      const nx = state.pos.x + dx, nz = state.pos.z + dz;
      const s = model.surfaceAt(nx, nz);
      if (!s) return false;
      if (s.y - state.pos.y > WORLD.fp.stepUp) return false;
      if (model.blocked(nx, nz, s.y, WORLD.fp.radius)) { state.blockedInfo = model.blocked(nx, nz, s.y, WORLD.fp.radius); return false; }
      if (state.pos.y - s.y > 3.2) return false;
      state.pos.x = nx;
      state.pos.z = nz;
      state.pos.y = s.y;
      return true;
    };
    const mx = state.vel.x * dt, mz = state.vel.z * dt;
    const okX = step(mx, 0);
    const okZ = step(0, mz);
    if (!okX && !okZ && (Math.abs(mx) > 1e-4 || Math.abs(mz) > 1e-4)) {
      state.vel.x *= 0.2;
      state.vel.z *= 0.2;
    }
    state.phase += dt * (2.0 + state.speed * 1.9);
    const amp = 0.026 * Math.min(1, state.speed / WORLD.fp.walk);
    state.bob = Math.sin(state.phase * 2) * amp - amp * 0.3;
    return state;
  }

  function eyePosition() {
    return { x: state.pos.x, y: state.pos.y + state.eye + state.bob, z: state.pos.z };
  }

  return { state, spawn, setKey, update, eyePosition, keys };
}

export function createWalker(model, layout, opts) {
  const player = createPlayer(model, opts);
  return player;
}

export default { buildCollisionModel, createPlayer, createWalker };
