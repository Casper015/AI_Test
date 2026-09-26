export const EV = {
  VIEW_MODE: 'view:mode',
  VIEW_APPLIED: 'view:applied',
  SELECT: 'select',
  HOVER: 'hover',
  TIME: 'time',
  QUALITY: 'quality',
  TOUR: 'tour',
  TOUR_TICK: 'tour:tick',
  ZONE_FOCUS: 'zone:focus',
  FP_ENTER: 'fp:enter',
  FP_EXIT: 'fp:exit',
  READY: 'ready',
  LOAD_PROGRESS: 'load:progress',
  ERROR: 'error',
  STATS: 'stats'
};

export function createBus() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type).delete(fn);
    },
    off(type, fn) {
      const set = map.get(type);
      if (set) set.delete(fn);
    },
    emit(type, payload) {
      const set = map.get(type);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[bus]', type, err);
        }
      }
    }
  };
}
