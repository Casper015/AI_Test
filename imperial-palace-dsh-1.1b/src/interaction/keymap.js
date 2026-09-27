/**
 * 键盘映射（唯一）：按键 → §7.2 请求（计划 §6.2/§6.4）。
 *
 * 设计要点：
 *   1. **同一入口**：键盘 1–8 / F / Esc 与 UI 按钮产出同一份请求载荷，最终都由
 *      `src/core/state.js` 的控制器写入同一个 `state.viewMode`；
 *   2. **纯函数**：`resolveKey(code, ctx)` 不做任何副作用、不碰 DOM、不碰相机——交给调用方
 *      （`src/interaction/index.js` 的键盘层）决定"发请求 / 释放指针锁 / 切换面板"；
 *   3. `owned` 表示该键的语义由 G 定义（core 相机装置与 main.js 里也有同键分支）：
 *      键盘层对 `owned === true` 的键调用 `stopPropagation()`，避免同一按键被处理两次
 *      （否则 F 会"进入立刻退出"、T/Y/Space 会连跳两档）。
 *
 * Esc 的优先级（§6.4 "Esc 释放指针锁后可继续拖动视角或按 F 返回"）：
 *   第一人称 → 只释放指针锁（**不退出第一人称**）> 导览进行中 → 暂停 > 导览已暂停 → 退出导览 >
 *   有选中建筑 → 取消选中 > 其余 → 无操作。
 */

import { EVENTS } from '../shared/config.js';
import { TIME_PRESETS, QUALITY_ORDER, VIEW_MODE_BY_INDEX, nextInCycle } from './requests.js';

/** 移动键（由 core 相机装置的第一人称内核消费，G 不重复实现移动）。 */
export const MOVEMENT_CODES = Object.freeze([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

/** 键位动作类型。 */
export const KEY_KINDS = Object.freeze([
  'view',
  'tour',
  'preset',
  'quality',
  'reset',
  'selection',
  'pointerlock',
  'help',
  'minimap',
]);

/**
 * 解析一个按键。
 * @param {string} code `KeyboardEvent.code`
 * @param {{ viewMode?: string, fpActive?: boolean, tourActive?: boolean, tourPaused?: boolean,
 *           hasSelection?: boolean, selectedVisitable?: boolean, pointerLocked?: boolean, tourIndex?: number }} [ctx]
 * @returns {{ code, kind, label, owned, request: {type, payload}|null, local: string|null }|null}
 */
export function resolveKey(code, ctx = {}) {
  const {
    viewMode = 'oblique',
    fpActive = false,
    tourActive = false,
    tourPaused = false,
    hasSelection = false,
    selectedVisitable = false,
    pointerLocked = false,
  } = ctx;

  const digit = /^Digit([1-8])$/.exec(code ?? '');
  if (digit) {
    const index = Number(digit[1]);
    const mode = VIEW_MODE_BY_INDEX[index];
    if (!mode) return null;
    return { code, kind: 'view', label: `视角 ${index}`, owned: true, request: { type: EVENTS.requestViewMode, payload: { mode, index } }, local: null };
  }

  if (code === 'KeyF') {
    // F 的三条语义（t59，按优先级）：
    //   ① 已在某建筑内景 → 返回进入前的模式与机位；
    //   ② 有选中建筑 → visitable 则进入该建筑内景（机位由 catalog 从区/布局数据推导），
    //      否则只给"不可进入"提示、不改视角；
    //   ③ 无选中 → 第一人称切换（原语义：已在 FP 时再请求 fp，由 core 恢复进入前的模式与机位）。
    if (viewMode === 'interior') {
      return { code, kind: 'interior', label: '返回进入内景前的视角', owned: true, request: null, local: 'exitInterior' };
    }
    if (hasSelection) {
      if (selectedVisitable) {
        return { code, kind: 'interior', label: '进入选中建筑的内景', owned: true, request: null, local: 'enterInterior' };
      }
      return { code, kind: 'interior', label: '选中建筑不可进入内景', owned: true, request: null, local: 'notifyInteriorUnavailable' };
    }
    return {
      code,
      kind: 'view',
      label: fpActive ? '退出第一人称' : '第一人称',
      owned: true,
      request: { type: EVENTS.requestViewMode, payload: { mode: 'fp' } },
      local: null,
    };
  }

  if (code === 'Escape') {
    if (fpActive) {
      // §6.4：Esc 只释放指针锁，仍留在第一人称（按 F 才返回）
      return { code, kind: 'pointerlock', label: pointerLocked ? '释放指针锁' : '第一人称（未锁定）', owned: true, request: null, local: 'exitPointerLock' };
    }
    if (tourActive && !tourPaused) {
      return { code, kind: 'tour', label: '暂停导览', owned: true, request: { type: EVENTS.requestTour, payload: { action: 'pause' } }, local: 'notifyTourPaused' };
    }
    if (tourActive && tourPaused) {
      return { code, kind: 'tour', label: '退出导览', owned: true, request: { type: EVENTS.requestTour, payload: { action: 'stop' } }, local: null };
    }
    if (hasSelection) {
      return { code, kind: 'selection', label: '取消选中', owned: true, request: { type: EVENTS.selectionChange, payload: { buildingId: null, hovered: false } }, local: null };
    }
    return null;
  }

  if (code === 'KeyR') {
    return { code, kind: 'reset', label: '回到全城', owned: true, request: { type: EVENTS.requestReset, payload: {} }, local: null };
  }

  if (code === 'KeyT') {
    return {
      code,
      kind: 'preset',
      label: '切换时辰',
      owned: true,
      request: { type: EVENTS.requestTimePreset, payload: { preset: nextInCycle(TIME_PRESETS, ctx.timePreset) } },
      local: null,
    };
  }

  if (code === 'KeyY') {
    return {
      code,
      kind: 'quality',
      label: '切换质量档',
      owned: true,
      request: { type: EVENTS.requestQuality, payload: { tier: nextInCycle(QUALITY_ORDER, ctx.quality) } },
      local: null,
    };
  }

  if (code === 'Space') {
    return {
      code,
      kind: 'tour',
      label: tourActive ? '退出导览' : '开始导览',
      owned: true,
      request: { type: EVENTS.requestTour, payload: { action: tourActive ? 'stop' : 'start', index: 0 } },
      local: null,
    };
  }

  if (code === 'KeyH') {
    return { code, kind: 'help', label: '操作提示', owned: true, request: null, local: 'toggleHelp' };
  }

  if (code === 'KeyM') {
    return { code, kind: 'minimap', label: '小地图', owned: true, request: null, local: 'toggleMinimap' };
  }

  // t87/t123：防卡死脱困（用户需求"不会卡在什么奇奇怪怪的地方"）——确定性返回**最近的已登记出生点**。
  if (code === 'KeyG') {
    return { code, kind: 'escape', label: '脱离卡死（返回最近的已登记出生点）', owned: true, request: null, local: 'escapeStuck' };
  }

  return null;
}

/**
 * 供 UI 生成操作提示文案（与键盘实现同源，避免文档与代码不一致）。
 * @returns {{ code: string, label: string }[]}
 */
export function helpKeyList() {
  const rows = [];
  for (let index = 1; index <= 8; index += 1) {
    const resolved = resolveKey(`Digit${index}`, {});
    if (resolved) rows.push({ code: String(index), label: `视角 ${index}` });
  }
  rows.push({ code: 'F', label: '选中建筑：进入其内景 / 再按返回；未选中：进入或退出第一人称' });
  rows.push({ code: '点击建筑', label: '左上角显示该建筑详情（空白处或「关闭」取消选中）' });
  rows.push({ code: 'Esc', label: '释放指针锁（留在第一人称）/ 暂停导览' });
  rows.push({ code: 'W A S D', label: '第一人称移动（↑↓←→ 同义）' });
  rows.push({ code: 'G', label: '卡住了？返回最近的已登记出生点（连续受阻自动提示；落点与距离会如实写明）' });
  rows.push({ code: 'Shift', label: '第一人称加速' });
  rows.push({ code: '拖动 / 滚轮', label: '转视角 / 推拉镜头' });
  rows.push({ code: 'T / Y', label: '切换时辰 / 质量档' });
  rows.push({ code: 'Space', label: '开始 / 退出中轴导览' });
  rows.push({ code: 'R', label: '回到全城（复位）' });
  rows.push({ code: 'H / M', label: '操作提示 / 小地图' });
  return rows;
}

/** 触屏支持范围（§6.2 末条：必须明确说明漫游的支持范围）。 */
export const TOUCH_SUPPORT_NOTE =
  '触屏支持：单指拖动转视角、双指捏合缩放、点按建筑查看信息、点按分区按钮跳转、鸟瞰/分区/内景视角切换；' +
  '第一人称键盘漫游（WASD/Shift）与鼠标指针锁定仅在桌面浏览器可用，触屏下不提供（可点「分区」按钮用鸟瞰视角浏览全城）。';

export default resolveKey;
