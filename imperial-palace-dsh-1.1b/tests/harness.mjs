/**
 * 测试与审计共用工具（`tests/harness.mjs`）—— 让区域作者在 **Node 内** 构造 `ctx` 并自检契约。
 *
 * 关键点：
 *   1. `import 'tests/harness.mjs'` 会立即注册 Node 的**模块解析钩子**，把浏览器 import map 里的
 *      裸标识符 `three` / `three/addons/*` 映射到本地 `public/vendor/three/**`（同一份 three r169）；
 *   2. 因此本文件**不得静态 import 任何 src/core/*.js 或 src/zones/*.js**（静态 import 会先于钩子执行），
 *      一律用 `await loadModule(relativePath)` 动态加载；
 *   3. `makeTestCtx()` 提供契约要求的全部 ctx 字段（kit 用灰盒替身，t3 的 kit 就位后可注入真 kit）。
 *
 * 用法（区域作者自测）：
 *   import { makeTestCtx, loadModule, createTestRunner } from '../tests/harness.mjs';
 *   const ctx = await makeTestCtx({ zoneId: 'B' });
 *   const { createZone } = await loadModule('src/zones/forecourt.js');
 *   const result = await createZone(ctx);
 */

import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HARNESS_DIR, '..');
export const THREE_DIR = join(ROOT, 'public', 'vendor', 'three');
export const THREE_ENTRY = join(THREE_DIR, 'three.module.js');

/* -------------------------------------------------------------------------- */
/*  1. 模块解析钩子：'three' → 本地 vendored three r169                          */
/* -------------------------------------------------------------------------- */

let hooksInstalled = false;

export function installThreeResolver() {
  if (hooksInstalled) return { installed: false, reason: '已安装' };
  const vendorUrl = pathToFileURL(`${THREE_DIR}/`).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'three') {
        return { url: pathToFileURL(THREE_ENTRY).href, shortCircuit: true };
      }
      if (specifier.startsWith('three/addons/')) {
        return { url: new URL(`addons/${specifier.slice('three/addons/'.length)}`, vendorUrl).href, shortCircuit: true };
      }
      if (specifier.startsWith('three/examples/jsm/')) {
        return { url: new URL(`addons/${specifier.slice('three/examples/jsm/'.length)}`, vendorUrl).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  hooksInstalled = true;
  return { installed: true, vendor: vendorUrl };
}

installThreeResolver();

/* -------------------------------------------------------------------------- */
/*  2. 动态加载与缓存                                                            */
/* -------------------------------------------------------------------------- */

const moduleCache = new Map();

/** 动态加载项目内模块（路径相对 ROOT，例如 'src/core/camera.js'）。 */
export async function loadModule(relativePath) {
  const abs = join(ROOT, relativePath);
  if (!existsSync(abs)) {
    const error = new Error(`模块不存在：${relativePath}`);
    error.code = 'MODULE_MISSING';
    error.path = relativePath;
    throw error;
  }
  if (!moduleCache.has(abs)) moduleCache.set(abs, import(pathToFileURL(abs).href));
  return moduleCache.get(abs);
}

/** 加载同一份 three（r169） */
export async function loadThree() {
  if (!moduleCache.has('three')) moduleCache.set('three', import('three'));
  return moduleCache.get('three');
}

/** 区域模块清单：区域 id → 相对路径（缺失即 skip，不得静默假装通过）。 */
export const ZONE_MODULES = Object.freeze({
  B: 'src/zones/forecourt.js',
  C: 'src/zones/inner-palace.js',
  D: 'src/zones/west-courts.js',
  E: 'src/zones/east-courts.js',
  F: 'src/zones/garden-boundary.js',
  GREYBOX: 'src/zones/_greybox.js',
  TEMPLATE: 'src/zones/_template.js',
});

export const REAL_ZONE_IDS = Object.freeze(['B', 'C', 'D', 'E', 'F']);

export function zoneModulePath(zoneId) {
  const path = ZONE_MODULES[zoneId];
  if (!path) throw new Error(`未知区域 id "${zoneId}"（合法：${Object.keys(ZONE_MODULES).join('/')}）`);
  return path;
}

/* -------------------------------------------------------------------------- */
/*  3. 测试用 ctx                                                               */
/* -------------------------------------------------------------------------- */

/** 内存事件总线（不依赖 src/core/events.js，避免测试顺序耦合）。 */
export function makeSilentEvents() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    off(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    emit(type, payload = {}) {
      emitted.push({ type, payload });
      for (const handler of [...(handlers.get(type) ?? [])]) handler(payload, type);
      return handlers.get(type)?.size ?? 0;
    },
    request(type, payload = {}) {
      return this.emit(type, { ...payload, source: payload.source ?? 'test' });
    },
    count: (type) => emitted.filter((e) => e.type === type).length,
    listenerCount: (type) => handlers.get(type)?.size ?? 0,
  };
}

/**
 * 构造区域上下文。
 * @param {{ zoneId?: string, scope?: 'zone'|'city', quality?: string, kit?: object|null,
 *           events?: object, shared?: object, greyboxSkipZones?: string[], layout?: object }} [options]
 */
export async function makeTestCtx(options = {}) {
  const THREE = await loadThree();
  const { CONFIG } = await loadModule('src/shared/config.js');
  const LAYOUT = await loadModule('src/shared/layout.js');
  const { createZoneContext, validateZoneContext } = await loadModule('src/core/context.js');
  const greybox = await loadModule('src/zones/_greybox.js');
  const { createRegistry } = await loadModule('src/core/registry.js');

  const events = options.events ?? makeSilentEvents();
  const registry = options.registry ?? createRegistry({ events, layout: LAYOUT });
  const config = options.config ?? CONFIG;
  const zoneId = options.zoneId ?? 'B';
  const scope = options.scope ?? (zoneId === 'GREYBOX' ? 'city' : 'zone');

  const kit = options.kit ?? greybox.createFallbackKit(THREE, config);
  const assets = options.assets ?? {
    /** 资产替身：Node 内不加载真实文件，但接口与 t3 的管理器一致 */
    get: () => null,
    load: async (list = []) => list,
    stats: () => ({ loaded: 0, total: 0, bytes: 0 }),
    used: new Set(),
  };

  const ctx = createZoneContext({
    THREE,
    zoneId,
    kit,
    assets,
    events,
    registry,
    quality: options.quality ?? config.QUALITY.default,
    shared: options.shared,
    config,
    layout: LAYOUT,
    scope,
    greyboxSkipZones: options.greyboxSkipZones ?? [],
  });

  const problems = validateZoneContext(ctx);
  if (problems.length > 0) throw new Error(`makeTestCtx 构造的 ctx 自身不合格：${problems.join('；')}`);
  ctx.registry = registry;
  return ctx;
}

/** 校验区域返回值（scope 与 expectBuildings 可覆盖）。 */
export async function checkZoneResult(zoneId, result, options = {}) {
  const THREE = await loadThree();
  const { validateZoneResult } = await loadModule('src/core/context.js');
  const scope = options.scope ?? (zoneId === 'GREYBOX' ? 'city' : 'zone');
  return validateZoneResult(zoneId, result, { THREE, scope, ...options });
}

/** 加载区域模块并产出返回值（不抛：失败时返回 { error }，供测试显式断言）。 */
export async function buildZone(zoneId, options = {}) {
  const relative = zoneModulePath(zoneId);
  if (!existsSync(join(ROOT, relative))) {
    return { skipped: true, reason: `模块未创建：${relative}` };
  }
  const mod = await loadModule(relative);
  const ctx = await makeTestCtx({ ...options, zoneId });
  const result = await mod.createZone(ctx);
  return { skipped: false, module: mod, ctx, result };
}

/* -------------------------------------------------------------------------- */
/*  4. 轻量断言 + 测试运行器                                                     */
/* -------------------------------------------------------------------------- */

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition, message) {
  if (!condition) throw new AssertionError(message ?? '断言失败');
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new AssertionError(`${message ?? 'assertEqual 失败'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

export function assertClose(actual, expected, tolerance = 1e-6, message) {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new AssertionError(`${message ?? 'assertClose 失败'}：期望 ${expected} ±${tolerance}，实际 ${actual}`);
  }
}

export function assertThrows(fn, message) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new AssertionError(`${message ?? 'assertThrows 失败'}：没有抛错`);
}

export function assertNoProblems(problems, label = '契约校验') {
  if (problems && problems.length > 0) {
    throw new AssertionError(`${label} 发现 ${problems.length} 个问题：\n    - ${problems.join('\n    - ')}`);
  }
}

/** 顺序测试运行器：每个 test 独立 try/catch，最后打印汇总并以退出码结束。 */
export function createTestRunner(title) {
  const results = [];
  let currentSection = '';
  let passes = 0;
  let fails = 0;
  const skips = [];

  const log = (line = '') => process.stdout.write(`${line}\n`);

  log('---------------------------------------------------------');
  log(` ${title}`);
  log(` node ${process.version} · root ${ROOT}`);
  log('---------------------------------------------------------');

  return {
    section(name) {
      currentSection = name;
      log(`\n[${name}]`);
    },
    async test(name, fn) {
      const t0 = Date.now();
      try {
        await fn();
        passes += 1;
        results.push({ section: currentSection, name, ok: true, ms: Date.now() - t0 });
        log(`  ✓ ${name}`);
      } catch (error) {
        fails += 1;
        results.push({ section: currentSection, name, ok: false, ms: Date.now() - t0, error });
        log(`  ✗ ${name}`);
        log(`      ${error?.message ?? error}`);
      }
    },
    skip(name, reason) {
      skips.push({ name, reason });
      log(`  - skip ${name}：${reason}`);
    },
    info(message) {
      log(`  · ${message}`);
    },
    summary() {
      log('\n---------------------------------------------------------');
      log(` 通过 ${passes} / ${passes + fails}${skips.length > 0 ? `，skip ${skips.length}` : ''}`);
      if (skips.length > 0) {
        for (const s of skips) log(`  - skip ${s.name}：${s.reason}`);
      }
      for (const r of results.filter((r) => !r.ok)) {
        log(`  ✗ [${r.section}] ${r.name}：${r.error?.message ?? r.error}`);
      }
      log('---------------------------------------------------------');
      return fails === 0 ? 0 : 1;
    },
    counts: () => ({ passes, fails, skips: skips.length }),
  };
}

/** 读取源码文本（静态扫描测试用，如"只有一处 renderer/composer/动画循环"）。 */
export function readSource(relativePath) {
  const abs = join(ROOT, relativePath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

export { join, dirname, resolve };
