/**
 * west-courts.js — **D 区 · 西侧宫苑**（计划 §5.4 / CONTRACTS §3–§6 / STYLE_GUIDE §3–§5）
 * =============================================================================
 * 四组可识别院落，成「一脊四进」的西苑序列（每组：院门 + 主屋 + 配房 + 院南廊 + 院前步道）：
 *   CY-D-court1 礼乐院（礼乐殿 + 南配房 + 院门）   z -392…-244
 *   CY-D-court2 书院院（书院正堂 + 南厢 + 院门）   z -232…-84
 *   CY-D-court3 服务院（服务院主屋 + 南房 + 院门 + **荷池·池上小亭·池畔石栏·汀步**） z -72…76
 *   CY-D-court4 西后院（西后殿 + 南配房 + 院门 + 后园小亭）  z 88…290
 *
 * 布局分配给 D 的 **14 个槽位**全部落地（id 与 `layout.SLOTS` 逐一对应，不新增、不扩张边界）；
 * 院落内墙（16 段）、院内/院前道路、池岸与汀步、树木与灯位由本区负责；
 * **外宫墙 / 城门 / 护城河 / 桥与外水系归 F**，本区不实现、不越界（只按 `layout.ROADS` 把铺装铺到
 * 本区路端：西侧城门内接 `x=-291`、花园西入口 `x=-200, z=290…300`）。
 *
 * 与东侧 E 的统一与差异（计划 §5.4「避免机械镜像」）：
 *   · 统一：同一套 kit 构件 + config 令牌（模数/色板/屋顶等级白名单由 kit 强校验）；主屋 grade 2 歇山、
 *     配房 grade 1 硬山、院门 grade 1 硬山、亭 grade 1 攒尖——体量完全来自 layout 冻结数据，
 *     因此 D/E 的相似只存在于**体量层**；
 *   · 差异（本区主动设计的装饰语言，不共用 E 的脚本与布置）：D 以「**池石景 + 四院南廊 + 甬道列植**」为骨——
 *     服务院荷池配**池上小亭 + 环池石栏 + 汀步石桥**（可走上池心小岛，E 的水榭是纯观赏），
 *     四院各有一道**院南廊庑**把院门—主屋串成风雨动线，铜器用**鼎、炉**成对陈于主屋之前，
 *     植被按「甬道列植 + 池畔柳 + 院角散植」三带布置（E 为沿院墙内侧成列）；
 *     E 的两处影壁「进门见屏」为东苑语汇，D 不设影壁而设池亭与置石序列。
 *   · 主题名称（礼乐/书院/服务/西后）仅作展示设定，不作史实断言。
 *
 * 竖直定位：D 区地坪 `TERRAIN.sideCourtY = 0.4`（`WK-D-ground.y`、`VP-D-fp-spawn.y = 2.05 = 0.4 + 1.65`），
 * 而 `SLOTS.baseY` 是相对区域基准 0 的估值 → kit 摆位抬到地坪：`baseY(kit) = 0.4 + 槽位.terraceH`。
 * 因此 `|kit.eaveHeightAbsolute − (layout.eaveHeight + 0.4)| ≤ 6mm`（测试逐栋断言）。
 *
 * 成批策略（分区预算 40，实测见回执）：
 *   · 建筑单档（medium/high → `mid`、low → `far`，见 `BUILDING_DETAIL_BY_QUALITY`），不做逐栋三档 LOD：
 *     `scripts/audit.mjs` 的 measure() 不调 `LOD.update()`，逐栋三档会把三档几何全部计入；
 *   · 摆件（宫灯/铜器）取 `far` 档——`kit` 的 `far` 只去掉望柱帽、铜器耳足这类小件，
 *     在 110m 分区机位与 2m 第一人称视距上不改变识别性，却省下 6 个绘制批次；
 *   · 树群与宫灯用 `kit.instanceFromPoints` 实例化（同形制只保留一份顶点数据）；
 *   · 末端一次 `kit.mergeZone(root)`（跨建筑 × 同材质同部位）。
 *
 * 契约来源：docs/CONTRACTS.md §3（返回值/ctx）、§4（建筑字段）、§5（机位）、§6（碰撞）、§8.3（灯位）。
 */

import * as THREE from 'three';
import { CONFIG, MODULES, TERRAIN, INTERACTION, PLANTS, deriveSeed } from '../shared/config.js';
import { INTERIOR_BY_SLOT, WALKABLE, WATER_BODIES, WALLS } from '../shared/layout.js';
import { rampsFromRoads } from '../core/layout-slice.js';

export const ZONE_ID = 'D';
export const ZONE_VERSION = '1.0.0';
export const ZONE_KIND = 'westCourts';

/** 建筑细节档（质量档只改渲染成本，不改布局与可走性）。 */
const BUILDING_DETAIL_BY_QUALITY = Object.freeze({ high: 'mid', medium: 'mid', low: 'far' });
/** 摆件细节档：宫灯/铜器固定 far（见文件头"成批策略"）。 */
const PROP_DETAIL = 'far';
/** 院墙细节档：kit.wall 只有"压顶脊线"按 detail 分支，far 省 1 个批次。 */
const WALL_DETAIL = 'far';

const round = (v) => Math.round(v * 1000) / 1000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

function fail(message) {
  throw new Error(`west-courts(D): ${message}`);
}

function kitFactory(kit, name, { required = true, fallback = null } = {}) {
  const fn = kit?.[name];
  if (typeof fn === 'function') return fn;
  if (required) fail(`ctx.kit.${name} 不存在（CONTRACTS §3.4 冻结接口，应由 t3 提供）`);
  return fallback;
}

/* =============================================================================
 * 一、几何小工具
 * ========================================================================== */

/** 点到线段的距离（院前步道/灯位避让判定）。 */
function distanceToSegment(x, z, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(x - from.x, z - from.z);
  let t = ((x - from.x) * dx + (z - from.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t));
}

function insideBounds(bounds, x, z, margin = 0) {
  return x >= bounds.minX - margin && x <= bounds.maxX + margin && z >= bounds.minZ - margin && z <= bounds.maxZ + margin;
}

/**
 * 沿墙轴线的**实心段**（门洞之间），世界坐标。院墙是本区自己负责的实体边界，
 * `layout.OBSTACLES` 只登记建筑与水体，因此院墙实心段由本区补进 `colliders.obstacles`
 * （core 的 `deriveWallColliders` 会按 id/几何去重，不会双倍阻挡，见 CONTRACTS §6.3）。
 */
function wallSolidSpans(wall) {
  const alongX = wall.axis === 'x';
  const lo = alongX ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z);
  const hi = alongX ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z);
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

/* =============================================================================
 * 一之二、室内陈设（kit.interiorSet，t61 标准套件 · t62 接入）
 * ========================================================================== */

/**
 * 为区内**已登记内景**的建筑布室内陈设（`layout.INTERIOR_BY_SLOT[slotId]`，由 t60/t70/t73/t74 注册）。
 *
 * 纪律（任务 t62）：
 *   1. 室内范围与地坪**一律取 layout 注册值**：`WK-<slotId>-interior` 的 `bounds` 与 `y`，
 *      不自行推断尺寸；天花标高取 **kit 实测檐口 − 0.2m**（`buildBuildings` 记的 `eaveHeightAbsolute`），
 *      保证套件不穿顶；
 *   2. D 区 8 栋 = 殿 4（hall）+ 配房 4（sideHall）；4 座院门与 2 座亭无内景登记（不布）；
 *   3. 套件返回**未挂载**的 Group/LOD，本函数只负责 `group.add`；合批与 LOD 档位由后段统一处理；
 *   4. `seed` 由 `deriveSeed(slotId,'interior')` 派生 → 同机位画面可复现。
 *
 * 返回 { facts, available }：逐栋记录 layout 依据（地面/包围盒/机位/走查点）与套件实测（items/三角面/
 * 世界包围盒/kit 诊断），供测试与回执逐栋复核。
 */
function buildInteriorSets(ctx, group, buildingFacts) {
  // D 区地坪 `TERRAIN.sideCourtY = 0.4`：建筑与室内地面都抬到地坪上（本区一贯口径）
  const zoneGroundY = num(ctx.zoneLayout?.groundY) ? ctx.zoneLayout.groundY : TERRAIN.sideCourtY;
  const { kit } = ctx;
  const interiorSet = typeof kit.interiorSet === 'function' ? kit.interiorSet : null;
  const facts = [];
  if (!interiorSet) return { facts, available: false };

  for (const slot of ctx.zoneLayout.slots) {
    const record = INTERIOR_BY_SLOT[slot.id] ?? null;
    if (!record?.walkableId) continue;
    const surface = WALKABLE.find((w) => w.id === record.walkableId);
    if (!surface) fail(`layout 登记了 ${slot.id} 的内景 ${record.walkableId}，但 WALKABLE 中找不到该面`);

    const measured = buildingFacts.find((f) => f.id === slot.id);
    // 室内地面 = 该栋建筑 kit 的台基顶 = 区域地坪 + layout.baseY（与建筑摆位同一真值来源）。
    // ⚠️ layout 为 D/E/C 派生的 `WK-<slot>-interior.y` 用的是**相对** baseY（未加区域地坪）：
    //    D/E Δ=+0.4m、C Δ=+0.9m（见回执 §2.4 缺陷登记）。若照该值布陈设，家具会埋进 0.4m 厚的台明里、
    //    内景不可见，因此这里取几何真值并在回执给出最小修法（由 layout 侧把三区派生内景 y 抬高）。
    const groundY = round(zoneGroundY + slot.baseY);
    const eaveAbsolute = measured?.eaveHeightAbsolute ?? (groundY + slot.eaveHeight);
    const ceilingY = Math.max(groundY + 0.6, Math.min(eaveAbsolute, groundY + slot.eaveHeight) - 0.2);

    const object = interiorSet({
      id: `interior:${slot.id}`,
      kind: slot.kind,
      grade: slot.grade,
      bounds: { ...surface.bounds },
      groundY,
      layoutGroundY: surface.y,
      groundDelta: round(groundY - surface.y),
      ceilingY,
      entrance: { x: slot.entrance.x, z: slot.entrance.z },
      seed: deriveSeed(slot.id, 'interior'),
      lod: 'auto',
    });
    object.userData.zone = ZONE_ID;
    object.userData.buildingId = slot.id;
    object.userData.interiorSurfaceId = surface.id;
    object.userData.interiorViewpointId = record.viewpointId ?? null;
    group.add(object);

    const metrics = object.userData.kit?.metrics ?? {};
    facts.push({
      id: slot.id,
      kind: slot.kind,
      grade: slot.grade,
      surfaceId: surface.id,
      viewpointId: record.viewpointId ?? null,
      fpId: record.fpId ?? null,
      bounds: { ...surface.bounds },
      groundY,
      layoutGroundY: surface.y,
      groundDelta: round(groundY - surface.y),
      ceilingY,
      items: Array.isArray(metrics.items) ? metrics.items.length : 0,
      triangles: metrics.triangles ?? null,
      worldBounds: metrics.worldBounds ?? null,
      diagnostics: (object.userData.kit?.warnings ?? []).map((w) => (typeof w === 'string' ? w : w.code)),
    });
  }
  return { facts, available: true };
}

/**
 * 内景补光灯位（§8.3；灯由 t2 环境系统统一激活，区域不建第二套灯光）。
 * 与 B 区同一手法：每栋内景沿长轴 1/3、2/3 各一盏，落在室内地面（`groundY`），高度 2.6m。
 * 目的：§12 内景判据（暗区 ≤30%）在 goldenHour 下对净高 3~4m 的配房偏紧（深色屋面占比大），
 * 按 CONFIG 1.0.3 `lampIntensityScale(golden 0.45)` 让宫灯参与室内照明 —— 最小修法，不放宽判据。
 */
function buildInteriorLampAnchors(ctx, interiorFacts) {
  const out = [];
  for (const fact of interiorFacts) {
    const b = fact.bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    const alongZ = spanZ >= spanX;
    for (const t of [1 / 3, 2 / 3]) {
      const x = round(alongZ ? (b.minX + b.maxX) / 2 : b.minX + spanX * t);
      const z = round(alongZ ? b.minZ + spanZ * t : (b.minZ + b.maxZ) / 2);
      out.push({
        id: `LA-D-interior-${fact.id.replace(/^D-/, '')}-${alongZ ? 'z' : 'x'}${t === 1 / 3 ? 'a' : 'b'}`,
        zone: ZONE_ID,
        kind: 'lantern',
        position: { x, y: fact.groundY, z },
        height: 2.6,
        role: 'gardenOrCourtLantern',
        note: `室内宫灯（${fact.id} 内景补光；t62 最小修法）`,
      });
    }
  }
  return out;
}

/* =============================================================================
 * 二、区域入口
 * ========================================================================== */

/**
 * D 区入口（CONTRACTS §3.3）。
 * @param {object} ctx 由 `src/core/context.js` 构造（测试用 `makeTestCtx` 注入真 kit）
 */
export async function createZone(ctx) {
  if (!ctx?.THREE) fail('需要 ctx.THREE（同一份 three，不得另装一份）');
  const zone = ctx.zoneLayout;
  if (!zone) fail('ctx.zoneLayout 缺失（由 src/core/context.js 提供）');
  if (zone.id !== ZONE_ID) fail(`ctx.zoneLayout.id=${zone.id}，本模块只负责 ${ZONE_ID}`);
  const config = ctx.config ?? CONFIG;
  const kit = ctx.kit;
  if (!kit) fail('ctx.kit 缺失（构件工厂由 t3 提供，见 CONTRACTS §3.4）');
  const helpers = zone.helpers ?? {};

  const groundY = num(zone.groundY) ? zone.groundY : TERRAIN.sideCourtY;
  const buildingDetail = BUILDING_DETAIL_BY_QUALITY[ctx.quality] ?? BUILDING_DETAIL_BY_QUALITY.medium;
  const playerHeight = INTERACTION.player.height;
  const stepHeight = MODULES.stairsStepHeight;

  const root = new THREE.Group();
  root.name = `zone-root:${ZONE_ID}`;
  root.userData.zoneId = ZONE_ID;
  root.userData.zoneVersion = ZONE_VERSION;

  const groups = {
    buildings: new THREE.Group(),
    interiors: new THREE.Group(),
    courts: new THREE.Group(),
    water: new THREE.Group(),
    ground: new THREE.Group(),
    props: new THREE.Group(),
  };
  for (const [key, group] of Object.entries(groups)) {
    group.name = `D:${key}`;
    root.add(group);
  }

  /* ---- 读取件（只消费 zoneLayout + 冻结表） ---- */
  const slots = zone.slots ?? [];
  const courtyards = zone.courtyards ?? [];
  const roads = zone.roads ?? [];
  const corridors = zone.corridors ?? [];
  const layoutObstacles = zone.obstacles ?? [];
  const vegetation = (zone.vegetation ?? [])[0] ?? null;
  const courtyardIds = new Set(courtyards.map((c) => c.id));

  /**
   * 院墙：优先消费切片（t2 已修 `zoneLayout.courtyardWalls`）；若切片再次为空，
   * 按 `courtyardId` 回退到同一份冻结表（`layout.WALLS` 只有 owner/courtyardId，没有 zone 字段）。
   */
  const courtyardWalls = (zone.courtyardWalls ?? []).length > 0
    ? zone.courtyardWalls
    : WALLS.filter((w) => w.kind === 'courtWall' && courtyardIds.has(w.courtyardId));

  const slotById = (id) => slots.find((s) => s.id === id) ?? null;

  /* ========================================================================
   * 1. 建筑（14 槽位，逐字段回显 layout）
   * ====================================================================== */

  const buildingFacts = [];
  const buildings = [];

  for (const slot of slots) {
    const factory = kitFactory(kit, slot.kind);
    const params = {
      id: slot.id,
      name: slot.name,
      kind: slot.kind,
      zone: slot.zone,
      x: slot.x,
      z: slot.z,
      w: slot.w,
      d: slot.d,
      bays: slot.bays,
      terraceH: slot.terraceH,
      roofType: slot.roofType,
      grade: slot.grade,
      facing: slot.facing,
      rotationYDeg: slot.rotationYDeg,
      // 地坪抬升：kit 的 baseY 语义 = 台基顶（世界），layout 的 baseY 是相对区域基准 0 的估值
      baseY: round(groundY + slot.terraceH),
      door: slot.door ? { width: slot.door.width, height: slot.door.height, axis: slot.door.axis, sillY: round(groundY + slot.door.sillY) } : null,
      quality: ctx.quality ?? config.QUALITY.default,
      lod: buildingDetail,
    };
    const object = factory(params);
    if (!object) fail(`kit.${slot.kind}(${slot.id}) 未返回对象`);
    object.name = object.name || slot.id;
    object.userData.zone = ZONE_ID;
    object.userData.buildingId = slot.id;
    groups.buildings.add(object);

    const metrics = object.userData?.kit?.metrics ?? {};
    const triangles = typeof metrics.triangles === 'object' && metrics.triangles !== null
      ? Object.values(metrics.triangles).reduce((a, b) => a + (num(b) ? b : 0), 0)
      : (num(metrics.triangles) ? metrics.triangles : 0);
    buildingFacts.push({
      id: slot.id,
      name: slot.name,
      kind: slot.kind,
      roofType: slot.roofType,
      grade: slot.grade,
      courtyard: slot.courtyard,
      detail: object.userData?.kit?.detail ?? buildingDetail,
      triangles,
      eaveHeightAbsolute: num(metrics.eaveHeightAbsolute) ? metrics.eaveHeightAbsolute : null,
      layoutEaveHeight: slot.eaveHeight,
      worldBounds: object.userData?.kit?.worldBounds ?? null,
    });

    // 建筑注册：逐字段回显 layout 槽位（不得改共享数值）
    buildings.push({ ...slot, bounds: { ...slot.bounds }, door: slot.door ? { ...slot.door } : null });
  }

  /* ========================================================================
   * 2. 院墙（16 段）+ 实心段碰撞
   * ====================================================================== */

  const wallKit = kitFactory(kit, 'wall');
  const wallFacts = [];
  const wallObstacles = [];
  const wallGroup = new THREE.Group();
  wallGroup.name = 'D:walls';
  groups.courts.add(wallGroup);

  for (const wall of courtyardWalls) {
    const alongX = wall.axis === 'x';
    const mid = alongX ? (wall.from.x + wall.to.x) / 2 : (wall.from.z + wall.to.z) / 2;
    // kit.wall 的 openings.at 是相对墙中点的偏移；layout 的 openings.at 是世界坐标
    const openings = (wall.openings ?? []).map((o) => ({
      at: round(o.at - mid),
      width: o.width,
      source: Array.isArray(o.sources) ? o.sources.join('+') : (o.source ?? wall.id),
    }));
    const mesh = wallKit({
      id: wall.id,
      name: wall.name,
      from: { ...wall.from },
      to: { ...wall.to },
      thickness: wall.thickness,
      height: wall.height,
      kind: 'courtWall',
      baseY: groundY,
      openings,
      source: wall.courtyardId,
      detail: WALL_DETAIL,
    });
    mesh.userData.zone = ZONE_ID;
    wallGroup.add(mesh);
    wallFacts.push({
      id: wall.id,
      courtyardId: wall.courtyardId,
      alongX,
      line: round(alongX ? wall.from.z : wall.from.x),
      span: [
        round(alongX ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z)),
        round(alongX ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z)),
      ],
      openings: openings.map((o) => ({ at: round(mid + o.at), width: o.width })),
      solidSpans: wallSolidSpans(wall).length,
    });

    // 院墙实心段（世界坐标）→ 碰撞；门洞处留空（blocks='all'，由 core 去重后保留其一）
    for (const [index, [a, b]] of wallSolidSpans(wall).entries()) {
      wallObstacles.push({
        id: `OB-${wall.id}-span${index + 1}`,
        sourceType: 'wall',
        zone: ZONE_ID,
        buildingId: wall.id,
        bounds: alongX
          ? { minX: a, maxX: b, minZ: round(wall.from.z - wall.thickness / 2), maxZ: round(wall.from.z + wall.thickness / 2) }
          : { minX: round(wall.from.x - wall.thickness / 2), maxX: round(wall.from.x + wall.thickness / 2), minZ: a, maxZ: b },
        y0: groundY,
        y1: round(groundY + wall.height),
        blocks: 'all',
        door: null,
        note: `院落内墙实心段（${wall.name}）；门洞位置见 layout.WALLS.${wall.id}.openings`,
      });
    }
  }

  /* ========================================================================
   * 3. 廊庑（四院南廊：院门 → 主屋 的风雨动线）
   * ====================================================================== */

  const corridorKit = kitFactory(kit, 'corridor');
  const corridorFacts = [];
  for (const corridor of corridors) {
    const mesh = corridorKit({
      id: corridor.id,
      name: corridor.name,
      from: { ...corridor.from },
      to: { ...corridor.to },
      width: corridor.width,
      floors: corridor.floors ?? 1,
      grade: 1,
      baseY: groundY,
      detail: 'mid',
    });
    mesh.userData.zone = ZONE_ID;
    groups.courts.add(mesh);
    corridorFacts.push({
      id: corridor.id,
      name: corridor.name,
      from: { ...corridor.from },
      to: { ...corridor.to },
      width: corridor.width,
      floors: corridor.floors ?? 1,
    });
  }

  /* ========================================================================
   * 4. 铺地（院内外地面 + layout.ROADS 逐段步道）
   * ====================================================================== */

  const pavingKit = kitFactory(kit, 'paving', { required: false });
  const pavingFacts = [];

  /**
   * 铺地：`kit.paving`（t3 额外工厂）；灰盒替身无此工厂时用 `kit.terrace` 薄层兜底。
   * 甬道（layout.ROADS 段）另走 `stonePath()`（白石板），既符合官式"青砖地 + 白石甬道"的对比，
   * 又复用 `terrace/terraceCap` 两个既有批次（少 1 个绘制批次，见回执 §2.5 预算表）。
   */
  function slab({ id, name, minX, maxX, minZ, maxZ, y, material }) {
    const w = round(maxX - minX);
    const d = round(maxZ - minZ);
    const x = round((minX + maxX) / 2);
    const z = round((minZ + maxZ) / 2);
    if (w <= 0.05 || d <= 0.05) return null;
    let mesh = null;
    if (pavingKit) {
      mesh = pavingKit({ id, name, x, z, w, d, y, thickness: MODULES.plinthHeightMin, material, detail: 'far' });
    } else {
      const terraceKit = kitFactory(kit, 'terrace');
      mesh = terraceKit({
        id,
        name,
        x,
        z,
        w,
        d,
        bounds: { minX, maxX, minZ, maxZ },
        y0: round(y - MODULES.plinthHeightMin),
        y1: y,
        railing: false,
        detail: 'far',
      });
    }
    mesh.userData.zone = ZONE_ID;
    groups.ground.add(mesh);
    pavingFacts.push({ id, material, bounds: { minX, maxX, minZ, maxZ }, y });
    return mesh;
  }

  // 4.1 池体外的大地面（把荷池挖空，1 种材质 → 合批后 1 个批次）
  const pond = WATER_BODIES.find((w) => w.owner === ZONE_ID) ?? null;
  const b = zone.bounds;
  if (pond) {
    const p = pond.bounds;
    slab({ id: 'D-ground-south', name: '西苑地面（池南）', minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: p.minZ, y: groundY, material: 'pavingStone' });
    slab({ id: 'D-ground-north', name: '西苑地面（池北）', minX: b.minX, maxX: b.maxX, minZ: p.maxZ, maxZ: b.maxZ, y: groundY, material: 'pavingStone' });
    slab({ id: 'D-ground-pond-west', name: '西苑地面（池西）', minX: b.minX, maxX: p.minX, minZ: p.minZ, maxZ: p.maxZ, y: groundY, material: 'pavingStone' });
    slab({ id: 'D-ground-pond-east', name: '西苑地面（池东）', minX: p.maxX, maxX: b.maxX, minZ: p.minZ, maxZ: p.maxZ, y: groundY, material: 'pavingStone' });
  } else {
    slab({ id: 'D-ground-all', name: '西苑地面', minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, y: groundY, material: 'pavingStone' });
  }

  /** 白石甬道（复用 kit.terrace 的 terrace/terraceCap 桶）。 */
  function stonePath({ id, name, minX, maxX, minZ, maxZ, y }) {
    const terraceKit = kitFactory(kit, 'terrace');
    const w = round(maxX - minX);
    const d = round(maxZ - minZ);
    if (w <= 0.05 || d <= 0.05) return null;
    const mesh = terraceKit({
      id,
      name,
      x: round((minX + maxX) / 2),
      z: round((minZ + maxZ) / 2),
      w,
      d,
      bounds: { minX, maxX, minZ, maxZ },
      y0: round(y - MODULES.plinthHeightMin),
      y1: y,
      railing: false,
      detail: 'far',
    });
    mesh.userData.zone = ZONE_ID;
    groups.ground.add(mesh);
    return mesh;
  }

  // 4.2 步道：逐段按 layout.ROADS（可见铺装 = 注册可行走带），白石路面比地面高 2cm 以示分层
  const roadFacts = [];
  for (const road of roads) {
    if (road.surface === 'gardenPath' && Math.abs(road.to.y - road.from.y) > 0.04) {
      // 花园入口坡道（0.4→0.45）：由 F 的花园侧衔接，本区只铺平段，坡道不重复造
      continue;
    }
    const alongX = Math.abs(road.to.x - road.from.x) >= Math.abs(road.to.z - road.from.z);
    const half = road.width / 2;
    const minX = Math.min(road.from.x, road.to.x) - (alongX ? 0 : half);
    const maxX = Math.max(road.from.x, road.to.x) + (alongX ? 0 : half);
    const minZ = Math.min(road.from.z, road.to.z) - (alongX ? half : 0);
    const maxZ = Math.max(road.from.z, road.to.z) + (alongX ? half : 0);
    stonePath({
      id: `D-path-${road.id}`,
      name: road.name,
      minX: Math.max(minX, b.minX),
      maxX: Math.min(maxX, b.maxX),
      minZ: Math.max(minZ, b.minZ),
      maxZ: Math.min(maxZ, b.maxZ),
      y: round(road.from.y + 0.02),
    });
    roadFacts.push({ id: road.id, from: { ...road.from }, to: { ...road.to }, width: road.width, surface: road.surface, connector: road.connector ?? null });
  }

  /* ========================================================================
   * 5. 荷池（水体 + 池底 + 池岸 + 石栏 + 汀步 + 池心小岛）
   * ====================================================================== */

  const waterFacts = { pond: null, rim: 0, railings: 0, island: null, walkway: null, guard: [] };
  if (pond) {
    const p = pond.bounds;
    const terraceKit = kitFactory(kit, 'terrace');
    const waterKit = kitFactory(kit, 'water', { required: false });
    const railingKit = kitFactory(kit, 'railing');
    const waterY = pond.y; // 水面标高（WATER_BODIES 登记 0.05）
    const depth = num(pond.depth) ? pond.depth : 0.35;

    // 5.1 池底（石底）：从池底铺到水面，避免透过水面看到空世界
    const bottom = terraceKit({
      id: 'D-pond-bottom',
      name: '荷池池底',
      x: round((p.minX + p.maxX) / 2),
      z: round((p.minZ + p.maxZ) / 2),
      w: round(p.maxX - p.minX),
      d: round(p.maxZ - p.minZ),
      bounds: { ...p },
      y0: round(waterY - depth),
      y1: round(waterY - 0.02),
      railing: false,
      detail: 'far',
    });
    bottom.userData.zone = ZONE_ID;
    groups.water.add(bottom);

    // 5.2 水面（kit.water 水片）
    if (waterKit) {
      const surface = waterKit({
        id: 'D-pond-surface',
        name: '荷池水面',
        x: round((p.minX + p.maxX) / 2),
        z: round((p.minZ + p.maxZ) / 2),
        w: round(p.maxX - p.minX),
        d: round(p.maxZ - p.minZ),
        y: waterY,
        detail: 'mid',
      });
      surface.userData.zone = ZONE_ID;
      groups.water.add(surface);
    }

    // 5.3 池岸（环池石岸，压在地面之上 2cm）
    const rimW = 2.4;
    const rims = [
      { id: 'south', bounds: { minX: p.minX - rimW, maxX: p.maxX + rimW, minZ: p.minZ - rimW, maxZ: p.minZ } },
      { id: 'north', bounds: { minX: p.minX - rimW, maxX: p.maxX + rimW, minZ: p.maxZ, maxZ: p.maxZ + rimW } },
      { id: 'west', bounds: { minX: p.minX - rimW, maxX: p.minX, minZ: p.minZ, maxZ: p.maxZ } },
      { id: 'east', bounds: { minX: p.maxX, maxX: p.maxX + rimW, minZ: p.minZ, maxZ: p.maxZ } },
    ];
    for (const rim of rims) {
      const mesh = terraceKit({
        id: `D-pond-rim-${rim.id}`,
        name: `荷池石岸（${rim.id}）`,
        x: round((rim.bounds.minX + rim.bounds.maxX) / 2),
        z: round((rim.bounds.minZ + rim.bounds.maxZ) / 2),
        w: round(rim.bounds.maxX - rim.bounds.minX),
        d: round(rim.bounds.maxZ - rim.bounds.minZ),
        bounds: { ...rim.bounds },
        y0: round(waterY),
        y1: round(groundY + 0.02),
        railing: false,
        detail: 'mid',
      });
      mesh.userData.zone = ZONE_ID;
      groups.water.add(mesh);
      waterFacts.rim += 1;
    }

    // 5.4 环池石栏（栏杆直段：南岸留汀步缺口；池心亭一侧不设栏）
    const railH = round(stepHeight * 3);
    const runRail = (id, alongX, fixed, lo, hi, y) => {
      const length = round(hi - lo);
      if (length <= 0.6) return;
      const mesh = railingKit({
        id,
        name: '荷池石栏',
        w: length,
        d: 0.36,
        x: alongX ? round((lo + hi) / 2) : fixed,
        z: alongX ? fixed : round((lo + hi) / 2),
        y,
        rotationYDeg: alongX ? 0 : 90,
        height: railH,
        detail: 'far',
      });
      mesh.userData.zone = ZONE_ID;
      groups.water.add(mesh);
      waterFacts.railings += 1;
    };
    const walkwayHalf = 2.2; // 汀步净宽的一半
    const walkX = round((p.minX + p.maxX) / 2);
    runRail('D-pond-rail-south-west', true, round(p.minZ - 0.6), p.minX - 1, walkX - walkwayHalf, round(groundY + 0.4));
    runRail('D-pond-rail-south-east', true, round(p.minZ - 0.6), walkX + walkwayHalf, p.maxX + 1, round(groundY + 0.4));
    runRail('D-pond-rail-north', true, round(p.maxZ + 0.6), p.minX - 1, p.maxX + 1, round(groundY + 0.4));
    runRail('D-pond-rail-west', false, round(p.minX - 0.6), p.minZ, p.maxZ, round(groundY + 0.4));
    runRail('D-pond-rail-east', false, round(p.maxX + 0.6), p.minZ, p.maxZ, round(groundY + 0.4));

    // 5.5 汀步石桥（南岸 → 池心小岛，可通行；对应水体拦阻盒的缺口）
    const pavilion = slotById('D-court3-pavilion');
    const islandCenter = pavilion ? { x: pavilion.x, z: pavilion.z } : { x: walkX, z: round((p.minZ + p.maxZ) / 2) };
    const islandHalf = 9; // 池心岛 18×18 > 亭占地 14×14：四周留 2m 可站立环台，且岛北仍留 1m 水面
    const walk = stonePath({
      id: 'D-pond-walkway',
      name: '荷池汀步石桥',
      minX: round(walkX - walkwayHalf),
      maxX: round(walkX + walkwayHalf),
      minZ: round(p.minZ),
      maxZ: round(islandCenter.z - islandHalf),
      y: round(groundY + 0.02),
    });
    if (walk) waterFacts.walkway = { x: walkX, half: walkwayHalf, fromZ: round(p.minZ), toZ: round(islandCenter.z - islandHalf) };

    // 5.6 池心小岛（亭基座），比水面高，顶面与汀步齐平
    const island = terraceKit({
      id: 'D-pond-island',
      name: '荷池池心小岛（亭基座）',
      x: islandCenter.x,
      z: islandCenter.z,
      w: islandHalf * 2,
      d: islandHalf * 2,
      bounds: {
        minX: round(islandCenter.x - islandHalf),
        maxX: round(islandCenter.x + islandHalf),
        minZ: round(islandCenter.z - islandHalf),
        maxZ: round(islandCenter.z + islandHalf),
      },
      y0: round(waterY - depth),
      y1: round(groundY + 0.02),
      railing: false,
      detail: 'mid',
    });
    island.userData.zone = ZONE_ID;
    groups.water.add(island);
    waterFacts.island = { x: islandCenter.x, z: islandCenter.z, half: islandHalf, top: round(groundY + 0.02) };
    waterFacts.pond = { id: pond.id, bounds: { ...p }, waterY, depth, waterBodyId: pond.id };

    // 5.7 水体拦阻（layout 的水体障碍顶面 0.05 < 地坪 0.4，无法用垂直判定拦人）→ 按地面高度补 4 段，
    //     南边留出汀步缺口，让"池心亭 + 石桥"成为可走到的实景（与 E 的纯观赏水榭区分）
    //     拦阻盒 = 池面 \ （汀步走廊 ∪ 池心岛）：5 段覆盖全部水面，岛面与走廊保持可走
    const guardY = { y0: groundY, y1: round(groundY + playerHeight + stepHeight) };
    const islandWest = round(islandCenter.x - islandHalf);
    const islandEast = round(islandCenter.x + islandHalf);
    const islandSouth = round(islandCenter.z - islandHalf);
    const islandNorth = round(islandCenter.z + islandHalf);
    waterFacts.guard.push(
      { id: 'OB-D-pond-guard-west', bounds: { minX: p.minX, maxX: islandWest, minZ: p.minZ, maxZ: p.maxZ }, ...guardY },
      { id: 'OB-D-pond-guard-east', bounds: { minX: islandEast, maxX: p.maxX, minZ: p.minZ, maxZ: p.maxZ }, ...guardY },
      { id: 'OB-D-pond-guard-lane-west', bounds: { minX: islandWest, maxX: round(walkX - walkwayHalf), minZ: p.minZ, maxZ: islandSouth }, ...guardY },
      { id: 'OB-D-pond-guard-lane-east', bounds: { minX: round(walkX + walkwayHalf), maxX: islandEast, minZ: p.minZ, maxZ: islandSouth }, ...guardY },
    );
    if (p.maxZ > islandNorth + 0.05) {
      waterFacts.guard.push({
        id: 'OB-D-pond-guard-north',
        bounds: { minX: round(walkX - walkwayHalf), maxX: round(walkX + walkwayHalf), minZ: islandNorth, maxZ: p.maxZ },
        ...guardY,
      });
    }
  }

  /* ========================================================================
   * 5b. 室内陈设（kit.interiorSet 标准套件，t61 交付 · t62 接入）
   * ====================================================================== */

  const interiorSets = buildInteriorSets(ctx, groups.interiors, buildingFacts);
  const interiorLampAnchors = buildInteriorLampAnchors(ctx, interiorSets.facts);

  /* ========================================================================
   * 6. 摆件（灯位 + 铜器）与植被（实例化）
   * ====================================================================== */

  // 6.1 灯位：回显 layout 的 2 个中轴灯位 + 本区新增 7 处院落/池畔灯（id 前缀 LA-D-extra-，
  //     与 E 区同一约定：区域可按 §8.3 为自己的院落实现灯位）
  const baseAnchors = (zone.lightAnchors ?? []).map((a) => ({ ...a, position: { ...a.position } }));
  const extraAnchors = [];
  const addExtra = (index, x, z, role = 'gardenOrCourtLantern', height = 3.2) => {
    extraAnchors.push({
      id: `LA-D-extra-${String(index).padStart(2, '0')}`,
      zone: ZONE_ID,
      kind: 'lantern',
      position: { x: round(x), y: groundY, z: round(z) },
      height,
      role,
      note: '西苑院落/池畔宫灯（本区实现）',
    });
  };
  let extraIndex = 0;
  for (const courtyard of courtyards) {
    const gate = (courtyard.gates ?? []).map((id) => slotById(id)).find(Boolean);
    if (!gate) continue;
    extraIndex += 1;
    addExtra(extraIndex, gate.x - 7, gate.z + 7);
    extraIndex += 1;
    addExtra(extraIndex, gate.x - 7, gate.z - 7);
  }
  if (pond) {
    extraIndex += 1;
    addExtra(extraIndex, pond.bounds.minX - 3.5, pond.bounds.minZ - 3.5);
    extraIndex += 1;
    addExtra(extraIndex, pond.bounds.maxX + 3.5, pond.bounds.maxZ + 3.5);
  }
  const rearPavilion = slotById('D-court4-pavilion');
  if (rearPavilion) {
    extraIndex += 1;
    addExtra(extraIndex, rearPavilion.x + 9, rearPavilion.z - 9);
  }

  const lightAnchorsRaw = [...baseAnchors, ...extraAnchors, ...interiorLampAnchors];
  const lightAnchors = lightAnchorsRaw.map((anchor) => {
    // 内景灯的 y 取室内地面（`groundY`），其余按 floorYAt 实现
    const surface = anchor.id.includes('-interior-')
      ? anchor.position.y
      : (typeof helpers.floorYAt === 'function' ? helpers.floorYAt(anchor.position.x, anchor.position.z) : null);
    return { ...anchor, position: { x: anchor.position.x, y: num(surface) ? surface : anchor.position.y, z: anchor.position.z } };
  });

  const lanternKit = kitFactory(kit, 'lantern');
  const instanceFromPoints = kitFactory(kit, 'instanceFromPoints', { required: false });
  let lampBatches = 0;
  let lampInstanced = false;
  if (instanceFromPoints && lightAnchors.length > 1) {
    const prototype = lanternKit({
      id: 'D-lamp-prototype',
      name: '宫灯原型（实例化来源，不进场景）',
      x: 0, z: 0, y: 0,
      height: lightAnchors[0].height,
      kind: 'post',
      detail: PROP_DETAIL,
    });
    const parts = [];
    prototype.traverse((node) => { if (node.isMesh) parts.push(node); });
    for (const part of parts) {
      const instanced = instanceFromPoints(part.geometry, part.material, lightAnchors.map((a) => ({ x: a.position.x, y: a.position.y, z: a.position.z })), {
        name: `D-lamps:${part.userData?.part ?? 'part'}x${lightAnchors.length}`,
      });
      instanced.userData.zone = ZONE_ID;
      instanced.userData.part = part.userData?.part ?? 'lantern';
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      groups.props.add(instanced);
      lampBatches += 1;
    }
    lampInstanced = true;
  } else {
    for (const anchor of lightAnchors) {
      const mesh = lanternKit({ id: `D-lamp-${anchor.id}`, name: `宫灯 ${anchor.id}`, x: anchor.position.x, z: anchor.position.z, y: anchor.position.y, height: anchor.height, kind: 'post', detail: PROP_DETAIL });
      mesh.userData.zone = ZONE_ID;
      groups.props.add(mesh);
      lampBatches += 1;
    }
  }

  // 6.2 铜器：主屋之前成对陈鼎/炉（摆件语言；与 E 的水榭/影壁语汇不同）
  const bronzeKit = kitFactory(kit, 'bronze');
  const bronzeFacts = [];
  const bronzeGroundOffset = (kind, size) => (kind === 'censer' ? round(size * 0.12) : kind === 'vessel' ? round(size * 0.16) : 0);
  const placeBronze = (id, kind, size, x, z, y) => {
    const mesh = bronzeKit({ id, kind, size, x: round(x), z: round(z), y: round(y + bronzeGroundOffset(kind, size)), detail: PROP_DETAIL });
    mesh.userData.zone = ZONE_ID;
    groups.props.add(mesh);
    bronzeFacts.push({ id, kind, size, x: round(x), z: round(z) });
  };
  for (const [index, courtyard] of courtyards.entries()) {
    const hall = slots.find((s) => s.courtyard === courtyard.id && (s.kind === 'hall' || s.kind === 'sideHall'));
    const gate = (courtyard.gates ?? []).map((id) => slotById(id)).find(Boolean);
    if (hall) {
      // 主屋正面（朝东一侧）成对陈鼎
      placeBronze(`D-bronze-ding-${index + 1}-n`, 'vessel', 2.0, hall.x + hall.w / 2 + 3.5, hall.z + 8, groundY + hall.terraceH * 0.5);
      placeBronze(`D-bronze-ding-${index + 1}-s`, 'vessel', 2.0, hall.x + hall.w / 2 + 3.5, hall.z - 8, groundY + hall.terraceH * 0.5);
    }
    if (gate) {
      // 院门内成对小鼎（`censer` 的双手柄在 kit 里没有 detail 门槛，会多占 1 个绘制批次，
      // 故本区统一用 `vessel`：far 档下只有器身，与分区机位视距匹配；见回执 §2.5）
      placeBronze(`D-bronze-vessel-${index + 1}-n`, 'vessel', 1.4, gate.x - 5, gate.z + 9, groundY);
      placeBronze(`D-bronze-vessel-${index + 1}-s`, 'vessel', 1.4, gate.x - 5, gate.z - 9, groundY);
    }
  }

  // 6.3 植被：32 株（6 株花树），三带布置 —— 甬道列植 / 池畔 / 院角散植；同形制实例化
  const treeKit = kitFactory(kit, 'tree');
  const treeSpots = [];
  if (vegetation) {
    const localRng = (ctx.rng ?? { fork: () => Math }).fork ? ctx.rng.fork('trees') : null;
    const rng = localRng ?? {
      range: (a, b) => a + ((Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1 + 1) % 1 * (b - a),
      pick: (arr) => arr[0],
      int: (a) => a,
    };
    // 种植带（全部收在区域内侧 6m 以上，树冠不越界）：甬道列植 / 池畔 / 院角散植
    const bands = [
      { minX: -124, maxX: -115, minZ: -382, maxZ: 282 },
      { minX: -288, maxX: -281, minZ: -382, maxZ: 282 },
      { minX: -196, maxX: -118, minZ: 4, maxZ: 13 },
      { minX: -196, maxX: -118, minZ: 70, maxZ: 74 },
    ];
    for (const courtyard of courtyards) {
      const c = courtyard.bounds;
      bands.push(
        { minX: -288, maxX: -128, minZ: c.minZ + 10, maxZ: c.minZ + 34 },
        { minX: -288, maxX: -128, minZ: c.maxZ - 34, maxZ: c.maxZ - 10 },
      );
    }
    const blockers = [
      ...slots.map((s) => ({ bounds: s.bounds })),
      ...courtyardWalls.map((w) => ({ bounds: w.bounds })),
      ...corridorFacts.map((c) => ({
        bounds: {
          minX: Math.min(c.from.x, c.to.x) - c.width,
          maxX: Math.max(c.from.x, c.to.x) + c.width,
          minZ: Math.min(c.from.z, c.to.z) - c.width,
          maxZ: Math.max(c.from.z, c.to.z) + c.width,
        },
      })),
    ];
    const pondBounds = pond ? pond.bounds : null;
    let attempts = 0;
    while (treeSpots.length < vegetation.treeCount && attempts < vegetation.treeCount * 80) {
      attempts += 1;
      const band = bands[attempts % bands.length];
      const x = round(rng.range(band.minX, band.maxX));
      const z = round(rng.range(band.minZ, band.maxZ));
      if (blockers.some((entry) => insideBounds(entry.bounds, x, z, 5))) continue;
      if (pondBounds && insideBounds(pondBounds, x, z, 6)) continue;
      if (roads.some((road) => distanceToSegment(x, z, road.from, road.to) < road.width / 2 + 2)) continue;
      if (treeSpots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 11)) continue;
      treeSpots.push({ x, z, y: groundY });
    }
  }
  const treeFacts = [];
  const treeShape = PLANTS.canopyShapes[2] ?? PLANTS.canopyShapes[0]; // 层叠伞形（与 E 的单一树冠语言同源，布置不同）
  if (treeSpots.length > 0 && instanceFromPoints) {
    const heights = PLANTS.treeHeights;
    const levels = treeSpots.map((spot, index) => {
      const size = index % 5 === 0 ? 'large' : index % 3 === 0 ? 'small' : 'medium';
      return { ...spot, size, height: heights[size], blossom: index < (vegetation?.blossomCount ?? 0), scale: heights[size] / heights.medium };
    });
    const prototypes = [
      { key: 'trunk', blossom: false, height: heights.medium, scale: 1 },
      { key: 'canopy', blossom: false, height: heights.medium, scale: 1 },
      { key: 'canopy', blossom: true, height: heights.medium, scale: 1 },
    ];
    for (const prototypeSpec of prototypes) {
      const selection = prototypeSpec.blossom ? levels.filter((l) => l.blossom) : levels.filter((l) => !l.blossom);
      if (selection.length === 0) continue;
      const prototype = treeKit({
        id: `D-tree-prototype-${prototypeSpec.key}-${prototypeSpec.blossom ? 'blossom' : 'leaf'}`,
        name: '乔木原型（实例化来源）',
        x: 0, z: 0, y: 0,
        height: prototypeSpec.height,
        size: 'medium',
        canopyShape: treeShape,
        blossom: prototypeSpec.blossom,
        rngSeed: (vegetation?.rngSeed ?? config.SCENE_SEED) >>> 0,
        detail: 'mid',
      });
      const parts = [];
      prototype.traverse((node) => { if (node.isMesh) parts.push(node); });
      const part = parts.find((node) => (node.userData?.part ?? '').startsWith(prototypeSpec.key)) ?? parts[parts.length - 1];
      const instanced = instanceFromPoints(part.geometry, part.material, selection.map((l) => ({ x: l.x, y: l.y, z: l.z })), {
        name: `D-trees:${prototypeSpec.key}-${prototypeSpec.blossom ? 'blossom' : 'leaf'}x${selection.length}`,
        scaleAt: (i) => selection[i].scale,
        yawAt: (i) => (i * 2.399) % (Math.PI * 2),
      });
      instanced.userData.zone = ZONE_ID;
      instanced.userData.part = prototypeSpec.key;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      groups.props.add(instanced);
    }
    treeFacts.push(...levels.map((l) => ({ x: l.x, z: l.z, size: l.size, blossom: l.blossom })));
  } else {
    for (const [index, spot] of treeSpots.entries()) {
      const size = index % 5 === 0 ? 'large' : 'medium';
      const mesh = treeKit({
        id: `D-tree-${String(index + 1).padStart(2, '0')}`,
        name: `西苑乔木 ${index + 1}`,
        x: spot.x, z: spot.z, y: spot.y,
        height: PLANTS.treeHeights[size],
        size,
        canopyShape: treeShape,
        blossom: index < (vegetation?.blossomCount ?? 0),
        rngSeed: ((vegetation?.rngSeed ?? config.SCENE_SEED) + index * 7919) >>> 0,
        detail: 'mid',
      });
      mesh.userData.zone = ZONE_ID;
      groups.props.add(mesh);
      treeFacts.push({ x: spot.x, z: spot.z, size, blossom: index < (vegetation?.blossomCount ?? 0) });
    }
  }

  /* ========================================================================
   * 7. 合批 + 统计
   * ====================================================================== */

  let preMergePieces = 0;
  root.traverse((node) => { if (node.isMesh || node.isInstancedMesh) preMergePieces += 1; });

  let mergeStats = null;
  if (typeof kit.mergeZone === 'function') {
    mergeStats = kit.mergeZone(root, { name: 'D:batch' })?.stats ?? null;
  }
  // 审计口径（scripts/audit.mjs 的 measure() 不做 LOD.update()）：非当前 LOD 档预先置为不可见，
  // 与浏览器每帧只画一档的真实口径一致；本区建筑为单档，通常没有 LOD 节点。
  let lodNodes = 0;
  let lodHidden = 0;
  root.traverse((node) => {
    if (!node.isLOD) return;
    lodNodes += 1;
    node.levels.forEach((level, index) => {
      if (index === 0 || !level.object || level.object.visible === false) return;
      level.object.visible = false;
      lodHidden += 1;
    });
  });

  const postMergeDrawCalls = typeof kit.countDrawCalls === 'function' ? kit.countDrawCalls(root) : null;
  const triangles = typeof kit.countTriangles === 'function' ? kit.countTriangles(root) : null;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);

  /* ========================================================================
   * 8. 契约数据（回显 layout + 本区自有边界）
   * ====================================================================== */

  const connectors = (zone.connectors ?? []).map((c) => ({ ...c, position: { ...c.position } }));

  // 障碍：layout 条目（y0 下钳到地坪，避免"从建筑下方穿入"）+ 池体地面拦阻 + 院墙实心段
  const obstacles = [
    ...layoutObstacles.map((o) => ({ ...o, bounds: { ...o.bounds }, door: o.door ? { ...o.door, center: { ...o.door.center } } : null, y0: Math.min(o.y0, groundY) })),
    ...waterFacts.guard.map((guard) => ({
      id: guard.id,
      sourceType: 'water',
      zone: ZONE_ID,
      buildingId: waterFacts.pond?.waterBodyId ?? 'WB-D-pond',
      bounds: { ...guard.bounds },
      y0: guard.y0,
      y1: guard.y1,
      blocks: 'all',
      door: null,
      note: '荷池地面高度拦阻（layout 水体障碍顶面低于地坪，无法用垂直判定拦人）；南岸留出汀步缺口',
    })),
    ...wallObstacles,
  ];

  const colliders = {
    obstacles,
    walkable: (zone.walkable ?? []).map((w) => ({ ...w, bounds: { ...w.bounds } })),
    ramps: rampsFromRoads(roads).map((r) => ({ ...r, from: { ...r.from }, to: { ...r.to } })),
  };

  const viewpoints = (zone.viewpoints ?? []).map((v) => ({ ...v, position: { ...v.position }, target: { ...v.target } }));

  const stats = {
    zone: ZONE_ID,
    zoneVersion: ZONE_VERSION,
    kind: ZONE_KIND,
    quality: ctx.quality ?? config.QUALITY.default,
    groundY,
    buildings: buildings.length,
    buildingsByKind: buildings.reduce((acc, s) => { acc[s.kind] = (acc[s.kind] ?? 0) + 1; return acc; }, {}),
    courtyards: courtyards.length,
    connectors: connectors.length,
    obstacles: obstacles.length,
    walkable: colliders.walkable.length,
    ramps: colliders.ramps.length,
    viewpoints: viewpoints.length,
    lightAnchors: lightAnchors.length,
    baseLightAnchors: baseAnchors.length,
    extraLightAnchors: extraAnchors.length,
    courtyardWalls: courtyardWalls.length,
    corridors: corridorFacts.length,
    pavingSlabs: pavingFacts.length,
    interiorSets: interiorSets.facts.length,
    interiorFacts: interiorSets.facts,
    interiorKitAvailable: interiorSets.available,
    roadSegments: roadFacts.length,
    trees: treeFacts.length,
    blossom: treeFacts.filter((t) => t.blossom).length,
    treeInstanced: treeSpots.length > 0 && Boolean(instanceFromPoints),
    lampInstanced,
    lampBatches,
    bronze: bronzeFacts.length,
    water: waterFacts,
    drawCalls: { preMerge: preMergePieces, postMerge: postMergeDrawCalls, merge: mergeStats },
    triangles,
    bounds: {
      minX: round(box.min.x), maxX: round(box.max.x),
      minY: round(box.min.y), maxY: round(box.max.y),
      minZ: round(box.min.z), maxZ: round(box.max.z),
    },
    buildingFacts,
    details: {
      buildingIds: buildings.map((s) => s.id),
      wallFacts,
      corridorFacts,
      roadFacts,
      pavingFacts,
      treeFacts,
      bronzeFacts,
      lightAnchors: lightAnchors.map((a) => ({ id: a.id, x: a.position.x, y: a.position.y, z: a.position.z })),
    },
  };

  let elapsedSeen = 0;
  return {
    root,
    buildings,
    connectors,
    colliders,
    viewpoints,
    lightAnchors,
    /**
     * 只累计时间：池面微波、灯焰、烟雾全部由 `src/core/environment.js` 的统一系统驱动
     * （CONTRACTS §3.3 / §8.3：区域不得另建第二套灯光系统或第二套水面动画）。
     */
    update(dtSeconds /* , elapsedSeconds, state */) {
      if (num(dtSeconds)) elapsedSeen += dtSeconds;
    },
    /** 只释放本区自有几何（`userData.kitOwned`）；kit 共享材质/贴图由 t3 + core 管理，绝不在此销毁。 */
    dispose() {
      const seen = new Set();
      root.traverse((node) => {
        const geometry = node.geometry;
        if (!geometry || seen.has(geometry)) return;
        if (geometry.userData?.kitOwned !== true) return;
        seen.add(geometry);
        geometry.dispose();
      });
      root.clear();
    },
    stats,
    get elapsedSeen() {
      return elapsedSeen;
    },
  };
}

export default createZone;
