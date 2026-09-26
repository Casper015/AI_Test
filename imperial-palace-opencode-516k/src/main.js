import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as config from './shared/config.js';
import * as layout from './shared/layout.js';
import { EV } from './shared/events.js';
import { rngFor } from './shared/rng.js';
import { createRenderer } from './core/renderer.js';
import { createEnvironment } from './core/environment.js';
import { createState } from './core/state.js';
import { createRegistry } from './core/registry.js';
import { createCameraRig } from './core/camera.js';
import { createTerrain } from './core/terrain.js';
import { loadZones } from './core/loader.js';
import { createKit } from './kit/index.js';
import { mount as mountUI } from './ui/index.js';
import { mount as mountInteraction } from './interaction/index.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');

const { renderer, resize, setQuality } = createRenderer({ THREE, config, quality: params.get('q') || 'high' });
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const state = createState({ quality: params.get('q') || 'high' });
const bus = state.bus;
const set = state.set.bind(state);
const registry = createRegistry({ THREE, config, layout });
const kit = createKit({ THREE, config, rng: rngFor('city') });
const env = createEnvironment({ THREE, scene, config, kit, registry });
scene.add(createTerrain({ THREE, config, kit }));

const rig = createCameraRig({ THREE, OrbitControls, config, state, bus, registry, dom: renderer.domElement });

registry.addSurface('ground.palace', -config.CITY.halfX, -config.CITY.halfZ, config.CITY.halfX, config.CITY.halfZ, 0, 'ground');
const apron = 1200;
registry.addSurface('ground.apron.s', -apron, -1500, apron, -config.CITY.halfZ - config.CITY.moatW, -0.5, 'ground');
registry.addSurface('ground.apron.n', -apron, config.CITY.halfZ + config.CITY.moatW, apron, 1500, -0.5, 'ground');
registry.addSurface('ground.apron.w', -apron, -1500, -config.CITY.halfX - config.CITY.moatW, 1500, -0.5, 'ground');
registry.addSurface('ground.apron.e', config.CITY.halfX + config.CITY.moatW, -1500, apron, 1500, -0.5, 'ground');
const bands = [
  [-config.CITY.halfX - config.CITY.moatW, -config.CITY.halfZ - config.CITY.moatW, -config.CITY.halfX, config.CITY.halfZ + config.CITY.moatW],
  [config.CITY.halfX, -config.CITY.halfZ - config.CITY.moatW, config.CITY.halfX + config.CITY.moatW, config.CITY.halfZ + config.CITY.moatW],
  [-config.CITY.halfX, -config.CITY.halfZ - config.CITY.moatW, config.CITY.halfX, -config.CITY.halfZ],
  [-config.CITY.halfX, config.CITY.halfZ, config.CITY.halfX, config.CITY.halfZ + config.CITY.moatW]
];
bands.forEach((b, i) => registry.addSurface(`water.moat.${i}`, b[0], b[1], b[2], b[3], -1.6, 'water'));

const ctx = { THREE, config, layout, kit, rng: rngFor, events: EV, bus, state, registry, quality: state.quality };

function onProgress(done, total, zoneId, source, result) {
  const percent = Math.round((done / total) * 100);
  if (loadingBar) loadingBar.style.width = `${percent}%`;
  if (loadingText) loadingText.textContent = `正在营建 ${layout.ZONES[zoneId].name}… ${percent}%`;
  set({ loading: { done, total, zone: zoneId } }, EV.LOAD_PROGRESS);
  void source;
  void result;
}

async function boot() {
  const zones = await loadZones({ ctx, registry, onProgress });
  for (const id of Object.keys(zones)) scene.add(zones[id].root);

  setQuality(params.get('q') || 'high');
  const preset = params.get('preset') || 'golden';
  env.setPreset(preset);
  set({ timePreset: preset, phase: 'ready' });

  const view = params.get('view');
  if (view) {
    rig.setInstant(params.get('instant') !== '0');
    rig.applyViewMode(view, {
      id: params.get('id') || undefined,
      spawnId: params.get('spawn') || undefined,
      instant: params.get('instant') !== '0'
    });
  }
  if (params.get('tour') === '1') rig.startTour();
  if (loadingEl) {
    loadingEl.classList.add('done');
    if (params.get('shot') === '1' || params.get('ui') === '0') loadingEl.style.display = 'none';
  }
  resize([rig.persp, rig.ortho]);
  window.addEventListener('resize', () => resize([rig.persp, rig.ortho]));
  const stat = document.getElementById('stats');

  const uiCtx = { THREE, config, layout, state, bus, registry, rig, env, zones, renderer, scene, setQuality, resize };
  if (params.get('ui') !== '0') {
    try {
      mountUI(uiCtx);
    } catch (err) {
      bus.emit(EV.ERROR, { message: String((err && err.message) || err) });
    }
    try {
      mountInteraction(uiCtx);
    } catch (err) {
      bus.emit(EV.ERROR, { message: String((err && err.message) || err) });
    }
  }

  env.update(0, new THREE.Vector3(0, 0, 0));
  rig.update(0);
  renderer.render(scene, rig.activeCamera());
  renderer.render(scene, rig.activeCamera());
  if (params.get('shot') === '1') {
    const holder = document.createElement('pre');
    holder.id = 'shotdata';
    try {
      holder.textContent = renderer.domElement.toDataURL('image/png');
    } catch (err) {
      holder.textContent = 'CAPTURE_FAIL ' + (err && err.message);
    }
    document.body.appendChild(holder);
  }

  bus.emit(EV.READY, { buildings: registry.buildings.size, zones: Object.keys(zones).length });

  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  let frames = 0;
  let acc = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.06);
    const t = clock.elapsedTime;
    for (const id of Object.keys(zones)) zones[id].update(dt, t, state);
    focus.set(rig.persp.position.x, 0, rig.persp.position.z);
    if (state.viewMode === 'iso' || state.viewMode === 'oblique' || state.viewMode === 'orbit') focus.set(0, 0, 0);
    env.update(dt, focus);
    rig.update(dt);
    renderer.render(scene, rig.activeCamera());
    frames++;
    acc += dt;
    if (acc > 0.5) {
      const info = renderer.info.render;
      set({ stats: { fps: Math.round(frames / acc), calls: info.calls, tris: info.triangles, ms: Math.round((acc / frames) * 1000) } }, EV.STATS);
      if (stat && params.get('stats') === '1') {
        const cam = rig.activeCamera();
        stat.textContent = `calls ${info.calls} tris ${info.triangles} active=${cam.isOrthographicCamera ? 'ortho' : 'persp'} pos ${cam.position.toArray().map((v) => Math.round(v)).join(',')} bldg ${registry.buildings.size}`;
      }
      frames = 0;
      acc = 0;
    }
  });

  window.__PALACE__ = { THREE, scene, renderer, registry, rig, env, state, bus, zones, config, layout, kit };
}

boot().catch((err) => {
  console.error(err);
  set({ phase: 'error' }, EV.ERROR);
  bus.emit(EV.ERROR, { message: String((err && err.message) || err) });
});
