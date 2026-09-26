/**
 * `createZone(ctx)` 的上下文构造与**契约校验**（CONTRACTS §3）。
 *
 * 两条硬规则：
 *   1. `createZoneContext()` 只提供契约里写明的字段（外加少量明确标注的扩展），区域不需要也不应再 import 别的东西；
 *   2. `validateZoneResult()` 对返回值逐字段校验——**缺字段/数值与 layout 不一致一律抛 ZoneContractError**，
 *      绝不静默放过（"字段缺失要报错而不是静默"，任务卡第 5 条）。
 *
 * 零 three 依赖（THREE 由调用方注入），可在 Node 直接 import 并使用。
 */

import { CONFIG, EVENTS, MODULES, INTERACTION } from '../shared/config.js';
import * as LAYOUT from '../shared/layout.js';
import {
  zoneLayoutFor,
  cityLayout,
  deriveCityWallColliders,
  wallCollidersForZone,
  assembleBaselineObstacles,
  waterBodiesForZone,
  scenicObjectsForZone,
} from './layout-slice.js';
import { rngForZone, createRng } from './rng.js';

const CFG = CONFIG;

/** CONTRACTS §4 的建筑字段（必须逐字段存在）。 */
export const BUILDING_REQUIRED_FIELDS = Object.freeze([
  'id',
  'name',
  'kind',
  'category',
  'zone',
  'x',
  'z',
  'w',
  'd',
  'bays',
  'terraceH',
  'roofType',
  'grade',
  'facing',
  'rotationYDeg',
  'visitable',
  'bounds',
  'entrance',
  'door',
  'baseY',
  'bodyBaseY',
  'eaveHeight',
  'totalHeight',
  'usage',
  'info',
  'courtyard',
  'lodHint',
]);

/** CONTRACTS §3.3 的返回对象字段。 */
export const ZONE_RESULT_FIELDS = Object.freeze([
  'root',
  'buildings',
  'connectors',
  'colliders',
  'viewpoints',
  'lightAnchors',
  'update',
  'dispose',
]);

export const VIEWPOINT_MODES = Object.freeze(['zone', 'interior', 'fp-spawn', 'focus-extra']);
export const WALKABLE_KINDS = Object.freeze(['ground', 'terrace', 'interior', 'bridgeDeck', 'gardenGround', 'outerTerrain']);
export const LIGHT_ANCHOR_KINDS = Object.freeze(['lantern', 'torch', 'windowGlow']);
const ROOF_TYPE_KEYS = new Set(Object.keys(CFG.ROOF_TYPES));

export class ZoneContractError extends Error {
  constructor(zoneId, problems) {
    super(`区域 ${zoneId} 不符合 createZone 契约（${problems.length} 个问题）：\n  - ${problems.join('\n  - ')}`);
    this.name = 'ZoneContractError';
    this.zoneId = zoneId;
    this.problems = problems;
  }
}

const isObj = (v) => v !== null && typeof v === 'object';
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const near = (a, b, eps = 1e-6) => num(a) && num(b) && Math.abs(a - b) <= eps;

/**
 * 构造区域上下文（唯一入口）。
 * @param {{
 *   THREE: object, zoneId: string, kit?: object, assets?: object, events: object,
 *   registry?: object, quality?: string, shared?: object, config?: object, layout?: object,
 *   scope?: 'zone'|'city', greyboxSkipZones?: string[], extra?: object
 * }} options
 */
export function createZoneContext({
  THREE,
  zoneId,
  kit = null,
  assets = null,
  events,
  registry = null,
  quality = CONFIG.QUALITY.default,
  shared = null,
  config = CONFIG,
  layout = LAYOUT,
  scope = 'zone',
  greyboxSkipZones = [],
  extra = {},
} = {}) {
  if (!THREE) throw new Error('createZoneContext 需要 THREE（同一份 three，不得另装一份）');
  if (typeof zoneId !== 'string' || zoneId.length === 0) throw new Error('createZoneContext 需要 zoneId');
  if (!events) throw new Error('createZoneContext 需要事件总线');
  if (!config.QUALITY.tiers[quality]) throw new Error(`未知质量档 "${quality}"（合法：${config.QUALITY.order.join('/')}）`);

  const zoneLayout = scope === 'city' ? cityLayout() : zoneLayoutFor(zoneId);
  const sharedState = shared ?? {
    /** 共享材质池（t2/t3 维护；区域只读引用，不得销毁） */
    materials: {},
    /** 共享几何池 */
    geometries: {},
    /** 共享纹理池 */
    textures: {},
    /** 区域 dispose 时可注册自己的释放回调（只有自有资源） */
    disposeRegistry: [],
    /**
     * 全城墙体碰撞盒（core 统一派生，t23）：宫墙 + 院墙，含门洞净空与 `floorYAt` 标高。
     * 区域**不需要**再自己派生一遍；registry 已自动登记同一份结果，G 通过 `registry.allObstacles()` 消费。
     */
    wallColliders: deriveCityWallColliders(),
    /** 本区墙体的碰撞盒（= zoneLayout.wallColliders 的同一份数据，方便区域直接读） */
    zoneWallColliders: wallCollidersForZone(zoneId),
    /**
     * layout.OBSTACLES 的一等基线图层（t27，81 条）：水体换成"可拦人"的派生版、y0 下钳到足迹地坪、
     * 宫墙 4 条的 door.axis 翻正为面法线轴。registry 已自动登记同一份，区域**不要**再自补水体/下钳 y0。
     */
    baselineObstacles: assembleBaselineObstacles().list,
    /** 本区水体 / 点景（t27 切片，区域不必再从障碍盒反推水池） */
    zoneWaterBodies: waterBodiesForZone(zoneId),
    zoneScenicObjects: scenicObjectsForZone(zoneId),
    /** 水面（环境系统统一微波动画；区域把水面 mesh push 进来，或设 mesh.userData.waterSurface = true） */
    water: [],
    /** 灰盒等基础层需要跳过的区域（真实区域已装载时由 main.js 填入） */
    greyboxSkipZones: [...greyboxSkipZones],
  };
  if (!Array.isArray(sharedState.disposeRegistry)) sharedState.disposeRegistry = [];
  if (!Array.isArray(sharedState.water)) sharedState.water = [];
  sharedState.greyboxSkipZones = [...greyboxSkipZones];

  return {
    THREE,
    config,
    zoneLayout,
    /** 扩展（只读）：区域 id 与整城布局命名空间，方便区域查邻居/通道 */
    zoneId,
    scope,
    layout,
    registry,
    kit,
    assets,
    rng: scope === 'city' ? createRng(config.SCENE_SEED, 'greybox') : rngForZone(zoneId),
    events,
    quality,
    shared: sharedState,
    ...extra,
  };
}

/** 校验 ctx 本身是否完整（区域作者在 Node 内自测用）。 */
export function validateZoneContext(ctx) {
  const problems = [];
  for (const field of ['THREE', 'config', 'zoneLayout', 'kit', 'assets', 'rng', 'events', 'quality', 'shared']) {
    if (!(field in ctx)) problems.push(`ctx 缺少字段 ${field}`);
  }
  if (ctx.rng) {
    for (const fn of ['next', 'range', 'int', 'pick', 'bool', 'fork']) {
      if (typeof ctx.rng[fn] !== 'function') problems.push(`ctx.rng 缺少方法 ${fn}`);
    }
    if (!num(ctx.rng.seed)) problems.push('ctx.rng.seed 不是数字');
  }
  for (const fn of ['on', 'off', 'emit', 'request']) {
    if (typeof ctx.events?.[fn] !== 'function') problems.push(`ctx.events 缺少方法 ${fn}`);
  }
  if (ctx.zoneLayout?.slots && !Array.isArray(ctx.zoneLayout.slots)) problems.push('ctx.zoneLayout.slots 不是数组');
  return problems;
}

/**
 * 校验 `createZone()` 的返回值。
 * @param {string} zoneId
 * @param {object} result
 * @param {{ THREE: object, zoneLayout?: object, scope?: 'zone'|'city', expectBuildings?: number|null, strict?: boolean }} options
 * @returns {{ problems: string[], stats: object }}
 */
export function validateZoneResult(zoneId, result, options = {}) {
  const problems = [];
  /** 非致命提示（不影响合约成立）：例如区域自补的院墙碰撞将被 registry 去重。 */
  const warnings = [];
  const scope = options.scope ?? (zoneId === 'GREYBOX' ? 'city' : 'zone');
  const zoneLayout = options.zoneLayout ?? (scope === 'city' ? cityLayout() : zoneLayoutFor(zoneId));
  const THREE = options.THREE ?? null;
  const stats = {
    zoneId,
    scope,
    buildings: 0,
    connectors: 0,
    obstacles: 0,
    walkable: 0,
    ramps: 0,
    viewpoints: 0,
    viewpointsByMode: {},
    lightAnchors: 0,
    objects: 0,
    meshes: 0,
    triangles: 0,
  };

  if (!isObj(result)) {
    return { problems: [`createZone 必须返回对象，实际是 ${result === null ? 'null' : typeof result}`], stats };
  }

  // ---- 1. 顶层字段 ----
  for (const field of ZONE_RESULT_FIELDS) {
    if (!(field in result)) problems.push(`返回值缺少字段 "${field}"（CONTRACTS §3.3）`);
  }
  if (problems.length > 0) return { problems, stats };

  // ---- 2. root ----
  const root = result.root;
  const isObject3D = THREE ? root instanceof THREE.Object3D : !!(root && root.isObject3D);
  if (!isObject3D) problems.push('root 不是 THREE.Object3D（Group/Object3D）');
  else {
    if (root.parent !== null && root.parent !== undefined) problems.push('root 已被挂到父节点上：区域不得自行 scene.add（挂载归 main.js）');
    if (root.isScene) problems.push('root 不得是 Scene（场景挂载归 main.js）');
    for (const [key, value] of [['position', root.position], ['rotation', root.rotation], ['scale', root.scale]]) {
      if (!value) {
        problems.push(`root.${key} 不存在`);
        continue;
      }
      const identity = key === 'scale' ? [1, 1, 1] : [0, 0, 0];
      if (!near(value.x, identity[0]) || !near(value.y, identity[1]) || !near(value.z, identity[2])) {
        problems.push(`root.${key} 不是单位变换（要求 (${
          identity.join(', ')
        })，实际 (${value.x}, ${value.y}, ${value.z})）：世界坐标必须直接烘焙进子物体`);
      }
    }
    // 递归统计
    root.traverse?.((child) => {
      stats.objects += 1;
      if (child.isMesh || child.isPoints || child.isLine || child.isSprite) {
        stats.meshes += 1;
        const geo = child.geometry;
        if (geo) {
          const indexCount = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
          const tris = Math.floor(indexCount / 3) * (child.isInstancedMesh ? child.count : 1);
          stats.triangles += tris;
        }
      }
    });
  }

  // ---- 3. buildings ----
  if (!Array.isArray(result.buildings)) problems.push('buildings 不是数组');
  else {
    stats.buildings = result.buildings.length;
    const expectedSlots = scope === 'city' ? LAYOUT.SLOTS : LAYOUT.SLOTS.filter((s) => s.zone === zoneId);
    const expectedById = new Map(expectedSlots.map((s) => [s.id, s]));
    const seen = new Set();
    for (const [i, b] of result.buildings.entries()) {
      const at = `buildings[${i}]${isObj(b) && b.id ? ` (${b.id})` : ''}`;
      if (!isObj(b)) {
        problems.push(`${at} 不是对象`);
        continue;
      }
      for (const field of BUILDING_REQUIRED_FIELDS) {
        if (!(field in b)) problems.push(`${at} 缺少字段 ${field}`);
      }
      if (typeof b.id !== 'string') continue;
      if (seen.has(b.id)) problems.push(`建筑 id 在本次返回中重复：${b.id}`);
      seen.add(b.id);
      const source = expectedById.get(b.id);
      if (!source) {
        problems.push(`${at} 不在 ${scope === 'city' ? 'layout.SLOTS' : `layout 的区域 ${zoneId} 槽位表`} 中（不得新增建筑槽位）`);
        continue;
      }
      // 数值回显校验（区域不得改共享数值）
      const echo = [
        ['name', source.name],
        ['kind', source.kind],
        ['category', source.category],
        ['zone', source.zone],
        ['x', source.x],
        ['z', source.z],
        ['w', source.w],
        ['d', source.d],
        ['bays', source.bays],
        ['terraceH', source.terraceH],
        ['roofType', source.roofType],
        ['grade', source.grade],
        ['facing', source.facing],
        ['rotationYDeg', source.rotationYDeg],
        ['visitable', source.visitable],
        ['baseY', source.baseY],
        ['bodyBaseY', source.bodyBaseY],
        ['eaveHeight', source.eaveHeight],
        ['totalHeight', source.totalHeight],
        ['lodHint', source.lodHint],
      ];
      for (const [key, want] of echo) {
        if (b[key] !== want) problems.push(`${at}.${key} = ${JSON.stringify(b[key])}，与 layout 的 ${JSON.stringify(want)} 不一致`);
      }
      if (!isObj(b.bounds)) problems.push(`${at}.bounds 缺失或不是对象`);
      else if (!near(b.bounds.minX, source.bounds.minX, 1e-3) || !near(b.bounds.maxX, source.bounds.maxX, 1e-3) || !near(b.bounds.minZ, source.bounds.minZ, 1e-3) || !near(b.bounds.maxZ, source.bounds.maxZ, 1e-3)) {
        problems.push(`${at}.bounds 与 layout 不一致`);
      }
      if (!isObj(b.entrance) || !num(b.entrance.x) || !num(b.entrance.y) || !num(b.entrance.z)) problems.push(`${at}.entrance 必须是 {x,y,z}`);
      else if (!near(b.entrance.x, source.entrance.x, 0.02) || !near(b.entrance.z, source.entrance.z, 0.02)) problems.push(`${at}.entrance 与 layout 不一致`);
      if (source.door === null) {
        if (b.door !== null) problems.push(`${at}.door 应为 null（layout 未登记门洞）`);
      } else if (!isObj(b.door) || b.door.width !== source.door.width) {
        problems.push(`${at}.door 与 layout 不一致（应为 width=${source.door.width}）`);
      }
      if (!ROOF_TYPE_KEYS.has(b.roofType)) problems.push(`${at}.roofType "${b.roofType}" 不在 config.ROOF_TYPES 中`);
      if (![1, 2, 3].includes(b.grade)) problems.push(`${at}.grade 必须是 1/2/3`);
      // CONTRACTS §4.2（CONFIG 1.0.1）：等级-屋顶白名单，机器守卫
      const allowedRoofs = CFG.GRADES[b.grade]?.roofTypes;
      if (allowedRoofs && !allowedRoofs.includes(b.roofType)) {
        problems.push(`${at}.roofType "${b.roofType}" 不在 grade ${b.grade} 的白名单（${allowedRoofs.join('/')}）内`);
      }
    }
    for (const id of expectedById.keys()) if (!seen.has(id)) problems.push(`缺少建筑 ${id}（区域必须实现 layout 分配给它的全部槽位）`);
    if (options.expectBuildings !== undefined && options.expectBuildings !== null) {
      const all = scope === 'city' ? LAYOUT.SLOTS.length : expectedSlots.length;
      if (all !== stats.buildings) problems.push(`建筑数量 ${stats.buildings} != layout 期望 ${all}`);
    }
  }

  // ---- 4. connectors ----
  if (!Array.isArray(result.connectors)) problems.push('connectors 不是数组');
  else {
    stats.connectors = result.connectors.length;
    const allowed = new Map(
      (scope === 'city' ? LAYOUT.CONNECTORS : LAYOUT.CONNECTORS.filter((c) => c.owner === zoneId)).map((c) => [c.id, c]),
    );
    for (const [i, c] of result.connectors.entries()) {
      const at = `connectors[${i}]${isObj(c) && c.id ? ` (${c.id})` : ''}`;
      if (!isObj(c) || typeof c.id !== 'string') {
        problems.push(`${at} 必须是带字符串 id 的对象`);
        continue;
      }
      const source = allowed.get(c.id);
      if (!source) {
        problems.push(`${at} 不是本人 owner 的通道（CONTRACTS §5 每个连接只有一个 owner）`);
        continue;
      }
      for (const [key, want] of [
        ['position', source.position],
        ['width', source.width],
        ['elevation', source.elevation],
      ]) {
        if (key === 'position') {
          if (!isObj(c.position) || !near(c.position.x, want.x, 1e-3) || !near(c.position.z, want.z, 1e-3)) problems.push(`${at}.position 与 layout 不一致`);
        } else if (c[key] !== want) problems.push(`${at}.${key} = ${JSON.stringify(c[key])}，与 layout 的 ${JSON.stringify(want)} 不一致`);
      }
    }
    if (scope === 'zone') {
      for (const [id] of allowed) {
        if (!result.connectors.some((c) => c.id === id)) problems.push(`缺少本人 owner 的通道 ${id}`);
      }
    }
  }

  // ---- 5. colliders ----
  const colliders = result.colliders;
  if (!isObj(colliders)) problems.push('colliders 必须是 {obstacles, walkable, ramps}');
  else {
    for (const key of ['obstacles', 'walkable', 'ramps']) {
      if (!Array.isArray(colliders[key])) problems.push(`colliders.${key} 不是数组`);
    }
    if (Array.isArray(colliders.obstacles)) {
      stats.obstacles = colliders.obstacles.length;
      for (const [i, o] of colliders.obstacles.entries()) {
        const at = `colliders.obstacles[${i}]${isObj(o) && o.id ? ` (${o.id})` : ''}`;
        if (!isObj(o) || typeof o.id !== 'string') {
          problems.push(`${at} 必须带字符串 id`);
          continue;
        }
        if (!isObj(o.bounds)) problems.push(`${at}.bounds 缺失`);
        if (!num(o.y0) || !num(o.y1)) problems.push(`${at} 缺少 y0/y1`);
        if (!['all', 'exceptDoor'].includes(o.blocks)) problems.push(`${at}.blocks 必须是 'all' | 'exceptDoor'`);
        if (o.blocks === 'exceptDoor' && !isObj(o.door)) problems.push(`${at} blocks='exceptDoor' 时必须给出门洞 door`);
        if (!['building', 'wall', 'water', 'rockery'].includes(o.sourceType)) problems.push(`${at}.sourceType 非法：${o.sourceType}`);
      }
      // t23/t27：区域自补的墙体/水体/y0 下钳副本会与 core 内建图层去重（不双倍阻挡），这里给出非致命提示便于对账
      const coreWallIds = new Set(deriveCityWallColliders().map((o) => o.id));
      const coreWallIdList = [...coreWallIds];
      const baseline = assembleBaselineObstacles().list;
      const baselineIds = new Set(baseline.map((o) => o.id));
      const baselineWaters = baseline.filter((o) => o.sourceType === 'water');
      const duplicatedWalls = colliders.obstacles.filter(
        (o) => o && o.sourceType === 'wall' && (coreWallIds.has(o.id) || coreWallIdList.some((wid) => wid.startsWith(`OB-${o.buildingId}-`))),
      );
      const near = (a, b, eps = 0.001) => Math.abs((a ?? 0) - (b ?? 0)) <= eps;
      const baselineById = new Map(baseline.map((o) => [o.id, o]));
      // 纯回显（契约要求：区域必须回显 layout 分配到的障碍）**不提示**；
      // 只有"回显后被改动"（自行 y0 下钳 / 改包围盒 / 改门洞轴）才提示 —— 那才是区域侧补丁。
      const duplicatedBaseline = colliders.obstacles.filter((o) => {
        // 水体条目由 core 主动"升级"（顶面抬到可拦人），纯回显不算区域补丁 → 交给水体提示分支处理
        if (!o || !baselineIds.has(o.id) || o.sourceType === 'water') return false;
        const base = baselineById.get(o.id);
        if (!base.bounds || !o.bounds) return true;
        const boundsDiffer =
          !near(base.bounds.minX, o.bounds.minX, 0.05) ||
          !near(base.bounds.maxX, o.bounds.maxX, 0.05) ||
          !near(base.bounds.minZ, o.bounds.minZ, 0.05) ||
          !near(base.bounds.maxZ, o.bounds.maxZ, 0.05);
        // 说明：y0 的差异不算"区域补丁" —— 基线本身就是"y0 下钳到足迹地坪"的派生结果，
        // 纯回显必然带着 layout 的原始 y0；只有**自行改动包围盒**才算改动（那才会改变阻挡范围）。
        return boundsDiffer;
      });
      const duplicatedWater = colliders.obstacles.filter(
        (o) =>
          o &&
          o.sourceType === 'water' &&
          !baselineIds.has(o.id) &&
          baselineWaters.some(
            (w) =>
              o.bounds &&
              o.bounds.minX >= w.bounds.minX - 0.5 &&
              o.bounds.maxX <= w.bounds.maxX + 0.5 &&
              o.bounds.minZ >= w.bounds.minZ - 0.5 &&
              o.bounds.maxZ <= w.bounds.maxZ + 0.5,
          ),
      );
      if (duplicatedBaseline.length > 0) {
        warnings.push(
          `${zoneId} 回显的 ${duplicatedBaseline.length} 条 layout 基线障碍**包围盒与基线不同**（疑似自行改动）；` +
            'registry 现在内建基线图层并会去重（保留 core 归一版本：y0 已按足迹地坪下钳、水体已抬到可拦人）。' +
            '建议区域改为直接消费 ctx.shared.baselineObstacles / zoneLayout.waterBodies，删除自补补丁。',
        );
      }
      if (duplicatedWater.length > 0) {
        warnings.push(
          `${zoneId} 自报了 ${duplicatedWater.length} 条水体拦阻盒，已被 core 派生水体盒（顶面 = 岸边地坪 + 0.6m）覆盖；registry 会按"包含关系"去重。`,
        );
      }
      if (duplicatedWalls.length > 0) {
        warnings.push(
          `${zoneId} 自报了 ${duplicatedWalls.length} 条墙体碰撞盒，与 core 从 layout.WALLS 派生的结果重复；` +
            'registry 会去重（保留 core 派生版本，不产生双倍阻挡/额外绘制）。建议区域改为消费 zoneLayout.wallColliders。',
        );
      }
    }
    if (Array.isArray(colliders.walkable)) {
      stats.walkable = colliders.walkable.length;
      for (const [i, w] of colliders.walkable.entries()) {
        const at = `colliders.walkable[${i}]${isObj(w) && w.id ? ` (${w.id})` : ''}`;
        if (!isObj(w) || typeof w.id !== 'string') {
          problems.push(`${at} 必须带字符串 id`);
          continue;
        }
        if (!isObj(w.bounds)) problems.push(`${at}.bounds 缺失`);
        if (!num(w.y)) problems.push(`${at}.y 必须是数字`);
        if (!WALKABLE_KINDS.includes(w.kind)) problems.push(`${at}.kind 非法：${w.kind}（合法：${WALKABLE_KINDS.join('/')}）`);
        if (typeof w.enterable !== 'boolean') problems.push(`${at}.enterable 必须是布尔`);
      }
    }
    if (Array.isArray(colliders.ramps)) {
      stats.ramps = colliders.ramps.length;
      for (const [i, r] of colliders.ramps.entries()) {
        const at = `colliders.ramps[${i}]${isObj(r) && r.id ? ` (${r.id})` : ''}`;
        if (!isObj(r) || typeof r.id !== 'string') {
          problems.push(`${at} 必须带字符串 id`);
          continue;
        }
        if (!isObj(r.from) || !isObj(r.to)) problems.push(`${at} 缺少 from/to`);
        if (!num(r.width)) problems.push(`${at}.width 必须是数字`);
        if (!num(r.slope)) problems.push(`${at}.slope 必须是数字`);
        else if (r.slope > INTERACTION.step.rampMaxSlope + 1e-6) {
          problems.push(`${at}.slope=${r.slope} 超过可走坡上限 ${INTERACTION.step.rampMaxSlope}`);
        }
      }
    }
  }

  // ---- 6. viewpoints ----
  if (!Array.isArray(result.viewpoints)) problems.push('viewpoints 不是数组');
  else {
    stats.viewpoints = result.viewpoints.length;
    const byMode = {};
    for (const [i, vp] of result.viewpoints.entries()) {
      const at = `viewpoints[${i}]${isObj(vp) && vp.id ? ` (${vp.id})` : ''}`;
      if (!isObj(vp) || typeof vp.id !== 'string' || vp.id.length === 0) {
        problems.push(`${at} 必须带字符串 id`);
        continue;
      }
      for (const field of ['name', 'mode', 'position', 'target']) {
        if (!(field in vp)) problems.push(`${at} 缺少字段 ${field}`);
      }
      if (!VIEWPOINT_MODES.includes(vp.mode)) problems.push(`${at}.mode 非法：${vp.mode}（合法：${VIEWPOINT_MODES.join('/')}）`);
      byMode[vp.mode] = (byMode[vp.mode] ?? 0) + 1;
      for (const key of ['position', 'target']) {
        const p = vp[key];
        if (!isObj(p) || !num(p.x) || !num(p.y) || !num(p.z)) problems.push(`${at}.${key} 必须是 {x,y,z}`);
      }
      if (['fp-spawn', 'interior'].includes(vp.mode) && isObj(vp.position)) {
        const surface = LAYOUT.walkableAt(vp.position.x, vp.position.z).find((s) => (vp.mode === 'interior' ? s.kind === 'interior' : true));
        if (!surface) {
          problems.push(`${at} 不在可行走面上（${vp.mode} 必须落在 layout.WALKABLE 内）`);
        } else {
          const want = surface.y + CONFIG.CAMERA.fpEyeHeight;
          if (Math.abs(vp.position.y - want) > 0.05) {
            problems.push(`${at}.position.y=${vp.position.y}，应为面高 ${surface.y} + 视高 ${CONFIG.CAMERA.fpEyeHeight} = ${want}（±0.05）`);
          }
        }
      }
      if (vp.mode === 'zone') {
        const inside = LAYOUT.ENVELOPE;
        if (isObj(vp.target) && (vp.target.x < inside.minX - 200 || vp.target.x > inside.maxX + 200 || vp.target.z < inside.minZ - 200 || vp.target.z > inside.maxZ + 200)) {
          problems.push(`${at}.target 偏离包络过远`);
        }
      }
    }
    stats.viewpointsByMode = byMode;
    const needZone = 1;
    if ((byMode.zone ?? 0) < needZone) problems.push(`viewpoints 至少需要 ${needZone} 个 mode='zone' 机位（实际 ${byMode.zone ?? 0}）`);
    if ((byMode['fp-spawn'] ?? 0) < 1) problems.push(`viewpoints 至少需要 1 个 mode='fp-spawn' 出生点（实际 ${byMode['fp-spawn'] ?? 0}）`);
    if (['B', 'C'].includes(zoneId) && (byMode.interior ?? 0) < 1) {
      problems.push(`区域 ${zoneId} 必须额外提供 1 个 mode='interior' 室内机位（CONTRACTS §5.2）`);
    }
    const ids = new Set();
    for (const vp of result.viewpoints) {
      if (!isObj(vp) || typeof vp.id !== 'string') continue;
      if (ids.has(vp.id)) problems.push(`viewpoint id 在本次返回中重复：${vp.id}`);
      ids.add(vp.id);
    }
  }

  // ---- 7. lightAnchors ----
  if (!Array.isArray(result.lightAnchors)) problems.push('lightAnchors 不是数组');
  else {
    stats.lightAnchors = result.lightAnchors.length;
    for (const [i, a] of result.lightAnchors.entries()) {
      const at = `lightAnchors[${i}]${isObj(a) && a.id ? ` (${a.id})` : ''}`;
      if (!isObj(a) || typeof a.id !== 'string') {
        problems.push(`${at} 必须带字符串 id`);
        continue;
      }
      if (!LIGHT_ANCHOR_KINDS.includes(a.kind)) problems.push(`${at}.kind 非法：${a.kind}（合法：${LIGHT_ANCHOR_KINDS.join('/')}）`);
      if (!isObj(a.position) || !num(a.position.x) || !num(a.position.y) || !num(a.position.z)) problems.push(`${at}.position 必须是 {x,y,z}`);
      if (!num(a.height)) problems.push(`${at}.height 必须是数字`);
      if (scope === 'zone' && a.zone !== undefined && a.zone !== zoneId) problems.push(`${at}.zone=${a.zone} 与区域 ${zoneId} 不符`);
    }
  }

  // ---- 8. 回调 ----
  if (typeof result.update !== 'function') problems.push('update 必须是函数 (dtSeconds, elapsedSeconds, state) => void');
  if (typeof result.dispose !== 'function') problems.push('dispose 必须是函数 () => void');

  return { problems, warnings, stats };
}

/** 校验失败即抛（main.js / tests / audit 共用）；warnings 通过 `options.onWarning` 上报。 */
export function assertZoneResult(zoneId, result, options = {}) {
  const { problems, warnings, stats } = validateZoneResult(zoneId, result, options);
  if (problems.length > 0) throw new ZoneContractError(zoneId, problems);
  if (warnings.length > 0) {
    if (typeof options.onWarning === 'function') options.onWarning(warnings, zoneId);
    else console.info(`[context] 区域 ${zoneId} 提示：${warnings.join('；')}`);
  }
  return stats;
}

/** 供区域作者与测试使用：允许的建造模数（只读）。 */
export const MODULES_READONLY = MODULES;
export const EVENTS_READONLY = EVENTS;

export default createZoneContext;
