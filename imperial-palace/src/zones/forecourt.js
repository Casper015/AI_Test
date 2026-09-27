/**
 * B · 中轴前朝
 *
 * Geometry is authored in world metres.  The southern city gate, the inner
 * palace gate at axial-inner, and the outer palace wall are owned by F/C.
 * This zone builds the ceremonial approach, court gates, halls and terraces.
 */
export function createZone(ctx) {
  const { THREE, kit, layout, zoneKey = 'forecourt' } = ctx;
  if (!THREE || !kit || !layout) {
    throw new Error('forecourt.createZone requires THREE, kit and layout');
  }

  const zone = {
    root: new THREE.Group(),
    buildings: [],
    courtyards: [],
    connectors: [],
    colliders: []
  };
  zone.root.name = 'forecourt-zone';
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const mats = kit.materials;
  const sharedMaterials = new Set(Object.values(mats));

  const ownGeometry = (geometry) => {
    ownedGeometries.add(geometry);
    return geometry;
  };

  function addBox(parent, x, y, z, width, height, depth, material, name = '') {
    const geometry = ownGeometry(new THREE.BoxGeometry(width, height, depth));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  }

  function addBuilding(spec, entrance = {}) {
    const built = kit.addBuilding(zone, spec);
    const record = zone.buildings[zone.buildings.length - 1];
    const frontZ = spec.z - spec.depth / 2 - 0.24;
    const width = entrance.width ?? Math.min(spec.width * 0.38, 10);
    record.bounds = {
      minX: spec.x - spec.width / 2,
      maxX: spec.x + spec.width / 2,
      minZ: spec.z - spec.depth / 2,
      maxZ: spec.z + spec.depth / 2
    };
    record.entrance = {
      position: entrance.position ?? [spec.x, 0, frontZ],
      direction: entrance.direction ?? [0, 0, -1],
      width
    };
    record.info = spec.description;
    return built;
  }

  function addPavedCourt({ id, name, x0, x1, z0, z1, paving = mats.ground }) {
    const width = x1 - x0;
    const depth = z1 - z0;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    addBox(zone.root, x, 0.02, z, width, 0.24, depth, paving, `${id}-paving`);
    zone.courtyards.push({ id, name, bounds: [x0, x1, z0, z1], center: [x, z] });
  }

  function addWall(start, end, { height = 5.2, thickness = 2.1, gateWidth = 0 } = {}) {
    zone.root.add(kit.makeWall({ start, end, height, thickness, gateWidth }));
  }

  function addAxisGateWall(z, halfWidth, gateWidth, height = 5.2) {
    addWall([-halfWidth, z], [halfWidth, z], { height, gateWidth });
  }

  function addSideWallWithConnector(x, zMin, zMax, gateZ, gateWidth = 16) {
    const half = gateWidth / 2;
    addWall([x, zMin], [x, gateZ - half]);
    addWall([x, gateZ + half], [x, zMax]);
  }

  function addAxisStripe(z0, z1, width, material, y = 0.17, name = 'axial-stone') {
    addBox(zone.root, 0, y, (z0 + z1) / 2, width, 0.08, z1 - z0, material, name);
  }

  function addSidePassageArch(x, z, label) {
    const dir = x < 0 ? -1 : 1;
    const frameX = x;
    const postZs = [z - 7.5, z + 7.5];
    for (const postZ of postZs) {
      addBox(zone.root, frameX, 3.35, postZ, 2.5, 6.7, 1.35, mats.lacquer, `${label}-post`);
      addBox(zone.root, frameX, 3.4, postZ, 2.8, 0.44, 1.65, mats.gold, `${label}-post-cap`);
    }
    addBox(zone.root, frameX, 6.35, z, 2.7, 0.82, 16.7, mats.lacquer, `${label}-lintel`);
    addBox(zone.root, frameX, 6.92, z, 3.4, 0.34, 18.4, mats.roof, `${label}-eave`);
    addBox(zone.root, frameX, 7.52, z, 2.5, 0.78, 15.2, mats.roofDark, `${label}-crown`);
    // A short jade inset differentiates the side arch from the red court walls.
    addBox(zone.root, frameX + dir * 0.05, 5.55, z, 2.72, 0.34, 13.8, mats.jade, `${label}-painted-beam`);
  }

  function addLamp(x, z) {
    const lamp = kit.makeLamp({ x, z });
    lamp.traverse((node) => {
      if (!node.isMesh) return;
      if (node.geometry) ownedGeometries.add(node.geometry);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (material && !sharedMaterials.has(material)) ownedMaterials.add(material);
      });
    });
    zone.root.add(lamp);
  }

  function addTree(x, z, scale = 1.5, kind = 'pine') {
    const tree = kit.makeTree({ x, z, scale, kind });
    tree.traverse((node) => {
      if (node.isMesh && node.geometry) ownedGeometries.add(node.geometry);
    });
    zone.root.add(tree);
  }

  function addMainTerrace() {
    const z = -71;
    // Three broad white-stone courses step inward beneath the hall's own plinth.
    const tiers = [
      { width: 110, depth: 78, height: 1.35, y: 0.675 },
      { width: 100, depth: 68, height: 1.3, y: 1.975 },
      { width: 90, depth: 58, height: 1.3, y: 3.275 }
    ];
    tiers.forEach((tier, index) => {
      addBox(zone.root, 0, tier.y, z, tier.width, tier.height, tier.depth, mats.marble, `taihe-terrace-tier-${index + 1}`);
      const edgeY = tier.y + tier.height / 2 + 0.16;
      addBox(zone.root, 0, edgeY, z - tier.depth / 2, tier.width, 0.22, 0.72, mats.gold, `taihe-terrace-front-line-${index + 1}`);
      addBox(zone.root, 0, edgeY, z + tier.depth / 2, tier.width, 0.22, 0.72, mats.gold, `taihe-terrace-rear-line-${index + 1}`);
    });

    // The broad ceremonial stair rises from the axial court to the upper course.
    const count = 8;
    const tread = 3.45;
    const rise = 0.48;
    const stairStartZ = z - 65;
    for (let i = 0; i < count; i += 1) {
      const height = rise * (i + 1);
      addBox(zone.root, 0, height / 2, stairStartZ + tread * (i + 0.5), 23, height, tread + 0.16, mats.marble, `danbi-step-${i + 1}`);
      // Both side flights are usable; the centre flight remains the ceremonial axis.
      for (const side of [-1, 1]) {
        addBox(zone.root, side * 32, height / 2, stairStartZ + tread * (i + 0.5),
          10.5, height, tread + 0.16, mats.marble, `taihe-side-step-${side}-${i + 1}`);
      }
    }

    // The central carved-stone route overlays the broad stair as one gentle ramp.
    const rampLength = 29.2;
    const rampAngle = -Math.atan((rise * count) / rampLength);
    const ramp = new THREE.Mesh(
      ownGeometry(new THREE.BoxGeometry(6.2, 0.18, rampLength)),
      mats.marble
    );
    ramp.position.set(0, rise * count / 2 + 0.05, stairStartZ + rampLength / 2 + 0.4);
    ramp.rotation.x = rampAngle;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    ramp.name = 'central-danbi-relief';
    zone.root.add(ramp);
    for (const side of [-1, 1]) {
      addBox(zone.root, side * 3.55, rise * count / 2 + 0.08, stairStartZ + rampLength / 2 + 0.4, 0.42, 0.2, rampLength, mats.gold, `danbi-gilt-edge-${side}`)
        .rotation.x = rampAngle;
    }

    // Stone balustrades around the elevated side edges; instancing keeps the kit light.
    const postPositions = [];
    const addRow = (x0, x1, z0, z1, step, fixed, alongX) => {
      const length = alongX ? x1 - x0 : z1 - z0;
      const n = Math.max(2, Math.floor(length / step));
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        postPositions.push(alongX
          ? [x0 + (x1 - x0) * t, 4.2, fixed]
          : [fixed, 4.2, z0 + (z1 - z0) * t]);
      }
    };
    for (const [left, right] of [[-45, -38], [-26, -12.5], [12.5, 26], [38, 45]]) {
      addRow(left, right, -100, -42, 6.5, -100, true);
    }
    addRow(-45, 45, -100, -42, 7, -42, true);
    addRow(-45, 45, -100, -42, 7, -45, false);
    addRow(-45, 45, -100, -42, 7, 45, false);
    const postGeometry = ownGeometry(new THREE.BoxGeometry(0.62, 1.65, 0.62));
    const posts = new THREE.InstancedMesh(postGeometry, mats.marble, postPositions.length);
    const temp = new THREE.Object3D();
    postPositions.forEach(([x, y, zPos], i) => {
      temp.position.set(x, y, zPos);
      temp.updateMatrix();
      posts.setMatrixAt(i, temp.matrix);
    });
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    posts.receiveShadow = true;
    posts.name = 'taihe-terrace-balusters';
    zone.root.add(posts);
    // A full-width rail previously blocked the only approach to the hall.
    for (const [left, right] of [[-45, -38], [-26, -12.5], [12.5, 26], [38, 45]]) {
      addBox(zone.root, (left + right) / 2, 5.18, -100, right - left, 0.42, 0.62,
        mats.marble, `taihe-terrace-south-rail-${left}`);
    }
    addBox(zone.root, 0, 5.18, -42, 90, 0.42, 0.62, mats.marble, 'taihe-terrace-north-rail');
    addBox(zone.root, -45, 5.18, -71, 0.62, 0.42, 58, mats.marble, 'taihe-terrace-west-rail');
    addBox(zone.root, 45, 5.18, -71, 0.62, 0.42, 58, mats.marble, 'taihe-terrace-east-rail');
  }

  function addTaiheInterior(built, spec) {
    const { group, record } = built;
    const floorY = Math.max(1.25, spec.height * 0.14);
    const bodyH = spec.height - floorY - Math.max(2.8, spec.height * 0.35);
    const roofBaseY = floorY + bodyH + 0.45;
    const detail = (name, x, y, z, w, h, d, material) => {
      const mesh = addBox(group, x, y, z, w, h, d, material, name);
      mesh.userData.buildingId = record.id;
      return mesh;
    };
    const instanced = (name, geometry, material, locations) => {
      const mesh = new THREE.InstancedMesh(ownGeometry(geometry), material, locations.length);
      const dummy = new THREE.Object3D();
      locations.forEach(([x, y, z], index) => {
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.buildingId = record.id;
      group.add(mesh);
    };

    // The black-brick floor remains level with the kit's open-front floor.
    // A clear central aisle runs from the south opening up to the throne dais.
    detail('gold-brick-floor', 0, floorY + 0.4, 0, 74, 0.1, 38, mats.dark);
    instanced('gold-brick-joints', new THREE.BoxGeometry(0.07, 0.025, 36), mats.lacquer,
      Array.from({ length: 17 }, (_, i) => [-34 + i * 4, floorY + 0.465, 0]));
    detail('central-carpet-edge-west', -4.9, floorY + 0.475, -8, 0.2, 0.045, 21, mats.gold);
    detail('central-carpet-edge-east', 4.9, floorY + 0.475, -8, 0.2, 0.045, 21, mats.gold);

    const columns = [];
    for (const x of [-27, -13, 13, 27]) {
      for (const z of [-11, 10.5]) columns.push([x, floorY + 8.25, z]);
    }
    instanced('taihe-vermilion-pillars',
      new THREE.CylinderGeometry(0.9, 1.05, 15.8, 12), mats.wall, columns);
    instanced('taihe-gilt-column-bases',
      new THREE.CylinderGeometry(1.27, 1.33, 0.45, 12), mats.gold,
      columns.map(([x, , z]) => [x, floorY + 0.58, z]));
    instanced('taihe-jade-column-capitals',
      new THREE.CylinderGeometry(1.46, 1.06, 0.85, 12), mats.jade,
      columns.map(([x, , z]) => [x, floorY + 16.25, z]));

    // Four inner pillars carry restrained golden winding-dragon relief.
    const coilPoints = [];
    for (let i = 0; i <= 84; i++) {
      const t = i / 84;
      const angle = t * Math.PI * 8;
      coilPoints.push(new THREE.Vector3(Math.cos(angle) * 0.99, t * 9, Math.sin(angle) * 0.99));
    }
    const coilGeometry = ownGeometry(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(coilPoints), 84, 0.11, 5, false
    ));
    for (const x of [-13, 13]) {
      for (const z of [-11, 10.5]) {
        const coil = new THREE.Mesh(coilGeometry, mats.gold);
        coil.name = 'taihe-coiling-dragon-pillar-relief';
        coil.position.set(x, floorY + 3.4, z);
        coil.userData.buildingId = record.id;
        group.add(coil);
      }
    }

    // Layered coffer ceiling reads from the open front without sealing the hall.
    detail('taihe-painted-ceiling', 0, roofBaseY - 1.5, 0, 65, 0.32, 31, mats.jade);
    detail('taihe-coffer-outer', 0, roofBaseY - 1.17, 3.2, 30, 0.36, 24, mats.lacquer);
    detail('taihe-coffer-gold-frame', 0, roofBaseY - 0.93, 3.2, 24, 0.34, 19, mats.gold);
    detail('taihe-coffer-inner', 0, roofBaseY - 0.67, 3.2, 18, 0.34, 14, mats.jade);
    detail('taihe-coffer-centre', 0, roofBaseY - 0.44, 3.2, 8, 0.3, 7, mats.gold);

    // A carved throne screen and paired incense stands frame the kit's throne;
    // every prop is away from the entrance and the central approach aisle.
    detail('taihe-throne-platform', 0, floorY + 0.88, 8.7, 14, 0.7, 9, mats.marble);
    detail('taihe-throne-screen', 0, floorY + 5.1, 15.5, 22, 8.7, 0.5, mats.lacquer);
    for (const x of [-9.5, -7.5, -5.5, -3.5, -1.5, 1.5, 3.5, 5.5, 7.5, 9.5]) {
      detail('taihe-screen-gilt-lattice', x, floorY + 5.1, 15.19, 0.24, 7, 0.13, mats.gold);
    }
    detail('taihe-screen-crown', 0, floorY + 9.75, 15.25, 24, 0.45, 1, mats.gold);
    for (const x of [-16.5, 16.5]) {
      detail('taihe-incense-plinth', x, floorY + 0.93, 4, 3.2, 1, 3.2, mats.marble);
      detail('taihe-incense-vessel', x, floorY + 2.1, 4, 2.2, 1.5, 2.2, mats.gold);
      detail('taihe-incense-finial', x, floorY + 3.1, 4, 1, 0.5, 1, mats.roofDark);
    }
    record.interiorView = { position: [0, floorY + 1.75, spec.z - 13], target: [0, floorY + 3.5, spec.z + 8] };
  }

  // Main axis courtyards. Openings line up on the north-south route; the side walls
  // are interrupted at the two south-wing links into the west/east palace zones.
  addPavedCourt({ id: 'forecourt-approach-court', name: '南门内仪仗前庭', x0: -90, x1: 90, z0: -392, z1: -322 });
  addPavedCourt({ id: 'forecourt-gate-court', name: '前朝门庭院', x0: -90, x1: 90, z0: -322, z1: -250 });
  addPavedCourt({ id: 'forecourt-processional-court', name: '礼仪广场南院', x0: -96, x1: 96, z0: -250, z1: -136 });
  addPavedCourt({ id: 'forecourt-throne-court', name: '太和殿礼仪大院', x0: -96, x1: 96, z0: -136, z1: 80 });

  // Cross walls leave a centered portal on the imperial route.
  addAxisGateWall(-392, 90, 36, 4.7);
  addAxisGateWall(-322, 90, 34, 5.2);
  addAxisGateWall(-250, 96, 36, 5.5);
  addAxisGateWall(-136, 96, 38, 5.2);
  // Long side boundaries are enclosed except where the southern east/west links pass.
  for (const x of [-90, 90]) addWall([x, -392], [x, -250], { height: 5.2 });
  addWall([-96, -250], [-90, -250], { height: 5.2 });
  addWall([90, -250], [96, -250], { height: 5.2 });
  addSideWallWithConnector(-96, -250, 80, -180, 17);
  addSideWallWithConnector(96, -250, 80, -180, 17);
  addSidePassageArch(-96, -180, 'west-south-portal');
  addSidePassageArch(96, -180, 'east-south-portal');
  for (const side of [-1, 1]) {
    addBox(zone.root, side * 94, 0.13, -180, 20, 0.12, 16, mats.marble, `side-connector-paving-${side}`);
  }

  // A pale stone ceremonial axis remains continuous from the southern connector
  // through the inner boundary; its narrower center stripe echoes the reference map.
  addAxisStripe(-398, 83, 28, mats.marble, 0.17, 'forecourt-white-marble-axis');
  addAxisStripe(-398, 83, 11, mats.ground, 0.23, 'forecourt-inner-processional-strip');
  for (const x of [-30, 30]) {
    addBox(zone.root, x, 0.18, -157.5, 0.65, 0.09, 481, mats.warmGold, `processional-gilt-line-${x}`);
  }

  // Four compact walled service yards use the shared courtyard factory and give
  // the broad axial courts real side-room scale and detail.
  const satelliteCourts = [
    { id: 'forecourt-west-guard-yard', name: '西仪仗院', x: -66, z: -356, hallId: 'forecourt-west-guard-hall', hallName: '西仪仗值房' },
    { id: 'forecourt-east-guard-yard', name: '东仪仗院', x: 66, z: -356, hallId: 'forecourt-east-guard-hall', hallName: '东仪仗值房' },
    { id: 'forecourt-west-attendant-yard', name: '西前朝侍从院', x: -66, z: -286, hallId: 'forecourt-west-attendant-hall', hallName: '西前朝侍从殿' },
    { id: 'forecourt-east-attendant-yard', name: '东前朝侍从院', x: 66, z: -286, hallId: 'forecourt-east-attendant-hall', hallName: '东前朝侍从殿' }
  ];
  for (const court of satelliteCourts) {
    kit.makeCourtyard(zone, {
      id: court.id,
      name: court.name,
      x: court.x,
      z: court.z,
      width: 27,
      depth: 30,
      gate: 10,
      wallHeight: 3.6
    });
    addBuilding({
      id: court.hallId,
      name: court.hallName,
      kind: 'side',
      x: court.x,
      z: court.z,
      width: 16,
      depth: 12,
      height: 10,
      ornament: 1,
      roofType: '歇山顶',
      description: `${court.name}中的小型值守殿，尺度与主轴宫殿区分，入口朝南。`
    });
  }

  // The first threshold is intentionally an open pair of gate wings: F owns the
  // actual southern city gate, while B begins at forecourt-south.
  for (const side of [-1, 1]) {
    addBuilding({
      id: `forecourt-south-threshold-${side < 0 ? 'west' : 'east'}`,
      name: side < 0 ? '南仪门西阙楼' : '南仪门东阙楼',
      kind: 'gate',
      x: side * 13,
      z: -322,
      width: 12,
      depth: 14,
      height: 20,
      tiers: 1,
      ornament: 2,
      description: '前朝南端的成对阙楼，围出中轴通门而不占用南城门本体。'
    }, { position: [side * 13, 0, -329.4], width: 12 });
  }

  // Bell and drum towers anchor the flanks between the two formal thresholds.
  addBuilding({
    id: 'forecourt-west-bell-tower', name: '西钟楼', kind: 'pavilion',
    x: -81, z: -310, width: 13, depth: 13, height: 15, tiers: 2, ornament: 2,
    description: '前朝西侧钟楼，与东侧鼓楼构成成对的礼仪报时建筑。'
  });
  addBuilding({
    id: 'forecourt-east-drum-tower', name: '东鼓楼', kind: 'pavilion',
    x: 81, z: -310, width: 13, depth: 13, height: 15, tiers: 2, ornament: 2,
    description: '前朝东侧鼓楼，与西侧钟楼构成成对的礼仪报时建筑。'
  });

  // Taihe Gate, the principal front-court gate, frames the first broad ritual court.
  for (const side of [-1, 1]) {
    addBuilding({
      id: `forecourt-taihe-gate-${side < 0 ? 'west' : 'east'}`,
      name: side < 0 ? '太和门西阙殿' : '太和门东阙殿',
      kind: 'gate',
      x: side * 14,
      z: -250,
      width: 14,
      depth: 16,
      height: 23,
      tiers: 1,
      ornament: 2,
      description: '太和门中轴门户两侧的阙殿，金瓦门楼为主殿礼仪轴线作前导。'
    }, { position: [side * 14, 0, -258.4], width: 14 });
  }

  // Side courts and covered galleries form a wall-like edge around the plaza.
  for (const side of [-1, 1]) {
    const west = side < 0;
    addBuilding({
      id: `forecourt-processional-${west ? 'west' : 'east'}-hall`,
      name: west ? '西朝仪配殿' : '东朝仪配殿',
      kind: 'side',
      x: side * 66,
      z: -194,
      width: 28,
      depth: 19,
      height: 14,
      ornament: 1,
      description: '礼仪广场侧翼配殿，与太和殿相望并收束广场边界。'
    });
  }

  // Galleries run north-south along the broad court walls in a consistent red,
  // jade and gold vocabulary. Each run is one reusable instanced assembly.
  function addGallery(x, z0, z1, bays = 9) {
    const group = new THREE.Group();
    group.name = `forecourt-gallery-${x}`;
    const postGeo = ownGeometry(new THREE.BoxGeometry(0.55, 5.4, 0.55));
    const posts = new THREE.InstancedMesh(postGeo, mats.wall, (bays + 1) * 2);
    const obj = new THREE.Object3D();
    const span = z1 - z0;
    let instance = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let i = 0; i <= bays; i += 1) {
        obj.position.set(x + (row ? 4.4 : -4.4), 2.7, z0 + span * i / bays);
        obj.updateMatrix();
        posts.setMatrixAt(instance++, obj.matrix);
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    posts.receiveShadow = true;
    group.add(posts);
    for (const row of [-4.4, 4.4]) {
      addBox(group, x + row, 5.5, (z0 + z1) / 2, 0.9, 0.56, span + 1.4, mats.lacquer, 'gallery-beam');
    }
    addBox(group, x, 8.1, (z0 + z1) / 2, 11.6, 0.5, span + 2.6, mats.roofDark, 'gallery-eave');
    addBox(group, x, 8.65, (z0 + z1) / 2, 9.4, 0.52, span + 1.5, mats.roof, 'gallery-roof');
    zone.root.add(group);
  }
  addGallery(-90, -222, -190, 5);
  addGallery(90, -222, -190, 5);
  addGallery(-90, -170, -145, 3);
  addGallery(90, -170, -145, 3);
  addGallery(-90, -126, -42, 9);
  addGallery(90, -126, -42, 9);

  // The main hall is deliberately dominant in footprint, height and roof rank.
  addMainTerrace();
  const taiheSpec = {
    id: 'forecourt-taihe-hall',
    name: '太和殿 · 金銮正殿',
    kind: 'main',
    x: 0,
    z: -71,
    width: 76,
    depth: 40,
    height: 36,
    tiers: 2,
    openFront: true,
    ornament: 3,
    roofType: '重檐庑殿顶',
    access: '可入内（金銮殿内景）',
    description: '前朝中轴最高等级的重檐主殿，立于三层白石台基与丹陛御道尽端。'
  };
  const taiheBuilt = addBuilding(taiheSpec, { position: [0, 5.04, -91.24], width: 14 });
  addTaiheInterior(taiheBuilt, taiheSpec);

  for (const side of [-1, 1]) {
    addBuilding({
      id: `forecourt-taihe-${side < 0 ? 'west' : 'east'}-side-hall`,
      name: side < 0 ? '太和殿西配殿' : '太和殿东配殿',
      kind: 'side',
      x: side * 64,
      z: -72,
      width: 26,
      depth: 20,
      height: 14,
      ornament: 1,
      description: '主殿院内的对称配殿，低于主殿屋檐并与左右廊庑相连。'
    });
  }

  // Two smaller axial halls lead north toward, but do not duplicate, the inner gate.
  addBuilding({
    id: 'forecourt-zhonghe-hall', name: '中和殿', kind: 'hall',
    x: 0, z: 9, width: 28, depth: 22, height: 18, tiers: 1, ornament: 2,
    description: '主殿以北的较小轴线殿堂，用尺度递减引向后续内廷。'
  });
  for (const side of [-1, 1]) {
    addBuilding({
      id: `forecourt-zhonghe-${side < 0 ? 'west' : 'east'}-pavilion`,
      name: side < 0 ? '中和殿西侧阁' : '中和殿东侧阁',
      kind: 'pavilion',
      x: side * 39,
      z: 9,
      width: 17,
      depth: 14,
      height: 10,
      ornament: 1,
      description: '内庭前院左右的小型侧阁，屋顶、彩画和构件尺度遵循共享基线。'
    });
  }
  addBuilding({
    id: 'forecourt-baohe-hall', name: '保和殿', kind: 'hall',
    x: 0, z: 53, width: 38, depth: 20, height: 20, tiers: 1, ornament: 2,
    description: '前朝最北端的次级大殿，接近内廷连接点但不越过区域边界。'
  });

  // Lamps and pines are sparse accents, leaving the broad courts visible from above.
  for (const z of [-374, -338, -300, -268, -224, -156, -118, -24, 30]) {
    addLamp(-42, z);
    addLamp(42, z);
  }
  for (const side of [-1, 1]) {
    addTree(side * 84, -235, 1.9, 'round');
    addTree(side * 84, -128, 1.6, 'pine');
    addTree(side * 84, 20, 1.8, 'round');
  }

  const connectorKeys = ['forecourtSouth', 'westSouth', 'eastSouth'];
  for (const key of connectorKeys) {
    const link = layout.CONNECTORS?.[key];
    if (!link) continue;
    zone.connectors.push({
      id: link.id,
      position: [...link.position],
      width: link.width,
      targetZone: link.targetZone
    });
  }

  return {
    ...zone,
    update(_dtSeconds, _elapsedSeconds, _state) {},
    dispose() {
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.clear();
      for (const material of ownedMaterials) material.dispose();
      ownedMaterials.clear();
      zone.root.clear();
    }
  };
}
