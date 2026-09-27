/**
 * docs/shots-airwall/t99-cdp-driver.mjs —— t99（V1.4）真实浏览器 CDP 验收驱动
 * =============================================================================
 * 目的：为 t87 交付的**用户可见行为**（开敞亭提示 / 卡死 HUD 条 / G 脱困）产出真实 1440×900 截图 +
 *       manifest（字节/sha256/判空统计/区域像素对比度），并机器复核脱困落点。
 *
 * 纪律（本卡 = verification，只做验收）：
 *   · 只读页面（`__PALACE__` 公开 API + 真实键鼠事件）；**不修改 src/**；
 *   · 截图与读数只写本目录（`docs/shots-airwall/`，本卡 inScope）；
 *   · URL 用 `?ui=1`（**不**用 `?ui=0&shot=1`，否则 §11.3 会隐藏 UI，就看不到提示/HUD）。
 *
 * 用法：node docs/shots-airwall/t99-cdp-driver.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decodePng } from './t99-png-stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');            // imperial-palace-dsh-1.1b
const OUT = HERE;                                // docs/shots-airwall
const VIEWPORT = { width: 1440, height: 900 };
const CHROME = process.env.CHROME_PATH
  ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (v, n = 3) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(n) : v);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

/* ---------------- 静态服务器（只读） ---------------- */
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
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      }
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
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = join(OUT, name);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return { file: name, bytes: statSync(file).size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
  }
}
async function waitFor(fn, { timeoutMs = 60000, intervalMs = 250, label = 'cond' } = {}) {
  const end = Date.now() + timeoutMs; let last = null;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(intervalMs); }
  throw new Error(`等待超时（${label}）：${String(last).slice(0, 200)}`);
}

/* ---------------- 场景参数 ---------------- */
const PAVILION = { id: 'B-pavilion-gate-west', name: '门殿西翼亭', cx: -58, cz: -386, half: 8 };
/** t101/t103 后：开敞亭已由"空气墙(blocks:'all')"改为"门洞可通行(blocks:'exceptDoor' + door)"，
 *  故"走向亭子"的场景改为**穿过门洞**（更好的结果），而"被顶住"的场景取亭南墙实体段（门洞之外）。 */
const STAND = { x: -58, z: PAVILION.cz + PAVILION.half + 2.0 };      // 亭门前 2m（正对门洞）
const WALL = { x: -292, z: -300 };   // 宫墙西段内侧 8m；墙长 916m ⇒ 即使有微小侧向滑动也持续受阻
const WALL_TARGET = { x: -420, z: -300 }; // 正西（垂直于墙面）

const layoutMod = await import(join(ROOT, 'src/shared/layout.js'));
const spawns = layoutMod.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn')
  .map((v) => ({ id: v.id, x: v.position.x, y: v.position.y, z: v.position.z }));
const from = { x: STAND.x, z: STAND.z + 1.6 };
const expectNearest = spawns
  .map((s) => ({ ...s, d: Math.hypot(s.x - from.x, s.z - from.z) }))
  .sort((a, b) => a.d - b.d)[0];
const { CONFIG } = await import(join(ROOT, 'src/shared/config.js'));
const fpEyeHeight = CONFIG.CAMERA.fpEyeHeight;
const extent = layoutMod.TERRAIN_EXTENT;
console.log(JSON.stringify({ phase: 'expectation(node)', stand: STAND, pavilion: PAVILION, nearestSpawn: expectNearest, allSpawns: spawns.map((s) => `${s.id}(${s.x},${s.y},${s.z})`), fpEyeHeight, extent }, null, 1));

/* ---------------- 启动浏览器 ---------------- */
const { server, port } = await startServer();
const profile = mkdtempSync(join(tmpdir(), 't99-'));
const chrome = spawn(CHROME, [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-crash-reporter', '--disable-gpu',
  '--enable-unsafe-swiftshader', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, `--user-data-dir=${profile}`,
  '--remote-debugging-port=9333', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
await waitFor(async () => { try { return (await fetch('http://127.0.0.1:9333/json/version')).ok; } catch { return false; } }, { label: 'CDP 就绪', timeoutMs: 40000 });
const pageTarget = await waitFor(async () => {
  try {
    const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
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
await waitFor(() => cdp.eval('window.__PALACE_READY__ === true'), { label: '首帧就绪', timeoutMs: 120000 });
await sleep(2200);

const readings = { card: 't99 V1.4 attempt 2', url, viewport: VIEWPORT, shots: [], phase: {}, regions: {}, visibility: {} };

/* 区域像素统计（真实 PNG × DOM rect）：只读，无副作用 */
const pngStatsRaw = (file, rect) => {
  const img = decodePng(join(OUT, file));
  const lumaAt = (x, y) => {
    const i = (Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * img.ch;
    return (0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2]) / 255;
  };
  let n = 0; let sum = 0; let min = 1; let max = 0; let dark = 0;
  for (let y = Math.floor(rect.y); y < Math.floor(rect.y + rect.h); y += 1) {
    for (let x = Math.floor(rect.x); x < Math.floor(rect.x + rect.w); x += 1) {
      const l = lumaAt(x, y); n += 1; sum += l; if (l < min) min = l; if (l > max) max = l; if (l < 0.08) dark += 1;
    }
  }
  let rn = 0; let rsum = 0;
  for (let y = Math.max(0, Math.floor(rect.y) - 6); y < Math.floor(rect.y + rect.h) + 6; y += 1) {
    for (let x = Math.max(0, Math.floor(rect.x) - 6); x < Math.floor(rect.x + rect.w) + 6; x += 1) {
      const inRect = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      if (inRect) continue;
      rsum += lumaAt(x, y); rn += 1;
    }
  }
  const inside = { n, mean: n ? +(sum / n).toFixed(4) : null, min: +min.toFixed(4), max: +max.toFixed(4), darkRatio: n ? +(dark / n).toFixed(4) : null };
  const ring = { n: rn, mean: rn ? +(rsum / rn).toFixed(4) : null };
  return { inside, ring, contrastAbs: ring.mean != null && inside.mean != null ? +Math.abs(inside.mean - ring.mean).toFixed(4) : null };
};
const domDescribePlaceholder = `(el) => {
  if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const top = document.elementFromPoint(cx, cy);
  return { rect: { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex, pointerEvents: cs.pointerEvents, color: cs.color, background: cs.backgroundColor, borderColor: cs.borderTopColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight, text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 220), coveredBy: top && top !== el && !el.contains(top) ? (top.getAttribute('data-ui-panel') || top.getAttribute('data-ui-part') || top.className || top.tagName) : null };
}`;

/* 0) 进入第一人称，站到亭前 */
await cdp.eval(`(() => { const a = window.__PALACE__; a.rig.enterFp({ position: { x: ${STAND.x}, y: 0, z: ${STAND.z} }, instant: true }); return true; })()`);
await sleep(900);
readings.phase.enterFp = await cdp.eval(`(() => { const a = window.__PALACE__, d = a.rig.describe(); return { mode: d.mode, isFp: a.rig.isFp, position: { x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3) }, zones: Object.keys(a.zones ?? {}), zoneErrors: (a.zoneErrors ?? []).length }; })()`);

/* 1) 转向亭中心（闭环） */
for (let i = 0; i < 4; i += 1) {
  const err = await cdp.eval(`(() => {
    const a = window.__PALACE__, v = a.rig.viewDirection(), p = a.rig.describe().position;
    const want = Math.atan2(${PAVILION.cx} - p.x, ${PAVILION.cz} - p.z);
    const cur = Math.atan2(v.x, v.z);
    let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    a.rig.applyInput('rotate', { dx: -d / 0.0026, dy: 0 });
    return { residDeg: +(d * 180 / Math.PI).toFixed(2) };
  })()`);
  readings.phase[`aim${i}`] = err;
  if (Math.abs(err.residDeg) < 5) break;
  await sleep(150);
}
await sleep(400);
readings.shots.push({ step: '01-fp-stand-before-pavilion', ...(await cdp.shot('t99-01-fp-stand.png')) });

/* 1b) 开敞亭"空气墙已清零"实测：正对门洞按住 W 走进去（数据 = blocks:'exceptDoor' + door 8m） */
readings.phase.pavilionObstacle = await cdp.eval(`(() => {
  const a = window.__PALACE__;
  const b = a.registry.getBuilding('${PAVILION.id}');
  return b ? { id: b.id, kind: b.kind, visitable: b.visitable, door: b.door ? { axis: b.door.axis, width: b.door.width, sillY: b.door.sillY } : null, bounds: b.bounds } : null;
})()`);
{
  const before = await cdp.eval(`(() => { const d = window.__PALACE__.rig.describe(); return { x: +d.position.x.toFixed(3), z: +d.position.z.toFixed(3) }; })()`);
  await cdp.keyDown('KeyW', 'w', 87);
  const walkSamples = [];
  for (let i = 0; i < 6; i += 1) {
    await sleep(1100);
    const sample = await cdp.eval(`(() => {
      const a = window.__PALACE__, d = a.rig.describe();
      const texts = [...document.querySelectorAll('body *')]
        .filter((e) => e.children.length === 0 && /开敞构筑物|宫墙阻挡|墙体阻挡|不可进入|好像卡住了/.test(e.textContent || ''))
        .map((e) => e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80));
      const toast = document.querySelector('[data-ui-panel="toast"]');
      return {
        x: +d.position.x.toFixed(3), z: +d.position.z.toFixed(3),
        hintTexts: [...new Set(texts)],
        toastVisible: !!toast && getComputedStyle(toast).display !== 'none' && toast.getBoundingClientRect().height > 0,
      };
    })()`);
    walkSamples.push({ i, ...sample });
  }
  readings.phase.pavilionWalkSamples = walkSamples;
  readings.phase.pavilionDoorProbe = await cdp.eval(`(async () => {
    const { createWalkSolver } = await import('/src/interaction/walk-solver.js');
    const solver = createWalkSolver({});
    const out = {};
    for (const z of [-376, -380, -386, -390]) out['z' + z] = { ok: solver.probe(-58, z, 0).ok, surfaceY: solver.probe(-58, z, 0).surfaceY ?? null, reasons: solver.probe(-58, z, 0).reasons ?? [] };
    return out;
  })()`);
  const after = await cdp.eval(`(() => { const d = window.__PALACE__.rig.describe(); return { x: +d.position.x.toFixed(3), z: +d.position.z.toFixed(3) }; })()`);
  readings.phase.pavilionWalkIn = { before, after, advancedIntoFootprint: after.z < PAVILION.cz + PAVILION.half };
  readings.shots.push({ step: '02-pavilion-enterable-no-airwall', ...(await cdp.shot('t99-02-pavilion-enterable.png')) });
}

/* 2) 站到亭南墙实体段前，真实按住 W 顶住墙体：轮询「墙体阻挡」提示与卡死 HUD（阈值 1.5s 游戏时间） */
/* 注意：`enterFp` 在已处于第一人称时是 no-op（camera.js: `if (fpActive) return null`）⇒ 必须先 exit 再 enter */
const reposition = await cdp.eval(`(() => {
  const a = window.__PALACE__;
  if (a.rig.isFp) a.rig.exitFp({ source: 't99-reposition' });
  const r = a.rig.enterFp({ position: { x: ${WALL.x}, y: 0, z: ${WALL.z} }, instant: true });
  return { mode: a.rig.describe().mode, isFp: a.rig.isFp, at: r ? { x: r.position.x, z: r.position.z } : null };
})()`);
readings.phase.repositionToWall = reposition;
await sleep(700);
for (let i = 0; i < 4; i += 1) {
  const err = await cdp.eval(`(() => {
    const a = window.__PALACE__, v = a.rig.viewDirection(), p = a.rig.describe().position;
    const want = Math.atan2(${WALL_TARGET.x} - p.x, ${WALL_TARGET.z} - p.z);
    const cur = Math.atan2(v.x, v.z);
    let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    a.rig.applyInput('rotate', { dx: -d / 0.0026, dy: 0 });
    return { residDeg: +(d * 180 / Math.PI).toFixed(2) };
  })()`);
  readings.phase[`aimWall${i}`] = err;
  if (Math.abs(err.residDeg) < 0.25) break;
  await sleep(150);
}
await cdp.keyDown('KeyW', 'w', 87);
const timeline = [];
let hintShot = null; let hudShot = null;
const t0 = Date.now();
while (Date.now() - t0 < 70000) {
  await cdp.eval(`(() => {   /* 持续锁定正对墙面（消除微小偏航导致的沿墙滑动） */
    const a = window.__PALACE__, v = a.rig.viewDirection(), p = a.rig.describe().position;
    const want = Math.atan2(${WALL_TARGET.x} - p.x, ${WALL_TARGET.z} - p.z);
    const cur = Math.atan2(v.x, v.z);
    let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > 0.002) a.rig.applyInput('rotate', { dx: -d / 0.0026, dy: 0 });
    return true;
  })()`);
  const snap = await cdp.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    const texts = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /开敞构筑物|好像卡住了|回到最近安全点|宫墙阻挡|墙体阻挡|不可进入|请从城门/.test(e.textContent || '')).map((e) => e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 140));
    const st = q('[data-ui-panel="stuck"]');
    const ih = window.__PALACE__.ui?.interaction?.stats?.() ?? null;
    return {
      t: ${Date.now()} - ${t0},
      pos: { x: +window.__PALACE__.rig.describe().position.x.toFixed(3), z: +window.__PALACE__.rig.describe().position.z.toFixed(3) },
      panels: [...document.querySelectorAll('[data-ui-panel]')].map((e) => e.getAttribute('data-ui-panel')),
      stuckVisible: vis(st),
      stuckText: st ? (st.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 200) : null,
      texts: [...new Set(texts)].slice(0, 6),
      stuckSeconds: ih?.stuckSeconds ?? null, stuckIntent: ih?.stuckIntent ?? null, stuckMoved: ih?.stuckMoved ?? null, stuckSource: ih?.stuckIntentSource ?? null,
    };
  })()`);
  timeline.push(snap);
  if (!hintShot && snap.texts.some((t) => /宫墙阻挡|墙体阻挡|不可进入|开敞构筑物|请从城门/.test(t))) {
    hintShot = snap;
    readings.shots.push({ step: '03-blocked-hint', ...(await cdp.shot('t99-03-blocked-hint.png')) });
  }
  if (!hudShot && snap.stuckVisible) {
    hudShot = snap;
    readings.phase.domWhileVisible = await cdp.eval(`(() => {
      const describe = ${domDescribePlaceholder};
      const q = (s) => document.querySelector(s);
      const stuck = q('[data-ui-panel="stuck"]');
      const toast = q('[data-ui-panel="toast"]');
      return { stuck: describe(stuck), stuckButton: describe(stuck ? (stuck.querySelector('[data-ui-part="escape"]') || stuck.querySelector('button')) : null), toast: describe(toast), panelsVisible: [...document.querySelectorAll('[data-ui-panel]')].filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; }).map((e) => e.getAttribute('data-ui-panel')) };
    })()`);
    readings.shots.push({ step: '04-stuck-hud-visible', ...(await cdp.shot('t99-04-stuck-hud.png')) });
    // HUD 出现时的可见性像素测量（用刚拍下的这张图）
    const rec = readings.shots[readings.shots.length - 1];
    if (readings.phase.domWhileVisible?.stuck) readings.regions.stuckWhileVisible = pngStatsRaw(rec.file, readings.phase.domWhileVisible.stuck.rect);
    if (readings.phase.domWhileVisible?.stuckButton) readings.regions.stuckButtonWhileVisible = pngStatsRaw(rec.file, readings.phase.domWhileVisible.stuckButton.rect);
    if (readings.phase.domWhileVisible?.toast) readings.regions.toastWhileVisible = pngStatsRaw(rec.file, readings.phase.domWhileVisible.toast.rect);
  }
  if (hintShot && hudShot && snap.stuckSeconds >= 1.5) break;
  await sleep(300);
}
readings.phase.timeline = timeline;
readings.phase.hint = hintShot;
readings.phase.hud = hudShot;
if (!hintShot) readings.shots.push({ step: '03-blocked-hint-ABSENT', ...(await cdp.shot('t99-03-blocked-hint-absent.png')) });
if (!hudShot) readings.shots.push({ step: '04-stuck-hud-ABSENT', ...(await cdp.shot('t99-04-stuck-hud-absent.png')) });
readings.phase.stuckStateWhilePinned = await cdp.eval(`(() => {
  const st = document.querySelector('[data-ui-panel="stuck"]');
  const r = st ? st.getBoundingClientRect() : { width: 0, height: 0 };
  const a = window.__PALACE__;
  return { stuckVisible: !!st && getComputedStyle(st).display !== 'none' && r.height > 0, stuckDisplay: st ? getComputedStyle(st).display : null, stuckRect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, position: { x: +a.rig.describe().position.x.toFixed(3), z: +a.rig.describe().position.z.toFixed(3) } };
})()`);
await cdp.keyUp('KeyW', 'w', 87);
await sleep(400);

/* 3) 元素几何 / 样式 / 遮挡（真实画面判定用） */
const domDescribe = `(el) => {
  if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const top = document.elementFromPoint(cx, cy);
  return {
    rect: { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex,
    color: cs.color, background: cs.backgroundColor, borderColor: cs.borderTopColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
    text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 220),
    coveredBy: top && top !== el && !el.contains(top) ? (top.getAttribute('data-ui-panel') || top.getAttribute('data-ui-part') || top.className || top.tagName) : null,
  };
}`;
readings.phase.domAfterRelease = await cdp.eval(`(() => {
  const describe = ${domDescribePlaceholder};
  const stuck = document.querySelector('[data-ui-panel="stuck"]');
  const all = [...document.querySelectorAll('body *')];
  const hintEl = all.filter((e) => e.children.length === 0 && /开敞构筑物/.test(e.textContent || '')).map((e) => e.closest('[data-ui-panel]') || e.parentElement)[0] ?? null;
  return {
    stuck: describe(stuck),
    stuckButton: describe(stuck ? (stuck.querySelector('[data-ui-part="escape"]') || stuck.querySelector('button')) : null),
    hint: describe(hintEl),
    hintRegion: hintEl ? hintEl.getAttribute('data-ui-panel') : null,
    hintLine: hintEl ? hintEl.textContent.trim().replace(/\\s+/g, ' ').slice(0, 220) : null,
    panelsVisible: [...document.querySelectorAll('[data-ui-panel]')].filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; }).map((e) => e.getAttribute('data-ui-panel')),
    panelsOverlappingStuck: (() => {
      if (!stuck) return [];
      const a = stuck.getBoundingClientRect(); const out = [];
      for (const e of document.querySelectorAll('[data-ui-panel]')) {
        if (e === stuck) continue;
        const b = e.getBoundingClientRect();
        if (b.width === 0 || getComputedStyle(e).display === 'none') continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oz = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1 && oz > 1) out.push({ panel: e.getAttribute('data-ui-panel'), overlapPx: { w: +ox.toFixed(1), h: +oz.toFixed(1) } });
      }
      return out;
    })(),
  };
})()`);

/* 4) G 脱困（真实按键） + 机器复核落点 */
const preEscape = await cdp.eval(`(() => { const a = window.__PALACE__, d = a.rig.describe(); return { mode: d.mode, isFp: a.rig.isFp, x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3) }; })()`);
/* core 的最近登记出生点（权威口径：registry.nearestFpSpawn） */
const coreNearest = await cdp.eval(`(() => {
  const a = window.__PALACE__;
  const near = a.registry.nearestFpSpawn({ x: ${preEscape.x}, y: ${preEscape.y}, z: ${preEscape.z} });
  if (!near) return null;
  return { id: near.viewpoint.id, distance: +near.distance.toFixed(4), position: { x: near.viewpoint.position.x, y: near.viewpoint.position.y, z: near.viewpoint.position.z }, mode: near.viewpoint.mode };
})()`);
await cdp.press('KeyG', 'g', 71);
await sleep(1800);
const afterEscape = await cdp.eval(`(() => { const a = window.__PALACE__, d = a.rig.describe(); return { mode: d.mode, isFp: d.isFp, x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3) }; })()`);
readings.phase.preEscape = preEscape;
readings.phase.coreNearest = coreNearest;
readings.phase.afterEscape = afterEscape;
readings.shots.push({ step: '05-after-escape-G', ...(await cdp.shot('t99-05-after-escape.png')) });

/* 4b) 落点合法性：生产 FP 求解器 probe() + 包络 + 眼高 + 落点与 core 出生点逐值比较 */
readings.phase.landing = await cdp.eval(`(async () => {
  const a = window.__PALACE__;
  const d = a.rig.describe();
  const eye = ${fpEyeHeight};
  const { createWalkSolver } = await import('/src/interaction/walk-solver.js');
  const solver = createWalkSolver({});
  const probe = solver.probe(d.position.x, d.position.z, d.position.y - eye);
  const coreNear = a.registry.nearestFpSpawn({ x: ${preEscape.x}, y: ${preEscape.y}, z: ${preEscape.z} });
  const sp = coreNear?.viewpoint ?? null;
  return {
    mode: d.mode, isFp: d.isFp,
    landing: { x: +d.position.x.toFixed(4), y: +d.position.y.toFixed(4), z: +d.position.z.toFixed(4) },
    spawn: sp ? { id: sp.id, x: sp.position.x, y: sp.position.y, z: sp.position.z } : null,
    delta: sp ? { dx: +(d.position.x - sp.position.x).toFixed(6), dy: +(d.position.y - sp.position.y).toFixed(6), dz: +(d.position.z - sp.position.z).toFixed(6) } : null,
    probe: { ok: probe.ok, surfaceY: probe.surfaceY ?? null, reasons: probe.reasons ?? [] },
    envelope: { extent: { minX: ${extent.minX}, maxX: ${extent.maxX}, minZ: ${extent.minZ}, maxZ: ${extent.maxZ} }, inside: d.position.x >= ${extent.minX} && d.position.x <= ${extent.maxX} && d.position.z >= ${extent.minZ} && d.position.z <= ${extent.maxZ} },
    eye: { expected: sp ? +sp.position.y.toFixed(4) : null, actual: +d.position.y.toFixed(4), diff: sp ? +(d.position.y - sp.position.y).toFixed(6) : null, fpEyeHeight: eye },
  };
})()`);
readings.phase.hudAfterEscape = await cdp.eval(`(() => { const e = document.querySelector('[data-ui-panel="stuck"]'); return e ? { visible: getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0, text: (e.textContent||'').trim().replace(/\\s+/g,' ').slice(0, 160) } : null; })()`);
readings.phase.toastAfterEscape = await cdp.eval(`(() => { const t = document.querySelector('[data-ui-panel="toast"], [data-ui-panel="hint"], [data-ui-panel="prompt"]'); return t ? { visible: getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().height > 0, text: (t.textContent||'').trim().replace(/\\s+/g,' ').slice(0, 240) } : null; })()`);

/* 5) 脱困后继续走一小步（证明位置合法、可继续移动） */
await cdp.keyDown('KeyW', 'w', 87); await sleep(1000); await cdp.keyUp('KeyW', 'w', 87); await sleep(500);
readings.phase.walkAfterEscape = await cdp.eval(`(() => { const d = window.__PALACE__.rig.describe(); return { x: +d.position.x.toFixed(3), y: +d.position.y.toFixed(3), z: +d.position.z.toFixed(3), movedFromLanding: +Math.hypot(d.position.x - ${afterEscape.x}, d.position.z - ${afterEscape.z}).toFixed(3) }; })()`);
readings.shots.push({ step: '06-after-escape-walk', ...(await cdp.shot('t99-06-after-escape-walk.png')) });

/* 6) 区域像素可见性实测（用 DOM rect × 真实 PNG 像素） */
const pngStats = (file, rect) => {
  const img = decodePng(join(OUT, file));
  const lumaAt = (x, y) => {
    const i = (Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * img.ch;
    return (0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2]) / 255;
  };
  const region = (x0, y0, x1, y1) => {
    let n = 0; let sum = 0; let min = 1; let max = 0; let dark = 0;
    for (let y = Math.floor(y0); y < Math.floor(y1); y += 1) {
      for (let x = Math.floor(x0); x < Math.floor(x1); x += 1) {
        const l = lumaAt(x, y); n += 1; sum += l; if (l < min) min = l; if (l > max) max = l; if (l < 0.08) dark += 1;
      }
    }
    return { n, mean: n ? +(sum / n).toFixed(4) : null, min: +min.toFixed(4), max: +max.toFixed(4), darkRatio: n ? +(dark / n).toFixed(4) : null };
  };
  const inside = region(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  // 外环（紧贴矩形外扩 6px）用于对比度
  const ringOuter = region(Math.max(0, rect.x - 6), Math.max(0, rect.y - 6), rect.x + rect.w + 6, rect.y + rect.h + 6);
  const ringOnly = (() => {
    let sum = 0; let n = 0;
    for (let y = Math.max(0, rect.y - 6); y < rect.y + rect.h + 6; y += 1) {
      for (let x = Math.max(0, rect.x - 6); x < rect.x + rect.w + 6; x += 1) {
        const inRect = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
        if (inRect) continue;
        sum += lumaAt(x, y); n += 1;
      }
    }
    return { n, mean: n ? +(sum / n).toFixed(4) : null };
  })();
  return { inside, ring: ringOnly, contrastAbs: ringOnly.mean != null && inside.mean != null ? +Math.abs(inside.mean - ringOnly.mean).toFixed(4) : null, ringOuterMean: ringOuter.mean };
};
const byStep = (step) => readings.shots.find((sh) => sh.step === step);
const hintShotRec = byStep('02-open-structure-hint');
const hudShotRec = byStep('03-stuck-hud-visible');
if (hintShotRec && domVis?.hint) readings.regions.hint = pngStats(hintShotRec.file, readings.phase.dom.hint.rect);
if (hudShotRec && domVis?.stuck) readings.regions.stuck = pngStats(hudShotRec.file, readings.phase.dom.stuck.rect);
if (hudShotRec && domVis?.stuckButton) readings.regions.stuckButton = pngStats(hudShotRec.file, readings.phase.dom.stuckButton.rect);
for (const sh of readings.shots) {
  const img = decodePng(join(OUT, sh.file));
  let sum = 0; let sum2 = 0; let dark = 0; let clip = 0; const n = img.w * img.h;
  for (let i = 0; i < n; i += 1) {
    const l = (0.2126 * img.px[i * img.ch] + 0.7152 * img.px[i * img.ch + 1] + 0.0722 * img.px[i * img.ch + 2]) / 255;
    sum += l; sum2 += l * l; if (l < 0.08) dark += 1; if (l > 0.9) clip += 1;
  }
  const mean = sum / n;
  sh.size = `${img.w}×${img.h}`;
  sh.lumaMean = +mean.toFixed(4);
  sh.lumaStd = +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(4);
  sh.lumaStd255 = +(sh.lumaStd * 255).toFixed(2);
  sh.darkRatio = +(dark / n).toFixed(4);
  sh.clipRatio = +(clip / n).toFixed(4);
  sh.blankCheck = { ok: sh.bytes > 60000 && sh.lumaStd255 >= 8 && img.w === VIEWPORT.width && img.h === VIEWPORT.height, minBytes: 60000, minStd255: 8, note: 't78 口径：<60KB 或 std(0–255) <8 判空；std 同时给出 0–1 与 0–255 两种刻度' };
}
const domVis = readings.phase.domWhileVisible ?? readings.phase.domAfterRelease ?? null;
const visEntry = (el, region, minH = 18, minW = 0) => {
  if (!el) return null;
  const pointerNone = el.pointerEvents === 'none';
  const contrastOk = (region?.contrastAbs ?? 0) >= 0.02;
  const occluded = pointerNone ? false : !!el.coveredBy; // pointer-events:none 的浮层 elementFromPoint 必然返回下层 ⇒ 不作为遮挡依据
  return {
    rect: el.rect,
    coveredBy: el.coveredBy ?? null,
    occlusionBasis: pointerNone ? 'pointer-events:none ⇒ elementFromPoint 不可用，改用像素对比+面板重叠证据' : 'elementFromPoint',
    contrastAbs: region?.contrastAbs ?? null,
    textColor: el.color,
    background: el.background,
    borderColor: el.borderColor ?? null,
    text: el.text ? el.text.slice(0, 200) : null,
    ok: el.rect.h >= minH && (el.rect.w >= minW || minW === 0) && contrastOk && !occluded,
  };
};
readings.visibility = {
  rule: '可见性判据（本卡自定；判空阈值沿用 t78 的 <60KB/std<8 口径）：区域高度 ≥18px、区域与外环的亮度差 ≥0.02、elementFromPoint 未被其它面板遮挡、且与其它可见面板的两两重叠为 0',
  hint: visEntry(domVis?.hint, readings.regions.hint),
  stuck: visEntry(domVis?.stuck, readings.regions.stuckWhileVisible ?? readings.regions.stuck),
  stuckButton: visEntry(domVis?.stuckButton, readings.regions.stuckButtonWhileVisible ?? readings.regions.stuckButton, 18, 40),
  toast: visEntry(domVis?.toast, readings.regions.toastWhileVisible, 18, 80),
  stuckOverlaps: domVis?.panelsOverlappingStuck ?? [],
  measuredAt: readings.phase.domWhileVisible ? '卡死 HUD 可见的同一时刻（按住 W 期间）' : '释放按键之后（回退快照，可能已自动隐藏）',
};

const manifest = {
  card: 't99 V1.4 空气墙提示与脱困的浏览器可见性证据（attempt 2）',
  generatedAt: new Date().toISOString(),
  root: ROOT,
  browser: CHROME,
  viewport: VIEWPORT,
  url,
  blankCheckRule: { minBytes: 60000, minStd255: 8, exactSize: `${VIEWPORT.width}x${VIEWPORT.height}` },
  screenshots: readings.shots.map((sh) => ({ file: sh.file, step: sh.step, bytes: sh.bytes, sha256: sh.sha256, size: sh.size, lumaMean: sh.lumaMean, lumaStd: sh.lumaStd, lumaStd255: sh.lumaStd255, darkRatio: sh.darkRatio, clipRatio: sh.clipRatio, blankCheck: sh.blankCheck })),
  machineVerified: {
    coreNearest: readings.phase.coreNearest,
    landing: readings.phase.landing,
    hudVisibleWhilePinned: readings.phase.stuckStateWhilePinned,
    hudAfterEscape: readings.phase.hudAfterEscape,
  },
  visibility: readings.visibility,
  regionPixelStats: readings.regions,
};
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(OUT, 't99-readings.json'), `${JSON.stringify(readings, null, 1)}\n`);

console.log(JSON.stringify({
  phase: 'result',
  shots: manifest.screenshots.map((s) => `${s.file} ${s.bytes}B std=${s.lumaStd} blank=${s.blankCheck.ok}`),
  hint: readings.visibility.hint,
  stuck: readings.visibility.stuck,
  stuckButton: readings.visibility.stuckButton,
  coreNearest: readings.phase.coreNearest,
  landing: readings.phase.landing,
  hudAfterEscape: readings.phase.hudAfterEscape,
  walkAfterEscape: readings.phase.walkAfterEscape,
}, null, 1));

ws.close();
chrome.kill('SIGKILL');
server.close();
rmSync(profile, { recursive: true, force: true });
process.exit(0);
