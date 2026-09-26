/**
 * 紫禁天朝 · 唯一相机装置（主 Agent）
 * 八种视角在同一装置内切换：oblique / iso / axis / zone / focus / interior / fp / orbit
 * 统一 1.2s 过渡；第一人称由 interaction/collision.js 的行走控制器驱动。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UI, WORLD } from '../shared/config.js';

const EASE = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig(opts) {
  const { canvas, layout, events } = opts;
  const perspective = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 4000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 4000);
  const controls = new OrbitControls(perspective, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.7;
  controls.screenSpacePanning = false;

  const rig = {
    mode: 'oblique',
    activeCamera: perspective,
    tween: null,
    fp: null,
    focusId: null,
    interiorArea: null,
    axisBase: 0,
    zoneId: 'B',
    enabled: true
  };

  function viewById(id) {
    return layout.globalViews.find(v => v.id === id) || layout.globalViews[0];
  }
  function zoneView(zoneId) {
    const v = layout.viewpoints.find(p => p.zone === zoneId && p.mode === 'zone');
    return v;
  }
  function interiorView(zoneId) {
    return layout.viewpoints.find(p => p.zone === zoneId && p.mode === 'interior');
  }
  function fpSpawn(zoneId) {
    return layout.viewpoints.find(p => p.zone === zoneId && p.mode === 'fp-spawn');
  }

  function setOrthoSize(size) {
    const aspect = window.innerWidth / window.innerHeight;
    ortho.left = -size * aspect / 2;
    ortho.right = size * aspect / 2;
    ortho.top = size / 2;
    ortho.bottom = -size / 2;
    ortho.updateProjectionMatrix();
  }

  function useCamera(cam) {
    rig.activeCamera = cam;
    events.emit('camera', cam);
  }

  function applyPose(cam, pos, target, fov) {
    cam.position.set(pos.x, pos.y, pos.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(target.x, target.y, target.z);
    if (cam.isPerspectiveCamera && fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  function flyTo(view, mode) {
    const cam = mode === 'iso' ? ortho : perspective;
    const from = cam.position.clone();
    const fromTarget = rig.tween ? rig.tween.toTarget.clone() : controls.target.clone();
    if (mode === 'iso') setOrthoSize(view.ortho || 660);
    rig.tween = {
      t: 0,
      dur: UI.transitionMs / 1000,
      from, fromTarget,
      to: new THREE.Vector3(view.position.x, view.position.y, view.position.z),
      toTarget: new THREE.Vector3(view.target.x, view.target.y, view.target.z),
      cam, mode, fov: view.fov || 46
    };
    controls.enabled = false;
    rig.enabled = false;
    useCamera(cam);
  }

  function limitsFor(mode, view) {
    controls.minDistance = 30;
    controls.maxDistance = 2600;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = 1.45;
    controls.enablePan = true;
    if (mode === 'oblique' || mode === 'iso') {
      controls.maxPolarAngle = 1.2;
      controls.minDistance = 420;
      controls.maxDistance = mode === 'iso' ? 3000 : 2600;
    } else if (mode === 'axis') {
      controls.minPolarAngle = 1.05;
      controls.maxPolarAngle = 1.42;
      controls.minDistance = 40;
      controls.maxDistance = 900;
    } else if (mode === 'focus') {
      controls.minDistance = 40;
      controls.maxDistance = 320;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = 1.35;
    } else if (mode === 'interior') {
      controls.minDistance = 1;
      controls.maxDistance = 26;
      controls.minPolarAngle = 0.6;
      controls.maxPolarAngle = 1.9;
      controls.enablePan = false;
    } else if (mode === 'orbit') {
      controls.minDistance = 60;
      controls.maxDistance = 1800;
      controls.maxPolarAngle = 1.45;
    }
    controls.target.copy(rig.tween ? rig.tween.toTarget : controls.target);
  }

  function setMode(mode, arg) {
    if (mode === 'fp') return rig;
    rig.mode = mode;
    rig.tween = null;
    if (mode === 'oblique') flyTo(viewById('v-global'), 'oblique');
    else if (mode === 'iso') flyTo(viewById('v-iso'), 'iso');
    else if (mode === 'axis') {
      flyTo(viewById('v-axis'), 'axis');
      rig.axisBase = Math.atan2(perspective.position.x, perspective.position.z);
    } else if (mode === 'zone') {
      const zid = arg || rig.zoneId;
      rig.zoneId = zid;
      const v = zoneView(zid) || viewById('v-global');
      flyTo(v, 'zone');
    } else if (mode === 'focus') {
      if (arg) rig.focusId = arg;
      focusBuilding(rig.focusId);
      return rig;
    } else if (mode === 'interior') {
      const zid = arg || (rig.focusId && layout.buildings.find(b => b.id === rig.focusId) ? layout.buildings.find(b => b.id === rig.focusId).zone : rig.zoneId);
      const v = interiorView(zid) || layout.viewpoints.find(p => p.mode === 'interior');
      rig.interiorArea = v.area || null;
      flyTo(v, 'interior');
    } else if (mode === 'orbit') {
      flyTo(viewById('v-orbit'), 'orbit');
    }
    if (mode !== 'interior') rig.interiorArea = null;
    return rig;
  }

  function focusBuilding(id) {
    const b = layout.buildings.find(x => x.id === id);
    if (!b) return rig;
    rig.focusId = id;
    rig.mode = 'focus';
    rig.tween = null;
    const dist = Math.max(60, Math.max(b.w, b.d) * 1.9 + b.h * 0.9);
    const yaw = Math.atan2(b.x, b.z + dist);
    const pos = {
      x: b.x + Math.sin(yaw + 0.5) * 0.35 * dist * 0.5 + dist * 0.24,
      y: b.base + b.h * 0.55 + dist * 0.34,
      z: b.z + dist * 0.8
    };
    const view = {
      position: pos,
      target: { x: b.x, y: b.base + b.h * 0.45, z: b.z },
      fov: Math.max(32, 52 - b.w * 0.1)
    };
    flyTo(view, 'focus');
    return rig;
  }

  function setFp(player) {
    rig.fp = player;
    rig.mode = 'fp';
    rig.tween = null;
    controls.enabled = false;
    useCamera(perspective);
  }

  function exitFp(prevMode) {
    rig.fp = null;
    rig.mode = prevMode || 'oblique';
    setMode(rig.mode);
  }

  function nearestSpawn(from) {
    const list = layout.viewpoints.filter(v => v.mode === 'fp-spawn');
    let best = list[0], bd = Infinity;
    for (const v of list) {
      const d = Math.hypot(v.position.x - from.x, v.position.z - from.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  function update(dt) {
    if (rig.tween) {
      rig.tween.t += dt;
      const k = EASE(Math.min(1, rig.tween.t / rig.tween.dur));
      const cam = rig.tween.cam;
      cam.position.lerpVectors(rig.tween.from, rig.tween.to, k);
      const tgt = new THREE.Vector3().lerpVectors(rig.tween.fromTarget, rig.tween.toTarget, k);
      cam.lookAt(tgt);
      if (cam.isPerspectiveCamera) {
        cam.fov = THREE.MathUtils.lerp(cam.fov, rig.tween.fov, 0.15);
        cam.updateProjectionMatrix();
      }
      controls.target.copy(tgt);
      if (k >= 1) {
        rig.tween = null;
        rig.enabled = true;
        controls.enabled = true;
        limitsFor(rig.mode);
        const v = { position: cam.position, target: controls.target };
        limitsFor(rig.mode, v);
      }
    } else if (controls.enabled) {
      controls.update();
      if (rig.mode === 'axis') {
        const off = new THREE.Vector3().subVectors(perspective.position, controls.target);
        const yaw = Math.atan2(off.x, off.z);
        let d = yaw - rig.axisBase;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const clamped = rig.axisBase + THREE.MathUtils.clamp(d, -0.42, 0.42);
        const len = off.length();
        const pol = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(off.y / len, -1, 1)), 1.05, 1.42);
        off.set(Math.sin(pol) * Math.sin(clamped), Math.cos(pol), Math.sin(pol) * Math.cos(clamped)).multiplyScalar(len);
        perspective.position.copy(controls.target).add(off);
        perspective.lookAt(controls.target);
      }
      if (rig.mode === 'interior' && rig.interiorArea) {
        const a = rig.interiorArea;
        perspective.position.x = THREE.MathUtils.clamp(perspective.position.x, a.x0 + 1.5, a.x1 - 1.5);
        perspective.position.z = THREE.MathUtils.clamp(perspective.position.z, a.z0 + 1.5, a.z1 - 1.5);
        perspective.position.y = THREE.MathUtils.clamp(perspective.position.y, a.y0 + 1.2, a.y1 - 0.6);
        controls.target.x = THREE.MathUtils.clamp(controls.target.x, a.x0, a.x1);
        controls.target.z = THREE.MathUtils.clamp(controls.target.z, a.z0, a.z1);
        controls.target.y = THREE.MathUtils.clamp(controls.target.y, a.y0, a.y1);
      }
      if (rig.mode === 'focus' || rig.mode === 'zone') {
        const lim = rig.mode === 'zone' ? 420 : 220;
        const b = layout.zones.find(z => z.id === rig.zoneId) || { bounds: WORLD.enclosure };
        controls.target.x = THREE.MathUtils.clamp(controls.target.x, b.bounds.x0 - lim, b.bounds.x1 + lim);
        controls.target.z = THREE.MathUtils.clamp(controls.target.z, b.bounds.z0 - lim, b.bounds.z1 + lim);
      }
      controls.maxPolarAngle = Math.max(controls.maxPolarAngle, 0.2);
      controls.update();
    }
    return rig.activeCamera;
  }

  function onResize() {
    perspective.aspect = window.innerWidth / window.innerHeight;
    perspective.updateProjectionMatrix();
    setOrthoSize(viewById('v-iso').ortho || 660);
  }
  window.addEventListener('resize', onResize);
  onResize();

  return {
    rig, perspective, ortho, controls,
    get activeCamera() { return rig.activeCamera; },
    get mode() { return rig.mode; },
    setMode, focusBuilding, setFp, exitFp, nearestSpawn, update, viewById, zoneView, interiorView, fpSpawn
  };
}

export default createCameraRig;
