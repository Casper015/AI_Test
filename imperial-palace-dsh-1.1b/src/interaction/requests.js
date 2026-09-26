/**
 * G 的请求网关（唯一出口）——`src/ui/**` 与键盘层都只经此发请求（计划 §6.2、CONTRACTS §7.1/§7.2）。
 *
 * 铁律（t9 任务卡）：
 *   1. 不存在第二套状态：本文件**不持有**任何视图/选中/导览状态，只把用户意图翻译成 §7.2 的请求事件；
 *   2. 不存在第二套相机：本文件**不 import three**、不碰相机，只发 `view:request-mode` 等请求；
 *   3. 八视角编号、时辰、质量档、分区按钮的取值全部来自 `CONFIG`（不得散落字面量）。
 *
 * 纯 ESM、零 DOM、零 three，可在 Node 直接 import 并断言"每一次调用 = 一个事件"。
 */

import { CAMERA, EVENTS, LIGHTING, QUALITY, UI } from '../shared/config.js';

/* -------------------------------------------------------------------------- */
/*  八视角：编号 ↔ 模式（与键盘 1–8、?view= 完全同源 config.CAMERA.viewModes）    */
/* -------------------------------------------------------------------------- */

/** 八视角模式名（顺序 = 编号 1–8）。 */
export const VIEW_MODES = Object.freeze(CAMERA.viewModes.map((entry) => entry.mode));

/** 编号（1–8）→ 模式名。 */
export const VIEW_MODE_BY_INDEX = Object.freeze(
  CAMERA.viewModes.reduce((acc, entry) => {
    acc[entry.index] = entry.mode;
    return acc;
  }, {}),
);

/** 模式名 → 中文标签（视角切换器按钮文字）。 */
export const VIEW_LABELS = Object.freeze(
  CAMERA.viewModes.reduce((acc, entry) => {
    acc[entry.mode] = entry.label;
    return acc;
  }, {}),
);

/** 模式名 → 投影类型（UI 上标注"正交/透视"用）。 */
export const VIEW_PROJECTIONS = Object.freeze(
  CAMERA.viewModes.reduce((acc, entry) => {
    acc[entry.mode] = entry.projection;
    return acc;
  }, {}),
);

/* -------------------------------------------------------------------------- */
/*  七分区跳转（计划 §6.2：全城 / 前朝 / 主殿 / 后宫 / 西宫苑 / 东宫苑 / 御花园）    */
/* -------------------------------------------------------------------------- */

/**
 * 七个分区按钮。`area` 走 `view:request-zone`（CONFIG.CAMERA.zoneViewpointByArea），
 * `buildingId` 走 `view:request-focus-building`（"主殿"= 金銮殿近景，机位 VP-B-main-hall 已登记）。
 * `keyboard` 记录与键盘的对应关系（数字键由 core 相机装置消费，UI 只做同样语义的按钮）。
 */
export const ZONE_BUTTONS = Object.freeze([
  Object.freeze({ id: 'city', label: '全城', area: 'city' }),
  Object.freeze({ id: 'forecourt', label: '前朝', area: 'B' }),
  Object.freeze({ id: 'throne', label: '主殿', buildingId: 'B-hall-main' }),
  Object.freeze({ id: 'inner', label: '后宫', area: 'C' }),
  Object.freeze({ id: 'west', label: '西宫苑', area: 'D' }),
  Object.freeze({ id: 'east', label: '东宫苑', area: 'E' }),
  Object.freeze({ id: 'garden', label: '御花园', area: 'F' }),
]);

/* -------------------------------------------------------------------------- */
/*  三时辰 / 质量档                                                             */
/* -------------------------------------------------------------------------- */

export const TIME_PRESETS = Object.freeze([...LIGHTING.timePresets]);

export const TIME_LABELS = Object.freeze({
  goldenHour: '盛世金辉',
  sunset: '落霞夕照',
  moonlitNight: '寒月宫灯',
});

export const QUALITY_ORDER = Object.freeze([...QUALITY.order]);

export const QUALITY_LABELS = Object.freeze(
  QUALITY.order.reduce((acc, tier) => {
    acc[tier] = QUALITY.tiers[tier]?.label ?? tier;
    return acc;
  }, {}),
);

/** 导览动作（CONTRACTS §7.2 `tour:request`）。 */
export const TOUR_ACTIONS = Object.freeze(['start', 'pause', 'resume', 'stop']);

/** 循环取下一个值（键盘 T/Y 的轮转语义；越界回绕）。 */
export function nextInCycle(list, current) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const index = list.indexOf(current);
  return list[(index + 1) % list.length];
}

export class RequestError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'RequestError';
    this.detail = detail;
  }
}

/**
 * 创建请求网关。
 * @param {{ events: object, source?: string, onRequest?: (type: string, payload: object) => void }} options
 */
export function createRequester({ events, source = 'ui', onRequest = null } = {}) {
  if (!events || typeof events.request !== 'function') throw new RequestError('createRequester 需要事件总线（events.request）');

  const sent = [];
  const stats = { total: 0, byType: {} };
  /** 合法但被本地拦截的输入（例如编号越界），用于 UI 提示与测试断言"没有发事件"。 */
  const rejected = [];

  function send(type, payload) {
    const body = { ...payload, source };
    events.request(type, body);
    sent.push({ type, payload: body });
    stats.total += 1;
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (onRequest) onRequest(type, body);
    return body;
  }

  const requester = {
    /** 任意请求（唯一底层出口，测试可断言）。 */
    send,
    /** 视角：模式名（键盘 1–8 / 按钮 / F 全部走这一条）。 */
    viewMode(mode, extra = {}) {
      if (!VIEW_MODES.includes(mode)) {
        rejected.push({ call: 'viewMode', value: mode });
        throw new RequestError(`未知视角模式 "${mode}"（合法：${VIEW_MODES.join('/')}）`, { mode });
      }
      return send(EVENTS.requestViewMode, { mode, ...extra });
    },
    /** 视角：编号 1–8。 */
    viewByIndex(index, extra = {}) {
      const mode = VIEW_MODE_BY_INDEX[index];
      if (!mode) {
        rejected.push({ call: 'viewByIndex', value: index });
        return null;
      }
      return send(EVENTS.requestViewMode, { mode, index, ...extra });
    },
    /** 分区跳转（全城/B/C/D/E/F）。 */
    zone(area) {
      const known = Object.prototype.hasOwnProperty.call(CAMERA.zoneViewpointByArea, area);
      if (!known) {
        rejected.push({ call: 'zone', value: area });
        throw new RequestError(`未知分区 "${area}"（合法：${Object.keys(CAMERA.zoneViewpointByArea).join('/')}）`, { area });
      }
      return send(EVENTS.requestZoneFocus, { area });
    },
    /** 建筑近景（选中建筑）。 */
    focusBuilding(buildingId, extra = {}) {
      if (typeof buildingId !== 'string' || buildingId.length === 0) {
        rejected.push({ call: 'focusBuilding', value: buildingId });
        throw new RequestError('focusBuilding 需要非空字符串 buildingId', { buildingId });
      }
      return send(EVENTS.requestFocusBuilding, { buildingId, ...extra });
    },
    /** 中轴导览。 */
    tour(action, extra = {}) {
      if (!TOUR_ACTIONS.includes(action)) {
        rejected.push({ call: 'tour', value: action });
        throw new RequestError(`未知导览动作 "${action}"（合法：${TOUR_ACTIONS.join('/')}）`, { action });
      }
      return send(EVENTS.requestTour, { action, ...extra });
    },
    /** 三时辰。 */
    timePreset(preset) {
      if (!TIME_PRESETS.includes(preset)) {
        rejected.push({ call: 'timePreset', value: preset });
        throw new RequestError(`未知时辰 "${preset}"（合法：${TIME_PRESETS.join('/')}）`, { preset });
      }
      return send(EVENTS.requestTimePreset, { preset });
    },
    /** 质量档。 */
    quality(tier) {
      if (!QUALITY_ORDER.includes(tier)) {
        rejected.push({ call: 'quality', value: tier });
        throw new RequestError(`未知质量档 "${tier}"（合法：${QUALITY_ORDER.join('/')}）`, { tier });
      }
      return send(EVENTS.requestQuality, { tier });
    },
    /** 复位 / 回到全城（core 控制器同时复位相机与选中）。 */
    reset() {
      return send(EVENTS.requestReset, {});
    },
    /** 选中 / 悬停（core 控制器消费后 patch state）。 */
    selection(buildingId, hovered = false) {
      return send(EVENTS.selectionChange, { buildingId: buildingId ?? null, hovered: hovered === true });
    },
    /** 键盘/UI 之外的诊断入口（仍走 events.request，事件名由总线校验）。 */
    raw(type, payload = {}) {
      if (type === EVENTS.stateChange || type === EVENTS.zoneLoaded || type === EVENTS.zoneFailed) {
        throw new RequestError(`"${type}" 是上报事件，G 不得作为请求发送`);
      }
      if (type === EVENTS.assetsProgress || type === EVENTS.assetsFailed || type === EVENTS.cameraSettled) {
        throw new RequestError(`"${type}" 是上报事件，G 不得作为请求发送`);
      }
      if (type === EVENTS.fpEntered || type === EVENTS.fpExited || type === EVENTS.blockedByBuilding) {
        throw new RequestError(`"${type}" 是上报事件，G 不得作为请求发送`);
      }
      return send(type, payload);
    },
  };

  return {
    requester,
    source,
    stats,
    sent,
    rejected,
    /** UI 过渡时长（与 §3.1 同源，供 toast/高亮淡出使用）。 */
    transitionMs: UI.transitionMs,
    /** 最近一次请求（诊断/测试）。 */
    last: () => sent[sent.length - 1] ?? null,
    dispose() {
      sent.length = 0;
    },
  };
}

export default createRequester;
