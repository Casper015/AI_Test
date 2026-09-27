# kit.test 期望同步回执（旧化 roughnessBias 6 条 + 亭 no-opening 与 t103 冲突）· t114

> 卡号：`t114`（repair，attempt 1）· 执行者：kit-engineer（attempt_id `1d024269-03b7-4933-b3cb-1a30c7365a49`）
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 版本（实测时）：`CONTRACTS v1.0.16` ⇄ `CONFIG_VERSION 1.0.7` ⇄ `LAYOUT_VERSION 1.1.13` ⇄ `KIT_VERSION 1.0.1`（`WEATHERING.roughnessBias = 0.04`）
> 改动（仅 inScope）：`tests/kit.test.mjs`、本文件。**未触碰** `src/**`、其他测试文件、`docs/CONTRACTS.md`。

---

## 0. 结论（逐类判定，先给判定再给依据）

| # | t65 报的红项 | 本卡判定 | 处置 |
| --- | --- | --- | --- |
| ① | 统一旧化 `roughnessBias` 期望值 6 条（t65 记录：`glazeTile 期望 0.46 实际 1` 等） | **既非陈旧令牌、也非实现缺陷** —— 是 **t106 的一次性诊断补丁（T4：`roughness → 1`）被 t65 在补丁生效窗口内观测到**；该补丁早已 `cp` 还原，当前树上 6 个材质的实测值**逐值等于 `spec + 0.04`** | 期望值**未改**（原公式本就取自 `CONFIG`，无需同步）；**加固**为"只叠加一次（差值 == 期望差值）"逐材质断言 + 跨材质一致性断言；并在 §1.1 记为"并行诊断写入窗口"的证据 |
| ② | 10 座亭 `no-opening`（t103 为其加 `hasDoor:true` ⇒ 障碍 `exceptDoor`） | **陈旧期望**（语义已变），**不是实现缺陷** | 按 **t103 当前语义**重写：亭 = **四面开敞、数据侧带门可通行**；几何上因**无墙**故无"墙上门洞"（`doorWidth=0`），**不等于不可进入**。新增 10×3 条逐座断言 + 数据侧绑定 + `passable/blockedBy` 自洽不变式 |

> 逐条依据见 §1/§2；"陈旧 vs 真实缺陷"的判别证据见 §2（含**几何可通行性探针**：10/10 无墙，可行走面上 17–19/21 条射线通畅）。
> **未放宽任何判据**：断言数 **845 → 896（+51）**，所有替换都是同义或更强；无 `>=`/包含式放宽；无删断言（§3）。

---

## 1. 逐条：文件:行 + 旧期望 + 新期望 + 依据

### 1.1 ① 统一旧化 `roughnessBias`（6 条）

- **旧期望（t65 观察到的红灯）**：`tests/kit.test.mjs:252-253`
  `const expected = Math.min(1, spec.roughness + CONFIG.WEATHERING.roughnessBias); eq(\`材质 ${id} 叠加统一旧化 roughnessBias\`, kit.materials.get(id).roughness, expected, 1e-9);`
  t65 实测（见 `docs/handoff-t2-interiors.md:251`）：`| kit.test | ① 统一旧化 roughnessBias 期望值（glazeTile 期望 0.46 实际 1 等 6 条）|`。
- **新期望（本卡）**：`tests/kit.test.mjs:253`（等值断言**保持不变**）+ **新增** `:259` 差值断言 + `:264-265` 跨材质一致性断言：
  - `:259` `材质 ${id} 统一旧化只叠加一次（差值 == 期望差值）` —— 断言 `material.roughness − spec.roughness === expected − spec.roughness`（含 clamp 情形），可捕获"重复叠加/漏叠加"；
  - `:264` `统一旧化在未触顶材质上共享同一 bias（${untouched.length} 个）` —— 未触顶材质必须共享同一 `bias`（"统一"旧化的字面含义）；
  - `:265` `统一旧化 bias 未被重复叠加（差值 ≤ bias）`。
- **依据（实测，`/tmp/t114-pav-probe.mjs` 输出）**：

  | 材质 | `spec.roughness` | `+ roughnessBias(0.04)` 期望 | 实测 | 差值 | 结论 |
  | --- | --- | --- | --- | --- | --- |
  | glazeTile | 0.42 | 0.46 | 0.46 | +0.04 | ✓ |
  | plasterRed | 0.78 | 0.82 | 0.82 | +0.04 | ✓ |
  | stoneWhite | 0.62 | 0.66 | 0.66 | +0.04 | ✓ |
  | timberLacquer | 0.55 | 0.59 | 0.59 | +0.04 | ✓ |
  | paintingTeal | 0.66 | 0.70 | 0.70 | +0.04 | ✓ |
  | pavingStone | 0.86 | 0.90 | 0.90 | +0.04 | ✓ |

- **"实际 = 1"的成因（可复现）**：t106 的源级单变量诊断曾把 `src/kit/materials.js:313` 临时改为 `roughness: 1`（用于量化镜面高光对高光截断的贡献），跑图后以 `cp` 还原并 grep 核对。若 t65 恰在该窗口内跑 `run.mjs`，就会看到**全部 6 个材质 `roughness = 1`**，与 t65 记录的"`glazeTile 期望 0.46 实际 1` 等 **6 条**"完全吻合（若是"令牌被改"，不会 6 条同时精确变成 1）。
  ⇒ 该红项**当前树不存在**（实测 6/6 等于期望），且本卡把期望**加固**成能明确报出"roughness 被钉到 1"这类回归。

### 1.2 ② 10 座亭 `no-opening` 与 t103 冲突

- **旧期望 / 旧措辞（t69 期语义，现已陈旧）**：
  - `tests/kit.test.mjs`（改前 `:1006`）`ok('亭（pavilion）即使带 door 数据也不开门洞（四面开敞，能力边界）', pavilionDoorSlots.every((v) => v.endsWith(':0')), …)`
  - `tests/kit.test.mjs`（改前 `:1612`）`ok(\`亭带 door 数据但不适用（${pavilionSlots.length} 个，全部 doorWidth=0）\`, …)`
  - `§14` 的 `no-opening` 收集分支：**凡 layout 带 `door` 的槽位都必须有 `metrics.opening`** → 亭无墙 ⇒ 永远没有 `opening` ⇒ 记为 `${s.id}:no-opening` ✗（t65 的 10 条红项）。
- **新期望（t103 当前语义）**：
  - `:1012` `亭 ${s.id} 数据侧带门（hasDoor=true + blocks=exceptDoor）`（逐座 ×10）；
  - `:1014` `亭 ${s.id} 的 door.passable/blockedBy 自洽（false ⇒ 有 blockedBy）`（逐座 ×10）；
  - `:1015` `亭 ${s.id} 几何无墙体（四面开敞 → 通行不需"墙上门洞"）`（逐座 ×10）；
  - `:1018`（汇总）`亭（pavilion）按 t103 语义全部带门且无"墙上门洞"（10 座，逐座已断言）`；
  - `:1639/1643/1647`（§20）`数据侧全部带门（hasDoor=true + blocks=exceptDoor）`、`passable/blockedBy 自洽`、`几何全部无墙体（通行不依赖墙上门洞）`；`:1650` 仍断言 `doorWidth` 全为 0（保留原事实）；
  - `§20` 边界断言与 `notes` 的措辞同步为："亭四面开敞无墙 ⇒ 无'墙上门洞'读数但按 t103 数据侧可通行"（删除了"不适用"这一陈旧表述，断言本身强度不变）。
- **依据（数据侧 + 几何侧，实测）**：

  | 亭（10 座） | `hasDoor` | `door.width` | `OBSTACLES.blocks` | `door.passable` | `blockedBy` | 几何无墙 | 可行走面上门带通畅率 |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | B-pavilion-gate-west | true | 8 | exceptDoor | true | null | 是 | 17/21 |
  | B-pavilion-gate-east | true | 8 | exceptDoor | true | null | 是 | 17/21 |
  | C-pavilion-rear | true | 8 | exceptDoor | true | null | 是 | 17/21 |
  | D-court3-pavilion | true | 8 | exceptDoor | **false** | `WB-D-pond` | 是 | 17/21 |
  | D-court4-pavilion | true | 8 | exceptDoor | true | null | 是 | 17/21 |
  | E-court3-pavilion | true | 8 | exceptDoor | **false** | `WB-E-pond` | 是 | 17/21 |
  | E-court4-pavilion | true | 8 | exceptDoor | true | null | 是 | 17/21 |
  | F-garden-pavilion-main | true | 16 | exceptDoor | true | null | 是 | 19/21 |
  | F-garden-pavilion-west | true | 10 | exceptDoor | true | null | 是 | 17/21 |
  | F-garden-pavilion-east | true | 10 | exceptDoor | true | null | 是 | 17/21 |

  （数据侧来自 `src/shared/layout.js`；几何侧为本卡探针：在**可行走面（台基顶）+0.5m** 高度、沿入口轴、按 `door.width` 扫 21 条射线，"通畅"= 未命中任何非地面构件；仅两端命中 `columnFoot`（檐柱柱础，属正常柱位）⇒ **无墙体阻挡**。）

---

## 2. "陈旧期望" vs "真实缺陷"的判别（逐条）

**② 亭（判为陈旧期望）**——三条独立证据：
1. **数据侧**：10/10 `hasDoor === true`、障碍 `blocks === 'exceptDoor'`（`t103` 的可通行化），即"按 `door` 规则可通行"是新语义；旧断言要求的 `metrics.opening`（墙上门洞）**在语义上不再适用**；
2. **几何侧**：10/10 **不含任何 `wall` 构件**（`partsOf(pav)` 无 `wall`）——**没有墙，就没有"该开而未开的门洞"**；探针显示可行走面上 17–19/21 条射线通畅，首障只有檐柱柱础 `columnFoot`（两端各 1–2 条）；
3. **失败模式**：旧红项的判据是"`metrics.opening` 不存在 ⇒ `no-opening`"，属**期望写死了"必须有墙上门洞"这一实现假设**，与 t103 的可通行语义冲突 ⇒ 判为**陈旧期望**。
   ⇒ **不是"亭几何真的没开洞"**：亭是四面开敞建筑，本就无需门洞；若真有墙阻挡，上面第 2 条的探针会命中 `wall`（实测 0 次）。

**① roughnessBias（判为"诊断窗口产物"，非陈旧令牌亦非实现缺陷）**：当前树 6/6 实测等于 `spec + 0.04`；t65 观测到的"实际 1"与 t106 的 T4 诊断补丁（`roughness: 1`）逐值吻合，且该补丁已在 t106 内还原（`cp` + grep 核对）。**无实现缺陷**，故不派修；加固断言以捕获此类回归。

**未发现需要停手交回的真实缺陷**（本卡范围内 0 项）。

---

## 3. "不得放宽、不得删断言"的机器化证明

| 项 | 值 |
| --- | --- |
| 改动前 `node tests/kit.test.mjs` | 通过 **845 / 845**，失败 0（本卡开工实测） |
| 改动后 | 通过 **896 / 896**，失败 0（净增 **+51 条**断言） |
| 断言增减 | **只增不减**：无任何断言被删除；`§14` 的 `no-opening` 收集分支改为**逐座 3 条明确断言**（原为 1 条聚合）；`§20` 由 1 条聚合改为 3 条明确断言 + 保留 `doorWidth=0`；旧化部分新增 6 条差值断言 + 2 条一致性断言 |
| 是否放宽判据 | **否**。全部为等值/精确断言；未使用 `>=`、未改成包含式、未放宽容差（差值断言仍 `1e-9`）；未改任何 `src/**` 实现 |
| 原意如何被守住 | ①"每个材质都叠加**统一**旧化"→ 等值断言（保留）+ 差值断言（新增，证明"恰好一次"）+ 跨材质共享同一 `bias`（新增）；②"亭不参与'墙上门洞'口径"→ `doorWidth === 0`（保留）+ **"无墙"证明**（新增）+ **数据侧带门/可通行**（新增），即把"不适用"升级为"可通行且无需门洞"的**更强**语义 |

---

## 4. 回归（三条 verify 真实输出）

```text
$ node tests/kit.test.mjs
 … 亭（t103 口径）：10 座全部 hasDoor=true + blocks=exceptDoor；其中 8 座 door.passable=true，
   2 座被水景阻断（D-court3-pavilion←WB-D-pond,E-court3-pavilion←WB-E-pond）；
   几何侧 10 座全部无墙 ⇒ doorWidth=0（无"墙上门洞"，但可开敞通行）
 通过 896 / 896，失败 0            exit=0

$ node tests/core-environment.test.mjs
 exit=0（通过数见其自身汇总；本卡未改该文件）

$ node scripts/audit.mjs --enforce
 主场景绘制调用   : 333 / 上限 350  ✓
 可见三角面       : 306737 / 上限 1500000  ✓
 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
 exit=0
```

（项目级 `run.mjs` 按任务卡**不列入**本卡 verify。）

---

## 5. 残余 / 边界（如实列出，含需数据方知悉项）

| # | 事项 | 归属 | 状态 |
| --- | --- | --- | --- |
| R1 | **2 座亭 `door.passable=false`**（`D-court3-pavilion ← WB-D-pond`、`E-court3-pavilion ← WB-E-pond`）：几何上四面开敞（探针 17/21 通畅、无墙），但数据侧声明被水景阻断 | **数据侧（t103/t97/t1）** | 本卡**只断言其自洽**（`false ⇒ 有 blockedBy`）并记录分布；**不判为 kit 缺陷**。若该 2 座确应可通行，请数据方复核 `WB-*-pond` 与门带的空间关系 |
| R2 | `no-opening` 判据本身（"带 door 的槽位必须有 `metrics.opening`"）仍隐含"必须有墙" | kit 测试（本卡已把亭分流） | 若将来出现**新的无墙可通行类型**（如敞轩、游廊节点），需同样分流；已在本卡注释中写明规则 |
| R3 | 并行诊断写入窗口（t106 的 T4 补丁）造成的**跨卡假红** | 流程性 | 建议：源级诊断补丁只在本卡内跑、跑完立即还原，并在回执里登记"曾临时改动文件 X，已还原"（t106 回执已登记） |
| R4 | 本卡无法核验 t65 快照的**完整**内容（仓库无 VCS） | — | 只声明本卡实测到的当前事实（6/6 等值、10 座亭无墙可通行），不对 t65 期间其它未知改动下结论 |

---

## 6. 未验证 / 边界

1. **未运行 `run.mjs`**（按任务卡要求，项目级回归归 verifier）。
2. **未改任何实现代码**：`src/**` 一字未动；若亭/旧化将来再变，本卡的期望与不变式会**明确报错**（这正是加固的目的），届时需按当时的数据语义同步。
3. **未复跑 t65 当时的快照**：本卡对 ① 的"诊断窗口"结论基于"t106 回执登记的补丁 + 6/6 逐值吻合"这一证据链；`docs/handoff-t2-interiors.md:251` 只记录了现象（`期望 0.46 实际 1` ×6），未记录成因，本卡据此给出最一致的解释并标注为**推断**。
4. **`passable/blockedBy` 的语义定义**未由本卡复核（属数据/契约侧）：本卡只验证"字段自洽 + 与几何无墙事实不矛盾"。
