import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONFIG } from '../src/shared/config.js';
import { BOUNDS, CONNECTORS, ZONES } from '../src/shared/layout.js';
import { createPalaceKit } from '../src/kit/palace-kit.js';
import { createWalkNavigation } from '../src/interaction/navigation.js';
import { createZone as forecourt } from '../src/zones/forecourt.js';
import { createZone as inner } from '../src/zones/inner-palace.js';
import { createZone as west } from '../src/zones/west-courts.js';
import { createZone as east } from '../src/zones/east-courts.js';
import { createZone as garden } from '../src/zones/garden-boundary.js';

const kit = createPalaceKit(THREE);
const zones = [];
const buildings = new Map();
for (const [key, createZone] of Object.entries({ forecourt, inner, west, east, garden })) {
  const zone = createZone({ THREE, kit, config: CONFIG, layout: { BOUNDS, CONNECTORS, ZONES }, zoneKey: key, zoneLayout: ZONES[key] });
  // Mirror the registration used by the browser so wall openings are tested too.
  zone.colliders ||= [];
  const known = new Set(zone.colliders.map((wall) => JSON.stringify(wall)));
  zone.root.traverse((node) => {
    for (const wall of node.userData.wallColliders || []) {
      const signature = JSON.stringify(wall);
      if (known.has(signature)) continue;
      known.add(signature);
      zone.colliders.push(wall);
    }
  });
  zones.push(zone);
  for (const building of zone.buildings) buildings.set(building.id, building);
}

const { collides, groundHeight } = createWalkNavigation(buildings, zones);
assert.equal(collides(0, -480, 0), false, 'south bridge spawn is walkable');
assert.equal(collides(30, -450, 0), true, 'moat beside south bridge is blocked');
assert.equal(collides(100, -430, 0), true, 'southern wall away from gate is blocked');
assert.equal(collides(0, -430, 0), false, 'south gate opening is walkable');
assert.equal(collides(310, 100, 0), true, 'outside the side bridge is blocked');

let previousHeight = groundHeight(0, -480);
for (let z = -479.5; z <= -390; z += 0.5) {
  assert.equal(collides(0, z, previousHeight), false, `south bridge → forecourt route blocked at z=${z}`);
  previousHeight = groundHeight(0, z);
}

// Flood the connected walkable grid with the same step-height rule as the
// controller. This catches disconnected gate openings without pretending to be
// a substitute for human keyboard/pointer-lock QA.
const step = 2;
const queue = [[0, -480]];
const seen = new Set(['0,-480']);
const reached = new Set();
const targets = [
  { name: 'forecourt', x: 0, z: -200, tolerance: 8 },
  { name: 'main hall approach', x: 0, z: -104, tolerance: 8 },
  { name: 'main hall interior', x: 0, z: -71, tolerance: 2 },
  { name: 'inner palace', x: 0, z: 190, tolerance: 12 },
  { name: 'bedchamber interior', x: 0, z: 184, tolerance: 2 },
  { name: 'garden', x: 0, z: 350, tolerance: 12 }
];
for (let head = 0; head < queue.length && reached.size < targets.length; head++) {
  const [x, z] = queue[head];
  for (const target of targets) {
    if (Math.hypot(x - target.x, z - target.z) <= target.tolerance) reached.add(target.name);
  }
  for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
    const nextX = x + dx, nextZ = z + dz;
    if (Math.abs(nextX) > 110 || nextZ < -480 || nextZ > 390) continue;
    const key = `${nextX},${nextZ}`;
    if (seen.has(key) || collides(nextX, nextZ, groundHeight(x, z))) continue;
    seen.add(key);
    queue.push([nextX, nextZ]);
  }
}
assert.deepEqual([...reached].sort(), targets.map(({ name }) => name).sort(), `continuous walk grid from south bridge reached ${[...reached].join(', ')}`);

console.log(`Passed: walk spawn, moat/walls/gate, 180 south approach steps and a continuous route through ${targets.length} core destinations.`);
for (const zone of zones) zone.dispose?.();
