/**
 * 紫禁天朝 · 全局配置（主 Agent 维护）
 * 所有数值为代码内唯一来源；区域模块只读消费，不自行覆盖。
 */

export const VERSION = 'v1.0.0';
export const BASELINE = 'style-baseline-v1';

export const PALETTE = {
  roofGold: 0xd9a01a,
  roofGoldDeep: 0xb5790d,
  roofInk: 0x8c5a08,
  ridgeGold: 0xffc83b,
  wallRed: 0x9c2b23,
  wallRedDeep: 0x74201b,
  marble: 0xf1ede2,
  marbleShade: 0xd6cfbe,
  marbleDark: 0xb9b2a1,
  paving: 0x585754,
  pavingLight: 0x6d6c66,
  pavingDark: 0x45443f,
  paintingGreen: 0x1c4e40,
  paintingBlue: 0x1c3f66,
  woodRed: 0x8a2a20,
  woodDark: 0x4a2b1c,
  gold: 0xffc83b,
  goldDeep: 0xc99a20,
  bronze: 0x6d6440,
  brickGold: 0x1d1c19,
  foliage: 0x3c6a37,
  foliageLight: 0x59863f,
  blossom: 0xe6a6bb,
  rock: 0x807c73,
  rockDark: 0x5f5c55,
  water: 0x2f5468,
  terrain: 0x4a5240,
  soil: 0x6b6355,
  paperWhite: 0xf7f4ec,
  lanternRed: 0xd4402c
};

export const WORLD = {
  unit: 'm',
  enclosure: { x0: -300, x1: 300, z0: -420, z1: 420 },
  centerStrip: { x0: -100, x1: 100 },
  wall: { thickness: 12, height: 12, coping: 1.6 },
  groundY: 0,
  terrainY: -0.8,
  waterY: -1.7,
  moat: { innerX: 322, outerX: 366, innerZ: 442, outerZ: 486 },
  outerTerrain: { x: 760, z: 900 },
  central: {
    terrace: [
      { x0: -74, x1: 74, z0: -160, z1: 100, y: 1.5 },
      { x0: -66, x1: 66, z0: -152, z1: 94, y: 3.0 },
      { x0: -58, x1: 58, z0: -144, z1: 88, y: 4.5 }
    ],
    innerTerrace: [
      { x0: -52, x1: 52, z0: 152, z1: 232, y: 1.5 },
      { x0: -46, x1: 46, z0: 158, z1: 226, y: 3.0 }
    ]
  },
  fp: { eye: 1.65, radius: 0.36, stepUp: 0.55, walk: 3.4, run: 6.4 }
};

export const TIME_PRESETS = {
  day: {
    id: 'day', name: '盛世金辉',
    sun: { color: 0xfff2da, intensity: 5.2, elevation: 54, azimuth: 132 },
    hemi: { sky: 0xa8c8ef, ground: 0x6d6552, intensity: 1.25 },
    ambient: { color: 0xd8e4f7, intensity: 0.38 },
    sky: { top: 0x1f5fa8, horizon: 0xa8c4dd, ground: 0x7d8578, sunTint: 0xfff3da },
    fog: { color: 0xa9c2d6, density: 0.00022 },
    exposure: 1.0, bloom: 0.16, lantern: 0.0, wp: 0
  },
  dusk: {
    id: 'dusk', name: '落霞夕照',
    sun: { color: 0xffab5e, intensity: 4.4, elevation: 11, azimuth: 254 },
    hemi: { sky: 0xc07a52, ground: 0x3a2f2a, intensity: 1.0 },
    ambient: { color: 0xffc9a0, intensity: 0.32 },
    sky: { top: 0x1e2a5e, horizon: 0xe08748, ground: 0x4f3d31, sunTint: 0xffd0a0 },
    fog: { color: 0xb07a52, density: 0.00034 },
    exposure: 0.98, bloom: 0.5, lantern: 0.5, wp: 1
  },
  night: {
    id: 'night', name: '寒月宫灯',
    sun: { color: 0x9fb6e8, intensity: 0.8, elevation: 48, azimuth: 44 },
    hemi: { sky: 0x203a66, ground: 0x101218, intensity: 0.75 },
    ambient: { color: 0x35507a, intensity: 0.3 },
    sky: { top: 0x04091a, horizon: 0x14213e, ground: 0x0a0e1a, sunTint: 0xcfe0ff },
    fog: { color: 0x0e1730, density: 0.00045 },
    exposure: 1.05, bloom: 0.9, lantern: 1.5, wp: 1
  }
};

export const QUALITY = {
  high: { id: 'high', name: '精细', dpr: 1.0, shadow: 2048, shadowArea: 420, bloom: true, treeScale: 1.0, corridor: true, lodDistance: 900 },
  medium: { id: 'medium', name: '均衡', dpr: 0.85, shadow: 1536, shadowArea: 340, bloom: true, treeScale: 0.75, corridor: true, lodDistance: 700 },
  low: { id: 'low', name: '流畅', dpr: 0.7, shadow: 0, shadowArea: 0, bloom: false, treeScale: 0.5, corridor: false, lodDistance: 480 }
};

export const VIEW_MODES = [
  { id: 'oblique', key: '1', name: '全城鸟瞰', hint: '南侧高位斜俯视' },
  { id: 'iso', key: '2', name: '等距沙盘', hint: '45°/35.26° 正交' },
  { id: 'axis', key: '3', name: '中轴透视', hint: '沿中轴向北' },
  { id: 'zone', key: '4', name: '分区视角', hint: '七分区机位' },
  { id: 'focus', key: '5', name: '建筑近景', hint: '选中建筑 3/4 取景' },
  { id: 'interior', key: '6', name: '室内视角', hint: '金銮殿 / 寝殿' },
  { id: 'fp', key: '7', name: '第一人称', hint: '漫游走查' },
  { id: 'orbit', key: '8', name: '自由环绕', hint: '环绕当前焦点' }
];

export const UI = {
  transitionMs: 1200,
  uiMs: 180,
  radius: 4,
  space: [4, 8, 12, 16, 24, 32],
  panel: 'rgba(14,14,18,0.82)',
  panelBorder: 'rgba(255,200,59,0.35)',
  seal: '#962822',
  text: '#f2ece0',
  textDim: 'rgba(242,236,224,0.62)',
  gold: '#ffc83b',
  titleFont: '"Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC",serif',
  bodyFont: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
};

export const SEEDS = {
  global: 20260926,
  zones: { B: 1101, C: 1202, D: 1303, E: 1404, F: 1505 }
};

export const BUDGET = {
  drawCalls: 350,
  triangles: 1500000,
  initialTransferMB: 25
};

export const SUN_SHADOW_FOCUS = { x: 0, z: -40 };
