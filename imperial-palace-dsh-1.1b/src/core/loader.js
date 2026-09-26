/**
 * 异步加载器（唯一）：进度事件 + 失败事件 + 重试入口（CONTRACTS §7.2 assets:progress / assets:failed / zone:failed）。
 *
 * 设计：
 *   - 通用任务队列：`add(id, task, meta)` / `run()` / `retry(id?)`，task 返回 Promise；
 *   - 每个任务的进度按权重汇总为 `assets:progress { loaded, total, stage, mb }`；
 *   - 失败**不静默**：先发 `assets:failed { url, error, retriable }`，累计到结果里；
 *   - `loadZones()` 负责动态 import 区域模块并调用 createZone（t2 的 main.js 用；Node audit 也用同一实现）；
 *   - `loadTextures()` 走 three 的 TextureLoader（浏览器内），Node 下调用会得到明确失败事件而不是静默成功。
 *
 * 零 DOM 依赖（除 TextureLoader 分支外），可在 Node 直接 import。
 */

import { CONFIG, EVENTS } from '../shared/config.js';

export class LoaderError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'LoaderError';
    this.detail = detail;
  }
}

/**
 * @param {{ events: object, config?: object, maxAttempts?: number, stage?: string }} options
 */
export function createLoader({ events, config = CONFIG, maxAttempts = 3, stage = 'assets' } = {}) {
  if (!events) throw new LoaderError('createLoader 需要事件总线');

  /** @type {Map<string, { id, task, meta, attempts, weight, status, error, result }>} */
  const tasks = new Map();
  let stageLabel = stage;
  let allowUnknownEvents = false;

  function add(id, task, meta = {}) {
    if (typeof id !== 'string' || id.length === 0) throw new LoaderError('加载任务需要字符串 id');
    if (typeof task !== 'function') throw new LoaderError(`加载任务 ${id} 需要函数`);
    if (tasks.has(id)) throw new LoaderError(`加载任务 id 重复："${id}"`);
    tasks.set(id, {
      id,
      task,
      meta,
      attempts: 0,
      weight: Number.isFinite(meta.weight) ? meta.weight : 1,
      status: 'pending',
      error: null,
      result: null,
    });
    return id;
  }

  function total() {
    return tasks.size;
  }

  function progressPayload() {
    let loaded = 0;
    let totalWeight = 0;
    let doneWeight = 0;
    let bytes = 0;
    for (const t of tasks.values()) {
      totalWeight += t.weight;
      if (t.status === 'ok') {
        loaded += 1;
        doneWeight += t.weight;
      }
      if (Number.isFinite(t.meta.bytes)) bytes += t.meta.bytes;
      if (Number.isFinite(t.result?.bytes)) bytes += t.result.bytes;
    }
    return {
      loaded,
      total: tasks.size,
      stage: stageLabel,
      mb: +(bytes / (1024 * 1024)).toFixed(3),
      progress: totalWeight > 0 ? +(doneWeight / totalWeight).toFixed(4) : 0,
    };
  }

  function emitProgress(force = false) {
    if (tasks.size === 0 && !force) return;
    events.emit(EVENTS.assetsProgress, progressPayload());
  }

  function emitFailure(entry, error) {
    const message = error instanceof Error ? error.message : String(error);
    const retriable = entry.attempts < maxAttempts;
    events.emit(EVENTS.assetsFailed, {
      url: entry.meta.url ?? entry.id,
      id: entry.id,
      error: message,
      retriable,
    });
    return { id: entry.id, error: message, retriable, attempts: entry.attempts };
  }

  async function runTask(entry) {
    entry.attempts += 1;
    entry.status = 'running';
    try {
      entry.result = await entry.task({ attempt: entry.attempts, id: entry.id });
      entry.status = 'ok';
      entry.error = null;
      emitProgress(true);
      return { ok: true, id: entry.id, result: entry.result };
    } catch (error) {
      entry.status = 'failed';
      entry.error = error;
      const failure = emitFailure(entry, error);
      emitProgress(true);
      return { ok: false, ...failure, error };
    }
  }

  /**
   * 顺序执行（区域装载需要顺序注册以避免 id 竞争；纯资源可用 concurrency>1）。
   * @param {{ concurrency?: number, onEach?: Function }} [options]
   */
  async function run(options = {}) {
    const results = [];
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, 8));
    const entries = [...tasks.values()].filter((t) => t.status === 'pending' || t.status === 'failed');
    emitProgress(true);
    if (concurrency === 1) {
      for (const entry of entries) {
        const res = await runTask(entry);
        results.push(res);
        if (options.onEach) options.onEach(res, entry);
      }
    } else {
      let cursor = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (cursor < entries.length) {
          const idx = cursor;
          cursor += 1;
          const res = await runTask(entries[idx]);
          results.push(res);
          if (options.onEach) options.onEach(res, entries[idx]);
        }
      });
      await Promise.all(workers);
    }
    const failed = results.filter((r) => !r.ok);
    return { results, failed, ok: failed.length === 0, progress: progressPayload() };
  }

  /** 只重试失败（或指定 id）的任务。 */
  async function retry(id = null, options = {}) {
    const targets = [...tasks.values()].filter((t) => (id ? t.id === id : t.status === 'failed'));
    for (const t of targets) {
      if (t.attempts >= maxAttempts && !options.force) continue;
      t.status = 'pending';
    }
    return run({ concurrency: 1, ...options });
  }

  function setStage(label) {
    stageLabel = label;
    events.emit(EVENTS.assetsProgress, { ...progressPayload(), stage: label });
  }

  function summary() {
    return {
      stage: stageLabel,
      total: tasks.size,
      ok: [...tasks.values()].filter((t) => t.status === 'ok').map((t) => t.id),
      failed: [...tasks.values()]
        .filter((t) => t.status === 'failed')
        .map((t) => ({ id: t.id, error: t.error?.message ?? String(t.error), attempts: t.attempts, retriable: t.attempts < maxAttempts })),
      attempts: [...tasks.values()].reduce((acc, t) => {
        acc[t.id] = t.attempts;
        return acc;
      }, {}),
    };
  }

  return {
    add,
    run,
    retry,
    setStage,
    total,
    summary,
    get: (id) => tasks.get(id) ?? null,
    clear() {
      tasks.clear();
    },
    progress: progressPayload,
    /** 测试用：允许在 Node 里用事件名白名单之外的诊断事件 */
    setAllowUnknownEvents(value) {
      allowUnknownEvents = value;
      return allowUnknownEvents;
    },
  };
}

/**
 * 区域装载器：动态 import 区域模块 → createZone(ctx) → 契约校验由调用方负责（context.js）。
 * 缺模块 / 模块抛错都走 zone:failed（不静默）。
 *
 * @param {{ events: object, config?: object, specs: {zone: string, url: string}[] }} options
 */
export function createZoneLoader({ events, config = CONFIG, specs = [] } = {}) {
  const loader = createLoader({ events, config, maxAttempts: 2, stage: 'zones' });
  for (const spec of specs) {
    loader.add(`zone:${spec.zone}`, async () => {
      const mod = await import(spec.url);
      if (typeof mod.createZone !== 'function') {
        throw new LoaderError(`区域模块 ${spec.url} 没有导出 createZone(ctx)`);
      }
      if (typeof mod.ZONE_ID !== 'string') {
        throw new LoaderError(`区域模块 ${spec.url} 没有导出字符串 ZONE_ID`);
      }
      return { zone: spec.zone, url: spec.url, module: mod, createZone: mod.createZone, zoneId: mod.ZONE_ID };
    }, { url: spec.url });
  }
  return loader;
}

/**
 * 纹理加载（浏览器内）：进度/失败/重试都走同一套事件；Node 内明确失败而非静默。
 * @param {{ THREE: object, events: object, config?: object }} options
 */
export function createTextureLoader({ THREE, events, config = CONFIG, manager = null }) {
  if (!THREE) throw new LoaderError('createTextureLoader 需要 THREE');
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const texLoader = isBrowser ? new THREE.TextureLoader(manager ?? undefined) : null;
  const cache = new Map();

  function load(url, { colorSpace = true, anisotropy = 1 } = {}) {
    if (!url || typeof url !== 'string') {
      const error = new LoaderError('loadTexture 需要字符串 url');
      events.emit(EVENTS.assetsFailed, { url: String(url), error: error.message, retriable: false });
      return Promise.reject(error);
    }
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    if (!isBrowser) {
      const error = new LoaderError(
        `纹理加载只能在浏览器内进行（Node 环境无 DOM/WebGL）：${url}。` +
          'Node 侧请用 scripts/audit.mjs 做资源统计，不要尝试解码纹理。',
      );
      events.emit(EVENTS.assetsFailed, { url, error: error.message, retriable: false });
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      texLoader.load(
        url,
        (texture) => {
          if (colorSpace) texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = anisotropy;
          cache.set(url, texture);
          events.emit(EVENTS.assetsProgress, { loaded: cache.size, total: 0, stage: 'textures', mb: 0, url });
          resolve(texture);
        },
        undefined,
        (error) => {
          const e = error instanceof Error ? error : new LoaderError(`纹理加载失败：${url}`);
          events.emit(EVENTS.assetsFailed, { url, error: e.message, retriable: true });
          reject(e);
        },
      );
    });
  }

  return {
    load,
    get: (url) => cache.get(url) ?? null,
    size: () => cache.size,
    dispose() {
      for (const tex of cache.values()) tex.dispose?.();
      cache.clear();
    },
  };
}

export default createLoader;
