import { EV } from '../shared/events.js';

const V3 = (THREE, a) => new THREE.Vector3(a[0], a[1], a[2]);

export function createCameraRig({ THREE, OrbitControls, config, state, bus, registry, dom }) {
  const persp = new THREE.PerspectiveCamera(45, 1, 0.5, 6000);
  persp.rotation.order = 'YXZ';
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  ortho.userData.frustumV = config.VIEWS.iso.orthoSize;
  const controlsPersp = new OrbitControls(persp, dom);
  const controlsOrtho = new OrbitControls(ortho, dom);
  for (const c of [controlsPersp, controlsOrtho]) {
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 30;
    c.maxDistance = 2600;
    c.minPolarAngle = Math.PI * 0.07;
    c.maxPolarAngle = Math.PI * 0.492;
    c.maxTargetRadius = 980;
    c.enabled = false;
  }
  controlsPersp.target.set(0, 20, -40);

  let mode = 'oblique';
  let activeCam = persp;
  const tween = { active: false, t: 0, dur: 1.2, cam: persp, fromP: new THREE.Vector3(), fromT: new THREE.Vector3(), toP: new THREE.Vector3(), toT: new THREE.Vector3(), fromFov: 45, toFov: 45, fromZoom: 1, toZoom: 1 };
  const fp = { pos: new THREE.Vector3(0, 0, -500), groundY: 0, heading: 0, pitch: 0, bob: 0 };
  const tour = { active: false, paused: false, index: 0, list: [], t: 0, dwell: 9 };
  const keys = new Set();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let touchId = null;
  let touchX = 0;
  let touchY = 0;

  function activeControls() {
    return activeCam === ortho ? controlsOrtho : controlsPersp;
  }

  function stopTour(reason) {
    if (!tour.active) return;
    tour.active = false;
    tour.paused = false;
    bus.emit(EV.TOUR, { active: false, reason });
  }

  function flyTo(cam, position, target, opts = {}) {
    const c = cam === ortho ? controlsOrtho : controlsPersp;
    c.enabled = false;
    activeCam = cam;
    if (opts.instant) {
      cam.position.set(position[0], position[1], position[2]);
      c.target.set(target[0], target[1], target[2]);
      if (cam.isPerspectiveCamera) cam.fov = opts.fov ?? cam.fov;
      cam.lookAt(c.target);
      cam.updateProjectionMatrix();
      tween.active = false;
      c.enabled = mode !== 'fp';
      c.update();
      return;
    }
    tween.active = true;
    tween.t = 0;
    tween.dur = (opts.duration ?? config.UI_TOKENS.cameraMs) / 1000;
    tween.cam = cam;
    tween.fromP.copy(cam.position);
    tween.fromT.copy(c.target);
    tween.toP.set(position[0], position[1], position[2]);
    tween.toT.set(target[0], target[1], target[2]);
    tween.fromFov = cam.fov || 45;
    tween.toFov = opts.fov ?? cam.fov ?? 45;
    tween.fromZoom = cam.zoom || 1;
    tween.toZoom = opts.zoom ?? 1;
    if (cam.isOrthographicCamera) {
      cam.position.copy(tween.toP);
      cam.userData.frustumV = opts.frustumV || cam.userData.frustumV;
    }
  }

  function settle() {
    const cam = tween.cam;
    const c = cam === ortho ? controlsOrtho : controlsPersp;
    c.target.copy(tween.toT);
    c.enabled = mode !== 'fp';
    c.update();
  }

  function setViewParams(p) {
    const fov = p.fov || 45;
    const instant = !!p.instant || !!instantViews;
    const pos = [p.position[0], p.position[1], p.position[2]];
    const tgt = [p.target[0], p.target[1], p.target[2]];
    if (p.ortho) {
      flyTo(ortho, pos, tgt, { fov, zoom: p.zoom || 1, frustumV: config.VIEWS.iso.orthoSize, instant });
    } else {
      flyTo(persp, pos, tgt, { fov, instant });
    }
  }

  function applyViewMode(next, params = {}) {
    if (params.instant || instantViews) tween.active = false;
    if (next === 'fp') {
      enterFP(params.spawnId);
      return;
    }
    state.set({ viewMode: next, mode: next === 'focus' || next === 'interior' ? next : next === 'orbit' ? 'orbit' : 'overview' });
    mode = next;
    stopTour('view-change');
    switch (next) {
      case 'oblique':
        setViewParams(config.VIEWS.oblique);
        break;
      case 'iso':
        setViewParams(config.VIEWS.iso);
        break;
      case 'axis':
        setViewParams(config.VIEWS.axis);
        break;
      case 'zone': {
        const id = params.id || state.viewId || 'zone.main-hall';
        state.set({ viewId: id });
        const vp = registry.viewpoints.get(id);
        const p = vp ? { position: vp.position, target: vp.target, fov: vp.fov } : config.ZONE_VIEWS[id];
        if (p) setViewParams(p);
        break;
      }
      case 'focus':
        focusBuilding(params.id || state.selectedBuildingId);
        break;
      case 'interior': {
        const vp = params.id ? registry.viewpoints.get(params.id) : registry.nearestViewpoint('interior', persp.position.x, persp.position.z);
        if (vp) {
          setViewParams({ position: vp.position, target: vp.target, fov: vp.fov || 55 });
          state.set({ viewId: vp.id });
        }
        break;
      }
      case 'fp':
        enterFP(params.spawnId);
        break;
      case 'orbit': {
        const o = config.VIEWS.orbit;
        const pos = [Math.sin(o.azimuth) * o.radius, Math.cos(o.polar) * o.radius + 60, Math.cos(o.azimuth) * o.radius];
        setViewParams({ position: pos, target: o.target, fov: 40 });
        break;
      }
      default:
        break;
    }
  }

  function focusBuilding(id) {
    const b = registry.buildings.get(id);
    if (!b) return;
    const min = b.bounds.min;
    const max = b.bounds.max;
    const cx = (min[0] + max[0]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const sizeX = max[0] - min[0];
    const sizeZ = max[2] - min[2];
    const span = Math.max(sizeX, sizeZ);
    const rot = ((b.rot || 0) * Math.PI) / 180;
    const front = [Math.sin(rot) * -1, -Math.cos(rot)];
    const side = [Math.cos(rot), -Math.sin(rot)];
    const dist = span * 1.55 + 24;
    const pos = [cx + front[0] * dist * 0.82 + side[0] * dist * 0.45, min[1] + span * 0.5 + 18, cz + front[1] * dist * 0.82 + side[1] * dist * 0.45];
    setViewParams({ position: pos, target: [cx, min[1] + (max[1] - min[1]) * 0.45, cz], fov: 42 });
    state.set({ selectedBuildingId: id, mode: 'focus' });
    bus.emit(EV.SELECT, { id, source: 'focus' });
  }

  function setFPState(patch) {
    Object.assign(fp, patch);
    state.set({ fp: { active: true, position: [fp.pos.x, fp.groundY, fp.pos.z], heading: fp.heading, pitch: fp.pitch, spawnId: state.fp.spawnId } });
  }

  function enterFP(spawnId) {
    tween.active = false;
    if (mode === 'fp') return;
    const spawn = spawnId ? registry.viewpoints.get(spawnId) : registry.nearestViewpoint('fp-spawn', persp.position.x, persp.position.z);
    const p = spawn ? spawn.position : [0, 0, -500];
    const t = spawn ? spawn.target : [0, 1.65, -420];
    fp.pos.set(p[0], 0, p[2]);
    fp.groundY = p[1] || 0;
    const dx = t[0] - p[0];
    const dz = t[2] - p[2];
    fp.heading = Math.atan2(-dx, -dz);
    fp.pitch = 0;
    fp.bob = 0;
    stopTour('fp');
    mode = 'fp';
    activeCam = persp;
    persp.fov = 68;
    persp.updateProjectionMatrix();
    controlsPersp.enabled = false;
    controlsOrtho.enabled = false;
    state.set({ viewMode: 'fp', mode: 'fp', fp: { active: true, position: [p[0], fp.groundY, p[2]], heading: fp.heading, pitch: 0, spawnId: spawn ? spawn.id : null } });
    bus.emit(EV.FP_ENTER, { spawnId: spawn ? spawn.id : null });
  }

  function exitFP() {
    if (mode !== 'fp') return;
    mode = 'oblique';
    if (document.pointerLockElement) document.exitPointerLock();
    persp.fov = config.VIEWS.oblique.fov;
    persp.updateProjectionMatrix();
    state.set({ fp: { active: false, position: null, heading: 0, pitch: 0, spawnId: null } });
    bus.emit(EV.FP_EXIT, {});
    applyViewMode(state.viewMode === 'fp' ? 'oblique' : state.viewMode);
  }

  function blockedStep(nx, nz) {
    const s = registry.surfaceAt(nx, nz, fp.groundY + config.FP.step + 0.01);
    if (s && s.y > fp.groundY + config.FP.step + 0.01) return true;
    return false;
  }

  function updateFP(dt) {
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = sprint ? config.FP.sprint : config.FP.speed;
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (f || s) {
      const sin = Math.sin(fp.heading);
      const cos = Math.cos(fp.heading);
      let vx = -sin * f + cos * s;
      let vz = -cos * f - sin * s;
      const len = Math.hypot(vx, vz) || 1;
      vx = (vx / len) * speed * dt;
      vz = (vz / len) * speed * dt;
      const nx = fp.pos.x + vx;
      const nz = fp.pos.z + vz;
      if (!blockedStep(nx, nz)) {
        const [rx, rz] = registry.resolveMove([fp.pos.x, fp.pos.z], [nx, nz], fp.groundY);
        fp.pos.x = rx;
        fp.pos.z = rz;
      } else {
        const [rx, rz] = registry.resolveMove([fp.pos.x, fp.pos.z], [fp.pos.x, nz], fp.groundY);
        if (Math.abs(rz - fp.pos.z) > 1e-6) fp.pos.z = rz;
        const [rx2, rz2] = registry.resolveMove([fp.pos.x, fp.pos.z], [nx, fp.pos.z], fp.groundY);
        if (Math.abs(rx2 - fp.pos.x) > 1e-6) fp.pos.x = rx2;
      }
      fp.bob += dt * speed * 1.05;
    }
    const s2 = registry.surfaceAt(fp.pos.x, fp.pos.z, fp.groundY + config.FP.step + 0.01);
    const targetY = s2 ? s2.y : 0;
    if (targetY > fp.groundY) fp.groundY = Math.min(targetY, fp.groundY + 6 * dt);
    else fp.groundY += (targetY - fp.groundY) * Math.min(1, dt * 7);
    const moving = f || s;
    const bob = moving ? Math.sin(fp.bob) * 0.045 : 0;
    persp.position.set(fp.pos.x, fp.groundY + config.FP.eye + bob, fp.pos.z);
    persp.rotation.set(fp.pitch, fp.heading, 0);
  }

  function updateTour(dt) {
    if (!tour.active || tour.paused) return;
    tour.t += dt;
    if (tour.t < tour.dwell) return;
    tour.t = 0;
    tour.index = (tour.index + 1) % tour.list.length;
    const vp = registry.viewpoints.get(tour.list[tour.index]);
    if (vp) {
      setViewParams({ position: vp.position, target: vp.target, fov: vp.fov });
      bus.emit(EV.TOUR_TICK, { index: tour.index, id: vp.id, name: vp.name });
    }
  }

  function startTour(list) {
    const ids = list && list.length ? list : ['zone.gate-south', 'zone.main-hall', 'zone.inner', 'zone.garden'];
    tour.list = ids;
    tour.index = 0;
    tour.t = 0;
    tour.active = true;
    tour.paused = false;
    bus.emit(EV.TOUR, { active: true, list: ids });
    const vp = registry.viewpoints.get(ids[0]);
    if (vp) setViewParams({ position: vp.position, target: vp.target, fov: vp.fov });
  }

  function setPaused(paused) {
    tour.paused = paused;
    bus.emit(EV.TOUR, { active: tour.active, paused });
  }

  function update(dt) {
    if (tween.active) {
      tween.t += dt;
      const k = Math.min(1, tween.t / tween.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const cam = tween.cam;
      cam.position.lerpVectors(tween.fromP, tween.toP, e);
      const tgt = new THREE.Vector3().lerpVectors(tween.fromT, tween.toT, e);
      cam.lookAt(tgt);
      if (cam.isPerspectiveCamera) {
        cam.fov = tween.fromFov + (tween.toFov - tween.fromFov) * e;
        cam.updateProjectionMatrix();
      } else {
        cam.zoom = tween.fromZoom + (tween.toZoom - tween.fromZoom) * e;
        cam.updateProjectionMatrix();
      }
      if (k >= 1) {
        tween.active = false;
        settle();
      }
    } else if (mode === 'fp') {
      updateFP(dt);
    } else {
      activeControls().update();
    }
    updateTour(dt);
  }

  function pointerLocked() {
    return document.pointerLockElement === dom;
  }

  dom.addEventListener('mousedown', (e) => {
    if (mode !== 'fp') return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.button === 0 && !pointerLocked() && dom.requestPointerLock) {
      try {
        const p = dom.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (err) { /* ignore */ }
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (mode !== 'fp') return;
    let mx = 0;
    let my = 0;
    if (pointerLocked()) {
      mx = e.movementX;
      my = e.movementY;
    } else if (dragging) {
      mx = e.clientX - lastX;
      my = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    } else return;
    fp.heading -= mx * 0.0026;
    fp.pitch = Math.max(-1.35, Math.min(1.35, fp.pitch - my * 0.0026));
  });
  dom.addEventListener('touchstart', (e) => {
    if (mode !== 'fp') return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    touchX = t.clientX;
    touchY = t.clientY;
  }, { passive: true });
  dom.addEventListener('touchmove', (e) => {
    if (mode !== 'fp' || touchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      fp.heading -= (t.clientX - touchX) * 0.005;
      fp.pitch = Math.max(-1.35, Math.min(1.35, fp.pitch - (t.clientY - touchY) * 0.005));
      touchX = t.clientX;
      touchY = t.clientY;
    }
  }, { passive: true });
  dom.addEventListener('touchend', () => { touchId = null; }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') {
      if (mode === 'fp') exitFP();
      else applyViewMode('fp');
      return;
    }
    const digit = { Digit1: 'oblique', Digit2: 'iso', Digit3: 'axis', Digit4: 'zone', Digit5: 'focus', Digit6: 'interior', Digit7: 'orbit' }[e.code];
    if (digit) {
      if (mode === 'fp') exitFP();
      applyViewMode(digit, { id: digit === 'focus' ? state.selectedBuildingId : state.viewId });
      return;
    }
    if (e.code === 'Escape' && mode === 'fp') return;
    if (mode === 'fp' && (e.code.indexOf('Arrow') === 0 || e.code === 'Space')) e.preventDefault();
    keys.add(e.code);
    if (mode !== 'fp' && (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD')) stopTour('manual');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  dom.addEventListener('wheel', () => { if (tour.active) setPaused(true); }, { passive: true });

  let instantViews = false;
  bus.on(EV.VIEW_MODE, (p = {}) => applyViewMode(p.mode || 'oblique', p));
  bus.on(EV.ZONE_FOCUS, (p = {}) => applyViewMode('zone', { id: p.id }));
  bus.on(EV.SELECT, (p = {}) => { if (p.source === 'ui') focusBuilding(p.id); });
  bus.on(EV.TOUR, (p = {}) => {
    if (p.action === 'start') startTour(p.list);
    else if (p.action === 'pause') setPaused(true);
    else if (p.action === 'resume') setPaused(false);
    else if (p.action === 'stop') stopTour('ui');
  });

  applyViewMode('oblique');

  return {
    persp, ortho, controlsPersp, controlsOrtho, applyViewMode, focusBuilding, enterFP, exitFP,
    setInstant:(v) => { instantViews = !!v; },
    startTour, stopTour, setPaused, update,
    activeCamera: () => (activeCam === ortho ? ortho : persp),
    getState: () => ({ viewMode: mode, fpActive: mode === 'fp', tourActive: tour.active, position: persp.position.toArray(), target: controlsPersp.target.toArray() })
  };
}
