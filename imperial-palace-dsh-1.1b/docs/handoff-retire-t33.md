# t33 形式收口：取代登记（t38 / t43）+ 当前实测 + 残余归 t106（t109）

> 卡号：`t109`（repair，attempt 1）· 执行者：kit-engineer（attempt_id `a17726ea-85ae-44f9-afb5-e3775b59464a`）
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 日期：2026-09-26 · 版本组合（本卡实测时）：`CONTRACTS v1.0.16` ⇄ `CONFIG_VERSION 1.0.7` ⇄ `LAYOUT_VERSION 1.1.12` ⇄ `KIT_VERSION 1.0.1`
> **本卡唯一产物 = 本文件**。不改写任何既有产物：`docs/shots/**` 零写入、其他回执零修改、`docs/handoff-ledger-closeout.md` 作为**只读输入**引用不改。
> 本卡的用途：平台 `Delivery: blocked` 列出 `t33 failed without a follow-up repair`，
> t107 已在账本里登记"取代"，但平台要求的是**repair 类后继任务（sourceTaskId 指向失败卡）**，故由本卡补齐这一形式要件。

---

## 0. 本卡做了什么 / 没做什么（先说不夸大）

**做了**：把 t33 的 failed 归因、承接关系（t38/t43）、**当前树上实测**、以及与 t106 的残余边界，登记成一份可独立引用的形式收口文件。

**没做**：**没有**、也**不代替任何卡**宣称 t33 的目标"已闭合"。截至本卡，**逐视角内景可读性读数（暗区 / 高光截断逐格判定）仍归 `t106`**（其在办/已交付范围），本卡只在 §3 转述与自测了**金銮殿一个机位 × 三时辰**的读数，其余逐视角矩阵**未被本卡验证**。
本文件的任何一句都不得被解读为"t33 的目标已经全部达成"。

---

## 1. ① 判 failed 的真实原因（引用 t107 §2 的证据链）

**结论：t33 不是实现失败，而是"目标未由 kit 侧达成 + 随后被环境侧/系数侧承接"**。证据链如下。

### 1.1 平台标志（外部视角）

`Delivery: blocked` 列出：`t33 failed without a follow-up repair`
⇒ 平台只认"失败的 repair 卡缺少 repair 类后继"。本卡即为该后继（形式要件），**不改变 t33 自身的判定**。

### 1.2 账本登记（`docs/handoff-ledger-closeout.md`，t107；本卡只读引用）

> 该文件第 12 行：`| 3 | **failed without follow-up repair** | \`t33\`（内景白天/夕照可读性） | 取代登记：由 **t38 / t43** 承接；附当前实测（见 §2.1） | ✅ 取代已登记；**残余项**归 t106（非本卡） |`
>
> 该文件第 17 行：`- **t33 的残余可读性超标项**（若有）：属 **t106** 的在办范围（该卡持有逐视角读数）；本卡只复跑 \`audit --enforce\`（预算/契约）与声明，**未持逐视角可读性读数**，故不代其宣称闭合。`
>
> 该文件 §2.1：`### 2.1 t33（内景白天/夕照可读性）→ 由 **t38 / t43** 承接`
> `- **承接内容**：t38 = \`CORE_INTERIOR\` 内景补光体系（室内体量入内点亮 + 三时辰系数）；t43 = 金辉/夕照系数的最终档（goldenHour 6.2/2.6、sunset 2.4/1.05、moonlitNight 1.0/0.42）。`
> `- **残余未闭合项**：**逐视角可读性读数（暗区/clip 的按视角判定）不属本卡 inScope/数据**；若仍有超标视角，由 **t106** 处置（其在办）。本卡**不代其宣称闭合**。`

### 1.3 t33 自身回执里的真实读数（`docs/handoff-t3-repair-interior.md`，kit-engineer）

- t33 的目标是"金銮殿与寝殿两个内景机位 × 三时辰，内容暗区 ≤30%"（CONTRACTS §12 内容掩码口径）。
- 该卡在 **kit 侧**实施并验证了"真实窗洞 + 透光窗扇（不投影）"，实测：
  `金銮殿 golden 66.17% → 65.93%`、`dusk 48.76% → 48.97%`、`night 1.36% → 1.36%`；
  `寝殿 golden 56.04% → 55.99%`、`dusk 53.56% → 53.17%`、`night 40.66% → 40.82%`
  ⇒ **kit 侧手段 Δ≈0（噪声量级）**，目标未由几何侧达成 ⇒ 该卡按任务卡第 4 条作为 **failed** 交回，
  并给出量化边界（ambient 需 ≈8×、宫灯拉满仍 >30%；主因：44° 太阳过 4m 窗带水平射程仅 ≈4.2m，室内可见内容在洞口后 10–30m，无 GI，金砖线性反照率 ≈0.0102）。
- 失败的性质是 **"目标未达成（手段边界）+ 目标转移"**，不是"实现有缺陷/回归"：t33 的 kit 交付物（真窗洞 + 透光窗扇 + §18 断言）在其后仍保留在树上并持续通过回归。

### 1.4 一句话归因

**t33 = 目标未由 kit 侧达成（Δ≈0，已量化交回）后被**环境侧补光体系（t38）与系数整定（t43）承接**；平台缺的是 repair 类后继登记，本卡补登记，不重开 t33。**

---

## 2. ② 承接卡：t38 / t43（当前树上可核对的交付物）

| 承接卡 | 回执 | 交付内容（当前树上） | 本卡核对方式 |
| --- | --- | --- | --- |
| **t38**（T2.9 内景可读性·环境侧） | `docs/handoff-t2-repair-interior.md`（标题：`# handoff · T2.9 内景可读性（环境侧）：内景专属补光 + 环境贴图生效（t38）`） | ① 内景体积入境点亮：`src/core/environment.js` 的 `interiorVolumes` + `updateInteriorFill()` + `interiorAmbient/interiorHemi`（相机入内景体积才点亮，四周外扩 1.2m、向上 9m）；② 内景环境贴图：由当前时辰天空色生成 equirect 并**只绑定内景材质**（`bindInteriorEnvMaps()`，不新增绘制批次） | 读 `src/core/environment.js`（第 ~150–300 行）+ 其回执 §1/§2 |
| **t43**（T2.10 内景补光系数回调 + 六格双约束机器断言） | `docs/handoff-t2-interior-coeff.md`（标题：`# handoff · T2.10 内景补光系数回调 + 六格双约束机器断言（t43）`） | ① 三时辰内景补光系数最终档（当前树 `INTERIOR_FILL`）：`goldenHour {ambient 6.2, hemi 2.6}` / `sunset {ambient 2.4, hemi 1.05}` / `moonlitNight {ambient 1.0, hemi 0.42}`；② **六格双约束机器断言**：`tests/core-interior.test.mjs`（暗区 ≤0.30 且截断 ≤0.05，B/C × 三时辰） | 读 `src/core/environment.js` 第 152–157 行（`INTERIOR_FILL` 冻结表）；跑 `node tests/core-interior.test.mjs` |

**承接物在树上的当前状态（本卡实测）**：

```text
$ node tests/core-interior.test.mjs
 通过 13 / 13，skip 1
 （skip 项：CORE_INTERIOR_LIVE 未设置 → 跳过浏览器重拍，默认快模式只校验系数/剂量/记录值；
   需要强证据时：CORE_INTERIOR_LIVE=1 node tests/core-interior.test.mjs，六格各 ~30s）
```

⇒ t43 的**六格双约束断言确实存在于当前树且全绿**，这就是"目标已由 t43 承接并在机器断言层持续守护"的当前证据；
浏览器实拍层的**逐视角矩阵**归 verifier / t106（见 §4），本卡不复跑全矩阵。

---

## 3. ③ 当前树上该目标的实测结论

### 3.1 `node scripts/audit.mjs --enforce`（本卡唯一 verify，**真实输出**）

```text
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b" && node scripts/audit.mjs --enforce
 结论：单栋时 auto 的激活档数字与本距离带对应单档**逐值相等**：✓ 全部 3 个距离带成立；
 分区 F         : 72 / 预算 80  ✓
 可见三角面       : 306737 / 上限 1500000  ✓
 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
exit=0
```

预算/契约分项（同一次输出）：

| 项 | 实测 | 上限/预算 | 结果 |
| --- | --- | --- | --- |
| 主场景绘制调用 | 333 | 350 | ✓ |
| 分区 B | 62 | 70 | ✓ |
| 分区 C | 55 | 60 | ✓ |
| 分区 D | 49 | 56 | ✓ |
| 分区 E | 49 | 56 | ✓ |
| 分区 F | 72 | 80 | ✓ |
| 可见三角面 | 306737 | 1500000 | ✓ |

### 3.2 三时辰可读性现状口径（内景类）

**口径（不变）**：`node scripts/shot.mjs --view=interior --zone=<B|C> --preset=<golden|dusk|night> --judge`，
1440×900 / DPR 1 / medium；**内容掩码**口径（分母 = 非背景像素）；内景属 `near` 类：
内容暗区 **≤30%**、内容高光截断 **≤5%**、内容均值 ≥0.04（CONTRACTS §12；阈值未被任何卡改过）。

**本卡实测（金銮殿 `VP-B-interior`，本卡现场跑，2026-09-26 当前树）**：

| 时辰 | 判定 | 内容均值 | 内容暗区 | 内容高光截断 |
| --- | --- | --- | --- | --- |
| golden | PASS | 0.3169 | 5.61% | 0.61% |
| dusk | PASS | 0.3668 | 0.00% | 1.80% |
| night | PASS | 0.4242 | 0.00% | 3.53% |

> **归属说明（重要）**：上表是**本卡自测的单机位×三时辰**读数，用于证明"当前树上该机位已满足 §12 双约束"。
> **全 8 视角 × 3 时辰的逐格矩阵读数归 `t106`**（其持有逐视角读数与修复记录），本卡**不代其宣称闭合**，也不复跑该矩阵。

### 3.3 与 t33 失败时读数的对照（同一机位、同一口径）

| 机位/时辰 | t33 修复后（kit 侧手段用尽时） | 当前树（本卡实测） | 说明 |
| --- | --- | --- | --- |
| 金銮殿 golden 暗区 | 65.93% ✗ | **5.61%** ✅ | 由 t38（内景补光体系）承接后大幅改善 |
| 金銮殿 dusk 暗区 | 48.97% ✗ | **0.00%** ✅ | 同上（+ t43 系数档） |
| 金銮殿 night 暗区 | 1.36% ✅ | **0.00%** ✅ | — |
| 高光截断（新增约束） | t33 时未作为目标 | golden 0.61% / dusk 1.80% / night 3.53% ✅ | 该约束后来在 t106 处置（曾夜间/dusk 超 5%，已压回） |

⇒ 结论：**t33 的目标（内景内容暗区 ≤30%）在该机位上已由 t38/t43 达成**；
但它**不等于**"全视角矩阵已达标"。**这一点明确归 t106 / verifier 处置**。

---

## 4. ④ 残余未闭合项与归属（本卡不代 t106 宣称闭合）

| # | 残余项 | 归属 | 当前状态（本卡可见） |
| --- | --- | --- | --- |
| R1 | **逐视角内景可读性读数**（8 视角 × 3 时辰的内容暗区/高光截断逐格判定；含寝殿 C 机位、其余 41+ 处可进入内景） | **t106**（在办/已交付范围）+ verifier 全矩阵 | 本卡**未验证**；t106 的修复（内景 Bloom 上限 0.5）已把金銮殿 dusk/night 的截断由 5.67/5.06% 压到 1.80/3.53% |
| R2 | **`?env=` 诊断通道会静默改变 Bloom 路径**（`--env=exposure=0.95` 反而更亮） | t106 报出（**F1**），修复属 core/`src/main.js` 归属，**未被任何卡修** | 未闭合；t106 已改为源级回退做归因，并建议修预设合并 |
| R3 | `--view=zone --zone=B --preset=dusk` 的**背景掩码告警型 FAIL**（"未识别到真天空"，非阈值超标） | t106 报出（**F4**）；属 shot/掩码口径 | 未闭合（建议加 `--allow-no-sky` 或白名单） |
| R4 | **质量档维度的内景复测**（high 更亮 / low 无 bloom） | verifier 全矩阵 | 本卡未验证（§3.2 只测 medium） |
| R5 | t70 之后布局把 `door` 派生给 **10 个亭**（四面开敞无墙、`doorWidth` 恒 0） | 数据侧（t70/t1）；kit 侧已按能力边界加断言守护 | 无 kit 侧动作需求（t106 已记录为 F5） |

> **本卡立场**：以上 R1–R5 均**不属本卡 inScope**，本卡只做登记与归属，**不宣称任何一项已闭合**。

---

## 5. 与 t107 账本、平台标志的关系（不改写历史）

| 角色 | 文件/标识 | 本卡关系 |
| --- | --- | --- |
| 取代登记（账本侧） | `docs/handoff-ledger-closeout.md` §2.1（t107） | **只读引用**（§1.2 逐行摘录）；本卡**未修改**该文件 |
| 平台标志 | `Delivery: blocked` → `t33 failed without a follow-up repair` | 本卡即该后继（repair 类，登记取代关系 + 当前实测） |
| t33 原始回执 | `docs/handoff-t3-repair-interior.md` | **只读引用**（§1.3）；本卡未修改 |
| t38 / t43 回执 | `docs/handoff-t2-repair-interior.md`、`docs/handoff-t2-interior-coeff.md` | **只读引用**（§2）；本卡未修改 |
| 逐视角读数 | 归 `t106`（`docs/handoff-t2-interior-clip.md` 为其回执） | 本卡仅**转述**其结论与该卡自测的三格读数，**不代其宣称闭合** |

**本卡不做的事（逐条声明）**：未修改 `src/**`、`tests/**`、`docs/shots/**`、`docs/CONTRACTS.md`、`docs/handoff-ledger-closeout.md`、任何其他卡的回执；未改动任何阈值/判据口径；未改动任何版本号。

---

## 6. 复现命令与产物清单

```text
# 本卡唯一 verify（exit 0 已在 §3.1 列出真实输出）
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b" && node scripts/audit.mjs --enforce

# 承接物在树上的状态（§2）
node tests/core-interior.test.mjs            # 13/13，skip 1（CORE_INTERIOR_LIVE 未设置）
sed -n '152,157p' src/core/environment.js    # INTERIOR_FILL 三时辰系数（t43）

# 三时辰内景现状读数（§3.2；图写 /tmp，不污染 docs/shots）
node scripts/shot.mjs --view=interior --zone=B --preset=golden --judge
node scripts/shot.mjs --view=interior --zone=B --preset=dusk   --judge
node scripts/shot.mjs --view=interior --zone=B --preset=night  --judge
```

**本卡产物（唯一）**：`docs/handoff-retire-t33.md`（本文件）。

---

## 7. 未验证 / 边界（如实列出）

1. **未验证全视角矩阵**：§3.2 只覆盖金銮殿 1 个机位 × 3 时辰；其余视角/机位（含寝殿 C）**未由本卡验证**（归 t106/verifier）。
2. **未验证质量档维度**：只测 medium（承接口径）。
3. **未复核 t38/t43 的实现细节**：本卡只核对其**当前树上是否存在**（`INTERIOR_FILL` 冻结表 + `tests/core-interior.test.mjs` 13/13）与账本登记，未复跑它们当年的证据图。
4. **R1–R5 均未闭合**（见 §4），本卡只登记归属。
5. 本文件不构成对 t33 目标"已达成/已闭合"的判定；若需该判定，应由持有逐视角读数的卡（t106）或 verifier 全矩阵给出。
