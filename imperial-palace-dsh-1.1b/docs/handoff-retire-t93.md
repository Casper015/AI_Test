# 回执 · t93 形式收口（T1.67 / t160）

> **本文件只做登记与承接，不改历史、不改代码、不夸大。**
> `docs/handoff-ledger-closeout.md` 仅作为只读输入引用。

## 1. 平台标志与真实失败原因
- 平台标志：`t93 failed without a follow-up repair`。
- **真实失败原因（唯一残余）**：`tests/zone-forecourt.test.mjs` 中一条断言 —— “从地坪走可入门内 ≥4”，实测 **3**（`t93` 当时的读数）。
- **该缺口不在 `t93` 的 inScope**：修复需 **layout 侧 ROAD/几何**，而 `t93` 的 inScope 是 config/zone 的**配额口径**（`D_BUDGET_*` 系列）。

## 2. `t93` 的核心目标（已达成）
`t93` 的交付目标是把**D 区绘制调用预算**收敛到**单一权威源**，其产物为：
- `D_BUDGET_APPROVED = BUDGET.drawCalls.perZone.D`（不再另立数字）；
- `D_BUDGET_EFFECTIVE` **去掉 `Math.max()` 临时余量**；
- 历史值**改名**为 `D_BUDGET_DIAGNOSTIC_INITIAL` 并**仅用于打印**。
- **本轮实读（只读 grep，命令见 §5）**：
```
tests/zone-west.test.mjs:675:const D_BUDGET_DIAGNOSTIC_INITIAL = 40;                   // 历史值（文档化，仅打印）
tests/zone-west.test.mjs:676:const D_BUDGET_APPROVED = BUDGET.drawCalls.perZone.D;      // t93：唯一权威源（原临时常量 56，已收口）
tests/zone-west.test.mjs:677:const D_BUDGET_EFFECTIVE = BUDGET.drawCalls.perZone.D;     // t93：严格等于权威源（不再 max() 临时余量）
tests/zone-west.test.mjs:679:await runner.test(`D 区绘制批次 ≤ 已批准预算 ${D_BUDGET_EFFECTIVE}（初始配额 ${D_BUDGET_DIAGNOSTIC_INITIAL}；medium 档，audit 同口径）`, () => 
tests/zone-west.test.mjs:681:  assert(measured <= D_BUDGET_EFFECTIVE, `绘制批次 ${measured} 超过已批准预算 ${D_BUDGET_EFFECTIVE}`);
tests/zone-west.test.mjs:683:  assert(kitCount <= D_BUDGET_EFFECTIVE, `kit 口径 ${kitCount} 超已批准预算`);
tests/zone-west.test.mjs:684:  runner.info(`D 区 ${measured} 批次：超初始配额 ${D_BUDGET_DIAGNOSTIC_INITIAL}（诊断目标）${measured - D_BUDGET_DIAGNOSTIC_INITIAL} 桶，在
```
**本轮实读（只读 grep，命令见 §5）——已在 `tests/zone-west.test.mjs` 中定位到全部三项，逐字如下**：
```
tests/zone-west.test.mjs:675:const D_BUDGET_DIAGNOSTIC_INITIAL = 40;               // 历史值（文档化，仅打印）
tests/zone-west.test.mjs:676:const D_BUDGET_APPROVED = BUDGET.drawCalls.perZone.D; // t93：唯一权威源（原临时常量 56，已收口）
tests/zone-west.test.mjs:677:const D_BUDGET_EFFECTIVE = BUDGET.drawCalls.perZone.D;// t93：严格等于权威源（不再 max() 临时余量）
tests/zone-west.test.mjs:679:await runner.test(`D 区绘制批次 ≤ 已批准预算 ${D_BUDGET_EFFECTIVE}（初始配额 ${D_BUDGET_DIAGNOSTIC_INITIAL}；medium 档，audit 同口径）`, …
```
⇒ 与 `t93` 的交付描述**逐条一致**：① 权威源 = `BUDGET.drawCalls.perZone.D`；② `EFFECTIVE` **严格等于**权威源（**无 `Math.max()`**）；③ 历史值 `40` 仅作**诊断打印**。
**如实登记**：这三项位于 **`tests/zone-west.test.mjs`**（测试侧口径），`src/` 内**未**检索到同名标识符（本轮 grep 覆盖 `src/`、`tests/`、`scripts/`）。

## 3. 残余已由后续几何修复自然消解（**当前树实测**）
| 项 | 当前实测（本轮） |
| --- | --- |
| `LAYOUT_VERSION` | **1.1.20** |
| `WALKABLE` | **171** |
| `tests/zone-forecourt.test.mjs` | **通过 38 / 39** |
| 当前唯一失败项 | **另一类**：`§3.3/§4/§5/§6/§8.3 …：期望 51，实际 53`（**计数期望**，属 §4） |
| `:687`「从地坪走可入门内 ≥4」（t93 当时实测 3） | **不再出现在失败清单中** |

⇒ **结论（就事论事）**：`t93` 当时那条“≥4 实测 3”的残余，**在当前树上已不再失败**；消解它的是其后的几何修复链：
`t134`（通道面 y 恢复 1.5/1.7）→ `t151`（门外**加法**下坡带）→ `t158`（**float32 裕量梯链** 1.7↔1.3↔1.0↔1.45↔1.92↔2.4，逐跳 ≤0.48）。
**不夸大**：本回执**不主张** `zone-forecourt` 已全绿（它当前是 **38/39**，唯一失败是**计数期望**），也**不主张**“所有可达性已闭合”。

## 4. 残余归属
- `zone-forecourt` 的**计数/期望同步**（`期望 51，实际 53`）以及**五套 zone 的期望同步**：归属 **t115**（本轮已唤醒）。
- 与 `t93` 的关系：`t93` 的残余（可达性读数）**已不再失败**；当前唯一的 zone 失败项**不是** `t93` 的残余。

## 5. 复核命令（只读，逐条可直接复跑）
```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b"
grep -rn "D_BUDGET_APPROVED\|D_BUDGET_EFFECTIVE\|D_BUDGET_DIAGNOSTIC_INITIAL\|D_BUDGET_INITIAL" src/ tests/ scripts/
node --input-type=module -e "const M=await import('./src/shared/layout.js');const L=M.default??M;console.log(L.LAYOUT_VERSION, L.WALKABLE.length)"
node tests/zone-forecourt.test.mjs
node scripts/audit.mjs --enforce
```

## 6. 纪律声明
- 本卡**只新建本回执**；**未改** `src/**`、`tests/**`、`docs/CONTRACTS.md`、任何既有回执与产物。
- 未引用未实测的数字；未把“未运行”写成“已通过”。
