#!/usr/bin/env node
/**
 * t5：**宫灯闪烁的像素级差分**（把"旋转导致的整屏位移"从"灯的突变"里剥离）。
 *
 * 原理：同一相机轨迹跑两条臂——
 *   `rotate`   ：正常（灯按生产逻辑重选/斜坡）
 *   `lampsoff` ：`environment.setActiveOverrides({ lampIntensity: 0 })` ⇒ 逐帧画面 = **无灯的纯运动基线**
 * 于是 `灯致图像(t) = grid_rotate(t) − grid_lampsoff(t)`（逐格、同帧对齐），
 *      `灯致闪烁(t) = mean_格 |灯致图像(t) − 灯致图像(t−1)|`
 * 就是"灯在画面上贡献了多少、以及这部分逐帧抖了多少"——与相机位移无关。
 *
 * 用法：node scripts/compare-lamp-flicker.mjs <rotate.json> <lampsoff.json> [static.json]
 */
import { readFileSync } from 'node:fs';

const [rotPath, offPath, staticPath] = process.argv.slice(2);
if (!rotPath || !offPath) { console.error('用法：node scripts/compare-lamp-flicker.mjs <rotate.json> <lampsoff.json> [static.json]'); process.exit(2); }
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rot = load(rotPath); const off = load(offPath);
const grids = (j) => (j.grids ?? j.frames.map((f) => f.grid));
const gR = grids(rot); const gO = grids(off);
const n = Math.min(gR.length, gO.length);
if (n < 2) { console.error('帧数不足'); process.exit(2); }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const max = (a) => Math.max(...a);
const lampImages = [];
for (let t = 0; t < n; t += 1) lampImages.push(gR[t].map((v, k) => v - gO[t][k]));
const flicker = [];
for (let t = 1; t < n; t += 1) flicker.push(mean(lampImages[t].map((v, k) => Math.abs(v - lampImages[t - 1][k]))));
// 灯致图像本身的均值（灯在画面上贡献的平均亮度）
const lampMean = lampImages.map((im) => mean(im));
const contrib = lampImages.map((im) => mean(im.map((v) => Math.max(0, v))));
let staticFloor = null;
if (staticPath) {
  const st = load(staticPath);
  const gS = grids(st);
  const d = [];
  for (let t = 1; t < gS.length; t += 1) d.push(mean(gS[t].map((v, k) => Math.abs(v - gS[t - 1][k]))));
  staticFloor = { mean: +mean(d).toFixed(4), max: +max(d).toFixed(4) };
}
const out = {
  rotate: rotPath, lampsoff: offPath, static: staticPath ?? null,
  frames: n,
  lampContributionMean: +mean(contrib).toFixed(4),
  lampFlickerMean: +mean(flicker).toFixed(4),
  lampFlickerMax: +max(flicker).toFixed(4),
  lampFlickerP95: +flicker.slice().sort((a, b) => a - b)[Math.floor(flicker.length * 0.95)].toFixed(4),
  motionBaselineMean: +mean(off.rows.filter((r) => typeof r.meanAbsPixelDelta === 'number').map((r) => r.meanAbsPixelDelta)).toFixed(4),
  staticNoiseFloor: staticFloor,
};
console.log('── t5 宫灯闪烁像素差分（灯致图像 = rotate 逐格 − lampsoff 逐格，同帧对齐）');
console.log(` 帧数 ${n}｜灯致贡献均值 ${out.lampContributionMean}/255`);
console.log(` 灯致闪烁（相邻帧逐格平均差）：均值 ${out.lampFlickerMean}｜P95 ${out.lampFlickerP95}｜峰值 ${out.lampFlickerMax}`);
console.log(` 纯运动基线（lampsoff 臂逐帧逐格差）均值 ${out.motionBaselineMean}`);
if (staticFloor) console.log(` 不旋转噪声底（static 臂）均值 ${staticFloor.mean}｜峰值 ${staticFloor.max}`);
process.stdout.write(`${JSON.stringify(out)}\n`);
