#!/usr/bin/env node
/**
 * `tests/core-stats.test.mjs` —— t45 回归：`?stats=1` 的**权威背景口径**（只读上报，不改渲染）。
 *
 * 背景（t44 登记的工具限制）：纯像素无法区分"填满顶部的均匀无梯度雾"与天空；本项目围绕背景识别
 * 连续三次口径争议（t39 量化桶左下角 → t41 差 1 单位静默失效 → t44 雾被当成天空）。根治办法是让
 * **渲染侧把权威背景色交给工具**：
 *   · `environment.describe().background`（当前预设下的 `scene.background` 实际颜色 + 天空两端色 + 雾）；
 *   · `renderSystem.getStats().background`（同一口径，来自 `renderPass.scene`，供 `__PALACE__.stats().render` 消费）。
 *
 * 本测试只做**只读**断言：字段存在、颜色合法、口径自洽（sRGB hex ⇄ 线性分量 ⇄ 0–255 三元组）、
 * 与 `config.LIGHTING.presets[preset]` 的天空/背景定义一致、切预设同步变化；并断言读取描述不改变任何渲染参数。
 */

import {
  ROOT,
  assert,
  assertClose,
  assertEqual,
  createTestRunner,
  loadModule,
  loadThree,
} from './harness.mjs';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runner = createTestRunner('core-stats.test.mjs · 权威背景口径（t45）');

const THREE = await loadThree();
const { CONFIG, COLORS_DERIVED, COLORS } = await loadModule('src/shared/config.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createEnvironment } = await loadModule('src/core/environment.js');

const HEX_RE = /^#[0-9a-f]{6}$/;
const norm = (v) => +Number(v).toFixed(6);

function makeEnv() {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const exposed = { exposure: null, bloom: null };
  const environment = createEnvironment({
    config: CONFIG,
    events,
    scene,
    quality: 'medium',
    rendererAdapter: {
      setExposure: (v) => {
        exposed.exposure = v;
      },
      setBloom: (b) => {
        exposed.bloom = b;
      },
    },
  });
  return { events, scene, environment, exposed };
}

/** 复算 `applyPreset` 的背景公式：`color(horizon).lerp(color(top), 0.35)`（与实现同源，用于独立核对）。 */
function expectedBackgroundHex(presetId) {
  const p = CONFIG.LIGHTING.presets[presetId];
  const topHex = COLORS_DERIVED[p.backgroundRole] ?? p.backgroundRole;
  const horizonHex = COLORS_DERIVED[p.fogColorRole] ?? p.fogColorRole;
  const top = new THREE.Color(COLORS[topHex] ?? topHex);
  const horizon = new THREE.Color(COLORS[horizonHex] ?? horizonHex);
  return {
    topHex: COLORS[topHex] ?? topHex,
    horizonHex: COLORS[horizonHex] ?? horizonHex,
    hex: `#${horizon.clone().lerp(top, 0.35).getHexString()}`,
  };
}

/* ========================================================================== */
runner.section('1. 字段存在与口令自洽（environment.describe().background）');
/* ========================================================================== */

await runner.test('describe().background 字段齐全：hex / srgb255 / linear / 口径说明 / 天空两端色 / 雾', () => {
  const { environment } = makeEnv();
  const bg = environment.describe().background;
  for (const key of ['source', 'preset', 'role', 'hex', 'srgb255', 'linear', 'toneMapped', 'outputColorSpace', 'exposure', 'note', 'skyTopHex', 'skyHorizonHex', 'fog']) {
    assert(key in bg, `describe().background 应含 ${key}`);
  }
  assertEqual(bg.source, 'scene.background', 'source 应标明来源');
  assert(HEX_RE.test(bg.hex), `hex 应为合法 sRGB 十六进制（实际 ${bg.hex}）`);
  assert(Array.isArray(bg.srgb255) && bg.srgb255.length === 3, 'srgb255 应为 3 元组');
  for (const v of bg.srgb255) assert(Number.isInteger(v) && v >= 0 && v <= 255, `srgb255 分量应为 0–255 整数（实际 ${v}）`);
  assert(HEX_RE.test(bg.skyTopHex) && HEX_RE.test(bg.skyHorizonHex), '天空两端色应为合法 hex');
  assertEqual(bg.toneMapped, false, '清屏色不受色调映射影响（toneMapped 必须为 false）');
  assertEqual(bg.outputColorSpace, CONFIG.LIGHTING.toneMapping.outputColorSpace, '应带输出色彩空间');
  assert(bg.fog && HEX_RE.test(bg.fog.hex), '雾块应含合法 hex');
  runner.info(`goldenHour: 背景 ${bg.hex} · 天空顶 ${bg.skyTopHex}/地平 ${bg.skyHorizonHex} · 雾 ${bg.fog.hex}（${bg.fog.near}–${bg.fog.far}m）`);
});

await runner.test('口径自洽：hex ⇄ srgb255 ⇄ linear 三者逐值对应（sRGB vs 线性）', () => {
  const { environment } = makeEnv();
  for (const preset of ['goldenHour', 'sunset', 'moonlitNight']) {
    environment.applyPreset(preset);
    const bg = environment.describe().background;
    // hex 是**8-bit 量化**后的显示值，linear 保留全精度 ⇒ 回解差异 ≤ 半级量化步长（sRGB 1/255 在线性空间的步长）
    const fromHex = new THREE.Color(bg.hex); // three 会按 sRGB→线性 解析
    const QUANT_TOL = 0.005;
    assertClose(bg.linear.r, norm(fromHex.r), QUANT_TOL, `${preset} linear.r 应与 hex 的线性值一致（8-bit 量化容差内）`);
    assertClose(bg.linear.g, norm(fromHex.g), QUANT_TOL, `${preset} linear.g 一致（8-bit 量化容差内）`);
    assertClose(bg.linear.b, norm(fromHex.b), QUANT_TOL, `${preset} linear.b 一致（8-bit 量化容差内）`);
    runner.info(`${preset}: linear=${JSON.stringify(bg.linear)} ⇄ hex ${bg.hex}（量化差 ≤ ${QUANT_TOL}）`);
    const expected255 = new THREE.Color(bg.hex).getHexString();
    assertEqual(`#${expected255}`, bg.hex, `${preset} srgb255 与 hex 应互相一致`);
    for (const [i, v] of bg.srgb255.entries()) {
      assertClose(v, parseInt(bg.hex.slice(1 + i * 2, 3 + i * 2), 16), 0, `${preset} srgb255[${i}] 应等于 hex 分量`);
    }
  }
});

/* ========================================================================== */
runner.section('2. 与预设定义一致 + 切换同步变化');
/* ========================================================================== */

await runner.test('三时辰背景色 = 预设定义复算值（role → 天空/雾色 → 0.35 插值）', () => {
  const { environment } = makeEnv();
  for (const preset of ['goldenHour', 'sunset', 'moonlitNight']) {
    environment.applyPreset(preset);
    const bg = environment.describe().background;
    const expected = expectedBackgroundHex(preset);
    assertEqual(bg.hex, expected.hex, `${preset} 背景 hex 应等于预设公式复算值`);
    assertEqual(bg.role, CONFIG.LIGHTING.presets[preset].backgroundRole, `${preset} role 应为 preset.backgroundRole`);
    assertEqual(bg.skyTopHex, expected.topHex, `${preset} 天空顶色应等于 backgroundRole 定义`);
    assertEqual(bg.skyHorizonHex, expected.horizonHex, `${preset} 天空地平色应等于 fogColorRole 定义`);
    assertEqual(bg.fog.near, CONFIG.LIGHTING.presets[preset].fogNear, `${preset} 雾 near 应等于预设`);
    assertEqual(bg.fog.far, CONFIG.LIGHTING.presets[preset].fogFar, `${preset} 雾 far 应等于预设`);
  }
  runner.info(
    Object.keys(CONFIG.LIGHTING.presets)
      .map((p) => `${p}=${expectedBackgroundHex(p).hex}`)
      .join(' · '),
  );
});

await runner.test('切预设后背景/雾同步变化（三时辰两两不同）', () => {
  const { environment } = makeEnv();
  const seen = new Map();
  for (const preset of ['goldenHour', 'sunset', 'moonlitNight']) {
    environment.applyPreset(preset);
    const bg = environment.describe().background;
    assertEqual(bg.preset, preset, 'describe 应反映当前预设');
    assert(!seen.has(bg.hex), `不同预设的背景色不应相同（${preset} 与 ${seen.get(bg.hex)} 撞色）`);
    seen.set(bg.hex, preset);
  }
  assertEqual(seen.size, 3, '三时辰背景色应互不相同');
  runner.info(`变化：${[...seen.entries()].map(([hex, p]) => `${p}=${hex}`).join(' · ')}`);
});

await runner.test('雾与背景可以是不同颜色（t44 议题：雾可覆盖背景）—— 报告必须同时给出两者', () => {
  const { environment } = makeEnv();
  environment.applyPreset('goldenHour');
  const bg = environment.describe().background;
  assert(bg.hex && bg.fog?.hex, '背景与雾色必须都上报');
  assert(/可完全覆盖背景/.test(bg.fog.note), '雾块应带"可覆盖背景"的口径提示（t44 教训）');
  const differs = bg.hex !== bg.fog.hex;
  runner.info(`goldenHour：背景 ${bg.hex} vs 雾 ${bg.fog.hex} ⇒ ${differs ? '两者不同（工具需都比对）' : '本例相同'}`);
});

/* ========================================================================== */
runner.section('3. 只上报、不改渲染（读取描述不产生任何副作用）');
/* ========================================================================== */

await runner.test('读取 describe() 前后，渲染相关参数逐值不变（纯只读查询）', () => {
  const { environment, exposed } = makeEnv();
  environment.applyPreset('sunset');
  const before = environment.describe();
  const exposedBefore = { ...exposed };
  for (let i = 0; i < 3; i += 1) environment.describe(); // 反复读取
  const after = environment.describe();
  for (const key of ['sunIntensity', 'ambientIntensity', 'hemiIntensity', 'exposure', 'sunColor', 'sunPosition']) {
    assertEqual(JSON.stringify(after[key]), JSON.stringify(before[key]), `读取后 ${key} 不得变化`);
  }
  assertEqual(JSON.stringify(after.background), JSON.stringify(before.background), '背景口径应稳定（不随时间变化）');
  assertEqual(JSON.stringify(exposed), JSON.stringify(exposedBefore), '不得触发 setExposure/setBloom 等渲染侧调用');
  assertEqual(JSON.stringify(after.fog), JSON.stringify(before.fog), '雾参数不得被读取动作改变');
  runner.info('只读性：sun/ambient/hemi/exposure/sunColor/背景/雾 逐值不变，且未触发渲染适配器');
});

await runner.test('说明文档口径：toneMapped=false / 清屏色不受曝光影响（字段本身携带该说明）', () => {
  const { environment } = makeEnv();
  const bg = environment.describe().background;
  assertEqual(bg.toneMapped, false, '清屏色不受色调映射');
  assert(/清屏色不受曝光/.test(bg.note), `note 应写明不受曝光/色调映射影响：${bg.note}`);
  assert(Number.isFinite(bg.exposure), '应同时报告当前预设曝光值（便于工具判断是否需要补偿）');
});

/* ========================================================================== */
runner.section('4. 报告接线（?stats=1 → compactReport）');
/* ========================================================================== */

/**
 * 接线硬断言（t47）：`?stats=1` 的 DOM `<pre id="palace-stats-json">` 由 `compactReport()` 生成，
 * 而 `scripts/shot.mjs:977` 正是从该节点解析 JSON ⇒ 这 8 个字段必须出现在 `compactReport()` 返回体里。
 * 这里静态校验"字段存在 + 取值路径指向 environment.describe().background 的同名口径"。
 */
const WIRED_FIELDS = Object.freeze({
  backgroundColorHex: 'hex',
  backgroundColorLinear: 'linear',
  backgroundColorSpace: 'outputColorSpace',
  backgroundToneMapped: 'toneMapped',
  backgroundRole: 'role',
  fogColorHex: 'fog?.hex',
  fogNear: 'fog?.near',
  fogFar: 'fog?.far',
  // t48：配置值 vs 实际落屏值 + Δ + 输出链 + 候选
  backgroundConfiguredHex: 'configured',
  backgroundDisplayedKind: 'displayed',
  backgroundDisplayedTopHex: 'displayed',
  backgroundDisplayedHorizonHex: 'displayed',
  backgroundDisplayedTopSrgb255: 'displayed',
  backgroundDisplayedHorizonSrgb255: 'displayed',
  backgroundDisplayedToneMapped: 'displayed',
  backgroundDeltaMaxAbs: 'delta',
  backgroundDeltaConfigVsSkyTop: 'delta',
  backgroundDeltaConfigVsSkyHorizon: 'delta',
  backgroundCandidates: 'candidates',
});

await runner.test('compactReport() 已接线 8 个背景/雾字段（?stats=1 的 DOM 报告）', () => {
  const mainPath = join(ROOT, 'src', 'main.js');
  assert(existsSync(mainPath), 'src/main.js 应存在');
  const main = readFileSync(mainPath, 'utf8');
  const start = main.indexOf('function compactReport()');
  assert(start >= 0, 'src/main.js 应包含 compactReport()');
  const compact = main.slice(start, start + 4000);
  for (const [field, path] of Object.entries(WIRED_FIELDS)) {
    assert(new RegExp(`${field}\\s*:`).test(compact), `compactReport() 应包含字段 ${field}`);
    const fromEnv = new RegExp(`${field}\\s*:\\s*env\\.background`).test(compact);
    const fromChain = new RegExp(`${field}\\s*:\\s*renderSystem\\.describeOutputChain`).test(compact);
    assert(fromEnv || fromChain, `${field} 应取自 env.background / renderSystem 输出链（paths=${path}）`);
  }
  assert(/backgroundOutputChain\s*:\s*renderSystem\.describeOutputChain/.test(compact), 'backgroundOutputChain 应取自 renderSystem.describeOutputChain()');
  // 与 environment 侧口径一致：这些取值路径必须在 describe().background 里真的存在
  const { environment } = makeEnv();
  const bg = environment.describe().background;
  const required = ['hex', 'linear', 'outputColorSpace', 'toneMapped', 'role'];
  for (const key of required) assert(key in bg, `environment.describe().background 应含 ${key}（供 compactReport 取值）`);
  for (const key of ['hex', 'near', 'far']) assert(bg.fog && key in bg.fog, `background.fog 应含 ${key}`);
  runner.info(`接线：${Object.keys(WIRED_FIELDS).join(' / ')}（均取自 env.background.*，与 describe().background 同口径）`);
});

await runner.test('接线后报告值 = 同口径实测值（LIVE：从 <pre id="palace-stats-json"> 实读，含切预设同步）', () => {
  if (!process.env.CORE_STATS_LIVE) {
    runner.skip(
      'CORE_STATS_LIVE 未设置 → 跳过浏览器实读（默认快模式校验字段与取值路径）',
      '需要强证据时运行：CORE_STATS_LIVE=1 node tests/core-stats.test.mjs（两次 shot.mjs，~1.5 分钟）',
    );
    return;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'core-stats-live-'));
  // CLI 时辰别名（golden|dusk|night）与报告里的 state 预设 id（goldenHour|sunset|moonlitNight）不同
  const read = (cliPreset, statePreset) => {
    const proc = spawnSync(
      process.execPath,
      ['scripts/shot.mjs', '--view=oblique', `--preset=${cliPreset}`, `--out-dir=${outDir}`, '--keep-invalid'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000 },
    );
    assertEqual(proc.status, 0, `${cliPreset}: shot.mjs 应 exit 0（${(proc.stderr ?? '').slice(0, 200)}）`);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
    const row = (manifest.browserReports ?? []).find((r) => r.preset === statePreset || r.name?.includes(cliPreset));
    assert(row, `${cliPreset}: 应从 shot.mjs 的 manifest.browserReports 读到 DOM 报告（shot.mjs:977 解析 <pre id="palace-stats-json">）`);
    return row;
  };
  const golden = read('golden', 'goldenHour');
  for (const field of Object.keys(WIRED_FIELDS)) {
    assert(field in golden, `${field} 应出现在 DOM 报告里（实际字段：${Object.keys(golden).slice(0, 12).join(',')}…）`);
  }
  const { environment } = makeEnv();
  environment.applyPreset('goldenHour');
  const expectedGolden = environment.describe().background;
  assertEqual(golden.backgroundColorHex, expectedGolden.hex, 'golden 背景 hex 应与 environment 侧同口径一致');
  assertEqual(golden.fogColorHex, expectedGolden.fog.hex, 'golden 雾色应与 environment 侧一致');
  assertEqual(golden.backgroundToneMapped, expectedGolden.toneMapped, 'toneMapped 应为 false');
  assertEqual(golden.backgroundColorSpace, expectedGolden.outputColorSpace, '色彩空间应为 srgb');
  assertEqual(golden.fogNear, expectedGolden.fog.near, '雾 near 应一致');
  assertEqual(golden.fogFar, expectedGolden.fog.far, '雾 far 应一致');

  const night = read('night', 'moonlitNight');
  environment.applyPreset('moonlitNight');
  const expectedNight = environment.describe().background;
  assertEqual(night.backgroundColorHex, expectedNight.hex, 'night 背景 hex 应与 environment 侧一致');
  assert(night.backgroundColorHex !== golden.backgroundColorHex, '切预设后报告里的背景色必须同步变化');
  assert(night.fogColorHex !== golden.fogColorHex, '切预设后雾色必须同步变化');
  runner.info(`LIVE golden: ${golden.backgroundColorHex} / 雾 ${golden.fogColorHex} (${golden.fogNear}–${golden.fogFar})`);
  runner.info(`LIVE night : ${night.backgroundColorHex} / 雾 ${night.fogColorHex} (${night.fogNear}–${night.fogFar})`);
});

await runner.test('renderer 侧同样暴露同一口径（供 __PALACE__.stats().render 消费）', async () => {
  const { describeBackgroundExport } = await Promise.resolve({});
  void describeBackgroundExport;
  const rendererSource = readFileSync(join(ROOT, 'src', 'core', 'renderer.js'), 'utf8');
  assert(/function describeBackground\(\)/.test(rendererSource), 'renderer.js 应导出 describeBackground()');
  assert(/background: describeBackground\(\)/.test(rendererSource), 'getStats() 应包含 background 字段');
  assert(/describeBackground,/.test(rendererSource) || /describeBackground$/.test(rendererSource), 'API 应暴露 describeBackground');
  assert(/source: 'scene\.background'/.test(rendererSource), 'renderer 侧 source 应标明 scene.background');
  runner.info('renderer.getStats().background 与 environment.describe().background 同口径（均来自 scene.background）');
});

/* ========================================================================== */
runner.section('5. 配置值 vs 实际落屏值（t48：Δ 归因）');
/* ========================================================================== */

const distMax = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
/** 点到"天空渐变带"（top↔horizon 线段）的距离（t 网格采样）。 */
function distToSkyBand(pixel, top, horizon) {
  let best = Infinity;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const q = top.map((v, i) => Math.round(v + (horizon[i] - v) * t));
    best = Math.min(best, distMax(pixel, q));
  }
  return best;
}

await runner.test('background 同时给出「配置清屏色」与「实际落屏（天空渐变）」并各自标注语义', () => {
  const { environment } = makeEnv();
  const bg = environment.describe().background;
  for (const key of ['configured', 'displayed', 'delta', 'candidates', 'semantics']) assert(key in bg, `describe().background 应含 ${key}`);
  assert(HEX_RE.test(bg.configured.hex), 'configured.hex 应为合法颜色');
  assert(typeof bg.configured.semantic === 'string' && /清屏色/.test(bg.configured.semantic), 'configured 应标注"配置清屏色"语义');
  assertEqual(bg.displayed.kind, 'sky-gradient', 'displayed.kind 应为 sky-gradient（实机落屏的是天空网格渐变）');
  assert(HEX_RE.test(bg.displayed.topHex) && HEX_RE.test(bg.displayed.horizonHex), 'displayed 两端色应为合法颜色');
  assertEqual(bg.displayed.toneMapped, false, '天空网格 toneMapped:false ⇒ 落屏值不经色调映射/曝光');
  assert(bg.displayed.semantic && /实际落屏/.test(bg.displayed.semantic), 'displayed 应标注"实际落屏"语义');
  runner.info(`night：配置 ${bg.configured.hex} → 落屏带 ${bg.displayed.topHex}↔${bg.displayed.horizonHex}（toneMapped=${bg.displayed.toneMapped}）`);
});

await runner.test('Δ 可复核：delta.maxAbs = |配置颜色 − 天空渐变端点| 的逐通道最大差', () => {
  const { environment } = makeEnv();
  for (const preset of ['goldenHour', 'sunset', 'moonlitNight']) {
    environment.applyPreset(preset);
    const bg = environment.describe().background;
    const dTop = distMax(bg.configured.srgb255, bg.displayed.topSrgb255);
    const dHorizon = distMax(bg.configured.srgb255, bg.displayed.horizonSrgb255);
    assertEqual(bg.delta.configVsSkyTop, dTop, `${preset} configVsSkyTop 应等于复算值`);
    assertEqual(bg.delta.configVsSkyHorizon, dHorizon, `${preset} configVsSkyHorizon 应等于复算值`);
    assertEqual(bg.delta.maxAbs, Math.max(dTop, dHorizon), `${preset} maxAbs 应为两端最大差`);
    assert(bg.delta.maxAbs > 0, `${preset}: 配置色与落屏色必须是两个不同的量（Δ>0，否则说明该场景两者重合）`);
    assert(/Δ=/.test(bg.delta.note), 'delta 应带口径说明');
    runner.info(`${preset}: 配置 ${bg.configured.hex} vs 落屏带 ${bg.displayed.topHex}↔${bg.displayed.horizonHex} ⇒ Δ(top)=${dTop} Δ(horizon)=${dHorizon} maxAbs=${bg.delta.maxAbs}`);
  }
});

await runner.test('落屏带与 t45 的天空端点一致；候选表覆盖 clear-color / sky-top / sky-horizon / fog', () => {
  const { environment } = makeEnv();
  for (const preset of ['goldenHour', 'sunset', 'moonlitNight']) {
    environment.applyPreset(preset);
    const bg = environment.describe().background;
    assertEqual(bg.displayed.topHex, bg.skyTopHex, `${preset} 落屏带上端应等于天空顶色`);
    assertEqual(bg.displayed.horizonHex, bg.skyHorizonHex, `${preset} 落屏带下端应等于天空地平色`);
  }
  const names = environment.describe().background.candidates.map((c) => c.name);
  for (const want of ['clear-color(configured)', 'sky-top(displayed)', 'sky-horizon(displayed)', 'fog']) {
    assert(names.includes(want), `候选表应含 ${want}（实际 ${names.join(', ')}）`);
  }
  for (const c of environment.describe().background.candidates) {
    if (c.hex) assert(HEX_RE.test(c.hex), `候选 ${c.name} 的 hex 应合法`);
  }
});

await runner.test('切预设后「配置值」与「落屏值」同步变化', () => {
  const { environment } = makeEnv();
  const seen = new Map();
  for (const preset of ['goldenHour', 'sunset', 'moonlitNight']) {
    environment.applyPreset(preset);
    const bg = environment.describe().background;
    const key = `${bg.configured.hex}|${bg.displayed.topHex}|${bg.displayed.horizonHex}`;
    assert(!seen.has(key), `不同预设的配置/落屏组合不应相同（${preset} 与 ${seen.get(key)} 相撞）`);
    seen.set(key, preset);
  }
  assertEqual(seen.size, 3, '三时辰配置+落屏组合应互不相同');
  runner.info(`同步变化：${[...seen.entries()].map(([k, v]) => `${v}=${k.split('|')[0]}`).join(' · ')}`);
});

await runner.test('LIVE 校验：工具像素法取到的背景像素落在「落屏带」内，且**不**落在配置清屏色上（CORE_STATS_LIVE=1）', () => {
  if (!process.env.CORE_STATS_LIVE) {
    runner.skip(
      'CORE_STATS_LIVE 未设置 → 跳过像素级验证（默认快模式校验字段与 Δ 复算）',
      '需要强证据时运行：CORE_STATS_LIVE=1 node tests/core-stats.test.mjs',
    );
    return;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'core-stats-displayed-'));
  const runPreset = (cliPreset, statePreset) => {
    const proc = spawnSync(
      process.execPath,
      ['scripts/shot.mjs', '--view=oblique', `--preset=${cliPreset}`, `--out-dir=${outDir}`, '--keep-invalid'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000 },
    );
    assertEqual(proc.status, 0, `${cliPreset}: shot.mjs 应 exit 0`);
    const output = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
    const row = (manifest.browserReports ?? []).find((r) => r.preset === statePreset);
    assert(row, `${statePreset}: 应能从 DOM 报告读到字段`);
    const pixel = /像素法交叉校验：rgb\((\d+),(\d+),(\d+)\)/.exec(output);
    assert(pixel, `${statePreset}: 应能从 shot 输出解析工具像素法背景色（${output.slice(-200)}）`);
    return { row, pixelRgb: [Number(pixel[1]), Number(pixel[2]), Number(pixel[3])] };
  };
  const { environment } = makeEnv();
  for (const [cliPreset, statePreset] of [['golden', 'goldenHour'], ['night', 'moonlitNight']]) {
    const { row, pixelRgb } = runPreset(cliPreset, statePreset);
    environment.applyPreset(statePreset);
    const bg = environment.describe().background;
    const dBand = distToSkyBand(pixelRgb, bg.displayed.topSrgb255, bg.displayed.horizonSrgb255);
    const dConfigured = distMax(pixelRgb, bg.configured.srgb255);
    assert(dBand <= 3, `${statePreset}: 工具像素法背景 rgb(${pixelRgb}) 应落在落屏带内（到带距离 ${dBand} > 3）`);
    assert(dConfigured >= dBand, `${statePreset}: 配置清屏色不应比落屏带更匹配（dConfig=${dConfigured} < dBand=${dBand}）`);
    assertEqual(row.backgroundDisplayedTopHex, bg.displayed.topHex, `${statePreset}: DOM 报告的落屏带上端应与 environment 同口径`);
    assertEqual(row.backgroundDeltaMaxAbs, bg.delta.maxAbs, `${statePreset}: DOM 报告的 Δ 应与 environment 同口径`);
    runner.info(`LIVE ${statePreset}: 像素 rgb(${pixelRgb}) → 到落屏带 ${dBand} / 到配置色 ${dConfigured} ⇒ 用落屏带匹配`);
  }
});

/* ========================================================================== */
runner.section('6. 真天空掩码（t50：终结"用像素猜天空"）');
/* ========================================================================== */

const MAIN_SRC = () => readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');
const RENDERER_SRC = () => readFileSync(join(ROOT, 'src', 'core', 'renderer.js'), 'utf8');

/** 解 PNG（8-bit RGB/RGBA，filter 0–4）→ { width, height, bpp, data }（测试内自用）。 */
function decodePng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let w = 0;
  let h = 0;
  let ct = 6;
  let bd = 8;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    if (type === 'IDAT') idat.push(d);
    pos += 12 + len;
  }
  const ch = ct === 2 ? 3 : ct === 6 ? 4 : ct === 0 ? 1 : 3;
  const bpp = ch * (bd / 8);
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y += 1) {
    const f = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += Math.floor((a + b) / 2);
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  return { width: w, height: h, bpp, data: out };
}

/** 统计 PNG 的颜色/占比（二值校验用）。 */
function pngStats(path) {
  const img = decodePng(path);
  const colors = new Map();
  let white = 0;
  let pure = 0;
  for (let i = 0; i < img.data.length; i += img.bpp) {
    const key = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
    colors.set(key, (colors.get(key) ?? 0) + 1);
    if (img.data[i] > 127) white += 1;
    if ((img.data[i] === 0 || img.data[i] === 255)) pure += 1;
  }
  const total = img.width * img.height;
  return { width: img.width, height: img.height, colors: colors.size, whiteShare: +(white / total).toFixed(5), pureShare: +(pure / total).toFixed(5) };
}

await runner.test('t56 PNG 编码器（模块级纯函数）：二值像素 → 合法 PNG → 解回逐像素一致', async () => {
  const rendererModule = await loadModule('src/core/renderer.js');
  assertEqual(typeof rendererModule.encodePngBase64, 'function', 'encodePngBase64 应为模块级导出');
  const w = 8;
  const h = 4;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const v = x < 3 ? 255 : 0; // 前 3 列白（天空）、其余黑
      rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v; rgba[i + 3] = 255;
    }
  }
  const base64 = rendererModule.encodePngBase64(w, h, rgba);
  const buf = Buffer.from(base64, 'base64');
  assertEqual(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG 签名应合法');
  assertEqual(buf.readUInt32BE(16), w, 'IHDR 宽度');
  assertEqual(buf.readUInt32BE(20), h, 'IHDR 高度');
  assertEqual(buf[24], 8, 'bit depth 应为 8');
  assertEqual(buf[25], 2, 'color type 应为 2（RGB）');
  assertEqual(buf[28], 0, '不应交错');
  const tmp = join(mkdtempSync(join(tmpdir(), 'core-stats-png-')), 'synthetic.png');
  writeFileSync(tmp, buf);
  const stats = pngStats(tmp);
  assertEqual(stats.colors, 2, `解码后应恰为 2 色（实际 ${stats.colors}）`);
  assertEqual(stats.whiteShare, 3 / 8, `白占比应为 3/8（实际 ${stats.whiteShare}）`);
  assertEqual(stats.pureShare, 1, '应为 100% 纯黑/纯白（无插值/无压缩失真）');
  const decoded = decodePng(tmp);
  assertEqual(decoded.width, w);
  assertEqual(decoded.height, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (y * w + x) * 4;
      const dst = (y * w + x) * decoded.bpp;
      assertEqual(decoded.data[dst], rgba[src], `(${x},${y}) R 应逐像素一致`);
    }
  }
  runner.info(`编码器：${w}x${h} → PNG ${buf.length}B / base64 ${base64.length} 字符；解回逐像素一致、恰 2 色`);
});

await runner.test('environment 暴露天空网格（掩码源）：半径 4200、BackSide、frustumCulled=false、toneMapped=false', () => {
  const { environment } = makeEnv();
  assert(typeof environment.skyMesh === 'function', 'environment 应暴露 skyMesh()');
  const sky = environment.skyMesh();
  assert(sky && sky.isMesh, 'skyMesh() 应返回 THREE.Mesh');
  assertEqual(sky.frustumCulled, false, '天空球不得被视锥剔除（否则掩码会出现空洞）');
  assertEqual(sky.material.toneMapped, false, '天空材质 toneMapped:false（掩码白不参与色调映射）');
  assertEqual(sky.material.side, THREE.BackSide, '天空球应为 BackSide');
  const radius = sky.geometry?.parameters?.radius;
  assertEqual(radius, 4200, '天空球半径应为 4200');
  runner.info(`天空网格：${sky.name}｜radius=${radius}｜side=BackSide｜toneMapped=false｜frustumCulled=false`);
});

await runner.test('渲染器实现"两遍掩码"：黑遮罩写深度 + 白色天空 depthTest 落白（并恢复现场）', () => {
  const src = RENDERER_SRC();
  for (const needle of ['function configureSkyMask(', 'function renderSkyMaskFrame(', 'function computeSkyShare(', 'function skyMaskInfo(', 'function applySkyMaskPasses(']) {
    assert(src.includes(needle), `renderer.js 应实现 ${needle}）`);
  }
  // 合规要点（守"唯一渲染内核"静态守卫）：不新建 Scene / 不新建相机 / 不自行 scene.add
  assert(!/new THREE\.Scene\s*\(/.test(src), 'renderer.js 不得新建 Scene（唯一渲染内核守卫）');
  assert(!/new THREE\.(Perspective|Orthographic)Camera\s*\(/.test(src), 'renderer.js 不得新建相机（守卫）');
  assert(!/scene\.add\s*\(/.test(src), 'renderer.js 不得自行 scene.add（守卫；由 main.js 挂载）');
  assert(/camera\.layers\.set\(SKY_MASK_LAYER\)/.test(src), '隔离渲染应通过相机图层实现（无需第二场景/相机）');
  assert(/overrideMaterial = skyMask\.black/.test(src), '黑遮罩遍应以 overrideMaterial 把几何涂黑');
  assert(/targetScene\.background = null/.test(src), '掩码期间必须临时置 null 背景色（Color 背景会强制清屏、擦掉白掩码）');
  assert(/skyMask\.source\.visible = false/.test(src), '黑遮罩遍必须临时隐藏真实天空球（否则它被涂黑盖掉白掩码）');
  assert(/overrideMaterial = prevOverride/.test(src) && /autoClear = prevAutoClear/.test(src) && /setClearColor\(prevClear, prevAlpha\)/.test(src) && /background = prevBackground/.test(src),
    '两遍后必须恢复 overrideMaterial/autoClear/清屏色/背景色（不得污染正常路径）');
  assert(/poseKey/.test(src), 'skyShare 应有位姿键（换视角/换机位即重算，不返回过期缓存）');
  // t53：极性 probe 必须从**同一个 RT 缓冲**取样，且明确"绝不假定 white=sky"
  assert(/function readSkyMaskShare\(/.test(src) && /sampleAt\(Math\.floor\(width \/ 2\), 2\)/.test(src), '极性 probe 应从同一 RT 缓冲取顶中部样本（readSkyMaskShare）');
  assert(/skyMask\.quad/.test(src) && /quadMaterial/.test(src), '画布掩码应由单次 blit 四边形写出（避免半帧撕裂）');
  assert(/skyAtProbe =/.test(src), '天空色应由 probe 判定（不得写死 white=sky）');
  assert(/禁止假定 white=sky/.test(src), '口径文案应明确"禁止假定 white=sky"');
  assert(/shareByColor/.test(src), '应给出 shareByColor（哪种颜色占比等于 skyShare）供无天空视角互校');
  assert(/export function encodePngBase64\(/.test(src), 'PNG 编码器应为模块级导出（可在 Node 内单测）');
  assert(/function skyMaskPng\(/.test(src) && /pngKey/.test(src), 'skyMaskPng 应有位姿键缓存（同一位姿不重复编码）');
  runner.info('掩码实现：black-override+depth → white-sky(depthTest) → 无 MSAA RT → 1:1 blit；现场恢复齐全');
});

await runner.test('main.js 接线：?mask=sky 分支 + 报告字段 + API（且不叠可见 UI 面板）', () => {
  const src = MAIN_SRC();
  assert(/mask: params\.get\('mask'\)/.test(src), 'parseQuery 应解析 mask 参数');
  const branches = src.match(/query\.mask === 'sky'/g) ?? [];
  assert(branches.length >= 3, `mask 分支应覆盖主循环 + shot 同步路径 + 面板抑制（实际 ${branches.length} 处）`);
  assert(/renderSystem\.configureSkyMask/.test(src), 'main.js 应把天空网格交给渲染器');
  assert(/skyMaskMode: query\.mask/.test(src), '报告应含 skyMaskMode');
  assert(/skyShare: s\.skyMask\?\.share/.test(src), '报告应含 skyShare');
  assert(/skyMask: \{/.test(src), '应暴露 __PALACE__.skyMask 诊断入口');
  // t53：极性自证字段（禁止假定 white=sky）
  assert(/skyMaskSkyFromProbe: s\.skyMask\?\.polarity\?\.skyFromProbe/.test(src), '报告应含 skyMaskSkyFromProbe（极性自证）');
  assert(/skyMaskPolarityConsistent: s\.skyMask\?\.polarity\?\.consistent/.test(src), '报告应含 skyMaskPolarityConsistent');
  assert(/skyMaskProbe: s\.skyMask\?\.polarity\?\.probe/.test(src), '报告应含 skyMaskProbe（取样点）');
  // t56：同一加载内取图（data URL），且必须在 ready 之后写入
  assert(/skyMaskPngBase64: maskPngInfo\?\.base64/.test(src), '报告应含 skyMaskPngBase64');
  assert(/if \(ready\) \{/.test(src) && /renderSystem\.skyMaskPng\?\.\(\)/.test(src), 'skyMaskPng 只应在 ready 之后编码（不阻塞就绪信号）');
  assert(/skyMaskPngSize: maskPngInfo\?\.size/.test(src) && /skyMaskPngShareByColor: maskPngInfo\?\.shareByColor/.test(src), '应同时上报掩码 data URL 的尺寸与逐色占比');
  assert(/if \(query\.mask === 'sky'\) return null;/.test(src), '掩码模式不应叠可见统计面板（否则面板底色污染掩码）');
  runner.info('接线：parseQuery.mask / 3 处 mask 分支 / configureSkyMask / skyMaskMode+skyShare / __PALACE__.skyMask');
});

await runner.test('diagnoseSkyMask 口径：白=天空、黑=其余、二值、保守（透明按遮挡）', () => {
  const src = RENDERER_SRC();
  assert(/colors: \{ sky: '#ffffff', other: '#000000' \}/.test(src), '口径应写明白/黑');
  assert(/binary: true/.test(src), '应标注 binary:true');
  assert(/binaryOutput/.test(src), '应说明二值输出方式（无 MSAA + 1:1 blit）');
  assert(/透明\/粒子对象在掩码里按"遮挡"处理/.test(src), '应写明透明/粒子的保守处理');
  runner.info('口径：白=天空 / 黑=其余（几何遮挡计入黑）；二值；透明/粒子按遮挡（不会高估天空）');
});

/** 掩码 PNG 解码（只统计白/黑与唯一色数）。 */
function decodeMaskPng(path) {
  const buf = readFileSync(path); let pos = 8, w = 0, h = 0, ct = 6, bd = 8; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    if (type === 'IDAT') idat.push(d);
    pos += 12 + len;
  }
  const ch = ct === 2 ? 3 : ct === 6 ? 4 : 1; const bpp = ch * (bd / 8); const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat)); const out = Buffer.alloc(h * stride); let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++]; const line = raw.subarray(rp, rp + stride); rp += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += Math.floor((a + b) / 2);
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  const colors = new Map(); let white = 0; let pure = 0;
  for (let i = 0; i < out.length; i += bpp) {
    const key = `${out[i]},${out[i + 1]},${out[i + 2]}`;
    colors.set(key, (colors.get(key) ?? 0) + 1);
    if (out[i] > 127) white += 1;
    if ((out[i] === 0 && out[i + 1] === 0 && out[i + 2] === 0) || (out[i] === 255 && out[i + 1] === 255 && out[i + 2] === 255)) pure += 1;
  }
  return { width: w, height: h, colors: colors.size, topColors: [...colors.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k), pureShare: +(pure / (w * h)).toFixed(4), whiteShare: +(white / (w * h)).toFixed(4) };
}

await runner.test('LIVE：掩码图真二值（仅 #ffffff/#000000），占比随视角变化，且与报告 skyShare 一致（CORE_STATS_LIVE=1）', async () => {
  if (!process.env.CORE_STATS_LIVE) {
    runner.skip(
      'CORE_STATS_LIVE 未设置 → 跳过掩码实拍（默认快模式校验实现与接线）',
      '需要强证据时运行：CORE_STATS_LIVE=1 node tests/core-stats.test.mjs（网格 4 次浏览器：2 视角 × 掩码/常规）',
    );
    return;
  }
  const shot = await loadModule('scripts/shot.mjs');
  const browser = shot.findBrowser();
  const variant = shot.resolveGlVariants('disable-gpu')[0];
  const server = shot.createStaticServer({ root: ROOT, port: 0 });
  const port = await server.listen(0);
  const base = `http://127.0.0.1:${port}/`;
  const outDir = mkdtempSync(join(tmpdir(), 'core-stats-sky-mask-'));
  const capture = async (view, { mask = true } = {}) => {
    const png = join(outDir, `${view}${mask ? '-mask' : '-normal'}.png`);
    const url = `${base}index.html?view=${view}&preset=night&ui=0&shot=1&stats=1${mask ? '&mask=sky' : ''}`;
    const args = shot.browserArgs({ browser: browser.path, screenshotPath: png, url, glVariant: variant });
    const res = await shot.runBrowser(browser.path, args, 60000);
    assertEqual(res.status ?? res.code ?? 0, 0, `${view}${mask ? '(mask)' : ''}: 浏览器应正常退出`);
    assert(existsSync(png), `${view}: 应产出截图`);
    const domArgs = shot.browserArgs({ browser: browser.path, screenshotPath: null, url, glVariant: variant, extraArgs: ['--dump-dom'] });
    const domRes = await shot.runBrowser(browser.path, domArgs, 60000);
    const m = /<pre id="palace-stats-json"[^>]*>([\s\S]*?)<\/pre>/.exec(domRes.stdout ?? '');
    let report = null;
    if (m) {
      try {
        report = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
      } catch (error) {
        assert(false, `${view}: DOM 报告解析失败：${error.message}`);
      }
    }
    return { png, report };
  };
  try {
    const shares = {};
    let sharesFirstOblique = null;
    for (const view of ['oblique', 'interior']) {
      const { png, report } = await capture(view, { mask: true });
      // t56：**同一次 --dump-dom 内**取回的掩码 data URL（与位姿/位姿同源，无需第二次页面加载）
      assert(report.skyMaskPngBase64, `${view}: 报告应含 skyMaskPngBase64`);
      assert(report.skyMaskPngSize === '360x225', `${view}: skyMaskPngSize 应为 360x225（实际 ${report.skyMaskPngSize}）`);
      assertEqual(report.skyMaskPngSourceSize, report.skyMaskSampleSize, `${view}: data URL 的来源尺寸应等于掩码 RT 尺寸`);
      const dataUrlPng = join(outDir, `${view}-report-mask.png`);
      writeFileSync(dataUrlPng, Buffer.from(report.skyMaskPngBase64, 'base64'));
      const dataStats = pngStats(dataUrlPng);
      assertEqual(dataStats.colors, 2, `${view}: 报告内 data URL 应恰为 2 色（实际 ${dataStats.colors}）`);
      assert(dataStats.pureShare >= 0.99, `${view}: data URL 二值纯度应 ≥99%（实际 ${(dataStats.pureShare * 100).toFixed(2)}%）`);
      assertEqual(dataStats.width, 360, `${view}: data URL 宽度应为 360`);
      assertEqual(dataStats.height, 225, `${view}: data URL 高度应为 225`);
      // 极性规则：占比等于 skyShare 的颜色即天空色
      const whiteMatches = Math.abs(dataStats.whiteShare - report.skyShare) <= 0.02;
      const blackMatches = Math.abs(1 - dataStats.whiteShare - report.skyShare) <= 0.02;
      assert(whiteMatches !== blackMatches, `${view}: data URL 的某一色占比应等于 skyShare（白 ${dataStats.whiteShare} vs skyShare ${report.skyShare}）`);
      assertEqual(report.skyMaskPngShareByColor?.white, dataStats.whiteShare, `${view}: 报告内 shareByColor.white 应等于解码实测白占比`);
      runner.info(`LIVE ${view} data URL: ${dataStats.width}x${dataStats.height} 唯一色 ${dataStats.colors}、白 ${dataStats.whiteShare}、skyShare ${report.skyShare}、纯度 ${(dataStats.pureShare * 100).toFixed(2)}%`);
      const mask = decodeMaskPng(png);
      // 掩码 = 纯白(天空) + 纯黑(其余) 两种主色 + 极少量 MSAA 边缘过渡色 ⇒ 阈值化即二值
      const pureShare = mask.pureShare ?? 0;
      assert(pureShare >= 0.99, `${view}: 纯黑/纯白像素占比应 ≥99%（实际 ${(pureShare * 100).toFixed(2)}%，唯一色 ${mask.colors} 种）`);
      assert(mask.whiteShare > 0.001 && mask.whiteShare < 0.999, `${view}: 掩码应同时含白与黑（白占比 ${mask.whiteShare}）`);
      for (const c of mask.topColors.slice(0, 2)) assert(c === '0,0,0' || c === '255,255,255', `${view}: 前两位主色应为纯黑/纯白（实际 ${c}）`);
      assert(report, `${view}: 应能读到 DOM 报告`);
      assertEqual(report.skyMaskMode, 'sky', `${view}: 报告 skyMaskMode 应为 sky`);
      assert(Number.isFinite(report.skyShare) && report.skyShare >= 0 && report.skyShare <= 1, `${view}: skyShare 应为 0–1 比例（实际 ${report.skyShare}）`);
      assert(Math.abs(report.skyShare - mask.whiteShare) <= 0.02, `${view}: 报告 skyShare(${report.skyShare}) 应与截图掩码白占比(${mask.whiteShare}) 一致（±0.02）`);
      // t53：极性自证 + 取样点与文档一致（禁止假定 white=sky：以 probe 判定，并与图像取样交叉校验）
      assert(report.skyMaskSkyColor === '#ffffff', `${view}: 报告 skyMaskSkyColor 应为 #ffffff（当前实现）`);
      // t53：极性规则 —— 有天空视角 topCenter 应为天空色；无天空视角（内景）topCenter 本就是 otherColor
      const expectAtProbe = view === 'interior' ? 'black' : 'white';
      assertEqual(report.skyMaskSkyAtProbe, expectAtProbe, `${view}: 顶中部 probe 应为 ${expectAtProbe}（实际 ${report.skyMaskSkyAtProbe}）`);
      assertEqual(report.skyMaskPolarityConsistent, true, `${view}: probe 应给出确定颜色（consistent=true）`);
      // 工具规则的核心：哪种颜色的占比等于 skyShare，哪种就是天空色（禁止假定 white=sky）
      const byColor = report.skyMaskShareByColor;
      assert(byColor && Math.abs(byColor.white - report.skyShare) <= 1e-4, `${view}: shareByColor.white 应等于 skyShare`);
      assert(Math.abs(byColor.black - (1 - report.skyShare)) <= 1e-4, `${view}: shareByColor.black 应等于 1-skyShare`);
      // 决定性规则（视角无关）：**哪种颜色在掩码图里的占比等于 skyShare，哪种就是天空色**
      const shotWhiteMatches = Math.abs(mask.whiteShare - report.skyShare) <= 0.02;
      const shotBlackMatches = Math.abs(1 - mask.whiteShare - report.skyShare) <= 0.02;
      assert(shotWhiteMatches !== shotBlackMatches, `${view}: 必须恰有一种颜色的占比等于 skyShare（白 ${mask.whiteShare} / 黑 ${(1 - mask.whiteShare).toFixed(4)} vs skyShare ${report.skyShare}）`);
      const skySide = shotWhiteMatches ? 'white' : 'black';
      assertEqual(skySide, 'white', `${view}: 当前实现的天空色应为白（由 skyShare 反推得到，不靠假定）`);
      // probe 只用于"有天空视角"的 sanity check：顶中部应等于天空色；内景等无天空视角顶中部等于 otherColor
      const probeIsSky = view !== 'interior';
      assertEqual(report.skyMaskSkyAtProbe, probeIsSky ? 'white' : 'black', `${view}: probe 取值应与视角语义一致`);
      assertEqual(mask.colors, 2, `${view}: 单次 blit 后掩码应为严格二值（唯一色 ${mask.colors}）`);
      assert(report.skyMaskProbe && report.skyMaskProbe.topCenter, `${view}: 报告应含取样点`);
      const topPixel = mask.topLeftPixel ?? null;
      if (view === 'oblique') {
        assert(mask.whiteShare > 0.5, `oblique: 天空应占多数（白占比 ${mask.whiteShare}）`);
      } else {
        assert(mask.whiteShare < 0.05, `interior: 内景几乎无天空（白占比 ${mask.whiteShare}）`);
      }
      shares[view] = report.skyShare;
      if (view === 'oblique') sharesFirstOblique = report.skyMaskPngShareByColor;
      runner.info(`LIVE ${view}: 掩码白=${(mask.whiteShare * 100).toFixed(2)}%、唯一色=${mask.colors}、报告 skyShare=${report.skyShare}`);
    }
    assert(shares.oblique > shares.interior, `掩码占比应随视角变化：oblique(${shares.oblique}) > interior(${shares.interior})`);
    // t56：同一视角连续两次 dump（不做任何截图/第二次加载取掩码）→ 掩码与 skyShare 必须逐值一致
    const again = await capture('oblique', { mask: true });
    assertEqual(again.report.skyMaskPngShareByColor?.white, sharesFirstOblique?.white, '连续两次运行的 data URL 白占比应逐值一致');
    assertEqual(again.report.skyShare, shares.oblique, '连续两次运行的 skyShare 应逐值一致');
    runner.info(`LIVE 复用性：两次 dump 的 data URL 白占比 ${again.report.skyMaskPngShareByColor?.white} / skyShare ${again.report.skyShare}（逐值一致）`);
    // 常规模式（无 mask）必须不受影响：干净退出 + 报告里 skyMaskMode 为空
    const normal = await capture('oblique', { mask: false });
    assertEqual(normal.report?.skyMaskMode ?? null, null, '常规模式报告不应出现 skyMaskMode=sky');
    const normalMask = decodeMaskPng(normal.png);
    assert(normalMask.colors > 100, `常规出图应仍是彩色画面（实际唯一色 ${normalMask.colors}）`);
    runner.info(`常规模式对照：唯一色 ${normalMask.colors}（彩色画面）、skyMaskMode=${normal.report?.skyMaskMode ?? 'null'}`);
  } finally {
    await server.close();
  }
});

/* ========================================================================== */

process.exit(runner.summary());
