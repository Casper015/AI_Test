// D · 西宫苑（西侧宫苑）
// 四组并列宫苑院落（礼乐院 / 书院 / 陈设院 / 供御院）：
//   每院含院门（courtyardGate）、正殿（hall，单层台基）、南/北配房（sideHall）、
//   院内赏景亭（pavilion），配内院铺装、南侧廊庑与院墙（留院门与南北通门洞）；
//   以水池、假山、石灯、石狮、旗幡与树木区分各院用途，避免机械复制。
// 只登记本区几何与数据：外宫墙、城门、护城河与外侧地形归 F，本文件不生成。
// 依赖已修复的 kit.building()/kit.mergeStatic()，不再做 NaN 剔除或补屋顶的兜底。

export const STUB = false;

const COURT_N = [1, 2, 3, 4];

// 每院的主题与装饰差异（仅展示设定，不改变模数与屋顶等级）
const THEME = {
  1: { pav: true, pond: false, lions: true, banners: true, rockery: false },
  2: { pav: true, pond: true, lions: true, banners: false, rockery: true },
  3: { pav: true, pond: true, lions: false, banners: true, rockery: true },
  4: { pav: true, pond: false, lions: false, banners: false, rockery: true }
};

const TIER_TERRACE = { royal: 4.5, major: 1.8, minor: 1.0 };

function normRot(rot) {
  return ((Math.round(rot || 0) % 360) + 360) % 360;
}

// 建筑正面（kit 局部 -Z）经 slot.rot 旋转后在世界的水平方向
function frontDir(rot) {
  switch (normRot(rot)) {
    case 90: return [-1, 0];
    case 180: return [0, 1];
    case 270: return [1, 0];
    default: return [0, -1];
  }
}

function terraceYOf(slot) {
  switch (slot.kind) {
    case 'pavilion': return slot.tier === 'royal' ? 2.2 : 1.4;
    case 'courtyardGate': return 1.2;
    case 'gateHall': return slot.drum ? 0 : (TIER_TERRACE[slot.tier] || 1.0);
    default: return slot.terrace ? (TIER_TERRACE[slot.tier] || 1.0) : 0.9;
  }
}

// 旋转后建筑体量在世界坐标下的半宽 / 半深
function halfExtents(slot) {
  const r = normRot(slot.rot);
  const swap = r === 90 || r === 270;
  return { hx: swap ? slot.d / 2 : slot.w / 2, hz: swap ? slot.w / 2 : slot.d / 2 };
}

export async function createZone(ctx) {
  const { THREE, kit, config, layout, zone, slots, corridors, roads } = ctx;
  const STEP = (config.FP && config.FP.step) || 0.55;

  const rand = (() => {
    const src = ctx.rng;
    if (typeof src === 'function') {
      try {
        const g = src(`zone.${zone.id}`);
        if (typeof g === 'function') return g;
      } catch (err) { /* 回退到 Math.random */ }
    }
    return Math.random;
  })();
  const jitter = (a) => a * (0.86 + 0.28 * rand());

  const root = new THREE.Group();
  root.name = `zone-${zone.id}`;

  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];
  const avoidRects = []; // [minX, maxX, minZ, maxZ]

  const ob = (min, max) => obstacles.push({ min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] });
  const sf = (id, minX, minZ, maxX, maxZ, y, kind) =>
    surfaces.push({ id, min: [minX, 0, minZ], max: [maxX, 0, maxZ], y, kind });
  const slotById = (id) => slots.find((s) => s.id === id) || null;

  // ---------------------------------------------------------------- 台基 + 前檐台阶
  // 逐级台阶每级高差 ≤ config.FP.step；台基顶面登记为可行走面。
  function walkSurfaces(slot) {
    const ty = terraceYOf(slot);
    if (!(ty > 0.2)) return;
    const { hx, hz } = halfExtents(slot);
    const pad = 2.4;
    const thx = hx + pad;
    const thz = hz + pad;
    sf(`${slot.id}.terrace`, slot.x - thx, slot.z - thz, slot.x + thx, slot.z + thz, ty, 'terrace');

    const n = Math.max(2, Math.min(4, Math.ceil(ty / STEP)));
    const inc = ty / n;
    const dep = 1.6;
    const [fx, fz] = frontDir(slot.rot);
    const along = fx !== 0 ? thx : thz;
    const perpHalf = (fx !== 0 ? thz : thx) * 0.55;
    const dir = fx !== 0 ? fx : fz;
    const edge = (fx !== 0 ? slot.x : slot.z) + dir * along;
    for (let i = 0; i < n; i++) {
      const near = edge + dir * (dep * (n - 1 - i));
      const far = near + dir * dep;
      const a = Math.min(near, far);
      const b = Math.max(near, far);
      if (fx !== 0) sf(`${slot.id}.step${i}`, a, slot.z - perpHalf, b, slot.z + perpHalf, inc * (i + 1), 'stairs');
      else sf(`${slot.id}.step${i}`, slot.x - perpHalf, a, slot.x + perpHalf, b, inc * (i + 1), 'stairs');
    }
  }

  // ---------------------------------------------------------------- 门类：中央留门洞
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

  // ---------------------------------------------------------------- 建筑落地
  function placeBuilding(slot) {
    const res = kit.building(slot);
    root.add(res.group);
    const bb = res.bounds;
    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: zone.id,
      rot: normRot(slot.rot),
      visitable: !!slot.visitable,
      info: slot.info || '',
      entrance: [slot.x, Math.max(1.2, bb.max.y * 0.4), slot.z],
      bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }
    });

    if (slot.kind === 'courtyardGate' || slot.kind === 'gateHall') {
      for (const o of doorObstacles(bb, slot.rot, slot.kind === 'gateHall' ? 8 : 13)) obstacles.push(o);
    } else {
      ob([bb.min.x, Math.min(0, bb.min.y), bb.min.z], [bb.max.x, bb.max.y, bb.max.z]);
    }
    walkSurfaces(slot);

    const lit = slot.kind === 'hall' || slot.kind === 'gateHall' || slot.kind === 'pavilion' ||
      slot.kind === 'courtyardGate' || (slot.kind === 'sideHall' && slot.tier === 'major');
    if (lit) {
      lightAnchors.push({
        id: `${slot.id}.lamp`,
        type: 'lantern',
        position: [slot.x, Math.max(3.2, bb.max.y * 0.55), slot.z],
        color: 0xffb46b,
        intensity: slot.kind === 'hall' ? 6 : 4
      });
    }
    const { hx, hz } = halfExtents(slot);
    avoidRects.push([slot.x - hx - 3, slot.x + hx + 3, slot.z - hz - 3, slot.z + hz + 3]);
    return res;
  }

  // ---------------------------------------------------------------- 铺地
  // layout 道路（含各院 court 铺装带）
  for (const r of roads) root.add(kit.slabRect(r));

  const courtZ = {};
  for (const n of COURT_N) {
    const m = slotById(`d.c${n}.main`);
    courtZ[n] = m ? m.z : 0;
  }

  // 各院内院铺装（略抬 0.14 避免与道路共面）
  for (const n of COURT_N) {
    const slab = kit.slabRect({ x: -203, z: courtZ[n], w: 146, d: 126, kind: 'plaza' });
    slab.position.y = 0.14;
    root.add(slab);
  }
  // 东侧南北连通步道（连接四院院门与两处跨区便门），抬 0.10
  const spine = kit.slabRect({ x: -121, z: -30, w: 11, d: 600, kind: 'path' });
  spine.position.y = 0.10;
  root.add(spine);
  // 便门引导铺装，抬 0.16
  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    const stub = kit.slabRect({ x: c.x + 2, z: c.z, w: 30, d: 14, kind: 'path' });
    stub.position.y = 0.16;
    root.add(stub);
  }

  // ---------------------------------------------------------------- 廊庑（各院南侧）
  for (const cor of corridors) {
    const g = kit.corridor({ len: cor.len, w: 5.4, h: 4.2 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
    const half = cor.len / 2;
    // 只登记檐顶遮挡，柱间保持可通行
    if (cor.axis === 'z') ob([cor.x - 3.0, 3.3, cor.z - half], [cor.x + 3.0, 4.6, cor.z + half]);
    else ob([cor.x - half, 3.3, cor.z - 3.0], [cor.x + half, 4.6, cor.z + 3.0]);
    if (cor.axis === 'z') avoidRects.push([cor.x - 4, cor.x + 4, cor.z - half - 3, cor.z + half + 3]);
    else avoidRects.push([cor.x - half - 3, cor.x + half + 3, cor.z - 4, cor.z + 4]);
  }

  // ---------------------------------------------------------------- 院墙（留门洞）
  const WALL_H = 4.6;
  const WALL_T = 1.4;
  const CX_W = -276; // 院墙西界
  const CX_E = -130; // 院墙东界（院门所在）
  const GATE_HALF = 13; // 院门门洞半宽
  const MID_GAP = 8; // 南北通门洞半宽（x=-200 处）

  function addWall(x, z, len, axis) {
    const g = kit.wall({ len, h: WALL_H, t: WALL_T });
    g.position.set(x, 0, z);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    root.add(g);
    const t = WALL_T / 2 + 0.5;
    if (axis === 'z') {
      ob([x - t, 0, z - len / 2], [x + t, WALL_H, z + len / 2]);
      avoidRects.push([x - t - 2, x + t + 2, z - len / 2 - 2, z + len / 2 + 2]);
    } else {
      ob([x - len / 2, 0, z - t], [x + len / 2, WALL_H, z + t]);
      avoidRects.push([x - len / 2 - 2, x + len / 2 + 2, z - t - 2, z + t + 2]);
    }
  }

  for (const n of COURT_N) {
    const cz = courtZ[n];
    const zS = cz - 66;
    const zN = cz + 64;
    // 西墙整段
    addWall(CX_W, (zS + zN) / 2, zN - zS, 'z');
    // 东墙：院门处留洞
    const segS = cz - GATE_HALF - zS;
    const segN = zN - (cz + GATE_HALF);
    addWall(CX_E, zS + segS / 2, segS, 'z');
    addWall(CX_E, zN - segN / 2, segN, 'z');
    // 北 / 南墙：x=-200 处留南北通门洞
    for (const wz of [zS, zN]) {
      addWall((CX_W + (-200 - MID_GAP)) / 2, wz, (-200 - MID_GAP) - CX_W, 'x');
      addWall(((-200 + MID_GAP) + CX_E) / 2, wz, CX_E - (-200 + MID_GAP), 'x');
    }
  }

  // ---------------------------------------------------------------- 槽位建筑（16 个全部落地）
  for (const slot of slots) placeBuilding(slot);

  // ---------------------------------------------------------------- 附加赏景亭（每院一亭）
  for (const n of COURT_N) {
    if (!(THEME[n] || {}).pav) continue;
    const cz = courtZ[n];
    const zz = cz + (n % 2 === 1 ? 36 : -36);
    placeBuilding({
      id: `d.c${n}.pav`,
      zone: 'west',
      kind: 'pavilion',
      name: `西宫苑${n}院赏景亭`,
      x: -158,
      z: zz,
      w: 12,
      d: 12,
      bays: 3,
      rot: 0,
      tier: 'minor',
      info: '院中赏景方亭，攒尖金顶。'
    });
  }

  // ---------------------------------------------------------------- 水池（书院 / 陈设院）
  for (const n of COURT_N) {
    if (!(THEME[n] || {}).pond) continue;
    const cz = courtZ[n];
    const pz = cz + (n === 2 ? 30 : -30);
    const px = -152;
    const pr = n === 2 ? 7 : 6;
    root.add(kit.props({ kind: 'pond', x: px, z: pz, r: pr, seed: n * 3.1 }));
    ob([px - pr, -0.6, pz - pr], [px + pr, 0.6, pz + pr]);
    avoidRects.push([px - pr - 4, px + pr + 4, pz - pr - 4, pz + pr + 4]);
  }

  // ---------------------------------------------------------------- 假山（书院 / 陈设院 / 供御院）
  const rockList = [];
  for (const n of COURT_N) {
    if (!(THEME[n] || {}).rockery) continue;
    const bz = courtZ[n] + 28;
    const bx = -232;
    rockList.push({ x: bx, z: bz, s: jitter(2.0), r: 0.3 });
    rockList.push({ x: bx - 6, z: bz + 5, s: jitter(1.4), r: 1.1 });
    rockList.push({ x: bx + 5, z: bz + 4, s: jitter(1.6), r: 2.0 });
    ob([bx - 9, 0, bz - 3], [bx + 9, 3.2, bz + 9]);
    avoidRects.push([bx - 12, bx + 12, bz - 6, bz + 12]);
  }
  if (rockList.length) root.add(kit.props({ kind: 'rock', list: rockList }));

  // ---------------------------------------------------------------- 石狮（礼乐院 / 书院，院门内两侧）
  for (const n of COURT_N) {
    if (!(THEME[n] || {}).lions) continue;
    const cz = courtZ[n];
    root.add(kit.props({ kind: 'lion', at: [-140, cz - 9, Math.PI / 2] }));
    root.add(kit.props({ kind: 'lion', at: [-140, cz + 9, -Math.PI / 2] }));
    avoidRects.push([-144, -136, cz - 13, cz - 5]);
    avoidRects.push([-144, -136, cz + 5, cz + 13]);
  }

  // ---------------------------------------------------------------- 旗幡（礼乐院 / 陈设院）
  for (const n of COURT_N) {
    if (!(THEME[n] || {}).banners) continue;
    const cz = courtZ[n];
    root.add(kit.props({ kind: 'banner', at: [-146, cz - 14], ry: 0.1 }));
    root.add(kit.props({ kind: 'banner', at: [-146, cz + 14], ry: -0.1 }));
  }

  // ---------------------------------------------------------------- 石灯 + 灯位
  const lamps = [];
  for (const n of COURT_N) {
    const cz = courtZ[n];
    lamps.push({ x: -120, z: cz - 20 }, { x: -120, z: cz + 20 });
  }
  lamps.push({ x: -121, z: -180 }, { x: -121, z: 180 });
  root.add(kit.props({ kind: 'lantern', list: lamps }));
  for (const p of lamps) {
    lightAnchors.push({ id: `wlamp.${p.x}_${p.z}`, type: 'lantern', position: [p.x, 2.8, p.z], color: 0xffb46b, intensity: 3 });
  }

  // ---------------------------------------------------------------- 铜香炉（礼乐院 / 供御院）
  root.add(kit.props({ kind: 'censer', x: -166, z: courtZ[1] }));
  root.add(kit.props({ kind: 'censer', x: -166, z: courtZ[4] }));
  lightAnchors.push({ id: 'd.c1.censer', type: 'censer', position: [-166, 2.2, courtZ[1]], color: 0xffa050, intensity: 2 });
  lightAnchors.push({ id: 'd.c4.censer', type: 'censer', position: [-166, 2.2, courtZ[4]], color: 0xffa050, intensity: 2 });

  // ---------------------------------------------------------------- 树木（散布，避让建筑 / 墙 / 道路 / 小品）
  for (const r of roads) {
    avoidRects.push([r.x - r.w / 2 - 3, r.x + r.w / 2 + 3, r.z - r.d / 2 - 3, r.z + r.d / 2 + 3]);
  }
  avoidRects.push([-130, -112, zone.minZ, zone.maxZ]); // 东侧连通步道带

  const treeCfg = (layout.TREES && layout.TREES.west) || { count: 100, areas: [{ x: -205, z: -30, w: 168, d: 600 }] };
  const area = (treeCfg.areas && treeCfg.areas[0]) || { x: -205, z: -30, w: 168, d: 600 };
  const want = Math.min(treeCfg.count || 100, 110);
  const pines = [];
  const broads = [];
  let guard = 0;
  while (pines.length + broads.length < want && guard < want * 45 + 400) {
    guard++;
    const x = area.x + (rand() - 0.5) * area.w;
    const z = area.z + (rand() - 0.5) * area.d;
    if (x < zone.minX + 3 || x > zone.maxX - 3 || z < zone.minZ + 3 || z > zone.maxZ - 3) continue;
    let bad = false;
    for (const a of avoidRects) {
      if (x > a[0] && x < a[1] && z > a[2] && z < a[3]) { bad = true; break; }
    }
    if (bad) continue;
    const s = 0.8 + rand() * 0.45;
    if (rand() < 0.55) pines.push({ x, z, s, r: 0 });
    else broads.push({ x, z, s, r: rand() * Math.PI * 2 });
  }
  if (pines.length) root.add(kit.treeCluster(pines, 'pine'));
  if (broads.length) root.add(kit.treeCluster(broads, 'broad'));

  // ---------------------------------------------------------------- 地面可行走面
  sf('ground.west', zone.minX, zone.minZ, zone.maxX, zone.maxZ, 0, 'ground');

  // ---------------------------------------------------------------- 跨区连接（owner === west）
  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
  }

  // ---------------------------------------------------------------- 机位
  const zv = (config.ZONE_VIEWS && config.ZONE_VIEWS['zone.west']) || {};
  viewpoints.push({
    id: 'zone.west',
    name: zv.name || '西宫苑',
    mode: 'zone',
    position: (zv.position || [-430, 158, -40]).slice(),
    target: (zv.target || [-205, 8, -70]).slice(),
    fov: zv.fov || 40
  });
  viewpoints.push({
    id: 'fp.west',
    name: '西宫苑·第一人称出生点',
    mode: 'fp-spawn',
    position: [-121, 0, -176],
    target: [-200, 1.6, -180],
    fov: 60
  });

  // ---------------------------------------------------------------- 收尾
  kit.mergeStatic(root);

  return {
    root,
    buildings,
    connectors,
    colliders: { obstacles, surfaces },
    viewpoints,
    lightAnchors,
    update: () => {},
    dispose: () => {}
  };
}
