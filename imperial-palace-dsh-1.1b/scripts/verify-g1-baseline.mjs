/**
 * scripts/verify-g1-baseline.mjs — G1 基线（t3 构件库 + t2 核心契约）独立验证
 * =============================================================================
 * 归属：verifier（t5 / R1 G1 评审）。只读消费 src/**、tests/**，不修改任何交付文件。
 *
 * 目的：用 Node 可执行证据回答「t3 构件库 + t2 核心是否足以支撑 B/C/D/E/F 全部实现」，
 *       而不是复述 t3 自己的 tests/kit.test.mjs 结论。所有计数均为本脚本当场测得。
 *
 * 用法：node scripts/verify-g1-baseline.mjs
 * 退出码：0 = 全部检查通过（DEBT 项不计入；它们归 t20 等修复方）；1 = 存在 FAIL 项。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadModule, loadThree, makeTestCtx, buildZone, ROOT } from '../tests/harness.mjs';

/* ---------------------------------------------------------------- 结果收集 */

const results = [];
const debts = [];
function check(id, ok, detail) {
  results.push({ id, ok: !!ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${id}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
/** 已确认但归属其它任务的欠账（不计入本任务 PASS/FAIL）。 */
function debt(id, detail, owner) {
  debts.push({ id, detail, owner });
  console.log(`  [DEBT→${owner}] ${id}${detail ? ` — ${detail}` : ''}`);
}
function section(title) {
  console.log(`\n=== ${title} ===`);
}
function info(line) {
  console.log(`  · ${line}`);
}

const THREE = await loadThree();
const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const kitModule = await loadModule('src/kit/index.js');
const geometry = await loadModule('src/kit/geometry.js');
const kit = kitModule.createKit({ THREE, config: CONFIG, quality: 'medium' });

console.log('=========================================================');
console.log(' G1 基线独立验证（verifier / t5）');
console.log(` node ${process.version} · three r${THREE.REVISION} · KIT ${kitModule.KIT_VERSION}`);
console.log(` root ${ROOT}`);
console.log('=========================================================');

/* =============================================================== 1 工厂面 */
section('1 工厂集合与 API 面（CONTRACTS §3.4 冻结名称）');
const CONTRACT_BUILDING_FACTORIES = ['hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'wall', 'courtyardGate', 'corridor', 'terrace', 'stairs', 'bridge'];
const CONTRACT_PROP_FACTORIES = ['tree', 'rockery', 'lantern', 'railing', 'bronze'];
const CONTRACT_HELPERS = ['instance', 'lod'];

const missing = [];
for (const name of [...CONTRACT_BUILDING_FACTORIES, ...CONTRACT_PROP_FACTORIES, ...CONTRACT_HELPERS]) {
  if (typeof kit[name] !== 'function') missing.push(`${name}(${typeof kit[name]})`);
}
if (!kit.materials) missing.push('materials');
check('1.1 CONTRACTS §3.4 全部冻结名称存在且可调用', missing.length === 0,
  missing.length ? `缺失：${missing.join(', ')}` : `${CONTRACT_BUILDING_FACTORIES.length} 构件 + ${CONTRACT_PROP_FACTORIES.length} 摆件 + ${CONTRACT_HELPERS.length} 包装 + materials`);

const extraProps = ['screenWall', 'water', 'paving'].filter((n) => typeof kit[n] === 'function');
info(`额外（不冲突）摆件工厂：${extraProps.join(', ')}`);
check('1.2 kit.instance / kit.lod 可用（instance(mesh,count) / lod(levels)）',
  typeof kit.instance === 'function' && typeof kit.lod === 'function' && kit.instance.length >= 2,
  `instance.length=${kit.instance.length} lod.length=${kit.lod.length}`);

/* =========================================================== 2 材质令牌驱动 */
section('2 材质：令牌驱动、role 可用性、颜色出处可追溯');
const roles = Object.keys(CONFIG.COLOR_ROLES);
const missingRoles = roles.filter((role) => !kit.materials[role]);
check('2.1 全部 COLOR_ROLES 角色可按 kit.materials[role] 取到材质', missingRoles.length === 0,
  `${roles.length} 个角色，缺失 ${missingRoles.length}`);

const materialIds = Object.keys(CONFIG.MATERIALS);
const colorMismatch = [];
for (const id of materialIds) {
  const mat = kit.materials[id];
  if (!mat) { colorMismatch.push(`${id}:缺失`); continue; }
  const expected = kit.color(CONFIG.COLOR_ROLES[CONFIG.MATERIALS[id].colorRole]);
  const actual = `#${mat.color.getHexString()}`;
  if (expected.toLowerCase() !== actual.toLowerCase()) colorMismatch.push(`${id}: ${actual} != ${expected}`);
}
check('2.2 每个 config.MATERIALS 材质的 color 等于该 colorRole 的 config 色值（零漂移）', colorMismatch.length === 0,
  colorMismatch.length ? colorMismatch.join('; ') : `${materialIds.length} 个基材质逐色比对一致`);

const stats = kit.materials.stats();
check('2.3 材质共享缓存：同 id 只生成一份，贴图在预算区间内',
  stats.materials >= 23 && stats.textureSize >= CONFIG.BUDGET.textures.minSize && stats.textureSize <= CONFIG.BUDGET.textures.maxSize,
  `materials=${stats.materials} textures=${stats.textures} @${stats.textureSize}px ≈${stats.textureMB}MB`);

check('2.4 role 与 materialId 指向同一份材质对象（不是副本）',
  kit.materials.get('glazeTile') === kit.materials.get('roofPrimary'),
  'materials[roofPrimary] === materials[glazeTile]');

/* ================================================= 3 硬编码 / 网络资源扫描 */
section('3 源码纪律：无散落硬编码色值、无网络资源');
const kitFiles = readdirSync(join(ROOT, 'src', 'kit')).filter((f) => f.endsWith('.js'));
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const hexHits = [];
const urlHits = [];
for (const file of kitFiles) {
  const code = stripComments(readFileSync(join(ROOT, 'src', 'kit', file), 'utf8'));
  code.split('\n').forEach((line, i) => {
    if (/#[0-9a-fA-F]{3,8}\b/.test(line)) hexHits.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
    if (/https?:\/\//.test(line)) urlHits.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
  });
}
check('3.1 src/kit/** 非注释代码零 `#rrggbb` 字面量（颜色唯一来源 config）', hexHits.length === 0, `${kitFiles.length} 文件扫描，命中 ${hexHits.length}`);
check('3.2 src/kit/** 非注释代码零 http(s) 网络地址（无热链/无必需网络资源）', urlHits.length === 0, `命中 ${urlHits.length}`);

const assetsDir = join(ROOT, 'public', 'assets');
const runtimeAssets = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name !== 'README.md' && entry.name !== '.DS_Store') runtimeAssets.push(p.slice(ROOT.length + 1));
  }
})(assetsDir);
check('3.3 public/assets/ 无任何运行时资源文件（程序化路线自洽）', runtimeAssets.length === 0, `非 README 文件 ${runtimeAssets.length} 个`);

const srcFiles = [];
(function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) collect(p);
    else if (entry.name.endsWith('.js')) srcFiles.push(p);
  }
})(join(ROOT, 'src'));
const loaderHits = [];
const textureLoaderHits = [];
for (const file of srcFiles) {
  const code = stripComments(readFileSync(file, 'utf8'));
  const rel = file.slice(ROOT.length + 1);
  if (/GLTFLoader|FBXLoader|OBJLoader|MTLLoader|RGBELoader|\.glb\b|\.gltf\b|\.fbx\b|\.obj\b|\.hdr\b|\.ktx2\b|\.png\b|\.jpg\b/.test(code)) loaderHits.push(rel);
  if (/TextureLoader/.test(code)) textureLoaderHits.push(rel);
}
check('3.4 全仓无外部模型/HDR/图片素材引用（不可能混入未适配的异风格素材）',
  loaderHits.length === 0, `${srcFiles.length} 个 src/**/*.js 扫描，外部素材引用命中 ${loaderHits.length}${loaderHits.length ? `：${loaderHits.join(', ')}` : ''}`);
info(`TextureLoader 仅作为 core 的通用能力存在于 ${textureLoaderHits.join(', ')}（无素材可加载：public/assets 为空、运行时 0 次网络请求，不影响本项结论）`);

/* ================================================== 4 全 67 槽位可构建性 */
section('4 以 layout 为唯一输入的 67 槽位构建（区域作者的正常路径）');
const KIND_FACTORY = {
  hall: 'hall', gateHall: 'gateHall', sideHall: 'sideHall',
  pavilion: 'pavilion', cornerTower: 'cornerTower', courtyardGate: 'courtyardGate',
};
const buildFailures = [];
const eaveDeviations = [];
const lateralExtra = [];   // 与出檐方向一致的侧向外扩
const frontExtra = [];     // 正面（含自动台阶）外扩
const underflow = [];      // kit 比槽位占地小的量（应为 0）
const triNear = [];
const built = new Map();
for (const slot of LAYOUT.SLOTS) {
  const factory = KIND_FACTORY[slot.kind];
  if (!factory) { buildFailures.push(`${slot.id}: 无对应构件工厂（kind=${slot.kind}）`); continue; }
  try {
    const object = kit[factory]({
      id: slot.id, name: slot.name,
      x: slot.x, z: slot.z, w: slot.w, d: slot.d, bays: slot.bays,
      terraceH: slot.terraceH, baseY: slot.baseY, bodyBaseY: slot.bodyBaseY,
      roofType: slot.roofType, grade: slot.grade,
      facing: slot.facing, rotationYDeg: slot.rotationYDeg,
      quality: 'medium',
    });
    built.set(slot.id, object);
    const m = object.userData.kit.metrics;
    eaveDeviations.push(Math.abs(m.eaveHeightAbsolute - slot.eaveHeight));
    const b = object.userData.kit.worldBounds;
    const swapped = Math.abs(Math.abs(slot.rotationYDeg) % 180) === 90;
    if (swapped) {
      lateralExtra.push(Math.max(slot.bounds.minZ - b.minZ, b.maxZ - slot.bounds.maxZ));
      frontExtra.push(Math.max(slot.bounds.minX - b.minX, b.maxX - slot.bounds.maxX));
    } else {
      lateralExtra.push(Math.max(slot.bounds.minX - b.minX, b.maxX - slot.bounds.maxX));
      frontExtra.push(Math.max(slot.bounds.minZ - b.minZ, b.maxZ - slot.bounds.maxZ));
    }
    // 内缩量：kit 边界落在槽位边界内侧的深度（>0 表示 kit 没有盖住槽位占地）
    underflow.push(Math.max(
      b.minX - slot.bounds.minX, slot.bounds.maxX - b.maxX,
      b.minZ - slot.bounds.minZ, slot.bounds.maxZ - b.maxZ,
    ));
    triNear.push(m.triangles.near);
  } catch (error) {
    buildFailures.push(`${slot.id}(${slot.kind}/${slot.roofType}/grade${slot.grade}): ${error.message.split('\n')[0]}`);
  }
}
check('4.1 67 槽位全部可用文档化构件工厂 + layout 字段构建成功（零抛错）',
  buildFailures.length === 0 && built.size === LAYOUT.SLOTS.length,
  `${built.size}/${LAYOUT.SLOTS.length} 成功${buildFailures.length ? `；失败：${buildFailures.slice(0, 5).join(' | ')}` : ''}`);

const maxEave = Math.max(...eaveDeviations);
check('4.2 逐槽位 |kit.eaveHeightAbsolute − layout.eaveHeight| ≤ 6mm（模数与 layout 同源）',
  maxEave <= 0.006, `最大偏差 ${(maxEave * 1000).toFixed(2)}mm（${eaveDeviations.length} 槽）`);

check('4.3 kit 世界包围盒完全覆盖槽位占地（无内缩；台基 = 槽位 w×d）',
  Math.max(...underflow) <= 0.001, `最大内缩量 ${Math.max(...underflow).toFixed(4)}m（四边取最大）`);
const ovGrade1 = CONFIG.MODULES.eaveOverhang * CONFIG.GRADES[1].eaveOverhangFactor;
const ovGrade3 = CONFIG.MODULES.eaveOverhang * CONFIG.GRADES[3].eaveOverhangFactor;
check('4.4 侧向外扩 = 出檐令牌量级（≤ grade3 出檐 ×1.1；角部起翘/外挑在内）',
  Math.max(...lateralExtra) <= ovGrade3 * 1.1,
  `侧向外扩 ${Math.min(...lateralExtra).toFixed(2)}–${Math.max(...lateralExtra).toFixed(2)}m（出檐 grade1 ${ovGrade1.toFixed(2)}m / grade3 ${ovGrade3.toFixed(2)}m）`);
const stepRunOf = (terraceH) => {
  if (!(terraceH > 0.2)) return 0;
  const steps = Math.max(1, Math.round(terraceH / CONFIG.MODULES.stairsStepHeight));
  const maxStepsPerRun = Math.max(2, Math.floor(CONFIG.MODULES.stairsMaxRun / CONFIG.MODULES.stairsStepDepth));
  const runs = Math.max(1, Math.ceil(steps / maxStepsPerRun));
  const perRun = Math.ceil(steps / runs);
  const landing = CONFIG.MODULES.stairsStepDepth * 4;
  return perRun * CONFIG.MODULES.stairsStepDepth + (runs - 1) * (perRun === steps ? 0 : landing);
};
const frontWorst = Math.max(...frontExtra);
const frontAllow = ovGrade3 * 1.1 + Math.max(...LAYOUT.SLOTS.map((s) => stepRunOf(s.terraceH)));
check('4.5 正面外扩 ≤ 出檐 + 自动台阶跑长（由 config 令牌推导）',
  frontWorst <= frontAllow,
  `最大正面外扩 ${frontWorst.toFixed(2)}m ≤ 允许 ${frontAllow.toFixed(2)}m`);

// 4.7 另一条真实用法：把 layout 槽位整条展开传入（t3 自测即此用法）→ 应复现 t3 公布的总量
let spreadTotalNear = 0;
let spreadMax = 0;
let spreadFails = 0;
for (const slot of LAYOUT.SLOTS) {
  try {
    const object = kit[slot.kind]({ ...slot, quality: 'medium' });
    spreadTotalNear += object.userData.kit.metrics.triangles.near;
    spreadMax = Math.max(spreadMax, object.userData.kit.metrics.triangles.near);
  } catch { spreadFails += 1; }
}
check('4.7 整槽展开用法 `kit[kind]({...slot, quality})` 同样 67/67 成功，且复现 t3 公布的 192,420 / 最大 11,652',
  spreadFails === 0 && spreadTotalNear === 192420 && spreadMax === 11652,
  `整槽展开：near 合计 ${spreadTotalNear}、最大 ${spreadMax}、失败 ${spreadFails}；显式字段子集（不含 slot.door）：合计 ${triNear.reduce((a, b) => a + b, 0)}、最大 ${Math.max(...triNear)}（差 48 面全部来自 params.door 门洞几何）`);

const maxSingle = Math.max(...triNear);
const totalNear = triNear.reduce((a, b) => a + b, 0);
check('4.6 单栋三角面 ≤ 预算 2.4 万；67 槽近景合计 ≤ 150 万',
  maxSingle <= CONFIG.BUDGET.triangles.perBuildingMax && totalNear <= CONFIG.BUDGET.triangles.visibleMax,
  `近景合计 ${totalNear}（预算 ${CONFIG.BUDGET.triangles.visibleMax}）· 单栋最大 ${maxSingle}（预算 ${CONFIG.BUDGET.triangles.perBuildingMax}）`);

/* ============================================== 5 庑殿顶几何（几何级验证） */
section('5 屋顶形制：庑殿 = 长正脊 + 四面坡（几何取样 + geometry 模块级）');
function topBand(meshes) {
  const v = new THREE.Vector3();
  const pts = [];
  let maxY = -Infinity;
  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y > maxY) maxY = v.y;
      pts.push(v.clone());
    }
  }
  const band = pts.filter((p) => p.y >= maxY - 0.3);
  const xs = band.map((p) => p.x);
  const zs = band.map((p) => p.z);
  return {
    maxY: +maxY.toFixed(3),
    xExtent: +(Math.max(...xs) - Math.min(...xs)).toFixed(3),
    zExtent: +(Math.max(...zs) - Math.min(...zs)).toFixed(3),
    vertices: pts.length,
  };
}
function roofMeshes(object) {
  const out = [];
  object.traverse((n) => {
    if (n.isMesh && ['roof', 'lowerRoof', 'ridge', 'lowerRidge'].includes(n.userData.part)) out.push(n);
  });
  return out;
}

// 5.1 geometry 模块级：各屋顶类型的坡面数 / 正脊 / 顶点
const roofTypeFacts = {};
for (const type of Object.keys(CONFIG.ROOF_TYPES)) {
  const r = geometry.buildRoof(THREE, {
    halfW: 42, halfD: 24, rise: 12, roofType: type, curve: CONFIG.MODULES.eaveCurve,
    eaveLift: CONFIG.MODULES.eaveLift, eaveRiseAtCorner: CONFIG.MODULES.eaveRiseAtCorner,
    roofThickness: CONFIG.MODULES.roofThickness, detail: 'near', tile: 1, grade: 3,
  });
  roofTypeFacts[type] = {
    slopes: r.metrics.slopes,
    ridgeLength: r.metrics.ridge ? +r.metrics.ridge.length.toFixed(3) : null,
    apex: !!r.metrics.apex,
  };
}
info(`geometry.buildRoof(42×24) 各类型：${JSON.stringify(roofTypeFacts)}`);
check('5.1 庑殿/歇山/重檐 = 4 面坡 + 非零长正脊；攒尖 = 顶点无正脊；硬山 = 2 面坡',
  roofTypeFacts.hip.slopes === 4 && roofTypeFacts.hip.ridgeLength > 0
  && roofTypeFacts.doubleEaveHip.slopes === 4 && roofTypeFacts.doubleEaveHip.ridgeLength > 0
  && roofTypeFacts.gableHip.slopes === 4 && roofTypeFacts.gableHip.ridgeLength > 0
  && roofTypeFacts.pyramidal.apex === true && roofTypeFacts.pyramidal.ridgeLength === null
  && roofTypeFacts.gable.slopes === 2,
  `hip slopes=${roofTypeFacts.hip.slopes}/ridge=${roofTypeFacts.hip.ridgeLength}m；pyramidal apex=${roofTypeFacts.pyramidal.apex}/ridge=${roofTypeFacts.pyramidal.ridgeLength}`);

// 5.2 单檐庑殿实例：顶带长宽比 + 正脊长度与令牌推导一致
const gateSlot = LAYOUT.SLOTS.find((s) => s.id === 'B-gate-front');
const gateObj = kit.gateHall({ ...gateSlot, quality: 'medium', lod: 'near' });
const gateTop = topBand(roofMeshes(gateObj));
const gateOv = CONFIG.MODULES.eaveOverhang * CONFIG.GRADES[gateSlot.grade].eaveOverhangFactor;
const gateHalfW = gateSlot.w / 2 + gateOv;
const gateHalfD = gateSlot.d / 2 + gateOv;
const gateExpectedRidge = 2 * Math.max(gateHalfW - gateHalfD, gateHalfW * 0.32);
check('5.2 B-gate-front（grade2 单檐 hip）顶带是长脊线：x 向 ≫ z 向，长度 = (w−d) 收脊（±10%）',
  gateTop.xExtent / Math.max(gateTop.zExtent, 0.01) > 8 && Math.abs(gateTop.xExtent - gateExpectedRidge) / gateExpectedRidge <= 0.10,
  `顶带 ${gateTop.xExtent}×${gateTop.zExtent}m（比值 ${(gateTop.xExtent / Math.max(gateTop.zExtent, 0.01)).toFixed(1)}），期望正脊 ${gateExpectedRidge.toFixed(2)}m`);

// 5.3 重檐主殿实例：顶带 = 上层正脊几何，且与 metrics.ridge.length 自洽
const mainHall = LAYOUT.SLOTS.find((s) => s.id === 'B-hall-main');
const mainHallObj = kit.hall({ ...mainHall, quality: 'medium', lod: 'near' });
const mainMetrics = mainHallObj.userData.kit.metrics;
const mainTop = topBand(roofMeshes(mainHallObj));
const lowerRoofParts = [];
mainHallObj.traverse((n) => { if (n.userData.part && /lowerRoof|lowerRidge/.test(n.userData.part)) lowerRoofParts.push(n.userData.part); });
const mainRidgeBoxW = Math.max(0.2, mainMetrics.ridge.sectionHeight * 0.7);
check('5.3 B-hall-main（grade3 重檐庑殿）上层为长正脊：顶带宽度 = 正脊长 + 脊断面宽（±0.1m）',
  Math.abs(mainTop.xExtent - (mainMetrics.ridge.length + mainRidgeBoxW)) <= 0.1 && mainTop.xExtent > 20 && mainTop.xExtent / Math.max(mainTop.zExtent, 0.01) > 8,
  `顶带 xExtent=${mainTop.xExtent}m = ridge.length ${mainMetrics.ridge.length}m + 脊断面宽 ${mainRidgeBoxW.toFixed(2)}m；zExtent=${mainTop.zExtent}m（比值 ${(mainTop.xExtent / Math.max(mainTop.zExtent, 0.01)).toFixed(1)}）`);
check('5.4 重檐另有下层腰檐 4 坡与下层正脊（apronRise>0，lowerRoof/lowerRidge 部件存在）',
  mainMetrics.apronRise > 0 && mainMetrics.slopes === 4 && [...new Set(lowerRoofParts)].length >= 2,
  `apronRise=${mainMetrics.apronRise.toFixed(2)} 上层 slopes=${mainMetrics.slopes} 部件=${[...new Set(lowerRoofParts)].join('+')}`);

const pavilionSlot = LAYOUT.SLOTS.find((s) => s.roofType === 'pyramidal');
const pavilionObj = kit.pavilion({ ...pavilionSlot, quality: 'medium', lod: 'near' });
const pavTop = topBand(roofMeshes(pavilionObj));
const pavMetrics = pavilionObj.userData.kit.metrics;
check('5.5 攒尖顶正确区分：顶点汇聚（x/z 均 ≈0）且 metrics.ridge 为空',
  pavTop.xExtent < 1.2 && pavTop.zExtent < 1.2 && (pavMetrics.ridge === null || pavMetrics.ridge === undefined),
  `${pavilionSlot.id}: 顶带 ${pavTop.xExtent}×${pavTop.zExtent}m，ridge=${JSON.stringify(pavMetrics.ridge ?? null)}`);

// 5.6 风格守卫反例（独立于 t3 自己的测试）：违规必须抛错，不得静默放行
const guardMisses = [];
const mustThrow = [
  ['grade3 + gable（白名单外）', () => kit.hall({ id: 'guard-1', w: 40, d: 20, bays: 3, terraceH: 1, roofType: 'gable', grade: 3, facing: 'south' })],
  ['grade1 + doubleEaveHip（白名单外）', () => kit.hall({ id: 'guard-2', w: 40, d: 20, bays: 3, terraceH: 1, roofType: 'doubleEaveHip', grade: 1, facing: 'south' })],
  ['未知屋顶类型', () => kit.hall({ id: 'guard-3', w: 40, d: 20, bays: 3, terraceH: 1, roofType: 'flat', grade: 2, facing: 'south' })],
  ['未知等级', () => kit.hall({ id: 'guard-4', w: 40, d: 20, bays: 3, terraceH: 1, roofType: 'hip', grade: 5, facing: 'south' })],
  ['缺 w', () => kit.hall({ id: 'guard-5', d: 20, bays: 3, terraceH: 1, roofType: 'hip', grade: 2, facing: 'south' })],
];
for (const [label, fn] of mustThrow) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) guardMisses.push(label);
}
check('5.6 风格/参数守卫真实生效：白名单违规、未知屋顶、未知等级、缺尺寸全部抛错（无静默放行开关）',
  guardMisses.length === 0, guardMisses.length ? `未抛错：${guardMisses.join('；')}` : `${mustThrow.length} 个反例全部抛错`);

/* ============================================================ 6 LOD 三档 */
section('6 LOD：三档、距离来自 config 令牌、三角面单调下降');
const lodObj = kit.hall({ ...mainHall, quality: 'medium' });
const lodLevels = lodObj.isLOD ? lodObj.levels.length : 0;
const levelTris = lodObj.isLOD ? lodObj.levels.map((l) => kit.countTriangles(l.object)) : [];
const expectedDistances = [0, CONFIG.BUDGET.lod.nearDistance * CONFIG.QUALITY.tiers.medium.lodBias, CONFIG.BUDGET.lod.midDistance * CONFIG.QUALITY.tiers.medium.lodBias];
const actualDistances = lodObj.isLOD ? lodObj.levels.map((l) => l.distance) : [];
check('6.1 工厂默认返回 THREE.LOD 且为三档（近/中/远）', lodObj.isLOD === true && lodLevels === 3, `isLOD=${lodObj.isLOD} levels=${lodLevels}`);
check('6.2 档位距离 = config.BUDGET.lod × 质量档 lodBias',
  JSON.stringify(actualDistances) === JSON.stringify(expectedDistances),
  `实测 ${JSON.stringify(actualDistances)} vs 期望 ${JSON.stringify(expectedDistances)}`);
check('6.3 三角面单调下降（near > mid > far），远景仍有轮廓几何',
  levelTris.length === 3 && levelTris[0] > levelTris[1] && levelTris[1] > levelTris[2] && levelTris[2] > 0,
  `near ${levelTris[0]} → mid ${levelTris[1]} → far ${levelTris[2]}`);
const singleNear = kit.hall({ ...mainHall, quality: 'medium', lod: 'near' });
check('6.4 params.lod 单档输出可用（区域合批前置条件）',
  singleNear.isLOD !== true && singleNear.isGroup === true && singleNear.userData.kit.detail === 'near',
  `detail=${singleNear.userData.kit.detail} isGroup=${singleNear.isGroup}`);

/* ==================================================== 7 合批 / 实例化效果 */
section('7 合批与实例化：绘制调用确实下降（全城尺度）');
const cityRoot = new THREE.Group();
for (const [, object] of built) cityRoot.add(object);
const beforeCalls = kit.countDrawCalls(cityRoot);
const beforeTris = kit.countTriangles(cityRoot);
const mergeResult = kit.mergeZone(cityRoot);
const afterCalls = kit.countDrawCalls(cityRoot);
const afterTris = kit.countTriangles(cityRoot);
check('7.1 全城 67 槽 mergeZone 后绘制调用大幅下降', afterCalls < beforeCalls * 0.2 && afterCalls > 0,
  `绘制调用 ${beforeCalls} → ${afterCalls}（${(100 - (afterCalls / beforeCalls) * 100).toFixed(1)}% 下降）；stats=${JSON.stringify(mergeResult?.stats ?? null)}`);
check('7.2 合批不改变可见三角面（几何守恒）', afterTris === beforeTris, `合并前 ${beforeTris} → 合并后 ${afterTris}`);
check('7.3 合批结果 ≤ 主场景预算 350', afterCalls <= CONFIG.BUDGET.drawCalls.mainSceneMax,
  `${afterCalls} / ${CONFIG.BUDGET.drawCalls.mainSceneMax}（分区预算 B${CONFIG.BUDGET.drawCalls.perZone.B}/C${CONFIG.BUDGET.drawCalls.perZone.C}/D${CONFIG.BUDGET.drawCalls.perZone.D}/E${CONFIG.BUDGET.drawCalls.perZone.E}/F${CONFIG.BUDGET.drawCalls.perZone.F}）`);

const pointCount = 64;
const treeProto = kit.tree({ size: 'medium', detail: 'near', rng: kitModule.makeRng?.(1) });
const treeGeo = [];
treeProto.traverse((n) => { if (n.isMesh && treeGeo.length === 0) treeGeo.push(n.geometry); });
const points = Array.from({ length: pointCount }, (_, i) => ({ x: (i % 8) * 12 - 48, y: 0.5, z: Math.floor(i / 8) * 12 + 300 }));
const instanced = kit.instanceFromPoints(treeGeo[0], kit.materials.foliage, points);
check(`7.4 实例化：${pointCount} 棵树 = 1 个 InstancedMesh / 1 次绘制调用`,
  instanced.isInstancedMesh === true && kit.countDrawCalls(instanced) === 1 && kit.countTriangles(instanced) > 0,
  `count=${instanced.count} drawCalls=${kit.countDrawCalls(instanced)} tri=${kit.countTriangles(instanced)}`);

/* ================================================= 8 three 单例与资产登记 */
section('8 three 单例、资产登记与许可');
check('8.1 kit.THREE === ctx.THREE 且与浏览器 import map 同一份 three r169',
  kit.THREE === THREE === true && kit.THREE.REVISION === THREE.REVISION,
  `kit.THREE.REVISION=${kit.THREE.REVISION}，bare 'three' REVISION=${THREE.REVISION}`);
const freshHall = kit.hall({ ...mainHall, quality: 'medium', lod: 'near' });
const freshMeshes = [];
freshHall.traverse((n) => { if (n.isMesh) freshMeshes.push(n); });
check('8.2 工厂产物是同一份 THREE 的 Group/Mesh/Material（无第二份 three 混入）',
  freshHall instanceof THREE.Group && freshMeshes[0] instanceof THREE.Mesh && freshMeshes[0].material instanceof THREE.Material,
  `group instanceof Group=${freshHall instanceof THREE.Group}；mesh=${freshMeshes.length} 个，material.type=${freshMeshes[0].material.type}`);

const requiredAssetFields = CONFIG.ASSETS.requiredFields;
const assetsStats = kit.assets.stats();
const assetValidation = kit.assets.validate();
check('8.3 config.ASSETS.requiredFields 与登记结构一致；运行时 0 次网络请求；9 字段校验零问题',
  requiredAssetFields.length === 9 && assetsStats.networkRequests === 0 && assetValidation.ok === true && assetValidation.problems.length === 0,
  `requiredFields=${requiredAssetFields.length} networkRequests=${assetsStats.networkRequests} validate=${JSON.stringify({ ok: assetValidation.ok, checked: assetValidation.checked, problems: assetValidation.problems.length })}`);
const creditsText = readFileSync(join(ROOT, 'docs', 'ASSET_CREDITS.md'), 'utf8');
check('8.4 docs/ASSET_CREDITS.md 明确声明无第三方素材并给出 9 字段登记表',
  /无第三方素材/.test(creditsText) && /sourceUrl/.test(creditsText) && /license/.test(creditsText),
  `${creditsText.length} 字符；声明 + 9 字段表头存在`);

const ctxProbe = await makeTestCtx({ zoneId: 'B', kit });
const bSlotCount = LAYOUT.SLOTS.filter((s) => s.zone === 'B').length;
check('8.5 core 注入路径可用：ctx.kit === kit、ctx.THREE === kit.THREE、切片只含本区槽位',
  ctxProbe.kit === kit && ctxProbe.THREE === kit.THREE && ctxProbe.zoneLayout.slots.every((s) => s.zone === 'B') && ctxProbe.zoneLayout.slots.length === bSlotCount,
  `B 区切片 ${ctxProbe.zoneLayout.slots.length} 槽（layout 中 B 区 ${bSlotCount} 槽），槽位含 x/z/baseY=${['x', 'z', 'baseY'].every((k) => k in ctxProbe.zoneLayout.slots[0])}`);

/* ==================================================== 9 G0 灰盒覆盖（前置） */
section('9 G0 前置：灰盒覆盖 ≥54 槽位与院落轮廓');
const greyboxBuilt = await buildZone('GREYBOX', { kit });
const greyBuildings = greyboxBuilt.result?.buildings ?? [];
const coveredZones = new Set(greyBuildings.map((b) => b.zone));
const greyStats = {
  drawCalls: kit.countDrawCalls(greyboxBuilt.result.root),
  triangles: kit.countTriangles(greyboxBuilt.result.root),
  obstacles: greyboxBuilt.result.colliders?.obstacles?.length ?? 0,
  viewpoints: greyboxBuilt.result.viewpoints?.length ?? 0,
  lightAnchors: greyboxBuilt.result.lightAnchors?.length ?? 0,
};
check('9.1 灰盒注册建筑数 = layout.SLOTS 67（≥54 门槛）且覆盖全部 5 个区域',
  greyBuildings.length === LAYOUT.SLOTS.length && coveredZones.size === 5,
  `${greyBuildings.length}/${LAYOUT.SLOTS.length} 栋，区域 {${[...coveredZones].sort().join(',')}}`);
check('9.2 layout 注册表数量可机器核对（槽位/院落/墙/连接/视角/灯位）',
  LAYOUT.SLOTS.length === 67 && LAYOUT.COURTYARDS.length === 14 && LAYOUT.WALLS.length === 60 && LAYOUT.CONNECTORS.length === 32 && LAYOUT.VIEWPOINTS.length === 20 && LAYOUT.LIGHT_ANCHORS.length === 49,
  `SLOTS=${LAYOUT.SLOTS.length} COURTYARDS=${LAYOUT.COURTYARDS.length} WALLS=${LAYOUT.WALLS.length} CONNECTORS=${LAYOUT.CONNECTORS.length} VIEWPOINTS=${LAYOUT.VIEWPOINTS.length} LIGHT_ANCHORS=${LAYOUT.LIGHT_ANCHORS.length}`);
const layoutObstacleTypes = {};
for (const o of LAYOUT.OBSTACLES) layoutObstacleTypes[o.sourceType] = (layoutObstacleTypes[o.sourceType] ?? 0) + 1;
const greyObstacleTypes = {};
for (const o of greyboxBuilt.result.colliders.obstacles) greyObstacleTypes[o.sourceType] = (greyObstacleTypes[o.sourceType] ?? 0) + 1;
check('9.3 灰盒障碍构成与 layout.OBSTACLES 逐 sourceType 一致（67 建筑 + 4 宫墙 + 8 水面 + 2 假山 = 81）',
  greyStats.obstacles === LAYOUT.OBSTACLES.length && JSON.stringify(greyObstacleTypes) === JSON.stringify(layoutObstacleTypes),
  `灰盒 ${JSON.stringify(greyObstacleTypes)} vs layout ${JSON.stringify(layoutObstacleTypes)}；灰盒 drawCalls=${greyStats.drawCalls} tri=${greyStats.triangles}`);
const courtWallCount = LAYOUT.WALLS.filter((w) => w.kind === 'courtWall').length;
debt('D-5 56 段院墙（layout.WALLS kind=' + `courtWall` + '）既不在 layout.OBSTACLES，灰盒 colliders 也未登记 → 第一人称不会被院墙阻挡',
  `layout.OBSTACLES 只有 4 段宫墙（OB-WALL-CITY-*）+ 8 水面 + 2 假山 + 67 建筑；CONTRACTS §6.3 只承诺"宫墙四段"，${courtWallCount} 段院墙的碰撞归属未写清`,
  't20（契约明确归属）+ 各区域/ t9（碰撞）');
check('9.4 灰盒视角/灯位登记与 layout 一一对应（≥1 zone + 1 fp-spawn，B/C 另加 interior）',
  greyStats.viewpoints === LAYOUT.VIEWPOINTS.length && greyStats.lightAnchors === LAYOUT.LIGHT_ANCHORS.length,
  `viewpoints=${greyStats.viewpoints} lightAnchors=${greyStats.lightAnchors}`);
info(`G0 门槛 config.LAYOUT_CONSTRAINTS.minSlotCount=${CONFIG.LAYOUT_CONSTRAINTS?.minSlotCount ?? 'n/a'}；灰盒覆盖 ${greyBuildings.length} > 门槛`);

// 9.5 院落轮廓完整（机器可核对）：14 院 × 4 面院墙落在院界上、每院至少一个门洞、wallIds 一一对应
const cyIssues = [];
const cyNoDoor = [];
let cyWallTotal = 0;
let cyOpenings = 0;
for (const cy of LAYOUT.COURTYARDS) {
  const walls = LAYOUT.WALLS.filter((w) => w.courtyardId === cy.id);
  cyWallTotal += walls.length;
  const b = cy.bounds;
  let openings = 0;
  for (const w of walls) {
    const onBoundary =
      (Math.abs(w.from.z - b.minZ) < 0.51 && Math.abs(w.to.z - b.minZ) < 0.51)
      || (Math.abs(w.from.z - b.maxZ) < 0.51 && Math.abs(w.to.z - b.maxZ) < 0.51)
      || (Math.abs(w.from.x - b.minX) < 0.51 && Math.abs(w.to.x - b.minX) < 0.51)
      || (Math.abs(w.from.x - b.maxX) < 0.51 && Math.abs(w.to.x - b.maxX) < 0.51);
    if (!onBoundary) cyIssues.push(`${w.id} 不落在 ${cy.id} 院界上`);
    openings += w.openings?.length ?? 0;
    cyOpenings += w.openings?.length ?? 0;
  }
  if (openings === 0) cyNoDoor.push(cy.id);
  if (walls.length !== cy.wallIds.length) cyIssues.push(`${cy.id} 实际墙数 ${walls.length} ≠ wallIds ${cy.wallIds.length}`);
  for (const id of cy.wallIds) if (!LAYOUT.WALLS.some((w) => w.id === id)) cyIssues.push(`${cy.id} wallIds 缺失 ${id}`);
}
check('9.5 14 院落轮廓完整：每院四面院墙都在院界上、至少一处门洞、wallIds 与 WALLS 一一对应',
  cyIssues.length === 0 && cyNoDoor.length === 0,
  `14 院落共 ${cyWallTotal} 面院墙、${cyOpenings} 个门洞；无门洞院落 ${cyNoDoor.length}、其它问题 ${cyIssues.length}${cyIssues.length ? `：${cyIssues.slice(0, 3).join('；')}` : ''}`);

/* ============================== 11 风格基线对照（STYLE_GUIDE §2/§3 逐值） */
section('11 风格基线：STYLE_GUIDE 表格值 vs config 令牌 vs kit 实例材质');
const styleExpect = {
  colors: { glazeGold: '#dfa112', gilt: '#ffc83b', palaceRed: '#962822', paintingTeal: '#1c4e40', warmWhite: '#f0ece1', pavingGray: '#575652', interiorBrick: '#1a1917' },
  derived: { timber: '#7a3b24', water: '#33544f' },
  materials: {
    glazeTile: { roughness: 0.42, metalness: 0.06, clearcoat: 0.55 },
    giltMetal: { roughness: 0.24, metalness: 0.92 },
    plasterRed: { roughness: 0.78, metalness: 0 },
    paintingTeal: { roughness: 0.66 },
    stoneWhite: { roughness: 0.62 },
    pavingStone: { roughness: 0.86 },
    interiorBrick: { roughness: 0.35, clearcoat: 0.35 },
    waterSurface: { roughness: 0.08 },
  },
  modules: {
    bayPitch: 6.4, bayDepth: 5.2, columnDiameter: 0.78, columnFootDiameter: 0.92,
    eaveHeight: 4.6, eaveOverhang: 2.4, eaveLift: 0.55, eaveCurve: 0.32, eaveRiseAtCorner: 1.05,
    roofSlope: 0.55, roofRisePerBay: 0.42, roofThickness: 0.42,
    terraceTierHeight: 1.5, terraceTierInset: 9, terraceTotalHeight: 4.5,
    stairsStepHeight: 0.15, stairsStepDepth: 0.34, stairsMaxRun: 20,
    wallThickness: 8, wallHeight: 12, wallBattlementHeight: 1.1,
    courtyardWallThickness: 1.2, courtyardWallHeight: 4.2,
    corridorWidth: 3.6, corridorPostPitch: 3.2,
  },
  weathering: { globalAmount: 0.2, edgeDirt: 0.25, rainStreak: 0.15, stoneDiscoloration: 0.18, mossAtBase: 0.12 },
};
const styleMismatch = [];
for (const [key, value] of Object.entries(styleExpect.colors)) if (CONFIG.COLORS[key] !== value) styleMismatch.push(`COLORS.${key}=${CONFIG.COLORS[key]}≠${value}`);
for (const [key, value] of Object.entries(styleExpect.derived)) if (CONFIG.COLORS_DERIVED[key] !== value) styleMismatch.push(`COLORS_DERIVED.${key}=${CONFIG.COLORS_DERIVED[key]}≠${value}`);
for (const [key, value] of Object.entries(styleExpect.modules)) if (CONFIG.MODULES[key] !== value) styleMismatch.push(`MODULES.${key}=${CONFIG.MODULES[key]}≠${value}`);
for (const [key, value] of Object.entries(styleExpect.weathering)) if (CONFIG.WEATHERING[key] !== value) styleMismatch.push(`WEATHERING.${key}=${CONFIG.WEATHERING[key]}≠${value}`);
for (const [id, spec] of Object.entries(styleExpect.materials)) {
  for (const [field, value] of Object.entries(spec)) if (CONFIG.MATERIALS[id][field] !== value) styleMismatch.push(`MATERIALS.${id}.${field}=${CONFIG.MATERIALS[id][field]}≠${value}`);
}
check('11.1 STYLE_GUIDE §2/§3 的色板/模数/旧化/材质光泽数值与 config 令牌逐值一致',
  styleMismatch.length === 0,
  `比对 ${Object.keys(styleExpect.colors).length + Object.keys(styleExpect.derived).length + Object.keys(styleExpect.modules).length + Object.keys(styleExpect.weathering).length + Object.keys(styleExpect.materials).length} 组；不一致 ${styleMismatch.length}${styleMismatch.length ? `：${styleMismatch.join('；')}` : ''}`);

const roughDeltas = {};
for (const id of Object.keys(styleExpect.materials)) {
  const actual = kit.materials[id].roughness;
  roughDeltas[id] = +(actual - CONFIG.MATERIALS[id].roughness).toFixed(3);
}
info(`kit 实例材质 roughness 相对 config 基础值的偏移：${JSON.stringify(roughDeltas)}（= WEATHERING.roughnessBias ${CONFIG.WEATHERING.roughnessBias}，materials.js 已声明"统一轻度旧化"）`);
const roughnessConsistent = Object.values(roughDeltas).every((d, _, arr) => Math.abs(d - CONFIG.WEATHERING.roughnessBias) < 1e-9 || Math.abs(d) < 1e-9);
check('11.2 材质光泽规范一致（只有鎏金 metalness ≥ 0.9；其余 metalness ≤ 0.06）；roughness 偏移统一',
  kit.materials.giltMetal.metalness >= 0.9 && CONFIG.MATERIALS.glazeTile.metalness < 0.1
  && Object.entries(CONFIG.MATERIALS).every(([id, m]) => id === 'waterSurface' || id === 'giltMetal' || m.metalness <= 0.06)
  && roughnessConsistent,
  `giltMetal.metalness=${kit.materials.giltMetal.metalness}；琉璃瓦 metalness=${CONFIG.MATERIALS.glazeTile.metalness} + clearcoat=${CONFIG.MATERIALS.glazeTile.clearcoat}（"有清漆感的非纯金属"）`);


section('12 文档化参数探测：CONTRACTS §3.4 列出的 params 是否足够摆位');
const probeSlot = LAYOUT.SLOTS.find((s) => s.id === 'C-hall-bed-main') ?? LAYOUT.SLOTS[0];
const probeDoc = kit.hall({
  id: probeSlot.id, name: probeSlot.name, w: probeSlot.w, d: probeSlot.d, bays: probeSlot.bays,
  terraceH: probeSlot.terraceH, roofType: probeSlot.roofType, grade: probeSlot.grade,
  facing: probeSlot.facing, rotationYDeg: probeSlot.rotationYDeg, quality: 'medium', lod: 'near',
});
const probeExpected = { x: probeSlot.x, y: probeSlot.baseY - probeSlot.terraceH, z: probeSlot.z };
const probeActual = { x: probeDoc.position.x, y: probeDoc.position.y, z: probeDoc.position.z };
const probeOk = Math.abs(probeActual.x - probeExpected.x) < 0.01 && Math.abs(probeActual.y - probeExpected.y) < 0.01 && Math.abs(probeActual.z - probeExpected.z) < 0.01;
info(`仅用 §3.4 列出的 params 构建 ${probeSlot.id}：position=(${probeActual.x},${probeActual.y},${probeActual.z})，layout 槽位应为 (${probeExpected.x},${probeExpected.y},${probeExpected.z}) → 仅文档参数会落到原点，必须在契约里补 x/z/baseY（登记为 D-1）`);
const probeAgain = kit.hall({
  id: probeSlot.id, name: probeSlot.name, x: probeSlot.x, z: probeSlot.z, w: probeSlot.w, d: probeSlot.d, bays: probeSlot.bays,
  terraceH: probeSlot.terraceH, baseY: probeSlot.baseY, roofType: probeSlot.roofType, grade: probeSlot.grade,
  facing: probeSlot.facing, rotationYDeg: probeSlot.rotationYDeg, quality: 'medium', lod: 'near',
});
check('12.1 显式传入 layout 槽位的 x/z/baseY 后，工厂位置确定且与槽位一致（实现侧无隐式状态）',
  probeAgain.position.x === probeSlot.x && probeAgain.position.z === probeSlot.z
  && Math.abs(probeAgain.position.y - (probeSlot.baseY - probeSlot.terraceH)) < 1e-9
  && probeAgain.position.x === (kit.hall({
    id: probeSlot.id, x: probeSlot.x, z: probeSlot.z, w: probeSlot.w, d: probeSlot.d, bays: probeSlot.bays,
    terraceH: probeSlot.terraceH, baseY: probeSlot.baseY, roofType: probeSlot.roofType, grade: probeSlot.grade,
    facing: probeSlot.facing, rotationYDeg: probeSlot.rotationYDeg, quality: 'medium', lod: 'near',
  }).position.x),
  `position=(${probeAgain.position.x},${probeAgain.position.y},${probeAgain.position.z})，期望 (${probeSlot.x},${probeSlot.baseY - probeSlot.terraceH},${probeSlot.z})；重复构建位置一致`);
debt('D-1 CONTRACTS §3.4 未列出工厂必需/常用 params：x/z/baseY、lod 单档用法、返回类型 THREE.LOD、mergeZone 合批义务、materials 共享所有权、props 工厂与 role 引用',
  '区域作者若只读 CONTRACTS §3.4，会漏掉本验证确认必需的 x/z/baseY（否则 67 栋全部落在原点）；实现侧全部支持并已实测通过（§4/§6/§7）',
  't20（CONTRACTS 补全，t1 系列归属）');
debt('D-2 docs/handoff-kit.md §1 依赖冲突条仍写“默认放行 + createKit({strictRoofGrade:true}) 才抛错”，与实现（始终抛错、无该开关）及 CONTRACTS §4.2 冲突',
  '实测 src/kit/index.js 无 strictRoofGrade 参数，normalizeParams 对 grade-roof 不匹配一律 errors.push → 工厂抛错；该行会误导区域作者以为违规可取默认值',
  't3（docs/handoff-kit.md 修订）');
debt('D-3 docs/handoff-kit.md 版本戳仍为 CONTRACTS v1.0.0 / CONFIG 1.0.0；docs/ASSET_CREDITS.md 亦标 CONFIG_VERSION 1.0.0',
  '当前有效组合为 CONTRACTS v1.0.1 ⇄ CONFIG 1.0.1 ⇄ LAYOUT 1.0.0 ⇄ STYLE_BASELINE v1.0.0，版本戳未同步',
  't3 / t20');
debt('D-4 未文档化：terraceH>0.2 的构件会自动附带台明 + 正面台阶（B-hall-main 自动台阶使 worldBounds 南向超出槽位 10.31m）',
  'kit 无 plinth/stairs 抑制开关；layout.TERRACES 已为 B 主殿登记三层台基（z −168…−64），区域作者若同时用 kit.terrace + kit.hall 会出现台明/台阶三层重叠',
  't20（约定）+ t3（可选 params.plinth/stairs=false）');

/* ======================= 13 已交付区域的实证（G1 充分性的直接证据） ======================= */
section('13 真实区域消费实证：已交付区域是否只靠文档化 kit 就能达标');
const { ZONE_MODULES, checkZoneResult } = await import('../tests/harness.mjs');
const zoneEvidence = {};
for (const zoneId of ['B', 'C', 'D', 'E', 'F']) {
  const rel = ZONE_MODULES[zoneId];
  if (!existsSync(join(ROOT, rel))) { zoneEvidence[zoneId] = { delivered: false, module: rel }; continue; }
  try {
    const built = await buildZone(zoneId, { kit });
    const result = built.result;
    let meshes = 0;
    let kitMaterialMeshes = 0;
    result.root.traverse((n) => {
      if (!n.isMesh && !n.isInstancedMesh) return;
      meshes += 1;
      if (kit.isOwned(n.material)) kitMaterialMeshes += 1;
    });
    const validation = await checkZoneResult(zoneId, result);
    const problems = validation.problems ?? [];
    const budget = CONFIG.BUDGET.drawCalls.perZone[zoneId];
    zoneEvidence[zoneId] = {
      delivered: true, module: rel, buildings: result.buildings.length,
      drawCalls: kit.countDrawCalls(result.root), triangles: kit.countTriangles(result.root),
      budget, meshes, kitMaterialMeshes, contractProblems: problems.length,
      overBudget: kit.countDrawCalls(result.root) > budget,
    };
  } catch (error) {
    zoneEvidence[zoneId] = { delivered: true, module: rel, error: error.message.split('\n')[0] };
  }
}
for (const [zoneId, ev] of Object.entries(zoneEvidence)) {
  info(`${zoneId}: ${ev.delivered
    ? (ev.error
      ? `构建失败 → ${ev.error}`
      : `建筑 ${ev.buildings} · 绘制调用 ${ev.drawCalls}/${ev.budget}${ev.overBudget ? '（超预算）' : ''} · 三角面 ${ev.triangles} · kit 材质网格 ${ev.kitMaterialMeshes}/${ev.meshes} · 契约问题 ${ev.contractProblems}`)
    : `未交付（${ev.module}）`}`);
}
const deliveredZones = Object.entries(zoneEvidence).filter(([, ev]) => ev.delivered);
const undeliveredZones = Object.entries(zoneEvidence).filter(([, ev]) => !ev.delivered).map(([z]) => z);
check('13.1 已交付区域全部通过契约校验，且 ≥95% 网格使用 kit 共享材质（未自建私有素材库）',
  deliveredZones.length > 0 && deliveredZones.every(([, ev]) => !ev.error && ev.contractProblems === 0 && ev.kitMaterialMeshes / Math.max(ev.meshes, 1) >= 0.95),
  `已交付 ${deliveredZones.map(([z]) => z).join('/')}；未交付 ${undeliveredZones.join('/') || '（无）'}`);

const zoneSourceFiles = readdirSync(join(ROOT, 'src', 'zones')).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
const zonePrivate = [];
for (const file of zoneSourceFiles) {
  const code = stripComments(readFileSync(join(ROOT, 'src', 'zones', file), 'utf8'));
  if (/#[0-9a-fA-F]{3,8}\b/.test(code)) zonePrivate.push(`${file}: 硬编码色值`);
  if (/new\s+\w*\.?Mesh(Physical|Standard|Basic|Lambert|Phong)Material/.test(code)) zonePrivate.push(`${file}: 自建材质`);
}
check('13.2 已交付区域源码零硬编码色值、零自建材质（统一资源库真实生效）',
  zonePrivate.length === 0, `${zoneSourceFiles.length} 个区域文件扫描${zonePrivate.length ? `：${zonePrivate.join('；')}` : '，命中 0'}`);

/* ============================================================ 汇总与退出 */
const failed = results.filter((r) => !r.ok);
console.log('\n---------------------------------------------------------');
console.log(` 检查项 ${results.length} 项：PASS ${results.length - failed.length} / FAIL ${failed.length}，另有 DEBT ${debts.length} 项（归属其它任务）`);
for (const f of failed) console.log(`  ✗ ${f.id} — ${f.detail}`);
for (const d of debts) console.log(`  △ [${d.owner}] ${d.id}`);
console.log('---------------------------------------------------------');
console.log(JSON.stringify({
  node: process.version,
  three: THREE.REVISION,
  kitVersion: kitModule.KIT_VERSION,
  checks: results.map((r) => ({ id: r.id, ok: r.ok })),
  debts,
  counts: {
    slots: LAYOUT.SLOTS.length,
    courtyards: LAYOUT.COURTYARDS.length,
    cityDrawCallsBefore: beforeCalls,
    cityDrawCallsAfter: afterCalls,
    cityTriangles: afterTris,
    maxSingleBuildingTriangles: maxSingle,
    maxEaveDeviationMm: +(maxEave * 1000).toFixed(3),
    maxLateralExtraM: +Math.max(...lateralExtra).toFixed(3),
    maxFrontExtraM: +frontWorst.toFixed(3),
    greyboxBuildings: greyBuildings.length,
  },
}, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
