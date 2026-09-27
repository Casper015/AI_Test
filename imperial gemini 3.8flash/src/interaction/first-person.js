import * as THREE from 'three';

export class FirstPersonController {
  constructor(camera, domElement, config, colliders, buildings) {
    this.camera = camera;
    this.domElement = domElement;
    this.config = config;
    this.colliders = colliders || [];
    this.buildings = buildings || [];

    this.active = false;
    this.isLocked = false;

    this.position = new THREE.Vector3(0, 1.72, -370);
    this.yaw = 0; // horizontal angle
    this.pitch = 0; // vertical angle

    this.keys = { forward: false, backward: false, left: false, right: false, sprint: false };

    this.listeners = [];
    this.onStateChange = null;

    this.bindEvents();
  }

  addListener(fn) {
    if (typeof fn === 'function') this.listeners.push(fn);
  }

  emitStateChange(state) {
    if (this.onStateChange) this.onStateChange(state);
    for (const fn of this.listeners) fn(state);
  }

  bindEvents() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        this.toggle();
        return;
      }
      if (!this.active) return;

      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.forward = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.sprint = true;
    });

    window.addEventListener('keyup', (e) => {
      if (!this.active) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.forward = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.sprint = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (!this.isLocked && this.active) {
        // Pointer unlocked by Esc
        this.emitStateChange({ active: true, locked: false });
      }
    });

    this.domElement.addEventListener('click', () => {
      if (this.active && !this.isLocked) {
        this.domElement.requestPointerLock?.();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.active || !this.isLocked) return;
      const sens = 0.0022;
      this.yaw += e.movementX * sens;
      this.pitch -= e.movementY * sens;
      // Clamp pitch to avoid gimbal flip
      this.pitch = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, this.pitch));
    });
  }

  start(spawnPos = null) {
    this.active = true;
    if (spawnPos) {
      this.position.copy(spawnPos);
    } else {
      // Default spawn: outside Taihe Gate on central avenue facing north (+Z)
      this.position.set(0, 1.72, -310);
      this.yaw = 0;
      this.pitch = 0;
    }
    this.domElement.requestPointerLock?.();
    this.emitStateChange({ active: true, locked: true });
  }

  stop() {
    this.active = false;
    if (typeof document !== 'undefined' && document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    }
    this.keys = { forward: false, backward: false, left: false, right: false, sprint: false };
    this.emitStateChange({ active: false, locked: false });
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
  }

  getTargetLook() {
    return new THREE.Vector3(
      this.position.x + Math.sin(this.yaw) * 40,
      this.position.y,
      this.position.z + Math.cos(this.yaw) * 40
    );
  }

  // Get terrain height at (x, z) - follows terrace ramps, steps, and interior floors smoothly
  getGroundHeight(x, z) {
    let baseY = 0;

    // 1. Taihe Hall (on 4.5m terrace, floor at 5.7m, throne dais at 6.57m)
    if (Math.abs(x) <= 32.5 && z >= -83.5 && z <= -46.5) {
      if (Math.abs(x) <= 7 && z >= -65 && z <= -52) {
        return 6.57; // Nine-Dragon throne dais
      }
      return 5.7; // Golden brick floor
    } else if (Math.abs(x) <= 16 && z >= -88 && z <= -83.5) {
      // Steps from 4.5m terrace to 5.7m Taihe Hall floor
      const t = (z - -88) / 4.5;
      return 4.5 + t * 1.2;
    }

    // 2. Kunning Palace bedchamber interior (floor at 2.31m)
    if (Math.abs(x) <= 24 && z >= 235 && z <= 261) {
      return 2.31;
    } else if (Math.abs(x) <= 12 && z >= 230 && z <= 235) {
      const t = (z - 230) / 5;
      return t * 2.31;
    }

    // 3. Qianqing Palace interior (floor at 2.8m)
    if (Math.abs(x) <= 27 && z >= 153 && z <= 183) {
      return 2.8;
    } else if (Math.abs(x) <= 12 && z >= 147 && z <= 153) {
      const t = (z - 147) / 6;
      return t * 2.8;
    }

    // 4. Three-Tier Terrace (太和殿须弥座三台: x in [-60, 60], z in [-105, 75])
    if (Math.abs(x) <= 60 && z >= -105 && z <= 75) {
      baseY = 4.5;
    } else if (Math.abs(x) <= 12 && z >= -135 && z <= -105) {
      // Front dragon ramp / stairs up to terrace
      const t = (z - -135) / 30;
      baseY = t * 4.5;
    } else if (Math.abs(x) <= 12 && z >= 75 && z <= 95) {
      // Rear ramp down from terrace
      const t = 1 - (z - 75) / 20;
      baseY = Math.max(0, t * 4.5);
    }

    // 5. Jinshui bridges
    if (z >= -342 && z <= -318 && (Math.abs(x) <= 42 || Math.abs(x - 18) <= 4 || Math.abs(x + 18) <= 4 || Math.abs(x - 36) <= 4 || Math.abs(x + 36) <= 4)) {
      baseY = Math.max(baseY, 1.8);
    }

    // 6. Dui Xiu Shan in garden (climbs up to Yujing Pavilion summit)
    const distMountain = Math.hypot(x, z - 395);
    if (distMountain < 18) {
      baseY = Math.max(baseY, Math.max(0, (18 - distMountain) * 0.75));
    }

    return baseY;
  }

  checkCollision(nx, nz) {
    const r = this.config.firstPerson.collisionRadius;

    // City bounds
    if (Math.abs(nx) > 288 || Math.abs(nz) > 438) return true;

    // Collide with solid walls
    for (const c of this.colliders) {
      if (c.type === 'wall') {
        const x1 = c.start[0];
        const z1 = c.start[1];
        const x2 = c.end[0];
        const z2 = c.end[1];
        const th = (c.thickness || 2.0) / 2 + r;

        // Line segment distance
        const dx = x2 - x1;
        const dz = z2 - z1;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 0.001) continue;

        let u = ((nx - x1) * dx + (nz - z1) * dz) / lenSq;
        u = Math.max(0, Math.min(1, u));
        const px = x1 + u * dx;
        const pz = z1 + u * dz;

        const dist = Math.hypot(nx - px, nz - pz);
        if (dist < th) return true;
      }
    }

    // Check buildings collision
    for (const b of this.buildings) {
      if (!b.bounds) continue;
      const { minX, maxX, minZ, maxZ } = b.bounds;
      const inBounds = nx >= minX - r && nx <= maxX + r && nz >= minZ - r && nz <= maxZ + r;
      if (!inBounds) continue;

      // 1. Passable gates (can walk through the central arch tunnel)
      if (b.kind === 'gate' || b.access === '可通行') {
        const tunnelW = Math.min(8.2, (b.size?.[0] || 20) * 0.38);
        if (Math.abs(nx - b.x) > (tunnelW / 2) - 0.4) {
          return true; // hit gate side wall
        }
        continue; // through central arch tunnel
      }

      // 2. Visitable buildings (can enter through front entrance opening)
      if (b.visitable) {
        const entranceW = Math.min((b.size?.[0] || 28) * 0.42, 9.5);
        // Front wall entrance check
        if (nz >= minZ - r && nz <= minZ + 0.6) {
          if (Math.abs(nx - b.x) > entranceW / 2 - 0.4) {
            return true;
          }
          continue;
        }
        // Back wall
        if (nz >= maxZ - (r + 0.5)) return true;
        // Left wall
        if (nx <= minX + (r + 0.5)) return true;
        // Right wall
        if (nx >= maxX - (r + 0.5)) return true;
        continue;
      }

      // 3. Solid non-visitable buildings
      return true;
    }

    return false;
  }

  update(dt) {
    if (!this.active) return;

    const speed = this.config.firstPerson.moveSpeed * (this.keys.sprint ? this.config.firstPerson.sprintMultiplier : 1.0);
    const moveX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    const moveZ = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0);

    if (moveX !== 0 || moveZ !== 0) {
      // Forward vector (+Z is North, +X is East):
      // When yaw = 0: forward is +Z (North), strafe right is +X (East)
      const dirX = Math.sin(this.yaw) * moveZ + Math.cos(this.yaw) * moveX;
      const dirZ = Math.cos(this.yaw) * moveZ - Math.sin(this.yaw) * moveX;
      const len = Math.hypot(dirX, dirZ);

      if (len > 0.001) {
        const stepX = (dirX / len) * speed * dt;
        const stepZ = (dirZ / len) * speed * dt;

        // Try movement with sliding
        if (!this.checkCollision(this.position.x + stepX, this.position.z)) {
          this.position.x += stepX;
        }
        if (!this.checkCollision(this.position.x, this.position.z + stepZ)) {
          this.position.z += stepZ;
        }
      }
    }

    // Height following
    const targetY = this.getGroundHeight(this.position.x, this.position.z) + this.config.firstPerson.eyeHeight;
    this.position.y += (targetY - this.position.y) * Math.min(1.0, dt * 10);

    // Apply to camera
    this.camera.position.copy(this.position);

    // Look vector from yaw & pitch (yaw = 0 looks North along +Z)
    const lookX = this.position.x + Math.sin(this.yaw) * Math.cos(this.pitch);
    const lookY = this.position.y + Math.sin(this.pitch);
    const lookZ = this.position.z + Math.cos(this.yaw) * Math.cos(this.pitch);

    this.camera.lookAt(lookX, lookY, lookZ);
  }
}
