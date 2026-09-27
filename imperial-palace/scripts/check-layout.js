import assert from 'node:assert/strict';
import { BUILDINGS, COURTYARDS, CONNECTORS } from '../src/zones/catalog.js';

const ids = BUILDINGS.map(({ id }) => id);
assert.equal(new Set(ids).size, ids.length, 'Building IDs must be unique.');
assert.ok(BUILDINGS.length >= 50, `Expected at least 50 buildings, got ${BUILDINGS.length}.`);
assert.ok(COURTYARDS.length >= 12, `Expected at least 12 courtyards, got ${COURTYARDS.length}.`);
assert.ok(CONNECTORS.length >= 5, 'Expected the five shared inter-zone connectors.');

const zoneCounts = Object.groupBy
  ? Object.groupBy(BUILDINGS, ({ zone }) => zone)
  : BUILDINGS.reduce((result, building) => {
      (result[building.zone] ||= []).push(building);
      return result;
    }, {});
for (const zone of ['forecourt', 'inner', 'west', 'east', 'garden', 'boundary']) {
  assert.ok(zoneCounts[zone]?.length, `Missing buildings in ${zone}.`);
}
for (const building of BUILDINGS) {
  assert.ok(Number.isFinite(building.x) && Number.isFinite(building.z), `Invalid position: ${building.id}`);
  assert.ok(building.width > 0 && building.depth > 0, `Invalid footprint: ${building.id}`);
}

console.log(`Layout OK — ${BUILDINGS.length} buildings, ${COURTYARDS.length} courtyards, ${CONNECTORS.length} connectors.`);
