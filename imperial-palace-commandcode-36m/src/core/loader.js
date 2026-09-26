import { slotsOf, CORRIDORS, ROADS } from '../shared/layout.js';
import { createZone as forecourt } from '../zones/forecourt.js';
import { createZone as innerPalace } from '../zones/inner-palace.js';
import { createZone as westCourts } from '../zones/west-courts.js';
import { createZone as eastCourts } from '../zones/east-courts.js';
import { createZone as gardenBoundary, createGarden } from '../zones/garden-boundary.js';

const FACTORIES = {
  forecourt,
  inner: innerPalace,
  west: westCourts,
  east: eastCourts,
  garden: createGarden,
  boundary: gardenBoundary
};

export async function loadZones({ ctx, registry, onProgress }) {
  const out = {};
  const ids = Object.keys(ctx.layout.ZONES);
  let done = 0;
  for (const id of ids) {
    const zone = ctx.layout.ZONES[id];
    const zoneCtx = {
      ...ctx,
      zone,
      slots: slotsOf(id),
      corridors: CORRIDORS[id] || [],
      roads: ROADS.filter((r) => inZoneRect(r, zone))
    };
    const factory = FACTORIES[id];
    const result = await factory(zoneCtx);
    result.source = result.source || 'zone';
    result.zoneId = id;
    out[id] = result;
    registry.addZone(id, result);
    done++;
    if (onProgress) onProgress(done, ids.length, id, result.source, result);
  }
  return out;
}

function inZoneRect(r, zone) {
  return r.x >= zone.minX && r.x <= zone.maxX && r.z >= zone.minZ && r.z <= zone.maxZ;
}
