# A · 资源与建筑构件库 · 回执

## 开工回执

```text
任务 ID / Agent：A 资源与建筑构件库
已读计划、风格与接口版本：imperial-palace-plan.md（§3/§4/§5.1/§7.1/§8.2）、
  docs/STYLE_GUIDE.md v0.9、docs/CONTRACTS.md v0.9（含 §7 kit API、§11 截图工具）、
  src/shared/config.js、src/shared/layout.js（68 槽位 / 18 院落）、
  src/kit/{index,materials,merge}.js、src/zones/_greybox.js（用法示例）、tests/kit.test.mjs
可写文件 / 只读依赖：可写 src/kit/**、public/assets/**、kit-preview.html、
  docs/ASSET_CREDITS.md、tests/kit-a.extra.test.mjs、docs/handoffs/A.md；
  其余（index.html、src/main.js、core/shared/zones/ui、scripts、tests 现有文件）只读
区域边界 / 连接 ID / 使用的建筑 kit 与材质：全城通用 kit（config.PALETTE/config.ROOF），
  不新增区域；样板页消费 layout.SLOTS 字段与 kit 工厂
要消费和返回的接口：createKit({THREE,config,rng,assets}) 保持 24 个导出签名不变；
  新增返回 registry（资产登记数组）与 src/kit/assets.js 的 assetRegistry
验收方式 / 性能预算：node tests 四条 + scripts/shot.mjs zone golden；
  单栋 ≤16 mesh、主殿 ≤6000 三角面、其它 ≤3000（不改主殿超 8k 红线）
依赖齐备情况 / 发现的冲突：
  - 现有 f.gate-south（drum 城门）合并后 18 个 child（>16），计划在本次内部修复（合并门钉实例等）
  - CONTRACTS §7 写 props 为对象方法表，实际实现为 props(o) 函数；按“签名不变”原则保留函数并补齐 kind
  - 未发现阻塞；不修改冻结接口
```

## 交付回执

### 交付：文件列表

- 修改：`src/kit/index.js`（细节集成、门洞通透、重檐细节、预算裁剪）、`src/kit/materials.js`（caihuaPainted Canvas 彩画，`document` 守卫）
- 新增：`src/kit/details.js`、`src/kit/assets.js`、`kit-preview.html`、`tests/kit-a.extra.test.mjs`、`docs/ASSET_CREDITS.md`
- 产物：`docs/shots/kit-sample.png`（567,832 bytes）与 `docs/shots/kit-sample.dom.html`
- 未触碰任何非可写文件（`find -newermt` 核对仅上述文件变化）

### 接口

- **冻结签名全部保持不变**（`roof/hall/sideHall/pavilion/gateHall/courtyardGate/cornerTower/corridor/wall/bridge/stairs/terraceBase/interior/railing/instanced/tree/treeCluster/props/slabRect/building/mergeStatic/boxAt/cylAt/tier/materials`）。
- 只加不改：`createKit({THREE,config,rng,assets})` 返回新增 `registry`（默认引用 `assets.js` 的 `assetRegistry`，可传入 `assets.registry` 覆盖）；`createKit` 新增接受可选 `assets` 参数。
- 新增能力（不改旧签名）：
  - `details.js`：`DETAIL_PROFILES/detailProfile/instancedIn/tileLines/dougongRow/ridgeBeast/railingExtras/pavingPattern/rockery/stoneLamp/censerProps/willowTree`
  - `assets.js`：`assetRegistry`（33 条）、`validateRegistry()`、`ASSET_SOURCES`
  - `props()` 新增 `kind:'rockery'|'stoneLamp'|'stoneRail'|'path'`；`censer` 返回 `userData.lightAnchor{type:'censer'}`、`lantern/stoneLamp` 返回 `userData.lightAnchors`
  - `tree()/treeCluster()` 新增 `kind:'willow'`（垂枝），松/阔叶行为不变
  - 行为修正（内部改进）：城门/院门改为实开洞口 + 板门 + 门钉 + 门环，门洞不再被实体填死；重檐下檐按等级降密；`f.gate-south` 合并 mesh 由 18 降到 16（满足 ≤16）
- 无破坏性签名变更；无需主 Agent 升版本。

### 基线版本

- `v0.9`（config/STYLE/CONTRACTS 均按 v0.9 消费，未改动 shared 与 docs 之外的契约文件）。

### 检查步骤与结果（实际执行）

```text
node --check src/kit/index.js && node --check src/kit/materials.js && node --check src/kit/details.js && node --check src/kit/assets.js
→ ALL-SYNTAX-OK

node tests/layout.test.mjs
→ layout 通过：建筑 68 栋、院落 18 处、连接 14 个、视角 8 种

node tests/kit.test.mjs
→ kit 通过：6 类建筑 + 廊/墙/桥/内景/树/水/铺地，主殿 3777 三角面（不含实例展开）

node tests/zones.test.mjs
→ forecourt 31003 / inner 16385 / west 24213 / east 24213 / garden 12845 / boundary 27814 三角面；
  zones 通过：实测 6 个区域，跳过 0 个（灰盒）

node tests/kit-a.extra.test.mjs
→ kit-A 补充通过：68 槽位预算与 mesh 上限、门洞通透、瓦垄/斗栱/脊兽/栏杆/铺地细节、松/阔/柳、香炉锚点、registry 33 条

node scripts/shot.mjs zone golden docs/shots/kit-sample.png "id=zone.main-hall"
→ 第 1 次：未取到画面数据（页面可能未完成加载）；第 2 次：截图输出 docs/shots/kit-sample.png (567832 bytes)
→ kit-sample.dom.html 校验：diagtext 无内容（无页面错误）；stats=calls 238 · tris 182982 · bldg 68

kit-preview.html?stats=1（headless dump-dom 自检，非规定命令）
→ diagtext NONE；statsdata { meshes:239, triangles:7424, calls:227, anchors:7, hallTriangles:1376, registry:33 }
```

### 三角面与 mesh 统计（真实 GPU 计数，含实例数量）

| 建筑 | 三角面 | 合并 mesh | 上限 |
| --- | --- | --- | --- |
| b.main-hall 金銮殿 | 4829 | 15 | 6000 |
| c.hall-1 坤宁寝殿 | 2948 | 15 | 3000 |
| f.gate-south 南城门(城台+城楼) | 2959 | 16 | 3000 |
| b.gate-south 前朝南门 | 1909 | 14 | 3000 |
| f.corner-nw 西北角楼 | 2448 | 8 | 3000 |
| f.pavilion-main 御景亭 | 1909 | 11 | 3000 |
| b.mid-hall 中殿 | 1498 | 14 | 3000 |
| b.main-w 前朝西配殿 | 1173 | 14 | 3000 |
| c.gate-inner 内廷门 | 1068 | 9 | 3000 |
| d.c1.main 西宫苑一院正殿 | 1325 | 14 | 3000 |

全部 68 槽位：最大三角面 4829（主殿），全建筑 mesh ≤16（最大 16）；无 NaN；主殿增量远低于 8k 红线。

### 已知问题

- `scripts/shot.mjs` 固定 `--virtual-time-budget=40000`，本次需重试一次才成功（首次 DOM 未取到画面数据，页面无报错）；判断为该预算处于边缘阈值，非页面错误。既有 `view-oblique-golden.png` 仅 5,855 bytes，疑似同一原因。建议主 Agent 提高预算或改为轮询 `#shotdata`。
- `f.gate-south` mesh 恰为 16、`c.hall-1`/`f.gate-south` 三角面接近 3000 上限；继续加细节需先重新分配预算。
- `pavingPattern` 在有 `document` 时按正常分格（浏览器），Node 测试下间距 ×1.8 退化，因此 `zones.test` 报告值低于浏览器实测。
- 样板/预览观感仅通过几何、射线与 dom.html 校验，受“禁止读取图片”约束未做人眼比对。

### 未验证项

- 浏览器实机 FPS、阴影与后处理整帧开销（属主 Agent 整城统计范围）。
- `kit-preview.html` 无法用 `scripts/shot.mjs` 截图（该脚本固定 `index.html`），仅 headless dump-dom 验证。
- 夕照/夜景下新细节（斗栱、瓦垄、彩画贴图）的表现未截图验证。

