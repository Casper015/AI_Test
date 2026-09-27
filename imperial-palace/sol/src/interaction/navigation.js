// World-space walk solver shared by the browser controller and layout checks.
// Height is in metres above the palace datum; the camera adds eye height.
export function createWalkNavigation(buildings, zones) {
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function groundHeight(x, z) {
    let height = 0;
    if (Math.abs(x) < 12 && z >= -136 && z < -108) {
      height = Math.min(3.84, (Math.floor((z + 136) / 3.45) + 1) * 0.48);
    }
    if (Math.abs(Math.abs(x) - 32) < 5.25 && z >= -130 && z < -102.4) {
      height = Math.max(height, Math.min(3.84, (Math.floor((z + 130) / 3.45) + 1) * 0.48));
    }
    if (Math.abs(x) < 5 && z >= -108 && z < -100) height = Math.max(height, 3.84);
    if (Math.abs(Math.abs(x) - 32) < 5.25 && z >= -102.4 && z < -100) height = Math.max(height, 3.84);
    if (Math.abs(x) < 55 && z >= -110 && z <= -32) height = Math.max(height, 1.35);
    if (Math.abs(x) < 50 && z >= -105 && z <= -37) height = Math.max(height, 2.65);
    if (Math.abs(x) < 45 && z >= -100 && z <= -42) height = Math.max(height, 3.925);
    if ((Math.abs(x) < 11.5 || Math.abs(Math.abs(x) - 32) < 5.25) && z >= -42 && z < -14.4) {
      height = Math.max(height, (8 - Math.floor((z + 42) / 3.45)) * 0.48);
    }
    for (const building of buildings.values()) {
      if (!building.visitable) continue;
      const [width, depth] = building.size;
      const floor = Math.max(1.25, 0.14 * (building.category === 'main' ? 36 : 13));
      const front = building.z - depth / 2;
      if (Math.abs(x - building.x) < Math.min(width * 0.18, 5.5) && z >= front - 10 && z < front) {
        const lower = building.category === 'main' ? 3.925 : 0;
        height = Math.max(height, lower + (floor - lower) * clamp((z - (front - 10)) / 10, 0, 1));
      }
      if (Math.abs(x - building.x) < width / 2 - 1.5 && z >= front && z <= building.z + depth / 2 - 1.5) {
        height = Math.max(height, floor);
      }
    }
    return height;
  }

  function collides(x, z, currentHeight = groundHeight(x, z)) {
    for (const item of buildings.values()) {
      const [w, d] = item.size;
      if (item.category === 'gate') {
        const alongX = w >= d;
        const opening = Math.max(8, (alongX ? w : d) - 22);
        const inDoorway = alongX
          ? Math.abs(x - item.x) < opening / 2 - 0.7
          : Math.abs(z - item.z) < opening / 2 - 0.7;
        if (inDoorway) continue;
      }
      if (item.visitable) {
        const insideRoom = Math.abs(x - item.x) < w / 2 - 1.8 && Math.abs(z - item.z) < d / 2 - 1.8;
        if (insideRoom) continue;
        const doorApproach = Math.abs(x - item.x) < Math.min(w * 0.18, 4.5) && z < item.z - d / 2 + 3.5 && z > item.z - d / 2 - 10;
        if (doorApproach) continue;
      }
      if (Math.abs(x - item.x) < w / 2 + 1.6 && Math.abs(z - item.z) < d / 2 + 1.6) return true;
    }
    for (const zone of zones) {
      for (const wall of zone.colliders || []) {
        const dx = x - wall.center[0], dz = z - wall.center[1];
        const cos = Math.cos(wall.rotation), sin = Math.sin(wall.rotation);
        const localX = cos * dx - sin * dz;
        const localZ = sin * dx + cos * dz;
        if (localX > wall.xMin - 1.1 && localX < wall.xMax + 1.1 && Math.abs(localZ) < wall.halfThickness + 1.05) return true;
      }
    }
    const inside = Math.abs(x) < 283 && Math.abs(z) < 429;
    const southBridge = Math.abs(x) < 9 && z >= -484 && z < -426;
    const northBridge = Math.abs(x) < 9 && z > 426 && z <= 484;
    const sideBridge = Math.abs(z) < 8 && Math.abs(x) >= 280 && Math.abs(x) <= 338;
    if (!inside && !southBridge && !northBridge && !sideBridge) return true;
    if (groundHeight(x, z) - currentHeight > 0.68) return true;
    return false;
  }

  return { groundHeight, collides };
}
