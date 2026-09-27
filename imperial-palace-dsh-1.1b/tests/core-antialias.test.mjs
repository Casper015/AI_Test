#!/usr/bin/env node
/**
 * `tests/core-antialias.test.mjs` —— t129 抗锯齿回归（纯逻辑 + 静态守门；**无需 WebGL**）
 *
 * 覆盖：
 *   ① 诊断的事实链（上下文标志 vs composer 渲染目标 `samples`）在源码里可被静态核对；
 *   ② `antialiasPlanFor()` 的档位计划与 `?aa=` 诊断覆盖语义（含未知取值**必须显式报告**、数值钳制 0..8）；
 *   ③ `config.QUALITY.tiers` 三档都带 `aa/aaSamples`，默认档（medium）AA 生效；
 *   ④ 守门：`renderer.js` 仍是**唯一**创建 `EffectComposer` 的地方；AA 只写 composer 的两个渲染目标；
 *      `?mask=sky` / `?dpr`（`resolvePixelRatio`）语义未被 AA 改动。
 *
 * 真实生效值（samples 是否真的落到多重采样 RT）由真实浏览器读数承担（见 docs/handoff-t2-antialias.md）。
 */

import { createTestRunner, loadModule, assert, assertEqual } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './harness.mjs';

const runner = createTestRunner('core-antialias.test.mjs · 抗锯齿（MSAA via EffectComposer render target）');

const { CONFIG } = await loadModule('src/shared/config.js');
const RENDERER = await loadModule('src/core/renderer.js');
const { antialiasPlanFor, resolvePixelRatio } = RENDERER;
const SRC = readFileSync(join(ROOT, 'src', 'core', 'renderer.js'), 'utf8');
const TIERS = CONFIG.QUALITY.tiers;

await runner.test('① 诊断事实链：`antialias` 是上下文标志、composer 渲染目标未设 samples（源码级证据）', () => {
  assert(/antialias:\s*config\.RENDERER\.antialias/.test(SRC), '应保留上下文标志 `antialias: config.RENDERER.antialias`（诊断对象）');
  assert(/contextFlagEffective:\s*false/.test(SRC), '应显式声明“上下文标志对 composer 路径无效”（contextFlagEffective:false）');
  assert(/上下文标志/.test(SRC) && /EffectComposer/.test(SRC), '源码里应写明诊断结论：上下文标志 vs EffectComposer 渲染目标');
  const composerCount = SRC.split('new EffectComposer(').length - 1;
  assertEqual(composerCount, 1, '`renderer.js` 必须仍是唯一创建 EffectComposer 的地方（t129 不得引入第二套管线）');
  assert(/renderTarget1\.samples\s*=/.test(SRC) && /renderTarget2\.samples\s*=/.test(SRC), 'AA 必须写到 composer 的两个渲染目标 samples');
  // AA 不得触碰天空掩码用的渲染目标（t50/t53 的 mask RT）
  const samplesAssignments = [...SRC.matchAll(/([A-Za-z0-9_.$]+)\.samples\s*=/g)].map((m) => m[1]);
  assertEqual(samplesAssignments.sort().join(','), 'composer.renderTarget1,composer.renderTarget2', '.samples 只允许写到 composer 的两个渲染目标');
  assert(/mask/i.test(SRC), '天空掩码代码应仍在（?mask=sky 不得被 AA 改动）');
  runner.info(`诊断：composer 数量=${composerCount}；samples 赋值目标=${samplesAssignments.join(',')}；contextFlagEffective=false ✓`);
});

await runner.test('② `antialiasPlanFor()` 档位计划与 `?aa=` 覆盖语义（未知值必须显式报告、不静默改档）', () => {
  const low = antialiasPlanFor('low');
  const medium = antialiasPlanFor('medium');
  const high = antialiasPlanFor('high');
  assertEqual(low.mode, 'off', 'low 档应为 off');
  assertEqual(low.samples, 0, 'low 档 samples 应为 0');
  assertEqual(medium.mode, 'msaa', 'medium 档应为 msaa');
  assertEqual(medium.samples, 2, 'medium 档 samples 应为 2');
  assertEqual(high.mode, 'msaa', 'high 档应为 msaa');
  assertEqual(high.samples, 4, 'high 档 samples 应为 4');
  // 覆盖：off / msaa / 数值 / 越界钳制
  assertEqual(antialiasPlanFor('high', { aa: 'off' }).samples, 0, 'aa=off 应关掉 AA');
  assertEqual(antialiasPlanFor('high', { aa: 'off' }).reason, 'override:off');
  const msaaLow = antialiasPlanFor('low', { aa: 'msaa' });
  assertEqual(msaaLow.mode, 'msaa', 'low 档被 aa=msaa 覆盖后应为 msaa');
  assert(msaaLow.samples >= 1, 'aa=msaa 覆盖后 samples 应 ≥1');
  assertEqual(antialiasPlanFor('medium', { aa: '8' }).samples, 8, '数值覆盖应生效');
  assertEqual(antialiasPlanFor('medium', { aa: '99' }).samples, 8, '数值覆盖应钳到 8');
  assertEqual(antialiasPlanFor('medium', { aa: '-1' }).samples, 0, '负数覆盖应钳到 0（等价 off）');
  const bogus = antialiasPlanFor('medium', { aa: 'fxaa-不存在' });
  assertEqual(bogus.reason, 'override:unknown-value', '未知取值必须显式标记（不静默改变档位）');
  assertEqual(bogus.samples, 2, '未知取值应保持档位计划（medium=2）');
  // 不传覆盖时 requested 为空、reason 为 tier
  assertEqual(antialiasPlanFor('medium').requested, null, '无覆盖时 requested 应为 null');
  assertEqual(antialiasPlanFor('medium').reason, 'tier');
  runner.info(`计划：low=${low.mode}/${low.samples} · medium=${medium.mode}/${medium.samples} · high=${high.mode}/${high.samples}；覆盖 off/msaa/数值/未知 均按语义 ✓`);
});

await runner.test('③ `config.QUALITY.tiers` 三档都带 AA 参数，默认档（medium）AA 生效且有实测依据', () => {
  for (const id of ['low', 'medium', 'high']) {
    const t = TIERS[id];
    assert(t, `档位 ${id} 应存在`);
    assert(['off', 'msaa'].includes(t.aa), `${id}.aa 应为 off|msaa（实际 ${t.aa}）`);
    assert(Number.isInteger(t.aaSamples) && t.aaSamples >= 0, `${id}.aaSamples 应为非负整数（实际 ${t.aaSamples}）`);
  }
  assertEqual(TIERS.low.aaSamples, 0, 'low 档关 AA（填充率最紧档）');
  assert(TIERS.medium.aaSamples >= 2, '默认档 medium 必须 AA 生效（samples ≥2）');
  assert(TIERS.high.aaSamples >= TIERS.medium.aaSamples, 'high 档 AA 不应低于 medium');
  assertEqual(CONFIG.QUALITY.default, 'medium', '默认档应为 medium（t129 实测理由见回执）');
  // 质量档其它既有字段不得被本卡改动语义（抽查存在性）
  for (const key of ['dpr', 'shadowMapSize', 'bloom', 'maxRealtimeLights', 'lodBias', 'textureAnisotropy']) {
    assert(key in TIERS.medium, `medium 档应保留既有字段 ${key}`);
  }
  runner.info(`档位：low ${TIERS.low.aa}/${TIERS.low.aaSamples} · medium ${TIERS.medium.aa}/${TIERS.medium.aaSamples}（默认）· high ${TIERS.high.aa}/${TIERS.high.aaSamples}；既有字段齐全 ✓`);
});

await runner.test('④ 守门：`?stats=1` 可读到 AA；`?dpr`（resolvePixelRatio）语义未被 AA 改动', () => {
  assert(/antialiasInfo\(\)\s*\{/.test(SRC), '应导出 antialiasInfo() 权威读数');
  assert(/mode:\s*antialiasPlan\.mode/.test(SRC) && /samples:\s*antialiasPlan\.samples/.test(SRC), 'antialiasInfo() 应报告实际生效的 mode/samples');
  assert(/getStats[\s\S]{0,4000}antialias:\s*\{\s*mode:\s*antialiasPlan\.mode/.test(SRC), 'getStats().quality.antialias 应上报生效模式（供 ?stats=1 读取）');
  // ?dpr 语义：非法值仍回落档位 dpr（t21/t122 的既有口径，本卡不得改）
  const bad = resolvePixelRatio('abc', { config: CONFIG, tier: 'medium' });
  assertEqual(bad.fallback, true, '非法 dpr 仍应回落到档位 dpr');
  assertEqual(bad.ratio, CONFIG.QUALITY.tiers.medium.dpr, '回落值应等于 medium 档 dpr');
  const good = resolvePixelRatio(1.5, { config: CONFIG, tier: 'medium' });
  assertEqual(good.ratio, 1.5, '合法 dpr 应原样生效');
  runner.info(`?dpr 语义未变：非法⇒${bad.ratio}（fallback=${bad.fallback}）、合法 1.5⇒${good.ratio} ✓；antialiasInfo/getStats 上报就位 ✓`);
});

process.exit(runner.summary());
