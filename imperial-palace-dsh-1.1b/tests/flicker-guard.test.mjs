#!/usr/bin/env node
/**
 * `tests/flicker-guard.test.mjs` —— t1「红色边缘持续闪烁」的**常驻守卫**（无需浏览器；真实浏览器验证 opt-in）。
 *
 * 守卫三条腿：
 *   ① **协议**：`scripts/probe-flicker.mjs` 必须仍然具备本卡要求的判据与对照相位
 *      （主判据 `unstablePixels`、显式 `--expect` 不静默 PASS、`recordFrame(16)` 驱动口径、
 *       候选逐条排除相位、AA 三档相位、精确帧步长相位）；
 *   ② **根因常量**：以 `docs/reports/t1-smoke-metrics.json`（真机读数，工具 `work/probe/smoke-metrics.mjs` 产出）
 *      为输入，复算诊断所依赖的数值事实（亚像素点径、叠加密实度、回绕频率），并与
 *      `src/core/environment.js` 里的实现常量**逐值对齐** —— 任一侧改动都会让本测试变红，
 *      强制重测（判据只增不减）；
 *   ③ **候选排除登记**：`docs/reports/t1-flicker-phases.json` 里每条候选都必须有实测读数，
 *      且排除结论与读数一致（烟=唯一来源；尘埃/宫灯 flicker/灯体/bloom/阴影/AA/高亮线框全部有数字）。
 *
 * 浏览器腿（opt-in）：`FLICKER_BROWSER=1 node tests/flicker-guard.test.mjs` 会真跑
 *   `node scripts/probe-flicker.mjs --frames=30 --phases=live,nosmoke,frame-60`，
 *   判据 = **归属成立**（`nosmoke.unstablePixels === 0`）；`live` 读数直接打印
 *   （0 = 症状已消除；>0 = 症状仍在，读数即证据）。默认**显式跳过并说明原因**，不静默 PASS。
 */

import { createTestRunner, loadModule, assert, assertEqual } from './harness.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ROOT } from './harness.mjs';

const runner = createTestRunner('flicker-guard.test.mjs · 「红色边缘持续闪烁」根因判据与候选排除');

const PROBE_PATH = join(ROOT, 'scripts', 'probe-flicker.mjs');
const METRICS_PATH = join(ROOT, 'docs', 'reports', 't1-smoke-metrics.json');
const PHASES_PATH = join(ROOT, 'docs', 'reports', 't1-flicker-phases.json');
const PROBE = readFileSync(PROBE_PATH, 'utf8');
const ENV = readFileSync(join(ROOT, 'src', 'core', 'environment.js'), 'utf8');
const METRICS = JSON.parse(readFileSync(METRICS_PATH, 'utf8'));
const PHASES = JSON.parse(readFileSync(PHASES_PATH, 'utf8'));
const CONFIG = (await loadModule('src/shared/config.js')).CONFIG;

/* 屏幕/几何常数：与探针同口径（1440×900 视口，dpr=1 ⇒ drawingBufferHeight=900） */
const VIEWPORT_H = 900;
const pointPx = (size, dist) => (size * (VIEWPORT_H / 2)) / dist;

await runner.test('① 探针协议：主判据 / 不静默 PASS / 驱动口径 / 候选相位 / 精确帧步长', () => {
  assert(/unstablePixels/.test(PROBE), '探针必须上报主判据 unstablePixels');
  assert(/相邻帧间发生过任何位差的\*\*不同像素\*\*数/.test(PROBE), '主判据口径必须写在探针里（不同像素数，阈值 0）');
  assert(/--expect=<相位>:<数值>/.test(PROBE), '探针必须支持 --expect 显式判据');
  assert(/未运行 live 相位时必须用 --expect/.test(PROBE), '缺少判据时必须显式失败（不静默 PASS）');
  assert(/renderSystem\.recordFrame\(16\)/.test(PROBE), '常规相位必须沿用生产循环入口 recordFrame(16) 驱动');
  assert(/freezeLoop\(\)/.test(PROBE) && /stepFrame\(dt\)/.test(PROBE), '必须有精确帧步长相位（冻结 rAF + 复刻生产帧调用序列）');
  for (const id of [
    'live', 'lock', 'lock-rig', 'lock-env', 'noflicker', 'nodust', 'nosmoke', 'noparticles',
    'nolamps', 'nobloom', 'noshadow', 'noaa', 'aa-low', 'aa-medium', 'aa-high',
    "sel-live", "sel-nohl", 'smoke-lod', 'frame-60', 'frame-15', 'frame-60-lod',
  ]) {
    assert(new RegExp(`(?:'${id}'|\\b${id}\\b)\\s*:\\s*\\{`).test(PROBE), `探针必须保留相位 ${id}（候选对照/AA 变量/最小修复）`);
  }
  assert(/environment-dust/.test(PROBE) && /environment-smoke/.test(PROBE) && /environment-lamps/.test(PROBE), '候选排除必须按真实对象名（环境粒子/宫灯）开关');
  assert(/palace-ui-highlight/.test(PROBE), '候选排除必须覆盖选中高亮线框（palace-ui-highlight）');
  assert(/候选最小修复的运行时验证/.test(PROBE), '必须保留"最小修复运行时验证"通道（不改产品代码即可复测判据）');
  runner.info(`协议就绪：主判据=unstablePixels（阈值 0）｜相位 ${21} 个｜精确帧步长 @60fps/@15fps｜判据缺失即失败 ✓`);
});

await runner.test('② 根因常量：远景烟柱为**亚像素**点精灵 + 同像素堆叠 + 每秒回绕瞬移（与实现逐值对齐）', () => {
  // 实现侧常量（src/core/environment.js）必须与真机读数里的粒子规格一致
  assert(/censerAnchors\(\)\.map\(\(anchor\) => \{/.test(ENV), '烟柱来源必须是 censerAnchors()（香炉入口派生）');
  assertEqual(/const ids = \['B-gate-front', 'B-hall-main', 'C-gate-inner', 'C-hall-bed-main'\]/.test(readFileSync(join(ROOT, 'src', 'core', 'environment.js'), 'utf8')), true, '香炉锚点必须仍是中轴 4 处（B 门/正殿、C 门/寝殿）');
  assert(/makeParticleSystem\(Math\.max\(4, Math\.round\(config\.LIGHTING\.atmosphere\.smokeParticleBudget \/ 4\)\), 1\.1, 0\.16, 6\)/.test(ENV),
    '烟粒子规格必须仍是 size=1.1 / opacity=0.16 / span=6（读数依赖这三值；改动必须同步重测并更新读数）');
  assert(/const phase = \(elapsed \* 0\.22 \+ seeds\[i \* 3\]\) % 1;/.test(ENV), '上升相位必须仍是 0.22 次/秒（回绕频率判据依赖它）');
  assertEqual(CONFIG.LIGHTING.atmosphere.smokeEnabled, true, '本卡口径下烟必须开启（关闭即无闪烁也无该视觉特征）');
  assertEqual(CONFIG.LIGHTING.atmosphere.smokeParticleBudget, 48, '烟粒子总预算必须仍是 48（= 4 柱 × 12）');

  // 真机读数：4 柱烟的距离 / 屏幕足迹 / 点径 / 堆叠数
  const systems = METRICS.systems;
  assertEqual(systems.length, 4, '真机读数里必须是 4 柱香炉烟');
  const size = systems[0].size; const opacity = systems[0].opacity;
  assertEqual(size, 1.1, '读数里的粒子 size 应与实现一致');
  assertEqual(opacity, 0.16, '读数里的粒子 opacity 应与实现一致');
  let maxPoint = 0; let maxAlpha = 0; let maxStack = 0; let minY = Infinity; let maxY = -Infinity; let minX = Infinity; let maxX = -Infinity;
  for (const s of systems) {
    for (const d of [s.distance.min, s.distance.max]) maxPoint = Math.max(maxPoint, pointPx(size, d));
    maxAlpha = Math.max(maxAlpha, s.aggregateAlpha);
    maxStack = Math.max(maxStack, s.maxStackSamePixel);
    minX = Math.min(minX, s.footprintPx.x[0]); maxX = Math.max(maxX, s.footprintPx.x[1]);
    minY = Math.min(minY, s.footprintPx.y[0]); maxY = Math.max(maxY, s.footprintPx.y[1]);
  }
  // 距离取自 layout 派生锚点（确定性）⇒ 点径可精确复算；足迹/堆叠含随机种子 ⇒ 只判区间
  assert(maxPoint > 0.3 && maxPoint < 1, `亚像素判据：远景四柱烟的点径必须 <1px（复算 ${maxPoint.toFixed(3)}px）`);
  assert(Math.abs(maxPoint - 0.53) < 0.05, `点径量级必须仍 ≈0.5px（实际 ${maxPoint.toFixed(3)}px；若量级变了，说明机位/锚点/粒子规格已变，须重测）`);
  assert(maxAlpha > 0.3 && maxAlpha < 0.7, `同像素叠加后等效不透明度必须落在 0.30–0.70（实际 ${maxAlpha.toFixed(4)}）`);
  assert(maxStack >= 2 && maxStack <= 6, `同一像素内的粒子堆叠数必须 2–6（实际 ${maxStack}）`);
  assert(minX >= 710 && maxX <= 730, `四柱烟必须**同处一条窄列**（中轴 4 香炉投影重叠；实际列 ${minX}–${maxX}）`);
  assert(maxY - minY > 150, `四柱烟必须跨 >150px 的行范围（实测 ≈401–639）`);
  assertEqual(METRICS.perSecond.particles, 48, '回绕频率分母必须是 48 颗粒子');
  assert(METRICS.perSecond.respawns >= 5, `实测每秒回绕瞬移次数必须 ≥5（"持续闪烁"判据；实际 ${METRICS.perSecond.respawns}/s）`);
  const expectedRespawn = 0.22 * METRICS.perSecond.particles;
  assert(Math.abs(expectedRespawn - 10.56) < 0.01, '理论回绕频率 0.22×48 ≈ 10.56 次/秒');
  // 实测值带随机种子方差（两次读数 9 / 14 次/秒）：只判量级，不判精确等值
  assert(METRICS.perSecond.respawns <= expectedRespawn * 2.5, `实测回绕次数不得超过理论值 2.5 倍（实际 ${METRICS.perSecond.respawns}/s ⇒ 读数自洽）`);

  // 近景保持性：LOD 门限不得在近景移除烟柱
  assert(pointPx(1.1, 20) > 20, `近景 20m 处点径应 ≈24.75px（实际 ${pointPx(1.1, 20).toFixed(2)}）⇒ 1px 门限只裁远景`);
  runner.info(`根因常量：4 柱烟距离 ${systems.map((s) => s.distance.min).join('/')} ⇒ 点径 ≤${maxPoint.toFixed(2)}px（亚像素）｜堆叠 ≤${maxStack} ⇒ 等效 α ≤${maxAlpha.toFixed(2)}｜同列 ${minX}–${maxX}｜回绕 ${METRICS.perSecond.respawns}/s（理论 10.56）｜近景 20m 点径 ${pointPx(1.1, 20).toFixed(1)}px ✓`);
});

await runner.test('③ 候选排除登记：每条候选都有实测读数，且结论与读数一致', () => {
  const cands = PHASES.candidates;
  assert(cands && typeof cands === 'object', 't1-flicker-phases.json 必须登记候选读数表');
  const ids = Object.keys(cands);
  assert(ids.length >= 12, `登记的候选数必须 ≥12（实际 ${ids.length}）`);
  for (const id of ids) {
    const c = cands[id];
    assert(c && typeof c.reading === 'number', `候选 ${id} 必须带实测读数（不得只写结论）`);
    assert(typeof c.verdict === 'string' && c.verdict.length > 0, `候选 ${id} 必须带排除结论`);
    assert(typeof c.phase === 'string' && c.phase.length > 0, `候选 ${id} 必须写明对应的探针相位（可复跑）`);
    assert(typeof c.frames === 'number' && c.frames > 0, `候选 ${id} 必须写明帧数（口径三要素：环境/协议/判据）`);
  }
  // 结论与读数必须一致（机器可判）
  assertEqual(cands['smoke-hidden'].reading, 0, '「隐藏 environment-smoke」读数必须为 0（唯一来源）');
  assertEqual(cands['dust-hidden'].reading > 0, true, '「隐藏 environment-dust」读数必须 >0（尘埃被排除，不是来源）');
  assertEqual(cands['lamp-flicker-pinned'].reading > 0, true, '「宫灯点光 flicker 钉回基准」读数必须 >0（flicker 被排除）');
  assertEqual(cands['lamps-hidden'].reading > 0, true, '「隐藏灯体 + 关点光」读数必须 >0（灯体被排除）');
  assertEqual(cands['bloom-off'].reading > 0, true, '「关 bloom」读数必须 >0（bloom 被排除）');
  assertEqual(cands['shadow-off'].reading > 0, true, '「关阴影」读数必须 >0（阴影被排除）');
  assertEqual(cands['highlight-idle'].reading, 0, '未选中时高亮线框不可见 ⇒ 贡献像素必须为 0（"红色边缘"候选被排除）');
  assert(cands['highlight-selected'].reading >= 0, '选中态线框必须单独量一条读数（脉动为设计项，与静止场景闪烁分开登记）');
  assert(/设计/.test(cands['highlight-selected'].verdict), '选中态线框的结论必须写明"脉动是设计项"');
  assertEqual(PHASES.attribution.soleSource, 'environment-smoke', '唯一来源必须登记为 environment-smoke');
  assertEqual(PHASES.attribution.firstChangedFramePair, '29/29', '基线必须"每一对相邻帧都变"（持续闪烁，不是偶发）');
  assert(PHASES.attribution.redWallBehind === '#962822', '烟柱背后必须是宫红墙 #962822（"红色边缘"的由来）');
  // AA 三档：锁状态全 0（渲染确定），live 三档都 >0（与 AA 无关）
  for (const tier of ['off', 'msaa2', 'msaa4']) {
    assertEqual(PHASES.aa.lock[tier], 0, `锁定状态下 AA=${tier} 必须精确为 0（渲染逐位确定；AA 不制造闪烁）`);
  }
  for (const tier of ['low', 'medium', 'high']) {
    assert(PHASES.aa.live[tier] > 0, `live 相位 AA=${tier} 必须 >0（三档都仍闪烁 ⇒ 与 AA 无关）`);
  }
  assert(PHASES.aa.live.low >= PHASES.aa.live.medium * 0.5, '关 AA 时不稳定像素不得比 MSAA2 少一半以上（否则 AA 才是主因，须重判）');
  // 最小修复：同协议精确为 0
  assertEqual(PHASES.fix['smoke-lod'], 0, '最小修复（烟柱 LOD ≥1px）在 live 协议下必须精确为 0');
  assertEqual(PHASES.fix['frame-60-lod'], 0, '最小修复在精确 1 帧 @60fps 协议下必须精确为 0');
  runner.info(`候选登记：${ids.length} 条全部带读数｜唯一来源=${PHASES.attribution.soleSource}｜AA 锁态 0/0/0、live ${PHASES.aa.live.low}/${PHASES.aa.live.medium}/${PHASES.aa.live.high}｜修复后 0 ✓`);
});

await runner.test('④ 高亮线框候选的对象级排除（真对象断言，不是文本断言）', async () => {
  const THREE = (await loadModule('src/kit/three-ref.js')).THREE;
  const { createHighlighter } = await loadModule('src/interaction/highlight.js');
  const scene = new THREE.Scene();
  const hl = createHighlighter({ parent: scene });
  assertEqual(hl.group.children.length, 2, '高亮组应只有 2 个线框（悬停 + 选中）');
  assert(hl.group.children.every((c) => c.visible === false), '未选中/未悬停时两个线框都必须不可见（⇒ 不可能是静止场景的闪烁源）');
  assertEqual(hl.group.children.map((c) => `#${c.material.color.getHexString()}`).join(','), '#ffc83b,#ffc83b', '高亮色必须仍是鎏金 #ffc83b（非"红"）');
  hl.setSelected({ minX: 0, maxX: 10, minY: 0, maxY: 5, minZ: 0, maxZ: 5 });
  const before = hl.group.children[1].material.opacity;
  hl.update(1 / 60, 0.45); hl.update(1 / 60, 0.9);
  const after = hl.group.children[1].material.opacity;
  assert(before >= 0.7 && before <= 1 && after >= 0.7 && after <= 1, `选中线框脉动必须仍有界（0.7–1.0；实际 ${before} → ${after}）`);
  assert(Math.abs(after - before) > 1e-6, '选中线框的脉动是**设计**（CONFIG.INTERACTION.selection.highlightPulseMs）⇒ 必须仍在动');
  assertEqual(hl.group.children[0].material.opacity, 0.45, '悬停线框不参与脉动（恒定 0.45）');
  hl.clear();
  assert(hl.group.children.every((c) => c.visible === false), 'clear() 后必须回到全不可见');
  runner.info(`高亮线框：初始全不可见 ✓｜色 #ffc83b ✓｜选中脉动有界 0.7–1.0（设计项，非闪烁源）✓`);
});

await runner.test('⑤ 真实浏览器验证（opt-in：FLICKER_BROWSER=1；默认显式跳过）', () => {
  const want = process.env.FLICKER_BROWSER === '1';
  const pw = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const hasChrome = Boolean(process.env.CHROME_PATH) || existsSync(pw);
  if (!want) {
    runner.info('跳过（未设 FLICKER_BROWSER=1）。真机验证命令：FLICKER_BROWSER=1 node tests/flicker-guard.test.mjs（≈10 min，需本机 headless Chrome）');
    return;
  }
  if (!hasChrome) {
    runner.info('跳过（本机无 headless Chrome：CHROME_PATH 未设且无 playwright 缓存）—— 不静默 PASS，读数缺失即视为未测');
    return;
  }
  const run = spawnSync(process.execPath, [PROBE_PATH, '--frames=30', '--phases=live,nosmoke,frame-60', '--json=/tmp/t1-flicker-guard.json'], { cwd: ROOT, encoding: 'utf8' });
  assertEqual(run.status !== null, true, '探针必须能启动（非超时）');
  const json = JSON.parse(readFileSync('/tmp/t1-flicker-guard.json', 'utf8'));
  const by = Object.fromEntries(json.phases.map((p) => [p.id, p]));
  assertEqual(by.nosmoke.unstablePixels, 0, '归属判据：关掉 environment-smoke 后不稳定像素必须精确为 0');
  assertEqual(by.live.frames, 30, 'live 相位必须 ≥30 帧');
  runner.info(`真机读数：live=${by.live.unstablePixels}（0=已修复 / >0=症状仍在）｜nosmoke=${by.nosmoke.unstablePixels}｜frame-60=${by['frame-60'].unstablePixels}｜AA=${JSON.stringify(by.live.aa)}`);
});

process.exit(runner.summary());
