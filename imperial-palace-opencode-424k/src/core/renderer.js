/**
 * 紫禁天朝 · 渲染与后处理（主 Agent，唯一动画循环持有者）
 * 主场景一次常规渲染；Bloom 克制，按质量档开关。
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * quality.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: 2, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.setSize(window.innerWidth, window.innerHeight);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let currentQuality = quality;

  function setSize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * currentQuality.dpr);
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener('resize', setSize);

  function setQuality(q) {
    currentQuality = q;
    renderer.shadowMap.enabled = q.shadow > 0;
    renderer.shadowMap.needsUpdate = true;
    bloom.enabled = !!q.bloom;
    setSize();
  }

  function setCamera(camera) { renderPass.camera = camera; }
  function setScene(scene) { renderPass.scene = scene; }
  function setBloom(strength) { bloom.strength = strength; }
  function render() { composer.render(); }
  function info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }; }

  return { THREE, renderer, composer, renderPass, bloom, setSize, setQuality, setCamera, setScene, setBloom, render, info };
}

export default createRenderer;
