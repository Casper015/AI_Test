import { CONNECTORS } from '../shared/layout.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ZONE_ID = 'inner';
const GROUND_Y = 0;

/**
 * Build the inner-palace precinct in frozen world coordinates.
 * The root stays at the origin so every registered object remains in global X/Z.
 */
export function createZone(ctx) {
  const { THREE, kit } = ctx;
  if (!THREE || !kit) throw new Error('inner palace requires THREE and the shared palace kit');

  const root = new THREE.Group();
  root.name = 'zone-inner-palace';
  root.userData.zoneId = ZONE_ID;
  const zone = { root, buildings: [], courtyards: [], colliders: [] };
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const sharedMaterials = new Set(Object.values(kit.materials));

  function addGeneratedProp(group) {
    group.traverse((node) => {
      if (!node.isMesh) return;
      if (node.geometry) ownedGeometries.add(node.geometry);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material && !sharedMaterials.has(material)) ownedMaterials.add(material);
      }
    });
    root.add(group);
  }

  function addOwnedBox(parent, id, width, height, depth, material, x, y, z) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.buildingId = id;
    parent.add(mesh);
    return mesh;
  }

  function batchOwnedMeshes(parent, label) {
    const buckets = new Map();
    for (const mesh of [...parent.children]) {
      if (!mesh.isMesh || mesh.isInstancedMesh || !ownedGeometries.has(mesh.geometry)) continue;
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(mesh);
    }
    for (const [material, meshes] of buckets) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (!geometry) throw new Error(`Could not batch ${label} ${material.name || 'material'}`);
      for (const mesh of meshes) {
        parent.remove(mesh);
        ownedGeometries.delete(mesh.geometry);
        mesh.geometry.dispose();
      }
      ownedGeometries.add(geometry);
      const batch = new THREE.Mesh(geometry, material);
      batch.name = `${label}-${material.name || 'material'}`;
      batch.castShadow = true;
      batch.receiveShadow = true;
      if (parent.userData.buildingId) batch.userData.buildingId = parent.userData.buildingId;
      parent.add(batch);
    }
  }

  function addCourtyard({ id, name, x, z, width, depth, wallHeight, gateWidth, sideGateWidth }) {
    const floorGeometry = new THREE.BoxGeometry(width, 0.26, depth);
    ownedGeometries.add(floorGeometry);
    const floor = new THREE.Mesh(floorGeometry, kit.materials.ground);
    floor.position.set(x, 0.02, z);
    floor.receiveShadow = true;
    floor.userData.courtyardId = id;
    root.add(floor);

    const x0 = x - width / 2;
    const x1 = x + width / 2;
    const z0 = z - depth / 2;
    const z1 = z + depth / 2;
    const wall = (start, end, passage) => kit.makeWall({
      start,
      end,
      height: wallHeight,
      thickness: 1.8,
      gateWidth: passage
    });

    // Register the same wall segments the visitor actually sees; the central
    // and lateral openings remain collider-free at every courtyard threshold.
    for (const segment of [
      wall([x0, z0], [x1, z0], gateWidth),
      wall([x1, z1], [x0, z1], gateWidth),
      wall([x0, z1], [x0, z0], sideGateWidth),
      wall([x1, z0], [x1, z1], sideGateWidth)
    ]) {
      root.add(segment);
      zone.colliders.push(...segment.userData.wallColliders);
    }
    zone.courtyards.push({ id, name, bounds: [x0, x1, z0, z1], center: [x, z] });
  }

  function addBuilding(spec) {
    const { x, z, width, depth } = spec;
    const footprint = [x - width / 2, x + width / 2, z - depth / 2, z + depth / 2];
    if (footprint[0] < -100 || footprint[1] > 100 || footprint[2] < 83 || footprint[3] > 302) {
      throw new RangeError(`${spec.id} footprint falls outside the frozen inner-palace bounds`);
    }
    return kit.addBuilding(zone, { ...spec, id: `inner-${spec.id}` });
  }

  function decorateOpenGate(built, spec) {
    // The kit's openFront construction leaves a real 8.5m central opening,
    // without relying on the kit's internal child order or batched meshes.
    const frameHeight = Math.min(5.5, spec.height * 0.55);
    const postX = spec.width * 0.42;
    const postZ = spec.depth * 0.34;
    for (const px of [-postX, postX]) {
      for (const pz of [-postZ, postZ]) {
        addOwnedBox(built.group, built.record.id, 0.9, frameHeight, 0.9, kit.materials.lacquer,
          px, 1.5 + frameHeight / 2, pz);
      }
    }
    addOwnedBox(built.group, built.record.id, spec.width * 0.92, 0.8, 1.1, kit.materials.jade,
      0, 1.5 + frameHeight + 0.35, 0);
    addOwnedBox(built.group, built.record.id, spec.width * 0.84, 0.32, 1.35, kit.materials.gold,
      0, 1.5 + frameHeight + 0.9, 0);

    // The kit climbs to a raised threshold from the south; descend on the
    // north as well so a visitor can pass through rather than reach a drop.
    const foundation = Math.max(1.25, spec.height * 0.19);
    const count = 5;
    const rearEdge = spec.depth / 2 + 2;
    const tread = spec.id === 'garden-inner-gate' ? 0.39 : 0.78;
    for (let i = 0; i < count; i++) {
      const stepHeight = foundation * (count - i) / count;
      addOwnedBox(built.group, built.record.id, 9, stepHeight, tread + 0.03,
        kit.materials.marble, 0, stepHeight / 2, rearEdge + tread * (i + 0.5));
    }
  }

  function makePortal(spec) {
    const gateSpec = {
      kind: 'gate',
      height: 11,
      tiers: 1,
      ornament: 1,
      openFront: true,
      access: '外观可览',
      description: '连接内廷院落的敞开式门殿。',
      ...spec
    };
    const built = addBuilding(gateSpec);
    decorateOpenGate(built, gateSpec);
    batchOwnedMeshes(built.group, `inner-${gateSpec.id}-detail`);
    return built;
  }

  function addPavedPath(id, x, z, width, depth, material = kit.materials.marble) {
    const geometry = new THREE.BoxGeometry(width, 0.12, depth);
    ownedGeometries.add(geometry);
    const path = new THREE.Mesh(geometry, material);
    path.position.set(x, 0.16, z);
    path.receiveShadow = true;
    path.userData.pathId = id;
    root.add(path);
  }

  function addBedchamberInterior(built, spec) {
    // The kit supplies the plinth, actual south opening, side walls, roof and
    // front steps. Its rear member is only a beam, so close the room here.
    const foundation = Math.max(1.25, spec.height * 0.14);
    const bodyHeight = spec.height - foundation - Math.max(2.8, spec.height * 0.35);
    const rearZ = spec.depth / 2 - 0.55;
    const frontZ = -spec.depth / 2 - 0.3;
    const opening = 11.8;
    const wingWidth = (spec.width - opening) / 2;
    addOwnedBox(built.group, built.record.id, spec.width - 2.4, 0.14, spec.depth - 2.4,
      kit.materials.dark, 0, foundation + 0.35, 0);
    // Two opaque wings and a high lintel make the middle a physical doorway,
    // rather than a vanished wall. The opening stays wider than the kit steps.
    for (const side of [-1, 1]) {
      const x = side * (opening / 2 + wingWidth / 2);
      addOwnedBox(built.group, built.record.id, wingWidth, bodyHeight, 0.6,
        kit.materials.wall, x, foundation + bodyHeight / 2, frontZ);
      addOwnedBox(built.group, built.record.id, wingWidth - 3.4, 3.45, 0.13,
        kit.materials.jade, x, foundation + 3.0, frontZ - 0.39);
      for (const offset of [-2.4, 0, 2.4]) {
        addOwnedBox(built.group, built.record.id, 0.15, 3.5, 0.18,
          kit.materials.gold, x + offset, foundation + 3, frontZ - 0.5);
      }
      addOwnedBox(built.group, built.record.id, 0.42, 5.3, 0.75,
        kit.materials.lacquer, side * (opening / 2 + 0.22), foundation + 2.65, frontZ - 0.1);
    }
    addOwnedBox(built.group, built.record.id, opening, 0.8, 0.75,
      kit.materials.jade, 0, foundation + 5.25, frontZ);
    addOwnedBox(built.group, built.record.id, opening + 1.1, 0.24, 0.85,
      kit.materials.gold, 0, foundation + 5.8, frontZ);

    // Solid rear wall and an inset ceiling stop the distant city or sky from
    // showing through the chamber. The visitor still enters from the south;
    // the exterior axis continues around this bedroom on both side walks.
    addOwnedBox(built.group, built.record.id, spec.width - 1.5, bodyHeight, 0.95,
      kit.materials.wall, 0, foundation + bodyHeight / 2, rearZ);
    addOwnedBox(built.group, built.record.id, spec.width - 2.1, 0.28, spec.depth - 2.2,
      kit.materials.jade, 0, foundation + bodyHeight - 0.36, 0);
    for (const side of [-1, 1]) {
      addOwnedBox(built.group, built.record.id, 8, 3.6, 0.14,
        kit.materials.lacquer, side * 13.2, foundation + 3.2, rearZ - 0.56);
      for (const offset of [-2.55, 0, 2.55]) {
        addOwnedBox(built.group, built.record.id, 0.16, 3.55, 0.19,
          kit.materials.gold, side * 13.2 + offset, foundation + 3.2, rearZ - 0.69);
      }
    }

    // Delicate shutters and screens suggest domestic rooms while the centre
    // remains an unobstructed walk from the threshold to the bed platform.
    for (const side of [-1, 1]) {
      for (const z of [-4.5, 3.5]) {
        addOwnedBox(built.group, built.record.id, 0.13, 3.4, 5.2,
          kit.materials.jade, side * (spec.width / 2 - 1.28), foundation + 3.2, z);
        for (const offset of [-1.7, 0, 1.7]) {
          addOwnedBox(built.group, built.record.id, 0.18, 3.45, 0.18,
            kit.materials.gold, side * (spec.width / 2 - 1.37), foundation + 3.2, z + offset);
        }
      }
      addOwnedBox(built.group, built.record.id, 3.6, 1.1, 2.2,
        kit.materials.lacquer, side * 13.5, foundation + 0.97, -0.6);
      addOwnedBox(built.group, built.record.id, 2.2, 0.22, 1.6,
        kit.materials.gold, side * 13.5, foundation + 1.62, -0.6);
    }

    // Low bed platform, canopy and screen give the interior a domestic scale,
    // distinct from the monumental forecourt hall.
    addOwnedBox(built.group, built.record.id, 12, 0.75, 6.4, kit.materials.lacquer,
      0, foundation + 0.62, 3.1);
    addOwnedBox(built.group, built.record.id, 11, 0.28, 5.5, kit.materials.roofDark,
      0, foundation + 1.12, 3.1);
    for (const px of [-5.2, 5.2]) {
      for (const pz of [0.7, 5.5]) {
        addOwnedBox(built.group, built.record.id, 0.28, 3.1, 0.28, kit.materials.dark,
          px, foundation + 2.7, pz);
      }
    }
    addOwnedBox(built.group, built.record.id, 11.4, 0.32, 5.9, kit.materials.roofDark,
      0, foundation + 4.25, 3.1);
    for (const px of [-5.15, 5.15]) {
      addOwnedBox(built.group, built.record.id, 0.28, 2.5, 5.7, kit.materials.jade,
        px, foundation + 2.7, 3.1);
      addOwnedBox(built.group, built.record.id, 0.13, 2.65, 5.8, kit.materials.gold,
        px + (px < 0 ? -0.18 : 0.18), foundation + 2.7, 3.1);
    }
    addOwnedBox(built.group, built.record.id, 14, 3.5, 0.7, kit.materials.lacquer,
      0, foundation + 2.15, rearZ - 1.4);
    for (const px of [-4.4, -2.2, 0, 2.2, 4.4]) {
      addOwnedBox(built.group, built.record.id, 0.16, 2.55, 0.18, kit.materials.jade,
        px, foundation + 2.2, rearZ - 0.98);
    }
    addOwnedBox(built.group, built.record.id, 14.6, 0.22, 0.28, kit.materials.gold,
      0, foundation + 3.95, rearZ - 0.96);
    zone.buildings.find((entry) => entry.id === built.record.id).interiorView = {
      position: [0, foundation + 1.75, spec.z - 8.5],
      target: [0, foundation + 2.7, spec.z + 3.1]
    };
  }

  // Three successive courts, each with aligned north/south gates and side doors.
  addCourtyard({ id: 'inner-court-south', name: '內廷前院', x: 0, z: 115,
    width: 140, depth: 52, wallHeight: 4.7, gateWidth: 24, sideGateWidth: 14 });
  addCourtyard({ id: 'inner-court-middle', name: '寝宫正院', x: 0, z: 184,
    width: 140, depth: 54, wallHeight: 4.9, gateWidth: 26, sideGateWidth: 16 });
  addCourtyard({ id: 'inner-court-north', name: '后寝花园过渡院', x: 0, z: 255,
    width: 140, depth: 54, wallHeight: 4.5, gateWidth: 28, sideGateWidth: 14 });

  // Main entry, three court-to-court portals, and the garden-facing inner gate.
  makePortal({ id: 'south-inner-gate', name: '内廷门', x: 0, z: 97, width: 26, depth: 12,
    description: '前朝与后宫之间的内廷门。' });
  addBuilding({ id: 'south-main-hall', name: '承恩前殿', kind: 'hall', x: 0, z: 125,
    width: 38, depth: 15, height: 13, tiers: 1, ornament: 2,
    description: '内廷前院的礼仪殿堂，尺度收敛于前朝主殿。' });
  addBuilding({ id: 'south-west-side-hall', name: '西配房·前院', kind: 'sideHall', x: -43, z: 117,
    width: 26, depth: 14, height: 8.4, ornament: 1 });
  addBuilding({ id: 'south-east-side-hall', name: '东配房·前院', kind: 'sideHall', x: 43, z: 117,
    width: 26, depth: 14, height: 8.4, ornament: 1 });

  makePortal({ id: 'middle-inner-gate', name: '寝宫仪门', x: 0, z: 149, width: 24, depth: 10,
    description: '进入寝宫正院的仪门。' });
  addBuilding({ id: 'middle-west-wing', name: '西配房·寝宫', kind: 'sideHall', x: -45, z: 184,
    width: 26, depth: 15, height: 8.7, ornament: 1 });
  const bedSpec = { id: 'core-bedchamber', name: '紫宸寝殿', kind: 'hall', x: 0, z: 184,
    width: 42, depth: 24, height: 13, tiers: 1, ornament: 2, openFront: true,
    access: '可入内（寝殿内景）',
    description: '以内廷居住空间为尺度的开敞寝殿，可近看床榻、帷幔与屏风。' };
  const bedBuilt = addBuilding(bedSpec);
  addBedchamberInterior(bedBuilt, bedSpec);
  batchOwnedMeshes(bedBuilt.group, 'inner-bedchamber-interior');
  addBuilding({ id: 'middle-east-wing', name: '东配房·寝宫', kind: 'sideHall', x: 45, z: 184,
    width: 26, depth: 15, height: 8.7, ornament: 1 });

  makePortal({ id: 'north-inner-gate', name: '后寝垂花门', x: 0, z: 219, width: 26, depth: 10,
    description: '通往后寝与北侧花园过渡庭院的门殿。' });
  addBuilding({ id: 'north-main-hall', name: '宁和殿', kind: 'hall', x: 0, z: 260,
    width: 40, depth: 20, height: 12, tiers: 1, ornament: 2,
    description: '后寝院落中的安静小殿。' });
  addBuilding({ id: 'north-west-wing', name: '西配房·后寝', kind: 'sideHall', x: -43, z: 258,
    width: 26, depth: 15, height: 8.2, ornament: 1 });
  addBuilding({ id: 'north-east-wing', name: '东配房·后寝', kind: 'sideHall', x: 43, z: 258,
    width: 26, depth: 15, height: 8.2, ornament: 1 });
  addBuilding({ id: 'north-courtyard-pavilion', name: '后寝庭心亭', kind: 'pavilion', x: -50, z: 235,
    width: 18, depth: 13, height: 8.6, tiers: 1, ornament: 1,
    description: '后寝院落西侧的小型歇息亭，与主轴步道错开。' });

  // Lateral households sit outside the walled courts, leaving the z=180
  // cross-lane clear from the side gates to the west/east zone connectors.
  addBuilding({ id: 'west-south-house', name: '西侧值房', kind: 'sideHall', x: -84, z: 132,
    width: 20, depth: 18, height: 7.4, ornament: 1 });
  addBuilding({ id: 'east-south-house', name: '东侧值房', kind: 'sideHall', x: 84, z: 132,
    width: 20, depth: 18, height: 7.4, ornament: 1 });
  addBuilding({ id: 'west-north-study', name: '西侧书房', kind: 'sideHall', x: -84, z: 248,
    width: 20, depth: 18, height: 7.5, ornament: 1 });
  addBuilding({ id: 'east-north-study', name: '东侧茶间', kind: 'sideHall', x: 84, z: 248,
    width: 20, depth: 18, height: 7.5, ornament: 1 });
  makePortal({ id: 'garden-inner-gate', name: '御苑内门', x: 0, z: 292, width: 28, depth: 12,
    description: '由后寝过渡院通往御花园的门殿。' });

  // Marble thresholds trace the spine; cross-lanes meet the two side connectors.
  addPavedPath('inner-entry-walk', 0, 85.8, 9, 5.6);
  addPavedPath('inner-first-threshold', 0, 106, 8, 12);
  addPavedPath('inner-middle-threshold-s', 0, 145, 8, 8);
  addPavedPath('inner-middle-threshold-n', 0, 153, 8, 8);
  addPavedPath('inner-middle-cross-west', -85, 184, 30, 6, kit.materials.marble);
  addPavedPath('inner-middle-cross-east', 85, 184, 30, 6, kit.materials.marble);
  addPavedPath('inner-north-threshold-s', 0, 215, 8, 8);
  addPavedPath('inner-north-threshold-n', 0, 223, 8, 8);
  addPavedPath('inner-garden-walk', 0, 292, 8, 12);

  // The ceremonial halls are solid except for the designated bedchamber.
  // Paired narrow walks pass their actual plinths, then rejoin each gate;
  // an axial stripe alone would have sent visitors into a blocked main hall.
  for (const court of [
    { key: 'south', x: 24.5, first: 108, last: 138 },
    { key: 'middle', x: 26.5, first: 162, last: 207 },
    { key: 'north', x: 25, first: 232, last: 278 }
  ]) {
    for (const side of [-1, 1]) {
      addPavedPath(`inner-${court.key}-bypass-${side}`, side * court.x,
        (court.first + court.last) / 2, 2.8, court.last - court.first);
    }
    addPavedPath(`inner-${court.key}-south-cross`, 0, court.first,
      court.x * 2 + 2.8, 2.6);
    addPavedPath(`inner-${court.key}-north-cross`, 0, court.last,
      court.x * 2 + 2.8, 2.6);
  }

  // Shared kit landscaping and lights keep foliage, stone and lanterns consistent.
  for (const [x, z, scale, kind] of [
    [-56, 104, 0.82, 'pine'], [56, 104, 0.82, 'pine'],
    [-58, 197, 0.76, 'broadleaf'], [58, 197, 0.76, 'broadleaf'],
    [-57, 266, 0.9, 'pine'], [57, 266, 0.9, 'pine']
  ]) addGeneratedProp(kit.makeTree({ x, z, scale, kind }));
  for (const [x, z] of [
    [-17, 115], [17, 115], [-17, 184], [17, 184], [-17, 255], [17, 255],
    [-88, 184], [88, 184], [0, 286]
  ]) addGeneratedProp(kit.makeLamp({ x, z }));

  const connectorKeys = ['forecourtInner', 'innerGarden', 'westNorth', 'eastNorth'];
  const connectors = connectorKeys.map((key) => {
    const connector = CONNECTORS[key];
    return {
      id: connector.id,
      position: [...connector.position],
      width: connector.width,
      targetZone: connector.targetZone
    };
  });

  batchOwnedMeshes(root, 'inner-paving');

  return {
    root,
    buildings: zone.buildings,
    courtyards: zone.courtyards,
    connectors,
    colliders: zone.colliders,
    update(_dtSeconds, _elapsedSeconds, _state) {
      // The precinct's current props are static; retain the common zone contract.
    },
    dispose() {
      root.clear();
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.clear();
      for (const material of ownedMaterials) material.dispose();
      ownedMaterials.clear();
    }
  };
}
