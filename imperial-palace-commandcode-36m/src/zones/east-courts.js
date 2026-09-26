// E · 东宫苑（分区 E）
// 四组东侧院落，各含院门、正殿、南北配房、连接步道与围合内墙。
// 与西宫苑 D 刻意区分，不做机械镜像：
//   · 节奏：西侧一条南北御道串联四院，院落再向东进深展开；院内再加方亭、水景与花木。
//   · 主题：一院「文华」、二院「陈设」、三院「起居」、四院「花木」；展示设定，非史实断言。
//   · 差异点：阔叶树多于松柏、院内设方亭与水塘、假山陈设更密、以石灯/铜炉/石狮/旗幡组合。
// 统一约束：色调、模数与屋顶等级全部取自 kit.materials（config.PALETTE），与全场一致。
// 本区只负责自有院落的内墙与道路；外宫墙、城门、护城河、地形归 F，不在此生成。

export const STUB = false;

// 与 layout.SIDE_COURT_Z 冻结值一致的四院中心 Z
const COURT_Z = [-250, -100, 50, 200];
// 四院主题名（仅用于说明/命名）
const COURT_THEME = ['文华', '陈设', '起居', '花木'];

export async function createZone(ctx) {
  const { THREE, kit, layout, zone, slots, corridors, roads } = ctx;

  // 固定随机序列，便于复现与截图比对
  let rand = Math.random;
  if (typeof ctx.rng === 'function') {
    const r = ctx.rng(`zone-${zone.id}`);
    if (typeof r === 'function') rand = r;
  }

  const root = new THREE.Group();
  root.name = `zone-${zone.id}`;

  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];

  const ob = (min, max) => obstacles.push({ min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] });
  const sf = (id, minX, minZ, maxX, maxZ, y, kind) =>
    surfaces.push({ id, min: [minX, 0, minZ], max: [maxX, 0, maxZ], y, kind });

  // ---------------------------------------------------------------- 关键几何量
  const STREET_X = 120;            // 西侧南北御道中心（衔接两个跨区便门）
  const STREET_W = 11;             // 御道宽
  const WALL_X = 128;              // 院落西墙（院门所在轴线）
  const REAR_X = 286;              // 院落东内墙
  const COURT_HZ = 70;             // 院落半进深（court.eN z 范围 = cz ± 70）
  const WALL_H = 4.6;
  const WALL_T = 1.6;
  const TERRACE_Y = 1.8;           // major 单层台基高（与 kit.TIERS.major.terrace 一致）

  // ---------------------------------------------------------------- 铺地
  // layout 过滤后的道路（中轴横路、各院横向通路）直接落地
  for (const road of roads) root.add(kit.slabRect(road));

  // 西侧南北御道：串联四院院门与两个跨区便门；抬高 0.12 避免与道路共面闪烁
  const street = kit.slabRect({
    x: STREET_X,
    z: (zone.minZ + zone.maxZ) / 2,
    w: STREET_W,
    d: (zone.maxZ - zone.minZ) - 10,
    kind: 'path'
  });
  street.position.y = 0.12;
  root.add(street);

  // 各院进院石道（自御道穿过院门向东）：抬高 0.18，避免与道路、御道共面
  for (const cz of COURT_Z) {
    const apron = kit.slabRect({ x: 134, z: cz, w: 40, d: 16, kind: 'path' });
    apron.position.y = 0.18;
    root.add(apron);
  }

  // ---------------------------------------------------------------- 廊庑（ctx.corridors）
  // 每院南侧一列东西向廊庑；只登记廊顶作为遮挡，柱间可通行
  for (const cor of corridors) {
    const g = kit.corridor({ x: 0, z: 0, len: cor.len, w: 5.4, h: 4.4 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
    const half = cor.len / 2;
    if (cor.axis === 'z') ob([cor.x - 3.0, 3.3, cor.z - half], [cor.x + 3.0, 4.6, cor.z + half]);
    else ob([cor.x - half, 3.3, cor.z - 3.0], [cor.x + half, 4.6, cor.z + 3.0]);
  }

  // ---------------------------------------------------------------- 院落内墙
  const addWall = (x, z, len, axis) => {
    const g = kit.wall({ x: 0, z: 0, len, h: WALL_H, t: WALL_T });
    g.position.set(x, 0, z);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    root.add(g);
    const t = WALL_T / 2 + 0.35;
    if (axis === 'z') ob([x - t, 0, z - len / 2], [x + t, WALL_H, z + len / 2]);
    else ob([x - len / 2, 0, z - t], [x + len / 2, WALL_H, z + t]);
  };
  const N_WALL_CX = (WALL_X + REAR_X) / 2; // 207
  const N_WALL_LEN = REAR_X - WALL_X;      // 158
  for (const cz of COURT_Z) {
    // 北 / 南院墙（东起东内墙，西止院门轴线，不越过御道）
    addWall(N_WALL_CX, cz + COURT_HZ, N_WALL_LEN, 'x');
    addWall(N_WALL_CX, cz - COURT_HZ, N_WALL_LEN, 'x');
    // 东内墙（临外宫墙一侧）
    addWall(REAR_X, cz, COURT_HZ * 2, 'z');
    // 西院墙：院门（z = cz ± 26 由 kit.courtyardGate 的门楼与翼墙填充）之外两段
    addWall(WALL_X, cz + 48, 44, 'z');
    addWall(WALL_X, cz - 48, 44, 'z');
  }

  // ---------------------------------------------------------------- 建筑落地
  // kit 根因已修复（单檐 hall 的屋顶 h 缺失、merge 实例父级变换均已修正），直接信任 kit.building。
  function placeBuilding(slot) {
    const res = kit.building(slot);
    root.add(res.group);
    res.group.updateMatrixWorld(true);
    const bb = res.bounds;
    const min = [bb.min.x, bb.min.y, bb.min.z];
    const max = [bb.max.x, bb.max.y, bb.max.z];

    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: zone.id,
      rot: slot.rot || 0,
      visitable: !!slot.visitable,
      info: slot.info || '',
      entrance: [slot.x, Math.max(1, res.height * 0.35), slot.z],
      bounds: { min, max }
    });

    const r = ((Math.round(slot.rot || 0) % 360) + 360) % 360;
    const xSpan = r === 0 || r === 180 ? slot.w : slot.d; // 世界 X 向尺寸
    const zSpan = r === 0 || r === 180 ? slot.d : slot.w; // 世界 Z 向尺寸

    if (/\.main$/.test(slot.id)) {
      // 正殿：台基可作为可行走面，殿身实体只阻挡台基面以上，西侧（朝向院落）设台阶
      const padX = xSpan / 2 + 2.4;
      const padZ = zSpan / 2 + 2.4;
      sf(`${slot.id}.terrace`, slot.x - padX, slot.z - padZ, slot.x + padX, slot.z + padZ, TERRACE_Y, 'terrace');
      ob([slot.x - xSpan / 2, TERRACE_Y, slot.z - zSpan / 2], [slot.x + xSpan / 2, res.height, slot.z + zSpan / 2]);

      const steps = 4;
      const stepH = 0.45; // ≤ config.FP.step（0.55）
      const stepD = 1.1;
      const stairW = Math.min(zSpan, 14);
      const originX = slot.x - padX - stepD; // 最高一级落在台基外缘
      const sg = kit.stairs({ x: 0, z: 0, w: stairW, steps, stepH, stepD });
      sg.position.set(originX, 0, slot.z);
      sg.rotation.y = Math.PI / 2; // 台阶自西（低）向东（高）升起，衔接台基
      root.add(sg);
      for (let i = 0; i < steps; i++) {
        const zc = -stepD * (steps - 1) + i * stepD + stepD / 2;
        sf(
          `${slot.id}.stair.${i}`,
          originX + zc - stepD / 2,
          slot.z - stairW / 2,
          originX + zc + stepD / 2,
          slot.z + stairW / 2,
          stepH * (i + 1),
          'stairs'
        );
      }
    } else if (slot.kind === 'courtyardGate') {
      // 院门：中部留 6m 东西通道，翼墙与门楼两侧作为障碍
      const cz = slot.z;
      const gap = 3;
      ob([min[0], Math.min(0, min[1]), min[2]], [max[0], max[1], cz - gap]);
      ob([min[0], Math.min(0, min[1]), cz + gap], [max[0], max[1], max[2]]);
    } else {
      ob([min[0], Math.min(0, min[1]), min[2]], [max[0], max[1], max[2]]);
    }

    if (slot.kind === 'hall' || slot.kind === 'gateHall' || slot.kind === 'pavilion') {
      lightAnchors.push({
        id: `${slot.id}.lamp`,
        type: 'lantern',
        position: [slot.x, Math.max(4, res.height * 0.55), slot.z],
        color: 0xffb46b,
        intensity: slot.tier === 'major' ? 8 : 4
      });
    }

    return { min, max };
  }

  for (const slot of slots) placeBuilding(slot); // layout.SLOTS.east 全部 16 个槽位

  // 额外方亭（真实独立建筑，非拆件虚增）：一院「文华亭」、四院「花木亭」
  const extraSlots = [
    { id: 'e.c1.pavilion', zone: 'east', kind: 'pavilion', name: '文华亭', x: 185, z: COURT_Z[0], w: 16, d: 16, bays: 3, rot: 0, tier: 'minor', info: '文华院内方亭，展读与陈设。' },
    { id: 'e.c4.pavilion', zone: 'east', kind: 'pavilion', name: '花木亭', x: 185, z: COURT_Z[3], w: 16, d: 16, bays: 3, rot: 0, tier: 'minor', info: '花木院内方亭，临花木与水景。' }
  ];
  for (const slot of extraSlots) placeBuilding(slot);

  // ---------------------------------------------------------------- 水景（三院）
  root.add(kit.props({ kind: 'pond', x: 205, z: COURT_Z[2], r: 18, seed: 1 }));
  ob([205 - 18, 0, COURT_Z[2] - 18], [205 + 18, 0.45, COURT_Z[2] + 18]);

  // ---------------------------------------------------------------- 陈设与小品
  // 铜香炉（正殿西侧台阶前）
  for (const cz of COURT_Z) {
    root.add(kit.props({ kind: 'censer', x: 230, z: cz + 8, y: 0 }));
    root.add(kit.props({ kind: 'censer', x: 230, z: cz - 8, y: 0 }));
    lightAnchors.push({ id: `e.censer.${cz}`, type: 'censer', position: [230, 2.2, cz + 8], color: 0xffa050, intensity: 2 });
  }
  // 石狮（院门内两侧，面向御道）
  for (const cz of COURT_Z) {
    root.add(kit.props({ kind: 'lion', at: [140, cz + 9, Math.PI / 2] }));
    root.add(kit.props({ kind: 'lion', at: [140, cz - 9, Math.PI / 2] }));
    ob([138, 0, cz + 8], [142, 3.0, cz + 10]);
    ob([138, 0, cz - 10], [142, 3.0, cz - 8]);
  }
  // 旗幡（院门外两侧）
  for (const cz of COURT_Z) {
    root.add(kit.props({ kind: 'banner', at: [134, cz + 15], ry: 0 }));
    root.add(kit.props({ kind: 'banner', at: [134, cz - 15], ry: Math.PI }));
  }
  // 石灯（院内通路两侧）
  const lampList = [];
  for (const cz of COURT_Z) {
    for (const x of [152, 182, 212, 242]) {
      lampList.push({ x, z: cz + 12 });
      lampList.push({ x, z: cz - 12 });
    }
  }
  root.add(kit.props({ kind: 'lantern', list: lampList }));
  // 假山（院内东北 / 东南角）
  const rockList = [];
  for (const cz of COURT_Z) {
    rockList.push({ x: 278, z: cz + 58, s: 2.0, r: 0.3 });
    rockList.push({ x: 273, z: cz + 52, s: 1.4, r: 1.0 });
    rockList.push({ x: 278, z: cz - 56, s: 1.8, r: 0.6 });
    rockList.push({ x: 272, z: cz - 50, s: 1.2, r: 1.3 });
    ob([268, 0, cz + 48], [284, 3.2, cz + 62]);
    ob([266, 0, cz - 60], [284, 3.0, cz - 46]);
  }
  root.add(kit.props({ kind: 'rock', list: rockList }));

  // ---------------------------------------------------------------- 树木
  // 拒绝采样：避让建筑、廊庑、院墙、道路与水面；阔叶为主以呼应文华/花木主题
  // keep 项格式统一为 [minX, maxX, minZ, maxZ]
  const keep = [[112, 132, zone.minZ - 10, zone.maxZ + 10]]; // 御道走廊
  for (const b of buildings) {
    keep.push([b.bounds.min[0] - 3, b.bounds.max[0] + 3, b.bounds.min[2] - 3, b.bounds.max[2] + 3]);
  }
  for (const cz of COURT_Z) {
    keep.push([122, 284, cz + COURT_HZ - 5, cz + COURT_HZ + 3]); // 北院墙
    keep.push([122, 284, cz - COURT_HZ - 3, cz - COURT_HZ + 5]); // 南院墙
    keep.push([278, 292, cz - COURT_HZ - 4, cz + COURT_HZ + 4]); // 东内墙
    keep.push([124, 290, cz - 64, cz - 57]);                     // 南侧廊庑
    keep.push([116, 286, cz - 12, cz + 12]);                     // 院内横向通路
  }
  keep.push([183, 227, COURT_Z[2] - 20, COURT_Z[2] + 20]); // 水塘
  keep.push([110, 300, -14, 14]);   // z=0 横路
  keep.push([110, 300, 197, 223]);  // z=210 横路
  const inKeep = (x, z) => keep.some((k) => x > k[0] && x < k[1] && z > k[2] && z < k[3]);
  const pines = [];
  const broads = [];
  let guard = 0;
  while (pines.length + broads.length < 104 && guard < 8000) {
    guard++;
    const cz = COURT_Z[Math.floor(rand() * COURT_Z.length)];
    const x = 134 + rand() * (282 - 134);
    const z = cz - (COURT_HZ - 4) + rand() * (COURT_HZ - 4) * 2;
    if (inKeep(x, z)) continue;
    const s = 0.8 + rand() * 0.4;
    if (rand() < 0.58) broads.push({ x, z, s, r: rand() * Math.PI * 2 });
    else pines.push({ x, z, s });
  }
  if (pines.length) root.add(kit.treeCluster(pines, 'pine'));
  if (broads.length) root.add(kit.treeCluster(broads, 'broad'));

  // ---------------------------------------------------------------- 可行走面（地面）
  sf('ground.east', zone.minX, zone.minZ, zone.maxX, zone.maxZ, 0, 'ground');

  // ---------------------------------------------------------------- 连接（owner === east）
  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
    // 便门与御道之间的衔接支路
    const link = kit.slabRect({ x: 119, z: c.z, w: 16, d: 12, kind: 'path' });
    link.position.y = 0.16;
    root.add(link);
  }

  // ---------------------------------------------------------------- 机位
  const zv = (layout.ZONE_VIEWS && layout.ZONE_VIEWS['zone.east']) || {};
  viewpoints.push({
    id: 'zone.east',
    name: zv.name || '东宫苑',
    mode: 'zone',
    position: (zv.position || [430, 158, -40]).slice(),
    target: (zv.target || [205, 8, -70]).slice(),
    fov: zv.fov || 40
  });
  viewpoints.push({
    id: 'fp.east',
    name: '东宫苑·第一人称出生点',
    mode: 'fp-spawn',
    position: [117, 0, -100],
    target: [252, 1.65, -100],
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
