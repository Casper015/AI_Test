// 无头截图工具（主 Agent 维护）
// 用法：node scripts/shot.mjs <view> <preset> [outPath] [extraQuery]
// 通过 Chrome DevTools Protocol 等待页面 window.__PALACE__ 就绪后再截图，
// 避免在场景构建完成前抓拍到加载画面。
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const root = path.resolve(import.meta.dirname, '..');
const [view = 'oblique', preset = 'golden', out = null, extra = ''] = process.argv.slice(2);
const outPath = out ? path.resolve(out) : path.join(root, 'docs/shots', `view-${view}-${preset}.png`);
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (err) { /* retry */ }
    await sleep(100);
  }
  return false;
}

async function getWsUrl(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const j = await res.json();
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
      }
    } catch (err) { /* retry */ }
    await sleep(100);
  }
  throw new Error('DevTools 未就绪');
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (err) { return; }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
    ws.addEventListener('error', (e) => reject(e.error || new Error('ws error')));
    ws.addEventListener('open', () => {
      const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { res, rej });
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        ws.send(JSON.stringify(payload));
      });
      resolve({ send, close: () => ws.close() });
    });
  });
}

await mkdir(path.dirname(outPath), { recursive: true });
const httpPort = await freePort();
const cdpPort = await freePort();
const userDir = path.join(os.tmpdir(), `palace-shot-${Date.now()}`);
const server = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const args = ['--headless=new', '--hide-scrollbars', '--disable-lcd-text', '--enable-unsafe-swiftshader',
  '--force-device-scale-factor=1', '--window-size=1440,900', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${userDir}`, `--remote-debugging-port=${cdpPort}`, 'about:blank'];
const proc = spawn(chrome, args, { stdio: 'ignore' });
let conn = null;

try {
  if (!(await waitHealthy(`http://127.0.0.1:${httpPort}/index.html`))) {
    throw new Error(`健康检查失败：127.0.0.1:${httpPort}/index.html 未返回 200`);
  }
  const wsUrl = await getWsUrl(cdpPort);
  conn = await cdp(wsUrl);
  const pageUrl = `http://127.0.0.1:${httpPort}/index.html?view=${view}&preset=${preset}&ui=0&shot=1&stats=1${extra ? `&${extra}` : ''}`;
  const { targetId } = await conn.send('Target.createTarget', { url: pageUrl });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  await conn.send('Runtime.enable', {}, sessionId).catch(() => {});
  await conn.send('Page.enable', {}, sessionId).catch(() => {});

  let ready = false;
  let last = null;
  for (let i = 0; i < 400; i++) {
    try {
      const r = await conn.send('Runtime.evaluate', { expression: 'JSON.stringify({href:location.href,rs:document.readyState,palace:!!window.__PALACE__})', returnByValue: true }, sessionId);
      last = r && r.result && r.result.value;
      if (last && last.includes('"palace":true')) { ready = true; break; }
    } catch (err) { last = 'ERR:' + err.message; }
    await sleep(150);
  }
  if (!ready) throw new Error(`等待 window.__PALACE__ 超时（场景未就绪）last=${last}`);
  await sleep(700); // 让动画循环至少绘制数帧

  const shot = await conn.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(outPath, Buffer.from(shot.data, 'base64'));
  console.log(`截图输出: ${outPath}`);
} finally {
  if (conn) { try { conn.close(); } catch (err) { /* ignore */ } }
  proc.kill('SIGKILL');
  server.kill('SIGKILL');
  await rm(userDir, { recursive: true, force: true }).catch(() => {});
}
