/**
 * 紫禁天朝 · 中轴导览（G 交互）
 * 从南桥到御花园的讲解点，支持暂停、继续、退出；用户接管相机时自动暂停。
 */

export function createTour(opts) {
  const { rig, layout, events, interval } = opts;
  const stops = layout.tour;
  const st = { state: 'idle', index: 0, timer: 0, wait: interval || 8.2 };

  function go(i) {
    const s = stops[i];
    if (!s) return;
    events.emit('tour-stop', s);
    rig.setMode('orbit');
    rig.controls.target.set(s.target.x, s.target.y, s.target.z);
    rig.flyTo({ position: s.view, target: s.target, fov: 52 }, 'orbit');
  }

  function start() {
    st.state = 'running';
    st.index = 0;
    st.timer = 0;
    go(0);
  }
  function pause() {
    if (st.state === 'running') st.state = 'paused';
  }
  function resume() {
    if (st.state === 'paused') st.state = 'running';
  }
  function exit() {
    st.state = 'idle';
  }
  function next() {
    st.index = (st.index + 1) % stops.length;
    st.timer = 0;
    go(st.index);
  }
  function prev() {
    st.index = (st.index - 1 + stops.length) % stops.length;
    st.timer = 0;
    go(st.index);
  }
  function update(dt) {
    if (st.state !== 'running') return;
    st.timer += dt;
    if (st.timer >= st.wait) next();
  }
  return { state: st, start, pause, resume, exit, next, prev, update, stops };
}

export default createTour;
