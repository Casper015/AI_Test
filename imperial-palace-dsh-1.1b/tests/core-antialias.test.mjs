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

import { createTestRunner, loadModule, loadThree, assert, assertEqual } from './harness.mjs';
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
  // t168 修缺陷①：计数前先剥注释（若注释里出现该字面量，旧写法会让计数漂移）
  const SRC_NO_COMMENTS = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const composerCountRaw = SRC.split('new EffectComposer(').length - 1;
  const composerCount = SRC_NO_COMMENTS.split('new EffectComposer(').length - 1;
  runner.info(`EffectComposer 计数：含注释 ${composerCountRaw} → 剥注释后 ${composerCount}（断言用后者）`);
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
  assertEqual(antialiasPlanFor('medium', { aa: '-1' }).mode, 'off', '负数覆盖应等价 off（t168 修缺陷②）');
  assertEqual(antialiasPlanFor('medium', { aa: '2.6' }).samples, 3, '非整数覆盖应四舍五入');
  assertEqual(antialiasPlanFor('medium', { samples: -4 }).samples, 0, 'options.samples 为负也应钳到 0');
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

/* ==========================================================================
 * t40：**移动协议守卫** —— 烟柱 LOD 滞回（moving 时整柱 visible 不得跳变）
 * --------------------------------------------------------------------------
 * 缺陷（t40 移动协议实测，见 `docs/report-motion-edges.md` §3）：t25 的 LOD 只有一个门限，相机在
 * 门限附近运动时 `pointPx` 在 1.0 上下抖动 ⇒ 整柱 `points.visible` **逐帧跳变**（实测最高 12 次翻转/48 帧）。
 * 修法：`smokeMinPointPx`(隐藏) + `smokeShowPointPx`(显示) 双门限滞回，带内保持上一帧状态。
 * 本守则是**行为级**的（读生产 `environment.update` 写出的 `points.visible`），并由 ③ 的
 * "旧单门限复算必 >0 翻转" 证明断言不恒真（不假绿）。
 * ========================================================================== */

const THREE = await loadThree();
const { createEventBus } = await loadModule('src/core/events.js');
const { createEnvironment } = await loadModule('src/core/environment.js');
const LAYOUT = await loadModule('src/shared/layout.js');

const ATM = CONFIG.LIGHTING.atmosphere;
const CENSER_IDS = ['B-gate-front', 'B-hall-main', 'C-gate-inner', 'C-hall-bed-main'];
/** 未挂渲染器时 `drawingBufferHeight()` 的生产回落值 = BUDGET.viewport.height × 档位 dpr。 */
const FALLBACK_DRAW_H = CONFIG.BUDGET.viewport.height * CONFIG.QUALITY.tiers[CONFIG.QUALITY.default].dpr;

function makeSmokeEnv() {
  const scene = new THREE.Scene();
  const environment = createEnvironment({ config: CONFIG, events: createEventBus(), scene, THREE });
  scene.add(environment.root); // 与 src/main.js:201 同一条装配路径（生产口径）
  const group = scene.getObjectByName('environment-smoke');
  assert(group, '应存在 environment-smoke 组');
  assertEqual(group.children.length, CENSER_IDS.length, `烟柱系统数应 = 香炉数 ${CENSER_IDS.length}`);
  return { scene, environment, group };
}
/** 把相机放到"目标香炉点径 = px"的距离上（生产同一式反解；只沿 +x 平移，不动 y/z）。 */
function cameraForPointPx(anchor, px, { size = 1.1, drawH = FALLBACK_DRAW_H } = {}) {
  const dist = (size * (drawH / 2)) / px;
  return { x: anchor.x + dist, y: anchor.y, z: anchor.z };
}
/** 逐帧驱动生产 `update`，返回被测柱每帧的 visible 序列。 */
function driveVisible(environment, index, pxSeries, anchor, opts = {}) {
  const out = [];
  let elapsed = 0;
  for (const px of pxSeries) {
    elapsed += 1 / 60;
    environment.update(1 / 60, elapsed, { cameraPosition: cameraForPointPx(anchor, px, opts) });
    out.push(environment.describe().smoke.systems[index].visible);
  }
  return out;
}
const flipCount = (series) => series.slice(1).filter((v, i) => v !== series[i]).length;
/** 旧（t25）单门限规则复算：用于"断言不恒真"的对照，不是被测对象。 */
const legacyVisible = (px, prev, minPx = ATM.smokeMinPointPx) => (px >= minPx);

await runner.test('t40① 登记与几何同轮：两个门限值 + 等效距离带 + 逐柱读数（describe().smoke）', () => {
  assertEqual(ATM.smokeMinPointPx, 1.0, '隐藏门限仍应为 t25 的 1.0 px（不得放宽）');
  assertEqual(ATM.smokeShowPointPx, 1.25, 't40 新增的显示门限应为 1.25 px');
  assert(ATM.smokeShowPointPx > ATM.smokeMinPointPx, '显示门限必须 > 隐藏门限（否则不是滞回）');
  const { environment } = makeSmokeEnv();
  const smoke = environment.describe().smoke;
  assertEqual(smoke.minPointPx, 1.0, 'describe().smoke.minPointPx 应回显登记值');
  assertEqual(smoke.showPointPx, 1.25, 'describe().smoke.showPointPx 应回显登记值');
  assert(smoke.bandMetres, '应给出滞回带的等效距离');
  assertEqual(smoke.bandMetres.drawH, FALLBACK_DRAW_H, 'Node 侧绘制缓冲高度应 = 生产回落值');
  assert(Math.abs(smoke.bandMetres.hideBeyondMetres - 495) < 1.0, `隐藏门限等效距离应 ≈495m（实际 ${smoke.bandMetres.hideBeyondMetres}）`);
  assert(Math.abs(smoke.bandMetres.showWithinMetres - 396) < 1.0, `显示门限等效距离应 ≈396m（实际 ${smoke.bandMetres.showWithinMetres}）`);
  assertEqual(smoke.systems.length, CENSER_IDS.length, '应逐柱给出读数');
  for (const [i, id] of CENSER_IDS.entries()) {
    const entrance = LAYOUT.SLOT_BY_ID[id].entrance;
    const anchor = smoke.systems[i].anchor;
    assertEqual(anchor.x, entrance.x, `${id} 的烟柱锚点 x 应 = 槽位入口 x`);
    assertEqual(anchor.z, entrance.z, `${id} 的烟柱锚点 z 应 = 槽位入口 z`);
  }
  runner.info(`门限 ${smoke.minPointPx}(隐藏) → ${smoke.showPointPx}(显示)｜等效距离 ${smoke.bandMetres.hideBeyondMetres}m … ${smoke.bandMetres.showWithinMetres}m｜逐柱锚点与槽位入口逐值一致 ✓`);
});

await runner.test('t40② 滞回语义逐帧：带内保持上一帧状态（下穿隐藏 / 上穿显示 / 带内不动）', () => {
  const { environment } = makeSmokeEnv();
  const { environment: env2 } = makeSmokeEnv();
  const anchor = environment.describe().smoke.systems[1].anchor;
  const anchor2 = env2.describe().smoke.systems[1].anchor;
  // ① 从"显示"起：2.0 → 0.98（<1.0 隐藏）→ 1.05（带内 ⇒ 仍隐藏）→ 1.20（带内 ⇒ 仍隐藏）→ 1.30（≥1.25 ⇒ 显示）→ 1.05（带内 ⇒ 仍显示）→ 0.99（隐藏）
  const series = [2.0, 0.98, 1.05, 1.2, 1.3, 1.05, 0.99];
  const got = driveVisible(environment, 1, series, anchor);
  assertEqual(got.map((v) => (v ? 1 : 0)).join(''), '1000110', `滞回序列应为 显示→隐藏→隐藏→隐藏→显示→显示→隐藏（实际 ${got.map((v) => (v ? 1 : 0)).join('')}）`);
  // 对照：同序列按**旧单门限**复算 ⇒ 1,0,1,1,1,1,0（带内会跳回显示 = 缺陷本身）
  const legacy = [];
  let prev = true;
  for (const px of series) { prev = legacyVisible(px, prev); legacy.push(prev ? 1 : 0); }
  assertEqual(legacy.join(''), '1011110', `旧单门限复算应为 1011110（对照，证明②抓的是新行为；实际 ${legacy.join('')}）`);
  assert(legacy.join('') !== got.map((v) => (v ? 1 : 0)).join(''), '滞回序列必须与旧单门限序列不同（否则断言无对象）');
  // ② 反向：从"隐藏"起，1.05 仍隐藏、1.20 仍隐藏、1.26 显示
  const anchorB = env2.describe().smoke.systems[1].anchor;
  const got2 = driveVisible(env2, 1, [0.9, 1.05, 1.2, 1.26], anchorB);
  assertEqual(got2.map((v) => (v ? 1 : 0)).join(''), '0001', `从隐藏起：0.9→隐藏、1.05/1.20 带内仍隐藏、1.26 显示（实际 ${got2.map((v) => (v ? 1 : 0)).join('')}）`);
  runner.info(`滞回序列 ${got.map((v) => (v ? 1 : 0)).join('')}（旧单门限 ${legacy.join('')}）｜反向 ${got2.map((v) => (v ? 1 : 0)).join('')} ✓`);
});

await runner.test('t40③ 不爆闪：绕门限往复 20 次的 visible 翻转 ≤1（旧单门限复算必 ≥8 ⇒ 断言不假绿）', () => {
  const { environment } = makeSmokeEnv();
  const anchor = environment.describe().smoke.systems[1].anchor;
  // 0.98 / 1.05 交替（= 相机在门限附近微幅往复；0.98↔1.05 对应距离 ±3.4m）
  const series = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.98 : 1.05));
  const got = driveVisible(environment, 1, series, anchor);
  const flips = flipCount(got);
  // 旧单门限复算（同一序列）
  let prev = true; const legacy = [];
  for (const px of series) { prev = legacyVisible(px, prev); legacy.push(prev); }
  const legacyFlips = flipCount(legacy);
  assert(legacyFlips >= 8, `旧单门限在同一序列上必须 ≥8 次翻转（否则对照无效；实际 ${legacyFlips}）`);
  assert(flips <= 1, `滞回后绕门限往复的翻转必须 ≤1（实际 ${flips}；旧单门限 ${legacyFlips} 次 = t25 的爆闪缺陷）`);
  assertEqual(flips, 0, '门限附近往复且全程不出带 ⇒ 不应有任何翻转');
  runner.info(`绕门限往复 40 帧：滞回翻转 ${flips} 次（旧单门限复算 ${legacyFlips} 次 = 缺陷复现）✓`);
});

await runner.test('t40④ 特征保留与预算未动：近景仍可见 / 远景仍不绘制 / 粒子规格逐值不变 / 台阶阈值未动', () => {
  const { environment, group } = makeSmokeEnv();
  const anchor = environment.describe().smoke.systems[1].anchor;
  // 近景 20m ⇒ 点径 24.75px ≫ 显示门限 ⇒ 必须可见（t25/t40 都不许把近距离烟裁掉）
  const near = driveVisible(environment, 1, [1.1 * (FALLBACK_DRAW_H / 2) / 20], anchor);
  assertEqual(near[0], true, '近景 20m 处烟柱必须可见（点径 24.75px）');
  // 远景 1500m ⇒ 0.33px ⇒ 必须隐藏（t25 的根因修复不得回退）
  const far = driveVisible(environment, 1, [1.1 * (FALLBACK_DRAW_H / 2) / 1500], anchor);
  assertEqual(far[0], false, '远景 1500m 处烟柱（0.33px）必须不绘制');
  // 粒子规格/预算逐值不变（t25 的§8.2 判据，本卡不得放宽）
  assertEqual(ATM.smokeParticleBudget, 48, 'smokeParticleBudget 仍应为 48');
  assertEqual(ATM.smokeEnabled, true, 'smokeEnabled 仍应为 true');
  for (const pts of group.children) {
    assertEqual(pts.material.size, 1.1, '烟柱 size 仍应为 1.1');
    assertEqual(pts.material.opacity, 0.16, '烟柱 opacity 仍应为 0.16');
    assertEqual(pts.geometry.getAttribute('position').count, 12, '每柱粒子数仍应为 budget/4 = 12');
    assertEqual(pts.material.sizeAttenuation, true, 'sizeAttenuation 仍应为 true');
  }
  // 台阶阈值未动（卡面硬约束）
  assertEqual(CONFIG.INTERACTION.step.maxStepHeight, 0.5, '上台阶阈值不得被本卡改动');
  assertEqual(CONFIG.INTERACTION.step.snapDownDistance, 0.6, '下台阶阈值不得被本卡改动');
  runner.info(`近景 20m 可见 / 远景 1500m 不绘制｜budget 48 · size 1.1 · opacity 0.16 · 每柱 12 颗逐值不变｜台阶阈值 0.5/0.6 未动 ✓`);
});

/* ==========================================================================
 * t47：**档位切换必须真正重建渲染目标**（外部审查 findings ①：面板报 4× 而 GPU 实际 2×）
 * --------------------------------------------------------------------------
 * 口径三要素：
 *   · 来源 = `renderer.js` 的 `antialiasApplyDecision()`（唯一判据）+ `applyAntialias()` 的消费点；
 *   · 判据 = ①samples 变化 ⇒ `rebuild:true`（必须 dispose 两条 RT，否则 GL 侧不会重建）
 *            ②samples 不变 ⇒ 不写不重建（同档重复设置 / resize / dpr 路径零开销，不回归）
 *            ③首次（prev=null）⇒ 只写不重建（RT 未上传，首帧按新值创建）
 *            ④`antialiasInfo()` / `getStats().quality.antialias` 必须上报 **GL 侧读回**的生效值，
 *              而不是把计划值当生效值（"上报必须与实际一致"）；
 *   · 反例 = 退回"只改 samples 不重建"（旧实现）⇒ ① 转红；把 effective 换成计划值回显 ⇒ ④ 转红。
 * 真实 GL 读数（headless Chrome + `--use-angle=metal`，逐档 × `?aa=off|2|4|8` 计划 vs 读回对照表）
 * 见 `docs/report-aa-rebuild.md`；本文件承担**常驻**守门（Node 可跑、不需要 WebGL）。
 * ========================================================================== */
await runner.test('t47⑤ 档位切换必须真重建：判据/消费点/上报三处守门（纯逻辑 + 源码+行为模拟）', () => {
  const R = RENDERER;
  const { antialiasApplyDecision } = R;
  assertEqual(typeof antialiasApplyDecision, 'function', 'renderer.js 必须导出 antialiasApplyDecision（唯一判据）');
  const src = readFileSync(join(ROOT, 'src', 'core', 'renderer.js'), 'utf8');

  /* ① 判据语义（行为级，Node 可跑） */
  const init = antialiasApplyDecision(null, { samples: 2 });
  assertEqual(init.rebuild, false, '首次写入不得触发重建（RT 未上传）');
  assertEqual(init.writeSamples, true, '首次必须写 samples');
  const same = antialiasApplyDecision({ samples: 2 }, { samples: 2 });
  assertEqual(same.writeSamples, false, 'samples 相同不得重复写');
  assertEqual(same.rebuild, false, 'samples 相同不得重建（resize/同档重复设置零开销）');
  for (const [a, b] of [[2, 4], [4, 2], [4, 0], [0, 2], [2, 8], [8, 2]]) {
    const d = antialiasApplyDecision({ samples: a }, { samples: b });
    assertEqual(d.writeSamples, true, `samples ${a}→${b} 必须写`);
    assertEqual(d.rebuild, true, `samples ${a}→${b} 必须重建（否则 GL 侧仍是旧值）`);
  }

  /* ② 行为模拟：three 的"只改 samples 不重建 ⇒ 不生效"契约下，判据必须让实际值跟上计划值 */
  const makeTarget = () => ({ samples: 0, effective: 0, uploaded: false, dispose() { this.uploaded = false; } });
  const applyLikeRenderer = (rt, prev, next) => {
    const d = antialiasApplyDecision(prev, next);
    if (d.writeSamples) rt.samples = next.samples;
    if (d.rebuild) { rt.dispose(); rt.effective = rt.samples; rt.uploaded = true; }
    else if (!rt.uploaded) { rt.effective = rt.samples; rt.uploaded = true; }   // 首次上传（首帧创建）
    return { d, rt };
  };
  const t1 = makeTarget();
  applyLikeRenderer(t1, null, { samples: 2 });
  assertEqual(t1.effective, 2, '首次：上传后生效值必须 = 计划');
  applyLikeRenderer(t1, { samples: 2 }, { samples: 4 });
  assertEqual(t1.effective, 4, '切换 2→4：生效值必须跟上（真重建）');
  applyLikeRenderer(t1, { samples: 4 }, { samples: 0 });
  assertEqual(t1.effective, 0, '切换 4→off：生效值必须归零');
  applyLikeRenderer(t1, { samples: 0 }, { samples: 0 });
  assertEqual(t1.effective, 0, '同档重复：不得改变生效值');

  /* ③ 消费点守门：applyAntialias 必须"按判据写 samples + 变化时 dispose 两条 RT + 计数" */
  const applyStart = src.indexOf('function applyAntialias(plan)');
  assert(applyStart > 0, 'renderer.js 必须仍有 applyAntialias(plan)');
  const applyBody = src.slice(applyStart, applyStart + 1800);   // 函数体足够长；末尾另含"不得退回只改 samples"的负向检查
  assert(/antialiasApplyDecision\(/.test(applyBody), 'applyAntialias 必须消费 antialiasApplyDecision（不得另立第二套判据）');
  assert(/composer\.renderTarget1\.samples\s*=/.test(applyBody) && /composer\.renderTarget2\.samples\s*=/.test(applyBody), 'applyAntialias 必须写两条 RT 的 samples');
  assert(/if \(decision\.rebuild\)/.test(applyBody), 'applyAntialias 必须按 decision.rebuild 分支');
  assert(/composer\.renderTarget1\.dispose\(\)/.test(applyBody) && /composer\.renderTarget2\.dispose\(\)/.test(applyBody), 'rebuild 分支必须 dispose 两条 RT（three 只在此重建 GL FBO）');
  assert(/antialiasRebuilds \+= 1/.test(applyBody), 'rebuild 必须计数（供断言与 ?stats=1 取证）');
  const strippedBody = applyBody.replace(/composer\.renderTarget[12]\.samples\s*=\s*plan\.samples;/g, '');
  assert(!/\.samples\s*=[^=]/.test(strippedBody), 'applyAntialias 里除两条 composer RT 外不得再有 samples 赋值（禁止退回"只改 samples"）');

  /* ④ 上报守门：GL 侧生效值必须上报（不是把计划值当生效值） */
  const infoBody = src.slice(src.indexOf('antialiasInfo() {'), src.indexOf('dprInfo() {'));
  assert(/effective:\s*readComposerAntialias\(\)/.test(infoBody), 'antialiasInfo() 必须上报 GL 读回的 effective');
  assert(/rebuilds:\s*antialiasRebuilds/.test(infoBody), 'antialiasInfo() 必须上报重建计数');
  assert(/effectiveSamples:/.test(src) && /matchesPlan:/.test(src), 'getStats().quality.antialias 必须上报 effectiveSamples / matchesPlan');
  assert(/__webglMultisampledFramebuffer/.test(src) && /getRenderbufferParameter/.test(src), '生效值必须来自 GL 侧读回（multisampled FBO / renderbuffer samples）');
  assertEqual(typeof R.antialiasPlanFor, 'function', 'antialiasPlanFor 仍应导出（既有 API 不变）');
  runner.info('判据：init 只写不重建 · unchanged 零开销 · 变化必重建；消费点按 decision 分支并 dispose 两条 RT；上报含 effective/matchesPlan/rebuilds ✓');
});

process.exit(runner.summary());

