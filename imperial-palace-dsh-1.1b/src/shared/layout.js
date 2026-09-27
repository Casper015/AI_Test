/**
 * 紫禁天朝 · 全城唯一布局注册表（single source of truth for the city）
 * =============================================================================
 * 对应计划：§2.2 布局示意、§2.3 坐标/区域边界/连接规则、§5 各区域要求、§6.1 建筑与碰撞注册、§6.4 视角登记。
 *
 * 纪律：
 *   1. 建筑槽位（SLOTS）、院落（COURTYARDS）、跨区通道（CONNECTORS）、道路（ROADS）、
 *      可行走面（WALKABLE）、障碍（OBSTACLES）、视角（VIEWPOINTS）只在本文件定义。
 *      区域代码（t6/t7/t8/t10/t11）按 id 消费，不得自行扩张边界或新增建筑。
 *   2. 全部坐标为世界坐标，单位米；Y 向上，X 向东，Z 向北；建筑默认正面朝南（-Z）。
 *   3. 数值只从 config.js 取值（模数/材质/标高/预算），本文件不重复定义风格数值。
 *   4. 本文件是纯 ESM，只 import './config.js'，可被 Node 直接 import（无 three、无 DOM）。
 *   5. 全部导出深冻结。
 */

import {
  LAYOUT_CONSTRAINTS,
  MODULES,
  GRADES,
  ROOF_TYPES,
  TERRAIN,
  ORIENTATION,
  SCENE_SEED,
  deriveSeed,
  deepFreeze,
} from './config.js';

export const LAYOUT_VERSION = '1.1.19'; // t151：C 两殿门外加法下坡带（未被覆盖窗口内 1.9/1.4） // t145：C 两殿台基接近走廊有界开槽（0.9↔1.3 恢复相邻） // t134：删除 4 片开槽残片，使门带不再被更高面取高（门洞节点高度回到 1.5/1.7） // t131：通路存在守卫 + 加法补 E-court3-hall 门外台阶 // t128：C 两栋遮蔽开槽（第二次授权减法）+ 遮蔽常驻守卫 + C 侧分级台阶 // t126：tier2 有界开槽（两条坡道走廊，主理人授权的减法例外）+ 遮蔽普查 // t121：过渡台阶足印进深 ≥1.05m（cellSize:1 网格可见），18 栋门外分级过渡 // t119：ZONES.drawCallBudget 对齐唯一权威源 config.BUDGET.drawCalls.perZone（C60/D56/E56） // t117：门洞可通行性声明与实际一致（passable/blockedBy 具名登记） // t103：10 座开敞亭可通行化（hasDoor→exceptDoor）+ B 两座入口门槛 // t102：按 t100 权威 Δ 清单登记门外过渡台阶（仅登记几何，不宣称可达） // t97：S() 内补区域地坪（door.sillY = 区域地坪 + 本地台基；24 栋 C/D/E 基准统一）

/* =============================================================================
 * 一、包络、区域边界与外墙（§2.3）
 * ========================================================================== */

/** 宫墙内表面 = 计划 §2.3 初始设计包络：X∈[-300,300]、Z∈[-450,450]。 */
export const ENVELOPE = Object.freeze({ ...LAYOUT_CONSTRAINTS.envelope });

/** 中央区 X∈[-100,100]。 */
export const CENTRAL_X = Object.freeze({ ...LAYOUT_CONSTRAINTS.central });
/** 前朝 Z∈[-400,80]。 */
export const FORECOURT_Z = Object.freeze({ ...LAYOUT_CONSTRAINTS.forecourtZ });
/** 后宫 Z∈[80,300]。 */
export const INNER_PALACE_Z = Object.freeze({ ...LAYOUT_CONSTRAINTS.innerPalaceZ });
/** 花园 Z∈[300,420]。 */
export const GARDEN_Z = Object.freeze({ ...LAYOUT_CONSTRAINTS.gardenZ });

/**
 * 仅 F（边界区）的城墙附着构件允许向包络外突出：墙厚 8m + 角楼半径 10m = 18m。
 * 这是 §2.3 "护城河、桥梁和外侧地形在包络外留出空间" 的落地方式；
 * 其余区域（B/C/D/E）的槽位必须严格落在包络内。
 */
export const WALL_OUTER_OVERHANG = LAYOUT_CONSTRAINTS.wallOuterOverhang;

/** F 区实际覆盖范围 = 包络 ± 18m。 */
export const OUTER_BOUNDS = Object.freeze({
  minX: ENVELOPE.minX - WALL_OUTER_OVERHANG,
  maxX: ENVELOPE.maxX + WALL_OUTER_OVERHANG,
  minZ: ENVELOPE.minZ - WALL_OUTER_OVERHANG,
  maxZ: ENVELOPE.maxZ + WALL_OUTER_OVERHANG,
});

/** 外墙外侧地形范围（护城河之外）。 */
export const TERRAIN_EXTENT = Object.freeze({ minX: -420, maxX: 420, minZ: -560, maxZ: 560 });

/** 宫墙：内表面贴包络，墙体向外；四段墙 + 四角角楼 + 四面外城门。 */
export const CITY_WALL = Object.freeze({
  id: 'WALL-CITY',
  owner: 'F',
  thickness: MODULES.wallThickness,
  height: MODULES.wallHeight,
  battlementHeight: MODULES.wallBattlementHeight,
  innerFace: ENVELOPE,
  centerline: Object.freeze({ x: ENVELOPE.maxX + MODULES.wallThickness / 2, z: ENVELOPE.maxZ + MODULES.wallThickness / 2 }),
  outerFace: Object.freeze({ x: ENVELOPE.maxX + MODULES.wallThickness, z: ENVELOPE.maxZ + MODULES.wallThickness }),
  closed: true,
  cornerTowerSlots: Object.freeze([
    'F-tower-corner-nw',
    'F-tower-corner-ne',
    'F-tower-corner-sw',
    'F-tower-corner-se',
  ]),
  cityGateSlots: Object.freeze(['F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east']),
});

/** 护城河：四段矩形拼成闭合环，常水位取 config.TERRAIN.moatWaterY。 */
export const MOAT = Object.freeze({
  id: 'MOAT-CITY',
  owner: 'F',
  width: MODULES.moatWidth,
  waterY: TERRAIN.moatWaterY,
  depth: MODULES.moatDepth,
  rects: Object.freeze([
    Object.freeze({ id: 'MOAT-south', bounds: Object.freeze({ minX: -332, maxX: 332, minZ: -506, maxZ: -472 }) }),
    Object.freeze({ id: 'MOAT-north', bounds: Object.freeze({ minX: -332, maxX: 332, minZ: 472, maxZ: 506 }) }),
    Object.freeze({ id: 'MOAT-west', bounds: Object.freeze({ minX: -366, maxX: -332, minZ: -506, maxZ: 506 }) }),
    Object.freeze({ id: 'MOAT-east', bounds: Object.freeze({ minX: 332, maxX: 366, minZ: -506, maxZ: 506 }) }),
  ]),
});

/** 四座入城桥（南为主入口桥，§5.5 入口桥）。 */
export const BRIDGES = Object.freeze([
  Object.freeze({
    id: 'BRIDGE-south',
    owner: 'F',
    connectorId: 'CXN-bridge-south',
    deckY: TERRAIN.bridgeDeckY,
    width: MODULES.bridgeDeckWidth,
    bounds: Object.freeze({ minX: -8, maxX: 8, minZ: -506, maxZ: -472 }),
  }),
  Object.freeze({
    id: 'BRIDGE-north',
    owner: 'F',
    connectorId: 'CXN-bridge-north',
    deckY: TERRAIN.bridgeDeckY,
    width: MODULES.bridgeDeckWidth,
    bounds: Object.freeze({ minX: -8, maxX: 8, minZ: 472, maxZ: 506 }),
  }),
  Object.freeze({
    id: 'BRIDGE-west',
    owner: 'F',
    connectorId: 'CXN-bridge-west',
    deckY: TERRAIN.bridgeDeckY,
    width: 12,
    bounds: Object.freeze({ minX: -366, maxX: -332, minZ: -6, maxZ: 6 }),
  }),
  Object.freeze({
    id: 'BRIDGE-east',
    owner: 'F',
    connectorId: 'CXN-bridge-east',
    deckY: TERRAIN.bridgeDeckY,
    width: 12,
    bounds: Object.freeze({ minX: 332, maxX: 366, minZ: -6, maxZ: 6 }),
  }),
]);

/* =============================================================================
 * 二、ZONES 与 tiles（不重叠地铺满包络，墙环在包络之外）
 * ========================================================================== */

const b = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

/**
 * 区域与子区。`bounds` = 该区域拥有的矩形范围（用于机器校验槽位归属）；
 * `tiles` = 实际建造/归属的子矩形（B/C/D/E 与 F 的 belt/garden/wall 条带不重叠铺满包络，墙环在包络外）。
 * `groundY` = 该区域主地坪标高（各区自带标高，不统一抬高，§2.3）。
 */
export const ZONES = deepFreeze([
  {
    id: 'B',
    name: '中轴前朝',
    area: 'forecourt',
    owner: 't6 zone-forecourt',
    file: 'src/zones/forecourt.js',
    bounds: b(CENTRAL_X.minX, CENTRAL_X.maxX, FORECOURT_Z.minZ, FORECOURT_Z.maxZ),
    groundY: TERRAIN.terraceGroundY,
    drawCallBudget: 70,
    boundaryZone: false,
    tiles: [{ id: 'T-B', bounds: b(-100, 100, -400, 80), groundY: TERRAIN.terraceGroundY }],
    axisOrder: 1,
  },
  {
    id: 'C',
    name: '后宫',
    area: 'innerPalace',
    owner: 't7 zone-inner',
    file: 'src/zones/inner-palace.js',
    bounds: b(CENTRAL_X.minX, CENTRAL_X.maxX, INNER_PALACE_Z.minZ, INNER_PALACE_Z.maxZ),
    groundY: TERRAIN.innerPalaceY,
    drawCallBudget: 60,
    boundaryZone: false,
    tiles: [{ id: 'T-C', bounds: b(-100, 100, 80, 300), groundY: TERRAIN.innerPalaceY }],
    axisOrder: 2,
  },
  {
    id: 'D',
    name: '西侧宫苑',
    area: 'west',
    owner: 't10 zone-forecourt',
    file: 'src/zones/west-courts.js',
    bounds: b(ENVELOPE.minX, CENTRAL_X.minX, FORECOURT_Z.minZ, INNER_PALACE_Z.maxZ),
    groundY: TERRAIN.sideCourtY,
    drawCallBudget: 56,
    boundaryZone: false,
    tiles: [{ id: 'T-D', bounds: b(-300, -100, -400, 300), groundY: TERRAIN.sideCourtY }],
    axisOrder: 0,
  },
  {
    id: 'E',
    name: '东侧宫苑',
    area: 'east',
    owner: 't11 zone-inner',
    file: 'src/zones/east-courts.js',
    bounds: b(CENTRAL_X.maxX, ENVELOPE.maxX, FORECOURT_Z.minZ, INNER_PALACE_Z.maxZ),
    groundY: TERRAIN.sideCourtY,
    drawCallBudget: 56,
    boundaryZone: false,
    tiles: [{ id: 'T-E', bounds: b(100, 300, -400, 300), groundY: TERRAIN.sideCourtY }],
    axisOrder: 0,
  },
  {
    id: 'F',
    name: '御花园、宫墙与边界',
    area: 'gardenBoundary',
    owner: 't8 zone-garden',
    file: 'src/zones/garden-boundary.js',
    bounds: b(OUTER_BOUNDS.minX, OUTER_BOUNDS.maxX, OUTER_BOUNDS.minZ, OUTER_BOUNDS.maxZ),
    innerFace: ENVELOPE,
    groundY: TERRAIN.cityGroundY,
    drawCallBudget: 80,
    boundaryZone: true,
    tiles: [
      { id: 'T-F-south-belt', bounds: b(-300, 300, -450, -400), groundY: TERRAIN.beltY },
      { id: 'T-F-garden', bounds: b(-300, 300, 300, 420), groundY: TERRAIN.gardenPathsY },
      { id: 'T-F-north-belt', bounds: b(-300, 300, 420, 450), groundY: TERRAIN.beltY },
      { id: 'T-F-wall-west', bounds: b(-318, -300, -468, 468), groundY: TERRAIN.cityGroundY },
      { id: 'T-F-wall-east', bounds: b(300, 318, -468, 468), groundY: TERRAIN.cityGroundY },
      { id: 'T-F-wall-south', bounds: b(-300, 300, -468, -450), groundY: TERRAIN.cityGroundY },
      { id: 'T-F-wall-north', bounds: b(-300, 300, 450, 468), groundY: TERRAIN.cityGroundY },
      { id: 'T-F-outer-terrain', bounds: b(-420, 420, -560, 560), groundY: TERRAIN.outerTerrainY },
    ],
    axisOrder: 3,
  },
]);

/** 由 tiles 求区域 / 地坪标高（F 的 tiles 覆盖墙环与外侧地形）。 */
export function tileAt(x, z) {
  for (const zone of ZONES) {
    for (const tile of zone.tiles) {
      const t = tile.bounds;
      if (x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ) return { zone: zone.id, tile: tile.id, groundY: tile.groundY };
    }
  }
  return null;
}

export function zoneAt(x, z) {
  const hit = tileAt(x, z);
  return hit ? hit.zone : null;
}

export function groundYAt(x, z) {
  const hit = tileAt(x, z);
  return hit ? hit.groundY : null;
}

/** 判断点是否在宫墙内（§2.3 包络）。 */
export function insideEnvelope(x, z) {
  return x >= ENVELOPE.minX && x <= ENVELOPE.maxX && z >= ENVELOPE.minZ && z <= ENVELOPE.maxZ;
}

/* =============================================================================
 * 三、SLOTS：可独立识别的有顶建筑槽位（≥54；B/C/D/E 各 ≥8，F ≥10）
 * ========================================================================== */

const DIR_VEC = ORIENTATION.facingVectors;

/** 面阔（正立面宽度）：朝南/朝北时取 w，朝东/朝西时取 d。 */
function facadeWidth(slot) {
  return slot.facing === 'south' || slot.facing === 'north' ? slot.w : slot.d;
}

/** 门洞净宽：面阔 × gateOpeningRatio，取偶数值并夹在 [8, 26]m。 */
function passageWidth(slot) {
  const raw = facadeWidth(slot) * MODULES.gateOpeningRatio;
  const even = Math.round(raw / 2) * 2;
  return Math.max(8, Math.min(26, even));
}

const DEFAULT_USAGE = Object.freeze({
  hall: '殿堂',
  gateHall: '宫门与门洞通道',
  sideHall: '配殿 / 厢房',
  pavilion: '亭阁',
  cornerTower: '角楼',
  courtyardGate: '院门',
});

const PASSABLE_KINDS = Object.freeze(['gateHall', 'courtyardGate']);

/**
 * 构造一个建筑槽位（全部字段一次说清，下游按此注册）。
 * opts: bays / terraceH / roofType / grade / facing / visitable / usage / onWall
 */
/* t83：**区域地坪**（与 layout.ZONES[].groundY 逐值一致，由 layout.test 交叉断言）。
   派生内景的地面/机位/走查点必须 = 区域地坪 + slot.baseY —— 早期版本漏加此项，
   导致 C(−0.9)/D(−0.4)/E(−0.4) 三区内景整体偏低（家具会埋进台明）。 */
const ZONE_GROUND_Y = Object.freeze({ B: 0, C: 0.9, D: 0.4, E: 0.4, F: 0 });
const zoneGroundY = (zone) => ZONE_GROUND_Y[zone] ?? 0;

function S(id, name, kind, zone, x, z, w, d, opts = {}) {
  const facing = opts.facing ?? 'south';
  const grade = opts.grade ?? 2;
  const g = GRADES[grade];
  const roofType = opts.roofType ?? 'gableHip';
  const roof = ROOF_TYPES[roofType];
  const terraceH = opts.terraceH ?? MODULES.plinthHeightMin;
  const onWall = opts.onWall === true;
  const visitable = opts.visitable === true;
  const spanDepth = facing === 'south' || facing === 'north' ? d : w;
  const bodyBaseY = (onWall ? CITY_WALL.height : 0) + terraceH;
  const eave = +(bodyBaseY + MODULES.eaveHeight * g.eaveHeightFactor).toFixed(2);
  const roofRise = +(spanDepth * roof.riseRatio * 0.5).toFixed(2);
  const doubleEaveLift = roof.doubleEave ? +(MODULES.eaveHeight * 0.35).toFixed(2) : 0;
  const totalHeight = +(eave + roofRise + doubleEaveLift).toFixed(2);
  const vec = DIR_VEC[facing];
  const hasDoor = opts.hasDoor === true || PASSABLE_KINDS.includes(kind) || visitable; // t103：显式 opts.hasDoor（亭可通行化）
  const doorWidth = hasDoor ? passageWidth({ facing, w, d }) : 0;
  const entrance = {
    x: +(x + (vec.x * w) / 2).toFixed(2),
    z: +(z + (vec.z * d) / 2).toFixed(2),
    y: +bodyBaseY.toFixed(2),
  };
  const baseY = +(onWall ? CITY_WALL.height + terraceH : terraceH).toFixed(2);
  return {
    id,
    name,
    kind,
    category: kind,
    zone,
    x,
    z,
    w,
    d,
    bays: opts.bays ?? 3,
    terraceH,
    roofType,
    grade,
    facing,
    rotationYDeg: ORIENTATION.rotationYDeg[facing],
    visitable,
    onWall,
    baseY,
    bodyBaseY: +bodyBaseY.toFixed(2),
    eaveHeight: eave,
    totalHeight,
    hasDoor,
    doorWidth,
    door: hasDoor
      ? {
          /* `center` = **建筑中心**（不是门脸点！t100-F3 实证：B-side-west-main center=(-80,-116) vs 东立面 x=-72）；
             `facade` = **门外锚点** = 通道面进深轴（短边）外端中心 = 外墙面向外 6.0m 处（与 `WK-*-door-passage` 外端一致），
             供"贴门取地面/登记过渡"的工具作为**唯一门外基准**使用。 */
          axis: facing === 'south' || facing === 'north' ? 'z' : 'x',
          center: { x, z },
          facade: {
            x: +(x + (DIR_VEC[facing].x * (w / 2 + 6.0))).toFixed(2),
            z: +(z + (DIR_VEC[facing].z * (d / 2 + 6.0))).toFixed(2),
            y: +(zoneGroundY(zone) + baseY).toFixed(2),
            outward: facing,
            note: '门外锚点 = 通道面进深轴外端中心（外墙面向外 6.0m）',
          },
          width: doorWidth,
          /* t117：门洞的**可通行性声明**必须与实际一致 —— 若门外被具名障碍（如水体）占据，
             则 `passable:false` + `blockedBy:<障碍 id>` 显式登记，供下游/提示/验证统一读取；
             否则 `passable:true`、`blockedBy:null`（默认）。 */
          passable: opts.doorBlockedBy == null,
          blockedBy: opts.doorBlockedBy ?? null,
          height: Math.min(9, +(MODULES.eaveHeight * 0.7).toFixed(2)),
          sillY: +(zoneGroundY(zone) + baseY).toFixed(2),
        } // t97/F10：sillY = 区域地坪 + 本地台基（门外门槛面）；t102/F3：新增 facade 门外锚点
      : null,
    bounds: b(+(x - w / 2).toFixed(2), +(x + w / 2).toFixed(2), +(z - d / 2).toFixed(2), +(z + d / 2).toFixed(2)),
    entrance,
    usage: opts.usage ?? DEFAULT_USAGE[kind],
    info: `${name}：${opts.usage ?? DEFAULT_USAGE[kind]}；${visitable ? '可进入内景（已登记 interior 机位）' : '不可进入（已登记为障碍物）'}`,
    courtyard: opts.courtyard ?? null,
    lodHint: grade >= 3 ? 'near' : grade === 2 ? 'mid' : 'far',
  };
}

export const SLOTS = deepFreeze([
  /* ---------------- B 中轴前朝（12） ---------------- */
  S('B-gate-front', '前朝门殿', 'gateHall', 'B', 0, -386, 72, 24, { visitable: true, bays: 5, terraceH: 0.45, roofType: 'hip', grade: 2, usage: '前朝门殿，中轴第一道宫门（门洞可通行）', courtyard: 'CY-B-plaza' }),
  S('B-hall-main', '金銮殿', 'hall', 'B', 0, -116, 84, 48, { bays: 9, terraceH: MODULES.terraceTotalHeight, roofType: 'doubleEaveHip', grade: 3, visitable: true, usage: '大朝正殿，三层白石台基，内景可进入（金砖地面/宝座/屏风/藻井）', courtyard: 'CY-B-throne' }),
  S('B-hall-mid', '中殿', 'hall', 'B', 0, -20, 52, 28, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'z', center: { x: 0, z: -20 }, width: 6.0, height: 3.2, sillY: 2.0 }, bays: 7, terraceH: 2.0, roofType: 'hip', grade: 2, usage: '前朝中殿（方形过渡殿）', courtyard: 'CY-B-rear' }),
  S('B-hall-rear', '后殿', 'hall', 'B', 0, 44, 60, 30, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'z', center: { x: 0, z: 44 }, width: 6.0, height: 3.2, sillY: 1.8 }, bays: 7, terraceH: 1.8, roofType: 'hip', grade: 2, usage: '前朝后殿，内廷门前最后一进', courtyard: 'CY-B-rear' }),
  S('B-side-west-south', '广场西配殿', 'sideHall', 'B', -76, -300, 22, 54, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: -76, z: -300 }, width: 4.2, height: 2.47, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 1, facing: 'east', usage: '礼仪广场西侧围合配殿', courtyard: 'CY-B-plaza' }),
  S('B-side-east-south', '广场东配殿', 'sideHall', 'B', 76, -300, 22, 54, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: 76, z: -300 }, width: 4.2, height: 2.47, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 1, facing: 'west', usage: '礼仪广场东侧围合配殿', courtyard: 'CY-B-plaza' }),
  S('B-side-west-main', '主殿西配殿', 'sideHall', 'B', -80, -116, 16, 60, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: -80, z: -116 }, width: 6.0, height: 3.2, sillY: 1.5 }, bays: 4, terraceH: 1.5, roofType: 'gableHip', grade: 2, facing: 'east', usage: '主殿院西配殿', courtyard: 'CY-B-throne' }),
  S('B-side-east-main', '主殿东配殿', 'sideHall', 'B', 80, -116, 16, 60, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: 80, z: -116 }, width: 6.0, height: 3.2, sillY: 1.5 }, bays: 4, terraceH: 1.5, roofType: 'gableHip', grade: 2, facing: 'west', usage: '主殿院东配殿', courtyard: 'CY-B-throne' }),
  S('B-pavilion-gate-west', '门殿西翼亭', 'pavilion', 'B', -58, -386, 16, 16, { hasDoor: true, bays: 3, terraceH: 0.6, roofType: 'pyramidal', grade: 1, usage: '门殿两侧翼亭', courtyard: 'CY-B-plaza' }),
  S('B-pavilion-gate-east', '门殿东翼亭', 'pavilion', 'B', 58, -386, 16, 16, { hasDoor: true, bays: 3, terraceH: 0.6, roofType: 'pyramidal', grade: 1, usage: '门殿两侧翼亭', courtyard: 'CY-B-plaza' }),
  S('B-side-west-rear', '后殿西庑殿', 'sideHall', 'B', -70, 44, 20, 36, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: -70, z: 44 }, width: 4.2, height: 2.52, sillY: 1 }, bays: 3, terraceH: 1.0, roofType: 'gableHip', grade: 1, facing: 'east', usage: '后殿西侧围合庑殿', courtyard: 'CY-B-rear' }),
  S('B-side-east-rear', '后殿东庑殿', 'sideHall', 'B', 70, 44, 20, 36, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: 70, z: 44 }, width: 4.2, height: 2.52, sillY: 1 }, bays: 3, terraceH: 1.0, roofType: 'gableHip', grade: 1, facing: 'west', usage: '后殿东侧围合庑殿', courtyard: 'CY-B-rear' }),

  /* ---------------- C 后宫（12） ---------------- */
  S('C-gate-inner', '内廷门', 'gateHall', 'C', 0, 94, 56, 24, { visitable: true, bays: 3, terraceH: TERRAIN.innerGateTerraceY, roofType: 'hip', grade: 2, usage: '内廷门，前朝与后宫分界（门洞可通行）', courtyard: 'CY-C-front' }),
  S('C-hall-bed-main', '寝殿正殿', 'hall', 'C', 0, 168, 64, 38, { bays: 7, terraceH: 1.5, roofType: 'doubleEaveHip', grade: 3, visitable: true, usage: '后宫寝殿正殿，内景可进入（床榻/屏风/金砖地面）', courtyard: 'CY-C-main' }),
  S('C-hall-bed-rear', '后寝殿', 'hall', 'C', 0, 258, 52, 30, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'z', center: { x: 0, z: 258 }, width: 6.0, height: 3.19, sillY: 1.2 }, bays: 5, terraceH: 1.2, roofType: 'hip', grade: 2, usage: '后寝殿（后宫最北一进）', courtyard: 'CY-C-rear' }),
  S('C-side-west-main', '寝殿西配殿', 'sideHall', 'C', -66, 168, 20, 48, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: -66, z: 168 }, width: 6.0, height: 2.97, sillY: 0.8 }, bays: 5, terraceH: 0.8, roofType: 'gableHip', grade: 2, facing: 'east', usage: '寝殿院西配殿', courtyard: 'CY-C-main' }),
  S('C-side-east-main', '寝殿东配殿', 'sideHall', 'C', 66, 168, 20, 48, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: 66, z: 168 }, width: 6.0, height: 2.97, sillY: 0.8 }, bays: 5, terraceH: 0.8, roofType: 'gableHip', grade: 2, facing: 'west', usage: '寝殿院东配殿', courtyard: 'CY-C-main' }),
  S('C-side-west-rear', '西配房', 'sideHall', 'C', -64, 250, 20, 44, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: -64, z: 250 }, width: 4.2, height: 2.3, sillY: 0.6 }, bays: 3, terraceH: 0.6, roofType: 'gableHip', grade: 1, facing: 'east', usage: '后寝院西配房', courtyard: 'CY-C-rear' }),
  S('C-side-east-rear', '东配房', 'sideHall', 'C', 64, 250, 20, 44, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: 64, z: 250 }, width: 4.2, height: 2.3, sillY: 0.6 }, bays: 3, terraceH: 0.6, roofType: 'gableHip', grade: 1, facing: 'west', usage: '后寝院东配房', courtyard: 'CY-C-rear' }),
  S('C-gate-west', '内廷门西侧门', 'courtyardGate', 'C', -90, 124, 12, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'west', usage: '通西宫苑的侧门（通道口）', courtyard: 'CY-C-front' }),
  S('C-gate-east', '内廷门东侧门', 'courtyardGate', 'C', 90, 124, 12, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'east', usage: '通东宫苑的侧门（通道口）', courtyard: 'CY-C-front' }),
  S('C-annex-west', '西后院值房', 'sideHall', 'C', -70, 288, 18, 20, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: -70, z: 288 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 3, terraceH: 0.5, roofType: 'gable', grade: 1, facing: 'east', usage: '后寝院西值房', courtyard: 'CY-C-rear' }),
  S('C-annex-east', '东后院值房', 'sideHall', 'C', 70, 288, 18, 20, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: 70, z: 288 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 3, terraceH: 0.5, roofType: 'gable', grade: 1, facing: 'west', usage: '后寝院东值房', courtyard: 'CY-C-rear' }),
  S('C-pavilion-rear', '后庭院亭', 'pavilion', 'C', 0, 288, 16, 16, { hasDoor: true, bays: 3, terraceH: 0.6, roofType: 'pyramidal', grade: 1, usage: '后庭院中心亭', courtyard: 'CY-C-rear' }),

  /* ---------------- D 西侧宫苑（14） ---------------- */
  S('D-court1-hall', '礼乐殿', 'hall', 'D', -262, -318, 24, 56, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: -262, z: -318 }, width: 6.0, height: 3.03, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 2, facing: 'east', usage: '礼乐院正堂', courtyard: 'CY-D-court1' }),
  S('D-court1-house', '礼乐院南配房', 'sideHall', 'D', -176, -358, 40, 18, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: -176, z: -358 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 5, terraceH: 0.5, roofType: 'gable', grade: 1, usage: '礼乐院配房', courtyard: 'CY-D-court1' }),
  S('D-court1-gate', '礼乐院门', 'courtyardGate', 'D', -118, -318, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'east', usage: '礼乐院院门（通道口）', courtyard: 'CY-D-court1' }),
  S('D-court2-hall', '书院正堂', 'hall', 'D', -262, -158, 24, 56, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: -262, z: -158 }, width: 6.0, height: 3.03, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 2, facing: 'east', usage: '书院院正堂', courtyard: 'CY-D-court2' }),
  S('D-court2-house', '书院南厢', 'sideHall', 'D', -176, -198, 40, 18, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: -176, z: -198 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 5, terraceH: 0.5, roofType: 'gable', grade: 1, usage: '书院院厢房', courtyard: 'CY-D-court2' }),
  S('D-court2-gate', '书院院门', 'courtyardGate', 'D', -118, -158, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'east', usage: '书院院院门（通道口）', courtyard: 'CY-D-court2' }),
  S('D-court3-hall', '服务院主屋', 'hall', 'D', -262, 2, 24, 56, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: -262, z: 2 }, width: 6.0, height: 3.03, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 2, facing: 'east', usage: '服务院主屋', courtyard: 'CY-D-court3' }),
  S('D-court3-house', '服务院南房', 'sideHall', 'D', -176, -38, 40, 18, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: -176, z: -38 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 5, terraceH: 0.5, roofType: 'gable', grade: 1, usage: '服务院配房', courtyard: 'CY-D-court3' }),
  S('D-court3-gate', '服务院院门', 'courtyardGate', 'D', -118, 2, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'east', usage: '服务院院门（通道口）', courtyard: 'CY-D-court3' }),
  S('D-court3-pavilion', '水池亭', 'pavilion', 'D', -150, 58, 14, 14, { doorBlockedBy: 'WB-D-pond', hasDoor: true, bays: 3, terraceH: 0.5, roofType: 'pyramidal', grade: 1, usage: '服务院水池上的亭子', courtyard: 'CY-D-court3' }),
  S('D-court4-hall', '西后殿', 'hall', 'D', -262, 188, 24, 56, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: -262, z: 188 }, width: 6.0, height: 3.03, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 2, facing: 'east', usage: '西后院正堂', courtyard: 'CY-D-court4' }),
  S('D-court4-house', '西后南配房', 'sideHall', 'D', -176, 148, 40, 18, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: -176, z: 148 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 5, terraceH: 0.5, roofType: 'gable', grade: 1, usage: '西后院配房', courtyard: 'CY-D-court4' }),
  S('D-court4-gate', '西后院院门', 'courtyardGate', 'D', -118, 188, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'east', usage: '西后院院门（通道口）', courtyard: 'CY-D-court4' }),
  S('D-court4-pavilion', '西后小亭', 'pavilion', 'D', -150, 258, 14, 14, { hasDoor: true, bays: 3, terraceH: 0.5, roofType: 'pyramidal', grade: 1, usage: '西后院角亭', courtyard: 'CY-D-court4' }),

  /* ---------------- E 东侧宫苑（15） ---------------- */
  S('E-court1-hall', '文华殿', 'hall', 'E', 258, -320, 28, 60, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: 258, z: -320 }, width: 6.0, height: 3.08, sillY: 1.0 }, bays: 7, terraceH: 1.0, roofType: 'gableHip', grade: 2, facing: 'west', usage: '文华院正殿', courtyard: 'CY-E-court1' }),
  S('E-court1-house', '文华院南厢', 'sideHall', 'E', 196, -364, 18, 44, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: 196, z: -364 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 3, terraceH: 0.5, roofType: 'gable', grade: 1, facing: 'west', usage: '文华院厢房', courtyard: 'CY-E-court1' }),
  S('E-court1-gate', '文华院门', 'courtyardGate', 'E', 118, -320, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'west', usage: '文华院院门（通道口）', courtyard: 'CY-E-court1' }),
  S('E-court2-hall', '陈设正堂', 'hall', 'E', 262, -150, 26, 64, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: 262, z: -150 }, width: 6.0, height: 3.08, sillY: 1.0 }, bays: 7, terraceH: 1.0, roofType: 'gableHip', grade: 2, facing: 'west', usage: '陈设院正堂', courtyard: 'CY-E-court2' }),
  S('E-court2-house', '陈设北房', 'sideHall', 'E', 180, -96, 44, 18, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: 180, z: -96 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 5, terraceH: 0.5, roofType: 'gable', grade: 1, usage: '陈设院北房', courtyard: 'CY-E-court2' }),
  S('E-court2-gate', '陈设院门', 'courtyardGate', 'E', 118, -150, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'west', usage: '陈设院院门（通道口）', courtyard: 'CY-E-court2' }),
  S('E-court3-hall', '生活主屋', 'hall', 'E', 256, 20, 24, 58, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: 256, z: 20 }, width: 6.0, height: 3.03, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 2, facing: 'west', usage: '生活院主屋', courtyard: 'CY-E-court3' }),
  S('E-court3-house', '生活南房', 'sideHall', 'E', 176, -24, 40, 18, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: 176, z: -24 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 5, terraceH: 0.5, roofType: 'gable', grade: 1, usage: '生活院南房', courtyard: 'CY-E-court3' }),
  S('E-court3-gate', '生活院门', 'courtyardGate', 'E', 118, 20, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'west', usage: '生活院院门（通道口）', courtyard: 'CY-E-court3' }),
  S('E-court3-annex', '生活院东耳房', 'sideHall', 'E', 280, 20, 16, 40, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'x', center: { x: 280, z: 20 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 3, terraceH: 0.5, roofType: 'gable', grade: 1, facing: 'west', usage: '生活院东侧耳房', courtyard: 'CY-E-court3' }),
  S('E-court3-pavilion', '生活院水榭', 'pavilion', 'E', 150, 42, 14, 14, { doorBlockedBy: 'WB-E-pond', hasDoor: true, bays: 3, terraceH: 0.5, roofType: 'pyramidal', grade: 1, usage: '生活院水池水榭', courtyard: 'CY-E-court3' }),
  S('E-court4-hall', '东后殿', 'hall', 'E', 260, 200, 26, 56, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'x', center: { x: 260, z: 200 }, width: 6.0, height: 3.03, sillY: 0.9 }, bays: 5, terraceH: 0.9, roofType: 'gableHip', grade: 2, facing: 'west', usage: '东后院正堂', courtyard: 'CY-E-court4' }),
  S('E-court4-house', '东后南厢', 'sideHall', 'E', 180, 150, 44, 18, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: 180, z: 150 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 5, terraceH: 0.5, roofType: 'gable', grade: 1, usage: '东后院厢房', courtyard: 'CY-E-court4' }),
  S('E-court4-gate', '东后院院门', 'courtyardGate', 'E', 118, 200, 10, 20, { bays: 1, terraceH: 0.4, roofType: 'gable', grade: 1, facing: 'west', usage: '东后院院门（通道口）', courtyard: 'CY-E-court4' }),
  S('E-court4-pavilion', '东后小亭', 'pavilion', 'E', 150, 275, 14, 14, { hasDoor: true, bays: 3, terraceH: 0.5, roofType: 'pyramidal', grade: 1, usage: '东后院角亭', courtyard: 'CY-E-court4' }),

  /* ---------------- F 御花园与边界（14） ---------------- */
  S('F-tower-corner-nw', '西北角楼', 'cornerTower', 'F', -304, 454, 26, 26, { bays: 2, terraceH: 0, roofType: 'gableHip', grade: 2, facing: 'north', onWall: true, usage: '宫城西北角楼（三层重檐）' }),
  S('F-tower-corner-ne', '东北角楼', 'cornerTower', 'F', 304, 454, 26, 26, { bays: 2, terraceH: 0, roofType: 'gableHip', grade: 2, facing: 'north', onWall: true, usage: '宫城东北角楼' }),
  S('F-tower-corner-sw', '西南角楼', 'cornerTower', 'F', -304, -454, 26, 26, { bays: 2, terraceH: 0, roofType: 'gableHip', grade: 2, facing: 'south', onWall: true, usage: '宫城西南角楼' }),
  S('F-tower-corner-se', '东南角楼', 'cornerTower', 'F', 304, -454, 26, 26, { bays: 2, terraceH: 0, roofType: 'gableHip', grade: 2, facing: 'south', onWall: true, usage: '宫城东南角楼' }),
  S('F-gate-south', '南城门', 'gateHall', 'F', 0, -454, 76, 26, { visitable: true, bays: 5, terraceH: 0.4, roofType: 'doubleEaveHip', grade: 3, facing: 'south', onWall: true, usage: '宫城正南门（城楼 + 门洞），内接前朝，外接南桥' }),
  S('F-gate-north', '北城门', 'gateHall', 'F', 0, 454, 76, 26, { visitable: true, bays: 5, terraceH: 0.4, roofType: 'doubleEaveHip', grade: 3, facing: 'north', onWall: true, usage: '宫城正北门（城楼 + 门洞），外接北桥' }),
  S('F-gate-west', '西侧城门', 'gateHall', 'F', -304, 0, 26, 64, { visitable: true, bays: 3, terraceH: 0.4, roofType: 'gableHip', grade: 2, facing: 'west', onWall: true, usage: '宫城西侧门（城楼 + 门洞），通西侧宫苑' }),
  S('F-gate-east', '东侧城门', 'gateHall', 'F', 304, 0, 26, 64, { visitable: true, bays: 3, terraceH: 0.4, roofType: 'gableHip', grade: 2, facing: 'east', onWall: true, usage: '宫城东侧门（城楼 + 门洞），通东侧宫苑' }),
  S('F-garden-pavilion-main', '御花园·中央亭阁', 'pavilion', 'F', 0, 360, 28, 28, { hasDoor: true, bays: 3, terraceH: 0.6, roofType: 'pyramidal', grade: 2, usage: '御花园中心亭阁（重檐攒尖）' }),
  S('F-garden-hall-north', '御花园·北殿', 'hall', 'F', 0, 404, 44, 22, { hasDoor: true, visitable: true, doorWidth: 6.0, door: { axis: 'z', center: { x: 0, z: 404 }, width: 6.0, height: 2.97, sillY: 0.8 }, bays: 5, terraceH: 0.8, roofType: 'hip', grade: 2, usage: '御花园北端殿堂' }),
  S('F-garden-pavilion-west', '御花园·西亭', 'pavilion', 'F', -140, 355, 18, 18, { hasDoor: true, bays: 3, terraceH: 0.4, roofType: 'pyramidal', grade: 1, usage: '御花园西水池畔亭' }),
  S('F-garden-pavilion-east', '御花园·东亭', 'pavilion', 'F', 140, 355, 18, 18, { hasDoor: true, bays: 3, terraceH: 0.4, roofType: 'pyramidal', grade: 1, usage: '御花园东水池畔亭' }),
  S('F-garden-hall-west', '御花园·西配殿', 'sideHall', 'F', -235, 404, 26, 22, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: -235, z: 404 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 3, terraceH: 0.5, roofType: 'gableHip', grade: 1, facing: 'south', usage: '御花园西侧配殿' }),
  S('F-garden-hall-east', '御花园·东配殿', 'sideHall', 'F', 235, 404, 26, 22, { hasDoor: true, visitable: true, doorWidth: 4.2, door: { axis: 'z', center: { x: 235, z: 404 }, width: 4.2, height: 2.25, sillY: 0.5 }, bays: 3, terraceH: 0.5, roofType: 'gableHip', grade: 1, facing: 'south', usage: '御花园东侧配殿' }),
]);

/** 建筑索引与统计。 */
export const SLOT_BY_ID = deepFreeze(
  SLOTS.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {}),
);

export function getSlot(id) {
  return SLOT_BY_ID[id] ?? null;
}

export function slotsByZone(zone) {
  return SLOTS.filter((s) => s.zone === zone);
}

/* =============================================================================
 * 四、COURTYARDS：有墙/门/廊道界定的院落（≥13；前朝≥3、后宫≥3、西≥4、东≥4）
 * ========================================================================== */

function CY(id, zone, area, name, minX, maxX, minZ, maxZ, gates, corridorIds, description) {
  return {
    id,
    zone,
    area,
    name,
    bounds: b(minX, maxX, minZ, maxZ),
    gates,
    corridors: corridorIds,
    wallIds: [`${id}-wall-south`, `${id}-wall-north`, `${id}-wall-west`, `${id}-wall-east`],
    description,
  };
}

export const COURTYARDS = deepFreeze([
  CY('CY-B-plaza', 'B', 'forecourt', '礼仪广场院', -96, 96, -400, -180, ['B-gate-front'], ['CR-B-plaza-west', 'CR-B-plaza-east'], '由门殿与东西配殿、两侧廊庑围合的大广场'),
  CY('CY-B-throne', 'B', 'forecourt', '主殿院', -96, 96, -180, -40, [], ['CR-B-throne-west', 'CR-B-throne-east'], '主殿三层台基所在院落，东西配殿围合'),
  CY('CY-B-rear', 'B', 'forecourt', '后殿院', -96, 96, -40, 80, [], ['CR-B-rear-west', 'CR-B-rear-east'], '中殿与后殿所在院落，北接内廷门'),
  CY('CY-C-front', 'C', 'innerPalace', '内廷一进院', -96, 96, 80, 142, ['C-gate-inner', 'C-gate-west', 'C-gate-east'], ['CR-C-front-west', 'CR-C-front-east'], '内廷门内第一进院落，东西侧门通侧院'),
  CY('CY-C-main', 'C', 'innerPalace', '寝殿院', -96, 96, 142, 216, [], ['CR-C-main-west', 'CR-C-main-east'], '寝殿正殿与东西配殿围合的主院'),
  CY('CY-C-rear', 'C', 'innerPalace', '后寝院', -96, 96, 216, 300, [], ['CR-C-rear-west', 'CR-C-rear-east'], '后寝殿与东西配房围合，北接御花园'),
  CY('CY-D-court1', 'D', 'west', '礼乐院', -290, -112, -392, -244, ['D-court1-gate'], ['CR-D-court1-south'], '西侧第一组院落：礼乐主题（正堂朝东）'),
  CY('CY-D-court2', 'D', 'west', '书院院', -290, -112, -232, -84, ['D-court2-gate'], ['CR-D-court2-south'], '西侧第二组院落：书院主题'),
  CY('CY-D-court3', 'D', 'west', '服务院', -290, -112, -72, 76, ['D-court3-gate'], ['CR-D-court3-south'], '西侧第三组院落：服务主题，含水池与亭'),
  CY('CY-D-court4', 'D', 'west', '西后院', -290, -112, 88, 290, ['D-court4-gate'], ['CR-D-court4-south'], '西侧第四组院落：西主题后院'),
  CY('CY-E-court1', 'E', 'east', '文华院', 112, 290, -392, -236, ['E-court1-gate'], ['CR-E-court1-south'], '东侧第一组院落：文华主题'),
  CY('CY-E-court2', 'E', 'east', '陈设院', 112, 290, -224, -60, ['E-court2-gate'], ['CR-E-court2-south'], '东侧第二组院落：陈设主题'),
  CY('CY-E-court3', 'E', 'east', '生活院', 112, 290, -48, 110, ['E-court3-gate'], ['CR-E-court3-south'], '东侧第三组院落：生活主题，含水池与水榭'),
  CY('CY-E-court4', 'E', 'east', '东后院', 112, 290, 122, 290, ['E-court4-gate'], ['CR-E-court4-south'], '东侧第四组院落：东主题后院'),
]);

export const COURTYARD_BY_ID = deepFreeze(
  COURTYARDS.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {}),
);

export function courtyardsByArea(area) {
  return COURTYARDS.filter((c) => c.area === area);
}

/* =============================================================================
 * 五、CONNECTORS：跨区通道（唯一连接 ID + 唯一 owner + 两端共享 position/width/elevation）
 * ========================================================================== */

const ZONE_IDS = ZONES.map((z) => z.id);

/**
 * 构造跨区通道。
 * kind: 'gate'（门洞）| 'passage'（门前/边界通道）| 'bridge'（桥）| 'stairs'（台阶，允许 elevationLow ≠ elevation）
 * elevation = 通道面标高（台阶记上端标高）；elevationLow 仅 kind='stairs' 合法。
 * gate 给了槽位 id 时，width 由该门洞净宽自动取值，保证与建筑注册一致。
 */
function CX(id, name, kind, owner, borders, x, z, widthOrGate, elevation, opts = {}) {
  const gateSlot = opts.gate ? getSlot(opts.gate) : null;
  const width = gateSlot ? gateSlot.doorWidth : widthOrGate;
  for (const zid of borders) {
    if (!ZONE_IDS.includes(zid) && zid !== 'outside') {
      throw new Error(`connector ${id}: unknown border zone "${zid}"`);
    }
  }
  if (!borders.includes(owner)) {
    throw new Error(`connector ${id}: owner "${owner}" is not one of its borders`);
  }
  return {
    id,
    name,
    kind,
    owner,
    borders,
    position: { x, z },
    width,
    elevation,
    elevationLow: kind === 'stairs' ? (opts.elevationLow ?? 0) : null,
    walkable: true,
    gate: opts.gate ?? null,
    note: opts.note ?? '',
  };
}

export const CONNECTORS = deepFreeze([
  CX('CXN-bridge-south', '南入城桥', 'bridge', 'F', ['F', 'outside'], 0, -489, MODULES.bridgeDeckWidth, TERRAIN.bridgeDeckY, { note: '跨南护城河，外侧接南岸落脚点' }),
  CX('CXN-bridge-north', '北入城桥', 'bridge', 'F', ['F', 'outside'], 0, 489, MODULES.bridgeDeckWidth, TERRAIN.bridgeDeckY),
  CX('CXN-bridge-west', '西入城桥', 'bridge', 'F', ['F', 'outside'], -349, 0, 12, TERRAIN.bridgeDeckY),
  CX('CXN-bridge-east', '东入城桥', 'bridge', 'F', ['F', 'outside'], 349, 0, 12, TERRAIN.bridgeDeckY),
  CX('CXN-gate-south', '南城门门洞', 'gate', 'F', ['F', 'outside'], 0, -454, 26, 0.4, { gate: 'F-gate-south' }),
  CX('CXN-gate-north', '北城门门洞', 'gate', 'F', ['F', 'outside'], 0, 454, 26, 0.4, { gate: 'F-gate-north' }),
  CX('CXN-gate-west', '西侧城门门洞', 'gate', 'F', ['F', 'outside'], -304, 0, 26, 0.4, { gate: 'F-gate-west' }),
  CX('CXN-gate-east', '东侧城门门洞', 'gate', 'F', ['F', 'outside'], 304, 0, 26, 0.4, { gate: 'F-gate-east' }),
  CX('CXN-F-B-south-belt', '城门内侧带→前朝广场', 'passage', 'F', ['F', 'B'], 0, -400, 24, TERRAIN.beltY, { note: 'F 拥有城门内侧带；B 从此处起算前朝' }),
  CX('CXN-B-C-inner-gate', '内廷门门洞', 'gate', 'C', ['B', 'C'], 0, 80, 26, TERRAIN.innerGateTerraceY, { gate: 'C-gate-inner', note: 'C 负责内廷门及其以北后宫' }),
  CX('CXN-C-F-garden-west', '后宫→御花园（西）', 'passage', 'F', ['C', 'F'], -84, 300, 10, TERRAIN.gardenPathsY, { note: '后寝殿居中，花园入口设于两侧' }),
  CX('CXN-C-F-garden-east', '后宫→御花园（东）', 'passage', 'F', ['C', 'F'], 84, 300, 10, TERRAIN.gardenPathsY),
  CX('CXN-B-D-plaza-west', '前朝广场→西宫苑', 'passage', 'D', ['B', 'D'], -100, -300, 10, TERRAIN.sideCourtY),
  CX('CXN-B-D-rear-west', '前朝后殿院→西宫苑', 'passage', 'D', ['B', 'D'], -100, 40, 10, TERRAIN.sideCourtY),
  CX('CXN-C-D-side-west', '内廷侧门→西宫苑', 'stairs', 'C', ['C', 'D'], -100, 124, 10, TERRAIN.innerGateTerraceY, { elevationLow: TERRAIN.sideCourtY, gate: 'C-gate-west', note: '侧门后 8m 缓步台阶（0.5m 落差）' }),
  CX('CXN-B-E-plaza-east', '前朝广场→东宫苑', 'passage', 'E', ['B', 'E'], 100, -300, 10, TERRAIN.sideCourtY),
  CX('CXN-B-E-rear-east', '前朝后殿院→东宫苑', 'passage', 'E', ['B', 'E'], 100, 40, 10, TERRAIN.sideCourtY),
  CX('CXN-C-E-side-east', '内廷侧门→东宫苑', 'stairs', 'E', ['C', 'E'], 100, 124, 10, TERRAIN.innerGateTerraceY, { elevationLow: TERRAIN.sideCourtY, gate: 'C-gate-east' }),
  CX('CXN-D-F-garden-west', '西宫苑→御花园', 'passage', 'F', ['D', 'F'], -200, 300, 12, 0.45, { note: 'D 北端接花园西入口' }),
  CX('CXN-E-F-garden-east', '东宫苑→御花园', 'passage', 'F', ['E', 'F'], 200, 300, 12, 0.45),
  CX('CXN-F-garden-north-belt', '御花园→北门内侧带', 'passage', 'F', ['F', 'F'], -30, 420, 10, TERRAIN.beltY),
  CX('CXN-F-garden-north-belt-east', '御花园→北门内侧带（东）', 'passage', 'F', ['F', 'F'], 30, 420, 10, TERRAIN.beltY),
  CX('CXN-B-gate-front-opening', '前朝门殿门洞', 'gate', 'B', ['B', 'B'], 0, -386, 26, 0.45, { gate: 'B-gate-front' }),
  CX('CXN-B-main-terrace-danbi', '主殿丹陛（三层）', 'stairs', 'B', ['B', 'B'], 0, -164, 22, MODULES.terraceTotalHeight, { elevationLow: TERRAIN.terraceGroundY, note: '中轴丹陛御道，三层共 4.5m' }),
  CX('CXN-B-main-terrace-west-stairs', '主殿西侧台阶', 'stairs', 'B', ['B', 'B'], -80, -174, 10, MODULES.terraceTierHeight, { elevationLow: TERRAIN.terraceGroundY }),
  CX('CXN-B-main-terrace-east-stairs', '主殿东侧台阶', 'stairs', 'B', ['B', 'B'], 80, -174, 10, MODULES.terraceTierHeight, { elevationLow: TERRAIN.terraceGroundY }),
  CX('CXN-B-main-terrace-north-west', '主殿台北侧台阶（西）', 'stairs', 'B', ['B', 'B'], -60, -58, 10, MODULES.terraceTierHeight, { elevationLow: TERRAIN.terraceGroundY }),
  CX('CXN-B-main-terrace-north-east', '主殿台北侧台阶（东）', 'stairs', 'B', ['B', 'B'], 60, -58, 10, MODULES.terraceTierHeight, { elevationLow: TERRAIN.terraceGroundY }),
  CX('CXN-C-bed-terrace-danbi', '寝殿台基南台阶', 'stairs', 'C', ['C', 'C'], 0, 132, 14, 2.4, { elevationLow: TERRAIN.innerPalaceY }),
  CX('CXN-C-bed-terrace-north-stairs', '寝殿台基北台阶', 'stairs', 'C', ['C', 'C'], 0, 204, 14, 2.4, { elevationLow: TERRAIN.innerPalaceY }),
  CX('CXN-B-main-hall-door', '金銮殿门洞', 'gate', 'B', ['B', 'B'], 0, -140, 26, MODULES.terraceTotalHeight, { note: '可进入内景（visitable）' }),
  CX('CXN-C-bed-hall-door', '寝殿门洞', 'gate', 'C', ['C', 'C'], 0, 187, 20, 2.4, { note: '可进入内景（visitable）' }),
]);

export const CONNECTOR_BY_ID = deepFreeze(
  CONNECTORS.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {}),
);

export function getConnector(id) {
  return CONNECTOR_BY_ID[id] ?? null;
}

/* =============================================================================
 * 六、ROADS：中轴与支路，每段带起止坐标与标高（不得把全城地坪统一抬到 4.5m）
 * ========================================================================== */

/**
 * 道路段。surface: 'outerRoad' | 'bridgeRamp' | 'bridgeDeck' | 'paving' | 'plaza' |
 *                'terrace' | 'stairs' | 'gardenPath' | 'courtPath'
 */
function RD(id, name, zone, from, to, width, surface, connector = null) {
  const [x1, z1, y1] = from;
  const [x2, z2, y2] = to;
  const length = Math.hypot(x2 - x1, z2 - z1);
  const slope = length > 0 ? Math.abs(y2 - y1) / length : 0;
  return {
    id,
    name,
    zone,
    from: { x: x1, z: z1, y: y1 },
    to: { x: x2, z: z2, y: y2 },
    width,
    surface,
    length: +length.toFixed(2),
    slope: +slope.toFixed(4),
    connector,
    walkable: true,
  };
}

export const ROADS = deepFreeze([
  /* --- 南侧进场：南岸 → 南桥 → 南城门 → 城门内侧带（F 负责） --- */
  RD('RD-F-south-approach', '南岸引道', 'F', [0, -552, 0], [0, -540, 0], 18, 'outerRoad'),
  RD('RD-F-south-bridge-ramp-outer', '南桥外引坡', 'F', [0, -540, 0], [0, -506, TERRAIN.bridgeDeckY], 16, 'bridgeRamp', 'CXN-bridge-south'),
  RD('RD-F-south-bridge-deck', '南桥桥面', 'F', [0, -506, TERRAIN.bridgeDeckY], [0, -472, TERRAIN.bridgeDeckY], 16, 'bridgeDeck', 'CXN-bridge-south'),
  RD('RD-F-south-bridge-ramp-inner', '南桥内引坡', 'F', [0, -472, TERRAIN.bridgeDeckY], [0, -458, 0.4], 16, 'bridgeRamp', 'CXN-bridge-south'),
  RD('RD-F-south-gate-floor', '南城门门洞地面', 'F', [0, -458, 0.4], [0, -440, 0.4], 18, 'paving', 'CXN-gate-south'),
  RD('RD-F-south-gate-inner-ramp', '城门内缓坡', 'F', [0, -440, 0.4], [0, -404, TERRAIN.beltY], 18, 'paving', 'CXN-gate-south'),
  RD('RD-F-south-belt', '城门内侧带步道', 'F', [0, -404, TERRAIN.beltY], [0, -400, TERRAIN.beltY], 24, 'paving', 'CXN-F-B-south-belt'),
  /* --- 西侧进场 --- */
  RD('RD-F-west-bridge-ramp-outer', '西桥外引坡', 'F', [-400, 0, 0], [-366, 0, TERRAIN.bridgeDeckY], 12, 'bridgeRamp', 'CXN-bridge-west'),
  RD('RD-F-west-bridge-deck', '西桥桥面', 'F', [-366, 0, TERRAIN.bridgeDeckY], [-332, 0, TERRAIN.bridgeDeckY], 12, 'bridgeDeck', 'CXN-bridge-west'),
  RD('RD-F-west-bridge-ramp-inner', '西桥内引坡', 'F', [-332, 0, TERRAIN.bridgeDeckY], [-317, 0, 0.4], 12, 'bridgeRamp', 'CXN-bridge-west'),
  RD('RD-F-west-gate-floor', '西侧城门门洞地面', 'F', [-317, 0, 0.4], [-291, 0, 0.4], 14, 'paving', 'CXN-gate-west'),
  RD('RD-D-west-gate-entry', '西侧城门内接入', 'D', [-291, 0, TERRAIN.sideCourtY], [-270, 0, TERRAIN.sideCourtY], 12, 'paving', 'CXN-gate-west'),
  /* --- 东侧进场 --- */
  RD('RD-F-east-bridge-ramp-outer', '东桥外引坡', 'F', [400, 0, 0], [366, 0, TERRAIN.bridgeDeckY], 12, 'bridgeRamp', 'CXN-bridge-east'),
  RD('RD-F-east-bridge-deck', '东桥桥面', 'F', [366, 0, TERRAIN.bridgeDeckY], [332, 0, TERRAIN.bridgeDeckY], 12, 'bridgeDeck', 'CXN-bridge-east'),
  RD('RD-F-east-bridge-ramp-inner', '东桥内引坡', 'F', [332, 0, TERRAIN.bridgeDeckY], [317, 0, 0.4], 12, 'bridgeRamp', 'CXN-bridge-east'),
  RD('RD-F-east-gate-floor', '东侧城门门洞地面', 'F', [317, 0, 0.4], [291, 0, 0.4], 14, 'paving', 'CXN-gate-east'),
  RD('RD-E-east-gate-entry', '东侧城门内接入', 'E', [291, 0, TERRAIN.sideCourtY], [270, 0, TERRAIN.sideCourtY], 12, 'paving', 'CXN-gate-east'),
  /* --- 北侧进场 --- */
  RD('RD-F-north-approach', '北岸引道', 'F', [0, 552, 0], [0, 540, 0], 18, 'outerRoad'),
  RD('RD-F-north-bridge-ramp-outer', '北桥外引坡', 'F', [0, 540, 0], [0, 506, TERRAIN.bridgeDeckY], 16, 'bridgeRamp', 'CXN-bridge-north'),
  RD('RD-F-north-bridge-deck', '北桥桥面', 'F', [0, 506, TERRAIN.bridgeDeckY], [0, 472, TERRAIN.bridgeDeckY], 16, 'bridgeDeck', 'CXN-bridge-north'),
  RD('RD-F-north-bridge-ramp-inner', '北桥内引坡', 'F', [0, 472, TERRAIN.bridgeDeckY], [0, 458, 0.4], 16, 'bridgeRamp', 'CXN-bridge-north'),
  RD('RD-F-north-gate-floor', '北城门门洞地面', 'F', [0, 458, 0.4], [0, 441, 0.4], 18, 'paving', 'CXN-gate-north'),
  RD('RD-F-north-gate-inner-ramp', '北城门内缓坡', 'F', [0, 441, 0.4], [0, 428, TERRAIN.beltY], 18, 'paving', 'CXN-gate-north'),
  RD('RD-F-north-belt', '北门内侧带步道', 'F', [-30, 428, TERRAIN.beltY], [0, 440, TERRAIN.beltY], 12, 'paving', 'CXN-F-garden-north-belt'),
  /* --- B 中轴前朝 --- */
  RD('RD-B-plaza-axis', '礼仪广场中轴', 'B', [0, -400, 0], [0, -180, 0], 22, 'plaza', 'CXN-F-B-south-belt'),
  RD('RD-B-plaza-west-branch', '广场西支路', 'B', [-60, -380, 0], [-60, -180, 0], 10, 'plaza'),
  RD('RD-B-plaza-east-branch', '广场东支路', 'B', [60, -380, 0], [60, -180, 0], 10, 'plaza'),
  RD('RD-B-main-danbi-1', '主殿丹陛第一层', 'B', [0, -180, 0], [0, -168, MODULES.terraceTierHeight], 22, 'stairs', 'CXN-B-main-terrace-danbi'),
  RD('RD-B-main-danbi-2', '主殿丹陛第二层', 'B', [0, -168, MODULES.terraceTierHeight], [0, -158, MODULES.terraceTierHeight * 2], 22, 'stairs', 'CXN-B-main-terrace-danbi'),
  RD('RD-B-main-danbi-3', '主殿丹陛第三层', 'B', [0, -158, MODULES.terraceTierHeight * 2], [0, -148, MODULES.terraceTotalHeight], 22, 'stairs', 'CXN-B-main-terrace-danbi'),
  RD('RD-B-terrace-top', '主殿台基顶面御道', 'B', [0, -148, MODULES.terraceTotalHeight], [0, -84, MODULES.terraceTotalHeight], 24, 'terrace'),
  RD('RD-B-terrace-west-stairs', '主殿西侧台阶', 'B', [-80, -180, 0], [-80, -168, MODULES.terraceTierHeight], 10, 'stairs', 'CXN-B-main-terrace-west-stairs'),
  RD('RD-B-terrace-east-stairs', '主殿东侧台阶', 'B', [80, -180, 0], [80, -168, MODULES.terraceTierHeight], 10, 'stairs', 'CXN-B-main-terrace-east-stairs'),
  RD('RD-B-terrace-north-west-stairs', '主殿台北台阶（西）', 'B', [-60, -64, MODULES.terraceTierHeight], [-60, -52, 0], 10, 'stairs', 'CXN-B-main-terrace-north-west'),
  RD('RD-B-terrace-north-east-stairs', '主殿台北台阶（东）', 'B', [60, -64, MODULES.terraceTierHeight], [60, -52, 0], 10, 'stairs', 'CXN-B-main-terrace-north-east'),
  RD('RD-B-bypass-west', '主殿西绕行步道', 'B', [-88, -52, 0], [-88, 60, 0], 10, 'paving'),
  RD('RD-B-bypass-east', '主殿东绕行步道', 'B', [88, -52, 0], [88, 60, 0], 10, 'paving'),
  RD('RD-B-axis-mid', '中殿南侧中轴', 'B', [0, -56, 0], [0, -36, 0], 16, 'paving'),
  RD('RD-B-axis-mid-rear', '中殿后殿间中轴', 'B', [0, -4, 0], [0, 27, 0], 16, 'paving'),
  RD('RD-B-axis-rear-inner', '后殿北至内廷门', 'B', [0, 61, 0], [0, 78, TERRAIN.innerGateTerraceY], 20, 'paving', 'CXN-B-C-inner-gate'),
  RD('RD-B-west-court-link', '广场西侧接西宫苑', 'B', [-88, -300, 0], [-100, -300, 0], 10, 'paving', 'CXN-B-D-plaza-west'),
  RD('RD-B-east-court-link', '广场东侧接东宫苑', 'B', [88, -300, 0], [100, -300, 0], 10, 'paving', 'CXN-B-E-plaza-east'),
  RD('RD-B-west-court-link-rear', '后殿院西接西宫苑', 'B', [-88, 40, 0], [-100, 40, 0], 10, 'paving', 'CXN-B-D-rear-west'),
  RD('RD-B-east-court-link-rear', '后殿院东接东宫苑', 'B', [88, 40, 0], [100, 40, 0], 10, 'paving', 'CXN-B-E-rear-east'),
  /* --- C 后宫 --- */
  RD('RD-C-inner-gate-floor', '内廷门门洞地面', 'C', [0, 80, TERRAIN.innerGateTerraceY], [0, 110, TERRAIN.innerGateTerraceY], 22, 'paving', 'CXN-B-C-inner-gate'),
  RD('RD-C-axis-front', '内廷一进中轴', 'C', [0, 110, TERRAIN.innerPalaceY], [0, 128, TERRAIN.innerPalaceY], 22, 'paving'),
  RD('RD-C-bed-danbi', '寝殿台基南台阶', 'C', [0, 128, TERRAIN.innerPalaceY], [0, 137, 2.4], 14, 'stairs', 'CXN-C-bed-terrace-danbi'),
  RD('RD-C-bed-terrace-top', '寝殿台基顶面', 'C', [0, 137, 2.4], [0, 199, 2.4], 18, 'terrace'),
  RD('RD-C-bed-north-stairs', '寝殿台基北台阶', 'C', [0, 199, 2.4], [0, 210, TERRAIN.innerPalaceY], 14, 'stairs', 'CXN-C-bed-terrace-north-stairs'),
  RD('RD-C-axis-rear', '寝殿北中轴', 'C', [0, 210, TERRAIN.innerPalaceY], [0, 216, TERRAIN.innerPalaceY], 10, 'paving'),
  RD('RD-C-rear-cross-west', '后寝院西横路', 'C', [0, 216, TERRAIN.innerPalaceY], [-84, 216, TERRAIN.innerPalaceY], 10, 'paving'),
  RD('RD-C-rear-cross-east', '后寝院东横路', 'C', [0, 216, TERRAIN.innerPalaceY], [84, 216, TERRAIN.innerPalaceY], 10, 'paving'),
  RD('RD-C-rear-bypass-west', '后寝殿西绕行', 'C', [-84, 210, TERRAIN.innerPalaceY], [-84, 298, TERRAIN.innerPalaceY], 10, 'paving'),
  RD('RD-C-rear-bypass-east', '后寝殿东绕行', 'C', [84, 210, TERRAIN.innerPalaceY], [84, 298, TERRAIN.innerPalaceY], 10, 'paving'),
  RD('RD-C-garden-ramp-west', '后宫出花园西坡道', 'C', [-84, 298, TERRAIN.innerPalaceY], [-84, 306, TERRAIN.gardenPathsY], 10, 'gardenPath', 'CXN-C-F-garden-west'),
  RD('RD-C-garden-ramp-east', '后宫出花园东坡道', 'C', [84, 298, TERRAIN.innerPalaceY], [84, 306, TERRAIN.gardenPathsY], 10, 'gardenPath', 'CXN-C-F-garden-east'),
  RD('RD-C-side-gate-west', '一进院至西侧门', 'C', [-60, 124, TERRAIN.innerPalaceY], [-90, 124, TERRAIN.innerPalaceY], 8, 'paving'),
  RD('RD-C-side-gate-east', '一进院至东侧门', 'C', [60, 124, TERRAIN.innerPalaceY], [90, 124, TERRAIN.innerPalaceY], 8, 'paving'),
  RD('RD-C-D-west-steps', '西侧门后缓步台阶', 'C', [-96, 124, TERRAIN.innerGateTerraceY], [-104, 124, TERRAIN.sideCourtY], 10, 'stairs', 'CXN-C-D-side-west'),
  RD('RD-C-E-east-steps', '东侧门后缓步台阶', 'E', [96, 124, TERRAIN.innerGateTerraceY], [104, 124, TERRAIN.sideCourtY], 10, 'stairs', 'CXN-C-E-side-east'),
  /* --- D 西侧宫苑 --- */
  RD('RD-D-ring-road', '西宫苑南北主道', 'D', [-106, -392, TERRAIN.sideCourtY], [-106, 290, TERRAIN.sideCourtY], 10, 'courtPath'),
  RD('RD-D-court1-path', '礼乐院院前路', 'D', [-106, -318, TERRAIN.sideCourtY], [-123, -318, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-D-court2-path', '书院院院前路', 'D', [-106, -158, TERRAIN.sideCourtY], [-123, -158, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-D-court3-path', '服务院院前路', 'D', [-106, 2, TERRAIN.sideCourtY], [-123, 2, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-D-court4-path', '西后院院前路', 'D', [-106, 188, TERRAIN.sideCourtY], [-123, 188, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-D-plaza-link', '接前朝广场', 'D', [-106, -300, TERRAIN.sideCourtY], [-100, -300, TERRAIN.sideCourtY], 10, 'courtPath', 'CXN-B-D-plaza-west'),
  RD('RD-D-rear-link', '接前朝后殿院', 'D', [-106, 40, TERRAIN.sideCourtY], [-100, 40, TERRAIN.sideCourtY], 10, 'courtPath', 'CXN-B-D-rear-west'),
  RD('RD-D-side-link', '接内廷侧门', 'D', [-106, 124, TERRAIN.sideCourtY], [-100, 124, TERRAIN.sideCourtY], 10, 'courtPath', 'CXN-C-D-side-west'),
  RD('RD-D-garden-spur', '接花园西入口', 'D', [-106, 290, TERRAIN.sideCourtY], [-200, 290, TERRAIN.sideCourtY], 10, 'courtPath'),
  RD('RD-D-garden-ramp', '花园西入口坡道', 'D', [-200, 290, TERRAIN.sideCourtY], [-200, 300, 0.45], 12, 'gardenPath', 'CXN-D-F-garden-west'),
  /* --- E 东侧宫苑 --- */
  RD('RD-E-ring-road', '东宫苑南北主道', 'E', [106, -392, TERRAIN.sideCourtY], [106, 290, TERRAIN.sideCourtY], 10, 'courtPath'),
  RD('RD-E-court1-path', '文华院院前路', 'E', [106, -320, TERRAIN.sideCourtY], [113, -320, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-E-court2-path', '陈设院院前路', 'E', [106, -150, TERRAIN.sideCourtY], [113, -150, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-E-court3-path', '生活院院前路', 'E', [106, 20, TERRAIN.sideCourtY], [113, 20, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-E-court4-path', '东后院院前路', 'E', [106, 200, TERRAIN.sideCourtY], [113, 200, TERRAIN.sideCourtY], 8, 'courtPath'),
  RD('RD-E-plaza-link', '接前朝广场', 'E', [100, -300, TERRAIN.sideCourtY], [106, -300, TERRAIN.sideCourtY], 10, 'courtPath', 'CXN-B-E-plaza-east'),
  RD('RD-E-rear-link', '接前朝后殿院', 'E', [100, 40, TERRAIN.sideCourtY], [106, 40, TERRAIN.sideCourtY], 10, 'courtPath', 'CXN-B-E-rear-east'),
  RD('RD-E-side-link', '接内廷侧门', 'E', [100, 124, TERRAIN.sideCourtY], [106, 124, TERRAIN.sideCourtY], 10, 'courtPath', 'CXN-C-E-side-east'),
  RD('RD-E-garden-spur', '接花园东入口', 'E', [106, 290, TERRAIN.sideCourtY], [200, 290, TERRAIN.sideCourtY], 10, 'courtPath'),
  RD('RD-E-garden-ramp', '花园东入口坡道', 'E', [200, 290, TERRAIN.sideCourtY], [200, 300, 0.45], 12, 'gardenPath', 'CXN-E-F-garden-east'),
  /* --- F 御花园 --- */
  RD('RD-F-garden-west-entry', '花园西入口步道', 'F', [-200, 300, 0.45], [-200, 320, TERRAIN.gardenPathsY], 12, 'gardenPath', 'CXN-D-F-garden-west'),
  RD('RD-F-garden-east-entry', '花园东入口步道', 'F', [200, 300, 0.45], [200, 320, TERRAIN.gardenPathsY], 12, 'gardenPath', 'CXN-E-F-garden-east'),
  RD('RD-F-garden-axis-west', '花园西中轴步道', 'F', [-84, 306, TERRAIN.gardenPathsY], [-84, 340, TERRAIN.gardenPathsY], 10, 'gardenPath', 'CXN-C-F-garden-west'),
  RD('RD-F-garden-axis-east', '花园东中轴步道', 'F', [84, 306, TERRAIN.gardenPathsY], [84, 340, TERRAIN.gardenPathsY], 10, 'gardenPath', 'CXN-C-F-garden-east'),
  RD('RD-F-garden-cross', '花园东西横路', 'F', [-96, 340, TERRAIN.gardenPathsY], [96, 340, TERRAIN.gardenPathsY], 10, 'gardenPath'),
  RD('RD-F-garden-main-approach', '中央亭阁前步道', 'F', [0, 340, TERRAIN.gardenPathsY], [0, 344, TERRAIN.gardenPathsY], 12, 'gardenPath'),
  RD('RD-F-garden-north-west-path', '花园北西步道', 'F', [-30, 340, TERRAIN.gardenPathsY], [-30, 410, TERRAIN.gardenPathsY], 8, 'gardenPath'),
  RD('RD-F-garden-north-east-path', '花园北东步道', 'F', [30, 340, TERRAIN.gardenPathsY], [30, 410, TERRAIN.gardenPathsY], 8, 'gardenPath'),
  RD('RD-F-garden-west-loop', '花园西侧环路', 'F', [-96, 340, TERRAIN.gardenPathsY], [-96, 410, TERRAIN.gardenPathsY], 8, 'gardenPath'),
  RD('RD-F-garden-east-loop', '花园东侧环路', 'F', [96, 340, TERRAIN.gardenPathsY], [96, 410, TERRAIN.gardenPathsY], 8, 'gardenPath'),
  RD('RD-F-garden-north-cross', '花园北横路', 'F', [-96, 410, TERRAIN.gardenPathsY], [96, 410, TERRAIN.gardenPathsY], 8, 'gardenPath'),
  RD('RD-F-garden-west-pond-walk', '西水池畔步道', 'F', [-200, 320, TERRAIN.gardenPathsY], [-200, 380, TERRAIN.gardenPathsY], 8, 'gardenPath'),
  RD('RD-F-garden-east-pond-walk', '东水池畔步道', 'F', [200, 320, TERRAIN.gardenPathsY], [200, 380, TERRAIN.gardenPathsY], 8, 'gardenPath'),
  RD('RD-F-garden-north-west-ramp', '花园至北门带（西）', 'F', [-30, 410, TERRAIN.gardenPathsY], [-30, 426, TERRAIN.beltY], 10, 'gardenPath', 'CXN-F-garden-north-belt'),
  RD('RD-F-garden-north-east-ramp', '花园至北门带（东）', 'F', [30, 410, TERRAIN.gardenPathsY], [30, 426, TERRAIN.beltY], 10, 'gardenPath', 'CXN-F-garden-north-belt-east'),
]);

export const ROAD_BY_ID = deepFreeze(
  ROADS.reduce((acc, r) => {
    acc[r.id] = r;
    return acc;
  }, {}),
);

/* =============================================================================
 * 七、TERRACES：台基（主殿三层总高 4.5m；寝殿 1.5m）
 * ========================================================================== */

export const TERRACES = deepFreeze([
  {
    id: 'TR-B-main-tier1',
    owner: 'B',
    zone: 'B',
    label: '主殿台基第一层',
    tier: 1,
    bounds: b(-88, 88, -168, -64),
    y0: 0,
    y1: MODULES.terraceTierHeight,
    stoneRole: 'terraceStone',
  },
  {
    id: 'TR-B-main-tier2',
    owner: 'B',
    zone: 'B',
    label: '主殿台基第二层',
    tier: 2,
    bounds: b(-72, 72, -158, -74),
    y0: MODULES.terraceTierHeight,
    y1: MODULES.terraceTierHeight * 2,
    stoneRole: 'terraceStone',
  },
  {
    id: 'TR-B-main-tier3',
    owner: 'B',
    zone: 'B',
    label: '主殿台基第三层',
    tier: 3,
    bounds: b(-56, 56, -148, -84),
    y0: MODULES.terraceTierHeight * 2,
    y1: MODULES.terraceTotalHeight,
    stoneRole: 'terraceStone',
  },
  {
    id: 'TR-C-bed',
    owner: 'C',
    zone: 'C',
    label: '寝殿台基',
    tier: 1,
    bounds: b(-72, 72, 137, 199),
    y0: TERRAIN.innerPalaceY,
    y1: 2.4,
    stoneRole: 'terraceStone',
  },
]);

/* =============================================================================
 * 八、WALKABLE：可行走面（世界坐标范围 + 地面高度；重叠时取最高面，ramp 定义过渡）
 * ========================================================================== */

function WK(id, zone, kind, name, minX, maxX, minZ, maxZ, y, enterable = true) {
  return {
    id,
    zone,
    kind,
    name,
    bounds: b(minX, maxX, minZ, maxZ),
    y,
    enterable,
    centerY: y,
    area: +((maxX - minX) * (maxZ - minZ)).toFixed(1),
  };
}

/* =============================================================================
 * 十二·A（t70 切片 A）：**有门封闭建筑的内景注册**（派生；不改障碍语义、不碰冻结计数）
 * 覆盖 8 栋 `hasDoor === true`（2 殿已有内景 + 本切片新增 6 座门殿）。
 * 规则：WK 内缩 0.6m、y = slot.baseY；VP 位置/目标均在 WK 内且 y ∈ [groundY, groundY+eaveHeight]；
 *       FP 置于门洞内侧 1.5m，surfaceId 指向该 WK。10 座 courtyardGate（院门门洞）**不在本集合**。
 * 注：仅调用**已提升的函数声明** WK()/VP()，且只读 SLOT_BY_ID；不引用 WALKABLE/VIEWPOINTS/FP_ROUTE（避免 TDZ）。
 * ========================================================================== */
/* 切片 A 只纳入"宫墙内、单层门殿"：B-gate-front / C-gate-inner。
   4 座**城门**（F-gate-*）暂缓：它们跨压在宫墙上，`baseY=12.4` 是**墙顶门房**标高，而墙下另有通行门洞
   （legacy FP 走查点 WP-fp-02 恰在 (0,-445)、地面 0.4）⇒ 直接注册会在同一 xz 上叠一层 12.4 的可行走面，
   使 `floorYAt()` 解析到 12.4、破坏既有的"视线高 = 面高 + 1.65m"断言。城门需要"门洞通道 vs 墙顶门房"的分层规则，
   属切片 B 的范围（见 docs/handoff-layout-interiors.md）。 */

const INTERIOR_SLICE_A_IDS = Object.freeze([
  'B-gate-front', 'C-gate-inner',
  'F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east',
  // t73 切片 B1：12 座 hall
  // t74 切片 B2：23 座 sideHall
  'B-side-west-south',
  'B-side-east-south',
  'B-side-west-main',
  'B-side-east-main',
  'B-side-west-rear',
  'B-side-east-rear',
  'C-side-west-main',
  'C-side-east-main',
  'C-side-west-rear',
  'C-side-east-rear',
  'C-annex-west',
  'C-annex-east',
  'D-court1-house',
  'D-court2-house',
  'D-court3-house',
  'D-court4-house',
  'E-court1-house',
  'E-court2-house',
  'E-court3-house',
  'E-court3-annex',
  'E-court4-house',
  'F-garden-hall-west',
  'F-garden-hall-east',
  'B-hall-mid',
  'B-hall-rear',
  'C-hall-bed-rear',
  'D-court1-hall',
  'D-court2-hall',
  'D-court3-hall',
  'D-court4-hall',
  'E-court1-hall',
  'E-court2-hall',
  'E-court3-hall',
  'E-court4-hall',
  'F-garden-hall-north',
]);
/* t72 / Q5 裁定 ①：4 座城门跨压宫墙，`baseY=12.4` 是**墙顶门房**标高；
   内景取**门洞通道面**——实测 `floorYAt(door.center)` = 0.4（南/北/东/西四门一致，与 legacy `WP-fp-02`(0,-445) 同值）。
   墙顶门房那一层**本轮不做内景**（同一 xz 上下两层需 y 感知可行走面模型 = layout API 变更），已登记为已知范围收窄。 */
/* 既有两栋内景（金銮殿/寝殿正殿）的地坪取自其**既有 WK 定义**（t26 内景设计值）：
   WK-B-hall-main-interior y=4.5（= baseY）、WK-C-bed-interior y=2.4（≠ baseY 1.5，取其内景设计值） */
const INTERIOR_LEGACY_FLOOR = Object.freeze({ 'B-hall-main': 4.5, 'C-hall-bed-main': 2.4 });
/* 既有两栋内景的 WK 内缩更大（B: 6m / C: 5m），通道向内段需相应加长才能搭到室内面 */
const INTERIOR_LEGACY_IN = Object.freeze({ 'B-hall-main': 6.6, 'C-hall-bed-main': 6.6 });

/* t89 / F10：`door.sillY` 语义冻结为「**门外门槛面标高**」，即应等于该栋登记内景地面（= WK.y）。
   下列 5 栋例外（**逐条理由**，均由既有设计/遗留数据结构决定，非漏算）：
   · F-gate-*（4 栋）：**双标高** —— 城楼门 `sillY=12.4`（墙顶门房）与**通道地面 0.4**；行人走的是通道 ⇒ 内景取 0.4。
   · C-hall-bed-main（1 栋）：**遗留基准 wart** —— 该槽位无显式 `door` 字面量，`sillY=terraceH=1.5` 是**台基输入值**；
     而其内景设计地面为 **2.4**（`INTERIOR_LEGACY_FLOOR`，= C 区地坪 0.9 + baseY 1.5）。改 `terraceH` 会改变建筑几何（kit 输入）
     ⇒ 不在此处“修正”，而是登记为走廊高差 0.9m 的既有设计（由 t89 的可行走过渡 / t88 的 connector 消费承接）。 */
export const DOOR_SILL_EXCEPTIONS = Object.freeze([
  /* ① F 四城门：双标高（城楼门 sillY=12.4 / 通道地面 0.4） */
  'F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east',
  /* ② C-hall-bed-main：无显式 door 字面量，sillY=terraceH=1.5，而内景设计地面 2.4（遗留基准 wart） */
  'C-hall-bed-main',
  /* ③ C-gate-inner：baseY=0.9 存的是**绝对标高**（其余槽位为相对偏移）⇒ sillY=区域地坪+baseY=1.8 与其内景地面 0.9 不符（INTERIOR_PASSAGE_FLOOR 已登记，同属绝对标高 wart） */
  'C-gate-inner',
]);

export const INTERIOR_PASSAGE_FLOOR = Object.freeze({
  /* **例外表：逐条理由**（每一条都必须能独立解释，禁止宽泛豁免） */
  /* ① F 四城门（4 条）：城楼跨压宫墙，`baseY=12.4` 是**墙顶门房**标高，行人实际走的是
        墙下**门洞通道**（实测四门 `floorYAt(door.center)=0.4`）⇒ 内景取通道面 0.4（t72 Q5 裁定 ①）。 */
  'F-gate-south': 0.4, 'F-gate-north': 0.4, 'F-gate-west': 0.4, 'F-gate-east': 0.4,
  /* ② C-gate-inner（内廷门，1 条）：**已知 wart（登记不修）** —— 该槽位的 `baseY=0.9` 存的是
        **绝对标高**，而其它 66 个槽位的 `baseY` 是**相对该区地坪的偏移**（同一名词、两种基准）。
        证据：既有手工走查点 `WP-fp-07`（内廷门）`y=2.55 = 0.9 + 1.65` 与 `floorYAt(0,95)=0.9`
        ⇒ 该处地面就是 0.9（绝对）。若按“区域地坪 0.9 + baseY 0.9 = 1.8”处理，会立刻破坏
        既有「视线高 = 面高 + 1.65m」走查断言（t83 实测报红）。
        **不修理由**：修它需要同时改 `WP-fp-07` 与该处 `floorYAt` 解析（属既有走查语义/公共 API 变更），
        而正确修法是**给槽位新增显式的 `baseYMode: 'absolute' | 'relative'` 字段**（属布局 schema 变更、需全量回归），
        收益不抵风险 ⇒ 本轮以例外表 + 本条 wart 登记收口，待专门卡处理。 */
  'C-gate-inner': 0.9,
});
const INTERIOR_DEFERRED_CITY_GATES = Object.freeze([
  'F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east',
]);
const INTERIOR_WALL_T = 0.6;
const INTERIOR_ENTRY_INSET = 1.5;

function innerBoundsOf(slot) {
  const b = slot.bounds;
  return { minX: b.minX + INTERIOR_WALL_T, maxX: b.maxX - INTERIOR_WALL_T, minZ: b.minZ + INTERIOR_WALL_T, maxZ: b.maxZ - INTERIOR_WALL_T };
}
/** 门所在外墙侧：由 entrance 与 bounds 的关系判定（不靠区名/朝向猜） */
function doorSideOf(slot) {
  const b = slot.bounds; const e = slot.entrance;
  if (Math.abs(e.z - b.minZ) < 1e-6) return 'minZ';
  if (Math.abs(e.z - b.maxZ) < 1e-6) return 'maxZ';
  if (Math.abs(e.x - b.minX) < 1e-6) return 'minX';
  if (Math.abs(e.x - b.maxX) < 1e-6) return 'maxX';
  return slot.door?.axis === 'x' ? 'minX' : 'minZ';
}
function buildInteriorSliceA() {
  const walkables = []; const viewpoints = []; const fps = [];
  INTERIOR_SLICE_A_IDS.forEach((id, k) => {
    const slot = SLOT_BY_ID[id];
    if (!slot) return;
    const ib = innerBoundsOf(slot);
    const groundY = INTERIOR_PASSAGE_FLOOR[id] ?? (zoneGroundY(slot.zone) + slot.baseY); // t72 城门通道面 / t83 区域地坪 + 建筑台基
    const cx = (ib.minX + ib.maxX) / 2; const cz = (ib.minZ + ib.maxZ) / 2;
    const side = doorSideOf(slot);
    const axis = side === 'minX' || side === 'maxX' ? 'x' : 'z';
    const dc = slot.door?.center ?? { x: cx, z: cz };
    const wkN = `WK-${id}-interior`;
    walkables.push(WK(wkN, slot.zone, 'interior', `${slot.name}内景地面`, ib.minX, ib.maxX, ib.minZ, ib.maxZ, groundY));
    const near = (a, aMin, aMax) => (a === 'minZ' || a === 'minX' ? aMin + (aMax - aMin) * 0.3 : aMax - (aMax - aMin) * 0.3);
    const far = (a, aMin, aMax) => (a === 'minZ' || a === 'minX' ? aMin + (aMax - aMin) * 0.75 : aMax - (aMax - aMin) * 0.75);
    viewpoints.push(VP(`VP-${id}-interior`, `${slot.name}内景`, 'interior', slot.zone,
      axis === 'z' ? [dc.x, groundY + 1.65, near(side, ib.minZ, ib.maxZ)] : [near(side, ib.minX, ib.maxX), groundY + 1.65, dc.z],
      axis === 'z' ? [dc.x, groundY + 1.4, far(side, ib.minZ, ib.maxZ)] : [far(side, ib.minX, ib.maxX), groundY + 1.4, dc.z],
      { fov: 62, owner: 't1', note: `${INTERIOR_PASSAGE_FLOOR[id] != null ? '门洞通道面' : '室内台基面'} y=${groundY}，包围盒 x[${ib.minX},${ib.maxX}] z[${ib.minZ},${ib.maxZ}]（t70/t72 派生）` }));
    const along = INTERIOR_ENTRY_INSET * (side === 'minZ' || side === 'minX' ? 1 : -1);
    fps.push({
      index: 10 + k,
      id: `WP-fp-${id}`,
      name: `${slot.name}门内`,
      zone: slot.zone,
      position: axis === 'z' ? { x: dc.x, y: groundY + 1.65, z: dc.z + along } : { x: dc.x + along, y: groundY + 1.65, z: dc.z },
      passes: [],
      surfaceId: wkN,
      buildingId: id,
      doorWidth: slot.doorWidth,
    });
  });
  /* t75：门洞通道可行走面（kind:'passage'）—— 让"室内地面 ↔ 室外地面"在可行走图上连通。
     几何全部由 door / facing / bounds 派生：沿 door.axis、宽 = doorWidth、
     轴向跨 [外墙面向外 2.4m, 向内 0.6m]（搭到室内面外沿 + 门外地面）；
     y 取该栋内景地面（= door.sillY；4 座城门例外，取已登记的通道面 0.4，见 INTERIOR_PASSAGE_FLOOR）。 */
  for (const id of [...INTERIOR_SLICE_A_IDS, 'B-hall-main', 'C-hall-bed-main']) {
    const slot = SLOT_BY_ID[id];
    if (!slot?.door) continue;
    const groundY = INTERIOR_PASSAGE_FLOOR[id] ?? INTERIOR_LEGACY_FLOOR[id] ?? (zoneGroundY(slot.zone) + slot.baseY); // t97：与内景地面同源
    const half = (slot.door.width ?? slot.doorWidth) / 2;
    const OUT = 6.0; const IN = INTERIOR_LEGACY_IN[id] ?? 0.6; // 外伸 6m 搭到室外地面；既有两栋向内加长
    const b = slot.bounds;
    let minX, maxX, minZ, maxZ;
    if (slot.door.axis === 'z') {
      const south = slot.facing === 'south';
      const face = south ? b.minZ : b.maxZ;
      minZ = south ? face - OUT : face - IN;
      maxZ = south ? face + IN : face + OUT;
      minX = slot.x - half; maxX = slot.x + half;
    } else {
      const west = slot.facing === 'west';
      const face = west ? b.minX : b.maxX;
      minX = west ? face - OUT : face - IN;
      maxX = west ? face + IN : face + OUT;
      minZ = slot.z - half; maxZ = slot.z + half;
    }
    walkables.push(WK(`WK-${id}-door-passage`, slot.zone, 'passage', `${slot.name}门洞通道`, minX, maxX, minZ, maxZ, groundY));
  }
  for (const spec of C_DESCENT_BANDS) {
    const slot = SLOT_BY_ID[spec.id];
    for (let i = 0; i < spec.ys.length; i += 1) {
      walkables.push(WK(`WK-${spec.id}-descent-${i + 1}`, spec.zone, 'ground', `${slot.name}门外下坡 ${i + 1}/${spec.ys.length}`,
        spec.xs[i][0], spec.xs[i][1], spec.z0, spec.z1, spec.ys[i]));
    }
  }
  for (const spec of T131_EXTRA_STEPS) {
    const slot = SLOT_BY_ID[spec.id];
    for (let i = 0; i < spec.ys.length; i += 1) {
      const near = 1.05 * i; const far = 1.05 * (i + 1);
      const a = spec.dir > 0 ? Math.ceil(spec.from + far) : Math.floor(spec.from - far);
      const b = spec.dir > 0 ? spec.from + near : spec.from - near;
      walkables.push(WK(`WK-${spec.id}-transition-${i + 1}`, spec.zone, 'ground', `${slot.name}门外过渡 ${i + 1}/${spec.ys.length}`,
        Math.min(a, b), Math.max(a, b), spec.z0, spec.z1, spec.ys[i]));
    }
  }
  for (const spec of C_SIDE_MAIN_STEPS) {
    /* 自通道面外端（west: x=-56.6 / east: x=+56.6）向外铺两级：1.3（靠门）→ 1.7 由通道面本身提供 */
    const slot = SLOT_BY_ID[spec.id];
    const outer = spec.from; // 门面（west: -50 朝东 / east: +50 朝西）
    const ys = [1.3, 0.9];
    for (let i = 0; i < ys.length; i += 1) {
      const near = 1.05 * i; const far = 1.05 * (i + 1);
      const a = spec.dir > 0 ? Math.ceil(outer + far) : Math.floor(outer - far);
      const b = spec.dir > 0 ? outer + near : outer - near;
      const minX = Math.min(a, b); const maxX = Math.max(a, b);
      walkables.push(WK(`WK-${spec.id}-transition-${i + 1}`, spec.zone, 'ground', `${slot.name}门外过渡 ${i + 1}/2`,
        minX, maxX, spec.z0, spec.z1, ys[i]));
    }
  }
  for (const pid of PAVILION_THRESHOLDS) {
    const slot = SLOT_BY_ID[pid]; const b = slot.bounds; const t = slot.baseY; // 亭地面（相对本区）
    const zoneG = zoneGroundY(slot.zone);
    const w = slot.w; const d = slot.d;
    // 门在 facing 侧；门槛铺在该侧外沿 1.2m（加法，不撤既有铺面）
    const v = DIR_VEC[slot.facing];
    const cx = slot.x + (v.x * (w / 2)) + (v.x * 0.6);
    const cz = slot.z + (v.z * (d / 2)) + (v.z * 0.6);
    const halfW = (slot.facing === 'south' || slot.facing === 'north') ? w / 2 : 0.6;
    const halfD = (slot.facing === 'south' || slot.facing === 'north') ? 0.6 : d / 2;
    walkables.push(WK(`WK-${pid}-threshold`, slot.zone, 'ground', `${slot.name}入口门槛`,
      cx - halfW, cx + halfW, cz - halfD, cz + halfD, +(zoneG + t / 2).toFixed(3)));
  }
  /* t102：按 **t100 权威 Δ 清单**（docs/report-completeness.md §15.2 表 A）为 18 栋不可达内景登记
     门外→门内过渡台阶（**仅登记几何**；可达性由 t77 生产口径复验、t88 消费 connector）。
     参数：n = ceil(|Δ|/0.5)（相邻面 |Δy| ≤ 0.5，求解器台阶阈值）；每级长 = run/n，run = max(|Δ|/0.62, n*0.6)；
     几何：沿门轴、宽 = doorWidth、从**通道面外端**起逐级向外（Δ>0 递降 / Δ<0 递升）；y 线性插值。
     Δ 值逐栋取自 t100 表 A，**未自行定义判据**。 */
  const T100_DELTA = Object.freeze({
    'B-hall-mid': 2.0, 'B-hall-rear': 1.8, 'B-side-east-main': -1.5, 'B-side-west-main': -1.5,
    'B-side-east-rear': 1.0, 'B-side-west-rear': 1.0, 'B-side-east-south': 0.9, 'B-side-west-south': 0.9,
    'C-hall-bed-rear': 1.2, 'C-side-east-rear': 0.6, 'C-side-west-rear': 0.6,
    'D-court1-hall': 0.9, 'D-court2-hall': 0.9, 'D-court3-hall': 0.9, 'D-court4-hall': 0.9,
    'E-court1-hall': 1.0, 'E-court2-hall': 1.0, 'E-court4-hall': 0.9,
  });
  for (const [id, delta] of Object.entries(T100_DELTA)) {
    const slot = SLOT_BY_ID[id];
    if (!slot?.door) continue;
    const groundY = INTERIOR_PASSAGE_FLOOR[id] ?? INTERIOR_LEGACY_FLOOR[id] ?? (zoneGroundY(slot.zone) + slot.baseY);
    const n = Math.max(2, Math.ceil(Math.abs(delta) / 0.5));
    const run = Math.max(Math.abs(delta) / 0.62, n * 0.6);
    /* t121：**每级足印进深 ≥ CELL_FLOOR_DEPTH(1.05m)** —— cellSize:1 的走查网格只认**格心**，
       0.8m 级的台阶带可能不含任何格心（t121 实测 43 条里 31 条为 0 格心）⇒ 图上不可见。
       加宽是**加法**（向外延伸），y 序列与逐级 ≤0.5 不变，且总跑长只会变长（坡更缓）。 */
    const CELL_FLOOR_DEPTH = 1.05;
    const stepLen = Math.max(run / n, CELL_FLOOR_DEPTH);
    const halfW = (slot.door.width ?? slot.doorWidth) / 2;
    const outward = DIR_VEC[slot.facing]; // 门外方向
    const ax = slot.door.axis; // 'x' | 'z'
    for (let i = 0; i < n; i += 1) {
      const face = passageEdgeBySlot(slot);
      const near = stepLen * i;      // 距通道面外端的偏移
      const far = near + stepLen;
      const y = groundY - delta * ((i + 1) / n); // t102：i=0 贴通道面（低于内景地面一个台阶），最外级落在门外地面
      let minX; let maxX; let minZ; let maxZ;
      /* t121：外沿**吸附到整数格界**（向外取 ceil/floor）⇒ 每条台阶带必含 cellSize:1 的格心（≥1 个格），
         避免"坡道存在但走查网格看不见"。内沿仍贴通道面外端（保持与通道面接续）。 */
      const snapOut = (v, outwardNegative) => (outwardNegative ? Math.floor(v) : Math.ceil(v));
      if (ax === 'z') {
        const base = face;
        const outer = snapOut(outward.z < 0 ? base - far : base + far, outward.z < 0);
        const a = outward.z < 0 ? base - near : base + near;
        minZ = Math.min(a, outer); maxZ = Math.max(a, outer);
        minX = slot.x - halfW; maxX = slot.x + halfW;
      } else {
        const base = face;
        const outer = snapOut(outward.x < 0 ? base - far : base + far, outward.x < 0);
        const a = outward.x < 0 ? base - near : base + near;
        minX = Math.min(a, outer); maxX = Math.max(a, outer);
        minZ = slot.z - halfW; maxZ = slot.z + halfW;
      }
      /* kind 用既有合法值 `ground`（台阶本就是地面级可行走面）；**不复用新 kind** —— `WALKABLE_KINDS`
         白名单在 core（t79 教训），新增 kind 需同步 core（属 core 卡）。过渡面以 **id 后缀 `-transition-N`** 标识。 */
      walkables.push(WK(`WK-${id}-transition-${i + 1}`, slot.zone, 'ground', `${slot.name}门外过渡 ${i + 1}/${n}`,
        minX, maxX, minZ, maxZ, +y.toFixed(3)));
    }
  }
  return { walkables, viewpoints, fps };
}
/* t102 辅助：门洞通道面的几何端点（用于把过渡台阶接在通道面外端） */
function passageEdgeBySlot(slot) {
  /* t102：门外基准 = t100 的「通道面进深轴**外端**」= 外墙面向外 6.0m（与 INTERIOR 通道面 OUT 一致） */
  const b = SLOT_BY_ID[slot.id].bounds; const f = slot.facing; const OUT = 6.0;
  return f === 'south' ? b.minZ - OUT : f === 'north' ? b.maxZ + OUT : f === 'west' ? b.minX - OUT : b.maxX + OUT;
}
/* t103：B 两座亭（Δ0.6 > 0.5m 台阶阈值）的**加法门槛**——保留既有铺面，另加一级 0.3m 门槛，
   使 广场(0) → 门槛(0.3) → 亭地面(0.6) 相邻高差各 0.3 ≤ 0.5。 */
const PAVILION_THRESHOLDS = Object.freeze(['B-pavilion-gate-west', 'B-pavilion-gate-east']);

/* t128：C 两栋（开槽后暴露的）通道面 ↔ C 区地坪（0.9）之间的**加法分级台阶** —— 1.3 → 1.7，
   每级 0.4 ≤ 0.5，进深 ≥1.05m 且外沿吸附整数格界（t121 口径：cellSize:1 必须含格心）。 */
/* t151：**加法下坡带**（只读口袋分析结论）——C 两殿门外走廊带内 x∈[±44,±48] 的格
   **未被任何更高面覆盖**（实测顶层 = `WK-C-ground` 0.9），而相邻台基段 `WK-C-bed-terrace-mid`(2.4) 与之相差 1.5 ⇒ dropTooDeep。
   ⇒ 在该未被覆盖的窗口内补 2 级下坡（1.9 / 1.4，每级 0.5 ≤ 0.5），下端接既有 transition-1(1.3) 与 ground(0.9)。
   **加法优先**：此处加法不会被取高（窗口未被覆盖），故不必再动台基（t150 已证仅回撤不足）。 */
const C_DESCENT_BANDS = Object.freeze([
  { id: 'C-side-west-main', zone: 'C', xs: [[-46, -44], [-48, -46]], ys: [1.9, 1.4], z0: 155, z1: 181 },
  { id: 'C-side-east-main', zone: 'C', xs: [[44, 46], [46, 48]], ys: [1.9, 1.4], z0: 155, z1: 181 },
]);

/* t131：**加法**补 `E-court3-hall` 的门外分级台阶 —— 其通道面 1.3 与 E 区地坪 0.4 相差 0.9 > 0.5，
   而它**不在 t100 的 18 栋内**（当时记为“Δ 超阈但已可达”）⇒ 新加的“通路存在守卫”首个捕获项。
   加法（新增面），不动任何既有几何。 */
const T131_EXTRA_STEPS = Object.freeze([
  { id: 'E-court3-hall', zone: 'E', from: 238, dir: -1, z0: 7, z1: 33, ys: [0.85, 0.4] },
]);

const C_SIDE_MAIN_STEPS = Object.freeze([
  { id: 'C-side-west-main', zone: 'C', from: -50, dir: 1, z0: 155, z1: 181 },
  { id: 'C-side-east-main', zone: 'C', from: 50, dir: -1, z0: 155, z1: 181 },
]);

const INTERIOR_SLICE_A = buildInteriorSliceA();

export const WALKABLE = deepFreeze([
  WK('WK-F-bank-south', 'F', 'outerTerrain', '南岸地形', -420, 420, -560, -506, TERRAIN.outerTerrainY),
  WK('WK-F-bank-north', 'F', 'outerTerrain', '北岸地形', -420, 420, 506, 560, TERRAIN.outerTerrainY),
  WK('WK-F-bank-west', 'F', 'outerTerrain', '西岸地形', -420, -366, -506, 506, TERRAIN.outerTerrainY),
  WK('WK-F-bank-east', 'F', 'outerTerrain', '东岸地形', 366, 420, -506, 506, TERRAIN.outerTerrainY),
  WK('WK-F-berm-south', 'F', 'ground', '南墙外岸台', -332, 332, -472, -458, TERRAIN.cityGroundY),
  WK('WK-F-berm-north', 'F', 'ground', '北墙外岸台', -332, 332, 458, 472, TERRAIN.cityGroundY),
  WK('WK-F-berm-west', 'F', 'ground', '西墙外岸台', -332, -308, -458, 458, TERRAIN.cityGroundY),
  WK('WK-F-berm-east', 'F', 'ground', '东墙外岸台', 308, 332, -458, 458, TERRAIN.cityGroundY),
  WK('WK-F-bridge-south', 'F', 'bridgeDeck', '南桥桥面', -8, 8, -506, -472, TERRAIN.bridgeDeckY),
  WK('WK-F-bridge-north', 'F', 'bridgeDeck', '北桥桥面', -8, 8, 472, 506, TERRAIN.bridgeDeckY),
  WK('WK-F-bridge-west', 'F', 'bridgeDeck', '西桥桥面', -366, -332, -6, 6, TERRAIN.bridgeDeckY),
  WK('WK-F-bridge-east', 'F', 'bridgeDeck', '东桥桥面', 332, 366, -6, 6, TERRAIN.bridgeDeckY),
  WK('WK-F-belt-south', 'F', 'ground', '南门内侧带', -300, 300, -450, -400, TERRAIN.beltY),
  WK('WK-F-belt-north', 'F', 'ground', '北门内侧带', -300, 300, 420, 450, TERRAIN.beltY),
  WK('WK-F-garden', 'F', 'gardenGround', '御花园地坪', -300, 300, 300, 420, TERRAIN.gardenPathsY),
  WK('WK-B-plaza', 'B', 'ground', '礼仪广场', -100, 100, -400, -168, TERRAIN.terraceGroundY),
  WK('WK-B-terrace-strip-west', 'B', 'ground', '主殿西侧地面', -100, -88, -168, -64, TERRAIN.terraceGroundY),
  WK('WK-B-terrace-strip-east', 'B', 'ground', '主殿东侧地面', 88, 100, -168, -64, TERRAIN.terraceGroundY),
  WK('WK-B-terrace-tier1', 'B', 'terrace', '主殿台基一层顶', -88, 88, -168, -64, MODULES.terraceTierHeight),
  /* t126：**有界开槽**（主理人明确授权的**减法例外**）——
     `B-side-west-main` / `B-side-east-main` 的坡道走廊上，原 tier2 整块把过渡台阶
     `transition-1@2.0` / `transition-2@2.5` **完全内含**（平面投影）⇒「最高面优先」的解析在该走廊只见 3.0，
     链退化为 1.5 → 3.0（Δ1.5）；**加法已被证明必然无效**（新增台阶同样被内含）⇒ 才动这一处减法。
     开槽范围：仅两条门洞走廊（宽度=门洞净宽、长度=坡道走廊全程），tier2 其余区域**原样保留**。 */
  WK('WK-B-terrace-tier2-south', 'B', 'terrace', '主殿台基二层顶（南段，t126 开槽后）', -72, 72, -158, -129, MODULES.terraceTierHeight * 2),
  WK('WK-B-terrace-tier2-north', 'B', 'terrace', '主殿台基二层顶（北段，t126 开槽后）', -72, 72, -103, -74, MODULES.terraceTierHeight * 2),
  /* t134：**删除 t126/t128 开槽的残片** `WK-B-terrace-tier2-west` —— B 西残片（真覆盖者：门带被取高到 3.0）；沿用有界开槽模式（不降台地高度、其余区域原样）。 */
  WK('WK-B-terrace-tier2-mid', 'B', 'terrace', '主殿台基二层顶（中段，t126 开槽后）', -62, 62, -129, -103, MODULES.terraceTierHeight * 2),
  /* t134：**删除 t126/t128 开槽的残片** `WK-B-terrace-tier2-east` —— B 东残片；沿用有界开槽模式（不降台地高度、其余区域原样）。 */
  WK('WK-B-terrace-tier3', 'B', 'terrace', '主殿台基三层顶', -56, 56, -148, -84, MODULES.terraceTotalHeight),
  WK('WK-B-hall-main-interior', 'B', 'interior', '金銮殿内景地面', -36, 36, -134, -98, MODULES.terraceTotalHeight),
  WK('WK-B-ground-north', 'B', 'ground', '主殿北地面', -100, 100, -64, 80, TERRAIN.terraceGroundY),
  WK('WK-C-ground', 'C', 'ground', '后宫庭院地面', -100, 100, 80, 300, TERRAIN.innerPalaceY),
  /* t128：**第二次有界开槽**（主理人比照 t126 授权的**减法例外**）——
     `WK-C-side-{west,east}-main-door-passage@1.7` 原被本块 tier（2.4）**完全内含** ⇒「最高面优先」看不到门洞通道面。
     加法同样无效（新增面会被内含）⇒ 仅在这两条通道走廊开槽，其余区域原样保留。 */
  WK('WK-C-bed-terrace-south', 'C', 'terrace', '寝殿台基顶（南段，t128 开槽后）', -72, 72, 137, 155, 2.4),
  WK('WK-C-bed-terrace-north', 'C', 'terrace', '寝殿台基顶（北段，t128 开槽后）', -72, 72, 181, 199, 2.4),
  /* t134：**删除 t126/t128 开槽的残片** `WK-C-bed-terrace-west` —— C 西残片（真覆盖者：门中/室内被取高到 2.4）；沿用有界开槽模式（不降台地高度、其余区域原样）。 */
  /* t145：**第三次有界开槽**（主理人授权，严格限定该接近走廊）——
     `WK-C-ground`(0.9) 与 `transition-1`(1.3) 本应可跨（+0.4），但两者之间的格**顶层被本段台基 2.4 覆盖**
     ⇒ 图上出现「2.4 → 1.3 = −1.10 dropTooDeep」的断点（`t143` 逐格底数据）。
     **为何不是补台阶**：断点处中间格顶层已被台基覆盖，补台阶会被**同样覆盖**（`t125/t126` 已证“加法在此必然无效”）⇒ 只能减法。
     本槽仅把中段两端各收 3.9m（x: ±47.9 → ±44），使 0.9 与 1.3 的格相邻；**台基高度未降、其余区域原样**。 */
  WK('WK-C-bed-terrace-mid', 'C', 'terrace', '寝殿台基顶（中段，t128 开槽后；t145 再收两端）', -44, 44, 155, 181, 2.4),
  /* t134：**删除 t126/t128 开槽的残片** `WK-C-bed-terrace-east` —— C 东残片；沿用有界开槽模式（不降台地高度、其余区域原样）。 */
  WK('WK-C-bed-interior', 'C', 'interior', '寝殿内景地面', -27, 27, 154, 182, 2.4),
  WK('WK-D-ground', 'D', 'ground', '西宫苑地坪', -300, -100, -400, 300, TERRAIN.sideCourtY),
  WK('WK-E-ground', 'E', 'ground', '东宫苑地坪', 100, 300, -400, 300, TERRAIN.sideCourtY),
  ...INTERIOR_SLICE_A.walkables,
]);

/** 可行走面索引（重叠时按 y 降序，供 floorYAt / 碰撞使用）。 */
export function walkableAt(x, z) {
  const hits = [];
  for (const s of WALKABLE) {
    const r = s.bounds;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) hits.push(s);
  }
  hits.sort((p, q) => q.y - p.y);
  return hits;
}

/** 地面高度：可行走面最高面优先；位于道路/坡道/台阶走廊内时，按线性插值取面高，仍取最高。 */
export function floorYAt(x, z) {
  let y = null;
  for (const s of WALKABLE) {
    const r = s.bounds;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      if (y === null || s.y > y) y = s.y;
    }
  }
  for (const road of ROADS) {
    const { x: x1, z: z1, y: y1 } = road.from;
    const { x: x2, z: z2, y: y2 } = road.to;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const t = ((x - x1) * dx + (z - z1) * dz) / len2;
    if (t < 0 || t > 1) continue;
    const px = x1 + dx * t;
    const pz = z1 + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist > road.width / 2) continue;
    const ry = y1 + (y2 - y1) * t;
    if (y === null || ry > y) y = ry;
  }
  return y;
}

/* =============================================================================
 * 九、障碍、水体和点景：不可进入建筑登记为障碍物，不得成为可穿越空间
 * ========================================================================== */

/** 建筑障碍：全部槽位都登记（可通行构件带 door 口）；水面/假山/城墙单独登记。 */
export const OBSTACLES = deepFreeze([
  ...SLOTS.map((s) => ({
    id: `OB-${s.id}`,
    sourceType: 'building',
    zone: s.zone,
    buildingId: s.id,
    bounds: s.bounds,
    y0: s.baseY,
    y1: s.totalHeight,
    blocks: s.hasDoor ? 'exceptDoor' : 'all',
    door: s.door,
    note: s.visitable ? '可进入内景：门洞可通行，墙体阻挡' : s.hasDoor ? '门洞可通行，其余体块阻挡' : '整体阻挡（不可进入）',
  })),
  ...CITY_WALL.innerFace
    ? [
        {
          id: 'OB-WALL-CITY-south',
          sourceType: 'wall',
          zone: 'F',
          buildingId: 'WALL-CITY',
          bounds: b(-304, 304, -458, -450),
          y0: 0,
          y1: CITY_WALL.height,
          blocks: 'exceptDoor',
          door: { axis: 'x', center: { x: 0, z: -454 }, width: 26, height: 12, sillY: 0.4 },
          note: '南段宫墙，南城门处留门洞',
        },
        {
          id: 'OB-WALL-CITY-north',
          sourceType: 'wall',
          zone: 'F',
          buildingId: 'WALL-CITY',
          bounds: b(-304, 304, 450, 458),
          y0: 0,
          y1: CITY_WALL.height,
          blocks: 'exceptDoor',
          door: { axis: 'x', center: { x: 0, z: 454 }, width: 26, height: 12, sillY: 0.4 },
          note: '北段宫墙，北城门处留门洞',
        },
        {
          id: 'OB-WALL-CITY-west',
          sourceType: 'wall',
          zone: 'F',
          buildingId: 'WALL-CITY',
          bounds: b(-308, -300, -458, 458),
          y0: 0,
          y1: CITY_WALL.height,
          blocks: 'exceptDoor',
          door: { axis: 'z', center: { x: -304, z: 0 }, width: 26, height: 12, sillY: 0.4 },
          note: '西段宫墙，西侧门处留门洞',
        },
        {
          id: 'OB-WALL-CITY-east',
          sourceType: 'wall',
          zone: 'F',
          buildingId: 'WALL-CITY',
          bounds: b(300, 308, -458, 458),
          y0: 0,
          y1: CITY_WALL.height,
          blocks: 'exceptDoor',
          door: { axis: 'z', center: { x: 304, z: 0 }, width: 26, height: 12, sillY: 0.4 },
          note: '东段宫墙，东侧门处留门洞',
        },
      ]
    : [],
  ...MOAT.rects.map((r) => ({
    id: `OB-${r.id}`,
    sourceType: 'water',
    zone: 'F',
    buildingId: r.id,
    bounds: r.bounds,
    y0: MOAT.waterY - MOAT.depth,
    y1: MOAT.waterY,
    blocks: 'all',
    door: null,
    note: '护城河水面：不可行走（桥面另行登记为可行走面）',
  })),
  {
    id: 'OB-WB-F-pond-west',
    sourceType: 'water',
    zone: 'F',
    buildingId: 'WB-F-pond-west',
    bounds: b(-250, -150, 318, 392),
    y0: -0.4,
    y1: 0.05,
    blocks: 'all',
    door: null,
    note: '御花园西水池：不可行走',
  },
  {
    id: 'OB-WB-F-pond-east',
    sourceType: 'water',
    zone: 'F',
    buildingId: 'WB-F-pond-east',
    bounds: b(150, 250, 318, 392),
    y0: -0.4,
    y1: 0.05,
    blocks: 'all',
    door: null,
    note: '御花园东水池：不可行走',
  },
  {
    id: 'OB-WB-D-pond',
    sourceType: 'water',
    zone: 'D',
    buildingId: 'WB-D-pond',
    bounds: b(-188, -124, 16, 68),
    y0: -0.2,
    y1: 0.05,
    blocks: 'all',
    door: null,
    note: '西侧服务院水池：不可行走（亭子单独登记）',
  },
  {
    id: 'OB-WB-E-pond',
    sourceType: 'water',
    zone: 'E',
    buildingId: 'WB-E-pond',
    bounds: b(124, 188, 16, 68),
    y0: -0.2,
    y1: 0.05,
    blocks: 'all',
    door: null,
    note: '东侧生活院水池：不可行走（水榭单独登记）',
  },
  {
    id: 'OB-SC-F-rockery-west',
    sourceType: 'rockery',
    zone: 'F',
    buildingId: 'SC-F-rockery-west',
    bounds: b(-285, -255, 320, 360),
    y0: 0.5,
    y1: 7.2,
    blocks: 'all',
    door: null,
    note: '御花园西假山：不可穿越',
  },
  {
    id: 'OB-SC-F-rockery-east',
    sourceType: 'rockery',
    zone: 'F',
    buildingId: 'SC-F-rockery-east',
    bounds: b(255, 285, 320, 360),
    y0: 0.5,
    y1: 7.2,
    blocks: 'all',
    door: null,
    note: '御花园东假山：不可穿越',
  },
]);

/** 水体登记（渲染与反射用）。 */
export const WATER_BODIES = deepFreeze([
  ...MOAT.rects.map((r) => ({ id: r.id, kind: 'moat', owner: 'F', bounds: r.bounds, y: MOAT.waterY, depth: MOAT.depth })),
  { id: 'WB-F-pond-west', kind: 'pond', owner: 'F', bounds: b(-250, -150, 318, 392), y: 0.05, depth: 0.45 },
  { id: 'WB-F-pond-east', kind: 'pond', owner: 'F', bounds: b(150, 250, 318, 392), y: 0.05, depth: 0.45 },
  { id: 'WB-D-pond', kind: 'pond', owner: 'D', bounds: b(-188, -124, 16, 68), y: 0.05, depth: 0.35 },
  { id: 'WB-E-pond', kind: 'pond', owner: 'E', bounds: b(124, 188, 16, 68), y: 0.05, depth: 0.35 },
]);

/** 假山与点景（不属于有顶建筑，不计数）。 */
export const SCENIC_OBJECTS = deepFreeze([
  { id: 'SC-F-rockery-west', kind: 'rockery', owner: 'F', bounds: b(-285, -255, 320, 360), height: 7.2, styleRole: 'stoneWhite' },
  { id: 'SC-F-rockery-east', kind: 'rockery', owner: 'F', bounds: b(255, 285, 320, 360), height: 7.2, styleRole: 'stoneWhite' },
  { id: 'SC-F-garden-screen', kind: 'screenWall', owner: 'F', bounds: b(-60, 60, 330, 332), height: 3.2, styleRole: 'wallPrimary' },
  { id: 'SC-B-plaza-drum', kind: 'drum', owner: 'B', bounds: b(-24, -18, -366, -360), height: 1.4, styleRole: 'metalGilt' },
  { id: 'SC-B-plaza-bell', kind: 'bell', owner: 'B', bounds: b(18, 24, -366, -360), height: 1.4, styleRole: 'metalGilt' },
]);

/** 廊道段（按段统计，不计入建筑数量）。 */
export const CORRIDORS = deepFreeze([
  { id: 'CR-B-plaza-west', owner: 'B', name: '礼仪广场西廊庑', from: { x: -92, z: -374 }, to: { x: -92, z: -182 }, width: MODULES.corridorWidth, floors: 3 },
  { id: 'CR-B-plaza-east', owner: 'B', name: '礼仪广场东廊庑', from: { x: 92, z: -374 }, to: { x: 92, z: -182 }, width: MODULES.corridorWidth, floors: 3 },
  { id: 'CR-B-throne-west', owner: 'B', name: '主殿院西廊', from: { x: -92, z: -178 }, to: { x: -92, z: -42 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-B-throne-east', owner: 'B', name: '主殿院东廊', from: { x: 92, z: -178 }, to: { x: 92, z: -42 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-B-rear-west', owner: 'B', name: '后殿院西廊', from: { x: -92, z: -38 }, to: { x: -92, z: 76 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-B-rear-east', owner: 'B', name: '后殿院东廊', from: { x: 92, z: -38 }, to: { x: 92, z: 76 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-C-front-west', owner: 'C', name: '内廷一进西廊', from: { x: -80, z: 84 }, to: { x: -80, z: 138 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-C-front-east', owner: 'C', name: '内廷一进东廊', from: { x: 80, z: 84 }, to: { x: 80, z: 138 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-C-main-west', owner: 'C', name: '寝殿院西廊', from: { x: -90, z: 146 }, to: { x: -90, z: 212 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-C-main-east', owner: 'C', name: '寝殿院东廊', from: { x: 90, z: 146 }, to: { x: 90, z: 212 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-C-rear-west', owner: 'C', name: '后寝院西廊', from: { x: -90, z: 220 }, to: { x: -90, z: 296 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-C-rear-east', owner: 'C', name: '后寝院东廊', from: { x: 90, z: 220 }, to: { x: 90, z: 296 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-D-court1-south', owner: 'D', name: '礼乐院南廊', from: { x: -286, z: -384 }, to: { x: -200, z: -384 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-D-court2-south', owner: 'D', name: '书院院南廊', from: { x: -286, z: -222 }, to: { x: -120, z: -222 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-D-court3-south', owner: 'D', name: '服务院南廊', from: { x: -286, z: -62 }, to: { x: -120, z: -62 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-D-court4-south', owner: 'D', name: '西后院南廊', from: { x: -286, z: 98 }, to: { x: -120, z: 98 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-E-court1-south', owner: 'E', name: '文华院南廊', from: { x: 120, z: -390 }, to: { x: 286, z: -390 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-E-court2-south', owner: 'E', name: '陈设院南廊', from: { x: 120, z: -214 }, to: { x: 286, z: -214 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-E-court3-south', owner: 'E', name: '生活院南廊', from: { x: 120, z: -38 }, to: { x: 286, z: -38 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-E-court4-south', owner: 'E', name: '东后院南廊', from: { x: 120, z: 132 }, to: { x: 286, z: 132 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-F-garden-west', owner: 'F', name: '御花园西廊', from: { x: -120, z: 306 }, to: { x: -120, z: 392 }, width: MODULES.corridorWidth, floors: 1 },
  { id: 'CR-F-garden-east', owner: 'F', name: '御花园东廊', from: { x: 120, z: 306 }, to: { x: 120, z: 392 }, width: MODULES.corridorWidth, floors: 1 },
]);

/* =============================================================================
 * 十、WALLS：宫墙四段 + 院落墙（由院落 bounds 生成，自动开门洞）
 * ========================================================================== */

function segmentBox(from, to, thickness) {
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z);
  if (horizontal) {
    return b(Math.min(from.x, to.x), Math.max(from.x, to.x), from.z - thickness / 2, from.z + thickness / 2);
  }
  return b(from.x - thickness / 2, from.x + thickness / 2, Math.min(from.z, to.z), Math.max(from.z, to.z));
}

/** 找出所有穿过该墙段且在墙段跨度内的开口（门洞槽位 / 跨区通道 / 道路段）。 */
function computeOpenings(wall, from, to) {
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z);
  const line = horizontal ? from.z : from.x;
  const lo = horizontal ? Math.min(from.x, to.x) : Math.min(from.z, to.z);
  const hi = horizontal ? Math.max(from.x, to.x) : Math.max(from.z, to.z);
  const found = [];

  const consider = (source, point, width, kind, tol) => {
    const along = horizontal ? point.x : point.z;
    const across = horizontal ? point.z : point.x;
    if (across < line - tol || across > line + tol) return;
    if (along < lo - 1 || along > hi + 1) return;
    found.push({ at: +along.toFixed(2), width, source, kind });
  };

  for (const s of SLOTS) {
    if (!s.hasDoor) continue;
    consider(s.id, { x: s.x, z: s.z }, s.doorWidth, 'gateSlot', 14);
  }
  for (const c of CONNECTORS) {
    consider(c.id, c.position, c.width, 'connector', 10);
  }
  for (const r of ROADS) {
    const from2 = { x: r.from.x, z: r.from.z };
    const to2 = { x: r.to.x, z: r.to.z };
    const crosses = horizontal
      ? (from2.z - line) * (to2.z - line) <= 0 && from2.z !== to2.z
      : (from2.x - line) * (to2.x - line) <= 0 && from2.x !== to2.x;
    if (!crosses) continue;
    const t = horizontal ? (line - from2.z) / (to2.z - from2.z) : (line - from2.x) / (to2.x - from2.x);
    const at = horizontal ? from2.x + (to2.x - from2.x) * t : from2.z + (to2.z - from2.z) * t;
    consider(r.id, horizontal ? { x: at, z: line } : { x: line, z: at }, r.width, 'road', 6);
  }

  found.sort((p, q) => p.at - q.at);
  const merged = [];
  for (const item of found) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.at - item.at) <= 4) {
      last.width = Math.max(last.width, item.width);
      if (!last.sources.includes(item.source)) last.sources.push(item.source);
      continue;
    }
    merged.push({ at: item.at, width: item.width, sources: [item.source], kind: item.kind });
  }
  return merged;
}

function makeWall(id, owner, kind, name, from, to, thickness, height, extra = {}) {
  const box = segmentBox(from, to, thickness);
  const wall = {
    id,
    owner,
    kind,
    name,
    from,
    to,
    axis: Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) ? 'x' : 'z',
    thickness,
    height,
    bounds: box,
    openings: [],
    ...extra,
  };
  wall.openings = computeOpenings(wall, from, to);
  return wall;
}

export const WALLS = deepFreeze([
  makeWall('WALL-CITY-south', 'F', 'cityWall', '南段宫墙', { x: -304, z: -454 }, { x: 304, z: -454 }, CITY_WALL.thickness, CITY_WALL.height, { cityWall: true }),
  makeWall('WALL-CITY-north', 'F', 'cityWall', '北段宫墙', { x: -304, z: 454 }, { x: 304, z: 454 }, CITY_WALL.thickness, CITY_WALL.height, { cityWall: true }),
  makeWall('WALL-CITY-west', 'F', 'cityWall', '西段宫墙', { x: -304, z: -458 }, { x: -304, z: 458 }, CITY_WALL.thickness, CITY_WALL.height, { cityWall: true }),
  makeWall('WALL-CITY-east', 'F', 'cityWall', '东段宫墙', { x: 304, z: -458 }, { x: 304, z: 458 }, CITY_WALL.thickness, CITY_WALL.height, { cityWall: true }),
  ...COURTYARDS.flatMap((c) => {
    const r = c.bounds;
    return [
      makeWall(`${c.id}-wall-south`, c.zone, 'courtWall', `${c.name}南墙`, { x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ }, MODULES.courtyardWallThickness, MODULES.courtyardWallHeight, { courtyardId: c.id }),
      makeWall(`${c.id}-wall-north`, c.zone, 'courtWall', `${c.name}北墙`, { x: r.minX, z: r.maxZ }, { x: r.maxX, z: r.maxZ }, MODULES.courtyardWallThickness, MODULES.courtyardWallHeight, { courtyardId: c.id }),
      makeWall(`${c.id}-wall-west`, c.zone, 'courtWall', `${c.name}西墙`, { x: r.minX, z: r.minZ }, { x: r.minX, z: r.maxZ }, MODULES.courtyardWallThickness, MODULES.courtyardWallHeight, { courtyardId: c.id }),
      makeWall(`${c.id}-wall-east`, c.zone, 'courtWall', `${c.name}东墙`, { x: r.maxX, z: r.minZ }, { x: r.maxX, z: r.maxZ }, MODULES.courtyardWallThickness, MODULES.courtyardWallHeight, { courtyardId: c.id }),
    ];
  }),
]);

/* =============================================================================
 * 十一、VIEWPOINTS：八视角的机位登记（每区 1 zone + 1 fp-spawn；B/C 各加 1 interior）
 * ========================================================================== */

function VP(id, name, mode, area, position, target, opts = {}) {
  return {
    id,
    name,
    mode,
    area,
    position: { x: position[0], y: position[1], z: position[2] },
    target: { x: target[0], y: target[1], z: target[2] },
    fov: opts.fov ?? 45,
    cameraMode: opts.cameraMode ?? null,
    owner: opts.owner ?? area,
    note: opts.note ?? '',
  };
}

export const VIEWPOINTS = deepFreeze([
  VP('VP-city-oblique', '全城鸟瞰', 'zone', 'city', [0, 520, -1180], [0, 30, -60], { fov: 45, cameraMode: 'oblique', owner: 't2', note: '首屏：南侧高位斜俯视，覆盖城墙、城门与护城河' }),
  VP('VP-city-iso', '等距沙盘', 'zone', 'city', [900, 900, -900], [0, 20, 0], { fov: 35, cameraMode: 'iso', owner: 't2' }),
  VP('VP-B-zone', '前朝分区机位', 'zone', 'B', [0, 150, -330], [0, 20, -120], { fov: 42, owner: 't6' }),
  VP('VP-B-fp-spawn', '前朝第一人称出生点', 'fp-spawn', 'B', [-30, 1.65, -360], [0, 1.65, -300], { fov: 70, owner: 't6' }),
  VP('VP-B-interior', '金銮殿内景', 'interior', 'B', [0, 6.15, -128], [0, 5.5, -100], { fov: 62, owner: 't6', note: '室内包围盒 x[-36,36] z[-134,-98]，限制在室内' }),
  VP('VP-B-main-hall', '金銮殿近景', 'focus-extra', 'B', [0, 26, -230], [0, 8, -120], { fov: 38, owner: 't6', cameraMode: 'focus' }),
  VP('VP-C-zone', '后宫分区机位', 'zone', 'C', [0, 150, -30], [0, 25, 190], { fov: 45, owner: 't7' }),
  VP('VP-C-fp-spawn', '后宫第一人称出生点', 'fp-spawn', 'C', [-40, 2.55, 110], [0, 2.55, 170], { fov: 70, owner: 't7' }),
  VP('VP-C-interior', '寝殿内景', 'interior', 'C', [0, 4.05, 157], [0, 3.5, 180], { fov: 60, owner: 't7', note: '室内包围盒 x[-27,27] z[154,182]' }),
  VP('VP-C-bed-hall', '寝殿近景', 'focus-extra', 'C', [0, 22, -10], [0, 6, 168], { fov: 40, owner: 't7', cameraMode: 'focus' }),
  VP('VP-D-zone', '西宫苑分区机位', 'zone', 'D', [-120, 110, -560], [-200, 10, -200], { fov: 42, owner: 't10' }),
  VP('VP-D-fp-spawn', '西宫苑第一人称出生点', 'fp-spawn', 'D', [-160, 2.05, -318], [-180, 1.2, -340], { fov: 70, owner: 't10' }),
  VP('VP-D-court1', '礼乐院近景', 'focus-extra', 'D', [-150, 26, -430], [-176, 4, -358], { fov: 45, owner: 't10', cameraMode: 'focus' }),
  VP('VP-E-zone', '东宫苑分区机位', 'zone', 'E', [120, 110, -560], [200, 10, -200], { fov: 42, owner: 't11' }),
  VP('VP-E-fp-spawn', '东宫苑第一人称出生点', 'fp-spawn', 'E', [160, 2.05, -320], [180, 1.2, -340], { fov: 70, owner: 't11' }),
  VP('VP-E-court1', '文华院近景', 'focus-extra', 'E', [150, 26, -430], [196, 4, -364], { fov: 45, owner: 't11', cameraMode: 'focus' }),
  VP('VP-F-zone', '御花园分区机位', 'zone', 'F', [0, 90, 180], [0, 10, 360], { fov: 45, owner: 't8' }),
  VP('VP-F-fp-spawn', '御花园第一人称出生点', 'fp-spawn', 'F', [0, 2.15, 320], [0, 2.15, 360], { fov: 70, owner: 't8' }),
  VP('VP-F-south-gate', '南城门近景', 'focus-extra', 'F', [0, 60, -640], [0, 14, -454], { fov: 40, owner: 't8', cameraMode: 'focus' }),
  VP('VP-F-north-gate', '北城门近景', 'focus-extra', 'F', [0, 60, 660], [0, 14, 454], { fov: 40, owner: 't8', cameraMode: 'focus' }),
  ...INTERIOR_SLICE_A.viewpoints,
]);

export const VIEWPOINT_BY_ID = deepFreeze(
  VIEWPOINTS.reduce((acc, v) => {
    acc[v.id] = v;
    return acc;
  }, {}),
);

export function viewpointsByZone(zone) {
  return VIEWPOINTS.filter((v) => v.area === zone);
}

/* =============================================================================
 * 十二、导览点与第一人称走查路线（§6.2 中轴导览、§6.4 走查）
 * ========================================================================== */

export const TOUR_POINTS = deepFreeze([
  { index: 1, id: 'TP-01', name: '南桥', zone: 'F', position: { x: 0, y: 46, z: -556 }, target: { x: 0, y: 10, z: -500 }, viewpointId: null, narration: '跨护城河石桥，望向南城门城楼。' },
  { index: 2, id: 'TP-02', name: '南城门', zone: 'F', position: { x: 0, y: 52, z: -530 }, target: { x: 0, y: 14, z: -454 }, viewpointId: 'VP-F-south-gate', narration: '宫城正南门：城楼与门洞，进入即为前朝。' },
  { index: 3, id: 'TP-03', name: '前朝门殿', zone: 'B', position: { x: 0, y: 40, z: -450 }, target: { x: 0, y: 10, z: -386 }, viewpointId: null, narration: '前朝门殿，中轴第一道宫门。' },
  { index: 4, id: 'TP-04', name: '礼仪广场', zone: 'B', position: { x: 0, y: 36, z: -330 }, target: { x: 0, y: 8, z: -200 }, viewpointId: 'VP-B-zone', narration: '东西配殿与廊庑围合的礼仪大广场。' },
  { index: 5, id: 'TP-05', name: '主殿台基', zone: 'B', position: { x: 0, y: 30, z: -230 }, target: { x: 0, y: 12, z: -120 }, viewpointId: 'VP-B-main-hall', narration: '三层白石台基，丹陛御道居中，金銮殿在顶。' },
  { index: 6, id: 'TP-06', name: '金銮殿内景', zone: 'B', position: { x: 0, y: 6.15, z: -128 }, target: { x: 0, y: 5.5, z: -100 }, viewpointId: 'VP-B-interior', narration: '金砖地面、宝座、屏风、盘龙柱与藻井。' },
  { index: 7, id: 'TP-07', name: '内廷门', zone: 'C', position: { x: 0, y: 26, z: 20 }, target: { x: 0, y: 8, z: 94 }, viewpointId: 'VP-C-zone', narration: '前朝与后宫的分界，尺度收敛、围合增强。' },
  { index: 8, id: 'TP-08', name: '寝殿内景', zone: 'C', position: { x: 0, y: 4.05, z: 157 }, target: { x: 0, y: 3.5, z: 180 }, viewpointId: 'VP-C-interior', narration: '可进入的寝殿内景：床榻、屏风与金砖地面。' },
  { index: 9, id: 'TP-09', name: '后宫', zone: 'C', position: { x: 0, y: 34, z: 120 }, target: { x: 0, y: 8, z: 258 }, viewpointId: 'VP-C-bed-hall', narration: '三进内廷院落与东西配房。' },
  { index: 10, id: 'TP-10', name: '御花园', zone: 'F', position: { x: 0, y: 40, z: 250 }, target: { x: 0, y: 10, z: 380 }, viewpointId: 'VP-F-zone', narration: '中央亭阁、水池、假山与曲折步道，宫城北端收束。' },
]);

/** 第一人称走查路线（§6.4 必须可通）：南桥 → 南城门 → 前朝广场 → 主殿台基 → 金銮殿内景 → 内廷门 → 寝殿内景 → 御花园。 */
export const FP_ROUTE = deepFreeze([
  { index: 1, id: 'WP-fp-01', name: '南桥北端', zone: 'F', position: { x: 0, y: TERRAIN.bridgeDeckY + 1.65, z: -480 }, passes: ['CXN-bridge-south'], surfaceId: 'WK-F-bridge-south' },
  { index: 2, id: 'WP-fp-02', name: '南城门内', zone: 'F', position: { x: 0, y: 2.05, z: -445 }, passes: ['CXN-gate-south'], surfaceId: 'WK-F-belt-south' },
  { index: 3, id: 'WP-fp-03', name: '礼仪广场', zone: 'B', position: { x: 0, y: 1.65, z: -300 }, passes: ['CXN-F-B-south-belt', 'CXN-B-gate-front-opening'], surfaceId: 'WK-B-plaza' },
  { index: 4, id: 'WP-fp-04', name: '主殿丹陛前', zone: 'B', position: { x: 0, y: 1.65, z: -190 }, passes: ['CXN-B-main-terrace-danbi'], surfaceId: 'WK-B-plaza' },
  { index: 5, id: 'WP-fp-05', name: '主殿台基顶', zone: 'B', position: { x: 0, y: MODULES.terraceTotalHeight + 1.65, z: -146 }, passes: ['CXN-B-main-terrace-danbi'], surfaceId: 'WK-B-terrace-tier3' },
  { index: 6, id: 'WP-fp-06', name: '金銮殿内景', zone: 'B', position: { x: 0, y: MODULES.terraceTotalHeight + 1.65, z: -110 }, passes: ['CXN-B-main-hall-door'], surfaceId: 'WK-B-hall-main-interior' },
  { index: 7, id: 'WP-fp-07', name: '内廷门', zone: 'C', position: { x: 0, y: TERRAIN.innerGateTerraceY + 1.65, z: 95 }, passes: ['CXN-B-C-inner-gate'], surfaceId: 'WK-C-ground' },
  { index: 8, id: 'WP-fp-08', name: '寝殿内景', zone: 'C', position: { x: 0, y: 4.05, z: 165 }, passes: ['CXN-C-bed-terrace-danbi', 'CXN-C-bed-hall-door'], surfaceId: 'WK-C-bed-interior' },
  { index: 9, id: 'WP-fp-09', name: '御花园', zone: 'F', position: { x: 0, y: TERRAIN.gardenPathsY + 1.65, z: 340 }, passes: ['CXN-C-F-garden-west', 'CXN-C-F-garden-east'], surfaceId: 'WK-F-garden' },
  // t74：派生走查点的 y 取**该点实际地面**（floorYAt）+ 1.65，与既有「视线高 = 面高 + 1.65m」口径一致
  ...INTERIOR_SLICE_A.fps.map((f) => ({ ...f, position: { ...f.position, y: +(floorYAt(f.position.x, f.position.z) + 1.65).toFixed(2) } })),
]);

/* ===== t70：建筑 → 内景**显式映射**（消费方不得按区名猜机位） =====
 * 既有 id 前缀不统一（`WK-B-hall-main-interior` vs `VP-B-interior`）⇒ 用**显式别名表**归一，
 * 再以 SLOT_BY_ID 校验；映射与 WK/VP/FP 的 id 逐条一致（由 layout.test.mjs 的交叉断言保证）。 */
const INTERIOR_ID_ALIAS = Object.freeze({
  B: 'B-hall-main',            // VP-B-interior → 金銮殿
  'C-bed': 'C-hall-bed-main',  // WK-C-bed-interior → 寝殿正殿
  C: 'C-hall-bed-main',        // VP-C-interior → 寝殿正殿
});
function interiorSlotIdOf(id) {
  const raw = (String(id).match(/^(?:WK|VP)-(.+?)-interior$/) ?? [])[1];
  if (!raw) return null;
  const resolved = INTERIOR_ID_ALIAS[raw] ?? raw;
  return SLOT_BY_ID[resolved] ? resolved : null;
}
export const INTERIOR_BY_SLOT = deepFreeze(Object.fromEntries(
  [...new Set([
    ...WALKABLE.filter((w) => w.kind === 'interior').map((w) => interiorSlotIdOf(w.id)),
    ...VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => interiorSlotIdOf(v.id)),
  ].filter(Boolean))].sort().map((slotId) => [
    slotId,
    {
      slotId,
      walkableId: WALKABLE.find((w) => interiorSlotIdOf(w.id) === slotId)?.id ?? null,
      viewpointId: VIEWPOINTS.find((v) => interiorSlotIdOf(v.id) === slotId)?.id ?? null,
      fpId: FP_ROUTE.find((f) => (f.buildingId === slotId) || (f.surfaceId != null && interiorSlotIdOf(f.surfaceId) === slotId))?.id ?? null,
      groundY: INTERIOR_PASSAGE_FLOOR[slotId] ?? (SLOT_BY_ID[slotId] ? zoneGroundY(SLOT_BY_ID[slotId].zone) + SLOT_BY_ID[slotId].baseY : null), // t83：含区域地坪（城门走通道口径）
      clearance: SLOT_BY_ID[slotId]?.eaveHeight ?? null,
    },
  ]),
));

/** 该建筑的内景记录（无内景返回 null） */
export function interiorFor(buildingId) {
  return INTERIOR_BY_SLOT[buildingId] ?? null;
}
/** 该建筑的内景机位对象（无则 null） */
export function interiorViewpointFor(buildingId) {
  const rec = interiorFor(buildingId);
  if (!rec?.viewpointId) return null;
  return VIEWPOINTS.find((v) => v.id === rec.viewpointId) ?? null;
}
/** 按区域列出内景（供 UI/core 批量消费） */
export function interiorsByZone(zone) {
  return Object.values(INTERIOR_BY_SLOT).filter((r) => zone == null || SLOT_BY_ID[r.slotId]?.zone === zone);
}

/* =============================================================================
 * 十三、绿化、灯位与统计
 * ========================================================================== */

export const VEGETATION = deepFreeze([
  { id: 'VEG-F-garden', zone: 'F', area: 'garden', treeCount: 64, blossomCount: 8, rngSeed: deriveSeed('F', 'garden'), densityPer1000m2: 2.4 },
  { id: 'VEG-F-berm', zone: 'F', area: 'berm', treeCount: 40, blossomCount: 0, rngSeed: deriveSeed('F', 'berm'), densityPer1000m2: 0.6 },
  { id: 'VEG-B-forecourt', zone: 'B', area: 'forecourt', treeCount: 10, blossomCount: 2, rngSeed: deriveSeed('B', 'trees'), densityPer1000m2: 0.15 },
  { id: 'VEG-C-inner', zone: 'C', area: 'innerPalace', treeCount: 14, blossomCount: 4, rngSeed: deriveSeed('C', 'trees'), densityPer1000m2: 0.35 },
  { id: 'VEG-D-west', zone: 'D', area: 'west', treeCount: 32, blossomCount: 6, rngSeed: deriveSeed('D', 'trees'), densityPer1000m2: 0.27 },
  { id: 'VEG-E-east', zone: 'E', area: 'east', treeCount: 32, blossomCount: 6, rngSeed: deriveSeed('E', 'trees'), densityPer1000m2: 0.27 },
]);

function buildLanternAnchors() {
  const out = [];
  let i = 0;
  for (let z = -390; z <= 300; z += 40) {
    for (const x of [-9, 9]) {
      i += 1;
      out.push({ id: `LA-${String(i).padStart(3, '0')}`, zone: zoneAt(x, z) ?? 'F', kind: 'lantern', position: { x, y: 0, z }, height: 3.2, role: 'axisLantern' });
    }
  }
  for (const g of [
    [-92, 340],
    [92, 340],
    [-200, 356],
    [200, 356],
    [0, 386],
    [-40, 396],
    [40, 396],
    [-106, -318],
    [-106, 188],
    [106, -320],
    [106, 200],
    [-92, 124],
    [92, 124],
  ]) {
    i += 1;
    const [x, z] = g;
    out.push({ id: `LA-${String(i).padStart(3, '0')}`, zone: zoneAt(x, z) ?? 'F', kind: 'lantern', position: { x, y: 0, z }, height: 3.2, role: 'gardenOrCourtLantern' });
  }
  return out;
}

export const LIGHT_ANCHORS = deepFreeze(buildLanternAnchors());

const countBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = item[key];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

/** 统计摘要：数量可由注册表核对，不得用廊段/拆件/重复编号虚增。 */
export const LAYOUT_STATS = deepFreeze({
  layoutVersion: LAYOUT_VERSION,
  sceneSeed: SCENE_SEED,
  envelope: ENVELOPE,
  outerBounds: OUTER_BOUNDS,
  wallOuterOverhang: WALL_OUTER_OVERHANG,
  slotCount: SLOTS.length,
  slotsByZone: countBy(SLOTS, 'zone'),
  slotsByKind: countBy(SLOTS, 'kind'),
  visitableCount: SLOTS.filter((s) => s.visitable).length,
  visitableSlots: SLOTS.filter((s) => s.visitable).map((s) => s.id),
  courtyardCount: COURTYARDS.length,
  courtyardsByArea: countBy(COURTYARDS, 'area'),
  connectorCount: CONNECTORS.length,
  connectorsByKind: countBy(CONNECTORS, 'kind'),
  roadCount: ROADS.length,
  roadLength: +ROADS.reduce((sum, r) => sum + r.length, 0).toFixed(1),
  wallSegmentCount: WALLS.length,
  cityWallSegmentCount: WALLS.filter((w) => w.cityWall).length,
  courtyardWallCount: WALLS.filter((w) => w.kind === 'courtWall').length,
  corridorCount: CORRIDORS.length,
  walkableCount: WALKABLE.length,
  obstacleCount: OBSTACLES.length,
  waterBodyCount: WATER_BODIES.length,
  viewpointCount: VIEWPOINTS.length,
  tourPointCount: TOUR_POINTS.length,
  fpRouteCount: FP_ROUTE.length,
  lanternCount: LIGHT_ANCHORS.length,
  drawCallBudget: Object.freeze(
    ZONES.reduce((acc, z) => {
      acc[z.id] = z.drawCallBudget;
      return acc;
    }, {}),
  ),
});

export default deepFreeze({
  LAYOUT_VERSION,
  ENVELOPE,
  CENTRAL_X,
  FORECOURT_Z,
  INNER_PALACE_Z,
  GARDEN_Z,
  WALL_OUTER_OVERHANG,
  OUTER_BOUNDS,
  TERRAIN_EXTENT,
  CITY_WALL,
  MOAT,
  BRIDGES,
  ZONES,
  SLOTS,
  SLOT_BY_ID,
  COURTYARDS,
  CONNECTORS,
  ROADS,
  TERRACES,
  WALKABLE,
  OBSTACLES,
  WATER_BODIES,
  SCENIC_OBJECTS,
  CORRIDORS,
  WALLS,
  VIEWPOINTS,
  TOUR_POINTS,
  FP_ROUTE,
  VEGETATION,
  LIGHT_ANCHORS,
  LAYOUT_STATS,
  INTERIOR_BY_SLOT,
  DOOR_SILL_EXCEPTIONS,
  interiorFor,
  interiorViewpointFor,
  interiorsByZone,
});
