// F · 御花园 + 宫城边界与水系
// 同时服务两个分区：
//   createGarden(ctx) —— zone.id === 'garden'
//   createZone(ctx)   —— zone.id === 'boundary'
// 只登记数据；护城河水面/外圈地形由 core/terrain.js 提供，本文件不重复生成。

import { CITY } from '../shared/config.js';

const TIER_TERRACE = { royal: 4.5, major: 1.8, minor: 1.0 };

function normRot(rot) {
  return ((Math.round(rot || 0) % 360) + 360) % 360;
}

// 生产与测试都传入 ctx.rng === rngFor（工厂函数）；rngFor(name) 返回确定性生成器。
function deriveRng(ctx, name) {
  const src = ctx && ctx.rng;
  if (typeof src === 'function') {
    try {
      const gen = src(name);
      if (typeof gen === 'function') return gen;
    } catch (err) {
      /* 回退到确定性常量，避免抛错 */
    }
  }
  return () => 0.5;
}

// ---- 包围盒 / 障碍 -----------------------------------------------------------

function bbObstacle(bb) {
  return {
    min: [bb.min.x, Math.min(0, bb.min.y), bb.min.z],
    max: [bb.max.x, bb.max.y, bb.max.z]
  };
}

// 门类建筑（城门城台 / 园门）在中央留出门洞，避免把跨区通道堵死。
function doorObstacles(bb, rot, gapHalf) {
  const min = bb.min, max = bb.max, r = normRot(rot), out = [];
  if (r === 0 || r === 180) {
    const cx = (min.x + max.x) / 2;
    if (cx - gapHalf > min.x) out.push({ min: [min.x, Math.min(0, min.y), min.z], max: [cx - gapHalf, max.y, max.z] });
    if (max.x > cx + gapHalf) out.push({ min: [cx + gapHalf, Math.min(0, min.y), min.z], max: [max.x, max.y, max.z] });
  } else {
    const cz = (min.z + max.z) / 2;
    if (cz - gapHalf > min.z) out.push({ min: [min.x, Math.min(0, min.y), min.z], max: [max.x, max.y, cz - gapHalf] });
    if (max.z > cz + gapHalf) out.push({ min: [min.x, Math.min(0, min.y), cz + gapHalf], max: [max.x, max.y, max.z] });
  }
  return out.length ? out : [bbObstacle(bb)];
}

// ---- 台基 / 台阶可行走面 -----------------------------------------------------

function terraceHeightOf(slot) {
  switch (slot.kind) {
    case 'cornerTower': return 0;
    case 'pavilion': return slot.tier === 'royal' ? 2.2 : 1.4;
    case 'courtyardGate': return 1.2;
    case 'gateHall': return slot.drum ? 0 : (TIER_TERRACE[slot.tier] || 1.0);
    default: return slot.terrace ? (TIER_TERRACE[slot.tier] || 1.0) : 0.9;
  }
}

function addTerraceSurfaces(ctx, slot, bb, surfaces) {
  const terrY = terraceHeightOf(slot);
  if (!(terrY > 0.2)) return;
  const step = (ctx.config && ctx.config.FP && ctx.config.FP.step) || 0.55;
  const pad = 2.6;
  surfaces.push({
    id: `${slot.id}.terrace`,
    min: [bb.min.x - pad, 0, bb.min.z - pad],
    max: [bb.max.x + pad, 0, bb.max.z + pad],
    y: terrY, kind: 'terrace'
  });
  // 2–4 级递增台阶，每级高差 ≤ FP.step
  const n = Math.max(2, Math.min(4, Math.ceil(terrY / step)));
  const inc = terrY / n;
  const dep = 1.6;
  const r = normRot(slot.rot);
  const dirZ = r === 0 ? -1 : (r === 180 ? 1 : 0);
  const dirX = r === 90 ? 1 : (r === 270 ? -1 : 0);
  const wMin = bb.min.x - 1.5, wMax = bb.max.x + 1.5;
  const dMin = bb.min.z - 1.5, dMax = bb.max.z + 1.5;
  if (dirZ !== 0) {
    const edge = dirZ < 0 ? bb.min.z - pad : bb.max.z + pad;
    for (let i = 0; i < n; i++) {
      const near = edge + dirZ * (dep * (n - 1 - i));
      const far = near + dirZ * dep;
      surfaces.push({
        id: `${slot.id}.step${i}`,
        min: [wMin, 0, Math.min(near, far)],
        max: [wMax, 0, Math.max(near, far)],
        y: inc * (i + 1), kind: 'stairs'
      });
    }
  } else if (dirX !== 0) {
    const edge = dirX < 0 ? bb.min.x - pad : bb.max.x + pad;
    for (let i = 0; i < n; i++) {
      const near = edge + dirX * (dep * (n - 1 - i));
      const far = near + dirX * dep;
      surfaces.push({
        id: `${slot.id}.step${i}`,
        min: [Math.min(near, far), 0, dMin],
        max: [Math.max(near, far), 0, dMax],
        y: inc * (i + 1), kind: 'stairs'
      });
    }
  }
}

// ---- 建筑 -------------------------------------------------------------------

function isFiniteBox(bb) {
  return !!bb && !!bb.min && !!bb.max &&
    ['x', 'y', 'z'].every((k) => Number.isFinite(bb.min[k]) && Number.isFinite(bb.max[k]));
}

// 只合并有限包围盒，忽略含 NaN 的网格（用于绕开 kit 的缺陷，见下）
function safeBox(THREE, obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let any = false;
  obj.traverse((o) => {
    if (!o.geometry) return;
    let b = null;
    if (o.isInstancedMesh && typeof o.computeBoundingBox === 'function') {
      o.computeBoundingBox();
      b = o.boundingBox;
    } else if (o.isMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      b = o.geometry.boundingBox;
    }
    if (!b) return;
    if (![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite)) return;
    const tmp = b.clone().applyMatrix4(o.matrixWorld);
    if (any) box.union(tmp); else { box.copy(tmp); any = true; }
  });
  return any ? box : null;
}

function syntheticBox(THREE, slot) {
  const hw = slot.w / 2 + 2.5, hd = slot.d / 2 + 2.5;
  const h = slot.tier === 'royal' ? 22 : slot.tier === 'major' ? 16 : 12;
  return new THREE.Box3(
    new THREE.Vector3(slot.x - hw, 0, slot.z - hd),
    new THREE.Vector3(slot.x + hw, h, slot.z + hd)
  );
}

// 剔除含 NaN 位置的网格（kit 单檐 hall 的屋顶）
function stripNaN(THREE, obj) {
  obj.updateMatrixWorld(true);
  const dead = [];
  obj.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    if (!b) return;
    if (![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite)) dead.push(o);
  });
  for (const o of dead) if (o.parent) o.parent.remove(o);
}

// 兜底：kit.building 对单檐 hall 调用了 roof({w,d}) 却漏传 h，导致 NaN 屋顶。
// 这里按 kit 形制补回一片合法屋顶；A 修复 kit 后该分支不再触发。
function patchHallRoof(ctx, slot, root) {
  const tier = typeof ctx.kit.tier === 'function' ? ctx.kit.tier(slot.tier) : null;
  const bodyH = tier ? tier.body : 9;
  const roofH = tier ? tier.roof : 8;
  const baseY = terraceHeightOf(slot);
  const r = ctx.kit.roof({ w: slot.w + 3.4, d: slot.d + 3, h: roofH });
  r.position.set(slot.x, baseY + bodyH + 0.2, slot.z);
  r.rotation.y = (normRot(slot.rot) * Math.PI) / 180;
  root.add(r);
  return r;
}

function addBuilding(ctx, slot, state) {
  const THREE = ctx.THREE;
  const kit = ctx.kit;
  const { root, buildings, obstacles, surfaces, lightAnchors } = state;
  const res = kit.building(slot);
  root.add(res.group);
  const rawOk = isFiniteBox(res.bounds);
  let patchGroup = null;
  if (!rawOk) {
    stripNaN(THREE, res.group);
    if (slot.kind === 'hall' && !slot.double) patchGroup = patchHallRoof(ctx, slot, root);
  }
  let bb = rawOk ? res.bounds : (safeBox(THREE, res.group) || syntheticBox(THREE, slot));
  if (patchGroup) {
    const pb = safeBox(THREE, patchGroup);
    if (isFiniteBox(pb)) bb = bb.union(pb);
  }
  const height = Number.isFinite(res.height) ? res.height : bb.max.y;
  buildings.push({
    id: slot.id,
    name: slot.name,
    category: slot.kind,
    zone: state.zone.id,
    rot: normRot(slot.rot),
    visitable: !!slot.visitable,
    info: slot.info || '',
    entrance: [slot.x, height * 0.4, slot.z],
    bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }
  });
  if (slot.kind === 'gateHall' || slot.kind === 'courtyardGate') {
    const gapHalf = slot.kind === 'gateHall' ? 6.5 : 5.5;
    for (const o of doorObstacles(bb, slot.rot, gapHalf)) obstacles.push(o);
  } else {
    obstacles.push(bbObstacle(bb));
  }
  addTerraceSurfaces(ctx, slot, bb, surfaces);
  lightAnchors.push({
    id: `${slot.id}.lamp`,
    type: 'lantern',
    position: [slot.x, Math.max(3, height * 0.6), slot.z],
    color: 0xffb46b,
    intensity: slot.kind === 'cornerTower' ? 7 : 6
  });
  return res;
}

// ---- 宫墙（分段留门洞）-------------------------------------------------------

function splitRun(from, to, gaps) {
  const cuts = (gaps || []).slice().sort((a, b) => a.at - b.at);
  const parts = [];
  let cursor = from;
  for (const g of cuts) {
    const s = g.at - g.w / 2, e = g.at + g.w / 2;
    if (s > cursor) parts.push([cursor, Math.min(s, to)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < to) parts.push([cursor, to]);
  return parts;
}

function addWalls(ctx, state, runs) {
  const kit = ctx.kit;
  const { root, obstacles } = state;
  const half = CITY.wallT / 2 + 1.4; // 墙厚一半 + 顶部瓦檐外挑
  for (const run of runs) {
    for (const [a, b] of splitRun(run.from, run.to, run.gaps)) {
      const len = b - a;
      if (len < 0.6) continue;
      const mid = (a + b) / 2;
      const x = run.axis === 'x' ? mid : run.fixed;
      const z = run.axis === 'x' ? run.fixed : mid;
      const g = kit.wall({ len, h: CITY.wallH, t: CITY.wallT });
      g.position.set(x, 0, z);
      g.rotation.y = run.axis === 'x' ? 0 : Math.PI / 2;
      root.add(g);
      if (run.axis === 'x') obstacles.push({ min: [a, 0, z - half], max: [b, CITY.wallH + 1.4, z + half] });
      else obstacles.push({ min: [x - half, 0, a], max: [x + half, CITY.wallH + 1.4, b] });
    }
  }
}

// ---- 护城河桥梁（拱起 + 分段可行走面）----------------------------------------

function addBridge(ctx, state, b) {
  const kit = ctx.kit;
  const { root, surfaces } = state;
  const rise = b.rise ?? 2.2;
  const g = kit.bridge({ len: b.len, w: b.w, rise });
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.axis === 'z' ? Math.PI / 2 : 0;
  root.add(g);
  // 用足够多的分段让每级高差 ≤ FP.step（rise*pi/segments）
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const y = rise * Math.sin(Math.PI * ((t0 + t1) / 2));
    const a = (t0 - 0.5) * b.len, c = (t1 - 0.5) * b.len;
    const min = b.axis === 'z' ? [b.x - b.w / 2, 0, b.z + a] : [b.x + a, 0, b.z - b.w / 2];
    const max = b.axis === 'z' ? [b.x + b.w / 2, 0, b.z + c] : [b.x + c, 0, b.z + b.w / 2];
    surfaces.push({ id: `bridge.${b.id}.${i}`, min, max, y, kind: 'bridge' });
  }
}

// ---- 绿化散布 ---------------------------------------------------------------

function scatter(rng, count, area, avoid) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard < count * 40 + 200) {
    guard++;
    const x = area.x + (rng() - 0.5) * area.w;
    const z = area.z + (rng() - 0.5) * area.d;
    let bad = false;
    for (const a of avoid) {
      if (x > a[0] && x < a[1] && z > a[2] && z < a[3]) { bad = true; break; }
    }
    if (!bad) out.push({ x, z, s: 0.7 + rng() * 0.55, r: rng() * Math.PI * 2 });
  }
  return out;
}

// ============================================================================
// 御花园
// ============================================================================

async function buildGarden(ctx) {
  const { THREE, zone, slots, corridors, roads, layout } = ctx;
  const kit = ctx.kit;
  const rng = deriveRng(ctx, 'zone.garden');
  const EYE = (ctx.config && ctx.config.FP && ctx.config.FP.eye) || 1.65;

  const root = new THREE.Group();
  root.name = 'zone-garden';
  const state = { root, zone, buildings: [], connectors: [], lightAnchors: [], obstacles: [], surfaces: [], viewpoints: [] };
  const { buildings, connectors, lightAnchors, obstacles, surfaces, viewpoints } = state;

  // 铺地（含本区道路）
  for (const road of roads) root.add(kit.slabRect(road));

  // 曲折步道（中式直角折径）
  const paths = [
    { x: 0, z: 298, w: 30, d: 14, kind: 'path' },
    { x: 0, z: 316, w: 14, d: 20, kind: 'path' },
    { x: -34, z: 334, w: 44, d: 12, kind: 'path' },
    { x: 34, z: 346, w: 44, d: 12, kind: 'path' },
    { x: -34, z: 358, w: 44, d: 12, kind: 'path' },
    { x: 34, z: 370, w: 44, d: 12, kind: 'path' },
    { x: -84, z: 392, w: 96, d: 12, kind: 'path' },
    { x: 84, z: 392, w: 96, d: 12, kind: 'path' },
    { x: 0, z: 344, w: 70, d: 10, kind: 'path' }
  ];
  for (const p of paths) root.add(kit.slabRect(p));

  // 建筑槽位（园门、御景亭、东西小亭、观花殿、园西书斋、园东茶房）
  for (const slot of slots) addBuilding(ctx, slot, state);

  // 廊道
  for (const cor of corridors) {
    const g = kit.corridor({ len: cor.len, w: 5.4, h: 4.2 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
    const half = cor.len / 2, t = 2.8;
    if (cor.axis === 'z') obstacles.push({ min: [cor.x - t, 0, cor.z - half], max: [cor.x + t, 3.6, cor.z + half] });
    else obstacles.push({ min: [cor.x - half, 0, cor.z - t], max: [cor.x + half, 3.6, cor.z + t] });
  }

  // 小型水景（水面几何；水域登记为障碍）
  const gardenPonds = (layout.PONDS || []).filter((p) => p.kind === 'pond' && p.x > zone.minX && p.x < zone.maxX && p.z > zone.minZ && p.z < zone.maxZ);
  for (const p of gardenPonds) {
    root.add(kit.props({ kind: 'pond', x: p.x, z: p.z, r: p.r, seed: p.x + p.z }));
    obstacles.push({ min: [p.x - p.r, -1, p.z - p.r], max: [p.x + p.r, 0.5, p.z + p.r] });
  }

  // 假山
  const rocks = [
    { x: -108, z: 396, s: 2.2, r: 0.3 },
    { x: -100, z: 388, s: 1.7, r: 1.1 },
    { x: -116, z: 386, s: 1.4, r: 2.2 },
    { x: -104, z: 404, s: 1.9, r: 0.8 },
    { x: 104, z: 396, s: 2.0, r: 1.6 },
    { x: 96, z: 388, s: 1.5, r: 0.2 },
    { x: 110, z: 402, s: 1.3, r: 2.6 }
  ];
  root.add(kit.props({ kind: 'rock', list: rocks }));
  for (const r of rocks) obstacles.push({ min: [r.x - r.s * 0.8, 0, r.z - r.s * 0.8], max: [r.x + r.s * 0.8, r.s * 1.4, r.z + r.s * 0.8] });

  // 树群（数量与范围取自 layout.TREES.garden）
  const treeCfg = (layout.TREES && layout.TREES.garden) || { count: 120, areas: [{ x: 0, z: 368, w: 300, d: 120 }] };
  const avoid = [];
  for (const s of slots) avoid.push([s.x - s.w / 2 - 4, s.x + s.w / 2 + 4, s.z - s.d / 2 - 4, s.z + s.d / 2 + 4]);
  for (const p of gardenPonds) avoid.push([p.x - p.r - 4, p.x + p.r + 4, p.z - p.r - 4, p.z + p.r + 4]);
  avoid.push([-18, 18, zone.minZ, zone.maxZ]);     // 保持中轴通透
  avoid.push([-138, -122, 284, 404]);              // 让开东西廊道
  avoid.push([122, 138, 284, 404]);
  const treeList = scatter(rng, treeCfg.count, treeCfg.areas[0], avoid);
  const pines = [], broads = [];
  for (const t of treeList) (rng() < 0.55 ? pines : broads).push(t);
  root.add(kit.treeCluster(pines, 'pine'));
  root.add(kit.treeCluster(broads, 'broad'));

  // 石灯 + 灯位
  const lampProps = [
    { x: -18, z: 312 }, { x: 18, z: 312 },
    { x: -50, z: 360 }, { x: 50, z: 360 },
    { x: -92, z: 350 }, { x: 92, z: 350 },
    { x: -20, z: 300 }, { x: 20, z: 300 }
  ];
  root.add(kit.props({ kind: 'lantern', list: lampProps }));
  for (const p of lampProps) lightAnchors.push({ id: `lamp.${p.x}_${p.z}`, type: 'lantern', position: [p.x, 2.6, p.z], color: 0xffb46b, intensity: 3 });

  // 地面可行走面
  surfaces.push({ id: 'ground.garden', min: [zone.minX, 0, zone.minZ], max: [zone.maxX, 0, zone.maxZ], y: 0, kind: 'ground' });

  // 连接（owner === garden，即 conn.garden-south）——留通道，不设障碍
  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
    surfaces.push({
      id: `conn.${c.id}`,
      min: [c.x - c.w / 2, 0, c.z - c.w / 2],
      max: [c.x + c.w / 2, 0, c.z + c.w / 2],
      y: c.elev || 0, kind: 'ground'
    });
  }

  const zv = (ctx.config.ZONE_VIEWS && ctx.config.ZONE_VIEWS['zone.garden']) || {};
  viewpoints.push({
    id: 'zone.garden', name: '御花园', mode: 'zone',
    position: zv.position || [0, 158, 570], target: zv.target || [0, 18, 368], fov: zv.fov || 40
  });
  viewpoints.push({
    id: 'fp.garden', name: '御花园·第一人称出生点', mode: 'fp-spawn',
    position: [0, EYE, 300], target: [0, EYE, 380]
  });

  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}

// ============================================================================
// 宫城边界：红墙 · 城门 · 角楼 · 护城河桥梁
// ============================================================================

async function buildBoundary(ctx) {
  const { THREE, zone, slots, layout } = ctx;
  const kit = ctx.kit;
  const EYE = (ctx.config && ctx.config.FP && ctx.config.FP.eye) || 1.65;

  const root = new THREE.Group();
  root.name = 'zone-boundary';
  const state = { root, zone, buildings: [], connectors: [], lightAnchors: [], obstacles: [], surfaces: [], viewpoints: [] };
  const { buildings, connectors, lightAnchors, obstacles, surfaces, viewpoints } = state;

  const hx = CITY.halfX, hz = CITY.halfZ, m = CITY.moatW;

  // 城门外侧铺装（仅外侧/桥头道路，宫城内部由各分区自行铺装）
  for (const road of (ctx.roads || [])) {
    if (Math.abs(road.z) > hz - 6 || Math.abs(road.x) > hx - 6) root.add(kit.slabRect(road));
  }

  // 建筑槽位：南/北/西/东四门（城台+城楼）+ 四角楼
  for (const slot of slots) addBuilding(ctx, slot, state);

  // 红墙完整闭合，四门处留缺口（与 conn.*-gate 位置一致）
  addWalls(ctx, state, [
    { axis: 'x', fixed: -hz, from: -hx, to: hx, gaps: [{ at: 0, w: 46 }] },
    { axis: 'x', fixed: hz, from: -hx, to: hx, gaps: [{ at: 0, w: 40 }] },
    { axis: 'z', fixed: -hx, from: -hz, to: hz, gaps: [{ at: 0, w: 38 }] },
    { axis: 'z', fixed: hx, from: -hz, to: hz, gaps: [{ at: 0, w: 38 }] }
  ]);

  // 护城河四桥
  const bridges = [
    { id: 'south', x: 0, z: -472, axis: 'z', len: 56, w: 26 },
    { id: 'north', x: 0, z: 472, axis: 'z', len: 56, w: 22 },
    { id: 'west', x: -322, z: 0, axis: 'x', len: 56, w: 22 },
    { id: 'east', x: 322, z: 0, axis: 'x', len: 56, w: 22 }
  ];
  for (const b of bridges) addBridge(ctx, state, b);

  // 护城河水面登记为障碍（几何/水面由 core/terrain.js 提供；桥面处留缺口保证通行）
  const moatBoxes = [
    { x0: -(hx + m), x1: -13, z0: -(hz + m) + 2, z1: -hz - 1 },
    { x0: 13, x1: hx + m, z0: -(hz + m) + 2, z1: -hz - 1 },
    { x0: -(hx + m), x1: -11, z0: hz + 1, z1: hz + m - 2 },
    { x0: 11, x1: hx + m, z0: hz + 1, z1: hz + m - 2 },
    { x0: -(hx + m) + 2, x1: -hx - 1, z0: -(hz + m), z1: -11 },
    { x0: -(hx + m) + 2, x1: -hx - 1, z0: 11, z1: hz + m },
    { x0: hx + 1, x1: hx + m - 2, z0: -(hz + m), z1: -11 },
    { x0: hx + 1, x1: hx + m - 2, z0: 11, z1: hz + m }
  ];
  for (const b of moatBoxes) obstacles.push({ min: [b.x0, -5, b.z0], max: [b.x1, 0.5, b.z1] });

  // 地面可行走面 + 门内外平台
  surfaces.push({ id: 'ground.boundary', min: [-hx, 0, -hz], max: [hx, 0, hz], y: 0, kind: 'ground' });
  surfaces.push({ id: 'ground.apron-south', min: [-30, 0, -hz - 22], max: [30, 0, -hz], y: 0, kind: 'ground' });
  surfaces.push({ id: 'ground.apron-north', min: [-26, 0, hz], max: [26, 0, hz + 22], y: 0, kind: 'ground' });
  surfaces.push({ id: 'ground.apron-west', min: [-hx - 22, 0, -20], max: [-hx, 0, 20], y: 0, kind: 'ground' });
  surfaces.push({ id: 'ground.apron-east', min: [hx, 0, -20], max: [hx + 22, 0, 20], y: 0, kind: 'ground' });

  // 城门石灯与镇门铜狮
  const gateLamps = [
    { x: -20, z: -430 }, { x: 20, z: -430 },
    { x: -18, z: 430 }, { x: 18, z: 430 },
    { x: -278, z: -14 }, { x: -278, z: 14 },
    { x: 278, z: -14 }, { x: 278, z: 14 }
  ];
  root.add(kit.props({ kind: 'lantern', list: gateLamps }));
  for (const p of gateLamps) lightAnchors.push({ id: `gate.${p.x}_${p.z}`, type: 'lantern', position: [p.x, 2.6, p.z], color: 0xffb46b, intensity: 4 });
  root.add(kit.props({ kind: 'lion', at: [-24, -430, -0.25] }));
  root.add(kit.props({ kind: 'lion', at: [24, -430, 0.25] }));

  // 连接：owner === boundary 的全部（四门 + 四桥）
  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
    surfaces.push({
      id: `conn.${c.id}`,
      min: [c.x - c.w / 2, 0, c.z - c.w / 2],
      max: [c.x + c.w / 2, 0, c.z + c.w / 2],
      y: c.elev || 0, kind: 'ground'
    });
  }

  const zv = (ctx.config.ZONE_VIEWS && ctx.config.ZONE_VIEWS['zone.gate-south']) || {};
  viewpoints.push({
    id: 'zone.gate-south', name: '南城门', mode: 'zone',
    position: zv.position || [0, 128, -648], target: zv.target || [0, 26, -450], fov: zv.fov || 40
  });
  viewpoints.push({
    id: 'fp.boundary', name: '宫城边界·第一人称出生点', mode: 'fp-spawn',
    position: [0, EYE, -497], target: [0, EYE + 0.2, -430]
  });

  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}

// ============================================================================
// 导出
// ============================================================================

export async function createGarden(ctx) {
  return buildGarden(ctx);
}

export async function createZone(ctx) {
  if (ctx && ctx.zone && ctx.zone.id === 'garden') return buildGarden(ctx);
  return buildBoundary(ctx);
}
