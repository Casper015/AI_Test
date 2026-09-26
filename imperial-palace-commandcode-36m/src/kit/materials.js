export function createMaterials(THREE, PALETTE) {
  const cache = new Map();
  function std(color, opts = {}) {
    const key = color + '|' + JSON.stringify(opts);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.02, ...opts });
    cache.set(key, m);
    return m;
  }
  const M = {
    roofGold: std(PALETTE.roofGold, { roughness: 0.42, metalness: 0.12 }),
    roofGoldDark: std(PALETTE.roofGoldDark, { roughness: 0.48, metalness: 0.1 }),
    roofUnderside: std(PALETTE.wallRedDark, { roughness: 0.86 }),
    ridge: std(PALETTE.ridge, { roughness: 0.28, metalness: 0.7 }),
    wallRed: std(PALETTE.wallRed, { roughness: 0.88 }),
    wallRedDark: std(PALETTE.wallRedDark, { roughness: 0.9 }),
    stone: std(PALETTE.stone, { roughness: 0.75 }),
    stoneDark: std(PALETTE.stoneDark, { roughness: 0.78 }),
    stoneSide: std(PALETTE.stoneSide, { roughness: 0.8 }),
    paving: std(PALETTE.paving, { roughness: 0.92 }),
    pavingWarm: std(PALETTE.pavingWarm, { roughness: 0.9 }),
    goldFloor: std(PALETTE.goldFloor, { roughness: 0.55 }),
    caihuaGreen: std(PALETTE.caihuaGreen, { roughness: 0.7 }),
    caihuaBlue: std(PALETTE.caihuaBlue, { roughness: 0.7 }),
    caihuaWhite: std(PALETTE.caihuaWhite, { roughness: 0.7 }),
    wood: std(PALETTE.wood, { roughness: 0.85 }),
    woodDark: std(PALETTE.woodDark, { roughness: 0.88 }),
    dark: std(PALETTE.dark, { roughness: 0.95 }),
    innerWall: std(PALETTE.wallRedDark, { roughness: 0.92, side: 2 }),
    water: std(PALETTE.water, { roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.94 }),
    treeA: std(PALETTE.treeA, { roughness: 0.92 }),
    treeB: std(PALETTE.treeB, { roughness: 0.92 }),
    trunk: std(PALETTE.trunk, { roughness: 0.95 }),
    grass: std(PALETTE.grass, { roughness: 0.95 }),
    rock: std(PALETTE.rock, { roughness: 0.9 }),
    bronze: std(PALETTE.bronze, { roughness: 0.4, metalness: 0.55 }),
    lanternRed: std(0xc0392b, { roughness: 0.6, emissive: 0x5a1208, emissiveIntensity: 1 }),
    plaque: std(PALETTE.goldTrim, { roughness: 0.35, metalness: 0.5, emissive: 0x4a3208, emissiveIntensity: 0.6 })
  };
  return M;
}
