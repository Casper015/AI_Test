/**
 * index.js — 统一建筑构件库入口：createKit(ctx)
 * =============================================================================
 * 用法（区域作者）：
 *   const kit = ctx.kit;                       // 由 core 组装时注入；本文件是它的实现
 *   root.add(kit.hall({ id:'B-hall-main', x:0, z:-300, w:84, d:48, bays:9, terraceH:4.5,
 *                       roofType:'doubleEaveHip', grade:3, facing:'south', quality:ctx.quality }));
 *   kit.mergeZone(root);                       // 推荐：整区合批（跨建筑 × 逐档 × 同材质同部位），保留阴影标志
 *   kit.mergeByMaterial(root);                 // 或：按共享材质合批（不分档）
 *   kit.mergeZone(root, { config });           // 需要用调用方的 config 覆盖阴影策略时必须显式传入（见下）
 *
 * 契约（CONTRACTS §3.4，名称冻结）：
 *   kit.makeTower({ id, spec, x, z, baseY, zone, detail })   // 可登塔楼（t39；返回 {group, walkable, obstacles, viewpoints, plan, metrics}）
 *   kit.materials[role]  kit.hall/gateHall/sideHall/pavilion/cornerTower/wall/courtyardGate/
 *   kit.corridor/terrace/stairs/bridge  kit.tree/rockery/lantern/railing/bronze  kit.instance(mesh,count)  kit.lod(levels)
 * 额外提供（不冲突）：screenWall / water / paving 摆件工厂，以及合批、去内部面、统计、诊断、disposeObject。
 *
 * 纪律：
 *   - 只读依赖 src/shared/config.js（令牌唯一来源）与本地 vendored three r169；
 *   - 全部构件程序化生成，public/assets/ 为空，无必需网络资源、无 npm 依赖；
 *   - dispose() 只释放本库自建材质/贴图；disposeObject() 只释放带 kitOwned 标记的几何。
 */

import { THREE as FALLBACK_THREE, THREE_RESOLUTION } from './three-ref.js';
import { CONFIG, deriveSeed as sharedDeriveSeed } from '../shared/config.js';
import { createMaterials, textureSizeFor } from './materials.js';
import { createAssets } from './assets.js';
import { makeBuilding, makeProps, makeWall, makeCorridor, makeTerrace, makeStairs, makeBridge } from './buildings.js';
import {
  mergeByMaterial, mergeZone, pruneInteriorFaces, removeInteriorFaces, removeCoincidentFaces, makeLOD, instanceMesh,
  instanceFromPoints, countTriangles, countDrawCalls, drawCallBuckets, normalizeGeometry, mergeGeometries,
} from './merge.js';
import {
  colorOf, colorChain, gradeOf, roofOf, qualityOf, moduleScale, roofPlanOf, eaveHeightOf, localFootprint,
  bayMetrics, PROPORTIONS, ROOF_TYPE_IDS, GRADE_IDS, REQUIRED_PARAM_FIELDS,
} from './tokens.js';
import { makeRng } from './props.js';
import { interiorSet as buildInteriorSet, INTERIOR_KINDS, INTERIOR_MATERIALS } from './interiors.js';
import {
  makeTower as buildTower, towerPlan as buildTowerPlan, disposeTower as disposeTowers,
  climbStepMax, climbSequenceReport, faceOverlaps, TOWER_SPECS, CLIMB_SAFETY,
  makeStoreyBands as buildStoreyBands, storeyBandPlan as buildStoreyBandPlan,
} from './towers.js';

/**
 * 构件库版本。递增规则：任何**几何/材质/合批行为**变化都必须递增本版本号，
 * 并在下方版本历史登记；纯文档/注释变化不递增。
 *
 * 版本历史
 * ---------
 * - **1.0.3**（2026-09-26，t41 中轴楼阁腰檐分层；**只加构件工厂，零既有几何改动**）：
 *   导出 `makeStoreyBands` / `storeyBandPlan`（按等级在屋身腰位加腰檐 + 檐脊，使楼身看得出分层）。
 *   **不登记可行走面**（上层可达在本卡 inScope 内被 `faceOverlaps` 判据实测证伪，按卡内条款交回裁定说明）。
 * - **1.0.2**（2026-09-26，t39 塔楼城市级接线；**几何零改动**，只新增导出与工厂名）：
 *   导出 `makeTower` / `towerPlan` / `disposeTower`（+ `climbStepMax` / `climbSequenceReport` / `faceOverlaps` /
 *   `TOWER_SPECS` / `CLIMB_SAFETY`），并把 `kit.makeTower(params)`（绑定 `env`）与
 *   `stats().factories.towers` 接到既有构件库面；**不新增材质令牌、不新增合批桶**
 *   （`makeTower` 只用 `terrace/terraceCap/stairs/wallBody/roof/finial` 六个既有部位 × 既有材质）。
 *   理由：t37 的 blocker —— 塔楼几何需在 `src/kit/index.js` 导出并在 E 区调用；导出属 kit 域。
 * - **1.0.1**（2026-09-26，t22 + t25 的构件行为修正，本版为行为版本；几何与材质本身零变化：
 *   `KIT_VERSION` 由 1.0.0 → 1.0.1 **不改变任何三角面/metrics/worldBounds**，见 docs/handoff-t3-version.md）
 *   1. 合批阴影标志策略（t25）：`mergeZone`/`mergeByMaterial` 的合批网格现在**继承来源构件的
 *      `castShadow`/`receiveShadow`**，并统一走 `merge.shadowPolicy(config, part)`（全局开关
 *      `config.LIGHTING.shadows.enabled`；水面不投影但接收）。修复前合批网格回落 three 默认
 *      `castShadow=false` → 全城建筑合批后集体不投影（audit 分区阴影列 B 6 / C 0 / E 3 / F 11，
 *      修复后 B 58 / C 49 / E 39 / F 60）。实例化构件（`instance`/`instanceFromPoints`）默认投影+接收。
 *   2. `buildStairs` 台阶递升方向（t25）：踏面由 `(done+i+1)·stepHeight` 改为 `rise − (done+i)·stepHeight`
 *      —— 贴台明一侧最高、向远端逐级递降，与同函数的丹陛御路（`imperialRamp`）同向。
 *      修复前是反向楔形（最高踏面 4.5m 落在离台明最远处）。
 *   3. `buildStairs` 内部构件：**门洞开口与建筑形制解耦**（t22，含在 1.0.1 一并发布）：
 *      `hall`/`courtyardGate` 只要传入 `door`（或 `doorOpening`/`openFront`）即获得与
 *      `layout.door.width` 一致的正立面通行开口；`doubleEave` 不再因 `kind` 是"门"而降级；
 *      窗只由 kind 决定；新增 `metrics.opening = { width, height, openFraction, clearWidth, playerClearWidth, source }`。
 *   4. `kit.bridge` 新增**可选**拱券参数（t25）：`archRadius`/`archRise`/`archCrownY`/`archClearance`/
 *      `archSpringY`/`referenceY`，默认值与原表达式逐位同式（不传参数时几何完全不变），
 *      并回显 `metrics.arch = { radius, rise, crownY, springY, clearance, referenceY, tube }`。
 * - **1.0.0**（t3 首次交付）：参数化构件工厂 + config 令牌材质 + LOD/合批 + 资源登记。
 */
export const KIT_VERSION = '1.0.3';

const BUILDING_FACTORY_NAMES = Object.freeze([
  'hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'wall', 'courtyardGate', 'corridor', 'terrace', 'stairs', 'bridge',
]);
const PROP_FACTORY_NAMES = Object.freeze(['tree', 'rockery', 'lantern', 'railing', 'bronze', 'screenWall', 'water', 'paving']);
/** 室内陈设套件（t61）：一套工厂按 kind 分层覆盖殿/配殿/门殿/角楼。 */
const INTERIOR_FACTORY_NAMES = Object.freeze(['interiorSet']);
/** 可登塔楼工厂（t39）：`makeTower` 与 `towerPlan` 同源同轮（面/障碍/机位由同一 plan 派生）。 */
const TOWER_FACTORY_NAMES = Object.freeze(['makeTower', 'towerPlan', 'disposeTower', 'makeStoreyBands', 'storeyBandPlan']);

/**
 * 创建构件库。
 * @param {object} ctx 可选：{ THREE, config, quality, textureSizeOverride, onDiagnostic }
 *   - 未提供 ctx 时使用本地 vendored three 与 config（区域作者请传 ctx.THREE，保证全场同一份 three）。
 */
export function createKit(ctx = {}) {
  const THREE_NS = ctx.THREE ?? FALLBACK_THREE;
  const config = ctx.config ?? CONFIG;
  const quality = ctx.quality ?? config.QUALITY.default;
  const tier = qualityOf(config, quality);

  const diagnostics = [];
  const report = (kind, warnings, params) => {
    for (const warning of warnings) {
      const entry = { ...warning, kind, id: params?.id ?? null, at: diagnostics.length };
      diagnostics.push(entry);
      if (ctx.onDiagnostic) ctx.onDiagnostic(entry);
    }
    return warnings;
  };

  const materials = createMaterials({
    THREE: THREE_NS,
    config,
    quality,
    textureSizeOverride: ctx.textureSizeOverride ?? null,
    anisotropy: ctx.anisotropy ?? null,
  });
  for (const d of materials.diagnostics) diagnostics.push({ ...d, kind: 'materials', at: diagnostics.length });

  const deriveSeed = ctx.deriveSeed ?? sharedDeriveSeed;
  const env = { THREE: THREE_NS, config, materials, quality: tier, qualityId: quality, budget: config.BUDGET, report, diagnostics, deriveSeed };

  const buildingFactories = {};
  for (const name of ['hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'courtyardGate']) {
    buildingFactories[name] = (params = {}) => {
      if (name === 'courtyardGate' && !params.roofType) params = { ...params, roofType: 'gable' };
      return makeBuilding(env, name, params);
    };
  }
  buildingFactories.wall = (params = {}) => makeWall(env, params);
  buildingFactories.corridor = (params = {}) => makeCorridor(env, params);
  buildingFactories.terrace = (params = {}) => makeTerrace(env, params);
  buildingFactories.stairs = (params = {}) => makeStairs(env, params);
  buildingFactories.bridge = (params = {}) => makeBridge(env, params);

  const props = makeProps(env);
  const assets = createAssets({ config, kit: null });

  /** 释放只属于 kit 的资源：几何看 kitOwned 标记，材质/贴图看 materials.isOwned。 */
  function disposeObject(root) {
    const freed = { geometries: 0, materials: 0, meshes: 0 };
    if (!root) return freed;
    const seen = new Set();
    root.traverse?.((node) => {
      if (node.isMesh || node.isInstancedMesh) {
        freed.meshes += 1;
        const geometry = node.geometry;
        if (geometry && geometry.userData?.kitOwned === true && !seen.has(geometry)) {
          seen.add(geometry);
          geometry.dispose();
          freed.geometries += 1;
        }
        const material = node.material;
        if (material && !seen.has(material) && materials.isOwned(material)) {
          seen.add(material);
          material.dispose();
          freed.materials += 1;
        }
      }
    });
    return freed;
  }

  const kit = {
    version: KIT_VERSION,
    threeResolution: THREE_RESOLUTION,
    THREE: THREE_NS,
    config,
    quality,
    tier,
    materials,
    assets,
    diagnostics,

    // —— 构件工厂（CONTRACTS §3.4 冻结名称）
    ...buildingFactories,
    // —— 共享摆件工厂
    ...props,
    // —— 室内陈设套件（t61）：kit.interiorSet({ kind, grade, bounds, groundY, ceilingY, entrance, seed, lod })
    interiorSet: (params = {}) => buildInteriorSet(env, params),

    // —— 可登塔楼（t39）：几何与登记（walkable/obstacles/viewpoints）由**同一 plan** 派生
    makeTower: (params = {}) => buildTower(env, params),
    /** t41：腰檐分层（外观多层；不登记可行走面） */
    makeStoreyBands: (params = {}) => buildStoreyBands(env, params),
    storeyBandPlan: (params = {}) => buildStoreyBandPlan(params, config),
    towerPlan: (params = {}) => buildTowerPlan(params, config),
    disposeTower: (towers = []) => disposeTowers(towers),

    // —— 组合 / 批处理
    merge: (geometries, options) => mergeGeometries(THREE_NS, geometries, options),
    /**
     * 按共享材质合批（不区分 LOD 档；LOD 树按档分别处理）。与 `mergeZone` 同一套阴影继承规则。
     * 选项：`{ includeLOD=true, config=null }`；`config` 的语义与 `mergeZone` 相同（覆盖入口，
     * 不传则用 `src/shared/config.js` 的兜底 `CONFIG`）——需要覆盖时写 `kit.mergeByMaterial(root, { config })`。
     */
    mergeByMaterial: (root, options) => mergeByMaterial(THREE_NS, root, options),
    /**
     * 推荐：整区跨建筑合批（LOD 逐档合并，见 `src/kit/merge.js`）。
     *
     * 行为：把子树里所有普通 Mesh 按「材质 × 部位」合并，LOD 树**逐档**同样处理；
     * 合批网格**继承来源构件的 `castShadow`/`receiveShadow`**（并按阴影策略屏蔽水面投影），
     * 因此合批前后"投影三角面 / 投影部位集合"守恒（`tests/kit.test.mjs` §15 固化）。
     *
     * 选项：`{ name='kit-zone-batch', prune=false, epsilon=0.02, config=null }`
     *   - `config`：**阴影策略的覆盖入口**。本 wrapper 只把 `options` 原样透传给 `merge.js`，
     *     而 `merge.js` 内部以 `src/shared/config.js` 的 `CONFIG` 作为兜底（因为 wrapper 无法
     *     把调用方的 config 实例注入进去）。所以：
     *       · 不传 `config` → 用共享 `CONFIG`（默认行为，等价于 `config.LIGHTING.shadows.enabled = true`）；
     *       · 需要按**自定义/覆盖后的 config**（例如临时关闭阴影、或传入质量档相关的派生 config）执行时，
     *         必须显式写成 `kit.mergeZone(root, { config })`；直接 `kit.mergeZone(root)` 不会读取调用方的 config。
     *   - `prune`：合批后对每个网格做一次去不可见内部面（`removeInteriorFaces`）。
     *
     * @returns {{ root: THREE.Object3D, batch: THREE.Group, stats: { before:number, after:number, reduction:number, levels:number, buckets:number, mergedMeshes:number, instanced:number } }}
     */
    mergeZone: (root, options) => mergeZone(THREE_NS, root, options),
    pruneInterior: (root, options) => pruneInteriorFaces(THREE_NS, root, options),
    removeInteriorFaces: (geometry, options) => removeInteriorFaces(THREE_NS, geometry, options),
    removeCoincidentFaces: (geometry, options) => removeCoincidentFaces(THREE_NS, geometry, options),
    normalizeGeometry: (geometry, options) => normalizeGeometry(THREE_NS, geometry, options),
    instance: (meshOrGeometry, count, matricesOrFn, options) => {
      const geometry = meshOrGeometry.isMesh ? meshOrGeometry.geometry : meshOrGeometry;
      return instanceMesh(THREE_NS, geometry, meshOrGeometry.material ?? options?.material, count, matricesOrFn, options);
    },
    instanceFromPoints: (geometry, material, points, options) => instanceFromPoints(THREE_NS, geometry, material, points, options),
    lod: (levels, options) => makeLOD(THREE_NS, levels, { budget: config.BUDGET.lod, quality: tier, ...options }),
    makeLOD: (levels, options) => kit.lod(levels, options),

    // —— 统计 / 诊断
    countTriangles: (object) => countTriangles(object),
    countDrawCalls: (object) => countDrawCalls(object),
    drawCallBuckets: (object) => drawCallBuckets(object),
    tileMeters: (materialName) => materials.tileMeters(materialName),
    color: (token) => colorOf(config, token),
    colorChain: (token) => colorChain(config, token),

    // —— 令牌辅助（区域作者按需使用，禁止自己写数值）
    tokens: Object.freeze({
      gradeOf: (g) => gradeOf(config, g),
      roofOf: (r) => roofOf(config, r),
      moduleScale: (g) => moduleScale(config, g),
      roofPlanOf: (args) => roofPlanOf(config, args),
      eaveHeightOf: (terraceH, grade) => eaveHeightOf(config, terraceH, grade),
      localFootprint: (w, d, rotationYDeg) => localFootprint(w, d, rotationYDeg),
      bayMetrics: (localW, bays) => bayMetrics(localW, bays),
      PROPORTIONS,
      roofTypes: ROOF_TYPE_IDS,
      grades: GRADE_IDS,
      requiredParamFields: REQUIRED_PARAM_FIELDS,
    }),

    /** 只读快照：绘制调用/三角面/材质/贴图/diagnostics。 */
    stats(root = null) {
      const base = {
        version: KIT_VERSION,
        three: THREE_NS.REVISION,
        quality,
        materials: materials.stats(),
        assets: assets.stats(),
        diagnostics: diagnostics.map((d) => ({ code: d.code, kind: d.kind, id: d.id })),
        factories: {
          buildings: BUILDING_FACTORY_NAMES,
          props: PROP_FACTORY_NAMES,
          interiors: INTERIOR_FACTORY_NAMES,
          towers: TOWER_FACTORY_NAMES,
        },
      };
      if (root) {
        base.scene = {
          drawCalls: countDrawCalls(root),
          triangles: countTriangles(root),
          budget: { drawCalls: config.BUDGET.drawCalls.mainSceneMax, triangles: config.BUDGET.triangles.visibleMax },
        };
      }
      return base;
    },

    /** 某质量档下的空场景开销（供区域作者预估）。 */
    budgetFor: (area) => ({
      drawCalls: config.BUDGET.drawCalls.perZone[area] ?? config.BUDGET.drawCalls.reserve,
      triangles: config.BUDGET.triangles.visibleMax,
      perBuildingTriangles: config.BUDGET.triangles.perBuildingMax,
      textureSize: materials.textureSize,
      lodDistances: config.BUDGET.lod,
    }),

    isOwned: (material) => materials.isOwned(material),
    disposeObject,
    /** 释放 kit 自建的材质与贴图（区域/核心不应调用别人的 dispose；整场退出时由 t2 调用）。 */
    dispose() {
      const freed = { materials: materials.stats().materials, textures: materials.stats().textures, assets: assets.stats().registered };
      materials.dispose();
      assets.dispose();
      return freed;
    },
  };
  assets.kitRef = () => kit;
  return kit;
}

export default createKit;

export {
  CONFIG,
  FALLBACK_THREE as THREE,
  INTERIOR_KINDS,
  INTERIOR_MATERIALS,
  /* t39：塔楼工厂与面序列工具（`makeTower` 与 `towerPlan` 同源同轮） */
  buildTower as makeTower,
  buildStoreyBands as makeStoreyBands,
  buildStoreyBandPlan as storeyBandPlan,
  buildTowerPlan as towerPlan,
  disposeTowers as disposeTower,
  climbStepMax,
  climbSequenceReport,
  faceOverlaps,
  TOWER_SPECS,
  CLIMB_SAFETY,
  buildInteriorSet as interiorSet,
  sharedDeriveSeed as deriveSeed,
  THREE_RESOLUTION,
  BUILDING_FACTORY_NAMES,
  PROP_FACTORY_NAMES,
  makeBuilding, makeProps, makeWall, makeCorridor, makeTerrace, makeStairs, makeBridge,
  createMaterials, createAssets, makeRng, textureSizeFor,
  mergeByMaterial, mergeZone, pruneInteriorFaces, removeInteriorFaces, removeCoincidentFaces, makeLOD, instanceMesh, instanceFromPoints,
  countTriangles, countDrawCalls,
};
