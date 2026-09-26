// src/interaction/index.js · G（交互与 UI）
// 建筑悬停/选中拾取、高亮辅助物、点击空白取消、键盘只读转发。
// 第一人称 / 导览 / 分区跳转统一走事件（EV.VIEW_MODE / EV.TOUR / EV.ZONE_FOCUS），
// 相机永远由 core/camera.js 的唯一装置驱动，本模块不直接改相机变换、不建第二套相机。
import * as THREE from 'three';
import { EV } from '../shared/events.js';

export function mount({ config, layout, state, bus, registry, rig, env, zones, renderer }) {
  const dom = (renderer && renderer.domElement) ? renderer.domElement : null;
  if (!dom) return { dispose() {} };

  // 场景 = 区域根节点的父节点（main.js 把各区域 root 挂到 scene）。
  let scene = null;
  for (const id of Object.keys(zones || {})) {
    const root = zones[id] && zones[id].root;
    if (root && root.parent) { scene = root.parent; break; }
  }

  // ---------------------------------------------------------------------------
  // 高亮辅助物（暗金悬停线框 / 朱红选中线框 + 半透明体块）
  // ---------------------------------------------------------------------------
  const HOVER_COLOR = 0xdfa112; // 琉璃金
  const SELECT_COLOR = 0x962822; // 宫红
  const pickables = [];
  const cleanups = [];

  function makeEdges(color) {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
    const o = new THREE.LineSegments(geo, mat);
    o.visible = false;
    o.renderOrder = 999;
    o.frustumCulled = false;
    return o;
  }
  const hoverEdges = makeEdges(HOVER_COLOR);
  const selectEdges = makeEdges(SELECT_COLOR);
  const selectFill = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: SELECT_COLOR, transparent: true, opacity: 0.12, depthWrite: false })
  );
  selectFill.visible = false;
  selectFill.renderOrder = 998;
  selectFill.frustumCulled = false;
  if (scene) { scene.add(hoverEdges); scene.add(selectEdges); scene.add(selectFill); }

  function place(obj, bounds) {
    const mn = bounds.min;
    const mx = bounds.max;
    obj.position.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
    obj.scale.set(
      Math.max(0.02, mx[0] - mn[0]),
      Math.max(0.02, mx[1] - mn[1]),
      Math.max(0.02, mx[2] - mn[2])
    );
    obj.visible = true;
  }

  // ---------------------------------------------------------------------------
  // 拾取：THREE.Raycaster 取射线，对 registry.buildings 的 AABB（来自 zones[*].root 登记的 bounds）
  // 做包围盒命中判定，取最近命中。比逐网格 raycast 更稳（区域网格已按材质合并）。
  // ---------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitVec = new THREE.Vector3();
  let boxes = [];
  let boxesCount = -1;

  function refreshBoxes() {
    const n = registry.buildings ? registry.buildings.size : 0;
    if (n === boxesCount) return;
    boxesCount = n;
    boxes = [];
    if (!registry.buildings) return;
    for (const [id, b] of registry.buildings) {
      if (!b || !b.bounds || !b.bounds.min || !b.bounds.max) continue;
      const mn = b.bounds.min;
      const mx = b.bounds.max;
      if (![mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]].every(Number.isFinite)) continue;
      boxes.push({
        id,
        box: new THREE.Box3(
          new THREE.Vector3(mn[0], mn[1], mn[2]),
          new THREE.Vector3(mx[0], mx[1], mx[2])
        )
      });
    }
  }

  function pick(clientX, clientY) {
    const rect = dom.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const cam = (rig && rig.activeCamera) ? rig.activeCamera() : (rig && rig.persp);
    if (!cam) return null;
    raycaster.setFromCamera(ndc, cam);
    refreshBoxes();
    let bestId = null;
    let bestD = Infinity;
    for (const e of boxes) {
      const hit = raycaster.ray.intersectBox(e.box, hitVec);
      if (!hit) continue;
      const d = hit.distanceToSquared(raycaster.ray.origin);
      if (d < bestD) { bestD = d; bestId = e.id; }
    }
    return bestId;
  }

  // ---------------------------------------------------------------------------
  // 悬停 / 选中状态
  // ---------------------------------------------------------------------------
  let hoverId = null;

  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id || null;
    state.hoveredBuildingId = hoverId;
    const b = hoverId ? registry.buildings.get(hoverId) : null;
    if (b && b.bounds && hoverId !== state.selectedBuildingId) {
      place(hoverEdges, b.bounds);
    } else {
      hoverEdges.visible = false;
    }
    bus.emit(EV.HOVER, { id: hoverId });
  }

  function updateSelectHelper() {
    const id = state.selectedBuildingId;
    const b = id ? registry.buildings.get(id) : null;
    if (b && b.bounds) {
      place(selectEdges, b.bounds);
      place(selectFill, b.bounds);
    } else {
      selectEdges.visible = false;
      selectFill.visible = false;
    }
  }

  // 点击选中：相机近景由唯一装置执行（source:'ui' 会被 rig 消费），同时广播给 UI。
  function selectAt(id) {
    if (id) {
      rig.focusBuilding(id);
      bus.emit(EV.SELECT, { id, source: 'ui' });
    } else {
      bus.emit(EV.SELECT, { id: null, source: 'ui' });
    }
  }

  // ---------------------------------------------------------------------------
  // 指针监听：全部挂在 renderer 画布上，避免 UI 面板点击误触场景拾取。
  // 与 OrbitControls 分工：拖拽（位移 > 阈值）交给 controls，不触发选中。
  // ---------------------------------------------------------------------------
  let pressed = false;
  let downX = 0;
  let downY = 0;
  const DRAG_THRESHOLD = 5;

  function onPointerMove(e) {
    if (pressed) return; // 拖拽中不更新悬停，避免与 OrbitControls 抢帧
    setHover(pick(e.clientX, e.clientY));
  }
  function onPointerDown(e) {
    if (e.button !== 0) { pressed = false; return; }
    pressed = true;
    downX = e.clientX;
    downY = e.clientY;
  }
  function onPointerUp(e) {
    if (e.button !== 0 || !pressed) { pressed = false; return; }
    pressed = false;
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > DRAG_THRESHOLD) return; // 判定为轨道拖拽，不选中
    selectAt(pick(e.clientX, e.clientY)); // 命中建筑=选中；空白=取消选中
  }
  function onPointerCancel() { pressed = false; }
  function onPointerLeave() { pressed = false; setHover(null); }

  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerCancel);
  dom.addEventListener('pointerleave', onPointerLeave);
  cleanups.push(() => {
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('pointercancel', onPointerCancel);
    dom.removeEventListener('pointerleave', onPointerLeave);
  });

  // ---------------------------------------------------------------------------
  // 键盘：只做只读监听 + 事件转发，不重复定义相机行为（1–8 / F / Esc / WASD 由 camera.js 负责）。
  // Esc 在非第一人称时取消选中（UI 语义，不驱动相机）。
  // ---------------------------------------------------------------------------
  function onKeyDown(e) {
    if (e.code === 'Escape' && !state.fp.active) {
      bus.emit(EV.SELECT, { id: null, source: 'ui' });
    }
  }
  window.addEventListener('keydown', onKeyDown);
  cleanups.push(() => window.removeEventListener('keydown', onKeyDown));

  // ---------------------------------------------------------------------------
  // 事件同步：选中变化刷新高亮；离开近景模式清理高亮；悬停事件也跟随。
  // ---------------------------------------------------------------------------
  if (typeof bus.on === 'function') {
    cleanups.push(bus.on(EV.SELECT, () => { updateSelectHelper(); setHover(hoverId); }));
    cleanups.push(bus.on(EV.VIEW_MODE, (p = {}) => {
      // 模式退出（非 focus）时清理选中包围盒
      if (p.mode !== 'focus') {
        selectEdges.visible = false;
        selectFill.visible = false;
      } else {
        updateSelectHelper();
      }
      if (p.mode === 'fp') hoverEdges.visible = false;
    }));
  }

  updateSelectHelper();

  return {
    // 供 UI / 其他消费者复用拾取（可选）
    pick,
    getHovered: () => hoverId,
    dispose() {
      for (const fn of cleanups) { try { fn(); } catch (err) { /* ignore */ } }
      cleanups.length = 0;
      if (scene) {
        scene.remove(hoverEdges);
        scene.remove(selectEdges);
        scene.remove(selectFill);
      }
      hoverEdges.geometry.dispose();
      hoverEdges.material.dispose();
      selectEdges.geometry.dispose();
      selectEdges.material.dispose();
      selectFill.geometry.dispose();
      selectFill.material.dispose();
    }
  };
}
