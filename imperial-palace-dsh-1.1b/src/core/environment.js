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
import { ENVELOPE, getSlot, WALKABLE, ZONES } from '../shared/layout.js';

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
  /**
   * t106：**内景 Bloom 强度上限系数**（相机进入内景体积后，Bloom strength 按该系数缩放）。
   *
   * 诊断依据（t106，源级开关 + `?view=interior&zone=B&preset=dusk`，基线内容高光截断 5.67%）：
   *   · 关 Bloom            → 截断 **0.00%**（均值 0.098）⇒ 截断 100% 来自 Bloom；
   *   · kit 自发光 emissiveIntensity 1→0 → 5.68%（±0.01pp，**无贡献**）；
   *   · environment 灯自发光 `0.6+2.6*scale`→0 → 5.69%（±0.02pp，**无贡献**）；
   *   · 全材质 roughness→1（去镜面）→ 4.52%（−1.15pp，次要项）。
   * 故只缩放**内景**的 Bloom 强度：外景机位的 bloom 参数逐位不变（不受影响），
   * 也不动 `config.LIGHTING.presets.*.bloom`（config 不在本卡 inScope）与 §12 阈值。
   */
  const INTERIOR_BLOOM_STRENGTH_SCALE = 0.5;
  /**
   * t120：**内景 Bloom 上限的分档**（同一机制的细化，不新增第二套逻辑）。
   *
   * 由来：t106 用统一 ×0.5 压住金銮殿/寝殿等大空间；但 C/E 侧的**小院房**（如 `C-annex-west/east`，
   * 内部 ≈18×20m）在 `--interior=<slot>` 口径下仍贴线（实测 `C-annex-east night` 5.02% > 5%，t92 曾报 6.23%）。
   * 故按"房间净尺度"给两档：小房间更紧、大空间保持 t106 的冻结值 0.5（**大空间读数逐位不变** ⇒ 不回归 t106 的格子）。
   * 判据（§12 阈值 5%）一字未动；这是**收紧**而不是放宽。
   */
  const INTERIOR_BLOOM_TIERS = Object.freeze([
    Object.freeze({ tag: 'small', maxArea: 600, scale: 0.3 }),   // 院房/配房/小门屋（≈360 m² 级）
    Object.freeze({ tag: 'large', maxArea: Infinity, scale: INTERIOR_BLOOM_STRENGTH_SCALE }),
  ]);
  const interiorBloomTierFor = (area) => INTERIOR_BLOOM_TIERS.find((t) => area !== null && area <= t.maxArea) ?? INTERIOR_BLOOM_TIERS[INTERIOR_BLOOM_TIERS.length - 1];
  /** 逐"内景可行走面"的包围盒（不按区分组）——用于按房间尺度选择上限档；缺 bounds 的面跳过。 */
  const interiorSurfaceBoxes = WALKABLE.filter((w) => w.kind === 'interior' && w.bounds).map((w) => ({
    id: w.id,
    area: w.area ?? (w.bounds.maxX - w.bounds.minX) * (w.bounds.maxZ - w.bounds.minZ),
    minX: w.bounds.minX - INTERIOR_VOLUME_MARGIN,
    maxX: w.bounds.maxX + INTERIOR_VOLUME_MARGIN,
    minZ: w.bounds.minZ - INTERIOR_VOLUME_MARGIN,
    maxZ: w.bounds.maxZ + INTERIOR_VOLUME_MARGIN,
    minY: (w.y ?? 0) - 0.6,
    maxY: (w.y ?? 0) + INTERIOR_CEILING_HEIGHT,
  }));
  const interiorState = { inside: false, blend: 0, litFrames: 0, darkFrames: 0, activeArea: null };

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
    const previousBlend = interiorState.blend;
    const inside = insideInteriorVolume(cameraPosition);
    // t120：登记"当前所在的最小内景房间"的净面积（用于 bloom 分档；不在房间内 → null）
    interiorState.activeArea = (() => {
      if (!inside || !cameraPosition) return null;
      const hits = interiorSurfaceBoxes.filter((b) => cameraPosition.x >= b.minX && cameraPosition.x <= b.maxX && cameraPosition.z >= b.minZ && cameraPosition.z <= b.maxZ && cameraPosition.y >= b.minY && cameraPosition.y <= b.maxY);
      if (hits.length === 0) return null;
      return hits.reduce((min, b) => Math.min(min, b.area), Infinity);
    })();
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
    // t106：内景入境程度变化时重算 Bloom（外景 blend=0 → 逐位等同预设；进出内景各重算一次）
    if (Math.abs(interiorState.blend - previousBlend) > 1e-3) {
      applyBloom(presetOf(currentPreset), presetOf(currentPreset).lampIntensityScale);
    }
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
    /**
     * t5：最近一次入选滞回读数（`selectLampPool` 的直接结果；只读诊断，不参与判断）。
     * `admitted`/`evicted` = 本次真的换进来的新面孔/被让位的在位者；
     * `keptByHysteresis` = 本可被挤掉、因滞回被保留的在位者（>0 即证明滞回**在生产路径上生效**）。
     */
    hysteresis: { incumbents: 0, admitted: 0, evicted: 0, keptByHysteresis: 0, forced: 0 },
    /** t5：滞回累计计数（跨帧；供常驻守卫与验收直接读数，不参与判断） */
    hysteresisTotals: { admitted: 0, evicted: 0, kept: 0 },
    /**
     * t5：`snapFade` = "下一次重选直接把斜坡落到目标值"（不淡入淡出）。
     * 由**重配置类**变更置位（时辰/质量/锚点集变化，以及 `dt ≤ 0` 的 settle 路径）——
     * 这些不是"镜头移动造成的换灯"，必须立刻呈现稳态亮度，否则截图/§12 读数会读到半亮画面。
     */
    snapFade: true,
    /** t5：本帧处于斜坡中（0 < fade < 1）的槽位数（只读诊断） */
    fading: 0,
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
    lampState.snapFade = true; // t5：重配置后首次重选直接落稳态（不淡入）
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

  /**
   * t40：烟柱 LOD 滞回带的**等效距离区间**（米，只读诊断）。
   * `pointPx = size × (drawH/2) / dist` ⇒ `dist = size × (drawH/2) / pointPx`；
   * 用与生产同一式反解两个门限（drawH 取当前档位的绘制缓冲高度）。
   */
  function describeSmokeBandMetres() {
    const minPx = config.LIGHTING.atmosphere.smokeMinPointPx ?? 0;
    const showPx = config.LIGHTING.atmosphere.smokeShowPointPx ?? null;
    const size = smokeSystems[0]?.points?.material?.size ?? null;
    if (!(minPx > 0) || size === null) return null;
    const drawH = drawingBufferHeight();
    const at = (px) => (px > 0 ? +(size * (drawH / 2) / px).toFixed(1) : null);
    return { size, drawH, hideBeyondMetres: at(minPx), showWithinMetres: showPx !== null && showPx > minPx ? at(showPx) : null };
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

  /**
   * t106：按"当前时辰预设 + 内景入境程度"求 Bloom 参数。
   * 内景入境时 strength ×（1 −(1−SCALE)×blend）；blend=0（外景）时**逐位等同预设值**。
   */
  function bloomForState(preset = presetOf(currentPreset), lampScale = preset?.lampIntensityScale ?? 0) {
    const base = preset?.bloom ?? null;
    const blend = interiorState.blend;
    // t120：按房间尺度取上限档（大空间 = t106 冻结值 0.5；小院房 = 0.3）；不在任何房间内时取最松档
    const tier = interiorBloomTierFor(blend > 0 ? interiorState.activeArea : null);
    const shrink = 1 - (1 - tier.scale) * blend;
    const params = base && typeof base.strength === 'number'
      ? { ...base, strength: +(base.strength * shrink).toFixed(4) }
      : base;
    return { params, enabled: lampScale > 0 ? true : undefined, blend: +blend.toFixed(3), shrink: +shrink.toFixed(4), tier };
  }
  /** 应用 Bloom（唯一入口：applyPreset 与内景入境状态变化都走这里）。 */
  function applyBloom(preset = presetOf(currentPreset), lampScale = preset?.lampIntensityScale ?? 0) {
    const r = bloomForState(preset, lampScale);
    rendererAdapter.setBloom?.(r.params, r.enabled);
    applied.bloom = { preset: preset?.id ?? currentPreset, baseStrength: preset?.bloom?.strength ?? null, effectiveStrength: r.params?.strength ?? null, interiorBlend: r.blend, shrink: r.shrink, scale: r.tier.scale, tier: r.tier.tag, area: interiorState.activeArea };
    return applied.bloom;
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
    applyBloom(p, scale); // t106：内景按 INTERIOR_BLOOM_STRENGTH_SCALE 缩放（外景逐位不变）
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
    lampState.snapFade = true; // t5：重配置后首次重选直接落稳态（不淡入）

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
    lampState.snapFade = true; // t5：重配置后首次重选直接落稳态（不淡入）
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

  /**
   * 灯位候选**全量排名**（纯函数）：按分数降序，并列时依次比距离、id（**确定性**，不依赖注册顺序）。
   * t5：从 `rankLampPool` 抽出（原来只有"排名 + 截断"一步），使 `selectLampPool` 能在**同一条排名**上
   * 看到截断线**两侧**的候选（滞回判定需要知道"谁想进来、谁要被挤出去"）。
   * `rankLampPool` 的返回语义逐位不变（同一排序 + 同一 slice）。
   */
  function rankLampCandidates(lamps = [], focus = null, { scoreOf = lampScore, maxDistance = null } = {}) {
    const center = focus ?? { x: CENTER.x, y: CENTER.y, z: CENTER.z };
    const cap = maxDistance ?? Math.min(LIGHTING.lamps.distance * 6, LIGHTING.lamps.emissiveFallbackBeyond);
    return lamps
      .map((anchor) => ({
        anchor,
        distance: Math.hypot(anchor.position.x - center.x, anchor.position.z - center.z),
      }))
      .filter((r) => r.distance <= cap)
      .map((r) => ({ ...r, score: scoreOf(r.anchor.role, r.distance) }))
      .sort((a, b) => (b.score - a.score) || (a.distance - b.distance) || String(a.anchor.id).localeCompare(String(b.anchor.id)));
  }

  /** 灯位池排名（纯函数；`updateLampSelection` 与测试共用同一实现，避免"代理断言"）。 */
  function rankLampPool(lamps = [], focus = null, { budget = null, scoreOf = lampScore, maxDistance = null } = {}) {
    const size = budget ?? (realtimeLights.length || LIGHTING.lamps.maxRealtimePointLights);
    return rankLampCandidates(lamps, focus, { scoreOf, maxDistance }).slice(0, size);
  }

  /**
   * t5：**池入选滞回**（`updateLampSelection` 的生产选择器；纯函数、与渲染解耦，便于守卫直测）。
   *
   * 缺陷（t5 实测，见 `docs/reports/report-t5-lamp-flicker.md`）：镜头每帧转 0.5° 时，机位到各灯位的距离
   * 连续变化，而 `rankLampPool` 的 `slice(0, size)` 是**无滞回的硬截断** ⇒ 只要 rank-size 与 rank-size+1
   * 的相对分数裕量 `(s_N − s_{N+1}) / s_N` 落到 1e-3 量级（实测 VP-C-zone 有 3/150 帧 <1e-3），
   * 截断线就在两盏灯之间来回跳（实测基线 14 机位 × 150 帧共 307 次槽位换灯位）。
   *
   * 修法（**只加滞回，不动任何预算**）：把"挑战者 top-size"与"在位者"做配对，
   * 新面孔只有**显著优于**它要挤掉的在位者（`score > incumbent.score × (1 + margin)`）才准进池；
   * 否则保留在位者。配对规则：新面孔按分数降序、在位者按分数升序（最强的挑战者挤最弱的在位者）；
   * 在位者已**离开距离上限**时不参与配对（必须让位），空出的名额由排名最靠后的新面孔无条件补上。
   * 返回池长度恒等于 `size`（除非候选不足）⇒ 池容量与距离上限**逐值不变**。
   */
  /** t5 的节流窗口（0.35s，值未动）；t42 起它只是**下界**，实际上界随相机速度拉长（见下）。 */
  const LAMP_RESELECT_SECONDS = 0.35;
  const LAMP_HYSTERESIS_MARGIN = 0.12;
  /**
   * t42：**换灯可见性闸门**（默认取 `LIGHTING.lamps`，见 `src/shared/config.js` 的注释）。
   * 判据：在位者距离 > `LIGHTING.lamps.distance × (1 + evictRangeMargin)` ⇒ 它已在自己照度范围之外、
   * 逐像素贡献为 0 ⇒ 换掉它**构造性不可见**；仍在范围内的在位者默认**不换**（`allowInRangeEviction=false`），
   * 以免"两盏都在亮的灯互换"这种必然可见的交换（t5 的分数滞回只挡住了近并列，挡不住这种交换）。
   */
  /** t42：当前选择架构（可被 `setLampSelectionMode` 覆盖，初值取 config）。 */
  let lampSelectionMode = LIGHTING.lamps.selectionMode === 'dynamic' ? 'dynamic' : 'zone-static';
  const LAMP_EVICT_RANGE_MARGIN = 0.25;
  const LAMP_ALLOW_IN_RANGE_EVICTION = false;
  function lampRangeLimit(margin = LAMP_EVICT_RANGE_MARGIN) {
    return LIGHTING.lamps.distance * (1 + margin);
  }
  /* ─────────────── t42：**分区静态配额**选择器（默认架构） ─────────────── */

  /** 分区边界表（来自 `layout.ZONES`，不写字面坐标）；内区优先，`F` 是外环故最后判。 */
  const ZONE_BOUNDS = Object.freeze(Object.fromEntries(ZONES.map((z) => [z.id, z.bounds])));
  const ZONE_PROBE_ORDER = Object.freeze(['B', 'C', 'D', 'E', 'F']);
  /** 相机所在分区（都不在 ⇒ `'CITY'` = 全城口径）。口径三要素：边界源 = layout.ZONES，顺序 = ZONE_PROBE_ORDER。 */
  function zoneOfCamera(focus) {
    if (!focus) return 'CITY';
    for (const id of ZONE_PROBE_ORDER) {
      const b = ZONE_BOUNDS[id];
      if (!b) continue;
      if (focus.x >= b.minX && focus.x <= b.maxX && focus.z >= b.minZ && focus.z <= b.maxZ) return id;
    }
    return 'CITY';
  }
  const ZONE_CENTER = Object.freeze(Object.fromEntries(ZONES.map((z) => [z.id, {
    x: (z.bounds.minX + z.bounds.maxX) / 2,
    z: (z.bounds.minZ + z.bounds.maxZ) / 2,
  }])));
  /**
   * **分区内的静态排序**（与相机无关）：重要性降序 → 到**本区中心**的距离升序 → id。
   * 因为不含相机量，同一分区的排序在任何机位/任何帧都是同一条 ⇒ 池在区内恒定。
   */
  function staticRankInZone(lamps, zone) {
    const center = ZONE_CENTER[zone] ?? { x: CENTER.x, z: CENTER.z };
    return lamps
      .filter((a) => (a.zone ?? a.zoneId ?? null) === zone)
      .map((a) => ({
        anchor: a,
        importance: ROLE_IMPORTANCE[a.role] ?? 0.5,
        centreDistance: Math.hypot(a.position.x - center.x, a.position.z - center.z),
      }))
      .sort((a, b) => (b.importance - a.importance)
        || (a.centreDistance - b.centreDistance)
        || String(a.anchor.id).localeCompare(String(b.anchor.id)));
  }
  const CITY_CENTER = Object.freeze({ x: CENTER.x, z: CENTER.z });
  /** 全城静态排序（相机在分区之外时使用；同样与相机无关）。 */
  function staticRankCity(lamps) {
    return lamps
      .map((a) => ({
        anchor: a,
        importance: ROLE_IMPORTANCE[a.role] ?? 0.5,
        centreDistance: Math.hypot(a.position.x - CITY_CENTER.x, a.position.z - CITY_CENTER.z),
      }))
      .sort((a, b) => (b.importance - a.importance)
        || (a.centreDistance - b.centreDistance)
        || String(a.anchor.id).localeCompare(String(b.anchor.id)));
  }
  /** 份额分配：相机所在区先拿 `ceil(size × zoneLocalShare)`，余下按固定权重序（B,C,D,E,F）分。 */
  function zoneQuota(size, focus) {
    const weights = LIGHTING.lamps.zoneQuotaWeights ?? {};
    const local = zoneOfCamera(focus);
    const localShare = Number.isFinite(LIGHTING.lamps.zoneLocalShare) ? LIGHTING.lamps.zoneLocalShare : 0.5;
    const quotas = {};
    let left = size;
    const localTake = local === 'CITY' ? 0 : Math.min(left, Math.max(1, Math.ceil(size * localShare)));
    if (localTake > 0) { quotas[local] = localTake; left -= localTake; }
    const order = ZONE_PROBE_ORDER.filter((id) => id !== local);
    const weightSum = order.reduce((sum, id) => sum + (weights[id] ?? 0), 0) || 1;
    for (const id of order) {
      if (left <= 0) break;
      const share = Math.max(1, Math.round((weights[id] ?? 0) / weightSum * (size - localTake)));
      const take = Math.min(left, share);
      if (take > 0) { quotas[id] = (quotas[id] ?? 0) + take; left -= take; }
    }
    return { quotas, local, localTake };
  }
  /**
   * t42：**分区静态池** —— `pool` 由 `(真机容量, 相机分区)` 唯一决定，**与相机在区内的位置无关**。
   * 距离/分数仍按**相机口径**计算并暴露（`falloff` 与诊断需要），但它们**不参与选择** ⇒ 构造上零抖动。
   */
  function selectLampPoolStatic(lamps = [], focus = null, { budget = null, incumbents = [] } = {}) {
    const size = budget ?? (realtimeLights.length || LIGHTING.lamps.maxRealtimePointLights);
    if (size <= 0) return { pool: [], ranked: [], admitted: [], evicted: [], keptByHysteresis: [], forced: [], rangeGated: [], quotas: {}, local: 'CITY', mode: 'zone-static' };
    const { quotas, local } = zoneQuota(size, focus);
    const picked = [];
    const seen = new Set();
    for (const [zone, take] of Object.entries(quotas)) {
      for (const row of staticRankInZone(lamps, zone).slice(0, take)) {
        if (seen.has(row.anchor.id)) continue;
        seen.add(row.anchor.id);
        picked.push(row.anchor);
      }
    }
    // 名额没填满（该区灯位不足）⇒ 用全城静态序补齐（同样与相机无关）
    if (picked.length < size) {
      for (const row of staticRankCity(lamps)) {
        if (picked.length >= size) break;
        if (seen.has(row.anchor.id)) continue;
        seen.add(row.anchor.id);
        picked.push(row.anchor);
      }
    }
    const center = focus ?? { x: CENTER.x, y: CENTER.y, z: CENTER.z };
    const pool = picked.slice(0, size).map((anchor) => {
      const distance = Math.hypot(anchor.position.x - center.x, anchor.position.z - center.z);
      return { anchor, distance, score: lampScore(anchor.role, distance) };
      // 暴露顺序沿用 t95 约定：分数降序（选择本身是静态的，顺序只是清单口径）
    }).sort((a, b) => (b.score - a.score) || (a.distance - b.distance) || String(a.anchor.id).localeCompare(String(b.anchor.id)));
    const poolIds = new Set(pool.map((r) => r.anchor.id));
    const incumbentSet = new Set(incumbents);
    const admitted = pool.filter((r) => !incumbentSet.has(r.anchor.id));
    const evicted = incumbents.filter((id) => !poolIds.has(id)).map((id) => ({ anchor: { id }, distance: Infinity, score: 0 }));
    return {
      pool,
      ranked: pool,
      admitted,
      evicted,
      keptByHysteresis: pool.filter((r) => incumbentSet.has(r.anchor.id)),
      forced: [],
      rangeGated: [],
      quotas,
      local,
      mode: 'zone-static',
    };
  }

  function selectLampPool(lamps = [], focus = null, {
    budget = null,
    incumbents = [],
    margin = LAMP_HYSTERESIS_MARGIN,
    scoreOf = lampScore,
    maxDistance = null,
    evictRangeMargin = LAMP_EVICT_RANGE_MARGIN,
    allowInRangeEviction = LAMP_ALLOW_IN_RANGE_EVICTION,
    mode = lampSelectionMode,
  } = {}) {
    /**
     * t42：**架构分派** —— 默认 `'zone-static'`（分区静态配额、与相机位置无关 ⇒ 区内构造上零换灯）；
     * `'dynamic'` 保留为 t5 的老路径（守卫②的近并列滞回夹具与**突变对照**都跑这条路）。
     */
    if (mode === 'zone-static' && !allowInRangeEviction) {
      return selectLampPoolStatic(lamps, focus, { budget, incumbents });
    }
    const size = budget ?? (realtimeLights.length || LIGHTING.lamps.maxRealtimePointLights);
    const ranked = rankLampCandidates(lamps, focus, { scoreOf, maxDistance });
    const empty = { pool: [], ranked, admitted: [], evicted: [], keptByHysteresis: [], forced: [], rangeGated: [], rangeLimit: +lampRangeLimit(evictRangeMargin).toFixed(3) };
    if (size <= 0) return empty;

    /* ── t5 规则：top-size + 分数滞回（`allowInRangeEviction: true` 或 `mode:'dynamic'` 时走这里） ── */
    /* ── 旧规则（t5）：top-size + 分数滞回 —— 只用于对照/突变证明（`allowInRangeEviction: true`） ── */
    const challengers = ranked.slice(0, size);
    const incumbentSet = new Set(incumbents);
    const challengerIds = new Set(challengers.map((r) => r.anchor.id));
    const stayers = challengers.filter((r) => incumbentSet.has(r.anchor.id));
    const newcomers = challengers.filter((r) => !incumbentSet.has(r.anchor.id));
    const outsiders = ranked.filter((r) => incumbentSet.has(r.anchor.id) && !challengerIds.has(r.anchor.id));
    const outsidersWeakestFirst = [...outsiders].reverse();
    const contested = Math.min(newcomers.length, outsiders.length);
    const forced = newcomers.slice(contested);
    const admitted = [...forced];
    const keptByHysteresis = [];
    const evicted = [];
    const rangeGated = [];
    const rangeLimit = lampRangeLimit(evictRangeMargin);
    for (let k = 0; k < contested; k += 1) {
      const newcomer = newcomers[k];
      const incumbent = outsidersWeakestFirst[k];
      const decisive = newcomer.score > incumbent.score * (1 + margin);
      if (decisive) {
        admitted.push(newcomer);
        evicted.push(incumbent);
      } else {
        keptByHysteresis.push(incumbent);
        rangeGated.push({ incumbent: incumbent.anchor.id, challenger: newcomer.anchor.id, incumbentDistance: +incumbent.distance.toFixed(3), decisive });
      }
    }
    const pool = [...stayers, ...admitted, ...keptByHysteresis]
      .sort((a, b) => (b.score - a.score) || (a.distance - b.distance) || String(a.anchor.id).localeCompare(String(b.anchor.id)));
    return { pool, ranked, admitted, evicted, keptByHysteresis, forced, rangeGated, rangeLimit: +rangeLimit.toFixed(3) };
  }

  /** t90 前口径（仅用于对照/突变证明；**不再参与生产选择**）。 */
  function legacyLampScore(role, distance, { distance: d0 = LIGHTING.lamps.distance } = {}) {
    const importance = ROLE_IMPORTANCE[role] ?? 0.5;
    const span = d0 * 6;
    return importance * (1 - Math.min(1, (Number.isFinite(distance) ? distance : 0) / span));
  }

  /**
   * t5：`snapFade` 的**第二个**触发条件——"从非运行状态恢复"。
   * 相邻两次重选的间隔在连续旋转下恒为节流值 0.35s；一旦间隔 ≥ 1s，说明循环刚启动 / 标签页刚从后台恢复
   * / 走了确定性截图路径 ⇒ 直接落稳态，不淡入（否则首屏与截图会读到半亮画面）。
   */
  const LAMP_FADE_RESUME_SECONDS = 1;

  function updateLampSelection(elapsed, cameraPosition, dt = 0) {
    const lamps = lampState.anchors;
    if (lamps.length === 0 || realtimeLights.length === 0) {
      // t95：没有可选灯位/没有实时名额时，池必须清空（否则 describe() 会读到上一帧的陈旧清单）
      lampState.pool = [];
      lampState.snapFade = true; // t5：名额恢复后首次重选直接落稳态
      return;
    }
    const focus = cameraPosition ?? { x: CENTER.x, y: CENTER.y, z: CENTER.z };
    /**
     * t42：**节流窗口随相机速度拉长**（卡面指定手段）——
     *   `speed` = 本帧相机位移 / dt（第一人称步行 ≈5 m/s；守卫协议的 0.5°/帧环绕 ≈200 m/s）。
     *   越慢 ⇒ 换灯越刺眼（画面几乎静止）⇒ 窗口从 base(0.35s) 线性拉长到 `reselectMaxSeconds`(0.8s)；
     *   越快 ⇒ 场景本身剧烈变化 ⇒ 保留 base（不放大节流，避免"用少重选掩盖抖动"）。
     * 口径三要素：base = `LAMP_RESELECT_SECONDS`(0.35s，t5 值未动)、参考速度 = `reselectSpeedReference`(60 m/s)。
     */
    const gap = elapsed - lampState.lastReselect;
    const prevFocus = lampState.prevFocus ?? null;
    const frameDt = dt > 0 ? dt : 1 / 60;
    const speed = prevFocus ? Math.hypot(focus.x - prevFocus.x, focus.z - prevFocus.z) / frameDt : 0;
    lampState.prevFocus = { x: focus.x, z: focus.z };
    const maxSeconds = Number.isFinite(LIGHTING.lamps.reselectMaxSeconds) ? LIGHTING.lamps.reselectMaxSeconds : LAMP_RESELECT_SECONDS;
    const speedRef = Number.isFinite(LIGHTING.lamps.reselectSpeedReference) && LIGHTING.lamps.reselectSpeedReference > 0
      ? LIGHTING.lamps.reselectSpeedReference
      : Infinity;
    const slow = Math.max(0, 1 - Math.min(1, speed / speedRef));
    const interval = LAMP_RESELECT_SECONDS + (maxSeconds - LAMP_RESELECT_SECONDS) * slow;
    if (gap < interval) return;
    lampState.lastReselect = elapsed;
    lampState.lastInterval = +interval.toFixed(4);
    lampState.lastSpeed = +speed.toFixed(3);
    const resume = !Number.isFinite(gap) || gap >= LAMP_FADE_RESUME_SECONDS;
    /**
     * t5：走**带滞回**的生产选择器 `selectLampPool`（评分口径、池容量、距离上限、节流全部不变）：
     *   · 在位者（上一帧池内的灯位）只有被"显著更优"的挑战者挤出时才让位 ⇒ 截断线不再逐帧抖动；
     *   · 入选池仍按分数降序暴露（`describe().lamps.pool` 语义不变）。
     */
    const incumbents = lampState.pool.map((r) => r.id);
    const selection = selectLampPool(lamps, focus, { budget: realtimeLights.length, incumbents });
    const pool = selection.pool;
    lampState.poolZone = selection.local ?? null;
    lampState.poolQuotas = selection.quotas ?? null;
    lampState.poolMode = selection.mode ?? lampSelectionMode;
    lampState.hysteresis = {
      incumbents: incumbents.length,
      admitted: selection.admitted.length,
      evicted: selection.evicted.length,
      keptByHysteresis: selection.keptByHysteresis.length,
      forced: selection.forced.length,
    };
    lampState.hysteresisTotals.admitted += selection.admitted.length;
    lampState.hysteresisTotals.evicted += selection.evicted.length;
    lampState.hysteresisTotals.kept += selection.keptByHysteresis.length;
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

    /**
     * t5：**槽位绑定按身份保留**（不是按排名位次）。8 盏 PointLight 同色同参，
     * 池内次序变化在画面上是零效应；只有"进出池"才产生可见硬切。
     * 若按 `pool[i]` 直接写槽位，则一次进出会连带让多盏灯**换位置**（槽位 i 换到别的灯位），
     * 白白放大突变面。这里先把"仍在池内"的原绑定原槽位保留，再用空槽位接纳新面孔。
     */
    const byId = new Map(pool.map((r) => [r.anchor.id, r]));
    const slotBinding = new Array(realtimeLights.length).fill(null);
    const bound = new Set();
    realtimeLights.forEach((light, i) => {
      const id = light.userData?.lampAnchorId ?? null;
      if (id && byId.has(id) && !bound.has(id)) {
        slotBinding[i] = id;
        bound.add(id);
      }
    });
    const free = pool.filter((r) => !bound.has(r.anchor.id));
    let freeIndex = 0;
    for (let i = 0; i < slotBinding.length && freeIndex < free.length; i += 1) {
      if (slotBinding[i]) continue;
      slotBinding[i] = free[freeIndex].anchor.id;
      bound.add(free[freeIndex].anchor.id);
      freeIndex += 1;
    }

    lampState.active = 0;
    /**
     * t5：**进出池与距离变化都不硬切**——重选只写"目标绑定 + 目标满强度 + 目标开合位"，
     * 真实强度由每帧 `updateLampOutput()` 限速逼近。三条口径：
     *   ① `snap`（时辰/质量/锚点重配置后的首次重选、`dt ≤ 0` 的 `settle()`、从非运行状态恢复）
     *      ⇒ 直接落稳态，稳态亮度与修复前**逐值相同**（§12 可读性 / 截图确定性不受影响）；
     *   ② **换绑时强度连续**：新灯位从"上一帧该槽位的实际强度"起步（`lampBase = 上一帧强度`，`fade = 1`），
     *      而不是从满强度硬跳 ⇒ 单帧增量仍被限速；
     *   ③ 掉出池的槽位只把**目标**置 0，`lampBase` 保留到斜坡真正走完才释放（否则会瞬间归零 = 硬切）。
     * 距离变化（同一灯位、falloff 变化）同样走 `lampBaseTarget` 限速 ⇒ 节流窗口内的基准台阶也被抹平。
     */
    const snap = lampState.snapFade || dt <= 0 || resume;
    lampState.snapFade = false;
    realtimeLights.forEach((light, i) => {
      const hit = slotBinding[i] ? byId.get(slotBinding[i]) : null;
      const prevId = light.userData.lampAnchorId ?? null;
      if (!hit) {
        light.userData.lampTarget = 0; // 斜坡熄灭；lampBase 在 fade 归零后才释放
        if (snap) {
          light.userData.lampAnchorId = null;
          light.userData.lampBase = 0;
          light.userData.lampBaseTarget = 0;
          light.userData.fade = 0;
        }
        return;
      }
      const falloff = 1 - Math.min(0.85, hit.distance / LIGHTING.lamps.distance);
      const base = (overrides[currentPreset]?.lampIntensity ?? LIGHTING.lamps.intensity) * Math.max(0.15, falloff) * presetOf(currentPreset).lampIntensityScale;
      const prevIntensity = light.intensity; // 上一帧该槽位的**最终**强度（含 flicker）——换绑连续性锚点
      const rebound = prevId !== hit.anchor.id;
      // t5：槽位 ↔ 灯位绑定登记（只读登记，不参与选择/预算判断）——供 lampSlots() 与守卫取证
      light.userData.lampAnchorId = hit.anchor.id;
      light.position.set(hit.anchor.position.x, lampY(hit.anchor, 0.6), hit.anchor.position.z);
      light.userData.lampBaseTarget = base;
      light.userData.lampTarget = 1;
      if (snap || light.userData.lampBase === undefined) {
        light.userData.lampBase = base;
        light.userData.fade = 1;
        light.userData.lampContinuity = null;
      } else if (rebound) {
        /**
         * 强度连续：登记"上一帧实际强度"为连续性锚点，由每帧输出层反解当前满强度
         * （`base = 上一帧强度 / (fade × k)`）。这样**连 flicker 相位突变也被吸收**——
         * flicker 相位是 `light.position.x` 的函数，换绑就换相位，硬写 base 会留下
         * 最大 `2 × flickerAmplitude × base`（夜间 ≈1.8，≈108/s）的残余跳变。
         */
        light.userData.lampContinuity = Math.max(0, prevIntensity);
        light.userData.fade = 1;
      } else if (light.userData.fade === undefined) {
        light.userData.fade = 1;
      }
      light.distance = overrides[currentPreset]?.lampDistance ?? LIGHTING.lamps.distance;
      light.decay = LIGHTING.lamps.decay;
      lampState.active += 1;
    });
    lampState.emissiveOnly = Math.max(0, lamps.length - lampState.active);
  }

  /**
   * t5：**每帧**限速推进"满强度"与"开合位"并写最终强度（flicker 之前）。
   *
   * 机制（t5 实测，见 `docs/reports/report-t5-lamp-flicker.md`）：旋转镜头时 `updateLampSelection`
   * 每 0.35s（`lastReselect` 节流）重选一次，池集合变化 ⇒ 某盏 PointLight **在单帧内从 0 跳到满强度
   * 或反之**（实测每次重选平均 0.58 盏进出，2.5s 内约 5 次）——这就是肉眼看到的"灯闪烁"。
   * 实测（14 机位 × 150 帧 × 0.5°/帧，夜/中档）：
   *   · 滞回（`selectLampPool`）单独只能把槽位换灯位从 307 次降到 ~290 次（≈6%）——大部分进出是"镜头确实移动了"；
   *   · **槽位按身份绑定**把同一条轨迹降到 93 次（≈70%）——消除了"池内次序变化引起的多盏灯同时瞬移"；
   *   · 剩下的 93 次是真实的进出池，只有**限速斜坡**能消掉它们的"单帧硬切"：
   *     单帧强度变化率峰值 90.4/s → 69.2/s（斜坡上界 = 满量程 18 / 0.3s = 60/s）。
   * 三者各治一段，故本次落地三者齐上（预算一律未动）。
   * 单帧强度增量从"满量程"降到 `满量程 × dt / LAMP_FADE_SECONDS`（夜间 60fps ⇒ ≤1.0，原为 15.3）。
   *
   * 口径不变项：稳态（`fade = 1` 且 `lampBase = lampBaseTarget`）强度与修复前**逐值相同**；
   * 池容量、距离上限、节流、评分全部未改。
   */
  const LAMP_FADE_SECONDS = 0.3;

  /**
   * t5：**唯一的每帧灯光输出层**（合并原 `updateLampFade` + `updateLampFlicker`，消除两遍写 intensity 的顺序歧义）。
   * 每盏灯的最终强度恒为 `lampBase × fade × flickerK`：
   *   · `lampBase` 限速逼近 `lampBaseTarget`（斜坡，速率 = `满量程 / LAMP_FADE_SECONDS`）；
   *   · `fade` 限速逼近 `lampTarget`（进出池的开合）；
   *   · `flickerK` = `1 + sin(elapsed × flickerSpeed × 2π + x × 0.13) × flickerAmplitude`（口径未改）；
   *   · 换绑帧用 `lampContinuity` 反解 `lampBase` ⇒ 强度**精确连续**（含 flicker 相位突变）。
   * `dt ≤ 0`（`settle()` / 确定性截图）⇒ 全部直接落位（`settle` = Infinity）。
   */
  function updateLampOutput(dt, elapsed) {
    const scale = presetOf(currentPreset).lampIntensityScale;
    const full = (overrides[currentPreset]?.lampIntensity ?? LIGHTING.lamps.intensity) * Math.max(0, scale);
    const settle = dt > 0 ? null : Infinity; // dt ≤ 0（settle/截图）⇒ 直接落位
    const baseStep = settle ?? (full * dt) / LAMP_FADE_SECONDS;
    const fadeStep = settle ?? dt / LAMP_FADE_SECONDS;
    const speed = LIGHTING.lamps.flickerSpeed;
    const amp = LIGHTING.lamps.flickerAmplitude;
    lampState.fading = 0;
    for (const light of realtimeLights) {
      const target = light.userData.lampTarget ?? 0;
      let fade = light.userData.fade ?? target;
      if (target > fade) fade = Math.min(target, fade + fadeStep);
      else if (target < fade) fade = Math.max(target, fade - fadeStep);
      const k = scale > 0.02 ? 1 + Math.sin(elapsed * speed * 6.28 + light.position.x * 0.13) * amp : 1;
      const continuity = light.userData.lampContinuity;
      if (typeof continuity === 'number') {
        light.userData.lampContinuity = null;
        const denom = fade * k;
        light.userData.lampBase = denom > 1e-6 ? continuity / denom : 0;
      }
      let base = light.userData.lampBase ?? 0;
      const baseTarget = light.userData.lampBaseTarget ?? base;
      if (baseTarget > base) base = Math.min(baseTarget, base + baseStep);
      else if (baseTarget < base) base = Math.max(baseTarget, base - baseStep);
      if (target === 0 && fade <= 0) {
        base = 0; // 完全熄灭后才释放基准与绑定
        light.userData.lampAnchorId = null;
      }
      light.userData.lampBase = base;
      light.userData.fade = fade;
      light.intensity = base * fade * k;
      light.visible = fade > 0.002 && base > 0 && scale > 0.02;
      if (fade > 0 && fade < 1) lampState.fading += 1;
      else if (base !== baseTarget) lampState.fading += 1; // 基准仍在限速逼近
    }
  }


  /**
   * t25：**绘制缓冲高度**（three 的 `points` 着色器里 `gl_PointSize = size × (drawingBufferHeight/2) / -mvPosition.z`
   * 的分子即此值；烟柱 LOD 的 `pointPx` 与它同式）。
   *
   * 取值优先级（**不新增 renderer/main 依赖**，全部走可选读取，接不上就回落配置）：
   *   ① `rendererAdapter.drawingBufferHeight()`（若上游接上即拿到实时值，含 DPR 与运行时 resize）；
   *   ② `rendererAdapter.size.height`；③ `rendererAdapter.getStats().viewport.height`（**仅在档位变化时读一次**，避免每帧建对象）；
   *   ④ 回落 = `BUDGET.viewport.height × 当前档位 dpr`（本仓 900×1 = 900，与 t1 探针口径 **逐值一致**）。
   */
  let drawBufMemo = { tier: null, height: 0 };
  function drawingBufferHeight() {
    const cheap = rendererAdapter?.drawingBufferHeight?.() ?? rendererAdapter?.size?.height;
    if (Number.isFinite(cheap) && cheap > 0) return cheap;
    if (drawBufMemo.tier === applied.quality && drawBufMemo.height > 0) return drawBufMemo.height;
    const live = rendererAdapter?.getStats?.()?.viewport?.height;
    const dpr = config.QUALITY?.tiers?.[applied.quality]?.dpr ?? 1;
    const fromConfig = (config.BUDGET?.viewport?.height ?? 900) * dpr;
    const height = Number.isFinite(live) && live > 0 ? live : fromConfig;
    drawBufMemo = { tier: applied.quality, height };
    return height;
  }

  function updateParticles(dt, elapsed, cameraPosition) {
    if (config.LIGHTING.atmosphere.smokeEnabled) {
      /**
       * t25（落地 t1 交回的最小修复 `docs/handoff-t1-flicker.md` §6.2）：**烟柱 LOD**。
       *
       * 症状：`?view=oblique` 下中轴 4 座香炉距相机 935–1424 m，`size=1.1` + `sizeAttenuation`
       * ⇒ `gl_PointSize ≈ 0.35–0.53 px`（**亚像素**）；同像素叠 3–5 颗、48 颗按 4.5 s 硬回绕
       * ⇒ 9–14 次/秒的亚像素覆盖翻转，压在宫红墙边缘 = 肉眼所见的"红色边缘持续闪烁"。
       *
       * 修法（**只改可见性**，与 three 的 `points` 着色器同式）：`pointPx = size × (H/2) / dist`，
       * 小于 `LIGHTING.atmosphere.smokeMinPointPx`（默认 1.0 px）⇒ **整柱 `points.visible = false`**。
       * 粒子数/预算/材质规格/相位公式**逐值未动**（§8.2 与 `tests/flicker-guard.test.mjs` ② 均断言）。
       * 等效距离门限 = `1.1 × 450 / 1.0 ≈ 495 m`；近景 20 m 处点径 24.75 px ≫ 1.0 ⇒ 近景烟柱形态完全保留。
       */
      const smokeMinPx = config.LIGHTING.atmosphere.smokeMinPointPx ?? 0;
      /**
       * t40：**滞回上门限**（`smokeShowPointPx`，默认 1.25 px）。
       * 只有单门限时，相机在门限附近运动 ⇒ `pointPx` 在 1.0 上下抖动 ⇒ 整柱 `visible` **逐帧跳变**
       * （移动协议实测：绕门限往复行走 48 帧，单柱翻转最高 12 次）。滞回后：
       *   `pointPx < min` ⇒ 隐藏；`pointPx ≥ show` ⇒ 显示；带内 ⇒ **保持上一帧状态**（粘滞）。
       * `show` 未登记 / ≤ `min` ⇒ 退化为 t25 的单门限行为（配置缺失不制造新的不稳定）。
       */
      const smokeShowRaw = config.LIGHTING.atmosphere.smokeShowPointPx;
      const smokeShowPx = Number.isFinite(smokeShowRaw) && smokeShowRaw > smokeMinPx ? smokeShowRaw : null;
      const drawH = smokeMinPx > 0 && cameraPosition ? drawingBufferHeight() : 0;
      for (const system of smokeSystems) {
        const { positions, seeds, budget, anchor } = system;
        if (smokeMinPx > 0) {
          if (!cameraPosition) {
            system.points.visible = true; // 无相机读数 ⇒ 不敢裁（宁可保留旧行为，不制造新的缺失）
          } else {
            const dist = Math.hypot(anchor.x - cameraPosition.x, anchor.y - cameraPosition.y, anchor.z - cameraPosition.z);
            const pointPx = (system.points.material.size * (drawH / 2)) / Math.max(1e-6, dist);
            system.smokePointPx = +pointPx.toFixed(4);
            if (pointPx < smokeMinPx) system.points.visible = false;
            else if (smokeShowPx === null) system.points.visible = pointPx >= smokeMinPx;
            else if (pointPx >= smokeShowPx) system.points.visible = true;
            // 带内：保持上一帧状态（`system.points.visible` 即上一帧判定结果，无需额外状态位）
          }
          if (!system.points.visible) continue; // 整柱不绘制（连位置更新也省掉：不可见即无需重建缓冲）
        }
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

  let elapsedTotal = 0;
  function update(dt = 0, elapsed = null, state = null) {
    const t = elapsed ?? (elapsedTotal += dt);
    const cameraPosition = state?.cameraPosition ?? null;
    syncAnchors();
    updateInteriorFill(dt, cameraPosition);
    bindInteriorEnvMaps();
    updateLampSelection(t, cameraPosition, dt);
    // t5：唯一的每帧灯光输出（限速斜坡 + 进出池开合 + flicker）；dt ≤ 0（settle/截图）直接落稳态
    updateLampOutput(dt, t);
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
        /**
         * t5：入选滞回读数 —— ① `margin` 生效值；② 本次 `{incumbents,admitted,evicted,keptByHysteresis,forced}`；
         * ③ 跨帧累计 `{admitted,evicted,kept}`。`kept > 0` 证明滞回在生产路径上真的拦下过抖动换灯。
         */
        hysteresis: {
          margin: LAMP_HYSTERESIS_MARGIN,
          last: { ...lampState.hysteresis },
          totals: { ...lampState.hysteresisTotals },
        },
        /** t42：换灯可见性闸门与速度挂钩节流（权威读数） */
        gate: {
          mode: lampSelectionMode,
          local: lampState.poolZone ?? null,
          quotas: lampState.poolQuotas ?? null,
          evictRangeMargin: LAMP_EVICT_RANGE_MARGIN,
          allowInRangeEviction: LAMP_ALLOW_IN_RANGE_EVICTION,
          rangeLimit: +lampRangeLimit().toFixed(3),
          rangeGated: lampState.hysteresis?.rangeGated ?? [],
          rangeGatedTotals: lampState.rangeGatedTotals ?? 0,
          reselect: { baseSeconds: LAMP_RESELECT_SECONDS, maxSeconds: LIGHTING.lamps.reselectMaxSeconds ?? null, speedReference: LIGHTING.lamps.reselectSpeedReference ?? null, lastInterval: lampState.lastInterval ?? null, lastSpeed: lampState.lastSpeed ?? null },
        },
        /** t5：进出池斜坡（`fadeSeconds` 生效值；`fading` = 本帧处于 0<fade<1 的槽位数，只读诊断） */
        fade: { seconds: LAMP_FADE_SECONDS, fading: lampState.fading, snapPending: lampState.snapFade },
      },
      /** 权威背景口径（t45）：供 ?stats=1 / __PALACE__.stats() / 截图工具消费 */
      background: describeSceneBackground(),
      /**
       * t40：**烟柱 LOD 权威读数**（滞回 + 逐柱状态）。
       * 供移动协议探针（`scripts/probe-motion-edges.mjs`）、守卫（`tests/core-antialias.test.mjs` ⑤）
       * 与 `?stats=1` 消费：`pointPx` 用**生产同一式**（`size × (drawingBufferHeight/2) / dist`），
       * `visible` 就是生产帧真正写进 `points.visible` 的值（不是复算）。
       */
      smoke: {
        enabled: config.LIGHTING.atmosphere.smokeEnabled,
        minPointPx: config.LIGHTING.atmosphere.smokeMinPointPx ?? 0,
        showPointPx: config.LIGHTING.atmosphere.smokeShowPointPx ?? null,
        bandMetres: describeSmokeBandMetres(),
        systems: smokeSystems.map((s, index) => ({
          index,
          anchor: { x: s.anchor.x, y: s.anchor.y, z: s.anchor.z },
          visible: s.points.visible,
          pointPx: s.smokePointPx ?? null,
        })),
      },
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
      /** t106：Bloom 权威读数（内景按 INTERIOR_BLOOM_STRENGTH_SCALE 缩放，外景逐位等同预设） */
      bloom: {
        preset: applied.bloom?.preset ?? currentPreset,
        baseStrength: applied.bloom?.baseStrength ?? null,
        effectiveStrength: applied.bloom?.effectiveStrength ?? null,
        interiorBlend: applied.bloom?.interiorBlend ?? 0,
        shrink: applied.bloom?.shrink ?? 1,
        interiorStrengthScale: applied.bloom?.scale ?? INTERIOR_BLOOM_STRENGTH_SCALE,
        interiorTier: applied.bloom?.tier ?? 'large',
        interiorArea: applied.bloom?.area ?? null,
        /** t120：分档表（小房间更紧；大空间 = t106 冻结值） */
        tiers: INTERIOR_BLOOM_TIERS.map((t) => ({ tag: t.tag, maxArea: t.maxArea, scale: t.scale })),
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
    rankLampCandidates,
    /** t5：带滞回的入选选择器 + 生效裕量（与 `updateLampSelection` 共用同一实现，避免"代理断言"） */
    selectLampPool,
    LAMP_HYSTERESIS_MARGIN,
    LAMP_FADE_SECONDS,
    LAMP_FADE_RESUME_SECONDS,
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
    /**
     * t5：**逐灯位直接读数**（只读诊断；不改变选择、预算与渲染）。
     * 每项 `{ index, anchorId, visible, intensity, baseIntensity, fade, target, position }`：
     *   · `index` = 真机 PointLight 槽位序号；`anchorId` = 该槽位当前绑定的灯位 id（完全熄灭后为 null）；
     *   · `intensity = baseIntensity × fade × flicker`；`baseIntensity` = 本帧真实目标基准强度；
     *   · `fade` = 进/出池斜坡位置（1 = 稳态），`target` = 1 表示该灯位在池内。
     * 动机：镜头旋转引发的灯位重选只能通过"槽位绑定 + 逐帧强度序列"取证（`describe().lamps.pool` 只有排名，没有槽位与强度）。
     */
    /** t42：**当前灯位表**（只读副本；分区静态选择的口径证明与守卫取证用，不参与任何判定）。 */
    lampAnchors: () => lampState.anchors.map((a) => ({ id: a.id, zone: a.zone ?? null, role: a.role ?? null, position: { ...a.position } })),
    /** t42：分区静态**配额分配**（纯函数读数，供报告/守卫逐值核对）。 */
    lampQuotas: (budget, focus) => zoneQuota(budget ?? (realtimeLights.length || LIGHTING.lamps.maxRealtimePointLights), focus ?? null),
    /**
     * t42：**运行时切换灯池选择架构**（诊断/对照用；产品默认取 `LIGHTING.lamps.selectionMode`）。
     * `'zone-static'`（默认）与 `'dynamic'`（t5 旧路径）都能跑，便于守卫/探针在同一棵树上做 A/B 与突变对照。
     */
    setLampSelectionMode: (mode) => {
      lampSelectionMode = mode === 'dynamic' ? 'dynamic' : 'zone-static';
      lampState.lastReselect = -Infinity;
      lampState.snapFade = true;
      return lampSelectionMode;
    },
    /** t42：当前生效的选择架构。 */
    lampSelectionMode: () => lampSelectionMode,
    /** t42：相机 → 分区（`layout.ZONES` 边界，内区优先，F 外环最后）。 */
    lampZoneAt: (focus) => zoneOfCamera(focus),
    lampSlots: () =>
      realtimeLights.map((light, index) => ({
        index,
        anchorId: light.userData?.lampAnchorId ?? null,
        visible: light.visible,
        intensity: light.intensity,
        /** t5：本帧限速后的**当前**满强度；`intensity = baseIntensity × fade × flicker` */
        baseIntensity: light.userData?.lampBase ?? null,
        /** t5：目标满强度（限速逼近它） */
        baseTarget: light.userData?.lampBaseTarget ?? null,
        /** t5：进/出池斜坡位置（1 = 稳态；0 = 已熄灭）；`target` = 池内为 1 */
        fade: light.userData?.fade ?? null,
        target: light.userData?.lampTarget ?? null,
        position: { x: light.position.x, y: light.position.y, z: light.position.z },
      })),
  };
}

export default createEnvironment;
