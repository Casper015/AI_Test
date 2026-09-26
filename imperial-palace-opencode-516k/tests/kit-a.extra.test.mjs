// A 任务补充验收：新构件、三角面上限、无 NaN、签名兼容、资产登记
import * as THREE from '../public/vendor/three/three.module.js';
import * as config from '../src/shared/config.js';
import * as layout from '../src/shared/layout.js';
import { createKit, TIERS } from '../src/kit/index.js';
import { assetRegistry, validateRegistry } from '../src/kit/assets.js';
import { DETAIL_PROFILES } from '../src/kit/details.js';
import { rngFor } from '../src/shared/rng.js';

const kit = createKit({ THREE, config, rng: rngFor('kit-a-extra') });
let fails = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    fails++;
  }
}

const EXPORTS = ['roof', 'hall', 'sideHall', 'pavilion', 'gateHall', 'courtyardGate', 'cornerTower',
  'corridor', 'wall', 'bridge', 'stairs', 'terraceBase', 'interior', 'railing', 'instanced',
  'tree', 'treeCluster', 'props', 'slabRect', 'building', 'mergeStatic', 'boxAt', 'cylAt', 'tier'];
for (const name of EXPORTS) ok(typeof kit[name] === 'function', `既有导出 ${name} 保持函数签名`);
ok(kit.materials && typeof kit.materials === 'object', 'materials 对象保持');
ok(kit.materials.caihuaPainted && kit.materials.caihuaPainted.isMaterial, '彩画材质存在（Node 下退化为纯色）');
ok(TIERS.royal && TIERS.major && TIERS.minor, 'TIERS 三档保持');
ok(DETAIL_PROFILES.grand && DETAIL_PROFILES.minor, '细节档位表存在');

// 资产登记
ok(Array.isArray(kit.registry) && kit.registry.length >= 20, `kit.registry 为登记数组（${kit.registry.length} 条）`);
const reg = validateRegistry(kit.registry);
ok(reg.ok, `registry 字段完整（${reg.issues.slice(0, 3).join('; ')}）`);
ok(validateRegistry(assetRegistry).count === assetRegistry.length, 'assetRegistry 可独立校验');
const custom = createKit({ THREE, config, rng: rngFor('custom'), assets: { registry: assetRegistry.slice(0, 3) } });
ok(custom.registry.length === 3, 'createKit 接受外部 assets.registry');

function tri(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.attributes.position) {
      t += (o.geometry.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1);
    }
  });
  return t;
}

function finite(obj) {
  let good = true;
  obj.traverse((o) => {
    if (!good) return;
    if (o.isMesh && o.geometry && o.geometry.attributes.position) {
      const a = o.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i])) { good = false; break; }
      }
    }
    if (!Number.isFinite(o.position.x + o.position.y + o.position.z)) good = false;
  });
  return good;
}

// 全部槽位：三角面上限（主殿 6000，其它 3000）、mesh ≤ 16、无 NaN
const slots = Object.values(layout.SLOTS).flat();
let overBudget = 0;
let overMesh = 0;
for (const slot of slots) {
  const res = kit.building(slot);
  const t = tri(res.group);
  const cap = slot.id === 'b.main-hall' ? 6000 : 3000;
  if (t > cap) {
    overBudget++;
    console.error(`FAIL: ${slot.id} 三角面 ${Math.round(t)} > 上限 ${cap}`);
  }
  if (res.group.children.length > 16) {
    overMesh++;
    console.error(`FAIL: ${slot.id} 合并后 mesh ${res.group.children.length} > 16`);
  }
  if (!finite(res.group)) console.error(`FAIL: ${slot.id} 含 NaN 几何`);
  if (!Number.isFinite(res.bounds.min.x + res.bounds.max.y + res.height)) console.error(`FAIL: ${slot.id} 包围盒 NaN`);
}
ok(overBudget === 0, `68 槽位三角面上限（超 ${overBudget}）`);
ok(overMesh === 0, `68 槽位 mesh ≤ 16（超 ${overMesh}）`);

// 宫门/院门：中轴射线不应命中外墙实体（门洞通透），仅门扇与门钉等
const ray = new THREE.Raycaster();
function centerGateHits(id) {
  const slot = slots.find((s) => s.id === id);
  const res = kit.building(slot);
  const dir = new THREE.Vector3(0, 0, 1);
  ray.set(new THREE.Vector3(slot.x, 3.0, slot.z - slot.d - 8), dir);
  ray.far = 400;
  return ray.intersectObject(res.group, true).filter((h) => h.object.material === kit.materials.wallRed);
}
ok(centerGateHits('b.gate-south').length === 0, '宫门中轴门洞无红墙实体（板门可通行）');
ok(centerGateHits('c.gate-inner').length === 0, '内廷门中轴门洞无红墙实体');

// 门扇/门环存在：宫门射线能命中木门
const gateSlot = slots.find((s) => s.id === 'b.gate-south');
const gate = kit.building(gateSlot);
ray.set(new THREE.Vector3(gateSlot.x, 3.0, gateSlot.z - gateSlot.d - 8), new THREE.Vector3(0, 0, 1));
ray.far = 400;
const gateHits = ray.intersectObject(gate.group, true);
ok(gateHits.some((h) => h.object.material === kit.materials.woodDark), '宫门中轴命中板门（门扇存在）');

// 屋面细节：带 profile 的屋顶有更多构件且无 NaN
const plainRoof = kit.roof({ w: 24, d: 12, h: 5 });
const detailedRoof = kit.roof({ w: 24, d: 12, h: 5, profile: DETAIL_PROFILES.major });
ok(detailedRoof.children.length > plainRoof.children.length, '屋面细节：带档位屋顶构件更多');
ok(finite(detailedRoof), '屋面细节无 NaN');

// 栏杆：望柱头 + 栏板分层
const rail = kit.railing([{ x: 0, z: 0, len: 12, axis: 'x' }], 0);
ok(rail.children.length >= 3, `railing 细化构件 ≥3（实际 ${rail.children.length}）`);
ok(finite(rail), 'railing 无 NaN');

// 台阶：垂带
const stairs = kit.stairs({ x: 0, z: 0, w: 6, height: 1.8, steps: 4 });
ok(stairs.children.length > 4, 'stairs 含踏步与垂带');

// 铺地：中缝与方砖分格
const axisSlab = kit.slabRect({ x: 0, z: 0, w: 60, d: 120, kind: 'axis' });
ok(axisSlab.children.length >= 2, `轴线路铺地含中缝/分格（实际 ${axisSlab.children.length}）`);
const courtSlab = kit.slabRect({ x: 0, z: 0, w: 40, d: 30, kind: 'court' });
ok(courtSlab.children.length >= 2, '院落铺地含方砖分格');
ok(finite(axisSlab) && finite(courtSlab), '铺地无 NaN');

// 树：松/阔叶/柳
const pine = kit.tree('pine', 0, 0, 1);
const broad = kit.tree('broad', 0, 0, 1);
const willow = kit.tree('willow', 0, 0, 1);
ok(pine.isGroup && broad.isGroup && willow.isGroup, 'tree 三档返回 Group');
ok(willow.children.length >= 3, '柳树含树干/冠体/垂枝');
const willowBox = new THREE.Box3().setFromObject(willow);
ok(Number.isFinite(willowBox.max.y) && willowBox.max.y > 6, '柳树体量合理');
const pineCluster = kit.treeCluster([{ x: 0, z: 0 }, { x: 6, z: 2 }], 'pine');
const willowCluster = kit.treeCluster([{ x: 0, z: 0 }, { x: 6, z: 2 }], 'willow');
ok(pineCluster.children.length > 1, '松树簇实例化');
ok(willowCluster.children.length >= 3, '柳树簇实例化（干/冠/垂枝）');
ok(finite(willowCluster), '柳树簇无 NaN');

// 摆件：香炉锚点、石灯、假山、石栏、旗幡、路径
const censer = kit.props({ kind: 'censer', x: 0, z: 0 });
ok(censer.userData.lightAnchor && censer.userData.lightAnchor.type === 'censer', '铜香炉登记 type:censer 锚点');
ok(censer.userData.lightAnchors.length === 1, '铜香炉锚点数组');
const lamp = kit.props({ kind: 'stoneLamp', list: [{ x: 0, z: 0 }, { x: 4, z: 2 }] });
ok(lamp.children.length >= 4 && lamp.userData.lightAnchors.length === 2, '石灯实例化并返回灯位锚点');
const rock = kit.props({ kind: 'rockery', list: [{ x: 0, z: 0, s: 2 }, { x: 8, z: 0, s: 1.4 }] });
ok(rock.children.length >= 1, '假山生成');
const stoneRail = kit.props({ kind: 'stoneRail', list: [{ x: 0, z: 0, len: 20, axis: 'x' }], y: 0.5 });
ok(stoneRail.children.length >= 3, '长向石栏含实例化望柱');
const banner = kit.props({ kind: 'banner', at: [0, 0] });
ok(banner.children.length >= 2, '旗幡保持');
const path = kit.props({ kind: 'path', rects: [{ x: 0, z: 0, w: 12, d: 30 }, { x: 0, z: 20, w: 8, d: 10 }] });
ok(path.children.length >= 2, 'props(path) 组合铺地');
for (const [name, obj] of [['censer', censer], ['lamp', lamp], ['rock', rock], ['stoneRail', stoneRail], ['path', path]]) {
  ok(finite(obj), `${name} 无 NaN`);
}

// 内景保持
const throne = kit.interior({ kind: 'throne', x: 0, z: 0, w: 104, d: 50 });
const chamber = kit.interior({ kind: 'chamber', x: 0, z: 0, w: 76, d: 38 });
ok(throne.children.length > 4 && chamber.children.length > 4, 'interior 两种类型保持');
ok(finite(throne) && finite(chamber), 'interior 无 NaN');

// mergeStatic 保持
const g = new THREE.Group();
g.add(kit.boxAt(1, 1, 1, 0, 0, 0, kit.materials.stone));
g.add(kit.boxAt(1, 1, 1, 2, 0, 0, kit.materials.stone));
const merged = kit.mergeStatic(g);
ok(merged === g && merged.children.length <= 2, 'mergeStatic 就地合并保持');

console.log(fails
  ? `kit-A 补充检查失败：${fails} 项`
  : `kit-A 补充通过：68 槽位预算与 mesh 上限、门洞通透、瓦垄/斗栱/脊兽/栏杆/铺地细节、松/阔/柳、香炉锚点、registry ${kit.registry.length} 条`);
process.exit(fails ? 1 : 0);
