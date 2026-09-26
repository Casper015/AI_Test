/**
 * 紫禁天朝 · D 西侧宫苑：六组院落、上林苑与太液池（frozen layout-v1）
 */

import { building, courtyard, terrace, stairs, courtWall, corridor, path, water, bridge, deck, lantern, viewpoint } from './registry.js';

function westCourt(id, name, cx, cz, w, d, theme) {
  const cid = id + '-court';
  courtyard({ id: cid, name, zone: 'D', cx, cz, w, d, level: 3, theme: theme || 'court' });
  const cw = (w - 6) / 2, cd = (d - 6) / 2;
  courtWall(id + '-n', 'D', cx - cw, cx + cw, cz + cd - 2, cz + cd, 0, 5);
  courtWall(id + '-s1', 'D', cx - cw, cx - 7, cz - cd, cz - cd + 2, 0, 5);
  courtWall(id + '-s2', 'D', cx + 7, cx + cw, cz - cd, cz - cd + 2, 0, 5);
  courtWall(id + '-w', 'D', cx - cw, cx - cw + 2, cz - cd, cz + cd, 0, 5);
  courtWall(id + '-e', 'D', cx + cw - 2, cx + cw, cz - cd, cz + cd, 0, 5);
  building({
    id: id + '-main', name: name + '正堂', category: 'sideHall', archetype: 'hall7',
    x: cx, z: cz + cd - 19, w: 38, d: 20, h: 16, zone: 'D', level: 3, courtyard: cid,
    info: name + '正堂，西侧宫苑院落主屋，不可进入。'
  });
  building({
    id: id + '-w', name: name + '西厢', category: 'sideHouse', archetype: 'house3',
    x: cx - cw + 13, z: cz + 4, rot: 90, w: 26, d: 11, h: 12, zone: 'D', level: 4, courtyard: cid,
    info: name + '西厢房，不可进入。'
  });
  building({
    id: id + '-e', name: name + '东厢', category: 'sideHouse', archetype: 'house3',
    x: cx + cw - 13, z: cz + 4, rot: -90, w: 26, d: 11, h: 12, zone: 'D', level: 4, courtyard: cid,
    info: name + '东厢房，不可进入。'
  });
  building({
    id: id + '-gate', name: name + '门', category: 'gateSmall', archetype: 'gate1',
    x: cx, z: cz - cd, w: 16, d: 10, h: 11, zone: 'D', level: 4, courtyard: cid,
    opens: [{ x0: -3.6, x1: 3.6, top: 4.2 }], info: name + '院门，可通行。'
  });
  path({ id: id + '-path', zone: 'D', x0: cx - 3, x1: cx + 3, z0: cz - cd, z1: cz + cd - 26, style: 'paving' });
}

const westCols = [-171, -262];
const westRows = [-300, -160, -20];
const westNames = [['D-yeting', '掖庭'], ['D-taiyue', '太乐坊'], ['D-taiyi', '太医院'], ['D-neiwu', '内务府'], ['D-shangyi', '尚衣监'], ['D-huidian', '会典馆']];
let wi = 0;
for (const cx of westCols) {
  for (const cz of westRows) {
    const n = westNames[wi % westNames.length];
    const suffix = wi >= westNames.length ? '-2' : '';
    westCourt(n[0] + suffix, n[1], cx, cz, 72, 110, wi % 2 ? 'court' : 'grove');
    wi++;
  }
}

path({ id: 'D-lane-1', zone: 'D', x0: -216, x1: -209, z0: -365, z1: 74, style: 'paving' });
path({ id: 'D-lane-2', zone: 'D', x0: -300, x1: -135, z0: 78, z1: 86, style: 'paving' });
path({ id: 'D-lane-3', zone: 'D', x0: -144, x1: -135, z0: -370, z1: 296, style: 'paving' });

water({ id: 'D-lake-taiye', zone: 'D', x0: -272, x1: -158, z0: 148, z1: 262, kind: 'lake' });
terrace({ id: 'D-island', zone: 'D', x0: -207, x1: -177, z0: 191, z1: 219, y: 0.9, tier: 1, style: 'rock', railing: false });
building({
  id: 'D-pav-island', name: '瀛台亭', category: 'pavilion', archetype: 'pav2',
  x: -192, z: 205, w: 16, d: 16, h: 15, base: 0.9, zone: 'D', level: 3,
  info: '太液池中岛亭，重檐攒尖顶，不可进入。'
});
bridge({ id: 'D-bridge-lake', zone: 'D', x0: -223, x1: -207, z0: 146, z1: 264, y: 0.9, axis: 'z', name: '太液桥' });
deck('D-bridge-lake:deck', 'D', -223, -207, 146, 264, 0.9);
stairs({ id: 'D-bridge-lake:ramp-s', zone: 'D', x: -215, z: 144, w: 14, d: 8, y0: 0, y1: 0.9, dir: 'z+', steps: 3 });
stairs({ id: 'D-bridge-lake:ramp-n', zone: 'D', x: -215, z: 266, w: 14, d: 8, y0: 0, y1: 0.9, dir: 'z-', steps: 3 });
building({
  id: 'D-pav-shuixie', name: '水榭', category: 'pavilion', archetype: 'pav2',
  x: -150, z: 232, w: 18, d: 18, h: 16, base: 0.6, zone: 'D', level: 3,
  info: '太液池东岸水榭，不可进入。'
});
terrace({ id: 'D-pav-shuixie-t', zone: 'D', x0: -161, x1: -139, z0: 221, z1: 243, y: 0.6, tier: 1 });
building({ id: 'D-pav-1', name: '上林亭', category: 'pavilion', archetype: 'pav1', x: -250, z: 110, w: 11, d: 11, h: 11, zone: 'D', level: 4, info: '上林苑小亭，不可进入。' });
building({ id: 'D-pav-2', name: '澄心亭', category: 'pavilion', archetype: 'pav1', x: -170, z: 96, w: 11, d: 11, h: 11, zone: 'D', level: 4, info: '苑内小亭，不可进入。' });
corridor({ id: 'D-corridor-1', zone: 'D', x0: -292, x1: -284, z0: 100, z1: 262, axis: 'z' });
corridor({ id: 'D-corridor-2', zone: 'D', x0: -300, x1: -140, z0: 276, z1: 284, axis: 'x' });

for (let i = 0; i < 4; i++) lantern({ id: 'D-lamp' + i, zone: 'D', x: -208, z: 120 + i * 45, y: 0, scale: 0.85 });

viewpoint({ id: 'vp-D-zone', name: '西宫苑全景', zone: 'D', mode: 'zone', position: { x: -540, y: 150, z: -300 }, target: { x: -215, y: 6, z: -80 } });
viewpoint({ id: 'vp-D-fp', name: '西苑院落', zone: 'D', mode: 'fp-spawn', position: { x: -171, y: 0, z: -240 }, target: { x: -171, y: 1.6, z: -120 } });
