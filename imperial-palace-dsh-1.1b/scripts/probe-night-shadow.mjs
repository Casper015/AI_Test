/**
 * `scripts/probe-night-shadow.mjs` —— **夜晚"走进阴影屏幕反而变亮"** 的移动协议探针（真实浏览器 CDP）。
 * =============================================================================
 * 来源：用户实测『晚上的阴影有问题：晚上走到阴影里面屏幕反而变亮了』。
 *
 * 协议（口径三要素）：
 *   ① 驱动：页面 rAF 冻结后由 `__NIGHTSHADOW__.stepFrame(1/60)` 逐字复刻 main.js 的 frameStep；
 *   ② 输入：真实键盘事件（window.dispatchEvent KeyboardEvent）→ interaction → core 相机装置 keys → updateFp()；
 *   ③ 读数：逐帧【整帧亮度均值 / 屏幕中央区均值（受光 vs 阴影用**同一条行走轨迹的两端**定义）/
 *      toneMappingExposure / bloom 生效强度 / 内景补光 inside·blend·effectiveBlend·ambient·hemi /
 *      激活灯集合（池 + Σ强度）/ 阴影相机 bias·normalBias·mapSize / 相机位置】。
 *
 * 手臂（每条 ≥30 帧）：
 *   `night-before` = moonlitNight + **关闭**"第一人称抑制内景补光"（= 修前行为，缺陷复现）
 *   `night-after`  = moonlitNight + **开启**抑制（= 本卡默认行为）
 *   `dusk-after` / `golden-after` = 另两个时辰的对照（同样开启抑制）
 *   每条手臂：走过去（walk-in）→ 停留 → 走回来（walk-out），并给**进入段的最大上升幅度**。
 *
 * 判据（默认，不带参数即这套 ⇒ `node scripts/probe-night-shadow.mjs` 是常驻判据）：
 *   ① 修前必须**复现**缺陷：`night-before.walkInRise > 0.5`（整帧均值至少升 0.5/255）；
 *   ② 修后必须**不升**：`night-after.walkInRise ≤ RISE_TOL`（默认 0.10/255，≈探针自身噪声底）；
 *   ③ 阴影端必须比受光端**更暗**：`night-after.shadowMean < night-after.litMean`（两侧都读）；
 *   ④ 曝光在整段行走中**恒定**（无自适应曝光：逐帧去重 = 1 种）。
 * 产物：`/tmp/t45-night-shadow.json`（可用 NIGHTSHADOW_OUT=<dir> 改写）
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { inflateSync } from 'node:zlib';

/** PNG（RGBA/RGB 8bit）解码 + 亮度分区均值（与 t40 探针同源实现）。 */
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
/** 亮度分区：整帧 / 中央 40%×60% / 下半区（近处地面）。 */
function luminanceMeans(img) {
  let total = 0; let center = 0; let cn = 0; let lower = 0; let ln = 0;
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < img.w; x += 1) {
      const i = (y * img.w + x) * img.ch;
      const l = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      total += l;
      if (x > img.w * 0.3 && x < img.w * 0.7 && y > img.h * 0.2 && y < img.h * 0.8) { center += l; cn += 1; }
      if (y > img.h * 0.6) { lower += l; ln += 1; }
    }
  }
  return { frameMean: +(total / (img.w * img.h)).toFixed(4), centerMean: +(center / Math.max(1, cn)).toFixed(4), lowerMean: +(lower / Math.max(1, ln)).toFixed(4) };
}

const ROOT = process.cwd();
const OUT = process.env.NIGHTSHADOW_OUT ?? '/tmp/t45-night-shadow';
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH
  ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const W = Number(process.env.W ?? 800);
const H = Number(process.env.H ?? 450);
const QUALITY = process.env.QUAL ?? 'medium';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const hit = argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '1';
};
const RISE_TOL = Number(arg('riseTol', process.env.RISE_TOL ?? 0.10));
const WALK = Number(arg('walk', process.env.WALK ?? 26));   // 进入段帧数
const STAY = Number(arg('stay', process.env.STAY ?? 10));   // 阴影端停留帧数
const ARM_FILTER = (arg('arms', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const JSON_OUT = arg('json', '/tmp/t45-night-shadow.json');

/* ------------------------------ 静态服务 + CDP ------------------------------ */
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') p = join(ROOT, 'index.html');
  try {
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(p));
  } catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const DBG = 9700 + (process.pid % 200);
const url = `http://127.0.0.1:${port}/index.html?view=fp&quality=${QUALITY}&ui=0`;
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DBG}`, `--user-data-dir=/tmp/t45-chrome-${process.pid}`, `--window-size=${W},${H}`, url], { stdio: 'ignore' });
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
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};

/* ------------------------------ 页内助手 ------------------------------ */
const HELPERS = `(() => {
  const a = window.__PALACE__;
  if (!a || a.__night) return 'already';
  const H = {};
  H.freeze = () => { if (window.__RAF_FROZEN__) return 'already'; window.__RAF_FROZEN__ = true; window.__RAF_NATIVE__ = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; window.__STEP_EL__ = window.__EL__ ?? 0; return 'frozen'; };
  H.stepFrame = (dt) => {
    if (!window.__RAF_FROZEN__) H.freeze();
    window.__STEP_EL__ += dt;
    const el = window.__STEP_EL__;
    const st = a.store.state;
    for (const entry of a.zones.values()) { try { entry.result.update(dt, el, st); } catch (e) { /* 同生产 */ } }
    a.rig.update(dt, el, st);
    a.environment.update(dt, el, { ...st, cameraPosition: a.rig.position });
    a.renderSystem.render(a.scene, a.rig.camera);
    a.renderSystem.getStats && a.renderSystem.recordFrame(dt * 1000);
    return el;
  };
  H.press = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: false })); return 'ok'; };
  H.release = (code) => { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: false })); return 'ok'; };
  H.releaseAll = () => { for (const c of ['KeyW','KeyS','KeyA','KeyD']) H.release(c); return 'ok'; };
  H.enterFp = (pos) => { if (a.rig.isFp) a.rig.exitFp({ source: 'probe' }); const r = a.rig.enterFp({ source: 'probe', instant: true, selectionAware: false, position: pos ? { x: pos.x, z: pos.z } : null }); return r ? { ok: true, position: r.position } : { ok: false }; };
  H.settle = (n) => { for (let i = 0; i < (n ?? 90); i += 1) { window.__STEP_EL__ += 1 / 60; const dt = 1 / 60; const st = a.store.state; a.rig.update(dt, window.__STEP_EL__, st); a.environment.update(dt, window.__STEP_EL__, { ...st, cameraPosition: a.rig.position }); } return true; };
  H.stepFast = (dt) => {
    if (!window.__RAF_FROZEN__) H.freeze();
    window.__STEP_EL__ += dt;
    const st = a.store.state;
    a.rig.update(dt, window.__STEP_EL__, st);
    a.environment.update(dt, window.__STEP_EL__, { ...st, cameraPosition: a.rig.position });
    return { x: a.rig.position.x, z: a.rig.position.z, inside: a.environment.describe().interior.inside };
  };
  /** 按 W 不渲染快速逼近到 z ≥ zTarget（用于"走到阴影边界前 3m 再开始逐帧采样"）。 */
  H.approachUntil = (zTarget) => {
    H.press('KeyW');
    let last = null;
    for (let i = 0; i < 2000; i += 1) { last = H.stepFast(1 / 15); if (last.z >= zTarget) break; }
    H.release('KeyW');
    return last;
  };
  H.setPreset = (p) => { a.environment.applyPreset(p); return p; };
  H.setSuppress = (on) => (a.environment.setInteriorFillSuppressInFp ? a.environment.setInteriorFillSuppressInFp(on) : null);
  H.setBloom = (on) => { a.renderSystem.setBloom({ enabled: !!on }); return !!on; };
  H.setShadow = (on) => { const s = a.scene.getObjectByName('environment-sun'); if (!s) return null; s.castShadow = !!on; if (s.shadow) s.shadow.needsUpdate = true; return s.castShadow; };
  /** 一帧的全部读数（亮度用 canvas 降采样；曝光/内景/灯光/阴影全部读生产 describe() 或场景真值）。 */
  /** 一帧的非像素读数（曝光/内景/灯光/阴影/相机；像素亮度由 Node 侧从截图算，避免 readPixels 读空帧）。 */
  H.read = () => {
    const g = a.renderSystem.getStats();
    const d = a.environment.describe();
    const lamps = a.environment.lampSlots ? a.environment.lampSlots() : [];
    const sun = a.scene.getObjectByName('environment-sun');
    return {
      exposure: g && g.quality && typeof g.quality.exposure === 'number' ? g.quality.exposure : (a.renderSystem.renderer ? a.renderSystem.renderer.toneMappingExposure : null),
      bloom: d.bloom ? { strength: d.bloom.effectiveStrength, interiorBlend: d.bloom.interiorBlend, shrink: d.bloom.shrink, tier: d.bloom.interiorTier } : null,
      interior: d.interior ? { inside: d.interior.inside, blend: d.interior.blend, effectiveBlend: d.interior.effectiveBlend, suppressed: d.interior.suppressed, ambient: d.interior.ambientIntensity, hemi: d.interior.hemiIntensity, suppressedFrames: d.interior.suppressedFrames } : null,
      lamps: { pool: d.lamps.pool.map((r) => r.id), sum: +lamps.reduce((s, x) => s + x.intensity, 0).toFixed(4), active: d.lamps.active },
      shadows: { enabled: d.shadows ? d.shadows.enabled : null, mapSize: d.shadows ? d.shadows.mapSize : null, bias: sun && sun.shadow ? +sun.shadow.bias.toFixed(5) : null, normalBias: sun && sun.shadow ? +sun.shadow.normalBias.toFixed(4) : null, radius: sun && sun.shadow ? sun.shadow.radius : null },
      ambient: d.ambientIntensity, sunIntensity: d.sunIntensity, hemi: d.hemiIntensity, exposurePreset: d.exposure,
      cam: { x: +a.rig.position.x.toFixed(2), y: +a.rig.position.y.toFixed(2), z: +a.rig.position.z.toFixed(2) },
    };
  };
  a.__night = H;
  window.__NIGHTSHADOW__ = H;
  return 'ok';
})()`;

const boot = async (preset) => {
  await send('Page.navigate', { url });
  for (let i = 0; i < 140; i += 1) { if (await evaluate('!!(window.__PALACE__ && window.__PALACE__.ready)')) break; await sleep(300); }
  await evaluate('window.__PALACE__.settle && window.__PALACE__.settle()');
  await sleep(300);
  await evaluate(HELPERS);
  await evaluate(`window.__NIGHTSHADOW__.setPreset(${JSON.stringify(preset)})`);
  return 'ok';
};

/**
 * 一条手臂 = 「受光端 → 阴影端（走进） → 停留 → 走回」。用**同一条轨迹的两端**定义受光/阴影：
 * 起点 = 南侧广场（面向北，受光/开阔），终点 = 正殿廊下（阴影）。
 */
const ARM_SPECS = {
  'night-before': { preset: 'moonlitNight', suppress: false, label: 'moonlitNight + 关抑制（修前：缺陷复现）' },
  'night-after': { preset: 'moonlitNight', suppress: true, label: 'moonlitNight + 开抑制（修后：本卡默认）' },
  'dusk-after': { preset: 'sunset', suppress: true, label: 'sunset/dusk + 开抑制（对照）' },
  'golden-after': { preset: 'goldenHour', suppress: true, label: 'goldenHour + 开抑制（对照）' },
  'night-nofillshadows': { preset: 'moonlitNight', suppress: false, label: 'moonlitNight + 关抑制 + 关阴影（(c) 消融对照）', shadow: false },
  'night-bloomoff': { preset: 'moonlitNight', suppress: false, label: 'moonlitNight + 关抑制 + 关 bloom（(b) 消融对照）', bloom: false },
};

const results = [];
let bootInfo = null;
console.log(`服务端口 ${port}｜URL ${url}`);
for (const id of (ARM_FILTER.length ? ARM_FILTER : Object.keys(ARM_SPECS))) {
  const spec = ARM_SPECS[id];
  if (!spec) { console.error(`未知手臂 ${id}`); process.exit(2); }
  if (!bootInfo) { bootInfo = await boot(spec.preset); console.log(`页内补丁=${bootInfo}`); }
  else await evaluate(`window.__NIGHTSHADOW__.setPreset(${JSON.stringify(spec.preset)})`);
  await evaluate('window.__NIGHTSHADOW__.releaseAll(); true');
  await evaluate(`window.__NIGHTSHADOW__.setSuppress(${!!spec.suppress})`);
  await evaluate(`window.__NIGHTSHADOW__.setBloom(${spec.bloom === false ? false : true})`);
  await evaluate(`window.__NIGHTSHADOW__.setShadow(${spec.shadow === false ? false : true})`);
  // 起点 = B/C 之间的空档（在两个内景体积之外）⇒ 随后北行**穿过**体积边界 = "走进阴影"的机构性复现
  await evaluate(`window.__NIGHTSHADOW__.enterFp({ x: 0, z: 66 })`);
  await evaluate('window.__NIGHTSHADOW__.settle(120)');
  const gate = await evaluate('window.__NIGHTSHADOW__.stepFast(1/15)');
  const approach = await evaluate('window.__NIGHTSHADOW__.approachUntil(78)');
  await evaluate('window.__NIGHTSHADOW__.stepFrame(1/60); true');
  console.log(`[${id}] 逼近：起点 ${JSON.stringify(gate)} → 采样起点 ${JSON.stringify(approach)}（inside=${approach && approach.inside}）`);

  const series = [];
  const push = async (phase, i) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const img = decodePng(Buffer.from(shot.result.data, 'base64'));
    series.push({ phase, i, ...(await evaluate('window.__NIGHTSHADOW__.read()')), ...luminanceMeans(img) });
  };
  await push('open', -1);
  await evaluate(`window.__NIGHTSHADOW__.press('KeyW')`);
  for (let i = 0; i < WALK; i += 1) { await evaluate('window.__NIGHTSHADOW__.stepFrame(1/60); true'); await push('in', i); }
  await evaluate(`window.__NIGHTSHADOW__.release('KeyW')`);
  for (let i = 0; i < STAY; i += 1) { await evaluate('window.__NIGHTSHADOW__.stepFrame(1/60); true'); await push('stay', i); }
  await evaluate(`window.__NIGHTSHADOW__.press('KeyS')`);
  for (let i = 0; i < WALK; i += 1) { await evaluate('window.__NIGHTSHADOW__.stepFrame(1/60); true'); await push('out', i); }
  await evaluate(`window.__NIGHTSHADOW__.release('KeyS')`);
  await evaluate('window.__NIGHTSHADOW__.releaseAll(); true');

  const openFrame = series.find((s) => s.phase === 'open');
  const inFrames = series.filter((s) => s.phase === 'in');
  const stayFrames = series.filter((s) => s.phase === 'stay');
  const outFrames = series.filter((s) => s.phase === 'out');
  const litMean = inFrames.length ? inFrames[0].frameMean : openFrame.frameMean;                        // 行走起点（受光端）
  const shadowMean = stayFrames.length ? stayFrames[stayFrames.length - 1].frameMean : (inFrames.length ? inFrames[inFrames.length - 1].frameMean : null);
  const walkInRise = +(Math.max(...inFrames.map((f) => f.frameMean)) - litMean).toFixed(4);
  const exposures = [...new Set(series.map((s) => s.exposure))];
  const res = {
    id,
    label: spec.label,
    preset: spec.preset,
    suppress: spec.suppress,
    frames: series.length,
    walkFrames: WALK,
    litMean: +litMean.toFixed(4),
    shadowMean: shadowMean === null ? null : +shadowMean.toFixed(4),
    shadowPenalty: shadowMean === null ? null : +(litMean - shadowMean).toFixed(4),
    walkInRise,
    walkOutDrop: +(Math.max(...outFrames.map((f) => f.frameMean)) - outFrames[outFrames.length - 1].frameMean).toFixed(4),
    exposureDistinct: exposures.length,
    exposures,
    ambientSeries: [...new Set(series.map((s) => s.interior?.ambient ?? null))],
    bloomSeries: [...new Set(series.map((s) => s.bloom?.strength ?? null))],
    interiorInsideFrames: series.filter((s) => s.interior?.inside).length,
    suppressFrames: series.filter((s) => s.interior?.suppressed).length,
    lampSumRange: [Math.min(...series.map((s) => s.lamps.sum)), Math.max(...series.map((s) => s.lamps.sum))],
    shadows: series[0].shadows,
    camStart: series[0].cam,
    camEnd: series[series.length - 1].cam,
    series: series.map((s) => ({ phase: s.phase, i: s.i, mean: s.frameMean, center: s.centerMean, lower: s.lowerMean, amb: s.interior?.ambient, eff: s.interior?.effectiveBlend, inside: s.interior?.inside, bloom: s.bloom?.strength, exp: s.exposure, lampSum: s.lamps.sum })),
  };
  results.push(res);
  console.log(`[${id}] ${spec.label}`);
  console.log(`   受光端均值=${res.litMean}｜阴影端均值=${res.shadowMean}（阴影更暗 ${res.shadowPenalty}）｜走进段最大上升=${res.walkInRise}`);
  console.log(`   曝光去重=${res.exposureDistinct}${JSON.stringify(res.exposures)}｜内景补光 ambient 取值=${JSON.stringify(res.ambientSeries)}｜bloom=${JSON.stringify(res.bloomSeries)}｜灯Σ=${res.lampSumRange.map((v) => v.toFixed(2)).join('–')}`);
  console.log(`   阴影相机=${JSON.stringify(res.shadows)}｜内景内帧数=${res.interiorInsideFrames}｜抑制帧数=${res.suppressFrames}`);
}

const report = { protocol: { url, size: [W, H], quality: QUALITY, walk: WALK, stay: STAY, riseTol: RISE_TOL, drive: 'rAF 冻结 + stepFrame(1/60)（逐字复刻 main.js frameStep）', input: '真实 KeyboardEvent → interaction → core keys → updateFp()' }, boot: bootInfo, arms: results };
writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
console.log(`读数 ⇒ ${JSON_OUT}`);

/* ------------------------------ 判据 ------------------------------ */
let ok = true;
const before = results.find((r) => r.id === 'night-before');
const after = results.find((r) => r.id === 'night-after');
if (before) {
  if (!(before.walkInRise > 0.5)) { console.error(`判据失败：修前必须复现"走进阴影变亮"（实测上升 ${before.walkInRise} ≤ 0.5）`); ok = false; }
  else console.log(`修前复现：walkInRise=${before.walkInRise}（>0.5 ✓）｜内景补光 ambient=${JSON.stringify(before.ambientSeries)}`);
}
if (after) {
  if (before && !(before.walkInRise > after.walkInRise)) { console.error(`判据失败：修后的上升（${after.walkInRise}）必须小于修前（${before.walkInRise}）`); ok = false; }
  if (!(after.walkInRise <= RISE_TOL)) { console.error(`判据失败：修后走进阴影整帧均值上升 ${after.walkInRise} > 容差 ${RISE_TOL}`); ok = false; }
  if (!(after.shadowPenalty > 0)) { console.error(`判据失败：阴影端必须比受光端更暗（实测差 ${after.shadowPenalty}）`); ok = false; }
  if (after.exposureDistinct !== 1) { console.error(`判据失败：行走过程中曝光必须恒定（实测 ${after.exposureDistinct} 种）`); ok = false; }
} else if (!before) {
  console.error('判据失败：既未运行 night-after 也未运行 night-before（不静默 PASS）');
  ok = false;
}
console.log(ok ? 'PASS' : 'FAIL');
ws.close(); chrome.kill(); server.close();
process.exit(ok ? 0 : 1);
