#!/usr/bin/env node
/**
 * `tests/core-registry.test.mjs` —— t36 回归：连接（跨区通道）登记必须**真正执行**。
 *
 * 缺陷来源：V1/t12 独立验证报告 §5 C-2（medium，owner t2/core）——
 *   `src/core/registry.js` 的连接登记循环写在 `registerColliders()` 里读 `data.connectors`（原 :379），
 *   而 `registerZone()`（原 :544）只传 `result.colliders` → **分支永不执行**：
 *     · `allConnectors()` 恒为空、`stats().connectors === 0`；
 *     · "连接 id 唯一 owner"校验形同不存在（没有任何输入 ⇒ 永不报错）——**静默失效**，长期未暴露。
 *
 * 本测试覆盖：
 *   ① 装配后 32 条连接与 `layout.CONNECTORS` 逐字段一致；`stats().connectors === 32`；
 *   ② 唯一 owner 校验真的会报错（同 id 双 owner 反例 + 声明 owner 与登记区域不一致反例 + 两区域抢同一 id）；
 *   ③ **零连接方向**：登记不带连接的区域不得让 `allConnectors()` 退化为空（防"再次空转"）；
 *   ④ **分支执行方向**：`registerZone` 必须把 `result.connectors` 真正登记进去（owner 接管 + 计数变化），
 *      并且新连接可增可删（32 → 33 → 32）；
 *   ⑤ 幂等与回滚：同区域重复登记同一条 = 去重不报错；卸载区域时被遮蔽的基线连接回滚而不是消失。
 */

import {
  ROOT,
  REAL_ZONE_IDS,
  assert,
  assertEqual,
  assertNoProblems,
  createTestRunner,
  loadModule,
  loadThree,
  makeSilentEvents,
  makeTestCtx,
  zoneModulePath,
} from './harness.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const runner = createTestRunner('core-registry.test.mjs · 连接登记与唯一 owner（t36）');

const THREE = await loadThree();
const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { zoneLayoutFor } = await loadModule('src/core/layout-slice.js');

const makeRegistry = () => createRegistry({ config: CONFIG, events: makeSilentEvents(), layout: LAYOUT });
const CONNECTOR_FIELDS = ['id', 'name', 'kind', 'owner', 'position', 'width', 'elevation', 'elevationLow', 'walkable', 'gate'];

/* ========================================================================== */
runner.section('1. 修复：连接被真正登记（32 条且与 layout.CONNECTORS 逐字段一致）');
/* ========================================================================== */

await runner.test('全新 registry：连接基线即在册（任何装配顺序都有 32 条）', () => {
  const registry = makeRegistry();
  const all = registry.allConnectors();
  assertEqual(LAYOUT.CONNECTORS.length, 32, 'layout.CONNECTORS 应为 32 条（本测试基线）');
  assertEqual(all.length, 32, `allConnectors() 应为 32 条（实际 ${all.length}）`);
  assertEqual(registry.stats().connectors, 32, 'stats().connectors 应为 32');
  assertEqual(registry.stats().connectorOwners.LAYOUT, 32, '未装配区域时应全部挂在 layout 基线上（ownerZone=LAYOUT）');
});

await runner.test('逐字段对账：32 条与 layout.CONNECTORS 的 id/owner/position/width/elevation 完全一致', () => {
  const registry = makeRegistry();
  const byId = new Map(registry.allConnectors().map((c) => [c.id, c]));
  assertEqual(byId.size, 32, 'id 必须唯一（32 条 → 32 个 id）');
  for (const source of LAYOUT.CONNECTORS) {
    const entry = byId.get(source.id);
    assert(entry, `${source.id} 应在 allConnectors()`);
    for (const field of CONNECTOR_FIELDS) {
      assertEqual(
        JSON.stringify(entry[field] ?? null),
        JSON.stringify(source[field] ?? null),
        `${source.id}.${field} 应与 layout 一致`,
      );
    }
    assert(entry.ownerZone, `${source.id} 应带 ownerZone（登记来源）`);
  }
  runner.info(`对账字段：${CONNECTOR_FIELDS.join('/')}；32 条逐条一致`);
});

await runner.test('真实装配（灰盒 + B/C/E/F）：32 条且 owner 被真实区域接管，数量不变', async () => {
  const registry = makeRegistry();
  const events = makeSilentEvents();
  const greyboxModule = await loadModule('src/zones/_greybox.js');
  const kit = greyboxModule.createFallbackKit(THREE, CONFIG);
  const shared = { materials: {}, geometries: {}, textures: {}, disposeRegistry: [], water: [], greyboxSkipZones: [] };
  const greyCtx = await makeTestCtx({ zoneId: 'GREYBOX', scope: 'city', kit, shared, events, registry });
  registry.registerZone('GREYBOX', await greyboxModule.createZone(greyCtx), { replace: true });
  const afterGreybox = registry.stats();
  assertEqual(afterGreybox.connectors, 32, '灰盒装配后仍应为 32 条（同 id 不翻倍）');
  for (const zoneId of REAL_ZONE_IDS) {
    const path = zoneModulePath(zoneId);
    if (!existsSync(join(ROOT, path))) {
      runner.skip(`区域 ${zoneId} 连接登记`, `${path} 未交付`);
      continue;
    }
    const mod = await loadModule(path);
    const ctx = await makeTestCtx({ zoneId, kit, shared, events, registry, greyboxSkipZones: ['GREYBOX'] });
    registry.registerZone(zoneId, await mod.createZone(ctx), { replace: true });
  }
  const stats = registry.stats();
  assertEqual(stats.connectors, 32, `装配全部区域后应为 32 条（实际 ${stats.connectors}）`);
  const owners = stats.connectorOwners;
  const expectedByZone = { B: 7, C: 5, D: 2, E: 3, F: 15 };
  for (const [zoneId, count] of Object.entries(expectedByZone)) {
    assertEqual(owners[zoneId] ?? 0, count, `${zoneId} 应接管 ${count} 条连接`);
  }
  assertEqual(owners.LAYOUT ?? 0, 0, '全部区域装配后不应还有未接管的 baseline 连接');
  runner.info(`装配后 owners=${JSON.stringify(owners)}（B7/C5/D2/E3/F15 与 layout 分区一致）`);
});

/* ========================================================================== */
runner.section('2. 唯一 owner 校验真的会报错（不是空转）');
/* ========================================================================== */

await runner.test('反例：同一连接 id 被两个 owner 登记 → RegistryError（附原始输出）', () => {
  const registry = makeRegistry();
  registry.registerConnectors('B', [{ id: 'CXN-x', owner: 'B', position: { x: 0, z: 0 }, width: 16, elevation: 0.8 }]);
  const countBefore = registry.stats().connectors; // 合法新增后（32 → 33）
  let error = null;
  try {
    registry.registerConnectors('C', [{ id: 'CXN-x', owner: 'C', position: { x: 0, z: 0 }, width: 16, elevation: 0.8 }]);
  } catch (e) {
    error = e;
  }
  assert(error, '同一 id 被两个 owner 登记必须抛错（否则唯一 owner 校验仍是空转）');
  assert(error.name === 'RegistryError', `应为 RegistryError（实际 ${error.name}）`);
  assert(/唯一 owner/.test(error.message), `错误信息应说明唯一 owner 规则：${error.message}`);
  assert(error.detail?.existingOwner === 'B' && error.detail?.declaredOwner === 'C', `detail 应记录两侧 owner：${JSON.stringify(error.detail)}`);
  runner.info(`原始输出：${error.name}: ${error.message}`);
  assertEqual(registry.stats().connectors, countBefore, '被拒的非法登记不得改变连接总数');
});

await runner.test('反例：连接声明 owner 与登记区域不一致 → RegistryError', () => {
  const registry = makeRegistry();
  let error = null;
  try {
    registry.registerConnectors('C', [{ id: 'CXN-y', owner: 'B', position: { x: 1, z: 1 }, width: 8, elevation: 0.4 }]);
  } catch (e) {
    error = e;
  }
  assert(error && error.name === 'RegistryError', '声明 owner 与登记区域不一致必须抛错');
  assert(/声明 owner/.test(error.message), `错误信息应指出声明侧不一致：${error.message}`);
  runner.info(`原始输出：${error.name}: ${error.message}`);
});

await runner.test('反例：两个真实区域抢同一 id（声明 owner 相同）→ RegistryError', () => {
  const registry = makeRegistry();
  registry.registerConnectors('B', [{ id: 'CXN-z', owner: 'B', position: { x: 2, z: 2 }, width: 6, elevation: 0.4 }]);
  let error = null;
  try {
    // 用 B 的声明 owner 在 C 区登记同 id：先撞"声明不一致"，因此改用同 owner 的城市级路径验证第二重心跳
    registry.registerConnectors('GREYBOX', [{ id: 'CXN-z', owner: 'B', position: { x: 2, z: 2 }, width: 6, elevation: 0.4 }]);
  } catch (e) {
    error = e;
  }
  assert(!error, '城市级装配器回显（同 id 同 owner）应被允许（遮蔽/幂等），不得误报');
  const registry2 = makeRegistry();
  registry2.registerConnectors('B', [{ id: 'CXN-w', owner: 'B', position: { x: 3, z: 3 }, width: 6, elevation: 0.4 }]);
  let error2 = null;
  try {
    registry2.registerConnectors('D', [{ id: 'CXN-w', owner: 'B', position: { x: 3, z: 3 }, width: 6, elevation: 0.4 }]);
  } catch (e) {
    error2 = e;
  }
  assert(error2 && /唯一 owner|声明 owner/.test(error2.message), '真实区域之间抢同一 id 必须报错');
  runner.info(`原始输出：${error2.name}: ${error2.message}`);
});

await runner.test('当前 32 条全部唯一：id 唯一、每条恰好一个 owner 且 owner 与声明一致', () => {
  const registry = makeRegistry();
  const all = registry.allConnectors();
  const ids = all.map((c) => c.id);
  assertEqual(new Set(ids).size, ids.length, 'id 不得重复');
  const owners = new Map();
  for (const c of all) {
    assert(c.owner, `${c.id} 应有声明 owner`);
    assert(c.ownerZone, `${c.id} 应有登记 ownerZone`);
    const seen = owners.get(c.id);
    assertEqual(seen ?? c.ownerZone, c.ownerZone, `${c.id} 只能有一个登记 owner`);
    owners.set(c.id, c.ownerZone);
  }
  assertEqual(owners.size, 32, '32 条连接各有一个 owner');
  assertEqual(Math.max(...Object.values(registry.stats().connectorOwners)), 32, '未装配时 32 条同属 layout 基线');
});

/* ========================================================================== */
runner.section('3. 双向回归：零连接方向 + 分支执行方向（防再次退化为空转）');
/* ========================================================================== */

await runner.test('零连接方向：登记不含连接的区域后 allConnectors() 不得退化为空集', () => {
  const registry = makeRegistry();
  registry.registerZone('Z0', { buildings: [], connectors: [], colliders: {}, viewpoints: [], lightAnchors: [] });
  assertEqual(registry.stats().connectors, 32, '零连接区域不得改变连接总数');
  assert(registry.allConnectors().length === 32, 'allConnectors() 不得变空（这正是原缺陷的表现）');
  // 缺省字段也不得抛错（更宽松的零连接写法）
  registry.registerZone('Z1', { buildings: [], colliders: {}, viewpoints: [], lightAnchors: [] });
  assertEqual(registry.stats().connectors, 32, '未提供 connectors 字段时也应保持 32 条');
  runner.info('零连接方向：Z0（connectors: []）与 Z1（无 connectors 字段）后均为 32 条');
});

await runner.test('分支执行方向：registerZone 必须真正登记 result.connectors（owner 接管 + 可增可删）', () => {
  const registry = makeRegistry();
  const before = registry.stats();
  assertEqual(before.connectorOwners[`B`] ?? 0, 0, '登记前 B 尚无连接');

  const connectors = zoneLayoutFor('B').connectors;
  assert(connectors.length === 7, 'B 区切片应有 7 条连接');
  registry.registerZone('B', { buildings: [], connectors, colliders: {}, viewpoints: [], lightAnchors: [] });

  const after = registry.stats();
  assertEqual(after.connectors, 32, '接管后总数仍为 32（同 id 遮蔽，不翻倍）');
  assertEqual(after.connectorOwners.B ?? 0, 7, 'B 的 7 条必须被登记到 B 名下（若分支再次空转，这里会是 0 → 本断言即守卫）');
  assertEqual(after.connectorOwners.LAYOUT ?? 0, 25, 'baseline 未接管数应降到 25');

  // 新连接：登记 → 33；卸载 → 回滚 32（B 被遮蔽的 7 条回到 layout 基线）
  registry.registerConnectors('B', [{ id: 'CXN-regression-probe', owner: 'B', position: { x: 9, z: 9 }, width: 4, elevation: 0.4 }]);
  assertEqual(registry.stats().connectors, 33, '新增一条连接后应为 33');
  registry.unregisterZone('B');
  assertEqual(registry.stats().connectors, 32, '卸载 B 后应回滚为 32（被遮蔽的 7 条回到 layout 基线，探针条目删除）');
  assertEqual(registry.stats().connectorOwners.LAYOUT ?? 0, 32, '卸载后 32 条全部回到 layout 基线');
});

await runner.test('幂等方向：同区域重复登记同一条 = 去重不报错，总数不变', () => {
  const registry = makeRegistry();
  const one = zoneLayoutFor('F').connectors[0];
  registry.registerConnectors('F', [one]);
  registry.registerConnectors('F', [one]);
  const stats = registry.stats();
  assertEqual(stats.connectors, 32, '重复登记同一 id 不得增加总数');
  assertEqual(stats.connectorsDeduped, 1, '应记录 1 次去重');
  assertEqual(stats.connectorOwners.F ?? 0, 1, 'F 名下 1 条');
});

await runner.test('兼容路径：把 connectors 塞进 colliders 负载也走同一套校验（不绕开唯一 owner）', () => {
  const registry = makeRegistry();
  registry.registerColliders('B', { connectors: [{ id: 'CXN-compat', owner: 'B', position: { x: 4, z: 4 }, width: 4, elevation: 0 }] });
  assertEqual(registry.stats().connectors, 33, '兼容路径应真的登记进去');
  let error = null;
  try {
    registry.registerColliders('C', { connectors: [{ id: 'CXN-compat', owner: 'C', position: { x: 4, z: 4 }, width: 4, elevation: 0 }] });
  } catch (e) {
    error = e;
  }
  assert(error && /唯一 owner/.test(error.message), '兼容路径同样受唯一 owner 约束');
  runner.info(`兼容路径唯一 owner 复检：${error.name}: ${error.message}`);
});

/* ========================================================================== */

process.exit(runner.summary());
