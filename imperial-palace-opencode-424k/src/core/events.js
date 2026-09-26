/**
 * 紫禁天朝 · 全局事件总线（主 Agent）
 * 键盘、按钮、UI 与控制器共享同一套请求事件。
 */

export function createEvents() {
  const map = new Map();
  function on(type, fn) {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(fn);
    return () => off(type, fn);
  }
  function off(type, fn) {
    const set = map.get(type);
    if (set) set.delete(fn);
  }
  function emit(type, payload) {
    const set = map.get(type);
    if (set) for (const fn of Array.from(set)) fn(payload);
  }
  function clear() { map.clear(); }
  return { on, off, emit, clear };
}

export default createEvents;
