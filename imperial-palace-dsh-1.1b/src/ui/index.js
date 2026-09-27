/**
 * G 区 UI 装配（计划 §6.2、§3.1 UI 规范）。
 *
 * 全部 DOM 由本模块在 `#app` 内的 `#palace-ui` 层里构建（不改 `index.html`，不引入 UI 框架）：
 *   HUD · 八视角切换器 · 七分区跳转 · 建筑信息面板 · 中轴导览控件 · 小地图 ·
 *   加载进度/失败与重试 · 操作提示 · 三时辰 · 质量选项 · 回到全城 · 建筑标签层 · 提示条
 *
 * 三条硬约束：
 *   1. **状态只读**：所有交互都经 `interaction.requester` 发 §7.2 请求事件，UI 不缓存任何视图状态；
 *   2. **隐藏义务**（CONTRACTS §11.3）：`?ui=0` 或 `?shot=1` → 根层 `hidden` + `pointer-events:none`
 *      + `interaction.setPickEnabled(false)`（隐藏时完全不参与命中检测）；
 *   3. 每帧更新（标签定位、小地图重绘、提示条淡出）由传入的 `update(dt)` 驱动，不自建循环。
 */

import * as THREE from 'three';
import { CONFIG, UI, EVENTS } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
import { VIEW_LABELS, ZONE_BUTTONS, TIME_PRESETS, TIME_LABELS, QUALITY_ORDER, QUALITY_LABELS } from '../interaction/requests.js';
import { helpKeyList, TOUCH_SUPPORT_NOTE } from '../interaction/keymap.js';
import { h, append, clear, button, collapsiblePanel, setOwnerDocument } from './dom.js';
import { cssVariables, TRANSITION_MS, MINIMAP, assertTokens } from './tokens.js';
import { createInteraction } from '../interaction/index.js';
import { planLabels } from './labels.js';
import { planMinimap, drawMinimap, zoneAreaAt } from './minimap.js';

const STYLE_ID = 'palace-ui-styles';
const TOKEN_STYLE_ID = 'palace-ui-tokens';

/** 注入样式表（幂等）。使用相对模块 URL，产物内不出现绝对路径。 */
export function ensureStyles({ doc = typeof document !== 'undefined' ? document : null } = {}) {
  if (!doc?.head) return false;
  setOwnerDocument(doc);
  if (!doc.getElementById(TOKEN_STYLE_ID)) {
    const style = h('style', { id: TOKEN_STYLE_ID, text: `:root{${Object.entries(cssVariables())
      .map(([key, value]) => `${key}:${value}`)
      .join(';')}}` });
    doc.head.appendChild(style);
  }
  if (!doc.getElementById(STYLE_ID)) {
    const link = h('link', { id: STYLE_ID, attrs: { rel: 'stylesheet' } });
    link.href = new URL('./styles.css', import.meta.url).href;
    doc.head.appendChild(link);
  }
  return true;
}

/**
 * 创建 UI。
 * @param {{
 *   api: object, interaction: object, container?: object|null, query?: object,
 *   config?: object, layout?: object, document?: object|null, window?: object|null
 * }} params
 */
export function createUI({
  api,
  interaction,
  container = typeof document !== 'undefined' ? document.getElementById('app') ?? document.body : null,
  query = {},
  config = CONFIG,
  layout = LAYOUT,
  document: doc = typeof document !== 'undefined' ? document : null,
  window: win = typeof window !== 'undefined' ? window : null,
} = {}) {
  if (!api || !interaction) throw new Error('createUI 需要 core API 与 interaction 句柄');
  if (!doc?.createElement) throw new Error('createUI 需要 DOM 环境');
  const { events, store, rig } = api;
  setOwnerDocument(doc);
  const spacingProblems = assertTokens(Object.values(UI.spacing));
  if (spacingProblems.length > 0) throw new Error(`UI 间距违反 §3.1：${spacingProblems.join('；')}`);

  ensureStyles({ doc });

  const host = container ?? doc.body;
  const refs = { labels: new Map(), toastTimer: 0, minimapAccum: 0, lastSnapshot: null, helpExpanded: false, minimapCollapsed: true };
  /** t7：可折叠面板登记（唯一状态源 = collapsiblePanel；stats() 逐面板回报折叠态） */
  const collapsibles = [];
  const registerCollapsible = (id, section) => { collapsibles.push({ id, section }); return section; };
  const disposers = [];

  /* ------------------------------------------------------------------ 根层 */
  const root = h('div', { id: 'palace-ui', attrs: { 'data-palace-ui': 'root', role: 'application', 'aria-label': '紫禁天朝操作面板' } });

  const colTL = h('div', { class: 'palace-col palace-col--tl', attrs: { 'data-ui-region': 'left-column' } });
  const colTR = h('div', { class: 'palace-col palace-col--tr', attrs: { 'data-ui-region': 'sidebar' } });
  const colBL = h('div', { class: 'palace-col palace-col--bl' });
  const colBC = h('div', { class: 'palace-col palace-col--bc', attrs: { 'data-ui-region': 'bottom-center' } });
  const labelLayer = h('div', { class: 'palace-labels', attrs: { 'data-ui-panel': 'labels' } });
  append(root, [colTL, colTR, colBL, colBC, labelLayer]);
  host.appendChild(root);

  /* ------------------------------------------------------------------ 品牌 + HUD */
  const brand = h('div', { class: 'palace-brand', attrs: { 'data-ui-panel': 'brand' } }, [
    h('span', { class: 'palace-brand__seal', text: '宫' }),
    h('div', {}, [h('h1', { class: 'palace-brand__name', text: '紫禁天朝' }), h('div', { class: 'palace-brand__sub', text: '明清官式 · 完整宫城沙盘' })]),
  ]);
  const hudRows = {
    view: h('span', { class: 'palace-hud__value', text: '—' }),
    zone: h('span', { class: 'palace-hud__value', text: '—' }),
    time: h('span', { class: 'palace-hud__value', text: '—' }),
    quality: h('span', { class: 'palace-hud__value', text: '—' }),
    position: h('span', { class: 'palace-hud__value', text: '—' }),
    load: h('span', { class: 'palace-hud__value', text: '—' }),
  };
  const hudRow = (label, value) => h('div', { class: 'palace-hud__row' }, [h('span', { class: 'palace-hud__key', text: label }), value]);
  // t59：HUD 压缩为 4 行（分区并入位置、加载仅在加载中出现），把左列高度预算让给建筑详情面板
  const hudLoadRow = hudRow('加载', hudRows.load);
  hudLoadRow.hidden = true;
  /* t7：所有内容型 HUD 面板统一「默认折叠 + 箭头」（可点击 / Tab 可达 / Enter·Space 可切换，aria-expanded 如实反映） */
  const hudSec = collapsiblePanel({ id: 'hud', title: '状态', panelClass: 'palace-panel palace-hud' }, [
    hudRow('视角', hudRows.view),
    hudRow('时辰', hudRows.time),
    hudRow('质量', hudRows.quality),
    hudRow('位置', hudRows.position),
    hudLoadRow,
  ]);
  const hud = hudSec.panel;
  registerCollapsible('hud', hudSec);

  /* ------------------------------------------------------------------ 八视角切换器 */
  const viewButtons = new Map();
  const viewGrid = h('div', { class: 'palace-grid palace-grid--views' });
  config.CAMERA.viewModes.forEach((entry) => {
    const label = h('span', { class: 'palace-viewswitcher__label', text: entry.label });
    const btn = button('', {
      variant: 'default',
      title: `${entry.index} · ${entry.label}（键盘 ${entry.index}）`,
      attrs: { 'data-view-mode': entry.mode, 'data-view-index': String(entry.index) },
      on: { click: () => requestViewFromUser(entry.mode, 'view-button') },
    });
    append(btn, [h('span', { class: 'palace-btn__index', text: String(entry.index) }), label]);
    viewButtons.set(entry.mode, btn);
    viewGrid.appendChild(btn);
  });
  const viewSection = collapsiblePanel({ id: 'views', title: '视角（1–8）' }, [
    viewGrid,
    h('div', { class: 'palace-hint', text: '键盘 1–8、按钮与 F 走同一条请求事件' }),
  ]);
  const viewPanel = viewSection.panel;
  registerCollapsible('views', viewSection);

  /* ------------------------------------------------------------------ 七分区跳转 */
  const zoneButtons = new Map();
  const zoneGrid = h('div', { class: 'palace-grid palace-grid--zones' });
  ZONE_BUTTONS.forEach((entry) => {
    const btn = button(entry.label, {
      title: `${entry.label}（平滑过渡）`,
      attrs: { 'data-zone': entry.id },
      on: {
        click: () => {
          tourTakeover('zone-button');
          if (entry.buildingId) interaction.requester.focusBuilding(entry.buildingId);
          else interaction.requester.zone(entry.area);
        },
      },
    });
    zoneButtons.set(entry.id, btn);
    zoneGrid.appendChild(btn);
  });
  const resetButton = button('回到全城', {
    variant: 'primary',
    title: '回到全城鸟瞰（键盘 R）',
    attrs: { 'data-action': 'reset' },
    on: {
      click: () => {
        tourTakeover('reset-button');
        interaction.requester.reset();
      },
    },
  });
  const zoneSection = collapsiblePanel({ id: 'zones', title: '分区' }, [
    zoneGrid,
    h('div', { class: 'palace-row' }, [resetButton]),
  ]);
  const zonePanel = zoneSection.panel;
  registerCollapsible('zones', zoneSection);

  /* ------------------------------------------------------------------ 三时辰 / 质量档 */
  const timeButtons = new Map();
  const timeRow = h('div', { class: 'palace-row' });
  TIME_PRESETS.forEach((preset) => {
    const btn = button(TIME_LABELS[preset] ?? preset, {
      attrs: { 'data-time-preset': preset },
      on: { click: () => interaction.requester.timePreset(preset) },
    });
    timeButtons.set(preset, btn);
    timeRow.appendChild(btn);
  });
  const qualityButtons = new Map();
  const qualityRow = h('div', { class: 'palace-row' });
  QUALITY_ORDER.forEach((tier) => {
    const btn = button(QUALITY_LABELS[tier] ?? tier, {
      attrs: { 'data-quality-tier': tier },
      on: { click: () => interaction.requester.quality(tier) },
    });
    qualityButtons.set(tier, btn);
    qualityRow.appendChild(btn);
  });
  const envSection = collapsiblePanel({ id: 'env', title: '时辰 / 质量' }, [
    h('div', { class: 'palace-hint', text: '时辰' }),
    timeRow,
    h('div', { class: 'palace-hint', text: '质量（键盘 Y 轮转）' }),
    qualityRow,
  ]);
  const envPanel = envSection.panel;
  registerCollapsible('env', envSection);

  /* ------------------------------------------------------------------ 中轴导览 */
  const tourText = h('p', { class: 'palace-tour__text', text: '中轴导览：南桥 → 南城门 → 礼仪广场 → 主殿 → 金銮殿 → 内廷门 → 寝殿 → 御花园' });
  const tourDots = h('div', { class: 'palace-tour__dots', attrs: { 'data-ui-part': 'tour-dots' } });
  const tourButtons = {
    start: button('开始', { variant: 'primary', on: { click: () => interaction.tour.start(0) } }),
    pause: button('暂停', { on: { click: () => interaction.tour.pause('ui') } }),
    resume: button('继续', { on: { click: () => interaction.tour.resume() } }),
    stop: button('退出', { variant: 'ghost', on: { click: () => interaction.tour.stop() } }),
    next: button('下一点', { variant: 'ghost', on: { click: () => interaction.tour.next() } }),
  };
  const tourSection = collapsiblePanel({ id: 'tour', title: '中轴导览' }, [
    tourDots,
    tourText,
    h('div', { class: 'palace-row' }, [tourButtons.start, tourButtons.pause, tourButtons.resume, tourButtons.next, tourButtons.stop]),
    h('div', { class: 'palace-hint', text: '导览中手动操作相机（拖动/滚轮/切视角）会自动暂停' }),
  ]);
  const tourPanel = tourSection.panel;
  registerCollapsible('tour', tourSection);

  /* ------------------------------------------------------------------ 小地图 */
  const minimapCanvas = h('canvas', {
    class: 'palace-minimap__canvas',
    attrs: { 'data-ui-part': 'minimap', width: String(MINIMAP.size), height: String(MINIMAP.size), role: 'img' },
  });
  minimapCanvas.width = MINIMAP.size;
  minimapCanvas.height = MINIMAP.size;
  const minimapNote = h('div', { class: 'palace-minimap__note', text: '点按分区定位 · 金点 = 当前位置' });
  const minimapSection = collapsiblePanel({ id: 'minimap', title: '小地图', panelClass: 'palace-panel palace-minimap' }, [minimapCanvas, minimapNote]);
  const minimapPanel = minimapSection.panel;
  registerCollapsible('minimap', minimapSection);
  minimapCanvas.addEventListener?.('click', (event) => {
    const rect = minimapCanvas.getBoundingClientRect?.() ?? { left: 0, top: 0, width: MINIMAP.size, height: MINIMAP.size };
    const scaleX = MINIMAP.size / Math.max(1, rect.width);
    const scaleY = MINIMAP.size / Math.max(1, rect.height);
    const plan = currentMinimapPlan();
    const area = zoneAreaAt(plan, ((event.clientX ?? 0) - rect.left) * scaleX, ((event.clientY ?? 0) - rect.top) * scaleY);
    tourTakeover('minimap');
    if (area === 'city') interaction.requester.reset();
    else interaction.requester.zone(area);
  });


  append(colBL, [minimapPanel]);

  /* ------------------------------------------------------------------ 操作提示 */
  const helpList = h('ul', { class: 'palace-help__list' });
  helpKeyList().forEach((row) => {
    helpList.appendChild(h('li', { attrs: { 'data-ui-part': 'help-row' } }, [h('span', { class: 'palace-help__key', text: row.code }), h('span', { text: row.label })]));
  });
  // t7：helpBody 由 collapsiblePanel 统一提供（见下方 helpSection），此处不再另建一份 DOM
  const helpSection = collapsiblePanel({ id: 'help', title: '操作提示' }, [helpList, h('p', { class: 'palace-help__touch', text: TOUCH_SUPPORT_NOTE, attrs: { 'data-ui-part': 'help-touch' } })]);
  const helpPanel = helpSection.panel;
  // 兼容钩子：既有 consumers 通过 [data-ui-part="help-body"] 找到内容体（折叠箭头成为唯一切换入口）
  const helpToggle = helpSection.toggle;
  registerCollapsible('help', helpSection);

  /* ------------------------------------------------------------------ 加载 / 失败 / 重试 */
  const loadTitle = h('span', { class: 'palace-loading__stage', text: '准备中' });
  const loadFill = h('div', { class: 'palace-loading__fill', attrs: { 'data-ui-part': 'loading-fill' } });
  const loadBar = h('div', { class: 'palace-loading__bar' }, [loadFill]);
  const loadError = h('div', { class: 'palace-loading__error', text: '', attrs: { 'data-ui-part': 'loading-error' } });
  const retryButton = button(UI.loading.failureRetryLabel, {
    variant: 'seal',
    attrs: { 'data-action': 'retry' },
    on: {
      click: () => {
        loadError.textContent = '正在重试…';
        Promise.resolve(api.retryFailedZones?.()).catch((error) => {
          loadError.textContent = `重试失败：${error?.message ?? error}`;
        });
      },
    },
  });
  retryButton.hidden = true;
  const loadingSection = collapsiblePanel({ id: 'loading', title: '加载' }, [
    /**
     * t7：折叠头用**静态**标题（"加载"），动态阶段文本留在内容体里 ——
     * 否则折叠态会把内部计数当标题展示（实测截图出现过 `lamps:152 (152/152)` 这种"标题泄漏"）。
     */
    h('div', { class: 'palace-loading__stage-row' }, [loadTitle]),
    loadBar,
    loadError,
    h('div', { class: 'palace-row' }, [retryButton]),
  ]);
  const loadingPanel = loadingSection.panel;
  registerCollapsible('loading', loadingSection);

  /* ------------------------------------------------------------------ 建筑详情面板（t59：左上角，品牌/HUD 之下同列） */
  // t7：折叠头标题用 span（`titleTag` 默认 span）——若用 h2 会形成 h2 套 h2（非法嵌套 ⇒ 浏览器重排导致箭头与标题分行的视觉缺陷）
  const infoName = h('span', { class: 'palace-info__name', attrs: { 'data-ui-part': 'info-name' }, text: '' });
  const infoVisit = h('span', { class: 'palace-info__tag', attrs: { 'data-ui-part': 'info-visit' }, text: '' });
  const infoUsage = h('p', { class: 'palace-info__text', attrs: { 'data-ui-part': 'info-usage' }, text: '' });
  const infoMeta = h('p', { class: 'palace-info__text', attrs: { 'data-ui-part': 'info-meta' }, text: '' });
  const infoSpec = h('p', { class: 'palace-info__text', attrs: { 'data-ui-part': 'info-spec' }, text: '' });
  const infoSize = h('p', { class: 'palace-info__text', attrs: { 'data-ui-part': 'info-size' }, text: '' });
  const infoNote = h('p', { class: 'palace-info__text', attrs: { 'data-ui-part': 'info-note' }, text: '' });
  const infoFHint = h('div', { class: 'palace-hint', attrs: { 'data-ui-part': 'info-f' }, text: '' });
  const infoNear = button('近景', {
    attrs: { 'data-ui-part': 'info-near' },
    on: { click: () => store.state.selectedBuildingId && interaction.requester.focusBuilding(store.state.selectedBuildingId) },
  });
  const infoInterior = button('进入内景（F）', {
    variant: 'primary',
    attrs: { 'data-ui-part': 'info-interior' },
    on: {
      click: () => {
        // 与 F 键同一条实现：机位由 catalog 从区/布局数据推导（不再只写 area）
        interaction.enterInterior(store.state.selectedBuildingId, 'panel:interior');
      },
    },
  });
  const infoFp = button('走过去（第一人称）', {
    variant: 'ghost',
    attrs: { 'data-ui-part': 'info-fp' },
    on: {
      click: () => {
        tourTakeover('fp-button');
        interaction.requester.viewMode('fp');
      },
    },
  });
  const infoClose = button('关闭', { variant: 'ghost', attrs: { 'data-ui-part': 'info-close' }, on: { click: () => interaction.select(null, 'panel') } });
  const infoSection = collapsiblePanel({ id: 'info', title: infoName, panelClass: 'palace-panel palace-info' }, [
    h('div', { class: 'palace-row' }, [infoVisit]),
    infoUsage,
    infoMeta,
    infoSpec,
    infoSize,
    infoNote,
    infoFHint,
    h('div', { class: 'palace-row' }, [infoFp, infoNear, infoInterior, infoClose]),
  ]);
  const infoPanel = infoSection.panel;
  infoPanel.hidden = true; // 未选中建筑时整块不出现（选中后默认仍是**折叠**态，标题即建筑名）
  registerCollapsible('info', infoSection);

  /* ------------------------------------------------------------------ 提示条 */
  /**
   * t87/t123：防卡死兜底条 —— 连续受阻 ≥ `stuckSeconds` 时出现，提供**一键**返回**最近的已登记出生点**
 * （文案与实现一致：实现即 `registry.nearestFpSpawn(卡死点)`；不写「安全点」以免与实现不符）。
   * 只在真正的"走不动"时显示（由 interaction.traversalState() 驱动），`?ui=0&shot=1` 下整个 root 隐藏故自动消失。
   */
  const stuckText = h('span', { class: 'palace-stuck__text', text: '' });
  const stuckButton = button('返回最近的已登记出生点（G）', {
    variant: 'primary',
    attrs: { 'data-ui-part': 'escape', title: '确定性回到最近的已登记出生点（不会穿墙）' },
    on: { click: () => interaction.escapeToSafePoint('panel:escape') },
  });
  const stuckPanel = h('div', { class: 'palace-panel palace-stuck', attrs: { 'data-ui-panel': 'stuck' } }, [
    h('div', { class: 'palace-stuck__head', text: '好像卡住了' }),
    stuckText,
    stuckButton,
  ]);
  stuckPanel.hidden = true;

  const toast = h('div', { class: 'palace-toast', attrs: { 'data-ui-panel': 'toast', role: 'status' } }, [
    h('div', { class: 'palace-toast__title', text: '' }),
    h('div', { class: 'palace-toast__detail', text: '' }),
  ]);
  const toastTitle = toast.firstChild;
  const toastDetail = toast.lastChild;

  /* ------------------------------------------------------------------ 右侧列装配（单列可滚动：任何视口都不重叠） */
  /* ------------------------------------------------------------------ 列装配（t59：详情面板进左列 = 品牌/HUD 之下同列） */
  append(colTL, [brand, hud, infoPanel]);
  append(colTR, [viewPanel, zonePanel, envPanel, loadingPanel, helpPanel]);
  // t59：中轴导览移到下方中央列（原本与左下小地图同列，加上详情面板后 1440×900 会与左列相撞）
  append(colBC, [tourPanel, stuckPanel, toast]);

  /* ------------------------------------------------------------------ 交互辅助 */
  function tourTakeover(reason) {
    interaction.tour.notifyTakeover(reason);
  }

  function requestViewFromUser(mode, source) {
    tourTakeover(source);
    interaction.requester.viewMode(mode);
  }

  /**
   * t7：H 键与箭头走**同一个**折叠状态机（不再是两套 hidden 逻辑）。
   * `force` 语义保持向后兼容：`toggleHelp(false)` = 折叠，`toggleHelp(true)` = 展开，缺省 = 切换。
   * 返回值 = 展开后为 true（与旧实现一致），供既有调用方/断言使用。
   */
  function toggleHelp(force = null) {
    if (force === null) helpSection.setCollapsed(!helpSection.isCollapsed());
    else helpSection.setCollapsed(!force);
    syncHelpNote();
    return !helpSection.isCollapsed();
  }

  /**
   * t7：M 键 = 切换小地图**折叠**（与箭头同一个状态机；不再用"整块 hidden"这一套平行语义）。
   * 折叠态仍保留折叠头（含"小地图"标题与箭头）⇒ 用户始终知道它在哪里、怎么展开。
   */
  function toggleMinimap(force = null) {
    if (force === null) minimapSection.setCollapsed(!minimapSection.isCollapsed());
    else minimapSection.setCollapsed(!force);
    const collapsed = minimapSection.isCollapsed();
    minimapNote.textContent = collapsed ? '点按分区定位 · 金点 = 当前位置（按 M 或点箭头展开）' : '点按分区定位 · 金点 = 当前位置';
    refs.minimapCollapsed = collapsed;
    return !collapsed;
  }

  /** 折叠状态变化时同步 M/H 相关提示文案（折叠面板唯一状态源 = collapsiblePanel）。 */
  function syncHelpNote() {
    refs.helpExpanded = !helpSection.isCollapsed();
    return refs.helpExpanded;
  }

  function showToast(hint) {
    if (!hint) return;
    toastTitle.textContent = hint.title ?? '';
    toastDetail.textContent = hint.detail ?? '';
    toast.classList.add('is-visible');
    refs.toastTimer = Math.max(1.2, (TRANSITION_MS * 20) / 1000);
  }

  /**
   * 详情面板文案（t59）。字段全部来自 catalog（建筑槽位 + config/layout 派生），
   * 不在 UI 里写死任何建筑数值：尺寸由 bounds 推导，等级/屋顶名取自 config.GRADES / config.ROOF_TYPES。
   */
  /**
   * 详情面板文案（t59 建、t80/F7 修）。字段全部来自 catalog（建筑槽位 + config/layout 派生），
   * 不在 UI 里写死任何建筑数值：尺寸由 bounds 推导，等级/屋顶名取自 config.GRADES / config.ROOF_TYPES。
   *
   * **高度口径（F7）**：只把**实测**高度当权威展示并标注"实测"（`userData.kit.worldBounds` 的 Box3 高度，
   * 经 `catalog.detail().heightMeasured` 传出）；没有实测时才降级为显式标注的"约 …（估值）"。
   * 这里**不得**直接消费 layout 槽位的估值高度字段（与 kit 举架真值中位差 26.7%，CONTRACTS §4.1）。
   */
  function infoTextFor(info, detail) {
    if (!info) return null;
    const d = detail ?? {};
    const kindZh = { hall: '殿堂', gateHall: '宫门', sideHall: '配殿/厢房', pavilion: '亭阁', cornerTower: '角楼', courtyardGate: '院门' }[info.kind] ?? info.kind ?? '';
    const sizeParts = [];
    if (d.width !== null && d.width !== undefined) sizeParts.push(`${d.width} × ${d.depth} m（平面）`);
    if (d.areaM2) sizeParts.push(`占地 ${d.areaM2} m²`);
    if (d.terraceH ? d.terraceH > 0 : false) sizeParts.push(`台基 ${d.terraceH} m`);
    // 实测优先：只有实测高度才作为权威展示；估值仅在无实测时降级出现且必须带"估值"字样
    if (d.heightMeasured !== null && d.heightMeasured !== undefined) {
      sizeParts.push(`脊高 ${d.heightMeasured} m（实测）`);
    } else if (d.heightEstimated) {
      sizeParts.push(`脊高约 ${d.heightEstimated} m（估值）`);
    }
    const specParts = [
      kindZh ? `形制：${kindZh}` : '',
      d.roofLabel ? `屋顶：${d.roofLabel}` : '',
      d.grade !== null && d.grade !== undefined ? `等级：${d.grade} 级${d.gradeIsTop ? '（最高）' : d.gradeIsLowest ? '（最低）' : ''}${d.gradeEaveFactor ? ` · 檐高系数 ${d.gradeEaveFactor}` : ''}` : '',
      d.bays ? `${d.bays} 开间` : '',
      d.facing ? `朝向：${{ south: '南', north: '北', east: '东', west: '西' }[d.facing] ?? d.facing}` : '',
    ];
    const whereParts = [d.zoneName ? `所属：${d.zoneName}` : '', d.courtyardName ? `院落：${d.courtyardName}` : ''];
    return {
      name: info.name,
      visit: info.visitable ? '可进入内景' : '不可进入',
      usage: info.usage ? `用途：${info.usage}` : '',
      meta: whereParts.filter(Boolean).join(' · '),
      spec: specParts.filter(Boolean).join(' · '),
      size: sizeParts.filter(Boolean).join(' · '),
      note: info.info ?? '',
      fHint: info.visitable
        ? `按 F 进入「${info.name}」内景（再按 F 返回原视角）`
        : '按 F 会提示"此建筑不可进入内景"，不会改变当前视角',
      visitableTag: info.visitable,
    };
  }

  /* ------------------------------------------------------------------ 小地图 / 标签 */
  let minimapPlan = null;
  function currentMinimapPlan() {
    return (
      minimapPlan ??
      planMinimap({
        layout,
        cameraPosition: { x: rig.position.x, z: rig.position.z },
        cameraYawDeg: rig.describe().azimuthDeg,
        currentArea: layout.zoneAt(rig.position.x, rig.position.z) ?? null,
        config,
      })
    );
  }

  const projectorTmp = new THREE.Vector3();
  function makeProjector() {
    const rect = container?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: rig.viewport?.width ?? 1440, height: rig.viewport?.height ?? 900 };
    const camera = rig.camera;
    return (x, y, z) => {
      projectorTmp.set(x, y, z).project(camera);
      const visible = projectorTmp.z > -1 && projectorTmp.z < 1;
      return {
        x: (projectorTmp.x * 0.5 + 0.5) * (rect.width ?? 1440),
        y: (-projectorTmp.y * 0.5 + 0.5) * (rect.height ?? 900),
        visible,
        depth: projectorTmp.z,
      };
    };
  }

  /** 面板矩形（用于把标签挡在面板之外；面板尺寸变化由 tick 重测，代价可忽略）。 */
  function collectExclusionRects() {
    const rects = [];
    for (const el of [colTL, colTR, colBL, colBC]) {
      const nodes = el.childNodes ?? [];
      for (const node of nodes) {
        if (node.nodeType !== 1 || node.hidden) continue;
        const rect = node.getBoundingClientRect?.();
        if (rect && rect.width > 0 && rect.height > 0) rects.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      }
    }
    return rects;
  }

  function syncLabels(state) {
    // 隐藏态（ui=0 / shot=1）：不生成任何标签元素内容（§11.3 隐藏义务，不只是 CSS 透明度）
    if (!visible) {
      for (const el of refs.labels.values()) {
        el.hidden = true;
        el.classList.remove('is-selected', 'is-hovered');
      }
      return { items: [], hidden: 0, considered: 0, excluded: 0 };
    }
    const rect = container?.getBoundingClientRect?.() ?? { width: rig.viewport?.width ?? 1440, height: rig.viewport?.height ?? 900 };
    const plan = planLabels({
      buildings: interaction.catalog.pickables.map((p) => ({ id: p.id, name: p.name, zone: p.zone, bounds: p.bounds })),
      cameraPosition: { x: rig.position.x, y: rig.position.y, z: rig.position.z },
      project: makeProjector(),
      viewport: { width: rect.width ?? 1440, height: rect.height ?? 900 },
      selectedId: state.selectedBuildingId,
      hoveredId: state.hoveredBuildingId,
      mode: state.viewMode,
      config,
      excludeRects: collectExclusionRects(),
    });
    const seen = new Set();
    for (const item of plan.items) {
      seen.add(item.id);
      let el = refs.labels.get(item.id);
      if (!el) {
        el = h('div', { class: 'palace-label', attrs: { 'data-label-building': item.id } });
        refs.labels.set(item.id, el);
        labelLayer.appendChild(el);
      }
      el.textContent = item.name;
      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;
      el.hidden = false;
      el.classList.toggle('is-selected', item.selected);
      el.classList.toggle('is-hovered', item.hovered);
    }
    for (const [id, el] of refs.labels) {
      if (!seen.has(id)) {
        el.hidden = true;
        el.classList.remove('is-selected', 'is-hovered');
      }
    }
    return plan;
  }

  function drawMinimapNow() {
    minimapPlan = planMinimap({
      layout,
      cameraPosition: { x: rig.position.x, z: rig.position.z },
      cameraYawDeg: rig.describe().azimuthDeg,
      currentArea: layout.zoneAt(rig.position.x, rig.position.z) ?? null,
      config,
    });
    const ctx2d = minimapCanvas.getContext?.('2d') ?? null;
    refs.minimapDrawn = drawMinimap(ctx2d, minimapPlan, { colors: config.COLORS });
    // 文案双向更新：离开宫城 → 提示在外场地；回到城内 → 恢复常规提示
    if (refs.minimapDrawn) {
      const narrow = root.dataset.narrow === '1';
      minimapNote.textContent = minimapPlan.marker.inside
        ? narrow
          ? '点按分区定位（窄屏）'
          : '点按分区定位 · 金点 = 当前位置'
        : '当前位置在宫城之外（外场地）';
    }
    return minimapPlan;
  }

  /** 分区按钮的激活态取决于相机所在分区 → 随 tick 同步（否则切区后按钮会停在旧状态）。 */
  function syncZoneButtons(currentArea) {
    for (const [id, btn] of zoneButtons) {
      const entry = ZONE_BUTTONS.find((z) => z.id === id);
      const active = entry.area ? entry.area === currentArea : store.state.selectedBuildingId === entry.buildingId;
      btn.classList.toggle('is-active', !!active);
    }
  }

  /** 每帧易变量（相机位置相关）：HUD 位置/分区、分区按钮激活态、小地图、标签 —— 与 state 无关。 */
  function syncVolatile() {
    const currentArea = layout.zoneAt(rig.position.x, rig.position.z) ?? null;
    hudRows.position.textContent = `${currentArea ?? '—'} · ${rig.position.x.toFixed(0)}, ${rig.position.z.toFixed(0)}`;
    hudRows.zone.textContent = currentArea ?? '—';
    syncZoneButtons(currentArea);
    drawMinimapNow();
    syncLabels(store.state);
  }

  /** t87：卡死条同步（读 interaction 的通行性状态，不自己算"卡住"）。 */
  function syncStuckPanel() {
    if (typeof interaction?.traversalState !== 'function') return;
    const state = interaction.traversalState();
    const show = state?.stuck === true;
    stuckPanel.hidden = !show;
    refs.stuck = show;
    if (show) {
      stuckText.textContent = `连续 ${state.stuckSeconds.toFixed(1)}s 走不动（阈值 ${state.stuckThreshold}s）：按 G 或点右侧按钮脱离`;
    }
  }

  /* ------------------------------------------------------------------ 状态同步 */
  function applySnapshot(snapshot) {
    refs.lastSnapshot = snapshot;
    const { state } = snapshot;
    hudRows.view.textContent = `${state.viewMode} · ${VIEW_LABELS[state.viewMode] ?? ''}${rig.isFp ? '（第一人称）' : ''}`;
    hudRows.zone.textContent = layout.zoneAt(rig.position.x, rig.position.z) ?? '—';
    hudRows.time.textContent = TIME_LABELS[state.timePreset] ?? state.timePreset;
    hudRows.quality.textContent = QUALITY_LABELS[state.quality] ?? state.quality;
    const currentArea = layout.zoneAt(rig.position.x, rig.position.z);
    hudRows.position.textContent = `${currentArea ?? '—'} · ${rig.position.x.toFixed(0)}, ${rig.position.z.toFixed(0)}`;
    for (const [mode, btn] of viewButtons) btn.classList.toggle('is-active', mode === state.viewMode);
    for (const [preset, btn] of timeButtons) btn.classList.toggle('is-active', preset === state.timePreset);
    for (const [tier, btn] of qualityButtons) btn.classList.toggle('is-active', tier === state.quality);
    syncZoneButtons(currentArea ?? null);
    const tour = snapshot.tour;
    tourButtons.start.disabled = tour.active;
    tourButtons.pause.disabled = !tour.active || tour.paused;
    tourButtons.resume.disabled = !tour.active || !tour.paused;
    tourButtons.next.disabled = !tour.active;
    tourButtons.stop.disabled = !tour.active;
    tourText.textContent = tour.name ? `第 ${tour.index + 1}/${tour.total} 点 · ${tour.name}：${tour.narration}` : '中轴导览：南桥 → 城门 → 广场 → 主殿 → 内廷 → 花园';
    clear(tourDots);
    for (let i = 0; i < tour.total; i += 1) {
      tourDots.appendChild(h('span', { class: `palace-tour__dot${i === tour.index ? ' is-current' : i < tour.index ? ' is-done' : ''}` }));
    }
    const detail = snapshot.selected ? interaction.catalog.detail(snapshot.selected.id) : null;
    const info = snapshot.selected ? infoTextFor(snapshot.selected, detail) : null;
    infoPanel.hidden = !info;
    if (info) {
      infoName.textContent = info.name;
      infoVisit.textContent = info.visit;
      infoVisit.className = `palace-info__tag${info.visitableTag ? '' : ' palace-info__tag--no'}`;
      infoUsage.textContent = info.usage;
      infoMeta.textContent = info.meta;
      infoSpec.textContent = info.spec;
      infoSize.textContent = info.size;
      infoNote.textContent = info.note;
      infoFHint.textContent = info.fHint;
      infoInterior.disabled = !info.visitableTag;
    }
    infoPanel.dataset.selected = state.selectedBuildingId ?? '';
    syncLabels(state);
  }

  /* ------------------------------------------------------------------ 事件订阅 */
  disposers.push(interaction.onState(applySnapshot));
  disposers.push(interaction.onHint(showToast));
  disposers.push(
    interaction.onCommand((name) => {
      if (name === 'toggleHelp') toggleHelp();
      else if (name === 'toggleMinimap') toggleMinimap();
    }),
  );

  const onProgress = (payload) => {
    const progress = typeof payload?.progress === 'number' ? payload.progress : null;
    loadTitle.textContent = `${payload?.stage ?? '加载'}${payload?.total ? `（${payload.loaded}/${payload.total}）` : ''}`;
    if (progress !== null) loadFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    hudRows.load.textContent = `${payload?.stage ?? '加载'} ${progress === null ? '' : `${Math.round(progress * 100)}%`}`;
    hudLoadRow.hidden = false;
  };
  const onAssetFailure = (payload) => {
    loadError.textContent = `资源失败：${payload?.url ?? ''} ${payload?.error ?? ''}${payload?.retriable ? '（可重试）' : '（不可重试）'}`;
    retryButton.hidden = payload?.retriable === false;
    // t7：失败提示**不得**被默认折叠吃掉 ⇒ 出错即自动展开（"加载与失败提示"是既定要求）
    loadingSection.setCollapsed(false);
  };
  const onZoneFailure = (payload) => {
    loadError.textContent = `区域装载失败：${payload?.zone ?? ''} ${payload?.error ?? ''}`;
    retryButton.hidden = false;
    loadingSection.setCollapsed(false);
    showToast({ title: `区域 ${payload?.zone ?? ''} 装载失败`, detail: '可在右下角面板点「重试」重新装载。' });
  };
  disposers.push(events.on(EVENTS.assetsProgress, onProgress));
  disposers.push(events.on(EVENTS.assetsFailed, onAssetFailure));
  disposers.push(events.on(EVENTS.zoneFailed, onZoneFailure));
  disposers.push(events.on(EVENTS.zoneLoaded, (payload) => {
    loadError.textContent = '';
    retryButton.hidden = true;
    hudRows.load.textContent = `区域 ${payload?.zone ?? ''} 就绪`;
    hudLoadRow.hidden = true;
  }));

  /* ------------------------------------------------------------------ 窄屏 */
  function applyResponsive() {
    const width = win?.innerWidth ?? 1440;
    root.dataset.narrow = width <= UI.breakpoints.narrow ? '1' : '0';
    root.dataset.medium = width <= UI.breakpoints.medium ? '1' : '0';
    if (root.dataset.narrow === '1') {
      // t7：窄屏默认全折叠（本卡新默认即"全折叠"，此处只是再保证一次）
      toggleHelp(false);
      toggleMinimap(false);
      minimapNote.textContent = '点按分区定位（窄屏）';
    }
    return width;
  }
  if (win?.addEventListener) {
    const onResize = () => applyResponsive();
    win.addEventListener('resize', onResize);
    disposers.push(() => win.removeEventListener('resize', onResize));
  }

  /* ------------------------------------------------------------------ 可见性 */
  let visible = true;
  function setVisible(value, { pick = null } = {}) {
    visible = value !== false;
    root.hidden = !visible;
    root.classList.toggle('is-hidden', !visible);
    root.style.pointerEvents = visible ? '' : 'none';
    if (pick !== null) interaction.setPickEnabled(pick);
    else if (!visible) interaction.setPickEnabled(false);
    else interaction.setPickEnabled(true);
    if (visible) {
      applySnapshot(interaction.snapshot());
      syncVolatile();
    } else {
      syncLabels(store.state); // 立即清空标签层（不依赖 CSS）
    }
    return visible;
  }

  const forcedHidden = query?.ui === false || query?.shot === true;
  if (forcedHidden) setVisible(false);
  // core 的 ?stats=1 诊断面板在左下角：给左下列让位（样式表用 data-stats-overlay 处理）
  root.dataset.statsOverlay = api.query?.stats ? '1' : '0';
  // t7：所有内容型面板默认折叠（由 collapsiblePanel 构造即 collapsed），展开状态由箭头 / H / M / 失败事件控制
  syncHelpNote();
  refs.minimapCollapsed = minimapSection.isCollapsed();

  applyResponsive();
  applySnapshot(interaction.snapshot());
  drawMinimapNow();

  return {
    root,
    refs,
    /** 每帧更新：提示条淡出 + HUD 位置/分区 + 标签定位 + 小地图重绘（节流到 UI 过渡时长量级）。 */
    update(dt = 1 / 60) {
      refs.updates = (refs.updates ?? 0) + 1;
      if (!visible) return false;
      if (refs.toastTimer > 0) {
        refs.toastTimer -= dt;
        if (refs.toastTimer <= 0) toast.classList.remove('is-visible');
      }
      refs.minimapAccum += dt;
      const interval = Math.max(0.05, (TRANSITION_MS * 2) / 1000);
      if (refs.minimapAccum >= interval) {
        refs.minimapAccum = 0;
        syncVolatile();
      }
      syncStuckPanel();
      return true;
    },
    setVisible,
    get visible() {
      return visible;
    },
    toggleHelp,
    showToast,
    /** 诊断：DOM 结构摘要（V2/自动化走查可直接断言数量）。 */
    stats() {
      return {
        visible,
        forcedHidden,
        narrow: root.dataset.narrow === '1',
        viewButtons: viewButtons.size,
        zoneButtons: zoneButtons.size,
        timeButtons: timeButtons.size,
        qualityButtons: qualityButtons.size,
        labels: [...refs.labels.values()].filter((el) => !el.hidden).length,
        updates: refs.updates ?? 0,
        labelPool: refs.labels.size,
        minimapDrawn: !!refs.minimapDrawn,
        stuck: refs.stuck === true,
        panels: [...(root.querySelectorAll?.('[data-ui-panel]') ?? [])].map((el) => el.dataset?.uiPanel ?? el.getAttribute?.('data-ui-panel')),
        /** t7：逐面板折叠状态（默认全折叠 = 每个可折叠面板 collapsed 为 true） */
        collapsed: Object.fromEntries(collapsibles.map((s) => [s.id, s.section.isCollapsed()])),
        collapsible: collapsibles.map((s) => s.id),
        helpExpanded: refs.helpExpanded === true,
        minimapCollapsed: minimapSection.isCollapsed(),
        spacingProblems,
      };
    },
    dispose() {
      for (const off of disposers.splice(0)) off?.();
      root.remove?.();
    },
  };
}

/**
 * 一行接入（t14 在 `bootstrap()` 里调用即可）：
 *   const iface = mountInterface(window.__PALACE__, { container: document.getElementById('app') });
 * 之后唯一动画循环里可选调用 `iface.update(dt, elapsed)`（不调用也行：交互经 recordFrame 包装自驱动）。
 */
export function mountInterface(palaceApi = null, options = {}) {
  const api = palaceApi ?? (typeof window !== 'undefined' ? window.__PALACE__ : null);
  if (!api) throw new Error('mountInterface 需要 window.__PALACE__（core 装配完成后调用）');
  const doc = options.document ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('mountInterface 需要 DOM 环境（浏览器内调用）');
  const container = options.container ?? doc.getElementById('app') ?? doc.body;
  const query = options.query ?? api.query ?? {};
  const win = options.window ?? (typeof window !== 'undefined' ? window : null);
  let uiRef = null; // 先建 interaction，再建 ui：tick 里通过闭包引用后者
  const interaction = options.interaction ?? createInteraction({
    api,
    container,
    config: options.config ?? CONFIG,
    layout: options.layout ?? LAYOUT,
    window: win,
    document: doc,
    options: {
      renderSystem: options.renderSystem ?? true,
      source: options.source ?? 'ui',
      onTick: (dt, elapsed) => uiRef?.update(dt, elapsed),
    },
  });
  const ui = createUI({ api, interaction, container, query, config: options.config ?? CONFIG, layout: options.layout ?? LAYOUT, document: doc, window: win });
  uiRef = ui;
  const handle = {
    api,
    interaction,
    ui,
    update(dt = 1 / 60, elapsed = 0) {
      interaction.update(dt, elapsed);
      ui.update(dt);
      return handle;
    },
    setVisible(value) {
      return ui.setVisible(value);
    },
    stats() {
      // t104：把通行性/卡死链路状态一并暴露（浏览器 `__PALACE_UI__.stats().traversal` 可核对）
      const traversal = typeof interaction.traversalState === 'function' ? interaction.traversalState() : null;
      return {
        ui: ui.stats(),
        interaction: interaction.stats(),
        stuck: traversal?.stuck === true,
        traversal, query: { ui: query?.ui, shot: query?.shot, view: query?.view ?? null } };
    },
    dispose() {
      ui.dispose();
      interaction.dispose();
    },
  };
  if (win) win.__PALACE_UI__ = handle;
  return handle;
}

export default createUI;
