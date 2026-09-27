/**
 * 紫禁天朝 · 全队唯一数值来源（single source of truth）
 * =============================================================================
 * 对应计划：§3.1 共同风格基线、§8.2 面向完整宫城的预算、§6.3 统一光照、§6.4 多角度模式。
 *
 * 纪律（对全部下游 t2/t3/t6/t7/t8/t9/t10/t11/t14 生效）：
 *   1. 任何颜色、模数、间距、时长、预算数字只能从本文件取值，禁止在区域/核心/UI 代码里散落硬编码。
 *   2. 需要新数值时先在本文件登记（递增 CONFIG_VERSION 并在 docs/handoffs 说明），再被下游消费。
 *   3. 本文件是纯 ESM、零外部依赖（不 import three、不 import node 内置模块），可被 Node 直接 import。
 *   4. 对象全部深冻结：下游只能读，不能就地改写。
 */

export const CONFIG_VERSION = '1.0.11'; // t42：灯池**换灯可见性闸门**（LIGHTING.lamps.evictRangeMargin=0.25 / allowInRangeEviction=false / reselectMaxSeconds=0.8 / reselectSpeedReference=60）——只在在位者已离开自身照度范围（>75m，像素贡献为 0）时才换灯 ⇒ 交换构造性不可见；并让重选节流窗口随相机速度在 0.35…0.8s 之间；只改选择/节流规则，实时灯数、距离、强度、flicker 与全部预算逐值未动。上一版 1.0.10 = t40：新增 LIGHTING.atmosphere.smokeShowPointPx = 1.25（烟柱 LOD **滞回上门限**：单门限时点径在 1.0 附近抖动 ⇒ 整柱 visible 逐帧跳变，移动协议实测最高 12 次翻转/48 帧，滞回后 0–1 次；只改可见性、**零新增绘制调用**，粒子数/预算/材质规格逐值未动）；上一版 1.0.9 = t25：新增 LIGHTING.atmosphere.smokeMinPointPx = 1.0（烟柱 LOD 门限，落地 t1 交回的最小修复：亚像素点精灵整柱不绘制，修"红色边缘持续闪烁"；粒子数/预算/材质规格逐值未动）；上一版 1.0.8 = t2：INTERACTION.jump 启用（enabled true + maxHeight/cooldownSeconds）；再上版 1.0.7 = t84 §8.2 分区配额重分配
export const STYLE_BASELINE = 'v1.0.0';

/** 统一场景种子：每个区域用 deriveSeed(zone) 派生固定随机序列，保证复现与截图可比对（§3.1 随机性）。 */
export const SCENE_SEED = 20240926;

/** 区域派生种子：同一种子 + 区域字符串 → 稳定 32 位整数。 */
export function deriveSeed(zoneId, salt = 0) {
  const text = `${SCENE_SEED}:${String(zoneId)}:${String(salt)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * 计划 §3.1 主色板。
 * ⚠️ `interiorBrick` 是**唯一**偏离计划表格字面值的项：CONFIG 1.0.5（t40，主理人裁定）按**物理反照率**修正
 * `#1a1917 → #504b44`（线性反照率 0.0098 → 0.0715）。原值 `#1a1917` 的线性反照率 ≈1%，**低于任何真实建筑材料**
 * （真实抛光深色砖石/金砖通常 5–8%），导致内景补光在「暗区 ≤30% 且截断 ≤5%」双约束下无解（t38 诊断：拉满夜间系数
 * → C-night 暗区 0% 但截断 7.74% > 5%）。原值保留为**时点记录**（见 `docs/STYLE_GUIDE.md` 色板表与
 * `docs/handoff-config-1.0.5.md`）。其余 6 个主色仍逐字对齐计划表格。
 */
export const COLORS = Object.freeze({
  glazeGold: '#dfa112', // 琉璃金
  palaceRed: '#962822', // 宫红
  warmWhite: '#f0ece1', // 暖白石
  paintingTeal: '#1c4e40', // 青绿彩画
  pavingGray: '#575652', // 深灰铺地
  interiorBrick: '#4a463f', // 室内金砖｜物理反照率修正（CONFIG 1.0.5，t40）：原 #1a1917 线性反照率≈0.0098 → 0.0715（5–8% 物理区间）
  gilt: '#ffc83b', // 鎏金
});

/** 主色板之外的派生色：全部由主色板推导/同系，保持同一套语言。 */
export const COLORS_DERIVED = Object.freeze({
  glazeGoldShadow: '#a8760c', // 琉璃金背光面
  glazeGoldRidge: '#f2c14e', // 正脊受光
  palaceRedDark: '#6d1c18', // 宫红阴面 / 门扇
  wallBaseStone: '#cfc7b6', // 墙基条石
  timber: '#7a3b24', // 木作（柱、梁、门窗框）
  timberDark: '#4a2417', // 木作阴影面
  courtyardWallTop: '#8f8a7c', // 院墙瓦顶（青灰）
  pavingLight: '#8f8b80', // 御道 / 广场嵌线
  pavingDark: '#3f3d3a', // 铺地缝
  stoneWhiteShade: '#c9c2b2', // 白石阴面
  water: '#33544f', // 护城河 / 水池
  waterDeep: '#1e3230', // 深水
  mossGreen: '#5f6b3b', // 苔痕（旧化用）
  fogDay: '#d9d5ca', // 昼雾
  fogDusk: '#c99a6a', // 夕雾
  fogNight: '#1b2333', // 夜雾
  skyDay: '#9fc4e8',
  skyDusk: '#e29a5c',
  skyNight: '#0d1526',
});

/** 语义角色 → 颜色 token。下游一律使用 role 名，不直接写 hex（便于一次改色）。 */
export const COLOR_ROLES = Object.freeze({
  roofPrimary: 'glazeGold',
  roofSecondary: 'glazeGold',
  roofRidge: 'glazeGoldRidge',
  wallPrimary: 'palaceRed',
  wallShade: 'palaceRedDark',
  wallBase: 'wallBaseStone',
  structurePrimary: 'palaceRed',
  structureSecondary: 'paintingTeal',
  beamPainting: 'paintingTeal',
  timberFrame: 'timber',
  terraceStone: 'warmWhite',
  terraceStoneShade: 'stoneWhiteShade',
  balustrade: 'warmWhite',
  pavingPlaza: 'pavingGray',
  pavingRoad: 'pavingLight',
  pavingInterior: 'interiorBrick',
  metalGilt: 'gilt',
  courtyardWall: 'palaceRed',
  courtyardWallTop: 'courtyardWallTop',
  water: 'water',
  foliage: 'mossGreen',
});

/**
 * 开间与尺度模数（米）。同类建筑共用一套模数，主次靠 bays / grade 区分（§3.1 建筑轮廓）。
 * 单位：米。朝向：默认正面朝南 -Z（见 ORIENTATION）。
 */
export const MODULES = Object.freeze({
  bayPitch: 6.4, // 开间模数：每间面阔
  bayDepth: 5.2, // 进深模数：每间进深
  columnDiameter: 0.78, // 柱径
  columnFootDiameter: 0.92, // 柱础直径
  eaveHeight: 4.6, // 檐高（单层柱头到檐口）
  eaveOverhang: 2.4, // 飞檐出檐
  roofSlope: 0.55, // 屋架举架坡度（tan）
  roofRisePerBay: 0.42, // 每间举架增量（形成凹曲屋面）
  eaveLift: 0.55, // 飞檐起翘高度
  eaveCurve: 0.32, // 飞檐弧度系数（0=直檐，1=极曲）
  eaveRiseAtCorner: 1.05, // 角部起翘高度
  ridgeHeightRatio: 0.34, // 正脊高 = 通进深 × 该系数
  roofThickness: 0.42, // 瓦面厚度
  roofTileRowsPerMeter: 1.15, // 瓦垄密度（纹理/几何重复用）
  eaveSoffitDepth: 0.6, // 檐下（斗栱层）厚度
  bracketHeightRatio: 1.0, // 斗栱层高 = eaveSoffitDepth × 该系数
  plinthWidth: 2.2, // 台明（台基外扩）
  plinthHeightMin: 0.45, // 最低台基高
  terraceTierHeight: 1.5, // 主殿台基单层高（三层 = 4.5m，§2.3）
  terraceTierInset: 9, // 每上一层向内的收进
  terraceTierCount: 3, // 主殿台基层数
  terraceTotalHeight: 4.5, // 主殿台基总高（§2.3 冻结）
  stairsStepHeight: 0.15, // 台阶单级高
  stairsStepDepth: 0.34, // 台阶单级深
  stairsMaxRun: 20, // 单跑最大水平长度（超过则分段设休息平台）
  wallSegmentPitch: 20, // 宫墙分段长度（廊段/墙段按段统计，不计入建筑数）
  wallThickness: 8, // 宫墙厚度（向外侧扩展，内表面 = 包络）
  wallHeight: 12, // 宫墙高
  wallBattlementHeight: 1.1, // 墙顶压顶/女墙高
  courtyardWallThickness: 1.2, // 院墙厚
  courtyardWallHeight: 4.2, // 院墙高
  corridorWidth: 3.6, // 廊道宽
  corridorPostPitch: 3.2, // 廊柱间距
  gateOpeningRatio: 0.55, // 门洞宽 / 门殿面阔
  bridgeDeckWidth: 16, // 桥面宽（南桥）
  moatWidth: 34, // 护城河宽
  moatDepth: 3, // 护城河常水位相对地面（取负值使用）
});

/**
 * 比例与形制分档：grade 越高越宏伟（§5.1 主次建筑通过参数与装饰等级区分）。
 * hallHeightFactor × 檐高 = 实际檐高；装饰密度用于 kit 的细节等级。
 *
 * roofTypes = 该等级**允许**的屋顶类型白名单（机器守卫见 tests/layout.test.mjs "等级-屋顶白名单" 断言，
 * 每个槽位必须同时满足 roofType ∈ GRADES[grade].roofTypes 且为 ROOF_TYPES 的合法键）。
 *
 * 修订记录：
 *   CONFIG 1.0.1：GRADES[2].roofTypes 增补 'pyramidal'（主理人裁定）——layout 的 F-garden-pavilion-main
 *     是御花园中央主亭（grade 2 + 攒尖顶），而攒尖顶是亭的规范形制；降级到 grade1 会与周围 9 个次级亭同级、
 *     破坏 §5.5 主次层级，故增补白名单、不动任何布局数值。GRADES[3] 仍仅限 doubleEaveHip（最高等级受约束）。
 */
export const GRADES = Object.freeze({
  1: Object.freeze({
    grade: 1,
    eaveHeightFactor: 0.78,
    bayPitchFactor: 0.92,
    columnDiameterFactor: 0.85,
    eaveOverhangFactor: 0.8,
    detailing: 'low',
    roofTypes: Object.freeze(['gableHip', 'gable', 'pyramidal']),
  }),
  2: Object.freeze({
    grade: 2,
    eaveHeightFactor: 1.0,
    bayPitchFactor: 1.0,
    columnDiameterFactor: 1.0,
    eaveOverhangFactor: 1.0,
    detailing: 'medium',
    roofTypes: Object.freeze(['doubleEaveHip', 'hip', 'gableHip', 'pyramidal']),
  }),
  3: Object.freeze({
    grade: 3,
    eaveHeightFactor: 1.35,
    bayPitchFactor: 1.12,
    columnDiameterFactor: 1.2,
    eaveOverhangFactor: 1.2,
    detailing: 'high',
    roofTypes: Object.freeze(['doubleEaveHip']),
  }),
});

/** 屋顶类型（§5.1：主殿重檐庑殿，次级歇山/硬山/亭顶；庑殿顶必须有长正脊与四面坡）。 */
export const ROOF_TYPES = Object.freeze({
  doubleEaveHip: Object.freeze({
    id: 'doubleEaveHip',
    label: '重檐庑殿顶',
    hip: true,
    doubleEave: true,
    ridge: true,
    slopes: 4,
    curvature: 1.0,
    riseRatio: 0.34,
  }),
  hip: Object.freeze({
    id: 'hip',
    label: '单檐庑殿顶',
    hip: true,
    doubleEave: false,
    ridge: true,
    slopes: 4,
    curvature: 0.9,
    riseRatio: 0.32,
  }),
  gableHip: Object.freeze({
    id: 'gableHip',
    label: '歇山顶',
    hip: true,
    doubleEave: false,
    ridge: true,
    slopes: 4,
    gableFace: true,
    curvature: 0.8,
    riseRatio: 0.36,
  }),
  gable: Object.freeze({
    id: 'gable',
    label: '硬山顶',
    hip: false,
    doubleEave: false,
    ridge: true,
    slopes: 2,
    curvature: 0.25,
    riseRatio: 0.42,
  }),
  pyramidal: Object.freeze({
    id: 'pyramidal',
    label: '攒尖顶',
    hip: true,
    doubleEave: false,
    ridge: false,
    slopes: 4,
    curvature: 0.7,
    riseRatio: 0.5,
  }),
});

/** 材质规范（§3.1 材质）：光泽克制、旧化统一且较轻。 */
export const MATERIALS = Object.freeze({
  glazeTile: Object.freeze({
    id: 'glazeTile',
    role: 'roof',
    colorRole: 'roofPrimary',
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.55,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.6,
    wear: 0.18,
  }),
  giltMetal: Object.freeze({
    id: 'giltMetal',
    role: 'metal',
    colorRole: 'metalGilt',
    roughness: 0.24,
    metalness: 0.92,
    clearcoat: 0.3,
    envMapIntensity: 1.1,
    wear: 0.08,
  }),
  plasterRed: Object.freeze({
    id: 'plasterRed',
    role: 'wall',
    colorRole: 'wallPrimary',
    roughness: 0.78,
    metalness: 0.0,
    clearcoat: 0.0,
    envMapIntensity: 0.35,
    wear: 0.22,
  }),
  stoneWhite: Object.freeze({
    id: 'stoneWhite',
    role: 'stone',
    colorRole: 'terraceStone',
    roughness: 0.62,
    metalness: 0.0,
    clearcoat: 0.08,
    envMapIntensity: 0.45,
    wear: 0.16,
  }),
  pavingStone: Object.freeze({
    id: 'pavingStone',
    role: 'ground',
    colorRole: 'pavingPlaza',
    roughness: 0.86,
    metalness: 0.0,
    clearcoat: 0.0,
    envMapIntensity: 0.25,
    wear: 0.3,
  }),
  interiorBrick: Object.freeze({
    id: 'interiorBrick',
    role: 'interior',
    colorRole: 'pavingInterior',
    roughness: 0.35,
    metalness: 0.02,
    clearcoat: 0.35,
    envMapIntensity: 0.5,
    wear: 0.12,
  }),
  timberLacquer: Object.freeze({
    id: 'timberLacquer',
    role: 'wood',
    colorRole: 'timberFrame',
    roughness: 0.55,
    metalness: 0.0,
    clearcoat: 0.25,
    envMapIntensity: 0.3,
    wear: 0.2,
  }),
  paintingTeal: Object.freeze({
    id: 'paintingTeal',
    role: 'painting',
    colorRole: 'beamPainting',
    roughness: 0.66,
    metalness: 0.03,
    clearcoat: 0.2,
    envMapIntensity: 0.35,
    wear: 0.18,
  }),
  waterSurface: Object.freeze({
    id: 'waterSurface',
    role: 'water',
    colorRole: 'water',
    roughness: 0.08,
    metalness: 0.0,
    clearcoat: 1.0,
    transmission: 0.35,
    envMapIntensity: 0.9,
    wear: 0.0,
  }),
});

/** 统一旧化参数：全城同一套，不得各自加重。 */
export const WEATHERING = Object.freeze({
  globalAmount: 0.2, // 总强度 0–1（"较小"）
  edgeDirt: 0.25, // 檐口/墙脚积尘
  rainStreak: 0.15, // 雨痕
  stoneDiscoloration: 0.18, // 石材变色
  mossAtBase: 0.12, // 墙脚苔痕
  textureNoiseScale: 2.5, // 噪声频率（世界米）
  roughnessBias: 0.04, // 旧化带来的粗糙度增量
});

/** 植物（§3.1：树冠形状、饱和度、尺度与摆放密度一致；花树点缀）。 */
export const PLANTS = Object.freeze({
  canopyShapes: Object.freeze(['roundedCone', 'domedSphere', 'layeredUmbral']),
  treeHeights: Object.freeze({ small: 5.5, medium: 9, large: 13.5 }),
  canopyRadiusRatio: 0.42,
  saturation: 0.34, // 统一低饱和
  blossomRatio: 0.12, // 花树占比（点缀）
  blossomColor: '#e8b7bd',
  trunkColor: '#5b4634',
  densityPerCourt: 4, // 每院默认乔木数
  gardenDensityPer1000m2: 2.4, // 花园密度（株 / 1000m²）
  windAmplitude: 0.045, // 微风幅度（弧度）
  windSpeed: 0.35, // 微风频率（Hz 量级）
  instancingBatchSize: 64,
});

/** 水面（§3.1：低饱和、反射适度，不抢主体）。 */
export const WATER = Object.freeze({
  levelDay: 0.62, // 反射强度
  roughness: 0.08,
  colorRole: 'water',
  deepColorRole: 'waterDeep',
  waveAmplitude: 0.06, // 微波高度（米）
  waveLength: 6.0, // 微波波长
  waveSpeed: 0.28,
  opacity: 0.88,
  foamWidth: 0.9,
});

/**
 * 光照与色调映射（§3.1 光照、§6.3 三个统一预设）。
 * 全城共享太阳/环境光/曝光/色调映射/阴影策略；区域只声明灯位 lightAnchors。
 */
export const LIGHTING = Object.freeze({
  toneMapping: Object.freeze({
    mode: 'ACESFilmic',
    exposure: 1.0,
    outputColorSpace: 'srgb',
  }),
  presets: Object.freeze({
    goldenHour: Object.freeze({
      id: 'goldenHour',
      label: '盛世金辉',
      sunDirection: Object.freeze({ x: -0.45, y: 0.62, z: -0.65 }),
      sunColor: '#ffe6bb',
      sunIntensity: 2.35,
      ambientColor: '#9fc4e8',
      ambientIntensity: 0.42,
      hemiSky: '#bcd8f2',
      hemiGround: '#8a7f6b',
      hemiIntensity: 0.5,
      fogColorRole: 'fogDay',
      fogNear: 1400, // CONFIG 1.0.2：700 → 1400（VP-city-oblique 距目标 ≈1222m，旧雾距在该处约 31% 雾白）
      fogFar: 3200, // CONFIG 1.0.2：2400 → 3200
      backgroundRole: 'skyDay',
      exposure: 1.0,
      bloom: Object.freeze({ strength: 0.22, radius: 0.5, threshold: 0.9 }),
      lampIntensityScale: 0.45, // CONFIG 1.0.3：0 → 0.45（日间内景补光：让宫灯在白天有限参与室内照明，不动全局曝光）
    }),
    sunset: Object.freeze({
      id: 'sunset',
      label: '落霞夕照',
      sunDirection: Object.freeze({ x: -0.82, y: 0.2, z: -0.38 }),
      sunColor: '#ffb571',
      sunIntensity: 2.0,
      ambientColor: '#c98f6a',
      // CONFIG 1.0.4（t39）：夕照阴影侧可读性——日落仰角低（≈21°）时背光面占比天然偏高，
      // 用**补光**（ambient/hemi）把深阴影抬过 luma 0.08 判据；太阳强度/方向、曝光、天空色、雾距与色板**全部未动**，
      // 因此天空与整体曝光档位不变，只是阴影侧被抬起（实测 色温 R/B 1.81→1.85、饱和度 0.551→0.527）。
      // CONFIG 1.0.6（t42）：dusk orbit 在真内容口径下 25.93% > 15%（t39 只覆盖 oblique/iso/zone）；
      // 小幅补光到 1.15/1.2 —— 上限受 t43 的内景补光系数（2.4/1.05 × 预设）约束：再高会把夕照内景截断顶破 5%。
      ambientIntensity: 1.15,
      hemiSky: '#e6a878',
      hemiGround: '#6b5a4a',
      hemiIntensity: 1.2,
      fogColorRole: 'fogDusk',
      fogNear: 1400, // CONFIG 1.0.2：600 → 1400（与 goldenHour 统一，全城机位不再被雾洗白）
      fogFar: 3200, // CONFIG 1.0.2：2100 → 3200
      backgroundRole: 'skyDusk',
      exposure: 1.06,
      bloom: Object.freeze({ strength: 0.3, radius: 0.55, threshold: 0.85 }),
      lampIntensityScale: 0.6, // CONFIG 1.0.3：0.35 → 0.6（夕照内景补光）
    }),
    moonlitNight: Object.freeze({
      id: 'moonlitNight',
      label: '寒月宫灯',
      sunDirection: Object.freeze({ x: 0.35, y: 0.72, z: 0.4 }),
      sunColor: '#9fb6dd',
      sunIntensity: 2.0, // CONFIG 1.0.2（方案A，t19）：0.75 → 2.0，消除"只剩黑色剪影"
      ambientColor: '#41577f',
      // CONFIG 1.0.6（t42）：夜景**户外**可读性——t41 修好掩码后发现夜景色调在真内容口径下大面积不达标
      // （axis 42.65% / oblique·zone 16.92% / focus 29.50%），属"夜景户外光照明不足"，按裁定修光照而非改分类/阈值。
      // 太阳强度、曝光、天空色、雾距、色板全部未动（天空像素逐值不变），只抬阴影侧补光。
      ambientIntensity: 1.9, // CONFIG 1.0.6：0.8 → 1.9（真内容口径 axis 42.65% → 23.96%）
      hemiSky: '#2b3d5e',
      hemiGround: '#141a24',
      hemiIntensity: 1.6, // CONFIG 1.0.6：0.65 → 1.6（同上；hemi/ambient 比例保持）
      fogColorRole: 'fogNight',
      fogNear: 420,
      fogFar: 1800,
      backgroundRole: 'skyNight',
      exposure: 1.35, // CONFIG 1.0.2：1.18 → 1.35
      bloom: Object.freeze({ strength: 0.42, radius: 0.62, threshold: 0.72 }),
      lampIntensityScale: 1.0,
    }),
  }),
  timePresets: Object.freeze(['goldenHour', 'sunset', 'moonlitNight']),
  shadows: Object.freeze({
    enabled: true,
    strategy: 'singlePrimaryDirectional', // §8.2：优先一盏主要方向光
    mapSizeHigh: 2048,
    mapSizeMedium: 1536,
    mapSizeLow: 1024,
    cameraHalfExtent: 620, // 覆盖包络的阴影正交相机半径
    bias: -0.0006,
    normalBias: 0.035,
    cascadeCount: 1,
    dynamicShadowBudget: 1, // 允许投影的实时光源数量上限（宫灯不投影）
  }),
  lamps: Object.freeze({
    maxRealtimePointLights: 8, // 夜景按距离/重要性激活的实时点光上限（CONFIG 1.0.2 不变，§8.2 预算不变）
    distance: 60, // CONFIG 1.0.3：46 → 60（t26 把 intensity/distance 改为**下限**，为近景/内景建立余量）
    decay: 1, // CONFIG 1.0.3：2 → 1（风格化的线性衰减；decay=2 时 10m 外照度仅 1/100，室内无法照亮）
    emissiveFallbackBeyond: 120, // 更远处用发光材质代替实时灯
    color: '#ffc37a',
    intensity: 18, // CONFIG 1.0.3：12 → 18（下限 ≥12，可按判据上调；硬约束仍 ≤8 实时灯、不投影）
    flickerAmplitude: 0.05,
    flickerSpeed: 1.7,
    /**
     * t42：**换灯可见性闸门**（架构级修复的核心，比 t5 的分数滞回更硬）。
     *
     * 事实（`src/core/environment.js` 的实时点光）：每盏 `PointLight(…, distance=60, decay=1)` 在**超出
     * `distance` 后对像素贡献恒为 0**（three 的 cutoff），而灯池只有 `maxRealtimePointLights`(8) / 真机
     * 容量 6 个名额、灯位却有 152 个 ⇒ **必须**换入换出。
     *
     * 旧规则（t5）：只有"挑战者分数比在位者高 `LAMP_HYSTERESIS_MARGIN`"才换 ⇒ 换的两侧**通常都在照度
     * 范围内**（都 <60 m、分数接近）⇒ 一次换灯 = 一盏实亮灯熄 + 另一盏实亮灯亮 ⇒ **必然可见**。
     * 新规则（t42）：**只在在位者已离开自己的照度范围**（`距离 > distance × (1 + 本裕量)` = 75 m 外、
     * 逐像素贡献为 0）时才换 ⇒ 交换在画面上**构造性不可见**；距离变化仍由每帧 falloff 与 0.3 s 斜坡承担。
     * `allowInRangeEviction: false` = 新规则；`true` 只用于**旧规则对照/突变证明**（守卫 ②）。
     */
    evictRangeMargin: 0.25,
    allowInRangeEviction: false,
    /**
     * t42：**灯池选择架构**（本卡的核心判定）。
     *
     * `'dynamic'`（t5 及以前）：按**相机距离**给 152 个灯位打分、取前 N ⇒ 相机一动，截断线两侧就换人。
     *   t5 用"分数滞回 + 身份绑槽 + 0.3s 斜坡"把换灯压到 91 次/14 机位×150 帧（真机 56→11），
     *   但**换灯本身仍在发生**，而每一盏实时点光照亮的是它**自己周围的地面**（three 的 cutoff 是
     *   片元↔灯距离，不是相机距离）⇒ 远景机位下"换灯"照样改变可见画面（庭院亮暗换位置）⇒
     *   参数调优有上限（这是架构问题，不是参数问题）。
     * `'zone-static'`（t42 默认）：池 = **分区静态配额**（相机所在区先占 `localShare` 份额，其余按固定
     *   权重序分配），**与相机位置无关** ⇒ 相机在同一分区内做任何运动（旋转/平移）都**不触发换灯**，
     *   换灯只发生在跨越分区边界时（离散、偶发、由 0.3s 斜坡承担）。代价见
     *   `docs/report-lamp-architecture.md`：远处分区始终占着名额（相关性地让位给"稳定"）。
     */
    selectionMode: 'zone-static',
    /** 分区静态配额权重（只按比例分配真机容量；不改变容量本身）。 */
    zoneQuotaWeights: Object.freeze({ B: 3, C: 2, D: 2, E: 2, F: 2 }),
    /** 相机所在区的名额占比（其余名额按固定权重序分给别的区）。 */
    zoneLocalShare: 0.5,
    /**
     * t42：**重选间隔与相机速度挂钩**（卡面指定手段）——`updateLampSelection` 的节流窗口 =
     * `base(0.35s) … reselectMaxSeconds`，按相机位移速度在 `reselectSpeedReference`(m/s) 以下线性拉长。
     * 依据：慢速移动/缓慢环绕时换灯最刺眼（画面近乎静止，只有灯在换）；高速环绕（守卫协议 ≈209 m/s）
     * 场景本身剧烈变化、换灯不可见 ⇒ 保留 base。**只改节流窗口，不改选择规则与任何预算**。
     */
    reselectMaxSeconds: 0.8,
    reselectSpeedReference: 60,
  }),
  atmosphere: Object.freeze({
    smokeEnabled: true, // 香炉轻烟
    smokeParticleBudget: 48,
    /**
     * t25（落地 t1 交回的最小修复）：**烟柱 LOD 门限**（单位 = 屏幕像素）。
     *
     * 机制（t1 实测，见 `docs/handoff-t1-flicker.md` §0/§6）：`?view=oblique` 下中轴 4 座香炉
     * 距相机 935–1424 m，`size=1.1` + `sizeAttenuation` ⇒ `gl_PointSize ≈ 0.35–0.53 px`（**亚像素**）；
     * 同一屏幕像素叠 3–5 颗 ⇒ 等效不透明 0.41–0.58，压在宫红墙 `#962822` 边缘上；48 颗粒子按
     * `phase=(elapsed·0.22+seed)%1` 上升、每 4.5 s **硬回绕**（无淡入淡出）⇒ 9–14 次/秒的亚像素覆盖翻转
     * = 肉眼所见的"红色边缘持续闪烁"（静止场景 30 帧 79 个不稳定像素、29/29 对相邻帧都变）。
     *
     * 修法：`pointPx = size × (drawingBufferHeight/2) / dist` **小于本门限时整柱不绘制**（只改可见性）。
     * 门限 = 1.0 px ⇒ 等效距离门限 = `1.1 × 450 / 1.0` ≈ **495 m**：只裁远景亚像素段；
     * **近景保留性**：20 m 处点径 = 1.1×450/20 = **24.75 px** ≫ 1.0 ⇒ 第一人称/内景/门前景的烟柱形态**完全保留**。
     * **粒子数/预算/材质规格（size 1.1 / opacity 0.16 / span 6 / 48 颗）逐值未动**（§8.2 与守卫②均断言）。
     */
    smokeMinPointPx: 1.0,
    /**
     * t40：**烟柱 LOD 的滞回上门限**（单位 = 屏幕像素）。
     *
     * 背景（t40 移动协议实测，`docs/report-motion-edges.md` §3）：t25 的 LOD 只有一个门限 ⇒ 相机在
     * 门限附近运动时（行走/旋转都会）`pointPx` 在 1.0 上下抖动，整柱 `points.visible` **逐帧跳变**
     * （实测：绕门限往复行走 48 帧，单柱 visible 翻转最高 **12** 次）⇒ 移动中的"烟柱爆闪"。
     *
     * 修法（滞回，**零新增绘制调用**）：只改可见性判定 ——
     *   `pointPx < smokeMinPointPx`(1.0) ⇒ 隐藏；`pointPx ≥ smokeShowPointPx`(1.25) ⇒ 显示；
     *   落在两者之间保持上一帧状态（粘滞）。滞回带 1.0–1.25 px ⇔ 距离带 ≈ **495 m … 396 m**。
     * 两个门限都只作用于**可见性**：粒子数/预算/材质规格/相位公式逐值未动。
     */
    smokeShowPointPx: 1.25,
    dustEnabled: true,
    dustParticleBudget: 220,
    bloomEnabled: true,
    bloomMaxResolution: 256,
    snowEnabled: false, // 可选增强，G2 之后再做
  }),
});

/** 相机装置（§6.4）：唯一实现，八种视角在同一装置内切换。 */
export const CAMERA = Object.freeze({
  transitionSeconds: 1.2, // 默认镜头过渡（§3.1 动效）
  transitionEasing: 'cubicInOut',
  fov: 45,
  near: 0.5,
  far: 6000,
  minPolarAngleDeg: 8,
  maxPolarAngleDeg: 78,
  minDistance: 18,
  maxDistance: 1800,
  targetRadiusLimit: 420, // 目标点允许偏离包络中心的最大半径
  fpEyeHeight: 1.65, // 第一人称视线高度 = 可行走面高 + 该值（§6.4）
  fpMoveSpeed: 5.2, // m/s
  fpRunMultiplier: 2.1, // Shift 加速
  fpLookSmoothing: 0.14,
  fpPointerLockOnEntry: true,
  isoAzimuthDeg: 45,
  isoElevationDeg: 35.264, // 等距沙盘
  obliquePitchDeg: 42,
  obliqueAzimuthDeg: 8,
  /** 八种模式（编号即键盘 1–8）。 */
  viewModes: Object.freeze([
    Object.freeze({ index: 1, mode: 'oblique', label: '全城鸟瞰', projection: 'perspective' }),
    Object.freeze({ index: 2, mode: 'iso', label: '等距沙盘', projection: 'orthographic' }),
    Object.freeze({ index: 3, mode: 'axis', label: '中轴透视', projection: 'perspective' }),
    Object.freeze({ index: 4, mode: 'zone', label: '分区视角', projection: 'perspective' }),
    Object.freeze({ index: 5, mode: 'focus', label: '建筑近景', projection: 'perspective' }),
    Object.freeze({ index: 6, mode: 'interior', label: '室内视角', projection: 'perspective' }),
    Object.freeze({ index: 7, mode: 'fp', label: '第一人称', projection: 'perspective' }),
    Object.freeze({ index: 8, mode: 'orbit', label: '自由环绕', projection: 'perspective' }),
  ]),
  /** 分区视角（§6.2 分区跳转）对应的区域机位 id。 */
  zoneViewpointByArea: Object.freeze({
    city: 'VP-city-oblique',
    B: 'VP-B-zone',
    C: 'VP-C-zone',
    D: 'VP-D-zone',
    E: 'VP-E-zone',
    F: 'VP-F-zone',
  }),
});

/** UI 规范（§3.1 UI）：间距阶梯、圆角、过渡时长、字体与面板。 */
export const UI = Object.freeze({
  spacingScale: Object.freeze([4, 8, 12, 16, 24, 32]), // 单位 px，严格按阶梯取值
  spacing: Object.freeze({
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  }),
  radius: 4, // 面板圆角 4px
  borderWidth: 1,
  transitionMs: 180, // UI 过渡（§3.1 动效）
  cameraTransitionMs: 1200, // 与 CAMERA.transitionSeconds 同源
  typography: Object.freeze({
    titleFamily: "'Songti SC', 'Noto Serif SC', 'STSong', serif",
    bodyFamily: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
    titleSize: 24,
    sectionSize: 16,
    bodySize: 14,
    captionSize: 12,
    lineHeight: 1.55,
    letterSpacing: 0.4,
  }),
  panel: Object.freeze({
    background: 'rgba(26, 25, 23, 0.82)',
    borderColor: 'rgba(223, 161, 18, 0.45)',
    titleColor: '#f0ece1',
    accentColor: '#ffc83b',
    sealColor: '#962822',
    shadow: '0 6px 24px rgba(0, 0, 0, 0.4)',
    minTouchTarget: 32,
  }),
  hudZIndex: Object.freeze({
    loading: 40,
    hud: 20,
    panel: 30,
    tooltip: 35,
    error: 45,
  }),
  breakpoints: Object.freeze({ narrow: 720, medium: 1080 }),
  minimap: Object.freeze({
    size: 200,
    padding: 8,
    playerMarkerRadius: 3,
    zoneLabelMinSize: 11,
  }),
  loading: Object.freeze({
    showAfterMs: 120,
    failureRetryLabel: '重试',
    progressStages: Object.freeze(['布局', '环境', '区域', '内景', '就绪']),
  }),
});

/** 交互与碰撞（§6.1 障碍/可行走面、§6.4 第一人称）。G 实现，数值在此冻结。 */
export const INTERACTION = Object.freeze({
  player: Object.freeze({
    radius: 0.35,
    height: 1.8,
    eyeHeight: 1.65,
    mass: 74,
  }),
  step: Object.freeze({
    maxStepHeight: 0.5, // 可直接跨上的台阶阈值（米）
    snapDownDistance: 0.6, // 下台阶吸附距离
    rampMaxSlope: 0.62, // 可走坡道最大坡度（tan，约 32°）
    smoothSeconds: 0.18, // 上下台阶平滑过渡
  }),
  jump: Object.freeze({
    /**
     * t2：**启用空格跳跃**（卡面要求）。安全不靠"禁用"而靠三条结构性约束（见 docs/CONTRACTS.md §6.3）：
     *   ① 顶点硬上限 `maxHeight`（≤1.0m，内核再钳一道 1.0）；
     *   ② 空中水平位移仍走同一求解器（包络 `clampToEnvelope` + 障碍体块/门洞 + 可行走面 + 子步进防隧穿）
     *      ⇒ 越不过城墙、出不了宫城；
     *   ③ 落点必须可站立（未被障碍占据、落差 ≤ `step.snapDownDistance`），否则**回起跳点**。
     */
    enabled: true,
    velocity: 0, // 历史字段（保留，不参与判定；起跳速度由 maxHeight+gravity 推得）
    gravity: -18, // 取绝对值使用
    maxHeight: 0.9, // 顶点（米）；内核另有 1.0m 硬上限
    cooldownSeconds: 0.12, // 起跳冷却（连按不叠加）
  }),
  collision: Object.freeze({
    broadphase: 'aabbGrid',
    cellSize: 20,
    slideIterations: 3,
    skin: 0.04,
    clampToEnvelope: true, // 不能掉出宫城包络
  }),
  selection: Object.freeze({
    hoverRadiusPx: 8,
    highlightColor: '#ffc83b',
    highlightPulseMs: 900,
    labelMinZoomDistance: 260, // 拉远时隐藏建筑标签，避免全城重叠
    labelMaxCount: 40,
  }),
});

/** 质量档（§8.2 降级策略）。质量档只影响渲染成本，不改变布局与可走性。 */
export const QUALITY = Object.freeze({
  tiers: Object.freeze({
    high: Object.freeze({
      id: 'high',
      label: '高',
      dpr: 1.5,
      shadowMapSize: 2048,
      shadowEnabled: true,
      bloom: true,
      maxRealtimeLights: 8,
      lodBias: 1.0,
      textureAnisotropy: 8,
      corridorDetail: true,
      foliageInstances: 1.0,
      aa: 'msaa', // t129：高档 MSAA ×4
      aaSamples: 4,
    }),
    medium: Object.freeze({
      id: 'medium',
      label: '中',
      dpr: 1.0, // 预算参考档（§8.2）
      shadowMapSize: 1536,
      shadowEnabled: true,
      bloom: true,
      maxRealtimeLights: 6, // CONFIG 1.0.3：4 → 6（仍 ≤ config.LIGHTING.lamps.maxRealtimePointLights = 8，§8.2 硬约束不变）
      lodBias: 0.75,
      textureAnisotropy: 4,
      corridorDetail: true,
      foliageInstances: 0.85,
      aa: 'msaa', // t129：默认档 MSAA ×2（实测性价比最优，见 docs/handoff-t2-antialias.md）
      aaSamples: 2,
    }),
    low: Object.freeze({
      id: 'low',
      label: '低',
      dpr: 0.85,
      shadowMapSize: 1024,
      shadowEnabled: true,
      bloom: false,
      maxRealtimeLights: 2,
      lodBias: 0.5,
      textureAnisotropy: 2,
      corridorDetail: false,
      foliageInstances: 0.6,
      aa: 'off', // t129：低档关 AA（填充率最紧）
      aaSamples: 0,
    }),
  }),
  default: 'medium',
  order: Object.freeze(['high', 'medium', 'low']),
});

/** 地形与竖向基准（米）。全城只在这里定义地面/水面/桥面标高。 */
export const TERRAIN = Object.freeze({
  cityGroundY: 0, // 宫城内主要地坪
  outerTerrainY: -0.4, // 宫墙外侧地形
  moatWaterY: -3.0, // 护城河常水位
  bridgeDeckY: 0.8, // 桥面标高
  bridgeApproachY: 0, // 桥外侧引道标高
  terraceGroundY: 0, // 主殿广场标高（不得整体抬到 4.5，§2.3）
  innerPalaceY: 0.9, // 后宫地坪（内廷门以北）
  innerGateTerraceY: 0.9, // 内廷门台基
  gardenPathsY: 0.5, // 花园主步道
  gardenGroundY: 0.35, // 花园地坪
  sideCourtY: 0.4, // 东西侧院地坪
  beltY: 0, // 城门内侧带地坪
});

/**
 * 性能预算（§8.2 逐项落地）。这是"初始目标"，实测后由主 Agent 递增版本并记录理由；
 * 任何下游不得自行放宽预算。
 */
export const BUDGET = Object.freeze({
  viewport: Object.freeze({ width: 1440, height: 900, dpr: 1 }),
  fps: Object.freeze({
    target: 60,
    lowTierTarget: 30,
    sampleSeconds: 30,
    metrics: Object.freeze(['avgFps', 'p95FrameMs', 'drawCalls', 'visibleTriangles', 'transferMB']),
    frameMs60: 16.67,
    frameMs30: 33.33,
  }),
  drawCalls: Object.freeze({
    mainSceneMax: 350,
    /** 分区分配（t84 §8.2 重分配）：总和 322 + 保留 28 = 350 = mainSceneMax。
     *  **理由（需求变更，非实现膨胀）**：用户授权的「47→43 栋可进入内景」使各区新增合批后桶数
     *  （t61 官方口径约 +9~12/区）。实测（audit --enforce，LAYOUT 1.1.5 / CONFIG 1.0.7 前）：
     *  B 62/70 ✓ · C **55/50 ✗** · D **49/40 ✗** · E **49/40 ✗** · F 72/80 ✓；
     *  整城门槛仍满足：主场景 **333/350 ✓**、最坏视角 **326/350 ✓**、可见三角面 **306,269/1,500,000 ✓**。
     *  重分配只**放宽分区诊断上限**，**不放宽整城发布门禁**（350 调用 / 1.5M 三角面不变），
     *  也不删除任何建筑/院落/装饰/城墙、不关闭分区检查。 */
    perZone: Object.freeze({ B: 70, C: 60, D: 56, E: 56, F: 80 }),
    reserve: 28,
    shadowPassCounted: true, // 整帧成本需分别记录主场景与含阴影/后处理
    postprocessCounted: true,
    reportFullFrameSeparately: true,
  }),
  triangles: Object.freeze({
    visibleMax: 1_500_000,
    perBuildingMax: 24_000,
    foliageBatchMax: 60_000,
    horizonProxyMax: 8_000,
  }),
  textures: Object.freeze({
    minSize: 1024,
    maxSize: 2048,
    exceptionSize4kAllowed: true,
    exceptionSize4kCondition: '仅重点近景内景确有收益时',
    maxTextureMemoryMB: 320,
    useCompressedFormat: 'ktx2-or-webp',
    shareAtlas: true,
  }),
  loading: Object.freeze({
    firstInteractiveMB: 25,
    totalPackageMB: 120,
    stageStrategy: Object.freeze(['cityLowDetail', 'byZoneDetail', 'interior']),
    requireFailureNotice: true, // 加载失败必须有可见提示与重试
  }),
  shadows: Object.freeze({
    primaryDirectionalLights: 1,
    realtimeLampShadows: 0,
    nearFieldHighQualityRadius: 180,
  }),
  lod: Object.freeze({
    levels: 3,
    nearDistance: 120,
    midDistance: 400,
    farDistance: 1_200,
    imposterBeyond: 1_600,
  }),
  colliders: Object.freeze({
    maxBoxes: 1_200,
    maxMeshColliders: 24,
    gridCellSize: 20,
  }),
});

/**
 * 布局与几何外层约束（机器校验用，与 layout.js 的 ENVELOPE 必须一致；
 * layout.test.mjs 会断言这里的数值与 layout.js 逐字段相等）。
 */
export const LAYOUT_CONSTRAINTS = Object.freeze({
  envelope: Object.freeze({ minX: -300, maxX: 300, minZ: -450, maxZ: 450 }), // §2.3 宫墙内
  central: Object.freeze({ minX: -100, maxX: 100 }), // §2.3 中央区
  forecourtZ: Object.freeze({ minZ: -400, maxZ: 80 }), // §2.3 前朝
  innerPalaceZ: Object.freeze({ minZ: 80, maxZ: 300 }), // §2.3 后宫
  gardenZ: Object.freeze({ minZ: 300, maxZ: 420 }), // §2.3 花园
  wallOuterOverhang: 18, // 宫墙厚 8 + 角楼半宽 10：仅 F 的墙/角楼/城门可外扩
  minSlotCount: 54,
  minCourtyardCount: 13,
  minZoneSlotCount: Object.freeze({ B: 8, C: 8, D: 8, E: 8, F: 10 }),
  minCourtyardByArea: Object.freeze({ forecourt: 3, innerPalace: 3, west: 4, east: 4 }),
});

/** 朝向 → rotationY（弧度）。默认正面朝南 -Z。 */
export const ORIENTATION = Object.freeze({
  /** 正面（-Z）从南起逆时针旋转到目标方向的 Y 轴角度（度）。 */
  rotationYDeg: Object.freeze({ south: 0, east: -90, north: 180, west: 90 }),
  facingVectors: Object.freeze({
    south: Object.freeze({ x: 0, z: -1 }),
    east: Object.freeze({ x: 1, z: 0 }),
    north: Object.freeze({ x: 0, z: 1 }),
    west: Object.freeze({ x: -1, z: 0 }),
  }),
});

/** 分区 → 负责人（文件归属表的机器可读副本；人类可读表见 docs/CONTRACTS.md §9）。 */
export const ZONE_OWNERSHIP = Object.freeze({
  B: Object.freeze({ zone: 'B', name: '中轴前朝', file: 'src/zones/forecourt.js', owner: 't6 (zone-forecourt)' }),
  C: Object.freeze({ zone: 'C', name: '后宫', file: 'src/zones/inner-palace.js', owner: 't7 (zone-inner)' }),
  D: Object.freeze({ zone: 'D', name: '西侧宫苑', file: 'src/zones/west-courts.js', owner: 't10 (zone-forecourt)' }),
  E: Object.freeze({ zone: 'E', name: '东侧宫苑', file: 'src/zones/east-courts.js', owner: 't11 (zone-inner)' }),
  F: Object.freeze({
    zone: 'F',
    name: '御花园、宫墙与边界',
    file: 'src/zones/garden-boundary.js',
    owner: 't8 (zone-garden)',
  }),
});

/** 事件命名（§6.1/§6.2：UI 与键盘发送同一请求事件，统一控制器处理）。 */
export const EVENTS = Object.freeze({
  requestViewMode: 'view:request-mode', // { mode, source }
  requestZoneFocus: 'view:request-zone', // { area, source }
  requestFocusBuilding: 'view:request-focus-building', // { buildingId }
  requestTour: 'tour:request', // { action: 'start'|'pause'|'resume'|'stop', id }
  requestTimePreset: 'env:request-time', // { preset }
  requestQuality: 'env:request-quality', // { tier }
  requestReset: 'view:request-reset',
  stateChange: 'state:change', // { state, changed }
  selectionChange: 'selection:change', // { buildingId, hovered }
  zoneLoaded: 'zone:loaded', // { zone, stats }
  zoneFailed: 'zone:failed', // { zone, error }
  assetsProgress: 'assets:progress', // { loaded, total, stage, mb }
  assetsFailed: 'assets:failed', // { url, error, retriable }
  cameraSettled: 'camera:settled', // { mode, position }
  fpEntered: 'fp:entered', // { position }
  fpExited: 'fp:exited', // { restoredMode }
  fpJumped: 'fp:jumped', // t2 { source, takeoff:{x,y,z,surfaceY}, height }
  fpLanded: 'fp:landed', // t2 { kind:'ground'|'reverted', x,z,surfaceY,drop,peak,reason? }
  blockedByBuilding: 'interaction:blocked-building', // { buildingId, reason }
});

/** state 字段（§6.1）。 */
export const STATE_DEFAULTS = Object.freeze({
  mode: 'browse', // browse | tour | fp
  viewMode: 'oblique', // 1..8 的模式名
  selectedBuildingId: null,
  hoveredBuildingId: null,
  timePreset: 'goldenHour',
  quality: 'medium',
  tourState: Object.freeze({ active: false, paused: false, index: 0, id: null }),
  loading: Object.freeze({ progress: 0, stage: 'idle', failed: null }),
});

/** 渲染与场景管理（§6.1 主 Agent 独占项）。 */
export const RENDERER = Object.freeze({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
  logarithmicDepthBuffer: false,
  maxPixelRatio: 2,
  resizeDebounceMs: 120,
  singleAnimationLoop: true, // §8.3：不允许每个区域各起渲染循环
  sceneRootName: 'palace-city',
  zoneGroupPrefix: 'zone-root:',
});

/** 资产与模型规范（§4.2 统一加工；登记字段见 CONTRACTS §8）。 */
export const ASSETS = Object.freeze({
  runtimeFormat: 'glb',
  unit: 'meter',
  upAxis: 'Y',
  pivot: 'groundCenter',
  requiredFields: Object.freeze([
    'id',
    'sourceUrl',
    'author',
    'license',
    'localPath',
    'normalization',
    'bounds',
    'lod',
    'usedBy',
  ]),
  normalizationDefaults: Object.freeze({
    scale: 1,
    rotationYDeg: 0,
    groundOffsetY: 0,
    colorSpace: 'srgb',
    enableMipmaps: true,
    generateTangents: false,
  }),
  maxSingleModelMB: 14,
  dedupe: true, // 同一份模型/贴图只保留一份运行时资源
  localVendorRoot: './public/vendor/three',
});

/** 递归冻结：保证下游任何层级都不可就地改写。 */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/** 导出给下游的单一冻结对象（推荐 `import { CONFIG } from './config.js'`）。 */
export const CONFIG = deepFreeze({
  CONFIG_VERSION,
  STYLE_BASELINE,
  SCENE_SEED,
  COLORS,
  COLORS_DERIVED,
  COLOR_ROLES,
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
  INTERACTION,
  QUALITY,
  TERRAIN,
  BUDGET,
  LAYOUT_CONSTRAINTS,
  ORIENTATION,
  ZONE_OWNERSHIP,
  EVENTS,
  STATE_DEFAULTS,
  RENDERER,
  ASSETS,
});

export default CONFIG;
