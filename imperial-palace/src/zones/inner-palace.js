import { CONNECTORS } from '../shared/layout.js';

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
  const zone = { root, buildings: [], courtyards: [] };
  const ownedGeometries = new Set();

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

    // The gates line up through all three courts and open onto the side lanes.
    root.add(wall([x0, z0], [x1, z0], gateWidth));
    root.add(wall([x1, z1], [x0, z1], gateWidth));
    root.add(wall([x0, z1], [x0, z0], sideGateWidth));
    root.add(wall([x1, z0], [x1, z1], sideGateWidth));
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

  function hollowGate(built, spec) {
    // Keep the kit plinth, roof, stairs and shared materials, but open its solid
    // body so the registered gate is a traversable portal rather than a blocker.
    const body = built.group.children.find((child) => {
      const p = child.geometry?.parameters;
      return child.isMesh && p?.width === spec.width && p?.depth === spec.depth &&
        child.position.x === 0 && child.position.z === 0;
    });
    if (body) body.visible = false;

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
  }

  function makePortal(spec) {
    const gateSpec = {
      kind: 'gate',
      height: 11,
      tiers: 1,
      ornament: 1,
      openFront: false,
      access: '外观可览',
      description: '连接内廷院落的敞开式门殿。',
      ...spec
    };
    const built = addBuilding(gateSpec);
    hollowGate(built, gateSpec);
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
    // Replace only the kit's full-volume wall block with a cutaway room; the
    // standard foundation, roof and stairs remain, and all finishes use kit mats.
    const body = built.group.children.find((child) => {
      const p = child.geometry?.parameters;
      return child.isMesh && p?.width === spec.width && p?.depth === spec.depth &&
        child.position.x === 0 && child.position.z === 0;
    });
    if (body) body.visible = false;

    const foundation = Math.max(1.25, spec.height * 0.14);
    const wallHeight = 5.1;
    const wallY = foundation + wallHeight / 2;
    const sideX = spec.width / 2 - 0.45;
    const rearZ = spec.depth / 2 - 0.45;
    addOwnedBox(built.group, built.record.id, 0.9, wallHeight, spec.depth - 0.9,
      kit.materials.lacquer, -sideX, wallY, 0);
    addOwnedBox(built.group, built.record.id, 0.9, wallHeight, spec.depth - 0.9,
      kit.materials.lacquer, sideX, wallY, 0);
    addOwnedBox(built.group, built.record.id, spec.width - 0.9, wallHeight, 0.9,
      kit.materials.wall, 0, wallY, rearZ);
    addOwnedBox(built.group, built.record.id, spec.width - 2.4, 0.22, spec.depth - 2.4,
      kit.materials.dark, 0, foundation + 0.14, 0);

    // Four lacquer columns frame the open south-facing entrance and room.
    const columnHeight = Math.min(wallHeight + 0.7, 5.7);
    for (const px of [-sideX, sideX]) {
      for (const pz of [-spec.depth / 2 + 1.1, rearZ]) {
        addOwnedBox(built.group, built.record.id, 0.72, columnHeight, 0.72,
          kit.materials.vermilion || kit.materials.wall, px, foundation + columnHeight / 2, pz);
        addOwnedBox(built.group, built.record.id, 1.05, 0.28, 1.05,
          kit.materials.gold, px, foundation + columnHeight + 0.12, pz);
      }
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
    addOwnedBox(built.group, built.record.id, 14, 3.5, 0.7, kit.materials.lacquer,
      0, foundation + 2.15, rearZ - 1.4);
    for (const px of [-4.4, -2.2, 0, 2.2, 4.4]) {
      addOwnedBox(built.group, built.record.id, 0.16, 2.55, 0.18, kit.materials.jade,
        px, foundation + 2.2, rearZ - 0.98);
    }
    addOwnedBox(built.group, built.record.id, 14.6, 0.22, 0.28, kit.materials.gold,
      0, foundation + 3.95, rearZ - 0.96);
  }

  // Three successive courts, each with aligned north/south gates and side doors.
  addCourtyard({ id: 'inner-court-south', name: '內廷前院', x: 0, z: 115,
    width: 140, depth: 52, wallHeight: 4.7, gateWidth: 24, sideGateWidth: 14 });
  addCourtyard({ id: 'inner-court-middle', name: '寝宫正院', x: 0, z: 184,
    width: 140, depth: 54, wallHeight: 4.9, gateWidth: 26, sideGateWidth: 16 });
  addCourtyard({ id: 'inner-court-north', name: '后寝花园过渡院', x: 0, z: 255,
    width: 140, depth: 54, wallHeight: 4.5, gateWidth: 28, sideGateWidth: 14 });

  // Main entry, three court-to-court portals, and the garden-facing inner gate.
  makePortal({ id: 'south-inner-gate', name: '内廷门', x: 0, z: 94, width: 26, depth: 12,
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
    width: 42, depth: 24, height: 13, tiers: 1, ornament: 2, openFront: false,
    access: '可入内（寝殿内景）',
    description: '以内廷居住空间为尺度的开敞寝殿，可近看床榻、帷幔与屏风。' };
  const bedBuilt = addBuilding(bedSpec);
  addBedchamberInterior(bedBuilt, bedSpec);
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
  addBuilding({ id: 'north-courtyard-pavilion', name: '后寝庭心亭', kind: 'pavilion', x: 0, z: 238,
    width: 18, depth: 13, height: 8.6, tiers: 1, ornament: 1,
    description: '后寝院落中的小型歇息亭。' });

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

  // Shared kit landscaping and lights keep foliage, stone and lanterns consistent.
  for (const [x, z, scale, kind] of [
    [-56, 104, 0.82, 'pine'], [56, 104, 0.82, 'pine'],
    [-58, 197, 0.76, 'broadleaf'], [58, 197, 0.76, 'broadleaf'],
    [-57, 266, 0.9, 'pine'], [57, 266, 0.9, 'pine']
  ]) root.add(kit.makeTree({ x, z, scale, kind }));
  for (const [x, z] of [
    [-17, 115], [17, 115], [-17, 184], [17, 184], [-17, 255], [17, 255],
    [-88, 184], [88, 184], [0, 286]
  ]) root.add(kit.makeLamp({ x, z }));

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

  return {
    root,
    buildings: zone.buildings,
    courtyards: zone.courtyards,
    connectors,
    update(_dtSeconds, _elapsedSeconds, _state) {
      // The precinct's current props are static; retain the common zone contract.
    },
    dispose() {
      root.clear();
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.clear();
    }
  };
}
