/**
 * 统一环境系统（计划 §6.3、CONTRACTS §8.3）。
 *
 * 全城共用三个预设：盛世金辉 `goldenHour` / 落霞夕照 `sunset` / 寒月宫灯 `moonlitNight`。
 * 太阳方向、天空、雾、曝光、色调映射、阴影策略、灯光强度全部由这里统一设置；
 * 区域只登记 `lightAnchors`，不建第二套灯光。
 *
 * 灯光的降级规则（§6.3 / config.LIGHTING.lamps）：
 *   - 夜景按 **距离 + 重要性** 激活有限实时点光（≤ maxRealtimePointLights，且 ≤ 质量档上限）；
 *   - 超过 `emissiveFallbackBeyond` 的灯只保留"发光材质"（一个 InstancedMesh，1 个 draw call）；
 *   - 宫灯不投影（半影由主方向光负责，§8.2 只允许一盏主方向光投影）。
 *
 * 统一氛围：香炉轻烟（Points）、微尘（Points）、水面微波（注册式材质补丁）。
 */

import * as THREE from 'three';
import { CONFIG, LIGHTING, WATER, EVENTS, COLORS_DERIVED, COLORS } from '../shared/config.js';
import { ENVELOPE, getSlot, WALKABLE } from '../shared/layout.js';

const CENTER = Object.freeze({
  x: (ENVELOPE.minX + ENVELOPE.maxX) / 2,
  y: 6,
  z: (ENVELOPE.minZ + ENVELOPE.maxZ) / 2,
});

/** 灯位重要性：中轴 > 花园/庭院 > 其它（用于实时灯名额分配）。 */
const ROLE_IMPORTANCE = Object.freeze({ axisLantern: 1.0, gardenOrCourtLantern: 0.7, windowGlow: 0.55, torch: 0.8 });

const color = (hex) => new THREE.Color(hex);

/** 灯位可见高度：灯位记录的是地面点（y 可能是 0），放置时抬到灯身中段。 */
const lampY = (anchor, factor = 0.6) => Math.max(0.4, anchor.position.y ?? 0) + (anchor.height ?? 3) * factor;

/** 香炉位置：由 layout 的建筑入口推出（不写字面坐标）。 */
function censerAnchors() {
  const ids = ['B-gate-front', 'B-hall-main', 'C-gate-inner', 'C-hall-bed-main'];
  const out = [];
  for (const id of ids) {
    const slot = getSlot(id);
    if (!slot) continue;
    out.push({ x: slot.entrance.x, y: (slot.baseY ?? 0) + 1.2, z: slot.entrance.z, zone: slot.zone });
  }
  return out;
}

/**
 * @param {{
 *   config?: object, events: object, scene: object, registry?: object,
 *   quality?: string, rendererAdapter?: { setExposure?: Function, setBloom?: Function }, preset?: string
 * }} options
 */
/**
 * 内景可读性（t38）：**A 内景专属补光** + **B 内景材质环境贴图**。
 *
 * 背景（t33 量化边界）：两个内景机位（VP-B-interior 金銮殿 / VP-C-interior 寝殿）在 goldenHour 下
 * 内容暗区 65.93% / 55.99%，远超 CONTRACTS §12 内景类 ≤30%。物理原因：
 *   太阳仰角≈44° ⇒ 4m 高窗带水平射程仅 ≈4.2m，而取景内容在洞口后方 10–30m（直射落不到）；
 *   场景无 GI；金砖基色 `#1a1917` 线性反照率 ≈0.0102，全局 ambient 0.42 下地板 luma 仅 0.03–0.05。
 * 因此本模块只看**内景专属**手段，且**不得**抬亮外景：
 *   · A：由 `layout.WALKABLE(kind:'interior')` 求出的内景体积（B/C 两处）**相机入内才点亮**的
 *        ambient + hemisphere 补光（与全局 ambient/hemi 完全解耦；相机在外时强度恒为 0）；
 *   · B：由当前时辰天空色生成 equirect 环境贴图，并**只绑定到内景材质**（`kit-mat-interiorBrick` 等，
 *        它们已带 `envMapIntensity 0.5 + clearcoat 0.35`）→ 让声明过的参数真正生效，外景材质不受影响。
 * 两者都不新增绘制批次；外景视图的数字必须保持噪声量级（见 docs/handoff-t2-repair-interior.md）。
 */
export function createEnvironment({
  config = CONFIG,
  events,
  scene,
  registry = null,
  quality = config.QUALITY.default,
  rendererAdapter = {},
  preset = config.STATE_DEFAULTS.timePreset,
  presetOverrides = null,
  THREE: injected = null,
} = {}) {
  if (!events) throw new Error('createEnvironment 需要事件总线');
  if (!scene) throw new Error('createEnvironment 需要 scene（环境只往场景里挂自己的统一根节点）');
  if (injected && injected !== THREE) throw new Error('createEnvironment: 必须使用同一份 three');

  const envRoot = new THREE.Group();
  envRoot.name = 'environment-root';

  /* ------------------------------- 光照 ------------------------------- */
  const sun = new THREE.DirectionalLight(0xffffff, 2.35);
  sun.name = 'environment-sun';
  sun.castShadow = LIGHTING.shadows.enabled;
  const shadowCam = sun.shadow.camera;
  const half = LIGHTING.shadows.cameraHalfExtent;
  shadowCam.left = -half;
  shadowCam.right = half;
  shadowCam.top = half;
  shadowCam.bottom = -half;
  shadowCam.near = 1;
  shadowCam.far = half * 4;
  sun.shadow.bias = LIGHTING.shadows.bias;
  sun.shadow.normalBias = LIGHTING.shadows.normalBias;
  sun.target.position.set(CENTER.x, 0, CENTER.z);
  envRoot.add(sun);
  envRoot.add(sun.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.42);
  ambient.name = 'environment-ambient';
  envRoot.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  hemi.name = 'environment-hemisphere';
  envRoot.add(hemi);

  /* ------------------------------- 天空 ------------------------------- */
  const skyGeometry = new THREE.SphereGeometry(4200, 32, 16);
  const skyMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'environment-sky';
  sky.frustumCulled = false;
  envRoot.add(sky);

  let skyTopHex = null;
  let skyHorizonHex = null;
  function paintSky(topHex, horizonHex) {
    skyTopHex = topHex;
    skyHorizonHex = horizonHex;
    const position = skyGeometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const top = color(topHex);
    const horizon = color(horizonHex);
    const tmp = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i) / 4200;
      const k = Math.max(0, Math.min(1, (y + 0.12) / 0.85));
      tmp.copy(horizon).lerp(top, k * k);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    skyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    skyGeometry.attributes.color.needsUpdate = true;
  }

  /* --------------------- 内景专属补光（t38 A）+ 环境贴图（B） --------------------- */

  /**
   * 每个时辰的内景补光系数（乘在该时辰的 ambient/hemi 上）——**只在相机位于内景体积内时生效**。
   * 数值由 shot.mjs 的内景判据实测整定（见回执 §2：B/C × 三时辰内容暗区 ≤30% 且截断 ≤5%）。
   */
  const INTERIOR_FILL = Object.freeze({
    goldenHour: { ambient: 6.2, hemi: 2.6 },
    sunset: { ambient: 2.4, hemi: 1.05 }, // t43：按 t40 剂量-响应回调（k≈0.45），消除夕照内景截断超标
    moonlitNight: { ambient: 1.0, hemi: 0.42 }, // t43：按 t40 剂量-响应回调（≈1.0/0.42），降低“高倍率硬撑”依赖
  });
  /** 内景体积：由内景可行走面（kind='interior'）按区域求包围盒，向上延伸 ceilingHeight、四周外扩 1.2m。 */
  const INTERIOR_CEILING_HEIGHT = 9;
  const INTERIOR_VOLUME_MARGIN = 1.2;
  const interiorVolumes = (() => {
    const byZone = new Map();
    for (const surface of WALKABLE.filter((w) => w.kind === 'interior')) {
      const zone = surface.zone ?? surface.owner ?? null;
      const b = surface.bounds;
      if (!b) continue;
      const current = byZone.get(zone) ?? {
        zone,
        minX: Infinity,
        maxX: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      };
      current.minX = Math.min(current.minX, b.minX);
      current.maxX = Math.max(current.maxX, b.maxX);
      current.minZ = Math.min(current.minZ, b.minZ);
      current.maxZ = Math.max(current.maxZ, b.maxZ);
      current.minY = Math.min(current.minY, surface.y ?? 0);
      current.maxY = Math.max(current.maxY, (surface.y ?? 0) + INTERIOR_CEILING_HEIGHT);
      byZone.set(zone, current);
    }
    return [...byZone.values()].map((v) => ({
      zone: v.zone,
      minX: v.minX - INTERIOR_VOLUME_MARGIN,
      maxX: v.maxX + INTERIOR_VOLUME_MARGIN,
      minZ: v.minZ - INTERIOR_VOLUME_MARGIN,
      maxZ: v.maxZ + INTERIOR_VOLUME_MARGIN,
      minY: v.minY - 0.6,
      maxY: v.maxY,
    }));
  })();

  const interiorAmbient = new THREE.AmbientLight(0xffffff, 0);
  interiorAmbient.name = 'environment-interior-ambient';
  envRoot.add(interiorAmbient);
  const interiorHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0);
  interiorHemi.name = 'environment-interior-hemisphere';
  envRoot.add(interiorHemi);

  /** 退出内景时的淡出时长（进入时立即点亮，保证截图/首帧就达标；离开时淡出避免突兀）。 */
  const INTERIOR_FADE_OUT_SECONDS = 0.3;
  const interiorState = { inside: false, blend: 0, litFrames: 0, darkFrames: 0 };

  function insideInteriorVolume(position) {
    if (!position) return false;
    for (const v of interiorVolumes) {
      if (position.x < v.minX || position.x > v.maxX) continue;
      if (position.z < v.minZ || position.z > v.maxZ) continue;
      if (position.y < v.minY || position.y > v.maxY) continue;
      return true;
    }
    return false;
  }

  function interiorFillTargets() {
    const factors = INTERIOR_FILL[currentPreset] ?? null;
    if (!factors) return { ambient: 0, hemi: 0 };
    const p = presetOf(currentPreset);
    return { ambient: p.ambientIntensity * factors.ambient, hemi: p.hemiIntensity * factors.hemi };
  }

  function updateInteriorFill(dt, cameraPosition) {
    const inside = insideInteriorVolume(cameraPosition);
    interiorState.inside = inside;
    if (inside) {
      interiorState.blend = 1;
      interiorState.litFrames += 1;
    } else if (interiorState.blend > 0) {
      interiorState.blend = Math.max(0, interiorState.blend - Math.max(1e-6, dt) / INTERIOR_FADE_OUT_SECONDS);
      interiorState.darkFrames += 1;
    } else {
      interiorState.darkFrames += 1;
    }
    const target = interiorFillTargets();
    interiorAmbient.intensity = +(target.ambient * interiorState.blend).toFixed(4);
    interiorHemi.intensity = +(target.hemi * interiorState.blend).toFixed(4);
  }

  /** 环境贴图（t38 B）：由当前时辰的天空色生成 equirect 数据贴图（无需 WebGLRenderer，可测）。 */
  const INTERIOR_ENV_SIZE = Object.freeze({ width: 64, height: 32 });
  let interiorEnvTexture = null;
  let interiorEnvBoundMaterials = 0;
  let interiorEnvBoundZoneCount = -1;
  let interiorEnvTraversals = 0;

  function buildInteriorEnvTexture(topHex, horizonHex) {
    const { width, height } = INTERIOR_ENV_SIZE;
    const data = new Uint8Array(width * height * 4);
    const top = color(topHex);
    const horizon = color(horizonHex);
    const tmp = new THREE.Color();
    for (let y = 0; y < height; y += 1) {
      const v = 1 - y / (height - 1); // 1 = 天顶，0 = 天底
      const k = Math.max(0, Math.min(1, (v * 2 - 0.15) / 0.85));
      tmp.copy(horizon).lerp(top, k * k);
      // 下半球（地面/室内反射侧）压暗到 35%，避免环境贴图把内景照成"天空棚"
      const groundScale = v < 0.5 ? 0.35 + 0.65 * (v / 0.5) : 1;
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = Math.round(tmp.r * 255 * groundScale);
        data[i + 1] = Math.round(tmp.g * 255 * groundScale);
        data[i + 2] = Math.round(tmp.b * 255 * groundScale);
        data[i + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(data, width, height);
    texture.name = `environment-interior-envmap-${currentPreset}`;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  /** 只认内景材质（`kit-mat-interiorBrick` 系列；tokens 里带 interior/pavingInterior）。 */
  function isInteriorMaterial(material) {
    const tokens = material.userData?.tokens ?? {};
    const haystack = `${material.name ?? ''} ${tokens.material ?? ''} ${tokens.colorRole ?? ''} ${tokens.colorToken ?? ''}`;
    return /interior/i.test(haystack);
  }

  /**
   * 懒绑定：区域装载后把环境贴图绑到**内景材质**上（外景材质一个都不碰 ⇒ 外景数字不变）。
   * 用 `registry.stats().zones.length` 作为"是否需要重扫"的信号，避免每帧遍历场景。
   */
  function bindInteriorEnvMaps() {
    const zoneCount = registry?.stats ? registry.stats().zones.length : 0;
    if (zoneCount === interiorEnvBoundZoneCount) return 0;
    interiorEnvBoundZoneCount = zoneCount;
    interiorEnvTexture ??= buildInteriorEnvTexture(skyTopHex, skyHorizonHex);
    interiorEnvTraversals += 1;
    let bound = 0;
    scene.traverse((node) => {
      const material = node.material;
      const list = Array.isArray(material) ? material : material ? [material] : [];
      for (const m of list) {
        if (!m || typeof m !== 'object') continue;
        if (!(m.isMeshPhysicalMaterial || m.isMeshStandardMaterial)) continue;
        if (!isInteriorMaterial(m)) continue;
        if (m.envMap === interiorEnvTexture) continue;
        m.envMap = interiorEnvTexture;
        m.envMapIntensity = m.envMapIntensity > 0 ? m.envMapIntensity : 0.5;
        m.needsUpdate = true;
        bound += 1;
      }
    });
    interiorEnvBoundMaterials += bound;
    return bound;
  }

  /** 时辰切换后重建环境贴图并按需重新标记内景材质（贴图内容随时辰变色）。 */
  function refreshInteriorEnvMaps() {
    if (interiorEnvBoundMaterials === 0) return 0;
    interiorEnvTexture = buildInteriorEnvTexture(skyTopHex, skyHorizonHex);
    let rebound = 0;
    scene.traverse((node) => {
      const material = node.material;
      const list = Array.isArray(material) ? material : material ? [material] : [];
      for (const m of list) {
        if (!m || !isInteriorMaterial(m) || !m.envMap) continue;
        m.envMap = interiorEnvTexture;
        m.needsUpdate = true;
        rebound += 1;
      }
    });
    return rebound;
  }

  /* ------------------------------- 灯位 ------------------------------- */
  const lampsGroup = new THREE.Group();
  lampsGroup.name = 'environment-lamps';
  envRoot.add(lampsGroup);

  const lampMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.gilt,
    emissive: color(LIGHTING.lamps.color),
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0.2,
  });
  const lampAnchorGeometry = new THREE.BoxGeometry(0.5, 0.7, 0.5);
  let lampInstances = null; // InstancedMesh（发光材质代替大量实时点光）
  const realtimeLights = [];
  const lampState = {
    anchors: [],
    lastReselect: -Infinity,
    active: 0,
    emissiveOnly: 0,
    flickerPhase: 0,
    /** t95：最近一次入选池（top-`realtimeLights.length`）——直接读数，供 describe()/验收消费 */
    pool: [],
  };

  function buildLampInstances(anchors) {
    if (lampInstances) {
      lampsGroup.remove(lampInstances);
      lampInstances.dispose?.();
      lampInstances = null;
    }
    if (anchors.length === 0) return;
    lampInstances = new THREE.InstancedMesh(lampAnchorGeometry, lampMaterial, anchors.length);
    lampInstances.name = 'environment-lamp-emissive';
    lampInstances.frustumCulled = true;
    lampInstances.castShadow = false;
    lampInstances.receiveShadow = false;
    const m = new THREE.Matrix4();
    anchors.forEach((anchor, i) => {
      m.makeTranslation(anchor.position.x, lampY(anchor, 0.55), anchor.position.z);
      lampInstances.setMatrixAt(i, m);
    });
    lampInstances.instanceMatrix.needsUpdate = true;
    lampsGroup.add(lampInstances);
  }

  /**
   * 同步灯位锚点：注册表在装配期是"逐区域陆续注册"的（main.js 先建环境、后跑 layout 任务），
   * 因此这里必须在运行时按数量变化重建，否则会出现"环境已初始化但灯位为 0"的静默失效。
   */
  function syncAnchors() {
    if (!registry?.allLightAnchors) return false;
    const list = registry.allLightAnchors();
    if (list.length === lampState.anchors.length) return false;
    lampState.anchors = list;
    buildLampInstances(lampState.anchors);
    if (lampInstances) lampInstances.visible = presetOf(currentPreset).lampIntensityScale > 0.02;
    lampState.lastReselect = -Infinity;
    events.emit(EVENTS.assetsProgress, {
      loaded: lampState.anchors.length,
      total: lampState.anchors.length,
      stage: `lamps:${lampState.anchors.length}`,
      mb: 0,
    });
    return true;
  }

  function buildRealtimeLights(count) {
    for (const light of realtimeLights) lampsGroup.remove(light);
    realtimeLights.length = 0;
    for (let i = 0; i < count; i += 1) {
      const light = new THREE.PointLight(color(LIGHTING.lamps.color), 0, LIGHTING.lamps.distance, LIGHTING.lamps.decay);
      light.name = `environment-lamp-${i}`;
      light.castShadow = false; // 宫灯不投影（§8.2）
      light.visible = false;
      lampsGroup.add(light);
      realtimeLights.push(light);
    }
  }

  /* ------------------------------ 氛围粒子 ------------------------------ */
  const smokeGroup = new THREE.Group();
  smokeGroup.name = 'environment-smoke';
  envRoot.add(smokeGroup);
  const dustGroup = new THREE.Group();
  dustGroup.name = 'environment-dust';
  envRoot.add(dustGroup);

  function makeParticleSystem(budget, size, opacity, span) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(budget * 3);
    const seeds = new Float32Array(budget * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: true,
      toneMapped: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = true;
    return { points, geometry, material, positions, seeds, budget, span };
  }

  const smokeSystems = censerAnchors().map((anchor) => {
    const system = makeParticleSystem(Math.max(4, Math.round(config.LIGHTING.atmosphere.smokeParticleBudget / 4)), 1.1, 0.16, 6);
    system.anchor = anchor;
    for (let i = 0; i < system.budget; i += 1) {
      system.seeds[i * 3] = Math.random();
      system.seeds[i * 3 + 1] = Math.random();
      system.seeds[i * 3 + 2] = Math.random();
    }
    smokeGroup.add(system.points);
    return system;
  });

  const dustSpan = 220;
  const dust = makeParticleSystem(config.LIGHTING.atmosphere.dustParticleBudget, 0.5, 0.14, dustSpan);
  for (let i = 0; i < dust.budget; i += 1) {
    dust.seeds[i * 3] = Math.random();
    dust.seeds[i * 3 + 1] = Math.random();
    dust.seeds[i * 3 + 2] = Math.random();
  }
  dustGroup.add(dust.points);

  /* ------------------------------- 水面 ------------------------------- */
  const waterMeshes = new Set();
  const waterShaders = new Set();

  /** 水面微波：材质补丁（CPU 零拷贝，顶点着色器内正弦），参数取自 config.WATER。 */
  function patchWaterMaterial(material) {
    if (!material || material.isShaderMaterial === true) return false;
    const key = WATER.waveLength > 0 ? WATER.waveLength : 6;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWaveTime = { value: 0 };
      shader.uniforms.uWaveAmplitude = { value: WATER.waveAmplitude };
      shader.uniforms.uWaveLength = { value: key };
      shader.vertexShader = `uniform float uWaveTime;\nuniform float uWaveAmplitude;\nuniform float uWaveLength;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float wavePhase = (position.x + position.z) / max(0.001, uWaveLength) * 6.28318;
         transformed.y += sin(wavePhase + uWaveTime * ${WATER.waveSpeed.toFixed(3)} * 6.28318) * uWaveAmplitude;`,
      );
      material.userData.waveShader = shader;
      waterShaders.add(shader);
    };
    material.customProgramCacheKey = () => 'palace-water-wave';
    material.needsUpdate = true;
    return true;
  }

  function registerWater(object) {
    if (!object) return false;
    object.traverse?.((node) => {
      if (!node.isMesh) return;
      if (node.userData?.waterWave === false) return;
      waterMeshes.add(node);
      patchWaterMaterial(node.material);
    });
    if (object.isMesh) {
      waterMeshes.add(object);
      patchWaterMaterial(object.material);
    }
    return true;
  }

  /** 场景扫描：任何 `userData.waterSurface === true` 的 mesh 自动纳入统一微波（区域无需 import 本模块）。 */
  function adoptWaterSurfaces() {
    scene.traverse((node) => {
      if (node.isMesh && node.userData?.waterSurface === true && !waterMeshes.has(node)) {
        waterMeshes.add(node);
        patchWaterMaterial(node.material);
      }
    });
  }

  /* ------------------------------ 预设应用 ------------------------------ */
  const presets = config.LIGHTING.presets;
  /**
   * 诊断用覆盖（**不改 shared/**）：?env=sun=..,ambient=..,hemi=..,exposure=.. 时，
   * 环境系统只在本进程内用"预设 + 覆盖"的副本渲染，便于把"提亮预设"的建议值量化成实测数据。
   */
  const overrides = { ...(presetOverrides ?? {}) };
  const presetOf = (id) => ({ ...presets[id], ...(overrides[id] ?? {}) });
  let currentPreset = preset;
  const applied = { preset, quality };

    /** 十六进制 → 0–255 sRGB 三元组（工具侧像素比对用）。 */
  function hexToRgb255(hex) {
    const clean = String(hex).replace('#', '');
    return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  }

  /**
   * 权威背景口径（t45）：把渲染侧**确切知道**的背景/雾信息交给工具，替代"用像素猜天空"。
   *
   * 口径（务必按此解释）：
   *   · `hex` / `srgb255`：**显示参考空间**（sRGB）的实际背景色，等于画面上未被雾/几何覆盖区域的像素值；
   *   · `linear`：three 内部工作空间（线性 sRGB）的分量（`scene.background.r/g/b` 原值）；
   *   · `toneMapped: false`：`scene.background` 是**清屏色**，**不受**曝光与色调映射影响（与贴图/材质不同）；
   *   · `skyTopHex` / `skyHorizonHex`：天空网格（顶点色插值、`toneMapped:false`）两端色；天空有梯度，
   *     背景色是其 0.35 处的插值结果；
   *   · `fog`：雾色 + 近远距离。**雾按深度插值，可以完全覆盖背景**（t44 议题：均匀无梯度的雾曾被当成天空）
   *     —— 工具应先比对 `hex`，再比对 `fog.hex`，两者都不匹配才说明是几何/材质。
   */
  /**
   * 天空网格（t50 掩码诊断用）：返回半径 4200、BackSide、toneMapped:false 的天空球。
   * 只读访问器；掩码模式由 `src/core/renderer.js` 负责（本模块不参与渲染分支）。
   */
  function skyMesh() {
    return sky;
  }

  function describeSceneBackground() {
    const preset = presetOf(currentPreset);
    const bg = scene.background;
    const fog = scene.fog;
    const toEntry = (color) =>
      color && typeof color.getHexString === 'function'
        ? (() => {
            const hex = `#${color.getHexString()}`;
            return {
              hex,
              srgb255: hexToRgb255(hex),
              linear: { r: +color.r.toFixed(6), g: +color.g.toFixed(6), b: +color.b.toFixed(6) },
            };
          })()
        : null;
    // t48：实机落屏的是**天空网格渐变**（顶点色插值、材质 toneMapped:false），而不是清屏色；
    // 清屏色被半径 4200 的天空球完全覆盖（frustumCulled=false），经验命中率 ≈0.2%（天空带 ≈70–79%）。
    const skyEntry = (hexValue) => {
      const hex = hexValue ?? null;
      return hex ? { hex, srgb255: hexToRgb255(hex) } : { hex: null, srgb255: null };
    };
    const top = skyEntry(skyTopHex);
    const horizon = skyEntry(skyHorizonHex);
    const configured = toEntry(bg) ?? { hex: null, srgb255: null, linear: null };
    const absDelta = (a, b) => (a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : null);
    const skyTop255 = top.srgb255;
    const skyHorizon255 = horizon.srgb255;
    return {
      source: 'scene.background',
      preset: currentPreset,
      role: preset?.backgroundRole ?? null,
      fogRole: preset?.fogColorRole ?? null,
      /** 语义标注（t48）：配置清屏色 vs 实际落屏（天空渐变）——工具必须知道自己在比哪一个 */
      semantics: {
        configured: 'hex/srgb255 = scene.background 清屏色（设计值）；本场景被天空球完全覆盖 ⇒ 实机几乎不可见（实测命中 ≈0.2%）',
        displayed: 'displayed.* = 实际落屏背景：天空网格顶点色渐变（toneMapped:false，不经色调映射/曝光）',
        matching: '像素判定请用 displayed 的渐变带（top↔horizon，容差 ±2）；清屏色只在无天空场景作为兜底',
      },
      configured: { ...configured, semantic: '配置清屏色（scene.background）' },
      displayed: {
        kind: 'sky-gradient',
        topHex: top.hex,
        horizonHex: horizon.hex,
        topSrgb255: skyTop255,
        horizonSrgb255: skyHorizon255,
        toneMapped: false,
        semantic: '实际落屏背景（天空网格渐变，不经色调映射/曝光）',
      },
      delta: {
        configVsSkyTop: absDelta(configured.srgb255, skyTop255),
        configVsSkyHorizon: absDelta(configured.srgb255, skyHorizon255),
        maxAbs: Math.max(absDelta(configured.srgb255, skyTop255) ?? 0, absDelta(configured.srgb255, skyHorizon255) ?? 0),
        note: 'Δ=|配置清屏色 − 天空渐变端点|（逐通道最大差，0–255）；天空带内任意 t 处的落屏色都落在此区间内',
      },
      candidates: [
        { name: 'clear-color(configured)', hex: configured.hex, srgb255: configured.srgb255, note: 'scene.background（被天空覆盖，实测命中 ≈0.2%）' },
        { name: 'sky-top(displayed)', hex: top.hex, srgb255: skyTop255, note: '天空渐变上端（天顶方向）' },
        { name: 'sky-horizon(displayed)', hex: horizon.hex, srgb255: skyHorizon255, note: '天空渐变下端（地平方向）' },
        { name: 'fog', hex: fog ? `#${fog.color.getHexString()}` : null, srgb255: fog ? hexToRgb255(`#${fog.color.getHexString()}`) : null, note: '雾色（按深度插值，可覆盖背景；与清屏色接近时会被误判为背景）' },
      ],
      ...(toEntry(bg) ?? { hex: null, srgb255: null, linear: null }),
      skyTopHex: skyTopHex ?? null,
      skyHorizonHex: skyHorizonHex ?? null,
      toneMapped: false,
      outputColorSpace: config.LIGHTING.toneMapping.outputColorSpace,
      exposure: preset?.exposure ?? null,
      note: 'hex/srgb255 = 显示参考空间实际像素值；linear = three 线性工作空间；清屏色不受曝光/色调映射影响',
      fog: fog
        ? {
            ...(toEntry(fog.color) ?? { hex: null, srgb255: null, linear: null }),
            near: fog.near,
            far: fog.far,
            note: '雾按深度插值，可完全覆盖背景；与背景色不匹配时以雾色为准（t44）',
          }
        : null,
    };
  }

  function applyPreset(id = currentPreset, { source = 'env' } = {}) {
    const p = presetOf(id);
    if (!p) throw new Error(`applyPreset: 未知时辰 "${id}"（合法：${config.LIGHTING.timePresets.join('/')}）`);
    currentPreset = id;
    applied.preset = id;
    const scale = p.lampIntensityScale;

    // 太阳（方向 + 颜色 + 强度 + 影子）
    const dir = new THREE.Vector3(p.sunDirection.x, p.sunDirection.y, p.sunDirection.z).normalize();
    sun.position.set(CENTER.x + dir.x * 1600, Math.max(60, dir.y * 1600), CENTER.z + dir.z * 1600);
    sun.target.position.set(CENTER.x, 0, CENTER.z);
    sun.color.set(p.sunColor);
    sun.intensity = p.sunIntensity;
    sun.target.updateMatrixWorld();

    // 环境光 + 半球光
    ambient.color.set(p.ambientColor);
    ambient.intensity = p.ambientIntensity;
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemiIntensity;

    // 天空 + 雾
    const top = COLORS_DERIVED[p.backgroundRole] ?? p.backgroundRole;
    const horizon = COLORS_DERIVED[p.fogColorRole] ?? p.fogColorRole;
    paintSky(top, horizon);
    scene.background = color(horizon).lerp(color(top), 0.35);
    if (!scene.fog) scene.fog = new THREE.Fog(0xffffff, p.fogNear, p.fogFar);
    scene.fog.color.set(p.fogColorRole === 'fogNight' ? COLORS_DERIVED.fogNight : COLORS_DERIVED[p.fogColorRole]);
    scene.fog.near = p.fogNear;
    scene.fog.far = p.fogFar;

    // 曝光 / 色调映射 / Bloom
    rendererAdapter.setExposure?.(p.exposure);
    rendererAdapter.setBloom?.(p.bloom, scale > 0 ? true : undefined);
    // 内景环境贴图随时辰重建（只影响已绑定的内景材质）
    refreshInteriorEnvMaps();

    // 发光灯位强度（远端替代方案）
    lampMaterial.emissiveIntensity = 0.6 + 2.6 * scale;
    lampInstances && (lampInstances.visible = scale > 0.02);

    // 实时点光名额定档：金色为 0，黄昏按比例，夜景满额
    const tierMax = Math.min(config.LIGHTING.lamps.maxRealtimePointLights, config.QUALITY.tiers[applied.quality].maxRealtimeLights);
    const want = scale <= 0.02 ? 0 : Math.max(1, Math.round(tierMax * Math.min(1, scale)));
    if (want !== realtimeLights.length) buildRealtimeLights(want);
    for (const light of realtimeLights) light.visible = false;
    lampState.active = 0;
    lampState.lastReselect = -Infinity;

    // 注意：时辰切换属于 state 变更（state:change 已由 store 广播），这里**不再**发 assets:progress，
    // 避免污染加载进度语义（assets:progress 只用于资源加载）。
    return describe();
  }

  function setQuality(tier) {
    const q = config.QUALITY.tiers[tier];
    if (!q) throw new Error(`setQuality: 未知质量档 "${tier}"`);
    applied.quality = tier;
    sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    sun.castShadow = q.shadowEnabled && config.LIGHTING.shadows.enabled;
    smokeGroup.visible = config.LIGHTING.atmosphere.smokeEnabled;
    dustGroup.visible = config.LIGHTING.atmosphere.dustEnabled && tier !== 'low';
    const tierMax = Math.min(config.LIGHTING.lamps.maxRealtimePointLights, q.maxRealtimeLights);
    const scale = presetOf(currentPreset).lampIntensityScale;
    const want = scale <= 0.02 ? 0 : Math.max(1, Math.round(tierMax * Math.min(1, scale)));
    if (want !== realtimeLights.length) {
      buildRealtimeLights(want);
      lampState.lastReselect = -Infinity;
    }
    return { tier, shadowMapSize: q.shadowMapSize, realtimeLights: realtimeLights.length, bloom: q.bloom };
  }

  /* ------------------------------ 每帧更新 ------------------------------ */
  /**
   * t90：**距离感知**的灯位优先级（取代旧的"线性衰减 × 静态权重"）。
   *
   * 旧口径（t90 前）：`score = importance × (1 − min(1, d / (lamps.distance × 6)))`
   *   ⇒ 80–110m 外的 `axisLantern`(权重 1.0) 仍能压过 11–20m 的室内 `windowGlow`(0.55)
   *   （t64 实测：golden/sunset 下南/北城门各 1 处室内灯被挤出实时池）。
   * 新口径：`score = importance / (1 + (d / d0)^k)`，`d0 = LIGHTING.lamps.distance`、`k = LAMP_SCORE_POWER = 2`
   *   ⇒ 近处低权重灯与远处高权重灯**两侧都不可绝对化**（见 tests/core-environment.test.mjs 的反例断言）：
   *     · 距离主导：windowGlow@15m = 0.518 > axisLantern@90m = 0.308 ✓
   *     · 重要性主导：windowGlow@11m = 0.532 < axisLantern@20m = 0.900 ✓（远处重要灯仍可入池）
   * **未改任何预算**：池容量仍 `realtimeLights.length`（= `LIGHTING.lamps.maxRealtimePointLights`）、
   * 距离上限仍 `min(lamps.distance × 6, lamps.emissiveFallbackBeyond)`。
   */
  const LAMP_SCORE_POWER = 2;
  function lampScore(role, distance, { distance: d0 = LIGHTING.lamps.distance } = {}) {
    const importance = ROLE_IMPORTANCE[role] ?? 0.5;
    const d = Number.isFinite(distance) ? Math.max(0, distance) : Infinity;
    const base = Number.isFinite(d0) && d0 > 0 ? d0 : 1;
    return importance / (1 + (d / base) ** LAMP_SCORE_POWER);
  }

  /** 灯位池排名（纯函数；`updateLampSelection` 与测试共用同一实现，避免"代理断言"）。 */
  function rankLampPool(lamps = [], focus = null, { budget = null, scoreOf = lampScore, maxDistance = null } = {}) {
    const center = focus ?? { x: CENTER.x, y: CENTER.y, z: CENTER.z };
    const cap = maxDistance ?? Math.min(LIGHTING.lamps.distance * 6, LIGHTING.lamps.emissiveFallbackBeyond);
    const size = budget ?? (realtimeLights.length || LIGHTING.lamps.maxRealtimePointLights);
    return lamps
      .map((anchor) => ({
        anchor,
        distance: Math.hypot(anchor.position.x - center.x, anchor.position.z - center.z),
      }))
      .filter((r) => r.distance <= cap)
      .map((r) => ({ ...r, score: scoreOf(r.anchor.role, r.distance) }))
      .sort((a, b) => (b.score - a.score) || (a.distance - b.distance) || String(a.anchor.id).localeCompare(String(b.anchor.id)))
      .slice(0, size);
  }

  /** t90 前口径（仅用于对照/突变证明；**不再参与生产选择**）。 */
  function legacyLampScore(role, distance, { distance: d0 = LIGHTING.lamps.distance } = {}) {
    const importance = ROLE_IMPORTANCE[role] ?? 0.5;
    const span = d0 * 6;
    return importance * (1 - Math.min(1, (Number.isFinite(distance) ? distance : 0) / span));
  }

  function updateLampSelection(elapsed, cameraPosition) {
    const lamps = lampState.anchors;
    if (lamps.length === 0 || realtimeLights.length === 0) {
      // t95：没有可选灯位/没有实时名额时，池必须清空（否则 describe() 会读到上一帧的陈旧清单）
      lampState.pool = [];
      return;
    }
    if (elapsed - lampState.lastReselect < 0.35) return;
    lampState.lastReselect = elapsed;
    const focus = cameraPosition ?? { x: CENTER.x, y: CENTER.y, z: CENTER.z };
    // t90：统一走纯函数 rankLampPool（距离感知评分；预算与距离上限不变）
    const pool = rankLampPool(lamps, focus, { budget: realtimeLights.length });
    /**
     * t95：**保留入选池并暴露为可直接读取的清单**（`describe().lamps.pool`）。
     * 动机：t94 只能做"真实计数 + 真实输入复算"的交叉校验；下游（t66/验收）需要**直接读数**：
     * 谁是本机位池内 #1/#2、分数与距离多少，一眼可读，不需要再复算。
     * 只保留 top-`realtimeLights.length`（真机容量），字段 `{rank,id,role,distance,score}`。
     */
    lampState.pool = pool.map((r, i) => ({
      rank: i + 1,
      id: r.anchor.id,
      role: r.anchor.role ?? null,
      distance: +r.distance.toFixed(3),
      score: r.score, // 保留全精度（消费者可直接与 lampScore() 逐值比对）
    }));

    lampState.active = 0;
    realtimeLights.forEach((light, i) => {
      const hit = pool[i];
      if (!hit) {
        light.visible = false;
        return;
      }
      light.visible = true;
      light.position.set(hit.anchor.position.x, lampY(hit.anchor, 0.6), hit.anchor.position.z);
      const falloff = 1 - Math.min(0.85, hit.distance / LIGHTING.lamps.distance);
      light.intensity = (overrides[currentPreset]?.lampIntensity ?? LIGHTING.lamps.intensity) * Math.max(0.15, falloff) * presetOf(currentPreset).lampIntensityScale;
      light.distance = overrides[currentPreset]?.lampDistance ?? LIGHTING.lamps.distance;
      light.decay = LIGHTING.lamps.decay;
      lampState.active += 1;
    });
    lampState.emissiveOnly = Math.max(0, lamps.length - lampState.active);
  }

  function updateParticles(dt, elapsed, cameraPosition) {
    if (config.LIGHTING.atmosphere.smokeEnabled) {
      for (const system of smokeSystems) {
        const { positions, seeds, budget, anchor } = system;
        for (let i = 0; i < budget; i += 1) {
          const phase = (elapsed * 0.22 + seeds[i * 3]) % 1;
          const rise = phase * system.span;
          const sway = Math.sin(elapsed * 0.6 + seeds[i * 3 + 1] * 6.28) * (0.3 + rise * 0.22);
          positions[i * 3] = anchor.x + sway + seeds[i * 3 + 2] * 0.4 - 0.2;
          positions[i * 3 + 1] = anchor.y + rise + seeds[i * 3 + 1] * 0.3;
          positions[i * 3 + 2] = anchor.z + Math.cos(elapsed * 0.5 + seeds[i * 3 + 2] * 6.28) * 0.3;
        }
        system.geometry.attributes.position.needsUpdate = true;
      }
    }
    if (config.LIGHTING.atmosphere.dustEnabled && dustGroup.visible) {
      const focus = cameraPosition ?? { x: CENTER.x, y: CENTER.y, z: CENTER.z };
      const { positions, seeds, budget } = dust;
      const span = dustSpan;
      for (let i = 0; i < budget; i += 1) {
        const drift = (elapsed * 0.06 + seeds[i * 3]) % 1;
        positions[i * 3] = focus.x + (drift - 0.5) * span;
        positions[i * 3 + 1] = 2 + seeds[i * 3 + 1] * 46 + Math.sin(elapsed * 0.3 + seeds[i * 3 + 2] * 6.28) * 1.2;
        positions[i * 3 + 2] = focus.z + (seeds[i * 3 + 2] - 0.5) * span;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  function updateWater(elapsed) {
    for (const shader of waterShaders) {
      if (shader.uniforms?.uWaveTime) shader.uniforms.uWaveTime.value = elapsed;
    }
  }

  function updateLampFlicker(elapsed) {
    if (presetOf(currentPreset).lampIntensityScale <= 0.02) return;
    const speed = LIGHTING.lamps.flickerSpeed;
    const amp = LIGHTING.lamps.flickerAmplitude;
    for (const light of realtimeLights) {
      if (!light.visible) continue;
      const k = 1 + Math.sin(elapsed * speed * 6.28 + light.position.x * 0.13) * amp;
      light.userData.baseIntensity ??= light.intensity;
      light.intensity = light.userData.baseIntensity * k;
    }
  }

  let elapsedTotal = 0;
  function update(dt = 0, elapsed = null, state = null) {
    const t = elapsed ?? (elapsedTotal += dt);
    const cameraPosition = state?.cameraPosition ?? null;
    syncAnchors();
    updateInteriorFill(dt, cameraPosition);
    bindInteriorEnvMaps();
    updateLampSelection(t, cameraPosition);
    updateLampFlicker(t);
    updateParticles(dt, t, cameraPosition);
    updateWater(t);
    if (state?.quality && state.quality !== applied.quality) setQuality(state.quality);
    return t;
  }

  function describe() {
    const p = presetOf(currentPreset);
    return {
      preset: currentPreset,
      label: p.label,
      quality: applied.quality,
      sunDirection: { ...p.sunDirection },
      sunPosition: { x: sun.position.x, y: sun.position.y, z: sun.position.z },
      sunColor: `#${sun.color.getHexString()}`,
      sunIntensity: sun.intensity,
      ambientIntensity: ambient.intensity,
      hemiIntensity: hemi.intensity,
      exposure: p.exposure,
      toneMapping: config.LIGHTING.toneMapping.mode,
      outputColorSpace: config.LIGHTING.toneMapping.outputColorSpace,
      fog: { color: `#${scene.fog?.color.getHexString?.() ?? '000000'}`, near: p.fogNear, far: p.fogFar },
      shadows: {
        enabled: sun.castShadow,
        mapSize: sun.shadow.mapSize.x,
        primaryDirectionalLights: [sun].filter((l) => l.castShadow).length,
        lampShadows: 0,
      },
      lamps: {
        anchors: lampState.anchors.length,
        realtime: realtimeLights.length,
        active: lampState.active,
        emissiveOnly: lampState.emissiveOnly,
        emissiveIntensity: lampMaterial.emissiveIntensity,
        maxRealtimePointLights: config.LIGHTING.lamps.maxRealtimePointLights,
        poolByQuality: Math.min(config.LIGHTING.lamps.maxRealtimePointLights, config.QUALITY.tiers[applied.quality].maxRealtimeLights),
        /** t95：真机容量（= realtimeLights.length，随时辰的 lampIntensityScale 与质量档而定） */
        capacity: realtimeLights.length,
        qualityTier: applied.quality,
        preset: currentPreset,
        /** t95：**逐灯清单（直接读数）** top-`capacity`，每项 `{rank,id,role,distance,score}` */
        pool: lampState.pool.map((r) => ({ ...r })),
      },
      /** 权威背景口径（t45）：供 ?stats=1 / __PALACE__.stats() / 截图工具消费 */
      background: describeSceneBackground(),
      interior: {
        volumes: interiorVolumes.map((v) => v.zone),
        volumeBounds: interiorVolumes.map((v) => ({ zone: v.zone, minX: v.minX, maxX: v.maxX, minY: v.minY, maxY: v.maxY, minZ: v.minZ, maxZ: v.maxZ })),
        inside: interiorState.inside,
        blend: +interiorState.blend.toFixed(3),
        ambientIntensity: interiorAmbient.intensity,
        hemiIntensity: interiorHemi.intensity,
        fillFactors: INTERIOR_FILL[currentPreset] ?? null,
        litFrames: interiorState.litFrames,
        darkFrames: interiorState.darkFrames,
        envMap: {
          bound: interiorEnvBoundMaterials,
          traversals: interiorEnvTraversals,
          size: `${INTERIOR_ENV_SIZE.width}x${INTERIOR_ENV_SIZE.height}`,
          mapping: 'EquirectangularReflectionMapping',
          preset: currentPreset,
          textureName: interiorEnvTexture?.name ?? null,
        },
      },
      atmosphere: {
        smoke: smokeSystems.length,
        smokeBudget: smokeSystems.length > 0 ? smokeSystems[0].budget * smokeSystems.length : 0,
        dust: dustGroup.visible ? dust.budget : 0,
        waterMeshes: waterMeshes.size,
      },
    };
  }

  /* ------------------------------ state 反应 ------------------------------ */
  const disposers = [];
  let initialised = false;

  function init() {
    if (initialised) return;
    initialised = true;
    if (registry?.allLightAnchors) {
      // layout.LIGHT_ANCHORS 是深冻结的：这里只读取，绝不就地改写（灯位高度在放置时计算）
      lampState.anchors = registry.allLightAnchors();
    } else {
      lampState.anchors = [];
    }
    syncAnchors();
    buildLampInstances(lampState.anchors);
    setQuality(applied.quality);
    applyPreset(currentPreset);
    adoptWaterSurfaces();
    disposers.push(
      events.on(EVENTS.stateChange, ({ state, source }) => {
        if (state.timePreset !== currentPreset) applyPreset(state.timePreset, { source: source ?? 'state' });
        if (state.quality !== applied.quality) setQuality(state.quality);
      }),
    );
  }

  init();

  function dispose() {
    for (const d of disposers) d();
    disposers.length = 0;
    for (const system of smokeSystems) {
      smokeGroup.remove(system.points);
      system.geometry.dispose();
      system.material.dispose();
    }
    dustGroup.remove(dust.points);
    dust.geometry.dispose();
    dust.material.dispose();
    skyGeometry.dispose();
    skyMaterial.dispose();
    lampAnchorGeometry.dispose();
    lampMaterial.dispose();
    for (const light of realtimeLights) light.dispose?.();
    realtimeLights.length = 0;
    envRoot.clear();
  }

  return {
    root: envRoot,
    /** t50：天空网格只读访问（掩码诊断用） */
    skyMesh,
    sun,
    ambient,
    hemi,
    sky,
    applyPreset,
    setQuality,
    syncAnchors,
    setActiveOverrides: (patch) => {
      Object.assign(overrides, { [currentPreset]: { ...(overrides[currentPreset] ?? {}), ...patch } });
      applyPreset(currentPreset);
      return describe();
    },
    /** t90：灯位优先级（距离感知）与池排名，供测试/诊断复用同一实现 */
    lampScore,
    legacyLampScore,
    rankLampPool,
    LAMP_SCORE_POWER,
    registerWater,
    adoptWaterSurfaces,
    update,
    describe,
    dispose,
    stats: () => ({
      presets: Object.keys(presets),
      currentPreset,
      realtimeLights: realtimeLights.length,
      activeLamps: lampState.active,
      lampAnchors: lampState.anchors.length,
      dust: dust.budget,
      smoke: smokeSystems.reduce((sum, s) => sum + s.budget, 0),
      waterMeshes: waterMeshes.size,
    }),
    /** 供 audit/测试：统一灯的 draw call 归属 */
    lightObjects: () => ({ sun, ambient, hemi, realtimeLights: [...realtimeLights], lampInstances }),
  };
}

export default createEnvironment;
