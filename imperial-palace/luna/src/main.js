import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CONFIG, ZONE_NAMES } from './shared/config.js';
import { createPalace } from './zones/createPalace.js';
import './ui/style.css';

const rootElement = document.querySelector('#scene-root');
const loader = document.querySelector('#loader');
const toastElement = document.querySelector('#toast');
const detailElements = {
  empty: document.querySelector('#empty-detail'),
  body: document.querySelector('#building-detail'),
  category: document.querySelector('#detail-category'),
  name: document.querySelector('#detail-name'),
  description: document.querySelector('#detail-description'),
  access: document.querySelector('#detail-access'),
  zone: document.querySelector('#detail-zone'),
  index: document.querySelector('#detail-index'),
  visit: document.querySelector('#visit-building'),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.palette.day.sky);
scene.fog = new THREE.Fog(CONFIG.palette.day.fog, 1650, 3500);

const camera = new THREE.PerspectiveCamera(37, window.innerWidth / window.innerHeight, 0.5, 2600);
camera.position.set(...CONFIG.zones.all.camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'palace-canvas';
renderer.domElement.setAttribute('aria-label', '宫城三维场景，可拖动旋转和缩放');
rootElement.append(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffecd0, 0x344138, CONFIG.palette.day.ambient);
scene.add(hemi);
const sun = new THREE.DirectionalLight(CONFIG.palette.day.sun, CONFIG.palette.day.sunIntensity);
sun.position.set(-320, 760, -460);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -520;
sun.shadow.camera.right = 520;
sun.shadow.camera.top = 620;
sun.shadow.camera.bottom = -620;
sun.shadow.camera.near = 50;
sun.shadow.camera.far = 1500;
sun.shadow.bias = -0.0003;
scene.add(sun);
scene.add(sun.target);

const palace = createPalace();
scene.add(palace.root);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(...CONFIG.zones.all.target);
orbit.enableDamping = true;
orbit.dampingFactor = 0.075;
orbit.minDistance = 185;
orbit.maxDistance = 2050;
orbit.maxPolarAngle = 1.46;
orbit.minPolarAngle = 0.14;
orbit.zoomSpeed = 0.72;
orbit.panSpeed = 0.62;
orbit.update();

const pointerLock = new PointerLockControls(camera, renderer.domElement);
const raycaster = new THREE.Raycaster();
raycaster.instance = true;
raycaster.far = 1900;
const pointer = new THREE.Vector2();
const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1, 56),
  new THREE.MeshBasicMaterial({ color: 0xffda86, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }),
);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.visible = false;
scene.add(selectionRing);

const state = {
  selectedBuildingId: null,
  selectedBuilding: null,
  currentZone: 'all',
  timePreset: 'day',
  currentInteriorId: null,
  hiddenRoofId: null,
  tourActive: false,
  walking: false,
  pointer: { forward: false, backward: false, left: false, right: false, fast: false },
  cameraTween: null,
};

const buildingIndex = new Map(palace.buildings.map((building, index) => [building.id, index + 1]));
const markerScale = new THREE.Vector3();
let toastTimer = 0;
let lastMapPaint = 0;
let hoveredBuilding = null;
let lastFrame = performance.now();
let pointerDown = null;
let selectionBaseScale = 0;

document.querySelector('#building-count').textContent = palace.stats.buildings;
document.querySelector('#courtyard-count').textContent = palace.stats.courtyards;
detailElements.index.textContent = `— / ${palace.stats.buildings}`;

function toast(message, duration = 2500) {
  toastElement.textContent = message;
  toastElement.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastElement.classList.remove('visible'), duration);
}

function setCameraView(view, duration = 1450) {
  if (view === 'all' && state.currentInteriorId) exitInterior(false);
  const targetView = typeof view === 'string' ? CONFIG.zones[view] : view;
  if (!targetView) return;
  const endPosition = new THREE.Vector3(...targetView.camera);
  const endTarget = new THREE.Vector3(...targetView.target);
  state.cameraTween = {
    start: performance.now(),
    duration,
    fromPosition: camera.position.clone(),
    toPosition: endPosition,
    fromTarget: orbit.target.clone(),
    toTarget: endTarget,
  };
  orbit.enabled = false;
  if (typeof view === 'string') {
    state.currentZone = view;
    document.querySelector('#location-label').textContent = targetView.label;
    document.querySelectorAll('.zone-button').forEach((button) => button.classList.toggle('active', button.dataset.zone === view));
  }
}

function updateTween(now) {
  const tween = state.cameraTween;
  if (!tween) return;
  const t = Math.min(1, (now - tween.start) / tween.duration);
  const eased = t * t * (3 - 2 * t);
  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  orbit.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  camera.lookAt(orbit.target);
  if (t >= 1) {
    state.cameraTween = null;
    orbit.enabled = !state.walking;
    orbit.update();
  }
}

function setZone(zone) {
  if (state.walking) stopWalking();
  if (state.currentInteriorId && zone !== 'hall' && zone !== 'inner') exitInterior(false);
  stopTour(false);
  setCameraView(zone);
}

function updateDetail(building) {
  if (!building) {
    detailElements.empty.classList.remove('hidden');
    detailElements.body.classList.add('hidden');
    detailElements.index.textContent = `— / ${palace.stats.buildings}`;
    detailElements.visit.disabled = true;
    detailElements.visit.innerHTML = '<span>选择一座宫殿</span><span>↗</span>';
    return;
  }
  const index = buildingIndex.get(building.id) || 1;
  detailElements.empty.classList.add('hidden');
  detailElements.body.classList.remove('hidden');
  detailElements.category.textContent = building.category;
  detailElements.name.textContent = building.name;
  detailElements.description.textContent = building.description;
  detailElements.zone.textContent = ZONE_NAMES[building.zone] || '宫城';
  detailElements.access.textContent = building.interior ? '可进入 · 室内陈设' : '外观可观 · 内景未开放';
  detailElements.index.textContent = `${String(index).padStart(2, '0')} / ${palace.stats.buildings}`;
  const inThisInterior = state.currentInteriorId === building.id;
  detailElements.visit.disabled = !building.interior && !inThisInterior;
  detailElements.visit.innerHTML = inThisInterior
    ? '<span>退出殿内</span><span>↗</span>'
    : building.interior
      ? '<span>进入殿内</span><span>↗</span>'
      : '<span>此殿暂无内景</span><span>—</span>';
}

function setSelectedBuilding(building) {
  state.selectedBuildingId = building?.id || null;
  state.selectedBuilding = building || null;
  if (building) {
    selectionRing.visible = true;
    selectionRing.position.set(building.x, building.platform + 0.55, building.z);
    const radius = Math.max(building.width, building.depth) * 0.56;
    selectionBaseScale = radius;
    selectionRing.scale.setScalar(radius);
    updateDetail(building);
    if (state.currentInteriorId !== building.id) {
      state.currentZone = building.zone;
      document.querySelector('#location-label').textContent = building.name;
      document.querySelectorAll('.zone-button').forEach((button) => button.classList.toggle('active', button.dataset.zone === building.zone));
    }
  } else {
    selectionRing.visible = false;
    updateDetail(null);
  }
}

function getBuildingFromHit(hit) {
  const data = hit.object.userData.instanceData?.[hit.instanceId];
  return data?.building || null;
}

function pickAt(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(palace.pickableMeshes, false);
  return intersections.map(getBuildingFromHit).find(Boolean) || null;
}

function setRoofHidden(id, hidden) {
  const roofRefs = palace.roofInstances.get(id) || [];
  for (const { mesh, instanceId, record } of roofRefs) {
    mesh.setMatrixAt(instanceId, hidden ? new THREE.Matrix4().makeScale(0, 0, 0) : record.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function visitSelectedBuilding() {
  const building = state.selectedBuilding;
  if (!building) return;
  if (state.currentInteriorId === building.id) {
    exitInterior();
    return;
  }
  if (!building.interior) {
    toast('这座建筑目前提供外观与院落游览，内景尚未开放。');
    return;
  }
  if (state.walking) stopWalking();
  state.currentInteriorId = building.id;
  state.hiddenRoofId = building.id;
  setRoofHidden(building.id, true);
  orbit.minDistance = 3;
  orbit.maxDistance = 90;
  const platform = building.platform;
  const view = {
    target: [building.x, platform + 1.8, building.z - building.depth * 0.05],
    camera: [building.x + building.width * 0.35, platform + building.width * 0.52, building.z - building.depth * 1.15],
  };
  setCameraView(view, 1250);
  updateDetail(building);
  toast(`进入${building.name} · 屋顶已隐去以展示室内陈设`);
}

function exitInterior(showMessage = true) {
  if (!state.currentInteriorId) return;
  const oldId = state.currentInteriorId;
  if (state.hiddenRoofId) setRoofHidden(state.hiddenRoofId, false);
  state.currentInteriorId = null;
  state.hiddenRoofId = null;
  orbit.minDistance = 185;
  orbit.maxDistance = 2050;
  updateDetail(state.selectedBuilding);
  if (showMessage) toast('已退出殿内，返回宫城游览。');
  const zone = state.selectedBuilding?.zone === 'inner' ? 'inner' : 'forecourt';
  setCameraView(zone, 1100);
  void oldId;
}

function setTimePreset(preset) {
  const palette = CONFIG.palette[preset];
  if (!palette) return;
  state.timePreset = preset;
  scene.background.setHex(palette.sky);
  scene.fog.color.setHex(palette.fog);
  sun.color.setHex(palette.sun);
  sun.intensity = palette.sunIntensity;
  sun.position.set(preset === 'dusk' ? 430 : -320, 760, preset === 'night' ? 360 : -460);
  hemi.intensity = palette.ambient;
  hemi.color.setHex(preset === 'night' ? 0x8299be : preset === 'dusk' ? 0xffc4a4 : 0xffecd0);
  hemi.groundColor.setHex(preset === 'night' ? 0x172137 : 0x344138);
  renderer.toneMappingExposure = preset === 'night' ? 0.78 : preset === 'dusk' ? 0.9 : 0.88;
  const lantern = palace.materials.get('lantern');
  if (lantern) lantern.emissiveIntensity = preset === 'night' ? 2.3 : preset === 'dusk' ? 1.2 : 0.38;
  document.querySelectorAll('.time-button').forEach((button) => button.classList.toggle('active', button.dataset.time === preset));
  const names = { day: '金辉', dusk: '落霞', night: '寒月' };
  toast(`时辰已切换：${names[preset]}`);
}

function stopTour(showToast = true) {
  if (!state.tourActive) return;
  state.tourActive = false;
  document.querySelector('#tour-button').classList.remove('is-playing');
  document.querySelector('#tour-button').innerHTML = '<span class="play-icon">▶</span><span>沿中轴巡游</span>';
  if (showToast) toast('中轴巡游已暂停');
}

async function startTour() {
  if (state.tourActive) {
    stopTour();
    return;
  }
  if (state.walking) stopWalking();
  if (state.currentInteriorId) exitInterior(false);
  state.tourActive = true;
  const button = document.querySelector('#tour-button');
  button.classList.add('is-playing');
  button.innerHTML = '<span class="play-icon">Ⅱ</span><span>暂停巡游</span>';
  const stops = [
    ['forecourt', '从午门进入前朝礼仪轴线'],
    ['hall', '登临太和殿前，俯瞰广场与台基'],
    ['inner', '穿过乾清门，来到后宫内廷'],
    ['garden', '巡游终点：御花园与北部宫苑'],
    ['all', '回望整座宫城'],
  ];
  for (const [zone, narration] of stops) {
    if (!state.tourActive) break;
    setCameraView(zone, zone === 'all' ? 1600 : 1250);
    toast(narration, 2800);
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  if (state.tourActive) {
    stopTour(false);
    toast('中轴巡游结束');
  }
}

function collisionAt(x, z) {
  if (x < -268 || x > 268 || z < -398 || z > 398) return true;
  const clearance = 5.5;
  for (const building of palace.buildings) {
    if (building.id === state.currentInteriorId) continue;
    const inFootprint = Math.abs(x - building.x) < building.width / 2 + clearance && Math.abs(z - building.z) < building.depth / 2 + clearance;
    const clearDoor = Math.abs(x - building.x) < Math.max(4.5, building.width * 0.085) && Math.abs(z - building.z) < building.depth / 2 + clearance;
    if (inFootprint && !clearDoor) return true;
  }
  return false;
}

function startWalking() {
  if (state.walking) {
    pointerLock.unlock();
    return;
  }
  if (state.cameraTween) state.cameraTween = null;
  orbit.enabled = false;
  if (state.currentInteriorId && state.selectedBuilding) {
    const building = state.selectedBuilding;
    camera.position.set(building.x, building.platform + 6.5, building.z - building.depth * 0.24);
    camera.lookAt(building.x, building.platform + 5.8, building.z + building.depth * 0.12);
  } else {
    camera.position.set(0, 8.3, -370);
    camera.lookAt(0, 8.3, -305);
    orbit.target.set(0, 8, -280);
  }
  pointerLock.lock();
}

function stopWalking() {
  if (pointerLock.isLocked) pointerLock.unlock();
  else {
    state.walking = false;
    orbit.enabled = true;
  }
  document.querySelector('#walk-button').classList.remove('is-active');
}

pointerLock.addEventListener('lock', () => {
  state.walking = true;
  orbit.enabled = false;
  document.querySelector('#walk-button').classList.add('is-active');
  toast('漫游模式：WASD 移动，Shift 加速，Esc 返回');
});
pointerLock.addEventListener('unlock', () => {
  state.walking = false;
  orbit.enabled = !state.cameraTween;
  document.querySelector('#walk-button').classList.remove('is-active');
});

function paintMinimap() {
  const canvas = document.querySelector('#minimap');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#17201b';
  ctx.fillRect(0, 0, width, height);
  const bounds = { left: 25, right: width - 25, top: 18, bottom: height - 16 };
  const mapX = (x) => bounds.left + ((x + 325) / 650) * (bounds.right - bounds.left);
  const mapZ = (z) => bounds.top + ((410 - z) / 820) * (bounds.bottom - bounds.top);
  ctx.fillStyle = '#23312b';
  ctx.fillRect(mapX(-300), mapZ(410), mapX(300) - mapX(-300), mapZ(-410) - mapZ(410));
  ctx.strokeStyle = 'rgba(126, 177, 169, .3)';
  ctx.lineWidth = 4;
  ctx.strokeRect(mapX(-307), mapZ(417), mapX(307) - mapX(-307), mapZ(-417) - mapZ(417));
  ctx.strokeStyle = 'rgba(216, 179, 116, .82)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mapX(0), mapZ(-390));
  ctx.lineTo(mapX(0), mapZ(365));
  ctx.stroke();
  ctx.fillStyle = 'rgba(177, 125, 79, .22)';
  ctx.fillRect(mapX(-228), mapZ(120), mapX(-120) - mapX(-228), mapZ(-300) - mapZ(120));
  ctx.fillRect(mapX(120), mapZ(120), mapX(228) - mapX(120), mapZ(-300) - mapZ(120));
  ctx.fillStyle = 'rgba(103, 135, 95, .3)';
  ctx.fillRect(mapX(-155), mapZ(400), mapX(155) - mapX(-155), mapZ(310) - mapZ(400));
  for (const building of palace.buildings) {
    ctx.fillStyle = building.id === state.selectedBuildingId ? '#f3ce83' : building.kind === 'grand' ? '#eacb8c' : '#b36d4c';
    ctx.fillRect(mapX(building.x) - 1.5, mapZ(building.z) - 1.5, building.kind === 'grand' ? 4 : 3, building.kind === 'grand' ? 4 : 3);
  }
  const locationX = state.walking ? camera.position.x : orbit.target.x;
  const locationZ = state.walking ? camera.position.z : orbit.target.z;
  ctx.beginPath();
  ctx.fillStyle = '#fff0cf';
  ctx.shadowColor = '#ffbd66';
  ctx.shadowBlur = 10;
  ctx.arc(mapX(locationX), mapZ(locationZ), 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#c1aa7c';
  ctx.font = '10px sans-serif';
  ctx.fillText('北', width / 2 - 4, 12);
}

function updateCoordinate() {
  const point = state.walking ? camera.position : orbit.target;
  let label = '宫城 · 中心';
  if (point.z > 302) label = '宫城 · 御花园';
  else if (point.z > 82) label = '宫城 · 后宫';
  else if (point.x < -100) label = '宫城 · 西侧宫苑';
  else if (point.x > 100) label = '宫城 · 东侧宫苑';
  else if (point.z < -90) label = '宫城 · 前朝';
  document.querySelector('#coordinate-label').textContent = label;
}

function updateWalking(delta) {
  if (!state.walking || !pointerLock.isLocked) return;
  const speed = (state.pointer.fast ? 74 : 38) * delta;
  const forward = Number(state.pointer.forward) - Number(state.pointer.backward);
  const side = Number(state.pointer.right) - Number(state.pointer.left);
  if (!forward && !side) return;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
  const movement = direction.multiplyScalar(forward * speed).add(right.multiplyScalar(side * speed));
  const proposedX = camera.position.x + movement.x;
  const proposedZ = camera.position.z + movement.z;
  if (!collisionAt(proposedX, camera.position.z)) camera.position.x = proposedX;
  if (!collisionAt(camera.position.x, proposedZ)) camera.position.z = proposedZ;
  if (state.currentInteriorId && state.selectedBuilding) {
    const building = state.selectedBuilding;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, building.x - building.width * 0.36, building.x + building.width * 0.36);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, building.z - building.depth * 0.3, building.z + building.depth * 0.32);
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  updateTween(now);
  updateWalking(delta);
  if (!state.walking && !state.cameraTween) orbit.update();
  if (selectionRing.visible) {
    const pulse = 1 + Math.sin(now * 0.0024) * 0.018;
    markerScale.setScalar(selectionBaseScale * pulse);
    selectionRing.scale.copy(markerScale);
  }
  if (now - lastMapPaint > 130) {
    paintMinimap();
    updateCoordinate();
    lastMapPaint = now;
  }
  renderer.render(scene, camera);
}

document.querySelectorAll('.zone-button').forEach((button) => button.addEventListener('click', () => setZone(button.dataset.zone)));
document.querySelectorAll('.time-button').forEach((button) => button.addEventListener('click', () => setTimePreset(button.dataset.time)));
document.querySelector('#tour-button').addEventListener('click', startTour);
document.querySelector('#walk-button').addEventListener('click', startWalking);
document.querySelector('#reset-button').addEventListener('click', () => {
  stopTour(false);
  if (state.walking) stopWalking();
  if (state.currentInteriorId) exitInterior(false);
  setSelectedBuilding(null);
  setCameraView('all');
});
document.querySelector('#visit-building').addEventListener('click', visitSelectedBuilding);
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    toast('当前浏览器未允许全屏显示。');
  }
});
document.querySelector('.wordmark').addEventListener('click', (event) => {
  event.preventDefault();
  setZone('all');
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = [event.clientX, event.clientY];
  if (state.tourActive) stopTour(false);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (state.walking || state.cameraTween) return;
  const building = pickAt(event);
  hoveredBuilding = building;
  renderer.domElement.style.cursor = building ? 'pointer' : 'grab';
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (state.walking || state.cameraTween) return;
  if (!pointerDown || Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) > 7) return;
  const building = pickAt(event);
  if (building) setSelectedBuilding(building);
});
renderer.domElement.addEventListener('pointerleave', () => {
  hoveredBuilding = null;
  renderer.domElement.style.cursor = 'grab';
});
renderer.domElement.addEventListener('wheel', () => {
  if (state.tourActive) stopTour(false);
}, { passive: true });

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.key.toLowerCase() === 'f' && !event.target.matches('input, textarea, button')) {
    startWalking();
    return;
  }
  if (!state.walking) return;
  if (event.key === 'w' || event.key === 'ArrowUp') state.pointer.forward = true;
  if (event.key === 's' || event.key === 'ArrowDown') state.pointer.backward = true;
  if (event.key === 'a' || event.key === 'ArrowLeft') state.pointer.left = true;
  if (event.key === 'd' || event.key === 'ArrowRight') state.pointer.right = true;
  if (event.key === 'Shift') state.pointer.fast = true;
});
window.addEventListener('keyup', (event) => {
  if (event.key === 'w' || event.key === 'ArrowUp') state.pointer.forward = false;
  if (event.key === 's' || event.key === 'ArrowDown') state.pointer.backward = false;
  if (event.key === 'a' || event.key === 'ArrowLeft') state.pointer.left = false;
  if (event.key === 'd' || event.key === 'ArrowRight') state.pointer.right = false;
  if (event.key === 'Shift') state.pointer.fast = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.setTimeout(() => {
  loader.classList.add('is-gone');
  window.setTimeout(() => loader.remove(), 750);
}, 500);

paintMinimap();
requestAnimationFrame(animate);

if (import.meta.env.DEV) {
  window.__PALACE__ = { scene, camera, renderer, palace, state, setZone, setTimePreset, pickAt };
}
