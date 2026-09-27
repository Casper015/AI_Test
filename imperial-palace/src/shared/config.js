export const CONFIG = Object.freeze({
  version: '1.0.0',
  layoutVersion: '1.0.0',
  styleVersion: '1.0.0',
  seed: 260926,
  bounds: { minX: -280, maxX: 280, minZ: -410, maxZ: 410 },
  colors: {
    roof: 0xdfa112,
    roofLight: 0xf4c653,
    red: 0x962822,
    redDeep: 0x631d1b,
    stone: 0xf0ece1,
    jade: 0x1c4e40,
    paving: 0x575652,
    gold: 0xffc83b,
    wood: 0x493126,
    garden: 0x304a39,
    water: 0x486b70,
  },
  palette: {
    day: { sky: 0x7e9591, fog: 0x7e9591, sun: 0xffe7c2, sunIntensity: 2.0, ambient: 0.95 },
    dusk: { sky: 0x875d54, fog: 0x875d54, sun: 0xff9660, sunIntensity: 1.55, ambient: 0.72 },
    night: { sky: 0x101a29, fog: 0x101a29, sun: 0x8199c4, sunIntensity: 0.48, ambient: 0.35 },
  },
  zones: {
    all: { label: '全城鸟瞰', target: [0, 0, 0], camera: [690, 760, -970], zoom: 1 },
    forecourt: { label: '中轴前朝', target: [0, 8, -205], camera: [620, 560, -720], zoom: 1 },
    hall: { label: '金銮主殿', target: [0, 10, -205], camera: [320, 300, -420], zoom: 1.1 },
    inner: { label: '后宫内廷', target: [0, 8, 195], camera: [470, 490, -390], zoom: 1 },
    west: { label: '西侧宫苑', target: [-172, 8, -40], camera: [410, 390, -480], zoom: 1 },
    east: { label: '东侧宫苑', target: [172, 8, -40], camera: [410, 390, -480], zoom: 1 },
    garden: { label: '御花园', target: [0, 6, 350], camera: [390, 430, -330], zoom: 1 },
  },
});

export const ZONE_NAMES = Object.freeze({
  forecourt: '中轴前朝',
  inner: '后宫内廷',
  west: '西侧宫苑',
  east: '东侧宫苑',
  garden: '御花园',
  boundary: '宫城边界',
});
