/**
 * /tmp/t99-cdp.mjs —— t99 真实 CDP 驱动（开敞亭提示 / 卡死 HUD / G 脱困）
 * 复用本机既有 CDP 模式（Node 内置 WebSocket + fetch，无第三方依赖），灵感来自 scripts/ui-check.mjs。
 * 只读页面；截图与读数写入 docs/shots-airwall/（本卡 inScope）。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const REAL_ROOT = '/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b';
const ROOT = REAL_ROOT;
const OUT = join(REAL_ROOT, 'docs', 'shots-airwall');
mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 1440, height: 900 };
const CHROME = '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

/* ---------------- 静态服务器（只读 index.html/src/public） ---------------- */
function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = join(ROOT, decodeURIComponent(url.pathname));
    if (url.pathname === '/' || url.pathname === '') p = join(ROOT, 'index.html');
    try {
      const buf = readFileSync(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    } catch {
      res.writeHead(404).end('404');
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

/* ---------------- 极简 CDP 客户端（Node 内置 WebSocket） ---------------- */
class Cdp {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP 超时 ${method}`)); } }, 60000);
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(`页面求值异常：${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    return res.result?.value;
  }
  async keyDown(code, key, vk) { await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); }
  async keyUp(code, key, vk) { await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); }
  async press(code, key, vk) { await this.keyDown(code, key, vk); await sleep(60); await this.keyUp(code, key, vk); }
  async clickAt(x, y) {
    const common = { x, y, button: 'left', clickCount: 1, buttons: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common });
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = join(OUT, name);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return { file, bytes: statSync(file).size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
  }
}
async function waitFor(fn, { timeoutMs = 60000, intervalMs = 250, label = 'cond' } = {}) {
  const end = Date.now() + timeoutMs; let last = null;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(intervalMs); }
  throw new Error(`等待超时（${label}）：${String(last).slice(0, 200)}`);
}

/* ---------------- 场景参数 ---------------- */
const PAVILION = { id: 'B-pavilion-gate-west', name: '门殿西翼亭', cx: -58, cz: -386, half: 8 };
const STAND = { x: -58, z: PAVILION.cz + PAVILION.half + 2.0 };   // 亭足迹南缘外 2m（广场，y=0）

/* 期望脱困落点：core 语义 = 最近"已登记出生点"（registry 契约内 = layout fp-spawn 机位） */
const layoutSrc = readFileSync(join(ROOT, 'src/shared/layout.js'), 'utf8');
async function expectedSpawn() {
  const mod = await import(join(ROOT, 'src/shared/layout.js'));
  const spawns = mod.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ id: v.id, x: v.position.x, y: v.position.y, z: v.position.z, target: v.target }));
  const from = { x: STAND.x, z: STAND.z + 1.6 };
  const rows = spawns.map((s) => ({ ...s, d: Math.hypot(s.x - from.x, s.z - from.z) })).sort((a, b) => a.d - b.d);
  return { from, nearest: rows[0], all: rows.map((r) => ({ id: r.id, x: r.x, y: r.y, z: r.z, d: +r.d.toFixed(2) })), fpEyeHeight: mod.CAMERA?.fpEyeHeight ?? null, layoutVersion: mod.LAYOUT_VERSION };
}
const exp = await expectedSpawn();
console.log(JSON.stringify({ phase: 'expectation', stand: STAND, pavilion: PAVILION, spawn: { id: exp.nearest.id, x: exp.nearest.x, y: exp.nearest.y, z: exp.nearest.z, d: +exp.nearest.d.toFixed(2), eyeHeight: exp.fpEyeHeight }, allSpawns: exp.all }, null, 1));

/* ---------------- 启动浏览器 ---------------- */
const { server, port } = await startServer();
const profile = mkdtempSync(join(tmpdir(), 't99-'));
const chrome = spawn(CHROME, [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-crash-reporter', '--disable-gpu',
  '--enable-unsafe-swiftshader', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, `--user-data-dir=${profile}`,
  '--remote-debugging-port=9333', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
await waitFor(async () => {
  try { const r = await fetch('http://127.0.0.1:9333/json/version'); return r.ok; } catch { return false; }
}, { label: 'CDP 就绪', timeoutMs: 40000 });
// 连接**页面目标**（browser 级 WS 没有 Page 域）
const pageTarget = await waitFor(async () => {
  try {
    const r = await fetch('http://127.0.0.1:9333/json/list');
    const list = r.ok ? await r.json() : [];
    return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ?? null;
  } catch { return null; }
}, { label: '页面目标', timeoutMs: 30000 });
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new Cdp(ws);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
const url = `http://127.0.0.1:${port}/index.html?ui=1`;
await cdp.send('Page.navigate', { url });
await waitFor(() => cdp.eval('window.__PALACE_READY__ === true || (window.__PALACE__ && window.__PALACE__.state && document.querySelector("[data-ui-panel=\\"hud\\"]") ? true : false)'), { label: '首帧就绪', timeoutMs: 90000 });
await sleep(2000);

const readings = { url, viewport: VIEWPORT, phase: {}, shots: [] };

/* 0) 基线：进入第一人称并站到亭前 */
await cdp.eval(`(() => { const a = window.__PALACE__; a.rig.enterFp({ position: { x: ${STAND.x}, y: 0, z: ${STAND.z} }, instant: true }); return a.rig.describe().mode; })()`);
await sleep(800);
readings.phase.enterFp = await cdp.eval(`(() => { const a = window.__PALACE__; const d = a.rig.describe(); const v = a.rig.viewDirection(); return { mode: d.mode, isFp: a.rig.isFp, position: { x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3) }, view: { x: +v.x.toFixed(3), z: +v.z.toFixed(3) }, zoneErrors: (a.zoneErrors ?? []).length, zones: Object.keys(a.zones ?? {}) }; })()`);

/* 1) 转向亭中心（闭环：读到视线与目标方向差 <3°） */
for (let i = 0; i < 4; i += 1) {
  const err = await cdp.eval(`(() => {
    const a = window.__PALACE__, v = a.rig.viewDirection(), p = a.rig.describe().position;
    const want = Math.atan2(${PAVILION.cx} - p.x, ${PAVILION.cz} - p.z);
    const cur = Math.atan2(v.x, v.z);
    let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    a.rig.applyInput('rotate', { dx: -d / 0.0026, dy: 0 });
    return { wantDeg: +(want * 180 / Math.PI).toFixed(2), curDeg: +(cur * 180 / Math.PI).toFixed(2), afterDeg: +(Math.atan2(a.rig.viewDirection().x, a.rig.viewDirection().z) * 180 / Math.PI).toFixed(2), resid: +(d * 180 / Math.PI).toFixed(2) };
  })()`);
  readings.phase[`aim${i}`] = err;
  if (Math.abs(err.resid) < 5) break;
  await sleep(150);
}
await sleep(400);
readings.shots.push({ step: '01-fp-stand-before-pavilion', ...(await cdp.shot('t99-01-fp-stand.png')) });

/* 2) 顶住亭子：真实按住 W，轮询提示/HUD 出现时刻 */
await cdp.keyDown('KeyW', 'w', 87);
const timeline = [];
let hint = null, hud = null;
const t0 = Date.now();
while (Date.now() - t0 < 9000) {
  const snap = await cdp.eval(`(() => {
    const panels = [...document.querySelectorAll('[data-ui-panel]')].map((e) => e.getAttribute('data-ui-panel'));
    const stuck = document.querySelector('[data-ui-panel="stuck"]');
    const toast = document.querySelector('[data-ui-panel="toast"], [data-ui-panel="hint"], [data-ui-panel="prompt"]');
    const texts = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /开敞构筑物|好像卡住了|回到最近安全点/.test(e.textContent || '')).map((e) => e.textContent.trim().slice(0, 120));
    return {
      t: ${Date.now()} - ${t0},
      pos: { x: +window.__PALACE__.rig.describe().position.x.toFixed(3), z: +window.__PALACE__.rig.describe().position.z.toFixed(3) },
      panels, stuckVisible: !!stuck && getComputedStyle(stuck).display !== 'none' && stuck.getBoundingClientRect().height > 0,
      toastVisible: !!toast && getComputedStyle(toast).display !== 'none' && toast.getBoundingClientRect().height > 0,
      texts: [...new Set(texts)].slice(0, 6),
    };
  })()`);
  timeline.push(snap);
  if (!hint && snap.texts.some((t) => /开敞构筑物/.test(t))) {
    hint = snap;
    readings.shots.push({ step: '02-open-structure-hint', ...(await cdp.shot('t99-02-open-hint.png')) });
  }
  if (!hud && snap.stuckVisible) {
    hud = snap;
    readings.shots.push({ step: '03-stuck-hud', ...(await cdp.shot('t99-03-stuck-hud.png')) });
  }
  if (hint && hud) break;
  await sleep(200);
}
readings.phase.timeline = timeline;
// 证据：连续顶住 8.6s 后，"卡死 HUD"仍未出现（display:none）——留图名为 03
readings.shots.push({ step: '03-stuck-hud-ABSENT', ...(await cdp.shot('t99-03-stuck-hud-absent.png')) });
readings.phase.pinnedState = await cdp.eval(`(() => { const a = window.__PALACE__, d = a.rig.describe(); const st = document.querySelector('[data-ui-panel=\"stuck\"]'); const r = st.getBoundingClientRect(); return { mode: d.mode, isFp: a.rig.isFp, pos: { x: +d.position.x.toFixed(3), z: +d.position.z.toFixed(3) }, stuckDisplay: getComputedStyle(st).display, stuckRect: { w: r.width, h: r.height }, view: a.store.snapshot().view }; })()`);
await cdp.keyUp('KeyW', 'w', 87);
await sleep(300);
readings.phase.hint = hint; readings.phase.hud = hud;

/* 3) HUD/提示元素的几何与样式（含遮挡判定 elementFromPoint） */
readings.phase.dom = await cdp.eval(`(() => {
  const out = {};
  const pick = (sel) => document.querySelector(sel);
  const describeEl = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(cx, cy);
    return {
      rect: { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity, color: cs.color, background: cs.backgroundColor, border: cs.borderTopColor, zIndex: cs.zIndex,
      text: (el.textContent || '').trim().slice(0, 220),
      coveredBy: top && !el.contains(top) && top !== el ? (top.getAttribute('data-ui-panel') || top.className || top.tagName) : null,
    };
  };
  out.stuck = describeEl(pick('[data-ui-panel="stuck"]'));
  out.stuckButton = describeEl(pick('[data-ui-panel="stuck"] [data-ui-part="escape"]') || pick('[data-ui-panel="stuck"] button'));
  const all = [...document.querySelectorAll('body *')];
  const hintEl = all.filter((e) => e.children.length === 0 && /开敞构筑物/.test(e.textContent || '')).map((e) => e.closest('[data-ui-panel]') || e.parentElement)[0] ?? null;
  out.hint = describeEl(hintEl);
  out.uiRegion = hintEl ? hintEl.getAttribute('data-ui-panel') : null;
  out.panelsVisible = [...document.querySelectorAll('[data-ui-panel]')].filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; }).map((e) => e.getAttribute('data-ui-panel'));
  return out;
})()`);

/* 4) G 脱困（真实按键）并读落点 */
const beforeG = await cdp.eval(`(() => { const d = window.__PALACE__.rig.describe(); return { mode: d.mode, x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3) }; })()`);
await cdp.press('KeyG', 'g', 71);
await sleep(1600);
const afterG = await cdp.eval(`(() => { const a = window.__PALACE__, d = a.rig.describe(); return { mode: d.mode, isFp: a.rig.isFp, x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3) }; })()`);
readings.phase.beforeG = beforeG; readings.phase.afterG = afterG;
readings.phase.toastAfterG = await cdp.eval(`(() => { const t = document.querySelector('[data-ui-panel=\"toast\"]'); return { visible: t ? getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().height > 0 : false, text: t ? (t.textContent || '').trim().slice(0, 240) : null }; })()`);
readings.phase.viewAfterG = await cdp.eval(`window.__PALACE__.store.snapshot().view`);
readings.shots.push({ step: '04-after-escape', ...(await cdp.shot('t99-04-after-escape.png')) });
readings.phase.hudAfterEscape = await cdp.eval(`(() => { const e = document.querySelector('[data-ui-panel="stuck"]'); return e ? { visible: getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0, text: (e.textContent || '').trim().slice(0, 160) } : null; })()`);
/* 5) 脱困后画面再走一小步（证明位置合法、可继续移动） */
await cdp.keyDown('KeyW', 'w', 87); await sleep(900); await cdp.keyUp('KeyW', 'w', 87); await sleep(400);
readings.phase.walkAfterEscape = await cdp.eval(`(() => { const d = window.__PALACE__.rig.describe(); return { x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3) }; })()`);
readings.shots.push({ step: '05-after-escape-walk', ...(await cdp.shot('t99-05-after-escape-walk.png')) });

writeFileSync(join(OUT, 't99-readings.json'), JSON.stringify(readings, null, 1));
console.log(JSON.stringify({ phase: 'browser', shots: readings.shots, afterG, expected: { id: exp.nearest.id, x: exp.nearest.x, y: exp.nearest.y, z: exp.nearest.z }, dom: readings.phase.dom, hudAfterEscape: readings.phase.hudAfterEscape }, null, 1));

ws.close();
chrome.kill('SIGKILL');
server.close();
rmSync(profile, { recursive: true, force: true });
process.exit(0);
