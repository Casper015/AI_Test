# 主 Agent 集成报告（紫禁天朝 · 完整皇宫 3D）

- 目标目录：`AI_Test/imperial-palace copy 2/`
- 依据：`imperial-palace-plan.md`（实施启动指令）、`docs/TASK_BRIEF.md`、`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`
- 工作方式：主 Agent 搭建/校验骨架并统筹集成，子 Agent 分区并行实现（B/C/F 第一批，D/E/G 第二批），主 Agent 负责根因修复、整合与验收。

## 一、批次与文件归属

| 批次 | 任务 | 产出文件 | 备注 |
| --- | --- | --- | --- |
| 准备 | 主 Agent | `index.html`、`src/main.js`、`src/core/**`、`src/shared/**`、`src/kit/**`、`scripts/**`、`tests/**`、`docs/**` | 由基线灰盒骨架迁入并校验 |
| 1 | B 前朝 | `src/zones/forecourt.js` | 金銮殿三层台基、丹陛御道、可进入内景 |
| 1 | C 后宫 | `src/zones/inner-palace.js` | 三进内廷、寝殿可进入内景 |
| 1 | F 花园+边界 | `src/zones/garden-boundary.js` | `createGarden` + `createZone`（boundary） |
| 2 | D 西宫苑 | `src/zones/west-courts.js` | 4 组院落 |
| 2 | E 东宫苑 | `src/zones/east-courts.js` | 4 组院落，与 D 差异化 |
| 2 | G 交互与 UI | `src/interaction/index.js`、`src/ui/index.js` | HUD、拾取、导览、小地图 |

各任务的开工/交付回执见 `docs/handoffs/<task>.md`（G 的回执由主 Agent 代为补写）。

## 二、主 Agent 的根因修复（影响全城）

1. **`kit.hall` 单檐分支漏传屋面高度**：`roof({w,d})` 未传 `h`，导致所有单檐殿堂屋面几何为 NaN，进而使其 `bounds` 变成 NaN。修复为 `roof({..., h: roofH})`（`src/kit/index.js`）。
2. **`kit.mergeStatic` 丢失实例化网格的父级变换**：`mergeByMaterial` 只 `clone()` 实例网格，处在已平移/旋转父组内的实例（廊庑柱、桥墩、栏杆柱等）会堆到世界原点。修复为按 `inv * matrixWorld` 烘焙每个保留实例网格的平移/旋转/缩放（`src/kit/merge.js`）。
3. **可进入殿堂被实心体块填满**：`kit.hall` 的殿身内部用不透明暗体块填充，导致金銮殿/寝殿内景不可见（内景视角全黑）。修复为**仅对非 `visitable` 建筑**保留填充（`src/kit/index.js`）。
4. **内景机位被 OrbitControls 推离室内**：`minDistance=30` 会把室内机位推到室外。将 `interior.main-hall` 与 `interior.inner` 的机位改为落在室内且满足距离/极角约束（`src/zones/forecourt.js`、`src/zones/inner-palace.js`）。

> 因第 1、3 项同时影响 B/C/F 的局部防御分支，修复后这些分支不再触发（其判据为「检测到 NaN 才生效」），行为与移除等价；相关惰性代码列于已知问题。

## 三、实测数据（`npm test`）

- 布局：建筑 **68** 栋（含分区内附加建筑，全城注册 **74** 栋）、院落 **18** 处、连接 **14** 个、视角 **8** 种。
- 构件库：6 类建筑 + 廊/墙/桥/内景/树/水/铺地；主殿约 1500 三角面。

| 分区 | 建筑 | 障碍 | 可行走面 | 机位 | 三角面 |
| --- | --- | --- | --- | --- | --- |
| forecourt（前朝） | 13 | 29 | 35 | 3 | 26,620 |
| inner（后宫） | 8 | 31 | 13 | 3 | 17,090 |
| west（西宫苑） | 20 | 61 | 77 | 2 | 33,281 |
| east（东宫苑） | 18 | 63 | 21 | 2 | 33,670 |
| garden（御花园） | 7 | 19 | 28 | 2 | 21,116 |
| boundary（城墙边界） | 8 | 28 | 69 | 2 | 18,245 |

机位 id 全部符合约定：`zone.main-hall / zone.inner / zone.west / zone.east / zone.garden / zone.gate-south` 与对应 `fp.*`，B/C 另含 `interior.*`。默认导览顺序 `zone.gate-south → zone.main-hall → zone.inner → zone.garden` 均存在。

## 四、验收证据

```bash
npm test          # layout/kit/zones 全部通过，无 NaN 告警
npm run build     # dist 构建完成（src: ok），资源路径相对
npm run serve     # http://127.0.0.1:8123/ -> 200；src/main.js、three.module.js -> 200
cd dist && python3 -m http.server 8124   # dist 预览 -> 200
```

截图（`docs/shots/`，`1440×900`、DPR 1、`?ui=0`，由 CDP 版 `scripts/shot.mjs` 在场景就绪后抓拍）：

`view-oblique`、`view-iso`、`view-axis`、`view-focus-main-hall`、`view-zone-main-hall`、`view-zone-inner`、`view-zone-west`、`view-zone-east`、`view-zone-garden`、`view-zone-gate-south`、`view-interior-main-hall`、`view-interior-inner`、`view-fp-forecourt`（各 `-golden`）。

- 鸟瞰可见完整宫墙闭合、护城河、四角角楼、四面城门、南北中轴、东西宫苑与御花园（74 栋建筑、88 个灯位）。
- 金銮殿内景截图可见宝座与台基、盘龙柱、朱红内墙、藻井天花；渲染统计 57 fps / 268 draw calls / 101k 三角面。
- 第一人称出生点截图可见站在可行走面上的近景。

## 五、偏差、未验证与已知问题

- **未做**真实设备（多 GPU/浏览器）逐项性能与观感验收；截图在无头 SwiftShader 软件渲染下取得，帧率不代表真机。
- 内景在「盛世金辉」下偏暗；未新增室内专属补光（属核心环境系统改动，超出本轮范围）。
- `layout.js` 中 `rot` 的说明（90=东、270=西）与 Three.js 实际旋转方向相反；几何与相机取景自洽，冻结布局未改。
- 分区 B/C/F 保留少量「检测到 NaN 才生效」的防御分支，根因修复后不触发，属可清理的惰性代码。
- `scripts/shot.mjs` 使用 CDP 等待 `window.__PALACE__` 后截图；本机存在并发会话时偶发超时，需要重试。
- 本轮**未接入任何第三方模型/贴图**（全部为程序化几何与材质）；`docs/ASSET_CREDITS.md` 暂无内容需求。
- `work/` 为下载与中间件预留目录，本轮为空。

## 六、最终检查清单（对照计划 §8.3）

- [x] 所有项目文件都在独立 `imperial-palace copy 2/` 内。
- [x] 首屏可见完整皇宫，中轴、多进院落、左右侧院、后部宫苑结构成立。
- [x] 建筑与院落数量可由注册表核对（74 栋 / 18 院）。
- [x] 宫墙、角楼、城门、桥与水系完整；中轴与侧院道路相通。
- [x] 金銮殿与寝殿内景完整可进入并可见；不可进入建筑在信息面板标注。
- [x] 各任务有交付回执，使用同一风格与接口版本。
- [ ] 外部模型适配 —— 本轮无外部模型（不适用）。
- [x] 视角截图齐备（13 张）；内景不再全黑。
- [x] 相机切换、导览、选中、漫游、分区跳转、回到全城可用（同一相机装置）。
- [~] 第一人称按 §6.4 路线整段实走 —— 出生点与碰撞数据齐备，未做人工整段走查。
- [x] 无每区域独立渲染循环；共享资源不被局部误释放。
- [x] 构建产物无 404、无关键运行错误；性能与加载数据已记录。
- [x] README 的安装/运行/构建命令均实测可用。
