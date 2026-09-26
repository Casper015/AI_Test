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

const browser = process.env.G2_VERIFY_BROWSER === '1' || process.argv.includes('--browser');

const result = await runCompleteness({ browser });

console.log('\n[verify-completeness] 摘要');
console.log(`  建筑 ${result.stats.buildings} 栋 / 院落 ${result.layout.COURTYARDS.length} 个 / 连接 ${result.zoneConnectors} 条（区域返回，layout ${result.layout.CONNECTORS.length}）/ 机位 ${result.stats.viewpoints} 个`);
console.log(`  整城 ${result.totalDrawCalls} 绘制调用 · ${result.totalTriangles} 三角面`);
console.log(`  PASS ${result.passed} / FAIL ${result.failed.length} / UNVERIFIED ${result.unverified.length}`);
if (result.failed.length > 0) {
  for (const f of result.failed) console.error(`  ✗ ${f.id} — ${f.detail}`);
}
if (!browser) {
  console.log('  注：浏览器侧检查未包含在本次运行（G2_VERIFY_BROWSER=1 或 node scripts/verify-completeness.mjs 可补全）');
}
process.exit(result.exitCode);
