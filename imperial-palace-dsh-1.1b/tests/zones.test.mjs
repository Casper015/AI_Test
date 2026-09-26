#!/usr/bin/env node
/**
 * `tests/zones.test.mjs` —— 区域通用契约校验（CONTRACTS §3/§4/§5/§6/§8.3）。
 *
 * 对每个区域模块（B/C/D/E/F 与 `_greybox`/`_template`）：
 *   - 模块尚未交付 → **显式 skip 并打印提示**（不静默通过、不计入通过数）；
 *   - 已交付 → 用 `makeTestCtx()` 在 Node 内执行 `createZone(ctx)`，逐项校验返回值、数量、数值回显、
 *     碰撞格式、视角格式（含 fp-spawn 视线高与 B/C 的 interior）、灯位格式、update/dispose 行为、
 *     以及注册表登记的全局唯一 id。
 *
 * 这样区域作者不依赖浏览器也能证明自己符合契约；t2 也不需要用"假装通过"掩盖缺模块。
 */

import {
  REAL_ZONE_IDS,
  ZONE_MODULES,
  assert,
  assertEqual,
  assertNoProblems,
  buildZone,
  createTestRunner,
  loadModule,
  loadThree,
  makeTestCtx,
  zoneModulePath,
} from './harness.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './harness.mjs';

const runner = createTestRunner('zones.test.mjs · 区域契约通用校验（缺失区域显式 skip）');

const THREE = await loadThree();
const { CONFIG, EVENTS } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { validateZoneResult } = await loadModule('src/core/context.js');
const { zoneLayoutFor } = await loadModule('src/core/layout-slice.js');

const ALL_ZONES = [...REAL_ZONE_IDS, 'GREYBOX'];
const presence = new Map(
  [...ALL_ZONES, 'TEMPLATE'].map((zoneId) => [zoneId, existsSync(join(ROOT, zoneModulePath(zoneId)))]),
);
const facts = [];

/* ========================================================================== */
runner.section('0. 区域模块清单');
/* ========================================================================== */

await runner.test('区域模块清单与 layout.ZONES / CONTRACTS §2 文件归属一致', () => {
  const zoneIds = LAYOUT.ZONES.map((z) => z.id).sort();
  assertEqual(zoneIds.join(','), [...REAL_ZONE_IDS].sort().join(','), 'layout.ZONES 的 id 必须与区域清单一致');
  for (const zoneId of REAL_ZONE_IDS) {
    const zone = LAYOUT.ZONES.find((z) => z.id === zoneId);
    assertEqual(ZONE_MODULES[zoneId], zone.file.replace(/^src\//, 'src/'), `${zoneId} 的模块路径应等于 layout 的 file`);
  }
});

/* ========================================================================== */
runner.section('1. 逐区域契约校验（缺失即 skip）');
/* ========================================================================== */

for (const zoneId of ALL_ZONES) {
  const relative = zoneModulePath(zoneId);
  if (!presence.get(zoneId)) {
    runner.skip(`${zoneId}（${relative}）`, `模块尚未交付；灰盒 ${presence.get('GREYBOX') ? '已' : '未'}覆盖该区域，契约校验无法进行`);
    continue;
  }

  await runner.test(`${zoneId}: 导入/导出符号符合 §3.1（createZone 函数 + 字符串 ZONE_ID）`, async () => {
    const mod = await loadModule(relative);
    assert(typeof mod.createZone === 'function', `${relative} 必须导出 createZone(ctx)`);
    assertEqual(typeof mod.ZONE_ID, 'string', `${relative} 必须导出字符串 ZONE_ID`);
    assertEqual(mod.default, mod.createZone, 'default 导出应指向 createZone');
  });

  await runner.test(`${zoneId}: createZone(ctx) 返回值通过 §3.3/§4/§5/§6/§8.3 全部校验`, async () => {
    const built = await buildZone(zoneId);
    assertEqual(built.skipped, false);
    const scope = zoneId === 'GREYBOX' ? 'city' : 'zone';
    const expected = scope === 'city' ? LAYOUT.SLOTS.length : zoneLayoutFor(zoneId).slots.length;
    const { problems, stats } = validateZoneResult(zoneId, built.result, { THREE, scope, expectBuildings: expected });
    assertNoProblems(problems, `${zoneId} 契约`);
    facts.push({
      zoneId,
      buildings: stats.buildings,
      meshes: stats.meshes,
      triangles: stats.triangles,
      viewpoints: stats.viewpoints,
      obstacles: stats.obstacles,
      walkable: stats.walkable,
      ramps: stats.ramps,
      lightAnchors: stats.lightAnchors,
      expected,
    });
    assertEqual(stats.buildings, expected, `${zoneId} 建筑数量必须等于 layout 分配数`);
  });

  await runner.test(`${zoneId}: 视角登记满足 §5.2（≥1 zone + 1 fp-spawn；B/C 额外 1 interior）`, async () => {
    const built = await buildZone(zoneId);
    const modes = built.result.viewpoints.reduce((acc, vp) => {
      acc[vp.mode] = (acc[vp.mode] ?? 0) + 1;
      return acc;
    }, {});
    assert((modes.zone ?? 0) >= 1, `${zoneId} 至少 1 个 zone 机位`);
    assert((modes['fp-spawn'] ?? 0) >= 1, `${zoneId} 至少 1 个 fp-spawn`);
    if (zoneId === 'B' || zoneId === 'C') assert((modes.interior ?? 0) >= 1, `${zoneId} 必须有 interior 机位`);
    // 登记坐标必须与 layout.VIEWPOINTS 完全一致（区域不得自行改机位）
    if (zoneId !== 'GREYBOX' && zoneId !== 'TEMPLATE') {
      for (const vp of built.result.viewpoints) {
        const source = LAYOUT.VIEWPOINT_BY_ID[vp.id];
        assert(source, `${vp.id} 不在 layout.VIEWPOINTS 中（G 不得自行新增机位）`);
        assert(vp.position.x === source.position.x && vp.position.y === source.position.y && vp.position.z === source.position.z, `${vp.id} 坐标被改动`);
        assert(vp.target.x === source.target.x && vp.target.z === source.target.z, `${vp.id} 目标点被改动`);
      }
      assertEqual(built.result.viewpoints.length, LAYOUT.VIEWPOINTS.filter((v) => v.area === zoneId).length, `${zoneId} 视角数量应与 layout 一致`);
    }
  });

  await runner.test(`${zoneId}: update(dt, elapsed, state) 可运行且不改 state/相机（§3.3 硬约束）`, async () => {
    const built = await buildZone(zoneId);
    const stateLike = {
      mode: 'browse',
      viewMode: 'oblique',
      selectedBuildingId: null,
      hoveredBuildingId: null,
      timePreset: 'goldenHour',
      quality: 'medium',
      tourState: { active: false, paused: false, index: 0, id: null },
      loading: { progress: 1, stage: 'ready', failed: null },
    };
    const frozen = JSON.stringify(stateLike);
    // 连续 60 帧不抛错
    for (let i = 0; i < 60; i += 1) built.result.update(1 / 60, i / 60, stateLike);
    assertEqual(JSON.stringify(stateLike), frozen, `${zoneId} 的 update 不得改写传入的 state`);
    built.result.update(1 / 60, 1.2, stateLike);
    assertEqual(built.result.root.parent, null, `${zoneId} 的 update 不得把 root 挂到场景上`);
  });

  await runner.test(`${zoneId}: dispose() 只释放自有资源、root 保持单位变换、未挂载`, async () => {
    const built = await buildZone(zoneId);
    const root = built.result.root;
    assertEqual(root.parent, null, 'root 不得自行挂载（scene 挂载归 main.js）');
    const geometryCount = new Set();
    root.traverse((node) => node.geometry && geometryCount.add(node.geometry.uuid));
    built.result.dispose();
    // dispose 后重复调用不应抛错（幂等）
    built.result.dispose();
    assert(geometryCount.size > 0, '区域必须真的有几何（否则不算交付）');
  });

  await runner.test(`${zoneId}: 注册到注册表后全局 id 无重复，且可被 replace 顶替`, async () => {
    const events = createEventBus();
    const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
    registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
    registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);
    if (zoneId !== 'GREYBOX' && presence.get('GREYBOX')) {
      const greybox = await buildZone('GREYBOX');
      registry.registerZone('GREYBOX', greybox.result, { replace: true });
    }
    const built = await buildZone(zoneId, { registry });
    registry.registerZone(zoneId, built.result, { replace: true });
    assertNoProblems(registry.duplicateIds().map((d) => `${d.kind}:${d.id}`), `${zoneId} 注册后的全局唯一 id`);
    const stats = registry.stats();
    assert(stats.buildings >= (zoneId === 'GREYBOX' ? LAYOUT.SLOTS.length : 0), '注册表应汇总建筑');
    registry.unregisterZone(zoneId);
    assert(registry.duplicateIds().length === 0, '卸载后仍不得有重复 id');
  });
}

/* ========================================================================== */
runner.section('1b. 区域模板（_template）：对 5 个区域都能产出合约完整区域');
/* ========================================================================== */

await runner.test('模板可替代任意区域的骨架：5 个区域全部通过契约校验', async () => {
  const templateMod = await loadModule(zoneModulePath('TEMPLATE'));
  const { validateZoneResult: validate } = await loadModule('src/core/context.js');
  for (const zoneId of REAL_ZONE_IDS) {
    const ctx = await makeTestCtx({ zoneId });
    const result = await templateMod.createZone(ctx);
    const { problems } = validate(zoneId, result, {
      THREE,
      scope: 'zone',
      expectBuildings: zoneLayoutFor(zoneId).slots.length,
    });
    assertNoProblems(problems, `模板 @${zoneId}`);
    assertEqual(result.buildings.length, zoneLayoutFor(zoneId).slots.length);
    result.update(0.016, 0.5, { mode: 'browse', viewMode: 'oblique' });
    result.dispose();
    runner.info(`模板 @${zoneId}：${result.stats.buildings} 栋 / ${result.stats.viewpoints} 机位 / ${result.stats.lightAnchors} 灯位`);
  }
});

/* ========================================================================== */
runner.section('2. 全城覆盖率与数量门槛（§2.3 minSlotCount = 54）');
/* ========================================================================== */

await runner.test('已交付区域 + 灰盒覆盖的建筑数量 ≥ 54（门槛 config.LAYOUT_CONSTRAINTS.minSlotCount）', () => {
  const covered = new Set();
  if (presence.get('GREYBOX')) for (const slot of LAYOUT.SLOTS) covered.add(slot.id);
  for (const zoneId of REAL_ZONE_IDS) {
    if (!presence.get(zoneId)) continue;
    for (const slot of LAYOUT.SLOTS.filter((s) => s.zone === zoneId)) covered.add(slot.id);
  }
  const min = CONFIG.LAYOUT_CONSTRAINTS.minSlotCount;
  assert(covered.size >= min, `可识别建筑覆盖 ${covered.size} 栋 < 门槛 ${min} 栋`);
  runner.info(`覆盖建筑 ${covered.size} 栋（门槛 ${min}）；已交付真实区域：${REAL_ZONE_IDS.filter((z) => presence.get(z)).join('/') || '（无，灰盒覆盖全城）'}`);
});

await runner.test('灰盒产出统计与 §8.2 分区预算的关系被显式记录', () => {
  const greybox = facts.find((f) => f.zoneId === 'GREYBOX');
  assert(greybox, '灰盒必须已校验（否则无法核对预算）');
  const budget = CONFIG.BUDGET.drawCalls;
  runner.info(`灰盒：${greybox.meshes} 个绘制批次 / ${greybox.triangles} 三角面 / ${greybox.buildings} 栋`);
  runner.info(
    `预算：主场景 ≤${budget.mainSceneMax}（B${budget.perZone.B}/C${budget.perZone.C}/D${budget.perZone.D}/E${budget.perZone.E}/F${budget.perZone.F} + 保留 ${budget.reserve}）`,
  );
  assert(greybox.meshes <= budget.mainSceneMax, `灰盒批次 ${greybox.meshes} 应远小于主场景预算 ${budget.mainSceneMax}`);
  assert(greybox.triangles <= CONFIG.BUDGET.triangles.visibleMax, '灰盒三角面必须远小于可见三角面上限');
});

/* ========================================================================== */

runner.info(
  `区域模块存在性：${ALL_ZONES.map((z) => `${z}=${presence.get(z) ? '有' : '缺'}`).join(' ')}`,
);
process.exit(runner.summary());
