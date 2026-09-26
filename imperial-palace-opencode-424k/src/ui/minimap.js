/**
 * 紫禁天朝 · 小地图（G 交互）
 * 基于统一布局绘制宫墙、区域、院落、水面与当前位置；点击定位分区。
 */

export function createMinimap(opts) {
  const { canvas, layout } = opts;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = 176 * 2;
  const H = canvas.height = 264 * 2;
  const bounds = { x0: -400, x1: 400, z0: -520, z1: 520 };
  const scale = Math.min(W / (bounds.x1 - bounds.x0), H / (bounds.z1 - bounds.z0));
  const ox = W / 2 - (bounds.x0 + bounds.x1) / 2 * scale;
  const oy = H / 2 - (bounds.z0 + bounds.z1) / 2 * scale;

  const px = x => ox + x * scale;
  const pz = z => oy + z * scale;

  const zoneFill = { B: 'rgba(255,200,59,0.10)', C: 'rgba(140,200,255,0.10)', D: 'rgba(150,40,34,0.14)', E: 'rgba(30,120,110,0.16)', F: 'rgba(90,170,90,0.16)' };

  function draw(state, cam) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,9,13,0.92)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(60,70,90,0.5)';
    ctx.fillRect(px(bounds.x0), pz(bounds.z0), (bounds.x1 - bounds.x0) * scale, (bounds.z1 - bounds.z0) * scale);

    for (const z of layout.zones) {
      ctx.fillStyle = zoneFill[z.id] || 'rgba(255,255,255,0.05)';
      const b = z.bounds;
      ctx.fillRect(px(b.x0), pz(b.z0), (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
    }

    ctx.fillStyle = 'rgba(70,120,160,0.55)';
    for (const w of layout.waters) {
      if (w.kind === 'deck') continue;
      ctx.fillRect(px(w.x0), pz(w.z0), (w.x1 - w.x0) * scale, (w.z1 - w.z0) * scale);
    }

    ctx.strokeStyle = 'rgba(120,130,150,0.5)';
    ctx.lineWidth = 1.5;
    for (const p of layout.paths) {
      if (p.style === 'soil') continue;
      ctx.strokeRect(px(p.x0), pz(p.z0), (p.x1 - p.x0) * scale, (p.z1 - p.z0) * scale);
    }

    for (const b of layout.buildings) {
      const gold = b.level === 1 ? 'rgba(255,200,59,0.95)' : (b.level === 2 ? 'rgba(232,168,60,0.8)' : 'rgba(190,150,90,0.62)');
      ctx.fillStyle = b.visitable ? 'rgba(140,240,170,0.9)' : gold;
      const w = Math.max(2, (b.bounds.x1 - b.bounds.x0) * scale);
      const d = Math.max(2, (b.bounds.z1 - b.bounds.z0) * scale);
      ctx.fillRect(px(b.bounds.x0), pz(b.bounds.z0), w, d);
    }

    ctx.strokeStyle = 'rgba(150,40,34,0.9)';
    ctx.lineWidth = 3;
    const e = { x0: -300, x1: 300, z0: -420, z1: 420 };
    ctx.strokeRect(px(e.x0), pz(e.z0), (e.x1 - e.x0) * scale, (e.z1 - e.z0) * scale);

    ctx.strokeStyle = 'rgba(255,200,59,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(0), pz(-420));
    ctx.lineTo(px(0), pz(420));
    ctx.stroke();

    if (cam) {
      const cx = px(cam.position.x), cz = pz(cam.position.z);
      const dir = cam.direction || { x: 0, z: -1 };
      const ang = Math.atan2(dir.x, dir.z);
      ctx.save();
      ctx.translate(cx, cz);
      ctx.rotate(-ang);
      ctx.fillStyle = 'rgba(255,200,59,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 54, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = state && state.fpActive ? '#8ff0a8' : '#ffc83b';
      ctx.beginPath();
      ctx.arc(cx, cz, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(242,236,224,0.75)';
    ctx.font = '600 17px "Songti SC", serif';
    for (const z of layout.zones) {
      const c = { B: [0, -260], C: [0, 200], D: [-215, -60], E: [215, -60], F: [0, 372] }[z.id];
      if (!c) continue;
      ctx.fillText(z.code, px(c[0]) - 16, pz(c[1]));
    }
  }

  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W;
    const y = (e.clientY - r.top) / r.height * H;
    const wx = (x - ox) / scale;
    const wz = (y - oy) / scale;
    if (opts.events) opts.events.emit('request-zone-at', { x: wx, z: wz });
  });

  return { draw, px, pz, scale };
}

export default createMinimap;
