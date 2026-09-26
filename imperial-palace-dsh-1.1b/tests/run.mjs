#!/usr/bin/env node
/**
 * 顺序测试入口：依次执行 tests/*.test.mjs，任一失败即非零退出并打印汇总。
 *
 * 用法：
 *   node tests/run.mjs              # 全部测试
 *   node tests/run.mjs layout       # 只跑文件名含 "layout" 的测试
 *   node tests/run.mjs --list       # 只列出将执行的测试
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const TESTS_DIR = join(ROOT, 'tests');

const argv = process.argv.slice(2);
const listOnly = argv.includes('--list');
const filter = argv.find((a) => !a.startsWith('--')) ?? null;

function discover() {
  let entries = [];
  try {
    entries = readdirSync(TESTS_DIR);
  } catch (error) {
    console.error(`[test] 无法读取测试目录 ${TESTS_DIR}: ${error.message}`);
    process.exit(1);
  }
  return entries
    .filter((name) => name.endsWith('.test.mjs'))
    .filter((name) => (filter ? name.includes(filter) : true))
    .sort()
    .map((name) => join(TESTS_DIR, name))
    .filter((abs) => statSync(abs).isFile());
}

const files = discover();

if (files.length === 0) {
  console.error('[test] 未发现可执行的 tests/*.test.mjs —— 视为失败（测试集不应为空）');
  process.exit(1);
}

console.log('=========================================================');
console.log(' 紫禁天朝 · 顺序测试');
console.log(` node      : ${process.version}`);
console.log(` root      : ${ROOT}`);
console.log(` filter    : ${filter ?? '(none)'}`);
console.log(` test files: ${files.length}`);
console.log('=========================================================');

if (listOnly) {
  for (const f of files) console.log(` - ${relative(ROOT, f)}`);
  process.exit(0);
}

const results = [];
const startedAt = Date.now();

for (const file of files) {
  const rel = relative(ROOT, file);
  const t0 = Date.now();
  console.log(`\n---------------------------------------------------------`);
  console.log(`▶ ${rel}`);
  console.log('---------------------------------------------------------');
  const proc = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: 'utf8' });
  const ms = Date.now() - t0;
  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);
  const code = proc.status ?? 1;
  results.push({ rel, code, ms, signal: proc.signal });
  console.log(`◀ ${rel} → ${code === 0 ? 'PASS' : 'FAIL'} (${ms}ms)`);
}

const failed = results.filter((r) => r.code !== 0);
const totalMs = Date.now() - startedAt;

console.log('\n=========================================================');
console.log(' 汇总');
console.log('---------------------------------------------------------');
for (const r of results) {
  const mark = r.code === 0 ? 'PASS' : 'FAIL';
  console.log(` ${mark}  ${r.rel}${r.signal ? ` (signal ${r.signal})` : ''}  ${r.ms}ms`);
}
console.log('---------------------------------------------------------');
console.log(` 通过 ${results.length - failed.length} / ${results.length}，失败 ${failed.length}，总耗时 ${totalMs}ms`);
console.log('=========================================================');

process.exit(failed.length === 0 ? 0 : 1);
