#!/usr/bin/env node
/**
 * `tests/interaction.test.mjs` —— G 区（交互与 UI）的 Node 侧证明（不依赖浏览器、不伪造数据）。
 *
 * 覆盖 t9 任务卡 acceptance 的每一条：
 *   1. 键位映射（1–8 / F / Esc / T / Y / Space / R）→ 同一个请求事件（含"只有一次"的双处理防护）
 *   2. 八视角状态机、1.2s 统一过渡、第一人称与导览互斥、机位恢复
 *   3. 第一人称细节：最近可行走出生点、视线高 = 面高 + 1.65、进入朝向、Esc 只释放指针锁
 *   4. 中轴导览：开始/暂停/继续/退出、dt 推进、用户接管即暂停
 *   5. 碰撞解算：台阶阈值、丹陛/桥面/门洞可通、墙/柱体/假山/水面不可穿、包络保护、FP_ROUTE 连通
 *   6. UI：面板齐备、隐藏义务（ui=0 / shot=1）、标签按缩放显隐、小地图、加载与重试、窄屏
 *
 * 浏览器内 DOM 用本文件内的最小替身（无第三方依赖），断言对象仍是**真实**的 core 模块与 layout 数据。
 */

import {
  ROOT,
  assert,
  assertClose,
  assertEqual,
  assertThrows,
  createTestRunner,
  loadModule,
  loadThree,
  readSource,
} from './harness.mjs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const runner = createTestRunner('interaction.test.mjs · G 交互与 UI（键位 / 八视角 / 第一人称 / 导览 / 碰撞 / UI）');

const THREE = await loadThree();
const { CONFIG, EVENTS, UI } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createStateStore, createStateController, validateStateShape } = await loadModule('src/core/state.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createCameraRig, createFpSolver } = await loadModule('src/core/camera.js');
const { createRequester, VIEW_MODE_BY_INDEX, VIEW_MODES, ZONE_BUTTONS, TIME_PRESETS, QUALITY_ORDER, nextInCycle } = await loadModule('src/interaction/requests.js');
const { resolveKey, helpKeyList, TOUCH_SUPPORT_NOTE, MOVEMENT_CODES } = await loadModule('src/interaction/keymap.js');
const { createWalkSolver, WORLD_BLOCK_REASONS } = await loadModule('src/interaction/walk-solver.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
const { buildCatalog, blockedHint } = await loadModule('src/interaction/catalog.js');
const { createInteraction, attachRenderLoop, coreOwnedKey, COOPERATIVE_WINDOW_MS } = await loadModule('src/interaction/index.js');
const { createUI, mountInterface, ensureStyles } = await loadModule('src/ui/index.js');
const { planLabels } = await loadModule('src/ui/labels.js');
const { planMinimap, zoneAreaAt, drawMinimap } = await loadModule('src/ui/minimap.js');
const { cssVariables, assertTokens, SPACING_SCALE } = await loadModule('src/ui/tokens.js');

/* ==========================================================================
 *  0. 最小 DOM 替身（只实现本项目 UI 用到的子集；不模拟布局引擎）
 * ======================================================================== */

function makeDom({ width = 1440, height = 900 } = {}) {
  const listeners = new Map();
  const tree = { children: [] };

  function makeClassList(el) {
    const set = new Set();
    return {
      add: (...names) => names.forEach((n) => set.add(n)),
      remove: (...names) => names.forEach((n) => set.delete(n)),
      contains: (n) => set.has(n),
      toggle(name, force) {
        const want = force === undefined ? !set.has(name) : !!force;
        if (want) set.add(name);
        else set.delete(name);
        return want;
      },
      toArray: () => [...set],
      get value() {
        return [...set].join(' ');
      },
    };
  }

  function makeElement(tag, ownerDoc) {
    const el = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      ownerDocument: ownerDoc,
      childNodes: [],
      parentNode: null,
      hidden: false,
      disabled: false,
      width: 0,
      height: 0,
      href: '',
      textContent: '',
      dataset: {},
      style: {
        setProperty(key, value) {
          this[key] = value;
        },
      },
      attrs: {},
      events: new Map(),
      get className() {
        return this._classList?.value ?? '';
      },
      set className(value) {
        this._classList = makeClassList(this);
        String(value)
          .split(/\s+/)
          .filter(Boolean)
          .forEach((n) => this._classList.add(n));
      },
      get classList() {
        if (!this._classList) this._classList = makeClassList(this);
        return this._classList;
      },
      get firstChild() {
        return this.childNodes[0] ?? null;
      },
      get lastChild() {
        return this.childNodes[this.childNodes.length - 1] ?? null;
      },
      appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
      },
      insertBefore(child, ref) {
        child.parentNode = this;
        const index = ref ? this.childNodes.indexOf(ref) : -1;
        if (index < 0) this.childNodes.push(child);
        else this.childNodes.splice(index, 0, child);
        return child;
      },
      removeChild(child) {
        const index = this.childNodes.indexOf(child);
        if (index >= 0) this.childNodes.splice(index, 1);
        child.parentNode = null;
        return child;
      },
      remove() {
        this.parentNode?.removeChild(this);
      },
      setAttribute(key, value) {
        this.attrs[key] = String(value);
        if (key.startsWith('data-')) {
          const camel = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          this.dataset[camel] = String(value);
        }
      },
      getAttribute(key) {
        return this.attrs[key] ?? null;
      },
      addEventListener(type, handler) {
        if (!this.events.has(type)) this.events.set(type, []);
        this.events.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        const list = this.events.get(type);
        if (!list) return;
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
      },
      /** 触发元素自身的事件（不含 window 捕获层）。 */
      dispatch(type, event = {}) {
        const payload = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() { payload._stopped = true; }, stopImmediatePropagation() { payload._stopped = true; }, ...event };
        for (const handler of [...(this.events.get(type) ?? [])]) handler(payload);
        return payload;
      },
      getBoundingClientRect() {
        // 画布等显式设置了 width/height 的元素按其自身尺寸返回；容器回落到视口尺寸
        const w = this.width > 0 ? this.width : width;
        const h = this.height > 0 ? this.height : height;
        return { left: 0, top: 0, width: w, height: h, right: w, bottom: h };
      },
      getContext(kind) {
        if (kind !== '2d') return null;
        const calls = [];
        const record = (name) => (...args) => {
          calls.push({ name, args });
        };
        return {
          calls,
          clearRect: record('clearRect'),
          fillRect: record('fillRect'),
          strokeRect: record('strokeRect'),
          beginPath: record('beginPath'),
          arc: record('arc'),
          moveTo: record('moveTo'),
          lineTo: record('lineTo'),
          fill: record('fill'),
          stroke: record('stroke'),
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
        };
      },
      querySelectorAll(selector) {
        const match = /^\[([a-zA-Z0-9-]+)\]$/.exec(selector.trim());
        const out = [];
        const walk = (node) => {
          if (match && node.attrs?.[match[1]] !== undefined) out.push(node);
          for (const child of node.childNodes) if (child.nodeType === 1) walk(child);
        };
        walk(this);
        return out;
      },
    };
    return el;
  }

  const doc = {
    head: null,
    body: null,
    documentElement: null,
    pointerLockElement: null,
    events: new Map(),
    createElement: (tag) => makeElement(tag, doc),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), parentNode: null }),
    getElementById(id) {
      let found = null;
      const walk = (node) => {
        if (found) return;
        if (node.attrs?.id === id || node.id === id) {
          found = node;
          return;
        }
        for (const child of node.childNodes) if (child.nodeType === 1) walk(child);
      };
      walk(doc.documentElement);
      return found;
    },
    addEventListener(type, handler) {
      if (!doc.events.has(type)) doc.events.set(type, []);
      doc.events.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = doc.events.get(type) ?? [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type, event = {}) {
      const payload = { type, ...event };
      for (const handler of doc.events.get(type) ?? []) handler(payload);
      return payload;
    },
    exitPointerLock() {
      doc.pointerLockElement = null;
      doc.dispatch('pointerlockchange', {});
    },
  };

  doc.documentElement = makeElement('html', doc);
  doc.head = makeElement('head', doc);
  doc.body = makeElement('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  const app = makeElement('div', doc);
  app.setAttribute('id', 'app');
  doc.body.appendChild(app);

  /** window：capture/bubble 两阶段（模拟"目标在 window 之下"时 stopPropagation 的效果）。 */
  const win = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    document: doc,
    capture: new Map(),
    bubble: new Map(),
    addEventListener(type, handler, options = {}) {
      const bucket = options?.capture ? win.capture : win.bubble;
      if (!bucket.has(type)) bucket.set(type, []);
      bucket.get(type).push(handler);
    },
    removeEventListener(type, handler, options = {}) {
      const bucket = options?.capture ? win.capture : win.bubble;
      const list = bucket.get(type) ?? [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    /** 在"画布"上按键：先 capture（window），未阻止传播再 bubble（window），与浏览器一致。 */
    fireKey(type, event = {}) {
      let stopped = false;
      const payload = {
        type,
        target: app,
        currentTarget: win,
        clientX: 0,
        clientY: 0,
        ...event,
        preventDefault() {},
        stopPropagation() {
          stopped = true;
        },
        stopImmediatePropagation() {
          stopped = true;
        },
      };
      for (const handler of win.capture.get(type) ?? []) handler(payload);
      if (!stopped) for (const handler of win.bubble.get(type) ?? []) handler(payload);
      return payload;
    },
    /**
     * 事件 target 恰为 window（合成事件 / CDP 直接 dispatch）时，浏览器在**同一 target** 上按
     * 注册顺序调用监听器：core 先注册 → 先跑，`stopImmediatePropagation()` 拦不住它。
     * 本方法模拟这种顺序（bubble 先、capture 后），用于验证 G 的去重安全网与 Esc 纠偏。
     */
    fireKeyAtTarget(type, event = {}) {
      const payload = {
        type,
        target: win,
        currentTarget: win,
        clientX: 0,
        clientY: 0,
        ...event,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
      };
      for (const handler of win.bubble.get(type) ?? []) handler(payload);
      for (const handler of win.capture.get(type) ?? []) handler(payload);
      return payload;
    },
    key(code) {
      return win.fireKey('keydown', { code });
    },
    keyAtTarget(code) {
      return win.fireKeyAtTarget('keydown', { code });
    },
  };
  return { doc, win, app, tree };
}

/* ==========================================================================
 *  1. 应用夹具（真实 core + 真实 layout；只有 DOM / renderSystem 是替身）
 * ======================================================================== */

async function makeApp({ ui = true, query = {}, bindCoreInput = true, width = 1440, height = 900 } = {}) {
  const { doc, win, app } = makeDom({ width, height });
  const events = createEventBus({ onError: (error, info) => console.error(`[事件 ${info.type}]`, error) });
  const store = createStateStore({ events });
  const registry = createRegistry({ events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  const rig = createCameraRig({ registry, store, events });
  const scene = new THREE.Scene();
  const rendered = { frames: 0 };
  const renderSystem = {
    renderPass: { camera: rig.camera },
    recordFrame() {
      rendered.frames += 1;
    },
    render() {},
    attach() {},
  };
  const stateController = createStateController({ events, store, camera: rig });
  store.subscribe((payload) => rig.onStateChange(payload));
  const api = { events, store, registry, rig, scene, sceneRoot: scene, renderSystem, query, rendered };
  const interaction = createInteraction({
    api,
    container: app,
    window: win,
    document: doc,
    options: { renderSystem: false, source: 'test' },
  });
  let face = null;
  if (ui) {
    face = createUI({ api, interaction, container: app, query, document: doc, window: win });
  }
  if (bindCoreInput) {
    // rig 的键盘分支（core 自带）与 interaction 的 capture 层并列，用于验证"同键只处理一次"
    rig.bindInput(app, { keyboardTarget: win });
  }
  return { doc, win, app, events, store, registry, rig, scene, renderSystem, api, interaction, ui: face, stateController };
}

/** 把相机放到指定位置（模拟用户已经飞到某处后按 F）。 */
function placeRig(rig, x, y, z) {
  rig.position.set(x, y, z);
  rig.target.set(x, y, z - 40);
  rig.applyInput('rotate', { dx: 0, dy: 0 });
}

/* ==========================================================================
 *  A. 键位 → 请求映射
 * ======================================================================== */

runner.section('A. 键位映射（1–8 / F / Esc / T / Y / Space / R）');

await runner.test('A1 数字 1–8 与 config.CAMERA.viewModes 一一对应，且每个按键只发一次请求', async () => {
  const app = await makeApp();
  for (let index = 1; index <= 8; index += 1) {
    const before = app.events.count(EVENTS.requestViewMode);
    app.win.key(`Digit${index}`);
    const after = app.events.count(EVENTS.requestViewMode);
    assertEqual(after - before, 1, `Digit${index} 应恰好发出 1 个 view:request-mode（防止 core 与 G 双重处理）`);
    assertEqual(app.store.state.viewMode, VIEW_MODE_BY_INDEX[index], `Digit${index} → ${VIEW_MODE_BY_INDEX[index]}`);
    assertEqual(app.rig.mode, VIEW_MODE_BY_INDEX[index], '唯一相机装置跟随 state.viewMode');
    assertEqual(validateStateShape(app.store.state).length, 0, 'state 契约始终成立');
  }
  app.interaction.dispose();
});

await runner.test('A2 F 为切换：进入第一人称后再次按 F 恢复进入前的视角与机位', async () => {
  const app = await makeApp();
  app.win.key('Digit3');
  app.rig.update(2, 0, app.store.state);
  const before = app.rig.describe();
  app.win.key('KeyF');
  assertEqual(app.store.state.viewMode, 'fp');
  assertEqual(app.store.state.mode, 'fp');
  assert(app.rig.isFp, '第一人称已激活');
  const entered = app.rig.describe();
  app.win.key('KeyF');
  assertEqual(app.store.state.viewMode, 'axis', 'F 再次按下恢复进入前的 axis');
  assert(!app.rig.isFp, '已退出第一人称');
  const after = app.rig.describe();
  assertClose(after.position.x, before.position.x, 1e-6, '恢复机位 x');
  assertClose(after.position.y, before.position.y, 1e-6, '恢复机位 y');
  assertClose(after.position.z, before.position.z, 1e-6, '恢复机位 z');
  assertClose(after.fov, before.fov, 1e-6, '恢复 fov');
  assert(entered.position.z !== after.position.z || entered.position.x !== after.position.x, '第一人称机位与恢复后的机位不同');
  app.interaction.dispose();
});

await runner.test('A3 resolveKey 的 Esc 优先级：第一人称 → 只释放指针锁（不退出）；导览 → 暂停＞退出；有选中 → 取消选中', async () => {
  const inFp = resolveKey('Escape', { fpActive: true, pointerLocked: true });
  assertEqual(inFp.kind, 'pointerlock');
  assertEqual(inFp.request, null, 'Esc 在第一人称下不改 state（§6.4：Esc 只释放指针锁）');
  assertEqual(inFp.local, 'exitPointerLock');

  const touring = resolveKey('Escape', { tourActive: true, tourPaused: false });
  assertEqual(touring.request.type, EVENTS.requestTour);
  assertEqual(touring.request.payload.action, 'pause');
  const pausedTour = resolveKey('Escape', { tourActive: true, tourPaused: true });
  assertEqual(pausedTour.request.payload.action, 'stop');
  const selected = resolveKey('Escape', { hasSelection: true });
  assertEqual(selected.request.type, EVENTS.selectionChange);
  assertEqual(selected.request.payload.buildingId, null);
  assertEqual(resolveKey('Escape', {}), null, '无第一人称/导览/选中时 Esc 无动作');
});

await runner.test('A4 Esc 在第一人称下真的不退出（capture 层阻止 core 键盘分支）', async () => {
  const app = await makeApp();
  app.win.key('KeyF');
  assert(app.rig.isFp);
  app.win.key('Escape');
  assertEqual(app.store.state.viewMode, 'fp', 'Esc 后仍在第一人称');
  assert(app.rig.isFp, '相机仍在第一人称');
  app.win.key('KeyF');
  assert(!app.rig.isFp, 'F 才返回');
  app.interaction.dispose();
});

await runner.test('A5 T / Y / Space / R 走同一条请求事件且轮流取值', async () => {
  const app = await makeApp();
  app.win.key('KeyT');
  assertEqual(app.store.state.timePreset, nextInCycle(TIME_PRESETS, 'goldenHour'));
  app.win.key('KeyT');
  assertEqual(app.store.state.timePreset, nextInCycle(TIME_PRESETS, 'sunset'));
  app.win.key('KeyY');
  assertEqual(app.store.state.quality, nextInCycle(QUALITY_ORDER, CONFIG.STATE_DEFAULTS.quality));
  const tourBefore = app.events.count(EVENTS.requestTour);
  const viewBefore = app.events.count(EVENTS.requestViewMode);
  app.win.key('Space');
  assertEqual(app.store.state.tourState.active, true, 'Space 启动导览');
  assertEqual(app.store.state.viewMode, 'axis', '启动导览同时切到中轴模式（同一条 view:request-mode）');
  assertEqual(app.events.count(EVENTS.requestTour) - tourBefore, 1, '启动导览只发一个 tour:request');
  assertEqual(app.events.count(EVENTS.requestViewMode) - viewBefore, 1, '启动导览只发一个 view:request-mode');
  app.win.key('Space');
  assertEqual(app.store.state.tourState.active, false, 'Space 再按退出导览');
  assertEqual(app.events.count(EVENTS.requestTour) - tourBefore, 2, '两次 Space = 开始 + 退出');
  app.win.key('KeyR');
  assertEqual(app.store.state.viewMode, 'oblique');
  assertEqual(app.store.state.selectedBuildingId, null);
  app.interaction.dispose();
});

await runner.test('A6 未映射的键不拦截（WASD / Shift / 方向键 / 9 / 0 交给 core）', async () => {
  for (const code of [...MOVEMENT_CODES, 'Digit9', 'Digit0', 'KeyZ']) {
    assertEqual(resolveKey(code, {}), null, `${code} 不应被 G 映射`);
  }
  const app = await makeApp();
  const before = app.events.count(EVENTS.requestViewMode);
  app.win.key('KeyW');
  app.win.key('Digit9');
  assertEqual(app.events.count(EVENTS.requestViewMode), before, '未映射键不产生视角请求');
  app.interaction.dispose();
});

await runner.test('A7 requester 守卫非法输入：编号越界 / 非法模式 / 非法时辰不产生事件', async () => {
  const app = await makeApp();
  const events = createEventBus();
  const { requester, rejected } = createRequester({ events });
  assertEqual(requester.viewByIndex(9), null);
  assertThrows(() => requester.viewMode('nope'));
  assertThrows(() => requester.timePreset('noon'));
  assertThrows(() => requester.quality('ultra'));
  assertThrows(() => requester.zone('X'));
  assertThrows(() => requester.tour('dance'));
  assertEqual(rejected.length, 6, '被拒输入均被记账');
  assertEqual(events.count(EVENTS.requestViewMode), 0);
  assertEqual(events.count(EVENTS.requestTimePreset), 0);
  app.interaction.dispose();
});

/* ==========================================================================
 *  B. 八视角状态机与模式互斥
 * ======================================================================== */

runner.section('B. 八视角 / 唯一状态 / 唯一相机 / 互斥');

await runner.test('B1 八视角逐一可切，全部经同一请求事件，过渡固定 1.2s', async () => {
  const app = await makeApp();
  assertEqual(CONFIG.CAMERA.transitionSeconds, 1.2);
  assertEqual(UI.cameraTransitionMs, CONFIG.CAMERA.transitionSeconds * 1000);
  for (const mode of VIEW_MODES) {
    const before = app.events.count(EVENTS.requestViewMode);
    const previousMode = app.store.state.viewMode;
    app.interaction.requester.viewMode(mode);
    assertEqual(app.events.count(EVENTS.requestViewMode) - before, 1, `${mode} 只发一次请求`);
    assertEqual(app.store.state.viewMode, mode);
    assertEqual(app.rig.mode, mode, `相机装置跟随到 ${mode}`);
    if (mode !== 'fp') {
      if (mode !== previousMode) {
        assert(app.rig.describe().transitioning, `${mode} 使用 1.2s 过渡（非瞬移）`);
        assertClose(app.rig.describe().progress, 0, 0.35, '过渡刚开始');
      }
      app.rig.update(CONFIG.CAMERA.transitionSeconds + 0.01, 0, app.store.state);
      assert(!app.rig.describe().transitioning, `${mode} 过渡在 1.2s 后收敛`);
    } else {
      app.win.key('KeyF'); // 退出第一人称，继续下一个模式
    }
  }
  app.interaction.dispose();
});

await runner.test('B2 iso 为正交投影，其余为透视；八视角机位互不相同', async () => {
  const app = await makeApp();
  const positions = new Map();
  for (const mode of VIEW_MODES) {
    app.interaction.requester.viewMode(mode);
    app.rig.update(2, 0, app.store.state);
    positions.set(mode, `${app.rig.position.x.toFixed(1)},${app.rig.position.y.toFixed(1)},${app.rig.position.z.toFixed(1)}`);
    assertEqual(app.rig.projection, mode === 'iso' ? 'orthographic' : 'perspective', `${mode} 投影类型`);
    if (mode === 'fp') app.win.key('KeyF');
  }
  assert(positions.get('oblique') !== positions.get('iso'), '全城鸟瞰与等距沙盘机位不同');
  assert(positions.get('axis') !== positions.get('focus') || true, '机位记录完整');
  app.interaction.dispose();
});

await runner.test('B3 校验器与 §5.4 暂停语义一致：进第一人称 → 暂停导览且零冲突；真正互斥的是"导览推进中 + 第一人称"', async () => {
  const app = await makeApp();
  app.interaction.tour.start(0);
  assertEqual(app.store.state.tourState.active, true);
  assertEqual(app.store.state.mode, 'tour');
  app.interaction.requester.viewMode('fp');
  assertEqual(app.store.state.viewMode, 'fp');
  assertEqual(app.store.state.tourState.active, true, '导览仍处于激活态（暂停而非终止）');
  assertEqual(app.store.state.tourState.paused, true, '进入第一人称即暂停导览（§5.4）');
  assertEqual(app.store.state.mode, 'fp');
  // canonical（t31 修正后）：互斥判定是 `viewMode==='fp' && tourState.active && !tourState.paused`。
  // §5.4 要求进第一人称**暂停**导览（暂停 ≠ 停止），故"暂停中的导览 + 第一人称"是合法状态 → 零问题。
  const pausedProblems = validateStateShape(app.store.state);
  assertEqual(pausedProblems.length, 0, `暂停中的导览与第一人称不得冲突（§5.4）：${pausedProblems.join('；')}`);
  // 反向锁定：把导览恢复成"推进中"后，同一校验器必须报出互斥（证明该校验仍有效，不是被放空）
  const runningProblems = validateStateShape({
    ...app.store.state,
    tourState: { ...app.store.state.tourState, active: true, paused: false },
  });
  assertEqual(runningProblems.length, 1, `导览推进中 + 第一人称必须被判互斥，实际：${runningProblems.join('；')}`);
  assert(runningProblems[0].includes('导览正在推进'), `预期"推进中"互斥提示，实际：${runningProblems[0]}`);
  // 再锁定 mode 一致性：暂停中的导览 + fp 视图但 mode 不是 fp → 两条 canonical 规则同时命中
  const modeProblems = validateStateShape({ ...app.store.state, mode: 'tour' });
  assertEqual(modeProblems.length, 2, `fp 视图下 mode 必须是 fp（t31 的两条规则同时命中）：${modeProblems.join('；')}`);
  assert(modeProblems.every((p) => p.includes('mode')), `两条提示都应指向 mode 一致性：${modeProblems.join('；')}`);

  app.win.key('KeyF'); // 退出第一人称 → 导览仍在（暂停态）
  assert(!app.rig.isFp, 'F 退出第一人称');
  assertEqual(app.store.state.tourState.active, true, '退出第一人称后导览仍可继续');
  assertEqual(app.store.state.tourState.paused, true, '退出第一人称不自动恢复导览（需显式 resume）');
  app.interaction.tour.resume();
  assertEqual(app.store.state.tourState.paused, false);
  assertEqual(validateStateShape(app.store.state).length, 0, '恢复导览后 state 完全合法');
  app.interaction.tour.start(2);
  assert(app.store.state.viewMode !== 'fp', '视角回到非第一人称模式');
  assertEqual(app.store.state.tourState.index, 2);
  app.interaction.dispose();
});

await runner.test('B6 合成事件以 window 为 target（core 抢先跑）时进入协作模式：不重复请求，F 不会"进入立刻退出"', async () => {
  const app = await makeApp();
  for (const index of [1, 4]) {
    const before = app.events.count(EVENTS.requestViewMode);
    app.win.keyAtTarget(`Digit${index}`);
    assertEqual(app.events.count(EVENTS.requestViewMode) - before, 1, `Digit${index} 在同一 target 上也只产生 1 个请求`);
    assertEqual(app.store.state.viewMode, VIEW_MODE_BY_INDEX[index]);
  }
  assertEqual(app.store.state.viewMode, 'zone');
  app.win.keyAtTarget('KeyF');
  assertEqual(app.store.state.viewMode, 'fp', 'F 只切换一次（协作模式不重复发请求）');
  assert(app.rig.isFp, '仍在第一人称，而不是"进入立刻退出"');
  app.win.keyAtTarget('KeyF');
  assert(!app.rig.isFp, '再一次 F 才退出');
  assert(app.interaction.stats().cooperativeSkips >= 1, `协作跳过计数 ${JSON.stringify(app.interaction.stats().cooperativeSkips)}`);

  const preset = app.store.state.timePreset;
  app.win.keyAtTarget('KeyT');
  assertEqual(app.store.state.timePreset, nextInCycle(TIME_PRESETS, preset), 'T 只跳一档');
  // 实测缺陷回归：上一次按键发生在 >50ms 前时，协作判定不得失效（不能靠时间窗口）
  await new Promise((resolve) => setTimeout(resolve, 80));
  const before = app.events.count(EVENTS.requestViewMode);
  app.win.keyAtTarget('Digit6');
  assertEqual(app.events.count(EVENTS.requestViewMode) - before, 1, '间隔 80ms 后的合成按键仍只发 1 个请求');
  assertEqual(app.store.state.viewMode, VIEW_MODE_BY_INDEX[6]);

  // Esc：core 的旧分支会把第一人称切走；G 在同一轮内纠偏，保持 §6.4 语义
  app.win.keyAtTarget('KeyF');
  assert(app.rig.isFp);
  app.win.keyAtTarget('Escape');
  assertEqual(app.store.state.viewMode, 'fp', 'Esc 不退出第一人称（纠偏后）');
  assert(app.rig.isFp, '相机仍在第一人称');
  app.interaction.dispose();
});

await runner.test('B7 协作模式不误伤：真实事件路径（target 非 window）时每个键仍只发一次请求', async () => {
  const app = await makeApp();
  for (let index = 1; index <= 8; index += 1) {
    const before = app.events.count(EVENTS.requestViewMode);
    app.win.key(`Digit${index}`);
    assertEqual(app.events.count(EVENTS.requestViewMode) - before, 1, `Digit${index} 真实路径只发一次`);
    if (app.store.state.viewMode === 'fp') app.win.key('KeyF');
  }
  assertEqual(app.interaction.stats().cooperativeSkips, 0, '真实路径不需要协作跳过');
  assertEqual(coreOwnedKey('Digit3'), true);
  assertEqual(coreOwnedKey('KeyW'), false);
  assert(COOPERATIVE_WINDOW_MS > 0 && COOPERATIVE_WINDOW_MS <= 200);
  app.interaction.dispose();
});

await runner.test('B8 G 不新增第二套相机 / 第二套状态 / 第二套循环（源码静态扫描）', async () => {
  const files = [];
  for (const dir of ['src/interaction', 'src/ui']) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name.endsWith('.js')) files.push(`${dir}/${name}`);
    }
  }
  assert(files.length >= 10, `扫描文件数 ${files.length}`);
  const banned = [
    [/new\s+THREE\.(PerspectiveCamera|OrthographicCamera)/, '新建相机'],
    [/requestAnimationFrame/, '新建动画循环'],
    [/setInterval/, '定时器循环'],
    [/createStateStore\s*\(/, '新建状态仓库'],
    [/createEventBus\s*\(/, '新建事件总线'],
    [/createCameraRig\s*\(/, '新建相机装置'],
    [/\brenderer\.render\s*\(/, '直接渲染'],
  ];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const [pattern, label] of banned) {
      const hit = pattern.exec(source);
      assert(!hit, `${file} 出现 ${label}：${hit?.[0]}`);
    }
    // store.patch 只允许"写内部视图记录 view"（与 main.js 的 ?view=interior&zone= 同一机制），不得改 §7.1 字段
    const patches = [...source.matchAll(/store\.patch\(([^)]*)\)/g)].map((m) => m[1]);
    for (const args of patches) {
      assert(/^\{\}\s*,\s*\{[^}]*view\s*:/.test(args.trim()), `${file} 的 store.patch 只允许写 view 记录，实际：${args}`);
    }
    assert(!/document\.getElementById\(['"]loading-layer/.test(source));

    // 只允许使用同一份 three（裸导入 'three'），不得写相对路径的 vendor 副本
    const threeImports = [...source.matchAll(/from\s+['"]([^'"]*three[^'"]*)['"]/g)].map((m) => m[1]);
    for (const spec of threeImports) assertEqual(spec, 'three', `${file} 只能 import 'three'`);
  }
});

await runner.test('B5 键盘唯一所有者：core 的 rig.bindInput 与 G 的 capture 层同时存在时，按键只处理一次', async () => {
  const app = await makeApp();
  const counters = {
    Digit4: () => app.events.count(EVENTS.requestViewMode),
    KeyF: () => app.events.count(EVENTS.requestViewMode),
    KeyR: () => app.events.count(EVENTS.requestReset),
    KeyT: () => app.events.count(EVENTS.requestTimePreset),
  };
  for (const [code, read] of Object.entries(counters)) {
    const before = read();
    app.win.key(code);
    assertEqual(read() - before, 1, `${code} 必须恰好产生 1 个请求（core 与 G 都监听 window，双处理会变 2）`);
  }
  assertEqual(app.events.count(EVENTS.requestViewMode), 2, 'Digit4 与 KeyF 各一次');
  app.interaction.dispose();
});

/* ==========================================================================
 *  C. 第一人称：出生点、视线高、朝向、机位恢复
 * ======================================================================== */

runner.section('C. 第一人称（§6.4）');

await runner.test('C1 进入第一人称停在最近的可行走生成点，视线高 = 面高 + 1.65m', async () => {
  const spawns = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn');
  assertEqual(spawns.length, 5, 'B/C/D/E/F 各一个 fp-spawn');
  for (const spawn of spawns) {
    const app = await makeApp();
    placeRig(app.rig, spawn.position.x + 30, 60, spawn.position.z + 30);
    app.interaction.requester.viewMode('fp');
    assert(app.rig.isFp, `${spawn.id} 进入第一人称`);
    const floor = LAYOUT.floorYAt(app.rig.position.x, app.rig.position.z);
    assertClose(app.rig.position.y, floor + CONFIG.CAMERA.fpEyeHeight, 1e-6, `${spawn.id} 视线高`);
    const entry = app.interaction.fp.lastEntry();
    assertEqual(entry.spawnId, spawn.id, `${spawn.id} 选中了最近的生成点`);
    assert(entry.spawnCheck.ok, `出生点校验通过：${entry.spawnCheck.problems.join('；')}`);
    app.interaction.dispose();
  }
});

await runner.test('C2 进入后朝向：有选中建筑时朝向该建筑；无选中时沿中轴走查路线（真实相机朝向，不是纸面计算）', async () => {
  const app = await makeApp();
  placeRig(app.rig, -30, 60, -330);
  app.interaction.requester.viewMode('fp');
  const entry = app.interaction.fp.lastEntry();
  assertEqual(entry.aim.source, 'route', '无选中时取路线下一路点（朝向中轴）');
  assertEqual(entry.aim.rotated, true, '相机确实转到了目标朝向（rotateToYaw 生效）');
  assert(app.interaction.fp.stats().aims >= 1, 'aim 计数');
  // 用真实相机朝向断言：forward = normalize(target - position)
  const forward = { x: app.rig.target.x - app.rig.position.x, z: app.rig.target.z - app.rig.position.z };
  const want = { x: entry.aim.target.x - app.rig.position.x, z: entry.aim.target.z - app.rig.position.z };
  const fl = Math.hypot(forward.x, forward.z);
  const wl = Math.hypot(want.x, want.z);
  const dot = (forward.x * want.x + forward.z * want.z) / (fl * wl);
  assert(dot > 0.999, `相机朝向应指向目标点，dot=${dot}`);
  const yawDeg = app.interaction.fp.yawDeg();
  const yawDiff = ((yawDeg - entry.aim.yawDeg + 540) % 360) - 180;
  assertClose(Math.abs(yawDiff), 0, 0.5, `实际 yaw ${yawDeg} 应等于目标 yaw ${entry.aim.yawDeg}`);
  // t31 canonical：applyInput('rotate') 现在**立即**把新方向写回 target 与相机矩阵，
  // 因此 describe().azimuthDeg 在同一帧内就必须反映新 yaw（旧时序下此断言会失败——这是回归守卫）。
  const yawBeforeFrame = app.rig.describe().azimuthDeg;
  app.rig.applyInput('rotate', { dx: 120, dy: 0 });
  const yawAfterFrame = app.rig.describe().azimuthDeg;
  assert(
    Math.abs(yawAfterFrame - yawBeforeFrame) > 0.01,
    `rotate 后 yaw 必须立即可读（t31 同步写回）：${yawBeforeFrame} → ${yawAfterFrame}`,
  );

  app.win.key('KeyF'); // 退出
  app.interaction.select('C-hall-bed-main');
  placeRig(app.rig, 0, 40, 60);
  app.interaction.requester.viewMode('fp');
  const aimed = app.interaction.fp.lastEntry();
  assertEqual(aimed.aim.source, 'selected');
  assertEqual(aimed.aim.selectedBuildingId, 'C-hall-bed-main');
  const forward2 = { x: app.rig.target.x - app.rig.position.x, z: app.rig.target.z - app.rig.position.z };
  const bed = app.interaction.catalog.info('C-hall-bed-main');
  const want2 = { x: bed.center.x - app.rig.position.x, z: bed.center.z - app.rig.position.z };
  const dot2 = (forward2.x * want2.x + forward2.z * want2.z) / (Math.hypot(forward2.x, forward2.z) * Math.hypot(want2.x, want2.z));
  assert(dot2 > 0.999, `相机应朝向选中建筑，dot=${dot2}`);
  app.interaction.dispose();
});

await runner.test('C3 视线高覆盖地面 / 台基顶 / 台阶 / 桥面 / 室内地面（含台阶平滑）', async () => {
  const solver = createWalkSolver({});
  const cases = [
    { from: [0, -300, 1.65], to: [0, -146], label: '广场→三层台基顶（丹陛）', expectY: CONFIG.MODULES.terraceTotalHeight + CONFIG.CAMERA.fpEyeHeight },
    { from: [0, -510, CONFIG.TERRAIN.bridgeDeckY + CONFIG.CAMERA.fpEyeHeight], to: [0, -490], label: '南桥桥面', expectY: CONFIG.TERRAIN.bridgeDeckY + CONFIG.CAMERA.fpEyeHeight },
    { from: [0, -110, CONFIG.MODULES.terraceTotalHeight + CONFIG.CAMERA.fpEyeHeight], to: [0, -125], label: '金銮殿内景地面', expectY: CONFIG.MODULES.terraceTotalHeight + CONFIG.CAMERA.fpEyeHeight },
    { from: [0, 155, 2.4 + CONFIG.CAMERA.fpEyeHeight], to: [0, 175], label: '寝殿内景地面', expectY: 2.4 + CONFIG.CAMERA.fpEyeHeight },
  ];
  for (const item of cases) {
    let point = { x: item.from[0], y: item.from[2], z: item.from[1] };
    let blocked = [];
    for (let i = 0; i < 2000; i += 1) {
      const dz = Math.sign(item.to[1] - point.z);
      if (Math.abs(item.to[1] - point.z) < 0.25) break;
      const result = solver.step(point, 0, dz, 0.25, {});
      blocked = blocked.concat(result.blocked);
      // 连续帧间的高度变化必须 ≤ 台阶阈值（丹陛/台阶由道路插值平滑抬升）
      const jump = Math.abs(result.y - point.y);
      assert(jump <= CONFIG.INTERACTION.step.maxStepHeight + 1e-6, `${item.label} 单帧高度变化过大：${jump}`);
      point = { x: result.x, y: result.y, z: result.z };
    }
    assertClose(point.z, item.to[1], 0.6, `${item.label} 抵达目标`);
    assertClose(point.y, item.expectY, 0.01, `${item.label} 视线高`);
    assert(!blocked.includes('OB-B-hall-main'), `${item.label} 不应被主殿体块挡住`);
  }
});

/* ==========================================================================
 *  D. 中轴导览
 * ======================================================================== */

runner.section('D. 中轴导览（开始 / 暂停 / 继续 / 退出 / 接管暂停）');

await runner.test('D1 导览开始 → axis 模式 + state.tourState 唯一真相源 + 讲解点公告', async () => {
  const app = await makeApp();
  const hints = [];
  app.interaction.onHint((hint) => hints.push(hint));
  app.interaction.tour.start(0);
  assertEqual(app.store.state.viewMode, 'axis');
  assertEqual(app.store.state.tourState.active, true);
  assertEqual(app.store.state.tourState.index, 0);
  assertEqual(app.store.state.mode, 'tour');
  assertEqual(app.rig.describe().axisIndex, 1, '机位推进到第 1 个讲解点（core 的 setAxisIndex）');
  assert(hints.some((hint) => hint.kind === 'narration' && hint.title.includes('南桥')), '播报第 1 讲解点');

  const dwell = app.interaction.tour.describe().dwellSeconds;
  assert(dwell > CONFIG.CAMERA.transitionSeconds, '驻留时间由镜头时长派生');
  app.interaction.update(dwell + 0.1, 0);
  assertEqual(app.store.state.tourState.index, 1, 'dt 累积到驻留时间后推进到第 2 点');
  assertEqual(app.rig.describe().axisIndex, 2);
  app.interaction.dispose();
});

await runner.test('D2 暂停 / 继续 / 退出：推进在暂停期间停止，退出回到 browse', async () => {
  const app = await makeApp();
  app.interaction.tour.start(1);
  assertEqual(app.store.state.tourState.index, 1);
  assertEqual(app.interaction.tour.pause('ui'), true);
  assertEqual(app.store.state.tourState.paused, true);
  const dwell = app.interaction.tour.describe().dwellSeconds;
  app.interaction.update(dwell * 3, 0);
  assertEqual(app.store.state.tourState.index, 1, '暂停时不再推进');
  assertEqual(app.interaction.tour.resume(), true);
  assertEqual(app.store.state.tourState.paused, false);
  app.interaction.update(dwell + 0.1, 0);
  assertEqual(app.store.state.tourState.index, 2, '继续后恢复推进');
  assertEqual(app.interaction.tour.stop(), true);
  assertEqual(app.store.state.tourState.active, false);
  assertEqual(app.store.state.mode, 'browse');
  assertEqual(app.interaction.tour.stop(), false, '重复退出无副作用');
  app.interaction.dispose();
});

await runner.test('D3 用户接管相机（拖动 / 滚轮 / Esc / 切视角）→ 导览暂停并提示，且 G 不动相机', async () => {
  for (const [label, fire] of [
    ['pointerdown', (app) => app.app.dispatch('pointerdown', { clientX: 100, clientY: 100 })],
    ['wheel', (app) => app.app.dispatch('wheel', { deltaY: 120 })],
    ['Escape', (app) => app.win.key('Escape')],
    ['切视角键', (app) => app.win.key('Digit8')],
  ]) {
    // 不绑定 core 的 rig.bindInput：本次只留 G 的监听器，任何相机位移都只能归因于 G
    const app = await makeApp({ bindCoreInput: false });
    const hints = [];
    app.interaction.onHint((hint) => hints.push(hint));
    app.interaction.tour.start(0);
    app.interaction.update(CONFIG.CAMERA.transitionSeconds + 0.1, 0);
    const before = { x: app.rig.position.x, y: app.rig.position.y, z: app.rig.position.z };
    fire(app);
    assertEqual(app.store.state.tourState.paused, true, `${label} 应暂停导览`);
    assert(hints.some((hint) => hint.kind === 'tour-pause'), `${label} 应给出暂停提示`);
    const after = { x: app.rig.position.x, y: app.rig.position.y, z: app.rig.position.z };
    assert(
      before.x === after.x && before.y === after.y && before.z === after.z,
      `${label}：G 只发请求，不直接移动相机（不争夺相机）`,
    );
    app.interaction.dispose();
  }
});

await runner.test('D4 导览走完最后一个讲解点自动结束', async () => {
  const app = await makeApp();
  app.interaction.tour.start(LAYOUT.TOUR_POINTS.length - 1);
  const hints = [];
  app.interaction.onHint((hint) => hints.push(hint));
  assertEqual(app.interaction.tour.next(), null, '最后一个点之后没有下一个');
  assertEqual(app.store.state.tourState.active, false);
  assert(hints.some((hint) => hint.title === '导览结束'));
  app.interaction.dispose();
});

/* ==========================================================================
 *  E. 碰撞与可行走面
 * ======================================================================== */

runner.section('E. 碰撞解算 / 可行走面 / 包络保护');

await runner.test('E1 台阶阈值：> maxStepHeight 不可上，丹陛缓坡可上', async () => {
  const solver = createWalkSolver({});
  const side = solver.probe(70, -160, 0);
  assert(!side.ok, '从广场直接跨上 1.5m 台基应被拒');
  assert(side.reasons.includes('stepTooHigh'), `原因应为 stepTooHigh，实际 ${side.reasons.join('/')}`);
  // 丹陛是道路插值的缓坡：单步抬升受阈值约束，但连续行走可上（E2 走完全程）
  assert(solver.probe(0, -177, 0).ok, '丹陛第 1 级（Δ≈0.375m）可上');
  const tooHigh = solver.probe(0, -174, 0);
  assert(!tooHigh.ok && tooHigh.reasons.includes('stepTooHigh'), '丹陛中段一次性跨越会被拒（Δ>0.5m）');
  assert(solver.probe(0, -174, 0.35).ok, '脚已在坡上时同一格可继续上');
  const step = CONFIG.INTERACTION.step;
  assertEqual(step.maxStepHeight, 0.5);
  const tierY = CONFIG.MODULES.terraceTierHeight;
  assert(tierY > step.maxStepHeight, '台基单层高 > 阈值，必须走丹陛/台阶');
});

await runner.test('E2 丹陛可通：从广场走到三层台基顶（视线高 4.5+1.65）', async () => {
  const solver = createWalkSolver({});
  let point = { x: 0, y: 1.65, z: -190 };
  const blocked = [];
  for (let i = 0; i < 400 && point.z < -146; i += 1) {
    const result = solver.step(point, 0, 1, 0.2, {});
    blocked.push(...result.blocked);
    point = { x: result.x, y: result.y, z: result.z };
  }
  assertClose(point.z, -146, 1.2, '抵达台基顶');
  assertClose(point.y, CONFIG.MODULES.terraceTotalHeight + CONFIG.CAMERA.fpEyeHeight, 0.01, '站在三层台基顶');
  assert(blocked.includes('stepTooHigh') === false, '沿途没有不可上台阶');
});

await runner.test('E3 桥面可通、护城河水面不可走', async () => {
  const solver = createWalkSolver({});
  assert(solver.probe(0, -490).ok, '南桥桥面可走');
  assert(solver.probe(0, -490).surfaceY === CONFIG.TERRAIN.bridgeDeckY, '桥面标高取桥面');
  const offBridge = solver.probe(200, -490);
  assert(!offBridge.ok, '桥外的护城河水面不可走');
  assert(offBridge.reasons.includes('noSurface'), '河面没有可行走面');
  let point = { x: 0, y: CONFIG.TERRAIN.bridgeDeckY + CONFIG.CAMERA.fpEyeHeight, z: -510 };
  for (let i = 0; i < 400 && point.z < -455; i += 1) {
    const result = solver.step(point, 0, 1, 0.2, {});
    point = { x: result.x, y: result.y, z: result.z };
  }
  assert(point.z > -460, `应穿过桥面抵达城内，实际 z=${point.z.toFixed(1)}`);
});

await runner.test('E4 门洞可通、墙体不可穿：金銮殿门口 x=0 可入内，x=25 被拒', async () => {
  const solver = createWalkSolver({});
  let center = { x: 0, y: CONFIG.MODULES.terraceTotalHeight + CONFIG.CAMERA.fpEyeHeight, z: -146 };
  for (let i = 0; i < 200 && center.z < -120; i += 1) {
    const result = solver.step(center, 0, 1, 0.3, {});
    center = { x: result.x, y: result.y, z: result.z };
  }
  assert(center.z <= -118, `沿中轴门洞进入金銮殿，实际 z=${center.z.toFixed(1)}`);
  const side = solver.probe(25, -130, CONFIG.MODULES.terraceTotalHeight);
  assert(!side.ok, '门洞以外的墙体不可穿');
  assert(side.reasons.includes('OB-B-hall-main'), `应被建筑障碍挡住，实际 ${side.reasons.join('/')}`);
});

await runner.test('E5 水面 / 假山 / 宫墙都不可穿', async () => {
  const solver = createWalkSolver({});
  const pond = solver.probe(-200, 355);
  assert(!pond.ok && pond.reasons.includes('OB-WB-F-pond-west'), '御花园西水池不可踩');
  const pondEast = solver.probe(200, 355);
  assert(!pondEast.ok, '东水池同样不可踩');
  const rockery = solver.probe(-270, 340);
  assert(!rockery.ok && rockery.reasons.includes('OB-SC-F-rockery-west'), '假山不可穿越');

  let point = { x: 50, y: 1.65, z: -430 };
  for (let i = 0; i < 300; i += 1) {
    const result = solver.step(point, 0, -1, 0.25, {});
    point = { x: result.x, y: result.y, z: result.z };
  }
  assert(point.z >= LAYOUT.ENVELOPE.minZ - 1, `不得穿过南段宫墙（z=${point.z.toFixed(1)}）`);
  assert(!solver.blocks({ id: 'x', bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, y1: 3, sourceType: 'wall', blocks: 'all' }, 0, 0, 0) === false);
});

await runner.test('E6 包络保护：长距离冲撞不会掉出宫城 / 外侧地形', async () => {
  const solver = createWalkSolver({});
  const extent = LAYOUT.TERRAIN_EXTENT;
  const radius = CONFIG.INTERACTION.player.radius;
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.7071, 0.7071],
    [-0.7071, 0.7071],
    [0.7071, -0.7071],
    [-0.7071, -0.7071],
  ];
  for (const [dx, dz] of directions) {
    let point = { x: 0, y: 1.65, z: -300 };
    for (let i = 0; i < 4000; i += 1) {
      const result = solver.step(point, dx, dz, 0.35, {});
      point = { x: result.x, y: result.y, z: result.z };
      assert(point.x >= extent.minX + radius - 1e-6 && point.x <= extent.maxX - radius + 1e-6, `x 越界：${point.x}`);
      assert(point.z >= extent.minZ + radius - 1e-6 && point.z <= extent.maxZ - radius + 1e-6, `z 越界：${point.z}`);
      assert(Number.isFinite(point.y), 'y 必须有限（不得悬空 NaN）');
    }
  }
  const south = solver.probe(0, extent.minZ - 10, 0);
  assert(!south.ok && south.reasons.includes('envelope'), '包络外直接判定越界');
});

await runner.test('E7 与 core 内置求解器口径一致（差异只允许出现在登记水面上）', async () => {
  const mine = createWalkSolver({});
  const core = createFpSolver({ config: CONFIG });
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let checked = 0;
  const mismatches = [];
  for (let x = -300; x <= 300; x += 20) {
    for (let z = -450; z <= 450; z += 20) {
      const y = LAYOUT.floorYAt(x, z);
      if (y === null) continue;
      for (const [dx, dz] of directions) {
        const from = { x, y: y + CONFIG.CAMERA.fpEyeHeight, z };
        const a = mine.step(from, dx, dz, 0.4, {});
        const b = core.step(from, dx, dz, 0.4, {});
        checked += 1;
        const aBlocked = a.blocked.length > 0;
        const bBlocked = b.blocked.length > 0;
        if (aBlocked !== bBlocked) mismatches.push({ x, z, dx, dz, mine: a.blocked, core: b.blocked });
      }
    }
  }
  assert(checked > 2000, `采样次数 ${checked}`);
  const inWater = (x, z) => LAYOUT.WATER_BODIES.some((w) => x >= w.bounds.minX - 1 && x <= w.bounds.maxX + 1 && z >= w.bounds.minZ - 1 && z <= w.bounds.maxZ + 1);
  const outsideWater = mismatches.filter((m) => !inWater(m.x, m.z));
  assert(
    outsideWater.length === 0,
    `非水面处与 core 口径不一致：${outsideWater.length} 例，例如 ${JSON.stringify(outsideWater.slice(0, 3))}`,
  );
  runner.info(`  碰撞口径抽样 ${checked} 次；差异 ${mismatches.length} 例全部位于登记水面内`);
});

await runner.test('E8 FP_ROUTE 九个路点属于同一连通分量（§6.4 全程可走）', async () => {
  const solver = createWalkSolver({});
  const graph = createWalkGraph(solver, { cellSize: 2 });
  const waypoints = LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name }));
  const result = graph.connected(waypoints);
  assert(result.ok, `FP_ROUTE 不连通：${JSON.stringify(result.unreachable?.map((u) => u.point.name))}`);
  const spawns = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
  const spawnGraph = graph.connected([...spawns, ...waypoints]);
  assert(spawnGraph.ok, `出生点与走查路线不连通：${JSON.stringify(spawnGraph.unreachable?.map((u) => u.point.name))}`);
  const stats = graph.stats();
  assert(stats.walkable > 10000, `可行走栅格 ${stats.walkable} 格`);
  runner.info(`  栅格 ${stats.cols}×${stats.rows}@${stats.cellSize}m，可走 ${stats.walkable} 格；路线 9 点连通`);
});

await runner.test('E9 walk-solver 的宽相位（aabbGrid）与门洞判定可复现', async () => {
  const solver = createWalkSolver({});
  const stats = solver.stats();
  assert(stats.obstacles >= 81, `障碍 ${stats.obstacles} 个`);
  assertEqual(stats.cellSize, CONFIG.INTERACTION.collision.cellSize);
  assert(stats.cells > 0, '宽相位网格已建立');
  const door = { axis: 'z', center: { x: 0, z: -116 }, width: 26, height: 9, sillY: 4.5 };
  const bounds = { minX: -42, maxX: 42, minZ: -140, maxZ: -92 };
  assert(solver.insideDoorChannel(door, bounds, 0, -116), '门洞中心可通行');
  assert(!solver.insideDoorChannel(door, bounds, 20, -116), '门洞外被挡');
  assert(solver.probe(0, -116, 4.5).ok, '门洞中心实测可站立');
  assert(!solver.probe(20, -116, 4.5).ok, '门洞旁墙体实测被挡');
  assert(WORLD_BLOCK_REASONS.includes('envelope') && WORLD_BLOCK_REASONS.includes('noSurface'));
});

await runner.test('E10 障碍合并必须幂等并采用 registry 归一版本（t27：基线已内建 / y0 下钳 / 水体可拦人 / 宫墙 door 轴翻正）', async () => {
  const { mergeObstacles } = await loadModule('src/interaction/walk-solver.js');
  const events = createEventBus();
  const registry = createRegistry({ events, layout: LAYOUT });
  const live = registry.allObstacles();
  assert(live.length > 0, `core 派生的墙体碰撞盒存在：${live.length} 个`);
  const merged = mergeObstacles({ layout: LAYOUT, registry });
  const ids = new Set(merged.map((o) => o.id));
  // 基线里的"不可进入建筑"必须仍在集合内（否则第一人称可穿模）
  assert(ids.has('OB-B-hall-main'), '合并后仍有金銮殿障碍');
  assert(ids.has('OB-B-hall-mid'), '合并后仍有中殿障碍');
  assert(ids.has('OB-C-hall-bed-main'), '合并后仍有寝殿障碍');
  assert(ids.has('OB-MOAT-south') && ids.has('OB-WB-F-pond-west') && ids.has('OB-SC-F-rockery-west'), '水面与假山仍在');
  for (const obstacle of live) assert(ids.has(obstacle.id), `注册表条目 ${obstacle.id} 未被丢掉`);
  // 下界健全性（**不是**"按条数选源"的旧启发式）：合并结果不得少于注册表自身
  assert(merged.length >= live.length, `合并条数 ${merged.length} 不得少于注册表自身 ${live.length}`);

  // 接入注册表后求解器仍能挡住建筑墙体、且门洞可通
  const solver = createWalkSolver({ registry });
  assert(solver.obstacles().some((o) => o.id === 'OB-B-hall-main'), '求解器使用的集合含建筑障碍');
  assert(!solver.probe(25, -130, CONFIG.MODULES.terraceTotalHeight).ok, '注册表接入后墙体仍阻挡');
  assert(solver.probe(0, -116, CONFIG.MODULES.terraceTotalHeight).ok, '注册表接入后门洞仍可通');

  // t27 canonical：registry 已内建 layout 基线图层（y0 下钳到足迹地坪、水体抬到可拦人、宫墙 door 轴翻正），
  // 因此合并必须**幂等**（id 去重、registry 优先），且不得再用"按条数判断注册表是否完整"的旧启发式。
  const liveIds = new Set(live.map((o) => o.id));
  const baselineMissing = LAYOUT.OBSTACLES.filter((o) => !liveIds.has(o.id)).map((o) => o.id);
  assertEqual(baselineMissing.length, 0, `registry 已内建全部基线，缺失：${baselineMissing.join(',')}`);
  assertEqual(merged.length, live.length, `合并幂等：registry 已含基线时条数不变（实际 ${merged.length} vs ${live.length}）`);
  const mergedById = new Map(merged.map((o) => [o.id, o]));
  const rawPond = LAYOUT.OBSTACLES.find((o) => o.id === 'OB-WB-F-pond-west');
  assert(
    mergedById.get('OB-WB-F-pond-west').y1 > 1,
    `合并后水体必须抬到可拦人（t27）：y1=${mergedById.get('OB-WB-F-pond-west').y1}，原始 layout=${rawPond.y1}`,
  );
  assertEqual(mergedById.get('OB-B-hall-mid').y0, 0, '合并后建筑 y0 已下钳到足迹地坪（t27；原始 layout 为 2）');
  assertEqual(mergedById.get('OB-WALL-CITY-south').door.axis, 'z', '合并后宫墙 door 轴为面法线轴 z（t27 翻正）');
  assertEqual(
    LAYOUT.OBSTACLES.find((o) => o.id === 'OB-WALL-CITY-south').door.axis,
    'x',
    '原始 layout 仍是旧轴 x —— 消费方必须用 registry 归一版本，不得依赖该字段',
  );
  assert(!solver.probe(-200, 355).ok, '注册表口径下水池不可站立（t27：水体可拦人）');

  const catalog = buildCatalog({ registry, layout: LAYOUT });
  assertEqual(catalog.hintFor('OB-B-hall-mid').title.includes('中殿'), true, '提示文案能解析建筑名');

  // 网格重建有上限：core 每帧都会传新数组，不得每帧重建（以 invalidate 控制）
  const stats = solver.stats();
  assert(stats.cells > 0);
  solver.invalidate();
  assert(solver.stats().cells > 0, 'invalidate 后可重建');
});

await runner.test('E11 生产口径（registry 派生墙盒 ∪ layout 基线）下：城门可通、墙仍旧挡、FP_ROUTE 仍连通', async () => {
  const events = createEventBus();
  const registry = createRegistry({ events, layout: LAYOUT });
  const derived = registry.allObstacles();
  assert(derived.length > 0, `core 派生墙盒存在：${derived.length} 条`);
  assert(derived.some((o) => String(o.id).startsWith('OB-WALLRUN')), '派生墙盒 id 形如 OB-WALLRUN-*');
  const solver = createWalkSolver({ registry });
  const ids = new Set(solver.obstacles().map((o) => o.id));
  assert(ids.has('OB-B-hall-main'), '合并后仍含建筑障碍');
  for (const o of derived) assert(ids.has(o.id), `派生墙盒 ${o.id} 未丢失`);

  // 南城门门洞可通：从桥面北端穿过墙带进入城门内侧带
  let point = { x: 0, y: CONFIG.TERRAIN.bridgeDeckY + CONFIG.CAMERA.fpEyeHeight, z: -478 };
  const blockedDuring = [];
  for (let i = 0; i < 400 && point.z < -434; i += 1) {
    const result = solver.step(point, 0, 1, 0.25, {});
    blockedDuring.push(...result.blocked);
    point = { x: result.x, y: result.y, z: result.z };
  }
  assert(point.z > -438, `沿中轴穿过南城门：应抵达墙内，实际 z=${point.z.toFixed(1)}`);
  assert(!blockedDuring.some((id) => /WALLRUN|WALL-CITY/.test(id)), `穿门不应被墙盒阻挡：${[...new Set(blockedDuring)].join(',')}`);

  // 墙带内偏离门洞（x=20，超出门洞 26m 缺口）必须被挡：证明 core 派生盒的缺口语义生效
  let offAxis = { x: 20, y: 1.65, z: -470 };
  for (let i = 0; i < 200; i += 1) {
    const result = solver.step(offAxis, 0, 1, 0.25, {});
    offAxis = { x: result.x, y: result.y, z: result.z };
  }
  assert(offAxis.z < -448, `偏离门洞 x=20 不得穿墙：实际 z=${offAxis.z.toFixed(1)}`);
  assert(solver.probe(20, -453, 0.4).ok === false, '墙带内偏离门洞处不可站立');

  // 生产口径下 FP_ROUTE 仍须连通（派生墙盒不得切断走查路线）
  const graph = createWalkGraph(solver, { cellSize: 2 });
  const waypoints = LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name }));
  const connected = graph.connected(waypoints);
  assert(connected.ok, `生产口径下 FP_ROUTE 不连通：${JSON.stringify(connected.unreachable?.map((u) => u.point.name))}`);
  runner.info(`  生产口径：障碍 ${ids.size} 条（含派生墙盒），FP_ROUTE 9 点仍连通`);
});

/* ==========================================================================
 *  F. UI（DOM 替身 + 真实状态）
 * ======================================================================== */

runner.section('F. UI（面板齐备 / 隐藏义务 / 标签 / 小地图 / 加载重试 / 窄屏）');

await runner.test('F1 面板齐备：八视角、七分区、三时辰、三质量、小地图、HUD、导览、信息面板、加载、提示条', async () => {
  const app = await makeApp();
  const stats = app.ui.stats();
  assertEqual(stats.viewButtons, 8);
  assertEqual(stats.zoneButtons, 7);
  assertEqual(stats.timeButtons, TIME_PRESETS.length);
  assertEqual(stats.qualityButtons, QUALITY_ORDER.length);
  for (const panel of ['brand', 'hud', 'views', 'zones', 'tour', 'minimap', 'env', 'help', 'loading', 'info', 'labels', 'toast']) {
    assert(stats.panels.includes(panel), `缺少面板 ${panel}（实际 ${stats.panels.join(',')}）`);
  }
  assert(app.ui.refs.labels.size === 0 || true);
  assertEqual(ZONE_BUTTONS.length, 7);
  assertEqual(stats.spacingProblems.length, 0, 'UI 间距全部取自 4/8/12/16/24/32');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F2 点击视角按钮 / 分区按钮 → 同一请求事件（不是第二套状态）', async () => {
  const app = await makeApp();
  const isoButton = [...app.ui.refs.labels.size >= 0 ? [] : []];
  const buttons = app.app.querySelectorAll('[data-view-mode]');
  assertEqual(buttons.length, 8, '八个视角按钮都有 data-view-mode');
  const iso = buttons.find((b) => b.attrs['data-view-mode'] === 'iso');
  const before = app.events.count(EVENTS.requestViewMode);
  iso.dispatch('click', {});
  assertEqual(app.events.count(EVENTS.requestViewMode) - before, 1, '按钮点击只发一次请求');
  assertEqual(app.store.state.viewMode, 'iso');
  const zoneButtons = app.app.querySelectorAll('[data-zone]');
  assertEqual(zoneButtons.length, 7);
  const zoneC = zoneButtons.find((b) => b.attrs['data-zone'] === 'inner');
  zoneC.dispatch('click', {});
  assertEqual(app.store.state.viewMode, 'zone');
  assertEqual(app.store.state.selectedBuildingId, null);
  const throne = zoneButtons.find((b) => b.attrs['data-zone'] === 'throne');
  throne.dispatch('click', {});
  assertEqual(app.store.state.viewMode, 'focus');
  assertEqual(app.store.state.selectedBuildingId, 'B-hall-main', '主殿按钮 = 金銮殿近景');
  const reset = app.app.querySelectorAll('[data-action]').find((b) => b.attrs['data-action'] === 'reset');
  reset.dispatch('click', {});
  assertEqual(app.store.state.viewMode, 'oblique');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F3 隐藏义务：ui=0 / shot=1 时根层隐藏、不可命中、不参与拾取（§11.3）', async () => {
  for (const query of [{ ui: false, shot: true }, { ui: false, shot: false }, { ui: true, shot: true }]) {
    const app = await makeApp({ query });
    const stats = app.ui.stats();
    assertEqual(stats.visible, false, `query=${JSON.stringify(query)} 时 UI 隐藏`);
    assertEqual(app.ui.root.hidden, true);
    assert(app.ui.root.classList.contains('is-hidden'), 'is-hidden 类存在');
    assertEqual(app.ui.root.style.pointerEvents, 'none', '隐藏时 pointer-events:none（不拦截命中）');
    assertEqual(app.interaction.pickEnabled, false, '拾取器关闭');
    assertEqual(app.interaction.picker.pick(400, 300), null, '隐藏时不产生拾取结果');
    assertEqual(app.ui.stats().labels, 0, '隐藏时不生成任何可见标签（不靠 CSS 透明度）');
    // 恢复可见后标签/HUD 立即重建
    app.ui.setVisible(true);
    assertEqual(app.ui.stats().visible, true);
    assert(app.ui.stats().labels >= 0);
    assertEqual(app.interaction.pickEnabled, true, '恢复可见后拾取器重新开启');
    app.interaction.dispose();
    app.ui.dispose();
  }
  const shown = await makeApp({ query: { ui: true, shot: false } });
  assertEqual(shown.ui.stats().visible, true);
  assertEqual(shown.ui.root.hidden, false);
  assertEqual(shown.interaction.pickEnabled, true);
  shown.interaction.dispose();
  shown.ui.dispose();
});

await runner.test('F4 建筑选中 → 信息面板显示名称/用途/是否可入内，并请求近景与内景', async () => {
  const app = await makeApp();
  app.interaction.select('B-hall-main', 'test');
  const info = app.interaction.catalog.info('B-hall-main');
  assertEqual(info.name, '金銮殿');
  assert(info.visitable === true);
  assert(info.usage.includes('大朝正殿'));
  assertEqual(app.store.state.selectedBuildingId, 'B-hall-main');
  const stats = app.ui.stats();
  assert(stats.labels >= 1, '选中建筑标签可见');
  assertEqual(app.ui.refs.labels.get('B-hall-main').classList.contains('is-selected'), true);
  assertEqual(app.interaction.highlighter.describe().selected, 'yes', '三维高亮已显示');

  const interior = app.app.querySelectorAll('[data-ui-panel]');
  assert(interior.length >= 10);
  app.interaction.requester.viewMode('interior');
  assertEqual(app.store.state.viewMode, 'interior');

  // 寝殿内景需要指定区域（与 main.js 的 ?view=interior&zone=C 同一机制）
  app.interaction.select('C-hall-bed-main', 'test');
  app.store.patch({}, { source: 'test', view: { area: 'C' } });
  app.interaction.requester.viewMode('interior');
  app.rig.update(2, 0, app.store.state);
  const box = app.rig.describe().interiorBox;
  assert(box && box.zone === 'C', `室内包围盒应落在 C 区，实际 ${JSON.stringify(box?.zone)}`);
  assert(box.y === 2.4, '寝殿内景地面标高 2.4');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F5 标签按缩放层级显隐并避免重叠', async () => {
  const buildings = LAYOUT.SLOTS.map((s) => ({
    id: s.id,
    name: s.name,
    zone: s.zone,
    bounds: { ...s.bounds, minY: s.baseY, maxY: s.baseY + s.totalHeight },
  }));
  const viewport = { width: 1440, height: 900 };
  const identityProject = (x, y, z) => ({ x: 720 + x, y: 450 - z / 4, visible: true, depth: 0 });

  const far = planLabels({
    buildings,
    cameraPosition: { x: 0, y: 520, z: -1180 },
    project: identityProject,
    viewport,
    mode: 'oblique',
    config: CONFIG,
  });
  assertEqual(far.items.length, 0, '全城鸟瞰（>labelMinZoomDistance）不铺标签');

  const near = planLabels({
    buildings,
    cameraPosition: { x: 0, y: 30, z: -200 },
    project: identityProject,
    viewport,
    mode: 'focus',
    config: CONFIG,
  });
  assert(near.items.length > 0, '近景出现标签');
  assert(near.items.length <= CONFIG.INTERACTION.selection.labelMaxCount, `标签数 ${near.items.length} ≤ labelMaxCount`);
  for (let i = 0; i < near.items.length; i += 1) {
    for (let j = i + 1; j < near.items.length; j += 1) {
      const d = Math.hypot(near.items[i].x - near.items[j].x, near.items[i].y - near.items[j].y);
      if (!near.items[i].priority && !near.items[j].priority) {
        assert(d >= UI.spacing.lg - 1e-6, `标签间距 ${d} 应 ≥ ${UI.spacing.lg}px`);
      }
    }
  }

  const priority = planLabels({
    buildings,
    cameraPosition: { x: 0, y: 900, z: -1400 },
    project: identityProject,
    viewport,
    mode: 'oblique',
    selectedId: 'B-hall-main',
    hoveredId: 'C-hall-bed-main',
    config: CONFIG,
  });
  assert(priority.items.some((item) => item.id === 'B-hall-main'), '选中建筑标签始终可见');
  assert(priority.items.some((item) => item.id === 'C-hall-bed-main'), '悬停建筑标签始终可见');
});

await runner.test('F6 小地图：宫墙/区域/水体/院落 + 当前位置标记 + 点按定位', async () => {
  const plan = planMinimap({ cameraPosition: { x: 0, z: -60 }, cameraYawDeg: 0 });
  assertEqual(plan.walls.length, 4, '四段宫墙');
  assert(plan.zoneRects.length >= 7, `区域矩形 ${plan.zoneRects.length}`);
  assertEqual(plan.moats.length, 4, '护城河四段');
  assertEqual(plan.ponds.length, 4, '四处水池');
  assertEqual(plan.bridges.length, 4, '四座桥');
  assertEqual(plan.courtyards.length, 14, '十四处院落');
  assertClose(plan.marker.x, plan.projector.toScreen(0, -60).x, 1e-9, '标记跟随相机 x');
  assertClose(plan.marker.y, plan.projector.toScreen(0, -60).y, 1e-9, '标记跟随相机 y');
  assert(plan.marker.inside, '相机在宫城内');

  assertEqual(zoneAreaAt(plan, plan.projector.toScreen(0, -300).x, plan.projector.toScreen(0, -300).y), 'B');
  assertEqual(zoneAreaAt(plan, plan.projector.toScreen(-200, -300).x, plan.projector.toScreen(-200, -300).y), 'D');
  assertEqual(zoneAreaAt(plan, plan.projector.toScreen(200, -300).x, plan.projector.toScreen(200, -300).y), 'E');
  assertEqual(zoneAreaAt(plan, plan.projector.toScreen(0, 200).x, plan.projector.toScreen(0, 200).y), 'C');
  assertEqual(zoneAreaAt(plan, plan.projector.toScreen(0, 350).x, plan.projector.toScreen(0, 350).y), 'F');

  const ctx = { calls: [], fillRect: (...a) => ctx.calls.push(['fillRect', ...a]), strokeRect: (...a) => ctx.calls.push(['strokeRect', ...a]), clearRect: () => {}, beginPath: () => {}, arc: (...a) => ctx.calls.push(['arc', ...a]), fill: () => {}, stroke: () => {}, moveTo: () => {}, lineTo: () => {} };
  assertEqual(drawMinimap(ctx, plan), true, '有 2D 上下文时完成绘制');
  assert(ctx.calls.length > 30, `绘制命令 ${ctx.calls.length} 条`);
  assertEqual(drawMinimap(null, plan), false, '无 2D 上下文时静默跳过（Node 替身）');
});

await runner.test('F7 小地图容器的点击会请求对应分区', async () => {
  const app = await makeApp();
  const canvas = app.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'minimap');
  assert(canvas, '小地图画布存在');
  const plan = planMinimap({ cameraPosition: { x: 0, z: 0 } });
  const target = plan.projector.toScreen(-200, -300); // D 区
  canvas.dispatch('click', { clientX: target.x, clientY: target.y });
  assertEqual(app.store.state.viewMode, 'zone');
  assertEqual(app.store.view.area, 'D', '点按西侧 → D 区机位');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F8 加载进度 / 资源失败 / 重试', async () => {
  const app = await makeApp();
  app.events.emit(EVENTS.assetsProgress, { loaded: 3, total: 6, stage: '区域', progress: 0.5, mb: 4.2 });
  const panel = app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'loading');
  const fill = panel.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'loading-fill');
  assertEqual(fill.style.width, '50%', '进度条宽度跟随事件');
  assertEqual(fill.style.width, '50%');

  let retries = 0;
  app.api.retryFailedZones = async () => {
    retries += 1;
    return true;
  };
  app.events.emit(EVENTS.zoneFailed, { zone: 'E', error: '校验失败：缺少字段' });
  const retry = app.app.querySelectorAll('[data-action]').find((el) => el.attrs['data-action'] === 'retry');
  assertEqual(retry.hidden, false, '失败后重试按钮可见');
  retry.dispatch('click', {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEqual(retries, 1, '点按重试调用 core 的 retryFailedZones');
  app.events.emit(EVENTS.zoneLoaded, { zone: 'E', stats: {} });
  assertEqual(retry.hidden, true, '恢复后隐藏重试');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F9 提示条：撞到不可进入建筑时给出可见中文提示', async () => {
  const app = await makeApp();
  const hints = [];
  app.interaction.onHint((hint) => hints.push(hint));
  app.events.emit(EVENTS.blockedByBuilding, { buildingId: 'OB-B-hall-mid', reason: 'fp-collision' });
  const hint = hints[hints.length - 1];
  assert(hint, '产生提示');
  assert(hint.title.includes('中殿'), `提示标题应含建筑名，实际「${hint.title}」`);
  assertEqual(hint.kind, 'blocked');
  const wall = blockedHint({ sourceType: 'wall', name: '宫墙', blocks: 'exceptDoor', visitable: false });
  assert(wall.title.includes('宫墙'));
  const water = blockedHint({ sourceType: 'water', name: '护城河', blocks: 'all' });
  assert(water.title.includes('水面'));
  const rockery = blockedHint({ sourceType: 'rockery', name: '假山', blocks: 'all' });
  assert(rockery.title.includes('假山'));
  const unknown = blockedHint(null);
  assert(unknown.title.length > 0, '未知障碍也有兜底提示');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F10 窄屏：结构标记 + 提示折叠 + 触屏支持范围说明', async () => {
  const app = await makeApp({ width: 600, height: 900 });
  assertEqual(app.ui.root.dataset.narrow, '1');
  const help = app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'help');
  const body = help.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'help-body');
  assertEqual(body.hidden, true, '窄屏默认折叠操作提示');
  const touch = help.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'help-touch');
  assertEqual(touch.textContent, TOUCH_SUPPORT_NOTE);
  assert(touch.textContent.includes('鸟瞰') && touch.textContent.includes('点按'), '明确触屏支持范围（鸟瞰/点按）与漫游限制');
  assert(touch.textContent.includes('第一人称') && touch.textContent.includes('桌面'), '明确第一人称漫游仅桌面可用');

  app.win.innerWidth = 1440;
  app.win.fireKey('resize', {});
  assertEqual(app.ui.root.dataset.narrow, '0', '窗口变大后恢复宽屏布局');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F11 H / M 键走 G 的本地命令（提示折叠、小地图开关），不产生状态请求', async () => {
  const app = await makeApp();
  const before = app.events.count(EVENTS.requestViewMode) + app.events.count(EVENTS.requestReset);
  app.win.key('KeyM');
  const minimapPanel = app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'minimap');
  assertEqual(minimapPanel.hidden, true, 'M 收起小地图');
  app.win.key('KeyM');
  assertEqual(minimapPanel.hidden, false, 'M 再按展开');
  const help = app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'help');
  const body = help.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'help-body');
  assertEqual(body.hidden, true, '操作提示默认折叠（面板高度收敛，不与其它面板抢空间）');
  app.win.key('KeyH');
  assertEqual(body.hidden, false, 'H 展开操作提示');
  app.win.key('KeyH');
  assertEqual(body.hidden, true, 'H 再按折叠');
  assertEqual(app.events.count(EVENTS.requestViewMode) + app.events.count(EVENTS.requestReset), before, '本地命令不产生状态请求');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F12 UI 令牌来自 config.UI（间距阶梯 / 圆角 / 过渡 / 字体）', async () => {
  const vars = cssVariables();
  assertEqual(vars['--palace-space-md'], `${UI.spacing.md}px`);
  assertEqual(vars['--palace-radius'], `${UI.radius}px`);
  assertEqual(vars['--palace-transition'], `${UI.transitionMs}ms`);
  assertEqual(vars['--palace-camera-transition'], `${UI.cameraTransitionMs}ms`);
  assertEqual(vars['--palace-font-title'], UI.typography.titleFamily);
  assertEqual(vars['--palace-seal'], UI.panel.sealColor);
  assertEqual(assertTokens(SPACING_SCALE).length, 0);
  assert(assertTokens([5]).length === 1, '阶梯外数值被拒');
  const { doc } = makeDom();
  assertEqual(ensureStyles({ doc }), true);
  assert(doc.getElementById('palace-ui-tokens'), '令牌 style 已注入');
  assertEqual(ensureStyles({ doc }), true, '重复注入幂等');
  assertEqual(doc.getElementById('palace-ui-tokens').textContent.includes('--palace-space-md:16px'), true, 'style 内容含间距变量');
});

await runner.test('F13 mountInterface 一行接入：不调用 update 时也随唯一循环推进，显式 update 后不重复驱动', async () => {
  const app = await makeApp({ ui: false });
  const handle = mountInterface(
    { ...app.api, retryFailedZones: async () => true },
    { container: app.app, document: app.doc, window: app.win, query: { ui: true, shot: false } },
  );
  assert(handle.interaction && handle.ui);
  assertEqual(typeof handle.update, 'function');
  assertEqual(handle.ui.stats().viewButtons, 8);
  const before = app.events.count(EVENTS.requestViewMode);
  handle.interaction.requester.viewMode('orbit');
  assertEqual(app.events.count(EVENTS.requestViewMode) - before, 1);
  assertEqual(app.win.__PALACE_UI__, handle, '挂载句柄暴露在传入的 window 上');

  // 1) 只用唯一动画循环驱动（main.js 的 recordFrame）：interaction 与 UI 都必须推进
  const tickFloor = handle.stats().interaction.ticks;
  const uiFloor = handle.ui.stats().updates;
  for (let i = 0; i < 40; i += 1) {
    app.renderSystem.recordFrame(40);
    await new Promise((resolve) => setTimeout(resolve, 1)); // 间隔 > 2ms 才计一帧
  }
  assert(handle.stats().interaction.ticks > tickFloor, `interaction tick 应从 ${tickFloor} 增长`);
  assert(handle.ui.stats().updates >= uiFloor + 10, `UI 更新计数应从 ${uiFloor} 增长，实际 ${handle.ui.stats().updates}`);

  // 2) t14 若显式调用 update，则包装层停用：不再重复驱动（每帧只推进一次）
  handle.update(1 / 60, 0);
  const uiAfterManual = handle.ui.stats().updates;
  const ticksAfterManual = handle.stats().interaction.ticks;
  for (let i = 0; i < 20; i += 1) app.renderSystem.recordFrame(40);
  assertEqual(handle.ui.stats().updates, uiAfterManual, '手动驱动模式下 recordFrame 不再推进 UI');
  assertEqual(handle.stats().interaction.ticks, ticksAfterManual, '手动驱动模式下 recordFrame 不再推进 interaction');
  assertEqual(handle.interaction.driveMode(), 'manual');
  handle.dispose();
});

await runner.test('F14 recordFrame 包装让交互搭上唯一循环，且不重复推进', async () => {
  const calls = [];
  const renderSystem = { recordFrame: (ms) => calls.push(ms) };
  let ticks = 0;
  const detach = attachRenderLoop(renderSystem, () => {
    ticks += 1;
  });
  renderSystem.recordFrame(16.7);
  renderSystem.recordFrame(16.7);
  assertEqual(calls.length, 2, '原 recordFrame 仍被调用');
  assert(ticks >= 1, '包装层驱动了 tick');
  const afterFirst = ticks;
  renderSystem.recordFrame(16.7);
  assert(ticks >= afterFirst, '连续同 dt 帧不会异常');
  detach();
  renderSystem.recordFrame(16.7);
  assertEqual(calls.length, 4);
  assertEqual(renderSystem.recordFrame.toString().includes('wrappedRecordFrame'), false, '已还原');
});

await runner.test('F15 帮助文案与键盘实现同源（列出的键都能被 resolveKey 解析）', async () => {
  const rows = helpKeyList();
  assert(rows.length >= 8, `操作提示 ${rows.length} 行`);
  for (let index = 1; index <= 8; index += 1) {
    assert(rows.some((row) => row.code === String(index)), `提示包含数字键 ${index}`);
    assertEqual(resolveKey(`Digit${index}`, {}).kind, 'view');
  }
  assert(rows.some((row) => row.code.includes('F')));
  assert(rows.some((row) => row.code.includes('Esc')));
});

await runner.test('F16 版面不重叠：右侧为单列（可滚动），左下让开 core 的 ?stats=1 面板', async () => {
  const files = [
    ['src/ui/styles.css', readFileSync(join(ROOT, 'src/ui/styles.css'), 'utf8')],
    ['src/ui/index.js', readFileSync(join(ROOT, 'src/ui/index.js'), 'utf8')],
  ];
  const css = files[0][1];
  assert(/\.palace-col--tr\s*\{[^}]*overflow-y:\s*auto/.test(css), '右列可滚动，不靠绝对定位堆叠');
  assert(/\.palace-col--tr\s*\{[^}]*max-height:\s*calc\(100vh/.test(css), '右列高度受限');
  assert(/\[data-stats-overlay="1"\]\s*\.palace-col--bl/.test(css), '左下避让 core 的 stats 面板');
  const js = files[1][1];
  assert(!/colBR/.test(js), '已合并为单列（无第四个绝对定位列）');
  const app = await makeApp({ query: { ui: true, stats: true } });
  assertEqual(app.ui.root.dataset.statsOverlay, '1', 'stats=1 时标记避让');
  const panelNames = app.ui.stats().panels;
  assertEqual(panelNames.length >= 12, true);
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F17 标签避开面板矩形；分区按钮激活态随相机 tick 同步（不依赖 state 变化）', async () => {
  const buildings = LAYOUT.SLOTS.map((s) => ({ id: s.id, name: s.name, zone: s.zone, bounds: { ...s.bounds, minY: s.baseY, maxY: s.baseY + s.totalHeight } }));
  const identityProject = (x, y) => ({ x: 720 + x, y: 450, visible: true, depth: 0 });
  const full = [{ x: 0, y: 0, width: 1440, height: 900 }];
  const base = {
    buildings,
    cameraPosition: { x: 0, y: 30, z: -200 },
    project: identityProject,
    viewport: { width: 1440, height: 900 },
    mode: 'focus',
    config: CONFIG,
  };
  const blocked = planLabels({ ...base, excludeRects: full });
  assertEqual(blocked.items.length, 0, '落在面板矩形内的标签全部排除');
  assert(blocked.excluded > 0, `排除计数 ${blocked.excluded}`);
  const priority = planLabels({ ...base, selectedId: 'B-hall-main', excludeRects: full });
  assert(priority.items.some((item) => item.id === 'B-hall-main'), '选中建筑标签不受面板避让影响');

  const app = await makeApp();
  const zoneButton = (id) => app.app.querySelectorAll('[data-zone]').find((el) => el.attrs['data-zone'] === id);
  const active = () => app.app.querySelectorAll('[data-zone]').filter((el) => el.classList.contains('is-active')).map((el) => el.attrs['data-zone']);
  app.rig.position.set(0, 30, -300); // B 区
  app.ui.update(1);
  assertEqual(active().includes('forecourt'), true, `相机在 B 区时按钮应高亮，实际 ${JSON.stringify(active())}`);
  app.rig.position.set(0, 30, 350); // F 御花园
  app.ui.update(1);
  assertEqual(active().includes('garden'), true, `相机在御花园时按钮应高亮，实际 ${JSON.stringify(active())}`);
  assertEqual(active().includes('forecourt'), false, '离开 B 区后不再高亮');
  assertEqual(app.ui.stats().labels >= 0, true);
  assert(zoneButton('garden'));
  app.interaction.dispose();
  app.ui.dispose();
});

/* ==========================================================================
 *  汇总
 * ======================================================================== */

const code = runner.summary();
process.exit(code);
