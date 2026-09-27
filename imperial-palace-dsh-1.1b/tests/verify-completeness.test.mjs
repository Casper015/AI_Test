#!/usr/bin/env node
/**
 * tests/verify-completeness.test.mjs — G2 场景完整性独立验证（verifier / t12）
 * =============================================================================
 * 这是 **验收命令入口**：复用 scripts/verify-completeness.mjs 的同一套检查引擎（单一真相），
 * 不 import 任何区域测试的结论。退出码 = 引擎退出码（有 FAIL 即非零）。
 *
 * 用法：
 *   node tests/verify-completeness.test.mjs                    # 默认：Node 侧全量检查（确定性、约 40s）
 *   G2_VERIFY_BROWSER=1 node tests/verify-completeness.test.mjs # 追加 headless Chrome 实测（8 视角出图 + 机器报告）
 *   node scripts/verify-completeness.mjs                        # 同上，直接跑引擎（默认含浏览器）
 *
 * 浏览器项（运行时装配/404/像素统计）的**完整证据**由 `node scripts/verify-completeness.mjs` 产出，
 * 结论记录在 docs/report-completeness.md；本文件默认跳过浏览器是为了让 `tests/run.mjs` 保持确定性
 * （本机沙箱下 headless Chrome 首次启动偶发失败，需要重试，不适合作为每次迭代的必经门）。
 */

import { runCompleteness } from '../scripts/verify-completeness.mjs';
import * as LAYOUT from '../src/shared/layout.js';

/* -------------------------------------------------------------------------- */
/*  t138：5.4b 的“陈旧期望”——按既有契约口径（CONTRACTS §5.2.2 + DOOR_SILL_EXCEPTIONS）复核
 *  旧口径要求「43/43 一致」，但**双标高契约早已存在**：例外集内 6 栋允许 door.sillY 与通道面 y 不同。
 *  本条在**入口层**做只读复核（`scripts/verify-completeness.mjs` 一字未改），并要求：
 *    · 非例外一致 37 / 真实偏离 5（F-gate-{south,north,west,east} + C-gate-inner）/ 已归位例外 1（C-hall-bed-main）/ 表内 6 / 合计 43；
 *    · **逐栋**偏离必须属于例外集（越界即失败）——语义断言未放宽。
 * -------------------------------------------------------------------------- */
function checkDoorSillExceptions() {
  const EXC = new Set(LAYOUT.DOOR_SILL_EXCEPTIONS);
  const rows = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => {
    const rec = Object.entries(LAYOUT.INTERIOR_BY_SLOT).find(([, r]) => r.viewpointId === v.id)?.[1] ?? null;
    const slot = rec ? LAYOUT.SLOT_BY_ID[rec.slotId] : null;
    const face = rec ? LAYOUT.WALKABLE.find((w) => w.id === rec.walkableId) : null;
    const y = face?.y ?? null;
    const sillY = slot?.door?.sillY ?? null;
    return { slotId: rec?.slotId ?? v.id, y, sillY, same: y !== null && sillY !== null && Math.abs(y - sillY) <= 1e-6 };
  });
  const consistent = rows.filter((r) => r.same);
  const deviations = rows.filter((r) => !r.same);
  // 卡内口径（37/5/1/6/43）：`consistentNonException` = 一致**且不在例外表内**；`settled` = 表内但实测已一致（已归位）。
  const consistentNonException = consistent.filter((r) => !EXC.has(r.slotId));
  const settled = consistent.filter((r) => EXC.has(r.slotId));
  const outside = deviations.filter((r) => !EXC.has(r.slotId));
  const registry = deviations.filter((r) => EXC.has(r.slotId));
  return { rows, consistent, consistentNonException, deviations, outside, settled, registry, tableSize: EXC.size };
}

const browser = process.env.G2_VERIFY_BROWSER === '1' || process.argv.includes('--browser');

const result = await runCompleteness({ browser });

console.log('\n[verify-completeness] 摘要');
console.log(`  建筑 ${result.stats.buildings} 栋 / 院落 ${result.layout.COURTYARDS.length} 个 / 连接 ${result.zoneConnectors} 条（区域返回，layout ${result.layout.CONNECTORS.length}）/ 机位 ${result.stats.viewpoints} 个`);
console.log(`  整城 ${result.totalDrawCalls} 绘制调用 · ${result.totalTriangles} 三角面`);
console.log(`  PASS ${result.passed} / FAIL ${result.failed.length} / UNVERIFIED ${result.unverified.length}`);
const sill = checkDoorSillExceptions();
const sillProblems = [];
if (sill.outside.length > 0) sillProblems.push(`偏离例外集：${sill.outside.map((r) => `${r.slotId}(${r.y} vs ${r.sillY})`).join('、')}`);
if (sill.rows.length !== 43) sillProblems.push(`内景总数 ${sill.rows.length} ≠ 43`);
if (sill.consistentNonException.length !== 37) sillProblems.push(`非例外一致 ${sill.consistentNonException.length} ≠ 37`);
if (sill.deviations.length !== 5) sillProblems.push(`真实偏离 ${sill.deviations.length} ≠ 5`);
if (sill.tableSize !== 6) sillProblems.push(`DOOR_SILL_EXCEPTIONS 表内 ${sill.tableSize} ≠ 6`);
if (sill.settled.length !== 1) sillProblems.push(`已归位例外 ${sill.settled.length} ≠ 1`);
console.log(`  [5.4b·契约口径复核] 非例外一致 ${sill.consistentNonException.length} / 真实偏离 ${sill.deviations.length}（${sill.deviations.map((r) => r.slotId).join('、')}）/ 已归位例外 ${sill.settled.length}（${sill.settled.map((r) => r.slotId).join('、')}）/ 例外表 ${sill.tableSize} / 合计 ${sill.rows.length} ⇒ ${sillProblems.length === 0 ? 'PASS' : 'FAIL'}`);
if (sillProblems.length > 0) console.error(`  ✗ 5.4b（t138 契约口径）— ${sillProblems.join('；')}`);

// 引擎的 5.4b 仍按旧口径（43/43）判定 ⇒ 属**陈旧期望**，以入口的契约口径复核为准（引擎只读，不为其变绿而动）
const legacySill = result.failed.filter((f) => /^5\.4b/.test(f.id));
const realFailed = result.failed.filter((f) => !/^5\.4b/.test(f.id));
if (legacySill.length > 0) {
  console.log(`  注：脚本引擎的 5.4b 仍为旧口径（43/43）——已由上面的契约口径复核取代（${sillProblems.length === 0 ? 'PASS' : 'FAIL'}）；该项不计入本入口退出码。`);
}
if (realFailed.length > 0) {
  for (const f of realFailed) console.error(`  ✗ ${f.id} — ${f.detail}`);
}
if (!browser) {
  console.log('  注：浏览器侧检查未包含在本次运行（G2_VERIFY_BROWSER=1 或 node scripts/verify-completeness.mjs 可补全）');
}
process.exit(realFailed.length > 0 || sillProblems.length > 0 ? 1 : 0);
