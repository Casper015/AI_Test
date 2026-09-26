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
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

process.exit(runner.summary());
