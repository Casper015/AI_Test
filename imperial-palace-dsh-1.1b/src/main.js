/**
 * 全项目唯一装配点（计划 §6.1/§8.3、CONTRACTS §2 文件归属）。
 *
 * 这里只做五件事，别处不许重复：
 *   1. 唯一的 `THREE.Scene` 与唯一场景根（`sceneRoot`），区域 root 以**单位变换**挂进来；
 *   2. 唯一的 renderer / composer（`src/core/renderer.js`）与唯一相机装置（`src/core/camera.js`）；
 *   3. 唯一的动画循环（`requestAnimationFrame`，dt + elapsed 传给各区域 update）；
 *   4. 区域装载编排：灰盒（G0）先上 → 真实区域逐个 validate + register（replace）→ 隐藏对应灰盒；
 *      失败**不静默**：`zone:failed` + 加载层可见错误 + 重试按钮；卸载只调区域自己的 `dispose()`；
 *   5. 测试查询参数：`?view=&preset=&ui=0&shot=1&stats=1&quality=&dpr=&greybox=0&focus=&zone=`
 *      （preset 同时接受 goldenHour/sunset/moonlitNight 与 golden/dusk/night 简写）。
 *
 * 浏览器自动化钩子：`window.__PALACE__`（state / registry / rig / renderSystem / zones / settle …）
 * 与 `window.__PALACE_READY__`（首帧渲染完成）——t13/t14 的截图与验收脚本只读消费。
 */

import * as THREE from 'three';
import { CONFIG, EVENTS } from './shared/config.js';
import * as LAYOUT from './shared/layout.js';
import { createEventBus } from './core/events.js';
import { createStateStore, createStateController } from './core/state.js';
import { createRegistry } from './core/registry.js';
import { createCameraRig } from './core/camera.js';
import { createEnvironment } from './core/environment.js';
import { createRenderSystem } from './core/renderer.js';
import { createLoader } from './core/loader.js';
import { createZoneContext, assertZoneResult, ZoneContractError } from './core/context.js';
import { zoneLayoutFor } from './core/layout-slice.js';

/* -------------------------------------------------------------------------- */
/*  查询参数                                                                    */
/* -------------------------------------------------------------------------- */

const PRESET_ALIASES = Object.freeze({
  golden: 'goldenHour',
  goldenHour: 'goldenHour',
  gold: 'goldenHour',
  sunset: 'sunset',
  dusk: 'sunset',
  night: 'moonlitNight',
  moonlitNight: 'moonlitNight',
  moon: 'moonlitNight',
});

export function parseQuery(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  const presetRaw = params.get('preset');
  return {
    view: params.get('view'),
    preset: presetRaw ? PRESET_ALIASES[presetRaw] ?? null : null,
    presetRaw,
    focus: params.get('focus'),
    zone: params.get('zone'),
    ui: params.get('ui') !== '0',
    shot: params.get('shot') === '1',
    stats: params.get('stats') === '1',
    quality: params.get('quality'),
    dpr: params.get('dpr') !== null ? Number(params.get('dpr')) : null,
    greybox: params.get('greybox') !== '0',
    /** 诊断用（不改 shared/）：?env=sun=2.0,ambient=0.8,hemi=0.65,exposure=1.35,lampIntensity=12,lampDistance=46 */
    envOverride: params.get('env'),
  };
}

/** 解析 ?env=... 诊断覆盖（只作用于本进程内的环境预设副本，绝不写回 shared/config.js）。 */
export function parseEnvOverride(text) {
  if (!text) return null;
  const out = {};
  for (const pair of text.split(',')) {
    const [key, rawValue] = pair.split('=').map((part) => part?.trim());
    const value = Number(rawValue);
    if (!key || !Number.isFinite(value)) continue;
    if (key === 'sun') out.sunIntensity = value;
    else if (key === 'ambient') out.ambientIntensity = value;
    else if (key === 'hemi') out.hemiIntensity = value;
    else if (key === 'exposure') out.exposure = value;
    else if (key === 'sunIntensity' || key === 'ambientIntensity' || key === 'hemiIntensity') out[key] = value;
    else if (key === 'lampIntensity' || key === 'lampDistance' || key === 'lampIntensityScale') out[key] = value;
    else if (key === 'fogNear' || key === 'fogFar') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/* -------------------------------------------------------------------------- */
/*  清单                                                                        */
/* -------------------------------------------------------------------------- */

const REAL_ZONE_SPECS = Object.freeze([
  { zone: 'B', url: './zones/forecourt.js', label: '前朝' },
  { zone: 'C', url: './zones/inner-palace.js', label: '后宫' },
  { zone: 'D', url: './zones/west-courts.js', label: '西宫苑' },
  { zone: 'E', url: './zones/east-courts.js', label: '东宫苑' },
  { zone: 'F', url: './zones/garden-boundary.js', label: '花园与边界' },
]);

const GREYBOX_URL = './zones/_greybox.js';
const KIT_URL = './kit/index.js';

/** 统计用：场景里可见的"可绘制对象"数量（主场景单次调用估算，与整帧 renderer.info 区分）。 */
export function countRenderables(root) {
  let count = 0;
  root.traverse((node) => {
    if (!node.visible) return;
    if (node.isMesh || node.isPoints || node.isLine || node.isSprite) count += 1;
  });
  return count;
}

export async function bootstrap() {
  const query = parseQuery();
  const container = document.getElementById('app') ?? document.body;
  const events = createEventBus({ onError: (error, info) => console.error(`[main] 事件 ${info.type} 处理失败：`, error) });
  const store = createStateStore({ events });
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  const log = (...args) => console.log('[palace]', ...args);

  /* ------------------------------ 加载层 UI ------------------------------ */
  const ui = {
    layer: document.getElementById('loading-layer'),
    stage: document.getElementById('loading-stage'),
    progress: document.getElementById('loading-progress'),
    error: document.getElementById('loading-error'),
    errorText: document.getElementById('loading-error-text'),
    retry: document.getElementById('loading-retry'),
    stats: null,
  };

  const showLoading = (text, progress = null) => {
    if (!ui.layer || !query.ui) return;
    ui.layer.hidden = false;
    if (ui.stage && text) ui.stage.textContent = text;
    if (ui.progress && progress !== null) ui.progress.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  };
  const hideLoading = () => ui.layer?.setAttribute('hidden', '');
  const showError = (message) => {
    if (ui.errorText) ui.errorText.textContent = message;
    if (ui.error) ui.error.hidden = false;
    if (query.ui) ui.layer?.removeAttribute('hidden');
  };

  // ?ui=0（截图/自动化）：立即隐藏加载层，画面只保留 3D 内容
  if (!query.ui) hideLoading();

  /* ------------------------------ 1. 渲染系统 ------------------------------ */
  const renderSystem = createRenderSystem({
    container,
    events,
    config: CONFIG,
    quality: CONFIG.QUALITY.tiers[query.quality] ? query.quality : CONFIG.STATE_DEFAULTS.quality,
    width: container.clientWidth || CONFIG.BUDGET.viewport.width,
    height: container.clientHeight || CONFIG.BUDGET.viewport.height,
    dpr: query.dpr,
  });

  /* ------------------------------ 2. 场景 ------------------------------ */
  const scene = new THREE.Scene();
  scene.name = 'palace-scene';
  const sceneRoot = new THREE.Group();
  sceneRoot.name = CONFIG.RENDERER.sceneRootName;
  scene.add(sceneRoot);

  /* ------------------------------ 3. 唯一相机装置 ------------------------------ */
  const rig = createCameraRig({ config: CONFIG, registry, store, events, domElement: container, input: false });
  rig.setViewportSize(renderSystem.size.width, renderSystem.size.height);
  renderSystem.attach(scene, rig.camera);

  /* ------------------------------ 4. 环境 ------------------------------ */
  const envOverride = parseEnvOverride(query.envOverride);
  if (envOverride) {
    console.warn('[palace] ⚠ 使用 ?env= 诊断覆盖（仅本进程，shared/config.js 未改动）：', JSON.stringify(envOverride));
  }
  const environment = createEnvironment({
    config: CONFIG,
    events,
    scene,
    registry,
    quality: store.state.quality,
    presetOverrides: envOverride ? { [store.state.timePreset]: envOverride } : null,
    rendererAdapter: {
      setExposure: (value) => renderSystem.setExposure(value),
      setBloom: (params, enabled) => renderSystem.setBloom(params, enabled),
    },
    preset: store.state.timePreset,
  });
  scene.add(environment.root);

  /* ------------------------------ 5. 状态控制器 + 同步 ------------------------------ */
  const stateController = createStateController({ events, store, camera: rig, environment, config: CONFIG });
  store.subscribe((payload) => {
    rig.onStateChange(payload);
    if (rig.camera !== renderSystem.renderPass.camera) renderSystem.attach(scene, rig.camera);
    if (payload.changed.quality) {
      renderSystem.setQuality(store.state.quality);
      environment.setQuality(store.state.quality);
    }
    if (payload.changed.timePreset && envOverride) {
      environment.setActiveOverrides(envOverride);
    }
  });
  // 查询参数覆盖初始 state（走同一请求事件：UI / 键盘 / 查询参数同一入口）
  if (query.quality && CONFIG.QUALITY.tiers[query.quality]) {
    events.request(EVENTS.requestQuality, { tier: query.quality, source: 'query' });
  }
  if (query.preset && CONFIG.LIGHTING.presets[query.preset]) {
    events.request(EVENTS.requestTimePreset, { preset: query.preset, source: 'query' });
  }

  /* ------------------------------ 6. 共享状态（ctx.shared）------------------------------ */
  const shared = { materials: {}, geometries: {}, textures: {}, disposeRegistry: [], water: [], greyboxSkipZones: [] };

  /* ------------------------------ 7. 区域装载 ------------------------------ */
  const zones = new Map();
  const zoneErrors = new Map();
  let greyboxModule = null;
  let greybox = null;
  let kitSource = 'fallback(greybox)';

  const loader = createLoader({ events, config: CONFIG, maxAttempts: 2, stage: '布局' });
  loader.add('layout', async () => {
    const viewpoints = registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
    const anchors = registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
    return { viewpoints, anchors };
  }, { url: 'src/shared/layout.js', weight: 1 });
  loader.add('environment', async () => environment.describe(), { url: 'src/core/environment.js', weight: 1 });

  /** t3 的 kit 就位就用真 kit，否则用灰盒替身（明确记录来源，不静默降级）。 */
  async function useKit() {
    if (shared.kit) return shared.kit;
    try {
      const mod = await import(KIT_URL);
      if (typeof mod.createKit === 'function') {
        shared.kit = await mod.createKit({ THREE, config: CONFIG, shared, registry, events, quality: store.state.quality });
        kitSource = 'src/kit/index.js (t3)';
        return shared.kit;
      }
    } catch {
      // 未交付：继续走替身
    }
    greyboxModule ??= await import(GREYBOX_URL);
    shared.kit = greyboxModule.createFallbackKit(THREE, CONFIG);
    kitSource = 'fallback(greybox) — t3 的 src/kit/** 未就位';
    return shared.kit;
  }

  async function mountGreybox() {
    if (!query.greybox) return null;
    greyboxModule ??= await import(GREYBOX_URL);
    const ctx = createZoneContext({
      THREE,
      zoneId: greyboxModule.ZONE_ID ?? 'GREYBOX',
      kit: await useKit(),
      assets: null,
      events,
      registry,
      quality: store.state.quality,
      shared,
      config: CONFIG,
      layout: LAYOUT,
      scope: 'city',
      greyboxSkipZones: shared.greyboxSkipZones,
    });
    const result = await greyboxModule.createZone(ctx);
    assertZoneResult('GREYBOX', result, { THREE, scope: 'city', expectBuildings: LAYOUT.SLOTS.length });
    sceneRoot.add(result.root);
    registry.registerZone('GREYBOX', result, { replace: true });
    zones.set('GREYBOX', { zoneId: 'GREYBOX', result, ctx, source: GREYBOX_URL });
    log(`灰盒 G0 就位：${result.stats.buildings} 栋建筑 / ${result.stats.meshes} 个绘制批次 / ${result.stats.triangles} 三角面`);
    return result;
  }

  async function loadRealZone(spec) {
    const zoneLoader = createLoader({ events, config: CONFIG, maxAttempts: 1, stage: `区域 ${spec.zone}` });
    zoneLoader.add(`zone:${spec.zone}`, async () => {
      const mod = await import(spec.url);
      if (typeof mod.createZone !== 'function') throw new Error(`${spec.url} 未导出 createZone(ctx)`);
      const ctx = createZoneContext({
        THREE,
        zoneId: spec.zone,
        kit: await useKit(),
        assets: shared.assets ?? null,
        events,
        registry,
        quality: store.state.quality,
        shared,
        config: CONFIG,
        layout: LAYOUT,
        scope: 'zone',
      });
      const result = await mod.createZone(ctx);
      const stats = assertZoneResult(spec.zone, result, {
        THREE,
        scope: 'zone',
        expectBuildings: zoneLayoutFor(spec.zone).slots.length,
      });
      sceneRoot.add(result.root);
      registry.registerZone(spec.zone, result, { replace: true });
      zones.set(spec.zone, { zoneId: spec.zone, result, ctx, source: spec.url, stats });
      greybox?.setZoneVisible?.(spec.zone, false);
      zoneErrors.delete(spec.zone);
      log(`区域 ${spec.zone}（${spec.label}）装载完成：${stats.buildings} 栋建筑 / ${stats.meshes} 个绘制批次`);
      return stats;
    }, { url: spec.url, weight: 2 });

    const outcome = await zoneLoader.run();
    if (outcome.ok) return { ok: true };
    const failure = outcome.failed[0];
    const error = failure?.error ?? new Error(`区域 ${spec.zone} 装载失败`);
    const problems = error instanceof ZoneContractError ? error.problems : [];
    zoneErrors.set(spec.zone, { zone: spec.zone, error: error.message, problems });
    events.emit(EVENTS.zoneFailed, { zone: spec.zone, error: error.message, problems });
    console.warn(`[palace] 区域 ${spec.zone} 装载失败（已广播 zone:failed，UI 可重试）：${error.message}`);
    if (problems.length > 0) console.warn(`   契约问题：\n   - ${problems.join('\n   - ')}`);
    return { ok: false, error };
  }

  async function runPipeline() {
    showLoading('正在准备场景…', 0);
    events.on(EVENTS.assetsProgress, ({ loaded, total, progress, stage }) => {
      if (stage?.startsWith('resize')) return;
      showLoading(`${stage ?? '加载'}（${loaded}/${total}）`, progress);
    });

    const base = await loader.run();
    if (!base.ok) {
      const message = base.failed.map((f) => `${f.id}: ${f.error}`).join('；');
      store.setLoading({ progress: 0, stage: 'failed', failed: message }, { source: 'loader' });
      showError(`布局 / 环境初始化失败：${message}`);
      return false;
    }

    try {
      greybox = await mountGreybox();
    } catch (error) {
      const problems = error instanceof ZoneContractError ? error.problems : [];
      zoneErrors.set('GREYBOX', { zone: 'GREYBOX', error: error.message, problems });
      events.emit(EVENTS.zoneFailed, { zone: 'GREYBOX', error: error.message, problems });
      console.warn('[palace] 灰盒装载失败：', error.message);
      if (problems.length > 0) console.warn(problems.join('\n'));
    }

    const failures = [];
    for (const spec of REAL_ZONE_SPECS) {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await loadRealZone(spec);
      if (!outcome.ok) failures.push({ zone: spec.zone, error: outcome.error });
    }
    const missing = REAL_ZONE_SPECS.filter((s) => !zones.has(s.zone)).map((s) => s.zone);

    if (failures.length > 0) {
      const detail = failures
        .map((f) => `${f.zone}: ${f.error.message}`)
        .concat(failures.flatMap((f) => (f.error.problems ?? []).slice(0, 3).map((p) => `${f.zone} 契约：${p}`)))
        .join('\n');
      showError(`区域装载失败（已重试 1 次）：\n${detail}`);
      store.setLoading({ progress: 0.85, stage: 'partial', failed: detail }, { source: 'zones' });
    } else if (missing.length > 0) {
      log(`待接入区域（模块尚未交付，灰盒 G0 已覆盖其体块）：${missing.join(' / ')}`);
      showLoading(`灰盒 G0 就绪（待接入：${missing.join('/')}）`, 0.9);
      store.setLoading({ progress: 0.9, stage: 'greybox', failed: null }, { source: 'zones' });
      setTimeout(() => hideLoading(), 600);
    } else {
      showLoading('就绪', 1);
      store.setLoading({ progress: 1, stage: 'ready', failed: null }, { source: 'zones' });
      setTimeout(() => hideLoading(), 200);
    }
    return true;
  }

  async function retryFailedZones() {
    if (ui.error) ui.error.hidden = true;
    if (zoneErrors.size === 0) {
      hideLoading();
      return true;
    }
    let allOk = true;
    for (const zoneId of [...zoneErrors.keys()]) {
      const spec = REAL_ZONE_SPECS.find((s) => s.zone === zoneId);
      if (!spec) continue;
      // eslint-disable-next-line no-await-in-loop
      const outcome = await loadRealZone(spec);
      if (!outcome.ok) allOk = false;
    }
    if (allOk) {
      hideLoading();
      store.setLoading({ progress: 1, stage: 'ready', failed: null }, { source: 'retry' });
    } else {
      showError(`仍有区域装载失败：${[...zoneErrors.keys()].join(' / ')}`);
    }
    return allOk;
  }

  ui.retry?.addEventListener('click', () => {
    retryFailedZones();
  });

  /* ------------------------------ 8. 输入 ------------------------------ */
  rig.bindInput(container, { keyboardTarget: window });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyT') {
      const order = CONFIG.LIGHTING.timePresets;
      events.request(EVENTS.requestTimePreset, {
        preset: order[(order.indexOf(store.state.timePreset) + 1) % order.length],
        source: 'keyboard',
      });
    } else if (event.code === 'KeyY') {
      const order = CONFIG.QUALITY.order;
      events.request(EVENTS.requestQuality, {
        tier: order[(order.indexOf(store.state.quality) + 1) % order.length],
        source: 'keyboard',
      });
    } else if (event.code === 'Space') {
      events.request(EVENTS.requestTour, { action: store.state.tourState.active ? 'stop' : 'start', source: 'keyboard' });
      event.preventDefault();
    }
  });

  /* ------------------------------ 9. 查询参数 → 固定机位 ------------------------------ */
  function applyQueryView() {
    if (query.zone && CONFIG.CAMERA.zoneViewpointByArea[query.zone]) {
      events.request(EVENTS.requestZoneFocus, { area: query.zone, source: 'query' });
    }
    if (query.focus) {
      events.request(EVENTS.requestFocusBuilding, { buildingId: query.focus, source: 'query' });
    }
    if (query.view) {
      const allowed = new Set(CONFIG.CAMERA.viewModes.map((m) => m.mode));
      if (allowed.has(query.view)) {
        if (query.view === 'interior' && query.zone) store.patch({}, { source: 'query', view: { area: query.zone } });
        events.request(EVENTS.requestViewMode, { mode: query.view, source: 'query' });
      } else {
        console.warn(`[palace] ?view=${query.view} 非法（合法：${[...allowed].join('/')}）`);
      }
    }
    if (query.shot) rig.update(CONFIG.CAMERA.transitionSeconds + 0.05, 0, store.state);
  }

  /* ------------------------------ 10. 统计面板（?stats=1）------------------------------ */
  function ensureStatsPanel() {
    if (ui.stats || !query.stats) return ui.stats;
    const div = document.createElement('div');
    div.id = 'palace-stats';
    div.style.cssText = [
      'position:fixed',
      'left:8px',
      'bottom:8px',
      'z-index:30',
      'padding:8px 12px',
      'border-radius:4px',
      'background:rgba(26,25,23,0.82)',
      'border:1px solid rgba(223,161,18,0.45)',
      'color:#f0ece1',
      'font:12px/1.5 "PingFang SC", system-ui, sans-serif',
      'white-space:pre',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(div);
    ui.stats = div;
    return div;
  }

  /** 机器可读报告（?stats=1）：`<pre id="palace-stats-json">` 便于 `--dump-dom` / CDP 抓取浏览器实测数据。 */
  function reportElement() {
    if (!query.stats) return null;
    let el = document.getElementById('palace-stats-json');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'palace-stats-json';
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  }

  function compactReport() {
    const s = renderSystem.getStats();
    const env = environment.describe();
    const r = registry.stats();
    return {
      mode: rig.mode,
      viewMode: store.state.viewMode,
      projection: rig.projection,
      preset: store.state.timePreset,
      quality: store.state.quality,
      dpr: s.quality.dpr,
      viewport: `${s.viewport.width}x${s.viewport.height}`,
      frames: s.frames,
      avgFps: s.avgFps,
      p95FrameMs: s.p95FrameMs,
      fullFrameDrawCalls: s.fullFrame.drawCalls,
      visibleTriangles: s.mainScene.visibleTriangles,
      mainSceneRenderables: countRenderables(sceneRoot),
      geometries: s.memory.geometries,
      textures: s.memory.textures,
      bloom: s.quality.bloom,
      toneMapping: s.quality.toneMapping,
      exposure: s.quality.exposure,
      shadowMapSize: env.shadows.mapSize,
      shadowCastingLights: env.shadows.primaryDirectionalLights,
      lampAnchors: env.lamps.anchors,
      lampRealtime: env.lamps.realtime,
      lampActive: env.lamps.active,
      lampEmissiveIntensity: +env.lamps.emissiveIntensity.toFixed(2),
      sunIntensity: env.sunIntensity,
      ambientIntensity: env.ambientIntensity,
      hemiIntensity: env.hemiIntensity,
      // t45/t47：权威背景/雾口径（由 environment.describe().background 只读上报；纯新增字段）
      // 口径：backgroundColorHex/Space 为 sRGB 显示参考空间实际像素值；Linear 为 three 线性工作空间（不可直接与像素比）；
      //       清屏色 toneMapped=false ⇒ 不受曝光/色调映射影响；光雾色可与背景色不同，且可完全覆盖背景（t44）。
      backgroundColorHex: env.background.hex,
      backgroundColorLinear: env.background.linear,
      backgroundColorSpace: env.background.outputColorSpace,
      backgroundToneMapped: env.background.toneMapped,
      backgroundRole: env.background.role,
      fogColorHex: env.background.fog?.hex ?? null,
      fogNear: env.background.fog?.near ?? null,
      fogFar: env.background.fog?.far ?? null,
      // t48：把"配置值"与"实际落屏值"并列上报（各带语义），并给出 Δ 与输出链，供判据工具选择正确的背景引用。
      // 实测结论：实机落屏的是**天空网格渐变**（toneMapped:false），清屏色被天空球完全覆盖（命中 ≈0.2%）。
      backgroundConfiguredHex: env.background.configured?.hex ?? null,
      backgroundConfiguredSemantic: env.background.configured?.semantic ?? null,
      backgroundDisplayedKind: env.background.displayed?.kind ?? null,
      backgroundDisplayedTopHex: env.background.displayed?.topHex ?? null,
      backgroundDisplayedHorizonHex: env.background.displayed?.horizonHex ?? null,
      backgroundDisplayedTopSrgb255: env.background.displayed?.topSrgb255 ?? null,
      backgroundDisplayedHorizonSrgb255: env.background.displayed?.horizonSrgb255 ?? null,
      backgroundDisplayedToneMapped: env.background.displayed?.toneMapped ?? null,
      backgroundDeltaMaxAbs: env.background.delta?.maxAbs ?? null,
      backgroundDeltaConfigVsSkyTop: env.background.delta?.configVsSkyTop ?? null,
      backgroundDeltaConfigVsSkyHorizon: env.background.delta?.configVsSkyHorizon ?? null,
      backgroundOutputChain: renderSystem.describeOutputChain?.() ?? null,
      backgroundCandidates: env.background.candidates ?? null,
      zones: r.zones,
      buildings: r.buildings,
      ready: ready,
      kitSource,
    };
  }

  let statsAccum = 0;
  function updateStatsPanel(dt) {
    if (!query.stats || !ui.stats) return;
    statsAccum += dt;
    if (statsAccum < 0.25) return;
    statsAccum = 0;
    const s = renderSystem.getStats();
    const r = registry.stats();
    const report = reportElement();
    if (report) report.textContent = JSON.stringify(compactReport());
    ui.stats.textContent = [
      `视角 ${rig.mode}${rig.isFp ? '（第一人称）' : ''} · ${store.state.timePreset} · 质量 ${store.state.quality}`,
      `FPS ${s.avgFps} · p95 ${s.p95FrameMs}ms · 帧 ${s.frames}`,
      `主场景调用(估) ${countRenderables(sceneRoot)} · 整帧调用(含后处理) ${s.fullFrame.drawCalls} · 三角面 ${s.mainScene.visibleTriangles}`,
      `区域 ${r.zones.join(',')} · 建筑 ${r.buildings} · 视角 ${r.viewpoints}`,
      `DPR ${s.quality.dpr} · ${s.viewport.width}×${s.viewport.height} · Bloom ${s.quality.bloom ? 'on' : 'off'}`,
    ].join('\n');
  }

  /* ------------------------------ 11. 唯一动画循环 ------------------------------ */
  let animationHandle = null;
  let lastTime = 0;
  let elapsed = 0;
  let frame = 0;
  let shotFrames = 0;
  let ready = false;
  let resolveReady = null;
  let apiRef = null;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  /**
   * 场景就绪信号（t17/截图脚本要能**轮询**，不能只靠固定延时）：
   *   - `window.__PALACE_READY__ === true`
   *   - `<html data-palace-ready="1">` 与 `<body data-palace-ready="1">`（--dump-dom 可直接读）
   *   - `window.__PALACE__.whenReady`（Promise）
   */
  function markReady(reason = 'frame') {
    if (ready) return;
    ready = true;
    window.__PALACE_READY__ = true;
    window.__PALACE_READY_REASON__ = reason;
    document.documentElement?.setAttribute('data-palace-ready', '1');
    document.documentElement?.setAttribute('data-palace-ready-src', reason);
    document.body?.setAttribute('data-palace-ready', '1');
    // 注意：ready 可能早于 `api` 构建完成（截图模式的同步渲染路径），所以只解析 promise 不给值；
    // 消费者拿到 resolved 之后通过 window.__PALACE__ 取完整 API。
    resolveReady?.(apiRef ?? true);
  }

  /** 装配完成的独立标记（先于"渲染就绪"）：外部可据此判断场景已建好、注册表已齐。 */
  function markLoaded() {
    document.documentElement?.setAttribute('data-palace-loaded', '1');
    document.body?.setAttribute('data-palace-loaded', '1');
    window.__PALACE_LOADED__ = true;
  }

  function frameStep(now) {
    animationHandle = requestAnimationFrame(frameStep);
    const rawDt = lastTime === 0 ? 1 / 60 : (now - lastTime) / 1000;
    lastTime = now;
    const dt = query.shot ? 1 / 60 : Math.min(1 / 15, Math.max(1 / 120, rawDt));
    elapsed += dt;
    frame += 1;
    const stateSnapshot = store.state;

    for (const entry of zones.values()) {
      try {
        entry.result.update(dt, elapsed, stateSnapshot);
      } catch (error) {
        if (!entry.failedOnce) {
          entry.failedOnce = true;
          events.emit(EVENTS.zoneFailed, { zone: entry.zoneId, error: `update 抛错：${error.message}` });
          console.error(`[palace] 区域 ${entry.zoneId} 的 update 抛错（已停止调用其 update）：`, error);
        }
      }
    }

    rig.update(dt, elapsed, stateSnapshot);
    environment.update(dt, elapsed, { ...stateSnapshot, cameraPosition: rig.position });
    if (rig.camera !== renderSystem.renderPass.camera) renderSystem.attach(scene, rig.camera);
    renderSystem.render(scene, rig.camera);
    renderSystem.recordFrame(dt * 1000);
    updateStatsPanel(dt);

    if (query.shot) {
      shotFrames += 1;
      if (shotFrames >= 3) markReady();
    } else if (frame >= 2) {
      markReady();
    }
  }

  /* ------------------------------ 12. 启动 ------------------------------ */
  const started = await runPipeline();
  if (!started) {
    console.warn('[palace] 初始化失败，未启动渲染循环');
    return null;
  }
  applyQueryView();
  ensureStatsPanel();
  markLoaded();
  if (query.shot) {
    // 截图模式：同步渲染 3 帧后再进入 rAF 循环。
    // 这样即使 headless 的 --dump-dom 不驱动 rAF，页面也已经渲染并产出可读的实测报告（确定性画面）。
    for (let i = 0; i < 3; i += 1) {
      rig.update(1 / 60, elapsed + 1 / 60, store.state);
      environment.update(1 / 60, elapsed + 1 / 60, { ...store.state, cameraPosition: rig.position });
      renderSystem.render(scene, rig.camera);
    }
    markReady('sync-frames');
    updateStatsPanel(1);
  } else {
    // 非截图模式也给出"就绪"的时间兜底（400ms），避免外部只靠固定延时轮询
    setTimeout(() => markReady('grace-timer'), 400);
  }
  animationHandle = requestAnimationFrame(frameStep);

  const api = {
    version: { config: CONFIG.CONFIG_VERSION, layout: LAYOUT.LAYOUT_VERSION },
    query,
    get kitSource() {
      return kitSource;
    },
    events,
    store,
    state: store.state,
    registry,
    rig,
    renderSystem,
    environment,
    scene,
    sceneRoot,
    zones,
    zoneErrors,
    shared,
    greybox,
    retryFailedZones,
    applyQueryView,
    countRenderables: () => countRenderables(sceneRoot),
    /** 机器可读的实测报告（与 ?stats=1 的 DOM 元素同一份数据） */
    report: () => compactReport(),
    get ready() {
      return ready;
    },
    /** 外部轮询/等待场景就绪（截图与验收脚本用） */
    whenReady: readyPromise,
    /** 截图/验收辅助：把相机过渡推到终点并渲染一帧（确定性画面） */
    settle() {
      rig.update(CONFIG.CAMERA.transitionSeconds + 0.05, elapsed, store.state);
      environment.update(0, elapsed, { ...store.state, cameraPosition: rig.position });
      renderSystem.render(scene, rig.camera);
      return { mode: rig.mode, projection: rig.projection, camera: rig.describe() };
    },
    stats() {
      return {
        render: renderSystem.getStats(),
        registry: registry.stats(),
        environment: environment.describe(),
        camera: rig.describe(),
        state: store.snapshot(),
        mainSceneRenderables: countRenderables(sceneRoot),
        kitSource,
        zoneErrors: [...zoneErrors.values()].map((info) => ({ zone: info.zone, error: info.error })),
        layout: LAYOUT.LAYOUT_STATS,
      };
    },
    dispose() {
      if (animationHandle) cancelAnimationFrame(animationHandle);
      animationHandle = null;
      for (const entry of zones.values()) {
        try {
          entry.result.dispose();
          sceneRoot.remove(entry.result.root);
        } catch (error) {
          console.warn(`[palace] 区域 ${entry.zoneId} dispose 失败：`, error);
        }
      }
      zones.clear();
      stateController.dispose();
      environment.dispose();
      rig.dispose();
      renderSystem.dispose();
    },
  };

  apiRef = api;
  window.__PALACE__ = api;
  if (ready) resolveReady?.(api);
  log(
    `装配完成：区域 [${[...zones.keys()].join(', ')}] · 注册建筑 ${registry.stats().buildings} 栋 · ` +
      `视角 ${registry.stats().viewpoints} 个 · kit=${kitSource} · 模式 ${rig.mode}`,
  );
  return api;
}

/** 页面加载即装配（ESM 入口的唯一副作用）；Node 侧 import 本模块只取 parseQuery/countRenderables 等纯函数。 */
const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.getElementById === 'function';
const palace = IS_BROWSER ? await bootstrap() : null;
if (palace) {
  window.addEventListener('pagehide', () => palace.dispose?.(), { once: true });
}

export default bootstrap;
