#!/usr/bin/env node
/**
 * `tests/core.test.mjs` —— 核心引擎的 Node 侧证明（不依赖浏览器、不伪造数据）。
 *
 * 覆盖任务卡 acceptance 的每一条：
 *   1. 唯一 renderer/composer/scene 挂载/动画循环（静态源码扫描）
 *   2. 一个相机装置 → 八视角 + 1.2s 固定过渡 + 键盘/按钮/F/Esc 同一请求事件 + iso 正交 + fp 恢复
 *   3. 三时辰预设统一光照/天空/曝光/色调映射/阴影 + 夜景灯数量限制 + 远端发光替代
 *   4. 异步 loader 进度/失败/重试；注册表全局唯一 id
 *   5. 区域契约校验（缺字段报错而非静默）
 *   6. state 机与模式互斥
 */

import {
  ROOT,
  assert,
  assertClose,
  assertEqual,
  assertNoProblems,
  assertThrows,
  createTestRunner,
  loadModule,
  loadThree,
  readSource,
  makeTestCtx,
  buildZone,
  zoneModulePath,
} from './harness.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const runner = createTestRunner('core.test.mjs · 唯一渲染内核 / 相机装置 / 环境 / 加载 / 注册表 / 契约');

const THREE = await loadThree();
const { CONFIG, EVENTS } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const LAYOUT_SLICE = await loadModule('src/core/layout-slice.js');
const { createEventBus, EventBusError } = await loadModule('src/core/events.js');
const { createStateStore, createStateController, validateStateShape, STATE_FIELDS } = await loadModule('src/core/state.js');
const { createRegistry, RegistryError } = await loadModule('src/core/registry.js');
const { createCameraRig, focusSpecFor, createFpSolver, interiorBoundsFor } = await loadModule('src/core/camera.js');
const { createEnvironment } = await loadModule('src/core/environment.js');
const { createLoader, createZoneLoader, createTextureLoader } = await loadModule('src/core/loader.js');
const { createZoneContext, validateZoneResult, ZoneContractError } = await loadModule('src/core/context.js');
const { zoneLayoutFor, cityLayout, rampsFromRoads } = await loadModule('src/core/layout-slice.js');
const { rngForZone } = await loadModule('src/core/rng.js');

/* -------------------------------------------------------------------------- */
/*  公共 fixtures                                                              */
/* -------------------------------------------------------------------------- */

function makeCore() {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  // 注册全城建筑（focus/拾取需要真实建筑注册表）
  registry.registerBuildings('GREYBOX', LAYOUT.SLOTS.map((s) => ({ ...s })), { replace: true });
  const store = createStateStore({ events });
  const rig = createCameraRig({ config: CONFIG, registry, store, events });
  const controller = createStateController({ events, store, camera: rig, config: CONFIG });
  store.subscribe((payload) => rig.onStateChange(payload));
  const settle = (seconds = CONFIG.CAMERA.transitionSeconds + 0.05) => {
    const step = 1 / 60;
    for (let t = 0; t < seconds; t += step) rig.update(step, t, store.state);
  };
  return { events, registry, store, rig, controller, settle };
}

/** 收集事件（断言事件流用） */
function collect(events, type) {
  const list = [];
  events.on(type, (payload) => list.push(payload));
  return list;
}

/* ========================================================================== */
runner.section('1. 唯一渲染内核（静态源码扫描）');
/* ========================================================================== */

const SRC_FILES = (() => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(abs.slice(ROOT.length + 1));
    }
  };
  walk(join(ROOT, 'src'));
  return out;
})();

/**
 * 剥离 JS 注释与字符串/模板字面量（保留换行，保持行结构）。
 *
 * 为什么必须剥：静态守卫断言原先用裸 `String.includes(...)` 扫全仓，会把**文档注释里**的
 * `requestAnimationFrame` 字样当成真实调用 —— `src/interaction/index.js` / `tour.js` 的注释
 * "本模块不调用 requestAnimationFrame" 曾把达标的 t8（F 区）判成 failed（t21 修复）。
 * 剥注释后按**真实调用语法**匹配，既不误报也不放水。
 */
export function stripCommentsAndStrings(text) {
  let out = '';
  let mode = 'code';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 1; continue; }
      if (c === '/' && n === '*') { mode = 'block'; i += 1; continue; }
      if (c === "'" ) { mode = 'single'; continue; }
      if (c === '"') { mode = 'double'; continue; }
      if (c === '`') { mode = 'template'; continue; }
      out += c;
      continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += '\n'; }
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') { mode = 'code'; i += 1; }
      else if (c === '\n') out += '\n';
      continue;
    }
    // 字符串/模板内：整体丢弃（用空格占位，避免把两个 token 粘连）
    if (c === '\\') { i += 1; continue; }
    if ((mode === 'single' && c === "'") || (mode === 'double' && c === '"') || (mode === 'template' && c === '`')) {
      mode = 'code';
      out += ' ';
    }
  }
  return out;
}

/** 便于测试注入：源码（已剥注释/字符串）读取器。 */
const readCode = (rel, reader = readSource) => stripCommentsAndStrings(reader(rel) ?? '');

await runner.test('全仓只有 src/core/renderer.js 实例化 WebGLRenderer / EffectComposer / UnrealBloomPass', () => {
  const offenders = [];
  for (const rel of SRC_FILES) {
    const text = readCode(rel);
    const isRenderer = rel === 'src/core/renderer.js';
    for (const pattern of ['new THREE.WebGLRenderer', 'new EffectComposer', 'new UnrealBloomPass', 'new OutputPass']) {
      if (text.includes(pattern) && !isRenderer) offenders.push(`${rel} 含 ${pattern}`);
    }
  }
  assertEqual(offenders.length, 0, `renderer/composer 只能在 src/core/renderer.js 创建：\n    ${offenders.join('\n    ')}`);
  const rendererCode = readCode('src/core/renderer.js');
  assert(rendererCode.includes('new THREE.WebGLRenderer'), 'renderer.js 必须创建 WebGLRenderer');
  assert(rendererCode.includes('new EffectComposer'), 'renderer.js 必须创建 EffectComposer');
  assert((rendererCode.match(/new THREE\.WebGLRenderer\s*\(/g) ?? []).length === 1, 'WebGLRenderer 只允许一处');
  assert((rendererCode.match(/new EffectComposer\s*\(/g) ?? []).length === 1, 'EffectComposer 只允许一处');
});

await runner.test('全仓只有 src/main.js 创建 Scene、挂载 scene、运行 requestAnimationFrame', () => {
  const sceneCreators = SRC_FILES.filter((rel) => /new THREE\.Scene\s*\(/.test(readCode(rel)));
  assertEqual(sceneCreators.join(','), 'src/main.js', `Scene 只允许在 src/main.js 创建，实际：${sceneCreators.join(',')}`);
  // 真实调用语法（剥注释后匹配 `requestAnimationFrame(`），注释里的字样不再误报
  const loops = SRC_FILES.filter((rel) => /requestAnimationFrame\s*\(/.test(readCode(rel)));
  assertEqual(loops.join(','), 'src/main.js', `动画循环只能有一处（src/main.js），实际：${loops.join(',')}`);
  const sceneAdders = SRC_FILES.filter((rel) => /scene\.add\s*\(/.test(readCode(rel)) && rel !== 'src/main.js');
  assertEqual(sceneAdders.length, 0, `只有 main.js 能 scene.add：${sceneAdders.join(',')}`);
  for (const rel of SRC_FILES.filter((p) => p.startsWith('src/zones/'))) {
    const text = readCode(rel);
    assert(!/scene\.add\s*\(/.test(text), `${rel} 不得自行 scene.add（契约 §3.3）`);
    assert(!/renderer\.render\s*\(/.test(text), `${rel} 不得自行 render（契约 §3.3）`);
  }
});

await runner.test('静态扫描守卫自检：注释里的 rAF 字样不误报、真实调用必被抓（含突变样本）', () => {
  // (a) 纯注释样本 → 剥注释后不得匹配
  const commentOnly = stripCommentsAndStrings('// 本模块不调用 requestAnimationFrame，update(dt) 由唯一循环驱动\nconst a = 1;\n');
  assert(!/requestAnimationFrame\s*\(/.test(commentOnly), '行注释里的 rAF 字样不得被当成调用');
  const blockCommentOnly = stripCommentsAndStrings('/* 不使用 requestAnimationFrame 与 setInterval */\nconst b = 2;\n');
  assert(!/requestAnimationFrame\s*\(/.test(blockCommentOnly), '块注释里的 rAF 字样不得被当成调用');
  // (b) 字符串/模板里的字样同样不算调用
  const stringOnly = stripCommentsAndStrings("const note = 'requestAnimationFrame('; const t = `requestAnimationFrame(`;\n");
  assert(!/requestAnimationFrame\s*\(/.test(stringOnly), '字符串与模板字面量里的 rAF 字样不得被当成调用');
  // (c) 真实调用（含注释混排）必须被抓到
  const mixed = stripCommentsAndStrings('// requestAnimationFrame(comment)\nrequestAnimationFrame(loop);\n/* requestAnimationFrame(x) */\n');
  assert(/requestAnimationFrame\s*\(/.test(mixed), '真实调用必须被抓到');
  assert((mixed.match(/requestAnimationFrame\s*\(/g) ?? []).length === 1, '注释块里的那一次不得被计数');
  // (d) 行结构保留（换行不丢，便于将来做行号定位）
  assertEqual(stripCommentsAndStrings('a\n// b\nc').trim().split('\n').length, 3, '剥注释后应保留行结构');

  // (e) 历史误报语料回归：t8 被判 failed 时 src/interaction/{index,tour}.js 的注释原文如下
  //     （后来被改写过，因此把语料固化在测试里，保证"注释盲扫描"这类缺陷永远可复现）
  const HISTORICAL_COMMENT_CORPUS = [
    ' *   - 循环：不调用 requestAnimationFrame，`update(dt)` 由唯一动画循环驱动（见 `attachRenderLoop`）。',
    ' *   - 不使用 `setInterval` / `requestAnimationFrame`：讲解点驻留时间由唯一动画循环的 dt 累加驱动',
  ];
  for (const line of HISTORICAL_COMMENT_CORPUS) {
    const naive = `const a = 1;\n${line}\n`;
    assert(naive.includes('requestAnimationFrame'), '语料本身应含该字样（模拟旧扫描）');
    assert(!/requestAnimationFrame\s*\(/.test(stripCommentsAndStrings(naive)), `历史误报语料在剥注释后必须不再命中：${line.slice(0, 24)}…`);
  }
  runner.info(`历史误报语料 ${HISTORICAL_COMMENT_CORPUS.length} 条：裸 include 会命中、剥注释后 0 命中（旧扫描把 t8 判 failed 的根因）`);

  // (f) 真实仓里的现状：interaction 的注释保留，但只有 main.js 出现真实调用
  const realLoops = SRC_FILES.filter((rel) => /requestAnimationFrame\s*\(/.test(readCode(rel)));
  assertEqual(realLoops.join(','), 'src/main.js', `真实调用只允许出现在 main.js，实际：${realLoops.join(',')}`);
  const interactionFiles = SRC_FILES.filter((rel) => rel.startsWith('src/interaction/'));
  assert(interactionFiles.length > 0, '应至少扫到 src/interaction/**（否则本守卫失去意义）');
  const naiveHits = interactionFiles.filter((rel) => (readSource(rel) ?? '').includes('requestAnimationFrame'));
  const realHits = interactionFiles.filter((rel) => /requestAnimationFrame\s*\(/.test(readCode(rel)));
  assertEqual(realHits.length, 0, `interaction 不得有真实 rAF 调用：${realHits.join(',')}`);
  assert(
    naiveHits.length >= realHits.length,
    `朴素 include 扫描会命中 ${naiveHits.length} 个文件（含注释），真实调用 0 个 —— 这正是 t21 修复的误报来源`,
  );
  runner.info(`扫描口径：朴素 include 命中 interaction ${naiveHits.length} 个文件；剥注释 + 真实调用语法命中 ${realHits.length} 个（main.js 真实调用 ${(readCode('src/main.js').match(/requestAnimationFrame\s*\(/g) ?? []).length} 处）`);
});

await runner.test('renderer.resolvePixelRatio：非法 dpr 回落质量档（有限正比率），合法 dpr 行为不变', async () => {
  const { resolvePixelRatio } = await loadModule('src/core/renderer.js');
  const tiers = CONFIG.QUALITY.tiers;
  // 非法输入：NaN / Infinity / 负数 / 0 / 非数字串 / 空串 / undefined 全部回落到本档 dpr，且必为有限正数
  const illegal = [NaN, Infinity, -Infinity, -1, 0, -0.5, 'abc', '', '  ', undefined, null, {}, []];
  for (const wanted of illegal) {
    for (const tier of CONFIG.QUALITY.order) {
      const resolved = resolvePixelRatio(wanted, { config: CONFIG, tier });
      assert(Number.isFinite(resolved.ratio) && resolved.ratio > 0, `dpr=${JSON.stringify(wanted)} 在 ${tier} 档必须得到有限正比率，实际 ${resolved.ratio}`);
      assertEqual(resolved.ratio, Math.min(CONFIG.RENDERER.maxPixelRatio, tiers[tier].dpr), `dpr=${JSON.stringify(wanted)} 在 ${tier} 档应回落到该档 dpr`);
      assertEqual(resolved.fallback, true, `dpr=${JSON.stringify(wanted)} 应标记为回落`);
      assert(typeof resolved.reason === 'string' && resolved.reason.length > 0, '回落必须给出原因（供 warn 文案）');
    }
  }
  // 合法输入：行为与修复前一致（仍夹在 [0.5, maxPixelRatio] 内，且不标记回落）
  const legalCases = [
    { wanted: 1, tier: 'medium', expect: 1 },
    { wanted: '1', tier: 'medium', expect: 1 },
    { wanted: 1.5, tier: 'high', expect: 1.5 },
    { wanted: 3, tier: 'high', expect: CONFIG.RENDERER.maxPixelRatio },
    { wanted: 0.1, tier: 'medium', expect: 0.5 },
    { wanted: 0.85, tier: 'low', expect: 0.85 },
  ];
  for (const { wanted, tier, expect } of legalCases) {
    const resolved = resolvePixelRatio(wanted, { config: CONFIG, tier });
    assertEqual(resolved.ratio, expect, `dpr=${JSON.stringify(wanted)} 在 ${tier} 档应解析为 ${expect}`);
    assertEqual(resolved.fallback, false, `dpr=${JSON.stringify(wanted)} 不应标记为回落`);
    assertEqual(resolved.reason, null, '合法输入不产生回落原因');
  }
  // 与质量档无关的边界：无 override（null）时等于该档 dpr
  for (const tier of CONFIG.QUALITY.order) {
    assertEqual(resolvePixelRatio(null, { config: CONFIG, tier }).ratio, Math.min(CONFIG.RENDERER.maxPixelRatio, tiers[tier].dpr));
  }
  runner.info(`非法 dpr 样本 ${illegal.length} 个 × ${CONFIG.QUALITY.order.length} 档全部回落；合法样本 ${legalCases.length} 个行为不变`);
});

await runner.test('?dpr=abc 的端到端路径：parseQuery → Number() → resolvePixelRatio 不再产生 NaN', async () => {
  const { parseQuery } = await loadModule('src/main.js');
  const { resolvePixelRatio } = await loadModule('src/core/renderer.js');
  for (const raw of ['abc', '-3', 'Infinity', '0', '', '1e999']) {
    const query = parseQuery(`?dpr=${encodeURIComponent(raw)}`);
    const resolved = resolvePixelRatio(query.dpr, { config: CONFIG, tier: 'medium' });
    assert(Number.isFinite(resolved.ratio) && resolved.ratio > 0, `?dpr=${raw} 不应产生 NaN/非正比率，实际 ${resolved.ratio}`);
  }
  // 合法值仍按原语义透传
  assertEqual(parseQuery('?dpr=1').dpr, 1);
  assertEqual(resolvePixelRatio(parseQuery('?dpr=1').dpr, { config: CONFIG, tier: 'medium' }).ratio, 1);
  assertEqual(resolvePixelRatio(parseQuery('?dpr=2.5').dpr, { config: CONFIG, tier: 'medium' }).ratio, CONFIG.RENDERER.maxPixelRatio);
});

await runner.test('不存在第二套相机控制（无 OrbitControls / 无第二台相机实例化）', () => {
  const offenders = [];
  for (const rel of SRC_FILES) {
    const text = readCode(rel);
    if (/new OrbitControls\s*\(/.test(text)) offenders.push(`${rel}: new OrbitControls`);
    if (/new THREE\.(PerspectiveCamera|OrthographicCamera)\s*\(/.test(text) && rel !== 'src/core/camera.js') {
      offenders.push(`${rel}: 直接 new 相机`);
    }
  }
  assertEqual(offenders.length, 0, offenders.join('; '));
});

/* ========================================================================== */
runner.section('2. state 机与请求事件（§7.1/§7.2）');
/* ========================================================================== */

await runner.test('state 字段严格等于 config.STATE_DEFAULTS（不多不少）', () => {
  const { store } = makeCore();
  assertNoProblems(validateStateShape(store.state));
  assertEqual(Object.keys(store.state).sort().join(','), [...STATE_FIELDS].sort().join(','));
});

await runner.test('八视角：键盘 1–8 与按钮走同一条请求事件，state.viewMode 逐一切换', () => {
  const { events, store, rig, settle } = makeCore();
  for (const entry of CONFIG.CAMERA.viewModes) {
    events.request(EVENTS.requestViewMode, { mode: entry.mode, source: 'keyboard' });
    settle();
    assertEqual(store.state.viewMode, entry.mode, `模式 ${entry.mode} 未生效`);
    assertEqual(rig.mode, entry.mode, `rig 模式与 state 不一致（${entry.mode}）`);
    if (entry.mode === 'fp') {
      events.request(EVENTS.requestViewMode, { mode: 'oblique', source: 'ui-button' });
      settle();
    }
  }
  // 数字键 → requestByIndex 走同一事件
  const seen = [];
  events.on(EVENTS.requestViewMode, (p) => seen.push(p));
  rig.requestByIndex(2, 'keyboard');
  assertEqual(seen.length, 1);
  assertEqual(seen[0].mode, 'iso');
  assertEqual(seen[0].source, 'keyboard');
  settle();
  assertEqual(store.state.viewMode, 'iso');
});

await runner.test('非法请求被拒绝且不改 state（不静默接受）', () => {
  const { events, store } = makeCore();
  const before = store.snapshot();
  events.request(EVENTS.requestViewMode, { mode: 'teleport', source: 'test' });
  events.request(EVENTS.requestTimePreset, { preset: 'noon', source: 'test' });
  events.request(EVENTS.requestQuality, { tier: 'ultra', source: 'test' });
  events.request(EVENTS.requestZoneFocus, { area: 'Z', source: 'test' });
  assertEqual(JSON.stringify(store.snapshot()), JSON.stringify(before), 'state 不应被非法请求改动');
});

await runner.test('未知事件名立即抛错（事件表是白名单）', () => {
  const { events } = makeCore();
  assertThrows(() => events.emit('view:do-magic', {}), '未在 §7.2 的事件必须抛错');
  assertThrows(() => events.on('nope:nope', () => {}));
  const error = assertThrows(() => events.request('x:y'));
  assert(error instanceof EventBusError, '错误类型应为 EventBusError');
});

await runner.test('三时辰与质量档请求生效；选中/悬停/复位统一走事件', () => {
  const { events, store, rig, settle } = makeCore();
  for (const preset of CONFIG.LIGHTING.timePresets) {
    events.request(EVENTS.requestTimePreset, { preset, source: 'ui' });
    assertEqual(store.state.timePreset, preset);
  }
  for (const tier of CONFIG.QUALITY.order) {
    events.request(EVENTS.requestQuality, { tier, source: 'ui' });
    assertEqual(store.state.quality, tier);
  }
  events.request(EVENTS.selectionChange, { buildingId: 'B-hall-main', hovered: false });
  assertEqual(store.state.selectedBuildingId, 'B-hall-main');
  events.request(EVENTS.selectionChange, { buildingId: 'C-hall-bed-main', hovered: true });
  assertEqual(store.state.hoveredBuildingId, 'C-hall-bed-main');
  assertEqual(store.state.selectedBuildingId, 'B-hall-main', '悬停不得覆盖选中');
  events.request(EVENTS.requestZoneFocus, { area: 'D', source: 'ui' });
  assertEqual(store.state.viewMode, 'zone');
  assertEqual(store.view.viewpointId, CONFIG.CAMERA.zoneViewpointByArea.D);
  settle();
  assertClose(rig.position.x, LAYOUT.VIEWPOINT_BY_ID['VP-D-zone'].position.x, 0.01, 'zone 模式应使用登记机位');
  events.request(EVENTS.requestReset, { source: 'ui' });
  settle();
  assertEqual(store.state.viewMode, 'oblique');
  assertEqual(store.state.selectedBuildingId, null);
});

await runner.test('第一人称与导览互斥（进入 fp 暂停导览；启动导览退出 fp）', () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestTour, { action: 'start', source: 'ui' });
  settle();
  assert(store.state.tourState.active, '导览应激活');
  assertEqual(store.state.mode, 'tour');
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'keyboard' });
  settle();
  assertEqual(store.state.viewMode, 'fp');
  assert(store.state.tourState.paused, '进入 fp 必须暂停导览');
  events.request(EVENTS.requestTour, { action: 'start', source: 'ui' });
  settle();
  assertEqual(store.state.viewMode !== 'fp', true, '启动导览必须退出第一人称');
  assert(!rig.isFp, 'rig 不应仍处于第一人称');
  const problems = validateStateShape(store.state);
  assertNoProblems(problems);
});

/* ========================================================================== */
runner.section('3. 唯一相机装置：八视角 / 过渡 / 正交 iso / 第一人称恢复');
/* ========================================================================== */

await runner.test('CONFIG 冻结的相机参数与八模式注册一致（编号即键盘 1–8）', () => {
  assertEqual(CONFIG.CAMERA.transitionSeconds, 1.2);
  assertEqual(CONFIG.CAMERA.viewModes.length, 8);
  const modes = CONFIG.CAMERA.viewModes.map((m) => m.mode);
  assertEqual(modes.join(','), 'oblique,iso,axis,zone,focus,interior,fp,orbit');
  CONFIG.CAMERA.viewModes.forEach((m, i) => assertEqual(m.index, i + 1, '编号必须是 1..8'));
});

await runner.test('过渡固定 1.2s：未到期不落位，到期发 camera:settled', () => {
  const { events, store, rig } = makeCore();
  const settled = collect(events, EVENTS.cameraSettled);
  events.request(EVENTS.requestViewMode, { mode: 'iso', source: 'test' });
  const start = rig.describe().position;
  rig.update(0.6, 0.6, store.state);
  assertEqual(rig.describe().transitioning, true, '0.6s 时仍应在过渡中');
  assert(settled.length === 0, '过渡未完成不得发 camera:settled');
  assert(Math.abs(rig.describe().position.x - start.x) > 1, '过渡中机位应已移动');
  rig.update(0.61, 1.21, store.state);
  assertEqual(rig.describe().transitioning, false, '1.21s 后过渡应结束');
  assert(settled.length >= 1, '过渡结束必须发 camera:settled');
  assertEqual(settled.at(-1).mode, 'iso');
  assert(settled.at(-1).position && typeof settled.at(-1).position.x === 'number');
});

await runner.test('iso：正交投影 + 机位固定在包络中心 + 极角锁定 35.264° + 目标半径受限', () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'iso', source: 'test' });
  settle();
  const d = rig.describe();
  assertEqual(d.projection, 'orthographic', 'iso 必须是正交投影');
  assert(rig.camera.isOrthographicCamera === true, 'active camera 应为 OrthographicCamera');
  assertClose(d.target.x, (LAYOUT.ENVELOPE.minX + LAYOUT.ENVELOPE.maxX) / 2, 0.01, 'iso 目标应在包络中心 X');
  assertClose(d.target.z, (LAYOUT.ENVELOPE.minZ + LAYOUT.ENVELOPE.maxZ) / 2, 0.01, 'iso 目标应在包络中心 Z');
  assertClose(d.polarDeg, CONFIG.CAMERA.isoElevationDeg, 0.05, 'iso 极角应为 35.264°');
  assertEqual(d.locked.polar, true);
  assertEqual(d.locked.distance, true);
  assertEqual(d.locked.target, true);
  // 旋转只改方位角；缩放走正交 zoom
  const before = rig.describe();
  rig.applyInput('rotate', { dx: 200, dy: 400 });
  const after = rig.describe();
  assertClose(after.polarDeg, before.polarDeg, 1e-6, 'iso 极角必须锁定');
  assert(Math.abs(after.azimuthDeg - before.azimuthDeg) > 1, 'iso 应允许方位角环绕');
  rig.applyInput('zoom', { amount: -400 });
  assert(rig.describe().zoom > 1, '正交缩放应生效');
  assertThrows(() => rig.applyInput('warp', {}), '未知输入应抛错');
});

await runner.test('oblique：目标半径 ≤420m、极角夹在 8°–78°', () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'oblique', source: 'test' });
  settle();
  const d = rig.describe();
  assertEqual(d.projection, 'perspective');
  assert(d.polarDeg >= CONFIG.CAMERA.minPolarAngleDeg - 1e-6 && d.polarDeg <= CONFIG.CAMERA.maxPolarAngleDeg + 1e-6, `oblique 极角 ${d.polarDeg} 越界`);
  const cx = (LAYOUT.ENVELOPE.minX + LAYOUT.ENVELOPE.maxX) / 2;
  const cz = (LAYOUT.ENVELOPE.minZ + LAYOUT.ENVELOPE.maxZ) / 2;
  assert(Math.hypot(d.target.x - cx, d.target.z - cz) <= CONFIG.CAMERA.targetRadiusLimit + 1e-6, '目标半径超限');
  // 极端拖动仍不越界
  for (let i = 0; i < 40; i += 1) rig.applyInput('rotate', { dx: 0, dy: 300 });
  const after = rig.describe();
  assert(after.polarDeg <= CONFIG.CAMERA.maxPolarAngleDeg + 1e-6, `旋转后极角越界：${after.polarDeg}`);
  for (let i = 0; i < 60; i += 1) rig.applyInput('pan', { dx: 200, dy: 200 });
  const panned = rig.describe();
  assert(Math.hypot(panned.target.x - cx, panned.target.z - cz) <= CONFIG.CAMERA.targetRadiusLimit + 1e-6, '平移后目标半径超限');
});

await runner.test('axis：消费 layout.TOUR_POINTS 并按段推进', () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'axis', source: 'test' });
  settle();
  assertClose(rig.describe().position.z, LAYOUT.TOUR_POINTS[0].position.z, 0.01, 'axis 起点应为 TP-01');
  rig.advanceAxis(4, { instant: true });
  assertEqual(rig.describe().axisIndex, 5);
  assertClose(rig.describe().position.z, LAYOUT.TOUR_POINTS[4].position.z, 0.01, '第 5 段应使用 TP-05 机位');
  rig.setAxisIndex(99, { instant: true });
  assertEqual(rig.describe().axisIndex, LAYOUT.TOUR_POINTS.length, '段序号应被夹在合法区间');
});

await runner.test('focus：由 bounds + facing 计算正前 3/4 取景，距离随体量自适应', () => {
  const { events, store, rig, settle } = makeCore();
  const small = LAYOUT.SLOT_BY_ID['C-pavilion-rear'];
  const big = LAYOUT.SLOT_BY_ID['B-hall-main'];
  events.request(EVENTS.requestFocusBuilding, { buildingId: big.id, source: 'test' });
  settle();
  const spec = focusSpecFor(big);
  assertClose(rig.position.x, spec.position.x, 0.01, 'focus 机位应由 bounds+facing 推出');
  assertClose(rig.position.y, spec.position.y, 0.01);
  const bigDistance = Math.hypot(rig.position.x - big.x, rig.position.z - big.z);
  events.request(EVENTS.requestFocusBuilding, { buildingId: small.id, source: 'test' });
  settle();
  const smallDistance = Math.hypot(rig.position.x - small.x, rig.position.z - small.z);
  assert(smallDistance < bigDistance, `体量小的建筑应更近（小 ${smallDistance} vs 大 ${bigDistance}）`);
  // 3/4 取景：机位在正面方向 ±35° 附近，而不是正对
  const facing = CONFIG.ORIENTATION.facingVectors[big.facing];
  const offset = { x: spec.position.x - big.x, z: spec.position.z - big.z };
  const len = Math.hypot(offset.x, offset.z);
  const cos = (offset.x * facing.x + offset.z * facing.z) / len;
  assert(cos > 0.6 && cos < 0.95, `应为正前 3/4（cos=${cos.toFixed(3)}）`);
});

await runner.test('interior：位置与目标夹在室内包围盒内（B 金銮殿 / C 寝殿）', () => {
  const { store, rig, settle, events } = makeCore();
  for (const [area, id] of [['B', 'VP-B-interior'], ['C', 'VP-C-interior']]) {
    events.request(EVENTS.requestViewMode, { mode: 'interior', source: 'test' });
    store.patch({}, { source: 'test', view: { area, interiorViewpointId: id } });
    settle();
    const box = interiorBoundsFor(area);
    const d = rig.describe();
    assert(d.mode === 'interior');
    assert(d.position.x >= box.minX && d.position.x <= box.maxX, `${area} 室内机位 X 越界`);
    assert(d.position.z >= box.minZ && d.position.z <= box.maxZ, `${area} 室内机位 Z 越界`);
    assert(d.target.x >= box.minX && d.target.x <= box.maxX, `${area} 室内目标 X 越界`);
    assert(d.target.z >= box.minZ && d.target.z <= box.maxZ, `${area} 室内目标 Z 越界`);
    assertEqual(CONFIG.CAMERA.viewModes.find((m) => m.mode === 'interior').projection, 'perspective');
  }
});

await runner.test('orbit：极角/距离受限，可复位', () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'orbit', source: 'test' });
  settle();
  for (let i = 0; i < 60; i += 1) rig.applyInput('rotate', { dx: 500, dy: 500 });
  let d = rig.describe();
  assert(d.polarDeg <= CONFIG.CAMERA.maxPolarAngleDeg + 1e-6, 'orbit 极角上限');
  for (let i = 0; i < 60; i += 1) rig.applyInput('zoom', { amount: 900 });
  d = rig.describe();
  assert(d.distance >= CONFIG.CAMERA.minDistance - 1e-6 && d.distance <= CONFIG.CAMERA.maxDistance + 1e-6, `orbit 距离越界：${d.distance}`);
  const reset = rig.reset({ instant: true });
  assertEqual(reset.mode, 'oblique');
  const oblique = LAYOUT.VIEWPOINT_BY_ID[CONFIG.CAMERA.zoneViewpointByArea.city];
  assertClose(rig.position.z, oblique.position.z, 0.01, '复位应回到全城鸟瞰机位');
});

await runner.test('第一人称：最近 fp-spawn 出生、视线高 = 面高+1.65、退出恢复原模式与机位', () => {
  const { events, store, rig, settle } = makeCore();
  const entered = collect(events, EVENTS.fpEntered);
  const exited = collect(events, EVENTS.fpExited);
  events.request(EVENTS.requestViewMode, { mode: 'focus', source: 'test' });
  store.patch({ viewMode: 'focus', selectedBuildingId: 'B-hall-main' }, { source: 'test', view: { focusBuildingId: 'B-hall-main' } });
  settle();
  const before = rig.describe();
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'keyboard' });
  settle();
  assert(rig.isFp, '应进入第一人称');
  assertEqual(entered.length, 1, '应发 fp:entered');
  const spawn = entered[0].spawnId;
  assert(typeof spawn === 'string' && spawn.includes('fp-spawn'), `出生点应为 fp-spawn，实际 ${spawn}`);
  const spawnVp = LAYOUT.VIEWPOINT_BY_ID[spawn];
  const floor = LAYOUT.floorYAt(rig.position.x, rig.position.z);
  assertClose(rig.position.y, floor + CONFIG.CAMERA.fpEyeHeight, 0.06, '视线高必须为面高 + 1.65m');
  assertClose(rig.position.x, spawnVp.position.x, 1.2, '应停在最近的 fp-spawn 附近');
  // 键盘路径：Esc 与 F 都是同一条请求事件（切换退出并恢复）
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'keyboard-escape' });
  settle();
  assert(!rig.isFp, 'Esc/F 应退出第一人称');
  assertEqual(exited.length, 1, '应发 fp:exited');
  assertEqual(exited[0].restoredMode, 'focus', '应恢复到进入前的模式');
  assertEqual(store.state.viewMode, 'focus');
  assertClose(rig.position.x, before.position.x, 0.01, '退出后机位参数应恢复');
  assertClose(rig.position.z, before.position.z, 0.01, '退出后机位参数应恢复');
  assertClose(rig.describe().fov, before.fov, 0.01, '退出后 fov 应恢复');
});

await runner.test('第一人称行走内核：可行走面支撑、台阶阈值、障碍（含门洞）阻挡、包络夹取', () => {
  const solver = createFpSolver({ config: CONFIG });
  const spawn = LAYOUT.VIEWPOINT_BY_ID['VP-B-fp-spawn'];
  const start = { x: spawn.position.x, y: spawn.position.y, z: spawn.position.z };
  const north = solver.step(start, 0, 1, CONFIG.CAMERA.fpMoveSpeed * 0.5);
  assert(north.z > start.z + 1, '广场上应能向北行走');
  assertClose(north.y, LAYOUT.floorYAt(north.x, north.z) + CONFIG.CAMERA.fpEyeHeight, 0.01, '行走应贴合可行走面');
  // 走进门殿实体（不可穿越体块）：从门殿侧面撞上去
  const gate = LAYOUT.SLOT_BY_ID['B-gate-front'];
  const beside = { x: gate.bounds.minX + 6, y: gate.baseY + CONFIG.CAMERA.fpEyeHeight, z: gate.bounds.minZ - 6 };
  const into = solver.step(beside, 0, 1, 20);
  assert(into.blocked.length > 0, '撞墙应记录阻挡原因');
  assert(into.z < gate.bounds.minZ + 1, '不得穿入建筑体块');
  // 门洞可通过（门洞中心正对行走）
  const doorPath = { x: gate.door.center.x, y: gate.baseY + CONFIG.CAMERA.fpEyeHeight, z: gate.bounds.minZ - 8 };
  const through = solver.step(doorPath, 0, 1, 14);
  assertClose(through.z, doorPath.z + 14, 0.01, '门洞中线应可通行');
  // 掉出宫城包络
  const far = solver.step({ x: 419, y: 0, z: 0 }, 1, 0, 20);
  assert(far.x <= LAYOUT.TERRAIN_EXTENT.maxX, '不得离开外侧地形范围');
});

await runner.test('八视角各自有确定的机位参数：7 种模式两两不同（zone(city) 按契约等于全城鸟瞰机位）', () => {
  const { events, store, rig, settle } = makeCore();
  const seen = new Map();
  for (const entry of CONFIG.CAMERA.viewModes) {
    events.request(EVENTS.requestViewMode, { mode: entry.mode, source: 'test' });
    settle();
    const d = rig.describe();
    seen.set(entry.mode, `${d.position.x.toFixed(1)},${d.position.y.toFixed(1)},${d.position.z.toFixed(1)}|${d.projection}`);
    if (entry.mode === 'fp') {
      events.request(EVENTS.requestViewMode, { mode: 'oblique', source: 'test' });
      settle();
    }
  }
  const signature = (mode) => seen.get(mode);
  const modePoses = CONFIG.CAMERA.viewModes.map((m) => m.mode).filter((m) => m !== 'zone');
  const uniquePoses = new Set(modePoses.map(signature));
  assertEqual(uniquePoses.size, modePoses.length, `除 zone 外 7 种模式机位必须两两不同：${modePoses.map((m) => `${m}=${signature(m)}`).join(' ')}`);
  const oblique = LAYOUT.VIEWPOINT_BY_ID[CONFIG.CAMERA.zoneViewpointByArea.city];
  assertEqual(signature('zone'), `${oblique.position.x.toFixed(1)},${oblique.position.y.toFixed(1)},${oblique.position.z.toFixed(1)}|perspective`, 'zone(area=city) 必须使用登记的全城机位');
  // 五个分区的 zone 机位也必须两两不同
  const zonePoses = new Set();
  for (const area of ['B', 'C', 'D', 'E', 'F']) {
    events.request(EVENTS.requestZoneFocus, { area, source: 'test' });
    settle();
    const d = rig.describe();
    zonePoses.add(`${d.position.x.toFixed(1)},${d.position.y.toFixed(1)},${d.position.z.toFixed(1)}`);
    assertEqual(store.view.viewpointId, CONFIG.CAMERA.zoneViewpointByArea[area]);
  }
  assertEqual(zonePoses.size, 5, `五个分区机位应互不相同：${[...zonePoses].join(' | ')}`);
});

/* ========================================================================== */
runner.section('4. 统一环境（三时辰 / 灯位限制 / 远端发光 / 氛围）');
/* ========================================================================== */

function makeEnv() {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events });
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  const scene = new THREE.Scene();
  const calls = { exposure: [], bloom: [] };
  const environment = createEnvironment({
    config: CONFIG,
    events,
    scene,
    registry,
    quality: 'high',
    rendererAdapter: {
      setExposure: (v) => calls.exposure.push(v),
      setBloom: (params, enabled) => calls.bloom.push({ ...params, enabled }),
    },
    preset: 'goldenHour',
  });
  return { events, registry, scene, environment, calls };
}

await runner.test('三预设：太阳方向/颜色/强度、天空、雾、曝光、色调映射全部来自 config 且互不相同', () => {
  const { environment } = makeEnv();
  assertNoProblems(
    CONFIG.LIGHTING.timePresets.map((p) => (CONFIG.LIGHTING.presets[p] ? null : `缺少预设 ${p}`)).filter(Boolean),
    '三预设',
  );
  const described = CONFIG.LIGHTING.timePresets.map((preset) => {
    environment.applyPreset(preset);
    return environment.describe();
  });
  assertEqual(described.length, 3);
  const signatures = new Set(described.map((d) => `${d.sunDirection.x},${d.sunDirection.y},${d.sunDirection.z}|${d.sunIntensity}|${d.exposure}`));
  assertEqual(signatures.size, 3, '三个预设的太阳方向/强度/曝光必须互不相同');
  for (const d of described) {
    assertEqual(d.toneMapping, CONFIG.LIGHTING.toneMapping.mode);
    assertEqual(d.outputColorSpace, CONFIG.LIGHTING.toneMapping.outputColorSpace);
    assert(d.fog.near > 0 && d.fog.far > d.fog.near, '雾必须有效');
  }
  const night = described[2];
  assertEqual(night.preset, 'moonlitNight');
  assert(night.lamps.emissiveIntensity > described[0].lamps.emissiveIntensity, '夜景发光灯位强度应更高');
  // 实时灯池按 config 现算（不写死数字 —— 语义常量 pin 死是过期断言的根源；t31 参数化修复）：
  // pool = min(config 上限, 质量档上限)；启用条件与 src/core/environment.js 的 want 计算一致。
  const tierLimit = Math.min(CONFIG.LIGHTING.lamps.maxRealtimePointLights, CONFIG.QUALITY.tiers.high.maxRealtimeLights);
  const expectedRealtime = (presetId) => {
    const scale = CONFIG.LIGHTING.presets[presetId].lampIntensityScale;
    return scale <= 0.02 ? 0 : Math.max(1, Math.round(tierLimit * Math.min(1, scale)));
  };
  assertEqual(
    described[0].lamps.realtime,
    expectedRealtime('goldenHour'),
    `盛世金辉实时灯池应为 round(min(config 上限, high 档上限) × goldenHour.lampIntensityScale) = ${expectedRealtime('goldenHour')}（当前 config: scale=${CONFIG.LIGHTING.presets.goldenHour.lampIntensityScale}）`,
  );
  assert(night.lamps.realtime > 0, '夜景必须激活实时宫灯');
});

await runner.test('夜景实时灯 ≤ 上限（config 与质量档双重限制），远端用发光材质替代', () => {
  const { environment, registry } = makeEnv();
  environment.applyPreset('moonlitNight');
  for (const tier of CONFIG.QUALITY.order) {
    environment.setQuality(tier);
    const d = environment.describe();
    const limit = Math.min(CONFIG.LIGHTING.lamps.maxRealtimePointLights, CONFIG.QUALITY.tiers[tier].maxRealtimeLights);
    assert(d.lamps.realtime <= limit, `${tier} 档实时灯 ${d.lamps.realtime} 超过上限 ${limit}`);
    assertEqual(d.lamps.anchors, LAYOUT.LIGHT_ANCHORS.length, '灯位锚点应全部登记（49 个）');
    assertEqual(d.shadows.lampShadows, 0, '宫灯不投影');
    assertEqual(d.shadows.primaryDirectionalLights, 1, '只允许一盏主方向光投影');
  }
  // 远端（超出 emissiveFallbackBeyond）不得被选成实时灯
  environment.setQuality('high');
  environment.update(0.4, 1, { cameraPosition: { x: 0, y: 0, z: 0 } });
  const far = { x: LAYOUT.TERRAIN_EXTENT.maxX, y: 0, z: LAYOUT.TERRAIN_EXTENT.maxZ };
  environment.update(1.0, 2, { cameraPosition: far });
  const lights = environment.lightObjects().realtimeLights.filter((l) => l.visible);
  for (const light of lights) {
    const distance = Math.hypot(light.position.x - far.x, light.position.z - far.z);
    assert(distance <= CONFIG.LIGHTING.lamps.emissiveFallbackBeyond, `远端灯 ${distance} 不应是实时点光`);
    assertEqual(light.castShadow, false, '宫灯不得投影');
  }
  const instances = environment.lightObjects().lampInstances;
  assert(instances && instances.isInstancedMesh, '远端灯位应由一个 InstancedMesh（发光材质）承担');
  assertEqual(instances.count, registry.allLightAnchors().length);
});

await runner.test('灯位锚点晚于环境初始化注册时，update 会自动重建（不出现"灯位为 0"的静默失效）', () => {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events });
  const scene = new THREE.Scene();
  const environment = createEnvironment({
    config: CONFIG,
    events,
    scene,
    registry,
    quality: 'high',
    preset: 'moonlitNight',
  });
  // 环境先建、锚点后册（真实装配顺序：main.js 先建环境，loader 的 layout 任务再注册灯位）
  assertEqual(environment.stats().lampAnchors, 0, '此时应还没有锚点');
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  environment.update(0.4, 1, { cameraPosition: { x: 0, y: 0, z: 0 } });
  assertEqual(environment.stats().lampAnchors, LAYOUT.LIGHT_ANCHORS.length, 'update 后必须自动纳入全部 49 个灯位');
  const instances = environment.lightObjects().lampInstances;
  assert(instances && instances.count === LAYOUT.LIGHT_ANCHORS.length, '发光材质实例数应等于灯位锚点数');
  environment.update(0.4, 1.5, { cameraPosition: { x: 0, y: 0, z: -390 } });
  assert(environment.describe().lamps.active > 0, '夜景靠近灯位时应有实时宫灯被激活');
  environment.dispose();

  // 反序也必须成立（layout 先注册、环境后构建）：保证两种初始化顺序都不会出现"灯位为 0"
  const events2 = createEventBus();
  const registry2 = createRegistry({ config: CONFIG, events: events2 });
  registry2.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  const environment2 = createEnvironment({
    config: CONFIG,
    events: events2,
    scene: new THREE.Scene(),
    registry: registry2,
    quality: 'medium',
    preset: 'moonlitNight',
  });
  assertEqual(environment2.stats().lampAnchors, LAYOUT.LIGHT_ANCHORS.length, 'layout 先注册时环境构建即应拿到全部灯位');
  assertEqual(environment2.lightObjects().lampInstances.count, LAYOUT.LIGHT_ANCHORS.length);
  environment2.dispose();
});

await runner.test('统一氛围：香炉轻烟 / 微尘 / 水面微波在同一 update 内推进', () => {
  const { environment, scene } = makeEnv();
  const stats = environment.stats();
  assert(stats.smoke > 0 && stats.smoke <= CONFIG.LIGHTING.atmosphere.smokeParticleBudget, '烟雾粒子预算');
  assert(stats.dust > 0 && stats.dust <= CONFIG.LIGHTING.atmosphere.dustParticleBudget, '微尘粒子预算');
  // 注册一个水面，验证材质被补丁并被 update 推进时间
  const geometry = new THREE.PlaneGeometry(10, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0x33544f });
  const water = new THREE.Mesh(geometry, material);
  water.userData.waterSurface = true;
  scene.add(water);
  environment.adoptWaterSurfaces();
  assertEqual(environment.stats().waterMeshes, 1, 'userData.waterSurface 的水面应被统一接管');
  environment.update(0.016, 5, {});
  // 材质补丁在首次编译后才产生 shader；至少不应抛错，且第二次扫描不重复注册
  environment.adoptWaterSurfaces();
  assertEqual(environment.stats().waterMeshes, 1);
});

/* ========================================================================== */
runner.section('5. 异步加载器（进度 / 失败 / 重试）');
/* ========================================================================== */

await runner.test('进度事件按 stage 上报 loaded/total/progress；失败发 assets:failed 且可重试成功', async () => {
  const events = createEventBus();
  const progress = collect(events, EVENTS.assetsProgress);
  const failures = collect(events, EVENTS.assetsFailed);
  const loader = createLoader({ events, config: CONFIG, maxAttempts: 2, stage: '资源' });
  let attempts = 0;
  loader.add('ok', async () => ({ bytes: 1024 }));
  loader.add('flaky', async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('首次失败（模拟网络中断）');
    return { bytes: 2048 };
  }, { url: './assets/flaky.bin' });
  const first = await loader.run();
  assertEqual(first.ok, false, '首次应失败');
  assertEqual(failures.length, 1, '必须发 assets:failed');
  assertEqual(failures[0].url, './assets/flaky.bin');
  assertEqual(failures[0].retriable, true, '未超过 maxAttempts 应可重试');
  assert(progress.length >= 2, '必须有进度事件');
  assert(progress.every((p) => typeof p.loaded === 'number' && typeof p.total === 'number' && typeof p.stage === 'string'));
  const second = await loader.retry();
  assertEqual(second.ok, true, '重试应成功');
  assertEqual(attempts, 2);
  const summary = loader.summary();
  assertEqual(summary.ok.length, 2);
  assertEqual(summary.failed.length, 0);
});

await runner.test('资源失败不静默：超过重试上限后 retriable=false，且错误一路返回', async () => {
  const events = createEventBus();
  const failures = collect(events, EVENTS.assetsFailed);
  const loader = createLoader({ events, config: CONFIG, maxAttempts: 1, stage: '资源' });
  loader.add('always-broken', async () => {
    throw new Error('文件不存在');
  }, { url: './assets/missing.glb' });
  const outcome = await loader.run();
  assertEqual(outcome.ok, false);
  assertEqual(failures[0].retriable, false);
  assertEqual(failures[0].error, '文件不存在');
});

await runner.test('区域模块缺失 → 明确失败（不装作已加载）', async () => {
  const events = createEventBus();
  const zoneLoader = createZoneLoader({
    events,
    config: CONFIG,
    specs: [{ zone: 'Z', url: './zones/__does-not-exist__.js' }],
  });
  const outcome = await zoneLoader.run();
  assertEqual(outcome.ok, false, '不存在的区域模块必须失败');
  assertEqual(outcome.failed[0].id, 'zone:Z');
  const failedEvents = collect(events, EVENTS.assetsFailed);
  // 事件在 collect 之前已发出，这里以 outcome 为准，再验证一次重试入口存在
  assert(typeof zoneLoader.retry === 'function');
  assert(failedEvents.length === 0);
});

await runner.test('纹理加载在 Node 内明确失败（不返回空对象假装成功）', async () => {
  const events = createEventBus();
  const failures = collect(events, EVENTS.assetsFailed);
  const texLoader = createTextureLoader({ THREE, events, config: CONFIG });
  let rejected = false;
  try {
    await texLoader.load('./assets/textures/roof.png');
  } catch (error) {
    rejected = true;
    assert(/只能在浏览器内进行/.test(error.message), '错误信息应说明 Node 无法加载纹理');
  }
  assert(rejected, 'Node 内加载纹理必须 reject');
  assertEqual(failures.length, 1);
  assertEqual(failures[0].retriable, false);
});

/* ========================================================================== */
runner.section('6. 注册表（全局唯一 id / 灰盒顶替 / 基线回滚）');
/* ========================================================================== */

await runner.test('建筑/视角/灯位/碰撞 id 全局唯一，重复立即抛 RegistryError', () => {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  const slot = LAYOUT.SLOT_BY_ID['B-gate-front'];
  registry.registerBuildings('B', [{ ...slot }]);
  assertThrows(() => registry.registerBuildings('C', [{ ...slot }]), '同一建筑 id 由两个区域注册必须抛错');
  const error = assertThrows(() => registry.registerBuildings('D', [{ ...slot }]));
  assert(error instanceof RegistryError);
  // 同区域 replace 允许
  registry.registerBuildings('B', [{ ...slot }], { replace: true });
  registry.registerViewpoints('B', [{ ...LAYOUT.VIEWPOINT_BY_ID['VP-B-zone'] }], { replace: true });
  assertThrows(() => registry.registerViewpoints('C', [{ ...LAYOUT.VIEWPOINT_BY_ID['VP-B-zone'] }]));
  registry.registerLightAnchors('B', [{ ...LAYOUT.LIGHT_ANCHORS[0] }], { replace: true });
  assertThrows(() => registry.registerLightAnchors('C', [{ ...LAYOUT.LIGHT_ANCHORS[0] }]));
  assertThrows(() => {
    registry.registerColliders('B', { obstacles: [{ ...LAYOUT.OBSTACLES[0] }] });
    registry.registerColliders('C', { obstacles: [{ ...LAYOUT.OBSTACLES[0] }] });
  }, '碰撞 id 重复必须抛错');
  assertNoProblems(registry.duplicateIds().map((d) => `${d.kind}:${d.id}`), '全局唯一 id');
});

await runner.test('灰盒先注册 → 真实区域 replace 后数量不变且来源更新', async () => {
  const grey = await buildZone('GREYBOX', { registry: undefined });
  assertEqual(grey.skipped, false, '灰盒模块必须存在');
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  registry.registerZone('GREYBOX', grey.result, { replace: true });
  const afterGreybox = registry.stats();
  assertEqual(afterGreybox.buildings, LAYOUT.SLOTS.length, '灰盒应注册全部 67 栋');
  assertEqual(afterGreybox.zones.join(','), 'GREYBOX');

  // 用模板扮演"真实区域 B"（契约完整），replace 顶替灰盒的 B 条目
  const templatePath = zoneModulePath('TEMPLATE');
  const templateMod = await loadModule(templatePath);
  const ctx = await makeTestCtx({ zoneId: 'B', registry });
  const resultB = await templateMod.createZone(ctx);
  assertNoProblems(validateZoneResult('B', resultB, { THREE, scope: 'zone', expectBuildings: zoneLayoutFor('B').slots.length }).problems);
  const zoneEvents = collect(events, EVENTS.zoneLoaded);
  registry.registerZone('B', resultB, { replace: true });
  const afterB = registry.stats();
  assertEqual(afterB.buildings, LAYOUT.SLOTS.length, 'replace 后建筑总数应保持不变（不能翻倍）');
  assertEqual(afterB.buildingsByZone.B, zoneLayoutFor('B').slots.length);
  assertEqual(afterB.zones.sort().join(','), 'B,GREYBOX');
  assertEqual(zoneEvents.length, 1, '注册区域必须发 zone:loaded');
  assertEqual(zoneEvents[0].zone, 'B');

  // 区域卸载 → layout 冻结基线回滚（VP-B-zone 仍在，来源回到 layout）
  registry.unregisterZone('B');
  const vp = registry.getViewpoint('VP-B-zone');
  assert(vp, '卸载区域后 layout 基线视角必须回滚存在');
  assertEqual(vp.registrySource, 'layout');
  assert(registry.allLightAnchors().length >= LAYOUT.LIGHT_ANCHORS.length, '灯位基线不得丢失');
});

await runner.test('查询辅助：按点/包围盒取建筑、最近 fp-spawn、按距离排序灯位', () => {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  registry.registerBuildings('GREYBOX', LAYOUT.SLOTS.map((s) => ({ ...s })), { replace: true });
  const hit = registry.buildingsAt(0, -116);
  assert(hit.length > 0, '金銮殿中心应命中建筑');
  assertEqual(hit[0].id, 'B-hall-main', `命中的应是体量最小的金銮殿，实际 ${hit[0].id}`);
  assertEqual(registry.buildingsInBounds(LAYOUT.COURTYARD_BY_ID['CY-B-plaza'].bounds).length > 0, true);
  const spawn = registry.nearestFpSpawn({ x: 0, y: 0, z: -500 });
  assertEqual(spawn.viewpoint.id, 'VP-B-fp-spawn');
  const lamps = registry.nearestLightAnchors({ x: 0, y: 0, z: -390 }, 3);
  assertEqual(lamps.length, 3);
  assert(lamps[0].distance <= lamps[2].distance, '灯位应按距离升序');
  // t76：interior 机位由 layout 驱动（LAYOUT 1.1.17 = 43 栋内景各 1 个），不再硬编码 2
  const interiorVpIds = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => v.id);
  assertEqual(
    registry.viewpointsByMode('interior').length,
    interiorVpIds.length,
    `interior 机位数应等于 layout 中 mode=interior 的登记数（实际登记 ${interiorVpIds.length}）`,
  );
  assertEqual(interiorVpIds.length, 43, 'LAYOUT 1.1.17：43 栋内景各 1 个 interior 机位（t72 城门 4 + t73 12 + t74 23 + 既有门殿 4）');
  assert(
    interiorVpIds.every((id) => /-interior$/.test(id)),
    `interior 机位命名应统一为 *-interior（异常：${interiorVpIds.filter((id) => !/-interior$/.test(id)).join(',')}）`,
  );
  assertEqual(registry.viewpointsByMode('fp-spawn').length, 5, '五个区域各 1 个 fp-spawn');
});

/* ========================================================================== */
runner.section('7. 区域契约校验（缺字段必须报错，不静默）');
/* ========================================================================== */

async function greyResult() {
  const grey = await buildZone('GREYBOX');
  assertEqual(grey.skipped, false);
  return grey;
}

await runner.test('灰盒满足全部契约字段与数量（67 栋 / 32 连接 / 81 障碍 / 167 可走面 / 61 视角 / 49 灯位；LAYOUT 1.1.17）', async () => {
  const grey = await greyResult();
  const { problems, stats } = validateZoneResult('GREYBOX', grey.result, { THREE, scope: 'city', expectBuildings: LAYOUT.SLOTS.length });
  assertNoProblems(problems);
  assertEqual(stats.buildings, LAYOUT.SLOTS.length);
  assertEqual(stats.connectors, LAYOUT.CONNECTORS.length);
  assertEqual(stats.obstacles, LAYOUT.OBSTACLES.length);
  assertEqual(stats.walkable, LAYOUT.WALKABLE.length);
  assertEqual(stats.viewpoints, LAYOUT.VIEWPOINTS.length);
  assertEqual(stats.lightAnchors, LAYOUT.LIGHT_ANCHORS.length);
  assertEqual(stats.viewpointsByMode['fp-spawn'], 5, '五个区域各 1 个 fp-spawn（t75 未改）');
  // t76：按 layout 实际值（LAYOUT 1.1.17：interior 43 / zone 7 / focus-extra 6 ⇒ 合计 61；t102/t103/t126/t128/t131/t134 未改机位）
  const byMode = LAYOUT.VIEWPOINTS.reduce((acc, v) => {
    acc[v.mode] = (acc[v.mode] ?? 0) + 1;
    return acc;
  }, {});
  assertEqual(stats.viewpointsByMode.interior, 43, '43 栋内景机位（t72 4 城门 + t73 12 hall + t74 23 sideHall + 既有 4）');
  assertEqual(stats.viewpointsByMode.interior, byMode.interior, '应等于 layout 中 mode=interior 的登记数');
  assertEqual(stats.viewpointsByMode.zone, byMode.zone, 'zone 机位数应等于 layout 登记数');
  assertEqual(stats.viewpointsByMode['focus-extra'], byMode['focus-extra'], 'focus-extra 机位数应等于 layout 登记数');
  assertEqual(
    stats.viewpointsByMode.interior + stats.viewpointsByMode.zone + stats.viewpointsByMode['focus-extra'] + stats.viewpointsByMode['fp-spawn'],
    LAYOUT.VIEWPOINTS.length,
    '四种机位模式之和应等于 layout.VIEWPOINTS 总数（61）',
  );
  // t108：同步冻结计数到当前树（精确相等，未放宽）：
  //   LAYOUT 1.1.17 = 167 条 = 112（t75 口径：28 条地面/桥面/台基/外域 + 43 interior + 43 passage）
  //                        + 43 门外过渡台阶（t102，18 栋，id 后缀 -transition-N，kind 用既有 ground）
  //                        +  2 门槛面（t103：10 座亭可通行化 + B 两座门槛面
  //                                WK-B-pavilion-gate-{west,east}-threshold，kind 用既有 ground，id 后缀 -threshold）
  //                        +  4 条 terrace 面（t126：tier2 有界开槽 ⇒ 单块 1 → 5 段，−1+5 净 +4；kind='terrace'）
  //                        +  8 条 t128：C-bed-terrace 开槽 1 → 5 段（净 +4，kind='terrace'）
  //                                + C 两栋各 2 级台阶（4 条 `-transition-N` 台阶面，kind='ground'）
  //                        +  2 条 t131：E-court3-hall 门外 2 级台阶（`-transition-N`，kind='ground'）⇒ ground 62 → 64
  //                        −  4 条 t134：删除 4 片残片
  //                                `WK-B-terrace-tier2-{west,east}`、`WK-C-bed-terrace-{west,east}`（kind='terrace'）⇒ terrace 12 → 8
  assertEqual(
    LAYOUT.WALKABLE.length,
    167,
    'LAYOUT 1.1.17：可行走面 167 条（112 + 43 门外过渡台阶 t102 + 2 门槛面 t103 + 4 条 terrace 面 t126 + 8 条 t128（C-bed-terrace 开槽 1→5 净 +4 + C 两栋各 2 级台阶 4 条 -transition 台阶面）+ 2 条 t131（E-court3-hall 门外 2 级台阶）− 4 条 t134（删除残片 WK-B-terrace-tier2-{west,east} 与 WK-C-bed-terrace-{west,east}，kind=terrace）；kind 用既有 ground / terrace + id 后缀 -transition-N / -threshold）',
  );
  assertEqual(
    LAYOUT.WALKABLE.filter((w) => w.kind === 'passage').length,
    43,
    'passage 门洞通道面应为 43 条（t75；不参与内景包围盒）',
  );
  // t108 新增、t130 建立、t136 同步：167 的**组成自证**（分项之和 = 总数；transition 面 49 条、覆盖 21 栋；threshold 2 条；terrace 8 条）
  {
    const byKind = LAYOUT.WALKABLE.reduce((acc, w) => {
      acc[w.kind] = (acc[w.kind] ?? 0) + 1;
      return acc;
    }, {});
    const sum = Object.values(byKind).reduce((a, b) => a + b, 0);
    assertEqual(sum, LAYOUT.WALKABLE.length, `按 kind 分项之和应等于总数（${sum} vs ${LAYOUT.WALKABLE.length}）`);
    assertEqual(byKind.interior, 43, 'interior 43（t72 4 城门 + t73 12 hall + t74 23 sideHall + 既有 4）');
    assertEqual(byKind.passage, 43, 'passage 43（t75 门洞通道面）');
    // t127：t126 的 +4 落在 kind='terrace'（tier2 有界开槽：单块 1 → 5 段）
    assertEqual(byKind.terrace, 8, `terrace 面应为 8 条（t126 +4、t128 +4、t134 删残片 −4；实际 ${byKind.terrace}）`);
    const transitions = LAYOUT.WALKABLE.filter((w) => /-transition-\d+$/.test(w.id));
    assertEqual(transitions.length, 49, '门外过渡台阶面应为 49 条（t102 的 43 + t128 的 C 两栋 4 条 + t131 的 E-court3-hall 2 条）');
    assert(
      transitions.every((w) => w.kind === 'ground'),
      '过渡台阶面必须复用既有 kind=ground（不得引入新 kind，否则消费方白名单会漏）',
    );
    const slotIds = new Set(transitions.map((w) => w.id.replace(/-transition-\d+$/, '')));
    assertEqual(slotIds.size, 21, `过渡台阶应覆盖 21 栋（t102 的 18 + t128 的 C 两栋 + t131 的 E-court3-hall；实际 ${slotIds.size}）`);
    // t113：把 +2 的**身份**也钉住（t108 注释曾把归属写成 t102）——
    //   +2 = t103 的门槛面，id 后缀 `-threshold`、kind='ground'、所属两座亭门殿 hasDoor=true
    const thresholds = LAYOUT.WALKABLE.filter((w) => /-threshold$/.test(w.id));
    assertEqual(thresholds.length, 2, `门槛面应为 2 条（t103；实际 ${thresholds.length}）`);
    assert(
      thresholds.every((w) => w.kind === 'ground'),
      '门槛面必须复用既有 kind=ground（不得引入新 kind）',
    );
    assertEqual(
      thresholds.map((w) => w.id).sort().join(','),
      'WK-B-pavilion-gate-east-threshold,WK-B-pavilion-gate-west-threshold',
      '两条门槛面应恰为 B 两座亭门殿（WK-B-pavilion-gate-{west,east}-threshold）',
    );
    for (const slotId of ['B-pavilion-gate-west', 'B-pavilion-gate-east']) {
      assertEqual(LAYOUT.SLOTS.find((sl) => sl.id === slotId)?.hasDoor, true, `${slotId} 应为可通行门殿（t103）`);
    }
    runner.info(`WALKABLE ${LAYOUT.WALKABLE.length} 条组成：${Object.entries(byKind).map(([k, n]) => `${k}:${n}`).join(' / ')}；transition ${transitions.length} 面 / ${slotIds.size} 栋；threshold ${thresholds.length} 面`);
  }
  assertEqual(grey.result.root.parent, null, 'root 未挂载（挂载归 main.js）');
  const transformOk = ['x', 'y', 'z'].every((k) => grey.result.root.position[k] === 0);
  assert(transformOk, 'root 必须保持单位变换');
});

await runner.test('缺失字段（root/buildings/colliders/viewpoints/update/dispose）逐条报错', async () => {
  const grey = await greyResult();
  for (const field of ['root', 'buildings', 'connectors', 'colliders', 'viewpoints', 'lightAnchors', 'update', 'dispose']) {
    const broken = { ...grey.result };
    delete broken[field];
    const { problems } = validateZoneResult('GREYBOX', broken, { THREE, scope: 'city' });
    assert(
      problems.some((p) => p.includes(field)),
      `删除 ${field} 必须报出缺字段，实际：${problems.join(' | ')}`,
    );
  }
});

await runner.test('错误数值被抓住：建筑 echo 不一致 / root 非单位变换 / fp-spawn 视线高错误 / 坡度超限', async () => {
  const grey = await greyResult();
  const base = grey.result;

  const wrongEcho = { ...base, buildings: base.buildings.map((b, i) => (i === 0 ? { ...b, x: b.x + 5 } : b)) };
  let { problems } = validateZoneResult('GREYBOX', wrongEcho, { THREE, scope: 'city' });
  assert(problems.some((p) => p.includes('x')), `建筑 x 回显错误必须报错：${problems[0]}`);

  const wrongRoot = { ...base, root: base.root.clone() };
  wrongRoot.root.position.set(1, 0, 0);
  ({ problems } = validateZoneResult('GREYBOX', wrongRoot, { THREE, scope: 'city' }));
  assert(problems.some((p) => p.includes('单位变换')), 'root 非单位变换必须报错');

  const badSpawn = {
    ...base,
    viewpoints: base.viewpoints.map((v) => (v.mode === 'fp-spawn' ? { ...v, position: { ...v.position, y: v.position.y + 3 } } : v)),
  };
  ({ problems } = validateZoneResult('GREYBOX', badSpawn, { THREE, scope: 'city' }));
  assert(problems.some((p) => p.includes('视高')), `fp-spawn 视线高错误必须报错：${problems.filter((p) => p.includes('fp-spawn')).join('|')}`);

  const badRamp = { ...base, colliders: { ...base.colliders, ramps: [{ ...base.colliders.ramps[0], slope: 0.95 }] } };
  ({ problems } = validateZoneResult('GREYBOX', badRamp, { THREE, scope: 'city' }));
  assert(problems.some((p) => p.includes('slope')), '坡度超限必须报错');

  const badRoof = { ...base, buildings: base.buildings.map((b, i) => (i === 0 ? { ...b, roofType: 'flat' } : b)) };
  ({ problems } = validateZoneResult('GREYBOX', notNull(badRoof), { THREE, scope: 'city' }));
  assert(problems.some((p) => p.includes('roofType')), '未知屋顶类型必须报错');

  const missingViewpoints = { ...base, viewpoints: base.viewpoints.filter((v) => v.mode !== 'fp-spawn') };
  ({ problems } = validateZoneResult('GREYBOX', missingViewpoints, { THREE, scope: 'city' }));
  assert(problems.some((p) => p.includes('fp-spawn')), '缺少 fp-spawn 必须报错');

  const notObject3D = { ...base, root: { notAThing: true } };
  ({ problems } = validateZoneResult('GREYBOX', notObject3D, { THREE, scope: 'city' }));
  assert(problems.some((p) => p.includes('Object3D')), 'root 不是 Object3D 必须报错');
});

function notNull(v) {
  return v;
}

await runner.test('assertZoneResult 抛 ZoneContractError 且带 problems 列表', async () => {
  const grey = await greyResult();
  const { assertZoneResult } = await loadModule('src/core/context.js');
  const broken = { ...grey.result };
  delete broken.update;
  const error = assertThrows(() => assertZoneResult('GREYBOX', broken, { THREE, scope: 'city' }));
  assert(error instanceof ZoneContractError, '错误类型应为 ZoneContractError');
  assert(error.problems.some((p) => p.includes('update')));
});

await runner.test('模板区域（_template）本身就是合约完整区域，可直接作为区域起点', async () => {
  const templateMod = await loadModule(zoneModulePath('TEMPLATE'));
  assertEqual(templateMod.ZONE_ID, 'TEMPLATE');
  for (const zoneId of ['B', 'C', 'D', 'E', 'F']) {
    const ctx = await makeTestCtx({ zoneId });
    const result = await templateMod.createZone(ctx);
    const { problems } = validateZoneResult(zoneId, result, {
      THREE,
      scope: 'zone',
      expectBuildings: zoneLayoutFor(zoneId).slots.length,
    });
    assertNoProblems(problems, `模板在区域 ${zoneId} 的契约`);
    assertEqual(result.buildings.length, zoneLayoutFor(zoneId).slots.length);
    result.update(0.016, 1, {});
    result.dispose();
  }
});

await runner.test('ctx 契约：字段齐备、rng 确定性、shared 结构、质量档与事件总线', async () => {
  const ctx = await makeTestCtx({ zoneId: 'B', quality: 'high' });
  for (const field of ['THREE', 'config', 'zoneLayout', 'kit', 'assets', 'rng', 'events', 'quality', 'shared']) {
    assert(field in ctx, `ctx 缺少 ${field}`);
  }
  assertEqual(ctx.quality, 'high');
  const a = rngForZone('B', 'trees');
  const b = rngForZone('B', 'trees');
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assertEqual(seqA.join(','), seqB.join(','), '同一 zone/salt 的 rng 必须可复现');
  const other = rngForZone('C', 'trees').next();
  assert(other !== seqA[0], '不同区域种子应不同');
  assert(ctx.rng.seed > 0);
  for (const key of ['materials', 'geometries', 'textures', 'disposeRegistry', 'water']) {
    assert(key in ctx.shared, `ctx.shared 缺少 ${key}`);
  }
  assertEqual(ctx.zoneLayout.id, 'B');
  assertEqual(ctx.zoneLayout.slots.length, zoneLayoutFor('B').slots.length);
  assertEqual(ctx.zoneLayout.neighbours.east, 'E', '邻居应几何推导（B 的东侧是 E）');
  assertEqual(ctx.zoneLayout.neighbours.west, 'D');
  assertEqual(ctx.zoneLayout.neighbours.north, 'C');
  assertEqual(ctx.zoneLayout.neighbours.south, 'F');
});

await runner.test('区域切片与 layout 完全一致（数值零偏差）', async () => {
  const { zoneLayoutConsistency } = await loadModule('src/core/layout-slice.js');
  for (const zoneId of ['B', 'C', 'D', 'E', 'F']) {
    assertNoProblems(zoneLayoutConsistency(zoneId), `切片 ${zoneId}`);
  }
  const city = cityLayout();
  assertEqual(city.slots.length, LAYOUT.SLOTS.length);
  assertEqual(city.connectors.length, LAYOUT.CONNECTORS.length);
  assertEqual(rampsFromRoads(LAYOUT.ROADS).length, LAYOUT.ROADS.filter((r) => Math.abs(r.from.y - r.to.y) > 1e-6).length);
});

/* ========================================================================== */
runner.section('8. 查询参数解析（?view=&preset=&ui=0&shot=1&stats=1）');
/* ========================================================================== */

await runner.test('parseQuery 支持时辰简写、ui/shot/stats/dpr/quality/greybox', async () => {
  const { parseQuery } = await loadModule('src/main.js');
  const q = parseQuery('?view=iso&preset=dusk&ui=0&shot=1&stats=1&dpr=1&quality=high&greybox=0&focus=B-hall-main');
  assertEqual(q.view, 'iso');
  assertEqual(q.preset, 'sunset');
  assertEqual(q.presetRaw, 'dusk');
  assertEqual(q.ui, false);
  assertEqual(q.shot, true);
  assertEqual(q.stats, true);
  assertEqual(q.dpr, 1);
  assertEqual(q.quality, 'high');
  assertEqual(q.greybox, false);
  assertEqual(q.focus, 'B-hall-main');
  const q2 = parseQuery('?preset=night');
  assertEqual(q2.preset, 'moonlitNight');
  assertEqual(q2.ui, true);
  assertEqual(q2.shot, false);
  const q3 = parseQuery('?preset=golden');
  assertEqual(q3.preset, 'goldenHour');
});

await runner.test('main.js 在 Node 内可被 import（只在浏览器里自动装配）', async () => {
  const mod = await loadModule('src/main.js');
  assertEqual(typeof mod.bootstrap, 'function');
  assertEqual(typeof mod.countRenderables, 'function');
  assertEqual(mod.default, mod.bootstrap);
});

/* ========================================================================== */
runner.section('t127：门洞净宽实测（probeDoorClearance 直读，替代"只比声明字段"）');
/* ========================================================================== */

await runner.test('t127：probeDoorClearance 语义 —— 无效 id ⇒ null、空串 ⇒ TypeError、无门槽位 ⇒ 0', () => {
  const { probeDoorClearance, probeDoorClearanceReport } = LAYOUT_SLICE;
  assertEqual(probeDoorClearance('Z-不存在-该建筑'), null, '无效 slotId 必须返回 null（不得静默当 0）');
  assertEqual(probeDoorClearanceReport('Z-不存在-该建筑').reason, 'unknown-slot');
  let threw = null;
  try {
    probeDoorClearance('');
  } catch (e) {
    threw = e.constructor.name;
  }
  assertEqual(threw, 'TypeError', '空 slotId 必须显式报错');
  const noDoorSlot = LAYOUT.SLOTS.find((sl) => !sl.hasDoor);
  assert(noDoorSlot, '应存在无门槽位（用于"无门 ⇒ 0"断言）');
  assertEqual(probeDoorClearance(noDoorSlot.id), 0, `无门槽位 ${noDoorSlot.id} 应返回 0`);
  assertEqual(probeDoorClearanceReport(noDoorSlot.id).reason, 'no-door');
  runner.info(`语义：无效=${probeDoorClearance('Z-不存在')}｜空串=TypeError｜无门(${noDoorSlot.id})=0 ✓`);
});

await runner.test('t127：全部有门槽位逐条实测 —— 声明 passable 与门洞净宽/接近阻挡必须一致（声明可被实测推翻）', () => {
  const { probeDoorClearanceReport } = LAYOUT_SLICE;
  const slots = LAYOUT.SLOTS.filter((sl) => sl.hasDoor);
  assert(slots.length >= 60, `有门槽位应 ≥60（实际 ${slots.length}）`);
  const mismatches = [];
  const rows = [];
  let passableCount = 0;
  let blockedCount = 0;
  for (const slot of slots) {
    const r = probeDoorClearanceReport(slot.id);
    const width = r.doorWidth ?? slot.door?.width ?? null;
    const need = width === null ? null : Math.max(1.1, width * 0.5);
    rows.push({ id: slot.id, width, declared: r.passable, band: r.clearWidth, need, blockedBy: r.blockedBy, resolved: r.declaredBlockerResolved, approachBlockedAt: r.approachBlockedAt });
    if (r.passable === true) {
      passableCount += 1;
      if (!(typeof r.clearWidth === 'number' && r.clearWidth >= need)) {
        mismatches.push(`${slot.id}: 声明可通行但实测净宽 ${r.clearWidth} < 阈值 ${need?.toFixed(2)}（width=${width}）`);
      }
    } else if (r.passable === false) {
      blockedCount += 1;
      // 声明"不可通行"必须**两边都成立**：门洞本体净宽 0 且声明的阻挡者在门外接近路径上真的挡
      if (r.clearWidth !== 0) mismatches.push(`${slot.id}: 声明不可通行但门洞净宽 ${r.clearWidth} ≠ 0`);
      if (!r.declaredBlockerResolved) mismatches.push(`${slot.id}: 声明的阻挡者 ${r.blockedBy} 在碰撞层里找不到`);
      if (r.approachBlockedAt === null) mismatches.push(`${slot.id}: 声明的阻挡者 ${r.blockedBy} 未在门外接近路径上实测到阻挡`);
    } else {
      mismatches.push(`${slot.id}: door.passable 未声明（应为布尔）`);
    }
  }
  assertEqual(mismatches.length, 0, `声明与实测必须一致，发现 ${mismatches.length} 例：${mismatches.slice(0, 5).join('；')}`);
  assertEqual(passableCount + blockedCount, slots.length, '每个有门槽位都应带布尔 passable 声明');
  assert(blockedCount >= 1, `应有 ≥1 个显式声明不可通行的门（实际 ${blockedCount}）`);
  const minBand = Math.min(...rows.map((r) => r.band));
  const maxBand = Math.max(...rows.map((r) => r.band));
  runner.info(`63 类逐条：可通行 ${passableCount} / 声明不可通行 ${blockedCount} / 共 ${slots.length}；净宽 ${minBand}–${maxBand}m`);
  for (const id of ['D-court3-pavilion', 'E-court3-pavilion', 'D-court4-pavilion', 'B-pavilion-gate-west']) {
    const r = rows.find((x) => x.id === id);
    runner.info(`  ${id.padEnd(22)} width=${r.width} passable=${r.declared} 净宽=${r.band} blockedBy=${r.blockedBy} 接近阻挡@${r.approachBlockedAt}`);
  }
});

/* ========================================================================== */

process.exit(runner.summary());
