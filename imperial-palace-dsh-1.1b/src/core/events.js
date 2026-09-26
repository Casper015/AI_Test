/**
 * 事件总线（唯一）—— 全项目状态变更的唯一通道（计划 §6.1/§6.2、CONTRACTS §7.2）。
 *
 * 纪律：
 *   1. 事件名只能取自 `config.EVENTS` 的 17 条；写错名字立即抛错（不得静默丢事件）。
 *   2. UI、键盘、区域都只能 `request()`（请求）或 `emit()`（上报）；**没有任何一方直接改 state**，
 *      state 由 `src/core/state.js` 的控制器在消费请求事件后统一变更并发 `state:change`。
 *   3. 单个 handler 抛错不影响其它 handler；错误经 `onError` 上报（默认 console.error）。
 *
 * 本文件零 three、零 DOM 依赖，可在 Node 直接 import。
 */

import { EVENTS, CONFIG } from '../shared/config.js';

/** 合法事件名集合（唯一真相源 = config.EVENTS）。 */
export const EVENT_NAMES = Object.freeze(Object.values(EVENTS));

const EVENT_NAME_SET = new Set(EVENT_NAMES);

/** 事件名 → 常量键（报错信息用）。 */
const NAME_TO_KEY = Object.freeze(
  Object.entries(EVENTS).reduce((acc, [key, name]) => {
    acc[name] = key;
    return acc;
  }, {}),
);

export class EventBusError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EventBusError';
  }
}

/**
 * 创建事件总线。
 * @param {{ onError?: (error: Error, info: { type: string, payload: any }) => void, allowed?: string[] }} [options]
 */
export function createEventBus(options = {}) {
  const onError = options.onError ?? ((error, info) => console.error(`[events] ${info.type} handler 抛错：`, error));
  const allowed = options.allowed ? new Set(options.allowed) : EVENT_NAME_SET;
  /** @type {Map<string, Set<Function>>} */
  const handlers = new Map();
  /** 事件计数（诊断/测试用）。 */
  const counters = new Map();

  function assertType(type) {
    if (typeof type !== 'string') throw new EventBusError(`事件名必须是字符串，收到 ${typeof type}`);
    if (!allowed.has(type)) {
      const legal = [...allowed].join(', ');
      throw new EventBusError(`未知事件 "${type}"（契约 §7.2 只允许：${legal}）`);
    }
  }

  function on(type, handler) {
    assertType(type);
    if (typeof handler !== 'function') throw new EventBusError(`事件 "${type}" 的 handler 必须是函数`);
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    set.add(handler);
    return () => off(type, handler);
  }

  function off(type, handler) {
    const set = handlers.get(type);
    if (!set) return false;
    const removed = set.delete(handler);
    if (set.size === 0) handlers.delete(type);
    return removed;
  }

  function emit(type, payload = {}) {
    assertType(type);
    counters.set(type, (counters.get(type) ?? 0) + 1);
    const set = handlers.get(type);
    if (!set) return 0;
    let delivered = 0;
    // 复制一份，允许 handler 内部 off/on
    for (const handler of [...set]) {
      try {
        handler(payload, type);
        delivered += 1;
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)), { type, payload });
      }
    }
    return delivered;
  }

  /** 请求 = emit（语义区分：请求由控制器消费并改 state，上报由观察者消费）。 */
  function request(type, payload = {}) {
    assertType(type);
    if (payload !== null && typeof payload === 'object' && payload.source === undefined) {
      return emit(type, { ...payload, source: 'unknown' });
    }
    return emit(type, payload);
  }

  return {
    on,
    off,
    emit,
    request,
    /** 当前订阅者数量（测试/诊断用）。 */
    listenerCount(type) {
      return handlers.get(type)?.size ?? 0;
    },
    /** 事件发送计数（测试/诊断用）。 */
    count(type) {
      return counters.get(type) ?? 0;
    },
    counters() {
      return Object.fromEntries(counters);
    },
    clear() {
      handlers.clear();
    },
    names: EVENT_NAMES,
  };
}

/** 供测试断言使用：bus 发出的所有事件名都必须在契约表内。 */
export function isContractEvent(type) {
  return EVENT_NAME_SET.has(type);
}

/** 事件表常量（便于下游 `import { EVENTS }`）。 */
export const EVENT_TABLE = EVENTS;
export const CONFIG_VERSION = CONFIG.CONFIG_VERSION;
