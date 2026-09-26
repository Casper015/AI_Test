import { CITY } from '../shared/config.js';

export function createTerrain({ THREE, config, kit }) {
  const M = kit.materials;
  const g = new THREE.Group();
  g.name = 'stage-terrain';
  const hx = CITY.halfX;
  const hz = CITY.halfZ;
  const mw = CITY.moatW;

  function slab(w, h, d, x, y, z, material, cast = false) {
    const m = kit.boxAt(w, h, d, x, y, z, material);
    m.receiveShadow = true;
    m.castShadow = cast;
    g.add(m);
    return m;
  }

  slab(hx * 2, 0.6, hz * 2, 0, -0.3, 0, M.paving);
  const benchW = 1200;
  const benchD = 1600;
  const outerW = benchW - hx - mw;
  const outerD = benchD - hz - mw;
  slab(benchW * 2, 0.5, outerD, 0, -0.75, -(hz + mw + outerD / 2), M.grass);
  slab(benchW * 2, 0.5, outerD, 0, -0.75, hz + mw + outerD / 2, M.grass);
  slab(outerW, 0.5, 990, -(hx + mw + outerW / 2), -0.75, 0, M.grass);
  slab(outerW, 0.5, 990, hx + mw + outerW / 2, -0.75, 0, M.grass);

  slab(mw, 0.6, 990, -(hx + mw / 2), -3.3, 0, M.stoneSide);
  slab(mw, 0.6, 990, hx + mw / 2, -3.3, 0, M.stoneSide);
  slab(2 * (hx + mw), 0.6, mw, 0, -3.3, -(hz + mw / 2), M.stoneSide);
  slab(2 * (hx + mw), 0.6, mw, 0, -3.3, hz + mw / 2, M.stoneSide);

  slab(mw - 4, 0.4, 990, -(hx + mw / 2), -1.8, 0, M.water);
  slab(mw - 4, 0.4, 990, hx + mw / 2, -1.8, 0, M.water);
  slab(2 * (hx + mw) + 4, 0.4, mw - 4, 0, -1.8, -(hz + mw / 2), M.water);
  slab(2 * (hx + mw) + 4, 0.4, mw - 4, 0, -1.8, hz + mw / 2, M.water);

  const bankH = 1.6;
  for (const s of [-1, 1]) {
    slab(1.6, bankH, 990, s * (hx + 0.8), -0.8 + bankH / 2, 0, M.stoneDark, true);
    slab(1.6, bankH, 990, s * (hx + mw - 0.8), -0.8 + bankH / 2, 0, M.stoneDark, true);
    slab(2 * (hx + mw) + 3, bankH, 1.6, 0, -0.8 + bankH / 2, s * (hz + 0.8), M.stoneDark, true);
    slab(2 * (hx + mw) + 3, bankH, 1.6, 0, -0.8 + bankH / 2, s * (hz + mw - 0.8), M.stoneDark, true);
  }
  return g;
}
