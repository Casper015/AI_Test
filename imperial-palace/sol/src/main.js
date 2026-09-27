import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './shared/config.js';
import { BOUNDS, CONNECTORS, VIEWS, ZONES } from './shared/layout.js';
import { createPalaceKit } from './kit/palace-kit.js';
import { batchStaticScene, buildingIdForHit } from './shared/static-batch.js';
import { createWalkNavigation } from './interaction/navigation.js';
import './ui/style.css';

const $ = (s) => document.querySelector(s);
const sceneEl = $('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c6c4b3');
scene.fog = new THREE.FogExp2('#c6c4b3', 0.00019);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.5, 3800);
camera.position.fromArray(CONFIG.camera.start);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.quality.maxDpr));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
sceneEl.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.fromArray(CONFIG.camera.target);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 24;
controls.maxDistance = 2100;
controls.maxPolarAngle = Math.PI * 0.495;
controls.screenSpacePanning = false;

const hemi = new THREE.HemisphereLight('#f4e5c8', '#45483e', 2.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d1', 3.2);
sun.position.set(-390, 640, -480);
sun.castShadow = true;
sun.shadow.mapSize.set(CONFIG.quality.shadowSize, CONFIG.quality.shadowSize);
sun.shadow.camera.left = -560;
sun.shadow.camera.right = 560;
sun.shadow.camera.top = 680;
sun.shadow.camera.bottom = -680;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 1450;
sun.shadow.bias = -0.00012;
sun.shadow.normalBias = 0.025;
scene.add(sun);

const fill = new THREE.DirectionalLight('#a6b1ba', 0.5);
fill.position.set(330, 220, 350);
scene.add(fill);

const kit = createPalaceKit(THREE);
const zones = [];
const buildingById = new Map();
let cityBatch = null;
const mainGroup = new THREE.Group();
mainGroup.name = 'Imperial Palace · complete city';
scene.add(mainGroup);

function addBox(name, w, h, d, color, x, y, z, materialOptions = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.93, ...materialOptions }));
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mainGroup.add(mesh);
  return mesh;
}

function buildGround() {
  addBox('Continuous palace land', 670, 2.4, 980, '#6d725f', 0, -1.75, 0);
  addBox('Central procession road', 28, 0.32, 800, '#8a8471', 0, -0.28, -8);
  addBox('Grand forecourt paving', 172, 0.25, 210, '#66675f', 0, -0.22, -175);
  addBox('Inner axial paving', 72, 0.24, 286, '#716b5c', 0, -0.19, 190);
  for (let x of [-126, 126]) addBox(`Side avenue ${x}`, 13, 0.18, 590, '#777365', x, -0.13, 0);
  for (let z of [-285, -102, 130, 248, 350]) addBox(`Cross court ${z}`, 510, 0.15, 11, '#777365', 0, -0.1, z);
  // Repeated square paving marks turn the axial surface into a legible ceremonial route.
  const tile = new THREE.BoxGeometry(10.6, 0.045, 10.6);
  const material = new THREE.MeshStandardMaterial({ color: '#b8a779', roughness: 0.78 });
  const count = 25;
  const paving = new THREE.InstancedMesh(tile, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, -0.105, -392 + i * 31);
    dummy.updateMatrix();
    paving.setMatrixAt(i, dummy.matrix);
  }
  paving.instanceMatrix.needsUpdate = true;
  mainGroup.add(paving);
}

buildGround();

const state = { mode: 'orbit', timePreset: 'noon', snowEnabled: false, quality: 'high', tour: false, selectedBuildingId: null };
const events = new EventTarget();
const zoneCtx = { THREE, kit, config: CONFIG, layout: { BOUNDS, CONNECTORS, VIEWS }, events };

function registerZone(key, zone) {
  zone.root.name = `${key} zone`;
  if (!Array.isArray(zone.colliders)) zone.colliders = [];
  const knownWalls = new Set(zone.colliders.map((wall) => JSON.stringify(wall)));
  zone.root.traverse((node) => {
    for (const wall of node.userData.wallColliders || []) {
      const serialized = JSON.stringify(wall);
      if (!knownWalls.has(serialized)) {
        knownWalls.add(serialized);
        zone.colliders.push(wall);
      }
    }
  });
  mainGroup.add(zone.root);
  zones.push(zone);
  for (const building of zone.buildings) buildingById.set(building.id, building);
}

function showLoadingStatus() {
  const total = [...buildingById.values()].length;
  $('#building-access').textContent = `${total} 栋建筑 · ${zones.reduce((sum, zone) => sum + zone.courtyards.length, 0)} 座庭院`;
}

async function buildCity() {
  const creators = [
    ['forecourt', () => import('./zones/forecourt.js')],
    ['inner', () => import('./zones/inner-palace.js')],
    ['west', () => import('./zones/west-courts.js')],
    ['east', () => import('./zones/east-courts.js')],
    ['garden', () => import('./zones/garden-boundary.js')]
  ];
  for (const [key, loadZone] of creators) {
    const module = await loadZone();
    const result = await module.createZone({ ...zoneCtx, zoneKey: key, zoneLayout: ZONES[key] });
    registerZone(key, result);
    showLoadingStatus();
  }
  cityBatch = batchStaticScene(THREE, mainGroup);
  $('#loading-status').textContent = '宫阙皆已点亮';
  $('#loading').classList.add('hidden');
  window.setTimeout(() => $('#loading').remove(), 850);
  if (buildingById.size < CONFIG.buildingTargets.min) {
    toast(`建筑清单 ${buildingById.size}/${CONFIG.buildingTargets.min}，仍需补齐`);
  }
}

let cameraTween = null;
let tour = null;
let tourIndex = 0;
let tourPaused = false;
function cancelTour() {
  state.tour = false;
  tourPaused = false;
  tourIndex = 0;
  clearTimeout(tour);
  $('#tour-button').classList.remove('is-playing');
  $('#tour-button').innerHTML = '<span>▷</span> 中轴导览';
}
function setView(key, { instant = false, keepTour = false } = {}) {
  const view = typeof key === 'object' ? key : VIEWS[key] || VIEWS.overview;
  if (!keepTour) cancelTour();
  stopWalk();
  controls.minDistance = view.interior ? 2 : 24;
  cameraTween = {
    fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
    toPos: new THREE.Vector3(...view.position), toTarget: new THREE.Vector3(...view.target),
    elapsed: 0, duration: instant ? 0 : CONFIG.camera.transition, label: view.label
  };
}

controls.addEventListener('start', () => {
  cameraTween = null;
  if (state.tour) cancelTour();
});

function setTime(preset) {
  state.timePreset = preset;
  document.querySelectorAll('[data-time]').forEach((button) => button.classList.toggle('active', button.dataset.time === preset));
  const settings = {
    noon: { background: '#c6c4b3', fog: '#c6c4b3', sun: '#fff1d1', power: 3.2, hemi: 2.0, fill: 0.5, exposure: 1.08 },
    sunset: { background: '#a98267', fog: '#b4967c', sun: '#ffb16d', power: 2.5, hemi: 1.15, fill: 0.25, exposure: 1.02 },
    night: { background: '#18212a', fog: '#1a242a', sun: '#a6b8d8', power: 1.1, hemi: 0.95, fill: 0.22, exposure: 1.04 }
  }[preset];
  scene.background.set(settings.background);
  scene.fog.color.set(settings.fog);
  sun.color.set(settings.sun);
  sun.intensity = settings.power;
  hemi.intensity = settings.hemi;
  fill.intensity = settings.fill;
  renderer.toneMappingExposure = settings.exposure;
  kit.materials.roof.emissive.set(preset === 'night' ? '#38220c' : '#000000');
  kit.materials.roof.emissiveIntensity = preset === 'night' ? 0.2 : 0;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), 2300);
}

function selectBuilding(id) {
  const building = buildingById.get(id);
  if (!building) return;
  state.selectedBuildingId = id;
  $('#building-category').textContent = `${building.category.toUpperCase()} · PALACE REGISTER`;
  $('#building-name').textContent = building.name;
  $('#building-description').textContent = building.description;
  $('#building-access').textContent = building.visitable ? '可进入 · 内景开放' : building.access || '外观可览';
  $('#building-card').classList.add('has-selection');
  const visit = $('#visit-button');
  if (visit) visit.hidden = !building.interiorView;
  $('#render-stat').textContent = building.name;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPoint = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
  downPoint = [event.clientX, event.clientY];
  if (state.tour) cancelTour();
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!downPoint || state.mode !== 'orbit') return;
  if (Math.hypot(event.clientX - downPoint[0], event.clientY - downPoint[1]) > 5) return;
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(mainGroup, true).map((entry) => buildingIdForHit(entry)).find(Boolean);
  if (hit) selectBuilding(hit);
});

const walk = { yaw: 0, pitch: -0.08, keys: new Set(), position: new THREE.Vector3(0, 1.75, -480), speed: 23, paused: false };
function startWalk() {
  if (!renderer.domElement.requestPointerLock) return toast('当前浏览器未提供指针锁定；仍可使用鸟瞰游览');
  if (state.mode === 'walk') {
    renderer.domElement.requestPointerLock();
    return;
  }
  state.mode = 'walk';
  cancelTour();
  cameraTween = null;
  controls.enabled = false;
  walk.position.set(0, 1.75, -480);
  walk.yaw = 0;
  walk.paused = false;
  $('#walk-button').classList.add('active');
  renderer.domElement.requestPointerLock();
  toast('从南桥入宫 · WASD 移动 · Shift 加速 · Esc 暂停');
}
function stopWalk() {
  if (state.mode !== 'walk') return;
  state.mode = 'orbit';
  walk.paused = false;
  walk.keys.clear();
  controls.enabled = true;
  $('#walk-button').classList.remove('active');
  $('#walk-button').innerHTML = '<span>⌖</span> 御前漫步 <kbd>F</kbd>';
  if (document.pointerLockElement) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  if (state.mode !== 'walk') return;
  walk.paused = document.pointerLockElement !== renderer.domElement;
  walk.keys.clear();
  $('#walk-button').innerHTML = walk.paused ? '<span>⌖</span> 恢复漫游 <kbd>F</kbd>' : '<span>⌖</span> 御前漫步 <kbd>F</kbd>';
  if (walk.paused) toast('已暂停漫游 · 点击“恢复漫游”或按 F 继续');
});
document.addEventListener('mousemove', (event) => {
  if (state.mode !== 'walk' || document.pointerLockElement !== renderer.domElement) return;
  walk.yaw -= event.movementX * 0.0022;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - event.movementY * 0.0017, -1.05, 1.05);
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyF') {
    if (state.mode === 'walk' && !walk.paused) stopWalk();
    else startWalk();
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) walk.keys.add(event.code);
});
document.addEventListener('keyup', (event) => walk.keys.delete(event.code));

const navigation = createWalkNavigation(buildingById, zones);
const { groundHeight } = navigation;
const collides = (x, z) => navigation.collides(x, z, groundHeight(walk.position.x, walk.position.z));

function updateWalk(dt) {
  if (state.mode !== 'walk') return;
  if (walk.paused) return;
  const forward = Number(walk.keys.has('KeyW') || walk.keys.has('ArrowUp')) - Number(walk.keys.has('KeyS') || walk.keys.has('ArrowDown'));
  const side = Number(walk.keys.has('KeyD') || walk.keys.has('ArrowRight')) - Number(walk.keys.has('KeyA') || walk.keys.has('ArrowLeft'));
  const speed = walk.speed * (walk.keys.has('ShiftLeft') || walk.keys.has('ShiftRight') ? 1.7 : 1) * dt;
  const dx = (Math.sin(walk.yaw) * forward + Math.cos(walk.yaw) * side) * speed;
  const dz = (Math.cos(walk.yaw) * forward - Math.sin(walk.yaw) * side) * speed;
  if (!collides(walk.position.x + dx, walk.position.z)) walk.position.x += dx;
  if (!collides(walk.position.x, walk.position.z + dz)) walk.position.z += dz;
  const targetY = groundHeight(walk.position.x, walk.position.z) + 1.75;
  walk.position.y = THREE.MathUtils.damp(walk.position.y, targetY, 12, dt);
  camera.position.copy(walk.position);
  const direction = new THREE.Vector3(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), Math.cos(walk.yaw) * Math.cos(walk.pitch));
  camera.lookAt(walk.position.clone().add(direction));
}

function startTour() {
  if (state.mode === 'walk') stopWalk();
  const sequence = ['south', 'forecourt', 'hall', 'inner', 'garden'];
  if (!state.tour) tourIndex = 0;
  state.tour = true;
  tourPaused = false;
  $('#tour-button').classList.add('is-playing');
  $('#tour-button').innerHTML = '<span>Ⅱ</span> 暂停导览';
  const visit = () => {
    if (!state.tour || tourPaused) return;
    if (tourIndex >= sequence.length) {
      cancelTour();
      toast('中轴导览已结束');
      return;
    }
    setView(sequence[tourIndex++], { keepTour: true });
    tour = setTimeout(visit, 3300);
  };
  clearTimeout(tour);
  visit();
}
function pauseTour() {
  tourPaused = true;
  clearTimeout(tour);
  $('#tour-button').classList.remove('is-playing');
  $('#tour-button').innerHTML = '<span>▷</span> 继续导览';
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-time]').forEach((button) => button.addEventListener('click', () => setTime(button.dataset.time)));
$('#home-button').addEventListener('click', () => setView('overview'));
$('#visit-button')?.addEventListener('click', () => {
  const building = buildingById.get(state.selectedBuildingId);
  if (building?.interiorView) setView({ ...building.interiorView, interior: true, label: `${building.name} · 内景` });
});
$('#retry-button').addEventListener('click', () => window.location.reload());
$('#walk-button').addEventListener('click', () => state.mode === 'walk' && !walk.paused ? stopWalk() : startWalk());
$('#tour-button').addEventListener('click', () => state.tour && !tourPaused ? pauseTour() : startTour());
$('#quality-button').addEventListener('click', () => {
  state.quality = state.quality === 'high' ? 'low' : 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, state.quality === 'high' ? CONFIG.quality.maxDpr : CONFIG.quality.lowDpr));
  renderer.setSize(innerWidth, innerHeight);
  sun.shadow.mapSize.set(state.quality === 'high' ? CONFIG.quality.shadowSize : 768, state.quality === 'high' ? CONFIG.quality.shadowSize : 768);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  $('#quality-button').textContent = state.quality === 'high' ? '高清' : '流畅';
});

const timer = new THREE.Timer();
timer.connect(document);
let elapsed = 0;
let frameCount = 0;
const frameSamples = [];
window.palaceDebug = {
  snapshot: () => ({
    mode: state.mode, walkPaused: walk.paused, position: walk.position.toArray(),
    selectedBuildingId: state.selectedBuildingId, timePreset: state.timePreset,
    tour: state.tour, tourPaused, quality: state.quality,
    buildings: buildingById.size, courtyards: zones.reduce((count, zone) => count + zone.courtyards.length, 0),
    renderCallsIncludingShadows: renderer.info.render.calls,
    trianglesIncludingShadows: renderer.info.render.triangles,
    batchedSourceMeshes: cityBatch?.sourceMeshes || 0,
    staticBatches: cityBatch?.batchMeshes || 0,
    meanFps: frameSamples.length ? Math.round(frameSamples.length / frameSamples.reduce((sum, sample) => sum + sample, 0)) : null,
    p95FrameMs: frameSamples.length ? Math.round([...frameSamples].sort((a, b) => a - b)[Math.floor(frameSamples.length * .95)] * 1000) : null
  })
};
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  elapsed += dt;
  frameCount++;
  if (dt > 0) {
    frameSamples.push(dt);
    if (frameSamples.length > 1800) frameSamples.shift();
  }
  if (cameraTween && state.mode === 'orbit') {
    cameraTween.elapsed += dt;
    const t = cameraTween.duration ? Math.min(1, cameraTween.elapsed / cameraTween.duration) : 1;
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
    if (t >= 1) {
      $('#render-stat').textContent = cameraTween.label;
      cameraTween = null;
    }
  }
  updateWalk(dt);
  for (const zone of zones) zone.update?.(dt, elapsed, state);
  if (state.mode === 'orbit') controls.update();
  // A full-city shadow pass duplicates thousands of tiny roof details while
  // contributing little at map scale. Keep one sun shadow only near the user.
  sun.castShadow = state.quality === 'high' && state.timePreset !== 'night' &&
    (state.mode === 'walk' || camera.position.distanceTo(controls.target) < 520);
  renderer.render(scene, camera);
  if (frameCount % 10 === 0) {
    const [x, z] = state.mode === 'walk' ? [walk.position.x, walk.position.z] : [controls.target.x, controls.target.z];
    const marker = $('#map-player');
    marker.style.left = `${THREE.MathUtils.clamp((x + 300) / 600 * 100, 4, 96)}%`;
    marker.style.top = `${THREE.MathUtils.clamp((450 - z) / 900 * 100, 4, 96)}%`;
  }
  const info = renderer.info.render;
  const stat = $('#render-stat');
  if (!state.tour && state.mode === 'orbit' && !state.selectedBuildingId) {
    stat.textContent = `${buildingById.size} 栋宫殿 · ${info.calls} 次绘制 · ${Math.round(info.triangles / 1000)}k 面`;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, state.quality === 'high' ? CONFIG.quality.maxDpr : CONFIG.quality.lowDpr));
  renderer.setSize(innerWidth, innerHeight);
});

buildCity().catch((error) => {
  console.error(error);
  $('.loading-title').textContent = '宫门暂未开启';
  $('#loading-caption').textContent = '加载区域失败，请刷新重试';
  $('#retry-button').hidden = false;
  $('#loading').classList.remove('hidden');
});
animate();
