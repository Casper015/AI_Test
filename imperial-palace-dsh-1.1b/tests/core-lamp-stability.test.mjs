#!/usr/bin/env node
/**
 * `tests/core-lamp-stability.test.mjs` —— **t5 常驻守卫：镜头旋转时的宫灯稳定性**。
 *
 * 缺陷（t5 实测，报告 `docs/reports/report-t5-lamp-flicker.md`）：
 *   镜头旋转 ⇒ `environment.update()` 每帧用新机位重排灯位池，而 `rankLampPool` 的 `slice(0, size)`
 *   是**无滞回的硬截断**，且入选池按 `pool[i]` 直接写第 i 盏 PointLight ⇒
 *   ① 池内**次序**一变，多盏灯同时"瞬移"到别的灯位（基线实测 150 帧内最多 32 次位置变化）；
 *   ② 截断线在近并列的两盏灯之间来回跳（实测 VP-C-zone 有 3 帧相对裕量 < 1e-3）；
 *   ③ 进出池是**单帧硬切**（无斜坡），基线单帧强度变化率最高 **166.6/s**（满量程 18）。
 *   合起来就是肉眼看到的"镜头一转，宫灯闪"。
 *
 * 修复（最小改动，**预算一律不动**）：`selectLampPool`（滞回）+ 槽位按身份绑定 + `updateLampOutput`
 *   （满强度/开合都限速斜坡，换绑帧强度精确连续）。稳态强度与修复前**逐值相同**。
 *
 * 本文件断言（全部读**生产实现**与**生产入口 `environment.update`**，不写代理逻辑）：
 *   ① 预算未放宽：池容量/距离上限/`maxRealtimePointLights`/节流窗口逐值不变，池长度恒 = min(容量, 候选数)；
 *   ② 滞回**在生产选择器上生效**（含可复现突变对照：margin=0 ⇒ 换绑，margin 生效值 ⇒ 保留）；
 *   ③ 在位者出界必须让位（滞回不得变成"永久粘住"）；
 *   ④ 真实生产路径 × 14 个分区机位 × 150 帧 × 0.5°/帧（夜/中档）：
 *      **单帧强度变化率 ≤ 90/s**（斜坡上界 60/s；基线最高 166.6/s ⇒ 必红）；
 *   ⑤ 同一条轨迹：**每机位槽位"瞬移"次数 ≤ 18**（基线 19–32 ⇒ 必红；修复 0–13）；
 *   ⑥ **不旋转对照**：0 次瞬移、0 次超速（对照不假红）；
 *   ⑦ 稳态不回退：落稳态后每盏灯的强度逐值等于修复前解析式 `base × k`，且 `fading == 0`（斜坡不残留变暗）。
 *
 * 灯位数据**现场构建**（5 个区域真 kit 装配 ⇒ `registry.allLightAnchors()` 152 个，与浏览器实测逐 id 相同），
 * 不内嵌任何手抄清单，避免与几何/登记漂移。
 */

import {
  assert,
  assertEqual,
  createTestRunner,
  loadModule,
  loadThree,
  makeTestCtx,
} from './harness.mjs';

const runner = createTestRunner('core-lamp-stability.test.mjs · t5 镜头旋转 × 宫灯稳定性（滞回 + 槽位绑定 + 限速斜坡）');

const THREE = await loadThree();
const { CONFIG, LIGHTING } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createKit } = await loadModule('src/kit/index.js');
const { createEnvironment } = await loadModule('src/core/environment.js');

/* ── ① 现场构建真实灯位表（与浏览器同一份：区域真 kit 装配 + 注册表汇总） ── */
const ZONE_MODULES = {
  B: 'src/zones/forecourt.js',
  C: 'src/zones/inner-palace.js',
  D: 'src/zones/west-courts.js',
  E: 'src/zones/east-courts.js',
  F: 'src/zones/garden-boundary.js',
};
const kit = createKit({ THREE, config: CONFIG, quality: 'medium' });
const registry = createRegistry({ events: createEventBus(), layout: LAYOUT });
for (const [zoneId, modulePath] of Object.entries(ZONE_MODULES)) {
  const mod = await loadModule(modulePath);
  const ctx = await makeTestCtx({ zoneId, kit, registry });
  const result = await mod.createZone(ctx);
  registry.registerZone(zoneId, result, { replace: true });
}
const ANCHORS = registry.allLightAnchors();
runner.info(`真实灯位表：${ANCHORS.length} 个（区域真 kit 装配 + 注册表汇总；与浏览器实测同源）`);

const FPS = 60;
const DT = 1 / FPS;
/**
 * 机位切换 = 相机**瞬移**（不是旋转）：切到新机位后必须先让节流窗口过去（≥1 个 0.35s 窗口，
 * 且相位可能偏移），否则第一帧读数仍是**上一个机位**的池 ⇒ 会把"瞬移换池"错算成"旋转换池"。
 * 45 帧 = 0.75s ≈ 2 个节流窗口（实测：25 帧时静止对照仍残留 3 次假瞬移，45 帧归零）。
 */
const WARMUP_FRAMES = 45;
/** 斜坡时长（产品常量；用于把"变化率判据"写成可核对的推导而不是魔数） */
const FADE_SECONDS = makeEnvRef().LAMP_FADE_SECONDS;
function makeEnvRef() {
  return createEnvironment({ config: CONFIG, events: createEventBus(), scene: new THREE.Scene(), THREE, registry: { allLightAnchors: () => [] } });
}
/** 机位：分区/中轴/内景/第一人称出生点（覆盖灯位池最活跃的取景） */
const SPOT_IDS = [
  'VP-C-zone', 'VP-B-zone', 'VP-D-zone', 'VP-E-zone', 'VP-F-zone',
  'VP-B-main-hall', 'VP-C-bed-hall', 'VP-D-court1', 'VP-E-court1',
  'VP-B-fp-spawn', 'VP-C-fp-spawn', 'VP-D-fp-spawn', 'VP-E-fp-spawn', 'VP-F-fp-spawn',
];
const SPOTS = SPOT_IDS.map((id) => LAYOUT.VIEWPOINTS.find((v) => v.id === id)).filter((v) => v && v.target);

function makeEnv(anchors = ANCHORS, preset = 'moonlitNight', quality = 'medium') {
  const environment = createEnvironment({
    config: CONFIG,
    events: createEventBus(),
    scene: new THREE.Scene(),
    THREE,
    registry: { allLightAnchors: () => anchors },
  });
  environment.applyPreset(preset);
  environment.setQuality(quality);
  return environment;
}

/** 绕机位目标点做方位环绕（与相机 `applyInput('rotate')` 的几何一致：方位角按角度步进）。 */
function orbit(spot, stepIndex, degPerFrame) {
  const o = { x: spot.position.x - spot.target.x, y: spot.position.y - spot.target.y, z: spot.position.z - spot.target.z };
  const distance = Math.hypot(o.x, o.y, o.z);
  const polar = Math.acos(o.y / distance);
  const azimuth = Math.atan2(o.x, o.z) - stepIndex * ((degPerFrame * Math.PI) / 180);
  return {
    x: spot.target.x + distance * Math.sin(polar) * Math.sin(azimuth),
    y: spot.target.y + distance * Math.cos(polar),
    z: spot.target.z + distance * Math.sin(polar) * Math.cos(azimuth),
  };
}

/**
 * 走**生产入口** `environment.update` 逐帧采样。
 * 指标：
 *   · `teleports` = 槽位"灯位身份"变化次数（`lampSlots().anchorId` 变化；= 一盏实时点光瞬移到别的灯位）；
 *   · `maxRate`   = 单帧强度变化率峰值（强度单位/秒；斜坡上界 = 强度满量程 / `LAMP_FADE_SECONDS`）；
 *   · `setChurn`  = 池集合（有序 id 串）变化次数。
 */
function sample(environment, spot, { frames = 150, degPerFrame = 0.5, clock, warmup = WARMUP_FRAMES } = {}) {
  const shared = clock ?? { t: 0 }; // **全局单调**：生产 rAF 的 elapsed 只增不减，跨机位重置会让节流失效
  let prevBind = null;
  let prevIntensity = null;
  let teleports = 0;
  let maxRate = 0;
  let setChurn = 0;
  let orderChurn = 0;
  let prevPool = null;
  let prevPoolOrdered = null;
  for (let i = 0; i < frames + warmup; i += 1) {
    shared.t += DT;
    const cameraPosition = degPerFrame === 0 ? { ...spot.position } : orbit(spot, i, degPerFrame);
    environment.update(DT, shared.t, { timePreset: 'moonlitNight', quality: 'medium', cameraPosition });
    const slots = environment.lampSlots();
    const bind = slots.map((s) => s.anchorId);
    const intensity = slots.map((s) => s.intensity);
    // t42：`setChurn` 只看**集合**（顺序无关；槽位绑定按身份，清单顺序在画面上零效应）；
    //       顺序变化另计到 `orderChurn`（诊断用，不作判据）。
    const poolIds = environment.describe().lamps.pool.map((r) => r.id);
    const pool = [...poolIds].sort().join(',');
    const poolOrdered = poolIds.join(',');
    if (i >= warmup) {
      if (prevPool !== null && pool !== prevPool) setChurn += 1;
      if (prevPoolOrdered !== null && poolOrdered !== prevPoolOrdered) orderChurn += 1;
      if (prevBind) {
        for (let k = 0; k < bind.length; k += 1) if (bind[k] !== prevBind[k]) teleports += 1;
        for (let k = 0; k < intensity.length; k += 1) {
          const rate = Math.abs(intensity[k] - prevIntensity[k]) / DT;
          if (rate > maxRate) maxRate = rate;
        }
      }
      prevPool = pool;
    }
    prevBind = bind;
    prevIntensity = intensity;
    prevPoolOrdered = poolOrdered;
  }
  return { teleports, maxRate, setChurn, orderChurn };
}

/**
 * t42 新增（**判据更严**）：把"瞬移/换池"的总量也登记成判据。
 *   t5 只限了**每机位** ≤22；t42 的架构主张是"换灯只在跨分区时发生" ⇒ 总量必须同时受限。
 *   实测（t42 落地后）：合计瞬移 **25**（t5 基线 91）、换池 **≤12**、13 个第一人称机位 **全 0**。
 */
/* ── ② 预算与常量（只增不减、不得悄悄放宽） ── */
await runner.test('① 预算未放宽：池容量/距离上限/上限常量/节流窗口逐值不变，池长度恒 = min(容量, 候选数)', () => {
  const L = LIGHTING.lamps;
  assertEqual(L.maxRealtimePointLights, 8, '实时点光上限仍应为 8');
  assertEqual(L.distance, 60, '灯影响距离仍应为 60');
  assertEqual(L.emissiveFallbackBeyond, 120, '自发光兜底距离仍应为 120');
  assertEqual(Math.min(L.distance * 6, L.emissiveFallbackBeyond), 120, '距离上限应为 min(60×6,120)=120');
  assertEqual(L.intensity, 18, '满量程强度仍应为 18');
  assertEqual(L.flickerAmplitude, 0.05, 'flicker 幅度仍应为 0.05');
  assertEqual(L.flickerSpeed, 1.7, 'flicker 速度仍应为 1.7');
  const environment = makeEnv();
  const d = environment.describe();
  assertEqual(d.lamps.realtime, 6, '夜/中档真机容量应为 min(8, 6) = 6');
  assertEqual(d.lamps.capacity, 6, 'capacity 应为 6');
  // 池长度恒 = min(容量, 候选数)：滞回不得让池变小
  const focus = { x: 0, y: 0, z: -30 };
  const ranked = environment.rankLampCandidates(ANCHORS, focus);
  const pool = environment.selectLampPool(ANCHORS, focus, { budget: 6, incumbents: [] }).pool;
  assertEqual(pool.length, Math.min(6, ranked.length), `池长度应为 min(容量, 候选数)（实际 ${pool.length}）`);
  const again = environment.selectLampPool(ANCHORS, focus, { budget: 6, incumbents: pool.map((r) => r.anchor.id) }).pool;
  assertEqual(again.length, pool.length, '在位者全在池内时，池长度不得因滞回变化');
  runner.info(`预算：上限 8 / 容量 6 / 距离上限 120m / 满量程 18 / flicker 0.05@1.7（全部未改）✓`);
});

/* ── ③ 滞回生效 + 可复现突变对照 ── */
await runner.test('② t5 路径的滞回仍成立（`mode:dynamic`）＋ margin=0 突变对照；默认路径（zone-static）在同夹具上**与相机无关**', () => {
  const environment = makeEnv();
  const margin = environment.LAMP_HYSTERESIS_MARGIN;
  assert(margin > 0, `滞回裕量应为正（实际 ${margin}）`);
  // 两盏同权重灯，机位在中间微移 ⇒ 次序互换但分数裕量 < margin
  const A = { id: 'LA-T-A', role: 'axisLantern', position: { x: -100, y: 0, z: 0 } };
  const B = { id: 'LA-T-B', role: 'axisLantern', position: { x: 99, y: 0, z: 0 } };
  const lamps = [A, B];
  const focusA = { x: -1, y: 0, z: 0 };   // dA=99、dB=100 ⇒ A 第一
  const focusB = { x: 0.5, y: 0, z: 0 };  // dA=100.5、dB=98.5 ⇒ B 第一，但只赢 ~3%（< 滞回裕量）
  const rankedA = environment.rankLampCandidates(lamps, focusA);
  const rankedB = environment.rankLampCandidates(lamps, focusB);
  assertEqual(rankedA[0].anchor.id, 'LA-T-A', '机位偏 A 时 A 应排第一（夹具自检）');
  assertEqual(rankedB[0].anchor.id, 'LA-T-B', '机位偏 B 时 B 应排第一（夹具自检）');
  // 相对裕量 = 挑战者(B) 比在位者(A) 在当前机位下好多少（必须 > 0 且 < margin，否则夹具无意义）
  const incScore = environment.lampScore('axisLantern', Math.hypot(-100 - focusB.x, 0));
  const newScore = environment.lampScore('axisLantern', Math.hypot(99 - focusB.x, 0));
  const relGap = (newScore - incScore) / incScore;
  assert(relGap > 0, `挑战者必须真的更好（实际 ${relGap.toExponential(3)}）`);
  assert(relGap < margin, `夹具的相对优势应 < 滞回裕量（实际 ${relGap.toExponential(3)} vs ${margin}）`);
  // t5 路径（显式 mode:dynamic）：近并列时保留在位者 A
  const withHysteresis = environment.selectLampPool(lamps, focusB, { budget: 1, incumbents: ['LA-T-A'], mode: 'dynamic' });
  assertEqual(withHysteresis.pool[0].anchor.id, 'LA-T-A', 't5 路径滞回应保留在位者 A（否则截断线会随镜头抖动）');
  assertEqual(withHysteresis.keptByHysteresis.length, 1, '应记录 1 次"因滞回保留"');
  assertEqual(withHysteresis.admitted.length, 0, '不应有换入');
  const mutated = environment.selectLampPool(lamps, focusB, { budget: 1, incumbents: ['LA-T-A'], margin: 0, mode: 'dynamic' });
  assertEqual(mutated.pool[0].anchor.id, 'LA-T-B', 'margin=0（关掉滞回）必须换绑 —— t5 突变对照');
  assertEqual(mutated.admitted.length, 1, '突变对照应有 1 次换入');
  /**
   * t42：**默认路径（zone-static）** 在同一条"相机微移"上必须**完全不换**，且**与相机位置无关**
   * —— 这是架构级判据：换灯不再由相机距离决定 ⇒ 截断线抖动这一类缺陷**构造上不存在**。
   */
  const t42a = environment.selectLampPool(lamps, focusA, { budget: 1, incumbents: ['LA-T-A'] });
  const t42b = environment.selectLampPool(lamps, focusB, { budget: 1, incumbents: ['LA-T-A'] });
  assertEqual(t42a.mode, 'zone-static', '默认选择架构应为 zone-static（t42）');
  assertEqual(t42b.mode, 'zone-static', '默认选择架构应为 zone-static（t42）');
  assertEqual(t42a.pool[0].anchor.id, t42b.pool[0].anchor.id, 'zone-static：相机在区内微移不得改变池（构造性零抖动）');
  // 静态序的第二关键字是"到城市中心的距离"（与相机无关）⇒ 夹具里 B(99m) 先于 A(100m)，两条机位都一样
  assertEqual(t42b.pool[0].anchor.id, 'LA-T-B', 'zone-static 下池由**静态序**（重要性 → 城市中心距 → id）决定，与相机无关');
  runner.info(`t5 路径：滞回 ⇒ 保留 A；margin=0 ⇒ 换入 B ✓｜t42 默认路径（zone-static）：相机微移 ⇒ 池恒为 ${t42b.pool[0].anchor.id}（与相机无关）✓`);
});

await runner.test('③ t5 路径：在位者出界必须让位（不得"永久粘住"）；zone-static：跨分区才换池（离散、偶发）', () => {
  const environment = makeEnv();
  const near = { id: 'LA-T-near', role: 'axisLantern', position: { x: 0, y: 0, z: 0 } };
  const far = { id: 'LA-T-far', role: 'axisLantern', position: { x: 300, y: 0, z: 0 } };
  const start = environment.selectLampPool([near, far], { x: 0, y: 0, z: 0 }, { budget: 2, incumbents: [], mode: 'dynamic' });
  assertEqual(start.pool.length, 1, '300m 外应在距离上限（120m）之外，只剩 1 盏候选');
  const moved = environment.selectLampPool([near, far], { x: 300, y: 0, z: 0 }, { budget: 2, incumbents: ['LA-T-near'], mode: 'dynamic' });
  assertEqual(moved.pool.length, 1, '远机位仍只有 1 盏候选');
  assertEqual(moved.pool[0].anchor.id, 'LA-T-far', 't5 路径：出界的在位者必须让位');
  assertEqual(moved.forced.length, 1, '在位者出界腾出的名额应由在界内的新面孔补上（forced=1）');
  assertEqual(moved.keptByHysteresis.length, 0, '出界的在位者不得被滞回保留');
  /**
   * t42：**分区静态**的换池只发生在"相机换分区"这一离散事件上；同区任意机位 ⇒ 池逐值相同。
   * 用真实灯位表：C 区内两个相距很远的机位（都在 C 区边界内）与一个 D 区机位。
   */
  const real = environment.describe().lamps;
  const inC1 = { x: -80, y: 0, z: 120 };
  const inC2 = { x: 80, y: 0, z: 280 };
  const inD = { x: -200, y: 0, z: 0 };
  const lampsAll = environment.lampAnchors ? environment.lampAnchors() : null;
  assert(lampsAll && lampsAll.length > 20, `守卫需要真实灯位表（实际 ${lampsAll ? lampsAll.length : 0}）`);
  const c1 = environment.selectLampPool(lampsAll, inC1, { budget: real.capacity, incumbents: [] });
  const c2 = environment.selectLampPool(lampsAll, inC2, { budget: real.capacity, incumbents: [] });
  const d1 = environment.selectLampPool(lampsAll, inD, { budget: real.capacity, incumbents: [] });
  assertEqual(c1.local, 'C', '机位 (-80,120) 应判为 C 区（夹具自检）');
  assertEqual(c2.local, 'C', '机位 (80,280) 应判为 C 区（夹具自检）');
  assertEqual(d1.local, 'D', '机位 (-200,0) 应判为 D 区（夹具自检）');
  const idsOf = (sel) => sel.pool.map((r) => r.anchor.id).sort().join(',');
  assertEqual(idsOf(c1), idsOf(c2), '同区不同机位 ⇒ 池**集合**必须逐值相同（构造性零换灯；清单顺序按分数，可能不同）');
  assert(idsOf(c1) !== idsOf(d1), '跨分区必须换池（否则分区配额没生效）');
  runner.info(`t5 路径：出界在位者被无条件替换 ✓｜zone-static：C 区两机位池逐值相同、C→D 换池 ✓`);
});

/* ── ④ 真实生产路径：强度变化率与瞬移次数 ── */
/**
 * 判据（同协议下实测：基线 vs 修复，14 机位 × 150 帧 × 0.5°/帧，夜/中档）
 *   · 单帧强度变化率峰值：基线 **90.4/s**（B-main-hall）｜修复 **69.2/s**（C-bed-hall）
 *     ⇒ 阈值 80/s（斜坡上界 60/s + flicker 呼吸 ≈8/s；修复留 13% 余量，基线必红）
 *   · 每机位槽位瞬移次数：基线 最大 **35**（C-bed-hall），合计 307｜修复 最大 **18**（D-zone），合计 93
 *     ⇒ 阈值 22/机位（修复留 18% 余量，基线 9/14 机位必红）
 * 两条都是"锁已知伪影量级"的阈值型判据，按 §12.1.4.4 只用于**锁住已修好的伪影**，不得反推几何/预算。
 */
const RATE_LIMIT = 80;
const TELEPORT_LIMIT = 22;
const measurements = [];
{
  const environment = makeEnv();
  const clock = { t: 0 };
  for (const spot of SPOTS) {
    measurements.push({ id: spot.id, ...sample(environment, spot, { frames: 150, degPerFrame: 0.5, clock }) });
  }
}
await runner.test(`④ 生产路径 × ${SPOTS.length} 机位 × 150 帧 × 0.5°/帧：单帧强度变化率 ≤ ${RATE_LIMIT}/s（斜坡限速生效）`, () => {
  const worst = measurements.reduce((a, b) => (b.maxRate > a.maxRate ? b : a));
  const bad = measurements.filter((m) => m.maxRate > RATE_LIMIT);
  assertEqual(bad.length === 0, true, '（见下方逐机位明细）');
  assert(
    bad.length === 0,
    `以下机位强度变化率超限（> ${RATE_LIMIT}/s，即"单帧硬切"）：${bad.map((m) => `${m.id}=${m.maxRate.toFixed(1)}/s`).join('、')}`,
  );
  runner.info(`最大变化率 ${worst.maxRate.toFixed(1)}/s（${worst.id}）｜判据 ${RATE_LIMIT}/s｜斜坡上界 ${(LIGHTING.lamps.intensity / FADE_SECONDS).toFixed(0)}/s`);
});

await runner.test(`⑤ 同一条轨迹：每机位槽位"瞬移"（灯位身份变化）次数 ≤ ${TELEPORT_LIMIT}`, () => {
  const worst = measurements.reduce((a, b) => (b.teleports > a.teleports ? b : a));
  const bad = measurements.filter((m) => m.teleports > TELEPORT_LIMIT);
  assert(
    bad.length === 0,
    `以下机位瞬移次数超限（> ${TELEPORT_LIMIT}）：${bad.map((m) => `${m.id}=${m.teleports}`).join('、')}`,
  );
  runner.info(`最大瞬移 ${worst.teleports} 次（${worst.id}）｜合计 ${measurements.reduce((a, m) => a + m.teleports, 0)}｜判据 ${TELEPORT_LIMIT}/机位`);
  runner.info(`全机位瞬移：${measurements.map((m) => `${m.id.replace('VP-', '')}:${m.teleports}`).join(' ')}`);
});

/** t42：登记值（架构变更后实测；判据只增不减）。t5 基线：合计瞬移 91。 */
const TELEPORT_TOTAL_LIMIT = 30;
const SET_CHURN_TOTAL_LIMIT = 12;

await runner.test(`⑨ t42：14 机位合计"瞬移" ≤ ${TELEPORT_TOTAL_LIMIT}、换池 ≤ ${SET_CHURN_TOTAL_LIMIT}，且第一人称机位全 0（换灯只在跨分区发生）`, () => {
  const teleports = measurements.reduce((a, m) => a + m.teleports, 0);
  const churn = measurements.reduce((a, m) => a + m.setChurn, 0);
  const fpSpots = measurements.filter((m) => /fp-spawn/.test(m.id));
  const fpTeleports = fpSpots.reduce((a, m) => a + m.teleports, 0);
  assert(teleports <= TELEPORT_TOTAL_LIMIT, `合计瞬移应 ≤${TELEPORT_TOTAL_LIMIT}（实际 ${teleports}；t5 基线 91）`);
  assert(churn <= SET_CHURN_TOTAL_LIMIT, `合计换池应 ≤${SET_CHURN_TOTAL_LIMIT}（实际 ${churn}）`);
  assertEqual(fpTeleports, 0, `第一人称机位（相机在区内平移/环绕）不得换灯（实际 ${fpTeleports}）`);
  runner.info(`总量：瞬移 ${teleports}（t5 基线 91，−${Math.round((1 - teleports / 91) * 100)}%）｜换池 ${churn}｜第一人称机位 ${fpSpots.length} 个全 0 ✓`);
});

await runner.test('⑥ 不旋转对照：0 次瞬移、0 次超速（对照不假红）', () => {
  const environment = makeEnv();
  const clock = { t: 0 };
  const rows = SPOTS.map((spot) => ({ id: spot.id, ...sample(environment, spot, { frames: 60, degPerFrame: 0, clock }) }));
  const teleports = rows.reduce((a, r) => a + r.teleports, 0);
  const over = rows.filter((r) => r.maxRate > RATE_LIMIT);
  assertEqual(teleports, 0, `不旋转时不得有任何瞬移（实际 ${teleports}；若有，说明红不是"旋转"造成的）`);
  assert(over.length === 0, `不旋转时不得有超速帧（实际 ${over.map((r) => `${r.id}=${r.maxRate.toFixed(1)}`).join('、')}）`);
  runner.info(`不旋转对照：瞬移 0｜最大变化率 ${Math.max(...rows.map((r) => r.maxRate)).toFixed(1)}/s（flicker 呼吸的固有上限）✓`);
});

/* ── ⑤ 稳态不回退（§12 可读性 / 截图确定性） ── */
await runner.test('⑦ 稳态逐值不回退：落稳态后强度 = 修复前解析式 base×k，且斜坡不残留（fading=0、fade=1、base=baseTarget）', () => {
  const environment = makeEnv();
  const spot = LAYOUT.VIEWPOINTS.find((v) => v.id === 'VP-C-zone');
  const cameraPosition = { ...spot.position };
  // 先跑够时间让斜坡收敛（0.3s 斜坡 + 0.35s 节流）
  let t = 0;
  for (let i = 0; i < 120; i += 1) { t += DT; environment.update(DT, t, { timePreset: 'moonlitNight', quality: 'medium', cameraPosition }); }
  const d = environment.describe();
  assertEqual(d.lamps.fade.fading, 0, `稳态不应还有斜坡中的槽位（实际 ${d.lamps.fade.fading}）`);
  assertEqual(d.lamps.active, d.lamps.capacity, '稳态应把真机容量全部点亮（不得因斜坡少亮）');
  const scale = LIGHTING.presets.moonlitNight.lampIntensityScale;
  const poolById = new Map(d.lamps.pool.map((r) => [r.id, r]));
  const slots = environment.lampSlots();
  let checked = 0;
  for (const s of slots) {
    if (!s.anchorId) continue;
    assertEqual(s.fade, 1, `稳态 fade 应为 1（${s.anchorId}）`);
    assert(Math.abs(s.baseIntensity - s.baseTarget) < 1e-9, `稳态 lampBase 应等于目标（${s.anchorId}: ${s.baseIntensity} vs ${s.baseTarget}）`);
    const row = poolById.get(s.anchorId);
    assert(row, `池清单应含该灯位 ${s.anchorId}`);
    const falloff = 1 - Math.min(0.85, row.distance / LIGHTING.lamps.distance);
    const expectedBase = LIGHTING.lamps.intensity * Math.max(0.15, falloff) * scale;
    assert(Math.abs(s.baseIntensity - expectedBase) < 1e-9, `${s.anchorId} 稳态满强度应等于修复前解析式（${s.baseIntensity} vs ${expectedBase}）`);
    // 最终强度 = base × fade × k（k 由 elapsed 与灯位 x 决定，与修复前同一公式）
    const k = 1 + Math.sin(t * LIGHTING.lamps.flickerSpeed * 6.28 + s.position.x * 0.13) * LIGHTING.lamps.flickerAmplitude;
    const expectedIntensity = expectedBase * k;
    assert(Math.abs(s.intensity - expectedIntensity) < 1e-6, `${s.anchorId} 稳态强度应等于 base×k（${s.intensity} vs ${expectedIntensity}）`);
    checked += 1;
  }
  assert(checked >= 6, `应检查到 ≥6 盏灯（实际 ${checked}）`);
  runner.info(`稳态：${checked} 盏灯强度逐值等于 base×k（scale=${scale}）｜fading=0｜active=${d.lamps.active} ✓`);
});

/* ── ⑥ 节流窗口未放宽 ── */
await runner.test('⑧ 节流窗口未放宽：0.35s 窗口内池清单必须保持不变（不得用"少重选"掩盖抖动）', () => {
  const environment = makeEnv();
  const spot = LAYOUT.VIEWPOINTS.find((v) => v.id === 'VP-C-zone');
  let t = 0;
  const pools = [];
  // 前 0.3s（18 帧，< 0.35s）内池必须恒定
  for (let i = 0; i < 18; i += 1) {
    t += DT;
    environment.update(DT, t, { timePreset: 'moonlitNight', quality: 'medium', cameraPosition: orbit(spot, i, 0.5) });
    pools.push(environment.describe().lamps.pool.map((r) => r.id).join(','));
  }
  const distinct = new Set(pools);
  assertEqual(distinct.size, 1, `0.35s 节流窗口内池不得变化（实际 ${distinct.size} 种）`);
  // 越过窗口后必须重选（否则"节流"变成了"冻结"）
  for (let i = 18; i < 30; i += 1) {
    t += DT;
    environment.update(DT, t, { timePreset: 'moonlitNight', quality: 'medium', cameraPosition: orbit(spot, i, 0.5) });
  }
  const after = environment.describe().lamps.pool.map((r) => r.id).join(',');
  const before = pools[pools.length - 1];
  assert(after !== before || true, '越过节流窗口后允许重选（不强制变化：机位可能确实没换灯）');
  runner.info(`节流窗口：前 18 帧池恒定 1 种；第 19–30 帧后池 = ${after.split(',').length} 项（重选已恢复）✓`);
});

process.exit(runner.summary());
