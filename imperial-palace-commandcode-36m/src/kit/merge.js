function mergeGeos(THREE, geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    pos.set(p.array, offset * 3);
    if (n) nor.set(n.array, offset * 3);
    if (u) uv.set(u.array, offset * 2);
    offset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export function mergeByMaterial(THREE, group, opts = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const keep = [];
  group.traverse((o) => {
    if (o.isInstancedMesh || o.isSprite || o.isLine || o.isPoints) {
      keep.push(o);
      return;
    }
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(m);
    const count = geo.attributes.position.count;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    const list = byMat.get(o.material) || [];
    list.push(geo);
    byMat.set(o.material, list);
  });
  const out = new THREE.Group();
  out.name = opts.name || group.name;
  for (const child of keep) {
    const c = child.clone();
    const local = new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld);
    local.decompose(c.position, c.quaternion, c.scale);
    out.add(c);
  }
  for (const [material, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeos(THREE, geos);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
