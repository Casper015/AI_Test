/**
 * `scripts/probe-flicker.mjs` —— **红色边缘持续闪烁**的常驻探针（只读；不改任何产品代码）。
 * =============================================================================
 * 真实 headless Chrome + CDP，同一浏览器会话内跑多组**对照相位**，每相位连续捕 N 帧
 * （默认 30），逐帧逐像素比较，产出：
 *   · `unstablePixels` = 在 ≥2 帧之间发生过任何位差的**不同像素**数量（本卡的唯一主判据）
 *   · 每相位状态指纹：相机矩阵哈希 / 环境读数哈希 / elapsed / 帧号 / 生效 AA
 *   · 不稳定像素的坐标、帧序计数、包围盒
 *
 * 协议要点（口径三要素）：
 *   1. **驱动**：每次捕获前调用生产循环入口 `__PALACE__.renderSystem.recordFrame(16)`
 *      （与 t104/t162 同协议，不绕过逻辑）；页面自身的 rAF 循环照常运行。
 *   2. **对照**：`--phases=live,lock,lock-rig,lock-env,...`
 *      · `live`      = 现状（rig.update + environment.update 照常）
 *      · `lock`      = 两者冻结（**同一状态重复渲染** ⇒ 检验渲染是否逐位确定）
 *      · `lock-rig`  = 只冻相机（保留环境动画）
 *      · `lock-env`  = 只冻环境（保留相机缓动）
 *      · 其余相位 = 逐条排除候选（见 `PHASE_SPECS` 的 `candidate` 字段）
 *   3. **判据**：默认 `live` 相位 `unstablePixels === 0` 才 exit 0（回归守卫）；
 *      `--expect=<相位>:<数值>` 可对任意相位下精确判据。
 *
 * 用法：
 *   node scripts/probe-flicker.mjs                          # live 相位 × 30 帧，守卫判据
 *   node scripts/probe-flicker.mjs --phases=live,lock,lock-rig,lock-env
 *   node scripts/probe-flicker.mjs --phases=lock --quality=low   # AA 当变量（low/medium/high）
 *   node scripts/probe-flicker.mjs --identify=1             # 对不稳定像素做射线拾取归因
 *   node scripts/probe-flicker.mjs --hide=environment-dust,environment-smoke
 *   node scripts/probe-flicker.mjs --expect=live:0,lock:0
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { inflateSync } from 'node:zlib';

const ROOT = process.cwd();
const OUT = process.env.FLICKER_OUT ?? '/tmp/t162-shots';
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH
  ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

/* ------------------------------- CLI ------------------------------- */
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const hit = argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '1';
};
const FRAMES = Number(arg('frames', process.env.FRAMES ?? 30));
const VIEW = arg('view', process.env.VIEW ?? 'oblique');
const QUALITY = arg('quality', process.env.QUAL ?? 'medium');
const AA = arg('aa', process.env.AA ?? null);
const UI = arg('ui', process.env.UI ?? '1');
const IDENTIFY = arg('identify', '0') === '1';
const HIDE = (arg('hide', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PHASES = (arg('phases', process.env.PHASES ?? 'live') || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXPECT = new Map((arg('expect', '') || '').split(',').filter(Boolean).map((s) => {
  const [k, v] = s.split(':');
  return [k.trim(), Number(v)];
}));
const JSON_OUT = arg('json', '/tmp/t162-flicker.json');

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
/** 逐像素比较（阈值 th；默认 0 = 任何位差都算，口径最严）。 */
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
const isRed = (img, x, y) => { const i = (y * img.w + x) * img.ch; const q = img.data; return q[i] > 120 && q[i] - q[i + 1] > 40 && q[i] - q[i + 2] > 40; };

/* --------------------------- 静态服务 + CDP --------------------------- */
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') p = join(ROOT, 'index.html');
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p)); }
  catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const DBG = 9200 + (process.pid % 500);
const urlFor = (q = QUALITY, a = AA) => `http://127.0.0.1:${port}/index.html?view=${VIEW}&quality=${q}${a ? `&aa=${a}` : ''}${UI === '0' ? '&ui=0' : ''}`;
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DBG}`, `--user-data-dir=/tmp/t162-chrome-${process.pid}`, `--window-size=${W},${H}`, urlFor()], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i += 1) {
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
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};

/* --------------------------- 页内侦察助手（只改运行时状态，不改产品代码） --------------------------- */
const RECON_HELPERS = `(() => {
  const a = window.__PALACE__;
  if (!a || a.__recon) return 'already';
  const H = {
    THREE: null,
    hidden: [],
    /** 状态指纹：相机矩阵哈希 + 环境读数哈希 + elapsed + 帧号 + 生效 AA */
    fingerprint() {
      const m = a.rig.camera.matrixWorld.elements;
      let h = 0; for (const v of m) h = (h * 31 + Math.round(v * 1e7)) % 2147483647;
      let eh = 0; const s = JSON.stringify(a.environment.describe());
      for (let i = 0; i < s.length; i += 1) eh = (eh * 33 + s.charCodeAt(i)) % 2147483647;
      const g = a.renderSystem.getStats();
      return { camHash: h, envHash: eh, elapsed: window.__EL__ ?? null, mainFrames: g.frames, aa: g.quality.antialias, cam: a.rig.describe().position, mode: a.rig.describe().mode };
    },
    /** 冻结子系统：{ rig?:bool, env?:bool } */
    freeze(what) {
      if (typeof what.rig === 'boolean') window.__LOCK_RIG__ = what.rig;
      if (typeof what.env === 'boolean') window.__LOCK_ENV__ = what.env;
      return { rig: window.__LOCK_RIG__, env: window.__LOCK_ENV__ };
    },
    /** 逐条排除：按对象名隐藏（运行时状态，不改产品代码） */
    hide(names) {
      for (const n of names) { const o = a.scene.getObjectByName(n); if (!o) return { ok: false, missing: n }; o.visible = false; H.hidden.push(n); }
      return { ok: true, hidden: H.hidden.slice() };
    },
    showAll() { for (const n of H.hidden) { const o = a.scene.getObjectByName(n); if (o) o.visible = true; } H.hidden = []; for (const n of ['environment-dust', 'environment-smoke', 'environment-lamps', 'palace-ui-highlight']) { const o = a.scene.getObjectByName(n); if (o) o.visible = true; } return true; },
    /**
     * 冻结页面自身 rAF 循环（之后的每帧完全由 stepFrame 驱动 ⇒ 帧步长精确可控）。
     * 不改变任何渲染逻辑：stepFrame 复刻 main.js frameStep 的生产调用序列。
     */
    freezeLoop() {
      if (window.__RAF_FROZEN__) return 'already';
      window.__RAF_FROZEN__ = true;
      window.__RAF_NATIVE__ = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 0;
      return 'frozen';
    },
    /** 精确推进**恰好一帧**（dt 秒），调用序列与 main.js frameStep 一致。 */
    stepFrame(dt) {
      if (!window.__RAF_FROZEN__) H.freezeLoop();
      if (window.__STEP_EL__ === undefined) window.__STEP_EL__ = window.__EL__ ?? 0;
      window.__STEP_EL__ += dt;
      const el = window.__STEP_EL__;
      const st = a.store.state;
      for (const entry of a.zones.values()) { try { entry.result.update(dt, el, st); } catch (e) { /* 与生产循环同：区域 update 抛错不影响主帧 */ } }
      a.rig.update(dt, el, st);
      a.environment.update(dt, el, { ...st, cameraPosition: a.rig.position });
      a.renderSystem.render(a.scene, a.rig.camera);
      a.renderSystem.recordFrame(dt * 1000);
      return { elapsed: el, frames: a.renderSystem.getStats().frames };
    },
    stepState() { return { elapsed: window.__STEP_EL__ ?? null }; },
    /** 把实时点光强度钉在 baseIntensity（等价"关掉宫灯 flicker"，不动选择池） */
    pinFlicker(on) { window.__PIN_FLICKER__ = !!on; return true; },
    /**
     * **候选最小修复的运行时验证**（不改任何产品代码）：烟柱投影点径 < minPx 时整柱不绘制。
     * 与建议给 core 的补丁形状逐式一致：pointSize = size · (drawingBufferHeight/2) / dist。
     */
    setSmokeLod(minPx) {
      window.__SMOKE_LOD_PX__ = minPx === null || minPx === undefined ? null : Number(minPx);
      const g = a.scene.getObjectByName('environment-smoke');
      if (g && window.__SMOKE_LOD_PX__ === null) g.visible = true;
      return { minPx: window.__SMOKE_LOD_PX__, lastMaxPointPx: window.__SMOKE_LOD_LAST__ ?? null };
    },
    setShadow(on) {
      const s = a.scene.getObjectByName('environment-sun');
      if (!s) return { ok: false };
      const was = s.castShadow; s.castShadow = !!on; if (s.shadow) s.shadow.needsUpdate = true;
      return { ok: true, was, now: s.castShadow };
    },
    /** 射线拾取：像素坐标 → 命中的对象链（把"闪烁像素"归因到具体物体） */
    async identify(points) {
      if (!H.THREE) { const mod = await import('/src/kit/three-ref.js'); H.THREE = mod.THREE ?? mod.default; }
      const T = H.THREE;
      const canvas = document.querySelector('canvas');
      const r = canvas.getBoundingClientRect();
      const rc = new T.Raycaster();
      const out = [];
      for (const [px, py] of points) {
        const ndc = new T.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
        rc.setFromCamera(ndc, a.rig.camera);
        const hits = rc.intersectObjects(a.scene.children, true).slice(0, 3).map((hit) => {
          const chain = [];
          let o = hit.object;
          while (o) { chain.push(o.name || o.type); o = o.parent; }
          const mat = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
          return {
            dist: +hit.distance.toFixed(2),
            type: hit.object.type,
            point: { x: +hit.point.x.toFixed(2), y: +hit.point.y.toFixed(2), z: +hit.point.z.toFixed(2) },
            chain: chain.slice(0, 6),
            matColor: mat && mat.color ? '#' + mat.color.getHexString() : null,
            emissive: mat && mat.emissive ? '#' + mat.emissive.getHexString() : null,
            emissiveIntensity: mat ? (mat.emissiveIntensity ?? null) : null,
            transparent: mat ? (mat.transparent ?? null) : null,
            opacity: mat ? (mat.opacity ?? null) : null,
          };
        });
        out.push({ px, py, hits });
      }
      return out;
    },
    /** 选中一栋建筑（触发"选中高亮线框"候选）。id 空则取 registry.ids().buildings 里的标志性建筑。 */
    select(id) {
      const ids = a.registry && a.registry.ids ? a.registry.ids().buildings : [];
      const pick = id ?? (ids.includes('B-hall-main') ? 'B-hall-main' : ids[0]);
      const hl = () => (a.scene.getObjectByName('palace-ui-highlight') || { children: [] }).children.map((c) => c.visible);
      if (!pick) return { via: 'none', reason: 'registry.ids().buildings 为空', ids: ids.length };
      const ui = window.__PALACE_UI__;
      const api = ui && ui.interaction;
      if (api && typeof api.select === 'function') {
        const returned = api.select(pick, 'probe');
        return { via: 'interaction.select', pick, returned: returned ?? null, ids: ids.length, visible: hl() };
      }
      a.events.request('selection:change', { buildingId: pick, hovered: false });
      return { via: 'events.request', pick, ids: ids.length, visible: hl() };
    },
    highlightState() {
      const g = a.scene.getObjectByName('palace-ui-highlight');
      if (!g) return null;
      return { children: g.children.length, visible: g.children.map((c) => c.visible), opacity: g.children.map((c) => +c.material.opacity.toFixed(4)) };
    },
    pointLights() {
      const out = [];
      a.scene.traverse((o) => { if (o.isPointLight) out.push({ visible: o.visible, intensity: +o.intensity.toFixed(4), base: o.userData ? (o.userData.baseIntensity ?? null) : null, pos: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)], anchor: o.userData ? (o.userData.lampAnchorId ?? null) : null }); });
      return out;
    },
  };
  a.__recon = H;
  window.__PALACE_RECON__ = H;
  window.__LOCK_RIG__ = false; window.__LOCK_ENV__ = false; window.__PIN_FLICKER__ = false;
  // 在生产路径上包一层：记录 elapsed；开关打开时冻结对应子系统（不绕过任何渲染逻辑）
  const envU = a.environment.update;
  a.environment.update = function (dt, elapsed, state) { window.__EL__ = elapsed; if (window.__LOCK_ENV__) return elapsed; return envU.call(this, dt, elapsed, state); };
  const rigU = a.rig.update;
  a.rig.update = function (dt, elapsed, state) { if (window.__LOCK_RIG__) return; return rigU.call(this, dt, elapsed, state); };
  // 渲染前：① 可选把实时点光强度钉回基准（"关 flicker"候选）② 可选烟柱 LOD（候选最小修复）
  const render0 = a.renderSystem.render;
  a.renderSystem.render = function (scene, cam) {
    if (window.__PIN_FLICKER__) a.scene.traverse((o) => { if (o.isPointLight && o.userData && o.userData.baseIntensity) o.intensity = o.userData.baseIntensity; });
    if (window.__SMOKE_LOD_PX__) {
      const g = a.scene.getObjectByName('environment-smoke');
      if (g) {
        const cp = a.rig.camera.position;
        const scale = (a.renderSystem.canvas.height || 900) * 0.5;
        let maxPt = 0;
        for (const pts of g.children) {
          const attr = pts.geometry.getAttribute('position'); const size = pts.material.size;
          for (let i = 0; i < attr.count; i += 1) {
            const dx = attr.getX(i) - cp.x; const dy = attr.getY(i) - cp.y; const dz = attr.getZ(i) - cp.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            maxPt = Math.max(maxPt, size * scale / Math.max(1e-6, d));
          }
        }
        g.visible = maxPt >= window.__SMOKE_LOD_PX__;
        window.__SMOKE_LOD_LAST__ = +maxPt.toFixed(4);
      }
    }
    return render0.call(this, scene, cam);
  };
  return 'ok';
})()`;

const FINGERPRINT = 'window.__PALACE_RECON__.fingerprint()';
const capture = async (name, opts = {}) => {
  if (opts.control) await evaluate(`window.__PALACE_RECON__.stepFrame(${opts.dt}); true`);
  else await evaluate('(() => { window.__PALACE__.renderSystem.recordFrame(16); return true; })()');
  const fp = await evaluate(FINGERPRINT);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.result.data, 'base64');
  writeFileSync(join(OUT, name), buf);
  return { img: decodePng(buf), fp, file: join(OUT, name) };
};

/* ------------------------------- 相位定义 ------------------------------- */
/** 每相位 = 排除一条"红色边缘/闪烁"候选所对应的运行时开关；`candidate` 即回执里逐条列举的候选名。 */
const PHASE_SPECS = {
  live: { candidate: '基线（现状，无任何干预）', setup: {} },
  lock: { candidate: '渲染确定性（冻相机 + 冻环境：同状态重复渲染）', setup: { rig: true, env: true } },
  'lock-rig': { candidate: '相机缓动/浮点漂移（只冻相机，环境动画照常）', setup: { rig: true, env: false } },
  'lock-env': { candidate: '环境动画（只冻环境，相机照常）', setup: { rig: false, env: true } },
  noflicker: { candidate: '宫灯实时点光 flicker（强度钉回 baseIntensity）', setup: { pinFlicker: true } },
  noparticles: { candidate: '尘埃/香炉粒子（隐藏 environment-dust + environment-smoke）', setup: { hide: ['environment-dust', 'environment-smoke'] } },
  nodust: { candidate: '尘埃粒子（隐藏 environment-dust）', setup: { hide: ['environment-dust'] } },
  nosmoke: { candidate: '香炉烟粒子（隐藏 environment-smoke）', setup: { hide: ['environment-smoke'] } },
  nolamps: { candidate: '宫灯灯体与实时点光（隐藏 environment-lamps + 关点光）', setup: { hide: ['environment-lamps'], lightsOff: true } },
  nobloom: { candidate: 'Bloom 溢色边缘', setup: { bloom: false } },
  noshadow: { candidate: '阴影贴图抖动', setup: { shadow: false } },
  noaa: { candidate: '多重采样抗锯齿（?aa=off）', setup: { reload: { aa: 'off' } } },
  'aa-low': { candidate: '质量档 low（aaSamples=0，AA 关）', setup: { reload: { quality: 'low' } } },
  'aa-medium': { candidate: '质量档 medium（aaSamples=2，默认）', setup: { reload: { quality: 'medium' } } },
  'aa-high': { candidate: '质量档 high（aaSamples=4）', setup: { reload: { quality: 'high' } } },
  'sel-live': { candidate: '选中高亮线框（脉冲 opacity，#ffc83b）', setup: { select: true } },
  'sel-nohl': { candidate: '选中高亮线框（隐藏 palace-ui-highlight）', setup: { select: true, hide: ['palace-ui-highlight'] } },
  // ── 精确帧步长（冻结页面 rAF，由 stepFrame 复刻生产帧调用序列）──
  'frame-60': { candidate: '精确 1 帧 @60fps（dt=16.7ms）⇒ 真·相邻帧', setup: { control: 1 / 60 } },
  'frame-15': { candidate: '精确 1 帧 @15fps（dt=66.7ms）', setup: { control: 1 / 15 } },
  'frame-60-nosmoke': { candidate: '精确 1 帧 @60fps + 关香炉烟', setup: { control: 1 / 60, hide: ['environment-smoke'] } },
  // ── 候选最小修复（运行时验证，不改产品代码）──
  'smoke-lod': { candidate: '最小修复：烟柱投影点径 <1px 时整柱不绘制（LOD 门限 1px）', setup: { lod: 1 } },
  'frame-60-lod': { candidate: '最小修复 + 精确 1 帧 @60fps（判据相位）', setup: { control: 1 / 60, lod: 1 } },
  hidden: { candidate: '--hide=<名字>', setup: {} },
};

const report = {
  protocol: {
    frames: FRAMES, size: [W, H], view: VIEW, quality: QUALITY, aa: AA ?? '(档位默认)', ui: UI, phases: PHASES,
    drive: '页面自身 rAF + 每次捕获前 renderSystem.recordFrame(16)',
    metric: 'unstablePixels = 相邻帧间发生过任何位差的**不同像素**数（阈值 0）',
  },
  phases: [],
  identify: null,
};

const boot = async ({ quality = QUALITY, aa = AA } = {}) => {
  const url = urlFor(quality, aa);
  await send('Page.navigate', { url });
  for (let i = 0; i < 120; i += 1) { if (await evaluate('!!(window.__PALACE__ && window.__PALACE__.ready)')) break; await sleep(300); }
  await evaluate('window.__PALACE__.settle && window.__PALACE__.settle()');
  await sleep(500);
  const patched = await evaluate(RECON_HELPERS);
  await evaluate('window.__LOCK_RIG__ = false; window.__LOCK_ENV__ = false; window.__PIN_FLICKER__ = false; true');
  return { url, patched };
};

async function phase(id, spec) {
  const setup = spec.setup ?? {};
  // 受控相位会冻结页面 rAF（不可逆）⇒ 其后若还要跑常规相位，必须重新装载页面
  if (!setup.control && !setup.reload && await evaluate('!!window.__RAF_FROZEN__')) {
    console.log(`[${id}] 页面 rAF 已被冻结 ⇒ 重新装载以恢复常规相位`);
    await boot({});
  }
  if (setup.reload) await boot({ quality: setup.reload.quality ?? QUALITY, aa: setup.reload.aa ?? AA });
  else await evaluate(RECON_HELPERS);
  await evaluate('window.__PALACE_RECON__.showAll(); window.__PIN_FLICKER__ = false; true');
  await evaluate('window.__PALACE_RECON__.setSmokeLod(null); true');
  await evaluate('window.__PALACE__.scene.traverse((o) => { if (o.isPointLight) o.visible = true; }); true');
  await evaluate(`window.__PALACE_RECON__.freeze({ rig: ${!!setup.rig}, env: ${!!setup.env} })`);
  if (setup.pinFlicker) await evaluate('window.__PALACE_RECON__.pinFlicker(true); true');
  if (setup.lod) await evaluate(`window.__PALACE_RECON__.setSmokeLod(${Number(setup.lod)})`);
  if (setup.hide) {
    const h = await evaluate(`window.__PALACE_RECON__.hide(${JSON.stringify(setup.hide)})`);
    if (h && h.ok === false) console.warn(`[${id}] 隐藏失败：${h.missing}`);
  }
  if (setup.lightsOff) await evaluate('window.__PALACE__.scene.traverse((o) => { if (o.isPointLight) o.visible = false; }); true');
  if (setup.bloom === false) await evaluate('window.__PALACE__.renderSystem.setBloom({ enabled: false }); true');
  if (setup.shadow === false) await evaluate('window.__PALACE_RECON__.setShadow(false)');
  let selInfo = null;
  if (setup.select) {
    selInfo = await evaluate('window.__PALACE_RECON__.select(null)');
    await sleep(300);
    selInfo.highlightAfter = await evaluate('window.__PALACE_RECON__.highlightState()');
  }
  await sleep(200);

  const shots = [];
  for (let i = 0; i < FRAMES; i += 1) shots.push(await capture(`flk-${id}-${String(i).padStart(2, '0')}.png`, setup.control ? { control: true, dt: setup.control } : {}));

  const unstable = new Map();
  const pairs = [];
  let redChangedTotal = 0;
  for (let i = 1; i < shots.length; i += 1) {
    const a = shots[i - 1].img; const b = shots[i].img;
    const { changed, maxDelta } = diffPixels(a, b, 0);
    let redChanged = 0;
    for (const [x, y, d] of changed) {
      const key = `${x},${y}`;
      const rec = unstable.get(key);
      if (rec) { rec.n += 1; rec.max = Math.max(rec.max, d); } else unstable.set(key, { n: 1, max: d, x, y });
      if (isRed(a, x, y) || isRed(b, x, y)) redChanged += 1;
    }
    redChangedTotal += redChanged;
    const xs = changed.map((c) => c[0]); const ys = changed.map((c) => c[1]);
    pairs.push({ pair: `${i - 1}->${i}`, changed: changed.length, redChanged, maxDelta, bbox: changed.length ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } : null });
  }
  const fps = shots.map((s) => s.fp);
  const res = {
    id,
    candidate: spec.candidate,
    setup,
    frames: shots.length,
    unstablePixels: unstable.size,
    changedTotal: pairs.reduce((s, p) => s + p.changed, 0),
    changedPerPair: pairs.map((p) => p.changed),
    changedMax: Math.max(0, ...pairs.map((p) => p.changed)),
    maxChannelDelta: Math.max(0, ...pairs.map((p) => p.maxDelta)),
    pairsWithChange: pairs.filter((p) => p.changed > 0).length,
    redChangedTotal,
    cameraStable: new Set(fps.map((f) => f.camHash)).size === 1,
    envStable: new Set(fps.map((f) => f.envHash)).size === 1,
    elapsedDistinct: new Set(fps.map((f) => f.elapsed)).size,
    elapsedSeries: fps.map((f) => (f.elapsed === null ? null : +f.elapsed.toFixed(4))),
    stepSeconds: setup.control ?? null,
    mainFrames: [fps[0].mainFrames, fps[fps.length - 1].mainFrames],
    aa: fps[0].aa,
    smokeLodMaxPointPx: await evaluate('window.__SMOKE_LOD_LAST__ ?? null'),
    smokeVisibleEnd: await evaluate('(() => { const g = window.__PALACE__.scene.getObjectByName("environment-smoke"); return g ? g.visible : null; })()'),
    camera: fps[0].cam,
    mode: fps[0].mode,
    selectInfo: selInfo,
    unstableTop: [...unstable.values()].sort((a, b) => b.n - a.n).slice(0, 20).map((r) => ({ x: r.x, y: r.y, count: r.n, max: r.max })),
    unstableByCol: Object.fromEntries([...unstable.values()].reduce((m, r) => { m.set(r.x, (m.get(r.x) ?? 0) + 1); return m; }, new Map())),
    samplePairs: pairs.slice(0, 4),
  };
  report.phases.push(res);
  console.log(`[${id}] 候选=${spec.candidate}`);
  console.log(`   不稳定像素=${res.unstablePixels}｜变化总数=${res.changedTotal}｜单对最大=${res.changedMax}｜最大通道和差=${res.maxChannelDelta}｜有变化帧对=${res.pairsWithChange}/${pairs.length}`);
  console.log(`   相机稳定=${res.cameraStable}｜环境稳定=${res.envStable}｜elapsed 去重=${res.elapsedDistinct}｜主帧号=${res.mainFrames.join('→')}｜AA=${JSON.stringify(res.aa)}`);
  return res;
}

/* ------------------------------- 主流程 ------------------------------- */
const bootInfo = await boot();
console.log(`服务端口 ${port}｜URL ${bootInfo.url}｜页内补丁=${bootInfo.patched}`);
if (HIDE.length) {
  PHASE_SPECS.hidden.candidate = `--hide=${HIDE.join(',')}`;
  PHASE_SPECS.hidden.setup = { hide: HIDE };
  console.log(`--hide=${HIDE.join(',')}（该相位生效）`);
}
for (const id of PHASES) {
  const spec = PHASE_SPECS[id];
  if (!spec) { console.error(`未知相位：${id}（可用：${Object.keys(PHASE_SPECS).join(', ')}）`); process.exit(2); }
  await phase(id, spec);
}

/* 归因：对 live 相位最不稳定的像素做射线拾取 */
const live = report.phases.find((p) => p.id === 'live') ?? report.phases[0];
report.pointLights = await evaluate('window.__PALACE_RECON__.pointLights()');
report.highlight = await evaluate('window.__PALACE_RECON__.highlightState()');
if (IDENTIFY && live?.unstableTop?.length) {
  const pts = live.unstableTop.slice(0, 8).map((r) => [r.x, r.y]);
  report.identify = await evaluate(`window.__PALACE_RECON__.identify(${JSON.stringify(pts)})`);
  console.log('射线拾取归因（live 相位最不稳定像素）：');
  for (const it of report.identify) {
    const hit = it.hits[0];
    console.log(`   (${it.px},${it.py}) ⇒ ${hit ? `${hit.chain.join(' < ')}｜${hit.type}｜色 ${hit.matColor}｜自发光 ${hit.emissive}@${hit.emissiveIntensity}｜距离 ${hit.dist}` : '无命中'}`);
  }
}
writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
console.log(`点光 ${report.pointLights.length} 盏（可见 ${report.pointLights.filter((l) => l.visible).length}）；高亮组 ${JSON.stringify(report.highlight)}`);
console.log(`读数 ⇒ ${JSON_OUT}；截图 ⇒ ${OUT}/`);

/* ------------------------------- 判据 ------------------------------- */
let ok = true;
if (EXPECT.size) {
  for (const [id, want] of EXPECT) {
    const p = report.phases.find((x) => x.id === id);
    if (!p) { console.error(`判据失败：相位 ${id} 未运行`); ok = false; continue; }
    if (p.unstablePixels !== want) { console.error(`判据失败：${id} 不稳定像素=${p.unstablePixels}，期望 ${want}`); ok = false; }
  }
} else {
  const p = report.phases.find((x) => x.id === 'live');
  if (!p) { console.error('判据缺失：未运行 live 相位时必须用 --expect=<相位>:<数值> 显式下判据（不静默 PASS）'); ok = false; }
  else if (p.unstablePixels !== 0) { console.error(`守卫失败：live 相位不稳定像素=${p.unstablePixels}（期望 0）`); ok = false; }
}
console.log(ok ? 'PASS' : 'FAIL');
ws.close(); chrome.kill(); server.close();
process.exit(ok ? 0 : 1);
