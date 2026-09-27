# 回执 · t131 形式收口：真实失败原因（F8/F4 交回 core）+ 守卫产物 + 承接链（t163）

任务：`t163`（repair，形式收口，attempt 1）· 执行者：zone-garden（attempt_id `e7015d7b-0fdd-4838-88ae-7ed3c2e50a21`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
本卡 inScope：**仅新建本文件**。**未改任何代码/测试/契约**；**未改写任何既有回执与产物**（只读复核 + 新建收口记录）。
时间：**2026-09-26 20:58 PDT** · 当前树：`LAYOUT 1.1.20` · `CONFIG_VERSION 1.0.7` · `CONTRACTS v1.0.22`（下同；三者均为本卡【实测】读自 `src/shared/config.js:13` / `docs/CONTRACTS.md:7`）

平台标志：`t131 failed without a follow-up repair` —— 本文件即其形式收口。

> **记号约定（本文件严格区分两类事实）**
> - **【实测】** = 本卡在**当前树**上亲自跑出来的读数（含命令与原样输出）。
> - **【转录】** = 转录自既有回执/报告/契约的**历史事实**，逐条给出出处（`file:line` 或标题原文）；本卡**不复算、不改写**。
> - **【不得夸大】** = 本文件明确**不声称**的结论。

---

## 1. t131 判 failed 的**真实原因**（【转录】+ 归因分层）

### 1.1 实质原因：所选路径的根因在 **core 的高程解析**，不在 t131 的 inScope ⇒ 按规**量化交回**

t131 要闭合的是 **F4/F6/F8 集合**（`B-side-west-main` / `B-side-east-main` / `C-side-west-main` / `C-side-east-main` 四栋"有门却走不进去"）。其根因**不在布局数据里"少一条面"**，而在**同位置取高面**的生产语义：

| 环节 | 机制（出处） |
| --- | --- |
| 取高 | `src/shared/layout.js` `floorYAt(x,z)`：`if (y === null \|\| s.y > y) y = s.y` ⇒ **同一平面位置取最高面** |
| 图节点高度 | `src/interaction/walk-graph.js` `sample(col,row)`：节点高度 = `solver.probe(x,z,null).surfaceY` = `floorYAt` 的结果 |
| 有向可跨 | `src/interaction/walk-graph.js` `canStep(a,b)`：`b.y − a.y > 0.5` 拒上行；`< −0.6` 拒下行（**有向**） |
| 求解器 | `src/interaction/walk-solver.js` `probe()`：`surfaceY = groundAt(x,z) = layout.floorYAt` |

⇒ **低面若在同格被高面盖住，该格节点高度就是高面的 y；从低面相邻格过去必然 `stepTooHigh`。**
出处原文：`docs/report-walk-rule.md` §1（t132 只读探针报告）——**"这就是 t131 的面级链完整而图仍不可达的原因。"**

**交回口径（可核）**：`docs/report-walk-rule.md:54`
> **`cellSize:1` 生产图上真正不可达（且未声明 `blockedBy`）：4** —— `B-side-west-main` / `B-side-east-main` / `C-side-west-main` / `C-side-east-main`（**= t131 交回的 F4/F6/F8 集合**）

同报告 §2 的量化：访问格 **79,738** · "低面被高面压住"命中 **84,233** 次 · **(低面, 高面) 对 235** · 链上面被压的槽位 **24** · **真正不可达 4** ⇒ **"被压 ≠ 必然不可达"**（只有 4/24 真断链）。
`docs/CONTRACTS.md` §12.1.2 的注解亦明确：**"改取高规则属高影响面变更，必须先量化（`scripts/probe-walk-rule.mjs` + `docs/report-walk-rule.md`）"** —— 即该修正**不属于区域/布局侧可自行拍板的改动**。

**⇒ t131 在此项上"按规办事"：既未越界改 `src/core/**` 的取高语义，也未猜段位硬凑可达**，而是把 4 栋（F4/F6/F8）连机制带数字交回。

### 1.2 机械触发：把它判红的是**外部 pin**，不是它自己引入的缺陷

t131 的加法修复（给 `E-court3-hall` 补 2 级门外台阶）使 `WALKABLE 169 → 171`、`LAYOUT_VERSION 1.1.15 → 1.1.16`（`ground 62 → 64`）。
而 `tests/core.test.mjs` 有一条**冻结 pin**（`期望 169，实际 171` / `LAYOUT 1.1.15`）由**别的卡**维护，且该文件**不在 t131 的机器 inScope** ⇒ 红项来自"计数随布局递增 + 卡间时序"，并非 t131 引入的几何缺陷。

出处：`docs/handoff-retire-t122.md:21`（**"t131 给 `E-court3-hall` 补 2 级台阶"**）、`docs/report-walk-rule.md:134-135`
> **唯一陈旧处在 `tests/core.test.mjs`**（仍 169 / `LAYOUT 1.1.15`）⇒ 需一张最小 pin 卡（精确相等、不得改 `>=`/包含式）。

`docs/CONTRACTS.md` §12.1.2 末句同口径：**"`WALKABLE` 计数随布局递增，core 侧冻结 pin（`tests/core.test.mjs`）需同步"**。
**⇒ 两层的归因都指向"根因不在 t131 的 inScope"**：实质根因在 core 取高语义；机械触发是他人维护的计数 pin。

---

## 2. t131 的产物已落地且有价值（【实测】当前树仍在 + 【转录】首跑抓缺口）

### 2.1 产物：`t131 通路存在守卫`（门洞三段链），**至今是三条/四条护栏之一**

- 位置：`tests/layout.test.mjs`（`CONTRACTS v1.0.18` 起登记为 `:882`，后因两轮落地**行号漂移到 `:905`**，契约 §12.1.3 已"只更正坐标引用、条款语义未改"）。
- 标题原文（`docs/CONTRACTS.md:1000`）：**「`t131`：通路存在守卫（门洞三段链：门外接近面 → 通道面 → 室内面）」**
- 不变式：**每处内景门洞的「门外接近面 → 通道面 → 室内面」链必须存在且相邻可跨**；全城 **43 处内景逐栋**核对；**精确断言（缺一即红）**，**不得**放宽阈值 / 改 `>=` / 删断言。
- 契约地位：`§12.1.2`（v1.0.18，两条）→ `§12.1.3`（v1.0.19，三条：面级 `:839`(t128) / **链级 `:905`(t131)** / 格级 `:930`(t134)）→ `§12.1.4`（v1.0.20，四条：+ 结果级 `tests/walk-reachability.test.mjs`(t140)）。

**【实测】当前树读数**（`node tests/layout.test.mjs` → 通过 **1736 项，失败 0**）：
```text
- t128：遮蔽守卫生效（命中 0 条）；C-bed-terrace 5 段；WALKABLE 171
- t131 通路存在守卫：43 处内景逐栋核对，缺失链 0 条
- t134 格级守卫：43 处门中心/门带解析高度一致（样例 B-gate-front:0.45/0.45 , B-hall-main:4.5/4.5 …）；4 栋逐跳 canStep ✓
- t159 F3 双向断言：带 55 条 · 链内相邻对 660 · 失败 0（分工：本层查几何/链路，图搜索层查真实正反可达）
```

### 2.2 首跑即抓出真实缺口 `E-court3-hall`，并**加法**修复

`docs/report-walk-rule.md:135` 与 `docs/handoff-t2-expectations.md:250` 同口径记录：t131 的守卫**首次运行即发现 `E-court3-hall` 的门洞三段链缺失**，随后**加法**补齐（门外 2 级台阶）⇒ `WALKABLE 169 → 171`（`ground 62 → 64`）、`LAYOUT 1.1.15 → 1.1.16`。
当前树 `src/shared/layout.js:28` 的版本头注仍**逐条保留**该贡献：**"…// t131：通路存在守卫 + 加法补 E-court3-hall 门外台阶 // t128：…"**（【实测】原样引用）。
**⇒ 一个"守卫类"产物能在首跑抓到别人没看见的真实缺口，这本身就是它的价值证明。**

---

## 3. 承接链：t132 → t145 → t151 → t158（【转录】逐条出处 + 各自"没做到什么"）

| 卡 | 做了什么 | 版本/位置 | **它没有做到什么**（不得由本文件或后续叙述抹去） |
| --- | --- | --- | --- |
| **t132** | **只读探针**定位机制：`scripts/probe-walk-rule.mjs` + `docs/report-walk-rule.md`；量化"被压 235 对 / 真不可达 4"、给两案 | 只读诊断，无几何改动 | 只诊断，**不修**（这正是它的交付边界） |
| **t145** | **C 两栋有界开槽**：`WK-C-side-{west,east}-main-transition-2`（`ground`，**y=0.9**），C 两殿台基↔走廊 0.9↔1.3 恢复相邻 | `LAYOUT 1.1.18`（`docs/report-completeness.md` §22） | **未闭合全局连通**（同节逐格底数据）；其当时报的"43/43"**不可信**——`docs/report-false-green-sweep.md` #6 指出该探针用 `if (!p)` 而非 `.ok`（同类恒真缺陷） |
| **t151** | **C 两殿门外加法下坡带**（未被覆盖窗口内 1.9/1.4）⇒ 43/43 内景**能下到** | `LAYOUT 1.1.19`（`docs/report-completeness.md` §23） | **造出两条单向陷阱**（回程需上跨 >0.5m ⇒ `path(点→起点)` 失败）；其"43/43 可达"只覆盖"去程"，未覆盖"回得来" |
| **t158** | **float32 裕量梯链**：把 1.9/1.4 改为逐跳 **≤0.48** 的裕量组合（**1.7↔1.3↔1.0↔1.45↔1.92↔2.4**），并规范化过渡矩形 | `LAYOUT 1.1.20`；`docs/CONTRACTS.md` **§12.1.4.5（v1.0.22）** `src/shared/layout.js:1093/1106` | 其"8 处单向带"的**计数**来自其卡面/树内注释（`layout.js:1093` 原样写着 **"…⇒ canStep 拒上行 ⇒ 8 处单向带"**）——**本卡未独立复算该数字**，只复核了当前树"单向 0 / 分量护栏全绿" |

**t158 的机制（树内注释原样）**：`fround(2.4) − fround(1.9) = 0.5000001192 > 0.5` ⇒ 图侧拒上行（float64 的 `2.4−1.9=0.5` 曾骗过两次独立探针）；新契约 §12.1.4.5 因此立规：**可跨判定必须以图侧 `Float32Array` 精度为准并留裕量，禁止"刚好等于阈值"的级差**。
**t158 的四项验收（【转录】契约 §12.1.4.5:1128）**：图搜索**单向 0**（F12 55 处过渡带读数）· ⓠ 分量护栏全绿 · `layout.test` 全绿 · `interaction.test` 的 **E13/E15/E16/F27 转绿**。

---

## 4. 当前树实测（【实测】，本卡亲自跑，20:58 PDT）

### 4.1 版本与计数（`LAYOUT 1.1.20` / `WALKABLE 171`）

```text
$ node --input-type=module -e "import * as L from 'file:///…/imperial-palace-dsh-1.1b/src/shared/layout.js'; /* 打印 LAYOUT_VERSION / WALKABLE 分 kind 计数 / LAYOUT_STATS */"
LAYOUT_VERSION 1.1.20
WALKABLE 171  {"outerTerrain":4,"ground":68,"bridgeDeck":4,"gardenGround":1,"terrace":8,"interior":43,"passage":43}
VIEWPOINTS 61  FP_ROUTE 50  interior 43  passage 43
interiorByZone B=10 C=9 D=8 E=9 F=7        # 合计 43
LAYOUT_STATS: slotCount 67 · visitableCount 43 · courtyardCount 14 · connectorCount 32 · roadCount 95 · wallSegmentCount 60 · obstacleCount 81 · walkableCount 171
```
（4+68+4+1+8+43+43 = **171** ✓）

### 4.2 三层/四层护栏（`node tests/layout.test.mjs` → 通过 1736 项，失败 0）

| # | 层级 | 承载者 | 当前树读数 |
| --- | --- | --- | --- |
| ① | 面级（遮蔽） | `tests/layout.test.mjs`（t128） | **t128：遮蔽守卫生效（命中 0 条）** ✓ |
| ② | 链级（通路） | `tests/layout.test.mjs`（**t131**） | **43 处内景逐栋核对，缺失链 0 条** ✓ |
| ③ | 格级（取高） | `tests/layout.test.mjs`（t134） | **43 处门中心/门带解析高度一致；4 栋逐跳 canStep ✓** |
| ④ | 结果级（真能走到） | `tests/walk-reachability.test.mjs`（t140） | 见 §4.3 ✓ |
| 附 | 双向（单向陷阱） | `tests/layout.test.mjs`（t159 F3） | **带 55 条 · 链内相邻对 660 · 失败 0** ✓ |

### 4.3 结果级可达性（`node tests/walk-reachability.test.mjs` → **全部通过 ✓**，exit 0）

```text
t140 结果级可达性断言（生产 solver + 真实建图；只读）
  LAYOUT 1.1.20 · 可行走面 171 · maxStepHeight 0.5 · snapDownDistance 0.6
  口径：细 = cellSize:1（显式提额 maxCells=3,000,000）；粗 = cellSize:2（默认上限内）
  基线：有门槽位 63 · 图中不可达（且未声明 blockedBy）细口径 0 / 粗口径 2 · 存在「门带被更高面覆盖」0 · 影响可达性（不可达 ∧ 被压）0
  ✓ 细口径全城门洞「不可达 = 0」（精确；含声明 blockedBy 的 0 处例外）
  ✓ 粗口径不可达集合 === 已登记集合（新增即红）
  ✓ 细口径逐门「通道面 ↔ 室内面」同层或可跨
  ✓ `path()` 返回对象（不得再用 `!= null` 作可达判据）
  ✓ t153 ⓪ 分量级护栏（细口径=唯一过关口径）：94 条门外接近类面命中 0（粗口径=非权威：命中 7，已登记）
t140 结果：全部通过 ✓
```

### 4.4 唯一 verify：`node scripts/audit.mjs --enforce` → **exit 0**

```text
$ cd "/Users/…/imperial-palace-dsh-1.1b" && node scripts/audit.mjs --enforce
 主场景绘制调用   : 333 / 上限 350  ✓
 分区 B         : 62 / 预算 70  ✓
 分区 C         : 55 / 预算 60  ✓
 分区 D         : 49 / 预算 56  ✓
 分区 E         : 49 / 预算 56  ✓
 分区 F         : 72 / 预算 80  ✓
 可见三角面       : 306737 / 上限 1500000  ✓
 y0 canonical 自检：81 条障碍，下钳 15 / 保持 66（来源 {"floorYAt":15,"layout":66,"null":0}） ✓
 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
$ echo $?
0
```

---

## 5. 【不得夸大】本文件明确**不**声称的结论

1. **t131 的目标（让 F4/F6/F8 那几栋"有门能走进"）不是由 t131 完成的**——它是 **t132（诊断定位）→ t145（有界开槽）→ t151（加法下坡带）→ t158（float32 裕量梯链）** 这一串卡片接续完成的；t131 的贡献只是**通路存在守卫（②）+ `E-court3-hall` 的加法补**以及**把根因量化交回**。
2. **t131 判 failed 的根因不在它自己**：实质根因在 **core 的同位置取高语义**（§1.1），机械触发是**他人维护的计数 pin**（§1.2）；但**这不等于"t131 已经完成"**——它**没有**完成其目标，目标由上述承接链完成。
3. **历史不可改写**：`t145` 当时报的"全局 43/43"已被 `docs/report-false-green-sweep.md` 判为**不可信**（`if (!p)` 恒真）；`t151` 造出过**两条单向陷阱**。这两条**保留在记录里**，不以"最终绿了"为理由回收。
4. **本卡未复算的数字**：§3 表中"**8 处单向带**"来自卡面与 `src/shared/layout.js:1093` 的树内注释，**本卡未独立复算**；本卡只证明**当前树**上"单向 0 / 分量护栏全绿 / 结果级细口径不可达 0"。
5. **本卡只做形式收口**：不改代码、不改测试、不改契约、不改任何既有回执；§1–§3 的机制与历史均为**【转录】并注明出处**，仅 §4 是**【实测】**。

---

## 6. 单条 verify（本卡）

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b" && node scripts/audit.mjs --enforce
```
→ **exit 0**（原样输出见 §4.4）。本卡 inScope 仅本文件，**未触碰 `src/**`、`tests/**`、`docs/CONTRACTS.md`**。

---

## 7. 未验证 / 边界（如实）

1. **t131 自身当次的执行日志未一手复核**：其 attempt 级原始输出未在本卡可见范围内，§1 的失败归因**转录自** `docs/handoff-retire-t122.md:21`、`docs/report-walk-rule.md:25/:54/:134-135`、`docs/CONTRACTS.md` §12.1.2/§12.1.3 三处**互相印证**的记录；本卡未找到 t131 的独立回执文件（`docs/` 与 `docs/handoffs/` 下无 `*t131*` 命名文件）。
2. **未跑整套 `tests/run.mjs`**：本卡只跑与主题相关的 `layout.test.mjs`、`walk-reachability.test.mjs` 与唯一 verify `audit --enforce`（三者在当前树均绿）；其余套件当前状态未在本卡登记。
3. **行号引用会漂移**：`CONTRACTS` §12.1.3 已声明 `:688/:882 → :839/:905` 的更正；本文件采用**已更正**的坐标，并在 §2.1 注明历史行号。
4. **`8 处单向带`未复算**（见 §5.4）；**t158 的"interaction E13/E15/E16/F27 转绿"**亦为【转录】契约记录，本卡未重跑 `interaction.test.mjs`。
5. **平台标志的语义边界**：本文件只提供"真实失败原因 + 产物 + 承接链 + 当前树读数"的形式收口材料；**是否据此撤销 `t131 failed without a follow-up repair` 标志，属主理人裁定**，本卡不自行宣布。
