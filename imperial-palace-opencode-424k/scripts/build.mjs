/**
 * 紫禁天朝 · 构建产物（复制运行时需要的文件到 dist/，保持资源相对路径）
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const INCLUDE = ['index.html', 'src', 'public', 'docs/STYLE_GUIDE.md', 'docs/CONTRACTS.md', 'docs/ASSET_CREDITS.md', 'README.md', 'imperial-palace-plan.md'];

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dest, f));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
let count = 0;
for (const item of INCLUDE) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) continue;
  copy(src, path.join(dist, item));
  count++;
}
const bytes = (function size(dir) {
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    n += st.isDirectory() ? size(p) : st.size;
  }
  return n;
})(dist);
console.log('dist/ 构建完成：' + count + ' 项，' + (bytes / 1048576).toFixed(2) + ' MB');
console.log('预览：SERVE_ROOT=dist node scripts/serve.mjs 5174  然后访问 http://localhost:5174/index.html');
