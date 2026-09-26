/**
 * 紫禁天朝 · 布局总装（主 Agent 冻结 · layout-v1）
 * 汇总各分区布局数据，派生树木点位，导出唯一 LAYOUT 与查询接口。
 */

import { SEEDS } from '../config.js';
import { ctx, ZONES, scope, zoneOf } from './registry.js';
import './boundary.js';
import './forecourt.js';
import './inner.js';
import './west.js';
import './east.js';
import './garden.js';

export const LAYOUT_VERSION = 'layout-v1';

function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectHit(r, x, z, pad) {
  const p = pad || 0;
  return x > r.x0 - p && x < r.x1 + p && z > r.z0 - p && z < r.z1 + p;
}

function freeSpot(x, z, pad) {
  for (const b of ctx.buildings) if (rectHit(b.bounds, x, z, pad + 2)) return false;
  for (const t of ctx.terraces) if (rectHit(t, x, z, pad + 1.5)) return false;
  for (const w of ctx.waters) if (rectHit(w, x, z, pad + 1)) return false;
  for (const p of ctx.paths) if (p.style !== 'soil' && p.style !== 'carpet' && rectHit(p, x, z, pad * 0.5)) return false;
  for (const m of ctx.monuments) if (Math.hypot(m.x - x, m.z - z) < pad + m.r + 1) return false;
  if (Math.abs(x) < 8 && z > -350 && z < 300) return false;
  return true;
}

const TREE_SPECS = [
  { zone: 'B', cx: -96, cz: -256, rx: 34, rz: 44, count: 6, kind: 'pine', seed: 501 },
  { zone: 'B', cx: 96, cz: -256, rx: 34, rz: 44, count: 6, kind: 'pine', seed: 502 },
  { zone: 'C', cx: -110, cz: 240, rx: 18, rz: 56, count: 10, kind: 'pine', seed: 503 },
  { zone: 'C', cx: 110, cz: 240, rx: 18, rz: 56, count: 10, kind: 'pine', seed: 504 },
  { zone: 'D', cx: -215, cz: 40, rx: 68, rz: 52, count: 26, kind: 'pine', seed: 505 },
  { zone: 'D', cx: -215, cz: 205, rx: 76, rz: 84, count: 22, kind: 'mixed', seed: 506 },
  { zone: 'D', cx: -265, cz: -60, rx: 30, rz: 60, count: 10, kind: 'pine', seed: 507 },
  { zone: 'E', cx: 215, cz: 40, rx: 68, rz: 52, count: 24, kind: 'pine', seed: 508 },
  { zone: 'E', cx: 215, cz: 215, rx: 70, rz: 60, count: 18, kind: 'mixed', seed: 509 },
  { zone: 'E', cx: 260, cz: -60, rx: 30, rz: 60, count: 8, kind: 'pine', seed: 510 },
  { zone: 'F', cx: 0, cz: 362, rx: 122, rz: 48, count: 46, kind: 'mixed', seed: 511 },
  { zone: 'F', cx: 0, cz: 330, rx: 60, rz: 20, count: 8, kind: 'blossom', seed: 512 }
];

ctx.trees = [];
for (const spec of TREE_SPECS) {
  const R = mulberry32(SEEDS.zones[spec.zone] * 101 + spec.seed);
  let placed = 0, guard = 0;
  while (placed < spec.count && guard++ < spec.count * 40) {
    const x = spec.cx + (R() * 2 - 1) * spec.rx;
    const z = spec.cz + (R() * 2 - 1) * spec.rz;
    if (!freeSpot(x, z, 3)) continue;
    const kind = spec.kind === 'mixed' ? (R() < 0.35 ? 'blossom' : 'pine') : spec.kind;
    const s = 0.8 + R() * 0.55;
    ctx.trees.push({
      id: spec.zone + '-tree' + placed + '-' + spec.seed, zone: spec.zone, x, z,
      kind, scale: s, rot: R() * Math.PI * 2, variant: (R() * 3) | 0, seed: spec.seed
    });
    placed++;
  }
  scope[spec.zone].trees = scope[spec.zone].trees || [];
  for (const t of ctx.trees) if (t.zone === spec.zone && scope[spec.zone].trees.indexOf(t.id) < 0) scope[spec.zone].trees.push(t.id);
}

for (const z of ZONES) if (!scope[z.id].trees) scope[z.id].trees = [];

export const GLOBAL_VIEWS = [
  { id: 'v-global', mode: 'oblique', name: '全城鸟瞰', position: { x: 0, y: 690, z: -1130 }, target: { x: 0, y: 0, z: 20 }, fov: 46 },
  { id: 'v-iso', mode: 'iso', name: '等距沙盘', position: { x: 1150, y: 1150, z: 1150 }, target: { x: 0, y: 0, z: 0 }, fov: 46, ortho: 660 },
  { id: 'v-axis', mode: 'axis', name: '中轴透视', position: { x: 0, y: 30, z: -560 }, target: { x: 0, y: 16, z: 60 }, fov: 52 },
  { id: 'v-orbit', mode: 'orbit', name: '自由环绕', position: { x: 470, y: 320, z: -560 }, target: { x: 0, y: 10, z: -80 }, fov: 52 }
];

export const TOUR = [
  { id: 't1', view: { x: 0, y: 150, z: -1150 }, target: { x: 0, y: 20, z: -300 }, text: '自南俯瞰，护城河环抱宫城，午门五凤楼居中轴之始。' },
  { id: 't2', view: { x: 0, y: 32, z: -566 }, target: { x: 0, y: 20, z: -404 }, text: '金水桥跨河而入，午门三门洞通前朝。' },
  { id: 't3', view: { x: 0, y: 26, z: -356 }, target: { x: 0, y: 16, z: -150 }, text: '奉天门内是礼仪广场，东西廊庑与朝房围合成庭。' },
  { id: 't4', view: { x: 0, y: 32, z: -200 }, target: { x: 0, y: 20, z: -60 }, text: '三层白石台基之上，金銮殿重檐庑殿，为中轴主殿。' },
  { id: 't5', view: { x: 0, y: 8.4, z: -46 }, target: { x: 0, y: 6.4, z: -72 }, text: '殿内金砖铺地、盘龙金柱，宝座居于藻井之下。' },
  { id: 't6', view: { x: 0, y: 28, z: 100 }, target: { x: 0, y: 14, z: 190 }, text: '乾清门以北是内廷，后三宫沿轴展开。' },
  { id: 't7', view: { x: 0, y: 6.2, z: 176 }, target: { x: 0, y: 5.0, z: 200 }, text: '寝殿暖阁陈设，宫灯映照。' },
  { id: 't8', view: { x: 0, y: 44, z: 252 }, target: { x: 0, y: 8, z: 372 }, text: '御花园古木叠石，钦安殿居中。' }
];

export const LAYOUT = {
  version: LAYOUT_VERSION,
  zones: ZONES,
  scope,
  buildings: ctx.buildings,
  courtyards: ctx.courtyards,
  terraces: ctx.terraces,
  stairs: ctx.stairs,
  walls: ctx.walls,
  corridors: ctx.corridors,
  waters: ctx.waters,
  bridges: ctx.bridges,
  paths: ctx.paths,
  rocks: ctx.rocks,
  monuments: ctx.monuments,
  lanterns: ctx.lanterns,
  trees: ctx.trees,
  obstacles: ctx.obstacles,
  connectors: ctx.connectors,
  viewpoints: ctx.viewpoints,
  globalViews: GLOBAL_VIEWS,
  tour: TOUR,
  stats: {
    buildingCount: ctx.buildings.length,
    courtyardCount: ctx.courtyards.length,
    wallSegments: ctx.walls.length,
    terraceCount: ctx.terraces.length,
    stairCount: ctx.stairs.length,
    bridgeCount: ctx.bridges.length,
    waterCount: ctx.waters.length,
    treeCount: ctx.trees.length,
    obstacleCount: ctx.obstacles.length,
    connectorCount: ctx.connectors.length,
    viewpointCount: ctx.viewpoints.length
  }
};

const buildingIndex = new Map(LAYOUT.buildings.map(b => [b.id, b]));

export function buildingById(id) {
  return buildingIndex.get(id) || null;
}
export function zoneById(id) {
  return ZONES.find(z => z.id === id) || null;
}
export function zoneOf2(x, z) {
  return zoneOf(x, z);
}
export function viewpointsByMode(mode) {
  return LAYOUT.viewpoints.filter(v => v.mode === mode);
}

export default LAYOUT;
