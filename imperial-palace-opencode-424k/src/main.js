/**
 * 紫禁天朝 · 主装配与唯一动画循环（主 Agent）
 * 加载布局 → 分区装配 → 统一环境 / 相机装置 / 交互 / UI；全场景只有一个 rAF 循环。
 */

import * as THREE from 'three';
import { QUALITY, VERSION, WORLD } from './shared/config.js';
import LAYOUT from './shared/layout/index.js';
import { createEvents } from './core/events.js';
import { createStore } from './core/state.js';
import { createRenderer } from './core/renderer.js';
import { createEnvironment } from './core/environment.js';
import { createMaterials } from './kit/materials.js';
import { merge as mergeList } from './kit/geom.js';
import { createCameraRig } from './core/camera-rig.js';
import { buildCollisionModel, createPlayer } from './interaction/collision.js';
import { createSelection } from './interaction/selection.js';
import { createTour } from './interaction/tour.js';
import { createHud } from './ui/hud.js';
import { createZone as createForecourt } from './zones/forecourt.js';
import { createZone as createInnerPalace } from './zones/inner-palace.js';
import { createZone as createWestCourts } from './zones/west-courts.js';
import { createZone as createEastCourts } from './zones/east-courts.js';
import { createZone as createGardenBoundary } from './zones/garden-boundary.js';

const canvas = document.getElementById('gl');
const app = document.getElementById('app');
const events = createEvents();
const store = createStore(events);
const state = store.state;

function nextFrame() {
  return new Promise(r => setTimeout(r, 0));
}

function rectsMinusHoles(base, holes) {
  const xs = [base.x0, base.x1], zs = [base.z0, base.z1];
  for (const h of holes) {
    if (h.x1 < base.x0 || h.x0 > base.x1 || h.z1 < base.z0 || h.z0 > base.z1) continue;
    xs.push(Math.max(base.x0, h.x0), Math.min(base.x1, h.x1));
    zs.push(Math.max(base.z0, h.z0), Math.min(base.z1, h.z1));
  }
  xs.sort((a, b) => a - b); zs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let k = 0; k < zs.length - 1; k++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[k] + zs[k + 1]) / 2;
      let inside = false;
      for (const h of holes) {
        if (cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1) { inside = true; break; }
      }
      if (inside) continue;
      const w = xs[i + 1] - xs[i], d = zs[k + 1] - zs[k];
      if (w < 0.5 || d < 0.5) continue;
      out.push({ x0: xs[i], x1: xs[i + 1], z0: zs[k], z1: zs[k + 1] });
    }
  }
  return out;
}

function planeGeo(w, d, tile, x, y, z) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function buildBaseGround(materials) {
  const group = new THREE.Group();
  group.name = 'base-ground';
  const holes = LAYOUT.waters.filter(w => w.kind !== 'deck');
  const pavingRects = rectsMinusHoles({ x0: -442, x1: 442, z0: -442, z1: 442 }, holes);
  const outerRects = rectsMinusHoles({ x0: -900, x1: 900, z0: -1000, z1: 1000 }, holes);
  const pg = [], og = [];
  for (const r of pavingRects) pg.push(planeGeo(r.x1 - r.x0, r.z1 - r.z0, 7, (r.x0 + r.x1) / 2, 0.001, (r.z0 + r.z1) / 2));
  for (const r of outerRects) og.push(planeGeo(r.x1 - r.x0, r.z1 - r.z0, 26, (r.x0 + r.x1) / 2, -0.8, (r.z0 + r.z1) / 2));
  const pm = new THREE.Mesh(pg.length ? mergeList(pg) : new THREE.BufferGeometry(), materials.paving);
  pm.name = 'inner-ground';
  pm.receiveShadow = true;
  group.add(pm);
  const om = new THREE.Mesh(mergeList(og), materials.soil);
  om.name = 'outer-terrain';
  om.receiveShadow = true;
  group.add(om);

  const banks = [];
  for (const w of LAYOUT.waters) {
    if (w.kind === 'deck') continue;
    const yTop = w.kind === 'moat' ? 0.02 : 0.0;
    const yBot = w.y - 0.6;
    const t = 1.6;
    banks.push(boxFor(w.x0 - t, yBot, w.z0 - t, w.x1 + t, yTop, w.z0, yBot, yTop));
    banks.push(boxFor(w.x0 - t, yBot, w.z1, w.x1 + t, yTop, w.z1 + t, yBot, yTop));
    banks.push(boxFor(w.x0 - t, yBot, w.z0, w.x0, yTop, w.z1, yBot, yTop));
    banks.push(boxFor(w.x1, yBot, w.z0, w.x1 + t, yTop, w.z1, yBot, yTop));
  }
  const bm = new THREE.Mesh(mergeList(banks), materials.marbleShade);
  bm.name = 'water-banks';
  bm.receiveShadow = true;
  group.add(bm);
  return group;
}

function boxFor(x0, y0, z0, x1, y1, z1, yb, yt) {
  const g = new THREE.BoxGeometry(x1 - x0, yt - yb, z1 - z0);
  g.translate((x0 + x1) / 2, (yb + yt) / 2, (z0 + z1) / 2);
  return g;
}

async function init() {
  const hud = createHud({ events, layout: LAYOUT, state });
  const api = { THREE, VERSION, layout: LAYOUT, state, events, hud };
  window.IMPERIAL = api;

  try {
    hud.setLoading('init', 0.04, '初始化渲染器…');
    const quality = QUALITY[state.quality];
    const R = createRenderer(canvas, quality);
    const materials = createMaterials();
    const scene = new THREE.Scene();
    const env = createEnvironment(scene, materials, quality, R.renderer);
    const preset0 = env.applyPreset(state.timePreset);
    R.setBloom(preset0.bloom);
    R.setScene(scene);
    api.renderer = R;
    api.env = env;
    api.scene = scene;
    api.materials = materials;
    await nextFrame();

    hud.setLoading('ground', 0.14, '铺设宫城基底与河岸…');
    scene.add(buildBaseGround(materials));
    await nextFrame();

    const zoneModules = {
      B: createForecourt, C: createInnerPalace, D: createWestCourts, E: createEastCourts, F: createGardenBoundary
    };
    const zones = {};
    const buildingRegistry = [];
    const colliders = [];
    const viewpoints = [];
    const connectors = [];
    let step = 0;
    const order = ['F', 'B', 'C', 'D', 'E'];
    for (const zid of order) {
      hud.setLoading('zone-' + zid, 0.2 + 0.62 * (step / order.length), '装配 ' + zid + ' 区…');
      const ctx = { THREE, layout: LAYOUT, materials, quality, events, state, rng: () => Math.random(), assets: null };
      const zone = await zoneModules[zid](ctx);
      zones[zid] = zone;
      scene.add(zone.root);
      for (const b of zone.buildings) buildingRegistry.push(b);
      for (const c of zone.colliders) colliders.push(c);
      for (const v of zone.viewpoints) viewpoints.push(v);
      for (const c of zone.connectors) connectors.push(c);
      step++;
      await nextFrame();
    }
    api.zones = zones;
    api.buildings = buildingRegistry;
    api.registry = new Map(buildingRegistry.map(b => [b.id, b]));
    state.stats = LAYOUT.stats;

    hud.setLoading('interaction', 0.88, '装配相机与交互…');
    const model = buildCollisionModel(LAYOUT, colliders);
    api.collision = model;
    const player = createPlayer(model, {});
    api.player = player;

    const rig = createCameraRig({ canvas, layout: LAYOUT, events, state });
    api.rig = rig;
    rig.setMode('oblique');
    rig.rig.tween = null;
    const gv = rig.viewById('v-global');
    rig.perspective.position.set(gv.position.x, gv.position.y * 1.35, gv.position.z - 260);
    rig.perspective.lookAt(gv.target.x, gv.target.y, gv.target.z);
    rig.controls.target.set(gv.target.x, gv.target.y, gv.target.z);
    rig.perspective.updateProjectionMatrix();
    R.setCamera(rig.activeCamera);

    const selection = createSelection({ scene, camera3d: rig.perspective, layout: LAYOUT, events, canvas });
    for (const zid of Object.keys(zones)) {
      zones[zid].root.traverse(o => { if (o.isInstancedMesh) selection.register(o); });
    }
    api.selection = selection;

    const tour = createTour({ rig, layout: LAYOUT, events });
    api.tour = tour;
    await nextFrame();

    hud.setLoading('ready', 0.98, '进入宫城…');
    events.emit('state', state);
    await nextFrame();
    hud.finishLoading();
    state.ready = true;
    requestAnimationFrame(() => {
      rig.setMode('oblique');
    });
  } catch (err) {
    console.error(err);
    hud.showError((err && err.message ? err.message : String(err)) + '\n请检查浏览器是否支持 WebGL2，以及 public/vendor 资源是否完整。');
    hud.setLoading('error', 1, '加载失败');
  }

  return api;
}

const clock = new THREE.Clock();
let elapsed = 0;
let frames = 0;
let fpsTime = 0;
let fps = 0;
let minimapTick = 0;
const tmpDir = new THREE.Vector3();
const drag = { active: false, id: -1, x: 0, y: 0, moved: 0, downTime: 0 };
const stick = { id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
let pointerLocked = false;
let prevMode = 'oblique';
const keys = Object.create(null);

function bindInput(api) {
  const { rig, player, selection, tour, hud } = api;
  const pushKey = code => {
    keys[code] = true;
    player.setKey(code, true);
  };
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    pushKey(e.code);
    const map = { Digit1: 'oblique', Digit2: 'iso', Digit3: 'axis', Digit4: 'zone', Digit5: 'focus', Digit6: 'interior', Digit7: 'fp', Digit8: 'orbit' };
    if (map[e.code]) events.emit('request-view', map[e.code]);
    if (e.code === 'KeyF') events.emit('request-fp-toggle');
    if (e.code === 'KeyT') events.emit('request-tour', tour.state.state === 'idle' ? 'start' : 'exit');
    if (e.code === 'Escape') {
      if (pointerLocked) document.exitPointerLock();
      else if (state.fpActive) events.emit('request-view', prevMode);
    }
    if (state.fpActive && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; player.setKey(e.code, false); });
  window.addEventListener('blur', () => { for (const k in keys) { keys[k] = false; player.setKey(k, false); } });

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    if (state.fpActive && e.pointerType !== 'mouse' && stick.id < 0 && e.clientX < window.innerWidth * 0.55 && e.clientY > window.innerHeight * 0.4) {
      stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.dx = 0; stick.dy = 0;
      return;
    }
    drag.active = true; drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY;
    drag.moved = 0; drag.downTime = performance.now();
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId === stick.id) {
      stick.dx = Math.max(-1, Math.min(1, (e.clientX - stick.x0) / 52));
      stick.dy = Math.max(-1, Math.min(1, (e.clientY - stick.y0) / 52));
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (state.fpActive && drag.active && drag.id === e.pointerId && !pointerLocked) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      player.state.yaw -= dx * 0.0032;
      player.state.pitch = Math.max(-1.15, Math.min(1.05, player.state.pitch - dy * 0.0024));
      return;
    }
    if (drag.active && drag.id === e.pointerId) {
      drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    }
    if (!state.fpActive && !pointerLocked) {
      const b = selection.pick(e.clientX - rect.left + rect.left, e.clientY);
      if (b !== state.hoverBuildingId) {
        store.set({ hoverBuildingId: b ? b.id : null });
        selection.setHover(b);
        hud.setTooltip(b, e.clientX, e.clientY);
      } else if (b) {
        hud.setTooltip(b, e.clientX, e.clientY);
      }
    }
  });
  const endPointer = e => {
    if (e.pointerId === stick.id) { stick.id = -1; stick.dx = 0; stick.dy = 0; }
    if (drag.id === e.pointerId) {
      const wasClick = drag.moved < 6 && performance.now() - drag.downTime < 420;
      drag.active = false; drag.id = -1;
      if (wasClick) {
        if (state.fpActive) {
          if (!pointerLocked) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (err) { } }
        } else {
          const b = selection.pick(e.clientX, e.clientY);
          if (b) events.emit('request-select', b.id);
          else events.emit('request-select', null);
        }
      }
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
  document.addEventListener('mousemove', e => {
    if (!pointerLocked) return;
    player.state.yaw -= e.movementX * 0.0026;
    player.state.pitch = Math.max(-1.15, Math.min(1.05, player.state.pitch - e.movementY * 0.0022));
  });

  events.on('request-view', mode => {
    if (!state.ready && mode !== 'oblique') return;
    if (mode === 'fp') {
      if (state.fpActive) return;
      prevMode = rig.mode === 'fp' ? prevMode : rig.mode;
      const spawn = pickSpawn(rig.perspective.position);
      player.spawn(spawn);
      rig.setFp(player);
      store.set({ fpActive: true, viewMode: 'fp', mode: 'walk' });
      hud.setFp(true);
      if (tour.state.state === 'running') tour.pause();
      return;
    }
    if (state.fpActive) {
      document.exitPointerLock();
      rig.exitFp(mode);
    } else {
      rig.setMode(mode, mode === 'zone' ? state.zone : undefined);
    }
    store.set({ viewMode: mode, fpActive: false, mode: mode === 'focus' ? 'focus' : 'view' });
    hud.setViewMode(mode);
    hud.setFp(false);
  });
  events.on('request-fp-toggle', () => {
    events.emit('request-view', state.fpActive ? prevMode : 'fp');
  });
  events.on('request-select', id => {
    const b = id ? LAYOUT.buildings.find(x => x.id === id) : null;
    store.set({ selectedBuildingId: id });
    selection.setSelected(b);
    hud.setInfo(b);
    if (b) rig.focusBuilding(b.id);
  });
  events.on('request-focus', id => {
    const b = LAYOUT.buildings.find(x => x.id === id);
    if (!b) return;
    store.set({ selectedBuildingId: id, viewMode: 'focus', fpActive: false, mode: 'focus' });
    selection.setSelected(b);
    hud.setInfo(b);
    hud.setViewMode('focus');
    hud.setFp(false);
    rig.focusBuilding(id);
  });
  events.on('request-interior', zone => {
    store.set({ viewMode: 'interior', fpActive: false, mode: 'focus' });
    hud.setViewMode('interior');
    hud.setFp(false);
    rig.setMode('interior', zone);
  });
  events.on('request-fp', id => {
    const b = LAYOUT.buildings.find(x => x.id === id);
    if (b) {
      const spawn = { position: { x: b.x, y: b.base, z: b.z + b.d / 2 + 6 }, target: { x: b.x, y: b.base + 1.6, z: b.z } };
      if (state.fpActive) { player.spawn(spawn); }
      else {
        prevMode = 'focus';
        player.spawn(spawn);
        rig.setFp(player);
        store.set({ fpActive: true, viewMode: 'fp' });
        hud.setViewMode('fp');
        hud.setFp(true);
      }
      if (tour.state.state === 'running') tour.pause();
    }
  });
  events.on('request-zone', id => {
    if (id === 'all') { events.emit('request-view', 'oblique'); return; }
    if (id === 'B-main') { events.emit('request-focus', 'B-hall-main'); return; }
    const zone = LAYOUT.zones.find(z => z.id === id);
    if (!zone) return;
    store.set({ zone: id, viewMode: 'zone', fpActive: false });
    hud.setViewMode('zone');
    hud.setFp(false);
    if (state.fpActive) rig.exitFp('zone');
    rig.setMode('zone', id);
  });
  events.on('request-zone-at', p => {
    const z = LAYOUT.zones.find(zz => p.x >= zz.bounds.x0 - 40 && p.x <= zz.bounds.x1 + 40 && p.z >= zz.bounds.z0 - 40 && p.z <= zz.bounds.z1 + 40);
    if (z) events.emit('request-zone', z.id);
  });
  events.on('request-time', id => {
    env_preset(id);
  });
  events.on('request-quality', id => {
    const q = QUALITY[id];
    if (!q) return;
    store.set({ quality: id });
    R.setQuality(q);
    env.setQuality(q);
    hud.setQuality(id);
  });
  events.on('request-tour', action => {
    if (action === 'start') {
      if (state.fpActive) events.emit('request-view', prevMode);
      tour.start();
    } else if (action === 'pause') tour.pause();
    else if (action === 'resume') tour.resume();
    else if (action === 'next') tour.next();
    else if (action === 'prev') tour.prev();
    else if (action === 'exit') tour.exit();
    hud.setTour(tour.state.state, null);
  });
  events.on('tour-stop', s => hud.setTour(tour.state.state, s));
  return { player, keys, stick };
}

function pickSpawn(from) {
  const list = LAYOUT.viewpoints.filter(v => v.mode === 'fp-spawn');
  let best = list[0], bd = Infinity;
  for (const v of list) {
    const d = Math.hypot(v.position.x - from.x, v.position.z - from.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

let envRef = null, RRef = null;
function env_preset(id) {
  if (!envRef) return;
  const p = envRef.applyPreset(id);
  store.set({ timePreset: id });
  if (RRef) RRef.setBloom(p.bloom);
}

async function boot() {
  const api = await init();
  const { rig, player, selection, tour, hud } = api;
  const zones = api.zones;
  envRef = api.env;
  RRef = api.renderer;

  const R = api.renderer;
  const env = api.env;
  boot.renderer = R;
  const input = bindInput(api);
  api.input = input;

  window.addEventListener('resize', () => R.setSize());

  const camDir = new THREE.Vector3();
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    elapsed += dt;

    if (state.ready) {
      if (state.fpActive) {
        player.update(dt, { stick });
        const eye = player.eyePosition();
        const p = rig.perspective;
        p.position.set(eye.x, eye.y, eye.z);
        const cp = Math.cos(player.state.pitch);
        p.lookAt(
          eye.x - Math.sin(player.state.yaw) * cp * 8,
          eye.y + Math.sin(player.state.pitch) * 8,
          eye.z - Math.cos(player.state.yaw) * cp * 8
        );
        p.rotateZ(Math.sin(elapsed * 0.7) * 0.004);
      } else {
        R.setCamera(rig.update(dt));
        rig.controls.enabled = rig.rig.enabled && !rig.tween;
      }
      tour.update(dt);
      if (tour.state.state === 'running' && rig.rig.mode === 'orbit') {
        rig.update(dt);
      }
    } else {
      rig.update(dt);
    }

    env.update(dt, elapsed);
    if (zones) for (const zid of Object.keys(zones)) zones[zid].update(dt, elapsed, state);

    minimapTick += dt;
    if (minimapTick > 0.12) {
      minimapTick = 0;
      rig.perspective.getWorldDirection(camDir);
      hud.minimap.draw(state, { position: state.fpActive ? rig.perspective.position : rig.perspective.position, direction: camDir });
    }

    R.render();
    frames++; fpsTime += dt;
    if (fpsTime >= 1) {
      fps = Math.round(frames / fpsTime);
      frames = 0; fpsTime = 0;
      const info = R.info();
      state.stats = Object.assign({}, LAYOUT.stats, { calls: info.calls, triangles: info.triangles, fps });
      hud.setStats(state.stats);
    }
  }
  requestAnimationFrame(loop);

  api.routeTest = (opts) => {
    const legs = (opts && opts.legs) || [
      { id: 'start-south', x: 0, z: -514, note: '南桥外起点' },
      { id: 'bridge-mid', x: 0, z: -464, note: '御道桥中段' },
      { id: 'gate-south', x: 0, z: -420, note: '午门中门洞' },
      { id: 'gate-inner', x: 0, z: -330, note: '奉天门中门洞' },
      { id: 'plaza-mid', x: 0, z: -250, note: '礼仪广场' },
      { id: 'terrace-front', x: 0, z: -170, note: '丹陛之下' },
      { id: 'terrace-top', x: 0, z: -140, note: '三层台基顶' },
      { id: 'hall-inside', x: 0, z: -66, note: '金銮殿内' },
      { id: 'hall-east', x: 16, z: -66, note: '殿内东绕' },
      { id: 'hall-ne', x: 16, z: -50, note: '宝座东侧' },
      { id: 'hall-north', x: 0, z: -42, note: '金銮殿北门' },
      { id: 'terr-e1', x: 32, z: -4, note: '中和殿东侧' },
      { id: 'terr-e2', x: 32, z: 30, note: '保和殿东侧' },
      { id: 'terr-e3', x: 32, z: 74, note: '台北东侧' },
      { id: 'terr-n', x: 0, z: 84, note: '台北端' },
      { id: 'terr-down', x: 0, z: 108, note: '下三台' },
      { id: 'inner-gate', x: 0, z: 128, note: '乾清门' },
      { id: 'inner-terr', x: 0, z: 150, note: '内廷台基下' },
      { id: 'bed-inside', x: 0, z: 180, note: '乾清宫内' },
      { id: 'bed-north', x: 0, z: 204, note: '寝殿北门' },
      { id: 'kunning-w', x: -22, z: 240, note: '交泰殿西侧' },
      { id: 'kunning-gap', x: -22, z: 258, note: '两殿之间' },
      { id: 'kunning-st', x: 0, z: 257, note: '坤宁宫前阶' },
      { id: 'kunning-top', x: 0, z: 266, note: '登坤宁宫台' },
      { id: 'kunning-e', x: 29, z: 267, note: '坤宁宫东侧' },
      { id: 'kunning-en', x: 29, z: 293, note: '坤宁宫东北' },
      { id: 'kunning-nn', x: 0, z: 293.5, note: '台北中段' },
      { id: 'garden-gate', x: 0, z: 308, note: '顺贞门内' },
      { id: 'garden-front', x: 0, z: 350, note: '钦安殿前' },
      { id: 'garden-e1', x: 32, z: 352, note: '钦安殿东侧' },
      { id: 'garden-e2', x: 30, z: 392, note: '园东北' },
      { id: 'garden-north', x: 10, z: 406, note: '花园北端' }
    ];
    const p = api.player;
    p.state.pos.x = legs[0].x;
    p.state.pos.z = legs[0].z;
    const s0 = api.collision.surfaceAt(legs[0].x, legs[0].z);
    p.state.pos.y = s0 ? s0.y : 0;
    p.state.vel.x = 0; p.state.vel.z = 0;
    const out = [];
    let blockedHits = 0;
    for (let i = 1; i < legs.length; i++) {
      const to = legs[i];
      const from = { x: p.state.pos.x, y: p.state.pos.y, z: p.state.pos.z };
      let steps = 0;
      const budget = 5200;
      let stuckAt = null;
      while (steps < budget) {
        const dx = to.x - p.state.pos.x, dz = to.z - p.state.pos.z;
        if (Math.hypot(dx, dz) < 3.0) break;
        p.state.yaw = Math.atan2(-dx, -dz);
        p.setKey('KeyW', true);
        p.setKey('ShiftLeft', Math.hypot(dx, dz) > 45);
        p.update(1 / 60, {});
        if (p.state.blockedInfo) { blockedHits++; stuckAt = p.state.blockedInfo.id; }
        steps++;
      }
      p.setKey('KeyW', false);
      const surf = api.collision.surfaceAt(p.state.pos.x, p.state.pos.z);
      out.push({
        leg: to.id, note: to.note, target: [to.x, to.z],
        from: [+from.x.toFixed(1), +from.y.toFixed(2), +from.z.toFixed(1)],
        pos: [+p.state.pos.x.toFixed(1), +p.state.pos.y.toFixed(2), +p.state.pos.z.toFixed(1)],
        reached: Math.hypot(to.x - p.state.pos.x, to.z - p.state.pos.z) < 3.6,
        seconds: +(steps / 60).toFixed(1), surface: surf ? surf.kind + '@' + surf.y.toFixed(2) : 'none',
        stuckAt: stuckAt
      });
      if (!out[out.length - 1].reached) break;
    }
    return { legs: out, blockedHits, passed: out.filter(o => o.reached).length, total: legs.length - 1 };
  };
  api.sideRouteTest = () => {
    const legs = [
      { id: 'plaza-w', x: 0, z: -252 },
      { id: 'gap-w', x: -96, z: -252, note: '广场西口' },
      { id: 'bstrip-w', x: -125, z: -330, note: '前朝西侧空地' },
      { id: 'bstrip-sw', x: -130, z: -392, note: '西南角' },
      { id: 'west-in', x: -150, z: -392, note: '进入西宫苑' },
      { id: 'court1-front', x: -171, z: -372, note: '太医院门前' },
      { id: 'court1-gate', x: -171, z: -357, note: '过院门' },
      { id: 'court1-in', x: -171, z: -330, note: '院内' },
      { id: 'court1-out', x: -171, z: -372, note: '出院' },
      { id: 'lane-west', x: -232, z: -372, note: '西夹道' },
      { id: 'court2-gate', x: -262, z: -357, note: '西二列院门' },
      { id: 'court2-in', x: -262, z: -330, note: '西二列院内' },
      { id: 'court2-out', x: -262, z: -372, note: '出院' },
      { id: 'lane-mid', x: -216, z: -230, note: '南北夹道' },
      { id: 'lane-north', x: -216, z: 40, note: '夹道北段' },
      { id: 'grove', x: -215, z: 112, note: '上林苑' },
      { id: 'lake-south', x: -215, z: 142, note: '太液池南' },
      { id: 'lake-mid', x: -215, z: 205, note: '太液桥中段' },
      { id: 'lake-north', x: -215, z: 268, note: '太液池北' },
      { id: 'back-grove', x: -215, z: 112, note: '原路返回林苑' },
      { id: 'back-lane1', x: -216, z: -40, note: '返回夹道中段' },
      { id: 'back-lane', x: -216, z: -230, note: '返回夹道南段' },
      { id: 'back-sw', x: -130, z: -392, note: '回到西南角' },
      { id: 'back-gap', x: -96, z: -252, note: '回到广场西口' },
      { id: 'gap-e', x: 96, z: -252, note: '广场东口' },
      { id: 'bstrip-e', x: 125, z: -330, note: '前朝东侧空地' },
      { id: 'east-in', x: 150, z: -392, note: '进入东宫苑' },
      { id: 'ecourt-front', x: 171, z: -372, note: '东院门前' },
      { id: 'ecourt-gate', x: 171, z: -357, note: '过院门' },
      { id: 'ecourt-in', x: 171, z: -330, note: '东院内' },
      { id: 'ecourt-out', x: 171, z: -372, note: '出院' },
      { id: 'elane-s', x: 214, z: -356, note: '东夹道' },
      { id: 'elane-mid', x: 214, z: 40, note: '东夹道北段' },
      { id: 'etower', x: 250, z: 122, note: '奉天楼下' },
      { id: 'epond-e', x: 210, z: 226, note: '东池东岸' },
      { id: 'epond', x: 176, z: 226, note: '澄波桥' }
    ];
    const p = api.player;
    p.state.pos.x = legs[0].x; p.state.pos.z = legs[0].z;
    const s0 = api.collision.surfaceAt(legs[0].x, legs[0].z);
    p.state.pos.y = s0 ? s0.y : 0;
    p.state.vel.x = 0; p.state.vel.z = 0;
    const out = [];
    for (let i = 1; i < legs.length; i++) {
      const to = legs[i];
      let steps = 0, stuck = null;
      while (steps < 5200) {
        const dx = to.x - p.state.pos.x, dz = to.z - p.state.pos.z;
        if (Math.hypot(dx, dz) < 3.0) break;
        p.state.yaw = Math.atan2(-dx, -dz);
        p.setKey('KeyW', true);
        p.setKey('ShiftLeft', Math.hypot(dx, dz) > 45);
        p.update(1 / 60, {});
        if (p.state.blockedInfo) stuck = p.state.blockedInfo.id;
        steps++;
      }
      p.setKey('KeyW', false);
      const surf = api.collision.surfaceAt(p.state.pos.x, p.state.pos.z);
      out.push({
        leg: to.id, note: to.note || '', reached: Math.hypot(to.x - p.state.pos.x, to.z - p.state.pos.z) < 3.6,
        pos: [+p.state.pos.x.toFixed(1), +p.state.pos.y.toFixed(2), +p.state.pos.z.toFixed(1)],
        seconds: +(steps / 60).toFixed(1), surface: surf ? surf.kind + '@' + surf.y.toFixed(2) : 'none', stuckAt: stuck
      });
      if (!out[out.length - 1].reached) break;
    }
    return { legs: out, passed: out.filter(o => o.reached).length, total: legs.length - 1 };
  };
  api.loop = loop;
  api.ready = () => state.ready;
  window.__APP = api;
  return api;
}

boot();
