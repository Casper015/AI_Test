/**
 * 紫禁天朝 · 实例化装配（A 资源与建筑库）
 * 按 分区 → 构件 → 材质 聚类，重复建筑合并为 InstancedMesh，保证 Draw Call 预算。
 */

import * as THREE from 'three';
import { ARCH_SIZES, archetypeGeometry, makeCorridorGeometry, makeTreeGeometry, makeRockGeometry, makeMonumentGeometry, makeLanternGeometry, makeBridgeGeometry, makeTerraceGeometry, makeStairsGeometry, makeSlab, merge } from './kit.js';

export const MAT_OF_KEY = {
  wall: 'wallRed', col: 'woodRed', roof: 'roofGold', ridge: 'ridge', gold: 'goldMetal',
  paint: 'painting', bracket: 'bracket', door: 'door', lattice: 'lattice', marble: 'marble',
  gable: 'wallRed', rail: 'marble', base: 'marble', bronze: 'bronze', stone: 'pavingLight'
};

export function pickableOfCategory(category) {
  return category !== 'pavilionSmall';
}

export function buildArchitecture(THREE_, zone, buildings, materials, quality, onMesh) {
  const decor = quality.decor !== false;
  const cached = new Map();
  const groups = new Map();
  for (const b of buildings) {
    const size = ARCH_SIZES[b.archetype];
    if (!size) continue;
    if (!cached.has(b.archetype)) cached.set(b.archetype, archetypeGeometry(b.archetype, materials, decor));
    const geoMap = cached.get(b.archetype);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (b.rot || 0) * Math.PI / 180);
    const scale = new THREE.Vector3(b.w / size.w, b.h / size.h, b.d / size.d);
    const pos = new THREE.Vector3(b.x, b.base, b.z);
    m.compose(pos, q, scale);
    for (const key of Object.keys(geoMap)) {
      const gk = b.archetype + '|' + key;
      if (!groups.has(gk)) groups.set(gk, { archetype: b.archetype, key, matKey: MAT_OF_KEY[key] || 'wallRed', items: [] });
      groups.get(gk).items.push({ matrix: m.clone(), id: b.id, tint: b });
    }
  }
  const meshes = [];
  for (const grp of groups.values()) {
    const geo = cached.get(grp.archetype)[grp.key];
    const mat = materials[grp.matKey] || materials.wallRed;
    const im = new THREE.InstancedMesh(geo, mat, grp.items.length);
    im.name = zone + '-' + grp.archetype + '-' + grp.key;
    const ids = [];
    const col = new THREE.Color();
    for (let i = 0; i < grp.items.length; i++) {
      im.setMatrixAt(i, grp.items[i].matrix);
      ids.push(grp.items[i].id);
      const t = grp.items[i].tint;
      const h = (t.id.length * 37 + t.x * 0.7 + t.z * 1.3) % 100 / 100;
      const k = 0.93 + h * 0.14;
      if (grp.matKey === 'roofGold' || grp.matKey === 'roofDeep') col.setRGB(k, k * (0.97 + h * 0.06), k * 0.92);
      else col.setRGB(k, k, k);
      im.setColorAt(i, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = quality.shadow > 0 && (zone === 'B' || zone === 'C' || zone === 'F') && grp.matKey !== 'lattice';
    im.receiveShadow = true;
    im.userData.instances = ids;
    im.userData.pickable = true;
    im.computeBoundingSphere();
    meshes.push(im);
    if (onMesh) onMesh(im);
  }
  return meshes;
}

export function buildDecoration(zone, scope, materials, quality, layout) {
  const root = new THREE.Group();
  root.name = zone + '-decor';
  const decor = quality.decor !== false;

  const terraceGeos = [], railGeos = [], stairGeos = [];
  for (const id of scope.terraces) {
    const t = layout.terraces.find(x => x.id === id);
    if (!t) continue;
    const g = makeTerraceGeometry(t);
    if (g.base) terraceGeos.push(g.base);
    if (g.rail && t.railing && decor) railGeos.push(g.rail);
  }
  for (const id of scope.stairs) {
    const s = layout.stairs.find(x => x.id === id);
    if (!s) continue;
    const g = makeStairsGeometry(s);
    if (g) stairGeos.push(g);
  }
  const marbleFull = merge(terraceGeos.concat(stairGeos));
  const castDecor = quality.shadow > 0 && (zone === 'B' || zone === 'C');
  if (marbleFull) {
    const mesh = new THREE.Mesh(marbleFull, materials.marble);
    mesh.name = zone + '-terrace';
    mesh.castShadow = castDecor;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const railFull = merge(railGeos);
  if (railFull) {
    const mesh = new THREE.Mesh(railFull, materials.marble);
    mesh.name = zone + '-railing';
    mesh.castShadow = false;
    root.add(mesh);
  }

  const wallGroups = { high: [], low: [], col: [], roof: [], paint: [], bracket: [] };
  for (const id of scope.walls) {
    const w = layout.walls.find(x => x.id === id);
    if (!w) continue;
    const len = Math.max(w.x1 - w.x0, w.z1 - w.z0);
    const thick = Math.min(w.x1 - w.x0, w.z1 - w.z0);
    const alongX = (w.x1 - w.x0) >= (w.z1 - w.z0);
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    const isOuter = w.kind === 'outer';
    const H = isOuter ? 12 : w.h;
    const g = merge([
      boxGeoLocal(len, 1.0, thick + 0.5, 2.2, 0, 0.5, 0),
      boxGeoLocal(len, Math.max(0.5, H - 1), thick, 6, 0, 1 + (H - 1) / 2, 0),
      boxGeoLocal(len + 0.7, 0.34, thick + 0.9, 2.4, 0, H + 0.17, 0),
      boxGeoLocal(len + 0.3, 0.5, thick + 0.2, 3, 0, H + 0.55, 0)
    ]);
    const m = new THREE.Matrix4();
    const rot = alongX ? 0 : Math.PI / 2;
    m.compose(new THREE.Vector3(cx, w.y || 0, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
    const gm = new THREE.Matrix4().makeTranslation(0, 0, 0);
    g.applyMatrix4(gm);
    wallGroups.high.push({ geo: g, m });
  }
  if (wallGroups.high.length) {
    const geo = merge(wallGroups.high.map(x => x.geo.clone().applyMatrix4(x.m)));
    const mesh = new THREE.Mesh(geo, materials.wallRed);
    mesh.name = zone + '-walls';
    mesh.castShadow = quality.shadow > 0 && (zone === 'B' || zone === 'C' || zone === 'F');
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  const corridorCol = [], corridorRoof = [], corridorOther = [];
  for (const id of scope.corridors) {
    const c = layout.corridors.find(x => x.id === id);
    if (!c) continue;
    const g = makeCorridorGeometry(c, decor);
    if (g.col) corridorCol.push(merge(g.col));
    if (g.roof) corridorRoof.push(merge(g.roof));
    const other = merge([].concat(g.floor || [], g.paint || [], g.bracket || []));
    if (other) corridorOther.push(other);
  }
  const addMesh = (geos, mat, name, cast) => {
    const g = merge(geos);
    if (!g) return;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = zone + '-' + name;
    mesh.castShadow = cast === undefined ? quality.shadow > 0 : cast;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  addMesh(corridorCol, materials.woodRed, 'corridor-col', false);
  addMesh(corridorRoof, materials.roofGold, 'corridor-roof', quality.shadow > 0 && (zone === 'B' || zone === 'F'));
  addMesh(corridorOther, materials.painting, 'corridor-trim', false);

  const list = {};
  for (const t of layout.trees) {
    if (t.zone !== zone) continue;
    const kind = t.kind === 'blossom' ? 'blossom' : (t.variant === 1 ? 'pineB' : 'pine');
    list[kind] = list[kind] || [];
    list[kind].push(t);
  }
  for (const kind of Object.keys(list)) {
    const arr = list[kind];
    const parts = makeTreeGeometry(kind === 'blossom' ? 'blossom' : 'pine', kind === 'pineB' ? 1 : 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    if (parts.trunk) {
      const im = new THREE.InstancedMesh(parts.trunk, materials.trunk, arr.length);
      for (let i = 0; i < arr.length; i++) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), arr[i].rot);
        s.setScalar(arr[i].scale);
        m.compose(new THREE.Vector3(arr[i].x, 0, arr[i].z), q, s);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false;
      im.name = zone + '-tree-trunk-' + kind;
      root.add(im);
    }
    const fol = parts.foliage && parts.foliage.attributes && parts.foliage.attributes.position.count ? parts.foliage : null;
    const blo = parts.blossom;
    if (fol) {
      const im = new THREE.InstancedMesh(fol, materials.pine, arr.length);
      for (let i = 0; i < arr.length; i++) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), arr[i].rot);
        s.setScalar(arr[i].scale);
        m.compose(new THREE.Vector3(arr[i].x, 0, arr[i].z), q, s);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false;
      im.name = zone + '-tree-leaf-' + kind;
      root.add(im);
    }
    if (blo) {
      const im = new THREE.InstancedMesh(blo, materials.blossom, arr.length);
      for (let i = 0; i < arr.length; i++) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), arr[i].rot);
        s.setScalar(arr[i].scale);
        m.compose(new THREE.Vector3(arr[i].x, 0, arr[i].z), q, s);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false;
      im.name = zone + '-tree-blossom-' + kind;
      root.add(im);
    }
  }

  const rockList = layout.rocks.filter(r => r.zone === zone);
  if (rockList.length) {
    const g = merge(rockList.map(r => makeRockGeometry(r.seed, r.r, r.h).translate(r.x, 0, r.z)));
    const mesh = new THREE.Mesh(g, materials.rock);
    mesh.name = zone + '-rocks';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  const monList = layout.monuments.filter(m => m.zone === zone);
  if (monList.length) {
    const mg = [], bg = [];
    for (const mon of monList) {
      const parts = makeMonumentGeometry(mon.kind, mon.h, mon.r);
      if (parts.marble) mg.push(parts.marble.clone().translate(mon.x, 0, mon.z));
      if (parts.bronze) bg.push(parts.bronze.clone().translate(mon.x, 0, mon.z));
    }
    const mm = merge(mg);
    if (mm) { const mesh = new THREE.Mesh(mm, materials.marble); mesh.name = zone + '-mon-marble'; mesh.castShadow = false; root.add(mesh); }
    const bm = merge(bg);
    if (bm) { const mesh = new THREE.Mesh(bm, materials.bronze); mesh.name = zone + '-mon-bronze'; mesh.castShadow = castDecor; root.add(mesh); }
  }

  const lampList = layout.lanterns.filter(l => l.zone === zone);
  if (lampList.length) {
    const kinds = {};
    for (const l of lampList) { kinds[l.kind] = kinds[l.kind] || []; kinds[l.kind].push(l); }
    for (const kind of Object.keys(kinds)) {
      const arr = kinds[kind];
      const parts = makeLanternGeometry(kind, 1);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      const put = (geo, mat, nm) => {
        if (!geo) return;
        const im = new THREE.InstancedMesh(geo, mat, arr.length);
        for (let i = 0; i < arr.length; i++) {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
          s.setScalar(arr[i].scale);
          m.compose(new THREE.Vector3(arr[i].x, arr[i].y, arr[i].z), q, s);
          im.setMatrixAt(i, m);
        }
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = false;
        im.name = zone + '-lamp-' + kind + '-' + nm;
        root.add(im);
      };
      put(parts.post, materials.woodDark, 'post');
      put(parts.body, materials.lanternRed, 'body');
      put(parts.glow, materials.lanternGlow, 'glow');
    }
  }

  return root;
}

function boxGeoLocal(w, h, d, tile, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / tile, uv.getY(i) * h / tile);
  g.translate(x, y, z);
  return g;
}

export function buildWaterAndPaths(zone, scope, materials, layout, quality) {
  const root = new THREE.Group();
  root.name = zone + '-ground';
  const pathGroups = { paving: [], pavingLight: [], gravel: [], carpet: [], soil: [] };
  for (const id of scope.paths) {
    const p = layout.paths.find(x => x.id === id);
    if (!p) continue;
    const key = p.style === 'paving' ? 'paving' : (p.style === 'gravel' ? 'gravel' : (p.style === 'carpet' ? 'carpet' : 'soil'));
    pathGroups[key].push(makeSlab(p.x1 - p.x0, p.z1 - p.z0, p.y, 0.12, 3, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2));
  }
  for (const key of Object.keys(pathGroups)) {
    const g = merge(pathGroups[key]);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, materials[key] || materials.paving);
    mesh.name = zone + '-path-' + key;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const waterGeos = [];
  for (const id of scope.waters) {
    const w = layout.waters.find(x => x.id === id);
    if (!w) continue;
    if (w.kind === 'deck') continue;
    waterGeos.push(planeGeoLocal(w.x1 - w.x0, w.z1 - w.z0, 12, (w.x0 + w.x1) / 2, w.y, (w.z0 + w.z1) / 2));
  }
  if (waterGeos.length) {
    const g = merge(waterGeos);
    const mesh = new THREE.Mesh(g, materials.water);
    mesh.name = zone + '-water';
    mesh.receiveShadow = false;
    root.add(mesh);
  }
  const bridgeParts = { deck: [], rail: [] };
  for (const id of scope.bridges) {
    const b = layout.bridges.find(x => x.id === id);
    if (!b) continue;
    const parts = makeBridgeGeometry(b);
    if (parts.deck) bridgeParts.deck.push(merge(parts.deck));
    if (parts.rail) bridgeParts.rail.push(merge(parts.rail));
  }
  const deckG = merge(bridgeParts.deck.concat(bridgeParts.rail));
  if (deckG) {
    const mesh = new THREE.Mesh(deckG, materials.marble);
    mesh.name = zone + '-bridge';
    mesh.castShadow = !!quality && quality.shadow > 0 && (zone === 'B' || zone === 'C');
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

function planeGeoLocal(w, d, tile, x, y, z) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
