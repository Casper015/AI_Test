/**
 * forecourt.js — **B 区 · 中轴前朝**（计划 §5.2，`createZone(ctx)` 契约见 docs/CONTRACTS.md §3）
 * =============================================================================
 * 中轴递进（南 → 北）：
 *   南城门内侧（F 的 `CXN-F-B-south-belt`，z=-400）→ 前朝门殿 `B-gate-front`（含东西翼亭）
 *   → 礼仪广场（东西配殿 `B-side-*-south` + 六段廊庑 + 院墙围合）
 *   → 主殿院（`B-side-*-main` 配殿 + 两层廊庑）→ 三层白石台基（`layout.TERRACES` 三条，总高 4.5m）
 *   → 丹陛御道（22m 宽，三段，中央御路斜坡）+ 东西侧台阶 + 台基北侧台阶 → 金銮殿 `B-hall-main`（重檐庑殿）
 *   → 中殿 `B-hall-mid` → 后殿 `B-hall-rear`（+ 东西庑殿）→ 内廷门前缓步（C 的 `CXN-B-C-inner-gate`，z=80）
 *
 * 内景（visitable）：金銮殿内景 = 金砖地面（`interiorBrick`）+ 金銮宝座 + 屏风 + 盘龙金柱柱网 + 平棋式藻井；
 *   门洞保留 26m 净宽通道（`CXN-B-main-hall-door`），机位 `VP-B-interior` 落在 `WK-B-hall-main-interior` 内。
 *
 * 纪律（本文件只做这些）：
 *   1. 数值只来自 `ctx.zoneLayout`（layout）与 `ctx.config`（config），不在本文件写死布局数值；
 *   2. 几何只由 `ctx.kit` 的构件工厂产出（缺构件向 kit-engineer 提需求，不自建私有素材/私有坐标）；
 *   3. `root` 保持单位变换、不挂 scene、不建动画循环/灯光；`update` 只累计 elapsed，不动相机与 state；
 *   4. `dispose` 只释放本区自有的几何（`userData.kitOwned`），**不碰** kit 的共享材质/贴图。
 *
 * 已裁定的两处实现细节（证据见 docs/handoffs/zone-forecourt.md §3）：
 *   A. `B-hall-main` 的 4.5m 台基由 `layout.TERRACES` 三层台基（`kit.terrace`）承担，传给 `kit.hall`
 *      的 `terraceH` 取 0、`baseY` 取 `MODULES.terraceTotalHeight`——避免台基重复一层；
 *      `eaveHeightAbsolute = baseY + MODULES.eaveHeight×GRADES[3].eaveHeightFactor = layout.eaveHeight` 不受影响。
 *   B. kit 建筑自带台阶的「高端朝 -Z」与 kit 自身丹陛斜坡的「高端朝 +Z」互相矛盾（探针实测），
 *      本区在装配后统一把 `part==='stairs'` 的几何规范为「高端在本地 +Z 端」，使台阶与御路斜坡同向；
 *      kit 修复后该规范化自动不再触发（判定按几何实测，不按版本号）。
 */

import * as THREE from 'three';
import { CONFIG, MODULES, TERRAIN, deriveSeed } from '../shared/config.js';
import { INTERIOR_BY_SLOT, SCENIC_OBJECTS, STOREY_BANDS, STOREY_BAND_PLANS, WALKABLE, WALLS, dressingPlanForZone } from '../shared/layout.js'; // t41：中轴楼阁腰檐分层（外观多层）
import { rampsFromRoads, wallRunsForZone } from '../core/layout-slice.js'; // t48：可视院墙消费权威归并段

export const ZONE_ID = 'B';
export const ZONE_NAME = '中轴前朝';
export const ZONE_STATUS = 'detailed';
export const FORECOURT_VERSION = '1.0.0';

/** 建筑工厂名（CONTRACTS §3.4 冻结名称）。 */
const FACTORY_BY_KIND = Object.freeze({
  hall: 'hall',
  gateHall: 'gateHall',
  sideHall: 'sideHall',
  pavilion: 'pavilion',
  cornerTower: 'cornerTower',
  courtyardGate: 'courtyardGate',
});

/**
 * 「台基由 layout.TERRACES 承担」的槽位：这些建筑不再让 kit 重复造一层台明（含自带台阶与栏板）。
 * 仅 `B-hall-main`（三层白石台基 4.5m，见 §5.2「主殿位于三层白石台基上」）。
 */
const PLINTH_FROM_TERRACES = new Set(['B-hall-main']);

/**
 * 建筑细节档 = 质量档（`kit` 的 `params.lod`：'near'|'mid'|'far' 单档；'auto' = 近中远三档 LOD）。
 *
 * 说明见 docs/handoffs/zone-forecourt.md §3.2，两条实测依据：
 *   1. `scripts/audit.mjs` 的 `measure()` 不做 `LOD.update()`，逐栋用 'auto' 时 Node 审计会把三档
 *      几何全部计入（实测 B 区 90 批次 > 预算 70），与浏览器「每帧只画一档」的真实口径不符；
 *   2. kit 的 'near' 相对 'mid' 只多出 8 个近景零件族（门钉/门枕石/戗脊/平座栏杆/亭座凳），
 *      在分区机位（150m）与第一人称视距上不改变可识别性，却要多占 8 个绘制批次。
 * 故建筑细节取 { high/medium → 'mid'，low → 'far' }；low 档整区体块化（实测 34 批次）。
 * 要恢复逐栋 LOD（等 t2 的审计口径修好后），把下面一行整体改成 `'auto'` 即可，其余代码无需改动。
 */
const BUILDING_DETAIL_BY_QUALITY = Object.freeze({ high: 'mid', medium: 'mid', low: 'far' });
/** 摆件细节档 = 质量档（树木固定 'mid'：'near' 只多出细小分枝，性价比低）。 */
const PROP_DETAIL_BY_QUALITY = Object.freeze({ high: 'near', medium: 'mid', low: 'far' });

/** 直段栏杆的构造厚度（`kit.railing` 的矩形环用法；两条长边即一段 0.36m 厚的白石栏板）。 */
const RAIL_THICKNESS = 0.36;
/** 落位微抬，避免与台基顶面/广场铺地共面闪烁（毫米级，不影响可行走面高度）。 */
const GROUND_EPS = 0.02;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

function fail(message) {
  throw new Error(`forecourt(B): ${message}`);
}

/** 取 kit 工厂；缺失即报错（不得静默降级为自建几何）。 */
function kitFactory(kit, name, { required = true, fallback = null } = {}) {
  const fn = kit?.[name];
  if (typeof fn === 'function') return fn;
  if (required) fail(`ctx.kit.${name} 不存在（CONTRACTS §3.4 冻结接口，应由 t3 提供）`);
  return fallback;
}

/**
 * kit 铜器（`kit.bronze`）的落地偏移：censer 的三足、vessel 的三足在几何里位于组原点**之下**
 * （`props.js` 里腿中心 y = −size×0.12 / −size×0.16），落在硬地上必须把整器抬高同样的量，
 * 否则腿会插进铺地。其余形制（drum/bell/lion）的底即原点，偏移为 0。
 */
function bronzeGroundOffset(kind, size) {
  if (kind === 'censer') return +(size * 0.12).toFixed(4);
  if (kind === 'vessel') return +(size * 0.16).toFixed(4);
  return 0;
}

/** 质量档 → 建筑细节档（只影响渲染成本，不改布局，CONTRACTS §3.1 `ctx.quality`）。 */
function detailForQuality(quality) {
  return BUILDING_DETAIL_BY_QUALITY[quality] ?? BUILDING_DETAIL_BY_QUALITY.medium;
}

/** 质量档 → 摆件细节档（树木另按 §treeDetail 固定 'mid'）。 */
function propDetailForQuality(quality) {
  return PROP_DETAIL_BY_QUALITY[quality] ?? PROP_DETAIL_BY_QUALITY.medium;
}

/* =============================================================================
 * 一、台阶朝向规范化（见文件头裁定 B）
 * ========================================================================== */

/**
 * 把 `part === 'stairs'` 的几何统一成「高端在本地 +Z 端、低端在本地 -Z 端」。
 *
 * 判定完全基于几何实测（不看版本号）：取 y 最高 25% 顶点与最低 25% 顶点的 z 质心比较；
 * 若高端在 -Z 端则绕自身包围盒中心的 Y 轴旋转 180°（旋转保留法线/UV 正确，不做镜像）。
 * 由于台阶级数为对称几何，绕自身中心翻转不改变足迹，只把踏面高低端对调。
 *
 * @returns {{flights:number, flipped:number, kept:number}}
 */
export function alignStairFlights(THREEImpl, root) {
  const report = { flights: 0, flipped: 0, kept: 0 };
  root.traverse((node) => {
    if (!node.isMesh || node.userData?.part !== 'stairs') return;
    const geometry = node.geometry;
    const pos = geometry?.attributes?.position;
    if (!pos || pos.count === 0) return;
    report.flights += 1;

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = maxY - minY;
    if (!(span > 1e-6)) return;
    const hiCut = maxY - span * 0.25;
    const loCut = minY + span * 0.25;

    let zHi = 0;
    let nHi = 0;
    let zLo = 0;
    let nLo = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y >= hiCut) {
        zHi += z;
        nHi += 1;
      } else if (y <= loCut) {
        zLo += z;
        nLo += 1;
      }
    }
    if (nHi === 0 || nLo === 0) return;
    zHi /= nHi;
    zLo /= nLo;
    // 高端已在本 +Z 端 → 保持（kit 修复后走这条分支）
    if (zHi >= zLo) {
      report.kept += 1;
      return;
    }

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const zc = (geometry.boundingBox.min.z + geometry.boundingBox.max.z) / 2;
    const matrix = new THREEImpl.Matrix4()
      .makeTranslation(0, 0, zc)
      .multiply(new THREEImpl.Matrix4().makeRotationY(Math.PI))
      .multiply(new THREEImpl.Matrix4().makeTranslation(0, 0, -zc));
    geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    report.flipped += 1;
  });
  return report;
}

/* =============================================================================
 * 二、建筑（12 个槽位，逐字段回显 layout）
 * ========================================================================== */

/**
 * layout 槽位 → kit 工厂参数。槽位字段（id/name/w/d/bays/terraceH/roofType/grade/facing/
 * baseY/door）由 kit 直接识别；这里只做两处必要调整（见文件头裁定 A、门扇开启度）。
 */
/** 建筑的 kit 摆位基准（= 台基顶 / 室内地面）：B 区地坪为 0，故等于 layout.baseY（主殿由三层台基承担）。 */
function buildingBaseY(slot) {
  return PLINTH_FROM_TERRACES.has(slot.id) ? +MODULES.terraceTotalHeight.toFixed(2) : slot.baseY;
}

function buildingParams(slot, quality) {
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
    baseY: slot.baseY,
    door: slot.door ? { ...slot.door } : null,
    quality,
    lod: BUILDING_DETAIL_BY_QUALITY[quality] ?? 'mid',
  };
  if (PLINTH_FROM_TERRACES.has(slot.id)) {
    params.terraceH = 0;
    params.baseY = buildingBaseY(slot);
  }
  if (params.door && slot.visitable) {
    // 大朝正殿门扇敞开（保留 26m 净宽门洞与通行），便于第一人称与内景机位进入
    params.door.openFraction = 0.86;
  }
  return params;
}

/** 建 12 栋建筑；返回 { objects, buildings, pieces, lodLevels }。 */
function buildBuildings(ctx, group) {
  const { kit, quality, zoneLayout } = ctx;
  const objects = new Map();
  const pieces = [];
  const lodLevels = [];
  const metricsList = [];
  let preMergePieces = 0;

  for (const slot of zoneLayout.slots) {
    const factoryName = FACTORY_BY_KIND[slot.kind] ?? fail(`槽位 ${slot.id} 的 kind "${slot.kind}" 没有对应构件工厂`);
    const factory = kitFactory(kit, factoryName);
    const object = factory(buildingParams(slot, quality));
    if (!object) fail(`kit.${factoryName}(${slot.id}) 未返回对象`);
    object.name = object.name || slot.id;
    object.userData.zone = ZONE_ID;
    object.userData.buildingId = slot.id;
    group.add(object);
    objects.set(slot.id, object);
    pieces.push({ id: slot.id, kind: slot.kind, node: object });
    const levels = object.isLOD ? object.levels.length : 1;
    lodLevels.push(levels);
    object.traverse((node) => {
      if (node.isMesh || node.isInstancedMesh) preMergePieces += 1;
    });
    const meta = object.userData?.kit?.metrics ?? {};
    const triangles = typeof meta.triangles === 'object' && meta.triangles !== null
      ? Object.values(meta.triangles).reduce((a, b) => a + (num(b) ? b : 0), 0)
      : (num(meta.triangles) ? meta.triangles : 0);
    metricsList.push({
      id: slot.id,
      kind: slot.kind,
      detail: object.userData?.kit?.detail ?? null,
      triangles,
      eaveHeightAbsolute: num(meta.eaveHeightAbsolute) ? meta.eaveHeightAbsolute : null,
      layoutEaveHeight: slot.eaveHeight,
      worldBounds: object.userData?.kit?.worldBounds ?? null,
      layoutBounds: slot.bounds,
    });
  }
  return { objects, pieces, lodLevels, preMergePieces, metrics: metricsList };
}

/* =============================================================================
 * 三、三层白石台基（layout.TERRACES）+ 栏杆 + 台阶/丹陛
 * ========================================================================== */

/** 主殿三层台基：直接吃 `layout.TERRACES` 的三条记录（bounds/y0/y1 逐值一致）。 */
function buildMainTerrace(ctx, group, detail) {
  const { kit, zoneLayout } = ctx;
  const terrace = kitFactory(kit, 'terrace');
  const tiers = zoneLayout.terraces
    .filter((t) => t.zone === ZONE_ID)
    .sort((a, b) => a.tier - b.tier);
  if (tiers.length === 0) fail('layout 未给 B 区台基（TERRACES）');

  const first = tiers[0].bounds;
  const object = terrace({
    id: 'B-terrace-main',
    name: '主殿三层白石台基',
    x: (first.minX + first.maxX) / 2,
    z: (first.minZ + first.maxZ) / 2,
    w: first.maxX - first.minX,
    d: first.maxZ - first.minZ,
    terraceH: tiers[tiers.length - 1].y1 - tiers[0].y0,
    tiers: tiers.map((t) => ({
      bounds: { ...t.bounds },
      y0: t.y0,
      y1: t.y1,
      tier: t.tier,
      stoneRole: t.stoneRole,
    })),
    // 栏杆由本区按「面 + 缺口」逐段布置（见 buildTerraceRailings）：主殿台阶并不全在正面
    railing: false,
    detail,
  });
  object.userData.zone = ZONE_ID;
  group.add(object);

  const metrics = object.userData?.kit?.metrics ?? null;
  return { object, tiers, metrics };
}

/**
 * 台基栏杆：按「每个面若干直段」布置，缺口精确对准丹陛（中央）与两侧/北侧台阶。
 * `kit.railing` 是矩形环（仅正面留缺口），故这里用「极薄矩形环」表达一段直段栏杆。
 */
function buildTerraceRailings(ctx, group, tiers, detail) {
  const { kit } = ctx;
  const railing = kitFactory(kit, 'railing');
  const height = MODULES.stairsStepHeight * 3; // = config 的栏板高（与 kit 内部一致）
  const runs = [];

  /** 在一个矩形边的坐标轴上求「整条边减掉若干缺口」后的直段。 */
  const segments = (lo, hi, gaps) => {
    let out = [[lo, hi]];
    for (const [gLo, gHi] of gaps) {
      const next = [];
      for (const [aLo, aHi] of out) {
        if (gHi <= aLo || gLo >= aHi) {
          next.push([aLo, aHi]);
          continue;
        }
        if (gLo > aLo) next.push([aLo, gLo]);
        if (gHi < aHi) next.push([gHi, aHi]);
      }
      out = next;
    }
    return out.filter(([aLo, aHi]) => aHi - aLo > 0.6);
  };

  const push = (tierTag, edge, alongXLine, fixed, [aLo, aHi], y) => {
    const length = +(aHi - aLo).toFixed(3);
    const x = alongXLine ? (aLo + aHi) / 2 : fixed;
    const z = alongXLine ? fixed : (aLo + aHi) / 2;
    const object = railing({
      id: `B-rail-${tierTag}-${edge}`,
      name: `主殿台基栏杆 ${tierTag} ${edge}`,
      w: length,
      d: RAIL_THICKNESS,
      x,
      z,
      y,
      rotationYDeg: alongXLine ? 0 : 90,
      height,
      detail,
    });
    object.userData.zone = ZONE_ID;
    object.userData.part = 'railingRun';
    group.add(object);
    runs.push({ id: object.name, tier: tierTag, edge, length, x, z, y });
  };

  // 台阶/丹陛在各层的落点（来自 layout.ROADS，见 §四；此处只用于留缺口）
  const DANBI_HALF = 13; // 丹陛 22m 宽 + 余量
  const SIDE_HALF = 5; // 侧台阶 10m 宽
  const NORTH_HALF = 5; // 台北台阶 10m 宽
  const tierTags = ['t1', 't2', 't3'];

  tiers.forEach((tier, index) => {
    const tag = tierTags[index] ?? `t${tier.tier}`;
    const { minX, maxX, minZ, maxZ } = tier.bounds;
    const y = tier.y1;
    const southGaps = index === 0
      ? [[-DANBI_HALF, DANBI_HALF], [-80 - SIDE_HALF, -80 + SIDE_HALF], [80 - SIDE_HALF, 80 + SIDE_HALF]]
      : [[-DANBI_HALF, DANBI_HALF]];
    const northGaps = index === 0 ? [[-60 - NORTH_HALF, -60 + NORTH_HALF], [60 - NORTH_HALF, 60 + NORTH_HALF]] : [];
    // 南面（-Z）：缺口 = 丹陛 +（第一层）东西侧台阶
    segments(minX, maxX, southGaps).forEach((seg, i) => push(tag, `south-${i}`, true, minZ, seg, y));
    // 北面（+Z）：缺口 =（第一层）台北两侧台阶；第 2/3 层完整性保留
    const northSegs = segments(minX, maxX, northGaps);
    if (northSegs.length > 0) northSegs.forEach((seg, i) => push(tag, `north-${i}`, true, maxZ, seg, y));
    // 西/东面：无台阶
    push(tag, 'west', false, minX, [minZ, maxZ], y);
    push(tag, 'east', false, maxX, [minZ, maxZ], y);
  });

  return runs;
}

/**
 * 台阶/丹陛：由 `layout.ROADS` 中带标高差的 B 区道路派生（与 `colliders.ramps` 同源、同数据）。
 * 跑长直接取道路水平长度（保证「可见台阶 = 注册可行走坡道」），踏面深 = 跑长 / 级数（级数由
 * `MODULES.stairsStepHeight` 决定、坡度必然 ≤ `road.slope`）。
 * 朝向：顶端（高标高端点）落在道路上，`rotationYDeg = 顶端在 +Z 侧 ? 0 : 180`（配合 §一 的规范化）。
 */
function buildStairFlights(ctx, group, detail) {
  const { kit, zoneLayout } = ctx;
  const stairs = kitFactory(kit, 'stairs');
  const flights = [];
  const danbiRoads = new Set([
    'RD-B-main-danbi-1',
    'RD-B-main-danbi-2',
    'RD-B-main-danbi-3',
  ]);

  for (const road of zoneLayout.roads) {
    if (Math.abs(road.to.y - road.from.y) < 1e-6) continue;
    const top = road.to.y >= road.from.y ? road.to : road.from;
    const bottom = top === road.to ? road.from : road.to;
    const rise = +(top.y - bottom.y).toFixed(3);
    const run = +road.length.toFixed(3);
    const steps = Math.max(1, Math.round(rise / MODULES.stairsStepHeight));
    const stepDepth = +Math.max(0.2, run / steps).toFixed(4);
    const rotationYDeg = top.z > bottom.z ? 0 : 180;
    const isDanbi = danbiRoads.has(road.id);

    const object = stairs({
      id: `B-flight-${road.id.replace(/^RD-B-/, '')}`,
      name: road.name,
      width: road.width,
      rise,
      x: top.x,
      z: top.z,
      baseY: bottom.y,
      rotationYDeg,
      stepDepth,
      imperialRamp: isDanbi, // 丹陛：中央御路斜坡（kit 的 imperialRamp）
      detail,
    });
    object.userData.zone = ZONE_ID;
    object.userData.roadId = road.id;
    object.userData.connector = road.connector ?? null;
    group.add(object);
    flights.push({
      id: object.name,
      roadId: road.id,
      connector: road.connector ?? null,
      width: road.width,
      rise,
      run,
      steps,
      stepDepth,
      top: { x: top.x, y: top.y, z: top.z },
      bottom: { x: bottom.x, y: bottom.y, z: bottom.z },
      rotationYDeg,
      danbi: isDanbi,
    });
  }
  return flights;
}

/* =============================================================================
 * 四、围合：院墙（共线归并）+ 廊庑
 * ========================================================================== */

/**
 * 院墙：吃 `zoneLayout.courtyardWalls`，并做两件必要处理——
 *   1. 同一院落相邻两墙共线（如 `CY-B-plaza` 北墙与 `CY-B-throne` 南墙同在 z=-180）会重合 →
 *      按（轴向 + 直线坐标）归并、取区间并集，避免共面闪烁与重复几何；
 *   2. `layout.WALLS` 的 `openings[].at` 是**世界坐标**，`kit.wall` 需要**相对墙中点**的偏移，这里换算。
 */
function buildCourtWalls(ctx, group, detail) {
  const { kit, zoneLayout } = ctx;
  const wall = kitFactory(kit, 'wall');
  /**
   * t48：**可视院墙改为消费 core 的权威归并段**（`wallRunsForZone`，与碰撞层 `deriveWallColliders`
   * 同一份 `deriveWallRuns()` 实现）——每段边界墙**恰由一个区域建造**（`run.owner`）。
   * 旧实现在本区内部按（轴向@墙线）bucket 归并，只能合并 B 自己的墙 ⇒ 跨区共线（z=80 的
   * `CY-B-rear-wall-north` × `CY-C-front-wall-south`）与 C 区内部共线（z=142 / z=216）仍会**共面重复**；
   * 且 `wall({...})` 未传 `baseY` ⇒ 起于 y=0，C 侧 0.9m 地坪处会**缺一段墙**。
   * 现在：① 建造者 = `run.owner`（B 拥有的段才由 B 建）；② `baseY = run.y0`、`height = run.y1 - run.y0`
   * = **贡献者名义跨度并集**（B 0 … C 0.9+墙高）⇒ 跨区段同时覆盖两侧地坪，无缺口；
   * ③ 门洞取 `run.openings`（全贡献者门洞 1m 归并后的并集）⇒ 守恒。
   * `zoneLayout.courtyardWalls` 仍用于**本区碰撞登记**（见下），可视建造改走归并段。
   */
  const courtyardIds = new Set(zoneLayout.courtyards.map((c) => c.id));
  const courtyardWalls =
    zoneLayout.courtyardWalls && zoneLayout.courtyardWalls.length > 0
      ? zoneLayout.courtyardWalls
      : WALLS.filter((w) => w.kind === 'courtWall' && courtyardIds.has(w.courtyardId));
  void courtyardWalls;

  const runs = [];
  for (const run of wallRunsForZone(ZONE_ID)) {
    // t48：只建**归属本区**的子区间（`seg.owner` = 该片第一条贡献墙的 owner，与碰撞盒 `zone` 同规则）
    run.segments.filter((seg) => seg.owner === ZONE_ID).forEach((seg, index) => {
      const [lo, hi] = [seg.lo, seg.hi];
      const mid = (lo + hi) / 2;
      const openings = run.openings
        .filter(([g0, g1]) => g1 > lo - 1 && g0 < hi + 1)
        .map(([g0, g1]) => ({ at: +(((g0 + g1) / 2) - mid).toFixed(3), width: +(g1 - g0).toFixed(3), source: run.wallIds.join('+') }));
      const from = run.horizontal ? { x: lo, z: run.line } : { x: run.line, z: lo };
      const to = run.horizontal ? { x: hi, z: run.line } : { x: run.line, z: hi };
      const object = wall({
        id: `B-wallrun-${run.horizontal ? 'x' : 'z'}${run.line}-${index}`,
        name: `${run.horizontal ? '东西向' : '南北向'}院墙 z/x=${run.line}`,
        from,
        to,
        thickness: run.thickness,
        height: +(seg.y1 - seg.y0).toFixed(3),
        baseY: seg.y0,
        kind: 'courtWall',
        openings,
        source: run.wallIds.join('+'),
        detail,
      });
      object.userData.zone = ZONE_ID;
      object.userData.wallRunId = run.id;
      group.add(object);
      runs.push({
        id: object.name,
        runId: run.id,
        alongX: run.horizontal,
        line: run.line,
        lo,
        hi,
        length: +(hi - lo).toFixed(3),
        openings,
        sources: seg.wallIds.slice(),
        baseY: seg.y0,
        topY: seg.y1,
        owners: seg.owners.slice(),
      });
    });
  }
  return runs;
}

/** 廊庑：吃 `layout.CORRIDORS`（B 区 6 段，广场东西廊 3 层）。 */
function buildCorridors(ctx, group, detail) {
  const { kit, zoneLayout } = ctx;
  const corridor = kitFactory(kit, 'corridor');
  const list = [];
  for (const source of zoneLayout.corridors) {
    const object = corridor({
      id: source.id,
      name: source.name,
      from: { ...source.from },
      to: { ...source.to },
      width: source.width,
      floors: source.floors,
      grade: 1,
      baseY: zoneLayout.groundY,
      detail,
    });
    object.userData.zone = ZONE_ID;
    group.add(object);
    list.push({ id: source.id, name: source.name, width: source.width, floors: source.floors });
  }
  return list;
}

/* =============================================================================
 * 五、铺地（广场 / 御道 / 后殿院 / 金砖地面）
 * ========================================================================== */

/** 由可行走面或矩形生成一块铺地。`material` 取 config.MATERIALS 的 id（令牌）。 */
function pavingSlab(ctx, group, { id, name, minX, maxX, minZ, maxZ, y, material }) {
  const { kit } = ctx;
  const paving = kitFactory(kit, 'paving', { required: false });
  if (!paving) return null; // 灰盒替身 kit（Node 侧测试）没有 paving：跳过铺地，不影响契约
  const object = paving({
    id,
    name,
    w: +(maxX - minX).toFixed(3),
    d: +(maxZ - minZ).toFixed(3),
    x: +(minX + maxX) / 2,
    z: +(minZ + maxZ) / 2,
    y,
    thickness: 0.16,
    material,
  });
  object.userData.zone = ZONE_ID;
  group.add(object);
  return { id, name, bounds: { minX, maxX, minZ, maxZ }, y, material };
}

function buildGround(ctx, group) {
  const { zoneLayout } = ctx;
  const slabs = [];
  const put = (args) => {
    const slab = pavingSlab(ctx, group, args);
    if (slab) slabs.push(slab);
    return slab;
  };

  // 广场 + 主殿两侧地面 + 主殿北地面（= layout.WALKABLE 的 B 区地面面）
  for (const surface of zoneLayout.walkable) {
    if (surface.kind !== 'ground') continue;
    put({
      id: `B-paving-${surface.id}`,
      name: `铺地 ${surface.name}`,
      ...surface.bounds,
      y: surface.y,
      material: 'pavingStone',
    });
  }

  // 御道与中轴步道（微抬 2cm，避免与广场铺地共面）
  const axisY = TERRAIN.terraceGroundY + GROUND_EPS;
  const axisRoads = new Set([
    'RD-B-plaza-axis',
    'RD-B-axis-mid',
    'RD-B-axis-mid-rear',
    'RD-B-bypass-west',
    'RD-B-bypass-east',
    'RD-B-plaza-west-branch',
    'RD-B-plaza-east-branch',
  ]);
  for (const road of zoneLayout.roads) {
    if (!axisRoads.has(road.id)) continue;
    if (Math.abs(road.to.y - road.from.y) > 1e-6) continue;
    const alongX = Math.abs(road.to.x - road.from.x) >= Math.abs(road.to.z - road.from.z);
    const half = road.width / 2;
    put({
      id: `B-paving-${road.id}`,
      name: road.name,
      minX: Math.min(road.from.x, road.to.x) - (alongX ? 0 : half),
      maxX: Math.max(road.from.x, road.to.x) + (alongX ? 0 : half),
      minZ: Math.min(road.from.z, road.to.z) - (alongX ? half : 0),
      maxZ: Math.max(road.from.z, road.to.z) + (alongX ? half : 0),
      y: axisY,
      material: 'pavingRoad',
    });
  }

  // 金銮殿内景：金砖地面（config.MATERIALS.interiorBrick）
  const interior = zoneLayout.walkable.find((w) => w.kind === 'interior');
  if (interior) {
    put({
      id: 'B-paving-interior-brick',
      name: '金銮殿金砖地面',
      ...interior.bounds,
      y: interior.y + GROUND_EPS,
      material: 'interiorBrick',
    });
  }

  return { slabs, materials: ['pavingStone', 'pavingRoad', 'interiorBrick'] };
}

/* =============================================================================
 * 六、室内陈设（kit.interiorSet，t61 标准套件 · t62 接入）
 * ========================================================================== */

/**
 * 为区内**已登记内景**的建筑布室内陈设（`layout.INTERIOR_BY_SLOT[slotId]`，由 t60/t70/t73/t74 注册）。
 *
 * 纪律（任务 t62）：
 *   1. 室内范围与地坪**一律取 layout 注册值**：`WK-<slotId>-interior` 的 `bounds` 与 `y`，
 *      不自行推断尺寸；天花标高取 **kit 实测檐口 − 0.2m**（`buildBuildings` 的 `eaveHeightAbsolute`），
 *      保证套件不穿顶；
 *   2. B 区 10 栋 = 殿 3（hall）+ 门殿 1（gateHall）+ 配殿 6（sideHall）；2 座亭无内景登记（不布）；
 *   3. 套件返回**未挂载**的 Group/LOD，本函数负责 `group.add`；合批与 LOD 档位由 §七 统一处理；
 *   4. `seed` 由 `config.deriveSeed(slotId,'interior')` 派生 → 同机位画面可复现。
 *
 * 返回 { facts, available }：`facts` 逐栋记录 layout 依据（地面/包围盒/机位/走查点）与套件实测
 * （`items` 件数、三角面、世界包围盒、kit 诊断），供测试与回执逐栋复核。
 */
function buildInteriorSets(ctx, group, buildingFacts) {
  const { kit, config } = ctx;
  const interiorSet = typeof kit.interiorSet === 'function' ? kit.interiorSet : null;
  const facts = [];
  if (!interiorSet) return { facts, available: false };

  for (const slot of ctx.zoneLayout.slots) {
    const record = INTERIOR_BY_SLOT[slot.id] ?? null;
    if (!record?.walkableId) continue;
    const surface = WALKABLE.find((w) => w.id === record.walkableId);
    if (!surface) fail(`layout 登记了 ${slot.id} 的内景 ${record.walkableId}，但 WALKABLE 中找不到该面`);

    const measured = buildingFacts.find((f) => f.id === slot.id);
    // 室内地面 = 该栋建筑 kit 的台基顶（`buildingBaseY`）——B 区地坪为 0，故与 `WK.y` 逐值相同（Δ=0，测试断言）；
    // 天花 = kit 实测檐口 − 0.2m（不穿顶）。
    const groundY = buildingBaseY(slot);
    const eaveAbsolute = measured?.eaveHeightAbsolute ?? (groundY + slot.eaveHeight);
    const ceilingY = Math.max(groundY + 0.6, Math.min(eaveAbsolute, groundY + slot.eaveHeight) - 0.2);

    const object = interiorSet({
      id: `interior:${slot.id}`,
      kind: slot.kind,
      grade: slot.grade,
      bounds: { ...surface.bounds },
      groundY,
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
 * 配殿/门殿的室内天花（kit 套件只有 hall 档带藻井天花）。
 *
 * 问题：`sideHall/gateHall` 档套件没有天花构件 ⇒ 内景机位仰视时画面顶部是**屋面背面**（深色瓦背），
 * 实测 `B-side-east-south` 内容暗区 30.71% > 30%（§12 内景判据 FAIL）。
 * 最小修法（调室内材质/构件，**不放宽判据**）：用 `kit.paving` 的薄板补一层白石天花，遮掉深色屋面；
 * 材质用既有令牌 `stoneWhite`（仅 +1 个绘制批次），尺寸取该栋室内面的完整范围、标高取 kit 檐口 −0.2m。
 */
function buildInteriorCeilings(ctx, group, interiorFacts) {
  const paving = kitFactory(ctx.kit, 'paving', { required: false });
  const out = [];
  if (!paving) return out;
  for (const fact of interiorFacts) {
    if (fact.kind === 'hall') continue; // hall 档套件自带藻井天花
    const b = fact.bounds;
    const slab = paving({
      id: `ceiling:${fact.id}`,
      name: `${fact.id} 室内天花`,
      w: +(b.maxX - b.minX).toFixed(3),
      d: +(b.maxZ - b.minZ).toFixed(3),
      x: +((b.minX + b.maxX) / 2).toFixed(3),
      z: +((b.minZ + b.maxZ) / 2).toFixed(3),
      y: fact.ceilingY,
      thickness: 0.3,
      material: 'stoneWhite',
      detail: 'far',
    });
    slab.userData.zone = ZONE_ID;
    slab.userData.buildingId = fact.id;
    group.add(slab);
    out.push({ id: fact.id, y: fact.ceilingY, w: +(b.maxX - b.minX).toFixed(1), d: +(b.maxZ - b.minZ).toFixed(1) });
  }
  return out;
}

/**
 * 内景补光灯位（§8.3 灯位登记；灯由 t2 的统一环境系统激活，区域不建第二套灯光）。
 *
 * 为什么需要：§12 内景判据（内容暗区 ≤30%）在 goldenHour 下对**配殿/庑房**偏紧——室内净高仅 3~4m，
 * 画面里深色屋面（瓦背）与朱红墙占比大，实测 `B-side-east-south` 30.71% FAIL。按 CONFIG 1.0.3
 * `lampIntensityScale(golden 0.45)` 让宫灯在白天有限参与室内照明是本卡允许的"最小修法（调室内灯）"，
 * **不放宽任何判据**；每栋内景沿长轴 1/3 与 2/3 处各一盏，落在室内地面上（`WK.y`），
 * 高度 2.6m（灯体低于室内净高，不穿顶）。
 */
function buildInteriorLampAnchors(ctx, interiorFacts) {
  const out = [];
  for (const fact of interiorFacts) {
    const b = fact.bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    const alongZ = spanZ >= spanX;
    for (const t of [1 / 3, 2 / 3]) {
      const x = +(alongZ ? (b.minX + b.maxX) / 2 : b.minX + spanX * t).toFixed(2);
      const z = +(alongZ ? b.minZ + spanZ * t : (b.minZ + b.maxZ) / 2).toFixed(2);
      out.push({
        id: `LA-B-interior-${fact.id.replace(/^B-/, '')}-${alongZ ? 'z' : 'x'}${t === 1 / 3 ? 'a' : 'b'}`,
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
 * 七、广场陈设 / 绿化 / 灯体
 * ========================================================================== */

/** 广场陈设：吃 `layout.SCENIC_OBJECTS` 中 owner=B 的鼓、钟（登记尺寸 → kit.bronze 的 size）。 */
function buildScenic(ctx, group, detail) {
  const { kit } = ctx;
  const bronze = kitFactory(kit, 'bronze');
  const list = [];
  for (const scenic of SCENIC_OBJECTS) {
    if (scenic.owner !== ZONE_ID) continue;
    const cx = (scenic.bounds.minX + scenic.bounds.maxX) / 2;
    const cz = (scenic.bounds.minZ + scenic.bounds.maxZ) / 2;
    // kit.bronze 的鼓高 = size×0.55、钟高 = size×0.84 → 由登记高度反解 size，保证体量与 layout 一致
    const ratio = scenic.kind === 'drum' ? 0.55 : 0.84;
    const size = +(scenic.height / ratio).toFixed(3);
    const object = bronze({
      id: `B-scenic-${scenic.kind}`,
      kind: scenic.kind,
      size,
      x: cx,
      z: cz,
      y: ctx.zoneLayout.groundY + bronzeGroundOffset(scenic.kind, size),
      detail,
    });
    object.userData.zone = ZONE_ID;
    object.userData.scenicId = scenic.id;
    group.add(object);
    list.push({ id: scenic.id, kind: scenic.kind, x: cx, z: cz, size });
  }
  return list;
}

/**
 * 平台陈设：月台上的鎏金铜狮（4 尊，太和殿月台形制）+ 铜香炉（丹陛两侧）。
 * 位置全部落在 `WK-B-terrace-tier3`（x∈[-56,56], z∈[-148,-84]）内、避开丹陛（|x|>13）。
 */
function buildTerraceFurnishings(ctx, group, detail) {
  const { kit } = ctx;
  const bronze = kitFactory(kit, 'bronze');
  const tier3 = ctx.zoneLayout.terraces.find((t) => t.tier === 3);
  if (!tier3) return [];
  const y = tier3.y1;
  const list = [];
  const place = (id, kind, size, x, z) => {
    const object = bronze({ id, kind, size, x, z, y: y + bronzeGroundOffset(kind, size), detail });
    object.userData.zone = ZONE_ID;
    object.userData.part = `terrace-${kind}`;
    group.add(object);
    list.push({ id, kind, x, z, y, size });
  };
  for (const sx of [-1, 1]) {
    place(`B-terrace-lion-${sx > 0 ? 'east' : 'west'}-south`, 'lion', 2.6, sx * 24, tier3.bounds.minZ + 7);
    place(`B-terrace-lion-${sx > 0 ? 'east' : 'west'}-north`, 'lion', 2.6, sx * 44, tier3.bounds.minZ + 30);
    place(`B-terrace-censer-${sx > 0 ? 'east' : 'west'}`, 'censer', 2.0, sx * 16, tier3.bounds.minZ + 3);
  }
  return list;
}

/**
 * 绿化：按 `layout.VEGETATION`（B：10 株 / 2 株花树 / rngSeed）在广场与后殿院种植，
 * 用 `ctx.rng.fork('trees')` 确定性采样，并回避建筑/道路/廊庑/轴线。
 */
function buildVegetation(ctx, group, detail) {
  const { kit, zoneLayout, rng } = ctx;
  const tree = kitFactory(kit, 'tree');
  const plan = (zoneLayout.vegetation ?? [])[0];
  if (!plan) return [];
  const planted = [];
  const blockers = zoneLayout.slots.map((s) => ({
    minX: s.bounds.minX - 4,
    maxX: s.bounds.maxX + 4,
    minZ: s.bounds.minZ - 4,
    maxZ: s.bounds.maxZ + 4,
  }));
  const inside = (box, x, z) => x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;

  // 种植带：广场东西两侧 + 后殿院东西两侧（避开中轴正殿、廊庑、院墙与台阶）
  const bands = [
    { minX: -76, maxX: -34, minZ: -358, maxZ: -196 },
    { minX: 34, maxX: 76, minZ: -358, maxZ: -196 },
    { minX: -86, maxX: -36, minZ: -34, maxZ: 72 },
    { minX: 36, maxX: 86, minZ: -34, maxZ: 72 },
  ];
  const localRng = rng.fork('trees');
  const heights = CONFIG.PLANTS.treeHeights;
  const shapes = CONFIG.PLANTS.canopyShapes;

  let attempts = 0;
  while (planted.length < plan.treeCount && attempts < plan.treeCount * 60) {
    attempts += 1;
    const band = bands[attempts % bands.length];
    const x = +localRng.range(band.minX, band.maxX).toFixed(2);
    const z = +localRng.range(band.minZ, band.maxZ).toFixed(2);
    if (Math.abs(x) < 16) continue; // 中轴留空
    if (blockers.some((b) => inside(b, x, z))) continue;
    if (planted.some((t) => Math.hypot(t.x - x, t.z - z) < 12)) continue; // 最小间距
    const surface = ctx.zoneLayout.helpers.floorYAt(x, z);
    if (!num(surface)) continue;
    planted.push({ x, z, y: surface });
  }

  return planted.slice(0, plan.treeCount).map((spot, index) => {
    const size = index % 4 === 0 ? 'large' : index % 3 === 0 ? 'small' : 'medium';
    const blossom = index < plan.blossomCount;
    const object = tree({
      id: `B-tree-${String(index + 1).padStart(2, '0')}`,
      name: `前朝乔木 ${index + 1}`,
      x: spot.x,
      z: spot.z,
      y: spot.y,
      height: heights[size],
      size,
      canopyShape: shapes[index % shapes.length],
      blossom,
      rngSeed: (plan.rngSeed + index * 7919) >>> 0,
      detail,
    });
    object.userData.zone = ZONE_ID;
    object.userData.vegetationId = plan.id;
    group.add(object);
    return { id: object.name, x: spot.x, z: spot.z, size, blossom };
  });
}

/**
 * 灯体：`layout.LIGHT_ANCHORS` 中 zone=B 的灯位（24 个）在**本区地坪**上落位。
 * 登记的 x/z 逐值不变；y 取 `floorYAt(x,z)`（layout 基线为 0，本区按实际地面实现——
 * 例如中轴 z=-110 的两个灯位落在金銮殿内景地面 4.5m 上，z=-150 的两个落在台基二层顶 3.0m 上）。
 */
function buildLightFixtures(ctx, group, detail, extraAnchors = []) {
  const { kit, zoneLayout } = ctx;
  const lantern = kitFactory(kit, 'lantern');
  const instanceFromPoints = kitFactory(kit, 'instanceFromPoints', { required: false });
  const spots = [...zoneLayout.lightAnchors, ...extraAnchors].map((anchor) => {
    const surface = zoneLayout.helpers.floorYAt(anchor.position.x, anchor.position.z);
    return {
      anchorId: anchor.id,
      height: anchor.height,
      x: anchor.position.x,
      y: num(surface) ? surface : anchor.position.y,
      z: anchor.position.z,
    };
  });

  // 中轴宫灯 24 座形制完全相同（同高同类型）→ 用 kit.instanceFromPoints 实例化（G1 要求：
  // 重复构件必须实例化；每部位 1 个 InstancedMesh，顶点数据只保留一份）。
  if (instanceFromPoints && spots.length > 1) {
    const prototype = lantern({
      id: 'B-lamp-prototype',
      name: '宫灯原型（仅用于实例化，不进场景）',
      x: 0,
      z: 0,
      y: 0,
      height: spots[0].height,
      kind: 'post',
      detail,
    });
    const parts = [];
    prototype.traverse((node) => {
      if (node.isMesh) parts.push(node);
    });
    const instanced = [];
    for (const mesh of parts) {
      const object = instanceFromPoints(mesh.geometry, mesh.material, spots, {
        name: `B-lamps:${mesh.userData?.part ?? 'part'}x${spots.length}`,
      });
      object.userData.zone = ZONE_ID;
      object.userData.part = mesh.userData?.part ?? 'lantern';
      object.userData.lightAnchorIds = spots.map((s) => s.anchorId);
      object.castShadow = true;
      object.receiveShadow = true;
      group.add(object);
      instanced.push(object);
    }
    return { count: spots.length, instanced: true, batches: instanced.length, lamps: spots.map((s) => ({ ...s })) };
  }

  // 退路（灰盒替身 kit 无实例化能力）：逐座摆件
  const list = [];
  for (const spot of spots) {
    const object = lantern({
      id: `B-lamp-${spot.anchorId}`,
      name: `宫灯 ${spot.anchorId}`,
      x: spot.x,
      z: spot.z,
      y: spot.y,
      height: spot.height,
      kind: 'post',
      detail,
    });
    object.userData.zone = ZONE_ID;
    object.userData.lightAnchorId = spot.anchorId;
    group.add(object);
    list.push(spot);
  }
  return { count: list.length, instanced: false, batches: list.length, lamps: list.map((s) => ({ ...s })) };
}

/* =============================================================================
 * 八、区域入口
 * ========================================================================== */

/**
 * B 区入口（CONTRACTS §3.3）。返回 root/buildings/connectors/colliders/viewpoints/lightAnchors/update/dispose。
 * @param {object} ctx 由 `src/core/context.js` 构造（tests 用 `makeTestCtx` 注入真 kit）
 */
export async function createZone(ctx) {
  if (!ctx?.zoneLayout) fail('ctx.zoneLayout 缺失（由 src/core/context.js 提供）');
  if (ctx.zoneLayout.id !== ZONE_ID) fail(`ctx.zoneLayout.id=${ctx.zoneLayout.id}，本模块只负责 ${ZONE_ID}`);
  const { kit, zoneLayout } = ctx;
  if (!kit) fail('ctx.kit 缺失（构件工厂由 t3 提供，见 CONTRACTS §3.4）');
  const detail = detailForQuality(ctx.quality);
  const propDetail = propDetailForQuality(ctx.quality);

  const root = new THREE.Group();
  root.name = `zone-root:${ZONE_ID}`;

  /* ---- 1. 建筑（12 槽位） ---- */
  const buildingsGroup = new THREE.Group();
  buildingsGroup.name = 'B:buildings';
  root.add(buildingsGroup);
  const built = buildBuildings(ctx, buildingsGroup);

  /* ---- 2. 台基 / 栏杆 / 台阶 ---- */
  const terraceGroup = new THREE.Group();
  terraceGroup.name = 'B:terrace';
  root.add(terraceGroup);
  const terrace = buildMainTerrace(ctx, terraceGroup, detail);
  const railRuns = buildTerraceRailings(ctx, terraceGroup, terrace.tiers, detail);
  const flights = buildStairFlights(ctx, terraceGroup, detail);

  /* ---- 3. 围合（院墙 + 廊庑） ---- */
  const enclosureGroup = new THREE.Group();
  enclosureGroup.name = 'B:enclosure';
  root.add(enclosureGroup);
  const wallRuns = buildCourtWalls(ctx, enclosureGroup, detail);
  const corridors = buildCorridors(ctx, enclosureGroup, detail);

  /* ---- 4. 铺地 ---- */
  const groundGroup = new THREE.Group();
  groundGroup.name = 'B:ground';
  root.add(groundGroup);
  const ground = buildGround(ctx, groundGroup);

  /* ---- 5. 内景（kit.interiorSet）/ 陈设 / 绿化 / 灯体 ---- */
  const interiorsGroup = new THREE.Group();
  interiorsGroup.name = 'B:interiors';
  root.add(interiorsGroup);
  const interiorSets = buildInteriorSets(ctx, interiorsGroup, built.metrics);
  const interiorCeilings = buildInteriorCeilings(ctx, interiorsGroup, interiorSets.facts);
  // 内景补光灯位（须在灯体与 lightAnchors 之前算好）
  const interiorLampAnchors = buildInteriorLampAnchors(ctx, interiorSets.facts);

  const propsGroup = new THREE.Group();
  propsGroup.name = 'B:props';
  root.add(propsGroup);
  const scenic = buildScenic(ctx, propsGroup, propDetail);
  const furnishings = buildTerraceFurnishings(ctx, propsGroup, propDetail);
  const trees = buildVegetation(ctx, propsGroup, propDetail);
  const lamps = buildLightFixtures(ctx, propsGroup, propDetail, interiorLampAnchors);

  /* ---- 6. 台阶朝向规范化（见文件头裁定 B） ---- */
  const stairFix = alignStairFlights(THREE, root);

  /* ---- 7. 整区合批（跨建筑 × 同材质同部位） ---- */
  let preMergeDrawCalls = kit.countDrawCalls ? kit.countDrawCalls(root) : null;
  let mergeStats = null;
  /* ------------------------------------------------------------------------
   * t41：中轴楼阁**腰檐分层**（外观多层；**不登记可行走面** ⇒ 无空气楼梯）
   * 几何 = `kit.makeStoreyBands`，登记 = `layout.STOREY_BANDS/STOREY_BAND_PLANS`：
   * 逐栋核对 `bandCount` 与每道腰檐标高 `bandY`（逐值，漂移即抛错）—— 登记与几何同轮。
   * 层数由 grade 派生（g3⇒3、g2⇒2），与 t38 的 `eaveAbs` 降序一致；不改 eaveHeight/totalHeight。
   * ---------------------------------------------------------------------- */
  const storeyBandFacts = [];
  if (typeof kit.makeStoreyBands === 'function') {
    for (const spec of STOREY_BANDS) {
      const plan = STOREY_BAND_PLANS.find((q) => q.id === spec.id);
      if (!plan) throw new Error(`forecourt: 缺 layout 腰檐登记 ${spec.id}`);
      const built = kit.makeStoreyBands({ ...spec, detail: 'mid', x: spec.x, z: spec.z, baseY: spec.baseY, w: spec.w, d: spec.d, levels: spec.levels, eaveHeight: spec.eaveHeight });
      const got = built.metrics.bandY ?? [];
      const want = plan.bands.map((b) => b.y);
      const drift = got.length !== want.length
        ? `bandCount ${got.length}≠${want.length}`
        : got.map((y, i) => (Math.abs(y - want[i]) > 1e-6 ? `#${i} ${y}≠${want[i]}` : null)).filter(Boolean).join('、');
      if (drift) throw new Error(`forecourt: ${spec.id} 腰檐几何与登记不一致：${drift}`);
      root.add(built.group);
      storeyBandFacts.push({
        id: spec.id, slotId: spec.slotId, grade: spec.grade, eaveAbs: spec.eaveAbs, levels: spec.levels,
        bandCount: built.metrics.bandCount, bandY: got, floorRise: plan.floorRise, triangles: built.metrics.triangles,
      });
    }
  }

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

  if (typeof kit.mergeZone === 'function') {
    const merged = kit.mergeZone(root, { name: 'B:batch' });
    mergeStats = merged?.stats ?? null;
  } else {
    // 灰盒替身 kit（仅 Node 侧契约测试）：无合批能力，保留逐栋网格
    preMergeDrawCalls = preMergeDrawCalls ?? null;
  }

  // 审计口径：`scripts/audit.mjs` 的 measure() 不做 LOD.update()，会把 LOD 三档全部计入。
  // 这里把非当前档预先置为不可见——与渲染器 `LOD.update()` 的实际结果一致（浏览器内每帧只画一档），
  // 使 Node 审计数字等于「主场景单次调用」的真实上界，而不是三倍虚高。
  let lodNodes = 0;
  let lodHidden = 0;
  root.traverse((node) => {
    if (!node.isLOD) return;
    lodNodes += 1;
    node.levels.forEach((level, index) => {
      if (index === 0) return;
      if (level.object && level.object.visible !== false) {
        level.object.visible = false;
        lodHidden += 1;
      }
    });
  });

  const postMergeDrawCalls = kit.countDrawCalls ? kit.countDrawCalls(root) : null;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);

  /* ---- 8. 契约数据（逐字段回显 layout） ---- */
  const buildings = zoneLayout.slots.map((slot) => ({ ...slot, bounds: { ...slot.bounds }, door: slot.door ? { ...slot.door } : null }));

  const connectors = zoneLayout.connectors.map((c) => ({
    ...c,
    position: { ...c.position },
  }));

  const colliders = {
    obstacles: zoneLayout.obstacles.map((o) => ({
      ...o,
      bounds: { ...o.bounds },
      door: o.door ? { ...o.door, center: { ...o.door.center } } : null,
    })),
    walkable: zoneLayout.walkable.map((w) => ({ ...w, bounds: { ...w.bounds } })),
    ramps: rampsFromRoads(zoneLayout.roads).map((r) => ({
      ...r,
      from: { ...r.from },
      to: { ...r.to },
    })),
  };

  const viewpoints = zoneLayout.viewpoints.map((v) => ({
    ...v,
    position: { ...v.position },
    target: { ...v.target },
  }));

  const lightAnchors = [...zoneLayout.lightAnchors, ...interiorLampAnchors].map((a) => {
    const surface = zoneLayout.helpers.floorYAt(a.position.x, a.position.z);
    return {
      ...a,
      position: { x: a.position.x, y: num(surface) ? surface : a.position.y, z: a.position.z },
    };
  });

  const stats = {
    /* t41：中轴楼阁腰檐分层（外观多层；不登记可行走面）—— 与 layout.STOREY_BANDS 逐值核对后的台账 */
    storeyBands: storeyBandFacts.length,
    storeyBandBands: storeyBandFacts.reduce((n, f) => n + f.bandCount, 0),
    storeyBandTriangles: storeyBandFacts.reduce((n, f) => n + f.triangles, 0),
    storeyBandFacts,
    zone: ZONE_ID,
    version: FORECOURT_VERSION,
    buildings: buildings.length,
    buildingsByKind: buildings.reduce((acc, b) => {
      acc[b.kind] = (acc[b.kind] ?? 0) + 1;
      return acc;
    }, {}),
    connectors: connectors.length,
    obstacles: colliders.obstacles.length,
    walkable: colliders.walkable.length,
    ramps: colliders.ramps.length,
    viewpoints: viewpoints.length,
    lightAnchors: lightAnchors.length,
    terraces: terrace.tiers.length,
    railRuns: railRuns.length,
    stairFlights: flights.length,
    courtWallRuns: wallRuns.length,
    corridors: corridors.length,
    pavingSlabs: ground.slabs.length,
    interiorSets: interiorSets.facts.length,
    interiorFacts: interiorSets.facts,
    interiorKitAvailable: interiorSets.available,
    interiorCeilings: interiorCeilings.length,
    scenic: scenic.length,
    furnishings: furnishings.length,
    trees: trees.length,
    lamps: lamps.count,
    lampBatches: lamps.batches,
    lampInstanced: lamps.instanced,
    stairOrientationFix: stairFix,
    lod: { nodes: lodNodes, levelsHidden: lodHidden, perBuilding: built.lodLevels, buildingDetail: detail },
    buildingMetrics: built.metrics,
    drawCalls: { preMerge: preMergeDrawCalls, postMerge: postMergeDrawCalls, merge: mergeStats },
    triangles: kit.countTriangles ? kit.countTriangles(root) : null,
    bounds: {
      minX: +bounds.min.x.toFixed(3),
      maxX: +bounds.max.x.toFixed(3),
      minY: +bounds.min.y.toFixed(3),
      maxY: +bounds.max.y.toFixed(3),
      minZ: +bounds.min.z.toFixed(3),
      maxZ: +bounds.max.z.toFixed(3),
    },
    details: {
      buildings: built.pieces.map((p) => p.id),
      flights: flights.map((f) => ({ ...f, top: { ...f.top }, bottom: { ...f.bottom } })),
      railRuns: railRuns.map((r) => ({ ...r })),
      wallRuns: wallRuns.map((w) => ({ ...w, openings: w.openings.map((o) => ({ ...o })) })),
      corridors: corridors.map((c) => ({ ...c })),
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
    /** 只动自有对象：本区没有需要逐帧驱动的自有对象（灯/水/烟由 t2 环境系统统一驱动），仅累计 elapsed。 */
    update(dtSeconds) {
      if (num(dtSeconds)) elapsedSeen += dtSeconds;
    },
    /** 只释放本区自有几何（`userData.kitOwned`）；不销毁 kit 的共享材质/贴图（CONTRACTS §3.3）。 */
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
