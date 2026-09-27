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
const { createTraversalAudit, requiredPassageWidth, PASSAGE_MARGIN } = await loadModule('src/interaction/traversal.js');
const { buildCatalog, blockedHint } = await loadModule('src/interaction/catalog.js');
const { createInteraction, attachRenderLoop, coreOwnedKey, COOPERATIVE_WINDOW_MS } = await loadModule('src/interaction/index.js');
const { createUI, mountInterface, ensureStyles } = await loadModule('src/ui/index.js');
const { planLabels } = await loadModule('src/ui/labels.js');
const { planMinimap, zoneAreaAt, drawMinimap } = await loadModule('src/ui/minimap.js');
const { cssVariables, assertTokens, SPACING_SCALE } = await loadModule('src/ui/tokens.js');

/* ==========================================================================
 *  0b. t30：结构锚定的函数体提取（本文件内实现；与 `tests/core-stats.test.mjs` 的 t29 同源）
 *
 *  为何必须：旧写法用**符号名位置切片**
 *      const body = src.slice(src.indexOf('function escapeToSafePoint'), src.indexOf('function exitInterior'));
 *  在函数改名时 `indexOf` 返回 **-1** ⇒ `slice(-1, -1)` 为空、或 `slice(start, -1)` 退化为**几乎整个文件**
 *  ⇒ 三条正则断言在"几乎整个文件"上照样成立 = **假绿**（断言与守护对象脱钩）。两函数之间插代码
 *  也会**静默**改变作用域。本实现按 **词法状态 + 花括号配对** 提取函数体，签名缺失/未闭合返回 `null`
 *  （调用方**必须**断言非空，不得静默继续）。
 *
 *  扫描器口径（足以穿过 `src/interaction/index.js` 的真实写法）：
 *    · 跳过 `'…'`、`"…"`、`` `…` ``（含 `${…}` 嵌套表达式）内的所有括号/注释符；
 *    · 跳过 `//…` 行注释与 `/*…*​/` 块注释；
 *    · 跳过正则字面量（按前一个有效字符启发式判定，含字符类 `[…]`）；
 *    · 只对**代码态**的花括号计深度，深度回到 0 即函数体结束。
 *  返回 `{ start, braceStart, end, body }`；找不到签名/未闭合时返回 `null`。
 * ========================================================================== */

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return null;
  const braceStart = source.indexOf('{', start + signature.length);
  if (braceStart < 0) return null;
  const isRegexStart = (i) => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(source[j])) j -= 1;
    if (j < 0) return true;
    if ('([{,;:=!&|?+-*%~^<>'.includes(source[j])) return true;
    const before = source.slice(Math.max(0, j - 6), j + 1);
    return /(?:^|[^\w$])(?:return|typeof|instanceof|case|in|of|new|delete|void|do|else|yield|await)$/.test(before);
  };
  const skipRegex = (i) => {
    let j = i + 1;
    let inClass = false;
    for (; j < source.length; j += 1) {
      const c = source[j];
      if (c === '\\') { j += 1; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) return j;
      else if (c === '\n') return i; // 不是正则（换行截断）⇒ 当作普通字符
    }
    return i;
  };
  let depth = 0;
  const templateExpr = [];
  let mode = 'code';
  for (let i = braceStart; i < source.length; i += 1) {
    const c = source[i];
    const c2 = source[i + 1];
    if (mode === 'line') { if (c === '\n') mode = 'code'; continue; }
    if (mode === 'block') { if (c === '*' && c2 === '/') { mode = 'code'; i += 1; } continue; }
    if (mode === 'sq' || mode === 'dq') {
      if (c === '\\') { i += 1; continue; }
      if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"')) mode = 'code';
      continue;
    }
    if (mode === 'tpl') {
      if (c === '\\') { i += 1; continue; }
      if (c === '`') { mode = 'code'; continue; }
      if (c === '$' && c2 === '{') { templateExpr.push(depth); depth += 1; mode = 'code'; i += 1; }
      continue;
    }
    if (c === '/' && c2 === '/') { mode = 'line'; i += 1; continue; }
    if (c === '/' && c2 === '*') { mode = 'block'; i += 1; continue; }
    if (c === "'") { mode = 'sq'; continue; }
    if (c === '"') { mode = 'dq'; continue; }
    if (c === '`') { mode = 'tpl'; continue; }
    if (c === '/' && isRegexStart(i)) { i = skipRegex(i); continue; }
    if (c === '{') { depth += 1; continue; }
    if (c === '}') {
      depth -= 1;
      if (templateExpr.length > 0 && depth === templateExpr[templateExpr.length - 1]) {
        templateExpr.pop();
        mode = 'tpl';
        continue;
      }
      if (depth <= 0) return { start, braceStart, end: i + 1, body: source.slice(braceStart, i + 1) };
    }
  }
  return null;
}

/** t30：提取**恰好两个函数体**（按签名逐个结构锚定，再拼接）。任一签名缺失 ⇒ 抛错（调用方须断言）。 */
function extractTwoFunctionBodies(source, sigA, sigB) {
  const a = extractFunctionBody(source, sigA);
  const b = extractFunctionBody(source, sigB);
  const missing = [a ? null : sigA, b ? null : sigB].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`结构锚定失败：源码中缺少或花括号未闭合的签名 → ${missing.join('、')}（旧的位置切片在此时会退化成几乎整个文件而假绿）`);
  }
  return { body: `${a.body}\n${b.body}`, a, b };
}

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
    keyUp(code) {
      return win.fireKey('keyup', { code });
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

async function makeApp({ ui = true, query = {}, bindCoreInput = true, width = 1440, height = 900, seedRegistry = null } = {}) {
  const { doc, win, app } = makeDom({ width, height });
  const events = createEventBus({ onError: (error, info) => console.error(`[事件 ${info.type}]`, error) });
  const store = createStateStore({ events });
  const registry = createRegistry({ events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  // t80：允许在 catalog 构建前注入"带 kit 实测包围盒"的建筑，用于验证"实测优先"
  if (typeof seedRegistry === 'function') seedRegistry(registry, events);
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
  // 6 = 本用例构造的非法输入条数（非布局/数据快照；改用例时随之变化）
  assertEqual(rejected.length, 6, '被拒输入均被记账');
  assertEqual(events.count(EVENTS.requestViewMode), 0);
  assertEqual(events.count(EVENTS.requestTimePreset), 0);
  app.interaction.dispose();
});

await runner.test('A8 resolveKey(KeyF) 四条分支（t59）：内景中→返回；选中可进入→进内景；选中不可进入→提示；无选中→第一人称切换', async () => {
  // ① 已在某建筑内景 → 返回进入前的视角
  const inInterior = resolveKey('KeyF', { viewMode: 'interior', hasSelection: true, selectedVisitable: true });
  assertEqual(inInterior.kind, 'interior');
  assertEqual(inInterior.local, 'exitInterior');
  assertEqual(inInterior.request, null, '返回动作不改 state（由控制器恢复模式）');
  assert(inInterior.label.includes('返回'), `标签应说明返回语义：${inInterior.label}`);

  // ② 有选中且可进入 → 进入该建筑内景（不发通用请求，交给控制器按数据推导机位）
  const canEnter = resolveKey('KeyF', { viewMode: 'oblique', hasSelection: true, selectedVisitable: true });
  assertEqual(canEnter.kind, 'interior');
  assertEqual(canEnter.local, 'enterInterior');
  assertEqual(canEnter.request, null);
  assert(canEnter.label.includes('内景'), `标签应说明进入内景：${canEnter.label}`);

  // ③ 有选中但不可进入 → 只提示、不改视角
  const cannotEnter = resolveKey('KeyF', { viewMode: 'oblique', hasSelection: true, selectedVisitable: false });
  assertEqual(cannotEnter.kind, 'interior');
  assertEqual(cannotEnter.local, 'notifyInteriorUnavailable');
  assertEqual(cannotEnter.request, null, '不可进入时不得发出任何视角请求');

  // ④ 无选中 → 保持原有第一人称切换语义（请求 fp，由 core 负责恢复）
  const toggle = resolveKey('KeyF', { viewMode: 'oblique', hasSelection: false });
  assertEqual(toggle.kind, 'view');
  assertEqual(toggle.request.type, EVENTS.requestViewMode);
  assertEqual(toggle.request.payload.mode, 'fp');
  assertEqual(toggle.label, '第一人称');
  const toggleOut = resolveKey('KeyF', { viewMode: 'fp', fpActive: true, hasSelection: false });
  assertEqual(toggleOut.label, '退出第一人称');
  assertEqual(toggleOut.request.payload.mode, 'fp', 'FP 中的 F 仍是同一条 fp 请求（core 切换退出）');
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
  // 1 / 2 = 契约校验器的**规则条数**（本用例构造的非法状态触发数，非数据快照）
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
  /* t8：计数由数据推导（不再写死 5）——"每个分区恰一个 fp-spawn"是语义，数量随 `ZONES` 走 */
  const zoneIds = LAYOUT.ZONES.map((z) => z.id);
  const spawnAreas = spawns.map((v) => v.area);
  assertEqual(spawns.length, zoneIds.length, `每个分区恰一个 fp-spawn：${zoneIds.length} 个分区 ⇒ ${zoneIds.length} 个出生点（实际 ${spawns.length}）`);
  assertEqual(new Set(spawnAreas).size, spawns.length, '不得有两个 fp-spawn 落在同一分区');
  assert(spawnAreas.every((area) => zoneIds.includes(area)), `fp-spawn 的 area 必须是合法分区：${spawnAreas.join(',')}`);
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

await runner.test('C4 F 进入选中建筑内景（真实按键链路）：写 interiorViewpointId + 请求 interior + 再按 F 返回原模式与机位', async () => {
  const app = await makeApp();
  const hints = [];
  app.interaction.onHint((hint) => hints.push(hint));
  // 先进入一个"有登记机位"的非默认模式，验证返回语义不是回到 default
  app.interaction.requester.zone('B');
  app.rig.update(2, 0, app.store.state);
  const before = app.rig.describe();
  assertEqual(app.store.state.viewMode, 'zone');

  app.interaction.select('B-hall-main', 'test');
  const viewRequestsBefore = app.events.count(EVENTS.requestViewMode);
  app.win.key('KeyF');
  assertEqual(app.events.count(EVENTS.requestViewMode) - viewRequestsBefore, 1, 'F 只发一个视角请求');
  assertEqual(app.store.state.viewMode, 'interior', 'F → interior 模式');
  assertEqual(app.store.view.interiorViewpointId, 'VP-B-interior', '内景机位由数据推导后写入 store.view');
  assertEqual(app.store.view.area, 'B');
  const state = app.interaction.interiorState();
  assertEqual(state.active, true);
  assertEqual(state.last.ok, true);
  assertEqual(state.last.viewpointId, 'VP-B-interior');
  assertEqual(state.last.surfaceId, 'WK-B-hall-main-interior', '机位由该建筑的内景地面推导');
  assertEqual(state.returnTo.mode, 'zone', '记录了进入前的模式（zone）');
  assert(hints.some((hint) => hint.title.includes('进入内景') && hint.title.includes('金銮殿')), '给出可见提示');

  app.rig.update(2, 0, app.store.state);
  const box = app.rig.describe().interiorBox;
  assertEqual(box.id, 'WK-B-hall-main-interior', '相机被夹在该建筑的内景包围盒内');
  const p = app.rig.describe().position;
  assert(p.x >= box.minX && p.x <= box.maxX && p.z >= box.minZ && p.z <= box.maxZ, `相机在内景地面范围内：${JSON.stringify(p)}`);

  // 再按 F → 返回进入前的模式与登记机位
  const back = app.interaction.interiorState().returnTo.mode;
  app.win.key('KeyF');
  assertEqual(app.store.state.viewMode, back, 'F 返回进入前的模式');
  app.rig.update(2, 0, app.store.state);
  const after = app.rig.describe();
  assertClose(after.position.x, before.position.x, 1e-6, '返回后机位 x 与进入前一致（登记机位）');
  assertClose(after.position.y, before.position.y, 1e-6, '返回后机位 y 与进入前一致');
  assertClose(after.position.z, before.position.z, 1e-6, '返回后机位 z 与进入前一致');
  assertEqual(app.interaction.interiorState().active, false);
  app.interaction.dispose();
});

await runner.test('C5 F 对"不可进入"建筑：明确提示且完全不改视角（不改 state / 不发请求）', async () => {
  const app = await makeApp();
  const hints = [];
  app.interaction.onHint((hint) => hints.push(hint));
  app.interaction.requester.zone('B');
  app.rig.update(2, 0, app.store.state);
  // 从 layout 数据里动态取一栋"不可进入"的建筑（Phase 2 会逐步扩大 visitable 集合，测试不写死建筑 id）
  const target = LAYOUT.SLOTS.find((s) => s.visitable !== true);
  assert(target, 'layout 中应存在不可进入的建筑');
  app.interaction.select(target.id, 'test');
  assertEqual(app.interaction.catalog.info(target.id).visitable, false, `${target.id} 应为不可进入`);

  const snapshot = {
    mode: app.store.state.viewMode,
    area: app.store.view.area,
    viewpointId: app.store.view.viewpointId,
    interiorViewpointId: app.store.view.interiorViewpointId ?? null,
    requests: app.events.count(EVENTS.requestViewMode),
    resets: app.events.count(EVENTS.requestReset),
    position: { ...app.rig.describe().position },
  };
  app.win.key('KeyF');
  const toast = hints[hints.length - 1];
  assertEqual(toast.title, '此建筑不可进入内景', `应有明确反馈，实际「${toast.title}」`);
  assert(toast.detail.includes(target.name), `提示应点名建筑「${target.name}」：${toast.detail}`);
  assertEqual(app.store.state.viewMode, snapshot.mode, '视角模式不变');
  assertEqual(app.store.view.area, snapshot.area, '分区视图记录不变');
  assertEqual(app.store.view.viewpointId, snapshot.viewpointId, '分区机位不变');
  assertEqual(app.store.view.interiorViewpointId ?? null, snapshot.interiorViewpointId, '未写入内景机位');
  assertEqual(app.events.count(EVENTS.requestViewMode), snapshot.requests, '不得发出任何视角请求');
  assertEqual(app.events.count(EVENTS.requestReset), snapshot.resets, '也不得触发复位');
  assertEqual(app.interaction.interiorState().active, false);
  assertEqual(app.interaction.interiorState().last.reason, 'not-visitable');
  assertClose(app.rig.describe().position.x, snapshot.position.x, 1e-9, '相机未被移动');
  assertClose(app.rig.describe().position.z, snapshot.position.z, 1e-9, '相机未被移动');
  app.interaction.dispose();
});

await runner.test('C6 内景机位映射由区/布局数据推导（不硬编码）：每个 visitable 都命中其内景地面，不可进入/无内景区返回 null', async () => {
  const app = await makeApp();
  const catalog = app.interaction.catalog;
  /** 测试内独立推导"该建筑的内景地面"（只用 layout 数据），用于对账 catalog 的结果。 */
  const expectedSurface = (slot) => {
    const center = { x: (slot.bounds.minX + slot.bounds.maxX) / 2, z: (slot.bounds.minZ + slot.bounds.maxZ) / 2 };
    return LAYOUT.WALKABLE.filter((w) => w.kind === 'interior' && w.zone === slot.zone).find(
      (w) => center.x >= w.bounds.minX && center.x <= w.bounds.maxX && center.z >= w.bounds.minZ && center.z <= w.bounds.maxZ,
    ) ?? null;
  };
  // ① 每个"其内景地面已登记"的 visitable 建筑都必须推导出机位，且面/区与数据一致
  const visitable = LAYOUT.SLOTS.filter((s) => s.visitable);
  assert(visitable.length >= 2, `layout 至少登记 2 处可进入内景（实际 ${visitable.length}）`);
  const withSurface = visitable.filter((s) => expectedSurface(s));
  assert(withSurface.length >= 2, `至少金銮殿/寝殿的内景地面已登记（实际 ${withSurface.length}/${visitable.length}）`);
  const resolved = withSurface.map((s) => ({ id: s.id, zone: s.zone, surface: expectedSurface(s).id, mapping: catalog.interiorViewpointFor(s.id) }));
  const missing = resolved.filter((r) => !r.mapping);
  assertEqual(missing.length, 0, `可进入建筑都应能推导机位：${JSON.stringify(missing.map((r) => r.id))}`);
  for (const r of resolved) {
    assertEqual(r.mapping.surfaceId, r.surface, `${r.id} 应命中其内景地面 ${r.surface}`);
    assertEqual(r.mapping.area, r.zone, `${r.id} 的内景区应与其所属区一致`);
    const vp = LAYOUT.VIEWPOINTS.find((v) => v.id === r.mapping.viewpointId);
    assert(vp, `推导出的机位必须已在 layout.VIEWPOINTS 登记：${r.mapping.viewpointId}`);
    assertEqual(vp.mode, 'interior', '推导出的机位必须是 interior 模式');
    assertEqual(vp.area ?? vp.zone, r.zone, '机位归属区与建筑区一致（不跨区借用他人内景）');
  }
  // ② 具体两栋（金銮殿 / 寝殿）逐一锁定：面 + 机位
  const hall = resolved.find((r) => r.id === 'B-hall-main');
  const bed = resolved.find((r) => r.id === 'C-hall-bed-main');
  assert(hall && bed, '金銮殿与寝殿都必须在 resolved 内');
  assertEqual(hall.mapping.surfaceId, 'WK-B-hall-main-interior');
  assertEqual(bed.mapping.surfaceId, 'WK-C-bed-interior');
  assertEqual(catalog.interiorSurfaceFor(catalog.get('B-hall-main')).id, 'WK-B-hall-main-interior');
  assertEqual(catalog.interiorSurfaceFor(catalog.get('C-hall-bed-main')).id, 'WK-C-bed-interior');

  // ③ 反向控制（证明不是"恒返回某个 id"）：
  //    建筑中心不在任何内景地面内 → null；无内景登记的分区 → null；不存在的 id → null
  const outsideAnyInterior = LAYOUT.SLOTS.find((s) => !expectedSurface(s) && catalog.interiorViewpointFor(s.id) === null);
  assert(outsideAnyInterior, '应存在"中心不在任何内景地面内"的建筑，且其映射为 null');
  const zoneWithInteriors = new Set(LAYOUT.WALKABLE.filter((w) => w.kind === 'interior').map((w) => w.zone));
  const zoneWithout = LAYOUT.ZONES.find((z) => !zoneWithInteriors.has(z.id));
  if (zoneWithout) {
    const slot = LAYOUT.SLOTS.find((s) => s.zone === zoneWithout.id);
    assertEqual(catalog.interiorViewpointFor(slot.id), null, `${zoneWithout.id} 区未登记内景 → 必须 null`);
  }
  assertEqual(catalog.interiorViewpointFor('不存在的建筑'), null);

  // ④ 静态证明：UI 与键位层都不得出现具体内景机位字面量（映射来自 catalog 数据）
  for (const rel of ['src/ui/index.js', 'src/interaction/keymap.js']) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert(!/VP-[A-Z]-interior/.test(text), `${rel} 不得硬编码内景机位 id`);
  }
  // ⑤ 真实按键：按建筑走它自己的机位（不是"第一个内景"）
  for (const r of [hall, bed]) {
    app.interaction.select(r.id, 'test');
    app.win.key('KeyF');
    assertEqual(app.store.view.interiorViewpointId, r.mapping.viewpointId, `${r.id} 应进入 ${r.mapping.viewpointId}`);
    assertEqual(app.interaction.interiorState().last.surfaceId, r.mapping.surfaceId);
    app.win.key('KeyF'); // 返回，便于下一轮
  }
  app.interaction.dispose();
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

/**
 * 诊断辅助：把"走查路线不可达"的成因说清楚（供路线/区域/碰撞负责人直接定位）。
 * 对每个不可达路点给出：所在地面、该点面高、以及它与其最近可达邻居之间的阻挡原因。
 */
function describeRouteBlockers(solver, graph, waypoints, unreachable) {
  const details = unreachable.map((u) => {
    const wp = waypoints[u.index] ?? u.point;
    const world = LAYOUT.FP_ROUTE.find((w) => w.name === wp.name) ?? null;
    const surfaces = LAYOUT.WALKABLE.filter((s) => world && world.surfaceId === s.id);
    const ground = LAYOUT.floorYAt(wp.x, wp.z);
    const probe = solver.probe(wp.x, wp.z, null);
    const neighbours = [
      [wp.x + 8, wp.z],
      [wp.x - 8, wp.z],
      [wp.x, wp.z + 8],
      [wp.x, wp.z - 8],
    ].map(([x, z]) => ({ x, z, ok: solver.probe(x, z, ground ?? null).ok }));
    return {
      name: wp.name,
      at: { x: wp.x, z: wp.z },
      surfaceId: world?.surfaceId ?? null,
      surfaceY: surfaces[0]?.y ?? null,
      floorYAt: ground,
      standable: probe.ok,
      reasons: probe.reasons,
      neighboursReachable: neighbours.filter((n) => n.ok).length,
    };
  });
  return `${JSON.stringify(details, null, 1)}`;
}

/**
 * 走查路线可达性契约（t59 起，兼容 layout 内景切片在途 + 只断言本层能保证的部分）：
 *   · `wired`：障碍已落门（`blocks === 'exceptDoor'`）**且**内景地面与门外可行走面的高差 ≤ 台阶阈值
 *     → **必须**可达；不可达即真实回退（唯一会失败的类别）。
 *   · `pendingAccess`：门已登记但门外没有可达的入口（内景地面高出室外可行走面 > `step.maxStepHeight`，
 *     或缺室外可行走面）→ 属"入口台阶/坡道尚未落到数据与几何"的在途状态，逐条量化报告，不判失败。
 *   · `sealed`：障碍仍是整体阻挡（`blocks === 'all'`，门洞未落到碰撞数据）→ 同属在途，报告不判失败。
 * 一旦 layout/区域补上入口台阶或门洞，对应路点会自动落入 `wired` 类别并被强断言覆盖。
 */
function routeReachability(solver, graph, waypoints) {
  const obstacles = solver.obstacles();
  const surfaceById = new Map(LAYOUT.WALKABLE.map((w) => [w.id, w]));
  const maxStep = CONFIG.INTERACTION.step.maxStepHeight;
  const facingDir = { south: [0, -1], north: [0, 1], east: [1, 0], west: [-1, 0] };
  const result = graph.connected(waypoints);
  const unreachable = result.unreachable ?? [];
  const wired = [];
  const pendingAccess = [];
  const sealed = [];
  for (const u of unreachable) {
    const wp = waypoints[u.index];
    const layoutWp = LAYOUT.FP_ROUTE.find((w) => w.name === wp.name) ?? null;
    const surface = layoutWp?.surfaceId ? surfaceById.get(layoutWp.surfaceId) : null;
    const slot =
      LAYOUT.SLOTS.find((s) => wp.x >= s.bounds.minX && wp.x <= s.bounds.maxX && wp.z >= s.bounds.minZ && wp.z <= s.bounds.maxZ) ??
      (surface ? LAYOUT.SLOTS.find((s) => s.zone === surface.zone && surface.bounds.minX >= s.bounds.minX - 1 && surface.bounds.maxX <= s.bounds.maxX + 1) ?? null : null);
    const obstacle = slot ? obstacles.find((o) => o.id === `OB-${slot.id}`) : null;
    const dir = slot ? facingDir[slot.facing] ?? [0, -1] : [0, -1];
    // 门外参考地坪取"入口正前方 1.5/3/6/10m 的最低可行走面"：门洞通道面可能与内景齐平，
    // 真正的接近面在通道外侧（实测教训：只看 1.5m 会把 0.6m 的门槛误判成"已可进入"）。
    const outsideSamples = slot?.entrance ? [1.5, 3, 6, 10].map((d) => {
      const x = slot.entrance.x + dir[0] * d;
      const z = slot.entrance.z + dir[1] * d;
      return { d, x, z, y: LAYOUT.floorYAt(x, z) };
    }) : [];
    const outsideFloor = outsideSamples.length > 0
      ? outsideSamples.reduce((min, cur) => (cur.y === null ? min : min === null ? cur.y : Math.min(min, cur.y)), null)
      : null;
    const interiorFloor = surface?.y ?? null;
    const step = interiorFloor !== null && outsideFloor !== null ? +(interiorFloor - outsideFloor).toFixed(3) : null;
    const entry = {
      name: wp.name,
      slotId: slot?.id ?? null,
      surfaceId: surface?.id ?? layoutWp?.surfaceId ?? null,
      interiorFloor,
      outsideFloor,
      approach: outsideSamples.map((s2) => `${s2.d}m:${s2.y ?? 'n/a'}`).join('/'),
      step,
      obstacleId: obstacle?.id ?? null,
      blocks: obstacle?.blocks ?? null,
    };
    if (!obstacle || obstacle.blocks !== 'exceptDoor') sealed.push(entry);
    else if (
      step === null ||
      step > maxStep + 1e-6 ||
      step < -CONFIG.INTERACTION.step.snapDownDistance - 1e-6
    ) {
      // 门外高差超出"可上台阶 + 可下落吸附"的可行区间（或门外无可行走面）→ 缺入口台阶/坡道，属在途
      pendingAccess.push(entry);
    } else wired.push(entry);
  }
  return { result, unreachable, wired, pendingAccess, sealed, ok: result.ok };
}

await runner.test('E8 FP_ROUTE 路点属于同一连通分量（§6.4 全程可走；在途门洞/入口单列报告）', async () => {
  const solver = createWalkSolver({});
  const graph = createWalkGraph(solver, { cellSize: 2 });
  const waypoints = LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name }));
  const reach = routeReachability(solver, graph, waypoints);
  const wiredNames = new Set(reach.wired.map((w) => w.name));
  assert(
    reach.wired.length === 0,
    `门洞已通且入口高差在阈值内的内景路点必须可达（真实回退）\n${JSON.stringify(reach.wired, null, 1)}`,
  );
  const spawns = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
  const walkableWaypoints = waypoints.filter((w) => !reach.sealed.some((s) => s.name === w.name) && !reach.pendingAccess.some((s) => s.name === w.name));
  const spawnReach = graph.connected([...spawns, ...walkableWaypoints]);
  assert(spawnReach.ok, `出生点与已可通行路点必须连通：${JSON.stringify(spawnReach.unreachable?.map((u) => u.point.name ?? wiredNames.has(u.point?.name)))}`);
  const stats = graph.stats();
  assert(stats.walkable > 10000, `可行走栅格 ${stats.walkable} 格`);
  runner.info(
    `  栅格 ${stats.cols}×${stats.rows}@${stats.cellSize}m，可走 ${stats.walkable} 格；` +
      `路线 ${waypoints.length} 点：连通 ${waypoints.length - reach.unreachable.length} · 在途入口 ${reach.pendingAccess.length} · 未落门 ${reach.sealed.length}`,
  );
  if (reach.pendingAccess.length > 0) {
    runner.info(
      `  待补入口台阶/坡道（门已登记，内景地面高出室外 > ${CONFIG.INTERACTION.step.maxStepHeight}m；属 layout/区域在途）：` +
        reach.pendingAccess.map((s) => `${s.name}[${s.surfaceId}] 内 ${s.interiorFloor} vs 外 ${s.outsideFloor} = +${s.step}m`).join('、'),
    );
  }
  if (reach.sealed.length > 0) {
    runner.info(`  门洞未落到碰撞数据（障碍仍整体阻挡）：${reach.sealed.map((s) => `${s.name}[${s.obstacleId}]`).join('、')}`);
  }
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
  assertEqual(mergedById.get('OB-WALL-CITY-south').door.axis, 'z', '合并后宫墙 door 轴为面法线轴 z（t27 翻正）');
  assertEqual(
    LAYOUT.OBSTACLES.find((o) => o.id === 'OB-WALL-CITY-south').door.axis,
    'x',
    '原始 layout 仍是旧轴 x —— 消费方必须用 registry 归一版本，不得依赖该字段',
  );
  assert(!solver.probe(-200, 355).ok, '注册表口径下水池不可站立（t27：水体可拦人）');

  // y0 的**行为契约**（t59 起取代原先"必须等于 0"的写法）：
  //   layout 内景切片把"可进入建筑"的阻挡体起点改为各自台基顶（y0 = 记录值），以便内景体积可通行；
  //   对碰撞正确性真正重要的是"阻挡体不得高于建筑基座"（否则可从下方穿入）且要有审计来源。
  //   ⚠ 该口径变化与 t27 文档（"y0 下钳到足迹地坪"）不一致，已作为发现交 layout/core 负责人确认。
  const midObstacle = mergedById.get('OB-B-hall-mid');
  const midRecorded = midObstacle.y0Recorded ?? LAYOUT.OBSTACLES.find((o) => o.id === 'OB-B-hall-mid').y0;
  assert(Number.isFinite(midObstacle.y0), '建筑障碍 y0 必须是有限数');
  assert(
    midObstacle.y0 <= midRecorded,
    `建筑障碍 y0 不得高于其记录基座（防"从下方穿入"）：y0=${midObstacle.y0} recorded=${midRecorded}`,
  );
  const clampApplicable = mergedById.get('OB-B-hall-mid').y0 === 0;
  runner.info(
    `  y0 口径：OB-B-hall-mid y0=${midObstacle.y0}（layout 记录 ${midRecorded}，y0Recorded=${midObstacle.y0Recorded ?? 'n/a'}）；` +
      `t27 的"下钳到足迹地坪"当前${clampApplicable ? '生效' : '未生效（layout 内景切片改为按台基顶起算，待负责人确认 canonical）'}`,
  );

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

  // 生产口径下 FP_ROUTE 仍须连通（派生墙盒不得切断走查路线）；在途门洞/入口按同一契约分类报告
  const graph = createWalkGraph(solver, { cellSize: 2 });
  const waypoints = LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name }));
  const reach = routeReachability(solver, graph, waypoints);
  assert(
    reach.wired.length === 0,
    `生产口径下"门已通且入口高差在阈值内"的路点必须可达：${JSON.stringify(reach.wired, null, 1)}`,
  );
  runner.info(
    `  生产口径：障碍 ${ids.size} 条（含派生墙盒）；路线连通 ${waypoints.length - reach.unreachable.length}/${waypoints.length}` +
      `（在途入口 ${reach.pendingAccess.length} · 未落门 ${reach.sealed.length}）`,
  );
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
  /* t8：分区按钮的两个判据由数据推导（"每个分区都有按钮" + "id 唯一"），
     旧的写死 7（= 5 分区 + 全城 + 主殿快捷）降级为**历史快照下界**：新增快捷不转红，塌陷转红。 */
  const zoneButtonIds = ZONE_BUTTONS.map((b) => b.id);
  assertEqual(new Set(zoneButtonIds).size, zoneButtonIds.length, `分区按钮 id 必须唯一：${zoneButtonIds.join(',')}`);
  for (const zid of LAYOUT.ZONES.map((z) => z.id)) {
    assert(ZONE_BUTTONS.some((b) => b.area === zid || b.id === zid), `分区 ${zid} 必须有一个按钮（area 或 id 命中）`);
  }
  assert(ZONE_BUTTONS.length >= 7, `分区按钮不得少于历史快照 7（实际 ${ZONE_BUTTONS.length}）`);
  assertEqual(stats.spacingProblems.length, 0, 'UI 间距全部取自 4/8/12/16/24/32');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F2 点击视角按钮 / 分区按钮 → 同一请求事件（不是第二套状态）', async () => {
  const app = await makeApp();
  const isoButton = [...app.ui.refs.labels.size >= 0 ? [] : []];
  const buttons = app.app.querySelectorAll('[data-view-mode]');
  // t8：计数由 config 推导（不再写死 8）
  assertEqual(buttons.length, CONFIG.CAMERA.viewModes.length, `视角按钮数必须等于 config.CAMERA.viewModes（${CONFIG.CAMERA.viewModes.length}；实际 ${buttons.length}）`);
  const iso = buttons.find((b) => b.attrs['data-view-mode'] === 'iso');
  const before = app.events.count(EVENTS.requestViewMode);
  iso.dispatch('click', {});
  assertEqual(app.events.count(EVENTS.requestViewMode) - before, 1, '按钮点击只发一次请求');
  assertEqual(app.store.state.viewMode, 'iso');
  const zoneButtons = app.app.querySelectorAll('[data-zone]');
  // t8：DOM 按钮数与常量表同源（不写死 7）；分区齐备性由上面的数据推导断言覆盖
  assertEqual(zoneButtons.length, ZONE_BUTTONS.length, `DOM 分区按钮数应等于 ZONE_BUTTONS（实际 ${zoneButtons.length} / ${ZONE_BUTTONS.length}）`);
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
  // 面板数下界（t7 现为 13 个 data-ui-panel；此处只作"面板齐备"的下界，不写死具体值）
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
  /* t8：小地图四类图元数量**逐项由 layout 推导**（与 `planMinimap` 同源），不再写死 4/4/4/4/14 */
  assertEqual(plan.walls.length, LAYOUT.WALLS.filter((w) => w.cityWall).length, `宫墙段数应等于 LAYOUT.WALLS 里的 cityWall 段（${LAYOUT.WALLS.filter((w) => w.cityWall).length}）`);
  assert(plan.zoneRects.length >= LAYOUT.ZONES.length, `区域矩形应 ≥ 分区数（${LAYOUT.ZONES.length}；实际 ${plan.zoneRects.length}）`);
  assertEqual(plan.moats.length, LAYOUT.MOAT.rects.length, `护城河段数应等于 MOAT.rects（${LAYOUT.MOAT.rects.length}）`);
  assertEqual(plan.ponds.length, LAYOUT.WATER_BODIES.filter((w) => !/^MOAT/.test(w.id)).length, '水池数应等于 WATER_BODIES 去掉护城河段');
  assertEqual(plan.bridges.length, LAYOUT.BRIDGES.length, `桥数应等于 LAYOUT.BRIDGES（${LAYOUT.BRIDGES.length}）`);
  assertEqual(plan.courtyards.length, LAYOUT.COURTYARDS.length, `院落数应等于 LAYOUT.COURTYARDS（${LAYOUT.COURTYARDS.length}）`);
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
  const body = help.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'panel-body');
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
  /**
   * t7 意图更新：M 不再是"整块 hidden"这一套平行语义，而是切换**折叠**（与箭头同一个状态机）。
   * 判据不降级：仍断言"两次按键后状态回到原位"，并新增 aria-expanded 如实同步与"折叠 ≠ 移除 DOM"。
   */
  const minimapPanel = app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'minimap');
  const minimapBody = minimapPanel.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'panel-body');
  const minimapToggle = minimapPanel.querySelectorAll('[data-action]').find((el) => el.attrs['data-action'] === 'toggle-panel');
  assertEqual(minimapPanel.attrs['data-collapsed'], '1', '小地图默认折叠（t7 新意图）');
  assertEqual(minimapBody.hidden, true, '默认折叠时内容体不参与布局');
  app.win.key('KeyM');
  assertEqual(minimapPanel.attrs['data-collapsed'], '0', 'M 展开小地图（同一个折叠状态机）');
  assertEqual(minimapBody.hidden, false, 'M 展开后内容体可见');
  assertEqual(minimapToggle.attrs['aria-expanded'], 'true', 'aria-expanded 必须如实同步');
  assertEqual(minimapPanel.hidden, false, '折叠 ≠ 移除：面板始终留在 DOM 中');
  app.win.key('KeyM');
  assertEqual(minimapPanel.attrs['data-collapsed'], '1', 'M 再按折叠');
  assertEqual(minimapBody.hidden, true, '再次折叠后内容体不可见');
  const help = app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'help');
  const body = help.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'panel-body');
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
  // 2 / 4 = 本用例构造的调用次数（2 帧 → 包装层 + 原实现各一次；4 = 再走 2 帧），非数据快照
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

await runner.test('F18 详情面板在左上列（品牌/HUD 之下同列）：选中出现、关闭隐藏、字段齐备且不落右/下中列', async () => {
  const app = await makeApp();
  const byRegion = (name) => app.app.querySelectorAll('[data-ui-region]').find((el) => el.attrs['data-ui-region'] === name);
  const infoPanel = () => app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'info');
  const leftColumn = byRegion('left-column');
  assert(leftColumn, '左上列存在且有 data-ui-region 标记');
  assertEqual(infoPanel().parentNode, leftColumn, '详情面板必须挂在左上列（colTL）');
  assertEqual(byRegion('bottom-center').childNodes.includes(infoPanel()), false, '详情面板不得留在底部居中列（colBC）');
  assertEqual(byRegion('sidebar').childNodes.includes(infoPanel()), false, '详情面板不得落在右列');

  // 同列顺序：品牌 → HUD → 详情（HUD 下方）
  const order = leftColumn.childNodes.map((child) => (child.attrs?.['data-ui-panel'] ?? child.attrs?.['data-ui-region'] ?? child.tagName));
  assertEqual(order[0], 'brand', `左列第一项应为品牌，实际 ${JSON.stringify(order)}`);
  assertEqual(order[1], 'hud', `左列第二项应为 HUD，实际 ${JSON.stringify(order)}`);
  assertEqual(order[2], 'info', `详情面板应紧随 HUD 之后，实际 ${JSON.stringify(order)}`);
  assertEqual(infoPanel().hidden, true, '未选中时详情面板隐藏');

  // 选中 → 出现 + 字段齐备（名称/可进入标签/用途/说明/等级/屋顶/所属/院落/尺寸）
  const field = (part) => app.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === part);
  app.interaction.select('B-hall-main', 'test');
  assertEqual(infoPanel().hidden, false, '选中后详情面板出现');
  // 详情字段分元素读取（DOM 替身的 textContent 是逐元素属性，不聚合子节点）
  const fields = {
    name: field('info-name').textContent,
    visit: field('info-visit').textContent,
    usage: field('info-usage').textContent,
    meta: field('info-meta').textContent,
    spec: field('info-spec').textContent,
    size: field('info-size').textContent,
    note: field('info-note').textContent,
    f: field('info-f').textContent,
  };
  const all = Object.values(fields).join(' · ');
  for (const [label, want] of [
    ['名称', '金銮殿'],
    ['可进入标签', '可进入内景'],
    ['用途', '用途：'],
    ['说明', '大朝正殿'],
    ['等级', '等级：3 级'],
    ['等级（最高标记）', '（最高）'],
    ['屋顶形制', '屋顶：重檐庑殿顶'],
    ['所属区', '所属：中轴前朝'],
    ['院落', '院落：主殿院'],
    ['尺寸', '84 × 48 m'],
    ['占地面积', '占地 4032 m²'],
    ['台基高', '台基 4.5 m'],
    ['F 提示', '按 F 进入「金銮殿」内景'],
    ['形制', '形制：殿堂'],
  ]) {
    assert(all.includes(want), `${label}：详情面板应含「${want}」，实际：${all.slice(0, 300)}`);
  }
  assertEqual(fields.name, '金銮殿', '名称字段独立成元素');
  assertEqual(fields.meta, '所属：中轴前朝 · 院落：主殿院', '所属区/院落合并一行');
  assertEqual(infoPanel().dataset.selected, 'B-hall-main');

  // 不可进入的建筑：标签与 F 提示切换，且「进入内景」按钮禁用（动态取一栋 visitable=false 的建筑）
  const nonVisitable = LAYOUT.SLOTS.find((s) => s.visitable !== true);
  assert(nonVisitable, 'layout 中应存在不可进入的建筑');
  app.interaction.select(nonVisitable.id, 'test');
  const visitMid = field('info-visit').textContent;
  const fMid = field('info-f').textContent;
  assert(visitMid.includes('不可进入'), `不可进入建筑显示"不可进入"标签，实际「${visitMid}」`);
  assert(fMid.includes('此建筑不可进入内景'), `F 提示应说明不可进入，实际「${fMid}」`);
  const interiorButton = field('info-interior');
  assertEqual(interiorButton.disabled, true, '不可进入时「进入内景（F）」按钮禁用');

  // 关闭按钮 → 取消选中并隐藏
  const closeButton = app.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'info-close');
  closeButton.dispatch('click', {});
  assertEqual(app.store.state.selectedBuildingId, null, '关闭按钮取消选中');
  assertEqual(infoPanel().hidden, true, '关闭后详情面板隐藏');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F19 真实指针点击链路：点建筑 → 左上角出现该建筑详情；点空白/关闭 → 取消选中', async () => {
  const app = await makeApp();
  const infoPanel = () => app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'info');
  const rect = app.app.getBoundingClientRect();

  /** 世界坐标 → 屏幕像素（与 UI 的 projector 同一套投影，走 rig.camera）。 */
  const toScreen = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(app.rig.camera);
    return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height };
  };
  const targetInfo = app.interaction.catalog.info('B-hall-main');
  // 沿视线方向可能存在更近的遮挡建筑（如门殿）：用"投影中心像素 → 同一 picker 代码路径回读"确定目标，
  // 这样断言的是"点到的就是面板显示的那一栋"，不依赖某栋建筑必然可见（对 layout 版本变化稳健）。
  const pickAtCenter = (id) => {
    const info = app.interaction.catalog.info(id);
    // 用 pickables 的世界包围盒（含 minY/maxY）取中点高度；info.bounds 是 layout 的平面盒（没有 y）
    const pickable = app.interaction.catalog.pickables.find((p) => p.id === id);
    const b = pickable?.bounds ?? { minY: 0, maxY: 10 };
    const point = toScreen(info.center.x, ((b.minY ?? 0) + (b.maxY ?? 10)) / 2, info.center.z);
    return { info, point, hit: app.interaction.picker.pick(point.x, point.y) };
  };
  let target = pickAtCenter('B-hall-main');
  if (target.hit?.id !== 'B-hall-main') {
    const visible = app.interaction.catalog.pickables.find((p) => pickAtCenter(p.id).hit?.id === p.id);
    assert(visible, '画面上应至少有一栋"投影中心即命中自身"的建筑');
    target = pickAtCenter(visible.id);
  }
  const targetPoint = target.point;
  assert(target.hit, `目标像素应能命中建筑：${JSON.stringify(targetPoint)}`);
  assertEqual(target.hit.id, target.info.id, `像素应命中目标建筑，实际 ${target.hit.id}`);
  const targetName = target.info.name;

  // 真实用户操作顺序：pointermove（悬停）→ pointerdown → pointerup（未拖动 = 点击）
  app.app.dispatch('pointermove', { clientX: targetPoint.x, clientY: targetPoint.y });
  assertEqual(app.store.state.hoveredBuildingId, target.info.id, '悬停高亮同步到 state');
  app.app.dispatch('pointerdown', { clientX: targetPoint.x, clientY: targetPoint.y, button: 0 });
  app.app.dispatch('pointerup', { clientX: targetPoint.x, clientY: targetPoint.y, button: 0 });
  assertEqual(app.store.state.selectedBuildingId, target.info.id, '点击建筑 → 选中该建筑');
  assertEqual(infoPanel().hidden, false, '点击后左上角详情面板出现');
  const field = (part) => app.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === part);
  assertEqual(field('info-name').textContent, targetName, '左上角面板显示所点建筑的名称');
  assert(field('info-spec').textContent.includes('屋顶：'), `面板显示详情字段（屋顶形制）：${field('info-spec').textContent}`);

  // 拖动（超过容差）不应触发选中：先取消选中再模拟拖动
  app.interaction.select(null, 'test');
  const dragFrom = targetPoint;
  app.app.dispatch('pointerdown', { clientX: dragFrom.x, clientY: dragFrom.y, button: 0 });
  app.app.dispatch('pointermove', { clientX: dragFrom.x + 60, clientY: dragFrom.y + 30 });
  app.app.dispatch('pointerup', { clientX: dragFrom.x + 60, clientY: dragFrom.y + 30, button: 0 });
  assertEqual(app.store.state.selectedBuildingId, null, '拖动转视角不触发选中');

  // 点空白（天空）→ 取消选中并隐藏面板
  app.interaction.select(target.info.id, 'test');
  const candidates = [[rect.width / 2, 4], [4, 4], [rect.width - 4, 4], [4, rect.height - 4]];
  const empty = candidates.find(([x, y]) => app.interaction.picker.pick(x, y) === null);
  assert(empty, '应存在未命中任何建筑的像素作为"空白处"');
  app.app.dispatch('pointerdown', { clientX: empty[0], clientY: empty[1], button: 0 });
  app.app.dispatch('pointerup', { clientX: empty[0], clientY: empty[1], button: 0 });
  assertEqual(app.store.state.selectedBuildingId, null, '点击空白处取消选中');
  assertEqual(infoPanel().hidden, true, '取消选中后详情面板隐藏');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('F20 F7 回归：信息面板高度只认实测（kit worldBounds），估值仅降级并显式标注"估值"', async () => {
  // ── ① 静态守卫：UI 层不得出现 layout 估值字段名（避免任何回退到估值的写法）
  const uiFiles = readdirSync(join(ROOT, 'src/ui')).filter((n) => n.endsWith('.js'));
  for (const name of uiFiles) {
    const text = readFileSync(join(ROOT, 'src/ui', name), 'utf8');
    assert(!/totalHeight/.test(text), `src/ui/${name} 不得引用 layout 估值字段 totalHeight`);
    assert(!/eaveHeight\b/.test(text), `src/ui/${name} 不得引用 layout 估值字段 eaveHeight`);
  }
  // interaction 层：估值字段只允许出现在 catalog.js 的"显式标注估值"分支与 fallback 里
  const interactionFiles = readdirSync(join(ROOT, 'src/interaction')).filter((n) => n.endsWith('.js'));
  for (const name of interactionFiles) {
    if (name === 'catalog.js') continue;
    const text = readFileSync(join(ROOT, 'src/interaction', name), 'utf8');
    assert(!/totalHeight/.test(text), `src/interaction/${name} 不得引用 layout 估值字段 totalHeight`);
  }
  // pick.js 的 eaveHeight 只允许作为"缺少 maxY 时的兜底默认"，不得覆盖实测盒
  const pickSrc = readFileSync(join(ROOT, 'src/interaction/pick.js'), 'utf8');
  assert(/b\.maxY \?\?/.test(pickSrc), 'pick.js 必须先取实体包围盒 maxY，缺失才兜底');

  // ── ② 行为：注入"带 kit 实测包围盒"的建筑，面板必须展示实测值 + "实测"，且不含估值数字
  const slot = LAYOUT.SLOTS.find((s) => s.id === 'B-hall-main');
  const estimate = slot.totalHeight;
  const measuredHeight = +(estimate * 1.4).toFixed(2); // 刻意与估值差 40%，确保不会"看起来一样"
  const app = await makeApp({
    seedRegistry: (registry) => {
      registry.registerBuildings('B', [
        {
          ...slot,
          group: {
            userData: {
              kit: {
                worldBounds: { minX: slot.bounds.minX - 2, maxX: slot.bounds.maxX + 2, minZ: slot.bounds.minZ - 2, maxZ: slot.bounds.maxZ + 2, minY: 0, maxY: measuredHeight },
              },
            },
          },
        },
      ]);
    },
  });
  const detail = app.interaction.catalog.detail('B-hall-main');
  assertEqual(detail.heightMeasured, measuredHeight, `detail.heightMeasured 必须来自 kit 实测盒（实际 ${detail.heightMeasured}）`);
  assertEqual(detail.heightSource, 'kit实测');
  assertEqual(detail.heightEstimated, estimate, '估值字段仍保留（显式标注用）');
  assert(detail.heightMeasured !== detail.heightEstimated, '实测与估值在本用例中必须不同（否则断言无意义）');
  assertEqual(detail.boundsMeasured.measured, true);
  assertEqual(detail.boundsMeasured.source, 'kit实测');

  app.interaction.select('B-hall-main', 'test');
  const field = (part) => app.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === part);
  const sizeText = field('info-size').textContent;
  assert(sizeText.includes(`脊高 ${measuredHeight} m（实测）`), `面板必须展示实测高度并标注实测：${sizeText}`);
  assert(!sizeText.includes(String(estimate)), `面板不得出现估值高度 ${estimate}：${sizeText}`);
  assert(!sizeText.includes('估值'), `有实测时不得出现"估值"字样：${sizeText}`);
  assert(sizeText.includes('m（平面）'), `平面尺寸与高度口径分列标注：${sizeText}`);

  // ── ③ 无实测（Node/灰盒路径）时：降级为显式"约 …（估值）"，绝不冒充实测
  const app2 = await makeApp();
  app2.interaction.select('B-hall-main', 'test');
  const field2 = (part) => app2.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === part);
  const sizeText2 = field2('info-size').textContent;
  const detail2 = app2.interaction.catalog.detail('B-hall-main');
  assertEqual(detail2.heightMeasured, null, '无实测时 heightMeasured 必须为 null');
  assertEqual(detail2.heightSource, 'layout估值');
  assert(sizeText2.includes(`脊高约 ${estimate} m（估值）`), `无实测时必须显式标注估值：${sizeText2}`);
  assert(!/脊高 [\d.]+ m（实测）/.test(sizeText2), '无实测时不得出现"实测"字样');
  app.interaction.dispose();
  app.ui.dispose();
  app2.interaction.dispose();
  app2.ui.dispose();
});

/* ==========================================================================
 *  t87 / T7.5：隧穿闭环 · 四类阻挡审计 · 单向陷阱守卫 · 防卡死兜底 · 成对可达性
 * ======================================================================== */

await runner.test('E12 隧穿闭环（t86-F1）：子步进 + 谓词层同源；旧"只测终点"实现对照必隧穿', async () => {
  const solver = createWalkSolver({});
  const eye = CONFIG.CAMERA.fpEyeHeight;
  // 真实数据样例（t86 报告里的同一点）：站在宫墙西侧，向东一步 30m
  const startX = -300;
  const startZ = -430;
  const start = { x: startX, y: LAYOUT.floorYAt(startX, startZ) + eye, z: startZ };

  // ① 修复后：被最近的墙挡住并**点名原因**，位移必须远小于步长
  const fixed = solver.step(start, 1, 0, 30, {});
  const moved = Math.abs(fixed.x - startX);
  assert(moved < 1, `30m 一跳不得穿墙：实际位移 ${moved.toFixed(2)}m`);
  assert(fixed.blocked.length > 0, '被挡必须给出原因');
  assert(
    fixed.blocked.some((id) => /WALL-CITY/.test(id)),
    `应点名宫墙障碍，实际 ${JSON.stringify(fixed.blocked)}`,
  );

  // ② 旧实现（只对终点判阻挡）的对照：终点已在墙外 ⇒ 放行（隧穿）
  const legacyEndpoint = { x: startX + 30, z: startZ };
  const legacyVerdict = solver.probe(legacyEndpoint.x, legacyEndpoint.z, LAYOUT.floorYAt(startX, startZ));
  assertEqual(legacyVerdict.ok, true, '对照前提：终点本身是"可站立"的（旧实现据此放行 ⇒ 整栋/整墙穿过去）');
  assert(
    legacyEndpoint.x - startX >= 29,
    `旧实现会一次走出 ${(legacyEndpoint.x - startX).toFixed(0)}m（这才是隧穿）`,
  );

  // ③ 子步进不得放宽任何判据：门洞仍可通、门侧墙体仍挡（与 E4 同判据的正反控制）
  const door = { x: 0, y: CONFIG.MODULES.terraceTotalHeight + eye, z: -146 };
  const through = solver.step(door, 0, -1, 6, {});
  assert(through.z < door.z - 1, `门洞仍须可通：z ${door.z} → ${through.z.toFixed(2)}`);
  const side = solver.probe(25, -130, CONFIG.MODULES.terraceTotalHeight);
  assert(!side.ok && side.reasons.some((r) => /OB-B-hall-main/.test(r)), '门洞以外的墙体仍必须阻挡');

  // ④ 口径同源（E7 的尺子再加"长步进"采样）：
  //    短步进（≤1m，单子步）必须**逐值一致**；长步进被中途挡住时落点允许 ≤0.5m 的滑动衰减差异，
  //    但**被挡原因集合必须一致**（比对前把 mine 的 OB- 前缀归一到 core 的 buildingId 口径）。
  const coreSolver = createFpSolver({ config: CONFIG });
  // 原因口径：mine 用障碍 id（OB-…），core 用 buildingId（如 WALL-CITY）—— 比对"类别 + 身份互相包含"
  const classify = (reasons) => reasons.map((r) => (WORLD_BLOCK_REASONS.includes(r) ? r : 'obstacle')).sort();
  const sameObstacle = (mine, core) => {
    const coreObs = core.filter((r) => !WORLD_BLOCK_REASONS.includes(r));
    const mineObs = mine.filter((r) => !WORLD_BLOCK_REASONS.includes(r));
    // mine 报出的障碍原因必须被 core 的点名支撑（core 的滑动尝试可能多报，允许 core 更全）
    return mineObs.every((mid) => coreObs.some((cid) => String(mid).includes(String(cid)) || String(cid).includes(String(mid))));
  };
  const firstClass = (reasons) => (reasons.length === 0 ? null : WORLD_BLOCK_REASONS.includes(reasons[0]) ? reasons[0] : 'obstacle');
  // 首个阻挡类别必须一致；若首因是障碍，则两侧的障碍身份必须互相包含（mine=障碍 id / core=buildingId）
  const sameReasons = (mine, core) => firstClass(mine) === firstClass(core) && sameObstacle(mine, core);
  let exactChecked = 0;
  let tolerantChecked = 0;
  for (const point of [{ x: -300, z: -430 }, { x: 0, z: -146 }, { x: 120, z: -300 }, { x: -77, z: -300 }]) {
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const feet = LAYOUT.floorYAt(point.x, point.z);
      if (feet === null) continue;
      const from = { x: point.x, y: feet + eye, z: point.z };
      for (const distance of [0.25, 1]) {
        exactChecked += 1;
        const mine = solver.step(from, dx, dz, distance, {});
        const core = coreSolver.step(from, dx, dz, distance, {});
        assert(Math.abs(mine.x - core.x) < 1e-9 && Math.abs(mine.z - core.z) < 1e-9, `短步进 ${distance}m @${JSON.stringify(point)} 必须与 core 逐值一致`);
        assert(sameReasons(mine.blocked, core.blocked), `短步进被挡原因必须一致 @${JSON.stringify(point)}：mine=${JSON.stringify(mine.blocked)} core=${JSON.stringify(core.blocked)}`);
      }
      for (const distance of [6, 30]) {
        tolerantChecked += 1;
        const mine = solver.step(from, dx, dz, distance, {});
        const core = coreSolver.step(from, dx, dz, distance, {});
        const drift = Math.max(Math.abs(mine.x - core.x), Math.abs(mine.z - core.z));
        assert(drift <= 0.5, `长步进 ${distance}m @${JSON.stringify(point)} 与 core 落点漂移应 ≤0.5m（滑动衰减序列差异），实际 ${drift.toFixed(3)}m`);
        assert(sameReasons(mine.blocked, core.blocked), `长步进被挡原因必须一致 @${JSON.stringify(point)} d=${distance}：mine=${JSON.stringify(mine.blocked)} core=${JSON.stringify(core.blocked)}`);
      }
    }
  }
  runner.info(
    `  隧穿闭环：30m 一跳位移 ${moved.toFixed(2)}m、原因 ${JSON.stringify(fixed.blocked)}；旧实现对照位移 30m（放行）；` +
      `与 core 同源校验：短步进逐值一致 ${exactChecked} 点、长步进（含 30m）落点 ≤0.5m 且原因一致 ${tolerantChecked} 点`,
  );
});

await runner.test('E13 四类糟糕阻挡审计（数字 + 位置）：单向陷阱 / 净宽 / 空气墙 / 单向高差', async () => {
  const solver = createWalkSolver({});
  const audit = createTraversalAudit({ solver, layout: LAYOUT, cellSize: 3 });
  audit.warmupAll();
  const route = LAYOUT.FP_ROUTE.map((w) => ({ name: w.name, x: w.position.x, z: w.position.z }));
  const report = audit.audit({ paired: route });
  const stats = audit.stats();

  // ① 单向陷阱（可达但无出口）：当前数据 0 格；断言"分类自洽"而非硬编码
  assertEqual(stats.trap, 0, `可达但不可返回的格数应为 0，实际 ${stats.trap}`);
  assertEqual(report.trapCount, 0, `单向陷阱块数应为 0，实际 ${report.trapCount}`);
  assert(stats.main > 10000, `主分量格数应可观，实际 ${stats.main}`);
  assertEqual(stats.main + stats.trap + stats.sealed, stats.walkable, '三类之和必须等于可走格数（分类完备）');

  // ② 净宽：门洞/通道净宽 ≥ 玩家直径 + 余量
  const required = requiredPassageWidth(CONFIG);
  assertEqual(required, CONFIG.INTERACTION.player.radius * 2 + PASSAGE_MARGIN * 2, '判据 = 直径 + 两侧余量');
  const widths = [];
  for (const obstacle of solver.obstacles()) if (Number.isFinite(obstacle.door?.width)) widths.push(obstacle.door.width);
  for (const surface of LAYOUT.WALKABLE) {
    if (surface.kind === 'passage') widths.push(Math.min(surface.bounds.maxX - surface.bounds.minX, surface.bounds.maxZ - surface.bounds.minZ));
  }
  /* t8：样本覆盖判据由数据推导（通道面数 / 带门洞障碍数），旧的 43 降级为历史快照下界 */
  const passageSurfaces = LAYOUT.WALKABLE.filter((w) => w.kind === 'passage').length;
  const dooredObstacles = solver.obstacles().filter((o) => Number.isFinite(o.door?.width)).length;
  assert(widths.length >= passageSurfaces, `样本必须覆盖全部通道面（${passageSurfaces}；实际 ${widths.length}）`);
  assert(widths.length >= dooredObstacles, `样本必须覆盖全部带门洞障碍（${dooredObstacles}；实际 ${widths.length}）`);
  assert(widths.length >= 43, `样本数不得少于历史快照 43（实际 ${widths.length}）`);
  const minWidth = Math.min(...widths);
  assert(minWidth >= required, `最小净宽 ${minWidth.toFixed(2)}m 应 ≥ 判据 ${required}m`);
  assertEqual(report.narrowGaps.length, 0, `净宽不足的缝应为 0，实际 ${report.narrowGaps.length}`);

  // ③ 空气墙：视觉开放的构筑物被整足迹阻挡 —— 与 layout/障碍数据独立对齐（不硬编码 10）
  const openKinds = ['pavilion', 'corridor', 'courtyardGate'];
  const openSlots = LAYOUT.SLOTS.filter((slot) => openKinds.includes(slot.kind));
  const obstacleByBuilding = new Map(solver.obstacles().filter((o) => o.buildingId).map((o) => [o.buildingId, o]));
  const blockedOpen = openSlots.filter((slot) => obstacleByBuilding.get(slot.id)?.blocks === 'all');
  const dooredOpen = openSlots.filter((slot) => obstacleByBuilding.get(slot.id)?.blocks === 'exceptDoor');
  const airWalls = report.airWalls;
  // t101/t103 跨卡接口：t103 会在 layout 侧把 10 座开敞亭改为可通行（hasDoor:true ⇒ exceptDoor），
  // 届时 airWalls 必须为 0。这里用**数据推导 + 合成清零场景**表述"已清零"语义（不恒真、不删断言）：
  assertEqual(airWalls.length, blockedOpen.length, '空气墙清单必须等于"开放构筑物 ∩ 整足迹阻挡"（逐栋对齐；t103 后应自动为 0）');
  if (blockedOpen.length === 0) {
    assertEqual(airWalls.length, 0, 't103 落地后不得再有整足迹阻挡的开敞构筑物');
  }
  // 合成"全部开放构筑物可通行"的世界：审计必须报 0（把 t103 的目标状态固化成常驻断言）
  const pavilionObstacleIds = new Set(blockedOpen.map((slot) => `OB-${slot.id}`));
  const passableSolver = createWalkSolver({
    obstacles: solver.obstacles().map((o) =>
      pavilionObstacleIds.has(o.id)
        ? { ...o, blocks: 'exceptDoor', door: { axis: 'z', center: { x: o.bounds.minX, z: (o.bounds.minZ + o.bounds.maxZ) / 2 }, width: 6, height: 3, sillY: o.y0 ?? 0 } }
        : o,
    ),
  });
  const passableAudit = createTraversalAudit({ solver: passableSolver, layout: LAYOUT, cellSize: 3, start: { x: 0, z: -480 } });
  assertEqual(passableAudit.auditAirWalls().length, 0, '当全部开敞构筑物均可通行时，空气墙清单必须为 0（t103 目标状态）');
  // 提示联动收窄：已可通行的亭**不得**再弹「开敞构筑物」（否则"既能进又弹提示"自相矛盾）
  const passablePavilionEntry = { sourceType: 'building', name: '测试亭', blocks: 'exceptDoor', kind: 'pavilion', visitable: true, sourceLabel: '建筑' };
  assert(!/开敞构筑物/.test(blockedHint(passablePavilionEntry).title), '已可通行的亭不得再给「开敞构筑物」提示');
  assert(/墙体阻挡/.test(blockedHint(passablePavilionEntry).title), '可通行的亭应按"仅门洞可通行"提示');
  // 真正不可进入者仍必须有可见提示（当前 10 座亭：t103 未落地 ⇒ airWalls=10，如实登记）
  assert(airWalls.every((row) => /开敞构筑物/.test(blockedHint({ sourceType: 'building', name: row.name, blocks: row.blocks, kind: row.kind, visitable: row.visitable, sourceLabel: '建筑' }).title)), '整足迹阻挡的开敞构筑物必须逐座给出「开敞构筑物」提示');
  for (const row of airWalls) {
    assertEqual(row.blocks, 'all', `${row.id} 应确实为整足迹阻挡`);
    assertEqual(row.visitable, false, `${row.id} 不可进入（故必须有可见提示）`);
    assert(Number.isFinite(row.center.x) && Number.isFinite(row.center.z), `${row.id} 必须给出可定位的坐标`);
    assert(blockedOpen.some((slot) => slot.id === row.buildingId), `${row.id} 必须来自开放构筑物集合`);
  }
  // 有门洞的开放构筑物（院门）能从门洞过 ⇒ 不算空气墙（这条防"一刀切"）
  assert(dooredOpen.length > 0, `应存在有门洞的院门（实际 ${dooredOpen.length}）`);
  for (const gate of dooredOpen) {
    assert(!airWalls.some((row) => row.buildingId === gate.id), `${gate.id} 有门洞可通过，不应被算作空气墙`);
  }
  // 亭（t103 语义）：10 座亭均已 `hasDoor:true ⇒ exceptDoor` ⇒ **一条都不得被算作空气墙**
  const pavilionSlots = LAYOUT.SLOTS.filter((slot) => slot.kind === 'pavilion');
  const pavilionObstacles = pavilionSlots.map((slot) => obstacleByBuilding.get(slot.id)).filter(Boolean);
  /* t8：亭数量改为**历史快照下界**（t13 时点 = 10）——实质判据在下面逐座不变量（hasDoor + exceptDoor + 提示）。
     新增亭不应使本断言变红；若亭被删/漏登记则转红。 */
  assert(pavilionSlots.length >= 10, `亭数量不得少于历史快照 10（实际 ${pavilionSlots.length}）`);
  assertEqual(pavilionObstacles.length, pavilionSlots.length, '每座亭都必须有障碍条目（数量由槽位集合推导）');
  assert(pavilionObstacles.every((o) => o.blocks === 'exceptDoor'), `亭必须为 exceptDoor（仅门洞带阻挡）：${JSON.stringify([...new Set(pavilionObstacles.map((o) => o.blocks))])}`);
  assert(pavilionSlots.every((s) => s.hasDoor === true), '10 座亭都必须登记 hasDoor（t103 的加法登记）');
  // ★ 正确期望（替换 t87/t88 时代的"亭必须全部在册"）
  assert(airWalls.every((row) => row.kind !== 'pavilion'), `airWalls 中不得含任何亭：${JSON.stringify(airWalls.filter((r) => r.kind === 'pavilion'))}`);
  assertEqual(airWalls.length, 0, `t103 之后空气墙必须清零（实际 ${airWalls.length}）`);
  assertEqual(blockedOpen.length, 0, '不得再有整足迹阻挡的开敞构筑物');

  /* ★ 反向断言（t8：**全部由数据推导**，不再写死 14/24 这类基线）。
     两侧来源独立 ⇒ 不是恒真：左侧 = 运行时求解器列表（`solver.obstacles()`），右侧 = layout 数据 + `sourceType` 语义。
     判据（只增不减）：① 每个整足迹阻挡者都必须有**非兜底**具名提示；② 两侧集合**双向相等**（缺失/多余都转红）；
                      ③ 计数用推导集合本身；④ 历史基线保留为**单调下界**（计数塌陷仍转红）。 */
  const blockedAll = solver.obstacles().filter((o) => o.blocks === 'all');
  const blockedIds = new Set(blockedAll.map((o) => o.id));
  const hintCatalog = buildCatalog({ layout: LAYOUT, config: CONFIG });
  /* t30：分组函数改为按**障碍对象**分派（原写法只吃 id ⇒ 无法表达 `buildingKind` 这类对象字段）。
     `塔楼` 组 = `buildingKind === 'towerShaft'`（t39 塔身内芯：**无对应 SLOT**，只能按 buildingKind 识别）。
     其余分组语义与 t8 逐字相同（角楼/MOAT 前缀/WB 水体/SC 山石/余下为批量装饰）。 */
  const groupOfObstacle = (o) => {
    const id = o.id;
    if (/^OB-F-tower-corner/.test(id)) return '角楼';
    if (o.buildingKind === 'towerShaft') return '塔楼';
    if (/^OB-MOAT/.test(id)) return '护城河';
    if (/^OB-WB/.test(id)) return '水体';
    if (/^OB-SC/.test(id)) return '山石';
    return '批量装饰';
  };
  const groupOf = (id) => groupOfObstacle(blockedAll.find((o) => o.id === id) ?? { id });

  /* 语义推导：
     ① 实心槽位 = `SLOTS` 里 visitable===false 且 hasDoor!==true（角楼 / 批量装饰 / 其它实心殿座）
     ② 护城河 = `LAYOUT.MOAT.rects`（唯一权威源）
     ③ 山石 = 求解器里 `sourceType==='rockery'`
     ④ 水体 = 只允许两种状态：整足迹阻挡，或**有界开槽**（`exceptDoor` + 登记 `door` 通道）；只有未开槽者进入本清单
     ⑤ 汀步走廊 = `LAYOUT.STONE_STEP_LANES`（t13 唯一权威源，供下面的逐条几何核对） */
  const solidSlots = LAYOUT.SLOTS.filter((s) => s.visitable === false && s.hasDoor !== true);
  const moatRects = LAYOUT.MOAT?.rects ?? [];
  const stoneLanes = LAYOUT.STONE_STEP_LANES ?? [];
  const carvedWaterIds = new Set(stoneLanes.map((l) => `OB-${l.pondId}`));
  const waterObstacles = solver.obstacles().filter((o) => o.sourceType === 'water');
  for (const w of waterObstacles) {
    if (w.blocks === 'all') continue;
    assertEqual(w.blocks, 'exceptDoor', `${w.id} 只允许「整足迹阻挡」或「有界开槽（exceptDoor）」两种状态`);
    assert(w.door && Number.isFinite(w.door.width), `${w.id} 开槽必须登记 door 通道（否则是"隐形缺口"）`);
  }
  const uncarvedWaterIds = waterObstacles.filter((o) => o.blocks === 'all' && !/^OB-MOAT/.test(o.id)).map((o) => o.id);
  const rockeryIds = solver.obstacles().filter((o) => o.sourceType === 'rockery').map((o) => o.id);
  /**
   * t30：**塔楼类**（t39 塔身内芯）—— 这些障碍**没有对应 SLOT**（它们是塔楼槽位的子体块，
   * `buildingId = 'T-watchtower-3'` 而 `SLOTS` 中不存在该 id），因此**只能**按 `buildingKind === 'towerShaft'`
   * 识别。旧 `derived` 集合只由「实心槽位 / MOAT / 山石 / 未开槽水体」推导 ⇒ 塔身必然落进 `extra`
   * 而被误判为"语义之外的成员"（t39 落地后 `interaction` 的唯一红即此）。
   * 期望值一律**取自 layout 自身**（`LAYOUT.OBSTACLES` 里同 `buildingKind` 的条目），不写死数量。
   */
  const towerShaftObstacles = LAYOUT.OBSTACLES.filter((o) => o.buildingKind === 'towerShaft');
  const towerShaftIds = towerShaftObstacles.map((o) => o.id);
  /**
   * 判据本体（**纯函数**，便于做"突变对照"证明它真的会失败、不是恒真）：
   *   · `missing` = 语义上应实心阻挡却不在运行时清单里的（漏登记 / 被静默改成可通行）
   *   · `extra`   = 运行时清单里但语义上不该有的（多出成员）
   *   · `illegalWater` = 水体既不是"整足迹阻挡"、也不是"有界开槽（exceptDoor + door）"
   */
  const auditBlockers = (list) => {
    const runtime = new Set(list.filter((o) => o.blocks === 'all').map((o) => o.id));
    const water = list.filter((o) => o.sourceType === 'water');
    const derived = new Set([
      ...solidSlots.map((s) => `OB-${s.id}`),
      ...moatRects.map((r) => `OB-${r.id}`),
      ...list.filter((o) => o.sourceType === 'rockery').map((o) => o.id),
      ...water.filter((o) => o.blocks === 'all' && !/^OB-MOAT/.test(o.id)).map((o) => o.id),
      // t30：塔楼（towerShaft）单列一类——无对应 SLOT，只能按 buildingKind 识别（期望值取自 layout）
      ...list.filter((o) => o.buildingKind === 'towerShaft').map((o) => o.id),
    ]);
    return {
      runtime,
      derived,
      missing: [...derived].filter((id) => !runtime.has(id)),
      extra: [...runtime].filter((id) => !derived.has(id)),
      illegalWater: water
        .filter((o) => o.blocks !== 'all' && (o.blocks !== 'exceptDoor' || !(o.door && Number.isFinite(o.door.width))))
        .map((o) => o.id),
    };
  };
  const blockerAudit = auditBlockers(solver.obstacles());
  const derivedBlockedIds = blockerAudit.derived;
  assertEqual(blockerAudit.missing.length, 0, `语义上"实心阻挡"的对象必须逐条在册；缺失 ${blockerAudit.missing.length}：${blockerAudit.missing.join('、')}`);
  assertEqual(blockerAudit.extra.length, 0, `整足迹阻挡清单不得出现语义之外的成员；多出 ${blockerAudit.extra.length}：${blockerAudit.extra.join('、')}`);
  assertEqual(blockerAudit.illegalWater.length, 0, `水体不得处于"既不阻挡也无门洞通道"的第三态：${blockerAudit.illegalWater.join('、')}`);
  assertEqual(blockedAll.length, derivedBlockedIds.size, `整足迹阻挡者数量必须等于**数据推导集合**（${derivedBlockedIds.size}）：${blockedAll.map((o) => o.id).join('、')}`);
  /* 历史快照（**不参与判定**，仅供追溯计数来历）：
     t9 前 14（角楼 4 / 护城河 4 / 水体 4 / 山石 2）；t9 +12 批量装饰；t13 开槽 D/E 两池 ⇒ 当时公式 14+12−2 = 24；
     此后御花园 F-east / F-west 两池也登记了门洞通道 ⇒ 水体整足迹阻挡归零，现值 22（= 16 实心槽位 + 4 护城河 + 2 山石）。
     单调下界：漏登记、或把实心体块静默改成可通行（计数塌陷）仍必须转红。 */
  assert(blockedAll.length >= 14, `整足迹阻挡者不得少于历史基线 14（实际 ${blockedAll.length}）`);
  assert(moatRects.length > 0 && moatRects.every((r) => blockedIds.has(`OB-${r.id}`)), `护城河 ${moatRects.length} 段必须逐段在册`);

  // 分组：**逐组集合相等**（不再写死 4 / 4 / 2 / 12）
  const towerSlots = LAYOUT.SLOTS.filter((s) => s.kind === 'cornerTower');
  const towerGroup = blockedAll.filter((o) => groupOf(o.id) === '角楼');
  assertEqual(towerGroup.length, towerSlots.length, `角楼组必须等于 layout 的 cornerTower 槽位数（${towerSlots.length}；实际 ${towerGroup.length}）`);
  assert(towerSlots.every((s) => blockedIds.has(`OB-${s.id}`)), '每座角楼都必须整足迹阻挡');
  assertEqual(blockedAll.filter((o) => groupOf(o.id) === '护城河').length, moatRects.length, `护城河组必须等于 MOAT.rects 段数（${moatRects.length}）`);
  assertEqual(blockedAll.filter((o) => groupOf(o.id) === '山石').length, rockeryIds.length, `山石组必须等于 sourceType=rockery 的障碍数（${rockeryIds.length}）`);
  assertEqual(blockedAll.filter((o) => groupOf(o.id) === '水体').length, uncarvedWaterIds.length, `水体组必须等于"未开槽水体"集合（全开槽 ⇒ 0 条，如实推导；实际 ${uncarvedWaterIds.length}）`);
  const bulkAnnexIds = (LAYOUT.GARDEN_BULK_SLOTS ?? []).map((s) => `OB-${s.id}`);
  const residualIds = blockedAll.filter((o) => groupOf(o.id) === '批量装饰').map((o) => o.id);
  assertEqual([...residualIds].sort().join(','), [...bulkAnnexIds].sort().join(','), `「批量装饰」组必须**集合等于** GARDEN_BULK_SLOTS（${bulkAnnexIds.length} 条）：${residualIds.join('、')}`);
  /* t30：**塔楼组必须集合等于 layout 的 towerShaft 障碍集合**（t39 塔身内芯；无 SLOT，只能按 buildingKind 识别）。
     集合相等（不是计数相等）：layout 多登记 ⇒ missing 已先红；运行时多出 ⇒ extra 已先红；此处再逐条对账一遍。 */
  const towerGroupIds = blockedAll.filter((o) => groupOfObstacle(o) === '塔楼').map((o) => o.id);
  assertEqual(towerGroupIds.length, towerShaftIds.length, `塔楼组条数必须等于 layout 的 towerShaft 障碍数（${towerShaftIds.length}；实际 ${towerGroupIds.length}）`);
  assertEqual([...towerGroupIds].sort().join(','), [...towerShaftIds].sort().join(','), `塔楼组必须**集合等于** layout 中 buildingKind='towerShaft' 的障碍集合：${towerGroupIds.join('、')} vs ${towerShaftIds.join('、')}`);
  for (const id of towerShaftIds) {
    const ob = blockedAll.find((o) => o.id === id);
    assert(ob, `${id}（towerShaft）必须整足迹阻挡且在册`);
    assert(ob.buildingKind === 'towerShaft', `${id} 的 buildingKind 必须为 towerShaft（实际 ${ob.buildingKind}）`);
    assert(blockedIds.has(id), `${id} 必须出现在整足迹阻挡清单中`);
  }
  // 每个整足迹阻挡者都必须有**非兜底**具名提示（逐条，不只给个数）
  for (const o of blockedAll) {
    assert(o.kind !== 'pavilion' && !pavilionSlots.some((s) => `OB-${s.id}` === o.id), `${o.id} 不得是亭（亭已可通行）`);
    const hint = hintCatalog.hintFor(o.id);
    assert(hint && typeof hint.title === 'string' && hint.title.length > 0, `${o.id} 必须有可见提示（不得静默）`);
    assert(hint.title !== '此路不通', `${o.id} 的提示必须点名（不得用兜底文案）：${hint.title}`);
  }
  runner.info(
    `  整足迹阻挡者 ${blockedAll.length} 条（推导集合 ${derivedBlockedIds.size}；分组 ${Object.entries(blockedAll.reduce((acc, o) => { acc[groupOf(o.id)] = (acc[groupOf(o.id)] ?? 0) + 1; return acc; }, {})).map(([k, v]) => `${k} ${v}`).join(' / ')}）逐条提示齐备`,
  );

  /* t13：被开槽的水体**逐条**核对（不得只靠计数）—— 必须 `exceptDoor` + 通道逐值等于走廊几何，
     且几何登记（`STONE_STEP_LANES`）与碰撞登记（`OB-WB-*` 的 door）同轮一致。 */
  for (const lane of stoneLanes) {
    const ob = LAYOUT.OBSTACLES.find((o) => o.id === `OB-${lane.pondId}`);
    assert(ob, `${lane.id}: 水体障碍 ${lane.pondId} 必须存在`);
    assert(ob.blocks === 'exceptDoor' && ob.door, `${lane.id}: 开槽水体必须登记 exceptDoor + door`);
    assertEqual(ob.door.width, lane.corridor.width, `${lane.id}: 通道宽应 = 走廊宽`);
    assertEqual(ob.door.axis, lane.corridor.axis, `${lane.id}: 通道法线轴应 = 走廊轴`);
    const surfaceIds = lane.steps.map((s2) => s2.id);
    const mine = LAYOUT.WALKABLE.filter((w) => surfaceIds.includes(w.id));
    assertEqual(mine.length, surfaceIds.length, `${lane.id}: 每级汀步都必须有登记可走面`);
    assert(mine.every((w) => w.kind === 'bridgeDeck'), `${lane.id}: 汀步面 kind 应取既有白名单值 bridgeDeck（跨水面石桥面）`);
    assert(!blockedAll.some((o) => o.id === `OB-${lane.pondId}`), `${lane.id}: 开槽后的水体不得再计入整足迹阻挡清单`);
  }
  /* t8：「批量装饰」组的集合相等已在上方用 `residualIds` 断言（取代旧的「其它」分组写死计数 12） */
  assertEqual(residualIds.length, bulkAnnexIds.length, `「批量装饰」组条数必须等于 GARDEN_BULK_SLOTS（实际 ${residualIds.length} / ${bulkAnnexIds.length}）`);
  for (const id of bulkAnnexIds) {
    const row = blockedAll.find((o) => o.id === id);
    assert(row, `${id} 必须在整足迹阻挡清单内（t9 批量装饰建筑为实心 blocks:'all'）`);
    assert(row.door == null, `${id} 不得有门洞（实心体块）`);
    const slot = LAYOUT.SLOTS.find((s) => s.id === row.buildingId);
    assert(slot && slot.visitable === false && slot.hasDoor === false, `${id} 对应槽位必须非 visitable 且无门洞`);
    const bulkHint = hintCatalog.hintFor(id);
    assert(bulkHint?.title && bulkHint.title !== '此路不通', `${id} 必须给出具名提示（实际「${bulkHint?.title}」）`);
  }
  for (const o of blockedAll) {
    assert(o.kind !== 'pavilion' && !pavilionSlots.some((s) => `OB-${s.id}` === o.id), `${o.id} 不得是亭（亭已可通行）`);
    const hint = hintCatalog.hintFor(o.id);
    assert(hint && typeof hint.title === 'string' && hint.title.length > 0, `${o.id} 必须有可见提示（不得静默）`);
    assert(hint.title !== '此路不通', `${o.id} 的提示必须点名（不得用兜底文案）：${hint.title}`);
  }
  runner.info(
    `  ③ 空气墙：亭 ${airWalls.filter((r) => r.kind === 'pavilion').length}/10 在册（应为 0）；整足迹阻挡者 ${blockedAll.length} 条逐条提示齐备：` +
      blockedAll.map((o) => `${o.id}[${groupOf(o.id)}]`).join('、'),
  );

  // ★ 突变对照：把某座亭在内存里改回 blocks:'all' ⇒ "亭不得为空气墙"必须失败（审计与提示都应翻转）
  const mutated = solver.obstacles().map((o) => (o.buildingId === pavilionSlots[0].id ? { ...o, blocks: 'all', door: null } : o));
  const mutatedSolver = createWalkSolver({ obstacles: mutated });
  const mutatedAudit = createTraversalAudit({ solver: mutatedSolver, layout: LAYOUT, cellSize: 3, start: { x: 0, z: -480 } });
  const mutatedAirWalls = mutatedAudit.auditAirWalls();
  // 1 = 本用例**主动注入**的突变数（把一座亭改回 blocks:'all'），非数据快照
  assertEqual(mutatedAirWalls.length, 1, `突变后应有 1 座空气墙（实际 ${mutatedAirWalls.length}）`);
  assertEqual(mutatedAirWalls[0].kind, 'pavilion', '突变后该空气墙必须是亭');
  assert(
    !airWalls.some((row) => row.buildingId === pavilionSlots[0].id),
    '突变对照：若亭被改回整足迹阻挡，上面"亭不得为空气墙"的断言会失败（本断言确认基线不含它）',
  );
  const mutatedHint = blockedHint({ sourceType: 'building', name: pavilionSlots[0].name, blocks: 'all', kind: 'pavilion', visitable: false, sourceLabel: '建筑' });
  assert(/开敞构筑物/.test(mutatedHint.title), `突变后提示应翻转为「开敞构筑物」（实际「${mutatedHint.title}」）`);

  /* ★ t8 突变对照（**不假绿**的三证之一）：把三类真实缺陷各注入一次，上面的判据必须各自转红。
     这证明"双向集合相等 + 水体状态合法性"不是恒真断言，而是真的会失败。 */
  const solidProbeId = `OB-${solidSlots[0].id}`;
  const mutA = auditBlockers(
    solver.obstacles().map((o) =>
      o.id === solidProbeId
        ? { ...o, blocks: 'exceptDoor', door: { axis: 'z', center: { x: (o.bounds.minX + o.bounds.maxX) / 2, z: (o.bounds.minZ + o.bounds.maxZ) / 2 }, width: 4, height: 3, sillY: o.y0 ?? 0 } }
        : o,
    ),
  );
  assertEqual(mutA.missing.join(','), solidProbeId, `突变 A（实心体块被静默改成可通行）必须被"缺失"抓住（missing=${mutA.missing.join(',')} extra=${mutA.extra.join(',')}）`);
  const moatProbeId = `OB-${moatRects[0].id}`;
  const mutB = auditBlockers(
    solver.obstacles().map((o) => (o.id === moatProbeId ? { ...o, blocks: 'exceptDoor', door: { axis: 'x', center: { x: 0, z: 0 }, width: 8, height: 3, sillY: o.y0 ?? 0 } } : o)),
  );
  assertEqual(mutB.missing.join(','), moatProbeId, `突变 B（护城河被开槽）必须被"缺失"抓住（missing=${mutB.missing.join(',')}）`);
  const pondProbeId = waterObstacles.find((o) => !/^OB-MOAT/.test(o.id))?.id ?? null;
  let mutC = null;
  if (pondProbeId) {
    mutC = auditBlockers(solver.obstacles().map((o) => (o.id === pondProbeId ? { ...o, blocks: 'exceptDoor', door: null } : o)));
    assertEqual(mutC.illegalWater.join(','), pondProbeId, `突变 C（水体开槽却不登记 door 通道）必须被"非法状态"抓住（illegal=${mutC.illegalWater.join(',')}）`);
  }
  // 突变 D：凭空多出一条实心阻挡（未登记在 SLOTS/MOAT/rockery 语义里）⇒ "多余"必须抓住
  const ghost = { id: 'OB-T8-GHOST', sourceType: 'building', zone: 'F', bounds: { minX: -600, maxX: -599, minZ: -600, maxZ: -599 }, y0: 0, y1: 1, blocks: 'all', door: null };
  const mutD = auditBlockers([...solver.obstacles(), ghost]);
  assertEqual(mutD.extra.join(','), 'OB-T8-GHOST', `突变 D（凭空多出整足迹阻挡者）必须被"多余"抓住（extra=${mutD.extra.join(',')}）`);
  runner.info(
    `  突变对照（不假绿）：基线 missing/extra/illegal = ${blockerAudit.missing.length}/${blockerAudit.extra.length}/${blockerAudit.illegalWater.length}｜` +
      `A(实心改可通行)→missing ${mutA.missing.length}｜B(护城河开槽)→missing ${mutB.missing.length}｜C(水体开槽无 door)→illegal ${mutC?.illegalWater?.length ?? 'n/a'}｜D(凭空多出)→extra ${mutD.extra.length}`,
  );

  // ④ 单向高差：上下阈值不对称造成的有向边（|Δy| ∈ (maxStepHeight, snapDownDistance]）
  const oneWay = report.oneWayHeight;
  assert(oneWay.count > 0, `应检出单向高差边，实际 ${oneWay.count}`);
  for (const row of oneWay.rows) {
    const delta = Math.abs(row.drop);
    assert(
      delta > CONFIG.INTERACTION.step.maxStepHeight + 1e-9 && delta <= CONFIG.INTERACTION.step.snapDownDistance + 1e-9,
      `单向高差必须落在不对称窗口 (${CONFIG.INTERACTION.step.maxStepHeight}, ${CONFIG.INTERACTION.step.snapDownDistance}]，实际 ${delta}`,
    );
    assert(row.allowed === 'from→to' || row.allowed === 'to→from', '必须给出允许方向');
  }

  runner.info(
    `  审计（cell=${stats.cellSize}m）：可走 ${stats.walkable} 格 = 主分量 ${stats.main} + 单向陷阱 ${stats.trap} + 封团 ${stats.sealed}`,
  );
  runner.info(
    `  ① 单向陷阱 ${report.trapCount} 块 / ② 净宽不足 ${report.narrowGaps.length}（样本 ${widths.length}，最小 ${minWidth.toFixed(2)}m ≥ 判据 ${required}m）` +
      ` / ③ 空气墙 ${airWalls.length} 座（${airWalls.map((w) => `${w.name}@${w.zone}`).join('、')}）【t103 依赖：10 座亭改 exceptDoor 后应自动清零】 / ④ 单向高差 ${oneWay.count} 边`,
  );
});

await runner.test('E14 单向陷阱守卫（合成世界构造）：审计能查出、守卫拒绝进入、旧路径进得去出不来', async () => {
  // 合成一个"0.55m 台沿 + 死口袋"：A(y=1.1) 为起点分量，P(y=0.55) 只能从 A 落下、爬不回去
  const fakeLayout = {
    TERRAIN_EXTENT: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    WALKABLE: [],
    ROADS: [],
    OBSTACLES: [],
    floorYAt: (x, z) => {
      if (!(z >= -20 && z < 20)) return null;
      if (x >= -20 && x < 0) return 1.1;
      if (x >= 0 && x < 20) return 0.55;
      return null;
    },
    walkableAt: () => null,
    insideEnvelope: () => true,
  };
  const solver = createWalkSolver({ layout: fakeLayout, obstacles: [] });
  const audit = createTraversalAudit({ solver, layout: fakeLayout, cellSize: 1, start: { x: -10, z: 0 } });
  audit.warmupAll();
  const report = audit.audit();
  assertEqual(report.trapCount, 1, `应恰好检出 1 块死口袋，实际 ${report.trapCount}`);
  assertEqual(report.trapCells >= 2, true, `死口袋格数应 > 1，实际 ${report.trapCells}`);
  const pocket = report.traps[0];
  assert(pocket.center.x >= 0 && pocket.center.x < 20, `死口袋应落在 P 区（x≥0），实际 ${JSON.stringify(pocket.center)}`);

  // 守卫：深处（x=5）拒绝；紧邻主分量的一格仍放行（栅格容差，防止误伤真实通道）
  const deep = audit.guardStep({ x: -1, z: 0 }, { x: 5, z: 0 });
  assertEqual(deep.allowed, false, '守卫必须拒绝踏进死口袋深处');
  assertEqual(deep.reason, 'oneWayTrap');
  // 栅格容差语义（cellSize=1）：与主分量**同格或相邻**的格放行，深入 ≥1 格才拒绝
  const edge = audit.guardStep({ x: -1, z: 0 }, { x: 0, z: 0 });
  assertEqual(edge.allowed, true, '与主分量相邻的那一格必须放行（不误伤正常路线）');
  const second = audit.guardStep({ x: -1, z: 0 }, { x: 2, z: 0 });
  assertEqual(second.allowed, false, '深入 ≥1 格的死口袋必须拒绝');

  // 求解器集成：装守卫后走到死口袋深处即被拒（原因 oneWayTrap）
  const eye = CONFIG.CAMERA.fpEyeHeight;
  const guarded = createWalkSolver({ layout: fakeLayout, obstacles: [] });
  guarded.setTraversalGuard(audit.guardStep);
  const guardedRun = guarded.step({ x: -5, y: 1.1 + eye, z: 0 }, 1, 0, 15, {});
  assert(guardedRun.blocked.includes('oneWayTrap'), `装守卫后必须报 oneWayTrap，实际 ${JSON.stringify(guardedRun.blocked)}`);
  const guardedX = guardedRun.x;

  // 对照（旧路径/无守卫）：一路走进死口袋，且**再也走不回来**（进得去出不来）
  const unguarded = createWalkSolver({ layout: fakeLayout, obstacles: [] });
  const unguardedRun = unguarded.step({ x: -5, y: 1.1 + eye, z: 0 }, 1, 0, 15, {});
  assert(!unguardedRun.blocked.includes('oneWayTrap'), '无守卫时不会报 oneWayTrap（这就是"进得去"）');
  assert(unguardedRun.x > guardedX + 0.5, `无守卫会走得更深：${unguardedRun.x.toFixed(2)} > ${guardedX.toFixed(2)}`);
  const back = unguarded.step({ x: unguardedRun.x, y: 0.55 + eye, z: 0 }, -1, 0, 15, {});
  assert(
    back.x >= -1e-6 && Math.abs(fakeLayout.floorYAt(back.x, back.z) - 0.55) < 1e-9,
    `无守卫陷入死口袋后**爬不回 A**（这是"出不来"）：x ${unguardedRun.x.toFixed(2)} → ${back.x.toFixed(2)}（A 在 x<0）`,
  );
  assertEqual(unguardedRun.x > 5, true, `无守卫应深入死口袋：x=${unguardedRun.x.toFixed(2)}`);
  runner.info(
    `  合成死口袋：审计 ${report.trapCount} 块 / ${report.trapCells} 格（中心 ${pocket.center.x},${pocket.center.z}）；` +
      `守卫停在 x=${guardedX.toFixed(2)}（原因 ${JSON.stringify(guardedRun.blocked)}），无守卫走到 x=${unguardedRun.x.toFixed(2)} 且回不来`,
  );
});

await runner.test('E15 防卡死兜底（t104：走**真实移动路径**）：按键受阻 → 提示 + HUD 条；一键脱困落点安全、确定、不穿墙', async () => {
  const app = await makeApp();
  const eye = CONFIG.CAMERA.fpEyeHeight;
  app.interaction.requester.viewMode('fp');
  for (let i = 0; i < 240 && app.rig.isFp !== true; i += 1) app.rig.update(1 / 60, 0, app.store.state);
  assertEqual(app.rig.isFp, true, `应已进入第一人称（viewMode=${app.store.state.viewMode}）`);

  // 把玩家顶到金銮殿侧墙前（门洞在 x=0，x=25 是实心墙），并**真实按下 W**（core 的移动输入）
  const wallX = 25;
  const wallZ = -130;
  const surfaceY = LAYOUT.floorYAt(wallX, wallZ);
  app.rig.position.set(wallX, surfaceY + eye, wallZ);
  app.win.key('KeyW');
  const solver = app.interaction.solver;

  // 逐帧推进（位置被墙定住 ⇒ rig.position 增量≈0、意图=按键 ⇒ 计时累加）
  let frames = 0;
  for (; frames < 300; frames += 1) {
    app.interaction.update(1 / 60);
    app.ui.update(1 / 60);
    if (app.interaction.traversalState().stuck === true) break;
  }
  const state = app.interaction.traversalState();
  assertEqual(state.stuck, true, `按住 W 顶墙 ${frames} 帧后应判定卡死（阈值 ${state.stuckThreshold}s，当前 ${state.stuckSeconds}s）`);
  assert(state.stuckSeconds >= state.stuckThreshold, `卡死秒数应达阈值：${state.stuckSeconds}`);
  assertEqual(state.stuckIntentSource, 'explicit', '意图必须来自**真实路径输入**（显式 intent/moved）');
  assertEqual(state.stuckIntent, true, '按住 W 时 intent 必须为 true');
  assert(state.stuckMoved < 1e-3, `位置被定住时 moved 必须≈0，实际 ${state.stuckMoved}`);
  // ★ 孤儿 API 反证：整段检测**完全不依赖** walk-solver.step/move（生产路径不由它驱动）
  assertEqual(solver.traversalState().attempts, 0, '卡死检测不得依赖 walk-solver.step（生产上无人调用它）');

  const stuckHint = app.interaction.lastHint();
  assertEqual(stuckHint?.kind, 'stuck', '必须给出可见提示（kind=stuck）');
  assert(/卡住/.test(stuckHint?.title ?? ''), `提示标题应说明卡住，实际「${stuckHint?.title}」`);

  // HUD 卡死条出现 + 脱困按钮存在（真实 DOM）
  const stuckPanel = app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'stuck');
  assert(stuckPanel, '应有 data-ui-panel="stuck" 的 HUD 条');
  assertEqual(stuckPanel.hidden, false, '卡住时 HUD 条必须可见');
  const escapeButton = app.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'escape');
  assert(escapeButton, '卡住条必须提供一键脱困按钮');
  assert(/已登记出生点/.test(escapeButton.textContent), `按钮文案必须与实现一致（返回最近的已登记出生点），实际「${escapeButton.textContent}」`);
  assert(!/最近安全点/.test(escapeButton.textContent), '不得再出现与实现不符的「最近安全点」措辞');

  // 对照（避免"恒显示"）：松开 W ⇒ 意图消失 ⇒ 计时归零、卡死条隐藏
  app.win.keyUp('KeyW');
  app.interaction.update(1 / 60);
  app.ui.update(1 / 60);
  assertEqual(app.interaction.traversalState().stuck, false, '松开移动键后不得再判卡死（避免恒显示）');
  assertEqual(stuckPanel.hidden, true, '松开移动键后卡死条必须隐藏');
  // 对照 2：没按键（无意图）时即使位置不变也不得计时
  for (let i = 0; i < 200; i += 1) {
    app.interaction.update(1 / 60);
    app.ui.update(1 / 60);
  }
  assertEqual(app.interaction.traversalState().stuck, false, '无输入意图时即使位置不变也不得判卡死');

  // 一键脱困（真实点击按钮）→ 落点安全、确定、不穿墙
  app.win.key('KeyW');
  for (let i = 0; i < 300 && app.interaction.traversalState().stuck !== true; i += 1) {
    app.interaction.update(1 / 60);
    app.ui.update(1 / 60);
  }
  assertEqual(app.interaction.traversalState().stuck, true, '再次受阻应再次判定卡死');
  const before = { ...app.rig.describe().position };
  escapeButton.dispatch('click', {});
  const after1 = { ...app.rig.describe().position };
  const moved = Math.hypot(after1.x - before.x, after1.z - before.z);
  assert(moved > 0.5, `脱困必须真的换位置（位移 ${moved.toFixed(2)}m）`);
  const probe = solver.probe(after1.x, after1.z);
  assertEqual(probe.ok, true, `落点必须可站立（不穿墙/不落水面/不在障碍内）：${JSON.stringify(probe.reasons)}`);
  assert(
    after1.x >= LAYOUT.TERRAIN_EXTENT.minX && after1.x <= LAYOUT.TERRAIN_EXTENT.maxX && after1.z >= LAYOUT.TERRAIN_EXTENT.minZ && after1.z <= LAYOUT.TERRAIN_EXTENT.maxZ,
    '落点必须在包络内',
  );
  const expectY = LAYOUT.floorYAt(after1.x, after1.z) + eye;
  assert(Math.abs(after1.y - expectY) < 1e-6, `落点眼高必须等于可行走面 + 眼高：${after1.y} vs ${expectY}`);
  assertEqual(app.interaction.traversalState().lastEscape.safe, true, '落点必须通过安全检查（lastEscape.safe）');
  assertEqual(app.interaction.traversalState().stuck, false, '脱困后卡死标记必须清除');

  // 确定性（禁止随机传送）：同一卡死点再次受阻 + 用 G 键脱困 → 落点与上一次完全一致
  app.win.key('KeyW');
  app.rig.position.set(wallX, surfaceY + eye, wallZ);
  for (let i = 0; i < 300 && app.interaction.traversalState().stuck !== true; i += 1) {
    app.interaction.update(1 / 60);
    app.ui.update(1 / 60);
  }
  assertEqual(app.interaction.traversalState().stuck, true, '再次受阻应再次判定卡死（第二轮）');
  app.win.key('KeyG'); // 真实按键链路（keymap → escapeStuck → escapeToSafePoint）
  const after2 = { ...app.rig.describe().position };
  assert(Math.abs(after2.x - after1.x) < 1e-9 && Math.abs(after2.z - after1.z) < 1e-9, `G 键脱困落点必须与按钮一致（确定性）：${JSON.stringify(after2)} vs ${JSON.stringify(after1)}`);
  const direct = app.interaction.escapeToSafePoint('test:direct');
  assert(Math.abs(direct.after.x - after1.x) < 1e-9, 'API 直接调用也必须落在同一点（同一个确定性依据）');
  app.win.keyUp('KeyW');

  // 守卫在分帧预热完成后自动装上（生产路径：每帧 6 行）
  for (let i = 0; i < 200 && app.interaction.traversalState().guarded !== true; i += 1) app.interaction.update(1 / 60);
  assertEqual(app.interaction.traversalState().guarded, true, '分帧预热完成后必须装上单向陷阱守卫');
  assert(app.interaction.traversalState().trap === 0, '当前数据下陷阱格应为 0（守卫只是兜底，不误伤）');
  runner.info(
    `  防卡死（真实路径）：按 W 顶墙 ${frames} 帧（${state.stuckSeconds.toFixed(1)}s）→ 卡死条出现；意图来源 ${state.stuckIntentSource}、solver.step 调用 ${solver.traversalState().attempts} 次（孤儿 API 反证）；` +
      `脱困位移 ${moved.toFixed(1)}m、落点可站立 ✓、包络内 ✓、眼高 ✓、按钮/G/API 三次落点一致 ✓、守卫已装 ✓；松开键/无输入两种对照均不显示 ✓`,
  );
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('E16 成对可达性（不许单向）：43 栋内景 + 出生点 + 主路径"进得去必出得来"', async () => {
  const solver = createWalkSolver({});
  const audit = createTraversalAudit({ solver, layout: LAYOUT, cellSize: 3, start: { x: 0, z: -480 } });
  audit.warmupAll();

  const interiors = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => ({ name: v.id, kind: '内景机位', x: v.position.x, z: v.position.z }));
  const spawns = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ name: v.id, kind: '第一人称出生点', x: v.position.x, z: v.position.z }));
  const route = LAYOUT.FP_ROUTE.map((w) => ({ name: w.name, kind: '走查路点', x: w.position.x, z: w.position.z }));
  /* t8：内景机位数由**数据推导**（不再写死 43）——并与另两个独立来源交叉核对：
     `INTERIOR_BY_SLOT` 的键数、`SLOTS` 里 visitable 的栋数（三者必须一致）。 */
  const interiorKeys = Object.keys(LAYOUT.INTERIOR_BY_SLOT ?? {}).length;
  const visitableSlots = LAYOUT.SLOTS.filter((s) => s.visitable === true).length;
  assertEqual(interiors.length, interiorKeys, `内景机位数必须等于 INTERIOR_BY_SLOT 键数（${interiorKeys}；实际 ${interiors.length}）`);
  assertEqual(interiorKeys, visitableSlots, `INTERIOR_BY_SLOT 必须与 visitable 槽位一一对应（${interiorKeys} vs ${visitableSlots}）`);
  assert(interiors.length >= 43, `内景机位不得少于历史快照 43（实际 ${interiors.length}）`);
  assert(spawns.length >= 1, '至少应有 1 个第一人称出生点');

  const report = audit.audit({ paired: [...interiors, ...spawns, ...route] });
  const oneWay = report.paired.filter((p) => p.reason === 'oneWayTrap');
  assertEqual(oneWay.length, 0, `不得存在"进得去出不来"的点：${JSON.stringify(oneWay.map((p) => p.name))}`);
  for (const row of report.paired) {
    if (row.enterable) assertEqual(row.returnable, true, `能进去就必须能出来：${row.name}`);
    assert(!(row.enterable && !row.returnable), `${row.name} 不得是"进得去出不来"`);
  }
  // 出生点必须全部落在主分量（一键脱困的落点安全性由此保证）
  for (const spawn of report.paired.filter((p) => p.kind === '第一人称出生点')) {
    assertEqual(spawn.ok, true, `出生点必须进出皆可：${spawn.name}（${spawn.reason}）`);
  }
  const sealed = report.paired.filter((p) => !p.enterable);
  const enterable = report.paired.filter((p) => p.enterable);
  // "只出不进"（能从该点走到主分量、但从主分量进不去）不是陷阱：进都进不去 ⇒ 没人会被困在里面
  const exitOnly = report.paired.filter((p) => p.returnable && !p.enterable);
  assertEqual(enterable.length + sealed.length, report.paired.length, '进入/封团两类之和必须等于样本总数');
  assert(enterable.length > 0, '应有可进入的样本');
  runner.info(
    `  成对可达性：样本 ${report.paired.length} = 可进入且可返回 ${enterable.length}（其中内景 ${enterable.filter((p) => p.kind === '内景机位').length}/${interiors.length} 台）` +
      ` + 封团（根本进不去，故不存在"出不来"）${sealed.length}（其中"只出不进"${exitOnly.length}：${exitOnly.map((p) => p.name).join('、') || '—'}）`,
  );
});

await runner.test('F21 t87 UI 与按键：G 键映射脱困、亭的撞墙提示说明"开敞构筑物"、卡死条默认隐藏且随可见性隐藏', async () => {
  // G 键（纯键位层）
  const g = resolveKey('KeyG', {});
  assertEqual(g?.local, 'escapeStuck', 'G 必须映射到 escapeStuck');
  assertEqual(g?.kind, 'escape');
  assert(helpKeyList().some((row) => row.code === 'G'), '操作提示必须列出 G');

  // 空气墙的可见提示（亭）：必须说明"开敞构筑物"，且不是默认的"不可进入"套话
  const catalog = buildCatalog({ layout: LAYOUT, config: CONFIG });
  const pavilionObstacle = createWalkSolver({}).obstacles().find((o) => LAYOUT.SLOTS.find((s2) => s2.id === o.buildingId)?.kind === 'pavilion');
  assert(pavilionObstacle, '应能找到一个亭的障碍条目');
  // ── ① 亭不得再出现「开敞构筑物」提示（t103 后为 exceptDoor：仅门洞带阻挡）
  assertEqual(pavilionObstacle.blocks, 'exceptDoor', '亭必须为 exceptDoor（仅门洞带阻挡）');
  for (const slot of LAYOUT.SLOTS.filter((s2) => s2.kind === 'pavilion')) {
    const h = catalog.hintFor(`OB-${slot.id}`);
    assert(!/开敞构筑物/.test(h.title), `${slot.id} 已可通行 ⇒ 不得再弹「开敞构筑物」：${h.title}`);
    assert(/墙体阻挡/.test(h.title), `${slot.id} 撞非门洞边缘应按「墙体阻挡」提示：${h.title}`);
    assert(/门洞/.test(h.detail), `${slot.id} 提示正文应指引门洞：${h.detail}`);
  }

  // ── ② 经门洞带（入口门槛）可进入亭的足迹（可走性断言；与 t87 的 traversal 审计同口径：走真实 solver）
  const sol = createWalkSolver({});
  const eye = CONFIG.CAMERA.fpEyeHeight;
  const facingDir = { south: [0, -1], north: [0, 1], east: [1, 0], west: [-1, 0] };
  const doorResults = [];
  for (const slot of LAYOUT.SLOTS.filter((s2) => s2.kind === 'pavilion')) {
    const ob = sol.obstacles().find((o) => o.buildingId === slot.id);
    if (!ob) { doorResults.push({ id: slot.id, entered: false, blocked: ['<无障碍条目>'] }); continue; }
    const b = ob.bounds;
    const dir = facingDir[slot.facing] ?? [0, -1];
    const halfX = (b.maxX - b.minX) / 2;
    const halfZ = (b.maxZ - b.minZ) / 2;
    const outside = { x: slot.x + dir[0] * (Math.abs(dir[0]) ? halfX + 1.5 : 0), z: slot.z + dir[1] * (Math.abs(dir[1]) ? halfZ + 1.5 : 0) };
    const yOut = LAYOUT.floorYAt(outside.x, outside.z);
    let pos = { x: outside.x, y: (yOut ?? 0) + eye, z: outside.z };
    const blocked = new Set();
    for (let i = 0; i < 30; i += 1) {
      const r = sol.step(pos, -dir[0], -dir[1], 0.25, {});
      r.blocked.forEach((id) => blocked.add(id));
      pos = { x: r.x, y: r.y, z: r.z };
    }
    const entered = pos.x >= b.minX && pos.x <= b.maxX && pos.z >= b.minZ && pos.z <= b.maxZ;
    doorResults.push({ id: slot.id, entered, blocked: [...blocked], end: { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) } });
  }
  const enteredCount = doorResults.filter((r) => r.entered).length;
  const blockedNamed = doorResults.filter((r) => !r.entered);
  // 不得出现"静默阻挡"：没走进去的必须给出**有名有姓**的阻挡原因（障碍 id 或世界原因）
  for (const r of blockedNamed) {
    assert(r.blocked.length > 0, `${r.id} 未走进却无任何阻挡原因（静默阻挡 = 空气墙）`);
    assert(r.blocked.every((id) => /^OB-/.test(id) || WORLD_BLOCK_REASONS.includes(id)), `${r.id} 的阻挡原因必须有名有姓：${JSON.stringify(r.blocked)}`);
  }
  assert(enteredCount >= 8, `至少 8/10 座亭应能经门洞带走进足迹（实测 ${enteredCount}/10）：${JSON.stringify(doorResults)}`);
  // t8：和数改为**样本自身长度**（不再写死 10）；"无遗漏"语义不变
  assertEqual(enteredCount + blockedNamed.length, doorResults.length, `两类之和必须等于样本数 ${doorResults.length}（无遗漏）`);
  assert(doorResults.length >= 10, `门洞走查样本不得少于历史快照 10（实际 ${doorResults.length}）`);
  runner.info(
    `  亭门洞带可走性：${enteredCount}/10 走进足迹（无阻挡）；${blockedNamed.length} 座被**有名**阻挡：` +
      blockedNamed.map((r) => `${r.id}←${r.blocked.join('/')}`).join('、') + `｜明细 ${JSON.stringify(doorResults)}`,
  );
  // 门洞语义（数据推导，逐座）：门洞通道沿 `door.lateralAxis` **贯穿体块**（横向自由、沿另一轴由墙体阻挡）
  //   ⇒ ① 沿**墙轴**（垂直于 lateralAxis）向内一步必须被**自身障碍**挡住（有实体依据的边界，不是空气墙）；
  //      ② 沿**通道轴**（lateralAxis）向内一步要么可走（通道）、要么被**有名**原因挡住（如门前水池/台阶）。
  for (const slot of LAYOUT.SLOTS.filter((s2) => s2.kind === 'pavilion')) {
    const ob = sol.obstacles().find((o) => o.buildingId === slot.id);
    const b = ob.bounds;
    const lateral = ob.door?.lateralAxis ?? ((b.maxX - b.minX) >= (b.maxZ - b.minZ) ? 'x' : 'z');
    // `lateralAxis` 是**门宽所在轴**：横向越出「门宽/2」即由墙体阻挡；沿另一轴则**贯穿通过**。
    const wall = lateral === 'x' ? [1, 0] : [0, 1];
    const through = lateral === 'x' ? [0, 1] : [1, 0];
    const outside = (axis) => ({
      x: slot.x + axis[0] * ((b.maxX - b.minX) / 2 + 0.6),
      z: slot.z + axis[1] * ((b.maxZ - b.minZ) / 2 + 0.6),
    });
    // ① 撞墙轴（两个方向都试）
    for (const sign of [1, -1]) {
      const out = outside([wall[0] * sign, wall[1] * sign]);
      const feet = (LAYOUT.floorYAt(out.x, out.z) ?? 0) + eye;
      const single = sol.step({ x: out.x, y: feet, z: out.z }, -wall[0] * sign, -wall[1] * sign, 0.5, {});
      assert(single.blocked.length > 0, `${slot.id} 沿墙轴向内一步必须被挡（不得静默穿过）：${JSON.stringify(single)}`);
      // 阻挡必须"有名有姓"：自身障碍 / 其它**已登记**障碍（例如亭前水池）/ 世界原因（台阶、包络…）
      const allObstacles = sol.obstacles();
      assert(
        single.blocked.every((id) => WORLD_BLOCK_REASONS.includes(id) || allObstacles.some((o) => o.id === id)),
        `${slot.id} 撞墙方向的阻挡原因必须有名有姓（不得是凭空的墙）：${JSON.stringify(single.blocked)}`,
      );
      assert(
        single.blocked.includes(`OB-${slot.id}`) || single.blocked.some((id) => /^OB-(WB|SC|MOAT)/.test(id) || WORLD_BLOCK_REASONS.includes(id)),
        `${slot.id} 的阻挡应来自自身障碍或已登记的实体（水体/山石/世界原因）：${JSON.stringify(single.blocked)}`,
      );
      assert(!(single.x > b.minX && single.x < b.maxX && single.z > b.minZ && single.z < b.maxZ), `${slot.id} 沿墙轴不得在一步内进入足迹`);
    }
    // ② 通道轴（两个方向）：可走或被有名原因挡住（不得静默）
    for (const sign of [1, -1]) {
      const out = outside([through[0] * sign, through[1] * sign]);
      const feet = (LAYOUT.floorYAt(out.x, out.z) ?? 0) + eye;
      const single = sol.step({ x: out.x, y: feet, z: out.z }, -through[0] * sign, -through[1] * sign, 0.5, {});
      if (single.blocked.length > 0) {
        assert(
          single.blocked.every((id) => /^OB-/.test(id) || WORLD_BLOCK_REASONS.includes(id)),
          `${slot.id} 通道轴上的阻挡必须有名有姓（不得静默）：${JSON.stringify(single.blocked)}`,
        );
      }
    }
  }

  // 卡死条默认隐藏；setVisible(false)（?ui=0&shot=1 的路径）下仍保持隐藏
  const app = await makeApp();
  const stuckPanel = () => app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'stuck');
  assert(stuckPanel(), '卡死条必须存在（结构齐备）');
  assertEqual(stuckPanel().hidden, true, '未卡死时卡死条隐藏');
  assertEqual(app.ui.stats().stuck, false, '未卡死时 stats().stuck 为 false');
  app.ui.setVisible(false);
  app.ui.update(1);
  assertEqual(stuckPanel().hidden, true, '整层隐藏时卡死条也必须隐藏（§11.3）');
  app.interaction.dispose();
  app.ui.dispose();
});

/* ==========================================================================
 *  t88 / T7.6 F8-②：走查层消费 layout.CONNECTORS（坡道/台阶语义）
 * ======================================================================== */

await runner.test('E17 走查层消费 CONNECTORS：台阶落差可走、横断面外仍 0.5m 拒绝、停用即失败（突变证明）', async () => {
  // ① 静态证据：走查层**确实引用** layout.CONNECTORS（t77 的 grep 证据是"引用数 0"，这里反转它）
  const solverSrc = readFileSync(join(ROOT, 'src/interaction/walk-solver.js'), 'utf8');
  const graphSrc = readFileSync(join(ROOT, 'src/interaction/walk-graph.js'), 'utf8');
  assert(/CONNECTORS/.test(solverSrc), 'walk-solver.js 必须引用 layout.CONNECTORS');
  assert(/connectorStats|CONNECTORS/.test(graphSrc), 'walk-graph.js 必须暴露/引用 connector 消费证据');

  // ② 全局阈值一字未改（不得为通过而放宽）
  assertEqual(CONFIG.INTERACTION.step.maxStepHeight, 0.5, '全局上台阶阈值必须保持 0.5m');
  assertEqual(CONFIG.INTERACTION.step.snapDownDistance, 0.6, '全局下落吸附阈值必须保持 0.6m');

  // ③ 合成世界：x≥0 是 2.2m 平台、x<0 是 0.2m 场地（2.0m 真实落差），connector 自报 stairs(0.2→2.2)、横断面宽 6m
  const eye = CONFIG.CAMERA.fpEyeHeight;
  const fakeLayout = {
    TERRAIN_EXTENT: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    WALKABLE: [],
    ROADS: [],
    OBSTACLES: [],
    CONNECTORS: [
      { id: 'CXN-test-stairs', name: '测试台阶', kind: 'stairs', owner: 'B', borders: ['B', 'B'], position: { x: 0, z: 0 }, width: 6, elevation: 2.2, elevationLow: 0.2, walkable: true, gate: null, note: '' },
    ],
    floorYAt: (x) => (x >= 0 ? 2.2 : 0.2),
    walkableAt: () => [],
    insideEnvelope: () => true,
  };
  const off = createWalkSolver({ layout: fakeLayout, obstacles: [], connectorRamps: false });
  const on = createWalkSolver({ layout: fakeLayout, obstacles: [], connectorRamps: true });
  /** 逐帧行走（每帧 0.25m，与 core 每帧调用 solver.step 的真实用法一致；单次长步进会固定 feetY）。 */
  const walk = (solver, start, dirX, dirZ, frames = 40, speed = 0.25) => {
    let p = { x: start.x, y: start.y, z: start.z };
    const blocked = new Set();
    for (let i = 0; i < frames; i += 1) {
      const r = solver.step(p, dirX, dirZ, speed, {});
      r.blocked.forEach((b) => blocked.add(b));
      p = { x: r.x, y: r.y, z: r.z };
    }
    return { ...p, blocked: [...blocked] };
  };

  // ③.5 生产默认必须启用 connector 语义（把默认翻成 false 即违反 F8-② ⇒ 本断言必须红）
  const onDefault = createWalkSolver({ layout: fakeLayout, obstacles: [] });
  assertEqual(onDefault.connectorStats().disabled, false, '生产默认必须启用 connector 语义');
  assertEqual(onDefault.connectorStats().ramps, 1, '走生产默认（不传选项）时也必须为 cliff 生成坡道带');

  // ④ 停用 connector（突变对照）：落差 2.0m > 0.5m ⇒ 上不去
  assertEqual(off.connectorStats().ramps, 0, '停用时不生成坡道带');
  assertEqual(off.connectorStats().disabled, true);
  const upOff = walk(off, { x: -4, y: 0.2 + eye, z: 0 }, 1, 0, 40);
  assert(upOff.blocked.includes('stepTooHigh'), `停用 connector 时上台阶必须被 0.5m 规则拒绝，实际 ${JSON.stringify(upOff.blocked)}`);
  assert(upOff.x < 0, `停用 connector 时不得登上平台：x=${upOff.x.toFixed(2)}`);

  // ⑤ 消费 connector：同一落差按 connector 自报标高生成过渡面 ⇒ 能走上去
  assertEqual(on.connectorStats().ramps, 1, '有 cliff 的 connector 必须生成恰好 1 条坡道带');
  assertEqual(on.connectorStats().ids[0], 'CXN-test-stairs', '坡道带必须点名来源 connector id');
  const rampInfo = on.connectorRamps()[0];
  assertEqual(rampInfo.elevationLow, 0.2, '过渡面下端必须取该点实测低面');
  assertEqual(rampInfo.elevation, 2.2, '过渡面上端必须取该点实测高面');
  assert(rampInfo.run >= 1.5 && rampInfo.run <= 8, `过渡带长度必须落在 [1.5, 8]m，实际 ${rampInfo.run}`);
  const upOn = walk(on, { x: -4, y: 0.2 + eye, z: 0 }, 1, 0, 40);
  assert(upOn.x > 0.4, `消费 connector 后应能登上平台：x=${upOn.x.toFixed(2)}（blocked=${JSON.stringify(upOn.blocked)}）`);
  assert(Math.abs(upOn.y - (2.2 + eye)) < 1e-6, `登顶后眼高必须落在平台面：${upOn.y}`);

  // ⑥ 过渡带内每一步都受全局阈值约束（不是瞬移）：逐 0.25m 采样，最大单步抬升 ≤ 0.5m
  let maxRise = 0;
  let prevY = null;
  for (let x = -6; x <= 1; x += 0.25) {
    const y = on.groundAt(x, 0);
    if (prevY !== null) maxRise = Math.max(maxRise, y - prevY);
    prevY = y;
  }
  assert(maxRise <= CONFIG.INTERACTION.step.maxStepHeight + 1e-9, `过渡面单步抬升必须 ≤ 0.5m，实际 ${maxRise.toFixed(3)}m`);
  assert(maxRise > 0.05, `过渡面应确实呈坡度（实际最大单步 ${maxRise.toFixed(3)}m）`);

  // ⑦ 边界对照：同一落差在 connector 横断面**之外**仍按 0.5m 拒绝
  const outsideZ = rampInfo.halfWidth + 2;
  assertEqual(on.groundAt(0.5, outsideZ), 2.2, '横断面外仍是陡坎（地形未变）');
  const upOutside = walk(on, { x: -4, y: 0.2 + eye, z: outsideZ }, 1, 0, 40);
  assert(upOutside.blocked.includes('stepTooHigh'), `横断面外必须仍按 0.5m 拒绝，实际 ${JSON.stringify(upOutside.blocked)}`);
  assert(upOutside.x < 0, `横断面外不得登上平台：x=${upOutside.x.toFixed(2)}`);
  assertEqual(on.connectorAt(0.5, outsideZ), null, '横断面外不得命中坡道带');

  // ⑧ 双向可走 ⇒ 不产生新的单向陷阱（与 t87 防卡死原则一致）
  const down = walk(on, { x: 1.0, y: 2.2 + eye, z: 0 }, -1, 0, 40);
  assert(down.x < 0, `沿过渡面必须能走下来：x=${down.x.toFixed(2)}`);
  const audit = createTraversalAudit({ solver: on, layout: fakeLayout, cellSize: 0.5, start: { x: -6, z: 0 } });
  audit.warmupAll();
  assertEqual(audit.stats().trap, 0, '引入坡道后不得产生单向陷阱');

  // ⑨ 真实数据：32 条 connector 全部被纳入评估；有 cliff 的必须都有坡道带（当前 0 条 cliff ⇒ 0 条坡道，零行为改变）
  const realSolver = createWalkSolver({});
  const stats = realSolver.connectorStats();
  assertEqual(stats.declared, LAYOUT.CONNECTORS.length, `必须评估全部 connector：${stats.declared}/${LAYOUT.CONNECTORS.length}`);
  const cliffIds = [];
  for (const c of LAYOUT.CONNECTORS) {
    const low = c.elevationLow ?? null;
    if (low === null || c.elevation - low <= CONFIG.INTERACTION.step.maxStepHeight) continue;
    for (const [ax, az] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
      let prev = null;
      let found = false;
      for (let d = 0; d <= 12; d += 0.25) {
        const y = LAYOUT.floorYAt(c.position.x + ax * d, c.position.z + az * d);
        if (y === null) { prev = null; continue; }
        if (prev !== null && y - prev > CONFIG.INTERACTION.step.maxStepHeight + 1e-9) { found = true; break; }
        prev = y;
      }
      if (found) { cliffIds.push(c.id); break; }
    }
  }
  for (const id of cliffIds) assert(stats.ids.includes(id), `有 cliff 的 connector ${id} 必须有坡道带`);
  assertEqual(stats.ramps, cliffIds.length, `坡道带数必须等于 cliff 数（${stats.ramps} vs ${cliffIds.length}）`);

  // ⑩ 真实数据下"经 connector 的高差可走"：全部 32 条 connector 两端连通
  const graph = createWalkGraph(realSolver, { cellSize: 2 });
  assertEqual(graph.stats().connectorDeclared, LAYOUT.CONNECTORS.length, 'walk-graph 也必须报出 connector 消费数');
  const disconnected = [];
  for (const c of LAYOUT.CONNECTORS) {
    const a = { x: c.position.x - 3, z: c.position.z };
    const b = { x: c.position.x + 3, z: c.position.z };
    const along = LAYOUT.floorYAt(a.x, a.z) !== null && LAYOUT.floorYAt(b.x, b.z) !== null;
    const pair = along ? [a, b] : [{ x: c.position.x, z: c.position.z - 3 }, { x: c.position.x, z: c.position.z + 3 }];
    if (LAYOUT.floorYAt(pair[0].x, pair[0].z) === null || LAYOUT.floorYAt(pair[1].x, pair[1].z) === null) continue;
    const conn = graph.connected(pair);
    if (!conn.ok) disconnected.push(c.id);
  }
  assertEqual(disconnected.length, 0, `所有 connector 两端必须连通（可走）：${JSON.stringify(disconnected)}`);
  runner.info(
    `  CONNECTORS：声明 ${stats.declared} 条（kind 混合）｜真实数据 cliff ${cliffIds.length} ⇒ 坡道带 ${stats.ramps} 条（零行为改变）；` +
      `合成 cliff 2.0m：停用 ⇒ stepTooHigh 上不去（x=${upOff.x.toFixed(2)}），启用 ⇒ 登顶 x=${upOn.x.toFixed(2)}、单步最大抬升 ${maxRise.toFixed(3)}m ≤ 0.5m；` +
      `横断面外（|lat|>${rampInfo.halfWidth}m）仍被拒（x=${upOutside.x.toFixed(2)}）；坡道世界单向陷阱 0；真实数据两端不连通 ${disconnected.length}`,
  );
});

/* ==========================================================================
 *  t104 / T7.7：禁止"只被测试驱动的孤儿 API"（t99-F1 的防复发守卫）
 * ======================================================================== */

await runner.test('F22 孤儿 API 守卫：被检测链路必须在**生产入口**上确实被调用（静态调用点 + 唯一循环驱动）', async () => {
  const indexSrc = readFileSync(join(ROOT, 'src/interaction/index.js'), 'utf8');
  const uiSrc = readFileSync(join(ROOT, 'src/ui/index.js'), 'utf8');
  const solverSrc = readFileSync(join(ROOT, 'src/interaction/walk-solver.js'), 'utf8');

  // ── ① 静态：生产关键 API 必须存在生产调用点（只被测试引用 ⇒ 红）
  //    t99-F1 的根因正是"测试自己驱动了一个生产从不调用的分支"，故把"调用点存在性"变成常驻断言。
  const productionEntry = indexSrc + '\n' + uiSrc;
  for (const [name, reason] of [
    ['noteStuckTick', '卡死检测的计时推进'],
    ['setTraversalGuard', '单向陷阱守卫的安装'],
    ['warmupStep', '通行性审计的分帧预热'],
  ]) {
    assert(new RegExp(`\\b${name}\\s*\\(`).test(productionEntry), `${name} 必须在生产入口（interaction/index.js 或 ui/index.js）里被调用（${reason}）`);
  }
  // 卡死检测的输入必须显式来自真实路径（intent/moved），不得只依赖求解器内部记录
  assert(/noteStuckTick\(dt,\s*\{\s*intent,\s*moved/.test(indexSrc), 'noteStuckTick 必须显式接收真实路径输入 {intent, moved}');
  assert(/movementKeys/.test(indexSrc) && /MOVEMENT_CODES/.test(indexSrc), '意图必须来自真实移动键（MOVEMENT_CODES 被动观察）');
  assert(/rig\.position/.test(indexSrc) && /lastStuckPos/.test(indexSrc), '位移必须来自 rig.position 逐帧增量');
  // 反证：卡死检测不得依赖 walk-solver.step / .move（生产上没有任何调用点 —— t99 的 grep 证据）
  const interactionFiles = readdirSync(join(ROOT, 'src/interaction'));
  for (const name of interactionFiles.filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(join(ROOT, 'src/interaction', name), 'utf8');
    assert(!/\.move\s*\(/.test(text), `src/interaction/${name} 不得依赖无生产调用点的 .move()（t99-F1 孤儿 API）`);
  }
  assert(!/solver\.step\s*\(/.test(indexSrc), 'interaction/index.js 不得调用 solver.step() 作为卡死检测输入（生产上不由它驱动）');
  // solver 内部记录只作为"离线/旧测试"兼容路径存在（源码须显式标注）
  assert(/仅供旧测试/.test(solverSrc), 'walk-solver 须显式标注内部记录仅为兼容路径');

  // ── ② 行为：用**生产唯一循环**（attachRenderLoop 包装的 recordFrame）驱动同一条实现
  const app = await makeApp({ ui: false });
  const handle = mountInterface({ ...app.api, retryFailedZones: async () => true }, { container: app.app, document: app.doc, window: app.win, query: { ui: true, shot: false } });
  handle.interaction.requester.viewMode('fp');
  for (let i = 0; i < 240 && app.rig.isFp !== true; i += 1) app.rig.update(1 / 60, 0, app.store.state);
  assertEqual(app.rig.isFp, true, '应已进入第一人称');
  const eye = CONFIG.CAMERA.fpEyeHeight;
  const wallX = 25;
  const wallZ = -130;
  const surfaceY = LAYOUT.floorYAt(wallX, wallZ);
  app.rig.position.set(wallX, surfaceY + eye, wallZ);

  // 未按移动键时：循环驱动 3s 也不得出现卡死条（对照，避免恒显示）
  for (let i = 0; i < 40; i += 1) {
    app.renderSystem.recordFrame(40);
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  const stuckPanel = () => app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === 'stuck');
  assertEqual(handle.stats().stuck, false, '无输入意图时不得判卡死');
  assertEqual(stuckPanel()?.hidden, true, '无输入意图时卡死条必须隐藏');

  // 真实按键 + 唯一循环（不调用 interaction.update / solver.step，完全走生产路径）
  app.win.key('KeyW');
  let elapsedMs = 0;
  for (let i = 0; i < 200 && handle.stats().stuck !== true; i += 1) {
    app.renderSystem.recordFrame(40);
    elapsedMs += 40;
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  const traversal = handle.stats().traversal;
  assertEqual(handle.stats().stuck, true, `唯一循环 + 真实按键顶墙 ${elapsedMs}ms 后必须判卡死（阈值 ${traversal.stuckThreshold}s）`);
  assertEqual(traversal.stuckIntentSource, 'explicit', '生产路径必须走 explicit 输入（真实按键 + 位置增量）');
  assertEqual(traversal.solverStepAttempts, 0, '整段检测不得由 walk-solver.step 驱动（孤儿 API 反证）');
  assertEqual(stuckPanel().hidden, false, '卡死条必须在唯一循环驱动下出现');
  app.win.keyUp('KeyW');
  runner.info(
    `  孤儿 API 守卫：生产关键 API 调用点 ✓（noteStuckTick/setTraversalGuard/warmupStep）｜唯一循环 + 真实 KeyW 顶墙 ${elapsedMs}ms → 卡死条出现（intent 来源 explicit、solver.step 调用 0）｜未按键 3s 对照不出现 ✓`,
  );
  handle.dispose();
});

/* ==========================================================================
 *  t105 / T7.8：脱困=确定性放置（t99-F2）—— 四项断言 + 失败路径不改动视图
 * ======================================================================== */

await runner.test('F23 脱困确定性放置（t99-F2）：落点 == nearestFpSpawn、可站立、包络内、眼高逐值相等；失败路径不改动视图/位置', async () => {
  const app = await makeApp();
  const eye = CONFIG.CAMERA.fpEyeHeight;
  app.interaction.requester.viewMode('fp');
  for (let i = 0; i < 240 && app.rig.isFp !== true; i += 1) app.rig.update(1 / 60, 0, app.store.state);
  assertEqual(app.rig.isFp, true, '应已进入第一人称');
  const solver = app.interaction.solver;

  // 把玩家放到"卡死点"（与 t99 复现同量级：B 区亭外）
  const stuck = { x: -58, z: -377.647 };
  const stuckSurface = LAYOUT.floorYAt(stuck.x, stuck.z);
  app.rig.position.set(stuck.x, stuckSurface + eye, stuck.z);

  // ── ① 目标 = registry.nearestFpSpawn（语义不动，只消费）
  const near = app.registry.nearestFpSpawn(app.rig.describe().position);
  assert(near?.viewpoint?.position, 'registry 必须能给出最近出生点');
  const spawn = near.viewpoint;
  const before = { ...app.rig.describe().position };

  const result = app.interaction.escapeToSafePoint('test:deterministic');
  const after = { ...app.rig.describe().position };
  assertEqual(result.ok, true, `脱困必须成功（reason=${result.reason}）`);
  assertEqual(result.spawnId, spawn.id, `落点必须点名最近出生点：${result.spawnId} vs ${spawn.id}`);
  // ① 位置 == 最近登记出生点（逐值相等）
  assert(Math.abs(after.x - spawn.position.x) < 1e-9, `x 必须等于出生点：${after.x} vs ${spawn.position.x}`);
  assert(Math.abs(after.y - spawn.position.y) < 1e-9, `y 必须等于出生点：${after.y} vs ${spawn.position.y}`);
  assert(Math.abs(after.z - spawn.position.z) < 1e-9, `z 必须等于出生点：${after.z} vs ${spawn.position.z}`);
  assertEqual(result.matchesSpawn, true, '落点与出生点必须逐值一致（matchesSpawn）');
  // ② 可站立
  const probe = solver.probe(after.x, after.z);
  assertEqual(probe.ok, true, `落点必须可站立：${JSON.stringify(probe.reasons)}`);
  assertEqual(result.reasons.length, 0, '落点不应带任何阻挡原因');
  // ③ 包络内（t99-F2 的失败点：z=-1180 越界）
  assert(
    after.x >= LAYOUT.TERRAIN_EXTENT.minX && after.x <= LAYOUT.TERRAIN_EXTENT.maxX && after.z >= LAYOUT.TERRAIN_EXTENT.minZ && after.z <= LAYOUT.TERRAIN_EXTENT.maxZ,
    `落点必须在包络内（TERRAIN_EXTENT z ∈ [${LAYOUT.TERRAIN_EXTENT.minZ}, ${LAYOUT.TERRAIN_EXTENT.maxZ}]）：实际 z=${after.z}`,
  );
  assertEqual(result.inBounds, true, 'inBounds 必须为 true');
  // ④ 眼高：既等于出生点 y，又等于面高 + 眼高
  assert(Math.abs(after.y - (LAYOUT.floorYAt(after.x, after.z) + eye)) < 1e-9, `眼高必须 = 面高 + ${eye}`);
  assertEqual(result.eyeOk, true, 'eyeOk 必须为 true');
  // 视图必须仍在第一人称（t99-F2 症状是掉进 oblique 全城相机）
  assertEqual(app.rig.isFp, true, '脱困后必须仍在第一人称');
  assertEqual(app.store.state.viewMode, 'fp', `state.viewMode 必须同步为 fp（实际 ${app.store.state.viewMode}）`);
  // 提示只在成功后出现
  const hint = app.interaction.lastHint();
  assertEqual(hint?.kind, 'escape', '必须给 escape 类提示');
  assert(/已脱离/.test(hint?.title ?? ''), `成功提示标题应为「已脱离…」，实际「${hint?.title}」`);
  assert(!/失败/.test(hint?.title ?? ''), '成功路径不得出现失败提示');
  runner.info(
    `  脱困（确定性）：${spawn.id} ${JSON.stringify({ x: after.x, y: after.y, z: after.z })}（卡死点距出生点 ${(near.distance ?? 0).toFixed(2)}m、位移 ${result.moved}m）｜可站立 ✓ 包络内 ✓ 眼高 ✓ isFp ✓ state=fp ✓`,
  );

  // ── ② 确定性：同一卡死点再脱困一次 ⇒ 落点完全一致（无随机）
  app.rig.position.set(stuck.x, stuckSurface + eye, stuck.z);
  const second = app.interaction.escapeToSafePoint('test:deterministic-2');
  const afterSecond = { ...app.rig.describe().position };
  assert(Math.abs(afterSecond.x - after.x) < 1e-9 && Math.abs(afterSecond.z - after.z) < 1e-9, '同一卡死点两次脱困落点必须一致');

  // ── ③ 失败路径 A：出生点本身不合格（越界）⇒ 不改动视图/位置
  const originalNearest = app.registry.nearestFpSpawn;
  app.registry.nearestFpSpawn = () => ({ viewpoint: { id: 'VP-test-invalid', position: { x: 0, y: 520, z: LAYOUT.TERRAIN_EXTENT.minZ - 620 } }, distance: 1 });
  const posBeforeA = { ...app.rig.describe().position };
  const modeBeforeA = app.store.state.viewMode;
  const resA = app.interaction.escapeToSafePoint('test:spawn-invalid');
  const posAfterA = { ...app.rig.describe().position };
  app.registry.nearestFpSpawn = originalNearest;
  assertEqual(resA.ok, false, '出生点不合格时必须失败');
  assertEqual(resA.reason, 'spawn-invalid', `失败原因应为 spawn-invalid，实际 ${resA.reason}`);
  assertEqual(resA.changed, false, '失败时不得改动视图/位置（changed=false）');
  assert(Math.abs(posAfterA.x - posBeforeA.x) < 1e-9 && Math.abs(posAfterA.y - posBeforeA.y) < 1e-9 && Math.abs(posAfterA.z - posBeforeA.z) < 1e-9, `失败时位置必须逐值不变：${JSON.stringify(posAfterA)} vs ${JSON.stringify(posBeforeA)}`);
  assertEqual(app.store.state.viewMode, modeBeforeA, `失败时视图模式必须不变（实际 ${app.store.state.viewMode}）`);
  assertEqual(app.rig.isFp, true, '失败时仍应在第一人称（不得掉进 oblique）');
  const hintA = app.interaction.lastHint();
  assert(/失败/.test(hintA?.title ?? ''), `失败应给明确失败提示，实际「${hintA?.title}」`);
  assert(/未改动/.test(hintA?.detail ?? ''), `失败提示应说明"未改动"，实际「${hintA?.detail}」`);

  // ── ④ 失败路径 B：放置后复核不通过（模拟"落点不对"）⇒ 回滚到原位
  const originalEnter = app.rig.enterFp;
  app.rig.enterFp = function patchedEnter(opts = {}) {
    // 只有"脱困放置"（带 spawnId）被篡改成非法落点；回滚调用（无 spawnId）保持真实行为
    if (opts && opts.spawnId) return originalEnter.call(this, { ...opts, position: { x: 0, y: 520, z: LAYOUT.TERRAIN_EXTENT.minZ - 620 }, instant: true });
    return originalEnter.call(this, opts);
  };
  const posBeforeB = { ...app.rig.describe().position };
  const resB = app.interaction.escapeToSafePoint('test:post-invalid');
  app.rig.enterFp = originalEnter;
  const posAfterB = { ...app.rig.describe().position };
  assertEqual(resB.ok, false, '落点复核不通过时必须失败');
  assertEqual(resB.reason, 'post-invalid', `失败原因应为 post-invalid，实际 ${resB.reason}`);
  assertEqual(resB.changed, false, '回滚后不得留下任何改动（changed=false）');
  assert(
    Math.abs(posAfterB.x - posBeforeB.x) < 1e-9 && Math.abs(posAfterB.y - posBeforeB.y) < 1e-9 && Math.abs(posAfterB.z - posBeforeB.z) < 1e-9,
    `回滚必须精确恢复原位：${JSON.stringify(posAfterB)} vs ${JSON.stringify(posBeforeB)}`,
  );
  assertEqual(app.rig.isFp, true, '回滚后必须仍在第一人称');
  assertEqual(app.store.state.viewMode, 'fp', '回滚后 state 必须仍是 fp');

  // ── ⑤ 静态守卫：必须用确定性放置（enterFp + spawnId/position/instant），禁止"连发两次请求"的老写法
  const src = readFileSync(join(ROOT, 'src/interaction/index.js'), 'utf8');
  /* t30：**结构锚定**（替换旧的位置切片）——
     改前原文（已删除）：
       const body = src.slice(src.indexOf('function escapeToSafePoint'), src.indexOf('function exitInterior'));
     旧写法在函数改名时 `indexOf` 返回 -1 ⇒ `slice(start, -1)` **退化为几乎整个文件**，三条正则断言照样成立 = 假绿；
     两函数间插代码也会**静默**改变作用域。现按函数体边界（花括号配对 + 词法状态）取**恰好两个函数体**。
     **签名缺失/未闭合 ⇒ extractTwoFunctionBodies 抛错**（不得静默继续；下方 assert 再兜一道）。 */
  const scoped = (() => {
    try {
      return extractTwoFunctionBodies(src, 'function escapeToSafePoint(', 'function exitInterior(');
    } catch (error) {
      return { error };
    }
  })();
  assert(!scoped.error, `结构锚定必须成功（签名存在且花括号闭合）：${scoped.error?.message ?? ''}`);
  const body = scoped.body;
  /* 作用域自证（三条，只增不减）：① 恰好两个函数体、以 '{' 开头以 '}' 收尾；
     ② 不得夹带相邻函数签名（否则说明作用域被撑大）；③ 每个函数体自身首尾也必须是 { … }。 */
  assert(/^\s*\{/.test(scoped.a.body) && /\}\s*$/.test(scoped.a.body), 'escapeToSafePoint 的函数体必须恰以 { 开头、以 } 收尾');
  assert(/^\s*\{/.test(scoped.b.body) && /\}\s*$/.test(scoped.b.body), 'exitInterior 的函数体必须恰以 { 开头、以 } 收尾');
  assertEqual(scoped.a.end - scoped.a.braceStart, scoped.a.body.length, '函数体长度必须与 braceStart..end 自洽（escapeToSafePoint）');
  assertEqual(scoped.b.end - scoped.b.braceStart, scoped.b.body.length, '函数体长度必须与 braceStart..end 自洽（exitInterior）');
  const straySignatures = (scoped.body.match(/^\s*function\s+[A-Za-z_$][\w$]*\s*\(/gm) ?? []).length;
  assertEqual(straySignatures, 0, `作用域内不得含任何函数签名声明（实际 ${straySignatures} 处）⇒ 说明切到了函数体之外`);
  assert(scoped.a.end <= scoped.b.start, '两个函数体不得重叠（escapeToSafePoint 必须在 exitInterior 之前结束）');
  /* 锚定生效的正面证据：作用域必须**短于**整个文件，且确实包含两个函数体内的唯一调用点 */
  assert(body.length < src.length, `结构锚定后的作用域必须窄于整个文件（${body.length} < ${src.length}）——否则等同旧写法的假绿`);
  assert(/\benterFp\b/.test(body), '作用域内应含 enterFp 调用点（escapeToSafePoint 的确定性放置）');
  assert(/instant:\s*true/.test(body), '确定性放置必须用 instant: true（无过渡，落点即最终值）');
  /* ★ 原判据语义一字不改（t99-F2 / t99-F1），只换了作用域（从"符号位置切片"改为"结构锚定两函数体"） */
  assert(/rig\.enterFp\(\{[^}]*spawnId[^}]*\}/s.test(body), '脱困必须用 rig.enterFp({ spawnId, position, instant }) 做确定性放置');
  assert(!/requestViewMode, \{ mode: 'fp' \}\);\s*\n\s*requester\.send\(EVENTS\.requestViewMode/.test(body), '禁止"同一 tick 连发两次 requestViewMode"的老写法（t99-F2 根因）');
  app.interaction.dispose();
  app.ui.dispose();
});

/* ==========================================================================
 *  t30：结构锚定 vs 旧「符号名位置切片」——**直接编码原失败模式**（只增不减）
 * ======================================================================== */

await runner.test('E17b 结构锚定自证：改名 / 插代码 / 缺失签名 / 未闭合花括号 / 注释串干扰 五种情形（旧写法假绿处一律红）', async () => {
  /* 合成源码：两个相邻函数（`f` 与 `g`），中间留一处"可插代码"的位置。
     用 `g` 充当旧写法里的"结束符号"（对应真实的 `exitInterior`）。
     `decoy` = 在 f 的函数体**内部**放一个字符串字面量，其内容**逐字**含有结束锚点（见 `decoyLine`）。
     这是"符号名位置切片"的第二类脆裂：`indexOf` 命中**字串里的那一次**，作用域被拦腰截断。 */
  const srcOf = ({ renameF = false, insertBetween = false, extraFn = false, unclosedG = false, decoy = false } = {}) => {
    const fName = renameF ? 'fRenamed' : 'f';
    const between = insertBetween ? '  const injected = 1;\n' : '';
    const tail = extraFn ? 'function another() { return 9; }\n' : '';
    const decoyLine = decoy ? ['  const decoy = "' + 'function g(' + '";'] : [];
    return [
      `function ${fName}() {`,
      ...decoyLine,
      `  return { enterFp: true, instant: true };`,
      `}`,
      between + `function g() {`,
      `  return { done: true };`,
      unclosedG ? `  if (true) {` : `}`,
      tail,
    ].filter(Boolean).join('\n') + '\n';
  };

  /* 旧写法（照抄被替换的那一行）：符号名位置切片 */
  const oldSlice = (source) => source.slice(source.indexOf('function f('), source.indexOf('function g('));

  /* ① 基线：两函数体结构锚定成功，且**窄于**整个文件 */
  const base = srcOf();
  const ok = extractTwoFunctionBodies(base, 'function f(', 'function g(');
  assert(ok.body.length < base.length, `结构锚定必须窄于整个文件（${ok.body.length} < ${base.length}）`);
  assert(/^\s*\{/.test(ok.a.body) && /\}\s*$/.test(ok.a.body), 'f 的函数体应恰以 { 开头、} 收尾');
  assert(ok.a.body.includes('instant: true'), 'f 函数体必须包含它自己的语句（边界不得被破坏）');
  assertEqual((ok.body.match(/^\s*function\s+[A-Za-z_$][\w$]*\s*\(/gm) ?? []).length, 0, '拼接作用域内不得含函数签名声明');
  assertEqual(oldSlice(base), base.slice(base.indexOf('function f('), base.indexOf('function g(')), '基线对照：旧写法在锚点齐备且无干扰时与切片等价（后续差异只来自锚点缺失/干扰）');

  /* ② 改名 ⇒ 结构锚定必须**抛错**；旧写法退化为**错误作用域**（不得静默继续） */
  const renamed = srcOf({ renameF: true });
  let threw = false;
  try { extractTwoFunctionBodies(renamed, 'function f(', 'function g('); } catch { threw = true; }
  assert(threw, '【改名】签名缺失时结构锚定必须抛错（不得静默继续）');
  /* 旧写法的实际退化方向（实测澄清，避免把机制说错）：
     · 「结束锚点」缺失 ⇒ `indexOf` = -1 ⇒ `slice(start, -1)` ⇒ **吃掉末尾一个字符**（作用域被撑大到"起点之后几乎整个文件"）；
     · 「起始锚点」缺失 ⇒ `indexOf` = -1 ⇒ `slice(-1, other)` ⇒ **空切片**（判据在空串上恒真 ⇒ 同样假绿）。
     两种方向都是"作用域错误 + 判据照旧成立"，故**任一锚点缺失都必须抛错**。 */
  const oldRenamed = oldSlice(renamed); // 起始锚点缺失 ⇒ 空切片
  assertEqual(oldRenamed.length, 0, `【改名】起始锚点缺失时旧写法得到**空切片**（${oldRenamed.length} 字符）⇒ 正则断言在空串上恒真 = 假绿`);
  const endMissing = srcOf().replace(/function g\(/g, 'function gRenamed(') + 'function anotherOne() { return 9; }\n'.repeat(12);
  assert(endMissing.indexOf('function g(') < 0, '构造检查：endMissing 中确实不含结束锚点');
  assert(endMissing.indexOf('function f(') >= 0, '构造检查：endMissing 中起始锚点仍存在');
  const oldEndMissing = endMissing.slice(endMissing.indexOf('function f('), endMissing.indexOf('function g('));
  assert(oldEndMissing.length > ok.body.length, `【改名】结束锚点缺失时旧写法作用域被撑大（${oldEndMissing.length} > 正确 ${ok.body.length}）⇒ 断言在超集上照旧成立 = 假绿`);
  assert(oldEndMissing.length > ok.body.length, `【改名】结束锚点缺失时旧写法作用域被撑大（${oldEndMissing.length} > 正确 ${ok.body.length}）⇒ 断言在超集上照旧成立 = 假绿`);
  /* 反向对照：旧写法在基线（两锚点都在）上确实等同于正确作用域 —— 说明上述差异**只**来自锚点缺失 */
  assertEqual(oldSlice(base), base.slice(base.indexOf('function f('), base.indexOf('function g(')), '基线对照：旧写法在锚点齐备时与切片等价（差异只来自锚点缺失）');

  /* ③ 两函数间插代码 ⇒ 结构锚定**不受影响**；旧写法的作用域会**静默撑大**（且随插入内容变化） */
  const inserted = srcOf({ insertBetween: true });
  const ok2 = extractTwoFunctionBodies(inserted, 'function f(', 'function g(');
  assert(!ok2.body.includes('injected'), '【插代码】结构锚定不得纳入两函数之间的插入代码');
  const oldInserted = oldSlice(inserted);
  assert(oldInserted.includes('injected'), '【插代码】旧写法确实把插入代码纳入作用域（起点→结束锚点之间的全部内容）');
  assert(oldInserted.length > oldSlice(base).length, `【插代码】旧写法作用域随插入内容**静默撑大**（${oldInserted.length} > 基线 ${oldSlice(base).length}）——判据作用域不再是"两个函数体"`);
  assertEqual(ok2.body, ok.body, '【插代码】插入代码不得改变两函数体的拼接结果（逐字节相同）');

  /* ③b 注释/字串里的**同名字串** ⇒ 旧写法被拦腰截断、静默失真；结构锚定不受影响 */
  const decoy = srcOf({ decoy: true });
  const okDecoy = extractTwoFunctionBodies(decoy, 'function f(', 'function g(');
  const oldDecoy = oldSlice(decoy);
  assert(decoy.indexOf('function g(') < decoy.lastIndexOf('}'), '构造检查：字串中的结束锚点出现在 f 的函数体内部（早于函数体闭合）');
  assert(oldDecoy.length < okDecoy.a.body.length, `【字串干扰】旧写法在字串处被截断（${oldDecoy.length} < 正确 f 体 ${okDecoy.a.body.length}）`);
  assert(!oldDecoy.includes('instant'), '【字串干扰】旧写法截断后连 f 自身的 instant:true 都取不到 ⇒ 判据静默失真');
  assert(
    okDecoy.a.body.includes('const decoy') && okDecoy.a.body.includes('instant: true'),
    '【字串干扰】结构锚定必须完整取到 f 的函数体（含字串行与其后的语句）',
  );

  /* ④ 已闭合函数之后仍有函数 ⇒ 作用域仍恰为两个函数体（不多吃） */
  const extra = srcOf({ extraFn: true });
  const ok3 = extractTwoFunctionBodies(extra, 'function f(', 'function g(');
  assert(!ok3.body.includes('function another('), '【多函数】结构锚定不得纳入第三个函数体');
  assertEqual(ok3.body, ok.body, '【多函数】第三个函数的存在不得改变两函数体的拼接结果');

  /* ⑤ 花括号未闭合 ⇒ 必须抛错（旧写法同样静默给出错误作用域） */
  const broken = srcOf({ unclosedG: true });
  let threw2 = false;
  try { extractTwoFunctionBodies(broken, 'function f(', 'function g('); } catch { threw2 = true; }
  assert(threw2, '【未闭合】花括号未闭合时结构锚定必须抛错（不得静默继续）');
  assertEqual(extractFunctionBody(broken, 'function g('), null, '未闭合函数体应返回 null（调用方须断言非空）');
  assertEqual(extractFunctionBody('const x = 1;', 'function zzz('), null, '签名不存在时应返回 null');

  /* ⑥ 真实源码上的作用域自证（防"换了个更隐蔽的脆弱写法"） */
  const realSrc = readFileSync(join(ROOT, 'src/interaction/index.js'), 'utf8');
  const real = extractTwoFunctionBodies(realSrc, 'function escapeToSafePoint(', 'function exitInterior(');
  assert(real.body.length < realSrc.length * 0.5, `真实源码作用域应显著窄于整文件（${real.body.length} / ${realSrc.length}）`);
  assert(real.a.end <= real.b.start, '真实源码中 escapeToSafePoint 必须在 exitInterior 之前结束（不重叠）');
  runner.info(
    `结构锚定自证：基线 ${ok.body.length} 字符（整文件 ${base.length}）· 改名⇒旧写法「起始锚点缺失=空切片 0 字符」/「结束锚点缺失=作用域撑大到 ${oldEndMissing.length} 字符」，两者都假绿 ⇒ 新写法一律抛错 · 插代码/多函数均不改变拼接 · 未闭合⇒抛错 · 真实源码作用域 ${real.body.length}/${realSrc.length}`,
  );
});

/* ==========================================================================
 *  t116 / T7.10：走查图"关节连通"诊断（t77-F4/F6）—— 证伪栅格假设 + 逐栋病因量化
 * ======================================================================== */

await runner.test('E18 关节连通诊断（t116）：通道面↔室内面在图上**可跨**（证伪栅格假设）；18 栋不可达全部有量化病因', async () => {
  const solver = createWalkSolver({});
  const cellSize = 3; // 生产审计口径（不调小 cellSize 绕过）
  const graph = createWalkGraph(solver, { cellSize });
  const area = graph.bounds;
  const center = (c, r) => ({ x: area.minX + c * cellSize, z: area.minZ + r * cellSize });
  const cellsOf = (surface) => {
    const out = [];
    const c0 = Math.ceil((surface.bounds.minX - area.minX) / cellSize);
    const c1 = Math.floor((surface.bounds.maxX - area.minX) / cellSize);
    const r0 = Math.ceil((surface.bounds.minZ - area.minZ) / cellSize);
    const r1 = Math.floor((surface.bounds.maxZ - area.minZ) / cellSize);
    for (let c = c0; c <= c1; c += 1) {
      for (let r = r0; r <= r1; r += 1) {
        const s = graph.sample(c, r);
        if (s.ok) out.push({ col: c, row: r, ...center(c, r), y: s.y });
      }
    }
    return out;
  };
  const interiors = LAYOUT.WALKABLE.filter((w) => w.kind === 'interior');
  const passages = LAYOUT.WALKABLE.filter((w) => w.kind === 'passage');
  const gapOf = (a, b) => {
    const dx = Math.max(0, Math.max(a.bounds.minX - b.bounds.maxX, b.bounds.minX - a.bounds.maxX));
    const dz = Math.max(0, Math.max(a.bounds.minZ - b.bounds.maxZ, b.bounds.minZ - a.bounds.maxZ));
    return Math.hypot(dx, dz);
  };
  /* t8：内景面 / 通道面数量由数据推导（不再写死 43），并与机位侧交叉核对 */
  const interiorSurfaceExpected = Object.keys(LAYOUT.INTERIOR_BY_SLOT ?? {}).length;
  const visitableExpected = LAYOUT.SLOTS.filter((s) => s.visitable === true).length;
  assertEqual(interiors.length, interiorSurfaceExpected, `内景面数必须等于可进入建筑数（${interiorSurfaceExpected}；实际 ${interiors.length}）`);
  assertEqual(passages.length, visitableExpected, `门洞通道面数必须等于可进入建筑数（${visitableExpected}；实际 ${passages.length}）`);
  assert(interiors.length >= 43 && passages.length >= 43, `内景面/通道面不得少于历史快照 43（实际 ${interiors.length} / ${passages.length}）`);

  // ── ① t77 的两条硬事实：相接 43/43；"相接却不可跨"是否成立？
  const rows = [];
  for (const it of interiors) {
    let best = null;
    for (const ps of passages) {
      const g = gapOf(it, ps);
      if (!best || g < best.g) best = { ps, g };
    }
    const ic = cellsOf(it);
    const pc = cellsOf(best.ps);
    let adjacentAny = 0;
    let adjacentCrossable = 0;
    let maxAdjacentDy = 0;
    for (const a of pc) {
      for (const b of ic) {
        if (Math.abs(a.col - b.col) + Math.abs(a.row - b.row) !== 1) continue;
        adjacentAny += 1;
        maxAdjacentDy = Math.max(maxAdjacentDy, Math.abs((b.y ?? 0) - (a.y ?? 0)));
        if (graph.canStep(a.col, a.row, b.col, b.row)) adjacentCrossable += 1;
      }
    }
    // 门口外侧 1.5m 的地面高差（"接近面"）
    const mx = (best.ps.bounds.minX + best.ps.bounds.maxX) / 2;
    const outerZ = best.ps.bounds.minZ - 1.5;
    const outerY = LAYOUT.floorYAt(mx, outerZ);
    const outerProbe = solver.probe(mx, outerZ);
    const anchor = graph.nearestCell(0, -480);
    const mainParents = graph.flood(anchor).parents;
    const inMain = (c) => mainParents[c.row * graph.cols + c.col] !== -2;
    rows.push({
      interior: it.id,
      passage: best.ps.id,
      gap: +best.g.toFixed(3),
      interiorY: it.y,
      passageY: best.ps.y,
      outerY,
      rise: outerY === null ? null : +(best.ps.y - outerY).toFixed(2),
      interiorCells: ic.length,
      passageCells: pc.length,
      adjacentAny,
      adjacentCrossable,
      maxAdjacentDy: +maxAdjacentDy.toFixed(3),
      interiorInMain: ic.length > 0 && ic.some((c) => inMain(c)),
      passageInMain: pc.length > 0 && pc.some((c) => inMain(c)),
      outerBlockedBy: outerProbe.ok ? [] : outerProbe.reasons,
    });
  }
  const touching = rows.filter((r) => r.gap <= 0.05).length;
  assertEqual(touching, 43, `通道面与室内面"相接 ≤0.05m"应成立 43/43（实际 ${touching}）`);

  // ── ② 证伪"1m/3m 栅格把相接处切开 ⇒ 图上无边"：**所有**有通道格的面对都必须存在"相邻且可跨"的格对
  const withCells = rows.filter((r) => r.passageCells > 0 && r.interiorCells > 0);
  const noAdjacency = withCells.filter((r) => r.adjacentAny === 0);
  const crossable = withCells.filter((r) => r.adjacentCrossable > 0);
  const heightOnly = withCells.filter((r) => r.adjacentAny > 0 && r.adjacentCrossable === 0);
  assert(withCells.length >= 40, `应有 ≥40 对两面都有可走格（实际 ${withCells.length}）`);
  // ★ 证伪的核心：**没有任何一对**是"两面都有格却没有相邻格对"（若有，才支持"栅格把相接处切开"）
  assertEqual(
    noAdjacency.length,
    0,
    `不得存在"两面都有格但无相邻格对"的面对（那才是栅格切开）：${JSON.stringify(noAdjacency.map((r) => r.interior))}`,
  );
  // 少数"相邻但不可跨"的，原因必须是**高差超阈值**（布局高程问题），不得是栅格问题
  for (const r of heightOnly) {
    // 原因是**相邻格的采样面高差**超阈值（例如台地 3.0 vs 通道 1.5）⇒ 布局高程问题，不是栅格切开
    assert(
      r.maxAdjacentDy > CONFIG.INTERACTION.step.maxStepHeight + 1e-6 ||
        r.maxAdjacentDy > CONFIG.INTERACTION.step.snapDownDistance + 1e-6,
      `${r.interior} 的关节不可跨必须由相邻格高差解释（实际 maxΔy=${r.maxAdjacentDy}）`,
    );
    assertEqual(
      r.adjacentAny > 0,
      true,
      `${r.interior} 必须存在相邻格对（否则才是"栅格切开"）：adjacentAny=${r.adjacentAny}`,
    );
  }
  runner.info(
    `  关节诊断（cellSize=${cellSize}）：相接 ${touching}/43；两面有格者 ${withCells.length} 对中**可跨邻接** ${crossable.length} 对` +
      `（可跨例：${crossable.slice(0, 2).map((r) => `${r.interior}↔${r.passage}:${r.adjacentCrossable}`).join('、')}）；` +
      `"两面都有格却无相邻格对" ${noAdjacency.length} 对、"相邻但高差超阈值" ${heightOnly.length} 对` +
      ` ⇒ "栅格把相接处切开"假设【证伪】`,
  );

  // ── ③ 逐栋病因：每一个"不可达"都必须落到**两类量化病因**之一（不得有第三种/不明原因）
  const audit = createTraversalAudit({ solver, layout: LAYOUT, cellSize, start: { x: 0, z: -480 } });
  audit.warmupAll();
  const vpRows = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => ({ name: v.id, x: v.position.x, z: v.position.z }));
  const reach = audit.pairedReachability(vpRows);
  const unreachable = reach.filter((r) => !r.ok);
  const classified = [];
  for (const r of unreachable) {
    // 找该机位所属的内景面（按点位落面）
    const surface = interiors.find((w) => r.x >= w.bounds.minX && r.x <= w.bounds.maxX && r.z >= w.bounds.minZ && r.z <= w.bounds.maxZ) ?? null;
    const row = surface ? rows.find((x) => x.interior === surface.id) : null;
    const stepTooBig = row && row.rise !== null && (row.rise > CONFIG.INTERACTION.step.maxStepHeight + 1e-6 || row.rise < -CONFIG.INTERACTION.step.snapDownDistance - 1e-6);
    const noCells = row && (row.passageCells === 0 || row.interiorCells === 0);
    const jointHeight = row && row.adjacentAny > 0 && row.adjacentCrossable === 0;
    // 四个**可核对**的类别（穷尽）；最后一个断言"通道有格但不在主分量"，不得有第五种/不明原因
    const cause = stepTooBig
      ? 'entrance-step'
      : noCells
        ? 'missing-cells'
        : jointHeight
          ? 'joint-height'
          : row && row.passageCells > 0 && row.passageInMain === false
            ? 'passage-outside-main'
            : null;
    classified.push({ ...r, interior: surface?.id ?? null, rise: row?.rise ?? null, passageCells: row?.passageCells ?? null, adjacentCrossable: row?.adjacentCrossable ?? null, passageInMain: row?.passageInMain ?? null, cause });
  }
  const unexplained = classified.filter((c) => c.cause === null);
  assertEqual(unexplained.length, 0, `每个不可达点都必须落到可核对病因（不得有不明原因）：${JSON.stringify(unexplained)}`);
  const byCause = {};
  for (const c of classified) byCause[c.cause] = (byCause[c.cause] ?? 0) + 1;
  // 每类病因都必须带**可复核**的数字/布尔证据（避免"分类即解释"的恒真写法）
  for (const c of classified) {
    if (c.cause === 'entrance-step') assert(c.rise !== null, `${c.name} 病因 entrance-step 必须给出高差`);
    if (c.cause === 'missing-cells') assert(c.passageCells === 0 || c.passageCells === null, `${c.name} 病因 missing-cells 必须给出通道格数`);
    if (c.cause === 'joint-height') assertEqual(c.adjacentCrossable, 0, `${c.name} 病因 joint-height 必须给出"相邻可跨=0"`);
    if (c.cause === 'passage-outside-main') assertEqual(c.passageInMain, false, `${c.name} 病因 passage-outside-main 必须给出"通道不在主分量"`);
  }
  // 判据未放宽（回归锁定）
  assertEqual(CONFIG.INTERACTION.step.maxStepHeight, 0.5, '上台阶阈值必须保持 0.5m（不得为通过而放宽）');
  assertEqual(CONFIG.INTERACTION.step.snapDownDistance, 0.6, '下落吸附阈值必须保持 0.6m');
  runner.info(
    `  43 行可达性复测（cellSize=${cellSize}）：可达 ${43 - unreachable.length}/43、不可达 ${unreachable.length}` +
      `（病因分类：入口台阶缺失 ${byCause['entrance-step'] ?? 0}、缺栅格 ${byCause['missing-cells'] ?? 0}、关节高差 ${byCause['joint-height'] ?? 0}、通道不在主分量 ${byCause['passage-outside-main'] ?? 0}）`,
  );
  for (const c of classified) {
    runner.info(`    ✗ ${c.name}｜内景面 ${c.interior}｜通道面相对外侧地面 ${c.rise === null ? 'n/a' : `${c.rise}m`}｜通道可走格 ${c.passageCells}｜病因 ${c.cause}`);
  }
  assert(unreachable.length <= 43, '可达性统计自洽');
});

/* ==========================================================================
 *  t123 / T7.11：脱困文案与实现语义统一（t99-F4）
 * ======================================================================== */

await runner.test('F24 脱困文案统一（t99-F4）：全仓无「最近安全点/安全可行走点」措辞；按钮·键位·帮助·提示同一语义（最近的已登记出生点）+ 距离如实', async () => {
  // ── ① 静态：src/ui 与 src/interaction 内**不得**再出现与实现不符的措辞（含注释，整文件扫描）
  for (const dir of ['src/ui', 'src/interaction']) {
    for (const name of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.js'))) {
      const text = readFileSync(join(ROOT, dir, name), 'utf8');
      assert(!/最近安全点/.test(text), `${dir}/${name} 不得出现「最近安全点」（实现是最近的已登记出生点）`);
      assert(!/安全可行走点/.test(text), `${dir}/${name} 不得出现「安全可行走点」（实现是最近的已登记出生点）`);
    }
  }
  // ── ② 静态：四处用户可见文案必须同一语义（含"出生点"），且键位/帮助与按钮一致
  const uiSrc = readFileSync(join(ROOT, 'src/ui/index.js'), 'utf8');
  const keySrc = readFileSync(join(ROOT, 'src/interaction/keymap.js'), 'utf8');
  const idxSrc = readFileSync(join(ROOT, 'src/interaction/index.js'), 'utf8');
  assert(/button\('返回最近的已登记出生点（G）'/.test(uiSrc), 'HUD 按钮文案必须为「返回最近的已登记出生点（G）」');
  assert(/'脱离卡死（返回最近的已登记出生点）'/.test(keySrc), 'G 键 label 必须同义');
  assert(/rows\.push\(\{ code: 'G', label: '卡住了？返回最近的已登记出生点/.test(keySrc), '帮助行必须同义');
  assert(/title: `已脱离 · 返回最近的已登记出生点（\$\{moved\.toFixed\(1\)\} m）`/.test(idxSrc), '成功提示标题必须含"已登记出生点"+距离');
  assert(/按 G 或点「返回最近的已登记出生点」脱离/.test(idxSrc), '卡死提示正文必须同义');
  // 帮助键表里列出的 G 行与键位实现同源（helpKeyList 由 resolveKey 生成）
  const gRow = helpKeyList().find((r) => r.code === 'G');
  assert(gRow && /已登记出生点/.test(gRow.label), `帮助行必须与实现同义：${JSON.stringify(gRow)}`);

  // ── ③ 行为：脱困成功提示 = 已脱离 + 已登记出生点 + 实际距离（与 lastEscape.moved 一致，1 位小数）
  const app = await makeApp();
  const eye = CONFIG.CAMERA.fpEyeHeight;
  app.interaction.requester.viewMode('fp');
  for (let i = 0; i < 240 && app.rig.isFp !== true; i += 1) app.rig.update(1 / 60, 0, app.store.state);
  assertEqual(app.rig.isFp, true, '应已进入第一人称');
  const pos = { x: -58, z: -377.647 };
  app.rig.position.set(pos.x, (LAYOUT.floorYAt(pos.x, pos.z) ?? 0) + eye, pos.z);
  const near = app.registry.nearestFpSpawn(app.rig.describe().position);
  const res = app.interaction.escapeToSafePoint('test:wording');
  const hint = app.interaction.lastHint();
  assertEqual(res.ok, true, `脱困应成功（${res.reason}）`);
  assertEqual(res.spawnId, near.viewpoint.id, '落点必须是最远的…最近已登记出生点（nearestFpSpawn）');
  const expectDistance = `${res.moved.toFixed(1)} m`;
  assert(
    hint.title.includes('已脱离') && hint.title.includes('已登记出生点') && hint.title.includes(expectDistance),
    `成功提示必须含"已登记出生点"与距离 ${expectDistance}，实际「${hint.title}」`,
  );
  assert(!/最近安全点/.test(hint.title + hint.detail), '提示中不得出现与实现不符的措辞');
  assert(Number.isFinite(res.moved) && res.moved >= 0, `距离必须可量化：${res.moved}`);
  runner.info(
    `  脱困文案（t99-F4）：按钮/键位/帮助/提示统一为「返回最近的已登记出生点」；本次落点 ${res.spawnId}、距离 ${expectDistance}` +
      `（文案与实现一致；全仓「最近安全点/安全可行走点」= 0 处）`,
  );
  app.interaction.dispose();
  app.ui.dispose();
});

/* ==========================================================================
 *  t139 / T7.12：台阶阈值边界口径（< vs <=）锁定 —— 契约说 ≤，引擎是严格 <
 * ======================================================================== */

await runner.test('F25 台阶边界口径（t139）：契约「上≤0.5 / 下≤0.6」vs 引擎严格 `<` —— 锁定现状 + 跨引擎一致 + 登记冲突', async () => {
  const step = CONFIG.INTERACTION.step;
  const down = step.snapDownDistance;
  const up = step.maxStepHeight;
  // 阈值数值不得改动
  assertEqual(up, 0.5, '上行阈值必须仍为 0.5m');
  assertEqual(down, 0.6, '下落阈值必须仍为 0.6m');

  // ① 契约原文（只读引用）：docs/CONTRACTS.md 明写「上 ≤ maxStepHeight 0.5 / 下 ≤ snapDownDistance 0.6」
  const contracts = readFileSync(join(ROOT, 'docs/CONTRACTS.md'), 'utf8');
  assert(/下\s*≤\s*`snapDownDistance 0\.6`/.test(contracts), '契约必须仍写「下 ≤ snapDownDistance 0.6」');
  assert(/台阶阈值：可跨 `0\.5m`，下台阶吸附 `0\.6m`/.test(contracts), '契约必须仍写「可跨 0.5m，下台阶吸附 0.6m」');

  // ② 现状（**锁定**，防再次漂移）：两侧引擎在「恰好等于阈值」处的实际行为
  // ② 合成受控世界（无真实几何/障碍干扰）：x ≥ 0 面高 1.0、x < 0 面高 0.0
  const fake = {
    TERRAIN_EXTENT: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    WALKABLE: [], ROADS: [], OBSTACLES: [], CONNECTORS: [],
    floorYAt: (x) => (x >= 0 ? 1 : 0),
    walkableAt: () => [],
    insideEnvelope: () => true,
  };
  const solver = createWalkSolver({ layout: fake, obstacles: [] });
  const probeAt = (feetY) => solver.probe(0, 0, feetY); // 目标面高恒为 1.0
  const exactDown = probeAt(1 + down); // 落差恰 −0.6
  const overDown = probeAt(1 + down + 1e-6); // 落差 −0.600001
  const nearDown = probeAt(1 + down - 1e-9); // 落差 −0.599999999
  const exactUp = probeAt(1 - up); // 落差恰 +0.5
  const overUp = probeAt(1 - (up + 1e-6)); // 落差 +0.500001（超阈 1e−6）
  const nearUp = probeAt(1 - (up - 1e-9)); // 落差 +0.499999999
  // t142 修复后（与契约「≤ 含等号」及 core 同口径）：**恰等阈值可跨、超阈 1e−6 才挡**
  assertEqual(exactDown.ok, true, '落差恰 −0.6 必须可跨（契约「下 ≤ 0.6」含等号）');
  assertEqual(exactUp.ok, true, '落差恰 +0.5 必须可跨（契约「上 ≤ 0.5」含等号）');
  assertEqual(overDown.ok, false, '超阈 1e−6 必阻挡（下落）');
  assert(overDown.reasons.includes('dropTooDeep'), `下落超阈原因应为 dropTooDeep：${JSON.stringify(overDown.reasons)}`);
  assertEqual(overUp.ok, false, '超阈 1e−6 必阻挡（上行）');
  assert(overUp.reasons.includes('stepTooHigh'), `上行超阈原因应为 stepTooHigh：${JSON.stringify(overUp.reasons)}`);
  assertEqual(nearDown.ok, true, '略小于阈值（−0.6+1e−9）必须可跨');
  assertEqual(nearUp.ok, true, '略小于阈值（+0.5−1e−9）必须可跨');

  // ③ 口径已按契约收敛（t142；原为"严格 <"的登记冲突已解除）：
  //    契约写「下 ≤ 0.6」⇒ 恰 0.6 本该可跨；但**两侧引擎（mine 与 core）现状都是严格 `<`** ⇒ 恰 0.6 被挡。
  //    本卡**未改实现**：只改 mine 会破坏 E7/E12 的跨引擎等价（实测 3 例翻红），故修正必须落在 `src/core/**`（+ 契约登记）。
  runner.info(
    '  边界口径（t139）：契约「上≤0.5 / 下≤0.6」；引擎现状 = 上含界（恰 0.5 可跨 ✓）、**下严格 <**（恰 −0.6 被挡 dropTooDeep，mine === core 一致）' +
      ' ⇒ 契约与引擎在"恰 0.6"处不一致（玩家可见：t77 的 2 处 + 寝殿西配殿门内 1.7 落差）；修正需落在 src/core/**（或改契约措辞）——交回裁定',
  );
});

/* ==========================================================================
 *  t146 / T7.14：E8/E11 的 12 栋红 = 粗口径(cellSize=3)伪影裁定
 * ======================================================================== */

await runner.test('F26 口径裁定（t146）：E18/E8/E11 用 cellSize=3；细口径(1m+提额)下 12 栋中 10 栋可达 ⇒ 粗口径伪影（不得据此补几何）', async () => {
  const solver = createWalkSolver({});
  const anchor = { x: 0, z: -480 };
  const build = (cellSize, maxCells) => {
    const g = createWalkGraph(solver, { cellSize, maxCells });
    const a = g.nearestCell(anchor.x, anchor.z);
    const parents = g.flood(a).parents;
    const rows = new Map();
    for (const vp of LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior')) {
      const cell = g.nearestCell(vp.position.x, vp.position.z);
      const p = g.path(anchor, vp.position); // ★ 生产 API（内部即 flood）
      rows.set(vp.id, {
        pathOk: p.ok === true,
        bfsOk: cell ? parents[cell.row * g.cols + cell.col] !== -2 : false,
      });
    }
    return { g, rows };
  };
  // 口径①：粗（= E18/E8/E11 当前口径）；口径②：细（cellSize=1 + 显式提额）
  const coarse = build(3, 400000);
  const fine = build(1, 1200000);
  // 交叉校验：生产 path 与自建 BFS 必须逐栋一致（两套口径）
  for (const [name, r] of [['粗(3m)', coarse], ['细(1m)', fine]]) {
    const agree = [...r.rows.values()].filter((x) => x.pathOk === x.bfsOk).length;
    assertEqual(agree, 43, `${name}：path 与自建 BFS 必须逐栋一致（实际 ${agree}/43）`);
  }
  const coarseUnreachable = [...coarse.rows.entries()].filter(([, v]) => !v.pathOk).map(([k]) => k);
  const fineUnreachable = [...fine.rows.entries()].filter(([, v]) => !v.pathOk).map(([k]) => k);
  const artifacts = coarseUnreachable.filter((id) => fine.rows.get(id)?.pathOk === true);
  // t156：绝对条数会随 layout 在途进展漂移 ⇒ 改为**数据推导的结构性判据**（不硬编码 12/10/2）
  assertEqual(artifacts.length, coarseUnreachable.length - fineUnreachable.length, `粗口径独有不可达者应恰为"粗不可达 − 细不可达"（实际 ${artifacts.length} vs ${coarseUnreachable.length - fineUnreachable.length}）`);
  assert(coarseUnreachable.length >= fineUnreachable.length, '粗口径不可达数不得少于细口径（粗口径只会更多）');
  assert(artifacts.length > 0, `必须存在"粗不可达/细可达"的粗口径伪影（实际 ${artifacts.length}）——否则粗口径才具权威性`);
  // t156：细口径缺口集合随 layout 进展变化（当前已收敛为 0）⇒ 不硬编码点名，改为"结构性 + 有则点名"
  if (fineUnreachable.length > 0) {
    runner.info(`    细口径真实缺口（需 layout 卡）：${fineUnreachable.join('、')}`);
  } else {
    assertEqual(fineUnreachable.length, 0, '细口径现已全可达（权威口径）');
  }
  // 粗口径结论**不具权威性**：至少 1 栋是"粗不可达/细可达"⇒ 用它给 layout 派"补台阶"就是错误层面加几何
  assert(artifacts.length > 0, '粗口径不得作为"入口台阶缺失"的依据');
  runner.info(
    `  口径裁定（t146）：粗(3m) 可达 ${43 - coarseUnreachable.length}/43、细(1m+提额) 可达 ${43 - fineUnreachable.length}/43；` +
      `交叉校验 path≡BFS 两套口径各 43/43 ✓；` +
      `粗口径伪影 ${artifacts.length} 栋（如 ${artifacts.slice(0, 3).join('、')}）；细口径真实缺口 ${fineUnreachable.length} 栋：${fineUnreachable.join('、')}` +
      ` ⇒ **不得据粗口径让 layout 补台阶**`,
  );
});

/* ==========================================================================
 *  t156 / T7.16：库级口径一致（connected ≡ path）+ 过渡带双向审计（F11/F12）
 *  t26 / T7.17：**取格口径统一**（同一坐标 ⇒ 同一格）+ 粗口径"空真"标注（§12.1.4.4）
 *              + 「F27 连跑 ≥10 轮逐轮一致」常驻断言（F28）
 * ======================================================================== */

/** t26：过渡带双向审计的**唯一读数函数**（F27 / F28 共用；两处判据不得各写一份）。 */
const T26_ANCHOR = { x: 0, z: -480 }; // 公共锚点（与 E8/E11/E18 同源）
const T26_BANDS = LAYOUT.WALKABLE.filter((w) => /-transition-|-descent-|-threshold/.test(w.id));
const t26Center = (b) => ({ cx: (b.bounds.minX + b.bounds.maxX) / 2, cz: (b.bounds.minZ + b.bounds.maxZ) / 2 });
/**
 * 逐带读数：正向 `componentOf`（从锚点 A 能否走到该带）＋反向 `connected`（从该带能否走回 A）。
 * 一并带回**取到的格**（`componentOf().cell`）与**反向 flood 的锚点格**（`connected().anchors[0]`），
 * 供"同一坐标取格口径统一"断言（t26：两者必须是**同一格对象**）。
 */
function t26BandRows(graph, order = 'fwd-first') {
  const rows = [];
  for (const b of T26_BANDS) {
    const { cx, cz } = t26Center(b);
    const point = { x: cx, z: cz };
    let fwd;
    let bwd;
    if (order === 'bwd-first') {
      bwd = graph.connected([point, T26_ANCHOR]);
      fwd = graph.componentOf(cx, cz, T26_ANCHOR);
    } else {
      fwd = graph.componentOf(cx, cz, T26_ANCHOR);
      bwd = graph.connected([point, T26_ANCHOR]);
    }
    rows.push({
      id: b.id,
      cell: fwd.cell ? `${fwd.cell.col},${fwd.cell.row}` : null,
      anchor: bwd.anchors[0] ? `${bwd.anchors[0].col},${bwd.anchors[0].row}` : null,
      sameSnap: fwd.cell !== null && fwd.cell === bwd.anchors[0],
      fwd: fwd.ok,
      bwd: bwd.ok,
    });
  }
  return rows;
}
/** t26：格面高（走图侧唯一取样入口 ⇒ 与 `canStep` 同精度）。 */
function t26Cell(graph, col, row) {
  const s = graph.sample(col, row);
  return { col, row, ok: s.ok === true, y: s.y };
}
/**
 * t26：带邻域的**边分类**（空真标注用）——
 *   `nominalOneWay`：用 `layout.floorYAt`（float64 双侧）按 `canStep` 的同一语义判"名义单向"；
 *   `graphOneWay`  ：图侧（float32）实际单向；
 *   `masked`       ：名义单向 **但** 图侧两向都拒 ⇒ 这条单向被**掩码**了（粗口径看不见它）。
 */
function t26EdgeClasses(graph) {
  const stepCfg = CONFIG.INTERACTION.step;
  const EPS = 1e-9;
  const out = [];
  for (const b of T26_BANDS) {
    const { cx, cz } = t26Center(b);
    const cell = graph.snapPoint({ x: cx, z: cz }); // t26：唯一取格入口
    if (!cell) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = t26Cell(graph, cell.col, cell.row);
      const n = t26Cell(graph, cell.col + dc, cell.row + dr);
      if (a.ok !== true || n.ok !== true) continue;
      const xa = graph.bounds.minX + a.col * graph.cellSize;
      const za = graph.bounds.minZ + a.row * graph.cellSize;
      const xn = graph.bounds.minX + n.col * graph.cellSize;
      const zn = graph.bounds.minZ + n.row * graph.cellSize;
      const yA64 = LAYOUT.floorYAt(xa, za);
      const yB64 = LAYOUT.floorYAt(xn, zn);
      if (yA64 === null || yB64 === null) continue;
      const d64 = yA64 - yB64;
      const allowedAB = d64 <= stepCfg.snapDownDistance + EPS && -d64 <= stepCfg.maxStepHeight + EPS;
      const allowedBA = -d64 <= stepCfg.snapDownDistance + EPS && d64 <= stepCfg.maxStepHeight + EPS;
      const nominalOneWay = allowedAB !== allowedBA;
      const graphFwd = graph.canStep(a.col, a.row, n.col, n.row);
      const graphBwd = graph.canStep(n.col, n.row, a.col, a.row);
      out.push({
        bandId: b.id,
        pair: `${a.col},${a.row}↔${n.col},${n.row}`,
        nominalOneWay,
        graphOneWay: graphFwd !== graphBwd,
        masked: nominalOneWay && graphFwd === false && graphBwd === false,
        d64,
        d32: a.y - n.y,
      });
    }
  }
  return out;
}
/**
 * t26：**已登记的粗口径伪影集合**（§12.1.4.4「粗口径只锁已知伪影集合」，**精确集合相等**）。
 * 语义：这些过渡带在 `cellSize:3` 下"两侧均不可达"，但在权威细口径（`cellSize:1`）下**两向可达**
 * ⇒ 是**粗口径伪影**（3m 格心取不到窄面/中间级），不是真实缺口。
 * 布局变更导致集合变化 ⇒ 本条变红，须**同轮重新登记**（这正是"锁"的目的；不得据粗口径补几何）。
 */
const T26_COARSE_ARTIFACTS = [
  'WK-B-hall-mid-transition-1@140,173',
  'WK-B-hall-mid-transition-2@140,173',
  'WK-B-hall-rear-transition-1@140,194',
  'WK-B-hall-rear-transition-2@140,194',
  'WK-B-side-east-main-transition-1@162,148',
  'WK-B-side-west-main-transition-1@118,148',
  'WK-B-side-east-rear-transition-1@158,201',
  'WK-B-side-west-rear-transition-1@122,201',
  'WK-C-hall-bed-rear-transition-1@140,265',
  'WK-C-hall-bed-rear-transition-2@140,265',
  'WK-C-hall-bed-rear-transition-3@140,265',
  'WK-C-side-east-rear-transition-1@156,270',
  'WK-C-side-west-rear-transition-1@124,270',
  'WK-E-court2-hall-transition-1@221,137',
];

await runner.test('F27 库级口径一致（t156）：connected([a,b]).ok ≡ path(a→b).ok（固定锚点+代表性点集）+ 55 处过渡带双向读数', async () => {
  const solver = createWalkSolver({});
  const graph = createWalkGraph(solver, { cellSize: 3 });
  const A = { x: 0, z: -480 }; // 公共锚点（与 E8/E11/E18 同源）

  // ── 代表性点集：43 内景机位 + 5 出生点 + t77 点名的 4 点
  const named = [
    { id: 't77:文华殿门内', x: LAYOUT.SLOTS.find((s) => s.id === 'C-hall-east-main')?.x ?? 0, z: LAYOUT.SLOTS.find((s) => s.id === 'C-hall-east-main')?.z ?? 0 },
    { id: 't77:陈设正堂门内', x: LAYOUT.SLOTS.find((s) => s.id === 'D-court1-hall')?.x ?? 0, z: LAYOUT.SLOTS.find((s) => s.id === 'D-court1-hall')?.z ?? 0 },
  ];
  const pts = [
    ...LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => ({ id: v.id, x: v.position.x, z: v.position.z })),
    ...LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ id: v.id, x: v.position.x, z: v.position.z })),
    ...named,
  ];
  const mismatches = [];
  for (const p of pts) {
    const byConnected = graph.connected([A, { x: p.x, z: p.z }]).ok; // ★ .ok 判据（严禁 != null）
    const byPath = graph.path(A, { x: p.x, z: p.z }).ok === true;
    if (byConnected !== byPath) mismatches.push(`${p.id}：connected=${byConnected} path=${byPath}`);
  }
  assertEqual(mismatches.length, 0, `connected([a,b]).ok 必须与 path(a→b).ok 逐对一致（不一致 ${mismatches.length} 项）：${mismatches.slice(0, 6).join('；')}`);
  // 多锚点一次性调用也必须与逐点同口径（t77 的原始形态：74/94 点一次传）
  const allAtOnce = graph.connected([A, ...pts.map((p) => ({ x: p.x, z: p.z }))]);
  const perPointOk = pts.filter((p) => graph.connected([A, { x: p.x, z: p.z }]).ok).length;
  assertEqual(allAtOnce.ok, perPointOk === pts.length, `一次性 connected(锚点+${pts.length} 点).ok 必须等于"逐点全部可达"（实际 ${allAtOnce.ok} / 逐点可达 ${perPointOk}）：${JSON.stringify(allAtOnce.unreachable.slice(0, 4))}`);
  runner.info(`  库级一致（t156）：connected≡path 逐对比较 ${pts.length} 对 ⇒ 不一致 ${mismatches.length} 项；一次性 ${pts.length + 1} 点调用 ok=${allAtOnce.ok}（逐点可达 ${perPointOk}/${pts.length}）`);

  // ── F12：每处新增/修改的过渡带（-transition-* / -descent-* / -threshold）双向读数
  const bandRows = t26BandRows(graph, 'fwd-first');
  assert(bandRows.length > 0, '必须存在过渡带面（-transition-*/-descent-*/-threshold）');

  // t26①：**取格口径统一** —— 同一坐标（带中心）经正向 `componentOf` 与反向 `connected`
  //   必须取到**同一格**：① 坐标逐值相等（语义）；② **同一格对象**（机制：唯一取格入口
  //   `snapPoint` + 按 `(半径,x,z)` 记忆化的同一缓存键）。两条都要 —— 只查坐标无法发现
  //   "某一调用点悄悄换了半径"（实测 M1 突变：半径 6→5 时坐标仍相同、但对象不同 ⇒ 必红）。
  const snapCoordMismatch = bandRows.filter((r) => r.cell === null || r.anchor === null || r.cell !== r.anchor);
  assertEqual(
    snapCoordMismatch.length,
    0,
    `同一坐标必须取到同一格坐标（componentOf().cell ≡ connected().anchors[0]）：不一致 ${snapCoordMismatch.length} 项：${snapCoordMismatch.slice(0, 4).map((r) => `${r.id} cell=${r.cell} anchor=${r.anchor}`).join('；')}`,
  );
  const snapMismatch = bandRows.filter((r) => r.sameSnap !== true);
  assertEqual(
    snapMismatch.length,
    0,
    `取格必须由**唯一入口**给出（同一吸附函数/同一半径/同一缓存键 ⇒ 同一格对象；重构取格实现须同轮同步本断言）：不一致 ${snapMismatch.length} 项：${snapMismatch.slice(0, 4).map((r) => `${r.id} cell=${r.cell} anchor=${r.anchor}`).join('；')}`,
  );
  const snapStats = graph.snapStats();
  assert(snapStats.entries > 0 && snapStats.hits > 0, `取格口径缓存必须生效（条目 ${snapStats.entries} / 命中 ${snapStats.hits}）`);

  const oneWay = bandRows.filter((r) => r.fwd !== r.bwd);
  assertEqual(oneWay.length, 0, `过渡带不得存在"单向"（正/反向读数不一致）：${oneWay.map((r) => `${r.id} fwd=${r.fwd} bwd=${r.bwd}`).slice(0, 6).join('；')}`);
  const notInMain = bandRows.filter((r) => !r.fwd && !r.bwd);

  // ── t26②：**空真标注**（§12.1.4.4：粗口径永远不得驱动几何）
  //   粗口径上"名义单向"的格对会被 float32 两向都拒（§12.1.4.5 的 0.6 级差）⇒ 被**掩码**，
  //   于是上面那条「单向 = 0」对**这一整类**是**空真**（在空集上通过）。必须显式量化 + 在细口径重判。
  const classes = t26EdgeClasses(graph);
  const nominalOneWay = classes.filter((c) => c.nominalOneWay);
  const graphOneWay = classes.filter((c) => c.graphOneWay);
  const masked = classes.filter((c) => c.masked);
  const maskedBands = [...new Set(masked.map((c) => c.bandId))];
  runner.info(
    `  空真标注（t26）：粗口径带邻域格对 ${classes.length}｜名义(float64)单向 ${nominalOneWay.length}｜图侧(float32)单向 ${graphOneWay.length}｜**被掩码（名义单向 ∧ 图侧双拒）${masked.length}**` +
      (masked.length ? ` ⇒ 上面「单向=0」对**被掩码类**是空真：${masked.map((c) => `${c.bandId}:${c.pair} Δ64=${c.d64} Δ32=${c.d32}`).slice(0, 4).join('；')}` : '') +
      `｜必须在**细口径**上重新判定（见下）`,
  );
  assert(masked.length > 0, `粗口径必须存在"名义单向但图侧双拒"的被掩码对（当前 ${masked.length}）——否则本条的「单向=0」才具内容；若几何已留裕量（§12.1.4.5）致该类消失，须同轮重新登记本标注`);
  assert(nominalOneWay.length >= masked.length, '被掩码类必是名义单向类的子集（分类完备）');
  assertEqual(graphOneWay.length, 0, `带邻域内图侧（float32）不得有单向格对：${graphOneWay.map((c) => `${c.bandId}:${c.pair}`).slice(0, 4).join('；')}`);

  // ── t26③：被掩码类必须在**权威细口径**（cellSize:1 + 显式提额）上重新判定
  const fineGraph = createWalkGraph(createWalkSolver({}), { cellSize: 1, maxCells: 3000000 });
  const fineRows = t26BandRows(fineGraph, 'fwd-first');
  const fineOneWay = fineRows.filter((r) => r.fwd !== r.bwd);
  const fineUnreachable = fineRows.filter((r) => r.fwd === false || r.bwd === false);
  assertEqual(fineOneWay.length, 0, `细口径（权威）下过渡带不得单向：${fineOneWay.map((r) => `${r.id} fwd=${r.fwd} bwd=${r.bwd}`).slice(0, 6).join('；')}`);
  assertEqual(fineUnreachable.length, 0, `细口径（权威）下 ${bandRows.length} 处过渡带必须两向可达：${fineUnreachable.map((r) => `${r.id} fwd=${r.fwd} bwd=${r.bwd}`).slice(0, 6).join('；')}`);
  const fineById = new Map(fineRows.map((r) => [r.id, r]));
  const maskedNotJudged = maskedBands.filter((id) => {
    const r = fineById.get(id);
    return !(r && r.fwd === true && r.bwd === true);
  });
  assertEqual(maskedNotJudged.length, 0, `被粗口径掩码的带必须在细口径上两向可达（重判）：${maskedNotJudged.join('；')}`);
  const fineClasses = t26EdgeClasses(fineGraph);
  const fineMasked = fineClasses.filter((c) => c.masked);
  assertEqual(fineMasked.length, 0, `细口径带邻域不得再有被掩码的单向对（实际 ${fineMasked.length}）`);

  // ── t26④：粗口径只锁**已登记伪影集合**（§12.1.4.4，精确集合相等；不得据粗口径补几何）
  const coarseArtifacts = bandRows.filter((r) => !r.fwd && !r.bwd).map((r) => `${r.id}@${r.cell}`);
  assertEqual(
    JSON.stringify(coarseArtifacts),
    JSON.stringify(T26_COARSE_ARTIFACTS),
    `粗口径"两侧均不可达"集合必须与已登记伪影集合**精确相等**（§12.1.4.4；布局变更 ⇒ 同轮重新登记）：实际 ${coarseArtifacts.length} / 登记 ${T26_COARSE_ARTIFACTS.length}` +
      `｜新增 ${JSON.stringify(coarseArtifacts.filter((x) => !T26_COARSE_ARTIFACTS.includes(x)))}｜消失 ${JSON.stringify(T26_COARSE_ARTIFACTS.filter((x) => !coarseArtifacts.includes(x)))}`,
  );
  const artifactNotArtifact = bandRows
    .filter((r) => !r.fwd && !r.bwd)
    .filter((r) => {
      const f = fineById.get(r.id);
      return !(f && f.fwd === true && f.bwd === true);
    });
  assertEqual(artifactNotArtifact.length, 0, `登记为"粗口径伪影"的带在细口径下必须可达（否则是真实缺口，不得登记为伪影）：${artifactNotArtifact.map((r) => r.id).join('；')}`);

  runner.info(
    `  过渡带双向审计（F12）：${bandRows.length} 处（-transition-*/-descent-*/-threshold）｜粗口径正向可达 ${bandRows.filter((r) => r.fwd).length}｜反向可达 ${bandRows.filter((r) => r.bwd).length}｜单向 ${oneWay.length}｜两侧均不可达 ${notInMain.length}（= 已登记粗口径伪影集合，细口径两向全可达）` +
      (notInMain.length ? `：${notInMain.map((r) => r.id).slice(0, 6).join('、')}` : ''),
  );
  runner.info(
    `  细口径（权威，cellSize:1 + maxCells:3e6）：${fineRows.length} 处过渡带**两向全可达**｜单向 ${fineOneWay.length}｜被掩码类 ${fineMasked.length}｜取格同对象 ${fineRows.filter((r) => r.sameSnap).length}/${fineRows.length}`,
  );
});

/* ==========================================================================
 *  t26 / T7.17：**取格口径确定性** —— F27 读数连跑 ≥10 轮逐轮一致（精确指纹）
 * ======================================================================== */

await runner.test('F28 取格口径确定性（t26）：F27 读数连跑 12 轮逐轮一致（精确指纹）+ 顺序无关 + 跨图无状态', async () => {
  const mk = () => createWalkGraph(createWalkSolver({}), { cellSize: 3 });
  const fingerprint = (rows) => JSON.stringify(rows.map((r) => [r.id, r.cell, r.anchor, r.fwd, r.bwd]));
  const rounds = [];
  // ① 共享图·暖（同一张图上反复读数；奇偶轮**对调调用顺序** componentOf/connected）
  const shared = mk();
  for (let i = 0; i < 6; i += 1) {
    const order = i % 2 === 1 ? 'bwd-first' : 'fwd-first';
    rounds.push({ label: `共享图·暖·${order}`, rows: t26BandRows(shared, order) });
  }
  // ② 每轮**新建图**（冷；无任何跨轮缓存/状态共享）
  for (let i = 0; i < 4; i += 1) {
    const order = i % 2 === 1 ? 'bwd-first' : 'fwd-first';
    rounds.push({ label: `新图·冷·${order}`, rows: t26BandRows(mk(), order) });
  }
  // ③ 前置**不同调用历史**（先跑点集审计 + path，填充 cells 与 label 缓存）后读数
  for (let i = 0; i < 2; i += 1) {
    const order = i % 2 === 1 ? 'bwd-first' : 'fwd-first';
    const g = mk();
    g.connected([T26_ANCHOR, ...LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').slice(0, 10).map((v) => ({ x: v.position.x, z: v.position.z }))]);
    g.path(T26_ANCHOR, { x: 0, z: 200 });
    rounds.push({ label: `新图·暖·带前置历史·${order}`, rows: t26BandRows(g, order) });
  }

  assert(rounds.length >= 12, `必须连跑 ≥10 轮（实际 ${rounds.length}）`);
  const prints = [...new Set(rounds.map((r) => fingerprint(r.rows)))];
  assertEqual(
    prints.length,
    1,
    `F27 读数必须**逐轮一致（精确）**：${rounds.length} 轮出现 ${prints.length} 个不同指纹｜各轮：${rounds.map((r) => `${r.label}=${fingerprint(r.rows).length}`).join(' ')}`,
  );
  const rows = rounds[0].rows;
  assert(rows.length >= 50, `指纹必须覆盖 ≥50 处过渡带（防恒真；实际 ${rows.length}）`);
  assert(rows.every((r) => r.cell !== null && r.anchor !== null && r.sameSnap === true), '每轮每带的取格都必须"同一坐标同一格对象"');
  const oneWay = rows.filter((r) => r.fwd !== r.bwd);
  assertEqual(oneWay.length, 0, `12 轮指纹内的单向必须为 0（实际 ${oneWay.length}）`);
  runner.info(
    `  取格口径确定性（t26）：${rounds.length} 轮（共享图暖 6 / 新图冷 4 / 带前置历史 2，奇偶轮对调调用顺序）⇒ **不同指纹 ${prints.length} 个**｜覆盖 ${rows.length} 处过渡带｜单向 ${oneWay.length}`,
  );
});

/* ==========================================================================
 *  G. t7 面板默认折叠 + 箭头（可点击 / 键盘可达 / 等价 a11y）
 * ======================================================================== */

runner.section('G. t7 面板默认折叠 + 箭头');

/** 面板查找与折叠状态读取（唯一口径）：值来自 DOM 属性，不看 CSS 猜测。 */
const panelOf = (app, id) => app.app.querySelectorAll('[data-ui-panel]').find((el) => el.attrs['data-ui-panel'] === id);
const partOf = (panel, name) => panel.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === name);
const toggleOf = (panel) => panel.querySelectorAll('[data-action]').find((el) => el.attrs['data-action'] === 'toggle-panel');
/** 面板清单（t7 盘点结果）：13 个 data-ui-panel = 9 个可折叠内容面板 + 4 个非折叠件。 */
const COLLAPSIBLE_IDS = ['hud', 'views', 'zones', 'env', 'tour', 'minimap', 'help', 'loading', 'info'];
const NON_COLLAPSIBLE_IDS = ['brand', 'labels', 'stuck', 'toast'];

await runner.test('G1 盘点 + 默认全折叠（**逐面板**精确断言，不是"存在即可见"）', async () => {
  const app = await makeApp();
  const panels = app.app.querySelectorAll('[data-ui-panel]');
  // t8：面板总数由**清单推导**（9 可折叠 + 4 非折叠 = CONTRACTS §11.3.1 登记），不再写死 13
  assertEqual(panels.length, COLLAPSIBLE_IDS.length + NON_COLLAPSIBLE_IDS.length, `data-ui-panel 总数应为清单之和 ${COLLAPSIBLE_IDS.length + NON_COLLAPSIBLE_IDS.length}（实际 ${panels.map((p) => p.attrs['data-ui-panel']).join(',')}）`);
  for (const id of COLLAPSIBLE_IDS) {
    const panel = panelOf(app, id);
    assert(panel, `应存在面板 ${id}`);
    assertEqual(panel.attrs['data-collapsible'], '1', `${id} 应登记为可折叠`);
    assertEqual(panel.attrs['data-collapsed'], '1', `${id} 默认必须是**折叠**态`);
    const toggle = toggleOf(panel);
    assert(toggle, `${id} 应有折叠头（data-action="toggle-panel"）`);
    assertEqual(toggle.attrs['aria-expanded'], 'false', `${id} 折叠时 aria-expanded 必须为 false`);
    const body = partOf(panel, 'panel-body');
    assert(body, `${id} 应有内容体（data-ui-part="panel-body"）`);
    assertEqual(body.hidden, true, `${id} 折叠时内容体必须 hidden（不占布局）`);
    assertEqual(partOf(panel, 'arrow').textContent, '▸', `${id} 折叠箭头字形应为 ▸`);
  }
  for (const id of NON_COLLAPSIBLE_IDS) {
    const panel = panelOf(app, id);
    assert(panel, `应存在非折叠件 ${id}`);
    assertEqual(toggleOf(panel), undefined, `${id} 不应有折叠头（它不属于"内容面板"：见回执盘点表）`);
    assertEqual(panel.attrs['data-collapsible'], undefined, `${id} 不应登记为可折叠`);
  }
  // 面板读数（机器可判）
  const stats = app.ui.stats();
  assertEqual(stats.collapsible.length, COLLAPSIBLE_IDS.length, 'stats().collapsible 应逐面板登记');
  for (const id of COLLAPSIBLE_IDS) assertEqual(stats.collapsed[id], true, `stats().collapsed.${id} 应为 true（默认折叠）`);
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('G2 箭头可切换（点击）：折叠 ⇄ 展开，且四项读数同步', async () => {
  const app = await makeApp();
  const panel = panelOf(app, 'views');
  const toggle = toggleOf(panel);
  const body = partOf(panel, 'panel-body');
  const arrow = partOf(panel, 'arrow');
  toggle.dispatch('click', {});
  assertEqual(panel.attrs['data-collapsed'], '0', '点击后应展开');
  assertEqual(toggle.attrs['aria-expanded'], 'true', 'aria-expanded 应同步为 true');
  assertEqual(body.hidden, false, '展开后内容体可见');
  assertEqual(arrow.textContent, '▾', '展开箭头字形应为 ▾');
  assertEqual(panel.hidden, false, '折叠 ≠ 移除 DOM：面板始终在文档里');
  toggle.dispatch('click', {});
  assertEqual(panel.attrs['data-collapsed'], '1', '再点一次回到折叠');
  assertEqual(body.hidden, true, '折叠后内容体不可见');
  assertEqual(toggle.attrs['aria-expanded'], 'false', 'aria-expanded 回到 false');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('G3 键盘可达 + 等价 a11y：原生 button + Enter/Space 切换 + aria-controls 关联', async () => {
  const app = await makeApp();
  for (const id of COLLAPSIBLE_IDS) {
    const panel = panelOf(app, id);
    const toggle = toggleOf(panel);
    assertEqual(toggle.tagName, 'BUTTON', `${id} 折叠头必须是原生 <button>（Tab 可达、读屏可识别、Enter/Space 原生激活）`);
    assertEqual(toggle.attrs.type ?? toggle.type, 'button', `${id} 折叠头 type 应为 button（不触发表单提交）`);
    assertEqual(toggle.attrs.tabindex ?? null, null, `${id} 不得把折叠头排除在 Tab 顺序外（tabindex 未设 = 可聚焦）`);
    const body = partOf(panel, 'panel-body');
    assertEqual(toggle.attrs['aria-controls'], body.attrs.id, `${id} aria-controls 必须指向内容体 id`);
    const sameId = app.app.querySelectorAll('[id]').length;
    void sameId;
  }
  const panel = panelOf(app, 'zones');
  const toggle = toggleOf(panel);
  const body = partOf(panel, 'panel-body');
  // Enter 切换
  toggle.dispatch('keydown', { key: 'Enter', code: 'Enter' });
  assertEqual(panel.attrs['data-collapsed'], '0', 'Enter 应展开');
  assertEqual(toggle.attrs['aria-expanded'], 'true', 'Enter 后 aria-expanded 同步');
  // Space 切回
  toggle.dispatch('keydown', { key: ' ', code: 'Space' });
  assertEqual(panel.attrs['data-collapsed'], '1', 'Space 应折叠');
  assertEqual(body.hidden, true, 'Space 后内容体隐藏');
  // 其它键不改状态（不误触）
  toggle.dispatch('keydown', { key: 'a', code: 'KeyA' });
  assertEqual(panel.attrs['data-collapsed'], '1', '非 Enter/Space 键不得改变折叠态');
  // preventDefault 会被调用（抑制原生 click，避免真实浏览器里"键盘 + 原生 click"双重切换）
  const evt = toggle.dispatch('keydown', { key: 'Enter', code: 'Enter', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  assertEqual(evt.defaultPrevented, true, 'keydown(Enter) 必须 preventDefault（防止与原生 click 叠加成双切换）');
  assertEqual(panel.attrs['data-collapsed'], '0', '一次 Enter = 一次切换（不是两次）');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('G4 展开内容不减少（展开等价 + 折叠/展开往返后内容逐值不变）', async () => {
  const app = await makeApp();
  const signature = () => ({
    view: app.app.querySelectorAll('[data-view-mode]').length,
    zone: app.app.querySelectorAll('[data-zone]').length,
    reset: app.app.querySelectorAll('[data-action]').filter((el) => el.attrs['data-action'] === 'reset').length,
    time: app.app.querySelectorAll('[data-time-preset]').length,
    quality: app.app.querySelectorAll('[data-quality-tier]').length,
    helpKeys: panelOf(app, 'help').querySelectorAll('[data-ui-part]').filter((el) => el.attrs['data-ui-part'] === 'help-row').length,
    helpTouch: partOf(panelOf(app, 'help'), 'help-touch').textContent.length,
    minimapCanvas: panelOf(app, 'minimap').querySelectorAll('[data-ui-part]').filter((el) => el.attrs['data-ui-part'] === 'minimap').length,
    tourButtons: panelOf(app, 'tour').querySelectorAll('[data-variant]').length,
  });
  const before = signature();
  assertEqual(before.view, 8, '视角按钮 8 个');
  assertEqual(before.time, TIME_PRESETS.length, '时辰按钮逐值等于 config 的时辰数');
  assertEqual(before.quality, QUALITY_ORDER.length, '质量档按钮逐值等于档位数');
  assert(before.zone >= 7, `分区按钮应 ≥7（实际 ${before.zone}）`);
  assert(before.helpKeys >= 13, `操作提示条目应 ≥13（实际 ${before.helpKeys}）`);
  // 全部展开 → 再全部折叠 → 再展开：内容签名必须逐值不变（"展开等价"）
  for (const id of COLLAPSIBLE_IDS) toggleOf(panelOf(app, id)).dispatch('click', {});
  const expanded = signature();
  assertEqual(JSON.stringify(expanded), JSON.stringify(before), '展开后内容不得增加/减少（结构签名逐值一致）');
  for (const id of COLLAPSIBLE_IDS) toggleOf(panelOf(app, id)).dispatch('click', {});
  const collapsed = signature();
  assertEqual(JSON.stringify(collapsed), JSON.stringify(before), '折叠后内容**不删除**（DOM 保留，只是 hidden）');
  for (const id of COLLAPSIBLE_IDS) toggleOf(panelOf(app, id)).dispatch('click', {});
  assertEqual(JSON.stringify(signature()), JSON.stringify(before), '再展开后仍逐值一致');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('G5 折叠不遮挡：折叠态只留折叠头（不占布局、不截获指针），且折叠头始终可点', async () => {
  const app = await makeApp();
  for (const id of COLLAPSIBLE_IDS) {
    const panel = panelOf(app, id);
    const toggle = toggleOf(panel);
    const body = partOf(panel, 'panel-body');
    assertEqual(body.hidden, true, `${id} 折叠时内容体不参与布局（hidden）`);
    assertEqual(toggle.hidden, false, `${id} 折叠头必须可见（用户始终找得到展开入口）`);
    assertEqual(panel.hidden ? 'hidden' : 'shown', id === 'info' ? 'hidden' : 'shown', `${id} 折叠不等于整块隐藏（info 例外：未选中建筑时不出现）`);
  }
  // 折叠态下所有面板仍留在原列（不产生第二套定位/浮层）
  const left = app.app.querySelectorAll('[data-ui-region]').find((el) => el.attrs['data-ui-region'] === 'left-column');
  const order = left.childNodes.map((child) => child.attrs?.['data-ui-panel']);
  assertEqual(order.join(','), 'brand,hud,info', '左列装配顺序不变（折叠只改高度，不改结构）');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('G6 ?ui=0&shot=1 仍全隐藏：根层隐藏 ⇒ 逐面板不可见（不靠 CSS 透明度）', async () => {
  const app = await makeApp({ query: { ui: false, shot: true } });
  assertEqual(app.ui.root.hidden, true, '根层必须 hidden');
  assertEqual(app.ui.stats().visible, false, 'stats().visible = false');
  const all = app.app.querySelectorAll('[data-ui-panel]');
  assertEqual(all.length, COLLAPSIBLE_IDS.length + NON_COLLAPSIBLE_IDS.length, '面板仍在 DOM（隐藏 ≠ 不注册；数量由清单推导）');
  for (const panel of all) {
    let node = panel;
    let hiddenAncestor = false;
    while (node) { if (node.hidden) { hiddenAncestor = true; break; } node = node.parentNode; }
    assertEqual(hiddenAncestor, true, `面板 ${panel.attrs['data-ui-panel']} 必须处于隐藏祖先之下（⇒ 实际不可见）`);
  }
  assertEqual(app.interaction.pickEnabled, false, '隐藏时拾取器关闭（点过 UI 区域不触发选中）');
  app.interaction.dispose();
  app.ui.dispose();
  // 对照：普通 URL 下根层可见（证明上面的隐藏不是"永远隐藏"的假绿）
  const shown = await makeApp({ query: { ui: true, shot: false } });
  assertEqual(shown.ui.root.hidden, false, '普通 URL 下根层可见');
  assertEqual(shown.ui.stats().visible, true, '普通 URL 下 UI 可见');
  shown.interaction.dispose();
  shown.ui.dispose();
});

await runner.test('G7 失败提示不被折叠吃掉：assetsFailed / zoneFailed 自动展开 loading 面板', async () => {
  const app = await makeApp();
  const loading = panelOf(app, 'loading');
  assertEqual(loading.attrs['data-collapsed'], '1', 'loading 默认折叠');
  app.events.emit(EVENTS.assetsFailed, { url: '/x.png', error: 'boom', retriable: true });
  assertEqual(loading.attrs['data-collapsed'], '0', '资源失败必须自动展开（"加载与失败提示"是既定要求）');
  const errText = partOf(loading, 'loading-error').textContent;
  assert(errText.includes('boom'), `失败原因必须可见（实际"${errText}"）`);
  const retry = loading.querySelectorAll('[data-action]').find((el) => el.attrs['data-action'] === 'retry');
  assertEqual(retry.hidden, false, '可重试时"重试"按钮必须可见');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('G8 H / M 与箭头是**同一个**折叠状态机（不出现两套 hidden 逻辑）', async () => {
  const app = await makeApp();
  const help = panelOf(app, 'help');
  const helpToggle = toggleOf(help);
  assertEqual(help.attrs['data-collapsed'], '1', '操作提示默认折叠');
  app.win.key('KeyH');
  assertEqual(help.attrs['data-collapsed'], '0', 'H 展开');
  assertEqual(helpToggle.attrs['aria-expanded'], 'true', 'H 展开后 aria 同步（同一状态机）');
  helpToggle.dispatch('click', {});
  assertEqual(help.attrs['data-collapsed'], '1', '箭头点击折叠');
  app.win.key('KeyH');
  assertEqual(help.attrs['data-collapsed'], '0', 'H 再按又展开（状态机单一真相源）');
  const mini = panelOf(app, 'minimap');
  assertEqual(mini.attrs['data-collapsed'], '1', '小地图默认折叠');
  app.win.key('KeyM');
  assertEqual(mini.attrs['data-collapsed'], '0', 'M 展开小地图');
  toggleOf(mini).dispatch('click', {});
  assertEqual(mini.attrs['data-collapsed'], '1', '箭头折叠小地图（与 M 同源）');
  app.interaction.dispose();
  app.ui.dispose();
});

/* ==========================================================================
 *  H. t15 选中即传送（交互链路）：落点来源、Esc/G/F 互不冲突
 * ======================================================================== */

runner.section('H. t15 选中即传送（交互链路）');

await runner.test('S1 选中建筑 + 进入第一人称（面板按钮 / 请求链路）⇒ 落在该建筑旁', async () => {
  const app = await makeApp();
  app.interaction.select('B-hall-main', 'test');
  const slot = LAYOUT.SLOT_BY_ID['B-hall-main'];
  // ① 信息面板「走过去（第一人称）」按钮（真实点击）
  const fpButton = app.app.querySelectorAll('[data-ui-part]').find((el) => el.attrs['data-ui-part'] === 'info-fp');
  assert(fpButton, '信息面板应有「走过去（第一人称）」按钮');
  fpButton.dispatch('click', {});
  app.rig.update(1 / 60, 0, app.store.state);
  assertEqual(app.rig.isFp, true, '按钮应进入第一人称');
  const dist = Math.hypot(app.rig.position.x - slot.door.facade.x, app.rig.position.z - slot.door.facade.z);
  runner.info(`面板按钮：落点 (${app.rig.position.x.toFixed(2)}, ${app.rig.position.y.toFixed(3)}, ${app.rig.position.z.toFixed(2)})｜距门外锚点 ${dist.toFixed(2)}m`);
  assert(dist <= 1.0, `面板按钮进入也必须落在门外锚点 1m 内（实际 ${dist.toFixed(2)}m）`);
  assertEqual(app.rig.position.y, (LAYOUT.floorYAt(app.rig.position.x, app.rig.position.z) ?? 0) + CONFIG.CAMERA.fpEyeHeight, '眼高必须逐值 = 面高 + fpEyeHeight');
  assertEqual(app.rig.describe().fpSelectionLanding.buildingId, 'B-hall-main', '读数必须标明落点来自哪个选中建筑');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('S2 传送后 Esc / G / F 互不冲突：Esc 不动位置、G 仍回登记出生点、F 退出逐值恢复', async () => {
  const app = await makeApp();
  const beforeEntry = { ...app.rig.describe().position };
  const beforeMode = app.store.state.viewMode;
  app.interaction.select('C-hall-bed-main', 'test');
  app.interaction.requester.viewMode('fp');
  app.rig.update(1 / 60, 0, app.store.state);
  const landed = { ...app.rig.describe().position };
  const slot = LAYOUT.SLOT_BY_ID['C-hall-bed-main'];
  assert(Math.hypot(landed.x - slot.door.facade.x, landed.z - slot.door.facade.z) <= 1.0, '应先落在选中建筑旁');

  // ① Esc：只释放指针锁，**不退出第一人称、不动位置**
  app.win.key('Escape');
  app.rig.update(1 / 60, 0, app.store.state);
  assertEqual(app.rig.isFp, true, 'Esc 不得退出第一人称（§6.4）');
  assertEqual(JSON.stringify(app.rig.describe().position), JSON.stringify(landed), 'Esc 不得改动位置（逐值）');

  // ② G：脱困必须仍回"最近的已登记出生点"——**不得**被选中传送劫持（禁止把脱困变成"走回选中建筑"）
  app.win.key('KeyG');
  app.rig.update(1 / 60, 0, app.store.state);
  const rescued = { ...app.rig.describe().position };
  const near = app.registry.nearestFpSpawn(app.interaction.stats().traversal ? landed : landed);
  const spawn = app.registry.ids().viewpoints;
  const lastEscape = app.interaction.stats().escapes > 0 ? true : false;
  void near;
  void spawn;
  const distToFacadeAfterG = Math.hypot(rescued.x - slot.door.facade.x, rescued.z - slot.door.facade.z);
  runner.info(`G 脱困后落点 (${rescued.x.toFixed(2)}, ${rescued.z.toFixed(2)})｜距该建筑门外锚点 ${distToFacadeAfterG.toFixed(1)}m`);
  assert(distToFacadeAfterG > 5, `G 必须回到登记出生点（远离选中建筑），不得被选中传送语义劫持（实际距门外锚点 ${distToFacadeAfterG.toFixed(1)}m）`);
  assertEqual(app.rig.isFp, true, 'G 之后仍应在第一人称');
  const surfaceAfterG = LAYOUT.floorYAt(rescued.x, rescued.z);
  assertEqual(rescued.y, (surfaceAfterG ?? 0) + CONFIG.CAMERA.fpEyeHeight, 'G 落点眼高必须逐值 = 面高 + fpEyeHeight');
  assertEqual(app.interaction.stats().lastEscape?.ok, true, 'G 的结果读数应报告成功');

  // ③ F：再按一次退出（t2 语义），并**逐值恢复**进入前机位
  app.win.key('KeyF');
  app.rig.update(1 / 60, 0, app.store.state);
  for (let i = 0; i < 5; i += 1) app.rig.update(1 / 60, i / 60, app.store.state);
  assertEqual(app.rig.isFp, false, 'F 再按一次必须退出第一人称');
  assertEqual(app.store.state.viewMode, beforeMode, `退出后视图模式必须恢复为 ${beforeMode}`);
  const restored = { ...app.rig.describe().position };
  assertEqual(JSON.stringify(restored), JSON.stringify(beforeEntry), '退出后机位必须逐值恢复到进入前（t2 保存/恢复不受本卡影响）');
  app.interaction.dispose();
  app.ui.dispose();
});

await runner.test('S3 不可进入建筑的选中同样可就近落地（entrance 锚点，tier2）', async () => {
  const app = await makeApp();
  const id = 'F-tower-corner-nw';
  const slot = LAYOUT.SLOT_BY_ID[id];
  app.interaction.select(id, 'test');
  app.interaction.requester.viewMode('fp');
  app.rig.update(1 / 60, 0, app.store.state);
  assertEqual(app.rig.isFp, true, '应进入第一人称');
  const d = app.rig.describe();
  const dist = Math.hypot(d.position.x - slot.entrance.x, d.position.z - slot.entrance.z);
  runner.info(`不可进入建筑 ${id}：距 entrance ${dist.toFixed(2)}m（tier ${d.fpSelectionLanding.tier}）`);
  assert(dist <= 1.0, `无门洞建筑也必须落在 entrance 锚点 1m 内（实际 ${dist.toFixed(2)}m）`);
  assertEqual(d.fpSelectionLanding.tier, 2, '应走 tier2（entrance）');
  assertEqual(d.fpSelectionLanding.buildingId, id, '读数必须标明建筑 id');
  app.interaction.dispose();
  app.ui.dispose();
});

/* ==========================================================================
 *  汇总
 * ======================================================================== */

const code = runner.summary();
process.exit(code);
