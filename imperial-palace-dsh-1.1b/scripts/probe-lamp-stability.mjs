/**
 * t5：**镜头旋转 × 宫灯闪烁** 稳定性探针（真实浏览器 + 真实生产循环；只读，不改产品逻辑）。
 *
 * 协议（与任务契约逐字对应）：
 *   · 真实 headless Chrome 打开 `index.html`；帧数 ≥120（默认 150）；每帧用**生产输入入口**
 *     `rig.applyInput('rotate', { dx })` 转 **0.5°**（`azimuth -= dx*0.0055` 弧度），
 *     再驱动**生产渲染循环同一路径** `environment.update(dt, t, { cameraPosition: rig.position })` + `renderSystem.render()`；
 *   · 逐帧记录：激活灯集合（**槽位→灯位 id**、强度、位置）、池排名（`describe().lamps.pool`）、
 *     整帧亮度（canvas 降采样逐格亮度）、相邻帧亮度差；
 *   · 三条臂（同一相机轨迹，逐帧同 dx）：
 *       `rotate`   正常臂（灯按生产逻辑重选）
 *       `lampsoff` 对照臂：`environment.setActiveOverrides({ lampIntensity: 0 })` 把宫灯强度清零 ⇒ 逐帧像素差 = **纯运动基线**
 *       `static`   对照臂：不旋转 ⇒ 逐帧像素差 = 非旋转噪声（flicker/粒子）
 *     **灯致闪烁 = rotate 臂逐帧像素差 − lampsoff 臂逐帧像素差**（同一轨迹逐帧对齐），
 *     从而把"旋转导致的整屏位移"从"灯的突变"里剥离（§12.1.4.2 对照不假红）。
 *
 * 判据（产品**直接读数**，不复算）：
 *   ① `flashFx` = 相邻两帧**同一灯位**强度差 ≥ FLASH_DELTA（默认 1.5；夜间基准 18）
 *   ② `slotFx`  = 某**槽位**绑定灯位 id 变化（池集合或池内次序变化都能抓到）
 *   ③ `powerFx` = |Σ intensity_t − Σ intensity_{t−1}| ≥ POWER_DELTA（默认 1.5）⇒ 整池光功率突变
 *   ④ `lampPxFx`= 灯致像素差（rotate − lampsoff，逐帧逐格）峰值 ≥ PX_DELTA（默认 3.0/255）
 * 退出码：任一红 ⇒ 1（`--allow` 放行，仅用于修前取证）。
 *
 * 用法：
 *   MODE=zone AREA=B ARM=rotate node scripts/probe-lamp-stability.mjs
 *   DUMP=1 node scripts/probe-lamp-stability.mjs        # 只导出真实灯位表/机位表（供离线分析）
 * 产物：`work/lamp-stability/<label>.json`
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const OUT = join(ROOT, 'work', 'lamp-stability');
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 720);
const FRAMES = Number(process.env.FRAMES ?? 150);
const DEG_PER_FRAME = Number(process.env.DEG ?? 0.5);
const ARM = process.env.ARM ?? 'rotate'; // rotate | lampsoff | static
const MODE = process.env.MODE ?? 'orbit';
const AREA = process.env.AREA ?? 'city';
const BUILDING = process.env.BUILDING ?? 'B-hall-main';
const PRESET = process.env.PRESET ?? 'moonlitNight';
const QUALITY = process.env.QUALITY ?? 'medium';
const FLASH_DELTA = Number(process.env.FLASH_DELTA ?? 1.5);
const POWER_DELTA = Number(process.env.POWER_DELTA ?? 1.5);
const PX_DELTA = Number(process.env.PX_DELTA ?? 3.0);
/**
 * 硬切判据：**强度变化率**（绝对强度单位/秒）而非"单帧增量"。
 * 理由：斜坡是**时间基准**的，单帧增量随帧率变化（headless rAF 被节流到 ~15fps 时 dt=1/15，
 * 单帧增量天然到 4.0，但那是 0.3s 斜坡的正常一步，不是硬切）。
 * 斜坡上界 = `LIGHTING.lamps.intensity × lampIntensityScale / LAMP_FADE_SECONDS = 18 / 0.3 = 60/s`；
 * 基线（无斜坡）= 一帧内从 0 到满量程 ⇒ `18 / dt` = 270/s（15fps）～1080/s（60fps）。
 * 取 90/s（斜坡上界的 1.5 倍）作判据：斜坡全绿、基线必红。
 */
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 90.0);
const DUMP = process.env.DUMP === '1';
const LABEL = process.env.LABEL ?? `t5-${MODE}-${AREA}-${ARM}-${DEG_PER_FRAME}deg-${PRESET}-${QUALITY}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const DX = (DEG_PER_FRAME * Math.PI) / 180 / 0.0055;
const DEBUG_PORT = 9300 + (process.pid % 400);

/**
 * `BASELINE=1`：把 `git HEAD` 的 `environment.js`（t5 修前版本）当作 `/src/core/environment.js` 提供，
 * 用于"修前必红"取证（§12.1.4.2）。基线副本的相对 import 已按同样层级改写，故路径可正确解析。
 */
const BASELINE = process.env.BASELINE === '1';
const BASELINE_FILE = join(ROOT, 'work', 'lamp-stability', 'baseline', 'environment-baseline.mjs');
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') p = join(ROOT, 'index.html');
  if (BASELINE && url.pathname === '/src/core/environment.js') p = BASELINE_FILE;
  // 必须 no-store：Chrome 会对无缓存头的 ES 模块做启发式缓存，配合复用的 profile 目录
  // 会静默加载**上一版**产品代码（t5 实测踩坑：读到的 lampSlots 缺 fade 字段，差点据此下结论）。
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store, no-cache, must-revalidate' }); res.end(readFileSync(p)); }
  catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=/tmp/t5-chrome-${process.pid}-${Date.now()}`, `--window-size=${W},${H}`, `http://127.0.0.1:${port}/index.html?quality=${QUALITY}&ui=0`], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i += 1) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null; } catch { /* wait */ }
  if (!wsUrl) await sleep(300);
}
if (!wsUrl) { console.error('无法连接 Chrome CDP'); chrome.kill(); server.close(); process.exit(2); }
const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
for (let i = 0; i < 120; i += 1) { if (await evaluate('!!(window.__PALACE__ && window.__PALACE__.ready)')) break; await sleep(400); }
const boot = await evaluate(`(async () => {
  const a = window.__PALACE__;
  await a.ready;
  a.store.patch({ timePreset: ${JSON.stringify(PRESET)}, quality: ${JSON.stringify(QUALITY)} }, { source: 'probe' });
  // 走**生产事件入口**落位（与 UI 分区按钮同一条路）：zone 模式下相机离灯位足够近，实时灯池非空
  if (${JSON.stringify(MODE)} === 'zone') a.events.request(a.config?.EVENTS?.requestZoneFocus ?? 'view:request-zone', { area: ${JSON.stringify(AREA)}, source: 'probe' });
  else if (${JSON.stringify(MODE)} === 'focus') a.events.request(a.config?.EVENTS?.requestFocusBuilding ?? 'view:request-focus-building', { buildingId: ${JSON.stringify(BUILDING)}, source: 'probe' });
  else a.rig.applyMode(${JSON.stringify(MODE)}, { instant: true, source: 'probe' });
  a.rig.update(2, 0, a.store.state);            // 把镜头过渡推到终点（等价 settle 的镜头部分）
  a.rig.applyMode(${JSON.stringify(MODE)}, { instant: true, source: 'probe' });
  a.environment.update(0, 0, { ...a.store.state, cameraPosition: a.rig.position });
  const d = a.environment.describe();
  const rig = a.rig.describe();
  return {
    preset: a.store.state.timePreset, quality: a.store.state.quality, mode: a.rig.mode,
    presetApplied: d.preset, lampSlotsApi: typeof a.environment.lampSlots === 'function',
    anchors: d.lamps.anchors, capacity: d.lamps.capacity, active: d.lamps.active,
    rigDistance: rig.distance, rigPos: rig.position, rigTarget: rig.target,
    lampsOverrideApi: typeof a.environment.setActiveOverrides === 'function',
    // 版本自检：浏览器跑的是不是当前磁盘代码（无缓存头 + 唯一 profile 目录仍可能被启发式缓存坑到）
    servedSha: await (async () => {
      const r = await fetch('/src/core/environment.js', { cache: 'no-store' });
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(await r.text()));
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    })(),
    hasFadeField: (() => {
      if (typeof a.environment.lampSlots !== 'function') return false;
      const s = a.environment.lampSlots()[0] ?? {};
      return 'fade' in s && 'baseTarget' in s;
    })(),
    anchorList: a.registry.allLightAnchors().map((x) => ({ id: x.id, role: x.role ?? null, zone: x.zone ?? null, kind: x.kind ?? null, position: { ...x.position }, height: x.height ?? null })),
    viewpoints: (a.registry.allViewpoints ? a.registry.allViewpoints() : []).map((v) => ({ id: v.id, area: v.area ?? null, position: { ...v.position }, target: v.target ? { ...v.target } : null })),
    configCamera: { zoneViewpointByArea: a.registry && null },
  };
})()`);
await sleep(500);
if (DUMP) {
  writeFileSync(join(OUT, 'anchors.json'), JSON.stringify(boot, null, 1));
  console.log(`[t5 DUMP] 灯位 ${boot.anchorList.length}｜机位 ${boot.viewpoints.length}｜模式 ${boot.mode}｜池容量 ${boot.capacity}｜激活 ${boot.active}｜距离 ${boot.rigDistance?.toFixed?.(1)}`);
  console.log(` ⇒ ${join(OUT, 'anchors.json')}`);
  ws.close(); chrome.kill(); server.close(); process.exit(0);
}
if (!boot?.lampSlotsApi && process.env.SKIP_VERSION_CHECK !== '1') { console.error('产品未导出 environment.lampSlots()：本探针需要灯位级直接读数'); ws.close(); chrome.kill(); server.close(); process.exit(2); }
{
  const diskSha = createHash('sha256').update(readFileSync(join(ROOT, 'src/core/environment.js'))).digest('hex').slice(0, 16);
  const skipVersion = process.env.SKIP_VERSION_CHECK === '1';
  if (boot.servedSha !== diskSha && !process.env.SKIP_VERSION_CHECK) { console.error(`浏览器跑的不是当前磁盘代码（served=${boot.servedSha} disk=${diskSha}）——拒绝出结论`); ws.close(); chrome.kill(); server.close(); process.exit(3); }
  if (!boot.hasFadeField && !skipVersion) { console.error('lampSlots() 缺 fade/baseTarget 字段——产品代码版本不符，拒绝出结论（基线取证请显式 SKIP_VERSION_CHECK=1）'); ws.close(); chrome.kill(); server.close(); process.exit(3); }
  if (skipVersion) console.warn('[t5] ⚠ 已跳过字段自检（基线/对照取证专用；读数回退到真机灯对象，anchorId 为空）');
  else console.log(`[t5] 版本自检：served=disk=${diskSha}｜lampSlots 含 fade/baseTarget ✓`);
}
if (ARM === 'lampsoff') {
  const r = await evaluate(`(() => { const d = window.__PALACE__.environment.setActiveOverrides({ lampIntensity: 0 }); return d.lamps; })()`);
  await sleep(200);
  console.log(`[t5] 对照臂 lampsoff 生效：${JSON.stringify(r).slice(0, 160)}`);
}

/* ── 逐帧协议：**在生产循环内部采样**（不在外面另起一套 update，避免与页面自身 rAF 抢时序） ──
 *
 * 旧协议（已废弃）：探针自己在外面调 `environment.update` + `render`，与页面自身的 rAF `frameStep`
 * 交替执行 ⇒ 节流窗口被页面循环的**真实 elapsed** 打乱、还触发 `resume` 快照 ⇒ 读到的是两条时间轴
 * 混在一起的假象（t5 实测：同一相机轨迹下 maxFlash 2.7 与 0.1 交替出现）。
 * 新协议：包一层生产循环自己的 `renderSystem.recordFrame`（每帧末尾恰好调用一次），在**该帧
 * environment.update 之后**读全部读数，再为**下一帧**推进 0.5° 镜头。产品代码一行不改。
 */
await evaluate(`(() => {
  const a = window.__PALACE__;
  const st = { count: 0, target: ${FRAMES}, rotate: ${ARM === 'static' ? 'false' : 'true'}, dx: ${DX},
               frames: [], done: false, error: null, started: 0 };
  window.__t5 = st;
  const GX = 16, GY = 10;
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 100;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  let prevGrid = null;
  const rs = a.renderSystem;
  const orig = rs.recordFrame.bind(rs);
  rs.recordFrame = function (ms) {
    let out;
    try { out = orig(ms); } catch (e) { st.error = String((e && e.message) || e); }
    if (!st.done) {
      try {
        const env = a.environment, rig = a.rig;
        const canvas = rs.canvas ?? rs.renderer?.domElement ?? document.querySelector('canvas');
        cx.drawImage(canvas, 0, 0, cv.width, cv.height);
        const px = cx.getImageData(0, 0, cv.width, cv.height).data;
        const cw = cv.width / GX, chh = cv.height / GY;
        const grid = new Float64Array(GX * GY);
        let total = 0;
        for (let y = 0; y < cv.height; y += 1) {
          const gy = Math.min(GY - 1, (y / chh) | 0);
          for (let x = 0; x < cv.width; x += 1) {
            const i = (y * cv.width + x) * 4;
            const l = 0.2126 * px[i] + 0.7152 * px[i+1] + 0.0722 * px[i+2];
            grid[gy * GX + Math.min(GX - 1, (x / cw) | 0)] += l;
            total += l;
          }
        }
        const cell = cw * chh;
        let meanAbs = null, maxPx = null;
        if (prevGrid) {
          let s2 = 0, m2 = 0;
          for (let k = 0; k < grid.length; k += 1) { const dd = Math.abs(grid[k] - prevGrid[k]) / cell; s2 += dd; if (dd > m2) m2 = dd; }
          meanAbs = s2 / grid.length; maxPx = m2;
        }
        prevGrid = Float64Array.from(grid);
        const d = env.describe();
        const az = rig.describe();
        const slots = typeof env.lampSlots === 'function'
          ? env.lampSlots()
          : env.lightObjects().realtimeLights.map((l, idx) => ({ index: idx, anchorId: null, visible: l.visible, intensity: l.intensity, baseIntensity: null, baseTarget: null, fade: null, target: l.visible ? 1 : 0, position: { x: l.position.x, y: l.position.y, z: l.position.z } }));
        let power = 0;
        for (const sl of slots) power += sl.intensity;
        st.frames.push({
          i: st.count,
          dtMs: ms,
          azimuthDeg: az.azimuthDeg,
          camPos: [rig.position.x, rig.position.y, rig.position.z],
          frameBrightness: total / (cv.width * cv.height),
          grid: Array.from(grid, (v) => +(v / cell).toFixed(3)),
          meanAbsPixelDelta: meanAbs === null ? null : +meanAbs.toFixed(4),
          maxPixelDelta: maxPx === null ? null : +maxPx.toFixed(3),
          power: +power.toFixed(4),
          pool: d.lamps.pool.map((r) => ({ rank: r.rank, id: r.id, distance: r.distance, score: r.score })),
          slots: slots.map((sl) => ({ index: sl.index, anchorId: sl.anchorId, visible: sl.visible, intensity: +sl.intensity.toFixed(4), baseIntensity: sl.baseIntensity === null ? null : +sl.baseIntensity.toFixed(4), baseTarget: sl.baseTarget === null ? null : +sl.baseTarget.toFixed(4), fade: sl.fade === null ? null : +sl.fade.toFixed(4), target: sl.target, position: sl.position })),
          active: d.lamps.active, capacity: d.lamps.capacity,
          hysteresis: d.lamps.hysteresis, fadeInfo: d.lamps.fade,
        });
        st.count += 1;
        if (st.count >= st.target) { st.done = true; return out; }
        if (st.rotate) rig.applyInput('rotate', { dx: st.dx, dy: 0 }); // 为下一帧推进镜头（与生产拖动同入口）
      } catch (e) { st.error = String((e && e.stack) || e); st.done = true; }
    }
    return out;
  };
  st.started = performance.now();
  return true;
})()`);
{
  const t0 = Date.now();
  const budgetMs = Number(process.env.FRAME_TIMEOUT_MS ?? 900000);
  for (;;) {
    const st = await evaluate('({ count: window.__t5.count, done: window.__t5.done, error: window.__t5.error })');
    if (st.error) { console.error('采样器报错：', st.error); ws.close(); chrome.kill(); server.close(); process.exit(4); }
    if (st.done) break;
    if (Date.now() - t0 > budgetMs) { console.error(`采样超时：只拿到 ${st.count}/${FRAMES} 帧`); ws.close(); chrome.kill(); server.close(); process.exit(5); }
    await sleep(1000);
  }
  console.log(`[t5] 生产循环内采样完成：${FRAMES} 帧`);
}
const frames = await evaluate('window.__t5.frames');
const wall = await evaluate('Math.round(performance.now() - window.__t5.started)');
boot.sampleWallMs = wall;

const rows = [];
let flashEvents = 0; let membershipFx = 0; let slotFx = 0; let slotChangesTotal = 0; let powerFx = 0;
for (let i = 0; i < frames.length; i += 1) {
  const f = frames[i];
  if (i === 0) { rows.push({ i, azimuthDeg: +f.azimuthDeg.toFixed(3), first: true, grid: f.grid }); continue; }
  const p = frames[i - 1];
  const prevById = new Map(p.slots.filter((s) => s.anchorId).map((s) => [s.anchorId, s]));
  const dtSec = Math.max(1e-3, (f.dtMs ?? 16) / 1000);
  let maxFlash = 0; let flashId = null; let maxRate = 0;
  // 主指标：**槽位强度**变化率 —— 物理上就是"照亮画面的那盏灯"的强度变化，两版都可读
  for (let k = 0; k < f.slots.length; k += 1) {
    const delta = Math.abs((f.slots[k]?.intensity ?? 0) - (p.slots[k]?.intensity ?? 0));
    if (delta > maxFlash) { maxFlash = delta; flashId = f.slots[k]?.anchorId ?? `slot${k}`; }
    const rate = delta / dtSec;
    if (rate > maxRate) maxRate = rate;
  }
  // 辅指标：同一灯位（anchor id）的强度变化率（仅产品导出 lampSlots 时可用）
  let maxAnchorRate = 0;
  for (const s of f.slots) {
    if (!s.anchorId) continue;
    const q = prevById.get(s.anchorId);
    if (!q) continue;
    const rate = Math.abs(s.intensity - q.intensity) / dtSec;
    if (rate > maxAnchorRate) maxAnchorRate = rate;
  }
  const poolIds = f.pool.map((r) => r.id).join(',');
  const prevPoolIds = p.pool.map((r) => r.id).join(',');
  let slotChanges = 0;
  for (let k = 0; k < f.slots.length; k += 1) if ((f.slots[k].anchorId ?? null) !== (p.slots[k]?.anchorId ?? null)) slotChanges += 1;
  const powerDelta = Math.abs(f.power - p.power);
  const row = {
    i,
    azimuthDeg: +f.azimuthDeg.toFixed(3),
    camPos: f.camPos.map((v) => +v.toFixed(1)),
    capacity: f.capacity, active: f.active,
    poolIds, membershipChanged: poolIds !== prevPoolIds,
    slotChanges,
    maxFlash: +maxFlash.toFixed(3), maxRate: +maxRate.toFixed(1), maxAnchorRate: +maxAnchorRate.toFixed(1), dtMs: f.dtMs, flashId,
    power: f.power, powerDelta: +powerDelta.toFixed(3),
    frameBrightness: +f.frameBrightness.toFixed(4),
    meanAbsPixelDelta: typeof f.meanAbsPixelDelta === 'number' ? f.meanAbsPixelDelta : null,
    maxPixelDelta: typeof f.maxPixelDelta === 'number' ? f.maxPixelDelta : null,
    grid: f.grid,
  };
  if (maxRate >= RATE_LIMIT) flashEvents += 1; // 硬切判据 = 强度变化率（满量程/秒）
  if (row.membershipChanged) membershipFx += 1;
  if (slotChanges > 0) { slotFx += 1; slotChangesTotal += slotChanges; }
  if (powerDelta >= POWER_DELTA) powerFx += 1;
  rows.push(row);
}
const nums = (arr) => arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
const brightness = nums(frames.map((f) => f.frameBrightness));
const deltas = nums(rows.map((r) => r.meanAbsPixelDelta));
const flashes = nums(rows.map((r) => r.maxFlash));
const rates = nums(rows.map((r) => r.maxRate));
const dts = nums(rows.map((r) => r.dtMs));
const powers = nums(rows.map((r) => r.power));
const summary = {
  label: LABEL, arm: ARM, mode: boot.mode,
  spec: { W, H, FRAMES, DEG_PER_FRAME, PRESET, QUALITY, FLASH_DELTA, POWER_DELTA, PX_DELTA, dx: +DX.toFixed(6) },
  boot: { anchors: boot.anchors, capacity: boot.capacity, active: boot.active, rigDistance: boot.rigDistance, rigPos: boot.rigPos, rigTarget: boot.rigTarget, presetApplied: boot.presetApplied, quality: boot.quality },
  flashEvents, membershipFx, slotFx, slotChangesTotal, powerFx,
  membershipRatio: +(membershipFx / Math.max(1, frames.length - 1)).toFixed(3),
  slotRatio: +(slotFx / Math.max(1, frames.length - 1)).toFixed(3),
  brightness: brightness.length ? { min: +Math.min(...brightness).toFixed(4), max: +Math.max(...brightness).toFixed(4), mean: +(brightness.reduce((a, b) => a + b, 0) / brightness.length).toFixed(4) } : null,
  power: powers.length ? { min: +Math.min(...powers).toFixed(3), max: +Math.max(...powers).toFixed(3), mean: +(powers.reduce((a, b) => a + b, 0) / powers.length).toFixed(3) } : null,
  maxMeanAbsPixelDelta: deltas.length ? +Math.max(...deltas).toFixed(4) : null,
  meanOfMeanAbsPixelDelta: deltas.length ? +(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(4) : null,
  maxFlash: flashes.length ? +Math.max(...flashes).toFixed(3) : 0,
  maxRate: rates.length ? +Math.max(...rates).toFixed(1) : 0,
  meanDtMs: dts.length ? +(dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(2) : null,
  distinctPoolSets: new Set(frames.map((f) => f.pool.map((r) => r.id).join(','))).size,
};
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify({ summary, rows: rows.map(({ grid, ...r }) => r), grids: rows.map((r) => r.grid), frames }, null, 1));
console.log(`[t5 探针] ${LABEL}｜臂=${ARM}｜模式 ${boot.mode}｜帧 ${frames.length}｜每帧 ${DEG_PER_FRAME}°｜预设 ${boot.presetApplied}/${boot.quality}`);
console.log(` 灯位 ${boot.anchors}｜池容量 ${boot.capacity}｜激活 ${frames[0].active}｜相机距离 ${boot.rigDistance?.toFixed?.(1) ?? boot.rigDistance}`);
console.log(` 池集合变化帧 ${membershipFx}/${frames.length - 1}（${(summary.membershipRatio * 100).toFixed(1)}%）｜不同池集合 ${summary.distinctPoolSets} 种`);
console.log(` 槽位绑定变化帧 ${slotFx}（累计 ${slotChangesTotal} 次）｜硬切帧(变化率≥${RATE_LIMIT}/s) ${flashEvents}｜单帧最大增量 ${summary.maxFlash}｜最大变化率 ${summary.maxRate}/s｜光功率突变(≥${POWER_DELTA})帧 ${powerFx}`);
console.log(` 平均帧时长 ${summary.meanDtMs} ms（headless rAF 节流；斜坡按时间基准，故判据用变化率）`);
console.log(` 整帧亮度 ${summary.brightness?.min}–${summary.brightness?.max}（均值 ${summary.brightness?.mean}）｜池光功率 ${summary.power?.min}–${summary.power?.max}（均值 ${summary.power?.mean}）`);
console.log(` 相邻帧平均逐像素差 ${summary.meanOfMeanAbsPixelDelta}（峰值 ${summary.maxMeanAbsPixelDelta}）`);
console.log(` 读数 ⇒ ${join(OUT, `${LABEL}.json`)}`);
ws.close(); chrome.kill(); server.close();
const red = flashEvents > 0 || powerFx > 0 || membershipFx > 0;
const allow = process.argv.includes('--allow');
process.exit(red && !allow ? 1 : 0);
