# 回执 · t10（`e-ladder`）—— E 侧门外阶梯留裕量，闭合 5.3 的「4 点不可达」

> **结论（先说）**：**已闭合**。`LAYOUT 1.1.21 → 1.1.22`；`E-court1-hall`（文华殿）/ `E-court2-hall`（陈设正堂）台基 `1.0 → 0.9`
> ⇒ `sillY` / 内景地面 / 门洞通道面 **1.4 → 1.30**、门外梯链 `1.40↔0.90↔0.40` ⇒ **`1.30↔0.85↔0.40`**（逐跳 **0.45**）。
> **整城 1m 冷口径** `connected()` **99 点同一连通分量 ✓**（原 4 点：`文华殿门内` / `陈设正堂门内` / `VP-E-court1-hall-interior` / `VP-E-court2-hall-interior`）。
> **计数零变化**：`WALKABLE` 仍 **171**、过渡面仍 **49** 级、`SLOTS` 79 / `OBSTACLES` 93 / 内景 43 / `VIEWPOINTS` 61 / `FP_ROUTE` 50 全不变。

## 1. 只读取证（先证后改）：断点到底在哪

工具：`scripts/probe-e-ladder.mjs`（**只读**，不写文件）。口径三要素写明在文件头：
来源 = **真实 5 区域模块 + core registry**（与 `verify-completeness` 5.3 同源）；阈值 = `config.INTERACTION.step`（上 0.5 / 下 0.6，含界 +1e-9）；
高度读数 = **图侧 `Float32Array`**（`graph.sample` 缓存后即 float32；**首次取样返回 `solver.probe` 的 float64**）。

| 观测 | 读数 |
| --- | --- |
| 高度序列（改前） | `通道面 1.4 ↔ transition-1 0.9 ↔ 门外地面 0.4` ⇒ 逐跳 **恰 0.500**（float64 与 float32 皆“含界通过”） |
| 局部口径（同区室外邻点 → 内景机位） | **✓ 可达**（与 t77 §24.2 的“局部口径 ✓”一致） |
| 整城口径 `connected()`（改前，冷启动） | **✗ 4 点 differentComponent** |
| 同一张图再 `flood()` 一次（暖） | **✓ 全可达**；`visited` **722111（冷）vs 723785（暖）** |
| 冷 flood 断口定位（暖可达 ∧ 冷不可达 ∧ 邻格冷可达） | `0.9@(237,z) → 1.4@(238,z)`，且**当前缓存态 `canStep=true`** ⇒ 同一格对冷拒暖放 |
| 机制复算 | `1.4 − fround(0.9) = **0.5000000238418579** > 0.5 + 1e-9` ⇒ **冷拒**；`fround(1.4) − fround(0.9) = 0.5` ⇒ **暖放行** |

⇒ 断点**确实**在 E 侧梯链，但病因不是“几何不可走”，而是 **§12.1.4.5 禁止的「刚好等于阈值」级差** × **图侧 float64/float32 混合读数**
（`walk-graph.sample()` 首取 double、缓存 float；t77-F16 登记项）。**未动任何阈值**。

## 2. 修法（几何留裕量，加法最小）

| 项 | 改前 | 改后 |
| --- | --- | --- |
| `E-court1-hall` / `E-court2-hall` `terraceH` | 1.0 | **0.9**（与同区 `E-court4-hall` 统一） |
| `sillY` / `WK-*-interior.y` / `WK-*-door-passage.y` | 1.4 | **1.30**（三者同源，自动一致） |
| 门外梯链 | `1.40 ↔ 0.90 ↔ 0.40`（逐跳 0.500） | **`1.30 ↔ 0.85 ↔ 0.40`**（逐跳 **0.45**；float32 侧 0.449999928 / 0.450000018，距阈值 ≥0.0499） |
| 级数 / 过渡面数 / `WALKABLE` | `ceil(1.0/0.5)=2` / 49 / 171 | `ceil(0.9/0.5)=2` / **49** / **171**（零变化） |

- 采用 t77-F14 的**备选修法 (b)**「把内景地面调到 1.30 并同步 `sillY`」——**不新增任何可行走面**（卡内建议的三级链会 +2 面 ⇒ 需改 t102 的级数判据与 `core.test` 的 171 pin，属更大 ripple）。
- 「**不被取高**」实测：`x=236` 格覆盖面 `transition-1@0.85 + WK-E-ground@0.4 + transition-2@0.4` ⇒ 顶层 = **0.85** ✓；`x=238` ⇒ 顶层 = **1.30**（通道面）✓。
- 「**双向**」实测：逐对 `canStep` 上下双向均 true（上 0.450000018 / 下 0.450000018 等）。
- 槽位字面量 `door: { … sillY }` 按**既有约定**存的是**相对台基高**（`S()` 实际按 `zoneGroundY + baseY` 派生，
  与字面量无关——全库同此惯例）⇒ 随 `terraceH` 同步写为 `0.9`，避免字面量与派生值口径混淆（**无功能影响**，实测 `slot.door.sillY` 仍 = 1.3）。

## 3. 判据（只增不减；登记与几何同轮）

| 位置 | 变更 |
| --- | --- |
| `tests/layout.test.mjs:73` | 版本 pin `1.1.21 → 1.1.22` |
| `tests/layout.test.mjs`（t102 块） | Δ pin：`E-court1-hall/E-court2-hall` `1.0 → 0.9`（附 t10 理由；级数公式 `ceil(|Δ|/0.5)` 不变 ⇒ 49 级不变） |
| `tests/layout.test.mjs`（t75 块） | 内景包围盒冻结哈希 `0x51d2348e → 0xf5814450`（差异**仅**来自 E 两栋内景地面 1.4→1.3，标题写明） |
| `tests/layout.test.mjs`（**新增 t10 块**） | ① E 两栋逐跳**双向** \|Δ\| ≤ 0.45（float32 ≤ 0.45+5e-8）**且距阈值裕量 ≥0.04**、**禁止 = 0.5 等值**；② 内景面 = 通道面 = `区域地坪 + baseY`；③ 三栋台基统一 0.9；④ 未新增/未删除 E 侧过渡面（仍 4 级） |
| `docs/CONTRACTS.md`（`v1.0.24`） | §12.1.4.5 追加「第二次应用（t10）」+ 头部版本表/对应关系对齐运行时读出值 `1.0.7 / 1.1.22 / 1.0.1` |

## 4. 门禁实测（`LAYOUT 1.1.22`）

| 命令 | 结果 |
| --- | --- |
| `node tests/layout.test.mjs` | **exit 0** —— 失败 **0**；t10 行：`[1.3 → 0.85 → 0.4 → 0.4]`、`WALKABLE 171` |
| `node tests/walk-reachability.test.mjs` | **exit 0** —— `t140 结果：全部通过 ✓`；t153 ⓪ 细口径命中 **0** / 粗口径 **7**（= 已登记伪影集合，未新增） |
| `node scripts/audit.mjs --enforce` | **exit 0** —— 主场景 **341 / 350**、分区 F **80 / 80**、`y0 canonical` **93 条（下钳 15 / 保持 78）✓** |
| `node tests/interaction.test.mjs` | **exit 0** —— **70 / 70**；**✓ E13** · **✓ E15** · **✓ E16** · **✓ F27** |
| `node scripts/probe-e-ladder.mjs`（整城 1m 冷口径） | **✓ 99 点同一连通分量**（改前为 ✗ 4 点）—— 4 点可达的直接断言 |

## 5. 未闭合同类项（**如实登记，不在本卡授权内**）

`B-hall-mid`（Δ=2.0，n=4 ⇒ 逐跳 **0.5**）、`B-side-{west,east}-main`（Δ=±1.5，n=3 ⇒ 逐跳 **0.5**）——
与 E 侧**同一 §12.1.4.5 禁止项**，当前冷口径可达（5.3 不再报它们）但同样对调用历史敏感。
本卡**未动**（不在 t10 范围，且会牵动 B 区几何/区域测试）；两条正解：几何留裕量（同本卡做法）或 **t77-F16 / t12**（`walk-graph.heights` 统一精度）。

## 6. 命令清单（可复跑）

```
node scripts/probe-e-ladder.mjs            # 整城 1m 冷口径连通性 + 断点前沿（只读）
node scripts/probe-e-ladder.mjs --local    # 逐格剖面 + 相邻格 canStep 原因码
node scripts/probe-e-ladder.mjs --flip     # 冷/暖翻转定位（t77-F16 现象取证）
node tests/layout.test.mjs                 # exit 0
node tests/walk-reachability.test.mjs      # exit 0
node scripts/audit.mjs --enforce           # exit 0
node tests/interaction.test.mjs            # exit 0（E13/E15/E16/F27 全绿）
```
