/**
 * 唯一相机装置（计划 §6.4、CONTRACTS §5.3/§5.4）。
 *
 * 一个装置 = 一台透视相机 + 一台正交相机 + 一个镜头过渡器 + 一个第一人称内核；
 * 八种模式全部在这一个装置内实现，**不存在第二套相机控制**（没有 OrbitControls、没有区域自建相机）：
 *
 *   1 oblique  全城鸟瞰（透视，南侧高位斜俯，极角 8–78°，目标半径 ≤420m）
 *   2 iso      等距沙盘（**正交**，方位 45°、仰角 35.264°，机位固定于包络中心，极角锁定）
 *   3 axis     中轴透视（沿中轴分段推进，消费 layout.TOUR_POINTS）
 *   4 zone     分区视角（消费 config.CAMERA.zoneViewpointByArea 与各区域 zone 机位）
 *   5 focus    建筑近景（由 bounds + facing 计算正前方 3/4 取景，距离随体量自适应）
 *   6 interior 室内视角（消费 interior 机位，位置/目标夹在室内包围盒内）
 *   7 fp       第一人称（fp-spawn 出生、面高 + 1.65m 视线、台阶平滑、碰撞不可穿越）
 *   8 orbit    自由环绕（极角/距离/目标半径受限，可复位）
 *
 * 切换规则：`state.viewMode` 是唯一真相源；键盘 1–8 / UI 按钮 / F 全部发同一条请求事件
 * （`view:request-mode`），控制器改 state，本装置只对 `state:change` 做出反应，过渡固定 1.2s
 * （`config.CAMERA.transitionSeconds`，cubicInOut），结束发 `camera:settled`。
 *
 * 第一人称进入时记录原模式与全部机位参数，退出后原样恢复（`fp:entered` / `fp:exited`）。
 */

import * as THREE from 'three';
import { CONFIG, CAMERA, INTERACTION, ORIENTATION, EVENTS, QUALITY } from '../shared/config.js';
import { ENVELOPE, TERRAIN_EXTENT, TOUR_POINTS, VIEWPOINTS, WALKABLE, OBSTACLES, floorYAt, walkableAt } from '../shared/layout.js';

const DEG = Math.PI / 180;
const EPS = 1e-6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** cubicInOut（config.CAMERA.transitionEasing） */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const ENVELOPE_CENTER = Object.freeze({
  x: (ENVELOPE.minX + ENVELOPE.maxX) / 2,
  y: 0,
  z: (ENVELOPE.minZ + ENVELOPE.maxZ) / 2,
});

/** 球坐标偏移 → 世界偏移（模块级：默认机位与装置内部共用同一套公式）。 */
function orbitOffset({ distance, polar, azimuth }) {
  const sinPolar = Math.sin(polar);
  return {
    x: distance * sinPolar * Math.sin(azimuth),
    y: distance * Math.cos(polar),
    z: distance * sinPolar * Math.cos(azimuth),
  };
}

/** 操作面（t9 的 UI 与 rig 共用同一套输入语义，避免第二套控制逻辑）。 */
export const INPUT_KINDS = Object.freeze(['rotate', 'zoom', 'pan', 'reset']);

/* -------------------------------------------------------------------------- */
/*  默认机位（全部来自 layout/config，不写字面坐标）                            */
/* -------------------------------------------------------------------------- */

function defaultSpecFor(mode, ctx) {
  const { registry, store, viewport } = ctx;
  const vp = (id) => resolveViewpoint(id, registry);
  const cam = CONFIG.CAMERA;

  switch (mode) {
    case 'oblique': {
      const v = vp(CONFIG.CAMERA.zoneViewpointByArea.city) ?? vp('VP-city-oblique');
      if (v) return { mode, projection: 'perspective', position: { ...v.position }, target: { ...v.target }, fov: v.fov ?? cam.fov };
      return {
        mode,
        projection: 'perspective',
        position: { x: ENVELOPE_CENTER.x, y: 520, z: ENVELOPE_CENTER.z - 700 },
        target: { x: ENVELOPE_CENTER.x, y: 30, z: ENVELOPE_CENTER.z },
        fov: cam.fov,
      };
    }
    case 'iso': {
      const v = vp('VP-city-iso');
      const center = { x: ENVELOPE_CENTER.x, y: 20, z: ENVELOPE_CENTER.z };
      const target = v ? { ...v.target } : center;
      const azimuth = cam.isoAzimuthDeg * DEG;
      const polar = cam.isoElevationDeg * DEG;
      // 等距沙盘用正交投影：距离只影响雾与裁剪。取"不超过所有预设雾距一半"的距离，
      // 避免沙盘整屏被雾覆盖（真实教训：distance 2600 > 雾最远 2400 → 画面全被雾吃掉）。
      const minFogFar = Math.min(...Object.values(CONFIG.LIGHTING.presets).map((p) => p.fogFar));
      const distance = Math.min(isoZoomForFrustum(viewport).fitSize * 1.6, minFogFar * 0.5);
      return {
        mode,
        projection: 'orthographic',
        position: {
          x: target.x + distance * Math.sin(polar) * Math.sin(azimuth),
          y: target.y + distance * Math.cos(polar),
          z: target.z + distance * Math.sin(polar) * Math.cos(azimuth),
        },
        target,
        fov: cam.fov,
        // 机位固定在包络中心：极角锁定、距离锁定、目标锁定；只允许方位角缓慢环绕与正交缩放
        locked: { polar: true, distance: true, target: true, fov: true },
        zoom: 1,
      };
    }
    case 'axis': {
      const index = clamp(store?.view?.axisIndex ?? 1, 1, TOUR_POINTS.length);
      const tp = TOUR_POINTS[index - 1] ?? TOUR_POINTS[0];
      return { mode, projection: 'perspective', position: { ...tp.position }, target: { ...tp.target }, fov: cam.fov, axisIndex: index };
    }
    case 'zone': {
      const area = store?.view?.area ?? 'city';
      const id = store?.view?.viewpointId ?? cam.zoneViewpointByArea[area] ?? cam.zoneViewpointByArea.city;
      const v = vp(id);
      if (v) return { mode, projection: 'perspective', position: { ...v.position }, target: { ...v.target }, fov: v.fov ?? cam.fov, viewpointId: v.id, area: v.area ?? area };
      return defaultSpecFor('oblique', ctx);
    }
    case 'focus': {
      const id = store?.view?.focusBuildingId ?? store?.state?.selectedBuildingId ?? null;
      const building = id && registry?.getBuilding ? registry.getBuilding(id) : null;
      if (building) return { ...focusSpecFor(building), fov: cam.fov };
      const v = vp('VP-B-main-hall');
      if (v) return { mode, projection: 'perspective', position: { ...v.position }, target: { ...v.target }, fov: v.fov ?? cam.fov, viewpointId: v.id };
      return defaultSpecFor('oblique', ctx);
    }
    case 'interior': {
      const area = store?.view?.area ?? store?.view?.interiorArea ?? 'B';
      const id = store?.view?.interiorViewpointId ?? (area === 'C' ? 'VP-C-interior' : 'VP-B-interior');
      const v = vp(id);
      if (v) return interiorSpecFor(v);
      const v2 = vp(area === 'C' ? 'VP-C-interior' : 'VP-B-interior');
      if (v2) return interiorSpecFor(v2);
      return defaultSpecFor('zone', ctx);
    }
    case 'orbit': {
      // 自由环绕：与全城鸟瞰同一个注视点，但机位更近、方位偏 40°（便于取景），可任意环绕后复位
      const v = vp(CONFIG.CAMERA.zoneViewpointByArea.city);
      const target = v ? { ...v.target } : { ...ENVELOPE_CENTER, y: 20 };
      const base = v ? { ...v.position } : { x: 0, y: 420, z: -900 };
      const offset = { x: base.x - target.x, y: base.y - target.y, z: base.z - target.z };
      const distance = Math.hypot(offset.x, offset.y, offset.z) * 0.55;
      const polar = Math.max(cam.minPolarAngleDeg, Math.min(cam.maxPolarAngleDeg, 52)) * DEG;
      const azimuth = Math.atan2(offset.x, offset.z) - 40 * DEG;
      const dir = orbitOffset({ distance, polar, azimuth });
      return {
        mode,
        projection: 'perspective',
        position: { x: target.x + dir.x, y: target.y + dir.y, z: target.z + dir.z },
        target,
        fov: cam.fov,
      };
    }
    case 'fp':
    default: {
      const spawn = resolveFpSpawn(null, registry);
      const p = spawn?.position ?? { x: 0, y: CONFIG.CAMERA.fpEyeHeight, z: -300 };
      return {
        mode: 'fp',
        projection: 'perspective',
        position: { ...p },
        target: spawn?.target ? { ...spawn.target } : { x: p.x, y: p.y, z: p.z + 10 },
        fov: spawn?.fov ?? 70,
      };
    }
  }
}

function resolveViewpoint(id, registry) {
  if (!id) return null;
  if (registry?.getViewpoint) {
    const hit = registry.getViewpoint(id);
    if (hit) return hit;
  }
  return VIEWPOINTS.find((v) => v.id === id) ?? null;
}

function resolveFpSpawn(position, registry) {
  if (registry?.nearestFpSpawn) {
    const near = registry.nearestFpSpawn(position ?? { x: 0, y: 0, z: 0 });
    if (near) return near.viewpoint;
  }
  const pool = VIEWPOINTS.filter((v) => v.mode === 'fp-spawn');
  if (pool.length === 0) return null;
  if (!position) return pool[0];
  let best = pool[0];
  let bestDist = Infinity;
  for (const v of pool) {
    const d = Math.hypot(v.position.x - position.x, v.position.z - position.z);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

/**
 * 建筑的世界包围盒：优先 `userData.kit.worldBounds`（t3 kit 的**实测**包围盒，CONTRACTS §4.1），
 * 退化顺序：`building.worldBounds` → `building.group/mesh.userData.kit.worldBounds` → layout.bounds。
 * 取景、信息面板、验收一律以实测包围盒为准（layout.totalHeight 是估值）。
 */
export function buildingWorldBounds(building) {
  const direct = building?.worldBounds;
  const fromObject = building?.group?.userData?.kit?.worldBounds ?? building?.mesh?.userData?.kit?.worldBounds;
  const kitBounds = direct ?? fromObject ?? null;
  if (kitBounds && typeof kitBounds.minX === 'number') return kitBounds;
  const bounds = building?.bounds;
  if (!bounds) return null;
  return {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    minY: building.baseY ?? 0,
    maxY: building.totalHeight ?? (building.baseY ?? 0) + 12,
    source: 'layout.bounds（估值）',
  };
}

/** focus 模式：由环绕盒 + facing 计算正前方 3/4 取景（§6.4 第 5 行）。 */
export function focusSpecFor(building) {
  const box = buildingWorldBounds(building);
  const w = box ? box.maxX - box.minX : building.w ?? 20;
  const d = box ? box.maxZ - box.minZ : building.d ?? 20;
  const baseY = box ? box.minY : building.baseY ?? 0;
  const height = box ? Math.max(4, box.maxY - box.minY) : building.totalHeight ?? 20;
  const center = {
    x: box ? (box.minX + box.maxX) / 2 : building.x,
    y: baseY + height * 0.45,
    z: box ? (box.minZ + box.maxZ) / 2 : building.z,
  };
  const facing = ORIENTATION.facingVectors[building.facing] ?? ORIENTATION.facingVectors.south;
  // 正前方 ±35° → 3/4 视角
  const angle = 35 * DEG;
  const dir = {
    x: facing.x * Math.cos(angle) - facing.z * Math.sin(angle),
    z: facing.x * Math.sin(angle) + facing.z * Math.cos(angle),
  };
  const distance = Math.max(w, d) * 1.7 + height * 1.55;
  const lift = height * 0.5 + distance * 0.22;
  return {
    mode: 'focus',
    projection: 'perspective',
    position: { x: center.x + dir.x * distance, y: center.y + lift, z: center.z + dir.z * distance },
    target: center,
    buildingId: building.id,
  };
}

/** interior 模式：位置与目标夹在室内可行走面包围盒内（§6.4 第 6 行、CONTRACTS §5.3）。 */
export function interiorBoundsFor(area) {
  const surfaces = WALKABLE.filter((s) => s.kind === 'interior' && (area ? s.zone === area : true));
  if (surfaces.length === 0) return null;
  const s = surfaces[0];
  return { id: s.id, zone: s.zone, ...s.bounds, y: s.y, inset: 0.6 };
}

function interiorSpecFor(viewpoint) {
  const area = viewpoint.area ?? viewpoint.zone;
  const box = interiorBoundsFor(area);
  const position = { ...viewpoint.position };
  const target = { ...viewpoint.target };
  if (box) {
    position.x = clamp(position.x, box.minX + box.inset, box.maxX - box.inset);
    position.z = clamp(position.z, box.minZ + box.inset, box.maxZ - box.inset);
    target.x = clamp(target.x, box.minX + box.inset, box.maxX - box.inset);
    target.z = clamp(target.z, box.minZ + box.inset, box.maxZ - box.inset);
    position.y = clamp(position.y, box.y + 1.1, box.y + 3.4);
    target.y = clamp(target.y, box.y + 0.4, box.y + 3.6);
  }
  return {
    mode: 'interior',
    projection: 'perspective',
    position,
    target,
    fov: viewpoint.fov ?? CONFIG.CAMERA.fov,
    viewpointId: viewpoint.id,
    area,
    interiorBox: box,
    locked: { target: true },
  };
}

/** 正交相机的视锥半高：覆盖包络对角线并按 aspect 适配（iso 沙盘必须完整覆盖宫城）。 */
function isoZoomForFrustum(viewport) {
  const width = viewport?.width ?? 1440;
  const height = viewport?.height ?? 900;
  const aspect = width / Math.max(1, height);
  const diag = Math.hypot(ENVELOPE.maxX - ENVELOPE.minX, ENVELOPE.maxZ - ENVELOPE.minZ);
  const fit = (diag / 2) * 1.06;
  return { fitSize: fit / Math.max(0.2, Math.min(1, aspect)) };
}

/* -------------------------------------------------------------------------- */
/*  第一人称碰撞（内核自带的最小约束；t9 可用 setCollisionSolver 替换）           */
/* -------------------------------------------------------------------------- */

/**
 * 默认第一人称求解器：可行走面最高面 + 台阶阈值 + 障碍盒（含门洞）滑动 + 包络夹取。
 * 只依赖 layout 冻结数据，不做任何渲染。
 */
export function createFpSolver({ config = CONFIG } = {}) {
  const player = config.INTERACTION.player;
  const step = config.INTERACTION.step;
  const collision = config.INTERACTION.collision;

  const insideDoor = (door, bounds, x, z) => {
    if (!door || !bounds) return false;
    const halfWidth = door.width / 2 - player.radius;
    // 门洞是"穿透体块"的通道：横向受门宽限制，纵向必须覆盖整个体块厚度（否则会卡在门口）
    if (door.axis === 'z') {
      return Math.abs(x - door.center.x) <= halfWidth && z >= bounds.minZ - player.radius && z <= bounds.maxZ + player.radius;
    }
    return Math.abs(z - door.center.z) <= halfWidth && x >= bounds.minX - player.radius && x <= bounds.maxX + player.radius;
  };

  const blocks = (obstacle, x, z, feetY) => {
    const b = obstacle.bounds;
    if (x < b.minX - player.radius || x > b.maxX + player.radius) return false;
    if (z < b.minZ - player.radius || z > b.maxZ + player.radius) return false;
    // 站在障碍顶面之上（例如台基上的建筑）不算被挡
    if (feetY >= (obstacle.y1 ?? 0) - step.maxStepHeight * 0.5) return false;
    if (obstacle.blocks === 'exceptDoor' && insideDoor(obstacle.door, b, x, z)) return false;
    return true;
  };

  /** 求解一步移动：返回 {x, z, y, blocked} */
  function step1(from, dirX, dirZ, distance, options = {}) {
    const obstacles = options.obstacles ?? OBSTACLES;
    const feetY = (from.y ?? 0) - config.CAMERA.fpEyeHeight;
    let x = from.x;
    let z = from.z;
    const blocked = [];

    const tryMove = (dx, dz) => {
      const nx = x + dx;
      const nz = z + dz;
      if (collision.clampToEnvelope) {
        const clampedX = clamp(nx, TERRAIN_EXTENT.minX + player.radius, TERRAIN_EXTENT.maxX - player.radius);
        const clampedZ = clamp(nz, TERRAIN_EXTENT.minZ + player.radius, TERRAIN_EXTENT.maxZ - player.radius);
        if (Math.abs(clampedX - nx) > EPS || Math.abs(clampedZ - nz) > EPS) blocked.push('envelope');
        if (Math.abs(clampedX - nx) > EPS) return false;
        if (Math.abs(clampedZ - nz) > EPS) return false;
      }
      const surfaceY = floorYAt(nx, nz);
      if (surfaceY === null) {
        blocked.push('noSurface');
        return false;
      }
      if (surfaceY - feetY > step.maxStepHeight + EPS) {
        blocked.push('stepTooHigh');
        return false;
      }
      if (surfaceY - feetY < -step.snapDownDistance) {
        blocked.push('dropTooDeep');
        return false;
      }
      for (const obstacle of obstacles) {
        if (blocks(obstacle, nx, nz, feetY)) {
          blocked.push(obstacle.buildingId ?? obstacle.id);
          return false;
        }
      }
      return true;
    };

    const iterations = Math.max(1, collision.slideIterations);
    const dx = dirX * distance;
    const dz = dirZ * distance;
    if (tryMove(dx, dz)) {
      x += dx;
      z += dz;
    } else {
      // 滑动：先尝试单轴全量位移，再逐级衰减（最多 slideIterations 次）
      if (tryMove(dx, 0)) {
        x += dx;
      } else if (tryMove(0, dz)) {
        z += dz;
      } else {
        for (let i = 1; i <= iterations; i += 1) {
          const scale = 1 / 2 ** i;
          if (tryMove(dx * scale, dz * scale)) {
            x += dx * scale;
            z += dz * scale;
            break;
          }
        }
      }
    }

    const surfaceY = floorYAt(x, z);
    const y = (surfaceY === null ? from.y : surfaceY + config.CAMERA.fpEyeHeight);
    return { x, z, y, blocked };
  }

  return { step: step1 };
}

/* -------------------------------------------------------------------------- */
/*  相机装置                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {{
 *   config?: object, registry?: object, store?: object, events: object,
 *   domElement?: HTMLElement|null, input?: boolean, collisionSolver?: object
 * }} options
 */
export function createCameraRig({
  config = CONFIG,
  registry = null,
  store = null,
  events,
  domElement = null,
  input = false,
  collisionSolver = null,
} = {}) {
  if (!events) throw new Error('createCameraRig 需要事件总线');
  const cam = config.CAMERA;

  const perspective = new THREE.PerspectiveCamera(cam.fov, 16 / 9, cam.near, cam.far);
  const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, cam.near, cam.far);
  perspective.name = 'palace-camera-perspective';
  orthographic.name = 'palace-camera-orthographic';

  const viewport = { width: 1440, height: 900 };
  const position = new THREE.Vector3(0, 520, -1180);
  const target = new THREE.Vector3(0, 30, -60);
  let currentMode = store?.state?.viewMode ?? config.STATE_DEFAULTS.viewMode;
  let projection = 'perspective';
  let fov = cam.fov;
  let zoom = 1;
  let locked = {};
  let axisIndex = 1;
  let interiorBox = null;
  let yaw = 0;
  let pitch = 0;
  let moving = false;
  let fpActive = false;
  let savedFp = null;
  let solver = collisionSolver ?? createFpSolver({ config });
  /** 最近一次应用的机位规格（判断"同模式换目标"用） */
  let appliedSpec = null;
  const keys = new Set();
  const stats = { transitions: 0, settled: 0, fpEntries: 0, fpExits: 0, blockedMoves: 0, inputEvents: 0 };
  const disposers = [];
  const smooth = { y: null, velocity: 0 };

  const transition = {
    active: false,
    elapsed: 0,
    duration: cam.transitionSeconds,
    from: null,
    to: null,
  };

  /* ----------------------------- 基础工具 ----------------------------- */

  const activeCamera = () => (projection === 'orthographic' ? orthographic : perspective);

  function currentOffset() {
    return {
      x: position.x - target.x,
      y: position.y - target.y,
      z: position.z - target.z,
    };
  }

  function orbitParams() {
    const o = currentOffset();
    const distance = Math.max(EPS, Math.hypot(o.x, o.y, o.z));
    const polar = Math.acos(clamp(o.y / distance, -1, 1));
    const azimuth = Math.atan2(o.x, o.z);
    return { distance, polar, azimuth };
  }

  function offsetFromOrbit({ distance, polar, azimuth }) {
    const sinPolar = Math.sin(polar);
    return {
      x: distance * sinPolar * Math.sin(azimuth),
      y: distance * Math.cos(polar),
      z: distance * sinPolar * Math.cos(azimuth),
    };
  }

  /** 目标点半径限制（≤ config.CAMERA.targetRadiusLimit，§6.4）。 */
  function clampTarget(next) {
    const cx = ENVELOPE_CENTER.x;
    const cz = ENVELOPE_CENTER.z;
    const dx = next.x - cx;
    const dz = next.z - cz;
    const radius = Math.hypot(dx, dz);
    const limit = cam.targetRadiusLimit;
    if (radius <= limit) return next;
    const k = limit / radius;
    return { x: cx + dx * k, y: next.y, z: cz + dz * k };
  }

  /** 极角/距离限制（oblique/orbit）。 */
  function clampPolar(polarDeg) {
    return clamp(polarDeg, cam.minPolarAngleDeg, cam.maxPolarAngleDeg);
  }

  function snap(spec) {
    appliedSpec = spec;
    position.set(spec.position.x, spec.position.y, spec.position.z);
    const t = lockedTargetFor(spec);
    target.set(t.x, t.y, t.z);
    projection = spec.projection ?? 'perspective';
    fov = spec.fov ?? cam.fov;
    zoom = spec.zoom ?? zoom;
    locked = spec.locked ?? {};
    axisIndex = spec.axisIndex ?? axisIndex;
    interiorBox = spec.interiorBox ?? null;
    currentMode = spec.mode ?? currentMode;
    if (currentMode === 'fp') {
      const o = currentOffset();
      yaw = Math.atan2(o.x, o.z) + Math.PI;
      pitch = 0;
    }
    applyProjection();
  }

  function lockedTargetFor(spec) {
    const t = { ...spec.target };
    const mode = spec.mode ?? currentMode;
    if (mode === 'iso') {
      t.x = ENVELOPE_CENTER.x;
      t.z = ENVELOPE_CENTER.z;
      return t;
    }
    // 目标半径限制只作用于"自由取景"的两种模式（§6.4 第 1/8 行）；
    // axis/zone/focus/interior/fp 必须严格使用登记机位的目标点。
    if (mode === 'oblique' || mode === 'orbit') return clampTarget(t);
    return t;
  }

  function applyProjection() {
    const aspect = viewport.width / Math.max(1, viewport.height);
    if (projection === 'orthographic') {
      const fitSize = isoZoomForFrustum(viewport).fitSize;
      const halfH = fitSize / clamp(zoom, 0.35, 4);
      orthographic.left = -halfH * aspect;
      orthographic.right = halfH * aspect;
      orthographic.top = halfH;
      orthographic.bottom = -halfH;
      orthographic.zoom = 1;
      orthographic.updateProjectionMatrix();
      orthographic.position.copy(position);
      orthographic.lookAt(target);
    } else {
      perspective.fov = fov;
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
      perspective.position.copy(position);
      perspective.lookAt(target);
    }
    activeCamera().near = cam.near;
    activeCamera().far = cam.far;
    activeCamera().updateMatrixWorld();
  }

  /** 目标机位（供过渡与确定性测试使用）。 */
  function specForMode(mode) {
    return defaultSpecFor(mode, { registry, store, viewport });
  }

  function beginTransition(spec, { source = 'unknown', instant = false } = {}) {
    const nextTarget = lockedTargetFor(spec);
    if (instant || cam.transitionSeconds <= 0) {
      snap({ ...spec, target: nextTarget });
      transition.active = false;
      emitSettled(source);
      return;
    }
    transition.from = {
      position: position.clone(),
      target: target.clone(),
      fov,
      zoom,
      projection,
      mode: currentMode,
    };
    transition.to = {
      spec: { ...spec, target: nextTarget },
      position: new THREE.Vector3(spec.position.x, spec.position.y, spec.position.z),
      target: new THREE.Vector3(nextTarget.x, nextTarget.y, nextTarget.z),
      fov: spec.fov ?? cam.fov,
      zoom: spec.zoom ?? zoom,
      projection: spec.projection ?? 'perspective',
    };
    transition.active = true;
    transition.elapsed = 0;
    transition.duration = cam.transitionSeconds;
    appliedSpec = spec;
    stats.transitions += 1;
    // 过渡期间先切投影（iso 需要正交投影从第一帧就正确），位置/目标继续插值
    currentMode = spec.mode ?? currentMode;
    interiorBox = spec.interiorBox ?? null;
    locked = spec.locked ?? {};
    axisIndex = spec.axisIndex ?? axisIndex;
  }

  function emitSettled(source) {
    stats.settled += 1;
    events.emit(EVENTS.cameraSettled, {
      mode: currentMode,
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
      projection,
      source,
    });
  }

  /* ----------------------------- 八模式应用 ----------------------------- */

  function applyMode(mode, { source = 'unknown', instant = false } = {}) {
    if (mode === 'fp') {
      return enterFp({ source, instant });
    }
    if (currentMode === 'fp') exitFp({ source, reason: 'mode-change' });
    currentMode = mode;
    const spec = specForMode(mode);
    beginTransition(spec, { source, instant });
    return spec;
  }

  /** 第一人称进入：停在最近的有效可行走点（优先离当前机位最近的 fp-spawn），记录原机位（§5.4）。 */
  function enterFp({ source = 'unknown', instant = false, spawnId = null, position: forced = null } = {}) {
    if (fpActive) return null;
    const near = spawnId
      ? { viewpoint: resolveViewpoint(spawnId, registry) }
      : registry?.nearestFpSpawn
        ? registry.nearestFpSpawn(position)
        : { viewpoint: resolveFpSpawn(position, registry) };
    const spawn = near?.viewpoint ?? resolveFpSpawn(position, registry);
    const p = forced ?? (spawn ? { ...spawn.position } : null);
    if (!p) {
      console.warn('[camera] 找不到 fp-spawn，第一人称无法进入');
      return null;
    }
    const surface = floorYAt(p.x, p.z);
    const eyeY = surface === null ? p.y : surface + cam.fpEyeHeight;
    savedFp = {
      mode: currentMode === 'fp' ? 'oblique' : currentMode,
      position: position.clone(),
      target: target.clone(),
      fov,
      zoom,
      locked: { ...locked },
      axisIndex,
      interiorBox,
      projection,
    };
    fpActive = true;
    stats.fpEntries += 1;
    smooth.y = eyeY;
    currentMode = 'fp';
    projection = 'perspective';
    fov = spawn?.fov ?? 70;
    locked = {};
    const spawnTarget = spawn?.target ?? { x: p.x, y: eyeY, z: p.z - 10 };
    const dirX = spawnTarget.x - p.x;
    const dirZ = spawnTarget.z - p.z;
    yaw = Math.atan2(dirX, dirZ);
    pitch = 0;
    position.set(p.x, eyeY, p.z);
    transition.active = false;
    // 方向落位统一由 syncFpOrientation() 写回（单一真相源：yaw/pitch → target → 相机矩阵）
    syncFpOrientation();
    events.emit(EVENTS.fpEntered, { position: { x: position.x, y: position.y, z: position.z }, spawnId: spawn?.id ?? null, source });
    if (!instant) emitSettled(source);
    return { spawnId: spawn?.id ?? null, position: { x: position.x, y: position.y, z: position.z } };
  }

  /** 第一人称退出：恢复进入前的模式与全部机位参数（静默 = 只恢复相机，不改 state）。 */
  function exitFp({ source = 'unknown', reason = 'exit', silent = false } = {}) {
    if (!fpActive) return null;
    fpActive = false;
    keys.clear();
    const saved = savedFp;
    savedFp = null;
    stats.fpExits += 1;
    const restoredMode = saved?.mode ?? store?.view?.previousMode ?? config.STATE_DEFAULTS.viewMode;
    currentMode = restoredMode;
    if (saved) {
      position.copy(saved.position);
      target.copy(saved.target);
      fov = saved.fov;
      zoom = saved.zoom;
      locked = { ...saved.locked };
      axisIndex = saved.axisIndex;
      interiorBox = saved.interiorBox;
      projection = saved.projection;
      applyProjection();
    }
    events.emit(EVENTS.fpExited, { restoredMode, source, reason });
    if (!silent) {
      // 恢复后按当前模式重新取景（保证与 state 一致，机位参数不变）
      const spec = specForMode(restoredMode);
      beginTransition(spec, { source, instant: true });
    }
    return { restoredMode };
  }

  /* ----------------------------- state 反应 ----------------------------- */

  function onStateChange({ state, source }) {
    const mode = state.viewMode;
    if (mode === 'fp') {
      if (!fpActive) enterFp({ source: source ?? 'state' });
      return;
    }
    if (fpActive) {
      // 先静默恢复进入前的机位参数，再按请求的模式做一次正常过渡（F/Esc 恢复语义 §5.4）
      exitFp({ source: source ?? 'state', reason: 'state-change', silent: true });
      applyMode(mode, { source: source ?? 'state' });
      return;
    }
    if (mode !== currentMode) {
      applyMode(mode, { source: source ?? 'state' });
      return;
    }
    // 同模式但目标变了（如 zone 换区、focus 换建筑、axis 推进）
    if (mode === 'zone' || mode === 'focus' || mode === 'interior' || mode === 'axis') {
      const spec = specForMode(mode);
      const key = (s) => `${s?.viewpointId ?? ''}|${s?.buildingId ?? ''}|${s?.area ?? ''}|${s?.axisIndex ?? ''}`;
      if (key(spec) !== key(appliedSpec)) {
        appliedSpec = spec;
        beginTransition(spec, { source: source ?? 'state' });
      }
    }
  }

  /* ----------------------------- 输入 ----------------------------- */

  function requestMode(mode, source = 'api', extra = {}) {
    events.request(EVENTS.requestViewMode, { mode, source, ...extra });
  }

  function requestByIndex(index, source = 'keyboard') {
    const entry = cam.viewModes.find((m) => m.index === index);
    if (!entry) return false;
    requestMode(entry.mode, source);
    return true;
  }

  function setAxisIndex(index, { source = 'api', instant = false } = {}) {
    const next = clamp(Math.round(index), 1, TOUR_POINTS.length);
    axisIndex = next;
    // 中轴推进属于相机装置内部的机位推进（不改 viewMode）：写回内部视图记录，保持 state→机位一致
    if (store?.view) store.view.axisIndex = next;
    const spec = specForMode('axis');
    beginTransition(spec, { source, instant });
    return spec;
  }

  function advanceAxis(delta = 1, options = {}) {
    return setAxisIndex(axisIndex + delta, options);
  }

  /** 统一输入入口（t9 的 UI 拖动/滚轮也走这里，不另建控制器）。 */
  function applyInput(kind, payload = {}) {
    if (!INPUT_KINDS.includes(kind)) throw new Error(`camera.applyInput: 未知输入 "${kind}"（合法：${INPUT_KINDS.join('/')}）`);
    stats.inputEvents += 1;
    if (kind === 'reset') {
      return reset({ source: payload.source ?? 'input' });
    }
    if (fpActive) {
      if (kind === 'rotate') {
        yaw -= (payload.dx ?? 0) * 0.0026;
        pitch = clamp(pitch - (payload.dy ?? 0) * 0.0022, -80 * DEG, 80 * DEG);
      }
      // t31：立即把新方向写回 target 与相机矩阵 → 消费方随后同步读取即为新值
      syncFpOrientation();
      return describe();
    }
    const { distance, polar, azimuth } = orbitParams();
    if (kind === 'rotate') {
      const nextAzimuth = azimuth - (payload.dx ?? 0) * 0.0055;
      const nextPolar = locked.polar ? polar : clampPolar((polar - (payload.dy ?? 0) * 0.004) / DEG) * DEG;
      const offset = offsetFromOrbit({ distance, polar: nextPolar, azimuth: nextAzimuth });
      position.set(target.x + offset.x, target.y + offset.y, target.z + offset.z);
      applyProjection();
      return describe();
    }
    if (kind === 'zoom') {
      if (projection === 'orthographic') {
        zoom = clamp(zoom * (1 - (payload.amount ?? 0) * 0.0012), 0.35, 4);
      } else if (!locked.distance) {
        const nextDistance = clamp(distance * (1 + (payload.amount ?? 0) * 0.0016), cam.minDistance, cam.maxDistance);
        const offset = offsetFromOrbit({ distance: nextDistance, polar, azimuth });
        position.set(target.x + offset.x, target.y + offset.y, target.z + offset.z);
      }
      applyProjection();
      return describe();
    }
    if (kind === 'pan') {
      if (locked.target) return describe();
      const next = clampTarget({
        x: target.x - (payload.dx ?? 0) * 0.5,
        y: target.y,
        z: target.z - (payload.dy ?? 0) * 0.5,
      });
      const offset = currentOffset();
      target.set(next.x, next.y, next.z);
      position.set(next.x + offset.x, next.y + offset.y, next.z + offset.z);
      applyProjection();
      return describe();
    }
    return describe();
  }

  function bindInput(element = domElement, { keyboardTarget = null } = {}) {
    if (!element) return () => {};
    const pointer = { down: false, x: 0, y: 0, button: 0 };
    const onPointerDown = (event) => {
      pointer.down = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.button = event.button;
      element.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!pointer.down) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      applyInput('rotate', { dx, dy, button: pointer.button });
    };
    const onPointerUp = (event) => {
      pointer.down = false;
      element.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = (event) => {
      event.preventDefault();
      applyInput('zoom', { amount: event.deltaY });
    };
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('wheel', onWheel, { passive: false });

    const keyTarget = keyboardTarget ?? (typeof window !== 'undefined' ? window : null);
    const onKeyDown = (event) => {
      const code = event.code ?? '';
      // 1–8 → 视角模式（与 UI 按钮同一条请求事件）
      if (/^Digit[1-8]$/.test(code)) {
        requestByIndex(Number(code.slice(5)), 'keyboard');
        return;
      }
      if (code === 'Digit9' || code === 'Digit0') {
        const slot = code === 'Digit9' ? 'VP-E-court1' : 'VP-D-court1';
        const vp = resolveViewpoint(slot, registry);
        if (vp) {
          beginTransition({ mode: 'zone', projection: 'perspective', position: { ...vp.position }, target: { ...vp.target }, fov: vp.fov, viewpointId: vp.id }, { source: 'keyboard' });
        }
        return;
      }
      if (code === 'KeyF') {
        requestMode('fp', 'keyboard');
        return;
      }
      if (code === 'Escape') {
        if (fpActive) {
          requestMode('fp', 'keyboard'); // F 语义：切换退出并恢复原机位
        } else if (typeof document !== 'undefined' && document.exitPointerLock) {
          document.exitPointerLock();
        }
        return;
      }
      if (code === 'KeyR') {
        events.request(EVENTS.requestReset, { source: 'keyboard' });
        return;
      }
      keys.add(code);
      if (fpActive && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code)) {
        event.preventDefault?.();
      }
    };
    const onKeyUp = (event) => keys.delete(event.code ?? '');
    keyTarget?.addEventListener('keydown', onKeyDown);
    keyTarget?.addEventListener('keyup', onKeyUp);
    const onBlur = () => keys.clear();
    keyTarget?.addEventListener('blur', onBlur);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
      keyTarget?.removeEventListener('keydown', onKeyDown);
      keyTarget?.removeEventListener('keyup', onKeyUp);
      keyTarget?.removeEventListener('blur', onBlur);
    };
  }

  /* ----------------------------- 每帧更新 ----------------------------- */

  function updateFp(dt) {
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = cam.fpMoveSpeed * (run ? cam.fpRunMultiplier : 1);
    let forward = 0;
    let strafe = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
    moving = forward !== 0 || strafe !== 0;

    if (moving) {
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      let dirX = sin * forward + cos * strafe;
      let dirZ = cos * forward - sin * strafe;
      const len = Math.hypot(dirX, dirZ);
      if (len > EPS) {
        dirX /= len;
        dirZ /= len;
      }
      const result = solver.step(
        { x: position.x, y: position.y, z: position.z },
        dirX,
        dirZ,
        speed * dt,
        { obstacles: registry?.allObstacles ? registry.allObstacles() : OBSTACLES },
      );
      if (result.blocked?.length > 0) {
        stats.blockedMoves += 1;
        const hit = result.blocked.find((b) => !['envelope', 'noSurface', 'stepTooHigh', 'dropTooDeep'].includes(b));
        if (hit) {
          events.emit(EVENTS.blockedByBuilding, { buildingId: hit, reason: 'fp-collision', source: 'fp' });
        }
      }
      position.x = result.x;
      position.z = result.z;
      // 上下台阶平滑（config.INTERACTION.step.smoothSeconds）
      const k = dt / Math.max(1e-3, config.INTERACTION.step.smoothSeconds);
      smooth.y = smooth.y === null ? result.y : smooth.y + (result.y - smooth.y) * clamp(k, 0, 1);
      position.y = smooth.y;
    }

    syncFpOrientation();
  }

  /**
   * 第一人称朝向同步写回（t31 修复）。
   *
   * 旧时序：`applyInput('rotate')` 只改内部 `yaw/pitch`，`target` 要等**下一帧** `updateFp()` 才重算 →
   * 消费方同步读 `describe().azimuthDeg` / `rig.target` 恒为旧值，"朝向中轴/选中建筑"被静默跳过
   * （G 实测：校准恒为 0，且 `aims:0/aimFailures:0` 这种计数器恰好掩盖了"根本没尝试"）。
   *
   * 现在：`yaw/pitch` 是唯一真相源，任何改写它们的入口（rotate 输入、进入第一人称、每帧 updateFp）
   * 都立即调用本函数把 `target` 与相机矩阵同步到新方向，因此 rotate 之后**同步可读**。
   */
  function syncFpOrientation() {
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    target.copy(position).add(dir.multiplyScalar(10));
    applyProjection();
    return dir;
  }

  /** 当前视线方向（单位向量）：第一人称由 yaw/pitch 决定；其它模式为 (target - position) 归一化。 */
  function viewDirection(out = null) {
    const v = out ?? new THREE.Vector3();
    if (fpActive) {
      v.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      return v.normalize();
    }
    v.copy(target).sub(position);
    if (v.lengthSq() < EPS) v.set(0, 0, -1);
    return v.normalize();
  }

  function update(dt, elapsed, state) {
    if (transition.active) {
      transition.elapsed += Math.max(0, dt);
      const t = clamp(transition.elapsed / Math.max(EPS, transition.duration), 0, 1);
      const k = ease(t);
      const from = transition.from;
      const to = transition.to;
      position.lerpVectors(from.position, to.position, k);
      target.lerpVectors(from.target, to.target, k);
      fov = from.fov + (to.fov - from.fov) * k;
      zoom = from.zoom + (to.zoom - from.zoom) * k;
      projection = from.projection === to.projection ? from.projection : t >= 0.5 ? to.projection : from.projection;
      applyProjection();
      if (t >= 1) {
        transition.active = false;
        // 收敛到精确目标值（避免浮点残差）
        snap(to.spec);
        emitSettled('transition');
      }
      return;
    }
    if (fpActive) updateFp(Math.max(0, dt));
  }

  function reset({ source = 'api', instant = false } = {}) {
    if (fpActive) exitFp({ source, reason: 'reset', silent: true });
    currentMode = 'oblique';
    axisIndex = 1;
    zoom = 1;
    const spec = specForMode('oblique');
    beginTransition(spec, { source, instant });
    return describe();
  }

  function describe() {
    const { distance, polar, azimuth } = currentOffsetSafe();
    return {
      mode: currentMode,
      projection,
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
      distance,
      polarDeg: polar / DEG,
      azimuthDeg: azimuth / DEG,
      fov,
      zoom,
      transitioning: transition.active,
      progress: transition.active ? clamp(transition.elapsed / Math.max(EPS, transition.duration), 0, 1) : 1,
      locked: { ...locked },
      axisIndex,
      fpActive,
      interiorBox,
      /** 同步可读的视线方向（t31）：rotate 之后无需等待下一帧 */
      viewDirection: (() => {
        const v = viewDirection();
        return { x: v.x, y: v.y, z: v.z };
      })(),
    };
  }

  function currentOffsetSafe() {
    const o = currentOffset();
    const distance = Math.hypot(o.x, o.y, o.z);
    const polar = Math.acos(clamp(o.y / Math.max(EPS, distance), -1, 1));
    const azimuth = Math.atan2(o.x, o.z);
    return { distance, polar, azimuth };
  }

  function setViewportSize(width, height) {
    viewport.width = Math.max(1, width);
    viewport.height = Math.max(1, height);
    applyProjection();
  }

  function setCollisionSolver(next) {
    if (next && typeof next.step === 'function') solver = next;
    return solver;
  }

  function dispose() {
    for (const d of disposers) d();
    disposers.length = 0;
  }

  // 初始化：按 state 的初始模式落位（瞬时，避免首帧从原点飞入）
  snap(specForMode(currentMode === 'fp' ? 'oblique' : currentMode));

  return {
    // 相机对象（渲染唯一入口）
    get camera() {
      return activeCamera();
    },
    perspective,
    orthographic,
    get mode() {
      return currentMode;
    },
    get projection() {
      return projection;
    },
    get isFp() {
      return fpActive;
    },
    position,
    target,
    viewport,
    stats,
    // 契约方法
    update,
    setViewportSize,
    applyMode,
    applyInput,
    requestMode,
    requestByIndex,
    setAxisIndex,
    advanceAxis,
    enterFp,
    exitFp,
    reset,
    describe,
    viewDirection,
    syncFpOrientation,
    bindInput,
    setCollisionSolver,
    onStateChange,
    focusSpecFor,
    interiorBoundsFor,
    specForMode,
    dispose,
  };
}

export default createCameraRig;
