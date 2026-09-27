/**
 * garden-boundary.js — F 区：御花园、宫城边界与水系（t8 zone-garden）
 * =============================================================================
 * 对应计划：§2.2 布局示意、§2.3 坐标/边界/连接规则、§3.1 风格基线、§5.5 御花园·边界·水系、
 *           §6.1 模块契约、§6.4 八视角与第一人称、§8.2 预算（F 区 ≤80 绘制调用）。
 *
 * 本区独占（layout.js 归属 F 的全部槽位与构件，逐 id 实现，不越界）：
 *   1. 宫城四周红墙 4 段（门洞由 layout 自动派生）+ 四角角楼 + 4 面外城门
 *      （南/北主门 = 重檐庑殿 grade 3；东/西侧门 = 歇山 grade 2 —— 有层级差异）；
 *   2. 护城河环（4 段水体，闭合、不终止）+ 4 座入城桥 + 桥引坡 + 城门内带步道；
 *   3. 基底地形：外侧地形、墙外岸台环、城门内带、花园地坪、池底、护城河河槽；
 *   4. 御花园：中央亭阁、北殿、东西亭、东西配殿、东西廊、假山 2、照壁 1、水池 2、
 *      曲折步道（自生成 Catmull-Rom 样条）、树群（实例化）、宫灯（实例化）；
 *   5. 全部 F-owned `CONNECTORS`（15）按登记位置/宽度/标高回显，与 B/C/D/E 对齐。
 *
 * 纪律：
 *   - 数值只取自 `src/shared/config.js`（模数/标高/预算）与 `src/shared/layout.js`（槽位/墙/水系/道路/机位）；
 *   - 不使用 `Math.random`，随机性来自 `ctx.rng`（`config.deriveSeed` 派生，可复现）；
 *   - 不自行挂载 scene、不建第二套灯光、不改 state/相机；`update()` 只做自有对象的轻量维护；
 *   - `dispose()` 只释放本区自有/一次性几何，**不销毁 kit 共享材质**（kit 材质是全场共享资源）。
 *
 * 几何落位口径（与 CONTRACTS §4.1 一致）：
 *   - `layout.SLOTS.baseY` 语义 = 台基顶；kit 的组原点 = `baseY - terraceH`；
 *   - layout 对"墙上建筑"已给 `baseY = wallHeight + terraceH`（落于墙顶 12m，正确）；
 *   - 但 layout 对普通槽位隐含"地面 = 0"，而 F 的花园地坪是 `TERRAIN.gardenPathsY = 0.5`，
 *     故本区对**非 onWall** 槽位传 `baseY + 本地地坪`，避免台基半埋/台阶入地（返回的 buildings[]
 *     仍逐字段回显 layout，只额外附实测 `worldBounds`）。
 */

import * as THREE_FALLBACK from 'three';
import { CONFIG, MODULES, TERRAIN, deriveSeed } from '../shared/config.js';
import * as LAYOUT_MODULE from '../shared/layout.js';

export const ZONE_ID = 'F';
export const ZONE_NAME = '御花园、宫墙与边界';
export const ZONE_VERSION = '1.0.0';

const M = MODULES;
const T = TERRAIN;

/* -------------------------------------------------------------------------- */
/*  常量（全部由 config/layout 派生，不新增风格数值）                            */
/* -------------------------------------------------------------------------- */

/** 墙顶标高（= 城台顶面）；角楼与城门落于此。 */
const WALL_TOP = M.wallHeight;
/** 城门洞净高：墙身（扣女墙）再留出门额带，落在 layout 的 wall opening 之内。 */
const GATE_OPENING_HEIGHT = Math.min(WALL_TOP, WALL_TOP - M.wallBattlementHeight - 1.6);
/** 角楼城台（墙的加厚段）边长。 */
const CORNER_PLATFORM = 28;
/** 铺装相对登记标高的抬升（石作面层），≤4cm 不影响可行走性判定。 */
const PAVE_LIFT = 0.04;
/** 临水构件的净距。 */
const WATER_CLEARANCE = 0.02;
/** 地形体块向下延伸深度（保证从河道内看不到侧下方空腔）。 */
const LAND_DEPTH = 7;
const BELT_DEPTH = 1.2;
/** 护城河河底（layout: MOAT.waterY - MOAT.depth）。 */
const MOAT_BED_Y = LAYOUT_MODULE.MOAT.waterY - LAYOUT_MODULE.MOAT.depth;
/** 树最小间距（避免树冠互穿）。 */
const TREE_MIN_SEPARATION = 5;
/** 曲折步道宽。 */
const WINDING_PATH_WIDTH = 3.2;

/* -------------------------------------------------------------------------- */
/*  小工具：2D 矩形代数（世界坐标，轴对齐）                                      */
/* -------------------------------------------------------------------------- */

const rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
const rectCenter = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
const rectWidth = (r) => r.maxX - r.minX;
const rectDepth = (r) => r.maxZ - r.minZ;
const containsPoint = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const intersect2D = (a, b) => {
  const out = rect(Math.max(a.minX, b.minX), Math.min(a.maxX, b.maxX), Math.max(a.minZ, b.minZ), Math.min(a.maxZ, b.maxZ));
  return out.minX < out.maxX && out.minZ < out.maxZ ? out : null;
};
/** 轴对齐矩形相减：r - hole（0–4 块）。 */
function subtractRect(r, hole) {
  const inter = intersect2D(r, hole);
  if (!inter) return [r];
  const out = [];
  if (inter.minZ > r.minZ) out.push(rect(r.minX, r.maxX, r.minZ, inter.minZ));
  if (inter.maxZ < r.maxZ) out.push(rect(r.minX, r.maxX, inter.maxZ, r.maxZ));
  if (inter.minX > r.minX) out.push(rect(r.minX, inter.minX, inter.minZ, inter.maxZ));
  if (inter.maxX < r.maxX) out.push(rect(inter.maxX, r.maxX, inter.minZ, inter.maxZ));
  return out;
}
const round3 = (v) => +v.toFixed(3);
const roundRect = (r) => ({ minX: round3(r.minX), maxX: round3(r.maxX), minZ: round3(r.minZ), maxZ: round3(r.maxZ) });

/** 点到线段距离（道路中心线避让用）。 */
function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/** 道路在参数 t 处的登记标高。 */
const roadYAt = (road, t) => road.from.y + (road.to.y - road.from.y) * t;

function countMeshes(object) {
  let n = 0;
  object.traverse((node) => {
    if (node.isMesh || node.isInstancedMesh || node.isPoints) n += 1;
  });
  return n;
}
function countTrianglesOf(object) {
  let n = 0;
  object.traverse((node) => {
    if (!node.isMesh) return;
    const geo = node.geometry;
    if (!geo) return;
    const count = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
    n += Math.floor(count / 3) * (node.isInstancedMesh ? node.count : 1);
  });
  return n;
}

/* -------------------------------------------------------------------------- */
/*  kit 解析：优先 ctx.kit；灰盒替身时升级为 t3 真 kit，再退化为同材质盒体          */
/* -------------------------------------------------------------------------- */

async function resolveKit(ctx) {
  const provided = ctx?.kit ?? null;
  if (provided && typeof provided.mergeZone === 'function' && typeof provided.paving === 'function') {
    return { kit: provided, source: 'ctx.kit' };
  }
  if (provided && provided.__fallback !== true) return { kit: provided, source: 'ctx.kit(部分)' };
  try {
    const mod = await import('../kit/index.js');
    if (mod && typeof mod.createKit === 'function') {
      const kit = mod.createKit({ THREE: ctx.THREE, config: ctx.config, quality: ctx.quality });
      return { kit, source: `ctx.kit(灰盒替身→src/kit/index.js v${mod.KIT_VERSION ?? '?'})` };
    }
  } catch {
    /* t3 kit 不可用：继续用替身 + 本地盒体兜底 */
  }
  return { kit: provided, source: 'ctx.kit(灰盒替身，本地盒体兜底)' };
}

/* -------------------------------------------------------------------------- */
/*  区域入口                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 区域入口（CONTRACTS §3.1）。
 * @param {object} ctx { THREE, config, zoneLayout, kit, assets, rng, events, quality, shared, layout }
 */
export async function createZone(ctx) {
  const THREE = ctx?.THREE ?? THREE_FALLBACK;
  const config = ctx?.config ?? CONFIG;
  const L = ctx?.layout ?? LAYOUT_MODULE;
  const zoneLayout = ctx?.zoneLayout;
  if (!zoneLayout) throw new Error('garden-boundary: ctx.zoneLayout 缺失（由 src/core/context.js 提供）');

  const { kit, source: kitSource } = await resolveKit(ctx);
  if (!kit) throw new Error('garden-boundary: 缺少 ctx.kit');
  const materials = kit.materials;
  const matOf = (key) => {
    const m = materials?.get?.(key);
    if (!m) throw new Error(`garden-boundary: kit 缺少材质 ${key}`);
    return m;
  };
  const rng = typeof ctx?.rng?.fork === 'function' ? ctx.rng.fork('garden-boundary') : ctx?.rng;

  const root = new THREE.Group();
  root.name = `zone-root:${ZONE_ID}`;

  /** 审计记录：供 tests/zone-garden.test.mjs 做闭合/不穿插/落地/预算的机器校验。 */
  const audit = {
    zoneId: ZONE_ID,
    version: ZONE_VERSION,
    land: [],
    water: [],
    walls: [],
    platforms: [],
    roads: [],
    path: [],
    bridges: [],
    props: [],
    buildings: [],
    supports: [],
    interiors: [],
    trees: { count: 0, blossom: 0, instances: [], minSeparation: TREE_MIN_SEPARATION, points: [] },
    notes: [],
  };
  const diagnostics = [];
  const note = (code, message, data = null) => diagnostics.push({ code, message, data });
  /** 落底结构体清单（桥墩/桥台/栈道支墩/水中灯座）——供"临水构件必须落地"校验。 */
  const supports = [];

  /* ---------------------------------------------------------------- 材质角色 */
  const MAT = {
    outerGround: 'pavingPlaza',
    apronGround: 'pavingRoad',
    gardenGround: 'foliage',
    pondBed: 'pavingDark',
    water: 'waterSurface',
    paving: 'pavingRoad',
    pavingStone: 'pavingStone',
    kerb: 'terraceStone',
    platform: 'wallBase',
    pier: 'terraceStone',
  };

  /* ---------------------------------------------------------------- 基础工厂 */
  /** 铺装/地面盒体：`top` = 上表面标高，`bottom` = 下表面标高（世界坐标，米）。 */
  function pavePiece({ id, name, w, d, x, z, top, bottom, material, rotationYDeg = 0, part = 'paving' }) {
    const thickness = Math.max(0.01, top - bottom);
    if (typeof kit.paving === 'function') {
      const g = kit.paving({ id, name: name ?? id, w, d, x, z, y: top, thickness, material, rotationYDeg });
      g.userData.garden = { id, top, bottom, material };
      return g;
    }
    // 兜底路径（仅当 t3 的 kit 完全不可用）：与 kit 同材质的自建盒体
    const geo = new THREE.BoxGeometry(w, thickness, d);
    geo.translate(0, top - thickness / 2, 0);
    geo.userData.zoneOwned = true;
    const mesh = new THREE.Mesh(geo, matOf(material));
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    const group = new THREE.Group();
    group.name = id;
    group.add(mesh);
    group.rotation.y = (rotationYDeg * Math.PI) / 180;
    group.position.set(x, 0, z);
    group.userData.garden = { id, top, bottom, material, fallbackBox: true };
    return group;
  }

  /** 不算"地面"的体量：城台/门额、桥墩、桥台、栈道支墩（结构体）与池底（水下）。 */
  const NOT_GROUND_GROUPS = new Set(['platform', 'support', 'bridgePier', 'bridgeAbutment', 'pondBed']);
  /** 需要做"临水构件必须落地"校验的结构体。 */
  const SUPPORT_GROUPS = new Set(['support', 'bridgePier', 'bridgeAbutment']);

  function addLand(id, r, top, bottom, material, group = 'land') {
    root.add(pavePiece({ id, w: rectWidth(r), d: rectDepth(r), x: rectCenter(r).x, z: rectCenter(r).z, top, bottom, material }));
    const record = { id, rect: roundRect(r), y0: round3(bottom), y1: round3(top), material, group };
    audit.land.push(record);
    if (SUPPORT_GROUPS.has(group)) audit.supports.push(record);
    return record;
  }
  function addWater(id, r, top, bottom) {
    root.add(pavePiece({ id, w: rectWidth(r), d: rectDepth(r), x: rectCenter(r).x, z: rectCenter(r).z, top, bottom, material: MAT.water }));
    audit.water.push({ id, rect: roundRect(r), y0: round3(bottom), y1: round3(top) });
  }
  const waterRects = () => audit.water;

  /** 该点所在地面的顶面标高（水体上方/结构体上方不算地面 → null）。 */
  function landTopAt(x, z) {
    let top = null;
    for (const s of audit.land) {
      if (NOT_GROUND_GROUPS.has(s.group)) continue;
      if (!containsPoint(s.rect, x, z)) continue;
      if (top === null || s.y1 > top) top = s.y1;
    }
    return top;
  }
  function waterAt(x, z) {
    for (const w of audit.water) if (containsPoint(w.rect, x, z)) return w;
    return null;
  }
  /**
   * 铺装/点景的落地面：本区地面优先；落在邻区（如东西侧门内那 9m 属 D/E 地坪）时，
   * 用 layout 的 tile 标高（`groundYAt`，如 sideCourtY=0.4）对齐，保证道路连续且不悬空。
   */
  function groundTopAt(x, z) {
    const mine = landTopAt(x, z);
    if (mine !== null) return { y: mine, source: 'zone' };
    const tile = typeof L.groundYAt === 'function' ? L.groundYAt(x, z) : null;
    if (tile !== null) return { y: tile, source: 'neighborTile' };
    return { y: T.cityGroundY, source: 'fallback' };
  }

  /* ======================================================================== */
  /*  1. 基底地形                                                              */
  /* ======================================================================== */

  const ENV = L.ENVELOPE;
  const MOAT = L.MOAT;

  // 1.1 外侧地形（护城河以外）
  for (const [id, r] of [
    ['F-ground-outer-south', rect(-420, 420, -560, -506)],
    ['F-ground-outer-north', rect(-420, 420, 506, 560)],
    ['F-ground-outer-west', rect(-420, -366, -506, 506)],
    ['F-ground-outer-east', rect(366, 420, -506, 506)],
  ]) {
    addLand(id, r, T.outerTerrainY, T.outerTerrainY - LAND_DEPTH, MAT.outerGround, 'outerTerrain');
  }

  // 1.2 墙外岸台环（护城河内边界 → 包络；标高 = WK-F-berm-* 的 cityGroundY）
  for (const [id, r] of [
    ['F-ground-apron-south', rect(-332, 332, -472, ENV.minZ)],
    ['F-ground-apron-north', rect(-332, 332, ENV.maxZ, 472)],
    ['F-ground-apron-west', rect(-332, ENV.minX, ENV.minZ, ENV.maxZ)],
    ['F-ground-apron-east', rect(ENV.maxX, 332, ENV.minZ, ENV.maxZ)],
  ]) {
    addLand(id, r, T.cityGroundY, T.cityGroundY - LAND_DEPTH, MAT.apronGround, 'bermRing');
  }

  // 1.3 城门内带（包络内、墙内侧）
  addLand('F-ground-belt-south', rect(-300, 300, -450, -400), T.beltY, T.beltY - BELT_DEPTH, MAT.apronGround, 'belt');
  addLand('F-ground-belt-north', rect(-300, 300, 420, 450), T.beltY, T.beltY - BELT_DEPTH, MAT.apronGround, 'belt');

  // 1.4 花园地坪（扣除两个水池）
  const pondWest = rect(-250, -150, 318, 392);
  const pondEast = rect(150, 250, 318, 392);
  {
    let pieces = [rect(-300, 300, 300, 420)];
    for (const hole of [pondWest, pondEast]) pieces = pieces.flatMap((p) => subtractRect(p, hole));
    pieces.forEach((p, i) => addLand(`F-ground-garden-${i + 1}`, p, T.gardenPathsY, T.gardenPathsY - BELT_DEPTH, MAT.gardenGround, 'garden'));
    audit.notes.push(`花园地坪扣除水池后 ${pieces.length} 块（标高 ${T.gardenPathsY}）`);
  }

  // 1.5 水池池底（水面之下）
  addLand('F-pond-bed-west', pondWest, -0.4, -1.6, MAT.pondBed, 'pondBed');
  addLand('F-pond-bed-east', pondEast, -0.4, -1.6, MAT.pondBed, 'pondBed');

  // 1.6 护城河河槽水体（layout.MOAT.rects：闭合环，不终止）+ 水池水体
  for (const r of MOAT.rects) addWater(r.id, r.bounds, MOAT.waterY, MOAT_BED_Y);
  const pondBodies = L.WATER_BODIES.filter((w) => w.owner === 'F' && w.kind === 'pond');
  for (const w of pondBodies) addWater(w.id, w.bounds, w.y, -0.4);
  audit.notes.push(`水体 ${audit.water.length} 段（护城河 ${MOAT.rects.length} + 水池 ${pondBodies.length}）；河底 ${MOAT_BED_Y}，常水位 ${MOAT.waterY}`);

  // 1.7 护城河岸沿石（石砌岸壁压顶；桥位断开）
  {
    const kerbW = 1.6;
    const kerbH = 0.24;
    const gapSpan = 11;
    const gapSide = 9;
    const sMoat = MOAT.rects.find((r) => r.id === 'MOAT-south').bounds;
    const nMoat = MOAT.rects.find((r) => r.id === 'MOAT-north').bounds;
    const wMoat = MOAT.rects.find((r) => r.id === 'MOAT-west').bounds;
    const eMoat = MOAT.rects.find((r) => r.id === 'MOAT-east').bounds;
    const edges = [
      { id: 'F-kerb-moat-south-outer', r: rect(sMoat.minX + 1, sMoat.maxX - 1, sMoat.minZ - kerbW, sMoat.minZ), land: T.outerTerrainY, gap: 'x', half: gapSpan },
      { id: 'F-kerb-moat-south-inner', r: rect(-330.4, 330.4, sMoat.maxZ, sMoat.maxZ + kerbW), land: T.cityGroundY, gap: 'x', half: gapSpan },
      { id: 'F-kerb-moat-north-outer', r: rect(nMoat.minX + 1, nMoat.maxX - 1, nMoat.maxZ, nMoat.maxZ + kerbW), land: T.outerTerrainY, gap: 'x', half: gapSpan },
      { id: 'F-kerb-moat-north-inner', r: rect(-330.4, 330.4, nMoat.minZ - kerbW, nMoat.minZ), land: T.cityGroundY, gap: 'x', half: gapSpan },
      { id: 'F-kerb-moat-west-outer', r: rect(wMoat.minX - kerbW, wMoat.minX, -504, 504), land: T.outerTerrainY, gap: 'z', half: gapSide },
      { id: 'F-kerb-moat-west-inner', r: rect(wMoat.maxX, wMoat.maxX + kerbW, -470.4, 470.4), land: T.cityGroundY, gap: 'z', half: gapSide },
      { id: 'F-kerb-moat-east-outer', r: rect(eMoat.maxX, eMoat.maxX + kerbW, -504, 504), land: T.outerTerrainY, gap: 'z', half: gapSide },
      { id: 'F-kerb-moat-east-inner', r: rect(eMoat.minX - kerbW, eMoat.minX, -470.4, 470.4), land: T.cityGroundY, gap: 'z', half: gapSide },
    ];
    let kerbCount = 0;
    for (const e of edges) {
      const pieces = e.gap === 'x'
        ? [rect(e.r.minX, -e.half, e.r.minZ, e.r.maxZ), rect(e.half, e.r.maxX, e.r.minZ, e.r.maxZ)]
        : [rect(e.r.minX, e.r.maxX, e.r.minZ, -e.half), rect(e.r.minX, e.r.maxX, e.half, e.r.maxZ)];
      pieces.forEach((p, i) => {
        if (rectWidth(p) <= 0.2 || rectDepth(p) <= 0.2) return;
        addLand(`${e.id}-${i + 1}`, p, e.land + kerbH, e.land, MAT.kerb, 'kerb');
        kerbCount += 1;
      });
    }
    audit.notes.push(`护城河岸沿石 ${kerbCount} 段（桥位断开）`);
  }

  /* ======================================================================== */
  /*  2. 宫墙 4 段 + 城台（墙的加厚段）                                          */
  /* ======================================================================== */

  const citySlots = zoneLayout.slots;
  const gateSlots = citySlots.filter((s) => s.kind === 'gateHall');
  const towerSlots = citySlots.filter((s) => s.kind === 'cornerTower');
  const gardenSlots = citySlots.filter((s) => s.kind !== 'gateHall' && s.kind !== 'cornerTower');

  for (const wall of L.WALLS.filter((w) => w.cityWall === true)) {
    const midAlong = wall.axis === 'x' ? (wall.from.x + wall.to.x) / 2 : (wall.from.z + wall.to.z) / 2;
    const openings = wall.openings.map((o) => ({
      at: +(o.at - midAlong).toFixed(4),
      width: o.width,
      height: GATE_OPENING_HEIGHT,
      source: o.source,
    }));
    root.add(kit.wall({
      id: wall.id,
      name: wall.name,
      from: { x: wall.from.x, z: wall.from.z },
      to: { x: wall.to.x, z: wall.to.z },
      thickness: wall.thickness ?? M.wallThickness,
      height: wall.height ?? M.wallHeight,
      battlementHeight: M.wallBattlementHeight,
      kind: 'cityWall',
      baseY: T.cityGroundY,
      openings,
      detail: 'mid',
      source: 'layout.WALLS',
    }));
    audit.walls.push({
      id: wall.id,
      name: wall.name,
      axis: wall.axis,
      from: { x: wall.from.x, z: wall.from.z },
      to: { x: wall.to.x, z: wall.to.z },
      thickness: wall.thickness ?? M.wallThickness,
      height: wall.height ?? M.wallHeight,
      battlementHeight: M.wallBattlementHeight,
      y0: T.cityGroundY,
      y1: T.cityGroundY + (wall.height ?? M.wallHeight),
      rect: roundRect(wall.bounds),
      openings: openings.map((o) => ({ at: o.at, width: o.width, height: o.height, source: o.source })),
    });
  }
  audit.notes.push(`宫墙 ${audit.walls.length} 段、门洞 ${audit.walls.reduce((n, w) => n + w.openings.length, 0)} 个（门洞由 layout.WALLS.openings 派生）`);

  // 2.1 城门城台（门洞两侧墩体 + 门额 + 一侧"值房壁龛"）；2.2 角楼城台
  /**
   * t64：城门内景取**城台侧壁龛**（值房门房）——
   *   · 形制正确：门殿的值守案/长凳/更鼓/门闩本就在门内两侧的值房里，不该套殿堂陈设；
   *   · 硬约束：26m 通行横断面**零占用**（壁龛开在 |v| ≥ 门洞半宽之外，洞内 26m 净宽不变）；
   *   · 地面取 layout 登记的 `WK-<gate>-interior.y`（= 门洞通道面 0.4，t72），不是墙顶门房 12.4。
   */
  const GATE_NICHE = Object.freeze({ depth: 8, along: 10, height: 3.2, inset: 0.6 });
  const gateNiches = new Map();
  for (const gate of gateSlots) {
    const alongZ = gate.door?.axis === 'x'; // true：门洞沿 X 贯通（东西侧门）
    const perpExtent = alongZ ? gate.d : gate.w;
    const depthExtent = alongZ ? gate.w : gate.d;
    const passHalf = (gate.door?.width ?? 26) / 2;
    /** (u, v)：u 沿门洞轴、v 垂直门洞轴（自洞壁向外为正），相对城门中心。 */
    const uv = (u0, u1, v0, v1) => (alongZ
      ? rect(gate.x + u0, gate.x + u1, gate.z + v0, gate.z + v1)
      : rect(gate.x + v0, gate.x + v1, gate.z + u0, gate.z + u1));
    const wkFloor = L.WALKABLE.find((w) => w.id === `WK-${gate.id}-interior`);
    const floorY = wkFloor ? wkFloor.y : T.cityGroundY + 0.4;
    const nicheDepth = Math.max(4, Math.min(GATE_NICHE.depth, perpExtent / 2 - passHalf - 2));
    const nicheAlong = Math.max(6, Math.min(GATE_NICHE.along, depthExtent - 6));
    const v0 = passHalf;
    const v1 = passHalf + nicheDepth;
    const u0 = -nicheAlong / 2;
    const u1 = nicheAlong / 2;
    const pieces = [];
    if (u0 > -depthExtent / 2 + 0.01) pieces.push({ id: 'a', r: uv(-depthExtent / 2, u0, v0, v1), y0: T.cityGroundY, y1: WALL_TOP });
    if (u1 < depthExtent / 2 - 0.01) pieces.push({ id: 'b', r: uv(u1, depthExtent / 2, v0, v1), y0: T.cityGroundY, y1: WALL_TOP });
    if (v1 < perpExtent / 2 - 0.01) pieces.push({ id: 'c', r: uv(u0, u1, v1, perpExtent / 2), y0: T.cityGroundY, y1: WALL_TOP });
    pieces.push({ id: 'd', r: uv(u0, u1, v0, v1), y0: floorY + GATE_NICHE.height, y1: WALL_TOP }); // 龛上补砌
    pieces.push({ id: 'e', r: uv(-depthExtent / 2, depthExtent / 2, -perpExtent / 2, -passHalf), y0: T.cityGroundY, y1: WALL_TOP }); // 对侧实心墩
    pieces.push({ id: 'floor', r: uv(u0, u1, v0, v1), y0: T.cityGroundY, y1: floorY, material: MAT.pavingStone }); // 龛地坪（0 → 通道面）
    const blockRecords = pieces.map((pc) => addLand(`${gate.id}-platform-${pc.id}`, pc.r, pc.y1, pc.y0, pc.material ?? MAT.platform, 'platform'));
    const lintel = uv(-depthExtent / 2, depthExtent / 2, -passHalf, passHalf);
    const lintelRecord = addLand(`${gate.id}-lintel`, lintel, WALL_TOP, T.cityGroundY + GATE_OPENING_HEIGHT, MAT.platform, 'platform');
    gateNiches.set(gate.id, {
      rect: uv(u0, u1, v0, v1),
      floorY,
      ceilingY: floorY + GATE_NICHE.height,
      entrance: alongZ ? { x: gate.x, z: gate.z + v0 } : { x: gate.x + v0, z: gate.z },
      passageClearWidth: passHalf * 2,
      depth: nicheDepth,
      along: nicheAlong,
    });
    audit.platforms.push({
      id: `${gate.id}-platform`,
      purpose: 'gate',
      gateId: gate.id,
      top: WALL_TOP,
      passage: { axis: alongZ ? 'x' : 'z', center: { x: gate.x, z: gate.z }, width: passHalf * 2, height: GATE_OPENING_HEIGHT },
      niche: { rect: roundRect(gateNiches.get(gate.id).rect), floorY: round3(floorY), ceilingY: round3(floorY + GATE_NICHE.height), depth: round3(nicheDepth), along: round3(nicheAlong), alongZ },
      blocks: [...blockRecords, lintelRecord].map((b) => ({ id: b.id, rect: b.rect, y0: b.y0, y1: b.y1 })),
    });
  }
  for (const tower of towerSlots) {
    const half = CORNER_PLATFORM / 2;
    const rec = addLand(`${tower.id}-platform`, rect(tower.x - half, tower.x + half, tower.z - half, tower.z + half), WALL_TOP, T.cityGroundY, MAT.platform, 'platform');
    audit.platforms.push({
      id: `${tower.id}-platform`,
      purpose: 'corner',
      towerId: tower.id,
      top: WALL_TOP,
      blocks: [{ id: rec.id, rect: rec.rect, y0: rec.y0, y1: rec.y1 }],
    });
  }
  audit.notes.push(`城台 ${audit.platforms.length} 处（4 门 + 4 角），每处是墙的加厚体量（与墙段体量有意重叠）`);

  /* ======================================================================== */
  /*  3. 建筑（F 全部 14 槽位：角楼 4 / 城门 4 / 花园 6）                          */
  /* ======================================================================== */

  const BUILDING_FACTORY = {
    cornerTower: 'cornerTower',
    gateHall: 'gateHall',
    hall: 'hall',
    sideHall: 'sideHall',
    pavilion: 'pavilion',
    courtyardGate: 'courtyardGate',
  };

  const buildings = [];
  for (const slot of citySlots) {
    const factoryName = BUILDING_FACTORY[slot.kind];
    if (!factoryName || typeof kit[factoryName] !== 'function') {
      throw new Error(`garden-boundary: kit 缺少构件工厂 ${factoryName}（槽位 ${slot.id}）`);
    }
    const ground = slot.onWall ? { y: WALL_TOP, source: 'wallTop' } : groundTopAt(slot.x, slot.z);
    if (!slot.onWall && ground.source !== 'zone') note('building-neighbor-ground', `${slot.id} 落在邻区地坪（${ground.source}，y=${ground.y}）`);
    const groundTop = ground.y;
    const baseY = slot.onWall ? slot.baseY : +(slot.baseY + groundTop).toFixed(4);
    // F 区建筑用单档 mid：数量多、单栋体量小，合批后才有预算（LOD 三档会把批次 ×3）
    const object = kit[factoryName]({ ...slot, baseY, lod: 'mid', quality: ctx.quality });
    root.add(object);
    const kitMeta = object.userData?.kit ?? {};
    const worldBounds = kitMeta.worldBounds ?? null;
    buildings.push({
      ...slot,
      group: object,
      mesh: object,
      worldBounds,
      groundY: groundTop,
      geometryBaseY: baseY,
      metrics: kitMeta.metrics ?? null,
    });
    audit.buildings.push({
      id: slot.id,
      name: slot.name,
      kind: slot.kind,
      grade: slot.grade,
      roofType: slot.roofType,
      onWall: slot.onWall === true,
      rect: roundRect(slot.bounds),
      ground: groundTop,
      geometryBaseY: baseY,
      y0: worldBounds ? round3(worldBounds.minY) : null,
      y1: worldBounds ? round3(worldBounds.maxY) : null,
      worldBounds,
    });
  }
  audit.notes.push(`建筑 ${buildings.length} 栋（角楼 ${towerSlots.length} / 城门 ${gateSlots.length} / 花园 ${gardenSlots.length}）`);

  /* ======================================================================== */
  /*  3b. 室内陈设（t64：F 区 7 处内景 —— 4 城门值房壁龛 + 御花园北殿 + 东/西配殿）    */
  /* ======================================================================== */
  /* 集合以 layout 实测清单为准（`interiorsByZone('F')`；角楼/开敞亭不在其内）；
     套件不含灯光 ⇒ 本区按套件灯体公式另发 `windowGlow` 灯位，由 t2 环境系统按距离激活实时点光。 */
  const interiorRecords = typeof L.interiorsByZone === 'function' ? L.interiorsByZone(ZONE_ID) : [];
  const interiors = [];
  const interiorLightAnchors = [];
  const INTERIOR_KIND_BY_SLOT_KIND = Object.freeze({ gateHall: 'gateHall', hall: 'hall', sideHall: 'sideHall' });
  for (const rec of interiorRecords) {
    const slot = citySlots.find((sl) => sl.id === rec.slotId);
    const building = buildings.find((b) => b.id === rec.slotId);
    const kind = INTERIOR_KIND_BY_SLOT_KIND[slot?.kind];
    if (!slot || !building || !kind) {
      note('interior-skip', `${rec.slotId} 不在本区可布陈设集合（kind=${slot?.kind ?? '?'}）`);
      continue;
    }
    if (typeof kit.interiorSet !== 'function') {
      note('no-interior-factory', 'kit 缺少 interiorSet（t61 未就位）');
      break;
    }
    // 室内地面：以 layout 登记的**内景可行走面**为准（城门 = 门洞通道面 0.4；殿 = 台基顶）
    const wk = L.WALKABLE.find((w) => w.id === rec.walkableId);
    const groundY = wk ? wk.y : slot.baseY;
    let bounds; let ceilingY; let entrance; let inset;
    if (slot.kind === 'gateHall') {
      const niche = gateNiches.get(slot.id);
      if (!niche) {
        note('interior-skip', `${slot.id} 缺城门值房壁龛（不套殿堂陈设）`);
        continue;
      }
      bounds = niche.rect;
      ceilingY = niche.ceilingY;
      entrance = niche.entrance;
      inset = GATE_NICHE.inset;
    } else {
      // 殿身内净尺寸取自 kit 实测 metrics（bodyW/bodyD），避免用 slot.bounds（含台明/出檐）导致陈设出墙
      const bodyW = building.metrics?.bodyW ?? (slot.w - 2 * M.plinthWidth);
      const bodyD = building.metrics?.bodyD ?? (slot.d - 2 * M.plinthWidth);
      const rot = (((slot.rotationYDeg ?? 0) % 180) + 180) % 180;
      const alongX = rot < 1e-6;
      const halfX = (alongX ? bodyW : bodyD) / 2;
      const halfZ = (alongX ? bodyD : bodyW) / 2;
      bounds = rect(slot.x - halfX, slot.x + halfX, slot.z - halfZ, slot.z + halfZ);
      const groupOriginY = groundY - slot.terraceH; // 本区落位口径：组原点 = 台基底（见文件头）
      const localEave = building.metrics?.eaveHeight ?? (slot.terraceH + M.eaveHeight);
      ceilingY = Math.max(
        groundY + 2.2,
        Math.min(groupOriginY + localEave - 0.6, (building.worldBounds?.maxY ?? groupOriginY + localEave) - 0.8),
      );
      entrance = { x: slot.x, z: bounds.minZ }; // F 区殿门一律朝南（facing='south'），入口在 -Z 侧
      inset = 0.9;
    }
    const object = kit.interiorSet({
      id: `${slot.id}-interior`,
      kind,
      grade: slot.grade,
      bounds,
      groundY,
      ceilingY,
      entrance,
      inset,
      seed: deriveSeed(ZONE_ID, `interior:${slot.id}`),
      // 预算证据（见回执 §3）：'auto' 的 LOD 近/中两档会被 audit 全量口径各计一批（+24 调用），
      // 'near' 单档只增 N 个部位桶（实测 F 61→72 ≤80），故取 'near'；t61 的空远景档语义不变。
      lod: 'near',
    });
    root.add(object);
    const meta = object.userData?.kit ?? {};
    const triNear = meta.metrics?.triangles?.near ?? 0;
    interiors.push({
      slotId: slot.id,
      kind,
      grade: slot.grade,
      groundY: round3(groundY),
      ceilingY: round3(ceilingY),
      bounds: roundRect(bounds),
      items: meta.metrics?.items ?? [],
      triangles: triNear,
      worldBounds: meta.metrics?.worldBounds ?? null,
      warnings: (meta.warnings ?? []).map((w) => w.code),
      object,
    });
    audit.interiors.push({
      slotId: slot.id,
      kind,
      grade: slot.grade,
      groundY: round3(groundY),
      ceilingY: round3(ceilingY),
      rect: roundRect(bounds),
      items: meta.metrics?.items ?? [],
      triangles: triNear,
      worldBounds: meta.metrics?.worldBounds ?? null,
      warnings: (meta.warnings ?? []).map((w) => w.code),
      avenue: slot.kind === 'gateHall' ? '城台值房壁龛（洞内 26m 净宽零占用）' : '殿内陈设',
    });
    // 室内灯位：按套件灯体公式（lampCount=2，lx=inner.minX+1.2 / inner.maxX-1.2，lz=cz+frontSign*min(spanZ*0.25,3)）
    const innerX = { min: bounds.minX + inset, max: bounds.maxX - inset };
    const innerZ = { min: bounds.minZ + inset, max: bounds.maxZ - inset };
    const icx = (innerX.min + innerX.max) / 2;
    const icz = (innerZ.min + innerZ.max) / 2;
    const spanZ = innerZ.max - innerZ.min;
    const frontSign = (entrance?.z ?? bounds.minZ) <= icz ? 1 : -1;
    const lampZ = icz + frontSign * Math.min(spanZ * 0.25, 3);
    const lampHeight = Math.max(2.0, Math.min(2.6, (ceilingY - groundY) * 0.45)); // 抬高一点：低灯在日/夕弱灯下floor易暗
    // 两处：与套件可见灯体同址（灯体在侧墙内侧，避开内景机位正前方，实测无高光截断）
    const lampXs = [innerX.min + 1.2, innerX.max - 1.2];
    const lampZs = [lampZ, lampZ];
    lampXs.forEach((lx, i) => {
      interiorLightAnchors.push({
        id: `LA-F-int-${slot.id}-${i + 1}`,
        zone: ZONE_ID,
        kind: 'windowGlow',
        position: { x: round3(lx), y: round3(groundY), z: round3(lampZs[i]) },
        height: round3(lampHeight),
        role: 'windowGlow',
        note: `${slot.name}室内补光（t61 套件不含灯光，t64 布 2 处，与套件灯体同址）`,
      });
    });
  }
  audit.notes.push(`室内陈设 ${interiors.length} 处（${interiors.map((i) => i.slotId).join('/')}）；新增室内灯位 ${interiorLightAnchors.length} 处`);

  /* ======================================================================== */
  /*  4. 御花园：廊道、假山、照壁、曲折步道、树群、宫灯                             */
  /* ======================================================================== */

  const corridors = zoneLayout.corridors ?? [];
  const avoidRects = [];
  const avoidSegments = [];
  for (const slot of citySlots) avoidRects.push({ minX: slot.bounds.minX - 3, maxX: slot.bounds.maxX + 3, minZ: slot.bounds.minZ - 3, maxZ: slot.bounds.maxZ + 3 });
  avoidRects.push({ minX: pondWest.minX - 2.5, maxX: pondWest.maxX + 2.5, minZ: pondWest.minZ - 2.5, maxZ: pondWest.maxZ + 2.5 });
  avoidRects.push({ minX: pondEast.minX - 2.5, maxX: pondEast.maxX + 2.5, minZ: pondEast.minZ - 2.5, maxZ: pondEast.maxZ + 2.5 });

  for (const corridor of corridors) {
    const mid = { x: (corridor.from.x + corridor.to.x) / 2, z: (corridor.from.z + corridor.to.z) / 2 };
    const groundTop = groundTopAt(mid.x, mid.z).y;
    if (typeof kit.corridor !== 'function') {
      note('no-corridor-factory', `${corridor.id} 缺少 kit.corridor`);
      continue;
    }
    root.add(kit.corridor({
      id: corridor.id,
      name: corridor.name,
      from: { x: corridor.from.x, z: corridor.from.z },
      to: { x: corridor.to.x, z: corridor.to.z },
      width: corridor.width ?? M.corridorWidth,
      floors: corridor.floors ?? 1,
      grade: 1,
      baseY: groundTop,
      detail: 'mid',
    }));
    const half = (corridor.width ?? M.corridorWidth) / 2 + 0.7;
    audit.props.push({
      id: corridor.id,
      kind: 'corridor',
      ground: groundTop,
      from: { x: corridor.from.x, z: corridor.from.z },
      to: { x: corridor.to.x, z: corridor.to.z },
      width: corridor.width ?? M.corridorWidth,
      rect: roundRect(rect(
        Math.min(corridor.from.x, corridor.to.x) - half,
        Math.max(corridor.from.x, corridor.to.x) + half,
        Math.min(corridor.from.z, corridor.to.z) - half,
        Math.max(corridor.from.z, corridor.to.z) + half,
      )),
    });
    avoidSegments.push({ a: corridor.from, b: corridor.to, clear: (corridor.width ?? M.corridorWidth) / 2 + 2.6 });
  }

  // 4.1 假山 / 照壁（layout.SCENIC_OBJECTS，owner = F）
  for (const s of (L.SCENIC_OBJECTS ?? []).filter((o) => o.owner === 'F')) {
    const w = s.bounds.maxX - s.bounds.minX;
    const d = s.bounds.maxZ - s.bounds.minZ;
    const cx = (s.bounds.minX + s.bounds.maxX) / 2;
    const cz = (s.bounds.minZ + s.bounds.maxZ) / 2;
    const groundTop = groundTopAt(cx, cz).y;
    if (s.kind === 'rockery' && typeof kit.rockery === 'function') {
      root.add(kit.rockery({ id: s.id, name: s.id, w, d, height: s.height, x: cx, z: cz, y: groundTop, detail: 'mid', rngSeed: deriveSeed('F', s.id) }));
    } else if (s.kind === 'screenWall' && typeof kit.screenWall === 'function') {
      root.add(kit.screenWall({ id: s.id, name: s.id, w, height: s.height, thickness: d, x: cx, z: cz, y: groundTop, detail: 'mid' }));
    } else {
      note('scenic-fallback', `${s.id}（${s.kind}）缺专用工厂，用同材质体块兜底`);
      root.add(pavePiece({ id: s.id, w, d, x: cx, z: cz, top: groundTop + s.height, bottom: groundTop, material: MAT.pavingStone }));
    }
    audit.props.push({ id: s.id, kind: s.kind, rect: roundRect(s.bounds), y0: round3(groundTop), y1: round3(groundTop + s.height), ground: groundTop, height: s.height, styleRole: s.styleRole });
    avoidRects.push({ minX: s.bounds.minX - 2.5, maxX: s.bounds.maxX + 2.5, minZ: s.bounds.minZ - 2.5, maxZ: s.bounds.maxZ + 2.5 });
  }

  // 4.2 曲折步道（自生成 Catmull-Rom 样条：后宫东西入口 → 中央亭阁 → 北殿）
  const winding = (() => {
    // 自后宫东西入口绕中央亭阁北侧成环，并主动避开北殿（含其台阶）与东西水池
    const ctrl = [
      { x: -84, z: 306 }, { x: -84, z: 326 }, { x: -60, z: 338 }, { x: -40, z: 352 },
      { x: -44, z: 368 }, { x: -26, z: 380 }, { x: -6, z: 384 }, { x: 6, z: 384 },
      { x: 26, z: 380 }, { x: 44, z: 368 }, { x: 40, z: 352 }, { x: 60, z: 338 },
      { x: 84, z: 326 }, { x: 84, z: 306 },
    ];
    const STEPS = 6;
    const pts = [];
    for (let i = 0; i < ctrl.length - 1; i += 1) {
      const p0 = ctrl[Math.max(0, i - 1)];
      const p1 = ctrl[i];
      const p2 = ctrl[i + 1];
      const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let s = 0; s < STEPS; s += 1) {
        const t = s / STEPS;
        const t2 = t * t;
        const t3 = t2 * t;
        pts.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
        });
      }
    }
    pts.push(ctrl[ctrl.length - 1]);
    let turning = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const landTop = landTopAt(cx, cz) ?? T.gardenPathsY;
      const top = Math.max(landTop + 0.02, landTop + PAVE_LIFT);
      const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
      const id = `F-garden-winding-${audit.path.length + 1}`;
      root.add(pavePiece({ id, name: '花园曲折步道', w: len + 0.35, d: WINDING_PATH_WIDTH, x: cx, z: cz, top, bottom: landTop, material: MAT.paving, rotationYDeg: yaw }));
      const aabb = rect(
        Math.min(a.x, b.x) - WINDING_PATH_WIDTH / 2,
        Math.max(a.x, b.x) + WINDING_PATH_WIDTH / 2,
        Math.min(a.z, b.z) - WINDING_PATH_WIDTH / 2,
        Math.max(a.z, b.z) + WINDING_PATH_WIDTH / 2,
      );
      audit.path.push({ id, rect: roundRect(aabb), a: { x: round3(a.x), z: round3(a.z) }, b: { x: round3(b.x), z: round3(b.z) }, y0: round3(landTop), y1: round3(top), rotationYDeg: round3(yaw), length: round3(len) });
      if (i > 0) {
        const p = pts[i - 1];
        const v1 = { x: a.x - p.x, z: a.z - p.z };
        const v2 = { x: b.x - a.x, z: b.z - a.z };
        const l1 = Math.hypot(v1.x, v1.z) || 1;
        const l2 = Math.hypot(v2.x, v2.z) || 1;
        const dot = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.z * v2.z) / (l1 * l2)));
        turning += (Math.acos(dot) * 180) / Math.PI;
      }
    }
    avoidSegments.push({ pts, clear: WINDING_PATH_WIDTH / 2 + 2.4 });
    return { segments: audit.path.length, turningDeg: round3(turning), controlPoints: ctrl.length };
  })();

  // 4.3 树群避让池：登记道路 + 廊道 + 步道 + 建筑/水池/假山/照壁
  const F_ROADS = (zoneLayout.roads ?? []).filter((r) => r.zone === 'F');
  for (const r of F_ROADS) avoidSegments.push({ a: r.from, b: r.to, clear: r.width / 2 + 2.4 });

  const vegGarden = (zoneLayout.vegetation ?? []).find((v) => v.area === 'garden');
  const vegBerm = (zoneLayout.vegetation ?? []).find((v) => v.area === 'berm');
  const treePoints = [];
  const blockedForTrees = (x, z) => {
    for (const r of avoidRects) if (containsPoint(r, x, z)) return true;
    for (const s of avoidSegments) {
      if (s.pts) {
        for (let i = 0; i < s.pts.length - 1; i += 1) {
          if (distanceToSegment(x, z, s.pts[i].x, s.pts[i].z, s.pts[i + 1].x, s.pts[i + 1].z) < s.clear) return true;
        }
      } else if (distanceToSegment(x, z, s.a.x, s.a.z, s.b.x, s.b.z) < s.clear) return true;
    }
    return false;
  };
  const tooClose = (x, z) => treePoints.some((p) => Math.hypot(p.x - x, p.z - z) < TREE_MIN_SEPARATION);

  function sampleGardenTrees(count) {
    const target = treePoints.length + count;
    let guard = 0;
    while (treePoints.length < target && guard < count * 400) {
      guard += 1;
      const x = rng.range(-296, 296);
      const z = rng.range(304, 416);
      if (blockedForTrees(x, z) || tooClose(x, z)) continue;
      const y = landTopAt(x, z);
      if (y === null) continue;
      treePoints.push({ x: +x.toFixed(3), z: +z.toFixed(3), y, area: 'garden' });
    }
    if (treePoints.length < target) note('tree-shortfall', `花园树 ${treePoints.length}/${target}（避让后不足）`);
  }
  function sampleBermTrees(count) {
    const bands = [
      { side: 'south', x: [-330.5, 330.5], z: [-470.5, -460.5] },
      { side: 'north', x: [-330.5, 330.5], z: [460.5, 470.5] },
      { side: 'west', x: [-330.5, -310.5], z: [-450, 450] },
      { side: 'east', x: [310.5, 330.5], z: [-450, 450] },
    ];
    const target = treePoints.length + count;
    const start = treePoints.length;
    let guard = 0;
    while (treePoints.length < target && guard < count * 500) {
      guard += 1;
      const band = rng.pick(bands);
      const x = rng.range(band.x[0], band.x[1]);
      const z = rng.range(band.z[0], band.z[1]);
      if (Math.abs(x) < 13 && (z < -440 || z > 440)) continue; // 南/北桥引道
      if (Math.abs(z) < 11 && (x < -290 || x > 290)) continue; // 东/西桥引道
      if (blockedForTrees(x, z) || tooClose(x, z)) continue;
      const y = landTopAt(x, z);
      if (y === null) continue;
      treePoints.push({ x: +x.toFixed(3), z: +z.toFixed(3), y, area: 'berm', side: band.side });
    }
    if (treePoints.length < target) note('tree-shortfall', `岸台树 ${treePoints.length - start}/${count}（避让后不足）`);
  }
  sampleGardenTrees(vegGarden?.treeCount ?? 64);
  sampleBermTrees(vegBerm?.treeCount ?? 40);

  /* ---------------------------------------------------------------- 4.3b 花园填充（t171）
   * 用户原话"花园的部分太空了"。做法：**先量化、后填充**，且全部**实例化**或**并入既有材质批次**：
   *   ① 12×4（50m×30m）网格量化御花园逐块内容密度（元素数 + 覆盖率）⇒ 得出**最空的块**；
   *   ② 只在最空的 60% 块里补 5 类内容（植被 / 山石置石 / 石作小件 / 铺装园路 / 水面点缀）中的 ≥4 类；
   *   ③ F 区预算 80（填充前 72）⇒ 新增几何优先并入既有材质批次（0 调用）或单批实例化（每类 1–2 调用）。
   * 位置确定性：独立 rng 流（`kit.makeRng(deriveSeed(ZONE_ID,'garden-fill'))`），**不扰动**既有树/灯/屋的随机序列。
   */
  const FILL = {
    rect: rect(-296, 296, 304, 416),                 // 可填充范围（御花园 tile T-F-garden 内缩 4m）
    cols: 12, rows: 4,                               // 50m × 30m 网格（与密度基线同口径）
    trees: 224,                                      // 乔木：64 → 288 株（4.0 株/1000m²）
    shrubs: 120,                                     // 灌木（树冠单批实例化）
    flowerBeds: 36, flowerPerBed: 3,                 // 花坛 36 处 × 3 丛（花冠单批实例化）
    rockClusters: 48, rocksPerCluster: 3,            // 山石/置石 48 组 × 3 块（1 批实例化）
    stoneTables: 8, stoneBenches: 18, bronzeVats: 10, // 石作小件（并入既有石/金材质批次）
    lilyPads: 96, lotus: 18,                         // 水面点缀（荷叶并入 foliage 批次；莲丛用花冠批次）
    stepStones: 24, plazaSize: 6.4,                  // 铺装/园路
    /* t4：竹丛（**本卡唯一新增实例批次**——F 合批后 1 个调用余量正好用尽；见 §4.3c 预算口径） */
    bamboo: 140, bambooStems: 5, bambooLeafTufts: 4, bambooGap: 4.2,
    treeGap: 5.2, shrubGap: 3.6, rockGap: 4.2, stoneGap: 2.6,
  };
  const fillRng = typeof kit.makeRng === 'function' ? kit.makeRng(deriveSeed(ZONE_ID, 'garden-fill')) : rng;
  const FILL_BW = rectWidth(FILL.rect) / FILL.cols;
  const FILL_BD = rectDepth(FILL.rect) / FILL.rows;
  const fillPoints = { trees: [], shrubs: [], flowers: [], rocks: [], bamboo: [], lotus: [], lilies: [] };
  const fillStones = [];                              // 石作小件（桌/凳/缸）
  const fillPaving = [];                              // 填充铺装（支路 / 小广场 / 汀步）
  /** 必须保持可通行的"关键面"（门洞通道/室内/门槛/过渡/台基）——填充物一律不许压上去。 */
  const FILL_KEEP_KINDS = new Set(['passage', 'interior', 'threshold', 'transition', 'terrace']);
  const fillKeepRects = (zoneLayout.walkable ?? []).filter((w) => FILL_KEEP_KINDS.has(w.kind)).map((w) => w.bounds);
  /** 必须保持净空的"关键点"（F 区走查路点 + 机位）——填充物离它们 ≥ 半径 + 1.5m。 */
  const fillKeepPoints = [
    ...(L.FP_ROUTE ?? [])
      .filter((p) => p.position && Math.abs(p.position.x) <= 320 && Math.abs(p.position.z) <= 470)
      .map((p) => ({ x: p.position.x, z: p.position.z })),
    ...(zoneLayout.viewpoints ?? []).filter((v) => v.position).map((v) => ({ x: v.position.x, z: v.position.z })),
  ];
  const fillPlaced = () => [
    ...Object.values(fillPoints).flat().map((p) => ({ x: p.x, z: p.z, r: p.r ?? 1.2, kind: p.kind ?? 'plant' })),
    ...fillStones.map((s) => ({ x: s.x, z: s.z, r: s.r, kind: s.kind })),
    ...fillPaving.map((p) => ({ x: p.x, z: p.z, r: p.r, kind: 'paving' })),
  ];

  /**
   * 填充可用性（一处判据、所有类别共用）：
   * 在范围内 ∧ 非水面（水面点缀单独放行）∧ 复用既有避让池（建筑/水池/假山/照壁/廊道/道路/步道 + 2.4m 净空）
   * ∧ 不压关键面/关键点 ∧ 与已放置的填充物保持间距。
   */
  function fillFree(x, z, r, { water = false, soft = false } = {}) {
    if (x < FILL.rect.minX + r || x > FILL.rect.maxX - r || z < FILL.rect.minZ + r || z > FILL.rect.maxZ - r) return false;
    const inWater = waterAt(x, z) !== null;
    if (water ? !inWater : inWater) return false;
    if (soft) {
      // 铺装/汀步/荷叶：只避开**实体足迹**（建筑/假山/照壁/廊道，各留 1m），允许与既有步道/道路交叠（铺装叠铺装）
      for (const b of audit.buildings) {
        if (x > b.rect.minX - 1 - r && x < b.rect.maxX + 1 + r && z > b.rect.minZ - 1 - r && z < b.rect.maxZ + 1 + r) return false;
      }
      for (const pr of audit.props) {
        if (!pr.rect) continue;
        if (x > pr.rect.minX - 0.6 - r && x < pr.rect.maxX + 0.6 + r && z > pr.rect.minZ - 0.6 - r && z < pr.rect.maxZ + 0.6 + r) return false;
      }
    } else if (blockedForTrees(x, z)) return false;
    for (const wr of fillKeepRects) {
      if (x > wr.minX - r - 0.8 && x < wr.maxX + r + 0.8 && z > wr.minZ - r - 0.8 && z < wr.maxZ + r + 0.8) return false;
    }
    for (const p of fillKeepPoints) if (Math.hypot(p.x - x, p.z - z) < r + 1.5) return false;
    for (const p of fillPlaced()) if (Math.hypot(p.x - x, p.z - z) < r + p.r) return false;
    if (!water && landTopAt(x, z) === null) return false;
    return true;
  }

  /** 间距（同类/异类各自下限；值全部 ≤ 既有 TREE_MIN_SEPARATION=5，不放松既有判据）。 */
  function fillSpacingOk(x, z, { treeGap = FILL.treeGap, shrubGap = FILL.shrubGap, rockGap = FILL.rockGap, stoneGap = FILL.stoneGap } = {}) {
    for (const p of treePoints) if (p.area === 'garden' && Math.hypot(p.x - x, p.z - z) < treeGap) return false;
    for (const p of fillPoints.trees) if (Math.hypot(p.x - x, p.z - z) < treeGap) return false;
    for (const p of fillPoints.shrubs) if (Math.hypot(p.x - x, p.z - z) < shrubGap) return false;
    for (const p of fillPoints.rocks) if (Math.hypot(p.x - x, p.z - z) < rockGap) return false;
    for (const p of fillStones) if (Math.hypot(p.x - x, p.z - z) < stoneGap) return false;
    return true;
  }

  /** 逐块内容密度（填充前后同口径；元素数 + 覆盖率，6m 采样）。 */
  function gardenDensity() {
    const coverRects = [
      ...avoidRects,
      ...audit.path.map((p) => p.rect),
      ...audit.water.map((w) => w.rect),
      ...audit.buildings.map((b) => b.rect),
      ...audit.props.filter((p) => p.rect).map((p) => p.rect),
      ...fillPaving.map((p) => p.rect),
    ];
    const pointList = [
      ...treePoints.filter((p) => p.area === 'garden').map((p) => ({ x: p.x, z: p.z, r: 3 })),
      ...audit.props.filter((p) => p.kind === 'lantern').map((p) => ({ x: (p.rect.minX + p.rect.maxX) / 2, z: (p.rect.minZ + p.rect.maxZ) / 2, r: 1 })),
      ...fillPlaced().map((p) => ({ x: p.x, z: p.z, r: Math.max(1, p.r) })),
    ];
    const out = [];
    for (let ix = 0; ix < FILL.cols; ix += 1) {
      for (let iz = 0; iz < FILL.rows; iz += 1) {
        const x0 = FILL.rect.minX + ix * FILL_BW;
        const z0 = FILL.rect.minZ + iz * FILL_BD;
        const b = rect(x0, x0 + FILL_BW, z0, z0 + FILL_BD);
        const inB = (p) => p.x >= b.minX && p.x < b.maxX && p.z >= b.minZ && p.z < b.maxZ;
        const trees = treePoints.filter((p) => p.area === 'garden' && inB(p)).length;
        const fill = fillPlaced().filter(inB).length;
        let cov = 0;
        let tot = 0;
        for (let x = b.minX + 3; x < b.maxX; x += 6) {
          for (let z = b.minZ + 3; z < b.maxZ; z += 6) {
            tot += 1;
            let hit = false;
            for (const rr of coverRects) if (containsPoint(rr, x, z)) { hit = true; break; }
            if (!hit) {
              for (const p of pointList) if (Math.hypot(p.x - x, p.z - z) <= p.r) { hit = true; break; }
            }
            if (hit) cov += 1;
          }
        }
        const coverage = +(cov / Math.max(1, tot)).toFixed(3);
        out.push({ ix, iz, x0: round3(x0), z0: round3(z0), trees, fill, coverage, score: +(trees + fill * 1.5 + coverage * 40).toFixed(2) });
      }
    }
    return out;
  }

  const fillDensityBefore = gardenDensity();
  const fillRankedBefore = [...fillDensityBefore].sort((a, b) => a.score - b.score);
  /** 目标块 = 最空的 60%（29/48 块）——填充只落在这里，可复现、可审计。 */
  const fillTargets = fillRankedBefore.slice(0, Math.ceil(fillRankedBefore.length * 0.6));
  const fillEmptiestBefore = fillRankedBefore.slice(0, 8);

  /** 在目标块内取一个可用点（确定性 rng）。 */
  function fillPick(r, spacingFn = fillSpacingOk, opts = {}, tries = 3000) {
    for (let guard = 0; guard < tries; guard += 1) {
      const b = fillRng.pick(fillTargets);
      const x = fillRng.range(b.x0 + 2.5, b.x0 + FILL_BW - 2.5);
      const z = fillRng.range(b.z0 + 2.5, b.z0 + FILL_BD - 2.5);
      if (!fillFree(x, z, r, opts)) continue;
      if (spacingFn && !spacingFn(x, z)) continue;
      return { x: +x.toFixed(3), z: +z.toFixed(3) };
    }
    return null;
  }

  /* ① 乔木：追加 224 株（独立批次实例化；不进 audit.trees 的 layout 基线口径） */
  for (let guard = 0; guard < FILL.trees * 60 && fillPoints.trees.length < FILL.trees; guard += 1) {
    const p = fillPick(2.6);
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillPoints.trees.push({ x: p.x, z: p.z, y, r: 2.6, kind: 'tree', area: 'garden-fill' });
  }
  /* ② 灌木 120 丛（树冠单批实例化） */
  for (let guard = 0; guard < FILL.shrubs * 60 && fillPoints.shrubs.length < FILL.shrubs; guard += 1) {
    const p = fillPick(1.1, (x, z) => fillSpacingOk(x, z, { treeGap: 4.0, shrubGap: FILL.shrubGap }));
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillPoints.shrubs.push({ x: p.x, z: p.z, y, r: 1.1, kind: 'shrub' });
  }
  /* ③ 花坛 36 处（每处 3 丛花冠 + 一圈石缘；花冠并入单批实例化） */
  for (let guard = 0; guard < FILL.flowerBeds * 80 && fillPoints.flowers.length < FILL.flowerBeds; guard += 1) {
    const p = fillPick(2.6, (x, z) => fillSpacingOk(x, z, { treeGap: 5.0, shrubGap: 4.4, rockGap: 2.0 }));
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillPoints.flowers.push({ x: p.x, z: p.z, y, r: 2.6, kind: 'flowerBed' });
  }
  /* ④ 山石/置石 48 组（每组 3 块，1 批实例化；登记碰撞） */
  for (let guard = 0; guard < FILL.rockClusters * 80 && fillPoints.rocks.length < FILL.rockClusters; guard += 1) {
    const p = fillPick(2.2, (x, z) => fillSpacingOk(x, z, { treeGap: 5.0, shrubGap: 4.0, rockGap: FILL.rockGap }));
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillPoints.rocks.push({ x: p.x, z: p.z, y, r: 2.2, kind: 'rockCluster' });
  }
  /* ⑤ 石作小件：石桌 8 + 石凳 18 + 铜缸 10（并入既有石/金材质批次，0 新调用；登记碰撞） */
  for (let guard = 0; guard < FILL.stoneTables * 200 && fillStones.filter((s) => s.kind === 'stoneTable').length < FILL.stoneTables; guard += 1) {
    const p = fillPick(1.6, (x, z) => fillSpacingOk(x, z, { treeGap: 4.4, shrubGap: 3.0, rockGap: 3.0, stoneGap: 4.0 }));
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillStones.push({ id: `F-fill-table-${fillStones.filter((s) => s.kind === 'stoneTable').length + 1}`, kind: 'stoneTable', x: p.x, z: p.z, y, r: 1.6, w: 2.4, d: 2.4, h: 0.72 });
  }
  for (let guard = 0; guard < FILL.stoneBenches * 200 && fillStones.filter((s) => s.kind === 'stoneBench').length < FILL.stoneBenches; guard += 1) {
    const p = fillPick(1.0, (x, z) => fillSpacingOk(x, z, { treeGap: 4.0, shrubGap: 2.6, rockGap: 2.6, stoneGap: 2.2 }));
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillStones.push({ id: `F-fill-bench-${fillStones.filter((s) => s.kind === 'stoneBench').length + 1}`, kind: 'stoneBench', x: p.x, z: p.z, y, r: 1.0, w: 2.0, d: 0.6, h: 0.45 });
  }
  for (let guard = 0; guard < FILL.bronzeVats * 200 && fillStones.filter((s) => s.kind === 'bronzeVat').length < FILL.bronzeVats; guard += 1) {
    const p = fillPick(0.9, (x, z) => fillSpacingOk(x, z, { treeGap: 4.0, shrubGap: 2.4, rockGap: 2.4, stoneGap: 2.4 }));
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillStones.push({ id: `F-fill-vat-${fillStones.filter((s) => s.kind === 'bronzeVat').length + 1}`, kind: 'bronzeVat', x: p.x, z: p.z, y, r: 0.9, w: 1.2, d: 1.2, h: 1.1 });
  }
  /* ⑥ 铺装/园路：2 条纵向支路 + 2 条横向支路 + 8 处小广场 + 24 处汀步（全部并入既有铺装批次） */
  (() => {
    const spine = [
      { id: 'F-fill-path-west', x0: -291, z0: 310, x1: -291, z1: 410 },
      { id: 'F-fill-path-east', x0: 291, z0: 310, x1: 291, z1: 410 },
      { id: 'F-fill-path-south', x0: -286, z0: 311, x1: 286, z1: 311 },
      { id: 'F-fill-path-north', x0: -286, z0: 408, x1: 286, z1: 408 },
    ];
    const segments = 10;
    for (const sp of spine) {
      const cx0 = (sp.x0 + sp.x1) / 2;
      const cz0 = (sp.z0 + sp.z1) / 2;
      const halfW = 2.6;
      for (let i = 0; i < segments; i += 1) {
        const t0 = i / segments;
        const t1 = (i + 1) / segments;
        const ax = sp.x0 + (sp.x1 - sp.x0) * t0;
        const az = sp.z0 + (sp.z1 - sp.z0) * t0;
        const bx = sp.x0 + (sp.x1 - sp.x0) * t1;
        const bz = sp.z0 + (sp.z1 - sp.z0) * t1;
        const cx = (ax + bx) / 2;
        const cz = (az + bz) / 2;
        const alongX = Math.abs(bx - ax) >= Math.abs(bz - az);
        const w = (alongX ? Math.abs(bx - ax) : halfW * 2) + 0.3;
        const d = (alongX ? halfW * 2 : Math.abs(bz - az)) + 0.3;
        if (!fillFree(cx, cz, halfW, { soft: true })) continue;
        const y = landTopAt(cx, cz);
        if (y === null) continue;
        fillPaving.push({ id: `${sp.id}-${i + 1}`, kind: 'path', x: round3(cx), z: round3(cz), w: round3(w), d: round3(d), y: round3(y), r: Math.max(w, d) / 2, rect: rect(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2) });
      }
      if (sp.id.endsWith('south') || sp.id.endsWith('north')) continue;
    }
    // 小广场：最空的 8 块中心
    for (const b of fillTargets.slice(0, 8)) {
      const cx = b.x0 + FILL_BW / 2;
      const cz = b.z0 + FILL_BD / 2;
      if (!fillFree(cx, cz, FILL.plazaSize / 2, { soft: true })) continue;
      const y = landTopAt(cx, cz);
      if (y === null) continue;
      fillPaving.push({ id: `F-fill-plaza-${fillPaving.length + 1}`, kind: 'plaza', x: round3(cx), z: round3(cz), w: FILL.plazaSize, d: FILL.plazaSize, y: round3(y), r: FILL.plazaSize / 2, rect: rect(cx - FILL.plazaSize / 2, cx + FILL.plazaSize / 2, cz - FILL.plazaSize / 2, cz + FILL.plazaSize / 2) });
    }
    // 汀步：贴水池岸线散布
    for (const w of audit.water) {
      for (let i = 0; i < Math.ceil(FILL.stepStones / audit.water.length); i += 1) {
        const edge = fillRng.pick(['minX', 'maxX', 'minZ', 'maxZ']);
        const x = edge === 'minX' ? w.rect.minX - 1.6 : edge === 'maxX' ? w.rect.maxX + 1.6 : fillRng.range(w.rect.minX, w.rect.maxX);
        const z = edge === 'minZ' ? w.rect.minZ - 1.6 : edge === 'maxZ' ? w.rect.maxZ + 1.6 : fillRng.range(w.rect.minZ, w.rect.maxZ);
        if (!fillFree(x, z, 0.8, { soft: true })) continue;
        const y = landTopAt(x, z);
        if (y === null) continue;
        fillPaving.push({ id: `F-fill-step-${fillPaving.length + 1}`, kind: 'stepStone', x: round3(x), z: round3(z), w: 1.3, d: 1.3, y: round3(y), r: 0.65, rect: rect(x - 0.65, x + 0.65, z - 0.65, z + 0.65) });
      }
    }
  })();
  /* ⑦ 水面点缀：荷叶 96 片（并入 foliage 批次）+ 莲丛 18 处（花冠批次，落在水池内） */
  const gardenWater = audit.water.filter((w) => w.rect.minZ >= FILL.rect.minZ - 1 && w.rect.maxZ <= FILL.rect.maxZ + 1);
  for (const w of gardenWater) {
    const quota = Math.round(FILL.lilyPads / Math.max(1, gardenWater.length));
    for (let i = 0; i < quota * 3 && fillPoints.lilies.filter((p) => p.waterId === w.id).length < quota; i += 1) {
      const x = fillRng.range(w.rect.minX + 1.5, w.rect.maxX - 1.5);
      const z = fillRng.range(w.rect.minZ + 1.5, w.rect.maxZ - 1.5);
      if (!fillFree(x, z, 0.9, { water: true, soft: true })) continue;
      fillPoints.lilies.push({ x: round3(x), z: round3(z), y: w.y1, r: 0.9, kind: 'lily', waterId: w.id });
    }
    const lotusQuota = Math.round(FILL.lotus / Math.max(1, gardenWater.length));
    for (let i = 0; i < lotusQuota * 4 && fillPoints.lotus.filter((p) => p.waterId === w.id).length < lotusQuota; i += 1) {
      const x = fillRng.range(w.rect.minX + 2, w.rect.maxX - 2);
      const z = fillRng.range(w.rect.minZ + 2, w.rect.maxZ - 2);
      if (!fillFree(x, z, 1.4, { water: true, soft: true })) continue;
      if (fillPoints.lilies.some((p) => Math.hypot(p.x - x, p.z - z) < 2.0)) continue;
      fillPoints.lotus.push({ x: round3(x), z: round3(z), y: w.y1, r: 1.4, kind: 'lotus', waterId: w.id });
    }
  }
  /* ⑧ 竹丛 140 处（t4）：多层下木层——株高取自 config.PLANTS.treeHeights，
     单批实例化（F 仅余 1 个绘制调用 ⇒ 本类别**用满**该余量，不越预算）。 */
  for (let guard = 0; guard < FILL.bamboo * 120 && fillPoints.bamboo.length < FILL.bamboo; guard += 1) {
    const p = fillPick(1.9, (x, z) => fillSpacingOk(x, z, { treeGap: 3.4, shrubGap: 3.0, rockGap: 3.4, stoneGap: 2.8 }));
    if (!p) continue;
    const y = landTopAt(p.x, p.z);
    if (y === null) continue;
    fillPoints.bamboo.push({ x: p.x, z: p.z, y, r: 1.9, kind: 'bamboo', h: config.PLANTS.treeHeights.medium * 0.62 });
  }
  if (fillPoints.bamboo.length < FILL.bamboo) note('fill-bamboo-shortfall', `竹丛 ${fillPoints.bamboo.length}/${FILL.bamboo}（避让后不足，不影响判据）`);
  const fillDensityAfter = gardenDensity();
  const fillRankedAfter = [...fillDensityAfter].sort((a, b) => a.score - b.score);
  const fillNotes = [
    `花园填充（t171+t4）：乔木 +${fillPoints.trees.length}（64 → ${treePoints.filter((p) => p.area === 'garden').length + fillPoints.trees.length}）· 灌木 ${fillPoints.shrubs.length} · 竹丛 ${fillPoints.bamboo.length}（t4 新增·${FILL.bambooStems} 竿/${FILL.bambooLeafTufts} 叶丛/丛）· 花坛 ${fillPoints.flowers.length} 处（花冠 ${fillPoints.flowers.length * FILL.flowerPerBed} 丛）· 山石组 ${fillPoints.rocks.length}（块 ${fillPoints.rocks.length * FILL.rocksPerCluster}）· 石作小件 ${fillStones.length}（桌/凳/缸）· 铺装 ${fillPaving.length} 块 · 水面点缀 荷叶 ${fillPoints.lilies.length} + 莲丛 ${fillPoints.lotus.length}`,
    `花园密度（12×4 块）：平均覆盖率 ${(fillDensityBefore.reduce((s, b) => s + b.coverage, 0) / fillDensityBefore.length * 100).toFixed(1)}% → ${(fillDensityAfter.reduce((s, b) => s + b.coverage, 0) / fillDensityAfter.length * 100).toFixed(1)}%；元素数 ≤2 的块 ${fillDensityBefore.filter((b) => b.trees + b.fill <= 2).length} → ${fillDensityAfter.filter((b) => b.trees + b.fill <= 2).length}；覆盖率 <5% 的块 ${fillDensityBefore.filter((b) => b.coverage < 0.05).length} → ${fillDensityAfter.filter((b) => b.coverage < 0.05).length}`,
  ];

  // 4.4 树群实例化（树干按高度去重；花树只换树冠材质，几何同株）
  const treeInstances = [];
  if (typeof kit.instance === 'function' && typeof kit.tree === 'function' && treePoints.length > 0) {
    const gardenTrees = treePoints.filter((p) => p.area === 'garden');
    const bermTrees = treePoints.filter((p) => p.area === 'berm');
    const blossomCount = Math.min(gardenTrees.length, vegGarden?.blossomCount ?? 8);
    const blossomIdx = new Set(typeof rng.sampleInts === 'function' ? rng.sampleInts(0, gardenTrees.length - 1, blossomCount) : []);
    const mediumShape = config.PLANTS.canopyShapes[1] ?? 'domedSphere';
    const groups = [
      { key: 'garden', shape: mediumShape, height: config.PLANTS.treeHeights.medium, blossom: false, points: gardenTrees.filter((_, i) => !blossomIdx.has(i)) },
      { key: 'garden-blossom', shape: mediumShape, height: config.PLANTS.treeHeights.medium, blossom: true, points: gardenTrees.filter((_, i) => blossomIdx.has(i)) },
      { key: 'berm', shape: config.PLANTS.canopyShapes[0], height: config.PLANTS.treeHeights.small, blossom: false, points: bermTrees },
    ];
    // 每株树只算一次实例矩阵（树干与树冠共用同一株的位姿）
    const prepared = groups
      .filter((g) => g.points.length > 0)
      .map((g) => {
        const proto = kit.tree({
          id: `F-tree-proto-${g.key}`,
          height: g.height,
          canopyShape: g.shape,
          blossom: g.blossom,
          detail: 'mid',
          rngSeed: deriveSeed('F', `tree:${g.key}`),
        });
        const parts = [];
        proto.traverse((n) => {
          if (n.isMesh) parts.push(n);
        });
        const matrices = g.points.map((p) => new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI * 2), 0)),
          new THREE.Vector3(rng.range(0.86, 1.14), rng.range(0.9, 1.16), rng.range(0.86, 1.14)),
        ));
        return { ...g, parts, matrices };
      });

    // 树干几何只与树高有关 → 同高的多组（花园 + 花树）合用一个树干实例
    const trunkByHeight = new Map();
    for (const g of prepared) {
      const trunk = g.parts.find((n) => n.userData.part === 'trunk');
      if (!trunk) continue;
      if (!trunkByHeight.has(g.height)) trunkByHeight.set(g.height, { part: trunk, matrices: [], keys: [] });
      const entry = trunkByHeight.get(g.height);
      entry.matrices.push(...g.matrices);
      entry.keys.push(g.key);
    }
    for (const [height, entry] of trunkByHeight) {
      const inst = kit.instance(entry.part, entry.matrices.length, entry.matrices, { name: `F-tree-trunk:${height}` });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.userData.garden = { kind: 'tree', part: 'trunk', key: entry.keys.join('+'), height };
      root.add(inst);
      treeInstances.push({ key: entry.keys.join('+'), part: 'trunk', count: entry.matrices.length, height, shape: null });
    }
    // 树冠：按 (形状 + 材质) 分组实例化
    for (const g of prepared) {
      const canopy = g.parts.find((n) => n.userData.part === 'canopy');
      if (!canopy) continue;
      const inst = kit.instance(canopy, g.matrices.length, g.matrices, { name: `F-tree-canopy:${g.key}` });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.userData.garden = { kind: 'tree', part: 'canopy', key: g.key };
      root.add(inst);
      treeInstances.push({ key: g.key, part: 'canopy', count: g.matrices.length, shape: g.shape, height: g.height, blossom: g.blossom === true });
    }
  } else if (treePoints.length > 0) {
    note('no-instance', 'kit 缺少 instance/tree，树群未实例化');
  }
  audit.trees = {
    count: treePoints.length,
    predicted: (vegGarden?.treeCount ?? 0) + (vegBerm?.treeCount ?? 0),
    blossom: vegGarden?.blossomCount ?? 0,
    instances: treeInstances,
    minSeparation: TREE_MIN_SEPARATION,
    points: treePoints.map((p) => ({ x: p.x, z: p.z, y: p.y, area: p.area, side: p.side ?? null })),
  };

  // 4.5 宫灯（layout.LIGHT_ANCHORS 的 F 条目；灯体实例化，灯光由环境系统生成）
  /** layout 基线灯位（F 条目）：可见灯体只按这批实例化（t64：室内补光只发灯位，实体灯由套件灯体承担） */
  const baselineLightAnchors = zoneLayout.lightAnchors.map((a) => ({ ...a, position: { ...a.position } }));
  /** 返回给注册表的灯位 = layout 基线 + 室内补光（t64） */
  const lightAnchors = [...baselineLightAnchors, ...interiorLightAnchors];
  const lanternInstances = [];
  if (typeof kit.instance === 'function' && typeof kit.lantern === 'function' && baselineLightAnchors.length > 0) {
    const proto = kit.lantern({ id: 'F-lantern-proto', height: 3.2, detail: 'mid', kind: 'post' });
    const parts = [];
    proto.traverse((n) => {
      if (n.isMesh) parts.push(n);
    });
    const placed = baselineLightAnchors.map((a) => {
      const w = waterAt(a.position.x, a.position.z);
      if (w) {
        // layout 把 2 处宫灯登记在水池上：用落到池底的石座承托，灯体立在水面之上
        const plinthTop = w.y1 + 0.15;
        addSupport(`${a.id}-plinth`, rect(a.position.x - 0.5, a.position.x + 0.5, a.position.z - 0.5, a.position.z + 0.5), plinthTop, w.y0 + 0.02, MAT.pier);
        return { anchor: a, y: plinthTop, plinth: true, waterId: w.id };
      }
      return { anchor: a, y: groundTopAt(a.position.x, a.position.z).y, plinth: false };
    });
    const matrices = placed.map((p) => new THREE.Matrix4().makeTranslation(p.anchor.position.x, p.y, p.anchor.position.z));
    for (const part of parts) {
      const inst = kit.instance(part, placed.length, matrices, { name: `F-lantern:${part.userData.part}` });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.userData.garden = { kind: 'lantern', part: part.userData.part };
      root.add(inst);
      lanternInstances.push({ part: part.userData.part, count: placed.length });
    }
    for (const p of placed) {
      audit.props.push({
        id: p.anchor.id,
        kind: 'lantern',
        ground: p.y,
        rect: roundRect(rect(p.anchor.position.x - 0.5, p.anchor.position.x + 0.5, p.anchor.position.z - 0.5, p.anchor.position.z + 0.5)),
        y0: round3(p.y),
        y1: round3(p.y + 3.2),
        plinth: p.plinth === true,
        waterId: p.waterId ?? null,
      });
    }
  }
  audit.notes.push(`宫灯 ${lightAnchors.length} 处（${lanternInstances.length} 个实例批次）；树木 ${audit.trees.count} 株（${treeInstances.length} 个实例批次）`);

  /* ---------------------------------------------------------------- 4.5b 花园填充落地（t171）
   * 实例化优先：乔木 2 批（干/冠）· 灌木 1 批（冠）· 花坛+莲丛 1 批（花冠）· 山石 1 批；
   * 其余（石桌/石凳/铜缸/园路/广场/汀步/荷叶）**并入既有材质批次**（0 新绘制调用）。
   */
  const fillInstances = [];
  const fillMatrix = (p, scale, spin) => new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spin ?? fillRng.range(0, Math.PI * 2), 0)),
    new THREE.Vector3(scale, scale, scale),
  );
  const addFillBatch = (protoMesh, matrices, meta, name) => {
    const inst = kit.instance(protoMesh, matrices.length, matrices, { name });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.userData.garden = meta;
    root.add(inst);
    fillInstances.push({ name, part: meta.part, kind: meta.kind, count: matrices.length });
    return inst;
  };
  const fillPrototypeParts = (obj) => {
    const parts = [];
    obj.traverse((n) => {
      if (n.isMesh) parts.push(n);
    });
    return parts;
  };

  if (typeof kit.instance === 'function' && typeof kit.tree === 'function') {
    // 乔木（独立批次：不进 audit.trees 的 layout 基线口径，避免改动既有断言）
    if (fillPoints.trees.length > 0) {
      const proto = kit.tree({ id: 'F-fill-tree-proto', height: config.PLANTS.treeHeights.medium, canopyShape: config.PLANTS.canopyShapes[1] ?? 'domedSphere', blossom: false, detail: 'mid', rngSeed: deriveSeed(ZONE_ID, 'fill-tree') });
      const parts = fillPrototypeParts(proto);
      const trunk = parts.find((n) => n.userData.part === 'trunk');
      const canopy = parts.find((n) => n.userData.part === 'canopy');
      const matrices = fillPoints.trees.map((p) => fillMatrix(p, fillRng.range(0.9, 1.12)));
      const shrubMatrices = fillPoints.shrubs.map((p) => fillMatrix(p, fillRng.range(0.24, 0.31)));
      if (trunk) addFillBatch(trunk, matrices, { kind: 'tree', part: 'trunk', fill: true }, 'F-fill-tree-trunk');
      if (canopy) addFillBatch(canopy, [...matrices, ...shrubMatrices], { kind: 'tree', part: 'canopy', fill: true, shrubs: shrubMatrices.length }, 'F-fill-tree-canopy');
    }
    // 灌木：**并入填充乔木的树冠批次**（同原型按实例矩阵缩小）⇒ 0 额外绘制调用
    //   （若另开批次则 +1 桶，会把 F 区推过 80 预算；实例缩放不改变材质/几何桶）
    // 花坛花冠 + 莲丛（花冠材质；1 批）
    const flowerMatrices = [];
    for (const bed of fillPoints.flowers) {
      for (let i = 0; i < FILL.flowerPerBed; i += 1) {
        const ang = (i / FILL.flowerPerBed) * Math.PI * 2 + fillRng.range(-0.3, 0.3);
        const rr = i === 0 ? 0 : fillRng.range(0.9, 1.6);
        flowerMatrices.push(fillMatrix({ x: bed.x + Math.cos(ang) * rr, y: bed.y, z: bed.z + Math.sin(ang) * rr }, fillRng.range(0.8, 1.15)));
      }
    }
    for (const lo of fillPoints.lotus) flowerMatrices.push(fillMatrix(lo, fillRng.range(0.7, 0.95)));
    if (flowerMatrices.length > 0) {
      const proto = kit.tree({ id: 'F-fill-flower-proto', height: 1.25, canopyShape: config.PLANTS.canopyShapes[1] ?? 'domedSphere', blossom: true, detail: 'mid', rngSeed: deriveSeed(ZONE_ID, 'fill-flower') });
      const canopy = fillPrototypeParts(proto).find((n) => n.userData.part === 'canopy');
      if (canopy) addFillBatch(canopy, flowerMatrices, { kind: 'flower', part: 'canopy', blossom: true }, 'F-fill-flower');
    }
  }
  // 山石/置石（1 批：48 组 × 3 块，用单个石块原型散布）
  if (typeof kit.instance === 'function' && typeof kit.rockery === 'function' && fillPoints.rocks.length > 0) {
    const proto = kit.rockery({ id: 'F-fill-rock-proto', w: 3.2, d: 2.6, height: 1.7, detail: 'mid', rngSeed: deriveSeed(ZONE_ID, 'fill-rock') });
    const part = fillPrototypeParts(proto)[0];
    const matrices = [];
    for (const rock of fillPoints.rocks) {
      for (let i = 0; i < FILL.rocksPerCluster; i += 1) {
        const ang = (i / FILL.rocksPerCluster) * Math.PI * 2 + fillRng.range(-0.4, 0.4);
        const rr = i === 0 ? 0 : fillRng.range(0.8, 1.9);
        matrices.push(fillMatrix({ x: rock.x + Math.cos(ang) * rr, y: rock.y, z: rock.z + Math.sin(ang) * rr }, fillRng.range(0.7, 1.15)));
      }
    }
    if (part) addFillBatch(part, matrices, { kind: 'rock', part: 'rockery' }, 'F-fill-rock');
  }
  /* t4 ⑨ 竹丛（1 批实例化）：原型 = N 段竹竿 + M 丛竹叶，用 kit.merge 合并为**单个**几何后实例化。
     · 预算：F 合批后 1 个调用余量（79→80）正好用尽，主场景 340→341（上限 350）；
     · 材质由源码定义（`matOf('foliage')`）= kit 共享 foliage 材质，部位固定 `shrub`（叶冠属灌木层）⇒ 只新增 1 个桶；
     · 竹竿用 6 边柱体；三角面全部落在"优先加三角面"的余量里（F 1.5M 上限，实测见回执）。 */
  if (typeof kit.instance === 'function' && fillPoints.bamboo.length > 0) {
    const parts = [];
    const stems = Math.max(3, FILL.bambooStems | 0);
    const tufts = Math.max(2, FILL.bambooLeafTufts | 0);
    for (let i = 0; i < stems; i += 1) {
      const h = fillRng.range(2.8, 6.4);
      const r = fillRng.range(0.075, 0.13);
      const a = (i / stems) * Math.PI * 2 + fillRng.range(-0.35, 0.35);
      const d = i === 0 ? 0.12 : fillRng.range(0.4, 0.95);
      const stem = new THREE.CylinderGeometry(r * 0.78, r, h, 6, 1, false);
      stem.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d);
      parts.push(stem);
    }
    for (let i = 0; i < tufts; i += 1) {
      const a = (i / tufts) * Math.PI * 2 + fillRng.range(-0.3, 0.3);
      const d = fillRng.range(0.35, 0.9);
      const h = fillRng.range(0.9, 1.5);
      const leaf = new THREE.CylinderGeometry(0.02, fillRng.range(0.42, 0.8), h, 5, 1, false);
      leaf.translate(Math.cos(a) * d, fillRng.range(2.6, 5.0), Math.sin(a) * d);
      parts.push(leaf);
    }
    // kit.merge 不在时退化为"取最粗的一根竹竿"——仍只产出一个几何，不改变批次数（不变量：本类别 ≤1 批次）
    const bambooProto = typeof kit.merge === 'function'
      ? kit.merge(parts)
      : (parts.forEach((g) => g.dispose?.()), new THREE.CylinderGeometry(0.11, 0.14, 5.2, 6, 1, false)).translate(0, 2.6, 0);
    if (bambooProto) {
      bambooProto.userData.part = 'shrub';
      bambooProto.userData.bambooCluster = true;
      bambooProto.userData.kitOwned = true;
      const protoMesh = new THREE.Mesh(bambooProto, matOf('foliage'));
      protoMesh.userData.part = 'shrub';
      const matrices = fillPoints.bamboo.map((p) => fillMatrix(p, fillRng.range(0.82, 1.18)));
      addFillBatch(protoMesh, matrices, { kind: 'bamboo', part: 'shrub', stems: FILL.bambooStems, leafTufts: FILL.bambooLeafTufts }, 'F-fill-bamboo');
    } else {
      note('fill-bamboo-no-proto', '竹丛原型为空，本类别退化为 0 批次（不占预算）');
    }
  }
  // 石作小件（石桌/石凳 → 铺装批次；铜缸 → 鎏金批次）：0 新调用
  for (const s of fillStones) {
    if (s.kind === 'bronzeVat') {
      if (typeof kit.bronze === 'function') {
        const vat = kit.bronze({ id: s.id, kind: 'vessel', size: 1.15, detail: 'mid' });
        vat.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
          }
        });
        vat.position.set(s.x, s.y, s.z);
        vat.userData.garden = { kind: 'bronzeVat', fill: true };
        root.add(vat);
      } else {
        note('fill-vat-fallback', `${s.id} 缺 bronze 工厂，用石体块兜底`);
        root.add(pavePiece({ id: s.id, w: s.w, d: s.d, x: s.x, z: s.z, top: s.y + s.h, bottom: s.y, material: MAT.pavingStone }));
      }
      continue;
    }
    const top = s.y + s.h;
    root.add(pavePiece({ id: `${s.id}-top`, name: s.kind === 'stoneTable' ? '御花园石桌' : '御花园石凳', w: s.w, d: s.d, x: s.x, z: s.z, top, bottom: top - 0.16, material: MAT.pavingStone }));
    if (s.kind === 'stoneTable') {
      root.add(pavePiece({ id: `${s.id}-base`, w: 0.8, d: 0.8, x: s.x, z: s.z, top: top - 0.16, bottom: s.y, material: MAT.pavingStone }));
    } else {
      for (const dx of [-s.w / 2 + 0.28, s.w / 2 - 0.28]) {
        root.add(pavePiece({ id: `${s.id}-leg-${dx > 0 ? 'b' : 'a'}`, w: 0.28, d: 0.4, x: s.x + dx, z: s.z, top: top - 0.16, bottom: s.y, material: MAT.pavingStone }));
      }
    }
  }
  // 填充铺装（园路/小广场/汀步）：并入既有铺装批次
  for (const p of fillPaving) {
    root.add(pavePiece({ id: p.id, name: p.kind === 'stepStone' ? '花园汀步' : p.kind === 'plaza' ? '花园小广场' : '花园支路', w: p.w, d: p.d, x: p.x, z: p.z, top: p.y + PAVE_LIFT + 0.02, bottom: p.y, material: p.kind === 'stepStone' ? MAT.pavingStone : MAT.paving }));
  }
  // 荷叶（水面点缀；并入 foliage 批次）
  if (typeof kit.paving === 'function') {
    for (const l of fillPoints.lilies) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.7, 0.06, 8), matOf('foliage'));
      pad.position.set(l.x, l.y + 0.03, l.z);
      pad.castShadow = true;
      pad.receiveShadow = true;
      pad.userData.garden = { kind: 'lilyPad', fill: true };
      root.add(pad);
    }
  }
  /** 新增实体的碰撞记录（按足迹登记；沿用 zoneLayout.obstacles 的字段与 sourceType 取值域）。 */
  const fillObstacles = [];
  const fillObstacleRect = (id, kind, x, z, w, d, y, h) => ({
    id,
    sourceType: 'rockery',   // ctx 契约的合法 sourceType 只有 building/wall/water/rockery；园中石作/花木取 rockery（提示文案为"请绕行"）
    zone: ZONE_ID,
    kind,
    bounds: rect(x - w / 2, x + w / 2, z - d / 2, z + d / 2),
    y0: round3(y),
    y1: round3(y + h),
    blocks: 'all',
    fill: true,
    note: `t171 花园填充：${kind}`,
  });
  for (const [i, p] of fillPoints.trees.entries()) fillObstacles.push(fillObstacleRect(`OB-F-fill-tree-${i + 1}`, 'tree', p.x, p.z, 1.0, 1.0, p.y, 9));
  for (const [i, p] of fillPoints.shrubs.entries()) fillObstacles.push(fillObstacleRect(`OB-F-fill-shrub-${i + 1}`, 'shrub', p.x, p.z, 1.1, 1.1, p.y, 2.0));
  for (const [i, p] of fillPoints.rocks.entries()) fillObstacles.push(fillObstacleRect(`OB-F-fill-rock-${i + 1}`, 'rockCluster', p.x, p.z, 3.2, 2.6, p.y, 1.7));
  /* t4 竹丛：按丛足迹登记（2.4×2.4 立柱体，阻碍半径 1.7 < 登记间距 4.2m ⇒ 与既有填充判据同口径） */
  for (const [i, p] of fillPoints.bamboo.entries()) fillObstacles.push(fillObstacleRect(`OB-F-fill-bamboo-${i + 1}`, 'bambooCluster', p.x, p.z, 2.4, 2.4, p.y, p.h));
  for (const s of fillStones) fillObstacles.push(fillObstacleRect(`OB-${s.id}`, s.kind, s.x, s.z, s.w, s.d, s.y, s.h));


  /* ======================================================================== */
  /*  5. 入城桥 4 座（含落底桥墩、桥台落地）                                       */
  /* ======================================================================== */

  const bridges = zoneLayout.connectors.filter((c) => c.kind === 'bridge');
  for (const bridge of bridges) {
    const spec = L.BRIDGES.find((b) => b.connectorId === bridge.id) ?? L.BRIDGES.find((b) => b.id === bridge.id.replace('CXN-', 'BRIDGE-'));
    if (!spec) {
      note('bridge-spec-missing', `${bridge.id} 不在 layout.BRIDGES 中`);
      continue;
    }
    const r = spec.bounds;
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const alongZ = rectDepth(r) >= rectWidth(r); // 南北桥跨沿 Z
    const span = alongZ ? rectDepth(r) : rectWidth(r);
    const width = spec.width;
    const deckY = spec.deckY;
    if (typeof kit.bridge !== 'function') {
      note('no-bridge-factory', `${spec.id} 缺少 kit.bridge`);
      continue;
    }
    root.add(kit.bridge({
      id: spec.id,
      name: spec.id,
      width,
      span,
      deckY,
      x: cx,
      z: cz,
      rotationYDeg: alongZ ? 0 : 90,
      detail: 'mid',
    }));
    const deckT = Math.max(0.5, deckY * 0.6);
    const pierTop = deckY - deckT;
    const piers = [];
    for (const offset of [-width / 2 + 0.8, width / 2 - 0.8]) {
      const strip = alongZ
        ? rect(cx + offset - 0.8, cx + offset + 0.8, r.minZ, r.maxZ)
        : rect(r.minX, r.maxX, cz + offset - 0.8, cz + offset + 0.8);
      const rec = addLand(`${spec.id}-pier-${offset < 0 ? 'a' : 'b'}`, strip, pierTop, MOAT_BED_Y, MAT.pier, 'bridgePier');
      piers.push({ id: rec.id, rect: rec.rect, y0: rec.y0, y1: rec.y1 });
    }
    const abutmentTop = deckY - deckT * 1.6;
    const abutments = [];
    for (const s of [-1, 1]) {
      const at = alongZ
        ? rect(cx - width / 2 - 1, cx + width / 2 + 1, cz + s * (span / 2 + 1.4) - 1.5, cz + s * (span / 2 + 1.4) + 1.5)
        : rect(cx + s * (span / 2 + 1.4) - 1.5, cx + s * (span / 2 + 1.4) + 1.5, cz - width / 2 - 1, cz + width / 2 + 1);
      const c = rectCenter(at);
      const groundTop = landTopAt(c.x, c.z);
      if (groundTop === null) continue;
      if (abutmentTop - groundTop > 0.02) {
        const rec = addLand(`${spec.id}-abutment-${s < 0 ? 'a' : 'b'}`, at, abutmentTop, groundTop, MAT.pier, 'bridgeAbutment');
        abutments.push({ id: rec.id, rect: rec.rect, y0: rec.y0, y1: rec.y1 });
      }
    }
    const archR = Math.min(span * 0.18, deckY + Math.max(1.2, Math.abs(T.moatWaterY) * 0.5));
    const archTube = Math.max(0.4, width * 0.05);
    audit.bridges.push({
      id: spec.id,
      connectorId: spec.connectorId,
      rect: roundRect(r),
      alongZ,
      width,
      span,
      deckY: round3(deckY),
      deckTop: round3(deckY + 0.12),
      deckBottom: round3(pierTop),
      piers,
      abutments,
      /** kit.bridge 内部拱券（2 道半环）最低点：水下拱脚，由落底桥墩体量包住（见回执说明） */
      kitArchLowestY: round3(pierTop - archR + archTube - archR),
      kitArchRadius: round3(archR),
    });
    const deckRoad = L.ROADS.find((rd) => rd.connector === bridge.id) ?? null;
    audit.roads.push({
      id: `${spec.id}-deck`,
      roadId: deckRoad ? deckRoad.id : null,
      connector: bridge.id,
      rect: roundRect(r),
      y0: round3(pierTop),
      y1: round3(deckY + 0.12),
      axisAligned: true,
      overWater: true,
      onBridge: true,
    });
  }

  /* ======================================================================== */
  /*  6. 道路（F 全部 ROAD 段；桥面由桥体承担；临水段做栈道 + 落底支墩）            */
  /* ======================================================================== */

  const bridgeConnectors = new Set(bridges.map((b) => b.id));

  function addSupport(id, r, top, bottom, material = MAT.pier) {
    const rec = addLand(id, r, top, bottom, material, 'support');
    supports.push({ id: rec.id, rect: rec.rect, y0: rec.y0, y1: rec.y1 });
    return rec;
  }

  function buildRoadPieces(road) {
    if (bridgeConnectors.has(road.connector)) return; // 桥面由 kit.bridge 承担
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const len = Math.hypot(dx, dz);
    if (!(len > 0)) return;
    const axisX = Math.abs(dz) < 1e-6;
    const axisZ = Math.abs(dx) < 1e-6;
    const half = road.width / 2;
    const n = Math.max(1, Math.ceil(len / (axisX || axisZ ? 4 : 3)));
    const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    for (let i = 0; i < n; i += 1) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const tm = (t0 + t1) / 2;
      const yRoad = roadYAt(road, tm);
      const id = `${road.id}#${i + 1}`;
      if (axisX || axisZ) {
        const r0 = axisX
          ? rect(Math.min(road.from.x + dx * t0, road.from.x + dx * t1), Math.max(road.from.x + dx * t0, road.from.x + dx * t1), road.from.z - half, road.from.z + half)
          : rect(road.from.x - half, road.from.x + half, Math.min(road.from.z + dz * t0, road.from.z + dz * t1), Math.max(road.from.z + dz * t0, road.from.z + dz * t1));
        // 按水体切分：陆上部分落在地面，水上部分做栈道 + 落底支墩
        let landPieces = [r0];
        const overPieces = [];
        for (const w of waterRects()) {
          const next = [];
          for (const p of landPieces) {
            const inter = intersect2D(p, w.rect);
            if (!inter) {
              next.push(p);
              continue;
            }
            overPieces.push({ r: inter, water: w });
            next.push(...subtractRect(p, w.rect));
          }
          landPieces = next;
        }
        landPieces.forEach((p, k) => {
          if (rectWidth(p) <= 0.05 || rectDepth(p) <= 0.05) return;
          const c = rectCenter(p);
          const ground = groundTopAt(c.x, c.z);
          if (ground.source !== 'zone') note('road-neighbor-ground', `${id} 落在邻区地坪（${ground.source}，y=${ground.y}）`);
          const top = Math.max(ground.y + 0.02, yRoad + PAVE_LIFT);
          const rec = addLand(`${id}${k > 0 ? `-${k + 1}` : ''}`, p, top, ground.y, MAT.paving, 'road');
          audit.roads.push({ id: rec.id, roadId: road.id, rect: rec.rect, y0: rec.y0, y1: rec.y1, surface: road.surface, connector: road.connector, overWater: false, axisAligned: true, groundSource: ground.source });
        });
        overPieces.forEach((o, k) => {
          if (rectWidth(o.r) <= 0.05 || rectDepth(o.r) <= 0.05) return;
          const top = Math.max(o.water.y1 + WATER_CLEARANCE + 0.02, yRoad + PAVE_LIFT);
          const bottom = o.water.y1 + WATER_CLEARANCE;
          const rec = addLand(`${id}-deck${k + 1}`, o.r, top, bottom, MAT.paving, 'road');
          audit.roads.push({ id: rec.id, roadId: road.id, rect: rec.rect, y0: rec.y0, y1: rec.y1, surface: road.surface, connector: road.connector, overWater: true, waterId: o.water.id, axisAligned: true });
          const c = rectCenter(o.r);
          addSupport(`${id}-support${k + 1}`, rect(c.x - 0.35, c.x + 0.35, c.z - 0.35, c.z + 0.35), bottom, -0.4 + 0.02);
        });
      } else {
        // 斜向段（少数，不跨水）：单块旋转铺装
        const px = road.from.x + dx * tm;
        const pz = road.from.z + dz * tm;
        const ground = groundTopAt(px, pz);
        if (ground.source !== 'zone') note('road-neighbor-ground', `${id} 斜向段落在邻区地坪（${ground.source}，y=${ground.y}）`);
        const groundTop = ground.y;
        const top = Math.max(groundTop + 0.02, yRoad + PAVE_LIFT);
        const segLen = len / n + 0.3;
        root.add(pavePiece({ id, name: road.name, w: segLen, d: road.width, x: px, z: pz, top, bottom: groundTop, material: MAT.paving, rotationYDeg: yaw }));
        const aabb = rect(px - segLen / 2, px + segLen / 2, pz - road.width / 2, pz + road.width / 2);
        audit.roads.push({ id, roadId: road.id, rect: roundRect(aabb), y0: round3(groundTop), y1: round3(top), surface: road.surface, connector: road.connector, overWater: false, axisAligned: false, rotationYDeg: round3(yaw), groundSource: ground.source });
      }
    }
  }

  for (const road of F_ROADS) buildRoadPieces(road);
  audit.notes.push(`道路铺装 ${audit.roads.length} 块（跨水栈道 ${audit.roads.filter((r) => r.overWater && !r.onBridge).length} 块 + 桥面 ${audit.roads.filter((r) => r.onBridge).length} 块）；落底支墩 ${supports.length} 个`);

  /* ---------------------------------------------------------------- 6b. t31 池上石栈道（同轮登记）
   * 「先修几何，谓词收窄才安全」：两座花园配殿的正门通道面南段 5.0m 原被水池盖住，
   * 只能靠谓词层"整进深门洞豁免"从**水面**穿过（幻影通道）。本卡按 t13 先例：
   *   · layout 侧 `F_POND_WALKWAYS`（唯一权威源）⇒ ① 水体障碍**有界开槽**（blocks:'exceptDoor' + door）
   *     ② 两条 `surface:'bridgeDeck'` 道路段（求解器放行水面的唯一机制）；
   *   · 本区侧沿用**既有道路铺装管线**（`buildRoadPieces`）自动产出石顶 + 落底支墩
   *     ⇒ **可见石件与登记者同轮**，且并入既有铺装/石作批次（**0 新增绘制调用**）。
   * 这里把"石件 ↔ 登记"的对应关系落成机器可读记录（供 tests/zone-garden.test.mjs 逐项对账）。 */
  const pondWalkways = (L.F_POND_WALKWAYS ?? LAYOUT_MODULE.F_POND_WALKWAYS ?? []).map((w) => {
    const roadId = `RD-${w.id}-pond-walk`;
    const deck = audit.roads.filter((r) => r.roadId === roadId && r.overWater === true);
    const land = audit.roads.filter((r) => r.roadId === roadId && r.overWater !== true);
    const piers = supports.filter((s) => s.id.startsWith(`${roadId}#`));
    const deckTop = deck.length > 0 ? Math.max(...deck.map((d) => d.y1)) : null;
    return {
      id: w.id,
      roadId,
      pondId: w.pondId,
      axis: 'z',
      corridor: { x: w.x, width: w.width, minZ: w.minZ, maxZ: w.maxZ },
      registeredY: w.y,
      pieceIds: [...deck, ...land].map((d) => d.id),
      deckTop: deckTop === null ? null : round3(deckTop),
      overWaterPieces: deck.length,
      landPieces: land.length,
      piers: piers.map((p) => ({ id: p.id, y0: p.y0, y1: p.y1 })),
      /** 本栈道是否真的跨过水面（判据之一；false ⇒ 开槽无石件承载） */
      crossesWater: deck.length > 0,
    };
  });
  audit.walkways = pondWalkways;
  audit.notes.push(`池上石栈道 ${pondWalkways.length} 条（t31）：`
    + pondWalkways.map((w) => `${w.id} 走廊 x=${w.corridor.x}±${w.corridor.width / 2}、z ${w.corridor.minZ}…${w.corridor.maxZ}、石顶 ${w.deckTop}、跨水件 ${w.overWaterPieces} 块、落底支墩 ${w.piers.length} 根`).join(' | '));

  /* ======================================================================== */
  /*  7. 整区合批 + 水面标记                                                     */
  /* ======================================================================== */

  let mergeStats = null;
  const preMergePieces = countMeshes(root);
  if (typeof kit.mergeZone === 'function') {
    const res = kit.mergeZone(root);
    mergeStats = { preMerge: preMergePieces, ...res.stats };
    // 清理被合批后残留的空 Group（合批只搬走 mesh，不删容器）
    for (const child of [...root.children]) {
      if (child.isGroup && child.children.length === 0) root.remove(child);
    }
  } else {
    note('no-merge-zone', 'kit 缺少 mergeZone，未做整区合批');
  }

  const waterMaterial = matOf(MAT.water);
  const waterMeshes = [];
  root.traverse((node) => {
    if (node.isMesh && node.material === waterMaterial) {
      node.userData.waterSurface = true;
      node.castShadow = false;
      waterMeshes.push(node);
    }
  });
  if (Array.isArray(ctx?.shared?.water)) ctx.shared.water.push(...waterMeshes);

  /* ======================================================================== */
  /*  8. 返回对象（CONTRACTS §3.3）                                              */
  /* ======================================================================== */

  const connectors = zoneLayout.connectors.map((c) => ({ ...c, position: { ...c.position } }));
  const colliders = {
    obstacles: zoneLayout.obstacles.map((o) => ({ ...o, bounds: { ...o.bounds }, door: o.door ? { ...o.door, center: { ...o.door.center } } : null })),
    walkable: zoneLayout.walkable.map((w) => ({ ...w, bounds: { ...w.bounds } })),
    ramps: rampsFromRoads(F_ROADS),
  };
  // t171：花园填充的新增实体按足迹登记障碍（运行期玩家会真实碰撞；layout 侧数据未改 ⇒ 四护栏/布局口径不变）
  for (const o of fillObstacles) colliders.obstacles.push({ ...o, bounds: { ...o.bounds } });
  audit.fill = {
    rect: roundRect(FILL.rect),
    grid: { cols: FILL.cols, rows: FILL.rows, blockW: round3(FILL_BW), blockD: round3(FILL_BD) },
    densityBefore: fillDensityBefore,
    densityAfter: fillDensityAfter,
    emptiestBefore: fillEmptiestBefore,
    targets: fillTargets.map((b) => ({ ix: b.ix, iz: b.iz, score: b.score })),
    trees: { count: fillPoints.trees.length, height: config.PLANTS.treeHeights.medium, instances: fillInstances.filter((i) => i.kind === 'tree') },
    shrubs: { count: fillPoints.shrubs.length, instances: fillInstances.filter((i) => i.kind === 'tree' && i.shrubs) },
    flowers: { beds: fillPoints.flowers.length, canopies: fillPoints.flowers.length * FILL.flowerPerBed, instances: fillInstances.filter((i) => i.kind === 'flower') },
    rocks: { clusters: fillPoints.rocks.length, boulders: fillPoints.rocks.length * FILL.rocksPerCluster, instances: fillInstances.filter((i) => i.kind === 'rock') },
    /* t4：竹丛（下木层）——本卡唯一新增实例批次 */
    bamboo: {
      count: fillPoints.bamboo.length,
      stems: FILL.bambooStems,
      leafTufts: FILL.bambooLeafTufts,
      heightRange: [round3(config.PLANTS.treeHeights.medium * 0.62 * 0.82), round3(config.PLANTS.treeHeights.medium * 0.62 * 1.18)],
      instances: fillInstances.filter((i) => i.kind === 'bamboo'),
    },
    stones: fillStones.map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, rect: roundRect(rect(s.x - s.w / 2, s.x + s.w / 2, s.z - s.d / 2, s.z + s.d / 2)) })),
    paving: fillPaving.map((p) => ({ id: p.id, kind: p.kind, rect: roundRect(p.rect), x: p.x, z: p.z })),
    waterDecor: { lilyPads: fillPoints.lilies.length, lotus: fillPoints.lotus.length },
    instances: fillInstances,
    newBatches: fillInstances.length,
    obstacles: fillObstacles.map((o) => ({ id: o.id, kind: o.kind, bounds: roundRect(o.bounds), y0: o.y0, y1: o.y1 })),
    notes: fillNotes,
  };
  const viewpoints = zoneLayout.viewpoints.map((v) => ({ ...v, position: { ...v.position }, target: { ...v.target } }));

  const meshCount = countMeshes(root);
  const triangleCount = typeof kit.countTriangles === 'function' ? kit.countTriangles(root) : countTrianglesOf(root);
  const drawCalls = typeof kit.countDrawCalls === 'function' ? kit.countDrawCalls(root) : meshCount;

  const stats = {
    kind: 'garden-boundary',
    zoneId: ZONE_ID,
    version: ZONE_VERSION,
    kitSource,
    buildings: buildings.length,
    cornerTowers: towerSlots.length,
    cityGates: gateSlots.length,
    gardenBuildings: gardenSlots.length,
    corridors: corridors.length,
    wallSegments: audit.walls.length,
    wallOpenings: audit.walls.reduce((n, w) => n + w.openings.length, 0),
    platforms: audit.platforms.length,
    waterBodies: audit.water.length,
    landSlabs: audit.land.length,
    bridges: audit.bridges.length,
    roadSegments: F_ROADS.length,
    roadPieces: audit.roads.length,
    supports: supports.length,
    /* t31：池上石栈道（有界开槽的可见石件）—— 与 layout.F_POND_WALKWAYS 同源同轮 */
    walkways: pondWalkways.length,
    walkwayPieces: pondWalkways.reduce((n, w) => n + w.overWaterPieces + w.landPieces, 0),
    walkwayPiers: pondWalkways.reduce((n, w) => n + w.piers.length, 0),
    trees: audit.trees.count,
    treeInstances: treeInstances.length,
    lanterns: lightAnchors.length,
    lanternInstances: lanternInstances.length,
    windingPath: winding,
    interiors: interiors.length,
    interiorTriangles: interiors.reduce((n, i) => n + i.triangles, 0),
    interiorItems: interiors.map((i) => `${i.slotId}:${i.items.length}`).join(' '),
    interiorLightAnchors: interiorLightAnchors.length,
    connectors: connectors.length,
    obstacles: colliders.obstacles.length,
    walkable: colliders.walkable.length,
    ramps: colliders.ramps.length,
    viewpoints: viewpoints.length,
    lightAnchors: lightAnchors.length,
    preMergePieces,
    merged: mergeStats,
    meshes: meshCount,
    drawCalls,
    triangles: triangleCount,
    waterMeshes: waterMeshes.length,
    diagnostics: diagnostics.map((d) => d.code),
  };
  /** t171：花园填充统计（供 zone 测试与回执引用；不改变既有字段语义）。 */
  stats.fill = {
    trees: fillPoints.trees.length,
    shrubs: fillPoints.shrubs.length,
    bambooClusters: fillPoints.bamboo.length,   // t4 新增类别
    flowerBeds: fillPoints.flowers.length,
    rockClusters: fillPoints.rocks.length,
    stones: fillStones.length,
    paving: fillPaving.length,
    lilyPads: fillPoints.lilies.length,
    lotus: fillPoints.lotus.length,
    newBatches: fillInstances.length,
    /* t4：只统计**本卡新增**的批次（竹丛），既有 4 批仍由 t171 口径回显 */
    t4NewBatches: fillInstances.filter((i) => i.kind === 'bamboo').length,
    obstacles: fillObstacles.length,
    avgCoverageBefore: +(fillDensityBefore.reduce((s2, b) => s2 + b.coverage, 0) / fillDensityBefore.length).toFixed(4),
    avgCoverageAfter: +(fillDensityAfter.reduce((s2, b) => s2 + b.coverage, 0) / fillDensityAfter.length).toFixed(4),
    emptyBlocksBefore: fillDensityBefore.filter((b) => b.trees + b.fill <= 2).length,
    emptyBlocksAfter: fillDensityAfter.filter((b) => b.trees + b.fill <= 2).length,
  };

  let disposed = false;
  let elapsedSeen = 0;
  return {
    root,
    buildings,
    connectors,
    colliders,
    viewpoints,
    lightAnchors,
    update(dtSeconds) {
      // 树/水/灯动画由 src/core/environment.js 统一处理；本区不碰相机与 state
      elapsedSeen += Number.isFinite(dtSeconds) ? dtSeconds : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const freed = { geometries: 0, meshes: 0, materials: 0 };
      const seen = new Set();
      root.traverse((node) => {
        if (!node.isMesh && !node.isInstancedMesh && !node.isPoints) return;
        const geo = node.geometry;
        if (geo && !seen.has(geo) && (geo.userData?.kitOwned === true || geo.userData?.zoneOwned === true)) {
          seen.add(geo);
          geo.dispose();
          freed.geometries += 1;
        }
        freed.meshes += 1;
      });
      // 共享 kit 材质归 t3 缓存管理：本区不 dispose（否则会销毁其他区域仍在用的材质）
      root.clear();
      stats.disposed = freed;
    },
    stats,
    /** 机器可读施工记录：供 tests/zone-garden.test.mjs 校验闭合/不穿插/落地/预算（非契约字段，G 不消费） */
    audit,
    get elapsedSeen() {
      return elapsedSeen;
    },
  };
}

/** 由 F 区道路派生坡道/台阶（CONTRACTS §6.2：Δy ≠ 0 的段）。 */
function rampsFromRoads(roads) {
  return roads
    .filter((r) => Math.abs(r.from.y - r.to.y) > 1e-6)
    .map((r) => ({
      id: `RAMP-${r.id}`,
      zone: r.zone,
      name: r.name,
      from: { x: r.from.x, z: r.from.z, y: r.from.y },
      to: { x: r.to.x, z: r.to.z, y: r.to.y },
      width: r.width,
      slope: r.slope,
      surface: r.surface,
      connector: r.connector,
    }));
}

export default createZone;
