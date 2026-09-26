import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './shared/config.js';
import { BOUNDS, CONNECTORS, VIEWS, ZONES } from './shared/layout.js';
import { createPalaceKit } from './kit/palace-kit.js';
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
  $('#loading-status').textContent = '宫阙皆已点亮';
  $('#loading').classList.add('hidden');
  window.setTimeout(() => $('#loading').remove(), 850);
  if (buildingById.size < CONFIG.buildingTargets.min) {
    toast(`建筑清单 ${buildingById.size}/${CONFIG.buildingTargets.min}，仍需补齐`);
  }
}

let cameraMoveToken = 0;
function setView(key, { instant = false } = {}) {
  const view = VIEWS[key] || VIEWS.overview;
  state.tour = false;
  $('#tour-button').classList.remove('is-playing');
  stopWalk();
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  const toPos = new THREE.Vector3(...view.position);
  const toTarget = new THREE.Vector3(...view.target);
  const started = performance.now();
  const duration = instant ? 0 : CONFIG.camera.transition * 1000;
  const token = ++cameraMoveToken;
  function move(now) {
    if (token !== cameraMoveToken) return;
    const t = Math.min(1, duration === 0 ? 1 : (now - started) / duration);
    const ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(fromPos, toPos, ease);
    controls.target.lerpVectors(fromTarget, toTarget, ease);
    controls.update();
    if (t < 1) requestAnimationFrame(move);
    else $('#render-stat').textContent = view.label;
  }
  requestAnimationFrame(move);
}

function setTime(preset) {
  state.timePreset = preset;
  document.querySelectorAll('[data-time]').forEach((button) => button.classList.toggle('active', button.dataset.time === preset));
  const settings = {
    noon: { background: '#c6c4b3', fog: '#c6c4b3', sun: '#fff1d1', power: 3.2, hemi: 2.0, fill: 0.5, exposure: 1.08 },
    sunset: { background: '#a98267', fog: '#b4967c', sun: '#ffb16d', power: 2.5, hemi: 1.15, fill: 0.25, exposure: 1.02 },
    night: { background: '#18212a', fog: '#1a242a', sun: '#90a4c7', power: 0.72, hemi: 0.72, fill: 0.12, exposure: 0.92 }
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
  $('#render-stat').textContent = building.name;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPoint = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
  downPoint = [event.clientX, event.clientY];
  if (state.tour) {
    state.tour = false;
    clearTimeout(tour);
    $('#tour-button').classList.remove('is-playing');
  }
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!downPoint || state.mode !== 'orbit') return;
  if (Math.hypot(event.clientX - downPoint[0], event.clientY - downPoint[1]) > 5) return;
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(mainGroup, true).find((entry) => entry.object.userData.buildingId);
  if (hit) selectBuilding(hit.object.userData.buildingId);
});

const walk = { yaw: 0, pitch: -0.08, keys: new Set(), position: new THREE.Vector3(0, 1.75, -416), speed: 29 };
function startWalk() {
  if (!renderer.domElement.requestPointerLock) return toast('当前浏览器未提供指针锁定；仍可使用鸟瞰游览');
  state.mode = 'walk';
  state.tour = false;
  controls.enabled = false;
  walk.position.set(0, 1.75, -416);
  walk.yaw = 0;
  $('#walk-button').classList.add('active');
  renderer.domElement.requestPointerLock();
  toast('WASD 移动 · Shift 奔跑 · Esc 退出鼠标锁定');
}
function stopWalk() {
  if (state.mode !== 'walk') return;
  state.mode = 'orbit';
  walk.keys.clear();
  controls.enabled = true;
  $('#walk-button').classList.remove('active');
  if (document.pointerLockElement) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && state.mode === 'walk') stopWalk(); });
document.addEventListener('mousemove', (event) => {
  if (state.mode !== 'walk' || document.pointerLockElement !== renderer.domElement) return;
  walk.yaw -= event.movementX * 0.0022;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - event.movementY * 0.0017, -1.05, 1.05);
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyF') state.mode === 'walk' ? stopWalk() : startWalk();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) walk.keys.add(event.code);
});
document.addEventListener('keyup', (event) => walk.keys.delete(event.code));

function collides(x, z) {
  for (const item of buildingById.values()) {
    const [w, d] = item.size;
    if (item.category === 'gate') {
      const alongX = w >= d;
      const opening = Math.max(8, (alongX ? w : d) - 22);
      const inDoorway = alongX
        ? Math.abs(x - item.x) < opening / 2 - 0.7
        : Math.abs(z - item.z) < opening / 2 - 0.7;
      if (inDoorway) continue;
    }
    if (item.visitable) {
      const insideRoom = Math.abs(x - item.x) < w / 2 - 1.8 && Math.abs(z - item.z) < d / 2 - 1.8;
      if (insideRoom) continue;
      const doorApproach = Math.abs(x - item.x) < Math.min(w * 0.18, 4.5) && z < item.z - d / 2 + 1.5 && z > item.z - d / 2 - 3.5;
      if (doorApproach) continue;
    }
    if (Math.abs(x - item.x) < w / 2 + 1.6 && Math.abs(z - item.z) < d / 2 + 1.6) return true;
  }
  for (const zone of zones) {
    for (const wall of zone.colliders || []) {
      const dx = x - wall.center[0], dz = z - wall.center[1];
      const cos = Math.cos(wall.rotation), sin = Math.sin(wall.rotation);
      const localX = cos * dx - sin * dz;
      const localZ = sin * dx + cos * dz;
      if (localX > wall.xMin - 1.1 && localX < wall.xMax + 1.1 && Math.abs(localZ) < wall.halfThickness + 1.05) return true;
    }
  }
  const edge = CONFIG.world.halfWidth - 5;
  if (Math.abs(x) > edge || Math.abs(z) > CONFIG.world.halfDepth - 5) return true;
  // The garden channels are barriers, with walkable axial and side bridges.
  if (z < -CONFIG.world.halfDepth - 5 || z > CONFIG.world.halfDepth + 5) return true;
  return false;
}

function updateWalk(dt) {
  if (state.mode !== 'walk') return;
  const forward = Number(walk.keys.has('KeyW') || walk.keys.has('ArrowUp')) - Number(walk.keys.has('KeyS') || walk.keys.has('ArrowDown'));
  const side = Number(walk.keys.has('KeyD') || walk.keys.has('ArrowRight')) - Number(walk.keys.has('KeyA') || walk.keys.has('ArrowLeft'));
  const speed = walk.speed * (walk.keys.has('ShiftLeft') || walk.keys.has('ShiftRight') ? 1.7 : 1) * dt;
  const dx = (Math.sin(walk.yaw) * forward + Math.cos(walk.yaw) * side) * speed;
  const dz = (Math.cos(walk.yaw) * forward - Math.sin(walk.yaw) * side) * speed;
  if (!collides(walk.position.x + dx, walk.position.z)) walk.position.x += dx;
  if (!collides(walk.position.x, walk.position.z + dz)) walk.position.z += dz;
  walk.position.x = THREE.MathUtils.clamp(walk.position.x, -CONFIG.world.halfWidth + 4, CONFIG.world.halfWidth - 4);
  walk.position.z = THREE.MathUtils.clamp(walk.position.z, -CONFIG.world.halfDepth + 4, CONFIG.world.halfDepth - 4);
  camera.position.copy(walk.position);
  const direction = new THREE.Vector3(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), Math.cos(walk.yaw) * Math.cos(walk.pitch));
  camera.lookAt(walk.position.clone().add(direction));
}

let tour = null;
function startTour() {
  if (state.mode === 'walk') stopWalk();
  const sequence = ['south', 'forecourt', 'hall', 'inner', 'garden'];
  state.tour = true;
  $('#tour-button').classList.add('is-playing');
  let index = 0;
  const visit = () => {
    if (!state.tour || index >= sequence.length) {
      state.tour = false;
      $('#tour-button').classList.remove('is-playing');
      return;
    }
    setView(sequence[index++]);
    state.tour = true;
    tour = setTimeout(visit, 3300);
  };
  if (tour) clearTimeout(tour);
  visit();
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-time]').forEach((button) => button.addEventListener('click', () => setTime(button.dataset.time)));
$('#home-button').addEventListener('click', () => setView('overview'));
$('#walk-button').addEventListener('click', () => state.mode === 'walk' ? stopWalk() : startWalk());
$('#tour-button').addEventListener('click', () => state.tour ? (clearTimeout(tour), state.tour = false, $('#tour-button').classList.remove('is-playing')) : startTour());
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
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  elapsed += dt;
  updateWalk(dt);
  for (const zone of zones) zone.update?.(dt, elapsed, state);
  if (state.mode === 'orbit') controls.update();
  renderer.render(scene, camera);
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
  $('#loading').classList.remove('hidden');
});
animate();
