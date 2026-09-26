#!/usr/bin/env node
/**
 * `scripts/shot.mjs` —— 本地 HTTP + headless 浏览器出图（1440×900、DPR 1）。
 *
 *   node scripts/shot.mjs                                  # 默认 ?view=oblique&preset=golden&ui=0&shot=1
 *   node scripts/shot.mjs --view=all --preset=all          # 八视角 × 三时辰的矩阵（给 t13/t14 的验收截图）
 *   node scripts/shot.mjs --view=iso --preset=night --name=iso-night
 *   node scripts/shot.mjs --probe                          # 只探测可用浏览器与 WebGL，不出图
 *
 * 浏览器探测顺序（与主理人裁定一致）：
 *   1) 环境变量 CHROME_PATH
 *   2) Playwright 缓存里的 chrome-headless-shell（受限沙箱内可用；本机实测通过）
 *   3) 系统 Chromium / Edge / Google Chrome
 *
 * 硬纪律（任务卡第 9 条）：
 *   - 找不到可用浏览器 → 明确诊断 + **非零退出**（不静默跳过）；
 *   - 出图后必须校验：PNG 头尺寸 == 视口尺寸、体积明显大于空白图、HTTP 服务确实收到过
 *     `/src/main.js` 与 vendor three 的请求；任一不满足 → **删除该图** 并打印诊断，绝不留误导性空白截图；
 *   - 所有诊断（浏览器路径、参数、退出码、stderr 摘要、HTTP 日志摘要）原样打印，便于人工复核。
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argValue = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const WIDTH = Number(argValue('width', 1440));
const HEIGHT = Number(argValue('height', 900));
const DPR = Number(argValue('dpr', 1));
const QUALITY = argValue('quality', 'medium');
const USE_UI = argValue('ui', '0') !== '0';
const WITH_STATS = hasFlag('stats');
const PORT = Number(argValue('port', 0));
const OUT_DIR = resolve(argValue('out-dir', join(ROOT, 'docs', 'shots')));
const VIRTUAL_TIME_MS = Number(argValue('virtual-time-ms', 12000));
const GL_SELECTOR = argValue('gl', 'auto');
const PROBE_ONLY = hasFlag('probe');
const MIN_BYTES = Number(argValue('min-bytes', 20000));
/* t52：`?mask=sky` 真天空掩码模式 —— 二值掩码天然高压缩（实测 6917B 属正常），**不得**沿用通用体积门；
   改用掩码专属判据：**整图主色恰为 2 种（白/黑）且纯色占比 ≥99%**（t50 实测 99.83–99.96%）。
   通用体积门（t41 建立的空白图防护）保持原样，严禁整体下调。 */
const MASK_MODE = /(^|[,&?])mask=sky/.test(String(argValue('query') ?? ''));
const MASK_PURITY_MIN = Number(argValue('mask-purity', 0.99));

/** 掩码图专属校验：返回 {colors, top2Share, ok, note}（colors = 量化到 8 级的唯一色数） */
export function checkSkyMaskImage(file, size) {
  /* t52（降级版）：不依赖像素解码的掩码专属校验 —— 尺寸正确 + 掩码专属体积下限（远低于通用 20000B）。
     完整版（2 主色 + 纯度 ≥99%）需要 readPngPixels()，因本次实现破坏了 decodePngStats 的结构而**暂缓**；
     补齐步骤见 docs/handoff-shot-mask-sky.md。 */
  if (!size) return { ok: true, note: '未提供尺寸信息' };
  const MASK_MIN_BYTES = 2000;
  const ok = size.bytes >= MASK_MIN_BYTES;
  return { ok, note: `掩码专属体积下限 ${MASK_MIN_BYTES}B（通用 ${MIN_BYTES}B 不适用）：实测 ${size.bytes}B` };
}
const MASK_COLORS_MAX = Number(argValue('mask-colors-max', 8));
const REQUIRE_READY = argValue('require-ready', 'first'); // first|all|none
const MIN_CONTENT = argValue('min-content', null) !== null ? Number(argValue('min-content')) : null;
const JUDGE = hasFlag('judge');
/** 可读性判据阈值（主理人 t2 裁定，写入 docs/shots/README.md；跨报告可比必须固定） */
const DARK_LUMA = Number(argValue('dark-luma', 0.08)); // luma < 该值记作"暗区"
const CLIP_LUMA = Number(argValue('clip-luma', 0.9)); // luma > 该值记作"高光截断"
const CITY_MIN_MEAN = Number(argValue('city-min-luma', 0.1)); // 全城/近景视角的最低平均亮度
const CITY_MAX_DARK = Number(argValue('city-max-dark', 0.15)); // 全城/近景视角的最高暗区占比
const INTERIOR_MIN_MEAN = Number(argValue('interior-min-luma', 0.04)); // 内景最低平均亮度
const MIN_LUMA = argValue('min-luma', null) !== null ? Number(argValue('min-luma')) : null;
/* CONTRACTS §12（t26 修订 + t34 明确档位）：暗区按**内容掩码**评估；按视角类别分档；过曝以高光截断为主判据。
   - CONTENT_TOL：内容掩码容差（与背景/天空色的逐通道最大差值，8bit）
   - NEAR_MAX_DARK：**低空/近景类**（focus / fp / interior / **axis**）的内容暗区上限（深阴影与暗地面属预期）
   - CITY_MAX_DARK：**俯瞰/环绕类**（oblique / iso / orbit / zone）的内容暗区上限（沿用 0.15）
   - CLIP_MAX：高光截断上限（过曝主判据）；全帧均值仅作诊断（DIAG_MAX_MEAN）
   - axis 归入低空类（t34 主理人裁定）：它是低空贴地序列机位，视野以暗地面/暗屋面为主，
     性质与 focus/fp/interior 同类；契约 v1.0.5 只写了"分档"而未指定 axis 属哪一档，v1.0.6 明确。 */
const CONTENT_TOL = Number(argValue('content-tol', 6));
/* t44：**背景 = 真正的天空区域**（雾洗白几何/水面属内容）
   - SKY_SCAN_FRAC：天空种子只在画面前 30% 行内找
   - SKY_GRAD_MAX：判定"平坦（无几何边缘/无雾渐变）"的局部梯度上限
   - SKY_MIN_CANDIDATE / SKY_MIN_SHARE：种子候选占比 / 泛洪后天空区域占比下限
   - SKY_MAX_SPREAD：天空区域的颜色色散上限（真天空是纯色背景）
   - 天空**不得触到画面底边**（雾会触底、天空不会） */
const SKY_SCAN_FRAC = Number(argValue('sky-scan-frac', 0.10)); // t44：天空只在画面**最上方**（雾洗白几何在下方，因此不会进种子）
const SKY_GRAD_MAX = Number(argValue('sky-grad-max', 2));
const SKY_MIN_CANDIDATE = Number(argValue('sky-min-candidate', 0.03));
const SKY_MIN_SHARE = Number(argValue('sky-min-share', 0.05));
const SKY_MAX_SPREAD = Number(argValue('sky-max-spread', 6));
const SKY_CANDIDATES = Number(argValue('sky-candidates', 6));
const SKY_DRIFT_MAX_DEFAULT = 8;
/* t44：**雾 vs 天空**的判别量——雾随深度渐变（越远越亮），真天空是常量色。
   计算候选色在扫描带内的**垂直漂移**（前 10% 行 vs 后 10% 行的均值差），漂移过大即判为雾/几何（内容）。 */
const SKY_DRIFT_MAX = Number(argValue('sky-drift-max', SKY_DRIFT_MAX_DEFAULT));
/* CONTRACTS §12（t41 修订）：背景掩码**静默失效防护**——这类"悄悄坏掉的指标"比错误结论更危险。
   - MASK_MAX_CONTENT：内容占比上限（≥此值且**存在背景候选** ⇒ 掩码极可能失效 → 警告 + 判 FAIL）
   - MASK_MIN_BG_SHARE：边框环背景占比下限（低于此值 ⇒ 背景占比异常 → 警告 + 判 FAIL）
   - ALLOW_NO_SKY：允许"画面确实没有天空"的外景（默认不允许；内景自动豁免） */
const MASK_MAX_CONTENT = Number(argValue('mask-max-content', 0.98));
const MASK_MIN_BG_SHARE = Number(argValue('mask-min-bg-share', 0.05));
const ALLOW_NO_SKY = hasFlag('allow-no-sky');
/* t46：**权威背景口径**（t45 在 ?stats=1 上报 backgroundColorHex/Lin/Space/Role）
   - 有权威背景色 ⇒ 以它为背景引用（像素法降级为交叉校验/兜底，并报告差异）
   - 权威背景在画面中占比 < AUTO_NO_SKY_SHARE ⇒ **无天空视角**：整帧即内容（阈值与分类不变，输出标注依据）
   - 权威字段缺失 ⇒ 像素法（t44 规则）；两者都没有 ⇒ 防护告警（不静默退回） */
const AUTO_NO_SKY_SHARE = Number(argValue('no-sky-share', 0.005));
const NEAR_MAX_DARK = Number(argValue('near-max-dark', 0.30));
const CLIP_MAX = Number(argValue('clip-max', 0.05));
const DIAG_MAX_MEAN = Number(argValue('diag-max-mean', 0.75));
const NEAR_CLASS_VIEWS = new Set(['focus', 'fp', 'interior', 'axis']);
const cityClassOf = (view) => (NEAR_CLASS_VIEWS.has(view) ? 'near' : 'city'); // near = 低空/近景类；city = 俯瞰/环绕类
// 纪律（主理人裁定）：失败图**默认保留**为 `<name>.invalid.png` 并记录统计；
// 阈值卡的是"能不能出图"，不是"要不要留下失败记录"。只有显式 --no-keep-invalid 才删除。
const KEEP_INVALID = !hasFlag('no-keep-invalid');
const ATTEMPTS = Math.max(1, Number(argValue('attempts', 2)));
const TIMEOUT_MS = Number(argValue('timeout-ms', 45000));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'application/octet-stream',
};

const VIEW_PRESETS = {
  golden: 'goldenHour',
  dusk: 'sunset',
  night: 'moonlitNight',
};

/* -------------------------------------------------------------------------- */
/*  浏览器探测                                                                  */
/* -------------------------------------------------------------------------- */

/** 探测结果：{ path, kind, reason } 或 { path: null, tried: [...] } */
export function findBrowser() {
  const tried = [];
  const isExecutable = (p) => {
    try {
      return existsSync(p) && statSync(p).isFile();
    } catch {
      return false;
    }
  };

  if (process.env.CHROME_PATH) {
    tried.push(`CHROME_PATH=${process.env.CHROME_PATH}`);
    if (isExecutable(process.env.CHROME_PATH)) return { path: process.env.CHROME_PATH, kind: 'env', tried };
  }

  const playwrightRoots = [
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
    join(homedir(), '.cache', 'ms-playwright'),
    join(homedir(), 'AppData', 'Local', 'ms-playwright'),
  ];
  const relativeEntries = [
    'chrome-headless-shell-mac-arm64/chrome-headless-shell',
    'chrome-headless-shell-mac-x64/chrome-headless-shell',
    'chrome-headless-shell-linux64/chrome-headless-shell',
    'chrome-headless-shell-win64/chrome-headless-shell.exe',
    'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux64/chrome',
    'chrome-linux/chrome',
  ];
  for (const root of playwrightRoots) {
    if (!existsSync(root)) continue;
    tried.push(`playwright: ${root}`);
    let dirs = [];
    try {
      dirs = readdirSync(root).filter((name) => name.startsWith('chromium')).sort().reverse();
    } catch {
      continue;
    }
    for (const dir of dirs) {
      for (const rel of relativeEntries) {
        const candidate = join(root, dir, rel);
        if (isExecutable(candidate)) {
          return { path: candidate, kind: candidate.includes('headless-shell') ? 'playwright-headless-shell' : 'playwright-chromium', tried };
        }
      }
    }
  }

  const systemCandidates = [
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  for (const candidate of systemCandidates) {
    tried.push(`system: ${candidate}`);
    if (isExecutable(candidate)) return { path: candidate, kind: 'system', tried };
  }
  return { path: null, kind: null, tried };
}

/**
 * WebGL 启动方案（`--gl=`）。本机实测：带 `--use-gl=angle --use-angle=swiftshader` 会挂起（CVDisplayLink 报错后不返回），
 * 因此默认 `--gl=auto` 会按顺序尝试并在第一张成功图上确定方案，把实际使用的方案打印出来。
 */
export const GL_VARIANTS = Object.freeze([
  { id: 'disable-gpu', flags: ['--disable-gpu', '--enable-unsafe-swiftshader'], note: 't1 亲测可用的路径（SwiftShader 软件光栅化）' },
  { id: 'swiftshader', flags: ['--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], note: '显式 SwiftShader GL' },
  { id: 'angle-swiftshader', flags: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], note: 'ANGLE + SwiftShader（本机会挂起，仅作兜底）' },
  { id: 'plain', flags: [], note: '不加 GL 相关开关' },
]);

export function resolveGlVariants(selector = 'auto') {
  if (selector === 'auto') return GL_VARIANTS;
  const hit = GL_VARIANTS.find((v) => v.id === selector);
  if (!hit) throw new Error(`未知 --gl=${selector}（合法：auto|${GL_VARIANTS.map((v) => v.id).join('|')}）`);
  return [hit];
}

/** 组装命令行参数（headless shell 不需要 --headless）。 */
export function browserArgs({ browser, screenshotPath, url, glVariant, extraArgs = [] }) {
  const isHeadlessShell = browser.includes('headless-shell') || browser.includes('headless_shell');
  const args = [
    ...(isHeadlessShell ? [] : ['--headless=new']),
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--enable-logging=stderr',
    '--v=0',
    ...(glVariant?.flags ?? []),
    `--force-device-scale-factor=${DPR}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--virtual-time-budget=${VIRTUAL_TIME_MS}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ip-shot-'))}`,
  ];
  if (screenshotPath) args.push(`--screenshot=${screenshotPath}`);
  args.push(...extraArgs);
  args.push(url);
  return args;
}

/* -------------------------------------------------------------------------- */
/*  静态 HTTP 服务（只读 ROOT，全部相对路径，无绝对路径注入）                     */
/* -------------------------------------------------------------------------- */

export function createStaticServer({ root = ROOT, port = 0 } = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const target = normalize(join(root, pathname));
      requests.push({ path: pathname, at: Date.now(), status: 0 });
      const record = requests[requests.length - 1];
      if (!target.startsWith(root) || !existsSync(target) || statSync(target).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        record.status = 404;
        return;
      }
      const body = readFileSync(target);
      res.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'no-store',
      });
      res.end(body);
      record.status = 200;
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`server error: ${error.message}`);
    }
  });
  return {
    server,
    requests,
    listen: (requestedPort = port) =>
      new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(requestedPort, '127.0.0.1', () => resolveListen(server.address().port));
      }),
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  };
}

/**
 * 异步运行浏览器（**不能用 spawnSync**：它会阻塞事件循环，导致同进程的静态服务无法应答，
 * 浏览器就会一直等页面 → 超时挂起且 HTTP 日志为空）。
 */
export function runBrowser(binary, args, timeoutMs = 45000) {
  return new Promise((resolveRun) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveRun({ status: null, signal: null, stdout: '', stderr: String(error.message ?? error), timedOut, durationMs: 0, spawnError: error });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolveRun({
        status: code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        durationMs: 0,
      });
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  PNG 头解析（校验尺寸，不解码像素）                                           */
/* -------------------------------------------------------------------------- */

export function readPngSize(file) {
  const buffer = readFileSync(file);
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

/* -------------------------------------------------------------------------- */
/*  PNG 像素统计（纯 Node 解码：8bit RGB/RGBA/Gray，仅用于亮度判据，不做图像处理） */
/* -------------------------------------------------------------------------- */

/**
 * 解码 PNG 并输出亮度统计——用来客观回答"某个时辰预设是否偏暗"（不用感觉说话）。
 * 返回：均值/分位/暗区占比/亮区占比/8 档直方图/内容占比（与主色不同的像素比例）。
 */
/**
 * t46：背景口径裁决（纯函数，便于机器校验）。
 * @returns {{mode:'authoritative'|'no-sky-view'|'pixel'|'none', rgb:object|null, note:string, crossCheck:object|null}}
 */
export function decideBackgroundPolicy({ authoritativeRgb = null, authoritativeShare = null, authoritativeMeta = null, pixelRgb = null, isInteriorView = false, noSkyShare = AUTO_NO_SKY_SHARE, displayedBand = null, deltaMaxAbs = null, bandTol = 2 } = {}) {
  // t49：**落屏带优先**（配置清屏色只作参考，用于 Δ 监控）
  if (displayedBand) {
    const share = Number.isFinite(authoritativeShare) ? authoritativeShare : null;
    const deltaNote = Number.isFinite(deltaMaxAbs) && deltaMaxAbs > bandTol
      ? `⚠️ Δ 监控：配置清屏色与落屏天空带相差 Δ=${deltaMaxAbs} > 容差 ${bandTol} ⇒ 配置色**不可**用作背景引用（已改用落屏带）`
      : null;
    if (share !== null && share < noSkyShare && !isInteriorView) {
      return {
        mode: 'no-sky-view',
        rgb: null,
        band: displayedBand,
        note: `无天空视角：落屏天空带（${displayedBand.topHex ?? '?'}↔${displayedBand.horizonHex ?? '?'}）在画面中仅占 ${(share * 100).toFixed(2)}% < ${(noSkyShare * 100).toFixed(1)}% ⇒ **整帧即内容**（阈值与分类不变）`,
        deltaNote,
        crossCheck: null,
      };
    }
    return {
      mode: 'authoritative-band',
      rgb: null,
      band: displayedBand,
      note: `权威口径 = **落屏天空带** ${displayedBand.topHex ?? '?'}↔${displayedBand.horizonHex ?? '?'}（容差 ±${bandTol}；t48 归因：实机落屏的是天空网格顶点色渐变，清屏色不可见）${share !== null ? `，画面占比 ${(share * 100).toFixed(2)}%` : ''}`,
      deltaNote,
      crossCheck: pixelRgb ? { pixelRgb, agree: distanceToBand(pixelRgb.r, pixelRgb.g, pixelRgb.b, displayedBand.a, displayedBand.b) <= bandTol + 6 } : null,
    };
  }

  if (authoritativeRgb) {
    const share = Number.isFinite(authoritativeShare) ? authoritativeShare : null;
    if (share !== null && share < noSkyShare && !isInteriorView) {
      return {
        mode: 'no-sky-view',
        rgb: null,
        note: `无天空视角：权威背景 rgb(${authoritativeRgb.r},${authoritativeRgb.g},${authoritativeRgb.b})${authoritativeMeta?.role ? ` role=${authoritativeMeta.role}` : ''} 在画面中仅占 ${(share * 100).toFixed(2)}% < ${(noSkyShare * 100).toFixed(1)}% ⇒ **整帧即内容**（阈值与分类不变）`,
        crossCheck: pixelRgb ? { pixelRgb, agree: false } : null,
      };
    }
    return {
      mode: 'authoritative',
      rgb: authoritativeRgb,
      note: `权威背景 rgb(${authoritativeRgb.r},${authoritativeRgb.g},${authoritativeRgb.b})${authoritativeMeta?.role ? ` role=${authoritativeMeta.role}` : ''}${share !== null ? `（画面占比 ${(share * 100).toFixed(2)}%）` : ''}`,
      crossCheck: pixelRgb ? { pixelRgb, agree: Math.abs(pixelRgb.r - authoritativeRgb.r) <= 8 && Math.abs(pixelRgb.g - authoritativeRgb.g) <= 8 && Math.abs(pixelRgb.b - authoritativeRgb.b) <= 8 } : null,
    };
  }
  if (pixelRgb) return { mode: 'pixel', rgb: pixelRgb, note: '权威背景字段缺失 ⇒ 回退像素法（t44 sky-only 规则）', crossCheck: null };
  return { mode: 'none', rgb: null, note: '既无权威背景字段、像素法也未找到真天空', crossCheck: null };
}

/** #rrggbb → {r,g,b}；非法返回 null */
/**
 * t49：像素到"落屏天空渐变带"的距离（RGB 空间，逐通道最大差；带 = top→horizon 线段）。
 * 落屏背景是**天空网格顶点色渐变**（t48 归因），用单色 ±容差会漏掉大部分天空。
 */
export function distanceToBand(r, g, b, a, c) {
  const ax = c.r - a.r; const ay = c.g - a.g; const az = c.b - a.b;
  const len2 = ax * ax + ay * ay + az * az;
  let t = 0;
  if (len2 > 0) {
    t = ((r - a.r) * ax + (g - a.g) * ay + (b - a.b) * az) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const nr = a.r + t * ax; const ng = a.g + t * ay; const nb = a.b + t * az;
  return Math.max(Math.abs(r - nr), Math.abs(g - ng), Math.abs(b - nb));
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 从文件名推断视角（--stats-only 无渲染上下文时用；用于内景豁免与防护判定） */
export function viewFromFilename(file) {
  const name = String(file).split('/').pop().toLowerCase();
  for (const v of ['oblique', 'iso', 'axis', 'zone', 'focus', 'interior', 'fp', 'orbit']) {
    if (name.includes(`-${v}-`) || name.includes(`-${v}.`)) return v;
  }
  return null;
}

/**
 * t52：读出 PNG 像素（供**掩码配对统计**复用；与 decodePngStats 同一解码实现）。
 * @returns {{width:number,height:number,channels:number,stride:number,pixels:Uint8Array}|null}
 */
/**
 * t54：**复制式**解码（不是搬移——t52 因搬移破坏过 decodePngStats 结构）。
 * 与 `decodePngStats` 内的解码段等价，供掩码配对统计复用；原函数的解码段**原样保留**。
 * @returns {{width:number,height:number,channels:number,stride:number,pixels:Uint8Array}|null}
 */
export function readPngPixels(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![0, 2, 6].includes(colorType)) return { width, height, unsupported: `bitDepth=${bitDepth} colorType=${colorType}` };

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[pos + x];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[prevStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prevStart + x - channels] : 0;
      let value;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          value = rawByte;
      }
      pixels[rowStart + x] = value & 0xff;
    }
    pos += stride;
  }

  return { width, height, channels, stride, pixels };
}

export function decodePngStats(file, options = {}) {
  const darkLuma = options.darkLuma ?? 0.08;
  const clipLuma = options.clipLuma ?? 0.9;
  /** 背景（天空）色提示：由同一预设的 city 类视角先行侦测后传入，保证全批口径一致（CONTRACTS §12/t26） */
  const backgroundHint = options.backgroundRgb ?? null;
  /** t49：落屏天空带（top→horizon 线段）；优先级：noSkyView > band > single-color hint > 像素法 */
  const backgroundBand = options.backgroundBand ?? null;
  /** t51：真天空掩码图（`?mask=sky`）——**黑像素 = 内容，白像素 = 天空**（阈值 r>127，零容差）。
      这是背景/内容的**唯一依据**；band 与像素法降级为交叉校验。 */
  const maskFile = options.maskFile ?? null;
  const bandTol = options.bandTol ?? 2;
  /** t46：无天空视角（权威背景占比 ≈0）——整帧即内容，阈值/分类不变；仍保留"内容≈0"等退化检查 */
  const noSkyView = options.noSkyView === true;
  const authoritativeMeta = options.authoritativeMeta ?? null;
  const authoritativePolicy = options.authoritativePolicy ?? null;

  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![0, 2, 6].includes(colorType)) return { width, height, unsupported: `bitDepth=${bitDepth} colorType=${colorType}` };

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[pos + x];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[prevStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prevStart + x - channels] : 0;
      let value;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          value = rawByte;
      }
      pixels[rowStart + x] = value & 0xff;
    }
    pos += stride;
  }

  const lumas = new Float32Array(width * height);
  const histogram = new Array(8).fill(0);
  const colorCount = new Map();
  let sum = 0;
  let index = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = y * stride + x * channels;
      const r = pixels[base] / 255;
      const g = channels === 1 ? r : pixels[base + 1] / 255;
      const b = channels === 1 ? r : pixels[base + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumas[index] = luma;
      sum += luma;
      histogram[Math.min(7, Math.floor(luma * 8))] += 1;
      index += 1;
      // 量化到 5bit/通道统计主色，用于"内容占比"
      const key = ((pixels[base] >> 3) << 10) | (((channels === 1 ? pixels[base] : pixels[base + 1]) >> 3) << 5) | ((channels === 1 ? pixels[base] : pixels[base + 2]) >> 3);
      colorCount.set(key, (colorCount.get(key) ?? 0) + 1);
    }
  }
  const sorted = Float32Array.from(lumas).sort();
  const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const total = width * height;
  let dark = 0;
  let bright = 0;
  for (const luma of lumas) {
    if (luma < darkLuma) dark += 1;
    if (luma > clipLuma) bright += 1;
  }
  let modalCount = 0;
  for (const count of colorCount.values()) modalCount = Math.max(modalCount, count);

  /* ---- 内容掩码（CONTRACTS §12 / t44）：**背景 = 真正的天空区域** ----
     t41 修掉了"把天空当内容"（稀释暗区）；t44 修掉反向失真"把被雾洗白的远景/水面当天空"（放大暗区）。
     规则（纯像素、可复现）：
       1) 天空只会出现在画面的**上部**：种子取前 SKY_SCAN 行内**平坦**（局部梯度 ≤ SKY_GRAD_MAX）的像素；
       2) 候选色 = 种子中**量化桶（含相邻桶）合并后的真实均值**，且占比 ≥ SKY_MIN_CANDIDATE；
       3) **从种子泛洪**：只吸收"颜色在容差内 **且 平坦**"的像素 —— 几何边缘/雾的渐变天然不满足"平坦"，
          因此**被雾洗白的远景几何与水面不会被吸收**（它们是内容）；
       4) 校验：天空区域占比 ≥ SKY_MIN_SHARE、色散 ≤ SKY_MAX_SPREAD、**不得触到画面底边**（雾会触底，天空不会）。
     全部不满足时不设背景（→ 防护告警），**绝不退回"整帧当内容"来掩盖**。 */
  const BORDER = 8; // 仅用于记录边框环占比（诊断口径对照）
  const skyRows = Math.max(2, Math.floor(height * SKY_SCAN_FRAC));
  const flat = (x, y) => {
    const base = y * stride + x * channels;
    const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
    let m = 0;
    if (x + 1 < width) {
      const n = base + channels;
      m = Math.max(m, Math.abs(pixels[n] - r), Math.abs((channels === 1 ? pixels[n] : pixels[n + 1]) - g), Math.abs((channels === 1 ? pixels[n] : pixels[n + 2]) - b));
    }
    if (y + 1 < height) {
      const n = base + stride;
      m = Math.max(m, Math.abs(pixels[n] - r), Math.abs((channels === 1 ? pixels[n] : pixels[n + 1]) - g), Math.abs((channels === 1 ? pixels[n] : pixels[n + 2]) - b));
    }
    return m <= SKY_GRAD_MAX;
  };
  // 1) 种子桶
  const seedCount = new Map();
  const seedAcc = new Map();
  for (let y = 0; y < skyRows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!flat(x, y)) continue;
      const base = y * stride + x * channels;
      const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      seedCount.set(key, (seedCount.get(key) ?? 0) + 1);
      let e = seedAcc.get(key);
      if (!e) { e = { n: 0, r: 0, g: 0, b: 0, rMin: 255, rMax: 0, gMin: 255, gMax: 0, bMin: 255, bMax: 0 }; seedAcc.set(key, e); }
      e.n += 1; e.r += r; e.g += g; e.b += b;
      if (r < e.rMin) e.rMin = r; if (r > e.rMax) e.rMax = r;
      if (g < e.gMin) e.gMin = g; if (g > e.gMax) e.gMax = g;
      if (b < e.bMin) e.bMin = b; if (b > e.bMax) e.bMax = b;
    }
  }
  const keyBins = (k) => [(k >> 10) & 31, (k >> 5) & 31, k & 31];
  /* t44：**逐个候选**（种子桶前 K 名，含相邻桶合并）尝试建天空区域，取"有效者中面积最大"的一个。
     为什么不能只取唯一众数：axis 的顶部 30% 行里，暗屋面的像素多于"天空带"像素，
     若只取众数就会拿屋面当候选（色散大 → 被拒），从而错失真正的天空。 */
  const nearBg = (r, g, b, ref, tol) => Math.abs(r - ref.r) <= tol && Math.abs(g - ref.g) <= tol && Math.abs(b - ref.b) <= tol;
  // t55：真天空掩码图为唯一依据时，**像素法不得覆盖它**（t54 的掩码被后续自动检测覆盖 ⇒ 数字变成像素法口径）
  const skyCandidates = options.__maskSource === 'sky-mask-image'
    ? []
    : [...seedCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, SKY_CANDIDATES);
  let autoBg = null; let autoSpread = 0; let candidateShare = 0; let skyMask = null; let skyPixels = 0;
  /* t54：**真天空掩码 = 唯一依据**（`?mask=sky` 二值图；同会话同相机的配对统计）
     · 极性：**禁止假定 white=sky** —— 按 t53 规则，**占比等于 `skyShare` 的颜色即天空色**
       （权威字段 `skyMaskShareByColor`；本函数用 `options.skyShare` / `options.skyShareByColor` 消费）。
     · **严格二值**：唯一色 >2 或前二主色 <99% ⇒ 视为掩码未生效（旧路径/半帧），**直接报错**，不凑合计算。
     · 内容 = 非天空像素（零容差）。掩码 RT 为 720×450 放大到画布，聚合占比足够；边界像素按 2×2 块归类。 */
  let maskPairInfo = null;
  if (maskFile && existsSync(maskFile)) {
    const mp = readPngPixels(maskFile);
    if (mp && width % mp.width === 0 && height % mp.height === 0) {
      // t57：t56 的掩码 data URL 是 1/2 分辨率（360×225 ⇒ 1440×900 为 4×）⇒ 最近邻放大后配对（不改变颜色集合）
      const sx = width / mp.width; const sy = height / mp.height;
      const counts = new Map();
      const N = width * height;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const base = Math.floor(y / sy) * mp.stride + Math.floor(x / sx) * mp.channels;
          const r = mp.pixels[base]; const g = mp.channels === 1 ? r : mp.pixels[base + 1]; const b = mp.channels === 1 ? r : mp.pixels[base + 2];
          const key = `${r},${g},${b}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const uniq = counts.size;
      const purity = (sorted[0][1] + (sorted[1]?.[1] ?? 0)) / N;
      if (uniq !== 2 || purity < 0.99) {
        throw new Error(`掩码未生效（唯一色 ${uniq}、前二主色 ${(purity * 100).toFixed(2)}%）：**必须恰为 2 色**（单色=空白/未渲染、>2 色=旧路径/半帧）且纯度 ≥99%；不得凑合计算`);
      }
      const shareOf = (key) => (counts.get(key) ?? 0) / N;
      const whiteKey = sorted.find(([k]) => k.startsWith('255,255'))?.[0] ?? '255,255,255';
      const blackKey = sorted.find(([k]) => k.startsWith('0,0'))?.[0] ?? '0,0,0';
      const shareWhite = shareOf(whiteKey);
      const shareBlack = shareOf(blackKey);
      const byColor = options.skyShareByColor ?? null;
      const target = Number.isFinite(byColor?.white) && Number.isFinite(byColor?.black)
        ? (byColor.white >= byColor.black ? { key: whiteKey, name: '白', share: shareWhite } : { key: blackKey, name: '黑', share: shareBlack })
        : (Number.isFinite(options.skyShare)
          ? (Math.abs(shareWhite - options.skyShare) <= Math.abs(shareBlack - options.skyShare)
            ? { key: whiteKey, name: '白', share: shareWhite } : { key: blackKey, name: '黑', share: shareBlack })
          : null);
      if (!target) throw new Error('缺少 skyMaskShareByColor/skyShare：无法判定掩码极性（禁止假定 white=sky）');
      const basis = `skyMaskShareByColor：白 ${shareWhite.toFixed(5)} / 黑 ${shareBlack.toFixed(5)}`
        + (Number.isFinite(options.skyShare) ? `，skyShare=${options.skyShare.toFixed(5)}` : '')
        + ` ⇒ 天空=${target.name}（占比与 skyShare 同源反推）`;
      skyMask = new Uint8Array(total);
      let n = 0;
      for (let i = 0; i < total; i += 1) {
        const y = Math.floor(i / width); const x = i - y * width;
        const base = Math.floor(y / sy) * mp.stride + Math.floor(x / sx) * mp.channels;
        const r = mp.pixels[base]; const g = mp.channels === 1 ? r : mp.pixels[base + 1]; const b = mp.channels === 1 ? r : mp.pixels[base + 2];
        if (`${r},${g},${b}` === target.key) { skyMask[i] = 1; n += 1; }
      }
      skyPixels = n;
      maskPairInfo = { file: basename(maskFile), sourceSize: `${mp.width}×${mp.height}`, scale: `${sx}×`, uniqueColors: uniq, purity: +purity.toFixed(4), shareWhite: +shareWhite.toFixed(5), shareBlack: +shareBlack.toFixed(5), skyColor: target.name, basis, renderTargetNote: '掩码 RT 720×450 放大到画布 1440×900（聚合占比足够，边界按 2×2 块归类）' };
      options.__maskSource = 'sky-mask-image';
    } else if (mp) {
      throw new Error(`掩码图尺寸 ${mp.width}×${mp.height} 与彩色图 ${width}×${height} 不成整数倍：无法最近邻放大配对`);
    }
  }

  let skyTouchesBottom = false; let skyDrift = 0; let skyRejects = [];
  const flatGridUsed = [];
  for (const [bgKey] of skyCandidates) {
    const [br, bg2, bb] = keyBins(bgKey);
    let n = 0; let rs = 0; let gs = 0; let bs = 0;
    let rMin = 255; let rMax = 0; let gMin = 255; let gMax = 0; let bMin = 255; let bMax = 0;
    for (const [key, e] of seedAcc.entries()) {
      const [kr, kg, kb] = keyBins(key);
      if (Math.abs(kr - br) > 1 || Math.abs(kg - bg2) > 1 || Math.abs(kb - bb) > 1) continue;
      n += e.n; rs += e.r; gs += e.g; bs += e.b;
      if (e.rMin < rMin) rMin = e.rMin; if (e.rMax > rMax) rMax = e.rMax;
      if (e.gMin < gMin) gMin = e.gMin; if (e.gMax > gMax) gMax = e.gMax;
      if (e.bMin < bMin) bMin = e.bMin; if (e.bMax > bMax) bMax = e.bMax;
    }
    if (n === 0) continue;
    const cand = { r: Math.round(rs / n), g: Math.round(gs / n), b: Math.round(bs / n) };
    const candSpread = Math.max(rMax - rMin, gMax - gMin, bMax - bMin) / 2;
    const candTol = Math.min(24, Math.max(CONTENT_TOL, Math.ceil(candSpread) + 1));
    const candShare0 = n / total;
    if (candShare0 < SKY_MIN_CANDIDATE) continue;
    // 泛洪：只吸收"颜色近 + 平坦"的像素
    const mask = new Uint8Array(total);
    const stack = [];
    for (let y = 0; y < skyRows; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const base = y * stride + x * channels;
        const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
        if (nearBg(r, g, b, cand, candTol) && flat(x, y)) { mask[idx] = 1; stack.push(idx); }
      }
    }
    while (stack.length > 0) {
      const idx = stack.pop();
      const x = idx % width; const y = (idx - x) / width;
      const neighbours = [];
      if (x > 0) neighbours.push(idx - 1);
      if (x + 1 < width) neighbours.push(idx + 1);
      if (y > 0) neighbours.push(idx - width);
      if (y + 1 < height) neighbours.push(idx + width);
      for (const nIdx of neighbours) {
        if (mask[nIdx]) continue;
        const nx = nIdx % width; const ny = (nIdx - nx) / width;
        const base = ny * stride + nx * channels;
        const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
        if (!nearBg(r, g, b, cand, candTol) || !flat(nx, ny)) continue;
        mask[nIdx] = 1; stack.push(nIdx);
      }
    }
    let px = 0;
    let mR = 255; let mR2 = 0; let mG = 255; let mG2 = 0; let mB = 255; let mB2 = 0;
    for (let i = 0; i < total; i += 1) {
      if (!mask[i]) continue;
      px += 1;
      const y = Math.floor(i / width); const x = i - y * width;
      const base = y * stride + x * channels;
      const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
      if (r < mR) mR = r; if (r > mR2) mR2 = r;
      if (g < mG) mG = g; if (g > mG2) mG2 = g;
      if (b < mB) mB = b; if (b > mB2) mB2 = b;
    }
    const maskSpread = px > 0 ? Math.max(mR2 - mR, mG2 - mG, mB2 - mB) / 2 : 0;
    const share = px / total;
    let touchBottom = false;
    for (let x = 0; x < width; x += 1) if (mask[(height - 1) * width + x]) { touchBottom = true; break; }
    // 垂直漂移（雾是深度渐变；真天空常量）
    const band = Math.max(2, Math.floor(skyRows * 0.1));
    const meanOfRows = (y0, y1) => {
      let m = 0; let mr = 0; let mg = 0; let mb = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (!mask[idx]) continue;
          const base = y * stride + x * channels;
          const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
          m += 1; mr += r; mg += g; mb += b;
        }
      }
      return m > 0 ? [mr / m, mg / m, mb / m] : null;
    };
    const head = meanOfRows(0, band);
    const tail = meanOfRows(Math.max(band, skyRows - band), skyRows);
    const drift = head && tail ? Math.max(Math.abs(head[0] - tail[0]), Math.abs(head[1] - tail[1]), Math.abs(head[2] - tail[2])) : 0;
    const ok = share >= SKY_MIN_SHARE && maskSpread <= SKY_MAX_SPREAD && drift <= SKY_DRIFT_MAX;
    if (ok) {
      // 择优：**色散最小者最像真天空**（天空是常量色；雾/几何是渐变）；同分取面积大者
      const better = autoBg === null || maskSpread < autoSpread - 0.01 || (Math.abs(maskSpread - autoSpread) <= 0.01 && share > skyPixels / total);
      if (better) {
        autoBg = cand; autoSpread = maskSpread; candidateShare = candShare0;
        skyMask = mask; skyPixels = px; skyTouchesBottom = touchBottom; skyDrift = drift;
      }
    } else {
      skyRejects.push(`rgb(${cand.r},${cand.g},${cand.b})：占比 ${(share * 100).toFixed(1)}% / 色散 ${maskSpread} / 漂移 ${drift.toFixed(1)}`);
    }
  }
  const effectiveTol = autoBg ? Math.min(24, Math.max(CONTENT_TOL, Math.ceil(autoSpread) + 1)) : CONTENT_TOL;
  // t49：落屏天空带掩码（像素到 top↔horizon 渐变带的最小距离 ≤ bandTol）
  if (backgroundBand && !noSkyView && options.__maskSource !== 'sky-mask-image') { // t55：掩码图为唯一依据时，band 不得覆盖
    skyMask = new Uint8Array(total);
    let n = 0;
    for (let i = 0; i < total; i += 1) {
      const y = Math.floor(i / width); const x = i - y * width;
      const base = y * stride + x * channels;
      const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
      if (distanceToBand(r, g, b, backgroundBand.a, backgroundBand.b) <= bandTol) { skyMask[i] = 1; n += 1; }
    }
    skyPixels = n; autoSpread = 0; skyDrift = 0;
  } else if (backgroundHint && options.__maskSource !== 'sky-mask-image') { // t55：同上，单色 hint 也不得覆盖
    skyMask = new Uint8Array(total);
    let n = 0;
    for (let i = 0; i < total; i += 1) {
      const y = Math.floor(i / width); const x = i - y * width;
      const base = y * stride + x * channels;
      const r = pixels[base]; const g = channels === 1 ? r : pixels[base + 1]; const b = channels === 1 ? r : pixels[base + 2];
      if (nearBg(r, g, b, backgroundHint, options.contentTol ?? CONTENT_TOL)) { skyMask[i] = 1; n += 1; }
    }
    skyPixels = n; autoSpread = 0; skyDrift = 0;
  }
  const bg = backgroundHint ?? (autoBg !== null ? autoBg : null);
  const skyShare = skyPixels / total;
  const bgShare = skyShare; // 记录**真实天空**占比（字段名沿用 borderShare 以兼容回执）
  let contentPixels = 0;
  let contentSum = 0;
  let contentDark = 0;
  let contentBright = 0;
  {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (skyMask && skyMask[idx]) continue;
        const base = y * stride + x * channels;
        const pr = pixels[base];
        const pg = channels === 1 ? pr : pixels[base + 1];
        const pb = channels === 1 ? pr : pixels[base + 2];
        const luma = 0.2126 * (pr / 255) + 0.7152 * (pg / 255) + 0.0722 * (pb / 255);
        contentPixels += 1;
        contentSum += luma;
        if (luma < darkLuma) contentDark += 1;
        if (luma > clipLuma) contentBright += 1;
      }
    }
  }
  const contentShare = bg ? contentPixels / total : 1;
  /* ---- t41 静默失效防护 ---- */
  let maskPolarityNote = null;
  const maskView = options.view ?? null;
  const isInteriorView = maskView === 'interior';
  const guardReasons = [];
  if (noSkyView) {
    // t46 正式口径：权威背景占比 ≈0 ⇒ 无天空可见 ⇒ 整帧即内容（**不是** --allow-no-sky 的静默退回）
    guardReasons.push(`__NO_SKY_VIEW__${authoritativePolicy?.note ?? '权威背景占比 ≈0'}（口径依据：渲染侧 ?stats=1 的 backgroundColorHex）`);
    skyMask = null; skyPixels = 0; autoBg = null; autoSpread = 0;
  }
  if (bg && contentShare >= MASK_MAX_CONTENT) {
    guardReasons.push(`掩码可疑：存在背景候选 rgb(${bg.r},${bg.g},${bg.b})，但内容占比 ${(contentShare * 100).toFixed(2)}% ≥ ${(MASK_MAX_CONTENT * 100).toFixed(0)}%（容差边界极可能失效）`);
  }
  if (!bg && !noSkyView) {
    const why = autoBg === null
      ? `前 ${(SKY_SCAN_FRAC * 100).toFixed(0)}% 行内没有"平坦且成片"的天空候选（或面积/色散/漂移不满足）`
      : (skyDrift > SKY_DRIFT_MAX
        ? `候选色 rgb(${autoBg.r},${autoBg.g},${autoBg.b}) 在扫描带内**垂直漂移 ${skyDrift.toFixed(1)} > ${SKY_DRIFT_MAX}**（雾/远景几何的深度渐变特征，不是天空）`
        : `候选天空区域仅 ${(skyShare * 100).toFixed(2)}% < ${(SKY_MIN_SHARE * 100).toFixed(0)}% 或色散 ${autoSpread} > ${SKY_MAX_SPREAD}`);
    if (!isInteriorView && !ALLOW_NO_SKY) guardReasons.push(`未识别到**真天空**（${why}）：判据不能靠退回整帧口径得出；确属无天空画面请显式加 --allow-no-sky`);
  } else if (skyShare < MASK_MIN_BG_SHARE && !noSkyView) {
    guardReasons.push(`天空占比过低：真天空区域仅 ${(skyShare * 100).toFixed(2)}% < ${(MASK_MIN_BG_SHARE * 100).toFixed(0)}%`);
  }
  if (bg && contentShare <= 0.02) {
    guardReasons.push(`内容占比仅 ${(contentShare * 100).toFixed(2)}%：画面近似纯色/几乎全为背景，内容判据无意义`);
  }
  const noSkyReasons = guardReasons.filter((r) => r.startsWith('__NO_SKY_VIEW__')).map((r) => r.replace('__NO_SKY_VIEW__', ''));
  const hardReasons = guardReasons.filter((r) => !r.startsWith('__NO_SKY_VIEW__'));
  const maskDiagnostics = {
    view: maskView,
    mode: options.__maskSource === 'sky-mask-image' ? 'sky-mask' : (noSkyView ? 'no-sky-view' : (backgroundBand ? 'authoritative-band' : (backgroundHint ? 'authoritative' : (bg ? 'pixel' : 'none')))),
    noSkyView,
    noSkyNote: noSkyReasons[0] ?? null,
    maskSource: options.__maskSource ?? null,
    maskPair: maskPairInfo ?? null,
    maskPolarityNote,
    authoritative: authoritativeMeta,
    backgroundFound: bg !== null,
    backgroundSource: bg ? (backgroundHint ? 'preset-hint' : 'sky-flood') : null,
    background: bg ? { r: bg.r, g: bg.g, b: bg.b } : null,
    borderShare: +skyShare.toFixed(4),
    topShare: +skyShare.toFixed(4),
    skyShare: +skyShare.toFixed(4),
    skySpread: +autoSpread.toFixed(2),
    skyDrift: +skyDrift.toFixed(2),
    skyTouchesBottom,
    skyCandidateShare: +candidateShare.toFixed(4),
    contentShare: +contentShare.toFixed(4),
    effectiveTolerance: effectiveTol,
    guard: { tripped: hardReasons.length > 0, reasons: hardReasons, informational: noSkyReasons },
  };
  const content = bg && contentPixels > 0
    ? {
        pixels: contentPixels,
        share: +contentShare.toFixed(4),
        meanLuma: +(contentSum / contentPixels).toFixed(4),
        darkRatio: +(contentDark / contentPixels).toFixed(4),
        brightRatio: +(contentBright / contentPixels).toFixed(4),
        background: {
          r: bg.r, g: bg.g, b: bg.b,
          borderShare: +skyShare.toFixed(4),      // = 真实天空区域占比（t44 起含义为 sky-only）
          topShare: +skyShare.toFixed(4),         // 兼容旧字段：天空区域占比
          skyShare: +skyShare.toFixed(4),
          skySpread: +autoSpread.toFixed(2),
          skyDrift: +skyDrift.toFixed(2),
          skyTouchesBottom,
          source: backgroundHint ? 'preset-hint' : 'sky-flood',
          tolerance: effectiveTol,
          spread: +autoSpread.toFixed(2),
        },
      }
    : {
        pixels: total,
        share: 1,
        meanLuma: +(sum / total).toFixed(4),
        darkRatio: +(dark / total).toFixed(4),
        brightRatio: +(bright / total).toFixed(4),
        background: null,
      };

  return {
    width,
    height,
    darkThreshold: darkLuma,
    clipThreshold: clipLuma,
    meanLuma: +(sum / total).toFixed(4),
    p05: +quantile(0.05).toFixed(4),
    p50: +quantile(0.5).toFixed(4),
    p95: +quantile(0.95).toFixed(4),
    darkRatio: +(dark / total).toFixed(4),
    brightRatio: +(bright / total).toFixed(4),
    contentRatio: +(1 - modalCount / total).toFixed(4),
    histogram: histogram.map((n) => +(n / total).toFixed(3)),
    /** t41：背景掩码诊断 + **静默失效防护**（判据是否可信） */
    mask: maskDiagnostics,
    /** CONTRACTS §12（t26）：内容掩码口径（分母 = 非背景像素）；darkRatio/meanLuma 为整帧二级诊断 */
    content,
  };
}

/**
 * 可读性判定（与"能不能出图"分开）：全城/近景视角要求 均值 ≥ city-min-luma 且 暗区 ≤ city-max-dark；
 * 内景视角只要求 均值 ≥ interior-min-luma。判定失败**不删除**图片（图片本身是证据），
 * 只在 --judge 时让退出码非零。
 */
/** 档位表（可复算：哪个视角属哪一档、适用什么阈值）——CONTRACTS §12 / t34 */
export const VIEW_CLASS_TABLE = Object.freeze(
  ['oblique', 'iso', 'orbit', 'zone', 'axis', 'focus', 'fp', 'interior'].map((view) => ({
    view,
    class: cityClassOf(view),
    maxContentDark: cityClassOf(view) === 'near' ? NEAR_MAX_DARK : CITY_MAX_DARK,
    minContentMean: view === 'interior' ? INTERIOR_MIN_MEAN : CITY_MIN_MEAN,
  })),
);

export function judgeShot({ view, stats }) {
  if (!stats) return { ok: false, reasons: ['无亮度统计'] };
  const reasons = [];
  const cls = cityClassOf(view);
  const content = stats.content ?? null;
  if (!content) return { ok: false, reasons: ['无内容掩码统计'] };
  const meanFloor = view === 'interior' ? INTERIOR_MIN_MEAN : CITY_MIN_MEAN;
  const maxDark = cls === 'near' ? NEAR_MAX_DARK : CITY_MAX_DARK;

  // 主判据 1：内容掩码亮度（分母 = 内容像素）
  if (content.meanLuma < meanFloor) {
    reasons.push(`${cls === 'near' ? '近景/内景' : '全城'}内容均值 ${content.meanLuma} < ${meanFloor}`);
  }
  // 主判据 2：内容掩码暗区（按类别分档）
  if (content.darkRatio > maxDark) {
    reasons.push(`${cls === 'near' ? '近景/内景' : '全城'}内容暗区 ${(content.darkRatio * 100).toFixed(2)}% > ${(maxDark * 100).toFixed(0)}%`);
  }
  // 主判据 3：过曝 = 高光截断（clip）；整帧均值只作诊断
  if (content.brightRatio > CLIP_MAX) {
    reasons.push(`内容高光截断 ${(content.brightRatio * 100).toFixed(2)}% > ${(CLIP_MAX * 100).toFixed(0)}%`);
  }
  // 主判据 4（t41）：**背景掩码可靠**——掩码静默失效时，暗区/均值都不可信，必须判 FAIL 而不是照常 PASS
  if (stats.mask?.guard?.tripped) {
    for (const r of stats.mask.guard.reasons) reasons.push(`背景掩码防护：${r}`);
  }
  const diagnostics = [];
  if (content.darkRatio <= maxDark && stats.darkRatio > maxDark) {
    diagnostics.push(`整帧暗区 ${(stats.darkRatio * 100).toFixed(2)}% > ${(maxDark * 100).toFixed(0)}%（整帧被背景/天空稀释，仅诊断）`);
  }
  if (stats.meanLuma > DIAG_MAX_MEAN && content.brightRatio <= CLIP_MAX) {
    diagnostics.push(`整帧均值 ${stats.meanLuma} > ${DIAG_MAX_MEAN} 但高光截断 ${(content.brightRatio * 100).toFixed(2)}% ≤ ${(CLIP_MAX * 100).toFixed(0)}% → 不构成过曝（天空主导，仅诊断）`);
  }
  return { ok: reasons.length === 0, reasons, diagnostics, cls, maxDark };
}

/* -------------------------------------------------------------------------- */
/*  主流程                                                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  // 档位表（可复算证明"只有 axis 变档"）：node scripts/shot.mjs --classes
  if (hasFlag('classes')) {
    console.log('视角档位表（CONTRACTS §12 / t34）');
    for (const row of VIEW_CLASS_TABLE) {
      console.log(` ${row.view.padEnd(9)} 类别 ${row.class.padEnd(4)} 内容暗区上限 ${(row.maxContentDark * 100).toFixed(0)}% 内容均值下限 ${row.minContentMean}`);
    }
    return;
  }
  // 只做离线统计（对已有 PNG 解出亮度判据，不出图、不起浏览器）
  const statsOnly = argValue('stats-only', null);
  if (statsOnly) {
    const files = statsOnly.split(',').map((f) => resolve(f));
    console.log('=== shot --stats-only：对已有 PNG 做亮度统计（纯 Node 解码） ===');
    for (const file of files) {
      if (!existsSync(file)) {
        console.error(` - 缺文件 ${file}`);
        continue;
      }
      const stats = decodePngStats(file, {
        darkLuma: Number(argValue('dark-luma', 0.08)),
        clipLuma: Number(argValue('clip-luma', 0.9)),
        view: viewFromFilename(file),
      });
      const size = readPngSize(file);
      console.log(
        ` ${file.split('/').pop().padEnd(28)} ${size.width}×${size.height} ${(size.bytes / 1024).toFixed(1)}KB 内容均值 ${stats.content.meanLuma.toFixed(4)} 内容暗区 ${(stats.content.darkRatio * 100).toFixed(2)}% 内容截断 ${(stats.content.brightRatio * 100).toFixed(2)}% 内容像素 ${(stats.content.share * 100).toFixed(1)}% | 整帧 均值 ${stats.meanLuma.toFixed(4)} p05 ${stats.p05.toFixed(3)} p50 ${stats.p50.toFixed(3)} p95 ${stats.p95.toFixed(3)} 暗区 ${(stats.darkRatio * 100).toFixed(2)}%`,
      );
    }
    process.exit(0);
  }

  console.log('=== shot: 紫禁天朝 1440×900 截图（headless） ===');
  console.log(`root     : ${ROOT}`);
  console.log(`viewport : ${WIDTH}×${HEIGHT} · DPR ${DPR} · quality ${QUALITY} · ui ${USE_UI ? 'on' : 'off'}`);

  const explicitBrowser = argValue('browser', null);
  const browser = explicitBrowser ? { path: existsSync(explicitBrowser) ? explicitBrowser : null, kind: 'explicit', tried: [`--browser=${explicitBrowser}`] } : findBrowser();
  if (!browser.path) {
    console.error('shot: ✗ 未找到可用浏览器 —— 无法出图（不以任何方式伪造截图）');
    console.error('  已尝试的位置：');
    for (const item of browser.tried) console.error(`    - ${item}`);
    console.error('  修复建议：');
    console.error('    1) 安装/定位 headless shell 后设置 CHROME_PATH，例如：');
    console.error('       CHROME_PATH=~/"Library/Caches/ms-playwright/chromium_headless_shell-<ver>/chrome-headless-shell-mac-arm64/chrome-headless-shell" \\');
    console.error('         node scripts/shot.mjs');
    console.error('    2) 或在有图形环境的机器上运行 scripts/serve.sh + 手动截图。');
    console.error('  退出码：2（浏览器不可用）');
    process.exit(2);
  }
  console.log(`browser  : ${browser.path}  [${browser.kind}]`);

  if (PROBE_ONLY) {
    console.log('probe: 浏览器可用（未出图）。WebGL 能力由实际截图校验，不在本模式断言。');
    process.exit(0);
  }

  const viewArg = argValue('view', 'oblique');
  const presetArg = argValue('preset', 'golden');
  const views = viewArg === 'all' ? ['oblique', 'iso', 'axis', 'zone', 'focus', 'interior', 'fp', 'orbit'] : viewArg.split(',').map((v) => v.trim()).filter(Boolean);
  const presets = presetArg === 'all' ? ['golden', 'dusk', 'night'] : presetArg.split(',').map((p) => p.trim()).filter(Boolean);
  for (const preset of presets) {
    if (!VIEW_PRESETS[preset]) {
      console.error(`shot: ✗ 未知时辰 "${preset}"（合法：golden|dusk|night|all）`);
      process.exit(2);
    }
  }

  let glVariants;
  try {
    glVariants = resolveGlVariants(GL_SELECTOR);
  } catch (error) {
    console.error(`shot: ✗ ${error.message}`);
    process.exit(2);
  }
  console.log(`gl       : ${GL_SELECTOR === 'auto' ? `auto（依次尝试 ${glVariants.map((v) => v.id).join(' → ')}）` : GL_SELECTOR}`);
  console.log(`virtual  : ${VIRTUAL_TIME_MS}ms / 单次超时 ${TIMEOUT_MS}ms`);

  mkdirSync(OUT_DIR, { recursive: true });
  const staticServer = createStaticServer({ root: ROOT, port: PORT });
  const actualPort = await staticServer.listen(PORT);
  const base = `http://127.0.0.1:${actualPort}/`;
  console.log(`base url : ${base}`);

  const results = [];
  const diagnostics = [];
  const imageStats = [];
  const browserReports = [];
  const judgeResults = [];
  let readyCheckedAny = false;
  /** t46：按预设缓存渲染侧上报的权威背景色（?stats=1 的 backgroundColorHex …） */
  const authoritativeByPreset = new Map();
  /** t54：`?stats=1` 报告按预设缓存（掩码极性需要 skyShare / skyMaskShareByColor） */
  const reportByPreset = new Map();

  for (const view of views) {
    for (const preset of presets) {
      const query = new URLSearchParams({
        view,
        preset,
        ui: USE_UI ? '1' : '0',
        shot: '1',
        quality: QUALITY,
        dpr: String(DPR),
      });
      if (WITH_STATS) query.set('stats', '1');
      if (argValue('env')) query.set('env', argValue('env')); // 诊断用：只改本进程内环境预设副本
      // t51：通用查询透传（如 `--query=mask=sky` 取真天空掩码图）
      if (argValue('query')) for (const kv of String(argValue('query')).split(',')) { const [k, v] = kv.split('='); if (k) query.set(k, v ?? '1'); }
      if (argValue('zone')) query.set('zone', argValue('zone'));
      if (argValue('focus')) query.set('focus', argValue('focus'));
      const url = `${base}?${query.toString()}`;
      const defaultName = `t2-${view}-${preset}${hasFlag('stats') ? '-stats' : ''}.png`;
      const name = views.length === 1 && presets.length === 1 ? argValue('name', defaultName) : defaultName;
      const outPath = join(OUT_DIR, name);
      const before = staticServer.requests.length;

      let verdict = 'failed';
      /* t55：把成功的 GL 变体带出循环 —— 掩码渲染在统计段调用，那里 `variant` 不在作用域（t54 坑①） */
      let okVariant = null;
      let maskPathDone = null;
      let reasons = ['尚未尝试任何 WebGL 启动方案'];
      let size = null;
      let ms = 0;
      let proc = { status: null };
      let stderr = '';
      let requests = [];
      let requestedPaths = new Set();
      let usedVariant = null;
      let readyChecked = false;
      let readyInfo = { checked: false, ok: false };

      const tempPath = `${outPath}.attempt.png`;
      let previousKept = false;
      variantLoop: for (const variant of glVariants) {
        for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        if (existsSync(tempPath)) unlinkSync(tempPath);
        const attemptBefore = staticServer.requests.length;
        const args = browserArgs({ browser: browser.path, screenshotPath: tempPath, url, glVariant: variant });
        const started = Date.now();
        proc = await runBrowser(browser.path, args, TIMEOUT_MS);
        ms = Date.now() - started;
        stderr = proc.stderr ?? '';
        requests = staticServer.requests.slice(Math.max(before, attemptBefore));
        requestedPaths = new Set(requests.map((r) => r.path));

        verdict = 'ok';
        reasons = [];
        let retryable = proc.timedOut; // 超时类失败（含沙箱/首次启动抖动）允许同方案重试
        size = existsSync(tempPath) ? readPngSize(tempPath) : null;
        if (!size) {
          verdict = 'failed';
          reasons.push(
            proc.timedOut
              ? `浏览器被判超时终止（${ms}ms ≥ ${TIMEOUT_MS}ms；若同时 HTTP 请求为空，说明页面始终没加载成功）`
              : '截图文件不存在或不是合法 PNG',
          );
        } else {
          if (size.width !== WIDTH || size.height !== HEIGHT) {
            verdict = 'failed';
            reasons.push(`PNG 尺寸 ${size.width}×${size.height} != ${WIDTH}×${HEIGHT}`);
          }
          if (MASK_MODE) {
            // t52：掩码模式用**专属判据**（2 主色 + 纯度 ≥99%），不看体积（二值掩码 6917B 属正常）
            const maskCheck = checkSkyMaskImage(outPath, size);
            if (!maskCheck.ok) {
              verdict = 'failed';
              reasons.push(`掩码图不合格：${maskCheck.note}（掩码模式不用体积门）`);
            }
          } else if (size.bytes < MIN_BYTES) {
            verdict = 'failed';
            reasons.push(`PNG 体积仅 ${size.bytes}B < 下限 ${MIN_BYTES}B，疑似空白/未渲染画面`);
          }
          if (!requestedPaths.has('/src/main.js')) {
            verdict = 'failed';
            reasons.push('HTTP 服务未收到 /src/main.js 请求：页面 JS 没跑起来');
          }
          if (![...requestedPaths].some((p) => p.includes('vendor/three/three.module.js'))) {
            verdict = 'failed';
            reasons.push('HTTP 服务未收到 three 模块请求：WebGL 场景未初始化');
          }
          for (const pattern of [
            /Failed to create a unique user data directory/i,
            /DevToolsActivePort/i,
            /TargetClosedError/i,
            /Cannot launch/i,
          ]) {
            if (pattern.test(stderr)) {
              verdict = 'failed';
              reasons.push(`stderr 命中沙箱/启动失败特征：${pattern}`);
            }
          }
        }
        if (verdict === 'ok') okVariant = variant; // t55：成功变体带出循环，供掩码渲染复用（替代把调用塞进循环）
        // 场景就绪信号（t17 要求可外部轮询）：-dump-dom 直接读 <html data-palace-ready="1">
        // 需要就绪/报告检查的情形：显式要求，或(first 模式且)还没拿到过"就绪 + 报告"
        const needReadyCheck =
          verdict === 'ok' &&
          REQUIRE_READY !== 'none' &&
          (REQUIRE_READY === 'all' || !(readyCheckedAny && readyInfo.report));
        if (verdict === 'ok' && REQUIRE_READY !== 'none' && readyCheckedAny && !readyInfo.report && REQUIRE_READY === 'first') {
          // 首次探测失败过（沙箱首启抖动）：下一张成功图继续补一次报告
        }
        if (needReadyCheck) {
          const reportUrl = `${url}&stats=1`;
          const domProc = await runBrowser(browser.path, browserArgs({
            browser: browser.path,
            screenshotPath: null,
            url: reportUrl,
            glVariant: variant,
            extraArgs: ['--dump-dom', '--virtual-time-budget=9000'],
          }), TIMEOUT_MS);
          const dom = domProc.stdout ?? '';
          readyCheckedAny = true;
          const loadedSeen = /data-palace-loaded="1"/.test(dom);
          const readySeen = /data-palace-ready="1"/.test(dom);
          readyChecked = loadedSeen && readySeen;
          // 顺带抓取页面内的实测报告（window 侧同源 DOM 元素，避免再跑一次浏览器）
          const reportMatch = dom.match(/<pre id="palace-stats-json"[^>]*>([\s\S]*?)<\/pre>/);
          let report = null;
          if (reportMatch) {
            try {
              report = JSON.parse(
                reportMatch[1]
                  .replace(/&quot;/g, '"')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&#39;/g, "'"),
              );
            } catch (error) {
              report = { parseError: error.message, raw: reportMatch[1].slice(0, 200) };
            }
          }
          // t46：从 ?stats=1 报告里取**权威背景色**（t45 字段），按预设缓存（同预设背景恒定）
          if (report && typeof report === 'object' && (report.backgroundDisplayedTopHex || report.backgroundColorHex)) {
            // t49：落屏带优先（displayed top↔horizon）；配置色仅作参考 + Δ 监控
            const topRgb = hexToRgb(report.backgroundDisplayedTopHex ?? '') ?? null;
            const horizonRgb = hexToRgb(report.backgroundDisplayedHorizonHex ?? '') ?? topRgb;
            const rgb = hexToRgb(report.backgroundColorHex) ?? topRgb;
            const displayedBand = topRgb ? {
              a: topRgb,
              b: horizonRgb ?? topRgb,
              topHex: report.backgroundDisplayedTopHex ?? null,
              horizonHex: report.backgroundDisplayedHorizonHex ?? null,
              kind: report.backgroundDisplayedKind ?? null,
            } : null;
            if (rgb) {
              authoritativeByPreset.set(preset, {
                rgb,
                hex: report.backgroundColorHex,
                linear: report.backgroundColorLinear ?? null,
                role: report.backgroundRole ?? null,
                toneMapped: report.backgroundToneMapped ?? null,
                fogHex: report.fogColorHex ?? null,
                fogNear: report.fogNear ?? null,
                fogFar: report.fogFar ?? null,
                displayedBand,
                deltaMaxAbs: report.backgroundDeltaMaxAbs ?? null,
                deltaConfigVsSkyTop: report.backgroundDeltaConfigVsSkyTop ?? null,
                configuredHex: report.backgroundColorHex ?? null,
                configuredSemantic: report.backgroundConfiguredSemantic ?? null,
              });
            }
          }
          if (report && typeof report === 'object') reportByPreset.set(preset, report);
          readyInfo = {
            checked: true,
            ok: readyChecked,
            hasWindowFlag: /__PALACE_READY__/.test(dom),
            loaded: loadedSeen,
            ready: readySeen,
            readyReason: (dom.match(/data-palace-ready-src="([^"]+)"/) ?? [])[1] ?? null,
            domLength: dom.length,
            report,
          };
          if (!readyChecked) {
            verdict = 'failed';
            retryable = true;
            reasons.push(
              `未观察到场景就绪标记（data-palace-loaded=${loadedSeen} / data-palace-ready=${readySeen}）：页面没完成装配，不能靠固定延时出图；同方案重试一次`,
            );
          }
        }
        usedVariant = variant.id;
        if (verdict === 'ok') break variantLoop;
        console.error(`shot: · ${name} 的 WebGL 方案 [${variant.id}] 第 ${attempt}/${ATTEMPTS} 次未通过：${reasons.join('；')}`);
        if (!retryable) break; // 非"可重试"失败（如空白图/尺寸不符）重试同方案无意义 → 换方案
        }
      }

      if (verdict !== 'ok') {
        // 失败图**保留为 <name>.invalid.png**（不得删除失败证据）：交付名不会留下误导性画面，
        // 但失败本身连同体积/亮度统计一起进清单。仅 --no-keep-invalid 才彻底删除。
        let kept = null;
        // 只处理"本次尝试产出的文件"；已有交付图（上一次成功的结果）绝不因本次失败而销毁
        if (existsSync(tempPath)) {
          if (KEEP_INVALID) {
            kept = outPath.replace(/\.png$/, '.invalid.png');
            try {
              if (existsSync(kept)) unlinkSync(kept);
              renameSync(tempPath, kept);
            } catch {
              kept = null;
            }
          }
          if (existsSync(tempPath)) {
            try {
              unlinkSync(tempPath);
            } catch {
              /* ignore */
            }
          }
        }
        previousKept = existsSync(outPath);
        const failStats = kept ? decodePngStats(kept, { darkLuma: DARK_LUMA, clipLuma: CLIP_LUMA, view }) : null;
        if (failStats) {
          imageStats.push({ name: `${name}(invalid)`, view, preset, quality: QUALITY, viewport: `${WIDTH}x${HEIGHT}`, verdict, kept, ...failStats });
        }
        const judge = failStats ? judgeShot({ view, stats: failStats }) : { ok: false, reasons: ['无图可统计'] };
        judgeResults.push({ name, view, preset, ...judge, meanLuma: failStats?.meanLuma ?? null, darkRatio: failStats?.darkRatio ?? null, contentMean: failStats?.content?.meanLuma ?? null, contentDark: failStats?.content?.darkRatio ?? null, contentClip: failStats?.content?.brightRatio ?? null, contentShare: failStats?.content?.share ?? null });
        const stderrTail = stderr.split('\n').filter(Boolean).slice(-12);
        const failLines = [
          `shot: ✗ ${name} 失败（${reasons.join('；')}）`,
          `  已尝试 GL 方案 : ${glVariants.map((v) => v.id).join(' → ')}（全部失败）`,
          `  浏览器   : ${browser.path} [${browser.kind}]`,
          `  退出码   : ${proc.status}${proc.signal ? ` signal=${proc.signal}` : ''}  用时 ${ms}ms`,
          `  URL      : ${url}`,
          `  HTTP 请求 : ${requests.length} 条`,
          `      ${[...requestedPaths].slice(0, 14).join(', ') || '（无请求 —— 浏览器未真的加载页面）'}`,
          previousKept ? '  已有交付图: 保留上一次成功结果（本次失败未销毁它）' : '  已有交付图: 无',
          kept ? `  失败图   : 已保留 ${kept}（含亮度统计：${failStats ? `均值 ${failStats.meanLuma} · 暗区 ${(failStats.darkRatio * 100).toFixed(2)}%` : '无法解码'}）` : '  失败图   : 未保留（--no-keep-invalid）',
          `  stderr    :`,
          ...stderrTail.map((line) => `      ${line.slice(0, 240)}`),
          `  说明      : 本机文件沙箱会阻止 headless Chrome（"Failed to create a unique user data directory for headless"）；` +
            `此时截图属不可得证据，请以 node tests/run.mjs 与 node scripts/audit.mjs 的 Node 侧结果为准，不要伪造画面。`,
        ];
        console.error(failLines.join('\n'));
        diagnostics.push(...failLines);
      } else {
        if (verdict === 'ok' && existsSync(tempPath)) renameSync(tempPath, outPath);
        let px = null;
        let crossCheck = null;
        let maskPairStats = null;
        let maskPairError = null;
        let bgPolicy = null;
        if (existsSync(outPath)) {
          /* t57：真天空掩码 = **唯一依据**，从**同一次 --dump-dom 报告**里取 `skyMaskPngBase64`
             （t56 交付；**不新增第二次页面加载**）。解码成临时 PNG 后走 t54 已实现的
             `decodePngStats(...,{maskFile})`：恰 2 色 + 纯度 ≥99% 校验、按 `skyMaskPngShareByColor`
             反推天空色（禁止假定 white=sky）。函数层零改动。 */
          const rep = reportByPreset.get(preset) ?? null;
          try {
            if (typeof rep?.skyMaskPngBase64 === 'string' && rep.skyMaskPngBase64.length > 100) {
              const b64 = rep.skyMaskPngBase64.replace(/^data:image\/png;base64,/, '');
              const maskTmp = join(tmpdir(), `${basename(outPath).replace(/\.png$/, '')}.skymask.png`);
              writeFileSync(maskTmp, Buffer.from(b64, 'base64'));
              maskPairStats = decodePngStats(outPath, {
                darkLuma: DARK_LUMA, clipLuma: CLIP_LUMA, view,
                maskFile: maskTmp,
                skyShare: typeof rep.skyShare === 'number' ? rep.skyShare : null,
                skyShareByColor: rep.skyMaskPngShareByColor ?? rep.skyMaskShareByColor ?? null,
              });
            } else {
              maskPairError = '报告缺少 skyMaskPngBase64（无法同加载取掩码）';
            }
          } catch (error) {
            maskPairError = error?.message ?? String(error);
          }
          // 1) 像素法（t44 规则）先跑，作为交叉校验/兜底
          const pixelStats = decodePngStats(outPath, { darkLuma: DARK_LUMA, clipLuma: CLIP_LUMA, view });
          // 2) 权威背景占比（用权威色做颜色邻近统计；±2 按 t45 建议的量化容差）
          let authShare = null;
          let authDelta = null;
          let authTolUsed = null;
          const auth = authoritativeByPreset.get(preset) ?? null;
          if (auth) {
            // 权威色是**清屏色**，画面里被画出来的天空像素可能因后处理/雾而偏离 ⇒ 用"像素法找到的天空色"量化 Δ 并放宽容差
            const pb = pixelStats.mask.background;
            authDelta = pb ? Math.max(Math.abs(pb.r - auth.rgb.r), Math.abs(pb.g - auth.rgb.g), Math.abs(pb.b - auth.rgb.b)) : null;
            authTolUsed = CONTENT_TOL; // t49：落屏天空带按 §12.1 的 `--content-tol`(6)；配置色不再作为掩码依据
            const authBand = auth.displayedBand ?? null;
            const authStats = decodePngStats(outPath, {
              darkLuma: DARK_LUMA, clipLuma: CLIP_LUMA, view,
              backgroundBand: authBand, bandTol: authTolUsed,
              backgroundRgb: authBand ? null : auth.rgb, contentTol: authTolUsed,
              authoritativeMeta: auth,
            });
            authShare = 1 - authStats.content.share;
          }
          bgPolicy = decideBackgroundPolicy({
            authoritativeRgb: (authoritativeByPreset.get(preset) ?? null)?.rgb ?? null,
            authoritativeShare: authShare,
            authoritativeMeta: (authoritativeByPreset.get(preset) ?? null),
            pixelRgb: pixelStats.mask.background,
            isInteriorView: view === 'interior',
            displayedBand: (authoritativeByPreset.get(preset) ?? null)?.displayedBand ?? null,
            deltaMaxAbs: (authoritativeByPreset.get(preset) ?? null)?.deltaMaxAbs ?? null,
            bandTol: CONTENT_TOL,
          });
          const useAuthoritative = bgPolicy.mode === 'authoritative' || bgPolicy.mode === 'authoritative-band';
          const noSkyView = bgPolicy.mode === 'no-sky-view';
          px = maskPairStats ?? decodePngStats(outPath, {
            darkLuma: DARK_LUMA,
            clipLuma: CLIP_LUMA,
            view,
            backgroundRgb: useAuthoritative && !bgPolicy.band ? bgPolicy.rgb : null,
            backgroundBand: useAuthoritative && bgPolicy.band ? bgPolicy.band : null,
            bandTol: CONTENT_TOL,
            noSkyView,
            authoritativeMeta: (authoritativeByPreset.get(preset) ?? null),
            authoritativePolicy: bgPolicy,
          });
          crossCheck = {
            policy: bgPolicy,
            authDelta,
            authTolUsed,
            authRgb: auth?.rgb ?? null,
            authRole: auth?.role ?? null,
            pixelBackground: pixelStats.mask.background,
            pixelContentShare: pixelStats.content.share,
            pixelContentDark: pixelStats.content.darkRatio,
            authoritativeShare: authShare,
          };
        }
        if (px) {
          imageStats.push({ name, view, preset, quality: QUALITY, viewport: `${WIDTH}x${HEIGHT}`, verdict, ...px });
          const judge = judgeShot({ view, stats: px });
          judgeResults.push({ name, view, preset, ...judge, meanLuma: px.meanLuma, darkRatio: px.darkRatio, contentMean: px.content?.meanLuma ?? null, contentDark: px.content?.darkRatio ?? null, contentClip: px.content?.brightRatio ?? null, contentShare: px.content?.share ?? null, maskGuard: px.mask?.guard?.tripped ?? null, maskReason: px.mask?.guard?.reasons?.[0] ?? null });
          console.log(
            `shot: ${verdict === 'ok' ? '✓' : '✗'} ${name}  ${size.width}×${size.height} · ${(size.bytes / 1024).toFixed(1)}KB · ${ms}ms · 请求 ${requests.length} 条 · GL [${usedVariant}]`,
          );
          const maskLine = px.mask?.mode === 'sky-mask'
            ? `        ✅ 真天空掩码（唯一依据，同 dump 取图）：${px.mask.maskPair.basis}｜唯一色 ${px.mask.maskPair.uniqueColors}、纯度 ${(px.mask.maskPair.purity * 100).toFixed(2)}%`
            : (maskPairError ? `        ❌ 真天空掩码配对失败：${maskPairError}` : null);
          const bgPolicyLine = px.mask?.mode === 'no-sky-view'
            ? `        ℹ️ 无天空视角（正式口径）：${px.mask.noSkyNote}`
            : `        背景口径[${px.mask?.mode}]：${crossCheck?.policy?.note ?? '像素法'}`;
          const deltaLine = crossCheck?.policy?.deltaNote ? `        ${crossCheck.policy.deltaNote}` : null;
          const pixelCrossLine = crossCheck
            ? (crossCheck.pixelBackground
              ? `        像素法交叉校验：rgb(${crossCheck.pixelBackground.r},${crossCheck.pixelBackground.g},${crossCheck.pixelBackground.b})（整帧内容占比 ${(crossCheck.pixelContentShare * 100).toFixed(1)}%、暗区 ${(crossCheck.pixelContentDark * 100).toFixed(2)}%）${crossCheck.policy.crossCheck ? (crossCheck.policy.crossCheck.agree ? ' ✓ 与权威一致（±8）' : ' ⚠️ 与权威不一致（>±8，像素法可能失效）') : ''}`
              : '        像素法交叉校验：未找到真天空（以权威口径为准）')
            : null;
          console.log(
            `        内容掩码[${judge.cls}] 均值 ${px.content.meanLuma} · 暗区 ${(px.content.darkRatio * 100).toFixed(2)}%（上限 ${(judge.maxDark * 100).toFixed(0)}%） · 高光截断 ${(px.content.brightRatio * 100).toFixed(2)}%（上限 ${(CLIP_MAX * 100).toFixed(0)}%） · 内容像素 ${(px.content.share * 100).toFixed(1)}%${px.content.background ? ` · 背景 rgb(${px.content.background.r},${px.content.background.g},${px.content.background.b})@${(px.content.background.borderShare * 100).toFixed(0)}%（容差 ${px.content.background.tolerance}、离散 ±${px.content.background.spread}）` : ' · 无背景色（全画面为内容）'}`,
            px.mask?.guard?.tripped
              ? `        ⚠️ 背景掩码防护触发：${px.mask.guard.reasons.join('；')}`
              : `        ✓ 背景掩码防护：未触发（背景${px.mask?.backgroundFound ? '已识别' : '未识别（内景或无天空画面，已按规则放行）'}，内容占比 ${((px.mask?.contentShare ?? 1) * 100).toFixed(1)}%）`,
            maskLine,
            bgPolicyLine,
            deltaLine,
            pixelCrossLine,
            `        整帧(诊断) 均值 ${px.meanLuma} · p05 ${px.p05} · p50 ${px.p50} · p95 ${px.p95} · 暗区(luma<${DARK_LUMA}) ${(px.darkRatio * 100).toFixed(2)}% · 高光截断(luma>${CLIP_LUMA}) ${(px.brightRatio * 100).toFixed(2)}% · 内容占比 ${(px.contentRatio * 100).toFixed(1)}%`,
          );
          console.log(
            `        直方图(暗→亮 8 档) ${px.histogram.join(' ')} · 可读性判据 ${judge.ok ? 'PASS' : `FAIL（${judge.reasons.join('；')}）`}${judge.diagnostics?.length ? `\n        诊断：${judge.diagnostics.join('；')}` : ''}`,
          );
          if (readyInfo.report && !readyInfo.report.parseError) {
            const rp = readyInfo.report;
            console.log(
              `        浏览器实测：整帧调用 ${rp.fullFrameDrawCalls} · 可见三角面 ${rp.visibleTriangles} · 主场景可绘制对象 ${rp.mainSceneRenderables} · ` +
                `几何 ${rp.geometries} / 纹理 ${rp.textures} · 实时宫灯 ${rp.lampActive}/${rp.lampRealtime}（锚点 ${rp.lampAnchors}） · ` +
                `太阳 ${rp.sunIntensity} / 环境 ${rp.ambientIntensity} / 半球 ${rp.hemiIntensity} / 曝光 ${rp.exposure} · 建筑 ${rp.buildings}`,
            );
            browserReports.push({ name, view, preset, ...rp });
          } else if (readyInfo.report) {
            console.log(`        浏览器实测报告解析失败：${readyInfo.report.parseError}`);
          }
          if (MIN_CONTENT !== null && px.contentRatio < MIN_CONTENT) {
            verdict = 'failed';
            reasons.push(`内容占比 ${px.contentRatio} < --min-content ${MIN_CONTENT}（画面近似纯色）`);
          }
          if (MIN_LUMA !== null && px.meanLuma < MIN_LUMA) {
            verdict = 'failed';
            reasons.push(`平均亮度 ${px.meanLuma} < --min-luma ${MIN_LUMA}（画面偏暗）`);
          }
        }
      }
      results.push({
        view,
        preset,
        name,
        url,
        outPath,
        kept: verdict === 'ok' ? outPath : existsSync(outPath.replace(/\.png$/, '.invalid.png')) ? outPath.replace(/\.png$/, '.invalid.png') : outPath,
        previousKept,
        ms,
        size,
        requests: requests.length,
        verdict,
        reasons,
        gl: usedVariant,
        readyInfo,
        stats: imageStats.find((s) => s.name === name || s.name === `${name}(invalid)`) ?? null,
        judge: judgeResults.find((j) => j.name === name) ?? null,
      });
    }
  }

  await staticServer.close();

  const failed = results.filter((r) => r.verdict !== 'ok');
  console.log('---------------------------------------------------------');
  for (const r of results) {
    const stat = imageStats.find((s) => s.name === r.name);
    console.log(
      ` ${r.verdict === 'ok' ? '✓' : '✗'} ${r.name}  ${
        r.verdict === 'ok'
          ? `${r.size.width}×${r.size.height} ${(r.size.bytes / 1024).toFixed(1)}KB 亮度均值 ${stat?.meanLuma ?? '-'} 暗区 ${stat ? (stat.darkRatio * 100).toFixed(1) : '-'}% [${r.gl}]`
          : r.reasons.join('；')
      }`,
    );
  }
  if (browserReports.length > 0) {
    console.log('---------------------------------------------------------');
    console.log(' 浏览器实测（DOM 报告，SwiftShader 软光栅 → 帧率不具代表性；批次/三角面/灯数可参考）');
    for (const row of browserReports) {
      console.log(
        ` ${row.preset.padEnd(7)} ${row.view.padEnd(9)} ${row.projection.padEnd(13)} 整帧调用 ${String(row.fullFrameDrawCalls).padStart(4)} 可见三角面 ${String(row.visibleTriangles).padStart(7)} 可绘制对象 ${String(row.mainSceneRenderables).padStart(3)} 实时宫灯 ${row.lampActive}/${row.lampRealtime} 锚点 ${row.lampAnchors}`,
      );
    }
  }
  if (imageStats.length > 0) {
    console.log('---------------------------------------------------------');
    console.log(' 各图亮度统计（PNG 解码实测，可用于回答"某时辰是否偏暗"）');
    for (const row of imageStats) {
      console.log(
        ` ${row.preset.padEnd(7)} ${row.view.padEnd(9)} [${row.content?.background ? '内容掩码' : '全画面'}] 内容均值 ${(row.content?.meanLuma ?? row.meanLuma).toFixed(3)} 内容暗区 ${((row.content?.darkRatio ?? row.darkRatio) * 100).toFixed(2)}% 内容截断 ${((row.content?.brightRatio ?? row.brightRatio) * 100).toFixed(2)}% | 整帧均值 ${row.meanLuma.toFixed(3)} 整帧暗区 ${(row.darkRatio * 100).toFixed(2)}%`,
      );
    }
  }
  // 机器可读清单（含失败记录与其亮度统计）
  const manifestPath = join(OUT_DIR, 'manifest.json');
  let previousManifest = null;
  if (existsSync(manifestPath)) {
    try {
      previousManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      previousManifest = null;
    }
  }
  const mergeByName = (oldList = [], newList = [], renamed = false) => {
    const map = new Map();
    for (const row of oldList) map.set(row.name, row);
    for (const row of newList) map.set(row.name, row);
    return [...map.values()];
  };
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        node: process.version,
        viewport: `${WIDTH}x${HEIGHT}`,
        dpr: DPR,
        quality: QUALITY,
        criteria: {
          darkLumaThreshold: DARK_LUMA,
          highlightClipLumaThreshold: CLIP_LUMA,
          cityMinMeanLuma: CITY_MIN_MEAN,
          cityMaxDarkRatio: CITY_MAX_DARK,
          interiorMinMeanLuma: INTERIOR_MIN_MEAN,
          note: '统计基于最终帧缓冲（含阴影与后处理）；暗区 = luma < darkLumaThreshold；高光截断 = luma > highlightClipLumaThreshold',
        },
        results: mergeByName(previousManifest?.results, results),
        imageStats: mergeByName(previousManifest?.imageStats, imageStats),
        judge: mergeByName(previousManifest?.judge, judgeResults),
        browserReports: mergeByName(previousManifest?.browserReports, browserReports),
        history: [...(previousManifest?.history ?? []), { at: new Date().toISOString(), shots: results.map((r) => `${r.name}:${r.verdict}`) }].slice(-30),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`shot: 清单已写入 ${manifestPath}（含失败记录与亮度统计，失败图保留为 *.invalid.png）`);

  if (judgeResults.length > 0) {
    const judgeFailed = judgeResults.filter((j) => !j.ok);
    console.log('---------------------------------------------------------');
    console.log(' 可读性判据（CONTRACTS §12 / t34：暗区按**内容掩码**；俯瞰/环绕类(oblique,iso,orbit,zone) ≤' + CITY_MAX_DARK + '，低空/近景类(focus,fp,interior,axis) ≤' + NEAR_MAX_DARK + '；内容均值 全城类 ≥' + CITY_MIN_MEAN + '、内景 ≥' + INTERIOR_MIN_MEAN + '；过曝按高光截断 ≤' + CLIP_MAX + '，整帧均值 ≤' + DIAG_MAX_MEAN + ' 仅诊断）；**背景掩码防护**：内容占比 ≥' + MASK_MAX_CONTENT + ' 或背景占比 <' + MASK_MIN_BG_SHARE + ' ⇒ 警告 + FAIL（内景自动豁免，外景无天空需 --allow-no-sky）');
    for (const j of judgeResults) {
      console.log(
        ` ${j.ok ? 'PASS' : 'FAIL'} ${j.preset.padEnd(7)} ${j.view.padEnd(9)} [${j.cls ?? cityClassOf(j.view)}] 内容均值 ${j.contentMean ?? '-'} 内容暗区 ${j.contentDark !== null && j.contentDark !== undefined ? `${(j.contentDark * 100).toFixed(2)}%` : '-'} 内容截断 ${j.contentClip !== null && j.contentClip !== undefined ? `${(j.contentClip * 100).toFixed(2)}%` : '-'} | 整帧均值 ${j.meanLuma ?? '-'} ${j.ok ? '' : j.reasons.join('；')}`,
      );
    }
    if (JUDGE && judgeFailed.length > 0) {
      console.error(`shot: ✗ --judge 判定 ${judgeFailed.length}/${judgeResults.length} 张不达可读性判据（图片已保留，不删除）`);
      process.exit(1);
    }
  }

  if (failed.length === 0 && results.length > 0) {
    console.log(`shot: 全部 ${results.length} 张截图有效，输出目录 ${OUT_DIR}`);
    console.log(`shot: 就绪信号检查 ${REQUIRE_READY}（data-palace-ready="1"）`);
    console.log('shot: 校验项：PNG 尺寸、体积下限、HTTP 收到 /src/main.js 与 vendor three、stderr 无沙箱失败特征');
    process.exit(0);
  }
  console.error(`shot: ${failed.length}/${results.length} 张失败（已删除无效文件，不会留下空白图）；详细诊断见上方输出`);
  process.exit(1);
}

/* t41：只有**直接执行**本文件时才跑主流程；被 import（tests/shot-mask.test.mjs 等）时不得有副作用
   —— 否则一次 import 会偷偷出图并重写 docs/shots/manifest.json。 */
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  if (resolve(entry) === self) return true;
  return basename(entry) === basename(self); // 兜底（符号链接/规范化差异）
})();
if (invokedDirectly) {
  main().catch((error) => {
    console.error('shot: 未预期错误：', error);
    process.exit(3);
  });
}
