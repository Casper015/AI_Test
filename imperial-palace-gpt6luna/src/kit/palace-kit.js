import { CONFIG } from '../shared/config.js';

const boxGeometry = new Map();
const cylinderGeometry = new Map();
const roofGeometry = new Map();

function cachedBox(THREE, w, h, d) {
  const key = `${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`;
  if (!boxGeometry.has(key)) boxGeometry.set(key, new THREE.BoxGeometry(w, h, d));
  return boxGeometry.get(key);
}

function roofGeom(THREE, width, depth, height, ridgeRatio = 0.43) {
  const key = `${width.toFixed(1)}:${depth.toFixed(1)}:${height.toFixed(1)}:${ridgeRatio}`;
  if (roofGeometry.has(key)) return roofGeometry.get(key);
  const x = width / 2;
  const z = depth / 2;
  const r = width * ridgeRatio / 2;
  const e = 0;
  const l0 = [-x, e, -z], l1 = [x, e, -z], r1 = [x, e, z], r0 = [-x, e, z];
  const a = [-r, height, 0], b = [r, height, 0];
  const triangles = [
    l0, l1, b, l0, b, a,
    r1, r0, a, r1, a, b,
    l1, r1, b, r0, l0, a
  ];
  const positions = triangles.flat();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  roofGeometry.set(key, geom);
  return geom;
}

function addMesh(THREE, parent, geometry, material, x, y, z, buildingId) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.buildingId = buildingId;
  parent.add(mesh);
  return mesh;
}

export function createPalaceKit(THREE) {
  const c = CONFIG.colors;
  const materials = {
    roof: new THREE.MeshStandardMaterial({ color: c.roofGold, roughness: 0.34, metalness: 0.24 }),
    roofDark: new THREE.MeshStandardMaterial({ color: c.roofShadow, roughness: 0.5, metalness: 0.16 }),
    wall: new THREE.MeshStandardMaterial({ color: c.vermilion, roughness: 0.8 }),
    wallAlt: new THREE.MeshStandardMaterial({ color: '#a74437', roughness: 0.8 }),
    lacquer: new THREE.MeshStandardMaterial({ color: c.darkLacquer, roughness: 0.53 }),
    jade: new THREE.MeshStandardMaterial({ color: c.jade, roughness: 0.72 }),
    marble: new THREE.MeshStandardMaterial({ color: c.marble, roughness: 0.52 }),
    ground: new THREE.MeshStandardMaterial({ color: c.courtyardStone, roughness: 0.9 }),
    gold: new THREE.MeshStandardMaterial({ color: c.warmGold, roughness: 0.26, metalness: 0.72 }),
    foliage: new THREE.MeshStandardMaterial({ color: c.foliage, roughness: 0.9 }),
    foliageLight: new THREE.MeshStandardMaterial({ color: '#71815b', roughness: 0.92 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#594132', roughness: 0.95 }),
    water: new THREE.MeshStandardMaterial({ color: c.water, roughness: 0.24, metalness: 0.18 }),
    dark: new THREE.MeshStandardMaterial({ color: '#33342e', roughness: 0.92 })
  };

  function markBuilding(group, id) {
    group.traverse((node) => {
      if (node.isMesh) {
        node.userData.buildingId = id;
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
  }

  function makeBuilding(spec) {
    const {
      id, name, kind = 'hall', x = 0, z = 0, width = 26, depth = 18, height = 11,
      tiers = 1, openFront = false, ornament = 1, access = '外观可览', description = '宫城院落中的一座殿堂。'
    } = spec;
    const group = new THREE.Group();
    group.name = name || id;
    group.position.set(x, 0, z);
    const foundationH = Math.max(1.25, height * (kind === 'gate' ? 0.19 : 0.14));
    const floorY = foundationH;
    const bodyH = height - foundationH - Math.max(2.8, height * 0.35);
    const plinthW = width + 4.6;
    const plinthD = depth + 4;
    const entranceW = Math.min(width * 0.36, 8.5);
    addMesh(THREE, group, cachedBox(THREE, plinthW, foundationH, plinthD), materials.marble, 0, foundationH / 2, 0, id);
    if (openFront) {
      addMesh(THREE, group, cachedBox(THREE, width - 1, 0.34, depth - 1), materials.lacquer, 0, floorY + 0.12, 0, id);
      const side = Math.max(0.7, Math.min(1.15, width * 0.035));
      addMesh(THREE, group, cachedBox(THREE, side, bodyH, depth), materials.wall, -width / 2 + side / 2, floorY + bodyH / 2, 0, id);
      addMesh(THREE, group, cachedBox(THREE, side, bodyH, depth), materials.wall, width / 2 - side / 2, floorY + bodyH / 2, 0, id);
      addMesh(THREE, group, cachedBox(THREE, width, side, side), materials.wall, 0, floorY + bodyH / 2, depth / 2 - side / 2, id);
      const frontPillar = new THREE.CylinderGeometry(Math.max(0.34, width / 55), Math.max(0.4, width / 49), bodyH + 0.8, 10);
      const count = Math.max(4, Math.floor(width / 5));
      for (let i = 0; i <= count; i++) {
        const px = -width / 2 + (width * i) / count;
        if (Math.abs(px) < entranceW / 2 + side / 2) continue;
        addMesh(THREE, group, frontPillar, materials.wallAlt, px, floorY + (bodyH + 0.8) / 2, -depth / 2, id);
      }
      // A small, shared-proportion throne dais makes the entry view read as an interior.
      if (kind === 'main' || kind === 'residence') {
        addMesh(THREE, group, cachedBox(THREE, Math.min(8, width * 0.28), 0.78, Math.min(5, depth * 0.22)), materials.marble, 0, floorY + 0.62, depth * 0.18, id);
        addMesh(THREE, group, cachedBox(THREE, Math.min(4, width * 0.13), 2.5, 0.36), materials.gold, 0, floorY + 2.1, depth * 0.29, id);
        addMesh(THREE, group, cachedBox(THREE, Math.min(3.2, width * 0.11), 1.1, 1.1), materials.roof, 0, floorY + 1.56, depth * 0.18, id);
      }
    } else {
      addMesh(THREE, group, cachedBox(THREE, width, bodyH, depth), materials.wall, 0, floorY + bodyH / 2, 0, id);
    }

    const eaveW = width + (kind === 'main' ? 12 : 7.4);
    const eaveD = depth + (kind === 'main' ? 11 : 6.8);
    const roofBaseY = floorY + bodyH + 0.45;
    const roofH = Math.max(3.1, height * 0.36);
    const roofLayers = tiers > 1 ? 2 : 1;
    for (let layer = 0; layer < roofLayers; layer++) {
      const scale = layer === 0 && roofLayers === 2 ? 1.13 : 1;
      const ew = eaveW * scale;
      const ed = eaveD * scale;
      const base = roofBaseY + layer * (roofH + 1.05);
      const peak = roofH * (layer === 0 && roofLayers === 2 ? 0.76 : 1);
      const ridgeRatio = kind === 'pavilion' ? 0.2 : kind === 'gate' ? 0.28 : 0.43;
      const geom = roofGeom(THREE, ew, ed, peak, ridgeRatio);
      const fascia = addMesh(THREE, group, cachedBox(THREE, ew + 0.3, 0.42, ed + 0.3), materials.lacquer, 0, base - 0.18, 0, id);
      fascia.material = materials.lacquer;
      const roof = addMesh(THREE, group, geom, materials.roof, 0, base, 0, id);
      roof.material.side = THREE.DoubleSide;
      // The thin gold coping at the ridge gives even the far-view silhouettes a clear crown.
      const ridgeLength = Math.max(3, ew * ridgeRatio);
      addMesh(THREE, group, cachedBox(THREE, ridgeLength + 2.2, 0.44, 0.62), materials.gold, 0, base + peak + 0.05, 0, id);
      if (ornament >= 2) {
        const beast = new THREE.SphereGeometry(0.62, 8, 6);
        addMesh(THREE, group, beast, materials.gold, -ridgeLength / 2 - 0.45, base + peak + 0.2, 0, id);
        addMesh(THREE, group, beast, materials.gold, ridgeLength / 2 + 0.45, base + peak + 0.2, 0, id);
      }
    }

    const frontZ = -depth / 2 - 0.24;
    if (openFront) {
      const doorH = Math.min(bodyH * 0.82, 5.3);
      // Leave the entrance open for first-person walking; use a gold jamb and lintel.
      const frameGeo = new THREE.BoxGeometry(0.24, doorH + 0.5, 0.45);
      addMesh(THREE, group, frameGeo, materials.gold, -entranceW / 2 - 0.17, floorY + doorH / 2, frontZ, id);
      addMesh(THREE, group, frameGeo, materials.gold, entranceW / 2 + 0.17, floorY + doorH / 2, frontZ, id);
      addMesh(THREE, group, cachedBox(THREE, entranceW + 0.48, 0.28, 0.45), materials.gold, 0, floorY + doorH + 0.12, frontZ, id);
      if (entranceW < width * 0.5) {
        const win = new THREE.BoxGeometry(width * 0.13, bodyH * 0.44, 0.26);
        addMesh(THREE, group, win, materials.jade, -width * 0.34, floorY + bodyH * 0.55, frontZ, id);
        addMesh(THREE, group, win, materials.jade, width * 0.34, floorY + bodyH * 0.55, frontZ, id);
      }
    }

    const stairCount = kind === 'main' ? 9 : kind === 'gate' ? 7 : 5;
    const stairW = Math.min(width * 0.42, kind === 'main' ? 21 : 11);
    for (let i = 0; i < stairCount; i++) {
      const stepH = foundationH / stairCount;
      const stepD = kind === 'main' ? 1.15 : 0.78;
      const stepGeom = cachedBox(THREE, stairW, stepH, stepD);
      addMesh(THREE, group, stepGeom, materials.marble, 0, stepH * (i + 0.5), -plinthD / 2 - stepD * (i + 0.5), id);
    }

    markBuilding(group, id);
    group.userData.buildingId = id;
    const record = { id, name, category: kind, description, access, x, z, size: [width, depth], visitable: access.includes('可入内') };
    return { group, record };
  }

  function addBuilding(zone, spec) {
    const built = makeBuilding(spec);
    zone.root.add(built.group);
    zone.buildings.push({ ...built.record, group: built.group });
    return built;
  }

  function makeWall({ start, end, height = 7, thickness = 2.2, gateWidth = 0, material = materials.wall }) {
    const [x1, z1] = start;
    const [x2, z2] = end;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(-dz, dx);
    const midpoint = [(x1 + x2) / 2, (z1 + z2) / 2];
    const group = new THREE.Group();
    group.position.set(midpoint[0], 0, midpoint[1]);
    group.rotation.y = angle;
    const segments = gateWidth > 0 ? [[-length / 2, -gateWidth / 2], [gateWidth / 2, length / 2]] : [[-length / 2, length / 2]];
    const wallColliders = [];
    for (const [a, b] of segments) {
      if (b <= a) continue;
      const mesh = new THREE.Mesh(cachedBox(THREE, b - a, height, thickness), material);
      mesh.position.set((a + b) / 2, height / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      wallColliders.push({ type: 'wall', xMin: a, xMax: b, halfThickness: thickness / 2, center: [midpoint[0], midpoint[1]], rotation: angle });
    }
    if (gateWidth > 0) {
      const lintel = new THREE.Mesh(cachedBox(THREE, gateWidth, 1, thickness), materials.roof);
      lintel.position.set(0, height - 0.45, 0);
      group.add(lintel);
    }
    group.userData.wallColliders = wallColliders;
    return group;
  }

  function makeCourtyard(zone, { id, name, x, z, width, depth, gate = 9, wallHeight = 5, paving = materials.ground }) {
    if (!Array.isArray(zone.colliders)) zone.colliders = [];
    const slab = new THREE.Mesh(cachedBox(THREE, width, 0.26, depth), paving);
    slab.position.set(x, 0.02, z);
    slab.receiveShadow = true;
    slab.userData.courtyardId = id;
    zone.root.add(slab);
    const x0 = x - width / 2, x1 = x + width / 2, z0 = z - depth / 2, z1 = z + depth / 2;
    for (const wall of [
      makeWall({ start: [x0, z0], end: [x0, z1], height: wallHeight }),
      makeWall({ start: [x1, z1], end: [x1, z0], height: wallHeight }),
      makeWall({ start: [x0, z1], end: [x1, z1], height: wallHeight }),
      makeWall({ start: [x1, z0], end: [x0, z0], height: wallHeight, gateWidth: gate })
    ]) {
      zone.root.add(wall);
      zone.colliders.push(...wall.userData.wallColliders);
    }
    zone.courtyards.push({ id, name, bounds: [x0, x1, z0, z1], center: [x, z] });
  }

  function makeTree({ x, z, scale = 1, kind = 'pine' }) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * scale, 0.7 * scale, 3.8 * scale, 7), materials.trunk);
    trunk.position.y = 1.9 * scale;
    trunk.castShadow = true;
    group.add(trunk);
    const cone = kind === 'pine';
    const layers = cone ? 3 : 2;
    for (let i = 0; i < layers; i++) {
      const s = cone ? (1.2 - i * 0.25) * scale : (1.3 - i * 0.22) * scale;
      const geometry = cone ? new THREE.ConeGeometry(s, 3.3 * scale, 8) : new THREE.IcosahedronGeometry(s, 1);
      const foliage = new THREE.Mesh(geometry, i % 2 ? materials.foliageLight : materials.foliage);
      foliage.position.y = (3.3 + i * 1.15) * scale;
      foliage.position.x = cone ? 0 : Math.sin(i * 3.2) * 0.3 * scale;
      foliage.castShadow = true;
      group.add(foliage);
    }
    return group;
  }

  function makeLamp({ x, z }) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.7, 8), materials.marble);
    base.position.y = 0.35;
    group.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 3.1, 8), materials.dark);
    pole.position.y = 2.1;
    group.add(pole);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 1.1), new THREE.MeshStandardMaterial({ color: '#f3bc69', emissive: '#e78234', emissiveIntensity: 0.75 }));
    glow.position.y = 4;
    group.add(glow);
    return group;
  }

  return { materials, makeBuilding, addBuilding, makeCourtyard, makeWall, makeTree, makeLamp };
}
