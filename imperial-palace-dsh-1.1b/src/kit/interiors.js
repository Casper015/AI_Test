/**
 * interiors.js — 标准室内陈设套件 `kit.interiorSet({ kind, grade, bounds, entrance, seed, ... })`
 * =============================================================================
 * 目标（用户新增需求）：47+ 栋封闭建筑要"进得去、看得见室内"，由区域作者在自己的份额内调用本套件，
 * 因此设计三原则：**参数化**（kind/grade/bounds/entrance/seed 决定一切）、**可复用**（复用 src/kit 既有
 * 几何语汇与 config 材质令牌，零新增令牌）、**合批友好**（部位词表刻意收敛，一次 `mergeZone` 后单栋
 * 新增绘制调用 ≤ 12；近/远两档 LOD）。
 *
 * 约束（tests/kit.test.mjs §19 机器校验）：
 *   1. 返回**未挂载**的 Group / LOD（调用方负责 `root.add` 与 `kit.mergeZone`）；
 *   2. 零新增材质令牌：只用 INTERIOR_MATERIALS 白名单（全部来自 config.MATERIALS / COLOR_ROLES / 派生表）；
 *   3. 几何不穿模：所有构件严格位于 `bounds` 内（按 `inset` 内收）、底面落在 `groundY`、顶面 ≤ `ceilingY`；
 *   4. 分层：hall(grade 3/2) / sideHall / gateHall / cornerTower 四档，殿内按 grade 细化。
 *
 * 部位词表（与合批桶一一对应，刻意少而通用 —— 语义明细见 metrics.items）：
 *   floor        金砖/铺地地面          → interiorBrick / pavingStone
 *   runner       御道/甬路嵌线          → pavingLight
 *   dais         须弥座/台座            → stoneWhite
 *   daisCap      台座压面/石活          → stoneWhiteShade
 *   throne       正位坐具/榻/暗木家具件  → timberDark
 *   furniture    桌案/柜架/屏风框/木构   → timberLacquer
 *   screenPanel  屏风面/朱红构件/盘龙柱  → plasterRed
 *   trim         鎏金饰件/灯架/香炉/铜器  → giltMetal
 *   ceiling      藻井/梁架/天花          → paintingTeal
 *   lanternGlow  灯罩发光体              → lampGlow
 */

import { THREE } from './three-ref.js';
import { Parts, box, cylinder, sphere, beam, lathe, translate } from './geometry.js';
import { makeRng } from './props.js';
import { makeLOD } from './merge.js';
import { gradeOf } from './tokens.js';

/** 允许的室内构件类型（四档）。 */
export const INTERIOR_KINDS = Object.freeze(['hall', 'sideHall', 'gateHall', 'cornerTower']);

/** 零新增令牌白名单：全部为 src/kit 既有材质键（tests/kit.test.mjs §19 断言"用到的键 ⊆ 本表 ⊆ kit.materials"）。 */
export const INTERIOR_MATERIALS = Object.freeze([
  'interiorBrick',
  'pavingStone',
  'pavingLight',
  'stoneWhite',
  'stoneWhiteShade',
  'timberLacquer',
  'timberDark',
  'plasterRed',
  'plasterRedDark',
  'giltMetal',
  'paintingTeal',
  'lampGlow',
]);

/** 近景三角面/部件上限（防失控；47 栋口径见 docs/handoff-kit-interiors.md）。 */
const LIMITS = Object.freeze({
  nearTriangles: 9000, // 单栋内景近景三角面上限（殿类）
  farTriangles: 2200,
  minSpan: 6, // 室内净尺寸下限（米）；小于此值只铺地面 + 一盏灯
});

const DEFAULT_INSET = 0.9; // 陈设距 bounds 边界的统一内收（避开墙厚/台明）
const WALL_MARGIN = 0.35; // 家具离墙的最小间隙

/** 把"以 (x,z) 为中心、宽 w 深 d"的盒子收进内矩形（必要时缩尺寸；实在放不下返回 null）。 */
function fitRect(x, z, w, d, inner) {
  const maxW = inner.maxX - inner.minX;
  const maxD = inner.maxZ - inner.minZ;
  if (maxW <= 0.2 || maxD <= 0.2) return null;
  const fw = Math.min(w, maxW);
  const fd = Math.min(d, maxD);
  const cx = Math.min(Math.max(x, inner.minX + fw / 2), inner.maxX - fw / 2);
  const cz = Math.min(Math.max(z, inner.minZ + fd / 2), inner.maxZ - fd / 2);
  return { x: cx, z: cz, w: fw, d: fd };
}

/** 单档几何（detail = 'near' | 'far'）。返回 { parts, items }。 */
function composeInterior(env, p, detail) {
  const T = env.THREE;
  const tile = (key) => env.materials.tileMeters(key);
  const parts = new Parts();
  const items = [];
  const g = gradeOf(env.config, p.grade);
  const near = detail === 'near';
  const groundY = p.groundY;
  const ceilingY = Math.max(groundY + 1.8, p.ceilingY);
  const headroom = ceilingY - groundY;
  const rng = makeRng(p.seed >>> 0);
  const inner = {
    minX: p.bounds.minX + p.inset,
    maxX: p.bounds.maxX - p.inset,
    minZ: p.bounds.minZ + p.inset,
    maxZ: p.bounds.maxZ - p.inset,
  };
  const cx = (inner.minX + inner.maxX) / 2;
  const cz = (inner.minZ + inner.maxZ) / 2;
  const spanX = inner.maxX - inner.minX;
  const spanZ = inner.maxZ - inner.minZ;
  // 入口在本地 z 的哪一侧（决定"正面/正位"朝向；默认入口在 -Z 侧）
  const entranceZ = p.entrance ? p.entrance.z : p.bounds.minZ;
  const entranceX = p.entrance ? p.entrance.x : cx;
  const frontSign = entranceZ <= cz ? 1 : -1; // 正位放在入口对侧
  const backZ = frontSign > 0 ? inner.maxZ : inner.minZ;
  const add = (part, material, geometry, item = null) => {
    parts.add(part, material, geometry);
    if (item && !items.includes(item)) items.push(item);
    return geometry;
  };
  const boxAt = (part, material, { w, h, d, x, z, y = groundY, tileKey = material }) =>
    add(part, material, box(T, { w, h, d, x, z, y, tile: tile(tileKey) }));

  /* ---------------- 通用：地面（金砖/铺地）+ 御道 ---------------- */
  const floorRect = fitRect(cx, cz, spanX, spanZ, inner);
  const floorTile = p.kind === 'hall' ? 'interiorBrick' : 'pavingStone';
  if (floorRect) {
    boxAt('floor', floorTile, { w: floorRect.w, h: 0.06, d: floorRect.d, x: floorRect.x, z: floorRect.z, y: groundY });
    items.push('floor');
  }
  const runnerD = Math.max(2, spanZ * 0.9);
  const runnerRect = p.kind === 'hall' ? fitRect(cx, cz, Math.min(6.4, spanX * 0.45), runnerD, inner) : null;
  if (runnerRect && near) {
    boxAt('runner', 'pavingLight', { w: runnerRect.w, h: 0.03, d: runnerRect.d, x: runnerRect.x, z: runnerRect.z, y: groundY + 0.06 });
    items.push('runner');
  }

  /* ---------------- 殿（hall）：须弥座 + 正位 + 屏风 + 盘龙柱 + 藻井 + 灯 + 案/香炉 ---------------- */
  if (p.kind === 'hall') {
    const daisW = Math.min(Math.max(8, spanX * 0.34), spanX - 2 * WALL_MARGIN);
    const daisD = Math.min(Math.max(5, spanZ * 0.3), spanZ - 2 * WALL_MARGIN);
    const daisCZ = frontSign > 0 ? backZ - daisD / 2 - WALL_MARGIN : backZ + daisD / 2 + WALL_MARGIN;
    const dais = fitRect(cx, daisCZ, daisW, daisD, inner);
    const daisH = p.grade >= 3 ? 1.0 : 0.7;
    if (dais) {
      boxAt('dais', 'stoneWhite', { w: dais.w, h: daisH * 0.62, d: dais.d, x: dais.x, z: dais.z });
      if (near) boxAt('daisCap', 'stoneWhiteShade', { w: dais.w * 0.86, h: daisH * 0.38, d: dais.d * 0.82, x: dais.x, z: dais.z, y: groundY + daisH * 0.62 });
      items.push('dais');
      // 正位（坐具 + 鎏金靠背）
      const throneH = 1.15;
      const throne = fitRect(dais.x, dais.z + frontSign * (dais.d * 0.05), Math.min(3.0, dais.w * 0.42), Math.min(2.2, dais.d * 0.5), inner);
      if (throne) {
        boxAt('throne', 'timberDark', { w: throne.w, h: throneH, d: throne.d, x: throne.x, z: throne.z, y: groundY + daisH });
        if (near) boxAt('trim', 'giltMetal', { w: throne.w * 1.06, h: 0.16, d: throne.d * 0.16, x: throne.x, z: throne.z - frontSign * (throne.d / 2 - 0.1), y: groundY + daisH + throneH * 0.62 });
        items.push('throne');
      }
      // 屏风（五扇；grade 2 三扇）
      const panels = near ? (p.grade >= 3 ? 5 : 3) : 0;
      const panelW = Math.min(1.7, (dais.w * 0.9) / panels);
      const panelH = Math.min(headroom * 0.55, 2.8);
      const screenZ = frontSign > 0 ? dais.z - dais.d / 2 - 0.12 : dais.z + dais.d / 2 + 0.12;
      for (let i = 0; i < panels; i += 1) {
        const px = dais.x - (panels - 1) * panelW / 2 + i * panelW;
        boxAt('furniture', 'timberLacquer', { w: panelW * 0.98, h: panelH, d: 0.14, x: px, z: screenZ, y: groundY + daisH + 0.1 });
        boxAt('screenPanel', 'plasterRed', { w: panelW * 0.8, h: panelH * 0.78, d: 0.16, x: px, z: screenZ, y: groundY + daisH + 0.2 });
        add('trim', 'giltMetal', box(T, { w: panelW * 0.14, h: panelH * 0.06, d: 0.18, x: px, y: groundY + daisH + 0.1 + panelH * 0.96, z: screenZ, tile: tile('giltMetal') }));
      }
      items.push('screen');
      // 盘龙柱（grade≥2 且近景）
      if (near && g.grade >= 2 && dais) {
        const colH = Math.min(headroom - 0.5, 4.2);
        for (const sx of [-1, 1]) {
          const cxx = dais.x + sx * Math.min(dais.w / 2 + 1.6, spanX / 2 - 1.2);
          add('screenPanel', 'plasterRed', cylinder(T, { rt: 0.42, rb: 0.46, h: colH, seg: 10, x: cxx, z: dais.z + frontSign * (dais.d * 0.45), y: groundY, tile: tile('plasterRed'), capped: false }));
          for (let k = 0; k < 3; k += 1) {
            add('trim', 'giltMetal', cylinder(T, { rt: 0.5, rb: 0.5, h: 0.16, seg: 10, x: cxx, z: dais.z + frontSign * (dais.d * 0.45), y: groundY + 0.6 + k * (colH / 3.2), tile: tile('giltMetal'), capped: false }));
          }
        }
        items.push('column');
      }
    }
    // 藻井（三层同心方井 + 鎏金顶心；近景且 grade≥2）
    if (near && g.grade >= 2) {
      const aw = Math.min(spanX * 0.34, 12);
      const ad = Math.min(spanZ * 0.28, 10);
      const layers = 3;
      for (let i = 0; i < layers; i += 1) {
        const k = 1 - i * 0.24;
        const y = ceilingY - 0.1 - i * Math.min(0.42, headroom * 0.1);
        add('ceiling', 'paintingTeal', box(T, { w: aw * k, h: 0.22, d: ad * k, x: cx, y: y - 0.22, z: cz, tile: tile('paintingTeal') }));
        add('trim', 'giltMetal', box(T, { w: aw * k * 0.96, h: 0.07, d: ad * k * 0.96, x: cx, y: y + 0.02, z: cz, tile: tile('giltMetal') }));
      }
      add('trim', 'giltMetal', sphere(T, { r: Math.min(0.5, aw * 0.045), seg: 10, rings: 8, x: cx, y: ceilingY - 0.55, z: cz }));
      items.push('ceiling');
    } else if (!near) {
      // 远景：只留一层天花轮廓（保证"室内不空"的剪影）
      add('ceiling', 'paintingTeal', box(T, { w: Math.min(spanX * 0.3, 10), h: 0.2, d: Math.min(spanZ * 0.24, 8), x: cx, y: ceilingY - 0.3, z: cz, tile: tile('paintingTeal') }));
      items.push('ceiling');
    }
    // 案 + 香炉（近景）
    if (near) {
      const tableD = 1.6;
      const table = fitRect(cx, dais ? dais.z + frontSign * (dais.d / 2 + 2.2) : cz + frontSign * 2, Math.min(4.2, spanX * 0.3), tableD, inner);
      if (table) {
        boxAt('furniture', 'timberLacquer', { w: table.w, h: 0.86, d: table.d, x: table.x, z: table.z });
        add('trim', 'giltMetal', lathe(T, {
          points: [[0.02, 0], [0.22, 0], [0.3, 0.16], [0.32, 0.34], [0.22, 0.44], [0.08, 0.46]],
          seg: 10,
          x: table.x,
          y: 0.86 + groundY,
          z: table.z,
        }));
        items.push('table', 'censer');
      }
    }
  }

  /* ---------------- 配殿/配房（sideHall）：桌案 + 柜架 + 坐榻 + 屏风 + 灯 ---------------- */
  if (p.kind === 'sideHall') {
    const couchD = Math.min(Math.max(1.6, spanZ * 0.14), spanZ - 2 * WALL_MARGIN);
    const couchZ = frontSign > 0 ? backZ - couchD / 2 - WALL_MARGIN : backZ + couchD / 2 + WALL_MARGIN;
    const couch = fitRect(cx, couchZ, Math.min(spanX * 0.4, 4.4), couchD, inner);
    if (couch) {
      boxAt('throne', 'timberDark', { w: couch.w, h: 0.52, d: couch.d, x: couch.x, z: couch.z });
      boxAt('furniture', 'timberLacquer', { w: couch.w * 0.92, h: 0.34, d: couch.d * 0.34, x: couch.x, z: couch.z - frontSign * (couch.d / 2 - 0.2), y: groundY + 0.52 });
      items.push('couch');
    }
    if (near) {
      // 桌案
      const table = fitRect(cx, couch ? couch.z + frontSign * (couch.d / 2 + 2.4) : cz + frontSign * 2, Math.min(3.2, spanX * 0.34), 1.4, inner);
      if (table) {
        boxAt('furniture', 'timberLacquer', { w: table.w, h: 0.84, d: table.d, x: table.x, z: table.z });
        items.push('table');
      }
      // 书架/柜（贴侧墙）
      const cabW = Math.min(1.2, spanX * 0.2);
      const cabD = Math.min(2.4, spanZ * 0.24);
      const cabX = inner.minX + cabW / 2 + WALL_MARGIN;
      const cab = fitRect(cabX, cz, cabW, cabD, inner);
      if (cab) {
        boxAt('furniture', 'timberLacquer', { w: cab.w, h: 2.0, d: cab.d, x: cab.x, z: cab.z });
        for (let i = 0; i < 3; i += 1) {
          add('trim', 'giltMetal', box(T, { w: cab.w * 0.9, h: 0.06, d: cab.d * 0.92, x: cab.x, y: groundY + 0.5 + i * 0.55, z: cab.z, tile: tile('giltMetal') }));
        }
        items.push('cabinet');
      }
      // 屏风（3 扇）
      const panels = 3;
      const panelW = Math.min(1.5, (spanX * 0.5) / panels);
      const panelH = Math.min(headroom * 0.5, 2.2);
      for (let i = 0; i < panels; i += 1) {
        const px = cx - (panels - 1) * panelW / 2 + i * panelW;
        const pz = inner.maxZ - WALL_MARGIN - 0.1;
        boxAt('furniture', 'timberLacquer', { w: panelW * 0.96, h: panelH, d: 0.12, x: px, z: pz, y: groundY });
        boxAt('screenPanel', 'plasterRed', { w: panelW * 0.78, h: panelH * 0.76, d: 0.14, x: px, z: pz, y: groundY + 0.1 });
      }
      items.push('screen');
    }
  }

  /* ---------------- 门殿（gateHall）：门闩 + 值守陈设（案/更鼓/灯） ---------------- */
  if (p.kind === 'gateHall') {
    const sideX = cx + (spanX / 2 - 1.6);
    const guard = fitRect(sideX, cz, 1.8, Math.min(2.6, spanZ * 0.4), inner);
    if (guard) {
      boxAt('furniture', 'timberLacquer', { w: guard.w, h: 0.8, d: guard.d, x: guard.x, z: guard.z });
      items.push('table');
    }
    if (near) {
      const sideX2 = cx - (spanX / 2 - 1.6);
      const bench = fitRect(sideX2, cz, 1.6, Math.min(2.2, spanZ * 0.36), inner);
      if (bench) {
        boxAt('throne', 'timberDark', { w: bench.w, h: 0.46, d: bench.d, x: bench.x, z: bench.z });
        items.push('bench');
      }
      // 更鼓（鎏金铜鼓）
      const drum = fitRect(cx, cz + frontSign * Math.min(3, spanZ * 0.3), 1.4, 1.4, inner);
      if (drum) {
        add('trim', 'giltMetal', cylinder(T, { rt: 0.7, rb: 0.7, h: 0.8, seg: 12, x: drum.x, z: drum.z, y: groundY + 0.1, tile: tile('giltMetal') }));
        items.push('drum');
      }
      // 门闩（内侧横木）
      const boltW = Math.min(spanX * 0.5, 6);
      add('furniture', 'timberLacquer', beam(T, {
        from: { x: cx - boltW / 2, y: groundY + 1.5, z: frontSign > 0 ? inner.minZ + 0.3 : inner.maxZ - 0.3 },
        to: { x: cx + boltW / 2, y: groundY + 1.5, z: frontSign > 0 ? inner.minZ + 0.3 : inner.maxZ - 0.3 },
        thickness: 0.18,
        tile: tile('timberLacquer'),
      }));
      items.push('doorBolt');
    }
  }

  /* ---------------- 角楼（cornerTower）：盘道楼梯 + 瞭望窗框 + 军械架 ---------------- */
  if (p.kind === 'cornerTower') {
    const stepN = near ? 10 : 4;
    const stepH = Math.min((headroom - 0.6) / Math.max(1, stepN), 0.34);
    const stepD = Math.min(1.1, Math.max(0.5, spanZ / (stepN + 3)));
    for (let i = 0; i < stepN; i += 1) {
      const z = inner.minZ + WALL_MARGIN + stepD * i;
      const r = fitRect(inner.minX + WALL_MARGIN + 1.0, z, 2.0, stepD * 0.9, inner);
      if (!r) break;
      boxAt('dais', 'stoneWhite', { w: r.w, h: stepH * (i + 1), d: r.d, x: r.x, z: r.z, y: groundY });
    }
    items.push('stair');
    if (near) {
      // 瞭望窗框（贴内墙面，仅框不打洞避免穿墙）
      for (const sz of [-1, 1]) {
        const zz = sz > 0 ? inner.maxZ - 0.25 : inner.minZ + 0.25;
        const r = fitRect(cx, zz, Math.min(2.4, spanX * 0.4), 0.3, inner);
        if (!r) continue;
        boxAt('furniture', 'timberLacquer', { w: r.w, h: 1.4, d: r.d, x: r.x, z: r.z, y: groundY + Math.min(2.2, headroom * 0.45) });
      }
      items.push('windowFrame');
      // 军械架（架 + 三支长兵：木杆 + 鎏金镦）
      const rack = fitRect(inner.maxX - 1.4, cz, 1.0, Math.min(3.2, spanZ * 0.4), inner);
      if (rack) {
        boxAt('furniture', 'timberLacquer', { w: rack.w, h: 1.6, d: rack.d, x: rack.x, z: rack.z });
        for (let i = 0; i < 3; i += 1) {
          const gz = rack.z - rack.d / 2 + (rack.d * (i + 0.5)) / 3;
          add('furniture', 'timberLacquer', beam(T, {
            from: { x: rack.x - 0.35, y: groundY + 0.2, z: gz },
            to: { x: rack.x - 0.35, y: groundY + 2.4, z: gz },
            thickness: 0.1,
            tile: tile('timberLacquer'),
          }));
          add('trim', 'giltMetal', sphere(T, { r: 0.1, seg: 6, rings: 4, x: rack.x - 0.35, y: groundY + 2.45, z: gz }));
        }
        items.push('rack');
      }
    }
  }

  /* ---------------- 灯具（所有类型共有；近景 4 盏、远景 1 盏；不投影由调用方/材质策略决定） ---------------- */
  const lampCount = near ? (p.kind === 'hall' && g.grade >= 3 ? 4 : 2) : 1;
  const lampH = Math.min(2.6, headroom * 0.45);
  for (let i = 0; i < lampCount; i += 1) {
    const lx = lampCount === 1 ? cx : (i % 2 === 0 ? inner.minX + 1.2 : inner.maxX - 1.2);
    const lz = lampCount <= 2 ? cz + frontSign * Math.min(spanZ * 0.25, 3) : inner.minZ + 1.2 + (i >= 2 ? spanZ - 2.4 : 0);
    const r = fitRect(lx, lz, 1.0, 1.0, inner);
    if (!r) continue;
    add('furniture', 'timberDark', cylinder(T, { rt: 0.07, rb: 0.09, h: lampH, seg: 8, x: r.x, z: r.z, y: groundY, tile: tile('timberDark'), capped: false }));
    add('lanternGlow', 'lampGlow', cylinder(T, { rt: 0.2, rb: 0.22, h: 0.36, seg: 10, x: r.x, z: r.z, y: groundY + lampH, tile: tile('lampGlow') }));
    add('trim', 'giltMetal', cylinder(T, { rt: 0.02, rb: 0.26, h: 0.14, seg: 10, x: r.x, z: r.z, y: groundY + lampH + 0.36, tile: tile('giltMetal') }));
    items.push('lantern');
  }
  // 未见过的随机量不参与几何（保持确定性）：seed 仅用于轻微摆放抖动
  const jitter = rng.range(-0.02, 0.02);
  void jitter;

  return { parts, items, dims: { spanX, spanZ, headroom, ceilingY, inner, detail } };
}

/**
 * 组装 `kit.interiorSet(...)`。
 * 返回未挂载的 THREE.Group（`lod:'near'|'far'|'none'`）或 THREE.LOD（默认 'auto'，近/远两档）。
 */
export function interiorSet(env, raw = {}) {
  const { config } = env;
  const T = env.THREE;
  const kind = raw.kind ?? 'hall';
  if (!INTERIOR_KINDS.includes(kind)) {
    throw new Error(`kit.interiorSet: 未知建筑类型 ${String(kind)}（只能是 ${INTERIOR_KINDS.join(' | ')}）`);
  }
  const grade = raw.grade ?? 2;
  gradeOf(config, grade); // 非法等级直接抛错（与构件工厂同口径）
  const bounds = raw.bounds;
  if (!bounds || ![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('kit.interiorSet: params.bounds 必须是 { minX, maxX, minZ, maxZ }（世界坐标，米）');
  }
  if (!(bounds.maxX - bounds.minX > 0.5 && bounds.maxZ - bounds.minZ > 0.5)) {
    throw new Error(`kit.interiorSet: bounds 尺寸非法（${bounds.maxX - bounds.minX} × ${bounds.maxZ - bounds.minZ}）`);
  }
  const groundY = typeof raw.groundY === 'number' ? raw.groundY : 0;
  const inset = typeof raw.inset === 'number' ? raw.inset : DEFAULT_INSET;
  const p = {
    kind,
    grade,
    bounds,
    groundY,
    inset,
    // 默认天花高度：保守 3.4m（调用方可传 ceilingY；不传也不会穿顶）
    ceilingY: typeof raw.ceilingY === 'number' ? raw.ceilingY : groundY + 3.4,
    entrance: raw.entrance ? { x: raw.entrance.x ?? (bounds.minX + bounds.maxX) / 2, z: raw.entrance.z ?? bounds.minZ } : null,
    seed: raw.seed ?? env.deriveSeed?.(raw.id ?? kind, kind) ?? config.SCENE_SEED,
    id: raw.id ?? `interior:${kind}`,
  };
  if (p.ceilingY <= groundY + 0.5) throw new Error(`kit.interiorSet: ceilingY(${p.ceilingY}) 必须高于 groundY(${groundY})`);
  p.center = { x: (bounds.minX + bounds.maxX) / 2, y: groundY, z: (bounds.minZ + bounds.maxZ) / 2 };
  const innerSpan = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) - 2 * inset;
  const warnings = [];
  if (innerSpan < LIMITS.minSpan) {
    warnings.push({ code: 'interior-tight', message: `${p.id}: 室内净尺寸 ${innerSpan.toFixed(1)}m < ${LIMITS.minSpan}m，降级为"地面 + 灯"` });
  }

  const wanted = raw.lod ?? 'auto';
  const build = (detail) => composeInterior(env, p, innerSpan < LIMITS.minSpan ? 'far' : detail);
  const groupOf = (detail) => {
    // 远景档刻意留空：室内陈设只在"看得见"的距离内绘制（LOD 第 3 档为空 → 全城/远景视角 0 新增调用，
    // 否则 47+ 栋 × 每栋数个合批桶会把 config.BUDGET.drawCalls.mainSceneMax(350) 吃光）。
    if (detail === 'far') {
      const empty = new env.THREE.Group();
      empty.name = `${p.id}:far(empty)`;
      return { group: empty, items: [], dims: null, triangles: 0 };
    }
    const { parts: built, items, dims } = build(detail);
    const group = new T.Group();
    group.name = `${p.id}:${detail}`;
    let triangles = 0;
    for (const { part, material, geometry } of built.merge(T)) {
      triangles += Math.floor(geometry.attributes.position.count / 3);
      // 几何改为"以内景中心为原点"的局部坐标（与构件工厂一致）：LOD 距离按每栋自身位置计算，
      // 调用方拿到 Group 后可直接 root.add（位置已设好）或按需再旋转。
      translate(T, geometry, -p.center.x, -p.center.y, -p.center.z);
      const mesh = new T.Mesh(geometry, env.materials.get(material));
      mesh.name = `${p.id}:${detail}:${part}`;
      mesh.userData.part = part;
      mesh.userData.materialKey = material;
      mesh.userData.interior = true;
      // 室内陈设一律投影 + 接收（与构件工厂同口径；合批阴影守恒由 §15 负责）
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return { group, items, dims, triangles };
  };

  let object;
  let metrics;
  if (wanted === 'near' || wanted === 'far' || wanted === 'none') {
    const detail = wanted === 'none' ? 'near' : wanted;
    const { group, items, dims, triangles } = groupOf(detail);
    object = group;
    metrics = { items, triangles: { [detail]: triangles }, dims };
  } else {
    const nearR = groupOf('near');
    const midR = groupOf('mid');
    const farR = groupOf('far');
    object = makeLOD(env.THREE, [{ object: nearR.group }, { object: midR.group }, { object: farR.group }], {
      budget: config.BUDGET.lod,
      quality: env.quality,
      name: `${p.id}:lod`,
    });
    metrics = {
      items: nearR.items,
      triangles: { near: nearR.triangles, mid: midR.triangles, far: farR.triangles },
      dims: nearR.dims,
      lodLevels: 3,
      lodDistances: object.userData.kit?.distances ?? [],
    };
  }
  object.position.set(p.center.x, p.center.y, p.center.z);
  object.updateMatrixWorld(true);
  const worldBox = new T.Box3().setFromObject(object.isLOD ? object.levels[0].object : object);
  object.userData.kit = {
    id: p.id,
    kind: 'interior',
    interiorKind: kind,
    grade,
    detail: wanted,
    params: { ...p },
    metrics: {
      ...metrics,
      center: p.center,
      worldBounds: {
        minX: +worldBox.min.x.toFixed(3), maxX: +worldBox.max.x.toFixed(3),
        minY: +worldBox.min.y.toFixed(3), maxY: +worldBox.max.y.toFixed(3),
        minZ: +worldBox.min.z.toFixed(3), maxZ: +worldBox.max.z.toFixed(3),
      },
      bounds: { ...bounds },
    },
    warnings,
    version: 'kit-interiors-1.0.0',
  };
  return object;
}

export default interiorSet;
