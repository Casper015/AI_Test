/**
 * G 区交互控制器（装配点）：把键盘 / 指针 / UI 三类输入统一成 §7.2 的请求事件，
 * 并驱动选中高亮、中轴导览、第一人称辅助与碰撞解算。
 *
 * 只消费 core 的公开接口（`events` / `store` / `registry` / `rig` / `scene` / `renderSystem`），
 * **不新建** 相机、状态、渲染循环或事件总线：
 *   - 相机：唯一装置 `rig`；本模块只调用 `rig.setCollisionSolver / setAxisIndex / applyInput`；
 *   - 状态：唯一仓库 `store`；本模块只发请求事件，选中/悬停/导览全部由 core 控制器 patch；
 *   - 循环：不自建动画循环（不调用浏览器帧调度 API、不用定时器），`update(dt)` 由唯一动画循环驱动
 *     （见 `attachRenderLoop`：包装 `renderSystem.recordFrame`，搭上 main.js 已有的那个循环）。
 *
 * 键盘所有权：core 的 `rig.bindInput()`（1–8 / F / Esc / R）与 `main.js`（T / Y / Space）也监听 window，
 * 若两边都处理同一按键，F 会"进入立刻退出"、T/Y 会连跳两档。因此本模块在 **capture 阶段**接管自己映射的键
 * （`resolveKey().owned`）并 `stopPropagation()`，保证"同一按键只有一个处理者"；未映射的键（WASD/Shift/方向键、
 * 数字 9/0 等）不拦截，继续由 core 处理。
 */

import { CONFIG, EVENTS, UI } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
import { createRequester, VIEW_MODE_BY_INDEX } from './requests.js';
import { resolveKey, MOVEMENT_CODES } from './keymap.js';
import { createWalkSolver } from './walk-solver.js';
import { createTraversalAudit } from './traversal.js';
import { buildCatalog } from './catalog.js';
import { createPicker } from './pick.js';
import { createHighlighter } from './highlight.js';
import { createFpController } from './fp.js';
import { createTourController } from './tour.js';

/**
 * 把 `renderSystem.recordFrame(frameMs)` 包一层，让 UI/交互搭上**同一个**动画循环
 * （不新增 rAF；t14 也可以改为每帧直接调用 `update(dt)`，两条路径互斥且幂等）。
 * @returns {() => void} 还原函数
 */
export function attachRenderLoop(renderSystem, tick) {
  if (!renderSystem || typeof renderSystem.recordFrame !== 'function') return () => {};
  const original = renderSystem.recordFrame;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  let lastAt = -Infinity;
  renderSystem.recordFrame = function wrappedRecordFrame(frameMs, ...rest) {
    const result = original.call(this, frameMs, ...rest);
    const at = now();
    if (at - lastAt >= 2) {
      lastAt = at;
      tick(Math.max(1 / 240, Math.min(0.25, (frameMs ?? 16.7) / 1000)));
    }
    return result;
  };
  return () => {
    renderSystem.recordFrame = original;
  };
}

/**
 * 同一按键被处理两次的风险与处置（实测教训，2026-09-26 真实浏览器验证）：
 *
 * core 的 `rig.bindInput()` 与 main.js 的快捷键都注册在 `window` 上，且都早于 G。
 *   - **真实用户按键**：事件 target 是 body/document → window 的 **capture** 阶段先跑 G 的监听器
 *     （`stopPropagation()` 之后 core 的 bubble 监听器不会触发）→ 单一处理者；
 *   - **合成事件 / CDP 直接 dispatch 到 window**：target 就是 window，"at target" 阶段按**注册顺序**
 *     调用监听器 → core 先跑并已发出请求，`stopImmediatePropagation()` 拦不住它。
 *
 * 因此 G 在这种情况下进入**协作模式**：不再重复发同一个请求（否则 F 会"进入立刻退出"、
 * T/Y 会连跳两档），只执行 core 不负责的部分（Esc 的指针锁语义、H/M 面板开关）。
 *
 * 判定方式：事件 target === 键盘目标（window）**且** 该类请求的事件计数与本控制器上次处理完键盘时
 * 记录的计数不同（说明 core/main.js 在本轮已经发过同类请求）。该判定只作用于合成事件路径；
 * 真实用户路径完全不参与（无需窗口期，避免"上一个键在 50ms 前"就漏判的实测缺陷）。
 * 误判（计数因按钮点击等变化而跳过自身请求）在这个路径下无害：core 已经发过等价请求，state 仍然正确。
 */
export const COOPERATIVE_WINDOW_MS = 50;

/** core / main.js 自己会处理的按键（协作模式下 G 不再重复发请求）。 */
export function coreOwnedKey(code) {
  return /^Digit[1-8]$/.test(code) || ['KeyF', 'KeyR', 'KeyT', 'KeyY', 'Space'].includes(code);
}

/**
 * @param {{
 *   api: object, config?: object, layout?: object, container?: object|null,
 *   window?: object|null, document?: object|null, options?: object
 * }} params
 */
export function createInteraction({
  api,
  config = CONFIG,
  layout = LAYOUT,
  container = null,
  window: win = typeof window !== 'undefined' ? window : null,
  document: doc = typeof document !== 'undefined' ? document : null,
  options = {},
} = {}) {
  if (!api || !api.events || !api.store || !api.rig) throw new Error('createInteraction 需要 window.__PALACE__ 风格的核心 API（events/store/rig）');
  const { events, store, registry, rig } = api;
  const stats = {
    keyEvents: 0,
    keyRequests: 0,
    ignoredKeys: 0,
    cooperativeSkips: 0,
    pointerEvents: 0,
    hoverPicks: 0,
    clicks: 0,
    selects: 0,
    takeovers: 0,
    hints: 0,
    ticks: 0,
    // t87：通行性守卫 / 防卡死
    escapes: 0,
    stuckEvents: 0,
    stuckSeconds: 0,
    stuckIntent: false,
    stuckMoved: 0,
    stuckIntentSource: 'internal',
    inputEvents: 0,
    traversalGuarded: false,
    traversalReadyAtTick: null,
    traversal: null,
    lastEscape: null,
  };
  const listeners = [];
  const log = [];
  const logLimit = options.logLimit ?? 200;

  function record(entry) {
    log.push({ at: Date.now(), ...entry });
    if (log.length > logLimit) log.shift();
  }

  /* ------------------------------ 请求网关 ------------------------------ */
  const gateway = createRequester({ events, source: options.source ?? 'ui' });
  const requester = gateway.requester;

  /* ------------------------------ 目录 / 碰撞 / 高亮 ------------------------------ */
  const catalog = buildCatalog({ registry, layout, config });
  const solver = createWalkSolver({ config, layout, registry });
  rig.setCollisionSolver(solver);

  /* ------------------------------------------------------------------ t87 通行性守卫与防卡死 */
  /**
   * 通行性审计（四类糟糕阻挡 + 单向陷阱守卫 + 最近安全点）。
   * 采样是唯一重活：生产环境**分帧预热**（`warmupRowsPerTick` 行/帧），预热完成后才装守卫 ——
   * 未就绪期间守卫一律放行（绝不误伤），且脱困兜底始终可用。测试可用 `warmupAll()` 一次算完。
   */
  const traversal = createTraversalAudit({
    solver,
    layout,
    config,
    cellSize: options.traversalCellSize ?? 3,
    start: options.traversalStart ?? null,
  });
  const STUCK_SECONDS = options.stuckSeconds ?? 1.5;
  const warmupRowsPerTick = options.traversalWarmupRows ?? 6;
  let stuckFlag = false;
  let traversalProblems = null;
  let lastEscapeProbe = null;
  /**
   * t104（t99-F1）：卡死检测的**真实路径输入**。
   *   · `movementKeys`：被动观察玩家按下的移动键（`MOVEMENT_CODES`，与 core 消费同一事件流，**不拦不吞**：
   *     不加 capture、不 stopPropagation、不 preventDefault）⇒ 意图来源；
   *   · `lastStuckPos`：上一帧 `rig.position` ⇒ 位移来源。
   * 之所以不直接用 `rig.describe()`：它目前不暴露 `moving`/按键（最小改法 = core 在 describe() 里加 `moving`，
   * 属 src/core/** 范围，本卡按纪律未改，已在回执量化交回）。
   */
  const movementKeys = new Set();
  let lastStuckPos = null;

  const highlightParent = options.highlightParent ?? api.sceneRoot ?? api.scene ?? null;
  const highlighter = highlightParent ? createHighlighter({ config, parent: highlightParent }) : null;
  const picker = createPicker({ catalog, rig, domElement: container, config });

  /* ------------------------------ 提示（toast） ------------------------------ */
  const hintHandlers = new Set();
  let lastHint = null;
  function pushHint(hint, meta = {}) {
    if (!hint) return null;
    stats.hints += 1;
    // hint 自身的字段优先（例如 narration 的 kind 不被 meta 的 'tour' 覆盖）
    lastHint = { ...meta, ...hint, at: Date.now() };
    for (const handler of hintHandlers) {
      try {
        handler(lastHint);
      } catch (error) {
        console.error('[interaction] 提示处理器抛错：', error);
      }
    }
    record({ kind: 'hint', title: lastHint.title });
    return lastHint;
  }

  function onBlockedByBuilding(payload) {
    const obstacleId = payload?.buildingId ?? null;
    const hint = catalog.hintFor(obstacleId);
    pushHint({ ...hint, obstacleId, reason: payload?.reason ?? 'collision' }, { kind: 'blocked' });
  }

  /* ------------------------------ 第一人称 / 导览 ------------------------------ */
  const fp = createFpController({
    rig,
    events,
    store,
    document: doc,
    domElement: container,
    config,
    layout,
    catalog,
    onHint: (hint) => {
      if (hint.kind === 'blocked') return; // 由 interaction:blocked-building 统一处理
      pushHint({ tone: 'info', ...hint });
    },
  });

  const tour = createTourController({
    events,
    store,
    requester,
    rig,
    layout,
    onNarration: (info) => pushHint({ tone: 'tour', kind: 'narration', title: `导览 · ${info.name}`, detail: info.narration, index: info.index, total: info.total }, { kind: 'tour' }),
    onPause: (info) => {
      if (info.reason === 'view-change' || info.reason === 'user-camera' || info.reason === 'pointer' || info.reason === 'wheel' || info.reason === 'keyboard') {
        stats.takeovers += 1;
        pushHint({ tone: 'warn', kind: 'tour-pause', title: info.title, detail: info.detail }, { kind: 'tour-pause' });
      } else {
        pushHint({ tone: 'info', kind: 'tour', title: info.title, detail: info.detail }, { kind: 'tour' });
      }
    },
  });

  /* ------------------------------ 状态订阅（唯一真相源） ------------------------------ */
  const stateHandlers = new Set();
  function boundsOf(buildingId) {
    if (!buildingId) return null;
    const item = catalog.pickables.find((p) => p.id === buildingId);
    return item?.bounds ?? null;
  }
  function derivedSnapshot() {
    const state = store.state;
    return {
      state,
      selected: catalog.info(state.selectedBuildingId),
      hovered: state.hoveredBuildingId ? catalog.info(state.hoveredBuildingId) : null,
      view: { mode: state.viewMode, modeIndex: Object.entries(VIEW_MODE_BY_INDEX).find(([, m]) => m === state.viewMode)?.[0] ?? null, isFp: rig.isFp },
      tour: tour.describe(),
      fp: { active: rig.isFp, pointerLocked: fp.isPointerLocked() },
      blocked: lastHint?.kind === 'blocked' ? lastHint : null,
    };
  }
  const unsubscribeStore = store.subscribe((payload) => {
    const changed = payload?.changed ?? {};
    if ('selectedBuildingId' in changed) {
      highlighter?.setSelected(boundsOf(store.state.selectedBuildingId));
      stats.selects += 1;
    }
    if ('hoveredBuildingId' in changed) highlighter?.setHovered(boundsOf(store.state.hoveredBuildingId));
    const snapshot = derivedSnapshot();
    for (const handler of stateHandlers) {
      try {
        handler(snapshot, payload);
      } catch (error) {
        console.error('[interaction] 状态处理器抛错：', error);
      }
    }
  });
  listeners.push(unsubscribeStore);

  // 初始高亮同步（可能已由查询参数选中）
  highlighter?.setSelected(boundsOf(store.state.selectedBuildingId));

  /* ------------------------------ 选中 / 悬停 ------------------------------ */
  function select(buildingId, source = 'interaction') {
    if (buildingId === store.state.selectedBuildingId) return buildingId;
    requester.send(EVENTS.selectionChange, { buildingId: buildingId ?? null, hovered: false });
    record({ kind: 'select', buildingId, source });
    return buildingId;
  }
  function hover(buildingId, source = 'interaction') {
    if ((buildingId ?? null) === (store.state.hoveredBuildingId ?? null)) return buildingId;
    requester.send(EVENTS.selectionChange, { buildingId: buildingId ?? null, hovered: true });
    record({ kind: 'hover', buildingId, source });
    return buildingId;
  }

  /* ------------------------------ 键盘层（capture，唯一处理者） ------------------------------ */
  let lastHoverAt = 0;
  const hoverIntervalMs = Math.max(0, options.hoverIntervalMs ?? UI.spacing.sm);
  const localCommands = new Set();
  const commandHandlers = new Set();
  /** t59：进入内景前记录"返回点"（模式 + 区/机位/近景目标 + 机位快照），F 再按即恢复。 */
  let interiorReturn = null;
  /** t59：最近一次内景操作结果（测试/诊断用，真实结果而非计数器）。 */
  let lastInterior = null;
  /** 协作模式判定用的请求计数快照（每轮键盘处理结束更新）；`keyCountersAt` 仅供诊断。 */
  const keyCounters = {};
  let keyCountersAt = -Infinity;

  function syncKeyCounters() {
    for (const type of Object.values(EVENTS)) keyCounters[type] = events.count(type);
    keyCountersAt = Date.now();
  }

  function atKeyboardTarget(event) {
    return !!win && !!event && event.target === win;
  }

  /** core 是否在本轮派发里已经发过同类请求（协作模式判定，见文件头注释）。 */
  function coreAlreadyRequested(type) {
    const last = keyCounters[type];
    if (last === undefined) return false;
    return events.count(type) !== last;
  }

  syncKeyCounters();

  function notifyCommand(name, detail = {}) {
    for (const handler of commandHandlers) {
      try {
        handler(name, detail);
      } catch (error) {
        console.error('[interaction] 命令处理器抛错：', error);
      }
    }
  }

  function keyboardContext() {
    const state = store.state;
    const selectedId = state.selectedBuildingId;
    return {
      viewMode: state.viewMode,
      quality: state.quality,
      timePreset: state.timePreset,
      fpActive: rig.isFp,
      tourActive: state.tourState.active,
      tourPaused: state.tourState.paused,
      hasSelection: !!selectedId,
      /** F 能否进入内景由目录数据（visitable）决定，不在这里猜建筑 id。 */
      selectedVisitable: !!selectedId && catalog.info(selectedId)?.visitable === true,
      pointerLocked: fp.isPointerLocked(),
    };
  }

  /**
   * F 的内景分支落地（键盘与面板按钮共用同一实现）：
   *   进入 = 由 `catalog.interiorViewpointFor()` 从区/布局数据推导内景机位 → 写 `store.view.interiorViewpointId`
   *   + 请求 interior 模式；不可进入 / 无机位 = 只提示，**不改视角**；已在内景 = 返回进入前的模式与登记机位。
   */
  function enterInterior(buildingId = store.state.selectedBuildingId, source = 'interior-api') {
    const info = buildingId ? catalog.info(buildingId) : null;
    if (!info) {
      lastInterior = { ok: false, reason: 'no-selection', buildingId: buildingId ?? null };
      pushHint({ tone: 'warn', kind: 'interior', title: '未选中建筑', detail: '先点击画面里的建筑，再按 F 进入内景。' });
      return false;
    }
    if (!info.visitable) {
      lastInterior = { ok: false, reason: 'not-visitable', buildingId: info.id };
      pushHint({ tone: 'warn', kind: 'interior', title: '此建筑不可进入内景', detail: `${info.name}：${info.info || '未登记内景'}。可点「近景」观看外观。` });
      return false;
    }
    const mapping = catalog.interiorViewpointFor(info.id);
    if (!mapping) {
      lastInterior = { ok: false, reason: 'no-interior-viewpoint', buildingId: info.id };
      pushHint({ tone: 'warn', kind: 'interior', title: '该建筑的内景机位未登记', detail: `${info.name}：layout/区域尚未登记 interior 机位，无法进入内景。` });
      return false;
    }
    if (store.state.viewMode !== 'interior') {
      interiorReturn = {
        mode: store.state.viewMode,
        area: store.view.area ?? null,
        viewpointId: store.view.viewpointId ?? null,
        focusBuildingId: store.view.focusBuildingId ?? null,
        axisIndex: store.view.axisIndex ?? 1,
        describe: rig.describe(),
      };
    }
    store.patch({}, { source, view: { interiorViewpointId: mapping.viewpointId, area: mapping.area } });
    requester.send(EVENTS.requestViewMode, { mode: 'interior' });
    lastInterior = { ok: true, buildingId: info.id, ...mapping };
    pushHint({
      tone: 'info',
      kind: 'interior',
      title: `进入内景 · ${info.name}`,
      detail: `机位 ${mapping.viewpointId}（由 ${mapping.area} 区内景地面 ${mapping.surfaceId} 推导）· 再按 F 返回`,
    });
    record({ kind: 'interior', action: 'enter', buildingId: info.id, viewpointId: mapping.viewpointId });
    return true;
  }

  /**
   * t87：一键脱离卡死 —— **确定性**回到最近的安全可行走点。
   *   · 只用 §7.2 的请求事件（先退出第一人称、再重新进入）：core 会用 `nearestFpSpawn(position)`
   *     把玩家放到**最近的已登记出生点**——出生点在 `registry` 里经契约校验（可行走面 + 眼高），
   *     因此"不穿墙、不落水面/障碍内/包络外"由数据契约保证，本函数再逐项复核；
   *   · **不做随机传送**、不放宽任何阻挡；返回落点与判定结果供 HUD/测试核对。
   */
  function escapeToSafePoint(source = 'escape-api') {
    stats.escapes += 1;
    if (rig.isFp !== true) {
      pushHint({ tone: 'warn', kind: 'escape', title: '当前不在第一人称', detail: '脱困只在第一人称走查中生效：按 F 进入第一人称后再试。' }, { kind: 'escape' });
      return { ok: false, reason: 'not-fp' };
    }
    const before = { ...rig.describe().position };
    // 退出 → 再进入：两步都走同一条请求事件，core 负责选最近出生点（本模块不碰相机）
    requester.send(EVENTS.requestViewMode, { mode: 'fp' });
    requester.send(EVENTS.requestViewMode, { mode: 'fp' });
    const after = { ...rig.describe().position };
    lastEscapeProbe = { x: after.x, z: after.z };
    const probe = solver.probe(after.x, after.z);
    const region = traversal.ready ? traversal.regionAt(after.x, after.z) : 'unknown';
    const moved = +Math.hypot(after.x - before.x, after.z - before.z).toFixed(2);
    const feet = +(after.y - config.CAMERA.fpEyeHeight).toFixed(3);
    const inBounds =
      after.x >= layout.TERRAIN_EXTENT.minX &&
      after.x <= layout.TERRAIN_EXTENT.maxX &&
      after.z >= layout.TERRAIN_EXTENT.minZ &&
      after.z <= layout.TERRAIN_EXTENT.maxZ;
    const safe = probe.ok === true && inBounds && (region === 'main' || region === 'unknown');
    solver.resetStuckTimer();
    stuckFlag = false;
    stats.lastEscape = { moved, region, safe, reasons: probe.reasons, feetY: feet, at: { x: after.x, z: after.z } };
    pushHint(
      safe
        ? {
            tone: 'info',
            kind: 'escape',
            title: '已脱离 · 回到最近安全点',
            detail: `落点 (${after.x.toFixed(0)}, ${after.z.toFixed(0)})｜可站立 ✓｜区域 ${region}｜位移 ${moved}m`,
          }
        : {
            tone: 'warn',
            kind: 'escape',
            title: '已尝试脱困，但落点未通过校验',
            detail: `落点 (${after.x.toFixed(0)}, ${after.z.toFixed(0)})｜可站立 ${probe.ok}｜原因 ${probe.reasons.join('/') || '—'}`, 
          },
      { kind: 'escape' },
    );
    return { ok: true, safe, moved, region, reasons: probe.reasons, before, after, feetY: feet, inBounds, source };
  }

  function exitInterior(source = 'interior-api') {
    if (store.state.viewMode !== 'interior') return false;
    const back = interiorReturn?.mode ?? 'oblique';
    if (interiorReturn) {
      store.patch(
        {},
        {
          source,
          view: {
            area: interiorReturn.area,
            viewpointId: interiorReturn.viewpointId,
            focusBuildingId: interiorReturn.focusBuildingId,
            axisIndex: interiorReturn.axisIndex,
          },
        },
      );
    }
    requester.send(EVENTS.requestViewMode, { mode: back });
    lastInterior = { ok: true, reason: 'exit', restoredMode: back };
    pushHint({ tone: 'info', kind: 'interior', title: `已返回 · ${back}`, detail: '回到进入内景前的视角模式与登记机位。' });
    record({ kind: 'interior', action: 'exit', restoredMode: back });
    interiorReturn = null;
    return true;
  }

  /** t104：被动记录移动键（意图来源；不改变 core 的输入所有权）。 */
  function onMovementKeyDown(event) {
    const code = event?.code ?? '';
    if (!MOVEMENT_CODES.includes(code)) return;
    movementKeys.add(code);
    stats.inputEvents = (stats.inputEvents ?? 0) + 1;
  }

  function onMovementKeyUp(event) {
    const code = event?.code ?? '';
    if (!code) return;
    movementKeys.delete(code);
  }

  /** 失焦时清空（否则"按键卡住"会造成恒 intent ⇒ HUD 恒显示）。 */
  function onWindowBlur() {
    movementKeys.clear();
  }

  function handleResolvedKey(resolved, event) {
    stats.keyRequests += 1;
    if (resolved.local) {
      if (resolved.local === 'exitPointerLock') {
        fp.exitPointerLock();
      } else if (resolved.local === 'notifyTourPaused') {
        pushHint({ tone: 'warn', kind: 'tour-pause', title: '导览已暂停', detail: '按 Space 或「继续」恢复导览。' }, { kind: 'tour-pause' });
      } else if (resolved.local === 'escapeStuck') {
        escapeToSafePoint('key:G');
      } else if (resolved.local === 'enterInterior' || resolved.local === 'notifyInteriorUnavailable') {
        // 后者即"不可进入"分支：enterInterior 内部只提示、不改视角
        enterInterior(store.state.selectedBuildingId, 'keyboard:F');
      } else if (resolved.local === 'exitInterior') {
        exitInterior('keyboard:F');
      } else {
        localCommands.add(resolved.local);
        notifyCommand(resolved.local, resolved);
      }
    }
    if (resolved.request) {
      if (resolved.kind === 'view' || resolved.kind === 'reset') {
        // 手动切视角 = 接管相机 → 暂停导览（不争夺相机）
        tour.notifyTakeover('keyboard');
      }
      if (resolved.kind === 'tour' && resolved.request.payload.action === 'start') {
        // 起步导览必须同时切到中轴模式：走 tour.start（内部仍是同一条 tour:request + view:request-mode）
        tour.start(resolved.request.payload.index ?? 0);
      } else {
        requester.send(resolved.request.type, resolved.request.payload);
      }
      record({ kind: 'key', code: resolved.code, action: resolved.kind, type: resolved.request.type });
    } else if (!resolved.local) {
      record({ kind: 'key', code: resolved.code, action: resolved.kind });
    }
    if (event && options.debugKeys) console.info('[interaction] key', resolved.code, resolved.kind);
  }

  function onKeyDown(event) {
    stats.keyEvents += 1;
    const code = event?.code ?? '';
    if (MOVEMENT_CODES.includes(code) && !rig.isFp) return; // 非第一人称时移动键不拦截（core 内部自会忽略）
    if (code === 'Escape') {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      handleEscape();
      return;
    }
    const resolved = resolveKey(code, keyboardContext());
    if (!resolved) {
      stats.ignoredKeys += 1;
      return;
    }
    if (resolved.owned) {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
    }
    // 协作模式：事件 target 就是键盘目标（合成事件）时 core 的监听器已抢先处理过同一个键
    if (resolved.request && coreOwnedKey(code) && atKeyboardTarget(event) && coreAlreadyRequested(resolved.request.type)) {
      stats.cooperativeSkips += 1;
      if (resolved.local) handleResolvedKey({ ...resolved, request: null }, event);
      else record({ kind: 'key', code, action: `${resolved.kind}:core-owned`, type: resolved.request.type });
      syncKeyCounters();
      return;
    }
    handleResolvedKey(resolved, event);
    syncKeyCounters();
  }

  /**
   * Esc 的三条语义（§6.4）：
   *   A 仍在第一人称 → 只释放指针锁（**不退出**）；
   *   B 合成事件以 window 为 target 时 core 的监听器抢先跑过一次，把第一人称切走了
   *     （`fp.recentExit(8)` 可判定，用同一窗口也防误判）→ 立刻回到第一人称，仍不退出；
   *   C 否则按优先级：暂停/退出导览 > 取消选中。
   */
  function handleEscape() {
    if (rig.isFp) {
      fp.exitPointerLock();
      return;
    }
    if (fp.recentExit(COOPERATIVE_WINDOW_MS)) {
      fp.exitPointerLock();
      requester.send(EVENTS.requestViewMode, { mode: 'fp' });
      return;
    }
    const resolved = resolveKey('Escape', keyboardContext());
    if (resolved?.request) {
      if (resolved.local === 'notifyTourPaused') {
        pushHint({ tone: 'warn', kind: 'tour-pause', title: '导览已暂停', detail: '按 Space 或「继续」恢复导览。' }, { kind: 'tour-pause' });
      }
      requester.send(resolved.request.type, resolved.request.payload);
      record({ kind: 'key', code: 'Escape', action: resolved.kind, type: resolved.request.type });
    }
  }

  /* ------------------------------ 指针层 ------------------------------ */
  const drag = { active: false, x: 0, y: 0, moved: 0 };

  function onPointerDown(event) {
    stats.pointerEvents += 1;
    drag.active = true;
    drag.x = event.clientX ?? 0;
    drag.y = event.clientY ?? 0;
    drag.moved = 0;
    if (store.state.tourState.active && !store.state.tourState.paused) tour.notifyTakeover('pointer');
  }

  function onPointerMove(event) {
    stats.pointerEvents += 1;
    const x = event.clientX ?? 0;
    const y = event.clientY ?? 0;
    if (drag.active) drag.moved = Math.max(drag.moved, Math.hypot(x - drag.x, y - drag.y));
    if (!picker.enabled) return;
    const now = Date.now();
    if (now - lastHoverAt < hoverIntervalMs) return;
    lastHoverAt = now;
    const hit = picker.hover(x, y);
    stats.hoverPicks += 1;
    hover(hit?.id ?? null, 'pointer');
  }

  function onPointerUp(event) {
    stats.pointerEvents += 1;
    const wasActive = drag.active;
    drag.active = false;
    if (!wasActive) return;
    const tolerance = config.INTERACTION.selection.hoverRadiusPx;
    if (drag.moved > tolerance) return; // 拖动 = 转视角，不触发选中
    stats.clicks += 1;
    const hit = picker.pick(event.clientX ?? 0, event.clientY ?? 0);
    select(hit?.id ?? null, 'pointer');
  }

  function onPointerLeave() {
    if (drag.active) return;
    hover(null, 'pointer');
  }

  function onWheel() {
    if (store.state.tourState.active && !store.state.tourState.paused) tour.notifyTakeover('wheel');
  }

  /* ------------------------------ 每帧驱动（搭唯一动画循环） ------------------------------ */
  let manualDrive = false;
  let lastTickAt = -Infinity;
  function tick(dt = 1 / 60, elapsed = 0) {
    if (dt < 0) return false;
    lastTickAt = Date.now();
    stats.ticks += 1;
    // t87：分帧预热通行性审计 → 完成后装上"单向陷阱守卫"（只加约束：宁可禁入，不许进得去出不来）
    if (!traversal.ready) {
      const warm = traversal.warmupStep({ rows: warmupRowsPerTick });
      if (warm.done) {
        traversal.ensureFields();
        solver.setTraversalGuard(traversal.guardStep);
        stats.traversalGuarded = true;
        stats.traversalReadyAtTick = stats.ticks;
        stats.traversal = traversal.stats();
      }
    }
    // t87/t104：防卡死 —— 意图取"真实按下的移动键"、位移取"rig.position 逐帧增量"（生产路径输入）
    if (rig.isFp) {
      const pos = rig.position;
      const moved = lastStuckPos ? Math.hypot(pos.x - lastStuckPos.x, pos.z - lastStuckPos.z) : 0;
      lastStuckPos = { x: pos.x, z: pos.z };
      const intent = movementKeys.size > 0;
      const stuck = solver.noteStuckTick(dt, { intent, moved, threshold: STUCK_SECONDS });
      stats.stuckIntent = stuck.intent;
      stats.stuckMoved = stuck.moved;
      stats.stuckIntentSource = stuck.source;
      stats.stuckSeconds = stuck.seconds;
      if (stuck.stuck && !stuckFlag) {
        stuckFlag = true;
        stats.stuckEvents += 1;
        pushHint(
          {
            tone: 'warn',
            kind: 'stuck',
            title: '好像卡住了',
            detail: `连续 ${STUCK_SECONDS}s 走不动：按 G 或点「回到最近安全点」脱离（确定性回到最近登记出生点，不会穿墙）。`,
          },
          { kind: 'stuck' },
        );
      } else if (!stuck.stuck) {
        stuckFlag = false;
      }
    } else {
      lastStuckPos = null;
      solver.resetStuckTimer();
      stuckFlag = false;
    }
    highlighter?.update(dt, elapsed);
    tour.update(dt);
    // 同一帧内把 UI（标签定位、小地图、提示条淡出）也推进一步：由 mountInterface 注入
    if (typeof options.onTick === 'function') {
      try {
        options.onTick(dt, elapsed);
      } catch (error) {
        console.error('[interaction] onTick 抛错：', error);
      }
    }
    return true;
  }

  /* ------------------------------ 装配 / 卸载 ------------------------------ */
  let attached = false;
  const disposers = [];

  function attach() {
    if (attached) return;
    attached = true;
    fp.attach();
    tour.attach();
    const busOffBlocked = events.on(EVENTS.blockedByBuilding, onBlockedByBuilding);
    disposers.push(busOffBlocked);
    if (win?.addEventListener) {
      win.addEventListener('keydown', onKeyDown, { capture: true });
      disposers.push(() => win.removeEventListener('keydown', onKeyDown, { capture: true }));
      // t104：被动观察移动键（不拦事件，core 仍是唯一移动处理者）
      win.addEventListener('keydown', onMovementKeyDown, { passive: true });
      win.addEventListener('keyup', onMovementKeyUp, { passive: true });
      win.addEventListener('blur', onWindowBlur, { passive: true });
      disposers.push(() => win.removeEventListener('keydown', onMovementKeyDown, { passive: true }));
      disposers.push(() => win.removeEventListener('keyup', onMovementKeyUp, { passive: true }));
      disposers.push(() => win.removeEventListener('blur', onWindowBlur, { passive: true }));
    }
    if (container?.addEventListener) {
      const opts = { passive: true };
      container.addEventListener('pointerdown', onPointerDown, opts);
      container.addEventListener('pointermove', onPointerMove, opts);
      container.addEventListener('pointerup', onPointerUp, opts);
      container.addEventListener('pointerleave', onPointerLeave, opts);
      container.addEventListener('wheel', onWheel, { passive: true });
      disposers.push(() => {
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointerleave', onPointerLeave);
        container.removeEventListener('wheel', onWheel);
      });
    }
    // 每帧驱动：包装 renderSystem.recordFrame（main.js 的唯一循环每帧调用一次），
    // 一旦外部显式调用过 update(dt)，包装层即停用，保证"每帧只被驱动一次"。
    const detachLoop = options.renderSystem !== false ? attachRenderLoop(api.renderSystem, (dt) => (manualDrive ? false : tick(dt, 0))) : () => {};
    disposers.push(detachLoop);
  }

  function detach() {
    for (const off of disposers.splice(0)) {
      try {
        off?.();
      } catch (error) {
        console.warn('[interaction] 卸载失败：', error);
      }
    }
    fp.detach();
    tour.detach();
    attached = false;
  }

  const handle = {
    api,
    config,
    layout,
    requester,
    gateway,
    catalog,
    solver,
    picker,
    highlighter,
    fp,
    tour,
    attached: () => attached,
    attach,
    detach,
    /**
     * 每帧驱动。t14 在唯一动画循环里调用本方法时，recordFrame 包装层自动停用（不会重复推进）；
     * 不调用则由包装层驱动（UI 仍会随场景刷新）。两条路径互斥，见 `manualDrive`。
     */
    update(dt = 1 / 60, elapsed = 0) {
      manualDrive = true;
      tick(dt, elapsed);
      return handle;
    },
    /** 手动驱动状态（诊断）。 */
    driveMode: () => (manualDrive ? 'manual' : 'render-loop'),
    lastTickAt: () => lastTickAt,
    /** 手动强制重算（切换 ui 可见性、resize 后）。 */
    refresh() {
      highlighter?.setSelected(boundsOf(store.state.selectedBuildingId));
      highlighter?.setHovered(boundsOf(store.state.hoveredBuildingId));
      for (const handler of stateHandlers) handler(derivedSnapshot(), { changed: {}, source: 'refresh' });
      return derivedSnapshot();
    },
    setPickEnabled(value) {
      const enabled = picker.setEnabled(value);
      if (!enabled) hover(null, 'mode');
      return enabled;
    },
    get pickEnabled() {
      return picker.enabled;
    },
    select,
    hover,
    /** t87：一键脱离卡死 —— 确定性回到最近的安全可行走点（详见函数注释）。 */
    escapeToSafePoint,
    /** 生产求解器实例（core 每帧调用的同一个；t87 起供通行性诊断/测试使用）。 */
    solver,
    /** t87：通行性/防卡死状态（HUD 与测试读取）。 */
    traversalState() {
      const empty = traversal.stats();
      return {
        ready: traversal.ready,
        guarded: solver.hasTraversalGuard(),
        cellSize: traversal.cellSize,
        sampledRows: empty.sampledRows ?? empty.rows,
        totalRows: empty.rows,
        walkable: empty.walkable ?? 0,
        main: empty.main ?? 0,
        trap: empty.trap ?? 0,
        sealed: empty.sealed ?? 0,
        refusals: solver.traversalState().refusals,
        stuckSeconds: solver.traversalState().stuckSeconds,
        stuck: stuckFlag,
        stuckThreshold: STUCK_SECONDS,
        nearestSafePoint: traversal.ready && lastEscapeProbe ? traversal.nearestSafePoint(lastEscapeProbe.x, lastEscapeProbe.z) : null,
        lastEscape: stats.lastEscape,
        // t104：卡死检测的真实路径输入（浏览器 ?stats=1 / __PALACE_UI__.stats().traversal 可核对）
        stuckIntent: stats.stuckIntent,
        stuckMoved: stats.stuckMoved,
        stuckIntentSource: stats.stuckIntentSource,
        movementKeysDown: [...movementKeys],
        solverStepAttempts: solver.traversalState().attempts,
        solvedByCore: solver.traversalState().attempts === 0,
        traversalProblems,
      };
    },
    /** t87：完整四类阻挡审计（离线/测试用；生产只在需要时调用）。 */
    auditTraversal({ paired = [] } = {}) {
      traversalProblems = traversal.audit({ paired });
      return traversalProblems;
    },
    enterInterior,
    /** t59：从内景返回进入前的模式与登记机位。 */
    exitInterior,
    /** t59：内景状态（真实结果：是否进入、推导到的机位、返回点）。 */
    interiorState: () => ({
      active: store.state.viewMode === 'interior',
      viewpointId: store.view.interiorViewpointId ?? null,
      area: store.view.area ?? null,
      returnTo: interiorReturn ? { mode: interiorReturn.mode, description: interiorReturn.describe?.mode ?? null } : null,
      last: lastInterior ? { ...lastInterior } : null,
    }),
    onHint(handler) {
      hintHandlers.add(handler);
      return () => hintHandlers.delete(handler);
    },
    onState(handler) {
      stateHandlers.add(handler);
      const dispose = () => stateHandlers.delete(handler);
      return dispose;
    },
    /** UI 面板开关等"非状态"命令（H / M 键）。 */
    onCommand(handler) {
      commandHandlers.add(handler);
      return () => commandHandlers.delete(handler);
    },
    consumeLocalCommand(name) {
      if (!localCommands.has(name)) return false;
      localCommands.delete(name);
      return true;
    },
    lastHint: () => lastHint,
    describe: derivedSnapshot,
    snapshot: () => derivedSnapshot(),
    stats() {
      return {
        ...stats,
        solver: solver.stats(),
        picker: picker.stats(),
        catalog: catalog.stats(),
        tour: tour.stats(),
        fp: fp.stats(),
        gateway: { total: gateway.stats.total, byType: { ...gateway.stats.byType } },
        attached,
      };
    },
    /** 诊断日志（有限长度环形缓冲）。 */
    log: () => [...log],
    dispose() {
      detach();
      for (const off of listeners.splice(0)) off?.();
      highlighter?.dispose();
      picker.dispose();
      solver.dispose();
      gateway.dispose();
    },
  };

  attach();
  return handle;
}

export { resolveKey, VIEW_MODE_BY_INDEX };
export default createInteraction;
