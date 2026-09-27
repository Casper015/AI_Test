import * as THREE from 'three';
import { CONFIG } from '../shared/config.js';
import { BUILDINGS, COURTYARDS, CONNECTORS } from './catalog.js';
import { createArchitectureKit } from '../kit/architecture.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function staticBox(root, name, position, size, material, receiveShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

export function createPalace() {
  const root = new THREE.Group();
  root.name = '紫禁天朝 · 宫城总图';
  const kit = createArchitectureKit(root, CONFIG.colors);
  const random = seededRandom(CONFIG.seed);
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: CONFIG.colors.water,
    roughness: 0.2,
    metalness: 0.32,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
    transparent: true,
    opacity: 0.91,
  });
  const terrainMaterial = new THREE.MeshStandardMaterial({ color: 0x59674e, roughness: 0.98 });
  const cityStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x8f8b81, roughness: 0.96 });
  const gardenFloorMaterial = new THREE.MeshStandardMaterial({ color: 0x62704f, roughness: 0.98 });
  const riverShimmer = new THREE.MeshBasicMaterial({ color: 0x9ebcba, transparent: true, opacity: 0.14 });

  staticBox(root, 'outer-terrain', [0, -8, 0], [1120, 4, 1320], terrainMaterial, false);
  staticBox(root, 'palace-foundation', [0, -3.1, 0], [594, 2, 850], cityStoneMaterial);
  staticBox(root, 'courtyard-paving', [0, -1.92, -40], [498, 0.3, 730], kit.materials.paving);
  staticBox(root, 'central-ceremonial-axis', [0, -1.68, -38], [142, 0.18, 680], kit.materials.pavingLight);
  staticBox(root, 'garden-green', [0, -1.75, 346], [332, 0.32, 112], gardenFloorMaterial);

  // The moat is a continuous four-sided water ring. Four broad stone bridges align to the city gates.
  staticBox(root, 'moat-west', [-308, -1.8, 0], [25, 1.2, 900], waterMaterial, false);
  staticBox(root, 'moat-east', [308, -1.8, 0], [25, 1.2, 900], waterMaterial, false);
  staticBox(root, 'moat-south', [0, -1.8, -438], [642, 1.2, 25], waterMaterial, false);
  staticBox(root, 'moat-north', [0, -1.8, 438], [642, 1.2, 25], waterMaterial, false);
  staticBox(root, 'bridge-south', [0, -0.75, -438], [48, 1.3, 54], kit.materials.stone);
  staticBox(root, 'bridge-north', [0, -0.75, 438], [42, 1.3, 54], kit.materials.stone);
  staticBox(root, 'bridge-west', [-308, -0.75, 0], [54, 1.3, 34], kit.materials.stone);
  staticBox(root, 'bridge-east', [308, -0.75, 0], [54, 1.3, 34], kit.materials.stone);
  for (let index = -4; index <= 4; index += 1) {
    staticBox(root, `moat-sheen-s-${index}`, [index * 57, -1.13, -438 + Math.sin(index) * 5], [28, 0.035, 0.35], riverShimmer, false);
    staticBox(root, `moat-sheen-n-${index}`, [index * 57, -1.13, 438 + Math.cos(index) * 4], [24, 0.035, 0.35], riverShimmer, false);
  }

  // Perimeter wall belongs to this boundary module; breaks are reserved for the four gates.
  const wallHeight = 17;
  const wallZ = 410;
  const wallX = 280;
  const southHalf = (560 - 46) / 2;
  for (const sign of [-1, 1]) {
    const center = sign * (23 + southHalf / 2);
    kit.addWallSegment(center, -wallZ, southHalf, 5, wallHeight);
    kit.addWallSegment(center, wallZ, southHalf, 5, wallHeight);
    for (let x = -275; x <= 275; x += 9) {
      if (Math.abs(x) < 29) continue;
      kit.addBox([x, wallHeight + 1.8, sign * wallZ], [2.7, 3.6, 6.2], kit.materials.red, null, 'crenellation');
    }
  }
  const sideHalf = (820 - 42) / 2;
  for (const sign of [-1, 1]) {
    const center = sign * (21 + sideHalf / 2);
    kit.addWallSegment(sign * wallX, center, 5, sideHalf, wallHeight);
    for (let z = -405; z <= 405; z += 9) {
      if (Math.abs(z) < 26) continue;
      kit.addBox([sign * wallX, wallHeight + 1.8, z], [6.2, 3.6, 2.7], kit.materials.red, null, 'crenellation');
    }
  }

  // Courtyard cells establish the 16-court rhythm without closing the main axial gates.
  for (const court of COURTYARDS) kit.addCourtWalls(court);
  for (const building of BUILDINGS) kit.createHall(building);

  const treeRows = [
    [-224, -344], [-222, -210], [-228, -65], [-228, 83],
    [224, -344], [222, -210], [228, -65], [228, 83],
    [-125, 325], [-95, 306], [-60, 312], [60, 312], [95, 306], [125, 325],
    [-140, 382], [-112, 392], [140, 382], [112, 392],
  ];
  for (const [x, z] of treeRows) kit.addTree(x, z, 0.76 + random() * 0.38, random() > 0.5 ? kit.materials.garden : kit.materials.gardenLight);

  // Clipped ornamental tree groves, rockwork, and stepping-stone paths in the northern garden.
  for (const [centerX, centerZ, count, spread] of [[-126, 346, 8, 25], [126, 346, 8, 25], [-118, 382, 5, 16], [118, 382, 5, 16]]) {
    for (let index = 0; index < count; index += 1) {
      const x = centerX + (random() - 0.5) * spread;
      const z = centerZ + (random() - 0.5) * spread * 0.85;
      kit.addTree(x, z, 0.56 + random() * 0.35, index % 3 ? kit.materials.garden : kit.materials.gardenLight);
    }
  }
  for (const [x, z, size] of [[-74, 333, 6], [70, 371, 5], [-132, 365, 4], [129, 328, 5], [85, 390, 4], [-91, 391, 4]]) {
    kit.addBox([x, size * 0.34, z], [size * 1.8, size * 0.8, size], kit.materials.stone, null, 'rockery');
  }
  const stepping = [
    [-135, 339], [-112, 337], [-90, 342], [-69, 350], [-49, 356], [-25, 358], [0, 355],
    [25, 350], [48, 346], [72, 343], [96, 347], [119, 355], [139, 366],
  ];
  stepping.forEach(([x, z], index) => kit.addBox([x, -1.43, z], [10 + (index % 3) * 2, 0.18, 5.2], index % 2 ? kit.materials.paving : kit.materials.stone, null, 'garden-path', [0, 0.08 * (index % 2), 0]));

  const lanternZ = [-354, -306, -244, -159, -88, -1, 89, 180, 285];
  for (const z of lanternZ) {
    kit.addLantern(-89, z, z > 270 ? 0.72 : 0.82);
    kit.addLantern(89, z, z > 270 ? 0.72 : 0.82);
  }
  for (const x of [-228, 228]) {
    for (const z of [-230, -118, -7, 104]) kit.addLantern(x, z, 0.62);
  }

  const sceneData = kit.finalize();
  const registry = new Map(BUILDINGS.map((building) => [building.id, building]));
  const courtyardsByZone = Object.groupBy ? Object.groupBy(COURTYARDS, (court) => court.zone) : COURTYARDS.reduce((all, court) => {
    (all[court.zone] ||= []).push(court);
    return all;
  }, {});

  return {
    root,
    buildings: BUILDINGS,
    registry,
    courtyards: COURTYARDS,
    courtyardsByZone,
    connectors: CONNECTORS,
    pickableMeshes: sceneData.pickableMeshes,
    roofInstances: sceneData.roofInstances,
    materials: sceneData.materials,
    stats: {
      buildings: BUILDINGS.length,
      courtyards: COURTYARDS.length,
      zones: [...new Set(BUILDINGS.map(({ zone }) => zone))],
      instances: [...root.children].filter((child) => child.isInstancedMesh).reduce((sum, child) => sum + child.count, 0),
    },
  };
}
