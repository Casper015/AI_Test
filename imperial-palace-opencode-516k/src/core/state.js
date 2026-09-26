import { createBus, EV } from '../shared/events.js';

export function createState(initial = {}) {
  const bus = createBus();
  const state = {
    phase: 'loading',
    mode: 'overview',
    viewMode: 'oblique',
    viewId: 'zone.main-hall',
    selectedBuildingId: null,
    hoveredBuildingId: null,
    timePreset: 'golden',
    quality: 'high',
    tour: { active: false, paused: false, index: 0, list: [], dwell: 9 },
    fp: { active: false, position: null, heading: 0, spawnId: null },
    stats: { fps: 0, calls: 0, tris: 0, ms: 0 },
    loading: { done: 0, total: 0, zone: '' },
    ...initial
  };
  function set(patch, evName) {
    Object.assign(state, patch);
    if (evName) state.bus.emit(evName, patch);
  }
  Object.assign(state, { bus, EV, set });
  return state;
}
