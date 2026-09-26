/**
 * 选中 / 悬停高亮（唯一实现）：不修改任何共享材质，用一个叠加层 Group 画包围盒线框。
 *
 * 为什么用线框而不是描边材质：
 *   1. 建筑由 t3 kit 的**共享材质**构建，就地改 `emissive/color` 会污染其它建筑（CONTRACTS §3.3 硬约束）；
 *   2. 灰盒与真实区域都要能高亮，线框只依赖 `bounds`，与几何来源无关；
 *   3. 只占 2 个绘制对象（悬停 + 选中），性能可控。
 *
 * 只用 config 的 `INTERACTION.selection.highlightColor / highlightPulseMs`，不散落字面量。
 */

import * as THREE from 'three';
import { CONFIG } from '../shared/config.js';

const UNIT = new THREE.BoxGeometry(1, 1, 1);

/**
 * @param {{ config?: object, parent: object, THREE?: object }} options
 */
export function createHighlighter({ config = CONFIG, parent } = {}) {
  if (!parent || typeof parent.add !== 'function') throw new Error('createHighlighter 需要场景父节点（parent）');
  const color = new THREE.Color(config.INTERACTION.selection.highlightColor);
  const pulseSeconds = config.INTERACTION.selection.highlightPulseMs / 1000;

  const group = new THREE.Group();
  group.name = 'palace-ui-highlight';
  group.renderOrder = 5;
  parent.add(group);

  // 单位盒几何由本模块持有（模块级单例，多实例共享；dispose 不销毁它以保护其它实例）
  const edges = new THREE.EdgesGeometry(UNIT);
  const owns = { geometry: edges, materials: [] };

  function makeBox({ opacity, depthTest = true }) {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest,
      depthWrite: false,
    });
    owns.materials.push(material);
    const line = new THREE.LineSegments(edges, material);
    line.visible = false;
    line.userData.palaceOverlay = true;
    group.add(line);
    return line;
  }

  const hoverBox = makeBox({ opacity: 0.45 });
  const selectBox = makeBox({ opacity: 0.95 });

  const state = { hovered: null, selected: null };
  const stats = { hoverShows: 0, selectShows: 0, updates: 0 };

  function apply(line, bounds) {
    if (!bounds) {
      line.visible = false;
      return;
    }
    const width = Math.max(0.5, bounds.maxX - bounds.minX);
    const depth = Math.max(0.5, bounds.maxZ - bounds.minZ);
    const height = Math.max(0.5, (bounds.maxY ?? 0) - (bounds.minY ?? 0));
    line.scale.set(width, height, depth);
    line.position.set((bounds.minX + bounds.maxX) / 2, (bounds.minY ?? 0) + height / 2, (bounds.minZ + bounds.maxZ) / 2);
    line.visible = true;
  }

  return {
    group,
    /** 悬停高亮（`bounds` 为 null 即清除）。 */
    setHovered(bounds) {
      state.hovered = bounds ?? null;
      apply(hoverBox, state.hovered);
      if (state.hovered) stats.hoverShows += 1;
    },
    /** 选中高亮（脉冲）。 */
    setSelected(bounds) {
      state.selected = bounds ?? null;
      apply(selectBox, state.selected);
      if (state.selected) stats.selectShows += 1;
    },
    clear() {
      this.setHovered(null);
      this.setSelected(null);
    },
    /** 每帧脉冲（由唯一动画循环驱动；未被驱动时保持静态不报错）。 */
    update(dt, elapsed) {
      stats.updates += 1;
      if (!state.selected) return;
      const phase = pulseSeconds > 0 ? Math.sin(((elapsed ?? 0) / pulseSeconds) * Math.PI * 2) : 0;
      selectBox.material.opacity = 0.7 + 0.3 * (0.5 + phase * 0.5);
    },
    describe() {
      return {
        hovered: state.hovered ? 'yes' : null,
        selected: state.selected ? 'yes' : null,
        ...stats,
      };
    },
    dispose() {
      parent.remove(group);
      for (const material of owns.materials) material.dispose();
      edges.dispose();
    },
  };
}

export default createHighlighter;
