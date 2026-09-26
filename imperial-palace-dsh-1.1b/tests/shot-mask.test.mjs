/**
 * tests/shot-mask.test.mjs — 背景掩码回归与**静默失效防护**（t41）
 * =============================================================================
 * 背景：t39 发现 `scripts/shot.mjs` 的背景掩码取"量化桶**左下角**"+容差 6。
 *   dusk 真实天空 (210,175,127) 落在桶 (208,168,120)：g 上界 168+6=174 < 175 ⇒ **差 1 个量化单位**，
 *   遮罩静默失效（报"内容像素 100.0%"），暗区被约 70% 的明亮天空稀释 → 判据照常 PASS。
 * 本测试固化：
 *   1) 该**精确像素案例**（语料 = t39 实测天空色）；
 *   2) 掩码在"渐变天空 / 边界容差"下仍然生效（自适应容差）；
 *   3) **防护触发**：掩码失效 / 未识别背景 / 背景占比过低 ⇒ 警告且 `--judge` 非零；
 *   4) 真实渲染图的掩码自检（dusk 与 night 各一张，断言背景占比在合理区间）。
 *
 * 运行：node tests/shot-mask.test.mjs   （失败非零退出）
 */
import { deflateSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const { decodePngStats, judgeShot } = await import(join(ROOT, 'scripts', 'shot.mjs'));

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(` ✓ ${name}${detail ? `  （${detail}）` : ''}`); }
  else { fail += 1; failures.push(name); console.log(` ✗ ${name}  ${detail}`); }
}

/* ------------------------------------------------------------------ */
/* 最小 PNG 编码器（8bit RGB、filter 0）——用于固化精确像素语料          */
/* ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** px(x,y) → [r,g,b]；返回 PNG Buffer */
function encodePng(width, height, px) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    raw[p] = 0; p += 1; // filter: none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = px(x, y);
      raw[p] = r & 0xff; raw[p + 1] = g & 0xff; raw[p + 2] = b & 0xff; p += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const TMP = mkdtempSync(join(tmpdir(), 'shot-mask-'));
const writePng = (name, ...args) => {
  const file = join(TMP, name);
  writeFileSync(file, encodePng(...args));
  return file;
};

/* ------------------------------------------------------------------ */
console.log('\n=== 1. 精确像素案例（t39 实测：真实天空 (210,175,127) vs 桶 (208,168,120)）===');
/* 语料：天空 (210,175,127) 铺满边框与顶部；中央 30% 区域为深色"建筑"（luma < 0.08） */
const SKY = [210, 175, 127];
const contentArea = (x, y) => x >= 30 && x < 90 && y >= 40 && y < 76; // 居中 22.5%，不触碰边框环
const contentFraction = (60 * 36) / (120 * 80);
const caseA = writePng('caseA-sky-210-175-127.png', 120, 80, (x, y) => {
  if (contentArea(x, y)) return [16, 15, 14];  // 真正低于暗区阈值（luma 0.060 < 0.08）的建筑
  return SKY;
});
{
  // 旧实现的失败条件（固化"差 1 个量化单位"这一事实）
  const bucketBaseG = (SKY[1] >> 3) << 3;               // 168
  check('旧口径必然漏掉该天空：桶左下角 g=168 + 容差 6 = 174 < 真实 g=175（差 1 个量化单位）',
    bucketBaseG + 6 < SKY[1], `${bucketBaseG}+6=${bucketBaseG + 6} < ${SKY[1]}`);
  const st = decodePngStats(caseA, { darkLuma: 0.08, clipLuma: 0.9, view: 'oblique' });
  check('修正后：识别出背景（背景色 ≈ 真实天空 (210,175,127)）',
    st.mask.backgroundFound && Math.abs(st.mask.background.g - SKY[1]) <= 2 && Math.abs(st.mask.background.b - SKY[2]) <= 2,
    JSON.stringify(st.mask.background));
  check('修正后：内容占比不再是 100%（掩码生效）',
    st.content.share < 0.6, `内容占比 ${(st.content.share * 100).toFixed(1)}%`);
  check('修正后：内容占比 ≈ 真实内容面积（±5pp）',
    Math.abs(st.content.share - contentFraction) < 0.05, `${(st.content.share * 100).toFixed(1)}% vs 期望 ≈${(contentFraction * 100).toFixed(1)}%`);
  check('修正后：内容暗区 ≈100%（语料内容全为深色）', st.content.darkRatio > 0.9, `${(st.content.darkRatio * 100).toFixed(1)}%`);
  check('修正后：防护未触发（掩码可靠）', st.mask.guard.tripped === false, st.mask.guard.reasons.join('；'));
  check('修正后：背景占比/顶部占比记录完整', st.mask.borderShare > 0.5 && st.mask.topShare > 0.5,
    `border ${st.mask.borderShare} / top ${st.mask.topShare}`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 2b. **雾洗白几何不得当背景**（t44 新规则）===');
{
  /* 语料：顶部 20% 为常量夜空（真天空），其余 80% 为**亮度随深度渐变的雾**（雾洗白几何/水面）
     —— 旧"边框环主色"法会把雾（占比 80%、边框环几乎全是它）当背景 ⇒ 把内容当天空（反向失真）。 */
  const SKY2 = [14, 23, 43];
  const fog = writePng('caseFog-fp-night.png', 160, 100, (x, y) => {
    const t = (y - 20) / 80;                       // 0→1 随深度
    if (y < 20) return SKY2;
    return [34 + Math.round(14 * t), 44 + Math.round(10 * t), 65 + Math.round(4 * t)];
  });
  const st = decodePngStats(fog, { darkLuma: 0.08, clipLuma: 0.9, view: 'fp' });
  check('2b 背景 = 真天空（黑夜空 rgb(14,23,43)），**不是**被雾洗白的渐变区',
    st.mask.backgroundFound && Math.abs(st.mask.background.g - 23) <= 3 && st.mask.background.g < 35,
    JSON.stringify(st.mask.background));
  check('2b 天空占比 ≈ 顶部 20%（±6pp）', Math.abs(st.mask.skyShare - 0.20) < 0.06, `${(st.mask.skyShare * 100).toFixed(1)}%`);
  check('2b **雾像素算作内容**（内容占比 ≈80%，±6pp）', Math.abs(st.content.share - 0.80) < 0.06, `${(st.content.share * 100).toFixed(1)}%`);
  check('2b 雾是亮区 ⇒ 内容暗区很低（雾不被当成天空）', st.content.darkRatio < 0.2, `${(st.content.darkRatio * 100).toFixed(1)}%`);
  check('2b 防护未触发', st.mask.guard.tripped === false, st.mask.guard.reasons.join('；'));
}
{
  /* 反向语料：整帧都是"雾"（无真天空）⇒ 不得设背景，且外景必须触发防护 */
  // 顶部扫描带内就陡变（每像素步进 6 > SKY_GRAD_MAX=2）⇒ 没有任何"平坦种子" ⇒ 不得设背景
  const allFog = writePng('caseFog-only.png', 160, 100, (x, y) => [
    Math.min(255, 20 + y * 6), Math.min(255, 30 + y * 6), Math.min(255, 50 + y * 5)]);
  const st = decodePngStats(allFog, { darkLuma: 0.08, clipLuma: 0.9, view: 'fp' });
  check('2b+ 强梯度雾（无真天空）⇒ 不设背景', st.mask.backgroundFound === false, JSON.stringify(st.mask.background));
  check('2b+ 且触发防护（不得退回整帧当作通过）', st.mask.guard.tripped === true, st.mask.guard.reasons.join('；'));
}

/* ------------------------------------------------------------------ */
console.log('\n=== 2. 渐变天空（自适应容差）===');
const graded = writePng('caseB-graded-sky.png', 120, 80, (x, y) => {
  if (x > 20 && y > 30) return [60, 55, 40];
  const step = y < 8 ? y : 8;                       // 顶部 10% 内每行 +1（≤ SKY_GRAD_MAX=2），之后保持
  return [210 - step, 175 - step, 127 - step];      // 极缓渐变的"天空"（真实渲染中天空近常量）
});
{
  const st = decodePngStats(graded, { darkLuma: 0.08, clipLuma: 0.9, view: 'oblique' });
  check('极缓渐变（每行 ≤2）的天空仍被识别（内容占比 < 0.6）', st.content.share < 0.6, `${(st.content.share * 100).toFixed(1)}%`);
  check('自适应容差 ≥ CLI 容差（记录在 background.tolerance）', st.content.background.tolerance >= 6,
    `容差 ${st.content.background.tolerance}、天空离散 ±${st.content.background.spread}`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 3. 静默失效防护（本任务核心）===');
{
  // 3a. 内容 ≈100% 且存在背景候选 → 防护触发（用 backgroundRgb 提示一个图里不存在的颜色，等价于"掩码没匹配上"）
  const st = decodePngStats(caseA, { darkLuma: 0.08, clipLuma: 0.9, view: 'oblique', backgroundRgb: { r: 1, g: 2, b: 3 } });
  check('3a 掩码失配（内容占比 100%）⇒ 防护触发', st.mask.guard.tripped === true && st.content.share > 0.98,
    `内容占比 ${(st.content.share * 100).toFixed(1)}%｜${st.mask.guard.reasons[0] ?? ''}`);
  const j = judgeShot({ view: 'oblique', stats: st });
  check('3a --judge 判定为 FAIL 且理由包含「背景掩码防护」',
    j.ok === false && j.reasons.some((r) => r.includes('背景掩码防护')), j.reasons.join('；'));
}
{
  // 3b. 未识别到背景：画面无稳定主色（模拟"到处都是结构、没有天空"）⇒ 外景下防护触发
  const noisy = writePng('caseC-nosky-noise.png', 120, 80, (x, y) => [(x * 7 + y * 13) % 256, (x * 11 + y * 5) % 256, (x * 3 + y * 17) % 256]);
  const st = decodePngStats(noisy, { darkLuma: 0.08, clipLuma: 0.9, view: 'oblique' });
  check('3b 无稳定背景主色（边框/顶部占比不足）⇒ 未识别背景且防护触发',
    st.mask.backgroundFound === false && st.mask.guard.tripped === true && st.mask.guard.reasons.some((r) => r.includes('未识别到**真天空**')),
    `border ${st.mask.borderShare} / top ${st.mask.topShare}｜${st.mask.guard.reasons.join('；')}`);
  const j = judgeShot({ view: 'oblique', stats: st });
  check('3b --judge 同理 FAIL', j.ok === false && j.reasons.some((r) => r.includes('背景掩码防护')), j.reasons.join('；'));
  // 3c. 同一张图在**内景**视角下豁免（内景本来就没有天空）
  const stI = decodePngStats(noisy, { darkLuma: 0.08, clipLuma: 0.9, view: 'interior' });
  check('3c 内景视角豁免「未识别背景」防护', stI.mask.guard.tripped === false, stI.mask.guard.reasons.join('；'));
  // 3d. 近纯色画面（内容 ≈0%）⇒ 指标退化，防护触发
  const flat = writePng('caseD-flat.png', 120, 80, () => [40, 40, 40]);
  const stF = decodePngStats(flat, { darkLuma: 0.08, clipLuma: 0.9, view: 'oblique' });
  check('3d 近纯色画面（内容占比 ≈0%）⇒ 防护触发（内容判据无意义）',
    stF.mask.guard.tripped === true && stF.mask.guard.reasons.some((r) => r.includes('内容占比仅')),
    `${(stF.content.share * 100).toFixed(1)}%｜${stF.mask.guard.reasons.join('；')}`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 4. 真实渲染图掩码自检（dusk / night）===');
const real = [
  ['docs/shots/t2-oblique-dusk.png', 'oblique', 'dusk'],
  ['docs/shots/t2-oblique-night.png', 'oblique', 'night'],
  ['docs/shots/t2-fp-night.png', 'fp', 'night(fp)'],
];
for (const [rel, view, preset] of real) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) { check(`${preset} 真实图存在（${rel}）`, false, '文件缺失 → 跳过'); continue; }
  const st = decodePngStats(file, { darkLuma: 0.08, clipLuma: 0.9, view });
  check(`${preset}：背景已识别且占比 ≥20%`,
    st.mask.backgroundFound && st.mask.borderShare >= 0.2,
    `border ${st.mask.borderShare} / top ${st.mask.topShare} / bg rgb(${st.mask.background?.r},${st.mask.background?.g},${st.mask.background?.b})`);
  check(`${preset}：内容占比落在合理区间 (5%, 90%)`,
    st.content.share > 0.05 && st.content.share < 0.9, `${(st.content.share * 100).toFixed(1)}%`);
  check(`${preset}：防护未触发（含真实图回归）`, st.mask.guard.tripped === false, st.mask.guard.reasons.join('；'));
  check(`${preset}：内容口径与整帧口径不再相同（掩码确实生效）`,
    Math.abs(st.content.darkRatio - st.darkRatio) > 0.005 || Math.abs(st.content.meanLuma - st.meanLuma) > 0.005,
    `内容 暗区 ${(st.content.darkRatio * 100).toFixed(2)}% / 均值 ${st.content.meanLuma}  vs  整帧 暗区 ${(st.darkRatio * 100).toFixed(2)}% / 均值 ${st.meanLuma}`);
}
{
  // 雾夜 fp：**背景必须是夜空**（暗），被雾洗白的远景（亮）必须算内容
  const f = join(ROOT, 'docs/shots/t2-fp-night.png');
  if (existsSync(f)) {
    const st = decodePngStats(f, { darkLuma: 0.08, clipLuma: 0.9, view: 'fp' });
    check('雾夜 fp：背景 = 夜空（g ≤ 35）而非被雾洗白的远景',
      st.mask.backgroundFound && st.mask.background.g <= 35, JSON.stringify(st.mask.background));
    check('雾夜 fp：雾洗白区域算作内容（内容占比 ≥50%）', st.content.share >= 0.5, `${(st.content.share * 100).toFixed(1)}%`);
    check('雾夜 fp：真内容暗区 ≤30%（内景/近景类阈值，阈值为 §12 原文）', st.content.darkRatio <= 0.30, `${(st.content.darkRatio * 100).toFixed(2)}%`);
  }
}

/* ------------------------------------------------------------------ */
console.log(`\nshot-mask.test.mjs：通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) {
  console.error(`失败项：\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
