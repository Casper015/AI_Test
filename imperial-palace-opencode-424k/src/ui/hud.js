/**
 * 紫禁天朝 · HUD 与信息面板（G 交互）
 * 视角切换器（1–8）、分区跳转、时辰、质量、建筑信息、导览控制、加载与错误状态。
 */

import { VIEW_MODES, TIME_PRESETS, QUALITY, VERSION } from '../shared/config.js';
import { createMinimap } from './minimap.js';

export function createHud(opts) {
  const { events, layout, state } = opts;
  const el = (tag, cls, html) => {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  };
  const app = document.getElementById('app');

  const title = el('div', 'hud', '<div class="seal">禁</div><div><h1>紫禁天朝</h1><small>IMPERIAL PALACE · ' + VERSION + '</small></div>');
  title.id = 'title';
  app.appendChild(title);

  const topRight = el('div', 'hud');
  topRight.id = 'topright';
  const timeGroup = el('div', 'panel group', '<span>时辰</span>');
  const timeRow = el('div', 'row');
  for (const id of Object.keys(TIME_PRESETS)) {
    const b = el('button', id === 'day' ? 'on' : '', TIME_PRESETS[id].name);
    b.dataset.time = id;
    b.addEventListener('click', () => events.emit('request-time', id));
    timeRow.appendChild(b);
  }
  timeGroup.appendChild(timeRow);
  const qGroup = el('div', 'panel group', '<span>质量</span>');
  const qRow = el('div', 'row');
  for (const id of Object.keys(QUALITY)) {
    const b = el('button', id === 'high' ? 'on' : '', QUALITY[id].name);
    b.dataset.quality = id;
    b.addEventListener('click', () => events.emit('request-quality', id));
    qRow.appendChild(b);
  }
  qGroup.appendChild(qRow);
  topRight.appendChild(timeGroup);
  topRight.appendChild(qGroup);
  app.appendChild(topRight);

  const views = el('div', 'hud panel');
  views.id = 'views';
  views.appendChild(el('h2', '', '视角模式'));
  const vitems = {};
  for (const v of VIEW_MODES) {
    const item = el('div', 'vitem', '<i>' + v.key + '</i><span>' + v.name + '</span><em>' + v.hint + '</em>');
    item.dataset.mode = v.id;
    item.addEventListener('click', () => events.emit('request-view', v.id));
    views.appendChild(item);
    vitems[v.id] = item;
  }
  app.appendChild(views);

  const zones = el('div', 'hud panel');
  zones.id = 'zones';
  zones.appendChild(el('h2', '', '分区跳转'));
  const zrow = el('div', 'row');
  const zoneButtons = [['all', '全城'], ['B', '前朝'], ['B-main', '主殿'], ['C', '后宫'], ['D', '西宫苑'], ['E', '东宫苑'], ['F', '御花园']];
  for (const [id, name] of zoneButtons) {
    const b = el('button', '', name);
    b.dataset.zone = id;
    b.addEventListener('click', () => events.emit('request-zone', id));
    zrow.appendChild(b);
  }
  zones.appendChild(zrow);
  app.appendChild(zones);

  const info = el('div', 'hud panel');
  info.id = 'info';
  app.appendChild(info);

  const bottom = el('div', 'hud');
  bottom.id = 'bottom';
  const hint = el('div', 'panel', '<b>1–8</b> 切换视角 · <b>F</b> 第一人称 · <b>Esc</b> 释放指针 · <b>T</b> 中轴导览 · 点击建筑查看');
  hint.id = 'hint';
  bottom.appendChild(hint);
  const tourbar = el('div', 'panel');
  tourbar.id = 'tourbar';
  const mkBtn = (label, action) => {
    const b = el('button', '', label);
    b.addEventListener('click', () => events.emit('request-tour', action));
    tourbar.appendChild(b);
    return b;
  };
  mkBtn('上一站', 'prev');
  mkBtn('暂停', 'pause');
  mkBtn('继续', 'resume');
  mkBtn('下一站', 'next');
  mkBtn('退出导览', 'exit');
  bottom.appendChild(tourbar);
  app.appendChild(bottom);
  const tourtext = el('div', 'panel hud');
  tourtext.id = 'tourtext';
  app.appendChild(tourtext);
  const cross = el('div', 'hud');
  cross.id = 'cross';
  app.appendChild(cross);
  const tooltip = el('div', '', '');
  tooltip.id = 'tooltip';
  app.appendChild(tooltip);

  const mapwrap = el('div', 'hud panel');
  mapwrap.id = 'mapwrap';
  const mapCanvas = el('canvas');
  mapCanvas.id = 'map';
  const legend = el('div', 'legend', '<span><b>点击</b> 定位院落</span><span><b>◆</b> 当前位置</span>');
  mapwrap.appendChild(mapCanvas);
  mapwrap.appendChild(legend);
  app.appendChild(mapwrap);

  const loading = el('div', '');
  loading.id = 'loading';
  loading.innerHTML = '<div class="box"><div class="seal">禁</div><h1>紫禁天朝</h1><p>COMPLETE IMPERIAL PALACE</p><div id="bar"><i></i></div><div id="status">准备宫城…</div></div>';
  app.appendChild(loading);

  const error = el('div', 'panel');
  error.id = 'error';
  error.innerHTML = '<h3>加载中断</h3><p id="errmsg"></p><div class="row"><button id="retry">重试</button></div>';
  app.appendChild(error);
  error.querySelector('#retry').addEventListener('click', () => location.reload());

  const minimap = createMinimap({ canvas: mapCanvas, layout, events, state });

  function setLoading(phase, progress, message) {
    const bar = loading.querySelector('#bar i');
    const status = loading.querySelector('#status');
    if (bar) bar.style.width = Math.round((progress || 0) * 100) + '%';
    if (status) status.textContent = message || phase;
  }
  function finishLoading() {
    loading.classList.add('done');
    setTimeout(() => { loading.style.display = 'none'; }, 700);
  }
  function showError(msg) {
    error.classList.add('show');
    error.querySelector('#errmsg').textContent = msg;
  }

  function setViewMode(mode) {
    for (const k of Object.keys(vitems)) vitems[k].classList.toggle('on', k === mode);
  }
  function setTimePreset(id) {
    for (const b of timeRow.children) b.classList.toggle('on', b.dataset.time === id);
  }
  function setQuality(id) {
    for (const b of qRow.children) b.classList.toggle('on', b.dataset.quality === id);
  }
  function setInfo(building) {
    if (!building) { info.classList.remove('show'); return; }
    info.classList.add('show');
    const cat = {
      mainHall: '主殿', gateMain: '宫城正门', gateHall: '门殿', sideHall: '配殿 · 院落主屋',
      sideHouse: '厢房', sidePavilion: '楼阁', pavilion: '亭', squareHall: '方殿', bedChamber: '寝殿',
      cornerTower: '角楼', tower: '楼', gardenHall: '园殿', gateSmall: '院门'
    }[building.category] || '建筑';
    info.innerHTML =
      '<div class="name">' + building.name + '</div>' +
      '<div class="cat">' + cat + ' · ' + building.zone + ' 区</div>' +
      '<div class="desc">' + (building.info || '') + '</div>' +
      (building.visitable ? '<div class="cat" style="color:#8ff0a8">可进入</div>' : '<div class="lock">此建筑不可进入，仅供外观观赏</div>') +
      '<div class="row"><button id="btn-focus">建筑近景</button><button id="btn-interior">' + (building.visitable ? '进入内景' : '室内视角') + '</button><button id="btn-fp">走到附近</button></div>';
    info.querySelector('#btn-focus').addEventListener('click', () => events.emit('request-focus', building.id));
    info.querySelector('#btn-interior').addEventListener('click', () => events.emit('request-interior', building.zone));
    info.querySelector('#btn-fp').addEventListener('click', () => events.emit('request-fp', building.id));
  }
  function setTooltip(building, x, y) {
    if (!building) { tooltip.style.display = 'none'; return; }
    tooltip.style.display = 'block';
    tooltip.textContent = building.name + (building.visitable ? ' · 可进入' : '');
    tooltip.style.left = Math.min(window.innerWidth - 180, x + 14) + 'px';
    tooltip.style.top = (y + 14) + 'px';
  }
  function setTour(stateName, stop) {
    tourbar.classList.toggle('show', stateName !== 'idle');
    if (stop) {
      tourtext.classList.add('show');
      tourtext.textContent = stop.text;
    } else {
      tourtext.classList.remove('show');
    }
  }
  function setFp(active) {
    cross.classList.toggle('on', active);
    hint.innerHTML = active
      ? '<b>WASD</b> 行走 · <b>Shift</b> 疾走 · 点击锁定鼠标环视 · <b>Esc</b> 释放 · <b>F</b> 退出第一人称'
      : '<b>1–8</b> 切换视角 · <b>F</b> 第一人称 · <b>Esc</b> 释放指针 · <b>T</b> 中轴导览 · 点击建筑查看';
  }
  const statsline = el('div', 'legend');
  mapwrap.appendChild(statsline);
  function setStats(stats) {
    if (!stats) { statsline.textContent = ''; return; }
    statsline.innerHTML = '<span><b>' + stats.calls + '</b> draw</span><span><b>' +
      Math.round(stats.triangles / 1000) + 'k</b> tri</span><span><b>' + stats.fps + '</b> fps</span>' +
      '<span><b>' + stats.buildingCount + '</b> 建筑</span><span><b>' + stats.courtyardCount + '</b> 院落</span>';
  }

  return {
    setLoading, finishLoading, showError, setViewMode, setTimePreset, setQuality,
    setInfo, setTooltip, setTour, setFp, setStats, minimap, el
  };
}

export default createHud;
