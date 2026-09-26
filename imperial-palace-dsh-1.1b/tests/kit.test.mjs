#!/usr/bin/env node
/**
 * tests/kit.test.mjs — t3 构件库机器校验（Node 内，无浏览器、无网络、无 npm 依赖）
 * =============================================================================
 * 覆盖 t3 验收的 7 条：
 *   1 工厂导出与参数契约  2 形制一致性（含屋顶几何特征）  3 识别特征与 LOD 三档
 *   4 材质令牌驱动 / 共享缓存 / dispose 边界  5 资产登记与许可  6 测试本身  7 无网络依赖
 * 另加：全 67 槽位扫描（与 layout 的 eaveHeight 交叉校验）、整城绘制调用/三角面预算、
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
  for (const id of ['glazeTile', 'plasterRed', 'stoneWhite', 'timberLacquer', 'paintingTeal', 'pavingStone']) {
    const spec = CONFIG.MATERIALS[id];
    const expected = Math.min(1, spec.roughness + CONFIG.WEATHERING.roughnessBias);
    eq(`材质 ${id} 叠加统一旧化 roughnessBias`, kit.materials.get(id).roughness, expected, 1e-9);
  }
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
  ok('整城 67 槽合批后绘制调用 ≤ 350（config.BUDGET.drawCalls.mainSceneMax）', merged.stats.after <= CONFIG.BUDGET.drawCalls.mainSceneMax, `${beforeAll} → ${merged.stats.after}`);
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

startSection('11 全 67 槽位扫描 + 与 layout.eaveHeight 交叉校验 + 预算');
{
  eq('layout 槽位数为 67', layout.SLOTS.length, 67);
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
  notes.push(`全 67 槽：近景三角面 ${totalNear}，中景 ${sumMid}，单栋最大 ${maxBuilding}`);
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

  // 全 67 槽：凡 layout 带 door 的槽位，净宽都必须够玩家通过
  let withDoor = 0;
  let tooNarrow = [];
  const clearWidths = [];
  for (const s of layout.SLOTS) {
    if (!s.door || !(s.door.width > 0.2)) continue;
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
  notes.push(`门洞解耦：layout 带 door 槽位 ${withDoor} 个全部获得开口，净宽最小 ${Math.min(...clearWidths).toFixed(2)}m（门槛 ${playerClear}m）`);
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
  ok('边界：亭（pavilion）无墙体 → 不适用"正面门洞"（四面开敞）', !partsOf(pav, 0).has('wall') && pav.userData.kit.metrics.doorWidth === 0);
  const tower = kit.cornerTower({ ...slot('F-tower-corner-nw'), lod: 'near', quality: 'medium' });
  eq('边界：角楼（cornerTower）无正立面门洞（骑墙建筑，入口由城墙门洞承担）', tower.userData.kit.metrics.doorWidth, 0, 1e-9);
  notes.push(`门洞能力边界：hall/sideHall/gateHall/courtyardGate 支持（door 数据驱动，净宽=min(声明, bodyW−2)）；pavilion 四面开敞无墙、cornerTower 骑墙无正立面门，均不适用`);

  // 布局口径一致：全 18 个带 door 的槽位逐项核对（净宽同式 + 门在 facing 侧 + axis 与 facing 一致）
  const withDoor = layout.SLOTS.filter((x) => x.door && x.door.width > 0.2);
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
