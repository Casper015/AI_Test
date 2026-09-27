#!/usr/bin/env node
/**
 * `tests/fp-controls.test.mjs` —— t2 第一人称操控常驻断言（纯逻辑，无需浏览器）。
 *
 * 覆盖卡面逐条：
 *   ① **A/D 方向**：相机 right 向量（世界系）与 A/D/W/S 实得位移点乘的**符号**（修前 A/D 反号，实测 ±5.2m 全反）
 *   ② **空格跳跃**：顶点 ≤ `INTERACTION.jump.maxHeight`（且硬上限 1.0m）、落地 y **逐值** = `floorYAt + fpEyeHeight`、
 *      空中不可再跳（`reason:'airborne'`）
 *   ③ **空中水平碰撞仍生效**：飞行途中从不进入障碍体块（唯一谓词层 `obstacleBlocksPoint` 逐帧判）
 *   ④ **非可站立落点 ⇒ 回起跳点**：以真实台阶边 + 收紧 `snapDownDistance` 复现，断言回到起跳点且不落在非法位置
 *   ⑤ **F 再按一次退出第一人称**：键位解析在"第一人称 + 有选中且可进入"时仍返回退出（修前会被判成进入内景）
 *   ⑥ **Space 语义分流**：第一人称=跳跃 / 其它视角=导览
 *   ⑦ **卡死 HUD 豁免**：跳跃飞行期间 `noteStuckTick` 不计卡死（落地后照常计时）
 */
import { createTestRunner, loadModule, loadThree, assert, assertEqual, assertClose, readSource } from './harness.mjs';

const runner = createTestRunner('fp-controls.test.mjs · 第一人称 A/D·跳跃·F 退出（t2）');

const THREE = await loadThree();
const { CONFIG, EVENTS } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createStateStore } = await loadModule('src/core/state.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createCameraRig } = await loadModule('src/core/camera.js');
const { obstacleBlocksPoint } = await loadModule('src/core/layout-slice.js');
const { resolveKey, helpKeyList, KEY_KINDS, TOUCH_SUPPORT_NOTE } = await loadModule('src/interaction/keymap.js');
const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');

/* --------------------------- 测试替身 --------------------------- */
function makeKeyboardTarget() {
  const map = new Map();
  return {
    addEventListener(type, fn) { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); },
    removeEventListener(type, fn) { const list = map.get(type) ?? []; const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); },
    dispatch(type, code) { for (const fn of [...(map.get(type) ?? [])]) fn({ code, preventDefault() {}, type }); },
    listenerCount() { return [...map.values()].reduce((s, l) => s + l.length, 0); },
  };
}
const fakeElement = {
  addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
};

function makeRig({ config = CONFIG } = {}) {
  const events = createEventBus();
  const registry = createRegistry({ config, events, layout: LAYOUT });
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
  registry.registerBuildings('GREYBOX', LAYOUT.SLOTS.map((s) => ({ ...s })), { replace: true });
  const store = createStateStore({ events });
  const rig = createCameraRig({ config, registry, store, events });
  const kbd = makeKeyboardTarget();
  rig.bindInput(fakeElement, { keyboardTarget: kbd });
  return { rig, kbd, registry, store, events };
}

/** 第一人称出生机位（layout 登记；字段名是 `mode`）。 */
const fpSpawn = LAYOUT.VIEWPOINTS.find((v) => v.mode === 'fp-spawn');
const eye = CONFIG.CAMERA.fpEyeHeight;

/** 世界系相机 right（矩阵第一列 = 局部 +X）。 */
const rightOf = (rig) => {
  const e = rig.camera.matrixWorld.elements;
  return { x: e[0], y: e[1], z: e[2] };
};

await runner.test('① A/D/W/S：实得位移方向与相机 right/forward 点乘的符号（修前 A/D 全反）', () => {
  const { rig, kbd, store } = makeRig();
  rig.enterFp({ position: { ...fpSpawn.position }, instant: true });
  assert(rig.isFp, '应已进入第一人称');
  const right = rightOf(rig);
  const forward = rig.viewDirection();
  const hold = (code, frames = 30, dt = 1 / 60) => {
    const from = { x: rig.position.x, z: rig.position.z };
    kbd.dispatch('keydown', code);
    for (let i = 0; i < frames; i += 1) rig.update(dt, i * dt, store.state);
    kbd.dispatch('keyup', code);
    const dx = rig.position.x - from.x;
    const dz = rig.position.z - from.z;
    return { dx, dz, len: Math.hypot(dx, dz), dotRight: dx * right.x + dz * right.z, dotForward: dx * forward.x + dz * forward.z };
  };
  const d = hold('KeyD');
  const a = hold('KeyA');
  const w = hold('KeyW');
  const s = hold('KeyS');
  const expected = CONFIG.CAMERA.fpMoveSpeed * (30 / 60);
  runner.info(`D：|Δ|=${d.len.toFixed(3)}m，点乘 right=${d.dotRight.toFixed(3)}｜A：${a.len.toFixed(3)}m／${a.dotRight.toFixed(3)}｜W：点乘 forward=${w.dotForward.toFixed(3)}｜S：${s.dotForward.toFixed(3)}`);
  assertClose(d.len, expected, 0.02, `D 位移应 ≈ ${expected.toFixed(2)}m（无阻挡时）`);
  assertClose(a.len, expected, 0.02, 'A 位移应 ≈ 步行距离');
  assert(d.dotRight > 0.9 * d.len, `D 必须沿相机 right 正方向（实际点乘 right=${d.dotRight.toFixed(3)}，修前为负）`);
  assert(a.dotRight < -0.9 * a.len, `A 必须沿相机 right 反方向（实际 ${a.dotRight.toFixed(3)}，修前为正）`);
  assert(w.dotForward > 0.9 * w.len, `W 必须沿视线正方向（实际 ${w.dotForward.toFixed(3)}）`);
  assert(s.dotForward < -0.9 * s.len, `S 必须沿视线反方向（实际 ${s.dotForward.toFixed(3)}）`);
  assert(Math.abs(d.dotForward) < 1e-6 && Math.abs(w.dotRight) < 1e-6, 'D/A 不应有前后分量，W/S 不应有左右分量（横移/直行正交）');
});

await runner.test('② 空格跳跃：顶点 ≤ 配置上限且 ≤1.0m，落地 y 逐值 = floorYAt + fpEyeHeight', () => {
  const { rig, store } = makeRig();
  rig.enterFp({ position: { ...fpSpawn.position }, instant: true });
  const y0 = rig.position.y;
  const surface0 = LAYOUT.floorYAt(rig.position.x, rig.position.z);
  assertEqual(rig.position.y, surface0 + eye, '进入第一人称时眼高必须逐值 = 面高 + fpEyeHeight（§5.4）');
  const started = rig.jump('test');
  assertEqual(started.ok, true, '起跳应成功');
  assertEqual(rig.isAirborne, true, '起跳后应处于滞空态');
  let yMax = y0;
  for (let i = 0; i < 120; i += 1) { rig.update(1 / 60, i / 60, store.state); yMax = Math.max(yMax, rig.position.y); }
  const peak = yMax - y0;
  const surfaceEnd = LAYOUT.floorYAt(rig.position.x, rig.position.z);
  const d = rig.describe();
  runner.info(`顶点 ${peak.toFixed(4)}m（配置 ${CONFIG.INTERACTION.jump.maxHeight}，硬上限 1.0）｜落地 y=${rig.position.y} 面高=${surfaceEnd} 期望=${surfaceEnd + eye}`);
  assert(peak <= CONFIG.INTERACTION.jump.maxHeight + 1e-9, `顶点不得超过配置值 ${CONFIG.INTERACTION.jump.maxHeight}（实际 ${peak.toFixed(4)}）`);
  assert(peak <= 1.0 + 1e-9, `顶点必须 ≤1.0m（卡面硬判据；实际 ${peak.toFixed(4)}）`);
  assert(peak > 0.5, `顶点必须确实跳起来（实际 ${peak.toFixed(4)}m，>0.5m）`);
  assertEqual(rig.isAirborne, false, '120 帧（2s）内必须已落地');
  assertEqual(rig.position.y, surfaceEnd + eye, '落地 y 必须**逐值** = surfaceY + fpEyeHeight（不是插值/近似）');
  assertEqual(d.fpJump.starts, 1, '起跳计数应为 1');
  assertEqual(d.fpJump.landings, 1, '落地计数应为 1');
  assertEqual(d.fpJump.reverts, 0, '正常落地不应回退');
  assertEqual(d.fpJump.lastLanding.kind, 'ground', '最近一次落地应为 ground');
});

await runner.test('②b 开关与硬上限：`INTERACTION.jump.enabled=false` 时拒绝起跳；maxHeight 被改大也不越过 1.0m', () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.INTERACTION.jump.enabled = false;
  {
    const { rig, store } = makeRig({ config: cfg });
    rig.enterFp({ position: { ...fpSpawn.position }, instant: true });
    const res = rig.jump('test');
    assertEqual(res.ok, false, '开关关闭时必须拒绝起跳');
    assertEqual(res.reason, 'disabled', '拒绝原因应为 disabled');
    for (let i = 0; i < 60; i += 1) rig.update(1 / 60, i / 60, store.state);
    assertEqual(rig.isAirborne, false, '开关关闭时不得出现滞空');
    assertEqual(rig.position.y, LAYOUT.floorYAt(rig.position.x, rig.position.z) + eye, '开关关闭时视线高保持 = 面高 + fpEyeHeight');
  }
  {
    const big = JSON.parse(JSON.stringify(CONFIG)); // 刻意把配置改大到 3m
    big.INTERACTION.jump.maxHeight = 3;
    const { rig, store } = makeRig({ config: big });
    rig.enterFp({ position: { ...fpSpawn.position }, instant: true });
    const y0 = rig.position.y;
    rig.jump('test');
    let peak = 0;
    for (let i = 0; i < 120; i += 1) { rig.update(1 / 60, i / 60, store.state); peak = Math.max(peak, rig.position.y - y0); }
    assert(peak <= 1.0 + 1e-9, `即使配置被改成 3m，内核也必须钳在 1.0m 以内（实际 ${peak.toFixed(4)}）`);
    assertEqual(rig.describe().fpJump.maxHeight, 1, 'describe().fpJump.maxHeight 应上报生效上限（钳后 ≤1.0）');
    runner.info(`配置 3m ⇒ 实测顶点 ${peak.toFixed(4)}m（内核硬上限 1.0 生效）✓`);
  }
});

await runner.test('③ 空中水平碰撞仍生效（不越墙不穿建筑）+ 空中不可再跳', () => {
  const { rig, kbd, registry, store } = makeRig();
  rig.enterFp({ position: { ...fpSpawn.position }, instant: true });
  const obstacles = registry.allObstacles();
  const inside = (p) => obstacles.some((o) => obstacleBlocksPoint(o, { x: p.x, z: p.z, feetY: p.y - eye, height: CONFIG.INTERACTION.player.height, radius: CONFIG.INTERACTION.player.radius }));
  let violations = 0;
  let refusedAirborne = 0;
  kbd.dispatch('keydown', 'KeyW');
  let starts = 0;
  let refusedCooldown = 0;
  const ROUND_FRAMES = 50; // > 跳跃全程（≈44 帧 @60fps）⇒ 每轮都能完成一次完整跳跃
  for (let round = 0; round < 4; round += 1) {
    if (rig.jump('test').ok) starts += 1;
    for (let i = 0; i < ROUND_FRAMES; i += 1) {
      rig.update(1 / 60, i / 60, store.state);
      if (inside(rig.position)) violations += 1;
      if (rig.isAirborne && rig.jump('test').reason === 'airborne') refusedAirborne += 1;
    }
    // 回合之间推进冷却（INTERACTION.jump.cooldownSeconds）：**只在冷却窗口内**探测起跳是否被拒（否则会自己起跳）
    const frame = ROUND_FRAMES + round * ROUND_FRAMES;
    const cooldownFrames = Math.ceil(CONFIG.INTERACTION.jump.cooldownSeconds * 60) + 2;
    for (let i = 0; i < cooldownFrames; i += 1) {
      if (rig.describe().fpJump.cooldown > 0 && rig.jump('test').reason === 'cooldown') refusedCooldown += 1;
      rig.update(1 / 60, (frame + i) / 60, store.state);
    }
  }
  kbd.dispatch('keyup', 'KeyW');
  runner.info(`4 轮“边跑边跳”共 200 帧：进入障碍帧数=${violations}（判据 0）｜空中重复起跳被拒=${refusedAirborne} 次｜冷却拒绝=${refusedCooldown} 次｜成功起跳=${starts}`);
  assertEqual(violations, 0, '飞行与落地过程中都不允许进入任何障碍体块（空中水平碰撞必须仍生效）');
  assert(refusedAirborne > 0, '空中再按跳跃必须被明确拒绝（reason=airborne），不得叠加');
  assertEqual(starts, 4, '4 轮应成功起跳 4 次（空中/冷却被拒的不计入）');
  const d = rig.describe();
  assertEqual(d.fpJump.starts, 4, 'starts 计数应与成功起跳次数逐值一致');
  assert(d.fpJump.refused >= refusedAirborne, 'refused 计数应如实累加');
});

/** 用与 fp.js 同法（探针输入测灵敏度）把视线转到指定 yaw。 */
function faceYaw(rig, targetYaw) {
  const yawOf = () => Math.atan2(rig.viewDirection().x, rig.viewDirection().z);
  const y0 = yawOf();
  rig.applyInput('rotate', { dx: 100, dy: 0 });
  const y1 = yawOf();
  const perUnit = (y1 - y0) / 100;
  assert(Math.abs(perUnit) > 1e-9, '旋转灵敏度必须可测（不得为 0）');
  rig.applyInput('rotate', { dx: (targetYaw - y1) / perUnit, dy: 0 });
  return yawOf();
}

await runner.test('④ 非可站立落点 ⇒ 回起跳点（两条机制各自复现）', () => {
  /* ---- ④a 落差超阈值（真实台阶边）：WK-B-side-west-south-transition-1 (0.45m) ⇒ WK-B-plaza (0m) ---- */
  const from = { x: -57, y: 0.45, z: -304 };
  const to = { x: -55.8, y: 0, z: -304 };
  const surfaceFrom = LAYOUT.floorYAt(from.x, from.z);
  const surfaceTo = LAYOUT.floorYAt(to.x, to.z);
  assertEqual(surfaceFrom, from.y, '取样点面高应与登记一致（0.45）');
  assertEqual(surfaceTo, to.y, '落点面高应与登记一致（0）');
  const drop = surfaceFrom - surfaceTo;
  assert(drop > 0.15, `该台阶落差应 >0.15（实际 ${drop}）`);
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.INTERACTION.step.snapDownDistance = 0.05; // 只改测试局部配置：落差 > 阈值 ⇒ 不可站立
  cfg.INTERACTION.step.maxStepHeight = 0.5;
  {
    const { rig, kbd, store } = makeRig({ config: cfg });
    rig.enterFp({ position: { x: from.x, y: surfaceFrom + eye, z: from.z }, instant: true });
    faceYaw(rig, Math.atan2(to.x - from.x, to.z - from.z));
    const takeoff = { x: rig.position.x, y: rig.position.y, z: rig.position.z };
    kbd.dispatch('keydown', 'KeyW'); // 起跳同时前进 ⇒ 飞越台阶边
    assertEqual(rig.jump('test').ok, true, '台阶边起跳应成功');
    for (let i = 0; i < 120; i += 1) rig.update(1 / 60, i / 60, store.state);
    kbd.dispatch('keyup', 'KeyW');
    const d = rig.describe();
    const back = d.fpJump.lastLanding;
    runner.info(`④a 落差 ${drop.toFixed(2)}m > snapDown 0.05 ⇒ ${back?.kind}／${back?.reason}｜落点面高 ${back?.surfaceY}`);
    assertEqual(d.fpJump.reverts, 1, '落差超过 snapDownDistance 的落点必须判为不可站立');
    assertEqual(back.kind, 'reverted', '最近一次落地应为"回退"');
    assertEqual(back.reason, 'notStandable:dropTooDeep', '回退原因必须是落差超阈值');
    assertEqual(back.drop, +drop.toFixed(6), '落地记录里的落差应逐值等于台阶落差');
    assertClose(rig.position.x, takeoff.x, 1e-9, '回退必须逐值回到起跳点 x');
    assertClose(rig.position.z, takeoff.z, 1e-9, '回退必须逐值回到起跳点 z');
    assertClose(rig.position.y, takeoff.y, 1e-9, '回退必须逐值回到起跳点 y（不得落在非法位置）');
    assertEqual(rig.isAirborne, false, '回退后应结束滞空');
  }
  /* ---- ④b 落点被障碍占据（blockedAtFeet 分支）：原地跳 + 合成"低矮体块"盖住落点 ---- */
  {
    const { rig, registry, store } = makeRig();
    const spawn = { ...fpSpawn.position };
    // 顶面 0.2m 的低矮体块：飞行中脚底（最高 0.86m）在顶面之上可过；落地脚高 0 落入其厚度 ⇒ 被挡
    const synthetic = {
      id: 'TEST-jump-blocker', buildingId: 'TEST-jump-blocker',
      // 形状必须与谓词层一致：`bounds` 才是 footprint（`obstacleBlocksPoint` 只认 bounds/y0/y1）
      bounds: { minX: spawn.x - 2, maxX: spawn.x + 2, minZ: spawn.z - 2, maxZ: spawn.z + 2 },
      y0: 0, y1: 0.2, kind: 'test-blocker',
    };
    const original = registry.allObstacles.bind(registry);
    registry.allObstacles = () => [...original(), synthetic];
    rig.enterFp({ position: spawn, instant: true });
    const takeoff = { x: rig.position.x, y: rig.position.y, z: rig.position.z };
    assertEqual(rig.jump('test').ok, true, '原地起跳应成功');
    for (let i = 0; i < 120; i += 1) rig.update(1 / 60, i / 60, store.state);
    const d = rig.describe();
    const back = d.fpJump.lastLanding;
    runner.info(`④b 落点被低矮体块占据（顶面 0.2m）⇒ ${back?.kind}／${back?.reason}｜落点面高 ${back?.surfaceY}`);
    assertEqual(back.kind, 'reverted', '落点被障碍占据时必须回退（落地须可站立）');
    assertEqual(back.reason, 'notStandable:blockedAtFeet', '回退原因必须是落点被障碍挡住（不是落差）');
    assertClose(rig.position.x, takeoff.x, 1e-9, '回退必须逐值回到起跳点 x');
    assertClose(rig.position.y, takeoff.y, 1e-9, '回退必须逐值回到起跳点 y');
    assertEqual(rig.isAirborne, false, '回退后应结束滞空');
    // 对照：撤掉体块后同一原地跳必须正常落地（证明上一条不是"恒回退"的假红）
    registry.allObstacles = original;
    const clean = rig.jump('test');
    assertEqual(clean.ok, true, '对照起跳应成功（冷却已由 120 帧推进）');
    for (let i = 0; i < 120; i += 1) rig.update(1 / 60, i / 60, store.state);
    const d2 = rig.describe();
    assertEqual(d2.fpJump.lastLanding.kind, 'ground', '对照（无障碍）必须正常落地');
    runner.info(`④b 对照：撤掉体块后同一点起跳 ⇒ ${d2.fpJump.lastLanding.kind}（y=${rig.position.y}）✓`);
  }
});

await runner.test('⑤ F 语义：第一人称中再按一次退出（即使有选中且可进入内景）', () => {
  const inFpSelected = resolveKey('KeyF', { fpActive: true, hasSelection: true, selectedVisitable: true });
  assertEqual(inFpSelected.kind, 'view', '第一人称 + 有选中可进入 ⇒ 仍必须是"退出第一人称"（修前被判成 enterInterior）');
  assertEqual(inFpSelected.label, '退出第一人称', '文案应为"退出第一人称"');
  assertEqual(inFpSelected.request.type, EVENTS.requestViewMode, '应发同一条视角模式请求（core 的 F 切换语义）');
  assertEqual(inFpSelected.request.payload.mode, 'fp', '载荷应为 { mode: "fp" }（toggle）');
  assertEqual(inFpSelected.local, null, '不应走本地 enterInterior 分支');
  const inFp = resolveKey('KeyF', { fpActive: true });
  assertEqual(inFp.label, '退出第一人称', '无选中时同样是退出第一人称');
  const interior = resolveKey('KeyF', { viewMode: 'interior', fpActive: false });
  assertEqual(interior.local, 'exitInterior', '内景中 F 仍是返回内景前视角');
  const selOnly = resolveKey('KeyF', { hasSelection: true, selectedVisitable: true });
  assertEqual(selOnly.local, 'enterInterior', '非第一人称 + 有选中可进入 ⇒ 进内景（原语义不得回退）');
  const none = resolveKey('KeyF', {});
  assertEqual(none.request.payload.mode, 'fp', '无选中且非第一人称 ⇒ 进入第一人称');
  runner.info('F 优先级：第一人称退出 > 内景返回 > 选中进内景 > 进第一人称 ✓');
});

await runner.test('⑥ Space 语义分流 + 帮助文案同源', () => {
  const inFp = resolveKey('Space', { fpActive: true });
  assertEqual(inFp.kind, 'jump', '第一人称下 Space 必须是跳跃');
  assertEqual(inFp.local, 'jump', '跳跃应走本地动作 jump（由 rig 跳跃内核执行）');
  assertEqual(inFp.request, null, '跳跃不得顺带发导览请求');
  assert(KEY_KINDS.includes('jump'), 'KEY_KINDS 应登记 jump 类型');
  const idle = resolveKey('Space', {});
  assertEqual(idle.kind, 'tour', '非第一人称仍是导览');
  assertEqual(idle.request.payload.action, 'start', '未在导览时 Space 开始导览');
  const touring = resolveKey('Space', { tourActive: true });
  assertEqual(touring.request.payload.action, 'stop', '导览中 Space 退出导览');
  const help = helpKeyList();
  const spaceRow = help.find((r) => r.code === 'Space');
  const fRow = help.find((r) => r.code === 'F');
  assert(/跳跃/.test(spaceRow.label), `Space 帮助文案必须写明跳跃（实际"${spaceRow.label}"）`);
  assert(/退出第一人称/.test(fRow.label), `F 帮助文案必须写明第一人称再按退出（实际"${fRow.label}"）`);
  assert(/跳跃/.test(TOUCH_SUPPORT_NOTE), '触屏支持说明应与键盘能力同步（含空格跳跃）');
  runner.info(`Space：第一人称=跳跃｜其它=导览；文案： "${spaceRow.label}" ✓`);
});

await runner.test('⑦ 接线守卫：跳跃内核唯一、卡死计时空中豁免、A/D 修复不被回退', () => {
  const CAM = readSource('src/core/camera.js');
  const IX = readSource('src/interaction/index.js');
  const SOLVER = readSource('src/interaction/walk-solver.js');
  // A/D 修复：strafe 项必须与 right 向量同向（-cos / +sin）
  assert(/let dirX = sin \* forward - cos \* strafe;/.test(CAM) && /let dirZ = cos \* forward \+ sin \* strafe;/.test(CAM),
    'A/D 修复必须保留（strafe 项 -cos/+sin）；若改回旧式则 A/D 再次反号');
  // 跳跃内核唯一：jump() 只定义一次，且由 updateFp 积分
  const jumpDefs = CAM.split('function jump(').length - 1;
  assertEqual(jumpDefs, 1, '`function jump(` 必须唯一（不得出现第二套跳跃实现）');
  assert(/jumpState\.active/.test(CAM) && /integrateJump\(/.test(CAM), '跳跃必须由滞空状态机 + 逐帧积分实现');
  assert(/airborne: true/.test(CAM), '空中水平位移必须显式走 airborne 求解（跳过步行台阶阈值，保留障碍/包络约束）');
  assert(/if \(!airborne\) \{/.test(CAM), '步行台阶阈值必须仅在非 airborne 分支生效（默认路径语义不变）');
  assert(/Math\.max\(0\.05, Math\.min\(1\.0, Number\(jumpCfg\.maxHeight\)/.test(CAM), '顶点必须有 1.0m 硬上限钳制（读 INTERACTION.jump.maxHeight）');
  assert(/INTERACTION\.jump\.enabled === false/.test(CAM), '必须由 `INTERACTION.jump.enabled` 这个既有开关统一控制（不另立开关）');
  // 交互层：local jump 走 rig.jump（唯一内核），空中豁免如实传给求解器
  assert(/resolved\.local === 'jump'/.test(IX) && /rig\.jump\('keyboard:Space'\)/.test(IX), '交互层必须把 Space 交给 rig.jump');
  assert(/airborne/.test(IX) && /noteStuckTick\(dt, \{ intent, moved[^)]*airborne/.test(IX.replace(/\n/g, ' ')), '卡死计时必须如实接收 airborne');
  assert(/airborne = false/.test(SOLVER) && /source: 'airborne-exempt'/.test(SOLVER), 'walk-solver 必须实现空中豁免并如实标注来源');
  // 协作路径：core 先处理 F 时不得被"改过的状态"重判为进内景
  assert(/coreHandledFpToggle/.test(IX), '协作路径必须识别"core 已处理 F"并跳过（否则第一人称按 F 会进内景）');
  runner.info('接线：A/D 修复在位 ✓｜跳跃内核唯一 + 1.0m 硬上限 ✓｜airborne 求解与卡死豁免 ✓｜协作路径 F 去重 ✓');
});

await runner.test('⑦b 卡死计时的空中豁免是功能性的（落地后照常计时）', async () => {
  const solver = createWalkSolver({ config: CONFIG, layout: LAYOUT });
  // 有意图、无位移：连续 2s ⇒ 必须判卡死
  let stuckAt = null;
  for (let i = 0; i < 120; i += 1) {
    const r = solver.noteStuckTick(1 / 60, { intent: true, moved: 0, threshold: 1.5 });
    if (r.stuck) { stuckAt = r.seconds; break; }
  }
  assert(stuckAt !== null && stuckAt >= 1.5, `无位移 2s 必须判卡死（实际 ${stuckAt}）`);
  solver.resetStuckTimer();
  // 空中：同一输入不得累计
  for (let i = 0; i < 120; i += 1) {
    const r = solver.noteStuckTick(1 / 60, { intent: true, moved: 0, threshold: 1.5, airborne: true });
    assertEqual(r.stuck, false, '空中不得判卡死');
    assertEqual(r.seconds, 0, '空中卡死计时必须为 0');
    assertEqual(r.source, 'airborne-exempt', '读数来源应如实标注 airborne-exempt');
  }
  // 落地后恢复计时（不放宽判据）
  let after = null;
  for (let i = 0; i < 120; i += 1) { const r = solver.noteStuckTick(1 / 60, { intent: true, moved: 0, threshold: 1.5, airborne: false }); if (r.stuck) { after = r.seconds; break; } }
  assert(after !== null, '落地后"有意图无位移"仍必须能判卡死（判据不放宽）');
  runner.info(`地面 1.5s 判卡死 ✓｜空中 2s 计时恒 0（airborne-exempt）✓｜落地后仍可判卡死（${after?.toFixed(2)}s）✓`);
});

/* ==========================================================================
 *  H. t15 选中即传送：进第一人称落在选中物旁
 * ======================================================================== */

runner.section('H. t15 选中即传送（落在选中物旁）');

/** 判定一个落点是否"合法且逐值"（口径与 t105/core 内部一致，测试侧独立复算）。 */
function judgeLanding(registry, p) {
  const surfaceY = LAYOUT.floorYAt(p.x, p.z);
  const surfaces = surfaceY === null ? [] : LAYOUT.walkableAt(p.x, p.z);
  const surface = surfaces.find((s) => Math.abs((s.y ?? 0) - surfaceY) < 1e-9) ?? surfaces[0] ?? null;
  const blocked = (registry.allObstacles?.() ?? LAYOUT.OBSTACLES).some((o) =>
    obstacleBlocksPoint(o, { x: p.x, z: p.z, feetY: surfaceY ?? 0, height: CONFIG.INTERACTION.player.height, radius: CONFIG.INTERACTION.player.radius }),
  );
  const inTerrain = p.x >= LAYOUT.TERRAIN_EXTENT.minX && p.x <= LAYOUT.TERRAIN_EXTENT.maxX && p.z >= LAYOUT.TERRAIN_EXTENT.minZ && p.z <= LAYOUT.TERRAIN_EXTENT.maxZ;
  return {
    surfaceY,
    surfaceId: surface?.id ?? null,
    enterable: surface ? surface.enterable !== false : false,
    blocked,
    inTerrain,
    eyeExact: surfaceY !== null && p.y === surfaceY + eye, // **严格等值**（不是容差比较）
    ok: surfaceY !== null && !blocked && inTerrain && surface ? surface.enterable !== false : false,
  };
}

await runner.test('H1 选中一栋建筑 + 进第一人称 ⇒ 落在**该建筑门外锚点**（不再是 200–870m 外的出生点）', () => {
  const { rig, store, registry } = makeRig();
  const entries = ['B-hall-main', 'C-hall-bed-main', 'C-gate-inner'];
  for (const id of entries) {
    const slot = LAYOUT.SLOT_BY_ID[id];
    store.patch({ selectedBuildingId: id }, { source: 'test' });
    const res = rig.enterFp({ source: 'test', instant: true });
    const pos = { x: rig.position.x, y: rig.position.y, z: rig.position.z };
    const facade = slot.door?.facade ?? slot.entrance;
    const distFacade = Math.hypot(pos.x - facade.x, pos.z - facade.z);
    const cx = (slot.bounds.minX + slot.bounds.maxX) / 2;
    const cz = (slot.bounds.minZ + slot.bounds.maxZ) / 2;
    const distCenter = Math.hypot(pos.x - cx, pos.z - cz);
    const j = judgeLanding(registry, pos);
    runner.info(`${id}：落点 (${pos.x.toFixed(2)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(2)})｜距门外锚点 ${distFacade.toFixed(2)}m｜距足迹中心 ${distCenter.toFixed(1)}m｜来源 ${res.spawnId ?? '(selection)'}`);
    assert(res.selectionLanding?.buildingId === id, `${id}：进入读数必须标明落点来自选中建筑`);
    assertEqual(res.spawnId, null, `${id}：选中落地**不得**同时报一个出生点 id（避免"看着像从出生点来的"）`);
    assert(distFacade <= 1.0, `${id}：必须落在门外锚点 1m 内（实际 ${distFacade.toFixed(2)}m）`);
    assert(distCenter <= 40, `${id}：必须在该建筑近旁（实际距足迹中心 ${distCenter.toFixed(1)}m）`);
    // 合法性四项（卡面逐条）
    assertEqual(j.surfaceY !== null, true, `${id}：必须落在可行走面上`);
    assertEqual(j.blocked, false, `${id}：落点脚高处不得有任何障碍`);
    assertEqual(j.inTerrain, true, `${id}：必须在包络（TERRAIN_EXTENT）内`);
    assertEqual(j.enterable, true, `${id}：落点所在可行走面必须 enterable`);
    assertEqual(j.eyeExact, true, `${id}：眼高必须**逐值** = 面高 + fpEyeHeight（实际 y=${pos.y} 面高=${j.surfaceY}）`);
    rig.exitFp({ source: 'test', reason: 'reset' });
  }
});

await runner.test('H2 无门洞建筑（角楼）也落在入口锚点旁；两源对照', () => {
  const { rig, store } = makeRig();
  const id = 'F-tower-corner-nw';
  const slot = LAYOUT.SLOT_BY_ID[id];
  assertEqual(slot.door, null, '该角楼应无门洞（doorless）');
  store.patch({ selectedBuildingId: id }, { source: 'test' });
  const res = rig.enterFp({ source: 'test', instant: true });
  const dist = Math.hypot(rig.position.x - slot.entrance.x, rig.position.z - slot.entrance.z);
  runner.info(`角楼 ${id}：距 entrance 锚点 ${dist.toFixed(2)}m（来源 ${res.selectionLanding.kind}，tier ${res.selectionLanding.tier}）`);
  assert(dist <= 1.0, `无门洞建筑必须落在 entrance 锚点 1m 内（实际 ${dist.toFixed(2)}m）`);
  assertEqual(res.selectionLanding.tier, 2, '无门洞建筑应走 tier2（entrance）');
});

await runner.test('H3 确定性：同一选中两次进入**逐值一致**，且与进入前相机位置无关', () => {
  const { rig, store } = makeRig();
  store.patch({ selectedBuildingId: 'B-hall-main' }, { source: 'test' });
  const first = rig.fpLandingFor('B-hall-main');
  const second = rig.fpLandingFor('B-hall-main');
  assertEqual(JSON.stringify(first), JSON.stringify(second), '纯函数两次调用必须逐值一致');
  // 把相机放到很远处再推导：落点不得变化（候选顺序不含相机位置）
  const before = rig.describe().position;
  rig.position.set(-300, 60, 400);
  const far = rig.fpLandingFor('B-hall-main');
  rig.position.set(before.x, before.y, before.z);
  assertEqual(JSON.stringify(far), JSON.stringify(first), '落点推导必须与相机位置无关（确定性）');
  // 进入两次（中间退出）⇒ 落点逐值一致
  const e1 = rig.enterFp({ source: 'test', instant: true });
  const p1 = { ...rig.describe().position };
  rig.exitFp({ source: 'test', reason: 'reset' });
  const e2 = rig.enterFp({ source: 'test', instant: true });
  const p2 = { ...rig.describe().position };
  assertEqual(JSON.stringify(p1), JSON.stringify(p2), '两次进入的落点必须逐值一致');
  assertEqual(JSON.stringify(e1.position), JSON.stringify(e2.position), 'enterFp 返回的落点也必须一致');
});

await runner.test('H4 无选中 ⇒ 保持原行为（最近 fp-spawn）；显式 spawnId/position 优先级最高', () => {
  const { rig, store, registry } = makeRig();
  store.patch({ selectedBuildingId: null }, { source: 'test' });
  const res = rig.enterFp({ source: 'test', instant: true });
  const near = registry.nearestFpSpawn({ x: 0, y: 520, z: -1180 });
  assertEqual(res.spawnId, near.viewpoint.id, '无选中时必须仍是"离当前机位最近的已登记出生点"（原行为不变）');
  assertEqual(res.selectionLanding, null, '无选中时不得报"选中落地"');
  assertEqual(rig.describe().position.x, near.viewpoint.position.x, '落点 x 应等于该出生点');
  assertEqual(rig.describe().position.z, near.viewpoint.position.z, '落点 z 应等于该出生点');
  rig.exitFp({ source: 'test', reason: 'reset' });
  // 显式 spawnId：即使有选中也不得被覆盖
  store.patch({ selectedBuildingId: 'B-hall-main' }, { source: 'test' });
  const forced = rig.enterFp({ source: 'test', spawnId: near.viewpoint.id, instant: true });
  assertEqual(forced.spawnId, near.viewpoint.id, '显式 spawnId 必须优先于选中推导');
  assertEqual(forced.selectionLanding, null, '显式 spawnId 时不得再做选中推导');
  assertEqual(rig.position.x, near.viewpoint.position.x, '落点应等于显式出生点');
  rig.exitFp({ source: 'test', reason: 'reset' });
  // 显式 position：强制落点优先（脱困/回滚路径依赖它）
  const forcedPos = rig.enterFp({ source: 'test', position: { x: -30, y: 1.65, z: -360 }, instant: true });
  assertEqual(forcedPos.selectionLanding, null, '显式 position 时不得再做选中推导');
  assertEqual(rig.position.z, -360, '强制落点必须生效');
});

await runner.test('H5 失败路径：选中建筑四周全被挡 ⇒ 不产生半应用位移；严格模式不改动任何状态', () => {
  const { rig, store, registry } = makeRig();
  store.patch({ selectedBuildingId: 'B-hall-main' }, { source: 'test' });
  const slot = LAYOUT.SLOT_BY_ID['B-hall-main'];
  // 构造"整圈被挡"：把建筑周围 ±12m 全部登记为整足迹障碍（注入 registry，不改产品代码）
  const ring = {
    id: 'TEST-t15-ring',
    buildingId: 'TEST-t15-ring',
    blocks: 'all',
    door: null,
    y0: 0,
    y1: 40,
    bounds: { minX: slot.bounds.minX - 12, maxX: slot.bounds.maxX + 12, minZ: slot.bounds.minZ - 12, maxZ: slot.bounds.maxZ + 12 },
  };
  const original = registry.allObstacles;
  registry.allObstacles = () => [...original(), ring];
  /* "视图与位置"= 机位参数本身（position/target/mode/projection/fov/zoom/axisIndex/fpActive）。
     诊断读数 `fpSelectionLanding` 会如实记录**最近一次尝试**（如同 `lastEscape`/`fpJump.lastLanding`）⇒ 不参与逐值比较。 */
  const viewState = () => {
    const d = rig.describe();
    return JSON.stringify({ mode: d.mode, projection: d.projection, position: d.position, target: d.target, fov: d.fov, zoom: d.zoom, axisIndex: d.axisIndex, fpActive: d.fpActive, viewDirection: d.viewDirection });
  };
  const before = viewState();
  const plan = rig.fpLandingFor('B-hall-main');
  assertEqual(plan.ok, false, '整圈被挡时推导必须如实失败（不得硬给一个非法点）');
  assertEqual(plan.reasons.join(','), 'noStandablePointNearSelection', '失败原因必须写明');
  assert(plan.attempts.length > 0 && plan.attempts.every((a) => a.ok === false), '每个候选都必须带失败原因（可复核）');
  assertEqual(viewState(), before, '推导是纯函数：**不得**改动视图/位置/机位参数');
  // 严格模式：明确要求"只走传送"时，失败 ⇒ 什么都不做
  const strict = rig.enterFp({ source: 'test', selectionOnly: true, instant: true });
  assertEqual(strict, null, 'selectionOnly 失败时必须返回 null');
  assertEqual(rig.isFp, false, '严格模式失败后不得进入第一人称');
  assertEqual(viewState(), before, '严格模式失败后位置/机位必须逐值不变（t105 先例）');
  assertEqual(rig.describe().fpSelectionLanding.reasons.join(','), 'noStandablePointNearSelection', '诊断读数必须如实记下失败原因（不是静默）');
  // 默认模式：回落到既有出生点路径，并如实标注 fallback（不是"半应用位移"）
  const fallback = rig.enterFp({ source: 'test', instant: true });
  assertEqual(fallback.selectionFallback, true, '默认模式必须如实标注 fallback');
  assertEqual(rig.describe().fpSelectionLanding.fallback, true, 'describe() 读数同样标注 fallback');
  const near = registry.nearestFpSpawn({ x: 0, y: 520, z: -1180 });
  assertEqual(fallback.spawnId, near.viewpoint.id, '回落后落点必须是已登记出生点（合法）');
  const j = judgeLanding({ allObstacles: original }, rig.describe().position);
  assertEqual(j.ok, true, '回落后落点仍必须合法（可站立/包络内/眼高逐值）');
  // 对照：撤掉注入的障碍 ⇒ 立刻恢复"落在门外锚点"
  registry.allObstacles = original;
  rig.exitFp({ source: 'test', reason: 'reset' });
  const again = rig.enterFp({ source: 'test', instant: true });
  assertEqual(again.selectionLanding?.buildingId, 'B-hall-main', '对照：撤掉障碍后应恢复选中落地');
  assert(Math.hypot(rig.position.x - slot.door.facade.x, rig.position.z - slot.door.facade.z) <= 1.0, '对照：落点回到门外锚点');
});

await runner.test('H6 覆盖度：全部登记建筑都能推导出合法就近落点（数据推导，无写死计数）', () => {
  const { rig } = makeRig();
  const ids = LAYOUT.SLOTS.map((s) => s.id);
  const failures = [];
  const tiers = { 1: 0, 2: 0, 3: 0 };
  for (const id of ids) {
    const plan = rig.fpLandingFor(id);
    if (!plan || !plan.ok) failures.push({ id, reasons: plan?.reasons ?? ['missing-slot'] });
    else tiers[plan.tier] += 1;
  }
  runner.info(`覆盖度：建筑 ${ids.length} 栋｜tier1(门外锚点) ${tiers[1]}｜tier2(入口锚点) ${tiers[2]}｜tier3(足迹外推) ${tiers[3]}｜失败 ${failures.length}`);
  assertEqual(failures.length, 0, `所有登记建筑都必须有合法就近落点，失败：${JSON.stringify(failures.slice(0, 5))}`);
  assertEqual(tiers[1] + tiers[2] + tiers[3], ids.length, '分层计数之和必须等于建筑总数（分类完备）');
  assert(tiers[1] >= tiers[2], '天然门厅/有门洞建筑应占多数（tier1 优先）');
  // 不存在的建筑：如实返回 null（不得抛错、不得给默认点）
  assertEqual(rig.fpLandingFor('NO-SUCH-BUILDING'), null, '未知建筑必须返回 null');
  assertEqual(rig.fpLandingFor(null), null, 'null 输入必须返回 null');
});

process.exit(runner.summary());
