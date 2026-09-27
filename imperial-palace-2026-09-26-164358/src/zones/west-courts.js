import { CONNECTORS } from '../shared/layout.js';

const ZONE_ID = 'west';

/** Build the western residential and ceremonial courts in frozen world space. */
export function createZone(ctx) {
  const { THREE, kit } = ctx;
  if (!THREE || !kit) throw new Error('west courts require THREE and the shared palace kit');

  const root = new THREE.Group();
  root.name = 'zone-west-courts';
  root.userData.zoneId = ZONE_ID;
  const zone = { root, buildings: [], courtyards: [], connectors: [], colliders: [] };
  const ownedGeometries = new Set();
  const pathsByMaterial = new Map();

  function addPath(id, x, z, width, depth, material = kit.materials.marble) {
    if (!pathsByMaterial.has(material)) pathsByMaterial.set(material, []);
    pathsByMaterial.get(material).push({ id, x, z, width, depth });
  }

  function flushPaths() {
    const geometry = new THREE.BoxGeometry(1, 0.14, 1);
    ownedGeometries.add(geometry);
    const transform = new THREE.Object3D();
    for (const [material, paths] of pathsByMaterial) {
      const batch = new THREE.InstancedMesh(geometry, material, paths.length);
      batch.name = 'west-stone-walks';
      batch.userData.pathIds = paths.map(({ id }) => id);
      paths.forEach(({ x, z, width, depth }, index) => {
        transform.position.set(x, 0.19, z);
        transform.scale.set(width, 1, depth);
        transform.updateMatrix();
        batch.setMatrixAt(index, transform.matrix);
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.receiveShadow = true;
      root.add(batch);
    }
  }

  function addWall(start, end, height, gateWidth = 0) {
    const wall = kit.makeWall({ start, end, height, thickness: 1.8, gateWidth });
    root.add(wall);
    zone.colliders.push(...(wall.userData.wallColliders || []));
  }

  function addCourt(court) {
    const { id, name, x, z, width, depth, wallHeight = 4.7,
      southGate = 11, eastGate = 9, westGate = 0, northGate = 0 } = court;
    const floorGeometry = new THREE.BoxGeometry(width, 0.28, depth);
    ownedGeometries.add(floorGeometry);
    const floor = new THREE.Mesh(floorGeometry, kit.materials.ground);
    floor.position.set(x, 0.02, z);
    floor.receiveShadow = true;
    floor.userData.courtyardId = `west-${id}`;
    root.add(floor);

    const x0 = x - width / 2, x1 = x + width / 2;
    const z0 = z - depth / 2, z1 = z + depth / 2;
    addWall([x1, z0], [x0, z0], wallHeight, southGate);
    addWall([x0, z1], [x1, z1], wallHeight, northGate);
    addWall([x0, z1], [x0, z0], wallHeight, westGate);
    addWall([x1, z0], [x1, z1], wallHeight, eastGate);
    zone.courtyards.push({ id: `west-${id}`, name, bounds: [x0, x1, z0, z1], center: [x, z] });
  }

  function addBuilding(spec) {
    const { x, z, width, depth } = spec;
    const bounds = ctx.zoneLayout || ctx.layout?.ZONES?.west;
    if (bounds && (x - width / 2 < bounds.x[0] || x + width / 2 > bounds.x[1] ||
      z - depth / 2 < bounds.z[0] || z + depth / 2 > bounds.z[1])) {
      throw new RangeError(`${spec.id} footprint falls outside the frozen west-courts bounds`);
    }
    return kit.addBuilding(zone, { ...spec, id: `west-${spec.id}` });
  }

  function addGate(spec) {
    const built = addBuilding({
      kind: 'gate', height: 8.4, tiers: 1, ornament: 1, access: '外观可览',
      description: '采用共同建筑模数的敞开式院门。', ...spec
    });
    // The kit preserves its solid gate body separately and merges the plinth
    // and steps into one marble batch. Hide both so this portal is open at grade.
    for (const child of built.group.children) {
      if (child.isMesh && (child.userData.solidGateBody || child.material === kit.materials.marble)) {
        child.visible = false;
      }
    }
    const id = built.record.id;
    const postGeometry = new THREE.BoxGeometry(0.9, 4.6, 0.9);
    const lintelGeometry = new THREE.BoxGeometry(spec.width * 0.88, 0.76, 1.1);
    ownedGeometries.add(postGeometry);
    ownedGeometries.add(lintelGeometry);
    const posts = new THREE.InstancedMesh(postGeometry, kit.materials.lacquer, 2);
    const transform = new THREE.Object3D();
    [-spec.width * 0.39, spec.width * 0.39].forEach((px, index) => {
      transform.position.set(px, 3.9, 0);
      transform.updateMatrix();
      posts.setMatrixAt(index, transform.matrix);
    });
    posts.instanceMatrix.needsUpdate = true;
    posts.userData.buildingId = id;
    posts.castShadow = true;
    built.group.add(posts);
    const lintel = new THREE.Mesh(lintelGeometry, kit.materials.jade);
    lintel.position.set(0, 6.45, 0);
    lintel.userData.buildingId = id;
    lintel.castShadow = true;
    built.group.add(lintel);
    return built;
  }

  function addCourtyardEnsemble(court) {
    addCourt(court);
    const { id, name, x, z, width, depth, theme, water, pavilionSide = -1,
      hallWidth = Math.min(34, width * 0.52), wingOffset = 31, pavilionZ = -19 } = court;
    const southZ = z - depth / 2;
    addGate({ id: `${id}-gate`, name: `${name}·院门`, x, z: southZ + 4.5,
      width: 11, depth: 7, description: `通往${name}的朱门，门洞与院墙开口对齐。` });
    addBuilding({ id: `${id}-main`, name: `${name}·正堂`, kind: 'hall', x, z: z + 16,
      width: hallWidth, depth: 15, height: court.hallHeight || 11.2, tiers: 1, ornament: 2,
      description: `${theme}的核心殿堂，使用统一金瓦、朱墙和白石台基。` });
    const wingX = Math.max(20, width * 0.32);
    addBuilding({ id: `${id}-west-wing`, name: `${name}·西配房`, kind: 'sideHall',
      x: x - wingX, z: z + wingOffset, width: 13, depth: 10, height: 7.2, ornament: 1,
      description: `围合${name}北侧的配房。` });
    addBuilding({ id: `${id}-east-wing`, name: `${name}·东配房`, kind: 'sideHall',
      x: x + wingX, z: z + wingOffset, width: 13, depth: 10, height: 7.2, ornament: 1,
      description: `与西配房同模数的${name}配房。` });
    addBuilding({ id: `${id}-pavilion`, name: `${name}·歇山小亭`, kind: 'pavilion',
      x: x + pavilionSide * 18, z: z + pavilionZ, width: 12, depth: 10, height: 7.6, tiers: 1, ornament: 1,
      description: `供院落休憩的小亭，尺度低于正堂。` });

    if (water) {
      const pondGeometry = new THREE.BoxGeometry(15, 0.22, 8);
      ownedGeometries.add(pondGeometry);
      const pond = new THREE.Mesh(pondGeometry, kit.materials.water);
      pond.position.set(x - pavilionSide * 19, 0.18, z - 19);
      pond.receiveShadow = true;
      pond.userData.courtyardId = `west-${id}`;
      root.add(pond);
    }
  }

  // Four differently sized compounds form two connected rows. The east wall
  // doors align with the north-south lane; the west doors connect row courts.
  const courts = [
    { id: 'pear-garden', name: '梨园礼乐庭', theme: '礼乐与雅集', x: -230, z: -108,
      width: 68, depth: 92, wallHeight: 5.1, eastGate: 10, water: true, hallWidth: 30,
      pavilionSide: -1 },
    { id: 'archive-court', name: '藏书清院', theme: '藏书与校勘', x: -153, z: -108,
      width: 58, depth: 98, wallHeight: 4.5, westGate: 10, eastGate: 10,
      southGate: 9, hallWidth: 25, wingOffset: 29, pavilionSide: 1, pavilionZ: -25 },
    { id: 'music-court', name: '清音水庭', theme: '清音与观水', x: -232, z: 110,
      width: 72, depth: 94, wallHeight: 4.8, eastGate: 11, southGate: 12,
      water: true, hallWidth: 32, pavilionSide: -1, pavilionZ: -25 },
    { id: 'service-court', name: '尚仪内务院', theme: '内务与陈设', x: -153, z: 110,
      width: 62, depth: 102, wallHeight: 4.4, westGate: 11, eastGate: 10,
      southGate: 9, hallWidth: 28, wingOffset: 34, pavilionSide: 1, hallHeight: 10.5 }
  ];
  for (const court of courts) addCourtyardEnsemble(court);

  // Main cross-court walks meet the frozen west gate and the south/north
  // central connectors. The z=0 route remains open all the way to gate-west.
  addPath('west-gate-approach', -192, 0, 176, 11, kit.materials.marble);
  addPath('west-inner-lane', -112, 0, 8, 360, kit.materials.marble);
  addPath('west-south-cross-lane', -192, -180, 176, 10, kit.materials.marble);
  addPath('west-north-cross-lane', -192, 180, 176, 10, kit.materials.marble);
  addPath('west-south-court-walk', -189, -108, 150, 7);
  addPath('west-north-court-walk', -189, 110, 150, 7);
  addPath('west-court-link-south', -112, -32, 7, 56);
  addPath('west-court-link-north', -112, 32, 7, 56);
  // The south entries are reached from the transverse lanes.  Court interiors
  // also have an unbroken center walk to the front of their main halls.
  for (const court of courts) {
    const southEdge = court.z - court.depth / 2;
    const laneZ = court.z < 0 ? -180 : 0;
    addPath(`west-${court.id}-approach`, court.x, (laneZ + southEdge) / 2,
      6, Math.abs(southEdge - laneZ) + 1);
    addPath(`west-${court.id}-spine`, court.x, court.z - court.depth / 4,
      5, court.depth / 2 - 12);
  }

  for (const [x, z, scale, kind] of [
    [-269, -38, 1.12, 'pine'], [-269, 38, 1.08, 'broadleaf'],
    [-273, -170, 1.25, 'pine'], [-273, 170, 1.16, 'broadleaf'],
    [-127, -167, 0.9, 'pine'], [-127, 167, 0.92, 'broadleaf'],
    [-251, -163, 0.82, 'broadleaf'], [-251, 163, 0.88, 'pine']
  ]) root.add(kit.makeTree({ x, z, scale, kind }));
  for (const [x, z] of [[-264, 0], [-136, 0], [-118, -178], [-118, 178],
    [-222, -108], [-154, -108], [-224, 110], [-154, 110]]) {
    root.add(kit.makeLamp({ x, z }));
  }
  flushPaths();

  // The adjacent zone owners register these shared IDs. This module aligns
  // clear paths to them but deliberately does not register duplicate links.
  for (const key of ['westSouth', 'westNorth', 'gateWest']) {
    if (!CONNECTORS[key]) throw new Error(`Missing frozen connector ${key}`);
  }

  return {
    root,
    buildings: zone.buildings,
    courtyards: zone.courtyards,
    connectors: zone.connectors,
    colliders: zone.colliders,
    update() {},
    dispose() {
      root.clear();
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.clear();
    }
  };
}
