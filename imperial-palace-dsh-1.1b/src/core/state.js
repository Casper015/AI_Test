/**
 * 全局状态（唯一）与请求控制器（CONTRACTS §7.1/§7.2、计划 §6.1/§6.2）。
 *
 * 唯一真相源：
 *   `state` 只有本文件这一份；字段严格等于 `config.STATE_DEFAULTS` 的键（不多不少，测试会断言）。
 *   任何一方（UI / 键盘 / 区域 / 相机）都**不能直接改 state**，只能发请求事件；
 *   请求由本文件的控制器校验后统一 patch，并广播 `state:change`；相机与环境只对 `state:change` 反应。
 *
 * 视角相关的瞬时目标（哪个区域机位 / 哪栋建筑 / 中轴第几段）不属于 §7.1 的 state 字段，
 * 放在 `store.view`（内部视图记录），同样只由控制器写、相机读。
 *
 * 零 three / 零 DOM，可在 Node 直接 import。
 */

import { CONFIG, EVENTS, STATE_DEFAULTS, CAMERA, LIGHTING, QUALITY } from '../shared/config.js';

/** §7.1 的 state 字段（顺序即契约表顺序）。 */
export const STATE_FIELDS = Object.freeze(Object.keys(STATE_DEFAULTS));

export const VIEW_MODES = Object.freeze(CAMERA.viewModes.map((m) => m.mode));
export const VIEW_MODE_BY_INDEX = Object.freeze(
  CAMERA.viewModes.reduce((acc, m) => {
    acc[m.index] = m.mode;
    return acc;
  }, {}),
);
const VIEW_MODE_SET = new Set(VIEW_MODES);
const TIME_PRESET_SET = new Set(LIGHTING.timePresets);
const QUALITY_SET = new Set(QUALITY.order);

export class StateError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'StateError';
    this.detail = detail;
  }
}

const clonePlain = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
  return out;
};

/**
 * 创建状态仓库。
 * @param {{ events: object, initial?: object, onChange?: Function }} options
 */
export function createStateStore({ events, initial = {}, onChange = null } = {}) {
  if (!events || typeof events.emit !== 'function') throw new StateError('createStateStore 需要一个事件总线');

  /** 唯一可变的 state 实例。 */
  const state = {
    mode: STATE_DEFAULTS.mode,
    viewMode: STATE_DEFAULTS.viewMode,
    selectedBuildingId: STATE_DEFAULTS.selectedBuildingId,
    hoveredBuildingId: STATE_DEFAULTS.hoveredBuildingId,
    timePreset: STATE_DEFAULTS.timePreset,
    quality: STATE_DEFAULTS.quality,
    tourState: clonePlain(STATE_DEFAULTS.tourState),
    loading: clonePlain(STATE_DEFAULTS.loading),
  };

  /** 内部视图记录（非 §7.1 字段）：控制器写、相机读。 */
  const view = {
    /** 上一模式（第一人称/F 切换需要恢复） */
    previousMode: null,
    /** 'zone' 模式使用的机位 id */
    viewpointId: null,
    /** 'zone' 模式请求的区域（'city' | 'B'..'F'） */
    area: null,
    /** 'focus' 模式的目标建筑 id */
    focusBuildingId: null,
    /** 'axis' 模式的中轴段序号（1-based） */
    axisIndex: 1,
    /** 'interior' 模式使用的机位 id */
    interiorViewpointId: null,
  };

  const subscribers = new Set();

  function emitChange(changed, meta = {}) {
    const payload = { state: snapshot(), changed: Object.freeze(changed), source: meta.source ?? 'core' };
    events.emit(EVENTS.stateChange, payload);
    for (const fn of [...subscribers]) {
      try {
        fn(payload);
      } catch (error) {
        console.error('[state] 订阅者抛错：', error);
      }
    }
    if (onChange) onChange(payload);
    return payload;
  }

  for (const [key, value] of Object.entries(initial)) {
    if (!STATE_FIELDS.includes(key)) throw new StateError(`initial 含未知 state 字段 "${key}"`);
    state[key] = key === 'tourState' || key === 'loading' ? { ...clonePlain(value) } : value;
  }

  function snapshot() {
    return clonePlain(state);
  }

  /**
   * 变更 state 字段（唯一入口）。同步 mode/viewMode 的一致性后广播 state:change。
   * @param {object} changes
   * @param {{ source?: string, view?: object, silent?: boolean }} [meta]
   */
  function patch(changes, meta = {}) {
    const changed = {};
    for (const [key, value] of Object.entries(changes)) {
      if (!STATE_FIELDS.includes(key)) throw new StateError(`未知 state 字段 "${key}"（契约 §7.1）`);
      const next = key === 'tourState' || key === 'loading' ? { ...state[key], ...clonePlain(value) } : value;
      if (JSON.stringify(state[key]) !== JSON.stringify(next)) {
        state[key] = next;
        changed[key] = clonePlain(next);
      }
    }

    // mode 与 viewMode 的一致性（§7.1：fp 与导览互斥）
    if (state.viewMode === 'fp' && state.mode !== 'fp') {
      state.mode = 'fp';
      changed.mode = 'fp';
    } else if (state.viewMode !== 'fp' && state.mode === 'fp') {
      state.mode = state.tourState.active ? 'tour' : 'browse';
      changed.mode = state.mode;
    }
    if (state.tourState.active && state.viewMode !== 'fp' && state.mode !== 'tour') {
      state.mode = 'tour';
      changed.mode = 'tour';
    }
    if (!state.tourState.active && state.mode === 'tour') {
      state.mode = 'browse';
      changed.mode = 'browse';
    }

    if (meta.view) Object.assign(view, meta.view);
    if (Object.keys(changed).length > 0 || meta.view) emitChange(changed, meta);
    return changed;
  }

  return {
    state,
    view,
    snapshot,
    patch,
    viewMode: () => state.viewMode,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /** 加载/失败状态（§7.1 loading 字段；UI 只读显示） */
    setLoading(partial, meta = {}) {
      return patch({ loading: partial }, meta);
    },
    dispose() {
      subscribers.clear();
    },
  };
}

/**
 * 请求控制器：把 §7.2 的请求事件翻译为 state 变更（唯一合法路径）。
 * 相机与环境自身只订阅 `state:change`，因此这里不需要 import 它们（避免循环依赖）。
 *
 * @param {{ events: object, store: object, camera?: object, environment?: object, config?: object }} deps
 */
export function createStateController({ events, store, camera = null, environment = null, config = CONFIG } = {}) {
  if (!events || !store) throw new StateError('createStateController 需要 events 与 store');
  const disposers = [];
  const stats = { viewModeRequests: 0, zoneRequests: 0, focusRequests: 0, presetRequests: 0, qualityRequests: 0, tourRequests: 0, resets: 0, rejected: [] };

  const reject = (type, reason, payload) => {
    stats.rejected.push({ type, reason, payload });
    console.warn(`[state] 拒绝请求 ${type}：${reason}`);
  };

  const on = (type, handler) => {
    disposers.push(events.on(type, handler));
  };

  const setViewMode = (mode, source, extra = {}) => {
    if (!VIEW_MODE_SET.has(mode)) {
      reject(EVENTS.requestViewMode, `未知视角 "${mode}"（合法：${VIEW_MODES.join('/')}）`, { mode });
      return false;
    }
    stats.viewModeRequests += 1;
    const current = store.state.viewMode;
    if (mode === 'fp') {
      // 进入第一人称：导览暂停并让位（§5.4 互斥）
      if (store.state.tourState.active && !store.state.tourState.paused) {
        store.patch({ tourState: { paused: true } }, { source });
      }
      store.patch(
        { viewMode: 'fp' },
        { source, view: { previousMode: current === 'fp' ? store.view.previousMode : current, ...extra } },
      );
      return true;
    }
    // 离开第一人称 / 切换其它模式
    const view = { ...extra };
    if (current === 'fp') view.previousMode = null;
    store.patch({ viewMode: mode }, { source, view });
    return true;
  };

  /* --- 1. 视角模式（键盘 1–8 / 按钮 / F 共用同一入口） --- */
  on(EVENTS.requestViewMode, (payload = {}) => {
    const source = payload.source ?? 'unknown';
    let mode = payload.mode;
    if (mode === undefined && payload.index !== undefined) mode = VIEW_MODE_BY_INDEX[payload.index];
    if (mode === undefined) {
      reject(EVENTS.requestViewMode, 'payload 缺少 mode/index', payload);
      return;
    }
    // F 为切换：已在第一人称时再请求 fp → 恢复进入前的模式
    if (mode === 'fp' && store.state.viewMode === 'fp') {
      const restore = store.view.previousMode ?? 'oblique';
      stats.viewModeRequests += 1;
      store.patch({ viewMode: restore }, { source, view: { previousMode: null } });
      if (camera?.exitFp) camera.exitFp({ source, reason: 'toggle' });
      return;
    }
    setViewMode(mode, source);
  });

  /* --- 2. 分区视角（消费 config.CAMERA.zoneViewpointByArea） --- */
  on(EVENTS.requestZoneFocus, (payload = {}) => {
    const area = payload.area;
    const viewpointId = config.CAMERA.zoneViewpointByArea[area];
    if (!viewpointId) {
      reject(EVENTS.requestZoneFocus, `未知分区 "${area}"`, payload);
      return;
    }
    stats.zoneRequests += 1;
    store.patch({ viewMode: 'zone', selectedBuildingId: null }, { source: payload.source ?? 'unknown', view: { area, viewpointId } });
  });

  /* --- 3. 建筑近景 --- */
  on(EVENTS.requestFocusBuilding, (payload = {}) => {
    const buildingId = payload.buildingId;
    if (typeof buildingId !== 'string' || buildingId.length === 0) {
      reject(EVENTS.requestFocusBuilding, 'buildingId 必须是非空字符串', payload);
      return;
    }
    stats.focusRequests += 1;
    store.patch(
      { viewMode: 'focus', selectedBuildingId: buildingId },
      { source: payload.source ?? 'unknown', view: { focusBuildingId: buildingId, viewpointId: payload.viewpointId ?? null } },
    );
  });

  /* --- 4. 导览 --- */
  on(EVENTS.requestTour, (payload = {}) => {
    const action = payload.action;
    if (!['start', 'pause', 'resume', 'stop'].includes(action)) {
      reject(EVENTS.requestTour, `未知动作 "${action}"`, payload);
      return;
    }
    stats.tourRequests += 1;
    const tour = store.state.tourState;
    if (action === 'start') {
      // 第一人称与导览互斥：启动导览 = 先恢复进入前的视角模式，再激活导览（§5.4）
      if (store.state.viewMode === 'fp') {
        const restore = store.view.previousMode ?? config.STATE_DEFAULTS.viewMode;
        store.patch({ viewMode: restore }, { source: payload.source ?? 'unknown', view: { previousMode: null } });
        camera?.exitFp?.({ source: payload.source ?? 'tour', reason: 'tour-start', silent: true });
      }
      store.patch(
        { tourState: { active: true, paused: false, index: payload.index ?? 0, id: payload.id ?? null } },
        { source: payload.source ?? 'unknown', view: { axisIndex: (payload.index ?? 0) + 1 } },
      );
    } else if (action === 'pause') {
      store.patch({ tourState: { active: tour.active, paused: true } }, { source: payload.source ?? 'unknown' });
    } else if (action === 'resume') {
      store.patch({ tourState: { active: true, paused: false } }, { source: payload.source ?? 'unknown' });
    } else {
      store.patch({ tourState: { active: false, paused: false, id: null } }, { source: payload.source ?? 'unknown' });
    }
  });

  /* --- 5. 三时辰 --- */
  on(EVENTS.requestTimePreset, (payload = {}) => {
    const preset = payload.preset;
    if (!TIME_PRESET_SET.has(preset)) {
      reject(EVENTS.requestTimePreset, `未知时辰 "${preset}"（合法：${[...TIME_PRESET_SET].join('/')}）`, payload);
      return;
    }
    stats.presetRequests += 1;
    store.patch({ timePreset: preset }, { source: payload.source ?? 'unknown' });
  });

  /* --- 6. 质量档 --- */
  on(EVENTS.requestQuality, (payload = {}) => {
    const tier = payload.tier;
    if (!QUALITY_SET.has(tier)) {
      reject(EVENTS.requestQuality, `未知质量档 "${tier}"（合法：${[...QUALITY_SET].join('/')}）`, payload);
      return;
    }
    stats.qualityRequests += 1;
    store.patch({ quality: tier }, { source: payload.source ?? 'unknown' });
  });

  /* --- 7. 复位 --- */
  on(EVENTS.requestReset, (payload = {}) => {
    stats.resets += 1;
    store.patch(
      { viewMode: 'oblique', selectedBuildingId: null, hoveredBuildingId: null },
      { source: payload.source ?? 'unknown', view: { area: 'city', viewpointId: config.CAMERA.zoneViewpointByArea.city, focusBuildingId: null, axisIndex: 1 } },
    );
    // 悬停/选中高亮复位
    events.emit(EVENTS.selectionChange, { buildingId: null, hovered: true, source: payload.source ?? 'reset' });
    camera?.reset?.({ source: payload.source ?? 'reset' });
  });

  /* --- 8. 选中 / 悬停（G 消费同一份建筑注册表） --- */
  on(EVENTS.selectionChange, (payload = {}) => {
    if (payload.hovered) {
      store.patch({ hoveredBuildingId: payload.buildingId ?? null }, { source: payload.source ?? 'pointer' });
      return;
    }
    store.patch({ selectedBuildingId: payload.buildingId ?? null }, { source: payload.source ?? 'pointer' });
  });

  return {
    stats,
    setViewMode,
    patch: store.patch,
    dispose() {
      for (const d of disposers) {
        try {
          if (typeof d === 'function') d();
        } catch (error) {
          console.error('[state] 取消订阅失败：', error);
        }
      }
      disposers.length = 0;
    },
  };
}

/** 供测试/诊断：state 是否满足 §7.1 契约（字段不多不少）。 */
export function validateStateShape(state) {
  const problems = [];
  const keys = Object.keys(state);
  for (const field of STATE_FIELDS) if (!keys.includes(field)) problems.push(`缺少 state 字段 ${field}`);
  for (const key of keys) if (!STATE_FIELDS.includes(key)) problems.push(`多出 state 字段 ${key}`);
  if (!VIEW_MODE_SET.has(state.viewMode)) problems.push(`viewMode 非法：${state.viewMode}`);
  if (!['browse', 'tour', 'fp'].includes(state.mode)) problems.push(`mode 非法：${state.mode}`);
  if (!TIME_PRESET_SET.has(state.timePreset)) problems.push(`timePreset 非法：${state.timePreset}`);
  if (!QUALITY_SET.has(state.quality)) problems.push(`quality 非法：${state.quality}`);
  // §5.4：进入第一人称时**暂停**导览（暂停 ≠ 停止），因此 `active && paused` 与 viewMode==='fp' 完全兼容；
  // 真正互斥的是"导览正在推进（active 且未暂停）"与第一人称同时存在（t31 修正）。
  if (state.viewMode === 'fp' && state.tourState.active && !state.tourState.paused) {
    problems.push('导览正在推进时不得处于第一人称（§5.4：进 FP 应暂停而非停止导览）');
  }
  if (state.viewMode === 'fp' && state.tourState.active && state.tourState.paused && state.mode !== 'fp') {
    problems.push('导览已暂停且 viewMode=fp 时，mode 必须为 fp');
  }
  if (state.mode === 'fp' && state.viewMode !== 'fp') problems.push('mode=fp 时 viewMode 必须为 fp');
  if (state.viewMode === 'fp' && state.mode !== 'fp') problems.push('viewMode=fp 时 mode 必须为 fp');
  return problems;
}

export default createStateStore;
