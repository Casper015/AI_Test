// B · 中轴前朝（金銮殿群）
// 南门殿 → 朝房 → 中门 → 礼仪广场 → 金銮殿（三层白石台基 / 丹陛御道 / 两侧台阶 / 栏杆）
// → 中殿 → 后殿；左右配殿与廊庑围合，主殿内景可进入。
// 本文件只登记本区几何与数据：外圈地形、护城河水面由 core/terrain.js 与 main.js 提供，不在此生成。

// 台基高度（与 kit.TIERS 的 terrace 值对应）
const TIER_TERRACE = { royal: 4.5, major: 1.8, minor: 1.0 };
// 主殿几何关键量（与 layout.SLOTS.forecourt 的 b.main-hall 一致）
const MAIN = { x: 0, z: -120, w: 104, d: 50, baseY: 4.5, bodyH: 12, wallTop: 16.6 };
const ROOM = { w: 62, d: 40, gap: 14, y: MAIN.baseY, top: MAIN.baseY + 14 };

function normRot(rot) {
  return ((Math.round(rot || 0) % 360) + 360) % 360;
}

function finiteBox(bb) {
  return [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(Number.isFinite);
}

export async function createZone(ctx) {
  const { THREE, kit, layout, zone, slots, corridors, roads, rng } = ctx;
  const M = kit.materials;
  const rnd = typeof rng === 'function' ? rng(`zone.${zone.id}`) : () => 0.5;

  const root = new THREE.Group();
  root.name = `zone-${zone.id}`;

  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];

  // ---------------------------------------------------------------------------
  // 局部工具
  // ---------------------------------------------------------------------------

  // kit.hall 的单檐分支调用 roof() 时漏传 h，屋面/正脊几何为 NaN。
  // 这里就地剔除 NaN 网格（避免本区出现 NaN 包围盒），稍后再补一片正确屋面。
  function stripNaN(group) {
    const dead = [];
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const a = o.geometry && o.geometry.attributes && o.geometry.attributes.position && o.geometry.attributes.position.array;
      if (!a) return;
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i])) { dead.push(o); return; }
      }
    });
    for (const o of dead) if (o.parent) o.parent.remove(o);
    return dead.length;
  }

  // 为缺顶的单檐大殿补一片与形制一致的屋面（kit.roof 传入 h 即为有限几何）。
  function addMissingRoof(group, slot) {
    const t = kit.tier(slot.tier);
    const baseY = slot.terrace ? t.terrace : 0.9;
    const r = kit.roof({ w: slot.w + 3.4, d: slot.d + 3, h: t.roof });
    r.position.set(0, baseY + t.body + 0.2, 0);
    group.add(r);
  }

  // 门殿在中央留门洞，保证中轴可穿行；其余建筑体块整体登记。
  function doorObstacles(bb, rot, gapHalf) {
    const r = normRot(rot);
    const yMin = Math.min(0, bb.min.y);
    const out = [];
    if (r === 0 || r === 180) {
      const cx = (bb.min.x + bb.max.x) / 2;
      if (cx - gapHalf > bb.min.x) out.push({ min: [bb.min.x, yMin, bb.min.z], max: [cx - gapHalf, bb.max.y, bb.max.z] });
      if (bb.max.x > cx + gapHalf) out.push({ min: [cx + gapHalf, yMin, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    } else {
      const cz = (bb.min.z + bb.max.z) / 2;
      if (cz - gapHalf > bb.min.z) out.push({ min: [bb.min.x, yMin, bb.min.z], max: [bb.max.x, bb.max.y, cz - gapHalf] });
      if (bb.max.z > cz + gapHalf) out.push({ min: [bb.min.x, yMin, cz + gapHalf], max: [bb.max.x, bb.max.y, bb.max.z] });
    }
    return out.length ? out : [{ min: [bb.min.x, yMin, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }];
  }

  // 可进入主殿用分解碰撞代替整体包围盒：东西山墙 + 后檐墙（南向留门洞与丹陛通道）。
  function registerMainHallColliders() {
    const hx = MAIN.w / 2;
    obstacles.push({ min: [MAIN.x - hx - 0.9, 0, -143.0], max: [MAIN.x - hx + 0.9, MAIN.wallTop, -96.6] });
    obstacles.push({ min: [MAIN.x + hx - 0.9, 0, -143.0], max: [MAIN.x + hx + 0.9, MAIN.wallTop, -96.6] });
    obstacles.push({ min: [MAIN.x - hx - 0.9, 0, -96.4], max: [MAIN.x + hx + 0.9, MAIN.wallTop, -94.4] });
  }

  // 逐级台阶：几何 + 可行走面，每级高差 ≤ config.FP.step。
  function stairFlight(cx, zStart, w, topY, steps, stepD) {
    const g = new THREE.Group();
    const stepH = topY / steps;
    for (let i = 1; i <= steps; i++) {
      const h = stepH * i;
      const zc = zStart + (i - 0.5) * stepD;
      g.add(kit.boxAt(w, h, stepD, cx, h / 2, zc, M.stoneSide));
      surfaces.push({
        id: `stair.${cx}.${i}`,
        min: [cx - w / 2, 0, zStart + (i - 1) * stepD],
        max: [cx + w / 2, 0, zStart + i * stepD],
        y: h,
        kind: 'stairs'
      });
    }
    return g;
  }

  // ---------------------------------------------------------------------------
  // 铺地：本区道路 + 院落
  // ---------------------------------------------------------------------------
  for (const road of roads) root.add(kit.slabRect(road));
  root.add(kit.slabRect({ x: 0, z: -350, w: 200, d: 96, kind: 'court' })); // 前朝南院
  root.add(kit.slabRect({ x: 0, z: 20, w: 190, d: 88, kind: 'court' })); // 前朝后苑
  root.add(kit.slabRect({ x: 0, z: -196, w: 208, d: 26, kind: 'path' })); // 广场横向御道

  // ---------------------------------------------------------------------------
  // 廊庑（东西两列 + 广场横廊），登记障碍盒
  // ---------------------------------------------------------------------------
  for (const cor of corridors) {
    const cg = kit.corridor({ x: 0, z: 0, len: cor.len, w: 5.4, h: 4.2 });
    cg.position.set(cor.x, 0, cor.z);
    cg.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(cg);
    const half = cor.len / 2;
    const t = 2.8;
    if (cor.axis === 'z') obstacles.push({ min: [cor.x - t, 0, cor.z - half], max: [cor.x + t, 3.8, cor.z + half] });
    else obstacles.push({ min: [cor.x - half, 0, cor.z - t], max: [cor.x + half, 3.8, cor.z + t] });
  }

  // ---------------------------------------------------------------------------
  // 建筑槽位（13 个全部落地）
  // ---------------------------------------------------------------------------
  for (const slot of slots) {
    const res = kit.building(slot);
    const stripped = stripNaN(res.group);
    if (stripped > 0 && slot.kind === 'hall' && !slot.double) addMissingRoof(res.group, slot);
    res.group.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(res.group);
    root.add(res.group);

    const height = finiteBox(bb) ? bb.max.y : (slot.terrace ? TIER_TERRACE[slot.tier] : 0.9) + 16;
    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: zone.id,
      rot: normRot(slot.rot),
      visitable: !!slot.visitable,
      info: slot.info || '',
      entrance: [slot.x, Math.max(1, height * 0.4), slot.z],
      bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }
    });

    if (slot.id === 'b.main-hall') {
      // 可进入的主殿：用分解墙体代替整体包围盒，南向留门洞与丹陛通道。
      registerMainHallColliders();
    } else if (slot.kind === 'gateHall') {
      for (const o of doorObstacles(bb, slot.rot, slot.id === 'b.gate-mid' ? 7 : 8)) obstacles.push(o);
    } else {
      obstacles.push({ min: [bb.min.x, Math.min(0, bb.min.y), bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    }

    if (slot.kind === 'hall' || slot.kind === 'gateHall' || (slot.kind === 'sideHall' && slot.tier === 'major')) {
      lightAnchors.push({
        id: `${slot.id}.lamp`,
        type: 'lantern',
        position: [slot.x, Math.max(4, height * 0.6), slot.z],
        color: 0xffb46b,
        intensity: 6
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 主殿要点：三层台基可行走面、丹陛御道 + 两侧台阶
  // ---------------------------------------------------------------------------
  // 三层台基（台阶之外的平台面）
  surfaces.push({ id: 'b.main-hall.terrace0', min: [-65.4, 0, -158.4], max: [65.4, 0, -81.6], y: 1.5, kind: 'terrace' });
  surfaces.push({ id: 'b.main-hall.terrace1', min: [-59.9, 0, -152.9], max: [59.9, 0, -87.1], y: 3.0, kind: 'terrace' });
  surfaces.push({ id: 'b.main-hall.terrace2', min: [-54.4, 0, -147.4], max: [54.4, 0, -92.6], y: 4.5, kind: 'terrace' });

  // 中央丹陛御道：10 级（每级 0.45m ≤ FP.step），自地面升至台面 4.5m
  root.add(stairFlight(0, -169.4, 22, 4.5, 10, 2.2));
  // 两侧台阶
  root.add(stairFlight(-42, -169.4, 14, 4.5, 10, 2.2));
  root.add(stairFlight(42, -169.4, 14, 4.5, 10, 2.2));

  // ---------------------------------------------------------------------------
  // 金銮殿内景：金砖地面 / 金銮宝座 / 屏风 / 盘龙柱 / 藻井（kit.interior）
  // ---------------------------------------------------------------------------
  const room = kit.interior({ kind: 'throne', x: 0, z: 0, w: ROOM.w, d: ROOM.d });
  // 拆掉整片南墙，改成「门洞 + 两侧墙垛 + 门楣」，保留一条真实入口通道。
  const wallZ = -(ROOM.d / 2 - 0.3);
  for (const child of Array.from(room.children)) {
    if (child.isMesh && !child.isInstancedMesh && Math.abs(child.position.x) < 0.01 && Math.abs(child.position.z - wallZ) < 0.08 && child.position.y > 4) {
      room.remove(child);
    }
  }
  const segW = (ROOM.w - ROOM.gap) / 2;
  room.add(kit.boxAt(segW, 9.2, 0.6, -(ROOM.gap / 2 + segW / 2), 4.6, wallZ, M.innerWall));
  room.add(kit.boxAt(segW, 9.2, 0.6, ROOM.gap / 2 + segW / 2, 4.6, wallZ, M.innerWall));
  room.add(kit.boxAt(ROOM.gap, 2.2, 0.6, 0, 8.1, wallZ, M.innerWall));
  room.position.set(MAIN.x, ROOM.y, MAIN.z);
  root.add(room);

  // 室内可行走面（金砖地面 + 暗色台面）
  const rx = ROOM.w / 2 - 0.3;
  const rz = ROOM.d / 2 - 0.3;
  surfaces.push({ id: 'b.main-hall.interior', min: [MAIN.x - rx, 0, MAIN.z - rz], max: [MAIN.x + rx, 0, MAIN.z + rz], y: ROOM.y + 0.42, kind: 'interior' });
  // 室内四面墙体障碍（南墙留门洞）
  obstacles.push({ min: [MAIN.x - rx - 0.3, ROOM.y, MAIN.z - rz - 0.3], max: [MAIN.x - rx + 0.3, ROOM.top, MAIN.z + rz + 0.3] });
  obstacles.push({ min: [MAIN.x + rx - 0.3, ROOM.y, MAIN.z - rz - 0.3], max: [MAIN.x + rx + 0.3, ROOM.top, MAIN.z + rz + 0.3] });
  obstacles.push({ min: [MAIN.x - rx - 0.3, ROOM.y, MAIN.z + rz - 0.3], max: [MAIN.x + rx + 0.3, ROOM.top, MAIN.z + rz + 0.3] });
  obstacles.push({ min: [MAIN.x - rx - 0.3, ROOM.y, MAIN.z - rz - 0.3], max: [MAIN.x - ROOM.gap / 2, ROOM.top, MAIN.z - rz + 0.3] });
  obstacles.push({ min: [MAIN.x + ROOM.gap / 2, ROOM.y, MAIN.z - rz - 0.3], max: [MAIN.x + rx + 0.3, ROOM.top, MAIN.z - rz + 0.3] });
  // 门楣（高处置遮挡，不影响人或视线低于 7m 的通行）
  obstacles.push({ min: [MAIN.x - ROOM.gap / 2, ROOM.y + 7, MAIN.z - rz - 0.3], max: [MAIN.x + ROOM.gap / 2, ROOM.top, MAIN.z - rz + 0.3] });

  // ---------------------------------------------------------------------------
  // 摆件：石狮 / 铜香炉 / 石灯 / 旗幡
  // ---------------------------------------------------------------------------
  root.add(kit.props({ kind: 'lion', at: [-30, -390, -0.3] }));
  root.add(kit.props({ kind: 'lion', at: [30, -390, 0.3] }));
  root.add(kit.props({ kind: 'lion', at: [-24, -268, -0.3] }));
  root.add(kit.props({ kind: 'lion', at: [24, -268, 0.3] }));
  // 台基前铜香炉
  root.add(kit.props({ kind: 'censer', x: -20, z: -156, y: 1.5 }));
  root.add(kit.props({ kind: 'censer', x: 20, z: -156, y: 1.5 }));
  root.add(kit.props({ kind: 'censer', x: -26, z: -144, y: 4.5 }));
  root.add(kit.props({ kind: 'censer', x: 26, z: -144, y: 4.5 }));
  // 广场石灯
  const plazaLamps = [
    { x: -52, z: -238 }, { x: 52, z: -238 },
    { x: -52, z: -206 }, { x: 52, z: -206 },
    { x: -52, z: -172 }, { x: 52, z: -172 },
    { x: -84, z: -300 }, { x: 84, z: -300 },
    { x: -84, z: -330 }, { x: 84, z: -330 }
  ];
  root.add(kit.props({ kind: 'lantern', list: plazaLamps }));
  for (const p of plazaLamps) {
    lightAnchors.push({ id: `lamp.${p.x}_${p.z}`, type: 'lantern', position: [p.x, 3.0, p.z], color: 0xffb46b, intensity: 4 });
  }
  // 中门前旗幡
  root.add(kit.props({ kind: 'banner', at: [-20, -232], ry: 0.1 }));
  root.add(kit.props({ kind: 'banner', at: [20, -232], ry: -0.1 }));

  // ---------------------------------------------------------------------------
  // 树木点缀（前朝南院两侧），避让建筑
  // ---------------------------------------------------------------------------
  const avoid = [];
  for (const s of slots) avoid.push([s.x - s.w / 2 - 5, s.x + s.w / 2 + 5, s.z - s.d / 2 - 5, s.z + s.d / 2 + 5]);
  avoid.push([-108, 108, -400, 60]); // 中轴与广场保持通透
  const treeSpots = [];
  for (const zz of [-392, -330, -70, -30, 22]) {
    treeSpots.push({ x: -94, z: zz }, { x: 94, z: zz });
  }
  const pines = [];
  const broads = [];
  for (const t of treeSpots) {
    let bad = false;
    for (const a of avoid) if (t.x > a[0] && t.x < a[1] && t.z > a[2] && t.z < a[3]) { bad = true; break; }
    if (bad) continue;
    const s = 0.8 + rnd() * 0.35;
    (rnd() < 0.6 ? pines : broads).push({ x: t.x, z: t.z, s, r: rnd() * Math.PI * 2 });
  }
  if (pines.length) root.add(kit.treeCluster(pines, 'pine'));
  if (broads.length) root.add(kit.treeCluster(broads, 'broad'));

  // ---------------------------------------------------------------------------
  // 可行走面（地面）
  // ---------------------------------------------------------------------------
  surfaces.push({ id: 'ground.forecourt', min: [zone.minX, 0, zone.minZ], max: [zone.maxX, 0, zone.maxZ], y: 0, kind: 'ground' });

  // ---------------------------------------------------------------------------
  // 连接：owner === forecourt 的（本区为空，字段保留）
  // ---------------------------------------------------------------------------
  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
  }

  // ---------------------------------------------------------------------------
  // 机位
  // ---------------------------------------------------------------------------
  const zv = (layout.ZONE_VIEWS && layout.ZONE_VIEWS['zone.main-hall']) || {};
  viewpoints.push({
    id: 'zone.main-hall',
    name: zv.name || '前朝主殿',
    mode: 'zone',
    position: (zv.position || [0, 132, -336]).slice(),
    target: (zv.target || [0, 30, -120]).slice(),
    fov: zv.fov || 38
  });
  viewpoints.push({
    id: 'fp.forecourt',
    name: '前朝·第一人称出生点',
    mode: 'fp-spawn',
    position: [0, 0, -330],
    target: [0, 6, -120],
    fov: 60
  });
  viewpoints.push({
    id: 'interior.main-hall',
    name: '金銮殿内景',
    mode: 'interior',
    position: [0, 8.4, -130],
    target: [0, 3.4, -98],
    fov: 62
  });

  // ---------------------------------------------------------------------------
  // 收尾
  // ---------------------------------------------------------------------------
  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}
