# handoff · T2.21 定论两处口径：`OBSTACLES[].y0` canonical + audit 输出分类（t82）

任务：`t82`（repair，attempt 1）· 执行者：core-engineer（attempt_id `06f1cc7d-90c4-4047-9132-ad10b52dd00b`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`src/core/layout-slice.js`、`scripts/audit.mjs`、`docs/CONTRACTS.md`、本回执。**未触碰** `src/shared/**`、`src/kit/**`、`src/zones/**`、`src/ui/**`、`src/interaction/**`。

---

## 1. 定论 ①：`OBSTACLES[].y0` 的 canonical 语义

### 代码实际行为（逐处 file:line）

| 位置 | 内容 |
| --- | --- |
| `src/core/layout-slice.js:414-424` | `normalizeObstacleY0()`：`const recorded = obstacle.y0; const y0 = floor === null ? recorded : Math.min(recorded, floor);` 并且 `y0Recorded = recorded`、`y0Source = y0 === recorded ? 'layout' : 'floorYAt'` |
| `src/core/layout-slice.js:344-353` | `footprintFloor(bounds)` = **该足迹内最高可行走面**（含 `kind:'interior'` 内景面与 `kind:'passage'` 门洞通道面） |
| `src/core/layout-slice.js:489+`（`assembleBaselineObstacles`） | 基线图层对 81 条逐条调用上述归一，并统计 `y0Clamped`（第 560 行：`entry.y0Source === 'floorYAt'` ⇒ 计数） |

**实测（本次）**：`OB-B-hall-mid` 记录值 `2`、`footprintFloor(bounds) = 2` ⇒ `min(2,2) = 2`、`y0Source = 'layout'`。
全局：81 条中 **下钳 15 条 / 保持 66 条**（`sources={"floorYAt":15,"layout":66}`）；下钳样例
`OB-B-pavilion-gate-west: 0.6→0`、`OB-B-pavilion-gate-east: 0.6→0`、`OB-D-court3-pavilion: 0.5→0.4`。

### 文档表述

`docs/handoff-t2-repair-collision.md`（t27）写：**"y0 下钳到足迹地坪"**、并给出"73 条 y0 下钳"的对账数字。

### canonical = **代码**（`y0 = min(记录值, 足迹地坪)`）

判定依据：代码与设计意图一致（"抬高台基的建筑不能从下方穿入" = 记录值高于地坪时下钳；记录值本来就不高于地坪时 `min()` 为恒等）。

**"文档不准"的地方只有两处措辞**，均已修正（未改任何语义）：
1. 未定义"足迹地坪"到底指什么 ⇒ 现在明确 = **足迹内最高可行走面（含台基顶/内景面/门洞通道面）**；
2. "73 条下钳"是**旧数据快照**（t75 之后大量足迹地坪抬到与记录值相等）⇒ 现在明确"下钳条数是**数据相关量**，实测 15/66"，并以 `y0Source` 逐条自证。

修正落在 `docs/CONTRACTS.md`（新增 **§6.3.1**，版本 `v1.0.12 → v1.0.13`，修订记录只追加）。

> 因此：**没有"代码不符设计意图"的情况**，无需交回派单；`OB-B-hall-mid y0=2` 与"下钳规则"并不矛盾 —— 它的足迹地坪正好是 2。

---

## 2. 定论 ②：`scripts/audit.mjs` 的"未通过"分类

### 结论：取 **(a) 保持信息性提示**，并把两类**分开成段、固定措辞**（不是 (b) 归入失败，也不是 (c) 移除）

实现（`scripts/audit.mjs`）：
- 违规与提示是两个数组：`problems`（预算违规）与 `hints`（信息性提示）；
- 输出分两段，措辞固定：
  · `预算违规（会让 --enforce 退出码为 1）：N 项`
  · `信息性提示（**不计失败**，仅记录口径/背景）：M 项`
- 结论行固定：`结论：预算违规 N 项（--enforce 时为失败）；信息性提示 M 项（不计失败）`（两者皆 0 时为"全部通过"）；
- **退出码只由违规决定**：`return ENFORCE && problems.length > 0 ? 1 : 0`（提示永不导致失败）；
- 加了**分类自检**：分类后的条目必须覆盖全部记录（提示不得被计入"未通过"）。

### 逐项说明（**本次真实输出**）

```text
$ node scripts/audit.mjs            → exit 0
 预算违规（会让 --enforce 退出码为 1）：3 项
   - 分区 B 绘制调用 61 超过预算 60
   - 分区 C 绘制调用 55 超过预算 50
   - 分区 D 绘制调用 48 超过预算 40
 结论：预算违规 3 项（--enforce 时为失败）；信息性提示 0 项（不计失败）
$ node scripts/audit.mjs --enforce  → exit 1（同上 3 项）
```
- 这 3 项是**真·预算违规**（分区绘制调用超预算），**不是**信息性提示；来源是 zone 侧内景布陈设仍在飞（t62/t63/t64），**本卡未改 zones**。
- **卡里描述的"6 项未通过但 `--enforce` 仍 exit 0"当前已不成立**：那是 t28 "按激活 LOD 档统计"口径时期的形态；今天 `--enforce` **正确地**为这 3 项真违规退出 1（LOD 单档/激活档那一组现在是 ✓ 全通过，且本卡把它归入提示类时也不会影响退出码）。
- ⇒ 本卡的交付价值正在于此：**下游不会再看到含糊的"6 项未通过"**，而是明确知道"这是违规（会失败）"还是"这是提示（不失败）"。

---

## 3. 常驻守卫（断言只增不减）

| 守卫 | 位置 | 内容 |
| --- | --- | --- |
| `y0CanonicalProblems()` | `src/core/layout-slice.js`（新增导出） | 对全部障碍逐条**复算** `y0 = min(记录值, 足迹地坪)` 并校验 `y0Source` 与之一致、下钳/保持计数不漏；返回 `{total, clamped, kept, sources, problems}` |
| audit 检查项 | `scripts/audit.mjs`（新增，**违规类**） | 调用上者；`problems.length > 0` ⇒ 推入 `problems`（`--enforce` 失败）。每次运行打印：`y0 canonical 自检：81 条障碍，下钳 15 / 保持 66（来源 {...}） ✓` |
| 分类自检 | `scripts/audit.mjs` | 违规+提示必须覆盖全部条目；提示不得进入"未通过"计数与退出码 |

`tests/core.test.mjs` 未改（43/43 ✓）；本卡新增的守卫以**导出函数 + audit 检查项**形式常驻，等价于每次 `audit` 都跑一遍自检。

---

## 4. verify（原样）

```text
$ node scripts/audit.mjs --enforce   → exit=1
   · y0 canonical 自检：81 条障碍，下钳 15 / 保持 66（来源 {"floorYAt":15,"layout":66,"null":0}） ✓
   · 预算违规（会让 --enforce 退出码为 1）：3 项 —— 分区 B 61/60、C 55/50、D 48/40
   · 结论：预算违规 3 项（--enforce 时为失败）；信息性提示 0 项（不计失败）
$ node tests/core.test.mjs           → exit=0 · 通过 43 / 43
```
**`--enforce` 仍红：3 项分区绘制调用超预算（zone 侧在飞，非本卡）** ⇒ 按工具规则本卡 verify 未全绿，已如实上报交回裁定（见 §5.1）。

---

## 5. 未验证项 / 已知限制

1. **`audit --enforce` 未绿（3 项分区预算）**：归 zone 侧（t62/t63/t64 的内景布陈设在飞）；本卡改动**不会**让它变红或变绿，只是把它**正确标注为"预算违规"**。建议：三区预算收敛后再跑一次该 verify；若届时仍红，那是真实的分区预算问题，应按 §8.2 走"调整配额并记录理由"。
2. **`hints` 目前为空**（0 项）：分类通道已就绪并可自检，但今天没有需要打成提示的条目（LOD 那组已全 ✓）。这是**如实状态**，不是"没做"。
3. **文档清理边界**：我修正了 `docs/CONTRACTS.md`（inScope）；`docs/handoff-t2-repair-collision.md`（t27 的历史回执，含"73 条"旧数字）**未改**（不在 inScope）——已在 CONTRACTS §6.3.1 明确"历史文档的该快照作废，以本节为准"。
4. **本卡不改任何语义**：`y0` 的计算逻辑一行未动（只加注释、导出与自检），audit 的判据（预算阈值、契约校验）一行未动（只加分类与措辞）。

---

## 6. attempt 2 复验（2026-09-26，三区预算收敛后）

```text
$ node scripts/audit.mjs --enforce   → exit=0
   · y0 canonical 自检：81 条障碍，下钳 15 / 保持 66（来源 {"floorYAt":15,"layout":66,"null":0}） ✓
   · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
$ node tests/core.test.mjs           → exit=0 · 通过 43 / 43
```
attempt 1 未绿的唯一原因（3 项分区绘制调用超预算）已随三区（t62/t63/t64）预算收敛消失；本卡代码与文档未再改动。

**分类通道的端到端证明（用 audit 自带的诊断旗标注入违规）**：
```text
$ node scripts/audit.mjs --enforce --draw-budget=1   → exit=1
   预算违规（会让 --enforce 退出码为 1）：1 项
   结论：预算违规 1 项（--enforce 时为失败）；信息性提示 0 项（不计失败）
```
⇒ 有违规 ⇒ 退出码 1 且归属"预算违规"段；无违规 ⇒ 退出码 0 且结论行明确"信息性提示 0 项，不计失败"。**提示通道永不改变退出码**（与 §11.6 的契约一致）。
