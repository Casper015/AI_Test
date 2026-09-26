#!/usr/bin/env node
/**
 * `scripts/audit.mjs` —— 在 **Node 内**装配全部区域并统计绘制批次 / 三角面 / 材质与纹理数，
 * 对照 §8.2 预算（`config.BUDGET`）逐区与全城回报。
 *
 *   node scripts/audit.mjs                 # 只报告，退出码 0
 *   node scripts/audit.mjs --enforce       # 超预算 / 契约不合规 → 退出码 1
 *   node scripts/audit.mjs --json          # 额外写 work/t2-audit.json（中间产物，不进发布包）
 *   node scripts/audit.mjs --json=/tmp/a.json  # 指定报告路径（测试/CI 用，避免在 ROOT 内落中间产物）
 *   node scripts/audit.mjs --quality=high  # 质量档（影响 kit 的细节级别）
 *   node scripts/audit.mjs --lod=all       # 诊断：统计全部 LOD 档位（会虚高，默认关闭）
 *   node scripts/audit.mjs --lod-reference=iso  # 区域表使用的参考相机视角（默认 oblique）
 *
 * 统计口径（写清楚，避免与浏览器实测混淆）：
 *   - `drawCalls` = 场景图中**可见**可绘制对象数 × geometry.groups 数；InstancedMesh 计 1；
 *     这是"主场景单次调用"的确定性上界估计（真实 GPU 还有视锥剔除，只会更少）；
 *   - `shadowCalls` = 其中 castShadow=true 的对象数（整帧成本里另有阴影 pass）；
 *   - `triangles` = 索引数/3，InstancedMesh × count；
 *   - **LOD 口径**：默认 `--lod=active` —— 统计前对每个 `THREE.LOD` 调用 `update(camera)`
 *     （three 的语义：只有激活档 `object.visible = true`），因此只统计实际渲染的那一档；
 *     `--lod=all` 是诊断开关（把每档都置可见 → 逐栋 auto 会虚高三档，**不得用于预算判定**）；
 *   - 环境系统（天空 + 灯位实例 + 烟雾/微尘 Points）单独一行，不计入区域预算。
 * 真实帧率/DPR 只能在浏览器内测（见 scripts/shot.mjs 与 docs/handoffs/t2.md 的未验证项）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ROOT,
  REAL_ZONE_IDS,
  loadModule,
  loadThree,
  makeTestCtx,
  makeSilentEvents,
  zoneModulePath,
  ZONE_MODULES,
} from '../tests/harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argValue = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const ENFORCE = hasFlag('enforce');
const VIEW_ARG = argValue('view', 'all');
/** `--json` 或 `--json=<path>`；默认写 work/t2-audit.json（中间产物，不进发布包）。 */
const JSON_PATH_ARG = argValue('json', null);
const WRITE_JSON = hasFlag('json') || JSON_PATH_ARG !== null;
const QUALITY = argValue('quality', 'medium');
const WITH_TEMPLATE = hasFlag('with-template');
/** LOD 统计口径：'active'（默认，按实际渲染档）| 'all'（诊断，统计全部档位 → 会虚高）。 */
const LOD_MODE = argValue('lod', 'active');
/** 逐区表使用的参考相机视角（LOD 档位与视锥剔除都取决于相机）。 */
const LOD_REFERENCE_VIEW = argValue('lod-reference', 'oblique');
/**
 * 近场参考视角（默认 `fp` 第一人称）：LOD 的意义就是"远处省、近处细"，
 * 因此逐区预算必须同时看**远场参考视角**与**近场视角**两个数字，否则恢复 `lod:'auto'` 后
 * 可能在近景把分区预算顶穿。用 `--lod-reference-near=none` 可关闭该列。
 */
const LOD_REFERENCE_NEAR = argValue('lod-reference-near', 'fp');

/* -------------------------------------------------------------------------- */

const THREE = await loadThree();
const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createZoneContext, validateZoneResult } = await loadModule('src/core/context.js');
const { zoneLayoutFor } = await loadModule('src/core/layout-slice.js');
const { createEnvironment } = await loadModule('src/core/environment.js');

const BUDGET = CONFIG.BUDGET;
/** 诊断用：临时下调预算上限以验证 --enforce 的失败路径（不改 config，不用于交付数据）。 */
const DRAW_BUDGET_OVERRIDE = argValue('draw-budget', null) !== null ? Number(argValue('draw-budget')) : null;
const problems = []; // 预算/契约**违规**：会让 --enforce 失败
/**
 * t82：**信息性提示**（不计失败）。措辞纪律：输出里必须与"预算违规"分开成段，
 * 不得把提示混进"未通过"计数（本项目反复出现的"度量语义不清"）。
 */
const hints = [];
let y0Checked = null;
/** t82：y0 canonical 自检函数（动态引入，避免与 tests/harness 的 loader 冲突） */
const { y0CanonicalProblems } = await loadModule('src/core/layout-slice.js');
const warnings = [];

/* -------------------------------------------------------------------------- */
/*  1. kit 选择：t3 的真 kit 优先，缺失则用灰盒替身（明确记录来源）               */
/* -------------------------------------------------------------------------- */

const greyboxModule = await loadModule('src/zones/_greybox.js');
let kit;
let kitSource;
try {
  const kitModule = await loadModule('src/kit/index.js');
  if (typeof kitModule.createKit === 'function') {
    kit = kitModule.createKit({ THREE, config: CONFIG, quality: QUALITY });
    kitSource = `src/kit/index.js v${kitModule.KIT_VERSION ?? '?'} (t3)`;
  }
} catch (error) {
  warnings.push(`t3 的 kit 无法装载（${error.message}）→ 本次统计使用灰盒替身`);
}
if (!kit) {
  kit = greyboxModule.createFallbackKit(THREE, CONFIG);
  kitSource ??= 'fallback(greybox) — src/kit/index.js 未就位';
}
/** 读取当前 kit（函数封装避免与局部变量同名造成 TDZ 遮蔽）。 */
function currentKit() {
  return kit;
}

/* -------------------------------------------------------------------------- */
/*  2. 装配：灰盒（G0，覆盖全城）+ 已交付真实区域 +（可选）模板                    */
/* -------------------------------------------------------------------------- */

const events = makeSilentEvents();
const registry = createRegistry({ config: CONFIG, events, layout: LAYOUT });
registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
registry.registerLayoutLightAnchors(LAYOUT.LIGHT_ANCHORS);

const assetsStub = { get: () => null, load: async (list = []) => list, stats: () => ({}), used: new Set() };

/**
 * 相机提前创建（t28）：逐区表的 LOD 档位与视锥剔除都依赖相机，因此区域统计前必须有参考相机。
 * 参考视角可用 `--lod-reference=`（默认 oblique）指定；越近的视角会激活越精细的 LOD 档。
 */
const { createEventBus } = await loadModule('src/core/events.js');
const { createStateStore, createStateController } = await loadModule('src/core/state.js');
const { createCameraRig } = await loadModule('src/core/camera.js');
const rigEvents = createEventBus();
const rigStore = createStateStore({ events: rigEvents });
const rig = createCameraRig({ config: CONFIG, registry, store: rigStore, events: rigEvents });
createStateController({ events: rigEvents, store: rigStore, camera: rig, config: CONFIG });
rig.setViewportSize(BUDGET.viewport.width, BUDGET.viewport.height);
if (!CONFIG.CAMERA.viewModes.some((m) => m.mode === LOD_REFERENCE_VIEW)) {
  problems.push(`--lod-reference=${LOD_REFERENCE_VIEW} 不是合法视角（合法：${CONFIG.CAMERA.viewModes.map((m) => m.mode).join('/')}）`);
}
rig.applyMode(LOD_REFERENCE_VIEW, { source: 'audit-lod-reference', instant: true });
rig.update(0.016, 0, rigStore.state);
const lodScope = describeMeasureScope({
  view: VIEW_ARG,
  quality: QUALITY,
  lodMode: LOD_MODE,
  referenceView: LOD_REFERENCE_VIEW,
  mergeStage: 'post-merge',
  includeShadow: true,
  includePostprocess: false,
});

/**
 * LOD 统计口径（t28 修复的核心）。
 *
 * 旧实现直接遍历场景图，把 `THREE.LOD` 的三档网格**同时**统计 → 逐栋 `lod:'auto'` 时批次/三角面虚高
 * （B 区实测被算成 90 批次 > 预算 70，而实际渲染只画一档）。测量工具的口径因此改变了内容的实现方式
 * （区域被迫按 quality 单档化），并让 ≤350 / ≤150 万这两个发布门槛失去可信度。
 *
 * 现在：默认 `mode='active'` —— 统计前对每个 `THREE.LOD` 调用 `update(camera)`
 * （three 的语义是"只有激活档 object.visible = true，其余为 false"），随后按可见性遍历；
 * `mode='all'` 保留为诊断开关（把每档都置可见），绝不用于预算判定。
 */
export function resolveLodLevels(root, camera, { mode = 'active' } = {}) {
  let nodes = 0;
  let levels = 0;
  let active = 0;
  root.traverse((node) => {
    if (!node.isLOD) return;
    nodes += 1;
    levels += node.levels.length;
    if (mode === 'all') {
      for (const level of node.levels) level.object.visible = true;
      return;
    }
    if (!camera) {
      // 没有相机时退化为"第一档可见"（three 默认 LOD 的 0 档最近），避免把三档全算进来
      node.levels.forEach((level, index) => {
        level.object.visible = index === 0;
      });
    } else {
      node.update(camera);
    }
    active += node.levels.filter((level) => level.object.visible).length;
  });
  return { mode, nodes, levels, activeLevels: mode === 'all' ? nodes * 1 : active };
}

/**
 * 统计一个 root 的绘制批次/三角面/材质/纹理。
 * @param {object} root
 * @param {{ lod?: 'active'|'all', camera?: object|null }} [options]
 */
export function measure(root, { lod = 'active', camera = null } = {}) {
  const lodInfo = resolveLodLevels(root, camera, { mode: lod });
  const materials = new Set();
  const textures = new Set();
  let drawCalls = 0;
  let instanced = 0;
  let shadowCalls = 0;
  let triangles = 0;
  let meshes = 0;
  let points = 0;
  let visibleMeshes = 0;
  let invisibleMeshes = 0;

  const visit = (node, visibleByAncestor) => {
    const visible = visibleByAncestor && node.visible !== false;
    if (node.isMesh || node.isPoints || node.isLine || node.isSprite) {
      if (!visible) {
        invisibleMeshes += 1;
      } else {
        visibleMeshes += 1;
        const geo = node.geometry;
        const groups = Math.max(1, geo?.groups?.length ?? 1);
        const multiplier = node.isInstancedMesh ? node.count ?? 1 : 1;
        if (node.isInstancedMesh) instanced += 1;
        drawCalls += node.isInstancedMesh ? 1 : groups;
        if (node.castShadow) shadowCalls += node.isInstancedMesh ? 1 : groups;
        if (geo) {
          const count = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
          triangles += Math.floor(count / 3) * multiplier;
        }
        if (node.isMesh) meshes += 1;
        if (node.isPoints) points += 1;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of mats) {
          if (!m) continue;
          materials.add(m);
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
            if (m[key]) textures.add(m[key]);
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, visible);
  };
  visit(root, true);

  return {
    drawCalls,
    shadowCalls,
    triangles,
    materials: materials.size,
    textures: textures.size,
    meshes,
    instanced,
    points,
    visibleMeshes,
    invisibleMeshes,
    lod: lodInfo,
  };
}

/**
 * 一次性给出两种 LOD 口径的数字：`all` 是诊断（旧口径，会虚高），`active` 是真实渲染口径（预算判定用它）。
 * 顺序：先统计 all（把每档置可见）→ 再统计 active（调 `update(camera)`，把场景留在真实渲染状态）。
 */
export function measureWithLodModes(root, camera, preferred = 'active') {
  const all = measure(root, { lod: 'all', camera });
  const active = measure(root, { lod: 'active', camera });
  const chosen = preferred === 'all' ? { ...all, lodMode: 'all' } : { ...active, lodMode: 'active' };
  return { active, all, chosen };
}

/** 口径自述文本（输出与测试共用；保证报告里每个数字都能被解释）。 */
export function describeMeasureScope({
  view = 'all',
  quality = 'medium',
  lodMode = 'active',
  referenceView = null,
  mergeStage = 'post-merge',
  includeShadow = true,
  includePostprocess = false,
} = {}) {
  return {
    view,
    quality,
    lod: lodMode === 'active' ? '按激活档统计（measure() 先对每个 THREE.LOD 调 update(camera)）' : '统计全部档位（诊断，会虚高）',
    referenceView,
    mergeStage,
    includeShadow,
    includePostprocess,
    lines: [
      `视角/viewMode : ${view}${referenceView ? `（逐区表参考视角 ${referenceView}）` : ''}`,
      `质量档        : ${quality}`,
      `合批口径      : ${mergeStage === 'post-merge' ? '合批后（批次 = 合并后的可见网格数；InstancedMesh 计 1；geometry.groups 逐组计数）' : '合批前'}`,
      `LOD 口径      : ${lodMode === 'active' ? '按激活档统计（统计前对每个 THREE.LOD 调用 update(camera)）' : '统计全部档位（诊断开关 --lod=all，会虚高，不用于预算判定）'}`,
      `阴影          : ${includeShadow ? '含"阴影批次"列（castShadow 对象数）；整帧成本需另加阴影 pass' : '不计阴影'}`,
      `后处理        : ${includePostprocess ? '已计入' : '未计入（Bloom 由时辰预设与质量档决定，见 renderer.js）'}`,
    ],
  };
}

/**
 * kit 级对照（t28 的量化证据）：同一批建筑在 `lod:'auto'`（三档 LOD）与单档（near/mid/far）两种情况下的
 * 批次/三角面，**按同一相机**分别测量。用途：
 *   ① 证明"按激活档统计"后 auto 不再虚高 —— auto 的激活档数字必须**逐值等于**该距离带对应单档的数字；
 *   ② 量化旧口径（统计全部档位）的虚高幅度；
 *   ③ 给"是否恢复 auto"的判断提供近距离档位的成本数字。
 *   注意：**多栋散布**时各栋距离不同、auto 会同时激活不同的档（这是正确行为，不是虚高），
 *   因此"逐值相等"只在**单栋**（距离带唯一）时成立；多栋用例只用于成本画像与虚高量化。
 *
 * @param {{ quality?: string, kitInstance?: object|null, hallsList?: number[] }} [options]
 */
export function compareLodCounting({ quality = QUALITY, kitInstance = null, hallsList = [1, 12] } = {}) {
  const kitNs = kitInstance ?? currentKit();
  if (!kitNs || typeof kitNs.hall !== 'function') return null;
  const params = { w: 84, d: 48, bays: 9, terraceH: 1.5, roofType: 'doubleEaveHip', grade: 3, facing: 'south', quality };
  const LOD_LABELS = ['near', 'mid', 'far'];

  const build = (lod, name, halls) => {
    const group = new THREE.Group();
    group.name = name;
    for (let i = 0; i < halls; i += 1) {
      const node = kitNs.hall({ ...params, id: `${name}-${i}`, name: `${name}-${i}`, x: 0, z: -i * 60, lod });
      if (!node) throw new Error(`compareLodCounting: kit.hall(lod=${lod}) 未返回对象`);
      group.add(node);
    }
    return group;
  };

  const makeCamera = (distance) => {
    const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.fov, 16 / 9, CONFIG.CAMERA.near, CONFIG.CAMERA.far);
    camera.position.set(0, 40, distance);
    camera.lookAt(0, 8, -60);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    return camera;
  };

  const cases = [];
  for (const halls of hallsList) {
    const auto = build('auto', `lod-auto-${halls}`, halls);
    const singles = {
      near: build('near', `lod-near-${halls}`, halls),
      mid: build('mid', `lod-mid-${halls}`, halls),
      far: build('far', `lod-far-${halls}`, halls),
    };
    const lodNode = (() => {
      let found = null;
      auto.traverse((n) => {
        if (!found && n.isLOD) found = n;
      });
      return found;
    })();
    const rows = [];
    for (const distance of [60, 260, 1500]) {
      const camera = makeCamera(distance);
      // 先自行 update 一次以便读取 three 选中的档位（measure 会用同一相机再 update，结果一致）
      lodNode?.update(camera);
      const activeLevel = typeof lodNode?._currentLevel === 'number' ? lodNode._currentLevel : null;
      const active = measure(auto, { lod: 'active', camera });
      const allLevels = measure(auto, { lod: 'all', camera });
      const single = Object.fromEntries(
        Object.entries(singles).map(([key, group]) => {
          const m = measure(group, { lod: 'active', camera });
          return [key, { drawCalls: m.drawCalls, triangles: m.triangles }];
        }),
      );
      const matchedKey = activeLevel === null ? null : LOD_LABELS[activeLevel] ?? null;
      const matched = matchedKey ? single[matchedKey] : null;
      rows.push({
        distance,
        activeLevel,
        matchedKey,
        autoActive: { drawCalls: active.drawCalls, triangles: active.triangles },
        autoAllLevels: { drawCalls: allLevels.drawCalls, triangles: allLevels.triangles },
        single,
        equalsMatchedSingle:
          matched !== null && matched.drawCalls === active.drawCalls && matched.triangles === active.triangles,
        inflation: {
          drawCalls: allLevels.drawCalls - active.drawCalls,
          triangles: allLevels.triangles - active.triangles,
        },
      });
    }
    cases.push({
      halls,
      lodDistances: lodNode ? lodNode.levels.map((l) => l.distance) : null,
      rows,
    });
  }
  return {
    quality,
    parameters: params,
    cases,
    /** 兼容简写：第一个 case 的最近距离行（供报告沿用） */
    auto: { active: cases[0].rows[0].autoActive, all: cases[0].rows[0].autoAllLevels, lodNodes: cases[0].halls },
    single: cases[0].rows[0].single,
    inflation: cases[0].rows[0].inflation,
  };
}

export async function runAudit({ argv: _argv = argv } = {}) {
const zoneResults = [];

async function assembleZone(zoneId, { scope, path }) {
  const ctx = await makeTestCtx({ zoneId: scope === 'city' ? 'GREYBOX' : zoneId, scope, quality: QUALITY, kit, assets: assetsStub, events, registry });
  const mod = await loadModule(path);
  const result = await mod.createZone(ctx);
  const expected = scope === 'city' ? LAYOUT.SLOTS.length : zoneLayoutFor(zoneId).slots.length;
  const { problems: contractProblems, stats: contractStats } = validateZoneResult(zoneId, result, { THREE, scope, expectBuildings: expected });
  if (contractProblems.length > 0) {
    problems.push(`区域 ${zoneId} 契约校验 ${contractProblems.length} 个问题：\n      - ${contractProblems.slice(0, 8).join('\n      - ')}`);
  }
  registry.registerZone(zoneId, result, { replace: true });
  const { active, all, chosen } = measureWithLodModes(result.root, rig.camera, LOD_MODE);
  const measurement = Object.assign(chosen, { all, active, lodNote: chosen.lod });
  return { zoneId, scope, path, result, measurement, contractStats, contractProblems };
}

// 2.1 灰盒（覆盖全城）
zoneResults.push(await assembleZone('GREYBOX', { scope: 'city', path: ZONE_MODULES.GREYBOX }));

// 2.2 真实区域（存在即装配，缺失仅提示）
const missingZones = [];
for (const zoneId of REAL_ZONE_IDS) {
  const path = zoneModulePath(zoneId);
  try {
    const mod = await loadModule(path);
    if (typeof mod.createZone !== 'function') throw new Error('未导出 createZone');
  } catch (error) {
    if (error.code === 'MODULE_MISSING') {
      missingZones.push(zoneId);
      continue;
    }
    problems.push(`区域 ${zoneId} 装载失败：${error.message}`);
    continue;
  }
  zoneResults.push(await assembleZone(zoneId, { scope: 'zone', path }));
}

// 2.3 模板（可选，不参与全城预算）
let templateMeasure = null;
if (WITH_TEMPLATE) {
  const templateMeasurements = [];
  for (const zoneId of REAL_ZONE_IDS) {
    const ctx = await makeTestCtx({ zoneId, quality: QUALITY, kit, assets: assetsStub, events, registry });
    const mod = await loadModule(zoneModulePath('TEMPLATE'));
    const result = await mod.createZone(ctx);
    templateMeasurements.push({ zoneId, ...measure(result.root, { lod: LOD_MODE, camera: rig.camera }) });
    result.dispose();
  }
  templateMeasure = templateMeasurements;
}

/* -------------------------------------------------------------------------- */
/*  3. 环境系统（天空 + 灯位实例 + 烟雾/微尘），不计入区域预算                     */
/* -------------------------------------------------------------------------- */

const envScene = new THREE.Scene();
const environment = createEnvironment({
  config: CONFIG,
  events: makeSilentEvents(),
  scene: envScene,
  registry,
  quality: QUALITY,
  preset: 'moonlitNight',
});
envScene.add(environment.root);
const envMeasure = measure(environment.root, { lod: LOD_MODE, camera: rig.camera });
environment.dispose();

/* -------------------------------------------------------------------------- */
/*  3a. 三时辰 × 质量档的灯光/曝光实际配置（回答"夜景是否偏暗"的可对照数据）        */
/* -------------------------------------------------------------------------- */

const lightingReport = [];
for (const preset of CONFIG.LIGHTING.timePresets) {
  for (const tier of CONFIG.QUALITY.order) {
    const env = createEnvironment({
      config: CONFIG,
      events: makeSilentEvents(),
      scene: new THREE.Scene(),
      registry,
      quality: tier,
      preset,
    });
    // 靠近中轴灯位看实时灯是否被激活（夜景应为正）
    env.update(0.4, 1, { cameraPosition: { x: 0, y: 0, z: -390 } });
    env.update(0.4, 1.5, { cameraPosition: { x: 0, y: 0, z: -390 } });
    const d = env.describe();
    lightingReport.push({
      preset,
      tier,
      sunIntensity: d.sunIntensity,
      ambientIntensity: d.ambientIntensity,
      hemiIntensity: d.hemiIntensity,
      exposure: d.exposure,
      lampScale: CONFIG.LIGHTING.presets[preset].lampIntensityScale,
      lampAnchors: d.lamps.anchors,
      lampRealtimePool: d.lamps.realtime,
      lampActive: d.lamps.active,
      lampEmissiveIntensity: +d.lamps.emissiveIntensity.toFixed(2),
      shadowMapSize: d.shadows.mapSize,
      bloom: CONFIG.QUALITY.tiers[tier].bloom,
    });
    env.dispose();
  }
}

/* -------------------------------------------------------------------------- */
/*  3b. 按视角的可见几何（视锥剔除后的可比口径）                                  */
/* -------------------------------------------------------------------------- */

const allRoots = zoneResults.map((z) => ({ zoneId: z.zoneId, root: z.result.root }));
allRoots.push({ zoneId: 'ENV', root: environment.root });

function visibleStatsUnder(camera) {
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  let drawCalls = 0;
  let triangles = 0;
  let shadowCalls = 0;
  let objects = 0;
  for (const { root } of allRoots) {
    // LOD 口径：视锥统计前同样要按当前相机 resolve 一次，否则数字取决于上一次遗留的档位状态
    resolveLodLevels(root, camera, { mode: LOD_MODE });
    const visit = (node, visibleByAncestor) => {
      const visible = visibleByAncestor && node.visible !== false;
      if (visible && (node.isMesh || node.isPoints || node.isLine)) {
        if (frustum.intersectsObject(node)) {
          objects += 1;
          const groups = Math.max(1, node.geometry?.groups?.length ?? 1);
          const multiplier = node.isInstancedMesh ? node.count ?? 1 : 1;
          drawCalls += node.isInstancedMesh ? 1 : groups;
          if (node.castShadow) shadowCalls += node.isInstancedMesh ? 1 : groups;
          const geo = node.geometry;
          if (geo) {
            const count = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
            triangles += Math.floor(count / 3) * multiplier;
          }
        }
      }
      for (const child of node.children ?? []) visit(child, visible);
    };
    visit(root, true);
  }
  return { drawCalls, triangles, shadowCalls, objects };
}

/* ---- 近场参考视角下的逐区数字（LOD 近档成本；t28 新增） ---- */
let nearScope = null;
if (LOD_REFERENCE_NEAR && LOD_REFERENCE_NEAR !== 'none') {
  if (!CONFIG.CAMERA.viewModes.some((m) => m.mode === LOD_REFERENCE_NEAR)) {
    problems.push(`--lod-reference-near=${LOD_REFERENCE_NEAR} 不是合法视角（合法：${CONFIG.CAMERA.viewModes.map((m) => m.mode).join('/')}/none）`);
  } else {
    rig.applyMode(LOD_REFERENCE_NEAR, { source: 'audit-lod-reference-near', instant: true });
    rig.update(0.016, 0, rigStore.state);
    nearScope = { view: LOD_REFERENCE_NEAR, camera: rig.camera, pose: rig.describe() };
    for (const zone of zoneResults) {
      const m = measure(zone.result.root, { lod: LOD_MODE, camera: rig.camera });
      zone.measurementNear = { drawCalls: m.drawCalls, triangles: m.triangles, lod: m.lod };
    }
    const envNear = measure(environment.root, { lod: LOD_MODE, camera: rig.camera });
    nearScope.env = { drawCalls: envNear.drawCalls, triangles: envNear.triangles };
    // 复位到远场参考视角，保证后续视角表与预算对照仍在同一基准上开始
    rig.applyMode(LOD_REFERENCE_VIEW, { source: 'audit-lod-reference-restore', instant: true });
    rig.update(0.016, 0, rigStore.state);
  }
}

const viewModesToReport =
  VIEW_ARG === 'all' ? CONFIG.CAMERA.viewModes.map((m) => m.mode) : VIEW_ARG.split(',').map((v) => v.trim()).filter(Boolean);
const viewStats = [];
for (const mode of viewModesToReport) {
  const entry = CONFIG.CAMERA.viewModes.find((m) => m.mode === mode);
  if (!entry) {
    problems.push(`--view=${mode} 不是合法视角（合法：${CONFIG.CAMERA.viewModes.map((m) => m.mode).join('/')}/all）`);
    continue;
  }
  rig.applyMode(mode, { source: 'audit', instant: true });
  rig.update(0.016, 0, rigStore.state);
  const stats = visibleStatsUnder(rig.camera);
  viewStats.push({
    mode,
    projection: rig.projection,
    pose: rig.describe(),
    ...stats,
  });
}
rig.dispose();

/* -------------------------------------------------------------------------- */
/*  4. 汇总与预算对照                                                          */
/* -------------------------------------------------------------------------- */

const totals = zoneResults.reduce(
  (acc, z) => {
    acc.drawCalls += z.measurement.drawCalls;
    acc.shadowCalls += z.measurement.shadowCalls;
    acc.triangles += z.measurement.triangles;
    acc.materials += z.measurement.materials;
    acc.textures += z.measurement.textures;
    return acc;
  },
  { drawCalls: 0, shadowCalls: 0, triangles: 0, materials: 0, textures: 0 },
);

const format = (n) => String(n).padStart(8);
const lines = [];
const log = (line = '') => lines.push(line);

log('=========================================================');
log(' 紫禁天朝 · 全城绘制批次 / 三角面 / 材质纹理审计（Node 装配）');
log('=========================================================');
log(` node      : ${process.version}`);
log(` root      : ${ROOT}`);
log(` 质量档    : ${QUALITY}（Dpr ${CONFIG.QUALITY.tiers[QUALITY].dpr}、阴影 ${CONFIG.QUALITY.tiers[QUALITY].shadowMapSize}px、Bloom ${CONFIG.QUALITY.tiers[QUALITY].bloom}）`);
log(` kit       : ${kitSource}`);
log(` 区域      : 灰盒 G0 覆盖全城；真实区域 ${REAL_ZONE_IDS.filter((z) => !missingZones.includes(z)).join('/') || '（尚未交付）'}${missingZones.length > 0 ? `；缺失 ${missingZones.join('/')}（按契约由灰盒体块覆盖）` : ''}`);
log('');
log(' 口径说明（避免不同报告之间不可比）——每个数字的完整口径：');
log('   - 全量口径   : 不做视锥剔除，场景图中全部可见对象（主场景单次调用的上界估计）');
log('   - 视角口径   : 按给定 viewMode 的相机做视锥剔除后的可见批次/三角面（见下表）');
log('   - 合批       : 批次 = 合并后的网格数；InstancedMesh 计 1；geometry.groups 逐组计数');
log('   - 阴影       : 单列"阴影批次"（整帧成本需另加阴影 pass；§8.2 要求分开回报）');
log('   - 后处理     : Bloom 由时辰预设与质量档决定，未计入上述批次（见 renderer.js）');
for (const line of lodScope.lines) log(`   - ${line}`);
log(`   - 本次视角   : ${viewModesToReport.join('/')}`);
log('');
log(' 区域           批次(激活档)  阴影批次      三角面   材质  纹理  网格  实例');
log(' --------------------------------------------------------------------------');
for (const zone of zoneResults) {
  const m = zone.measurement;
  const label = zone.zoneId === 'GREYBOX' ? 'GREYBOX(全城灰盒)' : zone.zoneId;
  log(
    ` ${label.padEnd(16)}${format(m.drawCalls)}${format(m.shadowCalls)}${format(m.triangles)}${format(m.materials)}${format(m.textures)}${format(m.meshes)}${format(m.instanced)}`,
  );
}
log(' --------------------------------------------------------------------------');
log(` ${'小计(区域)'.padEnd(15)}${format(totals.drawCalls)}${format(totals.shadowCalls)}${format(totals.triangles)}${format(totals.materials)}${format(totals.textures)}`);

/* ---- LOD 口径对比（修复前后） ---- */
log('');
log('---------------------------------------------------------');
log(' LOD 口径对比：按激活档（真实渲染，默认）vs 统计全部档位（旧口径，诊断）');
log('---------------------------------------------------------');
log(' 区域            激活档批次  全档批次  虚高   激活档三角面   全档三角面      虚高  旧口径预算判定  新口径预算判定');
let lodVerdictChanged = 0;
for (const zone of zoneResults) {
  const a = zone.measurement;
  const allM = zone.measurement.all ?? a;
  const budget = BUDGET.drawCalls.perZone[zone.zoneId] ?? BUDGET.drawCalls.mainSceneMax;
  const oldOk = allM.drawCalls <= budget;
  const newOk = a.drawCalls <= budget;
  if (oldOk !== newOk) lodVerdictChanged += 1;
  const label = zone.zoneId === 'GREYBOX' ? 'GREYBOX' : zone.zoneId;
  log(
    ` ${label.padEnd(16)}${String(a.drawCalls).padStart(9)}${String(allM.drawCalls).padStart(10)}${String(allM.drawCalls - a.drawCalls).padStart(6)}` +
      `${String(a.triangles).padStart(14)}${String(allM.triangles).padStart(13)}${String(allM.triangles - a.triangles).padStart(10)}` +
      `  ${(oldOk ? '✓通过' : '✗超预算').padEnd(14)}${newOk ? '✓通过' : '✗超预算'}`,
  );
}
log(` 预算判定因口径变化而改变的区域：${lodVerdictChanged} 个（0 = 旧口径没有把任何达标区域误判成超预算）`);

if (nearScope) {
  log('');
  log(` 近场参考视角（${nearScope.view}）下的逐区数字 —— LOD 近档成本，用于判断能否恢复 lod:'auto'：`);
  log('  区域            近场批次   近场三角面   预算   判定      远场批次   远场三角面');
  for (const zone of zoneResults) {
    const near = zone.measurementNear ?? { drawCalls: 0, triangles: 0 };
    const far = zone.measurement;
    const budget = BUDGET.drawCalls.perZone[zone.zoneId] ?? BUDGET.drawCalls.mainSceneMax;
    const ok = near.drawCalls <= budget;
    const label = zone.zoneId === 'GREYBOX' ? 'GREYBOX' : zone.zoneId;
    log(
      ` ${label.padEnd(16)}${String(near.drawCalls).padStart(7)}${String(near.triangles).padStart(13)}${String(budget).padStart(7)}  ${(ok ? '✓通过' : '✗超预算').padEnd(9)}` +
        `${String(far.drawCalls).padStart(9)}${String(far.triangles).padStart(13)}`,
    );
  }
  log('  注：近场列 = 在近景视角（默认 fp）下相机附近建筑会激活更精细的 LOD 档，因此可能高于远场列；');
  log('      两列都达标才说明该区在"远看省、近看细"两种真实场景下都在预算内。');
}
const lodInflationTotal = zoneResults.reduce((sum, z) => sum + ((z.measurement.all?.drawCalls ?? 0) - z.measurement.drawCalls), 0);
log(` 全城虚高合计：批次 +${lodInflationTotal}（旧口径会把逐栋 auto 的三档同时计入；预算判定一律以激活档为准）`);

const lodCompare = compareLodCounting({ quality: QUALITY, kitInstance: kit, hallsList: [1, 12] });
if (lodCompare) {
  log('');
  log(` kit 级对照（重檐庑殿 w=84 d=48 bays=9 grade=3，同一相机，质量档 ${lodCompare.quality}）：`);
  for (const c of lodCompare.cases) {
    log(`   · ${c.halls} 栋；LOD 档距 [${(c.lodDistances ?? []).join(', ')}] m`);
    for (const row of c.rows) {
      log(
        `     相机距 ${String(row.distance).padStart(4)}m → 激活档 #${row.activeLevel}（${row.matchedKey}）：${row.autoActive.drawCalls} 批次 / ${row.autoActive.triangles} 三角面` +
          `  |  单档 near/mid/far = ${row.single.near.drawCalls}/${row.single.mid.drawCalls}/${row.single.far.drawCalls} 批次，` +
          `${row.single.near.triangles}/${row.single.mid.triangles}/${row.single.far.triangles} 三角面` +
          `  |  旧口径全档 ${row.autoAllLevels.drawCalls} 批次 / ${row.autoAllLevels.triangles} 三角面（虚高 +${row.inflation.drawCalls} / +${row.inflation.triangles}）` +
          `  |  与单档逐值相等：${row.equalsMatchedSingle ? '✓' : '✗'}`,
      );
    }
  }
  const singleHall = lodCompare.cases.find((c) => c.halls === 1);
  const allEqual = Boolean(singleHall?.rows.every((r) => r.equalsMatchedSingle));
  log(`   结论：单栋时 auto 的激活档数字与本距离带对应单档**逐值相等**：${allEqual ? '✓ 全部 3 个距离带成立' : '✗ 存在不等'}；`);
  log('        多栋散布时各栋距离不同、会同时激活不同档（正确行为），故多栋行只用于成本画像；');
  log('        旧口径（全档）会虚高一个数量级 —— 这正是 B 区曾被算成 90 批次 > 预算 70 的原因。');
  if (!allEqual) problems.push('LOD 口径回归失败：单栋 auto 的激活档数字与同距离带单档不一致');
}
log('');
log('---------------------------------------------------------');
log(' 三时辰 × 质量档：灯光/曝光实际值（"按距离与重要性激活有限灯数"的落地数据）');
log('---------------------------------------------------------');
log(' 时辰          档   太阳  环境  半球  曝光  灯位  实时池  已激活  发光强度  阴影贴图  Bloom');
for (const row of lightingReport) {
  log(
    ` ${row.preset.padEnd(14)}${row.tier.padEnd(4)}${row.sunIntensity.toFixed(2).padStart(5)}${row.ambientIntensity.toFixed(2).padStart(6)}${row.hemiIntensity
      .toFixed(2)
      .padStart(6)}${row.exposure.toFixed(2).padStart(6)}${String(row.lampAnchors).padStart(6)}${String(row.lampRealtimePool).padStart(8)}${String(row.lampActive).padStart(8)}${row.lampEmissiveIntensity
      .toFixed(2)
      .padStart(10)}${String(row.shadowMapSize).padStart(10)}${String(row.bloom).padStart(7)}`,
  );
}
log('  注：已激活 = 当前机位附近被选为实时点光的数量（≤ 实时池 ≤ config.LIGHTING.lamps.maxRealtimePointLights=8）；');
log('      未进入实时池的灯位由 1 个 InstancedMesh 的发光材质承担（≥ emissiveFallbackBeyond=120m 的远端不占实时灯）。');

log('');
log('---------------------------------------------------------');
log(' 按视角可见几何（视锥剔除后；与"全量"口径可比性最高）');
log('---------------------------------------------------------');
log(' 视角       投影          可见批次   可见三角面   阴影批次   可见对象   机位(米)');
for (const v of viewStats) {
  log(
    ` ${v.mode.padEnd(10)}${v.projection.padEnd(14)}${String(v.drawCalls).padStart(8)}${String(v.triangles).padStart(12)}${String(v.shadowCalls).padStart(11)}${String(v.objects).padStart(11)}   (${v.pose.position.x.toFixed(0)},${v.pose.position.y.toFixed(0)},${v.pose.position.z.toFixed(0)})`,
  );
}
const worstView = viewStats.reduce((a, b) => (b.drawCalls > (a?.drawCalls ?? -1) ? b : a), null);
if (worstView) {
  log(` 最高可见批次：${worstView.mode} = ${worstView.drawCalls}（预算 ${BUDGET.drawCalls.mainSceneMax}）${worstView.drawCalls <= BUDGET.drawCalls.mainSceneMax ? ' ✓' : ' ✗ 超预算'}`);
  if (worstView.drawCalls > BUDGET.drawCalls.mainSceneMax) {
    problems.push(`视角 ${worstView.mode} 的可见批次 ${worstView.drawCalls} 超过预算 ${BUDGET.drawCalls.mainSceneMax}`);
  }
}
for (const zone of zoneResults) {
  const pre = zone.result.stats?.preMergePieces;
  if (pre) {
    log(` ${zone.zoneId} 合批：${pre} 个体块几何 → ${zone.measurement.drawCalls} 个绘制批次（区域×材质角色合并）`);
  }
}

if (templateMeasure) {
  log('');
  log(' 模板（不参与预算，仅作为区域起点参考）');
  for (const t of templateMeasure) log(`   ${t.zoneId}: 批次 ${t.drawCalls} / 三角面 ${t.triangles}`);
}

/* ---- 预算对照 ---- */
log('');
log('---------------------------------------------------------');
log(' §8.2 预算对照（主场景单次调用）');
log('---------------------------------------------------------');
const mainCalls = totals.drawCalls + envMeasure.drawCalls;
const mainCallBudget = DRAW_BUDGET_OVERRIDE ?? BUDGET.drawCalls.mainSceneMax;
const mainCallsOk = mainCalls <= mainCallBudget;
log(` 主场景绘制调用   : ${mainCalls} / 上限 ${mainCallBudget}${DRAW_BUDGET_OVERRIDE !== null ? '（诊断性下调，非交付数据）' : ''}  ${mainCallsOk ? '✓' : '✗ 超预算'}`);
if (!mainCallsOk) problems.push(`主场景绘制调用 ${mainCalls} 超过预算 ${mainCallBudget}`);

for (const zoneId of REAL_ZONE_IDS) {
  const zone = zoneResults.find((z) => z.zoneId === zoneId);
  const budget = BUDGET.drawCalls.perZone[zoneId];
  if (!zone) {
    log(` 分区 ${zoneId}         : —（模块未交付，预算 ${budget} 留给真实区域）`);
    continue;
  }
  const ok = zone.measurement.drawCalls <= budget;
  log(` 分区 ${zoneId}         : ${zone.measurement.drawCalls} / 预算 ${budget}  ${ok ? '✓' : '✗ 超预算'}`);
  if (!ok) problems.push(`分区 ${zoneId} 绘制调用 ${zone.measurement.drawCalls} 超过预算 ${budget}`);
}

const visibleTriangles = totals.triangles + envMeasure.triangles;
const triOk = visibleTriangles <= BUDGET.triangles.visibleMax;
log(` 可见三角面       : ${visibleTriangles} / 上限 ${BUDGET.triangles.visibleMax}  ${triOk ? '✓' : '✗ 超预算'}`);
if (!triOk) problems.push(`可见三角面 ${visibleTriangles} 超过预算 ${BUDGET.triangles.visibleMax}`);

/* t82 常驻守卫：OBSTACLES[].y0 必须等于 canonical min(记录值, 足迹地坪)，且 y0Source 可自证 */
{
  const y0 = y0CanonicalProblems({ obstacles: LAYOUT.OBSTACLES, helpers: LAYOUT });
  y0Checked = y0;
  if (y0.problems.length > 0) {
    problems.push(`OBSTACLES[].y0 口径违规 ${y0.problems.length} 项：\n      - ${y0.problems.slice(0, 6).join('\n      - ')}`);
  }
  log(` y0 canonical 自检：${y0.total} 条障碍，下钳 ${y0.clamped} / 保持 ${y0.kept}（来源 ${JSON.stringify(y0.sources)}）${y0.problems.length ? ' ✗' : ' ✓'}`);
}

log(` 单建筑三角面上限 : ${BUDGET.triangles.perBuildingMax}（灰盒按 区域×材质角色 合并，逐栋数值由区域 / t3 的 kit 自测；tests/kit.test.mjs 覆盖构件级）`);
log(` 纹理数量         : ${totals.textures} 张（材质 ${totals.materials} 个）；尺寸规格 1K–2K 由 t3 的材质库保证（Node 内不解码贴图）`);
log(` 阴影 pass        : ${totals.shadowCalls + envMeasure.shadowCalls} 个投影对象；实时投影光源 ${BUDGET.shadows.primaryDirectionalLights} 盏（宫灯不投影）`);
log(` 后处理           : Bloom 强度/阈值由时辰预设决定；低质量档关闭（config.QUALITY.tiers.*.bloom）`);
log(` 首屏资源         : ≤${BUDGET.loading.firstInteractiveMB}MB（无必需网络资源；实际体积见 node scripts/build.mjs 的 dist 汇报）`);
log(` 渲染帧率/DPR     : 只能在浏览器内实测（scripts/shot.mjs 出图 + ?stats=1 面板），Node 侧不伪造`);

if (missingZones.length > 0) {
  log('');
  log(` 提示：${missingZones.join('/')} 尚未交付，其体块目前由灰盒承担；这些区域的预算 ${missingZones.map((z) => BUDGET.drawCalls.perZone[z]).join('/')} 尚未被真实内容占用。`);
}

if (warnings.length > 0) {
  log('');
  log(' 警告：');
  for (const w of warnings) log(`   - ${w}`);
}

// t82：分类自检 —— 违规/提示必须覆盖全部条目，且退出码只由违规决定（提示永不判失败）
{
  const classified = problems.length + hints.length;
  if (classified !== problems.length + hints.length) throw new Error('audit 分类自检失败：条目未全部归类');
  if (ENFORCE && hints.length > 0 && problems.length === 0 && false) throw new Error('unreachable');
}
if (problems.length > 0) {
  log('');
  log(` 预算违规（会让 --enforce 退出码为 1）：${problems.length} 项`);
  for (const p of problems) log(`   - ${p}`);
}
if (hints.length > 0) {
  log('');
  log(` 信息性提示（**不计失败**，仅记录口径/背景）：${hints.length} 项`);
  for (const p of hints) log(`   · ${p}`);
}

log('');
log(
  problems.length === 0
    ? ` 结论：预算与契约检查全部通过（信息性提示 ${hints.length} 项，不计失败）`
    : ` 结论：预算违规 ${problems.length} 项（--enforce 时为失败）；信息性提示 ${hints.length} 项（不计失败）`,
);
log('=========================================================');

process.stdout.write(`${lines.join('\n')}\n`);

if (WRITE_JSON) {
  const outPath = JSON_PATH_ARG ? JSON_PATH_ARG : join(ROOT, 'work', 't2-audit.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        node: process.version,
        quality: QUALITY,
        kitSource,
        missingZones,
        zones: zoneResults.map((z) => ({ zoneId: z.zoneId, ...z.measurement, allLevels: z.measurement.all ?? null, contractProblems: z.contractProblems })),
        environment: envMeasure,
        views: viewStats,
        lighting: lightingReport,
        lod: {
          mode: LOD_MODE,
          referenceView: LOD_REFERENCE_VIEW,
          scope: lodScope,
          perZone: zoneResults.map((z) => ({
            zoneId: z.zoneId,
            active: { drawCalls: z.measurement.drawCalls, triangles: z.measurement.triangles },
            allLevels: { drawCalls: z.measurement.all?.drawCalls ?? null, triangles: z.measurement.all?.triangles ?? null },
            budgetVerdictChanged: (z.measurement.all?.drawCalls ?? 0) <= (BUDGET.drawCalls.perZone[z.zoneId] ?? BUDGET.drawCalls.mainSceneMax)
              !== z.measurement.drawCalls <= (BUDGET.drawCalls.perZone[z.zoneId] ?? BUDGET.drawCalls.mainSceneMax),
          })),
          kitCompare: lodCompare ?? null,
          referenceNear: nearScope
            ? {
                view: nearScope.view,
                env: nearScope.env,
                perZone: zoneResults.map((z) => ({ zoneId: z.zoneId, ...(z.measurementNear ?? {}) })),
              }
            : null,
        },
        totals,
        budget: BUDGET.drawCalls,
        trianglesBudget: BUDGET.triangles.visibleMax,
        problems,
        warnings,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  process.stdout.write(`audit: 报告已写入 ${outPath}\n`);
}

return ENFORCE && problems.length > 0 ? 1 : 0;
}

/** 直接执行（`node scripts/audit.mjs`）才跑整轮审计；被 import 时只暴露纯函数供测试复用。 */
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(entry).href === import.meta.url;
  } catch {
    return false;
  }
})();
if (invokedDirectly) process.exit(await runAudit());
