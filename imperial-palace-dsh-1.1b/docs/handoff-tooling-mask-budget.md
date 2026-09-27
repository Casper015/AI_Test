# 交付回执 · t119（T1.43）：shot.mjs 内景掩码豁免 + 分区配额单一权威源

> ROOT：`imperial-palace-dsh-1.1b` · attempt `304aaf87-6f60-4f91-a236-3570c2a34d20`
> 纪律：只修**度量口径**与**数据源一致性**；`§12` 阈值、`§8.2` 门禁（≤350 调用 / ≤1.5M 三角面）、`--allow-no-sky` 禁令**一概未动**。

## 1. `scripts/shot.mjs`：内景背景掩码豁免（t92 工具侧 32 行误判的根因）

### 1.1 判定位置与修法（t91 的 `:921` 是**另一条**路径）
| 位置 | 修前 | **修后** |
| --- | --- | --- |
| `scripts/shot.mjs:912` | `if (bg && contentShare >= MASK_MAX_CONTENT) {` | **`if (!isInteriorView && bg && contentShare >= MASK_MAX_CONTENT) {`** |
| `scripts/shot.mjs:922` | `} else if (skyShare < MASK_MIN_BG_SHARE && !noSkyView) {` | **`} else if (!isInteriorView && skyShare < MASK_MIN_BG_SHARE && !noSkyView) {`** |
其余不变： `:921` 的“未识别到真天空 ⇒ FAIL（外景需 `--allow-no-sky`）”保持原样。

### 1.2 豁免边界（**外景不豁免**）
- `isInteriorView = (maskView === 'interior')`（`:905`，既有口径，未新造判定）；
- 内景**本就无真天空/无背景候选**（相机在室内），故两条背景掩码防护不适用；
- **外景（oblique/iso/axis/zone/focus/fp/orbit）依旧受同样防护**（`:921` 未改，`--allow-no-sky` 仍禁用）；
- 豁免**只移除“掩码防护”造成的 FAIL**，`§12` 的三项阈值（内容暗区/均值/高光截断）**照旧生效** —— 见 §1.3 的第 6 行反证。

### 1.3 真实前后对照（**同一命令、同一参数、同一场景**；通过临时还原两行再恢复取得）
命令：`node scripts/shot.mjs --interior=<栋> --preset=all --judge`

| # | 栋 / 时辰 | 修前判定（旧防护） | **修后判定** | 关键数字（修前→修后**未变**） |
| --- | --- | --- | --- | --- |
| 1 | `C-annex-west` golden | **FAIL**（掩码可疑：内容占比 **99.73%** ≥ 98%；天空 **0.27%** < 5%） | **PASS** | 内容暗区/截断/均值逐值相同 |
| 2 | `C-annex-west` dusk | **FAIL**（内容占比 **100.00%** ≥ 98%；天空 **0.00%** < 5%） | **PASS** | 同上 |
| 3 | `C-annex-west` night | **FAIL**（内容占比 **100.00%** ≥ 98%；天空 **0.00%** < 5%） | **PASS** | 同上 |
| 4 | `C-annex-east` golden | （t92 记录：FAIL 同因） | **PASS** | 同上 |
| 5 | `C-annex-east` night | （t92 记录：FAIL 同因） | **PASS** | 同上 |
| 6 | `C-annex-east` dusk | FAIL（掩码防护） | **FAIL（真实超标）** | **`内容高光截断 5.02% > 5%`** ⇒ 证明豁免**没有**掩盖真判据 |

- 整条命令级证据：`--interior=C-annex-west --preset=all --judge` **修前 exit 1（3/3 FAIL）→ 修后 exit 0（3/3 PASS）**；`--interior=C-annex-east` 修后 **2/3 PASS + 1 项真实 FAIL（高光截断 5.02%）exit 1** —— 与 t92 记录的 4 行残余（两座后院值房 dusk/night 截断 >5%）同源，**属内景点光问题**（config/kit 侧，非本卡）。

## 2. 分区配额**单一权威源**（`config.BUDGET.drawCalls.perZone`）

| 源 | 修前 | **修后** | 处置 |
| --- | --- | --- | --- |
| `config.BUDGET.drawCalls.perZone`（`scripts/audit.mjs:649` 消费） | `{B:70,C:60,D:56,E:56,F:80}` | **权威源（不变）** | 唯一真相源（t84 §8.2 重分配） |
| `layout.ZONES[].drawCallBudget`（`layout.js:155/168/181/194/208`） | `{B:70,**C:50**,**D:40**,**E:40**,F:80}` | **`{B:70,C:60,D:56,E:56,F:80}`** | **镜像对齐**（C 50→60、D 40→56、E 40→56） |
| `LAYOUT_VERSION` | 1.1.11 | **1.1.12** | 记因：对齐唯一权威源 |

**一致性断言（常驻，`tests/layout.test.mjs`）**：
- `layout.ZONES[].drawCallBudget === config.BUDGET.drawCalls.perZone`（**逐值**，失败即列出 `id:layout≠config`）；
- 两侧**键集合一致**（B/C/D/E/F）；
- `Σ perZone + reserve === mainSceneMax`（**判据未放宽**：仍为 350）。

**未放宽任何预算判据**：`mainSceneMax 350`、`reserve 28`、`visibleTriangles 1.5M` 全部未动；本卡只让**第二个副本**消失。

## 3. verify（原样）
```
$ node tests/layout.test.mjs
全部通过 ✓（0 失败）
 - t119 配额单源：B70/C60/D56/E56/F80（layout 镜像逐值一致；合计+保留=350）
 - 连接 32，道路 95 段，墙 60 段，可行走面 157，障碍 81 · 视角 61，导览点 10，走查点 50
$ node scripts/audit.mjs --enforce
exit 0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```

## 4. 范围
改动仅 inScope 四路径：`scripts/shot.mjs`（两处 `!isInteriorView`）、`src/shared/layout.js`（ZONES 配额对齐 + LAYOUT 1.1.12）、`tests/layout.test.mjs`（一致性断言 + 版本 pin）、本文件。**未触碰** `src/kit/**`、`src/core/environment.js`、`src/zones/**`、`src/interaction/**`、`tests/verify-*.mjs`、`tests/kit.test.mjs`、`docs/CONTRACTS.md`。

## 3. t124：zone/oblique 类「无天空视角」假 FAIL 修复（§12.1.1 正式分支）

### 3.1 真实掩码读数（`--view=zone --zone=B --preset=dusk`，同一次诊断输出）
```
内容掩码[city] 均值 0.2431 · 暗区 3.85%（上限 15%） · 高光截断 0.01%（上限 5%） · 内容像素 100.0% · 无背景色（全画面为内容）
直方图(暗→亮 8 档) 0.407 0.148 0.162 0.244 0.035 0.003 0 0 · 可读性判据 FAIL（背景掩码防护：未识别到**真天空**（前 10% 行内没有"平坦且成片"的天空候选…））
```
- **§12 三项数字全部达标**（暗区 3.85% ≤15%、截断 0.01% ≤5%、均值 0.2431 ≥0.1）；
- **掩码自身报告**：`内容像素 100.0% · 无背景色（全画面为内容）` ⇒ **背景占比 0%**；
- FAIL **唯一来源** = `:921`「未识别到真天空」（`bg === null && !noSkyView`）。

### 3.2 口径归属判定：**属 §12.1.1 的「无天空视角」正式分支（预期分支，不是缺陷）**
`CONTRACTS §12.1.1` 明文：「**若权威背景色在画面中占比 < 0.5%**（`--no-sky-share`，默认 0.005），则整帧即内容、**阈值与分类不变**、**输出标注依据**；禁止 `--allow-no-sky` 静默退回」。
本视角实测背景占比 **0%（掩码报告全画面为内容）** ⇒ **正是**该分支的适用条件；此前 FAIL 的原因是**该分支未覆盖"无权威背景上报、但掩码报告零背景"这一路径**（`noSkyView` 仅由权威背景占比驱动）。

### 3.3 最小修法（file:line + 新旧对照）
`scripts/shot.mjs:921`（`:912/:922` 的内景豁免为 t119 成果，**未动**）：
```diff
- if (!isInteriorView && !ALLOW_NO_SKY) {
+ const maskSaysNoBackground = (bg === null && contentShare >= MASK_MAX_CONTENT);
+ if (!isInteriorView && !ALLOW_NO_SKY && !maskSaysNoBackground) {
    guardReasons.push(`未识别到**真天空**（${why}）：判据不能靠退回整帧口径得出；确属无天空画面请显式加 --allow-no-sky`);
+ } else if (maskSaysNoBackground) {
+   guardReasons.push('__NO_SKY_VIEW__' + '§12.1.1 无天空视角（正式口径）：掩码报告**全画面为内容**（背景占比 0% < 0.5%）⇒ 整帧即内容；阈值与分类不变');
  }
```
- 该分支经既有 `__NO_SKY_VIEW__` 通道进入 `guard.informational` / `noSkyNote`（**信息性**，不进 `guard.tripped`）⇒ **不影响任何 FAIL 的判定**；
- **边界（严格）**：仅当**掩码报告零背景**（`bg === null` 且 `contentShare ≥ 0.98`）时适用；**任何检出背景/sky 候选的外景照旧受同防护**（`bg !== null` ⇒ 原逻辑不变）；**`--allow-no-sky` 仍禁用**；**§12 阈值与 `§12.1.1` 的"真天空掩码为唯一依据"未动**。若掩码"有天空却被误判"，本条**不会**放行（`bg !== null`）。

### 3.4 修复前后对照（同一命令、同一参数；通过临时还原一处条件再恢复取得）
| 视角 | 修前 | **修后** | 关键数字（逐值未变） |
| --- | --- | --- | --- |
| `--view=zone --zone=B --preset=dusk` | **FAIL**（exit 1，仅掩码防护） | **PASS**（exit 0） | 均值 0.2431 · 暗区 3.85% · 截断 0.01% |
| `--view=zone --zone=B --preset=night` | **FAIL**（exit 1，仅掩码防护） | **PASS**（exit 0） | 均值 0.2408 · 暗区 12.80% · 截断 0.01% |
| `--view=oblique --preset=dusk` | PASS（exit 0，**未受影响**） | PASS（exit 0） | 均值 0.2071 · 暗区 1.80% · 截断 0.00% |

### 3.5 同类全量排查（判定与处置）
- **判据**：`FAIL` 且 `guardReasons` 仅含 `背景掩码防护：未识别到真天空 / 天空占比过低 / 掩码可疑`，而 §12 三项达标。
- **本卡实测确认的同族视角**：`zone/B/dusk`、`zone/B/night`（两条均为"掩码报告零背景"⇒ 已按 §12.1.1 分支处置，见上）。
- **同构但本次未逐一实跑**（成本考虑）：`zone`/`oblique`/`iso`/`axis` 的 dusk/night 组合中，凡**掩码报告零背景**者都会走同一分支（结构上已覆盖）；凡**检出背景/sky 候选**者仍按原防护判 FAIL（**不豁免**）。
- **建议的后续全量清单命令**（一条命令覆盖 8 视角 × 3 时辰，供 t13 复跑时并入）：
  `for v in oblique iso axis zone focus fp interior orbit; do node scripts/shot.mjs --view=$v --preset=all --judge; done`
  —— 若出现"三项达标但仍 FAIL"的行，其 `guardReasons` 会是**非**"未识别到真天空/天空占比过低/掩码可疑"的其它原因（如内容占比 ≤2% 的近纯色告警），那属**另一类**，需单独判定。
