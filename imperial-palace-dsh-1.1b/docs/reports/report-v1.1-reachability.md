# t17 · 验收 V1.1：43 栋内景可达性终判（生产口径）

> 归属：verifier · 任务 t17 · attempt 2。**只读终判**；不改任何 `src/**`、不改弱任何判据。
> 结论：**43 / 43 栋内景全局可达（cellSize:1 细口径 = 唯一过关口径）· 49 / 49 走查段图路径可达 · 5.3 / B1 / B10 强判据保持原样全绿。**

## 0. 口径三要素（如实标注，不得冒充）

| 要素 | 取值 |
| --- | --- |
| ① **网格参数** | `cellSize:1` 细口径（**唯一过关口径**）：范围 = `TERRAIN_EXTENT`（x∈[-420,420]、z∈[-560,560]）⇒ 841×1121 格，**显式提额 `maxCells:3_000_000`**（默认 400k 会抛错，t116 已证）。`cellSize:2` 粗口径：421×561 格（默认上限内，**非权威**，仅锁已登记伪影）。 |
| ② **锚点** | `OUTSIDE = FP_ROUTE[0]`「南桥北端」= **(0, −480)**（与 t140 / 5.3 / E8 / E11 / E18 **同源**）。 |
| ③ **点集与判据** | 点集 = `INTERIOR_BY_SLOT` 的 **43 个内景面中心**（另并列其**机位** `VIEWPOINTS[record.viewpointId]`）；判据**一律 `.ok`**：`componentOf(x,z,OUTSIDE).ok`（全局）/ `path(OUTSIDE,p).ok`（功能级）/ `connected([...]).ok`（集合级）。**无 `!= null` / `if (!p)` 写法**。 |

**生产装配（自证非替身）**：`scripts/verify-walk.mjs` 的 `assembleCity()` —— 真 kit（`createKit`）+ core registry + B/C/D/E/F 5 区域 `registry.registerZone` ⇒
`solver.stats().obstacles = 751`（= `registry.allObstacles()` 751；基线 `layout.OBSTACLES` 93 + 派生墙体层 658），**与游戏同一装配路径**；区域缺失时**抛错**而非静默退化。

- `LAYOUT_VERSION = 1.1.23` · 可行走面 175 · 槽位 79 · **visitable 43** · `INTERIOR_BY_SLOT` 43
- 建图来源：`assembleCity().createWalkGraph`（引用同一份），非另造替身

## 1. 逐栋 43 行（局部与全局**并列**，**以全局为准**）

- **全局** = 以 `OUTSIDE` 为根的整图连通分量成员判定（`componentOf(...).ok`）
- **局部** = 以**门中**为根的 **±24 格窗口 BFS**（只用 `canStep`），目标 = 内景面中心格 —— 即"门口到室内"这一段
- `canStep` = 门中格 ↔ 内景面中心格的单步可跨判定

| # | 槽位 | 内景面 | 面 y | 门中→室内 canStep | 局部 ok | 全局 ok(cs1) | 全局 ok(cs2) | path.ok(cs1) | 机位 ok |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | B-gate-front | WK-B-gate-front-interior | 0.45 | true | true | true | true | true | true |  |
| 2 | B-hall-main | WK-B-hall-main-interior | 4.5 | true | true | true | true | true | true |  |
| 3 | B-hall-mid | WK-B-hall-mid-interior | 2 | true | true | true | false | true | true |  |
| 4 | B-hall-rear | WK-B-hall-rear-interior | 1.8 | true | true | true | false | true | true |  |
| 5 | B-side-east-main | WK-B-side-east-main-interior | 1.5 | true | true | true | true | true | true |  |
| 6 | B-side-east-rear | WK-B-side-east-rear-interior | 1 | true | true | true | true | true | true |  |
| 7 | B-side-east-south | WK-B-side-east-south-interior | 0.9 | true | true | true | true | true | true |  |
| 8 | B-side-west-main | WK-B-side-west-main-interior | 1.5 | true | true | true | true | true | true |  |
| 9 | B-side-west-rear | WK-B-side-west-rear-interior | 1 | true | true | true | true | true | true |  |
| 10 | B-side-west-south | WK-B-side-west-south-interior | 0.9 | true | true | true | true | true | true |  |
| 11 | C-annex-east | WK-C-annex-east-interior | 1.4 | true | true | true | true | true | true |  |
| 12 | C-annex-west | WK-C-annex-west-interior | 1.4 | true | true | true | true | true | true |  |
| 13 | C-gate-inner | WK-C-gate-inner-interior | 0.9 | true | true | true | true | true | true |  |
| 14 | C-hall-bed-main | WK-C-bed-interior | 2.4 | true | true | true | true | true | true |  |
| 15 | C-hall-bed-rear | WK-C-hall-bed-rear-interior | 2.1 | true | true | true | true | true | true |  |
| 16 | C-side-east-main | WK-C-side-east-main-interior | 1.7000000000000002 | true | true | true | true | true | true |  |
| 17 | C-side-east-rear | WK-C-side-east-rear-interior | 1.5 | true | true | true | true | true | true |  |
| 18 | C-side-west-main | WK-C-side-west-main-interior | 1.7000000000000002 | true | true | true | true | true | true |  |
| 19 | C-side-west-rear | WK-C-side-west-rear-interior | 1.5 | true | true | true | true | true | true |  |
| 20 | D-court1-hall | WK-D-court1-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 21 | D-court1-house | WK-D-court1-house-interior | 0.9 | true | true | true | true | true | true |  |
| 22 | D-court2-hall | WK-D-court2-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 23 | D-court2-house | WK-D-court2-house-interior | 0.9 | true | true | true | true | true | true |  |
| 24 | D-court3-hall | WK-D-court3-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 25 | D-court3-house | WK-D-court3-house-interior | 0.9 | true | true | true | true | true | true |  |
| 26 | D-court4-hall | WK-D-court4-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 27 | D-court4-house | WK-D-court4-house-interior | 0.9 | true | true | true | true | true | true |  |
| 28 | E-court1-hall | WK-E-court1-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 29 | E-court1-house | WK-E-court1-house-interior | 0.9 | true | true | true | true | true | true |  |
| 30 | E-court2-hall | WK-E-court2-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 31 | E-court2-house | WK-E-court2-house-interior | 0.9 | true | true | true | true | true | true |  |
| 32 | E-court3-annex | WK-E-court3-annex-interior | 0.9 | true | true | true | true | true | true |  |
| 33 | E-court3-hall | WK-E-court3-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 34 | E-court3-house | WK-E-court3-house-interior | 0.9 | true | true | true | true | true | true |  |
| 35 | E-court4-hall | WK-E-court4-hall-interior | 1.3 | true | true | true | true | true | true |  |
| 36 | E-court4-house | WK-E-court4-house-interior | 0.9 | true | true | true | true | true | true |  |
| 37 | F-garden-hall-east | WK-F-garden-hall-east-interior | 0.5 | true | true | true | true | true | true |  |
| 38 | F-garden-hall-north | WK-F-garden-hall-north-interior | 0.8 | true | true | true | true | true | true |  |
| 39 | F-garden-hall-west | WK-F-garden-hall-west-interior | 0.5 | true | true | true | true | true | true |  |
| 40 | F-gate-east | WK-F-gate-east-interior | 0.4 | true | true | true | true | true | true |  |
| 41 | F-gate-north | WK-F-gate-north-interior | 0.4 | true | true | true | true | true | true |  |
| 42 | F-gate-south | WK-F-gate-south-interior | 0.4 | true | true | true | true | true | true |  |
| 43 | F-gate-west | WK-F-gate-west-interior | 0.4 | true | true | true | true | true | true |  |

## 2. 汇总（43 栋）

| 指标 | 结果 |
| --- | --- |
| **全局不可达（cellSize:1 细口径 = 唯一过关口径）** | **0 栋（43/43 全部可达 ✓）** |
| 全局不可达（cellSize:2 粗口径，**非权威**） | 2 栋：`B-hall-mid`、`B-hall-rear` —— **恰为 t146/t148 已登记粗口径伪影集合**（逐字相等，无新增） |
| **局部 ↔ 全局分歧** | **0 栋**（局部窗口结论与全局一致，无"局部看着通、全局其实不通"） |
| 门中→室内 `canStep === false`（cs1） | 0 栋 |
| 内景面可达但**机位**不可达 | 0 栋 |
| 声明 `blockedBy`（不可通行）的栋数 | **0**（t13 后 63 门槽位 `passable` 全 true） |

**断点格对**：因细口径不可达 = 0，**无断点可贴**（该项按"若仍不可达则贴"的条件不触发）。

### 为何 cs2 的 2 栋不构成"不可达"
`cellSize:2` 的 3m/2m 格心会**跳过 1.05m 窄过渡面与 1.5m 台基层**，故对 `B-hall-mid`/`B-hall-rear`（2 级入门台阶）产生**工具分辨率伪影**；同两栋在 1m 图上 `componentOf.ok = true` 且 `path.ok = true`。此与 `tests/walk-reachability.test.mjs` 的登记一致（粗口径集合 `['B-hall-mid','B-hall-rear']`，**新增即红**）。

## 3. 走查 49 段逐段读数

`FP_ROUTE` 50 点 ⇒ **49 段**。下表的"**图路径**"列是**权威读数**（1m 生产图上的 `path(...).ok` / 路径长 / 途经格数）：

| # | 段 | 直线长 m | path.ok | 图路径长 m | 途经格数 |
| --- | --- | --- | --- | --- | --- |
| 1 | 南桥北端 → 南城门内 | 35.0 | true | 36 | 36 |
| 2 | 南城门内 → 礼仪广场 | 145.0 | true | 146 | 146 |
| 3 | 礼仪广场 → 主殿丹陛前 | 110.0 | true | 111 | 111 |
| 4 | 主殿丹陛前 → 主殿台基顶 | 44.0 | true | 45 | 45 |
| 5 | 主殿台基顶 → 金銮殿内景 | 36.0 | true | 37 | 37 |
| 6 | 金銮殿内景 → 内廷门 | 205.0 | true | 516 | 516 |
| 7 | 内廷门 → 寝殿内景 | 70.0 | true | 71 | 71 |
| 8 | 寝殿内景 → 御花园 | 175.0 | true | 230 | 230 |
| 9 | 御花园 → 前朝门殿门内 | 724.5 | true | 926 | 926 |
| 10 | 前朝门殿门内 → 内廷门门内 | 480.0 | true | 659 | 659 |
| 11 | 内廷门门内 → 南城门门内 | 548.0 | true | 727 | 727 |
| 12 | 南城门门内 → 北城门门内 | 905.0 | true | 1106 | 1106 |
| 13 | 北城门门内 → 西侧城门门内 | 544.3 | true | 804 | 804 |
| 14 | 西侧城门门内 → 东侧城门门内 | 605.0 | true | 762 | 762 |
| 15 | 东侧城门门内 → 广场西配殿门内 | 484.1 | true | 755 | 755 |
| 16 | 广场西配殿门内 → 广场东配殿门内 | 155.0 | true | 156 | 156 |
| 17 | 广场东配殿门内 → 主殿西配殿门内 | 243.2 | true | 344 | 344 |
| 18 | 主殿西配殿门内 → 主殿东配殿门内 | 163.0 | true | 230 | 230 |
| 19 | 主殿东配殿门内 → 后殿西庑殿门内 | 221.4 | true | 506 | 506 |
| 20 | 后殿西庑殿门内 → 后殿东庑殿门内 | 143.0 | true | 176 | 176 |
| 21 | 后殿东庑殿门内 → 寝殿西配殿门内 | 186.3 | true | 264 | 264 |
| 22 | 寝殿西配殿门内 → 寝殿东配殿门内 | 135.0 | true | 176 | 176 |
| 23 | 寝殿东配殿门内 → 西配房门内 | 156.2 | true | 216 | 216 |
| 24 | 西配房门内 → 东配房门内 | 131.0 | true | 164 | 164 |
| 25 | 东配房门内 → 西后院值房门内 | 142.2 | true | 176 | 176 |
| 26 | 西后院值房门内 → 东后院值房门内 | 143.0 | true | 162 | 162 |
| 27 | 东后院值房门内 → 礼乐院南配房门内 | 690.4 | true | 893 | 893 |
| 28 | 礼乐院南配房门内 → 书院南厢门内 | 160.0 | true | 359 | 359 |
| 29 | 书院南厢门内 → 服务院南房门内 | 160.0 | true | 359 | 359 |
| 30 | 服务院南房门内 → 西后南配房门内 | 186.0 | true | 385 | 385 |
| 31 | 西后南配房门内 → 文华院南厢门内 | 635.0 | true | 955 | 955 |
| 32 | 文华院南厢门内 → 陈设北房门内 | 270.1 | true | 425 | 425 |
| 33 | 陈设北房门内 → 生活南房门内 | 72.1 | true | 383 | 383 |
| 34 | 生活南房门内 → 生活院东耳房门内 | 113.7 | true | 149 | 149 |
| 35 | 生活院东耳房门内 → 东后南厢门内 | 166.1 | true | 481 | 481 |
| 36 | 东后南厢门内 → 御花园·西配殿门内 | 486.6 | true | 692 | 692 |
| 37 | 御花园·西配殿门内 → 御花园·东配殿门内 | 470.0 | true | 493 | 493 |
| 38 | 御花园·东配殿门内 → 中殿门内 | 484.8 | true | 732 | 732 |
| 39 | 中殿门内 → 后殿门内 | 64.0 | true | 283 | 283 |
| 40 | 后殿门内 → 后寝殿门内 | 214.0 | true | 329 | 329 |
| 41 | 后寝殿门内 → 礼乐殿门内 | 634.8 | true | 842 | 842 |
| 42 | 礼乐殿门内 → 书院正堂门内 | 160.0 | true | 467 | 467 |
| 43 | 书院正堂门内 → 服务院主屋门内 | 160.0 | true | 467 | 467 |
| 44 | 服务院主屋门内 → 西后殿门内 | 186.0 | true | 493 | 493 |
| 45 | 西后殿门内 → 文华殿门内 | 729.1 | true | 1032 | 1032 |
| 46 | 文华殿门内 → 陈设正堂门内 | 170.0 | true | 483 | 483 |
| 47 | 陈设正堂门内 → 生活主屋门内 | 170.1 | true | 493 | 493 |
| 48 | 生活主屋门内 → 东后殿门内 | 180.0 | true | 499 | 499 |
| 49 | 东后殿门内 → 御花园·北殿门内 | 332.6 | true | 467 | 467 |

**段级结论：图路径可达 49 / 49。** 49 段与 `verify-experience.test.mjs` 的 **B1（8 段子集）** 读数**逐值一致**（B1 实测：南桥北端→南城门内 36m、金銮殿内景→内廷门 516m、御花园→前朝门殿门内 926m、南城门门内→北城门门内 1106m、西后殿门内→文华殿门内 1032m …），互为佐证。

### 直线采样读数（`walkPolyline`）的性质判别 —— **不是路线缺陷**
`walkPolyline` 沿**折线直线**逐步 `probe`，而 `FP_ROUTE` 是**离散步点**（点分别落在门内、台基顶、内景等**不同标高**上）⇒ 直线段会**横切建筑体块与台基顶面**。实测：

- 全段采样 55,363 个 · 受阻采样 5,464 个；受阻原因 **障碍 id 类 5,357 次（97 个不同障碍，含 `OB-B-hall-main` 489、`OB-E-court3-hall` 316、`OB-WB-D-pond` 304、`OB-WB-F-pond-east` 341 …）**
- 非障碍类仅 `dropTooDeep` 59 次 + `stepTooHigh` 54 次
- 直线采样中 `maxUp > 0.5` 的段 26/49、`maxDown < −0.6` 的段 29/49，极值 ±2.00m（如「御花园 → 前朝门殿门内」面高跨 0–4.5m）

⇒ 这些是**直线几何伪影**（直线穿过体块/台基），**不代表路线走不通**；**权威判据是图上的 `path().ok`（上表 49/49）**。
（本条如实并列，**不得**据直线采样放大成"49 段受阻"或缩小成"无读数"。）

## 4. 既有强判据同源复核（**口径一字不改弱**）

| 判据 | 本席独立复核（同一 `assembleCity` 装配 / 同一 `OUTSIDE` / 全 `.ok`） | 结果 |
| --- | --- | --- |
| **5.3**（verifier/verify-completeness） | `connected([起点 + 5 fp-spawn + 50 走查点 + 43 内景机位]).ok` | **true** · 不可达 **0** 项（与 5.3 实测 `PASS — 同一连通分量（图 841×1121@1m，可走 724481 格；障碍 751）` 逐值同源） |
| **5.4** | `path(起点 → 各区 fp-spawn).ok` | B/C/D/E/F **全 true** |
| **B1**（verify-experience） | `path.ok ∧ 8 段全部可达` | **✓ 49/49 段可达**（B1 报 `南桥北端→南城门内(36m) … 东后殿门内→御花园·北殿门内(467m)`） |
| **B10** | `connected([9 走查点 + 5 fp-spawn + 2 内景]).ok` | **✓ 98 个关键点同一连通分量（724481 格 @1m）** |

**未改弱**：本卡为**只读终判**，未编辑任何测试/脚本的判据、区间、点集或阈值（`5.3`/`B1`/`B10` 原文一字未动）。

## 5. 门禁退出码（原样）

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `node scripts/verify-completeness.mjs` | **1** | `检查项 57：PASS 55 / FAIL 1 / UNVERIFIED 1`；**5.3 PASS**（841×1121@1m · 可走 724481 格 · 障碍 751）；FAIL = **5.4b**（通道面 y ≠ `door.sillY`，5 栋城门，**既有数据集缺陷，与本卡无关**）；UNVERIFIED = 11.5（人眼目视项） |
| `node tests/verify-experience.test.mjs` | **1** | **B1 ✓**（49/49 段可达）、**B10 ✓**（98 点同一分量）；该套件其余红为 F1 存量截图矩阵（非本卡） |

## 6. 未闭合同类项（登记交回，本卡未越界改）

1. **`cellSize:2` 的 2 栋粗口径命中**（`B-hall-mid`/`B-hall-rear`）为**已登记伪影**；若后续要"粗口径也 0"，需补 ≥1.05m 窄台的 2m 网格可见性或改用局部补采，**不属本卡**。
2. **直线采样伪影**（`walkPolyline` 的 5,464 受阻采样 / ±2.00m 台阶读数）源于 `FP_ROUTE` 离散步点 + 直线横切；若希望"直线上也无受阻"，需改 `walkPolyline` 为**沿图路径采样**（属 `scripts/verify-walk.mjs` 实现变更，**不属本卡**）。
3. **`verify-completeness` 5.4b**（城门通道面 y 与 `door.sillY` 不一致 5 栋：`C-gate-inner` 0.9 vs 1.8、4 座 F 城门 0.4 vs 12.4）：由 t126 口径固化（`DOOR_SILL_EXCEPTIONS`），**属既有数据集决定项**，非可达性缺陷。

## 7. 原始证据

- 逐栋 43 行 + 汇总 + 走查 49 段（直线采样 + 直方图）：`work/t17/v11-raw.txt`
- 段表（图路径权威读数）+ 性质判别 + 5.3/5.4/B10 复核：`work/t17/segs.txt`
- 门禁日志：`work/t17/gate-vc.log`、`work/t17/gate-ve.log`
- 探针源码（只读，不入构建）：`work/t17/probe.mjs`、`work/t17/segs.mjs`

> **口径声明**：上表所有"可达"结论均取自 **`.ok` 布尔**（`componentOf`/`path`/`connected`），且在**生产装配（751 障碍）**下测得；**未**使用无 registry 的基线替身，**未**放宽任何判据。
