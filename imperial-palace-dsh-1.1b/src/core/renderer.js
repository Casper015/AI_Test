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
