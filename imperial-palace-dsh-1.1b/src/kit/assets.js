/**
 * assets.js — 资产登记与运行时资源管理器（CONTRACTS §3.1 ctx.assets、§8 登记字段、计划 §4.2）
 * =============================================================================
 * 本项目**全部构件程序化生成**（无第三方模型/贴图），因此：
 *   - public/assets/ 为空，登记表里的每一条 sourceUrl 都是 `procedural://...`（本地生成，不联网）；
 *   - load() 不发任何网络请求，stats().networkRequests 恒为 0（tests/kit.test.mjs 断言）；
 *   - 同一份资源只保留一份：登记表按 id 去重（Map），几何/材质由 kit 的共享缓存统一持有（config.ASSETS.dedupe）。
 * 登记结构严格使用 CONFIG.ASSETS.requiredFields 的 9 个字段（见 docs/ASSET_CREDITS.md 表头）。
 */

import { CONFIG } from '../shared/config.js';

const PROCEDURAL_AUTHOR = 'kit-engineer（程序化生成 / procedural，无第三方素材）';
const PROCEDURAL_LICENSE = 'project-internal (procedural, no third-party asset)';

/** 9 个必需字段（来自 config.ASSETS.requiredFields，不是本地硬编码清单）。 */
export const REQUIRED_ASSET_FIELDS = CONFIG.ASSETS.requiredFields;

export function createAssets({ config = CONFIG, kit = null } = {}) {
  const registry = new Map();
  const used = new Set();
  const diagnostics = [];
  const log = [];

  const makeDescriptor = (id, { bounds = null, lod = null, usedBy = [], notes = '', kind = 'procedural-part' } = {}) => ({
    id,
    sourceUrl: `procedural://${id}`,
    author: PROCEDURAL_AUTHOR,
    license: PROCEDURAL_LICENSE,
    localPath: null,
    normalization: { ...config.ASSETS.normalizationDefaults, unit: config.ASSETS.unit, upAxis: config.ASSETS.upAxis, pivot: config.ASSETS.pivot },
    bounds: bounds ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } },
    lod: lod ?? [
      { level: 0, triangles: 0, file: null, note: 'kit 程序化 LOD0（近景全细节）' },
      { level: 1, triangles: 0, file: null, note: 'kit 程序化 LOD1（中景）' },
      { level: 2, triangles: 0, file: null, note: 'kit 程序化 LOD2（远景轮廓）' },
    ],
    usedBy,
    notes,
    kind,
  });

  const register = (id, meta) => {
    if (registry.has(id)) return registry.get(id);
    const descriptor = makeDescriptor(id, meta);
    registry.set(id, descriptor);
    return descriptor;
  };

  // 构件工厂登记（程序化）
  for (const name of ['hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'wall', 'courtyardGate', 'corridor', 'terrace', 'stairs', 'bridge']) {
    register(`kit:${name}`, { notes: '构件工厂（参数化，运行时生成几何，不落盘）', kind: 'procedural-building' });
  }
  for (const name of ['tree', 'rockery', 'lantern', 'railing', 'bronze', 'screenWall', 'water', 'paving']) {
    register(`kit:${name}`, { notes: '共享摆件工厂（参数化）', kind: 'procedural-prop' });
  }
  for (const name of config.MATERIALS ? Object.keys(config.MATERIALS) : []) {
    register(`kit:material:${name}`, { notes: 'config.MATERIALS 令牌驱动的共享材质', kind: 'procedural-material' });
  }
  register('kit:textures', { notes: '程序化中性灰度细节贴图（瓦垄/木纹/石材/铺地/金砖/灰泥），颜色由材质令牌决定', kind: 'procedural-texture' });

  const api = {
    /** 登记表（只读视图）。 */
    registry,
    get(id) {
      const item = registry.get(id);
      if (item) used.add(id);
      else diagnostics.push({ code: 'unknown-asset', message: `assets.get('${id}') 未登记` });
      return item ?? null;
    },
    has: (id) => registry.has(id),
    /**
     * 声明的加载列表：本项目全部程序化，因此**不需要任何网络/磁盘加载**，
     * 立即 resolve（保持 ctx.assets.load(list) 的异步签名，便于后续替换为真实加载器）。
     */
    async load(list = []) {
      const ids = Array.isArray(list) ? list : [list];
      const out = new Map();
      for (const id of ids) {
        const item = api.get(id);
        if (item) out.set(id, item);
      }
      log.push({ ids: [...out.keys()], at: log.length });
      return out;
    },
    /** 逐项加载进度（不联网，只为统一接口壳）。 */
    async loadWithProgress(list = [], onProgress = null) {
      const ids = Array.isArray(list) ? list : [list];
      let done = 0;
      const out = new Map();
      for (const id of ids) {
        const item = api.get(id);
        if (item) out.set(id, item);
        done += 1;
        if (onProgress) onProgress({ loaded: done, total: ids.length, stage: 'assets', mb: 0 });
      }
      return out;
    },
    /** 运行时用量：networkRequests 恒 0（程序化），thirdParty 恒 0。 */
    stats() {
      const thirdParty = [...registry.values()].filter((a) => !String(a.sourceUrl).startsWith('procedural://')).length;
      return {
        registered: registry.size,
        thirdParty,
        procedural: registry.size - thirdParty,
        usedCount: used.size,
        loadCalls: log.length,
        networkRequests: 0,
        transferredMB: 0,
        dedupe: config.ASSETS.dedupe,
        requiredFields: REQUIRED_ASSET_FIELDS,
        runtimeFormat: config.ASSETS.runtimeFormat,
      };
    },
    used,
    diagnostics,
    /** 校验登记表字段完整性（9 字段；测试与评审都用这一条）。 */
    validate() {
      const problems = [];
      for (const [id, item] of registry) {
        for (const field of REQUIRED_ASSET_FIELDS) {
          if (!(field in item)) problems.push({ id, field, problem: '缺少必需字段' });
        }
        if (!String(item.sourceUrl).startsWith('procedural://')) {
          problems.push({ id, field: 'sourceUrl', problem: '非程序化来源但没有本地交付记录（禁止热链）' });
        }
        if (item.localPath !== null) problems.push({ id, field: 'localPath', problem: '程序化资源不应有本地文件' });
      }
      return { ok: problems.length === 0, problems, checked: registry.size };
    },
    dispose() {
      const freed = { entries: registry.size };
      registry.clear();
      used.clear();
      return freed;
    },
    kitRef: () => kit,
  };
  return api;
}

export default createAssets;
