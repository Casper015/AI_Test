/**
 * 紫禁天朝 · E 东侧宫苑：六组院落、奉天楼与澄波池（frozen layout-v1）
 */

import { building, courtyard, terrace, stairs, courtWall, corridor, path, water, bridge, deck, lantern, viewpoint } from './registry.js';

function eastCourt(id, name, cx, cz, w, d) {
  const cid = id + '-court';
  courtyard({ id: cid, name, zone: 'E', cx, cz, w, d, level: 3, theme: 'court' });
  const cw = (w - 6) / 2, cd = (d - 6) / 2;
  courtWall(id + '-n', 'E', cx - cw, cx + cw, cz + cd - 2, cz + cd, 0, 5);
  courtWall(id + '-s1', 'E', cx - cw, cx - 7, cz - cd, cz - cd + 2, 0, 5);
  courtWall(id + '-s2', 'E', cx + 7, cx + cw, cz - cd, cz - cd + 2, 0, 5);
  courtWall(id + '-w', 'E', cx - cw, cx - cw + 2, cz - cd, cz + cd, 0, 5);
  courtWall(id + '-e', 'E', cx + cw - 2, cx + cw, cz - cd, cz + cd, 0, 5);
  building({
    id: id + '-main', name: name + '正堂', category: 'sideHall', archetype: 'hall7',
    x: cx, z: cz + cd - 21, w: 36, d: 20, h: 16, zone: 'E', level: 3, courtyard: cid,
    info: name + '正堂，东侧宫苑院落主屋，不可进入。'
  });
  building({
    id: id + '-w', name: name + '西厢', category: 'sideHouse', archetype: 'house3',
    x: cx - cw + 13, z: cz + 4, rot: 90, w: 24, d: 11, h: 12, zone: 'E', level: 4, courtyard: cid,
    info: name + '西厢房，不可进入。'
  });
  building({
    id: id + '-e', name: name + '东厢', category: 'sideHouse', archetype: 'house3',
    x: cx + cw - 13, z: cz + 4, rot: -90, w: 24, d: 11, h: 12, zone: 'E', level: 4, courtyard: cid,
    info: name + '东厢房，不可进入。'
  });
  building({
    id: id + '-gate', name: name + '门', category: 'gateSmall', archetype: 'gate1',
    x: cx, z: cz - cd, w: 16, d: 10, h: 11, zone: 'E', level: 4, courtyard: cid,
    opens: [{ x0: -3.6, x1: 3.6, top: 4.2 }], info: name + '院门，可通行。'
  });
  path({ id: id + '-path', zone: 'E', x0: cx - 3, x1: cx + 3, z0: cz - cd, z1: cz + cd - 28, style: 'paving' });
}

const eastCols = [171, 262];
const eastRows = [-300, -160, -20];
const eastNames = [['E-wenhua', '文华殿'], ['E-jianzhang', '建章宫'], ['E-chonghua', '重华宫'], ['E-cangshu', '藏书阁'], ['E-yanwu', '演武厅'], ['E-shangbao', '尚宝监']];
let ei = 0;
for (const cx of eastCols) {
  for (const cz of eastRows) {
    const n = eastNames[ei % eastNames.length];
    const suffix = ei >= eastNames.length ? '-2' : '';
    eastCourt(n[0] + suffix, n[1], cx, cz, 72, 110);
    ei++;
  }
}

building({
  id: 'E-tower-fengtian', name: '奉天楼', category: 'tower', archetype: 'towerTall',
  x: 252, z: 176, w: 22, d: 22, h: 40, base: 1.5, zone: 'E', level: 1,
  info: '东苑三层高楼，可远眺全城，不可进入。'
});
terrace({ id: 'E-tower-t', zone: 'E', x0: 238, x1: 266, z0: 162, z1: 190, y: 1.5, tier: 1, gaps: [{ side: 'z-', x0: 246, x1: 258 }] });
stairs({ id: 'E-tower-st', zone: 'E', x: 252, z: 158, w: 12, d: 4, y0: 0, y1: 1.5, dir: 'z+' });

water({ id: 'E-pond', zone: 'E', x0: 146, x1: 206, z0: 196, z1: 256, kind: 'pond' });
bridge({ id: 'E-bridge-pond', zone: 'E', x0: 146, x1: 206, z0: 220, z1: 232, y: 0.5, axis: 'x', name: '澄波桥' });
deck('E-bridge-pond:deck', 'E', 150, 202, 222, 230, 0.5);
building({
  id: 'E-pav-chengbo', name: '澄波亭', category: 'pavilion', archetype: 'pav2',
  x: 176, z: 268, w: 16, d: 16, h: 15, base: 0.6, zone: 'E', level: 3,
  info: '东苑池畔亭，不可进入。'
});
terrace({ id: 'E-pav-chengbo-t', zone: 'E', x0: 165, x1: 187, z0: 257, z1: 279, y: 0.6, tier: 1 });
building({ id: 'E-pav-1', name: '听雨亭', category: 'pavilion', archetype: 'pav1', x: 240, z: 96, w: 11, d: 11, h: 11, zone: 'E', level: 4, info: '苑内小亭，不可进入。' });
building({ id: 'E-pav-2', name: '揽月亭', category: 'pavilion', archetype: 'pav1', x: 160, z: 96, w: 11, d: 11, h: 11, zone: 'E', level: 4, info: '苑内小亭，不可进入。' });
corridor({ id: 'E-corridor-1', zone: 'E', x0: 284, x1: 292, z0: 100, z1: 262, axis: 'z' });
corridor({ id: 'E-corridor-2', zone: 'E', x0: 140, x1: 300, z0: 276, z1: 284, axis: 'x' });

path({ id: 'E-lane-1', zone: 'E', x0: 209, x1: 216, z0: -365, z1: 74, style: 'paving' });
path({ id: 'E-lane-2', zone: 'E', x0: 135, x1: 300, z0: 78, z1: 86, style: 'paving' });
path({ id: 'E-lane-3', zone: 'E', x0: 135, x1: 144, z0: -370, z1: 296, style: 'paving' });

for (let i = 0; i < 4; i++) lantern({ id: 'E-lamp' + i, zone: 'E', x: 216, z: 120 + i * 45, y: 0, scale: 0.85 });

viewpoint({ id: 'vp-E-zone', name: '东宫苑全景', zone: 'E', mode: 'zone', position: { x: 540, y: 150, z: -300 }, target: { x: 215, y: 6, z: -80 } });
viewpoint({ id: 'vp-E-fp', name: '东苑院落', zone: 'E', mode: 'fp-spawn', position: { x: 171, y: 0, z: -240 }, target: { x: 171, y: 1.6, z: -120 } });
