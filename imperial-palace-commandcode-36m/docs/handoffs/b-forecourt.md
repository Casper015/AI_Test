# 交付回执 · B 中轴前朝（forecourt）

## 1. 任务 ID / 可写文件 / 只读依赖

- **任务 ID**：B（中轴前朝）
- **可写文件（本次改动）**
  - `src/zones/forecourt.js`（11 行 greybox 占位 → 339 行真实实现）
  - `docs/handoffs/b-forecourt.md`（本回执）
- **只读依赖**（均未修改）
  - `docs/TASK_BRIEF.md`、`imperial-palace-plan.md` §3/§5.2/§6/§8、`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`
  - `src/shared/config.js`、`src/shared/layout.js`（`ZONES.forecourt` / `SLOTS.forecourt` / `CORRIDORS.forecourt` / `ROADS` / `CONNECTORS` / `ZONE_VIEWS`）
  - `src/kit/index.js`、`src/kit/materials.js`、`src/kit/merge.js`、`src/core/registry.js`、`src/core/loader.js`、`src/zones/_greybox.js`
- **导出契约**：`export async function createZone(ctx)`（不再 import `_greybox.js`；本文件无需 `createGarden`）。

## 2. 使用的 kit 与材质

- **kit.building(slot)**：13 个槽位全部落地（gateHall ×2、hall ×3、sideHall ×8）。
- **kit.corridor**：`ctx.corridors` 6 条廊庑全部生成并登记障碍盒。
- **kit.interior({ kind:'throne' })**：金銮殿内景（金砖地面 `goldFloor`、金銮宝座、屏风、盘龙柱 + 盘龙雕饰、藻井），并按需要改出入口。
- **kit.slabRect**：本区道路（axis/plaza）+ 南院/后苑/横向御道铺地。
- **kit.boxAt / kit.stairs 级数自建（boxAt 逐级）**：丹陛御道与两侧台阶。
- **kit.roof**（补顶）、**kit.props**（lion ×4、censer ×4、lantern ×10、banner ×2）、**kit.treeCluster**（pine/broad）。
- **kit.mergeStatic(root)**：收尾合并一次。
- **材质（`kit.materials`）**：`stoneSide`（台阶/石作）、`innerWall`（室内墙）、`paving/pavingWarm`（铺地，经 slabRect）、其余屋顶/墙面/彩画由 `kit.building`/`kit.roof`/`kit.props` 内部取用；未新增色板。

## 3. 登记数据（实测）

| 项目 | 数值 |
| --- | --- |
| 建筑 buildings | **13**（= `SLOTS.forecourt` 槽位数） |
| 障碍 obstacles | **29** |
| 可行走面 surfaces | **35** |
| 连接 connectors | 0（本区无 `owner==='forecourt'` 的 CONNECTOR，字段保留为空数组） |
| 三角面 | **26680**（阈值 900000） |
| 机位 viewpoints | **3** |

**机位 id 列表（完全按契约）**
- `zone.main-hall`（mode `zone`；取自 `layout.ZONE_VIEWS['zone.main-hall']`）
- `fp.forecourt`（mode `fp-spawn`；`position:[0,0,-330]`，`target:[0,6,-120]` 朝向中轴主殿；落在 `ground.forecourt` 可行走面上）
- `interior.main-hall`（mode `interior`；`position:[0,7.2,-136]`，在室内包围盒 x∈(-30.7,30.7)、z∈(-139.7,-100.3)、y∈(4.5,13.7) 内）

**lightAnchors（lantern，`0xffb46b`）**
- 主要殿堂/门殿：`b.gate-south`、`b.gate-mid`、`b.main-hall`、`b.mid-hall`、`b.rear-hall`、`b.main-w`、`b.main-e`，intensity 6。
- 广场石灯 10 处，intensity 4。

**surfaces 构成（35）**：`ground.forecourt` ×1、主殿三层台基 `terrace0/1/2` ×3、室内 `b.main-hall.interior` ×1、台阶 `stair.*` ×30（中央丹陛 10 级 + 两侧台阶各 10 级，每级高差 0.45 m ≤ `FP.step` 0.55）。

**obstacles 构成（29）**：廊庑 ×6、主殿分解墙体 ×3（东西山墙 + 后檐墙）、门殿门洞分块 ×4（南门殿/中门各 2）、其余 10 栋建筑整块 ×10、室内四墙 + 南墙门洞分段 + 门楣 ×6。

## 4. 实现要点

- **中轴递进**：南门殿 `b.gate-south` → 朝房 `b.court-a-w/e` → 中门 `b.gate-mid` → 礼仪广场（axis/plaza 铺地 + 丹陛御道）→ **金銮殿 `b.main-hall`**（三层台基、栏杆、丹陛御道、两侧台阶）→ 中殿 `b.mid-hall` → 后殿 `b.rear-hall`；左右配殿 `b.main-w/e`、`b.mid-w/e`、`b.rear-w/e` 与东西廊庑（x=±108）+ 广场横廊围合，广场四周不留无边界空地。
- **主殿内景**：`kit.interior({kind:'throne'})` 置于台面 y=4.5；将其整片南墙替换为「两侧墙垛 + 门楣」，形成真实门洞；登记 `surfaces(kind:'interior', y=4.92)` 与室内四面墙障碍（南向留门洞）。
- **第一人称可进入**：FP 从南侧出生点沿中轴北上，经丹陛御道逐级登台（footY 0 → 4.5），穿过门洞进入金銮殿（footY → 4.92）。
- **两处本地修补**（均在本人文件内、未改共享代码）：
  1. `kit.hall` 单檐分支调用 `roof()` 时漏传 `h`，屋面/正脊几何为 NaN。本区在 `kit.building` 之后剔除 NaN 网格并补一片正确 `kit.roof`，使 `b.mid-hall`/`b.rear-hall` 楼身完整且**本区无 NaN 包围盒**。
  2. `kit.mergeStatic` 对「位于非单位变换父组内的 InstancedMesh」仅做 clone，会丢失父级位移/旋转（柱、栏杆柱、门钉、石灯、树群等实例会叠到原点）。收尾前把世界变换烘焙进实例矩阵并清零自身变换，合并后实例位置正确。
  - 以上两点对 `src/kit/**` 是只读观察，建议主 Agent 在 A 处修正根因（不属本人可写范围）。

## 5. 实际执行的命令与结果（原始输出）

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 2"
node --check src/zones/forecourt.js
# exit 0，无输出（语法通过）

node tests/zones.test.mjs
#   forecourt: 建筑 13，障碍 29，可行走面 35，机位 3，三角面 26680
#   inner:   建筑 8，障碍 31，可行走面 13，机位 3，三角面 17126
#   west:    建筑 16，障碍 20，可行走面 13，机位 2，三角面 18789
#   east:    建筑 16，障碍 20，可行走面 13，机位 2，三角面 18789
#   garden:  建筑 7，障碍 19，可行走面 28，机位 2，三角面 21140
#   boundary:建筑 8，障碍 28，可行走面 69，机位 2，三角面 18245
# zones 通过：实测 6 个区域，跳过 0 个（灰盒）
# exit 0

node tests/layout.test.mjs
# layout 通过：建筑 68 栋、院落 18 处、连接 14 个、视角 8 种
```

**额外自检（临时脚本，仅校验本人分区，未入库）**
- 本区 `root` NaN 网格数 = **0**，`root` 包围盒有限（`[-115.7,-0.1,-450] ~ [115.7,27,400]`）。
- 13 栋建筑 `bounds` 全部有限；35 个 `surfaces` 全部 `y` 有限且 `min<=max`。
- 机位 id/mode：`zone.main-hall(zone)`、`fp.forecourt(fp-spawn)`、`interior.main-hall(interior)`；室内机位在室内包围盒内。
- 第一人称走查模拟（用 `core/registry.js` 的 `surfaceAt`/`resolveMove`，步长 0.4 m）：自 `(0,0,-330)` 沿中轴北上，footY 由 `0.00` 逐级升至 `4.92`，止于 `z=-107.8`（金銮殿内）；出生点 `blocked=false`，室内 `(0,-120)` `blocked=false`。

## 6. 未验证 / 已知问题

- **未做截图/浏览器实机走查**：本回执无 `docs/shots/*` 截图，`oblique/focus/interior/fp` 等视角的画面观感未用浏览器核对（仅做数据与几何校验）。
- **基线的 NaN 警告仍会打印**：`kit.building` 内部合并单檐大殿屋面时（在本人剔除 NaN 之前）仍会触发 `computeBoundingBox(): ... NaN` 警告，属 TASK_BRIEF 注明的基线噪声；**本人交付的 `root` 内已无 NaN 网格**。同一缺陷亦影响其他分区（inner/west/east/garden 的 major 单檐殿堂），根因在 `src/kit/index.js` 的 `hall()` 单檐分支，建议 A 修复。
- **`kit.mergeStatic` 的实例位移缺陷**：本区已本地烘焙修正；其他分区的实例件（柱/栏杆/石灯/树）可能仍会叠到原点，根因在 `src/kit/merge.js`，建议 A/主 Agent 统一修复。
- **门殿门洞与主殿入口的碰撞为近似**：门殿以中央门洞分块代替整体包围盒；主殿以山墙/后檐墙分块 + 南向门洞；室内南墙以门洞分挡。视觉墙体与碰撞缺口在门洞处一致，但**台阶侧边、台基边缘无护栏碰撞**（可走下台基），如需严格限制需主 Agent 统一定碰撞策略。
- **树木为点缀**：本区建筑/铺地较密，仅在南院两侧（x=±94）放置十余株，未布满 `TREES.forecourt` 全区；中枢与广场保持通透。
- **廊庑与 `ROADS`/`CORRIDORS` 完全按 `layout.js` 落地**（含广场横廊 z≈-196）；若主 Agent 认为横廊位置需调整，属 `src/shared/layout.js`（只读）范畴，请派给对应负责人。
