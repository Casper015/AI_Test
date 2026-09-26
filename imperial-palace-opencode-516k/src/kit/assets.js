// A · 资源登记（v0.9 全部为程序化几何；无第三方模型/贴图/字体）
// 每条登记：{ id, kind, builder, materials, triRange, lod, note }
// triRange 为该构件合并前的三角面范围（含实例数量），LOD 为面向质量档的降级提示。

export const assetRegistry = [
  { id: 'kit.roof.hip', kind: 'roof', builder: 'roof', materials: ['roofGold', 'roofGoldDark', 'roofUnderside'], triRange: [120, 900], lod: 'L0 高 / L1 减 segX|segZ / L2 纯色檐口', note: '庑殿或攒尖坡面、檐口封板、起翘角' },
  { id: 'kit.roof.tiles', kind: 'detail', builder: 'details.tileLines', materials: ['roofGoldDark'], triRange: [64, 360], lod: 'minor 档 2–8 条瓦垄；Node 下同样程序化', note: '沿坡向几何瓦垄线，浮于坡面 5.5cm' },
  { id: 'kit.roof.ridge-beast', kind: 'detail', builder: 'details.ridgeBeast', materials: ['ridge'], triRange: [54, 120], lod: 'minor 省略', note: '正脊两端吻兽（座/身/首/角组合）' },
  { id: 'kit.roof.finial', kind: 'detail', builder: 'roof(pyramid branch)', materials: ['ridge'], triRange: [160, 220], lod: '远景可去掉球体细段', note: '攒尖顶宝顶：座+球+尖' },
  { id: 'kit.dougong.band', kind: 'detail', builder: 'details.dougongRow', materials: ['ridge'], triRange: [48, 768], lod: 'minor 12 块；grand 64 块', note: '额枋下斗栱/椽头一排小方块' },
  { id: 'kit.caihua.canvas', kind: 'material', builder: 'materials.caihuaPainted', materials: ['caihuaPainted'], triRange: [0, 0], lod: '无 document 时退化为 caihuaGreen 纯色', note: '额枋彩画 CanvasTexture，纹样克制；无外部贴图' },
  { id: 'kit.hall', kind: 'building', builder: 'hall', materials: ['roofGold', 'roofGoldDark', 'wallRed', 'caihuaPainted', 'ridge', 'stone', 'stoneDark', 'wood', 'woodDark', 'plaque', 'stoneSide'], triRange: [900, 5200], lod: 'royal=grand/royal 档，major/minor 递减', note: '殿堂：台基+柱身+额枋彩画+庑殿/重檐' },
  { id: 'kit.side-hall', kind: 'building', builder: 'sideHall', materials: ['roofGold', 'wallRed', 'caihuaPainted', 'stoneDark', 'stoneSide'], triRange: [500, 1600], lod: 'major/minor', note: '配殿：单层台基、单檐' },
  { id: 'kit.pavilion', kind: 'building', builder: 'pavilion', materials: ['roofGold', 'wallRed', 'ridge', 'wood', 'stoneDark'], triRange: [700, 2400], lod: 'royal 攒尖宝顶 / minor 简化', note: '亭：攒尖顶、宝顶、四柱与坐凳栏' },
  { id: 'kit.gate-hall', kind: 'building', builder: 'gateHall', materials: ['roofGold', 'wallRed', 'woodDark', 'ridge', 'caihuaPainted'], triRange: [700, 2400], lod: '三开间板门，minor 单门', note: '宫门：三开间板门+门钉+门环，门洞通透' },
  { id: 'kit.gate-drum', kind: 'building', builder: 'gateHall(drum)', materials: ['stoneSide', 'stoneDark', 'wallRed', 'roofGold', 'roofGoldDark'], triRange: [1200, 3000], lod: '城台垛口间距随质量', note: '城门：城台+垛口+过洞+城楼' },
  { id: 'kit.courtyard-gate', kind: 'building', builder: 'courtyardGate', materials: ['wallRed', 'woodDark', 'ridge', 'roofGold', 'plaque'], triRange: [400, 1200], lod: 'minor', note: '院门：实开洞口+板门+门钉+门环' },
  { id: 'kit.corner-tower', kind: 'building', builder: 'cornerTower', materials: ['wallRed', 'roofGold', 'roofGoldDark', 'ridge', 'stoneDark'], triRange: [1200, 2900], lod: '三层重檐；窗实例化为一对', note: '角楼：三层重檐金顶' },
  { id: 'kit.corridor', kind: 'building', builder: 'corridor', materials: ['wallRed', 'roofGold', 'caihuaGreen', 'ridge', 'stoneDark'], triRange: [300, 1400], lod: '按长向实例化柱列', note: '廊庑：连续红柱+小坡瓦顶+脊线' },
  { id: 'kit.wall', kind: 'building', builder: 'wall', materials: ['wallRed', 'wallRedDark', 'roofGoldDark', 'ridge', 'stoneDark'], triRange: [60, 200], lod: '无', note: '宫墙：墙身+墙帽+瓦垄线+石基' },
  { id: 'kit.bridge', kind: 'building', builder: 'bridge', materials: ['stone', 'stoneDark', 'stoneSide'], triRange: [400, 1200], lod: '按段折线', note: '桥：石拱两坡+望柱栏板' },
  { id: 'kit.stairs', kind: 'building', builder: 'stairs', materials: ['stoneSide', 'stone'], triRange: [36, 240], lod: '级数随台高', note: '白台阶：踏步+垂带' },
  { id: 'kit.terrace', kind: 'building', builder: 'terraceBase', materials: ['stone', 'stoneDark'], triRange: [24, 400], lod: '层数随 tier', note: '台基：royal 三层，余单层' },
  { id: 'kit.railing', kind: 'detail', builder: 'railing+details.railingExtras', materials: ['stone', 'stoneDark', 'wood'], triRange: [80, 1600], lod: '柱头按 tier 数量；栏板通长分层', note: '栏杆：望柱头+上下枋+通长栏板' },
  { id: 'kit.interior.throne', kind: 'interior', builder: 'interior(kind:throne)', materials: ['goldFloor', 'wallRed', 'ridge', 'caihuaGreen', 'dark', 'innerWall'], triRange: [1200, 2600], lod: '内景固定 L0', note: '金銮殿内景：金砖地、宝座、屏风、盘龙柱、藻井' },
  { id: 'kit.interior.chamber', kind: 'interior', builder: 'interior(kind:chamber)', materials: ['goldFloor', 'woodDark', 'wood', 'caihuaGreen', 'innerWall'], triRange: [1200, 2600], lod: '内景固定 L0', note: '寝殿内景：床榻、隔断、宫灯' },
  { id: 'kit.tree.pine', kind: 'plant', builder: 'tree|treeCluster(pine)', materials: ['trunk', 'treeA'], triRange: [80, 420], lod: '低位锥冠', note: '松：三层锥形冠，6–12m' },
  { id: 'kit.tree.broad', kind: 'plant', builder: 'tree|treeCluster(broad)', materials: ['trunk', 'treeA', 'treeB'], triRange: [80, 420], lod: '球冠低模', note: '阔叶：球冠组合' },
  { id: 'kit.tree.willow', kind: 'plant', builder: 'details.willowTree|treeCluster(willow)', materials: ['trunk', 'treeA', 'treeB'], triRange: [160, 560], lod: '垂枝 12–18 条', note: '柳：垂枝，沿岸栽植' },
  { id: 'kit.props.rock', kind: 'prop', builder: 'props(rock)|details.rockery', materials: ['rock', 'stoneSide'], triRange: [36, 360], lod: '多面体低模', note: '置石与假山' },
  { id: 'kit.props.lantern', kind: 'prop', builder: 'props(lantern)|details.stoneLamp', materials: ['stoneSide', 'lanternRed'], triRange: [64, 320], lod: '无', note: '石灯/宫灯，返回 lightAnchors 锚点' },
  { id: 'kit.props.censer', kind: 'prop', builder: 'details.censerProps', materials: ['bronze'], triRange: [160, 300], lod: '无', note: '铜香炉：三足双耳，带 type:censer 锚点' },
  { id: 'kit.props.lion', kind: 'prop', builder: 'props(lion)', materials: ['stoneDark', 'stoneSide'], triRange: [44, 80], lod: '无', note: '石狮' },
  { id: 'kit.props.banner', kind: 'prop', builder: 'props(banner)', materials: ['woodDark', 'wallRed', 'ridge'], triRange: [36, 60], lod: '无', note: '旗幡' },
  { id: 'kit.props.rail', kind: 'prop', builder: 'props(stoneRail)', materials: ['stone', 'stoneDark'], triRange: [80, 1200], lod: '柱列实例化', note: '长向石栏（实例化望柱）' },
  { id: 'kit.props.pond', kind: 'prop', builder: 'props(pond)', materials: ['water', 'rock'], triRange: [200, 900], lod: '岸石数量随半径', note: '水景：水面+岸石' },
  { id: 'kit.paving.slab', kind: 'paving', builder: 'slabRect+details.pavingPattern', materials: ['paving', 'pavingWarm', 'stoneDark'], triRange: [24, 2200], lod: 'Node 下分格间距×1.8', note: '铺地：轴线路中缝、方砖分格' },
  { id: 'kit.merge.static', kind: 'pipeline', builder: 'mergeStatic', materials: [], triRange: [0, 0], lod: '—', note: '区域静态合并，同材质一次绘制' }
];

export function validateRegistry(list = assetRegistry) {
  const issues = [];
  const ids = new Set();
  for (const e of list) {
    if (!e || typeof e !== 'object') { issues.push('登记项不是对象'); continue; }
    for (const key of ['id', 'kind', 'builder', 'triRange', 'lod', 'note']) {
      if (e[key] === undefined || e[key] === null) issues.push(`${e.id || '?'} 缺少 ${key}`);
    }
    if (!Array.isArray(e.triRange) || e.triRange.length !== 2 || !e.triRange.every(Number.isFinite)) issues.push(`${e.id} triRange 非法`);
    if (!Array.isArray(e.materials)) issues.push(`${e.id} materials 非法`);
    if (ids.has(e.id)) issues.push(`重复 id ${e.id}`);
    ids.add(e.id);
  }
  return { ok: issues.length === 0, count: list.length, issues };
}

export const ASSET_SOURCES = [
  { id: 'three.js', version: 'r169', license: 'MIT', localPath: 'public/vendor/three/', usage: '渲染内核（本地内置，无运行时热链）' }
];
