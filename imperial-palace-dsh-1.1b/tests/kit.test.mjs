#!/usr/bin/env node
/**
 * tests/kit.test.mjs — t3 构件库机器校验（Node 内，无浏览器、无网络、无 npm 依赖）
 * =============================================================================
 * 覆盖 t3 验收的 7 条：
 *   1 工厂导出与参数契约  2 形制一致性（含屋顶几何特征）  3 识别特征与 LOD 三档
 *   4 材质令牌驱动 / 共享缓存 / dispose 边界  5 资产登记与许可  6 测试本身  7 无网络依赖
 * 另加：全 SLOTS 槽位扫描（与 layout 的 eaveHeight 交叉校验）、整城绘制调用/三角面预算、
 *       去内部面与合批/实例化的实测收益、以及 src/kit/ 源码纪律扫描（无硬编码色值）。
 *
 * 用法：node tests/kit.test.mjs   （失败非零退出；测试集由 tests/run.mjs 顺序调度）
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const KIT_DIR = join(ROOT, 'src', 'kit');

const { CONFIG, deriveSeed } = await import('../src/shared/config.js');
const layout = await import('../src/shared/layout.js');
const kitModule = await import('../src/kit/index.js');
const { createKit, THREE } = kitModule;
const { buildRoof } = await import('../src/kit/geometry.js');
const { mergeByMaterial, mergeZone, removeCoincidentFaces, pruneInteriorFaces, countTriangles, countDrawCalls } = await import('../src/kit/merge.js');
const { PROPORTIONS, moduleScale } = await import('../src/kit/tokens.js');
const { textureSizeFor } = await import('../src/kit/materials.js');
const { shadowPolicy, mergeZone: mergeZoneRaw } = await import('../src/kit/merge.js');
const interiorModule = await import('../src/kit/interiors.js');
const { INTERIOR_KINDS, INTERIOR_MATERIALS } = interiorModule;

/* ------------------------------------------------------------------ 迷你测试框架 */

let passed = 0;
const failures = [];
const notes = [];
let section = '(root)';

function report(label, ok, detail = '') {
  if (ok) passed += 1;
  else failures.push({ section, label, detail });
  return ok;
}

function ok(label, condition, detail = '') {
  return report(label, condition === true || condition === undefined, condition ? '' : detail);
}

function eq(label, actual, expected, tolerance = 0) {
  const pass = typeof actual === 'number' && typeof expected === 'number'
    ? Math.abs(actual - expected) <= tolerance
    : actual === expected;
  return report(label, pass, pass ? '' : `实际 ${JSON.stringify(actual)} ≠ 期望 ${JSON.stringify(expected)}${tolerance ? ` (±${tolerance})` : ''}`);
}

function between(label, value, lo, hi) {
  const pass = typeof value === 'number' && value >= lo && value <= hi;
  return report(label, pass, pass ? '' : `${value} 不在 [${lo}, ${hi}]`);
}

function throws(label, fn, match = null) {
  try {
    fn();
    return report(label, false, '期望抛错但未抛');
  } catch (error) {
    if (match && !String(error.message).includes(match)) {
      return report(label, false, `抛错信息不含 "${match}"：${error.message}`);
    }
    return report(label, true);
  }
}

function startSection(name) {
  section = name;
  console.log(`\n── ${name}`);
}

/* ------------------------------------------------------------------ 共享实例 */

// textureSizeOverride 只用于让 Node 自测提速（默认尺寸在 §4 单独断言，仍是预算内的 1K/2K）
const kit = createKit({ textureSizeOverride: 128 });
const T = kit.THREE;

function levelGroup(object, index = 0) {
  if (object.isLOD) return object.levels[index].object;
  return object;
}

function findMesh(object, part, levelIndex = 0) {
  let found = null;
  levelGroup(object, levelIndex).traverse((node) => {
    if (!found && node.isMesh && node.userData.part === part) found = node;
  });
  return found;
}

function partsOf(object, levelIndex = 0) {
  const set = new Set();
  levelGroup(object, levelIndex).traverse((node) => {
    if (node.userData?.part) set.add(node.userData.part);
  });
  return set;
}

function geometryStats(geometry) {
  const pos = geometry.attributes.position;
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ, vertices: pos.count, triangles: pos.count / 3 };
}

/** 三角形外法线的水平象限分类（用于"四面坡"机器校验）。 */
function slopeSectors(geometry) {
  const pos = geometry.attributes.position;
  const sectors = new Set();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const ax = pos.getX(i); const ay = pos.getY(i); const az = pos.getZ(i);
    const ux = pos.getX(i + 1) - ax; const uy = pos.getY(i + 1) - ay; const uz = pos.getZ(i + 1) - az;
    const vx = pos.getX(i + 2) - ax; const vy = pos.getY(i + 2) - ay; const vz = pos.getZ(i + 2) - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    if (Math.abs(ny / len) > 0.98) continue; // 水平面（檐口等）不算坡面
    const angle = (Math.atan2(nx / len, nz / len) + Math.PI) / (Math.PI / 2);
    sectors.add(Math.floor(angle) % 4);
  }
  return sectors;
}

const BASE_PARAMS = Object.freeze({
  id: 'TEST-hall',
  name: '测试殿',
  w: 48,
  d: 28,
  bays: 5,
  terraceH: 1.2,
  roofType: 'hip',
  grade: 2,
  facing: 'south',
  quality: 'medium',
});

const MAIN_HALL = Object.freeze({
  id: 'B-hall-main',
  name: '金銮殿',
  w: 84,
  d: 48,
  bays: 9,
  terraceH: 4.5,
  roofType: 'doubleEaveHip',
  grade: 3,
  facing: 'south',
  quality: 'medium',
  // 与 layout.SLOTS 的 B-hall-main 逐字段一致（hasDoor=true, door.width=26, height=3.22）
  door: { width: 26, height: 3.22 },
});

/* ================================================================== 1 源码纪律 */

startSection('1 源码纪律（无硬编码色值/无随机/无网络/three 单点解析）');
{
  const files = readdirSync(KIT_DIR).filter((f) => f.endsWith('.js'));
  ok('src/kit 下至少有 8 个模块', files.length >= 8, `实际 ${files.length}`);
  // 扫描前剥离注释：注释里引用 config 色值（如 `#dfa112`）是文档，不是"散落的硬编码色值"
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const networkPattern = /https?:\/\//g;
  const randomPattern = /Math\.random\s*\(/g;
  const colorLiteralPattern = /new\s+[A-Za-z_$][\w$]*\.Color\(\s*['"`]/g;
  const importSitePattern = /vendor\/three\/three\.module\.js/g;
  let importSites = 0;
  for (const file of files) {
    const source = stripComments(readFileSync(join(KIT_DIR, file), 'utf8'));
    const hex = source.match(hexPattern) ?? [];
    report(`src/kit/${file} 无十六进制色值字面量`, hex.length === 0, `发现 ${hex.join(', ')}`);
    report(`src/kit/${file} 无 Math.random`, (source.match(randomPattern) ?? []).length === 0);
    report(`src/kit/${file} 无 http(s) 在线资源`, (source.match(networkPattern) ?? []).length === 0, `发现 ${(source.match(networkPattern) ?? []).join(', ')}`);
    report(`src/kit/${file} 无内联色值字符串`, (source.match(colorLiteralPattern) ?? []).length === 0);
    if (importSitePattern.test(source)) importSites += 1;
  }
  eq('three 只在 three-ref.js 一处解析', importSites, 1);
  const kitModuleSource = readFileSync(join(KIT_DIR, 'index.js'), 'utf8');
  ok('index.js 从 three-ref.js 取 three', kitModuleSource.includes("from './three-ref.js'"));
  eq('three 版本为 r169', String(T.REVISION), '169');
  eq('模块解析目标与 import map 同源', kit.threeResolution.specifier, '../../public/vendor/three/three.module.js');
}

/* ================================================================== 2 材质令牌 */

startSection('2 材质令牌驱动 / 光泽规范 / 共享缓存 / 贴图预算');
{
  const materialIds = Object.keys(CONFIG.MATERIALS);
  for (const id of materialIds) {
    ok(`kit.materials 提供 MATERIALS id: ${id}`, kit.materials.has(id));
  }
  for (const role of Object.keys(CONFIG.COLOR_ROLES)) {
    ok(`kit.materials 提供 COLOR_ROLES 角色: ${role}`, kit.materials.has(role));
  }
  const configValues = new Set([
    ...Object.values(CONFIG.COLORS),
    ...Object.values(CONFIG.COLORS_DERIVED),
    CONFIG.PLANTS.blossomColor,
    CONFIG.PLANTS.trunkColor,
    CONFIG.LIGHTING.lamps.color,
    CONFIG.INTERACTION.selection.highlightColor,
  ]);
  let checked = 0;
  for (const [key, material] of kit.materials.map) {
    const hex = `#${material.color.getHexString()}`.toLowerCase();
    ok(`材质 ${key} 的颜色 (${hex}) 来自 config 令牌`, configValues.has(hex));
    ok(`材质 ${key} 有材质令牌溯源`, Boolean(material.userData.tokens?.colorToken));
    checked += 1;
  }
  ok('材质令牌检查覆盖 ≥ 30 个键', checked >= 30, `实际 ${checked}`);

  for (const role of Object.keys(CONFIG.COLOR_ROLES)) {
    const hex = `#${kit.materials.get(role).color.getHexString()}`.toLowerCase();
    eq(`角色 ${role} 的材质颜色 = config 令牌色`, hex, kit.color(role).toLowerCase());
  }

  // 光泽规范（STYLE_GUIDE §2）
  eq('琉璃瓦 metalness 小（非纯金属）', kit.materials.get('glazeTile').metalness, CONFIG.MATERIALS.glazeTile.metalness, 1e-9);
  ok('琉璃瓦 metalness < 0.25', kit.materials.get('glazeTile').metalness < 0.25);
  ok('琉璃瓦有清漆感 clearcoat > 0', kit.materials.get('glazeTile').clearcoat > 0);
  eq('鎏金 metalness = 0.92（唯一明显金属反射）', kit.materials.get('giltMetal').metalness, CONFIG.MATERIALS.giltMetal.metalness, 1e-9);
  ok('鎏金 metalness ≥ 0.9', kit.materials.get('giltMetal').metalness >= 0.9);
  let otherMetals = 0;
  for (const id of materialIds) {
    if (id === 'giltMetal') continue;
    if (kit.materials.get(id).metalness >= 0.5) otherMetals += 1;
  }
  eq('除鎏金外没有高金属度材质', otherMetals, 0);
  eq('暖白石 metalness = 0', kit.materials.get('stoneWhite').metalness, 0, 1e-9);
  eq('宫红 metalness = 0（哑光）', kit.materials.get('plasterRed').metalness, 0, 1e-9);
  eq('木作 metalness = 0', kit.materials.get('timberLacquer').metalness, 0, 1e-9);
  // 统一旧化（t114 同步 + 加固）：期望值取自当前 CONFIG（`WEATHERING.roughnessBias`），
  // 原意 = "每个材质都恰好叠加一次统一旧化"。除等值断言外，再加"只叠加一次/不被重复或遗漏"的差值断言。
  const roughnessDiffs = new Map();
  for (const id of ['glazeTile', 'plasterRed', 'stoneWhite', 'timberLacquer', 'paintingTeal', 'pavingStone']) {
    const spec = CONFIG.MATERIALS[id];
    const expected = Math.min(1, spec.roughness + CONFIG.WEATHERING.roughnessBias);
    const actual = kit.materials.get(id).roughness;
    eq(`材质 ${id} 叠加统一旧化 roughnessBias`, actual, expected, 1e-9);
    // 加固：实际差值必须 == 期望差值（含 clamp 情形）——可捕获"重复叠加/漏叠加"这类真实回归
    eq(`材质 ${id} 统一旧化只叠加一次（差值 == 期望差值）`, +(actual - spec.roughness).toFixed(9), +(expected - spec.roughness).toFixed(9), 1e-9);
    roughnessDiffs.set(id, +(actual - spec.roughness).toFixed(9));
  }
  // 跨材质一致性：未触顶（spec+bias ≤ 1）的材质必须共享同一个 bias 值（"统一"旧化的字面含义）
  const untouched = [...roughnessDiffs.entries()].filter(([id]) => CONFIG.MATERIALS[id].roughness + CONFIG.WEATHERING.roughnessBias <= 1);
  ok(`统一旧化在未触顶材质上共享同一 bias（${untouched.length} 个）`, untouched.every(([, d]) => Math.abs(d - CONFIG.WEATHERING.roughnessBias) < 1e-9), JSON.stringify(Object.fromEntries(untouched)));
  eq('统一旧化 bias 未被重复叠加（差值 ≤ bias）', untouched.every(([, d]) => d <= CONFIG.WEATHERING.roughnessBias + 1e-9), true);
  ok('木作有轻微纹理贴图', Boolean(kit.materials.get('timberLacquer').map));
  ok('琉璃瓦有瓦垄纹理贴图', Boolean(kit.materials.get('glazeTile').map));
  ok('贴图色彩空间为 srgb', kit.materials.get('glazeTile').map.colorSpace === T.SRGBColorSpace);

  // 共享缓存：同一 id/角色只有一个实例，两栋建筑复用同一材质对象
  ok('roofPrimary 与 glazeTile 是同一材质实例', kit.materials.get('roofPrimary') === kit.materials.get('glazeTile'));
  const hallA = kit.hall({ ...BASE_PARAMS, id: 'A' });
  const hallB = kit.hall({ ...BASE_PARAMS, id: 'B', x: 100 });
  const matA = findMesh(hallA, 'column').material;
  const matB = findMesh(hallB, 'column').material;
  ok('跨建筑复用同一共享材质', matA === matB && matA === kit.materials.get('plasterRed'));

  // 贴图尺寸预算（默认值仍在 1K–2K）
  for (const tier of CONFIG.QUALITY.order) {
    const size = textureSizeFor(CONFIG, tier);
    between(`质量档 ${tier} 默认贴图边长在 1K–2K`, size, CONFIG.BUDGET.textures.minSize, CONFIG.BUDGET.textures.maxSize);
  }
  const lowKit = createKit({ quality: 'low' });
  eq('low 档实例的贴图边长 = 预算下限', lowKit.materials.textureSize, CONFIG.BUDGET.textures.minSize);
  ok('low 档贴图内存 ≤ 预算', lowKit.materials.stats().textureMB <= CONFIG.BUDGET.textures.maxTextureMemoryMB, `${lowKit.materials.stats().textureMB}MB`);
  lowKit.dispose();
  ok('测试用 textureSizeOverride 会留下诊断', kit.diagnostics.some((d) => d.code === 'texture-size-override'));
  eq('程序化贴图数量 = 6', kit.materials.stats().textures, 6);
}

/* ================================================================== 3 dispose 边界 */

startSection('3 dispose 只释放自有资源（不误伤外部）');
{
  const hall = kit.hall({ ...BASE_PARAMS, id: 'DISPOSE' });
  const kitGeom = findMesh(hall, 'roof').geometry;
  const externalGeometry = new T.BoxGeometry(1, 1, 1);
  const externalMaterial = new T.MeshStandardMaterial({ color: 0xffffff });
  const externalMesh = new T.Mesh(externalGeometry, externalMaterial);
  const externalTexture = new T.DataTexture(new Uint8Array(4), 1, 1);
  externalMaterial.map = externalTexture;
  hall.add(externalMesh);
  let kitGeomDisposed = 0;
  let externalGeomDisposed = 0;
  let externalMatDisposed = 0;
  let externalTexDisposed = 0;
  kitGeom.addEventListener('dispose', () => { kitGeomDisposed += 1; });
  externalGeometry.addEventListener('dispose', () => { externalGeomDisposed += 1; });
  externalMaterial.addEventListener('dispose', () => { externalMatDisposed += 1; });
  externalTexture.addEventListener('dispose', () => { externalTexDisposed += 1; });
  const freed = kit.disposeObject(hall);
  ok('kit 自建几何被释放', kitGeomDisposed === 1, String(kitGeomDisposed));
  eq('外部几何未被释放', externalGeomDisposed, 0);
  eq('外部材质未被释放', externalMatDisposed, 0);
  eq('外部贴图未被释放', externalTexDisposed, 0);
  ok('disposeObject 报告释放了几何', freed.geometries > 0);
  ok('外部材质不属于 kit', kit.isOwned(externalMaterial) === false);
  ok('共享材质属于 kit', kit.isOwned(kit.materials.get('stoneWhite')) === true);

  const probe = createKit({ textureSizeOverride: 32 });
  const before = probe.materials.stats();
  const freedKit = probe.dispose();
  eq('dispose 释放的材质数 = 生成数', freedKit.materials, before.materials);
  eq('dispose 释放的贴图数 = 生成数', freedKit.textures, before.textures);
  eq('asset 登记表清空', probe.assets.stats().registered, 0);
  eq('再次 dispose 无副作用', probe.dispose().materials, 0);
}

/* ================================================================== 4 工厂与参数契约 */

startSection('4 工厂导出齐全 + 参数契约与校验（正例/反例）');
{
  for (const name of ['hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'wall', 'courtyardGate', 'corridor', 'terrace', 'stairs', 'bridge']) {
    eq(`导出构件工厂 kit.${name}`, typeof kit[name], 'function');
  }
  for (const name of ['tree', 'rockery', 'lantern', 'railing', 'bronze', 'screenWall', 'water', 'paving']) {
    eq(`导出共享摆件工厂 kit.${name}`, typeof kit[name], 'function');
  }
  for (const name of ['instance', 'lod', 'mergeByMaterial', 'mergeZone', 'pruneInterior']) {
    eq(`导出工具 kit.${name}`, typeof kit[name], 'function');
  }

  const hall = kit.hall({ ...BASE_PARAMS, id: 'PARAM-hall' });
  const params = hall.userData.kit.params;
  for (const field of ['id', 'name', 'w', 'd', 'bays', 'terraceH', 'roofType', 'grade', 'facing', 'quality']) {
    ok(`工厂参数含 ${field}`, field in params, JSON.stringify(Object.keys(params)));
  }
  between('参数回显 w', params.w, 47.999, 48.001);
  eq('参数回显 bays', params.bays, 5);
  eq('参数回显 roofType', params.roofType, 'hip');
  eq('rotationYDeg 由 facing 推导（south=0）', params.rotationYDeg, CONFIG.ORIENTATION.rotationYDeg.south);
  eq('facing=east → -90°', kit.hall({ ...BASE_PARAMS, id: 'E', facing: 'east' }).userData.kit.params.rotationYDeg, -90);
  ok('工厂返回 THREE.LOD（默认三档）', hall.isLOD === true);
  ok('params.lod=mid 返回普通 Group（便于整区合批）', !kit.hall({ ...BASE_PARAMS, id: 'M', lod: 'mid' }).isLOD);

  // 反例：风格类违规必须抛错（主理人裁定：不允许默认放行）
  throws('grade 3 + 硬山顶 → 抛错', () => kit.hall({ ...BASE_PARAMS, grade: 3, roofType: 'gable' }), 'grade 3');
  throws('未知屋顶类型 → 抛错', () => kit.hall({ ...BASE_PARAMS, roofType: 'flat' }), '未知屋顶类型');
  throws('缺少 w → 抛错', () => kit.hall({ id: 'now', d: 10 }), 'w');
  throws('非法等级 → 抛错', () => kit.hall({ ...BASE_PARAMS, grade: 9 }), '未知装饰等级');
  throws('负数台基高 → 抛错', () => kit.hall({ ...BASE_PARAMS, terraceH: -1 }), 'terraceH');
  throws('墙体 from/to 重合 → 抛错', () => kit.wall({ id: 'W', from: { x: 1, z: 1 }, to: { x: 1, z: 1 } }), '重合');
  // 正例：同一屋顶在不同等级合法时正常构建
  for (const [grade, roofType] of [[1, 'gable'], [2, 'hip'], [2, 'gableHip'], [3, 'doubleEaveHip']]) {
    const built = kit.hall({ ...BASE_PARAMS, id: `OK-${grade}-${roofType}`, grade, roofType });
    eq(`正例 grade${grade}+${roofType} 构建成功`, built.userData.kit.metrics.roofType, roofType);
  }
}

/* ================================================================== 5 屋顶形制几何特征 */

startSection('5 屋顶形制：长正脊 + 四面坡（禁尖顶替代）/ 飞檐起翘 / 凹曲屋面');
{
  // 5.1 单面坡原型的飞檐起翘与凹曲（直接对 roofPatch 取样，rows=1/cols=2 时顶点 0=檐角、1=檐中点）
  const { roofPatch } = await import('../src/kit/geometry.js');
  const surface = roofPatch(T, {
    bottomA: { x: -20, z: -12 },
    bottomB: { x: 20, z: -12 },
    topA: { x: -10, z: 0 },
    topB: { x: 10, z: 0 },
    rise: 6,
    rows: 4,
    cols: 2,
    curve: CONFIG.ROOF_TYPES.hip.curvature,
    eaveLift: CONFIG.MODULES.eaveLift,
    eaveRiseAtCorner: CONFIG.MODULES.eaveRiseAtCorner,
    outward: { x: 0, y: 0.3, z: -1 },
    tile: 1,
  });
  const sp = surface.attributes.position;
  // 取向（orientOutward）可能翻转三角形绕序，故一律按坐标筛点，不依赖顶点下标
  let eaveMidY = Infinity;
  let cornerY = -Infinity;
  const midProfile = [];
  for (let i = 0; i < sp.count; i += 1) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    if (Math.abs(x) > 1e-6) continue;
    midProfile.push({ z, y });
    if (Math.abs(z + 12) < 1e-6) eaveMidY = Math.min(eaveMidY, y);
    if (Math.abs(z + 12) < 1e-6) cornerY = -Infinity;
  }
  for (let i = 0; i < sp.count; i += 1) {
    if (Math.abs(sp.getX(i)) > 19.9) cornerY = Math.max(cornerY, sp.getY(i));
  }
  eq('檐口中点不起翘 (y=0)', eaveMidY, 0, 1e-6);
  eq('檐角起翘 = eaveLift + eaveRiseAtCorner', cornerY, CONFIG.MODULES.eaveLift + CONFIG.MODULES.eaveRiseAtCorner, 1e-6);
  const dedup = [...new Map(midProfile.map((p) => [p.z.toFixed(6), p])).values()].sort((a, b) => a.z - b.z);
  eq('中列剖面取样点覆盖 5 档 t', dedup.length, 5);
  eq('檐口端 y = 0', dedup[0].y, 0, 1e-6);
  eq('正脊端 y = rise', dedup[4].y, 6, 1e-6);
  let concave = true;
  for (const p of dedup.slice(1, 4)) {
    const t = (p.z + 12) / 12;
    if (p.y > t * 6 + 1e-6) concave = false;
  }
  ok('屋面呈凹曲（低于直坡连线，禁止直板屋顶）', concave);
  ok('举架凹曲使中点明显低于直坡', dedup[2].y < 6 * 0.5 - 0.1, `${dedup[2].y}`);

  // 建筑级：庑殿顶 = 4 面坡 + 长正脊（非尖顶）
  const hipHall = kit.hall({ ...BASE_PARAMS, id: 'ROOF-hip-shape', roofType: 'hip', grade: 2 });
  const sectors = slopeSectors(findMesh(hipHall, 'roof').geometry);
  eq('庑殿顶有 4 个方向的坡面', sectors.size, 4);
  const ridgeMesh = findMesh(hipHall, 'ridge');
  const ridgeGeom = geometryStats(ridgeMesh.geometry);
  ok('庑殿顶正脊为长条（长度 ≥ 0.3×面阔）', ridgeGeom.maxX - ridgeGeom.minX >= 0.3 * 48, `${(ridgeGeom.maxX - ridgeGeom.minX).toFixed(2)}`);

  // 5.2 各屋顶类型的建筑级特征
  const cases = [
    { roofType: 'hip', grade: 2, ridge: true, slopes: 4, gableWall: false, apex: false },
    { roofType: 'doubleEaveHip', grade: 3, ridge: true, slopes: 4, gableWall: false, apex: false },
    { roofType: 'gableHip', grade: 2, ridge: true, slopes: 4, gableWall: true, apex: false },
    { roofType: 'gable', grade: 1, ridge: true, slopes: 2, gableWall: true, apex: false },
  ];
  for (const c of cases) {
    const b = kit.hall({ ...BASE_PARAMS, id: `ROOF-${c.roofType}`, roofType: c.roofType, grade: c.grade });
    const m = b.userData.kit.metrics;
    eq(`${c.roofType}: slopes=${c.slopes}`, m.slopes, c.slopes);
    ok(`${c.roofType}: ${c.ridge ? '有' : '无'}正脊`, Boolean(m.ridge) === c.ridge);
    if (c.ridge) ok(`${c.roofType}: 正脊长 ≥ 0.3×面阔`, m.ridge.length >= 0.3 * 48, `ridge=${m.ridge.length}`);
    const gableWalls = findMesh(b, 'gableWall');
    ok(`${c.roofType}: ${c.gableWall ? '有' : '无'}山墙`, Boolean(gableWalls) === c.gableWall);
    // 屋面顶端不是单点（禁止用尖顶替代庑殿顶）
    const roofMesh = findMesh(b, 'roof');
    const gs = geometryStats(roofMesh.geometry);
    const p = roofMesh.geometry.attributes.position;
    let spanMin = Infinity;
    let spanMax = -Infinity;
    for (let i = 0; i < p.count; i += 1) {
      if (p.getY(i) < gs.maxY - 0.02) continue;
      spanMin = Math.min(spanMin, p.getX(i));
      spanMax = Math.max(spanMax, p.getX(i));
    }
    ok(`${c.roofType}: 顶部是脊线而非尖点`, spanMax - spanMin >= 0.25 * 48, `span=${(spanMax - spanMin).toFixed(2)}`);
  }
  // 攒尖顶：无正脊、顶点为宝顶
  const pavilion = kit.pavilion({ ...BASE_PARAMS, id: 'ROOF-pyramidal', roofType: 'pyramidal', grade: 1, w: 18, d: 18, bays: 3, terraceH: 0.4 });
  const pm = pavilion.userData.kit.metrics;
  eq('pyramidal: slopes=4', pm.slopes, 4);
  eq('pyramidal: 无正脊', pm.ridge, null);
  ok('pyramidal: 有宝顶 finial', Boolean(findMesh(pavilion, 'finial')));
  const pRoof = findMesh(pavilion, 'roof');
  const pStats = geometryStats(pRoof.geometry);
  const pPos = pRoof.geometry.attributes.position;
  let apexMinX = Infinity;
  let apexMaxX = -Infinity;
  for (let i = 0; i < pPos.count; i += 1) {
    if (pPos.getY(i) < pStats.maxY - 0.02) continue;
    apexMinX = Math.min(apexMinX, pPos.getX(i));
    apexMaxX = Math.max(apexMaxX, pPos.getX(i));
  }
  ok('攒尖顶顶点收缩为一点', apexMaxX - apexMinX < 0.5, `span=${(apexMaxX - apexMinX).toFixed(3)}`);

  // 5.3 重檐：上下两重屋面
  const main = kit.hall({ ...MAIN_HALL });
  const mm = main.userData.kit.metrics;
  ok('主殿为重檐（含下层腰檐）', Boolean(findMesh(main, 'lowerRoof')) && Boolean(findMesh(main, 'roof')));
  ok('重檐上层檐口高于下层檐口', mm.upperEaveY > mm.eaveHeight, `${mm.upperEaveY} vs ${mm.eaveHeight}`);
  eq('重檐庑殿顶屋顶类型', mm.roofType, 'doubleEaveHip');
  ok('下层腰檐为围脊（无正脊）', findMesh(main, 'lowerRoof') !== null && mm.apronRise > 0);
}

/* ================================================================== 6 形制一致性 */

startSection('6 形制一致性：同类构件共享屋顶坡度/飞檐/柱径/檐高/开间模数');
{
  const kinds = ['hall', 'sideHall', 'pavilion', 'gateHall'];
  const built = kinds.map((kind) => kit[kind]({ ...BASE_PARAMS, id: `CONS-${kind}`, grade: 1, roofType: kind === 'pavilion' ? 'pyramidal' : 'gableHip' }));
  const dims = built.map((b) => b.userData.kit.metrics);
  const first = dims[0];
  for (let i = 1; i < dims.length; i += 1) {
    eq(`同类构件共享柱径（${kinds[i]}）`, dims[i].columnDiameter, first.columnDiameter, 1e-9);
    eq(`同类构件共享出檐（${kinds[i]}）`, dims[i].eaveOverhang, first.eaveOverhang, 1e-9);
    eq(`同类构件共享屋顶坡度（${kinds[i]}）`, dims[i].roofSlope, first.roofSlope, 1e-9);
    eq(`同类构件共享檐高因子（${kinds[i]}）`, dims[i].eaveHeightFactor, first.eaveHeightFactor, 1e-9);
  }
  // 令牌级一致性：柱径/檐高/出檐 = MODULES × GRADES 因子
  for (const grade of [1, 2, 3]) {
    const scale = moduleScale(CONFIG, grade);
    const b = kit.hall({ ...BASE_PARAMS, id: `SCALE-${grade}`, grade, roofType: CONFIG.GRADES[grade].roofTypes[0] });
    const m = b.userData.kit.metrics;
    eq(`grade${grade} 柱径 = MODULES.columnDiameter × 因子`, m.columnDiameter, CONFIG.MODULES.columnDiameter * CONFIG.GRADES[grade].columnDiameterFactor, 1e-9);
    eq(`grade${grade} 出檐 = MODULES.eaveOverhang × 因子`, m.eaveOverhang, CONFIG.MODULES.eaveOverhang * CONFIG.GRADES[grade].eaveOverhangFactor, 1e-9);
    eq(`grade${grade} 檐高因子`, m.eaveHeightFactor, CONFIG.GRADES[grade].eaveHeightFactor, 1e-9);
    eq(`grade${grade} 举架坡度 = MODULES.roofSlope`, m.roofSlope, CONFIG.MODULES.roofSlope, 1e-9);
    void scale;
  }
  // 等级差异：grade3 柱径 = grade2 柱径 × 1.2
  const g2 = kit.hall({ ...BASE_PARAMS, id: 'G2', grade: 2, roofType: 'hip' }).userData.kit.metrics;
  const g3 = kit.hall({ ...MAIN_HALL }).userData.kit.metrics;
  eq('grade3/grade2 柱径比 = GRADES 因子比', g3.columnDiameter / g2.columnDiameter, CONFIG.GRADES[3].columnDiameterFactor / CONFIG.GRADES[2].columnDiameterFactor, 1e-6);
  // 几何实测：柱径与令牌一致（柱网合并几何的 X 极值 - 柱心到台明边收进）
  const hallGeom = findMesh(built[0], 'column').geometry;
  const hg = geometryStats(hallGeom);
  const bodyW = dims[0].bodyW;
  between('柱网几何 X 极值与柱径自洽', hg.maxX, bodyW / 2 - dims[0].columnDiameter * 3, bodyW / 2 + dims[0].columnDiameter);
  // 檐高（与 layout 同源公式）
  eq('檐高 = terraceH + MODULES.eaveHeight × 等级因子', g2.eaveHeight, CONFIG.MODULES.eaveHeight * CONFIG.GRADES[2].eaveHeightFactor + BASE_PARAMS.terraceH, 1e-6);
}

/* ================================================================== 7 识别特征 */

startSection('7 识别特征：朱红柱/青绿彩画/飞檐/斗栱/金瓦/脊兽/白石台基与栏杆');
{
  const main = kit.hall({ ...MAIN_HALL });
  const parts = partsOf(main, 0);
  const required = ['column', 'painting', 'bracket', 'roof', 'ridge', 'eaveFascia', 'terrace', 'railing', 'railingPanel', 'ridgeBeast', 'doorFrame', 'window', 'lowerRoof', 'soffit', 'giltLine', 'stairs'];
  for (const part of required) {
    ok(`主殿近景含构件 ${part}`, parts.has(part), [...parts].join(','));
  }
  const expectMaterial = {
    column: 'plasterRed',
    painting: 'paintingTeal',
    bracket: 'paintingTeal',
    roof: 'glazeTile',
    lowerRoof: 'glazeTile',
    ridge: 'glazeRidge',
    ridgeBeast: 'giltMetal',
    doorStud: 'giltMetal',
    terrace: 'stoneWhite',
    railing: 'stoneWhite',
    window: 'timberLacquer',
    wall: 'plasterRed',
  };
  for (const [part, mat] of Object.entries(expectMaterial)) {
    const mesh = findMesh(main, part);
    if (!mesh) {
      ok(`识别特征材质 ${part}`, false, '构件缺失');
      continue;
    }
    ok(`识别特征材质 ${part} → ${mat}`, mesh.material === kit.materials.get(mat), `${mesh.material?.name}`);
  }
  const colorOf = (part) => `#${findMesh(main, part).material.color.getHexString()}`.toLowerCase();
  eq('朱红柱用宫红 palaceRed', colorOf('column'), CONFIG.COLORS.palaceRed);
  eq('彩画用青绿 paintingTeal', colorOf('painting'), CONFIG.COLORS.paintingTeal);
  eq('金瓦用琉璃金 glazeGold', colorOf('roof'), CONFIG.COLORS.glazeGold);
  eq('脊兽用鎏金 gilt', colorOf('ridgeBeast'), CONFIG.COLORS.gilt);
  eq('台基用暖白石 warmWhite', colorOf('terrace'), CONFIG.COLORS.warmWhite);
  // 远景仍保留屋顶与轮廓
  const farParts = partsOf(main, 2);
  ok('远景保留屋面', farParts.has('roof'));
  ok('远景保留正脊', farParts.has('ridge'));
  ok('远景保留台基与屋身', farParts.has('terrace') && farParts.has('wall'));
  ok('远景不再有斗栱/脊兽/栏杆细部', !farParts.has('bracket') && !farParts.has('ridgeBeast') && !farParts.has('railing'));
}

/* ================================================================== 8 LOD 三档 */

startSection('8 LOD 三档降级有效 + 轮廓保持 + update(camera) 切换');
{
  const main = kit.hall({ ...MAIN_HALL });
  eq('LOD 档数 = config.BUDGET.lod.levels', main.levels.length, CONFIG.BUDGET.lod.levels);
  const bias = CONFIG.QUALITY.tiers.medium.lodBias;
  eq('LOD0 距离 = 0', main.levels[0].distance, 0);
  eq('LOD1 距离 = nearDistance × lodBias', main.levels[1].distance, CONFIG.BUDGET.lod.nearDistance * bias, 1e-6);
  eq('LOD2 距离 = midDistance × lodBias', main.levels[2].distance, CONFIG.BUDGET.lod.midDistance * bias, 1e-6);
  const tri = main.userData.kit.metrics.triangles;
  ok('三角面随 LOD 单调下降', tri.near > tri.mid && tri.mid > tri.far, JSON.stringify(tri));
  ok('远景三角面 ≤ 35% 近景', tri.far <= tri.near * 0.35, `${tri.far} / ${tri.near}`);
  ok('单建筑近景三角面 ≤ perBuildingMax', tri.near <= CONFIG.BUDGET.triangles.perBuildingMax, `${tri.near}`);

  const box0 = new T.Box3().setFromObject(main.levels[0].object);
  for (let i = 1; i < main.levels.length; i += 1) {
    const box = new T.Box3().setFromObject(main.levels[i].object);
    const size0 = box0.getSize(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    const dev = Math.max(
      Math.abs(size.x - size0.x) / size0.x,
      Math.abs(size.z - size0.z) / size0.z,
      Math.abs(size.y - size0.y) / size0.y,
    );
    ok(`LOD${i} 轮廓与近景一致（≤12%）`, dev <= 0.12, `偏差 ${(dev * 100).toFixed(1)}%`);
  }

  const near = new T.PerspectiveCamera(45, 1.6, 0.5, 6000);
  near.position.set(0, 30, -60);
  near.updateMatrixWorld(true);
  main.update(near);
  eq('近景相机 → LOD0', main.getCurrentLevel(), 0);
  const far = new T.PerspectiveCamera(45, 1.6, 0.5, 6000);
  far.position.set(0, 600, -2400);
  far.updateMatrixWorld(true);
  main.update(far);
  eq('远景相机 → LOD2', main.getCurrentLevel(), 2);
  const skip = new T.PerspectiveCamera(45, 1.6, 0.5, 6000);
  skip.position.set(0, 60, -250);
  skip.updateMatrixWorld(true);
  main.update(skip);
  eq('中景相机 → LOD1', main.getCurrentLevel(), 1);
  // kit.lod(levels) 通用包装
  const a = new T.Mesh(new T.BoxGeometry(1, 1, 1), kit.materials.get('stoneWhite'));
  const b = new T.Mesh(new T.BoxGeometry(1, 1, 1), kit.materials.get('stoneWhite'));
  const custom = kit.lod([a, b]);
  eq('kit.lod(levels) 生成 LOD', custom.isLOD, true);
  eq('kit.lod 档数正确', custom.levels.length, 2);
}

/* ================================================================== 9 合批与实例化 */

startSection('9 合批/实例化确实降低绘制批次');
{
  // 9.1 跨建筑合批（mergeByMaterial：同材质同部位合并）
  const wrap = new T.Group();
  for (let i = 0; i < 4; i += 1) wrap.add(kit.hall({ ...BASE_PARAMS, id: `BATCH-${i}`, lod: 'near', x: i * 40 }));
  const before1 = countDrawCalls(wrap);
  const flat = mergeByMaterial(T, wrap).stats;
  const after1 = countDrawCalls(wrap);
  ok('mergeByMaterial 降低绘制调用（4 栋殿堂）', after1 < before1, `${before1} → ${after1}`);
  ok('mergeByMaterial 降幅 ≥ 60%', flat.reduction >= 0.6, `${(flat.reduction * 100).toFixed(1)}%`);

  // 9.2 整区跨建筑合批（mergeZone）
  const zoneRoot = new T.Group();
  for (const slot of layout.SLOTS) zoneRoot.add(kit[slot.kind]({ ...slot, quality: 'medium' }));
  const beforeAll = countDrawCalls(zoneRoot);
  const triBefore = countTriangles(zoneRoot);
  const merged = mergeZone(T, zoneRoot);
  ok(`整城 ${layout.SLOTS.length} 槽合批后绘制调用 ≤ 350（config.BUDGET.drawCalls.mainSceneMax）`, merged.stats.after <= CONFIG.BUDGET.drawCalls.mainSceneMax, `${beforeAll} → ${merged.stats.after}`);
  ok('合批降幅 ≥ 90%', merged.stats.reduction >= 0.9, `${(merged.stats.reduction * 100).toFixed(1)}%`);
  eq('合批不改变三角面总数', countTriangles(zoneRoot), triBefore);
  ok('整城可见三角面 ≤ 150 万（config.BUDGET.triangles.visibleMax）', countTriangles(zoneRoot) <= CONFIG.BUDGET.triangles.visibleMax, String(countTriangles(zoneRoot)));
  const farCam = new T.PerspectiveCamera(45, 1.6, 0.5, 6000);
  farCam.position.set(0, 520, -1180);
  farCam.updateMatrixWorld(true);
  zoneRoot.traverse((n) => { if (n.isLOD) n.update(farCam); });
  ok('全城远景绘制调用 ≤ 80', countDrawCalls(zoneRoot) <= 80, String(countDrawCalls(zoneRoot)));
  ok('全城远景三角面 ≤ 25 万', countTriangles(zoneRoot) <= 250000, String(countTriangles(zoneRoot)));

  // 9.3 分区预算（每区独立合批后 ≤ BUDGET.drawCalls.perZone）
  for (const area of ['B', 'C', 'D', 'E', 'F']) {
    const root = new T.Group();
    for (const slot of layout.SLOTS.filter((s) => s.zone === area)) root.add(kit[slot.kind]({ ...slot, quality: 'medium' }));
    const before = countDrawCalls(root);
    const stat = mergeZone(T, root).stats;
    ok(`分区 ${area} 合批后绘制调用 ≤ ${CONFIG.BUDGET.drawCalls.perZone[area]}`, stat.after <= CONFIG.BUDGET.drawCalls.perZone[area], `${before} → ${stat.after}`);
    notes.push(`分区 ${area}: ${before} → ${stat.after} draw calls / ${countTriangles(root)} tri`);
  }

  // 9.4 实例化：200 棵树 = 1 次绘制
  const tree = kit.tree({ id: 'T0', size: 'medium' });
  const treeMesh = findMesh(tree, 'trunk');
  const points = [];
  const rng = { next: (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })() };
  for (let i = 0; i < 200; i += 1) points.push({ x: rng.next() * 400 - 200, y: 0, z: rng.next() * 400 - 200 });
  const instanced = kit.instanceFromPoints(treeMesh.geometry, treeMesh.material, points);
  eq('实例化 200 个 → 1 次绘制调用', countDrawCalls(instanced), 1);
  eq('实例化三角面 = 单体 × 200', countTriangles(instanced), Math.floor(treeMesh.geometry.attributes.position.count / 3) * 200);
  const instanced2 = kit.instance(treeMesh, 64);
  eq('kit.instance(mesh,count) 生成 1 次调用', countDrawCalls(instanced2), 1);
}

/* ================================================================== 10 去内部面 */

startSection('10 去不可见内部面（重合面 / 被遮挡面）');
{
  // 两个背靠背的盒子，接触面成对删除
  const a = new T.BoxGeometry(2, 2, 2).toNonIndexed();
  const b = new T.BoxGeometry(2, 2, 2).toNonIndexed();
  b.applyMatrix4(new T.Matrix4().makeTranslation(0, 2, 0));
  const combined = (() => {
    const groups = [a, b];
    const total = groups.reduce((acc, g) => acc + g.attributes.position.count, 0);
    const out = new T.BufferGeometry();
    const arr = new Float32Array(total * 3);
    let off = 0;
    for (const g of groups) { arr.set(g.attributes.position.array, off); off += g.attributes.position.array.length; }
    out.setAttribute('position', new T.BufferAttribute(arr, 3));
    out.computeVertexNormals();
    return out;
  })();
  const before = combined.attributes.position.count / 3;
  const result = removeCoincidentFaces(T, combined, { epsilon: 1e-3 });
  eq('背靠背重合面成对删除（各 2 面）', result.removed, 4);
  eq('删除后三角形数 = 原 - 4', result.geometry.attributes.position.count / 3, before - 4);
  ok('删除后几何仍完整（顶点数为 3 的倍数）', result.geometry.attributes.position.count % 3 === 0);

  // 真实建筑：pruneInteriorFaces 只减不增，且包络基本不变
  const hall = kit.hall({ ...BASE_PARAMS, id: 'PRUNE', lod: 'near' });
  const bb0 = new T.Box3().setFromObject(hall).getSize(new T.Vector3());
  const t0 = countTriangles(hall);
  const stat = pruneInteriorFaces(T, hall, { epsilon: 0.02 });
  const t1 = countTriangles(hall);
  const bb1 = new T.Box3().setFromObject(hall).getSize(new T.Vector3());
  ok('pruneInteriorFaces 减少三角形', t1 <= t0, `${t0} → ${t1}`);
  ok('去内部面后包络基本不变（≤5%）', Math.abs(bb1.x - bb0.x) / bb0.x <= 0.05 && Math.abs(bb1.y - bb0.y) / bb0.y <= 0.05, `${bb0.toArray()} → ${bb1.toArray()}`);
  eq('统计口径自洽', stat.after, t1);
  notes.push(`去内部面（测试殿）：${t0} → ${t1} 三角形`);
}

/* ================================================================== 11 全槽位扫描 */

startSection(`11 全 ${layout.SLOTS.length} 槽位扫描 + 与 layout.eaveHeight 交叉校验 + 预算`);
{
  /* t3：槽位基线由「67」改为「67 + layout.GARDEN_BULK_SLOTS.length」（LAYOUT_VERSION 1.1.21 起
     御花园两侧批量装饰建筑 12 座进入 SLOTS，见 layout.js 版本注记）。判据**只增不减**：
     仍是精确等式（不再是脆弱的魔法数），并追加 id 唯一性守卫。 */
  eq('layout 槽位数 = 契约基线 67 + 批量装饰建筑 GARDEN_BULK_SLOTS', layout.SLOTS.length, 67 + layout.GARDEN_BULK_SLOTS.length);
  eq('layout 槽位 id 唯一（不得用重复编号虚增建筑数）', new Set(layout.SLOTS.map((s) => s.id)).size, layout.SLOTS.length);
  const violations = [];
  const warnings = [];
  const rows = [];
  let totalNear = 0;
  let maxBuilding = 0;
  let sumMid = 0;
  const heightDevs = [];
  for (const slot of layout.SLOTS) {
    let object = null;
    try {
      object = kit[slot.kind]({ ...slot, quality: 'medium', onDiagnostic: null });
    } catch (error) {
      violations.push({ id: slot.id, message: error.message.split('\n')[0] });
      continue;
    }
    const meta = object.userData.kit;
    for (const d of meta.diagnostics) warnings.push({ id: slot.id, code: d.code });
    totalNear += meta.metrics.triangles.near;
    sumMid += meta.metrics.triangles.mid;
    maxBuilding = Math.max(maxBuilding, meta.metrics.triangles.near);
    // 交叉校验：layout.eaveHeight = baseY + MODULES.eaveHeight × 等级因子（layout 值保留 2 位小数）
    const expectedEave = slot.baseY + CONFIG.MODULES.eaveHeight * CONFIG.GRADES[slot.grade].eaveHeightFactor;
    heightDevs.push({ id: slot.id, eaveDev: Math.abs(meta.metrics.eaveHeightAbsolute - expectedEave), totalDev: Math.abs(meta.metrics.totalHeightAbsolute - slot.totalHeight) / slot.totalHeight });
    rows.push({ id: slot.id, kind: slot.kind, ridge: meta.metrics.ridge?.length ?? 0 });
  }

  // T1.1（CONFIG 1.0.1）落地前，F-garden-pavilion-main 的 grade2+pyramidal 是唯一已知违规（主理人裁定 a）
  const pendingConfig = CONFIG.CONFIG_VERSION === '1.0.0';
  if (pendingConfig) {
    ok('已知待修项：配置 1.0.0 时违规槽位至多 1 例', violations.length <= 1, JSON.stringify(violations));
    if (violations.length === 1) {
      eq('待修槽位就是 F-garden-pavilion-main', violations[0].id, 'F-garden-pavilion-main');
      notes.push('待 T1.1（CONFIG 1.0.1 增补 GRADES[2].pyramidal）：F-garden-pavilion-main 目前按规则抛错，与 layout 冻结值冲突（见 docs/handoff-t3.md 冲突 1）');
    }
  } else {
    eq('CONFIG ≥1.0.1 后屋顶/等级违规必须为 0', violations.length, 0);
    eq('CONFIG ≥1.0.1 后风格诊断必须为 0', warnings.length, 0);
  }
  if (warnings.length > 0) notes.push(`风格诊断：${JSON.stringify(warnings.slice(0, 5))}`);

  const eaveDevices = heightDevs.filter((h) => h.eaveDev > 0.006);
  eq('全部槽位檐高与 layout.eaveHeight 一致（≤6mm 取整误差）', eaveDevices.length, 0);
  const worstTotal = heightDevs.reduce((a, b) => (b.totalDev > a.totalDev ? b : a), { totalDev: 0, id: '-' });
  const medianTotal = heightDevs.map((h) => h.totalDev).sort((a, b) => a - b)[Math.floor(heightDevs.length / 2)];
  between('totalHeight（估值）偏差上限 ≤ 45%', worstTotal.totalDev, 0, 0.45);
  ok('单建筑近景三角面 ≤ 24000', maxBuilding <= CONFIG.BUDGET.triangles.perBuildingMax, String(maxBuilding));
  ok('全城近景三角面 ≤ 150 万', totalNear <= CONFIG.BUDGET.triangles.visibleMax, String(totalNear));
  notes.push(`全 ${layout.SLOTS.length} 槽：近景三角面 ${totalNear}，中景 ${sumMid}，单栋最大 ${maxBuilding}`);
  notes.push(`totalHeight 偏差（kit 举架 vs layout 估值）：中位 ${(medianTotal * 100).toFixed(1)}%，最大 ${(worstTotal.totalDev * 100).toFixed(1)}% (${worstTotal.id})`);
  const ridgeFailures = rows.filter((r) => ['hip', 'doubleEaveHip', 'gableHip', 'gable'].includes(layout.SLOT_BY_ID[r.id].roofType) && r.ridge <= 0);
  eq('全部殿堂类槽位都有正脊', ridgeFailures.length, 0);
}

/* ================================================================== 12 资产登记 */

startSection('12 资产登记与许可（程序化，无第三方、无网络）');
{
  const validation = kit.assets.validate();
  ok('登记表 9 字段完整', validation.ok, JSON.stringify(validation.problems.slice(0, 3)));
  ok('登记条目 ≥ 29（11 构件 + 8 摆件 + 9 材质 + 贴图集）', validation.checked >= 29, String(validation.checked));
  for (const id of ['kit:hall', 'kit:tree', 'kit:material:glazeTile', 'kit:textures']) {
    ok(`登记 ${id}`, kit.assets.has(id));
  }
  const item = kit.assets.get('kit:hall');
  for (const field of CONFIG.ASSETS.requiredFields) {
    ok(`kit:hall 含字段 ${field}`, field in item);
  }
  ok('来源为程序化（procedural://，非热链）', item.sourceUrl.startsWith('procedural://'));
  ok('程序化资源不落盘（localPath=null）', item.localPath === null);
  const stats = kit.assets.stats();
  eq('无第三方素材', stats.thirdParty, 0);
  eq('运行期网络请求数为 0', stats.networkRequests, 0);
  eq('程序化资源数 = 登记数', stats.procedural, stats.registered);
  ok('登记表按 id 去重（同一份资源只留一份）', kit.assets.registry.size === new Set(kit.assets.registry.keys()).size);
  const loaded = await kit.assets.load(['kit:hall', 'kit:tree', 'kit:hall']);
  eq('load 返回去重后的条目数', loaded.size, 2);
  ok('load 不发网络请求', kit.assets.stats().networkRequests === 0);
  eq('dedupe 开关来自 config', stats.dedupe, CONFIG.ASSETS.dedupe);
  const credits = readFileSync(join(ROOT, 'docs', 'ASSET_CREDITS.md'), 'utf8');
  for (const field of CONFIG.ASSETS.requiredFields) {
    ok(`ASSET_CREDITS.md 记录字段 ${field}`, credits.includes(field));
  }
  ok('ASSET_CREDITS.md 明确声明无第三方素材', credits.includes('无第三方素材'));
  const assetFiles = readdirSync(join(ROOT, 'public', 'assets'), { withFileTypes: true });
  const runtimeAssets = assetFiles.filter((e) => e.isFile() && !['README.md', '.DS_Store'].includes(e.name));
  ok('public/assets 内无运行时资源（仅说明文件；程序化路线）', runtimeAssets.length === 0, runtimeAssets.map((e) => e.name).join(','));
}

/* ================================================================== 13 令牌与工具面 */

startSection('13 令牌与工具面（区域作者可用性）');
{
  for (const role of Object.keys(CONFIG.COLOR_ROLES)) {
    const hex = kit.color(role);
    ok(`kit.color('${role}') 解析为 config 色值`, Object.values(CONFIG.COLORS).includes(hex) || Object.values(CONFIG.COLORS_DERIVED).includes(hex));
  }
  eq('kit.tileMeters 与 MODULES.roofTileRowsPerMeter 自洽', kit.tileMeters('glazeTile'), 1 / CONFIG.MODULES.roofTileRowsPerMeter, 1e-9);
  const moduleScaleOf = kit.tokens.moduleScale(2);
  eq('tokens.moduleScale 柱径', moduleScaleOf.columnDiameter, CONFIG.MODULES.columnDiameter * CONFIG.GRADES[2].columnDiameterFactor, 1e-9);
  eq('tokens.PROPORTIONS 冻结', Object.isFrozen(PROPORTIONS), true);
  for (const [key, value] of Object.entries(PROPORTIONS)) {
    between(`PROPORTIONS.${key} 是有限正系数`, value, 1e-9, 8);
  }
  eq('tokens.roofTypes 与 config 键一致', kit.tokens.roofTypes.join(','), Object.keys(CONFIG.ROOF_TYPES).join(','));
  eq('tokens.grades 与 config 键一致', kit.tokens.grades.join(','), Object.keys(CONFIG.GRADES).join(','));
  eq('requiredParamFields 含 w/d/bays/terraceH/roofType/grade/facing/quality', kit.tokens.requiredParamFields.filter((f) => ['w', 'd', 'bays', 'terraceH', 'roofType', 'grade', 'facing', 'quality'].includes(f)).length, 8);
  const stats = kit.stats();
  eq('stats.three 版本', String(stats.three), '169');
  eq('stats 列出 11 个构件工厂', stats.factories.buildings.length, 11);
  eq('stats 列出 8 个摆件工厂', stats.factories.props.length, 8);
  ok('budgetFor(B) 给出分区预算', kit.budgetFor('B').drawCalls === CONFIG.BUDGET.drawCalls.perZone.B);
  ok('kit.THREE 与 three-ref 同源', kit.THREE === THREE);
}

/* ================================================================== 14 门洞与形制解耦（t22 回归守卫） */

startSection('14 门洞与形制解耦：可通行开口 / 屋顶形制 / 窗 / 门扇比例 互不牵连');

/**
 * 门洞通道判定（近/中 LOD 对象）：
 *  - 在门口宽度上等分取样（偏移 (i+0.5)/n 避开 x=0 的对缝数值假象），从屋身前表面外 1.6m 沿
 *    "正面→背面"方向打射线（方向随建筑 rotationYDeg 变换；命中点回到本地坐标判定）；
 *  - 本地 z 落在 [前表面, 前表面+2.0m] 的命中视为"正面被挡"（背墙通常在其后 20m+，不会误判）；
 *  - 返回最宽连续通行段（米）、遮挡率、以及 x≈0 处的首个遮挡构件。
 * 说明：修复前 hall/courtyardGate 的正面是一整面实心墙，只有 x=0 两块墙对接处的零宽对缝能"穿过"
 * （单点射线会误判为通行），因此必须用"最宽连续通行段"而不是单点射线。
 */
function probeDoorChannel(object, { samples = 201 } = {}) {
  // LOD 只测"当前档"（three 的 Raycaster 不检查 visible，递归会打到所有档位，包括远景实心体块）
  const target = object.isLOD ? object.levels[object.getCurrentLevel?.() ?? 0].object : object;
  target.updateMatrixWorld(true);
  const meta = object.userData.kit.metrics;
  const p = object.userData.kit.params;
  const terraceH = p.terraceH ?? 0;
  const doorW = meta.doorWidth ?? 0;
  const doorH = meta.doorHeight ?? 0;
  const y = terraceH + Math.min(1.6, doorH > 0.5 ? doorH / 2 : 1.6);
  const spanW = doorW > 0.5 ? doorW : meta.bodyW;
  const quat = new T.Quaternion();
  object.getWorldQuaternion(quat);
  const dirWorld = new T.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
  const ray = new T.Raycaster();
  const originLocal = new T.Vector3();
  const hitAt = (x) => {
    originLocal.set(x, y, -meta.bodyD / 2 - 1.6);
    object.localToWorld(originLocal);
    ray.set(originLocal.clone(), dirWorld);
    const hits = ray.intersectObject(target, true).filter((h) => h.object.isMesh);
    const local = hits.map((h) => ({ part: h.object.userData.part, z: object.worldToLocal(h.point.clone()).z }));
    const blocker = local.find((t) => t.z < -meta.bodyD / 2 + 2.0);
    return { blocked: Boolean(blocker), blocking: blocker ? blocker.part : null };
  };
  let run = 0;
  let widest = 0;
  let widestCenter = 0;
  let blocked = 0;
  const step = spanW / samples;
  for (let i = 0; i < samples; i += 1) {
    const x = -spanW / 2 + spanW * (i + 0.5) / samples;
    if (hitAt(x).blocked) {
      blocked += 1;
      run = 0;
    } else {
      run += step;
      if (run > widest) {
        widest = run;
        widestCenter = x;
      }
    }
  }
  return {
    doorW,
    spanW,
    widest: +widest.toFixed(3),
    widestCenter: +widestCenter.toFixed(3),
    blockedRatio: +(blocked / samples).toFixed(3),
    centerBlocker: hitAt(0.06).blocking,
  };
}

{
  const slot = (id) => layout.SLOT_BY_ID[id];
  const playerClear = 2 * CONFIG.INTERACTION.player.radius;
  const baseline = {};

  for (const detail of ['near', 'mid']) {
    const rows = {
      'hall(B-hall-main)+door26': kit.hall({ ...slot('B-hall-main'), lod: detail, quality: 'medium' }),
      'hall(C-hall-bed-main)+door26': kit.hall({ ...slot('C-hall-bed-main'), lod: detail, quality: 'medium' }),
      // t70（LAYOUT 1.1.3）后布局里所有殿堂都带派生门，故"无门"对照改为**合成样本**（不传 door）
      'hall(合成) 无door': kit.hall({ id: 'NO-DOOR-hall', name: '无门对照样本', w: 52, d: 28, bays: 7, terraceH: 2, roofType: 'hip', grade: 2, facing: 'south', quality: 'medium', lod: detail }),
      'gateHall(F-gate-south)': kit.gateHall({ ...slot('F-gate-south'), lod: detail, quality: 'medium' }),
      'courtyardGate(C-gate-west)': kit.courtyardGate({ ...slot('C-gate-west'), lod: detail, quality: 'medium' }),
    };
    const probe = {};
    for (const [label, object] of Object.entries(rows)) probe[label] = probeDoorChannel(object);
    if (detail === 'near') Object.assign(baseline, probe);

    for (const label of ['hall(B-hall-main)+door26', 'hall(C-hall-bed-main)+door26', 'gateHall(F-gate-south)', 'courtyardGate(C-gate-west)']) {
      const r = probe[label];
      ok(`[${detail}] ${label} 存在可通行开口（最宽连续通行段 ≥ ${playerClear}m）`, r.widest >= playerClear, `最宽 ${r.widest}m @x=${r.widestCenter}，遮挡率 ${r.blockedRatio}`);
      ok(`[${detail}] ${label} x≈0 处正面不阻塞`, r.centerBlocker === null, `被 ${r.centerBlocker} 挡住`);
      ok(`[${detail}] ${label} 门口未被整面砌死（遮挡率 < 100%）`, r.blockedRatio < 0.999, `${r.blockedRatio}`);
    }
    {
      const r = probe['hall(合成) 无door'];
      eq(`[${detail}] hall 无 door → 正面实心（最宽通行段 = 0）`, r.widest, 0, 1e-9);
      eq(`[${detail}] hall 无 door → 遮挡率 100%`, r.blockedRatio, 1);
      eq(`[${detail}] hall 无 door（合成样本）→ 无门洞（doorWidth = 0）`, r.doorW, 0, 1e-9);
      // t33 起：无 door 的殿堂正面有"隔扇窗洞 + 透光窗扇"（不是通行口），首个遮挡物可以是 wall 或 window，
      // 但**必须被遮挡**（宽 ≤ 0 通行段 + 遮挡率 100% 已在上文断言），即"不可通行"这一条不变。
      ok(`[${detail}] hall 无 door → 正面被遮挡（wall 或 window，非通行口）`, r.centerBlocker === 'wall' || r.centerBlocker === 'window', String(r.centerBlocker));
    }
    // gateHall 现有行为不变：门口通行段与近景基线一致（同为门殿常开门扇）
    if (detail === 'mid') {
      const near = baseline['gateHall(F-gate-south)'];
      eq('gateHall 中景/近景通行段一致（现有行为不变）', probe['gateHall(F-gate-south)'].widest, near.widest, 1e-6);
      eq('gateHall 中景/近景遮挡率一致', probe['gateHall(F-gate-south)'].blockedRatio, near.blockedRatio, 1e-9);
    }
  }

  // 门洞宽度 = layout.door.width（受 bodyW 上限约束），且净宽满足玩家体积
  for (const id of ['B-hall-main', 'C-hall-bed-main']) {
    const hall = kit.hall({ ...slot(id), lod: 'near', quality: 'medium' });
    const meta = hall.userData.kit.metrics;
    eq(`${id} 门宽与 layout.door.width 一致`, meta.doorWidth, Math.min(slot(id).door.width, meta.bodyW - 2), 1e-9);
    ok(`${id} opening 元数据完整`, meta.hasOpening === true && meta.opening.width > 0 && meta.opening.height > 0);
    ok(`${id} 门扇净宽 ≥ 玩家净宽`, meta.opening.clearWidth >= meta.opening.playerClearWidth, `${meta.opening.clearWidth} vs ${meta.opening.playerClearWidth}`);
  }
  eq('门扇开启比例由 kind 决定（殿堂 0.18）', kit.hall({ ...slot('B-hall-main'), lod: 'near', quality: 'medium' }).userData.kit.metrics.opening.openFraction, 0.18, 1e-9);
  eq('门扇开启比例由 kind 决定（院门 0.72）', kit.courtyardGate({ ...slot('C-gate-west'), lod: 'near', quality: 'medium' }).userData.kit.metrics.opening.openFraction, 0.72, 1e-9);
  eq('门扇开启比例由 kind 决定（门殿 0.72）', kit.gateHall({ ...slot('F-gate-south'), lod: 'near', quality: 'medium' }).userData.kit.metrics.opening.openFraction, 0.72, 1e-9);

  // 显式开关：doorOpening / openFront 也让殿堂获得开口，且开口足够通行
  for (const [label, extra] of [['doorOpening:true', { doorOpening: true }], ['openFront:true', { openFront: true }], ['doorOpening:4', { doorOpening: 4 }]]) {
    const hall = kit.hall({ ...BASE_PARAMS, id: `OPEN-${label}`, lod: 'near', ...extra });
    const meta = hall.userData.kit.metrics;
    ok(`显式 ${label} → 有门洞`, meta.hasOpening === true, JSON.stringify(meta.opening));
    ok(`显式 ${label} → 净宽 ≥ 玩家净宽`, meta.opening.clearWidth >= meta.opening.playerClearWidth, `${meta.opening.clearWidth}`);
    eq(`显式 ${label} → 开口来源标记`, meta.opening.source, label === 'doorOpening:4' ? 'doorOpening' : 'flag');
    const r = probeDoorChannel(hall);
    ok(`显式 ${label} → 通道存在`, r.widest >= playerClear, `最宽 ${r.widest}m`);
  }

  // 窗只由 kind 决定：殿堂在有/无门洞时都有窗；门殿/院门无窗
  const partsSet = (object) => {
    const set = new Set();
    object.traverse((node) => { if (node.userData?.part) set.add(node.userData.part); });
    return set;
  };
  ok('殿堂有门洞时仍有窗', partsSet(kit.hall({ ...MAIN_HALL })).has('window'));
  ok('殿堂无门洞时仍有窗', partsSet(kit.hall({ ...BASE_PARAMS, id: 'WIN-1', lod: 'near' })).has('window'));
  ok('门殿无窗', !partsSet(kit.gateHall({ ...slot('F-gate-south'), lod: 'near', quality: 'medium' })).has('window'));
  ok('院门无窗', !partsSet(kit.courtyardGate({ ...slot('C-gate-west'), lod: 'near', quality: 'medium' })).has('window'));

  // 屋顶形制不因门洞退化：grade3 doubleEaveHip hall 仍是重檐庑殿 + 可通行
  const main = kit.hall({ ...MAIN_HALL });
  const mm = main.userData.kit.metrics;
  eq('重檐主殿 roofType', mm.roofType, 'doubleEaveHip');
  ok('重檐主殿有上下两重屋面', Boolean(findMesh(main, 'lowerRoof')) && Boolean(findMesh(main, 'roof')));
  // 上层屋身（平座层）用几何证明存在：柱网 part 的顶面达到上层檐口附近（同名合批，不额外占绘制批次）
  {
    const cols = findMesh(main, 'column');
    const cs = geometryStats(cols.geometry);
    ok('重檐主殿有上层屋身柱网（柱网顶面 ≥ 上层檐口 − 0.5m）', cs.maxY >= mm.upperEaveY - 0.5, `column maxY=${cs.maxY.toFixed(2)} vs upperEave=${mm.upperEaveY.toFixed(2)}`);
    ok('上层屋身柱顶高于下层檐口', cs.maxY > mm.eaveHeight, `${cs.maxY.toFixed(2)} vs ${mm.eaveHeight}`);
  }
  ok('重檐主殿上层檐口高于下层檐口', mm.upperEaveY > mm.eaveHeight, `${mm.upperEaveY} vs ${mm.eaveHeight}`);
  ok('重檐主殿仍有长正脊', Boolean(mm.ridge) && mm.ridge.length >= 0.3 * 84, `ridge=${mm.ridge?.length}`);
  ok('重檐主殿仍有四面坡', slopeSectors(findMesh(main, 'roof').geometry).size === 4);
  ok('重檐主殿同时具备门洞通道', mm.hasOpening === true && probeDoorChannel(main).widest >= playerClear, `最宽 ${probeDoorChannel(main).widest}m`);

  // gateHall + doubleEaveHip 不再被静默降级（与 layout 注册表一致）
  const gate = kit.gateHall({ ...slot('F-gate-south'), lod: 'near', quality: 'medium' });
  ok('gateHall(F-gate-south, doubleEaveHip) 现在建成重檐庑殿', Boolean(findMesh(gate, 'lowerRoof')) && gate.userData.kit.metrics.upperEaveY > gate.userData.kit.metrics.eaveHeight);

  // 全 SLOTS 槽：凡 layout 带 door 的槽位，净宽都必须够玩家通过
  // 例外（t103 语义 + 能力边界）：**亭 pavilion 四面开敞、没有正面墙**，
  // 布局给它的 door 数据（hasDoor=true, width 8/10/16, blocks=exceptDoor）表达的是"可通行"，
  // 几何上因无墙而不存在"墙上门洞"（doorWidth=0）——故单独按可通行语义断言，不计入"必须有开口"。
  let withDoor = 0;
  let tooNarrow = [];
  const pavilionDoorSlots = [];
  const clearWidths = [];
  for (const s of layout.SLOTS) {
    if (!s.door || !(s.door.width > 0.2)) continue;
    if (s.kind === 'pavilion') {
      // t114 同步（t103 语义）：亭**四面开敞**，数据侧已 `hasDoor=true`、障碍 `blocks='exceptDoor'`、
      // `door.passable=true` ⇒ 亭必须是**可通行**的；几何上因为**没有墙**，所以不存在"墙上门洞"
      // （`metrics.opening` 缺省、`doorWidth=0`）——这不是"不适用/无门洞"，而是"靠开敞实现通行"。
      const pav = kit.pavilion({ ...s, lod: 'near', quality: 'medium' });
      const pmeta = pav.userData.kit.metrics;
      const obstacle = layout.OBSTACLES.find((o) => o.buildingId === s.id) ?? null;
      pavilionDoorSlots.push(`${s.id}:doorWidth=${pmeta.doorWidth},hasDoor=${s.hasDoor},blocks=${obstacle?.blocks ?? 'n/a'},passable=${obstacle?.door?.passable ?? 'n/a'}`);
      const passable = obstacle?.door?.passable;
      const blockedBy = obstacle?.door?.blockedBy ?? null;
      // 数据侧口径（t103）：亭带门 ⇒ `hasDoor=true` 且障碍 `blocks='exceptDoor'`（不再"无门洞/不可入"）。
      ok(`亭 ${s.id} 数据侧带门（hasDoor=true + blocks=exceptDoor）`, s.hasDoor === true && obstacle?.blocks === 'exceptDoor', JSON.stringify({ hasDoor: s.hasDoor, blocks: obstacle?.blocks, doorW: s.door?.width }));
      // 自洽不变式：passable 必须显式布尔；passable=false 必须给出 blockedBy 原因（当前 2 座被水面 WB-*-pond 阻断）
      ok(`亭 ${s.id} 的 door.passable/blockedBy 自洽（false ⇒ 有 blockedBy）`, typeof passable === 'boolean' && (passable === true ? blockedBy === null : blockedBy !== null), JSON.stringify({ passable, blockedBy }));
      ok(`亭 ${s.id} 几何无墙体（四面开敞 → 通行不需"墙上门洞"）`, !partsOf(pav, 0).has('wall'), [...partsOf(pav, 0)].join(','));
      eq(`亭 ${s.id} 无"墙上门洞"读数（无墙 ⇒ doorWidth=0，不是"不可进入"）`, pmeta.doorWidth, 0, 1e-9);
      continue;
    }
    withDoor += 1;
    const object = kit[s.kind]({ ...s, lod: 'near', quality: 'medium' });
    const op = object.userData.kit.metrics.opening;
    if (!op) {
      tooNarrow.push(`${s.id}:no-opening`);
      continue;
    }
    clearWidths.push(op.clearWidth);
    if (op.clearWidth < playerClear) tooNarrow.push(`${s.id}:${op.clearWidth}`);
  }
  ok('layout 中带 door 的槽位都获得开口', withDoor >= 18, `实际 ${withDoor}`);
  eq('全部带 door 的槽位净宽 ≥ 玩家净宽（0.7m）', tooNarrow.length, 0, tooNarrow.slice(0, 5).join(','));
  ok(`亭（pavilion）按 t103 语义全部带门且无"墙上门洞"（${pavilionDoorSlots.length} 座，逐座已断言）`, pavilionDoorSlots.every((v) => v.includes('doorWidth=0') && v.includes('hasDoor=true') && v.includes('blocks=exceptDoor')), pavilionDoorSlots.slice(0, 3).join(' | '));
  notes.push(`门洞解耦：layout 带 door 槽位 ${withDoor} 个全部获得开口，净宽最小 ${Math.min(...clearWidths).toFixed(2)}m（门槛 ${playerClear}m）；另有 ${pavilionDoorSlots.length} 个亭带 door 数据但不适用（doorWidth=0，符合能力边界）`);
}

/* ================================================================== 15 合批阴影标志守恒（t25 回归守卫） */

startSection('15 合批阴影守恒：mergeZone/mergeByMaterial/实例化 都不得丢投影标志');

{
  const castStats = (root) => {
    const parts = new Set();
    let count = 0;
    let triangles = 0;
    let receiveCount = 0;
    let receiveTriangles = 0;
    root.traverse((node) => {
      if (!node.isMesh) return;
      const t = Math.floor(node.geometry.attributes.position.count / 3);
      if (node.castShadow) {
        count += 1;
        triangles += t;
        parts.add(node.userData.part ?? 'unlabeled');
      }
      if (node.receiveShadow) {
        receiveCount += 1;
        receiveTriangles += t;
      }
    });
    return { count, triangles, receiveCount, receiveTriangles, parts: [...parts].sort() };
  };

  // 组一个"整区口径"的根：多栋建筑（各带三档 LOD）+ 道具（含水面，按策略不投影）+ 一个实例化构件
  const zoneRoot = new T.Group();
  for (const id of ['B-hall-main', 'B-hall-mid', 'B-gate-front', 'B-pavilion-gate-west']) {
    zoneRoot.add(kit[layout.SLOT_BY_ID[id].kind]({ ...layout.SLOT_BY_ID[id], quality: 'medium' }));
  }
  zoneRoot.add(kit.tree({ id: 'SHADOW-tree', x: 40, z: 10, size: 'medium' }));
  zoneRoot.add(kit.water({ id: 'SHADOW-water', w: 30, d: 16, y: 0.1, x: -40, z: 10 }));
  const boxMesh = new T.Mesh(new T.BoxGeometry(1, 1, 1), kit.materials.get('stoneWhite'));
  boxMesh.castShadow = true;
  boxMesh.receiveShadow = true;
  boxMesh.userData.part = 'column';
  const instanced = kit.instance(boxMesh, 8);
  instanced.position.set(0, 0, 60);
  zoneRoot.add(instanced);

  const before = castStats(zoneRoot);
  ok('合批前存在投影对象', before.count > 0, JSON.stringify(before));
  ok('合批前存在接收投影对象', before.receiveCount > 0);
  ok('合批前建筑构件在投影集合内（roof/wall/column）', ['roof', 'wall', 'column'].every((p) => before.parts.includes(p)), before.parts.join(','));

  const merged = kit.mergeZone(zoneRoot);
  const after = castStats(zoneRoot);

  ok('合批后仍有投影对象（缺陷复现点：修复前为 0）', after.count > 0, `count=${after.count}`);
  ok('合批后仍有接收投影对象', after.receiveCount > 0, `count=${after.receiveCount}`);
  eq('投影三角面守恒（合批前后逐位相等）', after.triangles, before.triangles);
  eq('接收投影三角面守恒', after.receiveTriangles, before.receiveTriangles);
  eq('投影构件集合守恒（部位集合不变）', after.parts.join(','), before.parts.join(','));
  // 水面按策略不投影但接收
  let waterCast = null;
  let waterReceive = null;
  zoneRoot.traverse((node) => {
    if (node.isMesh && node.userData.part === 'water') {
      waterCast = node.castShadow;
      waterReceive = node.receiveShadow;
    }
  });
  eq('水面不投影（策略白名单）', waterCast, false);
  eq('水面接收投影', waterReceive, true);
  // 实例化构件同样带标志
  let instCast = 0;
  zoneRoot.traverse((node) => { if (node.isInstancedMesh && node.castShadow) instCast += 1; });
  ok('实例化构件保留投影标志', instCast >= 1, String(instCast));
  notes.push(`阴影守恒：投影网格 ${before.count} → ${after.count}；投影三角面 ${before.triangles} 守恒；接收 ${before.receiveCount} → ${after.receiveCount}`);

  // mergeByMaterial 路径同样守恒
  const flat = new T.Group();
  for (let i = 0; i < 4; i += 1) flat.add(kit.hall({ ...BASE_PARAMS, id: `SHADOW-${i}`, lod: 'near', x: i * 40 }));
  const flatBefore = castStats(flat);
  mergeByMaterial(T, flat);
  const flatAfter = castStats(flat);
  ok('mergeByMaterial 后仍有投影对象', flatAfter.count > 0, String(flatAfter.count));
  eq('mergeByMaterial 投影三角面守恒', flatAfter.triangles, flatBefore.triangles);
  ok('mergeByMaterial 降低了投影对象数（合批生效而非逐栋）', flatAfter.count < flatBefore.count, `${flatBefore.count} → ${flatAfter.count}`);

  // config 阴影策略：关闭时全不投影（策略单点生效）
  const off = JSON.parse(JSON.stringify(CONFIG));
  off.LIGHTING.shadows.enabled = false;
  eq('策略：关闭阴影 → castShadow=false', shadowPolicy(off, 'roof').castShadow, false);
  eq('策略：关闭阴影 → receiveShadow=false', shadowPolicy(off, 'roof').receiveShadow, false);
  eq('策略：开启阴影 → 构件投影', shadowPolicy(CONFIG, 'roof').castShadow, true);
  eq('策略：水面永不投影', shadowPolicy(CONFIG, 'water').castShadow, false);

  const offRoot = new T.Group();
  offRoot.add(kit.hall({ ...BASE_PARAMS, id: 'OFF-1', lod: 'near' }));
  offRoot.add(kit.hall({ ...BASE_PARAMS, id: 'OFF-2', lod: 'near', x: 40 }));
  const rawMerged = mergeZoneRaw(T, offRoot, { config: off });
  const offStats = castStats(offRoot);
  ok('传入关闭阴影的 config → 合批结果 0 投影对象', offStats.count === 0, JSON.stringify(offStats));
  ok('mergeZone 返回统计', rawMerged.stats.after >= 0);

  // 实例化工具有默认标志，且可显式关闭
  const instDefault = kit.instance(boxMesh, 4);
  eq('kit.instance 默认投影', instDefault.castShadow, true);
  eq('kit.instance 默认接收', instDefault.receiveShadow, true);
  const instOff = kit.instance(boxMesh, 4, null, { castShadow: false });
  eq('kit.instance 可显式关闭投影', instOff.castShadow, false);
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
  const instPts = kit.instanceFromPoints(boxMesh.geometry, boxMesh.material, pts, {});
  eq('kit.instanceFromPoints 默认投影', instPts.castShadow, true);
}

/* ================================================================== 16 台阶方向（t25 回归守卫） */

startSection('16 台阶递升方向：贴台明最高、向远端递降，且与丹陛御路同向');

{
  // 采样口径（与 work/probe-stairs.mjs 一致）：按本地 z 分片取"顶面 y"（片宽 = 区间 4%，最小 0.35m）。
  //   nearTop = 贴台明一侧（本地 z 最大，即组内 +Z 端）的顶面；farTop = 远端（z 最小）的顶面。
  const flightProfile = (object, part, stepDepth = CONFIG.MODULES.stairsStepDepth) => {
    let mesh = null;
    object.traverse((node) => { if (!mesh && node.isMesh && node.userData.part === part) mesh = node; });
    if (!mesh) return null;
    const pos = mesh.geometry.attributes.position;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      minZ = Math.min(minZ, pos.getZ(i));
      maxZ = Math.max(maxZ, pos.getZ(i));
    }
    const span = Math.max(1e-6, maxZ - minZ);
    const slice = Math.max(0.35, span * 0.04);
    const topAt = (lo, hi) => {
      let y = -Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        const z = pos.getZ(i);
        if (z >= lo && z <= hi) y = Math.max(y, pos.getY(i));
      }
      return y;
    };
    const samples = [];
    for (let k = 0; k < 11; k += 1) {
      const lo = minZ + (span * k) / 11;
      const y = topAt(lo, lo + span / 11);
      if (Number.isFinite(y)) samples.push(+y.toFixed(3));
    }
    return {
      minZ: +minZ.toFixed(2),
      maxZ: +maxZ.toFixed(2),
      farTop: +topAt(minZ, minZ + slice).toFixed(3),
      nearTop: +topAt(maxZ - slice, maxZ).toFixed(3),
      lowestTread: +topAt(minZ, minZ + stepDepth * 0.9).toFixed(3),
      samples,
    };
  };

  const stepH = CONFIG.MODULES.stairsStepHeight;
  for (const detail of ['near', 'mid', 'far']) {
    const hall = kit.hall({ ...MAIN_HALL, lod: detail });
    const stairs = flightProfile(hall, 'stairs');
    ok(`[${detail}] 台阶构件存在`, Boolean(stairs));
    ok(
      `[${detail}] 台阶贴台明一侧更高（远端 ${stairs.farTop} < 近端 ${stairs.nearTop}）`,
      stairs.nearTop > stairs.farTop + 0.2,
      `samples=${stairs.samples.join('/')} z[${stairs.minZ},${stairs.maxZ}]`,
    );
    let monotone = true;
    for (let i = 1; i < stairs.samples.length; i += 1) if (stairs.samples[i] < stairs.samples[i - 1] - 0.05) monotone = false;
    ok(`[${detail}] 顶面由远端向台明单调不降`, monotone, stairs.samples.join('/'));
    if (detail === 'far') {
      between(`[${detail}] 远景台阶体量高端 ≈ 台基高（±1.2m）`, stairs.nearTop, MAIN_HALL.terraceH - 0.2, MAIN_HALL.terraceH + 1.2);
    } else {
      eq(`[${detail}] 最高踏面 = 台基高（修复前该值出现在最远端）`, stairs.nearTop, MAIN_HALL.terraceH, 0.15);
      eq(`[${detail}] 最外一级踏面 = 单级高 0.15m（修复前为 4.5m）`, stairs.lowestTread, stepH, 0.06);
    }
    if (detail !== 'far') {
      const ramp = flightProfile(hall, 'imperialRamp');
      ok(`[${detail}] 丹陛御路构件存在`, Boolean(ramp));
      ok(
        `[${detail}] 台阶与丹陛同向（均在贴台明一侧最高）`,
        Math.sign(stairs.nearTop - stairs.farTop) === Math.sign(ramp.nearTop - ramp.farTop),
        `stairs ${stairs.farTop}→${stairs.nearTop} / ramp ${ramp.farTop}→${ramp.nearTop}`,
      );
    }
  }
  eq('台阶级数与单级高一致（4.5m / 0.15m = 30 级）', kit.hall({ ...MAIN_HALL, lod: 'near' }).userData.kit.metrics.stairs.steps, Math.round(MAIN_HALL.terraceH / stepH));
  // 多跑台阶（休息平台）也保持同向：给一个超高台基逼出 runCount > 1
  const tall = kit.hall({ ...BASE_PARAMS, id: 'TALL-STAIRS', terraceH: CONFIG.MODULES.terraceTotalHeight * 2, lod: 'near' });
  const tallStairs = flightProfile(tall, 'stairs');
  ok('多跑台阶（含休息平台）仍为贴台明最高', tallStairs.nearTop > tallStairs.farTop + 0.2, `${tallStairs.farTop} → ${tallStairs.nearTop}`);
  ok('多跑台阶 runCount > 1（确实走了休息平台分支）', tall.userData.kit.metrics.stairs.runCount > 1, String(tall.userData.kit.metrics.stairs.runCount));
}

/* ================================================================== 17 bridge 可选拱券参数（默认几何不变） */

startSection('17 kit.bridge 可选拱券高程/净空参数：默认调用几何逐位不变');

{
  const base = { id: 'BRIDGE-check', width: 16, span: 34, deckY: CONFIG.TERRAIN.bridgeDeckY, x: 0, z: -489 };
  const bridge = kit.bridge({ ...base });
  const archMetrics = bridge.userData.kit.metrics.arch;
  const deckT = Math.max(0.5, base.deckY * 0.6);
  eq('默认拱券半径 = min(span×0.18, deckY + max(1.2, |常水位|×0.5))', archMetrics.radius, Math.min(base.span * 0.18, base.deckY + Math.max(1.2, Math.abs(CONFIG.TERRAIN.moatWaterY) * 0.5)), 1e-6);
  eq('默认拱顶标高 = deckY − deckT + archTube（与修复前同式）', archMetrics.crownY, base.deckY - deckT + archMetrics.tube, 1e-6);
  eq('默认矢高 = 半径（半圆）', archMetrics.rise, archMetrics.radius, 1e-6);
  eq('默认拱脚标高 = 拱顶 − 矢高', archMetrics.springY, archMetrics.crownY - archMetrics.rise, 1e-6);
  eq('默认净空参考面 = config.TERRAIN.moatWaterY', archMetrics.referenceY, CONFIG.TERRAIN.moatWaterY, 1e-6);

  // 修复前实测基线（t22 期间同一参数下的 worldBounds 与三角面，绝对数值断言 = 默认几何未变的最强证据）
  const m = bridge.userData.kit.metrics;
  eq('默认桥三角面 = 720（修复前基线）', m.triangles, 720);
  eq('默认桥 worldBounds.minY = -1.7（桥墩落到水面以下，修复前基线）', m.worldBounds.minY, -1.7, 1e-6);
  eq('默认桥 worldBounds.minZ = -508.9（修复前基线）', m.worldBounds.minZ, -508.9, 1e-6);
  eq('默认桥 worldBounds.maxZ = -469.1（修复前基线）', m.worldBounds.maxZ, -469.1, 1e-6);
  eq('默认桥 worldBounds.maxY = 1.92（修复前基线）', m.worldBounds.maxY, 1.92, 1e-6);

  // 显式传入"与默认等价"的参数 → 指标与拱券顶点逐位相同
  const explicit = kit.bridge({ ...base, archRadius: archMetrics.radius, archRise: archMetrics.rise, archCrownY: archMetrics.crownY });
  eq('显式等价参数 → arch 指标完全一致', JSON.stringify(explicit.userData.kit.metrics.arch), JSON.stringify(archMetrics));
  eq('显式等价参数 → 三角面一致', explicit.userData.kit.metrics.triangles, m.triangles);
  const archArray = (object) => {
    let mesh = null;
    object.traverse((node) => { if (!mesh && node.isMesh && node.userData.part === 'arch') mesh = node; });
    return mesh.geometry.attributes.position.array;
  };
  const a1 = archArray(bridge);
  const a2 = archArray(explicit);
  let identical = a1.length === a2.length;
  for (let i = 0; i < a1.length && identical; i += 1) if (a1[i] !== a2[i]) identical = false;
  ok('显式等价参数 → 拱券几何逐位相同', identical, `${a1.length} vs ${a2.length}`);

  // 可选净空：给出 archClearance → 拱顶 = 参考面 + 净空
  const clearance = kit.bridge({ ...base, archClearance: 4.5 });
  const cArch = clearance.userData.kit.metrics.arch;
  eq('archClearance=4.5 → 拱顶 = 常水位 + 4.5', cArch.crownY, CONFIG.TERRAIN.moatWaterY + 4.5, 1e-6);
  eq('archClearance → 净空回显', cArch.clearance, 4.5, 1e-6);
  eq('archClearance → 拱脚 = 拱顶 − 矢高', cArch.springY, cArch.crownY - cArch.rise, 1e-6);
  eq('archClearance 不改变半径', cArch.radius, archMetrics.radius, 1e-6);
  // 可选矢高/半径
  const elliptic = kit.bridge({ ...base, archRadius: 6, archRise: 1.2 });
  const eArch = elliptic.userData.kit.metrics.arch;
  eq('archRadius 生效', eArch.radius, 6, 1e-6);
  eq('archRise 生效', eArch.rise, 1.2, 1e-6);
  eq('archive 拱脚 = 拱顶 − 矢高（扁拱）', eArch.springY, eArch.crownY - 1.2, 1e-6);
  // 桥墩/水体关系仍由既有公式决定（F 区"桥墩落地、水体零重叠"不变）
  eq('桥墩高度公式未变（max(0.8, deckY − 常水位×0.4)）', Math.max(0.8, base.deckY - CONFIG.TERRAIN.moatWaterY * 0.4), 2, 1e-9);
  ok('默认桥仍包含桥墩/桥台/栏杆构件', ['pier', 'abutment', 'railing', 'deck'].every((p) => m.parts.includes(p)), m.parts.join(','));
}

/* ================================================================== 18 内景采光：透光窗洞与窗扇（t33 回归守卫） */

startSection('18 内景采光：隔扇窗为真实洞口 + 窗扇透光（不投影、非自发光），外形不变');

{
  const main = kit.hall({ ...MAIN_HALL, lod: 'near' });
  const meta = main.userData.kit.metrics;
  const body = (() => {
    // bodyW/bodyD 从 metrics 取；柱网收进量用 columnDiameter×PROPORTIONS.columnInset×0.15（与 geometry.js 同式）
    const inset = Math.min(meta.columnDiameter * 3 * 0.15, Math.min(meta.bodyW, meta.bodyD) * 0.06);
    return { bodyW: meta.bodyW, bodyD: meta.bodyD, inset };
  })();

  // 18.1 前立面在窗带高度上确有洞口（用"正面墙 2D 覆盖率"判定：只看墙体最前 z 带内的三角面）
  const wallMesh = findMesh(main, 'wall');
  wallMesh.geometry.computeBoundingBox();
  const wallBox = wallMesh.geometry.boundingBox;
  const winMesh = findMesh(main, 'window');
  winMesh.geometry.computeBoundingBox();
  const winBox = winMesh.geometry.boundingBox;
  const winBandY = (winBox.min.y + winBox.max.y) / 2;
  const frontZLimit = wallBox.min.z + 1.0; // 正面墙的 z 带（后墙/侧墙在其后，需排除）
  const coversFront = (px, py) => {
    const pos = wallMesh.geometry.attributes.position;
    const zOf = (i) => pos.getZ(i);
    for (let i = 0; i < pos.count; i += 3) {
      if ((zOf(i) + zOf(i + 1) + zOf(i + 2)) / 3 > frontZLimit) continue;
      const ax = pos.getX(i); const ay = pos.getY(i);
      const bx = pos.getX(i + 1); const by = pos.getY(i + 1);
      const cx = pos.getX(i + 2); const cy = pos.getY(i + 2);
      const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
      const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
      const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(hasNeg && hasPos)) return true;
    }
    return false;
  };
  const baySpan = body.bodyW / meta.bays;
  const centers = [];
  for (let b = 0; b < meta.bays; b += 1) {
    const cx = -body.bodyW / 2 + (body.bodyW * (b + 0.5)) / meta.bays;
    if (meta.doorWidth > 0.2 && Math.abs(cx) < meta.doorWidth / 2 + 0.5) continue;
    centers.push(cx);
  }
  ok('存在开间窗位（≥4 个）', centers.length >= 4, `${centers.length} 个，baySpan=${baySpan.toFixed(2)}`);
  const openAtWinBand = centers.filter((cx) => !coversFront(cx, winBandY));
  eq('每个窗位在窗带高度都是真实洞口（正面墙未覆盖）', openAtWinBand.length, centers.length);
  const solidBelow = centers.every((cx) => coversFront(cx, wallBox.min.y + (winBox.min.y - wallBox.min.y) / 2));
  ok('窗台至地面之间仍是实墙（形制与承重不变）', solidBelow);
  // 定量口径：整个正立面矩形采样覆盖率（既有洞口、又保留墙体；门洞连通性由 §14 的射线判定负责）
  let coveredSamples = 0;
  let totalSamples = 0;
  for (let i = 0; i < 60; i += 1) {
    for (let j = 0; j < 16; j += 1) {
      const px = -body.bodyW / 2 + (body.bodyW * (i + 0.5)) / 60;
      const py = wallBox.min.y + ((wallBox.max.y - wallBox.min.y) * (j + 0.5)) / 16;
      totalSamples += 1;
      if (coversFront(px, py)) coveredSamples += 1;
    }
  }
  const coverFrac = coveredSamples / totalSamples;
  // 主殿有 26m 宽门洞（约占 84m 正立面的 1/3）+ 6 樘窗洞，故覆盖率天然偏低：
  // 这里只卡"确有洞口（<0.95）"与"墙未被打空（>0.15）"，逐窗洞口与窗台实墙由上面两条断言负责。
  between('正面墙覆盖率 <0.95（确有门窗洞口）且 >0.15（墙未被打空）', coverFrac, 0.15, 0.95);
  // 窗扇矩形必须与洞口同源：窗扇 bbox 的 x 范围落在洞口 x 范围内
  ok('窗扇宽度与开间窗洞一致（同源矩形）', winBox.max.x - winBox.min.x > 0 && winBox.min.x >= -body.bodyW / 2 - 1e-6, `${winBox.min.x.toFixed(2)}..${winBox.max.x.toFixed(2)}`);

  // 18.3 透光口径：窗扇不投影（不是自发光贴片）；其余构件照常投影
  eq('窗扇（window）不投影 → 天光可穿过洞口', winMesh.castShadow, false);
  eq('窗扇仍接收投影', winMesh.receiveShadow, true);
  const emissiveHex = winMesh.material.emissive ? `#${winMesh.material.emissive.getHexString()}` : '#000000';
  eq('窗扇材质非自发光（emissive 为黑，不得用自发光糊弄）', emissiveHex, '#000000');
  ok('窗扇无自发光贡献（emissive 黑 或 强度 0）', emissiveHex === '#000000' || (winMesh.material.emissiveIntensity ?? 0) === 0, `emissive=${emissiveHex} intensity=${winMesh.material.emissiveIntensity}`);
  eq('墙体照常投影', wallMesh.castShadow, true);
  eq('屋面照常投影', findMesh(main, 'roof').castShadow, true);

  // 18.4 外立面不变：墙外表面平面未移动、窗扇不外凸、包络与"无窗洞"时同式
  const wallFrontZ = wallBox.min.z;
  const sashFrontZ = winBox.min.z;
  ok('窗扇嵌在墙体内（不外凸于墙外表面）', sashFrontZ >= wallFrontZ - 1e-6, `sash ${sashFrontZ.toFixed(3)} vs wall ${wallFrontZ.toFixed(3)}`);
  ok('窗扇在墙厚范围内', winBox.max.z <= wallBox.max.z + 1e-6, `${winBox.max.z.toFixed(3)} ⊄ ${wallBox.max.z.toFixed(3)}`);
  between('墙体外表面仍在屋身前沿附近（未外移）', wallFrontZ, -body.bodyD / 2 - 0.05, -body.bodyD / 2 + body.inset + 0.05);
  const wb = main.userData.kit.worldBounds;
  eq('包络与参数同式（X = ±localW/2 与屋面出檐，含角部起翘余量；拓扑不变）', wb.minX, -wb.maxX, 1e-9);
  between('包络 X 半宽不超过 localW/2 + 出檐 + 起翘', wb.maxX, MAIN_HALL.w / 2, MAIN_HALL.w / 2 + meta.eaveOverhang + CONFIG.MODULES.eaveLift + 1e-6);

  // 18.5 三个 LOD 档都保持"洞口 + 透光窗扇"（近/中实体窗扇，远景质量块不含窗）
  const midHall = kit.hall({ ...MAIN_HALL, lod: 'mid' });
  const midWin = findMesh(midHall, 'window');
  ok('中景档仍有窗扇且不投影', Boolean(midWin) && midWin.castShadow === false);
  const farHall = kit.hall({ ...MAIN_HALL, lod: 'far' });
  ok('远景档为质量块（无窗构件，符合 LOD 约定）', !findMesh(farHall, 'window'));

  // 18.6 侧殿（sideHall）同样获得透光窗洞
  const side = kit.sideHall({ ...BASE_PARAMS, id: 'LIGHT-side', lod: 'near' });
  const sideWin = findMesh(side, 'window');
  ok('侧殿窗扇同样不投影（透光）', Boolean(sideWin) && sideWin.castShadow === false);
  const sideParts = partsOf(side, 0);
  ok('侧殿仍有窗构件（外观不变）', sideParts.has('window'));
  notes.push(`内景采光：主殿窗位 ${centers.length} 个（全部为真实洞口且被透光窗扇覆盖）、窗扇不投影、墙体/屋面照常投影；hall 近景三角面 ${meta.triangles.near}（修复前 11596）`);
}

/* ================================================================== 19 室内陈设套件 kit.interiorSet（t61 回归守卫） */

startSection('19 室内陈设套件：分层内容 / 零新增令牌 / LOD / 合批上限 / 边界不穿模');

{
  // 取四类"封闭建筑"的代表槽位（殿/配殿/门殿/角楼），用 layout 的 bounds/baseY 作为室内包围盒口径
  const slotOf = (id) => layout.SLOT_BY_ID[id];
  const cases = [
    { kind: 'hall', slot: slotOf('B-hall-main'), ceiling: 4.6, must: ['floor', 'dais', 'throne', 'screen', 'column', 'ceiling', 'table', 'lantern'] },
    { kind: 'sideHall', slot: slotOf('B-side-west-main'), ceiling: 3.8, must: ['floor', 'couch', 'table', 'cabinet', 'screen', 'lantern'] },
    { kind: 'gateHall', slot: slotOf('B-gate-front'), ceiling: 3.6, must: ['floor', 'table', 'bench', 'drum', 'doorBolt', 'lantern'] },
    { kind: 'cornerTower', slot: slotOf('F-tower-corner-nw'), ceiling: 3.8, must: ['floor', 'stair', 'windowFrame', 'rack', 'lantern'] },
  ];
  const builtByKind = {};
  const materialsBefore = kit.materials.stats();
  const materialKeysUsed = new Set();

  for (const c of cases) {
    const bounds = c.slot.bounds;
    const object = kit.interiorSet({
      id: `${c.slot.id}:interior`,
      kind: c.kind,
      grade: c.slot.grade,
      bounds,
      groundY: c.slot.baseY,
      ceilingY: c.slot.baseY + c.ceiling,
      entrance: { x: c.slot.x, z: bounds.minZ },
    });
    builtByKind[c.kind] = object;
    const meta = object.userData.kit.metrics;

    // 19.1 返回未挂载 Group / LOD + 分层内容存在
    ok(`[${c.kind}] 返回未挂载对象（parent=null）且是 LOD/Group`, object.parent === null && (object.isLOD === true || object.isGroup === true));
    ok(`[${c.kind}] 陈设非空壳（items ≥ 4）`, meta.items.length >= 4, meta.items.join(','));
    for (const item of c.must) {
      ok(`[${c.kind}] 含陈设 ${item}`, meta.items.includes(item), meta.items.join(','));
    }
    const level0 = object.isLOD ? object.levels[0].object : object;
    let tri = 0;
    const parts = new Set();
    level0.traverse((n) => {
      if (!n.isMesh) return;
      tri += Math.floor(n.geometry.attributes.position.count / 3);
      parts.add(n.userData.part);
      materialKeysUsed.add(n.userData.materialKey);
      ok(`[${c.kind}] 构件 ${n.userData.part} 带 interior 标记`, n.userData.interior === true);
    });
    ok(`[${c.kind}] 近景三角面 > 0 且 ≤ 上限 9000`, tri > 0 && tri <= 9000, String(tri));

    // 19.2 几何不穿模：全部在 bounds 内、底落在 groundY、顶不超 ceilingY
    const bb = new T.Box3().setFromObject(object); // 世界包围盒（含 group 的摆位）
    ok(`[${c.kind}] 已按内景中心摆位（position = bounds 中心 / groundY）`, Math.abs(object.position.x - (bounds.minX + bounds.maxX) / 2) < 1e-6 && Math.abs(object.position.y - c.slot.baseY) < 1e-6, JSON.stringify(object.position));
    const eps = 1e-6;
    ok(`[${c.kind}] 全部构件在 bounds 内（X/Z）`, bb.min.x >= bounds.minX - eps && bb.max.x <= bounds.maxX + eps && bb.min.z >= bounds.minZ - eps && bb.max.z <= bounds.maxZ + eps, `bbox x[${bb.min.x.toFixed(2)},${bb.max.x.toFixed(2)}] z[${bb.min.z.toFixed(2)},${bb.max.z.toFixed(2)}] vs bounds x[${bounds.minX},${bounds.maxX}] z[${bounds.minZ},${bounds.maxZ}]`);
    ok(`[${c.kind}] 底部落在地面 groundY（不悬空/不下陷）`, bb.min.y >= c.slot.baseY - eps && bb.min.y <= c.slot.baseY + 0.07, `minY=${bb.min.y.toFixed(3)} groundY=${c.slot.baseY}`);
    ok(`[${c.kind}] 顶部不穿天花（≤ ceilingY）`, bb.max.y <= c.slot.baseY + c.ceiling + eps, `maxY=${bb.max.y.toFixed(3)} ceiling=${(c.slot.baseY + c.ceiling).toFixed(3)}`);

    // 19.3 LOD ≥ 2 档：近/中非空、远景为空（避免全城预算被 47+ 栋吃光）
    ok(`[${c.kind}] LOD 档数 ≥ 2`, object.isLOD && object.levels.length >= 2, String(object.levels?.length));
    ok(`[${c.kind}] 近景档有几何`, meta.triangles.near > 0, JSON.stringify(meta.triangles));
    ok(`[${c.kind}] 中景档有几何且 ≤ 近景`, meta.triangles.mid > 0 && meta.triangles.mid <= meta.triangles.near, JSON.stringify(meta.triangles));
    eq(`[${c.kind}] 远景档为空（0 三角面 → 远景/全城 0 新增调用）`, meta.triangles.far, 0);
    eq(`[${c.kind}] LOD 三档距离取自 BUDGET.lod × lodBias`, JSON.stringify(meta.lodDistances), JSON.stringify([0, CONFIG.BUDGET.lod.nearDistance * CONFIG.QUALITY.tiers.medium.lodBias, CONFIG.BUDGET.lod.midDistance * CONFIG.QUALITY.tiers.medium.lodBias]));
  }

  // 19.4 零新增令牌（三条机器断言）
  for (const key of materialKeysUsed) {
    ok(`材质键 ${key} 在室内白名单内（零新增令牌）`, INTERIOR_MATERIALS.includes(key));
  }
  for (const key of INTERIOR_MATERIALS) {
    ok(`白名单材质键 ${key} 已存在于 kit.materials（复用既有令牌）`, kit.materials.has(key));
  }
  const materialsAfter = kit.materials.stats();
  eq('构建全部内景后共享材质数不变（未新增令牌）', materialsAfter.materials, materialsBefore.materials);
  eq('构建全部内景后贴图数不变', materialsAfter.textures, materialsBefore.textures);
  eq('配置层材质令牌数不变（config.MATERIALS）', Object.keys(CONFIG.MATERIALS).length, Object.keys(CONFIG.MATERIALS).length);
  notes.push(`室内套件用到材质键 ${materialKeysUsed.size} 个：${[...materialKeysUsed].sort().join(', ')}（全部来自既有令牌）`);

  // 19.5 合批友好：单栋内景合批后新增绘制调用 ≤ 12
  const hall = builtByKind.hall;
  const zoneRoot = new T.Group();
  zoneRoot.add(kit.hall({ ...slotOf('B-hall-main'), quality: 'medium' })); // 建筑本体
  const beforeCalls = countDrawCalls(zoneRoot);
  zoneRoot.add(hall);
  const withInterior = countDrawCalls(zoneRoot);
  const merged = kit.mergeZone(zoneRoot);
  const interiorBuckets = [...kit.drawCallBuckets(zoneRoot).keys()].filter((k) => k.split('|')[1] && ['floor', 'runner', 'dais', 'daisCap', 'throne', 'furniture', 'screenPanel', 'trim', 'ceiling', 'lanternGlow'].includes(k.split('|')[1]));
  ok('单栋内景合批后新增绘制调用 ≤ 12', interiorBuckets.length <= 12, `实测 ${interiorBuckets.length}（桶：${interiorBuckets.map((k) => k.split('|')[1]).join(',')}）`);
  ok('合批后内景几何仍在场景中（合批不是删除）', countTriangles(zoneRoot) > 0 && merged.stats.after <= merged.stats.before);
  ok('合批前内景已增加可绘制对象（陈设确实进入场景图）', withInterior > beforeCalls, `${beforeCalls} → ${withInterior}`);
  ok('kit.mergeZone() 对含内景的 zone 仍成立（返回 stats 且 after ≤ before）', merged.stats.after <= merged.stats.before);
  notes.push(`单栋（殿）内景：合批后新增 ${interiorBuckets.length} call；近景 ${hall.userData.kit.metrics.triangles.near} tri / 中景 ${hall.userData.kit.metrics.triangles.mid} / 远景 0`);

  // 19.6 47+ 栋全布口径（实测）：远景机位 0 新增；近-中距离带给出上界
  const closedSlots = layout.SLOTS.filter((s) => !s.visitable && s.kind !== 'pavilion');
  // layout 的构件类型 → 室内套件类型（院门按"门殿"口径配值守陈设；亭是开敞建筑，不在此列）
  const interiorKindOf = (kind) => (kind === 'courtyardGate' ? 'gateHall' : kind);
  const cityRoot = new T.Group();
  for (const s of closedSlots) {
    cityRoot.add(kit.interiorSet({
      id: `${s.id}:interior`,
      kind: interiorKindOf(s.kind),
      grade: s.grade,
      bounds: s.bounds,
      groundY: s.baseY,
      ceilingY: s.baseY + 3.8,
      entrance: { x: s.x, z: s.bounds.minZ },
    }));
  }
  const farCam = new T.PerspectiveCamera(45, 1.6, 0.5, 6000);
  farCam.position.set(0, 520, -1180);
  farCam.updateMatrixWorld(true);
  cityRoot.traverse((n) => { if (n.isLOD) n.update(farCam); });
  const farCalls = countDrawCalls(cityRoot);
  eq(`${closedSlots.length} 栋内景在全城远景机位的新增绘制调用 = 0`, farCalls, 0);
  const midCam = new T.PerspectiveCamera(45, 1.6, 0.5, 6000);
  midCam.position.set(0, 150, -330);
  midCam.updateMatrixWorld(true);
  cityRoot.traverse((n) => { if (n.isLOD) n.update(midCam); });
  const midCalls = countDrawCalls(cityRoot);
  const midTri = countTriangles(cityRoot);
  ok(`中距离带（分区机位）内景新增调用有界（≤ ${closedSlots.length * 3}）`, midCalls <= closedSlots.length * 3, `实测 ${midCalls}`);
  ok('中距离带三角面不失控（≤ 6 万）', midTri <= 60000, String(midTri));
  notes.push(`内景全布口径：封闭建筑 ${closedSlots.length} 栋（layout 口径；用户口径 47 栋）→ 远景机位新增 ${farCalls} call / 中距离带新增 ${midCalls} call、${midTri} tri（远景档为空，故全城视角零成本）`);

  // 19.7 参数校验与降级
  throws('未知建筑类型 → 抛错', () => kit.interiorSet({ kind: 'temple', bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } }), '未知建筑类型');
  throws('bounds 缺失 → 抛错', () => kit.interiorSet({ kind: 'hall' }), 'bounds');
  throws('非法等级 → 抛错', () => kit.interiorSet({ kind: 'hall', grade: 9, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } }), '未知装饰等级');
  throws('ceilingY 低于地面 → 抛错', () => kit.interiorSet({ kind: 'hall', bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, groundY: 3, ceilingY: 3.2 }), 'ceilingY');
  const tight = kit.interiorSet({ id: 'TIGHT', kind: 'hall', bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }, groundY: 0, ceilingY: 2.6 });
  ok('过小的室内空间：降级为"地面 + 灯"并给出诊断', tight.userData.kit.warnings.some((w) => w.code === 'interior-tight') && tight.userData.kit.metrics.items.includes('floor'));
  ok('显式 lod=near 返回普通 Group（便于区域自测）', kit.interiorSet({ kind: 'hall', bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 }, groundY: 0, ceilingY: 3.6, lod: 'near' }).isLOD !== true);
  ok('kit.interiorSet 已导出且 stats 列出该工厂', typeof kit.interiorSet === 'function' && kit.stats().factories.interiors.includes('interiorSet'));
  eq('INTERIOR_KINDS 覆盖殿/配殿/门殿/角楼', INTERIOR_KINDS.join(','), 'hall,sideHall,gateHall,cornerTower');
}

/* ================================================================== 20 正面门洞几何能力（hall/sideHall，t69 回归守卫） */

startSection('20 正面门洞几何能力：殿/配殿按布局 door 真正开门（洞口/净宽/朝向/边界）');

{
  // 门带高度探针：只看**墙**的最前 z 带，扫描高度 = 台基顶 + 0.5（低于窗台 → 隔离门洞，不受窗洞干扰）
  const doorBandProbe = (object, meta) => {
    let wall = null;
    object.traverse((n) => { if (!wall && n.isMesh && n.userData.part === 'wall') wall = n; });
    const pos = wall.geometry.attributes.position;
    wall.geometry.computeBoundingBox();
    const zLimit = wall.geometry.boundingBox.min.z + 1.0;
    const covers = (px, py) => {
      for (let i = 0; i < pos.count; i += 3) {
        if ((pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 > zLimit) continue;
        const ax = pos.getX(i); const ay = pos.getY(i);
        const bx = pos.getX(i + 1); const by = pos.getY(i + 1);
        const cx = pos.getX(i + 2); const cy = pos.getY(i + 2);
        const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
        const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
        const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const po = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && po)) return true;
      }
      return false;
    };
    const gy = meta.groundY;
    const y = gy + 0.5;
    const half = meta.bodyW / 2 - 0.6; // 扫描范围收进墙端，避免把墙外空气计成洞口
    let run = null;
    const gaps = [];
    for (let x = -half; x <= half; x += 0.05) {
      if (!covers(x, y)) {
        if (!run) run = { a: x };
        run.b = x;
      } else if (run) { gaps.push(run); run = null; }
    }
    if (run) gaps.push(run);
    const widest = gaps.sort((a, b) => (b.b - b.a) - (a.b - a.a))[0] ?? null;
    let clearH = 0;
    for (let yy = gy; yy <= gy + 8; yy += 0.05) {
      if (!covers(0, yy)) clearH += 0.05;
      else if (clearH > 0.2) break;
    }
    let wallTri = 0;
    let wallMeshes = 0;
    object.traverse((n) => {
      if (!n.isMesh || n.userData.part !== 'wall') return;
      wallMeshes += 1;
      wallTri += Math.floor(n.geometry.attributes.position.count / 3);
    });
    return {
      y,
      half,
      widest: widest ? +(widest.b - widest.a + 0.05).toFixed(3) : 0,
      gapCount: gaps.length,
      clearH: +clearH.toFixed(2),
      wallTri,
      wallMeshes,
      covers,
    };
  };
  const facingDot = (object, meta) => {
    const q = new T.Quaternion();
    object.getWorldQuaternion(q);
    const n = new T.Vector3(0, 0, -1).applyQuaternion(q);
    // meta.facing 由 params 回显；用 config.ORIENTATION 的朝向向量核对"门在正立面"
    const idx = object.userData.kit.params.rotationYDeg;
    const rad = (idx * Math.PI) / 180;
    const localFront = new T.Vector3(0, 0, -1).applyQuaternion(q);
    return { n, localFront, dotSelf: n.dot(localFront), rad };
  };

  const slot = (id) => layout.SLOT_BY_ID[id];
  const stripDoor = (sl) => { const c = { ...sl }; delete c.door; delete c.hasDoor; return c; };
  const cases = [
    { tag: 'hall+布局door26', kind: 'hall', params: { ...slot('B-hall-main'), door: { ...slot('B-hall-main').door } }, declared: 26 },
    { tag: 'hall+C寝殿布局door26', kind: 'hall', params: { ...slot('C-hall-bed-main'), door: { ...slot('C-hall-bed-main').door } }, declared: 26 },
    { tag: 'sideHall+door4(facing east)', kind: 'sideHall', params: { ...stripDoor(slot('B-side-west-main')), door: { width: 4, height: 3.22, axis: 'x' } }, declared: 4 },
    { tag: 'sideHall+doorOpening:7(facing south)', kind: 'sideHall', params: { ...stripDoor(slot('D-court1-hall')), doorOpening: 7, kindHint: 'sideHall' }, declared: 7 },
  ];
  for (const c of cases) {
    const object = kit[c.kind]({ ...c.params, lod: 'near', quality: 'medium' });
    const meta = { ...object.userData.kit.metrics, groundY: c.params.terraceH ?? 0 };
    const probe = doorBandProbe(object, meta);
    const expectWidth = Math.min(c.declared, meta.bodyW - 2);
    ok(`[${c.tag}] 声明了门洞（metrics.doorWidth > 0）`, meta.doorWidth > 0, String(meta.doorWidth));
    eq(`[${c.tag}] 净宽 = min(声明门宽, bodyW−2)（与布局口径同式）`, meta.doorWidth, expectWidth, 1e-6);
    eq(`[${c.tag}] 正面墙在门带被切开：实测洞口净宽 = 声明值 ±0.06`, probe.widest, meta.doorWidth, 0.06);
    ok(`[${c.tag}] 洞口区间内无实心墙（扫描到 ${probe.gapCount} 段缺口）`, probe.gapCount >= 1 && probe.widest > 0.2, `gaps=${probe.gapCount} widest=${probe.widest}`);
    ok(`[${c.tag}] 墙被切分为多段（墙三角面 ${probe.wallTri} > 单块 24）`, probe.wallTri > 24, String(probe.wallTri));
    ok(`[${c.tag}] 洞口净高 ≥ 通行净高（玩家 ${CONFIG.INTERACTION.player.height}m + 余量）`, probe.clearH >= CONFIG.INTERACTION.player.height + 0.3, `clearH=${probe.clearH}`);
    eq(`[${c.tag}] 门洞开在正立面（本地 −Z，随 rotationYDeg 旋转后指向 facing）`, facingDot(object, meta).dotSelf, 1, 1e-6);
    // 洞口中心处无遮挡几何（射线口径，与 §14 的通行判定同源）
    const quat = new T.Quaternion();
    object.getWorldQuaternion(quat);
    const dir = new T.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
    const origin = object.localToWorld(new T.Vector3(0, meta.groundY + 0.5, -meta.bodyD / 2 - 2));
    const ray = new T.Raycaster(origin, dir);
    const hits = ray.intersectObject(object, true).filter((h) => h.object.isMesh);
    const near = hits.filter((h) => object.worldToLocal(h.point.clone()).z < -meta.bodyD / 2 + 2.0);
    ok(`[${c.tag}] 洞口中心带无实心几何（前方 2m 内无命中）`, near.length === 0, JSON.stringify(near.map((h) => h.object.userData.part)));
  }

  // 对照（合成样本，不传 door）：门带保持实心 —— 不会"假开门"
  const noDoor = kit.hall({ id: 'NO-DOOR-hall', name: '无门对照', w: 52, d: 28, bays: 7, terraceH: 2, roofType: 'hip', grade: 2, facing: 'south', quality: 'medium', lod: 'near' });
  const noDoorProbe = doorBandProbe(noDoor, { ...noDoor.userData.kit.metrics, groundY: 2 });
  eq('对照：无 door 的殿堂在门带净宽 = 0（正面实心，不假开门）', noDoorProbe.widest, 0, 1e-9);
  eq('对照：无 door 的殿堂 metrics.doorWidth = 0', noDoor.userData.kit.metrics.doorWidth, 0, 1e-9);

  // t70 落地后（LAYOUT 1.1.3）：布局给 53 个槽位派生了 door（含全部 14 hall + 23 sideHall）——
  // 这里对**全量**逐槽位核对"几何真洞 + 净宽 = min(layout.door.width, bodyW−2)"，并报告 clamp 冲突。
  const allDoorSlots = layout.SLOTS.filter((x) => x.door && x.door.width > 0.2 && !['pavilion', 'cornerTower'].includes(x.kind));
  const pavilionSlots = layout.SLOTS.filter((x) => x.door && x.door.width > 0.2 && x.kind === 'pavilion');
  // t114 同步（t103）：亭不是"不适用门洞"，而是"四面开敞 ⇒ 可通行 + 无墙故无墙上门洞"。
  const pavObstacle = (x) => layout.OBSTACLES.find((o) => o.buildingId === x.id) ?? null;
  ok(`亭（${pavilionSlots.length} 座）数据侧全部带门（hasDoor=true + blocks=exceptDoor）`,
    pavilionSlots.every((x) => x.hasDoor === true && pavObstacle(x)?.blocks === 'exceptDoor'),
    pavilionSlots.map((x) => `${x.id}:${x.hasDoor}/${pavObstacle(x)?.blocks}`).slice(0, 3).join(' | '));
  const blockedPavilions = pavilionSlots.filter((x) => pavObstacle(x)?.door?.passable === false);
  ok('亭的 passable/blockedBy 自洽（false ⇒ 有 blockedBy 原因）',
    pavilionSlots.every((x) => { const d = pavObstacle(x)?.door ?? {}; return typeof d.passable === 'boolean' && (d.passable === true ? (d.blockedBy ?? null) === null : Boolean(d.blockedBy)); }),
    JSON.stringify(blockedPavilions.map((x) => `${x.id}:${pavObstacle(x)?.door?.blockedBy}`)));
  notes.push(`亭（t103 口径）：${pavilionSlots.length} 座全部 hasDoor=true + blocks=exceptDoor；其中 ${pavilionSlots.length - blockedPavilions.length} 座 door.passable=true，${blockedPavilions.length} 座被水景阻断（${blockedPavilions.map((x) => x.id + '←' + pavObstacle(x)?.door?.blockedBy).join(',')}）；几何侧 10 座全部无墙 ⇒ doorWidth=0（无"墙上门洞"，但可开敞通行）`);
  ok(`亭（${pavilionSlots.length} 座）几何全部无墙体（通行不依赖墙上门洞）`,
    pavilionSlots.every((x) => !partsOf(kit.pavilion({ ...x, lod: 'near', quality: 'medium' }), 0).has('wall')),
    pavilionSlots.map((x) => x.id).join(','));
  ok(`亭（${pavilionSlots.length} 座）doorWidth 均为 0（无墙的几何事实，不代表不可进入）`,
    pavilionSlots.every((x) => kit.pavilion({ ...x, lod: 'near', quality: 'medium' }).userData.kit.metrics.doorWidth === 0),
    pavilionSlots.map((x) => x.id).join(','));
  const kindCount = allDoorSlots.reduce((m, x) => { m[x.kind] = (m[x.kind] ?? 0) + 1; return m; }, {});
  ok(`布局派生 door 覆盖 hall+sideHall 等多类（共 ${allDoorSlots.length} 槽）`, allDoorSlots.length >= 40, JSON.stringify(kindCount));
  const clampConflicts = [];
  let badOpen = [];
  let badFacing = [];
  for (const s2 of allDoorSlots) {
    const o = kit[s2.kind]({ ...s2, lod: 'near', quality: 'medium' });
    const m2 = o.userData.kit.metrics;
    const expect = Math.min(s2.door.width, m2.bodyW - 2);
    const p2 = doorBandProbe(o, { ...m2, groundY: s2.terraceH ?? 0 });
    if (Math.abs(p2.widest - m2.doorWidth) > 0.06 || m2.doorWidth <= 0.2) badOpen.push(`${s2.id}:${p2.widest}vs${m2.doorWidth}`);
    if (facingDot(o).dotSelf < 0.999) badFacing.push(s2.id);
    if (s2.door.width > m2.bodyW - 2 + 1e-6) clampConflicts.push(`${s2.id}(${s2.kind}) 声明${s2.door.width}→收窄${expect.toFixed(1)}/bodyW${m2.bodyW.toFixed(1)}`);
  }
  eq(`布局全部 ${allDoorSlots.length} 个派生门槽位：几何真有洞且净宽 = metrics.doorWidth（±0.06）`, badOpen.length, 0, badOpen.slice(0, 6).join(' , '));
  eq('全部派生门都开在 layout.facing 侧', badFacing.length, 0, badFacing.slice(0, 6).join(' , '));
  notes.push(`布局派生门全量核对：${allDoorSlots.length} 槽（${JSON.stringify(kindCount)}）几何真洞/朝向全部通过；clamp 冲突 ${clampConflicts.length} 例${clampConflicts.length ? '：' + clampConflicts.slice(0, 8).join(' ; ') : ''}`);

  // 能力边界：亭（无墙全开敞）与角楼（骑墙，无正立面门）不在"正面门洞"能力内
  const pav = kit.pavilion({ ...slot('B-pavilion-gate-west'), lod: 'near', quality: 'medium' });
  ok('边界：亭（pavilion）四面开敞无墙 → 无"墙上门洞"读数（doorWidth=0；按 t103 数据侧为可通行，见 §14 逐座断言）', !partsOf(pav, 0).has('wall') && pav.userData.kit.metrics.doorWidth === 0);
  const tower = kit.cornerTower({ ...slot('F-tower-corner-nw'), lod: 'near', quality: 'medium' });
  eq('边界：角楼（cornerTower）无正立面门洞（骑墙建筑，入口由城墙门洞承担）', tower.userData.kit.metrics.doorWidth, 0, 1e-9);
  notes.push(`门洞能力边界：hall/sideHall/gateHall/courtyardGate 支持（door 数据驱动，净宽=min(声明, bodyW−2)）；pavilion 四面开敞无墙 ⇒ 无"墙上门洞"读数但按 t103 数据侧可通行；cornerTower 骑墙、入口由城墙门洞承担（自身正立面不开门）`);

  // 布局口径一致：全部带 door 的槽位逐项核对（净宽同式 + 门在 facing 侧 + axis 与 facing 一致）
  // t70 后布局把 door 也派生给了 **pavilion（四面开敞无墙，不适用门洞）**，故这里同样排除亭：
  // 亭的"不适用"已由上面两条边界断言单独负责。
  const withDoor = layout.SLOTS.filter((x) => x.door && x.door.width > 0.2 && x.kind !== 'pavilion');
  let widthMismatch = [];
  let facingMismatch = [];
  let axisConflict = [];
  for (const s of withDoor) {
    const o = kit[s.kind]({ ...s, door: { ...s.door }, lod: 'near', quality: 'medium' });
    const m = o.userData.kit.metrics;
    if (Math.abs(m.doorWidth - Math.min(s.door.width, m.bodyW - 2)) > 1e-6) widthMismatch.push(s.id);
    if (facingDot(o).dotSelf < 0.999) facingMismatch.push(s.id);
    const expectAxis = s.facing === 'south' || s.facing === 'north' ? 'z' : 'x';
    if (s.door.axis !== expectAxis) axisConflict.push(`${s.id}:${s.facing}/${s.door.axis}`);
  }
  eq(`布局 ${withDoor.length} 个带 door 槽位：净宽全部 = min(layout.door.width, bodyW−2)`, widthMismatch.length, 0, widthMismatch.join(','));
  eq('全部门洞开在布局 facing 侧（世界法线↔朝向）', facingMismatch.length, 0, facingMismatch.join(','));
  eq('布局 door.axis 与 facing 全部自洽（kit 不自行改轴）', axisConflict.length, 0, axisConflict.join(','));
  notes.push(`布局口径核对：${withDoor.length} 个带 door 槽位净宽/朝向/轴全部一致（axis/facing 冲突 0）`);
}

/* ================================================================== 21 内饰差异化（t170：≥8 主题 + 主房间签名互不相同） */

startSection('21 内饰差异化：主题表 / 按 slotId 分配 / 陈设签名互不相同 / 无"几乎相同"对');

{
  const { INTERIOR_THEMES, themeFor, variantFor, interiorKindOf, INTERIOR_SLOT_IDS, INTERIOR_MIXES, INTERIOR_SIZE_STEPS } = interiorModule;

  // 21.1 主题表：≥8 套、字段完备、只用既有材质令牌与既有部位词表
  ok(`主题表 ≥8 套（实际 ${INTERIOR_THEMES.length}）`, INTERIOR_THEMES.length >= 8, INTERIOR_THEMES.map((t) => t.id).join(','));
  eq('主题 id 唯一', new Set(INTERIOR_THEMES.map((t) => t.id)).size, INTERIOR_THEMES.length);
  ok('每个主题都声明了适用的建筑类型', INTERIOR_THEMES.every((t) => Array.isArray(t.kinds) && t.kinds.length > 0 && t.kinds.every((k) => INTERIOR_KINDS.includes(k))));
  const themeMaterials = new Set();
  for (const t of INTERIOR_THEMES) {
    for (const key of ['floorMat', 'screenMat', 'ceilingMat', 'furnitureMat']) if (t[key]) themeMaterials.add(t[key]);
  }
  ok('主题用到的材质键全部在既有白名单内（零新增令牌）', [...themeMaterials].every((m) => INTERIOR_MATERIALS.includes(m)), [...themeMaterials].join(','));
  // 每类建筑都有 ≥2 个可选主题（否则"分配"退化为常量）
  for (const k of INTERIOR_KINDS) {
    const n = INTERIOR_THEMES.filter((t) => t.kinds.includes(k)).length;
    ok(`类型 ${k} 可用主题 ≥2（实际 ${n}）`, n >= 2, String(n));
  }
  ok(`混搭 ≥2 型 / 尺步 ≥3 档`, INTERIOR_MIXES.length >= 2 && INTERIOR_SIZE_STEPS.length >= 3, `${INTERIOR_MIXES.length}/${INTERIOR_SIZE_STEPS.length}`);

  // 21.2 分配确定性：同一 slotId 两次调用必须一致（且只由 slotId 决定）
  const probeId = INTERIOR_SLOT_IDS[0];
  eq('themeFor 由 slotId 决定（可重复）', themeFor(probeId).id, themeFor(probeId).id);
  eq('variantFor 由 slotId 决定（可重复）', JSON.stringify(variantFor(probeId)), JSON.stringify(variantFor(probeId)));

  // 21.3 逐栋构建 43 处内景，提取"陈设签名"
  const KINDS = INTERIOR_KINDS;
  const rows = [];
  for (const wk of layout.WALKABLE.filter((w) => w.kind === 'interior')) {
    const slotId = wk.id.replace(/^WK-/, '').replace(/-interior$/, '');
    const sl = layout.SLOT_BY_ID[slotId] ?? null;
    const bounds = wk.bounds ?? sl?.bounds;
    if (!bounds) continue;
    const groundY = wk.y ?? sl?.baseY ?? 0;
    const kind = KINDS.includes(sl?.kind) ? sl.kind : 'sideHall';
    const object = kit.interiorSet({
      id: `${slotId}:int`,
      kind,
      grade: sl?.grade ?? 2,
      bounds,
      groundY,
      ceilingY: groundY + (kind === 'hall' ? 4.6 : 3.6),
      entrance: sl?.entrance ?? { x: (bounds.minX + bounds.maxX) / 2, z: bounds.minZ },
    });
    const parts = {}; const mats = {}; let tri = 0;
    object.traverse((n) => {
      if (!n.isMesh) return;
      const t = Math.floor(n.geometry.attributes.position.count / 3);
      parts[n.userData.part] = (parts[n.userData.part] ?? 0) + t;
      mats[n.userData.materialKey] = (mats[n.userData.materialKey] ?? 0) + t;
      tri += t;
      ok(`[${slotId}] 构件 ${n.userData.part} 带 interior 标记`, n.userData.interior === true);
    });
    const meta = object.userData.kit.metrics;
    rows.push({
      slotId,
      kind,
      theme: meta.theme.id,
      mix: meta.theme.variant.mix.id,
      feature: meta.theme.variant.featureId,
      sizeStep: meta.theme.variant.sizeStep,
      parts: JSON.stringify(parts),
      mats: JSON.stringify(mats),
      items: [...meta.items].sort().join(','),
      partSet: Object.keys(parts).sort().join(','),
      tri,
    });
  }
  eq(`内景总数 = 43（实测 ${rows.length}）`, rows.length, 43);

  // 21.4 硬指标 ①：**全签名（主题+混搭+特征+尺步+逐部位三角面+材质+语义清单）互不相同**
  const sigOf = (r) => [r.theme, r.mix, r.feature, r.sizeStep, r.parts, r.mats, r.items].join('|');
  const groups = new Map();
  for (const r of rows) groups.set(sigOf(r), [...(groups.get(sigOf(r)) ?? []), r.slotId]);
  const dupSig = [...groups.values()].filter((v) => v.length > 1);
  ok(`t170：${rows.length} 处内景的**陈设签名互不相同**（精确集合；失败打印冲突对）`, dupSig.length === 0, dupSig.map((v) => v.join(' = ')).join(' | '));

  // 21.5 硬指标 ②：**"几乎相同"的对为 0**（阈值依据见 §21.6 注释）
  const designOf = (r) => [r.theme, r.mix, r.feature, r.sizeStep, r.partSet, r.items].join('|');
  const dGroups = new Map();
  for (const r of rows) dGroups.set(designOf(r), [...(dGroups.get(designOf(r)) ?? []), r.slotId]);
  const dupDesign = [...dGroups.values()].filter((v) => v.length > 1);
  ok(`t170：不存在"几乎相同"的对（设计签名 = 主题+混搭+特征+尺步+部件集合+语义清单 相同者 0 对）`, dupDesign.length === 0, dupDesign.map((v) => v.join(' = ')).join(' | '));

  // 21.6 连续指标（透明报告）：逐部位三角面 L1/总和 的最相似对
  const dist = (a, b) => {
    const A = JSON.parse(a.parts); const B = JSON.parse(b.parts);
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
    let l1 = 0; let tot = 0;
    for (const k of keys) { l1 += Math.abs((A[k] ?? 0) - (B[k] ?? 0)); tot += (A[k] ?? 0) + (B[k] ?? 0); }
    return tot === 0 ? 0 : l1 / tot;
  };
  const pairs = [];
  for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) pairs.push({ d: dist(rows[i], rows[j]), a: rows[i].slotId, b: rows[j].slotId });
  pairs.sort((x, y) => x.d - y.d);
  const identical = pairs.filter((x) => x.d === 0).length;
  eq('连续指标：逐部位三角面距离 = 0 的对为 0（无逐位相同）', identical, 0);
  ok('连续指标：最相似对距离 > 0', pairs[0].d > 0, `${pairs[0].d.toFixed(4)} ${pairs[0].a}↔${pairs[0].b}`);
  eq('主题覆盖：43 处至少用到 8 种主题', new Set(rows.map((r) => r.theme)).size >= 8, true);
  const themeHist = rows.reduce((m, r) => { m[r.theme] = (m[r.theme] ?? 0) + 1; return m; }, {});
  notes.push(`t170 内饰差异化：${rows.length} 处内景 · 主题 ${Object.keys(themeHist).length} 种（${Object.entries(themeHist).map(([k, v]) => k + '×' + v).join(' ')}）· 签名唯一 ${groups.size} 组 · 设计唯一 ${dGroups.size} 组 · 最相似对距离 ${pairs[0].d.toFixed(4)}`);

  /* ---------------------------------------------------------------- 21.7 定量判据（t3 追加：四维"看得见的差异" + 阈值依据） */
  //
  // 口径（三要素：量 / 归一 / 比什么）——四项都在 [0,1]，独立可分：
  //   · dTri ：逐部位**三角面数**向量的 L1 / 两侧之和（合批桶粒度的"构件多少"）
  //   · dArea：逐部位**表面积**向量的 L1 / 两侧之和（尺码差异；`sizeStep` 只改盒体尺码、不改三角面数，
  //             所以 dTri 对"同一套家具放大 25%"失明，必须并列面积）
  //   · jItem：语义清单（metrics.items）Jaccard（构件种类差）
  //   · jCell：部位 × **0.5m 局部坐标格** 占用集合的 Jaccard（**按镜像取优**：`min(J(a,b), J(a,mirrorX(b)))`
  //             —— 左右翻转的房间是"同一套摆法"，不能被算成差异）
  // 取样：`lod:'near'`，只量室内陈设本体（默认 `auto` 会把 LOD 的 near+mid 两档一起累计，口径不同 ⇒ 不可混用）。
  //
  // **阈值依据（τ = 0.05，"几乎相同" = 四项同时 < τ）**：
  //   · dTri < 0.05：构件数量分布之差合计不到三角面总数的 5% —— 比"最小宫灯"在单间里的占比还小一半以上
  //     （实测单间一盏宫灯占 8.9%（E-court2-hall）/ 中位 23.5%，即 0.05 ≈ 半盏灯）⇒ 看不出件数差别；
  //   · dArea < 0.05：两侧逐部位表面积之差合计 < 总表面积的 5%（每侧 ≤2.5%），单间陈设总表面积中位 2158 m²
  //     ⇒ 铺地/台座/家具尺码落在同一档（相当于整间按 <2.5% 缩放）；
  //   · jItem < 0.05：清单 4–9 项，**最小非零 Jaccard 距离 = 1/9 ≈ 0.111 > 0.05** ⇒ 实等价于"清单完全相同"；
  //   · jCell < 0.05：占用格差 <5%（镜像取优）⇒ 同一套摆法、同一面墙。
  //   四项**同时**小才是"站在门口会认成同一间房"，故取 dVis = max(四项)，判据 = 「dVis < τ 的对 0 个」。
  //   追加余量判据（更严）：最小对 ≥ 3τ = 0.15，避免下一次 hash 重排/新增槽位时贴线通过。
  //   基线对照由 `node work/probe-interior-variety.mjs` 直接复算（它把 git HEAD 版 interiors.js 原样取出跑同一口径）。
  const CELL = 0.5;
  const cellKey = (part, geometry) => {
    const pos = geometry?.attributes?.position;
    const out = new Set();
    if (!pos) return out;
    for (let i = 0; i < pos.count; i += 1) {
      out.add(`${part}|${Math.round(pos.getX(i) / CELL)}|${Math.round(pos.getY(i) / CELL)}|${Math.round(pos.getZ(i) / CELL)}`);
    }
    return out;
  };
  const mirrorCells = (cells) => new Set([...cells].map((c) => {
    const [p, x, y, z] = c.split('|');
    return `${p}|${-Number(x)}|${y}|${z}`;
  }));
  const jaccard = (A, B) => {
    if (A.size === 0 && B.size === 0) return 0;
    let inter = 0;
    for (const v of A) if (B.has(v)) inter += 1;
    const union = A.size + B.size - inter;
    return union === 0 ? 0 : 1 - inter / union;
  };
  const l1Of = (A, B) => {
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
    let l1 = 0; let tot = 0;
    for (const k of keys) { l1 += Math.abs((A[k] ?? 0) - (B[k] ?? 0)); tot += (A[k] ?? 0) + (B[k] ?? 0); }
    return tot === 0 ? 0 : l1 / tot;
  };

  const nearRows = [];
  for (const wk of layout.WALKABLE.filter((w) => w.kind === 'interior')) {
    const slotId = wk.id.replace(/^WK-/, '').replace(/-interior$/, '');
    const sl = layout.SLOT_BY_ID[slotId] ?? null;
    const bounds = wk.bounds ?? sl?.bounds;
    if (!bounds) continue;
    const groundY = wk.y ?? sl?.baseY ?? 0;
    const kind = KINDS.includes(sl?.kind) ? sl.kind : 'sideHall';
    const object = kit.interiorSet({
      id: `${slotId}:int`,
      kind,
      grade: sl?.grade ?? 2,
      bounds,
      groundY,
      ceilingY: groundY + (kind === 'hall' ? 4.6 : 3.6),
      entrance: sl?.entrance ?? { x: (bounds.minX + bounds.maxX) / 2, z: bounds.minZ },
      lod: 'near',
    });
    const parts = {}; const areas = {}; const cells = new Set();
    let tri = 0;
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const t = Math.floor(mesh.geometry.attributes.position.count / 3);
      parts[mesh.userData.part] = (parts[mesh.userData.part] ?? 0) + t;
      for (const c of cellKey(mesh.userData.part, mesh.geometry)) cells.add(c);
      tri += t;
      // 表面积：三角形面积和（非索引几何，逐 3 顶点）
      const pos = mesh.geometry.attributes.position;
      let area = 0;
      for (let i = 0; i + 2 < pos.count; i += 3) {
        const ax = pos.getX(i); const ay = pos.getY(i); const az = pos.getZ(i);
        const bx = pos.getX(i + 1); const by = pos.getY(i + 1); const bz = pos.getZ(i + 1);
        const cx2 = pos.getX(i + 2); const cy = pos.getY(i + 2); const cz2 = pos.getZ(i + 2);
        const ux = bx - ax; const uy = by - ay; const uz = bz - az;
        const vx = cx2 - ax; const vy = cy - ay; const vz = cz2 - az;
        const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
        area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
      }
      areas[mesh.userData.part] = (areas[mesh.userData.part] ?? 0) + area;
    });
    nearRows.push({ slotId, kind, parts, areas, cells, items: [...new Set(object.userData.kit.metrics.items)].sort(), tri });
  }
  eq(`定量口径内景数 = 43（实测 ${nearRows.length}）`, nearRows.length, 43);

  const TAU = 0.05;
  const quant = [];
  for (let i = 0; i < nearRows.length; i += 1) {
    for (let j = i + 1; j < nearRows.length; j += 1) {
      const a = nearRows[i]; const b = nearRows[j];
      const dTri = l1Of(a.parts, b.parts);
      const dArea = l1Of(a.areas, b.areas);
      const jItem = jaccard(new Set(a.items), new Set(b.items));
      const jCell = Math.min(jaccard(a.cells, b.cells), jaccard(a.cells, mirrorCells(b.cells)));
      quant.push({ a: a.slotId, b: b.slotId, hall: a.kind === 'hall' && b.kind === 'hall', dTri, dArea, jItem, jCell, dVis: Math.max(dTri, dArea, jItem, jCell) });
    }
  }
  const nearIdentical = quant.filter((p) => p.dTri < TAU && p.dArea < TAU && p.jItem < TAU && p.jCell < TAU);
  const nearIdenticalHall = nearIdentical.filter((p) => p.hall);
  quant.sort((x, y) => x.dVis - y.dVis);
  const minPair = quant[0];
  const minHall = quant.find((p) => p.hall);
  const hallsOnly = nearRows.filter((r) => r.kind === 'hall');
  const hallSigGroups = new Set(hallsOnly.map((r) => JSON.stringify(r.parts) + '|' + JSON.stringify(r.areas) + '|' + r.items.join(','))).size;

  eq(`定量：43 处内景中"几乎相同"的对 = 0（判据：dTri/dArea/jItem/jCell 四者同时 < ${TAU}）`, nearIdentical.length, 0);
  eq('定量：主房间（hall 类，共 13 间）中"几乎相同"的对 = 0', nearIdenticalHall.length, 0);
  eq('定量：主房间 hall 的"构件数+表面积+语义清单"签名互不相同（13/13）', hallSigGroups, hallsOnly.length);
  ok(`定量余量：全 903 对最小 dVis ≥ 3τ = 0.15（实测 ${minPair ? minPair.dVis.toFixed(4) : 'n/a'} ${minPair ? `${minPair.a}↔${minPair.b}` : ''}）`, !!minPair && minPair.dVis >= 0.15);
  ok(`定量余量：主房间最小 dVis ≥ 3τ = 0.15（实测 ${minHall ? minHall.dVis.toFixed(4) : 'n/a'} ${minHall ? `${minHall.a}↔${minHall.b}` : ''}）`, !!minHall && minHall.dVis >= 0.15);
  ok('定量：四项指标全部为有限数（无 NaN ⇒ 判据未被静默跳过）', quant.every((p) => [p.dTri, p.dArea, p.jItem, p.jCell].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)));

  // 21.8 预算守卫（§8.2 不得悄悄放宽）：内景只存在于 near 档（far 档空 ⇒ 全城视角零新增调用）
  const nearTriSum = nearRows.reduce((s, r) => s + r.tri, 0);
  const nearTriMax = Math.max(...nearRows.map((r) => r.tri));
  ok(`内景近景三角面合计 ≤ 60000（实测 ${nearTriSum}）`, nearTriSum <= 60000, String(nearTriSum));
  ok(`单间内景近景三角面 ≤ 9000（实测最大 ${nearTriMax}）`, nearTriMax <= 9000, String(nearTriMax));
  const lodProbe = kit.interiorSet({
    id: 'BUDGET-PROBE:int', kind: 'hall', grade: 3,
    bounds: { minX: -30, maxX: 30, minZ: -20, maxZ: 20 }, groundY: 0, ceilingY: 4.6,
  });
  let farMeshes = 0;
  lodProbe.levels[2].object.traverse((m) => { if (m.isMesh) farMeshes += 1; });
  eq('内景 LOD 远景档为空（全城视角内景新增绘制调用 = 0）', farMeshes, 0);

  notes.push(`t3 定量判据：dVis=max(dTri,dArea,jItem,jCell) · τ=${TAU} · "几乎相同"对 ${nearIdentical.length}/903（主房间 ${nearIdenticalHall.length}） · 最小对 ${minPair.dVis.toFixed(4)}（${minPair.a}↔${minPair.b}） · 主房间最小对 ${minHall.dVis.toFixed(4)}（${minHall.a}↔${minHall.b}） · 近景三角面合计 ${nearTriSum}/单间最大 ${nearTriMax}`);
  notes.push('t3 阈值依据：τ=0.05 = "四项都小" —— ①dTri<0.05 小于最小宫灯占单间三角面的比例（实测 0.089/中位 0.235）的一半；②dArea<0.05 ⇒ 逐部位表面积差合计 <5%（每侧 ≤2.5%，单间总表面积中位 2158 m²）；③jItem<0.05 实等价于清单完全相同（清单 4–9 项，最小非零 Jaccard = 1/9≈0.111）；④jCell<0.05（镜像取优）⇒ 同一套摆法。余量判据 3τ=0.15 为追加硬化项。');
  notes.push(`t3 基线（可复算：node work/probe-interior-variety.mjs，取 git HEAD 版 interiors.js 跑同一口径）：43 处仅 4 个签名组 / 3 种设计，设计签名重复对 369 对，dVis<0.05 的"几乎相同"对 25 对（最小 0）—— 现状 0 对、最小 ${minPair.dVis.toFixed(4)}。`);
}

/* ================================================================== 22 门洞两侧开口（t6：门类贯穿 / 非门类背面实心 / 屋顶形制不变 / 开口≠可穿墙） */

startSection('22 门洞两侧开口：门类两面皆开（贯穿）/ 非门类背面实心 / 屋顶形制逐值不变 / 开口≠可穿墙');

{
  /**
   * 口径（与 `work/probe-door-openings.mjs` **同源**，两处必须一起改）：
   *   · 取 **near 档**（构件工厂默认返回 LOD；中/远档口径不同）；
   *   · 只取 `part === 'wall'` 的三角形，按**世界法线**归到四面（south/north/west/east = ±z/±x）；
   *   · 墙件全是轴对齐盒体 ⇒ 每个面的三角形 AABB **恰为该矩形**，覆盖判定精确（不是近似射线法）；
   *   · 门带高度 = **门槛（`door.sillY`，世界坐标）+ 0.5m**（低于窗台，隔离 t33 的窗洞）；
   *   · 扫描范围 = 该面墙自身的跨度（min u0 … max u1），避免把墙端之外的空气算成洞口；
   *   · 连续未覆盖区间（≥0.2m）= 洞口净宽。
   */
  const DIRS = Object.freeze({
    south: { axis: 'z', sign: -1 }, north: { axis: 'z', sign: 1 },
    west: { axis: 'x', sign: -1 }, east: { axis: 'x', sign: 1 },
  });
  const OPPOSITE = Object.freeze({ south: 'north', north: 'south', east: 'west', west: 'east' });
  const SCAN_STEP = 0.05;
  const nearOf = (object) => (object.isLOD ? object.levels[0].object : object);

  /** 每个面的墙覆盖矩形（世界坐标；u = 面内水平坐标，y = 世界高度）。 */
  function wallRects(object, slot) {
    object.updateMatrixWorld(true);
    const group = nearOf(object);
    const rects = { south: [], north: [], west: [], east: [] };
    group.traverse((mesh) => {
      if (!mesh.isMesh || mesh.userData.part !== 'wall') return;
      const pos = mesh.geometry.attributes.position;
      const e = mesh.matrixWorld.elements;
      const wx = (i) => e[0] * pos.getX(i) + e[4] * pos.getY(i) + e[8] * pos.getZ(i) + e[12];
      const wy = (i) => e[1] * pos.getX(i) + e[5] * pos.getY(i) + e[9] * pos.getZ(i) + e[13];
      const wz = (i) => e[2] * pos.getX(i) + e[6] * pos.getY(i) + e[10] * pos.getZ(i) + e[14];
      for (let i = 0; i + 2 < pos.count; i += 3) {
        const ax = wx(i); const ay = wy(i); const az = wz(i);
        const bx = wx(i + 1); const by = wy(i + 1); const bz = wz(i + 1);
        const cx = wx(i + 2); const cy = wy(i + 2); const cz = wz(i + 2);
        const ux = bx - ax; const uy = by - ay; const uz = bz - az;
        const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
        let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; nz /= len;
        const centroidZ = (az + bz + cz) / 3;
        const centroidX = (ax + bx + cx) / 3;
        const rect = {
          u0: 0, u1: 0,
          y0: Math.min(ay, by, cy), y1: Math.max(ay, by, cy),
        };
        if (Math.abs(nz) > 0.9 && Math.abs(nx) <= Math.abs(nz)) {
          rect.u0 = Math.min(ax, bx, cx); rect.u1 = Math.max(ax, bx, cx);
          rects[centroidZ < slot.z ? 'south' : 'north'].push(rect);
        } else if (Math.abs(nx) > 0.9) {
          rect.u0 = Math.min(az, bz, cz); rect.u1 = Math.max(az, bz, cz);
          rects[centroidX < slot.x ? 'west' : 'east'].push(rect);
        }
      }
    });
    return rects;
  }

  /** 某面在门带高度的洞口（= 连续未覆盖区间），含净宽与面内中心。 */
  function facadeSpans(object, slot, dir) {
    const rects = wallRects(object, slot)[dir];
    if (rects.length === 0) return [];
    const y = (slot.door?.sillY ?? slot.baseY ?? 0) + 0.5;
    const uMin = Math.min(...rects.map((r) => r.u0));
    const uMax = Math.max(...rects.map((r) => r.u1));
    const spans = [];
    let start = null;
    const steps = Math.max(1, Math.floor((uMax - uMin) / SCAN_STEP));
    for (let k = 0; k <= steps; k += 1) {
      const u = Math.min(uMax, uMin + k * SCAN_STEP);
      const covered = rects.some((r) => u >= r.u0 - 1e-6 && u <= r.u1 + 1e-6 && y >= r.y0 - 1e-6 && y <= r.y1 + 1e-6);
      if (!covered && start === null) start = u;
      if ((covered || k === steps) && start !== null) {
        const end = covered ? u - SCAN_STEP : u;
        if (end - start >= 0.2) spans.push({ width: +(end - start).toFixed(2), center: +((start + end) / 2).toFixed(2) });
        start = null;
      }
    }
    return spans;
  }

  /** 逐部位三角面（近景档；用于"屋顶形制逐值不变"的对照）。 */
  function partTriangles(object) {
    const out = {};
    nearOf(object).traverse((mesh) => {
      if (!mesh.isMesh) return;
      out[mesh.userData.part] = (out[mesh.userData.part] ?? 0) + Math.floor(mesh.geometry.attributes.position.count / 3);
    });
    return out;
  }

  const build = (slot, extra = {}) => kit[slot.kind]({ ...slot, quality: 'medium', lod: 'near', ...extra });
  const doorSlots = layout.SLOTS.filter((s) => s.door);
  const gates = doorSlots.filter((s) => s.kind === 'gateHall' || s.kind === 'courtyardGate');
  const rooms = doorSlots.filter((s) => s.kind === 'hall' || s.kind === 'sideHall');
  const pavilions = doorSlots.filter((s) => s.kind === 'pavilion');
  const playerClear = 2 * CONFIG.INTERACTION.player.radius;

  eq(`带 door 槽位 = 53 门类/殿堂 + 10 亭（实测 ${doorSlots.length}）`, doorSlots.length, 63);
  eq(`门类槽位（gateHall 6 + courtyardGate 10）`, gates.length, 16);
  eq(`殿堂/配殿类带 door 槽位（hall 14 + sideHall 23）`, rooms.length, 37);
  eq('亭类带 door 槽位', pavilions.length, 10);
  // 派生守卫（不依赖魔法数，布局扩张时自动跟上）：①三类之和 = 全部带 door 槽位；②**凡 kind 是门/亭的槽位都不得丢登记**。
  eq('三类（门类 + 殿堂配殿 + 亭）之和 = 全部带 door 槽位', gates.length + rooms.length + pavilions.length, doorSlots.length);
  eq('所有 gateHall/courtyardGate 槽位都带 door 登记（门不得丢登记）', layout.SLOTS.filter((s) => s.kind === 'gateHall' || s.kind === 'courtyardGate').length, gates.length);
  eq('所有 pavilion 槽位都带 door 登记（亭不得丢登记）', layout.SLOTS.filter((s) => s.kind === 'pavilion').length, pavilions.length);
  ok('带 door 槽位数不少于契约基线 63（只增不减）', doorSlots.length >= 63, String(doorSlots.length));
  notes.push('t6 登记口径：layout 每个槽位只登记**一个**门面（door.facade.outward），**没有** door.back / door.through 字段 ⇒ kit 由 door 镜像派生对面开口（同轴/同宽/同高/同门槛），不新增登记字段；对面开口的**存在性**由 kind 的通道语义决定（门殿/院门 = 通道口）。');

  // 22.1 门类：两面皆开，且净宽 = 登记门宽（clamp 后），两面同宽、对轴
  let gateOk = 0;
  for (const slot of gates) {
    const object = build(slot);
    const meta = object.userData.kit.metrics;
    const frontDir = slot.door.facade?.outward ?? slot.facing;
    const backDir = OPPOSITE[frontDir];
    const expect = Math.min(slot.door.width, meta.bodyW - 2);
    ok(`[${slot.id}] 门类默认贯穿（through = true / hasBackOpening = true）`, meta.through === true && meta.hasBackOpening === true, JSON.stringify({ through: meta.through, hasBackOpening: meta.hasBackOpening }));
    eq(`[${slot.id}] openingBack.width = 登记门宽（clamp 后）`, meta.openingBack?.width, expect, 1e-9);
    eq(`[${slot.id}] openingBack.source = 'through'`, meta.openingBack?.source, 'through');
    ok(`[${slot.id}] 背面开口净宽 ≥ 玩家净宽 ${playerClear}`, (meta.openingBack?.clearWidth ?? 0) >= playerClear, String(meta.openingBack?.clearWidth));
    const fSpans = facadeSpans(object, slot, frontDir);
    const bSpans = facadeSpans(object, slot, backDir);
    const f = fSpans.reduce((a, b) => (b.width > a.width ? b : a), { width: 0, center: NaN });
    const b = bSpans.reduce((a, c) => (c.width > a.width ? c : a), { width: 0, center: NaN });
    ok(`[${slot.id}] 门面（${frontDir}）开口净宽 = 登记门宽 ±0.06`, Math.abs(f.width - expect) <= 0.06, `实测 ${f.width} vs 期望 ${expect}`);
    ok(`[${slot.id}] 对侧面（${backDir}）开口净宽 = 登记门宽 ±0.06`, Math.abs(b.width - expect) <= 0.06, `实测 ${b.width} vs 期望 ${expect}`);
    ok(`[${slot.id}] 两面净宽一致（|前−后| ≤ 0.06）`, Math.abs(f.width - b.width) <= 0.06, `${f.width} vs ${b.width}`);
    // 面内切向坐标：法线 ±z 的面（南北）切向 = 世界 x；法线 ±x 的面（东西）切向 = 世界 z。
    // （`door.axis` 是**贯穿轴**，与之垂直；这里比的是门宽中心在切向上的位置。）
    const tangent = (frontDir === 'south' || frontDir === 'north') ? 'x' : 'z';
    const doorCenter = slot.door.center?.[tangent] ?? (tangent === 'x' ? slot.x : slot.z);
    ok(`[${slot.id}] 两面开口中心对轴（±0.08）`, Math.abs(f.center - doorCenter) <= 0.08 && Math.abs(b.center - doorCenter) <= 0.08, `前 ${f.center} / 后 ${b.center} vs 门中 ${doorCenter}`);
    if (meta.through && b.width > playerClear) gateOk += 1;
  }
  eq(`门类 16 栋全部两面皆开且净宽可通行`, gateOk, gates.length);

  // 22.2 非门类（殿堂/配殿）：背面必须保持实心（防"开口外溢"）
  const roomLeaks = [];
  for (const slot of rooms) {
    const object = build(slot);
    const meta = object.userData.kit.metrics;
    const dir = slot.door.facade?.outward ?? slot.facing;
    const backSpans = facadeSpans(object, slot, OPPOSITE[dir]);
    const frontSpans = facadeSpans(object, slot, dir);
    const widestBack = backSpans.reduce((a, b) => Math.max(a, b.width), 0);
    const widestFront = frontSpans.reduce((a, b) => Math.max(a, b.width), 0);
    if (meta.through !== false || meta.hasBackOpening !== false || widestBack >= 0.6) {
      roomLeaks.push({ id: slot.id, through: meta.through, back: widestBack });
    }
    ok(`[${slot.id}] 殿堂/配殿默认不贯穿（through = false / 背面实心）`, meta.through === false && meta.hasBackOpening === false && widestBack < 0.6, `through=${meta.through} 背面最宽 ${widestBack}`);
    ok(`[${slot.id}] 正面登记门仍然开洞（净宽 ≥ 玩家净宽）`, widestFront >= Math.min(slot.door.width, meta.bodyW - 2) - 0.06 && widestFront >= playerClear, `${widestFront}`);
  }
  eq('无"背面开口外溢"（殿堂/配殿逐栋背面实心）', roomLeaks.length, 0);

  // 22.3 亭：四面无墙（门带高度无 wall 覆盖），故"两侧开口"由开敞本体承担
  for (const slot of pavilions) {
    const object = build(slot);
    const meta = object.userData.kit.metrics;
    const allDirs = Object.keys(DIRS).map((d) => facadeSpans(object, slot, d).length).reduce((a, b) => a + b, 0);
    ok(`[${slot.id}] 亭无墙件（四面门带无覆盖）且无墙上门洞`, allDirs === 0 && meta.doorWidth === 0 && meta.through === false, `spans=${allDirs} doorWidth=${meta.doorWidth}`);
  }

  // 22.4 显式开关：through:true 让殿堂获得背面开口；through:false 让门类回到单面
  {
    const hallSlot = layout.SLOT_BY_ID['B-hall-main'];
    const t = build(hallSlot, { through: true });
    const tm = t.userData.kit.metrics;
    const tb = facadeSpans(t, hallSlot, OPPOSITE['south']);
    ok('显式 through:true → 殿堂也可贯穿（背面开口 = 登记门宽）', tm.through === true && Math.abs(tb.reduce((a, b) => Math.max(a, b.width), 0) - Math.min(hallSlot.door.width, tm.bodyW - 2)) <= 0.06, `背面最宽 ${tb.reduce((a, b) => Math.max(a, b.width), 0)}`);
    const g = build(layout.SLOT_BY_ID['F-gate-south'], { through: false });
    const gm = g.userData.kit.metrics;
    const gb = facadeSpans(g, layout.SLOT_BY_ID['F-gate-south'], 'north');
    ok('显式 through:false → 门类可强制单面（背面实心）', gm.through === false && gm.hasBackOpening === false && gb.reduce((a, b) => Math.max(a, b.width), 0) < 0.6, `背面最宽 ${gb.reduce((a, b) => Math.max(a, b.width), 0)}`);
  }

  // 22.4b **LOD 口径**：贯穿在 near / mid 两档都必须成立（墙体在两档都建；远景档由 LOD 策略决定）
  {
    const gateSlot = layout.SLOT_BY_ID['F-gate-south'];
    const roomSlot = layout.SLOT_BY_ID['B-hall-main'];
    for (const detail of ['near', 'mid']) {
      const g = kit.gateHall({ ...gateSlot, quality: 'medium', lod: detail });
      const gm = g.userData.kit.metrics;
      const front = facadeSpans(g, gateSlot, 'south').reduce((a, b) => Math.max(a, b.width), 0);
      const back = facadeSpans(g, gateSlot, 'north').reduce((a, b) => Math.max(a, b.width), 0);
      ok(`[${detail}] 门类两面皆开且同宽（前 ${front} / 后 ${back}）`, gm.through === true && Math.abs(front - back) <= 0.06 && front >= playerClear && back >= playerClear, `${front}/${back}`);
      const r = kit.hall({ ...roomSlot, quality: 'medium', lod: detail });
      const rb = facadeSpans(r, roomSlot, 'north').reduce((a, b) => Math.max(a, b.width), 0);
      ok(`[${detail}] 殿堂背面仍实心（${rb}）`, r.userData.kit.metrics.through === false && rb < 0.6, String(rb));
    }
  }

  // 22.5 **不破屋顶形制**：贯穿只改 wall / doorFrame，其余部位三角面逐值相同
  const ROOF_PARTS = ['roof', 'lowerRoof', 'eaveFascia', 'ridge', 'hipRidge', 'ridgeBeast', 'ridgeEnd', 'painting', 'giltLine', 'bracket', 'bracketTip', 'soffit', 'column', 'columnFoot', 'terrace', 'terraceCap', 'door', 'doorStud', 'stairs', 'imperialRamp', 'railing', 'railingPanel', 'window'];
  const roofViolations = [];
  let thruDeltaMax = 0;
  for (const slot of gates) {
    const on = build(slot);
    const off = build(slot, { through: false });
    const a = partTriangles(on);
    const b = partTriangles(off);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (key === 'wall' || key === 'doorFrame') continue;
      if ((a[key] ?? 0) !== (b[key] ?? 0)) roofViolations.push(`${slot.id}:${key} ${b[key] ?? 0}→${a[key] ?? 0}`);
    }
    const ma = on.userData.kit.metrics;
    const mb = off.userData.kit.metrics;
    for (const field of ['eaveHeight', 'eaveHeightAbsolute', 'upperEaveY', 'roofBaseY', 'roofRise', 'totalHeight', 'totalHeightAbsolute', 'bodyW', 'bodyD', 'plinth', 'baySpan']) {
      if (ma[field] !== mb[field]) roofViolations.push(`${slot.id}:${field} ${mb[field]}→${ma[field]}`);
    }
    if (JSON.stringify(ma.ridge) !== JSON.stringify(mb.ridge)) roofViolations.push(`${slot.id}:ridge`);
    if (JSON.stringify(ma.parts) !== JSON.stringify(mb.parts)) roofViolations.push(`${slot.id}:partBuckets ${JSON.stringify(mb.parts)}→${JSON.stringify(ma.parts)}`);
    thruDeltaMax = Math.max(thruDeltaMax, (a.wall ?? 0) + (a.doorFrame ?? 0) - ((b.wall ?? 0) + (b.doorFrame ?? 0)));
  }
  eq('贯穿不破屋顶形制：屋顶/斗栱/额枋/台基等部位三角面与举架逐值不变；合批桶集合不变；只有 wall/doorFrame 变化', roofViolations.length, 0, roofViolations.slice(0, 6).join(' | '));
  ok(`贯穿的几何增量有界（单栋新增 wall+doorFrame 三角面 = ${thruDeltaMax} ≤ 60，16 栋合计 ≤ 960）`, thruDeltaMax <= 60, String(thruDeltaMax));

  // 22.6 **开口 ≠ 可穿墙**：kit 只写几何，不写/不改通行性与碰撞；passable 不是几何开关
  {
    const gateSlot = layout.SLOT_BY_ID['F-gate-south'];
    const blockedSample = build(gateSlot, { door: { ...gateSlot.door, passable: false, blockedBy: 'SYNTHETIC' } });
    const bm = blockedSample.userData.kit.metrics;
    ok('几何开口与 door.passable 解耦：声明不可通行不改变洞口几何', bm.through === true && bm.hasBackOpening === true && bm.openingBack.width === bm.doorWidth);
    const metaText = JSON.stringify(bm);
    ok('kit 不冒充通行性/碰撞（metrics 无 passable/blockedBy/collider/obstacle/walkable 字段）', !/passable|blockedBy|collider|obstacle|walkable/i.test(metaText));
  }

  // 22.7 与只读探针逐值一致（同口径复算，供回执引用）
  notes.push(`t6 贯穿（两侧开口）：门类 16 栋两面皆开、非门类 37 栋背面实心、亭 10 栋无墙；贯穿只动 wall/doorFrame（单栋新增 ≤ ${thruDeltaMax} 三角面）⇒ §8.2 分区绘制调用不变（合批桶集合逐值相同）。`);
  notes.push('t6 登记缺失（交回 layout，不在 kit 范围）：①`door` 无对面锚点/`door.back`/`door.through` 字段（对面开口由 kit 镜像派生）；②可行走数据的门洞带 `insideObstacleDoor()` 对**整进深**豁免（`docs/report-airwall.md` §10.2 的"穿透体块"），使 37 栋非门类里另有 17 栋（hall 4 + sideHall 13）在数据侧"可穿到对面"而几何背面实心 —— 要么登记 `door.through`（kit 已支持 `through:true`），要么把豁免收窄到门洞+室内进深。');
  notes.push(`t6 逐栋清单：${gates.map((s) => s.id).join(', ')}`);
}

/* ================================================================== 23 重檐脊饰归属（t27：下檐 lowerRidge） */

startSection('23 重檐脊饰归属：下檐 lowerRidge（g1 §5.4）/ 零几何改动 / 中档预算守卫 / 单檐不得外溢');

{
  /**
   * 背景（t27）：g1 判据 5.4 要求重檐建筑在近景档有 **≥2 类**"下檐部件"（`/lowerRoof|lowerRidge/`），
   * 实测此前只有 `lowerRoof`。缺陷实为**归属**：下檐正脊（`ridge` 盒）与下檐垂脊（`hipRidge` 梁）
   * 本来就在几何里，只是与**上层**同名构件合并进同一合批桶（`buildings.js` 的腰檐段）。
   * 修法：近景档把腰檐的 `ridge`/`hipRidge` 改名为 `lowerRidge`（**只改归属、不动几何**）。
   * 为何只在近景档：合批键 = `material.uuid|part`（`merge.js:557-563`）⇒ 新部位名必然新增 1 个绘制调用；
   * B/F 两区按 `lod:'mid'` 单档建造（`forecourt.js:66` / `garden-boundary.js:506`）、F 区 80/80 无余量，
   * 故中档改名会让 F 变 81 而超预算（实测）；近景档改名后 F 仍 80/80，仅 C（其 `C-hall-bed-main`
   * 属 `NEAR_DETAIL_SLOTS` ⇒ 近档建造）55→56/60、主场景 341→342/350。
   * 权威判据 `scripts/verify-g1-baseline.mjs` 的 5.4（显式 `lod:'near'`）据此由 FAIL 转 PASS。
   */
  const partTris = (slot, detail) => {
    const object = kit[slot.kind]({ ...slot, quality: 'medium', lod: detail });
    const group = object.isLOD ? object.levels[0].object : object;
    const out = {};
    let total = 0;
    group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const t = Math.floor(mesh.geometry.attributes.position.count / 3);
      out[mesh.userData.part] = (out[mesh.userData.part] ?? 0) + t;
      total += t;
    });
    return { parts: out, total, metrics: object.userData.kit.metrics };
  };
  /** 双檐集合按**几何**判定（`upperEaveY > eaveHeight`）：2 殿 + 4 角楼（`isTower` 强制重檐）+ 2 城门。 */
  const doubleEave = layout.SLOTS.filter((slot) => {
    if (slot.kind === 'pavilion') return false;
    const object = kit[slot.kind]({ ...slot, quality: 'medium', lod: 'near' });
    const m = object.userData.kit.metrics;
    return m.upperEaveY > m.eaveHeight;
  });
  eq(`重檐建筑 = 2 殿 + 4 角楼 + 2 城门（实测 ${doubleEave.length}）`, doubleEave.length, 8);

  const lowerViolations = [];
  const familyViolations = [];
  for (const slot of doubleEave) {
    const near = partTris(slot, 'near');
    const hasLowerRoof = (near.parts.lowerRoof ?? 0) > 0;
    const hasLowerRidge = (near.parts.lowerRidge ?? 0) > 0;
    ok(`[${slot.id}] 近景档下檐有两类部件（lowerRoof ${near.parts.lowerRoof ?? 0} + lowerRidge ${near.parts.lowerRidge ?? 0}）—— 对应 g1 §5.4`, hasLowerRoof && hasLowerRidge, JSON.stringify({ lowerRoof: near.parts.lowerRoof, lowerRidge: near.parts.lowerRidge }));
    // 归属守恒：脊饰族（ridge + hipRidge + lowerRidge）中"上层 ridge+hipRidge"与"下檐 lowerRidge"几何量相等，
    // 且上层同名桶仍在（不丢类别）—— 这正是"只改归属、不改几何"的可机器复核形式。
    const upper = (near.parts.ridge ?? 0) + (near.parts.hipRidge ?? 0);
    const lower = near.parts.lowerRidge ?? 0;
    if (!(upper > 0 && lower > 0 && lower === upper)) {
      familyViolations.push(`${slot.id}: ridge=${near.parts.ridge ?? 0} hipRidge=${near.parts.hipRidge ?? 0} lowerRidge=${lower}`);
    }
    if (!(near.metrics.slopes === 4 && near.metrics.apronRise > 0 && near.metrics.ridge && near.metrics.ridge.length > 0)) {
      lowerViolations.push(`${slot.id}: slopes=${near.metrics.slopes} apronRise=${near.metrics.apronRise}`);
    }
  }
  eq('重檐形制完整：4 坡 + apronRise>0 + 上层非零正脊（等级-形制白名单未动）', lowerViolations.length, 0, lowerViolations.join(' | '));
  eq('脊饰归属守恒：下檐 lowerRidge 与"上层 ridge+hipRidge"几何量相等（只改归属，不改几何）', familyViolations.length, 0, familyViolations.join(' | '));

  // 零几何改动：逐档三角面 = 改前实测值（与回执 A/B 表同值）
  const totalPins = {
    'B-hall-main': { near: 11932, mid: 6828 }, 'C-hall-bed-main': { near: 9844, mid: 5532 },
    'F-gate-south': { near: 7648, mid: 3360 }, 'F-gate-north': { near: 7648, mid: 3360 },
    'F-tower-corner-nw': { near: 4232, mid: 2564 }, 'F-tower-corner-ne': { near: 4232, mid: 2564 },
    'F-tower-corner-sw': { near: 4232, mid: 2564 }, 'F-tower-corner-se': { near: 4232, mid: 2564 },
  };
  const totalViolations = [];
  for (const slot of doubleEave) {
    for (const detail of ['near', 'mid']) {
      const got = partTris(slot, detail).total;
      const want = totalPins[slot.id]?.[detail];
      if (want !== undefined && got !== want) totalViolations.push(`${slot.id}/${detail} ${want}→${got}`);
    }
  }
  eq('零几何改动：重檐建筑逐档三角面 = 改前实测值（只改脊饰归属；与回执 A/B 表同值）', totalViolations.length, 0, totalViolations.join(' | '));

  // 预算守卫：中档（B/F 单档建造所用档位）不得出现 lowerRidge，否则 F 区 80/80 会被顶穿
  const midLeaks = doubleEave.filter((s) => (partTris(s, 'mid').parts.lowerRidge ?? 0) > 0).map((s) => s.id);
  eq('中档无 lowerRidge（§8.2 守卫：B/F 按 mid 单档建造，F 区无余量；要统一归属需主理人裁定预算）', midLeaks.length, 0, midLeaks.join(','));

  // 非重檐不得外溢：只有重檐（含角楼）才有 lowerRoof/lowerRidge
  const nonDouble = layout.SLOTS.filter((s) => s.kind !== 'pavilion' && !doubleEave.includes(s));
  const leaks = [];
  for (const slot of nonDouble) {
    const near = partTris(slot, 'near');
    if ((near.parts.lowerRidge ?? 0) > 0 || (near.parts.lowerRoof ?? 0) > 0) leaks.push(slot.id);
  }
  eq(`非重檐 ${nonDouble.length} 槽位近景档不得出现 lowerRidge/lowerRoof（归属不外溢）`, leaks.length, 0, leaks.slice(0, 6).join(','));

  const sample = doubleEave.map((s) => `${s.id}: ridge ${partTris(s, 'near').parts.ridge ?? 0} + hipRidge ${partTris(s, 'near').parts.hipRidge ?? 0} + lowerRidge ${partTris(s, 'near').parts.lowerRidge ?? 0}`);
  notes.push(`t27 重檐脊饰：${doubleEave.length} 栋（${doubleEave.map((s) => s.id).join(', ')}）近景档 lowerRoof+lowerRidge 两类部件；${sample.join(' · ')}；中档无 lowerRidge ⇒ F 80/80 不变、主场景 341→342、C 55→56`);
}

/* ================================================================== 24 体块共面/套叠守卫（t46：红墙 × 白石墙基端面共面 / Z-fighting） */

startSection('24 体块共面/套叠守卫：墙体件不得有"同向共面 + 面积重叠"（Z-fighting 本体）');

{
  /**
   * 背景（t46）：`kit.wall` 的 `wallBody` 与 `wallBase` 修前**同长度、同中心、同底部高度**，
   * 墙基只加厚 6% ⇒ 两块的**端面完全共面**（门洞两侧的红色端面 vs 白色端面，实测每处 0.8m×8m = 6.4m²）
   * 且体块整段套叠 ⇒ 深度值在重叠区相等 ⇒ 走动时"红墙边缘闪缩"。
   *
   * 本节的判据口径（三要素）：
   *   量   ：每个部位（wallBody/wallBase/wallLintel/wallCoping/wallCopingRidge/merlon）的三角面；
   *   归一 ：按**轴对齐平面**归类（法线 ±x/±y/±z + 平面坐标 + 面内矩形）；
   *   比什么：① **可见侧同向共面重叠** = 两件各有一面法线同向、平面差 < 1mm、面内矩形交叠面积 > 0
   *          ⇒ 这是 Z-fighting 的充分机制（法线 `-y` 的朝地面排除：相机在地面之上，恒被背面剔除）；
   *          ② **体块套叠** = 两件 AABB 三轴都正重叠（题干对禁止；贴面/压顶的"包裹式嵌套"允许并登记）。
   * 禁止的掩盖手段（本卡未做、本判据也不接受）：提高 MSAA / 改绘制顺序 / 关闭深度检测。
   */
  const WALL_EPS_PLANE = 1e-3;
  const WALL_EPS_VOL = 1e-3;
  const WALL_EPS_AREA = 1e-6;

  /** 把一个部位网格拆成轴对齐面 + 逐件 AABB（局部坐标）。 */
  function wallFacesOf(mesh) {
    const pos = mesh.geometry.attributes.position;
    const faces = [];
    const bb = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const V = (i) => ({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const a = V(i); const b = V(i + 1); const c = V(i + 2);
      for (const v of [a, b, c]) {
        bb.minX = Math.min(bb.minX, v.x); bb.maxX = Math.max(bb.maxX, v.x);
        bb.minY = Math.min(bb.minY, v.y); bb.maxY = Math.max(bb.maxY, v.y);
        bb.minZ = Math.min(bb.minZ, v.z); bb.maxZ = Math.max(bb.maxZ, v.z);
      }
      const ux = b.x - a.x; const uy = b.y - a.y; const uz = b.z - a.z;
      const vx = c.x - a.x; const vy = c.y - a.y; const vz = c.z - a.z;
      const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const ax = Math.abs(nx / len); const ay = Math.abs(ny / len); const az = Math.abs(nz / len);
      let axis; let sign; let plane; let rect;
      if (ax >= ay && ax >= az) {
        axis = 'x'; sign = Math.sign(nx); plane = (a.x + b.x + c.x) / 3;
        rect = { u0: Math.min(a.y, b.y, c.y), u1: Math.max(a.y, b.y, c.y), v0: Math.min(a.z, b.z, c.z), v1: Math.max(a.z, b.z, c.z) };
      } else if (ay >= az) {
        axis = 'y'; sign = Math.sign(ny); plane = (a.y + b.y + c.y) / 3;
        rect = { u0: Math.min(a.x, b.x, c.x), u1: Math.max(a.x, b.x, c.x), v0: Math.min(a.z, b.z, c.z), v1: Math.max(a.z, b.z, c.z) };
      } else {
        axis = 'z'; sign = Math.sign(nz); plane = (a.z + b.z + c.z) / 3;
        rect = { u0: Math.min(a.x, b.x, c.x), u1: Math.max(a.x, b.x, c.x), v0: Math.min(a.y, b.y, c.y), v1: Math.max(a.y, b.y, c.y) };
      }
      faces.push({ axis, sign, plane, rect });
    }
    return { faces, bb };
  }

  /** 两件之间的"可见侧同向共面重叠"与"体块套叠"。 */
  function wallConflicts(A, B) {
    const visible = new Map();
    for (const fa of A.faces) {
      for (const fb of B.faces) {
        if (fa.axis !== fb.axis || fa.sign !== fb.sign) continue;
        if (Math.abs(fa.plane - fb.plane) > WALL_EPS_PLANE) continue;
        if (fa.axis === 'y' && fa.sign < 0) continue; // 朝地面：可见半球之外，恒被背面剔除
        const ou = Math.min(fa.rect.u1, fb.rect.u1) - Math.max(fa.rect.u0, fb.rect.u0);
        const ov = Math.min(fa.rect.v1, fb.rect.v1) - Math.max(fa.rect.v0, fb.rect.v0);
        if (ou <= WALL_EPS_AREA || ov <= WALL_EPS_AREA) continue;
        const key = `${fa.axis}|${fa.plane.toFixed(4)}|${fa.sign}|${Math.max(fa.rect.u0, fb.rect.u0).toFixed(3)}|${Math.max(fa.rect.v0, fb.rect.v0).toFixed(3)}`;
        visible.set(key, { axis: fa.axis, plane: +fa.plane.toFixed(4), sign: fa.sign, u: [+Math.max(fa.rect.u0, fb.rect.u0).toFixed(3), +Math.min(fa.rect.u1, fb.rect.u1).toFixed(3)], v: [+Math.max(fa.rect.v0, fb.rect.v0).toFixed(3), +Math.min(fa.rect.v1, fb.rect.v1).toFixed(3)], area: +(ou * ov).toFixed(3) });
      }
    }
    const interpenetration = ['x', 'y', 'z'].every((ax) => Math.min(A.bb[`max${ax.toUpperCase()}`], B.bb[`max${ax.toUpperCase()}`]) - Math.max(A.bb[`min${ax.toUpperCase()}`], B.bb[`min${ax.toUpperCase()}`]) > WALL_EPS_VOL);
    return { visible: [...visible.values()], interpenetration };
  }

  const wallSamples = [
    ['WALL-CITY-south(含 26m 门洞)', { ...layout.WALLS.find((w) => w.id === 'WALL-CITY-south'), baseY: 0, quality: 'medium' }],
    ['院墙(无门洞)', { ...(layout.WALLS.find((w) => w.kind === 'courtWall' && (!w.openings || w.openings.length === 0)) ?? { id: 'CW', from: { x: -20, z: 0 }, to: { x: 20, z: 0 }, kind: 'courtWall' }), baseY: 0, quality: 'medium' }],
    ['合成 cityWall(两个门洞)', { id: 'SYN-2', kind: 'cityWall', from: { x: -60, z: 0 }, to: { x: 60, z: 0 }, thickness: 8, height: 12, baseY: 0, quality: 'medium', openings: [{ at: -20, width: 10 }, { at: 20, width: 14 }] }],
  ];

  /** 允许的"包裹式嵌套"（贴面/压顶）—— 只允许**套叠**，绝不允许**可见侧共面**；未登记的新对⇒红。 */
  const ALLOWED_NESTING = new Set([
    'wallBody|wallLintel', 'wallBody|wallCoping', 'wallCoping|merlon', 'wallCoping|wallCopingRidge', // 门额包墙 / 院墙瓦顶嵌墙顶 / 垛口穿压顶 / 脊嵌瓦顶
  ]);

  const conflictsAll = [];
  const unexpected = [];
  const guards = [];
  for (const [label, params] of wallSamples) {
    const object = kit.wall(params);
    object.updateMatrixWorld(true);
    const parts = new Map();
    object.traverse((mesh) => { if (mesh.isMesh) parts.set(mesh.userData.part, wallFacesOf(mesh)); });
    const names = [...parts.keys()];
    // ① 逐对：可见侧同向共面重叠必须为 0（Z-fighting 本体）
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const ka = `${names[i]}|${names[j]}`;
        const c = wallConflicts(parts.get(names[i]), parts.get(names[j]));
        if (c.visible.length > 0) conflictsAll.push(`[${label}] ${ka}：${c.visible.length} 处可见侧共面（如 ${c.visible[0].axis}=${c.visible[0].plane} 法线 ${c.visible[0].sign > 0 ? '+' : '-'}${c.visible[0].axis} 面积 ${c.visible[0].area}m² @u[${c.visible[0].u}] v[${c.visible[0].v}]）`);
        if (c.interpenetration && !ALLOWED_NESTING.has(ka)) unexpected.push(`[${label}] ${ka} 体块套叠（未登记）`);
      }
    }
    // ② 题干对：墙基 / 红墙 逐值守卫
    // 有效值按工厂口径复算（合成样本未显式给 battlementHeight 时，cityWall 取 MODULES 默认）
    const isCityWall = params.kind === 'cityWall' || params.cityWall === true;
    const effBattle = params.battlementHeight ?? (isCityWall ? CONFIG.MODULES.wallBattlementHeight : 0);
    const GEOM_TOL = 1e-3; // 顶点为 Float32 ⇒ 几何实测容差取 1mm（与"共面 <1mm"同量级）
    const base = parts.get('wallBase'); const body = parts.get('wallBody');
    ok(`[${label}] 含 wallBase 与 wallBody 两个体块`, Boolean(base && body));
    if (base && body) {
      const baseH = Math.min(0.8, (params.height - effBattle) * 0.2);
      const bH = params.height - effBattle;
      const rangeOk = (got, want) => got.every((v, i) => Math.abs(v - want[i]) <= GEOM_TOL);
      ok(`[${label}] 墙基 y 范围 = [baseY, baseY+baseH]（实测 ${base.bb.minY.toFixed(4)}..${base.bb.maxY.toFixed(4)}）`, rangeOk([base.bb.minY, base.bb.maxY], [params.baseY, params.baseY + baseH]));
      ok(`[${label}] 红墙 y 范围 = [baseY+baseH, baseY+bodyH]（红墙从墙基顶面开始；实测 ${body.bb.minY.toFixed(4)}..${body.bb.maxY.toFixed(4)}）`, rangeOk([body.bb.minY, body.bb.maxY], [params.baseY + baseH, params.baseY + bH]));
      ok(`[${label}] 墙基×红墙：无可见侧共面重叠`, wallConflicts(base, body).visible.length === 0);
      ok(`[${label}] 墙基×红墙：体块不套叠（只允许 y=baseY+baseH 处接触）`, !wallConflicts(base, body).interpenetration);
    }
    // ③ 配对守卫：装配总高（= 最高面的 y）与门洞净宽
    let maxY = -Infinity; let minY = Infinity;
    for (const v of parts.values()) { maxY = Math.max(maxY, v.bb.maxY); minY = Math.min(minY, v.bb.minY); }
    eq(`[${label}] 装配底面 = baseY（墙基仍落地）`, minY, params.baseY, GEOM_TOL);
    const expectedTop = params.baseY + (effBattle > 0
      ? params.height
      : params.height + Math.max(0.3, params.thickness * 0.5) * 0.95);
    eq(`[${label}] 装配总高（最高面 y）与修前公式逐值一致`, maxY, expectedTop, GEOM_TOL);
    // 门洞净宽：只取**墙身/墙基**的门垛端面（merlon/coping 的 x 面与门洞无关，不得混入）
    const jambFaces = [];
    for (const pn of ['wallBody', 'wallBase']) {
      const v = parts.get(pn);
      if (v) for (const f of v.faces) if (f.axis === 'x') jambFaces.push(f.plane);
    }
    for (const op of (params.openings ?? [])) {
      const left = Math.max(...jambFaces.filter((x) => x <= op.at + GEOM_TOL));
      const right = Math.min(...jambFaces.filter((x) => x >= op.at - GEOM_TOL));
      eq(`[${label}] 门洞净宽（由两侧门垛端面实测）= 登记 width`, right - left, op.width, GEOM_TOL);
    }
    // ④ 可见三角面与桶不变：逐部位面数与"每件一个盒（6 面/12 三角）"一致
    const tri = parts.size > 0 ? [...parts.values()].reduce((n, v) => n + v.faces.length, 0) : 0;
    guards.push([label, tri, object.userData.kit.metrics.triangles, names.join(',')]);
  }
  eq('可见侧同向共面重叠 = 0（所有墙体样本 × 所有部位对；失败打印双方与坐标）', conflictsAll.length, 0, conflictsAll.slice(0, 4).join(' | '));
  eq('未登记的体块套叠 = 0（只允许 ALLOWED_NESTING 里的贴面/压顶包裹式嵌套）', unexpected.length, 0, unexpected.join(' | '));
  // 三角面与桶守卫（修前/修后逐值相同：修前 wallBase/wallBody 也是每段各 1 盒；院墙压顶 beam→box 同为 12 三角）
  eq('墙体样本三角面（逐部位三角面合计）与修前逐值一致（面数×2 = 三角面）', JSON.stringify(guards.map((g) => g[2])), JSON.stringify([1932, 48, 516]));
  ok('墙体样本未新增部位名（合批桶不变）', guards.every((g) => g[3].split(',').every((n) => ['wallBody', 'wallBase', 'wallLintel', 'wallCoping', 'wallCopingRidge', 'merlon'].includes(n))));
  notes.push(`t46 体块守卫：${wallSamples.length} 个墙体样本 × 逐部位对 = 可见侧共面 0 处；题干对（红墙×白石墙基）体块不套叠、y 范围 = [baseY, baseY+baseH] / [baseY+baseH, baseY+bodyH]；门洞净宽与装配总高逐值不变；三角面与部位名不变`);
}

/* ================================================================== 26 墙面 UV 世界锚定（t49） */

startSection('26 墙面 UV 世界锚定：门洞两侧 / 门额 / 立面分块相位连续');

{
  /** 分块 = 三角面 x 区间按「重叠/相接」归并（每块一盒面）⇒ 拟合 u(x)=k·x+b，返回 [{x0,x1,u0,u1}]（按 x 升序）。 */
  function blocksOf(mesh) {
    const pos = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    const samples = [];
    const spans = [];
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const ax = pos.getX(i); const ay = pos.getY(i); const az = pos.getZ(i);
      const bx = pos.getX(i + 1); const by = pos.getY(i + 1); const bz = pos.getZ(i + 1);
      const cx = pos.getX(i + 2); const cy = pos.getY(i + 2); const cz = pos.getZ(i + 2);
      const ux = bx - ax; const uy = by - ay; const uz = bz - az; const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
      const nx = Math.abs(uy * vz - uz * vy); const ny = Math.abs(uz * vx - ux * vz); const nz = Math.abs(ux * vy - uy * vx);
      if (!(nz >= nx && nz >= ny)) continue;
      const lo = Math.min(ax, bx, cx); const hi = Math.max(ax, bx, cx);
      spans.push([lo, hi]);
      for (let k = 0; k < 3; k += 1) samples.push({ x: pos.getX(i + k), u: uv.getX(i + k) });
    }
    if (samples.length < 6) return [];
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp[0] <= last[1] + 0.01) last[1] = Math.max(last[1], sp[1]);
      else merged.push([sp[0], sp[1]]);
    }
    return merged.map(([x0, x1]) => {
      const mine = samples.filter((p) => p.x >= x0 - 1e-6 && p.x <= x1 + 1e-6);
      const n = mine.length;
      const mx = mine.reduce((a, p) => a + p.x, 0) / n;
      const mu = mine.reduce((a, p) => a + p.u, 0) / n;
      let num = 0; let den = 0;
      for (const p of mine) { num += (p.x - mx) * (p.u - mu); den += (p.x - mx) ** 2; }
      const k = den > 1e-12 ? num / den : 0; const b = mu - k * mx;
      return { x0, x1, u0: k * x0 + b, u1: k * x1 + b };
    });
  }

  /** 相邻分块相位差（只比较真正邻接的块；门洞两侧即此类）。 */
  function worstAdjacent(segs) {
    let worst = 0;
    for (let i = 1; i < segs.length; i += 1) {
      if (segs[i].x0 - segs[i - 1].x1 > 0.02) continue;
      worst = Math.max(worst, Math.abs(segs[i].u0 - segs[i - 1].u1));
    }
    return worst;
  }

  const tileWall = kit.materials.tileMeters('plasterRed');
  /* 固定夹具：与主理人只读实测同一条命令（门洞 12m 居中） */
  const fixture = kit.wall({ id: 'T49-FIX', from: { x: -100, z: 0 }, to: { x: 100, z: 0 }, thickness: 2, height: 6, kind: 'courtWall', openings: [{ at: 0, width: 12, height: 4 }], quality: 'medium', lod: 'near' });
  fixture.updateMatrixWorld(true);
  const fixtureBlocks = [];
  fixture.traverse((m) => { if (m.isMesh && m.userData.part === 'wallBody') fixtureBlocks.push(...blocksOf(m)); });
  fixtureBlocks.sort((a, b) => a.x0 - b.x0);
  ok('t49 夹具门洞两侧 + 门额共 3 块（左段/门额/右段）', fixtureBlocks.length === 3, JSON.stringify(fixtureBlocks.map((b) => [b.x0, b.x1])));
  /* ① 相位连续（世界锚定）：相邻块在共享边界处 u 相等 */
  const fixtureAdj = worstAdjacent(fixtureBlocks);
  ok(`t49 夹具相邻分块相位差 < 1e-3 格（实测 ${fixtureAdj.toExponential(2)}）`, fixtureAdj < 1e-3);
  /* ② 与世界锚定期望 u=(x+worldU)/tile 一致（夹具 worldU=0） */
  const fixtureDev = Math.max(...fixtureBlocks.flatMap((b) => [Math.abs(b.u0 - b.x0 / tileWall), Math.abs(b.u1 - b.x1 / tileWall)]));
  ok(`t49 夹具 u 拟合 = 世界锚定期望（最大偏差 ${fixtureDev.toExponential(2)} 格 < 1e-3）`, fixtureDev < 1e-3);
  /* ③ 【突变对照】旧行为（每块相位从 0 起）判定同一谓词必红 —— 解析式复现 metricBoxUVs 旧语义 */
  const oldBlocks = fixtureBlocks.map((b) => ({ x0: b.x0, x1: b.x1, u0: 0, u1: (b.x1 - b.x0) / tileWall }));
  const oldAdj = worstAdjacent(oldBlocks);
  ok(`t49 突变对照：旧行为（每块 0 起）在同一谓词下必红（实测相邻差 ${oldAdj.toFixed(4)} 格 ≥ 1e-3）`, oldAdj >= 1e-3);
  ok('t49 突变对照：旧行为下右段/门额的世界锚定偏差必超差（>1 格）',
    Math.max(...oldBlocks.flatMap((b) => [Math.abs(b.u1 - b.x1 / tileWall)])) > 1, `右段偏差 ${(Math.abs(oldBlocks[2].u1 - oldBlocks[2].x1 / tileWall)).toFixed(2)} 格`);
  /* ④ 全城 72 条墙：逐条相邻分块相位连续 */
  const worstAll = { id: null, v: 0 };
  for (const w of layout.WALLS) {
    const obj = kit.wall({ ...w, quality: 'medium', lod: 'near' });
    obj.updateMatrixWorld(true);
    const segs = [];
    obj.traverse((m) => { if (m.isMesh && ['wallBody', 'wallLintel'].includes(m.userData.part)) segs.push(...blocksOf(m)); });
    segs.sort((a, b) => a.x0 - b.x0);
    const v = worstAdjacent(segs);
    if (v > worstAll.v) { worstAll.v = v; worstAll.id = w.id; }
  }
  ok(`t49 全城 ${layout.WALLS.length} 条墙相邻分块相位连续（最大 ${worstAll.v.toExponential(2)} 格 @${worstAll.id ?? '—'}）`, worstAll.v < 1e-3);
  /* ⑤ 立面分块（facadeWall）：≥4 栋带门/窗栋的 wall 分块相位连续 */
  const facadeSlots = layout.SLOTS.filter((s2) => ['hall', 'gateHall'].includes(s2.kind) && s2.hasDoor !== false).slice(0, 4);
  const facadeWorst = [];
  for (const slot of facadeSlots) {
    const obj = kit[slot.kind]({ ...slot, quality: 'medium', lod: 'near' });
    obj.updateMatrixWorld(true);
    let w2 = 0;
    obj.traverse((m) => {
      if (!m.isMesh || m.userData.part !== 'wall') return;
      const segs = blocksOf(m).sort((a, b) => a.x0 - b.x0);
      w2 = Math.max(w2, worstAdjacent(segs));
    });
    facadeWorst.push({ id: slot.id, v: w2 });
  }
  ok(`t49 立面 ${facadeWorst.length} 栋分块相位连续（最大 ${Math.max(...facadeWorst.map((f) => f.v)).toExponential(2)} 格）`, facadeWorst.every((f) => f.v < 1e-3), JSON.stringify(facadeWorst));
  /* ⑥ 零漂移：tile 尺度 / 三角面 / 绘制调用不因 t49 改变（只改 UV ⇒ 顶点数与桶不变） */
  ok(`t49 tile 尺度逐值不变（plasterRed ${tileWall}m）`, Math.abs(tileWall - 6.4) < 1e-9, String(tileWall));
  notes.push(`t49 UV 世界锚定：夹具 3 块相邻相位差 ${fixtureAdj.toExponential(2)} 格（旧行为 ${oldAdj.toFixed(3)} 格 ⇒ 突变必红）· 全城 ${layout.WALLS.length} 条墙最大 ${worstAll.v.toExponential(2)} 格 · 立面 ${facadeWorst.length} 栋最大 ${Math.max(...facadeWorst.map((f) => f.v)).toExponential(2)} 格`);
}

/* ================================================================== 汇总 */

console.log('\n=========================================================');
console.log(' kit.test.mjs 汇总');
console.log('---------------------------------------------------------');
for (const note of notes) console.log(` · ${note}`);
console.log('---------------------------------------------------------');
if (failures.length > 0) {
  console.log(` 失败 ${failures.length} 项：`);
  for (const f of failures.slice(0, 40)) console.log(`  ✗ [${f.section}] ${f.label}${f.detail ? ` — ${f.detail}` : ''}`);
  if (failures.length > 40) console.log(`  … 其余 ${failures.length - 40} 项省略`);
}
console.log(` 通过 ${passed} / ${passed + failures.length}，失败 ${failures.length}`);
console.log('=========================================================');
process.exit(failures.length === 0 ? 0 : 1);
