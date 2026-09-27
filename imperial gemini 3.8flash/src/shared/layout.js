export const BOUNDS = Object.freeze({
  minX: -300,
  maxX: 300,
  minZ: -450,
  maxZ: 450
});

export const CONNECTORS = Object.freeze({
  gateSouth: { id: 'gate-south', position: [0, 0, -430], width: 34, targetZone: 'forecourt' },
  forecourtSouth: { id: 'forecourt-south', position: [0, 0, -398], width: 38, targetZone: 'forecourt' },
  forecourtInner: { id: 'axial-inner', position: [0, 0, 83], width: 30, targetZone: 'inner' },
  innerGarden: { id: 'inner-garden', position: [0, 0, 302], width: 24, targetZone: 'garden' },
  westSouth: { id: 'west-south', position: [-104, 0, -180], width: 14, targetZone: 'west' },
  westNorth: { id: 'west-north', position: [-104, 0, 180], width: 14, targetZone: 'west' },
  eastSouth: { id: 'east-south', position: [104, 0, -180], width: 14, targetZone: 'east' },
  eastNorth: { id: 'east-north', position: [104, 0, 180], width: 14, targetZone: 'east' },
  gateNorth: { id: 'gate-north', position: [0, 0, 430], width: 26, targetZone: 'garden' },
  gateWest: { id: 'gate-west', position: [-284, 0, 0], width: 22, targetZone: 'west' },
  gateEast: { id: 'gate-east', position: [284, 0, 0], width: 22, targetZone: 'east' }
});

export const ZONES = Object.freeze({
  forecourt: { x: [-100, 100], z: [-398, 83], owner: 'B', name: '前朝' },
  inner: { x: [-100, 100], z: [83, 302], owner: 'C', name: '后宫' },
  west: { x: [-280, -104], z: [-300, 300], owner: 'D', name: '西宫苑' },
  east: { x: [104, 280], z: [-300, 300], owner: 'E', name: '东宫苑' },
  garden: { x: [-282, 282], z: [302, 430], owner: 'F', name: '御花园与边界' }
});

export const VIEWS = Object.freeze({
  overview: {
    id: 'overview',
    label: '全城鸟瞰',
    tag: '宏观沙盘',
    position: [850, 880, -1120],
    target: [0, 0, 10],
    desc: '从南向北 45° 高位宏观俯瞰整座紫禁城，金瓦朱墙与护城河尽收眼底。'
  },
  axis: {
    id: 'axis',
    label: '中轴贯通',
    tag: '正南轴线',
    position: [0, 360, -780],
    target: [0, 15, -40],
    desc: '正南中轴线贯穿大景，自午门、太和门延伸至三大殿与后三宫。'
  },
  forecourt: {
    id: 'forecourt',
    label: '前朝礼仪',
    tag: '前朝大区',
    position: [0, 210, -510],
    target: [0, 12, -180],
    desc: '前朝内金水桥、太和门与万国来朝礼仪广场。'
  },
  taihe: {
    id: 'taihe',
    label: '太和金銮',
    tag: '皇家核心',
    position: [140, 95, -125],
    target: [0, 22, -62],
    desc: '太和殿（金銮殿）三层汉白玉须弥座台基与重檐庑殿金顶特写。'
  },
  inner: {
    id: 'inner',
    label: '乾清内廷',
    tag: '后寝主宫',
    position: [180, 140, 145],
    target: [0, 14, 175],
    desc: '乾清宫与后三宫院落，红墙深院，帝后起居之正寝。'
  },
  garden: {
    id: 'garden',
    label: '御苑奇石',
    tag: '皇家园林',
    position: [210, 210, 640],
    target: [0, 10, 355],
    desc: '御花园堆秀山、御景亭与万春亭、千秋亭，古柏参天。'
  },
  west: {
    id: 'west',
    label: '西宫养心',
    tag: '政寝重地',
    position: [-380, 260, -80],
    target: [-180, 8, -10],
    desc: '西六宫与养心殿区域，三希堂与垂帘听政故地。'
  },
  east: {
    id: 'east',
    label: '东宫文华',
    tag: '皇极文渊',
    position: [380, 260, -80],
    target: [180, 8, -10],
    desc: '东六宫、文华殿与藏书阁文渊阁，黑瓦绿剪边建筑独树一帜。'
  },
  interior: {
    id: 'interior',
    label: '金銮内景',
    tag: '可进内殿',
    position: [0, 7.5, -74],
    target: [0, 7.9, -50],
    desc: '太和殿内景：九龙金漆宝座、雕龙屏风、六根沥粉蟠龙金柱与藻井。'
  },
  bedroom: {
    id: 'bedroom',
    label: '坤宁寝暖',
    tag: '后妃寝殿',
    position: [0, 5.8, 236],
    target: [0, 6.2, 248],
    desc: '坤宁宫东暖阁内景：雕花漆木屏风、红木拔步床榻与宫灯陈设。'
  }
});

export const TOUR_STOPS = Object.freeze([
  {
    step: 1,
    title: '第一站 · 午门内金水桥',
    position: [80, 45, -360],
    target: [0, 8, -320],
    duration: 3.5,
    narration: '站在内金水桥前，五座汉白玉拱桥如玉带横陈，正前方是庄严的太和门。'
  },
  {
    step: 2,
    title: '第二站 · 太和门广场',
    position: [60, 55, -240],
    target: [0, 12, -180],
    duration: 3.5,
    narration: '前朝第一道宫门，文武百官在此听政，东西两侧为朝房与廊庑。'
  },
  {
    step: 3,
    title: '第三站 · 太和殿广场与三台',
    position: [110, 65, -140],
    target: [0, 16, -65],
    duration: 4.0,
    narration: '万国来朝的礼仪大广场，太和殿巍峨耸立于三层汉白玉须弥座台基之上。'
  },
  {
    step: 4,
    title: '第四站 · 金銮宝座内景',
    position: [0, 7.5, -73],
    target: [0, 7.9, -50],
    duration: 4.5,
    narration: '步入太和殿金砖地面，仰望轩辕镜藻井与六根沥粉蟠龙金柱，九龙宝座威严赫赫。'
  },
  {
    step: 5,
    title: '第五站 · 中和殿与保和殿',
    position: [95, 55, 10],
    target: [0, 12, 10],
    duration: 3.5,
    narration: '中和殿为皇帝大典前休憩更衣之所，保和殿为殿试盛典举办之地。'
  },
  {
    step: 6,
    title: '第六站 · 乾清门与内廷界线',
    position: [60, 42, 95],
    target: [0, 8, 125],
    duration: 3.5,
    narration: '乾清门是紫禁城前朝与后廷的分界，门前置鎏金铜狮，御门听政在此举行。'
  },
  {
    step: 7,
    title: '第七站 · 乾清宫与交泰殿',
    position: [75, 48, 160],
    target: [0, 10, 185],
    duration: 3.5,
    narration: '乾清宫乃明清皇帝起居治事之正宫，后接藏贮二十五宝御玺的交泰殿。'
  },
  {
    step: 8,
    title: '第八站 · 坤宁宫寝殿内景',
    position: [0, 5.8, 236],
    target: [0, 6.2, 248],
    duration: 4.0,
    narration: '坤宁宫东暖阁，历代大婚合卺之所，陈设雕花屏风与织锦床榻。'
  },
  {
    step: 9,
    title: '第九站 · 御花园与堆秀山',
    position: [70, 52, 330],
    target: [0, 12, 365],
    duration: 4.0,
    narration: '皇家御花园内，叠石奇秀，堆秀山上筑御景亭，重阳登高俯瞰全城。'
  },
  {
    step: 10,
    title: '第十站 · 神武门与西北角楼',
    position: [140, 90, 470],
    target: [0, 15, 420],
    duration: 4.5,
    narration: '北抵神武门与护城河，四角九梁十八柱七十二条脊的角楼倒映水中，紫禁天朝尽览无余。'
  }
]);

export const REGIONS = Object.freeze([
  { id: 'forecourt', name: '前朝', center: [0, -175], color: '#d4af37' },
  { id: 'inner', name: '后宫', center: [0, 190], color: '#c9372e' },
  { id: 'west', name: '西宫苑', center: [-190, -5], color: '#38bdf8' },
  { id: 'east', name: '东宫苑', center: [190, -5], color: '#a855f7' },
  { id: 'garden', name: '御花园', center: [0, 355], color: '#34d399' }
]);
