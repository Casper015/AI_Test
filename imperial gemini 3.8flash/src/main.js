import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { CONFIG } from './shared/config.js';
import { BOUNDS, CONNECTORS, VIEWS, TOUR_STOPS, ZONES } from './shared/layout.js';
import { createPalaceKit } from './kit/palace-kit.js';

import { createZone as forecourtZone } from './zones/forecourt.js';
import { createZone as innerZone } from './zones/inner-palace.js';
import { createZone as westZone } from './zones/west-courts.js';
import { createZone as eastZone } from './zones/east-courts.js';
import { createZone as gardenZone } from './zones/garden-boundary.js';

import { CameraController } from './interaction/camera-controller.js';
import { FirstPersonController } from './interaction/first-person.js';
import { TourController } from './interaction/tour-controller.js';
import { PalacePicker } from './interaction/picker.js';

import { MiniMap } from './ui/minimap.js';
import { InfoPanel } from './ui/info-panel.js';
import { PalaceHUD } from './ui/hud.js';
import './ui/style.css';

// 1. Scene & Renderer Initialization
const container = document.getElementById('scene-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, CONFIG.camera.near, CONFIG.camera.far);
camera.position.fromArray(CONFIG.camera.start);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.quality.highDpr));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.fromArray(CONFIG.camera.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 15;
controls.maxDistance = 2400;
controls.maxPolarAngle = Math.PI * 0.495;
controls.screenSpacePanning = false;

// 2. Global Lighting & Atmosphere
const hemiLight = new THREE.HemisphereLight('#f5e6cd', '#3a4038', 1.8);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(CONFIG.colors.goldenSun, 3.2);
sunLight.position.set(-380, 620, -460);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(CONFIG.quality.shadowSize, CONFIG.quality.shadowSize);
const sc = CONFIG.quality.shadowCameraSize;
sunLight.shadow.camera.left = -sc;
sunLight.shadow.camera.right = sc;
sunLight.shadow.camera.top = sc;
sunLight.shadow.camera.bottom = -sc;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 1600;
sunLight.shadow.bias = -0.00012;
sunLight.shadow.normalBias = 0.025;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight('#a6b8c8', 0.6);
fillLight.position.set(340, 260, 380);
scene.add(fillLight);

// Environment fog
scene.background = new THREE.Color(CONFIG.colors.goldenSky);
scene.fog = new THREE.FogExp2(CONFIG.colors.goldenSky, 0.00022);

// Time of day preset controller
function applyTimePreset(preset) {
  if (preset === 'night') {
    // 寒月孤灯
    scene.background.set(CONFIG.colors.nightSky);
    scene.fog.color.set(CONFIG.colors.nightSky);
    scene.fog.density = 0.00035;
    hemiLight.color.set('#223355');
    hemiLight.groundColor.set('#0b1118');
    hemiLight.intensity = 0.6;
    sunLight.color.set('#5577bb');
    sunLight.intensity = 0.9;
    sunLight.position.set(300, 480, 240);
    fillLight.color.set('#1a2638');
    fillLight.intensity = 0.2;
    renderer.toneMappingExposure = 0.92;
  } else if (preset === 'dusk') {
    // 落霞残阳
    scene.background.set(CONFIG.colors.duskSky);
    scene.fog.color.set(CONFIG.colors.duskSky);
    scene.fog.density = 0.00028;
    hemiLight.color.set('#e88a55');
    hemiLight.groundColor.set('#2a1a18');
    hemiLight.intensity = 1.4;
    sunLight.color.set('#ff6622');
    sunLight.intensity = 2.8;
    sunLight.position.set(-520, 180, -220);
    fillLight.color.set('#552233');
    fillLight.intensity = 0.5;
    renderer.toneMappingExposure = 1.15;
  } else {
    // 盛世金辉 (Default Noon)
    scene.background.set(CONFIG.colors.goldenSky);
    scene.fog.color.set(CONFIG.colors.goldenSky);
    scene.fog.density = 0.00022;
    hemiLight.color.set('#f5e6cd');
    hemiLight.groundColor.set('#3a4038');
    hemiLight.intensity = 1.8;
    sunLight.color.set(CONFIG.colors.goldenSun);
    sunLight.intensity = 3.2;
    sunLight.position.set(-380, 620, -460);
    fillLight.color.set('#a6b8c8');
    fillLight.intensity = 0.6;
    renderer.toneMappingExposure = 1.08;
  }
}

// 3. Base Ground Land
const palaceGround = new THREE.Mesh(
  new THREE.BoxGeometry(700, 2.5, 1000),
  new THREE.MeshStandardMaterial({ color: '#55564e', roughness: 0.92 })
);
palaceGround.position.set(0, -1.3, 0);
palaceGround.receiveShadow = true;
scene.add(palaceGround);

// 4. Kit & Zones Assembly
const kit = createPalaceKit(THREE);
const buildingMap = new Map();
const allBuildings = [];
const allCourtyards = [];
const allColliders = [];
const activeZones = [];

const zoneFactories = {
  forecourt: forecourtZone,
  inner: innerZone,
  west: westZone,
  east: eastZone,
  garden: gardenZone
};

for (const [zoneKey, factory] of Object.entries(zoneFactories)) {
  const z = factory({
    THREE,
    kit,
    config: CONFIG,
    layout: { BOUNDS, CONNECTORS, ZONES },
    zoneKey,
    zoneLayout: ZONES[zoneKey]
  });

  scene.add(z.root);
  activeZones.push(z);

  for (const b of z.buildings || []) {
    buildingMap.set(b.id, b);
    allBuildings.push(b);
  }
  if (z.courtyards) allCourtyards.push(...z.courtyards);
  if (z.colliders) allColliders.push(...z.colliders);
}

// 5. Interaction Controllers
const cameraController = new CameraController(camera, controls, VIEWS);
const fpsController = new FirstPersonController(camera, renderer.domElement, CONFIG, allColliders, allBuildings);
const tourController = new TourController(cameraController, TOUR_STOPS, (stop, cur, total) => {
  hud.showTourSubtitle(stop, cur, total);
});

// UI Elements
const infoPanel = new InfoPanel(document.querySelector('.info-panel'), cameraController, fpsController);
const picker = new PalacePicker(camera, renderer.domElement, scene, buildingMap, (building) => {
  infoPanel.show(building);
});
infoPanel.onClose = () => picker.clearHighlight();

// Disable OrbitControls while in FPS mode, sync target when exiting
fpsController.addListener(({ active }) => {
  controls.enabled = !active;
  if (!active) {
    controls.target.copy(fpsController.getTargetLook());
    controls.update();
  }
});

// User manual orbit camera gesture pauses/stops tour
controls.addEventListener('start', () => {
  if (tourController.isPlaying) {
    tourController.stop();
  }
});

const minimapCanvas = document.getElementById('minimap-canvas');
const minimap = new MiniMap(minimapCanvas, cameraController, fpsController);

// Audio synthesizer for ambient bells/gongs
let audioCtx = null;
function playBellSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 3.0);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.0);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 3.0);
  } catch (err) {}
}

const hud = new PalaceHUD({
  container: document.body,
  cameraController,
  fpsController,
  tourController,
  onTimeChange: (preset) => {
    applyTimePreset(preset);
    playBellSound();
  },
  onQualityChange: (quality) => {
    const dpr = quality === 'high' ? CONFIG.quality.highDpr : CONFIG.quality.lowDpr;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dpr));
  },
  onAudioToggle: (enabled) => {
    if (enabled) playBellSound();
  }
});

// 6. URL Query Parameters Support
const params = new URLSearchParams(window.location.search);
if (params.has('preset')) {
  const p = params.get('preset');
  if (['golden', 'dusk', 'night'].includes(p)) {
    hud.setTimePreset(p);
  }
}

if (params.has('view')) {
  const v = params.get('view');
  if (v === 'fp') {
    setTimeout(() => fpsController.start(), 300);
  } else if (VIEWS[v]) {
    cameraController.jumpTo(v);
  }
}

if (params.get('stats') === '1') {
  document.querySelector('.btn-stats')?.click();
}

if (params.get('tour') === '1') {
  setTimeout(() => tourController.start(), 500);
}

// 7. Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Expose debug handle for automated tests & screenshots
window.__PALACE__ = {
  scene,
  camera,
  renderer,
  buildings: allBuildings,
  courtyards: allCourtyards,
  ready: true
};

// 8. Main Animation Loop
let lastTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();
let currentFps = 60;

function animate(time) {
  requestAnimationFrame(animate);

  const dt = Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;

  // FPS calculation
  frameCount++;
  if (time - lastFpsUpdate >= 500) {
    currentFps = Math.round((frameCount * 1000) / (time - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = time;
    hud.updateStats(currentFps, renderer.info.render.calls, renderer.info.render.triangles);
  }

  // Update controllers
  if (fpsController.active) {
    fpsController.update(dt);
  } else {
    cameraController.update(dt);
  }

  // Update zones (e.g. gentle animation)
  for (const z of activeZones) {
    z.update?.(dt, time / 1000, {});
  }

  // Render 3D Scene
  renderer.render(scene, camera);

  // Render Minimap
  minimap.render(camera.position, controls.target);
}

requestAnimationFrame(animate);
