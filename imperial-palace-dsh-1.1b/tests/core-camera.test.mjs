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
const { createCameraRig, interiorBoundsFor, describeInteriorTarget, INTERIOR_ADDRESS_STATS, focusSpecFor, buildingWorldBounds } = await loadModule('src/core/camera.js');

const DEG = Math.PI / 180;

function makeCore(opts = {}) {
  const events = createEventBus();
  const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  registry.registerBuildings('GREYBOX', LAYOUT.SLOTS.map((s) => ({ ...s })), { replace: true });
  const store = createStateStore({ events });
  const rig = createCameraRig({ config: CONFIG, registry, store, events, query: opts.query ?? null });
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
runner.section('t65：一区多内景的显式寻址（按机位/地面，不再按区名猜）');
/* ========================================================================== */

const sameBox = (a, b) => a && b && a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
const insideBox = (box, p) => p.x >= box.minX && p.x <= box.maxX && p.z >= box.minZ && p.z <= box.maxZ;
const viewpointById = (id) => LAYOUT.VIEWPOINTS.find((v) => v.id === id) ?? null;

await runner.test('同一 zone 内两个内景：按 viewpointId 解析得到**不同且各自正确**的包围盒', () => {
  const hall = viewpointById('VP-B-interior');            // 金銮殿（zone B）
  const mid = viewpointById('VP-B-hall-mid-interior');    // B-hall-mid（**同区 B**）
  assert(hall && mid, 'B 区应同时存在金銮殿与 B-hall-mid 两个内景机位');
  assertEqual(hall.area, mid.area, '两个机位必须属于同一 zone（本用例的前提）');

  const boxHall = interiorBoundsFor({ viewpointId: hall.id });
  const boxMid = interiorBoundsFor({ viewpointId: mid.id });
  assert(boxHall && boxMid, '两个机位都应解析出包围盒');
  assert(!sameBox(boxHall, boxMid), `同区两内景必须得到**不同**的盒（实际 hall=${boxHall.id} mid=${boxMid.id}）`);
  assertEqual(boxHall.slotId, 'B-hall-main', '金銮殿盒应归属 B-hall-main');
  assertEqual(boxMid.slotId, 'B-hall-mid', 'B-hall-mid 盒应归属 B-hall-mid');
  assert(insideBox(boxHall, hall.position), '金銮殿机位应在自己的盒内');
  assert(insideBox(boxMid, mid.position), 'B-hall-mid 机位应在自己的盒内');
  assert(!insideBox(boxHall, mid.position), 'B-hall-mid 机位**不应**落在金銮殿盒内（否则说明仍在按区取盒）');
  const zoneBox = interiorBoundsFor('B');
  assertEqual(zoneBox.ambiguous, true, '一区多内景时 legacy 按区口径应标记 ambiguous（警告 + 计数）');
  assert(sameBox(zoneBox, boxHall), 'legacy 按区口径应解析到该区 legacy 机位（B → 金銮殿），不得静默取"第一个面"');
  assert(!sameBox(zoneBox, boxMid), 'legacy 区盒不得等于另一个内景的盒');
  runner.info(`B 区两内景：${boxHall.id}(${boxHall.minX}..${boxHall.maxX}) vs ${boxMid.id}(${boxMid.minX}..${boxMid.maxX})，resolvedBy=${boxHall.resolvedBy}/${boxMid.resolvedBy}`);
});

await runner.test('slotId / surfaceId / 直接 WK-/VP- id 三种显式寻址与 viewpointId 等价', () => {
  const boxVp = interiorBoundsFor({ viewpointId: 'VP-B-hall-mid-interior' });
  const boxSlot = interiorBoundsFor({ slotId: 'B-hall-mid' });
  const boxSurface = interiorBoundsFor({ surfaceId: 'WK-B-hall-mid-interior' });
  const boxWkId = interiorBoundsFor('WK-B-hall-mid-interior');
  const boxVpId = interiorBoundsFor('VP-B-hall-mid-interior');
  for (const [name, box] of [['slotId', boxSlot], ['surfaceId', boxSurface], ['WK-id', boxWkId], ['VP-id', boxVpId]]) {
    assert(box && sameBox(box, boxVp), `${name} 解析出的盒应与 viewpointId 完全一致`);
  }
  assertEqual(interiorBoundsFor({ viewpointId: 'VP-不存在' }), null, '无效机位 id 应明确返回 null（不得静默取别的内景）');
  assertEqual(describeInteriorTarget({ slotId: 'B-hall-mid' }).resolvedBy, 'slotId', 'describeInteriorTarget 应给出解析来源');
  runner.info('四种显式寻址等价；无效 id → null；解析来源字段可用');
});

await runner.test('全链路：interior 请求携带 viewpointId ⇒ state.view.interiorViewpointId ⇒ 相机按该机位夹取', () => {
  const { events, store, rig, settle } = makeCore();
  const target = viewpointById('VP-B-hall-mid-interior');
  events.request(EVENTS.requestViewMode, { mode: 'interior', source: 'test', viewpointId: target.id });
  assertEqual(store.view.interiorViewpointId, target.id, 'store.view.interiorViewpointId 应来自请求（不按 area 猜）');
  settle();
  const d = rig.describe();
  assertEqual(d.mode, 'interior', '应进入 interior 模式');
  assertEqual(d.interiorViewpointId, target.id, 'describe() 应回报实际使用的内景机位 id');
  const box = interiorBoundsFor({ viewpointId: target.id });
  assert(insideBox(box, d.position), `相机位置应被夹在**该机位**的室内盒内（pos=${d.position.x},${d.position.z} box=${box.id}）`);
  assert(insideBox(box, d.target), '相机目标应被夹在该机位的室内盒内');
  assertEqual(box.slotId, 'B-hall-mid', '盒应归属请求指定的建筑');
  runner.info(`请求 ${target.id} ⇒ describe(): interiorViewpointId=${d.interiorViewpointId} slot=${d.interiorSlotId} resolvedBy=${d.interiorResolvedBy}`);
});

await runner.test('回退与告警：缺 id ⇒ 按 area 回退并计数；无效 id ⇒ 回退到已登记机位（绝不静默用错 id）', () => {
  const { events, store, rig, settle } = makeCore();
  const noIdBefore = INTERIOR_ADDRESS_STATS.fallbackNoId;
  events.request(EVENTS.requestViewMode, { mode: 'interior', source: 'test' });
  settle();
  const d1 = rig.describe();
  assertEqual(d1.mode, 'interior', '缺 id 时仍应可用（明确回退，而不是进不去）');
  assert(INTERIOR_ADDRESS_STATS.fallbackNoId > noIdBefore, '缺 id 应计入 fallbackNoId（可观测，不静默）');
  assert(String(d1.interiorResolvedBy ?? '').startsWith('fallback('), `缺 id 时应标注回退来源（实际 ${d1.interiorResolvedBy}）`);
  assert(interiorBoundsFor({ viewpointId: d1.interiorViewpointId }), '回退得到的机位必须是已登记的内景机位');

  const badBefore = INTERIOR_ADDRESS_STATS.fallbackBadId;
  events.request(EVENTS.requestViewMode, { mode: 'interior', source: 'test', viewpointId: 'VP-根本不存在' });
  settle();
  const d2 = rig.describe();
  assert(INTERIOR_ADDRESS_STATS.fallbackBadId > badBefore, '无效 id 应计入 fallbackBadId');
  assert(d2.interiorViewpointId !== 'VP-根本不存在', '不得把无效 id 当成实际机位（必须回退到已登记机位）');
  assert(interiorBoundsFor({ viewpointId: d2.interiorViewpointId }), '回退后的机位仍应可解析出室内盒');
  runner.info(`回退链：缺 id→${d1.interiorViewpointId}（${d1.interiorResolvedBy}）；无效 id→${d2.interiorViewpointId}（${d2.interiorResolvedBy}）`);
});

await runner.test('次级来源：只给 slotId 时，相机按 layout 的建筑→内景映射解析机位', () => {
  const { events, store, rig, settle } = makeCore();
  events.request(EVENTS.requestViewMode, { mode: 'interior', source: 'test', slotId: 'C-hall-bed-main' });
  settle();
  const d = rig.describe();
  assertEqual(d.mode, 'interior');
  const box = interiorBoundsFor({ slotId: 'C-hall-bed-main' });
  assertEqual(d.interiorViewpointId, box.viewpointId, '应按 layout 映射解析出该建筑的内景机位');
  assert(insideBox(box, d.position), '位置应夹在该建筑自己的室内盒内');
  assertEqual(box.slotId, 'C-hall-bed-main');
  runner.info(`slotId 次优来源：C-hall-bed-main → ${d.interiorViewpointId}（box=${box.id}）`);
});

/* ========================================================================== */
runner.section('t78：focus 取景不得落空/退化（全部有门槽位）');
/* ========================================================================== */

/** 取景不变量：距离 ≥ 按包围球与 FOV 反推的入镜距离、相机在建筑盒外、数值有限。 */
function assertFocusInvariants(spec, label) {
  const f = spec.framing;
  assert(f, `${label}：focus 规格应带 framing 诊断字段`);
  const dist = Math.hypot(spec.position.x - spec.target.x, spec.position.y - spec.target.y, spec.position.z - spec.target.z);
  for (const [k, v] of Object.entries({ 'position.x': spec.position.x, 'position.y': spec.position.y, 'position.z': spec.position.z, 'target.x': spec.target.x, 'target.y': spec.target.y, 'target.z': spec.target.z })) {
    assert(Number.isFinite(v), `${label}：${k} 必须有限（实际 ${v}）`);
  }
  assert(dist >= f.fitDistance - 1e-6, `${label}：取景距离 ${dist.toFixed(2)} 必须 ≥ 最小入镜距离 ${f.fitDistance}（否则建筑出画/贴脸）`);
  assert(dist >= 24 - 1e-6, `${label}：取景距离 ${dist.toFixed(2)} 必须 ≥ 24m（下限，防退化包围盒）`);
  assert(f.radius >= 4, `${label}：包围球半径 ${f.radius} 应 ≥4m`);
  const outsideXZ = Math.abs(spec.position.x - spec.target.x) > f.w / 2 || Math.abs(spec.position.z - spec.target.z) > f.d / 2;
  assert(outsideXZ, `${label}：相机不得落在建筑平面包围盒内（dx=${Math.abs(spec.position.x - spec.target.x).toFixed(2)}, dz=${Math.abs(spec.position.z - spec.target.z).toFixed(2)}, w=${f.w}, d=${f.d}）`);
  return { dist, ...f };
}

await runner.test('全部有门槽位：focus 取景规格均不落空/不退化（相机在盒外、距离 ≥ 入镜距离、数值有限）', () => {
  const { registry } = makeCore();
  const doorSlots = LAYOUT.SLOTS.filter((s) => s.hasDoor);
  assertEqual(doorSlots.length, 63, `有门槽位应为 63 个（实际 ${doorSlots.length}）`);
  const rows = [];
  for (const slot of doorSlots) {
    const building = registry.getBuilding(slot.id);
    assert(building, `槽位 ${slot.id} 应能在注册表中取到建筑`);
    const spec = focusSpecFor(building);
    const info = assertFocusInvariants(spec, slot.id);
    rows.push({ id: slot.id, kind: slot.kind, degenerate: info.degenerate, dist: info.dist });
  }
  const degenerate = rows.filter((r) => r.degenerate);
  runner.info(`63 槽位 focus 取景：距离 ${Math.min(...rows.map((r) => r.dist)).toFixed(1)}–${Math.max(...rows.map((r) => r.dist)).toFixed(1)}m；退化包围盒 ${degenerate.length} 个${degenerate.length ? '（' + degenerate.map((r) => r.id).join(',') + '）' : ''}`);
});

await runner.test('退化包围盒防护（突变证明）：零厚度/NaN 体量不得让相机落进建筑（旧公式在此类输入上会塌缩）', () => {
  // ① 合成"嵌在院墙里的薄片院门"：进深 0（旧实现 distance = max(w,0)*1.7 + h*1.55，最小仅 ~20m）
  const thinGate = {
    id: 'SYNTH-thin-gate',
    facing: 'west',
    baseY: 0.4,
    totalHeight: 8,
    bounds: { minX: -6, maxX: 6, minZ: 124, maxZ: 124 },
  };
  const specThin = focusSpecFor(thinGate);
  assertEqual(specThin.framing.degenerate, true, '零进深应被识别为退化包围盒');
  assertFocusInvariants(specThin, 'SYNTH-thin-gate');

  // ② 突变对照：把退化防护去掉（用旧公式）后，同一输入的距离会小于最小入镜距离 ⇒ 断言必失败
  const f = specThin.framing;
  const legacyDistance = Math.max(f.rawW ?? 20, f.rawD ?? 20) * 1.7 + (f.rawH ?? 20) * 1.55;
  assert(
    legacyDistance < f.fitDistance,
    `旧公式在同一退化输入上的距离 ${legacyDistance.toFixed(2)} 必须小于最小入镜距离 ${f.fitDistance}（这是空白缺陷的机制；若此断言失败说明样本不再具备区分力）`,
  );

  // ③ NaN/缺字段输入：不得产出 NaN 机位（旧实现在 worldBounds 含 NaN 时会直接给 NaN 机位 ⇒ 整帧空白）
  const brokenBox = { id: 'SYNTH-nan', facing: 'south', baseY: 0, totalHeight: 12, worldBounds: { minX: NaN, maxX: NaN, minZ: 0, maxZ: 10, minY: 0, maxY: 12 } };
  const specNan = focusSpecFor(brokenBox);
  assertEqual(specNan.framing.degenerate, true, 'NaN 包围盒应被识别为退化');
  assert(Number.isFinite(specNan.position.x) && Number.isFinite(specNan.position.z) && Number.isFinite(specNan.position.y), 'NaN 输入下机位仍须有限');
  assertFocusInvariants(specNan, 'SYNTH-nan');
  runner.info(`退化样本：thin-gate 距离 ${specThin.framing.distance}（旧公式 ${legacyDistance.toFixed(2)} < 入镜 ${specThin.framing.fitDistance}）；NaN 输入机位有限 ✓`);
});

/* ========================================================================== */
runner.section('t91：逐栋内景取景入口 `?interior=`（slotId / viewpointId）');
/* ========================================================================== */

const settleFrames = (rig, store, frames) => {
  const step = 1 / 60;
  for (let i = 0; i < frames; i += 1) rig.update(step, i * step, store.state);
};

await runner.test('`?interior=<slotId>`：经 layout 显式映射解析机位 → 复用 view:request-mode 进入该内景', () => {
  const { store, rig, settle } = makeCore({ query: { interior: 'C-hall-bed-main' } });
  settleFrames(rig, store, 5);
  settle(); // 相机过渡走完
  const expected = interiorBoundsFor({ slotId: 'C-hall-bed-main' }).viewpointId;
  assertEqual(store.state.viewMode, 'interior', '应进入 interior 模式');
  assertEqual(store.view.interiorViewpointId, expected, 'store.view 应记录解析出的机位');
  const d = rig.describe();
  assertEqual(d.mode, 'interior', 'describe() 应为 interior');
  assertEqual(d.interiorViewpointId, expected, 'describe() 的机位应与映射一致');
  assertEqual(d.interiorQuery.requested, 'C-hall-bed-main', '引导应记录请求值');
  assertEqual(d.interiorQuery.applied, expected, '引导应记录实际应用的机位');
  const box = interiorBoundsFor({ slotId: 'C-hall-bed-main' });
  assert(d.position.x >= box.minX && d.position.x <= box.maxX && d.position.z >= box.minZ && d.position.z <= box.maxZ, '机位应被夹在该内景盒内');
  runner.info(`?interior=C-hall-bed-main → ${expected}（盒 ${box.id}），reason=${d.interiorQuery.reason}`);
});

await runner.test('`?interior=<viewpointId>` 直接写法等价；`?view=interior` 同时给出时也生效', () => {
  const a = makeCore({ query: { interior: 'VP-B-hall-mid-interior' } });
  settleFrames(a.rig, a.store, 5);
  a.settle();
  assertEqual(a.store.view.interiorViewpointId, 'VP-B-hall-mid-interior', '直接给机位 id 应生效');
  assertEqual(a.rig.describe().interiorQuery.applied, 'VP-B-hall-mid-interior');

  const b = makeCore({ query: { interior: 'B-hall-mid', view: 'interior' } });
  settleFrames(b.rig, b.store, 5);
  b.settle();
  assertEqual(b.store.view.interiorViewpointId, 'VP-B-hall-mid-interior', 'view=interior 与 interior= 同时给出时应应用显式机位');
  runner.info('VP- 直写与 view=interior 组合均生效 ✓');
});

await runner.test('兼容与失败路径：`?view=<非 interior>` 优先不覆盖；未知 id 明确不切景、给出原因', () => {
  const iso = makeCore({ query: { interior: 'B-hall-mid', view: 'iso' } });
  settleFrames(iso.rig, iso.store, 5);
  iso.settle();
  // 注：`?view=iso` 本身由 main.js 的 applyQueryView()（:441-447 → view:request-mode）应用；
  // 本夹具不跑 main.js，故这里只断言"引导**没有**把视角改成 interior"，即八视角优先不被覆盖。
  assertEqual(iso.store.state.viewMode, 'oblique', '引导不得把视角改成 interior（八视角优先）');
  assertEqual(iso.rig.describe().interiorQuery.reason, 'view=iso-precedence', '应记录“被显式视角优先”的原因');
  assertEqual(iso.store.view.interiorViewpointId, null, '不得写入机位');

  const bad = makeCore({ query: { interior: 'Z-不存在' } });
  settleFrames(bad.rig, bad.store, 1000); // 超过引导重试上限（900）
  bad.settle();
  const d = bad.rig.describe();
  assertEqual(d.interiorQuery.reason, 'unresolved:Z-不存在', '未知 id 应给出 unresolved 原因（不静默）');
  assertEqual(d.interiorQuery.applied, null, '未知 id 不得应用任何机位');
  assertEqual(bad.store.state.viewMode, 'oblique', '未知 id 不应改变视角');
  runner.info('八视角优先 + 未知 id 不静默 ✓');
});

await runner.test('引导只在需要时发起一次：成功后不再重复请求（复用唯一入口、不新建取景路径）', () => {
  const { events, store, rig, settle } = makeCore({ query: { interior: 'B-hall-mid' } });
  let interiorRequests = 0;
  events.on(EVENTS.requestViewMode, (p) => {
    if (p?.mode === 'interior') interiorRequests += 1;
  });
  settleFrames(rig, store, 300);
  settle();
  assertEqual(interiorRequests, 1, `引导成功后不得重复请求（实际 ${interiorRequests} 次）`);
  assertEqual(rig.describe().interiorQuery.applied, 'VP-B-hall-mid-interior');
  // 没有 interior= 时不得发任何内景请求
  const none = makeCore({});
  let noneRequests = 0;
  none.events.on(EVENTS.requestViewMode, (p) => {
    if (p?.mode === 'interior') noneRequests += 1;
  });
  settleFrames(none.rig, none.store, 60);
  assertEqual(noneRequests, 0, '无 interior= 时不得发起内景请求');
  assertEqual(none.rig.describe().interiorQuery.reason, 'no-param');
  runner.info('引导一次性且仅在有参数时发起 ✓');
});

/* ========================================================================== */

process.exit(runner.summary());
