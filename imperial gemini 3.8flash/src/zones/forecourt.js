/**
 * Zone B · 前朝礼仪区 (Forecourt)
 * 拥有：内金水河与五桥、太和门、三大殿三层须弥座台基、太和殿（金銮殿可进内景）、中和殿、保和殿及配殿
 */
export function createZone(ctx) {
  const { THREE, kit, layout } = ctx;
  const mats = kit.materials;

  const zone = {
    root: new THREE.Group(),
    buildings: [],
    courtyards: [],
    connectors: [],
    colliders: []
  };
  zone.root.name = 'forecourt-zone';

  // 1. Connectors owned by Zone B
  zone.connectors.push(
    { id: 'forecourt-south', position: [0, 0, -398], width: 38, targetZone: 'forecourt' },
    { id: 'west-south', position: [-104, 0, -180], width: 14, targetZone: 'west' },
    { id: 'east-south', position: [104, 0, -180], width: 14, targetZone: 'east' }
  );

  // 2. Ceremonial Ground and Canal
  // Jinshui River (内金水河)
  const canalW = 210;
  const canalD = 18;
  const canalMesh = new THREE.Mesh(new THREE.BoxGeometry(canalW, 1.2, canalD), mats.water);
  canalMesh.position.set(0, -0.6, -330);
  canalMesh.receiveShadow = true;
  zone.root.add(canalMesh);

  // 5 Inner Jinshui Bridges (内金水五桥)
  const bridgeXs = [-36, -18, 0, 18, 36];
  for (let i = 0; i < bridgeXs.length; i++) {
    const isImperial = i === 2;
    const b = kit.makeBridge({
      length: 22,
      width: isImperial ? 8.5 : 6.2,
      height: 1.8,
      x: bridgeXs[i],
      y: 0,
      z: -330
    });
    zone.root.add(b);
  }

  // 3. Courtyards in Forecourt
  // Courtyard 1: Jinshui Plaza (内金水桥广场)
  kit.makeCourtyard(zone, {
    id: 'fc-jinshui-court',
    name: '内金水桥仪仗广场',
    x: 0,
    z: -340,
    width: 190,
    depth: 90,
    gate: 'south',
    gateWidth: 42,
    wallHeight: 5.5,
    wallThickness: 2.4,
    paving: mats.ground
  });

  // Courtyard 2: Grand Taihe Plaza (太和殿礼仪广场 - 30,000平米宏大空间)
  kit.makeCourtyard(zone, {
    id: 'fc-taihe-court',
    name: '太和殿万国来朝礼仪广场',
    x: 0,
    z: -175,
    width: 196,
    depth: 180,
    gate: 'both',
    gateWidth: 32,
    wallHeight: 5.6,
    wallThickness: 2.4,
    paving: mats.ground
  });

  // Courtyard 3: Three Great Halls Terrace Court (前朝三大殿院)
  kit.makeCourtyard(zone, {
    id: 'fc-sandai-court',
    name: '前朝三大殿须弥庭院',
    x: 0,
    z: -10,
    width: 196,
    depth: 130,
    gate: 'both',
    gateWidth: 28,
    wallHeight: 5.2,
    wallThickness: 2.2,
    paving: mats.ground
  });

  // Courtyard 4: Baohe Rear Court (保和殿北庭)
  kit.makeCourtyard(zone, {
    id: 'fc-baohe-court',
    name: '保和殿后廷连接院',
    x: 0,
    z: 60,
    width: 196,
    depth: 42,
    gate: 'both',
    gateWidth: 26,
    wallHeight: 5.0,
    wallThickness: 2.0,
    paving: mats.ground
  });

  // Central Marble Procession Avenue (御路青石道)
  const processionRoad = new THREE.Mesh(new THREE.BoxGeometry(16, 0.22, 460), mats.procession);
  processionRoad.position.set(0, 0.11, -150);
  processionRoad.receiveShadow = true;
  zone.root.add(processionRoad);

  // 4. Three-Tier White Marble Terrace (须弥座三台: 高 4.5米，承载太和、中和、保和三大殿)
  const terrace = kit.makeTerrace({
    width: 120,
    depth: 180,
    height: 4.5,
    tiers: 3,
    x: 0,
    y: 0,
    z: -15,
    dragonRamp: true
  });
  zone.root.add(terrace);

  // 5. Buildings in Forecourt Zone
  // Building 1: Gate of Supreme Harmony (太和门)
  kit.addBuilding(zone, {
    id: 'fc-taihe-men',
    name: '太和门',
    kind: 'gate',
    category: '前朝宫门',
    x: 0,
    z: -268,
    width: 52,
    depth: 24,
    height: 16,
    tiers: 2,
    roofType: 'xieshan',
    access: '可通行',
    description: '紫禁城前朝正门，明清两代皇帝御门听政之所，门前置一对宏伟明代铜狮。'
  });

  // Bronze lions at Taihe Gate
  zone.root.add(kit.makeBronzeStatue({ x: -28, z: -278, type: 'lion' }));
  zone.root.add(kit.makeBronzeStatue({ x: 28, z: -278, type: 'lion' }));

  // Building 2 & 3: Zhendu Gate and Zhaode Gate (贞度门 & 昭德门)
  kit.addBuilding(zone, {
    id: 'fc-zhendu-men',
    name: '贞度门',
    kind: 'gate',
    category: '侧朝宫门',
    x: -86,
    z: -268,
    width: 18,
    depth: 12,
    height: 9.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '太和门西侧旁门，通往西路武英殿及右翼门。'
  });
  kit.addBuilding(zone, {
    id: 'fc-zhaode-men',
    name: '昭德门',
    kind: 'gate',
    category: '侧朝宫门',
    x: 86,
    z: -268,
    width: 18,
    depth: 12,
    height: 9.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '太和门东侧旁门，通往东路文华殿及左翼门。'
  });

  // Building 4 & 5: Chaofang Galleries (东朝房 & 西朝房)
  kit.addBuilding(zone, {
    id: 'fc-xi-chaofang',
    name: '西朝房',
    kind: 'corridor',
    category: '朝房配殿',
    x: -92,
    z: -340,
    width: 11,
    depth: 82,
    height: 7.2,
    tiers: 1,
    roofType: 'wudian',
    access: '外观可览',
    description: '前朝西路朝房，文武大臣早朝候旨之所。'
  });
  kit.addBuilding(zone, {
    id: 'fc-dong-chaofang',
    name: '东朝房',
    kind: 'corridor',
    category: '朝房配殿',
    x: 92,
    z: -340,
    width: 11,
    depth: 82,
    height: 7.2,
    tiers: 1,
    roofType: 'wudian',
    access: '外观可览',
    description: '前朝东路朝房，大臣朝参宿卫值宿之所。'
  });

  // Building 6: Hall of Supreme Harmony (太和殿 - 金銮殿，重点可进内景)
  kit.addBuilding(zone, {
    id: 'fc-taihe-dian',
    name: '太和殿（金銮宝殿）',
    kind: 'hall',
    category: '东方三大殿之首',
    x: 0,
    y: 4.5,
    z: -65,
    width: 65,
    depth: 37,
    height: 24,
    tiers: 2,
    roofType: 'wudian',
    openFront: true,
    interiorType: 'taihe',
    foundationH: 1.2,
    access: '可进入',
    description: '中国古代规格最高建筑，金面琉璃、重檐庑殿顶。内设九龙金漆宝座、雕龙屏风与盘龙金柱藻井，国家大典即在此举行。'
  });

  // Bronze lions & bronze incense burners in front of Taihe Hall (on terrace)
  zone.root.add(kit.makeBronzeStatue({ x: -35, y: 4.5, z: -88, type: 'lion' }));
  zone.root.add(kit.makeBronzeStatue({ x: 35, y: 4.5, z: -88, type: 'lion' }));
  zone.root.add(kit.makeBronzeStatue({ x: -16, y: 4.5, z: -86, type: 'ding' }));
  zone.root.add(kit.makeBronzeStatue({ x: 16, y: 4.5, z: -86, type: 'ding' }));

  // Building 7: Hall of Central Harmony (中和殿)
  kit.addBuilding(zone, {
    id: 'fc-zhonghe-dian',
    name: '中和殿',
    kind: 'hall',
    category: '东方三大殿',
    x: 0,
    y: 4.5,
    z: -15,
    width: 25,
    depth: 25,
    height: 15,
    tiers: 1,
    roofType: 'pyramid',
    foundationH: 1.0,
    access: '外观可览',
    description: '三大殿中殿，平面呈正方形，单檐四角攒尖鎏金宝顶。皇帝赴太和殿大典前在此阅视奏章、休憩更衣。'
  });

  // Building 8: Hall of Preserving Harmony (保和殿)
  kit.addBuilding(zone, {
    id: 'fc-baohe-dian',
    name: '保和殿',
    kind: 'hall',
    category: '东方三大殿',
    x: 0,
    y: 4.5,
    z: 32,
    width: 55,
    depth: 29,
    height: 18.5,
    tiers: 2,
    roofType: 'xieshan',
    foundationH: 1.2,
    access: '外观可览',
    description: '三大殿后殿，重檐歇山顶。清代每年除夕赐宴蒙古王公及举行殿试大典之处，后阶置著名云龙大石雕。'
  });

  // Building 9 & 10: Hongyi Pavilion and Tiren Pavilion (弘义阁 & 体仁阁)
  kit.addBuilding(zone, {
    id: 'fc-hongyi-ge',
    name: '弘义阁',
    kind: 'hall',
    category: '太和殿配阁',
    x: -88,
    z: -65,
    width: 27,
    depth: 17,
    height: 14.5,
    tiers: 2,
    roofType: 'xieshan',
    access: '外观可览',
    description: '太和殿西庑中段宏伟楼阁，明代藏《永乐大典》，清代为银库。'
  });
  kit.addBuilding(zone, {
    id: 'fc-tiren-ge',
    name: '体仁阁',
    kind: 'hall',
    category: '太和殿配阁',
    x: 88,
    z: -65,
    width: 27,
    depth: 17,
    height: 14.5,
    tiers: 2,
    roofType: 'xieshan',
    access: '外观可览',
    description: '太和殿东庑中段宏伟楼阁，康熙年间曾开博学鸿词科于此，后为内务府缎库。'
  });

  // Building 11 & 12: Zhongyou Gate and Zhongzuo Gate (中右门 & 中左门)
  kit.addBuilding(zone, {
    id: 'fc-zhongyou-men',
    name: '中右门',
    kind: 'gate',
    category: '前朝通道门',
    x: -88,
    z: -15,
    width: 16,
    depth: 11,
    height: 8.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '太和殿与中和殿西侧的重要通道门，通往后三宫西长街。'
  });
  kit.addBuilding(zone, {
    id: 'fc-zhongzuo-men',
    name: '中左门',
    kind: 'gate',
    category: '前朝通道门',
    x: 88,
    z: -15,
    width: 16,
    depth: 11,
    height: 8.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '太和殿与中和殿东侧的重要通道门，通往东长街。'
  });

  // Building 13 & 14: Houyou Gate and Houzuo Gate (后右门 & 后左门)
  kit.addBuilding(zone, {
    id: 'fc-houyou-men',
    name: '后右门',
    kind: 'gate',
    category: '前朝通道门',
    x: -88,
    z: 32,
    width: 16,
    depth: 11,
    height: 8.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '保和殿西侧北门，通往内廷养心殿及西六宫。'
  });
  kit.addBuilding(zone, {
    id: 'fc-houzuo-men',
    name: '后左门',
    kind: 'gate',
    category: '前朝通道门',
    x: 88,
    z: 32,
    width: 16,
    depth: 11,
    height: 8.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '保和殿东侧北门，通往内廷斋宫及东六宫。'
  });

  // Building 15 & 16: Grand Colonnades (太和殿东庑与西庑廊庑)
  kit.addBuilding(zone, {
    id: 'fc-xi-langwu',
    name: '太和殿西庑连廊',
    kind: 'corridor',
    category: '廊庑建筑',
    x: -92,
    z: -170,
    width: 10,
    depth: 120,
    height: 7.4,
    tiers: 1,
    roofType: 'wudian',
    access: '外观可览',
    description: '前朝广场西侧连绵长廊，围合仪仗大广场。'
  });
  kit.addBuilding(zone, {
    id: 'fc-dong-langwu',
    name: '太和殿东庑连廊',
    kind: 'corridor',
    category: '廊庑建筑',
    x: 92,
    z: -170,
    width: 10,
    depth: 120,
    height: 7.4,
    tiers: 1,
    roofType: 'wudian',
    access: '外观可览',
    description: '前朝广场东侧连绵长廊，整齐宏阔。'
  });

  // Building 17 & 18: Wuying and Wenhua passage portals
  kit.addBuilding(zone, {
    id: 'fc-xi-tongdao-men',
    name: '西华通衢仪门',
    kind: 'gate',
    category: '跨区仪门',
    x: -94,
    z: -220,
    width: 14,
    depth: 9,
    height: 8.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '太和广场西通向武英殿区域的礼仪通道门。'
  });
  kit.addBuilding(zone, {
    id: 'fc-dong-tongdao-men',
    name: '东华通衢仪门',
    kind: 'gate',
    category: '跨区仪门',
    x: 94,
    z: -220,
    width: 14,
    depth: 9,
    height: 8.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '太和广场东通向文华殿区域的礼仪通道门。'
  });

  // Palace Lanterns along the Great Courtyard
  const lampZs = [-240, -210, -180, -150, -120];
  for (const lz of lampZs) {
    zone.root.add(kit.makeLamp({ x: -84, z: lz, height: 3.8 }));
    zone.root.add(kit.makeLamp({ x: 84, z: lz, height: 3.8 }));
  }

  // Pines flanking the canal
  for (let px of [-75, -55, 55, 75]) {
    zone.root.add(kit.makeTree({ x: px, z: -355, scale: 1.1, type: 'pine' }));
  }

  return zone;
}
