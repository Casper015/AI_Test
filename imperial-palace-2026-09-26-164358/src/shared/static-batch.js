import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The zones are static, but their thousands of small decorative meshes would
// otherwise each issue a draw call. Bake their world transforms into one mesh
// per material/shadow policy. Face ranges preserve building selection.
export function batchStaticScene(THREE, root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  let sourceMeshes = 0;
  root.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh || !node.visible || Array.isArray(node.material)) return;
    for (let parent = node.parent; parent && parent !== root; parent = parent.parent) {
      if (!parent.visible) return;
    }
    if (!node.geometry?.getAttribute('position')) return;
    const key = `${node.material.uuid}:${Number(node.castShadow)}:${Number(node.receiveShadow)}`;
    if (!buckets.has(key)) buckets.set(key, { material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow, meshes: [] });
    buckets.get(key).meshes.push(node);
    sourceMeshes++;
  });

  const merged = [];
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) continue;
    const parts = [];
    const faceBuildings = [];
    let nextFace = 0;
    for (const mesh of bucket.meshes) {
      let geometry = mesh.geometry.clone();
      if (geometry.index) {
        const expanded = geometry.toNonIndexed();
        geometry.dispose();
        geometry = expanded;
      }
      for (const attribute of Object.keys(geometry.attributes)) {
        if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
      }
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      geometry.applyMatrix4(mesh.matrixWorld);
      const faces = geometry.getAttribute('position').count / 3;
      faceBuildings.push({ start: nextFace, end: nextFace + faces, id: mesh.userData.buildingId || null });
      nextFace += faces;
      parts.push(geometry);
    }
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!geometry) throw new Error(`静态场景合批失败：${bucket.material.name || bucket.material.uuid}`);
    bucket.meshes.forEach((mesh) => mesh.parent.remove(mesh));
    const combined = new THREE.Mesh(geometry, bucket.material);
    combined.name = `city-batch-${bucket.material.name || bucket.material.uuid}`;
    combined.castShadow = bucket.castShadow;
    combined.receiveShadow = bucket.receiveShadow;
    combined.userData.faceBuildings = faceBuildings;
    // Individual zone bounds are intentionally merged only after every zone is
    // registered; the city stays visible at any camera or quality setting.
    combined.frustumCulled = false;
    root.add(combined);
    merged.push(combined);
  }
  return {
    sourceMeshes,
    batchMeshes: merged.length,
    dispose: () => merged.forEach((mesh) => mesh.geometry.dispose())
  };
}

export function buildingIdForHit(hit) {
  const direct = hit.object.userData.buildingId;
  if (direct) return direct;
  const faces = hit.object.userData.faceBuildings;
  if (!faces || hit.faceIndex == null) return null;
  let left = 0, right = faces.length - 1;
  while (left <= right) {
    const middle = (left + right) >> 1;
    const range = faces[middle];
    if (hit.faceIndex < range.start) right = middle - 1;
    else if (hit.faceIndex >= range.end) left = middle + 1;
    else return range.id;
  }
  return null;
}
