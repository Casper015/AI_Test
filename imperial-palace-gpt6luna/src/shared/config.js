export const CONFIG = Object.freeze({
  styleVersion: 'v1',
  seed: 1420,
  world: Object.freeze({ halfWidth: 300, halfDepth: 450, moat: 34, groundY: 0 }),
  colors: Object.freeze({
    roofGold: '#d8a83c', roofShadow: '#a8762c', vermilion: '#8f2d26', darkLacquer: '#561e1b',
    jade: '#2e5547', marble: '#d9d5c9', courtyardStone: '#555650', warmGold: '#e1c17a',
    foliage: '#4f6347', water: '#394c48', deepGround: '#25312b', nightSky: '#111922'
  }),
  buildingTargets: Object.freeze({ min: 50, courtyards: 12 }),
  camera: Object.freeze({ fov: 42, transition: 1.2, start: [900, 920, -1160], target: [0, 0, 10] }),
  quality: Object.freeze({ maxDpr: 1.65, lowDpr: 1, shadowSize: 2048 })
});
