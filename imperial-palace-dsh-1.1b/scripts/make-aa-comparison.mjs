#!/usr/bin/env node
/**
 * t16：把两张同帧 PNG 的**同一区域**裁切、放大并上下并排，产出"前后对照"证据图。
 * 纯图像操作（浏览器 canvas 解码/编码），不改任何产品代码。
 *
 * 用法：node scripts/make-aa-comparison.mjs <a.png> <b.png> <out.png> [x,y,w,h] [scale] [labelA] [labelB]
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [aPath, bPath, outPath, boxArg = '0,0,480,300', scaleArg = '2', labelA = 'AA OFF', labelB = 'AA ON'] = process.argv.slice(2);
if (!aPath || !bPath || !outPath) { console.error('用法：node scripts/make-aa-comparison.mjs <a.png> <b.png> <out.png> [x,y,w,h] [scale] [labelA] [labelB]'); process.exit(2); }
const [x, y, cw, ch] = boxArg.split(',').map(Number);
const scale = Number(scaleArg);
mkdirSync(dirname(outPath), { recursive: true });
const CHROME = process.env.CHROME ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const PORT = 9900 + (process.pid % 90);
const chrome = spawn(CHROME, ['--headless', '--use-angle=metal', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/t16-cmp-${process.pid}-${Date.now()}`, '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())[0]?.webSocketDebuggerUrl ?? null; } catch { /* wait */ }
  if (!wsUrl) await sleep(300);
}
if (!wsUrl) { console.error('无法连接 Chrome'); chrome.kill(); process.exit(3); }
const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const aB64 = readFileSync(aPath).toString('base64');
const bB64 = readFileSync(bPath).toString('base64');
const dataUrl = await evaluate(`(async () => {
  const load = (b64) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
  const a = await load(${JSON.stringify(aB64)});
  const b = await load(${JSON.stringify(bB64)});
  const S = ${scale}, W = ${cw}, H = ${ch}, PAD = 12, LAB = 34;
  const cv = document.createElement('canvas');
  cv.width = W * S + PAD * 2; cv.height = (H * S + LAB) * 2 + PAD * 3;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#111'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.imageSmoothingEnabled = false;
  const draw = (img, oy, label) => {
    cx.drawImage(img, ${x}, ${y}, W, H, PAD, oy + LAB, W * S, H * S);
    cx.fillStyle = '#ffd166'; cx.font = 'bold 22px system-ui, sans-serif';
    cx.fillText(label, PAD, oy + 24);
  };
  draw(a, PAD, ${JSON.stringify(labelA)});
  draw(b, PAD * 2 + LAB + H * S, ${JSON.stringify(labelB)});
  return cv.toDataURL('image/png');
})()`);
writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`✓ ${outPath}`);
try { ws.close(); } catch { /* ignore */ }
chrome.kill();
process.exit(0);
