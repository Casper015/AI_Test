export const STYLE_VERSION = 'v1.0';

export const PALETTE = {
  roofGold: 0xdfa112,
  roofGoldDark: 0xbe8610,
  roofGoldLight: 0xeeb63a,
  ridge: 0xffc83b,
  goldTrim: 0xffc83b,
  wallRed: 0x962822,
  wallRedDark: 0x7a1f1b,
  stone: 0xf0ece1,
  stoneDark: 0xd8d2c4,
  stoneSide: 0xbdb6a6,
  paving: 0x575652,
  pavingWarm: 0x6a675f,
  goldFloor: 0x1a1917,
  caihuaGreen: 0x1c4e40,
  caihuaBlue: 0x1d3f66,
  caihuaWhite: 0xe8e4d8,
  wood: 0x6f2b22,
  woodDark: 0x54211a,
  water: 0x2e4a52,
  waterDeep: 0x1d3339,
  treeA: 0x2f5d3a,
  treeB: 0x3a6c42,
  trunk: 0x4a3a2c,
  grass: 0x35563a,
  rock: 0x8d8a80,
  bronze: 0x6b5b3e,
  dark: 0x1a1917
};

export const SKY = {
  golden: { top: 0x8fb4d8, bottom: 0xe8d9b4, fog: 0xcfc3a6, sun: 0xfff0cf, hemi: 0x9fb6d0, ground: 0x6b6350, exposure: 1.0 },
  dusk: { top: 0x3b4a72, bottom: 0xe0a173, fog: 0x9c7a6a, sun: 0xffb877, hemi: 0x6b7ba0, ground: 0x4a4034, exposure: 1.02 },
  night: { top: 0x0a1024, bottom: 0x1b2740, fog: 0x121a2c, sun: 0x9fb6e8, hemi: 0x2c3a58, ground: 0x14161c, exposure: 1.12 }
};

export const ROOF = { overhang: 0.18, lift: 0.55, curve: 1.25, ridgeH: 0.7, fasciaH: 0.35, gridX: 14, gridZ: 10 };

export const VIEWS = {
  oblique: { position: [0, 520, -880], target: [0, 20, -40], fov: 42 },
  iso: { position: [640, 780, 640], target: [0, 0, 0], fov: 34, ortho: true, orthoSize: 1200 },
  axis: { position: [0, 48, -620], target: [0, 28, -70], fov: 46 },
  orbit: { target: [0, 24, -140], radius: 780, polar: 1.02, azimuth: 0.55 }
};

export const ZONE_VIEWS = {
  'zone.main-hall': { name: '前朝主殿', position: [0, 132, -336], target: [0, 30, -120], fov: 38 },
  'zone.inner': { name: '后宫', position: [0, 118, -6], target: [0, 24, 200], fov: 40 },
  'zone.west': { name: '西宫苑', position: [-430, 158, -40], target: [-205, 8, -70], fov: 40 },
  'zone.east': { name: '东宫苑', position: [430, 158, -40], target: [205, 8, -70], fov: 40 },
  'zone.garden': { name: '御花园', position: [0, 158, 570], target: [0, 18, 368], fov: 40 },
  'zone.gate-south': { name: '南城门', position: [0, 128, -648], target: [0, 26, -450], fov: 40 }
};

export const TIME_PRESETS = {
  golden: { label: '盛世金辉', sunDir: [-0.55, 0.72, 0.42], sunIntensity: 2.1, hemiIntensity: 0.85, ambient: 0.22, fogNear: 700, fogFar: 2100, lanterns: 0.15 },
  dusk: { label: '落霞夕照', sunDir: [0.86, 0.3, 0.3], sunIntensity: 1.5, hemiIntensity: 0.62, ambient: 0.2, fogNear: 480, fogFar: 1500, lanterns: 0.6 },
  night: { label: '寒月宫灯', sunDir: [0.35, 0.55, 0.75], sunIntensity: 0.5, hemiIntensity: 0.34, ambient: 0.16, fogNear: 380, fogFar: 1250, lanterns: 1 }
};

export const QUALITY = {
  high: { dpr: 1.5, shadows: true, shadowMap: 2048, lodBias: 0, treeScale: 1, particles: 1 },
  medium: { dpr: 1, shadows: true, shadowMap: 1024, lodBias: 0.25, treeScale: 0.8, particles: 0.7 },
  low: { dpr: 1, shadows: false, shadowMap: 512, lodBias: 0.7, treeScale: 0.55, particles: 0.35 }
};

export const UI_TOKENS = { spacing: [4, 8, 12, 16, 24, 32], radius: 4, transitionMs: 180, cameraMs: 1200 };

export const FP = { eye: 1.65, speed: 9, sprint: 22, step: 0.55, radius: 0.45, maxFall: 0.7 };

export const CITY = { halfX: 300, halfZ: 450, wallH: 10.5, wallT: 3, moatW: 42, moatDepth: 3.2 };

export const VIEW_MODES = [
  { id: 'oblique', key: '1', label: '全城鸟瞰' },
  { id: 'iso', key: '2', label: '等距沙盘' },
  { id: 'axis', key: '3', label: '中轴透视' },
  { id: 'zone', key: '4', label: '分区视角' },
  { id: 'focus', key: '5', label: '建筑近景' },
  { id: 'interior', key: '6', label: '室内视角' },
  { id: 'fp', key: 'F', label: '第一人称' },
  { id: 'orbit', key: '8', label: '自由环绕' }
];

export const ASSET_INFO = {
  models: [],
  textures: [],
  fonts: [],
  note: 'v0.9 全部为程序化几何与 Canvas 贴图，无第三方模型；A 引入的外部资源登记后补全'
};
