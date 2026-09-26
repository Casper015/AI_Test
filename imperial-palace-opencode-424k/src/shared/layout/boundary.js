/**
 * 紫禁天朝 · F 边界：宫墙、四门、角楼、护城河、入城桥（frozen layout-v1）
 */

import { WORLD } from '../config.js';
import { building, water, bridge, deck, path, connector, outerWallSegments, viewpoint, stairs } from './registry.js';

const MOAT = WORLD.moat;

export const outerWallCount = outerWallSegments('F');

const corners = [[-300, -420], [300, -420], [-300, 420], [300, 420]];
corners.forEach((c, i) => {
  building({
    id: 'F-tower-corner' + (i + 1), name: '角楼' + (i + 1), category: 'cornerTower', archetype: 'towerCorner',
    x: c[0], z: c[1], rot: i * 90, w: 24, d: 24, h: 26, zone: 'F', level: 1,
    info: '宫城四角角楼，三重檐十字脊，不可进入。'
  });
});

building({
  id: 'F-gate-south', name: '午门', category: 'gateMain', archetype: 'gateMain',
  x: 0, z: -420, w: 122, d: 17, h: 30, zone: 'F', level: 1,
  opens: [{ x0: -7, x1: 7, top: 9 }, { x0: -46, x1: -34, top: 6.5 }, { x0: 34, x1: 46, top: 6.5 }],
  info: '宫城正门，三门洞可通行；城楼五凤形制，楼内不可进入。'
});
building({
  id: 'F-gate-north', name: '神武门', category: 'gateHall', archetype: 'gate3',
  x: 0, z: 420, w: 66, d: 26, h: 22, zone: 'F', level: 1, opens: [{ x0: -7, x1: 7, top: 7 }],
  info: '宫城北门，中门可通行。'
});
building({
  id: 'F-gate-west', name: '西华门', category: 'gateHall', archetype: 'gate3',
  x: -300, z: 40, rot: 90, w: 50, d: 20, h: 18, zone: 'F', level: 2, opens: [{ x0: -6, x1: 6, top: 6 }],
  info: '宫城西门，通西侧宫苑。'
});
building({
  id: 'F-gate-east', name: '东华门', category: 'gateHall', archetype: 'gate3',
  x: 300, z: 40, rot: -90, w: 50, d: 20, h: 18, zone: 'F', level: 2, opens: [{ x0: -6, x1: 6, top: 6 }],
  info: '宫城东门，通东侧宫苑。'
});

water({ id: 'F-moat-s', zone: 'F', x0: -MOAT.outerX, x1: MOAT.outerX, z0: -MOAT.outerZ, z1: -MOAT.innerZ, kind: 'moat' });
water({ id: 'F-moat-n', zone: 'F', x0: -MOAT.outerX, x1: MOAT.outerX, z0: MOAT.innerZ, z1: MOAT.outerZ, kind: 'moat' });
water({ id: 'F-moat-w', zone: 'F', x0: -MOAT.outerX, x1: -MOAT.innerX, z0: -MOAT.innerZ, z1: MOAT.innerZ, kind: 'moat' });
water({ id: 'F-moat-e', zone: 'F', x0: MOAT.innerX, x1: MOAT.outerX, z0: -MOAT.innerZ, z1: MOAT.innerZ, kind: 'moat' });

function cityBridge(id, axis, x0, x1, z0, z1, name) {
  bridge({ id, zone: 'F', x0, x1, z0, z1, y: 0.5, axis, name });
  const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;
  if (axis === 'z') {
    deck(id + ':deck', 'F', x0 + 2, x1 - 2, z0 + 4, z1 - 4, 0.5);
    stairs({ id: id + ':ramp-s', zone: 'F', x: midX, z: z0 - 3, w: x1 - x0 - 2, d: 8, y0: -0.8, y1: 0.5, dir: 'z+', steps: 4 });
    stairs({ id: id + ':ramp-n', zone: 'F', x: midX, z: z1 + 3, w: x1 - x0 - 2, d: 8, y0: -0.8, y1: 0.5, dir: 'z-', steps: 4 });
  } else {
    deck(id + ':deck', 'F', x0 + 4, x1 - 4, z0 + 2, z1 - 2, 0.5);
    stairs({ id: id + ':ramp-w', zone: 'F', x: x0 - 3, z: midZ, w: z1 - z0 - 2, d: 8, y0: 0, y1: 0.5, dir: 'x+', steps: 3 });
    stairs({ id: id + ':ramp-e', zone: 'F', x: x1 + 3, z: midZ, w: z1 - z0 - 2, d: 8, y0: 0, y1: 0.5, dir: 'x-', steps: 3 });
  }
}

cityBridge('F-bridge-s-mid', 'z', -9, 9, -494, -434, '御道桥');
cityBridge('F-bridge-s-w', 'z', -43, -25, -494, -434, '西金水桥');
cityBridge('F-bridge-s-e', 'z', 25, 43, -494, -434, '东金水桥');
cityBridge('F-bridge-n', 'z', -9, 9, 434, 494, '北桥');
cityBridge('F-bridge-w', 'x', -368, -308, 32, 50, '西华桥');
cityBridge('F-bridge-e', 'x', 308, 368, 32, 50, '东华桥');

path({ id: 'F-plaza-south', zone: 'F', x0: -150, x1: 150, z0: -560, z1: -426, style: 'paving' });
path({ id: 'F-plaza-north', zone: 'F', x0: -110, x1: 110, z0: 426, z1: 560, style: 'paving' });
path({ id: 'F-outer-e', zone: 'F', x0: 306, x1: 440, z0: -30, z1: 110, style: 'soil' });
path({ id: 'F-outer-w', zone: 'F', x0: -440, x1: -306, z0: -30, z1: 110, style: 'soil' });
path({ id: 'F-bank-s', zone: 'F', x0: -300, x1: 300, z0: -442, z1: -426, style: 'soil' });
path({ id: 'F-bank-n', zone: 'F', x0: -300, x1: 300, z0: 426, z1: 442, style: 'soil' });

connector({ id: 'conn-south-bridge', a: 'F', b: 'F', position: { x: 0, y: 0.5, z: -464 }, width: 18, elevation: 0.5, kind: 'bridge' });
connector({ id: 'conn-south-gate', a: 'F', b: 'B', position: { x: 0, y: 0, z: -420 }, width: 14, elevation: 0, kind: 'gate' });
connector({ id: 'conn-north-gate', a: 'F', b: 'F', position: { x: 0, y: 0, z: 420 }, width: 14, elevation: 0, kind: 'gate' });
connector({ id: 'conn-west-gate', a: 'F', b: 'D', position: { x: -300, y: 0, z: 40 }, width: 12, elevation: 0, kind: 'gate' });
connector({ id: 'conn-east-gate', a: 'F', b: 'E', position: { x: 300, y: 0, z: 40 }, width: 12, elevation: 0, kind: 'gate' });
connector({ id: 'conn-garden-south', a: 'C', b: 'F', position: { x: 0, y: 0, z: 300 }, width: 24, elevation: 0, kind: 'path' });
connector({ id: 'conn-west-court-1', a: 'B', b: 'D', position: { x: -135, y: 0, z: -300 }, width: 10, elevation: 0, kind: 'path' });
connector({ id: 'conn-west-court-2', a: 'B', b: 'D', position: { x: -135, y: 0, z: -60 }, width: 10, elevation: 0, kind: 'path' });
connector({ id: 'conn-west-court-3', a: 'C', b: 'D', position: { x: -135, y: 0, z: 200 }, width: 10, elevation: 0, kind: 'path' });
connector({ id: 'conn-east-court-1', a: 'B', b: 'E', position: { x: 135, y: 0, z: -300 }, width: 10, elevation: 0, kind: 'path' });
connector({ id: 'conn-east-court-2', a: 'B', b: 'E', position: { x: 135, y: 0, z: -60 }, width: 10, elevation: 0, kind: 'path' });
connector({ id: 'conn-east-court-3', a: 'C', b: 'E', position: { x: 135, y: 0, z: 200 }, width: 10, elevation: 0, kind: 'path' });

viewpoint({ id: 'vp-gate-zone', name: '午门', zone: 'F', mode: 'zone', position: { x: 0, y: 52, z: -600 }, target: { x: 0, y: 18, z: -420 } });
viewpoint({ id: 'vp-out-fp', name: '南桥', zone: 'F', mode: 'fp-spawn', position: { x: 0, y: -0.8, z: -516 }, target: { x: 0, y: 0.4, z: -430 } });
