import { buildBoundary, buildGarden } from './_builder.js';

export async function createZone(ctx) {
  const out = await buildBoundary(ctx);
  out.source = 'zone';
  return out;
}

export async function createGarden(ctx) {
  const out = await buildGarden(ctx);
  out.source = 'zone';
  return out;
}
