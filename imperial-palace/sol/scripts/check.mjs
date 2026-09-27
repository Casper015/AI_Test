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
    if (entry.isDirectory()) await checkSyntax(file);
    else if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert.equal(result.status, 0, `Syntax error in ${path.relative(rootDir, file)}\n${result.stderr}`);
    }
  }
}

await checkSyntax(path.join(rootDir, 'src'));
const kit = createPalaceKit(THREE);
const factories = { forecourt, inner, west, east, garden };
const allBuildings = [];
const allCourtyards = [];
const seenConnectors = new Map();

for (const [zoneKey, createZone] of Object.entries(factories)) {
  const zone = await createZone({ THREE, kit, config: CONFIG, layout: { BOUNDS, CONNECTORS, ZONES }, zoneKey, zoneLayout: ZONES[zoneKey] });
  assert.ok(zone?.root?.isGroup, `${zoneKey} returns a THREE.Group root`);
  assert.ok(Array.isArray(zone.buildings), `${zoneKey} returns building registrations`);
  assert.ok(Array.isArray(zone.courtyards), `${zoneKey} returns courtyard registrations`);
  zone.root.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry?.getAttribute('position');
    assert.ok(position, `${zoneKey}/${node.name || 'mesh'} has vertex positions`);
    for (let i = 0; i < position.count; i += 1) {
      assert.ok(
        Number.isFinite(position.getX(i)) && Number.isFinite(position.getY(i)) && Number.isFinite(position.getZ(i)),
        `${zoneKey}/${node.name || 'mesh'} has only finite vertex positions`
      );
    }
  });
  for (const building of zone.buildings) {
    assert.ok(building.id && building.name, `${zoneKey} building has stable ID and name`);
    assert.ok(Number.isFinite(building.x) && Number.isFinite(building.z), `${building.id} has world coordinates`);
    assert.ok(Math.abs(building.x) <= BOUNDS.maxX + 35 && Math.abs(building.z) <= BOUNDS.maxZ + 35, `${building.id} is in the city envelope`);
    allBuildings.push(building);
  }
  allCourtyards.push(...zone.courtyards);
  for (const connector of zone.connectors || []) {
    const frozen = CONNECTORS[Object.keys(CONNECTORS).find((key) => CONNECTORS[key].id === connector.id)];
    assert.ok(frozen, `${zoneKey} connector ${connector.id} exists in the shared layout`);
    assert.deepEqual(connector.position, frozen.position, `${connector.id} position matches the shared layout`);
    assert.equal(connector.width, frozen.width, `${connector.id} width matches the shared layout`);
    assert.ok(!seenConnectors.has(connector.id), `${connector.id} is owned by exactly one zone`);
    seenConnectors.set(connector.id, zoneKey);
  }
  zone.dispose?.();
}

const buildingIds = allBuildings.map(({ id }) => id);
const courtyardIds = allCourtyards.map(({ id }) => id);
assert.equal(new Set(buildingIds).size, buildingIds.length, 'building IDs are unique across all zones');
assert.equal(new Set(courtyardIds).size, courtyardIds.length, 'courtyard IDs are unique across all zones');
assert.ok(allBuildings.length >= CONFIG.buildingTargets.min, `at least ${CONFIG.buildingTargets.min} registered buildings`);
assert.ok(allCourtyards.length >= CONFIG.buildingTargets.courtyards, `at least ${CONFIG.buildingTargets.courtyards} registered courtyards`);

console.log(`Passed: ${allBuildings.length} buildings, ${allCourtyards.length} courtyards, ${seenConnectors.size} registered connectors.`);
