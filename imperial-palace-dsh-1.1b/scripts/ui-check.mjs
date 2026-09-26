#!/usr/bin/env node
/**
 * `scripts/ui-check.mjs` —— UI 上线机器验收（t58 / T7.2）
 *
 * 为什么需要它：t58 之前 `mountInterface` 从未被 `src/main.js` 调用 ⇒ 交付物里 "UI 究竟显不显示"
 * 没有任何门禁观察过一眼（t13 走 `?ui=0&shot=1` 故意隐藏 UI；t9 的证据在自建 harness 里）。
 * 本脚本用**普通 URL**（不带 `ui=0&shot=1`）在真实 headless Chrome 里查：
 *   1. `#palace-ui` 存在且**可见**（非 display:none / visibility:hidden / 零尺寸）；
 *   2. 12 个面板 DOM 齐备（逐项选择器 + 实际命中数）——HUD / 八视角切换器 / 分区跳转 / 建筑信息面板 /
 *      导览控件 / 小地图 / 标签层 / 时辰切换 / 质量档 / 回全城 / 帮助 / 提示条；
 *   3. §11.3 隐藏义务仍成立：`?ui=0&shot=1` 下 `#palace-ui` 存在但**不可见**；
 *   4. **按钮 ≡ 键盘同源**：CDP 真实点击「视角 2」与真实按 `Digit2` 得到同一 `state.viewMode`，
 *      且都走同一条 `view:request-mode` 事件（不产生第二套状态）；
 *   5. 唯一循环：`ui.stats().interaction.driveMode === 'manual'`（由 main.js 的唯一 rAF 循环驱动，
 *      interaction 的 recordFrame 包装层停用 ⇒ 不重复推进）；
 *   6. 产出 ≥4 张 UI 可见截图（1440×900）到 `docs/shots-ui-wiring/`。
 *
 * 只读：不修改应用状态文件；截图与其 manifest 写入 `docs/shots-ui-wiring/`（本卡 inScope）。
 * 退出码：0 = 全部通过；1 = 有断言失败（逐条打印真实命中数/实际值）；2 = 环境问题（无浏览器/连不上 CDP）。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { findBrowser, createStaticServer, resolveGlVariants, readPngSize } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const VIEWPORT = { width: 1440, height: 900 };
const SHOT_DIR = join(ROOT, 'docs', 'shots-ui-wiring');
const WAIT_READY_MS = 45000;

const PANELS = [
  { key: 'HUD', selector: '[data-ui-panel="hud"]' },
  { key: '八视角切换器', selector: '[data-ui-panel="views"]' },
  { key: '分区跳转', selector: '[data-ui-panel="zones"]' },
  { key: '建筑信息面板', selector: '[data-ui-panel="info"]' },
  { key: '导览控件', selector: '[data-ui-panel="tour"]' },
  { key: '小地图', selector: '[data-ui-panel="minimap"]' },
  { key: '标签层', selector: '[data-ui-panel="labels"]' },
  { key: '时辰切换', selector: '[data-ui-panel="env"] [data-time-preset]' },
  { key: '质量档', selector: '[data-ui-panel="env"] [data-quality-tier]' },
  { key: '回全城', selector: '[data-ui-panel="zones"] [data-action="reset"]' },
  { key: '帮助', selector: '[data-ui-panel="help"]' },
  { key: '提示条', selector: '[data-ui-panel="toast"]' },
];

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return Boolean(ok);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* 极简 CDP 客户端（Node 内置 WebSocket + fetch，无第三方依赖）                  */
/* -------------------------------------------------------------------------- */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      let msg = null;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}（${JSON.stringify(msg.error.data ?? '')}）`));
        else resolve(msg.result);
        return;
      }
      this.events.push(msg);
      for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时：${method}`));
        }
      }, 60000);
    });
  }

  /** 在页面里求值（返回 JSON 可序列化的值）。 */
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`页面求值异常：${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  /** 真实鼠标点击（CDP Input 域，非 el.click()）。 */
  async clickAt(x, y) {
    const common = { x, y, button: 'left', clickCount: 1, buttons: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common });
  }

  /** 真实按键（CDP Input 域）。 */
  async pressKey(code, key, vk) {
    const common = { code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }
}

async function waitFor(fn, { timeoutMs = 30000, intervalMs = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = `求值异常：${error.message}`;
    }
    await sleep(intervalMs);
  }
  throw new Error(`等待超时（${label}）：${typeof last === 'string' ? last : JSON.stringify(last)}`);
}

/** 等待若干动画帧 + 一点点真实时间（相机过渡/面板刷新用）。 */
async function settle(cdp, frames = 24, extraMs = 600) {
  await cdp.eval(
    `new Promise((resolve) => { let n = 0; const step = () => { n += 1; if (n >= ${frames}) resolve(n); else requestAnimationFrame(step); }; requestAnimationFrame(step); })`,
  );
  await sleep(extraMs);
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                      */
/* -------------------------------------------------------------------------- */
const found = findBrowser();
if (!found?.path) {
  console.error('ui-check: 未找到可用浏览器（尝试 CHROME_PATH / playwright / 系统 Chrome）');
  process.exit(2);
}
const variant = resolveGlVariants('disable-gpu')[0];
const profileDir = mkdtempSync(join(tmpdir(), 'palace-ui-check-'));
const server = createStaticServer({ root: ROOT, port: 0 });
const port = await server.listen(0);
const base = `http://127.0.0.1:${port}/`;
const isHeadlessShell = /headless[-_]shell/.test(found.path);
const args = [
  ...(isHeadlessShell ? [] : ['--headless=new']),
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-crash-reporter',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--mute-audio',
  ...(variant?.flags ?? []),
  '--force-device-scale-factor=1',
  `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  `${base}index.html`,
];
mkdirSync(SHOT_DIR, { recursive: true });
const chrome = spawn(found.path, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let stderrTail = '';
chrome.stderr.on('data', (chunk) => {
  stderrTail = `${stderrTail}${chunk}`.slice(-4000);
});

const cleanup = async () => {
  try {
    chrome.kill('SIGKILL');
  } catch {}
  await server.close().catch(() => {});
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {}
};
process.on('exit', () => {
  try {
    chrome.kill('SIGKILL');
  } catch {}
});

let cdp = null;
try {
  // Chrome 把实际端口写进 <user-data-dir>/DevToolsActivePort
  const portFile = join(profileDir, 'DevToolsActivePort');
  const devtoolsPort = await waitFor(
    async () => (existsSync(portFile) ? readFileSync(portFile, 'utf8').split('\n')[0].trim() : null),
    { timeoutMs: 20000, label: 'DevToolsActivePort' },
  );
  const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('未找到 page target（DevTools 已起但无页面）');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true });
  });
  cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  const pageErrors = [];
  cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(`exception: ${p?.exceptionDetails?.exception?.description ?? p?.exceptionDetails?.text ?? '?'}`));
  cdp.on('Log.entryAdded', (p) => {
    if (p?.entry?.level === 'error') pageErrors.push(`console.error: ${p.entry.text}`);
  });

  console.log('ui-check · UI 上线机器验收（普通 URL，真实 headless Chrome + CDP）');
  console.log(`  浏览器：${found.path}`);
  console.log(`  服务：${base}（普通 URL，不带 ui=0/shot=1）`);

  /* ---------------------------------------------------------------- 1. 就绪 */
  const ready = await waitFor(
    () => cdp.eval(`Boolean(window.__PALACE__ && document.getElementById('palace-ui'))`),
    { timeoutMs: WAIT_READY_MS, label: 'window.__PALACE__ + #palace-ui' },
  );
  check('页面就绪：window.__PALACE__ 与 #palace-ui 均存在', ready === true);

  /* ------------------------------------------------- 2. #palace-ui 可见性 */
  const rootInfo = await cdp.eval(`(() => {
    const el = document.getElementById('palace-ui');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents,
      width: Math.round(rect.width), height: Math.round(rect.height),
      panels: [...el.querySelectorAll('[data-ui-panel]')].map((n) => n.getAttribute('data-ui-panel')),
      buttons: el.querySelectorAll('button').length,
      styleTag: Boolean(document.getElementById('palace-ui-styles')),
      tokenTag: Boolean(document.getElementById('palace-ui-tokens')) || getComputedStyle(document.documentElement).getPropertyValue('--palace-gold') !== '',
      bodyText: (document.body.innerText || '').length,
    };
  })()`);
  check('#palace-ui 存在', Boolean(rootInfo), rootInfo ? `display=${rootInfo.display} size=${rootInfo.width}x${rootInfo.height}` : '未找到');
  check(
    '#palace-ui 可见（display≠none 且 visibility≠hidden 且非零尺寸且不透明）',
    rootInfo && rootInfo.display !== 'none' && rootInfo.visibility !== 'hidden' && Number(rootInfo.opacity) > 0.01 && rootInfo.width > 0 && rootInfo.height > 0,
    rootInfo ? `display=${rootInfo.display} visibility=${rootInfo.visibility} opacity=${rootInfo.opacity} rect=${rootInfo.width}x${rootInfo.height}` : '',
  );
  check('样式与 :root 令牌已注入', Boolean(rootInfo?.styleTag && rootInfo?.tokenTag), `styles=${rootInfo?.styleTag} tokens=${rootInfo?.tokenTag}`);
  check('body 有可见文本（首屏不再是空白 DOM）', Number(rootInfo?.bodyText) > 200, `innerText 长度=${rootInfo?.bodyText}`);

  /* -------------------------------------------------------- 3. 12 个面板 */
  const panelCounts = await cdp.eval(`(() => {
    const out = {};
    for (const sel of ${JSON.stringify(PANELS.map((p) => p.selector))}) out[sel] = document.querySelectorAll(sel).length;
    return out;
  })()`);
  let panelsOk = true;
  for (const panel of PANELS) {
    const hits = panelCounts?.[panel.selector] ?? 0;
    const ok = hits >= 1;
    panelsOk = panelsOk && ok;
    check(`面板齐备：${panel.key}`, ok, `选择器 ${panel.selector} → 命中 ${hits}`);
  }

  /* --------------------------------- 4. 唯一循环：driveMode 必须为 manual */
  const loopInfo = await cdp.eval(`(() => {
    const ui = window.__PALACE__.ui;
    const s = ui?.stats?.();
    const drive = typeof ui?.interaction?.driveMode === 'function' ? ui.interaction.driveMode() : null;
    return { drive, ticks: s?.interaction?.ticks ?? 0, attached: s?.interaction?.attached ?? null };
  })()`);
  check('UI 由 main.js 的唯一 rAF 循环驱动（mountInterface 的 recordFrame 包装层停用）', loopInfo?.drive === 'manual', `ui.interaction.driveMode()=${loopInfo?.drive}（attached=${loopInfo?.attached}）`);

  // 「不重复推进」的强证据：同一时间窗内 rAF 帧数与 interaction tick 数同阶（≈1 tick/帧，而非 2×）
  const ticks0 = Number(loopInfo?.ticks ?? 0);
  const frames = await cdp.eval(
    `new Promise((resolve) => { let n = 0; const step = () => { n += 1; if (n >= 60) resolve(n); else requestAnimationFrame(step); }; requestAnimationFrame(step); })`,
  );
  const ticks1 = await cdp.eval(`(() => { const s = window.__PALACE__?.ui?.stats?.(); return s?.interaction?.ticks ?? 0; })()`);
  const tickDelta = Number(ticks1) - ticks0;
  check('每帧恰好推进一次（tick 增量 ≤ rAF 帧数 + 2，无第二套驱动）', tickDelta >= 1 && tickDelta <= Number(frames) + 2, `rAF ${frames} 帧 → interaction tick +${tickDelta}（区间 ${ticks0}→${ticks1}）`);

  /* ------------------------------------ 5. 按钮 ≡ 键盘（同一条请求事件） */
  await cdp.eval(`(() => {
    window.__UI_CHECK__ = { events: [] };
    window.__PALACE__.events.on('view:request-mode', (p) => window.__UI_CHECK__.events.push(p ?? null));
    return true;
  })()`);
  const rect = await cdp.eval(`(() => {
    const el = document.querySelector('[data-ui-panel="views"] [data-view-index="2"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), mode: el.dataset.viewMode, label: el.textContent.trim() };
  })()`);
  check('找到「视角 2」按钮（data-view-index=2）', Boolean(rect), rect ? `mode=${rect.mode} label="${rect.label}" @(${rect.x},${rect.y})` : '未找到');

  let clickResult = null;
  let keyResult = null;
  if (rect) {
    // 先离开目标视角，保证点击生效可辨
    await cdp.eval(`(() => { window.__PALACE__.rig?.reset?.(); return true; })()`);
    await cdp.eval(`window.__UI_CHECK__.events.length = 0; true`);
    await cdp.clickAt(rect.x, rect.y);
    await settle(cdp, 20, 400);
    clickResult = await cdp.eval(`(() => ({ mode: window.__PALACE__.state.viewMode, events: window.__UI_CHECK__.events.slice() }))()`);

    // 键盘路径：先回视角 1，再按 Digit2
    await cdp.pressKey('Digit1', '1', 49);
    await settle(cdp, 12, 250);
    await cdp.eval(`window.__UI_CHECK__.events.length = 0; true`);
    await cdp.pressKey('Digit2', '2', 50);
    await settle(cdp, 20, 400);
    keyResult = await cdp.eval(`(() => ({ mode: window.__PALACE__.state.viewMode, events: window.__UI_CHECK__.events.slice() }))()`);
  }
  const clickMode = clickResult?.mode ?? null;
  const keyMode = keyResult?.mode ?? null;
  check('真实点击「视角 2」→ state.viewMode 生效', Boolean(clickMode) && clickMode === rect?.mode, `点击后 viewMode=${clickMode}（按钮 data-view-mode=${rect?.mode}）`);
  check('真实按 Digit2 → state.viewMode 生效', Boolean(keyMode) && keyMode === rect?.mode, `按键后 viewMode=${keyMode}`);
  check('按钮与键盘同源（同一 viewMode，同一条 view:request-mode）', clickMode === keyMode && clickResult?.events?.length >= 1 && keyResult?.events?.length >= 1,
    `click=${clickMode}(${clickResult?.events?.length ?? 0} event) / key=${keyMode}(${keyResult?.events?.length ?? 0} event)；事件负载样例=${JSON.stringify(keyResult?.events?.[0] ?? clickResult?.events?.[0] ?? null)}`);

  /* ------------------------------------------------------ 6. 4 张 UI 截图 */
  const shots = [];
  const shotMeta = async (name, note) => {
    const path = join(SHOT_DIR, name);
    await cdp.screenshot(path);
    const size = readPngSize(path);
    const sha = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    shots.push({ name, path: `docs/shots-ui-wiring/${name}`, width: size?.width ?? null, height: size?.height ?? null, bytes: readFileSync(path).length, sha256_12: sha, note });
    check(`截图 ${name}（1440×900）`, size?.width === VIEWPORT.width && size?.height === VIEWPORT.height, `${size?.width}x${size?.height} · ${readFileSync(path).length} 字节 · sha ${sha}`);
  };

  // ① 首屏全城（回全城鸟瞰）
  await cdp.eval(`(() => { window.__PALACE__.rig?.reset?.(); return true; })()`);
  await settle(cdp, 40, 900);
  await shotMeta('ui-01-overview.png', '首屏全城（默认视角 + UI 全可见）');

  // ② 导览进行中（真实点击「开始」）
  const tourRect = await cdp.eval(`(() => {
    const btns = [...document.querySelectorAll('[data-ui-panel="tour"] button')];
    const el = btns.find((b) => (b.textContent || '').trim() === '开始') ?? btns[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: (el.textContent || '').trim() };
  })()`);
  if (tourRect) {
    await cdp.clickAt(tourRect.x, tourRect.y);
    await settle(cdp, 40, 1200);
  }
  await shotMeta('ui-02-tour.png', `导览进行中（点击「${tourRect?.label ?? '开始'}」后）`);

  // ③ 第一人称（点击视角按钮中 data-view-mode 含 fp 的那个）
  const fpRect = await cdp.eval(`(() => {
    const el = [...document.querySelectorAll('[data-ui-panel="views"] [data-view-mode]')].find((b) => /fp|first|person/i.test(b.dataset.viewMode));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), mode: el.dataset.viewMode };
  })()`);
  if (fpRect) {
    await cdp.clickAt(fpRect.x, fpRect.y);
    await settle(cdp, 45, 1400);
  }
  await shotMeta('ui-03-first-person.png', `第一人称（点击视角 ${fpRect?.mode ?? 'fp'}）`);

  // ④ 夜景（点击时辰按钮）
  const nightRect = await cdp.eval(`(() => {
    const el = document.querySelector('[data-ui-panel="env"] [data-time-preset="moonlitNight"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (nightRect) {
    await cdp.clickAt(nightRect.x, nightRect.y);
    await settle(cdp, 45, 1400);
  }
  const nightState = await cdp.eval(`(() => {
    const st = window.__PALACE__.state ?? {};
    const hit = Object.entries(st).filter(([, v]) => typeof v === 'string' && /night|moonlit|sunset|golden/i.test(String(v)));
    return { preset: st.preset ?? null, timePreset: st.timePreset ?? null, envPreset: st.envPreset ?? null, candidates: hit };
  })()`);
  const nightOk = [nightState?.preset, nightState?.timePreset, nightState?.envPreset, ...(nightState?.candidates ?? []).map(([, v]) => v)].includes('moonlitNight');
  check('夜景截图前时辰已切到 moonlitNight', nightOk, `state 相关字段=${JSON.stringify(nightState)}`);
  await shotMeta('ui-04-night.png', `夜景（点击「夜晚」按钮，preset=${nightState}）`);

  /* ------------------------------- 7. §11.3：ui=0&shot=1 必须隐藏 UI */
  await cdp.send('Page.navigate', { url: `${base}index.html?ui=0&shot=1` });
  await waitFor(() => cdp.eval(`Boolean(window.__PALACE__ && document.getElementById('palace-ui'))`), { timeoutMs: WAIT_READY_MS, label: 'shot 模式就绪' });
  const hiddenInfo = await cdp.eval(`(() => {
    const el = document.getElementById('palace-ui');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const uiStats = window.__PALACE__?.ui?.stats?.() ?? null;
    const call = (v) => (typeof v === 'function' ? v() : v);
    const uu = uiStats?.ui ?? {};
    return { display: cs.display, visibility: cs.visibility, width: Math.round(rect.width), height: Math.round(rect.height), forcedHidden: uu.forcedHidden ?? null, visible: call(uu.visible) ?? null };
  })()`);
  check(
    '§11.3 隐藏义务：?ui=0&shot=1 下 UI 存在但不可见',
    hiddenInfo && (hiddenInfo.display === 'none' || hiddenInfo.visibility === 'hidden' || hiddenInfo.width === 0 || hiddenInfo.height === 0 || hiddenInfo.visible === false),
    hiddenInfo ? `display=${hiddenInfo.display} size=${hiddenInfo.width}x${hiddenInfo.height} visible=${hiddenInfo.visible} forcedHidden=${hiddenInfo.forcedHidden}` : '未找到',
  );

  /* ----------------------------------------------------------- 8. 控制台错误 */
  check('页面无未捕获异常 / console.error', pageErrors.length === 0, pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : '无');

  /* ------------------------------------------------------------- manifest */
  const manifest = {
    at: new Date().toISOString(),
    viewport: VIEWPORT,
    url: `${base}index.html`,
    browser: found.path,
    checks: results,
    panels: PANELS.map((p) => ({ ...p, hits: panelCounts?.[p.selector] ?? 0 })),
    screenshots: shots,
  };
  writeFileSync(join(SHOT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const failed = results.filter((r) => !r.ok);
  console.log('---------------------------------------------------------');
  console.log(`检查项 ${results.length}：PASS ${results.length - failed.length} / FAIL ${failed.length}`);
  console.log(`截图 ${shots.length} 张 → docs/shots-ui-wiring/（manifest.json 已写出）`);
  if (failed.length) {
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
    console.log('stderr 尾部：');
    console.log(stderrTail.slice(-800));
  }
  await cleanup();
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error(`ui-check: 执行失败：${error.message}`);
  if (stderrTail) console.error(`浏览器 stderr 尾部：\n${stderrTail.slice(-1200)}`);
  await cleanup();
  process.exit(2);
}
