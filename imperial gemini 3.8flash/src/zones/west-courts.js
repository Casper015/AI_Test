/**
 * Zone D · 西侧宫苑 (West Courts)
 * 拥有：西六宫（永寿宫、翊坤宫、储秀宫、太极殿、长春宫、咸福宫）、
 * 养心殿主仆建筑群（含三希堂与东暖阁）、慈宁宫与寿康宫太后宫苑
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
  zone.root.name = 'west-courts-zone';

  // Courtyard 1: Yangxin Hall Court (养心殿御政院)
  kit.makeCourtyard(zone, {
    id: 'wc-yangxin-court',
    name: '养心殿理政内院',
    x: -155,
    z: 140,
    width: 68,
    depth: 60,
    gate: 'south',
    gateWidth: 16,
    wallHeight: 5.2,
    wallThickness: 2.0,
    paving: mats.ground
  });

  // Courtyard 2: Yongshou Court (永寿宫院)
  kit.makeCourtyard(zone, {
    id: 'wc-yongshou-court',
    name: '永寿宫幽静院落',
    x: -155,
    z: 215,
    width: 60,
    depth: 55,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 3: Yikun Court (翊坤宫院)
  kit.makeCourtyard(zone, {
    id: 'wc-yikun-court',
    name: '翊坤宫后妃宫苑',
    x: -155,
    z: 285,
    width: 60,
    depth: 55,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 4: Chuxiu Court (储秀宫院)
  kit.makeCourtyard(zone, {
    id: 'wc-chuxiu-court',
    name: '储秀宫慈禧故居院',
    x: -155,
    z: 355,
    width: 60,
    depth: 55,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 5: Changchun & Taiji Court (长春宫与太极殿西路苑)
  kit.makeCourtyard(zone, {
    id: 'wc-changchun-court',
    name: '长春宫富察皇后寝院',
    x: -228,
    z: 250,
    width: 64,
    depth: 100,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 6: Ci'ning Grand Court (慈宁宫太后正宫院)
  kit.makeCourtyard(zone, {
    id: 'wc-cining-court',
    name: '慈宁宫寿康宫前朝正院',
    x: -195,
    z: 20,
    width: 90,
    depth: 110,
    gate: 'south',
    gateWidth: 18,
    wallHeight: 5.4,
    wallThickness: 2.2,
    paving: mats.ground
  });

  // West thoroughfares (西一长街青石路)
  const westStreet = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 340), mats.procession);
  westStreet.position.set(-118, 0.1, 230);
  westStreet.receiveShadow = true;
  zone.root.add(westStreet);

  // --- Buildings in West Zone ---

  // 1. Hall of Mental Cultivation Group (养心殿核心建筑)
  kit.addBuilding(zone, {
    id: 'wc-yangxin-dian',
    name: '养心殿正殿',
    kind: 'hall',
    category: '清帝理政中枢',
    x: -155,
    z: 142,
    width: 38,
    depth: 22,
    height: 14.5,
    tiers: 1,
    roofType: 'xieshan',
    openFront: true,
    interiorType: 'bedchamber',
    access: '可进入',
    description: '雍正以降清代八代皇帝的实际政务中枢与寝宫。明间设宝座，西间为乾隆三希堂，东间为慈禧垂帘听政处。'
  });

  kit.addBuilding(zone, {
    id: 'wc-yangxin-men',
    name: '养心门',
    kind: 'gate',
    category: '琉璃仪门',
    x: -155,
    z: 112,
    width: 18,
    depth: 9,
    height: 8.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '养心殿正门，为一进式三间琉璃垂花门，雕刻缠枝宝相花。'
  });

  kit.addBuilding(zone, {
    id: 'wc-sanxi-tang',
    name: '三希堂',
    kind: 'sideHall',
    category: '乾隆御用书房',
    x: -176,
    z: 142,
    width: 14,
    depth: 16,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可进入',
    description: '养心殿西暖阁小室，乾隆皇帝专藏王羲之《快雪时晴帖》等三件希世稀珍法帖之处。'
  });

  kit.addBuilding(zone, {
    id: 'wc-dong-nuange',
    name: '养心殿东暖阁',
    kind: 'sideHall',
    category: '垂帘听政故地',
    x: -134,
    z: 142,
    width: 14,
    depth: 16,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '慈安、慈禧两宫太后垂帘听政历史重地，黄幔低垂，龙案俨然。'
  });

  kit.addBuilding(zone, {
    id: 'wc-yangxin-hou',
    name: '养心殿后殿（燕喜堂）',
    kind: 'hall',
    category: '皇帝寝殿',
    x: -155,
    z: 162,
    width: 32,
    depth: 16,
    height: 11.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '皇帝在养心殿的正式寝殿，东西各设寝室。'
  });

  // 2. Western Six Palaces (西六宫建筑)
  // Yongshou Palace
  kit.addBuilding(zone, {
    id: 'wc-yongshou-gong',
    name: '永寿宫',
    kind: 'hall',
    category: '西六宫正殿',
    x: -155,
    z: 208,
    width: 30,
    depth: 18,
    height: 12.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '西六宫之首，顺治董鄂妃、乾隆孝仪纯皇后（令妃）曾居于此。'
  });
  kit.addBuilding(zone, {
    id: 'wc-yongshou-hou',
    name: '永寿宫后殿',
    kind: 'sideHall',
    category: '西六宫后殿',
    x: -155,
    z: 228,
    width: 26,
    depth: 14,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '永寿宫后进院寝殿，带东西耳房。'
  });

  // Yikun Palace
  kit.addBuilding(zone, {
    id: 'wc-yikun-gong',
    name: '翊坤宫',
    kind: 'hall',
    category: '西六宫正殿',
    x: -155,
    z: 278,
    width: 30,
    depth: 18,
    height: 12.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '明清贵妃寝宫，宜妃、敦肃皇贵妃（年贵妃）、华妃曾居于此。'
  });
  kit.addBuilding(zone, {
    id: 'wc-yikun-hou',
    name: '翊坤宫后殿',
    kind: 'sideHall',
    category: '西六宫后殿',
    x: -155,
    z: 298,
    width: 26,
    depth: 14,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '翊坤宫后寝殿，与后方储秀宫相通。'
  });

  // Chuxiu Palace (储秀宫与丽景轩)
  kit.addBuilding(zone, {
    id: 'wc-chuxiu-gong',
    name: '储秀宫',
    kind: 'hall',
    category: '西六宫正殿',
    x: -155,
    z: 348,
    width: 32,
    depth: 18,
    height: 12.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '慈禧太后入宫初居及五十寿辰重修之所，末代皇后婉容亦曾居于此。'
  });
  kit.addBuilding(zone, {
    id: 'wc-lijing-xuan',
    name: '丽景轩',
    kind: 'sideHall',
    category: '储秀宫后殿',
    x: -155,
    z: 368,
    width: 28,
    depth: 15,
    height: 10.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '储秀宫后殿，慈禧太后在此生下同治皇帝载淳。'
  });

  // Taiji Palace / Qixiang Palace
  kit.addBuilding(zone, {
    id: 'wc-taiji-dian',
    name: '太极殿（启祥宫）',
    kind: 'hall',
    category: '西六宫正殿',
    x: -228,
    z: 215,
    width: 28,
    depth: 16,
    height: 11.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '明世宗嘉靖帝生母曾居于此，清代同治朝与长春宫打通成四进大院。'
  });
  kit.addBuilding(zone, {
    id: 'wc-taiji-hou',
    name: '太极殿后殿（体元殿）',
    kind: 'sideHall',
    category: '西六宫中殿',
    x: -228,
    z: 236,
    width: 26,
    depth: 14,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '太极殿后抱厦，清代演戏时太后观戏之所。'
  });

  // Changchun Palace
  kit.addBuilding(zone, {
    id: 'wc-changchun-gong',
    name: '长春宫',
    kind: 'hall',
    category: '西六宫正殿',
    x: -228,
    z: 280,
    width: 30,
    depth: 18,
    height: 12.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乾隆帝孝贤纯皇后富察氏正寝，乾隆对其怀念极深，保留陈设数十年不变。'
  });
  kit.addBuilding(zone, {
    id: 'wc-changchun-hou',
    name: '长春宫后殿（怡情书史）',
    kind: 'sideHall',
    category: '西六宫后殿',
    x: -228,
    z: 302,
    width: 26,
    depth: 14,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '长春宫后院寝殿，带游廊壁画《红楼梦》。'
  });

  // Xianfu Palace
  kit.addBuilding(zone, {
    id: 'wc-xianfu-gong',
    name: '咸福宫',
    kind: 'hall',
    category: '西六宫正殿',
    x: -228,
    z: 350,
    width: 28,
    depth: 16,
    height: 11.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '清代道光帝孝全成皇后、咸丰帝生母曾居于此。'
  });
  kit.addBuilding(zone, {
    id: 'wc-xianfu-hou',
    name: '咸福宫后殿（同道堂）',
    kind: 'sideHall',
    category: '西六宫后殿',
    x: -228,
    z: 370,
    width: 24,
    depth: 14,
    height: 9.6,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '咸福宫后寝殿，咸丰帝在此赐两道御宝命同治顾命八大臣佐政。'
  });

  // 3. Ci'ning and Shoukang Palace Group (太后慈宁宫建筑群)
  kit.addBuilding(zone, {
    id: 'wc-cining-dian',
    name: '慈宁宫大殿',
    kind: 'hall',
    category: '太后朝会主殿',
    x: -195,
    z: 35,
    width: 46,
    depth: 26,
    height: 17,
    tiers: 2,
    roofType: 'xieshan',
    access: '外观可览',
    description: '皇太后举行重大庆典之朝会大殿，孝庄文皇后、崇庆皇太后（甄嬛原型）曾在此受贺。'
  });
  kit.addBuilding(zone, {
    id: 'wc-cining-hou',
    name: '慈宁宫后殿（大佛堂）',
    kind: 'hall',
    category: '太后佛堂',
    x: -195,
    z: 65,
    width: 38,
    depth: 20,
    height: 13,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '太后礼佛专殿，供奉精美金铜造像。'
  });
  kit.addBuilding(zone, {
    id: 'wc-cining-men',
    name: '慈宁门',
    kind: 'gate',
    category: '太后宫正门',
    x: -195,
    z: -18,
    width: 28,
    depth: 14,
    height: 10.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '慈宁宫前朝仪仗大门。'
  });

  kit.addBuilding(zone, {
    id: 'wc-shoukang-gong',
    name: '寿康宫',
    kind: 'hall',
    category: '太后寝宫',
    x: -250,
    z: 45,
    width: 34,
    depth: 20,
    height: 13.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乾隆皇帝为其生母崇庆皇太后专门修建的尊养寝宫。'
  });

  kit.addBuilding(zone, {
    id: 'wc-linxi-ting',
    name: '临溪亭',
    kind: 'pavilion',
    category: '慈宁花园水亭',
    x: -195,
    z: -60,
    width: 15,
    depth: 15,
    height: 9.8,
    tiers: 1,
    roofType: 'pyramid',
    access: '外观可览',
    description: '慈宁宫花园池中水亭，单檐歇山四角攒尖顶。'
  });

  // Palace Lanterns and Cypresses in West Palaces
  for (const lz of [125, 170, 210, 260, 310, 360]) {
    zone.root.add(kit.makeLamp({ x: -124, z: lz, height: 3.5 }));
  }
  zone.root.add(kit.makeTree({ x: -180, z: 245, scale: 0.9, type: 'cypress' }));
  zone.root.add(kit.makeTree({ x: -255, z: 280, scale: 0.9, type: 'blossom' }));

  return zone;
}
