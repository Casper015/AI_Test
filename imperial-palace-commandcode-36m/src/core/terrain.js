import { CITY } from '../shared/config.js';

export function createTerrain({ THREE, config, kit }) {
  const M = kit.materials;
  const g = new THREE.Group();
  g.name = 'stage-terrain';
  const hx = CITY.halfX, hz = CITY.halfZ;
  const ground = kit.boxAt(hx * 2, 0.6, hz * 2, 0, -0.3, 0, M.paving);
  g.add(ground);
  const mw = CITY.moatW;
  const bands = [
    { w: 2400, d: 1600 - hz - mw, x: 0, z: -(hz + mw + (1600 - hz - mw) / 2) },
    { w: 2400, d: 1600 - hz - mw, x: 0, z: hz + mw + (1600 - hz - mw) / 2 },
    { w: 1220 - hx - mw, d: 990, x: -(hx + mw + (1220 - hx - mw) / 2), z: 0 },
    { w: 1220 - hx - mw, d: 990, x: hx + mw + (1220 - hx - mw) / 2, z: 0 }
  ];
  for (const b of bands) {
    g.add(kit.boxAt(b.w, 0.5, b.d, b.x, -0.75, b.z, M.grass));
  }
  const moatFloor = [[mw, 990, -(hx + mw / 2), 0], [mw, 990, hx + mw / 2, 0], [2 * (hx + mw), mw, 0, -(hz + mw / 2)], [2 * (hx + mw), mw, 0, hz + mw / 2]];
  for (const [w, d, x, z] of moatFloor) {
    g.add(kit.boxAt(w, 0.6, d, x, -3.3, z, M.stoneSide));
  }
  const waterBands = [[mw - 4, 990, -(hx + mw / 2), 0], [mw - 4, 990, hx + mw / 2, 0], [2 * (hx + mw) + 4, mw - 4, 0, -(hz + mw / 2)], [2 * (hx + mw) + 4, mw - 4, 0, hz + mw / 2]];
  for (const [w, d, x, z] of waterBands) {
    const water = kit.boxAt(w, 0.4, d, x, -1.8, z, M.water);
    water.receiveShadow = true;
    g.add(water);
  }
  const banks = [];
  const bankH = 1.6;
  for (const s of [-1, 1]) {
    banks.push({ w: 1.6, d: 990, x: s * (hx + 0.8), z: 0 });
    banks.push({ w: 1.6, d: 990, x: s * (hx + mw - 0.8), z: 0 });
    banks.push({ w: 2 * (hx + mw) + 3, d: 1.6, x: 0, z: s * (hz + 0.8) });
    banks.push({ w: 2 * (hx + mw) + 3, d: 1.6, x: 0, z: s * (hz + mw - 0.8) });
  }
  for (const b of banks) {
    g.add(kit.boxAt(b.w, bankH, b.d, b.x, -0.8 + bankH / 2, b.z, M.stoneDark));
  }
  return g;
}
