/**
 * 紫禁天朝 · 布局与连通性检查（主 Agent）
 * 用法：npm test  /  node tests/layout.test.mjs
 * 校验：建筑与院落数量、ID 唯一、分区边界、连接器落位、水面与桥、第一人称路线连通（栅格洪泛）。
 */

import LAYOUT from '../src/shared/layout/index.js';
import { WORLD } from '../src/shared/config.js';
import { buildCollisionModel } from '../src/interaction/collision.js';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; return true; }
  fail++; failures.push(msg); return false;
}
function section(name) { console.log('\n· ' + name); }

section('规模与唯一性');
ok(LAYOUT.stats.buildingCount >= 50, '建筑数应 ≥ 50，实际 ' + LAYOUT.stats.buildingCount);
ok(LAYOUT.stats.courtyardCount >= 12, '院落数应 ≥ 12，实际 ' + LAYOUT.stats.courtyardCount);
const ids = LAYOUT.buildings.map(b => b.id);
ok(new Set(ids).size === ids.length, '建筑 ID 应全局唯一');
const cids = LAYOUT.courtyards.map(c => c.id);
ok(new Set(cids).size === cids.length, '院落 ID 应唯一');
ok(LAYOUT.buildings.filter(b => b.visitable).length >= 2, '至少 2 处建筑可进入');
ok(LAYOUT.buildings.filter(b => b.category === 'cornerTower').length === 4, '应有四座角楼');
ok(LAYOUT.buildings.filter(b => b.category === 'gateMain' || b.category === 'gateHall').length >= 4, '应有多座城门');
ok(LAYOUT.buildings.filter(b => b.category === 'gateHall' && b.opens).length >= 3, '城门应有可通行门洞');
console.log('  建筑 ' + LAYOUT.stats.buildingCount + ' · 院落 ' + LAYOUT.stats.courtyardCount + ' · 墙体 ' + LAYOUT.stats.wallSegments +
  ' · 台阶 ' + LAYOUT.stats.stairCount + ' · 桥 ' + LAYOUT.stats.bridgeCount + ' · 树 ' + LAYOUT.stats.treeCount);

section('分区边界');
const bounds = {};
for (const z of LAYOUT.zones) bounds[z.id] = z.bounds;
let zoneOut = 0;
for (const b of LAYOUT.buildings) {
  const z = bounds[b.zone];
  if (!z) { ok(false, b.id + ' 无分区'); continue; }
  if (b.zone === 'F') continue;
  if (!(b.x >= z.x0 - 60 && b.x <= z.x1 + 60 && b.z >= z.z0 - 60 && b.z <= z.z1 + 60)) zoneOut++;
}
ok(zoneOut === 0, '分区建筑越界数量应为 0，实际 ' + zoneOut);
ok(LAYOUT.buildings.filter(b => b.zone === 'F').length >= 10, 'F 应负责边界建筑（门、角楼、园殿）');
ok(WORLD.enclosure.x1 - WORLD.enclosure.x0 >= 500 && WORLD.enclosure.z1 - WORLD.enclosure.z0 >= 700,
  '宫城包络应不小于 500×700');

section('连接器与共享边界');
for (const c of LAYOUT.connectors) {
  const p = c.position;
  ok(typeof p.x === 'number' && typeof p.z === 'number', c.id + ' 位置缺失');
  if (c.a !== c.b) {
    const onCityEdge = Math.abs(Math.abs(p.x) - 300) < 1 || Math.abs(Math.abs(p.z) - 420) < 1;
    const za = bounds[c.a];
    const onEdge = (Math.abs(p.x - za.x0) < 1 || Math.abs(p.x - za.x1) < 1 || Math.abs(p.z - za.z0) < 1 || Math.abs(p.z - za.z1) < 1);
    ok(onEdge || (c.a === 'F' || c.b === 'F') && onCityEdge, c.id + ' 应位于 ' + c.a + '/' + c.b + ' 共享边界，实际 ' + p.x + ',' + p.z);
  }
}

section('水面与桥');
const waters = LAYOUT.waters.filter(w => w.kind !== 'deck');
ok(waters.length >= 5, '水面数量应 ≥ 5');
for (const b of LAYOUT.bridges) {
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  ok(w > 4 && d > 4, b.id + ' 桥面尺寸异常 ' + w + '×' + d);
}
let bridgeOverWater = 0;
for (const b of LAYOUT.bridges) {
  const mid = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
  for (const w of waters) {
    if (mid.x > w.x0 && mid.x < w.x1 && mid.z > w.z0 && mid.z < w.z1) { bridgeOverWater++; break; }
  }
}
ok(bridgeOverWater >= 4, '至少 4 座桥应跨越水面，实际 ' + bridgeOverWater);

section('第一人称连通性（栅格洪泛）');
const model = buildCollisionModel(LAYOUT, []);
function reachable(from, to, step, debug) {
  const s = step || 6;
  const seen = new Set(), q = [from];
  const key = (x, z) => Math.round(x / s) + ':' + Math.round(z / s);
  seen.add(key(from[0], from[1]));
  let guard = 0;
  let maxZ = from[1];
  while (q.length && guard++ < 60000) {
    const [x, z] = q.pop();
    if (Math.hypot(x - to[0], z - to[1]) < s * 1.5) return true;
    for (const [dx, dz] of [[s, 0], [-s, 0], [0, s], [0, -s]]) {
      const nx = x + dx, nz = z + dz;
      if (Math.abs(nx) > 380 || Math.abs(nz) > 520) continue;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      const surf = model.surfaceAt(nx, nz);
      if (!surf) continue;
      if (model.inWater(nx, nz, 1.2) && surf.kind !== 'bridge') continue;
      if (surf.kind === 'step' || surf.kind === 'terrace' || surf.kind === 'ground' || surf.kind === 'bridge' || surf.kind === 'terrain') {
        seen.add(k);
        q.push([nx, nz]);
        if (nz > maxZ) maxZ = nz;
      }
    }
  }
  if (debug) console.log('    洪泛从 ' + JSON.stringify(from) + ' 最北到达 z=' + maxZ);
  return false;
}
const routePoints = [
  { id: 'south-bridge', p: [0, -500] },
  { id: 'plaza', p: [0, -250] },
  { id: 'main-terrace', p: [0, -120] },
  { id: 'inner-court', p: [0, 200] },
  { id: 'garden', p: [0, 360] },
  { id: 'west-court', p: [-171, -300] },
  { id: 'east-court', p: [171, -300] },
  { id: 'west-lake', p: [-215, 205] }
];
for (const r of routePoints) {
  const surf = model.surfaceAt(r.p[0], r.p[1]);
  ok(!!surf, r.id + ' 目标点无可行走面');
}
const reach = reachable([0, -500], [0, 360], 6, true);
ok(reach, '南桥 → 御花园 应连通（栅格洪泛）');
const westReach = reachable([0, -250], [-171, -300], 6);
ok(westReach, '广场 → 西宫苑院落 应连通');
const eastReach = reachable([0, -250], [171, -300], 6);
ok(eastReach, '广场 → 东宫苑院落 应连通');

section('机位与预算登记');
const modes = ['zone', 'interior', 'fp-spawn'];
for (const m of modes) {
  ok(LAYOUT.viewpoints.some(v => v.mode === m), '缺少 ' + m + ' 机位');
}
ok(LAYOUT.globalViews.length >= 4, '全局机位应 ≥ 4');
ok(LAYOUT.tour.length >= 6, '导览讲解点应 ≥ 6');
ok(LAYOUT.stats.treeCount >= 80, '树木数量应 ≥ 80');

console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 失败 ' + fail + ' 项') + '：pass ' + pass + ' / fail ' + fail);
if (fail) for (const f of failures.slice(0, 12)) console.log('  - ' + f);
process.exit(fail === 0 ? 0 : 1);
