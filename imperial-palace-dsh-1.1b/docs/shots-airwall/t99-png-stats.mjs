import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
export function decodePng(path) {
  const buf = readFileSync(path);
  let off = 8, w = 0, h = 0, bitDepth = 8, colorType = 6; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8); const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!ch || bitDepth !== 8) throw new Error(`不支持 colorType=${colorType} depth=${bitDepth}`);
  const stride = w * ch; const px = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const f = raw[p]; p += 1;
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev ? prev[i] : 0, c = prev && i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
  }
  return { w, h, ch, px, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}
export function stats(img) {
  const { w, h, ch, px } = img; let sum = 0, sum2 = 0, dark = 0, clip = 0, min = 255, max = 0;
  for (let i = 0; i < w * h; i += 1) {
    const r = px[i * ch], g = px[i * ch + 1], b = px[i * ch + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sum += l; sum2 += l * l; if (l < 0.08) dark += 1; if (l > 0.9) clip += 1; if (l < min) min = l; if (l > max) max = l;
  }
  const n = w * h, mean = sum / n;
  return { w, h, bytes: img.bytes, sha256: img.sha256, mean: +mean.toFixed(4), std: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(4), darkPct: +(dark / n * 100).toFixed(3), clipPct: +(clip / n * 100).toFixed(3), min: +min.toFixed(3), max: +max.toFixed(3) };
}
export function regionStats(img, rect) {
  const { w, h, ch, px } = img; const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(w, Math.ceil(rect.x + rect.w)), y1 = Math.min(h, Math.ceil(rect.y + rect.h));
  const lum = [];
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const i = (y * w + x) * ch; lum.push((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255); }
  lum.sort((a, b) => a - b);
  const q = (t) => lum[Math.min(lum.length - 1, Math.floor(t * lum.length))] ?? 0;
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  // 环带（面板外 12px）对照
  const ring = [];
  for (let y = Math.max(0, y0 - 12); y < Math.min(h, y1 + 12); y += 1) for (let x = Math.max(0, x0 - 12); x < Math.min(w, x1 + 12); x += 1) {
    if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
    const i = (y * w + x) * ch; ring.push((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255);
  }
  const ringMean = ring.reduce((a, b) => a + b, 0) / ring.length;
  return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, pixels: lum.length, mean: +mean.toFixed(4), p05: +q(0.05).toFixed(4), p50: +q(0.5).toFixed(4), p95: +q(0.95).toFixed(4), contrastRange: +(q(0.95) - q(0.05)).toFixed(4), ringMean: +ringMean.toFixed(4), contrastVsRing: +Math.abs(mean - ringMean).toFixed(4) };
}
const [cmd, file, rectJson] = process.argv.slice(2);
const img = decodePng(file);
if (cmd === 'stats') console.log(JSON.stringify(stats(img), null, 1));
else console.log(JSON.stringify({ ...stats(img), region: regionStats(img, JSON.parse(rectJson)) }, null, 1));
