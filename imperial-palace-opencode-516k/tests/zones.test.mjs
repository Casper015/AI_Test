import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from '../public/vendor/three/three.module.js';
import * as config from '../src/shared/config.js';
import * as layout from '../src/shared/layout.js';
import { ROADS } from '../src/shared/layout.js';
import { createKit } from '../src/kit/index.js';
import { rngFor } from '../src/shared/rng.js';
import { createRegistry } from '../src/core/registry.js';

const root = path.join(import.meta.dirname, '..');
const kit = createKit({ THREE, config, rng: rngFor('zones-test') });
const registry = createRegistry({ THREE, config, layout });
const bus = { emit() {}, on() { return () => {}; } };
const state = { viewMode: 'oblique', selectedBuildingId: null };

let fails = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    fails++;
  }
}

const files = {
  forecourt: 'forecourt.js',
  inner: 'inner-palace.js',
  west: 'west-courts.js',
  east: 'east-courts.js',
  garden: 'garden-boundary.js',
  boundary: 'garden-boundary.js'
};

let checked = 0;
let skipped = 0;
for (const [zoneId, file] of Object.entries(files)) {
  const full = path.join(root, 'src', 'zones', file);
  if (!fs.existsSync(full)) {
    console.log(`skip ${zoneId}（${file} 未实现，使用灰盒）`);
    skipped++;
    continue;
  }
  const mod = await import(pathToFileURL(full).href);
  const fn = zoneId === 'garden' ? mod.createGarden : mod.createZone;
  if (typeof fn !== 'function') {
    console.log(`skip ${zoneId}（缺导出 ${zoneId === 'garden' ? 'createGarden' : 'createZone'}）`);
    skipped++;
    continue;
  }
  const zone = layout.ZONES[zoneId];
  const ctx = {
    THREE, config, layout, zone,
    slots: layout.slotsOf(zoneId),
    corridors: layout.CORRIDORS[zoneId] || [],
    roads: ROADS.filter((r) => r.x >= zone.minX - 40 && r.x <= zone.maxX + 40 && r.z >= zone.minZ - 40 && r.z <= zone.maxZ + 40),
    kit, rng: rngFor, events: {}, bus, state, registry, quality: 'high'
  };
  let out = null;
  try {
    out = await fn(ctx);
  } catch (err) {
    ok(false, `${zoneId} createZone 抛错: ${err && err.message}`);
    continue;
  }
  checked++;
  ok(!!out && !!out.root && out.root.isGroup, `${zoneId} 返回 root Group`);
  ok(Array.isArray(out.buildings) && out.buildings.length >= ctx.slots.length, `${zoneId} 建筑数 ≥ 槽位 ${ctx.slots.length}（实际 ${out.buildings ? out.buildings.length : 0}）`);
  ok(!!out.colliders && (out.colliders.obstacles || []).length > 0, `${zoneId} 有障碍包围盒`);
  ok(!!out.colliders && (out.colliders.surfaces || []).length > 0, `${zoneId} 有可行走面`);
  const modes = (out.viewpoints || []).map((v) => v.mode);
  ok(modes.includes('zone'), `${zoneId} 登记 zone 机位`);
  ok(modes.includes('fp-spawn'), `${zoneId} 登记 fp-spawn 出生点`);
  if (zoneId === 'forecourt' || zoneId === 'inner') ok(modes.includes('interior'), `${zoneId} 登记 interior 室内机位`);
  for (const b of out.buildings || []) {
    ok(!!b.id && !!b.name && !!b.bounds && Array.isArray(b.bounds.min), `${zoneId} 建筑字段完整（${b.id}）`);
    ok([...b.bounds.min, ...b.bounds.max].every((v) => Number.isFinite(v)), `${zoneId} 建筑包围盒无 NaN（${b.id}）`);
    ok(b.zone === zoneId || layout.ZONES[b.zone], `${zoneId} 建筑 zone 归属合法（${b.id}）`);
  }
  for (const c of out.connectors || []) {
    ok(!!layout.connectorById(c.id), `${zoneId} 连接 ${c.id} 已登记`);
  }
  for (const v of out.viewpoints || []) {
    ok(Array.isArray(v.position) && v.position.length === 3, `${zoneId} 机位坐标完整（${v.id}）`);
  }
  for (const s of (out.colliders && out.colliders.surfaces) || []) {
    ok(Number.isFinite(s.y), `${zoneId} 可行走面高度有限（${s.id}）`);
    ok(s.min[0] <= s.max[0] && s.min[2] <= s.max[2], `${zoneId} 可行走面范围合法（${s.id}）`);
  }
  const tri = countTri(out.root);
  console.log(`  ${zoneId}: 建筑 ${out.buildings.length}，障碍 ${out.colliders.obstacles.length}，可行走面 ${out.colliders.surfaces.length}，机位 ${out.viewpoints.length}，三角面 ${Math.round(tri)}`);
  ok(tri < 900000, `${zoneId} 三角面在预算内（${Math.round(tri)}）`);
}

function countTri(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
      t += (o.geometry.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1);
    }
  });
  return t;
}

console.log(fails
  ? `zones 检查失败：${fails} 项`
  : `zones 通过：实测 ${checked} 个区域，跳过 ${skipped} 个（灰盒）`);
process.exit(fails ? 1 : 0);
