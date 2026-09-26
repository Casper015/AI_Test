/**
 * materials.js — 材质体系（config 令牌驱动 + 共享缓存 + 自有资源释放边界）
 * =============================================================================
 * 规范来源：docs/STYLE_GUIDE.md §2、config.MATERIALS / COLOR_ROLES / WEATHERING / QUALITY / BUDGET.textures。
 *
 * 三条硬约束（tests/kit.test.mjs 逐条机器校验）：
 *   1) 颜色只能来自 config 令牌：本文件零 `#rrggbb` 字面量；每个材质的解析色必须能在 config 里找到出处。
 *   2) 光泽规范：只有 giltMetal（鎏金 #ffc83b）具备明显金属反射（metalness ≥ 0.9）；
 *      琉璃瓦是"有清漆感的非纯金属"（metalness 小、clearcoat > 0）；
 *      白石/木作 metalness = 0；所有材质 roughness 都加上 WEATHERING.roughnessBias（统一轻度旧化）。
 *   3) 共享缓存：同 id 材质全场一份；dispose() 只释放本库自建的材质与贴图（isOwned 判定），不误伤其它区域。
 *
 * 贴图：程序化生成（DataTexture，非 canvas，Node 内同样可用），**中性灰度细节**——
 *   图案只做明暗调制，颜色始终由材质 color（config 令牌）决定，因此"换季换色"只需改 config。
 *   尺寸取 BUDGET.textures.minSize/maxSize（high→2K，medium/low→1K），物理覆盖尺度由 kit.tileMeters() 给出。
 */

import { THREE } from './three-ref.js';
import { colorOf, colorChain, qualityOf, gradeOf } from './tokens.js';

/** 贴图图案的物理覆盖尺度（米）：能由 config 推导的一律推导，其余按 MODULES.bayPitch 的同一套分数，
 *  以保证全城铺地/石作/木作/砖作的图案尺度一致（STYLE_GUIDE §4「铺地尺度一致」）。 */
function tileMeters(config) {
  const M = config.MODULES;
  return Object.freeze({
    roof: 1 / M.roofTileRowsPerMeter,
    wood: M.bayPitch * 0.5,
    stone: M.bayPitch * 0.25,
    paving: M.bayPitch * 0.5,
    brick: M.bayPitch * 0.5,
    plaster: M.bayPitch,
  });
}

/** 默认贴图边长：高画质取预算上限，其余取预算下限（BUDGET.textures.minSize/maxSize）。 */
export function textureSizeFor(config, quality) {
  return quality === 'high' ? config.BUDGET.textures.maxSize : config.BUDGET.textures.minSize;
}

/** 派生材质表：base = config.MATERIALS 的 id，color = 颜色令牌（或 config 路径）。 */
const DERIVED = Object.freeze([
  { id: 'glazeRidge', base: 'glazeTile', color: 'roofRidge', tile: 'roof' },
  { id: 'plasterRedDark', base: 'plasterRed', color: 'wallShade' },
  { id: 'wallBase', base: 'stoneWhite', color: 'wallBase', tile: 'stone' },
  { id: 'stoneWhiteShade', base: 'stoneWhite', color: 'terraceStoneShade', tile: 'stone' },
  { id: 'pavingLight', base: 'pavingStone', color: 'pavingRoad', tile: 'paving' },
  { id: 'pavingDark', base: 'pavingStone', color: 'pavingDark', tile: 'paving' },
  { id: 'courtyardWallTop', base: 'pavingStone', color: 'courtyardWallTop', tile: 'paving' },
  { id: 'timberDark', base: 'timberLacquer', color: 'timberDark', tile: 'wood' },
  { id: 'foliage', base: 'paintingTeal', color: 'foliage' },
  { id: 'trunk', base: 'timberLacquer', color: { path: ['PLANTS', 'trunkColor'] }, tile: 'wood' },
  { id: 'blossom', base: 'paintingTeal', color: { path: ['PLANTS', 'blossomColor'] } },
  { id: 'waterDeep', base: 'waterSurface', color: { path: ['WATER', 'deepColorRole'], resolve: true } },
  { id: 'lampGlow', base: 'giltMetal', color: { path: ['LIGHTING', 'lamps', 'color'] }, emissive: true },
  { id: 'highlight', base: 'giltMetal', color: { path: ['INTERACTION', 'selection', 'highlightColor'] }, emissive: true },
]);

/** 哪张贴图给哪个材质（除 config.MATERIALS 的语义 role 外，也覆盖派生 id）。 */
const TEXTURE_BY_MATERIAL = Object.freeze({
  glazeTile: 'roof',
  glazeRidge: 'roof',
  timberLacquer: 'wood',
  timberDark: 'wood',
  stoneWhite: 'stone',
  wallBase: 'stone',
  stoneWhiteShade: 'stone',
  pavingStone: 'paving',
  pavingLight: 'paving',
  pavingDark: 'paving',
  courtyardWallTop: 'paving',
  interiorBrick: 'brick',
  plasterRed: 'plaster',
  plasterRedDark: 'plaster',
});

function getPath(object, path) {
  let node = object;
  for (const key of path) {
    if (node === null || node === undefined) return undefined;
    node = node[key];
  }
  return node;
}

/** 颜色 spec → 色值（全部经过 config 令牌解析，任何一步失败即抛错）。 */
function resolveColor(config, spec) {
  if (typeof spec === 'string') return { color: colorOf(config, spec), token: spec, chain: colorChain(config, spec) };
  if (spec && Array.isArray(spec.path)) {
    const raw = getPath(config, spec.path);
    if (raw === undefined) throw new Error(`kit.materials: config 路径 ${spec.path.join('.')} 不存在`);
    const color = spec.resolve ? colorOf(config, raw) : raw;
    if (typeof color !== 'string' || color[0] !== '#') {
      throw new Error(`kit.materials: ${spec.path.join('.')} 不是色值（${String(color)}）`);
    }
    return { color, token: spec.path.join('.'), chain: { token: spec.path.join('.'), role: spec.resolve ? raw : null } };
  }
  throw new Error('kit.materials: 未提供颜色令牌');
}

/* ------------------------------------------------------------------ 程序化贴图 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 值噪声 + fbm（确定性，种子来自 config.SCENE_SEED）。 */
function makeFbm(seed, octaves = 4) {
  const rng = mulberry32(seed);
  const sizes = [];
  let n = 4;
  for (let o = 0; o < octaves; o += 1) {
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i += 1) grid[i] = rng();
    sizes.push({ n, grid });
    n *= 2;
  }
  const sample = (grid, n, x, y) => {
    const fx = x * n;
    const fy = y * n;
    const x0 = Math.floor(fx) % n;
    const y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = grid[y0 * n + x0];
    const b = grid[y0 * n + x1];
    const c = grid[y1 * n + x0];
    const d = grid[y1 * n + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
  return (u, v) => {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < sizes.length; o += 1) {
      sum += sample(sizes[o].grid, sizes[o].n, u, v) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

/** 每张贴图一个图案函数：返回 [0,1] 的明暗（色相一律由材质 color 决定）。 */
function patternFor(name, config, seed) {
  const fbm = makeFbm(seed + name.length * 7919, 4);
  const W = config.WEATHERING;
  const rows = Math.max(4, Math.round(config.MODULES.roofTileRowsPerMeter * 8));
  switch (name) {
    case 'roof':
      return (u, v) => {
        const ridge = Math.abs(((u * rows) % 1) - 0.5) * 2; // 0 中心 1 沟
        const tiles = 1 - 0.28 * ridge ** 2;
        const rowLine = ((v * rows * 1.6) % 1) < 0.08 ? 1 - 0.18 : 1;
        const wear = 1 - W.rainStreak * 0.35 * Math.max(0, v - 0.5) * 2;
        const grain = 1 - W.textureNoiseScale * 0.02 * fbm(u * 3, v * 3);
        return Math.min(1, Math.max(0, tiles * rowLine * wear * grain));
      };
    case 'wood':
      return (u, v) => {
        const rings = Math.abs(Math.sin((u * 6 + fbm(u, v) * 2.2) * Math.PI));
        const grain = 1 - 0.22 * rings;
        const streak = 1 - W.rainStreak * 0.12 * fbm(u * 4, v * 20);
        return Math.min(1, Math.max(0, grain * streak));
      };
    case 'stone':
      return (u, v) => {
        const mottle = fbm(u * 2, v * 2);
        const dirt = W.stoneDiscoloration * (1 - v) * 0.5;
        return Math.min(1, Math.max(0, 1 - 0.14 * mottle - dirt));
      };
    case 'paving':
      return (u, v) => {
        const cells = 3;
        const cx = Math.floor(u * cells);
        const cy = Math.floor(v * cells);
        const jx = Math.abs(((u * cells) % 1) - 0.5) * 2;
        const jy = Math.abs(((v * cells) % 1) - 0.5) * 2;
        const joint = jx > 0.94 || jy > 0.94 ? 1 - 0.3 : 1;
        const slab = 1 - 0.08 * fbm(0.13 + cx * 0.37, 0.29 + cy * 0.41);
        const grain = 1 - W.textureNoiseScale * 0.015 * fbm(u * 5, v * 5);
        return Math.min(1, Math.max(0, joint * slab * grain));
      };
    case 'brick':
      return (u, v) => {
        const rowsN = 8;
        const row = Math.floor(v * rowsN);
        const offset = (row % 2) * 0.5;
        const jy = Math.abs(((v * rowsN) % 1) - 0.5) * 2;
        const jx = Math.abs((((u + offset) * 4) % 1) - 0.5) * 2;
        const joint = jy > 0.93 || jx > 0.93 ? 1 - 0.22 : 1;
        const perBrick = 1 - W.edgeDirt * 0.25 * fbm(((u + offset) * 4) % 1, (v * rowsN) % 1);
        return Math.min(1, Math.max(0, joint * perBrick));
      };
    case 'plaster':
    default:
      return (u, v) => {
        const grime = W.edgeDirt * (1 - v) * 0.35;
        const patch = W.mossAtBase * Math.max(0, 1 - v * 2.2) * 0.5;
        return Math.min(1, Math.max(0, 1 - 0.07 * fbm(u * 3, v * 3) - grime - patch));
      };
  }
}

function makeDataTexture(T, { size, name, config, seed }) {
  if (typeof size !== 'number' || size <= 0) throw new Error(`kit.materials: 贴图尺寸非法 ${String(size)}`);
  const fn = patternFor(name, config, seed);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const l = fn(u, v);
      const i = (y * size + x) * 4;
      const c = Math.max(0, Math.min(255, Math.round(l * 255)));
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
  tex.name = `kit-tex-${name}`;
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.anisotropy = 1; // 由渲染器按质量档覆盖（config.QUALITY.tiers[*].textureAnisotropy）
  tex.needsUpdate = true;
  tex.userData.kitOwned = true;
  tex.userData.pattern = name;
  return tex;
}

/** COLOR_ROLES 语义角色 → 具体材质 id（同一色系复用同一材质实例，保证"一份资源只留一份"）。 */
const ROLE_MATERIAL = Object.freeze({
  roofPrimary: 'glazeTile',
  roofSecondary: 'glazeTile',
  roofRidge: 'glazeRidge',
  wallPrimary: 'plasterRed',
  wallShade: 'plasterRedDark',
  wallBase: 'wallBase',
  structurePrimary: 'plasterRed',
  structureSecondary: 'paintingTeal',
  beamPainting: 'paintingTeal',
  timberFrame: 'timberLacquer',
  terraceStone: 'stoneWhite',
  terraceStoneShade: 'stoneWhiteShade',
  balustrade: 'stoneWhite',
  pavingPlaza: 'pavingStone',
  pavingRoad: 'pavingLight',
  pavingInterior: 'interiorBrick',
  metalGilt: 'giltMetal',
  courtyardWall: 'plasterRed',
  courtyardWallTop: 'courtyardWallTop',
  water: 'waterSurface',
  foliage: 'foliage',
});

/* ------------------------------------------------------------------ 主入口 */

/**
 * 创建共享材质库。
 * @param {object} args { THREE, config, quality, textureSizeOverride, anisotropy }
 */
export function createMaterials({ THREE: T = THREE, config, quality = config.QUALITY.default, textureSizeOverride = null, anisotropy = null }) {
  const tier = qualityOf(config, quality);
  const textures = new Map();
  const materials = new Map();
  const owned = new Set();
  const ownedTextures = new Set();
  const diagnostics = [];
  const tiles = tileMeters(config);
  const seededSize = textureSizeFor(config, quality);
  const size = textureSizeOverride ?? seededSize;

  if (textureSizeOverride !== null && textureSizeOverride < config.BUDGET.textures.minSize) {
    diagnostics.push({
      code: 'texture-size-override',
      message: `贴图尺寸被覆盖为 ${textureSizeOverride}（默认 ${seededSize}，预算区间 ${config.BUDGET.textures.minSize}–${config.BUDGET.textures.maxSize}）；该开关只供 Node 自测提速，不进入运行时路径`,
    });
  }

  const textureFor = (pattern) => {
    if (!textures.has(pattern)) {
      const tex = makeDataTexture(T, { size, name: pattern, config, seed: config.SCENE_SEED });
      if (anisotropy !== null) tex.anisotropy = anisotropy;
      else tex.anisotropy = tier.textureAnisotropy;
      textures.set(pattern, tex);
      ownedTextures.add(tex);
    }
    return textures.get(pattern);
  };

  const build = (id, spec, colorSpec, tileKey) => {
    const { color, token, chain } = resolveColor(config, colorSpec);
    const isWater = spec.id === 'waterSurface';
    const material = new T.MeshPhysicalMaterial({
      name: `kit-mat-${id}`,
      color: new T.Color(color),
      roughness: Math.min(1, spec.roughness + config.WEATHERING.roughnessBias),
      metalness: spec.metalness,
      clearcoat: spec.clearcoat,
      clearcoatRoughness: Math.max(0, Math.min(1, spec.clearcoatRoughness ?? 0.5)),
      envMapIntensity: spec.envMapIntensity,
      side: T.FrontSide,
      transparent: isWater,
      opacity: isWater ? config.WATER.opacity : 1,
      depthWrite: !isWater,
    });
    if (isWater) {
      material.roughness = config.WATER.roughness + config.WEATHERING.roughnessBias * 0; // 水面不加重旧化
      material.metalness = 0;
      if (quality === 'high' && typeof spec.transmission === 'number') material.transmission = spec.transmission;
    }
    if (spec.id === 'lampGlow' || spec.id === 'highlight') {
      material.emissive = new T.Color(color);
      material.emissiveIntensity = 1;
      material.metalness = spec.metalness;
      material.roughness = spec.roughness;
    }
    if (tileKey && TEXTURE_BY_MATERIAL[id]) {
      material.map = textureFor(TEXTURE_BY_MATERIAL[id]);
    }
    material.userData.kitOwned = true;
    material.userData.tokens = {
      material: spec.id,
      colorRole: chain.role ?? token,
      colorToken: token,
      resolvedColor: color,
      wear: spec.wear,
      weathering: config.WEATHERING.globalAmount,
    };
    owned.add(material);
    return material;
  };

  // 1) config.MATERIALS 逐条生成（id 与 colorRole 两个键都可用）
  for (const [id, spec] of Object.entries(config.MATERIALS)) {
    const material = build(id, spec, spec.colorRole, true);
    materials.set(id, material);
    materials.set(spec.colorRole, material);
  }
  // 2) 派生材质（同色系/同语言，不引入新颜色）
  for (const entry of DERIVED) {
    const base = config.MATERIALS[entry.base];
    if (!base) throw new Error(`kit.materials: 派生材质 ${entry.id} 的基材质 ${entry.base} 不存在`);
    const spec = { ...base, id: entry.id };
    const material = build(entry.id, spec, entry.color, true);
    materials.set(entry.id, material);
  }

  // 3) COLOR_ROLES 全部语义角色（CONTRACTS §3.4：kit.materials[role] 必须可用）
  for (const [role, matId] of Object.entries(ROLE_MATERIAL)) {
    if (!Object.prototype.hasOwnProperty.call(config.COLOR_ROLES, role)) continue;
    const material = materials.get(matId);
    if (!material) throw new Error(`kit.materials: 角色 ${role} 指向的材质 ${matId} 不存在`);
    materials.set(role, material);
  }
  for (const role of Object.keys(config.COLOR_ROLES)) {
    if (!materials.has(role)) throw new Error(`kit.materials: COLOR_ROLES 角色 ${role} 没有对应材质（不得漏配）`);
  }

  const lib = {
    /** 全部材质（按 id 与 colorRole 双键索引的同一个对象）。 */
    map: materials,
    textures,
    quality,
    tier,
    /** 贴图图案的物理覆盖尺度（米），几何生成时用它把 UV 换算成米制。 */
    tileMeters: (materialName) => {
      const key = TEXTURE_BY_MATERIAL[materialName] ?? materialName;
      return tiles[key] ?? 1;
    },
    /** 预算内的贴图边长（默认值，供测试断言）。 */
    textureSize: size,
    defaultTextureSize: seededSize,
    get(name) {
      const m = materials.get(name);
      if (!m) throw new Error(`kit.materials: 未知材质 ${String(name)}（可用：${[...new Set(materials.keys())].join(', ')}）`);
      return m;
    },
    has: (name) => materials.has(name),
    /** 颜色令牌 → 色值（区域作者不该自己写 hex）。 */
    color: (token) => colorOf(config, token),
    isOwned: (material) => owned.has(material) || ownedTextures.has(material),
    stats() {
      let bytes = 0;
      for (const tex of textures.values()) bytes += tex.image.width * tex.image.height * 4;
      return {
        materials: owned.size,
        textures: textures.size,
        textureSize: size,
        textureBytes: bytes,
        textureMB: +(bytes / 1048576).toFixed(2),
        maxTextureMemoryMB: config.BUDGET.textures.maxTextureMemoryMB,
      };
    },
    diagnostics,
    /** 只释放本库自建的材质与贴图；外部（区域自建）资源不动。 */
    dispose() {
      for (const tex of ownedTextures) tex.dispose();
      for (const mat of owned) mat.dispose();
      const freed = { materials: owned.size, textures: ownedTextures.size };
      owned.clear();
      ownedTextures.clear();
      textures.clear();
      materials.clear();
      return freed;
    },
  };

  // 便捷属性访问：kit.materials.roofPrimary / kit.materials.glazeTile
  for (const [key, mat] of materials) {
    Object.defineProperty(lib, key, { value: mat, enumerable: false, configurable: true });
  }
  return lib;
}

export { tileMeters, resolveColor as resolveMaterialColor, gradeOf };
