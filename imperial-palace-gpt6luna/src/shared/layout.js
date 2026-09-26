export const BOUNDS = Object.freeze({ minX: -300, maxX: 300, minZ: -450, maxZ: 450 });

export const CONNECTORS = Object.freeze({
  southGate: { id: 'gate-south', position: [0, 0, -430], width: 34, targetZone: 'forecourt' },
  forecourtSouth: { id: 'forecourt-south', position: [0, 0, -398], width: 38, targetZone: 'forecourt' },
  forecourtInner: { id: 'axial-inner', position: [0, 0, 83], width: 30, targetZone: 'inner' },
  innerGarden: { id: 'inner-garden', position: [0, 0, 302], width: 24, targetZone: 'garden' },
  westSouth: { id: 'west-south', position: [-104, 0, -180], width: 14, targetZone: 'west' },
  westNorth: { id: 'west-north', position: [-104, 0, 180], width: 14, targetZone: 'west' },
  eastSouth: { id: 'east-south', position: [104, 0, -180], width: 14, targetZone: 'east' },
  eastNorth: { id: 'east-north', position: [104, 0, 180], width: 14, targetZone: 'east' },
  gateNorth: { id: 'gate-north', position: [0, 0, 430], width: 26, targetZone: 'garden' },
  gateWest: { id: 'gate-west', position: [-284, 0, 0], width: 22, targetZone: 'west' },
  gateEast: { id: 'gate-east', position: [284, 0, 0], width: 22, targetZone: 'east' }
});

export const VIEWS = Object.freeze({
  overview: { label: '宫城总览', position: [900, 920, -1160], target: [0, 0, 10] },
  south: { label: '午门 · 南城门', position: [240, 185, -605], target: [0, 18, -360] },
  forecourt: { label: '前朝 · 礼仪广场', position: [250, 255, -210], target: [0, 30, -110] },
  hall: { label: '太和殿 · 金銮正殿', position: [165, 115, -145], target: [0, 22, -71] },
  inner: { label: '内廷 · 后宫', position: [215, 195, 175], target: [0, 16, 185] },
  west: { label: '西宫苑', position: [-470, 350, -360], target: [-190, 0, -5] },
  east: { label: '东宫苑', position: [470, 350, -360], target: [190, 0, -5] },
  garden: { label: '御花园 · 北苑', position: [280, 300, 760], target: [0, 0, 350] }
});

export const ZONES = Object.freeze({
  forecourt: { x: [-100, 100], z: [-398, 83], owner: 'B' },
  inner: { x: [-100, 100], z: [83, 302], owner: 'C' },
  west: { x: [-280, -104], z: [-300, 300], owner: 'D' },
  east: { x: [104, 280], z: [-300, 300], owner: 'E' },
  garden: { x: [-282, 282], z: [302, 430], owner: 'F' }
});

export const REGIONS = Object.freeze([
  { id: 'forecourt', name: '前朝', center: [0, -175], color: '#cfab54' },
  { id: 'inner', name: '后宫', center: [0, 190], color: '#b88742' },
  { id: 'west', name: '西宫苑', center: [-190, -5], color: '#8c5542' },
  { id: 'east', name: '东宫苑', center: [190, -5], color: '#8c5542' },
  { id: 'garden', name: '御花园', center: [0, 355], color: '#637653' }
]);
