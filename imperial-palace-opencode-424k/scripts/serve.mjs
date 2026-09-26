/**
 * 紫禁天朝 · 本地静态服务（零依赖）
 * 用法：node scripts/serve.mjs [port]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const projectRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const root = process.env.SERVE_ROOT ? path.resolve(projectRoot, process.env.SERVE_ROOT) : projectRoot;
const port = Number(process.argv[2] || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2'
};

http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, u);
  if (u.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + u); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => {
  console.log('紫禁天朝 · http://localhost:' + port + '/index.html  （根目录：' + root + '）');
});
