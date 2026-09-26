/**
 * 中轴导览（计划 §6.2/§6.4）：南桥 → 御花园的 10 个讲解点，支持开始 / 暂停 / 继续 / 退出，
 * 用户接管相机时**暂停并提示**，与第一人称**互斥**（进入第一人称即暂停导览）。
 *
 * 纪律：
 *   - 导览状态**只存在** `state.tourState`（`{active, paused, index, id}`）：本模块不另存"当前点位"，
 *     只读 `store.state.tourState` 并据此推进；
 *   - 机位推进走 core 相机装置的 `rig.setAxisIndex()`（中轴模式内部机位推进的唯一 API），
 *     模式切换走 `view:request-mode`；本模块**不直接改相机**；
 *   - 不自建任何循环/定时器：讲解点驻留时间由唯一动画循环的 dt 累加驱动（`update(dt)`），
 *     符合 §8.3 "全场一个动画循环"。
 */

import { CAMERA } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
import { EVENTS } from '../shared/config.js';

/** 讲解点驻留时长：由已登记的镜头时长派生（不新增配置数值）。 */
export const DEFAULT_DWELL_SECONDS = CAMERA.transitionSeconds * 4;

/**
 * @param {{
 *   events: object, store: object, requester: object, rig: object, layout?: object,
 *   onNarration?: null|((info: object) => void), onPause?: null|((info: object) => void),
 *   dwellSeconds?: number, autoAttach?: boolean
 * }} options
 */
export function createTourController({
  events,
  store,
  requester,
  rig,
  layout = LAYOUT,
  onNarration = null,
  onPause = null,
  dwellSeconds = DEFAULT_DWELL_SECONDS,
  autoAttach = true,
} = {}) {
  if (!events || !store || !requester || !rig) throw new Error('createTourController 需要 events / store / requester / rig');
  const points = layout.TOUR_POINTS;
  const stats = { starts: 0, pauses: 0, resumes: 0, stops: 0, advances: 0, takeovers: 0, ticked: 0 };
  let dwell = 0;
  let attached = false;
  /** 导览自身引发的 state 变更深度（>0 时不得被当作"用户接管"）。 */
  let internalDepth = 0;
  /** 上一轮 state:change 时导览是否已激活（区分"刚启动"与"被切走"）。 */
  let lastActive = store.state.tourState.active;
  const listeners = [];

  /** 导览内部动作：其间产生的 state:change 不算接管。 */
  function internal(fn) {
    internalDepth += 1;
    try {
      return fn();
    } finally {
      internalDepth -= 1;
    }
  }

  const tourState = () => store.state.tourState;

  function pointAt(index) {
    return points[Math.max(0, Math.min(points.length - 1, index))] ?? null;
  }

  function announce(info = {}) {
    const index = tourState().index ?? 0;
    const point = pointAt(index);
    const payload = {
      index,
      total: points.length,
      point,
      name: point?.name ?? '',
      narration: point?.narration ?? '',
      zone: point?.zone ?? null,
      paused: tourState().paused,
      active: tourState().active,
      ...info,
    };
    onNarration?.(payload);
    return payload;
  }

  /** 推进到指定讲解点（机位 + 状态一起走，只用 core 的接口）。 */
  function goTo(index, { source = 'tour' } = {}) {
    const bounded = Math.max(0, Math.min(points.length - 1, index));
    return internal(() => {
      // 1) 中轴机位推进（同时写 store.view.axisIndex，保持 state → 机位一致）
      rig.setAxisIndex(bounded + 1, { source: `tour:${source}` });
      // 2) 状态里的 index（唯一真相源）走请求事件
      requester.tour('start', { index: bounded, id: pointAt(bounded)?.id ?? null });
      dwell = 0;
      announce({ source });
      return bounded;
    });
  }

  function start(index = 0) {
    stats.starts += 1;
    // 与第一人称互斥由 core 控制器保证：开始导览前若在第一人称，core 会先恢复进入前的模式（§5.4）。
    // 状态 index 只由 `tour:request` 写入（唯一真相源），机位推进由 rig.setAxisIndex 完成。
    return internal(() => {
      if (store.state.viewMode !== 'axis') requester.viewMode('axis');
      return goTo(index, { source: 'start' });
    });
  }

  function pause(source = 'ui') {
    if (!tourState().active || tourState().paused) return false;
    stats.pauses += 1;
    requester.tour('pause');
    announce({ source, paused: true });
    return true;
  }

  function resume() {
    if (!tourState().active || !tourState().paused) return false;
    stats.resumes += 1;
    requester.tour('resume');
    announce({ source: 'resume', paused: false });
    return true;
  }

  function stop() {
    if (!tourState().active) return false;
    stats.stops += 1;
    requester.tour('stop');
    announce({ source: 'stop', active: false, paused: false });
    return true;
  }

  function next() {
    const index = (tourState().index ?? 0) + 1;
    if (index >= points.length) {
      stop();
      onPause?.({ reason: 'finished', title: '导览结束', detail: '已抵达御花园讲解点，可继续自由游览。' });
      return null;
    }
    stats.advances += 1;
    return goTo(index, { source: 'advance' });
  }

  function previous() {
    stats.advances += 1;
    return goTo(Math.max(0, (tourState().index ?? 0) - 1), { source: 'previous' });
  }

  /** 用户接管相机（拖动/滚轮/点选视角/切模式）→ 暂停导览并提示，不争夺相机。 */
  function notifyTakeover(reason = 'user-camera') {
    const paused = pause(reason);
    if (!paused) return false;
    stats.takeovers += 1;
    onPause?.({
      reason,
      title: '导览已暂停',
      detail: '检测到你手动操作视角：导览已暂停，点「继续」恢复，或点「退出」回到自由浏览。',
    });
    return true;
  }

  function onStateChange({ changed, state }) {
    if (!changed || (!('tourState' in changed) && !('viewMode' in changed))) return;
    if (internalDepth > 0) return; // 导览自己引发的变更不算"用户接管"
    const tour = state.tourState;
    const wasActive = lastActive;
    lastActive = tour.active;
    if (!tour.active) {
      dwell = 0;
      return;
    }
    // 外部（main.js 的 Space）启动了导览但没切视角 → 补上中轴模式与第 1 个讲解点，
    // 而不是把自己暂停掉（协作模式下 G 不再重复发请求，必须由 state 反应补齐机位）
    if (tour.active && !wasActive && state.viewMode !== 'axis' && !tour.paused) {
      internal(() => {
        requester.viewMode('axis');
        rig.setAxisIndex((tour.index ?? 0) + 1, { source: 'tour:external-start' });
      });
      announce({ source: 'external-start' });
      return;
    }
    if (tour.active && state.viewMode !== 'axis' && !tour.paused) {
      // 视角被切到别处（用户手动切了模式）→ 视为接管，暂停导览
      notifyTakeover('view-change');
      return;
    }
    if (tour.paused) return;
    announce({ source: 'state' });
  }

  function attach() {
    if (attached || !autoAttach) return;
    attached = true;
    listeners.push(events.on(EVENTS.stateChange, onStateChange));
  }

  /** 每帧驱动（由唯一动画循环调用）；导览推进只在 active && !paused 时累积。 */
  function update(dt) {
    stats.ticked += 1;
    const tour = tourState();
    if (!tour.active || tour.paused) return null;
    dwell += Math.max(0, dt);
    if (dwell < dwellSeconds) return null;
    return next();
  }

  attach();

  return {
    attach,
    detach() {
      for (const off of listeners.splice(0)) off();
      attached = false;
    },
    start,
    pause,
    resume,
    stop,
    next,
    previous,
    goTo,
    toggle() {
      return tourState().active ? stop() : start(0);
    },
    notifyTakeover,
    update,
    /** 只读视图（UI 渲染讲解文本用）。 */
    describe() {
      const tour = tourState();
      const point = pointAt(tour.index ?? 0);
      return {
        active: tour.active,
        paused: tour.paused,
        index: tour.index ?? 0,
        total: points.length,
        dwell: +dwell.toFixed(2),
        dwellSeconds,
        name: point?.name ?? '',
        narration: point?.narration ?? '',
        zone: point?.zone ?? null,
        points: points.map((p) => ({ index: p.index - 1, id: p.id, name: p.name, zone: p.zone, narration: p.narration })),
      };
    },
    stats: () => ({ ...stats, attached }),
    dispose() {
      this.detach();
    },
  };
}

export default createTourController;
