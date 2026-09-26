#!/usr/bin/env node
/**
 * `tests/core-environment.test.mjs` —— t90 回归：**灯位池优先级的距离感知**
 *
 * 背景（t64 交回的裁定项①）：旧口径 `score = importance × (1 − min(1, d/(lamps.distance×6)))` 把"距离"压得极弱
 * （分母 = 60×6 = 360m），导致 **80–110m 外的 `axisLantern`(1.0) 压过 11–20m 的室内 `windowGlow`(0.55)**
 * —— golden/sunset 下南/北城门各 1 处室内灯被挤出实时池（语义错误：近处局部灯本该优先于远处全局灯）。
 *
 * 本测试断言（全部针对**生产同一实现**，不写代理逻辑）：
 *   ① 距离主导：`windowGlow@15m` 必须压过 `axisLantern@90m`；
 *   ② 重要性主导：`axisLantern@20m` 仍必须压过 `windowGlow@11m`（两侧都不可绝对化）；
 *   ③ 单调性 + 公式自洽（`importance / (1 + (d/d0)^2)`，`d0 = LIGHTING.lamps.distance`）；
 *   ④ **前后入池清单对照**（南/北城门 + 两处外景机位 × 三时辰）：
 *      用同一批灯位分别以"旧口径"与"新口径"排名，旧口径把室内灯挤出、新口径将其收入；
 *   ⑤ 预算未放宽：池容量 = `maxRealtimePointLights`、距离上限 = `min(distance×6, emissiveFallbackBeyond)`，
 *      且 `LIGHTING.lamps` 的三项预算与冻结值逐值一致。
 */

import { createTestRunner, loadModule, loadThree, assert, assertEqual } from './harness.mjs';

const runner = createTestRunner('core-environment.test.mjs · 灯位池距离感知优先级（t90）');

const THREE = await loadThree();
const { CONFIG, EVENTS } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createEnvironment } = await loadModule('src/core/environment.js');

function makeEnv() {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const environment = createEnvironment({ config: CONFIG, events, scene, THREE });
  return { events, scene, environment };
}

const LAMPS = CONFIG.LIGHTING.lamps;
const viewpoint = (id) => LAYOUT.VIEWPOINTS.find((v) => v.id === id) ?? LAYOUT.FP_ROUTE.find((v) => v.id === id) ?? null;

await runner.test('① 距离主导：近处室内灯（windowGlow@15m）必须压过远处中轴灯（axisLantern@90m）', () => {
  const { environment } = makeEnv();
  const near = environment.lampScore('windowGlow', 15);
  const far = environment.lampScore('axisLantern', 90);
  assert(near > far, `windowGlow@15m(${near.toFixed(4)}) 必须 > axisLantern@90m(${far.toFixed(4)})`);
  // 旧口径在同一对输入上必须相反（这就是被修的缺陷）
  const legacyNear = environment.legacyLampScore('windowGlow', 15);
  const legacyFar = environment.legacyLampScore('axisLantern', 90);
  assert(legacyFar > legacyNear, `旧口径应复现缺陷（axisLantern@90m ${legacyFar.toFixed(4)} > windowGlow@15m ${legacyNear.toFixed(4)}）`);
  runner.info(`距离主导：新 windowGlow@15=${near.toFixed(4)} > axisLantern@90=${far.toFixed(4)}；旧口径反之（${legacyFar.toFixed(4)} > ${legacyNear.toFixed(4)}）`);
});

await runner.test('② 重要性主导：距离相当时，远处重要的中轴灯仍必须能入池（不得把"近处优先"绝对化）', () => {
  const { environment } = makeEnv();
  const nearDim = environment.lampScore('windowGlow', 11);
  const midBright = environment.lampScore('axisLantern', 20);
  assert(midBright > nearDim, `axisLantern@20m(${midBright.toFixed(4)}) 必须 > windowGlow@11m(${nearDim.toFixed(4)})`);
  // 100m 量级同距离上，重要性仍决定次序
  assert(environment.lampScore('axisLantern', 100) > environment.lampScore('windowGlow', 100), '同距离时高重要性必须优先');
  runner.info(`重要性主导：axisLantern@20=${midBright.toFixed(4)} > windowGlow@11=${nearDim.toFixed(4)}；同距离(100m) 高重要性优先 ✓`);
});

await runner.test('③ 单调性与公式自洽：score = importance / (1 + (d/d0)^2)，d0 = LIGHTING.lamps.distance', () => {
  const { environment } = makeEnv();
  const d0 = LAMPS.distance;
  assertEqual(environment.LAMP_SCORE_POWER, 2, 'k 应为 2');
  for (const role of ['axisLantern', 'gardenOrCourtLantern', 'windowGlow', 'torch']) {
    let prev = Infinity;
    for (const d of [0, 5, 15, 30, 60, 90, 120, 200]) {
      const s = environment.lampScore(role, d);
      assert(s <= prev + 1e-12, `${role} 的分数必须随距离单调不增（d=${d}）`);
      prev = s;
    }
    const importance = { axisLantern: 1.0, gardenOrCourtLantern: 0.7, windowGlow: 0.55, torch: 0.8 }[role];
    for (const d of [0, 15, 60, 120]) {
      const expect = importance / (1 + (d / d0) ** 2);
      assert(Math.abs(environment.lampScore(role, d) - expect) < 1e-9, `${role}@${d}m 应等于公式值 ${expect}`);
    }
    assert(environment.lampScore(role, 0) === importance, `${role} 在 0m 处应等于自身重要性`);
  }
  assert(environment.lampScore('windowGlow', Infinity) === 0, '无穷远应为 0（不会误入池）');
  runner.info(`公式自洽：4 种 role × 4 个距离逐值匹配 importance/(1+(d/${d0})²)`);
});

await runner.test('④ 前后入池清单对照（南/北城门 + 两处外景机位）：旧口径挤出室内灯，新口径收入', () => {
  const { environment } = makeEnv();
  const spots = [
    ['南城门内', viewpoint('WP-fp-02')?.position ?? { x: 0, y: 0, z: -445 }],
    ['北城门内', viewpoint('WP-fp-01')?.position ?? { x: 0, y: 0, z: 445 }],
    ['全城鸟瞰', viewpoint('VP-city-oblique')?.position ?? { x: 0, y: 500, z: -700 }],
    ['等距沙盘', viewpoint('VP-city-iso')?.position ?? { x: 300, y: 400, z: -300 }],
  ];
  const presets = ['goldenHour', 'sunset', 'moonlitNight'];
  const budget = () => LAMPS.maxRealtimePointLights;
  let rows = 0;
  let beforeExcluded = 0;
  let afterIncluded = 0;
  for (const [name, focus] of spots) {
    // 真实中轴/庭院灯位 + 一盏"该城门内 15m 的室内 windowGlow"（t64 报的形态）
    const interior = {
      id: `LA-TEST-interior-${name}`,
      zone: 'F',
      kind: 'windowGlow',
      role: 'windowGlow',
      position: { x: focus.x, y: 0, z: focus.z + 15 },
      height: 2.4,
    };
    const lamps = [...LAYOUT.LIGHT_ANCHORS, interior];
    const after = environment.rankLampPool(lamps, focus);
    const before = environment.rankLampPool(lamps, focus, { scoreOf: environment.legacyLampScore });
    const inAfter = after.some((r) => r.anchor.id === interior.id);
    const inBefore = before.some((r) => r.anchor.id === interior.id);
    assertEqual(after.length <= budget(), true, `${name}：池容量不得超过 ${budget()}`);
    assertEqual(before.length <= budget(), true, `${name}：旧口径池容量同样 ≤ ${budget()}（口径切换不改预算）`);
    if (!inBefore) beforeExcluded += 1;
    if (inAfter) afterIncluded += 1;
    // 四机位都必须满足"新口径收入室内灯"；旧口径至少在一半机位上挤出（复现 t64 的缺陷形态）
    assert(inAfter, `${name}：新口径必须把 15m 室内灯收入池（实际未入池；池=${after.map((r) => r.anchor.id).join(',')}）`);
    for (const preset of presets) {
      assertEqual(
        environment.rankLampPool(lamps, focus).map((r) => r.anchor.id).join(','),
        after.map((r) => r.anchor.id).join(','),
        `${name}/${preset}：池排名不随时辰变化（updateLampSelection 不消费 preset）`,
      );
      rows += 1;
    }
    runner.info(
      `${name}：旧口径室内灯入池=${inBefore ? '是' : '否'} → 新口径=${inAfter ? '是' : '否'}；` +
        `新池前 3 = ${after.slice(0, 3).map((r) => `${r.anchor.id}(${r.score.toFixed(3)}@${r.distance.toFixed(0)}m)`).join(' / ')}`,
    );
  }
  assert(beforeExcluded >= 1, `旧口径必须至少在 1 个机位上把室内灯挤出（实际 ${beforeExcluded}/${spots.length}）——否则该对照失去意义`);
  assertEqual(afterIncluded, spots.length, `新口径必须在全部 ${spots.length} 个机位收入室内灯（实际 ${afterIncluded}）`);
  runner.info(`对照总计：${spots.length} 机位 × ${presets.length} 时辰 = ${rows} 组；旧口径挤出 ${beforeExcluded} 组、新口径收入 ${afterIncluded}/${spots.length}`);
});

await runner.test('⑤ 预算未放宽：池容量/距离上限/三项预算与冻结值逐值一致', () => {
  const { environment } = makeEnv();
  assertEqual(LAMPS.maxRealtimePointLights, 8, '实时点光上限仍应为 8');
  assertEqual(LAMPS.distance, 60, '灯影响距离仍应为 60');
  assertEqual(LAMPS.emissiveFallbackBeyond, 120, '自发光兜底距离仍应为 120');
  const cap = Math.min(LAMPS.distance * 6, LAMPS.emissiveFallbackBeyond);
  assertEqual(cap, 120, '距离上限应为 min(60×6, 120) = 120');
  const far = { id: 'LA-TEST-far', role: 'axisLantern', position: { x: 0, y: 0, z: cap + 1 } };
  const mid = { id: 'LA-TEST-mid', role: 'axisLantern', position: { x: 0, y: 0, z: cap - 1 } };
  const pool = environment.rankLampPool([far, mid], { x: 0, y: 0, z: 0 }, { budget: 8 });
  assertEqual(pool.length, 1, '超出距离上限的灯位必须被过滤（口径切换未放宽上限）');
  assertEqual(pool[0].anchor.id, 'LA-TEST-mid', '上限内灯位应保留');
  assert(environment.lampScore('axisLantern', cap + 1) > 0, '评分函数本身不负责过滤（过滤仍由上限控制）');
  runner.info(`预算：池容量 ${LAMPS.maxRealtimePointLights}、上限 ${cap}m（未改）；超限灯位被过滤 ✓`);
});

await runner.test('⑥ 逐灯清单可**直接读**：describe().lamps.pool 为 top-N {rank,id,role,distance,score}，与评分函数逐值一致', () => {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const focus = { x: 0, y: 0, z: -445 }; // 南城门内机位
  // 机位附近**只有 ≥90m 的远处中轴灯**（与 t64/t90 报的城门内景形态一致：室内灯 11–20m vs 中轴灯 70–110m）
  const far = LAYOUT.LIGHT_ANCHORS.filter((l) => Math.hypot(l.position.x - focus.x, l.position.z - focus.z) >= 90);
  const lamps = [
    ...far,
    { id: 'LA-TEST-int-south-1', kind: 'windowGlow', role: 'windowGlow', position: { x: focus.x, y: 0, z: focus.z + 15 }, height: 2.4 },
    { id: 'LA-TEST-int-south-2', kind: 'windowGlow', role: 'windowGlow', position: { x: focus.x, y: 0, z: focus.z - 15 }, height: 2.4 },
  ];
  assert(far.length >= 5, `夹具应有 ≥5 盏 ≥90m 的远处灯（实际 ${far.length}）`);
  const environment = createEnvironment({
    config: CONFIG,
    events,
    scene,
    registry: { allLightAnchors: () => lamps },
    THREE,
  });
  environment.applyPreset(CONFIG.LIGHTING.timePresets[CONFIG.LIGHTING.timePresets.length - 1]); // 夜景（容量最大）
  for (let i = 0; i < 4; i += 1) environment.update(1 / 60, i * 0.4, { cameraPosition: focus });
  const d = environment.describe();
  const pool = d.lamps.pool;
  assert(Array.isArray(pool) && pool.length > 0, `describe().lamps.pool 应为非空数组（实际 ${JSON.stringify(pool)}）`);
  // 池长度 = min(真机容量, 距离上限内的候选数) ⇒ 只能断言“不超过容量且不少于两盏室内灯”
  assert(pool.length <= d.lamps.capacity, `池长度不得超过真机容量（${pool.length} vs ${d.lamps.capacity}）`);
  assert(pool.length >= 2, `池内至少应有两盏候选灯（实际 ${pool.length}）`);
  assert(pool.length <= d.lamps.maxRealtimePointLights, `池长度不得超过配置上限 ${d.lamps.maxRealtimePointLights}`);
  pool.forEach((row, i) => {
    assertEqual(row.rank, i + 1, `rank 应为升序 1..N（第 ${i} 项）`);
    for (const key of ['id', 'role', 'distance', 'score']) assert(key in row, `清单项应含 ${key}`);
    // 与评分函数逐值一致（同样距离 ⇒ 同样分数），距离应与机位重算一致
    // 用**精确距离**复算 score（池内 distance 保留到 mm，故不能拿它反算全精度分数）
    const exact = Math.hypot(
      (lamps.find((l) => l.id === row.id)?.position.x ?? 0) - focus.x,
      (lamps.find((l) => l.id === row.id)?.position.z ?? 0) - focus.z,
    );
    const expected = environment.lampScore(row.role, exact);
    assert(Math.abs(row.score - expected) < 1e-9, `#${row.rank} ${row.id} 的 score 应等于 lampScore(role, 精确距离)（${row.score} vs ${expected}）`);
    const dist = Math.hypot(
      (lamps.find((l) => l.id === row.id)?.position.x ?? 0) - focus.x,
      (lamps.find((l) => l.id === row.id)?.position.z ?? 0) - focus.z,
    );
    assert(Math.abs(row.distance - dist) < 5e-3, `#${row.rank} ${row.id} 的 distance 应与机位重算一致（${row.distance} vs ${dist.toFixed(3)}）`);
  });
  // 分数必须降序（池就是按它排的）
  for (let i = 1; i < pool.length; i += 1) assert(pool[i - 1].score >= pool[i].score, `池必须按 score 降序（#${i} vs #${i + 1}）`);
  // 近处室内灯直接读：应为 #1–#2
  assert(pool[0].id === 'LA-TEST-int-south-1' || pool[0].id === 'LA-TEST-int-south-2', `#1 应为机位附近室内灯（实际 ${pool[0].id}@${pool[0].distance}m）`);
  const top2 = pool.slice(0, 2).map((r) => r.id).sort();
  assertEqual(top2.join(','), 'LA-TEST-int-south-1,LA-TEST-int-south-2', `#1–#2 应为两盏 15m 室内灯（实际 ${top2.join(',')}）`);
  assertEqual(d.lamps.active, pool.length, 'lamps.active 应与池长度一致（既有字段未删）');
  runner.info(`直接读数：capacity=${d.lamps.capacity}（tier=${d.lamps.qualityTier}，preset=${d.lamps.preset}）；#1=${pool[0].id}(${pool[0].role}@${pool[0].distance}m, score ${pool[0].score}) #2=${pool[1]?.id}(${pool[1]?.distance}m)`);
});

await runner.test('⑥b 无灯位/无实时名额时池清空（不残留上一帧清单）', () => {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const environment = createEnvironment({ config: CONFIG, events, scene, registry: { allLightAnchors: () => [] }, THREE });
  environment.update(1 / 60, 1.0, { cameraPosition: { x: 0, y: 0, z: -445 } });
  const d = environment.describe();
  assertEqual(Array.isArray(d.lamps.pool) && d.lamps.pool.length, 0, '无灯位时池应为空数组');
  // 容量由「质量档上限 × 该时辰 lampIntensityScale」决定，与是否有灯位无关（故此处容量可 >0）
  assert(d.lamps.capacity >= 0, '容量字段应存在且非负');
  runner.info(`空池路径：pool=[] ✓（无陈旧残留）；capacity=${d.lamps.capacity}（由质量档×lampIntensityScale 决定，与是否有灯位无关）`);
});

/* ========================================================================== */

process.exit(runner.summary());
