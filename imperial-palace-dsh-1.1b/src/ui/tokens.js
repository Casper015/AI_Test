/**
 * UI 设计令牌（唯一来源 = `CONFIG.UI`，计划 §3.1）。
 *
 * 本文件把 config 的间距阶梯 / 圆角 / 过渡 / 字体 / 面板色转成
 *   - JS 常量（供内联样式与 minimap 使用）
 *   - CSS 自定义属性（注入 `:root`，让 `src/ui/styles.css` 只引用变量，不重复写死数值）
 *
 * `assertTokens()` 会在挂载时校验"所有间距都取自 4/8/12/16/24/32 阶梯"，不一致就抛错（不静默）。
 */

import { CONFIG, UI } from '../shared/config.js';

export const SPACING_SCALE = UI.spacingScale;
export const SPACING = UI.spacing;
export const RADIUS = UI.radius;
export const BORDER_WIDTH = UI.borderWidth;
export const TRANSITION_MS = UI.transitionMs;
export const CAMERA_TRANSITION_MS = UI.cameraTransitionMs;
export const TYPOGRAPHY = UI.typography;
export const PANEL = UI.panel;
export const HUD_Z_INDEX = UI.hudZIndex;
export const BREAKPOINTS = UI.breakpoints;
export const MINIMAP = UI.minimap;

/**
 * 校验一批间距值全部来自 §3.1 的阶梯（4/8/12/16/24/32）。
 * @param {number[]} values
 */
export function assertTokens(values = []) {
  const problems = [];
  const allowed = new Set(SPACING_SCALE);
  for (const value of values) if (!allowed.has(value)) problems.push(`间距 ${value}px 不在 §3.1 阶梯 [${SPACING_SCALE.join(', ')}] 内`);
  return problems;
}

/** CSS 自定义属性表（`:root`）。 */
export function cssVariables() {
  const panel = PANEL;
  return {
    '--palace-space-xxs': `${SPACING.xxs}px`,
    '--palace-space-xs': `${SPACING.xs}px`,
    '--palace-space-sm': `${SPACING.sm}px`,
    '--palace-space-md': `${SPACING.md}px`,
    '--palace-space-lg': `${SPACING.lg}px`,
    '--palace-space-xl': `${SPACING.xl}px`,
    '--palace-radius': `${RADIUS}px`,
    '--palace-border-width': `${BORDER_WIDTH}px`,
    '--palace-transition': `${TRANSITION_MS}ms`,
    '--palace-camera-transition': `${CAMERA_TRANSITION_MS}ms`,
    '--palace-font-title': TYPOGRAPHY.titleFamily,
    '--palace-font-body': TYPOGRAPHY.bodyFamily,
    '--palace-font-title-size': `${TYPOGRAPHY.titleSize}px`,
    '--palace-font-section-size': `${TYPOGRAPHY.sectionSize}px`,
    '--palace-font-body-size': `${TYPOGRAPHY.bodySize}px`,
    '--palace-font-caption-size': `${TYPOGRAPHY.captionSize}px`,
    '--palace-line-height': String(TYPOGRAPHY.lineHeight),
    '--palace-letter-spacing': `${TYPOGRAPHY.letterSpacing}px`,
    '--palace-panel-bg': panel.background,
    '--palace-panel-border': panel.borderColor,
    '--palace-title-color': panel.titleColor,
    '--palace-accent': panel.accentColor,
    '--palace-seal': panel.sealColor,
    '--palace-panel-shadow': panel.shadow,
    '--palace-touch-target': `${panel.minTouchTarget}px`,
    '--palace-z-loading': String(HUD_Z_INDEX.loading),
    '--palace-z-hud': String(HUD_Z_INDEX.hud),
    '--palace-z-panel': String(HUD_Z_INDEX.panel),
    '--palace-z-tooltip': String(HUD_Z_INDEX.tooltip),
    '--palace-z-error': String(HUD_Z_INDEX.error),
    '--palace-narrow': `${BREAKPOINTS.narrow}px`,
    '--palace-medium': `${BREAKPOINTS.medium}px`,
  };
}

/** 颜色令牌（色板取自 config.COLORS，UI 只做映射）。 */
export const COLORS = Object.freeze({ ...CONFIG.COLORS, ...CONFIG.COLORS_DERIVED });

export default {
  SPACING,
  SPACING_SCALE,
  RADIUS,
  TRANSITION_MS,
  TYPOGRAPHY,
  PANEL,
  HUD_Z_INDEX,
  BREAKPOINTS,
  MINIMAP,
  cssVariables,
  assertTokens,
};
