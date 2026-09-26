/**
 * 紫禁天朝 · F 御花园：钦安殿、亭阁、叠山、园池与廊（frozen layout-v1）
 */

import { building, courtyard, terrace, stairs, corridor, path, water, bridge, deck, rock, lantern, viewpoint, connector } from './registry.js';

building({
  id: 'F-hall-qinan', name: '钦安殿', category: 'gardenHall', archetype: 'hall5',
  x: 0, z: 372, w: 32, d: 20, h: 16, base: 1.5, zone: 'F', level: 2, courtyard: 'F-garden',
  info: '御花园正殿，不可进入。'
});
terrace({ id: 'F-qinan-t', zone: 'F', x0: -26, x1: 26, z0: 356, z1: 388, y: 1.5, tier: 1, gaps: [{ side: 'z-', x0: -10, x1: 10 }, { side: 'z+', x0: -8, x1: 8 }] });
stairs({ id: 'F-qinan-st', zone: 'F', x: 0, z: 352, w: 18, d: 5, y0: 0, y1: 1.5, dir: 'z+' });
stairs({ id: 'F-qinan-st2', zone: 'F', x: 0, z: 392, w: 14, d: 5, y0: 0, y1: 1.5, dir: 'z-' });

building({ id: 'F-pav-wanchun', name: '万春亭', category: 'pavilion', archetype: 'pav2', x: -64, z: 344, w: 17, d: 17, h: 16, zone: 'F', level: 2, info: '御花园重檐亭，不可进入。' });
building({ id: 'F-pav-qianqiu', name: '千秋亭', category: 'pavilion', archetype: 'pav2', x: 64, z: 344, w: 17, d: 17, h: 16, zone: 'F', level: 2, info: '御花园重檐亭，不可进入。' });
building({ id: 'F-pav-fubi', name: '浮碧亭', category: 'pavilion', archetype: 'pav1', x: -100, z: 396, w: 12, d: 12, h: 12, zone: 'F', level: 3, info: '御花园小亭，不可进入。' });
building({ id: 'F-pav-chengrui', name: '澄瑞亭', category: 'pavilion', archetype: 'pav1', x: 100, z: 396, w: 12, d: 12, h: 12, zone: 'F', level: 3, info: '御花园小亭，不可进入。' });

corridor({ id: 'F-corridor-n', zone: 'F', x0: -118, x1: 118, z0: 408, z1: 416, axis: 'x' });
corridor({ id: 'F-corridor-w', zone: 'F', x0: -128, x1: -120, z0: 306, z1: 404, axis: 'z' });
corridor({ id: 'F-corridor-e', zone: 'F', x0: 120, x1: 128, z0: 306, z1: 404, axis: 'z' });

courtyard({ id: 'F-garden', name: '御花园', zone: 'F', cx: 0, cz: 360, w: 270, d: 118, level: 3, theme: 'garden' });
path({ id: 'F-garden-path-1', zone: 'F', x0: -6, x1: 6, z0: 300, z1: 418, style: 'gravel' });
path({ id: 'F-garden-path-2', zone: 'F', x0: -120, x1: 120, z0: 350, z1: 360, style: 'gravel' });
path({ id: 'F-garden-path-3', zone: 'F', x0: -92, x1: 92, z0: 396, z1: 404, style: 'gravel' });
path({ id: 'F-garden-path-4', zone: 'F', x0: -92, x1: -84, z0: 320, z1: 404, style: 'gravel' });
path({ id: 'F-garden-path-5', zone: 'F', x0: 84, x1: 92, z0: 320, z1: 404, style: 'gravel' });

water({ id: 'F-pond', zone: 'F', x0: 34, x1: 94, z0: 386, z1: 416, kind: 'pond' });
bridge({ id: 'F-bridge-pond', zone: 'F', x0: 34, x1: 94, z0: 398, z1: 408, y: 0.45, axis: 'x', name: '园桥' });
deck('F-bridge-pond:deck', 'F', 38, 90, 400, 406, 0.45);

rock({ id: 'F-rockery-1', zone: 'F', x: -40, z: 336, r: 5, ra: 6.5, h: 7, seed: 11, kind: 'rockery' });
rock({ id: 'F-rockery-2', zone: 'F', x: -29, z: 330, r: 3.6, ra: 4, h: 5, seed: 12, kind: 'rockery' });
rock({ id: 'F-rockery-3', zone: 'F', x: -50, z: 331, r: 3, ra: 3.6, h: 4.2, seed: 13, kind: 'rockery' });
rock({ id: 'F-rock-1', zone: 'F', x: 30, z: 320, r: 2, ra: 2.4, h: 2.4, seed: 14, kind: 'rock' });
rock({ id: 'F-rock-2', zone: 'F', x: 118, z: 372, r: 2.2, ra: 2.6, h: 2.6, seed: 15, kind: 'rock' });
rock({ id: 'F-rock-3', zone: 'F', x: -108, z: 316, r: 1.8, ra: 2.2, h: 2.2, seed: 16, kind: 'rock' });

building({
  id: 'F-gate-garden', name: '顺贞门', category: 'gateSmall', archetype: 'gate1',
  x: 0, z: 300, w: 24, d: 11, h: 12, zone: 'F', level: 3, opens: [{ x0: -5, x1: 5, top: 5 }],
  info: '内廷通往御花园的门，可通行。'
});
connector({ id: 'conn-garden-gate', a: 'C', b: 'F', position: { x: 0, y: 0, z: 300 }, width: 20, elevation: 0, kind: 'gate' });

for (let i = 0; i < 8; i++) lantern({ id: 'F-lamp' + i, zone: 'F', x: -105 + i * 30, z: 330, y: 0, scale: 0.8, kind: 'garden' });

viewpoint({ id: 'vp-F-zone', name: '御花园', zone: 'F', mode: 'zone', position: { x: -190, y: 96, z: 250 }, target: { x: 0, y: 6, z: 370 } });
viewpoint({ id: 'vp-F-fp', name: '花园入口', zone: 'F', mode: 'fp-spawn', position: { x: 0, y: 0, z: 312 }, target: { x: 0, y: 1.6, z: 380 } });
