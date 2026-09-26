import { CITY } from './config.js';

export const ZONES = {
  forecourt: { id: 'forecourt', name: '前朝', minX: -110, maxX: 110, minZ: -400, maxZ: 60, color: '#c8a24a' },
  inner: { id: 'inner', name: '后宫', minX: -120, maxX: 120, minZ: 60, maxZ: 290, color: '#b0714f' },
  west: { id: 'west', name: '西宫苑', minX: -290, maxX: -115, minZ: -340, maxZ: 285, color: '#7d8fa8' },
  east: { id: 'east', name: '东宫苑', minX: 115, maxX: 290, minZ: -340, maxZ: 285, color: '#7d8fa8' },
  garden: { id: 'garden', name: '御花园', minX: -160, maxX: 160, minZ: 290, maxZ: 430, color: '#5f8a5c' },
  boundary: { id: 'boundary', name: '城墙与护城河', minX: -345, maxX: 345, minZ: -495, maxZ: 495, color: '#8c8c8c' }
};

export const CONNECTORS = [
  { id: 'conn.south-bridge', x: 0, z: -472, w: 26, elev: 0, owner: 'boundary', a: 'outside', b: 'outside', name: '南桥' },
  { id: 'conn.south-gate', x: 0, z: -450, w: 34, elev: 0, owner: 'boundary', a: 'outside', b: 'forecourt', name: '南城门' },
  { id: 'conn.north-gate', x: 0, z: 450, w: 30, elev: 0, owner: 'boundary', a: 'garden', b: 'outside', name: '北城门' },
  { id: 'conn.north-bridge', x: 0, z: 472, w: 22, elev: 0, owner: 'boundary', a: 'outside', b: 'outside', name: '北桥' },
  { id: 'conn.west-gate', x: -300, z: 0, w: 24, elev: 0, owner: 'boundary', a: 'west', b: 'outside', name: '西城门' },
  { id: 'conn.east-gate', x: 300, z: 0, w: 24, elev: 0, owner: 'boundary', a: 'east', b: 'outside', name: '东城门' },
  { id: 'conn.west-bridge', x: -322, z: 0, w: 22, elev: 0, owner: 'boundary', a: 'outside', b: 'outside', name: '西桥' },
  { id: 'conn.east-bridge', x: 322, z: 0, w: 22, elev: 0, owner: 'boundary', a: 'outside', b: 'outside', name: '东桥' },
  { id: 'conn.inner-south', x: 0, z: 62, w: 30, elev: 0, owner: 'inner', a: 'forecourt', b: 'inner', name: '内廷门' },
  { id: 'conn.garden-south', x: 0, z: 292, w: 26, elev: 0, owner: 'garden', a: 'inner', b: 'garden', name: '花园门' },
  { id: 'conn.forecourt-west', x: -112, z: -180, w: 16, elev: 0, owner: 'west', a: 'forecourt', b: 'west', name: '前朝西便门' },
  { id: 'conn.forecourt-east', x: 112, z: -180, w: 16, elev: 0, owner: 'east', a: 'forecourt', b: 'east', name: '前朝东便门' },
  { id: 'conn.inner-west', x: -117, z: 180, w: 14, elev: 0, owner: 'west', a: 'inner', b: 'west', name: '后宫西便门' },
  { id: 'conn.inner-east', x: 117, z: 180, w: 14, elev: 0, owner: 'east', a: 'inner', b: 'east', name: '后宫东便门' }
];

const SIDE_COURT_Z = [-250, -100, 50, 200];

function westCourtSlots() {
  const out = [];
  SIDE_COURT_Z.forEach((cz, i) => {
    const n = i + 1;
    out.push({ id: `d.c${n}.main`, zone: 'west', kind: 'hall', name: `西宫苑${n}院正殿`, x: -252, z: cz, w: 40, d: 18, bays: 5, rot: 90, tier: 'major', terrace: true, info: '西侧宫苑院落正殿，礼乐与书院陈设。' });
    out.push({ id: `d.c${n}.side-n`, zone: 'west', kind: 'sideHall', name: `西宫苑${n}院北配房`, x: -196, z: cz + 52, w: 26, d: 13, bays: 3, rot: 180, tier: 'minor', info: '院落的北侧配房。' });
    out.push({ id: `d.c${n}.side-s`, zone: 'west', kind: 'sideHall', name: `西宫苑${n}院南配房`, x: -196, z: cz - 52, w: 26, d: 13, bays: 3, rot: 0, tier: 'minor', info: '院落的南侧配房。' });
    out.push({ id: `d.c${n}.gate`, zone: 'west', kind: 'courtyardGate', name: `西宫苑${n}院门`, x: -128, z: cz, w: 22, d: 12, bays: 3, rot: 90, tier: 'minor', info: '通往西宫苑院落的门。' });
  });
  return out;
}

function eastCourtSlots() {
  const out = [];
  SIDE_COURT_Z.forEach((cz, i) => {
    const n = i + 1;
    out.push({ id: `e.c${n}.main`, zone: 'east', kind: 'hall', name: `东宫苑${n}院正殿`, x: 252, z: cz, w: 40, d: 18, bays: 5, rot: 270, tier: 'major', terrace: true, info: '东侧宫苑院落正殿，文华与陈设。' });
    out.push({ id: `e.c${n}.side-n`, zone: 'east', kind: 'sideHall', name: `东宫苑${n}院北配房`, x: 196, z: cz + 52, w: 26, d: 13, bays: 3, rot: 180, tier: 'minor', info: '院落的北侧配房。' });
    out.push({ id: `e.c${n}.side-s`, zone: 'east', kind: 'sideHall', name: `东宫苑${n}院南配房`, x: 196, z: cz - 52, w: 26, d: 13, bays: 3, rot: 0, tier: 'minor', info: '院落的南侧配房。' });
    out.push({ id: `e.c${n}.gate`, zone: 'east', kind: 'courtyardGate', name: `东宫苑${n}院门`, x: 128, z: cz, w: 22, d: 12, bays: 3, rot: 270, tier: 'minor', info: '通往东宫苑院落的门。' });
  });
  return out;
}

export const SLOTS = {
  forecourt: [
    { id: 'b.gate-south', zone: 'forecourt', kind: 'gateHall', name: '前朝南门', x: 0, z: -372, w: 52, d: 22, bays: 5, rot: 0, tier: 'major', info: '前朝南起重檐门殿。' },
    { id: 'b.court-a-w', zone: 'forecourt', kind: 'sideHall', name: '朝房西', x: -74, z: -372, w: 26, d: 14, bays: 3, rot: 0, tier: 'minor', info: '门殿前的朝房。' },
    { id: 'b.court-a-e', zone: 'forecourt', kind: 'sideHall', name: '朝房东', x: 74, z: -372, w: 26, d: 14, bays: 3, rot: 0, tier: 'minor', info: '门殿前的朝房。' },
    { id: 'b.gate-mid', zone: 'forecourt', kind: 'gateHall', name: '前朝中门', x: 0, z: -252, w: 46, d: 20, bays: 5, rot: 0, tier: 'major', info: '进入礼仪广场的门殿。' },
    { id: 'b.main-hall', zone: 'forecourt', kind: 'hall', name: '金銮殿', x: 0, z: -120, w: 104, d: 50, bays: 9, rot: 0, tier: 'royal', double: true, terrace: true, visitable: true, info: '三层白石台基上的重檐庑殿顶主殿，可进入参观。' },
    { id: 'b.main-w', zone: 'forecourt', kind: 'sideHall', name: '前朝西配殿', x: -96, z: -120, w: 30, d: 15, bays: 3, rot: 0, tier: 'major', info: '主殿西侧配殿。' },
    { id: 'b.main-e', zone: 'forecourt', kind: 'sideHall', name: '前朝东配殿', x: 96, z: -120, w: 30, d: 15, bays: 3, rot: 0, tier: 'major', info: '主殿东侧配殿。' },
    { id: 'b.mid-hall', zone: 'forecourt', kind: 'hall', name: '中殿', x: 0, z: -16, w: 66, d: 32, bays: 7, rot: 0, tier: 'major', info: '前朝中段殿堂。' },
    { id: 'b.mid-w', zone: 'forecourt', kind: 'sideHall', name: '中殿西配殿', x: -86, z: -16, w: 28, d: 14, bays: 3, rot: 0, tier: 'minor', info: '中殿西侧配殿。' },
    { id: 'b.mid-e', zone: 'forecourt', kind: 'sideHall', name: '中殿东配殿', x: 86, z: -16, w: 28, d: 14, bays: 3, rot: 0, tier: 'minor', info: '中殿东侧配殿。' },
    { id: 'b.rear-hall', zone: 'forecourt', kind: 'hall', name: '前朝后殿', x: 0, z: 36, w: 58, d: 28, bays: 7, rot: 0, tier: 'major', info: '前朝北端殿堂。' },
    { id: 'b.rear-w', zone: 'forecourt', kind: 'sideHall', name: '后殿西配房', x: -72, z: 36, w: 24, d: 12, bays: 3, rot: 0, tier: 'minor', info: '后殿西侧配房。' },
    { id: 'b.rear-e', zone: 'forecourt', kind: 'sideHall', name: '后殿东配房', x: 72, z: 36, w: 24, d: 12, bays: 3, rot: 0, tier: 'minor', info: '后殿东侧配房。' }
  ],
  inner: [
    { id: 'c.gate-inner', zone: 'inner', kind: 'courtyardGate', name: '内廷门', x: 0, z: 104, w: 36, d: 16, bays: 3, rot: 0, tier: 'major', info: '前朝与后宫之间的内廷门。' },
    { id: 'c.hall-1', zone: 'inner', kind: 'hall', name: '坤宁寝殿', x: 0, z: 160, w: 76, d: 38, bays: 7, rot: 0, tier: 'royal', double: true, terrace: true, visitable: true, info: '后宫核心寝殿，可进入参观内景。' },
    { id: 'c.side-a-w', zone: 'inner', kind: 'sideHall', name: '寝殿西配房', x: -78, z: 150, w: 30, d: 15, bays: 3, rot: 0, tier: 'minor', info: '寝殿西侧配房。' },
    { id: 'c.side-a-e', zone: 'inner', kind: 'sideHall', name: '寝殿东配房', x: 78, z: 150, w: 30, d: 15, bays: 3, rot: 0, tier: 'minor', info: '寝殿东侧配房。' },
    { id: 'c.gate-2', zone: 'inner', kind: 'courtyardGate', name: '内廷二门', x: 0, z: 212, w: 30, d: 14, bays: 3, rot: 0, tier: 'minor', info: '内廷第二进院落之门。' },
    { id: 'c.hall-2', zone: 'inner', kind: 'hall', name: '后苑殿', x: 0, z: 252, w: 60, d: 30, bays: 7, rot: 0, tier: 'major', info: '后宫北进殿堂。' },
    { id: 'c.side-b-w', zone: 'inner', kind: 'sideHall', name: '后苑西配房', x: -58, z: 258, w: 24, d: 12, bays: 3, rot: 0, tier: 'minor', info: '后苑西侧配房。' },
    { id: 'c.side-b-e', zone: 'inner', kind: 'sideHall', name: '后苑东配房', x: 58, z: 258, w: 24, d: 12, bays: 3, rot: 0, tier: 'minor', info: '后苑东侧配房。' }
  ],
  west: westCourtSlots(),
  east: eastCourtSlots(),
  garden: [
    { id: 'f.gate-garden', zone: 'garden', kind: 'courtyardGate', name: '御花园门', x: 0, z: 306, w: 34, d: 16, bays: 3, rot: 0, tier: 'major', info: '后宫通往御花园的园门。' },
    { id: 'f.pavilion-main', zone: 'garden', kind: 'pavilion', name: '御景亭', x: 0, z: 368, w: 30, d: 30, bays: 3, rot: 0, tier: 'royal', info: '御花园中央方亭，攒尖金顶。' },
    { id: 'f.pavilion-w', zone: 'garden', kind: 'pavilion', name: '西水亭', x: -92, z: 356, w: 16, d: 16, bays: 3, rot: 0, tier: 'minor', info: '园西小亭。' },
    { id: 'f.pavilion-e', zone: 'garden', kind: 'pavilion', name: '东水亭', x: 92, z: 356, w: 16, d: 16, bays: 3, rot: 0, tier: 'minor', info: '园东小亭。' },
    { id: 'f.hall-garden', zone: 'garden', kind: 'hall', name: '观花殿', x: 0, z: 418, w: 48, d: 24, bays: 5, rot: 180, tier: 'major', info: '花园北端观景殿。' },
    { id: 'f.hall-w', zone: 'garden', kind: 'sideHall', name: '园西书斋', x: -124, z: 414, w: 30, d: 15, bays: 3, rot: 180, tier: 'minor', info: '园西小书斋。' },
    { id: 'f.hall-e', zone: 'garden', kind: 'sideHall', name: '园东茶房', x: 124, z: 414, w: 30, d: 15, bays: 3, rot: 180, tier: 'minor', info: '园东茶房。' }
  ],
  boundary: [
    { id: 'f.gate-south', zone: 'boundary', kind: 'gateHall', name: '南城门', x: 0, z: -450, w: 46, d: 26, bays: 5, rot: 0, tier: 'royal', drum: true, info: '宫城正南门，城台之上重檐城楼。' },
    { id: 'f.gate-north', zone: 'boundary', kind: 'gateHall', name: '北城门', x: 0, z: 450, w: 40, d: 22, bays: 5, rot: 180, tier: 'major', drum: true, info: '宫城北门。' },
    { id: 'f.gate-west', zone: 'boundary', kind: 'gateHall', name: '西城门', x: -300, z: 0, w: 38, d: 20, bays: 3, rot: 90, tier: 'major', drum: true, info: '宫城西门。' },
    { id: 'f.gate-east', zone: 'boundary', kind: 'gateHall', name: '东城门', x: 300, z: 0, w: 38, d: 20, bays: 3, rot: 270, tier: 'major', drum: true, info: '宫城东门。' },
    { id: 'f.corner-nw', zone: 'boundary', kind: 'cornerTower', name: '西北角楼', x: -292, z: -442, w: 20, d: 20, rot: 0, tier: 'royal', info: '宫城西北角楼。' },
    { id: 'f.corner-ne', zone: 'boundary', kind: 'cornerTower', name: '东北角楼', x: 292, z: -442, w: 20, d: 20, rot: 0, tier: 'royal', info: '宫城东北角楼。' },
    { id: 'f.corner-sw', zone: 'boundary', kind: 'cornerTower', name: '西南角楼', x: -292, z: 442, w: 20, d: 20, rot: 0, tier: 'royal', info: '宫城西南角楼。' },
    { id: 'f.corner-se', zone: 'boundary', kind: 'cornerTower', name: '东南角楼', x: 292, z: 442, w: 20, d: 20, rot: 0, tier: 'royal', info: '宫城东南角楼。' }
  ]
};

export const CORRIDORS = {
  forecourt: [
    { x: -108, z: -300, len: 210, axis: 'z' },
    { x: 108, z: -300, len: 210, axis: 'z' },
    { x: -108, z: -60, len: 140, axis: 'z' },
    { x: 108, z: -60, len: 140, axis: 'z' },
    { x: -56, z: -196, len: 96, axis: 'x' },
    { x: 56, z: -196, len: 96, axis: 'x' }
  ],
  inner: [
    { x: -96, z: 170, len: 150, axis: 'z' },
    { x: 96, z: 170, len: 150, axis: 'z' },
    { x: -70, z: 250, len: 90, axis: 'z' },
    { x: 70, z: 250, len: 90, axis: 'z' }
  ],
  west: SIDE_COURT_Z.map((cz) => ({ x: -200, z: cz - 62, len: 150, axis: 'x' })),
  east: SIDE_COURT_Z.map((cz) => ({ x: 200, z: cz - 62, len: 150, axis: 'x' })),
  garden: [
    { x: -130, z: 344, len: 120, axis: 'z' },
    { x: 130, z: 344, len: 120, axis: 'z' }
  ],
  boundary: []
};

export const ROADS = [
  { x: 0, z: -25, w: 34, d: 850, kind: 'axis' },
  { x: 0, z: -160, w: 212, d: 220, kind: 'plaza' },
  { x: 0, z: -470, w: 26, d: 62, kind: 'path' },
  { x: -205, z: 0, w: 190, d: 26, kind: 'path' },
  { x: 205, z: 0, w: 190, d: 26, kind: 'path' },
  { x: -205, z: 210, w: 190, d: 24, kind: 'path' },
  { x: 205, z: 210, w: 190, d: 24, kind: 'path' },
  { x: 0, z: 200, w: 22, d: 120, kind: 'path' },
  { x: 0, z: 268, w: 22, d: 70, kind: 'path' },
  { x: 0, z: 342, w: 234, d: 16, kind: 'path' },
  { x: 0, z: 404, w: 234, d: 16, kind: 'path' },
  { x: -118, z: 373, w: 16, d: 70, kind: 'path' },
  { x: 118, z: 373, w: 16, d: 70, kind: 'path' },
  ...SIDE_COURT_Z.map((cz) => ({ x: -200, z: cz, w: 166, d: 18, kind: 'court' })),
  ...SIDE_COURT_Z.map((cz) => ({ x: 200, z: cz, w: 166, d: 18, kind: 'court' }))
];

export const PONDS = [
  { x: -64, z: 390, r: 32, kind: 'pond' },
  { x: 64, z: 390, r: 28, kind: 'pond' },
  { x: -205, z: -100, r: 22, kind: 'pond' },
  { x: 205, z: 50, r: 20, kind: 'pond' }
];

export const TREES = {
  forecourt: { count: 48, areas: [{ x: 0, z: -290, w: 190, d: 150 }] },
  inner: { count: 36, areas: [{ x: 0, z: 175, w: 210, d: 130 }] },
  west: { count: 130, areas: [{ x: -205, z: -30, w: 168, d: 600 }] },
  east: { count: 130, areas: [{ x: 205, z: -30, w: 168, d: 600 }] },
  garden: { count: 170, areas: [{ x: 0, z: 368, w: 300, d: 120 }] },
  boundary: { count: 90, areas: [{ x: 0, z: 0, w: 120, d: 900 }, { x: 0, z: 0, w: 690, d: 120 }] }
};

export const COURTYARDS = [
  { id: 'court.b.south', zone: 'forecourt', name: '前朝南院', minX: -104, maxX: 104, minZ: -400, maxZ: -300 },
  { id: 'court.b.plaza', zone: 'forecourt', name: '礼仪广场', minX: -104, maxX: 104, minZ: -300, maxZ: -180 },
  { id: 'court.b.mid', zone: 'forecourt', name: '前朝中院', minX: -104, maxX: 104, minZ: -180, maxZ: -40 },
  { id: 'court.b.rear', zone: 'forecourt', name: '前朝后苑', minX: -104, maxX: 104, minZ: -40, maxZ: 60 },
  { id: 'court.c.a', zone: 'inner', name: '内廷前院', minX: -96, maxX: 96, minZ: 60, maxZ: 190 },
  { id: 'court.c.b', zone: 'inner', name: '内廷中院', minX: -70, maxX: 70, minZ: 190, maxZ: 236 },
  { id: 'court.c.c', zone: 'inner', name: '内廷后院', minX: -70, maxX: 70, minZ: 236, maxZ: 290 },
  ...SIDE_COURT_Z.map((cz, i) => ({ id: 'court.d' + (i + 1), zone: 'west', name: '西宫苑' + (i + 1) + '院', minX: -290, maxX: -120, minZ: cz - 70, maxZ: cz + 70 })),
  ...SIDE_COURT_Z.map((cz, i) => ({ id: 'court.e' + (i + 1), zone: 'east', name: '东宫苑' + (i + 1) + '院', minX: 120, maxX: 290, minZ: cz - 70, maxZ: cz + 70 })),
  { id: 'court.f.garden', zone: 'garden', name: '御花园', minX: -160, maxX: 160, minZ: 290, maxZ: 430 },
  { id: 'court.f.southgate', zone: 'boundary', name: '南城门前院', minX: -46, maxX: 46, minZ: -462, maxZ: -370 },
  { id: 'court.f.northgate', zone: 'boundary', name: '北城门内院', minX: -42, maxX: 42, minZ: 360, maxZ: 462 }
];

export const CITY_BOUNDS = { minX: -CITY.halfX, maxX: CITY.halfX, minZ: -CITY.halfZ, maxZ: CITY.halfZ };

export function boundsOfZone(zoneId) {
  const z = ZONES[zoneId];
  return { min: [z.minX, 0, z.minZ], max: [z.maxX, 0, z.maxZ] };
}

export function slotsOf(zoneId) {
  return SLOTS[zoneId] || [];
}

export function connectorById(id) {
  return CONNECTORS.find((c) => c.id === id) || null;
}
