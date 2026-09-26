import { buildZone } from './_builder.js';

export async function createZone(ctx) {
  const out = await buildZone(ctx, {
    courtyardWalls: true,
    courtWallH: 6.2,
    trees: { pine: 0.35, broad: 0.45, willow: 0.2 },
    stoneLamps: true,
    rockeries: 3,
    interiorKind: () => 'chamber',
    fpSpawn: [0, 0, 72],
    fpTarget: [0, 1.6, 150]
  });
  out.source = 'zone';
  return out;
}
