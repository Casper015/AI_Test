/**
 * 紫禁天朝 · 全局状态（主 Agent）
 * mode / viewMode / selectedBuildingId / timePreset / quality / tourState 由控制器统一写入。
 */

export const DEFAULT_STATE = {
  mode: 'view',
  viewMode: 'oblique',
  selectedBuildingId: null,
  hoverBuildingId: null,
  timePreset: 'day',
  quality: 'high',
  tourState: 'idle',
  tourIndex: 0,
  fpActive: false,
  zone: 'B',
  ready: false,
  loading: { phase: 'init', progress: 0, message: '准备宫城…' },
  error: null,
  stats: null
};

export function createStore(events) {
  const state = Object.assign({}, DEFAULT_STATE);
  function set(patch) {
    let changed = false;
    for (const k of Object.keys(patch)) {
      if (state[k] !== patch[k]) { state[k] = patch[k]; changed = true; }
    }
    if (changed) events.emit('state', state);
    return state;
  }
  function get() { return state; }
  return { state, set, get };
}

export default createStore;
