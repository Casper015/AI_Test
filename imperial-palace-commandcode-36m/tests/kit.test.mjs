import * as THREE from '../public/vendor/three/three.module.js';
import * as config from '../src/shared/config.js';
import * as layout from '../src/shared/layout.js';
import { createKit } from '../src/kit/index.js';
import { rngFor } from '../src/shared/rng.js';

const kit = createKit({ THREE, config, rng: rngFor('kit-test') });
let fails = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    fails++;
  }
}

const slots = Object.values(layout.SLOTS).flat();
const kinds = ['hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'courtyardGate'];
for (const kind of kinds) {
  const slot = slots.find((s) => s.kind === kind);
  ok(!!slot, `存在 ${kind} 槽位`);
  if (!slot) continue;
  const res = kit.building(slot);
  ok(res.group.isGroup, `${kind} 返回 Group`);
  ok(res.group.children.length <= 16, `${kind} 合并后 mesh ≤ 16（实际 ${res.group.children.length}）`);
  const size = new THREE.Vector3();
  res.bounds.getSize(size);
  ok(size.y > 3 && size.x > 3 && size.z > 3, `${kind} 体量合理`);
  ok(Number.isFinite(size.x + size.y + size.z), `${kind} 无 NaN`);
  ok(Math.abs(res.group.position.x - slot.x) < 1e-6 && Math.abs(res.group.position.z - slot.z) < 1e-6, `${kind} 放置到槽位坐标`);
  ok(res.height > 4, `${kind} 高度登记（${res.height.toFixed(1)}m）`);
}

const corridor = kit.corridor({ x: 0, z: 0, len: 60, w: 5.4, h: 4.2 });
ok(corridor.children.length > 0, 'corridor 有内容');
const wall = kit.wall({ x: 0, z: 0, len: 120 });
const wallBox = new THREE.Box3().setFromObject(wall);
ok(wallBox.max.y > config.CITY.wallH, 'wall 高于城墙基准');
const bridge = kit.bridge({ x: 0, z: 0, len: 56, w: 22 });
const brBox = new THREE.Box3().setFromObject(bridge);
ok(brBox.max.y > 1.5, 'bridge 有拱起');
const interiorA = kit.interior({ kind: 'throne', x: 0, z: 0, w: 104, d: 50 });
const interiorB = kit.interior({ kind: 'chamber', x: 0, z: 0, w: 76, d: 38 });
ok(interiorA.children.length > 4 && interiorB.children.length > 4, 'interior 两种类型都有内容');
const trees = kit.treeCluster([{ x: 0, z: 0, s: 1 }, { x: 8, z: 4, s: 1.2 }], 'pine');
ok(trees.children.length > 1, 'treeCluster 生成实例化树木');
const pond = kit.props({ kind: 'pond', x: 0, z: 0, r: 30, seed: 1 });
ok(pond.children.length >= 2, 'pond 有水与岸石');
const slab = kit.slabRect({ x: 0, z: 0, w: 100, d: 40, kind: 'plaza' });
ok(slab.children.length >= 1, 'slabRect 生成铺地');

const totalTri = (obj) => {
  let t = 0;
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.attributes.position) {
      t += o.geometry.attributes.position.count / 3;
    }
  });
  return t;
};
const mainHall = kit.building(slots.find((s) => s.id === 'b.main-hall'));
const hallTris = totalTri(mainHall.group);
ok(hallTris > 800 && hallTris < 40000, `主殿三角面合理（${Math.round(hallTris)}）`);

console.log(fails ? `kit 检查失败：${fails} 项` : `kit 通过：6 类建筑 + 廊/墙/桥/内景/树/水/铺地，主殿 ${Math.round(hallTris)} 三角面`);
process.exit(fails ? 1 : 0);
