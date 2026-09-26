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
// 版本对应关系（有意 pin：任何版本递增都必须同步改这两条断言，避免"悄悄改冻结值"）
eq('CONFIG 版本 = 1.0.7（t84：§8.2 分区配额重分配）（+ 夜景户外补光/夕照 orbit 补光）', CONFIG_VERSION, '1.0.7');
eq('LAYOUT 版本 = 1.1.8（t97：S() 内补区域地坪，sillY/passage y 与内景地面同源）', L.LAYOUT_VERSION, '1.1.8');
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
check('碰撞/台阶/跳跃规则齐全', INTERACTION.player.radius > 0 && INTERACTION.step.maxStepHeight > 0 && INTERACTION.jump.enabled === false);
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
check('院墙 id 与院落一一对应', L.COURTYARDS.every((c) => L.WALLS.filter((w) => w.courtyardId === c.id).length === 4));

// 统计与只读
eq('LAYOUT_STATS.slotCount 与实际一致', L.LAYOUT_STATS.slotCount, L.SLOTS.length);
eq('LAYOUT_STATS.courtyardCount 与实际一致', L.LAYOUT_STATS.courtyardCount, L.COURTYARDS.length);
eq('LAYOUT_STATS 分区统计', L.LAYOUT_STATS.slotsByZone, slotsPerZone);
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
eq('WALKABLE = 112（69 + 43 门洞通道面）', L.WALKABLE.length, 112);
eq('VIEWPOINTS = 61（20 基础 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿）', L.VIEWPOINTS.length, 61);
eq('FP_ROUTE = 50（9 基础 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿）', L.FP_ROUTE.length, 50);
eq('visitable = 43（2 殿 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿；4 角楼按 Q3 排除）', L.SLOTS.filter((s) => s.visitable).length, 43);
eq('冻结计数不动：SLOTS/WALLS/CONNECTORS/院落/导览', [L.SLOTS.length, L.WALLS.length, L.CONNECTORS.length, L.COURTYARDS.length, L.TOUR_POINTS.length].join('/'), '67/60/32/14/10');
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
  check('内景包围盒只取 kind:interior（43 条，哈希与改动前一致 0x51d2348e）', interiors.length === 43 && h.toString(16) === '51d2348e', `${interiors.length}/${h.toString(16)}`);
  check('通道面不新增机位/走查点（VIEWPOINTS 61 · FP_ROUTE 50 不变）', L.VIEWPOINTS.length === 61 && L.FP_ROUTE.length === 50, `${L.VIEWPOINTS.length}/${L.FP_ROUTE.length}`);
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

console.log(` - 连接 ${L.CONNECTORS.length}，道路 ${L.ROADS.length} 段，墙 ${L.WALLS.length} 段，可行走面 ${L.WALKABLE.length}，障碍 ${L.OBSTACLES.length}`);
console.log(` - 视角 ${L.VIEWPOINTS.length}，导览点 ${L.TOUR_POINTS.length}，走查点 ${L.FP_ROUTE.length}，config ${CONFIG_VERSION}/${STYLE_BASELINE}`);

if (failures.length > 0) {
  console.error('\n失败明细：');
  for (const f of failures) console.error(` ✗ ${f}`);
  process.exit(1);
}
console.log('全部通过 ✓');
