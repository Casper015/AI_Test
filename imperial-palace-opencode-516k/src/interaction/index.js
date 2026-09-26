import { EV } from '../shared/events.js';

export function mount(ctx) {
  const { THREE, config, registry, bus, rig, renderer } = ctx;
  const dom = renderer.domElement;
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const box = new THREE.Box3();
  const boxCache = new Map();

  function boundsOf(id) {
    if (!boxCache.has(id)) {
      const b = registry.buildings.get(id);
      if (!b) return null;
      boxCache.set(id, new THREE.Box3(
        new THREE.Vector3(b.bounds.min[0], b.bounds.min[1], b.bounds.min[2]),
        new THREE.Vector3(b.bounds.max[0], b.bounds.max[1], b.bounds.max[2])
      ));
    }
    return boxCache.get(id);
  }

  function pick(clientX, clientY) {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, rig.activeCamera());
    let bestId = null;
    let bestDist = Infinity;
    for (const id of registry.buildings.keys()) {
      const bb = boundsOf(id);
      if (!bb) continue;
      const hit = ray.ray.intersectBox(bb, new THREE.Vector3());
      if (!hit) continue;
      const d = hit.distanceTo(ray.ray.origin);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: config.PALETTE.goldTrim, transparent: true, opacity: 0.95 })
  );
  outline.visible = false;
  outline.renderOrder = 5;
  outline.frustumCulled = false;
  const scene = ctx.scene || null;
  if (scene) scene.add(outline);

  function showOutline(id) {
    const bb = id ? boundsOf(id) : null;
    if (!bb) {
      outline.visible = false;
      return;
    }
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bb.getSize(size);
    bb.getCenter(center);
    outline.scale.set(size.x + 1.5, size.y + 1.5, size.z + 1.5);
    outline.position.copy(center);
    outline.visible = true;
  }

  let hoverId = null;
  dom.addEventListener('pointermove', (e) => {
    const id = pick(e.clientX, e.clientY);
    if (id !== hoverId) {
      hoverId = id;
      bus.emit(EV.HOVER, { id });
      if (id) showOutline(id);
      else showOutline(null);
    }
  });
  dom.addEventListener('pointerleave', () => {
    hoverId = null;
    bus.emit(EV.HOVER, { id: null });
    showOutline(null);
  });
  dom.addEventListener('click', (e) => {
    const id = pick(e.clientX, e.clientY);
    bus.emit(EV.SELECT, { id, source: 'ui' });
    showOutline(id);
  });
  dom.addEventListener('dblclick', (e) => {
    const id = pick(e.clientX, e.clientY);
    if (id) rig.focusBuilding(id);
  });
  dom.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const id = pick(t.clientX, t.clientY);
    if (id) {
      bus.emit(EV.SELECT, { id, source: 'ui' });
      showOutline(id);
    }
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backspace' || e.code === 'Delete') {
      bus.emit(EV.SELECT, { id: null, source: 'ui' });
      showOutline(null);
    }
  });
}
