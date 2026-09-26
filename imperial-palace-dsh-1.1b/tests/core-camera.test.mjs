#!/usr/bin/env node
/**
 * `tests/core-camera.test.mjs` —— t31 回归：相机 rotate 的**写读时序** + 导览/FP 校验一致性。
 *
 * 背景（t9 在真实浏览器验收中发现，按纪律未越界改 core）：
 *   ① `applyInput('rotate')` 在第一人称下只改内部 `yaw/pitch`，`target` 要等下一帧 `updateFp()` 才写回 →
 *      消费方同步读 `describe().azimuthDeg` / `rig.target` 恒为旧值，"朝向中轴/选中建筑"被**静默跳过**；
 *      更糟的是那次实测输出 `aims:0/aimFailures:0`（计数器全零）看起来"没有失败"，实为"根本没尝试" ——
 *      这是本项目第二次"用代理指标代替真实断言"（首次是 rAF 裸字符串扫描误报）。
 *   ② `validateStateShape` 把"导览暂停但 active"判为与 `viewMode==='fp'` 互斥，与 core 自身
 *      `setViewMode('fp')` 的语义（§5.4：进 FP 时**暂停**导览，暂停 ≠ 停止）自相矛盾。
 *
 * 本测试只断言**真实结果**（相机实际朝向向量），不依赖任何计数器；并给出"旧时序必失败"的突变证明（见回执 §2.3）。
 */

import { createTestRunner, loadModule, loadThree, assert, assertClose, assertEqual } from './harness.mjs';

const runner = createTestRunner('core-camera.test.mjs · 相机写读时序 + 导览/FP 校验（t31）');

const THREE = await loadThree();
const { CONFIG, EVENTS } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createStateStore, createStateController, validateStateShape } = await loadModule('src/core/state.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createCameraRig } = await loadModule('src/core/camera.js');

const DEG = Math.PI / 180;

function makeCore() {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  registry.registerBuildings('GREYBOX', LAYOUT.SLOTS.map((s) => ({ ...s })), { replace: true });
  const store = createStateStore({ events });
  const rig = createCameraRig({ config: CONFIG, registry, store, events });
  createStateController({ events, store, camera: rig, config: CONFIG });
  store.subscribe((payload) => rig.onStateChange(payload));
  const settle = (seconds = CONFIG.CAMERA.transitionSeconds + 0.05) => {
    const step = 1 / 60;
    for (let t = 0; t < seconds; t += step) rig.update(step, t, store.state);
  };
  return { events, registry, store, rig, settle };
}

/** 相机对象的真实世界朝向（单位向量）——这是"真实结果"，不是计数器。 */
function cameraForward(rig) {
  const v = new THREE.Vector3();
  rig.camera.getWorldDirection(v);
  return v.normalize();
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 绕 Y 轴旋转一个方向向量（用于从"输入 dx × 每单位弧度"推算期望方向）。 */
function rotateY(v, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new THREE.Vector3(v.x * cos + v.z * sin, v.y, -v.x * sin + v.z * cos).normalize();
}

/* ========================================================================== */
runner.section('1. FP：rotate 之后同步可读（真实朝向，无计数器）');
/* ========================================================================== */

await runner.test('进入第一人称后，rotate 立即同步改变 target / describe / 相机真实朝向', async () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'test' });
  settle();
  assert(rig.isFp, '应处于第一人称');

  const before = rig.describe();
  const dirBefore = rig.viewDirection().clone();
  const camBefore = cameraForward(rig);
  assert(dot(dirBefore, camBefore) > 0.999, '初始：装置报告方向应与相机真实朝向一致（dot>0.999）');

  // 单一同步输入：rotate 600px（= 600 × 0.0026 rad = 1.56 rad ≈ 89.4°）
  const dx = 600;
  const expectedYawDelta = -dx * 0.0026;
  rig.applyInput('rotate', { dx, dy: 0 }); // 之后**不调用任何 update**

  const after = rig.describe();
  const dirAfter = rig.viewDirection().clone();
  const camAfter = cameraForward(rig);

  // ① 真实结果：相机真实朝向必须变过，且与装置报告方向一致（dot > 0.999）
  assert(dot(dirBefore, dirAfter) < 0.999, `朝向必须确实改变（dot=${dot(dirBefore, dirAfter).toFixed(6)} < 0.999）`);
  assert(dot(dirAfter, camAfter) > 0.999, `装置报告方向必须等于相机真实朝向（dot=${dot(dirAfter, camAfter).toFixed(6)}）`);
  assert(dot(dirBefore, camAfter) < 0.999, '相机真实朝向也必须变过（不是只有 describe 变了）');

  // ② 目标方向同步写回：target 方向 == 视线方向（dot > 0.999）
  const targetDir = new THREE.Vector3(after.target.x - after.position.x, after.target.y - after.position.y, after.target.z - after.position.z).normalize();
  assert(dot(targetDir, camAfter) > 0.999, `target 必须同步指向新方向（dot=${dot(targetDir, camAfter).toFixed(6)}）`);

  // ③ rotate 前后的同步读数必须反映新方向（旧时序下这里恒为旧值 → 差值 0）
  assert(Math.abs(after.azimuthDeg - before.azimuthDeg) > 30, `描述方位角必须立即改变（Δ=${(after.azimuthDeg - before.azimuthDeg).toFixed(2)}°，期望 ≈89.4°）`);
  // 注意语义：describe().azimuthDeg 是"机位相对 target 的方位角"（= 视线方向的反向 bearing），
  // 与 G 侧自算的 atan2(target - position) 相差 180°，两者都同步可读（下面两式都断言）。
  const norm = (deg) => ((deg % 360) + 360) % 360;
  const bearings = [
    ['反视方位角', norm(Math.atan2(-camAfter.x, -camAfter.z) / DEG)],
    ['视线方位角', norm(Math.atan2(camAfter.x, camAfter.z) / DEG)],
  ];
  const described = norm(after.azimuthDeg);
  const diff = Math.min(
    Math.abs(bearings[0][1] - described),
    360 - Math.abs(bearings[0][1] - described),
  );
  assert(diff < 0.05, `describe().azimuthDeg 必须等于真实朝向的反视方位角（差 ${diff.toFixed(4)}°）`);
  const forwardBearing = norm(Math.atan2(camAfter.x, camAfter.z) / DEG);
  assert(Math.abs(norm(forwardBearing - described) - 180) < 0.1, '视线方位角与 describe().azimuthDeg 必须相差 180°（同一朝向的两种读法）');

  // ④ 旋转量符合输入语义（不依赖魔数：期望方向 = 旧方向绕 Y 转 expectedYawDelta）
  const expected = rotateY(dirBefore, expectedYawDelta);
  assert(dot(dirAfter, expected) > 0.999, `旋转量应符合输入（dot(actual, expected)=${dot(dirAfter, expected).toFixed(6)}）`);

  // ⑤ 反例演示：只用"尝试/失败计数器"无法区分旧时序（这就是被掩盖的原因），因此不作为验收依据
  const attempts = 1;
  const failures = 0;
  assert(attempts > 0 && failures === 0, '计数器全绿并不代表成功（旧时序下同样是 attempts=1/failures=0）——故本文件只用真实朝向断言');
});

await runner.test('pitch（dy）同样同步写回：真实朝向的 y 分量与 target 同步变化', async () => {
  const { events, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'test' });
  settle();
  const before = rig.viewDirection().clone();
  rig.applyInput('rotate', { dx: 0, dy: 400 });
  const after = rig.viewDirection().clone();
  const camAfter = cameraForward(rig);
  assert(after.y < before.y - 0.01, `俯仰应向下变化（${before.y.toFixed(4)} → ${after.y.toFixed(4)}）`);
  assert(dot(after, camAfter) > 0.999, '装置报告方向与相机真实朝向一致');
  const targetDir = new THREE.Vector3(rig.target.x - rig.position.x, rig.target.y - rig.position.y, rig.target.z - rig.position.z).normalize();
  assert(dot(targetDir, camAfter) > 0.999, 'target 同步');
  // 期望俯仰：pitch 变化 = -400×0.0022 rad
  const expectedPitch = Math.asin(before.y) - 400 * 0.0022;
  assertClose(Math.asin(after.y), expectedPitch, 0.01, '俯仰变化量应符合输入语义');
});

await runner.test('"朝向中轴"实战路径：按灵敏度算出 dx → 一次 rotate → 同步读到的真实朝向 dot > 0.999', async () => {
  const { events, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'test' });
  settle();

  // 与 G 侧同样的校准思路（不写死 core 魔数）：输入 ±1000 px 测出每单位 dx 的 yaw 变化
  const yawNow = () => Math.atan2(rig.viewDirection().x, rig.viewDirection().z);
  const y0 = yawNow();
  rig.applyInput('rotate', { dx: -1000, dy: 0 });
  const y1 = yawNow();
  rig.applyInput('rotate', { dx: 1000, dy: 0 }); // 还原
  const perUnit = (y1 - y0) / -1000;
  assert(Math.abs(perUnit) > 1e-6, `灵敏度必须非零（perUnit=${perUnit}）——旧时序下这里恒为 0，正是静默失效`);

  // 目标：朝向中轴（世界 z 轴向前，即 yaw=0 方向）
  const current = yawNow();
  const delta = ((0 - current + Math.PI) % (2 * Math.PI)) - Math.PI;
  const before = cameraForward(rig);
  // yaw 的单调性是 yaw_new = yaw_old − dx×k，而 perUnit = d(yaw)/d(dx) = −k ⇒ dx = delta / perUnit
  rig.applyInput('rotate', { dx: delta / perUnit, dy: 0 });
  const after = cameraForward(rig);

  const desired = new THREE.Vector3(0, 0, 1); // 北向（+Z）
  assert(dot(after, desired) > 0.999, `真实朝向必须对准中轴（dot=${dot(after, desired).toFixed(6)} > 0.999）`);
  assert(dot(before, after) < 0.999, '朝向确实发生了改变（不是"没尝试"）');
  const described = rig.viewDirection();
  assert(dot(described, after) > 0.999, '同步读 describe/viewDirection 即新值');
});

await runner.test('G 侧"先走 1/240s 再读"的绕法在新语义下仍正确（幂等、无副作用）', async () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'test' });
  settle();
  rig.applyInput('rotate', { dx: 300, dy: 0 });
  const sync = cameraForward(rig).clone();
  const posBefore = { ...rig.describe().position };
  rig.update(1 / 240, 0, store.state); // G 的 stepRig()
  const afterStep = cameraForward(rig);
  assert(dot(sync, afterStep) > 0.999999, `1/240s 步进不得改变朝向（dot=${dot(sync, afterStep).toFixed(8)}）`);
  const posAfter = rig.describe().position;
  assert(
    Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z) < 1e-6,
    '步进不应产生位移（未按移动键时）',
  );
  assert(dot(rig.viewDirection(), afterStep) > 0.999, '读数仍然一致');
});

/* ========================================================================== */
runner.section('2. validateStateShape：导览"暂停但 active"不与第一人称互斥（§5.4）');
/* ========================================================================== */

await runner.test('进 FP 暂停导览（active && paused）→ 校验零问题；真正推进中的导览才算冲突', () => {
  const base = {
    mode: 'fp',
    viewMode: 'fp',
    selectedBuildingId: null,
    hoveredBuildingId: null,
    timePreset: 'goldenHour',
    quality: 'medium',
    tourState: { active: true, paused: true, index: 0, id: null },
    loading: { progress: 1, stage: 'ready', failed: null },
  };
  assertEqual(validateStateShape(base).length, 0, `暂停中的导览与第一人称必须兼容（§5.4），实际：${validateStateShape(base).join('；')}`);

  const running = { ...base, tourState: { active: true, paused: false, index: 0, id: null } };
  const problems = validateStateShape(running);
  assert(problems.length >= 1, '导览正在推进 + 第一人称才是真冲突');
  assert(problems.some((p) => p.includes('暂停')), `冲突提示应说明"暂停而非停止"：${problems.join('；')}`);

  const stopped = { ...base, tourState: { active: false, paused: false, index: 0, id: null } };
  assertEqual(validateStateShape(stopped).length, 0, '导览停止时零问题');
});

await runner.test('mode/viewMode 一致性：两者必须同进同出（fp ⇄ fp）', () => {
  const ok = {
    mode: 'browse',
    viewMode: 'oblique',
    selectedBuildingId: null,
    hoveredBuildingId: null,
    timePreset: 'goldenHour',
    quality: 'medium',
    tourState: { active: false, paused: false, index: 0, id: null },
    loading: { progress: 1, stage: 'ready', failed: null },
  };
  assertEqual(validateStateShape(ok).length, 0);
  assert(validateStateShape({ ...ok, mode: 'fp' }).some((p) => p.includes('mode=fp')), 'mode=fp 但 viewMode≠fp 必须报错');
  assert(
    validateStateShape({ ...ok, viewMode: 'fp' }).some((p) => p.includes('mode')),
    'viewMode=fp 但 mode≠fp 必须报错',
  );
});

await runner.test('真机路径：导览进行中 → 进 FP（暂停）→ 校验零问题 → 退出 FP 仍可继续导览', () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestTour, { action: 'start', source: 'test' });
  settle();
  assert(store.state.tourState.active && !store.state.tourState.paused, '导览应先处于推进中');
  assertEqual(validateStateShape(store.state).length, 0, '推进中的导览（browse/tour）零问题');

  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'keyboard' });
  settle();
  assertEqual(store.state.viewMode, 'fp');
  assertEqual(store.state.tourState.active, true, '§5.4：进 FP 是暂停导览，不是停止');
  assertEqual(store.state.tourState.paused, true, '导览必须被暂停');
  assertEqual(validateStateShape(store.state).length, 0, `暂停的导览 + FP 必须零问题，实际：${validateStateShape(store.state).join('；')}`);
  assert(rig.isFp, 'rig 应处于第一人称');

  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'keyboard-escape' });
  settle();
  assert(!rig.isFp, '退出第一人称');
  assertEqual(store.state.tourState.active, true, '退出 FP 后导览仍处于激活（可继续），没有被 stop');
  assertEqual(store.state.tourState.paused, true, '仍保持暂停，等待用户继续');
  assertEqual(validateStateShape(store.state).length, 0);

  events.request(EVENTS.requestTour, { action: 'resume', source: 'test' });
  settle();
  assertEqual(store.state.tourState.paused, false, '可继续导览（这是"不采用进 FP 即 stop"的理由）');
  assertEqual(validateStateShape(store.state).length, 0, '继续导览后状态仍合法');
});

/* ========================================================================== */
runner.section('3. 回归护栏：rotate 不破坏其它模式与过渡');
/* ========================================================================== */

await runner.test('非 FP 模式：rotate 保持"轨道旋转"语义（相机绕 target 转动，target 不变）', () => {
  const { rig, settle } = makeCore();
  settle();
  const before = rig.describe();
  rig.applyInput('rotate', { dx: 200, dy: 0 });
  const after = rig.describe();
  assertClose(after.target.x, before.target.x, 1e-6, '轨道模式 target 不应因旋转改变');
  assertClose(after.target.z, before.target.z, 1e-6, '轨道模式 target 不应因旋转改变');
  assert(Math.abs(after.azimuthDeg - before.azimuthDeg) > 1, '方位角应变化');
  assertClose(after.distance, before.distance, 1e-6, '距离不应变化');
});

await runner.test('FP 下 rotate 不改变位置；退出 FP 仍能恢复原机位（t2 行为不回退）', () => {
  const { events, store, rig, settle } = makeCore();
  settle();
  const beforeFp = rig.describe();
  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'test' });
  settle();
  const posInFp = { ...rig.describe().position };
  rig.applyInput('rotate', { dx: 500, dy: 100 });
  const afterRotate = { ...rig.describe().position };
  assertClose(afterRotate.x, posInFp.x, 1e-9, 'FP 旋转不得移动位置');
  assertClose(afterRotate.z, posInFp.z, 1e-9, 'FP 旋转不得移动位置');

  events.request(EVENTS.requestViewMode, { mode: 'fp', source: 'escape' });
  settle();
  assertClose(rig.describe().position.x, beforeFp.position.x, 0.01, '退出 FP 应恢复原机位');
  assertClose(rig.describe().position.z, beforeFp.position.z, 0.01, '退出 FP 应恢复原机位');
  assertEqual(validateStateShape(store.state).length, 0);
});

/* ========================================================================== */

process.exit(runner.summary());
