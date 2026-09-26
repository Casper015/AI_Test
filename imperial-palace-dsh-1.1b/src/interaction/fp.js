/**
 * 第一人称辅助控制（G 侧）：指针锁定、进入朝向、出生点校验、可见提示。
 *
 * **不实现第二套相机**：移动/台阶平滑/视线高全部由 core 的 `rig.updateFp()`（唯一相机装置）执行，
 * 本模块只通过 core 暴露的两条接口做事：
 *   - `rig.applyInput('rotate', { dx, dy })`：转视角（与鼠标拖动同一条输入语义）；
 *   - 读 `rig.describe()` / `layout.floorYAt`：校验与提示。
 *
 * 朝向校准不写死 core 的旋转灵敏度：先用一次探针输入测量"每单位 dx 改变多少 yaw"，
 * 再施加残余角度（因此 core 调整灵敏度时本模块无需同步改动）。
 */

import { CONFIG } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';

const RAD = Math.PI / 180;
/** 把弧度差归一化到 [-π, π)。 */
const wrapRad = (rad) => ((rad + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

/** 两点间的朝向 yaw（与 core 的 `yaw = atan2(dirX, dirZ)` 同一定义）。 */
export function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/**
 * 进入第一人称时的朝向目标（计划 §6.4："朝向中轴或当前选中建筑"）。
 * @param {{ position: {x:number,z:number}, selectedBuildingId?: string|null, catalog?: object,
 *           route?: object[] }} options
 * @returns {{ target: {x:number,z:number}, source: 'selected'|'route'|'axis' }}
 */
export function aimTargetForEntry({ position, selectedBuildingId = null, catalog = null, route = LAYOUT.FP_ROUTE } = {}) {
  if (selectedBuildingId && catalog?.info) {
    const info = catalog.info(selectedBuildingId);
    if (info?.center) return { target: { x: info.center.x, z: info.center.z }, source: 'selected' };
  }
  // 无选中：沿中轴走查路线的下一个路点（路线本身南→北沿中轴推进）
  if (Array.isArray(route) && route.length > 0) {
    let nearest = 0;
    let bestDist = Infinity;
    route.forEach((waypoint, index) => {
      const d = Math.hypot(waypoint.position.x - position.x, waypoint.position.z - position.z);
      if (d < bestDist) {
        bestDist = d;
        nearest = index;
      }
    });
    const next = route[Math.min(nearest + 1, route.length - 1)];
    const previous = route[Math.max(nearest - 1, 0)];
    const target = next === route[nearest] ? previous : next;
    return { target: { x: target.position.x, z: target.position.z }, source: 'route' };
  }
  // 兜底：朝北（中轴向北收束到御花园），不复用任何数值
  return { target: { x: position.x, z: position.z + 100 }, source: 'axis' };
}

/**
 * 出生点校验：登记机位必须落在可行走面上，视线高 = 面高 + fpEyeHeight（CONTRACTS §5.2）。
 * @returns {{ ok: boolean, surfaceY: number|null, expectedY: number, actualY: number, problems: string[] }}
 */
export function validateFpSpawn(spawn, { layout = LAYOUT, config = CONFIG } = {}) {
  const problems = [];
  const position = spawn?.position;
  if (!position) return { ok: false, surfaceY: null, expectedY: NaN, actualY: NaN, problems: ['出生点缺少 position'] };
  const surfaces = layout.walkableAt(position.x, position.z);
  if (surfaces.length === 0) problems.push(`出生点 ${spawn.id} 不在任何可行走面上`);
  const surfaceY = surfaces.length > 0 ? surfaces[0].y : null;
  const expectedY = surfaceY === null ? NaN : +(surfaceY + config.CAMERA.fpEyeHeight).toFixed(3);
  if (surfaceY !== null && Math.abs(position.y - expectedY) > 0.06) {
    problems.push(`出生点 ${spawn.id} 视线高 ${position.y} ≠ 面高 ${surfaceY} + ${config.CAMERA.fpEyeHeight} = ${expectedY}`);
  }
  return { ok: problems.length === 0, surfaceY, expectedY, actualY: position.y, problems, surfaces: surfaces.map((s) => s.id) };
}

/**
 * 创建第一人称辅助控制器。
 * @param {{
 *   rig: object, events: object, document?: object|null, domElement?: object|null, config?: object,
 *   layout?: object, catalog?: object|null, onHint?: null|((hint: object) => void)
 * }} options
 */
export function createFpController({
  rig,
  events,
  document: doc = typeof document !== 'undefined' ? document : null,
  domElement = null,
  config = CONFIG,
  layout = LAYOUT,
  catalog = null,
  onHint = null,
  store = null,
} = {}) {
  if (!rig) throw new Error('createFpController 需要唯一相机装置（rig）');
  const stats = { entries: 0, exits: 0, lockRequests: 0, lockGranted: 0, lockDenied: 0, aims: 0, aimFailures: 0, blockedWarnings: 0, calibrations: 0 };
  const listeners = [];
  let sensitivity = null;
  let attached = false;
  let explicitAimId = null;
  let lastAim = null;
  /** 最近一次第一人称退出（用于识别"core 的键盘分支抢先处理了 Esc"的合成事件路径）。 */
  let lastExit = { at: -Infinity, reason: null };
  const lastEntry = { spawnId: null, position: null, aim: null, spawnCheck: null };

  const on = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };

  const locked = () => !!doc?.pointerLockElement && doc.pointerLockElement === domElement;

  /**
   * 当前视线 yaw（弧度）。
   *
   * ⚠ 实测教训（2026-09-26 真实浏览器）：core 的 `applyInput('rotate')` 在第一人称下只改内部
   * `yaw/pitch`，**不会**立刻写回 `position/target`（target 在下一帧 `updateFp` 才重算），
   * 因此直接读 `describe().azimuthDeg` 会得到"没变化"的旧值 → 朝向校准恒为 0、朝向静默失效。
   * 这里改为"先让相机装置走极小一步（1/240s，等价于本帧内的自检）再读 target 方向"。
   */
  function stepRig() {
    try {
      rig.update(1 / 240, 0, store?.state ?? null);
    } catch (error) {
      console.warn('[interaction] 朝向自检时 rig.update 抛错（已忽略）：', error?.message ?? error);
    }
  }

  function currentYawRad() {
    stepRig();
    return Math.atan2(rig.target.x - rig.position.x, rig.target.z - rig.position.z);
  }

  /** 一次探针输入测出"每单位 dx 的 yaw 变化量（弧度）"（不写死 core 的魔数）。 */
  function calibrate() {
    if (sensitivity !== null) return sensitivity;
    const before = currentYawRad();
    rig.applyInput('rotate', { dx: -1000, dy: 0 });
    const after = currentYawRad();
    rig.applyInput('rotate', { dx: 1000, dy: 0 }); // 还原
    stepRig();
    const perUnit = (after - before) / 1000;
    sensitivity = Math.abs(perUnit) < 1e-9 ? 0 : perUnit;
    stats.calibrations += 1;
    if (!sensitivity) {
      // 真失败要留痕（不静默）：说明 core 的旋转语义变了，朝向需要人工核对
      stats.aimFailures += 1;
      onHint?.({ kind: 'aim', title: '朝向自检失败', detail: '相机装置的旋转语义与预期不同，进入第一人称时未能自动朝向中轴。' });
    }
    return sensitivity;
  }

  /** 把视线转到指定 yaw（弧度）；返回是否真的转了。 */
  function rotateToYaw(targetYaw) {
    const perUnit = calibrate();
    if (!perUnit) return false;
    const current = currentYawRad();
    const delta = wrapRad(targetYaw - current);
    if (Math.abs(delta) < 0.5 * RAD) return false;
    rig.applyInput('rotate', { dx: -delta / perUnit, dy: 0 });
    stepRig();
    stats.aims += 1;
    lastAim = { targetYawDeg: +(targetYaw / RAD).toFixed(2), fromYawDeg: +(current / RAD).toFixed(2), applied: true };
    return true;
  }

  function aimAfterEntry() {
    if (!rig.isFp) return null;
    const position = { x: rig.position.x, z: rig.position.z };
    const selectedBuildingId = explicitAimId ?? store?.state?.selectedBuildingId ?? null;
    const aim = aimTargetForEntry({ position, selectedBuildingId, catalog, route: layout.FP_ROUTE });
    const yaw = yawTo(position, aim.target);
    const rotated = rotateToYaw(yaw);
    const actual = currentYawRad();
    lastEntry.aim = {
      ...aim,
      yawDeg: +(yaw / RAD).toFixed(2),
      actualYawDeg: +(actual / RAD).toFixed(2),
      rotated,
      selectedBuildingId,
    };
    return lastEntry.aim;
  }

  function requestPointerLock() {
    if (!config.CAMERA.fpPointerLockOnEntry) return false;
    if (typeof domElement?.requestPointerLock !== 'function') return false;
    stats.lockRequests += 1;
    try {
      const result = domElement.requestPointerLock();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          stats.lockDenied += 1;
        });
      }
      return true;
    } catch (error) {
      stats.lockDenied += 1;
      onHint?.({ kind: 'pointerlock', title: '指针锁定不可用', detail: '可按住鼠标拖动转视角（Esc 退出第一人称前不会锁定）' });
      return false;
    }
  }

  function exitPointerLock() {
    if (locked()) doc.exitPointerLock?.();
    return true;
  }

  /** 指针锁定状态下用 movementX/Y 转视角（与 core 的拖动旋转同一个 applyInput 入口）。 */
  function onMouseMove(event) {
    if (!locked() || !rig.isFp) return;
    const dx = event.movementX ?? 0;
    const dy = event.movementY ?? 0;
    if (dx === 0 && dy === 0) return;
    rig.applyInput('rotate', { dx, dy });
  }

  function onPointerLockChange() {
    if (locked()) {
      stats.lockGranted += 1;
      return;
    }
    if (rig.isFp) {
      onHint?.({
        kind: 'pointerlock',
        title: '已释放指针锁',
        detail: '可按住鼠标拖动继续转视角，按 F 或点击「第一人称」按钮返回进入前的机位。',
      });
    }
  }

  function attach() {
    if (attached) return;
    attached = true;
    listeners.push(
      events.on('fp:entered', (payload) => {
        stats.entries += 1;
        lastEntry.spawnId = payload?.spawnId ?? null;
        lastEntry.position = payload?.position ? { ...payload.position } : null;
        const spawn = layout.VIEWPOINTS.find((v) => v.id === payload?.spawnId) ?? null;
        lastEntry.spawnCheck = spawn ? validateFpSpawn(spawn, { layout, config }) : null;
        if (lastEntry.spawnCheck && !lastEntry.spawnCheck.ok) {
          stats.blockedWarnings += 1;
          onHint?.({
            kind: 'spawn',
            title: '出生点校正提示',
            detail: lastEntry.spawnCheck.problems.join('；'),
          });
        }
        aimAfterEntry();
        requestPointerLock();
      }),
      events.on('fp:exited', (payload) => {
        stats.exits += 1;
        lastExit = { at: (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()), reason: payload?.reason ?? 'exit' };
        exitPointerLock();
      }),
      events.on(config.EVENTS.blockedByBuilding, (payload) => {
        stats.blockedWarnings += 1;
        onHint?.({ kind: 'blocked', obstacleId: payload?.buildingId ?? null, reason: payload?.reason ?? 'fp-collision' });
      }),
    );
    on(doc, 'mousemove', onMouseMove);
    on(doc, 'pointerlockchange', onPointerLockChange);
  }

  return {
    attach,
    detach() {
      for (const off of listeners.splice(0)) off();
      attached = false;
    },
    requestPointerLock,
    exitPointerLock,
    isPointerLocked: locked,
    /** 是否在 `windowMs` 内刚刚退出第一人称（reason 可选过滤）。 */
    recentExit(windowMs = 8, reason = null) {
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (now - lastExit.at > windowMs) return null;
      if (reason && lastExit.reason !== reason) return null;
      return { ...lastExit, ageMs: now - lastExit.at };
    },
    lastExit: () => ({ ...lastExit }),
    /** 朝向自检结果（诊断：灵敏度、是否真的转了、实际 yaw）。 */
    lastAim: () => (lastAim ? { ...lastAim } : null),
    /** 当前视线 yaw（度），用于验收断言"确实朝向目标"。 */
    yawDeg: () => +(currentYawRad() / RAD).toFixed(3),
    /** 进入后重新朝向（切换选中后可由 UI 调用）。 */
    aim(selectedBuildingId = null) {
      explicitAimId = selectedBuildingId;
      return aimAfterEntry();
    },
    validateSpawn(spawn) {
      return validateFpSpawn(spawn, { layout, config });
    },
    lastEntry: () => ({ ...lastEntry }),
    stats: () => ({ ...stats, sensitivity, attached, locked: locked() }),
  };
}

export default createFpController;
