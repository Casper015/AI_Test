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

## 10. t117（LAYOUT 1.1.11）：两座水中亭门洞“声明 vs 实际”一致性修复（t77-F5）

### 10.1 量化偏差（逐座，实测）
| 亭 | 亭 bounds | 登记门宽 | **实际净宽** | 门洞带内的阻挡者 | 水体（具名障碍）bounds |
| --- | --- | --- | --- | --- | --- |
| `D-court3-pavilion` | （见下表实测输出） | **8m** | **0.0m** | `WB-D-pond:all` | `x[-188,-124] z[16,68]` |
| `E-court3-pavilion` | 同上 | **8m** | **0.0m** | `WB-E-pond:all` | `x[124,188] z[16,68]` |
| `D-court4-pavilion` / `E-court4-pavilion`（对照） | — | 8m | ✓ 可通行 | 仅自身 `exceptDoor` | 门洞带内**无**水体 |

**几何依据**：两座亭位于**水池足迹内部**，`WB-*-pond`（`blocks:'all'`、整足迹阻挡）**占据门洞带**；门外 0.5–8m 的候选点全部落在那片水体里 ⇒ 净宽 0（t77 attempt 2 的 blocker `t77-F5`、t112 的具名判定一致）。

### 10.2 处置：选 **(a) 保留几何门洞 + 显式具名登记阻挡来源**（未放宽任何断言）
- `S()` 的门规范新增两个字段（**声明与实际对齐**）：
  `door.passable`（布尔）· `door.blockedBy`（具名障碍 id，默认 `null`）；
- 两座水中亭登记 `doorBlockedBy: 'WB-{D,E}-pond'` ⇒ `passable:false` + `blockedBy:'WB-D-pond'`/`'WB-E-pond'`；
- **几何门洞未删**（`door.width` 仍 8m，供取景/贴门工具使用）；**未回退 t103**：两座仍 `hasDoor:true` ⇒ `OBSTACLES.blocks='exceptDoor'`（**不是**静默 `blocks:'all'` 空气墙），且**具名原因仍可见**（水体 id）——满足 t112 的“未走进必须有具名原因”原则。
- **理由（为何不选 (b) 只改声明而不登记来源）**：只改声明会丢掉“**被什么挡住**”这一信息，下游/提示只能再猜一次；(a) 让“不可通行”与“因何不可通行”同时进入数据。

### 10.3 断言（`tests/layout.test.mjs`，只增不减）
`10 座亭恰 2 座声明不可通行` · `具名例外 id = D-court3-pavilion,E-court3-pavilion` · `blockedBy 指向真实存在的整足迹障碍（水体）` · `具名例外仍 hasDoor + exceptDoor（非空气墙）` · `其余 8 座 passable 且 blockedBy 为空` · `10 座 door.width 均 >0（几何门洞未删）`。
实测输出：`t117 门洞一致性：10 座亭 = 8 可通行 + 2 具名例外（WB-D-pond / WB-E-pond）`。

### 10.4 交回：`verify-experience` B4 的**精确期望改法**（归 verifier，本卡不改）
**file:line = `tests/verify-experience.test.mjs:232-236`**（现文）：
```
232  await test('B4 18 个门洞净宽全部 ≥ max(1.1m, 登记宽×0.5)', async () => {
233    const bad = walk.doors.filter((d) => d.clear < Math.max(1.1, (d.declared ?? 0) * 0.5));
234    assert(bad.length === 0, `偏窄：${bad.map((d) => `${d.id} ${d.clear}/${d.declared}`).join(',')}`);
235    return `18/18 合格，最小净宽 ${walk.summary.doorsMinClear}m（含 4 城门 14–18m、10 院门 11.3m、2 主殿 25.3m）`;
```
**旧期望 = “18/18 全部合格”**（隐含 10 座亭全部可通行）⇒ **新期望 = “16/18 合格 + 2 座具名例外（水中亭）”**，精确改法：
```
232  await test('B4 门洞净宽：16/18 ≥ max(1.1m, 登记宽×0.5) + 2 座具名例外（水中亭，门外被 WB-*-pond 占据）', async () => {
233    const EX = { 'D-court3-pavilion': 'WB-D-pond', 'E-court3-pavilion': 'WB-E-pond' };
233b    const ex = walk.doors.filter((d) => d.id in EX);
233c    const bad = walk.doors.filter((d) => !(d.id in EX) && d.clear < Math.max(1.1, (d.declared ?? 0) * 0.5));
234    assert(ex.length === 2 && ex.every((d) => d.clear === 0), `具名例外应恰 2 座且净宽 0：${ex.map((d) => `${d.id} ${d.clear}`).join(',')}`);
234b    assert(walk.doors.length - ex.length === 16, `可通行门洞应为 16：${walk.doors.length - ex.length}`);
234c    assert(bad.length === 0, `偏窄：${bad.map((d) => `${d.id} ${d.clear}/${d.declared}`).join(',')}`);
235    return `16/18 合格 + 2 座具名例外（WB-D-pond / WB-E-pond）；最小净宽 ${walk.summary.doorsMinClear}m`;
```
**约束**：**不得**保留“18/18”或“10/10 可通行”，**不得**改成 `includes`/`some` 之类的“包含式”弱断言（必须**恰好 2 座例外 + 恰好 16 座合格**）。

### 10.5 冻结 / 预算 / 跨 owner pin
- `WALKABLE = 157`（**未变**）；`OBSTACLES` 语义**未变**（两座仍 `exceptDoor`）；`SLOTS 67 / COURTYARDS 14 / TOUR_POINTS 10 / CONNECTORS 32 / WALLS 60` **未变**；`LAYOUT_VERSION 1.1.10 → **1.1.11**`。
- **跨 owner pin（本卡不代改，交回派单）**：
  1. `tests/verify-experience.test.mjs:232-236` **B4**（见 §10.4，归 verifier）；
  2. `docs/CONTRACTS.md`（归 t103 持有者）：建议在 §4 或 §6.1 登记新字段 **`door.passable` / `door.blockedBy`** 的语义（“门洞可通行性声明必须与实际一致；被具名障碍阻断时记 `blockedBy`”），**历史只追加**；
  3. 若下游（`src/interaction`/`src/ui`）需要消费 `blockedBy` 生成提示，属其 owner 的后续卡（本卡已在数据侧就位，未改其代码）。
- `node scripts/audit.mjs --enforce` → **exit 0**（§10.6）。

### 10.6 verify（原样，两条）
```
$ node tests/layout.test.mjs
全部通过 ✓（0 失败）
 - t117 门洞一致性：10 座亭 = 8 可通行 + 2 具名例外（WB-D-pond / WB-E-pond）
 - 连接 32，道路 95 段，墙 60 段，可行走面 157，障碍 81 · 视角 61，导览点 10，走查点 50
$ node scripts/audit.mjs --enforce
exit 0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```

## 11. t121（LAYOUT 1.1.13）：门外分级过渡的**真根因**与修复（cellSize:1 网格可见性）

### 11.1 结论性归因（实测证伪了"datum 错"的假设，指向**第三层**）
逐栋探针（`B-hall-mid` / `B-hall-rear` / `C-hall-bed-rear` / `D-court1-hall` / `B-side-west-main`）：
- **t102 的台阶位置正确**：自**通道面外端**起（`B-hall-mid` 通道面 `z[-40,-33.4]` → 台阶 `z[-40.8,-40]` 起）；**y 序列正确**（`1.5→1→0.5→0`，逐级 0.5；负 Δ 栋 `2→2.5→3`）；
- **"门外 1.5m 处"确实被覆盖**：外 0.5m→`transition-1@1.5`、1.5m→`transition-2@1`、2.5m→`transition-4@0`（其余栋同型）；
- ⇒ **既不是位置错、也不是 y 序列错、更不是未覆盖**。
- **真因（实测坐实）**：每级台阶足印**进深仅 0.8–1.6m**，而 `cellSize:1` 的走查网格**只认格心** ⇒ **43 条里有 31 条不含任何格心**（例 `WK-B-hall-mid-transition-1` `z[-40.81,-40.00]` ⇒ **0 格心**）。**坡道"存在但对图不可见"**，所以 t116 仍量到"通道面相对门外 1.5m 处 = +0.6~+1.35"（图上从通道面直接跳到室外地面）。

### 11.2 修复（**加法**，未撤改任何既有几何、未动判据/格距）
`src/shared/layout.js` 过渡构建器两处：
1. **每级足印进深 ≥ `CELL_FLOOR_DEPTH = 1.05m`**：`stepLen = Math.max(run / n, 1.05)`（总跑长只会更长 ⇒ 坡更缓，不改变"逐级 ≤0.5"语义）；
2. **外沿吸附到整数格界**（向外 `ceil/floor`）⇒ 每条台阶带**必含 ≥1 个格心**；内沿仍贴通道面外端（保持接续）。
- `LAYOUT_VERSION 1.1.12 → **1.1.13**`；`WALKABLE` 仍 **157**（**面数不变**，只是既有台阶带变宽）；**未新增 connector/面** ⇒ 冻结计数 `CONNECTORS 32 / WALLS 60 / SLOTS 67 / COURTYARDS 14 / TOUR_POINTS 10` 全部不变。

### 11.3 修复前后（我自己的引擎，口径固定）
| 指标（`cellSize:1`，`up ≤0.5 / down ≤0.6`） | 修前 | **修后** |
| --- | --- | --- |
| 过渡台阶中含 **0 格心**的条数 | **31 / 43** | **0 / 43** |
| 样例 `WK-B-hall-mid-transition-1` 格心数 | 0（`z[-40.81,-40.00]`） | **52**（`z[-42,-40]`） |
| 最小台阶进深 | 0.81m | **≥1.05m** |
| 内景可达（本引擎，室外地面起步 BFS） | 41 / 43 | **41 / 43**（**未变**） |

**如实说明**：本引擎的"可达数"未变 —— 因为它**只做 xz 相邻 + 阈值跨面**，不建模生产求解器的其它规则；本次修复消除的是**"坡道对网格不可见"这一前置阻塞**。**最终可达性判定归 t77 用生产引擎复跑**（本卡**不宣称"43 栋均可进入"**）。本引擎下仍不可达的 2 栋为 `C-side-west-main-interior` / `C-side-east-main-interior`（**不在 §11.2 的 18 栋内**；t100 曾记其"Δ 超阈但经其它路线可达"）⇒ 作为**残余**登记，交 t77 复跑判定。

### 11.4 逐栋断言（18 栋 / 43 级，不抽样）
`过渡台阶恰 43 级` · `每条台阶带 ≥1 个格心`（**这条就是本次修复的守卫**）· `每级进深 ≥1.0m` · `覆盖恰 18 栋`（§11.2 全表）。

### 11.5 联动与边界
- `tests/zone-forecourt.test.mjs:687`（从地坪可走入门内 ≥4，实测 3）：**本卡未改该断言**；其回绿取决于**生产引擎**（生产求解器）；若仍红，量化交回（见 §11.3 的 41/43 与本引擎口径说明）。
- **未放宽任何判据**：`maxStepHeight 0.5` / `snapDownDistance 0.6` / 玩家体积 / 包络 / **`cellSize`** 逐值未动。
- `node tests/layout.test.mjs` → **全部通过 ✓**；`node scripts/audit.mjs --enforce` → **exit 0**。

## 12. t126 + t128：遮蔽普查结论与两次**有界开槽**（授权的减法例外）

### 12.1 普查（只读、封闭）
全城“可行走面被更高可行走面**完全内含**（平面投影）”**共 6 条**，**全部影响可达性**：
| 类别 | 条数 | 明细 | 处理 |
| --- | --- | --- | --- |
| 过渡台阶（B 两栋） | 4 | `WK-B-side-{west,east}-main-transition-1@2.0 / -2@2.5` ⊂ `WK-B-terrace-tier2@3.0` | **t126 开槽** ⇒ 4 → 0 |
| 门洞通道面（C 两栋） | 2 | `WK-C-side-{west,east}-main-door-passage@1.7` ⊂ `WK-C-bed-terrace@2.4` | **t128 开槽 + 加法台阶** ⇒ 2 → 0 |
| 其它 | 0 | — | — |

⇒ **影响栋数 = 4**（B 2 + C 2），**该类别封闭**（不再有未知条目）；修完 6 条即完整解 ⇒ **t128 后全城遮蔽 = 0**（已升为常驻守卫）。

### 12.2 两次开槽（**主理人明确授权的减法例外**）
- `WK-B-terrace-tier2`（x[-72,72] z[-158,-74]）→ **5 段**（南/北/西/中/东），开出西 `x[-66,-62]`、东 `x[62,66]` × `z[-129,-103]` 两条走廊；
- `WK-C-bed-terrace`（x[-72,72] z[137,199]）→ **5 段**，开出西 `x[-61.5,-47.9]`、东 `x[47.9,61.5]` × `z[155,181]`；
- **授权理由（写入代码注释 + 本节）**：“**加法在此已被证明必然无效**（新增台阶会被更高面同样内含）” ⇒ 仅为**这两处走廊**的有据例外，**不得扩大为通用做法**；
- **有界性**：面积守恒断言（分段面积 + 移除带 = 原始矩形面积）、移除带 ≤ 总宽 20%、其余区域**未降低/未拆除**。

### 12.3 C 两栋的链（t128，逐栋断言）
`通道面 1.7 → 台阶 1.3 → 台阶 0.9`（每级 0.4 ≤ 0.5，xz 相接）；台阶自**门面**（west x=−50 朝东 / east x=+50 朝西）向外，进深 ≥1.05m 且外沿吸附整数格界（t121 口径：`cellSize:1` 必含格心）。

### 12.4 遮蔽常驻守卫（t128 采纳）
`tests/layout.test.mjs` 新增：任何可行走面被更高面完全内含 ⇒ **红并打印全部命中**（id@y ⊂ id@y）；**期望全城 0 条**（当前实测 **0**）。

### 12.5 F5 实测化（t128 落地，t127 提供出口）
`probeDoorClearance(slotId)` 逐座核对 10 亭：`passable:false ⇒ 净宽 === 0`；`passable:true ⇒ 净宽 ≥ max(1.1, door.width×0.5)`；**声明与实测不一致即红**。

### 12.6 F7 口径（供 t77 同步其 5.4b，逐字）
**非例外一致 37/43**；**真实偏离 5**（`F-gate-{south,north,west,east}` 四城门双标高 + `C-gate-inner`）；**已归位例外 1**（`C-hall-bed-main`，`sillY==wkY`，仅留档）；**`DOOR_SILL_EXCEPTIONS` 表内 6 条**；合计 **43**。（t125 曾写 38，**已更正**。）

### 12.7 自有引擎 43 行对照（`cellSize:1`，up≤0.5/down≤0.6）
| 时点 | 可达 |
| --- | --- |
| t121 后 | 41/43（剩 `C-side-{west,east}-main`） |
| **t128 后** | **43/43** ✓ |

**如实说明**：这是**我方引擎**口径；**最终判定归 t77 生产引擎复跑**（本卡**不宣称“43 栋均可进入”**）。

### 12.8 冻结计数与跨 owner pin
`WALKABLE 157 → 161（t126）→ **169**（t128）`；`LAYOUT 1.1.13 → 1.1.14 → **1.1.15**`；`CONNECTORS 32 / WALLS 60 / SLOTS 67 / COURTYARDS 14 / TOUR_POINTS 10` **未变**、**未新增 connector**。
**跨 owner 待派单**：`tests/core.test.mjs`（t127 已同步到 161 ⇒ 现需 **169**）；`docs/CONTRACTS.md` 由本卡同步（✓）。

---

## 13. t13 闭合（追加；只增不改 §10）

§10 的处置 **(a)「保留几何门洞 + 显式具名登记阻挡来源」在 t13 被产品侧取代**：主理人派单 t13
「让水中亭可上去：落 2 块汀步（0.4→0.65→0.90，逐跳 0.25）+ 同轮建可见石件；**实测双向可走后，才删 `doorBlockedBy`**」。

- **只读取证先行**：`work/probe-t13-pavilion.mjs`（本次新建，只读）实测 —— 两亭门洞 `passable=false`、`blockedBy=WB-{D,E}-pond`；
  池面在**脚高**上其实由 `OB-WB-{D,E}-pond`（`blocks:'all'`，生产派生盒 `y1=1.0`）拦住，`probe()` 在亭中心/门内/门外全 `ok=false`；
  `deriveWaterColliders` 对水池**不产生 door**（无桥面横跨）⇒ 谓词层只有"单矩形 + 门洞通道"。
- **落地**：`LAYOUT 1.1.22 → 1.1.23`（`STONE_STEP_LANES` 两条走廊 + `WALKABLE` 171→175 + 水体 `blocks:'exceptDoor'` 有界开槽），
  D/E 两区**同轮建可见石件**（石顶 = 登记面高、石身落池底），两亭 `doorBlockedBy` 删除 ⇒ `passable:true` / `blockedBy:null`。
- **§10.3 的 6 条 t117 判据处置**（只增不减）：`恰 2 座声明不可通行`/`具名例外 id`/`其余 8 座` 三条随状态消失，
  由 **t13 的 4 条新判据**（走廊 id 恰为两亭 / 每池 2 面共 4 面 / 逐跳 ∈[0.20,0.25] 且 float32 双向可跨并禁 0.5 等值 / 走廊几何与水体开槽逐值一致 + 格心可见 + 面积守恒）
  与 **2 条接管断言**（两亭仍 `hasDoor` + `exceptDoor` ⇒ 非空气墙；10 座亭 `door.width>0` ⇒ 几何门洞未删）共同承载。
- **§10.4 的 B4 精确改法**（原建议 `18/18 → 16/18 + 2 座具名例外`）**未采用**：t13 后实测净宽 `0 → 7.3m`，
  故 B4 取**更强**形式 —— `63/63 全部达标 + 0 座具名例外 + 任何 passable=false 必具名 blockedBy`（`tests/verify-experience.test.mjs`）。
- **实测**：整城 1m 冷口径图（`walk-reachability`）`不可达 = 0`；两池各自局部 1m 生产图 `path()` **去/回均 ok**；
  水面 \ 走廊逐 2m 采样 0 漏护；`audit --enforce` 341/350、F 仍 80/80（无余量）。

---

## 12. t28（测试侧）：`jump.enabled` **状态 pin → 性质 pin** 重锚（`tests/layout.test.mjs`）

> 卡面来源：t27 实测「`layout.test.mjs` 现唯一失败项是『碰撞/台阶/跳跃规则齐全』，它断言 `jump.enabled === false`」。
> **本轮实测更正（先证后改，如实报告）**：**该前提在 14:5x 之后已不成立** —— 工作树里那条断言早已被 t2 同轮改写成
> `enabled === true`（`git diff` 可见：`- … && INTERACTION.jump.enabled === false` → `+ … && INTERACTION.jump.enabled === true && maxHeight>0 && ≤1.0 && |gravity|>0 && cooldown>0`），
> 故 `node tests/layout.test.mjs` **在改动前即 exit 0（1844 项 / 失败 0）**。⇒ 本卡**不是**「修一条红」，
> 而是把 t2 落下的**状态 pin**（`enabled === true`：产品一旦关闭跳跃或改由运行时开关控制即**假红**，且它并不检验「跳跃是否安全」）
> 重锚为**性质 pin**。**不得靠把 `config` 改回 `false` 来躲** —— 现树保持 `enabled: true`。

### 12.1 改前 / 改后断言原文

**改前（t2 落下的状态 pin，1 条 `check`）**：

```js
check('碰撞/台阶/跳跃规则齐全', INTERACTION.player.radius > 0 && INTERACTION.step.maxStepHeight > 0
  && INTERACTION.jump.enabled === true                                    // ← 状态 pin
  && INTERACTION.jump.maxHeight > 0 && INTERACTION.jump.maxHeight <= 1.0
  && Math.abs(INTERACTION.jump.gravity) > 0 && INTERACTION.jump.cooldownSeconds > 0);
```

**改后（t28 性质 pin，5 条 `check`；原有性质一条未删）**：

```js
check('碰撞/台阶/跳跃参数自洽（t28：状态 pin → 性质 pin）', … radius>0 && maxStepHeight>0 && snapDown>maxStep
  && typeof enabled === 'boolean'                                          // ← 只断言**类型**，不断言取值
  && Number.isFinite(velocity) && Number.isFinite(gravity) && gravity < 0
  && Number.isFinite(maxHeight) && maxHeight > 0 && maxHeight <= 1.0
  && Number.isFinite(cooldownSeconds) && cooldownSeconds > 0);
check('跳跃落地判定所需字段齐备（enabled/velocity/gravity/maxHeight/cooldownSeconds 全在且类型正确）', …);
check('跳跃运动学自洽：v₀=√(2·|g|·h) 有限且 >0、顶点 = maxHeight（≤1.0m 硬上限）、顶点时间有限且 <1s', …);
check('地面可站立处起跳后必落回同一可站立面（5 个 fp-spawn 几何闭环：可站立 ∧ 包络内 ∧ (y, y+maxHeight] 内无实体）', …);
if (JUMP.enabled) check('跳跃已启用 ⇒ 开关与事件登记自洽（fp:jumped / fp:landed 已声明）', …);   // 卡面授权的条件分支
```

口径三要素：**来源** = `config.INTERACTION.jump` + `layout.VIEWPOINTS(fp-spawn)` + `layout.OBSTACLES`（不另写数值）；
**判据** = 参数自洽（类型 / 有限 / 上下界 / 运动学）+ 落地字段齐备 + 几何闭环；**反例** = 任一条不成立即红（见 §12.3 突变证据）。

几何闭环为何取 5 个 `fp-spawn`：它们是**唯一登记的第一人称出生点**（权威起跳点）；室内/门内走查点位于建筑障碍足迹内、上有屋面，
其「起跳净空」由 kit 屋面几何决定，**不属 layout 数据域**（故不在此断言，也不假绿）。

### 12.2 计数（只增不减）

| | 改前 | 改后 |
| --- | --- | --- |
| 该处 `check` 条数 | **1** | **5**（4 条无条件 + 1 条 `enabled` 条件分支；现树 `enabled=true` ⇒ 5 条全执行） |
| `node tests/layout.test.mjs` 通过项数 | **1844** | **1848**（**+4**） |
| 退出码 | exit 0（0 失败） | **exit 0（0 失败）** |

> 为什么是 +4 而非 +5：本块位于文件**中段**（section A），而 `通过 N 项` 那行在中段打印（早于 section B 的 t9/t10 块），
> 5 条 − 1 条 = **+4** ✓；`enabled=false` 时条件分支不执行 ⇒ 同一命令为 **1847 项 / 0 失败**（见 §12.3 C2）。

### 12.3 突变证据（在**隔离副本** `/tmp/t28-mut*` 上做真实文件突变，未触碰共享树）

| # | 突变 | 期望 | 实测 |
| --- | --- | --- | --- |
| A | `jump.maxHeight 0.9 → 1.5` | 红 | **exit 1 · 失败 2**，含 `✗ 碰撞/台阶/跳跃参数自洽（t28…）` ✓ |
| B | `jump.gravity -18 → 0` | 红 | **exit 1 · 失败 2**，含同一条 ✓ |
| C2 | `jump.enabled true → false`（**仅** jump 段） | **不得假红** | **exit 0 · 1847 项 / 0 失败** ⇒ 套件不再依赖该布尔状态 ✓ |
| D1 | `VP-B-fp-spawn` 挪进西北角楼足迹 `(-304,454)` | 红 | **exit 1 · 失败 3**，含 `✗ 几何闭环 … y=null env=false 脚部阻挡=1 顶点内实体=1` ✓ |
| D2 | 出生点 `(-30,-360)` 上方加合成实体 `y∈[0.3,1.2]`（脚部自由） | 红 | **exit 1 · 失败 1**（恰为本条）`脚部阻挡=0 顶点内实体=1` ⇒ **顶点分支单独可触发** ✓ |

> C2 的第一次尝试把 `enabled: true` 误替换到了**动态阴影**段（同名键），失败项为 `✗ 动态阴影：优先一盏主方向光` ——
> **属突变脚本伪影、不是断言性质**；已改为按 `jump: Object.freeze({` 段落精确定位后重跑（= C2 行）。

### 12.4 回归（本卡 verify 命令；最终树 `LAYOUT 1.1.23` / `CONFIG 1.0.8`）

| 命令 | 结果 |
| --- | --- |
| `node tests/layout.test.mjs` | **exit 0** —— 通过 **1848** 项 / 失败 **0** |
| `node scripts/audit.mjs --enforce` | **exit 0** —— 主场景 **342 / 350**、分区 F **80 / 80**、`y0 canonical` 93 条自检 ✓ |

- **未运行（如实登记）**：`tests/run.mjs` 全量（本卡只改断言、未改产品代码；t2 回执已给全量读数）、浏览器侧探针、`verify-*` 套件。
- **未触碰**：`src/**`（含 `config.js` 的 `jump.*` 数值）、阈值 `maxStepHeight 0.5 / snapDownDistance 0.6`、§8.2 门禁与配额、
  `docs/CONTRACTS.md`（t2 已同步 §5.4/§6.3；本卡 inScope 只含本文件与 `tests/layout.test.mjs`）。

---

## 13. t32（测试侧）：LAYOUT 版本 pin **数据推导**化 + 升版后陈旧 pin 普查（`tests/layout.test.mjs`）

### 13.1 前提核实（先证后改）

卡面前提**属实**（与 t28 那次不同）：本轮改动前 `node tests/layout.test.mjs` **exit 1 · 通过 1847 / 失败 1**，
唯一失败项为：

```
✗ LAYOUT 版本 = 1.1.23（t13：两座水中亭可达 —— 每池 2 级汀步 + 水体有界开槽；WALKABLE 171→175）
  :: 期望 "1.1.23"，实际 "1.1.24"
```

即 t22 把 `LAYOUT` 升到 `1.1.24`（新增 `through/door.back` 登记，计数未变）时，本行 pin 未同轮同步（不在 t22 的 inScope）。

### 13.2 改前 / 改后断言原文

**改前（1 条 `eq`，状态/字面量 pin）**：

```js
eq('LAYOUT 版本 = 1.1.23（t13：…）', L.LAYOUT_VERSION, '1.1.23');
```

**改后（3 条 `check`，数据推导 + 性质判据；`CONFIG` 侧仍保留有意 pin）**：

```js
// LAYOUT 版本链（历史快照，仅记录、不参与判定）：… → 1.1.23(t13) → 1.1.24(t22)
const LAYOUT_VERSION_FLOOR = '1.1.23';            // 已登记的最后快照；只用于“不得回退”，升版无需改
const cmpVersion = (a, b) => { … };               // 三段数值比较
check('LAYOUT 版本号格式 vX.Y.Z（t32：数据推导，不再逐版同步字面量）', /^\d+\.\d+\.\d+$/.test(L.LAYOUT_VERSION), …);
check('LAYOUT_STATS.layoutVersion === LAYOUT_VERSION（注册表摘要与常量不得分叉）', …, …);
check('LAYOUT 版本不得回退（≥ 已登记快照 1.1.23；升版无需改本断言）', cmpVersion(L.LAYOUT_VERSION, LAYOUT_VERSION_FLOOR) >= 0, …);
```

**为什么不是 `eq(L.LAYOUT_VERSION, L.LAYOUT_VERSION)`**：那是**恒真判据**（t140 的教训：恒真 = 未生效）。
故改后取三条**可证伪**性质：① 格式合法；② 与 `LAYOUT_STATS.layoutVersion`（注册表摘要）一致；③ 单调不回退（floor = 最后已登记快照）。
**代价（如实登记）**：旧 pin 的"任何升版都必须人工同步本行"这一**强制同步**性质被有意放弃（卡面明确要求"避免每次升版都要改"）；
"冻结值不得被悄悄改"由其余 **~1850 条内容判据**（计数 / 白名单 / 哈希 / 几何关系）继续承载 —— 若主理人更偏好"强制同步"，
一行即可改回字面量 pin（本回执给出两种形态）。

### 13.3 计数（只增不减）

| | 改前 | 改后 |
| --- | --- | --- |
| 该处断言 | 2 `eq`（CONFIG + LAYOUT 版本各 1） | **5 `check`**（CONFIG 格式/回退 + LAYOUT 格式/摘要一致/回退） |
| 新增（计数类，见 §13.4-B） | — | **+3 `check`**（17 项跨注册表一致性 / 三源一致 / visitableSlots 集合） |
| `node tests/layout.test.mjs` 通过项数 | **1847**（失败 **1**） | **1854**（失败 **0**） |
| 退出码 | **exit 1** | **exit 0** |

> 净增 **+7**（−2 `eq` +5 版本 `check` +3 计数 `check` = +6 ⇒ 1853；其后因 **CONFIG 侧第二次同类事故**再 −1 `eq` +2 `check` = +1 ⇒ **1854**）；`失败 1 → 0`。

**⚠️ 执行期间发生第二次同类事故（并发窗口，如实登记）**：本卡进行中，另一成员把 `CONFIG_VERSION` 由 `1.0.8` 升到 **`1.0.9`**
（t25：`LIGHTING.atmosphere.smokeMinPointPx = 1.0`，落地 t1 的烟柱 LOD 修复；`src/shared/config.js` mtime **10:01:11**）
⇒ 本文件 CONFIG 字面量 pin 随即陈旧，`layout.test` 由 1853/0 变为 **1852/1**（`✗ CONFIG 版本 = 1.0.8 … 实际 "1.0.9"`）。
判定：**真缺陷（同一类「升版后 pin 未同步」），不是写入窗口伪影**（config.js 内容完整、`git diff` 为 t25 的完整改动；重复运行稳定复现）。
处置：按卡面「能数据推导的改推导」**同轮把 CONFIG 侧也数据推导化**（格式 + 不得回退；CONFIG **无第二来源**可做跨源一致，如实登记）⇒ 回到 1854/0；
**未改任何 `src/**` 数值**（仅测试侧口径）。

### 13.4 升版后陈旧 pin 普查（file:line + 处理方式）

**A. `tests/layout.test.mjs`（本卡 inScope）**

| file:line | 内容 | 类别 | 处理方式 |
| --- | --- | --- | --- |
| `tests/layout.test.mjs:76`（改前） | `LAYOUT 版本 = 1.1.23` 字面量 | **陈旧状态 pin（初始红项）** | **改为数据推导 + 性质判据**（§13.2） |
| `tests/layout.test.mjs:76`（改前） | `CONFIG 版本 = 1.0.8` 字面量 | **执行期间被 t25 升到 1.0.9 ⇒ 陈旧（第二个红项）** | **同轮改为数据推导 + 性质判据**（§13.3 ⚠️） |
| `:605` | `WALKABLE = 175` | 有意 pin（t13 已同步 ✓） | **保留**，并在上方加"有意 pin 类"表头（升版/加面须人工同步） |
| `:606/:607/:608/:609` | `VIEWPOINTS 61` / `FP_ROUTE 50` / `visitable 43` / `冻结计数 79/60/32/14/10` | 有意 pin（均在同步状态 ✓） | **保留** + 表头说明；由 §13.4-B 的跨注册表判据兜底"只改一侧" |
| `:688` | `INTERIOR_BY_SLOT 条数 = 43` | 有意 pin（同步 ✓） | 保留；另加三源一致判据（§13.4-B） |
| `:787` | 内景包围盒冻结哈希 `0xf5814450`（含旧值 `0x51d2348e` 文字） | 冻结哈希（t10 已同步 ✓） | 保留；旧值已在标题内显式标注为**历史快照** |
| `:738` | 直方图 `48/81/11/27/22/5（194 对相邻面）` | **诊断读数（非判据）** | **显式标注"历史快照/不参与判定"**（本轮新增标注） |
| `:651` | t9 断言 `WALKABLE === 171 + STONE_STEP_SURFACE_IDS.length` | **已是数据推导** ✓ | 保留（t13 改法正确，本轮未动） |
| `:982` | t13 断言 `walkSurfaces.length === 4`（消息含 `171 → 175`） | 判据数据推导 ✓、消息为历史 | 保留 |
| `:520-522` | `LAYOUT_STATS.slotCount/courtyardCount/slotsByZone` | **已是数据推导** ✓ | 保留，并由 §13.4-B 扩展为 17 项 |
| `:507-513`（§8.2 预算块） | `B70/C60/D56/E56/F80`、`reserve 28`、`350`、`1500000` | **契约冻结值**（不得动） | **未触碰**（本卡纪律） |
| 阈值 | `maxStepHeight 0.5` / `snapDownDistance 0.6` | **只读引用** | **未触碰** |

**B. 本轮新增（数据推导，不随升版失效）**：`LAYOUT_STATS` **17 项**逐项 = 实际注册表（`slotCount/visitableCount/courtyardCount/connectorCount/roadCount/wallSegmentCount/cityWallSegmentCount/courtyardWallCount/corridorCount/walkableCount/obstacleCount/waterBodyCount/viewpointCount/tourPointCount/fpRouteCount/lanternCount/bulkAnnexCount`）；
三源一致（`visitable` 数 = `INTERIOR_BY_SLOT` 条数 = `LAYOUT_STATS.visitableCount`）；`visitableSlots` 集合与 `SLOT_BY_ID` 逐 id 相等。

**C. 越界项（本卡 inScope 外，仅复核与上报，**未改**）**

| file:line | 内容 | 现状（本轮只读复核） |
| --- | --- | --- |
| `tests/core.test.mjs:920-923` | 用例标题写死「67 栋 / 81 障碍 / 171 可走面 / LAYOUT 1.1.19」 | **已被 t23 改为运行时推导** ✓（断言体本就数据驱动） |
| `scripts/verify-completeness.mjs:1324` | 浏览器 11.2 硬 pin `report.buildings === 67` | **已改为 `${expectedBuildings}`（= `layout.SLOTS`）** ✓ |
| `scripts/verify-g1-baseline.mjs` | 硬 pin `SLOTS.length === 67 && VIEWPOINTS.length === 20` | **已改为 `LAYOUT.SLOTS.length`** ✓（`VIEWPOINTS` 项亦已消解） |
| `docs/CONTRACTS.md:10` / `:14` | 头部表 `LAYOUT_VERSION 1.1.22`；对应关系行 `1.1.23` + `CONFIG_VERSION 1.0.7` | **与运行时读出（`1.1.24` / `1.0.8`）三处不一致** ⇒ **待派单**（CONTRACTS 本卡 inScope 外） |
| `docs/CONTRACTS.md:670`（§6.4） | 「当前 **175 面**」 | **已同步** ✓（t13 同轮） |
| `README.md:281/595` | 变更叙述里的「67 栋」 | **历史叙述**（非"当前值"声明）⇒ 建议 t20 发布收口时按需标注 |

### 13.5 突变三证（隔离副本 `/tmp/t32-mut`，未触碰共享树）

| # | 突变 | 期望 | 实测 |
| --- | --- | --- | --- |
| M1 | `LAYOUT_VERSION = '1.1'`（格式非法） | 红 | **exit 1 · 失败 2**，含 `✗ LAYOUT 版本号格式 vX.Y.Z … :: 1.1` ✓ |
| M2 | `LAYOUT_STATS.walkableCount = WALKABLE.length + 1`（只改摘要一侧） | 红 | **exit 1 · 失败 1**，`✗ LAYOUT_STATS 计数逐项 = 实际注册表 … walkableCount: 摘要 176 ≠ 实际 175` ✓ |
| M3 | `LAYOUT_VERSION = '1.1.22'`（回退，低于 floor 1.1.23） | 红 | **exit 1 · 失败 1**，`✗ LAYOUT 版本不得回退 … 1.1.22 vs 1.1.23` ✓ |
| M4 | `CONFIG_VERSION = '1.0'`（格式非法） | 红 | **exit 1 · 失败 2**，含 `✗ CONFIG 版本号格式 vX.Y.Z … :: 1.0` ✓ |
| M5 | `CONFIG_VERSION = '1.0.7'`（回退，低于 floor 1.0.8） | 红 | **exit 1 · 失败 1**，`✗ CONFIG 版本不得回退（≥ 已登记快照 1.0.8）… 1.0.7 vs 1.0.8` ✓ |
| M0 | 恢复对照（LAYOUT 侧） | 绿 | **exit 0 · 1853 项 / 0 失败** ✓ |
| M0b | 恢复对照（CONFIG 侧，第二次事故处置后） | 绿 | **exit 0 · 1854 项 / 0 失败** ✓ |

### 13.6 回归（本卡 verify 命令；最终树 `LAYOUT 1.1.24` / `CONFIG 1.0.9`）

| 命令 | 结果 |
| --- | --- |
| `node tests/layout.test.mjs` | **exit 0** —— 通过 **1854** 项 / 失败 **0**（连跑两次一致） |
| `node scripts/audit.mjs --enforce` | **exit 0** —— 主场景 **342 / 350**、分区 F **80 / 80**、`y0 canonical` 93 条自检 ✓ |

- **稳定性（并发窗口纪律）**：`layout.test` 连跑 2 次均 `exit 0 · 1854/0`；`src/shared/config.js` mtime 10:01:11、
  `src/shared/layout.js` 09:36:38 之后无新写入 ⇒ 上述读数为**稳定态**，非并发写入窗口伪影。

- **未运行（如实登记）**：`tests/run.mjs` 全量（本卡只改断言，未改产品代码）、浏览器侧探针、`verify-*` 套件。
- **未触碰**：`src/**`（含 `LAYOUT_VERSION` 与 `config.js`）、阈值 `0.5 / 0.6`、§8.2 配额与门禁、`docs/CONTRACTS.md`、
  以及 out-of-scope 的 `tests/core.test.mjs` / `interaction` / `walk-reachability` / `zone-garden` / `scripts/**`。

---

## 14. t33（契约文档）：`CONTRACTS.md` 头部「当前值」与运行时读出对齐 + 全量「当前值」普查

### 14.1 先读实测（写前取证）

```
node -e "Promise.all([import('./src/shared/config.js'),import('./src/shared/layout.js'),import('./src/kit/index.js')]).then(([c,l,k])=>console.log(c.CONFIG_VERSION,l.LAYOUT_VERSION,k.KIT_VERSION,c.STYLE_BASELINE))"
→ 1.0.9 1.1.24 1.0.1 v1.0.0
计数：SLOTS 79 · WALKABLE 175 · OBSTACLES 93 · 内景 43 · VP 61 · FP_ROUTE 50 · TOUR 10 · 院落 14 · 墙 60 · 连接 32 · 道路 95 · 灯位 49
```

### 14.2 逐处改前 / 改后（行号 = 改前文件行号）

| 行 | 改前原文（摘） | 改后 |
| --- | --- | --- |
| :7 | `| 契约版本 | \`CONTRACTS v1.0.25\` |` | `CONTRACTS v1.0.26`（本轮追加修订条目，自洽本文件「任何变更由 t1 递增版本」） |
| :9 | `| \`src/shared/config.js\` | \`CONFIG_VERSION 1.0.7\` |` | `CONFIG_VERSION 1.0.9` |
| :10 | `| \`src/shared/layout.js\` | \`LAYOUT_VERSION 1.1.22\` |` | `LAYOUT_VERSION 1.1.24` |
| :14 | `CONTRACTS v1.0.25 ⇄ CONFIG_VERSION 1.0.7 ⇄ LAYOUT_VERSION 1.1.23 ⇄ KIT 1.0.1 ⇄ STYLE v1.0.0` | `CONTRACTS v1.0.26 ⇄ CONFIG_VERSION 1.0.9 ⇄ LAYOUT_VERSION 1.1.24 ⇄ KIT_VERSION 1.0.1 ⇄ STYLE_BASELINE v1.0.0` |
| :16 | 命令期望输出 `→ 1.0.7 1.1.22 1.0.1（t10 实跑读出）` | `→ 1.0.9 1.1.24 1.0.1（t33 实跑读出；历史读出 1.0.7 1.1.22 1.0.1(t10) / 1.0.3 1.0.0 1.0.1(t46) —— 历史快照，不参与判定）` |
| :523 | `#### 5.2.1 与 \`LAYOUT 1.1.4\` 实际值对照（t81 / F6 裁定 (a)）` | `#### 5.2.1 实际值对照（t81 / F6 裁定 (a) 建立；数值逐版更新，当前 = \`LAYOUT 1.1.24\`，t33 按运行时读出核对）` |
| :525 | `| 量 | 旧文本口径 | **当前实测（\`LAYOUT 1.1.4\`）** | 取代关系 |` | 列头改为 **`当前实测（\`LAYOUT 1.1.24\`，t33 核对）`**（表内数值本就是 1.1.24 的：175 / 79 / 93） |
| :855-857 | §11.3 第 1 点「**当前状态（诚实标注）**：`src/ui/**` 与 `src/interaction/**` 尚未交付（空目录）…」 | **原文保留**（历史只追加）+ 追加 t33 标注：该观测属 `CONTRACTS v1.0.2`(t17) 时点，现两处**均已交付**（`src/interaction/**` 11 模块 / `src/ui/**` 6 文件）⇒ 该义务**已进入可验证状态**，是否通过由 V2 判定，**本契约不代判** |
| :402 | §3.5「不合批的直接后果：…（B70/C50/D40/E40/F80）」 | 对齐为 `config.BUDGET` 现值 **B70/C60/D56/E56/F80**（t84 重分配），计划原文标注**历史快照，不参与判定** |
| :796 | §9 表「主场景绘制调用 ≤ 350；分区 B70 / C50 / D40 / E40 / F80，保留 70 给集成」 | **B70 / C60 / D56 / E56 / F80，保留 28**（`Σ perZone 322 + 28 = 350`；计划原文 B70/C50/D40/E40/F80 + 70 标注为历史快照） |
| :76-86 | — | 追加 **v1.0.26（t33）** 修订条目（逐条登记上述改动 + 核对结果 + 口径说明） |

### 14.3 全量「当前值」普查（`grep -n 当前 docs/CONTRACTS.md` 逐条判定）

| 类别 | 处置 |
| --- | --- |
| **陈旧「当前值」**（本轮修） | 头部 :9/:10/:14/:16（版本）· §5.2.1 :523/:525（版本标签）· §11.3 :855（早期状态）· §3.5 :402 与 §9 :796（**§8.2 旧配额引用**） |
| **已在同步状态**（保留） | §6.4 :681「当前 175 面」✓ · §5.2.1 各行数值 43/175/61/50/32/60/79/93/14 ✓ · §6.3.1 :695「下钳 15 / 保持 78（共 93）」✓ · §5.2.2 :556「43/43」✓ · §3.4.x `kit.version`（当前 1.0.1）✓ · :527「当前集合 = 43 栋」✓ · :637「内景 43 条」✓ · :776「无必需网络资源」✓ |
| **运行时语义**（非「当前值」声明） | :162「当前质量档」· :915/:925/:926「当前模式/当前激活数/当前预设生效值」（描述字段语义） |
| **历史快照**（显式标注，不参与判定） | :16 历史读出 · :80/:83（本轮标注）· :869（本轮标注）· 版本链 :77-79 · 各 `v1.0.x（tNN）` 修订条目 · :258「当时槽位 67，t9 起 79」· :539/:544「历史真值」· :696「旧数据快照，已作废」· :1178（t10 条目内的 171 面，属该版历史） |

grep 证据（历史快照标注）：`grep -c 历史快照 docs/CONTRACTS.md` → **4**；`grep -n "历史快照" …` → :16 / :80 / :83 / :869（另 :539/:544/:696/:1178 用「历史真值 / 旧数据快照 / 属该版历史」表述）。

### 14.4 契约消费方复核（**CONTRACTS 被谁读**）

- `scripts/audit.mjs` **不读** `docs/CONTRACTS.md`（`grep -rn "CONTRACTS.md" scripts/*.mjs` 仅命中 `probe-walk-rule.mjs:315` 的一句"只读"注释）⇒ 本次对齐是**文档一致性**修正，与 `audit --enforce` 的退出码独立。
- `tests/interaction.test.mjs:3220-3223` **会读**（只读引用两处台阶阈值原文并做正则断言）⇒ 本卡复跑该套件以证明引用未破：
  - 正则① `/下\s*≤\s*`snapDownDistance 0\.6`/` → **true**；正则② `/台阶阈值：可跨 `0\.5m`，下台阶吸附 `0\.6m`/` → **true**。
  - ⚠️ 该套件当前 **exit 1**，唯一失败为 **E13 计数**（`整足迹阻挡者应为 24 条…实际 22`）——**与本卡无关**：
    A/B 取证 = 把 `docs/CONTRACTS.md` 换回 **HEAD 版（`CONTRACTS v1.0.22`）** 后单独跑 `interaction.test`，失败集**逐项相同**（同一 E13、同一「期望 24，实际 22」）。
    ⇒ 属 **`tests/interaction.test.mjs` 的期望值陈旧**（t13 把 4 条水体障碍都改成 `exceptDoor`，而该期望只减了 2），**out-of-scope（本卡 inScope 不含 tests/）**，已交回派单。

### 14.5 回归

| 命令 | 结果 |
| --- | --- |
| `node scripts/audit.mjs --enforce`（本卡 verify） | **exit 0** —— 主场景 **342 / 350**、分区 F **80 / 80**、`y0 canonical` 93 条自检 ✓、结论「预算与契约检查全部通过」 |

- **未运行（如实登记）**：`tests/run.mjs` 全量、`tests/layout.test.mjs`（t32 刚交付 1854/0；本卡未改 tests/**）、浏览器侧探针、`verify-*` 套件。
- **未触碰**：`src/**`（含 `config.BUDGET` 数值与阈值）、`tests/**`、`scripts/**`、`README.md`、§8.2 门禁（350 / 1500000 / 25MB 与分区配额数值）。

---

## 15. t37（可登塔楼接线）：两个 P0 已解 + **第三个生产级缺陷**发现并修复；城市级接线**因 inScope 限制未落地**（交回）

> **结论（先说）**：本卡 inScope（`src/shared/layout.js`、`src/kit/towers.js`、`tests/layout.test.mjs`、本文件）内的部分**全部完成并验证**；
> 但验收要求的**城市级接线（可见几何 + 生产装配实测）需要 `src/kit/index.js` 与 `src/zones/**`** —— 两者都在本卡 **Out of scope**，
> 且**只登记不建几何**会造出验收明文禁止的"**空气楼梯**" ⇒ 本卡**未接线**，按纪律交回（详见 §15.6 的精确补丁清单）。

### 15.1 P0 ①：`kind:'towerStep'` → **`'terrace'`**（`src/kit/towers.js:335`，改后行号见 §15.5）

- **改前**：`kind: 'towerStep'`；`WALKABLE_KINDS`（`src/core/context.js:80`）= `ground/terrace/interior/bridgeDeck/gardenGround/outerTerrain/passage`
  **不含它** ⇒ `validateZoneResult` 抛 `ZoneContractError`（`.kind 非法`）⇒ **全树 0 区装载**。
- **二选一**：把 `towerStep` 纳入白名单需改 `src/core/context.js`（**不在 inScope**）且会牵动全部消费方 ⇒ 取**改用既有白名单 kind**。
- **改后**：`'terrace'`（台面/平台级可行走面，与本塔的环带/踏面/入口/观景台语义一致；且在 F 区花园填充的 `FILL_KEEP_KINDS` 内，不会被填充物压占；
  同时**不使用** `-transition-N` id 后缀 —— t102 的"过渡面只属 18 栋"守卫按 id 后缀判定）。
- **验证**：契约校验镜像（逐条复算 core 规则）`walkable 72 条 · kind=['terrace'] · 校验问题 0` ✓。

### 15.2 P0 ②：塔顶机位 `mode:'interior'` → **`'focus-extra'`**

- **改前**：`mode: 'interior'` ⇒ ① 破坏**冻结的 43 栋内景集合**（43→44）；② `interior` 机位必须在 `kind==='interior'` 的面上，塔顶是 `terrace` 面 ⇒ 直接判非法。
- **改后**：`mode: 'focus-extra'`（`VIEWPOINT_MODES` 白名单，`src/core/context.js:71`）—— 塔顶观景台**不是建筑内景**。
- **对 43 栋计数的影响**：**零**（实测 `interior` 机位 43 / `INTERIOR_BY_SLOT` 43 / `visitable` 43，接线前后一致）；
  只使 `VIEWPOINTS 61 → 62`、`focus-extra 6 → 7`（接线时须同步 pin，见 §15.6）。

### 15.3 **P0 ③（本卡新发现，原报告未列）：塔身障碍把 72 块面全盖住 ⇒ 生产级不可登**

- **现象**：`towerPlan` 原把塔身障碍取成 `2 × towerHalf(0)`（**首层满宽**）且 `y1 = topY + roofRise`
  ⇒ 该盒在 xz 上覆盖**全部面**（实测 **70/72** 落在盒内）。
- **为什么 plan 级看不出来**：`climbSequenceReport.ok` 只查**面序列**（逐跳 Δy / 双向 / 平面叠压），**不查障碍**；
  而生产判定 `obstacleBlocksPoint`（= `walk-solver.blocks` 的底层谓词）用「玩家体段 `[feetY, feetY+1.6/1.8]` 与障碍 `[y0,y1]` **相交（含界）**」⇒
  站在盘道/观景台上的玩家**全部被挡** ⇒ **"计划绿、生产红"**。
- **修法**：障碍改为**中央内芯** —— 半宽 = 最内层 `towerHalf(levels)`（12×12m 盒的中心 6m 芯），
  `y1 = topY − slab`（**观景台板底**；若取 `y1 = topY` 则含界判定会拦住观景台本身）；
  `wallBody` 几何与障碍**逐值同源**（原为满宽，会吞掉盘道）。
- **验证（生产判定口径）**：`obstacleBlocksPoint` 逐面中心复算 ⇒ **72/72 可站、0 被挡**（修前 70/72 被挡）；
  环带中线距内芯边缘 0.9m ≫ 玩家半径 0.35m；障碍 `y1=9.214 < 顶面 9.34` ✓。
- **如实登记的残留**：内芯只在 `[0.4, 9.214]`；上层台体（石作）未逐层登记障碍 ⇒ 贴内沿行走时玩家体宽可能视觉蹭进石体（不影响可走性）；
  跳（t28 顶点 0.9m）与攒尖顶/宝顶未做顶穿检查（塔顶屋面不是障碍）。

### 15.4 选址（只读取证，含冲突检查）

| 候选 | tile | 冲突 | 结论 |
| --- | --- | --- | --- |
| **(226, 262.4)**（t14 暂定） | **E** | 仅 `WK-E-ground`（= 地面面，**所有建筑都如此**） | ✅ **推荐**（无槽位/墙/路/连接/障碍/景物冲突；E 区预算 49/56 尚有 7 次余量） |
| (262, 262)（t14 首选） | E | `F-bulk-e-270-264`、`F-bulk-e-250-264` + 两条 `OB-F-bulk-*` | ❌ 已被 t9 批量装饰占用（与卡面一致） |
| (268, 332) | F | `OB-SC-F-rockery-east` + 景物 | ❌ 压假山 |
| (240, 344) / (200, 352) | F | 东池水面障碍 + 环池步道 | ❌ 压水面/步道 |
| — | — | F 区预算 **80/80（零余量）** | ⚠️ 塔楼**不要放 F 区**（放 E 区，E 49/56） |

### 15.5 盘道读数（口径三要素 + 逐跳）

- **来源/口径**：`kit/towers.js` 的 `towerPlan`（纯数据）+ `climbStepMax`；**cellSize/锚点/格对** = 面序列
  `entry-1 → entry-2 → L1-ringN → L1-step-01…18 → L2-… → L3-… → deck`（`pathIds`，上行链；反向即下行链）。
- **读数（SITE = 226,262.4 / baseY 0.4 / `watchtower-3`）**：面 **72** 块 · 跳 **59** · 最大跳 **0.42**（上限 `climbStepMax = 0.5×0.84 = 0.42`，≤0.45 ✓）
  · 反向 `reverseOk = true` · 平面叠压 **0** · 顶层 = `T37-site-deck` @ **y=9.34** · 三角面 **936** · 合并网格 **6** 个（terraceCap/stairs/terrace/wallBody/roof/finial）
  · 障碍 1 条（内芯 12×12，`y[0.4, 9.214]`，`blocks:'all'`）。
- **常驻判据（`tests/layout.test.mjs`，t37 块，+6 条）**：① 单跳上限 = `maxStepHeight × CLIMB_SAFETY` 且 ≤0.45；② 上行链 ≤上限 ∧ 反向 ∧ 零叠压 ∧ 顶层=观景台；
  ③ P0①（全部面 `kind ∈ WALKABLE_KINDS`）；④ P0②（全部机位 `mode ∈ VIEWPOINT_MODES` 且 ≠ `interior`）；
  ⑤ 几何↔登记同轮 ∧ **生产判定下 0 块面被挡**；⑥ 43 栋内景集合不被触碰。

### 15.6 交回：城市级接线的精确补丁清单（**均为 Out of scope，本卡未改**）

| # | 文件 | 改动 | 依据 |
| --- | --- | --- | --- |
| 1 | `src/kit/index.js` | 导出 `makeTower/towerPlan/disposeTower`（`KIT_VERSION 1.0.1 → 1.0.2`） | 全仓**零调用点**；不导出则 zone 拿不到工厂 |
| 2 | `src/zones/east-courts.js`（E 区，owner zone-inner） | `const t = kit.makeTower({ id:'T-watchtower-3', x:226, z:262.4, baseY:区域地坪, zone:'E', detail:'mid' }); root.add(t.group);` 并把 `t.walkable/t.obstacles/t.viewpoints` 并入本区 `colliders`/`audit`（**登记与几何同轮**） | E 区预算 49/56 有 7 次余量；塔楼 6 个合并网格会并入既有材质角色桶 ⇒ 预期 **+0…+2** 次调用（**须实测**） |
| 3 | `src/shared/layout.js` | 登记 72 面（`kind:'terrace'`）+ 1 障碍（`blocks:'all'`）+ 1 机位（`mode:'focus-extra'`），**由紧凑 `CLIMB_TOWERS` 规格 + 生成器派生**（单一来源，勿抄字面量）；`LAYOUT_VERSION` 递增 | 求解器只读 `layout.WALKABLE/OBSTACLES/VIEWPOINTS`；zone 只负责几何 |
| 4 | pins 同步 | `layout.test`：`WALKABLE 175→247`、`VIEWPOINTS 61→62`、`OBSTACLES 93→94`；`interaction.test`：整足迹阻挡者期望 `24→25`（**out of scope**）；`CONTRACTS §5.2.1/§6.4/§6.3.1`（**out of scope**） | 只增不减 + 数据推导 |
| 5 | 验收 | 接线后重跑 `layout/walk-reachability/interaction(E13/E15/E16/F27)/audit`，并用**真实文件**口径实测"地面→顶层→地面"（`floorYAt` 读模块级数组 ⇒ 内存 clone 无效，见 CONTRACTS §12.1.4.2） | 卡面验收第 5 条 |

### 15.7 本卡 verify 读数（**未接线**状态；三命令全绿）

| 命令 | 结果 |
| --- | --- |
| `node tests/layout.test.mjs` | **exit 0** —— 通过 **1862** 项 / 失败 **0**（t37 新增 6 条常驻判据；其余增量来自并发成员改动，未逐条归属） |
| `node tests/walk-reachability.test.mjs` | **exit 0** —— `t140 结果：全部通过 ✓`；t153 ⓪ 细口径命中 0 / 粗口径 7（= 已登记伪影集合，未新增） |
| `node scripts/audit.mjs --enforce` | **exit 0** —— 主场景 **342 / 350**、分区 F **80 / 80**、`y0 canonical` 93 条自检 ✓ |

- **未运行/未落地（如实登记）**：城市级接线与"生产装配 地面→顶层→地面"实测（需 §15.6 的 1–3）；`interaction.test` 的 E13 当前为**既有红**
  （`整足迹阻挡者应为 24 条…实际 22`，t33 已 A/B 证明与本系列改动无关且 out of scope）；浏览器侧探针、`verify-*` 套件。
- **未触碰**：`src/core/**`、`src/interaction/**`、`src/ui/**`、`src/zones/**`、`src/kit/geometry.js`、`src/kit/interiors.js`、`src/kit/index.js`、
  `tests/interaction.test.mjs`、`tests/walk-reachability.test.mjs`、`tests/core.test.mjs`、`scripts/**`、`docs/CONTRACTS.md`、阈值 0.5/0.6、§8.2 门禁。

---

## 16. t38：中轴体量分级**口径落地**（eaveAbs + T1>T2 严格序 + 无倒挂；**不改体量**并量化交回）

> **只增不改**：本节为追加回执，上文（含 §10 t117 具名例外、§13 t13 闭合）**一字未改**。

### 16.1 来源与目标
用户原话：「现在在中轴的宫殿设计和内饰太单一了 **主要建筑的大小和高度**」。
t14 交付的是 `axis-tiers` **分析**（`work/t14/data/axis-tiers.mjs`，`work/` 不进发布包）；XR 实测指出：
体量分级不是「不够明显」，而是**用错口径就会读成坏的** —— `SLOTS[].totalHeight` 含 `onWall` 的宫墙高（+12m），
把「坐在宫墙上的城门/角楼」与「坐在地上的殿」放进同一个绝对高度榜。本卡把**口径与规则**落成生产数据 + 常驻判据。

### 16.2 只读取证（改前实测；探针 `work/probe-t38-axis.mjs`，只读）
**中轴台账**（`axisTolerance = min|离轴 x|/2 = 29m` ⇒ 中轴 12 栋；`台基` = 台基层数、`檐` = 檐数）：

| id | zone/kind | gr | roof | 面宽×进深 | 占地 | 台基 | 檐 | eaveAbs | eaveRel | totalHeight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-gate-south | F gateHall | 3 | doubleEaveHip | 76×26 | 1976 | 1 | 2 | 18.61 | **6.61** | **24.64** |
| B-gate-front | B gateHall | 2 | hip | 72×24 | 1728 | 1 | 1 | 5.05 | 5.05 | 8.89 |
| **B-hall-main** | B hall | 3 | doubleEaveHip | 84×48 | **4032** | **3** | **2** | **10.71** | **10.71** | **20.48** |
| B-hall-mid | B hall | 2 | hip | 52×28 | 1456 | 1 | 1 | 6.60 | 6.60 | 11.08 |
| B-hall-rear | B hall | 2 | hip | 60×30 | 1800 | 1 | 1 | 6.40 | 6.40 | 11.20 |
| C-gate-inner | C gateHall | 2 | hip | 56×24 | 1344 | 1 | 1 | 5.50 | 5.50 | 9.34 |
| C-hall-bed-main | C hall | 3 | doubleEaveHip | 64×38 | 2432 | 1 | 2 | 7.71 | 7.71 | 15.78 |
| C-hall-bed-rear | C hall | 2 | hip | 52×30 | 1560 | 1 | 1 | 5.80 | 5.80 | 10.60 |
| C-pavilion-rear | C pavilion | 1 | pyramidal | 16×16 | 256 | 1 | 1 | 4.19 | 4.19 | 8.19 |
| F-garden-pavilion-main | F pavilion | 2 | pyramidal | 28×28 | 784 | 1 | 1 | 5.20 | 5.20 | 12.20 |
| F-garden-hall-north | F hall | 2 | hip | 44×22 | 968 | 1 | 1 | 5.40 | 5.40 | 8.92 |
| F-gate-north | F gateHall | 3 | doubleEaveHip | 76×26 | 1976 | 1 | 2 | 18.61 | **6.61** | **24.64** |

**倒挂普查（复现卡内两条读数）**：
- **`F-gate-west/east`（grade 2）`totalHeight 21.68` > 主殿 `20.48`（Δ+1.20）** —— 与卡内数字**逐值复现**；
  另有 `F-gate-south/north 24.64`（Δ+4.16）与 4 座角楼 `21.28`（Δ+0.80）；
  ⇒ raw `totalHeight` 高于主殿者共 **8 栋，全部 `onWall=true`**（4 城门 + 4 角楼），**地上建筑 0 栋**。
- **「4 处硬倒挂」**：本卡只读拿到**两组各 4 栋**的读数 —— ①4 座城门（south/north 24.64、west/east 21.68）；
  ②4 座角楼（21.28）；两者**都**是 `onWall` 系统。除此之外，口径 B（自身基准面）下**倒挂 0 条**。
  （XR 原报告未进本仓 ⇒ 若其「4 处」指别的清单，请以本条普查为准并回执；本卡未据猜测改任何体量。）
- **朴素口径反例**（口径必要性）：`全部中轴槽位 × raw totalHeight` ⇒ `R3-面积严格序 T1.areaMin=1976 vs T2.areaMax=1800`
  = **1.0978 < 1.10**（另：t14 快照下 `R4-relTotal` 也破，当前树该比已 1.2934 ≥ 1.05，故只命中 R3）。

### 16.3 落地内容（`LAYOUT 1.1.25 → 1.1.26`）
`src/shared/layout.js` 新增第十四节（**口径唯一权威源**，全部数据推导）：
- `AXIS_TIER_SPEC`（冻结）：`ladderKinds ['hall','gateHall']` · `areaMargin 1.10` · `eaveMargin 1.05` · `minAbsEave 0.05` · `principalRatio 1.20`；
- `slotVolumeCaliber(slot)`（逐栋 {area, terraceTiers, eaves, eaveAbs, eaveFromGround, totalHeight, totalFromBase, inLadder}）·
  `volumeCaliberRows()` · `deriveAxisTolerance()` · `tierKeyOf()` · `axisTierRows()` · `axisTierStats()` ·
  `axisTierLadder()`（R3/R4）· `axisPrincipal()`（R5）· `axisNoInversion()`（R6a/b/c）· `axisTierReport()`（口径 A/B 并列）；
- 冻结摘要 `AXIS_TIER_SUMMARY` + 可观测副本 `LAYOUT_STATS.axisTiers`；`default` 导出同步。
**口径定义**：`eaveAbs` = 檐口高**自该建筑自身基准面** = `eaveHeight − (onWall ? CITY_WALL.height : 0)`；
`eaveFromGround` = 记录值（含墙高）**并列保留** ⇒ 「城门高过主殿」这一读数的来源（`wallOffset`）被显式登记、不得被静默抹平。

### 16.4 采用口径读数（改后实测）
- 档位：**T1(grade 3) = 2 栋** `B-hall-main` / `C-hall-bed-main`；**T2(grade 2) = 6 栋**；入序 8/12（排除 2 城门 onWall + 2 亭 non-ladder kind）。
- **T1 > T2**：面积比 `2432/1800 = 1.3511 ≥ 1.10` · 檐高比 `7.71/6.60 = 1.1682 ≥ 1.05`（Δ **1.11m ≥ 0.05**）·主位比 `4032/2432 = **1.6579** ≥ 1.20`。
- **无倒挂**：R6a（任意档对）0 条 · R6b（全城非 onWall 建筑不得超过主殿 eaveAbs 10.71）0 条 · R6c（raw 高于主殿者必须全部 onWall）通过且**非恒真**（清单 8 栋非空）。
- **同级不重复**：每档内部 面积/eaveAbs 两列两两互异；`檐数` 最高档 min 2 > 次档 max 1（重檐 = 最高档形制特征）；`台基层数` 最大值**唯一**归主位（3 层），与 `TERRACES` 登记交叉一致。
- **白名单**：79 栋全部 `grade↔roofType` 合法，入序集 grade 3 均为 `doubleEaveHip`（**未为高度比改任何屋顶等级**，t22 教训）。

### 16.5 为何**不改体量**（量化交回，不得放宽容差）
三条可调路径都被硬约束堵死（逐条量化）：
1. **降城门到主殿以下**：south/north 需 **−4.16m**、west/east 需 **−1.20m**；二者 `terraceH` 已是 `0.4`（不可为负），
   降 `grade` 不足以达标（grade 2 仍 **21.42** > 20.48）且违反「屋顶等级不得为高度比而改」⇒ **不可行**。
2. **降角楼**：需 **−0.80m**，`terraceH` 已是 `0` ⇒ 只能缩跨度（26 → ≤21），动的是**城墙系统**体量（F 区视觉 + 区外判据）⇒ 不属本卡「中轴」目标。
3. **升主殿**：需 **+4.16m** ⇒ `terraceH 4.5 → ≈8.7`（三层台基模型 + `TERRACES`/`WK-B-terrace-*`/丹陛链 + 内景 `sillY` 不变式）
   或 `d 48 → ≥72.5`（内景/台基/广场几何）⇒ 一律外溢到**内景与 out-of-scope 判据**（`tests/interaction.test.mjs`、`tests/core.test.mjs`、`scripts/**`）。
⇒ 结论：**绝对高度「城门高过主殿」是墙制 + 口径的必然，不是体量序缺陷**；本卡按卡内授权
「若某栋受空间/形制约束无法达标 ⇒ **量化交回裁定，不得放宽容差**」交回，并把「**非 onWall 建筑不得超过主殿**」钉成常驻判据。

### 16.6 判据落地（只增不减）
- `tests/layout.test.mjs` 新增 **t38 块 18 项**：规格冻结与裕量 pin（1.10/1.05/0.05/1.20，**不得下调**）· R1 容差由数据推导 + 独立重算 ·
  R2 档位/计数独立重算 + 两级形状 + 冻结摘要不漂移 · R3/R4 逐对自行重算 · R4 口径（onWall 必须扣墙高）逐栋 ·
  R5 主位唯一与独立重算 · **R6a/b/c** 三条无倒挂（含「普查非恒真」）· 口径自洽（`eaveAbs+wallOffset===eaveHeight`）·
  同级不重复 · 檐数/台基层数（与 `TERRACES` 交叉）· 台账自证（用 config 令牌复算 eave/total 与记录逐值相等）· 白名单 ·
  **反例①** 朴素口径必须为红（口径必要性）· **反例②** 突变对照（把次档最小面积者过度定级 ⇒ 必红；恢复 ⇒ 必绿）· `LAYOUT_STATS` 副本一致。
  ⇒ 实测 `node tests/layout.test.mjs` = **exit 0 · `全部通过 ✓`（失败 0）**；t38 块内 **32 条** `eq/check` 判据。
  **判据活性证明**（防「断言没被执行」这类假绿）：把副本里 t38 的规格 pin 故意改成 `[9.9,9.9,9.9,9.9]` ⇒ 该文件 **exit 1** 并打印
  `✗ t38 规格：areaMargin / eaveMargin / minAbsEave / principalRatio 逐值 pin …`（副本 `work/t38-mutant-layout.test.mjs`，已删）。
  口径注记：该文件自带的行内计数（`layout.test.mjs：通过 N 项`）是**汇总小节处的子计数**（在文件中部打印，不含其后各块），
  **不得**当作全文件判据总数引用；权威判据是 **退出码 + `全部通过 ✓`**。
- `tests/zone-forecourt.test.mjs` 新增 **§3b 4 项（几何侧同轮）**：实测 `worldBounds.maxY` **序** = 登记 `totalHeight` 序 ·
  实测檐口高 = 登记 `eaveAbs`（±6mm）· B 区实测最高者**唯一**且 ≥ 次高 × `eaveMargin`（实测 25.635/16.074 = **1.5948**）·
  主殿为 B 区**唯一**三层台基 + **唯一**重檐（与区域实测台基段数 3、`TERRACES` 3 段交叉）· B 区无「非 onWall 却实测高于主殿登记总高」者。
  ⇒ 实测 `node tests/zone-forecourt.test.mjs` = **通过 43 / 43**（该文件由 harness runner 在末尾汇总，故 43 为其全量判据数；§3b 贡献 4 项）。

### 16.7 预算与「零几何改动」证据
- `node scripts/audit.mjs --enforce` = **exit 0**：主场景 **342 / 350**、B 62/70 · C 56/60 · D 49/56 · E 49/56 · **F 80 / 80**、可见三角面 425317 / 1.5M。
- 本卡**零几何改动**（只新增口径/规则与派生出口）⇒ 逐值对照：`work/probe-t38-ab.mjs` 对几何登记（SLOTS/TERRACES/WALKABLE/WALLS/OBSTACLES/ROADS/VIEWPOINTS/内景）取 **sha256 指纹**，
  把 t38 全部出口跑一遍后复取 ⇒ **逐字节相同** `092b92f6…3103`（证明 t38 代码路径**不可能**改几何/预算）；
  冻结计数与 t13 回执逐值一致：`SLOTS 79 · WALKABLE 175 · WALLS 60 · OBSTACLES 93 · TERRACES 4 · ROADS 97 · VIEWPOINTS 61 · FP_ROUTE 50 · 内景 43 · visitable 43`。
  ⇒ 「体量调整须并入既有合批桶/无冻结计数路径」这一条以**零改动**满足（无新增网格、无新增批次）。
- **并发窗口登记**：本卡执行期间 `CONFIG_VERSION` 由 **1.0.9 → 1.0.10**（他人卡）——本卡判据**全部读运行期值**（规格 pin 只 pin `AXIS_TIER_SPEC` 自己的裕量，不 pin config 版本），
  实测读数**未变**：`T1=2 / T2=6` · 面积比 **1.3511** · 檐高比 **1.1682**（Δ1.11m）· 主位比 **1.6579** · 倒挂 0 · `SLOTS 79 / WALKABLE 175 / OBSTACLES 93 / ROADS 97` 不变。

### 16.8 护栏 / 可达性 / 内景 / §12
- **四层护栏**（`layout.test.mjs` 全绿）：`t126` 遮蔽 0 命中 · `t131` 通路 43 处内景缺链 0 · `t134` 格级 43 处门中心/门带一致 · `t159` F3 双向 55 带 / 660 对**失败 0**。
- `node tests/walk-reachability.test.mjs`：**t140 全部通过**（细口径 `cellSize:1` 不可达 = **0**；`LAYOUT 1.1.26`）。
- **43 栋内景不回退**：`verify-experience` A3 ✓（`interior 43` / `fp-spawn 5` / `zone 7` / 共 61）、B4 ✓（63/63，0 具名例外）。
- **§12 可读性**：本卡零几何/零材质改动 ⇒ 画面不可能变化；24 张（8 视角 × 3 时辰）矩阵已按 F1 指定命令重建（见 §16.9 读数）。

### 16.9 未运行项 / 并发窗口（如实登记，不得当成通过）
- `tests/run.mjs`（全量）：本轮**未跑全量**（时间预算）；已单独跑 `layout` / `zone-forecourt` / `walk-reachability` / `core.test` / `core-collision` / `kit` / `verify-experience` / `audit --enforce`。
- **`tests/core.test.mjs` 1 项红（非本卡）**：`第一人称：最近 fp-spawn 出生…出生点应为 fp-spawn，实际 null`。
  证据：该断言读 **`src/core/camera.js`** 的出生点选择，而 `src/core/camera.js` 当前有 **395 行未提交改动**（他人 in-flight 卡）；
  本卡 diff **不含** `VIEWPOINTS`/`FP_ROUTE`/`camera.js`（`layout.test` 的 A3 pin 与探针指纹均未变）⇒ 判定为**并发在制品**，归 camera 责任方。
- **`docs/shots/**` 24 张矩阵（§12 读数）**：本卡为**回填**（t13 轮曾以 `--view=focus` 单张重建把 manifest 覆盖成 1 条）——
  已按 F1 指定命令 `node scripts/shot.mjs --view=all --preset=all --keep-invalid` 重跑：**17 / 24 出图并 §12 PASS**，
  其中**原先为红的 `fp/{golden,dusk,night}` 与 `orbit/{dusk,night}` 本轮 PASS**；**7 / 24 不可得**（`interior/{golden,dusk,night}`、`zone/{golden,dusk}`、`focus/night` 等）
  原因是**并发负载下页面装配超时**（`data-palace-loaded=false` / 「无图可统计」），属**环境**而非判据回归 —— 本卡零几何/零材质/零相机改动，
  画面不可能因此变化（见 §16.7 指纹证明）。`docs/shots/manifest.json` 是**多卡并发写入的生成物**（本轮读出 35 条，含并发叠加的重复项），非本卡交付物。
- 浏览器内第一人称实走、塔楼接线、`verify-completeness` 全量（含 headless Chrome）本轮未测（本卡零几何，风险面为 0）。

---

## 16. t48：院墙**归并到权威段** + 中轴**彻底打通**（用户裁定 P0）

### 16.1 ① 可视院墙 → 权威归并段（每段边界墙恰由一个区域建造）

- `src/core/layout-slice.js` 抽出 **`deriveWallRuns(walls,{helpers})`**（归并键 `轴|墙线|厚度|墙高`，**不含 owner**）+
  `wallRunsForZone(zoneId)`；`deriveWallColliders()` 改为薄映射 ⇒ **碰撞输出逐值不变**（规范串哈希 **d7573f43**，88 盒）。
- `src/zones/forecourt.js`（B）与 `src/zones/inner-palace.js`（C）改为消费 `wallRunsForZone` 的**子区间**
  （`seg.owner === 本区` 才建），`baseY/height` 取子区间并集 ⇒ 跨区段整片归代表区、垂直跨度覆盖两侧地坪。
  D/E 未改（其同线墙**不重叠**、无共面重复；改则牵动 out-of-scope 的 `zone-west.test.mjs` 16 段 pin）。
- **A/B 探针**（`/tmp/t48-probe3.mjs`，可复现）：改前共面重复 **4 对同区（各 192m）**；改后 **0 对**（跨区 0）。
- **A/B 预算**（`/tmp/t48-ab` 逐条墙桩）：主场景调用 **344→344**（B62/C56/D49/E51/F80 同值）· 三角面 **426,925 → 425,593（−1,332）**。

### 16.2 ② 中轴彻底打通（**数据层**，12 段跨轴院墙中央整段删除）

- `src/shared/layout.js` 新增 `axisCutoutOf/splitAxisWall`：`W = max(最宽中央门洞净宽 + 2×门垛, 该墙线中轴通行道宽 + 2×柱廊占位)`
  （门垛 = `MODULES.courtyardWallThickness` 1.2；柱廊占位 = `MODULES.corridorWidth` 3.6；通行道宽 = `ROADS` 里跨该线且 x 跨 0 的段最大 `width`）。
- 落地：跨轴墙拆成**西段（保留原 id）+ 东段（`<id>-east`）**，`computeOpenings()` 按各段跨度重算门洞
  ⇒ **碰撞层（`deriveWallColliders` 从 WALLS 派生）与可视层自动跟随**（既无隐形墙、也无"看得见走不过去"）。

| 墙线 z | W | 门洞→W | 中轴道 | 西段 | 东段 | 残余最短 |
| --- | --- | --- | --- | --- | --- | --- |
| -400 | **31.2** | 26 | 24 | [-96,-15.6] 80.4m | [15.6,96] 80.4m | 80.4m |
| -180 | **29.2** | 22 | 22 | [-96,-14.6] 81.4m | [14.6,96] 81.4m | 81.4m |
| -40 | **23.2** | 16 | 16 | [-96,-11.6] 84.4m | [11.6,96] 84.4m | 84.4m |
| 80 | **29.2** | 26 | 22 | [-96,-14.6] 81.4m | [14.6,96] 81.4m | 81.4m |
| 142 | **25.2** | 18 | 18 | [-96,-12.6] 83.4m | [12.6,96] 83.4m | 83.4m |
| 216 | **17.2** | 10 | 10 | [-96,-8.6] 87.4m | [8.6,96] 87.4m | 87.4m |
| 300 | **10.4** | 8 | 0 | [-96,-5.2] 90.8m | [5.2,96] 90.8m | 90.8m |

- **残余段最短 80.4m ≫ 1m** ⇒ W 未取大（无需回退）；宫墙 `WALL-CITY-south/north` **未动**。
- `WALLS 60 → 72`（courtWall 56 → 68）· `LAYOUT_VERSION 1.1.28 → **1.1.29**`（在 t41 理由后**追加** t48 理由，t41 的 `STOREY_BAND_*` 段完整保留 ✓）。
- **A/B 预算**（`/tmp/t48-ab2` 关闭切口）：调用 **345→345**（同值）· 三角面 **425,977 → 425,941（−36）**。

### 16.3 「数据 4 条 vs 建造 2 段」——对主理人观察的澄清（附证据）

5 个重叠边界（z=-180/-40/80/142/216）在**数据层**各 4 条记录（= 2 个院落 × 中轴拆分的左右两半，**这是设计输入**，
每个院落必须登记自己的边界墙，`courtyard.wallIds` / C 区逐条墙碰撞 / 碰撞盒的 `wallIds` 归属都依赖它）；
在**可视层**各 **2 段**（西 + 东），且每段的 `sources` 已列出**全部贡献者**、`baseY/topY` 取并集：

```
[B] line=-180 [-96,-14.6] y[0,4.2] ← CY-B-plaza-wall-north + CY-B-throne-wall-south      （合并层已去掉）
[B] line=-180 [14.6,96]  y[0,4.2] ← CY-B-plaza-wall-north-east + CY-B-throne-wall-south-east
[B] line=80  [-96,-14.6] y[0,5.1] ← CY-B-rear-wall-north + CY-C-front-wall-south          （跨区并集：0 … 0.9+4.2）
[C] line=142 [-96,-12.6] y[0.9,5.1] ← CY-C-front-wall-north + CY-C-main-wall-south
```

⇒ 「重复的那一层」在**建造/碰撞层已去掉**；数据层的双登记是归并的**输入**（不是可见重复）。

### 16.4 常驻守卫（数据推导，缺失即失败）+ 突变证明

`tests/layout.test.mjs` 新增 **4 条 t48 判据**：① 归并完备（无两段 run 共享归并键）② 单建造者（每子区间恰一 owner ∧ 各区之和 = 总数）
③ 中轴切口逐段 `W` 不等式 + 残余 ≥1m（24 段）④ 7 条切口墙线在中央 W 内**没有任何墙记录**。
突变（隔离副本）：把 `owner` 加回归并键 ⇒ ① 必红（两段共享键）；恢复 ⇒ 绿（本卡实测 31 段 / 54 子区间 / 0 重复键）。

### 16.5 verify 读数（6 条全绿）与**越界红（原样交回）**

| 命令 | 结果 |
| --- | --- |
| `layout.test` | **exit 0 · 1864 项 / 0 失败**（含 4 条 t48 守卫） |
| `zone-forecourt` | **exit 0 · 43/43** |
| `zone-inner` | **exit 0 · 36/36** |
| `core-walls` | **exit 0 · 18/18** |
| `walk-reachability` | **exit 0** · t140 全部通过 ✓（43/43 内景 + 49/49 走查段未回退） |
| `audit --enforce` | **exit 0** · 主场景 **345/350** · 三角面 **425,941** |

**越界红（不在本卡 inScope，原样交回，未越界改）**：
- `tests/core.test.mjs`：`✗ 灰盒满足全部契约字段与数量（… LAYOUT 1.1.29）：terrace 面应为 8 条…实际 80`（= t37/t39 塔楼 72 面用 `kind:'terrace'` 所致）；另 `✗ 夜景实时灯 ≤ 上限…远端灯 829.54 不应是实时点光`（光照，与本卡无关）。
- `scripts/verify-completeness.mjs`：`[FAIL] 3.2 60 段墙…6 段偏弱：CY-C-front/main/rear-wall-{west,east}`（本卡把 C 的 x=±96 段交给 B 建并集后，脚本按"逐条墙"射线复算 ⇒ 计数与口径需同步）；`[FAIL] 5.4b`（既存数据集例外）；`[FAIL] 6.1 机位…focus-extra 6`（t39 塔顶机位 +1，既存）。
- `tests/verify-experience.test.mjs`：`✗ A3 机位普查…focus-extra 7 ≠ 6`（同上）；`✗ E3 院墙连接连续：56 段院墙…CY-B-plaza 墙数 6 ≠ wallIds`（本卡拆分/归并后的计数口径）；`✗ F1`（既存截图矩阵）。
- `tests/zone-east.test.mjs`：`✗ 可行走面…WK-T-watchtower-3-L1-ringN 标高应等于东宫苑地坪：期望 0.4，实际 1.24`（t39 塔楼面；该测试 0 处提及塔楼 ⇒ 断言早于 t39）。
- `tests/interaction.test.mjs`：`✗ E17b 结构锚定自证…构造检查：endMissing 中起始锚点仍存在`（**合成源码**自证，与本卡文件无关）。

### 16.6 未完成（如实登记）

- **③ 视觉证据（≥2 机位 A/B + judgeShot PASS + manifest）未运行**：本卡预算已耗尽（距硬停 ~1h），未启动浏览器侧截图。
  剩余量化：需 1 个中轴正视（如 `?view=axis`）+ 1 个含门洞近景（`?focus=CY-B-plaza-wall-south`）各 A/B 两张，
  `node scripts/shot.mjs … --keep-invalid` + `judgeShot`；旧图不删。
- **未改**：`src/core/renderer.js`、`src/kit/buildings.js`、`src/shared/config.js`（阈值/§8.2 门禁）、`tests/core-antialias.test.mjs`；
  D/E 两区可视建造（无重叠重复，改则牵动 out-of-scope pin）。
