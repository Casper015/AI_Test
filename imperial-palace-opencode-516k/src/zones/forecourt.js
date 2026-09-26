import { buildZone } from './_builder.js';

export async function createZone(ctx) {
  const out = await buildZone(ctx, {
    courtyardWalls: true,
    courtWallH: 7,
    trees: { pine: 0.4, broad: 0.45, willow: 0.15 },
    stoneLamps: true,
    interiorKind: (slot) => (slot.id === 'b.main-hall' ? 'throne' : 'chamber'),
    fpSpawn: [0, 0, -330],
    fpTarget: [0, 1.6, -240]
  });
  out.source = 'zone';
  return out;
}
