export const CONFIG = Object.freeze({
  projectName: '紫禁天朝 · 东方皇家宫殿 3D 沉浸式交互项目',
  version: '1.0.0',
  agentTeam: 'Gemini 3.8 Flash Autonomous Multi-Agent Team',
  styleVersion: 'v1.0',
  seed: 20260926,
  world: Object.freeze({
    halfWidth: 300,
    halfDepth: 450,
    wallHeight: 10,
    wallThickness: 6.5,
    moatWidth: 38,
    moatDepth: 3.5,
    groundY: 0
  }),
  colors: Object.freeze({
    // Imperial architecture palette
    roofGold: '#dfa112',       // 琉璃金
    roofShadow: '#a66f18',     // 瓦楞阴影
    roofRidge: '#e8b835',      // 脊兽金黄
    roofDarkTile: '#23302b',   // 文渊阁墨绿/黑琉璃瓦
    vermilion: '#962822',      // 宫墙朱红
    wallAlt: '#82221c',        // 廊柱深红
    darkLacquer: '#4d1a18',    // 门扇额枋深漆
    jade: '#1c4e40',           // 青绿彩画
    jadeLight: '#2c6e5c',      // 沥粉贴金底色
    marble: '#f0ece1',         // 汉白玉台基
    marbleCarved: '#e2ddd0',   // 须弥座雕花栏杆
    courtyardStone: '#575652', // 庭院方砖铺地
    processionStone: '#8a8370',// 御路中轴青石板
    goldBrick: '#1d1b18',      // 太和殿金砖
    giltGold: '#ffc83b',       // 鎏金宝座/宝顶
    // Nature and environment
    foliagePine: '#344b32',    // 苍松墨绿
    foliageCypress: '#445f3f', // 翠柏
    foliageBlossom: '#d47b85', // 海棠粉红
    foliageWillow: '#5c7849',  // 御河垂柳
    waterMoat: '#284643',      // 护城河微澜
    waterPond: '#2d504a',      // 花园莲池
    trunk: '#4a3525',          // 古木树干
    lanternGlow: '#ffaa33',    // 宫灯暖光
    lanternBody: '#98251e',    // 宫灯红纱
    rockeryStone: '#615f5a',   // 堆秀山太湖石
    // Sky and lighting
    goldenSun: '#fff3d1',
    goldenSky: '#d8d5c4',
    duskSun: '#ff7733',
    duskSky: '#693836',
    nightSun: '#4466aa',
    nightSky: '#0b111a'
  }),
  buildingTargets: Object.freeze({
    min: 60,
    courtyards: 16
  }),
  camera: Object.freeze({
    fov: 44,
    near: 0.5,
    far: 4200,
    transition: 1.2,
    start: [850, 880, -1120],
    target: [0, 0, 10]
  }),
  quality: Object.freeze({
    highDpr: 1.5,
    lowDpr: 1.0,
    shadowSize: 2048,
    shadowCameraSize: 680
  }),
  firstPerson: Object.freeze({
    eyeHeight: 1.72,
    moveSpeed: 16.0,
    sprintMultiplier: 2.2,
    collisionRadius: 0.85
  })
});
