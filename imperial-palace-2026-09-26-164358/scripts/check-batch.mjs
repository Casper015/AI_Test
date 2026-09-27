import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONFIG } from '../src/shared/config.js';
import { BOUNDS, CONNECTORS, ZONES } from '../src/shared/layout.js';
import { createPalaceKit } from '../src/kit/palace-kit.js';
import { batchStaticScene, buildingIdForHit } from '../src/shared/static-batch.js';
import { createZone as forecourt } from '../src/zones/forecourt.js';
import { createZone as inner } from '../src/zones/inner-palace.js';
import { createZone as west } from '../src/zones/west-courts.js';
import { createZone as east } from '../src/zones/east-courts.js';
import { createZone as garden } from '../src/zones/garden-boundary.js';

const root = new THREE.Group();
const kit = createPalaceKit(THREE);
const buildings = [];
for (const [key, createZone] of Object.entries({ forecourt, inner, west, east, garden })) {
  const zone = createZone({ THREE, kit, config: CONFIG, layout: { BOUNDS, CONNECTORS, ZONES }, zoneKey: key, zoneLayout: ZONES[key] });
  root.add(zone.root);
  buildings.push(...zone.buildings);
}

const before = { meshes: 0 };
root.traverse((node) => { if (node.isMesh) before.meshes++; });
const batch = batchStaticScene(THREE, root);
const after = { meshes: 0, batchedIds: new Set() };
root.traverse((node) => {
  if (!node.isMesh) return;
  after.meshes++;
  assert.ok(node.material, `${node.name} has a material`);
  for (const range of node.userData.faceBuildings || []) {
    if (!range.id) continue;
    after.batchedIds.add(range.id);
    assert.equal(buildingIdForHit({ object: node, faceIndex: range.start }), range.id);
    assert.equal(buildingIdForHit({ object: node, faceIndex: range.end - 1 }), range.id);
  }
});
assert.ok(after.meshes < before.meshes / 4, `static batching reduces ${before.meshes} meshes to ${after.meshes}`);
for (const building of buildings) assert.ok(after.batchedIds.has(building.id), `${building.id} is still pickable`);

root.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 250, -71), new THREE.Vector3(0, -1, 0));
const selected = raycaster.intersectObject(root, true).map(buildingIdForHit).find(Boolean);
assert.equal(selected, 'forecourt-taihe-hall', 'a real roof ray still selects the main hall');

console.log(`Passed: static meshes ${before.meshes} → ${after.meshes}, ${batch.batchMeshes} batches, ${after.batchedIds.size} pickable buildings.`);
batch.dispose();
