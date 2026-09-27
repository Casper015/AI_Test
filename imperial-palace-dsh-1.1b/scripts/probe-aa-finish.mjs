#!/usr/bin/env node
/**
 * t16（抗锯齿收尾）**只读取证探针**：真实 headless Chrome +
 *   ① `MODE=perf`：low / medium / high 三档的**真实浏览器**帧时间读数（生产 `recordFrame` 统计，`getStats()`）
 *      + `?stats=1` DOM 面板里的**实际生效 AA 模式与 samples**；
 *   ② `MODE=edge`：同一 view/preset 下 `?aa=off` / `?aa=2` / `?aa=4` 的**同帧对照**（只改 AA，其余参数逐值相同）
 *      + 可量化的**边缘指标** + 对照 PNG。
 *
 * 指标定义（同一分辨率、同一像素口径，全部在页面内用真实落屏像素计算）：
 *   · `hardStepRatio` = 相邻像素（横+纵）中 `max|Δ通道| ≥ 96` 的占比 —— **1 像素硬台阶**（锯齿的直接signature）；
 *   · `laplacianMean` = `mean|4·L(x,y) − Σ邻|`（luma 用 0–255 尺度）—— 单像素尺度高频能量；
 *   · `edgeGradientMean` = 仅统计 `|Δ| ≥ 32` 的相邻对的平均 `|Δ|` ——**对照指标**（证明不是"整体模糊"）；
 *   · `edgeZone*` = 在 16×10 网格里取梯度能量最高的 8 个格，只在格内重算上述指标 —— 聚焦几何边缘而非天空/地面。
 *
 * 用法：
 *   MODE=perf                        node scripts/probe-aa-finish.mjs
 *   MODE=edge VIEWS=oblique,iso …    node scripts/probe-aa-finish.mjs
 * 产物：`work/aa-finish/*.json` + `docs/shots-aa/edge/*.png`
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'work', 'aa-finish');
const SHOTS = join(ROOT, 'docs', 'shots-aa');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(SHOTS, 'edge'), { recursive: true });
const CHROME = process.env.CHROME ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
const DPR = Number(process.env.DPR ?? 1);
const MODE = process.env.MODE ?? 'perf';
const QUALITY = process.env.QUALITY ?? 'medium';
const PRESET = process.env.PRESET ?? 'golden';
const VIEWS = (process.env.VIEWS ?? 'oblique,iso,zone').split(',').map((s) => s.trim()).filter(Boolean);
const AA_LIST = (process.env.AA_LIST ?? 'off,2,4').split(',').map((s) => s.trim()).filter(Boolean);
const PERF_TIERS = (process.env.TIERS ?? 'low,medium,high').split(',').map((s) => s.trim()).filter(Boolean);
const PERF_FRAMES = Number(process.env.PERF_FRAMES ?? 240);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const DEBUG_PORT = 9500 + (process.pid % 400);

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') p = join(ROOT, 'index.html');
  try {
    // no-store：避免 Chrome 启发式缓存叠加复用 profile 时静默加载旧版产品代码
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store, no-cache, must-revalidate' });
    res.end(readFileSync(p));
  } catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let chrome = null;
let ws = null;
let seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};

async function openPage(query) {
  if (chrome) { try { ws.close(); } catch { /* ignore */ } try { chrome.kill(); } catch { /* ignore */ } await sleep(300); }
  const url = `http://127.0.0.1:${port}/index.html?${query}`;
  /**
   * t16：**用真实 GPU**（ANGLE Metal）而不是 SwiftShader 软光栅 —— 抗锯齿是**填充率**开销，
   * 软光栅下的帧时间与真机差一个量级、且随分辨率非线性放大（实测 `--disable-gpu` 时 800×450 已 1.1s/帧），
   * 无法回答"三档性能"这个问题。实测本机 `--use-angle=metal` 可拿到 `Apple M5` 且 `MAX_SAMPLES = 8`
   * ⇒ samples 2/4 都是真实多重采样。GPU 字符串在 `gpu` 字段回传，供复核。
   */
  const GL_FLAGS = (process.env.GL_FLAGS ?? '--use-angle=metal').split(',').map((x) => x.trim()).filter(Boolean);
  chrome = spawn(CHROME, ['--headless', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=/tmp/t16-chrome-${process.pid}-${Date.now()}`, `--window-size=${W},${H}`, url], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 90 && !wsUrl; i += 1) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null; } catch { /* wait */ }
    if (!wsUrl) await sleep(300);
  }
  if (!wsUrl) throw new Error('无法连接 Chrome CDP');
  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  for (let i = 0; i < 150; i += 1) { if (await evaluate('!!(window.__PALACE__ && window.__PALACE__.ready)')) break; await sleep(400); }
  await evaluate('window.__PALACE_UI__ && window.__PALACE_UI__.setVisible && window.__PALACE_UI__.setVisible(false)');
  const gpu = await evaluate(`(() => {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2');
    if (!gl) return null;
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return { vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxSamples: gl.getParameter(gl.MAX_SAMPLES) };
  })()`);
  report.gpu = gpu;
  report.glFlags = GL_FLAGS;
  console.log(`[gl] ${gpu?.renderer ?? '(未取到)'}｜MAX_SAMPLES=${gpu?.maxSamples ?? '?'}`);
  return url;
}

/** 在页面内安装"生产循环内"采样器：包装 `recordFrame`，在其中读真实读数。 */
async function installSampler() {
  await evaluate(`(() => {
    const a = window.__PALACE__;
    const st = { frames: 0, target: 0, done: false, mode: null, capture: null, ticks: [], wall: [], tick: null };
    window.__aa = st;
    const rs = a.renderSystem;
    const orig = rs.recordFrame.bind(rs);
    rs.recordFrame = function (ms) {
      const out = orig(ms);
      st.frames += 1;
      if (st.capture && !st.capture.done) {
        try { st.capture.result = window.__aaMeasure(); st.capture.done = true; } catch (e) { st.capture.error = String((e && e.stack) || e); st.capture.done = true; }
      }
      st.ticks.push(ms); // recordFrame 的入参 = 该帧 dt（ms）
      if (st.tick !== null) st.wall.push(performance.now() - st.tick);
      st.tick = performance.now();
      if (st.target > 0 && st.frames >= st.target) st.done = true;
      return out;
    };
    // 量测函数：真实落屏像素（drawImage 到 2D canvas 后 getImageData）
    window.__aaMeasure = function () {
      const rs2 = a.renderSystem;
      const canvas = rs2.canvas ?? rs2.renderer?.domElement ?? document.querySelector('canvas');
      const cv = document.createElement('canvas');
      cv.width = canvas.width; cv.height = canvas.height;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(canvas, 0, 0);
      const px = cx.getImageData(0, 0, cv.width, cv.height).data;
      const w = cv.width, h = cv.height;
      const lum = new Float32Array(w * h);
      for (let i = 0, k = 0; i < px.length; i += 4, k += 1) lum[k] = 0.2126 * px[i] + 0.7152 * px[i+1] + 0.0722 * px[i+2];
      const measure = (x0, y0, x1, y1) => {
        let pairs = 0, hard = 0, gradSum = 0, gradN = 0, lapSum = 0, lapN = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const c = lum[y * w + x];
            if (x + 1 < x1) { const d = Math.abs(lum[y * w + x + 1] - c); pairs += 1; if (d >= 96) hard += 1; if (d >= 32) { gradSum += d; gradN += 1; } }
            if (y + 1 < y1) { const d = Math.abs(lum[(y + 1) * w + x] - c); pairs += 1; if (d >= 96) hard += 1; if (d >= 32) { gradSum += d; gradN += 1; } }
            if (x > x0 && y > y0 && x + 1 < x1 && y + 1 < y1) {
              lapSum += Math.abs(4 * c - lum[y * w + x - 1] - lum[y * w + x + 1] - lum[(y - 1) * w + x] - lum[(y + 1) * w + x]);
              lapN += 1;
            }
          }
        }
        return { pairs, hardStepRatio: pairs ? hard / pairs : 0, laplacianMean: lapN ? lapSum / lapN : 0, edgeGradientMean: gradN ? gradSum / gradN : 0, edgePairs: gradN };
      };
      const full = measure(0, 0, w, h);
      // 边缘聚焦：16×10 网格取梯度能量最高的 8 格
      const GX = 16, GY = 10, cw = Math.floor(w / GX), ch = Math.floor(h / GY);
      const cells = [];
      for (let gy = 0; gy < GY; gy += 1) for (let gx = 0; gx < GX; gx += 1) {
        const m = measure(gx * cw, gy * ch, Math.min(w, (gx + 1) * cw), Math.min(h, (gy + 1) * ch));
        cells.push({ gx, gy, energy: m.edgeGradientMean * m.edgePairs, m });
      }
      cells.sort((p, q) => q.energy - p.energy);
      const top = cells.slice(0, 8);
      const zone = { hardStepRatio: 0, laplacianMean: 0, edgeGradientMean: 0, pairs: 0, edgePairs: 0 };
      for (const c of top) {
        zone.hardStepRatio += c.m.hardStepRatio * c.m.pairs;
        zone.laplacianMean += c.m.laplacianMean * c.m.pairs;
        zone.edgeGradientMean += c.m.edgeGradientMean * c.m.edgePairs;
        zone.pairs += c.m.pairs;
        zone.edgePairs += c.m.edgePairs;
      }
      const zoneOut = {
        cells: top.length,
        hardStepRatio: zone.pairs ? zone.hardStepRatio / zone.pairs : 0,
        laplacianMean: zone.pairs ? zone.laplacianMean / zone.pairs : 0,
        edgeGradientMean: zone.edgePairs ? zone.edgeGradientMean / zone.edgePairs : 0,
      };
      /* **对照：平坦区**（梯度能量最低的 8 格）—— MSAA 只在几何边缘工作，不应糊掉纹理/彩画细节。
         若"改善"来自整体模糊，平坦区的 laplacian 会同步显著下降 ⇒ 该对照能识别"假改善"。 */
      const flat = cells.slice(-8);
      const flatAcc = { lap: 0, pairs: 0, hard: 0 };
      for (const c of flat) { flatAcc.lap += c.m.laplacianMean * c.m.pairs; flatAcc.pairs += c.m.pairs; flatAcc.hard += c.m.hardStepRatio * c.m.pairs; }
      const flatOut = { cells: flat.length, laplacianMean: flatAcc.pairs ? flatAcc.lap / flatAcc.pairs : 0, hardStepRatio: flatAcc.pairs ? flatAcc.hard / flatAcc.pairs : 0 };
      /* **对照：中间能量带**（能量排序第 30%–50% 的格）—— 含纹理/彩画细节但很少几何长边，
         是"MSAA 不是整体模糊"的更强对照（纯天空格恒为 0，检验力不足）。 */
      const midLo = Math.floor(cells.length * 0.30);
      const midHi = Math.floor(cells.length * 0.50);
      const mid = cells.slice(midLo, midHi);
      const midAcc = { lap: 0, pairs: 0 };
      for (const c of mid) { midAcc.lap += c.m.laplacianMean * c.m.pairs; midAcc.pairs += c.m.pairs; }
      const textureOut = { cells: mid.length, laplacianMean: midAcc.pairs ? midAcc.lap / midAcc.pairs : 0 };
      const d = a.renderSystem.getStats();
      return {
        size: { w, h },
        full,
        edgeZone: zoneOut,
        flatZone: flatOut,
        textureZone: textureOut,
        aa: d.quality.antialias,
        drawCalls: d.mainScene.drawCalls,
        visibleTriangles: d.mainScene.visibleTriangles,
        tier: d.quality.tier,
        dpr: d.quality.dpr,
        bloom: d.quality.bloom,
        // 供 off/on 逐像素对照（缩略图采样，避免回传全图）
        thumb: (() => {
          const TW = 180, TH = 112, out = new Array(TW * TH);
          for (let y = 0; y < TH; y += 1) for (let x = 0; x < TW; x += 1) out[y * TW + x] = +lum[(Math.min(h - 1, Math.floor((y + 0.5) * h / TH))) * w + Math.min(w - 1, Math.floor((x + 0.5) * w / TW))].toFixed(2);
          return { w: TW, h: TH, data: out };
        })(),
      };
    };
    return true;
  })()`);
}

async function captureOnce() {
  await evaluate('(async () => { const a = window.__PALACE__; if (a.settle) a.settle(); const st = window.__aa; st.capture = { done: false, result: null, error: null }; return true; })()');
  for (let i = 0; i < 200; i += 1) {
    const s = await evaluate('({ done: window.__aa.capture.done, error: window.__aa.capture.error })');
    if (s.error) throw new Error('量测报错：' + s.error);
    if (s.done) break;
    await sleep(200);
  }
  return evaluate('window.__aa.capture.result');
}

async function savePng(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(SHOTS, 'edge', `${name}.png`);
  writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  return file;
}

const report = { mode: MODE, viewport: { W, H, DPR }, chrome: CHROME, rows: [], raw: {} };

if (MODE === 'perf') {
  for (const tier of PERF_TIERS) {
    // **不得用 `shot=1`**：shot 路径把 dt 固定为 1/60 ⇒ `recordFrame` 记录的恒定 16.67ms 无意义。
    // `AA_OVERRIDE`：固定档位、只用 `?aa=` 改 AA ⇒ **只变 AA 一个变量**的隔离成本曲线
    const aaQ = process.env.AA_OVERRIDE ? `&aa=${process.env.AA_OVERRIDE}` : '';
    const url = await openPage(`quality=${tier}&ui=0&stats=1&dpr=${DPR}${aaQ}`);
    await installSampler();
    await evaluate('(() => { window.__aa.frames = 0; window.__aa.target = 0; return true; })()');
    await evaluate(`(async () => { const st = window.__aa; st.frames = 0; st.target = ${PERF_FRAMES}; st.done = false; return true; })()`);
    for (let i = 0; i < 600; i += 1) { if (await evaluate('window.__aa.done')) break; await sleep(500); }
    /**
     * **权威性能口径：忙碌渲染时间**（不经过 rAF）。
     * 为何必要：headless 的 rAF 被节流到 ~15Hz（实测墙钟 avg 66ms ≈ 1/15s 上限），
     * 真实渲染成本被节流掩盖 ⇒ 必须**同步**驱动生产渲染路径并计时。
     * 每次 `renderSystem.render()` 后追加 1×1 `readPixels` 强制 GPU 同步（否则只测到提交时间）。
     * 范围 = **渲染 pass 本身**（AA 的全部成本都在这里）；`getStats()` 的生产统计作为旁证。
     */
    const busy = await evaluate(`(() => {
      const a = window.__PALACE__;
      const rs = a.renderSystem;
      const gl = rs.renderer.getContext();
      const px = new Uint8Array(4);
      const N = ${Number(process.env.BUSY_FRAMES ?? 40)};
      const times = [];
      let t = 0;
      for (let i = 0; i < 3; i += 1) { rs.render(a.scene, a.rig.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      for (let i = 0; i < N; i += 1) {
        const t0 = performance.now();
        rs.render(a.scene, a.rig.camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        times.push(performance.now() - t0);
      }
      times.sort((x, y) => x - y);
      const avg = times.reduce((x, y) => x + y, 0) / times.length;
      return { n: times.length, avgMs: +avg.toFixed(2), p50Ms: +times[Math.floor(times.length * 0.5)].toFixed(2), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), minMs: +times[0].toFixed(2), maxMs: +times[times.length - 1].toFixed(2), fps: +(1000 / avg).toFixed(1) };
    })()`);
    const stats = await evaluate(`(() => {
      const a = window.__PALACE__;
      const d = a.renderSystem.getStats();
      const panel = document.getElementById('palace-stats');
      const pre = document.getElementById('palace-stats-json');
      const wall = window.__aa.wall.slice().sort((x, y) => x - y);
      const pct = (q) => (wall.length ? wall[Math.min(wall.length - 1, Math.floor(wall.length * q))] : 0);
      return {
        stats: d,
        panelText: panel ? panel.textContent : null,
        reportText: pre ? pre.textContent : null,
        frames: window.__aa.frames,
        wall: { n: wall.length, avgMs: +(wall.reduce((x, y) => x + y, 0) / Math.max(1, wall.length)).toFixed(2), p50Ms: +pct(0.5).toFixed(2), p95Ms: +pct(0.95).toFixed(2), maxMs: +(wall[wall.length - 1] ?? 0).toFixed(2) },
        ticks: window.__aa.ticks.slice(-3),
      };
    })()`);
    const row = {
      tier,
      aaOverride: process.env.AA_OVERRIDE ?? null,
      url,
      frames: stats.frames,
      antialias: stats.stats.quality.antialias,
      avgFrameMs: stats.stats.avgFrameMs,
      avgFps: stats.stats.avgFps,
      p95FrameMs: stats.stats.p95FrameMs,
      drawCalls: stats.stats.mainScene.drawCalls,
      visibleTriangles: stats.stats.mainScene.visibleTriangles,
      dpr: stats.stats.quality.dpr,
      bloom: stats.stats.quality.bloom,
      busy,
      wall: stats.wall,
      ticks: stats.ticks,
      /** `?stats=1` 通道（隐藏 <pre id="palace-stats-json">）里的 AA 读数（t16 补齐） */
      statsReportAA: (() => {
        if (!stats.reportText) return null;
        try { const j = JSON.parse(stats.reportText); return j.antialias ?? null; } catch { return { parseError: true }; }
      })(),
      panelHasAA: stats.panelText ? /抗锯齿|antialias|MSAA/i.test(stats.panelText) : null,
      panelAASnippet: stats.panelText ? (stats.panelText.match(/[^\n]{0,90}(抗锯齿|antialias|MSAA)[^\n]{0,90}/i) ?? [null])[0] : null,
    };
    report.rows.push(row);
    console.log(`[perf] ${tier.padEnd(6)} AA=${row.antialias.mode}/${row.antialias.samples}（${row.antialias.reason}）｜**忙碌渲染** avg ${row.busy.avgMs}ms / p50 ${row.busy.p50Ms} / p95 ${row.busy.p95Ms}（${row.busy.fps}fps，N=${row.busy.n}）｜rAF 墙钟（节流诊断）avg ${row.wall.avgMs}ms｜调用 ${row.drawCalls}｜三角面 ${row.visibleTriangles}｜?stats=1 AA=${row.statsReportAA ? `${row.statsReportAA.mode}/${row.statsReportAA.samples}` : '缺失'}｜panelAA=${row.panelHasAA}`);
  }
  writeFileSync(join(OUT, 'perf.json'), JSON.stringify(report, null, 1));
  console.log(`⇒ ${join(OUT, 'perf.json')}`);
} else if (MODE === 'edge') {
  for (const view of VIEWS) {
    for (const aa of AA_LIST) {
      const url = await openPage(`view=${view}&preset=${PRESET}&quality=${QUALITY}&ui=0&shot=1&dpr=${DPR}&aa=${aa}`);
      await installSampler();
      const m = await captureOnce();
      const name = `${view}-${PRESET}-aa${aa}`;
      const png = await savePng(name);
      report.rows.push({ view, preset: PRESET, aaRequested: aa, url, png, ...m, thumb: undefined });
      report.raw[name] = { thumb: m.thumb };
      console.log(`[edge] ${name.padEnd(22)} AA=${m.aa.mode}/${m.aa.samples}｜全帧 hardStep ${(m.full.hardStepRatio * 100).toFixed(3)}% · lap ${m.full.laplacianMean.toFixed(3)}｜边缘区 hardStep ${(m.edgeZone.hardStepRatio * 100).toFixed(3)}% · lap ${m.edgeZone.laplacianMean.toFixed(3)} · 单像素Δ ${m.edgeZone.edgeGradientMean.toFixed(2)}｜平坦区对照 lap ${m.flatZone.laplacianMean.toFixed(3)}｜**纹理带对照** lap ${m.textureZone.laplacianMean.toFixed(3)}`);
    }
  }
  writeFileSync(join(OUT, 'edge.json'), JSON.stringify(report, null, 1));
  console.log(`⇒ ${join(OUT, 'edge.json')}`);
} else {
  throw new Error(`未知 MODE=${MODE}（合法 perf|edge）`);
}

try { ws.close(); } catch { /* ignore */ }
try { chrome.kill(); } catch { /* ignore */ }
server.close();
process.exit(0);
