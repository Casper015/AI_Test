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
