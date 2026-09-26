import { EV } from '../shared/events.js';

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
};

const STYLE = `
.ip { position: fixed; inset: 0; pointer-events: none; font-family: "Songti SC","STSong","Noto Serif SC",serif; color: #e9e2cd; }
.ip > * { pointer-events: auto; }
.ip-top { position: absolute; left: 24px; top: 20px; display: flex; align-items: center; gap: 12px; }
.ip-title { font-size: 20px; letter-spacing: .3em; color: #f0e6c8; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
.ip-seal { width: 34px; height: 34px; border-radius: 4px; background: #962822; color: #f6ead0;
  display: grid; place-items: center; font-size: 15px; letter-spacing: 0; box-shadow: inset 0 0 0 1px rgba(255,200,59,.5); }
.ip-modes { position: absolute; left: 24px; top: 70px; display: flex; flex-wrap: wrap; gap: 8px; max-width: 460px; }
.ip-modes button, .ip-panel button, .ip-tour button, .ip-fp button, .ip-col button {
  font: inherit; font-size: 12px; letter-spacing: .12em; color: #efe6cd; background: rgba(16,20,30,.72);
  border: 1px solid rgba(223,161,18,.42); border-radius: 4px; padding: 7px 12px; cursor: pointer; backdrop-filter: blur(6px);
  transition: background 180ms, border-color 180ms, color 180ms;
}
.ip-modes button:hover, .ip-panel button:hover, .ip-tour button:hover, .ip-fp button:hover, .ip-col button:hover { background: rgba(150,40,34,.55); border-color: rgba(255,200,59,.85); }
.ip button.on { background: rgba(150,40,34,.72); border-color: #ffc83b; color: #ffe9b0; }
.ip-col { position: absolute; right: 24px; top: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
.ip-row { display: flex; gap: 6px; align-items: center; }
.ip-label { font-size: 11px; letter-spacing: .22em; color: rgba(233,226,205,.62); margin-right: 4px; }
.ip-panel { position: absolute; left: 24px; bottom: 24px; width: 320px; background: rgba(14,18,26,.82);
  border: 1px solid rgba(223,161,18,.4); border-radius: 4px; padding: 16px; display: none; backdrop-filter: blur(8px); }
.ip-panel.show { display: block; }
.ip-panel h2 { margin: 0 0 6px; font-size: 16px; letter-spacing: .18em; color: #ffe9b0; }
.ip-panel p { margin: 4px 0; font-size: 12px; line-height: 1.7; color: rgba(233,226,205,.82); }
.ip-panel .ip-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.ip-minimap { position: absolute; right: 24px; bottom: 24px; background: rgba(14,18,26,.82); border: 1px solid rgba(223,161,18,.4);
  border-radius: 4px; padding: 8px; backdrop-filter: blur(8px); display: none; }
.ip-minimap.show { display: block; }
.ip-minimap canvas { display: block; cursor: crosshair; }
.ip-tour { position: absolute; left: 50%; transform: translateX(-50%); bottom: 24px; display: flex; gap: 6px; align-items: center;
  background: rgba(14,18,26,.72); border: 1px solid rgba(223,161,18,.32); border-radius: 4px; padding: 8px 12px; }
.ip-tour .ip-stop { font-size: 12px; letter-spacing: .16em; color: #ffe9b0; min-width: 96px; }
.ip-fp { position: absolute; left: 50%; transform: translateX(-50%); top: 20px; display: none; gap: 8px; align-items: center;
  background: rgba(14,18,26,.72); border: 1px solid rgba(223,161,18,.32); border-radius: 4px; padding: 8px 12px; }
.ip-fp.show { display: flex; }
.ip-fp span { font-size: 12px; letter-spacing: .14em; color: rgba(233,226,205,.86); }
.ip-stats { font-size: 11px; letter-spacing: .1em; color: rgba(233,226,205,.55); font-family: ui-monospace, monospace; }
.ip-error { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); display: none; max-width: 420px;
  background: rgba(60,16,14,.9); border: 1px solid rgba(223,161,18,.5); border-radius: 4px; padding: 16px; }
.ip-error.show { display: block; }
@media (max-width: 900px) {
  .ip-modes { max-width: 260px; }
  .ip-col { right: 12px; top: 12px; }
  .ip-panel { left: 12px; right: 12px; bottom: 12px; width: auto; }
  .ip-minimap { right: 12px; bottom: 12px; }
  .ip-minimap canvas { width: 132px; height: 190px; }
  .ip-top { left: 12px; top: 12px; }
}
`;

function injectStyles() {
  if (document.getElementById('ip-style')) return;
  const style = document.createElement('style');
  style.id = 'ip-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export function mount(ctx) {
  const { config, layout, state, bus, registry, rig, env, setQuality } = ctx;
  injectStyles();
  const host = document.getElementById('ui') || document.body;
  const root = el('div', { class: 'ip' });
  host.appendChild(root);

  const title = el('div', { class: 'ip-top' }, [
    el('div', { class: 'ip-seal', text: '殿' }),
    el('div', { class: 'ip-title', text: '紫禁天朝' })
  ]);

  const modeButtons = new Map();
  const modeWrap = el('div', { class: 'ip-modes' });
  for (const m of config.VIEW_MODES) {
    const btn = el('button', {
      text: m.label,
      title: `快捷键 ${m.key}`,
      onclick: () => bus.emit(EV.VIEW_MODE, { mode: m.id })
    });
    modeButtons.set(m.id, btn);
    modeWrap.appendChild(btn);
  }
  const zoneSelect = el('select', {
    class: 'ip-zone',
    title: '分区视角：跳转到某个分区'
  }, Object.values(layout.ZONES).map((z) => el('option', { value: z.id, text: z.name })));
  zoneSelect.style.cssText = 'font:inherit;font-size:12px;color:#efe6cd;background:rgba(16,20,30,.72);border:1px solid rgba(223,161,18,.42);border-radius:4px;padding:6px 8px';
  zoneSelect.addEventListener('change', () => bus.emit(EV.ZONE_FOCUS, { id: `zone.${zoneSelect.value}` }));
  modeWrap.appendChild(zoneSelect);

  const timeRow = el('div', { class: 'ip-row' }, [el('span', { class: 'ip-label', text: '时辰' })]);
  const timeButtons = new Map();
  for (const [id, preset] of Object.entries(config.TIME_PRESETS)) {
    const btn = el('button', { text: preset.label, onclick: () => { env.setPreset(id); bus.emit(EV.TIME, { id }); } });
    timeButtons.set(id, btn);
    timeRow.appendChild(btn);
  }
  const qualityRow = el('div', { class: 'ip-row' }, [el('span', { class: 'ip-label', text: '画质' })]);
  const qualityButtons = new Map();
  for (const [id, label] of [['high', '高'], ['medium', '中'], ['low', '低']]) {
    const btn = el('button', { text: label, onclick: () => { setQuality(id); bus.emit(EV.QUALITY, { id }); } });
    qualityButtons.set(id, btn);
    qualityRow.appendChild(btn);
  }
  const stats = el('div', { class: 'ip-stats', text: '' });
  const col = el('div', { class: 'ip-col' }, [timeRow, qualityRow, stats]);

  const panelTitle = el('h2', { text: '未选择建筑' });
  const panelBody = el('p', { text: '点击宫殿、门楼或亭阁查看信息。' });
  const panelActions = el('div', { class: 'ip-actions' });
  const panel = el('div', { class: 'ip-panel' }, [panelTitle, panelBody, panelActions]);

  const mapCanvas = el('canvas', { width: '216', height: '300', title: '点击分区可定位' });
  const minimap = el('div', { class: 'ip-minimap' }, [mapCanvas]);

  const tourStop = el('div', { class: 'ip-stop', text: '中轴导览' });
  const tourBar = el('div', { class: 'ip-tour' }, [
    tourStop,
    el('button', { text: '开始', onclick: () => bus.emit(EV.TOUR, { action: 'start' }) }),
    el('button', { text: '暂停', onclick: () => bus.emit(EV.TOUR, { action: 'pause' }) }),
    el('button', { text: '继续', onclick: () => bus.emit(EV.TOUR, { action: 'resume' }) }),
    el('button', { text: '停止', onclick: () => bus.emit(EV.TOUR, { action: 'stop' }) })
  ]);

  const fpBar = el('div', { class: 'ip-fp' }, [
    el('span', { text: '第一人称：WASD / 方向键移动 · Shift 加速 · 拖动或点击锁定视角 · Esc 释放 · F 返回' }),
    el('button', { text: '回到全城', onclick: () => bus.emit(EV.VIEW_MODE, { mode: 'oblique' }) })
  ]);

  const errorBox = el('div', { class: 'ip-error' }, [
    el('p', { text: '加载出现问题。' }),
    el('button', { text: '重试', onclick: () => location.reload() })
  ]);

  root.append(title, modeWrap, col, panel, minimap, tourBar, fpBar, errorBox);

  let selectedId = null;

  function renderPanel(id, hovered) {
    const b = id ? registry.buildings.get(id) : null;
    if (!b) {
      panel.classList.remove('show');
      return;
    }
    panel.classList.add('show');
    panelTitle.textContent = b.name + (hovered ? ' · 悬停' : '');
    const zone = layout.ZONES[b.zone] ? layout.ZONES[b.zone].name : b.zone;
    panelBody.innerHTML = '';
    panelBody.appendChild(el('p', { text: `区域：${zone}　类型：${b.category}` }));
    panelBody.appendChild(el('p', { text: b.visitable ? '可进入：可入内参观' : '可进入：此建筑不可进入' }));
    if (b.info) panelBody.appendChild(el('p', { text: b.info }));
    panelActions.innerHTML = '';
    panelActions.appendChild(el('button', { text: '近景查看', onclick: () => rig.focusBuilding(b.id) }));
    panelActions.appendChild(el('button', { text: '进入第一人称', onclick: () => rig.applyViewMode('fp') }));
    const interiorId = `interior.${b.id}`;
    if (registry.viewpoints.has(interiorId)) {
      panelActions.appendChild(el('button', { text: '进入内景', onclick: () => rig.applyViewMode('interior', { id: interiorId }) }));
    }
    panelActions.appendChild(el('button', { text: '回到全城', onclick: () => rig.applyViewMode('oblique') }));
  }

  function drawMinimap() {
    const c = mapCanvas.getContext('2d');
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    const pad = 8;
    const sx = (w - pad * 2) / 700;
    const sz = (h - pad * 2) / 1000;
    const X = (x) => pad + (x + 350) * sx;
    const Z = (z) => pad + (z + 500) * sz;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(20,26,36,.9)';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(46,74,82,.85)';
    c.fillRect(X(-345), Z(-495), (690) * sx, 990 * sz);
    c.fillStyle = 'rgba(87,86,82,.55)';
    c.fillRect(X(-300), Z(-450), 600 * sx, 900 * sz);
    for (const z of Object.values(layout.ZONES)) {
      if (z.id === 'boundary') continue;
      c.fillStyle = z.color + '22';
      c.fillRect(X(z.minX), Z(z.minZ), (z.maxX - z.minX) * sx, (z.maxZ - z.minZ) * sz);
    }
    c.strokeStyle = 'rgba(255,200,59,.55)';
    c.lineWidth = 1;
    c.strokeRect(X(-300), Z(-450), 600 * sx, 900 * sz);
    c.fillStyle = 'rgba(223,161,18,.85)';
    for (const b of registry.buildings.values()) {
      const min = b.bounds.min;
      const max = b.bounds.max;
      c.fillRect(X(min[0]), Z(min[2]), Math.max(1.5, (max[0] - min[0]) * sx), Math.max(1.5, (max[2] - min[2]) * sz));
    }
    const st = rig.getState();
    const px = X(st.position[0]);
    const pz = Z(st.position[2]);
    const dir = [st.target[0] - st.position[0], st.target[2] - st.position[2]];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    c.strokeStyle = '#ff6b58';
    c.beginPath();
    c.moveTo(px, pz);
    c.lineTo(px + (dir[0] / len) * 12, pz + (dir[1] / len) * 12);
    c.stroke();
    c.fillStyle = '#ffc83b';
    c.beginPath();
    c.arc(px, pz, 2.6, 0, Math.PI * 2);
    c.fill();
  }

  mapCanvas.addEventListener('click', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * mapCanvas.width;
    const mz = ((e.clientY - rect.top) / rect.height) * mapCanvas.height;
    const x = ((mx - 8) / (mapCanvas.width - 16)) * 700 - 350;
    const z = ((mz - 8) / (mapCanvas.height - 16)) * 1000 - 500;
    let best = null;
    let bestD = Infinity;
    for (const [id, vp] of registry.viewpoints) {
      if (vp.mode !== 'zone') continue;
      const d = (vp.position[0] - x) ** 2 + (vp.position[2] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best) bus.emit(EV.ZONE_FOCUS, { id: best });
  });

  bus.on(EV.HOVER, (p) => {
    if (!selectedId && p && p.id) renderPanel(p.id, true);
    else if (!selectedId && !p) panel.classList.remove('show');
  });
  bus.on(EV.SELECT, (p) => {
    selectedId = p && p.id ? p.id : null;
    renderPanel(selectedId, false);
  });
  bus.on(EV.TOUR, (p = {}) => {
    tourBar.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    if (p.active && !p.paused) tourBar.children[1].classList.add('on');
    if (p.active && p.paused) tourBar.children[2].classList.add('on');
  });
  bus.on(EV.TOUR_TICK, (p = {}) => { tourStop.textContent = p.name || '中轴导览'; });
  bus.on(EV.FP_ENTER, () => fpBar.classList.add('show'));
  bus.on(EV.FP_EXIT, () => fpBar.classList.remove('show'));
  bus.on(EV.STATS, (p = {}) => { stats.textContent = `${p.fps || 0} fps · ${p.calls || 0} calls · ${((p.tris || 0) / 1000).toFixed(0)}k tri`; });
  bus.on(EV.ERROR, (p = {}) => {
    errorBox.classList.add('show');
    errorBox.querySelector('p').textContent = `加载出现问题：${p.message || '未知错误'}`;
  });
  bus.on(EV.TIME, (p = {}) => {
    timeButtons.forEach((btn, id) => btn.classList.toggle('on', id === p.id));
  });
  bus.on(EV.QUALITY, (p = {}) => {
    qualityButtons.forEach((btn, id) => btn.classList.toggle('on', id === p.id));
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') minimap.classList.toggle('show');
    if (e.code === 'KeyT') bus.emit(EV.TOUR, { action: state.tour && state.tour.active ? 'stop' : 'start' });
  });

  minimap.classList.add('show');
  timeButtons.forEach((btn, id) => btn.classList.toggle('on', id === state.timePreset));
  qualityButtons.forEach((btn, id) => btn.classList.toggle('on', id === state.quality));

  setInterval(() => {
    modeButtons.forEach((btn, id) => btn.classList.toggle('on', id === state.viewMode));
    if (minimap.classList.contains('show')) drawMinimap();
  }, 250);
}
