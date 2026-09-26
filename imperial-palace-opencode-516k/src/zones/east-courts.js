import { buildZone } from './_builder.js';

export async function createZone(ctx) {
  const out = await buildZone(ctx, {
    courtyardWalls: true,
    courtWallH: 5.6,
    trees: { pine: 0.35, broad: 0.5, willow: 0.15 },
    stoneLamps: true,
    rockeries: 4,
    fpSpawn: [128, 0, 0],
    fpTarget: [220, 1.6, 0]
  });
  out.source = 'zone';
  return out;
}
