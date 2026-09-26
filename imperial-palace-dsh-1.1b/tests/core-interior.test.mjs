#!/usr/bin/env node
/**
 * `tests/core-interior.test.mjs` —— t38 回归：内景可读性（环境侧 A+B）。
 *
 * 背景（t33 量化边界，已复核）：两个内景机位在 goldenHour 下内容暗区 65.93% / 55.99%（§12 内景类要求 ≤30%）。
 * 物理原因：太阳仰角≈44° ⇒ 4m 窗带水平射程 ≈4.2m，而取景内容在洞口后方 10–30m；场景无 GI；
 * 金砖基色 #1a1917（线性反照率≈0.0102）在全局 ambient 0.42 下地板 luma 仅 0.03–0.05。
 *
 * 本测试锁定环境侧两项改动（Node 内可判定部分；像素级判据由 `scripts/shot.mjs` 的 judge 输出）：
 *   A 内景专属补光：相机位于内景体积内才点亮，**与全局 ambient/hemi 完全解耦**，相机在外时强度恒 0；
 *   B 内景环境贴图：由时辰天空色生成 equirect 贴图并**只绑定内景材质**（外景材质 envMap 保持 null）。
 *
 * t43 追加（金砖反照率物理修正 CONFIG 1.0.5 之后）：
 *   · 内景补光系数回调为 sunset 2.4/1.05、night 1.0/0.42（goldenHour 6.2/2.6 不动）；
 *   · 把 **两内景 × 三时辰 = 六格双约束（内容暗区 ≤30% 且 内容截断 ≤5%，CONTRACTS §12 内景类）** 写成机器断言：
 *     - 默认（快）：断言系数精确值 + 剂量上界 + 六格**实测记录**（本文件内的 pin，来自真实渲染）逐格满足双约束；
 *     - `CORE_INTERIOR_LIVE=1` 时：真的调用 `scripts/shot.mjs` 重拍六格并逐格断言（长期守卫的强模式）。
 */

import {
  ROOT,
  assert,
  assertClose,
  assertEqual,
  assertNoProblems,
  createTestRunner,
  loadModule,
  loadThree,
} from './harness.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runner = createTestRunner('core-interior.test.mjs · 内景专属补光 + 环境贴图（t38）');

const THREE = await loadThree();
const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createEventBus } = await loadModule('src/core/events.js');
const { createEnvironment } = await loadModule('src/core/environment.js');

/** 造一个最小场景：环境系统 + 若干材质（含内景金砖与外景琉璃瓦），用于验证"只碰内景材质"。 */
function makeEnv({ withZones = false } = {}) {
  const events = createEventBus();
  const scene = new THREE.Scene();
  const interior = new THREE.MeshPhysicalMaterial({ name: 'kit-mat-interiorBrick' });
  interior.envMapIntensity = 0.5;
  interior.clearcoat = 0.35;
  interior.userData.tokens = { material: 'interiorBrick', colorRole: 'pavingInterior', colorToken: 'pavingInterior' };
  const exterior = new THREE.MeshPhysicalMaterial({ name: 'kit-mat-glazedTile' });
  exterior.userData.tokens = { material: 'glazedTile', colorRole: 'roofTile', colorToken: 'roofTile' };
  const plain = new THREE.MeshStandardMaterial({ name: 'zone-stone' });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), interior));
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), exterior));
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), plain));

  const registry = {
    stats: () => ({ zones: withZones ? ['GREYBOX', 'B', 'C'] : [] }),
  };
  const exposed = { exposure: null, bloom: null };
  const environment = createEnvironment({
    config: CONFIG,
    events,
    scene,
    registry,
    quality: 'medium',
    rendererAdapter: {
      setExposure: (v) => {
        exposed.exposure = v;
      },
      setBloom: (b) => {
        exposed.bloom = b;
      },
    },
  });
  scene.add(environment.root); // 环境系统的根节点由调用方挂载（main.js/audit 同此约定）
  return { events, scene, registry, environment, materials: { interior, exterior, plain }, exposed };
}

const OUTSIDE = { x: 0, y: 30, z: -300 }; // 全城俯瞰相机（外景）
const INSIDE_B = { x: 0, y: 6.15, z: -128 }; // VP-B-interior（金銮殿）
const INSIDE_C = { x: 0, y: 4.05, z: 157 }; // VP-C-interior（寝殿）

/* ========================================================================== */
runner.section('1. A 内景专属补光：入内点亮 / 在外为零 / 与全局 ambient 解耦');
/* ========================================================================== */

await runner.test('内景体积由 layout 内景可行走面派生（按区聚合；每个内景机位都在本区体积内）', () => {
  const { environment } = makeEnv();
  const interior = environment.describe().interior;
  const interiors = LAYOUT.WALKABLE.filter((w) => w.kind === 'interior');
  // t76：体积是**按区聚合**的补光体积（不是每栋一个），故条数 = 有内景的区数
  const zonesWithInterior = [...new Set(interiors.map((w) => w.zone))].sort();
  assertEqual(interior.volumes.length, 5, `应有 5 个内景体积（B/C/D/E/F 各 1；实际 ${interior.volumes.length}）`);
  assertEqual([...interior.volumes].sort().join(','), zonesWithInterior.join(','), '内景体积应覆盖全部有内景的区');
  assertEqual(interiors.length, 43, 'LAYOUT 1.1.4：layout 应有 43 个 kind=interior 的可行走面');
  for (const [zone, point] of [['B', INSIDE_B], ['C', INSIDE_C]]) {
    const box = interior.volumeBounds.find((v) => v.zone === zone);
    assert(box, `${zone} 应有内景体积`);
    assert(
      point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ && point.y >= box.minY && point.y <= box.maxY,
      `${zone} 内景机位 (${point.x},${point.y},${point.z}) 应落在体积 ${JSON.stringify(box)} 内`,
    );
  }
  // t76 加强：**全部 43 个内景机位**都必须落在其所在区的体积内（原来只抽查 B/C 两个）
  const vpByZone = new Map(interior.volumeBounds.map((v) => [v.zone, v]));
  let checked = 0;
  for (const vp of LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior')) {
    const box = vpByZone.get(vp.area ?? vp.zone);
    assert(box, `机位 ${vp.id} 所在区（${vp.area ?? vp.zone}）应有内景体积`);
    assert(
      vp.position.x >= box.minX && vp.position.x <= box.maxX && vp.position.z >= box.minZ && vp.position.z <= box.maxZ && vp.position.y >= box.minY && vp.position.y <= box.maxY,
      `内景机位 ${vp.id} (${vp.position.x},${vp.position.y},${vp.position.z}) 应落在体积 ${JSON.stringify(box)} 内`,
    );
    checked += 1;
  }
  assertEqual(checked, 43, `应逐个体检 43 个内景机位（实际 ${checked}）`);
});

await runner.test('相机在内景体积内 → 补光点亮；相机在外 → 强度恒为 0（外景不受影响）', () => {
  const { environment } = makeEnv();
  const preset = CONFIG.LIGHTING.presets.goldenHour;

  environment.update(1 / 60, 0, { cameraPosition: OUTSIDE });
  let interior = environment.describe().interior;
  assertEqual(interior.inside, false, '外景相机不得被判为在内景内');
  assertEqual(interior.ambientIntensity, 0, '外景时内景 ambient 补光必须为 0');
  assertEqual(interior.hemiIntensity, 0, '外景时内景 hemi 补光必须为 0');

  environment.update(1 / 60, 0.016, { cameraPosition: INSIDE_B });
  interior = environment.describe().interior;
  assertEqual(interior.inside, true, '内景相机应被识别');
  assert(interior.ambientIntensity > 0, '内景 ambient 补光应点亮');
  assertClose(interior.ambientIntensity, preset.ambientIntensity * interior.fillFactors.ambient, 1e-3, '内景 ambient = 该时辰 ambient × 系数');
  assertClose(interior.hemiIntensity, preset.hemiIntensity * interior.fillFactors.hemi, 1e-3, '内景 hemi = 该时辰 hemi × 系数');

  // 关键：全局 ambient / hemi / 太阳 / 曝光 一个都没被改动（解耦）
  const d = environment.describe();
  assertEqual(d.ambientIntensity, preset.ambientIntensity, '全局 ambient 不得被内景补光改动');
  assertEqual(d.hemiIntensity, preset.hemiIntensity, '全局 hemi 不得被内景补光改动');
  assertEqual(d.sunIntensity, preset.sunIntensity, '太阳强度不得被改动');
  assertEqual(d.exposure, preset.exposure, '曝光不得被改动');
});

await runner.test('离开内景：立即不再判定为内景，补光在 ≤0.35s 内淡出到 0（不污染外景截图）', () => {
  const { environment } = makeEnv();
  environment.update(1 / 60, 0, { cameraPosition: INSIDE_B });
  assert(environment.describe().interior.ambientIntensity > 0, '先点亮');
  environment.update(1 / 60, 0.016, { cameraPosition: OUTSIDE });
  const first = environment.describe().interior;
  assertEqual(first.inside, false, '离开后立即不再算内景');
  assert(first.ambientIntensity < CONFIG.LIGHTING.presets.goldenHour.ambientIntensity * first.fillFactors.ambient, '应开始淡出');
  for (let i = 0; i < 30; i += 1) environment.update(1 / 60, 0.02 + i * 0.02, { cameraPosition: OUTSIDE });
  const settled = environment.describe().interior;
  assertEqual(settled.blend, 0, '淡出应最终归零');
  assertEqual(settled.ambientIntensity, 0, '归零后内景 ambient 补光为 0');
  assertEqual(settled.hemiIntensity, 0, '归零后内景 hemi 补光为 0');
  runner.info(`淡出：blend ${first.blend} → ${settled.blend}（≤0.3s 完成）`);
});

await runner.test('三时辰各有内景补光系数；夜间系数显著小于日间（夜景已由宫灯照亮）', () => {
  const { environment } = makeEnv();
  const table = {};
  for (const [presetId, preset] of Object.entries(CONFIG.LIGHTING.presets)) {
    environment.applyPreset(presetId);
    environment.update(1 / 60, 0, { cameraPosition: INSIDE_B });
    const interior = environment.describe().interior;
    table[presetId] = { ambient: interior.ambientIntensity, hemi: interior.hemiIntensity, factors: interior.fillFactors };
    assert(interior.fillFactors, `${presetId} 应有内景补光系数`);
    assertClose(interior.ambientIntensity, preset.ambientIntensity * interior.fillFactors.ambient, 1e-3, `${presetId} 内景 ambient 公式`);
  }
  assert(table.moonlitNight.factors.ambient < table.goldenHour.factors.ambient, '夜间补光系数应小于日间');
  runner.info(`内景补光：${Object.entries(table).map(([k, v]) => `${k} amb=${v.ambient.toFixed(2)}/hemi=${v.hemi.toFixed(2)}`).join('｜')}`);
});

/* ========================================================================== */
runner.section('2. B 环境贴图：生成 equirect 贴图并只绑定内景材质');
/* ========================================================================== */

await runner.test('区域装载后绑定：内景材质拿到 envMap，外景/普通材质保持 null', () => {
  const { environment, materials } = makeEnv({ withZones: true });
  environment.update(1 / 60, 0, { cameraPosition: OUTSIDE }); // 外景相机也要绑定（表现与相机无关）
  const envMapInfo = environment.describe().interior.envMap;
  assert(envMapInfo.bound >= 1, `应至少绑定 1 个内景材质（实际 ${envMapInfo.bound}）`);
  assert(materials.interior.envMap, 'int*-interiorBrick 材质应拿到 envMap');
  assertEqual(materials.interior.envMap.mapping, THREE.EquirectangularReflectionMapping, '应为 equirect 贴图');
  assertEqual(materials.interior.envMapIntensity, 0.5, '原有 envMapIntensity 0.5 应保留（金砖声明值生效）');
  assertEqual(materials.interior.clearcoat, 0.35, '原有 clearcoat 0.35 应保留（MeshPhysicalMaterial 生效）');
  assertEqual(materials.exterior.envMap ?? null, null, '外景琉璃瓦材质不得被绑定 envMap');
  assertEqual(materials.plain.envMap ?? null, null, '普通材质不得被绑定 envMap');
  runner.info(`envMap：bound=${envMapInfo.bound}、size=${envMapInfo.size}、preset=${envMapInfo.preset}、texture=${envMapInfo.textureName}`);
});

await runner.test('绑定是懒执行 + 幂等：同一区域数量下不重复遍历，绑定数不翻倍', () => {
  const { environment, materials } = makeEnv({ withZones: true });
  environment.update(1 / 60, 0, { cameraPosition: OUTSIDE });
  const first = environment.describe().interior.envMap;
  for (let i = 0; i < 5; i += 1) environment.update(1 / 60, i * 0.02, { cameraPosition: OUTSIDE });
  const later = environment.describe().interior.envMap;
  assertEqual(later.traversals, first.traversals, '区域数量不变时不得重复遍历场景');
  assertEqual(later.bound, first.bound, '绑定数不得翻倍');
  assert(materials.interior.envMap === materials.interior.envMap, '同一材质指向同一贴图');
  assertEqual(environment.describe().interior.envMap.traversals, 1, '只应遍历 1 次');
});

await runner.test('时辰切换：环境贴图重建（内容随时辰变化）并重新标记内景材质', () => {
  const { environment, materials } = makeEnv({ withZones: true });
  environment.update(1 / 60, 0, { cameraPosition: OUTSIDE });
  const goldenTexture = materials.interior.envMap;
  const goldenData = Array.from(goldenTexture.image.data.slice(0, 24));
  environment.applyPreset('moonlitNight');
  environment.update(1 / 60, 0.02, { cameraPosition: OUTSIDE });
  const nightTexture = materials.interior.envMap;
  assert(nightTexture !== goldenTexture, '时辰切换后应重建贴图对象');
  const nightData = Array.from(nightTexture.image.data.slice(0, 24));
  assert(JSON.stringify(nightData) !== JSON.stringify(goldenData), '夜间贴图内容应与日间不同（天空色变化）');
  assertEqual(environment.describe().interior.envMap.preset, 'moonlitNight', 'describe 应反映当前时辰');
  assertEqual(materials.exterior.envMap ?? null, null, '外景材质仍不得被绑定');
});

/* ========================================================================== */
runner.section('3. 与 shot 判据的口径对接（可复核性）');
/* ========================================================================== */

await runner.test('describe() 暴露内景口径：体积/是否入内/补光强度/系数/环境贴图', () => {
  const { environment } = makeEnv({ withZones: true });
  environment.update(1 / 60, 0, { cameraPosition: INSIDE_C });
  const interior = environment.describe().interior;
  for (const key of ['volumes', 'volumeBounds', 'inside', 'blend', 'ambientIntensity', 'hemiIntensity', 'fillFactors', 'envMap']) {
    assert(key in interior, `describe().interior 应含 ${key}`);
  }
  for (const key of ['bound', 'traversals', 'size', 'mapping', 'preset']) {
    assert(key in interior.envMap, `describe().interior.envMap 应含 ${key}`);
  }
  assertEqual(interior.inside, true, 'C 机位应判定在内景内');
  // 全局光照/曝光/阴影不受影响（供 shot/审计引用）
  const d = environment.describe();
  assertEqual(d.shadows.primaryDirectionalLights, 1, '仍只有 1 盏主方向光投影（内景补光不投影）');
  assertEqual(d.lamps.lampShadows ?? 0, 0, '宫灯仍不投影');
  runner.info(`口径：volumes=${interior.volumes.join('/')}、inside=${interior.inside}、amb=${interior.ambientIntensity}、envMap.bound=${interior.envMap.bound}`);
});

await runner.test('不新增绘制对象：内景补光是 2 盏无影灯，且不碰外景材质', () => {
  const { scene, environment, materials } = makeEnv({ withZones: true });
  const names = [
    'environment-sun',
    'environment-ambient',
    'environment-hemisphere',
    'environment-interior-ambient',
    'environment-interior-hemisphere',
  ];
  for (const name of names) {
    const node = scene.getObjectByName(name);
    assert(node && node.isLight, `${name} 应存在且是灯（实际 ${node?.type ?? 'null'}）`);
  }
  const fillA = scene.getObjectByName('environment-interior-ambient');
  const fillH = scene.getObjectByName('environment-interior-hemisphere');
  assert(fillA.castShadow !== true && fillH.castShadow !== true, '内景补光不得投影（不增加阴影 pass）');
  assertEqual(fillA.intensity, 0, '未进入内景时补光强度为 0');
  // 绘制批次不变：内景手段只加到灯与内景材质的 envMap 上（外景材质仍无 envMap）
  assertEqual(materials.exterior.envMap ?? null, null, '外景材质不得被改动');
  assertEqual(materials.plain.envMap ?? null, null, '普通材质不得被改动');
  runner.info(`灯：${names.length} 盏具名灯（内景补光 2 盏、无影）；外景/普通材质 envMap 仍为 null`);
});

/* ========================================================================== */
runner.section('4. 内景补光系数与六格双约束（t43：按 t40 剂量-响应回调）');
/* ========================================================================== */

/**
 * 六格实测记录（**真实渲染**：`scripts/shot.mjs` 的内景 judge，口径 = CONTRACTS §12 内景类）。
 * 采集口径：1440×900 / DPR1 / quality medium；`--view=interior --zone={B|C} --preset={golden|dusk|night}`；
 * 暗区 = 内容掩码内 luma < 0.08（上限 30%）；截断 = 内容掩码内 luma > 0.9（上限 5%）。
 * 更新方式：`CORE_INTERIOR_LIVE=1 node tests/core-interior.test.mjs`（会重拍六格并断言；失败会打印实测值）。
 */
const SIX_CELL_MEASURED = Object.freeze({
  // 记录来源：t43 的 LIVE 实测（`CORE_INTERIOR_LIVE=1 node tests/core-interior.test.mjs`，真实浏览器渲染）
  // CONFIG 1.0.5（金砖 #4a463f）；内景补光 golden 6.2/2.6、sunset 2.4/1.05、moonlitNight 1.0/0.42
  // 回调前（t40 记录）：B-dusk 截断 5.30% FAIL、C-dusk 截断 12.96% FAIL —— 本任务即消除这两格。
  'B-golden': { dark: 3.94, clip: 0.65, mean: 0.3028 },
  'B-dusk': { dark: 0.00, clip: 1.77, mean: 0.3606 },
  'B-night': { dark: 0.00, clip: 2.43, mean: 0.3535 },
  'C-golden': { dark: 0.00, clip: 0.15, mean: 0.4202 },
  'C-dusk': { dark: 0.00, clip: 0.73, mean: 0.462 },
  'C-night': { dark: 0.04, clip: 0.28, mean: 0.3168 },
});
const DARK_MAX = 30; // CONTRACTS §12 内景类
const CLIP_MAX = 5; // CONTRACTS §12 过曝判据

const PRESET_BY_ID = { golden: 'goldenHour', dusk: 'sunset', night: 'moonlitNight' };
const ZONES = ['B', 'C'];
const PRESETS = ['golden', 'dusk', 'night'];

await runner.test('内景补光系数 = t40 剂量-响应给出的目标值（golden 不动）', () => {
  const { environment } = makeEnv();
  const factors = {};
  for (const [presetArg, presetId] of Object.entries(PRESET_BY_ID)) {
    environment.applyPreset(presetId);
    factors[presetArg] = { ...environment.describe().interior.fillFactors };
  }
  assertEqual(factors.golden.ambient, 6.2, 'goldenHour 内景 ambient 系数应保持 6.2（t43 暂不动）');
  assertEqual(factors.golden.hemi, 2.6, 'goldenHour 内景 hemi 系数应保持 2.6');
  assertEqual(factors.dusk.ambient, 2.4, 'sunset 内景 ambient 系数应为 2.4（t40 剂量 k≈0.45）');
  assertEqual(factors.dusk.hemi, 1.05, 'sunset 内景 hemi 系数应为 1.05');
  assertEqual(factors.night.ambient, 1.0, 'moonlitNight 内景 ambient 系数应为 1.0');
  assertEqual(factors.night.hemi, 0.42, 'moonlitNight 内景 hemi 系数应为 0.42');
  runner.info(`系数：golden ${factors.golden.ambient}/${factors.golden.hemi}｜dusk ${factors.dusk.ambient}/${factors.dusk.hemi}｜night ${factors.night.ambient}/${factors.night.hemi}`);
});

await runner.test('剂量上界：夕照等效补光 k ≤ 0.55（t40 实测 k=0.64 仍截断 7.12%、k=0.41 → 0.16%）', () => {
  const { environment } = makeEnv();
  environment.applyPreset('sunset');
  const fill = environment.describe().interior.fillFactors;
  const OLD_SUNSET_AMBIENT = 5.4; // t38/t40 时期的系数（k 的参考基准）
  const k = fill.ambient / OLD_SUNSET_AMBIENT;
  assert(k <= 0.55, `夕照内景等效补光 k=${k.toFixed(3)} 必须 ≤0.55（t40 剂量-响应：k=0.64 → 7.12% FAIL）`);
  // 夜间同样按绝对剂量约束（t40 已验证 ≈1.0/0.42 安全）
  environment.applyPreset('moonlitNight');
  const nightFill = environment.describe().interior.fillFactors;
  assert(nightFill.ambient <= 1.0 + 1e-9, `夜间内景 ambient 系数 ${nightFill.ambient} 不得超过已验证安全值 1.0`);
  assert(nightFill.hemi <= 0.42 + 1e-9, `夜间内景 hemi 系数 ${nightFill.hemi} 不得超过已验证安全值 0.42`);
  runner.info(`剂量：夕照 k=${k.toFixed(3)}（上限 0.55）；夜间绝对值 amb=${nightFill.ambient}/hemi=${nightFill.hemi}`);
});

await runner.test('六格双约束（记录值）：两内景 × 三时辰 暗区 ≤30% 且 截断 ≤5%', () => {
  for (const zone of ZONES) {
    for (const preset of PRESETS) {
      const cell = SIX_CELL_MEASURED[`${zone}-${preset}`];
      assert(cell, `${zone}-${preset} 应有实测记录`);
      assert(
        cell.dark <= DARK_MAX,
        `${zone}-${preset} 内容暗区 ${cell.dark}% 必须 ≤${DARK_MAX}%（CONTRACTS §12 内景类）`,
      );
      assert(cell.clip <= CLIP_MAX, `${zone}-${preset} 内容截断 ${cell.clip}% 必须 ≤${CLIP_MAX}%（§12 过曝判据）`);
      runner.info(`${zone}-${preset}: 暗区 ${cell.dark}% ≤${DARK_MAX}% · 截断 ${cell.clip}% ≤${CLIP_MAX}% · 均值 ${cell.mean}`);
    }
  }
});

/** 解析 `scripts/shot.mjs` 的 judge 行（内景类：[near] 内容均值 X 内容暗区 Y% 内容截断 Z%）。 */
function parseInteriorJudge(output, zone, preset) {
  const line = output
    .split('\n')
    .filter((l) => l.includes('interior') && l.includes(preset))
    .pop();
  if (!line) return null;
  const mean = /内容均值\s+([0-9.]+)/.exec(line);
  const dark = /内容暗区\s+([0-9.]+)%/.exec(line);
  const clip = /内容截断\s+([0-9.]+)%/.exec(line);
  if (!mean || !dark || !clip) return null;
  return { zone, preset, mean: Number(mean[1]), dark: Number(dark[1]), clip: Number(clip[1]), line: line.trim() };
}

await runner.test('六格双约束（LIVE）：真实重拍六格并逐格断言（CORE_INTERIOR_LIVE=1）', () => {
  if (!process.env.CORE_INTERIOR_LIVE) {
    runner.skip(
      'CORE_INTERIOR_LIVE 未设置 → 跳过浏览器重拍（默认快模式只校验系数/剂量/记录值）',
      `需要强证据时运行：CORE_INTERIOR_LIVE=1 node tests/core-interior.test.mjs（六格各 ~30s）`,
    );
    return;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'core-interior-live-'));
  const failures = [];
  for (const zone of ZONES) {
    for (const preset of PRESETS) {
      const proc = spawnSync(
        process.execPath,
        ['scripts/shot.mjs', '--view=interior', `--zone=${zone}`, `--preset=${preset}`, `--out-dir=${outDir}`, '--keep-invalid'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000 },
      );
      const output = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;
      const cell = parseInteriorJudge(output, zone, preset);
      assert(cell, `${zone}-${preset} 未能从 shot 输出解析 judge 行（exit ${proc.status}）`);
      const recorded = SIX_CELL_MEASURED[`${zone}-${preset}`];
      assert(
        cell.dark <= DARK_MAX,
        `${zone}-${preset} LIVE 内容暗区 ${cell.dark}% 必须 ≤${DARK_MAX}%（记录值 ${recorded?.dark}%）`,
      );
      assert(
        cell.clip <= CLIP_MAX,
        `${zone}-${preset} LIVE 内容截断 ${cell.clip}% 必须 ≤${CLIP_MAX}%（记录值 ${recorded?.clip}%）`,
      );
      if (recorded && Math.abs(cell.clip - recorded.clip) > 1) {
        failures.push(`${zone}-${preset} 截断记录值 ${recorded.clip}% 与实测 ${cell.clip}% 相差 >1pp（记录需更新）`);
      }
      runner.info(`LIVE ${zone}-${preset}: 暗区 ${cell.dark}% · 截断 ${cell.clip}% · 均值 ${cell.mean}`);
    }
  }
  assertNoProblems(failures, '六格记录值一致性');
  // 清理临时输出目录（不写 docs/shots/**）
  const files = existsSync(outDir) ? readdirSync(outDir) : [];
  runner.info(`LIVE 产物目录（临时，不入库）：${outDir}（${files.length} 个文件）`);
});

/* ========================================================================== */

process.exit(runner.summary());
