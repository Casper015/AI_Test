/**
 * 紫禁天朝 · B 中轴前朝：午门内广场、礼仪广场、三层台基与金銮殿（frozen layout-v1）
 */

import { WORLD } from '../config.js';
import { building, courtyard, terrace, stairs, corridor, path, axisCarpet, monument, lantern, viewpoint, courtWall } from './registry.js';

building({
  id: 'B-gate-fengtian', name: '奉天门', category: 'gateHall', archetype: 'gate3',
  x: 0, z: -330, w: 78, d: 26, h: 22, base: 1.8, zone: 'B', level: 2, courtyard: 'B-gate-court',
  opens: [{ x0: -8, x1: 8, top: 7.5 }, { x0: -30, x1: -22, top: 6 }, { x0: 22, x1: 30, top: 6 }],
  info: '前朝正门，三门洞可通行；门楼不可进入。'
});
terrace({
  id: 'B-gate-t1', zone: 'B', x0: -62, x1: 62, z0: -352, z1: -308, y: 0.9, tier: 1,
  gaps: [{ side: 'z-', x0: -12, x1: 12 }, { side: 'z-', x0: -40, x1: -28 }, { side: 'z-', x0: 28, x1: 40 }]
});
terrace({
  id: 'B-gate-t2', zone: 'B', x0: -56, x1: 56, z0: -346, z1: -314, y: 1.8, tier: 2,
  gaps: [{ side: 'z-', x0: -12, x1: 12 }, { side: 'z-', x0: -40, x1: -28 }, { side: 'z-', x0: 28, x1: 40 }]
});
stairs({ id: 'B-gate-st1', zone: 'B', x: 0, z: -356, w: 24, d: 4, y0: 0, y1: 0.9, dir: 'z+' });
stairs({ id: 'B-gate-st2', zone: 'B', x: 0, z: -350, w: 24, d: 4, y0: 0.9, y1: 1.8, dir: 'z+' });
stairs({ id: 'B-gate-st3', zone: 'B', x: -34, z: -356, w: 12, d: 4, y0: 0, y1: 0.9, dir: 'z+' });
stairs({ id: 'B-gate-st4', zone: 'B', x: -34, z: -350, w: 12, d: 4, y0: 0.9, y1: 1.8, dir: 'z+' });
stairs({ id: 'B-gate-st5', zone: 'B', x: 34, z: -356, w: 12, d: 4, y0: 0, y1: 0.9, dir: 'z+' });
stairs({ id: 'B-gate-st6', zone: 'B', x: 34, z: -350, w: 12, d: 4, y0: 0.9, y1: 1.8, dir: 'z+' });

courtyard({ id: 'B-gate-court', name: '午门内广场', zone: 'B', cx: 0, cz: -382, w: 210, d: 76, level: 2, theme: 'plaza' });
courtyard({ id: 'B-plaza', name: '礼仪广场', zone: 'B', cx: 0, cz: -250, w: 268, d: 150, level: 2, theme: 'plaza' });
courtyard({ id: 'B-terrace-court', name: '三台庭院', zone: 'B', cx: 0, cz: -30, w: 268, d: 260, level: 1, theme: 'plaza' });

path({ id: 'B-plaza-paving', zone: 'B', x0: -134, x1: 134, z0: -320, z1: -162, style: 'paving' });
path({ id: 'B-court-paving', zone: 'B', x0: -134, x1: 134, z0: -155, z1: 78, style: 'paving' });
path({ id: 'B-gate-paving', zone: 'B', x0: -120, x1: 120, z0: -420, z1: -352, style: 'paving' });
axisCarpet('B-axis-carpet', 'B', 0, -344, 78, 9);

corridor({ id: 'B-corridor-w1', zone: 'B', x0: -100, x1: -92, z0: -310, z1: -256, axis: 'z' });
corridor({ id: 'B-corridor-w2', zone: 'B', x0: -100, x1: -92, z0: -208, z1: -150, axis: 'z' });
corridor({ id: 'B-corridor-e1', zone: 'B', x0: 92, x1: 100, z0: -310, z1: -256, axis: 'z' });
corridor({ id: 'B-corridor-e2', zone: 'B', x0: 92, x1: 100, z0: -208, z1: -150, axis: 'z' });

building({
  id: 'B-pav-tiren', name: '体仁阁', category: 'sidePavilion', archetype: 'pav2',
  x: -96, z: -232, w: 26, d: 26, h: 22, zone: 'B', level: 2, courtyard: 'B-plaza',
  info: '广场西侧二层楼阁，不可进入。'
});
building({
  id: 'B-pav-hongyi', name: '弘义阁', category: 'sidePavilion', archetype: 'pav2',
  x: 96, z: -232, w: 26, d: 26, h: 22, zone: 'B', level: 2, courtyard: 'B-plaza',
  info: '广场东侧二层楼阁，不可进入。'
});
building({
  id: 'B-hall-west1', name: '西朝房', category: 'sideHall', archetype: 'hall5',
  x: -122, z: -300, w: 36, d: 18, h: 13, zone: 'B', level: 4, courtyard: 'B-plaza',
  info: '前朝西侧朝房，不可进入。'
});
building({
  id: 'B-hall-east1', name: '东朝房', category: 'sideHall', archetype: 'hall5',
  x: 122, z: -300, w: 36, d: 18, h: 13, zone: 'B', level: 4, courtyard: 'B-plaza',
  info: '前朝东侧朝房，不可进入。'
});
building({
  id: 'B-hall-west2', name: '西庑房', category: 'sideHall', archetype: 'hall5',
  x: -122, z: -164, w: 34, d: 16, h: 12, zone: 'B', level: 4, courtyard: 'B-plaza',
  info: '前朝西侧庑房，不可进入。'
});
building({
  id: 'B-hall-east2', name: '东庑房', category: 'sideHall', archetype: 'hall5',
  x: 122, z: -164, w: 34, d: 16, h: 12, zone: 'B', level: 4, courtyard: 'B-plaza',
  info: '前朝东侧庑房，不可进入。'
});

const mainTiers = WORLD.central.terrace;
mainTiers.forEach((t, i) => terrace({
  id: 'B-main-t' + (i + 1), zone: 'B', x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y: t.y, tier: i + 1,
  gaps: [
    { side: 'z-', x0: -13, x1: 13 }, { side: 'z-', x0: -42, x1: -30 }, { side: 'z-', x0: 30, x1: 42 },
    { side: 'z+', x0: -10, x1: 10 },
    { side: 'x-', x0: -164, x1: -152 }, { side: 'x+', x0: -164, x1: -152 }
  ]
}));
for (let i = 0; i < 3; i++) {
  const y0 = i === 0 ? 0 : mainTiers[i - 1].y;
  const y1 = mainTiers[i].y;
  const front = mainTiers[i].z0;
  stairs({ id: 'B-main-danbi' + i, zone: 'B', x: 0, z: front - 4, w: 26, d: 8, y0, y1, dir: 'z+', style: 'imperial' });
  stairs({ id: 'B-main-stw' + i, zone: 'B', x: -36, z: front - 3.5, w: 12, d: 7, y0, y1, dir: 'z+' });
  stairs({ id: 'B-main-ste' + i, zone: 'B', x: 36, z: front - 3.5, w: 12, d: 7, y0, y1, dir: 'z+' });
  stairs({ id: 'B-main-stww' + i, zone: 'B', x: mainTiers[i].x0 - 3, z: -30, w: 12, d: 7, y0, y1, dir: 'x+', steps: 5 });
  stairs({ id: 'B-main-stee' + i, zone: 'B', x: mainTiers[i].x1 + 3, z: -30, w: 12, d: 7, y0, y1, dir: 'x-', steps: 5 });
  stairs({ id: 'B-main-stn' + i, zone: 'B', x: 0, z: mainTiers[i].z1 + 3, w: 16, d: 6, y0, y1, dir: 'z-', steps: 5 });
}

building({
  id: 'B-hall-main', name: '金銮殿', category: 'mainHall', archetype: 'hall11',
  x: 0, z: -60, w: 66, d: 34, h: 30, base: 4.5, zone: 'B', level: 1, courtyard: 'B-terrace-court',
  visitable: true, interiorShell: true, frontDoor: 22, backDoorW: 22,
  info: '前朝主殿，重檐庑殿顶。殿内金砖铺地、盘龙金柱与金銮宝座，可由南面中门进入。'
});
building({
  id: 'B-hall-zhonghe', name: '中和殿', category: 'squareHall', archetype: 'square3',
  x: 0, z: 8, w: 26, d: 26, h: 20, base: 4.5, zone: 'B', level: 2, courtyard: 'B-terrace-court',
  info: '主殿之后方形殿，四角攒尖顶，不可进入。'
});
building({
  id: 'B-hall-baohe', name: '保和殿', category: 'mainHall2', archetype: 'hall9',
  x: 0, z: 58, w: 50, d: 28, h: 24, base: 4.5, zone: 'B', level: 2, courtyard: 'B-terrace-court',
  info: '前朝后殿，单檐庑殿顶，不可进入。'
});

courtWall('B-wall-t1-w', 'B', -134, -132, -220, 78, 0, 4.5);
courtWall('B-wall-t1-e', 'B', 132, 134, -220, 78, 0, 4.5);

monument({ id: 'B-huabiao-w', zone: 'B', x: -26, z: -300, kind: 'huabiao', h: 11, r: 1.4, name: '华表' });
monument({ id: 'B-huabiao-e', zone: 'B', x: 26, z: -300, kind: 'huabiao', h: 11, r: 1.4, name: '华表' });
monument({ id: 'B-lion-w', zone: 'B', x: -22, z: -344, kind: 'lion', h: 3.2, r: 1.4, name: '铜狮' });
monument({ id: 'B-lion-e', zone: 'B', x: 22, z: -344, kind: 'lion', h: 3.2, r: 1.4, name: '铜狮' });
monument({ id: 'B-gui-w', zone: 'B', x: -30, z: -44, kind: 'gui', h: 2.6, r: 1.1, name: '铜龟' });
monument({ id: 'B-he-e', zone: 'B', x: 30, z: -44, kind: 'he', h: 2.6, r: 1.1, name: '铜鹤' });
monument({ id: 'B-ding-w', zone: 'B', x: -20, z: -84, kind: 'ding', h: 3.0, r: 1.3, name: '铜鼎' });
monument({ id: 'B-ding-e', zone: 'B', x: 20, z: -84, kind: 'ding', h: 3.0, r: 1.3, name: '铜鼎' });
monument({ id: 'B-sundial', zone: 'B', x: -34, z: -84, kind: 'sundial', h: 2.4, r: 1.2, name: '日晷' });
monument({ id: 'B-jiadian', zone: 'B', x: 34, z: -84, kind: 'jiadian', h: 2.4, r: 1.2, name: '嘉量' });

for (let i = 0; i < 10; i++) {
  const z = -318 + i * 30;
  lantern({ id: 'B-lamp-w' + i, zone: 'B', x: -90, z, y: 0 });
  lantern({ id: 'B-lamp-e' + i, zone: 'B', x: 90, z, y: 0 });
}
for (let i = 0; i < 5; i++) lantern({ id: 'B-lamp-t' + i, zone: 'B', x: -40 + i * 20, z: -166, y: 4.6, kind: 'terrace', scale: 0.8 });

viewpoint({ id: 'vp-B-zone', name: '前朝全景', zone: 'B', mode: 'zone', position: { x: -210, y: 132, z: -520 }, target: { x: 0, y: 10, z: -210 } });
viewpoint({ id: 'vp-B-main', name: '金銮殿近景', zone: 'B', mode: 'zone', position: { x: 0, y: 46, z: -196 }, target: { x: 0, y: 18, z: -60 } });
viewpoint({ id: 'vp-B-fp', name: '前朝广场', zone: 'B', mode: 'fp-spawn', position: { x: 0, y: 0, z: -300 }, target: { x: 0, y: 1.6, z: -60 } });
viewpoint({ id: 'vp-B-interior', name: '金銮殿内景', zone: 'B', mode: 'interior', position: { x: 0, y: 6.7, z: -71 }, target: { x: 0, y: 8.2, z: -54 }, fov: 62, area: { x0: -32, x1: 32, z0: -76, z1: -44, y0: 4.5, y1: 13 } });
