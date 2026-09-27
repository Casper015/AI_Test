/**
 * Zone C · 内廷后宫区 (Inner Palace)
 * 拥有：乾清门广场、后三宫（乾清宫、交泰殿、坤宁宫含东暖阁寝殿内景）、
 * 东西配房、毓庆宫与斋宫
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
  zone.root.name = 'inner-palace-zone';

  // 1. Connectors owned by Zone C
  zone.connectors.push(
    { id: 'axial-inner', position: [0, 0, 83], width: 30, targetZone: 'inner' },
    { id: 'west-north', position: [-104, 0, 180], width: 14, targetZone: 'west' },
    { id: 'east-north', position: [104, 0, 180], width: 14, targetZone: 'east' }
  );

  // 2. Courtyards in Inner Palace
  // Courtyard 1: Qianqing Gate Plaza (乾清门前广场)
  kit.makeCourtyard(zone, {
    id: 'in-qianqing-court',
    name: '乾清门前听政广场',
    x: 0,
    z: 105,
    width: 194,
    depth: 44,
    gate: 'both',
    gateWidth: 28,
    wallHeight: 5.2,
    wallThickness: 2.2,
    paving: mats.ground
  });

  // Courtyard 2: Three Back Palaces Grand Court (后三宫主院落: 乾清宫、交泰殿、坤宁宫)
  kit.makeCourtyard(zone, {
    id: 'in-housangong-court',
    name: '后三宫内廷核心大院',
    x: 0,
    z: 200,
    width: 140,
    depth: 145,
    gate: 'both',
    gateWidth: 22,
    wallHeight: 5.4,
    wallThickness: 2.2,
    paving: mats.ground
  });

  // Courtyard 3: Fasting Palace Court (斋宫院落)
  kit.makeCourtyard(zone, {
    id: 'in-zhaigong-court',
    name: '斋宫清修禁院',
    x: 75,
    z: 200,
    width: 45,
    depth: 70,
    gate: 'south',
    gateWidth: 12,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 4: Crown Prince Yuqing Palace Court (毓庆宫院)
  kit.makeCourtyard(zone, {
    id: 'in-yuqing-court',
    name: '皇太子毓庆宫廷院',
    x: 75,
    z: 275,
    width: 45,
    depth: 50,
    gate: 'south',
    gateWidth: 12,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Central axial paving for inner palace
  const innerAvenue = new THREE.Mesh(new THREE.BoxGeometry(14, 0.22, 180), mats.procession);
  innerAvenue.position.set(0, 0.11, 205);
  innerAvenue.receiveShadow = true;
  zone.root.add(innerAvenue);

  // 3. Buildings in Inner Palace
  // Building 1: Gate of Heavenly Purity (乾清门)
  kit.addBuilding(zone, {
    id: 'in-qianqing-men',
    name: '乾清门',
    kind: 'gate',
    category: '内廷正门',
    x: 0,
    z: 128,
    width: 44,
    depth: 20,
    height: 14,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '紫禁城内廷正门，清代皇帝御门听政的主要场所，门前高踞两尊鎏金铜狮，东西有八字琉璃影壁。'
  });

  // Gilt bronze lions at Qianqing Gate
  zone.root.add(kit.makeBronzeStatue({ x: -16, z: 120, type: 'lion' }));
  zone.root.add(kit.makeBronzeStatue({ x: 16, z: 120, type: 'lion' }));

  // Building 2 & 3: Longzong Gate & Jingyun Gate (隆宗门 & 景运门)
  kit.addBuilding(zone, {
    id: 'in-longzong-men',
    name: '隆宗门',
    kind: 'gate',
    category: '内廷要津门',
    x: -94,
    z: 105,
    width: 14,
    depth: 10,
    height: 8.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '乾清门广场西侧要津门，直通军机处与慈宁宫，门匾上至今保留嘉庆天理教攻打留下的折铁箭镞。'
  });
  kit.addBuilding(zone, {
    id: 'in-jingyun-men',
    name: '景运门',
    kind: 'gate',
    category: '内廷要津门',
    x: 94,
    z: 105,
    width: 14,
    depth: 10,
    height: 8.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '乾清门广场东侧要津门，直通奉先殿、宁寿宫及东华门。'
  });

  // Building 4: Palace of Heavenly Purity (乾清宫)
  kit.addBuilding(zone, {
    id: 'in-qianqing-gong',
    name: '乾清宫',
    kind: 'hall',
    category: '后三宫之首',
    x: 0,
    z: 168,
    width: 54,
    depth: 30,
    height: 20,
    tiers: 2,
    roofType: 'wudian',
    openFront: true,
    interiorType: 'bedchamber',
    access: '可进入',
    description: '内廷后三宫之首，重檐庑殿顶。明清皇帝日常寝宫及处理政务正寝，正大光明匾高悬宝座之上，建储匣藏于其后。'
  });

  // Building 5: Hall of Union (交泰殿)
  kit.addBuilding(zone, {
    id: 'in-jiaotai-dian',
    name: '交泰殿',
    kind: 'hall',
    category: '后三宫中殿',
    x: 0,
    z: 208,
    width: 22,
    depth: 22,
    height: 13.5,
    tiers: 1,
    roofType: 'pyramid',
    access: '外观可览',
    description: '乾清宫与坤宁宫之间的正方形殿堂，单檐四角攒尖顶。殿内收藏乾隆钦定的二十五方代表国家皇权的御宝玉玺。'
  });

  // Building 6: Palace of Earthly Tranquility (坤宁宫，重点可进东暖阁内景)
  kit.addBuilding(zone, {
    id: 'in-kunning-gong',
    name: '坤宁宫（东暖阁寝殿）',
    kind: 'hall',
    category: '后三宫之后寝',
    x: 0,
    z: 248,
    width: 48,
    depth: 26,
    height: 16.5,
    tiers: 2,
    roofType: 'wudian',
    openFront: true,
    interiorType: 'bedchamber',
    access: '可进入',
    description: '明代中宫皇后正寝，清代改为萨满祭祀神堂与大婚洞房。东暖阁完好保留红漆金花双喜床榻与龙凤帷幔内景。'
  });

  // Building 7: Kunning Gate (坤宁门)
  kit.addBuilding(zone, {
    id: 'in-kunning-men',
    name: '坤宁门',
    kind: 'gate',
    category: '内廷北门',
    x: 0,
    z: 285,
    width: 26,
    depth: 12,
    height: 9.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '后三宫北出入口，出门即见御花园高耸的古柏与堆秀山。'
  });

  // Building 8 & 9: Duanning Hall & Maode Hall (端凝殿 & 懋德殿)
  kit.addBuilding(zone, {
    id: 'in-duanning-dian',
    name: '端凝殿',
    kind: 'sideHall',
    category: '乾清宫东配殿',
    x: 48,
    z: 168,
    width: 14,
    depth: 26,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乾清宫东庑重要配殿，清代为皇帝御用冠服及内务府存放御衣之处。'
  });
  kit.addBuilding(zone, {
    id: 'in-maode-dian',
    name: '懋德殿',
    kind: 'sideHall',
    category: '乾清宫西配殿',
    x: -48,
    z: 168,
    width: 14,
    depth: 26,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乾清宫西庑重要配殿，康熙皇帝幼年读书学习之处，清代为翰林学士进讲之地。'
  });

  // Building 10 & 11: Yuehua Gate & Rijing Gate (月华门 & 日精门)
  kit.addBuilding(zone, {
    id: 'in-yuehua-men',
    name: '月华门',
    kind: 'gate',
    category: '内廷侧仪门',
    x: -68,
    z: 152,
    width: 12,
    depth: 8,
    height: 7.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '后三宫通往养心殿与西六宫的西侧仪门。'
  });
  kit.addBuilding(zone, {
    id: 'in-rijing-men',
    name: '日精门',
    kind: 'gate',
    category: '内廷侧仪门',
    x: 68,
    z: 152,
    width: 12,
    depth: 8,
    height: 7.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '后三宫通往斋宫与东六宫的东侧仪门。'
  });

  // Building 12 & 13: Kunning East & West Wing Halls (坤宁宫东配殿 & 西配殿)
  kit.addBuilding(zone, {
    id: 'in-kunning-dong-pei',
    name: '坤宁宫东配殿',
    kind: 'sideHall',
    category: '后寝配殿',
    x: 48,
    z: 248,
    width: 13,
    depth: 24,
    height: 9.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '坤宁宫东侧侍从与内廷典仪用房。'
  });
  kit.addBuilding(zone, {
    id: 'in-kunning-xi-pei',
    name: '坤宁宫西配殿',
    kind: 'sideHall',
    category: '后寝配殿',
    x: -48,
    z: 248,
    width: 13,
    depth: 24,
    height: 9.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '坤宁宫西侧萨满祭祀用品备用配房。'
  });

  // Building 14: Fasting Palace (斋宫)
  kit.addBuilding(zone, {
    id: 'in-zhaigong-dian',
    name: '斋宫',
    kind: 'hall',
    category: '皇家斋戒殿',
    x: 75,
    z: 200,
    width: 26,
    depth: 16,
    height: 12,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '皇帝赴天坛、地坛大祀前三日在宫中斋戒之所，殿前设铜人亭与时辰亭。'
  });

  // Building 15: Crown Prince Yuqing Palace (毓庆宫)
  kit.addBuilding(zone, {
    id: 'in-yuqing-dian',
    name: '毓庆宫',
    kind: 'hall',
    category: '东宫太子宫',
    x: 75,
    z: 275,
    width: 24,
    depth: 15,
    height: 11.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '康熙十八年为皇太子胤礽修建之寝宫，后为清帝幼年读书受教处，光绪帝曾在此读书。'
  });

  // Building 16 & 17: East & West Axial Covered Corridors
  kit.addBuilding(zone, {
    id: 'in-xi-langwu',
    name: '后三宫西复道长廊',
    kind: 'corridor',
    category: '廊道建筑',
    x: -58,
    z: 208,
    width: 7,
    depth: 68,
    height: 6.8,
    tiers: 1,
    roofType: 'wudian',
    access: '外观可览',
    description: '贯通乾清宫与坤宁宫西侧的有顶复道游廊。'
  });
  kit.addBuilding(zone, {
    id: 'in-dong-langwu',
    name: '后三宫东复道长廊',
    kind: 'corridor',
    category: '廊道建筑',
    x: 58,
    z: 208,
    width: 7,
    depth: 68,
    height: 6.8,
    tiers: 1,
    roofType: 'wudian',
    access: '外观可览',
    description: '贯通乾清宫与坤宁宫东侧的有顶复道游廊。'
  });

  // Palace Lanterns in Inner Palace Court
  for (const lz of [150, 185, 225, 265]) {
    zone.root.add(kit.makeLamp({ x: -28, z: lz, height: 3.5 }));
    zone.root.add(kit.makeLamp({ x: 28, z: lz, height: 3.5 }));
  }

  // Ancient Cypresses in Inner Court
  zone.root.add(kit.makeTree({ x: -35, z: 275, scale: 1.0, type: 'cypress' }));
  zone.root.add(kit.makeTree({ x: 35, z: 275, scale: 1.0, type: 'cypress' }));

  return zone;
}
