/**
 * Zone E · 东侧宫苑 (East Courts)
 * 拥有：东六宫（钟粹宫、景阳宫、承乾宫、永和宫、景仁宫、延禧宫含水晶宫灵沼轩）、
 * 宁寿宫太上皇太极建筑群（皇极门九龙壁、皇极殿、宁寿宫、乐寿堂、倦勤斋）、
 * 文华殿与清代皇家文库文渊阁（独特的墨绿/黑琉璃瓦屋面）
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
  zone.root.name = 'east-courts-zone';

  // Courtyard 1: Zhongcui & Jingyang Court (钟粹宫景阳宫北院)
  kit.makeCourtyard(zone, {
    id: 'ec-zhongcui-court',
    name: '钟粹宫景阳宫后妃学府院',
    x: 155,
    z: 345,
    width: 60,
    depth: 65,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 2: Chengqian & Jingren Court (承乾宫景仁宫院)
  kit.makeCourtyard(zone, {
    id: 'ec-chengqian-court',
    name: '承乾宫景仁宫东六宫内院',
    x: 155,
    z: 235,
    width: 60,
    depth: 95,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 3: Yanxi Palace Court (延禧宫院落)
  kit.makeCourtyard(zone, {
    id: 'ec-yanxi-court',
    name: '延禧宫灵沼轩水殿庭院',
    x: 155,
    z: 145,
    width: 60,
    depth: 55,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 4.8,
    wallThickness: 1.8,
    paving: mats.ground
  });

  // Courtyard 4: Huangji Hall Grand Court (皇极殿宁寿宫太上皇大院)
  kit.makeCourtyard(zone, {
    id: 'ec-huangji-court',
    name: '皇极殿宁寿宫至尊前院',
    x: 230,
    z: 165,
    width: 65,
    depth: 130,
    gate: 'south',
    gateWidth: 18,
    wallHeight: 5.4,
    wallThickness: 2.2,
    paving: mats.ground
  });

  // Courtyard 5: Qianlong Garden Deep Court (乾隆花园深院)
  kit.makeCourtyard(zone, {
    id: 'ec-leshou-court',
    name: '宁寿宫乐寿堂倦勤斋深院',
    x: 230,
    z: 320,
    width: 65,
    depth: 110,
    gate: 'south',
    gateWidth: 14,
    wallHeight: 5.0,
    wallThickness: 2.0,
    paving: mats.ground
  });

  // Courtyard 6: Wenhua Hall & Wenyuange Court (文华殿文渊阁学府院)
  kit.makeCourtyard(zone, {
    id: 'ec-wenhua-court',
    name: '文华殿文渊阁御经院',
    x: 180,
    z: -30,
    width: 80,
    depth: 120,
    gate: 'south',
    gateWidth: 18,
    wallHeight: 5.2,
    wallThickness: 2.0,
    paving: mats.ground
  });

  // East thoroughfares (东一长街青石路)
  const eastStreet = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 340), mats.procession);
  eastStreet.position.set(118, 0.1, 230);
  eastStreet.receiveShadow = true;
  zone.root.add(eastStreet);

  // --- Buildings in East Zone ---

  // 1. Eastern Six Palaces (东六宫)
  // Zhongcui Palace
  kit.addBuilding(zone, {
    id: 'ec-zhongcui-gong',
    name: '钟粹宫',
    kind: 'hall',
    category: '东六宫正殿',
    x: 155,
    z: 360,
    width: 28,
    depth: 16,
    height: 11.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '东六宫之一，慈安太后、光绪隆裕皇后曾在此居住。'
  });
  kit.addBuilding(zone, {
    id: 'ec-zhongcui-hou',
    name: '钟粹宫后殿',
    kind: 'sideHall',
    category: '东六宫后殿',
    x: 155,
    z: 380,
    width: 24,
    depth: 13,
    height: 9.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '钟粹宫后寝殿，幼年溥仪亦曾寄居于此。'
  });

  // Jingyang Palace
  kit.addBuilding(zone, {
    id: 'ec-jingyang-gong',
    name: '景阳宫',
    kind: 'hall',
    category: '东六宫御藏殿',
    x: 215,
    z: 360,
    width: 26,
    depth: 15,
    height: 11.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乾隆年间专藏宋元古书、书画名帖之所，常闭锁以示敬慎。'
  });
  kit.addBuilding(zone, {
    id: 'ec-jingyang-hou',
    name: '景阳宫后殿（御书房）',
    kind: 'sideHall',
    category: '东六宫书房',
    x: 215,
    z: 380,
    width: 22,
    depth: 12,
    height: 9.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '景阳宫后进御书房。'
  });

  // Chengqian Palace
  kit.addBuilding(zone, {
    id: 'ec-chengqian-gong',
    name: '承乾宫',
    kind: 'hall',
    category: '东六宫贵妃宫',
    x: 155,
    z: 265,
    width: 30,
    depth: 18,
    height: 12.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '明清贵妃正寝，顺治董鄂妃入宫初居、道光孝全成皇后曾居于此。'
  });
  kit.addBuilding(zone, {
    id: 'ec-chengqian-hou',
    name: '承乾宫后殿',
    kind: 'sideHall',
    category: '东六宫后殿',
    x: 155,
    z: 286,
    width: 26,
    depth: 14,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '承乾宫后院寝殿。'
  });

  // Jingren Palace
  kit.addBuilding(zone, {
    id: 'ec-jingren-gong',
    name: '景仁宫',
    kind: 'hall',
    category: '东六宫正殿',
    x: 155,
    z: 212,
    width: 30,
    depth: 18,
    height: 12.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '康熙皇帝玄烨降生之圣地，光绪帝珍妃亦曾居于此。'
  });
  kit.addBuilding(zone, {
    id: 'ec-jingren-hou',
    name: '景仁宫后殿',
    kind: 'sideHall',
    category: '东六宫后殿',
    x: 155,
    z: 232,
    width: 26,
    depth: 14,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '景仁宫后进寝殿。'
  });

  // Yanxi Palace & Water Palace
  kit.addBuilding(zone, {
    id: 'ec-yanxi-gong',
    name: '延禧宫正门殿',
    kind: 'hall',
    category: '东六宫正殿',
    x: 155,
    z: 130,
    width: 26,
    depth: 15,
    height: 11.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '清代道光帝恬嫔、成贵人曾居于此。宣统年间在此修建紫禁城唯一一座钢铁水殿灵沼轩。'
  });

  // Lingzhaoxuan (灵沼轩 - 水晶宫)
  kit.addBuilding(zone, {
    id: 'ec-lingzhao-xuan',
    name: '灵沼轩（延禧宫水晶宫）',
    kind: 'pavilion',
    category: '中西合璧水殿',
    x: 155,
    z: 152,
    width: 20,
    depth: 20,
    height: 12.8,
    tiers: 2,
    roofType: 'pyramid',
    access: '外观可览',
    description: '紫禁城唯一的西式钢铁石构水殿，底池养金鱼，玻璃为窗，俗称水晶宫。'
  });

  // Pond under Lingzhaoxuan
  const fishPond = new THREE.Mesh(new THREE.BoxGeometry(28, 0.8, 28), mats.waterPond);
  fishPond.position.set(155, 0.2, 152);
  zone.root.add(fishPond);

  // 2. Ningshou Palace Group (皇极殿与宁寿宫太上皇太极宫苑)
  kit.addBuilding(zone, {
    id: 'ec-jiulong-bi',
    name: '宁寿宫九龙壁',
    kind: 'wall',
    category: '琉璃影壁奇珍',
    x: 230,
    z: 108,
    width: 32,
    depth: 3.5,
    height: 6.8,
    tiers: 1,
    roofType: 'wudian',
    access: '外观可览',
    description: '中国三大九龙壁之一，乾隆三十七年烧造，由424块五彩琉璃浮雕拼接而成，九条蟠龙飞腾云海。'
  });

  kit.addBuilding(zone, {
    id: 'ec-huangji-men',
    name: '皇极门',
    kind: 'gate',
    category: '太上皇宫正门',
    x: 230,
    z: 124,
    width: 28,
    depth: 14,
    height: 10.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '宁寿宫区第一进正门，重檐歇山黄瓦顶。'
  });

  kit.addBuilding(zone, {
    id: 'ec-huangji-dian',
    name: '皇极殿（宁寿大殿）',
    kind: 'hall',
    category: '太上皇归政朝会大殿',
    x: 230,
    z: 165,
    width: 48,
    depth: 28,
    height: 19.5,
    tiers: 2,
    roofType: 'wudian',
    openFront: true,
    interiorType: 'taihe',
    access: '可进入',
    description: '乾隆退位训政预备朝会之所，仿太和殿规制缩小建造。慈禧六十大寿时亦在此接受庆贺。'
  });

  kit.addBuilding(zone, {
    id: 'ec-ningshou-gong',
    name: '宁寿宫',
    kind: 'hall',
    category: '太上皇寝正宫',
    x: 230,
    z: 215,
    width: 40,
    depth: 24,
    height: 15.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '仿后三宫坤宁宫建制，为祭神神堂及太上皇寝宫。'
  });

  kit.addBuilding(zone, {
    id: 'ec-leshou-tang',
    name: '乐寿堂',
    kind: 'hall',
    category: '乾隆退位休养殿',
    x: 230,
    z: 295,
    width: 36,
    depth: 22,
    height: 14.2,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乾隆皇帝退位后读书休憩的主要殿堂，堂内安放著名国宝大禹治水图大玉山。'
  });

  kit.addBuilding(zone, {
    id: 'ec-yihe-xuan',
    name: '颐和轩',
    kind: 'sideHall',
    category: '乾隆花园轩馆',
    x: 230,
    z: 325,
    width: 32,
    depth: 18,
    height: 12.0,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乐寿堂北进宽敞歇凉轩馆，出轩即接长廊。'
  });

  kit.addBuilding(zone, {
    id: 'ec-juanqin-zhai',
    name: '倦勤斋',
    kind: 'hall',
    category: '乾隆私家戏台退隐斋',
    x: 230,
    z: 355,
    width: 28,
    depth: 18,
    height: 11.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '乾隆取耆期倦勤，颐养天和之意，内设精巧小戏台与郎世宁通景画顶棚。'
  });

  // 3. Wenhua Hall and Wenyuange Group (文华殿与藏书阁文渊阁)
  kit.addBuilding(zone, {
    id: 'ec-wenhua-dian',
    name: '文华殿',
    kind: 'hall',
    category: '皇帝经筵讲学殿',
    x: 180,
    z: -35,
    width: 44,
    depth: 26,
    height: 16.5,
    tiers: 2,
    roofType: 'xieshan',
    access: '外观可览',
    description: '明初太子朝拜之殿，清代为皇帝每年春秋二季经筵进讲大典之处。'
  });

  kit.addBuilding(zone, {
    id: 'ec-zhujing-dian',
    name: '主敬殿',
    kind: 'sideHall',
    category: '文华殿后殿',
    x: 180,
    z: -7,
    width: 36,
    depth: 18,
    height: 12.5,
    tiers: 1,
    roofType: 'xieshan',
    access: '外观可览',
    description: '文华殿后进讲官进膳更衣之处。'
  });

  // Wenyuange Imperial Library (文渊阁 - 黑色琉璃瓦屋面，依五行水克火之意)
  kit.addBuilding(zone, {
    id: 'ec-wenyuan-ge',
    name: '文渊阁（文渊黑瓦藏书阁）',
    kind: 'hall',
    category: '皇家第一藏书圣地',
    x: 180,
    z: 22,
    width: 38,
    depth: 22,
    height: 16.0,
    tiers: 2,
    roofType: 'blackTile',
    openFront: true,
    interiorType: 'bedchamber',
    access: '可进入',
    description: '仿宁波天一阁而建的皇家藏书阁。采用极罕见的黑琉璃瓦绿剪边屋顶（水克火防祝融），专藏第一部《四库全书》。'
  });

  // Pond in front of Wenyuange
  const wenyuanPond = new THREE.Mesh(new THREE.BoxGeometry(42, 0.8, 14), mats.waterPond);
  wenyuanPond.position.set(180, 0.15, 6);
  zone.root.add(wenyuanPond);

  // Wenhua Gate
  kit.addBuilding(zone, {
    id: 'ec-wenhua-men',
    name: '文华门',
    kind: 'gate',
    category: '文华殿正门',
    x: 180,
    z: -75,
    width: 24,
    depth: 12,
    height: 9.8,
    tiers: 1,
    roofType: 'xieshan',
    access: '可通行',
    description: '文华殿宫区正门。'
  });

  // Palace Lanterns and Scholar Trees
  for (const lz of [110, 160, 210, 260, 310, 360]) {
    zone.root.add(kit.makeLamp({ x: 124, z: lz, height: 3.5 }));
  }
  zone.root.add(kit.makeTree({ x: 200, z: 270, scale: 0.95, type: 'pine' }));
  zone.root.add(kit.makeTree({ x: 230, z: 250, scale: 0.95, type: 'cypress' }));

  return zone;
}
