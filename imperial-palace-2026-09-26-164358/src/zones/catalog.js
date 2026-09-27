const hall = (id, name, zone, x, z, width, depth, options = {}) => ({
  id,
  name,
  zone,
  x,
  z,
  width,
  depth,
  kind: options.kind || 'hall',
  roof: options.roof || 'hip',
  doubleEaves: Boolean(options.doubleEaves),
  platform: options.platform ?? 2.2,
  bays: options.bays ?? 3,
  interior: Boolean(options.interior),
  category: options.category || '宫殿',
  description: options.description || `${name}依院落尺度营造，朱柱金瓦，体现宫城建筑群的礼仪秩序。`,
  colorVariant: options.colorVariant || 0,
});

export const BUILDINGS = [
  hall('south-gate', '正阳门', 'forecourt', 0, -402, 48, 20, { kind: 'gate', bays: 5, platform: 3.2, category: '城门', description: '宫城南端正门，连接入城桥与南北礼仪轴线。' }),
  hall('meridian-gate', '午门', 'forecourt', 0, -340, 62, 24, { kind: 'gate', bays: 7, platform: 4, doubleEaves: true, category: '宫门', description: '前朝南入口，以恢宏门楼与两翼城台确立中轴序列。' }),
  hall('harmony-gate', '太和门', 'forecourt', 0, -268, 54, 22, { kind: 'gate', bays: 7, platform: 3.5, category: '宫门', description: '广场北端的门殿，统领外朝礼仪空间。' }),
  hall('supreme-hall', '太和殿', 'forecourt', 0, -202, 82, 52, { kind: 'grand', bays: 9, platform: 11, doubleEaves: true, interior: true, category: '前朝主殿', description: '宫城中轴的礼仪核心，重檐金顶立于层叠白石台基之上，可进入殿内观览。' }),
  hall('central-hall', '中和殿', 'forecourt', 0, -112, 48, 34, { kind: 'grand', bays: 5, platform: 4.5, category: '前朝殿堂', description: '位于主殿之后的方亭式殿堂，承接礼仪轴线的空间节奏。' }),
  hall('preserving-hall', '保和殿', 'forecourt', 0, -44, 58, 38, { kind: 'grand', bays: 7, platform: 5.4, category: '前朝殿堂', description: '前朝北段的殿堂，以较高台基与开阔御道连向内廷。' }),
  hall('inner-gate', '乾清门', 'inner', 0, 42, 42, 20, { kind: 'gate', bays: 5, platform: 3, category: '内廷宫门', description: '由前朝转入后宫的门殿，门内院落尺度趋于收敛。' }),
  hall('heavenly-purity', '乾清宫', 'inner', 0, 132, 54, 36, { kind: 'grand', bays: 7, platform: 5, doubleEaves: true, interior: true, category: '内廷寝宫', description: '内廷中轴上的代表寝宫，设有可进入的室内陈设与御座。' }),
  hall('union-hall', '交泰殿', 'inner', 0, 202, 34, 27, { kind: 'grand', bays: 3, platform: 3.6, category: '内廷殿堂', description: '乾清与坤宁之间的方形殿堂，构成后宫中轴上的过渡节点。' }),
  hall('earthly-tranquility', '坤宁宫', 'inner', 0, 257, 46, 32, { kind: 'grand', bays: 5, platform: 4.2, interior: true, category: '内廷寝宫', description: '后宫北部的寝殿，与庭院、东西配房共同围合出内廷空间。' }),
  hall('north-gate', '玄武门', 'boundary', 0, 402, 42, 20, { kind: 'gate', bays: 5, platform: 3, category: '北城门', description: '北侧城门楼，面向御花园与宫城外缘。' }),
  hall('imperial-garden-hall', '万春亭', 'garden', 0, 340, 24, 22, { kind: 'pavilion', bays: 4, platform: 1.5, roof: 'pavilion', category: '御苑亭阁', description: '御花园中轴亭阁，周边布置松柏、花木、山石与曲径。' }),

  hall('inner-west-sleeping', '西暖阁', 'inner', -66, 136, 30, 20, { kind: 'side', bays: 3, category: '寝宫配殿', description: '围绕寝宫主院布置的侧殿，面向内廷庭院。' }),
  hall('inner-east-sleeping', '东暖阁', 'inner', 66, 136, 30, 20, { kind: 'side', bays: 3, category: '寝宫配殿', description: '围绕寝宫主院布置的侧殿，面向内廷庭院。', colorVariant: 1 }),
  hall('inner-west-north', '西配寝殿', 'inner', -62, 240, 28, 18, { kind: 'side', bays: 3, category: '后宫配殿', description: '北部内廷院落中的西侧寝殿。' }),
  hall('inner-east-north', '东配寝殿', 'inner', 62, 240, 28, 18, { kind: 'side', bays: 3, category: '后宫配殿', description: '北部内廷院落中的东侧寝殿。', colorVariant: 1 }),
  hall('inner-west-gate', '西六宫门', 'inner', -112, 190, 20, 16, { kind: 'gate', bays: 3, platform: 1.6, category: '内廷院门' }),
  hall('inner-east-gate', '东六宫门', 'inner', 112, 190, 20, 16, { kind: 'gate', bays: 3, platform: 1.6, category: '内廷院门', colorVariant: 1 }),
];

const westCourts = [
  ['west-01', '凝芳院', -258, '花木清供'],
  ['west-02', '尚仪院', -148, '礼仪值守'],
  ['west-03', '文渊小院', -38, '藏书清居'],
  ['west-04', '绮霞院', 72, '日常起居'],
];
const eastCourts = [
  ['east-01', '承华院', -258, '典藏陈设'],
  ['east-02', '乐寿院', -148, '雅乐清赏'],
  ['east-03', '景福院', -38, '宫苑生活'],
  ['east-04', '延禧院', 72, '内廷起居'],
];

for (const [side, courts] of [['west', westCourts], ['east', eastCourts]]) {
  const centerX = side === 'west' ? -172 : 172;
  const variant = side === 'east' ? 1 : 0;
  for (const [id, courtName, z, theme] of courts) {
    const prefix = id;
    const x = centerX;
    BUILDINGS.push(
      hall(`${prefix}-main`, `${courtName}正殿`, side, x, z + 20, 34, 20, { kind: 'side', bays: 5, platform: 2.8, category: '院落主殿', description: `${theme}主题院落的正殿，前接庭院，左右由配房围合。`, colorVariant: variant }),
      hall(`${prefix}-west`, `${courtName}西配房`, side, x - 33, z + 1, 22, 16, { kind: 'side', bays: 3, category: '院落配房', description: `${courtName}内侧院落的西配房。`, colorVariant: variant }),
      hall(`${prefix}-east`, `${courtName}东配房`, side, x + 33, z + 1, 22, 16, { kind: 'side', bays: 3, category: '院落配房', description: `${courtName}内侧院落的东配房。`, colorVariant: variant }),
      hall(`${prefix}-gate`, `${courtName}院门`, side, x, z - 23, 26, 14, { kind: 'gate', bays: 3, platform: 1.5, category: '院门', description: `通往${courtName}的院门，与院墙、廊庑和前庭相连。`, colorVariant: variant }),
    );
  }
}

for (const [id, name, x, z, width, depth] of [
  ['garden-east-pavilion', '浮碧亭', 98, 354, 18, 16],
  ['garden-west-pavilion', '澄瑞亭', -98, 354, 18, 16],
  ['garden-east-study', '养和轩', 54, 382, 24, 15],
  ['garden-west-study', '含芳斋', -54, 382, 24, 15],
]) {
  BUILDINGS.push(hall(id, name, 'garden', x, z, width, depth, { kind: 'pavilion', bays: 4, platform: 1.4, roof: 'pavilion', category: '御苑亭阁', description: '御花园中的小型亭轩，临近曲径、松石与花木。' }));
}

for (const [id, name, x, z] of [
  ['corner-sw', '西南角楼', -268, -398],
  ['corner-se', '东南角楼', 268, -398],
  ['corner-nw', '西北角楼', -268, 398],
  ['corner-ne', '东北角楼', 268, 398],
]) {
  BUILDINGS.push(hall(id, name, 'boundary', x, z, 25, 25, { kind: 'corner', bays: 3, platform: 3.3, doubleEaves: true, category: '城垣角楼', description: '宫城一隅的多层角楼，与连续城墙、护城河共同构成边界。' }));
}

for (const [id, name, x, z, zone] of [
  ['west-city-gate', '西华门', -278, 0, 'west'],
  ['east-city-gate', '东华门', 278, 0, 'east'],
]) {
  BUILDINGS.push(hall(id, name, zone, x, z, 24, 32, { kind: 'gate', bays: 3, platform: 3.2, category: '侧城门', description: '东西侧城门楼，联通内外城道与侧院步道。' }));
}

export const COURTYARDS = [
  { id: 'forecourt-south', name: '午门外礼仪广场', zone: 'forecourt', bounds: [-125, 125, -374, -298], center: [0, -336] },
  { id: 'forecourt-main', name: '太和殿庭院', zone: 'forecourt', bounds: [-112, 112, -252, -148], center: [0, -200] },
  { id: 'forecourt-central', name: '中和殿庭院', zone: 'forecourt', bounds: [-92, 92, -137, -69], center: [0, -103] },
  { id: 'forecourt-north', name: '保和殿庭院', zone: 'forecourt', bounds: [-100, 100, -66, 5], center: [0, -31] },
  { id: 'inner-gate-court', name: '乾清门庭院', zone: 'inner', bounds: [-96, 96, 20, 94], center: [0, 56] },
  { id: 'inner-main-court', name: '乾清宫主院', zone: 'inner', bounds: [-104, 104, 102, 171], center: [0, 136] },
  { id: 'inner-north-court', name: '坤宁宫庭院', zone: 'inner', bounds: [-100, 100, 216, 277], center: [0, 245] },
  { id: 'garden-court', name: '御花园中庭', zone: 'garden', bounds: [-150, 150, 315, 395], center: [0, 354] },
  ...westCourts.map(([id, name, z]) => ({ id, name, zone: 'west', bounds: [-221, -123, z - 46, z + 46], center: [-172, z] })),
  ...eastCourts.map(([id, name, z]) => ({ id, name, zone: 'east', bounds: [123, 221, z - 46, z + 46], center: [172, z] })),
];

export const CONNECTORS = [
  { id: 'south-entry', position: [0, 0, -416], width: 38, targetZone: 'forecourt' },
  { id: 'forecourt-inner', position: [0, 0, 10], width: 20, targetZone: 'inner' },
  { id: 'inner-garden', position: [0, 0, 300], width: 18, targetZone: 'garden' },
  { id: 'west-entry', position: [-286, 0, 0], width: 20, targetZone: 'west' },
  { id: 'east-entry', position: [286, 0, 0], width: 20, targetZone: 'east' },
];

if (new Set(BUILDINGS.map(({ id }) => id)).size !== BUILDINGS.length) throw new Error('Building IDs must be unique.');
