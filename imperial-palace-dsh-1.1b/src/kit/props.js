/**
 * props.js — 共享摆件工厂（树木 / 山石 / 灯具 / 石栏 / 铜器 / 照壁 / 水面 / 铺地）
 * =============================================================================
 * 规范来源：config.PLANTS（树冠只有 roundedCone / domedSphere / layeredUmbral 三种、统一低饱和、
 * 尺度 5.5/9/13.5、花树点缀 12%、花 #e8b7bd、干 #5b4634）、config.WATER、config.LIGHTING.lamps。
 * 随机性：全部来自传入的确定性 rng（种子由 config.deriveSeed / SCENE_SEED 派生），禁止 Math.random。
 */

import { THREE } from './three-ref.js';
import { Parts, box, cylinder, sphere, cone, polyhedron, lathe, beam, translate, translate as move } from './geometry.js';

/** 确定性 PRNG（mulberry32）。 */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))],
    bool: (p) => next() < p,
  };
}

/**
 * 树木：树干（圆锥台）+ 树冠（三选一，来自 config.PLANTS.canopyShapes）；花树换 blossom 材质。
 * params: { height, canopyShape, blossom, size ('small'|'medium'|'large'), detail, rng, tile }
 */
export function buildTree(T, { height, canopyShape = 'domedSphere', blossom = false, detail = 'near', rng, tile = 1, plants }) {
  const parts = new Parts();
  const h = height;
  const trunkH = h * 0.42;
  const trunkR = h * 0.035;
  const canopyR = h * plants.canopyRadiusRatio;
  const leafMat = blossom ? 'blossom' : 'foliage';
  const seg = detail === 'far' ? 5 : detail === 'mid' ? 6 : 8;
  parts.add('trunk', 'trunk', cylinder(T, { rt: trunkR * 0.6, rb: trunkR * 1.15, h: trunkH, seg, y: 0, tile }));
  // 分枝（近景）
  if (detail === 'near') {
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2 + (rng ? rng.range(0, Math.PI) : 0);
      parts.add('branch', 'trunk', beam(T, {
        from: { x: 0, y: trunkH * 0.75, z: 0 },
        to: { x: Math.cos(a) * canopyR * 0.55, y: trunkH + canopyR * 0.45, z: Math.sin(a) * canopyR * 0.55 },
        thickness: trunkR * 0.5,
        tile,
      }));
    }
  }
  const wobble = rng ? rng.range(-0.06, 0.06) : 0;
  switch (canopyShape) {
    case 'roundedCone': {
      const layers = detail === 'far' ? 1 : 2;
      for (let i = 0; i < layers; i += 1) {
        const fr = 1 - i * 0.35;
        parts.add('canopy', leafMat, cone(T, {
          r: canopyR * fr,
          h: canopyR * 1.5 * (1 - i * 0.2),
          seg,
          y: trunkH + i * canopyR * 0.55,
          x: wobble,
        }));
      }
      break;
    }
    case 'layeredUmbral': {
      const layers = detail === 'far' ? 1 : 3;
      for (let i = 0; i < layers; i += 1) {
        const fr = 1 - i * 0.24;
        parts.add('canopy', leafMat, sphere(T, {
          r: canopyR * fr,
          seg,
          rings: Math.max(4, seg - 2),
          scaleY: 0.62,
          scaleXZ: 1,
          y: trunkH + canopyR * 0.4 + i * canopyR * 0.45,
          x: wobble,
        }));
      }
      break;
    }
    case 'domedSphere':
    default: {
      parts.add('canopy', leafMat, sphere(T, {
        r: canopyR,
        seg,
        rings: Math.max(4, seg - 2),
        scaleY: 0.82,
        scaleXZ: 1,
        y: trunkH + canopyR * 0.62,
        x: wobble,
      }));
      break;
    }
  }
  const dims = { height: h, trunkH, canopyR, canopyShape, blossom, segments: seg };
  parts.dims.tree = dims;
  return { parts, dims };
}

/** 山石（假山）：多块多面体叠置，styleRole 默认 terraceStone（白石）。 */
export function buildRockery(T, { w, d, height, detail = 'near', rng, tile = 1 }) {
  const parts = new Parts();
  const n = detail === 'far' ? 2 : detail === 'mid' ? 4 : 6;
  const r0 = Math.min(w, d) / 2;
  const r = rng ?? makeRng(Math.round(height * 1000) + Math.round(w));
  const rMax = Math.min(r0 * 0.55, height * 0.45);
  for (let i = 0; i < n; i += 1) {
    const t = i / Math.max(1, n - 1);
    const stretch = [r.range(0.8, 1.3), r.range(0.7, 1.25), r.range(0.8, 1.3)];
    const rr = rMax * (1 - 0.55 * t) * r.range(0.85, 1.1);
    // 石块顶面不超过 design height（顶点范围为 ±rr·stretchY，故中心需抬 rr·stretchY）
    const py = Math.max(0, (height - 2 * rr * stretch[1]) * t);
    parts.add('rockery', 'stoneWhite', polyhedron(T, {
      r: rr,
      detail: detail === 'far' ? 0 : 1,
      x: r.range(-w * 0.2, w * 0.2) * (1 - t * 0.5),
      y: py + rr * stretch[1],
      z: r.range(-d * 0.2, d * 0.2) * (1 - t * 0.5),
      stretch,
    }));
  }
  const dims = { w, d, height, pieces: n, maxPieceRadius: +rMax.toFixed(3) };
  parts.dims.rockery = dims;
  return { parts, dims };
}

/**
 * 宫灯：石座 + 木柱 + 灯身（发光材质 lampGlow）+ 鎏金顶。
 * 灯位由区域声明（layout.LIGHT_ANCHORS），本工厂只造"可见灯体"，不建任何灯光。
 */
export function buildLantern(T, { height = 3.4, detail = 'near', tile = 1, kind = 'post' }) {
  const parts = new Parts();
  const seg = detail === 'far' ? 6 : 10;
  const baseH = height * 0.08;
  parts.add('lanternBase', 'stoneWhite', cylinder(T, { rt: height * 0.09, rb: height * 0.12, h: baseH, seg, y: 0, tile }));
  if (kind === 'post') {
    parts.add('lanternPost', 'timberDark', cylinder(T, { rt: height * 0.028, rb: height * 0.035, h: height * 0.62, seg, y: baseH, tile }));
  }
  const bodyH = height * 0.24;
  const bodyY = height * (kind === 'post' ? 0.62 : 0.08) + baseH;
  parts.add('lanternBody', 'lampGlow', cylinder(T, { rt: height * 0.085, rb: height * 0.095, h: bodyH, seg, y: bodyY, tile }));
  if (detail !== 'far') {
    const capY = bodyY + bodyH;
    parts.add('lanternCap', 'giltMetal', cylinder(T, { rt: 0, rb: height * 0.12, h: height * 0.07, seg, y: capY, tile }));
    parts.add('lanternKnob', 'giltMetal', sphere(T, { r: height * 0.025, seg: 8, rings: 6, y: capY + height * 0.075 }));
    // 灯架横枋
    parts.add('lanternFrame', 'timberLacquer', box(T, { w: height * 0.26, h: height * 0.018, d: height * 0.018, y: capY - height * 0.02, tile }));
  }
  const dims = { height, bodyY, bodyH, kind };
  parts.dims.lantern = dims;
  return { parts, dims };
}

/**
 * 铜器：drum（鼓）/ bell（钟）/ vessel（鼎、缶）/ censer（香炉）/ lion（铜狮）。
 * 全部用鎏金材质（config.COLOR_ROLES.metalGilt → gilt #ffc83b，唯一有明显金属反射的材质）。
 */
export function buildBronze(T, { kind = 'vessel', size = 1.6, detail = 'near', tile = 1 }) {
  const parts = new Parts();
  const seg = detail === 'far' ? 8 : 14;
  const s = size;
  if (kind === 'drum') {
    parts.add('bronze', 'giltMetal', cylinder(T, { rt: s * 0.5, rb: s * 0.5, h: s * 0.55, seg, y: 0, tile }));
    if (detail !== 'far') {
      parts.add('bronzeBand', 'giltMetal', cylinder(T, { rt: s * 0.52, rb: s * 0.52, h: s * 0.06, seg, y: s * 0.1, tile }));
      parts.add('bronzeBand', 'giltMetal', cylinder(T, { rt: s * 0.52, rb: s * 0.52, h: s * 0.06, seg, y: s * 0.38, tile }));
    }
    parts.dims.bronze = { kind, size: s, h: s * 0.55 };
    return { parts, dims: parts.dims.bronze };
  }
  if (kind === 'bell') {
    const profile = [
      [0.02, 0],
      [s * 0.42, 0],
      [s * 0.46, s * 0.12],
      [s * 0.40, s * 0.42],
      [s * 0.30, s * 0.56],
      [s * 0.16, s * 0.62],
      [s * 0.06, s * 0.64],
    ];
    parts.add('bronze', 'giltMetal', lathe(T, { points: profile, seg, y: 0, tile }));
    parts.add('bronzeHook', 'giltMetal', cylinder(T, { rt: s * 0.05, rb: s * 0.05, h: s * 0.2, seg: 8, y: s * 0.64, tile }));
    parts.dims.bronze = { kind, size: s, h: s * 0.84 };
    return { parts, dims: parts.dims.bronze };
  }
  if (kind === 'censer') {
    const profile = [
      [0.02, 0],
      [s * 0.3, 0],
      [s * 0.44, s * 0.18],
      [s * 0.46, s * 0.4],
      [s * 0.34, s * 0.52],
      [s * 0.12, s * 0.54],
    ];
    parts.add('bronze', 'giltMetal', lathe(T, { points: profile, seg, y: 0, tile }));
    for (const sx of [-1, 1]) {
      parts.add('bronzeHandle', 'giltMetal', box(T, { w: s * 0.12, h: s * 0.1, d: s * 0.06, x: sx * s * 0.48, y: s * 0.3, tile }));
    }
    if (detail !== 'far') {
      for (const sz of [-1, 1]) {
        parts.add('bronzeLeg', 'giltMetal', cylinder(T, { rt: s * 0.05, rb: s * 0.06, h: s * 0.12, seg: 6, z: sz * s * 0.22, y: -s * 0.12, tile }));
      }
    }
    parts.dims.bronze = { kind, size: s, h: s * 0.54 };
    return { parts, dims: parts.dims.bronze };
  }
  if (kind === 'lion') {
    const bodyR = s * 0.34;
    parts.add('bronze', 'giltMetal', polyhedron(T, { r: bodyR, detail: detail === 'far' ? 0 : 1, y: s * 0.42, stretch: [1, 1.15, 1.5] }));
    parts.add('bronzeHead', 'giltMetal', sphere(T, { r: bodyR * 0.75, seg: 8, rings: 6, y: s * 0.78, z: s * 0.24, scaleY: 0.95 }));
    parts.add('bronzeBase', 'stoneWhite', box(T, { w: s * 0.62, h: s * 0.22, d: s * 0.9, y: 0, tile }));
    parts.dims.bronze = { kind, size: s, h: s * 0.9 };
    return { parts, dims: parts.dims.bronze };
  }
  // vessel（鼎/缶）
  const profile = [
    [0.02, 0],
    [s * 0.22, 0],
    [s * 0.3, s * 0.08],
    [s * 0.46, s * 0.36],
    [s * 0.48, s * 0.62],
    [s * 0.38, s * 0.74],
    [s * 0.18, s * 0.78],
  ];
  parts.add('bronze', 'giltMetal', lathe(T, { points: profile, seg, y: 0, tile }));
  if (detail !== 'far') {
    for (const sx of [-1, 1]) {
      parts.add('bronzeEar', 'giltMetal', box(T, { w: s * 0.1, h: s * 0.26, d: s * 0.1, x: sx * s * 0.42, y: s * 0.74, tile }));
    }
    for (const sx of [-1, 1]) {
      parts.add('bronzeLeg', 'giltMetal', cylinder(T, { rt: s * 0.06, rb: s * 0.05, h: s * 0.16, seg: 6, x: sx * s * 0.24, y: -s * 0.16, tile }));
    }
  }
  parts.dims.bronze = { kind: 'vessel', size: s, h: s * 0.78 };
  return { parts, dims: parts.dims.bronze };
}

/** 照壁 / 影壁：墙身 + 瓦顶 + 石基（layout.SCENIC_OBJECTS kind='screenWall'）。 */
export function buildScreenWall(T, { w, height, thickness = 1, detail = 'near', tile = 1, roofType = 'gable' }) {
  const parts = new Parts();
  const bodyH = height * 0.82;
  parts.add('screenWall', 'plasterRed', box(T, { w, h: bodyH, d: thickness, y: 0, tile }));
  parts.add('screenWallBase', 'stoneWhite', box(T, { w: w + thickness * 0.5, h: height * 0.08, d: thickness * 1.6, y: 0, tile }));
  if (detail !== 'far') {
    parts.add('screenWallTop', 'courtyardWallTop', box(T, { w: w + thickness, h: height * 0.07, d: thickness * 2.1, y: bodyH, tile }));
  }
  parts.dims.screenWall = { w, height, thickness, roofType };
  return { parts, dims: parts.dims.screenWall };
}

/** 水面（护城河/水池）：低饱和、反射适度的水面片；不抢主体。 */
export function buildWater(T, { w, d, y, detail = 'near', tile = 1 }) {
  const parts = new Parts();
  const seg = detail === 'far' ? 1 : 2;
  parts.add('water', 'waterSurface', box(T, { w, h: 0.06, d, y, tile: tile * seg }));
  parts.dims.water = { w, d, y };
  return { parts, dims: parts.dims.water };
}

/** 铺地（广场/道路/地坪/桥面）。 */
export function buildPaving(T, { w, d, y = 0, thickness = 0.16, material = 'pavingStone', tile = 1 }) {
  const parts = new Parts();
  parts.add('paving', material, box(T, { w, d: d, h: thickness, y: y - thickness, tile }));
  parts.dims.paving = { w, d, y, thickness, material };
  return { parts, dims: parts.dims.paving };
}

export { move, translate, box, cylinder, sphere, cone, lathe, polyhedron, beam };
