import { CONNECTORS } from '../shared/layout.js';

const WALL = Object.freeze({ halfWidth: 284, halfDepth: 430, height: 13, thickness: 5 });
const MOAT = Object.freeze({ width: 34, waterY: -0.78 });

/**
 * Build the garden and the complete outer boundary in frozen world coordinates.
 * Shared buildings/materials come from the palace kit; local meshes are limited
 * to paths, water, bridges, battlements and the open gatehouse frames.
 */
export function createZone(ctx) {
  const { THREE, kit } = ctx;
  if (!THREE || !kit) throw new TypeError('garden-boundary requires ctx.THREE and ctx.kit');

  const root = new THREE.Group();
  root.name = 'garden-boundary';
  const buildings = [];
  const courtyards = [];
  const colliders = [];
  const ownedGeometries = new Set();

  const ownGeometry = (geometry) => {
    ownedGeometries.add(geometry);
    return geometry;
  };
  const box = (width, height, depth) => ownGeometry(new THREE.BoxGeometry(width, height, depth));
  const mesh = (geometry, material, parent = root, id = undefined) => {
    const result = new THREE.Mesh(geometry, material);
    result.castShadow = true;
    result.receiveShadow = true;
    if (id) result.userData.buildingId = id;
    parent.add(result);
    return result;
  };
  const addBox = (width, height, depth, x, y, z, material, parent = root, id = undefined) => {
    const result = mesh(box(width, height, depth), material, parent, id);
    result.position.set(x, y, z);
    return result;
  };

  function addWaterRect(x, z, width, depth) {
    const water = addBox(width, 0.12, depth, x, MOAT.waterY, z, kit.materials.water);
    water.castShadow = false;
    return water;
  }

  function addOuterGround() {
    // A broad underlay prevents exposed edges around the moat in the overview.
    addBox(760, 2, 1040, 0, -2.05, 0, kit.materials.dark);
    // The shared base is kept below zone floors so other regions can build on it.
    addBox(WALL.halfWidth * 2, 0.5, WALL.halfDepth * 2, 0, -0.29, 0, kit.materials.ground);
  }

  function addMoat() {
    const outerX = WALL.halfWidth + MOAT.width;
    const outerZ = WALL.halfDepth + MOAT.width;
    const southBridgeGap = 24;
    const northBridgeGap = 26;
    const sideBridgeGap = 24;

    // Four continuous bands are split only where the four bridges cross.
    const southZ = -(WALL.halfDepth + MOAT.width / 2);
    const northZ = WALL.halfDepth + MOAT.width / 2;
    addWaterRect((-outerX - southBridgeGap / 2) / 2, southZ, outerX - southBridgeGap / 2, MOAT.width);
    addWaterRect((outerX + southBridgeGap / 2) / 2, southZ, outerX - southBridgeGap / 2, MOAT.width);
    addWaterRect((-outerX - northBridgeGap / 2) / 2, northZ, outerX - northBridgeGap / 2, MOAT.width);
    addWaterRect((outerX + northBridgeGap / 2) / 2, northZ, outerX - northBridgeGap / 2, MOAT.width);

    const westX = -(WALL.halfWidth + MOAT.width / 2);
    const eastX = WALL.halfWidth + MOAT.width / 2;
    addWaterRect(westX, (-WALL.halfDepth - sideBridgeGap / 2) / 2, MOAT.width, WALL.halfDepth - sideBridgeGap / 2);
    addWaterRect(westX, (WALL.halfDepth + sideBridgeGap / 2) / 2, MOAT.width, WALL.halfDepth - sideBridgeGap / 2);
    addWaterRect(eastX, (-WALL.halfDepth - sideBridgeGap / 2) / 2, MOAT.width, WALL.halfDepth - sideBridgeGap / 2);
    addWaterRect(eastX, (WALL.halfDepth + sideBridgeGap / 2) / 2, MOAT.width, WALL.halfDepth - sideBridgeGap / 2);

    // Pale stone coping follows the outside edge and gives the water a crisp limit.
    for (const [z, gap] of [[-outerZ, southBridgeGap], [outerZ, northBridgeGap]]) {
      const segmentWidth = outerX - gap / 2;
      addBox(segmentWidth, 0.42, 1.8, -(outerX + gap / 2) / 2, -0.15, z, kit.materials.marble);
      addBox(segmentWidth, 0.42, 1.8, (outerX + gap / 2) / 2, -0.15, z, kit.materials.marble);
    }
    for (const [x, gap] of [[-outerX, sideBridgeGap], [outerX, sideBridgeGap]]) {
      const segmentDepth = WALL.halfDepth - gap / 2;
      addBox(1.8, 0.42, segmentDepth, x, -0.15, -(WALL.halfDepth + gap / 2) / 2, kit.materials.marble);
      addBox(1.8, 0.42, segmentDepth, x, -0.15, (WALL.halfDepth + gap / 2) / 2, kit.materials.marble);
    }
  }

  function addWallCrenellations() {
    const spacing = 8;
    const toothWidth = 3.3;
    const gateWidths = { south: 34, north: 26, west: 22, east: 22 };
    const centers = [];
    for (let x = -WALL.halfWidth + 2; x <= WALL.halfWidth - 2; x += spacing) {
      if (Math.abs(x) > gateWidths.south / 2 + toothWidth || Math.abs(x) > gateWidths.north / 2 + toothWidth) {
        centers.push([x, -WALL.halfDepth]);
        centers.push([x, WALL.halfDepth]);
      }
    }
    for (let z = -WALL.halfDepth + 2; z <= WALL.halfDepth - 2; z += spacing) {
      if (Math.abs(z) > gateWidths.west / 2 + toothWidth || Math.abs(z) > gateWidths.east / 2 + toothWidth) {
        centers.push([-WALL.halfWidth, z]);
        centers.push([WALL.halfWidth, z]);
      }
    }
    const geometry = box(toothWidth, 1.55, WALL.thickness + 0.8);
    const teeth = new THREE.InstancedMesh(geometry, kit.materials.wallAlt, centers.length);
    const transform = new THREE.Object3D();
    centers.forEach(([x, z], index) => {
      transform.position.set(x, WALL.height + 0.64, z);
      transform.updateMatrix();
      teeth.setMatrixAt(index, transform.matrix);
    });
    teeth.instanceMatrix.needsUpdate = true;
    teeth.castShadow = true;
    teeth.receiveShadow = true;
    root.add(teeth);
  }

  function addOuterWalls() {
    const walls = [
      { start: [-WALL.halfWidth, -WALL.halfDepth], end: [WALL.halfWidth, -WALL.halfDepth], gateWidth: 34 },
      { start: [-WALL.halfWidth, WALL.halfDepth], end: [WALL.halfWidth, WALL.halfDepth], gateWidth: 26 },
      { start: [-WALL.halfWidth, -WALL.halfDepth], end: [-WALL.halfWidth, WALL.halfDepth], gateWidth: 22 },
      { start: [WALL.halfWidth, WALL.halfDepth], end: [WALL.halfWidth, -WALL.halfDepth], gateWidth: 22 }
    ];
    for (const spec of walls) {
      const wall = kit.makeWall({ ...spec, height: WALL.height, thickness: WALL.thickness });
      root.add(wall);
      colliders.push(...wall.userData.wallColliders);
    }
    addWallCrenellations();
  }

  function hippedRoofGeometry(width, depth, rise) {
    const x = width / 2;
    const z = depth / 2;
    const ridgeHalf = width * 0.2;
    const left = [-ridgeHalf, rise, 0];
    const right = [ridgeHalf, rise, 0];
    const frontLeft = [-x, 0, -z];
    const frontRight = [x, 0, -z];
    const backRight = [x, 0, z];
    const backLeft = [-x, 0, z];
    const faces = [
      frontLeft, frontRight, right, frontLeft, right, left,
      backRight, backLeft, left, backRight, left, right,
      frontRight, backRight, right,
      backLeft, frontLeft, left
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(), 3));
    geometry.computeVertexNormals();
    return ownGeometry(geometry);
  }

  function addGatehouse({ id, name, x, z, opening, alongX = true, description }) {
    const gateGroup = new THREE.Group();
    gateGroup.name = id;
    gateGroup.position.set(x, 0, z);
    if (!alongX) gateGroup.rotation.y = Math.PI / 2;
    const depth = 15;
    const pierSpacing = opening / 2 + 2.7;
    const pierWidth = 4.2;

    for (const side of [-1, 1]) {
      addBox(pierWidth + 1, 1.25, depth + 1.2, side * pierSpacing, 0.64, 0, kit.materials.marble, gateGroup, id);
      addBox(pierWidth, 9.4, depth, side * pierSpacing, 5.35, 0, kit.materials.wall, gateGroup, id);
      addBox(pierWidth + 0.5, 0.46, depth + 0.5, side * pierSpacing, 9.95, 0, kit.materials.gold, gateGroup, id);
      // A dark inset face frames the open passage without placing a door in it.
      addBox(0.34, 7.8, depth + 0.14, side * opening / 2, 5.45, 0, kit.materials.lacquer, gateGroup, id);
    }

    addBox(opening + 15, 1.4, depth + 3, 0, 10.65, 0, kit.materials.marble, gateGroup, id);
    addBox(opening + 12, 2.8, 1.2, 0, 12.75, -depth / 2 + 0.6, kit.materials.wall, gateGroup, id);
    addBox(opening + 12, 2.8, 1.2, 0, 12.75, depth / 2 - 0.6, kit.materials.wall, gateGroup, id);
    addBox(opening + 12, 0.38, 1.5, 0, 14.35, -depth / 2 + 0.6, kit.materials.gold, gateGroup, id);
    addBox(opening + 12, 0.38, 1.5, 0, 14.35, depth / 2 - 0.6, kit.materials.gold, gateGroup, id);
    const roofWidth = opening + 22;
    const roofDepth = depth + 8;
    const roof = mesh(hippedRoofGeometry(roofWidth, roofDepth, 5.1), kit.materials.roof, gateGroup, id);
    roof.position.y = 15.0;
    roof.material.side = THREE.DoubleSide;
    addBox(roofWidth * 0.43 + 1.2, 0.38, 0.65, 0, 20.25, 0, kit.materials.gold, gateGroup, id);

    root.add(gateGroup);
    buildings.push({
      id, name, category: 'gate', description, access: '门洞可穿行',
      x, z, size: alongX ? [roofWidth, roofDepth] : [roofDepth, roofWidth],
      visitable: false, group: gateGroup
    });
  }

  function addBridge({ id, x, z, length, width, alongX = false }) {
    const bridge = new THREE.Group();
    bridge.name = id;
    bridge.position.set(x, 0, z);
    if (alongX) bridge.rotation.y = Math.PI / 2;
    const span = length;
    addBox(width, 0.7, span, 0, 0.08, 0, kit.materials.marble, bridge);
    addBox(width - 2.4, 0.12, span - 2.2, 0, 0.5, 0, kit.materials.ground, bridge);
    const postGeometry = box(0.95, 1.45, 0.95);
    const postCount = Math.floor(span / 5) - 1;
    const posts = new THREE.InstancedMesh(postGeometry, kit.materials.marble, postCount * 2);
    const transform = new THREE.Object3D();
    for (const side of [-1, 1]) {
      addBox(0.72, 1.05, span, side * (width / 2 - 0.45), 1.05, 0, kit.materials.marble, bridge);
      for (let i = 1; i <= postCount; i++) {
        const localZ = -span / 2 + (span * i) / (postCount + 1);
        transform.position.set(side * (width / 2 - 0.45), 1.15, localZ);
        transform.updateMatrix();
        posts.setMatrixAt((side === -1 ? 0 : postCount) + i - 1, transform.matrix);
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    posts.receiveShadow = true;
    bridge.add(posts);
    // The raised deck meets both the palace grade and the lower outer bank.
    // Batch the two short slopes into one draw call for each bridge.
    const rampLength = 10;
    const deckTop = 0.56;
    const innerSign = id.endsWith('south') || id.endsWith('west') ? 1 : -1;
    const ramps = new THREE.InstancedMesh(box(1, 0.25, 1), kit.materials.marble, 2);
    [
      { sign: innerSign, landTop: -0.04 },
      { sign: -innerSign, landTop: -1.05 }
    ].forEach(({ sign, landTop }, index) => {
      const slope = (landTop - deckTop) / (sign * rampLength);
      transform.position.set(0, (deckTop + landTop) / 2 - 0.125,
        sign * (span / 2 + rampLength / 2));
      transform.rotation.x = -Math.atan(slope);
      transform.scale.set(width - 3.4, 1, rampLength);
      transform.updateMatrix();
      ramps.setMatrixAt(index, transform.matrix);
    });
    ramps.instanceMatrix.needsUpdate = true;
    ramps.receiveShadow = true;
    bridge.add(ramps);
    root.add(bridge);
  }

  function addOuterGateStructures() {
    addGatehouse({ id: 'garden-gate-south', name: '南城门 · 正南门', x: 0, z: -430, opening: 22, alongX: true, description: '南侧主城门，门洞与外桥贯通，接入前朝中轴。' });
    addGatehouse({ id: 'garden-gate-north', name: '北城门 · 御苑门', x: 0, z: 430, opening: 18, alongX: true, description: '北侧御苑城门，与御花园主轴相对。' });
    addGatehouse({ id: 'garden-gate-west', name: '西城门', x: -284, z: 0, opening: 16, alongX: false, description: '西侧城门，门洞与西向桥相连。' });
    addGatehouse({ id: 'garden-gate-east', name: '东城门', x: 284, z: 0, opening: 16, alongX: false, description: '东侧城门，门洞与东向桥相连。' });

    addBridge({ id: 'garden-bridge-south', x: 0, z: -449, length: 50, width: 22 });
    addBridge({ id: 'garden-bridge-north', x: 0, z: 449, length: 50, width: 20 });
    addBridge({ id: 'garden-bridge-west', x: -303, z: 0, length: 50, width: 18, alongX: true });
    addBridge({ id: 'garden-bridge-east', x: 303, z: 0, length: 50, width: 18, alongX: true });
  }

  function addCornerTowers() {
    const corners = [
      { suffix: 'sw', x: -266, z: -412, name: '西南角楼' },
      { suffix: 'se', x: 266, z: -412, name: '东南角楼' },
      { suffix: 'nw', x: -266, z: 412, name: '西北角楼' },
      { suffix: 'ne', x: 266, z: 412, name: '东北角楼' }
    ];
    for (const corner of corners) {
      const id = `garden-corner-${corner.suffix}`;
      kit.addBuilding({ root, buildings }, {
        id, name: corner.name, kind: 'cornerTower', x: corner.x, z: corner.z,
        width: 25, depth: 25, height: 29, tiers: 2, ornament: 2,
        access: '外观可览', description: '俯瞰宫城四隅的多层琉璃角楼。'
      });
    }
  }

  function addGardenGroundAndPaths() {
    const grassMaterial = kit.materials.foliage;
    // Two open garden lawns frame the central axis and leave a generous path to both gates.
    for (const side of [-1, 1]) {
      const lawn = addBox(174, 0.16, 94, side * 100, 0.035, 366, grassMaterial);
      lawn.castShadow = false;
      // The outer garden pockets carry the two small pavilions, separate from
      // the broad center lawns by a narrow, legible promenade.
      const pocket = addBox(44, 0.16, 94, side * 218, 0.035, 366, grassMaterial);
      pocket.castShadow = false;
      addBox(172, 0.12, 1.2, side * 100, 0.14, 318, kit.materials.marble);
      addBox(172, 0.12, 1.2, side * 100, 0.14, 414, kit.materials.marble);
    }

    const pathsByMaterial = new Map();
    function pathBetween(a, b, width = 9, material = kit.materials.marble) {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      if (!pathsByMaterial.has(material)) pathsByMaterial.set(material, []);
      pathsByMaterial.get(material).push({
        x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2,
        width, length: length + 1, rotation: Math.atan2(dx, dz)
      });
    }

    const gardenPath = [
      [0, 302], [0, 338], [-13, 347], [-21, 360], [-21, 379], [-10, 391], [0, 397], [0, 422]
    ];
    const eastPath = gardenPath.map(([x, z]) => [-x, z]);
    for (let i = 1; i < gardenPath.length; i++) {
      pathBetween(gardenPath[i - 1], gardenPath[i], 8.5);
      pathBetween(eastPath[i - 1], eastPath[i], 8.5);
    }
    // The south approach is a straight, legible continuation of the imperial axis.
    pathBetween([0, -430], [0, -398], 18, kit.materials.marble);
    pathBetween([0, 302], [0, 338], 12, kit.materials.marble);
    // Branch paths skirt both ponds instead of crossing the water.  They join
    // the central walk and terminate at the pair of garden pavilions.
    const branches = [
      [[-21, 338], [-80, 335], [-121, 329], [-168, 334], [-204, 351]],
      [[10, 391], [28, 400], [85, 413], [143, 412], [180, 405], [204, 391]]
    ];
    for (const branch of branches) {
      for (let i = 1; i < branch.length; i++) pathBetween(branch[i - 1], branch[i], 6);
    }
    addBox(48, 0.18, 34, 0, 0.13, 338, kit.materials.marble);

    const geometry = box(1, 0.17, 1);
    const transform = new THREE.Object3D();
    for (const [material, paths] of pathsByMaterial) {
      const batch = new THREE.InstancedMesh(geometry, material, paths.length);
      batch.name = 'garden-branching-walks';
      paths.forEach((path, i) => {
        transform.position.set(path.x, 0.12, path.z);
        transform.rotation.y = path.rotation;
        transform.scale.set(path.width, 1, path.length);
        transform.updateMatrix();
        batch.setMatrixAt(i, transform.matrix);
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.receiveShadow = true;
      root.add(batch);
    }

    courtyards.push({
      id: 'garden-courtyard-imperial', name: '御花园',
      bounds: [-246, 246, 302, 422], center: [0, 362]
    });
  }

  function addPondsAndRockery() {
    const pondGeometry = ownGeometry(new THREE.CircleGeometry(1, 32));
    const rockGeometry = ownGeometry(new THREE.DodecahedronGeometry(1, 0));
    const rockTransforms = new Map([
      [kit.materials.marble, []], [kit.materials.dark, []]
    ]);
    const addRock = (material, x, y, z, sx, sy, sz) => {
      rockTransforms.get(material).push({ x, y, z, sx, sy, sz });
    };
    const ponds = [
      { x: -142, z: 354, rx: 20, rz: 12 },
      { x: 142, z: 385, rx: 18, rz: 11 }
    ];
    for (const pond of ponds) {
      const water = mesh(pondGeometry, kit.materials.water);
      water.rotation.x = -Math.PI / 2;
      // The pond surface must sit above the lawn top (+0.115), otherwise the
      // grass box fully hides it in the overview.
      water.position.set(pond.x, 0.145, pond.z);
      water.scale.set(pond.rx, pond.rz, 1);
      water.castShadow = false;
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        addRock(i % 3 ? kit.materials.marble : kit.materials.dark,
          pond.x + Math.cos(angle) * (pond.rx + 1.8), 0.5,
          pond.z + Math.sin(angle) * (pond.rz + 1.8),
          1.2 + (i % 3) * 0.28, 0.55 + (i % 2) * 0.22, 0.9);
      }
    }

    const rockClusters = [
      { x: -68, z: 389 }, { x: 74, z: 340 }, { x: 196, z: 366 }, { x: -190, z: 394 }
    ];
    rockClusters.forEach((cluster, clusterIndex) => {
      for (let i = 0; i < 5; i++) {
        addRock(i % 2 ? kit.materials.dark : kit.materials.marble,
          cluster.x + (i - 2) * 3.2, 1.4 + (i % 2) * 0.5,
          cluster.z + Math.sin(i * 1.7 + clusterIndex) * 3.3,
          2.7 + (i % 3) * 0.75, 3.1 + (i % 2), 2.2 + (i % 2) * 0.65);
      }
    });
    const transform = new THREE.Object3D();
    for (const [material, rocks] of rockTransforms) {
      const batch = new THREE.InstancedMesh(rockGeometry, material, rocks.length);
      batch.name = 'garden-pond-stones-and-rockery';
      rocks.forEach(({ x, y, z, sx, sy, sz }, i) => {
        transform.position.set(x, y, z);
        transform.scale.set(sx, sy, sz);
        transform.updateMatrix();
        batch.setMatrixAt(i, transform.matrix);
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.castShadow = true;
      batch.receiveShadow = true;
      root.add(batch);
    }
  }

  function addGardenBuildingsAndTrees() {
    const pavilions = [
      { id: 'garden-pavilion-central', name: '御花园 · 中央亭', x: 0, z: 369, width: 24, depth: 20, height: 12, ornament: 2 },
      { id: 'garden-pavilion-west', name: '西苑观景亭', x: -204, z: 351, width: 18, depth: 16, height: 9, ornament: 1 },
      { id: 'garden-pavilion-east', name: '东苑临水亭', x: 204, z: 391, width: 18, depth: 16, height: 9, ornament: 1 }
    ];
    for (const pavilion of pavilions) {
      kit.addBuilding({ root, buildings }, {
        ...pavilion, kind: 'pavilion', tiers: 1, openFront: true, access: '外观可览',
        description: '御苑游赏与休憩的亭阁，采用统一的金瓦、朱柱和白石台基。'
      });
    }

    const trees = [
      [-228, 326, 1.15, 'pine'], [-184, 330, 0.9, 'broadleaf'], [-142, 329, 0.8, 'pine'],
      [-58, 321, 1.05, 'pine'], [58, 321, 1.05, 'pine'], [142, 329, 0.85, 'broadleaf'], [184, 330, 0.95, 'pine'], [228, 326, 1.1, 'pine'],
      [-224, 365, 0.95, 'broadleaf'], [-178, 375, 1.05, 'pine'], [-120, 393, 0.9, 'broadleaf'], [-85, 359, 0.9, 'pine'],
      [-50, 407, 0.88, 'broadleaf'], [50, 407, 0.88, 'broadleaf'], [88, 355, 0.95, 'pine'], [120, 402, 0.9, 'pine'],
      [178, 373, 1.02, 'pine'], [224, 365, 0.96, 'broadleaf'], [-226, 405, 0.78, 'pine'], [226, 405, 0.8, 'pine']
    ];
    for (const [x, z, scale, kind] of trees) root.add(kit.makeTree({ x, z, scale, kind }));

    for (const z of [315, 411]) {
      for (const x of [-32, 32]) root.add(kit.makeLamp({ x, z }));
    }
  }

  addOuterGround();
  addMoat();
  addOuterWalls();
  addOuterGateStructures();
  addCornerTowers();
  addGardenGroundAndPaths();
  addPondsAndRockery();
  addGardenBuildingsAndTrees();

  const connectorIds = ['gate-south', 'gate-north', 'gate-west', 'gate-east'];
  const connectors = connectorIds.map((id) => {
    const connector = Object.values(CONNECTORS).find((item) => item.id === id);
    if (!connector) throw new Error(`Missing frozen layout connector: ${id}`);
    return { id: connector.id, position: [...connector.position], width: connector.width, targetZone: connector.targetZone };
  });

  return {
    root,
    buildings,
    courtyards,
    connectors,
    colliders,
    update() {},
    dispose() {
      root.clear();
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.clear();
    }
  };
}
