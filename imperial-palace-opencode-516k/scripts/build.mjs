import { cp, rm, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of ['index.html', 'src', 'public']) {
  await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
}
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const bad = [];
if (html.includes('src="/') || html.includes('href="/')) bad.push('index.html 含绝对路径');
for (const p of ['src/main.js', 'public/vendor/three/three.module.js']) {
  if (!existsSync(path.join(dist, p))) bad.push(`缺少 ${p}`);
}
const count = await stat(path.join(dist, 'src')).then(() => 'ok');
console.log(`dist 构建完成（src: ${count}）`);
if (bad.length) {
  console.error('构建检查失败:', bad.join('; '));
  process.exit(1);
}
