#!/usr/bin/env node
/**
 * `tests/core-audit.test.mjs` —— t28 回归：审计必须按**实际渲染档位**统计 LOD。
 *
 * 背景（B 区 t6 实测上报）：`scripts/audit.mjs` 的 `measure()` 直接遍历场景图，
 * 把 `THREE.LOD` 的三档网格**同时**统计 → 逐栋 `lod:'auto'` 时虚高（B 被算成 90 批次 > 预算 70），
 * 而实际渲染只画一档。测量口径因此改变了内容实现方式，并让 ≤350 / ≤150 万门槛失去可信度。
 *
 * 本测试覆盖：
 *   1. 合成 LOD 场景：`--lod=all`（诊断）== 三档之和；`--lod=active` == 该距离带单档；
 *   2. kit 级对照：单栋 auto 的激活档数字必须与同距离带单档**逐值相等**（3 个距离带），
 *      且全档口径必须显著虚高（量化旧口径）；
 *   3. CLI 端到端：口径标注完整（视角/质量档/合批/阴影/后处理/LOD 口径）、LOD 对比表存在、
 *      `--lod=all` 诊断开关生效、`--json` 报告含逐区 active/allLevels;
 *   4. 不变量：可见 + 不可见可绘制对象 == 总可绘制对象（统计不重复计同一档）。
 */

import { createTestRunner, loadModule, loadThree, ROOT, assert, assertEqual } from './harness.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const runner = createTestRunner('core-audit.test.mjs · 审计 LOD 口径（t28）');

const THREE = await loadThree();
const audit = await loadModule('scripts/audit.mjs');
const { measure, resolveLodLevels, measureWithLodModes, describeMeasureScope, compareLodCounting } = audit;
const { CONFIG } = await loadModule('src/shared/config.js');

assertEqual(typeof measure, 'function', 'audit.mjs 必须导出 measure()');
assertEqual(typeof compareLodCounting, 'function', 'audit.mjs 必须导出 compareLodCounting()');

/* ========================================================================== */
runner.section('1. 合成 LOD 场景：激活档 vs 全档（口径正确性）');
/* ========================================================================== */

/** 造一个含 3 档 LOD 的场景；第 i 档含 (3-i) 个盒体，三角面数可精确预期。 */
function makeLodScene() {
  const group = new THREE.Group();
  const lod = new THREE.LOD();
  const expected = [];
  for (let level = 0; level < 3; level += 1) {
    const levelGroup = new THREE.Group();
    levelGroup.name = `level-${level}`;
    const boxes = 3 - level;
    for (let i = 0; i < boxes; i += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
      mesh.position.set(i * 2, 0, 0);
      levelGroup.add(mesh);
    }
    lod.addLevel(levelGroup, level === 0 ? 0 : level === 1 ? 100 : 400);
    expected.push({ level, meshes: boxes, triangles: boxes * 12 });
  }
  group.add(lod);
  return { group, lod, expected };
}

const makeCamera = (distance) => {
  const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.fov, 16 / 9, CONFIG.CAMERA.near, CONFIG.CAMERA.far);
  camera.position.set(0, 10, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
};

await runner.test('--lod=all（诊断）统计三档之和；--lod=active 只统计激活档', () => {
  const { group, expected } = makeLodScene();
  const allSum = expected.reduce((acc, e) => acc + e.triangles, 0);
  const allMeshes = expected.reduce((acc, e) => acc + e.meshes, 0);

  const allMeasure = measure(group, { lod: 'all' });
  assertEqual(allMeasure.triangles, allSum, `全档口径应为三档之和 ${allSum}`);
  assertEqual(allMeasure.visibleMeshes, allMeshes, `全档口径应含三档全部网格 ${allMeshes}`);

  for (const [distance, level] of [[50, 0], [250, 1], [900, 2]]) {
    const camera = makeCamera(distance);
    const active = measure(group, { lod: 'active', camera });
    assertEqual(active.triangles, expected[level].triangles, `距离 ${distance} 应激活第 ${level} 档三角面`);
    assertEqual(active.visibleMeshes, expected[level].meshes, `距离 ${distance} 应只统计第 ${level} 档网格`);
    assert(
      allMeasure.triangles > active.triangles,
      `全档口径必须大于激活档（虚高可被量化）：all=${allMeasure.triangles} active=${active.triangles}`,
    );
    // 统计不重复：可见 + 不可见 == 全部可绘制对象（每档只被算一次）
    assertEqual(
      active.visibleMeshes + active.invisibleMeshes,
      allMeshes,
      '可见 + 不可见 应等于总网格数（没有把同一档算两次）',
    );
  }
});

await runner.test('resolveLodLevels 报告 LOD 节点/档位与模式；measureWithLodModes 同时给出两组数字', () => {
  const { group } = makeLodScene();
  const camera = makeCamera(120);
  const info = resolveLodLevels(group, camera, { mode: 'active' });
  assertEqual(info.nodes, 1, '应识别 1 个 LOD 节点');
  assertEqual(info.levels, 3, '应识别 3 个档位');
  assertEqual(info.mode, 'active');
  const both = measureWithLodModes(group, camera, 'active');
  assert(both.active.triangles < both.all.triangles, 'active < all');
  assertEqual(both.chosen.lodMode, 'active', '默认应选激活档口径');
  const bothAll = measureWithLodModes(group, camera, 'all');
  assertEqual(bothAll.chosen.lodMode, 'all', '--lod=all 时应选全档口径（诊断）');
});

/* ========================================================================== */
runner.section('2. kit 级对照：auto 的激活档 == 同距离带单档（逐值相等）');
/* ========================================================================== */

const compare = compareLodCounting({ quality: 'medium' });

await runner.test('compareLodCounting 可用且含单栋对照用例（LOD 档距可读）', () => {
  assert(compare, 'compareLodCounting 应返回结果（kit 可用时）');
  assert(Array.isArray(compare.cases) && compare.cases.length >= 2, '应至少含单栋与多栋两个用例');
  const singleHall = compare.cases.find((c) => c.halls === 1);
  assert(singleHall, '应含单栋用例');
  assertEqual(singleHall.rows.length, 3, '单栋应覆盖 3 个距离带');
  assert(Array.isArray(singleHall.lodDistances) && singleHall.lodDistances.length === 3, '应能读到 LOD 档距');
  runner.info(`LOD 档距 [${singleHall.lodDistances.join(', ')}] m；质量档 ${compare.quality}`);
});

await runner.test('单栋 auto 在 3 个距离带的激活档数字与同档单档逐值相等', () => {
  const singleHall = compare.cases.find((c) => c.halls === 1);
  for (const row of singleHall.rows) {
    assertEqual(row.equalsMatchedSingle, true, `距离 ${row.distance}m（应激活 ${row.matchedKey}）必须与单档逐值相等`);
    const matched = row.single[row.matchedKey];
    assertEqual(row.autoActive.drawCalls, matched.drawCalls, `距离 ${row.distance}m 批次数应相等`);
    assertEqual(row.autoActive.triangles, matched.triangles, `距离 ${row.distance}m 三角面数应相等`);
    assert(
      row.autoAllLevels.triangles > row.autoActive.triangles,
      `距离 ${row.distance}m 的全档口径必须虚高（all=${row.autoAllLevels.triangles} > active=${row.autoActive.triangles}）`,
    );
  }
  runner.info(
    `单栋：near ${singleHall.rows[0].autoActive.drawCalls} 批次/${singleHall.rows[0].autoActive.triangles} 三角面；` +
      `mid ${singleHall.rows[1].autoActive.drawCalls}/${singleHall.rows[1].autoActive.triangles}；` +
      `far ${singleHall.rows[2].autoActive.drawCalls}/${singleHall.rows[2].autoActive.triangles}`,
  );
});

await runner.test('多栋用例量化旧口径虚高（成本画像，不要求逐值相等）', () => {
  const multi = compare.cases.find((c) => c.halls > 1);
  assert(multi, '应含多栋用例');
  for (const row of multi.rows) {
    assert(
      row.autoAllLevels.drawCalls - row.autoActive.drawCalls > 0,
      `多栋距离 ${row.distance}m：旧口径应虚高（+${row.autoAllLevels.drawCalls - row.autoActive.drawCalls} 批次）`,
    );
  }
  const far = multi.rows[multi.rows.length - 1];
  runner.info(
    `${multi.halls} 栋远端：激活档 far ${far.autoActive.drawCalls} 批次/${far.autoActive.triangles} 三角面，` +
      `旧口径 ${far.autoAllLevels.drawCalls} 批次/${far.autoAllLevels.triangles} 三角面（虚高 +${far.inflation.drawCalls}/+${far.inflation.triangles}）`,
  );
});

/* ========================================================================== */
runner.section('3. CLI 端到端：口径标注 + LOD 对比表 + 诊断开关 + JSON 报告');
/* ========================================================================== */

function runAuditCli(extraArgs = []) {
  const proc = spawnSync(process.execPath, ['scripts/audit.mjs', ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 240000,
  });
  return { stdout: proc.stdout ?? '', stderr: proc.stderr ?? '', status: proc.status ?? 1 };
}

const cli = runAuditCli();

await runner.test('默认审计 exit 0；口径标注完整（视角/质量档/合批/阴影/后处理/LOD）', () => {
  assertEqual(cli.status, 0, `audit 应 exit 0（stderr: ${cli.stderr.slice(0, 300)}）`);
  for (const need of [
    '视角/viewMode',
    '质量档',
    '合批口径',
    'LOD 口径',
    '按激活档统计',
    '阴影',
    '后处理',
    '参考视角',
  ]) {
    assert(cli.stdout.includes(need), `审计输出应包含口径标注「${need}」`);
  }
  assert(cli.stdout.includes('LOD 口径对比'), '审计输出应包含 LOD 口径对比表');
  assert(cli.stdout.includes('虚高'), '对比表应量化虚高');
  assert(!cli.stdout.includes('✗ 超预算'), '默认口径下不应出现超预算（当前各区均达标）');
});

await runner.test('kit 级对照段落含 3 个距离带，并标注"与单档逐值相等：✓"', () => {
  assert(cli.stdout.includes('kit 级对照'), '应打印 kit 级对照');
  const equals = cli.stdout.match(/与单档逐值相等：✓/g) ?? [];
  assert(equals.length >= 3, `单栋 3 个距离带都应标注逐值相等（实际 ${equals.length} 处）`);
  assert(cli.stdout.includes('全部 3 个距离带成立'), '结论行应声明 3 个距离带全部成立');
});

await runner.test('--lod=all 为诊断开关：口径标注切换为"统计全部档位"', () => {
  const diag = runAuditCli(['--lod=all']);
  assertEqual(diag.status, 0, '--lod=all 诊断模式也应 exit 0（只报告，不 enforce）');
  assert(diag.stdout.includes('统计全部档位（诊断'), '应标注诊断口径');
  assert(diag.stdout.includes('不用于预算判定'), '应注明不得用于预算判定');
  const def = runAuditCli([]);
  assert(!def.stdout.includes('统计全部档位（诊断'), '默认不得使用全档口径');
});

await runner.test('--json 报告含逐区 active/allLevels、LOD 口径 scope 与 kit 对照', () => {
  // 写到 /tmp（不在 ROOT 内落中间产物；audit 支持 --json=<path>）
  const jsonPath = join(tmpdir(), `core-audit-${process.pid}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const proc = runAuditCli([`--json=${jsonPath}`]);
  assertEqual(proc.status, 0, '--json 运行应 exit 0');
  assert(existsSync(jsonPath), `应写出 ${jsonPath}`);
  const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
  assert(report.lod, '报告应含 lod 段');
  assertEqual(report.lod.mode, 'active', '默认 lod 模式应为 active');
  assert(report.lod.scope?.lines?.length >= 5, 'scope 应含完整口径行');
  assert(Array.isArray(report.lod.perZone) && report.lod.perZone.length > 0, 'perZone 应有逐区数字');
  for (const zone of report.lod.perZone) {
    assert(Number.isFinite(zone.active?.drawCalls), `${zone.zoneId} 应有激活档批次`);
    assert(Number.isFinite(zone.allLevels?.drawCalls), `${zone.zoneId} 应有全档批次（诊断）`);
    assert(zone.allLevels.drawCalls >= zone.active.drawCalls, `${zone.zoneId} 全档不得小于激活档`);
  }
  assert(report.lod.kitCompare?.cases?.length >= 2, 'kitCompare 应含单栋/多栋用例');
  assert(report.lod.referenceNear?.perZone?.length > 0, '应含近场参考视角的逐区数字（LOD 近档成本）');
  runner.info(
    `逐区激活档批次：${report.lod.perZone.map((z) => `${z.zoneId}=${z.active.drawCalls}(全档${z.allLevels.drawCalls})`).join(' ')}`,
  );
  runner.info(
    `近场(${report.lod.referenceNear.view})逐区批次：${report.lod.referenceNear.perZone.map((z) => `${z.zoneId}=${z.drawCalls}`).join(' ')}`,
  );
  rmSync(jsonPath, { force: true });
});

/* ========================================================================== */
runner.section('4. 口径自述文本');
/* ========================================================================== */

await runner.test('describeMeasureScope 覆盖 视角/质量档/合批/阴影/后处理/LOD 六项', () => {
  const scope = describeMeasureScope({ view: 'oblique', quality: 'low', lodMode: 'active', referenceView: 'iso' });
  assertEqual(scope.view, 'oblique');
  assertEqual(scope.quality, 'low');
  assertEqual(scope.includePostprocess, false);
  assert(scope.lines.length === 6, `口径行应为 6 条（实际 ${scope.lines.length}）`);
  assert(scope.lines.some((l) => l.includes('LOD 口径')), '应含 LOD 口径行');
  assert(scope.lines.some((l) => l.includes('update(camera)')), '应写明 update(camera) 的实现依据');
  const diag = describeMeasureScope({ lodMode: 'all' });
  assert(diag.lines.some((l) => l.includes('诊断')), '全档模式应标注诊断');
});

/* ========================================================================== */

process.exit(runner.summary());
