function hex(v) {
  return '#' + v.toString(16).padStart(6, '0');
}

function makeCaihuaTexture(THREE, PALETTE) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = hex(PALETTE.caihuaGreen);
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = hex(PALETTE.caihuaBlue);
  ctx.fillRect(0, 0, 256, 6);
  ctx.fillRect(0, 58, 256, 6);
  ctx.fillStyle = hex(PALETTE.caihuaWhite);
  ctx.fillRect(0, 8, 256, 2);
  ctx.fillRect(0, 54, 256, 2);
  for (let u = 0; u < 4; u++) {
    const ox = u * 64;
    ctx.fillStyle = hex(PALETTE.caihuaBlue);
    ctx.fillRect(ox + 8, 20, 48, 24);
    ctx.fillStyle = hex(PALETTE.caihuaGreen);
    ctx.fillRect(ox + 14, 25, 36, 14);
    ctx.fillStyle = hex(PALETTE.goldTrim);
    ctx.fillRect(ox + 19, 29, 4, 4);
    ctx.fillRect(ox + 41, 29, 4, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

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
  const caihuaTex = makeCaihuaTexture(THREE, PALETTE);
  M.caihuaPainted = caihuaTex
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: caihuaTex, flatShading: true, roughness: 0.7, metalness: 0.02 })
    : M.caihuaGreen;
  return M;
}
