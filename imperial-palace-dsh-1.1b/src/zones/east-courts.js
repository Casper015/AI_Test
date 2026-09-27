/**
 * E 区 · 东侧宫苑（计划 §5.4 / CONTRACTS §3 / STYLE_GUIDE §3–§5）
 * =============================================================================
 * 四组可识别院落，各含院门、主屋（正殿/正堂）、配房与连接步道：
 *   CY-E-court1 文华院（文华殿 + 南厢 + 院门）、CY-E-court2 陈设院（陈设正堂 + 北房 + 院门）、
 *   CY-E-court3 生活院（生活主屋 + 南房 + 东耳房 + 院门 + **水池与水榭**）、
 *   CY-E-court4 东后院（东后殿 + 南厢 + 院门 + 角亭）。
 * 布局分配给 E 的 **15 个槽位**全部落地（id 与 `layout.SLOTS` 逐一对应，不新增、不扩张边界）。
 * 院落内墙（16 段）、院内道路与步道、水池石岸、树木与灯位均由本区负责；外宫墙 / 城门 / 护城河 /
 * 桥与外水系归 F，本区不实现、不越界（仅按 layout 的道路段把铺装铺到 `x=291` / `z=290` 的路端）。
 *
 * 与西侧 D 的统一与差异（计划 §5.4）：
 *   · 统一：同一套 kit 构件 + config 令牌（模数/色板/屋顶等级白名单由 kit 强校验），
 *     主屋 grade 2 歇山、配房 grade 1 硬山、亭 grade 1 攒尖——与 D 完全同源（layout 冻结同一批参数）；
 *   · 差异（本区主动设计的"装饰语言"，不是体量镜像）：E 以**水景生活院**为主题——
 *     生活院中央 64m×52m 水池（`WB-E-pond`）+ 池上水榭 + 石岸 + 池畔香炉，
 *     两处院门加**影壁**（照壁）形成"进门见屏"的东侧宫苑动线，
 *     南北主道（`RD-E-ring-road`）+ 四院院前路构成"一轴四院"的联系，
 *     32 株乔（含 6 株花树）沿院墙内侧成列、8 座宫灯（含院门与池畔）。
 *     体量（开间/进深/等级）来自 layout 冻结数据，因此与 D 的"镜像"关系只在体量层面；
 *     本区的装饰、水景与植被布置为 E 专属，D 区由 t10 独立设计，两区装饰不共用一份脚本。
 *   · 主题名称（文华/陈设/生活/东后）仅作展示设定，不作史实断言。
 *
 * 竖直定位：E 区地坪 `TERRAIN.sideCourtY = 0.4`（`WK-E-ground.y`、`VP-E-fp-spawn.y = 2.05 = 0.4 + 1.65`），
 * 而 `SLOTS.baseY` 是相对区域基准 0 的估值 → 与 C 区同样抬到地坪上：`baseY(kit) = 0.4 + 槽位 terraceH`。
 * 自检见 `tests/zone-east.test.mjs`（11/15 栋 `|kit 檐口 −(layout 估值 + 0.4)| ≤ 6mm`，其余为无台基亭）。
 *
 * 成批策略：构件单档（`lod:'mid'`，不逐栋三档 LOD —— 理由与实测对照见 `docs/handoff-east-courts.md` §2.6），
 * 末端一次 `kit.mergeZone(root)`。E 区分区预算 40，实测 39（明细见回执）。
 *
 * 契约来源：docs/CONTRACTS.md §3（返回值/ctx）、§4（建筑字段）、§5（机位）、§6（碰撞）、§8.3（灯位）。
 */

import { CONFIG, deriveSeed } from '../shared/config.js';
import { CLIMB_TOWERS, STONE_STEP_LANES, dressingPlanForZone, towerDressingAnchors } from '../shared/layout.js';
import { rampsFromRoads } from '../core/layout-slice.js';

export const ZONE_ID = 'E';
export const ZONE_VERSION = '1.0.0';
export const ZONE_KIND = 'eastCourts';

/**
 * 屋身形制：**直接使用槽位 kind**（`hall` / `sideHall` / `courtyardGate` / `pavilion`）。
 * kit 在 t22 之后把"门洞 / 屋顶形制 / 窗 / 门扇开合"解耦（src/kit/geometry.js buildBody 注释）：
 * 正立面门洞只由 `door`（或 `doorOpening/openFront`）决定，因此 `courtyardGate` 也会按
 * `layout.OBSTACLES` 登记的 `door.width` 留出真实门洞——本区不再需要任何分支替换或开启比覆盖。
 */

/** 主体构件细节档：E 区 15 栋全部 `mid`（实测：任何一栋取 mid 都会引入同一套部件桶，
 *  其余栋取 mid 不再增加绘制批次，只增加三角面 ~6k/15 栋，远低于 150 万预算）。 */
const BUILDING_DETAIL = 'mid';

/** t63：可布内景的构件类型（`kit.interiorSet` 的四档之一；亭/院门不在内景注册表里）。 */
const INTERIOR_KIND_OF = Object.freeze({ hall: 'hall', sideHall: 'sideHall', gateHall: 'gateHall', cornerTower: 'cornerTower' });
/** t63：内景家具只在"人在室内 / 门口近景"时可见 —— 把 kit 返回的三档 LOD 档距整体收缩
 *  （kit 的 far 档刻意留空），于是数十米之外（分区视角 150m+、全城 oblique 1000m+）切到空远景档、
 *  0 新增绘制调用；而 `VP-<slotId>-interior` 机位（≤20m）仍取 near 全细节档。
 *  收缩系数写在常量里，属 §8.2 的 LOD 优化手段（未删任何构件）。 */
const INTERIOR_LOD_DISTANCE_SCALE = 0.4;

function tightenInteriorLod(object) {
  if (!object?.isLOD || !Array.isArray(object.levels)) return object;
  for (const level of object.levels) {
    if (typeof level.distance === 'number') level.distance = round(level.distance * INTERIOR_LOD_DISTANCE_SCALE);
  }
  if (object.userData?.kit) {
    object.userData.kit.distances = object.levels.map((l) => l.distance);
    object.userData.kit.interiorLodScaled = INTERIOR_LOD_DISTANCE_SCALE;
  }
  return object;
}


/** 铺装厚度 / 水池水片厚度（kit.water 的水片固定 6cm 厚，故底面标高 = 水面 − 该值）。 */
const SCREEN_WALL_COURTS = Object.freeze(['CY-E-court2', 'CY-E-court3']);

const round = (v) => Math.round(v * 1000) / 1000;

function pointToSegmentDistance(x, z, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(x - from.x, z - from.z);
  let t = ((x - from.x) * dx + (z - from.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t));
}

function insideRect(bounds, x, z, margin = 0) {
  return x >= bounds.minX - margin && x <= bounds.maxX + margin && z >= bounds.minZ - margin && z <= bounds.maxZ + margin;
}

/** 沿墙轴向的实心段（门洞之间），绝对世界坐标；供碰撞盒使用。 */
function wallSolidSpans(wall) {
  const horizontal = wall.axis === 'x';
  const lo = horizontal ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z);
  const hi = horizontal ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z);
  const gaps = (wall.openings ?? [])
    .map((o) => [o.at - o.width / 2, o.at + o.width / 2])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = lo;
  for (const [a, b] of gaps) {
    const start = Math.max(lo, a);
    if (start > cursor + 0.05) spans.push([round(cursor), round(start)]);
    cursor = Math.max(cursor, Math.min(hi, b));
  }
  if (hi > cursor + 0.05) spans.push([round(cursor), round(hi)]);
  return spans;
}

/**
 * 区域入口（CONTRACTS §3.1）；返回值逐字段满足 §3.3。
 * @param {object} ctx 由 `src/core/context.js` 构造
 */
export async function createZone(ctx) {
  if (!ctx || !ctx.THREE) throw new Error('east-courts: 需要 ctx.THREE（同一份 three，不得另装一份）');
  const THREE = ctx.THREE;
  const config = ctx.config ?? CONFIG;
  const zone = ctx.zoneLayout;
  if (!zone) throw new Error('east-courts: ctx.zoneLayout 缺失（由 src/core/context.js 提供）');
  const kit = ctx.kit;
  if (!kit || typeof kit.terrace !== 'function') throw new Error('east-courts: ctx.kit 缺失（CONTRACTS §3.4）');
  const helpers = zone.helpers ?? {};
  const quality = ctx.quality ?? config.QUALITY.default;

  const TERRAIN = config.TERRAIN;
  const MODULES = config.MODULES;
  const INTERACTION = config.INTERACTION;
  const PLANTS = config.PLANTS;
  const groundY = TERRAIN.sideCourtY;
  const playerHeadroom = round(INTERACTION.player.height + MODULES.stairsStepHeight);
  const pavingThickness = MODULES.plinthHeightMin;
  const waterSlabThickness = round(MODULES.stairsStepHeight * 0.4); // 0.06 = kit.water 水片厚

  const root = new THREE.Group();
  root.name = `zone-root:${ZONE_ID}`;
  root.userData.zoneId = ZONE_ID;
  root.userData.zoneVersion = ZONE_VERSION;

  const buildings = [];
  const stats = {};
  const buildingFacts = [];

  /* ---- 构件装配工具 ---- */

  /** 铺地：优先 `kit.paving`（t3 额外工厂）；灰盒替身没有该工厂时用 `kit.terrace` 薄层兜底。 */
  function slab({ id, name, x, z, w, d, y, thickness, material }) {
    if (typeof kit.paving === 'function') {
      const mesh = kit.paving({ id, name, x, z, w, d, y, thickness, material, detail: 'mid' });
      root.add(mesh);
      return mesh;
    }
    const mesh = kit.terrace({
      id,
      name,
      bounds: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 },
      x,
      y0: round(y - thickness),
      z,
      w,
      d,
      y1: y,
      railing: false,
      detail: 'mid',
    });
    root.add(mesh);
    return mesh;
  }

  /** 实体（台基/石岸/水榭基座）：统一的 kit.terrace 薄/厚层。 */
  function solid({ id, name, bounds, y0, y1 }) {
    const mesh = kit.terrace({
      id,
      name,
      bounds: { ...bounds },
      x: round((bounds.minX + bounds.maxX) / 2),
      z: round((bounds.minZ + bounds.maxZ) / 2),
      w: round(bounds.maxX - bounds.minX),
      d: round(bounds.maxZ - bounds.minZ),
      y0,
      y1,
      railing: false,
      detail: 'mid',
    });
    root.add(mesh);
    return mesh;
  }

  function countMeshes(object) {
    let n = 0;
    object.traverse((node) => {
      if (node.isMesh || node.isPoints || node.isLine) n += 1;
    });
    return n;
  }

  function countTriangles(object) {
    if (typeof kit.countTriangles === 'function') return kit.countTriangles(object);
    let tris = 0;
    object.traverse((node) => {
      if (!node.isMesh) return;
      const count = node.geometry?.index ? node.geometry.index.count : node.geometry?.attributes?.position?.count ?? 0;
      tris += Math.floor(count / 3);
    });
    return tris;
  }

  /* ========================================================================
   *  0. 读取件（优先 zoneLayout；院墙沿用 owner 兜底，水池取 zoneLayout 的水体障碍）
   * ====================================================================== */

  const slots = zone.slots ?? [];
  const courtyards = zone.courtyards ?? [];
  const roads = zone.roads ?? [];
  const corridors = zone.corridors ?? [];
  const obstaclesFromLayout = zone.obstacles ?? [];
  const vegetation = (zone.vegetation ?? [])[0] ?? null;

  // 院墙：`zoneLayout.courtyardWalls` 由 layout-slice 以 `w.zone` 过滤而 WALLS 只有 `owner` → 恒空。
  // 优先用切片，为空时按 owner 回退到同一份冻结 layout（不改共享文件，与 C 区同一处理）。
  const courtyardWalls = (zone.courtyardWalls ?? []).length > 0
    ? zone.courtyardWalls
    : ((ctx.layout ?? {}).WALLS ?? []).filter((w) => w.kind === 'courtWall' && w.owner === zone.id);

  // 水体：`zoneLayout` 不含 waterBodies，但把水体登记为障碍（`OB-WB-E-pond`，sourceType='water'），
  // 其 bounds/y0/y1 即池界与水面/池底标高 → 只用 zoneLayout 即可建造；测试再与 layout.WATER_BODIES 交叉校验。
  const waterObstacle = obstaclesFromLayout.find((o) => o.sourceType === 'water') ?? null;

  /** 本区槽位按 id 查（灯位/影壁定位用）。 */
  function slotById(id) {
    return slots.find((s) => s.id === id) ?? null;
  }

  /* ========================================================================
   *  1. 建筑（15 槽位；参数直接展开槽位对象，字段逐条回显 layout）
   * ====================================================================== */

  for (const slot of slots) {
    const baseY = round(groundY + slot.terraceH);
    const params = { ...slot, quality, lod: BUILDING_DETAIL, baseY };
    const factory = slot.kind;
    if (typeof kit[factory] !== 'function') throw new Error(`east-courts: kit.${factory} 缺失（CONTRACTS §3.4）`);
    const object = kit[factory](params);
    object.name = `building:${slot.id}`;
    root.add(object);

    const anchor = new THREE.Object3D();
    anchor.name = `building-anchor:${slot.id}`;
    anchor.position.set(slot.x, baseY, slot.z);
    anchor.userData.buildingId = slot.id;
    anchor.userData.kind = slot.kind;
    root.add(anchor);

    const record = { ...slot, anchor };
    const worldBounds = object.userData?.kit?.worldBounds ?? null;
    if (worldBounds) record.worldBounds = { ...worldBounds };
    buildings.push(record);

    const m = object.userData?.kit?.metrics ?? null;
    if (m) {
      const tris = typeof m.triangles === 'object' && m.triangles !== null ? Math.max(...Object.values(m.triangles)) : m.triangles;
      buildingFacts.push({
        id: slot.id,
        kind: slot.kind,
        bodyBranch: factory,
        detail: BUILDING_DETAIL,
        baseY,
        terraceH: slot.terraceH,
        groundLevel: round(baseY - slot.terraceH),
        eaveHeightAbsolute: m.eaveHeightAbsolute ?? null,
        roofType: m.roofType ?? slot.roofType,
        doorWidth: m.doorWidth ?? 0,
        triangles: tris ?? null,
        worldBounds: worldBounds ? { ...worldBounds } : null,
      });
    }
  }

  /* ========================================================================
   *  2. 地面与步道（水池处留洞；道路按 layout 段铺成浅色条带）
   * ====================================================================== */

  const zoneMinX = zone.bounds ? zone.bounds.minX : 100;
  const zoneMaxX = zone.bounds ? zone.bounds.maxX : 300;
  const zoneMinZ = zone.bounds ? zone.bounds.minZ : -400;
  const zoneMaxZ = zone.bounds ? zone.bounds.maxZ : 300;

  let groundPieces = 0;
  if (waterObstacle) {
    const wb = waterObstacle.bounds;
    const pieces = [
      { id: 'C', minX: zoneMinX, maxX: zoneMaxX, minZ: zoneMinZ, maxZ: wb.minZ }, // 池北整片
      { id: 'S', minX: zoneMinX, maxX: zoneMaxX, minZ: wb.maxZ, maxZ: zoneMaxZ }, // 池南整片
      { id: 'W', minX: zoneMinX, maxX: wb.minX, minZ: wb.minZ, maxZ: wb.maxZ }, // 池西
      { id: 'E', minX: wb.maxX, maxX: zoneMaxX, minZ: wb.minZ, maxZ: wb.maxZ }, // 池东
    ];
    for (const piece of pieces) {
      if (piece.maxX - piece.minX < 0.01 || piece.maxZ - piece.minZ < 0.01) continue;
      slab({
        id: `E-ground-${piece.id}`,
        name: '东宫苑地面',
        x: round((piece.minX + piece.maxX) / 2),
        z: round((piece.minZ + piece.maxZ) / 2),
        w: round(piece.maxX - piece.minX),
        d: round(piece.maxZ - piece.minZ),
        y: groundY,
        thickness: pavingThickness,
        material: 'pavingStone',
      });
      groundPieces += 1;
    }
  } else {
    slab({
      id: 'E-ground',
      name: '东宫苑地面',
      x: round((zoneMinX + zoneMaxX) / 2),
      z: round((zoneMinZ + zoneMaxZ) / 2),
      w: round(zoneMaxX - zoneMinX),
      d: round(zoneMaxZ - zoneMinZ),
      y: groundY,
      thickness: pavingThickness,
      material: 'pavingStone',
    });
    groundPieces = 1;
  }
  stats.groundPieces = groundPieces;

  // 2.2 步道 / 主道：layout 的平地道路段（courtPath / paving / gardenPath）铺成同宽浅色条带
  const stripSurfaces = new Set(['courtPath', 'paving', 'gardenPath']);
  let stripCount = 0;
  for (const road of roads) {
    if (!stripSurfaces.has(road.surface)) continue;
    const horizontal = Math.abs(road.to.x - road.from.x) >= Math.abs(road.to.z - road.from.z);
    slab({
      id: `E-road-${road.id}`,
      name: road.name,
      x: round((road.from.x + road.to.x) / 2),
      z: round((road.from.z + road.to.z) / 2),
      w: horizontal ? round(Math.abs(road.to.x - road.from.x)) : road.width,
      d: horizontal ? road.width : round(Math.abs(road.to.z - road.from.z)),
      y: round(Math.max(road.from.y, road.to.y) + 0.02),
      thickness: pavingThickness,
      material: 'pavingLight',
    });
    stripCount += 1;
  }

  // 2.3 内廷侧门 → 东宫苑的缓步台阶（layout 把 RD-C-E-east-steps 归 E；上端接 C 区铺装 x=100）
  const sideStepsConnector = typeof helpers.getConnector === 'function' ? helpers.getConnector('CXN-C-E-side-east') : null;
  if (sideStepsConnector) {
    const rise = round(sideStepsConnector.elevation - (sideStepsConnector.elevationLow ?? groundY));
    const steps = kit.stairs({
      id: 'E-stairs-inner-side-gate',
      name: sideStepsConnector.name,
      x: sideStepsConnector.position.x,
      z: sideStepsConnector.position.z,
      width: sideStepsConnector.width,
      rise,
      baseY: sideStepsConnector.elevationLow ?? groundY, // 台阶自下端起算，上端 = C 区地坪
      rotationYDeg: config.ORIENTATION.rotationYDeg.east, // 正面朝东 → 台阶向 +X 下降（进东宫苑）
      imperialRamp: false, // 侧门踏道，不是丹陛
      detail: 'mid',
    });
    root.add(steps);
    stats.sideSteps = 1;
  }
  stats.roadStrips = stripCount;

  /* ========================================================================
   *  3. 院落内墙（16 段，layout.WALLS.kind='courtWall', owner='E'）+ 影壁
   * ====================================================================== */

  const wallObstacles = [];
  const wallOpenings = [];
  for (const wall of courtyardWalls) {
    const horizontal = wall.axis === 'x';
    const mid = horizontal ? (wall.from.x + wall.to.x) / 2 : (wall.from.z + wall.to.z) / 2;
    const openings = (wall.openings ?? []).map((o) => {
      const atX = horizontal ? o.at : wall.from.x;
      const atZ = horizontal ? wall.from.z : o.at;
      const localFloor = (typeof helpers.floorYAt === 'function' ? helpers.floorYAt(atX, atZ) : null) ?? groundY;
      const needed = round(localFloor + playerHeadroom - groundY);
      const height = Math.min(wall.height, Math.max(round(wall.height * 0.62), needed));
      wallOpenings.push({ wallId: wall.id, axis: wall.axis, position: { x: atX, z: atZ }, width: o.width, height, floorY: localFloor, neededHeight: needed });
      return { at: round(o.at - mid), width: o.width, height };
    });
    const mesh = kit.wall({
      id: wall.id,
      name: wall.name,
      from: { ...wall.from },
      to: { ...wall.to },
      thickness: wall.thickness,
      height: wall.height,
      baseY: groundY,
      openings,
      detail: 'far', // kit.wall 仅"压顶脊线"按 detail 分支；省下的批次留给分区预算
    });
    root.add(mesh);

    // 院墙实心段碰撞（layout.OBSTACLES 未登记院墙；院墙是 E 自己负责的实体边界）
    for (const [i, [a, b]] of wallSolidSpans(wall).entries()) {
      wallObstacles.push({
        id: `OB-${wall.id}-span${i + 1}`,
        sourceType: 'wall',
        zone: ZONE_ID,
        buildingId: wall.id,
        bounds: horizontal
          ? { minX: a, maxX: b, minZ: round(wall.from.z - wall.thickness / 2), maxZ: round(wall.from.z + wall.thickness / 2) }
          : { minX: round(wall.from.x - wall.thickness / 2), maxX: round(wall.from.x + wall.thickness / 2), minZ: a, maxZ: b },
        y0: groundY,
        y1: round(groundY + wall.height),
        blocks: 'all',
        door: null,
        note: `院墙实心段（${wall.name}）；门洞见 layout.WALLS.${wall.id}.openings`,
      });
    }
  }
  stats.courtyardWalls = courtyardWalls.length;

  // 3.2 影壁（照壁）：两处院门内侧的屏壁，是 E 区"进门见屏"的东侧宫苑动线（与 D 区装饰相区分）
  const screenWalls = [];
  for (const courtId of SCREEN_WALL_COURTS) {
    const courtyard = courtyards.find((c) => c.id === courtId);
    if (!courtyard) continue;
    const gate = (courtyard.gates ?? []).map((id) => slotById(id)).find(Boolean);
    if (!gate) continue;
    // 影壁立在院门**内侧**（门东侧一个台明宽处），面宽覆盖门洞
    const x = round(gate.x + gate.w / 2 + MODULES.plinthWidth);
    const half = round(MODULES.bayPitch * 1.6);
    const wall = kit.wall({
      id: `E-screenwall-${courtId}`,
      name: `${courtyard.name}影壁`,
      from: { x, z: round(gate.z - half) },
      to: { x, z: round(gate.z + half) },
      thickness: MODULES.courtyardWallThickness,
      height: MODULES.courtyardWallHeight,
      baseY: groundY,
      detail: 'far',
    });
    root.add(wall);
    screenWalls.push({ id: `E-screenwall-${courtId}`, x, z: gate.z, half, court: courtId, gate: gate.id });
    wallObstacles.push({
      id: `OB-E-screenwall-${courtId}-span1`,
      sourceType: 'wall',
      zone: ZONE_ID,
      buildingId: `E-screenwall-${courtId}`,
      bounds: {
        minX: round(x - MODULES.courtyardWallThickness / 2),
        maxX: round(x + MODULES.courtyardWallThickness / 2),
        minZ: round(gate.z - half),
        maxZ: round(gate.z + half),
      },
      y0: groundY,
      y1: round(groundY + MODULES.courtyardWallHeight),
      blocks: 'all',
      door: null,
      note: '院门内侧影壁（照壁）：正面阻挡，绕行入院',
    });
  }
  stats.screenWalls = screenWalls.length;
  stats.wallObstacles = wallObstacles.length;

  /* ========================================================================
   *  4. 廊庑（4 段 CR-E-*，四院围合）
   * ====================================================================== */

  for (const corridor of corridors) {
    const mesh = kit.corridor({
      id: corridor.id,
      name: corridor.name,
      from: { ...corridor.from },
      to: { ...corridor.to },
      width: corridor.width,
      floors: corridor.floors,
      baseY: groundY,
      grade: 1,
      detail: 'mid',
    });
    root.add(mesh);
  }
  stats.corridors = corridors.length;

  /* ========================================================================
   *  5. 水池（WB-E-pond：水片 + 石岸 + 水榭基座）
   * ====================================================================== */

  const pondSummary = {};
  if (waterObstacle) {
    const wb = waterObstacle.bounds;
    const waterY = waterObstacle.y1;
    const pondBottom = waterObstacle.y0;
    const centerX = round((wb.minX + wb.maxX) / 2);
    const centerZ = round((wb.minZ + wb.maxZ) / 2);
    const pondW = round(wb.maxX - wb.minX);
    const pondD = round(wb.maxZ - wb.minZ);
    // 水片：优先 kit.water（t3 的水体工厂，y 参数是水片底面）；替身没有该工厂时用 kit.paving + waterSurface 材质。
    // 两者都设 userData.waterSurface = true 并压入 ctx.shared.water —— 环境系统统一做微波（本区不自建第二套水面动画）。
    const waterMesh = typeof kit.water === 'function'
      ? kit.water({ id: 'E-pond-water', name: '生活院水池', x: centerX, z: centerZ, w: pondW, d: pondD, y: round(waterY - waterSlabThickness), detail: 'mid' })
      : slab({ id: 'E-pond-water', name: '生活院水池', x: centerX, z: centerZ, w: pondW, d: pondD, y: waterY, thickness: waterSlabThickness, material: 'waterSurface' });
    root.add(waterMesh);
    waterMesh.userData.waterSurface = true;
    waterMesh.name = waterMesh.name || 'E-pond-water';
    if (Array.isArray(ctx.shared?.water)) ctx.shared.water.push(waterMesh);
    // 石岸：池界内侧一圈白石压边（顶 = 东宫苑地坪，侧面落到水面）
    const rimW = MODULES.plinthWidth + MODULES.courtyardWallThickness;
    for (const [i, rim] of [
      { minX: wb.minX, maxX: round(wb.minX + rimW), minZ: wb.minZ, maxZ: wb.maxZ },
      { minX: round(wb.maxX - rimW), maxX: wb.maxX, minZ: wb.minZ, maxZ: wb.maxZ },
      { minX: wb.minX, maxX: wb.maxX, minZ: wb.minZ, maxZ: round(wb.minZ + rimW) },
      { minX: wb.minX, maxX: wb.maxX, minZ: round(wb.maxZ - rimW), maxZ: wb.maxZ },
    ].entries()) {
      solid({ id: `E-pond-rim-${i + 1}`, name: '水池石岸', bounds: rim, y0: waterY, y1: groundY });
    }
    // 水榭基座：把亭子立于水面上（亭自带台明在 地面~地面+terraceH，基座补 水面~地面 一段）
    const pavilion = buildings.find((b) => b.id === 'E-court3-pavilion') ?? null;
    if (pavilion) {
      const expand = MODULES.plinthWidth;
      solid({
        id: 'E-pond-pavilion-base',
        name: '水榭基座',
        bounds: {
          minX: round(pavilion.bounds.minX - expand),
          maxX: round(pavilion.bounds.maxX + expand),
          minZ: round(pavilion.bounds.minZ - expand),
          maxZ: round(pavilion.bounds.maxZ + expand),
        },
        y0: waterY,
        y1: groundY,
      });
      pondSummary.pavilionBase = 'E-pond-pavilion-base';
    }
    /* t13：两级汀步石（**同轮建可见石件**；与 `layout.STONE_STEP_LANES` 逐值同源）。
       石件自水面（`waterY`）直落石顶（0.65 / 0.90）⇒ 视觉上就是"水下石墩 + 出水两级踏步"，
       与 D 池的汀步石、与四座入城桥用同一种 `kit.terrace` 实体，不新增材质/不新增 kind。
       注：石件是**视觉**——通行性由 `WALKABLE` 的登记面（本卡在 layout 里新增 4 面）表达，
       与 kit/区域不写通行性的既有纪律一致（kit.test 22.6）。 */
    const stepLane = (STONE_STEP_LANES ?? []).find((l) => l.id === 'E-court3-pavilion') ?? null;
    if (!stepLane) throw new Error('east-courts: layout.STONE_STEP_LANES 缺 E-court3-pavilion（汀步走廊未登记，视觉石件无处可依）');
    const stepStones = [];
    for (const step of (stepLane?.steps ?? [])) {
      const stone = solid({
        id: `${step.id}-visible`,
        name: step.name,
        bounds: { minX: stepLane.corridor.minX, maxX: stepLane.corridor.maxX, minZ: step.minZ, maxZ: step.maxZ },
        y0: round(waterY),
        y1: step.y,
      });
      const box = new THREE.Box3().setFromObject(stone);
      stepStones.push({
        id: step.id,
        node: `${step.id}-visible`,
        bounds: { minX: round(box.min.x), maxX: round(box.max.x), minY: round(box.min.y), maxY: round(box.max.y), minZ: round(box.min.z), maxZ: round(box.max.z) },
      });
    }
    pondSummary.stepStones = stepStones;
    pondSummary.corridor = stepLane ? { ...stepLane.corridor } : null;
    pondSummary.id = waterObstacle.buildingId;
    pondSummary.bounds = { ...wb };
    pondSummary.waterY = waterY;
    pondSummary.bottomY = pondBottom;
    pondSummary.waterMesh = 'E-pond-water';
  }
  stats.pond = pondSummary;

  /* ========================================================================
   *  6. 绿化（layout.VEGETATION：32 株 / 花树 6 株，种子固定可复现）
   * ====================================================================== */

  const trees = [];
  if (vegetation && typeof kit.tree === 'function') {
    const rng = typeof ctx.rng?.fork === 'function' ? ctx.rng.fork('trees') : null;
    const clearance = round(MODULES.plinthWidth * 1.5);
    const blocked = (x, z) => {
      for (const slot of slots) if (insideRect(slot.bounds, x, z, clearance)) return true;
      if (waterObstacle && insideRect(waterObstacle.bounds, x, z, clearance)) return true;
      for (const road of roads) {
        if (pointToSegmentDistance(x, z, road.from, road.to) < road.width / 2 + clearance) return true;
      }
      for (const corridor of corridors) {
        if (pointToSegmentDistance(x, z, corridor.from, corridor.to) < corridor.width / 2 + clearance) return true;
      }
      for (const wall of courtyardWalls) {
        if (pointToSegmentDistance(x, z, wall.from, wall.to) < wall.thickness / 2 + clearance) return true;
      }
      for (const screen of screenWalls) {
        if (Math.abs(x - screen.x) < clearance + MODULES.courtyardWallThickness && Math.abs(z - screen.z) < screen.half + clearance) return true;
      }
      return false;
    };
    const count = vegetation.treeCount ?? PLANTS.densityPerCourt;
    const blossoms = Math.min(vegetation.blossomCount ?? 0, count);
    const sizes = Object.keys(PLANTS.treeHeights);
    let guard = 0;
    while (rng && trees.length < count && guard < 12000) {
      guard += 1;
      const cy = courtyards[trees.length % Math.max(1, courtyards.length)];
      if (!cy) break;
      const b = cy.bounds;
      const x = rng.range(b.minX + 8, b.maxX - 8);
      const z = rng.range(b.minZ + 8, b.maxZ - 8);
      if (blocked(x, z)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < MODULES.bayPitch * 1.2)) continue;
      trees.push({ x: round(x), z: round(z) });
    }
    // 逐株的确定性规格（尺寸/朝向/花树）——实例化时用等比缩放表达"乔木尺度 5.5/9/13.5m"（树几何对高度线性相似）
    for (const [i, spot] of trees.entries()) {
      const size = rng ? rng.pick(sizes) : sizes[0];
      spot.size = size;
      spot.blossom = i < blossoms;
      spot.yaw = round(rng ? rng.range(0, Math.PI * 2) : 0);
    }
  }

  /* ---- 树群用 kit.instance 实例化（队长口径：重复构件用实例化；3 次调用覆盖 32 株） ---- */
  const treeInstances = [];
  const templateGeometries = [];
  if (trees.length > 0) {
    const sizeKeys = Object.keys(PLANTS.treeHeights);
    const baseSize = sizeKeys.includes('medium') ? 'medium' : sizeKeys[0];
    const baseHeight = PLANTS.treeHeights[baseSize];
    const foliageShape = PLANTS.canopyShapes[1] ?? PLANTS.canopyShapes[0];
    const blossomShape = PLANTS.canopyShapes[2] ?? PLANTS.canopyShapes[0];
    const canInstance = typeof kit.instance === 'function' && kit.__fallback !== true;
    if (!canInstance) {
      // 灰盒替身的 instance 不支持逐实例矩阵 → 退回逐株建造（仅测试替身路径；真 kit 永远走实例化）
      for (const spot of trees) {
        const mesh = kit.tree({
          id: `E-tree-${spot.x}-${spot.z}`,
          x: spot.x,
          z: spot.z,
          y: groundY,
          height: PLANTS.treeHeights[spot.size],
          size: spot.size,
          canopyShape: spot.blossom ? blossomShape : foliageShape,
          blossom: spot.blossom,
          detail: 'mid',
        });
        root.add(mesh);
      }
      stats.treeBuild = 'per-tree(fallback kit)';
    } else {
      const makeTemplate = (blossom) => {
        const tpl = kit.tree({
          id: `E-tree-template-${blossom ? 'blossom' : 'leaf'}`,
          x: 0,
          z: 0,
          y: 0,
          height: baseHeight,
          size: baseSize,
          canopyShape: blossom ? blossomShape : foliageShape,
          blossom,
          detail: 'mid',
        });
        tpl.traverse((node) => {
          if (node.isMesh && node.geometry?.userData?.kitOwned === true) templateGeometries.push(node.geometry);
        });
        return tpl;
      };
      const leafTemplate = makeTemplate(false);
      const blossomTemplate = trees.some((t) => t.blossom) ? makeTemplate(true) : null;
      const pick = (tpl, part) => {
        let found = null;
        tpl?.traverse((node) => {
          if (!found && node.isMesh && node.userData?.part === part) found = node;
        });
        return found;
      };
      const trunkMesh = pick(leafTemplate, 'trunk');
      const leafCanopyMesh = pick(leafTemplate, 'canopy');
      const blossomCanopyMesh = blossomTemplate ? pick(blossomTemplate, 'canopy') : null;
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const euler = new THREE.Euler();
      const scale = new THREE.Vector3();
      const composeAt = (m, spot) => {
        const s = round(PLANTS.treeHeights[spot.size] / baseHeight);
        euler.set(0, spot.yaw, 0);
        quaternion.setFromEuler(euler);
        position.set(spot.x, groundY, spot.z);
        scale.set(s, s, s);
        m.compose(position, quaternion, scale);
        return m;
      };
      const addInstances = (mesh, spots, name) => {
        if (!mesh || spots.length === 0) return;
        const instanced = kit.instance(mesh, spots.length, (i, m) => composeAt(m, spots[i]), { name });
        instanced.name = name;
        instanced.userData.part = mesh.userData?.part ?? 'tree'; // 与逐株路径同名的部位标记（诊断/统计用）
        instanced.userData.instancedFrom = mesh.name ?? name;
        instanced.castShadow = true;
        instanced.receiveShadow = true;
        root.add(instanced);
        treeInstances.push({ name, count: spots.length, part: instanced.userData.part });
      };
      addInstances(trunkMesh, trees, 'E-trees-trunk');
      addInstances(leafCanopyMesh, trees.filter((t) => !t.blossom), 'E-trees-canopy-leaf');
      addInstances(blossomCanopyMesh, trees.filter((t) => t.blossom), 'E-trees-canopy-blossom');
      stats.treeBuild = 'instanced(kit.instance)';
    }
  }
  stats.treeInstances = treeInstances;
  stats.trees = trees.length;
  stats.blossomTrees = trees.filter((t) => t.blossom).length;

  /* ========================================================================
   *  6b. 内景（t63）：对 layout 注册了内景的每一栋布 kit.interiorSet
   *      —— 尺寸/地坪只取自布局登记的室内可行走面（`WK-<slotId>-interior`，含别名映射）；
   *      —— 天花由本区补一层（kit 屋面单面朝外，室内抬头会看见天空）；
   *      —— 每栋登记 2 条室内灯位 + 2 座灯体（环境系统按距离激活，夜景内景可读性所需）。
   * ====================================================================== */

  const interiors = [];
  const interiorLights = [];
  const interiorRecordFor = (slotId) => {
    const slice = (zone.interiors ?? []).find((r) => r.slotId === slotId);
    if (slice) return slice;
    return typeof ctx.layout?.interiorFor === 'function' ? ctx.layout.interiorFor(slotId) : null;
  };
  for (const slot of slots) {
    const record = interiorRecordFor(slot.id);
    if (!record) continue; // 布局未注册内景（亭 / 水榭 / 院门）→ 本卡排除
    const surface = (zone.walkable ?? []).find((w) => w.id === record.walkableId) ?? null;
    if (!surface) continue;
    const interiorKind = INTERIOR_KIND_OF[slot.kind] ?? null;
    if (!interiorKind || typeof kit.interiorSet !== 'function') continue;
    const groundY = surface.y;
    const fact = buildingFacts.find((f) => f.id === slot.id) ?? null;
    const eaveY = fact?.eaveHeightAbsolute
      ?? round(slot.baseY + MODULES.eaveHeight * config.GRADES[slot.grade].eaveHeightFactor);
    const ceilingY = round(eaveY - MODULES.eaveSoffitDepth);
    const bounds = { ...surface.bounds };
    const set = kit.interiorSet({
      id: `${slot.id}-interior`,
      kind: interiorKind,
      grade: slot.grade,
      bounds,
      groundY,
      ceilingY,
      entrance: { ...slot.entrance },
      seed: deriveSeed(`${ZONE_ID}:${slot.id}`, 'interior'),
    });
    tightenInteriorLod(set);
    root.add(set);

    const margin = MODULES.courtyardWallThickness;
    slab({
      id: `${slot.id}-interior-ceiling`,
      name: `${slot.name}天花`,
      x: round((bounds.minX + bounds.maxX) / 2),
      z: round((bounds.minZ + bounds.maxZ) / 2),
      w: round(bounds.maxX - bounds.minX + margin * 2),
      d: round(bounds.maxZ - bounds.minZ + margin * 2),
      y: ceilingY,
      thickness: round(MODULES.roofThickness * 0.5),
      material: 'pavingLight',
    });

    const cx = round((bounds.minX + bounds.maxX) / 2);
    const cz = round((bounds.minZ + bounds.maxZ) / 2);
    const dx = round((bounds.maxX - bounds.minX) * 0.28);
    // t92：灯位数量**保持 2 条/栋**。曾按面积分档给窄小院房只放 1 条（措施②），但 A/B 实测证明
    // 它会把环境系统的光强集中到房间中点、night 截断反而更高（C-annex-west 5.78%→6.11%、
    // C-annex-east 6.23%→8.23%），故**撤回**；剩余 dusk/night 超标按"灯池/强度令牌"量化交回（回执 §B.7）。
    for (const [i, offset] of [-dx, dx].entries()) {
      const lamp = {
        id: `LA-${ZONE_ID}-${slot.id}-${String(i + 1).padStart(2, '0')}`,
        zone: ZONE_ID,
        kind: 'lantern',
        position: { x: round(cx + offset), y: groundY, z: cz },
        height: 3.2,
        role: 'interiorLantern',
        buildingId: slot.id,
      };
      interiorLights.push(lamp);
      // t63 最小修法：不再额外加灯体（lampGlow 自发光体是 §12 高光截断的主要来源之一）。
    }

    const im = set.userData?.kit?.metrics ?? null;
    interiors.push({
      slotId: slot.id,
      kind: interiorKind,
      grade: slot.grade,
      walkableId: surface.id,
      groundY,
      ceilingY,
      eaveHeightAbsolute: eaveY,
      bounds,
      items: Array.isArray(im?.items) ? [...im.items] : [],
      triangles: im?.triangles ?? null,
      worldBounds: im?.worldBounds ?? null,
      lodDistances: set.userData?.kit?.distances ?? im?.lodDistances ?? [],
    });
  }
  stats.interiors = interiors;
  stats.interiorCount = interiors.length;
  stats.interiorLights = interiorLights.length;
  /* ========================================================================
   *  7. 灯位与灯体（layout.LIGHT_ANCHORS 的 E 区条目 + 院门/池畔 6 座）
   * ====================================================================== */

  const lightAnchors = (zone.lightAnchors ?? []).map((a) => ({ ...a, position: { ...a.position } }));
  // 各内景登记的室内灯位（每栋 2 条，t63）——一并交给环境系统按距离激活
  lightAnchors.push(...interiorLights);
  const extraLampSpots = [];
  for (const courtyard of courtyards) {
    const gate = (courtyard.gates ?? []).map((id) => slotById(id)).find(Boolean);
    if (!gate) continue;
    extraLampSpots.push({ x: round(gate.x - MODULES.bayPitch), z: gate.z, role: 'courtGateLantern', court: courtyard.id });
  }
  if (waterObstacle) {
    const wb = waterObstacle.bounds;
    for (const z of [round((wb.minZ + wb.maxZ) / 2 - MODULES.bayPitch * 1.5), round((wb.minZ + wb.maxZ) / 2 + MODULES.bayPitch * 1.5)]) {
      extraLampSpots.push({ x: round(wb.minX - MODULES.bayPitch), z, role: 'pondLantern', court: 'CY-E-court3' });
    }
  }
  for (const [i, spot] of extraLampSpots.entries()) {
    lightAnchors.push({
      id: `LA-E-extra-${String(i + 1).padStart(2, '0')}`,
      zone: ZONE_ID,
      kind: 'lantern',
      position: { x: spot.x, y: groundY, z: spot.z },
      height: 3.2,
      role: spot.role,
    });
  }
  if (typeof kit.lantern === 'function') {
    for (const anchor of lightAnchors) {
      // 灯体立在灯位处的实际地坪上（layout 锚点 y=0 是"区域基准"，东宫苑地坪为 0.4）
      const surfaceY = typeof helpers.floorYAt === 'function' ? helpers.floorYAt(anchor.position.x, anchor.position.z) : null;
      const mesh = kit.lantern({
        id: `E-lamp-${anchor.id}`,
        x: anchor.position.x,
        y: surfaceY ?? groundY,
        z: anchor.position.z,
        height: anchor.height,
        kind: 'post',
        detail: 'far', // 灯座/灯杆/灯身三件；灯罩/灯珠/灯架三个批次留给水池与院门
      });
      root.add(mesh);
    }
  }
  stats.lanternMeshes = lightAnchors.length;

  /* ========================================================================
   *  8. 陈设摆件（铜器：四院各 1 件，位于主屋前的御路两侧）
   * ====================================================================== */

  const bronzes = [];
  if (typeof kit.bronze === 'function') {
    for (const courtyard of courtyards) {
      const hallId = slots.find((s) => s.zone === ZONE_ID && s.courtyard === courtyard.id && s.kind === 'hall')?.id ?? null;
      const hall = hallId ? buildings.find((b) => b.id === hallId) : null;
      if (!hall) continue;
      const facingWest = hall.facing === 'west';
      const frontX = facingWest ? round(hall.x - hall.w / 2 - MODULES.plinthWidth) : round(hall.x + hall.w / 2 + MODULES.plinthWidth);
      const mesh = kit.bronze({
        id: `E-bronze-${courtyard.id}`,
        kind: 'vessel',
        x: frontX,
        y: groundY,
        z: hall.z,
        detail: 'far',
      });
      root.add(mesh);
      bronzes.push({ id: `E-bronze-${courtyard.id}`, x: frontX, z: hall.z, court: courtyard.id });
    }
  }
  stats.bronzes = bronzes.length;
  stats.bronzeSpots = bronzes;

  /* ========================================================================
   *  8b. 可登塔楼（t39）：几何 = `kit.makeTower`，登记 = `layout.CLIMB_TOWERS` 派生
   * ----------------------------------------------------------------------
   * **登记与几何同轮**（禁止空气楼梯 / 幽灵面）：两者逐面核对 id 集合、kind、y、bounds，
   * 任何漂移直接抛错（区域侧不自行扩张边界、不手写面）。
   * ====================================================================== */
  const towers = [];
  const towerFacts = [];
  /* 灰盒替身（`src/zones/_greybox.js` 的 createFallbackKit）没有 `makeTower`：此时**只登记、不建几何**
     （72 面/1 障碍/1 机位仍来自 layout 派生，契约与计数一致），并在 stats 里显式留痕 —— 不得静默跳过。 */
  if (typeof kit.makeTower !== 'function') stats.towerBuildSkipped = 'kit.makeTower 缺失（灰盒替身：只登记不建几何）';
  for (const spec of (typeof kit.makeTower === 'function' ? CLIMB_TOWERS : [])) {
    const built = kit.makeTower({
      id: spec.id,
      spec: spec.spec,
      x: spec.x,
      z: spec.z,
      baseY: spec.baseY,
      zone: ZONE_ID,
      detail: BUILDING_DETAIL,
    });
    root.add(built.group);
    const registeredFaces = (zone.walkable ?? []).filter((w) => w.towerId === spec.id);
    const registeredShaft = (zone.obstacles ?? []).find((o) => o.id === `OB-${spec.id}-shaft`) ?? null;
    const registeredVp = (zone.viewpoints ?? []).find((v) => v.towerId === spec.id) ?? null;
    const drift = [];
    const key = (w) => `${w.id}|${w.kind}|${w.y}|${w.bounds.minX},${w.bounds.maxX},${w.bounds.minZ},${w.bounds.maxZ}`;
    const layoutKeys = new Set(registeredFaces.map(key));
    for (const w of built.walkable) {
      if (!registeredFaces.some((r) => r.id === w.id)) drift.push(`缺登记面 ${w.id}`);
      else {
        const r = registeredFaces.find((x) => x.id === w.id);
        if (r.kind !== w.kind || Math.abs(r.y - w.y) > 1e-6 || Math.abs(r.bounds.minX - w.bounds.minX) > 1e-6
          || Math.abs(r.bounds.maxX - w.bounds.maxX) > 1e-6 || Math.abs(r.bounds.minZ - w.bounds.minZ) > 1e-6
          || Math.abs(r.bounds.maxZ - w.bounds.maxZ) > 1e-6) {
          drift.push(`面不一致 ${w.id}：layout ${JSON.stringify(r.bounds)}@${r.y} vs kit ${JSON.stringify(w.bounds)}@${w.y}`);
        }
      }
    }
    for (const r of registeredFaces) {
      if (!built.walkable.some((w) => w.id === r.id)) drift.push(`幽灵登记面 ${r.id}`);
      if (layoutKeys.size !== new Set(built.walkable.map(key)).size) drift.push('面集合大小不一致');
    }
    const s0 = built.obstacles[0];
    if (!registeredShaft) drift.push(`缺登记障碍 OB-${spec.id}-shaft`);
    else if (Math.abs(registeredShaft.y0 - s0.y0) > 1e-6 || Math.abs(registeredShaft.y1 - s0.y1) > 1e-6
      || JSON.stringify(registeredShaft.bounds) !== JSON.stringify(s0.bounds)) {
      drift.push(`障碍不一致：layout ${JSON.stringify(registeredShaft.bounds)} y[${registeredShaft.y0},${registeredShaft.y1}] vs kit ${JSON.stringify(s0.bounds)} y[${s0.y0},${s0.y1}]`);
    }
    if (!registeredVp) drift.push(`缺登记机位 VP-${spec.id}-top`);
    else if (registeredVp.position.y !== built.viewpoints[0].position.y || registeredVp.mode !== 'focus-extra') {
      drift.push(`机位不一致：${JSON.stringify(registeredVp.position)} vs ${JSON.stringify(built.viewpoints[0].position)}`);
    }
    if (drift.length > 0) {
      throw new Error(`east-courts: 塔楼 ${spec.id} 登记与几何不一致（${drift.length} 项）：${drift.slice(0, 4).join('；')}`);
    }
    towers.push({ id: spec.id, group: built.group, plan: built.plan, metrics: built.metrics, walkable: built.walkable, obstacles: built.obstacles, viewpoints: built.viewpoints });
    towerFacts.push({
      id: spec.id,
      label: spec.label,
      x: spec.x,
      z: spec.z,
      baseY: spec.baseY,
      levels: built.plan.spec.levels,
      roofType: built.plan.roofType,
      topY: built.plan.topY,
      totalHeight: built.plan.totalHeight,
      faces: built.walkable.length,
      shaft: { y0: s0.y0, y1: s0.y1, bounds: s0.bounds },
      viewpointId: built.viewpoints[0].id,
      triangles: built.metrics.triangles,
      climb: { ok: built.plan.climb.ok, maxHop: built.plan.climb.maxHop, maxHopMeasured: built.plan.climb.maxHopMeasured, hops: built.plan.climb.hops, reverseOk: built.plan.climb.reverseOk, overlapCount: built.plan.climb.overlapCount },
      parts: built.metrics.parts,
    });
  }
  stats.towers = towers.length;
  stats.towerFaces = towers.reduce((n, t) => n + t.walkable.length, 0);
  stats.towerTriangles = towers.reduce((n, t) => n + t.metrics.triangles, 0);


  /* ========================================================================
   *  9. 整区合批（跨建筑 × 同材质同部位）——§8.2 分区预算
   * ====================================================================== */

  stats.preMergeMeshes = countMeshes(root);
  stats.preMergeTriangles = countTriangles(root);

  /* ========================================================================
   *  t44：院落陈设充实（数据表 `layout.COURTYARD_DRESSING` / `GARDEN_DRESSING`）
   *  —— 全部为**贴地装饰**：不进 `OBSTACLES`、不改 `WALKABLE`/`CONNECTORS`
   *     ⇒ 可走面数量与门洞净宽零影响；锚点由 `dressingAnchors()` 推导
   *     （院内净空 ∩ 非障碍外扩 ∩ 非门前走廊 ∩ 非中轴御道 ∩ 落点有可行走面）。
   * ====================================================================== */
  let dressingPlaced = 0;
  if (typeof kit.dressing === 'function' && typeof dressingPlanForZone === 'function') {
    for (const plan of dressingPlanForZone(ZONE_ID)) {
      for (const item of plan.items) {
        for (const [i, pt] of item.points.entries()) {
          const floorFn = ctx?.zoneLayout?.helpers?.floorYAt;
          const y = typeof floorFn === 'function' ? floorFn(pt.x, pt.z) : null;
          if (y === null || y === undefined) continue; // 锚点判据已保证有面；此处仅防御
          root.add(kit.dressing({
            id: `dressing-${plan.courtId}-${item.type}-${i + 1}`,
            type: item.type, x: pt.x, z: pt.z, y, detail: 'mid',
          }));
          dressingPlaced += 1;
        }
      }
    }
  }

  /* t44：塔上陈设（只落 T-watchtower-3 顶层观景台 deck；踏步面 1.8×0.34m ⇒ 一律不落件） */
  if (typeof kit.dressing === 'function' && typeof towerDressingAnchors === 'function') {
    for (const [i, a] of towerDressingAnchors().entries()) {
      root.add(kit.dressing({ id: `dressing-T-watchtower-3-${a.type}-${i + 1}`, type: a.type, x: a.x, z: a.z, y: a.y, detail: 'mid' }));
      dressingPlaced += 1;
    }
  }

  if (typeof kit.mergeZone === 'function') {
    const merged = kit.mergeZone(root, { name: `zone-batch:${ZONE_ID}` });
    stats.merge = merged?.stats ?? null;
  }
  stats.drawCalls = typeof kit.countDrawCalls === 'function' ? kit.countDrawCalls(root) : countMeshes(root);
  stats.triangles = countTriangles(root);
  // 分区预算以 config.BUDGET.drawCalls.perZone 为唯一数值来源（§8.2）；layout.ZONES.drawCallBudget 仅留档对比
  // （实测二者当前不一致：layout 仍为 C50/E40，config 已按配额申请升到 C60/E56 —— 见回执 §B.7 发现）
  stats.drawCallBudget = config.BUDGET.drawCalls.perZone[ZONE_ID] ?? zone.drawCallBudget;
  stats.layoutDrawCallBudget = zone.drawCallBudget ?? null;

  /* ========================================================================
   * 10. 碰撞 / 连接 / 机位（回显 layout，院墙与影壁补充实心段）
   * ====================================================================== */

  const connectors = (zone.connectors ?? []).map((c) => ({ ...c, position: { ...c.position } }));
  // 障碍回显 + 两处按"世界坐标正确阻挡"的必要修正（回执 §2.8 缺陷 6/7）：
  //   · layout 的 y0 = 槽位 baseY（按"区域基准 0"估的台基顶）；E 区地坪为 0.4，主屋台基 0.9~1.0，
  //     若原值回显，障碍盒底部会高出地面 0.5~0.6，垂直判定会放行"从建筑下方穿入" → 下钳到地坪（y1 不动）；
  //   · layout 的水体障碍盒是"水体本身"（顶面 0.05 < 地坪 0.4），无法拦人 → 池面另补一条地面高度拦阻盒。
  const layoutObstacles = obstaclesFromLayout.map((o) => ({
    ...o,
    bounds: { ...o.bounds },
    y0: Math.min(o.y0, groundY),
  }));
  if (waterObstacle) {
    /* t13：水面拦阻拆成**走廊两翼**（水池盒顶面 0.05 < 地坪 0.4，垂直判定拦不住 ⇒ 必须按脚高补拦阻盒）。
       开槽几何取 `layout.STONE_STEP_LANES`（唯一权威源），并按 `playerRadius` 让开走廊，
       否则盒边会吃掉走廊两端各 0.35m 的可走宽度（t13 实测）。覆盖不变量：水面 \ 走廊 ⊆ 拦阻盒。 */
    const lane = (STONE_STEP_LANES ?? []).find((l) => l.id === 'E-court3-pavilion') ?? null;
    const c = lane?.corridor ?? null;
    const guardY1 = round(groundY + INTERACTION.player.height + MODULES.stairsStepHeight);
    const guardBase = {
      sourceType: 'water',
      zone: ZONE_ID,
      buildingId: waterObstacle.buildingId,
      blocks: 'all',
      door: null,
      note: '水池地面高度拦阻（水体障碍盒顶面低于地坪，无法用垂直判定拦人）',
    };
    if (c) {
      const clear = INTERACTION.player.radius;
      layoutObstacles.push(
        { ...guardBase, id: 'OB-E-pond-guard-west', bounds: { minX: waterObstacle.bounds.minX, maxX: round(c.minX - clear), minZ: waterObstacle.bounds.minZ, maxZ: waterObstacle.bounds.maxZ }, y0: groundY, y1: guardY1 },
        { ...guardBase, id: 'OB-E-pond-guard-east', bounds: { minX: round(c.maxX + clear), maxX: waterObstacle.bounds.maxX, minZ: waterObstacle.bounds.minZ, maxZ: waterObstacle.bounds.maxZ }, y0: groundY, y1: guardY1 },
      );
    } else {
      layoutObstacles.push({
        ...guardBase,
        id: 'OB-E-pond-guard',
        bounds: { ...waterObstacle.bounds },
        y0: groundY,
        y1: guardY1,
      });
    }
  }
  const colliders = {
    obstacles: [...layoutObstacles, ...wallObstacles],
    walkable: (zone.walkable ?? []).map((w) => ({ ...w, bounds: { ...w.bounds } })),
    ramps: rampsFromRoads(roads).map((r) => ({ ...r })),
  };
  const viewpoints = (zone.viewpoints ?? []).map((v) => ({ ...v, position: { ...v.position }, target: { ...v.target } }));

  Object.assign(stats, {
    zone: ZONE_ID,
    zoneVersion: ZONE_VERSION,
    buildings: buildings.length,
    connectors: connectors.length,
    obstacles: colliders.obstacles.length,
    walkable: colliders.walkable.length,
    ramps: colliders.ramps.length,
    viewpoints: viewpoints.length,
    viewpointsByMode: viewpoints.reduce((acc, v) => {
      acc[v.mode] = (acc[v.mode] ?? 0) + 1;
      return acc;
    }, {}),
    lightAnchors: lightAnchors.length,
    groundY,
    buildingFacts,
    towerFacts,
    wallOpenings,
    kitSource: kit.__fallback === true ? 'fallback(greybox)' : `kit ${kit.version ?? '?'}`,
  });

  /* ========================================================================
   * 11. update / dispose
   * ====================================================================== */

  let disposed = false;
  let elapsed = 0;

  return {
    root,
    buildings,
    connectors,
    colliders,
    viewpoints,
    lightAnchors,
    /**
     * 只累计时间：水池微波、灯焰、烟雾全部由 `src/core/environment.js` 的统一系统驱动
     * （CONTRACTS §3.3 / §8.3「区域不得另建第二套灯光系统 / 第二套水面动画」）。
     */
    update(dtSeconds /* , elapsedSeconds, state */) {
      if (Number.isFinite(dtSeconds)) elapsed += dtSeconds;
    },
    /**
     * 只释放自有几何（`geometry.userData.kitOwned === true`）；共享 kit 材质/贴图归 t3 + core，
     * 绝不在此销毁。树群模板几何（未挂到 root 的实例化来源）一并释放，用 seen 集合避免重复 dispose。
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      const seen = new Set();
      root.traverse((node) => {
        if (!node.isMesh) return;
        const geometry = node.geometry;
        if (geometry?.userData?.kitOwned !== true || seen.has(geometry)) return;
        seen.add(geometry);
        geometry.dispose();
      });
      for (const geometry of templateGeometries) {
        if (!geometry || seen.has(geometry)) continue;
        seen.add(geometry);
        geometry.dispose();
      }
      root.clear();
    },
    stats,
    get elapsedSeconds() {
      return elapsed;
    },
  };
}

export default createZone;
