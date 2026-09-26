/**
 * 紫禁天朝 · 统一材质库（A 资源与建筑库 · style-baseline-v1）
 * 全部为程序化石纹/瓦纹/彩画贴图，1K 以下，供全城共享。
 */

import * as THREE from 'three';
import { PALETTE } from '../shared/config.js';

function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function tex(canvas, rx, ry, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  return t;
}

function tileCanvas() {
  const c = cvs(256, 256), x = c.getContext('2d'), R = rng(7);
  x.fillStyle = '#d8ad33';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const px = i * 10;
    x.fillStyle = i % 2 ? 'rgba(255,240,190,0.42)' : 'rgba(150,110,26,0.30)';
    x.fillRect(px, 0, 4, 256);
  }
  for (let i = 0; i < 700; i++) {
    x.fillStyle = R() < 0.5 ? 'rgba(255,245,200,0.10)' : 'rgba(120,88,16,0.08)';
    x.fillRect(R() * 256, R() * 256, 2 + R() * 3, 1 + R() * 2);
  }
  return c;
}

function plasterCanvas(base, seed) {
  const c = cvs(128, 128), x = c.getContext('2d'), R = rng(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    x.fillRect(R() * 128, R() * 128, 2 + R() * 6, 2 + R() * 5);
  }
  return c;
}

function pavingCanvas() {
  const c = cvs(256, 256), x = c.getContext('2d'), R = rng(21);
  x.fillStyle = '#585754';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(30,30,28,0.55)';
  x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 256); x.stroke();
    x.beginPath(); x.moveTo(0, i * 64); x.lineTo(256, i * 64); x.stroke();
  }
  for (let i = 0; i < 600; i++) {
    x.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
    x.fillRect(R() * 256, R() * 256, 3 + R() * 8, 2 + R() * 6);
  }
  return c;
}

function marbleCanvas() {
  const c = cvs(256, 256), x = c.getContext('2d'), R = rng(33);
  x.fillStyle = '#f1ede2';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(160,152,138,0.35)';
  for (let i = 0; i < 16; i++) {
    x.lineWidth = 0.6 + R() * 1.6;
    x.beginPath();
    let px = R() * 256, py = 0;
    x.moveTo(px, py);
    for (let k = 0; k < 5; k++) { px += (R() - 0.5) * 60; py += 52; x.lineTo(px, py); }
    x.stroke();
  }
  x.strokeStyle = 'rgba(120,116,104,0.22)';
  x.lineWidth = 2;
  for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(0, i * 128); x.lineTo(256, i * 128); x.stroke(); }
  return c;
}

function paintingCanvas() {
  const c = cvs(256, 64), x = c.getContext('2d');
  x.fillStyle = '#1c4e40';
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#1c3f66';
  x.fillRect(0, 0, 256, 20);
  for (let i = 0; i < 16; i++) {
    x.fillStyle = 'rgba(255,200,59,0.85)';
    x.fillRect(i * 16 + 5, 26, 6, 12);
    x.fillStyle = 'rgba(247,244,236,0.5)';
    x.fillRect(i * 16 + 2, 44, 12, 4);
    x.fillStyle = 'rgba(28,79,102,0.9)';
    x.fillRect(i * 16 + 9, 52, 5, 8);
  }
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, 60, 256, 4);
  return c;
}

function bracketCanvas() {
  const c = cvs(128, 64), x = c.getContext('2d');
  x.fillStyle = '#123a30';
  x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = 'rgba(255,200,59,0.9)';
    x.fillRect(i * 16 + 6, 10, 4, 16);
    x.fillStyle = 'rgba(200,228,255,0.75)';
    x.fillRect(i * 16 + 2, 26, 12, 6);
    x.fillStyle = 'rgba(255,255,255,0.65)';
    x.fillRect(i * 16 + 4, 32, 8, 4);
    x.fillStyle = 'rgba(255,200,59,0.55)';
    x.fillRect(i * 16 + 3, 36, 10, 6);
  }
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.fillRect(0, 56, 128, 8);
  return c;
}

function doorCanvas() {
  const c = cvs(128, 256), x = c.getContext('2d');
  x.fillStyle = '#7a2a1e';
  x.fillRect(0, 0, 128, 256);
  x.strokeStyle = 'rgba(255,200,59,0.55)';
  x.lineWidth = 3;
  x.strokeRect(6, 6, 116, 244);
  x.beginPath(); x.moveTo(64, 6); x.lineTo(64, 250); x.stroke();
  for (let r = 0; r < 7; r++) {
    for (let i = 0; i < 4; i++) {
      x.fillStyle = 'rgba(255,200,59,0.75)';
      x.beginPath(); x.arc(20 + i * 30, 26 + r * 34, 4, 0, Math.PI * 2); x.fill();
    }
  }
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, 240, 128, 16);
  return c;
}

function latticeCanvas() {
  const c = cvs(128, 128), x = c.getContext('2d');
  x.fillStyle = '#3a1c14';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(190,140,70,0.85)';
  x.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, 128); x.stroke();
    x.beginPath(); x.moveTo(0, i * 16); x.lineTo(128, i * 16); x.stroke();
  }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
    x.strokeStyle = 'rgba(230,180,90,0.5)';
    x.beginPath(); x.arc(16 + i * 32, 16 + k * 32, 10, 0, Math.PI * 2); x.stroke();
  }
  return c;
}

function brickCanvas() {
  const c = cvs(128, 128), x = c.getContext('2d');
  x.fillStyle = '#1d1c19';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(120,110,80,0.25)';
  x.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.stroke(); }
  for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(0, i * 16); x.lineTo(128, i * 16); x.stroke(); }
  return c;
}

function waterNormalCanvas() {
  const c = cvs(128, 128), x = c.getContext('2d'), R = rng(59);
  const img = x.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 128 + (R() - 0.5) * 40;
    img.data[i * 4] = 128 + (R() - 0.5) * 26;
    img.data[i * 4 + 1] = 128 + (R() - 0.5) * 26;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export const TEX = {
  tile: tex(tileCanvas(), 6, 3),
  wall: tex(plasterCanvas('#9c2b23', 11), 3, 2),
  marble: tex(marbleCanvas(), 3, 3),
  paving: tex(pavingCanvas(), 8, 8),
  gravel: tex(plasterCanvas('#6b6355', 17), 6, 6),
  painting: tex(paintingCanvas(), 6, 1),
  bracket: tex(bracketCanvas(), 8, 1),
  door: tex(doorCanvas(), 1, 1),
  lattice: tex(latticeCanvas(), 2, 1),
  brick: tex(brickCanvas(), 4, 4),
  waterN: tex(waterNormalCanvas(), 10, 10, false)
};

export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    roofGold: std({ color: 0xffffff, map: TEX.tile, roughness: 0.42, metalness: 0.22, envMapIntensity: 0.7 }),
    roofDeep: std({ color: 0xe8d8b0, map: TEX.tile, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.6 }),
    ridge: std({ color: 0xffdf88, roughness: 0.3, metalness: 0.65, envMapIntensity: 1.0 }),
    goldMetal: std({ color: PALETTE.gold, roughness: 0.25, metalness: 0.9, envMapIntensity: 1.2 }),
    wallRed: std({ map: TEX.wall, color: 0xffffff, roughness: 0.78, metalness: 0.02 }),
    wallDarkRed: std({ map: TEX.wall, color: 0xcfc6bc, roughness: 0.85, metalness: 0.02 }),
    woodRed: std({ color: PALETTE.woodRed, roughness: 0.55, metalness: 0.05 }),
    woodDark: std({ color: PALETTE.woodDark, roughness: 0.7, metalness: 0.04 }),
    door: std({ map: TEX.door, color: 0xffffff, roughness: 0.5, metalness: 0.15 }),
    lattice: std({ map: TEX.lattice, color: 0xffffff, roughness: 0.55, metalness: 0.12 }),
    painting: std({ map: TEX.painting, color: 0xffffff, roughness: 0.6, metalness: 0.1 }),
    bracket: std({ map: TEX.bracket, color: 0xffffff, roughness: 0.6, metalness: 0.12 }),
    marble: std({ color: PALETTE.marble, map: TEX.marble, roughness: 0.62, metalness: 0.03 }),
    marbleShade: std({ color: PALETTE.marbleShade, map: TEX.marble, roughness: 0.7, metalness: 0.03 }),
    paving: std({ color: 0xffffff, map: TEX.paving, roughness: 0.72, metalness: 0.05 }),
    pavingLight: std({ color: 0xd8d4cc, map: TEX.paving, roughness: 0.7, metalness: 0.05 }),
    gravel: std({ color: 0xe6dccc, map: TEX.gravel, roughness: 0.9, metalness: 0.02 }),
    soil: std({ color: PALETTE.terrain, roughness: 0.95, metalness: 0.0 }),
    carpet: std({ color: 0x8c2b22, roughness: 0.8, metalness: 0.0 }),
    water: std({
      color: PALETTE.water, roughness: 0.08, metalness: 0.32, transparent: true, opacity: 0.9,
      normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1
    }),
    waterDeep: std({ color: 0x223c4c, roughness: 0.1, metalness: 0.3, normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.3, 0.3) }),
    bronze: std({ color: PALETTE.bronze, roughness: 0.42, metalness: 0.75, envMapIntensity: 0.9 }),
    rock: std({ color: PALETTE.rock, roughness: 0.9, metalness: 0.02 }),
    rockDark: std({ color: PALETTE.rockDark, roughness: 0.92, metalness: 0.02 }),
    trunk: std({ color: 0x4a3a2a, roughness: 0.9, metalness: 0.0 }),
    pine: std({ color: PALETTE.foliage, roughness: 0.86, metalness: 0.0 }),
    pineLight: std({ color: PALETTE.foliageLight, roughness: 0.86, metalness: 0.0 }),
    blossom: std({ color: PALETTE.blossom, roughness: 0.8, metalness: 0.0 }),
    lanternRed: std({ color: PALETTE.lanternRed, roughness: 0.55, metalness: 0.05, emissive: 0xff7a3c, emissiveIntensity: 0.0 }),
    lanternGlow: std({ color: 0xfff0d0, emissive: 0xffcf8a, emissiveIntensity: 0.0, roughness: 0.6 }),
    brickFloor: std({ color: PALETTE.brickGold, map: TEX.brick, roughness: 0.24, metalness: 0.18, envMapIntensity: 0.8 }),
    interiorWood: std({ color: 0x6d2a20, roughness: 0.6, metalness: 0.05 }),
    interiorGold: std({ color: PALETTE.goldDeep, roughness: 0.3, metalness: 0.72, envMapIntensity: 1.0 }),
    interiorCeil: std({ color: 0x2a2b3a, roughness: 0.7, metalness: 0.1 }),
    screen: std({ color: 0x1d4a3e, map: TEX.painting, roughness: 0.6, metalness: 0.1 }),
    bedSilk: std({ color: 0x9c2b4a, roughness: 0.75, metalness: 0.02 }),
    shadow: std({ color: 0x000000, roughness: 1, metalness: 0, transparent: true, opacity: 0.28 })
  };
  for (const k of Object.keys(M)) {
    if (M[k].map) M[k].map.repeat.set(M[k].map.repeat.x, M[k].map.repeat.y);
  }
  return M;
}

export function applyTimePreset(materials, preset, lanternLevel) {
  const emissive = lanternLevel || 0;
  for (const m of [materials.roofGold, materials.roofDeep]) {
    m.roughness = 0.42 + preset.wp * 0.12;
  }
  materials.lanternRed.emissiveIntensity = 0.15 + emissive * 1.5;
  materials.lanternGlow.emissiveIntensity = emissive * 2.2;
  materials.marble.envMapIntensity = 0.5 + preset.wp * 0.6;
  materials.water.envMapIntensity = 1.0 + preset.wp * 0.5;
}
