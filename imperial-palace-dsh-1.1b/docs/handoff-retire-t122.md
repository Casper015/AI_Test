# 回执 · t122 形式收口：真实失败原因 + 反证结论 + 实质交付 + 残余归属（t161）

任务：`t161`（repair，形式收口，attempt 1）· 执行者：core-engineer（attempt_id `b3e739ae-07d6-4a6e-9d06-1397d1704015`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
本卡 inScope：**仅新建本文件**。**未改任何代码/测试/契约**；**未改写任何既有回执与产物**（只读复核 + 新建收口记录）。

平台标志：`t122 failed without a follow-up repair` —— 本文件即其形式收口。

---

## 1. t122 判 failed 的**真实原因**（非本卡引入）

`t122` 的三条 verify 中，`core-environment`（12/12）与 `audit --enforce`（exit 0）当次即绿；
**唯一红项是 `node tests/core.test.mjs`**，报：

```text
✗ 灰盒满足全部契约字段与数量（… 169 可走面 … LAYOUT 1.1.15）：期望 169，实际 171
```

**归因（当时实测、非推断）**：t122 执行期间，`src/shared/layout.js` 被**别的卡**改动（mtime 18:57:32），
`WALKABLE 169 → 171`、`LAYOUT_VERSION 1.1.15 → 1.1.16`（byKind `ground 62→64`，t131 给 `E-court3-hall` 补 2 级台阶）。
而 169 这个 pin 由 **t130** 维护，且 **`tests/core.test.mjs` 不在 t122 的机器 inScope**（该卡 inScope 只有
`src/core/environment.js`、`tests/core-environment.test.mjs`、`docs/handoff-t2-env-override.md`）
⇒ t122 **按契约办事、未越界改 pin**，只如实上报并给出二选一处置建议（派 pin 卡 / reassign 并把该文件写进 inScope）。
**⇒ 该红项来自外部并发改动与卡间时序，不是 t122 引入的缺陷。**

## 2. 反证结论成立且已入库：`?env=` **没有**绕过 Bloom（t106 的 F1 前提不成立）

t122 的原始命题是"`?env=` 覆盖会静默改变 Bloom 路径（`exposure=0.95` 反而更亮）"。实测**推翻了该命题**：

| 证据 | 内容 |
| --- | --- |
| 机制（file:line，**当前树仍是这一行**） | `src/core/environment.js:564`：`const presetOf = (id) => ({ ...presets[id], ...(overrides[id] ?? {}) });` ⇒ **逐键 spread（浅层深合并）**，补丁里没有的键（**含 `bloom`**）原样保留 |
| Node 三组最小对照 | 无覆盖 exposure 1.06 / bloom 0.3；覆盖 `{exposure:0.95}` ⇒ exposure **0.95**、bloom **0.3 逐值不变**；覆盖 `{sunIntensity:5}` ⇒ exposure 1.06 未变、bloom 未变 |
| 真实浏览器 A/B/C（interior C-hall-bed-main, sunset） | A 无覆盖：exposure 1.06 / bloom eff 0.15 / 整帧均值 **0.4063**；**B `?env=exposure=0.95`：exposure 0.95 / bloom eff 0.15 不变 / 均值 0.3817（更暗，方向正确）**；C `?env=sunIntensity=5`：1.06 / 0.4064；三组截断均 0% |

⇒ **t106 报的"更亮 0.6698 vs 基线 0.4164、截断 0.18%"在 t122 当时与当前树都无法复现，也不能归因于该通道**（t122 给的"对比基准错配"为**假设**，已标注；未据此改写 t106 的其它结论）。
**主理人批卡依据（"`?env=` 会改变被测语义"）因此不成立** —— 这一点已在 t122 回执中承认，本卡复述登记。

## 3. 实质交付（t122 的落地物，仍留在树里）

`tests/core-environment.test.mjs` 现为 **12 用例 / 12 通过**，其中 **t122 新增 3 条**（当前树行号）：

| 用例 | 位置 | 断言要点 |
| --- | --- | --- |
| `t122①：三组最小对照` | `tests/core-environment.test.mjs:300` | 无覆盖 / 覆盖 `exposure` / 覆盖其它键 ⇒ 覆盖**只改该键**；`bloom.baseStrength/effectiveStrength/interiorTier` 与无覆盖**逐值相同**；并锁定 `sunset.exposure===1.06`、`sunset.bloom.strength===0.3` |
| `t122②：任意覆盖下“只有该键变化”` | `:321` | 8 组覆盖（`exposure/sunIntensity/ambientIntensity/hemiIntensity/lampDistance/lampIntensityScale/fogFar/未知键`）× **`bloom` 的 7 个字段逐值不变** + **未知键零影响** + `preset` 不变 |
| `t122③：方向性铁律` | `:359` | `exposure=0.95`（< 预设 1.06）必须读出更小值、`1.5` 更大 ⇒ **调低曝光"反而更亮"在语义上不可能**（今后该类读数只能来自对照基准问题） |

`src/core/environment.js` 在 t122 中**一字未改**（诊断确认无需修改）；其后的 Bloom 改动（t106/t120）属别人的卡。

## 4. 残余归属（谁接走了什么）

| 残余项 | 承接 | 现状（只读复核） |
| --- | --- | --- |
| 排障口径与内景过曝四步顺序（`?env=` 只改显式键 / A-B 自检同向 / 先量 Bloom） | **t133 → `docs/CONTRACTS.md §12.5`** | 已入库（`grep §12.5 诊断通道纪律与过曝排查顺序` 命中；契约版本 `v1.0.18`） |
| core 侧冻结计数 pin（外部并发改动引发的 169→171） | **t136**（同步到 167 / LAYOUT 1.1.17，因 t134 删 4 片残片）→ **t152**（再同步到 171） | 已闭合；**当前树实测 `LAYOUT_VERSION 1.1.20`、`WALKABLE 171`**（见 §5） |
| t122 自身的 failed 记录 | **本卡（t161）** | 形式收口：原因、反证、交付、归属全部登记在案 |

## 5. 当前树实测（本卡只读复核，未改任何文件）

```text
$ node --input-type=module -e "…loadModule('src/shared/layout.js')…"
LAYOUT_VERSION 1.1.20 | WALKABLE 171

$ node tests/core-environment.test.mjs
exit=0 · 通过 12 / 12          （含 t122 的三条用例）

$ node tests/core.test.mjs
exit=0 · 通过 45 / 45
  · WALKABLE 171 条组成：outerTerrain:4 / ground:68 / bridgeDeck:4 / gardenGround:1 / terrace:8 / interior:43 / passage:43；transition 49 面 / 21 栋；threshold 2 面   （= 171；ground 68 为当前实测值）

$ node scripts/audit.mjs --enforce
exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```

## 6. 边界与未验证项（不夸大）

1. **t106 的 0.6698/0.4164 我仍未复现**，且**不声称"t106 当时一定错"**：只能断定该读数**不能由 `?env=` 合并通道解释**；其对照口径需 t106 侧核。
2. 浏览器 A/B/C 只覆盖 **1 个内景格**（C-hall-bed-main / sunset）；机制结论由 Node 三组对照 + 该 A/B 共同支撑。
3. 本卡**未改任何代码**，因此 §5 的绿是**当前树既有状态**，不是本卡"修好"的结果。
4. 历史未改写：`docs/handoff-t2-env-override.md`（t122 原回执，8,899 B）与其他卡的回执**原样保留**。
