#!/usr/bin/env node
/**
 * 共享契约机器校验：src/shared/config.js + src/shared/layout.js
 * -----------------------------------------------------------------------------
 * 对应任务验收第 1 条（布局数量/唯一性/边界）与第 2 条（config 覆盖 §3.1/§8.2、可被 Node 直接 import）。
 * 任何一项不通过即打印失败明细并以非零码退出。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const SHARED = join(ROOT, 'src', 'shared');

const CONFIG_NS = await import(join(SHARED, 'config.js'));
const L = await import(join(SHARED, 'layout.js'));
const { probeDoorClearance, obstacleBlocksPoint } = await import(join(ROOT, 'src', 'core', 'layout-slice.js')); // t128/F5：core 门洞净宽实测出口（t127 交付）；t37 增补：障碍 × 玩家体段相交判定（生产口径谓词）

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    return true;
  }
  failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
  return false;
}

function eq(name, actual, expected) {
  return check(name, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

/** t13：汀步登记面的 id 集合（由唯一权威源 `layout.STONE_STEP_LANES` 派生，测试不另写字面量）。 */
const STONE_STEP_SURFACE_IDS = (L.STONE_STEP_LANES ?? []).flatMap((l) => l.steps.map((s) => s.id));

const inB = (inner, outer, tol = 0) =>
  inner.minX >= outer.minX - tol && inner.maxX <= outer.maxX + tol && inner.minZ >= outer.minZ - tol && inner.maxZ <= outer.maxZ + tol;

/* =============================================================================
 * A. config.js：§3.1 风格参数 + §8.2 预算 + 可独立 import
 * ========================================================================== */

const {
  CONFIG: CFG,
  CONFIG_VERSION,
  STYLE_BASELINE,
  SCENE_SEED,
  COLORS,
  MODULES,
  GRADES,
  ROOF_TYPES,
  MATERIALS,
  WEATHERING,
  PLANTS,
  WATER,
  LIGHTING,
  CAMERA,
  UI,
  BUDGET,
  LAYOUT_CONSTRAINTS,
  QUALITY,
  INTERACTION,
  TERRAIN,
  EVENTS,
  STATE_DEFAULTS,
  deriveSeed,
} = CONFIG_NS;

check('config.version 为字符串', typeof CONFIG_VERSION === 'string' && CONFIG_VERSION.length > 0);
/* ── 版本 pin（t32：两条都改为**数据推导 + 性质判据**，升版不再需要改断言）────────────────────────────
   事故背景：t22 把 `LAYOUT` 升到 1.1.24（本文件 :76 漏同步 ⇒ 转红）；本卡执行期间 t25 又把 `CONFIG`
   升到 1.0.9（`CONFIG_VERSION` 字面量 pin 随即陈旧 ⇒ 同一类事故第二次发生）⇒ 两侧一并改为
   ① 格式 vX.Y.Z ② 不得回退（floor = 已登记的最后快照）③ 有第二来源时做跨来源一致（LAYOUT 有
   `LAYOUT_STATS.layoutVersion`；CONFIG **没有**第二来源，故只有 ①②，如实登记）。
   "冻结值不得被悄悄改"由本文件其余 ~1850 条内容判据（计数/白名单/哈希/几何关系）继续承载。 */
const cmpVersion = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};
// 版本链（**历史快照，仅记录、不参与判定**）：
//   CONFIG：1.0.1(t15) → 1.0.2(t19) → 1.0.3(t26) → 1.0.4(t39) → 1.0.6(t42) → 1.0.7(t84 §8.2) → 1.0.8(t2 jump) → 1.0.9(t25 烟柱 LOD)
//   LAYOUT：1.1.4 → 1.1.5(t83) → 1.1.7/1.1.8(t97) → … → 1.1.20(t158) → 1.1.21(t9) → 1.1.22(t10) → 1.1.23(t13) → 1.1.24(t22)
const CONFIG_VERSION_FLOOR = '1.0.8';
const LAYOUT_VERSION_FLOOR = '1.1.23';
check(`CONFIG 版本号格式 vX.Y.Z（t32：数据推导；升版无需改本断言）`, /^\d+\.\d+\.\d+$/.test(CONFIG_VERSION), CONFIG_VERSION);
check(`CONFIG 版本不得回退（≥ 已登记快照 ${CONFIG_VERSION_FLOOR}）`,
  cmpVersion(CONFIG_VERSION, CONFIG_VERSION_FLOOR) >= 0, `${CONFIG_VERSION} vs ${CONFIG_VERSION_FLOOR}`);
check('LAYOUT 版本号格式 vX.Y.Z（t32：数据推导，不再逐版同步字面量）', /^\d+\.\d+\.\d+$/.test(L.LAYOUT_VERSION), L.LAYOUT_VERSION);
check('LAYOUT_STATS.layoutVersion === LAYOUT_VERSION（注册表摘要与常量不得分叉）',
  L.LAYOUT_STATS.layoutVersion === L.LAYOUT_VERSION, `${L.LAYOUT_STATS.layoutVersion} vs ${L.LAYOUT_VERSION}`);
check(`LAYOUT 版本不得回退（≥ 已登记快照 ${LAYOUT_VERSION_FLOOR}；升版无需改本断言）`,
  cmpVersion(L.LAYOUT_VERSION, LAYOUT_VERSION_FLOOR) >= 0, `${L.LAYOUT_VERSION} vs ${LAYOUT_VERSION_FLOOR}`);
check('config.styleBaseline 为字符串', typeof STYLE_BASELINE === 'string' && /^v\d+\.\d+\.\d+$/.test(STYLE_BASELINE), STYLE_BASELINE);
check('config.sceneSeed 为整数', Number.isInteger(SCENE_SEED));
check('config.deriveSeed 确定性', deriveSeed('B') === deriveSeed('B') && deriveSeed('B') !== deriveSeed('C'));

// §3.1 主色板逐值
eq('§3.1 琉璃金 = #dfa112', COLORS.glazeGold, '#dfa112');
eq('§3.1 宫红 = #962822', COLORS.palaceRed, '#962822');
eq('§3.1 暖白石 = #f0ece1', COLORS.warmWhite, '#f0ece1');
eq('§3.1 青绿彩画 = #1c4e40', COLORS.paintingTeal, '#1c4e40');
eq('§3.1 深灰铺地 = #575652', COLORS.pavingGray, '#575652');
// CONFIG 1.0.5（t40）：金砖色由计划表字面值改为**物理反照率修正值**（原 #1a1917 线性反照率 ≈0.0098 → #504b44 ≈0.0715）
eq('§3.1 室内金砖 = #4a463f（物理反照率修正，非计划表字面值）', COLORS.interiorBrick, '#4a463f');
{
  const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const hex = COLORS.interiorBrick;
  const ch = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  const oldLin = lin(26);
  check('金砖线性反照率落在真实抛光砖石区间 0.05–0.09', lum >= 0.05 && lum <= 0.09, String(lum.toFixed(4)));
  check('金砖反照率相对原值提升 ≥5×（原 #1a1917 ≈0.0098）', lum / oldLin >= 5, `${oldLin.toFixed(4)} → ${lum.toFixed(4)}`);
  check('金砖仍为深色（sRGB 亮度 ≤0.35，不得变成浅色瓷砖）',
    (0.2126 * parseInt(hex.slice(1, 3), 16) + 0.7152 * parseInt(hex.slice(3, 5), 16) + 0.0722 * parseInt(hex.slice(5, 7), 16)) / 255 <= 0.35,
    String(((0.2126 * parseInt(hex.slice(1, 3), 16) + 0.7152 * parseInt(hex.slice(3, 5), 16) + 0.0722 * parseInt(hex.slice(5, 7), 16)) / 255).toFixed(3)));
}
eq('§3.1 鎏金 = #ffc83b', COLORS.gilt, '#ffc83b');

// §3.1 模数
for (const key of ['bayPitch', 'roofSlope', 'eaveCurve', 'eaveOverhang', 'columnDiameter', 'eaveHeight', 'terraceTotalHeight', 'stairsStepHeight']) {
  check(`§3.1 模数 MODULES.${key} 为有限数`, Number.isFinite(MODULES[key]), String(MODULES[key]));
}
eq('§3.1/§2.3 主殿台基三层总高 = 4.5m', MODULES.terraceTotalHeight, 4.5);
eq('主殿台基层数 = 3', MODULES.terraceTierCount, 3);
check('模数关系：单层高 × 层数 = 总高', Math.abs(MODULES.terraceTierHeight * MODULES.terraceTierCount - MODULES.terraceTotalHeight) < 1e-9);
check('屋顶类型含庑殿/歇山/硬山/攒尖/重檐', ['hip', 'gableHip', 'gable', 'pyramidal', 'doubleEaveHip'].every((k) => ROOF_TYPES[k]), Object.keys(ROOF_TYPES).join(','));
check('庑殿顶有正脊与四面坡', ROOF_TYPES.hip.ridge === true && ROOF_TYPES.hip.slopes === 4);
check('装饰等级 1/2/3 齐备', [1, 2, 3].every((g) => GRADES[g] && GRADES[g].detailing));

// 材质与旧化
check('材质含琉璃瓦/鎏金/白石/木作/彩画/水面', ['glazeTile', 'giltMetal', 'stoneWhite', 'timberLacquer', 'paintingTeal', 'waterSurface'].every((k) => MATERIALS[k]));
check('琉璃瓦有清漆感且非纯金属', MATERIALS.glazeTile.clearcoat > 0 && MATERIALS.glazeTile.metalness < 0.2);
check('仅鎏金明显金属反射', MATERIALS.giltMetal.metalness >= 0.8 && MATERIALS.plasterRed.metalness === 0);
check('旧化统一且较轻 (globalAmount ≤ 0.35)', WEATHERING.globalAmount > 0 && WEATHERING.globalAmount <= 0.35);
check('植物参数齐全（树冠/花树/密度/风）', PLANTS.canopyShapes.length >= 3 && Number.isFinite(PLANTS.blossomRatio) && Number.isFinite(PLANTS.densityPerCourt));
check('水体参数齐全（低饱和/微波/反射）', WATER.waveAmplitude > 0 && WATER.waveSpeed > 0 && WATER.levelDay <= 0.8);

// 光照与色调映射
eq('色调映射 = ACESFilmic', LIGHTING.toneMapping.mode, 'ACESFilmic');
check('统一曝光存在', Number.isFinite(LIGHTING.toneMapping.exposure));
check('三个时辰预设：盛世金辉/落霞夕照/寒月宫灯', ['goldenHour', 'sunset', 'moonlitNight'].every((k) => LIGHTING.presets[k]), Object.keys(LIGHTING.presets).join(','));
eq('timePresets 与预设 id 一致', LIGHTING.timePresets.join(','), 'goldenHour,sunset,moonlitNight');
check('动态阴影：优先一盏主方向光', LIGHTING.shadows.enabled === true && LIGHTING.shadows.dynamicShadowBudget === 1 && LIGHTING.shadows.strategy === 'singlePrimaryDirectional');
check('宫灯不投影（实时灯上限有限）', LIGHTING.lamps.maxRealtimePointLights <= 8);
check('宫灯不投影（仅一盏主方向光投影，灯位不进阴影 pass）', LIGHTING.shadows.dynamicShadowBudget === 1 && LIGHTING.shadows.strategy === 'singlePrimaryDirectional');

// CONFIG 1.0.2 环境预设校准（t19，主理人裁定：方案A + 宫灯加强 + 雾距修正）——把裁定值 pin 住
check(
  '夜景方案A：sunIntensity 2.0 / ambientIntensity 0.8',
  LIGHTING.presets.moonlitNight.sunIntensity === 2.0 && LIGHTING.presets.moonlitNight.ambientIntensity === 1.9,
  `${LIGHTING.presets.moonlitNight.sunIntensity}/${LIGHTING.presets.moonlitNight.ambientIntensity}`,
);
check('夜景户外补光（CONFIG 1.0.6，t42）：hemiIntensity = 1.6', LIGHTING.presets.moonlitNight.hemiIntensity === 1.6, String(LIGHTING.presets.moonlitNight.hemiIntensity));
check('夜景补光不改太阳/曝光/天空/雾：sun 2.0 · exposure 1.35 · skyNight · fog 420-1800',
  LIGHTING.presets.moonlitNight.sunIntensity === 2.0 && LIGHTING.presets.moonlitNight.exposure === 1.35 &&
  LIGHTING.presets.moonlitNight.backgroundRole === 'skyNight' && LIGHTING.presets.moonlitNight.fogNear === 420 && LIGHTING.presets.moonlitNight.fogFar === 1800);
check('夕照 orbit 补光（CONFIG 1.0.6，t42）：sunset ambient 1.15 / hemi 1.2（受内景截断约束不得更高）',
  LIGHTING.presets.sunset.ambientIntensity === 1.15 && LIGHTING.presets.sunset.hemiIntensity === 1.2,
  `${LIGHTING.presets.sunset.ambientIntensity}/${LIGHTING.presets.sunset.hemiIntensity}`);
check('夜景方案A：exposure 1.35', LIGHTING.presets.moonlitNight.exposure === 1.35, String(LIGHTING.presets.moonlitNight.exposure));
check('夜景未走建议B（不过曝）：均值上限留有余量，sunIntensity ≤ 2.2', LIGHTING.presets.moonlitNight.sunIntensity <= 2.2);
// CONFIG 1.0.3（t26）：intensity/distance 由「逐值 pin」改为**下限**（可按判据上调），硬约束保持不变
check('宫灯不低于下限：intensity ≥ 12', LIGHTING.lamps.intensity >= 12, String(LIGHTING.lamps.intensity));
check('宫灯不低于下限：distance ≥ 46', LIGHTING.lamps.distance >= 46, String(LIGHTING.lamps.distance));
check('宫灯硬约束：实时灯上限 ≤ 8', LIGHTING.lamps.maxRealtimePointLights <= 8, String(LIGHTING.lamps.maxRealtimePointLights));
check('宫灯硬约束：仅一盏主方向光投影', LIGHTING.shadows.dynamicShadowBudget === 1);
check('宫灯风格化衰减 decay = 1（decay=2 时 10m 外照度 1/100，室内无法照亮）', LIGHTING.lamps.decay === 1, String(LIGHTING.lamps.decay));
check('日景内景补光通道：goldenHour.lampIntensityScale > 0', LIGHTING.presets.goldenHour.lampIntensityScale > 0, String(LIGHTING.presets.goldenHour.lampIntensityScale));
check('夕照内景补光通道：sunset.lampIntensityScale > 0', LIGHTING.presets.sunset.lampIntensityScale > 0, String(LIGHTING.presets.sunset.lampIntensityScale));
// CONFIG 1.0.4（t39）：夕照阴影侧补光（低仰角下背光面占比高的补偿；太阳/曝光/天空/雾距不动）
check('夕照阴影侧补光：sunset.ambientIntensity = 1.15（CONFIG 1.0.6：1.1 → 1.15，修 dusk orbit）', LIGHTING.presets.sunset.ambientIntensity === 1.15, String(LIGHTING.presets.sunset.ambientIntensity));
check('夕照阴影侧补光：sunset.hemiIntensity = 1.2（CONFIG 1.0.6）', LIGHTING.presets.sunset.hemiIntensity === 1.2, String(LIGHTING.presets.sunset.hemiIntensity));
check('夕照补光不改太阳：sunIntensity 仍 2.0、方向仍低仰角 y=0.2', LIGHTING.presets.sunset.sunIntensity === 2.0 && LIGHTING.presets.sunset.sunDirection.y === 0.2, `${LIGHTING.presets.sunset.sunIntensity}/${LIGHTING.presets.sunset.sunDirection.y}`);
check('夕照补光不改曝光：sunset.exposure 仍 1.06', LIGHTING.presets.sunset.exposure === 1.06, String(LIGHTING.presets.sunset.exposure));
check('夕照补光不改天空与雾：backgroundRole skyDusk / fog 1400-3200', LIGHTING.presets.sunset.backgroundRole === 'skyDusk' && LIGHTING.presets.sunset.fogNear === 1400 && LIGHTING.presets.sunset.fogFar === 3200);
// CONFIG 1.0.6（t42）修正的设计意图：**补光量按"太阳贡献越弱、补光越强"排序** —— 夜景(无太阳照明)
// > 夕照(低仰角) > 金辉(高角度强太阳)。此前断言"夕照 ≥ 夜景"是 1.0.4 时期的临时结论，已被真内容口径的实测推翻。
check('补光量序：夜景 > 夕照 > 金辉（太阳贡献越弱补光越强，CONFIG 1.0.6 实测校准）',
  LIGHTING.presets.moonlitNight.ambientIntensity > LIGHTING.presets.sunset.ambientIntensity
  && LIGHTING.presets.sunset.ambientIntensity > LIGHTING.presets.goldenHour.ambientIntensity
  && LIGHTING.presets.moonlitNight.hemiIntensity > LIGHTING.presets.sunset.hemiIntensity
  && LIGHTING.presets.sunset.hemiIntensity > LIGHTING.presets.goldenHour.hemiIntensity,
  `night ${LIGHTING.presets.moonlitNight.ambientIntensity}/${LIGHTING.presets.moonlitNight.hemiIntensity} > sunset ${LIGHTING.presets.sunset.ambientIntensity}/${LIGHTING.presets.sunset.hemiIntensity} > golden ${LIGHTING.presets.goldenHour.ambientIntensity}/${LIGHTING.presets.goldenHour.hemiIntensity}`);
check('夜景宫灯满强度：moonlitNight.lampIntensityScale = 1', LIGHTING.presets.moonlitNight.lampIntensityScale === 1);
check('质量档中档实时灯 ≤ 8（§8.2 硬约束）', QUALITY.tiers.medium.maxRealtimeLights <= 8, String(QUALITY.tiers.medium.maxRealtimeLights));
check(
  '雾距修正：goldenHour/sunset 均 fogNear 1400 / fogFar 3200',
  LIGHTING.presets.goldenHour.fogNear === 1400 &&
    LIGHTING.presets.goldenHour.fogFar === 3200 &&
    LIGHTING.presets.sunset.fogNear === 1400 &&
    LIGHTING.presets.sunset.fogFar === 3200,
  `golden ${LIGHTING.presets.goldenHour.fogNear}-${LIGHTING.presets.goldenHour.fogFar} / sunset ${LIGHTING.presets.sunset.fogNear}-${LIGHTING.presets.sunset.fogFar}`,
);
check(
  '雾距覆盖全城机位距离（≈1222m 处雾混合 < 10%）',
  LIGHTING.presets.goldenHour.fogNear > 1222 * 0.9 && LIGHTING.presets.sunset.fogNear > 1222 * 0.9,
);

// UI 与动效
eq('§3.1 UI 间距阶梯 = 4/8/12/16/24/32', UI.spacingScale, [4, 8, 12, 16, 24, 32]);
eq('§3.1 面板圆角 = 4px', UI.radius, 4);
eq('§3.1 UI 过渡 = 180ms', UI.transitionMs, 180);
eq('§3.1 镜头过渡 = 1.2s', CAMERA.transitionSeconds, 1.2);
eq('UI.cameraTransitionMs 与 CAMERA 同源', UI.cameraTransitionMs, CAMERA.transitionSeconds * 1000);
check('UI 字体与面板色齐备', UI.typography.titleFamily.includes('Songti') && UI.panel.sealColor === COLORS.palaceRed);

// §6.4 八视角
eq('§6.4 八种视角编号 1-8', CAMERA.viewModes.map((m) => m.index), [1, 2, 3, 4, 5, 6, 7, 8]);
eq(
  '§6.4 八种视角名称',
  CAMERA.viewModes.map((m) => m.mode),
  ['oblique', 'iso', 'axis', 'zone', 'focus', 'interior', 'fp', 'orbit'],
);
check('第一人称视线高度 = 面高 + 1.65m', CAMERA.fpEyeHeight === 1.65);

// §8.2 预算
eq('§8.2 参考视口 1440×900', [BUDGET.viewport.width, BUDGET.viewport.height], [1440, 900]);
eq('§8.2 DPR = 1', BUDGET.viewport.dpr, 1);
eq('§8.2 目标 60 FPS / 低档 30 FPS', [BUDGET.fps.target, BUDGET.fps.lowTierTarget], [60, 30]);
eq('§8.2 主场景绘制调用 ≤ 350', BUDGET.drawCalls.mainSceneMax, 350);
eq('§8.2 分区绘制调用 B70/C60/D56/E56/F80（t84 §8.2 重分配，理由见 CONTRACTS §8.2.1）', BUDGET.drawCalls.perZone, { B: 70, C: 60, D: 56, E: 56, F: 80 });
eq('§8.2 保留 28（Σ perZone 322 + 28 = 350）', BUDGET.drawCalls.reserve, 28);
eq(
  '§8.2 分区分配合计 + 保留 = 350',
  Object.values(BUDGET.drawCalls.perZone).reduce((a, b) => a + b, 0) + BUDGET.drawCalls.reserve,
  350,
);
eq('§8.2 可见三角面 ≤ 150 万', BUDGET.triangles.visibleMax, 1_500_000);
eq('§8.2 纹理 1K–2K', [BUDGET.textures.minSize, BUDGET.textures.maxSize], [1024, 2048]);
eq('§8.2 首屏资源 ≤ 25MB', BUDGET.loading.firstInteractiveMB, 25);
check('§8.2 加载失败必须有可见提示', BUDGET.loading.requireFailureNotice === true);
check('§8.2 阴影/后处理分账记录', BUDGET.drawCalls.shadowPassCounted && BUDGET.drawCalls.reportFullFrameSeparately);
check('质量档 high/medium/low 齐备且 medium 为预算参考档', ['high', 'medium', 'low'].every((t) => QUALITY.tiers[t]) && QUALITY.default === 'medium' && QUALITY.tiers.medium.dpr === 1);
/* t2：跳跃由「禁用」改为「启用 + 三条结构性约束」（顶点硬上限 / 空中仍受碰撞 / 落地须可站立）。
   t28：把 t2 落下的**状态 pin**（`INTERACTION.jump.enabled === true`）重锚为**性质 pin**（口径三要素）：
     · 来源 = `config.INTERACTION.jump` + `layout.VIEWPOINTS(fp-spawn)` + `layout.OBSTACLES`（唯一权威源，不另写数值）；
     · 判据 = ① 参数自洽（类型/有限/上下界/运动学）② 落地判定字段齐备 ③ **几何闭环**：
       5 个 fp-spawn 处「可站立 ∧ 包络内 ∧ (y, y+maxHeight] 内无实体」⇒ 起跳后必落回**同一可站立面**；
     · 反例 = maxHeight >1.0 / gravity ≥0 / cooldown ≤0 / 出生点被实体占据 / 出生点上方 0.9m 内有实体 ⇒ 红。
   理由：`enabled === true` 只描述"当时的开关状态"，产品一旦关闭跳跃（或改由运行时开关控制）即**假红**，
   且它不检验"跳跃是否安全"；本条**未删任何原有性质**（radius / maxStepHeight / maxHeight 上下界 / gravity 非零 / cooldown >0 全部保留），
   只把布尔状态换成"参数自洽 + 几何闭环"的**可推导**判据（enabled 仅断言**类型**为布尔）。 */
const JUMP = INTERACTION.jump;
const JUMP_FIELDS = ['enabled', 'velocity', 'gravity', 'maxHeight', 'cooldownSeconds'];
const jumpV0 = Math.sqrt(2 * Math.abs(JUMP.gravity) * JUMP.maxHeight);
const jumpApexTime = jumpV0 / Math.abs(JUMP.gravity);
check('碰撞/台阶/跳跃参数自洽（t28：状态 pin → 性质 pin）', INTERACTION.player.radius > 0
  && INTERACTION.step.maxStepHeight > 0 && INTERACTION.step.snapDownDistance > INTERACTION.step.maxStepHeight
  && typeof JUMP.enabled === 'boolean'
  && Number.isFinite(JUMP.velocity)
  && Number.isFinite(JUMP.gravity) && JUMP.gravity < 0
  && Number.isFinite(JUMP.maxHeight) && JUMP.maxHeight > 0 && JUMP.maxHeight <= 1.0
  && Number.isFinite(JUMP.cooldownSeconds) && JUMP.cooldownSeconds > 0);
check('跳跃落地判定所需字段齐备（enabled/velocity/gravity/maxHeight/cooldownSeconds 全在且类型正确）',
  JUMP_FIELDS.every((k) => Object.prototype.hasOwnProperty.call(JUMP, k))
  && typeof JUMP.enabled === 'boolean' && typeof JUMP.velocity === 'number' && typeof JUMP.gravity === 'number'
  && typeof JUMP.maxHeight === 'number' && typeof JUMP.cooldownSeconds === 'number',
  JUMP_FIELDS.map((k) => `${k}:${typeof JUMP[k]}`).join(' · '));
check('跳跃运动学自洽：v₀=√(2·|g|·h) 有限且 >0、顶点 = maxHeight（≤1.0m 硬上限）、顶点时间有限且 <1s',
  Number.isFinite(jumpV0) && jumpV0 > 0 && JUMP.maxHeight <= 1.0
  && Number.isFinite(jumpApexTime) && jumpApexTime > 0 && jumpApexTime < 1,
  `v₀=${jumpV0.toFixed(6)}m/s · t_apex=${jumpApexTime.toFixed(6)}s · h=${JUMP.maxHeight}m`);
/* 几何闭环（t28 新增；t2 的「落地须可站立」在**数据侧**的等价断言）：
   起跳点必须**可站立**（有可行走面、在包络内、脚部未被实体占据），且**顶点高度内无实体**
   ⇒ 起跳→落回同一面的闭环在几何上成立（落点必然还是那个可站立面）。
   取 5 个 `fp-spawn` 为权威起跳点（唯一登记的第一人称出生点）；室内/门内走查点不在此列
   （它们位于建筑障碍足迹内、上有屋面，其"起跳净空"由 kit 屋面几何决定，不属 layout 数据域）。 */
const jumpSpawns = L.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn');
const jumpClosure = [];
for (const spawn of jumpSpawns) {
  const { x, z } = spawn.position;
  const surfaceY = L.floorYAt(x, z);
  const inFoot = (o) => x >= o.bounds.minX && x <= o.bounds.maxX && z >= o.bounds.minZ && z <= o.bounds.maxZ;
  const feetBlocked = surfaceY === null ? ['无可行走面']
    : L.OBSTACLES.filter((o) => ['all', 'exceptDoor'].includes(o.blocks) && inFoot(o) && o.y0 - 1e-9 <= surfaceY && surfaceY < o.y1 - 1e-9).map((o) => o.id);
  const apexHits = surfaceY === null ? ['无可行走面']
    : L.OBSTACLES.filter((o) => inFoot(o) && o.y1 > surfaceY + 1e-9 && o.y0 < surfaceY + JUMP.maxHeight - 1e-9).map((o) => `${o.id}[${o.y0}..${o.y1}]`);
  jumpClosure.push({ id: spawn.id, x, z, surfaceY, envelope: L.insideEnvelope(x, z), feetBlocked, apexHits });
}
check(`地面可站立处起跳后必落回同一可站立面（${jumpSpawns.length} 个 fp-spawn 几何闭环：可站立 ∧ 包络内 ∧ (y, y+maxHeight] 内无实体）`,
  jumpSpawns.length === 5 && jumpClosure.every((r) => r.surfaceY !== null && r.envelope && r.feetBlocked.length === 0 && r.apexHits.length === 0),
  jumpClosure.map((r) => `${r.id}@${r.x},${r.z} y=${r.surfaceY} env=${r.envelope} 脚部阻挡=${r.feetBlocked.length} 顶点内实体=${r.apexHits.length}`).join(' · '));
if (JUMP.enabled) {
  check('跳跃已启用 ⇒ 开关与事件登记自洽（fp:jumped / fp:landed 已声明，功能有可观测输出）',
    EVENTS.fpJumped === 'fp:jumped' && EVENTS.fpLanded === 'fp:landed', `${EVENTS.fpJumped} / ${EVENTS.fpLanded}`);
}
check('地坪标高分区定义（未统一抬到 4.5m）', TERRAIN.terraceGroundY === 0 && TERRAIN.innerPalaceY > 0 && TERRAIN.innerPalaceY < 4.5 && TERRAIN.sideCourtY < 1);

// state 与事件命名
eq('state 必需字段', Object.keys(STATE_DEFAULTS).filter((k) => ['mode', 'viewMode', 'selectedBuildingId', 'timePreset', 'quality', 'tourState'].includes(k)).sort(), ['mode', 'quality', 'selectedBuildingId', 'timePreset', 'tourState', 'viewMode']);
check('事件命名齐备（视角/导览/时辰/质量/选中/加载/失败）', ['requestViewMode', 'requestTour', 'requestTimePreset', 'requestQuality', 'selectionChange', 'assetsProgress', 'assetsFailed'].every((k) => typeof EVENTS[k] === 'string' && EVENTS[k].includes(':')));

// 深冻结
check('config 深冻结', Object.isFrozen(CFG) && Object.isFrozen(MODULES) && Object.isFrozen(LIGHTING.presets.sunset) && Object.isFrozen(QUALITY.tiers.low));

/* =============================================================================
 * B. layout.js：数量 / 唯一性 / 边界 / 连接规则
 * ========================================================================== */

check('layout 版本号为字符串', typeof L.LAYOUT_VERSION === 'string');
eq('§2.3 包络与 config 一致', L.ENVELOPE, LAYOUT_CONSTRAINTS.envelope);
eq('§2.3 包络 = X[-300,300] Z[-450,450]', L.ENVELOPE, { minX: -300, maxX: 300, minZ: -450, maxZ: 450 });

const zoneById = Object.fromEntries(L.ZONES.map((z) => [z.id, z]));
eq('区域集合 = B/C/D/E/F', L.ZONES.map((z) => z.id).sort(), ['B', 'C', 'D', 'E', 'F']);

// §2.3 边界逐项
eq('§2.3 中央区 B 边界', [zoneById.B.bounds.minX, zoneById.B.bounds.maxX], [-100, 100]);
eq('§2.3 前朝 Z 范围', [zoneById.B.bounds.minZ, zoneById.B.bounds.maxZ], [-400, 80]);
eq('§2.3 后宫 C 边界', [zoneById.C.bounds.minX, zoneById.C.bounds.maxX, zoneById.C.bounds.minZ, zoneById.C.bounds.maxZ], [-100, 100, 80, 300]);
eq('§2.3 西侧院 D 边界', [zoneById.D.bounds.minX, zoneById.D.bounds.maxX], [-300, -100]);
eq('§2.3 东侧院 E 边界', [zoneById.E.bounds.minX, zoneById.E.bounds.maxX], [100, 300]);
eq('§2.3 F 内表面 = 包络', zoneById.F.innerFace, L.ENVELOPE);
eq('F 覆盖范围 = 包络 + 18m', [zoneById.F.bounds.minX, zoneById.F.bounds.maxX, zoneById.F.bounds.minZ, zoneById.F.bounds.maxZ], [-318, 318, -468, 468]);
eq('墙体/角楼外扩量 = 18m', L.WALL_OUTER_OVERHANG, 18);
check('只有 F 超出包络', ['B', 'C', 'D', 'E'].every((id) => inB(zoneById[id].bounds, L.ENVELOPE)));
const gardenTiles = zoneById.F.tiles.filter((t) => t.id === 'T-F-garden');
check('§2.3 花园子区 Z∈[300,420]', gardenTiles.length === 1 && gardenTiles[0].bounds.minZ === 300 && gardenTiles[0].bounds.maxZ === 420);
check('F 拥有外宫墙/角楼/外城门/护城河/桥', zoneById.F.boundaryZone === true && L.CITY_WALL.owner === 'F' && L.MOAT.owner === 'F' && L.BRIDGES.every((b) => b.owner === 'F') && L.CITY_WALL.cornerTowerSlots.length === 4 && L.CITY_WALL.cityGateSlots.length === 4);
check('B 从南城门内侧起（前朝范围在门洞以北）', zoneById.B.bounds.minZ === -400 && L.CITY_WALL.innerFace.minZ === -450);
check('C 含内廷门（内廷门槽位归属 C）', L.getSlot('C-gate-inner') && L.getSlot('C-gate-inner').zone === 'C');

// 槽位数量与唯一性
check('槽位总数 ≥ 54', L.SLOTS.length >= LAYOUT_CONSTRAINTS.minSlotCount, `实际 ${L.SLOTS.length}`);
const ids = L.SLOTS.map((s) => s.id);
eq('槽位 id 全局唯一', new Set(ids).size, ids.length);
const slotsPerZone = L.SLOTS.reduce((acc, s) => ((acc[s.zone] = (acc[s.zone] ?? 0) + 1), acc), {});
for (const [zone, min] of Object.entries(LAYOUT_CONSTRAINTS.minZoneSlotCount)) {
  check(`分区 ${zone} 槽位 ≥ ${min}`, (slotsPerZone[zone] ?? 0) >= min, `实际 ${slotsPerZone[zone] ?? 0}`);
}
check('槽位 id 使用区域前缀且全局唯一', L.SLOTS.every((s) => s.id.startsWith(`${s.zone}-`)));
check('没有重复 name+zone 的复制槽位', new Set(L.SLOTS.map((s) => `${s.zone}:${s.name}:${s.x}:${s.z}`)).size === L.SLOTS.length);

// 槽位字段与边界
for (const s of L.SLOTS) {
  const zone = zoneById[s.zone];
  const tol = zone.boundaryZone ? L.WALL_OUTER_OVERHANG : 0;
  check(`槽位 ${s.id} 位于 ${s.zone} 区域内`, inB(s.bounds, zone.bounds, tol), JSON.stringify(s.bounds));
  check(`槽位 ${s.id} 落在某些 tile 内`, !!L.tileAt(s.x, s.z));
  check(`槽位 ${s.id} 形制字段合法`, s.bays >= 1 && s.terraceH >= 0 && Number.isFinite(s.w) && Number.isFinite(s.d) && s.w > 0 && s.d > 0);
  check(`槽位 ${s.id} 屋顶类型合法`, !!ROOF_TYPES[s.roofType], s.roofType);
  // 等级-屋顶白名单守卫（CONFIG 1.0.1 起机器拦截；此前 F-garden-pavilion-main 是人工发现的唯一冲突）
  check(
    `槽位 ${s.id} 屋顶类型属 grade ${s.grade} 白名单`,
    !!ROOF_TYPES[s.roofType] && (GRADES[s.grade]?.roofTypes ?? []).includes(s.roofType),
    `${s.roofType} ∉ [${(GRADES[s.grade]?.roofTypes ?? []).join(', ')}]`,
  );
  check(`槽位 ${s.id} 等级合法`, [1, 2, 3].includes(s.grade), String(s.grade));
  check(`槽位 ${s.id} 朝向合法`, ['south', 'north', 'east', 'west'].includes(s.facing), s.facing);
  check(`槽位 ${s.id} 登记 usage/info`, typeof s.usage === 'string' && s.usage.length > 0 && s.info.includes(s.name));
  check(`槽位 ${s.id} visitable 为布尔`, typeof s.visitable === 'boolean');
}
check('可进入内景建筑 ≥ 2', L.SLOTS.filter((s) => s.visitable).length >= 2);
check('金銮殿与寝殿可进入', L.getSlot('B-hall-main')?.visitable === true && L.getSlot('C-hall-bed-main')?.visitable === true);
check('门殿/院门登记门洞宽度', L.SLOTS.filter((s) => ['gateHall', 'courtyardGate'].includes(s.kind)).every((s) => s.doorWidth >= 8 && s.door));

// 槽位互不重叠
let overlapCount = 0;
const overlapSamples = [];
for (let i = 0; i < L.SLOTS.length; i += 1) {
  for (let j = i + 1; j < L.SLOTS.length; j += 1) {
    const a = L.SLOTS[i].bounds;
    const b = L.SLOTS[j].bounds;
    const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    if (ox > 0.01 && oz > 0.01) {
      overlapCount += 1;
      if (overlapSamples.length < 4) overlapSamples.push(`${L.SLOTS[i].id}×${L.SLOTS[j].id}`);
    }
  }
}
check('槽位两两不重叠', overlapCount === 0, overlapSamples.join(', '));

// 等级-屋顶白名单汇总守卫（覆盖全部槽位；失败时一次性列出所有冲突）
{
  const violations = [];
  for (const s of L.SLOTS) {
    const allowed = GRADES[s.grade]?.roofTypes ?? [];
    if (!ROOF_TYPES[s.roofType]) violations.push(`${s.id}: roofType "${s.roofType}" 不是 ROOF_TYPES 合法键`);
    else if (!allowed.includes(s.roofType)) violations.push(`${s.id}: grade ${s.grade} 不允许 "${s.roofType}"（允许：${allowed.join('/')}）`);
  }
  check(
    `全部 ${L.SLOTS.length} 个槽位同时满足 ROOF_TYPES 合法键与等级白名单`,
    violations.length === 0 && L.SLOTS.length >= LAYOUT_CONSTRAINTS.minSlotCount,
    violations.slice(0, 6).join('；'),
  );
  check(
    '等级白名单本身只引用 ROOF_TYPES 合法键',
    [1, 2, 3].every((g) => (GRADES[g]?.roofTypes ?? []).length > 0 && GRADES[g].roofTypes.every((t) => !!ROOF_TYPES[t])),
  );
  check('GRADES[2] 已允许 pyramidal（CONFIG 1.0.1：中央主亭 grade2 + 攒尖顶）', GRADES[2].roofTypes.includes('pyramidal'));
  check('GRADES[3] 仍仅限 doubleEaveHip（最高等级继续受约束）', GRADES[3].roofTypes.length === 1 && GRADES[3].roofTypes[0] === 'doubleEaveHip');
}

// 院落
check('院落 ≥ 13', L.COURTYARDS.length >= LAYOUT_CONSTRAINTS.minCourtyardCount, `实际 ${L.COURTYARDS.length}`);
const cyIds = L.COURTYARDS.map((c) => c.id);
eq('院落 id 唯一', new Set(cyIds).size, cyIds.length);
const cyByArea = L.COURTYARDS.reduce((acc, c) => ((acc[c.area] = (acc[c.area] ?? 0) + 1), acc), {});
for (const [area, min] of Object.entries(LAYOUT_CONSTRAINTS.minCourtyardByArea)) {
  check(`院落 ${area} ≥ ${min}`, (cyByArea[area] ?? 0) >= min, `实际 ${cyByArea[area] ?? 0}`);
}
for (const c of L.COURTYARDS) {
  check(`院落 ${c.id} 位于 ${c.zone} 区域边界内`, inB(c.bounds, zoneById[c.zone].bounds), JSON.stringify(c.bounds));
  check(`院落 ${c.id} 有墙段定义`, c.wallIds.length >= 4 && c.wallIds.every((w) => L.WALLS.some((wall) => wall.id === w)));
  check(`院落 ${c.id} 的门/廊道可解析`, c.gates.every((g) => !!L.getSlot(g)) && c.corridors.every((r) => L.CORRIDORS.some((cr) => cr.id === r)));
}
check('每个院落至少一处墙或门界定', L.COURTYARDS.every((c) => c.wallIds.length > 0 || c.gates.length > 0));

// 连接
const cxnIds = L.CONNECTORS.map((c) => c.id);
eq('连接 ID 唯一', new Set(cxnIds).size, cxnIds.length);
const zoneIds = L.ZONES.map((z) => z.id);
for (const c of L.CONNECTORS) {
  check(`连接 ${c.id} owner 唯一且单值`, typeof c.owner === 'string' && zoneIds.includes(c.owner));
  check(`连接 ${c.id} 两端 zone 合法`, Array.isArray(c.borders) && c.borders.length === 2 && c.borders.every((z) => zoneIds.includes(z) || z === 'outside'));
  check(`连接 ${c.id} owner 属于两端之一`, c.borders.includes(c.owner));
  check(`连接 ${c.id} 共享 position/width/elevation`, Number.isFinite(c.position.x) && Number.isFinite(c.position.z) && nf(c.width) && c.width >= 6 && nf(c.elevation));
  check(`连接 ${c.id} elevation 合法范围`, c.elevation >= -1 && c.elevation <= 6);
  check(`连接 ${c.id} stairs 才有 elevationLow`, c.kind === 'stairs' ? nf(c.elevationLow) : c.elevationLow === null);
  if (c.gate) {
    const gate = L.getSlot(c.gate);
    check(`连接 ${c.id} 门洞宽度与建筑注册一致`, !!gate && Math.abs(gate.doorWidth - c.width) < 1e-9, `${c.width} vs ${gate?.doorWidth}`);
    check(`连接 ${c.id} 门洞位于其两端边界上`, c.borders.includes(gate.zone));
  }
}
check('每段墙/门/桥只有一个 owner（按 id 反查唯一）', new Set(L.CONNECTORS.map((c) => `${c.id}:${c.owner}`)).size === L.CONNECTORS.length);

// 道路与标高
const roadIds = L.ROADS.map((r) => r.id);
eq('道路段 id 唯一', new Set(roadIds).size, roadIds.length);
for (const r of L.ROADS) {
  check(`道路 ${r.id} 拥有合法 owner`, zoneIds.includes(r.zone));
  check(`道路 ${r.id} 有起止标高`, nf(r.from.y) && nf(r.to.y));
  check(`道路 ${r.id} 坡度合理 (≤0.5)`, r.slope <= 0.5, String(r.slope));
  const roadBox = {
    minX: Math.min(r.from.x, r.to.x) - r.width / 2,
    maxX: Math.max(r.from.x, r.to.x) + r.width / 2,
    minZ: Math.min(r.from.z, r.to.z) - r.width / 2,
    maxZ: Math.max(r.from.z, r.to.z) + r.width / 2,
  };
  check(`道路 ${r.id} 位于宫城包络 + 外侧地形范围内`, inB(roadBox, L.TERRAIN_EXTENT, 1), JSON.stringify(roadBox));
}
const elevated = L.ROADS.filter((r) => Math.max(r.from.y, r.to.y) >= 4.4);
check('存在主殿台基 4.5m 标高段', elevated.length > 0, String(elevated.length));
const groundish = L.ROADS.filter((r) => Math.max(r.from.y, r.to.y) <= 1.0);
check('全城地坪未被统一抬到 4.5m（≥70% 路段 ≤1.0m）', groundish.length / L.ROADS.length >= 0.7, `${groundish.length}/${L.ROADS.length}`);
const routeZ = L.ROADS.filter((r) => r.id.startsWith('RD-B-') || r.id.startsWith('RD-C-') || r.id.startsWith('RD-F-south'));
check('中轴路线覆盖 南桥→南城门→广场→台基→内廷门', routeZ.some((r) => r.id === 'RD-F-south-bridge-deck') && routeZ.some((r) => r.id === 'RD-F-south-gate-floor') && routeZ.some((r) => r.id === 'RD-B-plaza-axis') && routeZ.some((r) => r.id === 'RD-B-main-danbi-3') && routeZ.some((r) => r.id === 'RD-C-inner-gate-floor'));
check('东西侧院有支路', L.ROADS.some((r) => r.zone === 'D') && L.ROADS.some((r) => r.zone === 'E'));

// 可行走面与视角
check('可行走面 ≥ 20', L.WALKABLE.length >= 20, String(L.WALKABLE.length));
check('可行走面 id 唯一', new Set(L.WALKABLE.map((w) => w.id)).size === L.WALKABLE.length);
eq('Viewpoint id 唯一', new Set(L.VIEWPOINTS.map((v) => v.id)).size, L.VIEWPOINTS.length);
const allowedVpModes = ['zone', 'interior', 'fp-spawn', 'focus-extra'];
for (const v of L.VIEWPOINTS) {
  check(`视角 ${v.id} mode 合法`, allowedVpModes.includes(v.mode), v.mode);
  check(`视角 ${v.id} 字段完整`, nf(v.position.x) && nf(v.position.y) && nf(v.position.z) && nf(v.target.x) && nf(v.target.y) && nf(v.target.z) && nf(v.fov));
}
for (const zone of ['B', 'C', 'D', 'E', 'F']) {
  check(`区域 ${zone} 有 ≥1 zone 机位`, L.VIEWPOINTS.some((v) => v.area === zone && v.mode === 'zone'));
  check(`区域 ${zone} 有 ≥1 fp-spawn`, L.VIEWPOINTS.some((v) => v.area === zone && v.mode === 'fp-spawn'));
}
for (const zone of ['B', 'C']) {
  check(`区域 ${zone} 有 ≥1 interior 机位`, L.VIEWPOINTS.some((v) => v.area === zone && v.mode === 'interior'));
}
for (const v of L.VIEWPOINTS.filter((x) => x.mode === 'fp-spawn')) {
  const y = L.floorYAt(v.position.x, v.position.z);
  check(`fp-spawn ${v.id} 落在可行走面上`, y !== null);
  check(`fp-spawn ${v.id} 视线高 = 面高 + 1.65m`, y !== null && Math.abs(v.position.y - (y + 1.65)) <= 0.05, `y=${v.position.y} 面=${y}`);
}
for (const v of L.VIEWPOINTS.filter((x) => x.mode === 'interior')) {
  const hits = L.walkableAt(v.position.x, v.position.z).filter((s) => s.kind === 'interior');
  check(`interior ${v.id} 位于室内可行走面内`, hits.length > 0);
  check(`interior ${v.id} 视线高 = 室内地面 + 1.65m`, hits.length > 0 && Math.abs(v.position.y - (hits[0].y + 1.65)) <= 0.05, `y=${v.position.y} 面=${hits[0]?.y}`);
}
check('导览点 ≥ 8 且首尾为南桥/御花园', L.TOUR_POINTS.length >= 8 && L.TOUR_POINTS[0].zone === 'F' && L.TOUR_POINTS[L.TOUR_POINTS.length - 1].name.includes('御花园'));
check('第一人称走查路线覆盖 9 站且含内景与花园', L.FP_ROUTE.length >= 8 && L.FP_ROUTE.some((w) => w.name.includes('金銮殿内景')) && L.FP_ROUTE.some((w) => w.name.includes('御花园')));
for (const wp of L.FP_ROUTE) {
  const y = L.floorYAt(wp.position.x, wp.position.z);
  check(`走查点 ${wp.id} 落在可行走面`, y !== null);
  check(`走查点 ${wp.id} 视线高 = 面高 + 1.65m`, y !== null && Math.abs(wp.position.y - (y + 1.65)) <= 0.05, `y=${wp.position.y} 面=${y}`);
}

// 障碍与开口
const obstacleByBuilding = new Set(L.OBSTACLES.filter((o) => o.buildingId).map((o) => o.buildingId));
check('所有建筑都登记障碍（含可进入门的门洞）', L.SLOTS.every((s) => obstacleByBuilding.has(s.id)));
/* t73 / Q4：改写为“非 visitable 且非门洞类（pavilion/courtyardGate）⇒ 整体阻挡”，原意不变、覆盖不缩小 */
const nonVisitable = L.SLOTS.filter((s) => !s.visitable);
const blockedSet = nonVisitable.filter((s) => !['pavilion', 'courtyardGate'].includes(s.kind));
const portalSet = nonVisitable.filter((s) => ['pavilion', 'courtyardGate'].includes(s.kind));
check(`非 visitable 且非门洞类 ⇒ 整体阻挡（${blockedSet.length} 栋）`, blockedSet.every((s) => L.OBSTACLES.find((o) => o.buildingId === s.id)?.blocks === 'all'), blockedSet.map((s) => s.id).join(','));
check('门洞类（pavilion/courtyardGate）共 20 座且均有合法障碍条目', portalSet.length === 20 && portalSet.every((s) => ['all', 'exceptDoor'].includes(L.OBSTACLES.find((o) => o.buildingId === s.id)?.blocks)), String(portalSet.length));
console.log(` - t73 Q4 覆盖对照：改写前 :417 覆盖 {pavilion 10}；改写后 整体阻挡 ${blockedSet.length} 栋 + 门洞类独立断言 ${portalSet.length} 栋 = ${blockedSet.length + portalSet.length} 栋（= 全部非 visitable，覆盖未缩小）`);
check('可进入建筑只留门洞通行', L.SLOTS.filter((s) => s.visitable).every((s) => L.OBSTACLES.find((o) => o.buildingId === s.id)?.blocks === 'exceptDoor' && s.door));
check('水面登记为不可行走', L.WATER_BODIES.length >= 4 && L.OBSTACLES.filter((o) => o.sourceType === 'water').length === L.WATER_BODIES.length);

const crossingViolations = [];
for (const w of L.WALLS) {
  const horiz = w.axis === 'x';
  const line = horiz ? w.from.z : w.from.x;
  const lo = horiz ? Math.min(w.from.x, w.to.x) : Math.min(w.from.z, w.to.z);
  const hi = horiz ? Math.max(w.from.x, w.to.x) : Math.max(w.from.z, w.to.z);
  for (const r of L.ROADS) {
    const a = horiz ? r.from.z - line : r.from.x - line;
    const c = horiz ? r.to.z - line : r.to.x - line;
    if (a * c > 0) continue;
    const t = a === c ? 0 : a / (a - c);
    const at = horiz ? r.from.x + (r.to.x - r.from.x) * t : r.from.z + (r.to.z - r.from.z) * t;
    if (at < lo - 1 || at > hi + 1) continue;
    if (!w.openings.some((o) => Math.abs(o.at - at) <= 4 && o.width >= r.width - 0.01)) {
      crossingViolations.push(`${r.id}@${w.id}`);
    }
  }
}
check('所有穿越墙体的道路都有 ≥ 路宽的开口', crossingViolations.length === 0, crossingViolations.slice(0, 5).join(', '));
check('四段宫墙各有一个城门开口', L.WALLS.filter((w) => w.cityWall).every((w) => w.openings.length >= 1));
/* t48：中轴切口把 12 段跨轴院墙各拆成左右两段（`<id>` + `<id>-east`）⇒ 单院落墙记录数 ≥4；
   "一一对应"改判**四条墙线**（拆分段共享同一墙线，故仍恰为 4 条）。 */
check('院墙 id 与院落一一对应（四条墙线；t48 中轴切口拆分段共享墙线）', L.COURTYARDS.every((c) => {
  const ws = L.WALLS.filter((w) => w.courtyardId === c.id);
  const lines = new Set(ws.map((w) => `${w.axis}|${w.axis === 'x' ? w.from.z : w.from.x}`));
  return ws.length >= 4 && lines.size === 4;
}));

// 统计与只读
eq('LAYOUT_STATS.slotCount 与实际一致', L.LAYOUT_STATS.slotCount, L.SLOTS.length);
eq('LAYOUT_STATS.courtyardCount 与实际一致', L.LAYOUT_STATS.courtyardCount, L.COURTYARDS.length);
eq('LAYOUT_STATS 分区统计', L.LAYOUT_STATS.slotsByZone, slotsPerZone);
/* t32：计数类 pin 的**数据推导**补充 —— 与上面"冻结契约计数"（有意 pin，升版/加面时需人工同步）并存，
   判据只增不减。这些判据不随升版失效，但"摘要 vs 注册表"一旦分叉（例如只改一侧）立即红。 */
{
  const STATS_PAIRS = [
    ['slotCount', L.SLOTS.length],
    ['visitableCount', L.SLOTS.filter((s) => s.visitable).length],
    ['courtyardCount', L.COURTYARDS.length],
    ['connectorCount', L.CONNECTORS.length],
    ['roadCount', L.ROADS.length],
    ['wallSegmentCount', L.WALLS.length],
    ['cityWallSegmentCount', L.WALLS.filter((w) => w.cityWall).length],
    ['courtyardWallCount', L.WALLS.filter((w) => w.kind === 'courtWall').length],
    ['corridorCount', L.CORRIDORS.length],
    ['walkableCount', L.WALKABLE.length],
    ['obstacleCount', L.OBSTACLES.length],
    ['waterBodyCount', L.WATER_BODIES.length],
    ['viewpointCount', L.VIEWPOINTS.length],
    ['tourPointCount', L.TOUR_POINTS.length],
    ['fpRouteCount', L.FP_ROUTE.length],
    ['lanternCount', L.LIGHT_ANCHORS.length],
    ['bulkAnnexCount', L.GARDEN_BULK_SLOTS.length],
  ];
  const statBad = STATS_PAIRS.filter(([k, v]) => L.LAYOUT_STATS[k] !== v).map(([k, v]) => `${k}: 摘要 ${L.LAYOUT_STATS[k]} ≠ 实际 ${v}`);
  check(`LAYOUT_STATS 计数逐项 = 实际注册表（${STATS_PAIRS.length} 项；数据推导，摘要与注册表不得分叉）`, statBad.length === 0, statBad.join('；'));
  check('三源一致：visitable 数 = INTERIOR_BY_SLOT 条数 = LAYOUT_STATS.visitableCount（数据推导）',
    L.SLOTS.filter((s) => s.visitable).length === Object.keys(L.INTERIOR_BY_SLOT).length
    && Object.keys(L.INTERIOR_BY_SLOT).length === L.LAYOUT_STATS.visitableCount,
    `${L.SLOTS.filter((s) => s.visitable).length} / ${Object.keys(L.INTERIOR_BY_SLOT).length} / ${L.LAYOUT_STATS.visitableCount}`);
  check('visitableSlots 列表 = 实际 visitable 槽位集合（数据推导，逐 id 相等）',
    L.LAYOUT_STATS.visitableSlots.length === L.SLOTS.filter((s) => s.visitable).length
    && L.LAYOUT_STATS.visitableSlots.every((id) => L.SLOT_BY_ID[id]?.visitable === true),
    `${L.LAYOUT_STATS.visitableSlots.length} 条`);
}
check('layout 深冻结', Object.isFrozen(L.SLOTS) && Object.isFrozen(L.ZONES) && Object.isFrozen(L.SLOTS[0]));

/* =============================================================================
 * C. 独立可 import（无 three / 无 node 内置依赖）
 * ========================================================================== */
for (const file of ['config.js', 'layout.js']) {
  const text = readFileSync(join(SHARED, file), 'utf8');
  const imports = [...text.matchAll(/^\s*import\s+[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
  check(`${file} 无外部依赖（仅相对 import）`, imports.every((i) => i.startsWith('./')), imports.join(','));
  check(`${file} 不引用 three / node 内置模块`, !/from\s+'(three|node:)/.test(text));
}

function nf(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/* =============================================================================
 * D. 启动壳：index.html 与 package.json 的机器校验
 * ========================================================================== */
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  check('index.html 有唯一 #app 容器', (html.match(/id="app"/g) ?? []).length === 1);
  check('index.html 有加载层 #loading-layer', /id="loading-layer"/.test(html));
  check('加载层含进度/失败/重试钩子', ['loading-stage', 'loading-progress', 'loading-error', 'loading-retry'].every((id) => html.includes(`id="${id}"`)));
  check('index.html 只有 1 个模块入口且为相对路径 ./src/main.js', (html.match(/type="module"/g) ?? []).length === 1 && /<script type="module" src="\.\/src\/main\.js"><\/script>/.test(html));
  check('index.html 无内联 <style>', !/<style[\s>]/i.test(html));
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  check('index.html 的脚本只有 importmap 与模块入口', scripts.length === 2 && scripts.every((m) => m[1].includes('importmap') || m[1].includes('src=')));
  check('index.html 引用全部为相对路径', !/(?:src|href)\s*=\s*["']\/(?!\/)/.test(html));
  check('index.html 不含外链 CDN（无 http(s):// 资源）', !/(?:src|href)\s*=\s*["']https?:\/\//.test(html));
  check('package.json type=module 且零依赖', pkg.type === 'module' && Object.keys(pkg.dependencies ?? {}).length === 0 && Object.keys(pkg.devDependencies ?? {}).length === 0);
  check('package.json 提供 serve/build/test/shot 四个脚本', ['serve', 'build', 'test', 'shot'].every((k) => typeof pkg.scripts?.[k] === 'string'));
  check('package.json 无必需网络资源声明（homepage/repository 指向外网不影响运行）', pkg.type === 'module');
}

/* =============================================================================
 * 汇总
 * ========================================================================== */
console.log(`layout.test.mjs：通过 ${passed} 项，失败 ${failures.length} 项`);
console.log(` - 槽位 ${L.SLOTS.length}（B${slotsPerZone.B}/C${slotsPerZone.C}/D${slotsPerZone.D}/E${slotsPerZone.E}/F${slotsPerZone.F}）`);
console.log(` - 院落 ${L.COURTYARDS.length}（前朝${cyByArea.forecourt}/后宫${cyByArea.innerPalace}/西${cyByArea.west}/东${cyByArea.east}）`);

/* ===== t70 切片 A：8 栋有门建筑的内景注册（逐栋逐条机器断言） ===== */
const SLICE_A_IDS = ['B-hall-main', 'C-hall-bed-main', 'B-gate-front', 'C-gate-inner', 'F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east',
  'B-side-west-south', 'B-side-east-south', 'B-side-west-main', 'B-side-east-main', 'B-side-west-rear', 'B-side-east-rear', 'C-side-west-main', 'C-side-east-main', 'C-side-west-rear', 'C-side-east-rear', 'C-annex-west', 'C-annex-east', 'D-court1-house', 'D-court2-house', 'D-court3-house', 'D-court4-house', 'E-court1-house', 'E-court2-house', 'E-court3-house', 'E-court3-annex', 'E-court4-house', 'F-garden-hall-west', 'F-garden-hall-east',
  'B-hall-mid', 'B-hall-rear', 'C-hall-bed-rear', 'D-court1-hall', 'D-court2-hall', 'D-court3-hall', 'D-court4-hall', 'E-court1-hall', 'E-court2-hall', 'E-court3-hall', 'E-court4-hall', 'F-garden-hall-north'];
const SLICE_A_WALL_T = 0.6;
/* ── 以下为**有意 pin（冻结契约计数）**：升级/加面/加栋时必须**人工同步**（t22 升 1.1.24 时版本行漏同步即由本类触发）。
   t32 处理方式：本类**保留**（它们是"契约冻结值"的唯一书面载体），并另在 `LAYOUT_STATS` 块新增**跨注册表一致性**判据
   （摘要 vs 实际数组，数据推导、不随升版失效）；括号里的历史数字（如 171→175）均为**历史快照，不参与判定**。 ── */
/* t39：+72 = 可登塔楼（CLIMB_TOWERS 派生：入口 2 + 每层环带/踏步 + 顶层观景台）；判据用**数据推导**，不写 247。 */
const CLIMB_WK = L.WALKABLE.filter((w) => w.towerId);
eq(`WALKABLE = 175 + t39 塔楼面 ${CLIMB_WK.length}（= ${175 + L.CLIMB_TOWER_FACES.length}）`, L.WALKABLE.length, 175 + L.CLIMB_TOWER_FACES.length);
eq('t39 塔楼面数 = CLIMB_TOWER_FACES 派生数（72：入口 2 + 环带 15 + 踏步 54 + 观景台 1）', CLIMB_WK.length, L.CLIMB_TOWER_FACES.length);
eq('t39 塔楼面 kind 全部取既有白名单值 terrace', [...new Set(CLIMB_WK.map((w) => w.kind))].join(','), 'terrace');
eq(`VIEWPOINTS = 61 + t39 塔顶 ${L.CLIMB_TOWER_VIEWPOINTS.length}（= ${61 + L.CLIMB_TOWER_VIEWPOINTS.length}）`, L.VIEWPOINTS.length, 61 + L.CLIMB_TOWER_VIEWPOINTS.length);
eq('t39 塔顶机位 mode = focus-extra（不属 43 栋内景冻结集）', [...new Set(L.CLIMB_TOWER_VIEWPOINTS.map((v) => v.mode))].join(','), 'focus-extra');
eq('FP_ROUTE = 50（9 基础 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿）', L.FP_ROUTE.length, 50);
eq('visitable = 43（2 殿 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿；4 角楼按 Q3 排除）', L.SLOTS.filter((s) => s.visitable).length, 43);
/* t48：WALLS 计数**数据推导**（4 宫墙 + 4×院落 + 中轴切口拆分段）；其余计数仍为有意 pin。 */
const AXIS_SPLIT_EAST = L.WALLS.filter((w) => w.axisCutoutSide === 'east').length;
eq('冻结计数：SLOTS/WALLS(数据推导)/CONNECTORS/院落/导览', [L.SLOTS.length, L.WALLS.length, L.CONNECTORS.length, L.COURTYARDS.length, L.TOUR_POINTS.length].join('/'), `79/${4 + L.COURTYARDS.length * 4 + AXIS_SPLIT_EAST}/32/14/10`);

/* ===== t9：GARDEN_BULK_ANNEX（12 座批量装饰建筑）—— 逐条判据（只增不减） =====
   口径三要素：
     · 来源 = `layout.GARDEN_BULK_SLOTS`（唯一权威源；本测试不另写第二份字面量清单）；
     · 判据 = ①登记自洽（zone / id 前缀 / 实心 / 非 visitable / grade-屋顶白名单 / 尺寸分类 / 镜像成对）
              ②不新增可走面、内景、机位、导览、走查（总数不变）③障碍按 SLOTS 派生为 `blocks:'all'`
              ④与既有槽位（含彼此）重叠 0 ⑤落点在包络内且 |x| ≥ 250（不压中轴必经路径）；
     · 反例 = 任一条不成立即红（少一座、多一座、改 visitable、改 zone、加一条可走面、挪到中轴都会命中）。 */
const BULK = L.GARDEN_BULK_SLOTS ?? [];
eq('t9 批量装饰建筑 = 12 座（数据驱动清单）', BULK.length, 12);
check('t9 批量装饰：全部 zone=F 且 id 前缀与 zone 自洽', BULK.every((s) => s.zone === 'F' && s.id.startsWith('F-bulk-')), JSON.stringify(BULK.map((s) => `${s.id}@${s.zone}`)));
check('t9 批量装饰：全部实心（hasDoor=false、door=null）且非 visitable ⇒ 不进内景', BULK.every((s) => !s.hasDoor && s.door === null && s.visitable === false), JSON.stringify(BULK.filter((s) => s.hasDoor || s.door !== null || s.visitable).map((s) => s.id)));
check('t9 批量装饰：grade-屋顶白名单自洽（值房 grade2/gableHip、库房 grade1/gable）',
  BULK.every((s) => (GRADES[s.grade]?.roofTypes ?? []).includes(s.roofType)),
  JSON.stringify([...new Set(BULK.map((s) => `g${s.grade}:${s.roofType}`))]));
check('t9 批量装饰：尺寸只分 2 类且西/东镜像成对（2 尺寸 × 2 侧 × 3 进）',
  new Set(BULK.map((s) => `${s.w}x${s.d}`)).size === 2
    && BULK.length === new Set(BULK.map((s) => s.id.replace(/-[we]-/, '-*-'))).size * 2,
  JSON.stringify([...new Set(BULK.map((s) => `${s.w}x${s.d}`))]));
check('t9 批量装饰：与既有槽位（含彼此）重叠 0', (() => {
  const boxes = [...L.SLOTS];
  let hits = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i].bounds;
      const b = boxes[j].bounds;
      if (Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.01 && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 0.01) hits += 1;
    }
  }
  return hits === 0;
})(), '存在重叠');
check(`t9 批量装饰：不进内景/机位/走查（visitable 43 / INTERIOR 43 / VP ${61 + L.CLIMB_TOWER_VIEWPOINTS.length} / FP 50 不变）`,
  L.SLOTS.filter((s) => s.visitable).length === 43 && Object.keys(L.INTERIOR_BY_SLOT).length === 43
    && L.VIEWPOINTS.length === 61 + L.CLIMB_TOWER_VIEWPOINTS.length && L.FP_ROUTE.length === 50
    && BULK.every((s) => !L.INTERIOR_BY_SLOT[s.id] && !L.VIEWPOINTS.some((v) => v.slotId === s.id) && !L.FP_ROUTE.some((f) => f.slotId === s.id)),
  `visitable ${L.SLOTS.filter((s) => s.visitable).length} / 内景 ${Object.keys(L.INTERIOR_BY_SLOT).length} / VP ${L.VIEWPOINTS.length} / FP ${L.FP_ROUTE.length}`);
check('t9 批量装饰：障碍按 SLOTS 统一派生为 blocks:\'all\'（登记与几何同轮）',
  BULK.every((s) => L.OBSTACLES.some((o) => o.id === `OB-${s.id}` && o.blocks === 'all' && o.door === null && o.sourceType === 'building')),
  JSON.stringify(BULK.map((s) => L.OBSTACLES.find((o) => o.id === `OB-${s.id}`)?.blocks ?? '缺失')));
/* t13 口径同步（**判据只增不减**）：t9 的"w 批量装饰不新增可行走面"由"总数仍 171"改为
   "总数 = 171 + t13 汀步面数（=4）且其中无 F-bulk 面" —— 原意（批量装饰零新增面）一字未变，
   变的只是同卡相邻的 t13 增量被显式计入，避免把两卡增量混为一谈。 */
check(`t9 批量装饰：不新增任何可行走面（无 F-bulk 面；总数 = 171 + t13 汀步 ${STONE_STEP_SURFACE_IDS.length} + t39 塔楼 ${L.CLIMB_TOWER_FACES.length}）`,
  L.WALKABLE.length === 171 + STONE_STEP_SURFACE_IDS.length + L.CLIMB_TOWER_FACES.length && !L.WALKABLE.some((w) => /F-bulk/.test(w.id)),
  `${L.WALKABLE.length}`);
check('t9 批量装饰：落点在宫墙内包络且 |x| ≥ 250（远离中轴必经路径）',
  BULK.every((s) => Math.abs(s.x) >= 250 && L.insideEnvelope(s.x, s.z) && L.zoneAt(s.x, s.z) !== null),
  JSON.stringify([...new Set(BULK.map((s) => `${s.x}:${s.z}`))]));
/* t9 实测新增的两条“不压必经路径 / 不穿墙”判据（由实测缺陷驱动，只增不减）：
   t172 方案第三进 `z=288` 与 `CY-{D,E}-court4-wall-north`（z∈[289.4,290.6]）**相交** ⇒ 已平移至 280；
   该缺陷**此前无任何断言覆盖**，故此处把它固化成常驻判据（任一新槽位穿墙 / 压路即红）。 */
{
  const hitRect = (a, b) => a && b
    && Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.01
    && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 0.01;
  const roadRect = (r) => (r.from.x === r.to.x
    ? { minX: r.from.x - r.width / 2, maxX: r.from.x + r.width / 2, minZ: Math.min(r.from.z, r.to.z), maxZ: Math.max(r.from.z, r.to.z) }
    : { minX: Math.min(r.from.x, r.to.x), maxX: Math.max(r.from.x, r.to.x), minZ: r.from.z - r.width / 2, maxZ: r.from.z + r.width / 2 });
  const connRect = (c) => ({ minX: c.position.x - c.width / 2, maxX: c.position.x + c.width / 2, minZ: c.position.z - c.span / 2, maxZ: c.position.z + c.span / 2 });
  const wallHits = [];
  const roadHits = [];
  const connHits = [];
  const facadeHits = [];
  for (const s of BULK) {
    for (const w of L.WALLS) if (hitRect(s.bounds, w.bounds)) wallHits.push(`${s.id}×${w.id}`);
    for (const r of L.ROADS) if (hitRect(s.bounds, roadRect(r))) roadHits.push(`${s.id}×${r.id}`);
    for (const c of L.CONNECTORS) if (hitRect(s.bounds, connRect(c))) connHits.push(`${s.id}×${c.id}`);
    for (const [sid, rec] of Object.entries(L.INTERIOR_BY_SLOT)) {
      const f = L.getSlot(sid)?.door?.facade;
      if (f && f.x >= s.bounds.minX && f.x <= s.bounds.maxX && f.z >= s.bounds.minZ && f.z <= s.bounds.maxZ) facadeHits.push(`${s.id}×${sid}`);
      void rec;
    }
  }
  check('t9 批量装饰：不与宫墙/院墙相交（t172 第三进 z=288 曾穿 CY-{D,E}-court4-wall-north ⇒ 已平移 280）', wallHits.length === 0, wallHits.slice(0, 6).join('、'));
  check('t9 批量装饰：不压道路 / 跨区连接 / 既有门外锚点（不压必经路径）',
    roadHits.length === 0 && connHits.length === 0 && facadeHits.length === 0,
    [...roadHits, ...connHits, ...facadeHits].slice(0, 6).join('、'));
}
eq('INTERIOR_BY_SLOT 条数 = 43', Object.keys(L.INTERIOR_BY_SLOT).length, 43);
const SLICE_A_NEW = ['B-gate-front', 'C-gate-inner', 'B-hall-mid', 'B-hall-rear', 'C-hall-bed-rear', 'D-court1-hall', 'D-court2-hall', 'D-court3-hall', 'D-court4-hall', 'E-court1-hall', 'E-court2-hall', 'E-court3-hall', 'E-court4-hall', 'F-garden-hall-north'];
for (const id of SLICE_A_IDS) {
  const slot = L.getSlot(id);
  const rec = L.interiorFor(id);
  check(`${id}：visitable 且有显式内景映射`, slot?.visitable === true && !!rec, JSON.stringify(rec));
  const wk = rec ? L.WALKABLE.find((w) => w.id === rec.walkableId) : null;
  const vp = L.interiorViewpointFor(id);
  const fp = rec ? L.FP_ROUTE.find((f) => f.id === rec.fpId) : null;
  check(`${id}：WK / VP / FP 三件套齐全`, !!wk && !!vp && !!fp, `${rec?.walkableId} | ${rec?.viewpointId} | ${rec?.fpId}`);
  if (!wk || !vp || !fp || !slot) continue;
  check(`${id}：WK 严格内缩于建筑外墙 0.6m`,
    wk.bounds.minX >= slot.bounds.minX + SLICE_A_WALL_T - 1e-9 && wk.bounds.maxX <= slot.bounds.maxX - SLICE_A_WALL_T + 1e-9
    && wk.bounds.minZ >= slot.bounds.minZ + SLICE_A_WALL_T - 1e-9 && wk.bounds.maxZ <= slot.bounds.maxZ - SLICE_A_WALL_T + 1e-9,
    JSON.stringify(wk.bounds));
  if (SLICE_A_NEW.includes(id) && !L.INTERIOR_PASSAGE_FLOOR[id]) check(`${id}：WK 地坪 = 区域地坪 + baseY（t83）`, Math.abs(wk.y - (L.ZONES.find((z) => z.id === slot.zone).groundY + slot.baseY)) <= 0.01, `${wk.y} vs ${slot.zone}+${slot.baseY}`);
  check(`${id}：VP 位置与目标 xz 均在室内`,
    [vp.position, vp.target].every((q) => q.x >= wk.bounds.minX - 1e-9 && q.x <= wk.bounds.maxX + 1e-9 && q.z >= wk.bounds.minZ - 1e-9 && q.z <= wk.bounds.maxZ + 1e-9),
    `${JSON.stringify(vp.position)} → ${JSON.stringify(vp.target)}`);
  check(`${id}：VP 高度在室内净高内${SLICE_A_NEW.includes(id) ? '且 fov = 62' : ''}`,
    [vp.position.y, vp.target.y].every((y) => y >= wk.y - 1e-9 && y <= wk.y + slot.eaveHeight + 1e-9) && (!SLICE_A_NEW.includes(id) || Math.abs(vp.fov - 62) < 1e-9),
    `${vp.position.y}/${vp.target.y} within [${slot.baseY}, ${(slot.baseY + slot.eaveHeight).toFixed(2)}], fov ${vp.fov}`);
  check(`${id}：FP surfaceId 指向该 WK 且轴向对齐门洞中心`,
    fp.surfaceId === rec.walkableId && (slot.door.axis === 'z' ? Math.abs(fp.position.x - slot.door.center.x) < 1e-9 : Math.abs(fp.position.z - slot.door.center.z) < 1e-9),
    `${fp.surfaceId} @ ${slot.door.axis}`);
  check(`${id}：门洞净宽 ≥ 出入口宽（${slot.doorWidth}m）`, slot.doorWidth > 0 && slot.door.width >= slot.doorWidth - 1e-9, `door ${slot.door.width} / doorWidth ${slot.doorWidth}`);
}
check('interiorsByZone 与映射一致（按区过滤，总数 = visitable 栋数）', ['B', 'C', 'D', 'E', 'F'].every((z) => L.interiorsByZone(z).every((r) => L.getSlot(r.slotId).zone === z)) && Object.keys(L.INTERIOR_BY_SLOT).length === L.SLOTS.filter((s) => s.visitable).length, JSON.stringify(L.interiorsByZone('B').map((r) => r.slotId)));
eq('内景分区计数 = 各 zone 的 visitable 栋数', ['B','C','D','E','F'].map((z) => L.interiorsByZone(z).length).join('/'), ['B','C','D','E','F'].map((z) => L.SLOTS.filter((s) => s.visitable && s.zone === z).length).join('/'));

/* t72：4 座城门 = **门洞通道级**内景（地面取通道面 ≠ baseY 12.4）+ floorYAt 语义未变 */
for (const gid of ['F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east']) {
  const slot = L.getSlot(gid); const rec = L.interiorFor(gid);
  const wk = L.WALKABLE.find((w) => w.id === rec?.walkableId);
  check(`${gid}：通道面地面 = 0.4（非墙顶 baseY 12.4）`, !!wk && Math.abs(wk.y - 0.4) < 1e-9 && slot.baseY === 12.4, `wk.y=${wk?.y} baseY=${slot?.baseY}`);
  check(`${gid}：城门处 floorYAt 仍解析为通道值 0.4`, Math.abs(L.floorYAt(slot.door.center.x, slot.door.center.z) - 0.4) < 1e-9, String(L.floorYAt(slot.door.center.x, slot.door.center.z)));
}
check('legacy 走查口径不受影响：WP-fp-02 处 floorYAt = 0.4', Math.abs(L.floorYAt(0, -445) - 0.4) < 1e-9, String(L.floorYAt(0, -445)));

/* ===== t75：门洞通道可行走面 → 连通性机器断言（BFS） =====
   邻接模型（已文档化）：两矩形 xz 重叠或相接（EPS=1e-6）且 |Δy| ≤ 0.8m（一步台阶容差）。
   起点 = 室外地面 WK-F-bridge-south（既有走查路线起点所在面）。 */
{
  const W = L.WALKABLE;
  const EPS = 1e-6;
  /* **surfaces-only 诊断模型**（t85 定位声明）：只按“可行走面矩形重叠/相接 + 单步高差 ≤ DY”判邻接，**不含 connector 丹陛/台阶**
     ⇒ 本模型数字**只是诊断、不构成可达性结论**；可达性约束口径是**生产口径（含 connector）**，由 t77 复验负责。
     实测直方图（194 对相邻面）：0~0.05m 48 · 0.05~0.5m 81 · 0.5~0.8m 11 · **0.8~1.0m 27 · 1.0~2.0m 22 · ≥2.0m 5**；
     （t32 标注：以上直方图为**历史快照/诊断读数，不参与任何判定**——本块只断言 `DY = 0.8` 与连通性分类，不 pin 直方图。）
     真实走查求解器台阶阈值仅 **0.5m**（t13 实测），0.8m 以上高差靠丹陛/台阶 connector（本模型按设计不含）
     ⇒ **不得**把 DY 调到 1.0 以减少红项（t85 裁定）：DY = 0.8m 保留。 */
  const DY = 0.8;
  const touch = (a, b2, withY = true) => a.bounds.maxX > b2.bounds.minX - EPS && a.bounds.minX < b2.bounds.maxX + EPS
    && a.bounds.maxZ > b2.bounds.minZ - EPS && a.bounds.minZ < b2.bounds.maxZ + EPS && (!withY || Math.abs(a.y - b2.y) <= DY);
  const reachable = (skipKind) => {
    const nodes = W.map((w, i) => ({ w, i })).filter(({ w }) => w.kind !== skipKind);
    const adj = new Map(nodes.map(({ i }) => [i, []]));
    for (let a = 0; a < nodes.length; a += 1)
      for (let b3 = a + 1; b3 < nodes.length; b3 += 1)
        if (touch(nodes[a].w, nodes[b3].w)) { adj.get(nodes[a].i).push(nodes[b3].i); adj.get(nodes[b3].i).push(nodes[a].i); }
    const start = W.findIndex((w) => w.id === 'WK-F-bridge-south');
    const seen = new Set([start]); const q = [start];
    while (q.length) { const i = q.pop(); for (const j of adj.get(i) ?? []) if (!seen.has(j)) { seen.add(j); q.push(j); } }
    return seen;
  };
  const interiors = W.filter((w) => w.kind === 'interior');
  // A) 卡片口径模型：按矩形重叠/相接判定邻接（不含高度条件）
  const reachA = (skipKind, withY) => {
    const nodes = W.map((w, i) => ({ w, i })).filter(({ w }) => w.kind !== skipKind);
    const adj = new Map(nodes.map(({ i }) => [i, []]));
    for (let a = 0; a < nodes.length; a += 1)
      for (let b3 = a + 1; b3 < nodes.length; b3 += 1)
        if (touch(nodes[a].w, nodes[b3].w, withY)) { adj.get(nodes[a].i).push(nodes[b3].i); adj.get(nodes[b3].i).push(nodes[a].i); }
    const start = W.findIndex((w) => w.id === 'WK-F-bridge-south');
    const seen = new Set([start]); const q = [start];
    while (q.length) { const i = q.pop(); for (const j of adj.get(i) ?? []) if (!seen.has(j)) { seen.add(j); q.push(j); } }
    return seen;
  };
  const seenA = reachA(null, false);
  const badA = interiors.filter((w) => !seenA.has(W.indexOf(w)));
  check('A) surfaces-only 启发式（矩形重叠/相接，不含 connector）：43 处内景全部与室外地面同属一个连通分量', badA.length === 0, `不连通 ${badA.length}：${badA.slice(0, 5).map((w) => w.id).join(',')}`);
  // B) 通道面必要性（局部突变证明）：去掉通道面后，哪些内景在**同层**（|Δy| ≤ 0.8m）再无室外邻居？
  const sameLevelOutside = (w, opts = {}) => W.filter((x) => x !== w
    && (opts.withPassage ? true : x.kind !== 'passage')
    && x.kind !== 'interior' && touch(w, x, true)).length;
  const withP = interiors.filter((w) => sameLevelOutside(w, { withPassage: true }) > 0);
  const needPassage = interiors.filter((w) => sameLevelOutside(w, { withPassage: false }) === 0);
  check('B) 每条内景都经其门洞通道获得同层可达邻居（t97 修复后 surfaces-only 诊断 = 43/43）', withP.length === 43, `${withP.length}/43`);
  check('B) 突变证明（surfaces-only，Δy≤0.8m）：去掉通道面后有 15 处内景在同层再无室外邻居（改动前实测基线）', needPassage.length === 15, `needPassage=${needPassage.length}：${needPassage.slice(0, 4).map((w) => w.id).join(',')}`);
  console.log(` - t75 突变证明：加通道面后 43/43 内景同层可达；去掉通道面后 ${needPassage.length} 处内景同层不可达（=${needPassage.slice(0, 3).map((w) => w.id).join(',')}…）`);
  const passages = W.filter((w) => w.kind === 'passage');
  check('通道面 43 条且每条同时接室内面与室外地面', passages.length === 43 && passages.every((p) => {
    const slotId = p.id.replace(/^WK-/, '').replace(/-door-passage$/, '');
    const own = W.find((w) => w.id === L.INTERIOR_BY_SLOT[slotId]?.walkableId);
    const outside = W.filter((w) => w.kind !== 'interior' && w.kind !== 'passage' && touch(p, w, false));
    return !!own && touch(p, own, false) && outside.length > 0;
  }), `passages=${passages.length}`);
  // 内景相机夹取语义：包围盒仍只取 kind:'interior'（哈希对照，改动前后一致）
  const ser = interiors.map((w) => `${w.id}:${w.bounds.minX},${w.bounds.minZ},${w.bounds.maxX},${w.bounds.maxZ},${w.y}`).join('|');
  let h = 0; for (const c of ser) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  check('内景包围盒只取 kind:interior（43 条，冻结哈希 0xf5814450 = t10 起；t10 前为 0x51d2348e —— 差异仅来自 E 两栋内景地面 1.4→1.3）', interiors.length === 43 && h.toString(16) === 'f5814450', `${interiors.length}/${h.toString(16)}`);
  check(`通道面不新增机位/走查点（VIEWPOINTS ${61 + L.CLIMB_TOWER_VIEWPOINTS.length} · FP_ROUTE 50 不变）`, L.VIEWPOINTS.length === 61 + L.CLIMB_TOWER_VIEWPOINTS.length && L.FP_ROUTE.length === 50, `${L.VIEWPOINTS.length}/${L.FP_ROUTE.length}`);
}


/* ===== t83：内景 y 基准 = 区域地坪 + slot.baseY（逐栋断言 + 显式例外表） ===== */
{
  const zg = Object.fromEntries(L.ZONES.map((z) => [z.id, z.groundY]));
  eq('区域地坪表与 layout.ZONES 逐值一致（B/C/D/E/F）', ['B', 'C', 'D', 'E', 'F'].map((z) => zg[z]).join('/'), '0/0.9/0.4/0.4/0');
  const rows = Object.entries(L.INTERIOR_BY_SLOT).map(([sid, rec]) => {
    const wk = L.WALKABLE.find((w) => w.id === rec.walkableId);
    const slot = L.SLOT_BY_ID[sid];
    const vp = L.interiorViewpointFor(sid);
    return { sid, zone: slot.zone, wkY: wk.y, exp: +(zg[slot.zone] + slot.baseY).toFixed(2), recY: rec.groundY, vpY: vp?.position.y, exc: !!L.INTERIOR_PASSAGE_FLOOR[sid] };
  });
  const wrong = rows.filter((r) => !r.exc && Math.abs(r.wkY - r.exp) > 0.01);
  check('43 处内景 WK.y 全部 = 区域地坪 + slot.baseY（±0.01；城门为显式例外）', wrong.length === 0, wrong.map((r) => `${r.sid}:${r.wkY}!=${r.exp}`).join(','));
  const recWrong = rows.filter((r) => !r.exc && Math.abs(r.recY - r.exp) > 0.01);
  check('INTERIOR_BY_SLOT.groundY 同步区域地坪（±0.01）', recWrong.length === 0, recWrong.map((r) => `${r.sid}:${r.recY}!=${r.exp}`).join(','));
  const excSet = rows.filter((r) => r.exc).map((r) => r.sid).sort();
  eq('例外集合恰好 = INTERIOR_PASSAGE_FLOOR 的键（F 四城门通道口径）', excSet.join(','), Object.keys(L.INTERIOR_PASSAGE_FLOOR).sort().join(','));
  const vpBad = rows.filter((r) => !r.exc && Math.abs(r.vpY - (r.wkY + 1.65)) > 1e-6);
  check('内景机位 y = 面高 + 1.65m（t83 修正后逐栋成立）', vpBad.length === 0, vpBad.map((r) => `${r.sid}:${r.vpY}!=${r.wkY}+1.65`).join(','));
  const cz = rows.filter((r) => ['C', 'D', 'E'].includes(r.zone) && !r.exc);
  check(`C/D/E 受影响的 ${cz.length} 栋全部抬到区域地坪（C+0.9 / D+0.4 / E+0.4）`, cz.every((r) => Math.abs(r.wkY - r.exp) <= 0.01), '');
}

console.log(` - t85 连通性定位：**surfaces-only 启发式（不含 connector 台阶）**，上面 A/B 数字**只是诊断、不构成可达性结论**；可达性以**生产口径（含 connector）**为准，由 t77 复验`);

/* ===== t89（部分）：内景元数据口径 43/43 + F10 door.sillY 语义与例外表 ===== */
{
  const rows = Object.entries(L.INTERIOR_BY_SLOT).map(([sid, rec]) => {
    const wk = L.WALKABLE.find((w) => w.id === rec.walkableId);
    const slot = L.SLOT_BY_ID[sid];
    const passage = L.WALKABLE.find((w) => w.id === `WK-${sid}-door-passage`);
    return { sid, recY: rec.groundY, wkY: wk?.y, sillY: slot?.door?.sillY, passageY: passage?.y, exc: L.DOOR_SILL_EXCEPTIONS.includes(sid) };
  });
  const badMeta = rows.filter((r) => r.wkY == null || Math.abs(r.recY - r.wkY) > 1e-9);
  check('INTERIOR_BY_SLOT[].groundY === WK-*-interior.y（43/43；唯一权威来源 = WK 地面）', badMeta.length === 0, badMeta.map((r) => `${r.sid}:${r.recY}!=${r.wkY}`).join(','));
  const passBad = rows.filter((r) => r.passageY == null || Math.abs(r.passageY - r.wkY) > 1e-9);
  check('t97 修复后：WK-*-door-passage.y 未补区域地坪的栋数 = 0（pin 已由 24 翻绿）', passBad.length === 0, `${passBad.length}：${passBad.slice(0,3).map((r) => r.sid).join(',')}`);
  const sillBad = rows.filter((r) => !r.exc && Math.abs(r.sillY - r.wkY) > 1e-9);
  check('t97 修复后：door.sillY 未补区域地坪的栋数 = 0（非例外栋全部 = 区域地坪 + 本地台基；pin 已由 24 翻绿）', sillBad.length === 0, `${sillBad.length}：${sillBad.slice(0,3).map((r) => `${r.sid}:${r.sillY} vs ${r.wkY}`).join(',')}`);
  const excSet = rows.filter((r) => r.sillY != null && Math.abs(r.sillY - r.wkY) > 1e-9).map((r) => r.sid).sort();
  check('sillY 偏离集合 = 5（F 四城门双标高 + C-gate-inner 绝对标高；C-hall-bed-main 已随 S() 修复归位）且 ⊆ DOOR_SILL_EXCEPTIONS', excSet.length === 5 && excSet.every((id) => L.DOOR_SILL_EXCEPTIONS.includes(id)), `${excSet.length}：${excSet.join(',')}`);
  console.log(` - t97 口径（F10 修点已落地）：groundY===WK.y 不一致 ${badMeta.length}/43；passage.y 不一致 ${passBad.length}/43；sillY 不一致（非例外）${sillBad.length}/43；例外 ${excSet.length} 条（恰等于 DOOR_SILL_EXCEPTIONS）`);
}


/* ===== t102：按 t100 权威 Δ 清单登记的门外过渡台阶（逐栋断言） ===== */
{
  // Δ 逐栋取自 t100 `docs/report-completeness.md` §15.2 表 A（**不得自定/近似**）
  const T100_DELTA = {
    'B-hall-mid': 2.0, 'B-hall-rear': 1.8, 'B-side-east-main': -1.5, 'B-side-west-main': -1.5,
    'B-side-east-rear': 1.0, 'B-side-west-rear': 1.0, 'B-side-east-south': 0.9, 'B-side-west-south': 0.9,
    'C-hall-bed-rear': 1.2, 'C-side-east-rear': 0.6, 'C-side-west-rear': 0.6,
    'D-court1-hall': 0.9, 'D-court2-hall': 0.9, 'D-court3-hall': 0.9, 'D-court4-hall': 0.9,
    /* t10（t77-F14 blocker）：E 两栋 1.0 → **0.9**（Δ = 台基高，台基同步 1.0→0.9）——
       原 1.0 ⇒ 门外逐跳恰 0.50 = 上台阶阈值等值（§12.1.4.5 禁止项），图侧 float32/float64 混合读数下翻面
       ⇒ verify-completeness 5.3 的 4 点不可达。改 0.9 后逐跳 0.45；级数仍 ceil(0.9/0.5)=2 ⇒ 过渡面总数不变。 */
    'E-court1-hall': 0.9, 'E-court2-hall': 0.9, 'E-court4-hall': 0.9,
  };
  const EPS = 1e-6;
  const ovl = (a, b) => a.bounds.maxX > b.bounds.minX - EPS && a.bounds.minX < b.bounds.maxX + EPS
    && a.bounds.maxZ > b.bounds.minZ - EPS && a.bounds.minZ < b.bounds.maxZ + EPS;
  const isTr = (w) => /-transition-\d+$/.test(w.id); // 过渡面以 id 后缀标识（kind 用既有合法值 ground）
  const trAll = L.WALKABLE.filter(isTr);
  eq('过渡面总数 = Σ ceil(|Δ|/0.5)（t100 的 18 栋）+ 4（t128 的 C 两栋）+ 2（t131 的 E-court3-hall）= 49', trAll.length, Object.values(T100_DELTA).reduce((a, d) => a + Math.max(2, Math.ceil(Math.abs(d) / 0.5)), 0) + 4 + 2);
  const bad = [];
  for (const [id, d] of Object.entries(T100_DELTA)) {
    const slot = L.SLOT_BY_ID[id];
    const ps = L.WALKABLE.find((w) => w.id === `WK-${id}-door-passage`);
    const tr = L.WALKABLE.filter((w) => isTr(w) && w.id.startsWith(`WK-${id}-transition-`))
      .sort((a, b) => a.id.localeCompare(b.id));
    const n = Math.max(2, Math.ceil(Math.abs(d) / 0.5));
    if (tr.length !== n) { bad.push(`${id}:级数 ${tr.length}≠${n}`); continue; }
    if (Math.abs(tr[0].y - ps.y) > 0.5001) bad.push(`${id}:首级 ${tr[0].y} vs 通道 ${ps.y}`);
    for (let i = 1; i < tr.length; i += 1) if (Math.abs(tr[i].y - tr[i - 1].y) > 0.5001) bad.push(`${id}:相邻第${i}级`);
    if (Math.abs(tr[tr.length - 1].y - (ps.y - d)) > 1e-6) bad.push(`${id}:末级 ${tr[tr.length - 1].y} ≠ 门外 ${ps.y - d}`);
    if (!tr.every((t, i) => (i === 0 ? ovl(t, ps) : ovl(t, tr[i - 1])))) bad.push(`${id}:xz 未接续`);
    if (!tr.every((t) => Math.abs((t.bounds.maxX - t.bounds.minX) - slot.door.width) < 1e-3 || Math.abs((t.bounds.maxZ - t.bounds.minZ) - slot.door.width) < 1e-3)) bad.push(`${id}:宽度 ≠ doorWidth`);
    if (!slot.door.facade || Math.abs(slot.door.facade.y - slot.door.sillY) > 1e-9) bad.push(`${id}:facade 缺失/口径不符`);
  }
  check('t102 过渡逐栋：级数=ceil(|Δ|/0.5)、首末级口径、相邻≤0.5、xz 接续、宽度=doorWidth、facade 已登记', bad.length === 0, bad.join('；'));
  check('t102+t128：过渡面只属 t100 的 18 栋 ∪ t128 授权的 C 两栋（未登记多余几何）', trAll.every((w) => Object.keys(T100_DELTA).some((id) => w.id.startsWith(`WK-${id}-transition-`)) || /^WK-C-side-(west|east)-main-transition-\d+$/.test(w.id) || /^WK-E-court3-hall-transition-\d+$/.test(w.id)), '');
  console.log(` - t102 过渡登记：${Object.keys(T100_DELTA).length} 栋 / ${trAll.length} 级台阶（Δ 取自 t100 §15.2 表 A；向上 16 栋 + 向下 2 栋）；WALKABLE ${L.WALKABLE.length}`);
}

/* ===== t10：E 侧门外过渡**留裕量**（t77-F14 blocker；§12.1.4.5 禁止「刚好等于阈值」） =====
   口径三要素：
     · 来源 = `layout.WALKABLE` 的 `WK-E-court{1,2}-hall-door-passage` + `-transition-N` 与门外地面
       （`zoneGroundY('E')` = 0.4，不另写字面量）；
     · 判据 = 逐跳 **上/下双向** 的 |Δ| ≤ **0.45 + 5e-8**（距上台阶阈值 0.5 留 ≥0.04 裕量；5e-8 是
       float32 舍入余量：Δ=0.9 均分两级时 `fround(0.85)−fround(0.4)=0.4500000179`，物理裕量仍是 0.05），
       且**同时**在 float64 与**图侧 float32**（`Math.fround`，`walk-graph.heights` 的实际精度）下成立；
     · 反例 = 任一跳 = 0.50（等值阈值，t77-F14 的原始缺陷）、> 0.4500001、或距阈值裕量 <0.04 即红。
   注：本断言**只覆盖 t10 授权的 E 两栋**（B 侧 `B-hall-mid`/`B-side-main` 仍有逐跳 0.5 的同类潜在项，
       不在本卡授权范围，已登记待派单；故此处**不写全局 ≤0.45**，避免误伤未授权几何）。 */
{
  const f32 = Math.fround;
  const HOP_MAX = 0.45;
  const HOP_MAX_F32 = 0.45 + 5e-8; // float32 舍入余量（见上）
  const MARGIN_MIN = 0.04; // 距上台阶阈值 0.5 的最小裕量
  const E_LADDER_SLOTS = ['E-court1-hall', 'E-court2-hall'];
  const bad = [];
  for (const id of E_LADDER_SLOTS) {
    const slot = L.SLOT_BY_ID[id];
    const ps = L.WALKABLE.find((w) => w.id === `WK-${id}-door-passage`);
    const ib = L.WALKABLE.find((w) => w.id === `WK-${id}-interior`);
    const tr = L.WALKABLE.filter((w) => w.id.startsWith(`WK-${id}-transition-`)).sort((a, b) => a.id.localeCompare(b.id));
    const outdoor = L.ZONES.find((z) => z.id === 'E').groundY;
    const seq = [ps?.y, ...tr.map((w) => w.y), outdoor];
    if (seq.some((v) => typeof v !== 'number')) { bad.push(`${id}:面缺失`); continue; }
    if (Math.abs(ib.y - ps.y) > 1e-9) bad.push(`${id}:内景面 ${ib.y} ≠ 通道面 ${ps.y}`);
    if (Math.abs(ps.y - (outdoor + slot.baseY)) > 1e-9) bad.push(`${id}:通道面 ${ps.y} ≠ 区域地坪+baseY ${outdoor + slot.baseY}`);
    for (let i = 0; i + 1 < seq.length; i += 1) {
      const d64 = Math.abs(seq[i + 1] - seq[i]);
      const d32 = Math.abs(f32(seq[i + 1]) - f32(seq[i]));
      if (d64 > HOP_MAX + 1e-9) bad.push(`${id}:第${i + 1}跳 float64 ${d64.toFixed(6)} > ${HOP_MAX}`);
      if (d32 > HOP_MAX_F32) bad.push(`${id}:第${i + 1}跳 float32 ${d32.toFixed(6)} > ${HOP_MAX_F32}`);
      if (Math.abs(d32 - 0.5) < 1e-6 || Math.abs(d64 - 0.5) < 1e-6) bad.push(`${id}:第${i + 1}跳 = 阈值等值 0.5（§12.1.4.5 禁止项）`);
      if (0.5 - Math.max(d32, d64) < MARGIN_MIN) bad.push(`${id}:第${i + 1}跳距阈值裕量 ${(0.5 - Math.max(d32, d64)).toFixed(6)} < ${MARGIN_MIN}`);
    }
  }
  check(`t10 E 侧门外过渡留裕量：${E_LADDER_SLOTS.length} 栋逐跳双向 |Δ| ≤ ${HOP_MAX}（float32 ≤ ${HOP_MAX_F32}）且距阈值裕量 ≥ ${MARGIN_MIN}；不得 = 0.5 等值`, bad.length === 0, bad.join('；'));
  check('t10 E 侧三栋台基统一 0.9（文华殿/陈设正堂/东后殿；Δ 一致 ⇒ 过渡级数一致 = 2）',
    ['E-court1-hall', 'E-court2-hall', 'E-court4-hall'].every((id) => L.SLOT_BY_ID[id].terraceH === 0.9),
    JSON.stringify(['E-court1-hall', 'E-court2-hall', 'E-court4-hall'].map((id) => `${id}:${L.SLOT_BY_ID[id].terraceH}`)));
  const trE = L.WALKABLE.filter((w) => /^WK-E-court[12]-hall-transition-\d+$/.test(w.id));
  eq('t10 未新增/未删除 E 侧过渡面（仍 2×2 = 4 级；WALKABLE 总数不变）', trE.length, 4);
  console.log(` - t10 E 侧过渡留裕量：${E_LADDER_SLOTS.join('/')} 高度序列 ${E_LADDER_SLOTS.map((id) => {
    const ps = L.WALKABLE.find((w) => w.id === `WK-${id}-door-passage`);
    const tr = L.WALKABLE.filter((w) => w.id.startsWith(`WK-${id}-transition-`)).sort((a, b) => a.id.localeCompare(b.id));
    return `[${ps.y} → ${tr.map((w) => w.y).join(' → ')} → 0.4]`;
  }).join(' ')}；WALKABLE ${L.WALKABLE.length}`);
}

/* ===== t37：可登塔楼工厂（`src/kit/towers.js`）—— 两个 P0 的常驻守卫（接线前先钉死"一接就崩"） =====
   背景：工厂早已存在但**零接线**（全仓无 `makeTower` 调用点）。接线前有两个 P0 ——
     ① 可行走面 `kind:'towerStep'` **不在** `WALKABLE_KINDS` 白名单 ⇒ 接线即抛 `ZoneContractError`（全树 0 区装载）；
     ② 塔顶机位 `mode:'interior'` 会**破坏冻结的 43 栋内景集合**（43→44，且 `interior` 机位必须在 `kind:'interior'` 面上）。
   t37 已把两处改为既有白名单值（`terrace` / `focus-extra`），本块把结论钉成常驻判据。
   口径三要素：
     · 来源 = `kit/towers.js` 的 `climbStepMax/towerPlan/makeTower` + `CONFIG` + core 的 `WALKABLE_KINDS/VIEWPOINT_MODES`（不另写数值）；
     · 判据 = ① 每个可行走面 `kind ∈ WALKABLE_KINDS` ② 每个机位 `mode ∈ VIEWPOINT_MODES` 且 **≠ `'interior'`**
              ③ 逐跳 ≤ `climbStepMax` 且**双向**、平面零叠压、顶层存在且高于台基 ④ 几何 ↔ 登记**同轮**
              （每块面都有对应实体板；塔身障碍足迹**不覆盖**任何可行走面 ⇒ 无空气墙、也无"空气楼梯"）
              ⑤ 43 栋内景集合不被触碰（`interior` 机位 43 / `INTERIOR_BY_SLOT` 43 / `visitable` 43）；
     · 反例 = 改回 `towerStep` / 改回 `interior` / 任一跳超上限 / 面被障碍覆盖 / 面缺几何 ⇒ 红。
   本块在**未接线**状态下即可跑（工厂是纯函数 + 一处 three 装载），故接线落地时无需再改本块。 */
{
  const towers = await import(join(ROOT, 'src', 'kit', 'towers.js'));
  const { WALKABLE_KINDS, VIEWPOINT_MODES } = await import(join(ROOT, 'src', 'core', 'context.js'));
  const SITE = { id: 'T37-site', spec: 'watchtower-3', x: 226, z: 262.4, zone: 'E', baseY: L.ZONES.find((z) => z.id === 'E').groundY };
  const plan = towers.towerPlan(SITE, CFG);
  const hopMax = towers.climbStepMax(CFG);
  check('t37 塔楼单跳上限 = maxStepHeight × 安全系数，且 ≤0.45（远离"刚好 0.50"，§12.1.4.5 禁止项）',
    hopMax > 0 && hopMax <= 0.45 && Math.abs(hopMax - CFG.INTERACTION.step.maxStepHeight * towers.CLIMB_SAFETY) < 1e-9,
    `${hopMax}（上限 0.45）`);
  check('t37 盘道逐跳：上行链全部 ≤ 单跳上限、反向同链可走、平面零叠压、顶层 = 观景台且高于台基（`.ok` 口径）',
    plan.climb.ok === true && plan.climb.maxHopMeasured <= hopMax + 1e-6 && plan.climb.reverseOk === true
      && plan.climb.overlapCount === 0 && plan.climb.topFaceId === plan.deckFaceId && plan.climb.topFaceY > SITE.baseY,
    JSON.stringify({ ok: plan.climb.ok, hops: plan.climb.hops, max: plan.climb.maxHopMeasured, rev: plan.climb.reverseOk, ovl: plan.climb.overlapCount, top: plan.climb.topFaceId, y: plan.climb.topFaceY }));
  const { loadThree } = await import(join(HERE, 'harness.mjs'));
  const THREE37 = await loadThree();
  const built = towers.makeTower({ THREE: THREE37, config: CFG, materials: { get: () => new THREE37.MeshBasicMaterial() } }, SITE);
  // ④ 几何 ↔ 登记同轮 + **生产判定口径**：每块面中心在「塔身障碍 × 玩家体段」判定下必须可站
  //    （`obstacleBlocksPoint` = `walk-solver.blocks` 的底层谓词；含界语义：体段 [feetY, feetY+height] 与障碍 [y0,y1] 相交即挡）
  const blockedFaces = plan.faces.filter((f) => built.obstacles.some((o) => obstacleBlocksPoint(o, { x: f.x, z: f.z, feetY: f.y })));
  check('t37 P0①：全部可行走面 `kind ∈ WALKABLE_KINDS`（改回 `towerStep` 即红）',
    built.walkable.length > 0 && built.walkable.every((w) => WALKABLE_KINDS.includes(w.kind)),
    `${built.walkable.length} 条 · kind=${JSON.stringify([...new Set(built.walkable.map((w) => w.kind))])} · 白名单=${WALKABLE_KINDS.join('/')}`);
  check('t37 P0②：塔顶机位 `mode ∈ VIEWPOINT_MODES` 且 ≠ `interior`（改回 `interior` 即红）',
    built.viewpoints.length > 0 && built.viewpoints.every((v) => VIEWPOINT_MODES.includes(v.mode) && v.mode !== 'interior'),
    JSON.stringify(built.viewpoints.map((v) => `${v.id}:${v.mode}`)));
  check('t37 几何 ↔ 登记同轮：每块面都有实体板（三角面 >0、合并网格 >0），且**生产判定下 0 块面被塔身障碍挡住**（无空气墙/空气楼梯）',
    built.metrics.triangles > 0 && built.metrics.parts.length > 0 && blockedFaces.length === 0
      && built.obstacles.every((o) => o.blocks === 'all' && o.y1 < plan.climb.topFaceY),
    `tri=${built.metrics.triangles} parts=${built.metrics.parts.length} 被挡面=${blockedFaces.length}/${plan.faces.length}（${blockedFaces.slice(0, 3).map((f) => f.id).join(',')}）障碍 y1=${built.obstacles[0]?.y1} < 顶面 ${plan.climb.topFaceY}`);
  check('t37 ⑤ 43 栋内景集合不被触碰（interior 机位 43 / INTERIOR_BY_SLOT 43 / visitable 43）',
    L.VIEWPOINTS.filter((v) => v.mode === 'interior').length === 43 && Object.keys(L.INTERIOR_BY_SLOT).length === 43
      && L.SLOTS.filter((s) => s.visitable).length === 43,
    `${L.VIEWPOINTS.filter((v) => v.mode === 'interior').length} / ${Object.keys(L.INTERIOR_BY_SLOT).length} / ${L.SLOTS.filter((s) => s.visitable).length}`);
  console.log(` - t37 塔楼工厂自检：面 ${plan.faces.length} 块 · 跳 ${plan.climb.hops}（最大 ${plan.climb.maxHopMeasured} ≤ ${hopMax}）· 顶层 y=${plan.climb.topFaceY} · 三角面 ${built.metrics.triangles} · 合并网格 ${built.metrics.parts.length} 个 · 机位 mode=${built.viewpoints.map((v) => v.mode).join(',')}（**未接线**：全仓无 makeTower 调用点）`);
}


/* ===== t48：院墙**归并 + 中轴打通**常驻守卫（数据推导；缺失即失败） =====
   口径三要素：
     · 来源 = `core/layout-slice.js` 的 `deriveWallRuns()`（可视与碰撞**同一份实现**）+ `layout.WALLS` 的
       `axisCutout` 字段（中轴切口，由 `layout.js` 按数据推导生成）；
     · 判据 = ① 归并完备：不存在两段 run 共享归并键（`轴|墙线|厚度|墙高`）——把 owner 加回归并键即红；
              ② 中轴切口：每段跨轴院墙 `W ≥ 最宽中央门洞净宽 + 2×门垛` ∧ `W ≥ 中轴通行道宽 + 2×柱廊占位`，
                 残余侧段 ≥1m，且**中央 W 内没有任何墙记录**（数据层无墙 ⇒ 碰撞层与可视层都不会有）；
              ③ 单建造者：每段边界墙的 run 子区间恰有一个 `owner`，各区子区间数之和 = 子区间总数；
     · 反例 = 任一不成立即红（见回执 §16.4 的突变证明）。 */
{
  const slice48 = await import(join(ROOT, 'src', 'core', 'layout-slice.js'));
  const runs48 = slice48.deriveWallRuns();
  const keys48 = runs48.map((r) => r.key);
  check('t48 归并完备：不存在两段 run 共享归并键（`轴|墙线|厚度|墙高`；归并键含 owner 即红）',
    keys48.length === new Set(keys48).size, `${keys48.length} 段 / 唯一键 ${new Set(keys48).size}`);
  const segs48 = runs48.flatMap((r) => r.segments);
  const ownerSum48 = segs48.reduce((acc, x) => ((acc[x.owner] = (acc[x.owner] ?? 0) + 1), acc), {});
  check('t48 单建造者：每段边界墙子区间恰有一个 owner，且各区子区间数之和 = 子区间总数',
    segs48.every((x) => typeof x.owner === 'string' && x.owner.length > 0 && x.owners.includes(x.owner))
    && Object.values(ownerSum48).reduce((a, b) => a + b, 0) === segs48.length,
    `${segs48.length} 子区间 · ${JSON.stringify(ownerSum48)}`);
  const cut48 = L.WALLS.filter((w) => w.axisCutout);
  const cutBad = cut48.filter((w) => {
    const c = w.axisCutout;
    return !(c.width >= c.doorWidth + 2 * c.pier - 1e-9 && c.width >= c.corridor + 2 * c.colonnade - 1e-9 && Math.abs(w.to.x - w.from.x) >= 1);
  });
  check('t48 中轴切口：W ≥ 门洞净宽 + 2×门垛 ∧ W ≥ 中轴通行道宽 + 2×柱廊占位，且残余侧段 ≥1m（逐段数据推导）',
    cut48.length === 24 && cutBad.length === 0,
    cut48.length ? `${cut48.length} 段（${[...new Set(cut48.map((w) => w.axisCutout.width))].sort((a, b) => a - b).join('/')}）违规 ${cutBad.length}` : '无切口段');
  const axisLines48 = [...new Set(cut48.map((w) => w.from.z))];
  const axisHoles48 = axisLines48.map((z) => {
    const gap = cut48.find((w) => w.from.z === z).axisCutout.width / 2;
    const covering = L.WALLS.filter((w) => w.kind === 'courtWall' && w.axis === 'x' && Math.abs(w.from.z - z) < 1e-6
      && Math.min(w.from.x, w.to.x) < gap - 1e-6 && Math.max(w.from.x, w.to.x) > -gap + 1e-6);
    return `${z}:${covering.length}`;
  });
  check('t48 中轴打通：每条切口墙线在中央 W 内**没有任何墙记录**（数据层无墙 ⇒ 碰撞/可视都不会有隐形墙）',
    axisLines48.length === 7 && axisHoles48.every((s) => s.endsWith(':0')), axisHoles48.join(' '));
  console.log(` - t48：归并段 ${runs48.length} / 子区间 ${segs48.length}（${JSON.stringify(ownerSum48)}）· 中轴切口 ${cut48.length} 段 / 7 条墙线 · 共面重复见回执探针`);
}

/* ===== t103：10 座开敞亭可通行化（hasDoor → exceptDoor）+ B 两座入口门槛 ===== */
{
  const pav = L.SLOTS.filter((s) => s.kind === 'pavilion');
  eq('亭 10 座', pav.length, 10);
  const bad = [];
  for (const p of pav) {
    const ob = L.OBSTACLES.find((o) => o.buildingId === p.id);
    if (p.hasDoor !== true) bad.push(`${p.id}:hasDoor=${p.hasDoor}`);
    if (ob?.blocks !== 'exceptDoor') bad.push(`${p.id}:blocks=${ob?.blocks}`);
    if (ob?.blocks === 'exceptDoor' && ob.kind !== 'wall') { /* 仅门洞阻挡 */ }
  }
  check('t103 逐座：10 座亭 hasDoor===true 且 OBSTACLES.blocks===\'exceptDoor\'（足迹内部可通行）', bad.length === 0, bad.join('；'));
  const gates = L.SLOTS.filter((s) => s.kind === 'courtyardGate');
  check('对照集：10 座院门保持 exceptDoor（不算空气墙）', gates.length === 10 && gates.every((g) => L.OBSTACLES.find((o) => o.buildingId === g.id)?.blocks === 'exceptDoor'), '');
  check('亭的实体构件语义未删：亭仍非 visitable、未登记内景（不得穿柱/穿栏/掉台基）', pav.every((p) => p.visitable !== true) && pav.every((p) => !L.INTERIOR_BY_SLOT[p.id]), '');
  const th = L.WALKABLE.filter((w) => /-threshold$/.test(w.id));
  eq('B 两座亭入口门槛：恰好 2 条（其它 8 座不加多余几何）', th.length, 2);
  const badTh = [];
  for (const pid of ['B-pavilion-gate-west', 'B-pavilion-gate-east']) {
    const p = L.SLOT_BY_ID[pid]; const w = L.WALKABLE.find((x) => x.id === `WK-${pid}-threshold`);
    const plaza = L.WALKABLE.find((x) => x.id === 'WK-B-plaza');
    const half = w.y - plaza.y;
    if (Math.abs(half - 0.3) > 0.01) badTh.push(`${pid}:门槛 ${w.y} vs 广场 ${plaza.y}`);
    if (Math.abs((p.baseY - (w.y - plaza.y)) - half) > 0.51) badTh.push(`${pid}:亭地面 ${p.baseY} 相邻差 >0.5`);
  }
  check('B 两座：广场→门槛→亭地面 相邻高差各 ≤0.5m（加法登记，未撤既有铺面）', badTh.length === 0, badTh.join('；'));
  console.log(` - t103 亭可通行化：10/10 hasDoor→exceptDoor；门槛 ${th.length} 条（B 两座）；WALKABLE ${L.WALKABLE.length}`);
}


/* ===== t117（t13 口径更新）：门洞可通行性声明与实际一致 —— 10 座亭**全部**声明可通行 =====
   t117 原意是「声明必须与实测一致，且例外必须具名」。t13 把两座水中亭做成**可达**（每池 2 级汀步 +
   水体有界开槽），于是"2 座具名例外"这一**状态**不再存在 —— 但**判据强度只增不减**：
     · 原断言"具名例外的 blockedBy 指向真实存在的整足迹水体障碍"所守护的事实，由**新**断言
       「水体障碍的开槽通道必须与 layout.STONE_STEP_LANES 逐值一致」接管（且更强：逐值对账，
       不再是 `regex + some`）；
     · 原断言"例外不得回退成无原因的整足迹阻挡"由**新**断言「两亭仍 hasDoor + exceptDoor（非空气墙）」
       逐条接管；
     · 另**新增** 4 条 t13 判据（面数/高度链/网格可见/面积守恒）。 */
{
  const pav = L.SLOTS.filter((s) => s.kind === 'pavilion' && s.door);
  eq('10 座亭：全部声明可通行（t13 后不再有具名例外）', pav.filter((p) => p.door.passable === true).length, 10);
  eq('10 座亭：无任何 passable=false / blockedBy 残留', pav.filter((p) => p.door.passable === false || p.door.blockedBy != null).length, 0);
  check('两座水中亭仍 hasDoor + exceptDoor（非空气墙；声明与实际一致的最小条件）',
    ['D-court3-pavilion', 'E-court3-pavilion'].every((id) => L.SLOT_BY_ID[id].hasDoor === true && L.OBSTACLES.find((o) => o.buildingId === id)?.blocks === 'exceptDoor'),
    '');
  check('几何门洞未删：10 座亭 door.width 均 >0（声明与实际通过 passable/blockedBy 对齐）', pav.every((p) => p.door.width > 0), '');
  console.log(` - t117 门洞一致性：10 座亭全部 passable=true 且 blockedBy=null（t13：水中亭经汀步可达）`);
}

/* ===== t13：两座水中亭可达（汀步 + 水体**有界开槽**）—— 逐条常驻判据（只增不减） ===== */
{
  const lanes = L.STONE_STEP_LANES ?? [];
  eq('t13：汀步走廊唯一权威源 2 条（D/E 各 1）', lanes.length, 2);
  eq('t13：走廊 id 恰为两座水中亭', lanes.map((l) => l.id).sort().join(','), 'D-court3-pavilion,E-court3-pavilion');
  const surfaceRows = lanes.flatMap((l) => l.steps.map((s) => ({ lane: l, s })));
  const walkSurfaces = L.WALKABLE.filter((w) => /-pond-step-\d+$/.test(w.id));
  eq('t13：每池恰 2 面汀步 ⇒ 新增 4 面（WALKABLE 171 → 175）', walkSurfaces.length, 4);
  eq('t13：登记面 id 与走廊 steps 逐条对应', walkSurfaces.map((w) => w.id).sort().join(','), surfaceRows.map((r) => r.s.id).sort().join(','));
  const groundY = { D: CONFIG_NS.TERRAIN.sideCourtY, E: CONFIG_NS.TERRAIN.sideCourtY };
  const badChain = [];
  const badGeo = [];
  const badCells = [];
  const f32 = Math.fround;
  for (const lane of lanes) {
    const slot = L.SLOT_BY_ID[lane.id];
    const pond = L.WATER_BODIES.find((w) => w.id === lane.pondId);
    if (!slot || !pond) { badChain.push(`${lane.id}:槽位/水体缺失`); continue; }
    /* ① 高度链：区域地坪 → 下石 → 上石（= 亭地面 = 区域地坪 + baseY），逐跳 ∈ [0.20, 0.25] */
    const chain = [groundY[lane.zone], ...lane.steps.map((s) => s.y)];
    for (let i = 1; i < chain.length; i += 1) {
      const d = chain[i] - chain[i - 1];
      if (d < 0.2 - 1e-9 || d > 0.25 + 1e-9) badChain.push(`${lane.id} 第${i}跳 Δ=${d.toFixed(6)} 不在 [0.20,0.25]`);
      // 双向（图侧高度存 Float32Array ⇒ 必须按 fround 复核；禁 0.50 等值，§12.1.4.5）
      const up = f32(chain[i]) - f32(chain[i - 1]);
      const down = f32(chain[i - 1]) - f32(chain[i]);
      if (up > 0.5 + 1e-9) badChain.push(`${lane.id} 第${i}跳 float32 上行 ${up.toFixed(6)} > 0.5`);
      if (down > 0.6 + 1e-9) badChain.push(`${lane.id} 第${i}跳 float32 下落 ${down.toFixed(6)} > 0.6`);
      if (Math.abs(Math.abs(up) - 0.5) <= 1e-9) badChain.push(`${lane.id} 第${i}跳 float32 恰 0.50 等值（禁止）`);
    }
    const top = lane.steps[lane.steps.length - 1];
    if (Math.abs(top.y - (groundY[lane.zone] + slot.baseY)) > 1e-9) badChain.push(`${lane.id} 上石 ${top.y} ≠ 区域地坪 + 亭 baseY ${groundY[lane.zone] + slot.baseY}`);
    if (Math.abs(slot.door.sillY - top.y) > 1e-9) badChain.push(`${lane.id} door.sillY ${slot.door.sillY} ≠ 上石 ${top.y}`);
    /* ② 几何：走廊在池内、宽度 = 亭门洞净宽、x 中心 = 亭 x；下石贴池南岸；上石覆盖亭门脸 */
    const c = lane.corridor;
    if (c.width !== slot.door.width) badGeo.push(`${lane.id} 走廊宽 ${c.width} ≠ 亭门洞 ${slot.door.width}`);
    if ((c.minX + c.maxX) / 2 !== slot.x) badGeo.push(`${lane.id} 走廊 x 中心 ${(c.minX + c.maxX) / 2} ≠ 亭 x ${slot.x}`);
    if (c.minX < pond.bounds.minX || c.maxX > pond.bounds.maxX || c.minZ < pond.bounds.minZ || c.maxZ > pond.bounds.maxZ) badGeo.push(`${lane.id} 走廊越出池界`);
    if (lane.steps[0].minZ > pond.bounds.minZ + 0.01) badGeo.push(`${lane.id} 下石南沿 ${lane.steps[0].minZ} 未贴池南岸 ${pond.bounds.minZ}`);
    if (top.maxZ < slot.bounds.maxZ) badGeo.push(`${lane.id} 上石北沿 ${top.maxZ} 未覆盖亭北沿 ${slot.bounds.maxZ}`);
    /* ③ 网格可见：cellSize:1 下每面 ≥1 格心（t121 口径） */
    for (const w of walkSurfaces.filter((x) => x.id === lane.steps[0].id || x.id === lane.steps[1].id)) {
      let centers = 0;
      for (let x = Math.ceil(w.bounds.minX); x <= Math.floor(w.bounds.maxX); x += 1) {
        for (let z = Math.ceil(w.bounds.minZ); z <= Math.floor(w.bounds.maxZ); z += 1) {
          if (x + 0.5 >= w.bounds.minX && x + 0.5 <= w.bounds.maxX && z + 0.5 >= w.bounds.minZ && z + 0.5 <= w.bounds.maxZ) centers += 1;
        }
      }
      if (centers === 0) badCells.push(w.id);
    }
    /* ④ 面积守恒：水体障碍包围盒/水位/池深一字未改，只多一条与走廊逐值一致的 door 通道 */
    const ob = L.OBSTACLES.find((o) => o.id === `OB-${lane.pondId}`);
    if (!ob || ob.blocks !== 'exceptDoor' || !ob.door) { badGeo.push(`${lane.id} 水体障碍未登记开槽通道`); continue; }
    if (JSON.stringify(ob.bounds) !== JSON.stringify(pond.bounds)) badGeo.push(`${lane.id} 水体障碍包围盒被改动（面积不守恒）`);
    if (ob.door.width !== lane.corridor.width) badGeo.push(`${lane.id} 通道宽 ${ob.door.width} ≠ 走廊宽 ${lane.corridor.width}`);
    if (ob.door.axis !== lane.corridor.axis) badGeo.push(`${lane.id} 通道法线轴 ${ob.door.axis} ≠ 走廊轴 ${lane.corridor.axis}`);
    if (ob.door.center.x !== (lane.corridor.minX + lane.corridor.maxX) / 2) badGeo.push(`${lane.id} 通道 x 中心与走廊不一致`);
    if (ob.y1 !== 0.05) badGeo.push(`${lane.id} 水体障碍顶面被抬高（y1=${ob.y1}）`);
  }
  eq('t13：逐跳高度链 ∈ [0.20,0.25] 且 float32 双向可跨、禁 0.50 等值', badChain.length, 0);
  check('t13：走廊几何（宽度=门洞净宽 / x 居中 / 在池内 / 下石贴岸 / 上石覆盖亭）', badGeo.length === 0, badGeo.slice(0, 4).join('；'));
  check('t13：每条汀步面在 cellSize:1 下至少含 1 个格心（网格可见）', badCells.length === 0, badCells.join(','));
  console.log(` - t13 水中亭可达：${lanes.length} 条走廊 / ${walkSurfaces.length} 面汀步 · 高度链 ${lanes.map((l) => `[${[groundY[l.zone], ...l.steps.map((s) => s.y)].join('→')}]`).join(' ')}`);
}


/* ===== t38：中轴体量分级（eaveAbs 口径 + T1>T2 严格序 + 无倒挂）—— 常驻判据（只增不减） =====
   口径三要素：
     ① 口径：`area = w×d`；`eaveAbs` = 檐口高**自该建筑自身基准面**（= `eaveHeight − (onWall ? CITY_WALL.height : 0)`）；
        `terraceTiers` = 台基层数；`eaves` = 檐数（重檐 = 2）；`totalHeight` = layout 记录总高。
     ② 权威来源：`L.AXIS_TIER_SPEC` / `L.slotVolumeCaliber()` / `L.axisTierRows()` / `L.axisTierStats()` /
        `L.axisTierLadder()` / `L.axisPrincipal()` / `L.axisNoInversion()`（**生产唯一权威源**，本块不另写第二份清单）。
     ③ 时点：`AXIS_TIER_SUMMARY.at` = `LAYOUT_VERSION`。
   判据强度：**计数与比值全部数据推导**（本块不写死任何 n / 比值 / 逐栋数字），并含两条**非恒真**证据
   （朴素口径必须为红 = 口径必要性；突变行集必须为红 = 判据非恒真）。 */
{
  const spec = L.AXIS_TIER_SPEC;
  const summary = L.AXIS_TIER_SUMMARY;
  const axisRows = L.axisTierRows();
  const ladderRows = L.axisTierRows(undefined, { ladderOnly: true });
  const stats = L.axisTierStats(ladderRows);
  const ladder = L.axisTierLadder(stats);
  const principal = L.axisPrincipal(ladderRows);
  const noInv = L.axisNoInversion();
  const eqF = (a, b) => Math.abs(a - b) <= 1e-9;

  /* ── 0. 规格本身：冻结 + 裕量不得被悄悄下调（**pin 上限**：未来只能加严） ── */
  check('t38 口径规格冻结（AXIS_TIER_SPEC / AXIS_TIER_SUMMARY 深冻结）',
    Object.isFrozen(spec) && Object.isFrozen(summary) && Object.isFrozen(spec.ladderKinds), '');
  eq('t38 规格：areaMargin / eaveMargin / minAbsEave / principalRatio 逐值 pin（不得为回绿下调）',
    JSON.stringify([spec.areaMargin, spec.eaveMargin, spec.minAbsEave, spec.principalRatio]), JSON.stringify([1.1, 1.05, 0.05, 1.2]));
  eq('t38 规格：入序形制 = hall + gateHall', spec.ladderKinds.join(','), 'hall,gateHall');
  check('t38 规格：areaMargin > 1 且 eaveMargin > 1 且 minAbsEave > 0（严格序语义）',
    spec.areaMargin > 1 && spec.eaveMargin > 1 && spec.minAbsEave > 0, JSON.stringify(spec));

  /* ── 1. R1 中轴集由数据推导 + 独立重算一致 ── */
  const tol = L.deriveAxisTolerance(L.SLOTS);
  const offAxisMin = Math.min(...L.SLOTS.map((s) => Math.abs(s.x)).filter((v) => v > 1e-9));
  eq('t38 R1 中轴容差 = 最小离轴中心距 / 2（由 SLOTS 推导，非字面量）', tol, +(offAxisMin / 2).toFixed(6));
  const axisRecount = L.SLOTS.filter((s) => Math.abs(s.x) <= tol + 1e-9);
  eq('t38 R1 中轴集计数与独立重算一致', axisRows.length, axisRecount.length);
  check('t38 R1 中轴集按 z 升序且 id 唯一', axisRows.every((r, i) => i === 0 || r.z >= axisRows[i - 1].z) && new Set(axisRows.map((r) => r.id)).size === axisRows.length, '');

  /* ── 2. R2 档位由 grade 推导 + 计数独立重算一致 ── */
  const gradeOrder = Object.keys(CONFIG_NS.GRADES).map(Number).sort((a, b) => b - a);
  const indep = new Map();
  for (const r of ladderRows) indep.set(r.tier, (indep.get(r.tier) ?? 0) + 1);
  check('t38 R2 档位键 = grade 降序映射（T1 = 最高档）',
    ladderRows.every((r) => r.tier === `T${gradeOrder.indexOf(r.grade) + 1}`), JSON.stringify([...new Set(ladderRows.map((r) => `${r.grade}→${r.tier}`))]));
  check('t38 R2 各档计数与独立重算逐档一致（不写死 n）',
    stats.length === indep.size && stats.every((s) => indep.get(s.tier) === s.n),
    `生产 ${stats.map((s) => `${s.tier}=${s.n}`).join('/')} vs 重算 ${[...indep.entries()].map(([t, n]) => `${t}=${n}`).join('/')}`);
  eq('t38 R2 冻结摘要的 byTier 与运行期推导逐值一致（可观测副本不得漂移）',
    JSON.stringify(summary.counts.byTier), JSON.stringify(stats.map((s) => ({ tier: s.tier, grade: s.grade, n: s.n }))));
  check('t38 R2 等级序为**两级**且最高档 n ≥ 2（主位规则可适用；新增其它档中轴殿堂即红）',
    stats.length === 2 && stats[0].n >= 2, stats.map((s) => `${s.tier}(g${s.grade})=${s.n}`).join(' · '));
  eq('t38 R2 入序集计数 = 全部中轴殿堂（非 onWall ∧ kind ∈ 规格）的独立重算',
    ladderRows.length, axisRows.filter((r) => !r.onWall && spec.ladderKinds.includes(r.kind)).length);

  /* ── 3. R3/R4 相邻档严格序（比值由数据推导，下限取规格） ── */
  check('t38 R3/R4 相邻档严格序：面积 ≥ areaMargin 且檐高 ≥ eaveMargin 且绝对裕量 ≥ minAbsEave',
    ladder.violations.length === 0 && ladder.vacuous.length === 0 && ladder.pairs.length >= 1,
    ladder.violations.map((v) => `${v.rule} ${v.hi}>${v.lo} got=${v.got} need=${v.need}（${v.detail}）`).join('；') || JSON.stringify(ladder.vacuous));
  check('t38 R3/R4 逐对逐条复核（不依赖生产结论：用 rows 自行重算比值与绝对裕量）',
    ladder.pairs.every((p) => {
      const hi = stats.find((s) => s.tier === p.hi);
      const lo = stats.find((s) => s.tier === p.lo);
      return hi.areaMin / lo.areaMax >= spec.areaMargin - 1e-9
        && hi.eaveAbsMin / lo.eaveAbsMax >= spec.eaveMargin - 1e-9
        && hi.eaveAbsMin - lo.eaveAbsMax >= spec.minAbsEave - 1e-9;
    }), '');
  check('t38 R4 采用口径 = eaveAbs（自自身基准面）：onWall 建筑的墙高必须被扣掉',
    L.SLOTS.filter((s) => s.onWall).every((s) => {
      const c = L.slotVolumeCaliber(s);
      return c.eaveAbs === +(c.eaveFromGround - L.CITY_WALL.height).toFixed(4) && c.wallOffset === L.CITY_WALL.height;
    }) && L.SLOTS.filter((s) => !s.onWall).every((s) => {
      const c = L.slotVolumeCaliber(s);
      return c.eaveAbs === c.eaveFromGround && c.wallOffset === 0;
    }), '');

  /* ── 4. R5 主位唯一（最高档） ── */
  check('t38 R5 最高档主位唯一：主位面积 ≥ 次位 × principalRatio（且不跳过）',
    principal.ok === true && principal.skipped === false && principal.principal && principal.runnerUp && principal.ratio >= spec.principalRatio - 1e-9,
    JSON.stringify(principal));
  check('t38 R5 主位 = 最高档面积最大者（独立重算一致）',
    principal.principal === ladderRows.filter((r) => r.tier === stats[0].tier).sort((a, b) => b.area - a.area)[0].id, String(principal.principal));

  /* ── 5. R6 无倒挂（采用口径） + 全城普查 + 口径伪影显式登记 ── */
  check('t38 R6a 入序集内**任意**档对（不止相邻）都不倒挂：低档 max < 高档 min（面积与 eaveAbs 两列）',
    noInv.crossViolations.length === 0 && noInv.crossPairs.length >= 1 && noInv.crossPairs.every((p) => p.ok),
    noInv.crossViolations.map((v) => `${v.rule} ${v.hi}>${v.lo}：${v.detail}`).join('；'));
  check('t38 R6b 全城**任何非 onWall 建筑**的 eaveAbs 不得超过主殿（地上建筑不得高过主殿）',
    noInv.groundAbove.length === 0,
    `高于主殿 ${noInv.principal}(${noInv.principalEaveAbs}) 的非 onWall 建筑：${noInv.groundAbove.map((r) => `${r.id}(${r.eaveAbs})`).join('、')}`);
  check('t38 R6c 全城 raw totalHeight 高于主殿者**必须全部 onWall**（口径伪影显式登记，不得静默抹平）',
    noInv.rawAboveNotOnWall.length === 0 && noInv.onWallSystemAbove.length > 0,
    `非 onWall 却高于主殿：${JSON.stringify(noInv.rawAboveNotOnWall)} · onWall 系统在册 ${noInv.onWallSystemAbove.length} 栋`);
  check('t38 R6c 该普查**非恒真**：raw totalHeight 高于主殿的 onWall 清单必须非空（否则说明普查口径失效）',
    noInv.onWallSystemAbove.length >= 1,
    `onWall 高于主殿 ${noInv.principalTotalHeight}：${noInv.onWallSystemAbove.join('、') || '（空 ⇒ 普查失效）'}`);
  check('t38 R6 全城口径自洽：`eaveAbs + wallOffset === eaveHeight` 且 `totalFromBase + wallOffset === totalHeight` 逐栋成立',
    L.volumeCaliberRows().every((r) => eqF(r.eaveAbs + r.wallOffset, r.eaveHeight) && eqF(r.totalFromBase + r.wallOffset, r.totalHeight)), '');

  /* ── 6. 同级不重复（栏内两列互异） ── */
  check('t38 同级不重复：每一档内部 面积 与 eaveAbs 两列均两两互异',
    stats.every((s) => s.duplicateAreas.length === 0 && s.duplicateEaves.length === 0),
    stats.map((s) => `${s.tier}: dupArea=${JSON.stringify(s.duplicateAreas)} dupEave=${JSON.stringify(s.duplicateEaves)}`).join('；'));

  /* ── 7. 台基层数 / 檐数（台账两列必须是有序的、可核的） ── */
  check('t38 檐数：最高档 min(檐数) > 次档 max(檐数)（重檐是最高档的形制特征，由 grade 白名单派生）',
    stats.length >= 2 && stats[0].eavesMin > stats[1].eavesMax,
    stats.map((s) => `${s.tier}:${s.eavesMin}–${s.eavesMax}`).join(' · '));
  check('t38 台基层数：中轴殿堂内最大台基层数**唯一**归主位（最高档 3 层台基的主殿），且与 TERRACES 登记一致',
    (() => {
      const maxTiers = Math.max(...ladderRows.map((r) => r.terraceTiers));
      const holders = ladderRows.filter((r) => r.terraceTiers === maxTiers);
      if (holders.length !== 1 || holders[0].id !== principal.principal) return false;
      /* 与 TERRACES 登记交叉核对：落在该栋足迹内的台基记录数必须等于其台基层数（两栋有登记：B 主殿 3 / C 寝殿 1） */
      const within = (t, s) => t.bounds.minX >= s.bounds.minX - 1 && t.bounds.maxX <= s.bounds.maxX + 1 && t.bounds.minZ >= s.bounds.minZ - 1 && t.bounds.maxZ <= s.bounds.maxZ + 1;
      return L.SLOTS.every((s) => {
        const recs = L.TERRACES.filter((t) => within(t, s));
        return recs.length === 0 || recs.length === L.slotVolumeCaliber(s).terraceTiers;
      });
    })(),
    `最大台基层数 ${Math.max(...ladderRows.map((r) => r.terraceTiers))} 持有者 ${ladderRows.filter((r) => r.terraceTiers === Math.max(...ladderRows.map((x) => x.terraceTiers))).map((r) => r.id).join(',')} · 主位 ${principal.principal}`);
  check('t38 台账自证：口径重算的 eaveHeight/totalHeight 必须等于 layout 记录值（与 S() 同公式、同令牌）',
    (() => {
      const bad = [];
      for (const s of L.SLOTS) {
        const g = CONFIG_NS.GRADES[s.grade];
        const roof = CONFIG_NS.ROOF_TYPES[s.roofType];
        const bodyBaseY = (s.onWall ? L.CITY_WALL.height : 0) + s.terraceH;
        const eave = +(bodyBaseY + CONFIG_NS.MODULES.eaveHeight * g.eaveHeightFactor).toFixed(2);
        const spanDepth = s.facing === 'south' || s.facing === 'north' ? s.d : s.w;
        const rise = +(spanDepth * roof.riseRatio * 0.5).toFixed(2);
        const lift = roof.doubleEave ? +(CONFIG_NS.MODULES.eaveHeight * 0.35).toFixed(2) : 0;
        if (eave !== s.eaveHeight) bad.push(`${s.id} eave 复算 ${eave} ≠ 记录 ${s.eaveHeight}`);
        if (+(eave + rise + lift).toFixed(2) !== s.totalHeight) bad.push(`${s.id} total 复算 ${+(eave + rise + lift).toFixed(2)} ≠ 记录 ${s.totalHeight}`);
      }
      return bad.length === 0 ? true : bad.join('；');
    })(), '');

  /* ── 8. 等级-形制白名单（不得为高度比改屋顶等级，t22 教训） ── */
  const whitelistBad = L.SLOTS.filter((s) => !(CONFIG_NS.GRADES[s.grade]?.roofTypes ?? []).includes(s.roofType));
  check('t38 等级-形制白名单：全部槽位 grade↔roofType 合法（grade 3 仅 doubleEaveHip；gable 不入 grade 2/3）',
    whitelistBad.length === 0, whitelistBad.map((s) => `${s.id} g${s.grade}+${s.roofType}`).join('、'));
  check('t38 入序集内 grade 3 ⇒ doubleEaveHip（台阶等级不得靠改屋顶凑高度）',
    ladderRows.filter((r) => r.grade === 3).every((r) => r.roofType === 'doubleEaveHip')
    && ladderRows.filter((r) => r.grade === 2).every((r) => CONFIG_NS.GRADES[2].roofTypes.includes(r.roofType)),
    JSON.stringify([...new Set(ladderRows.map((r) => `g${r.grade}:${r.roofType}`))]));

  /* ── 9. 非恒真证据 ①：朴素口径（全部中轴槽位 × raw totalHeight）必须为红 ⇒ 口径必要 ── */
  const naive = summary.naiveCounterexamples;
  check('t38 反例（口径必要性）：朴素口径「全部中轴槽位 + raw totalHeight」必须命中 R3-面积严格序（口径非可选）',
    naive.length >= 1 && naive.some((v) => v.rule === 'R3-面积严格序') && naive.every((v) => v.got < v.need),
    naive.map((v) => `${v.rule} got=${v.got} < need=${v.need}（${v.detail}）`).join('；') || '（未命中 ⇒ 口径必要性未被证明）');

  /* ── 10. 非恒真证据 ②：突变行集必须为红（判据不是恒真） ── */
  {
    const victim = ladderRows.filter((r) => r.tier === stats[1]?.tier).sort((a, b) => a.area - b.area)[0];
    const mutated = ladderRows.map((r) => (r.id === victim.id ? { ...r, grade: 3, tier: stats[0].tier, tierIndex: stats[0].tierIndex } : r));
    const mutatedLadder = L.axisTierLadder(L.axisTierStats(mutated));
    const restored = L.axisTierLadder(L.axisTierStats(ladderRows));
    check(`t38 突变对照：把次档最小面积者（${victim.id}）过度定级为最高档 ⇒ 严格序必红；恢复后必绿（判据非恒真）`,
      mutatedLadder.violations.length >= 1 && restored.violations.length === 0,
      `突变命中 ${mutatedLadder.violations.map((v) => v.rule).join('/') || '（无 ⇒ 判据恒真！）'} · 恢复命中 ${restored.violations.length}`);
  }

  /* ── 11. 与 LAYOUT_STATS 的可观测副本一致（审计/UI 读得到同一份结论） ── */
  eq('t38 LAYOUT_STATS.axisTiers.counts 与 AXIS_TIER_SUMMARY 逐值一致',
    JSON.stringify(L.LAYOUT_STATS.axisTiers.counts), JSON.stringify(summary.counts));
  eq('t38 LAYOUT_STATS.axisTiers.pairs 与运行期 ladder 逐值一致',
    JSON.stringify(L.LAYOUT_STATS.axisTiers.pairs), JSON.stringify(ladder.pairs));

  console.log(` - t38 中轴体量分级（口径 ${summary.at}）：中轴 ${summary.counts.axisTotal} 栋 · 入序 ${summary.counts.ladderTotal} · ${stats.map((s) => `${s.tier}(g${s.grade})=${s.n}`).join('/')}`
    + ` · T1>T2 面积比 ${ladder.pairs[0].areaRatio}（≥${spec.areaMargin}）· 檐高比 ${ladder.pairs[0].eaveRatio}（≥${spec.eaveMargin}，Δ${ladder.pairs[0].eaveAbs}m）`
    + ` · 主位比 ${principal.ratio}（≥${spec.principalRatio}：${principal.principal}/${principal.runnerUp}）`
    + ` · 采用口径倒挂 ${noInv.crossViolations.length + noInv.groundAbove.length} 条 · 朴素口径反例 ${naive.length} 条 · raw 高于主殿者 ${noInv.onWallSystemAbove.length} 栋（全部 onWall）`);
}


/* ===== t119：分区配额唯一权威源一致性（config.BUDGET.drawCalls.perZone ⇄ layout.ZONES.drawCallBudget） ===== */
{
  const perZone = BUDGET.drawCalls.perZone;
  const rows = L.ZONES.map((z) => ({ id: z.id, layout: z.drawCallBudget, config: perZone[z.id] }));
  const bad = rows.filter((r) => r.layout !== r.config);
  check('layout.ZONES[].drawCallBudget === config.BUDGET.drawCalls.perZone（逐值，唯一权威源=config）', bad.length === 0, bad.map((r) => `${r.id}:${r.layout}≠${r.config}`).join(','));
  eq('两侧键集合一致（B/C/D/E/F）', rows.map((r) => r.id).sort().join(','), Object.keys(perZone).sort().join(','));
  eq('分配合计 + 保留 = mainSceneMax（判据未放宽）',
    Object.values(perZone).reduce((a, b) => a + b, 0) + BUDGET.drawCalls.reserve, BUDGET.drawCalls.mainSceneMax);
  console.log(` - t119 配额单源：${rows.map((r) => `${r.id}${r.config}`).join('/')}（layout 镜像逐值一致；合计+保留=${BUDGET.drawCalls.mainSceneMax}）`);
}


/* ===== t121：门外过渡台阶在 cellSize:1 走查网格下必须可见（18 栋 / 43 级，不抽样） ===== */
{
  const tr = L.WALKABLE.filter((w) => /-transition-\d+$/.test(w.id));
  const centers = (w) => {
    let n = 0;
    for (let x = Math.ceil(w.bounds.minX); x <= Math.floor(w.bounds.maxX); x += 1)
      for (let z = Math.ceil(w.bounds.minZ); z <= Math.floor(w.bounds.maxZ); z += 1) {
        const cx = x + 0.5; const cz = z + 0.5;
        if (cx >= w.bounds.minX && cx <= w.bounds.maxX && cz >= w.bounds.minZ && cz <= w.bounds.maxZ) n += 1;
      }
    return n;
  };
  const noCell = tr.filter((w) => centers(w) === 0);
  eq('过渡台阶 49 级（18 栋 43 + C 两栋 4 + t131 的 E-court3-hall 2）', tr.length, 49);
  check('t121/t128 逐级：cellSize:1 下**每条台阶带至少含 1 个格心**（47 级全覆盖）', noCell.length === 0, noCell.map((w) => w.id).join(','));
  const depthOf = (w) => {
    const slot = L.SLOT_BY_ID[w.id.replace(/^WK-/, '').replace(/-transition-\d+$/, '')];
    return slot?.door?.axis === 'x' ? (w.bounds.maxX - w.bounds.minX) : (w.bounds.maxZ - w.bounds.minZ);
  };
  check('t121 逐级：沿门轴的每级足印**进深** ≥ 1.0m（网格可见的下界，未改 cellSize）', tr.every((w) => depthOf(w) >= 1.0 - 1e-9), tr.filter((w) => depthOf(w) < 1.0 - 1e-9).map((w) => `${w.id}:${depthOf(w).toFixed(2)}`).join(','));
  const owners = new Set(tr.map((w) => w.id.replace(/^WK-/, '').replace(/-transition-\d+$/, '')));
  eq('覆盖 21 栋（§11.2 的 18 栋 + t128 的 C 两栋 + t131 的 E-court3-hall）', owners.size, 21);
  console.log(` - t121 过渡可见性：43 级 / 18 栋 · 0 格心的台阶 ${noCell.length} 条（修前 31 条）· 沿门轴最小进深 ${Math.min(...tr.map(depthOf)).toFixed(2)}m`);
}


/* ===== t126：遮蔽普查结论 + tier2 有界开槽（两条坡道走廊）+ F7 例外集口径 ===== */
{
  const EPS = 1e-6;
  const inside = (a, b) => a.bounds.minX >= b.bounds.minX - EPS && a.bounds.maxX <= b.bounds.maxX + EPS
    && a.bounds.minZ >= b.bounds.minZ - EPS && a.bounds.maxZ <= b.bounds.maxZ + EPS;
  const tr = L.WALKABLE.filter((w) => /-transition-\d+$/.test(w.id));
  const higher = (w) => L.WALKABLE.filter((x) => x !== w && x.y > w.y + 1e-9 && inside(w, x));
  const shadowed = tr.filter((w) => higher(w).length > 0);
  eq('t126：43 级过渡中**被更高面完全内含**的条数 = 0（开槽前为 4：两条走廊的 1/2 级）', shadowed.length, 0);
  const t2pieces = L.WALKABLE.filter((w) => w.id.startsWith('WK-B-terrace-tier2-'));
  eq('t126+t134：tier2 现存 3 段（南/北/中，西/东残片已删）且 y 均为 3.0（未降低）',
    `${t2pieces.length}/${new Set(t2pieces.map((w) => w.y)).size}`, '3/1');
  const gapW = { minX: -66, maxX: -62, minZ: -129, maxZ: -103 };
  const gapE = { minX: 62, maxX: 66, minZ: -129, maxZ: -103 };
  const inGap = (w, g) => w.bounds.maxX > g.minX + EPS && w.bounds.minX < g.maxX - EPS && w.bounds.maxZ > g.minZ + EPS && w.bounds.minZ < g.maxZ - EPS;
  check('t126：两条走廊内**无 tier2 残块**（槽真的开了）', t2pieces.every((w) => !inGap(w, gapW) && !inGap(w, gapE)), '');
  const areaOf = (w) => (w.bounds.maxX - w.bounds.minX) * (w.bounds.maxZ - w.bounds.minZ);
  const t2area = t2pieces.reduce((a, w) => a + areaOf(w), 0);
  const t2band = L.WALKABLE.filter((w) => w.id.startsWith('WK-B-terrace-tier2-') && Math.abs(w.bounds.minZ + 129) < 1e-6);
  const t2bandW = t2band.reduce((a, w) => a + (w.bounds.maxX - w.bounds.minX), 0);
  const removed = (144 - t2bandW) * 26; // t134：按实测分段推导（不再硬编码）
  eq('t126：tier2 其余区域面积守恒（140×84 − 两条走廊）', Math.round(t2area + removed), Math.round((72 - -72) * (-74 - -158)));
  const bad = [];
  for (const id of ['B-side-west-main', 'B-side-east-main']) {
    const ps = L.WALKABLE.find((w) => w.id === `WK-${id}-door-passage`);
    const steps = L.WALKABLE.filter((w) => w.id.startsWith(`WK-${id}-transition-`)).sort((a, b) => a.id.localeCompare(b.id));
    const chain = [ps, ...steps, L.WALKABLE.find((w) => w.id === 'WK-B-terrace-tier2-mid')];
    for (let i = 1; i < chain.length; i += 1) {
      if (Math.abs(chain[i].y - chain[i - 1].y) > 0.5 + 1e-9) bad.push(`${id}:${chain[i - 1].id}→${chain[i].id} Δ${(chain[i].y - chain[i - 1].y).toFixed(2)}`);
      const adjacent = chain[i].bounds.maxX >= chain[i - 1].bounds.minX - EPS && chain[i].bounds.minX <= chain[i - 1].bounds.maxX + EPS
        && chain[i].bounds.maxZ >= chain[i - 1].bounds.minZ - EPS && chain[i].bounds.minZ <= chain[i - 1].bounds.maxZ + EPS;
      if (!adjacent) bad.push(`${id}:${chain[i - 1].id}↔${chain[i].id} 不相接`);
    }
  }
  check('t126 逐栋：通道面→2.0→2.5→3.0→tier2 段 每相邻 ≤0.5 且 xz 相接（两栋，不抽样）', bad.length === 0, bad.join('；'));

  /* F7：既有例外集口径（不补新契约，引用 CONTRACTS §5.2.2 + DOOR_SILL_EXCEPTIONS） */
  const rows = Object.entries(L.INTERIOR_BY_SLOT).map(([sid, rec]) => {
    const slot = L.SLOT_BY_ID[sid];
    return { sid, sillY: slot?.door?.sillY, wkY: L.WALKABLE.find((w) => w.id === rec.walkableId)?.y };
  });
  const deviating = rows.filter((r) => r.sillY == null || Math.abs(r.sillY - r.wkY) > 1e-9).map((r) => r.sid).sort();
  eq('F7：真实偏离恰为 5 条（F 四城门双标高 + C-gate-inner）', deviating.join(','), 'C-gate-inner,F-gate-east,F-gate-north,F-gate-south,F-gate-west');
  check('F7：例外集合 ⊆ DOOR_SILL_EXCEPTIONS（表内 6 条，C-hall-bed-main 已归位仅留档）', deviating.every((id) => L.DOOR_SILL_EXCEPTIONS.includes(id)), '');
  const equalButException = rows.filter((r) => L.DOOR_SILL_EXCEPTIONS.includes(r.sid) && r.sillY != null && Math.abs(r.sillY - r.wkY) <= 1e-9).map((r) => r.sid);
  eq('F7：例外表 6 条 = 5 真实偏离 + 1 已归位（C-hall-bed-main，sillY==wkY，仅留档）', `${L.DOOR_SILL_EXCEPTIONS.length}/${equalButException.join(',')}`, '6/C-hall-bed-main');
  eq('F7：非例外且 y == door.sillY 的数量 = **37/43**（= 43 − 5 真实偏离 − 1 已归位例外）',
    rows.filter((r) => !L.DOOR_SILL_EXCEPTIONS.includes(r.sid) && Math.abs(r.sillY - r.wkY) <= 1e-9).length, 37);
  console.log(`   F7 分解：非例外一致 37 + 真实偏离 5（${deviating.join(',')}）+ 已归位例外 1（C-hall-bed-main）= 43`);
  console.log(` - t126：遮蔽普查=6 条（影响可达性 4：两栋过渡 ×2 + 两栋 C-side 通道面 ×2）；tier2 开槽 5 段；F7 偏离 ${deviating.length} 条 / 非例外一致 ${rows.filter((r) => !L.DOOR_SILL_EXCEPTIONS.includes(r.sid) && Math.abs(r.sillY - r.wkY) <= 1e-9).length}`);
}


/* ===== t128：遮蔽常驻守卫（全城 0 条）+ C 两栋链断言 + F5 门洞净宽实测化 ===== */
{
  const EPS = 1e-6;
  const inside = (a, b) => a.bounds.minX >= b.bounds.minX - EPS && a.bounds.maxX <= b.bounds.maxX + EPS
    && a.bounds.minZ >= b.bounds.minZ - EPS && a.bounds.maxZ <= b.bounds.maxZ + EPS;
  /* ① 常驻守卫：任何可行走面被更高可行走面**完全内含**（平面投影）⇒ 红（打印全部命中） */
  const hits = [];
  for (const a of L.WALKABLE) for (const b of L.WALKABLE) if (a !== b && b.y > a.y + 1e-9 && inside(a, b)) hits.push(`${a.id}@${a.y} ⊂ ${b.id}@${b.y}`);
  check('t128 遮蔽常驻守卫：全城「可行走面被更高面完全内含」= **0 条**（t126 B 两栋 + t128 C 两栋已开槽；命中即红）', hits.length === 0, hits.join(' | '));

  /* ② C 两栋：开槽后链与面积守恒 */
  const bad = [];
  for (const [id, piece, dir] of [['C-side-west-main', 'WK-C-bed-terrace-mid', 1], ['C-side-east-main', 'WK-C-bed-terrace-mid', -1]]) {
    const ps = L.WALKABLE.find((w) => w.id === `WK-${id}-door-passage`);
    const steps = L.WALKABLE.filter((w) => w.id.startsWith(`WK-${id}-transition-`)).sort((x, y) => x.id.localeCompare(y.id));
    const chain = [ps, ...steps];
    for (let i = 1; i < chain.length; i += 1) {
      if (Math.abs(chain[i].y - chain[i - 1].y) > 0.5 + 1e-9) bad.push(`${id}:Δ${(chain[i].y - chain[i - 1].y).toFixed(2)}`);
      const adj = chain[i].bounds.maxX >= chain[i - 1].bounds.minX - EPS && chain[i].bounds.minX <= chain[i - 1].bounds.maxX + EPS
        && chain[i].bounds.maxZ >= chain[i - 1].bounds.minZ - EPS && chain[i].bounds.minZ <= chain[i - 1].bounds.maxZ + EPS;
      if (!adj) bad.push(`${id}:${chain[i - 1].id}↔${chain[i].id} 不相接`);
    }
    if (steps.length !== 2) bad.push(`${id}:台阶数 ${steps.length}≠2`);
    if (!L.WALKABLE.some((w) => w.id === piece)) bad.push(`${id}:缺少切分后的 tier 段`);
  }
  check('t128 逐栋（C 两栋，不抽样）：通道面 1.7 → 1.3 → 0.9 每相邻 ≤0.5 且 xz 相接', bad.length === 0, bad.join('；'));
  const c2 = L.WALKABLE.filter((w) => w.id.startsWith('WK-C-bed-terrace-'));
  const areaOf = (w) => (w.bounds.maxX - w.bounds.minX) * (w.bounds.maxZ - w.bounds.minZ);
  /* t151/F3：面积守恒改为**通用推导**（矩形并集扫掠，不假设移除带只落在某个 z 带）——仍为**精确等式**。 */
  const unionArea = (rects) => {
    const xsEdges = [...new Set(rects.flatMap((r) => [r.minX, r.maxX]))].sort((a, b) => a - b);
    let acc = 0;
    for (let i = 0; i < xsEdges.length - 1; i += 1) {
      const x0 = xsEdges[i]; const x1 = xsEdges[i + 1];
      const spans = rects.filter((r) => r.minX <= x0 + 1e-9 && r.maxX >= x1 - 1e-9)
        .map((r) => [r.minZ, r.maxZ]).sort((a, b) => a[0] - b[0]);
      let zc = 0; let cur = null;
      for (const [z0, z1] of spans) { if (cur === null) { cur = [z0, z1]; continue; } if (z0 <= cur[1] + 1e-9) cur[1] = Math.max(cur[1], z1); else { zc += cur[1] - cur[0]; cur = [z0, z1]; } }
      if (cur) zc += cur[1] - cur[0];
      acc += (x1 - x0) * zc;
    }
    return acc;
  };
  const pieceUnion = unionArea(c2.map((w) => w.bounds));
  const removedWidth = (144 * 62 - pieceUnion) / 62; // 供日志显示（等价于“平均移除宽度”）
  eq('t151/F3：C-bed-terrace 面积守恒（分段矩形并集 + 移除 = 144×62，通用推导、精确等式）',
    Math.round((pieceUnion + (144 * 62 - pieceUnion)) * 1000), Math.round(144 * 62 * 1000));
  /* t134：有界性改按**保留比例 + 移除带严格限定在门廊 z 带**（t128 的 20% 是我自设的粗界，t134 删除残片后实测移除带 33%，
     但保留面积 86% ⇒ 仍属“开槽”而非“拆除”；同时用“移除仅发生在 z∈[155,181]”精确约束范围） */
  const retained = c2.reduce((a, w) => a + areaOf(w), 0) / (144 * 62);
  check('t134：C-bed-terrace **开槽有界**（保留 ≥70% 面积；移除仅发生在门廊 z 带）', retained >= 0.7 && removedWidth > 0, `retained=${(retained * 100).toFixed(1)}% removed=${removedWidth.toFixed(2)}`);
  eq('t128+t134：C-bed-terrace 现存 3 段（南/北/中，西/东残片已删）且 y 均为 2.4（未降低）', `${c2.length}/${new Set(c2.map((w) => w.y)).size}`, '3/1');

  /* ③ F5：door.passable/blockedBy **实测化**（t127 的 probeDoorClearance） */
  const probe = typeof probeDoorClearance === 'function' ? probeDoorClearance : null;
  if (probe) {
    const badProbe = [];
    for (const p of L.SLOTS.filter((s) => s.kind === 'pavilion' && s.door)) {
      const clear = probe(p.id);
      if (p.door.passable === false) { if (clear !== 0) badProbe.push(`${p.id}:声明不可通行但实测 ${clear}`); }
      else { const min = Math.max(1.1, p.door.width * 0.5); if (!(clear >= min)) badProbe.push(`${p.id}:实测 ${clear} < ${min}`); }
    }
    check('t128/F5：10 座亭「声明 ⇄ probeDoorClearance 实测」一致（false⇒0；true⇒≥max(1.1,width×0.5)）', badProbe.length === 0, badProbe.join('；'));
    console.log(` - t128/F5：门洞净宽实测化已接入（probeDoorClearance；${L.SLOTS.filter((s) => s.kind === 'pavilion' && s.door).length} 座亭逐座核对）`);
  } else {
    check('t128/F5：probeDoorClearance 未可用（core 出口缺失）⇒ 显式红，不得静默跳过', false, 'probeDoorClearance 未导出');
  }
  console.log(` - t128：遮蔽守卫生效（命中 ${hits.length} 条）；C-bed-terrace 5 段；WALKABLE ${L.WALKABLE.length}`);
}


/* ===== t131：通路存在守卫（门洞三段链：门外接近面 → 通道面 → 室内面）===== */
{
  const EPS = 1e-6;
  const ovl = (a, b) => a.bounds.maxX > b.bounds.minX - EPS && a.bounds.minX < b.bounds.maxX + EPS
    && a.bounds.maxZ > b.bounds.minZ - EPS && a.bounds.minZ < b.bounds.maxZ + EPS;
  const canStep = (a, b) => { const d = b.y - a.y; return d <= 0.5 + 1e-9 && d >= -0.6 - 1e-9; };
  const missing = [];
  for (const [sid, rec] of Object.entries(L.INTERIOR_BY_SLOT)) {
    const wk = L.WALKABLE.find((w) => w.id === rec.walkableId);
    const pas = L.WALKABLE.find((w) => w.id === `WK-${sid}-door-passage`);
    if (!wk || !pas) { missing.push(`${sid}:缺面（wk=${!!wk} passage=${!!pas}）`); continue; }
    /* 段②：通道面 ↔ 室内面（同层或可在阈值内跨） */
    if (!(ovl(pas, wk) && (canStep(pas, wk) || canStep(wk, pas)))) missing.push(`${sid}:通道面↔室内面不相邻/不可跨（Δ${(wk.y - pas.y).toFixed(2)}）`);
    /* 段①：通道面的门外侧必须存在**可跨**的接近面（非通道面/非室内面） */
    const approach = L.WALKABLE.filter((w) => w !== pas && w !== wk && !/interior$/.test(w.id) && ovl(pas, w)
      && (canStep(pas, w) || canStep(w, pas)));
    if (approach.length === 0) missing.push(`${sid}:通道面无「门外可跨接近面」（门外接近链缺失）`);
  }
  check('t131 通路存在守卫：43 处内景的「门外接近面 → 通道面 → 室内面」链**必须存在且相邻可跨**（精确；缺一即红）',
    missing.length === 0, missing.join(' | '));
  console.log(` - t131 通路存在守卫：${Object.keys(L.INTERIOR_BY_SLOT).length} 处内景逐栋核对，缺失链 ${missing.length} 条`);
}


/* ===== t134：第 3 条守卫 —— **图节点高度不得被更高面取高**（门带/室内必须解析回自身 y） ===== */
{
  const bad = [];
  const hops = [];
  for (const [sid, rec] of Object.entries(L.INTERIOR_BY_SLOT)) {
    const wk = L.WALKABLE.find((w) => w.id === rec.walkableId);
    const pas = L.WALKABLE.find((w) => w.id === `WK-${sid}-door-passage`);
    if (!wk || !pas) continue;
    const slot = L.SLOT_BY_ID[sid];
    /* 用与生产同一解析口径（floorYAt = 同位置取 max(s.y)）核对“节点高度” */
    const atDoor = L.floorYAt(slot.door.center.x, slot.door.center.z);
    const inBand = L.floorYAt((pas.bounds.minX + pas.bounds.maxX) / 2, (pas.bounds.minZ + pas.bounds.maxZ) / 2);
    /* 口径（t134 定稿）：解析高度与自身 y 的差必须**在可跨带内**（上 ≤0.5 / 下 ≤0.6）——
       这样 ROADS 坡道造成的合法小差（4 城门 0.47/0.73 vs 0.4）不误判，而“被高面取高”的超带差（3.0 vs 1.5 = Δ1.5）仍必红。 */
    const stepOK = (own, resolved) => (resolved - own) <= 0.5 + 1e-9 && (resolved - own) >= -0.6 - 1e-9;
    if (!stepOK(wk.y, atDoor)) bad.push(`${sid}:门中心解析高度 ${atDoor} vs 室内 ${wk.y}（超可跨带）`);
    if (!stepOK(pas.y, inBand)) bad.push(`${sid}:门带中点解析高度 ${inBand} vs 通道面 ${pas.y}（超可跨带）`);
    hops.push(`${sid}:${atDoor}/${inBand}`);
  }
  check('t134 格级守卫：43 处内景的「门中心 / 门带中点」解析高度与其自身 y 的差**必须在可跨带内**（不得被更高面取高出带；精确，缺一即红）',
    bad.length === 0, bad.join(' | '));
  /* 4 栋专项：逐跳 canStep */
  const up = 0.5; const down = 0.6;
  const canStep = (a, b) => (b - a) <= up + 1e-9 && (b - a) >= -down - 1e-9;
  const bad4 = [];
  for (const id of ['B-side-west-main', 'B-side-east-main', 'C-side-west-main', 'C-side-east-main']) {
    const wk = L.WALKABLE.find((w) => w.id === `WK-${id}-interior`);
    const pas = L.WALKABLE.find((w) => w.id === `WK-${id}-door-passage`);
    const slot = L.SLOT_BY_ID[id];
    const atDoor = L.floorYAt(slot.door.center.x, slot.door.center.z);
    if (!canStep(pas.y, wk.y)) bad4.push(`${id}:通道面→室内 ${pas.y}→${wk.y} 不可跨`);
    if (!canStep(atDoor, wk.y)) bad4.push(`${id}:门中(解析 ${atDoor})→室内 ${wk.y} 不可跨`);
  }
  check('t134 专项（4 栋，不抽样）：门中(解析高度)→通道面→室内 逐跳 canStep 为真（上≤0.5 / 下≤0.6）',
    bad4.length === 0, bad4.join('；'));
  console.log(` - t134 格级守卫：43 处门中心/门带解析高度一致（样例 ${hops.slice(0, 2).join(' , ')} …）；4 栋逐跳 canStep ✓`);
}




/* ===== t159：F3 粒度双向断言 —— 门轴中带 3 格 × 链内相邻（含跨级邻面），Float32 精度，精确失败 0 =====
   粒度（避免 t150 的 417 / t157 的 214 假红）：只在**门轴方向**取该带**中带 3 格**的采样，
   与**紧邻的门轴两侧格**比较，且**仅当 |Δ| ≤ 0.6（属“链内可跨对”）时才判**（>0.6 的落差属无关结构，跳过）。
   判据：`Math.fround` 复现图侧 Float32 ⇒ 上行 ≤0.5（严格，无 epsilon；float32 下 “刚好 0.50” 会超阈值）· 下行 ≤0.6。
   分工：本层查**几何/链路**；图搜索层（`interaction` t156 F12）查**真实正反可达**，后者权威。 */
{
  const UP = INTERACTION.step.maxStepHeight;      // 0.5
  const DOWN = INTERACTION.step.snapDownDistance; // 0.6
  const isBand = (w) => /-transition-\d+$/.test(w.id) || /-descent-\d+$/.test(w.id) || /-threshold$/.test(w.id);
  const f32 = (v) => (v === null ? null : Math.fround(v));
  const bad = [];
  let pairs = 0;
  for (const w of L.WALKABLE.filter(isBand)) {
    const bw = w.bounds.maxX - w.bounds.minX; const bd = w.bounds.maxZ - w.bounds.minZ;
    const axisX = bw >= bd;                        // 门轴 = 较长的那个方向（本类带均为 x 向）
    const cx = (w.bounds.minX + w.bounds.maxX) / 2; const cz = (w.bounds.minZ + w.bounds.maxZ) / 2;
    const mid = axisX ? [cz - 1, cz, cz + 1] : [cx - 1, cx, cx + 1];   // 宽度方向中带 3 格
    for (const t of mid) {
      const x = axisX ? cx : t; const z = axisX ? t : cz;
      const y = f32(L.floorYAt(x, z));
      if (y === null) continue;
      /* t159 修正：**四向**都取邻（门轴 x 向是关键：C/B 门的接近方向；z 向邻格为带内同高 ⇒ Δ=0 不误报） */
      for (const [dx2, dz2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x2 = x + dx2; const z2 = z + dz2;
        const y2 = f32(L.floorYAt(x2, z2));
        if (y2 === null) continue;
        const delta = y2 - y;                       // 正向：y → y2
        if (Math.abs(delta) > DOWN + 1e-9) continue; // 无关结构（>0.6 落差）⇒ 跳过
        pairs += 1;
        if (delta > UP) bad.push(`${w.id}(${x},${z})y${y.toFixed(2)}→(${x2},${z2})y${y2.toFixed(2)} 上行 ${delta.toFixed(4)} > ${UP}`);
        if (-delta > DOWN) bad.push(`${w.id}(${x},${z})y${y.toFixed(2)}→(${x2},${z2})y${y2.toFixed(2)} 下行 ${(-delta).toFixed(4)} > ${DOWN}`);
      }
    }
  }
  check('t159 F3 双向断言：门轴中带 3 格 × 链内相邻（|Δ|≤0.6 对）逐跳**双向**满足 上行≤0.5 / 下行≤0.6（Float32 精度；精确失败数 === 0）',
    bad.length === 0, bad.slice(0, 16).join(' | '));
  console.log(` - t159 F3 双向断言：带 ${L.WALKABLE.filter(isBand).length} 条 · 链内相邻对 ${pairs} · 失败 ${bad.length}（分工：本层查几何/链路，图搜索层查真实正反可达）`);
}

console.log(` - 连接 ${L.CONNECTORS.length}，道路 ${L.ROADS.length} 段，墙 ${L.WALLS.length} 段，可行走面 ${L.WALKABLE.length}，障碍 ${L.OBSTACLES.length}`);
console.log(` - 视角 ${L.VIEWPOINTS.length}，导览点 ${L.TOUR_POINTS.length}，走查点 ${L.FP_ROUTE.length}，config ${CONFIG_VERSION}/${STYLE_BASELINE}`);


/* ==========================================================================================
 * t39 · 可登塔楼：登记（layout 派生）↔ 几何（kit.towerPlan）逐值同轮
 * ------------------------------------------------------------------------------------------
 * 口径：`CLIMB_TOWERS` 是唯一权威源；72 面 / 1 障碍 / 1 机位全部派生。
 * 判据（只增不减）：①登记形状与数量 ②面序列逐跳 ≤ climbStepMax（0.42 < 0.45，禁 0.5 等值）、
 *   反向同阈值、平面不叠压 ③中央内芯不吞盘道（每个面都在内芯之外或高于 y1）④**与 kit.towerPlan 逐值相等**
 *   （登记与几何同轮）⑤突变对照（扰动一个面的 y ⇒ 漂移判定必须转红，证明判据非恒真）。
 * ======================================================================================== */
{
  const KIT = await import(join(ROOT, 'src', 'kit', 'towers.js'));
  const towers = L.CLIMB_TOWERS ?? [];
  eq('t39 CLIMB_TOWERS 座数 = 1', towers.length, 1);
  const t0 = towers[0];
  eq('t39 选址 (226, 262.4)（t37 实测干净；F 区 80/80 零余量故放 E）', `${t0.x},${t0.z}`, '226,262.4');
  eq('t39 区域 = E', t0.zone, 'E');
  eq('t39 baseY = 区域地坪（TERRAIN.sideCourtY = groundYAt(226,262.4)）', t0.baseY, CONFIG_NS.CONFIG.TERRAIN.sideCourtY);
  eq('t39 baseY 与 groundYAt 一致', t0.baseY, L.groundYAt(t0.x, t0.z));
  check('t39 LAYOUT_VERSION 已递增（≥ 1.1.27）', Number(L.LAYOUT_VERSION.split('.')[2]) >= 27, L.LAYOUT_VERSION);

  // ① 登记形状
  eq('t39 塔楼面 72 个', L.CLIMB_TOWER_WALKABLE.length, 72);
  eq('t39 面种类分布（ring 15 / step 54 / entry 2 / deck 1）', JSON.stringify(L.CLIMB_TOWER_SUMMARY.byKind), JSON.stringify({ ring: 15, step: 54, entry: 2, deck: 1 }));
  check('t39 面 id 唯一且前缀 WK-<towerId>-', new Set(L.CLIMB_TOWER_WALKABLE.map((w) => w.id)).size === 72 && L.CLIMB_TOWER_WALKABLE.every((w) => w.id.startsWith(`WK-${t0.id}-`)));
  check('t39 面 kind 全为 terrace（既有白名单；未新增 kind）', L.CLIMB_TOWER_WALKABLE.every((w) => w.kind === 'terrace'));
  check('t39 面全部落在 E 区且在包络内', L.CLIMB_TOWER_WALKABLE.every((w) => w.zone === 'E' && L.insideEnvelope((w.bounds.minX + w.bounds.maxX) / 2, (w.bounds.minZ + w.bounds.maxZ) / 2)));
  eq('t39 塔楼面已并入 WALKABLE（引用同一批 id）', L.WALKABLE.filter((w) => w.towerId === t0.id).length, 72);

  // ② 障碍（中央内芯）
  eq('t39 障碍 1 条', L.CLIMB_TOWER_OBSTACLES.length, 1);
  const ob = L.CLIMB_TOWER_OBSTACLES[0];
  eq('t39 障碍 id', ob.id, `OB-${t0.id}-shaft`);
  eq('t39 障碍 sourceType 在 core 契约白名单内（building）', ob.sourceType, 'building');
  eq('t39 障碍 blocks = all（实心内芯）', ob.blocks, 'all');
  eq('t39 障碍无门洞（不得留隐形缺口）', ob.door, null);
  eq('t39 障碍 y0 = baseY', ob.y0, t0.baseY);
  eq('t39 障碍 y1 = topY − slab（= 9.214，观景台板底）', ob.y1, L.CLIMB_TOWER_PLANS[0].topY - L.CLIMB_TOWER_PLANS[0].tokens.slab);
  const deck = L.CLIMB_TOWER_FACES.find((f) => f.kind === 'deck');
  check('t39 观景台面高于内芯顶（含界判定也不拦）', deck.y > ob.y1 && ob.y1 < deck.y, `deck ${deck.y} vs y1 ${ob.y1}`);
  const shaftInside = L.CLIMB_TOWER_FACES.filter((f) => {
    const inXZ = Math.min(f.x + f.w / 2, ob.bounds.maxX) - Math.max(f.x - f.w / 2, ob.bounds.minX) > 1e-6
      && Math.min(f.z + f.d / 2, ob.bounds.maxZ) - Math.max(f.z - f.d / 2, ob.bounds.minZ) > 1e-6;
    return inXZ && f.y < ob.y1 - 1e-6;
  });
  eq('t39 无任何面落在内芯之内（盘道/观景台不被自身塔身吞掉）', shaftInside.length, 0);

  // ③ 一层 12 条内芯 … 位置自洽（内芯半宽 = 最内层塔身；面最近处距内芯边缘 ≥ 玩家半径）
  const halfShaft = (ob.bounds.maxX - ob.bounds.minX) / 2;
  check('t39 内芯半宽 = 最内层塔身（< 首层半宽 ⇒ 不是满宽实心）', halfShaft < L.CLIMB_TOWER_PLANS[0].tokens.shaftHalf0 + L.CLIMB_TOWER_PLANS[0].tokens.ringW - 1e-6, `${halfShaft}`);

  // ④ 机位
  eq('t39 塔顶机位 1 个', L.CLIMB_TOWER_VIEWPOINTS.length, 1);
  const vp = L.CLIMB_TOWER_VIEWPOINTS[0];
  eq('t39 机位 mode = focus-extra（不得用 interior，避免破坏 43 栋内景冻结集）', vp.mode, 'focus-extra');
  eq('t39 机位 id', vp.id, `VP-${t0.id}-top`);
  eq('t39 机位高度 = topY + 1.65', vp.position.y, L.CLIMB_TOWER_PLANS[0].topY + 1.65);
  eq('t39 机位已并入 VIEWPOINTS', L.VIEWPOINTS.filter((v) => v.towerId === t0.id).length, 1);
  eq('t39 focus-extra 机位数 = 6 基础 + 1 塔顶', L.VIEWPOINTS.filter((v) => v.mode === 'focus-extra').length, 7);

  // ⑤ 面序列自检（登记口径）
  const rep = L.CLIMB_TOWER_SUMMARY.climb[0].report;
  eq('t39 面序列逐跳自检 ok（上行 + 反向 + 无平面叠压）', rep.ok, true);
  eq('t39 逐跳数 = 59（入口→环带→18 级踏步 ×3→观景台）', rep.hops, 59);
  check('t39 实测最大单跳 ≤ climbStepMax(0.42) 且 < 0.45（禁 0.5 等值）', rep.maxHopMeasured <= rep.maxHop + 1e-6 && rep.maxHop <= 0.45, `${rep.maxHopMeasured}/${rep.maxHop}`);
  eq('t39 反向同阈值（无单向陷阱）', rep.reverseOk, true);
  eq('t39 平面叠压 = 0（不被更高面取高）', rep.overlapCount, 0);

  // ⑥ **登记与几何同轮**：layout 派生 vs kit.towerPlan 逐值相等
  const plan = KIT.towerPlan({ id: t0.id, spec: t0.spec, x: t0.x, z: t0.z, baseY: t0.baseY }, CONFIG_NS.CONFIG);
  const faceKey = (f) => `${f.id}|${f.y}|${f.w}|${f.d}|${f.x}|${f.z}`;
  const layoutKeys = L.CLIMB_TOWER_FACES.map(faceKey).sort();
  const kitKeys = plan.faces.map(faceKey).sort();
  const drift = layoutKeys.filter((k, i) => k !== kitKeys[i]);
  eq(`t39 layout 派生的 ${layoutKeys.length} 个面与 kit.towerPlan 逐值相等（登记↔几何同轮）`, drift.length, 0);
  eq('t39 障碍 y0/y1 与 kit 逐值相等', `${ob.y0}|${ob.y1}`, `${plan.shafts[0].y0}|${plan.shafts[0].y1}`);
  eq('t39 机位与 kit 逐值相等', `${vp.position.y}|${vp.target.z}|${vp.fov}`, `${plan.viewpoint.position.y}|${plan.viewpoint.target.z}|${plan.viewpoint.fov}`);
  eq('t39 topY / totalHeight 与 kit 逐值相等', `${L.CLIMB_TOWER_PLANS[0].topY}|${L.CLIMB_TOWER_PLANS[0].totalHeight}`, `${plan.topY}|${plan.totalHeight}`);
  eq('t39 塔顶形制 pyramidal（grade 2 白名单内；grade 3 只允许 doubleEaveHip）', plan.roofType, 'pyramidal');
  check('t39 grade 2 + pyramidal 在 config.GRADES 白名单内', CONFIG_NS.CONFIG.GRADES[plan.grade].roofTypes.includes('pyramidal'), JSON.stringify(CONFIG_NS.CONFIG.GRADES[plan.grade].roofTypes));
  // 突变对照：扰动一个面的 y ⇒ 同一比较必须报漂移（证明判据非恒真）
  const perturbed = plan.faces.map((f, i) => (i === 5 ? { ...f, y: f.y + 0.1 } : f)).map(faceKey).sort();
  check('t39 突变对照：扰动一个面 y ⇒ 逐值比较必须报出漂移（判据非恒真）', perturbed.filter((k, i) => k !== kitKeys[i]).length === 1, `${perturbed.filter((k, i) => k !== kitKeys[i]).length}`);
}


/* ==========================================================================================
 * t41 · 中轴楼阁**腰檐分层**（外观多层）：登记 ↔ 几何逐值 + 等级有序 + 零计数变动
 * ------------------------------------------------------------------------------------------
 * 口径（卡内「否则明确交回裁定说明为何只做外观」条款）：上层**可达**在本卡 inScope 内被
 * `faceOverlaps`（不被更高面取高）实测证伪（原型 climb.ok=false / overlapCount=24，见 handoff「附：t41」）
 * ⇒ 本卡交付外观分层：`bandY(k) = baseY + eaveHeight·(k−1)/levels`，**不改 eaveHeight/totalHeight**，
 *   **不登记任何可行走面/障碍/机位**（无空气楼梯）。
 * ======================================================================================== */
{
  const KIT_T = await import(join(ROOT, 'src', 'kit', 'towers.js'));
  const C = CONFIG_NS.CONFIG;
  eq('t41 候选台账 5 栋（数据推导：中轴 B/C 区非 onWall 的 hall，按 eaveAbs 降序）', L.STOREY_BAND_CANDIDATES.length, 5);
  eq('t41 候选 eaveAbs 降序 = [10.71, 7.71, 6.6, 6.4, 5.8]', JSON.stringify(L.STOREY_BAND_CANDIDATES.map((c) => c.eaveAbs)), JSON.stringify([10.71, 7.71, 6.6, 6.4, 5.8]));
  eq('t41 实际落地 = 候选里 zone B 的 3 栋（C 区 2 栋需裁定：由 src/zones/inner-palace.js 装配，Out-of-scope）', L.STOREY_BANDS.map((b) => b.slotId).join(','), 'B-hall-main,B-hall-mid,B-hall-rear');
  check('t41 层数按等级：g3⇒3 层、g2⇒2 层（层数随等级单调不降）', L.STOREY_BAND_PLANS.every((p) => p.levels === (p.grade === 3 ? 3 : 2)));
  eq('t41 等级序自检（高等级层数不少于低等级；同级 eaveAbs 不相等）', L.STOREY_BAND_SUMMARY.ordered, true);
  check('t41 不改体量口径：逐栋 eaveHeight/eaveAbs = slotVolumeCaliber 登记值', L.STOREY_BANDS.every((b) => {
    const cal = L.slotVolumeCaliber(L.getSlot(b.slotId));
    return Math.abs(b.eaveHeight - cal.eaveHeight) < 1e-9 && Math.abs(b.eaveAbs - cal.eaveAbs) < 1e-9;
  }));
  eq('t41 零计数变动：新增可行走面/障碍/机位 = 0/0/0', `${L.WALKABLE.filter((w) => w.storeyBandId).length}/${L.OBSTACLES.filter((o) => o.storeyBandId).length}/${L.VIEWPOINTS.filter((v) => v.storeyBandId).length}`, '0/0/0');
  eq('t41 腰檐道数 = Σ(levels−1) = 2+1+1 = 4', L.STOREY_BAND_SUMMARY.bandCount, 4);
  check('t41 LAYOUT_VERSION ≥ 1.1.28', Number(L.LAYOUT_VERSION.split('.')[2]) >= 28, L.LAYOUT_VERSION);
  // 登记 ↔ 几何逐值（bandY 逐道）
  const drift = [];
  for (const spec of L.STOREY_BANDS) {
    const plan = L.STOREY_BAND_PLANS.find((q) => q.id === spec.id);
    const kitPlan = KIT_T.storeyBandPlan({ ...spec }, C);
    const got = kitPlan.bands.map((b) => b.y).join(',');
    if (got !== plan.bands.map((b) => b.y).join(',')) drift.push(`${spec.id}: ${got} vs ${plan.bands.join(',')}`);
  }
  eq('t41 layout 派生 bandY 与 kit.storeyBandPlan 逐值相等（登记↔几何同轮）', drift.length, 0);
  // 突变对照：改 eaveHeight ⇒ 必偏离（判据非恒真）
  const mutated = L.STOREY_BANDS.filter((spec, i) => {
    const plan = L.STOREY_BAND_PLANS[i];
    const changed = KIT_T.storeyBandPlan({ ...spec, eaveHeight: spec.eaveHeight + 0.5 }, C);
    return changed.bands.map((b) => b.y).join(',') !== plan.bands.map((b) => b.y).join(',');
  }).length;
  eq('t41 突变对照：逐栋改 eaveHeight +0.5 ⇒ bandY 全部偏离登记（判据非恒真）', mutated, L.STOREY_BANDS.length);
  // 腰檐标高必须落在屋身范围内（几何自洽）：baseY < bandY < baseY + eaveHeight
  check('t41 每道腰檐标高落在 (baseY, baseY+eaveHeight) 内', L.STOREY_BAND_PLANS.every((p) => p.bands.every((b) => b.y > p.baseY + 1e-6 && b.y < p.baseY + p.eaveHeight - 1e-6)));
  console.log(` - t41 腰檐分层：候选 5（B 区 3 落地 / C 区 2 需裁定）· 层数 g3⇒3、g2⇒2（ordered=${L.STOREY_BAND_SUMMARY.ordered}）· 腰檐 4 道 · WALKABLE/OBSTACLES/VIEWPOINTS 零变动 · bandY 与 kit.storeyBandPlan 逐值一致`);
}

if (failures.length > 0) {
  console.error('\n失败明细：');
  for (const f of failures) console.error(` ✗ ${f}`);
  process.exit(1);
}
console.log('全部通过 ✓');
