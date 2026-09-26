import * as THREE from '../public/vendor/three/three.module.js';
import * as config from '../src/shared/config.js';
import * as layout from '../src/shared/layout.js';
import { ROADS } from '../src/shared/layout.js';
import { createKit } from '../src/kit/index.js';
import { rngFor } from '../src/shared/rng.js';
import { createRegistry } from '../src/core/registry.js';
import { loadZones } from '../src/core/loader.js';

let fails = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    fails++;
  }
}

const registry = createRegistry({ THREE, config, layout });
const kit = createKit({ THREE, config, rng: rngFor('fp-route') });
const state = { viewMode: 'oblique', selectedBuildingId: null };
const bus = { emit() {}, on() { return () => {}; } };
const ctx = { THREE, config, layout, kit, rng: rngFor, events: {}, bus, state, registry, quality: 'high' };
const zones = await loadZones({ ctx, registry, onProgress: null });

registry.addSurface('ground.palace', -config.CITY.halfX, -config.CITY.halfZ, config.CITY.halfX, config.CITY.halfZ, 0, 'ground');
const apron = 1200;
registry.addSurface('ground.apron.s', -apron, -1500, apron, -config.CITY.halfZ - config.CITY.moatW, -0.5, 'ground');
registry.addSurface('ground.apron.n', -apron, config.CITY.halfZ + config.CITY.moatW, apron, 1500, -0.5, 'ground');
registry.addSurface('ground.apron.w', -apron, -1500, -config.CITY.halfX - config.CITY.moatW, 1500, -0.5, 'ground');
registry.addSurface('ground.apron.e', config.CITY.halfX + config.CITY.moatW, -1500, apron, 1500, -0.5, 'ground');
const moatBands = [
  [-config.CITY.halfX - config.CITY.moatW, -config.CITY.halfZ - config.CITY.moatW, -config.CITY.halfX, config.CITY.halfZ + config.CITY.moatW],
  [config.CITY.halfX, -config.CITY.halfZ - config.CITY.moatW, config.CITY.halfX + config.CITY.moatW, config.CITY.halfZ + config.CITY.moatW],
  [-config.CITY.halfX, -config.CITY.halfZ - config.CITY.moatW, config.CITY.halfX, -config.CITY.halfZ],
  [-config.CITY.halfX, config.CITY.halfZ, config.CITY.halfX, config.CITY.halfZ + config.CITY.moatW]
];
moatBands.forEach((b, i) => registry.addSurface(`water.moat.${i}`, b[0], b[1], b[2], b[3], -1.6, 'water'));

const route = [
  { x: 0, z: -560, y: -0.5, label: '城外南侧' },
  { x: 0, z: -480, y: 1.6, lo: 1.4, label: '南桥中段', span: [0.8, 2.0], kind: 'bridge' },
  { x: 0, z: -452, y: 0, label: '南城门隧道' },
  { x: 0, z: -400, y: 0, label: '前朝南院' },
  { x: 0, z: -300, y: 0, label: '礼仪广场南' },
  { x: 0, z: -200, y: 0, label: '礼仪广场北' },
  { x: 0, z: -154.5, y: 0.5, lo: 0, span: [0.4, 0.6], kind: 'stairs', label: '主殿丹陛起步' },
  { x: 0, z: -150, y: 3.0, lo: 0.5, span: [2.8, 3.2], kind: 'stairs', label: '主殿丹陛中段' },
  { x: 0, z: -147, y: 4.5, lo: 3.0, span: [4.4, 4.6], kind: 'terrace', label: '主殿台基顶层' },
  { x: 0, z: -120, y: 4.82, label: '金銮殿内景' },
  { x: 0, z: 30, y: 0, label: '前朝后苑' },
  { x: 0, z: 104, y: 0, label: '内廷门' },
  { x: 0, z: 176, y: 4.82, label: '寝殿内景' },
  { x: 0, z: 300, y: 0, label: '御花园南' },
  { x: 0, z: 368, y: 2.6, label: '御景亭台基' }
];

function checkSurface(step, s, where) {
  ok(!!s, `${step.label} 处存在可行走面（${where}）`);
  if (!s) return;
  ok(s.kind !== 'water', `${step.label} 不是水面`);
  if (step.kind) ok(s.kind === step.kind, `${step.label} 面类型为 ${step.kind}（实际 ${s.kind}）`);
  if (step.span) ok(s.y >= step.span[0] && s.y <= step.span[1], `${step.label} 高度在 ${step.span.join('–')} 之间（实际 ${s.y.toFixed(2)}）`);
  else ok(Math.abs(s.y - step.y) <= 1.2, `${step.label} 高度接近预期（实际 ${s.y.toFixed(2)}，预期 ${step.y}）`);
}

let runY = null;
let prev = null;
for (const step of route) {
  if (!prev) {
    const s0 = registry.surfaceAt(step.x, step.z, 99);
    checkSurface(step, s0, '起点');
    runY = s0 ? s0.y : 0;
    prev = step;
    continue;
  }
  const dist = Math.hypot(step.x - prev.x, step.z - prev.z);
  const samples = Math.max(2, Math.ceil(dist / 0.5));
  let y = runY;
  let last = null;
  let broken = false;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const x = prev.x + (step.x - prev.x) * t;
    const z = prev.z + (step.z - prev.z) * t;
    const target = registry.surfaceAt(x, z, y + config.FP.step + 0.01);
    if (!target || target.kind === 'water') {
      ok(false, `${prev.label} → ${step.label} 路径中断于 (${x.toFixed(0)}, ${z.toFixed(0)})`);
      broken = true;
      break;
    }
    if (target.y > y + config.FP.step + 0.01) {
      ok(false, `${prev.label} → ${step.label} 台阶过高：${y.toFixed(2)} → ${target.y.toFixed(2)}（≤ ${config.FP.step}）`);
      broken = true;
      break;
    }
    y = target.y;
    last = target;
  }
  if (!broken && last) checkSurface(step, last, '行走到达');
  runY = y;
  prev = step;
}

const total = registry.buildings.size;
ok(total >= 50, `建筑注册 ≥ 50（实际 ${total}）`);
ok(layout.COURTYARDS.length >= 12, `院落 ≥ 12（实际 ${layout.COURTYARDS.length}）`);
const counts = { zone: 0, interior: 0, fp: 0 };
for (const v of registry.viewpoints.values()) {
  if (v.mode === 'zone') counts.zone++;
  if (v.mode === 'interior') counts.interior++;
  if (v.mode === 'fp-spawn') counts.fp++;
}
ok(counts.zone >= 6, `分区机位 ≥ 6（实际 ${counts.zone}）`);
ok(counts.interior >= 2, `室内机位 ≥ 2（实际 ${counts.interior}）`);
ok(counts.fp >= 6, `第一人称出生点 ≥ 6（实际 ${counts.fp}）`);
ok(registry.lightAnchors.length >= 24, `灯位锚点 ≥ 24（实际 ${registry.lightAnchors.length}）`);

console.log(fails
  ? `第一人称路线检查失败：${fails} 项`
  : `第一人称路线通过：${route.length} 个路点连通（含南桥、城门隧道、广场、三层台基、金銮殿与寝殿内景、御花园）；建筑 ${total}、机位 zone ${counts.zone}/interior ${counts.interior}/fp ${counts.fp}、灯位 ${registry.lightAnchors.length}`);
process.exit(fails ? 1 : 0);
