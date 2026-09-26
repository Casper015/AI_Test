/**
 * merge.js — 几何合批 / 实例化 / LOD / 去不可见内部面
 * =============================================================================
 * 目标（计划 §4.2 第 4 条、§8.2 预算）：重复构件实例化、去掉不可见内部面、按共享材质合批，
 * 让 67 个槽位 + 宫墙/道路/植被在 ≤350 次主场景绘制调用内完成。
 *
 * 设计约束：
 *   - 只用 THREE 基础能力（不用 three/addons：addons 以裸 'three' 导入，在 Node 内不可解析，
 *     而本库必须能在 Node 里跑 tests/kit.test.mjs）。
 *   - 合批只按 material.uuid + part 分桶；不同材质/不同构件部位绝不混桶。
 *   - 所有几何统一转 non-indexed 后再合并（BoxGeometry 自带多 group，合并会破坏 group，故一并丢弃）。
 *   - LOD 三档距离来自 config.BUDGET.lod，质量档只用 lodBias 缩放距离（不改变布局与形制）。
 */

import { THREE } from './three-ref.js';
import { CONFIG as SHARED_CONFIG } from '../shared/config.js';

const ATTR_NAMES = ['position', 'normal', 'uv'];

/** 预置属性缓冲，保证合并的三个属性齐备（缺失法线补算、缺失 uv 补 0）。 */
export function normalizeGeometry(T, geometry, { keepAttributes = ATTR_NAMES } = {}) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(count * 2), 2));
  }
  for (const name of Object.keys(g.attributes)) {
    if (!keepAttributes.includes(name)) g.deleteAttribute(name);
  }
  g.clearGroups();
  return g;
}

/** 合并几何（position/normal/uv），可选对每个几何施加矩阵（就地）。 */
export function mergeGeometries(T, geometries, { matrices = null } = {}) {
  const list = [];
  for (let i = 0; i < geometries.length; i += 1) {
    let g = normalizeGeometry(T, geometries[i]);
    const m = matrices ? matrices[i] : null;
    if (m) g.applyMatrix4(m);
    list.push(g);
  }
  if (list.length === 0) return new T.BufferGeometry();
  if (list.length === 1) return list[0];

  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const buffers = {};
  for (const name of ATTR_NAMES) {
    const itemSize = list[0].attributes[name].itemSize;
    buffers[name] = { array: new Float32Array(total * itemSize), itemSize, offset: 0 };
  }
  for (const g of list) {
    for (const name of ATTR_NAMES) {
      const src = g.attributes[name];
      buffers[name].array.set(src.array, buffers[name].offset);
      buffers[name].offset += src.array.length;
    }
    g.dispose();
  }
  const out = new T.BufferGeometry();
  for (const name of ATTR_NAMES) {
    out.setAttribute(name, new T.BufferAttribute(buffers[name].array, buffers[name].itemSize));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

export function trianglesOf(geometry) {
  const pos = geometry?.attributes?.position;
  if (!pos) return 0;
  return Math.floor(pos.count / 3);
}

/** 递归遍历：遇 LOD 只走当前可见档，跳过不可见子树（与渲染器实际绘制一致）。 */
function visitRenderable(root, visit) {
  const walk = (node) => {
    if (node !== root && node.visible === false) return;
    if (node.isLOD) {
      const level = node.getCurrentLevel?.() ?? 0;
      const child = node.levels[level]?.object;
      if (child) walk(child);
      return;
    }
    visit(node);
    if (node.isMesh) return;
    for (const child of node.children) walk(child);
  };
  walk(root);
}

/** 统计一棵子树里的三角面（LOD 只计入当前档；不可见对象不计）。 */
export function countTriangles(object) {
  let total = 0;
  visitRenderable(object, (node) => {
    if (node.isInstancedMesh) total += trianglesOf(node.geometry) * node.count;
    else if (node.isMesh) total += trianglesOf(node.geometry);
  });
  return total;
}

/** 统计绘制调用（可渲染对象数；LOD 只计当前档，InstancedMesh 计 1 次，不可见对象不计）。 */
export function countDrawCalls(object) {
  let total = 0;
  visitRenderable(object, (node) => {
    if (node.isMesh || node.isPoints || node.isLine) total += 1;
  });
  return total;
}

/** 按 material.uuid + part 分桶统计绘制调用（只算当前可见档）。 */
export function drawCallBuckets(object) {
  const buckets = new Map();
  visitRenderable(object, (node) => {
    if (!node.isMesh && !node.isInstancedMesh) return;
    const part = node.userData?.part ?? 'unlabeled';
    const key = `${node.material?.uuid ?? 'no-material'}|${part}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });
  return buckets;
}

/**
 * 阴影策略（config 驱动，单点定义）——合批/实例化都必须走这里，保证"合批前后一致"。
 *   - 全局开关：`config.LIGHTING.shadows.enabled`；
 *   - 全场只有 1 盏主方向光投影（`LIGHTING.shadows.dynamicShadowBudget` / `BUDGET.shadows.primaryDirectionalLights`），
 *     宫灯不投影（`BUDGET.shadows.realtimeLampShadows = 0`），因此"投不投影"只是网格标志问题；
 *   - 水面（透明混合）**不投影**但接收（投影无意义且昂贵）；其余构件与合批前 `buildings.js` 的行为一致：投影 + 接收。
 * 返回 { castShadow, receiveShadow }。
 */
export const SHADOW_CAST_EXCLUDED_PARTS = Object.freeze(['water']);

export function shadowPolicy(config, part = null) {
  const cfg = config ?? SHARED_CONFIG;
  const enabled = cfg?.LIGHTING?.shadows?.enabled !== false;
  const excluded = SHADOW_CAST_EXCLUDED_PARTS.includes(part);
  return { castShadow: enabled && !excluded, receiveShadow: enabled };
}

/** 从一组来源网格继承阴影标志（任一来源投影 → 合批网格投影），并用 config 策略兜底屏蔽水面等部位。 */
function inheritedShadowFlags(entries, config, part) {
  const policy = shadowPolicy(config, part);
  return {
    castShadow: policy.castShadow && entries.some((e) => e.mesh?.castShadow === true),
    receiveShadow: policy.receiveShadow && entries.some((e) => e.mesh?.receiveShadow === true),
  };
}

function insideBox(box, p, epsilon) {
  return (
    p.x >= box.min.x - epsilon &&
    p.x <= box.max.x + epsilon &&
    p.y >= box.min.y - epsilon &&
    p.y <= box.max.y + epsilon &&
    p.z >= box.min.z - epsilon &&
    p.z <= box.max.z + epsilon
  );
}

/**
 * 去掉不可见内部面：
 *   - insideBoxes：面心落在给定盒子内（含 epsilon 外扩）→ 该面被相邻体块完全遮挡，删除；
 *   - dropDownwardBelowY：面法线朝下且面心低于该高度 → 底面看不见，删除（底板/台基底等）。
 * 返回 { geometry, removed, kept }；几何已是 non-indexed 时原地重建属性数组并返回新几何。
 */
export function removeInteriorFaces(T, geometry, { boxes = [], epsilon = 0.02, dropDownwardBelowY = null } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const nor = g.attributes.normal ?? (g.computeVertexNormals(), g.attributes.normal);
  const count = pos.count;
  const keep = new Uint8Array(count);
  let removed = 0;
  const c = new T.Vector3();
  const n = new T.Vector3();
  for (let i = 0; i < count; i += 3) {
    let drop = false;
    c.set(
      (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
      (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3,
      (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3,
    );
    for (const box of boxes) {
      if (insideBox(box, c, epsilon)) {
        drop = true;
        break;
      }
    }
    if (!drop && dropDownwardBelowY !== null && c.y < dropDownwardBelowY) {
      n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (n.y < -0.5) drop = true;
    }
    if (drop) removed += 1;
    else {
      keep[i] = 1;
      keep[i + 1] = 1;
      keep[i + 2] = 1;
    }
  }
  if (removed === 0) return { geometry: g, removed: 0, kept: count / 3 };
  return { geometry: filterTriangles(T, g, keep), removed, kept: count / 3 - removed };
}

function filterTriangles(T, g, keep) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  const kept = keep.reduce((a, b) => a + b, 0);
  const p = new Float32Array(kept * 3);
  const n = new Float32Array(kept * 3);
  const t = new Float32Array(kept * 2);
  let w = 0;
  for (let i = 0; i < keep.length; i += 1) {
    if (!keep[i]) continue;
    p[w * 3] = pos.getX(i);
    p[w * 3 + 1] = pos.getY(i);
    p[w * 3 + 2] = pos.getZ(i);
    if (nor) {
      n[w * 3] = nor.getX(i);
      n[w * 3 + 1] = nor.getY(i);
      n[w * 3 + 2] = nor.getZ(i);
    }
    if (uv) {
      t[w * 2] = uv.getX(i);
      t[w * 2 + 1] = uv.getY(i);
    }
    w += 1;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(p, 3));
  out.setAttribute('normal', new T.BufferAttribute(n, 3));
  out.setAttribute('uv', new T.BufferAttribute(t, 2));
  out.userData.kitOwned = g.userData?.kitOwned === true;
  out.userData.part = g.userData?.part;
  return out;
}

/**
 * 去掉"背靠背重合面"：**同一平面 + 法线相反**的两组三角形按数量对称删除（两部分贴合处的内部界面）。
 * 规则细节（可机器复核）：
 *   1) 三角形按"单位法线的规范方向（±同键）+ 平面偏移"分平面组；
 *   2) 组内按法线符号分成两组，若两组在平面内的包围盒（AABB）重叠 ≥ 50%（取较小者），则各删 min(n+, n−) 个；
 *   3) 平面内不重叠的共面面（例如两栋相距很远的建筑屋面同高）不受影响，避免误删可见面。
 * BoxGeometry 的两三角对角线方向不同，因此不能用"面心坐标配对"，必须按平面分组。
 * 返回 { geometry, removed, pairs, planes }。
 */
export function removeCoincidentFaces(T, geometry, { epsilon = 0.01, minOverlap = 0.5 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const triCount = Math.floor(pos.count / 3);
  const invEps = 1 / epsilon;

  // 轴向法线判定（本项目几何几乎全为轴对齐盒/柱/坡面，用 3 位小数量化即可）
  const groupOf = (i) => {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    const len = Math.hypot(nx, ny, nz) || 1;
    let ux = nx / len;
    let uy = ny / len;
    let uz = nz / len;
    // 规范方向：优先 +axis（保证正反两面同键）
    const ax = Math.abs(ux);
    const ay = Math.abs(uy);
    const az = Math.abs(uz);
    let axis = 'x';
    let sign = Math.sign(ux) || 1;
    if (ay >= ax && ay >= az) {
      axis = 'y';
      sign = Math.sign(uy) || 1;
    } else if (az >= ax && az >= ay) {
      axis = 'z';
      sign = Math.sign(uz) || 1;
    }
    const flip = sign < 0 ? -1 : 1;
    ux *= flip;
    uy *= flip;
    uz *= flip;
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const plane = (ux * cx + uy * cy + uz * cz) * invEps;
    const key = `${axis}|${ux.toFixed(3)}|${uy.toFixed(3)}|${uz.toFixed(3)}|${plane.toFixed(0)}`;
    return { key, axis, sign };
  };

  const planeMap = new Map();
  for (let t = 0; t < triCount; t += 1) {
    const i = t * 3;
    const info = groupOf(i);
    if (!planeMap.has(info.key)) planeMap.set(info.key, { axis: info.axis, plus: [], minus: [] });
    const bucket = planeMap.get(info.key);
    (info.sign > 0 ? bucket.plus : bucket.minus).push(t);
  }

  const inPlaneBox = (indexes, axis) => {
    const a = axis === 'x' ? [1, 2] : axis === 'y' ? [0, 2] : [0, 1];
    let minA = Infinity; let maxA = -Infinity; let minB = Infinity; let maxB = -Infinity;
    const get = (i, k) => (k === 0 ? pos.getX(i) : k === 1 ? pos.getY(i) : pos.getZ(i));
    for (const t of indexes) {
      for (let v = 0; v < 3; v += 1) {
        const i = t * 3 + v;
        const va = get(i, a[0]);
        const vb = get(i, a[1]);
        if (va < minA) minA = va;
        if (va > maxA) maxA = va;
        if (vb < minB) minB = vb;
        if (vb > maxB) maxB = vb;
      }
    }
    return { minA, maxA, minB, maxB };
  };

  const keep = new Uint8Array(triCount).fill(1);
  let pairs = 0;
  let planes = 0;
  for (const bucket of planeMap.values()) {
    if (bucket.plus.length === 0 || bucket.minus.length === 0) continue;
    const boxA = inPlaneBox(bucket.plus, bucket.axis);
    const boxB = inPlaneBox(bucket.minus, bucket.axis);
    const overlapA = Math.max(0, Math.min(boxA.maxA, boxB.maxA) - Math.max(boxA.minA, boxB.minA));
    const overlapB = Math.max(0, Math.min(boxA.maxB, boxB.maxB) - Math.max(boxA.minB, boxB.minB));
    const areaA = (boxA.maxA - boxA.minA) * (boxA.maxB - boxA.minB);
    const areaB = (boxB.maxA - boxB.minA) * (boxB.maxB - boxB.minB);
    const smaller = Math.min(areaA, areaB);
    if (smaller <= 0) continue;
    if ((overlapA * overlapB) / smaller < minOverlap) continue;
    const k = Math.min(bucket.plus.length, bucket.minus.length);
    for (let i = 0; i < k; i += 1) {
      keep[bucket.plus[i]] = 0;
      keep[bucket.minus[i]] = 0;
    }
    pairs += k;
    planes += 1;
  }
  if (pairs === 0) return { geometry: g, removed: 0, pairs: 0, planes: 0 };
  const triKeep = new Uint8Array(triCount * 3);
  for (let t = 0; t < triCount; t += 1) {
    if (!keep[t]) continue;
    triKeep[t * 3] = 1;
    triKeep[t * 3 + 1] = 1;
    triKeep[t * 3 + 2] = 1;
  }
  return { geometry: filterTriangles(T, g, triKeep), removed: pairs * 2, pairs, planes };
}

/**
 * 整棵子树的"去内部面"批处理：用兄弟网格的包围盒（外扩 epsilon）作为遮挡体。
 * 返回 { removed, pairs, before, after }。
 */
export function pruneInteriorFaces(T, root, { epsilon = 0.02, dropDownwardBelowY = null } = {}) {
  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh && !node.isInstancedMesh && node.geometry) meshes.push(node);
  });
  const boxes = meshes.map((m) => {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
    return b;
  });
  let before = 0;
  let after = 0;
  let removed = 0;
  let pairs = 0;
  meshes.forEach((mesh, index) => {
    before += trianglesOf(mesh.geometry);
    const others = boxes.filter((_, i) => i !== index);
    const r1 = removeInteriorFaces(T, mesh.geometry, { boxes: others, epsilon, dropDownwardBelowY });
    const r2 = removeCoincidentFaces(T, r1.geometry, { epsilon: epsilon * 2 });
    mesh.geometry = r2.geometry;
    removed += r1.removed;
    pairs += r2.pairs;
    after += trianglesOf(mesh.geometry);
  });
  return { before, after, removed, pairs, meshes: meshes.length };
}

/**
 * LOD 三档包装。levels 可以是 [object, object, object] 或 [{ object, distance }]。
 * 距离缺省取 config.BUDGET.lod.nearDistance / midDistance × quality.lodBias（高画质保留细节更远）。
 */
export function makeLOD(T, levels, { budget, quality, autoUpdate = true, name = 'kit-lod' } = {}) {
  const lod = new T.LOD();
  lod.name = name;
  const bias = quality?.lodBias ?? 1;
  const list = levels.map((entry, index) => {
    const object = entry?.object ?? entry;
    const distance = entry?.distance ?? (index === 0 ? 0 : index === 1 ? budget.nearDistance * bias : budget.midDistance * bias);
    return { object, distance };
  });
  list.forEach((entry, index) => {
    lod.addLevel(entry.object, entry.distance);
    entry.object.userData = { ...(entry.object.userData ?? {}), lodLevel: index };
  });
  lod.autoUpdate = autoUpdate;
  lod.userData = { ...(lod.userData ?? {}), kit: { lodLevels: list.length, distances: list.map((l) => l.distance) } };
  return lod;
}

/** 单个 InstancedMesh 实例化（count 个矩阵由 callback 或 matrices 数组给出）。 */
export function instanceMesh(T, geometry, material, count, matricesOrFn, { name = 'kit-instances', castShadow = true, receiveShadow = true, config = null } = {}) {
  const mesh = new T.InstancedMesh(geometry, material, count);
  mesh.name = name;
  // 实例化构件同理：默认投影 + 接收（与 kit 非实例构件一致），可用 options 覆盖；config 关闭阴影时统一关闭
  const policy = shadowPolicy(config, null);
  mesh.castShadow = policy.castShadow && castShadow !== false;
  mesh.receiveShadow = policy.receiveShadow && receiveShadow !== false;
  if (!material) throw new Error('kit.instance: 缺少材质（请传 Mesh 或显式 material）');
  const m = new T.Matrix4();
  for (let i = 0; i < count; i += 1) {
    if (typeof matricesOrFn === 'function') matricesOrFn(i, m);
    else if (matricesOrFn && matricesOrFn[i]) m.copy(matricesOrFn[i]);
    else m.identity();
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere?.();
  return mesh;
}

/** 按位置数组实例化（可选 yaw 抖动函数）。 */
export function instanceFromPoints(T, geometry, material, points, { yawAt = null, scaleAt = null, name, castShadow = true, receiveShadow = true, config = null } = {}) {
  const q = new T.Quaternion();
  const e = new T.Euler();
  const v = new T.Vector3();
  const s = new T.Vector3(1, 1, 1);
  return instanceMesh(
    T,
    geometry,
    material,
    points.length,
    (i, m) => {
      const p = points[i];
      e.set(0, yawAt ? yawAt(i, p) : 0, 0);
      q.setFromEuler(e);
      v.set(p.x, p.y ?? 0, p.z);
      if (scaleAt) {
        const sc = scaleAt(i, p);
        s.set(sc, sc, sc);
      }
      m.compose(v, q, s);
    },
    { name, castShadow, receiveShadow, config },
  );
}

/**
 * 按共享材质合批（就地）：把子树里所有普通 Mesh 合并成"每材质每部位一个 Mesh"，LOD 树逐档同样处理。
 * 返回 { root, stats }（stats.before/after 为绘制调用数）。
 * InstancedMesh 不参与合并（本身已是 1 次调用），原样保留。
 */
export function mergeByMaterial(T, root, { includeLOD = true, config = null } = {}) {
  root.updateMatrixWorld(true);
  const stats = { before: countDrawCalls(root), merged: 0, keptInstanced: 0 };

  const collectMeshes = (parent) => {
    const meshes = [];
    for (const child of [...parent.children]) {
      if (child.isLOD) continue;
      if (child.isInstancedMesh) {
        stats.keptInstanced += 1;
        continue;
      }
      if (child.isMesh) meshes.push(child);
      else if (child.children.length > 0) meshes.push(...collectMeshes(child));
    }
    return meshes;
  };

  const batchParent = (parent) => {
    const meshes = collectMeshes(parent);
    if (meshes.length === 0) return;
    const buckets = new Map();
    for (const mesh of meshes) {
      const part = mesh.userData?.part ?? 'unlabeled';
      const key = `${mesh.material?.uuid ?? 'none'}|${part}`;
      if (!buckets.has(key)) buckets.set(key, { material: mesh.material, part, entries: [] });
      buckets.get(key).entries.push(mesh);
    }
    for (const bucket of buckets.values()) {
      const { entries, material, part } = bucket;
      if (entries.length === 0) continue;
      const inv = new T.Matrix4().copy(parent.matrixWorld).invert();
      const matrices = entries.map((mesh) => new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      const geometries = entries.map((mesh) => mesh.geometry);
      const mergedGeometry = mergeGeometries(T, geometries, { matrices });
      mergedGeometry.userData.kitOwned = entries.every((m) => m.geometry.userData?.kitOwned === true);
      mergedGeometry.userData.part = part;
      const merged = new T.Mesh(mergedGeometry, material);
      merged.name = `${part}:${material?.name ?? 'material'}`;
      merged.userData.part = part;
      const flags = inheritedShadowFlags(entries.map((mesh) => ({ mesh })), config, part);
      merged.castShadow = flags.castShadow;
      merged.receiveShadow = flags.receiveShadow;
      merged.userData.kit = { batched: entries.length, shadow: flags };
      parent.add(merged);
      for (const mesh of entries) {
        mesh.parent?.remove(mesh);
        if (mesh.geometry !== mergedGeometry) mesh.geometry.dispose();
      }
      stats.merged += entries.length;
    }
  };

  const walk = (node) => {
    batchParent(node);
    for (const child of [...node.children]) {
      if (child.isLOD) {
        if (!includeLOD) continue;
        for (const level of child.levels) {
          if (level.object) {
            level.object.updateMatrixWorld(true);
            batchParent(level.object);
          }
        }
      } else if (child.children.length > 0) {
        walk(child);
      }
    }
  };
  walk(root);
  root.updateMatrixWorld(true);
  stats.after = countDrawCalls(root);
  stats.reduction = stats.before > 0 ? 1 - stats.after / stats.before : 0;
  return { root, stats };
}

/**
 * 整区合批（推荐给区域作者）：把**跨建筑**的同类构件（同材质 + 同 part）合并成单个 Mesh。
 * LOD 三档分别合批：第 k 档把所有建筑的 LOD 第 k 档几何合并成"每 材质×部位 一个 Mesh"，
 * 重建为一个顶层 LOD（档位距离沿用原 LOD），另有一组非 LOD 网格（道具/地面等）固定可见。
 * InstancedMesh 原样搬进对应档位（本身已是 1 次调用）。
 *
 * 返回 { root, stats: { before, after, levels, buckets, mergedMeshes, pruned } }。
 */
export function mergeZone(T, root, { name = 'kit-zone-batch', prune = false, epsilon = 0.02, config = null } = {}) {
  root.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(root.matrixWorld).invert();

  const lodNodes = [];
  root.traverse((node) => {
    if (node.isLOD) lodNodes.push(node);
  });

  const insideLOD = (node) => {
    let parent = node.parent;
    while (parent && parent !== root) {
      if (parent.isLOD) return true;
      parent = parent.parent;
    }
    return false;
  };

  const bucketsByLevel = new Map();
  const bucketFor = (map, mesh, matrix) => {
    const part = mesh.userData?.part ?? 'unlabeled';
    const key = `${mesh.material?.uuid ?? 'none'}|${part}`;
    if (!map.has(key)) map.set(key, { material: mesh.material, part, entries: [] });
    // 记住来源网格本身：合批网格必须继承它的 castShadow/receiveShadow（t25 关键修复）
    map.get(key).entries.push({ geometry: mesh.geometry, matrix, mesh });
  };
  const levelMap = (index) => {
    if (!bucketsByLevel.has(index)) bucketsByLevel.set(index, new Map());
    return bucketsByLevel.get(index);
  };

  const instancedByLevel = new Map();
  const removed = [];
  let mergedMeshes = 0;

  for (const lod of lodNodes) {
    lod.updateMatrixWorld(true);
    lod.levels.forEach((level, index) => {
      if (!level.object) return;
      level.object.updateMatrixWorld(true);
      level.object.traverse((node) => {
        if (!node.isMesh) return;
        const matrix = new T.Matrix4().multiplyMatrices(inv, node.matrixWorld);
        if (node.isInstancedMesh) {
          if (!instancedByLevel.has(index)) instancedByLevel.set(index, []);
          instancedByLevel.get(index).push({ mesh: node, matrix });
          return;
        }
        bucketFor(levelMap(index), node, matrix);
        mergedMeshes += 1;
        removed.push(node);
      });
    });
  }

  // 非 LOD 的普通网格：固定可见组
  const plainMap = new Map();
  const plainInstanced = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (insideLOD(node)) return;
    const matrix = new T.Matrix4().multiplyMatrices(inv, node.matrixWorld);
    if (node.isInstancedMesh) {
      plainInstanced.push({ mesh: node, matrix });
      return;
    }
    bucketFor(plainMap, node, matrix);
    mergedMeshes += 1;
    removed.push(node);
  });

  const before = countDrawCalls(root);
  const batch = new T.Group();
  batch.name = name;

  const buildLevelGroup = (index) => {
    const group = new T.Group();
    group.name = `${name}:lod${index}`;
    const map = bucketsByLevel.get(index);
    if (map) {
      for (const bucket of map.values()) {
        const geometry = mergeGeometries(T, bucket.entries.map((e) => e.geometry), { matrices: bucket.entries.map((e) => e.matrix) });
        geometry.userData.kitOwned = true;
        geometry.userData.part = bucket.part;
        const mesh = new T.Mesh(geometry, bucket.material);
        mesh.name = `${bucket.part}:${bucket.material?.name ?? 'material'}`;
        mesh.userData.part = bucket.part;
        mesh.userData.batched = bucket.entries.length;
        // 关键修复：合批网格必须继承来源构件的阴影标志（否则全城建筑合批后集体不再投影）
        const flags = inheritedShadowFlags(bucket.entries, config, bucket.part);
        mesh.castShadow = flags.castShadow;
        mesh.receiveShadow = flags.receiveShadow;
        mesh.userData.shadow = flags;
        if (prune) mesh.geometry = removeInteriorFaces(T, mesh.geometry, { boxes: [], epsilon }).geometry;
        group.add(mesh);
      }
    }
    for (const entry of instancedByLevel.get(index) ?? []) {
      entry.mesh.parent?.remove(entry.mesh);
      entry.mesh.applyMatrix4(entry.matrix);
      group.add(entry.mesh);
    }
    return group;
  };

  const levelIndexes = [...bucketsByLevel.keys()].sort((a, b) => a - b);
  const referenceLod = lodNodes[0];
  let lod = null;
  if (levelIndexes.length > 0) {
    const distances = referenceLod
      ? referenceLod.levels.map((l) => l.distance)
      : levelIndexes.map((i) => (i === 0 ? 0 : i === 1 ? 200 : 500));
    lod = new T.LOD();
    lod.name = `${name}:lod`;
    for (const index of levelIndexes) {
      lod.addLevel(buildLevelGroup(index), distances[index] ?? distances[distances.length - 1] * index);
    }
    lod.autoUpdate = true;
    lod.userData = { kit: { batched: true, levels: levelIndexes.length, distances } };
    batch.add(lod);
  }

  if (plainMap.size > 0 || plainInstanced.length > 0) {
    const fixed = new T.Group();
    fixed.name = `${name}:fixed`;
    for (const bucket of plainMap.values()) {
      const geometry = mergeGeometries(T, bucket.entries.map((e) => e.geometry), { matrices: bucket.entries.map((e) => e.matrix) });
      geometry.userData.kitOwned = true;
      geometry.userData.part = bucket.part;
      const mesh = new T.Mesh(geometry, bucket.material);
      mesh.userData.part = bucket.part;
      mesh.userData.batched = bucket.entries.length;
      const flags = inheritedShadowFlags(bucket.entries, config, bucket.part);
      mesh.castShadow = flags.castShadow;
      mesh.receiveShadow = flags.receiveShadow;
      mesh.userData.shadow = flags;
      fixed.add(mesh);
    }
    for (const entry of plainInstanced) {
      entry.mesh.parent?.remove(entry.mesh);
      entry.mesh.applyMatrix4(entry.matrix);
      fixed.add(entry.mesh);
    }
    batch.add(fixed);
  }

  const lodSet = new Set(lodNodes);
  for (const lodNode of lodSet) lodNode.parent?.remove(lodNode);
  for (const mesh of removed) {
    mesh.parent?.remove(mesh);
    if (mesh.geometry?.userData?.kitOwned === true) mesh.geometry.dispose();
  }
  root.add(batch);
  root.updateMatrixWorld(true);

  const after = countDrawCalls(root);
  return {
    root,
    batch,
    stats: {
      before,
      after,
      reduction: before > 0 ? 1 - after / before : 0,
      levels: bucketsByLevel.size,
      buckets: [...bucketsByLevel.values()].reduce((a, m) => a + m.size, 0) + plainMap.size,
      mergedMeshes,
      instanced: [...instancedByLevel.values()].reduce((a, l) => a + l.length, 0) + plainInstanced.length,
    },
  };
}
