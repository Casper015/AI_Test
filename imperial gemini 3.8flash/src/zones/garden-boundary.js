/**
 * Zone F · 御花园与宫城边界 (Garden & Boundary)
 * 拥有：完整四面高大朱红外宫墙、四角九梁十八柱角楼、
 * 午门（五凤楼雁翅楼）、神武门、东华门、西华门、环城护城河（筒子河）及御花园（堆秀山御景亭、万春千秋二亭、钦安殿）
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
  zone.root.name = 'garden-boundary-zone';

  // 1. Connectors owned by Zone F
  zone.connectors.push(
    { id: 'gate-south', position: [0, 0, -430], width: 34, targetZone: 'forecourt' },
    { id: 'gate-north', position: [0, 0, 430], width: 26, targetZone: 'garden' },
    { id: 'gate-west', position: [-284, 0, 0], width: 22, targetZone: 'west' },
    { id: 'gate-east', position: [284, 0, 0], width: 22, targetZone: 'east' },
    { id: 'inner-garden', position: [0, 0, 302], width: 24, targetZone: 'garden' }
  );

  // 2. Courtyards in Zone F
  kit.makeCourtyard(zone, {
    id: 'gb-garden-court',
    name: '御花园皇家苑囿主园',
    x: 0,
    z: 360,
    width: 250,
    depth: 110,
    gate: 'both',
    gateWidth: 26,
    wallHeight: 4.8,
    wallThickness: 2.0,
    paving: mats.ground
  });

  kit.makeCourtyard(zone, {
    id: 'gb-wumen-court',
    name: '午门外阙礼仪广场',
    x: 0,
    z: -425,
    width: 240,
    depth: 45,
    gate: 'south',
    gateWidth: 36,
    wallHeight: 5.6,
    wallThickness: 2.5,
    paving: mats.ground
  });

  kit.makeCourtyard(zone, {
    id: 'gb-shenwu-court',
    name: '神武门内苑北进院',
    x: 0,
    z: 420,
    width: 240,
    depth: 30,
    gate: 'both',
    gateWidth: 28,
    wallHeight: 5.2,
    wallThickness: 2.2,
    paving: mats.ground
  });

  // 3. Complete Enclosing Outer City Walls (600m x 900m 外皇宫城墙与黄瓦城垛)
  const wallH = 10.5;
  const wallT = 6.8;
  const halfW = 296;
  const halfD = 446;

  // South Wall (divided by Meridian Gate at center)
  const sw1 = kit.makeWall({ start: [-halfW, -halfD], end: [-35, -halfD], height: wallH, thickness: wallT });
  const sw2 = kit.makeWall({ start: [35, -halfD], end: [halfW, -halfD], height: wallH, thickness: wallT });

  // North Wall (divided by Shenwu Gate at center)
  const nw1 = kit.makeWall({ start: [-halfW, halfD], end: [-26, halfD], height: wallH, thickness: wallT });
  const nw2 = kit.makeWall({ start: [26, halfD], end: [halfW, halfD], height: wallH, thickness: wallT });

  // West Wall (divided by Xihua Gate at center)
  const ww1 = kit.makeWall({ start: [-halfW, -halfD], end: [-halfW, -22], height: wallH, thickness: wallT });
  const ww2 = kit.makeWall({ start: [-halfW, 22], end: [-halfW, halfD], height: wallH, thickness: wallT });

  // East Wall (divided by Donghua Gate at center)
  const ew1 = kit.makeWall({ start: [halfW, -halfD], end: [halfW, -22], height: wallH, thickness: wallT });
  const ew2 = kit.makeWall({ start: [halfW, 22], end: [halfW, halfD], height: wallH, thickness: wallT });

  for (const w of [sw1, sw2, nw1, nw2, ww1, ww2, ew1, ew2]) {
    zone.root.add(w);
    if (w.userData?.colliders) zone.colliders.push(...w.userData.colliders);
  }

  // 4. Moat / Tongzi River (筒子河水系围绕四周)
  const moatW = 38;
  const outerW = (halfW + moatW + 10) * 2;
  const outerD = (halfD + moatW + 10) * 2;
  // South Moat
  const sMoat = new THREE.Mesh(new THREE.BoxGeometry(outerW, 1.4, moatW), mats.water);
  sMoat.position.set(0, -0.65, -halfD - moatW / 2 - 4);
  zone.root.add(sMoat);
  // North Moat
  const nMoat = new THREE.Mesh(new THREE.BoxGeometry(outerW, 1.4, moatW), mats.water);
  nMoat.position.set(0, -0.65, halfD + moatW / 2 + 4);
  zone.root.add(nMoat);
  // West Moat
  const wMoat = new THREE.Mesh(new THREE.BoxGeometry(moatW, 1.4, outerD), mats.water);
  wMoat.position.set(-halfW - moatW / 2 - 4, -0.65, 0);
  zone.root.add(wMoat);
  // East Moat
  const eMoat = new THREE.Mesh(new THREE.BoxGeometry(moatW, 1.4, outerD), mats.water);
  eMoat.position.set(halfW + moatW / 2 + 4, -0.65, 0);
  zone.root.add(eMoat);

  // South Entrance Marble Bridges across Moat
  const outerBridge = kit.makeBridge({ length: 42, width: 14, height: 2.2, x: 0, y: 0, z: -halfD - moatW / 2 - 4 });
  zone.root.add(outerBridge);

  // 5. Four Iconic Corner Towers (四角九梁十八柱七十二条脊角楼)
  const cornerCoords = [
    { id: 'gb-corner-se', name: '东南角楼', x: halfW - 2, z: -halfD + 2 },
    { id: 'gb-corner-sw', name: '西南角楼', x: -halfW + 2, z: -halfD + 2 },
    { id: 'gb-corner-ne', name: '东北角楼', x: halfW - 2, z: halfD - 2 },
    { id: 'gb-corner-nw', name: '西北角楼', x: -halfW + 2, z: halfD - 2 }
  ];

  for (const cc of cornerCoords) {
    kit.addBuilding(zone, {
      id: cc.id,
      name: cc.name,
      kind: 'cornerTower',
      category: '皇宫四角楼',
      x: cc.x,
      z: cc.z,
      width: 24,
      depth: 24,
      height: 22,
      tiers: 3,
      roofType: 'cornerTower',
      access: '外观可览',
      description: '紫禁城四角标志性防御建筑，三层多角檐复合十字歇山顶，俗称九梁十八柱七十二条脊。'
    });
  }

  // 6. Outer Gates
  // Meridian Gate (午门五凤楼)
  kit.addBuilding(zone, {
    id: 'gb-wumen-main',
    name: '午门（五凤楼正殿）',
    kind: 'gate',
    category: '紫禁城南正门',
    x: 0,
    z: -446,
    width: 68,
    depth: 30,
    height: 28,
    tiers: 2,
    roofType: 'wudian',
    access: '可通行',
    description: '紫禁城正门，南面三门，两翼凹形双阙延伸出燕翅楼，城楼如凤展翅，俗称五凤楼。皇帝在此颁朔与受俘。'
  });

  // Meridian Gate Wings (午门东西雁翅阙楼)
  kit.addBuilding(zone, {
    id: 'gb-wumen-xi-que',
    name: '午门西雁翅阙楼',
    kind: 'gate',
    category: '午门西翼',
    x: -48,
    z: -428,
    width: 22,
    depth: 42,
    height: 22,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '午门西阙突出楼阁，下设左右掖门。'
  });
  kit.addBuilding(zone, {
    id: 'gb-wumen-dong-que',
    name: '午门东雁翅阙楼',
    kind: 'gate',
    category: '午门东翼',
    x: 48,
    z: -428,
    width: 22,
    depth: 42,
    height: 22,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '午门东阙突出楼阁。'
  });

  // Shenwu Gate (神武门)
  kit.addBuilding(zone, {
    id: 'gb-shenwu-men',
    name: '神武门（玄武门）',
    kind: 'gate',
    category: '紫禁城北正门',
    x: 0,
    z: 446,
    width: 52,
    depth: 26,
    height: 24,
    tiers: 2,
    roofType: 'xieshan',
    access: '可通行',
    description: '紫禁城北门，旧称玄武门。城楼设钟鼓，早晚鸣钟发鼓以定宫禁启闭。'
  });

  // Donghua Gate (东华门)
  kit.addBuilding(zone, {
    id: 'gb-donghua-men',
    name: '东华门',
    kind: 'gate',
    category: '紫禁城东门',
    x: halfW,
    z: 0,
    width: 26,
    depth: 44,
    height: 22,
    tiers: 2,
    roofType: 'xieshan',
    access: '可通行',
    description: '紫禁城东门，门钉纵九横八共七十二枚，清代文武群臣由此门入朝。'
  });

  // Xihua Gate (西华门)
  kit.addBuilding(zone, {
    id: 'gb-xihua-men',
    name: '西华门',
    kind: 'gate',
    category: '紫禁城西门',
    x: -halfW,
    z: 0,
    width: 26,
    depth: 44,
    height: 22,
    tiers: 2,
    roofType: 'xieshan',
    access: '可通行',
    description: '紫禁城西门，西邻西苑三海，皇帝往返西苑必经此门。'
  });

  // 7. Imperial Garden (御花园建筑群)
  // Qin'an Hall (钦安殿 - 花园核心道教正殿)
  kit.addBuilding(zone, {
    id: 'gb-qin-an-dian',
    name: '钦安殿',
    kind: 'hall',
    category: '御花园核心殿',
    x: 0,
    z: 350,
    width: 32,
    depth: 24,
    height: 15.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '御花园中心建筑，供奉北方玄天上帝真武大帝，四周汉白玉围栏环抱，是紫禁城唯一的道教殿堂。'
  });

  // Dui Xiu Shan & Yujing Pavilion (堆秀山与御景亭)
  const rockery = kit.makeRockery({ x: 0, z: 395, scale: 1.4, height: 14 });
  zone.root.add(rockery);

  kit.addBuilding(zone, {
    id: 'gb-yujing-ting',
    name: '御景亭（堆秀山顶亭）',
    kind: 'pavilion',
    category: '皇家叠石绝顶',
    x: 0,
    y: 13.5,
    z: 395,
    width: 14,
    depth: 14,
    height: 9.2,
    tiers: 1,
    roofType: 'pyramid',
    access: '外观可览',
    description: '矗立于十几米高的太湖石堆秀山巅，重阳节帝后在此登高望远，俯瞰全城景致。'
  });

  // Thousand Autumns Pavilion & Ten Thousand Springs Pavilion (千秋亭 & 万春亭)
  kit.addBuilding(zone, {
    id: 'gb-qianqiu-ting',
    name: '千秋亭',
    kind: 'pavilion',
    category: '御花园圆顶名亭',
    x: -42,
    z: 350,
    width: 16,
    depth: 16,
    height: 13.5,
    tiers: 2,
    roofType: 'circle',
    access: '外观可览',
    description: '御花园西侧重檐圆攒尖鎏金宝顶名亭，与东侧万春亭形制一模一样，寓意江山永固、千秋万春。'
  });

  kit.addBuilding(zone, {
    id: 'gb-wanchun-ting',
    name: '万春亭',
    kind: 'pavilion',
    category: '御花园圆顶名亭',
    x: 42,
    z: 350,
    width: 16,
    depth: 16,
    height: 13.5,
    tiers: 2,
    roofType: 'circle',
    access: '外观可览',
    description: '御花园东侧著名重檐圆亭，木构极为巧妙精致。'
  });

  // Chengguang Pavilion & Fubi Pavilion (澄瑞亭 & 浮碧亭)
  kit.addBuilding(zone, {
    id: 'gb-chengguang-ting',
    name: '澄瑞亭',
    kind: 'pavilion',
    category: '水上单檐亭',
    x: -78,
    z: 380,
    width: 15,
    depth: 15,
    height: 10.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '跨建于御花园碧波水池之上的水榭凉亭。'
  });

  kit.addBuilding(zone, {
    id: 'gb-fubi-ting',
    name: '浮碧亭',
    kind: 'pavilion',
    category: '水上单檐亭',
    x: 78,
    z: 380,
    width: 15,
    depth: 15,
    height: 10.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '浮碧池上水亭，观赏游鳞与荷花胜地。'
  });

  // Ponds under water pavilions
  const pond1 = new THREE.Mesh(new THREE.BoxGeometry(24, 0.6, 24), mats.waterPond);
  pond1.position.set(-78, 0.15, 380);
  zone.root.add(pond1);
  const pond2 = new THREE.Mesh(new THREE.BoxGeometry(24, 0.6, 24), mats.waterPond);
  pond2.position.set(78, 0.15, 380);
  zone.root.add(pond2);

  // Jiangxuexuan & Yangxingzhai (降雪轩 & 养性斋)
  kit.addBuilding(zone, {
    id: 'gb-jiangxue-xuan',
    name: '降雪轩',
    kind: 'sideHall',
    category: '御花园轩馆',
    x: 95,
    z: 340,
    width: 22,
    depth: 14,
    height: 10.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '轩前原有海棠数株，春日落英如绛雪而得名。'
  });

  kit.addBuilding(zone, {
    id: 'gb-yangxing-zhai',
    name: '养性斋',
    kind: 'sideHall',
    category: '御花园读书室',
    x: -95,
    z: 340,
    width: 22,
    depth: 14,
    height: 10.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '两层西向小楼，末代皇帝溥仪的外籍教师庄士敦曾在此居住教课。'
  });

  // Ancient Cypresses and Flower Trees in Garden
  const treeSpots = [
    { x: -20, z: 325, type: 'cypress' },
    { x: 20, z: 325, type: 'cypress' },
    { x: -60, z: 340, type: 'pine' },
    { x: 60, z: 340, type: 'pine' },
    { x: -30, z: 375, type: 'blossom' },
    { x: 30, z: 375, type: 'blossom' },
    { x: -85, z: 360, type: 'cypress' },
    { x: 85, z: 360, type: 'cypress' },
    { x: -110, z: 420, type: 'pine' },
    { x: 110, z: 420, type: 'pine' }
  ];
  for (const ts of treeSpots) {
    zone.root.add(kit.makeTree({ x: ts.x, z: ts.z, scale: 1.1, type: ts.type }));
  }

  // Willows along the moat
  for (let z = -400; z <= 400; z += 100) {
    zone.root.add(kit.makeTree({ x: -halfW - 20, z, scale: 1.0, type: 'willow' }));
    zone.root.add(kit.makeTree({ x: halfW + 20, z, scale: 1.0, type: 'willow' }));
  }

  // Lamps in Garden
  for (const lx of [-50, -20, 20, 50]) {
    zone.root.add(kit.makeLamp({ x: lx, z: 330, height: 3.4 }));
    zone.root.add(kit.makeLamp({ x: lx, z: 370, height: 3.4 }));
  }

  return zone;
}
