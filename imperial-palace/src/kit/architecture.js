import * as THREE from 'three';

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const pillarGeometry = new THREE.CylinderGeometry(0.42, 0.56, 1, 10, 1);
const roofGeometry = makeRoofGeometry();
const leafGeometry = new THREE.SphereGeometry(0.5, 9, 7);
const rockGeometry = new THREE.DodecahedronGeometry(0.5, 0);
const sphereGeometry = new THREE.SphereGeometry(0.5, 10, 8);
const cylinderSmallGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
const dummy = new THREE.Object3D();

function makeRoofGeometry() {
  const positions = [];
  const v = (x, y, z) => [x, y, z];
  const addQuad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const addTri = (a, b, c) => positions.push(...a, ...b, ...c);
  const leftFront = v(-0.5, 0.04, -0.5);
  const rightFront = v(0.5, 0.04, -0.5);
  const rightBack = v(0.5, 0.04, 0.5);
  const leftBack = v(-0.5, 0.04, 0.5);
  const ridgeLeft = v(-0.29, 1, 0);
  const ridgeRight = v(0.29, 1, 0);
  addQuad(leftFront, rightFront, ridgeRight, ridgeLeft);
  addQuad(rightBack, leftBack, ridgeLeft, ridgeRight);
  addTri(leftFront, ridgeLeft, leftBack);
  addTri(ridgeRight, rightFront, rightBack);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createArchitectureKit(root, palette) {
  const materials = new Map();
  const batches = new Map();
  const pickableMeshes = [];
  const roofInstances = new Map();
  const namedGroups = new Map();

  const mat = (key, color, roughness = 0.82, extra = {}) => {
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, ...extra }));
    }
    return materials.get(key);
  };
  const m = {
    stone: mat('stone', palette.stone),
    paving: mat('paving', 0x77756f),
    pavingLight: mat('paving-light', 0x9a968b),
    red: mat('red', palette.red, 0.79),
    redAlt: mat('red-alt', 0xa23b30, 0.78),
    deepRed: mat('deep-red', 0x681f1b, 0.8),
    jade: mat('jade', palette.jade, 0.68),
    roof: mat('roof', palette.roof, 0.36, { metalness: 0.16, side: THREE.DoubleSide }),
    roofLight: mat('roof-light', 0xefbd4c, 0.34, { metalness: 0.18, side: THREE.DoubleSide }),
    gold: mat('gold', palette.gold, 0.28, { metalness: 0.64 }),
    wood: mat('wood', 0x503329, 0.78),
    dark: mat('dark', 0x292621, 0.92),
    garden: mat('garden', 0x3d5942, 0.95),
    gardenLight: mat('garden-light', 0x526649, 0.92),
    flower: mat('flower', 0xb77d78, 0.76),
    lantern: mat('lantern', 0xffbf66, 0.33, { emissive: 0xff8a32, emissiveIntensity: 0.75 }),
  };

  function batchFor(geometry, material, key) {
    const batchKey = key || `${geometry.uuid}:${material.uuid}`;
    if (!batches.has(batchKey)) batches.set(batchKey, { geometry, material, records: [] });
    return batches.get(batchKey);
  }

  function instance(geometry, material, position, scale, rotation = null, building = null, part = '') {
    const batch = batchFor(geometry, material);
    dummy.position.set(position[0], position[1], position[2]);
    dummy.scale.set(scale[0], scale[1], scale[2]);
    dummy.rotation.set(rotation?.[0] || 0, rotation?.[1] || 0, rotation?.[2] || 0);
    dummy.updateMatrix();
    const record = { matrix: dummy.matrix.clone(), building, part };
    batch.records.push(record);
    if (part === 'roof' && building) {
      if (!roofInstances.has(building.id)) roofInstances.set(building.id, []);
      roofInstances.get(building.id).push(record);
    }
    return record;
  }

  function addBox(position, scale, material, building = null, part = '', rotation = null) {
    return instance(boxGeometry, material, position, scale, rotation, building, part);
  }

  function addPillar(position, height, radius, material, building = null) {
    return instance(pillarGeometry, material, position, [radius * 2, height, radius * 2], null, building, 'column');
  }

  function beam(position, length, thickness, material, axis, building = null, part = 'beam') {
    const scale = axis === 'x' ? [length, thickness, thickness] : [thickness, thickness, length];
    return addBox(position, scale, material, building, part);
  }

  function addRoof(building, centerY, width, depth, rise, material = m.roof, double = false) {
    const scale = [width + 6, rise, depth + 6];
    const main = instance(roofGeometry, material, [building.x, centerY, building.z], scale, null, building, 'roof');
    if (double) {
      const upper = instance(roofGeometry, m.roofLight, [building.x, centerY + rise * 0.53, building.z], [scale[0] * 0.76, rise * 0.53, scale[2] * 0.76], null, building, 'roof');
      upper.isUpperTier = true;
    }
    const ridgeY = centerY + rise + 1.0;
    beam([building.x, ridgeY, building.z], width * (building.kind === 'pavilion' ? 0.28 : 0.52), 0.65, m.gold, 'x', building, 'roof');
    instance(sphereGeometry, m.gold, [building.x, ridgeY + 0.55, building.z], [1.15, 1.15, 1.15], null, building, 'roof');
    for (const sign of [-1, 1]) {
      instance(sphereGeometry, m.gold, [building.x + sign * (width * 0.29), centerY + rise * 0.78, building.z], [0.86, 0.86, 0.86], null, building, 'roof');
    }
    return main;
  }

  function createHall(building) {
    namedGroups.set(building.id, building);
    const { x, z, width: w, depth: d } = building;
    const platform = building.platform;
    const floorHeight = building.kind === 'grand' ? 9 : building.kind === 'gate' ? 7 : 6.5;
    const roofRise = Math.max(3.5, Math.min(14, d * (building.kind === 'pavilion' ? 0.48 : 0.27)));
    const trim = building.colorVariant ? m.redAlt : m.red;

    addBox([x, platform / 2, z], [w + 5, platform, d + 5], m.stone, building, 'plinth');
    addBox([x, platform + 0.14, z], [w + 7, 0.28, d + 7], m.pavingLight, building, 'plinth-cap');
    if (platform > 2.5) {
      const steps = Math.min(4, Math.max(2, Math.round(platform / 3)));
      for (let step = 0; step < steps; step += 1) {
        const stepHeight = platform / steps;
        addBox([x, stepHeight * (step + 0.5), z - d * 0.48 - (steps - step) * 1.1], [w * 0.38 + (steps - step) * 2.5, stepHeight, 3.2 + step * 0.12], m.stone, building, 'stair');
      }
    }

    const wallBase = platform + 0.5;
    const wallTop = platform + floorHeight;
    const wallHeight = wallTop - wallBase;
    const wallDepth = Math.max(0.8, d * 0.055);
    if (building.kind !== 'pavilion') {
      addBox([x, wallBase + wallHeight / 2, z + d * 0.38], [w * 0.88, wallHeight, wallDepth], trim, building, 'rear-wall');
      addBox([x - w * 0.43, wallBase + wallHeight / 2, z], [wallDepth, wallHeight, d * 0.76], trim, building, 'side-wall');
      addBox([x + w * 0.43, wallBase + wallHeight / 2, z], [wallDepth, wallHeight, d * 0.76], trim, building, 'side-wall');

      const doorWidth = Math.max(4.8, w * (building.kind === 'grand' ? 0.2 : 0.16));
      const panelWidth = (w * 0.88 - doorWidth) / 2;
      const panelCenter = doorWidth / 2 + panelWidth / 2;
      addBox([x - panelCenter, wallBase + wallHeight * 0.5, z - d * 0.38], [panelWidth, wallHeight, wallDepth], trim, building, 'front-wall');
      addBox([x + panelCenter, wallBase + wallHeight * 0.5, z - d * 0.38], [panelWidth, wallHeight, wallDepth], trim, building, 'front-wall');
    }

    const bayCount = Math.max(2, building.bays);
    const colSpan = w * 0.82;
    const colHeight = floorHeight + 0.1;
    for (const frontSign of [-1, 1]) {
      for (let index = 0; index <= bayCount; index += 1) {
        const colX = x - colSpan / 2 + (colSpan * index) / bayCount;
        addPillar([colX, platform + colHeight / 2, z + frontSign * d * 0.39], colHeight, building.kind === 'grand' ? 0.92 : 0.7, m.deepRed, building);
        addPillar([colX, platform + 0.45, z + frontSign * d * 0.39], 0.9, building.kind === 'grand' ? 1.25 : 0.96, m.stone, building);
      }
    }

    const beamY = platform + floorHeight + 0.45;
    beam([x, beamY, z - d * 0.4], w * 0.98, 1.35, m.jade, 'x', building);
    beam([x, beamY, z + d * 0.4], w * 0.98, 1.35, m.jade, 'x', building);
    beam([x - w * 0.45, beamY, z], d * 0.82, 1.25, m.jade, 'z', building);
    beam([x + w * 0.45, beamY, z], d * 0.82, 1.25, m.jade, 'z', building);

    if (building.interior) {
      const interiorY = platform + 0.34;
      addBox([x, interiorY, z], [w * 0.78, 0.25, d * 0.68], m.dark, building, 'interior-floor');
      for (const side of [-1, 1]) {
        addPillar([x + side * w * 0.24, platform + floorHeight * 0.42, z + d * 0.08], floorHeight * 0.78, 0.82, m.deepRed, building);
      }
      addBox([x, platform + 2.1, z + d * 0.22], [w * 0.52, 4.2, 1.1], m.deepRed, building, 'screen');
      addBox([x, platform + 1.3, z - d * 0.08], [w * 0.23, 1.2, d * 0.15], m.gold, building, 'throne-dais');
      addBox([x, platform + 2.4, z - d * 0.08], [w * 0.14, 1.4, d * 0.1], m.redAlt, building, 'throne');
      addBox([x, platform + 3.65, z - d * 0.08], [w * 0.12, 0.3, d * 0.08], m.gold, building, 'throne-back');
    }

    const eavesY = platform + floorHeight + 1.0;
    addRoof(building, eavesY, w, d, roofRise, building.kind === 'pavilion' ? m.roofLight : m.roof, building.doubleEaves);

    // A discreet horizontal plaque makes each structure read as a finished architectural object.
    addBox([x, platform + floorHeight * 0.8, z - d * 0.44], [Math.min(10, w * 0.2), 1.3, 0.55], m.gold, building, 'plaque');
    return building;
  }

  function addWallSegment(x, z, width, depth, height = 6, material = m.deepRed) {
    addBox([x, height / 2, z], [width, height, depth], material, null, 'wall');
    addBox([x, height + 0.35, z], [width + 0.8, 0.7, depth + 0.7], m.red, null, 'wall-cap');
  }

  function addCourtWalls(courtyard) {
    const [minX, maxX, minZ, maxZ] = courtyard.bounds;
    const gateWidth = 17;
    const height = courtyard.zone === 'forecourt' ? 5 : 5.5;
    const leftWidth = (maxX - minX - gateWidth) / 2;
    addWallSegment(minX + leftWidth / 2, minZ, leftWidth, 1.5, height);
    addWallSegment(maxX - leftWidth / 2, minZ, leftWidth, 1.5, height);
    addWallSegment(minX, (minZ + maxZ) / 2, 1.5, maxZ - minZ, height);
    addWallSegment(maxX, (minZ + maxZ) / 2, 1.5, maxZ - minZ, height);
    addWallSegment((minX + maxX) / 2, maxZ, maxX - minX, 1.5, height);
    addBox([(minX + maxX) / 2, 0.6, minZ], [gateWidth, 1.2, 2.8], m.stone, null, 'threshold');
  }

  function addTree(x, z, scale = 1, crownMaterial = m.garden, y = 0) {
    instance(cylinderSmallGeometry, m.wood, [x, y + 3.3 * scale, z], [1.1 * scale, 6.6 * scale, 1.1 * scale], null, null, 'tree-trunk');
    instance(leafGeometry, crownMaterial, [x, y + 7.4 * scale, z], [5.8 * scale, 6.1 * scale, 5.8 * scale], null, null, 'tree-crown');
    instance(leafGeometry, crownMaterial, [x - 1.7 * scale, y + 9.3 * scale, z + 0.8 * scale], [3.8 * scale, 4.3 * scale, 3.8 * scale], null, null, 'tree-crown');
    instance(leafGeometry, crownMaterial, [x + 1.8 * scale, y + 8.9 * scale, z - 1.1 * scale], [3.7 * scale, 4 * scale, 3.7 * scale], null, null, 'tree-crown');
  }

  function addLantern(x, z, scale = 1) {
    addBox([x, 3.5 * scale, z], [0.65 * scale, 5.8 * scale, 0.65 * scale], m.dark, null, 'lantern-post');
    addBox([x, 6.2 * scale, z], [2.4 * scale, 1.8 * scale, 2.2 * scale], m.lantern, null, 'lantern-light');
    addBox([x, 7.3 * scale, z], [3.2 * scale, 0.4 * scale, 3.0 * scale], m.gold, null, 'lantern-cap');
  }

  function finalize() {
    for (const { geometry, material, records } of batches.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, records.length);
      mesh.name = `palace-${material.name || material.uuid}`;
      mesh.castShadow = material === m.roof || material === m.roofLight;
      mesh.receiveShadow = material === m.paving || material === m.stone;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.instanceData = records;
      for (let index = 0; index < records.length; index += 1) mesh.setMatrixAt(index, records[index].matrix);
      mesh.computeBoundingSphere();
      root.add(mesh);
      if (records.some((record) => record.building)) pickableMeshes.push(mesh);
    }
    for (const [id, records] of roofInstances) {
      const roofRecords = [];
      for (const mesh of pickableMeshes) {
        const items = mesh.userData.instanceData;
        items.forEach((record, instanceId) => {
          if (record.building?.id === id && record.part === 'roof') roofRecords.push({ mesh, instanceId, record });
        });
      }
      roofInstances.set(id, roofRecords);
    }
    return { pickableMeshes, roofInstances, namedGroups, materials };
  }

  return {
    materials: m,
    createHall,
    addBox,
    addPillar,
    addWallSegment,
    addCourtWalls,
    addTree,
    addLantern,
    finalize,
    root,
  };
}
