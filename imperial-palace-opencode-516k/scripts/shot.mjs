import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';

const root = path.resolve(import.meta.dirname, '..');
const [view = 'oblique', preset = 'golden', out = null, extra = ''] = process.argv.slice(2);
const port = Number(process.env.SHOT_PORT || 8231);
const outPath = out ? path.resolve(out) : path.join(root, 'docs/shots', `view-${view}-${preset}.png`);
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function waitPort(p, tries = 60) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      const sock = net.connect(p, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (n <= 0) reject(new Error('server not ready'));
        else setTimeout(() => tick(n - 1), 120);
      });
    };
    tick(tries);
  });
}

await mkdir(path.dirname(outPath), { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
try {
  await waitPort(port);
  const url = `http://127.0.0.1:${port}/index.html?view=${view}&preset=${preset}${extra ? `&${extra}` : ''}&ui=0&shot=1&stats=1`;
  const args = ['--headless=new', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1440,900', '--virtual-time-budget=90000', '--dump-dom', url];
  let dom = '';
  let m = null;
  for (let attempt = 1; attempt <= 3 && !m; attempt++) {
    dom = await new Promise((resolve) => {
      let buf = '';
      const proc = spawn(chrome, args);
      proc.stdout.on('data', (d) => { buf += d; });
      proc.on('exit', () => resolve(buf));
    });
    m = dom.match(/<pre id="shotdata">([\s\S]*?)<\/pre>/);
    if (!m) console.log(`  第 ${attempt} 次未取到画面数据，重试…`);
  }
  if (!m) {
    const diag = dom.match(/<pre id="diagtext">([\s\S]*?)<\/pre>/);
    throw new Error('未取到画面数据' + (diag ? `；页面报错：${diag[1].slice(0, 300)}` : '（页面可能未完成加载）'));
  }
  await writeFile(outPath.replace(/\.png$/, '.dom.html'), dom);
  const b64 = m[1].replace(/\s+/g, '').replace(/^data:image\/png;base64,/, '');
  await writeFile(outPath, Buffer.from(b64, 'base64'));
  console.log(`截图输出: ${outPath} (${Buffer.from(b64, 'base64').length} bytes)`);
  const pagePath = outPath.replace(/\.png$/, '.page.png');
  const shotArgs = ['--headless=new', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1440,900', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=60000',
    `--screenshot=${pagePath}`, url];
  let pageOk = false;
  const { statSync } = await import('node:fs');
  for (let i = 0; i < 3 && !pageOk; i++) {
    await new Promise((resolve) => {
      const proc = spawn(chrome, shotArgs, { stdio: 'ignore' });
      proc.on('exit', () => resolve());
    });
    try {
      pageOk = statSync(pagePath).size > 60000;
    } catch (err) {
      pageOk = false;
    }
  }
  console.log(`整页输出: ${pagePath} (${pageOk ? statSync(pagePath).size : 0} bytes${pageOk ? '' : '，抓帧失败'}）`);

} finally {
  server.kill('SIGTERM');
}
