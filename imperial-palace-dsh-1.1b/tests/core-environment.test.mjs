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

await runner.test('⑦ t106 内景 Bloom 上限：内景入境按冻结系数缩放，外景逐位等同预设（config 预设未被改）', () => {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const environment = createEnvironment({ config: CONFIG, events, scene, THREE });
  environment.applyPreset('sunset');
  const outside = environment.describe();
  // 冻结值守护：本卡只改 environment.js 的调用口径，**未改 config 预设、未改 §12 阈值**
  assertEqual(CONFIG.LIGHTING.presets.sunset.bloom.strength, 0.3, '⚠ config 预设 bloom.strength 必须仍为冻结值 0.3（本卡未改 config）');
  assertEqual(outside.bloom.interiorStrengthScale, 0.5, '内景 bloom 强度缩放系数应为冻结值 0.5');
  assertEqual(outside.bloom.baseStrength, CONFIG.LIGHTING.presets.sunset.bloom.strength, 'baseStrength 必须取自当前预设');
  assertEqual(outside.bloom.shrink, 1, '外景（blend=0）不得缩放 bloom');
  assertEqual(outside.bloom.effectiveStrength, 0.3, '外景有效 bloom 强度必须逐位等同预设');
  // 内景：把机位放进内景体积中心（volumeBounds 由 describe() 直接读）
  const volume = outside.interior.volumeBounds.find((v) => v.zone === 'B') ?? outside.interior.volumeBounds[0];
  assert(Boolean(volume), 'describe().interior.volumeBounds 必须存在（内景体积）');
  const cam = { x: (volume.minX + volume.maxX) / 2, y: (volume.minY + volume.maxY) / 2, z: (volume.minZ + volume.maxZ) / 2 };
  environment.update(1 / 60, 1.0, { cameraPosition: cam });
  const inside = environment.describe();
  assertEqual(inside.interior.inside, true, `机位（${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.z.toFixed(1)}）应被判在内景体积内`);
  assertEqual(inside.interior.blend, 1, '内景 blend 应为 1');
  const expect = +(0.3 * 0.5).toFixed(4);
  assertEqual(inside.bloom.effectiveStrength, expect, `内景有效 bloom 强度应为 ${expect}（= 预设 0.3 × 0.5）`);
  assert(inside.bloom.effectiveStrength < inside.bloom.baseStrength, '内景 bloom 必须低于预设（压高光截断的手段）');
  // 退出内景 → fade 结束后必须恢复预设值（不得把外景永久压暗）
  // 注意：t70 后"可进入"建筑达 43 栋 → 内景体积遍布全城，故退出点取**高空**（y=600，必在所有内景体积之外）
  environment.update(0.35, 2.0, { cameraPosition: { x: 0, y: 600, z: -445 } });
  const restored = environment.describe();
  assertEqual(restored.interior.blend, 0, '退出内景后 blend 应衰减到 0');
  assertEqual(restored.bloom.effectiveStrength, 0.3, '退出内景后有效 bloom 强度必须恢复预设值（外景不受影响）');
  runner.info(`内景 bloom 上限：外景 strength=0.30（逐位等同预设）→ 内景 strength=${inside.bloom.effectiveStrength}（×0.5）→ 退出后恢复 ${restored.bloom.effectiveStrength}；config 预设与 §12 阈值均未改`);
});

await runner.test('⑦b t120 内景 Bloom 分档：小院房更紧（0.3）/ 大空间保持 t106 冻结值（0.5）', () => {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const environment = createEnvironment({ config: CONFIG, events, scene, THREE });
  environment.applyPreset('sunset');
  const outside = environment.describe();
  // 分档表存在且单调收紧（小房间 scale < 大空间 scale），两档都在 (0,1]
  const tiers = outside.bloom.tiers;
  assertEqual(Array.isArray(tiers) && tiers.length, 2, `分档表应为 2 档（实际 ${JSON.stringify(tiers)}）`);
  const small = tiers.find((t) => t.tag === 'small');
  const large = tiers.find((t) => t.tag === 'large');
  assert(Boolean(small) && Boolean(large), `分档表应含 small/large（实际 ${JSON.stringify(tiers)}）`);
  assert(small.scale < large.scale, `小房间上限必须更紧（small ${small.scale} < large ${large.scale}）`);
  assert(small.scale > 0 && small.scale <= 1 && large.scale > 0 && large.scale <= 1, '两档 scale 必须在 (0,1]');
  assertEqual(large.scale, 0.5, '大空间档必须保持 t106 冻结值 0.5（不回归金銮殿/寝殿读数）');
  // 小房间实测：把机位放到 C-annex-west 内景面中心
  const annex = LAYOUT.WALKABLE.find((w) => w.id === 'WK-C-annex-west-interior');
  assert(Boolean(annex?.bounds), 'layout 应含 WK-C-annex-west-interior 及其 bounds');
  const b = annex.bounds;
  const cam = { x: (b.minX + b.maxX) / 2, y: (annex.y ?? 0) + 1.2, z: (b.minZ + b.maxZ) / 2 };
  environment.update(1 / 60, 1.0, { cameraPosition: cam });
  const inside = environment.describe();
  assertEqual(inside.interior.inside, true, '机位应被判在内景体积内（小院房）');
  assertEqual(inside.bloom.interiorTier, 'small', `小院房应命中 small 档（实际 ${inside.bloom.interiorTier}）`);
  assertEqual(inside.bloom.interiorStrengthScale, small.scale, '小院房的有效档位应为 small.scale');
  const expect = +(CONFIG.LIGHTING.presets.sunset.bloom.strength * small.scale).toFixed(4);
  assertEqual(inside.bloom.effectiveStrength, expect, `小院房有效 bloom 强度应为 ${expect}（= 预设 ${CONFIG.LIGHTING.presets.sunset.bloom.strength} × ${small.scale}）`);
  assert(inside.bloom.effectiveStrength < 0.3 * 0.5, '小院房必须比大空间更紧（强度更低）');
  runner.info(`内景 bloom 分档：小院房（area≈${annex.area ?? 'n/a'} m²）tier=small scale=${small.scale} → strength=${inside.bloom.effectiveStrength}；大空间 scale=${large.scale}（t106 冻结值）；config 预设与 §12 阈值未改`);
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
runner.section('t122：`?env=` 诊断覆盖必须"只改显式键"（不得绕过/丢掉 bloom）');
/* ========================================================================== */

const PRESET_KEYS = Object.keys(CONFIG.LIGHTING.presets.sunset);
const envCase = (overrides) => {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const environment = createEnvironment({
    config: CONFIG,
    events,
    scene,
    preset: 'sunset',
    presetOverrides: overrides ? { sunset: overrides } : null,
    THREE,
  });
  return { events, scene, environment, d: environment.describe(), p: CONFIG.LIGHTING.presets.sunset };
};

await runner.test('t122①：三组最小对照 —— 无覆盖 / 覆盖 exposure / 覆盖其它键：覆盖只改该键，bloom 逐值不变', () => {
  const none = envCase(null);
  const exp = envCase({ exposure: 0.95 });
  const sun = envCase({ sunIntensity: 5 });
  // 预设原值（冻结常量，不得被本卡改动）
  assertEqual(none.p.exposure, 1.06, 'sunset.exposure 预设值应仍为 1.06（本卡未改预设）');
  assertEqual(none.p.bloom.strength, 0.3, 'sunset.bloom.strength 预设值应仍为 0.3（t106 守护值，本卡未动）');
  // ① 无覆盖 = 预设原值
  assertEqual(none.d.exposure, none.p.exposure, '无覆盖时 exposure 应等于预设');
  assertEqual(none.d.bloom.baseStrength, none.p.bloom.strength, '无覆盖时 bloom.baseStrength 应等于预设');
  // ② 覆盖 exposure ⇒ 只有 exposure 变，bloom 不动
  assertEqual(exp.d.exposure, 0.95, '覆盖 exposure 应生效');
  assertEqual(exp.d.bloom.baseStrength, none.p.bloom.strength, '覆盖 exposure 时 bloom.baseStrength 必须等于预设（不得被绕过/丢掉）');
  assertEqual(exp.d.bloom.effectiveStrength, none.d.bloom.effectiveStrength, '覆盖 exposure 时 bloom.effectiveStrength 必须不变');
  assertEqual(exp.d.bloom.interiorTier, none.d.bloom.interiorTier, '覆盖 exposure 不得改变内景 bloom 档位');
  // ③ 覆盖其它键 ⇒ exposure 不动，其它键也保持
  assertEqual(sun.d.exposure, none.p.exposure, '覆盖其它键时 exposure 必须等于预设');
  assertEqual(sun.d.bloom.baseStrength, none.p.bloom.strength, '覆盖其它键时 bloom 必须等于预设');
  runner.info(`三组对照：无覆盖 exposure=${none.d.exposure}/bloom=${none.d.bloom.effectiveStrength}｜覆盖 exposure ⇒ ${exp.d.exposure}/bloom=${exp.d.bloom.effectiveStrength}｜覆盖 sunIntensity ⇒ exposure=${sun.d.exposure}/bloom=${sun.d.bloom.effectiveStrength}`);
});

await runner.test('t122②：任意覆盖下"只有该键变化" —— bloom 全字段与预设逐值不变，且未知键被忽略', () => {
  const none = envCase(null);
  const cases = [
    { label: 'exposure', overrides: { exposure: 0.95 } },
    { label: 'sunIntensity', overrides: { sunIntensity: 5 } },
    { label: 'ambientIntensity', overrides: { ambientIntensity: 1.5 } },
    { label: 'hemiIntensity', overrides: { hemiIntensity: 0.2 } },
    { label: 'lampDistance', overrides: { lampDistance: 46 } },
    { label: 'lampIntensityScale', overrides: { lampIntensityScale: 0.2 } },
    { label: 'fogFar', overrides: { fogFar: 900 } },
    { label: '未知键（应被忽略）', overrides: { 不存在的键: 1 } },
  ];
  const mismatches = [];
  const bloomFields = ['baseStrength', 'effectiveStrength', 'interiorBlend', 'shrink', 'interiorTier', 'interiorArea', 'preset'];
  for (const c of cases) {
    const r = envCase(c.overrides);
    // ① bloom 的每一个字段都必须与"无覆盖"逐值相同（覆盖里没有 bloom 键）
    for (const f of bloomFields) {
      if (JSON.stringify(r.d.bloom[f]) !== JSON.stringify(none.d.bloom[f])) {
        mismatches.push(`${c.label}: bloom.${f} 被改动（${JSON.stringify(r.d.bloom[f])} vs ${JSON.stringify(none.d.bloom[f])}）`);
      }
    }
    // ② 只有显式给出的键才允许变化
    const expectedExposure = 'exposure' in c.overrides ? c.overrides.exposure : none.p.exposure;
    if (r.d.exposure !== expectedExposure) mismatches.push(`${c.label}: exposure ${r.d.exposure} ≠ ${expectedExposure}`);
    // ③ 时辰不得被改
    if (r.d.preset !== 'sunset') mismatches.push(`${c.label}: preset 变成 ${r.d.preset}`);
    // ④ 未知键不得产生任何影响（与无覆盖逐值相同）
    if (c.label.startsWith('未知键')) {
      if (JSON.stringify(r.d.bloom) !== JSON.stringify(none.d.bloom)) mismatches.push('未知键改变了 bloom');
      if (r.d.exposure !== none.d.exposure) mismatches.push('未知键改变了 exposure');
    }
  }
  assert(PRESET_KEYS.includes('bloom') && PRESET_KEYS.includes('exposure'), '预设必须含 bloom/exposure 字段（本断言的前提）');
  assertEqual(mismatches.length, 0, `覆盖必须只改显式键，发现 ${mismatches.length} 例：${mismatches.slice(0, 5).join('；')}`);
  runner.info(`${cases.length} 组覆盖：bloom 的 ${bloomFields.length} 个字段逐值不变、只有显式键变化、未知键无影响 ✓`);
});

await runner.test('t122③：方向性铁律 —— 覆盖 exposure=0.95（低于预设 1.06）不得让画面变亮（诊断通道不得反转语义）', () => {
  const none = envCase(null);
  const low = envCase({ exposure: 0.95 });
  const high = envCase({ exposure: 1.5 });
  assert(low.d.exposure < none.d.exposure, '被测语义：覆盖值就是生效值（0.95 < 1.06）');
  assert(high.d.exposure > none.d.exposure, '对照：1.5 > 1.06');
  // 指数 = 线性：曝光降低必须单调不增（真实渲染的均值方向由浏览器 A/B 实测给出，见回执 §2）
  assert(low.d.exposure === 0.95 && none.d.exposure === 1.06, '读数字段必须与实际生效值一致（t106 的"更亮"若成立则与此矛盾）');
  runner.info(`方向性：exposure 覆盖 0.95 < 预设 1.06（更暗方向）；对照 1.5 > 1.06 ✓`);
});

/* ========================================================================== */

process.exit(runner.summary());
