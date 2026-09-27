# handoff · t21 形式收口：11 条证据路径归属 + 旧路径记账机制 + `?dpr` 现状复核（t111）

任务：`t111`（repair 后继，`sourceTaskId = t21`，attempt 1）· 执行者：core-engineer（attempt_id `053c8772-53cc-4ffc-a38b-7e748ee3d697`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`docs/shots/`（仅新增声明 + 只读复核）、本回执。**未改任何既有产物**；**未触碰** `src/**`、`tests/**`、`docs/CONTRACTS.md`、`docs/handoff-ledger-closeout.md`。

---

## 1. 11 条证据：当前树存在性 + sha256（内容未改）

平台记录 `imperial-palace copy 3/docs/shots/t2-*-night|dusk.png` ×11（ROOT 重命名前的旧前缀）。
**实测旧 ROOT 目录已不存在**；11 张产物**全部在当前树**（t21 交付构成：night×8 + dusk×3）：

| 文件（当前树） | 字节 | sha256（前 16） | mtime |
| --- | --- | --- | --- |
| `docs/shots/t2-oblique-night.png` | 187,060 | `eeb60f4435ea53c1…` | 09-26 14:23 |
| `docs/shots/t2-iso-night.png` | 317,407 | `3f733bc3ff51bb1d…` | 09-26 14:25 |
| `docs/shots/t2-axis-night.png` | 386,607 | `7a2186c098cd44dc…` | 09-26 14:26 |
| `docs/shots/t2-zone-night.png` | 187,066 | `b9a4075c590ec4e9…` | 09-26 14:28 |
| `docs/shots/t2-focus-night.png` | 690,019 | `f73727baadecee0a…` | 09-26 14:30 |
| `docs/shots/t2-interior-night.png` | 612,533 | `130803a4b092b5e0…` | 09-26 14:35 |
| `docs/shots/t2-fp-night.png` | 175,116 | `33e233566ac074d7…` | 09-26 14:38 |
| `docs/shots/t2-orbit-night.png` | 695,734 | `1c1fc8c0313a49a6…` | 09-26 12:16 |
| `docs/shots/t2-oblique-dusk.png` | 237,715 | `9055c5a487cd08a9…` | 09-26 14:22 |
| `docs/shots/t2-iso-dusk.png` | 384,201 | `81c51980e40fe3ba…` | 09-26 14:24 |
| `docs/shots/t2-zone-dusk.png` | 237,702 | `fb67115489ff6c34…` | 09-26 14:28 |

完整 sha256 与声明见新增的 `docs/shots/t21-path-migration.md`（新文件，**未改** PNG/manifest/README）。

## 2. 旧路径记账的机制解释（**无法由本卡声明覆盖**，不作清除声明）

1. 平台账本保存的是 **完成时的路径字符串快照**（旧前缀 `imperial-palace copy 3/…`）；只读诊断显示团队状态里存有 14 条这类旧路径字符串（含本卡 11 张，以及任务卡文本中提到的其它 dusk 名称）。
2. 新卡 `changedPaths` 只能声明**当前树相对路径**（`imperial-palace-dsh-1.1b/docs/shots/…`）；与旧快照**字符串不等** ⇒ `unaudited path` 的比对无法命中。
3. `t21` 已是**终态 failed**，平台不会对其重跑产物审计；后继卡声明只覆盖本卡自己的路径集合。
⇒ **在不改平台账本、不改历史任务记录的前提下，这 11 条记录无法消除。** 本卡**不声称已闭合**。
建议处置（交主理人裁定）：(a) 由账本收口卡逐条映射到当前树路径并注明前缀迁移；(b) 平台侧对历史记录做一次旧→新前缀重写；(c) 以"历史快照不可重解析"归档，并附本表作为可复核替代证据。

## 3. t21 实质目标复核：`?dpr` 健壮性（当前树实测，真实浏览器）

代码现状：`src/core/renderer.js:42-60` `resolvePixelRatio(wanted, {config, tier})`（`null/undefined`、空串、`NaN`、非有限、非正数分别给出原因串并**回落质量档 dpr**，再夹到 `[0.5, maxPixelRatio]`）；`renderer.js:900-901` `dprInfo()` 暴露解析结果；`src/main.js:60` `Number(params.get('dpr'))` → :158 传入。
实测（`chrome-headless-shell` + `disable-gpu`，1440×900，`?ui=0&shot=1&view=oblique&preset=golden&dpr=<值>`，每值一次独立加载）：

| `?dpr=` | ready | 解析后 DPR | 有限 | 落在 [0.5,2] | 运行时可读告警 |
| --- | --- | --- | --- | --- | --- |
| `abc` | ✓ | **1** | ✓ | ✓ | `[renderer] 忽略非法 dpr=null（NaN）（需要有限正数）→ 回落质量档 medium 的 dpr=1；画布像素比率保持有限正值。` |
| `-3` | ✓ | **1** | ✓ | ✓ | `… dpr=-3（non-positive）…` |
| `0` | ✓ | **1** | ✓ | ✓ | `… dpr=0（non-positive）…` |
| `Infinity` | ✓ | **1** | ✓ | ✓ | `… dpr=null（non-finite）…` |
| `1e999` | ✓ | **1** | ✓ | ✓ | `… dpr=null（non-finite）…` |
| 空值 `?dpr=` | ✓ | **1** | ✓ | ✓ | `… dpr=0（non-positive）…` |
| `1.5`（合法对照） | ✓ | **1.5** | ✓ | ✓ | 无告警（合法值原样生效） |

**结论**：非法值**不崩溃**、全部回落为**有限正比率**（medium 档 dpr=1）、并给出**可读告警**；合法值精确生效 ⇒ **t21 的实质目标在当前树成立**。
**一处口径细节（如实记录，非缺陷）**：`?dpr=`（空值）走的是 `Number('') === 0` ⇒ 原因串为 `non-positive`，而非 `resolvePixelRatio()` 里的 `empty-string` 分支；该分支只在调用方直接传**原始字符串**时才可达。行为与安全结论不变（仍回落 + 告警）。

## 4. verify（原样）

```text
$ node scripts/audit.mjs --enforce → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
（主场景绘制调用 333/350 批次 ✓；可见三角面在限内 ✓。）本卡未改任何判据、未列入 run.mjs。

## 5. 未验证项 / 已知限制

1. **平台账本不可写**：本卡只能"声明 + 复核 + 实测"，**旧路径记录是否消除取决于主理人/平台侧**（见 §2 建议）。
2. **`?dpr` 实测覆盖**：7 个取值 × 1 次独立加载（每次真实浏览器）；未做长时间压力/多页连播复核（t63 类白屏属 headless 环境特性，与本目标无关）。
3. **11 张产物的内容未复核**（只算 sha256 与存在性，按卡要求"不改内容、不夸大"）；其判据归属见 t21 原回执与 t26/t13 的判据收口。
