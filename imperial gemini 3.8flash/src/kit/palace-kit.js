import { CONFIG } from '../shared/config.js';

export function createPalaceKit(THREE) {
  const c = CONFIG.colors;

  // Material Palette
  const materials = {
    roof: new THREE.MeshStandardMaterial({ color: c.roofGold, roughness: 0.32, metalness: 0.22 }),
    roofDark: new THREE.MeshStandardMaterial({ color: c.roofShadow, roughness: 0.48, metalness: 0.15 }),
    roofBlack: new THREE.MeshStandardMaterial({ color: c.roofDarkTile, roughness: 0.35, metalness: 0.14 }),
    roofRidge: new THREE.MeshStandardMaterial({ color: c.roofRidge, roughness: 0.28, metalness: 0.35 }),
    wall: new THREE.MeshStandardMaterial({ color: c.vermilion, roughness: 0.78 }),
    wallAlt: new THREE.MeshStandardMaterial({ color: c.wallAlt, roughness: 0.82 }),
    lacquer: new THREE.MeshStandardMaterial({ color: c.darkLacquer, roughness: 0.52 }),
    jade: new THREE.MeshStandardMaterial({ color: c.jade, roughness: 0.68 }),
    jadeLight: new THREE.MeshStandardMaterial({ color: c.jadeLight, roughness: 0.70 }),
    marble: new THREE.MeshStandardMaterial({ color: c.marble, roughness: 0.48 }),
    marbleCarved: new THREE.MeshStandardMaterial({ color: c.marbleCarved, roughness: 0.55 }),
    ground: new THREE.MeshStandardMaterial({ color: c.courtyardStone, roughness: 0.88 }),
    procession: new THREE.MeshStandardMaterial({ color: c.processionStone, roughness: 0.76 }),
    goldBrick: new THREE.MeshStandardMaterial({ color: c.goldBrick, roughness: 0.28, metalness: 0.12 }),
    gold: new THREE.MeshStandardMaterial({ color: c.giltGold, roughness: 0.22, metalness: 0.82 }),
    water: new THREE.MeshStandardMaterial({ color: c.waterMoat, roughness: 0.18, metalness: 0.25 }),
    waterPond: new THREE.MeshStandardMaterial({ color: c.waterPond, roughness: 0.16, metalness: 0.28 }),
    foliagePine: new THREE.MeshStandardMaterial({ color: c.foliagePine, roughness: 0.92 }),
    foliageCypress: new THREE.MeshStandardMaterial({ color: c.foliageCypress, roughness: 0.90 }),
    foliageBlossom: new THREE.MeshStandardMaterial({ color: c.foliageBlossom, roughness: 0.85 }),
    foliageWillow: new THREE.MeshStandardMaterial({ color: c.foliageWillow, roughness: 0.88 }),
    trunk: new THREE.MeshStandardMaterial({ color: c.trunk, roughness: 0.95 }),
    rockery: new THREE.MeshStandardMaterial({ color: c.rockeryStone, roughness: 0.92 }),
    lanternGlow: new THREE.MeshStandardMaterial({ color: c.lanternGlow, emissive: c.lanternGlow, emissiveIntensity: 1.2 }),
    lanternBody: new THREE.MeshStandardMaterial({ color: c.lanternBody, roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2824', roughness: 0.92 })
  };

  const boxGeometryCache = new Map();
  function cachedBox(w, h, d) {
    const key = `${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`;
    if (!boxGeometryCache.has(key)) {
      boxGeometryCache.set(key, new THREE.BoxGeometry(w, h, d));
    }
    return boxGeometryCache.get(key);
  }

  const cylinderGeometryCache = new Map();
  function cachedCylinder(rt, rb, h, segs = 8) {
    const key = `${rt.toFixed(2)}:${rb.toFixed(2)}:${h.toFixed(2)}:${segs}`;
    if (!cylinderGeometryCache.has(key)) {
      cylinderGeometryCache.set(key, new THREE.CylinderGeometry(rt, rb, h, segs));
    }
    return cylinderGeometryCache.get(key);
  }

  // Wudian Roof Geometry (庑殿顶 - 4 slopes with top ridge)
  const roofGeometryCache = new Map();
  function makeHipRoofGeometry(width, depth, height, ridgeRatio = 0.44) {
    const key = `hip:${width.toFixed(1)}:${depth.toFixed(1)}:${height.toFixed(1)}:${ridgeRatio.toFixed(2)}`;
    if (roofGeometryCache.has(key)) return roofGeometryCache.get(key);

    const x = width / 2;
    const z = depth / 2;
    const r = (width * ridgeRatio) / 2;
    const eaveFlare = 0.45; // Subtle Chinese curved eave overhang
    const baseY = 0;

    // Base corners
    const c0 = [-x - eaveFlare, baseY, -z - eaveFlare];
    const c1 = [x + eaveFlare, baseY, -z - eaveFlare];
    const c2 = [x + eaveFlare, baseY, z + eaveFlare];
    const c3 = [-x - eaveFlare, baseY, z + eaveFlare];

    // Ridge endpoints
    const r0 = [-r, height, 0];
    const r1 = [r, height, 0];

    // Build triangular faces with finite vertices
    const triangles = [
      // South slope
      c0, c1, r1,
      c0, r1, r0,
      // North slope
      c2, c3, r0,
      c2, r0, r1,
      // East slope
      c1, c2, r1,
      // West slope
      c3, c0, r0,
      // Bottom closure
      c0, c3, c2,
      c0, c2, c1
    ];

    const positions = triangles.flat();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    roofGeometryCache.set(key, geom);
    return geom;
  }

  // Pyramidal Pointed Roof Geometry (攒尖顶 - 4 slopes meeting at apex)
  function makePyramidRoofGeometry(width, depth, height) {
    const key = `pyr:${width.toFixed(1)}:${depth.toFixed(1)}:${height.toFixed(1)}`;
    if (roofGeometryCache.has(key)) return roofGeometryCache.get(key);

    const x = width / 2 + 0.35;
    const z = depth / 2 + 0.35;
    const c0 = [-x, 0, -z];
    const c1 = [x, 0, -z];
    const c2 = [x, 0, z];
    const c3 = [-x, 0, z];
    const apex = [0, height, 0];

    const triangles = [
      c0, c1, apex,
      c1, c2, apex,
      c2, c3, apex,
      c3, c0, apex,
      c0, c3, c2,
      c0, c2, c1
    ];

    const positions = triangles.flat();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    roofGeometryCache.set(key, geom);
    return geom;
  }

  // Octagonal Roof Geometry (八角攒尖)
  function makeOctagonRoofGeometry(radius, height) {
    const key = `oct:${radius.toFixed(1)}:${height.toFixed(1)}`;
    if (roofGeometryCache.has(key)) return roofGeometryCache.get(key);

    const segs = 8;
    const verts = [];
    const apex = [0, height, 0];
    const basePts = [];

    for (let i = 0; i < segs; i++) {
      const angle = (i * Math.PI * 2) / segs;
      basePts.push([Math.cos(angle) * (radius + 0.4), 0, Math.sin(angle) * (radius + 0.4)]);
    }

    const triangles = [];
    for (let i = 0; i < segs; i++) {
      const p0 = basePts[i];
      const p1 = basePts[(i + 1) % segs];
      triangles.push(p0, p1, apex);
      triangles.push([0, 0, 0], p0, p1);
    }

    const positions = triangles.flat();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    roofGeometryCache.set(key, geom);
    return geom;
  }

  // Helper to add mesh with shadows and userData
  function addMesh(parent, geometry, material, x = 0, y = 0, z = 0, buildingId = '') {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (buildingId) mesh.userData.buildingId = buildingId;
    parent.add(mesh);
    return mesh;
  }

  // Build interior details for Taihe Hall (Jinluan Palace)
  function buildTaiheInterior(group, width, depth, floorY, id) {
    const interiorGroup = new THREE.Group();
    interiorGroup.name = 'Jinluan interior';

    // Golden brick floor (紫禁城特制金砖)
    addMesh(interiorGroup, cachedBox(width - 2, 0.28, depth - 2), materials.goldBrick, 0, floorY + 0.14, 0, id);

    // 3-step imperial dais platform (须弥座宝座地平基台)
    const daisW = Math.min(14, width * 0.34);
    const daisD = Math.min(8.5, depth * 0.26);
    addMesh(interiorGroup, cachedBox(daisW, 0.45, daisD), materials.marble, 0, floorY + 0.36, depth * 0.16, id);
    addMesh(interiorGroup, cachedBox(daisW - 1.2, 0.42, daisD - 1.0), materials.lacquer, 0, floorY + 0.78, depth * 0.16, id);

    // 7-panel carved dragon folding screen (九龙雕花金漆围屏)
    const screenW = Math.min(10, width * 0.24);
    const screenH = 4.2;
    addMesh(interiorGroup, cachedBox(screenW, screenH, 0.38), materials.gold, 0, floorY + 0.78 + screenH / 2, depth * 0.16 + daisD * 0.36, id);
    // Screen wings angled
    const wingW = screenW * 0.32;
    const leftWing = addMesh(interiorGroup, cachedBox(wingW, screenH * 0.92, 0.35), materials.gold, -screenW * 0.52, floorY + 0.78 + (screenH * 0.92) / 2, depth * 0.16 + daisD * 0.32, id);
    leftWing.rotation.y = 0.32;
    const rightWing = addMesh(interiorGroup, cachedBox(wingW, screenH * 0.92, 0.35), materials.gold, screenW * 0.52, floorY + 0.78 + (screenH * 0.92) / 2, depth * 0.16 + daisD * 0.32, id);
    rightWing.rotation.y = -0.32;

    // Imperial Nine-Dragon Throne (九龙金漆宝座)
    const throneW = 3.2;
    const throneD = 2.4;
    const throneH = 1.9;
    addMesh(interiorGroup, cachedBox(throneW, 0.75, throneD), materials.gold, 0, floorY + 0.78 + 0.38, depth * 0.16, id);
    addMesh(interiorGroup, cachedBox(throneW * 0.95, throneH, 0.32), materials.gold, 0, floorY + 0.78 + 0.75 + throneH / 2, depth * 0.16 + 0.85, id);
    // Throne armrests
    addMesh(interiorGroup, cachedBox(0.35, 0.65, throneD * 0.8), materials.gold, -throneW * 0.42, floorY + 0.78 + 0.75 + 0.32, depth * 0.16, id);
    addMesh(interiorGroup, cachedBox(0.35, 0.65, throneD * 0.8), materials.gold, throneW * 0.42, floorY + 0.78 + 0.75 + 0.32, depth * 0.16, id);

    // 6 Gilded Coiled Dragon Pillars (六根沥粉蟠龙金柱)
    const pillarR = 0.65;
    const pillarH = 9.2;
    const pillarXs = [-daisW * 0.68, daisW * 0.68];
    const pillarZs = [depth * 0.16 - 2.5, depth * 0.16 + 1.2, depth * 0.16 + 4.8];
    for (const px of pillarXs) {
      for (const pz of pillarZs) {
        addMesh(interiorGroup, cachedCylinder(pillarR, pillarR, pillarH, 12), materials.gold, px, floorY + pillarH / 2, pz, id);
        // Base ring
        addMesh(interiorGroup, cachedCylinder(pillarR * 1.35, pillarR * 1.5, 0.45, 12), materials.marble, px, floorY + 0.22, pz, id);
      }
    }

    // Imperial Caisson Ceiling (轩辕镜盘龙藻井)
    const zaojingR = Math.min(5.5, width * 0.15);
    const zaojingH = 1.4;
    const zaojingY = floorY + pillarH + 0.6;
    addMesh(interiorGroup, cachedCylinder(zaojingR, zaojingR * 1.2, zaojingH, 8), materials.jade, 0, zaojingY, depth * 0.16, id);
    addMesh(interiorGroup, cachedCylinder(zaojingR * 0.72, zaojingR * 0.9, zaojingH * 0.8, 8), materials.gold, 0, zaojingY + zaojingH * 0.6, depth * 0.16, id);
    // Suspended Xuanyuan sphere (轩辕镜宝珠)
    const sphereGeom = new THREE.SphereGeometry(0.85, 12, 12);
    addMesh(interiorGroup, sphereGeom, materials.gold, 0, zaojingY - 0.4, depth * 0.16, id);

    // Imperial Bronze Cranes, Turtles & Incense Burners (香几、甪端、铜鹤)
    const incenseH = 1.4;
    for (const sign of [-1, 1]) {
      addMesh(interiorGroup, cachedBox(0.9, incenseH, 0.9), materials.dark, sign * (daisW * 0.46), floorY + 0.78 + incenseH / 2, depth * 0.16 - 2.4, id);
      addMesh(interiorGroup, cachedBox(0.7, 0.6, 0.7), materials.gold, sign * (daisW * 0.46), floorY + 0.78 + incenseH + 0.3, depth * 0.16 - 2.4, id);
    }

    group.add(interiorGroup);
  }

  // Build interior details for Kunning / Qianqing bedchamber
  function buildBedchamberInterior(group, width, depth, floorY, id) {
    const bedGroup = new THREE.Group();
    bedGroup.name = 'Bedchamber interior';

    // Dark lacquered wood floor
    addMesh(bedGroup, cachedBox(width - 1.5, 0.25, depth - 1.5), materials.lacquer, 0, floorY + 0.12, 0, id);

    // Carved rosewood partition screen (红木雕花落地罩/隔扇)
    const screenW = width * 0.78;
    addMesh(bedGroup, cachedBox(screenW, 3.8, 0.28), materials.dark, 0, floorY + 1.9, depth * 0.08, id);
    // Doorway opening in screen
    const doorW = 3.2;
    // Canopy Imperial Bed (雕花拔步床榻)
    const bedW = 4.8;
    const bedD = 3.6;
    const bedH = 3.2;
    const bedX = -width * 0.24;
    const bedZ = depth * 0.28;
    addMesh(bedGroup, cachedBox(bedW, 0.65, bedD), materials.lacquer, bedX, floorY + 0.32, bedZ, id);
    // Bed mattress & golden silk quilt
    addMesh(bedGroup, cachedBox(bedW * 0.88, 0.32, bedD * 0.88), materials.roof, bedX, floorY + 0.7, bedZ, id);
    // Canopy posts and top frame
    for (const dx of [-bedW * 0.45, bedW * 0.45]) {
      for (const dz of [-bedD * 0.45, bedD * 0.45]) {
        addMesh(bedGroup, cachedCylinder(0.08, 0.08, bedH, 6), materials.lacquer, bedX + dx, floorY + bedH / 2, bedZ + dz, id);
      }
    }
    addMesh(bedGroup, cachedBox(bedW, 0.24, bedD), materials.gold, bedX, floorY + bedH, bedZ, id);

    // Imperial Calligraphy Desk & Chairs (御案文房)
    const deskX = width * 0.24;
    const deskZ = depth * 0.26;
    addMesh(bedGroup, cachedBox(3.8, 0.95, 1.8), materials.lacquer, deskX, floorY + 0.48, deskZ, id);
    // Scrolls and brush holder on desk
    addMesh(bedGroup, cachedBox(1.2, 0.08, 0.8), materials.marble, deskX, floorY + 0.98, deskZ, id);
    addMesh(bedGroup, cachedCylinder(0.12, 0.12, 0.35, 8), materials.jade, deskX + 1.1, floorY + 1.12, deskZ, id);

    // Warm Palace Lanterns (红木宫灯)
    for (const sign of [-1, 1]) {
      const lx = sign * (width * 0.32);
      const lz = -depth * 0.22;
      addMesh(bedGroup, cachedCylinder(0.08, 0.12, 2.4, 6), materials.lacquer, lx, floorY + 1.2, lz, id);
      addMesh(bedGroup, cachedBox(0.85, 1.1, 0.85), materials.lanternGlow, lx, floorY + 2.5, lz, id);
    }

    group.add(bedGroup);
  }

  // Core Building Factory
  function makeBuilding(spec) {
    const {
      id,
      name,
      kind = 'hall',
      x = 0,
      y = 0,
      z = 0,
      width = 28,
      depth = 18,
      height = 12,
      tiers = 1,
      roofType = 'wudian',
      openFront = false,
      interiorType = 'none',
      ornament = 1,
      access = '外观可览',
      category = '宫殿建筑',
      description = '宫城规制建筑。',
      foundationH: customFoundationH = null
    } = spec;

    const group = new THREE.Group();
    group.name = name || id;
    group.position.set(x, y, z);

    // Foundation (台基)
    const isGate = kind === 'gate';
    const isCorner = kind === 'cornerTower';
    const foundationH = customFoundationH !== null ? customFoundationH : Math.max(1.1, height * (isGate ? 0.22 : 0.14));
    const floorY = foundationH;
    const bodyH = Math.max(3.2, height - foundationH - Math.max(2.6, height * 0.34));
    const plinthW = width + 4.2;
    const plinthD = depth + 3.8;

    // Marble plinth
    addMesh(group, cachedBox(plinthW, foundationH, plinthD), materials.marble, 0, foundationH / 2, 0, id);
    // Balustrade around plinth
    const balustradeH = 0.9;
    const balustradeThick = 0.32;
    // Front balustrade with entrance gap
    const entranceW = openFront ? Math.min(width * 0.42, 9.5) : 4.8;
    const halfFrontRail = (plinthW - entranceW) / 2;
    addMesh(group, cachedBox(halfFrontRail, balustradeH, balustradeThick), materials.marbleCarved, -plinthW / 2 + halfFrontRail / 2, foundationH + balustradeH / 2, -plinthD / 2, id);
    addMesh(group, cachedBox(halfFrontRail, balustradeH, balustradeThick), materials.marbleCarved, plinthW / 2 - halfFrontRail / 2, foundationH + balustradeH / 2, -plinthD / 2, id);
    // Back and side rails
    addMesh(group, cachedBox(plinthW, balustradeH, balustradeThick), materials.marbleCarved, 0, foundationH + balustradeH / 2, plinthD / 2, id);
    addMesh(group, cachedBox(balustradeThick, balustradeH, plinthD), materials.marbleCarved, -plinthW / 2, foundationH + balustradeH / 2, 0, id);
    addMesh(group, cachedBox(balustradeThick, balustradeH, plinthD), materials.marbleCarved, plinthW / 2, foundationH + balustradeH / 2, 0, id);

    // Front Marble Steps (台阶)
    const stepDepth = 3.6;
    const stepCount = 5;
    for (let s = 0; s < stepCount; s++) {
      const sw = entranceW + 1.2;
      const sh = foundationH / stepCount;
      const sd = (stepDepth / stepCount) * (stepCount - s);
      addMesh(group, cachedBox(sw, sh, sd), materials.marble, 0, sh * (s + 0.5), -plinthD / 2 - sd / 2, id);
    }

    // Building body (屋身墙体与廊柱)
    if (openFront) {
      // Lacquered interior floor
      addMesh(group, cachedBox(width - 0.8, 0.28, depth - 0.8), materials.lacquer, 0, floorY + 0.14, 0, id);
      const sideWallThick = Math.max(0.8, width * 0.04);
      // West and East side walls
      addMesh(group, cachedBox(sideWallThick, bodyH, depth), materials.wall, -width / 2 + sideWallThick / 2, floorY + bodyH / 2, 0, id);
      addMesh(group, cachedBox(sideWallThick, bodyH, depth), materials.wall, width / 2 - sideWallThick / 2, floorY + bodyH / 2, 0, id);
      // North back wall
      addMesh(group, cachedBox(width, bodyH, sideWallThick), materials.wall, 0, floorY + bodyH / 2, depth / 2 - sideWallThick / 2, id);

      // Colonnade columns across front and sides
      const colRadius = Math.max(0.32, width / 52);
      const colCount = Math.max(4, Math.floor(width / 5.2));
      for (let i = 0; i <= colCount; i++) {
        const px = -width / 2 + (width * i) / colCount;
        if (Math.abs(px) < entranceW / 2 - 0.5) continue;
        addMesh(group, cachedCylinder(colRadius, colRadius * 1.08, bodyH + 0.4, 10), materials.wallAlt, px, floorY + (bodyH + 0.4) / 2, -depth / 2 + 0.3, id);
      }

      // Check interior decoration
      if (interiorType === 'taihe') {
        buildTaiheInterior(group, width, depth, floorY, id);
      } else if (interiorType === 'bedchamber') {
        buildBedchamberInterior(group, width, depth, floorY, id);
      }
    } else if (isGate) {
      // Gateway arch tunnel through building
      const gateTunnelW = Math.min(8.2, width * 0.38);
      const sidePartW = (width - gateTunnelW) / 2;
      addMesh(group, cachedBox(sidePartW, bodyH, depth), materials.wall, -width / 2 + sidePartW / 2, floorY + bodyH / 2, 0, id);
      addMesh(group, cachedBox(sidePartW, bodyH, depth), materials.wall, width / 2 - sidePartW / 2, floorY + bodyH / 2, 0, id);
      // Arch lintel over tunnel
      const lintelH = Math.max(1.8, bodyH * 0.35);
      addMesh(group, cachedBox(gateTunnelW, lintelH, depth), materials.wall, 0, floorY + bodyH - lintelH / 2, 0, id);
      // Lacquered doors in gate
      addMesh(group, cachedBox(gateTunnelW * 0.48, bodyH - lintelH, 0.4), materials.lacquer, -gateTunnelW * 0.24, floorY + (bodyH - lintelH) / 2, 0, id);
      addMesh(group, cachedBox(gateTunnelW * 0.48, bodyH - lintelH, 0.4), materials.lacquer, gateTunnelW * 0.24, floorY + (bodyH - lintelH) / 2, 0, id);
    } else {
      // Solid hall with vermilion walls
      addMesh(group, cachedBox(width, bodyH, depth), materials.wall, 0, floorY + bodyH / 2, 0, id);
      // Lacquered doors and windows relief on front
      const doorW = Math.min(7.2, width * 0.32);
      addMesh(group, cachedBox(doorW, bodyH * 0.72, 0.35), materials.lacquer, 0, floorY + (bodyH * 0.72) / 2, -depth / 2 - 0.15, id);
      // Colonnade relief pillars
      const colRadius = Math.max(0.28, width / 55);
      const colCount = Math.max(3, Math.floor(width / 6));
      for (let i = 0; i <= colCount; i++) {
        const px = -width / 2 + (width * i) / colCount;
        addMesh(group, cachedCylinder(colRadius, colRadius, bodyH, 8), materials.wallAlt, px, floorY + bodyH / 2, -depth / 2 - 0.12, id);
      }
    }

    // Dougong bracket system (斗栱层)
    const dougongH = 0.85;
    const dougongW = width + 2.2;
    const dougongD = depth + 2.2;
    const dougongY = floorY + bodyH + dougongH / 2;
    addMesh(group, cachedBox(dougongW, dougongH, dougongD), materials.jade, 0, dougongY, 0, id);

    // Roof construction (屋顶构建)
    const roofBaseY = floorY + bodyH + dougongH;
    const roofH = Math.max(3.2, height * 0.36);
    const roofLayers = tiers > 1 ? 2 : 1;
    const roofMaterial = roofType === 'blackTile' ? materials.roofBlack : materials.roof;

    if (roofType === 'cornerTower') {
      // Iconic Forbidden City Corner Tower Roof (角楼复合十字脊顶)
      // Tier 1: Lower skirt eave
      const e1W = width + 6.2;
      const e1D = depth + 6.2;
      addMesh(group, makeHipRoofGeometry(e1W, e1D, roofH * 0.52, 0.4), roofMaterial, 0, roofBaseY, 0, id);

      // Tier 2: Middle hip cross
      const midBaseY = roofBaseY + roofH * 0.48;
      const e2W = width * 0.82;
      const e2D = depth * 0.82;
      addMesh(group, cachedBox(e2W - 1, 1.2, e2D - 1), materials.wall, 0, midBaseY + 0.6, 0, id);
      addMesh(group, makeHipRoofGeometry(e2W, e2D, roofH * 0.45, 0.36), roofMaterial, 0, midBaseY + 1.2, 0, id);

      // Tier 3: Upper intersecting cross gables & pointed finial
      const topBaseY = midBaseY + 1.2 + roofH * 0.42;
      const topW = width * 0.58;
      const topD = depth * 0.58;
      addMesh(group, makePyramidRoofGeometry(topW, topD, roofH * 0.55), roofMaterial, 0, topBaseY, 0, id);
      // Gilt sphere finial (鎏金宝顶)
      const finialGeom = new THREE.SphereGeometry(1.15, 10, 10);
      addMesh(group, finialGeom, materials.gold, 0, topBaseY + roofH * 0.55 + 0.9, 0, id);
    } else if (roofType === 'pyramid') {
      // Pointed pyramid roof (攒尖顶 - e.g. 中和殿, 交泰殿)
      const eaveW = width + 5.8;
      const eaveD = depth + 5.8;
      addMesh(group, makePyramidRoofGeometry(eaveW, eaveD, roofH), roofMaterial, 0, roofBaseY, 0, id);
      // Gilded finial
      const finialGeom = new THREE.SphereGeometry(1.2, 10, 10);
      addMesh(group, finialGeom, materials.gold, 0, roofBaseY + roofH + 0.9, 0, id);
    } else if (roofType === 'circle') {
      // Circular double-eave pavilion roof (圆攒尖顶 - e.g. 万春亭, 千秋亭)
      const rad = Math.max(width, depth) / 2 + 3.2;
      addMesh(group, makeOctagonRoofGeometry(rad, roofH * 0.65), roofMaterial, 0, roofBaseY, 0, id);
      if (tiers > 1) {
        const topRad = rad * 0.68;
        const upperY = roofBaseY + roofH * 0.55;
        addMesh(group, cachedCylinder(topRad * 0.6, topRad * 0.6, 1.2, 8), materials.wall, 0, upperY + 0.6, 0, id);
        addMesh(group, makeOctagonRoofGeometry(topRad, roofH * 0.65), roofMaterial, 0, upperY + 1.2, 0, id);
        const finialGeom = new THREE.SphereGeometry(1.0, 10, 10);
        addMesh(group, finialGeom, materials.gold, 0, upperY + 1.2 + roofH * 0.65 + 0.8, 0, id);
      }
    } else {
      // Standard Wudian / Xieshan roof (庑殿顶 / 歇山顶)
      for (let layer = 0; layer < roofLayers; layer++) {
        const isUpper = layer === roofLayers - 1;
        const scale = layer === 0 && roofLayers === 2 ? 1.18 : 0.88;
        const ew = (width + 6.2) * (roofLayers === 1 ? 1 : scale);
        const ed = (depth + 5.8) * (roofLayers === 1 ? 1 : scale);
        const curBaseY = layer === 0 ? roofBaseY : roofBaseY + roofH * 0.52 + 1.1;

        if (layer === 1) {
          // Upper mezzanine wall
          const mezW = width * 0.72;
          const mezD = depth * 0.72;
          addMesh(group, cachedBox(mezW, 1.2, mezD), materials.wall, 0, roofBaseY + roofH * 0.52 + 0.6, 0, id);
        }

        const curH = roofLayers === 1 ? roofH : roofH * 0.65;
        addMesh(group, makeHipRoofGeometry(ew, ed, curH, 0.42), roofMaterial, 0, curBaseY, 0, id);

        // Ridge cresting on top roof
        if (isUpper) {
          const ridgeW = ew * 0.42;
          const ridgeY = curBaseY + curH + 0.28;
          addMesh(group, cachedBox(ridgeW, 0.55, 0.75), materials.roofRidge, 0, ridgeY, 0, id);
          // Chiwen beasts at ridge ends (吻兽)
          addMesh(group, cachedBox(0.9, 0.95, 0.9), materials.roofRidge, -ridgeW / 2, ridgeY + 0.2, 0, id);
          addMesh(group, cachedBox(0.9, 0.95, 0.9), materials.roofRidge, ridgeW / 2, ridgeY + 0.2, 0, id);
        }
      }
    }

    return {
      group,
      record: {
        id,
        name,
        kind,
        category,
        x,
        y,
        z,
        floorY,
        size: [width, depth],
        height,
        tiers,
        roofType,
        access,
        description,
        visitable: access === '可进入'
      }
    };
  }

  // Add building to zone and register in array
  function addBuilding(zone, spec, entrance = {}) {
    const { group, record } = makeBuilding(spec);
    zone.root.add(group);

    const frontZ = spec.z - spec.depth / 2 - 0.24;
    const width = entrance.width ?? Math.min(spec.width * 0.38, 9.5);
    record.bounds = {
      minX: spec.x - spec.width / 2,
      maxX: spec.x + spec.width / 2,
      minZ: spec.z - spec.depth / 2,
      maxZ: spec.z + spec.depth / 2
    };
    record.entrance = {
      position: entrance.position ?? [spec.x, spec.y || 0, frontZ],
      direction: entrance.direction ?? [0, 0, -1],
      width
    };
    record.info = spec.description;

    zone.buildings.push(record);
    return group;
  }

  // Wall Builder (宫墙与黄瓦顶)
  function makeWall(spec) {
    const {
      start = [0, 0],
      end = [0, 0],
      height = 5.2,
      thickness = 2.1,
      gateWidth = 0,
      wallColor = materials.wall,
      roofColor = materials.roof
    } = spec;

    const group = new THREE.Group();
    group.name = 'palace-wall';

    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return group;

    const angle = Math.atan2(dx, dz);
    const midX = (start[0] + end[0]) / 2;
    const midZ = (start[1] + end[1]) / 2;

    const colliders = [];

    if (gateWidth <= 0 || gateWidth >= len) {
      // Continuous wall segment
      const wallMesh = addMesh(group, cachedBox(thickness, height, len), wallColor, 0, height / 2, 0);
      // Yellow glazed tile coping with overhang (瓦面压顶)
      addMesh(group, cachedBox(thickness + 0.65, 0.48, len + 0.25), roofColor, 0, height + 0.24, 0);

      group.position.set(midX, 0, midZ);
      group.rotation.y = angle;

      colliders.push({
        type: 'wall',
        start: [start[0], start[1]],
        end: [end[0], end[1]],
        thickness
      });
    } else {
      // Wall with central gate opening
      const partLen = (len - gateWidth) / 2;
      const offset = (partLen + gateWidth) / 2;

      // Part 1
      const w1 = addMesh(group, cachedBox(thickness, height, partLen), wallColor, 0, height / 2, -offset);
      addMesh(group, cachedBox(thickness + 0.65, 0.48, partLen + 0.2), roofColor, 0, height + 0.24, -offset);
      // Part 2
      const w2 = addMesh(group, cachedBox(thickness, height, partLen), wallColor, 0, height / 2, offset);
      addMesh(group, cachedBox(thickness + 0.65, 0.48, partLen + 0.2), roofColor, 0, height + 0.24, offset);

      // Gate piers
      const pierW = thickness + 0.4;
      const pierH = height + 0.6;
      addMesh(group, cachedBox(pierW, pierH, 0.8), wallColor, 0, pierH / 2, -gateWidth / 2);
      addMesh(group, cachedBox(pierW, pierH, 0.8), wallColor, 0, pierH / 2, gateWidth / 2);

      group.position.set(midX, 0, midZ);
      group.rotation.y = angle;

      colliders.push(
        {
          type: 'wall',
          start: [start[0], start[1]],
          end: [start[0] + (dx * partLen) / len, start[1] + (dz * partLen) / len],
          thickness
        },
        {
          type: 'wall',
          start: [end[0] - (dx * partLen) / len, end[1] - (dz * partLen) / len],
          end: [end[0], end[1]],
          thickness
        }
      );
    }

    group.userData.colliders = colliders;
    return group;
  }

  // Courtyard Builder
  function makeCourtyard(zone, spec) {
    const {
      id,
      name,
      x = 0,
      z = 0,
      width = 50,
      depth = 60,
      gate = 'south',
      gateWidth = 14,
      wallHeight = 5.2,
      wallThickness = 2.0,
      paving = materials.ground
    } = spec;

    const group = new THREE.Group();
    group.name = `court-${id}`;

    // Courtyard stone paving floor
    const floor = addMesh(group, cachedBox(width, 0.22, depth), paving, x, 0.08, z);

    // Courtyard enclosing walls
    const hw = width / 2;
    const hd = depth / 2;
    const southGateW = gate === 'south' || gate === 'both' ? gateWidth : 0;
    const northGateW = gate === 'north' || gate === 'both' ? gateWidth : 0;

    // South wall
    const sw = makeWall({ start: [x - hw, z - hd], end: [x + hw, z - hd], height: wallHeight, thickness: wallThickness, gateWidth: southGateW });
    group.add(sw);
    // North wall
    const nw = makeWall({ start: [x - hw, z + hd], end: [x + hw, z + hd], height: wallHeight, thickness: wallThickness, gateWidth: northGateW });
    group.add(nw);
    // West wall
    const ww = makeWall({ start: [x - hw, z - hd], end: [x - hw, z + hd], height: wallHeight, thickness: wallThickness });
    group.add(ww);
    // East wall
    const ew = makeWall({ start: [x + hw, z - hd], end: [x + hw, z + hd], height: wallHeight, thickness: wallThickness });
    group.add(ew);

    zone.root.add(group);

    // Register courtyard
    zone.courtyards.push({
      id,
      name,
      bounds: [x - hw, x + hw, z - hd, z + hd],
      center: [x, z]
    });

    // Register wall colliders
    if (sw.userData?.colliders) zone.colliders.push(...sw.userData.colliders);
    if (nw.userData?.colliders) zone.colliders.push(...nw.userData.colliders);
    if (ww.userData?.colliders) zone.colliders.push(...ww.userData.colliders);
    if (ew.userData?.colliders) zone.colliders.push(...ew.userData.colliders);

    return group;
  }

  // Multi-tier White Marble Terrace (须弥座三台)
  function makeTerrace(spec) {
    const {
      width = 110,
      depth = 170,
      height = 4.5,
      tiers = 3,
      x = 0,
      y = 0,
      z = 0,
      dragonRamp = true
    } = spec;

    const group = new THREE.Group();
    group.name = 'imperial-terrace-three-tiers';
    group.position.set(x, y, z);

    const tierH = height / tiers;
    for (let t = 0; t < tiers; t++) {
      const shrink = (tiers - 1 - t) * 6.2;
      const tw = width - shrink;
      const td = depth - shrink;
      const ty = (t + 0.5) * tierH;

      // Marble terrace block
      addMesh(group, cachedBox(tw, tierH, td), materials.marble, 0, ty, 0);

      // Balustrade on terrace rim
      const railH = 0.92;
      const railT = 0.35;
      const topY = (t + 1) * tierH + railH / 2;
      // Front rail
      addMesh(group, cachedBox(tw * 0.42, railH, railT), materials.marbleCarved, -tw * 0.26, topY, -td / 2);
      addMesh(group, cachedBox(tw * 0.42, railH, railT), materials.marbleCarved, tw * 0.26, topY, -td / 2);
      // Back rail
      addMesh(group, cachedBox(tw * 0.42, railH, railT), materials.marbleCarved, -tw * 0.26, topY, td / 2);
      addMesh(group, cachedBox(tw * 0.42, railH, railT), materials.marbleCarved, tw * 0.26, topY, td / 2);
      // Side rails
      addMesh(group, cachedBox(railT, railH, td), materials.marbleCarved, -tw / 2, topY, 0);
      addMesh(group, cachedBox(railT, railH, td), materials.marbleCarved, tw / 2, topY, 0);
    }

    // Central Dragon Ramp (丹陛御路石雕)
    if (dragonRamp) {
      const rampW = 6.4;
      const rampL = 26;
      const rampMesh = addMesh(group, cachedBox(rampW, 0.42, rampL), materials.marbleCarved, 0, height / 2, -depth / 2 - rampL * 0.4);
      rampMesh.rotation.x = Math.atan2(height, rampL);
    }

    return group;
  }

  // Marble Arch Bridge (汉白玉金水桥)
  function makeBridge(spec) {
    const { length = 32, width = 7.5, height = 2.8, x = 0, y = 0, z = 0, rotationY = 0 } = spec;

    const group = new THREE.Group();
    group.name = 'jinshui-bridge';
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    // Arched road deck
    addMesh(group, cachedBox(width, 0.65, length), materials.marble, 0, height, 0);
    // Ramps at both ends
    const rampLen = 8;
    const r1 = addMesh(group, cachedBox(width, 0.55, rampLen), materials.marble, 0, height / 2, -length / 2 - rampLen / 2);
    r1.rotation.x = -Math.atan2(height, rampLen);
    const r2 = addMesh(group, cachedBox(width, 0.55, rampLen), materials.marble, 0, height / 2, length / 2 + rampLen / 2);
    r2.rotation.x = Math.atan2(height, rampLen);

    // Marble balustrades
    const railH = 0.95;
    const railT = 0.32;
    addMesh(group, cachedBox(railT, railH, length + rampLen * 1.8), materials.marbleCarved, -width / 2, height + railH / 2, 0);
    addMesh(group, cachedBox(railT, railH, length + rampLen * 1.8), materials.marbleCarved, width / 2, height + railH / 2, 0);

    // Pier arches
    addMesh(group, cachedBox(width + 0.4, height * 0.85, 4.5), materials.marble, 0, height * 0.42, 0);

    return group;
  }

  // Procedural Tree (古松、翠柏、海棠、垂柳)
  function makeTree(spec) {
    const { x = 0, y = 0, z = 0, scale = 1.0, type = 'pine' } = spec;
    const group = new THREE.Group();
    group.name = `tree-${type}`;
    group.position.set(x, y, z);

    const trunkH = (type === 'cypress' ? 6.5 : 4.5) * scale;
    const trunkR = 0.38 * scale;
    addMesh(group, cachedCylinder(trunkR * 0.7, trunkR, trunkH, 7), materials.trunk, 0, trunkH / 2, 0);

    if (type === 'cypress') {
      // Tall columnar foliage (柏树)
      const mat = materials.foliageCypress;
      for (let i = 0; i < 3; i++) {
        const rad = (2.2 - i * 0.4) * scale;
        const h = 3.6 * scale;
        addMesh(group, cachedCylinder(rad * 0.5, rad, h, 8), mat, 0, trunkH + i * 2.4 * scale, 0);
      }
    } else if (type === 'blossom') {
      // Flowering crabapple / plum (海棠/梅花)
      const mat = materials.foliageBlossom;
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI * 2) / 4;
        const rad = (2.0 + (i % 2) * 0.5) * scale;
        const geom = new THREE.SphereGeometry(rad, 7, 7);
        addMesh(group, geom, mat, Math.cos(angle) * 1.6 * scale, trunkH + 1.2 * scale, Math.sin(angle) * 1.6 * scale);
      }
    } else if (type === 'willow') {
      // Weeping willow (垂柳)
      const mat = materials.foliageWillow;
      const crown = new THREE.SphereGeometry(3.2 * scale, 8, 8);
      addMesh(group, crown, mat, 0, trunkH + 1.5 * scale, 0);
    } else {
      // Ancient Pine (苍松)
      const mat = materials.foliagePine;
      for (let i = 0; i < 3; i++) {
        const rad = (3.4 - i * 0.7) * scale;
        const h = 2.2 * scale;
        addMesh(group, cachedCylinder(rad * 0.35, rad, h, 8), mat, (i - 1) * 0.5 * scale, trunkH + i * 1.8 * scale, 0);
      }
    }

    return group;
  }

  // Scholar Stone / Rock Mountain (太湖石 / 堆秀山)
  function makeRockery(spec) {
    const { x = 0, y = 0, z = 0, scale = 1.0, height = 8.0 } = spec;
    const group = new THREE.Group();
    group.name = 'imperial-rockery';
    group.position.set(x, y, z);

    // Multi-stacked irregular boulders
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const rad = (scale * (layers - i * 0.6) * 2.8) / layers;
      const lh = (height / layers) * 1.2;
      const ly = (i + 0.5) * (height / layers);
      for (let b = 0; b < 3; b++) {
        const angle = (b * Math.PI * 2) / 3 + i * 0.6;
        const bx = Math.cos(angle) * (rad * 0.45);
        const bz = Math.sin(angle) * (rad * 0.45);
        const boulderGeom = new THREE.DodecahedronGeometry(rad * 0.85, 0);
        const m = addMesh(group, boulderGeom, materials.rockery, bx, ly, bz);
        m.scale.set(1.1, 1.4, 0.9);
      }
    }

    return group;
  }

  // Palace Lantern (红纱宫灯)
  function makeLamp(spec) {
    const { x = 0, y = 0, z = 0, height = 3.6 } = spec;
    const group = new THREE.Group();
    group.name = 'palace-lantern';
    group.position.set(x, y, z);

    // Lacquered stand
    addMesh(group, cachedCylinder(0.12, 0.22, height, 8), materials.lacquer, 0, height / 2, 0);
    // Lantern lantern head
    addMesh(group, cachedBox(0.9, 1.1, 0.9), materials.lanternGlow, 0, height + 0.6, 0);
    // Lantern golden cap
    addMesh(group, makePyramidRoofGeometry(1.2, 1.2, 0.5), materials.roof, 0, height + 1.15, 0);

    return group;
  }

  // Bronze Statues (铜狮、铜香炉)
  function makeBronzeStatue(spec) {
    const { x = 0, y = 0, z = 0, type = 'lion' } = spec;
    const group = new THREE.Group();
    group.name = `bronze-${type}`;
    group.position.set(x, y, z);

    // White marble pedestal
    addMesh(group, cachedBox(2.2, 1.4, 2.8), materials.marbleCarved, 0, 0.7, 0);

    if (type === 'lion') {
      // Bronze Lion body and head
      addMesh(group, cachedBox(1.4, 1.8, 2.0), materials.gold, 0, 1.4 + 0.9, 0);
      addMesh(group, cachedBox(1.2, 1.2, 1.2), materials.gold, 0, 1.4 + 2.1, -0.6);
    } else {
      // Incense Burner / Ding (铜鼎香炉)
      addMesh(group, cachedCylinder(1.1, 0.8, 1.6, 8), materials.gold, 0, 1.4 + 0.8, 0);
      addMesh(group, makePyramidRoofGeometry(1.6, 1.6, 0.8), materials.roof, 0, 1.4 + 1.6, 0);
    }

    return group;
  }

  return {
    materials,
    cachedBox,
    cachedCylinder,
    makeHipRoofGeometry,
    makePyramidRoofGeometry,
    makeOctagonRoofGeometry,
    makeBuilding,
    addBuilding,
    makeWall,
    makeCourtyard,
    makeTerrace,
    makeBridge,
    makeTree,
    makeRockery,
    makeLamp,
    makeBronzeStatue
  };
}
