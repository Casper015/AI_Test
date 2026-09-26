export function createRegistry({ THREE, config, layout }) {
  const buildings = new Map();
  const zones = new Map();
  const viewpoints = new Map();
  const lightAnchors = [];
  const obstacles = [];
  const surfaces = [];

  function addZone(name, out) {
    zones.set(name, out);
    for (const b of out.buildings || []) {
      b.zone = b.zone || name;
      buildings.set(b.id, b);
    }
    for (const v of out.viewpoints || []) {
      viewpoints.set(v.id, { ...v, zone: name });
    }
    for (const l of out.lightAnchors || []) lightAnchors.push({ ...l, zone: name });
    const col = out.colliders || {};
    for (const o of col.obstacles || []) obstacles.push({ ...o, zone: name });
    for (const s of col.surfaces || []) surfaces.push({ ...s, zone: name });
  }

  function addSurface(id, minX, minZ, maxX, maxZ, y, kind = 'ground') {
    surfaces.push({ id, min: [minX, 0, minZ], max: [maxX, 0, maxZ], y, kind });
  }

  const inside = (s, x, z) => x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2];

  function surfacesAt(x, z) {
    return surfaces.filter((s) => inside(s, x, z));
  }

  function surfaceAt(x, z, fromY = 999) {
    const list = surfacesAt(x, z);
    if (!list.length) return { y: 0, kind: 'ground', id: 'ground.base' };
    let best = null;
    for (const s of list) {
      if (s.y <= fromY + config.FP.step + 0.01) {
        if (!best || s.y > best.y) best = s;
      }
    }
    if (!best) {
      best = list.reduce((a, b) => (a.y < b.y ? a : b));
    }
    return best;
  }

  function blocked(x, z, y0, y1) {
    const r = config.FP.radius;
    for (const o of obstacles) {
      if (o.skipCollision) continue;
      if (x + r < o.min[0] || x - r > o.max[0]) continue;
      if (z + r < o.min[2] || z - r > o.max[2]) continue;
      if (y1 < o.min[1] || y0 > o.max[1]) continue;
      return true;
    }
    return false;
  }

  function resolveMove(from, to, footY) {
    const y0 = footY + 0.25;
    const y1 = footY + config.FP.eye - 0.05;
    if (!blocked(to[0], to[1], y0, y1)) return [to[0], to[1]];
    if (!blocked(to[0], from[1], y0, y1)) return [to[0], from[1]];
    if (!blocked(from[0], to[1], y0, y1)) return [from[0], to[1]];
    return [from[0], from[1]];
  }

  function boundsOfZone(zoneId) {
    return layout.ZONES[zoneId] || null;
  }

  function nearestViewpoint(mode, x, z) {
    let best = null;
    let bestD = Infinity;
    for (const v of viewpoints.values()) {
      if (mode && v.mode !== mode) continue;
      const d = (v.position[0] - x) ** 2 + (v.position[2] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  function byCategory(category) {
    return Array.from(buildings.values()).filter((b) => b.category === category);
  }

  return {
    buildings, zones, viewpoints, lightAnchors, obstacles, surfaces,
    addZone, addSurface, surfacesAt, surfaceAt, blocked, resolveMove,
    boundsOfZone, nearestViewpoint, byCategory,
    get size() { return buildings.size; }
  };
}
