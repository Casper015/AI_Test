/**
 * 唯一渲染系统（计划 §8.3：全场只有一个 renderer / 一个 composer / 一个 render 调用点）。
 *
 * - `WebGLRenderer`：唯一实例，色彩空间 `srgb`、色调映射 ACESFilmic（数值取自 config.LIGHTING.toneMapping）；
 * - `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass`（three r169 addons，本地 vendored）；
 * - Bloom **克制**：强度/半径/阈值全部来自当前时辰预设（config.LIGHTING.presets.*.bloom），
 *   内部缓冲分辨率受 `config.LIGHTING.atmosphere.bloomMaxResolution` 限制；低质量档关闭后处理；
 * - resize 有 120ms 去抖（config.RENDERER.resizeDebounceMs），DPR 受质量档与 `RENDERER.maxPixelRatio` 限制。
 *
 * 本文件是**唯一**允许创建 WebGLRenderer 与 EffectComposer 的地方
 * （`tests/core.test.mjs` 会静态扫描全仓源码断言这一点）。
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG, RENDERER } from '../shared/config.js';

const TONE_MAPPING = Object.freeze({
  ACESFilmic: THREE.ACESFilmicToneMapping,
  ACESFilmicToneMapping: THREE.ACESFilmicToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  NoToneMapping: THREE.NoToneMapping,
});

const FRAME_WINDOW = 900;

/**
 * 像素比率解析（纯函数，可被 Node 侧测试直接断言）。
 *
 * 健壮性要求（t21 修复）：外部查询参数 `?dpr=` 可能给出 NaN/Infinity/负数/非数字字符串
 * （`Number('abc') === NaN`）。旧实现 `Math.min(max, Math.max(0.5, NaN)) === NaN` → `setPixelRatio(NaN)`
 * → 画布尺寸/像素比率进入非法状态。现在对非法输入**回落到该质量档的 dpr**，并只警告一次。
 *
 * @param {number|string|null|undefined} wanted 期望比率（覆盖值）
 * @param {{ config: object, tier: string }} options
 * @returns {{ ratio: number, fallback: boolean, reason: string|null }}
 */
export function resolvePixelRatio(wanted, { config, tier } = {}) {
  const q = config?.QUALITY?.tiers?.[tier] ?? { dpr: 1 };
  const max = config?.RENDERER?.maxPixelRatio ?? 2;
  const min = 0.5;
  let value = null;
  let reason = null;
  if (wanted === null || wanted === undefined) {
    reason = 'null';
  } else if (typeof wanted === 'string' && wanted.trim() === '') {
    reason = 'empty-string';
  } else {
    const numeric = typeof wanted === 'number' ? wanted : Number(wanted);
    if (!Number.isFinite(numeric)) reason = Number.isNaN(numeric) ? 'NaN' : 'non-finite';
    else if (numeric <= 0) reason = 'non-positive';
    else value = numeric;
  }
  const fallback = value === null;
  const base = fallback ? q.dpr : value;
  const ratio = Math.min(max, Math.max(min, base));
  return { ratio, fallback, reason: fallback ? `dpr=${JSON.stringify(wanted)}（${reason}）` : null };
}

/**
 * @param {{
 *   container: HTMLElement, events?: object, config?: object, quality?: string,
 *   width?: number, height?: number, dpr?: number|null, bloom?: boolean|null
 * }} options
 */
/* ------------------------------------------------------------------ *
 * t56：纯函数 PNG 编码器（零依赖、零 DOM）
 *
 * 证书式「同一次页面加载内取图」的实现基础：把掩码 RT 的像素直接编码成 PNG（base64），
 * 工具即可用**已有的 --dump-dom** 取回与位姿同源的掩码，不需要第二次页面加载
 * （t55 的坑②根因：跨页面加载去截 `&mask=sky` 会拿到空白/半帧）。
 * 只输出 8-bit RGB、逐行 filter=0、deflate 用 **stored（未压缩）块** —— 保证：
 *   · 确定性（同一像素 → 同一字节）· 无 zlib 依赖 · Node 内可直接单测。
 * ------------------------------------------------------------------ */
const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function pngCrc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = PNG_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngAdler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** 把 zlib 流（含 2 字节头 + adler32 尾）写成 store-only deflate 块。 */
function zlibStore(raw) {
  const blocks = [];
  const maxBlock = 65535;
  for (let offset = 0; offset < raw.length || offset === 0; offset += maxBlock) {
    const chunk = raw.subarray(offset, Math.min(offset + maxBlock, raw.length));
    const last = offset + maxBlock >= raw.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = last; // BFINAL + BTYPE=00(stored)
    header[1] = chunk.length & 0xff;
    header[2] = (chunk.length >>> 8) & 0xff;
    header[3] = ~chunk.length & 0xff;
    header[4] = (~chunk.length >>> 8) & 0xff;
    blocks.push(header, chunk);
    if (last) break;
  }
  const out = new Uint8Array(2 + blocks.reduce((sum, b) => sum + b.length, 0) + 4);
  out[0] = 0x78; // CMF: deflate, 32K window
  out[1] = 0x01; // FLG: 无字典、最快（校验和合法）
  let pos = 2;
  for (const b of blocks) {
    out.set(b, pos);
    pos += b.length;
  }
  const adler = pngAdler32(raw);
  out[pos] = (adler >>> 24) & 0xff;
  out[pos + 1] = (adler >>> 16) & 0xff;
  out[pos + 2] = (adler >>> 8) & 0xff;
  out[pos + 3] = adler & 0xff;
  return out;
}

/**
 * 把 RGBA 像素编码成 8-bit RGB PNG（返回 base64 字符串，不含 data: 前缀）。
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba 长度 = width*height*4
 * @returns {string} base64
 */
export function encodePngBase64(width, height, rgba) {
  const stride = width * 3;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const dst = y * (stride + 1);
    raw[dst] = 0; // filter: None
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const d = dst + 1 + x * 3;
      raw[d] = rgba[src];
      raw[d + 1] = rgba[src + 1];
      raw[d + 2] = rgba[src + 2];
    }
  }
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcInput = out.subarray(4, 8 + data.length);
    view.setUint32(8 + data.length, pngCrc32(crcInput));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStore(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, b) => sum + b.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  let binary = '';
  for (let i = 0; i < png.length; i += 1) binary += String.fromCharCode(png[i]);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(png).toString('base64');
}


export function createRenderSystem({
  container,
  events = null,
  config = CONFIG,
  quality = config.QUALITY.default,
  width = config.BUDGET.viewport.width,
  height = config.BUDGET.viewport.height,
  dpr = null,
  bloom = null,
} = {}) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('createRenderSystem 需要一个 DOM 容器（#app）；Node 环境请使用 scripts/audit.mjs 做统计');
  }

  const canvas = document.createElement('canvas');
  canvas.id = 'palace-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '紫禁天朝三维宫城');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: config.RENDERER.antialias,
    powerPreference: config.RENDERER.powerPreference,
    alpha: config.RENDERER.alpha,
    logarithmicDepthBuffer: config.RENDERER.logarithmicDepthBuffer,
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[config.LIGHTING.toneMapping.mode] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = config.LIGHTING.toneMapping.exposure;
  renderer.shadowMap.enabled = config.LIGHTING.shadows.enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.debug.checkShaderErrors = true;
  renderer.setClearColor(0x0e1420, 1);
  renderer.info.autoReset = false;
  container.appendChild(canvas);

  const size = { width: Math.max(1, width), height: Math.max(1, height) };
  let tier = quality;
  let dprOverride = dpr;
  let bloomEnabled = bloom ?? config.QUALITY.tiers[tier].bloom;
  let bloomParams = { ...config.LIGHTING.presets[config.STATE_DEFAULTS.timePreset].bloom };
  let exposure = config.LIGHTING.toneMapping.exposure;
  let scene = null;
  let camera = null;

  const frameTimes = [];
  let frameCount = 0;
  let startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let dprWarned = false;

  /**
   * 生效的像素比率：非法覆盖值（NaN/Infinity/负数/非数字串）回落到质量档 dpr 并 warn 一次，
   * 合法值行为与修复前完全一致（仍受 `RENDERER.maxPixelRatio` 与下限 0.5 夹取）。
   */
  function effectiveDpr() {
    const q = config.QUALITY.tiers[tier];
    const resolved = resolvePixelRatio(dprOverride, { config, tier });
    if (resolved.fallback && dprOverride !== null && dprOverride !== undefined && !dprWarned) {
      dprWarned = true;
      console.warn(
        `[renderer] 忽略非法 ${resolved.reason}（需要有限正数）→ 回落质量档 ${tier} 的 dpr=${q.dpr}；` +
          '画布像素比率保持有限正值。',
      );
    }
    return resolved.ratio;
  }

  function applySize() {
    const ratio = effectiveDpr();
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.width, size.height, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    if (composer) {
      composer.setPixelRatio?.(ratio);
      composer.setSize(size.width, size.height);
    }
    if (bloomPass) {
      const cap = Math.max(64, config.LIGHTING.atmosphere.bloomMaxResolution * 2);
      // UnrealBloomPass 内部再降采样，这里给"半分辨率 + 上限"，避免全屏大缓冲
      bloomPass.setSize(Math.min(size.width, cap * 2) / 2, Math.min(size.height, cap * 2) / 2);
    }
    return { width: size.width, height: size.height, dpr: ratio };
  }

  /* ------------------------------ 后处理链 ------------------------------ */
  const renderPass = new RenderPass(null, null);
  // 未 attach scene/camera 前禁用（EffectComposer 会跳过 disabled pass），attach 后立即启用
  renderPass.enabled = false;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(64, Math.min(width, 1024) / 2), Math.max(64, Math.min(height, 1024) / 2)),
    bloomParams.strength,
    bloomParams.radius,
    bloomParams.threshold,
  );
  bloomPass.name = 'palace-bloom';
  const outputPass = new OutputPass();
  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  applySize();

  function attach(sceneRef, cameraRef) {
    if (!sceneRef || !cameraRef) throw new Error('renderSystem.attach 需要 scene 与 camera');
    scene = sceneRef;
    camera = cameraRef;
    renderPass.scene = sceneRef;
    renderPass.camera = cameraRef;
    renderPass.enabled = true;
    return { scene: true, camera: true };
  }

  function setBloom(params = {}, enabled = undefined) {
    if (params.strength !== undefined) bloomParams.strength = params.strength;
    if (params.radius !== undefined) bloomParams.radius = params.radius;
    if (params.threshold !== undefined) bloomParams.threshold = params.threshold;
    bloomPass.strength = bloomParams.strength;
    bloomPass.radius = bloomParams.radius;
    bloomPass.threshold = bloomParams.threshold;
    if (enabled !== undefined && enabled !== null) bloomEnabled = enabled && config.QUALITY.tiers[tier].bloom;
    return { ...bloomParams, enabled: bloomEnabled };
  }

  function setExposure(value) {
    exposure = value;
    renderer.toneMappingExposure = value;
    return exposure;
  }

  function setQuality(next) {
    const q = config.QUALITY.tiers[next];
    if (!q) throw new Error(`setQuality: 未知质量档 "${next}"`);
    tier = next;
    bloomEnabled = q.bloom;
    renderer.shadowMap.enabled = q.shadowEnabled && config.LIGHTING.shadows.enabled;
    applySize();
    return {
      tier,
      dpr: effectiveDpr(),
      shadowMapSize: q.shadowMapSize,
      bloom: bloomEnabled,
      maxRealtimeLights: q.maxRealtimeLights,
    };
  }

  function setSize(nextWidth, nextHeight, options = {}) {
    size.width = Math.max(1, Math.round(nextWidth));
    size.height = Math.max(1, Math.round(nextHeight));
    if (options.dpr !== undefined) dprOverride = options.dpr;
    return applySize();
  }

  function render(sceneRef = scene, cameraRef = camera) {
    if (!sceneRef || !cameraRef) throw new Error('renderSystem.render 需要 scene 与 camera（由 main.js 唯一装配）');
    renderer.info.reset();
    if (bloomEnabled) composer.render();
    else renderer.render(sceneRef, cameraRef);
    frameCount += 1;
    return renderer.info;
  }

  /** 记录帧时长（主循环每帧调用一次；用于 avgFps / p95FrameMs 实测）。 */
  function recordFrame(frameMs) {
    frameTimes.push(frameMs);
    if (frameTimes.length > FRAME_WINDOW) frameTimes.shift();
    return frameTimes.length;
  }

  /**
   * 权威背景口径（t45）：渲染侧**确切知道** `scene.background` / `scene.fog` 是什么，
   * 因此把它只读上报给工具，替代"用像素猜天空"（t39/t41/t44 三次口径争议的根治）。
   * **只读查询：不修改任何渲染状态。**
   *
   * 口径：`hex`/`srgb255` = 显示参考空间（sRGB）的实际像素值；`linear` = three 线性工作空间分量；
   * 清屏色（scene.background）**不受**曝光与色调映射影响；雾按深度插值、可完全覆盖背景（见 fog.note）。
   */
  /**
   * 渲染输出链的**纯函数**复算（t48）：给定线性工作空间颜色，返回它经当前管线后的落屏 sRGB 值。
   *
   * 与 three 的着色器实现逐式一致（ACESFilmic / Reinhard / Cineon / Neutral / Linear）：
   *   · ACES：`color *= toneMappingExposure / 0.6` → ACESInputMat → RRTAndODTFit → ACESOutputMat → saturate
   *   · 末级 sRGB OETF：`x<=0.0031308 ? 12.92x : 1.055·x^(1/2.4)−0.055`（three `sRGBTransferOETF`，指数写作 0.41666）
   * 用途：让"配置值 vs 落屏值"的差异**可复算、可复核**，而不是靠猜。
   *
   * @param {{r:number,g:number,b:number}} linear 线性工作空间分量（`THREE.Color` 的 r/g/b）
   * @param {{toneMapping?:string, exposure?:number}} [options]
   * @returns {{r:number,g:number,b:number}} 0–1 的 sRGB 显示参考分量
   */
  function applyOutputChain(linear, { toneMapping = config.LIGHTING.toneMapping.mode, exposure = renderer?.toneMappingExposure ?? config.LIGHTING.toneMapping.exposure } = {}) {
    const clamp = (x) => Math.min(1, Math.max(0, x));
    const rgb = [linear.r, linear.g, linear.b];
    let c = rgb.slice();
    if (toneMapping === 'Linear') {
      c = c.map((x) => clamp(x * exposure));
    } else if (toneMapping === 'Reinhard') {
      c = c.map((x) => clamp((x * exposure) / (1 + x * exposure)));
    } else if (toneMapping === 'Cineon') {
      c = c.map((x) => {
        const v = Math.max(0, x * exposure - 0.004);
        return clamp(Math.pow((v * (6.2 * v + 0.5)) / (v * (6.2 * v + 1.7) + 0.06), 2.2));
      });
    } else if (toneMapping === 'Neutral') {
      c = c.map((x) => clamp(x * exposure));
    } else if (toneMapping === 'ACESFilmic' || !toneMapping) {
      const k = exposure / 0.6;
      const v = c.map((x) => x * k);
      const IN = [
        [0.59719, 0.35458, 0.04823],
        [0.076, 0.90834, 0.01566],
        [0.0284, 0.13383, 0.83777],
      ];
      const OUT = [
        [1.60475, -0.53108, -0.07367],
        [-0.10208, 1.10813, -0.00605],
        [-0.00327, -0.07276, 1.07602],
      ];
      const mul = (m, x) => m.map((row) => row[0] * x[0] + row[1] * x[1] + row[2] * x[2]);
      const rrt = (x) => x.map((e) => (e * (e + 0.0245786) - 0.000090537) / (e * (0.983729 * e + 0.432951) + 0.238081));
      c = mul(OUT, rrt(mul(IN, v))).map(clamp);
    }
    // sRGB OETF
    return {
      r: clamp(c[0] <= 0.0031308 ? c[0] * 12.92 : Math.pow(c[0], 0.41666) * 1.055 - 0.055),
      g: clamp(c[1] <= 0.0031308 ? c[1] * 12.92 : Math.pow(c[1], 0.41666) * 1.055 - 0.055),
      b: clamp(c[2] <= 0.0031308 ? c[2] * 12.92 : Math.pow(c[2], 0.41666) * 1.055 - 0.055),
    };
  }

  /** 输出链口径（t48）：供报告说明"配置值经管线后会变成什么"。 */
  function describeOutputChain() {
    return {
      pass: 'RenderPass → UnrealBloomPass → OutputPass（composer）',
      toneMapping: config.LIGHTING.toneMapping.mode,
      exposure: renderer?.toneMappingExposure ?? config.LIGHTING.toneMapping.exposure,
      outputColorSpace: config.LIGHTING.toneMapping.outputColorSpace,
      bloom: bloomEnabled,
      note: 'OutputPass 对最终 RT 施加色调映射 + 输出色彩空间转换；材质 `toneMapped:false` 的物体在材质着色器里已跳过色调映射',
    };
  }

  /* ------------------------------------------------------------------ *
   * t50：真天空掩码（终结"用像素猜天空"）
   *
   * 为什么需要它：夜空（#0d1526..#1b2333）、雾洗白几何与暗城市在 8-bit 像素里可能同色，
   * 任何"颜色相似度"判据都会把大片暗城市/雾当成天空（t39→t41→t44→t46/t48/t49→本轮 F2 第五次发作）。
   * 本模块直接给出**几何意义**上的真天空掩码：两遍渲染 +
   *   ① 全场景以纯黑遮罩材质渲染（写入深度，任何几何都遮住天空）
   *   ② 只画白色天空球（depthTest 生效 ⇒ 仅在无几何遮挡处落白）
   * 结果只含两种颜色（白=天空、黑=其它）⇒ 工具从一张 PNG 得到二值掩码，无需任何颜色阈值。
   * **只读诊断**：正常路径（未启用掩码）不变；掩码渲染后立刻恢复 overrideMaterial/autoClear/清屏色。
   * ------------------------------------------------------------------ */
  /** 掩码专用图层（隔离渲染用；不改动场景图结构，也不需要第二个 Scene/相机） */
  const SKY_MASK_LAYER = 30;
  const skyMask = {
    configured: false,
    source: null,
    mesh: null,
    black: null,
    white: null,
    share: null,
    shareAt: 0,
    frames: 0,
    size: { width: 720, height: 450 }, // 半分辨率（保持画布宽高比）：细长遮挡物在更低分辨率下会塌缩、导致天空占比虚高
    rt: null,
    poseKey: null,
    quad: null,
    quadMaterial: null,
    pngBase64: null,
    pngKey: null,
    pngSize: null,
    pngShareByColor: null,
    probe: null,
    skyFromProbe: null,
    skyAtProbe: null,
    polarityConsistent: null,
    note: '白=天空网格、黑=其余（几何遮挡计入黑）；由两遍渲染得到，不含颜色阈值',
  };

  /**
   * 配置掩码源（主程序把 environment 的天空网格交进来）。
   *
   * 设计约束（守 "唯一渲染内核" 静态守卫）：**不新建 Scene、不新建相机、不自行 scene.add**
   *   · 隔离渲染靠**相机图层**：白色天空网格放在 `SKY_MASK_LAYER=30`，第二遍只让相机看见该图层；
   *   · 网格由调用方（src/main.js，唯一允许 scene.add 的地方）挂进主场景，平时 `visible=false`。
   * @returns {{ ok: boolean, size?: object, mesh?: object, reason?: string }}
   */
  function configureSkyMask({ sky = null } = {}) {
    if (!sky || !sky.isMesh) return { ok: false, reason: '需要天空网格（THREE.Mesh）' };
    skyMask.source = sky;
    skyMask.black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: false, depthWrite: true, depthTest: true });
    skyMask.black.name = 'sky-mask-black';
    skyMask.white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false, depthWrite: false, depthTest: true, side: THREE.BackSide });
    skyMask.white.name = 'sky-mask-white';
    skyMask.mesh = new THREE.Mesh(sky.geometry, skyMask.white);
    skyMask.mesh.name = 'sky-mask-white-mesh';
    skyMask.mesh.frustumCulled = false;
    skyMask.mesh.matrixAutoUpdate = false;
    skyMask.mesh.matrixWorldAutoUpdate = false;
    skyMask.mesh.visible = false; // 常规路径完全不参与渲染；仅掩码期间临时可见
    skyMask.mesh.layers.set(SKY_MASK_LAYER);
    // t53：画布掩码用**一次 blit**写出（见 renderSkyMaskFrame），彻底消除"两遍画布渲染被截到半帧"的撕裂/极性翻转
    skyMask.quadMaterial = new THREE.MeshBasicMaterial({ map: null, toneMapped: false, fog: false, depthTest: false, depthWrite: false });
    skyMask.quadMaterial.name = 'sky-mask-quad-material';
    skyMask.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMask.quadMaterial);
    skyMask.quad.name = 'sky-mask-quad';
    skyMask.quad.frustumCulled = false;
    skyMask.quad.visible = false;
    skyMask.quad.renderOrder = 1e6;
    skyMask.quad.layers.set(SKY_MASK_LAYER);
    skyMask.configured = true;
    return { ok: true, size: { ...skyMask.size }, mesh: skyMask.mesh, quad: skyMask.quad, layer: SKY_MASK_LAYER };
  }

  /** 同步天空网格的世界矩阵（天空在原点，通常为恒等）。 */
  function syncSkyMaskMatrix() {
    if (!skyMask.mesh || !skyMask.source) return;
    skyMask.source.updateMatrixWorld(true);
    skyMask.mesh.matrix.copy(skyMask.source.matrixWorld);
    skyMask.mesh.matrixWorld.copy(skyMask.source.matrixWorld);
  }

  /** 两遍掩码渲染（渲染到当前 target；调用方负责 target/清屏色）。 */
  function applySkyMaskPasses(cameraRef, { target = null } = {}) {
    if (!skyMask.configured) return false;
    const targetScene = renderPass.scene ?? scene;
    const camera = cameraRef ?? renderPass.camera;
    if (!targetScene || !camera) return false;
    const prevOverride = targetScene.overrideMaterial;
    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevTarget = renderer.getRenderTarget();
    if (target !== null || prevTarget !== null) renderer.setRenderTarget(target);
    const prevLayers = camera.layers.mask;
    // 关键：`scene.background` 是 Color 时，three 每次 render 都会**强制清屏**成该色（无视 autoClear），
    // 会把白色掩码天空擦掉 ⇒ 掩码期间临时置 null（渲染后恢复；不改任何配色定义）
    const prevBackground = targetScene.background;
    targetScene.background = null;
    renderer.setClearColor(0x000000, 1);
    // ① 先铺白天空：只让相机看见掩码图层（白、BackSide、depthWrite:false）⇒ 可见天空处落白，不写深度
    syncSkyMaskMatrix();
    skyMask.mesh.visible = true;
    camera.layers.set(SKY_MASK_LAYER);
    renderer.autoClear = true;
    renderer.render(targetScene, camera);
    // ② 再把几何盖成纯黑：overrideMaterial 让所有物体变黑（保留各自深度自洽）⇒ 白/黑由**绘制顺序**决定，
    //    不依赖"天空球是否比几何更远"这类隐含假设，结果稳定且可预期
    camera.layers.mask = prevLayers;
    targetScene.overrideMaterial = skyMask.black;
    // 关键：真实天空球在场景里（layer 0），第二遍会被 overrideMaterial 涂黑、正好盖掉白色掩码天空 ⇒ 临时隐藏它
    const prevSkyVisible = skyMask.source ? skyMask.source.visible : null;
    if (skyMask.source) skyMask.source.visible = false;
    renderer.autoClear = false;
    renderer.render(targetScene, camera);
    if (skyMask.source) skyMask.source.visible = prevSkyVisible;
    targetScene.overrideMaterial = prevOverride;
    skyMask.mesh.visible = false;
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevClear, prevAlpha);
    targetScene.background = prevBackground;
    if (target !== null || prevTarget !== null) renderer.setRenderTarget(prevTarget);
    skyMask.frames += 1;
    return true;
  }

  /**
   * 把掩码渲染到画布（`?mask=sky` 的可见输出：白=天空、黑=其余）。
   *
   * 直接渲到画布（不做 blit：那会引入第二个 Scene + 一台正交相机，违反"唯一渲染内核"静态守卫）。
   * 画布上的掩码为纯白/纯黑 + MSAA 边缘过渡；工具按 `r > 127` 阈值化即得**二值真天空掩码**
   * （实测纯色像素占比 ≥99%）；需要"无边缘灰"的精确占比时用 `?stats=1` 的 `skyShare`（离屏 RT，无 MSAA）。
   */
  function renderSkyMaskFrame(cameraRef, { withShare = false } = {}) {
    if (!skyMask.configured) return false;
    const camera = cameraRef ?? renderPass.camera;
    const targetScene = renderPass.scene ?? scene;
    if (!camera || !targetScene) return false;
    const { width, height } = skyMask.size;
    if (!skyMask.rt) {
      skyMask.rt = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
      skyMask.rt.texture.name = 'sky-mask-rt';
      skyMask.rt.texture.minFilter = THREE.NearestFilter;
      skyMask.rt.texture.magFilter = THREE.NearestFilter;
      skyMask.rt.texture.generateMipmaps = false;
      skyMask.quadMaterial.map = skyMask.rt.texture;
    }
    // ① 掩码渲进无 MSAA 的离屏 RT（唯一的掩码 pass，唯一真相源）
    if (!applySkyMaskPasses(camera, { target: skyMask.rt })) return false;
    if (withShare) readSkyMaskShare();
    // ② 画布只写**一次**：把 RT 贴到一个正对相机的四边形上（沿用同一相机与图层隔离，不新建 Scene/相机）
    //    ⇒ 截图不可能截到"两遍之间"的半帧（这曾导致掩码极性在部分运行里翻转）
    const dist = Math.max(camera.near * 2, 0.5);
    const h = 2 * Math.tan(((camera.fov ?? 45) * Math.PI) / 360) * dist;
    const w = h * (camera.aspect ?? 1);
    skyMask.quad.scale.set(w, h, 1);
    skyMask.quad.quaternion.copy(camera.quaternion);
    skyMask.quad.position.copy(camera.position).addScaledVector(
      new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion),
      dist,
    );
    skyMask.quad.updateMatrixWorld(true);
    const prevLayers = camera.layers.mask;
    const prevBackground = targetScene.background;
    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    targetScene.background = null;
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = true;
    skyMask.quad.visible = true;
    camera.layers.set(SKY_MASK_LAYER);
    renderer.render(targetScene, camera);
    camera.layers.mask = prevLayers;
    skyMask.quad.visible = false;
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevClear, prevAlpha);
    targetScene.background = prevBackground;
    skyMask.frames += 1;
    return true;
  }

  /**
   * 计算天空的屏幕占比（0–1）：两遍掩码渲染到小尺寸离屏 RT 后读回统计。
   * 仅诊断使用（`?stats=1` 节流调用 / `__PALACE__.skyMask.share()`）；不改变正常渲染路径。
   */
  /** 从已渲染的掩码 RT 读取 share 与极性 probe（只读，不渲染）。 */
  function readSkyMaskShare() {
    const { width, height } = skyMask.size;
    if (!skyMask.rt) return null;
    const buffer = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(skyMask.rt, 0, 0, width, height, buffer);
    skyMask.lastPixels = buffer; // t56：同一次取图的像素快照（供 data URL 编码，保证与 share 同源）
    let white = 0;
    for (let i = 0; i < buffer.length; i += 4) if (buffer[i] > 127) white += 1;
    skyMask.share = +(white / (width * height)).toFixed(5);
    skyMask.shareAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const sampleAt = (x, yFromTop) => {
      const y = height - 1 - Math.min(height - 1, Math.max(0, yFromTop));
      const i = (y * width + Math.min(width - 1, Math.max(0, x))) * 4;
      const v = buffer[i];
      return v > 200 ? 'white' : v < 55 ? 'black' : `mixed(${v})`;
    };
    skyMask.probe = {
      topCenter: sampleAt(Math.floor(width / 2), 2),
      topLeft: sampleAt(4, 2),
      centerLeft: sampleAt(4, Math.floor(height / 2)),
      bottomCenter: sampleAt(Math.floor(width / 2), height - 3),
    };
    skyMask.skyAtProbe =
      skyMask.probe.topCenter === 'white' ? 'white' : skyMask.probe.topCenter === 'black' ? 'black' : 'unknown';
    skyMask.skyFromProbe = skyMask.skyAtProbe;
    // 极性自证：probe 取到确定颜色即视为"可判定"（**不等于**"顶中部一定是天空"——
    // 内景/俯视地面等无天空视角，顶中部本来就不是天空，此时应改用 skyShare 与 shareByColor 互校）
    skyMask.polarityConsistent = skyMask.skyAtProbe !== 'unknown';
    return skyMask.share;
  }

  /**
   * t56：把最近一次掩码取图编码成 PNG base64（**同一次加载内取图**，与 skyShare 同源）。
   * 默认按 1/2 分辨率（360×225，最近邻抽样）编码：720×450 全分辨率 base64 约 1.3MB，
   * 会把 `?stats=1` 的 `<pre>` 撑到 MB 级；1/2 分辨率约 0.3MB、占比误差 <0.5pp（仍严格二值）。
   * 只在位姿键变化时重编码（缓存），不影响渲染路径。
   * @returns {{ base64: string, width: number, height: number, shareByColor: {white:number, black:number}, sourceSize: string, scale: number }}
   */
  function skyMaskPng({ scale = 2 } = {}) {
    if (!skyMask.configured || !skyMask.lastPixels) return null;
    const key = `${skyMask.poseKey}|${scale}|${skyMask.share}`;
    if (skyMask.pngBase64 && skyMask.pngKey === key) return skyMask.pngResult;
    const { width, height } = skyMask.size;
    const w = Math.max(1, Math.round(width / scale));
    const h = Math.max(1, Math.round(height / scale));
    const rgba = new Uint8Array(w * h * 4);
    let white = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(width - 1, x * scale);
        const sy = Math.min(height - 1, y * scale);
        const src = (sy * width + sx) * 4;
        const dst = (y * w + x) * 4;
        const v = skyMask.lastPixels[src] > 127 ? 255 : 0; // 最近邻二值化（不插值 ⇒ 仍只有两种颜色）
        rgba[dst] = v;
        rgba[dst + 1] = v;
        rgba[dst + 2] = v;
        rgba[dst + 3] = 255;
        if (v === 255) white += 1;
      }
    }
    const base64 = encodePngBase64(w, h, rgba);
    skyMask.pngBase64 = base64;
    skyMask.pngKey = key;
    skyMask.pngResult = {
      base64,
      width: w,
      height: h,
      shareByColor: { white: +(white / (w * h)).toFixed(5), black: +(1 - white / (w * h)).toFixed(5) },
      sourceSize: `${width}x${height}`,
      scale,
    };
    return skyMask.pngResult;
  }

  function computeSkyShare(cameraRef, { force = false, throttleMs = 500 } = {}) {
    if (!skyMask.configured) return null;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // 位姿键：相机位置/朝向（或投影）一变就重算 —— 保证"换视角同步变化"，不返回过期缓存
    const camera = cameraRef ?? renderPass.camera;
    const poseKey = camera?.matrixWorld
      ? `${camera.matrixWorld.elements.map((v) => v.toFixed(2)).join(',')}|${camera.projectionMatrix.elements[0].toFixed(4)}`
      : 'none';
    if (!force && skyMask.share !== null && skyMask.poseKey === poseKey && now - skyMask.shareAt < throttleMs) return skyMask.share;
    const { width, height } = skyMask.size;
    if (!skyMask.rt) {
      skyMask.rt = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
      skyMask.rt.texture.name = 'sky-mask-rt';
    }
    const ok = applySkyMaskPasses(cameraRef, { target: skyMask.rt });
    if (ok) readSkyMaskShare();
    return skyMask.share;
  }

  /** 掩码口径（供报告与工具消费）。 */
  function skyMaskInfo() {
    return {
      configured: skyMask.configured,
      mode: 'two-pass(white-sky layer pass → black geometry override pass；绘制顺序决定黑白)',
      colors: { sky: '#ffffff', other: '#000000' },
      /** t53：极性口径（禁止假定 white=sky；以 probe 与 share 为准） */
      polarity: {
        skyColor: '#ffffff',
        otherColor: '#000000',
        probe: skyMask.probe,
        skyFromProbe: skyMask.skyFromProbe,
        skyAtProbe: skyMask.skyAtProbe,
        consistent: skyMask.polarityConsistent,
        shareByColor: skyMask.share === null ? null : { white: skyMask.share, black: +(1 - skyMask.share).toFixed(5) },
        rule:
          '天空色由 probe（顶中部）判定：俯瞰/等轴/第一人称视角 topCenter 恒为天空 ⇒ 该点颜色即天空色；' +
          '无天空视角（内景/俯视地面）topCenter 为 otherColor ⇒ 此时用 skyShare 与 shareByColor 互校（哪种颜色的占比等于 skyShare，哪种就是天空色）。' +
          '禁止假定 white=sky。',
      },
      binary: true,
      binaryOutput: '画布掩码 = 纯白/纯黑 + MSAA 边缘（实测纯色占比 ≥99%，r>127 阈值化即二值）；精确占比取自无 MSAA 的离屏 RT',
      isolation: `camera.layers.set(${SKY_MASK_LAYER})（不新建 Scene/相机）`,
      source: skyMask.source ? skyMask.source.name ?? 'environment-sky' : null,
      share: skyMask.share,
      shareAt: skyMask.shareAt || null,
      sampleSize: `${skyMask.size.width}x${skyMask.size.height}`,
      frames: skyMask.frames,
      note: skyMask.note,
      caveat: '透明/粒子对象在掩码里按"遮挡"处理（保守，天空占比不会被高估）',
    };
  }

  function describeBackground() {
    const scene = renderPass.scene;
    const bg = scene?.background;
    const fog = scene?.fog;
    const hex255 = (hex) => {
      const clean = String(hex).replace('#', '');
      return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
    };
    const entry = (color) => {
      if (!color || typeof color.getHexString !== 'function') return { hex: null, srgb255: null, linear: null };
      const hex = `#${color.getHexString()}`;
      return { hex, srgb255: hex255(hex), linear: { r: +color.r.toFixed(6), g: +color.g.toFixed(6), b: +color.b.toFixed(6) } };
    };
    return {
      source: 'scene.background',
      backgroundType: bg && bg.isColor ? 'color' : bg ? bg.type ?? 'texture' : 'none',
      ...entry(bg && bg.isColor ? bg : null),
      toneMapped: false,
      outputColorSpace: config.LIGHTING.toneMapping.outputColorSpace,
      exposure: renderer?.toneMappingExposure ?? null,
      note: 'hex/srgb255 = 显示参考空间实际像素值；linear = 线性工作空间；清屏色不受曝光/色调映射影响',
      fog: fog
        ? {
            ...entry(fog.color),
            near: fog.near,
            far: fog.far,
            note: '雾按深度插值，可完全覆盖背景；与背景色不匹配时以雾色为准（t44）',
          }
        : null,
    };
  }

  function getStats() {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      /** 权威背景口径（t45，只读上报；供 ?stats=1 / 截图工具消费） */
      background: describeBackground(),
      /** t50：真天空掩码口径（白=天空/黑=其余，二值；share 由诊断节流计算） */
      skyMask: skyMaskInfo(),
      frames: frameCount,
      windowFrames: sorted.length,
      avgFrameMs: +avg.toFixed(2),
      avgFps: avg > 0 ? +(1000 / avg).toFixed(1) : 0,
      p95FrameMs: +p95.toFixed(2),
      uptimeSeconds: +((now - startedAt) / 1000).toFixed(1),
      mainScene: {
        drawCalls: renderer.info.render.calls,
        visibleTriangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
      },
      fullFrame: {
        drawCalls: renderer.info.render.calls,
        note: 'EffectComposer 的 pass 与阴影 pass 都计入 renderer.info.render.calls（§8.2 要求分开回报）',
      },
      memory: {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      quality: {
        tier,
        dpr: effectiveDpr(),
        bloom: bloomEnabled,
        toneMapping: renderer.toneMapping,
        exposure,
        outputColorSpace: renderer.outputColorSpace,
      },
      viewport: { width: size.width, height: size.height },
      resizes: resizeCount,
    };
  }

  /* ------------------------------ resize ------------------------------ */
  const disposers = [];
  let resizeTimer = null;
  let resizeCount = 0;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      const rect = container.getBoundingClientRect?.();
      if (rect && rect.width > 0) setSize(rect.width, rect.height);
      resizeCount += 1;
    }, config.RENDERER.resizeDebounceMs);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    disposers.push(() => observer.disconnect());
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
    disposers.push(() => window.removeEventListener('resize', onResize));
  }

  function dispose() {
    for (const d of disposers) d();
    disposers.length = 0;
    if (resizeTimer) clearTimeout(resizeTimer);
    composer.dispose?.();
    bloomPass.dispose?.();
    outputPass.dispose?.();
    renderPass.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove?.();
  }

  return {
    renderer,
    composer,
    canvas,
    bloomPass,
    renderPass,
    outputPass,
    attach,
    render,
    recordFrame,
    getStats,
    describeBackground,
    configureSkyMask,
    readSkyMaskShare,
    skyMaskPng,
    encodePngBase64,
    renderSkyMaskFrame,
    computeSkyShare,
    skyMaskInfo,
    describeOutputChain,
    applyOutputChain,
    setQuality,
    setSize,
    setExposure,
    setBloom,
    applySize,
    onResize,
    get quality() {
      return tier;
    },
    get dpr() {
      return effectiveDpr();
    },
    /** 诊断：像素比率的解析详情（dprOverride 是否被判定为非法） */
    dprInfo() {
      const resolved = resolvePixelRatio(dprOverride, { config, tier });
      return { ...resolved, override: dprOverride ?? null, tier };
    },
    get bloomEnabled() {
      return bloomEnabled;
    },
    size,
    dispose,
  };
}

export default createRenderSystem;
