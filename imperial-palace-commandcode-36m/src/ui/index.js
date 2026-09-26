// src/ui/index.js · G（交互与 UI）
// HUD：多角度模式切换器（八视角含第一人称）、分区跳转、建筑信息面板、中轴导览、
// 时辰/画质、小地图、加载/错误/提示、操作说明、窄屏折叠。
// 只在 #ui 内创建 DOM；不建第二套相机/灯光/事件总线；不建第二个 rAF 渲染循环
// （内部刷新用 setInterval 只更新 DOM 与 2D canvas）。
import { EV } from '../shared/events.js';

export function mount({ config, layout, state, bus, registry, rig, env, zones }) {
  const host = document.getElementById('ui');
  if (!host) return { dispose() {} };

  const T = config.UI_TOKENS || { spacing: [4, 8, 12, 16, 24, 32], radius: 4, transitionMs: 180 };
  const cleanups = [];
  // 截图/验收脚本（scripts/shot.mjs）以 ?ui=0 请求无 HUD 的建筑画面；
  // 此时仍完整构建 HUD（错误可暴露在 diag），但隐藏且停掉刷新计时器。
  const hidden = new URLSearchParams(location.search).get('ui') === '0';

  // 分区 -> 机位 id（EV.ZONE_FOCUS 使用 zone.* 机位）
  const ZONE_VIEW = {
    forecourt: 'zone.main-hall',
    inner: 'zone.inner',
    west: 'zone.west',
    east: 'zone.east',
    garden: 'zone.garden',
    boundary: 'zone.gate-south'
  };
  // 分区跳转按钮（与计划 §6.2 一致）
  const ZONE_BUTTONS = [
    { id: 'city', label: '全城', view: null },
    { id: 'forecourt', label: '前朝', view: 'zone.main-hall' },
    { id: 'inner', label: '后宫', view: 'zone.inner' },
    { id: 'west', label: '西宫苑', view: 'zone.west' },
    { id: 'east', label: '东宫苑', view: 'zone.east' },
    { id: 'garden', label: '御花园', view: 'zone.garden' },
    { id: 'boundary', label: '城门', view: 'zone.gate-south' }
  ];

  // ---- DOM 助手 -------------------------------------------------------------
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(label, keyHint) {
    const b = el('button', 'xp-btn');
    b.type = 'button';
    b.appendChild(el('span', 'xp-btn-label', label));
    if (keyHint) b.appendChild(el('span', 'xp-key', keyHint));
    return b;
  }

  // ---- 样式 -----------------------------------------------------------------
  const style = el('style');
  style.textContent = `
  #ui .xp-root{position:fixed;inset:0;pointer-events:none;
    font-family:"Songti SC","STSong","Noto Serif SC",serif;color:#e8d9b4;}
  #ui .xp-panel,#ui .xp-brand,#ui .xp-info,#ui .xp-map,#ui .xp-tour,#ui .xp-help,
  #ui .xp-toast,#ui .xp-status,#ui .xp-fpbtn{pointer-events:auto;}
  #ui .xp-panel{background:rgba(10,12,16,.74);border:1px solid rgba(223,161,18,.30);
    border-radius:${T.radius}px;padding:${T.spacing[1]}px;backdrop-filter:blur(3px);}
  #ui .xp-title{font-size:11px;letter-spacing:.26em;color:#c8a24a;margin:0 0 ${T.spacing[0]}px 2px;}
  #ui .xp-grid{display:grid;gap:${T.spacing[0]}px;}
  #ui .xp-grid.g2{grid-template-columns:1fr 1fr;}
  #ui .xp-grid.g3{grid-template-columns:1fr 1fr 1fr;}
  #ui .xp-btn{display:flex;align-items:center;justify-content:space-between;gap:${T.spacing[0]}px;
    min-height:24px;padding:${T.spacing[0]}px ${T.spacing[1]}px;cursor:pointer;
    background:rgba(255,255,255,.035);border:1px solid rgba(223,161,18,.24);
    border-radius:${T.radius}px;color:#d8cba0;font-family:inherit;font-size:12px;
    letter-spacing:.08em;transition:background ${T.transitionMs}ms ease,border-color ${T.transitionMs}ms ease,color ${T.transitionMs}ms ease;}
  #ui .xp-btn:hover{background:rgba(223,161,18,.16);border-color:rgba(223,161,18,.5);color:#f4e8c6;}
  #ui .xp-btn.on{background:rgba(150,40,34,.62);border-color:#dfa112;color:#f6eccd;}
  #ui .xp-btn[disabled]{opacity:.38;cursor:default;}
  #ui .xp-btn-label{white-space:nowrap;}
  #ui .xp-key{font-size:10px;opacity:.7;padding:0 3px;border:1px solid rgba(223,161,18,.35);
    border-radius:3px;line-height:14px;}
  #ui .xp-brand{position:absolute;top:${T.spacing[2]}px;left:${T.spacing[2]}px;display:flex;
    align-items:center;gap:${T.spacing[1]}px;}
  #ui .xp-seal{display:inline-block;background:#962822;color:#f0e2bb;font-size:14px;
    letter-spacing:.22em;padding:${T.spacing[0]}px ${T.spacing[1]}px;border-radius:${T.radius}px;
    box-shadow:0 0 0 1px rgba(223,161,18,.6) inset;}
  #ui .xp-sub{font-size:10px;letter-spacing:.3em;color:#8a8266;}
  #ui .xp-col{position:absolute;top:56px;left:${T.spacing[2]}px;width:236px;display:flex;
    flex-direction:column;gap:${T.spacing[1]}px;max-height:calc(100vh - 150px);overflow:auto;
    padding-right:2px;scrollbar-width:thin;}
  #ui .xp-info{position:absolute;top:${T.spacing[2]}px;right:${T.spacing[2]}px;width:250px;
    padding:${T.spacing[1]}px ${T.spacing[2]}px;}
  #ui .xp-info .xp-name{font-size:18px;letter-spacing:.1em;color:#f2e3bb;margin:0 0 2px;}
  #ui .xp-info .xp-meta{font-size:11px;color:#a89f86;letter-spacing:.1em;margin-bottom:${T.spacing[0]}px;}
  #ui .xp-info .xp-desc{font-size:12px;line-height:1.6;color:#d8cba0;}
  #ui .xp-tag{display:inline-block;font-size:10px;letter-spacing:.14em;padding:1px 6px;
    border-radius:${T.radius}px;margin-top:${T.spacing[0]}px;}
  #ui .xp-tag.ok{background:rgba(28,78,64,.7);color:#bfe6d6;border:1px solid rgba(120,200,170,.5);}
  #ui .xp-tag.no{background:rgba(120,26,22,.7);color:#f0c7bd;border:1px solid rgba(220,120,100,.5);}
  #ui .xp-tour{position:absolute;left:${T.spacing[2]}px;bottom:${T.spacing[2]}px;width:236px;
    padding:${T.spacing[1]}px;}
  #ui .xp-tour .xp-now{font-size:11px;color:#c8a24a;letter-spacing:.12em;margin:0 0 6px;
    min-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  #ui .xp-tour .xp-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:${T.spacing[0]}px;}
  #ui .xp-map{position:absolute;right:${T.spacing[2]}px;bottom:${T.spacing[2]}px;padding:${T.spacing[1]}px;}
  #ui .xp-map canvas{display:block;border-radius:${T.radius}px;cursor:pointer;}
  #ui .xp-map .xp-stat{font-family:ui-monospace,monospace;font-size:10px;color:rgba(220,214,196,.55);
    letter-spacing:.1em;margin-top:${T.spacing[0]}px;text-align:right;}
  #ui .xp-help{padding:${T.spacing[1]}px;font-size:11px;line-height:1.75;color:#bfb59a;}
  #ui .xp-help b{color:#e0cf9f;font-weight:600;}
  #ui .xp-help .xp-hhead{font-size:11px;letter-spacing:.2em;color:#c8a24a;cursor:pointer;
    display:flex;justify-content:space-between;align-items:center;}
  #ui .xp-help[data-open="false"] .xp-hbody{display:none;}
  #ui .xp-status{position:absolute;top:${T.spacing[2]}px;left:50%;transform:translateX(-50%);
    font-size:11px;letter-spacing:.16em;color:#c8a24a;background:rgba(10,12,16,.6);
    padding:2px 10px;border-radius:${T.radius}px;border:1px solid rgba(223,161,18,.25);}
  #ui .xp-fpbtn{position:absolute;top:56px;right:${T.spacing[2]}px;display:none;}
  #ui .xp-toast{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:none;
    z-index:60;max-width:min(80vw,420px);text-align:center;background:rgba(10,12,16,.9);
    border:1px solid rgba(223,161,18,.5);border-radius:${T.radius}px;padding:${T.spacing[2]}px;}
  #ui .xp-toast .xp-tmsg{font-size:13px;line-height:1.7;color:#e8d9b4;letter-spacing:.08em;}
  #ui .xp-toast .xp-trow{margin-top:${T.spacing[1]}px;display:flex;gap:${T.spacing[1]}px;justify-content:center;}
  #ui .xp-root.collapsed .xp-col,#ui .xp-root.collapsed .xp-info,
  #ui .xp-root.collapsed .xp-tour,#ui .xp-root.collapsed .xp-help{display:none;}

  @media (max-width: 820px){
    #ui .xp-col{width:min(70vw,236px);}
    #ui .xp-info{width:min(46vw,210px);font-size:12px;}
    #ui .xp-info .xp-name{font-size:15px;}
    #ui .xp-map{transform:scale(.82);transform-origin:bottom right;}
    #ui .xp-tour{width:min(70vw,236px);}
    #ui .xp-help{display:none;}
  }
  `;
  host.appendChild(style);

  // ---- 根容器 ---------------------------------------------------------------
  const root = el('div', 'xp-root');
  host.appendChild(root);

  // 品牌 + 折叠按钮
  const brand = el('div', 'xp-brand');
  brand.appendChild(el('span', 'xp-seal', '紫禁天朝'));
  const brandRight = el('div');
  brandRight.appendChild(el('div', 'xp-sub', 'IMPERIAL PALACE · 3D'));
  const collapseBtn = button('面板');
  collapseBtn.style.minHeight = '20px';
  collapseBtn.style.fontSize = '10px';
  collapseBtn.addEventListener('click', () => root.classList.toggle('collapsed'));
  brandRight.appendChild(collapseBtn);
  brand.appendChild(brandRight);
  root.appendChild(brand);

  // 状态（加载/就绪）
  const statusEl = el('div', 'xp-status', '');
  statusEl.style.display = 'none';
  root.appendChild(statusEl);

  // 第一人称退出按钮
  const fpBtn = el('button', 'xp-btn xp-fpbtn');
  fpBtn.type = 'button';
  fpBtn.appendChild(el('span', 'xp-btn-label', '退出第一人称'));
  fpBtn.appendChild(el('span', 'xp-key', 'Esc'));
  fpBtn.addEventListener('click', () => { if (rig && rig.exitFP) rig.exitFP(); });
  root.appendChild(fpBtn);

  // ---- 左栏：视角 / 分区 / 时辰 / 画质 / 操作说明 ---------------------------
  const col = el('div', 'xp-col');
  root.appendChild(col);

  // 视角模式（八）
  const viewPanel = el('section', 'xp-panel');
  viewPanel.appendChild(el('h3', 'xp-title', '视角模式'));
  const viewGrid = el('div', 'xp-grid g2');
  viewPanel.appendChild(viewGrid);
  col.appendChild(viewPanel);
  const viewBtns = new Map();
  (config.VIEW_MODES || []).forEach((m) => {
    const b = button(m.label, m.key);
    b.addEventListener('click', () => {
      if (m.id === 'focus' && !state.selectedBuildingId) {
        toast('请先在地面点选一栋建筑，再切近景。', 2600);
        return;
      }
      bus.emit(EV.VIEW_MODE, { mode: m.id });
    });
    viewGrid.appendChild(b);
    viewBtns.set(m.id, b);
  });

  // 分区跳转
  const zonePanel = el('section', 'xp-panel');
  zonePanel.appendChild(el('h3', 'xp-title', '分区跳转'));
  const zoneGrid = el('div', 'xp-grid g2');
  zonePanel.appendChild(zoneGrid);
  col.appendChild(zonePanel);
  const zoneBtns = new Map();
  ZONE_BUTTONS.forEach((z) => {
    const b = button(z.label);
    b.addEventListener('click', () => {
      if (z.view) bus.emit(EV.ZONE_FOCUS, { id: z.view });
      else bus.emit(EV.VIEW_MODE, { mode: 'oblique' });
    });
    zoneGrid.appendChild(b);
    zoneBtns.set(z.id, b);
  });

  // 时辰
  const timePanel = el('section', 'xp-panel');
  timePanel.appendChild(el('h3', 'xp-title', '时辰'));
  const timeGrid = el('div', 'xp-grid g3');
  timePanel.appendChild(timeGrid);
  col.appendChild(timePanel);
  const timeBtns = new Map();
  Object.keys(config.TIME_PRESETS || {}).forEach((name) => {
    const label = (config.TIME_PRESETS[name] && config.TIME_PRESETS[name].label) || name;
    const b = button(label);
    b.addEventListener('click', () => {
      if (env && env.setPreset) env.setPreset(name);
      state.timePreset = name;
      bus.emit(EV.TIME, { preset: name });
    });
    timeGrid.appendChild(b);
    timeBtns.set(name, b);
  });

  // 画质
  const qualityPanel = el('section', 'xp-panel');
  qualityPanel.appendChild(el('h3', 'xp-title', '画质'));
  const qualityGrid = el('div', 'xp-grid g3');
  qualityPanel.appendChild(qualityGrid);
  col.appendChild(qualityPanel);
  const qualityBtns = new Map();
  const QUALITY_LABEL = { high: '高', medium: '中', low: '低' };
  Object.keys(config.QUALITY || {}).forEach((name) => {
    const b = button(QUALITY_LABEL[name] || name);
    b.addEventListener('click', () => {
      state.quality = name;
      bus.emit(EV.QUALITY, { quality: name });
    });
    qualityGrid.appendChild(b);
    qualityBtns.set(name, b);
  });

  // 操作说明
  const helpPanel = el('section', 'xp-panel xp-help');
  helpPanel.dataset.open = window.innerWidth > 820 ? 'true' : 'false';
  const helpHead = el('div', 'xp-hhead');
  helpHead.appendChild(el('span', '', '操作说明'));
  helpHead.appendChild(el('span', '', '▾'));
  helpHead.addEventListener('click', () => {
    helpPanel.dataset.open = helpPanel.dataset.open === 'true' ? 'false' : 'true';
  });
  helpPanel.appendChild(helpHead);
  const helpBody = el('div', 'xp-hbody');
  helpBody.innerHTML =
    '<b>鼠标</b>：左键拖拽旋转 · 右键拖拽平移 · 滚轮缩放<br>' +
    '<b>键盘</b>：1–8 切换八视角 · F 第一人称 · Esc 退出第一人称<br>' +
    '<b>第一人称</b>：WASD / 方向键移动 · Shift 加速 · 鼠标拖动或点击锁定转视角<br>' +
    '<b>选中</b>：点选建筑查看信息，点空白处取消';
  helpPanel.appendChild(helpBody);
  col.appendChild(helpPanel);

  // ---- 中轴导览 -------------------------------------------------------------
  const tourPanel = el('section', 'xp-panel xp-tour');
  tourPanel.appendChild(el('h3', 'xp-title', '中轴导览'));
  const tourNow = el('div', 'xp-now', '南桥 → 南城门 → 主殿 → 后宫 → 御花园');
  tourPanel.appendChild(tourNow);
  const tourRow = el('div', 'xp-row');
  const btnStart = button('开始');
  const btnPause = button('暂停');
  const btnStop = button('退出');
  tourRow.appendChild(btnStart);
  tourRow.appendChild(btnPause);
  tourRow.appendChild(btnStop);
  tourPanel.appendChild(tourRow);
  root.appendChild(tourPanel);

  btnStart.addEventListener('click', () => bus.emit(EV.TOUR, { action: 'start' }));
  btnPause.addEventListener('click', () => {
    const paused = !!(state.tour && state.tour.paused);
    bus.emit(EV.TOUR, { action: paused ? 'resume' : 'pause' });
  });
  btnStop.addEventListener('click', () => bus.emit(EV.TOUR, { action: 'stop' }));

  // ---- 建筑信息面板 ---------------------------------------------------------
  const infoPanel = el('aside', 'xp-panel xp-info');
  root.appendChild(infoPanel);
  const infoName = el('h2', 'xp-name', '—');
  const infoMeta = el('div', 'xp-meta', '悬停或点选一栋建筑');
  const infoDesc = el('div', 'xp-desc', '点击地面上的建筑查看名称、区域、用途与是否可入内；点击空白处取消选中。');
  const infoTag = el('span', 'xp-tag no', '');
  infoTag.style.display = 'none';
  infoPanel.appendChild(infoName);
  infoPanel.appendChild(infoMeta);
  infoPanel.appendChild(infoDesc);
  infoPanel.appendChild(infoTag);

  // ---- 小地图 ---------------------------------------------------------------
  const mapPanel = el('section', 'xp-panel xp-map');
  const B = (layout.ZONES && layout.ZONES.boundary) || { minX: -345, maxX: 345, minZ: -495, maxZ: 495 };
  const domain = { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ };
  const MW = 168;
  const MH = Math.round(MW * (domain.maxZ - domain.minZ) / (domain.maxX - domain.minX));
  const canvas = document.createElement('canvas');
  canvas.width = MW;
  canvas.height = MH;
  mapPanel.appendChild(canvas);
  const statEl = el('div', 'xp-stat', '');
  mapPanel.appendChild(statEl);
  root.appendChild(mapPanel);
  const ctx2d = canvas.getContext('2d');

  function w2m(x, z) {
    const u = (x - domain.minX) / (domain.maxX - domain.minX);
    const v = (domain.maxZ - z) / (domain.maxZ - domain.minZ);
    return [u * MW, v * MH];
  }
  function m2w(px, py) {
    const x = domain.minX + (px / MW) * (domain.maxX - domain.minX);
    const z = domain.maxZ - (py / MH) * (domain.maxZ - domain.minZ);
    return [x, z];
  }

  const zoneOrder = ['forecourt', 'inner', 'west', 'east', 'garden'];
  function zoneAtWorld(x, z) {
    for (const id of zoneOrder) {
      const zn = layout.ZONES[id];
      if (!zn) continue;
      if (x >= zn.minX && x <= zn.maxX && z >= zn.minZ && z <= zn.maxZ) return id;
    }
    return 'boundary';
  }

  function drawMap() {
    const g = ctx2d;
    if (!g) return;
    g.clearRect(0, 0, MW, MH);
    // 护城河 / 外边界底色
    g.fillStyle = 'rgba(20,26,32,.75)';
    g.fillRect(0, 0, MW, MH);
    // 各分区
    for (const id of Object.keys(layout.ZONES)) {
      if (id === 'boundary') continue;
      const zn = layout.ZONES[id];
      const [x0, y0] = w2m(zn.minX, zn.maxZ);
      const [x1, y1] = w2m(zn.maxX, zn.minZ);
      g.fillStyle = hexA(zn.color || '#8a8266', 0.34);
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.strokeStyle = 'rgba(223,161,18,.35)';
      g.lineWidth = 1;
      g.strokeRect(Math.min(x0, x1) + .5, Math.min(y0, y1) + .5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    // 宫墙范围
    const cb = layout.CITY_BOUNDS || { minX: -300, maxX: 300, minZ: -450, maxZ: 450 };
    const [wx0, wy0] = w2m(cb.minX, cb.maxZ);
    const [wx1, wy1] = w2m(cb.maxX, cb.minZ);
    g.strokeStyle = 'rgba(223,161,18,.85)';
    g.lineWidth = 1.4;
    g.strokeRect(Math.min(wx0, wx1) + .5, Math.min(wy0, wy1) + .5, Math.abs(wx1 - wx0), Math.abs(wy1 - wy0));

    // 选中建筑标记
    const selId = state.selectedBuildingId;
    const b = selId ? registry.buildings.get(selId) : null;
    if (b && b.bounds) {
      const cx = (b.bounds.min[0] + b.bounds.max[0]) / 2;
      const cz = (b.bounds.min[2] + b.bounds.max[2]) / 2;
      const [mx, my] = w2m(cx, cz);
      g.fillStyle = '#dfa112';
      g.beginPath();
      g.arc(mx, my, 3, 0, Math.PI * 2);
      g.fill();
    }

    // 相机位置与朝向
    let px = 0; let pz = 0; let fx = 0; let fz = -1;
    if (state.fp && state.fp.active && state.fp.position) {
      px = state.fp.position[0];
      pz = state.fp.position[2];
      const h = state.fp.heading || 0;
      fx = -Math.sin(h);
      fz = -Math.cos(h);
    } else if (rig && rig.getState) {
      const s = rig.getState();
      px = s.position[0];
      pz = s.position[2];
      fx = s.target[0] - px;
      fz = s.target[2] - pz;
      const L = Math.hypot(fx, fz) || 1;
      fx /= L; fz /= L;
    }
    const [cpx, cpy] = w2m(px, pz);
    const [hx, hy] = w2m(px + fx * 60, pz + fz * 60);
    let ang = Math.atan2(hy - cpy, hx - cpx);
    g.save();
    g.translate(cpx, cpy);
    g.rotate(ang);
    g.fillStyle = '#f0e2bb';
    g.beginPath();
    g.moveTo(7, 0);
    g.lineTo(-4, 4);
    g.lineTo(-4, -4);
    g.closePath();
    g.fill();
    g.restore();
  }

  function hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const bl = n & 255;
    return `rgba(${r},${g},${bl},${a})`;
  }

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (MW / r.width);
    const py = (e.clientY - r.top) * (MH / r.height);
    const [x, z] = m2w(px, py);
    const zid = zoneAtWorld(x, z);
    bus.emit(EV.ZONE_FOCUS, { id: ZONE_VIEW[zid] || 'zone.gate-south' });
  });

  // ---- 提示 / 错误 ----------------------------------------------------------
  const toastEl = el('div', 'xp-toast');
  const toastMsg = el('div', 'xp-tmsg', '');
  const toastRow = el('div', 'xp-trow');
  toastEl.appendChild(toastMsg);
  toastEl.appendChild(toastRow);
  root.appendChild(toastEl);
  let toastTimer = 0;
  function toast(msg, ms = 2600, withRetry = false) {
    toastMsg.textContent = msg;
    toastRow.innerHTML = '';
    if (withRetry) {
      const rb = button('重试');
      rb.addEventListener('click', () => { window.location.reload(); });
      toastRow.appendChild(rb);
    }
    toastEl.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    if (ms > 0) toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  // ---- 事件订阅 -------------------------------------------------------------
  const offs = [];
  function on(type, fn) { offs.push(bus.on(type, fn)); }

  on(EV.HOVER, (p = {}) => {
    state.hoveredBuildingId = p.id || null;
    renderInfo();
  });
  on(EV.SELECT, () => renderInfo());
  on(EV.TOUR, (p = {}) => {
    if (typeof p.active === 'boolean') {
      state.tour.active = p.active;
      if (!p.active) state.tour.paused = false;
    }
    if (typeof p.paused === 'boolean') state.tour.paused = p.paused;
    if (p.active && p.list && p.list.length) {
      const vp = registry.viewpoints.get(p.list[0]);
      tourNow.textContent = '第 1 / ' + p.list.length + ' 站 · ' + ((vp && vp.name) || p.list[0]);
    }
    if (p.reason) {
      tourNow.textContent = p.reason === 'view-change' ? '导览已结束' : tourNow.textContent;
    }
    refreshTour();
  });
  on(EV.TOUR_TICK, (p = {}) => {
    const total = (state.tour && state.tour.list && state.tour.list.length) || 0;
    tourNow.textContent = (total ? ('第 ' + (p.index + 1) + ' / ' + total + ' 站 · ') : '') + (p.name || p.id || '');
  });
  on(EV.FP_ENTER, (p = {}) => {
    const vp = p.spawnId ? registry.viewpoints.get(p.spawnId) : null;
    toast('已进入第一人称' + (vp ? '（' + vp.name + '）' : '') + ' · Esc 退出', 2200);
  });
  on(EV.FP_EXIT, () => { toast('已退出第一人称', 1600); });
  on(EV.LOAD_PROGRESS, (p = {}) => {
    const l = p.loading || state.loading || {};
    const total = l.total || 1;
    const pct = Math.round(((l.done || 0) / total) * 100);
    const zn = layout.ZONES[l.zone] ? layout.ZONES[l.zone].name : '';
    statusEl.textContent = '正在营建 ' + zn + ' ' + pct + '%';
    statusEl.style.display = 'block';
  });
  on(EV.READY, (p = {}) => {
    statusEl.textContent = '全城就绪 · ' + (p.buildings || registry.buildings.size) + ' 栋建筑';
    statusEl.style.display = 'block';
    clearTimeout(statusEl._t);
    statusEl._t = setTimeout(() => { statusEl.style.display = 'none'; }, 4200);
  });
  on(EV.ERROR, (p = {}) => {
    const msg = (p && (p.message || p.error || p.msg)) || '资源加载失败';
    toast('加载失败：' + msg + '\n可检查网络或资源路径后重试。', 0, true);
  });
  on(EV.STATS, (p = {}) => {
    const s = p.stats || state.stats || {};
    statEl.textContent = (s.fps ? s.fps + ' fps · ' : '') + (s.calls ? s.calls + ' calls' : '');
  });

  if (typeof cleanups.push === 'function') cleanups.push(() => { offs.forEach((f) => { try { f(); } catch (err) { /* ignore */ } }); });

  // ---- 刷新（轻量 setInterval，只更新 DOM / 2D canvas，不建 rAF 渲染循环） ----
  function renderInfo() {
    const selId = state.selectedBuildingId;
    const id = selId || state.hoveredBuildingId;
    const b = id ? registry.buildings.get(id) : null;
    if (!b) {
      infoName.textContent = '—';
      infoMeta.textContent = '悬停或点选一栋建筑';
      infoDesc.textContent = '点击地面上的建筑查看名称、区域、用途与是否可入内；点击空白处取消选中。';
      infoTag.style.display = 'none';
      return;
    }
    infoName.textContent = b.name || b.id;
    const zn = layout.ZONES[b.zone] ? layout.ZONES[b.zone].name : (b.zone || '');
    infoMeta.textContent = zn + (selId ? ' · 已选中' : ' · 指向');
    infoDesc.textContent = b.info || '（暂无说明）';
    infoTag.style.display = 'inline-block';
    if (b.visitable) {
      infoTag.textContent = '可入内参观';
      infoTag.className = 'xp-tag ok';
    } else {
      infoTag.textContent = '此建筑不可进入';
      infoTag.className = 'xp-tag no';
    }
  }

  function refreshTour() {
    const active = !!(state.tour && state.tour.active);
    const paused = !!(state.tour && state.tour.paused);
    btnStart.disabled = active && !paused;
    btnPause.disabled = !active;
    btnStop.disabled = !active;
    btnPause.querySelector('.xp-btn-label').textContent = paused ? '继续' : '暂停';
    if (!active) tourNow.textContent = '南桥 → 南城门 → 主殿 → 后宫 → 御花园';
  }

  function refreshActive() {
    const vm = state.viewMode;
    for (const [id, b] of viewBtns) b.classList.toggle('on', id === vm);
    const zid = (vm === 'zone' && state.viewId) ? Object.keys(ZONE_VIEW).find((k) => ZONE_VIEW[k] === state.viewId) : null;
    for (const [id, b] of zoneBtns) {
      b.classList.toggle('on', id === zid || (id === 'city' && vm === 'oblique'));
    }
    for (const [name, b] of timeBtns) b.classList.toggle('on', name === state.timePreset);
    for (const [name, b] of qualityBtns) b.classList.toggle('on', name === state.quality);
    fpBtn.style.display = (state.fp && state.fp.active) ? 'flex' : 'none';
  }

  function refresh() {
    refreshActive();
    refreshTour();
    drawMap();
  }

  renderInfo();
  refresh();
  let timer = 0;
  if (hidden) {
    root.style.display = 'none';
  } else {
    timer = setInterval(refresh, 120);
  }
  cleanups.push(() => { if (timer) clearInterval(timer); });

  return {
    dispose() {
      clearInterval(timer);
      for (const fn of cleanups) { try { fn(); } catch (err) { /* ignore */ } }
      cleanups.length = 0;
      if (root.parentNode) root.parentNode.removeChild(root);
      if (style.parentNode) style.parentNode.removeChild(style);
    }
  };
}
