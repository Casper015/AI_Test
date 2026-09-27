#!/usr/bin/env node
/**
 * t16：§12 可读性**前后对照**（AA off vs 生效档），阈值逐值比对、判据只增不减。
 *
 * 用法：node scripts/compare-aa-s12.mjs <beforeDir> <afterDir> [morePairs...]
 *   目录里应有 shot.mjs 产出的 manifest.json。可传多组 `<before>,<after>` 形式。
 * 退出码：任一张图的**判据转红**（PASS→FAIL）或**阈值块逐值不一致** ⇒ 1。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `--interior-logs=<before前缀>,<after前缀>,<slot1|slot2|slot3>`：
 * `--interior=<slot>` 一次只能出一张图（每次进程都会重写 manifest）⇒ 三处内景的对照
 * 改从**每次运行的日志**里读 shot.mjs 打印的判据行（`PASS golden interior [near] 内容均值 …`）。
 */
const LOG_MODE = (() => {
  const hit = process.argv.find((a) => a.startsWith('--interior-logs='));
  if (!hit) return null;
  const [b, a, slots] = hit.slice('--interior-logs='.length).split(',');
  return { b, a, slots: slots.split('|') };
})();

const args = process.argv.slice(2).filter((a) => !a.startsWith('--interior-logs='));
if (args.length < 2) { console.error('用法：node scripts/compare-aa-s12.mjs <beforeDir> <afterDir>'); process.exit(2); }
const pairs = [];
for (let i = 0; i + 1 < args.length; i += 2) pairs.push([args[i], args[i + 1]]);

const load = (dir) => {
  const f = join(dir, 'manifest.json');
  if (!existsSync(f)) throw new Error(`缺 manifest：${f}`);
  return JSON.parse(readFileSync(f, 'utf8'));
};
const keyOf = (j) => `${j.view}/${j.preset}`;
const num = (v) => (typeof v === 'number' ? v : null);
let failures = 0;

for (const [beforeDir, afterDir] of pairs) {
  const b = load(beforeDir); const a = load(afterDir);
  console.log(`\n── §12 前后对照：${beforeDir}  →  ${afterDir}`);
  const sameCriteria = JSON.stringify(b.criteria) === JSON.stringify(a.criteria);
  console.log(` 阈值块逐值一致：${sameCriteria ? '✓' : '✗'}（darkLuma ${b.criteria.darkLumaThreshold} / clipLuma ${b.criteria.highlightClipLumaThreshold} / cityMinMean ${b.criteria.cityMinMeanLuma} / cityMaxDark ${b.criteria.cityMaxDarkRatio} / interiorMinMean ${b.criteria.interiorMinMeanLuma}）`);
  if (!sameCriteria) failures += 1;
  const jb = new Map(b.judge.map((j) => [keyOf(j), j]));
  const ja = new Map(a.judge.map((j) => [keyOf(j), j]));
  const keys = [...new Set([...jb.keys(), ...ja.keys()])].sort();
  console.log('  视角/时辰'.padEnd(20), '判据(前→后)'.padEnd(16), '内容均值 前→后'.padEnd(22), '内容暗区 前→后'.padEnd(24), '内容截断 前→后'.padEnd(22), '内容占比 前→后');
  for (const k of keys) {
    const x = jb.get(k); const y = ja.get(k);
    const v = (r) => (r ? (r.ok ? 'PASS' : 'FAIL') : '(缺)');
    const f = (r, kk, d = 4) => (r && num(r[kk]) !== null ? num(r[kk]).toFixed(d) : '-');
    console.log(`  ${k.padEnd(18)} ${`${v(x)}→${v(y)}`.padEnd(14)} ${`${f(x, 'contentMean')}→${f(y, 'contentMean')}`.padEnd(22)} ${`${f(x, 'contentDark')}→${f(y, 'contentDark')}`.padEnd(24)} ${`${f(x, 'contentClip')}→${f(y, 'contentClip')}`.padEnd(22)} ${`${f(x, 'contentShare')}→${f(y, 'contentShare')}`}`);
    if (x && y) {
      if (x.ok && !y.ok) { console.log(`    ✗ **判据转红**：${k}`); failures += 1; }
      if (num(x.contentDark) !== null && num(y.contentDark) !== null && num(y.contentDark) > num(x.contentDark) + 1e-9) {
        console.log(`    ⚠ 内容暗区上升 ${((num(y.contentDark) - num(x.contentDark)) * 100).toFixed(3)}pp（仍未放宽阈值；仅登记）`);
      }
    }
    // 实际生效 AA 由下方按 run 统一读取（来自 readyInfo.report.antialias，t16 已让 ?stats=1 透传）
  }
  const reportOf = (r) => r.readyInfo?.report ?? r.report ?? null;
  const aaB = b.results.map((r) => reportOf(r)?.antialias ?? null);
  const aaA = a.results.map((r) => reportOf(r)?.antialias ?? null);
  const uniq = (list) => [...new Set(list.map((x) => (x ? `${x.mode}/${x.samples}` : 'null')))].join(',');
  console.log(` 实际生效 AA：前 ${uniq(aaB)} → 后 ${uniq(aaA)}`);
  // 逐图整帧/内容读数（来自 imageStats）
  const sb = new Map(b.imageStats.map((s) => [`${s.view}/${s.preset}`, s]));
  const sa = new Map(a.imageStats.map((s) => [`${s.view}/${s.preset}`, s]));
  for (const k of keys) {
    const x = sb.get(k); const y = sa.get(k);
    if (!x || !y) continue;
    const dm = (y.meanLuma ?? 0) - (x.meanLuma ?? 0);
    if (Math.abs(dm) > 0.02) console.log(`    · ${k} 整帧均值位移 ${dm >= 0 ? '+' : ''}${dm.toFixed(4)}（登记）`);
  }
}
if (LOG_MODE) {
  console.log(`\n── §12 内景前后对照（逐槽位日志；判据行原样解析）`);
  console.log(' 槽位'.padEnd(20), '判据(前→后)'.padEnd(14), '内容均值 前→后'.padEnd(22), '内容暗区 前→后'.padEnd(22), '内容截断 前→后');
  const read = (f) => {
    if (!existsSync(f)) return null;
    const m = readFileSync(f, 'utf8').match(/PASS golden\s+interior\s+\[near\] 内容均值 ([\d.]+) 内容暗区 ([\d.]+)% 内容截断 ([\d.]+)%/);
    return m ? { mean: +m[1], dark: +m[2], clip: +m[3] } : null;
  };
  for (const slot of LOG_MODE.slots) {
    const x = read(`${LOG_MODE.b}-${slot}.log`);
    const y = read(`${LOG_MODE.a}-${slot}.log`);
    if (!x || !y) { console.log(` ${slot.padEnd(18)} (缺日志)`); failures += 1; continue; }
    console.log(` ${slot.padEnd(18)} ${'PASS→PASS'.padEnd(12)} ${`${x.mean}→${y.mean}`.padEnd(22)} ${`${x.dark}→${y.dark}`.padEnd(22)} ${`${x.clip}→${y.clip}`}`);
    if (y.dark > x.dark + 0.05) { console.log(`    ✗ 内容暗区显著上升 ${(y.dark - x.dark).toFixed(2)}pp（阈值未放宽，但需登记）`); failures += 1; }
  }
}

console.log(`\nt16 §12 对照结论：${failures === 0 ? '阈值未变、无判据转红 ✓' : `**${failures} 项问题**`}`);
process.exit(failures === 0 ? 0 : 1);
