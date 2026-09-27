import { REGIONS, BOUNDS } from '../shared/layout.js';

export class MiniMap {
  constructor(canvas, cameraController, fpsController) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cameraController = cameraController;
    this.fpsController = fpsController;

    this.width = canvas.width;
    this.height = canvas.height;

    this.padding = 16;
    this.mapW = this.width - this.padding * 2;
    this.mapH = this.height - this.padding * 2;

    this.bindEvents();
  }

  // World coords (x in [-300, 300], z in [-450, 450]) to canvas coords
  // Note: z is North (+Z) -> top of map; -Z is South -> bottom of map
  worldToCanvas(x, z) {
    const normX = (x - BOUNDS.minX) / (BOUNDS.maxX - BOUNDS.minX);
    const normZ = (z - BOUNDS.minZ) / (BOUNDS.maxZ - BOUNDS.minZ);
    const cx = this.padding + normX * this.mapW;
    const cy = this.padding + (1 - normZ) * this.mapH; // Flip so North is up
    return [cx, cy];
  }

  canvasToWorld(cx, cy) {
    const normX = (cx - this.padding) / this.mapW;
    const normZ = 1 - (cy - this.padding) / this.mapH;
    const x = BOUNDS.minX + normX * (BOUNDS.maxX - BOUNDS.minX);
    const z = BOUNDS.minZ + normZ * (BOUNDS.maxZ - BOUNDS.minZ);
    return [x, z];
  }

  bindEvents() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (this.width / rect.width);
      const cy = (e.clientY - rect.top) * (this.height / rect.height);

      // Check if clicking near any region center
      for (const reg of REGIONS) {
        const [rx, ry] = this.worldToCanvas(reg.center[0], reg.center[1]);
        if (Math.hypot(cx - rx, cy - ry) < 22) {
          this.cameraController.flyTo(reg.id, 1.2);
          return;
        }
      }

      // Otherwise click to fly to world position
      const [wx, wz] = this.canvasToWorld(cx, cy);
      if (this.fpsController.active) {
        this.fpsController.position.set(wx, 2, wz);
      } else {
        this.cameraController.flyTo({
          position: [wx + 100, 120, wz - 100],
          target: [wx, 10, wz]
        }, 1.2);
      }
    });
  }

  render(camPos, camTarget) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Map Background
    ctx.fillStyle = 'rgba(15, 20, 28, 0.88)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Outer Moat Water
    const [mw0, mz0] = this.worldToCanvas(BOUNDS.minX - 16, BOUNDS.minZ - 16);
    const [mw1, mz1] = this.worldToCanvas(BOUNDS.maxX + 16, BOUNDS.maxZ + 16);
    ctx.strokeStyle = 'rgba(43, 68, 66, 0.85)';
    ctx.lineWidth = 6;
    ctx.strokeRect(mw0, mz1, mw1 - mw0, mz0 - mz1);

    // Outer Red Palace Walls
    const [c0x, c0y] = this.worldToCanvas(BOUNDS.minX, BOUNDS.minZ);
    const [c1x, c1y] = this.worldToCanvas(BOUNDS.maxX, BOUNDS.maxZ);
    ctx.strokeStyle = '#c9372e';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(c0x, c1y, c1x - c0x, c0y - c1y);

    // Yellow Glazed Wall Coping Line
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.strokeRect(c0x - 1, c1y - 1, c1x - c0x + 2, c0y - c1y + 2);

    // 4 Corner Towers
    ctx.fillStyle = '#ffc83b';
    for (const [cx, cz] of [[c0x, c0y], [c1x, c0y], [c0x, c1y], [c1x, c1y]]) {
      ctx.beginPath();
      ctx.arc(cx, cz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Central Axis Road
    const [ax0, ay0] = this.worldToCanvas(0, BOUNDS.minZ + 10);
    const [ax1, ay1] = this.worldToCanvas(0, BOUNDS.maxZ - 10);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ax0, ay0);
    ctx.lineTo(ax1, ay1);
    ctx.stroke();

    // Central Key Halls Highlights (Taihe, Qianqing)
    const [thx, thy] = this.worldToCanvas(0, -65);
    ctx.fillStyle = 'rgba(212, 175, 55, 0.65)';
    ctx.fillRect(thx - 12, thy - 7, 24, 14);

    const [qqx, qqy] = this.worldToCanvas(0, 168);
    ctx.fillStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.fillRect(qqx - 10, qqy - 6, 20, 12);

    // Region interactive dots and labels
    for (const reg of REGIONS) {
      const [rx, ry] = this.worldToCanvas(reg.center[0], reg.center[1]);
      ctx.fillStyle = reg.color;
      ctx.beginPath();
      ctx.arc(rx, ry, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#f1f5f9';
      ctx.font = '10px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText(reg.name, rx, ry - 8);
    }

    // Camera / Player Position Indicator
    if (this.fpsController.active) {
      // First person player dot with sight cone
      const px = this.fpsController.position.x;
      const pz = this.fpsController.position.z;
      const [cx, cy] = this.worldToCanvas(px, pz);

      const yaw = this.fpsController.yaw;
      // Sight cone pointing along player's look direction
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const coneAngle = yaw - Math.PI / 2;
      const angle1 = coneAngle - 0.45;
      const angle2 = coneAngle + 0.45;
      ctx.arc(cx, cy, 26, angle1, angle2);
      ctx.closePath();
      ctx.fill();

      // Center dot
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Orbit camera target dot
      const [tx, ty] = this.worldToCanvas(camTarget.x, camTarget.z);
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}
