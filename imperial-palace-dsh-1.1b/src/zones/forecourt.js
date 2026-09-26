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
import { CONFIG, MODULES, TERRAIN } from '../shared/config.js';
import { SCENIC_OBJECTS, WALLS } from '../shared/layout.js';
import { rampsFromRoads } from '../core/layout-slice.js';

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
    params.baseY = +MODULES.terraceTotalHeight.toFixed(2);
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
  const groups = new Map();
  /**
   * 优先消费 `ctx.zoneLayout.courtyardWalls`（契约字段）；若切片为空则回落为「按 courtyardId 从冻结表取」。
   * 背景：`layout.WALLS` 的条目只有 `owner`/`courtyardId`、**没有** `zone` 字段，早期 `layout-slice.js`
   * 用 `w.zone === zoneId` 过滤导致各区 `courtyardWalls` 恒空；t2 已修正（B 区实测 12 条），
   * 这里保留回退分支以便切片再次变更时不静默丢墙。数据来源始终是 `src/shared/layout.js`。
   */
  const courtyardIds = new Set(zoneLayout.courtyards.map((c) => c.id));
  const courtyardWalls =
    zoneLayout.courtyardWalls && zoneLayout.courtyardWalls.length > 0
      ? zoneLayout.courtyardWalls
      : WALLS.filter((w) => w.kind === 'courtWall' && courtyardIds.has(w.courtyardId));

  for (const source of courtyardWalls) {
    const alongX = source.axis === 'x';
    const line = alongX ? source.from.z : source.from.x;
    const key = `${alongX ? 'x' : 'z'}@${line.toFixed(2)}`;
    const lo = alongX ? Math.min(source.from.x, source.to.x) : Math.min(source.from.z, source.to.z);
    const hi = alongX ? Math.max(source.from.x, source.to.x) : Math.max(source.from.z, source.to.z);
    if (!groups.has(key)) {
      groups.set(key, { alongX, line, intervals: [], openings: [], sources: [] });
    }
    const bucket = groups.get(key);
    bucket.intervals.push([lo, hi]);
    bucket.sources.push(source.id);
    for (const opening of source.openings) {
      bucket.openings.push({ at: opening.at, width: opening.width, from: source.id });
    }
  }

  const runs = [];
  for (const bucket of groups.values()) {
    const merged = [];
    for (const interval of bucket.intervals.slice().sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1] + 0.01) last[1] = Math.max(last[1], interval[1]);
      else merged.push([interval[0], interval[1]]);
    }
    merged.forEach(([lo, hi], index) => {
      const mid = (lo + hi) / 2;
      // 开口：落在本段内 → 去重（1m 内视为同一口，取最大净宽）→ 转相对偏移
      const picked = [];
      for (const opening of bucket.openings) {
        if (opening.at < lo - 1 || opening.at > hi + 1) continue;
        const hit = picked.find((p) => Math.abs(p.at - opening.at) <= 1);
        if (hit) hit.width = Math.max(hit.width, opening.width);
        else picked.push({ at: opening.at, width: opening.width, from: opening.from });
      }
      const openings = picked.map((p) => ({ at: +(p.at - mid).toFixed(3), width: p.width, source: p.from }));
      const from = bucket.alongX ? { x: lo, z: bucket.line } : { x: bucket.line, z: lo };
      const to = bucket.alongX ? { x: hi, z: bucket.line } : { x: bucket.line, z: hi };
      const object = wall({
        id: `B-wallrun-${bucket.alongX ? 'x' : 'z'}${bucket.line}-${index}`,
        name: `${bucket.alongX ? '东西向' : '南北向'}院墙 z/x=${bucket.line}`,
        from,
        to,
        thickness: MODULES.courtyardWallThickness,
        height: MODULES.courtyardWallHeight,
        kind: 'courtWall',
        openings,
        source: bucket.sources.join('+'),
        detail,
      });
      object.userData.zone = ZONE_ID;
      group.add(object);
      runs.push({
        id: object.name,
        alongX: bucket.alongX,
        line: bucket.line,
        lo,
        hi,
        length: +(hi - lo).toFixed(3),
        openings,
        sources: bucket.sources.slice(),
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
 * 六、金銮殿内景（宝座 / 屏风 / 盘龙金柱柱网 / 平棋式藻井）
 * ========================================================================== */

/**
 * 内景陈设。全部用 kit 构件组合（`terrace` 须弥座 / `screenWall` 屏风 / `paving` 板式件 + `bronze` 铜器），
 * kit 目前没有「宝座 / 藻井穹顶 / 盘龙柱」专用工厂——已按纪律登记需求（见回执 §5），不在此自建私有素材。
 * 所有构件都落在 `WK-B-hall-main-interior` 的室内包围盒内、且低于檐口（不穿墙不出顶）。
 */
function buildInterior(ctx, group, interiors, detail) {
  const { kit, zoneLayout } = ctx;
  const terrace = kitFactory(kit, 'terrace');
  const paving = kitFactory(kit, 'paving', { required: false });
  const screenWall = kitFactory(kit, 'screenWall', { required: false });
  const bronze = kitFactory(kit, 'bronze');
  const hall = zoneLayout.slots.find((s) => s.id === 'B-hall-main');
  if (!hall) fail('layout 缺少 B-hall-main 槽位');

  const floorY = MODULES.terraceTotalHeight;
  const ceilingPitch = MODULES.eaveHeight * CONFIG.GRADES[hall.grade].eaveHeightFactor;
  const ceilingY = hall.baseY + ceilingPitch; // 檐口高（与 layout.eaveHeight 同源）
  // 室内定位：以登记的内景可行走面（WK-B-hall-main-interior）为基准，不另造坐标系。
  const face = zoneLayout.walkable.find((w) => w.kind === 'interior' && w.zone === ZONE_ID);
  if (!face) fail('layout 缺少 B 区 interior 可行走面');
  const north = face.bounds.maxZ; // 北端（屏风/宝座一侧，朝南）
  const south = face.bounds.minZ; // 南端（金銮殿门洞一侧）
  const screenZ = +(north - 2.5).toFixed(2);
  const throneZ = +(north - 6).toFixed(2);
  const daisZ = +(north - 6.5).toFixed(2);

  // 1) 须弥座（宝座台）：kit.terrace 两层，落在金砖地面上
  const dais = terrace({
    id: 'B-interior-dais',
    name: '金銮宝座须弥座',
    tiers: [
      { bounds: { minX: -6, maxX: 6, minZ: north - 14, maxZ: north - 1 }, y0: floorY, y1: floorY + 0.6, tier: 1 },
      { bounds: { minX: -4.6, maxX: 4.6, minZ: north - 13, maxZ: north - 2 }, y0: floorY + 0.6, y1: floorY + 1.1, tier: 2 },
    ],
    x: 0,
    z: daisZ,
    w: 12,
    d: 12,
    terraceH: 1.1,
    railing: false,
    detail,
  });
  dais.userData.zone = ZONE_ID;
  group.add(dais);
  interiors.push({ id: 'dais', kind: 'terrace', bounds: { minX: -6, maxX: 6, minZ: north - 14, maxZ: north - 1 } });

  // 2) 宝座本体：鎏金坐面 + 两侧扶手（`paving` = kit 的通用板式件工厂，y 语义为板顶）+ 宝座屏（`screenWall`）
  const throneY = floorY + 1.1;
  if (paving) {
    const seat = paving({ id: 'B-interior-throne-seat', name: '金銮宝座坐面', w: 4.2, d: 2.4, x: 0, z: throneZ, y: throneY + 0.75, thickness: 0.75, material: 'metalGilt', detail });
    group.add(seat);
    for (const sx of [-1, 1]) {
      const arm = paving({
        id: `B-interior-throne-arm-${sx > 0 ? 'east' : 'west'}`,
        name: '宝座扶手',
        w: 0.45,
        d: 2.4,
        x: sx * 1.9,
        z: throneZ,
        y: throneY + 1.05,
        thickness: 1.05,
        material: 'metalGilt',
        detail,
      });
      group.add(arm);
    }
    interiors.push({ id: 'throne', kind: 'paving', bounds: { minX: -2.1, maxX: 2.1, minZ: throneZ - 1.2, maxZ: throneZ + 1.2 } });
  }
  if (screenWall) {
    const backScreen = screenWall({ id: 'B-interior-throne-back', name: '宝座屏风（靠背）', w: 6.4, height: 3.8, thickness: 0.45, x: 0, z: throneZ - 1.6, y: throneY, detail });
    backScreen.userData.zone = ZONE_ID;
    group.add(backScreen);
    interiors.push({ id: 'throneScreen', kind: 'screenWall', bounds: { minX: -3.2, maxX: 3.2, minZ: throneZ - 1.85, maxZ: throneZ - 1.35 } });
  }

  // 3) 屏风（kit.screenWall = 照壁/影壁工厂；这里按「屏风」使用，立在宝座之后）
  if (screenWall) {
    const screen = screenWall({ id: 'B-interior-screen', name: '金銮殿屏风', w: 20, height: 5.6, thickness: 0.5, x: 0, z: screenZ, y: floorY, detail });
    screen.userData.zone = ZONE_ID;
    group.add(screen);
    interiors.push({ id: 'screen', kind: 'screenWall', bounds: { minX: -10, maxX: 10, minZ: screenZ - 0.25, maxZ: screenZ + 0.25 } });
  }

  // 4) 盘龙金柱：殿内金柱柱网由 kit.hall 生成（4 排 × 10 列）；这里在两排金柱柱脚加鎏金抱柱箍
  const bodyD = hall.d - 2 * Math.min(CONFIG.MODULES.plinthWidth, Math.min(hall.w, hall.d) * 0.12);
  const columnRows = [1, 2].map((j) => +(hall.z - bodyD / 2 + (bodyD * j) / 3).toFixed(2));
  for (const z of columnRows) {
    for (const sx of [-1, 1]) {
      const collar = bronze({ id: `B-interior-column-ring-${sx > 0 ? 'e' : 'w'}-${z.toFixed(1)}`, kind: 'drum', size: 1.5, x: sx * 4.37, z, y: floorY, detail });
      group.add(collar);
    }
  }

  // 5) 平棋式藻井：檐下底板（kit.hall 的 soffit，底约在檐口下 0.23m）之下挂两层同心方井 + 中心井板 + 鎏金宝顶
  //    （kit 没有可向上凹陷的藻井穹顶构件，故按"平棋"做法：同心方井逐层内收、中心吊鎏金宝顶，不穿出屋面）
  if (paving) {
    const cz = throneZ;
    const frames = [
      { outer: [26, 17], inner: [17, 9], y: ceilingY - 0.3 },
      { outer: [17, 9], inner: [9, 4], y: ceilingY - 0.46 },
    ];
    frames.forEach((frame, index) => {
      const [ow, od] = frame.outer;
      const [iw, id] = frame.inner;
      const bandX = (ow - iw) / 2; // 东西两侧井带：宽 = 外内差之半，深 = 外深
      const bandZ = (od - id) / 2; // 南北两侧井带：深 = 外内差之半，宽 = 内宽
      for (const sx of [-1, 1]) {
        const slab = paving({
          id: `B-interior-caisson-${index}-ew-${sx > 0 ? 'e' : 'w'}`,
          name: '藻井方井（东西井带）',
          w: bandX,
          d: od,
          x: sx * (iw / 2 + bandX / 2),
          z: cz,
          y: frame.y,
          thickness: 0.18,
          material: 'beamPainting',
          detail,
        });
        group.add(slab);
      }
      for (const sz of [-1, 1]) {
        const slab = paving({
          id: `B-interior-caisson-${index}-ns-${sz > 0 ? 'n' : 's'}`,
          name: '藻井方井（南北井带）',
          w: iw,
          d: bandZ,
          x: 0,
          z: cz + sz * (id / 2 + bandZ / 2),
          y: frame.y,
          thickness: 0.18,
          material: 'beamPainting',
          detail,
        });
        group.add(slab);
      }
    });
    const plate = paving({
      id: 'B-interior-caisson-2-center',
      name: '藻井中心井板',
      w: 9,
      d: 4,
      x: 0,
      z: cz,
      y: ceilingY - 0.62,
      thickness: 0.18,
      material: 'beamPainting',
      detail,
    });
    group.add(plate);
    const boss = bronze({
      id: 'B-interior-caisson-boss',
      kind: 'vessel',
      size: 2.4,
      x: 0,
      z: cz,
      y: ceilingY - 3.0 + bronzeGroundOffset('vessel', 2.4),
      detail,
    });
    group.add(boss);
    interiors.push({ id: 'caisson', kind: 'caisson', bounds: { minX: -13, maxX: 13, minZ: cz - 8.5, maxZ: cz + 8.5 } });
  }

  // 6) 殿内铜香炉（平台陈设，置于宝座之前）
  for (const sx of [-1, 1]) {
    const censer = bronze({
      id: `B-interior-censer-${sx > 0 ? 'east' : 'west'}`,
      kind: 'censer',
      size: 1.6,
      x: sx * 12,
      z: south + 10,
      y: floorY + bronzeGroundOffset('censer', 1.6),
      detail,
    });
    group.add(censer);
  }

  interiors.push({ id: 'doorway', kind: 'passage', bounds: { minX: -13, maxX: 13, minZ: south - 6, maxZ: south } });

  return { floorY, ceilingY, fixtures: interiors.length, daisId: dais.userData?.kit?.id ?? 'B-interior-dais' };
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
function buildLightFixtures(ctx, group, detail) {
  const { kit, zoneLayout } = ctx;
  const lantern = kitFactory(kit, 'lantern');
  const instanceFromPoints = kitFactory(kit, 'instanceFromPoints', { required: false });
  const spots = zoneLayout.lightAnchors.map((anchor) => {
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

  /* ---- 5. 内景 / 陈设 / 绿化 / 灯体 ---- */
  const propsGroup = new THREE.Group();
  propsGroup.name = 'B:props';
  root.add(propsGroup);
  const interiors = [];
  const interior = buildInterior(ctx, propsGroup, interiors, propDetail);
  const scenic = buildScenic(ctx, propsGroup, propDetail);
  const furnishings = buildTerraceFurnishings(ctx, propsGroup, propDetail);
  const trees = buildVegetation(ctx, propsGroup, propDetail);
  const lamps = buildLightFixtures(ctx, propsGroup, propDetail);

  /* ---- 6. 台阶朝向规范化（见文件头裁定 B） ---- */
  const stairFix = alignStairFlights(THREE, root);

  /* ---- 7. 整区合批（跨建筑 × 同材质同部位） ---- */
  let preMergeDrawCalls = kit.countDrawCalls ? kit.countDrawCalls(root) : null;
  let mergeStats = null;
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

  const lightAnchors = zoneLayout.lightAnchors.map((a) => {
    const surface = zoneLayout.helpers.floorYAt(a.position.x, a.position.z);
    return {
      ...a,
      position: { x: a.position.x, y: num(surface) ? surface : a.position.y, z: a.position.z },
    };
  });

  const stats = {
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
    interiorFixtures: interiors.length,
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
    interior,
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
