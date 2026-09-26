/**
 * 紫禁天朝 · 选中与高亮（G 交互）
 * 建筑统一注册表驱动：悬停/点选同一份数据，实例化网格通过 instanceId 反查建筑 ID。
 */

import * as THREE from 'three';

export function createSelection(opts) {
  const { scene, camera3d, layout, events } = opts;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables = [];
  const byInstance = new Map();

  const selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0xffc83b));
  selBox.name = 'selection-box';
  selBox.visible = false;
  selBox.material.depthTest = false;
  selBox.material.transparent = true;
  selBox.material.opacity = 0.95;
  scene.add(selBox);
  const hovBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x8fe8ff));
  hovBox.name = 'hover-box';
  hovBox.visible = false;
  hovBox.material.depthTest = false;
  hovBox.material.transparent = true;
  hovBox.material.opacity = 0.8;
  scene.add(hovBox);

  function register(mesh) {
    if (!mesh.userData || !mesh.userData.instances) return;
    pickables.push(mesh);
    byInstance.set(mesh.uuid, mesh.userData.instances);
  }

  function pick(clientX, clientY) {
    const rect = opts.canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera3d);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const ids = hit.object.userData.instances;
    const id = ids && ids[hit.instanceId];
    if (!id) return null;
    return layout.buildings.find(b => b.id === id) || null;
  }

  function boxFor(b, pad) {
    const p = pad === undefined ? 1.5 : pad;
    return new THREE.Box3(
      new THREE.Vector3(b.bounds.x0 - p, b.base - 0.4, b.bounds.z0 - p),
      new THREE.Vector3(b.bounds.x1 + p, b.base + b.h + p, b.bounds.z1 + p)
    );
  }

  function setSelected(b) {
    if (!b) { selBox.visible = false; return; }
    selBox.box.copy(boxFor(b, 1.6));
    selBox.visible = true;
  }
  function setHover(b) {
    if (!b) { hovBox.visible = false; return; }
    hovBox.box.copy(boxFor(b, 1.2));
    hovBox.visible = true;
  }

  return { register, pick, setSelected, setHover, selBox, hovBox, pickables };
}

export default createSelection;
