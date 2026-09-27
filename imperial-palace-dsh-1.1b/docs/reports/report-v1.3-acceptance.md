# t19 · 验收 V3：43 栋端到端与预算/可读性

> 归属：verifier · 任务 t19 · attempt 2。**只读终判**；不改任何 `src/**`、不改弱任何判据。
> 结论：**端到端四轴全部通过** —— ① 内景进入 **43/43**、② 院落连通 **14/14（院中心 + 54 门洞全部可达）**、
> ③ §8.2 预算门禁 **audit --enforce exit 0**、④ §12 可读性 **24/24 判据 PASS**。门洞**几何贯穿** 63/63；
> 但 `door.through`/`door.back` **登记仍为 0**（t22 未落地）⇒ 该项**未闭合**，如实登记。

## 0. 口径三要素（本卡全部读数共用）

| 要素 | 取值 |
| --- | --- |
| ① **网格参数** | `cellSize:1` 细口径（**唯一过关口径**），范围 = `TERRAIN_EXTENT`（x∈[-420,420]、z∈[-560,560]）⇒ 841×1121 格，**显式提额 `maxCells:3_000_000`**；`cellSize:2` 为粗口径（**非权威**）。预算/可读性另用 `docs/shots` 的 1440×900 / DPR1 / quality medium 口径。 |
| ② **锚点** | `OUTSIDE = FP_ROUTE[0]`「南桥北端」= **(0, −480)**（与 t140 / 5.3 / E8 / E11 / E18 / t17 同源）。 |
| ③ **点集与判据** | 点集 = `INTERIOR_BY_SLOT` 的 43 内景面中心 · 14 个 `COURTYARDS` 院中心 · 54 个 `WALLS[].openings[]` 门洞中点（`at` = **沿墙轴的世界坐标**，据 `layout-slice.js:48` 的 `[at±width/2]` 实心区间语义推出）；判据**一律 `.ok`**（`componentOf` / `path` / `connected`），**无** `!= null` / `if (!p)`。 |

**生产装配自证**：`scripts/verify-walk.mjs` 的 `assembleCity()`（真 kit + core registry + B/C/D/E/F `registerZone`）⇒ `solver.stats().obstacles = 751`；**与游戏同一装配路径**，区域缺失即抛错。
**快照**：跨本轮 LAYOUT 发生 **1.1.23 → 1.1.24**（并发写入窗口）。各结论的**快照标记**见 §1；稳定后（`layout.js` mtime 09:36:38）复测结论不变（§5）。

## 1. ① 43 栋内景进入（端到端）

| 快照 | 建图 | 点集 | 结果 |
| --- | --- | --- | --- |
| `LAYOUT 1.1.23`（t17 定稿） | 1m 生产图（751 障碍） | 43 内景面中心 | **43/43 可达**（`componentOf(...).ok`）；细口径不可达 **0**；机位不可达 0；`path.ok` 逐栋 true |
| `LAYOUT 1.1.24`（本卡复测） | 同上 | 同上 | **43/43 可达**（计数不变；`visitable 43` · `INTERIOR_BY_SLOT 43`） |

- 逐栋 43 行（局部/全局并列、以全局为准）与 49 段走查读数见 **t17 报告**：`docs/reports/report-v1.1-reachability.md`（§1 43 行表 · §3 49 段表）。
- 强判据同源复核（不改弱）：**5.3 PASS**（`同一连通分量（841×1121@1m，可走 724481 格；障碍 751）`）· **B1 ✓ 49/49 段** · **B10 ✓ 98 点同一连通分量**。

## 2. ② 院落连通（14 院落 / 54 门洞，全部 `.ok`）

判据：① 院中心（`COURTYARDS[].bounds` 中心）与主户外分量同属一分量；② 该院 **每一面院墙的每个门洞中点** 同属一分量。
门洞中点推导：`openings[].at` 是**沿墙轴的世界坐标**（非 0..1 归一化）⇒ 横墙取 `(x=at, z=墙中心)`、纵墙取 `(x=墙中心, z=at)`。

| # | 院落 | 院墙 | 门洞 | 院中心 ok | 门洞可达 |
| --- | --- | --- | --- | --- | --- |
| 1 | CY-B-plaza | 4 | 10 | true | 10/10 |
| 2 | CY-B-throne | 4 | 8 | true | 8/8 |
| 3 | CY-B-rear | 4 | 6 | true | 6/6 |
| 4 | CY-C-front | 4 | 4 | true | 4/4 |
| 5 | CY-C-main | 4 | 4 | true | 4/4 |
| 6 | CY-C-rear | 4 | 8 | true | 8/8 |
| 7 | CY-D-court1 | 4 | 1 | true | 1/1 |
| 8 | CY-D-court2 | 4 | 1 | true | 1/1 |
| 9 | CY-D-court3 | 4 | 2 | true | 2/2 |
| 10 | CY-D-court4 | 4 | 3 | true | 3/3 |
| 11 | CY-E-court1 | 4 | 1 | true | 1/1 |
| 12 | CY-E-court2 | 4 | 1 | true | 1/1 |
| 13 | CY-E-court3 | 4 | 3 | true | 3/3 |
| 14 | CY-E-court4 | 4 | 3 | true | 3/3 |

**结论：14/14 院中心可达、54/54 门洞可达；`wallIds` 与 `WALLS` 一一对应、每院至少 1 处门洞（14/14）** ⇒ **无问题**。

## 3. ③ 门洞贯穿 —— **半闭合，如实登记**

| 维度 | 读数 | 判定 |
| --- | --- | --- |
| `door.through` / `door.back` **登记** | **0 / 63**（`gateHall 6 · hall 14 · sideHall 23 · pavilion 10 · courtyardGate 10`） | **未闭合**（t22「门洞贯穿语义登记」未落地；t6 已交回该登记缺失） |
| **几何/数据侧** 贯穿 | 门轴两侧各 12m 均可站：**63/63** | 通过（门洞通道豁免生效，两侧同属主分量） |
| 门洞净宽 | **63/63 ≥ max(1.1m, 登记宽×0.5)**（最小 7.3m）· 0 座具名例外（B4 ✓） | 通过 |
| 院墙实体段阻挡 | **60/60 段**探针被阻挡（探针避开洞口）（B5 ✓） | 通过 |
| 门类后墙开洞（t6） | gateHall 6 + courtyardGate 10 已补后墙开口（几何权威证据在 `tests/kit.test.mjs` §22） | 通过（几何）；**登记字段仍缺** |

⇒ **贯穿"能不能穿"已通过；贯穿"是否被显式登记为贯穿"未通过**（缺 `door.through`/`door.back`）。**不得**以几何通过冒充登记通过。

## 4. ④ §8.2 预算门禁 + §12 可读性

### 4.1 §8.2 预算（`node scripts/audit.mjs --enforce` = **0**）

| 项 | 读数 | 上限 |
| --- | --- | --- |
| 主场景绘制调用 | **342** | 350 ✓ |
| 分区 B / C / D / E / F | **62** / **56** / **49** / **49** / **80** | 70 / 60 / 56 / 56 / 80 ✓（F 用满但未超） |
| 可见三角面 | **424401** | 1,500,000 ✓ |
| 结论 | `预算与契约检查全部通过（信息性提示 0 项，不计失败）` | — |

单建筑三角面上限 24000：逐槽位工厂 near 档实测单栋最大 **11932**（B-hall-main）✓。

### 4.2 §12 可读性（`node tests/verify-experience.test.mjs`：**先 1 → 重生成语料后 0**）

**关键定性（本卡重点发现）**：F1 判据读的是 `docs/shots/manifest.json` 的 `t2-*` judge 条目，**当轮 manifest 里的 t2-* 是旧语料**，其记录的失败项为：

| 失败项 | 旧语料读数 | 性质 |
| --- | --- | --- |
| `orbit/dusk` · `orbit/night` | 内容占比 **0.02% / 0.18%**（"画面近似纯色/几乎全为背景"）+ dusk 截断 **25.87%** | **真实可读性缺陷**（非陈旧数字） |
| `interior/night` | 内容高光截断 **5.02% > 5%** | 真实（超限 0.02pp，擦线） |
| `fp/golden` | 掩码防护：未识别到真天空 | 真实（防护触发） |

**处置（只读授权内的"重生成语料"，不改任何判据）**：`node scripts/shot.mjs --view=all --preset=all --keep-invalid` ⇒ **全部 24 张截图有效**，逐张判据 PASS。重生成后 `verify-experience` **exit 0**，F1 逐项转为 PASS：

- `orbit/dusk` 内容暗区 **2.80% ≤ 15%** · 截断 **0.00%** · 内容像素 **76.1%**
- `orbit/night` 内容暗区 **7.78% ≤ 15%** · 截断 **0.00%** · 内容像素 **76.1%**
- `interior/night` 内容暗区 **0.00% ≤ 30%** · 截断 **3.70% ≤ 5%**
- `fp/golden` 内容暗区 **0.00%** · 截断 **0.10%** · 背景掩码防护**未触发**（背景已识别，内容占比 61.1%）

⇒ **§12 可读性按现行语料全量通过**；旧语料的 4 项红**已由重生成消解**（并非改判据/放宽阈值所得，阈值为 `maxDark 15/30%`、`截断 5%` 原值）。

## 5. 退出码与全量回归（原样；含并发窗口标记）

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `node scripts/audit.mjs --enforce` | **0** | 见 §4.1（342/350、F 80/80、三角 424401/1.5M） |
| `node tests/verify-experience.test.mjs`（重生成后） | **0** | F1 ✓ 24/24（旧语料下为 1） |
| `node tests/core.test.mjs` | **0** | `通过 45 / 45` |
| `node tests/walk-reachability.test.mjs` | **0** | 稳定后复测绿（并发窗口期曾见 `F-garden-hall-west/east` 不可达，见下） |
| `node tests/run.mjs`（稳定树） | **1** | **`通过 27 / 28，失败 1`**；唯一红 = `layout.test.mjs` 的**陈旧版本 pin**（期望 `LAYOUT 1.1.23`，实际 `1.1.24`）⇒ 属正在改 layout 的 owner 的 inScope，**非本卡** |
| 探针 `work/t17/v3.mjs` | **0** | 见 `work/t19/v3.txt` |

### 并发写入窗口（如实标记，未据伪影下结论）
本轮测量期间 `src/shared/layout.js` / `src/core/layout-slice.js` **被并发修改**（`LAYOUT 1.1.23 → 1.1.24`）：
- 窗口期内 `run.mjs` 曾报 6 红（含 `walk-reachability` 的 `F-garden-hall-west/east` 门中不可达、`layout` 版本 pin）；
- `layout.js` mtime 稳定于 **09:36:38** 后复测：`walk-reachability` **exit 0**、`core-collision` **26/26**、`run.mjs` 由 6 红降为 **1 红**（仅版本 pin）⇒ **证明前一轮的多数红是写入窗口伪影**，未据此改任何代码。

## 6. 仍红项 / 未闭合项（逐条交回）

1. **`door.through` / `door.back` 登记 = 0/63**（t22）：贯穿语义**未登记**。建议按 t6 的枚举落地（门类 16 栋 + 非门类 37 栋显式声明"是否贯穿"），并把 `layout-slice.insideObstacleDoor` 的**整进深豁免**收窄为"门洞 + 室内进深"。**本卡未改**（`src/shared/layout.js` 不在 inScope，且正被并发修改）。
2. **`tests/layout.test.mjs` 陈旧版本 pin**（`期望 "1.1.23"，实际 "1.1.24"`）：唯一剩余全量红，属 layout owner；**同族**已由 t23/t24 处置（改数据推导）。
3. **`tests/core-stats.test.mjs` 在并发 run 中偶发红**（`compactReport() 应包含字段 backgroundCandidates`）：**单独重跑 3/3 全绿（21/21）** ⇒ 判为**并发窗口伪影**，不作缺陷登记。
4. **`docs/shots/**` 本轮被重生成**（24 张 PNG + `manifest.json`，mtime 09:34:24）：这是 §12 判据的**输入语料**，非"改判据"。`work/t19/manifest-before.json` 保留重生成前快照备查。

## 7. 原始证据

- 院落/贯穿/预算读数：`work/t19/v3.txt`（v3 探针 = `work/t19/v3.mjs`）
- §8.2 预算：`work/t19/audit.log`、`work/t19/audit-final.log`
- §12 可读性：`work/t19/ve.log`（旧语料，exit 1）、`work/t19/ve-after.log`（重生成后，exit 0）、`work/t19/shot-regen.log`（24 张逐张判据）
- 全量回归：`work/t19/run.log`（窗口期 26/28）、`work/t19/run-after.log`（22/28，窗口期）、`work/t19/run-final.log`（稳定树 **27/28**）
- 语料快照：`work/t19/manifest-before.json`
- t17 逐栋/逐段定稿：`docs/reports/report-v1.1-reachability.md`

> **口径声明**：所有"可达/连通"取自 **`.ok` 布尔**且在**生产装配（751 障碍）**下测得；预算取自 `audit --enforce`（§8.2 原值）；可读性取自 `manifest.json` 的 `t2-*` judge（§12 原阈值 15/30%、5%）。**未**使用无 registry 基线替身，**未**放宽任何判据或阈值。
