/**
 * `scripts/probe-motion-edges.mjs` —— **第一人称移动中"建筑边缘异常"** 的移动协议探针（只读；不改产品代码）。
 * =============================================================================
 * 来源：用户实测反馈『现在第一人称移动的时候 建筑边缘还是会出问题』。
 * 与 `probe-flicker.mjs`（t1/t25：**静止**画面的闪烁）的区别：本探针采样**移动中**的画面。
 *
 * 移动协议（口径三要素）：
 *   ① 驱动：页面自身 rAF 冻结后，由 `__MOTION__.stepFrame(dt)` **逐字复刻** main.js 的生产帧序列
 *      （区域 update → rig.update → environment.update → render → recordFrame），dt = 1/60；
 *   ② 输入：**真实键盘事件路径**（`window.dispatchEvent(new KeyboardEvent('keydown'|'keyup',{code}))`
 *      → `interaction` 键盘层 → core 相机装置的 `keys` 集合 → `updateFp()`），不是直接改相机；
 *   ③ 判据：相邻帧逐像素差（阈值 0 = 任何位差都算），并按**四类**分类到不同读数。
 *
 * 每臂 ≥30 帧，逐帧产出：不稳定像素（去重坐标集合）／变化总数／节奏序列／分类计数。
 * 分类口径（都从帧数据现算，不靠猜）：
 *   (a) 时间性边缘爬行 `edgePixels`  = 不稳定像素中**帧 A 处梯度 ≥ EDGE_GRAD(60)** 者
 *       `flatPixels`                    = 梯度 ≤ FLAT_GRAD(12) 者（平坦区）
 *   (b) Z-fighting `coincidentPairs` = 对不稳定像素做**双命中射线**：命中深度差 < 0.02m 的像素数
 *       （共面/重叠面在同一像素翻面 ⇒ 与是否移动无关；另有 `static` 静止臂对照）
 *   (c) 近平面裁切 `nearHoles`       = 贴墙臂里"墙面像素变成背景色"的像素数（看穿/墙体消失）
 *       `nearestDist`                  = 逐帧相机到最近几何的距离（中心射线 + 四角射线）
 *   (d) 阴影边缘闪 `shadowDelta`     = 同一移动协议在 `castShadow=false` 下的不稳定像素对照差
 *   【新增必查项】烟柱 LOD：逐帧记录每柱 `pointPx` 与**生产 `points.visible`**，统计跨越门限时的
 *       `visibleFlips`（0 = 无跳变；>0 = 移动中整柱跳变 ⇒ 需滞回）。
 *
 * 用法：
 *   node scripts/probe-motion-edges.mjs                        # 全部臂（默认 32 帧）
 *   node scripts/probe-motion-edges.mjs --arms=w,rot,static
 *   node scripts/probe-motion-edges.mjs --frames=30 --quality=medium
 *   node scripts/probe-motion-edges.mjs --expect=rot:nearHoles:0
 * 产物：`/tmp/t40-motion.json` + `/tmp/t40-shots/`（可用 MOTION_OUT=<dir> 改写）
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { inflateSync } from 'node:zlib';

const ROOT = process.cwd();
const OUT = process.env.MOTION_OUT ?? '/tmp/t40-shots';
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH
  ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const W = Number(process.env.W ?? 960);
const H = Number(process.env.H ?? 540);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

/* ------------------------------- CLI ------------------------------- */
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const hit = argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '1';
};
const FRAMES = Number(arg('frames', process.env.FRAMES ?? 32));
const VIEW = arg('view', 'fp');
const QUALITY = arg('quality', process.env.QUAL ?? 'medium');
const ARMS = (arg('arms', 'static-frozen,static-live,w-frozen,a-frozen,d-frozen,rot-frozen,wall-frozen,w-frozen-smokeoff,w-frozen-shadowoff,rot-frozen-shadowoff,lod-live') || '').split(',').map((s) => s.trim()).filter(Boolean);
const JSON_OUT = arg('json', '/tmp/t40-motion.json');
const EDGE_GRAD = Number(arg('edgegrad', 60));
const FLAT_GRAD = Number(arg('flatgrad', 12));
const FLAT_FLIP = Number(arg('flipdelta', 30));
/** t40：`--emu-prefix=1` = 运行时复现 t25 的**单门限**规则（只用于同轨迹的前后对照；不改产品代码）。 */
const EMU_PREFIX = arg('emu-prefix', '0') === '1';

/* --------------------------- PNG 解码 / 比较 --------------------------- */
function decodePng(buf) {
  let pos = 8; let w = 0; let h = 0; let bitDepth = 0; let colorType = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8); const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`PNG 不支持：depth=${bitDepth} color=${colorType}`);
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch; const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= ch ? cur[i - ch] : 0; const b = prev[i]; const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { w, h, ch, data: out };
}
/** 逐像素比较（阈值 0 = 任何位差都算）。 */
function diffPixels(a, b, th = 0) {
  if (a.w !== b.w || a.h !== b.h) throw new Error('尺寸不一致');
  const changed = [];
  let maxDelta = 0;
  for (let y = 0; y < a.h; y += 1) {
    for (let x = 0; x < a.w; x += 1) {
      const i = (y * a.w + x) * a.ch;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > th) { changed.push([x, y, d]); if (d > maxDelta) maxDelta = d; }
    }
  }
  return { changed, maxDelta };
}
/** 灰度（Rec.601 整数近似） */
function gray(img, x, y) {
  const i = (y * img.w + x) * img.ch;
  return (img.data[i] * 77 + img.data[i + 1] * 150 + img.data[i + 2] * 29) >> 8;
}
/** 局部梯度幅值（4 邻域，带边界钳制） */
function gradAt(img, x, y) {
  const xm = Math.max(0, x - 1); const xp = Math.min(img.w - 1, x + 1);
  const ym = Math.max(0, y - 1); const yp = Math.min(img.h - 1, y + 1);
  const gx = gray(img, xp, y) - gray(img, xm, y);
  const gy = gray(img, x, yp) - gray(img, x, ym);
  return Math.abs(gx) + Math.abs(gy);
}
/** 背景（天空/清屏色）：取四角 6×6 的中位色，作为"看穿成背景"的判据。 */
function backgroundColor(img) {
  const samples = [];
  const corners = [[0, 0], [img.w - 6, 0], [0, img.h - 6], [img.w - 6, img.h - 6]];
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + 6; y += 1) for (let x = cx; x < cx + 6; x += 1) samples.push([img.data[(y * img.w + x) * img.ch], img.data[(y * img.w + x) * img.ch + 1], img.data[(y * img.w + x) * img.ch + 2]]);
  }
  const med = (k) => { const arr = samples.map((s) => s[k]).sort((a, b) => a - b); return arr[(arr.length / 2) | 0]; };
  return [med(0), med(1), med(2)];
}
const isBackground = (img, x, y, bg, tol = 12) => {
  const i = (y * img.w + x) * img.ch;
  return Math.abs(img.data[i] - bg[0]) <= tol && Math.abs(img.data[i + 1] - bg[1]) <= tol && Math.abs(img.data[i + 2] - bg[2]) <= tol;
};

/* --------------------------- 静态服务 + CDP --------------------------- */
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') p = join(ROOT, 'index.html');
  if (/^\/vendor\//.test(url.pathname)) p = join(ROOT, 'public', url.pathname.replace(/^\//, ''));
  try {
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(p));
  } catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const DBG = 9400 + (process.pid % 400);
const url = `http://127.0.0.1:${port}/index.html?view=${VIEW}&quality=${QUALITY}&ui=0`;
const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DBG}`,
  `--user-data-dir=/tmp/t40-chrome-${process.pid}`, `--window-size=${W},${H}`, url,
], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i += 1) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null; } catch { /* 等待 */ }
  if (!wsUrl) await sleep(300);
}
if (!wsUrl) { console.error('未找到 CDP 目标'); process.exit(2); }
const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};

/* --------------------------- 页内驱动助手（只改运行时状态，不改产品代码） --------------------------- */
const HELPERS = `(() => {
  const a = window.__PALACE__;
  if (!a || a.__motion) return 'already';
  const H = {};
  // 冻结**环境动画**（时间轴）：保留相机运动 ⇒ 逐帧差里剩下的就是"纯移动"效应（t1 的 lock-env 同源手段）
  const envU = a.environment.update;
  window.__FREEZE_ENV__ = false;
  a.environment.update = function (dt, elapsed, state) { if (window.__FREEZE_ENV__) return elapsed; return envU.call(this, dt, elapsed, state); };
  H.freezeEnv = (on) => { window.__FREEZE_ENV__ = !!on; return window.__FREEZE_ENV__; };
  /** 只推进**逻辑**（区域/相机/环境 update），不渲染 —— 用于静置（软件渲染下渲染是唯一瓶颈）。 */
  H.stepFast = (dt) => {
    if (!window.__RAF_FROZEN__) H.freezeLoop();
    window.__STEP_EL__ += dt;
    const el = window.__STEP_EL__;
    const st = a.store.state;
    for (const entry of a.zones.values()) { try { entry.result.update(dt, el, st); } catch (e) { /* 同生产 */ } }
    a.rig.update(dt, el, st);
    a.environment.update(dt, el, { ...st, cameraPosition: a.rig.position });
    return el;
  };
  /** 静置：推进 N 帧让镜头过渡/动画进入稳态（无输入；不渲染）。 */
  H.settle = (n, dt) => { const f = n ?? 120; const d = dt ?? 1 / 60; let el = null; for (let i = 0; i < f; i += 1) el = H.stepFast(d); H.stepFrame(d); return el; };
  H.freezeLoop = () => {
    if (window.__RAF_FROZEN__) return 'already';
    window.__RAF_FROZEN__ = true;
    window.__RAF_NATIVE__ = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    window.__STEP_EL__ = window.__EL__ ?? 0;
    return 'frozen';
  };
  /** 逐字复刻 main.js frameStep 的生产调用序列。 */
  H.stepFrame = (dt) => {
    if (!window.__RAF_FROZEN__) H.freezeLoop();
    window.__STEP_EL__ += dt;
    const el = window.__STEP_EL__;
    const st = a.store.state;
    for (const entry of a.zones.values()) { try { entry.result.update(dt, el, st); } catch (e) { /* 与生产循环同 */ } }
    a.rig.update(dt, el, st);
    a.environment.update(dt, el, { ...st, cameraPosition: a.rig.position });
    a.renderSystem.render(a.scene, a.rig.camera);
    a.renderSystem.recordFrame(dt * 1000);
    return el;
  };
  /** 运行时复现 t25 单门限规则（用生产同一式算出的 pointPx ⇒ 逐柱 visible = pointPx ≥ min）。 */
  H.emuPrefix = (on) => { window.__EMU_PREFIX__ = !!on; return window.__EMU_PREFIX__; };
  H.applyEmuPrefix = () => {
    if (!window.__EMU_PREFIX__) return 0;
    const g = a.scene.getObjectByName('environment-smoke');
    if (!g) return 0;
    // 用**产品自己的 pointPx**（describe().smoke，口径 = 生产 drawingBufferHeight()）复现 t25 单门限规则
    const d = a.environment.describe();
    const sys = d && d.smoke ? d.smoke.systems : null;
    if (!sys) return 0;
    let n = 0;
    for (const s of sys) {
      const pts = g.children[s.index];
      if (!pts || s.pointPx === null) continue;
      pts.visible = s.pointPx >= d.smoke.minPointPx;
      n += 1;
    }
    return n;
  };
  H.press = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: false })); return 'ok'; };
  /** 旋转 = 生产输入入口 applyInput('rotate')（与 t5 同口径：每帧固定角步长）。 */
  H.rotate = (dx) => a.rig.applyInput('rotate', { dx, dy: 0 });
  H.release = (code) => { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: false })); return 'ok'; };
  H.releaseAll = () => { for (const c of ['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight']) H.release(c); return 'ok'; };
  H.enterFp = (pos) => {
    if (a.rig.isFp) a.rig.exitFp({ source: 'probe' });
    const r = a.rig.enterFp({ source: 'probe', instant: true, selectionAware: false, position: pos ? { x: pos.x, z: pos.z } : null });
    return r ? { ok: true, position: r.position } : { ok: false };
  };
  H.fp = () => ({ isFp: a.rig.isFp, mode: a.rig.describe().mode, position: a.rig.position, target: a.rig.target, near: a.rig.activeCamera ? a.rig.activeCamera().near : null, far: a.rig.activeCamera ? a.rig.activeCamera().far : null, fov: a.rig.activeCamera ? a.rig.activeCamera().fov : null });
  /** t40：**产品自己的读数**（visible/pointPx/锚点）—— 优先用它，避免探针复算与产品口径漂移。 */
  H.productSmoke = () => {
    const d = a.environment.describe();
    return d && d.smoke ? d.smoke : null;
  };
  H.stats = () => { const g = a.renderSystem.getStats(); return { frames: g.frames, drawCalls: g.drawCalls ?? g.render?.calls ?? null, triangles: g.triangles ?? g.render?.triangles ?? null, aa: g.quality ? g.quality.antialias : null, raw: { calls: a.renderSystem.renderer ? a.renderSystem.renderer.info.render.calls : null, tris: a.renderSystem.renderer ? a.renderSystem.renderer.info.render.triangles : null } }; };
  /**
   * 烟柱逐柱读数：沿用**生产**判据（pointPx = size · (drawingBufferHeight/2) / dist）与**生产** visible 标志，
   * 不重算 LOD（读数就是产品自己算出来的 visible）。
   */
  H.smoke = () => {
    const g = a.scene.getObjectByName('environment-smoke');
    if (!g) return { ok: false };
    const cp = a.rig.camera.position;
    const cv = a.renderSystem.renderer ? a.renderSystem.renderer.domElement : null;
    const drawH = cv ? cv.height : 900;
    const rows = [];
    g.children.forEach((pts, i) => {
      const attr = pts.geometry.getAttribute('position');
      let minD = Infinity;
      for (let k = 0; k < attr.count; k += 1) {
        const dx = attr.getX(k) - cp.x; const dy = attr.getY(k) - cp.y; const dz = attr.getZ(k) - cp.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < minD) minD = d;
      }
      rows.push({ index: i, visible: pts.visible, pointPx: +(pts.material.size * (drawH / 2) / Math.max(1e-6, minD)).toFixed(4), anchorDistance: +minD.toFixed(2) });
    });
    return { ok: true, drawH, groupVisible: g.visible, plumes: rows };
  };
  H.setShadow = (on) => {
    const s = a.scene.getObjectByName('environment-sun');
    if (!s) return { ok: false };
    const was = s.castShadow; s.castShadow = !!on; if (s.shadow) s.shadow.needsUpdate = true;
    return { ok: true, was, now: s.castShadow };
  };
  H.hide = (names) => { const missing = []; for (const n of names) { const o = a.scene.getObjectByName(n); if (!o) { missing.push(n); continue; } o.visible = false; } return { ok: missing.length === 0, missing }; };
  H.show = (names) => { for (const n of names) { const o = a.scene.getObjectByName(n); if (o) o.visible = true; } return 'ok'; };
  /** 中心+四角射线：相机到最近几何的距离（近平面穿模的量化） */
  H.nearest = () => {
    const T = a.rig.camera.constructor.prototype.isCamera ? null : null;
    return null;
  };
  /** 像素 → 命中链（含**前两命中深度差** = 共面/重叠面判据） */
  H.identify = async (points) => {
    const mod = await import('/src/kit/three-ref.js');
    const T = mod.THREE ?? mod.default;
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const rc = new T.Raycaster();
    const out = [];
    for (const [px, py] of points) {
      const ndc = new T.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, a.rig.camera);
      // three 的 Raycaster **不检查 visible**（已实测：被 setZoneVisible(false) 藏起来的 greybox
      // 仍会被命中，制造"gap=0 的共面双命中"假象）⇒ 这里按可见性链过滤，只认真正在画的物体。
      const shown = (o) => { let q = o; while (q) { if (q.visible === false) return false; q = q.parent; } return true; };
      // 只认**实心网格**（Points/Line 不算面：烟尘粒子互相重叠不是 Z-fighting —— 首轮实测踩过 1 例）
      const hits = rc.intersectObjects(a.scene.children, true).filter((h) => shown(h.object) && h.object.isMesh === true).slice(0, 3);
      const chainOf = (o) => { const c = []; let q = o; while (q) { c.push(q.name || q.type); q = q.parent; } return c.slice(0, 5); };
      out.push({
        px, py,
        hits: hits.map((h) => ({ dist: +h.distance.toFixed(4), chain: chainOf(h.object), obj: h.object.name || h.object.type })),
        depthGap: hits.length > 1 ? +(hits[1].distance - hits[0].distance).toFixed(4) : null,
      });
    }
    return out;
  };
  /** 相机到最近几何距离（屏幕网格 5×5 射线，取最小） */
  H.nearestDistances = async () => {
    const mod = await import('/src/kit/three-ref.js');
    const T = mod.THREE ?? mod.default;
    const rc = new T.Raycaster();
    const cam = a.rig.camera;
    let best = Infinity; let center = null;
    for (let i = 0; i < 5; i += 1) {
      for (let j = 0; j < 5; j += 1) {
        const ndc = new T.Vector2(-0.8 + i * 0.4, -0.8 + j * 0.4);
        rc.setFromCamera(ndc, cam);
        const hits = rc.intersectObjects(a.scene.children, true).filter((h) => { let q = h.object; while (q) { if (q.visible === false) return false; q = q.parent; } return true; });
        if (hits.length && hits[0].distance < best) { best = hits[0].distance; center = i === 2 && j === 2; }
      }
    }
    return { nearest: Number.isFinite(best) ? +best.toFixed(3) : null, centerHit: center };
  };
  /** 粗深度图（nx×ny 射线）⇒ 每像素按深度分带（近/中/远），用于把"移动中变化"按距离归因。 */
  H.depthGrid = async (nx, ny) => {
    const mod = await import('/src/kit/three-ref.js');
    const T = mod.THREE ?? mod.default;
    const rc = new T.Raycaster();
    const cam = a.rig.camera;
    const cells = [];
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const ndc = new T.Vector2(((i + 0.5) / nx) * 2 - 1, -(((j + 0.5) / ny) * 2 - 1));
        rc.setFromCamera(ndc, cam);
        const hits = rc.intersectObjects(a.scene.children, true).filter((h) => { let q = h.object; while (q) { if (q.visible === false) return false; q = q.parent; } return true; });
        cells.push(hits.length ? { d: +hits[0].distance.toFixed(2), obj: (hits[0].object.name || hits[0].object.type).slice(0, 28) } : { d: null, obj: 'sky' });
      }
    }
    const cv = a.renderSystem.renderer.domElement;
    return { nx, ny, w: cv.width, h: cv.height, cells };
  };
  H.viewpoint = (id) => {
    const vp = a.registry.getViewpoint ? a.registry.getViewpoint(id) : null;
    return vp ? { id: vp.id, position: vp.position, target: vp.target } : null;
  };
  H.background = () => {
    const s = a.scene;
    const c = s.background && s.background.isColor ? '#' + s.background.getHexString() : null;
    const f = s.fog ? { color: '#' + s.fog.color.getHexString(), near: s.fog.near, far: s.fog.far } : null;
    return { background: c, fog: f, canvas: (() => { const cv = document.querySelector('canvas'); return cv ? { w: cv.width, h: cv.height, cssW: cv.clientWidth, cssH: cv.clientHeight } : null; })() };
  };
  a.__motion = H;
  window.__MOTION__ = H;
  return 'ok';
})()`;

const BOOT = async () => {
  await send('Page.navigate', { url });
  for (let i = 0; i < 140; i += 1) { if (await evaluate('!!(window.__PALACE__ && window.__PALACE__.ready)')) break; await sleep(300); }
  await evaluate('window.__PALACE__.settle && window.__PALACE__.settle()');
  await sleep(400);
  const patched = await evaluate(HELPERS);
  return patched;
};

/* --------------------------- 臂定义 --------------------------- */
/** 每臂 = 输入 + 消融开关（消融用于**归因**，不改产品代码） */
const ARM_SPECS = {
  // ── 对照臂（无输入）──
  'static-frozen': { label: '静止 + 环境冻结（渲染确定性对照）', keys: [], env: 'frozen' },
  'static-live': { label: '静止 + 环境照常（时间动画噪声基线）', keys: [], env: 'live' },
  // ── 移动臂（环境冻结 ⇒ 逐帧差 = **纯移动**效应）──
  'w-frozen': { label: '按 W 直行 + 环境冻结', keys: ['KeyW'], env: 'frozen' },
  'a-frozen': { label: '按 A 横移 + 环境冻结', keys: ['KeyA'], env: 'frozen' },
  'd-frozen': { label: '按 D 横移 + 环境冻结', keys: ['KeyD'], env: 'frozen' },
  'rot-frozen': { label: '原地旋转（生产 applyInput rotate，0.5°/帧）+ 环境冻结', rotate: 0.5, env: 'frozen' },
  // 亚像素协议：每帧位移 < 1 像素 ⇒ 合法内容变化很小，任何大变化 = 时间性爬行（(a) 的决定性读数）
  'rot-crawl': { label: '原地**慢转**（0.03°/帧 ≈ 0.64px/帧）+ 环境冻结', rotate: 0.03, env: 'frozen' },
  'w-crawl': { label: '直行**慢速**（dt=1/600 ≈ 0.87cm/帧）+ 环境冻结', keys: ['KeyW'], env: 'frozen', dt: 1 / 600 },
  'wall-frozen': { label: '按 W 顶墙（近平面/穿模）+ 环境冻结', keys: ['KeyW'], env: 'frozen', frames: 60, spawn: 'interior' },
  // ── 归因臂（同一移动协议 + 单一消融）──
  'w-frozen-smokeoff': { label: '按 W + 环境冻结 + 隐藏烟柱（归因：烟柱）', keys: ['KeyW'], env: 'frozen', hide: ['environment-smoke'] },
  'w-frozen-shadowoff': { label: '按 W + 环境冻结 + 关阴影（归因：阴影）', keys: ['KeyW'], env: 'frozen', shadow: false },
  'rot-frozen-shadowoff': { label: '旋转 + 环境冻结 + 关阴影（归因：阴影）', rotate: 0.5, env: 'frozen', shadow: false },
  // ── 必查项：烟柱 LOD 门限附近的 visible 跳变（环境必须**照常**才有 LOD 判定）──
  'lod-live': { label: '逼近烟柱 LOD 门限 + 环境照常（逐帧 visible 翻转）', keys: ['KeyW'], env: 'live', frames: 96, spawn: 'lod', lodProbe: true },
};

const report = {
  protocol: {
    frames: FRAMES, size: [W, H], url, quality: QUALITY,
    drive: 'rAF 冻结 + __MOTION__.stepFrame(1/60)（逐字复刻 main.js frameStep）',
    input: '真实 KeyboardEvent（window.dispatchEvent）→ interaction 键盘层 → core 相机装置 keys → updateFp()',
    metric: '相邻帧逐像素差（阈值 0）；分类：梯度 ≥60 = 边缘型，≤12 = 平坦型；双命中深度差 <0.02m = 共面',
  },
  boot: null,
  background: null,
  arms: [],
  smokeBefore: null,
  smokeAfter: null,
};

const results = [];

/* --------------------------- 主流程 --------------------------- */
const patched = await BOOT();
report.boot = patched;
report.background = await evaluate('window.__MOTION__.background()');
const smoke0 = await evaluate('window.__MOTION__.smoke()');
const prod0 = await evaluate('window.__MOTION__.productSmoke()');
report.smokeBefore = smoke0;

await evaluate(`window.__MOTION__.emuPrefix(${EMU_PREFIX})`);
const spawnInfo = await evaluate('window.__MOTION__.enterFp(null)');
console.log(`服务端口 ${port}｜URL ${url}｜页内补丁=${patched}｜FP=${JSON.stringify(spawnInfo)}`);
console.log(`背景=${JSON.stringify(report.background)}`);
if (prod0) console.log(`生产烟柱读数：${JSON.stringify(prod0.systems)}｜band=${JSON.stringify(prod0.bandMetres)}`);
console.log(`相机（进 FP 后）=${JSON.stringify(await evaluate('window.__MOTION__.fp()'))}`);
if (smoke0.ok) console.log(`烟柱 ${smoke0.plumes.length} 柱：pointPx=${smoke0.plumes.map((p) => p.pointPx).join('/')}｜visible=${smoke0.plumes.map((p) => (p.visible ? 1 : 0)).join('/')}`);

for (const id of ARMS) {
  const spec = ARM_SPECS[id];
  if (!spec) { console.error(`未知臂：${id}（可用：${Object.keys(ARM_SPECS).join(', ')}）`); process.exit(2); }
  const N = spec.frames ?? FRAMES;
  await evaluate('window.__MOTION__.releaseAll(); window.__MOTION__.show(["environment-smoke"]); true');
  await evaluate('window.__MOTION__.setShadow(true)');
  // 定位：默认入口；wall/lod 臂用显式机位
  if (spec.spawn === 'wall') {
    await evaluate(`window.__MOTION__.enterFp({ x: 0, z: -404 - 3 })`); // B-gate-front 门外 3m，正对 26m 门洞
  } else if (spec.spawn === 'interior') {
    const vp = await evaluate(`window.__MOTION__.viewpoint('VP-B-interior')`);
    await evaluate(`window.__MOTION__.enterFp(${JSON.stringify(vp ? { x: vp.position.x, z: vp.position.z } : { x: 0, z: -116 })})`);
  } else if (spec.spawn === 'lod') {
    const pos = await evaluate(`(() => {
      const a = window.__PALACE__;
      const wp = a.registry.ids().viewpoints || [];
      const vp = (a.registry.viewpoints ? a.registry.viewpoints().find((v) => v.id === 'VP-B-interior') : null);
      return vp ? { x: vp.position.x, z: vp.position.z } : null;
    })()`);
    await evaluate(`window.__MOTION__.enterFp(${JSON.stringify(pos ?? { x: 0, z: -300 })})`);
  } else {
    await evaluate('window.__MOTION__.enterFp(null)');
  }
  if (spec.hide) await evaluate(`window.__MOTION__.hide(${JSON.stringify(spec.hide)})`);
  if (spec.shadow === false) await evaluate('window.__MOTION__.setShadow(false)');
  // 静置 120 帧：镜头过渡完成、动画进入稳态（**然后**才冻环境/按键 ⇒ 不计入测量）
  await evaluate('window.__MOTION__.settle(120)');
  await evaluate(`window.__MOTION__.freezeEnv(${spec.env === 'frozen'})`);
  await evaluate('window.__MOTION__.settle(6)'); // 冻结后再走 6 帧，确保冻结前后的最后一帧一致
  await sleep(120);

  const fp0 = await evaluate('window.__MOTION__.fp()');
  const stats0 = await evaluate('window.__MOTION__.stats()');
  const depth = await evaluate('window.__MOTION__.depthGrid(32, 18)');
  let approach = null;
  const frames = [];
  const smokeSeries = [];
  const nearestSeries = [];
  if (spec.lodProbe) {
    /**
     * ① **解析定位**到"目标柱点径 = 1.0 px"的距离（用生产自己的读数 `describe().smoke` 反解，
     *    四个方向各试一次，取实测误差最小者）——不靠摸索行走，避免被墙体挡住导致距离不动。
     */
    approach = await evaluate(`(() => {
      const H = window.__MOTION__;
      const prod0 = H.productSmoke();
      const drawH = prod0.bandMetres.drawH;              // 产品口径（生产 drawingBufferHeight() 回落值）
      // 选**当前点径最接近 1.0**的柱作为被测柱（用产品自己的读数，不猜）
      let idx = 0; let err0 = Infinity;
      prod0.systems.forEach((x) => { const e = Math.abs(x.pointPx - 1.0); if (e < err0) { err0 = e; idx = x.index; } });
      const px = () => H.productSmoke().systems[idx].pointPx;
      const trace = [{ k: -1, px: px(), dir: 0 }];
      // 方向探测：向前走 30 步（0.5s ≈ 2.6m），朝"更接近门限"的方向
      H.press('KeyW');
      for (let k = 0; k < 30; k += 1) H.stepFast(1 / 60);
      const pxFwd = px();
      H.release('KeyW');
      let dir = Math.abs(pxFwd - 1.0) < Math.abs(trace[0].px - 1.0) ? 'W' : 'S';
      H.press(dir === 'W' ? 'KeyW' : 'KeyS');
      // 粗走（2.6cm/步）到 |px-1| ≤ 0.02，再细走（0.87cm/步）到 ≤ 0.0015
      let coarseK = null;
      for (let k = 0; k < 4000; k += 1) {
        H.stepFast(1 / 60 * 0.3);
        if (k % 10 === 0) { const v = px(); if (Math.abs(v - 1.0) <= 0.02) { coarseK = k; break; } }
      }
      // 细走：把**振荡中心**钉在门限稍上（1.0018 ≈ 半个摆幅）⇒ 往复会**跨越** 1.0（否则读不到跳变，前后对照无效）
      const TARGET = 0.9982;   // 振荡中心落在门限**下方**半摆幅处 ⇒ 向上摆时跨越 1.0（实测摆幅 ≈0.007px）
      let fineK = null;
      for (let k = 0; k < 8000; k += 1) {
        H.stepFast(1 / 600);
        const v = px();
        if (Math.abs(v - TARGET) <= 0.0004) { fineK = k; break; }
      }
      H.release(dir === 'W' ? 'KeyW' : 'KeyS');
      const end = px();
      trace.push({ k: coarseK, px: pxFwd, dir });
      return { idx, drawH, dir, coarseK, fineK, startPx: trace[0].px, pxAfterProbe: pxFwd, endPx: end, err: Math.abs(end - 1.0), systems: H.productSmoke().systems.map((x) => ({ i: x.index, px: x.pointPx, visible: x.visible })) };
    })()`);
    // ② 在门限附近 **W/S 往复**（每 20 帧换向）→ 逐帧读 visible ⇒ 翻转计数
    //    首段走**反方向**：振荡中心定在门限稍上方（1.0018），向下摆才会**跨越** 1.0（否则前后对照无对象）
    const backKey = approach && approach.dir === 'W' ? 'KeyS' : 'KeyW';
    const fwdKey = backKey === 'KeyS' ? 'KeyW' : 'KeyS';
    await evaluate(`window.__MOTION__.press(${JSON.stringify(backKey)})`);
    for (let i = 0; i < N; i += 1) {
      if (i > 0 && i % 12 === 0) {
        const useBack = (i / 12) % 2 === 1;
        await evaluate(`window.__MOTION__.release(${JSON.stringify(useBack ? fwdKey : backKey)}); window.__MOTION__.press(${JSON.stringify(useBack ? backKey : fwdKey)}); true`);
      }
      await evaluate('window.__MOTION__.stepFrame(1/60); true');
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shot.result.data, 'base64');
      writeFileSync(join(OUT, `mo-${id}-${String(i).padStart(3, '0')}.png`), buf);
      await evaluate('window.__MOTION__.applyEmuPrefix(); true');
      frames.push({ img: decodePng(buf), fp: await evaluate('window.__MOTION__.fp()') });
      // LOD 臂用**产品自己的读数**（describe().smoke：visible/pointPx/锚点）——避免探针复算与产品口径漂移
      const prod = await evaluate('window.__MOTION__.productSmoke()');
      smokeSeries.push(prod
        ? { ok: true, plumes: prod.systems.map((x) => ({ index: x.index, visible: x.visible, pointPx: x.pointPx, anchorDistance: null })) }
        : await evaluate('window.__MOTION__.smoke()'));
      nearestSeries.push(null);
    }
    await evaluate('window.__MOTION__.releaseAll(); true');
  }
  for (const k of (spec.lodProbe ? [] : spec.keys ?? [])) await evaluate(`window.__MOTION__.press(${JSON.stringify(k)})`);

  for (let i = 0; spec.lodProbe && i < N; i += 1) { /* lod 臂已在上面跑完 */ break; }
  for (let i = 0; !spec.lodProbe && i < N; i += 1) {
    if (spec.rotate) await evaluate(`window.__MOTION__.rotate(${spec.rotate})`);
    await evaluate(`window.__MOTION__.stepFrame(${spec.dt ?? 1 / 60}); true`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.result.data, 'base64');
    writeFileSync(join(OUT, `mo-${id}-${String(i).padStart(3, '0')}.png`), buf);
    frames.push({ img: decodePng(buf), fp: await evaluate('window.__MOTION__.fp()') });
    smokeSeries.push(spec.lodProbe || i % 4 === 0 ? await evaluate('window.__MOTION__.smoke()') : null);
    if (spec.spawn === 'wall' || i % 4 === 0) nearestSeries.push(await evaluate('window.__MOTION__.nearestDistances()'));
    else nearestSeries.push(null);
  }
  for (const k of spec.keys ?? []) await evaluate(`window.__MOTION__.release(${JSON.stringify(k)})`);
  await evaluate('window.__MOTION__.freezeEnv(false); true');

  /* ---- 逐帧差 + 分类 ---- */
  const unstable = new Map();
  const pairs = [];
  const bg = backgroundColor(frames[0].img);
  let edgePixels = 0; let flatPixels = 0; let midPixels = 0; let flatFlipPixels = 0;
  let flipFlopPixels = 0;      // A→B→C 中 C 回到 A（而 B 偏离 ≥30）⇒ **时间性翻面**（crawl / Z-fighting 签名）
  let overGradientPixels = 0;  // 单帧变化幅度**超过局部斜坡所能允许**（硬台阶：像素在两平台间跳）
  let edgeChanged = 0;
  const flatFlipList = [];
  const flipFlopList = [];
  for (let i = 1; i < frames.length; i += 1) {
    const A = frames[i - 1].img; const B = frames[i].img;
    const { changed, maxDelta } = diffPixels(A, B, 0);
    const C = i + 1 < frames.length ? frames[i + 1].img : null;
    for (const [x, y, d] of changed) {
      const key = `${x},${y}`;
      const rec = unstable.get(key);
      if (rec) { rec.n += 1; rec.max = Math.max(rec.max, d); } else unstable.set(key, { n: 1, max: d, x, y });
      const g = gradAt(A, x, y);
      if (g >= EDGE_GRAD) { edgePixels += 1; edgeChanged += 1; } else if (g <= FLAT_GRAD) {
        flatPixels += 1;
        if (d >= FLAT_FLIP) { flatFlipPixels += 1; if (flatFlipList.length < 12) flatFlipList.push({ x, y, d, g }); }
      } else midPixels += 1;
      // 单帧幅度 > 局部斜坡允许（gray 梯度 × 3 通道）⇒ 像素在"两平台"间跳（真锯齿/硬台阶）
      if (d > g * 3 * 0.9 + 18) { overGradientPixels += 1; }
      if (C) {
        const ia = (y * A.w + x) * A.ch; const ic = (y * C.w + x) * C.ch;
        const back = Math.abs(A.data[ia] - C.data[ic]) + Math.abs(A.data[ia + 1] - C.data[ic + 1]) + Math.abs(A.data[ia + 2] - C.data[ic + 2]);
        if (back <= 6 && d >= 30) { flipFlopPixels += 1; if (flipFlopList.length < 12) flipFlopList.push({ x, y, d, back, g }); }
      }
    }
    let bb = null;
    for (const [x, y] of changed) {
      if (!bb) bb = { minX: x, minY: y, maxX: x, maxY: y };
      else { if (x < bb.minX) bb.minX = x; if (y < bb.minY) bb.minY = y; if (x > bb.maxX) bb.maxX = x; if (y > bb.maxY) bb.maxY = y; }
    }
    pairs.push({ pair: `${i - 1}->${i}`, changed: changed.length, maxDelta, edge: changed.filter((c) => gradAt(A, c[0], c[1]) >= EDGE_GRAD).length, bbox: bb });
  }
  /* 位置：贴着移动方向的分块统计（"区域图"的文本版） */
  const grid = new Map();
  for (const r of unstable.values()) {
    const gx = Math.floor((r.x / W) * 6); const gy = Math.floor((r.y / H) * 4);
    const k = `${gy}x${gx}`;
    grid.set(k, (grid.get(k) ?? 0) + 1);
  }
  /* 共面（Z-fighting）：对最不稳定像素做双命中深度差 */
  const top = [...unstable.values()].sort((p, q) => q.n - p.n).slice(0, 12).map((r) => [r.x, r.y]);
  const identify = top.length ? await evaluate(`window.__MOTION__.identify(${JSON.stringify(top)})`) : [];
  const coincident = identify.filter((it) => it.depthGap !== null && it.depthGap < 0.02);
  /* 背景洞（近平面裁切/看穿）：与首帧对比，中心区域里"变成背景色"的像素 */
  const bgHoles = [];
  {
    // 只看**贴墙**帧对（最近几何 ≤ 1.5m）：墙面像素变成背景色 = 看穿/墙体消失（近平面裁切）
    for (let i = 1; i < frames.length; i += 1) {
      const near = nearestSeries[i];
      if (!near || !(near.nearest <= 1.5)) continue;
      const A = frames[i - 1].img; const B = frames[i].img;
      for (let y = (H * 0.15) | 0; y < H * 0.85; y += 1) {
        for (let x = (W * 0.15) | 0; x < W * 0.85; x += 1) {
          if (!isBackground(A, x, y, bg) && isBackground(B, x, y, bg)) bgHoles.push([x, y, i]);
        }
      }
    }
  }
  /* 烟柱 LOD：逐帧 visible 翻转 */
  const plumeSeries = [];
  for (const s of smokeSeries) if (s && s.ok) plumeSeries.push(s.plumes.map((p) => ({ visible: p.visible, pointPx: p.pointPx, dist: p.anchorDistance })));
  let flips = [];
  if (plumeSeries.length > 1) {
    const n = plumeSeries[0].length;
    for (let k = 0; k < n; k += 1) {
      let f = 0; const px = [];
      for (let i = 1; i < plumeSeries.length; i += 1) { if (plumeSeries[i][k].visible !== plumeSeries[i - 1][k].visible) f += 1; px.push(plumeSeries[i][k].pointPx); }
      flips.push({ index: k, flips: f, minPx: px.length ? Math.min(...px) : null, maxPx: px.length ? Math.max(...px) : null, visibleStart: plumeSeries[0][k].visible, visibleEnd: plumeSeries[plumeSeries.length - 1][k].visible });
    }
  }
  /* 按深度分带（粗深度图 32×18 ⇒ 每格 30×30 像素）：把变化量归因到近/中/远 */
  const bandOf = (x, y) => {
    if (!depth || !depth.cells) return 'unknown';
    const i = Math.min(depth.nx - 1, Math.floor((x / W) * depth.nx));
    const j = Math.min(depth.ny - 1, Math.floor((y / H) * depth.ny));
    const c = depth.cells[j * depth.nx + i];
    if (!c || c.d === null) return 'sky';
    if (c.d < 20) return 'near';
    if (c.d < 60) return 'mid';
    return 'far';
  };
  const bandStats = {};
  for (const [key, rec] of unstable) {
    const b = bandOf(rec.x, rec.y);
    bandStats[b] = bandStats[b] ?? { pixels: 0, changes: 0, max: 0 };
    bandStats[b].pixels += 1;
    bandStats[b].changes += rec.n;
    bandStats[b].max = Math.max(bandStats[b].max, rec.max);
  }
  const camMove = Math.hypot(frames[frames.length - 1].fp.position.x - frames[0].fp.position.x, frames[frames.length - 1].fp.position.z - frames[0].fp.position.z);
  const res = {
    id,
    label: spec.label,
    frames: frames.length,
    stats: stats0,
    near: fp0.near,
    far: fp0.far,
    cameraMove: +camMove.toFixed(3),
    unstablePixels: unstable.size,
    changedTotal: pairs.reduce((s, p) => s + p.changed, 0),
    changedPerPair: pairs.map((p) => p.changed),
    edgePixels,
    midPixels,
    flatPixels,
    flatFlipPixels,
    flatFlipList,
    flipFlopPixels,
    flipFlopList,
    overGradientPixels,
    edgeChanged,
    edgeStepRatio: edgeChanged ? +(overGradientPixels / edgeChanged).toFixed(4) : null,
    coincidentPairs: coincident.map((c) => ({ px: [c.px, c.py], gap: c.depthGap, a: c.hits[0]?.dist, b: c.hits[1]?.dist, chainA: c.hits[0]?.chain.join('<'), chainB: c.hits[1]?.chain.join('<') })),
    bgHoles: bgHoles.length,
    bgHoleSample: bgHoles.slice(0, 6),
    nearestMin: Math.min(...nearestSeries.filter(Boolean).map((x) => x.nearest ?? Infinity)),
    nearestSeries: nearestSeries.filter(Boolean).map((x) => x.nearest),
    smokeFlips: flips,
    smokeFlipsTotal: flips.reduce((s, f) => s + f.flips, 0),
    smokeSeriesLast: plumeSeries.length ? plumeSeries[plumeSeries.length - 1] : null,
    bandStats,
    depthSample: depth && depth.cells ? { far: depth.cells.filter((c) => c.d !== null && c.d >= 60).length, mid: depth.cells.filter((c) => c.d !== null && c.d >= 20 && c.d < 60).length, near: depth.cells.filter((c) => c.d !== null && c.d < 20).length, sky: depth.cells.filter((c) => c.d === null).length } : null,
    bandObjs: depth && depth.cells ? [...new Set(depth.cells.filter((c) => c.d !== null).map((c) => c.obj))].slice(0, 14) : null,
    grid: Object.fromEntries([...grid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)),
    unstableTop: [...unstable.values()].sort((p, q) => q.n - p.n).slice(0, 12).map((r) => ({ x: r.x, y: r.y, n: r.n, max: r.max })),
    identify: identify.map((it) => ({ px: [it.px, it.py], hits: it.hits.slice(0, 2), gap: it.depthGap })),
    approach,
    camera0: frames[0].fp.position,
    cameraLast: frames[frames.length - 1].fp.position,
  };
  results.push(res);
  console.log(`[${id}] ${spec.label}`);
  console.log(`   帧=${res.frames}｜位移=${res.cameraMove}m｜不稳定像素=${res.unstablePixels}｜变化总数=${res.changedTotal}｜单对最大=${Math.max(0, ...res.changedPerPair)}`);
  console.log(`   分类：边缘型=${edgePixels}｜中=${midPixels}｜平坦型=${flatPixels}（平坦翻面≥${FLAT_FLIP}=${flatFlipPixels}）｜共面双命中=${coincident.length}｜背景洞=${res.bgHoles}｜最近几何=${res.nearestMin}`);
  console.log(`   时间性：翻面(A→B→C 回 A)=${flipFlopPixels}｜硬台阶(超局部斜坡)=${overGradientPixels}/${edgeChanged}（${res.edgeStepRatio === null ? '-' : (res.edgeStepRatio * 100).toFixed(1) + '%'}）`);
  console.log(`   分带（不稳定像素）：${Object.entries(bandStats).map(([k, v]) => `${k}=${v.pixels}`).join(' ')}｜深度采样 ${JSON.stringify(res.depthSample)}`);
  if (flips.length) console.log(`   烟柱 LOD：逐柱 visible 翻转 ${flips.map((f) => f.flips).join('/')}（合计 ${res.smokeFlipsTotal}）｜pointPx 区间 ${flips.map((f) => `${f.minPx}~${f.maxPx}`).join(' ')}`);
  if (res.drawCallsNote) console.log(res.drawCallsNote);
}
/* 额外：静止 + 冻结（渲染确定性对照） */
await evaluate('window.__MOTION__.releaseAll(); true');
report.stats = await evaluate('window.__MOTION__.stats()');
report.smokeAfter = await evaluate('window.__MOTION__.smoke()');
report.arms = results;
writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
console.log(`读数 ⇒ ${JSON_OUT}；截图 ⇒ ${OUT}/`);

/* --------------------------- 判据（可选） --------------------------- */
let ok = true;
const expectRaw = arg('expect', '');
if (expectRaw) {
  for (const spec of expectRaw.split(',').filter(Boolean)) {
    const [armId, field, want] = spec.split(':');
    const arm = results.find((r) => r.id === armId);
    if (!arm) { console.error(`判据失败：臂 ${armId} 未运行`); ok = false; continue; }
    const got = arm[field];
    if (Number(got) !== Number(want)) { console.error(`判据失败：${armId}.${field}=${got}，期望 ${want}`); ok = false; }
  }
} else {
  /**
   * 默认判据（`node scripts/probe-motion-edges.mjs` 不带参数 ⇒ 这就是常驻判据）：
   *   ① 每个臂：**背景洞 = 0**（近平面看穿/墙体消失 0 处）；
   *   ② 每个臂：**可见几何共面双命中 = 0**（Z-fighting 0 处；射线已按可见性链过滤，
   *      否则被 setZoneVisible(false) 藏起来的 greybox 会制造 gap=0 的假象）；
   *   ③ `lod-live` 臂：门限附近往复行走的**逐柱 visible 翻转 ≤ LOD_FLIPS_MAX**（t40 滞回后应为 0；
   *      单门限（t25 原状）在同一轨迹上 >0 ⇒ 判据不恒真，见 docs/report-motion-edges.md §3）。
   */
  const LOD_FLIPS_MAX = 2;
  for (const arm of results) {
    if (arm.bgHoles !== 0) { console.error(`默认判据失败：${arm.id}.bgHoles=${arm.bgHoles}（近平面看穿）`); ok = false; }
    if (arm.coincidentPairs.length !== 0) { console.error(`默认判据失败：${arm.id} 可见几何共面双命中 ${arm.coincidentPairs.length} 处（Z-fighting）`); ok = false; }
  }
  const lod = results.find((r) => r.id === 'lod-live');
  if (lod) {
    if (lod.approach && lod.approach.err !== undefined && !(lod.approach.err <= 0.002)) {
      console.error(`默认判据失败：lod-live 未能把振荡中心钉在门限 ±0.002px 内（err=${lod.approach.err}）⇒ 读数无对象`);
      ok = false;
    }
    if (lod.smokeFlipsTotal > LOD_FLIPS_MAX) {
      console.error(`默认判据失败：lod-live 烟柱 visible 翻转 ${lod.smokeFlipsTotal} > 登记上限 ${LOD_FLIPS_MAX}（门限附近爆闪）`);
      ok = false;
    }
  }
}
console.log(ok ? 'PASS' : 'FAIL');
ws.close(); chrome.kill(); server.close();
process.exit(ok ? 0 : 1);
