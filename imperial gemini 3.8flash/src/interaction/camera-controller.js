import * as THREE from 'three';

export class CameraController {
  constructor(camera, controls, views) {
    this.camera = camera;
    this.controls = controls;
    this.views = views;
    this.transitioning = false;
    this.startPos = new THREE.Vector3();
    this.endPos = new THREE.Vector3();
    this.startTarget = new THREE.Vector3();
    this.endTarget = new THREE.Vector3();
    this.progress = 0;
    this.duration = 1.2;
    this.onComplete = null;
  }

  jumpTo(viewKey) {
    const view = typeof viewKey === 'string' ? this.views[viewKey] : viewKey;
    if (!view) return;
    this.transitioning = false;
    this.camera.position.fromArray(view.position);
    this.controls.target.fromArray(view.target);
    this.controls.update();
  }

  flyTo(viewKey, duration = 1.2, onComplete = null) {
    const view = typeof viewKey === 'string' ? this.views[viewKey] : viewKey;
    if (!view) return;

    this.startPos.copy(this.camera.position);
    this.endPos.fromArray(view.position);

    this.startTarget.copy(this.controls.target);
    this.endTarget.fromArray(view.target);

    this.duration = duration;
    this.progress = 0;
    this.transitioning = true;
    this.onComplete = onComplete;
  }

  focusBuilding(building) {
    if (!building) return;
    const bx = building.x;
    const bz = building.z;
    const by = building.height ? building.height * 0.5 : 8;

    const dist = Math.max(45, (building.size?.[0] || 25) * 1.6);
    const targetPos = [bx + dist * 0.7, by + dist * 0.5, bz - dist * 0.7];
    const targetLook = [bx, by, bz];

    this.flyTo({ position: targetPos, target: targetLook }, 1.4);
  }

  update(dt) {
    if (!this.transitioning) {
      this.controls.update();
      return;
    }

    this.progress += dt / this.duration;
    if (this.progress >= 1.0) {
      this.progress = 1.0;
      this.transitioning = false;
      this.camera.position.copy(this.endPos);
      this.controls.target.copy(this.endTarget);
      this.controls.update();
      if (this.onComplete) {
        const cb = this.onComplete;
        this.onComplete = null;
        cb();
      }
      return;
    }

    // Smooth cubic ease-in-out
    const t = this.progress;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.camera.position.lerpVectors(this.startPos, this.endPos, ease);
    this.controls.target.lerpVectors(this.startTarget, this.endTarget, ease);
    this.controls.update();
  }
}
