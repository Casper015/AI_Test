# t138 形式收口：指派项已完成 + 几何残差承接链 + 当前读数（t164）

> 卡号：`t164`（repair，attempt 1）· 执行者：kit-engineer（attempt_id `b0bf93c8-a7ca-4d6b-9809-b1e64bd83616`）
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 日期：2026-09-26 · 版本（实测时）：`CONTRACTS v1.0.22+` ⇄ `CONFIG_VERSION 1.0.7` ⇄ **`LAYOUT_VERSION 1.1.20+`** ⇄ `KIT_VERSION 1.0.1`
> **本卡唯一产物 = 本文件**。未改 `src/**`、`tests/**`、`scripts/**`、`docs/CONTRACTS.md`、`docs/shots/**`、任何他人回执；未改任何阈值/断言。
> 用途：清除平台标志 **`t138 failed without a follow-up repair`**（平台只认"失败的 repair 卡缺少 repair 类后继"，本卡即该后继）。

---

## 0. 结论速览（含"不粉饰"声明）

| 项 | 结论 |
| --- | --- |
| ① t138 判 failed 的**真实原因** | 它**被指派的两项（B4 / 5.4b）已全部转 PASS**，但其**卡内 verify 含 `verify-experience` / `verify-completeness`**，当时那两套仍红于**几何残差**（`5.3` / `B1` / `B10` = 当轮未闭合的"C 两殿不可达"）⇒ 按平台规则**如实 failed**（不是实现失败） |
| ② 它对强判据的处理 | **正确**：**没有**为变绿去动 `5.3`/`B1`/`B10`，**未放宽任何强判据**，只改了自己被指派的两套期望并把需 verifier 决策的改法**交回**（§2） |
| ③ 后续承接 | **C 两殿**那条几何残差由 **t145 → t151 → t158** 串接闭合（`LAYOUT 1.1.18 → 1.1.19 → 1.1.20`）；`CONTRACTS §12.1.4.5（v1.0.22）` 记录 t158 验收**四项同时绿**（单向 0 / 分量护栏全绿 / `layout.test` 全绿 / `interaction.test` 的 **E13/E15/E16/F27 转绿**） |
| ④ 当前树实测（**如实，不粉饰**） | `audit --enforce` **exit 0** ✅；`verify-experience` **35 项：PASS 34 / FAIL 1**（F1 掩码防护，4 格）；`verify-completeness` **52 项：PASS 49 / FAIL 2 / UNVERIFIED 1**（**`5.3` 仍不连通：4 个节点属 E 区**；`5.4b` 脚本旧口径 FAIL 而**契约口径 PASS**） |
| **重要更正（相对卡面前提）** | 卡面写"几何残差已由 t145/t151/t158 闭合（43/43 内景可达…）"。**当前树实测不支持"5.3 已全绿"**：§5.3 仍有 **4 个节点**不在主分量（`文华殿门内`、`陈设正堂门内`、`VP-E-court1-hall-interior`、`VP-E-court2-hall-interior`，均在 **E 区**）。t138 原红的 **C 两殿**那条**确已闭合**，但 E 区同类残差**仍在**（归属见 §4.3）。本文件**不宣称 t138 那一类几何残差都已消解**。 |

---

## 1. ① t138 判 failed 的真实原因（证据链，不改写历史）

### 1.1 t138 自己做了什么（来源：`docs/report-completeness.md` §20，只读引用）

> `## 20. t138：B4 / 5.4b —— **两项均为陈旧期望，非缺陷**（已被更严机制取代）`
> `> attempt \`3e933e61-fc67-4e0a-bbc2-4b4b9879f599\` · 树状态 **\`LAYOUT 1.1.17\`** · 只改 \`tests/verify-experience.test.mjs\`、\`tests/verify-completeness.test.mjs\` 与本报告；\`scripts/**\` **一字未改**（只读复核）。`
> `### 20.1 B4（门洞净宽）：陈旧期望 → **"非例外全部达标 + 恰好 2 座具名例外"**`
> `- 旧期望 \`18/18\` 在事实上不成立：\`D-court3-pavilion\` / \`E-court3-pavilion\` 位于水池中…`

⇒ **其被指派的两项（B4 / 5.4b）已完成**：B4 由"18/18 恒真期望"改为 **"非例外全达标 + 恰好 2 座具名例外（水中亭）"**；5.4b 口径复核 **PASS**（见 §4.2 当前读数中的"契约口径复核"行）。

### 1.2 那为什么仍判 failed（来源：`docs/handoff-t2-interiors.md:252-253`）

> `| \`verify-completeness\` | §5.3 南桥起点→43 内景机位的**连通分量**仍不闭合（台明台阶数据缺口；本卡 §5.2-4 已证明"入口外 1.2m 可步入"41/43）；§5.4b \`y ≠ door.sillY\` 仅剩 5 栋（C-gate-inner + F 四城门，属 t72 通道口径） | layout 卡（t102 已登记门外过渡台阶，连通性未闭合） |`
> `| \`verify-experience\` | F1 24 张渲染判据 + B1/B4/B10 走查路线连通性（与上同源） | 渲染/layout 卡 |`

⇒ **真实原因 = 卡内 verify 含这两套，而它们当时红于"当轮未闭合的几何残差"**（`5.3` 连通分量 / `B1`/`B10` 走查路线连通性 = **C 两殿不可达**），**与 t138 被指派的 B4/5.4b 无关**。
按平台规则（verify 非全绿 ⇒ failed）**如实 failed 是正确的**：它**不能**为了让自己变绿去改 `5.3`/`B1`/`B10`（那是 layout/zone 归属）。

### 1.3 判别依据（"陈旧期望/非本卡归属"而非"实现缺陷"）

- 被指派项 B4/5.4b 的失败模式是**期望写死了事实上不成立的恒真条件**（`18/18` 门洞净宽、`43/43` 通道面 y 一致）⇒ 属**陈旧期望**；
- 未闭合项 `5.3`/`B1`/`B10` 的失败模式是**几何残差**（走不通，不是断言写错）⇒ 属**其它卡归属**，本卡范围内**无实现缺陷**。

---

## 2. ② t138 没有为变绿去动强判据（正确做法，逐条证据）

| 证据 | 内容 |
| --- | --- |
| `docs/report-completeness.md:242` | `- 不放宽判据（准则 3）：**满足** —— 5.3 仍为"同属一个连通分量"强判据；另新增 5.4/5.4b/5.5/5.6（逐栋几何 + 改动前对照），未改为"内景面存在"这类弱形式。` |
| `docs/handoff-layout-interiors.md:330-354` | t138 只把 **B4 的精确改法**（`18/18` → `16/18 + 2 座具名例外`）写成**交回 verifier 的建议**（"归 verifier，本卡不改"），并未越界替别人改判据 |
| 同上 §12.6 | `F7 口径（供 t77 同步其 5.4b，逐字）` —— 跨卡口径以"交接口径"方式传递，而非私自改 |
| `docs/report-completeness.md` §20 首行 | 其改动范围被限制为 `tests/verify-experience.test.mjs`、`tests/verify-completeness.test.mjs` 与自己的报告；`scripts/**` 一字未改 |

⇒ **结论**：t138 在"被指派项完成 + 卡内 verify 因他人归属残差非绿"的情况下选择了 **"如实 failed + 不动强判据 + 把改法交回"**，这是**正确做法**，也是本卡要登记的核心事实。

---

## 3. ③ 几何残差的承接链（C 两殿那条：t145 → t151 → t158）

来源：`docs/handoff-retire-t131.md` §3「承接链：t132 → t145 → t151 → t158」（**转录**，含各方"没做到什么"）：

| 卡 | 做了什么 | 落地版本 / 出处 | 当时**未**做到的（历史保留，不回收） |
| --- | --- | --- | --- |
| **t145** | **C 两栋有界开槽**（`WK-C-side-{west,east}-main-transition-2`，`ground`，y=0.9），恢复 C 两殿台基 ↔ 走廊 0.9↔1.3 相邻 | `LAYOUT 1.1.18`（`docs/report-completeness.md` §22） | **未闭合全局连通**；其当时报的"43/43"**不可信**（探针用 `if (!p)` 而非 `.ok`，同类恒真缺陷，见 `docs/report-false-green-sweep.md` #6） |
| **t151** | **C 两殿门外加法下坡带**（未被覆盖窗口内 1.9/1.4）⇒ 43/43 内景**能下到** | `LAYOUT 1.1.19`（`docs/report-completeness.md` §23） | **造出两条单向陷阱**（回程需上跨 >0.5m ⇒ `path(点→起点)` 失败）：其"43/43 可达"只覆盖"去程"，未覆盖"回得来" |
| **t158** | **float32 裕量梯链**：把 1.9/1.4 改为逐跳 **≤0.48** 的裕量组合（1.7↔1.3↔1.0↔1.45↔1.92↔2.4），规范化过渡矩形 | `LAYOUT 1.1.20`；`docs/CONTRACTS.md` **§12.1.4.5（v1.0.22）** | — |

`docs/CONTRACTS.md:1128`（t158 的验收原文）：

> `**验收（t158 实测四项同时绿）**：图搜索 **单向 0**（F12 55 处过渡带读数）· ⓠ 分量护栏全绿 · \`layout.test\` 全绿 · \`interaction.test\` 的 **E13/E15/E16/F27 转绿**。`

**关于"8 处单向带"的口径（如实）**：`docs/handoff-retire-t131.md:86` 明确写着——该**计数**来自其卡面/树内注释（`src/shared/layout.js:1093` 原样写着"…⇒ canStep 拒上行 ⇒ 8 处单向带"），**t131 未独立复算该数字**，只复核了"当前树单向 0 / 分量护栏全绿"。本卡**同样未独立复算**"8 处"，只转述上表与 `CONTRACTS` 的验收行。

⇒ **C 两殿那条**（t138 当轮的红）**确由这一串闭合**；但**"整类几何残差全绿"并不等于事实**（见 §4）。

---

## 4. ④ 当前树实测（真实读数，逐条归因）

### 4.1 `node scripts/audit.mjs --enforce`（本卡唯一 verify）→ **exit 0**

```text
$ cd ".../imperial-palace-dsh-1.1b" && node scripts/audit.mjs --enforce
 主场景绘制调用   : 333 / 上限 350  ✓
 分区 B         : 62 / 预算 70  ✓
 分区 C         : 55 / 预算 60  ✓
 分区 D         : 49 / 预算 56  ✓
 分区 E         : 49 / 预算 56  ✓
 分区 F         : 72 / 预算 80  ✓
 可见三角面       : 306737 / 上限 1500000  ✓
 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
exit=0
```

### 4.2 `node tests/verify-experience.test.mjs` → **exit 1**（仍是红，如实）

```text
 检查项 35：PASS 34 / FAIL 1
 ✗ F1 24 张（8 视角 × 3 时辰）1440×900 真实渲染全部在盘、判据通过、掩码防护未触发
   — 未通过：interior/night 暗区0%>30%, fp/golden 暗区0.01%>30%(掩码防护),
             orbit/dusk 暗区0%>15%, orbit/night 暗区0%>15%
```

**逐条归因（4 格，全部是"掩码防护"类，不是 §12 阈值超标）**：
- 四条消息里"暗区 0% / 0.01%"与后面的">30% / >15%"是**拼接格式**（把掩码防护原因与数值并列），**并非"暗区超阈"**：0% 不可能大于 30%；
- 4 格 `interior/night`、`fp/golden`、`orbit/dusk`、`orbit/night` 的**失败原因是背景掩码防护**（未识别到"真天空"或未按 `--allow-no-sky` 出图）——
  与我在 **t106** 实测到的同类现象同源（`--view=zone --zone=B --preset=dusk` 亦为掩码告警 FAIL，截断 0.01%/暗区 3.85% 均不超阈）；
- 该项检查的**数据来源是既有的 24 张在盘证据**（`docs/shots/**` 的 manifest 判决），**不是本卡可改的范围**（本卡不改 `docs/shots/**`、不改 `scripts/**`、不改 `tests/**`）。
⇒ **归属：渲染证据/工具口径（t2/shot 工具 + verifier 证据刷新）**，**与 t138 及其承接链无关**；`B1/B10` 在本卡实测中**未出现在 FAIL 列表**（该套只剩 F1 一条红）。

### 4.3 `node tests/verify-completeness.test.mjs` → **exit 1**（仍是红，如实）

```text
 PASS 49 / FAIL 2 / UNVERIFIED 1          （检查项 52）
 [FAIL] 5.3 带真实区域碰撞的可行走图（cellSize=1）：南桥起点 → 5 fp-spawn + 50 走查路点 + 43 内景机位同属一个连通分量
        — 不连通：文华殿门内, 陈设正堂门内, VP-E-court1-hall-interior, VP-E-court2-hall-interior
 [FAIL] 5.4b 通道面 y 与 door.sillY / INTERIOR_BY_SLOT.groundY 的一致性（不一致逐栋登记，属数据集缺陷）
        — y ≠ door.sillY：5 栋（C-gate-inner: 0.9 vs sillY 1.8；F-gate-east/north/south/west: 0.4 vs sillY 12.4）
 注：脚本引擎的 5.4b 仍为旧口径（43/43）——已由上面的契约口径复核取代（PASS）；该项不计入本入口退出码。
 注：浏览器侧检查未包含在本次运行（G2_VERIFY_BROWSER=1 或 node scripts/verify-completeness.mjs 可补全）
 [5.4b·契约口径复核] 非例外一致 37 / 真实偏离 5（C-gate-inner、F-gate-south/north/west/east）/ 已归位例外 1（C-hall-bed-main）/ 例外表 6 / 合计 43 ⇒ PASS
```

**逐条归因**：

| 红项 | 现象 | 归属与判断 |
| --- | --- | --- |
| **§5.3 连通分量** | 仍有 **4 个节点**不在主分量：`文华殿门内`、`陈设正堂门内`、`VP-E-court1-hall-interior`、`VP-E-court2-hall-interior`（**全在 E 区**；**C 两殿已不在列表** ⇒ t145/t151/t158 对 C 的承接**生效**） | **几何残差仍在（E 区）**：E 区两殿堂台基内外高差超出 `maxStepHeight`（`docs/handoff-t2-collision-y0.md` 已登记：如 `OB-E-court1-hall` 门槛 1.0m vs 外侧 0.4m ⇒ Δ0.6 > 0.5 ⇒ `stepTooHigh`），按设计需 `CXN-*-danbi` 台阶 connector。⇒ **归 layout/zone 卡**（非 t138，非本卡可改） |
| **§5.4b（脚本旧口径）** | 脚本仍按旧口径（要求 43/43 逐栋 `y == door.sillY`）判 FAIL：5 栋偏离 | **口径问题**：同一份输出里**契约口径复核 PASS**（5 栋属**已登记例外表**：4 座 F 城门双标高 + `C-gate-inner`；例外表共 6 条，含 `C-hall-bed-main`）。⇒ **归工具卡**（把 `verify-completeness` 脚本引擎切到契约口径），**不是数据缺陷** |
| **UNVERIFIED 1** | 浏览器侧检查未运行（需 `G2_VERIFY_BROWSER=1` 或 `node scripts/verify-completeness.mjs`） | 本卡按任务卡只跑 `tests/*.test.mjs`、不跑浏览器矩阵；口径与 t92/t120 一致 ⇒ 如实标注**未验证** |

⇒ **一句话**：t138 当轮的红（C 两殿不可达 + B1/B10）**已由承接链消除**（C 不在 §5.3 列表、该套只剩 F1），
但 **§5.3 的强判据在当前树仍未全绿**（E 区 4 节点），**本文件不宣称那一类几何残差都已消解**。

---

## 5. 与平台标志、账本的关系（不改写历史）

| 角色 | 文件/标识 | 本卡关系 |
| --- | --- | --- |
| 平台标志 | `t138 failed without a follow-up repair` | **本卡即该后继**（repair 类，登记真实原因 + 承接链 + 当前读数） |
| t138 自身的完成情况 | `docs/report-completeness.md` §20 | **只读引用**（§1.1/§2 逐条摘录）；本卡**未修改**该文件 |
| 未闭合项出处 | `docs/handoff-t2-interiors.md:252-253` | 只读引用 |
| 承接链 | `docs/handoff-retire-t131.md` §3、`docs/CONTRACTS.md:1128` | 只读引用（含各卡"没做到什么"的历史保留） |
| `docs/CONTRACTS.md` | — | **未改**（`§12.1.4.5`/`5.4b` 口径以现状引用） |
| `src/**`、`tests/**`、`scripts/**`、`docs/shots/**` | — | **未改**（本卡只新建本文件） |

---

## 6. 未验证 / 边界（如实列出）

1. **浏览器侧未跑**：`verify-completeness` 的 UNVERIFIED 1（浏览器矩阵）本卡未执行 ⇒ 该项状态为**未知**，不宣称达标。
2. **"8 处单向带"未独立复算**：只转述 `CONTRACTS §12.1.4.5` 的验收行与 `handoff-retire-t131.md` 的口径（后者已明示该计数来自树内注释）。
3. **F1 的 4 格失败未复拍**：本卡未重出 24 张证据图（`docs/shots/**` 与 `scripts/**` 均不在 inScope）⇒ 归属为工具/证据刷新，未由本卡修复。
4. **§5.3 的 E 区 4 节点未定位到具体台阶/connector 编号**：本卡只按现有登记（`handoff-t2-collision-y0.md` 的 `stepTooHigh` 口径）给出类别归因，**未做逐格复算**（属 layout/zone 卡）。
5. **本文件不构成"t138 目标已达成/无遗留"的判定**：它只登记"指派项已完成 + 卡内 verify 因他人归属残差非绿 + 承接链 + 当前实测（含仍红项与归属）"。
