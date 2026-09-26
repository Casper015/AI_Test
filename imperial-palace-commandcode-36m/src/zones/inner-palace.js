// 后宫 / 内廷（分区 C）
// 三进内廷院落：内廷门 → 核心寝殿（坤宁寝殿，可进入内景）→ 内廷二门 → 后苑殿，
// 含东西配房、较小庭院、围合宫墙、廊庑、树木与陈设。
// 与显示契约一致：返回 { root, buildings, connectors, colliders, viewpoints, lightAnchors, update, dispose }。

export const STUB = false;

export async function createZone(ctx) {
  const { THREE, kit, layout, zone, slots, corridors, roads } = ctx;

  const root = new THREE.Group();
  root.name = `zone-${zone.id}`;

  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];

  // 固定随机序列，便于复现与截图比对
  let rand = Math.random;
  if (typeof ctx.rng === 'function') {
    const r = ctx.rng(`zone-${zone.id}`);
    rand = typeof r === 'function' ? r : ctx.rng;
  }
  const jitter = (a) => a * (0.88 + 0.24 * rand());

  const ob = (min, max) => obstacles.push({
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]]
  });
  const sf = (id, minX, minZ, maxX, maxZ, y, kind) =>
    surfaces.push({ id, min: [minX, 0, minZ], max: [maxX, 0, maxZ], y, kind });

  // ---------------------------------------------------------------- 铺地
  // 三进庭院 + 通花园的北向步道，互不重叠，避免同面 z-fighting
  const slabs = [
    { x: 0, z: 125, w: 238, d: 130, kind: 'plaza' }, // 内廷前院 z 60..190
    { x: 0, z: 213, w: 238, d: 46, kind: 'court' },  // 内廷中院 z 190..236
    { x: 0, z: 263, w: 238, d: 54, kind: 'court' },  // 内廷后院 z 236..290
    { x: 0, z: 296, w: 30, d: 12, kind: 'path' }     // 接花园门 z 290..302
  ];
  for (const s of slabs) root.add(kit.slabRect(s));

  // layout 指定的道路（中轴御道），抬高 0.22m 形成浅台，避免与庭院铺地共面
  for (const r of roads) {
    const g = kit.slabRect(r);
    g.position.y = 0.22;
    root.add(g);
  }

  // ---------------------------------------------------------------- 廊庑
  for (const cor of corridors) {
    const g = kit.corridor({ x: 0, z: 0, len: cor.len, w: 5.4, h: 4.4 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
    const half = cor.len / 2;
    // 只登记廊顶作为遮挡，柱间可通行（侧便门需可达）
    if (cor.axis === 'z') ob([cor.x - 3.0, 3.3, cor.z - half], [cor.x + 3.0, 4.6, cor.z + half]);
    else ob([cor.x - half, 3.3, cor.z - 3.0], [cor.x + half, 4.6, cor.z + 3.0]);
  }

  // ---------------------------------------------------------------- 围合宫墙
  const WALL_H = 5.0;
  const WALL_T = 1.6;
  const addWall = (x, z, len, axis) => {
    const g = kit.wall({ x: 0, z: 0, len, h: WALL_H, t: WALL_T });
    g.position.set(x, 0, z);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    root.add(g);
    const t = WALL_T / 2 + 0.4;
    if (axis === 'z') ob([x - t, 0, z - len / 2], [x + t, WALL_H, z + len / 2]);
    else ob([x - len / 2, 0, z - t], [x + len / 2, WALL_H, z + t]);
  };
  // 南界墙（内廷门通道 x∈[-15,15]）
  addWall(-67, 62, 104, 'x');
  addWall(67, 62, 104, 'x');
  // 北界墙（通御花园通道 x∈[-17,17]）
  addWall(-68, 288, 102, 'x');
  addWall(68, 288, 102, 'x');
  // 西界墙（后宫西便门 z∈[172,188]）
  addWall(-118, 119, 106, 'z');
  addWall(-118, 237, 98, 'z');
  // 东界墙（后宫东便门 z∈[172,188]）
  addWall(118, 119, 106, 'z');
  addWall(118, 237, 98, 'z');

  // ---------------------------------------------------------------- 建筑
  const CORE = slots.find((s) => s.id === 'c.hall-1') || { x: 0, z: 160, w: 76, d: 38 };
  const cX = CORE.x;
  const cZ = CORE.z;
  const cHw = CORE.w / 2;
  const cHd = CORE.d / 2;
  const BASE_Y = 4.5;            // royal 三层台基总高
  const BODY_TOP = BASE_Y + 12;  // royal 殿身顶
  const topZ = cHd + 2.4;        // 顶层台基半深
  const botX = cHw + 13.4;       // 底层台基半宽
  const botZ = cHd + 13.4;
  const DOOR_HX = 13;            // 南面门洞半宽

  // 核心寝殿的碰撞体：台基两侧实体 + 殿身四壁（南面正中留门洞），保证第一人称能走进
  function coreHallCollision() {
    ob([cX - botX, 0, cZ - botZ], [cX - DOOR_HX, BASE_Y, cZ + botZ]);
    ob([cX + DOOR_HX, 0, cZ - botZ], [cX + botX, BASE_Y, cZ + botZ]);
    ob([cX - DOOR_HX, 0, cZ + topZ], [cX + DOOR_HX, BASE_Y, cZ + botZ]);
    ob([cX - cHw, BASE_Y, cZ - cHd], [cX - cHw + 1.0, BODY_TOP, cZ + cHd]);
    ob([cX + cHw - 1.0, BASE_Y, cZ - cHd], [cX + cHw, BODY_TOP, cZ + cHd]);
    ob([cX - cHw, BASE_Y, cZ + cHd - 1.0], [cX + cHw, BODY_TOP, cZ + cHd]);
    ob([cX - cHw, BASE_Y, cZ - cHd], [cX - DOOR_HX, BODY_TOP, cZ - cHd + 1.0]);
    ob([cX + DOOR_HX, BASE_Y, cZ - cHd], [cX + cHw, BODY_TOP, cZ - cHd + 1.0]);
  }

  // kit.hall 的单檐分支调用 roof() 时漏传 h（o.h 为 undefined），会生成全部为 NaN 的
  // 屋面与脊饰网格，进而使该栋包围盒与障碍盒变成 NaN（同样影响 b.mid-hall/b.rear-hall、
  // f.hall-garden 等所有单檐 hall）。本段只在检测到 NaN 时剔除坏网格并补一版参数完整的
  // 屋顶，bounds 随后按修复后的 group 重算；kit 修复后本段自动失效（不产生重复屋顶）。
  const stripNaN = (group) => {
    const bad = [];
    group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes.position) {
        const arr = o.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i++) {
          if (!Number.isFinite(arr[i])) { bad.push(o); break; }
        }
      }
    });
    for (const o of bad) if (o.parent) o.parent.remove(o);
    return bad.length;
  };

  for (const slot of slots) {
    const res = kit.building(slot);
    root.add(res.group);

    if (slot.kind === 'hall' && !slot.double && stripNaN(res.group) > 0) {
      const t = kit.tier(slot.tier);
      const bY = slot.terrace ? t.terrace : 0.9;
      const roof = kit.roof({ w: slot.w + 3.4, d: slot.d + 3, h: t.roof });
      roof.position.y = bY + t.body + 0.2;
      res.group.add(roof);
    }

    // 按修复后的实际几何重算包围盒
    res.group.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(res.group);
    const bmin = [bb.min.x, bb.min.y, bb.min.z];
    const bmax = [bb.max.x, bb.max.y, bb.max.z];

    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: zone.id,
      rot: slot.rot || 0,
      visitable: !!slot.visitable,
      info: slot.info || '',
      entrance: [slot.x, bb.max.y * 0.35, slot.z],
      bounds: { min: bmin, max: bmax }
    });

    if (slot.id === 'c.hall-1') {
      coreHallCollision();
    } else if (slot.kind === 'courtyardGate') {
      // 门殿：南面正中留门洞，中轴可通行
      const gw = Math.max(9, slot.w * 0.34);
      ob([bb.min.x, bb.min.y, bb.min.z], [-gw / 2, bb.max.y, bb.max.z]);
      ob([gw / 2, bb.min.y, bb.min.z], [bb.max.x, bb.max.y, bb.max.z]);
    } else {
      ob(bmin, bmax);
    }

    if (slot.kind === 'hall' || slot.kind === 'gateHall' || slot.kind === 'pavilion' || slot.kind === 'courtyardGate') {
      lightAnchors.push({
        id: `${slot.id}.lamp`,
        type: 'lantern',
        position: [slot.x, bb.max.y * 0.55, slot.z],
        color: 0xffb46b,
        intensity: slot.tier === 'royal' ? 9 : 5
      });
    }
  }

  // ---------------------------------------------------------------- 寝殿大台阶与内景
  const stepH = 0.45;   // ≤ config.FP.step（0.55）
  const steps = 10;
  const stepD = 1.4;
  const stairW = 26;
  const stairTopZ = cZ - topZ; // 顶层台基前缘
  const stairGroup = kit.stairs({ x: 0, z: 0, w: stairW, steps, stepH, stepD });
  stairGroup.position.set(cX, 0, stairTopZ - stepD);
  root.add(stairGroup);
  for (let i = 0; i < steps; i++) {
    const zc = stairTopZ - stepD + (-stepD * (steps - 1) + i * stepD + stepD / 2);
    sf(`c.hall-1.stair.${i}`, cX - stairW / 2, zc - stepD / 2, cX + stairW / 2, zc + stepD / 2, stepH * (i + 1), 'stairs');
  }

  // 台基顶面可行走通道
  sf('c.hall-1.terrace', cX - DOOR_HX, cZ - topZ, cX + DOOR_HX, cZ + topZ, BASE_Y, 'terrace');
  // 室内地面
  sf('c.hall-1.interior', cX - 36, cZ - 17, cX + 36, cZ + 17, BASE_Y + 0.3, 'interior');

  // 室内陈设（寝殿：床榻、屏风、盘龙柱、藻井）
  const chamber = kit.interior({ kind: 'chamber', x: cX, z: cZ, w: 72, d: 34 });
  chamber.position.set(cX, BASE_Y, cZ);
  root.add(chamber);
  lightAnchors.push({
    id: 'c.hall-1.window',
    type: 'window',
    position: [cX, BASE_Y + 3.6, cZ],
    color: 0xffd9a0,
    intensity: 4
  });

  // ---------------------------------------------------------------- 树木
  const pines = [
    { x: -108, z: 78, s: jitter(1.0) }, { x: -104, z: 92, s: jitter(0.9) },
    { x: -110, z: 150, s: jitter(1.05) }, { x: -106, z: 210, s: jitter(0.95) },
    { x: 108, z: 78, s: jitter(1.0) }, { x: 104, z: 92, s: jitter(0.9) },
    { x: 110, z: 150, s: jitter(1.05) }, { x: 106, z: 210, s: jitter(0.95) },
    { x: -104, z: 272, s: jitter(1.0) }, { x: 104, z: 272, s: jitter(0.95) }
  ];
  const broads = [
    { x: -100, z: 70, s: jitter(0.9), r: 0.4 }, { x: 100, z: 70, s: jitter(0.9), r: 1.2 },
    { x: -108, z: 250, s: jitter(0.85), r: 0.7 }, { x: 108, z: 250, s: jitter(0.9), r: 0.2 },
    { x: -99, z: 280, s: jitter(0.8), r: 1.5 }, { x: 99, z: 280, s: jitter(0.85), r: 0.9 }
  ];
  root.add(kit.treeCluster(pines, 'pine'));
  root.add(kit.treeCluster(broads, 'broad'));

  // ---------------------------------------------------------------- 陈设与小品
  const lanternList = [];
  for (const z of [80, 118, 200, 235, 275]) {
    lanternList.push({ x: -15, z });
    lanternList.push({ x: 15, z });
  }
  root.add(kit.props({ kind: 'lantern', list: lanternList }));

  root.add(kit.props({ kind: 'censer', x: 0, z: 120 }));
  root.add(kit.props({ kind: 'censer', x: 0, z: 205 }));
  lightAnchors.push({ id: 'c.censer.south', type: 'censer', position: [0, 2.2, 120], color: 0xffa050, intensity: 2 });

  root.add(kit.props({ kind: 'lion', at: [-11, 92, 0] }));
  root.add(kit.props({ kind: 'lion', at: [11, 92, 0] }));

  const rockList = [
    { x: -104, z: 82, s: 2.0, r: 0.3 },
    { x: -109, z: 76, s: 1.4, r: 1.1 },
    { x: 105, z: 272, s: 2.1, r: 0.6 },
    { x: 110, z: 266, s: 1.5, r: 1.4 }
  ];
  root.add(kit.props({ kind: 'rock', list: rockList }));
  ob([-112, 0, 74], [-100, 3.0, 86]);
  ob([101, 0, 262], [113, 3.2, 276]);

  // ---------------------------------------------------------------- 地面可行走面
  sf('ground.inner', zone.minX, 58, zone.maxX, 298, 0, 'ground');

  // ---------------------------------------------------------------- 连接
  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
  }

  // ---------------------------------------------------------------- 机位
  viewpoints.push({
    id: 'zone.inner',
    name: '后宫',
    mode: 'zone',
    position: [0, 118, -6],
    target: [0, 24, 200],
    fov: 40
  });
  viewpoints.push({
    id: 'fp.inner',
    name: '后宫·第一人称出生点',
    mode: 'fp-spawn',
    position: [0, 0, 70],
    target: [0, 1.65, 160]
  });
  viewpoints.push({
    id: 'interior.inner',
    name: '坤宁寝殿内景',
    mode: 'interior',
    position: [cX, BASE_Y + 2.8, cZ + 10],
    target: [cX, BASE_Y + 0.8, cZ - 22],
    fov: 58,
    area: { minX: cX - 26, maxX: cX + 26, minZ: cZ - 15, maxZ: cZ + 15 }
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
