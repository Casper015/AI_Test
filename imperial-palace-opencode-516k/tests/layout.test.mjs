import * as layout from '../src/shared/layout.js';
import * as config from '../src/shared/config.js';

let fails = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    fails++;
  }
}

const slots = Object.values(layout.SLOTS).flat();
ok(slots.length >= 50, `建筑数 ≥ 50（实际 ${slots.length}）`);
ok(layout.COURTYARDS.length >= 12, `院落数 ≥ 12（实际 ${layout.COURTYARDS.length}）`);
ok(new Set(slots.map((s) => s.id)).size === slots.length, '建筑 id 全局唯一');

for (const s of slots) {
  const z = layout.ZONES[s.zone];
  ok(!!z, `${s.id} 的 zone 存在`);
  if (!z) continue;
  const margin = 40;
  ok(s.x >= z.minX - margin && s.x <= z.maxX + margin && s.z >= z.minZ - margin && s.z <= z.maxZ + margin, `${s.id} 位于区域边界内`);
  ok(s.w > 0 && s.d > 0 && (s.bays ?? 3) > 0, `${s.id} 尺寸合法`);
  ok(['hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'courtyardGate'].includes(s.kind), `${s.id} 类型合法`);
}

ok(new Set(layout.CONNECTORS.map((c) => c.id)).size === layout.CONNECTORS.length, '连接 id 唯一');
for (const c of layout.CONNECTORS) {
  ok(!!layout.ZONES[c.owner], `${c.id} 的 owner 合法`);
  ok(c.w > 0, `${c.id} 宽度合法`);
}
for (const zid of Object.keys(layout.ZONES)) {
  const hasCorridor = (layout.CORRIDORS[zid] || []).length > 0;
  ok(hasCorridor || zid === 'boundary' || zid === 'garden', `${zid} 有廊庑或属于边界/园囿`);
}
for (const c of layout.COURTYARDS) {
  ok(!!layout.ZONES[c.zone], `${c.id} 的 zone 合法`);
  ok(c.maxX > c.minX && c.maxZ > c.minZ, `${c.id} 范围合法`);
}

ok(config.VIEW_MODES.length === 8, `多角度模式 8 种（实际 ${config.VIEW_MODES.length}）`);
const modeIds = config.VIEW_MODES.map((v) => v.id);
for (const need of ['oblique', 'iso', 'axis', 'zone', 'focus', 'interior', 'fp', 'orbit']) {
  ok(modeIds.includes(need), `多角度模式包含 ${need}`);
}
for (const m of ['oblique', 'iso', 'axis']) {
  const v = config.VIEWS[m];
  ok(!!v && Array.isArray(v.position) && Array.isArray(v.target), `VIEWS.${m} 完整`);
}
ok(!!config.VIEWS.orbit && Array.isArray(config.VIEWS.orbit.target) && config.VIEWS.orbit.radius > 100, 'VIEWS.orbit 完整');
ok(Object.keys(config.ZONE_VIEWS).length >= 6, '分区机位 ≥ 6');
ok(config.FP.eye > 1.5 && config.FP.step > 0.3, '第一人称参数合理');

console.log(fails
  ? `layout 检查失败：${fails} 项`
  : `layout 通过：建筑 ${slots.length} 栋、院落 ${layout.COURTYARDS.length} 处、连接 ${layout.CONNECTORS.length} 个、视角 ${config.VIEW_MODES.length} 种`);
process.exit(fails ? 1 : 0);
