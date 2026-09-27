# 布局内景注册 · 累计交付回执（切片 A → 城门通道级 → 切片 B1）

> 本文件为**累计版**（按时间顺序追加），覆盖 t70 / t72 / t73 三张卡；t72 因预算耗尽未单独落文件，此处补齐（队长要求，§8.3 可查）。

## 1. 版本与范围时间线

| 版本 | 卡片 | 内容 | 覆盖 id |
| --- | --- | --- | --- |
| `1.1.0` | t70 切片 A | 有门封闭建筑内景（宫墙内门殿） | `B-gate-front`、`C-gate-inner`（+ 既有 `B-hall-main`、`C-hall-bed-main` 保留在映射中） |
| `1.1.1` | t72 | 4 座城门**通道级**内景（Q5 裁定 ①，地面取通道面 0.4 而非 `baseY=12.4`） | `F-gate-south`、`F-gate-north`、`F-gate-west`、`F-gate-east` |
| `1.1.2` | t73 切片 B1 | **12 座 hall** 派生门规格 + 内景 + Q4 断言改写 | `B-hall-mid`、`B-hall-rear`、`C-hall-bed-rear`、`D-court1..4-hall`、`E-court1..4-hall`、`F-garden-hall-north` |

| `1.1.3` | t74 切片 B2 | **23 座 sideHall** 派生门规格 + 内景 | `B-side-west/east-south|main|rear`、`C-side-west/east-main|rear`、`C-annex-west/east`、`D-court1..4-house`、`E-court1..4-house`、`E-court3-annex`、`F-garden-hall-west/east` |

## 2. 计数变化（逐条依据）

| 计数 | 基线(1.0.0) | 1.1.0 | 1.1.1 | **1.1.2** | 依据 |
| --- | --- | --- | --- | --- | --- |
| `WALKABLE` | 28 | 30 | 34 | 46 | **69** | +2 门殿 / +4 城门 / +12 殿 / +23 配殿（每栋 1 个 `WK-*-interior`） |
| `VIEWPOINTS` | 20 | 22 | 26 | 38 | **61** | 同上（每栋 1 个 `VP-*-interior`） |
| `FP_ROUTE` | 9 | 11 | 15 | 27 | **50** | 同上（每栋 1 个门内走查点） |
| `visitable` | 2 | 4 | 8 | 20 | **43** | 2 殿 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿（4 角楼按 Q3 排除） |
| `INTERIOR_BY_SLOT` | — | 4 | 8 | 20 | **43** | 与上述 visitable 一一对应（43/43 全覆盖） |
| **冻结值** | 67/60/32/14/10 | 不变 | 不变 | 不变 | **不变** | `SLOTS/WALLS/CONNECTORS/COURTYARDS/TOUR_POINTS`；未新增任何 `CXN-*` |

内景分区计数：1.1.2 为 `B=4 / C=3 / D=4 / E=4 / F=5 = 20`；1.1.3 起断言改为**自洽式**（各 zone 的内景数 = 该 zone 的 visitable 栋数），避免每次切片手改。

## 3. 派生规则（机器可校验，已写入断言）

- `WK-<id>-interior` = `inset(slot.bounds, 0.6)`；**地面 `y`** = `slot.baseY`，**城门例外** = `INTERIOR_PASSAGE_FLOOR`（实测通道面 0.4）；
- `VP-<id>-interior`：位置/目标 xz **均在 WK 内**、`y ∈ [wk.y, wk.y + slot.eaveHeight]`、`fov = 62`；
- FP：置于门洞内侧 1.5m、轴向对齐 `door.center`、`surfaceId` 指向该 WK；门侧由 `doorSideOf()`（`entrance` 与 `bounds` 关系）+ `facing` 双保险判定；
- 门规格（切片 B1，按 t71 规范）：`hasDoor:true`、`door.axis = facing∈{south,north}?'z':'x'`、`door.center={x:slot.x,z:slot.z}`、`door.height=min(3.2, 0.55×eaveHeight)`、`door.sillY=slot.baseY`、`doorWidth` 按 grade（≥3→9.0 / 2→6.0 / 1→4.2）；
- **障碍 `blocks` 由 `hasDoor` 自动派生**（`OBSTACLES = SLOTS.map(... blocks: s.hasDoor ? 'exceptDoor' : 'all')`）⇒ 补 `hasDoor` 即同时完成"障碍改 `exceptDoor`"，无需逐条改障碍。

## 3b. t74 补充（切片 B2）

- **走查点 y 口径修正**：派生走查点的 y 改为 **`floorYAt(该点) + 1.65`**（原先用 `baseY + 1.65`）。原因：sideHall 常与主殿台基/月台在 xz 上重叠，`floorYAt` 取重叠面中 **y 最高**者，若 FP 用建筑自身地坪就会与既有断言「视线高 = 面高 + 1.65m」不一致（实测 C 区 6 栋报红）。改为按点取地面后，**既有断言全绿**且语义更正确（人站在该点的实际地面上）。
- **Q4 覆盖变化（正常）**：23 栋 sideHall 转为 visitable 后，“整体阻挡”覆盖由 27 → **4 栋（= 4 座角楼）**，门洞类独立断言仍 20 栋 ⇒ 合计 24 = **全部非 visitable**，覆盖无缺口。

## 4. Q4 断言改写（t73 一次性完成，t74 不再改）

- 原 `:417`「不可进入建筑整体阻挡」= `!visitable && !['gateHall','courtyardGate'] ⇒ blocks:'all'`；
- 改写为「**非 visitable 且非门洞类（pavilion/courtyardGate）⇒ `blocks:'all'`**」+ 新增「**门洞类 20 座**（pavilion 10 + courtyardGate 10）均有合法障碍条目」独立断言；
- **覆盖对照（测试输出实测）**：改写前 `:417` 覆盖 `{pavilion 10}`；改写后「整体阻挡」覆盖 **27 栋**（sideHall 23 + 角楼 4）+ 门洞类独立断言覆盖 **20 栋** = **47 栋 = 全部非 visitable** ⇒ **覆盖未缩小，反而扩大**。

## 5. 两处已知范围收窄（显式登记）

1. **墙顶门房**（城门 `baseY=12.4` 那一层）**不做内景**：同一 xz 上下两层需 **y 感知可行走面模型**（= Q5 选项 ②，属 layout API 变更，已裁定不做）；城门内景取通道面 0.4（与 legacy `WP-fp-02` 同值）。
2. **23 座 sideHall 与 4 座角楼未纳入**：sideHall 由 t74 承接；角楼按 Q3 排除（`doorWidth=0`、`entrance` 与塔体中心重合，为角楼造"塔门"需新几何与梯道/盘道，属另开设计）。

## 6. 交接缺口（不得误读）

本文件所述全部为**数据侧**（门规格、通行语义、可行走面、机位、走查点）。**几何上是否真的开了门洞**由 **t69**（kit 正面门洞能力）+ **三区**（在各自建筑上落开门洞）+ **t66** 端到端复核负责。**不得宣称“47 栋已可进入”**。

## 7. verify 记录（原样）

```
t70（LAYOUT 1.1.0）：node tests/layout.test.mjs → 通过 1501 项，失败 0 项 · 全部通过 ✓
t72（LAYOUT 1.1.1）：node tests/layout.test.mjs → 通过 1525 项，失败 0 项 · 全部通过 ✓
t73（LAYOUT 1.1.2）：node tests/layout.test.mjs → 通过 1598 项，失败 0 项 · 全部通过 ✓
t74（LAYOUT 1.1.3）：node tests/layout.test.mjs → 通过 1736 项，失败 0 项 · 全部通过 ✓（可行走面 69 / 视角 61 / 走查点 50）
```

## 4. t75（LAYOUT 1.1.4）：门洞通道可行走面 —— 使 43 处内景与室外连通（Q6 裁定 a）

### 4.1 交付
- 每栋内景新增 **`WK-<id>-door-passage`**（`kind:'passage'`，**不复用 `'interior'`**）：沿 `door.axis` 铺设、宽 = `doorWidth`、轴向跨 **[外墙面向外 6.0m, 向内 0.6m]**（既有两栋向内 6.6m，因其 WK 内缩更大）、`y` = 该栋内景地面（`door.sillY`；4 座城门取已登记的通道面 0.4；两栋既有内景取其设计值 4.5/2.4）。**全部由 `door.*/facing/bounds` 派生，无手写逐栋坐标**。
- 计数：`WALKABLE 69 → 112`（+43）；`VIEWPOINTS 61`、`FP_ROUTE 50` **不变**；冻结值 `CONNECTORS 32 / WALLS 60 / SLOTS 67 / COURTYARDS 14 / TOUR_POINTS 10` 不动；**未新增 CXN**。

### 4.2 连通性机器断言（`tests/layout.test.mjs`，BFS/并查集）
- **A（卡片口径：矩形重叠或相接，不含高度条件）**：43 处内景**全部**与室外地面（起点 `WK-F-bridge-south`）同属一个连通分量 ✓。
- **B（通道面必要性 = 突变证明）**：加通道面后 **43/43** 内景都有同层（`|Δy| ≤ 0.8m`）可达邻居；**去掉通道面后 6 处**内景（`WK-B-side-*-south/rear-interior`…）在同层**再无室外邻居** ✓ —— 即“改动前不连通”被实测复现（另：在**全局台阶容差模型**下改动前不连通为 **10 处**，加通道面后仍为 10，原因见 §4.4）。
- 每条通道面**同时**接其室内面（经 `INTERIOR_BY_SLOT` 映射查找，含两栋既有内景的非同名 id）与至少一个室外可行走面 ✓。

### 4.3 内景相机夹取未被破坏
`kind:'interior'` 过滤下仍为 **43** 条、包围盒序列哈希 **`0x92719398`**（与改动前逐值一致）⇒ 新增 `passage` 面**不污染**内景包围盒推导。

### 4.4 实测发现（如实登记，非失败项）
全局**台阶容差模型**下，B/C 区 10 处台基内景在加通道面前后都不连通：其所在台基与下层地面落差 ≈4m，真实通行靠 **`CXN-*-danbi` 台阶/丹陛（connector，非可行走面）**；本模型不含 connector，故该 10 处在“仅可行走面 + 一步台阶容差”的模型下本就不可达。结论：**不是本卡缺陷**，但**提示 core 的碰撞图需把 connector 台阶纳入连通判定**（`interaction` E8/E11 的“生产口径”已包含墙/障碍盒，应同步纳入台阶）。

### 4.5 硬编码红项修法清单（交回主派单，本卡未代改）
| 文件 | 断言 | 扩容前期望 | **新期望值** | 依据 |
| --- | --- | --- | --- | --- |
| `tests/core-interior.test.mjs` | 内景体积条数 | 2 | **43** | `WALKABLE.filter(kind==='interior').length` |
| `tests/core.test.mjs` | B/C 各 1 个 interior 机位 | 2 | **43** | `VIEWPOINTS.filter(mode==='interior').length` |
| `tests/core.test.mjs` | 灰盒数量（可走面 / 视角） | 28 / 20 | **112 / 61** | `LAYOUT_STATS`（更新后） |
| `tests/verify-experience.test.mjs` | 6.1 机位普查 | 20（interior 2） | **61（zone 7 / fp-spawn 5 / interior 43 / focus-extra 6）** | `VIEWPOINTS` 分组计数 |
| `tests/zone-{east,forecourt,garden,inner,west}.test.mjs`（5 个） | 机位/可行走面普查 | 20 / 28 类 | **61 / 112** | 同上（建议改为从 layout 派生） |
| `tests/core-collision.test.mjs` | ①「应有 ≥40 条 y0 下钳」 | ≥40 | 按**非 visitable 且非门洞类**建筑集重算（当前 4 角楼 + 20 门洞类语义）| 35 栋补 `hasDoor` ⇒ `blocks:'exceptDoor'` |
| `tests/core-collision.test.mjs` | ②「≥2 例“原始盒放行”」③「`OB-F-garden-hall-north` 应阻挡」 | 密封样本 | 只对**非 visitable**建筑断言密封；门洞类断言“门洞可通” | 同上 |

## 5. t83（LAYOUT 1.1.5）：内景 y 基准修正 = 区域地坪 + slot.baseY

### 5.1 缺陷与修法
- **缺陷（t62 实测发现）**：派生内景的地面/机位/走查点**漏加区域地坪** ⇒ `Δ = WK.y − (ZONES[zone].groundY + baseY)` 为 C **−0.9**、D **−0.4**、E **−0.4**；后果是机位低于「面高 + 1.65m」语义、区域若照注册值布陈设会把家具埋进台明。
- **修法**：构建器与 `INTERIOR_BY_SLOT.groundY` 统一改为 **`ZONE_GROUND_Y[zone] + slot.baseY`**（`ZONE_GROUND_Y = {B:0, C:0.9, D:0.4, E:0.4, F:0}`，由 layout.test 与 `LAYOUT.ZONES[].groundY` **逐值交叉断言**）；VP/FP 随地面同步上移。

### 5.2 逐栋“修正前 → 修正后”对照（受影响 25 栋：C 8 / D 8 / E 9）
| 区 | 栋数 | 修正量 | 例（前 → 后） |
| --- | --- | --- | --- |
| C（地坪 0.9） | 8 | **+0.9** | `C-hall-bed-rear 1.2 → 2.1`、`C-side-west-main 0.8 → 1.7`、`C-annex-west 0.5 → 1.4` |
| D（地坪 0.4） | 8 | **+0.4** | `D-court1-hall 0.9 → 1.3`、`D-court1-house 0.5 → 0.9` |
| E（地坪 0.4） | 9 | **+0.4** | `E-court1-hall 1.0 → 1.4`、`E-court3-house 0.5 → 0.9` |
| B（地坪 0）10 栋 / F 花园 3 殿（地坪 0） | 13 | **0（不变）** | 与既有值逐值相同 |

### 5.3 显式例外表（`INTERIOR_PASSAGE_FLOOR`，5 条）
- **F 四城门**（`F-gate-*`，4 条）：保持 t72 的**通道口径 0.4**（不取 `baseY=12.4` 的墙顶门房）；
- **`C-gate-inner`（内廷门，1 条，t83 追加）**：**实测证据** —— 既有手工走查点 `WP-fp-07`（内廷门，`y=2.55=0.9+1.65`）与 `floorYAt(0,95)=0.9` 表明该建筑 `baseY=0.9` **已是绝对标高**；若按“区域地坪 0.9 + baseY 0.9 = 1.8”处理会与既有走查契约冲突 ⇒ 内景保持 **0.9**。
- 断言：**例外集合恰好 = 该常量表的键**（不允许宽泛豁免掩盖漏加地坪）。

### 5.4 断言（`tests/layout.test.mjs`，只增不减）
`区域地坪表与 LAYOUT.ZONES 逐值一致` · `43 处内景 WK.y = 区域地坪 + baseY（±0.01，城门/内廷门为显式例外）` · `INTERIOR_BY_SLOT.groundY 同步` · `例外集合恰等于表键` · `内景机位 y = 面高 + 1.65m 逐栋成立` · `C/D/E 受影响 25 栋全部抬到区域地坪`。既有 t73/t75 断言随新基准**更新**（非删除）；内景包围盒哈希随 y 修正更新为 `f2b4884e`。

## 6. t85（LAYOUT 1.1.6）：连通性模型定位 + 台阶容差回退 0.8 + 配额 pin 同步 + wart 登记

### 6.1 模型定位：**surfaces-only 启发式**（可 grep）
在 `tests/layout.test.mjs` 的连通性断言块与输出中写明（grep 关键词：`surfaces-only` / `不构成可达性结论` / `生产口径`）：
> **surfaces-only 诊断模型（不含 connector 丹陛/台阶）** ⇒ 其数字**只是诊断，不构成可达性结论**；可达性的约束口径是**生产口径（含 connector）**，由 **t77** 复验负责。

### 6.2 台阶容差：**由 1.0 回退到 0.8**（t83 的 1.0 无物理依据）
**相邻可行走面高差直方图（实测，194 对 xz 重叠面）：**

| 高差区间 | 对数 | 说明 |
| --- | --- | --- |
| 0 ~ 0.05m | 48 | 同面/铺装接缝 |
| 0.05 ~ 0.5m | 81 | **真实可跨**（走查求解器台阶阈值 0.5m，t13 实测） |
| 0.5 ~ 0.8m | 11 | 模型容差内（诊断口径） |
| **0.8 ~ 1.0m** | **27** | **不可跨**（>0.5m 阈值）⇒ 靠丹陛/台阶 connector |
| 1.0 ~ 2.0m | 22 | 同上 |
| ≥ 2.0m | 5 | 台基/月台层级差（例：`WK-B-terrace-tier1↔WK-B-terrace-tier3 Δ3.00`） |

**结论**：0.8 → 1.0 **没有物理依据**（0.9m 高差不是“能走过去的台阶”，其真实服务由 connector 提供，而本模型按设计不含 connector）⇒ **按裁定回退 `DY = 0.8`**，并接受弱模型下的诊断结果：
- `Δy ≤ 0.8` 时：**42/43** 内景有同层可达邻居（另 1 处需 connector 台阶）；**去掉通道面后 15 处**内景同层不可达（突变证明期望按实测同步为 **15**，此前 t83 的 3 系在 1.0 容差下得出）。
- `Δy ≤ 0.5`（与求解器阈值一致）时为 38/43 —— 作为诊断参考一并记录，**不作为判据**。
- **明确禁止**“以让红项/期望变少为由保留 1.0”。

### 6.3 同步 t84 的分区配额 pin（本卡持有 `tests/layout.test.mjs`）
| 行 | 旧值 | **新值** | 依据 |
| --- | --- | --- | --- |
| `tests/layout.test.mjs:202` | `reserve` 70 | **28** | §8.2 重分配：Σ perZone 322 + 28 = 350 |
| `tests/layout.test.mjs:201` | `{B:70,C:50,D:40,E:40,F:80}` | **`{B:70,C:60,D:56,E:56,F:80}`** | t84 回执 §1 与 CONTRACTS §8.2.1（需求变更：43 栋内景） |
| `tests/layout.test.mjs:71` | `CONFIG 版本 = 1.0.6` | **1.0.7** | t84 递增 CONFIG（§8.2 配额重分配） |
断言**未删除**；204–206 行的“分区合计 + 保留 = 350”断言在新值下仍成立（322 + 28 = 350）。

### 6.4 已知 wart（登记不修）+ 例外表逐条理由
- **`C-gate-inner.baseY` 存的是绝对标高**（其余 66 个槽位为**相对本区地坪的偏移**）——同一名词、两种基准。
  证据：`WP-fp-07`（内廷门）`y=2.55 = 0.9 + 1.65` 与 `floorYAt(0,95)=0.9`。
  **不修理由**：修它需同时改 `WP-fp-07` 与该处 `floorYAt` 解析（既有走查语义/公共 API 变更）；正确修法是给槽位新增显式 `baseYMode: 'absolute'|'relative'`（布局 schema 变更 + 全量回归），收益不抵风险 ⇒ 以例外表 + wart 登记收口，待专门卡处理。
- **例外表逐条理由**（`src/shared/layout.js:INTERIOR_PASSAGE_FLOOR`，5 条，代码注释内逐条写明）：
  | 例外 | 值 | 理由 |
  | --- | --- | --- |
  | `F-gate-south/north/west/east` | 0.4 | 城楼跨压宫墙，`baseY=12.4` 是墙顶门房；行人走墙下**门洞通道**（实测四门 `floorYAt(door.center)=0.4`）⇒ t72 Q5 裁定 ① |
  | `C-gate-inner` | 0.9 | 见上 wart：`baseY` 已是绝对标高（证据 `WP-fp-07`/`floorYAt`），按区域地坪叠加会破坏既有走查断言 |

### 6.5 冻结与 verify
`连接 32 / 墙 60 / 可行走面 112 / 障碍 81` · `视角 61 / 导览 10 / 走查 50` 未动；未新增 CXN；`LAYOUT_VERSION → 1.1.6`；断言**只增不减**。
```
$ node tests/layout.test.mjs            → 全部通过 ✓（0 失败；摘要 config 1.0.7）
$ grep -n "surfaces-only\|不构成可达性\|生产口径" tests/layout.test.mjs
  → 命中注释块、A/B 断言标题与控制台定位声明（可 grep）
```

## 7. t97（LAYOUT 1.1.8）：F10 真正修点 —— `S()` 内补区域地坪（24 栋 C/D/E 基准统一）

### 7.1 修点（file:line）
- **`src/shared/layout.js` 的 `S()`**：`ZONE_GROUND_Y` / `zoneGroundY` **上提到 `S()` 之前**；`door` 派生式由
  `sillY: +baseY`（本地台基）→ **`sillY: +(zoneGroundY(zone) + baseY)`**（门外门槛面标高）。
- **通道面**：`WK-<slot>-door-passage` 的 `groundY` 同步改为 `INTERIOR_PASSAGE_FLOOR ?? INTERIOR_LEGACY_FLOOR ?? (zoneGroundY(zone) + baseY)`（与内景地面同源）。
- **重要事实（t89 结论，本卡再次确认）**：`S()` **完全忽略 `opts.door` 字面量** —— `door`/`doorWidth` 全部在 `S()` 内部派生。因此早期“改 24 处 `door.sillY:` 字面量”注定无效（t89 已干净还原），修点只能在 `S()` 内。

### 7.2 24 栋清单（修前 `sillY/passage.y` 低 0.9/0.4/0.4）
`C-annex-west/east`、`C-hall-bed-rear`、`C-side-west/east-main`、`C-side-west/east-rear`、
`D-court1..4-hall`、`D-court1..4-house`、`E-court1..4-hall`、`E-court1..4-house`、`E-court3-annex`
（C +0.9；D/E +0.4）。修后逐栋 `sillY === 区域地坪 + 本地台基 === WK.y`。

### 7.3 pin 更新前后（同义替换，未删断言）
| 断言 | 修前期望 | **修后期望（实测）** |
| --- | --- | --- |
| `WK-*-door-passage.y` 未补区域地坪的栋数 | 24（已知缺陷 pin） | **0** |
| `door.sillY` 未补区域地坪的栋数（非例外） | 24 | **0** |
| surfaces-only 诊断「内景有同层邻居」 | 42/43 | **43/43** |
| `sillY` 偏离集合 | 29 = 24 ∪ 5 | **5**（F 四城门双标高 + `C-gate-inner` 绝对标高；`C-hall-bed-main` 已随 `S()` 修复归位） |

### 7.4 例外表（`DOOR_SILL_EXCEPTIONS`，6 条，逐条理由）
| 例外 | 值 | 理由 |
| --- | --- | --- |
| `F-gate-south/north/west/east`（4） | 城楼门 `sillY=12.4` / 通道地面 0.4 | **双标高**（行人走墙下门洞通道；内景取通道面，t72 Q5 裁定 ①） |
| `C-hall-bed-main` | `sillY` 与内景地面**已归位一致**（=0.9+1.5=2.4） | 该栋一致，保留在表中作历史登记（原 wart 由本卡修复） |
| `C-gate-inner` | `sillY=1.8` vs 内景 0.9 | 该槽位 `baseY=0.9` 是**绝对标高**（其余为相对偏移）⇒ 绝对标高 wart |

### 7.5 与 t98 的接口（下一页/下一卡）
10 栋不可达内景（`B-side-{west,east}-{south,main,rear}` 6 + `B-hall-mid`、`B-hall-rear` + `E-court{1,2}-hall`）的**可行走过渡**由 t98 承接；本卡已把门内外基准统一（`sillY = 区域地坪 + 本地台基`），t98 可在**正确基准**上登记过渡，不会返工。

## 8. t102（LAYOUT 1.1.9）：按 t100 权威 Δ 清单登记门外过渡台阶

### 8.1 依据（**Δ 全部取自 t100，未自定判据**）
`docs/report-completeness.md` **§15.2 表 A**（生产口径、`LAYOUT 1.1.8` 时点、求解器 BFS）：**18 栋高差型**（16 栋 `Δ>+0.5` 向上 + 2 栋 `Δ=−1.5` 向下）。**25 栋已可达者与 3 栋“Δ 超阈但已可达”未登记任何几何**。

### 8.2 登记规则（代码：`buildInteriorSliceA()` 内 `T100_DELTA` 循环）
- `n = ceil(|Δ|/0.5)` 级台阶（相邻面 ≤ 0.5m = 求解器 `maxStepHeight`）；
- 每级长 `run/n`，`run = max(|Δ|/0.62, n×0.6)`（跑长 ≥ |Δ|/0.62）；
- `y` 线性插值：第 1 级 = 通道面地面 − `Δ/n`，第 n 级 = **门外地面**（与 t100 表 A 的门外点对齐）；
- 几何：沿门轴、宽 = `doorWidth`（**不越出门洞净宽与门轴范围**）、自**通道面进深轴外端**（外墙面向外 6.0m）起逐级向外；
- `kind: 'transition'`（不污染 `interior` 相机包围盒）。

### 8.3 逐栋结果（18 栋 / 43 级）
| 栋 | Δ | 级数 | 台阶 y 序列（自通道面向外） |
| --- | --- | --- | --- |
| `B-hall-mid` | +2 | 4 | 1.5 → 1 → 0.5 → 0 |
| `B-hall-rear` | +1.8 | 4 | 1.35 → 0.9 → 0.45 → 0 |
| `B-side-east-rear` / `west-rear` | +1 | 2 | 0.5 → 0 |
| `B-side-east-south` / `west-south` | +0.9 | 2 | 0.45 → 0 |
| `C-hall-bed-rear` | +1.2 | 3 | 0.9 → 0.4 · …（收敛到 0.9=C 区地坪） |
| `C-side-east/west-rear` | +0.6 | 2 | 0.3 → 0 |
| `D-court1..4-hall` | +0.9 | 2 | 0.45 → 0 |
| `E-court1/2-hall` | +1 | 2 | 0.5 → 0 |
| `E-court4-hall` | +0.9 | 2 | 0.45 → 0 |
| **`B-side-west-main` / `east-main`（dual）** | **−1.5** | 3 | **2.0 → 2.5 → 3.0**（向**上**接 `WK-B-terrace-tier2`） |

**dual 2 栋专门说明**：t100 指出其叠加两类特征（门外高 1.5m + 通道面↔室内面相邻性），本卡按**可达外点**为基准：末级落在 `WK-B-terrace-tier2`（y=3.0）⇒ 与 t100 表 A 的门外点一致；**跑长按几何取**（> |Δ|/0.62）。**通道面↔室内面**：复核得两者 x 向相触（内景 `x[-87.4,-72.6]` 与通道面 `x[-72.6,-66]` 在 −72.6 相接），t100 的“不相邻”疑点来自 walk-graph 的 **1m 栅格**切分 0.6m 重叠区 ⇒ **建议 t77 复验时把这两栋单列**（本卡已在回执登记，未改栅格/阈值）。

### 8.4 t100-F3：`door.facade` 已登记（门外锚点）
- **`door.center` = 建筑中心**（**不是门脸点**；实证 `B-side-west-main center=(-80,-116)` vs 东立面 `x=-72`）。
- **`door.facade` = 门外锚点** = 通道面进深轴（短边）外端中心 = 外墙面向外 **6.0m**，含 `{x, z, y, outward, note}`；**任何“贴门取地面/登记过渡”的工具应改用 `facade` 为唯一门外基准**（否则 Δ 会被系统性误判，正是 t100 口径 v1/v2/v3 三次作废的根因）。CONTRACTS §4 文案**待 t103 并入**（本卡未越界改）。

### 8.5 t100-F2 如实登记：**connector 不提供过渡**
求解器自报 **`connectorStats = {declared: 32, ramps: 0}`** ⇒ `CXN-*` 对可达性**零贡献**（t88 的坡道生成条件在真实数据下不触发：32 条 connector 横断面突变 0 条、两端不连通 0 条）。**本卡走 layout 过渡面路线**；**未修改 connector、台阶阈值（0.5）、玩家体积或任何既有阻挡**。

### 8.6 接口与边界
- **本卡只保证登记几何**（级数/口径/接续/宽度/facade 已逐一机器断言）；**不宣称“已可进入”**。
- **可达性**由 **t77 生产口径逐栋复跑**判定（18 栋）；**t88** 负责走查层消费 `CONNECTORS`（当前 `ramps=0`，即不消费）。
- 冻结计数：`CONNECTORS 32 / WALLS 60 / SLOTS 67 / COURTYARDS 14 / TOUR_POINTS 10` **未变、未新增 CXN**；`WALKABLE 112 → 155`（+43 过渡面，**已单列**）。

### 8.7 跨 owner 冻结计数 ripple 清单（`WALKABLE 112 → 155`，+43 级过渡面）

**本卡的改动必然导致**：`WALKABLE` 由 **112 → 155**；下述位置引用了旧值 **112** 或按旧规模断言，**需各自 owner 同步**（**本卡不代改**）：

| file:line（grep 实测） | 旧值 | **新值** | 依据 | 归属 |
| --- | --- | --- | --- | --- |
| `tests/core.test.mjs:942` | `assertEqual(LAYOUT.WALKABLE.length, 112, 'LAYOUT 1.1.4：可行走面 112 条（含 43 条 kind=passage 门洞通道面）')` | **155**（理由串改为 `LAYOUT 1.1.9：155 条（112 + 43 门外过渡台阶，t102）`） | 本卡 +43 过渡面 | **core 侧（本卡不代改）→ 派单** |
| `tests/core.test.mjs:917` | 用例标题 `灰盒满足全部契约字段与数量（… / 112 可走面 / 61 视角 / 49 灯位；LAYOUT 1.1.4）` | 标题 `…/ 155 可走面 / …；LAYOUT 1.1.9` | 同上 | **core 侧 → 派单** |
| `docs/CONTRACTS.md:480` | §5.2.1 对照表 `WALKABLE 条数 … **112**（28 基础 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿 + 43 门洞通道面）` | **155**（+ `43 门外过渡台阶 t102`） | 同上 | **t103** |
| `docs/CONTRACTS.md:589` | §6.4 `当前 **112 面**：ground/terrace/interior 43/…passage 43` | **155 面**（补 `transition 43（kind 用 ground + id 后缀 -transition-N）`） | 同上 | **t103** |
| `docs/CONTRACTS.md:48` | v1.0.12 修订记录里的 `walkable 112` | **保留**（历史条目只追加） | 历史真值 | 无需改 |
| `docs/handoff-layout-interiors.md:69`（§4 老条目） | `WALKABLE 69 → 112` | **保留**（历史累计） | 历史只追加 | 本卡 ✅ |
| `docs/handoff-layout-interiors.md:87`（§4.5 修法清单） | 给 core.test 的旧期望 `28 / 20 → **112 / 61**` | 更新为 **`155 / 61`** | 同上 | 本卡 ✅（“待同步项”备注） |
| `tests/layout.test.mjs`（本卡 inScope，已同步） | 112 | **155** | 已改并带依据注释 | 本卡 ✅ |
| `docs/handoff-layout-interiors.md` §2 计数表（历史累计） | 112（1.1.4 行） | **保留历史值 + 新增 1.1.9 行 = 155** | 历史只追加 | 本卡 ✅ |

**排查命令**（可直接复跑）：`grep -rn "112\|WALKABLE" tests/*.mjs docs/*.md`
**如实登记**：本卡只保证自身 inScope 内一致；**core 侧与 CONTRACTS 侧各有 1 处待同步**（上表前两行），未留任何陈旧数字在 inScope 内。

### 8.8 跨模块 kind 守卫生效留档（t79 教训，值得备案）
本卡首轮用新枚举值 `kind:'transition'` 登记过渡面 ⇒ **`audit --enforce` 立即 exit 1 并列出 5 项**：
```
- colliders.walkable[112] (WK-B-hall-mid-transition-1).kind 非法：transition
  （合法：ground/terrace/interior/bridgeDeck/gardenGround/outerTerrain/passage）
- … [113]/[114]/[115]/[116] 同类（首轮仅打印前 5 项，实为 43 条全部）
```
⇒ **t79 建立的跨模块守卫按设计生效**（布局侧新增 kind 未同步消费方白名单 ⇒ **立刻炸**，而不是静默坏掉/整树 0 区域装载）。
**处置**：改用**既有合法值 `kind:'ground'`**（过渡面以 **id 后缀 `-transition-N`** 标识）⇒ **exit 0**。
**归档结论**：**专属 `transition` kind 本轮不派**（收尾期不新增枚举值）；日后若要专属 kind，**必须同时改 `src/core/context.js` 的 `WALKABLE_KINDS`**（属 core 卡），否则本轮这类拦截会再次触发——这是**期望行为**，不是回归。

### 8.9 t77 复跑要求（已与主理人确认）
`B-side-{west,east}-main`（dual 2 栋）在 t77 生产口径复跑时**单独看**：其“通道面↔室内面相邻性”疑点源于 **walk-graph `cellSize=1` 栅格**把 0.6m 的重叠区切分（内景 `x[-87.4,-72.6]` ↔ 通道面 `x[-72.6,-66]` 在 −72.6 相触）；本卡**未改栅格/阈值**。

## 9. t103（LAYOUT 1.1.10）：10 座开敞亭可通行化 + B 两座入口门槛

### 9.1 修点与逐座前后
- `S()` 的 `hasDoor` 原先**忽略 `opts.hasDoor`**（`PASSABLE_KINDS.includes(kind) || visitable`，与 `door`/`doorWidth` 同一坑）⇒ 已改为 `opts.hasDoor === true || …`；
- 10 座亭的 `S('…-pavilion…')` 加 **`hasDoor: true`** ⇒ `OBSTACLES` 由既有机制 `s.hasDoor ? 'exceptDoor' : 'all'` **自动派生**（**未新增任何手写障碍字面量**）。

| 亭 | 改前 blocks | **改后 blocks** | Δ（亭地面 vs 既有地面） |
| --- | --- | --- | --- |
| `B-pavilion-gate-west` / `east` | all | **exceptDoor** | +0.6 ⇒ **补门槛** |
| `C-pavilion-rear` | all | **exceptDoor** | −0.3 |
| `D-court3-pavilion` / `D-court4-pavilion` | all | **exceptDoor** | +0.1 |
| `E-court3-pavilion` / `E-court4-pavilion` | all | **exceptDoor** | +0.1 |
| `F-garden-pavilion-main` | all | **exceptDoor** | +0.1 |
| `F-garden-pavilion-west` / `east` | all | **exceptDoor** | −0.1 |

### 9.2 B 两座入口门槛（**加法登记**）
- 在 facing 侧外沿另加 1 级门槛面 `WK-B-pavilion-gate-{west,east}-threshold`，y = 区域地坪 + 亭地面/2 = **0.3** ⇒ **广场(0) → 门槛(0.3) → 亭地面(0.6)**，相邻高差各 **0.3 ≤ 0.5**（求解器台阶阈值）。
- **保留既有铺面**（`WK-B-plaza` 等未撤、未改），**未做 connector 独占登记**（按 t88 协调要求）；其余 **8 座不加任何多余几何**（门槛面恰好 2 条，已断言）。

### 9.3 逐座断言（`tests/layout.test.mjs`，只增不减）
① 亭 **10 座**且逐座 `hasDoor === true`、`OBSTACLES[id].blocks === 'exceptDoor'`；② **对照集**：10 座院门保持 `exceptDoor`（不被算作空气墙）；③ **实体构件语义未删**：亭仍 `visitable !== true`、**未登记任何内景**（`INTERIOR_BY_SLOT` 无亭）⇒ 不违反 `§6.4 不可穿越墙柱栏杆` 与 `§8.3 墙柱阻挡均验证`（两判据一律未动）；④ 门槛面恰好 **2 条**且相邻高差 ≤0.5。

### 9.4 冻结计数 ripple（**一次性收口**，当前树实测 `WALKABLE = 157`）
| file:line | 旧值 | **新值** | 依据 | 归属 |
| --- | --- | --- | --- | --- |
| `tests/layout.test.mjs:502` | 155 | **157** | +2 亭门槛（t103） | 本卡 ✅ |
| `docs/CONTRACTS.md` §5.2.1 表 | 112 | **157**（+43 t102 +2 t103） | 同上 | 本卡 ✅（t103 持有该文件） |
| `docs/CONTRACTS.md` §6.4 | 112 面 | **157 面**（补 transition 43 / threshold 2） | 同上 | 本卡 ✅ |
| **`tests/core.test.mjs:942`** | `assertEqual(LAYOUT.WALKABLE.length, 112, …)` | **157** | 同上 | **core 侧 → 派单（本卡不代改）** |
| **`tests/core.test.mjs:917`** | 用例标题 `…112 可走面…LAYOUT 1.1.4` | `…157 可走面…LAYOUT 1.1.10` | 同上 | **core 侧 → 派单** |
| `docs/CONTRACTS.md:48` / `handoff-layout-interiors.md:69` | 历史条目 `112` | **保留**（历史只追加） | — | 无需改 |

**排查命令**：`grep -rn "112\|155\|157\|WALKABLE" tests/*.mjs docs/*.md`（本卡 inScope 内**无陈旧数字**；跨 owner 共 **2 处待同步**，即上表加粗两行）。

### 9.5 跨卡接口（本卡不改别人的测试与提示）
`tests/interaction.test.mjs` 的 air-wall 断言（E13）与「开敞构筑物」提示**归 t88**。本卡落地后 **`airWalls` 期望值 = 0**（10 座亭全部 `exceptDoor` ⇒ 不再构成“视觉开放却整足迹阻挡”）；10 座院门本就 `exceptDoor` ⇒ 对照集不受影响。**若 t88 尚未把 E13 改为可表达 0，E13 会立刻报红（`assert(airWalls.length > 0)`）—— 如实登记，不由本卡改动该文件**；最小闭合步骤 = t88 把该断言改为 `airWalls.length === 0` 并同步提示分支。

### 9.6 契约
`CONTRACTS v1.0.14 → **v1.0.15**`（历史只追加）：新增 **§4.1.1**（`door.center` = 建筑中心 / **`door.facade`** = 门外锚点，`y` 与 `sillY` 同源；贴门取地面一律用 `facade`——并入 t102 交付的 t100-F3 文案）；§5.2.1 与 §6.4 的 `WALKABLE` 112 → 157；登记“10 座开敞亭可通行化（`hasDoor:true` ⇒ `exceptDoor`，与院门同类）”。
