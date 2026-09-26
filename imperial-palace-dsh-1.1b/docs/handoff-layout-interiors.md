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
