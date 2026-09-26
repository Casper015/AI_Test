/**
 * 紫禁天朝 · C 内廷后宫：乾清门、后三宫、东西三宫（frozen layout-v1）
 */

import { WORLD } from '../config.js';
import { building, courtyard, terrace, stairs, courtWall, path, axisCarpet, lantern, viewpoint } from './registry.js';

building({
  id: 'C-gate-qianqing', name: '乾清门', category: 'gateHall', archetype: 'gate3',
  x: 0, z: 130, w: 72, d: 24, h: 20, base: 1.5, zone: 'C', level: 2, courtyard: 'C-inner-court',
  opens: [{ x0: -8, x1: 8, top: 7 }, { x0: -28, x1: -20, top: 5.6 }, { x0: 20, x1: 28, top: 5.6 }],
  info: '内廷正门，中门与两侧门可通行。'
});
terrace({
  id: 'C-gate-t', zone: 'C', x0: -50, x1: 50, z0: 116, z1: 146, y: 1.5, tier: 1,
  gaps: [{ side: 'z-', x0: -12, x1: 12 }, { side: 'z-', x0: -32, x1: -20 }, { side: 'z-', x0: 20, x1: 32 }, { side: 'z+', x0: -12, x1: 12 }]
});
stairs({ id: 'C-gate-st', zone: 'C', x: 0, z: 112, w: 24, d: 5, y0: 0, y1: 1.5, dir: 'z+' });
stairs({ id: 'C-gate-st2', zone: 'C', x: -26, z: 112, w: 10, d: 5, y0: 0, y1: 1.5, dir: 'z+' });
stairs({ id: 'C-gate-st3', zone: 'C', x: 26, z: 112, w: 10, d: 5, y0: 0, y1: 1.5, dir: 'z+' });

courtyard({ id: 'C-inner-court', name: '乾清门庭院', zone: 'C', cx: 0, cz: 152, w: 240, d: 70, level: 2, theme: 'court' });
courtyard({ id: 'C-axis-court', name: '后三宫庭院', zone: 'C', cx: 0, cz: 240, w: 120, d: 150, level: 1, theme: 'axis' });

building({
  id: 'C-gate-inner-w', name: '内左门', category: 'gateHall', archetype: 'gate1',
  x: -58, z: 130, w: 18, d: 12, h: 12, zone: 'C', level: 4, opens: [{ x0: -4, x1: 4, top: 4.6 }],
  info: '内廷西侧门。'
});
building({
  id: 'C-gate-inner-e', name: '内右门', category: 'gateHall', archetype: 'gate1',
  x: 58, z: 130, w: 18, d: 12, h: 12, zone: 'C', level: 4, opens: [{ x0: -4, x1: 4, top: 4.6 }],
  info: '内廷东侧门。'
});
courtWall('C-yingbi-w', 'C', -88, -62, 144, 146.5, 0, 6);
courtWall('C-yingbi-e', 'C', 62, 88, 144, 146.5, 0, 6);

const innerTiers = WORLD.central.innerTerrace;
innerTiers.forEach((t, i) => terrace({
  id: 'C-inner-t' + (i + 1), zone: 'C', x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y: t.y, tier: i + 1,
  gaps: [
    { side: 'z-', x0: -11, x1: 11 }, { side: 'z+', x0: -11, x1: 11 },
    { side: 'x-', x0: 182, x1: 192 }, { side: 'x+', x0: 182, x1: 192 }
  ]
}));
for (let i = 0; i < 2; i++) {
  const y0 = i === 0 ? 0 : innerTiers[i - 1].y;
  const y1 = innerTiers[i].y;
  const front = innerTiers[i].z0;
  const lowerEdge = i === 0 ? innerTiers[0].z0 - 6 : innerTiers[i - 1].z0;
  const thisEdge = innerTiers[i].z0;
  stairs({ id: 'C-inner-st' + i, zone: 'C', x: 0, z: (lowerEdge + thisEdge) / 2, w: 22, d: thisEdge - lowerEdge, y0, y1, dir: 'z+' });
  stairs({ id: 'C-inner-stw' + i, zone: 'C', x: -(innerTiers[i].x1 + 3), z: 190, w: 12, d: 6, y0, y1, dir: 'x+', steps: 5 });
  stairs({ id: 'C-inner-ste' + i, zone: 'C', x: innerTiers[i].x1 + 3, z: 190, w: 12, d: 6, y0, y1, dir: 'x-', steps: 5 });
  stairs({ id: 'C-inner-stn' + i, zone: 'C', x: 0, z: innerTiers[i].z1 + 3, w: 16, d: 6, y0, y1, dir: 'z-', steps: 5 });
}

building({
  id: 'C-hall-bed', name: '乾清宫', category: 'bedChamber', archetype: 'hall9b',
  x: 0, z: 186, w: 54, d: 26, h: 24, base: 3.0, zone: 'C', level: 1, courtyard: 'C-axis-court',
  visitable: true, interiorShell: true, frontDoor: 10, backDoorW: 10,
  info: '内廷寝殿，可进入。殿内设暖阁、床榻、屏风与宫灯。'
});
building({
  id: 'C-hall-jiaotai', name: '交泰殿', category: 'squareHall', archetype: 'square3',
  x: 0, z: 240, w: 22, d: 22, h: 17, base: 1.0, zone: 'C', level: 2, courtyard: 'C-axis-court',
  info: '内廷方形殿，四角攒尖顶，不可进入。'
});
terrace({ id: 'C-jiaotai-t', zone: 'C', x0: -15, x1: 15, z0: 226, z1: 254, y: 1.0, tier: 1, gaps: [{ side: 'z-', x0: -8, x1: 8 }] });
stairs({ id: 'C-jiaotai-st', zone: 'C', x: 0, z: 222, w: 14, d: 4, y0: 0, y1: 1.0, dir: 'z+' });
building({
  id: 'C-hall-kunning', name: '坤宁宫', category: 'hall9b', archetype: 'hall9',
  x: 0, z: 280, w: 48, d: 24, h: 22, base: 1.0, zone: 'C', level: 2, courtyard: 'C-axis-court',
  info: '内廷后殿，不可进入。'
});
terrace({ id: 'C-kunning-t', zone: 'C', x0: -32, x1: 32, z0: 262, z1: 298, y: 1.0, tier: 1, gaps: [{ side: 'z-', x0: -10, x1: 10 }] });
stairs({ id: 'C-kunning-st', zone: 'C', x: 0, z: 258, w: 18, d: 4, y0: 0, y1: 1.0, dir: 'z+' });

function sidePalace(id, name, cx, cz, w, d) {
  courtyard({ id: id + '-court', name, zone: 'C', cx, cz, w, d, level: 3, theme: 'palace' });
  const cw = (w - 6) / 2, cd = (d - 6) / 2;
  courtWall(id + '-wall-n', 'C', cx - cw, cx + cw, cz + cd - 2, cz + cd, 0, 5);
  courtWall(id + '-wall-s1', 'C', cx - cw, cx - 8, cz - cd, cz - cd + 2, 0, 5);
  courtWall(id + '-wall-s2', 'C', cx + 8, cx + cw, cz - cd, cz - cd + 2, 0, 5);
  courtWall(id + '-wall-w', 'C', cx - cw, cx - cw + 2, cz - cd, cz + cd, 0, 5);
  courtWall(id + '-wall-e', 'C', cx + cw - 2, cx + cw, cz - cd, cz + cd, 0, 5);
  building({
    id: id + '-main', name: name + '正殿', category: 'sideHall', archetype: 'hall5',
    x: cx, z: cz + cd - 15, w: 30, d: 16, h: 14, zone: 'C', level: 3, courtyard: id + '-court',
    info: name + '正殿，内廷侧院主屋，不可进入。'
  });
  building({
    id: id + '-w', name: name + '西配殿', category: 'sideHouse', archetype: 'house3',
    x: cx - cw + 11, z: cz + 2, rot: 90, w: 20, d: 10, h: 11, zone: 'C', level: 4, courtyard: id + '-court',
    info: name + '西配殿，不可进入。'
  });
  building({
    id: id + '-e', name: name + '东配殿', category: 'sideHouse', archetype: 'house3',
    x: cx + cw - 11, z: cz + 2, rot: -90, w: 20, d: 10, h: 11, zone: 'C', level: 4, courtyard: id + '-court',
    info: name + '东配殿，不可进入。'
  });
  building({
    id: id + '-gate', name: name + '门', category: 'gateSmall', archetype: 'gate1',
    x: cx, z: cz - cd, w: 14, d: 9, h: 10, zone: 'C', level: 4, courtyard: id + '-court',
    opens: [{ x0: -3.4, x1: 3.4, top: 4 }],
    info: name + '院门，可通行。'
  });
  path({ id: id + '-path', zone: 'C', x0: cx - 3, x1: cx + 3, z0: cz - cd, z1: cz + cd - 22, style: 'paving' });
}

sidePalace('C-pal-jingren', '景仁宫', -70, 150, 52, 66);
sidePalace('C-pal-chengqian', '承乾宫', -70, 228, 52, 66);
sidePalace('C-pal-zhongcui', '钟粹宫', -70, 288, 52, 60);
sidePalace('C-pal-yanxi', '延禧宫', 70, 150, 52, 66);
sidePalace('C-pal-yonghe', '永和宫', 70, 228, 52, 66);
sidePalace('C-pal-jingyang', '景阳宫', 70, 288, 52, 60);

path({ id: 'C-axis-path', zone: 'C', x0: -12, x1: 12, z0: 104, z1: 300, style: 'paving' });
path({ id: 'C-lane-w', zone: 'C', x0: -100, x1: -92, z0: 110, z1: 300, style: 'paving' });
path({ id: 'C-lane-e', zone: 'C', x0: 92, x1: 100, z0: 110, z1: 300, style: 'paving' });
axisCarpet('C-axis-carpet', 'C', 0, 104, 296, 7);

for (let i = 0; i < 6; i++) {
  lantern({ id: 'C-lamp-w' + i, zone: 'C', x: -36, z: 120 + i * 32, y: 0, scale: 0.9 });
  lantern({ id: 'C-lamp-e' + i, zone: 'C', x: 36, z: 120 + i * 32, y: 0, scale: 0.9 });
}
for (let i = 0; i < 4; i++) lantern({ id: 'C-lamp-a' + i, zone: 'C', x: -14 + i * 9, z: 214, y: 3.1, scale: 0.75, kind: 'terrace' });

viewpoint({ id: 'vp-C-zone', name: '后宫全景', zone: 'C', mode: 'zone', position: { x: -190, y: 122, z: 74 }, target: { x: 0, y: 8, z: 230 } });
viewpoint({ id: 'vp-C-main', name: '乾清宫近景', zone: 'C', mode: 'zone', position: { x: 84, y: 32, z: 140 }, target: { x: 0, y: 10, z: 188 } });
viewpoint({ id: 'vp-C-fp', name: '内廷庭院', zone: 'C', mode: 'fp-spawn', position: { x: 0, y: 0, z: 96 }, target: { x: 0, y: 1.6, z: 240 } });
viewpoint({ id: 'vp-C-interior', name: '乾清宫内景', zone: 'C', mode: 'interior', position: { x: 0, y: 5.6, z: 176 }, target: { x: 0, y: 4.9, z: 200 }, fov: 62, area: { x0: -25, x1: 25, z0: 174, z1: 198, y0: 3.0, y1: 11 } });
