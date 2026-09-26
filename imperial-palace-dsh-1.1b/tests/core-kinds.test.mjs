#!/usr/bin/env node
/**
 * `tests/core-kinds.test.mjs` —— t79/T2.20 常驻跨模块守卫：**layout 的可行走面 kind ⊆ core 白名单**
 *
 * 为什么必须有这张测试（事故复盘）：
 *   t75 在 `src/shared/layout.js` 新增 **43 条 `kind:'passage'`**（门洞通道面，LAYOUT 1.1.4），
 *   但**没有同步消费方白名单** `src/core/context.js` 的 `WALKABLE_KINDS` ⇒ `assertZoneResult` 的
 *   `colliders.walkable[i].kind 非法：passage` 使**全部真实区域契约校验失败** ⇒ 浏览器逐字
 *   `[palace] 装配完成：区域 [] · 注册建筑 0 栋` ⇒ 全树截图空白（~7.9KB）、`run.mjs 7/20`。
 *   布局卡的 verify 只看 `layout.test.mjs`（自洽），**看不到下游**；本卡把这条跨模块不变式固化为常驻守卫，
 *   使"以后再新增 kind"必然在 CI/本地测试里立刻暴露，而不是等到全树空白才发现。
 *
 * 断言（真实结果，不依赖计数器）：
 *   ① `layout.WALKABLE[].kind` 去重集合 ⊆ `core.WALKABLE_KINDS`（缺一即失败，并打印缺失项与来源条数）。
 *   ② `'passage'` 出现在白名单中，且 layout 里确有对应条目（语义未被误删）。
 *   ③ **契约校验器真的接受** passage 面：用 `assertZoneResult` 校验一个含全部 layout passage 面的区域结果。
 *   ④ passage **不参与内景相机包围盒**：`interiorBoundsFor` 的内景面计数不因 passage 变化（= 43），
 *      且 `WALKABLE_KINDS` 中 `'passage'` 与 `'interior'` 是两个不同取值（不得复用 `'interior'`）。
 *   ⑤ 突变证明（随测试自打印）：把 `'passage'` 从白名单临时移除后，①③ 的判定必然失败 —— 断言里显式复算一次。
 *
 * 零 three / 零 DOM：可直接 `node tests/core-kinds.test.mjs`。
 */

import { createTestRunner, loadModule, assert, assertEqual } from './harness.mjs';

const runner = createTestRunner('core-kinds.test.mjs · layout↔core 可行走面 kind 跨模块守卫（t79）');

const { WALKABLE_KINDS, assertZoneResult, ZoneContractError } = await loadModule('src/core/context.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { interiorBoundsFor } = await loadModule('src/core/camera.js');

const layoutKinds = [...new Set(LAYOUT.WALKABLE.map((w) => w.kind))].sort();
const countsByKind = LAYOUT.WALKABLE.reduce((acc, w) => {
  acc[w.kind] = (acc[w.kind] ?? 0) + 1;
  return acc;
}, {});
const allowed = new Set(WALKABLE_KINDS);

await runner.test('① layout 出现的每一个 WALKABLE kind 都在 core 白名单内（缺一即整树 0 区域装载）', () => {
  const missing = layoutKinds.filter((k) => !allowed.has(k));
  assertEqual(
    missing.join(','),
    '',
    `layout 使用了 core 未接受的可行走面 kind：${missing.join(',')}（会把区域契约校验打红 ⇒ 装配 0 区域）。` +
      `请同步 src/core/context.js 的 WALKABLE_KINDS。layout kind 全量=${layoutKinds.join(',')}｜core=${WALKABLE_KINDS.join(',')}`,
  );
  assert(layoutKinds.length >= 6, `layout 可行走面 kind 数应 ≥6（实际 ${layoutKinds.length}）——过少说明数据退化`);
  runner.info(`layout kind {${layoutKinds.map((k) => `${k}:${countsByKind[k]}`).join(', ')}} ⊆ core {${WALKABLE_KINDS.join(', ')}}`);
});

await runner.test("② 'passage' 已纳入白名单，且 layout 中确有对应条目（t75 的 43 条门洞通道面）", () => {
  assert(allowed.has('passage'), "core WALKABLE_KINDS 必须包含 'passage'（t75/Layout 1.1.4 门洞通道面）");
  const passages = LAYOUT.WALKABLE.filter((w) => w.kind === 'passage');
  assert(passages.length > 0, "layout 中应存在 kind:'passage' 的条目（否则本守卫失去意义）");
  assert(
    passages.every((w) => w.id.endsWith('-door-passage')),
    "passage 条目的 id 命名应为 `WK-<slotId>-door-passage`（便于消费方识别门洞通道面）",
  );
  runner.info(`passage 条目 ${passages.length} 条（示例 ${passages[0].id}）`);
});

await runner.test('③ 区域契约校验器真的接受带 passage 面的区域结果（不是只对白名单做集合比较）', () => {
  const zoneId = 'B';
  const walkable = LAYOUT.WALKABLE.filter((w) => w.zone === zoneId);
  const passages = walkable.filter((w) => w.kind === 'passage');
  assert(passages.length > 0, `B 区应有 passage 面（实际 ${passages.length}）`);
  const result = {
    root: { isObject3D: true, position: {}, rotation: {}, scale: {}, children: [] },
    buildings: [],
    connectors: [],
    colliders: { obstacles: [], walkable: walkable.map((w) => ({ ...w, bounds: { ...w.bounds } })) },
    viewpoints: [],
    lightAnchors: [],
    update: () => {},
    dispose: () => {},
  };
  let problems = [];
  try {
    assertZoneResult(zoneId, result, { config: { GRADES: {} }, layout: LAYOUT, registry: null });
  } catch (e) {
    assert(e instanceof ZoneContractError, `应抛 ZoneContractError，实际 ${e?.name}: ${e?.message}`);
    problems = e.problems ?? [];
  }
  // 本卡只对 **kind 判定** 负责：合成样本不实现 layout 全部槽位，其它问题属预期
  const kindProblems = problems.filter((pm) => /kind 非法/.test(pm));
  const passageProblems = problems.filter((pm) => /passage/.test(pm));
  assertEqual(kindProblems.length, 0, `契约校验不应再对 kind 报错，实际：\n    ${kindProblems.join('\n    ')}`);
  assertEqual(passageProblems.length, 0, `契约校验不应出现任何含 'passage' 的问题，实际：\n    ${passageProblems.join('\n    ')}`);
  runner.info(`B 区 ${walkable.length} 条可行走面（含 ${passages.length} 条 passage）：kind 类问题 0；其它问题 ${problems.length} 条（合成样本未实现全部槽位，属预期）`);
});

await runner.test('④ passage 不参与内景相机包围盒：内景面仍是 43 条，且 passage ≠ interior 两个取值', () => {
  assert(WALKABLE_KINDS.includes('passage') && WALKABLE_KINDS.includes('interior'), "'passage' 与 'interior' 必须同时存在");
  assert(WALKABLE_KINDS.indexOf('passage') !== WALKABLE_KINDS.indexOf('interior'), "'passage' 不得复用 'interior' 取值");
  const interiorSurfaces = LAYOUT.WALKABLE.filter((w) => w.kind === 'interior');
  const passages = LAYOUT.WALKABLE.filter((w) => w.kind === 'passage');
  assertEqual(interiorSurfaces.length, 43, '内景可行走面应恰为 43 条（passage 不得混入其中）');
  assert(passages.every((p) => !interiorSurfaces.some((s) => s.id === p.id)), 'passage 条目的 id 不得与内景面重合');
  // 显式寻址仍只解析内景面：取一个内景机位，确认包围盒属于 interior 面而不是 passage 面
  const box = interiorBoundsFor({ viewpointId: 'VP-B-interior' });
  assert(box && box.id.endsWith('-interior'), `内景包围盒应来自 kind:'interior' 面（实际 ${box?.id}）`);
  assert(!box.id.endsWith('-door-passage'), '内景包围盒不得来自门洞通道面');
  runner.info(`interior ${interiorSurfaces.length} 条 / passage ${passages.length} 条；VP-B-interior 盒=${box.id}`);
});

await runner.test('⑤ 突变证明：把 passage 从白名单移除后，①②③ 的判定必须失败（守卫有效性自证）', () => {
  const mutated = WALKABLE_KINDS.filter((k) => k !== 'passage');
  const mutatedSet = new Set(mutated);
  const missing = layoutKinds.filter((k) => !mutatedSet.has(k));
  assertEqual(missing.join(','), 'passage', `去掉 passage 后应恰好多出 'passage' 未覆盖（实际 ${missing.join(',') || '无'}）`);
  assert(!mutatedSet.has('passage'), "突变样本里不应再有 'passage'");

  // 用突变白名单重跑一次"契约校验的 kind 检查"逻辑（复刻 context.js 的判定），证明它确实会红
  const kindsInResult = [...new Set(LAYOUT.WALKABLE.map((w) => w.kind))];
  const problems = kindsInResult
    .filter((k) => !mutatedSet.has(k))
    .map((k) => `colliders.walkable[?].kind 非法：${k}（合法：${mutated.join('/')}）`);
  assert(problems.length > 0, '去掉 passage 后，按白名单判定必须产生 kind 问题（否则守卫无效）');
  runner.info(`突变复算：去掉 'passage' ⇒ 契约校验报 ${problems.length} 类 kind 问题（${problems[0]}）`);
});

/* ========================================================================== */

process.exit(runner.summary());
