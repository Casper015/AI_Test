#!/usr/bin/env node
/**
 * 构建脚本：把 index.html / src / public 复制到 dist/，并校验
 *   1) 关键文件存在；
 *   2) 产物内无绝对路径（不得出现以 "/" 开头的 src/href/import/url，也不得出现仓库绝对路径）；
 *   3) index.html 的模块入口（./src/main.js）是否已就位（未就位仅告警：其归属 t2/t14 核心引擎）。
 *
 * 用法：node scripts/build.mjs [--quiet]
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DIST = join(ROOT, 'dist');
const quiet = process.argv.includes('--quiet');

const log = (...args) => {
  if (!quiet) console.log(...args);
};

/** 需要复制到发布包的一级条目。 */
const COPY_TARGETS = ['index.html', 'src', 'public'];

/** 发布包必须存在的关键文件（缺一即构建失败）。 */
const REQUIRED_FILES = [
  'index.html',
  'src/shared/config.js',
  'src/shared/layout.js',
  'src/shared/base.css',
  'public/vendor/three/three.module.js',
];

/** 仅告警（归属其它任务）的入口文件。 */
const ENTRY_CANDIDATES = ['src/main.js'];

const SCAN_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.svg']);

const IGNORE_NAMES = new Set(['.DS_Store']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE_NAMES.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

const problems = [];
const warnings = [];

log('=== build: 紫禁天朝 ===');
log(`root : ${ROOT}`);
log(`dist : ${DIST}`);

// 1. 清理 dist
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// 2. 复制
let copied = 0;
for (const target of COPY_TARGETS) {
  const src = join(ROOT, target);
  if (!existsSync(src)) {
    problems.push(`缺少待复制条目：${target}`);
    continue;
  }
  cpSync(src, join(DIST, target), {
    recursive: true,
    filter: (from) => !IGNORE_NAMES.has(from.split('/').pop()),
  });
  copied += 1;
  log(`  copy ${target} → dist/${target}`);
}

// 3. 关键文件校验
for (const rel of REQUIRED_FILES) {
  const abs = join(DIST, rel);
  if (!existsSync(abs)) problems.push(`dist 缺少关键文件：${rel}`);
  else log(`  ok   ${rel} (${human(statSync(abs).size)})`);
}

// 4. 入口告警
for (const rel of ENTRY_CANDIDATES) {
  if (!existsSync(join(DIST, rel))) {
    warnings.push(`dist 暂缺入口 ${rel}（归属 t2 core-engineer / t14 集成；index.html 已在引用它）`);
  }
}

// 4b. import map 校验：vendored addons 以裸标识符 'three' 导入，必须能被解析
if (existsSync(join(DIST, 'index.html'))) {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const mapMatch = html.match(/<script[^>]+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!mapMatch) {
    problems.push('index.html 缺少 importmap：vendor addons 的裸导入 "three" 无法解析');
  } else {
    let map = null;
    try {
      map = JSON.parse(mapMatch[1]);
    } catch (error) {
      problems.push(`index.html 的 importmap 不是合法 JSON：${error.message}`);
    }
    if (map) {
      const threeSpec = map.imports?.['three'];
      if (typeof threeSpec !== 'string' || !threeSpec.startsWith('./')) {
        problems.push(`importmap 的 "three" 必须是 ./ 相对路径，实际 ${JSON.stringify(threeSpec)}`);
      } else if (!existsSync(join(DIST, threeSpec.replace('./', '')))) {
        problems.push(`importmap 指向的 three 文件不存在：${threeSpec}`);
      } else {
        log(`  ok   importmap three → ${threeSpec}`);
      }
      const addonSpec = map.imports?.['three/addons/'];
      if (typeof addonSpec !== 'string' || !addonSpec.startsWith('./') || !existsSync(join(DIST, addonSpec.replace('./', '')))) {
        problems.push(`importmap 的 "three/addons/" 前缀映射无效：${JSON.stringify(addonSpec)}`);
      } else {
        log(`  ok   importmap three/addons/ → ${addonSpec}`);
      }
    }
  }
}

// 5. 绝对路径扫描
const ABS_PATTERNS = [
  { re: /\b(?:src|href)\s*=\s*["']\/(?!\/)/g, why: 'HTML 引用以 / 开头的绝对路径' },
  { re: /\bfrom\s+["']\/(?!\/)/g, why: 'ESM import 使用绝对路径' },
  { re: /\bimport\s*\(\s*["']\/(?!\/)/g, why: '动态 import 使用绝对路径' },
  { re: /url\(\s*["']?\/(?!\/)/g, why: 'CSS url() 使用绝对路径' },
];

const distFiles = walk(DIST);
let scanned = 0;
let totalBytes = 0;
let vendorSkipped = 0;
for (const abs of distFiles) {
  totalBytes += statSync(abs).size;
  if (!SCAN_EXT.has(extname(abs))) continue;
  const rel = relative(DIST, abs);
  // 第三方 vendored 代码（public/vendor/**）只做存在性与体积统计，不做绝对路径扫描：
  // 它按约定原样交付、不允许本地修改；其内部相对 import 由自身保证。
  if (rel.startsWith('public/vendor/')) {
    vendorSkipped += 1;
    continue;
  }
  scanned += 1;
  const text = readFileSync(abs, 'utf8');
  for (const { re, why } of ABS_PATTERNS) {
    re.lastIndex = 0;
    const hit = re.exec(text);
    if (hit) {
      const line = text.slice(0, hit.index).split('\n').length;
      problems.push(`${rel}:${line} 绝对路径（${why}）：${hit[0].trim()}`);
    }
  }
  if (text.includes(ROOT)) {
    problems.push(`${rel} 含本机绝对路径 ${ROOT}`);
  }
  if (/\bfile:\/\//.test(text)) {
    problems.push(`${rel} 含 file:// 绝对路径`);
  }
}

log(`  扫描 ${scanned} 个自研文本文件（跳过 vendor ${vendorSkipped} 个），dist 共 ${distFiles.length} 个文件 / ${human(totalBytes)}`);

// 6. 构建信息
const info = {
  builtAt: new Date().toISOString(),
  node: process.version,
  root: ROOT,
  files: distFiles.length,
  bytes: totalBytes,
  scanned,
  missingEntry: ENTRY_CANDIDATES.filter((rel) => !existsSync(join(DIST, rel))),
  warnings,
  problems,
};
writeFileSync(join(DIST, 'BUILD_INFO.json'), `${JSON.stringify(info, null, 2)}\n`, 'utf8');

log('=== 结果 ===');
for (const w of warnings) log(`  warn  ${w}`);
if (problems.length > 0) {
  console.error(`  ✗ 构建失败，${problems.length} 个问题：`);
  for (const p of problems) console.error(`    - ${p}`);
  process.exit(1);
}
log(`  ✓ dist 就绪：${distFiles.length} 个文件 / ${human(totalBytes)}；绝对路径 0；关键文件齐全`);
if (warnings.length > 0) log(`  （${warnings.length} 条告警，见 dist/BUILD_INFO.json）`);
process.exit(0);
