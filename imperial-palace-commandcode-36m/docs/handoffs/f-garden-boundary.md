# 交付回执 · F（御花园 + 宫城边界与水系）

- 任务 ID：F（`garden` 与 `boundary` 两分区）
- 交付日期：2026-09-26
- 风格/接口基线：`STYLE_VERSION v0.9`（`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`）

## 1. 可写文件 / 只读依赖

**已写文件（仅此两个）**
- `src/zones/garden-boundary.js`（11 行 greybox 占位 → 真实实现，531 行）
- `docs/handoffs/f-garden-boundary.md`（本文件）

**只读依赖（未改动）**
- `imperial-palace-plan.md`（§3 风格 / §5.5 花园与边界 / §6 接口 / §8 验收）、`docs/TASK_BRIEF.md`
- `docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`
- `src/shared/config.js`（`CITY`、`FP`、`PALETTE`、`ZONE_VIEWS`）、`src/shared/layout.js`（`SLOTS/CONNECTORS/CORRIDORS/ROADS/PONDS/TREES`）
- `src/zones/_greybox.js`（boundary 分支：墙段留门洞、角楼、四桥与桥面 surfaces 的写法）
- `src/kit/index.js`、`src/core/terrain.js`、`src/core/registry.js`、`src/core/loader.js`、`src/shared/rng.js`

**未触碰**：`src/core/**`、`src/shared/**`、`src/kit/**`、`src/main.js`、`index.html`、`tests/**`、`scripts/**`、`package.json`、其他分区文件。

## 2. 使用的 kit 与材质

- 构件：`kit.building(slot)`（`gateHall`/`cornerTower`/`pavilion`/`hall`/`sideHall`/`courtyardGate`）、`kit.wall`、`kit.bridge`、`kit.corridor`、`kit.roof`（含兜底补屋顶）、`kit.slabRect`、`kit.treeCluster`、`kit.props({kind:'pond'|'rock'|'lantern'|'lion'})`、`kit.mergeStatic`。
- 材质：全部由 `kit.materials` 提供（`roofGold/roofGoldDark/ridge/wallRed/wallRedDark/stone/stoneDark/stoneSide/paving/pavingWarm/wood/woodDark/dark/water/treeA/treeB/trunk/grass/rock/bronze/lanternRed/plaque`），未自造材质或贴图。
- 未创建：相机、renderer、动画循环、第二套灯光系统、全局事件。灯光只登记 `lightAnchors`。
- 护城河水面与宫城外圈地形由 `src/core/terrain.js` 提供，本文件**未重复生成**护城河水体/地形；仅把水面登记为障碍包围盒。

## 3. 分区登记汇总（来自实际运行）

| 分区 | buildings | obstacles | surfaces | 机位 | connectors | 三角面 |
| --- | --- | --- | --- | --- | --- | --- |
| garden | 7（槽位 7，全覆盖） | 19 | 28 | `zone.garden`(zone)、`fp.garden`(fp-spawn) | 1（`conn.garden-south`） | 21140 |
| boundary | 8（槽位 8，全覆盖） | 28 | 69 | `zone.gate-south`(zone)、`fp.boundary`(fp-spawn) | 8（owner=boundary 全部） | 18245 |

两分区 `mergeStatic(root)` 后分别剩 41 / 71 个网格；所有 surface 的 `y` 有限、`min≤max`；自检脚本确认两分区 **无 NaN 网格 / 无 NaN 建筑包围盒**。

### garden（御花园，zone x∈[-160,160]、z∈[290,430]）
- 7 个槽位全部 `kit.building` 落地：御花园门、御景亭（皇家攒尖金顶）、西水亭、东水亭、观花殿（北端，rot 180）、园西书斋、园东茶房。
- 曲折步道：`layout.ROADS` 本区道路 + 9 段直角折径（`kit.slabRect`，中式“曲径”）。
- 树群：`layout.TREES.garden`（count 170、area {x:0,z:368,w:300,d:120}）经确定性 RNG 散布，避让建筑/水面/中轴/廊道后按 ~55% 松 / 45% 阔叶用 `kit.treeCluster` 实例化。
- 假山：`kit.props({kind:'rock'})` 7 块（东西各一簇），逐块登记障碍。
- 小型水景：`layout.PONDS` 中 garden 的两处 (`(-64,390,r32)`、`(64,390,r28)`) 用 `kit.props({kind:'pond'})`，水域登记为障碍。
- 廊道：`ctx.corridors` 两段（x=±130，len120，axis z）`kit.corridor`。
- 与后宫相连：南侧 `conn.garden-south`（z=292, w=26）留通道——该处不设墙、不设障碍，园门（z=306 courtyardGate）的障碍在门洞处留缺口（见 §4），故贯通。
- 灯位：8 个建筑灯位 + 8 盏石灯（`lantern` props 与 anchors）。
- 台阶：御景亭/东西亭/观花殿/园门等按台基高生成 2–4 级递增台阶面（每级 ≤0.55）。

### boundary（宫城边界，zone x∈[-345,345]、z∈[-495,495]）
- 8 个槽位：南门 `f.gate-south`（royal, drum）、北门（major, drum）、西门（major, drum）、东门（major, drum）+ 四座 `cornerTower`（royal，三层重檐）。
- 红墙完整闭合，四边分段生成 `kit.wall`，门处留缺口：
  - 南 z=-450，缺口 x=0，w=46 → 墙段 x∈[-300,-23] 与 [23,300]
  - 北 z=450，缺口 x=0，w=40 → x∈[-300,-20] 与 [20,300]
  - 西 x=-300，缺口 z=0，w=38 → z∈[-450,-19] 与 [19,450]
  - 东 x=300，缺口 z=0，w=38 → z∈[-450,-19] 与 [19,450]
  - 每段墙登记 obstacles，高度到 `CITY.wallH+1.4 = 11.9`，厚度半宽 `wallT/2+1.4 = 2.9`。宫墙包络 X∈[-300,300]、Z∈[-450,450]。
- 护城河四桥（位置与 `_greybox.js`/`CONNECTORS` 一致，拱起 `rise=2.2`）：
  - 南 `(0,-472)` axis z，len56，w26；北 `(0,472)` axis z，len56，w22；西 `(-322,0)` axis x，len56，w22；东 `(322,0)` axis x，len56，w22。
  - 每桥登记 14 段 `kind:'bridge'` 可行走面，`y = rise·sin(πt)`；实测**最大每级高差 0.480 ≤ FP.step(0.55)**（斜坡标高 0 → 最高 2.2 → 0）。
- 水面障碍：护城河四面环带登记为 obstacle（`y∈[-5,0.5]`），在四桥处留缺口（南 ±13、北/西/东 ±11），保证可通行且不能走上水面。
- 连接：`conn.south-gate / north-gate / west-gate / east-gate / south-bridge / north-bridge / west-bridge / east-bridge` 全部登记，位置/宽度/标高取自 `layout.CONNECTORS`。
- 机位：`zone.gate-south`（取景南城门，参数取 `config.ZONE_VIEWS`）、`fp.boundary` = `[0, 1.65, -497]`（南桥头可行走面）。
- 灯位：4 门 + 4 角楼各一灯位 + 8 盏门内石灯 anchors；南门内一对铜狮（`props({kind:'lion'})`）。

## 4. 关键实现说明

- **门口留洞**：城门（`gateHall` drum）与园门（`courtyardGate`）的障碍包围盒在门洞处拆成左右两块（城门门洞半宽 6.5、园门 5.5），保证第一人称可穿过南门/北门/西门/东门/园门，同时阻挡墙体与城台。
- **曲面与台阶**：桥面用 14 段递增 `bridge` 面；建筑台基用 2–4 级递增 `stairs` 面（每级 ≤ `FP.step`），台阶置于建筑正面。
- **随机性**：`ctx.rng`（生产与测试均为 `rngFor` 工厂）派生 `zone.garden` 固定序列，可复现。

## 5. 实际执行的命令与结果

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 2"
node --check src/zones/garden-boundary.js
# -> SYNTAX OK

node tests/zones.test.mjs
#   forecourt: 建筑 13，障碍 19，可行走面 12，机位 3，三角面 23719
#   inner:     建筑 8，障碍 31，可行走面 13，机位 3，三角面 17102
#   west:      建筑 16，障碍 20，可行走面 13，机位 2，三角面 18789
#   east:      建筑 16，障碍 20，可行走面 13，机位 2，三角面 18789
#   garden:    建筑 7，障碍 19，可行走面 28，机位 2，三角面 21140
#   boundary:  建筑 8，障碍 28，可行走面 69，机位 2，三角面 18245
#   zones 通过：实测 6 个区域，跳过 0 个（灰盒）      # EXIT=0

node tests/layout.test.mjs
#   layout 通过：建筑 68 栋、院落 18 处、连接 14 个、视角 8 种   # EXIT=0
```

（`tests/zones.test.mjs` 记 `跳过 0`：其余分区文件存在且导出函数，当前仍是 greybox stub，会被检查并通过。）

附加自检（scratchpad 一次性脚本，非交付物）：两分区 `nanMesh=0`、`nanBuildingBounds=0`、`badSurfaces=0`、`badObstacles=0`；桥面/台阶最大高差 ≤0.55。控制台里 `computeBoundingBox(): ... NaN` 的告警为基线既有噪声（来自其他 stub 分区的单檐 hall，见 §6）。

## 6. 已知问题 / 未验证（需主 Agent 处理）

1. **【需 A 修复 kit】单檐 `hall` 屋顶 NaN**：`src/kit/index.js` 的 `hall()` 非重檐分支调用 `roof({ w: o.w + 3.4, d: o.d + 3 })` **漏传 `h`**，`roofShape` 里 `h * ...` 得 `undefined`，生成 NaN 位置几何，导致 `kit.building()` 返回的 `bounds/height` 全 NaN。
   - 影响：本区 `f.hall-garden`（观花殿）；其他分区所有单檐 hall（如 forecourt 的 `b.mid-hall`、`b.rear-hall`）同样受影响，只是 greybox 用 `inZone()` 的 NaN 比较恰好“跳过”了 NaN 面而未暴露。
   - 建议修复：`roof({ w: o.w + 3.4, d: o.d + 3, h: roofH })`。
   - 我在 `src/zones/garden-boundary.js` 内做了**自失效兜底**（不触碰 kit）：当 `kit.building` 返回的 bounds 非有限时，剔除 NaN 网格并按 kit 形制用 `kit.roof({...,h})` 补回屋顶，同时用有限包围盒登记。A 修好 kit 后该分支不再触发。**请据此修复 kit 后回归本文件即可移除对兜底的依赖。**
2. **未做端到端视觉/第一人称实测**：本机无法启动渲染；机位参数、门口留洞尺寸、桥面标高均按契约与几何推算并做数值自检，但**未**在浏览器中按 §6.4 路线实测“南桥→南城门→前朝广场”的穿行（G 的 FP 装置尚在开发）。墙/桥/门洞的碰撞数据已就绪。
3. **护城河水面障碍**由本区登记（`CONTRACTS` 允许“水面”为障碍），与 `core/terrain.js` 的水面几何对齐；若主 Agent 决定改由核心统一登记，请通知我移除。
4. **宫墙缺口宽度**按任务卡取 `w≈46/40/38`（等于各门槽位 `w`）。城门 drum 城台实际外扩 `w+16`，故红墙末端与城台基座有 ~8m 交叠（视觉上如墙接城台，非穿模）；如需完全对齐，可改为按城台外扩留洞，属跨区风格项，交主 Agent 定夺。
5. **边界未铺装宫城内部地坪**：`layout.ROADS` 在 boundary 矩形内命中大量内部道路，为避免与其他分区重复铺装/闪面，仅铺装外侧/桥头道路（|x|>halfX-6 或 |z|>halfZ-6）。内部道路由 B/C/D/E 各自负责。

## 7. 交付自评

- 两分区均为真实实现（非 greybox），`STUB` 已移除；`createGarden`/`createZone` 两个导出齐备，`createZone` 按 `zone.id` 分派。
- 满足硬性要求：`buildings.length ≥ slots.length`；每栋经 `kit.building(slot)` 且登记障碍；`obstacles`/`surfaces` 非空；`surfaces.y` 有限；台阶/桥面分段递增且每级 ≤ `FP.step`；两分区末均 `kit.mergeStatic(root)`；无相机/渲染循环/第二灯光系统/全局事件。
- 验收命令全部通过（§5）。
