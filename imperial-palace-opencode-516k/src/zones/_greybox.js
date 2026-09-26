import { CITY } from '../shared/config.js';

export async function createGreybox(ctx) {
  const { THREE, kit, config, layout, zone, slots, corridors, roads } = ctx;
  const root = new THREE.Group();
  root.name = `zone-${zone.id}`;
  const buildings = [];
  const connectors = [];
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];
  const viewpoints = [];

  for (const road of roads) root.add(kit.slabRect(road));
  for (const cor of corridors) {
    const g = kit.corridor({ x: 0, z: 0, len: cor.len, w: 5.4, h: 4.2 });
    g.position.set(cor.x, 0, cor.z);
    g.rotation.y = cor.axis === 'z' ? Math.PI / 2 : 0;
    root.add(g);
    const half = cor.len / 2;
    const t = 2.6;
    if (cor.axis === 'z') obstacles.push({ min: [cor.x - t, 0, cor.z - half], max: [cor.x + t, 3.4, cor.z + half] });
    else obstacles.push({ min: [cor.x - half, 0, cor.z - t], max: [cor.x + half, 3.4, cor.z + t] });
  }

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

  if (zone.id === 'boundary') {
    const hx = CITY.halfX, hz = CITY.halfZ;
    const runs = [
      { axis: 'x', fixed: -hz, from: -hx, to: hx, gap: [{ at: 0, w: 44 }] },
      { axis: 'x', fixed: hz, from: -hx, to: hx, gap: [{ at: 0, w: 40 }] },
      { axis: 'z', fixed: -hx, from: -hz, to: hz, gap: [{ at: 0, w: 38 }] },
      { axis: 'z', fixed: hx, from: -hz, to: hz, gap: [{ at: 0, w: 38 }] }
    ];
    for (const run of runs) {
      const parts = [];
      let cursor = run.from;
      const gaps = run.gap.slice().sort((a, b) => a.at - b.at);
      for (const gp of gaps) {
        const gs = gp.at - gp.w / 2;
        const ge = gp.at + gp.w / 2;
        if (gs > cursor) parts.push([cursor, gs]);
        cursor = ge;
      }
      if (cursor < run.to) parts.push([cursor, run.to]);
      for (const [a, b] of parts) {
        const len = b - a;
        const mid = (a + b) / 2;
        const x = run.axis === 'x' ? mid : run.fixed;
        const z = run.axis === 'x' ? run.fixed : mid;
        const w = kit.wall({ x, z, len, axis: run.axis === 'x' ? 'x' : 'z' });
        root.add(w);
        const t = 2.2;
        if (run.axis === 'x') obstacles.push({ min: [a, 0, z - t], max: [b, CITY.wallH + 1.4, z + t] });
        else obstacles.push({ min: [x - t, 0, a], max: [x + t, CITY.wallH + 1.4, b] });
      }
    }
    const bridges = [
      { x: 0, z: -(hz + CITY.moatW / 2), rot: 90, len: CITY.moatW + 14, w: 24 },
      { x: 0, z: hz + CITY.moatW / 2, rot: 90, len: CITY.moatW + 14, w: 22 },
      { x: -(hx + CITY.moatW / 2), z: 0, rot: 0, len: CITY.moatW + 14, w: 22 },
      { x: hx + CITY.moatW / 2, z: 0, rot: 0, len: CITY.moatW + 14, w: 22 }
    ];
    for (const b of bridges) {
      const br = kit.bridge({ x: 0, z: 0, len: b.len, w: b.w });
      br.position.set(b.x, 0, b.z);
      br.rotation.y = (b.rot * Math.PI) / 180;
      root.add(br);
      for (let i = 0; i < 5; i++) {
        const frac = i / 4;
        const y = Math.sin(Math.PI * (0.1 + 0.8 * frac)) * 2.2;
        const off = (frac - 0.5) * b.len;
        if (b.rot === 90) surfaces.push({ id: `${b.x}_${b.z}_${i}`, min: [b.x - b.w / 2, 0, b.z + off - b.len / 10], max: [b.x + b.w / 2, 0, b.z + off + b.len / 10], y, kind: 'bridge' });
        else surfaces.push({ id: `${b.x}_${b.z}_${i}`, min: [b.x + off - b.len / 10, 0, b.z - b.w / 2], max: [b.x + off + b.len / 10, 0, b.z + b.w / 2], y, kind: 'bridge' });
      }
    }
  }

  for (const c of layout.CONNECTORS) {
    if (c.owner !== zone.id) continue;
    connectors.push({ id: c.id, position: [c.x, c.z], width: c.w, elevation: c.elev, walkable: true });
  }

  const spawn = zone.id === 'boundary' ? [0, 0, -466] : [zone.minX + (zone.maxX - zone.minX) / 2, 0, zone.minZ + 8];
  viewpoints.push({
    id: `zone.${zone.id}`,
    name: zone.name,
    mode: 'zone',
    position: [zone.minX + (zone.maxX - zone.minX) * 0.5, 150, Math.min(zone.minZ, -10) - 240],
    target: [zone.minX + (zone.maxX - zone.minX) * 0.5, 10, zone.minZ + (zone.maxZ - zone.minZ) * 0.4],
    fov: 42
  });
  const spawnTarget = zone.id === 'boundary' ? [0, 1.6, -380] : [0, 1.6, spawn[2] + 60];
  viewpoints.push({ id: `fp.${zone.id}`, name: `${zone.name}·第一人称出生点`, mode: 'fp-spawn', position: spawn, target: spawnTarget });

  if (zone.id === 'forecourt') {
    viewpoints.push({ id: 'interior.main-hall', name: '金銮殿内景', mode: 'interior', position: [0, 5.5, -101], target: [0, 4, -140], fov: 58 });
  }
  if (zone.id === 'inner') {
    viewpoints.push({ id: 'interior.inner-hall', name: '寝殿内景', mode: 'interior', position: [0, 5.5, 176], target: [0, 3.6, 143], fov: 58 });
  }

  const inZone = (b) => b.bounds.min[0] > zone.minX - 40 && b.bounds.max[0] < zone.maxX + 40 && b.bounds.min[2] > zone.minZ - 40 && b.bounds.max[2] < zone.maxZ + 40;
  surfaces.push({ id: `ground.${zone.id}`, min: [Math.min(zone.minX, -5), 0, Math.min(zone.minZ, -5)], max: [Math.max(zone.maxX, 5), 0, Math.max(zone.maxZ, 5)], y: 0, kind: 'ground' });
  for (const b of buildings) {
    if (!inZone(b)) continue;
    surfaces.push({
      id: `${b.id}.plinth`,
      min: [b.bounds.min[0] + 1, 0, b.bounds.min[2] + 1],
      max: [b.bounds.max[0] - 1, 0, b.bounds.max[2] - 1],
      y: 0.4,
      kind: 'ground'
    });
  }

  kit.mergeStatic(root);
  return { root, buildings, connectors, colliders: { obstacles, surfaces }, viewpoints, lightAnchors, update: () => {}, dispose: () => {} };
}
