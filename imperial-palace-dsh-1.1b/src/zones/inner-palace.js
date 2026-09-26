/**
 * C 区 · 后宫（内廷）—— 计划 §5.3 / CONTRACTS §3 / STYLE_GUIDE §3–§5
 * =============================================================================
 * 三进内廷院落：内廷一进院（CY-C-front）、寝殿院（CY-C-main）、后寝院（CY-C-rear）。
 * 布局分配给 C 的 **12 个槽位**全部落地（内廷门、寝殿正殿、后寝殿、东西配殿、东西配房、
 * 内廷东西侧门、后院东西值房、后庭院亭），id 与 `layout.SLOTS` 逐一对应，不新增、不扩张。
 *
 * 寝殿正殿（`C-hall-bed-main`）提供**可进入内景**：金砖地面、天花藻井、床榻、屏风、铜器陈设、
 * 室内宫灯——全部来自 `ctx.kit` 构件与 `ctx.config` 令牌；登记 `VP-C-interior`
 * （落在 `WK-C-bed-interior` 的室内包围盒 `x[-27,27] z[154,182]` 内，视线高 = 面高 + 1.65）。
 *
 * 通路：南接 B（`CXN-B-C-inner-gate`）、北接 F 御花园（`CXN-C-F-garden-west/east`，后寝院北墙
 * x=±84 留 10m 门洞）、东西接侧院（`CXN-C-D-side-west` / `CXN-C-E-side-east`，一进院侧墙 z=124
 * 留门洞）、院内有寝殿台基丹陛（`CXN-C-bed-terrace-danbi` / `-north-stairs`）与寝殿门洞
 * （`CXN-C-bed-hall-door`）。全部连接按 layout 的 id / position / width / elevation 回显，单一 owner。
 *
 * 竖直定位（本区唯一的自主决策，依据见回执 §2.3）：
 *   layout 的 `WALKABLE` / `VIEWPOINTS` 以后宫地坪 `TERRAIN.innerPalaceY = 0.9` 为准
 *   （`VP-C-fp-spawn.y = 0.9 + 1.65`、`WK-C-bed-interior.y = 2.4`），而 `SLOTS.baseY` 是**相对区域基准 0
 *   的估值**，两者相差正好 0.9。因此本区把建筑抬到后宫地坪上：`baseY(kit) = 地坪 + 槽位 terraceH`。
 *   两个例外都由 layout 自身数据推出，不写死数值：
 *     · `C-hall-bed-main`：槽位的 1.5m 台基**就是** `layout.TERRACES.TR-C-bed`（同高、跨度更大），
 *       kit 不再重复造台明（terraceH 传 0），建筑立于平台顶 = `WK-C-bed-interior.y`；
 *     · `C-gate-inner`：其 `terraceH = innerGateTerraceY = 0.9` 本身就是 B(0) → C(0.9) 的高差，
 *       由地坪 + `RD-B-axis-rear-inner` 引坡实现，kit 同样不重复造台明；组原点 = `baseY - terraceH`，
 *       台基顶 = 后宫地坪，门洞地面与 `WK-C-ground` 齐平（不产生 0.9m 门槛阻挡）。
 *
 * 成批策略：每个构件**单档**（`lod:'near'|'mid'`，不做逐栋三档 LOD），末端调用一次
 * `kit.mergeZone(root)` 做「跨建筑 × 同材质同部位」合批。逐栋 LOD 在本项目审计口径（"全量口径"会把
 * LOD 未选档的网格一并计入）下会把 C 区批次从 31 抬到 76，而 C 区单区三角面仅约 4 万（预算 150 万），
 * 逐栋 LOD 无收益；实测对照见回执 §2.6。
 *
 * 契约来源：docs/CONTRACTS.md §3（返回值/ctx）、§4（建筑字段）、§5（机位）、§6（碰撞）、§8.3（灯位）。
 */

import { CONFIG, deriveSeed } from '../shared/config.js';
import { rampsFromRoads } from '../core/layout-slice.js';

export const ZONE_ID = 'C';
export const ZONE_VERSION = '1.0.0';
export const ZONE_KIND = 'innerPalace';

/**
 * 屋身形制（t24 收口，取代旧的 `PASSABLE_BODY_BRANCH='gateHall'` 绕过）：
 * **直接使用槽位 kind**（`hall` / `gateHall` / `sideHall` / `pavilion` / `courtyardGate`）。
 * t22 已把"门洞 / 屋顶形制 / 窗 / 门扇开合"四件事解耦（src/kit/buildings.js 的
 * `doubleEave = (roofSpec.doubleEave || isTower) && !isPavilion`；src/kit/geometry.js buildBody 的
 * 正立面门洞由 `doorHalf > 0` 决定）：因此寝殿按真实 `roofType: doubleEaveHip` / `grade: 3`
 * 建为**重檐庑殿**（上层屋身 + 腰檐 + 长正脊四面坡），同时正立面仍按 `layout.OBSTACLES` 的
 * `door.width` 留出 26m 明间门洞 → 第一人称可通行、不穿模，且不再牺牲隔扇窗。
 * 几何事实断言见 tests/zone-inner.test.mjs「寝殿重檐庑殿的几何事实」一节。
 */
/** 用 `near` 档建造的重点建筑（其余 `mid`）：内廷门与寝殿正殿。 */
const NEAR_DETAIL_SLOTS = Object.freeze(['C-gate-inner', 'C-hall-bed-main']);

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


const round = (v) => Math.round(v * 1000) / 1000;

/** 点到线段距离（树木/灯位避让用）。 */
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

/** 沿墙轴向的实心段（门洞之间），坐标为绝对世界坐标；供碰撞盒使用。 */
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
 * 区域入口（CONTRACTS §3.1）；返回对象逐字段满足 §3.3。
 * @param {object} ctx 由 `src/core/context.js` 构造
 */
export async function createZone(ctx) {
  if (!ctx || !ctx.THREE) throw new Error('inner-palace: 需要 ctx.THREE（同一份 three，不得另装一份）');
  const THREE = ctx.THREE;
  const config = ctx.config ?? CONFIG;
  const zone = ctx.zoneLayout;
  if (!zone) throw new Error('inner-palace: ctx.zoneLayout 缺失（由 src/core/context.js 提供）');
  const kit = ctx.kit;
  if (!kit || typeof kit.terrace !== 'function') throw new Error('inner-palace: ctx.kit 缺失（CONTRACTS §3.4）');
  const helpers = zone.helpers ?? {};
  const quality = ctx.quality ?? config.QUALITY.default;

  const TERRAIN = config.TERRAIN;
  const MODULES = config.MODULES;
  const INTERACTION = config.INTERACTION;
  const PLANTS = config.PLANTS;
  const groundY = TERRAIN.innerPalaceY;
  const playerHeadroom = round(INTERACTION.player.height + MODULES.stairsStepHeight);

  const root = new THREE.Group();
  root.name = `zone-root:${ZONE_ID}`;
  root.userData.zoneId = ZONE_ID;
  root.userData.zoneVersion = ZONE_VERSION;

  const buildings = [];
  const stats = {};
  /** 逐栋 kit 实测指标（供测试/回执核对；合批后原始对象不再可查）。 */
  const buildingFacts = [];

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
      z,
      w,
      d,
      y0: round(y - thickness),
      y1: y,
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
   *  0. 读取件（全部来自 zoneLayout；院墙走 ctx.layout 兜底，见回执 §2.5 缺陷 1）
   * ====================================================================== */

  const slots = zone.slots ?? [];
  const courtyards = zone.courtyards ?? [];
  const roads = zone.roads ?? [];
  const corridors = zone.corridors ?? [];
  const terraceSpec = (zone.terraces ?? []).find((t) => t.id === 'TR-C-bed') ?? null;
  const vegetation = (zone.vegetation ?? [])[0] ?? null;

  // `zoneLayout.courtyardWalls` 由 `src/core/layout-slice.js` 以 `w.zone` 过滤，而 `layout.WALLS` 的院墙
  // 只带 `owner` 字段 → 该切片恒为空。此处优先用切片，为空时按 owner 回退到同一份冻结 layout（不改共享文件）。
  const courtyardWalls = (zone.courtyardWalls ?? []).length > 0
    ? zone.courtyardWalls
    : ((ctx.layout ?? {}).WALLS ?? []).filter((w) => w.kind === 'courtWall' && w.owner === zone.id);

  /* ========================================================================
   *  1. 建筑（12 槽位；参数直接展开槽位对象，字段逐条回显 layout）
   * ====================================================================== */

  /**
   * 建筑定位（回执 §2.3）：kit 的 `baseY` 语义 = 台基顶（柱础标高），组原点 = `baseY - terraceH`。
   *   · 通用：后宫地坪 + 槽位 terraceH → 台基露在后宫地坪之上；
   *   · 寝殿：1.5m 台基已由 `layout.TERRACES.TR-C-bed` 平台实现 → kit 不重复造台明，
   *     `baseY` 直接取平台顶（= `WK-C-bed-interior.y`）；
   *   · 内廷门：槽位 terraceH 就是 B(0)→C(0.9) 的高差（由地坪 + 引坡实现）→ 同样不造台明，
   *     `baseY` 取 layout 原值（= `TERRAIN.innerGateTerraceY`），门洞地面与 `WK-C-ground` 齐平。
   */
  function placementFor(slot) {
    if (slot.id === 'C-hall-bed-main' && terraceSpec) {
      return { baseY: terraceSpec.y1, terraceH: 0, source: 'TR-C-bed 平台顶' };
    }
    if (slot.id === 'C-gate-inner') {
      return { baseY: slot.baseY, terraceH: 0, source: '台基即 B→C 高差（地坪 + 引坡）' };
    }
    return { baseY: round(groundY + slot.terraceH), terraceH: slot.terraceH, source: '后宫地坪 + 槽位 terraceH' };
  }

  const buildingMetrics = new Map();
  for (const slot of slots) {
    const placement = placementFor(slot);
    const { terraceH, baseY } = placement;
    const groundLevel = round(baseY - terraceH); // 组原点（台基底）
    const detail = NEAR_DETAIL_SLOTS.includes(slot.id) ? 'near' : 'mid';
    const params = { ...slot, quality, lod: detail, baseY, terraceH };
    if (slot.door) params.door = { ...slot.door };
    // 形制与门洞都交给 kit：kind 决定屋顶形制/窗/门扇开合，door（layout 数据）决定门洞净宽
    const factory = slot.kind;
    if (typeof kit[factory] !== 'function') throw new Error(`inner-palace: kit.${factory} 缺失（CONTRACTS §3.4）`);
    const object = kit[factory](params);
    object.name = `building:${slot.id}`;
    root.add(object);
    buildingMetrics.set(slot.id, object.userData?.kit?.metrics ?? null);

    // 建筑锚点（与 `_greybox` 同构）：供注册表/选中/导视挂载标记；合批只处理 Mesh，锚点保留在 root 下
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

    const m = buildingMetrics.get(slot.id);
    if (m) {
      const tris = typeof m.triangles === 'object' && m.triangles !== null
        ? Math.max(...Object.values(m.triangles))
        : m.triangles;
      buildingFacts.push({
        id: slot.id,
        kind: slot.kind,
        bodyBranch: factory,
        detail,
        level: object.userData?.kit?.detail ?? detail,
        baseY,
        terraceH,
        groundLevel,
        placementSource: placement.source,
        terraceAbsorbed: terraceH === 0 && slot.terraceH > 0,
        eaveHeightAbsolute: m.eaveHeightAbsolute ?? null,
        totalHeight: m.totalHeight ?? null,
        roofType: m.roofType ?? slot.roofType,
        doubleEave: m.doubleEave === true,
        doorWidth: m.doorWidth ?? 0,
        // t24 收口：把判定"重檐庑殿"的 kit 几何事实一并留档，供测试/回执核对（不是槽位回显）
        eaveHeight: m.eaveHeight ?? null,
        upperEaveY: m.upperEaveY ?? null,
        apronRise: m.apronRise ?? null,
        ridgeLength: m.ridge?.length ?? null,
        slopes: m.slopes ?? null,
        bodyW: m.bodyW ?? null,
        bodyD: m.bodyD ?? null,
        doorHeight: m.doorHeight ?? null,
        partNames: Array.isArray(m.parts) ? [...m.parts] : [],
        triangles: tris ?? null,
        worldBounds: worldBounds ? { ...worldBounds } : null,
      });
    }
  }

  /* ========================================================================
   *  2. 寝殿台基（TR-C-bed 整院高台）、丹陛台阶、地面与御道铺装
   * ====================================================================== */

  // 2.1 寝殿台基（layout.TERRACES.TR-C-bed：144m × 62m，0.9 → 2.4；正面留台阶缺口）
  if (terraceSpec) {
    const t = kit.terrace({
      id: terraceSpec.id,
      name: terraceSpec.label,
      bounds: { ...terraceSpec.bounds },
      x: (terraceSpec.bounds.minX + terraceSpec.bounds.maxX) / 2,
      z: (terraceSpec.bounds.minZ + terraceSpec.bounds.maxZ) / 2,
      w: terraceSpec.bounds.maxX - terraceSpec.bounds.minX,
      d: terraceSpec.bounds.maxZ - terraceSpec.bounds.minZ,
      y0: terraceSpec.y0,
      y1: terraceSpec.y1,
      detail: 'mid',
    });
    root.add(t);
  }

  // 2.2 丹陛台阶：按 layout 连接（CXN-C-bed-terrace-danbi / -north-stairs）的起止标高生成
  stats.stairs = 0;
  const stairsPlacements = [];
  for (const connectorId of ['CXN-C-bed-terrace-danbi', 'CXN-C-bed-terrace-north-stairs']) {
    const cxn = typeof helpers.getConnector === 'function' ? helpers.getConnector(connectorId) : null;
    if (!cxn || !terraceSpec) continue;
    const rise = round(cxn.elevation - (cxn.elevationLow ?? terraceSpec.y0));
    const north = connectorId.endsWith('north-stairs');
    const placementZ = north ? terraceSpec.bounds.maxZ : terraceSpec.bounds.minZ;
    const rotationYDeg = north ? 180 : 0;
    const stairs = kit.stairs({
      id: `C-stairs-${connectorId}`,
      name: cxn.name,
      x: cxn.position.x,
      z: placementZ,
      width: cxn.width,
      rise,
      // 台阶从连接登记的下端标高起算（kit 的 baseY 语义 = 组原点标高），上端 = 台基顶
      baseY: cxn.elevationLow ?? terraceSpec.y0,
      imperialRamp: true,
      rotationYDeg,
      detail: 'mid',
    });
    root.add(stairs);
    stats.stairs += 1;
    // 留档：高端贴台基沿、低端朝院子的方向（kit 台阶高端在组原点、向本地 -Z 递降）
    stairsPlacements.push({
      id: `C-stairs-${connectorId}`,
      connector: connectorId,
      x: cxn.position.x,
      z: placementZ,
      baseY: round(cxn.elevationLow ?? terraceSpec.y0),
      rise,
      rotationYDeg,
      highEndZ: placementZ,
      side: north ? 'north' : 'south',
    });
  }
  stats.stairsPlacements = stairsPlacements;

  // 2.3 三进院落地面（后宫地坪 = WK-C-ground.y；外沿按院墙厚补足，避免墙下露空）
  const wallHalf = round(MODULES.courtyardWallThickness / 2);
  const zoneMinX = zone.bounds ? zone.bounds.minX : -100;
  const zoneMaxX = zone.bounds ? zone.bounds.maxX : 100;
  for (const [i, cy] of courtyards.entries()) {
    const b = cy.bounds;
    const minZ = i === 0 ? round(b.minZ - wallHalf) : b.minZ;
    const maxZ = i === courtyards.length - 1 ? round(b.maxZ + wallHalf) : b.maxZ;
    slab({
      id: `C-ground-${i + 1}`,
      name: `${cy.name}地面`,
      x: round((zoneMinX + zoneMaxX) / 2),
      z: round((minZ + maxZ) / 2),
      w: round(zoneMaxX - zoneMinX),
      d: round(maxZ - minZ),
      y: groundY,
      thickness: MODULES.plinthHeightMin,
      material: 'pavingStone',
    });
  }
  stats.groundSlabs = courtyards.length;

  // 2.4 御道 / 步道条带：把 layout 的平地道路段画成同宽同标高的浅色铺装（台阶、台基顶另行处理）
  const stripSurfaces = new Set(['paving']);
  let stripCount = 0;
  for (const road of roads) {
    if (!stripSurfaces.has(road.surface)) continue;
    const horizontal = Math.abs(road.to.x - road.from.x) >= Math.abs(road.to.z - road.from.z);
    slab({
      id: `C-road-${road.id}`,
      name: road.name,
      x: round((road.from.x + road.to.x) / 2),
      z: round((road.from.z + road.to.z) / 2),
      w: horizontal ? round(Math.abs(road.to.x - road.from.x)) : road.width,
      d: horizontal ? road.width : round(Math.abs(road.to.z - road.from.z)),
      y: round(Math.max(road.from.y, road.to.y) + 0.02),
      thickness: MODULES.plinthHeightMin,
      material: 'pavingLight',
    });
    stripCount += 1;
  }
  // 台基顶御道（RD-C-bed-terrace-top）：只铺寝殿前后的月台段，避开建筑足迹与室内金砖地面
  if (terraceSpec) {
    const hallBounds = buildings.find((b) => b.id === 'C-hall-bed-main')?.bounds ?? null;
    if (hallBounds) {
      const aprons = [
        { minZ: terraceSpec.bounds.minZ, maxZ: hallBounds.minZ, name: '寝殿月台御道（南）' },
        { minZ: hallBounds.maxZ, maxZ: terraceSpec.bounds.maxZ, name: '寝殿月台御道（北）' },
      ];
      for (const [i, apron] of aprons.entries()) {
        if (apron.maxZ - apron.minZ < 1) continue;
        slab({
          id: `C-terrace-apron-${i + 1}`,
          name: apron.name,
          x: 0,
          z: round((apron.minZ + apron.maxZ) / 2),
          w: round(MODULES.bayPitch * 1.5),
          d: round(apron.maxZ - apron.minZ),
          y: round(terraceSpec.y1 + 0.02),
          thickness: round(MODULES.plinthHeightMin * 0.5),
          material: 'pavingLight',
        });
        stripCount += 1;
      }
    }
  }
  stats.roadStrips = stripCount;

  /* ========================================================================
   *  3. 院墙（12 段，layout.WALLS.kind='courtWall'）——含门洞几何 + 实心段碰撞盒
   * ====================================================================== */

  const wallObstacles = [];
  const wallOpenings = [];
  for (const wall of courtyardWalls) {
    const horizontal = wall.axis === 'x';
    const mid = horizontal ? (wall.from.x + wall.to.x) / 2 : (wall.from.z + wall.to.z) / 2;
    // 门洞净高：kit 默认取墙身高的 gateOpeningHeight；若洞口落在高台上，则按该处地坪（floorYAt）抬到
    // "玩家身高 + 一级台阶"的净空——否则 1.8m 的玩家会被压在寝殿月台处的门楣下（第一人称卡死）。
    const openings = (wall.openings ?? []).map((o) => {
      const atX = horizontal ? o.at : wall.from.x;
      const atZ = horizontal ? wall.from.z : o.at;
      const localFloor = (typeof helpers.floorYAt === 'function' ? helpers.floorYAt(atX, atZ) : null) ?? groundY;
      const needed = round(localFloor + playerHeadroom - groundY);
      const height = Math.min(wall.height, Math.max(round(wall.height * 0.62), needed));
      wallOpenings.push({
        wallId: wall.id,
        axis: wall.axis,
        position: { x: atX, z: atZ },
        width: o.width,
        height,
        floorY: localFloor,
        neededHeight: needed,
      });
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
      // 'far' 只影响压顶脊线（kit.wall 唯一按 detail 分支的部件）；院墙以体量与门洞为主，
      // 省下的 1 个绘制批次留给 §8.2 分区预算的余量（实测见回执 §2.6）。
      detail: 'far',
    });
    root.add(mesh);

    // 院墙实心段碰撞：layout.OBSTACLES 未登记院墙，而院墙是 C 自己负责的实体边界（缺碰撞即穿模）
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
  stats.wallObstacles = wallObstacles.length;

  /* ========================================================================
   *  4. 廊庑（6 段 CR-C-*，围合感的主要来源）
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
      detail: 'near',
    });
    root.add(mesh);
  }
  stats.corridors = corridors.length;

  /* ========================================================================
   *  5. 内景（t63）：对 layout 注册了 `WK-<slotId>-interior` 的每一栋布 kit.interiorSet
   *     —— 尺寸只取自布局登记的室内可行走面（不自行推断）；
   *     —— 天花由本区补一层（kit 屋面为单面朝外，室内抬头会看见天空）；
   *     —— 每栋登记 2 条室内灯位 + 2 座灯体（供环境系统按距离激活，夜景内景可读性所需）。
   * ====================================================================== */

  const interiors = [];
  const interiorLights = [];
  // 内景登记的唯一权威来源：layout 的 INTERIOR_BY_SLOT（经 ctx.layout.interiorFor，含既有别名
  // WK-C-bed-interior → C-hall-bed-main）；存在 `zoneLayout.interiors` 切片时优先用切片。
  const interiorRecordFor = (slotId) => {
    const slice = (zone.interiors ?? []).find((r) => r.slotId === slotId);
    if (slice) return slice;
    return typeof ctx.layout?.interiorFor === 'function' ? ctx.layout.interiorFor(slotId) : null;
  };
  for (const slot of slots) {
    const record = interiorRecordFor(slot.id);
    if (!record) continue; // 布局未注册内景（亭 / 院门）→ 本卡排除
    const surface = (zone.walkable ?? []).find((w) => w.id === record.walkableId) ?? null;
    if (!surface) continue;
    const interiorKind = INTERIOR_KIND_OF[slot.kind] ?? null;
    if (!interiorKind || typeof kit.interiorSet !== 'function') continue;
    const groundY = surface.y;
    const metrics = buildingMetrics.get(slot.id) ?? null;
    const eaveY = metrics?.eaveHeightAbsolute
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

    // 天花：顶到墙（避免墙檐露缝），底面压在 kit 藻井之上
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

    // 室内灯位/灯体：沿进深中段两侧各一（均在室内包围盒内）
    const cx = round((bounds.minX + bounds.maxX) / 2);
    const cz = round((bounds.minZ + bounds.maxZ) / 2);
    const dx = round((bounds.maxX - bounds.minX) * 0.28);
    for (const [i, offset] of [-dx, dx].entries()) {
      const anchor = {
        id: `LA-${ZONE_ID}-${slot.id}-${String(i + 1).padStart(2, '0')}`,
        zone: ZONE_ID,
        kind: 'lantern',
        position: { x: round(cx + offset), y: groundY, z: cz },
        height: 3.2,
        role: 'interiorLantern',
        buildingId: slot.id,
      };
      interiorLights.push(anchor);
      if (typeof kit.lantern === 'function') {
        const mesh = kit.lantern({
          id: `C-lamp-${anchor.id}`,
          x: anchor.position.x,
          y: groundY,
          z: anchor.position.z,
          height: anchor.height,
          kind: 'post',
          detail: 'far',
        });
        root.add(mesh);
      }
    }

    const m = set.userData?.kit?.metrics ?? null;
    interiors.push({
      slotId: slot.id,
      kind: interiorKind,
      grade: slot.grade,
      walkableId: surface.id,
      groundY,
      ceilingY,
      eaveHeightAbsolute: eaveY,
      bounds,
      items: Array.isArray(m?.items) ? [...m.items] : [],
      triangles: m?.triangles ?? null,
      worldBounds: m?.worldBounds ?? null,
      lodDistances: set.userData?.kit?.distances ?? m?.lodDistances ?? [],
    });
  }
  stats.interiors = interiors;
  stats.interiorCount = interiors.length;
  stats.interiorLights = interiorLights.length;

  /* ========================================================================
   *  6. 绿化（layout.VEGETATION：14 株 / 花树 4 株，种子固定可复现）
   * ====================================================================== */

  const trees = [];
  if (vegetation && typeof kit.tree === 'function') {
    const rng = typeof ctx.rng?.fork === 'function' ? ctx.rng.fork('trees') : null;
    const clearance = round(MODULES.plinthWidth * 1.5);
    const blocked = (x, z) => {
      for (const slot of slots) if (insideRect(slot.bounds, x, z, clearance)) return true;
      if (terraceSpec && insideRect(terraceSpec.bounds, x, z, 1)) return true;
      for (const road of roads) {
        if (pointToSegmentDistance(x, z, road.from, road.to) < road.width / 2 + clearance) return true;
      }
      for (const corridor of corridors) {
        if (pointToSegmentDistance(x, z, corridor.from, corridor.to) < corridor.width / 2 + clearance) return true;
      }
      for (const wall of courtyardWalls) {
        if (pointToSegmentDistance(x, z, wall.from, wall.to) < wall.thickness / 2 + clearance) return true;
      }
      return Math.abs(x) < MODULES.bayPitch; // 中轴御道留空
    };
    const count = vegetation.treeCount ?? PLANTS.densityPerCourt;
    const blossoms = Math.min(vegetation.blossomCount ?? 0, count);
    const sizes = Object.keys(PLANTS.treeHeights);
    let guard = 0;
    while (rng && trees.length < count && guard < 6000) {
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
    for (const [i, spot] of trees.entries()) {
      const size = rng ? rng.pick(sizes) : sizes[0];
      const mesh = kit.tree({
        id: `C-tree-${String(i + 1).padStart(2, '0')}`,
        x: spot.x,
        z: spot.z,
        y: groundY,
        height: PLANTS.treeHeights[size],
        size,
        canopyShape: rng ? rng.pick(PLANTS.canopyShapes) : PLANTS.canopyShapes[0],
        blossom: i < blossoms,
        detail: 'mid',
      });
      root.add(mesh);
    }
  }
  stats.trees = trees.length;

  /* ========================================================================
   *  7. 灯位与灯体（layout.LIGHT_ANCHORS 的 C 区条目 + 室内 4 座）
   * ====================================================================== */

  const lightAnchors = (zone.lightAnchors ?? []).map((a) => ({ ...a, position: { ...a.position } }));
  lightAnchors.push(...interiorLights);
  if (typeof kit.lantern === 'function') {
    for (const anchor of lightAnchors) {
      // 灯体立在灯位处的实际地坪上（layout 锚点 y=0 是"区域基准"，后宫地坪为 0.9）
      const surfaceY = typeof helpers.floorYAt === 'function' ? helpers.floorYAt(anchor.position.x, anchor.position.z) : null;
      const y = anchor.role === 'interiorLantern' ? anchor.position.y : (surfaceY ?? groundY);
      const mesh = kit.lantern({
        id: `C-lamp-${anchor.id}`,
        x: anchor.position.x,
        y,
        z: anchor.position.z,
        height: anchor.height,
        kind: 'post',
        detail: 'mid',
      });
      root.add(mesh);
    }
  }
  stats.lanternMeshes = lightAnchors.length;

  /* ========================================================================
   *  8. 整区合批（跨建筑 × 同材质同部位）——§8.2 绘制调用预算
   * ====================================================================== */

  stats.preMergeMeshes = countMeshes(root);
  stats.preMergeTriangles = countTriangles(root);
  if (typeof kit.mergeZone === 'function') {
    const merged = kit.mergeZone(root, { name: `zone-batch:${ZONE_ID}` });
    stats.merge = merged?.stats ?? null;
  }
  stats.drawCalls = typeof kit.countDrawCalls === 'function' ? kit.countDrawCalls(root) : countMeshes(root);
  stats.triangles = countTriangles(root);
  stats.drawCallBudget = zone.drawCallBudget ?? config.BUDGET.drawCalls.perZone[ZONE_ID];

  /* ========================================================================
   *  9. 碰撞 / 连接 / 机位（回显 layout，院墙补充实心段）
   * ====================================================================== */

  const connectors = (zone.connectors ?? []).map((c) => ({ ...c, position: { ...c.position } }));
  const colliders = {
    obstacles: [
      ...(zone.obstacles ?? []).map((o) => ({ ...o, bounds: { ...o.bounds } })),
      ...wallObstacles,
    ],
    walkable: (zone.walkable ?? []).map((w) => ({ ...w, bounds: { ...w.bounds } })),
    ramps: rampsFromRoads(roads).map((r) => ({ ...r })),
  };
  const viewpoints = (zone.viewpoints ?? []).map((v) => ({
    ...v,
    position: { ...v.position },
    target: { ...v.target },
  }));

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
    interiorCount: interiors.length,
    interiors,
    buildingFacts,
    wallOpenings,
    kitSource: kit.__fallback === true ? 'fallback(greybox)' : `kit ${kit.version ?? '?'}`,
  });

  /* ========================================================================
   * 10. update / dispose
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
     * 只累计时间：C 区的水面微波、灯焰、烟雾全部由 `src/core/environment.js` 的统一系统驱动
     * （CONTRACTS §3.3 / §8.3「区域不得另建第二套灯光系统」）。本回调不读写相机、不改 state。
     */
    update(dtSeconds /* , elapsedSeconds, state */) {
      if (Number.isFinite(dtSeconds)) elapsed += dtSeconds;
    },
    /** 只释放自有几何（kitOwned 标记）；共享 kit 材质/贴图归 t3 + core，绝不在此销毁。 */
    dispose() {
      if (disposed) return;
      disposed = true;
      root.traverse((node) => {
        if (node.isMesh && node.geometry?.userData?.kitOwned === true) node.geometry.dispose();
      });
      root.clear();
    },
    stats,
    get elapsedSeconds() {
      return elapsed;
    },
  };
}

export default createZone;
