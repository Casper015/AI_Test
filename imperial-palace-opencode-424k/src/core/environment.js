/**
 * 紫禁天朝 · 统一环境系统（主 Agent）
 * 全城共用太阳、天空、雾、曝光与阴影策略；盛世金辉 / 落霞夕照 / 寒月宫灯三预设。
 */

import * as THREE from 'three';
import { TIME_PRESETS, WORLD, SUN_SHADOW_FOCUS } from '../shared/config.js';
import { applyTimePreset } from '../kit/materials.js';

const SKY_VERT = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const SKY_FRAG = [
  'varying vec3 vP;',
  'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunTint; uniform vec3 uSunDir; uniform float uNight;',
  'void main(){',
  '  vec3 d = normalize(vP);',
  '  float h = d.y;',
  '  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));',
  '  col = mix(col, uGround, smoothstep(0.0, -0.22, h));',
  '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
  '  col += uSunTint * pow(sd, 220.0) * 2.2;',
  '  col += uSunTint * pow(sd, 6.0) * 0.22;',
  '  col += uSunTint * pow(max(1.0 - abs(h) * 3.2, 0.0), 2.0) * 0.14;',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

export function createEnvironment(scene, materials, quality, renderer) {
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x2f74c8) },
    uHorizon: { value: new THREE.Color(0xcfe4f7) },
    uGround: { value: new THREE.Color(0x9aa39a) },
    uSunTint: { value: new THREE.Color(0xfff3da) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.5) },
    uNight: { value: 0 }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG
    })
  );
  sky.name = 'sky';
  sky.frustumCulled = false;
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.5);
  sun.castShadow = quality.shadow > 0;
  const area = quality.shadowArea || 420;
  sun.shadow.mapSize.set(quality.shadow || 1024, quality.shadow || 1024);
  sun.shadow.camera.left = -area;
  sun.shadow.camera.right = area;
  sun.shadow.camera.top = area;
  sun.shadow.camera.bottom = -area;
  sun.shadow.camera.near = 60;
  sun.shadow.camera.far = 2200;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 1.1;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x8d8570, 0.85);
  const ambient = new THREE.AmbientLight(0xdfe8ff, 0.28);
  scene.add(hemi, ambient);

  const fog = new THREE.FogExp2(0xc9d8e6, 0.00055);
  scene.fog = fog;

  let preset = TIME_PRESETS.day;

  function applyPreset(id) {
    preset = TIME_PRESETS[id] || TIME_PRESETS.day;
    scene.background = null;
    if (renderer) renderer.toneMappingExposure = preset.exposure;
    const el = preset.sun.elevation * Math.PI / 180;
    const az = preset.sun.azimuth * Math.PI / 180;
    const dist = 1500;
    const sx = Math.sin(az) * Math.cos(el) * dist;
    const sy = Math.sin(el) * dist;
    const sz = -Math.cos(az) * Math.cos(el) * dist;
    sun.position.set(SUN_SHADOW_FOCUS.x + sx, sy, SUN_SHADOW_FOCUS.z + sz);
    sun.target.position.set(SUN_SHADOW_FOCUS.x, 0, SUN_SHADOW_FOCUS.z);
    sun.color.setHex(preset.sun.color);
    sun.intensity = preset.sun.intensity;
    sun.castShadow = quality.shadow > 0;
    hemi.color.setHex(preset.hemi.sky);
    hemi.groundColor.setHex(preset.hemi.ground);
    hemi.intensity = preset.hemi.intensity;
    ambient.color.setHex(preset.ambient.color);
    ambient.intensity = preset.ambient.intensity;
    skyUniforms.uTop.value.setHex(preset.sky.top);
    skyUniforms.uHorizon.value.setHex(preset.sky.horizon);
    skyUniforms.uGround.value.setHex(preset.sky.ground);
    skyUniforms.uSunTint.value.setHex(preset.sky.sunTint);
    skyUniforms.uSunDir.value.set(sx, sy, sz).normalize();
    skyUniforms.uNight.value = preset.wp;
    fog.color.setHex(preset.fog.color);
    fog.density = preset.fog.density;
    applyTimePreset(materials, preset, preset.lantern);
    return preset;
  }


  function update(dt, elapsed) {
    const t = materials.water.normalMap;
    if (t) {
      t.offset.x = (elapsed * 0.008) % 1;
      t.offset.y = (elapsed * 0.005) % 1;
    }
    sky.position.set(0, 0, 0);
  }

  function setQuality(q) {
    sun.castShadow = q.shadow > 0;
    sun.shadow.mapSize.set(q.shadow || 1024, q.shadow || 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }

  return { sky, sun, hemi, ambient, fog, applyPreset, update, setQuality };
}

export default createEnvironment;
