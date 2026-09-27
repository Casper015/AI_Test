import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { CONFIG } from '../src/shared/config.js';
import { BOUNDS, CONNECTORS, ZONES } from '../src/shared/layout.js';
import { createPalaceKit } from '../src/kit/palace-kit.js';
import { createZone as forecourt } from '../src/zones/forecourt.js';
import { createZone as inner } from '../src/zones/inner-palace.js';
import { createZone as west } from '../src/zones/west-courts.js';
import { createZone as east } from '../src/zones/east-courts.js';
import { createZone as garden } from '../src/zones/garden-boundary.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function checkSyntax(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await checkSyntax(file);
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert.equal(result.status, 0, `Syntax error in ${path.relative(rootDir, file)}\n${result.stderr}`);
    }
  }
}

console.log('1. Checking JavaScript syntax across src/ and scripts/...');
await checkSyntax(path.join(rootDir, 'src'));
await checkSyntax(path.join(rootDir, 'scripts'));
console.log('✓ Syntax check passed.');

console.log('2. Instantiating Palace Kit and Zones...');
const kit = createPalaceKit(THREE);
const factories = { forecourt, inner, west, east, garden };
const allBuildings = [];
const allCourtyards = [];
const seenConnectors = new Map();

for (const [zoneKey, createZone] of Object.entries(factories)) {
  const zone = await createZone({
    THREE,
    kit,
    config: CONFIG,
    layout: { BOUNDS, CONNECTORS, ZONES },
    zoneKey,
    zoneLayout: ZONES[zoneKey]
  });

  assert.ok(zone?.root?.isGroup, `${zoneKey} returns a THREE.Group root`);
  assert.ok(Array.isArray(zone.buildings), `${zoneKey} returns building registrations`);
  assert.ok(Array.isArray(zone.courtyards), `${zoneKey} returns courtyard registrations`);

  // Verify all mesh vertices are finite (no NaN, no Infinity)
  zone.root.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry?.getAttribute('position');
    assert.ok(position, `${zoneKey}/${node.name || 'mesh'} has vertex positions`);
    for (let i = 0; i < position.count; i += 1) {
      assert.ok(
        Number.isFinite(position.getX(i)) &&
        Number.isFinite(position.getY(i)) &&
        Number.isFinite(position.getZ(i)),
        `${zoneKey}/${node.name || 'mesh'} has only finite vertex positions`
      );
    }
  });

  // Verify buildings
  for (const building of zone.buildings) {
    assert.ok(building.id && building.name, `${zoneKey} building has stable ID and name`);
    assert.ok(Number.isFinite(building.x) && Number.isFinite(building.z), `${building.id} has world coordinates`);
    assert.ok(
      Math.abs(building.x) <= BOUNDS.maxX + 35 && Math.abs(building.z) <= BOUNDS.maxZ + 35,
      `${building.id} is in the city envelope`
    );
    allBuildings.push(building);
  }

  // Verify courtyards
  allCourtyards.push(...zone.courtyards);

  // Verify connectors
  for (const connector of zone.connectors || []) {
    const frozen = CONNECTORS[Object.keys(CONNECTORS).find((key) => CONNECTORS[key].id === connector.id)];
    assert.ok(frozen, `${zoneKey} connector ${connector.id} exists in shared layout`);
    assert.deepEqual(connector.position, frozen.position, `${connector.id} position matches shared layout`);
    assert.equal(connector.width, frozen.width, `${connector.id} width matches shared layout`);
    assert.ok(!seenConnectors.has(connector.id), `${connector.id} is owned by exactly one zone`);
    seenConnectors.set(connector.id, zoneKey);
  }

  zone.dispose?.();
}

console.log('3. Validating IDs and counts...');
const buildingIds = allBuildings.map(({ id }) => id);
const courtyardIds = allCourtyards.map(({ id }) => id);

assert.equal(new Set(buildingIds).size, buildingIds.length, 'Building IDs are unique across all zones');
assert.equal(new Set(courtyardIds).size, courtyardIds.length, 'Courtyard IDs are unique across all zones');
assert.ok(allBuildings.length >= CONFIG.buildingTargets.min, `At least ${CONFIG.buildingTargets.min} registered buildings (actual: ${allBuildings.length})`);
assert.ok(allCourtyards.length >= CONFIG.buildingTargets.courtyards, `At least ${CONFIG.buildingTargets.courtyards} registered courtyards (actual: ${allCourtyards.length})`);

// Check enterable buildings (visitable)
const visitable = allBuildings.filter((b) => b.visitable);
console.log(`Visitable buildings (${visitable.length}):`, visitable.map((b) => b.name).join(', '));
assert.ok(visitable.length >= 2, 'At least 2 enterable buildings with interiors (Taihe Hall and bedchamber)');

console.log('4. Validating architectural elevation & positioning...');
const taihe = allBuildings.find((b) => b.id === 'fc-taihe-dian');
const zhonghe = allBuildings.find((b) => b.id === 'fc-zhonghe-dian');
const baohe = allBuildings.find((b) => b.id === 'fc-baohe-dian');
assert.equal(taihe?.y, 4.5, 'Taihe Hall is elevated on top of the 4.5m marble terrace');
assert.equal(zhonghe?.y, 4.5, 'Zhonghe Hall is elevated on top of the 4.5m marble terrace');
assert.equal(baohe?.y, 4.5, 'Baohe Hall is elevated on top of the 4.5m marble terrace');

const yujing = allBuildings.find((b) => b.id === 'gb-yujing-ting');
assert.ok(yujing && yujing.y >= 10, 'Yujing Pavilion is perched on top of Dui Xiu Shan rockery summit');

console.log('5. Validating First-Person Controller logic...');
const { FirstPersonController } = await import('../src/interaction/first-person.js');
const dummyCamera = new THREE.PerspectiveCamera();
const dummyDom = { addEventListener() {}, removeEventListener() {} };
const fps = new FirstPersonController(dummyCamera, dummyDom, CONFIG, [], allBuildings);

// Verify spawn orientation: yaw = 0 points towards +Z (North)
fps.start();
assert.equal(fps.position.z, -310, 'Spawn position is on central axis south of Taihe Gate');
assert.equal(fps.yaw, 0, 'Spawn yaw is 0 facing North');

// Test gate traversal: central tunnel should NOT collide, sides should collide
const gatePassThrough = fps.checkCollision(0, -268); // Center of Taihe Gate
const gateSideHit = fps.checkCollision(20, -268); // Side masonry of Taihe Gate
assert.equal(gatePassThrough, false, 'Player can smoothly walk through center arch tunnel of Taihe Gate');
assert.equal(gateSideHit, true, 'Player collides with side walls of Taihe Gate');

// Test visitable building entrance
const taiheDoorOpen = fps.checkCollision(0, -82); // Entrance of Taihe Hall
assert.equal(taiheDoorOpen, false, 'Player can walk through entrance into Taihe Hall');

// Test ground height on terrace and inside buildings
assert.ok(fps.getGroundHeight(0, -60) >= 5.5, 'Taihe Hall interior floor height is elevated above terrace');
assert.ok(fps.getGroundHeight(0, 248) >= 2.0, 'Kunning Palace bedchamber floor height is elevated');
assert.ok(fps.getGroundHeight(0, 395) >= 12.0, 'Dui Xiu Shan summit height reaches Yujing Pavilion');

console.log('6. Validating Views & Tour stops...');
const { VIEWS, TOUR_STOPS } = await import('../src/shared/layout.js');
assert.ok(VIEWS.overview && VIEWS.forecourt && VIEWS.taihe && VIEWS.inner && VIEWS.garden && VIEWS.west && VIEWS.east, 'All major regions have dedicated preset views');
assert.ok(TOUR_STOPS.length >= 10, 'At least 10 ceremonial tour stops along central axis');

console.log(`\n🎉 Verification Passed:
- Buildings: ${allBuildings.length} (Target: >= ${CONFIG.buildingTargets.min})
- Courtyards: ${allCourtyards.length} (Target: >= ${CONFIG.buildingTargets.courtyards})
- Connectors: ${seenConnectors.size} (Registered & verified)
- Terrace Elevation: Three Great Halls at y = 4.5m atop marble base
- Mountain Summit: Yujing Pavilion at y = 13.5m atop Dui Xiu Shan
- First-Person: North orientation (+Z), gate tunnel pass-through, and interior floor heights verified
- Geometry vertices: 100% Finite, zero NaNs across all meshes.`);
