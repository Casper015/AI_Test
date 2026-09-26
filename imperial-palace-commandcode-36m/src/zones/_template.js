export async function createZone(ctx) {
  const { THREE, kit, layout, zone, slots, corridors, roads, rng } = ctx;
  const rnd = rng(`zone.${zone.id}`);
  const root = new THREE.Group();
  root.name = `zone-${zone.id}`;

  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];

  for (const road of roads) root.add(kit.slabRect(road));

  for (const slot of slots) {
    const res = kit.building(slot);
    root.add(res.group);
    const bb = res.bounds;
    buildings.push({
      id: slot.id,
      name: slot.name,
      category: slot.kind,
      zone: zone.id,
      rot: slot.rot || 0,
      visitable: !!slot.visitable,
      info: slot.info || '',
      entrance: [slot.x, res.height * 0.4, slot.z],
      bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }
    });
    obstacles.push({ min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    if (slot.kind === 'hall' || slot.kind === 'gateHall' || slot.kind === 'pavilion') {
      lightAnchors.push({ id: `${slot.id}.lamp`, type: 'lantern', position: [slot.x, res.height * 0.6, slot.z], color: 0xffb46b, intensity: 6 });
    }
  }

  for (const cor of corridors) {
    const g = kit.corridor({ x: 0, z: 0, len: cor.len, w: 5.4, h: 4.2 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
    const half = cor.len / 2;
    if (cor.axis === 'z') obstacles.push({ min: [cor.x - 2.6, 0, cor.z - half], max: [cor.x + 2.6, 3.4, cor.z + half] });
    else obstacles.push({ min: [cor.x - half, 0, cor.z - 2.6], max: [cor.x + half, 3.4, cor.z + 2.6] });
  }

  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
    surfaces.push({ id: `conn.${c.id}`, min: [c.x - c.w / 2, 0, c.z - c.w / 2], max: [c.x + c.w / 2, 0, c.z + c.w / 2], y: c.elev, kind: 'ground' });
  }

  surfaces.push({ id: `ground.${zone.id}`, min: [zone.minX, 0, zone.minZ], max: [zone.maxX, 0, zone.maxZ], y: 0, kind: 'ground' });

  viewpoints.push({
    id: `zone.${zone.id}`,
    name: zone.name,
    mode: 'zone',
    position: [zone.minX + (zone.maxX - zone.minX) * 0.5, 150, zone.minZ - 240],
    target: [zone.minX + (zone.maxX - zone.minX) * 0.5, 10, zone.minZ + (zone.maxZ - zone.minZ) * 0.4],
    fov: 42
  });
  viewpoints.push({ id: `fp.${zone.id}`, name: `${zone.name}·出生点`, mode: 'fp-spawn', position: [0, 0, zone.maxZ - 20], target: [0, 1.6, zone.minZ] });

  void rnd;
  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}
