/**
 * 极简 DOM 工具（不引入任何 UI 框架，计划 §1 技术前提）。
 *
 * 之所以自带 `h()` 而不是 `innerHTML`：
 *   1. 全部文案走 `textContent`，杜绝注入；
 *   2. 事件处理与元素引用都在构建期绑定（不依赖 `querySelector`，便于 Node 内的 DOM 替身测试）；
 *   3. 需要 `stopPropagation` 的控件可以声明 `stop: true`，避免按钮点击穿透到画布（选中/指针锁）。
 *
 * ownerDocument 可注入（`setOwnerDocument`）：浏览器里由 `src/ui/index.js` 传入真实 document，
 * Node 测试里传入替身；模块不直接依赖全局 `document`，因此可在无 DOM 环境 import。
 */

let ownerDocument = typeof document !== 'undefined' ? document : null;

/** 设置创建元素所用的 document（UI 挂载时调用）。 */
export function setOwnerDocument(doc) {
  ownerDocument = doc;
  return ownerDocument;
}

/** 当前 ownerDocument。 */
export function getOwnerDocument() {
  return ownerDocument;
}

function requireDocument() {
  if (!ownerDocument) throw new Error('UI 需要 DOM：请先 setOwnerDocument(document) 再构建界面');
  return ownerDocument;
}

/**
 * 创建元素。
 * @param {string} tag
 * @param {object} [props] class/id/text/dataset/attrs/style/on/stop
 * @param {Array|string|Node} [children]
 */
export function h(tag, props = {}, children = []) {
  const doc = requireDocument();
  const el = doc.createElement(tag);
  const { class: className, id, text, html, dataset, attrs, style, on, stop, ...rest } = props;
  if (className) el.className = className;
  if (id) el.id = id;
  if (text !== undefined && text !== null) el.textContent = String(text);
  if (html !== undefined && html !== null) el.innerHTML = String(html);
  if (dataset) for (const [key, value] of Object.entries(dataset)) if (value !== undefined && value !== null) el.dataset[key] = String(value);
  if (attrs) for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) el.setAttribute(key, String(value));
  if (style) for (const [key, value] of Object.entries(style)) if (value !== undefined && value !== null) el.style[key] = String(value);
  if (stop) {
    for (const type of ['pointerdown', 'pointerup', 'click', 'wheel', 'mousedown']) {
      el.addEventListener(type, (event) => event.stopPropagation());
    }
  }
  if (on) for (const [type, handler] of Object.entries(on)) el.addEventListener(type, handler);
  for (const key of Object.keys(rest)) {
    if (key in el) el[key] = rest[key];
    else el.setAttribute(key, String(rest[key]));
  }
  append(el, children);
  return el;
}

/** 追加子节点（字符串 → 文本节点；null/false 跳过；数组递归）。 */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (typeof child === 'string' || typeof child === 'number') parent.appendChild(document.createTextNode(String(child)));
    else parent.appendChild(child);
  }
  return parent;
}

/** 清空子节点。 */
export function clear(el) {
  if (!el) return el;
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** 设置 CSS 变量。 */
export function setVars(el, vars) {
  for (const [key, value] of Object.entries(vars)) el.style.setProperty(key, value);
  return el;
}

/** 按钮（统一 4px 圆角 / 32px 最小触控尺寸 / 180ms 过渡由样式表保证）。 */
export function button(label, props = {}) {
  const { variant = 'default', active = false, title, on: handlers = {}, ...rest } = props;
  return h(
    'button',
    {
      class: `palace-btn palace-btn--${variant}${active ? ' is-active' : ''}`,
      type: 'button',
      title: title ?? label,
      text: label,
      stop: true,
      attrs: { 'data-variant': variant },
      on: handlers,
      ...rest,
    },
    [],
  );
}

export default h;

/* -------------------------------------------------------------------------- */
/*  t7：可折叠 HUD 面板（默认折叠 + 箭头；可点击 + 键盘可达 + 等价 a11y）        */
/* -------------------------------------------------------------------------- */

/** 折叠/展开箭头的字形（纯文本，确保任何字体环境都能显示；不依赖图标字体）。 */
export const COLLAPSE_ARROW = Object.freeze({ collapsed: '▸', expanded: '▾' });

/**
 * 可折叠面板。语义与可访问性（**不做等价物，直接用原生语义**）：
 *   · 折叠头是**原生 `<button type="button">`** ⇒ Tab 可达、Enter/Space 激活是浏览器行为；
 *     这里额外挂一个 `keydown`（Enter/Space + `preventDefault()`）以覆盖"合成键盘事件"与
 *     无原生激活的环境（Node 测试替身 / CDP 合成事件），**不会**在真实浏览器里双重切换：
 *     原生 click 由 keydown 的默认动作产生，`preventDefault()` 恰好抑制它。
 *   · `aria-expanded` 如实反映状态；`aria-controls` 指向内容体 id（关联关系可被读屏读取）；
 *   · 内容体用 `hidden`（display:none）折叠，**不删 DOM**（展开后内容与折叠前逐项一致）。
 *
 * @param {{ id: string, title?: string|Node, panelClass?: string, bodyAttrs?: object,
 *           defaultOpen?: boolean, level?: 'h2'|'span', titleAttrs?: object }} spec
 * @param {Array|Node|string} bodyChildren
 * @returns {{ panel: object, body: object, toggle: object, arrow: object, setCollapsed: Function,
 *             isCollapsed: Function, toggle: object }}
 */
export function collapsiblePanel(spec = {}, bodyChildren = []) {
  const {
    id,
    title = '',
    panelClass = 'palace-panel',
    bodyAttrs = {},
    defaultOpen = false,
    titleTag = 'span',
    titleAttrs = {},
  } = spec;
  if (!id) throw new Error('collapsiblePanel 需要 id（同时用于 data-ui-panel 与 aria-controls）');
  const bodyId = `palace-panel-body-${id}`;
  const state = { collapsed: !defaultOpen };

  const arrow = h('span', { class: 'palace-panel__arrow', attrs: { 'aria-hidden': 'true', 'data-ui-part': 'arrow' }, text: state.collapsed ? COLLAPSE_ARROW.collapsed : COLLAPSE_ARROW.expanded });
  const titleEl = h(titleTag, { class: 'palace-panel__title', attrs: { 'data-ui-part': 'panel-title', ...titleAttrs } }, typeof title === 'string' ? [] : [title]);
  if (typeof title === 'string') titleEl.textContent = title;

  const body = h('div', {
    class: 'palace-panel__body',
    hidden: state.collapsed,
    // id 写进 attrs：浏览器与 Node 测试替身都能如实读到（aria-controls 的关联对象）
    attrs: { id: bodyId, 'data-ui-part': 'panel-body', 'data-ui-body-for': id, ...bodyAttrs },
  }, bodyChildren);

  const toggle = h('button', {
    class: 'palace-panel__toggle',
    type: 'button',
    stop: true,
    attrs: {
      'data-action': 'toggle-panel',
      'data-ui-toggle-for': id,
      'aria-expanded': String(!state.collapsed),
      'aria-controls': bodyId,
    },
  }, [arrow, titleEl]);

  const panel = h('div', {
    class: panelClass,
    // 与全仓约定一致：布尔型 data-* 用 '1'/'0'（如 data-narrow）；aria-* 才用 'true'/'false'
    attrs: { 'data-ui-panel': id, 'data-collapsible': '1', 'data-collapsed': state.collapsed ? '1' : '0' },
  }, [toggle, body]);

  function sync(announce = true) {
    body.hidden = state.collapsed;
    toggle.setAttribute('aria-expanded', String(!state.collapsed));
    toggle.setAttribute('title', `${state.collapsed ? '展开' : '折叠'}${typeof title === 'string' ? `：${title}` : ''}`);
    arrow.textContent = state.collapsed ? COLLAPSE_ARROW.collapsed : COLLAPSE_ARROW.expanded;
    panel.setAttribute('data-collapsed', state.collapsed ? '1' : '0');
    panel.classList.toggle('is-collapsed', state.collapsed);
    if (announce && typeof panel.__onCollapseChange === 'function') panel.__onCollapseChange(state.collapsed);
    return state.collapsed;
  }

  function setCollapsed(next) {
    const want = !!next;
    if (want === state.collapsed) return state.collapsed;
    state.collapsed = want;
    return sync();
  }

  toggle.addEventListener('click', () => { setCollapsed(!state.collapsed); });
  toggle.addEventListener('keydown', (event) => {
    const key = event?.key ?? '';
    const code = event?.code ?? '';
    if (key === 'Enter' || key === ' ' || key === 'Spacebar' || code === 'Enter' || code === 'Space') {
      event.preventDefault?.();
      event.stopPropagation?.();
      setCollapsed(!state.collapsed);
    }
  });
  sync(false);

  return {
    panel,
    body,
    toggle,
    arrow,
    titleEl,
    setCollapsed,
    setOpen: (next) => setCollapsed(!next),
    isCollapsed: () => state.collapsed,
    /** 折叠状态变化回调（用于把状态同步到别处，例如 M/H 键与提示文案）。 */
    onCollapseChange(handler) { panel.__onCollapseChange = typeof handler === 'function' ? handler : null; },
  };
}
