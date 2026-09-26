import { SKY, TIME_PRESETS } from '../shared/config.js';

export function createEnvironment({ THREE, scene, config, kit, registry }) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -180; sc.right = 180; sc.top = 180; sc.bottom = -180; sc.near = 20; sc.far = 1800;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 1.2;
  scene.add(hemi, ambient, sun, sun.target);
  scene.fog = new THREE.Fog(0xcccccc, 700, 2200);

  const lanternPool = [];
  for (let i = 0; i < 24; i++) {
    const p = new THREE.PointLight(0xffb46b, 0, 90, 2);
    p.visible = false;
    scene.add(p);
    lanternPool.push(p);
  }

  let skyTexture = null;
  function buildSky(preset) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#' + new THREE.Color(preset.top).getHexString());
    grad.addColorStop(1, '#' + new THREE.Color(preset.bottom).getHexString());
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  let presetName = 'golden';
  function setPreset(name) {
    const preset = TIME_PRESETS[name] || TIME_PRESETS.golden;
    presetName = name;
    const sky = SKY[name] || SKY.golden;
    const dir = new THREE.Vector3(preset.sunDir[0], preset.sunDir[1], preset.sunDir[2]).normalize();
    sun.position.copy(dir.multiplyScalar(900));
    sun.color.set(sky.sun);
    sun.intensity = preset.sunIntensity;
    hemi.color.set(sky.hemi);
    hemi.groundColor.set(sky.ground);
    hemi.intensity = preset.hemiIntensity;
    ambient.intensity = preset.ambient;
    scene.fog.color.set(sky.fog);
    scene.fog.near = preset.fogNear;
    scene.fog.far = preset.fogFar;
    scene.background = buildSky(sky);
    if (kit && kit.materials && kit.materials.lanternRed) {
      kit.materials.lanternRed.emissiveIntensity = 0.25 + preset.lanterns * 2.4;
    }
    scene.traverse((o) => {
      if (o.material && o.material.userData && o.material.userData.nightEmissive) {
        o.material.emissiveIntensity = o.material.userData.nightEmissive * (0.2 + preset.lanterns * 1.6);
      }
    });
  }

  const focusPoint = new THREE.Vector3();
  function update(dt, focus) {
    if (focus) focusPoint.copy(focus);
    sun.position.set(focusPoint.x + sun.position.x * 0, 0, 0);
    const preset = TIME_PRESETS[presetName] || TIME_PRESETS.golden;
    const dir = new THREE.Vector3(preset.sunDir[0], preset.sunDir[1], preset.sunDir[2]).normalize().multiplyScalar(700);
    sun.position.set(focusPoint.x + dir.x, dir.y + 40, focusPoint.z + dir.z);
    sun.target.position.set(focusPoint.x, 0, focusPoint.z);
    sun.target.updateMatrixWorld();
    const presetLanterns = preset.lanterns;
    const anchors = registry ? registry.lightAnchors : [];
    const wanted = Math.round(presetLanterns * 24);
    if (wanted > 0) {
      const sorted = anchors
        .map((a) => ({ a, d: (a.position[0] - focusPoint.x) ** 2 + (a.position[2] - focusPoint.z) ** 2 }))
        .sort((x, y) => x.d - y.d)
        .slice(0, wanted);
      lanternPool.forEach((p, i) => {
        const hit = sorted[i];
        if (!hit) {
          p.visible = false;
          return;
        }
        p.visible = true;
        p.position.set(hit.a.position[0], hit.a.position[1], hit.a.position[2]);
        p.color.set(hit.a.color || 0xffb46b);
        p.intensity = (hit.a.intensity || 6) * (0.4 + presetLanterns);
        p.distance = 90;
      });
    } else {
      for (const p of lanternPool) p.visible = false;
    }
  }

  setPreset('golden');
  return { setPreset, update, sun, hemi, ambient, get preset() { return presetName; } };
}
