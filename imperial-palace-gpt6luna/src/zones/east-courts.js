import { CONNECTORS } from '../shared/layout.js';

const ZONE_ID = 'east';

/** Build the eastern study, display and garden courts in frozen world space. */
export function createZone(ctx) {
  const { THREE, kit } = ctx;
  if (!THREE || !kit) throw new Error('east courts require THREE and the shared palace kit');

  const root = new THREE.Group();
  root.name = 'zone-east-courts';
  root.userData.zoneId = ZONE_ID;
  const zone = { root, buildings: [], courtyards: [], connectors: [], colliders: [] };
  const ownedGeometries = new Set();

  function addPath(id, x, z, width, depth, material = kit.materials.marble) {
    const geometry = new THREE.BoxGeometry(width, 0.14, depth);
    ownedGeometries.add(geometry);
    const path = new THREE.Mesh(geometry, material);
    path.name = id;
    path.position.set(x, 0.19, z);
    path.receiveShadow = true;
    path.userData.pathId = id;
    root.add(path);
  }

  function addWall(start, end, height, gateWidth = 0) {
    const wall = kit.makeWall({ start, end, height, thickness: 1.8, gateWidth });
    root.add(wall);
    zone.colliders.push(...(wall.userData.wallColliders || []));
  }

  function addCourt(court) {
    const { id, name, x, z, width, depth, wallHeight = 4.7,
      southGate = 11, westGate = 9, eastGate = 0, northGate = 7 } = court;
    const floorGeometry = new THREE.BoxGeometry(width, 0.28, depth);
    ownedGeometries.add(floorGeometry);
    const floor = new THREE.Mesh(floorGeometry, kit.materials.ground);
    floor.position.set(x, 0.02, z);
    floor.receiveShadow = true;
    floor.userData.courtyardId = `east-${id}`;
    root.add(floor);

    const x0 = x - width / 2, x1 = x + width / 2;
    const z0 = z - depth / 2, z1 = z + depth / 2;
    addWall([x1, z0], [x0, z0], wallHeight, southGate);
    addWall([x0, z1], [x1, z1], wallHeight, northGate);
    addWall([x0, z1], [x0, z0], wallHeight, westGate);
    addWall([x1, z0], [x1, z1], wallHeight, eastGate);
    zone.courtyards.push({ id: `east-${id}`, name, bounds: [x0, x1, z0, z1], center: [x, z] });
  }

  function addBuilding(spec) {
    const { x, z, width, depth } = spec;
    const bounds = ctx.zoneLayout || ctx.layout?.ZONES?.east;
    if (bounds && (x - width / 2 < bounds.x[0] || x + width / 2 > bounds.x[1] ||
      z - depth / 2 < bounds.z[0] || z + depth / 2 > bounds.z[1])) {
      throw new RangeError(`${spec.id} footprint falls outside the frozen east-courts bounds`);
    }
    return kit.addBuilding(zone, { ...spec, id: `east-${spec.id}` });
  }

  function addGate(spec) {
    const built = addBuilding({
      kind: 'gate', height: 8.4, tiers: 1, ornament: 1, access: '外观可览',
      description: '采用共同建筑模数的敞开式院门。', ...spec
    });
    const body = built.group.children.find((child) => {
      const p = child.geometry?.parameters;
      return child.isMesh && p?.width === spec.width && p?.depth === spec.depth &&
        child.position.x === 0 && child.position.z === 0;
    });
    if (body) body.visible = false;
    const id = built.record.id;
    const postGeometry = new THREE.BoxGeometry(0.9, 4.6, 0.9);
    const lintelGeometry = new THREE.BoxGeometry(spec.width * 0.88, 0.76, 1.1);
    ownedGeometries.add(postGeometry);
    ownedGeometries.add(lintelGeometry);
    for (const px of [-spec.width * 0.39, spec.width * 0.39]) {
      const post = new THREE.Mesh(postGeometry, kit.materials.lacquer);
      post.position.set(px, 3.9, 0);
      post.userData.buildingId = id;
      post.castShadow = true;
      built.group.add(post);
    }
    const lintel = new THREE.Mesh(lintelGeometry, kit.materials.jade);
    lintel.position.set(0, 6.45, 0);
    lintel.userData.buildingId = id;
    lintel.castShadow = true;
    built.group.add(lintel);
    return built;
  }

  function addCourtyardEnsemble(court) {
    addCourt(court);
    const { id, name, x, z, width, depth, theme, water } = court;
    const southZ = z - depth / 2;
    addGate({ id: `${id}-gate`, name: `${name}·院门`, x, z: southZ + 4.5,
      width: 11, depth: 7, description: `通往${name}的朱门，门洞与院墙开口对齐。` });
    addBuilding({ id: `${id}-main`, name: `${name}·正殿`, kind: 'hall', x, z: z + 16,
      width: Math.min(34, width * 0.52), depth: 15, height: 11.2, tiers: 1, ornament: 2,
      description: `${theme}的核心殿堂，使用统一金瓦、朱墙和白石台基。` });
    const wingX = Math.max(20, width * 0.32);
    addBuilding({ id: `${id}-west-wing`, name: `${name}·西配殿`, kind: 'sideHall',
      x: x - wingX, z: z + 31, width: 13, depth: 10, height: 7.2, ornament: 1,
      description: `围合${name}北侧的配殿。` });
    addBuilding({ id: `${id}-east-wing`, name: `${name}·东配殿`, kind: 'sideHall',
      x: x + wingX, z: z + 31, width: 13, depth: 10, height: 7.2, ornament: 1,
      description: `与西配殿同模数的${name}配殿。` });
    addBuilding({ id: `${id}-pavilion`, name: `${name}·抱厦小亭`, kind: 'pavilion',
      x: x + 18, z: z - 19, width: 12, depth: 10, height: 7.6, tiers: 1, ornament: 1,
      description: `供院落休憩的小亭，尺度低于正殿。` });

    if (water) {
      const pondGeometry = new THREE.BoxGeometry(15, 0.22, 8);
      ownedGeometries.add(pondGeometry);
      const pond = new THREE.Mesh(pondGeometry, kit.materials.water);
      pond.position.set(x - 19, 0.18, z - 19);
      pond.receiveShadow = true;
      pond.userData.courtyardId = `east-${id}`;
      root.add(pond);
    }
  }

  // The east precinct uses a shifted, staggered court rhythm and display-garden
  // accents rather than mirroring the west. Its west-facing gates meet the lane.
  const courts = [
    { id: 'wenhua-study', name: '文华讲院', theme: '典籍研读与讲学', x: 154, z: -108,
      width: 62, depth: 88, wallHeight: 4.6, westGate: 10, eastGate: 10,
      southGate: 9, northGate: 8 },
    { id: 'display-court', name: '御用陈设庭', theme: '器物陈列与雅集', x: 232, z: -108,
      width: 68, depth: 104, wallHeight: 5, westGate: 11, southGate: 12,
      northGate: 8, water: true },
    { id: 'begonia-court', name: '海棠生活苑', theme: '起居与花木', x: 158, z: 110,
      width: 70, depth: 106, wallHeight: 4.5, westGate: 11, eastGate: 9,
      southGate: 10, northGate: 8, water: true },
    { id: 'listening-court', name: '听雨别院', theme: '静憩与听雨', x: 232, z: 110,
      width: 60, depth: 90, wallHeight: 4.8, westGate: 10, southGate: 12,
      northGate: 8 }
  ];
  for (const court of courts) addCourtyardEnsemble(court);

  // Keep the gate-east road clear; paired court walks pass through aligned
  // side doors and join the north-south lane at the frozen connector points.
  addPath('east-gate-approach', 192, 0, 176, 11, kit.materials.marble);
  addPath('east-inner-lane', 112, 0, 8, 360, kit.materials.marble);
  addPath('east-south-cross-lane', 192, -180, 176, 10, kit.materials.marble);
  addPath('east-north-cross-lane', 192, 180, 176, 10, kit.materials.marble);
  addPath('east-south-court-walk', 187, -108, 150, 7);
  addPath('east-north-court-walk', 187, 110, 150, 7);
  addPath('east-court-link-south', 112, -32, 7, 56);
  addPath('east-court-link-north', 112, 32, 7, 56);

  for (const [x, z, scale, kind] of [
    [269, -40, 1.12, 'broadleaf'], [269, 40, 1.08, 'pine'],
    [273, -170, 1.2, 'broadleaf'], [273, 170, 1.16, 'pine'],
    [127, -167, 0.9, 'broadleaf'], [127, 167, 0.94, 'pine'],
    [251, -163, 0.85, 'pine'], [251, 163, 0.9, 'broadleaf']
  ]) root.add(kit.makeTree({ x, z, scale, kind }));
  for (const [x, z] of [[264, 0], [136, 0], [118, -178], [118, 178],
    [224, -108], [154, -108], [232, 110], [158, 110]]) {
    root.add(kit.makeLamp({ x, z }));
  }

  for (const key of ['eastSouth', 'eastNorth', 'gateEast']) {
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
