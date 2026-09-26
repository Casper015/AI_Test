// A · 明清官式细节构件（程序化几何，无第三方模型）
// 所有构建器接收注入的 THREE 与共享材质 M；Canvas 贴图只在 materials.js 内以 document 守卫创建。

export const DETAIL_PROFILES = {
  grand: { tileSpacing: 4.6, tileMax: 22, tileSeg: 6, sideStrips: 5, dougongSpacing: 5.0, dougongMax: 64, beasts: true, capsEvery: 1, postSpacing: 3 },
  royal: { tileSpacing: 5.4, tileMax: 10, tileSeg: 5, sideStrips: 3, dougongSpacing: 5.6, dougongMax: 20, beasts: true, capsEvery: 2, postSpacing: 3.6 },
  major: { tileSpacing: 5.6, tileMax: 10, tileSeg: 5, sideStrips: 3, dougongSpacing: 5.6, dougongMax: 16, beasts: true, capsEvery: 1, postSpacing: 3.2 },
  minor: { tileSpacing: 6.4, tileMax: 7, tileSeg: 4, sideStrips: 2, dougongSpacing: 6.2, dougongMax: 10, beasts: false, capsEvery: 1, postSpacing: 3.4 }
};

export function detailProfile(tierName, o = {}) {
  if (tierName === 'royal' && o.grand) return DETAIL_PROFILES.grand;
  return DETAIL_PROFILES[tierName] || DETAIL_PROFILES.minor;
}

export function instancedIn(THREE, geo, mat, list, castShadow = false) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const dummy = new THREE.Object3D();
  list.forEach((t, i) => {
    dummy.position.set(t.x || 0, t.y || 0, t.z || 0);
    dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    const s = t.s ?? 1;
    dummy.scale.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = castShadow;
  im.receiveShadow = true;
  return im;
}

function stripMesh(THREE, mat, quads) {
  const pos = [];
  for (const q of quads) {
    pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  let ny = 0;
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) ny += n.getY(i);
  if (ny < 0) {
    for (let t = 0; t < pos.length; t += 9) {
      for (let k = 0; k < 3; k++) {
        const tmp = pos[t + 3 + k];
        pos[t + 3 + k] = pos[t + 6 + k];
        pos[t + 6 + k] = tmp;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.computeVertexNormals();
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, mat);
}

// 屋面瓦垄：沿坡向（前/后坡垂直檐口，两山少量）的细长折线，浮在坡面上方 5.5cm
export function tileLines(THREE, o) {
  const { height, W, D, mat, profile } = o;
  const p = profile || DETAIL_PROFILES.major;
  const g = new THREE.Group();
  const lift = o.lift ?? 0.055;
  const width = o.width ?? 0.15;
  const nX = Math.max(4, Math.min(p.tileMax, Math.round((2 * W) / p.tileSpacing)));
  for (let i = 0; i < nX; i++) {
    const x = -W + (2 * W * (i + 0.5)) / nX;
    const quads = [];
    for (let j = 0; j < p.tileSeg; j++) {
      const z0 = -D + (2 * D * j) / p.tileSeg;
      const z1 = -D + (2 * D * (j + 1)) / p.tileSeg;
      quads.push([
        [x - width / 2, height(x, z0) + lift, z0],
        [x - width / 2, height(x, z1) + lift, z1],
        [x + width / 2, height(x, z1) + lift, z1],
        [x + width / 2, height(x, z0) + lift, z0]
      ]);
    }
    g.add(stripMesh(THREE, mat, quads));
  }
  const nZ = Math.max(2, Math.min(p.sideStrips, Math.round((2 * D) / p.tileSpacing)));
  for (let i = 0; i < nZ; i++) {
    const z = -D + (2 * D * (i + 0.5)) / nZ;
    const quads = [];
    for (let j = 0; j < p.tileSeg; j++) {
      const x0 = -W + (2 * W * j) / p.tileSeg;
      const x1 = -W + (2 * W * (j + 1)) / p.tileSeg;
      quads.push([
        [x0, height(x0, z) + lift, z - width / 2],
        [x1, height(x1, z) + lift, z - width / 2],
        [x1, height(x1, z) + lift, z + width / 2],
        [x0, height(x0, z) + lift, z + width / 2]
      ]);
    }
    g.add(stripMesh(THREE, mat, quads));
  }
  return g;
}

// 檐下斗栱/椽头带：沿额枋下一圈小方块，数量随等级与体量
export function dougongRow(THREE, M, o) {
  const g = new THREE.Group();
  const mat = o.material || M.ridge;
  const profile = o.profile || DETAIL_PROFILES.major;
  const h = o.h ?? 0.68;
  const bw = o.bw ?? 0.5;
  const hx = Math.max(1, o.w / 2 - 0.25);
  const hz = Math.max(1, o.d / 2 - 0.25);
  const per = 2 * (2 * hx + 2 * hz);
  let n = Math.max(4, Math.round(per / profile.dougongSpacing));
  n = Math.min(n, o.max ?? profile.dougongMax);
  const segs = [
    { a: [-hx, -hz], b: [hx, -hz], len: 2 * hx },
    { a: [hx, -hz], b: [hx, hz], len: 2 * hz },
    { a: [hx, hz], b: [-hx, hz], len: 2 * hx },
    { a: [-hx, hz], b: [-hx, -hz], len: 2 * hz }
  ];
  const total = segs.reduce((s, e) => s + e.len, 0) || 1;
  const geo = new THREE.BoxGeometry(bw, h, bw);
  for (let i = 0; i < n; i++) {
    let t = ((i + 0.5) / n) * total;
    for (const s of segs) {
      if (t > s.len) { t -= s.len; continue; }
      const f = s.len ? t / s.len : 0;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.a[0] + (s.b[0] - s.a[0]) * f, o.y, s.a[1] + (s.b[1] - s.a[1]) * f);
      g.add(m);
      break;
    }
  }
  return g;
}

// 正脊两端脊兽：小型组合体（座+身+首+角），dir 指向脊外
export function ridgeBeast(THREE, M, o) {
  const g = new THREE.Group();
  const mat = o.material || M.ridge;
  const s = o.s ?? 1;
  const d = o.dir ?? 1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.45 * s, 0.8 * s), mat);
  base.position.set(0, 0.22 * s, 0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 1.05 * s, 0.55 * s), mat);
  body.position.set(-0.12 * s * d, 0.92 * s, 0);
  body.rotation.z = 0.35 * d;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 * s, 0), mat);
  head.position.set(-0.4 * s * d, 1.38 * s, 0);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.45 * s, 5), mat);
  horn.position.set(-0.62 * s * d, 1.58 * s, 0);
  horn.rotation.z = 0.9 * d;
  g.add(base, body, head, horn);
  g.position.set(o.x, o.y, o.z);
  return g;
}

// 栏杆细化：望柱头 + 通长栏板（分层），与 posts 同用实例化柱
export function railingExtras(THREE, M, o) {
  const g = new THREE.Group();
  const posts = o.posts || [];
  const rects = o.rects || [];
  const y = o.y || 0;
  const capMat = o.material || M.stone;
  const panelMat = o.panelMaterial || M.stoneDark;
  const every = Math.max(1, o.capsEvery || 1);
  if (o.caps !== false) {
    const capGeo = new THREE.TetrahedronGeometry(0.27, 0);
    posts.forEach((p, i) => {
      if (i % every) return;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(p.x, (p.y ?? y) + 1.3, p.z);
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
    });
  }
  const panelGeo = new THREE.BoxGeometry(1, 0.5, 0.14);
  for (const r of rects) {
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.scale.x = Math.max(0.4, r.len * 0.97);
    if (r.axis === 'z') panel.rotation.y = Math.PI / 2;
    panel.position.set(r.x, y + 0.82, r.z);
    g.add(panel);
  }
  return g;
}

// 铺地：方砖分格 + 轴线路中缝；Node（无 document）下自动降低密度
export function pavingPattern(THREE, M, o) {
  const g = new THREE.Group();
  const node = typeof document === 'undefined';
  const base = o.kind === 'axis' ? 9 : o.kind === 'path' ? 5 : o.kind === 'court' ? 7 : 6;
  const spacing = base * (node ? 1.8 : 1);
  const mat = o.material || M.stoneDark;
  const y = o.y ?? 0.17;
  const line = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), mat);
    m.position.set(x, y, z);
    g.add(m);
  };
  const nz = Math.max(0, Math.round(o.d / spacing) - 1);
  for (let i = 1; i <= nz; i++) line(0.14, o.d, o.x - o.w / 2 + (o.w * i) / (nz + 1), o.z);
  const nx = Math.max(0, Math.round(o.w / spacing) - 1);
  for (let i = 1; i <= nx; i++) line(o.w, 0.14, o.x, o.z - o.d / 2 + (o.d * i) / (nx + 1));
  if (o.kind === 'axis' || o.kind === 'plaza') {
    line(o.w * 0.055, o.d, o.x - o.w * 0.045, o.z);
    line(o.w * 0.055, o.d, o.x + o.w * 0.045, o.z);
  }
  return g;
}

// 假山：低面数多面体组合，两档材质
export function rockery(THREE, M, o) {
  const g = new THREE.Group();
  const list = o.list || [];
  const main = [];
  const accent = [];
  list.forEach((r) => {
    const s = r.s ?? 1;
    const n = Math.max(3, r.n ?? 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r.r || 0) + i * 0.7;
      const rad = i === 0 ? 0 : s * (0.5 + 0.3 * ((i * 37) % 5) / 5);
      const item = {
        x: r.x + Math.cos(a) * rad,
        y: s * (i === 0 ? 0.62 : 0.3 + 0.22 * ((i * 13) % 4) / 4),
        z: r.z + Math.sin(a) * rad,
        s: s * (i === 0 ? 1 : 0.42 + 0.26 * ((i * 7) % 5) / 5),
        ry: a,
        sy: s * (i === 0 ? 0.78 : 0.55)
      };
      (i % 2 ? accent : main).push(item);
    }
  });
  if (main.length) g.add(instancedIn(THREE, new THREE.DodecahedronGeometry(1, 0), M.rock, main, false));
  if (accent.length) g.add(instancedIn(THREE, new THREE.DodecahedronGeometry(0.8, 0), M.stoneSide, accent, false));
  return g;
}

// 石灯：座+柱+灯室+檐，可登记灯位锚点
export function stoneLamp(THREE, M, o) {
  const g = new THREE.Group();
  const list = o.list || [];
  const y = o.y || 0;
  g.add(instancedIn(THREE, new THREE.BoxGeometry(1.0, 0.36, 1.0), M.stoneSide, list.map((p) => ({ x: p.x, y: y + 0.18, z: p.z })), false));
  g.add(instancedIn(THREE, new THREE.CylinderGeometry(0.16, 0.2, 1.3, 7), M.stoneSide, list.map((p) => ({ x: p.x, y: y + 1.0, z: p.z })), false));
  g.add(instancedIn(THREE, new THREE.BoxGeometry(0.8, 0.75, 0.8), M.lanternRed, list.map((p) => ({ x: p.x, y: y + 2.0, z: p.z })), false));
  g.add(instancedIn(THREE, new THREE.ConeGeometry(0.7, 0.55, 4), M.stoneSide, list.map((p) => ({ x: p.x, y: y + 2.62, z: p.z, ry: Math.PI / 4 })), false));
  g.userData.lightAnchors = list.map((p, i) => ({
    id: p.id || `${o.id || 'stone-lamp'}.${i}`,
    type: 'lantern',
    position: [p.x, y + 2.0, p.z],
    color: 0xffb46b,
    intensity: 4
  }));
  return g;
}

// 铜香炉：三足双耳带盖，登记 type:'censer' 灯位锚点
export function censerProps(THREE, M, o) {
  const g = new THREE.Group();
  const y = o.y || 0;
  g.add(instancedIn(THREE, new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6), M.bronze, [
    { x: o.x - 0.55, y: y + 0.35, z: o.z + 0.45 },
    { x: o.x + 0.55, y: y + 0.35, z: o.z + 0.45 },
    { x: o.x, y: y + 0.35, z: o.z - 0.6 }
  ], false));
  g.add(instancedIn(THREE, new THREE.CylinderGeometry(1.0, 0.8, 1.6, 8), M.bronze, [{ x: o.x, y: y + 1.5, z: o.z }], false));
  g.add(instancedIn(THREE, new THREE.CylinderGeometry(0.92, 1.02, 0.5, 8), M.bronze, [{ x: o.x, y: y + 2.45, z: o.z }], false));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.bronze);
  dome.position.set(o.x, y + 2.65, o.z);
  g.add(dome);
  g.add(instancedIn(THREE, new THREE.BoxGeometry(0.3, 0.9, 0.3), M.bronze, [
    { x: o.x - 0.98, y: y + 2.0, z: o.z },
    { x: o.x + 0.98, y: y + 2.0, z: o.z }
  ], false));
  g.add(instancedIn(THREE, new THREE.BoxGeometry(0.7, 0.22, 0.22), M.bronze, [
    { x: o.x - 1.35, y: y + 2.55, z: o.z },
    { x: o.x + 1.35, y: y + 2.55, z: o.z }
  ], false));
  const anchor = {
    id: o.id || 'censer',
    type: 'censer',
    position: [o.x, y + 3.0, o.z],
    color: 0xffb46b,
    intensity: 5
  };
  g.userData.lightAnchor = anchor;
  g.userData.lightAnchors = [anchor];
  return g;
}

// 柳树（垂枝）：树干 + 冠体 + 一圈下垂枝条，单株直接返回 Group
export function willowTree(THREE, M, o) {
  const g = new THREE.Group();
  const s = o.s ?? 1;
  const h = 9 * s;
  g.add(instancedIn(THREE, new THREE.CylinderGeometry(0.42 * s, 0.6 * s, h * 0.5, 7), M.trunk, [{ x: 0, y: h * 0.25, z: 0 }], false));
  g.add(instancedIn(THREE, new THREE.IcosahedronGeometry(1, 0), M.treeA, [
    { x: 0, y: h * 0.6, z: 0, s: 2.6 * s },
    { x: -1.3 * s, y: h * 0.56, z: 0.7 * s, s: 1.7 * s, ry: 0.6 },
    { x: 1.3 * s, y: h * 0.57, z: -0.7 * s, s: 1.8 * s, ry: 1.2 }
  ], false));
  const strands = [];
  const n = o.strands ?? 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.14;
    const r = (1.7 + (i % 3) * 0.35) * s;
    strands.push({
      x: Math.cos(a) * r,
      y: h * 0.52,
      z: Math.sin(a) * r,
      rx: Math.sin(a) * 0.2,
      rz: Math.cos(a) * 0.2
    });
  }
  g.add(instancedIn(THREE, new THREE.CylinderGeometry(0.045 * s, 0.02 * s, 2.8 * s, 4), M.treeB, strands, false));
  g.position.set(o.x || 0, 0, o.z || 0);
  return g;
}
