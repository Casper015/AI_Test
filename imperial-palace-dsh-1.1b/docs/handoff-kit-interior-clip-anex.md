# C/E 内景截断修复（t92 交回的 5 行）· 回执（t120）

> 卡号：`t120`（repair，attempt 1）· 执行者：kit-engineer（attempt_id `4a11d755-8440-4e47-a544-a0eec065559f`）
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 版本（实测时）：`CONTRACTS v1.0.16` ⇄ `CONFIG_VERSION 1.0.7` ⇄ `LAYOUT_VERSION 1.1.13` ⇄ `KIT_VERSION 1.0.1`
> 改动（仅 inScope）：`src/core/environment.js`（**唯一生产代码改动**）、`tests/core-environment.test.mjs`（+1 用例 ⑦b）
> **未改**：`src/kit/**`（实测零贡献，见 §2）、`tests/kit.test.mjs`、`src/shared/**`（§12 阈值与 config 预设一字未动）、`src/zones/**`、`src/interaction/**`、`docs/CONTRACTS.md`

---

## 0. 结论（先给最重要的一条事实）

**t92 报的 5 行是"t106 之前"的读数**。在本卡开工的当前树上复测（同一口径 `shot.mjs --interior=<slot> --preset=<p> --judge`）：

| 行 | t92 报（t106 前） | 当前树 **BEFORE**（含 t106 的 ×0.5） | 本卡 **AFTER**（分档） | 判定 |
| --- | --- | --- | --- | --- |
| `C-annex-west` dusk | 5.68% ✗ | 3.66% ✅ | **2.30%** ✅ | 达标（余量 2.70pp） |
| `C-annex-west` night | 5.78% ✗ | 4.88% ✅ | **3.63%** ✅ | 达标（余量 1.37pp） |
| `C-annex-east` dusk | 5.66% ✗ | 4.21% ✅ | **2.89–2.96%** ✅ | 达标（余量 ≥2.04pp） |
| `C-annex-east` night | 6.23% ✗ | **5.02% ✗（唯一仍超标）** | **3.72–3.87%** ✅ | 达标（余量 ≥1.13pp） |
| `C-side-east-main` dusk | 5.18% ✗ | 1.71% ✅ | **1.69–1.71%** ✅（大空间档，逐位不变） | 达标 |

⇒ **5 行全部 ≤5%**，且**未靠放宽判据、未删任何陈设/灯具**（本卡只把**小房间的 bloom 上限收紧**）。
⇒ **无需全局改动**（t92 候选①）：局部手段已达标且余量 ≥1.13pp，**本卡不请求 config 派单**（§3 说明）。
⇒ 当前树上唯一仍失败的 `C-annex-east night 5.02%` 已由本卡修复。

---

## 1. 逐行：修复前后原始判定行（口径与 t92 一致）

命令（单进程逐栋内景，t91 工具）：
`node scripts/shot.mjs --interior=<slotId> --preset=<dusk|night> --judge --out-dir=/tmp/t120-shots`

```text
# BEFORE（当前树，开工实测）
before-annexW-dusk    PASS dusk  interior [near] 内容均值 0.5146 内容暗区 0.00% 内容截断 3.66%
before-annexW-night   PASS night interior [near] 内容均值 0.5475 内容暗区 0.00% 内容截断 4.88%
before-annexE-dusk    PASS dusk  interior [near] 内容均值 0.5167 内容暗区 0.00% 内容截断 4.21%
before-annexE-night   FAIL night interior [near] 内容均值 0.5492 内容暗区 0.00% 内容截断 5.02%   ← 唯一超标（阈值 5%）
before-sideE-dusk     PASS dusk  interior [near] 内容均值 0.6856 内容暗区 0.00% 内容截断 1.71%

# AFTER（分档上线后，第 1 次复测）
r1-annexW-dusk        PASS dusk  interior [near] 内容均值 0.5051 内容暗区 0.00% 内容截断 2.30%
r1-annexW-night       PASS night interior [near] 内容均值 0.5296 内容暗区 0.00% 内容截断 3.63%
r1-annexE-dusk        PASS dusk  interior [near] 内容均值 0.5076 内容暗区 0.00% 内容截断 2.96%
r1-annexE-night       PASS night interior [near] 内容均值 0.5312 内容暗区 0.00% 内容截断 3.87%
r1-sideE-dusk         PASS dusk  interior [near] 内容均值 0.6849 内容暗区 0.00% 内容截断 1.69%
```

修复后 5 行的**暗区均为 0.00%**（阈值 ≤30%）、均值 0.51–0.69（阈值 ≥0.04）⇒ 未在暗区侧付出任何代价。

---

## 2. 手段选择：为什么不改 kit 自发光（候选②），而落在 Bloom 上限

| 证据（来源） | 结果 |
| --- | --- |
| **t106 §1** 源级单变量回退：`src/kit` `lampGlow/highlight` `emissiveIntensity 1→0` | 截断 5.68%（**±0.01pp，零贡献**） |
| **t106 §1**：`environment` 灯自发光 `0.6+2.6*scale`→0 | 5.69%（**±0.02pp，零贡献**） |
| **t106 §1**：**关 Bloom** | **0.00%（−5.67pp，100% 来源）** |
| **t106 §1**：全材质 `roughness→1` | 4.52%（−1.15pp，次要且会改观感） |

⇒ 内景高光截断的**唯一主导机制是 Bloom**；"给 `interiorSet` 灯具/发光材质加发光上限"（t92 候选②）在本案例中**实测无效**（自发光项的 pp 贡献为 0.01–0.02pp）。
因此本卡采取**同一族、但作用在有效环节**的局部手段：**内景 Bloom 强度上限的分档**——即 t106 机制的**细化版**（不是第二套逻辑）。`src/kit/**` 未改。

---

## 3. 具体改动（`src/core/environment.js`，唯一生产代码改动）

1. **新增分档表（冻结）**：`INTERIOR_BLOOM_TIERS = [{ tag:'small', maxArea:600, scale:0.3 }, { tag:'large', maxArea:Infinity, scale:0.5 }]`
   —— 大空间档 **保持 t106 的冻结值 0.5**（`INTERIOR_BLOOM_STRENGTH_SCALE`），只有**小房间更紧**；
2. **逐房间包围盒**：`interiorSurfaceBoxes`（由 `WALKABLE(kind:'interior')` **不按区合并**，含 `area`），
   `updateInteriorFill()` 登记"机位所在的最小内景房间"的净面积 `interiorState.activeArea`；
3. `bloomForState()` 用 `interiorBloomTierFor(activeArea)` 取档，`shrink = 1 − (1 − tier.scale) × blend`
   —— **`blend=0`（外景）仍逐位等同预设**（外景不受影响）；
4. `describe().bloom` 新增 `interiorTier / interiorArea / tiers` 权威读数（供测试断言与后续卡复核）。

实测档位归属：

| 槽位 | 内景面面积 | 命中档 | 上限 scale |
| --- | --- | --- | --- |
| `C-annex-west` | 315.8 m² | **small** | **0.3** |
| `C-annex-east` | 315.8 m² | **small** | **0.3** |
| `C-side-east-main` | 879.8 m² | large | 0.5（不变） |
| `B-hall-main`（金銮殿） | 2592 m² | large | 0.5（不变） |
| `F-gate-south` | 1855 m² | large | 0.5（不变） |

### 3.1 候选①（全局 `lamps.intensity` 18→12 / 改 `lampIntensityScale`）：**未采用，也不请求派单**
- 局部手段已使 5 行全部达标（余量 ≥1.13pp），**没有触发"必须改全局"的条件**；
- 全局降灯的代价与 t90 那次"禁止动全局权重"同源：会一并压暗**所有**室外宫灯与三时辰，并可能在 city 类机位引入新的**暗区**超标（需跨区 × 三时辰矩阵复测）；
- 本卡**未做**该全局试验（避免无谓改动/截图开销），故**不给出其量化数字**；若主理人仍想评估，请另派卡（量化口径：各区各时辰代表性机位前后 + 暗区回归）。
### 3.2 候选③（grade1/2 小院房地面 `pavingStone`→`pavingDark`）：**未采用**（需动 `src/zones/**`，且本卡局部手段已达标）。

---

## 4. 3 次复测（+2 次补测）与离散度（如实报告）

| 行 | r1 | r2 | r3 | 极差（3 次） | 补测 r4 / r5 | 5 次极差 | 阈值余量（最小值） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `C-annex-west` dusk | 2.30 | 2.30 | 2.30 | **0.00pp** ✅ | — | — | 2.70pp |
| `C-annex-west` night | 3.63 | 3.63 | 3.63 | **0.00pp** ✅ | — | — | 1.37pp |
| `C-annex-east` dusk | 2.96 | 2.96 | 2.89 | **0.07pp** ⚠️ | 2.89 / 2.89 | 0.07pp | 2.04pp |
| `C-annex-east` night | 3.87 | 3.81 | 3.81 | **0.06pp** ⚠️ | 3.72 / 3.81 | **0.15pp** | 1.13pp |
| `C-side-east-main` dusk | 1.69 | 1.71 | 1.71 | **0.02pp** ✅ | — | — | 3.29pp |

**如实说明（不掩盖）**：
- 3/5 行的 3 次极差 ≤0.02pp（满足 ≤0.05pp）；**2 行分别为 0.06pp 与 0.07pp**，`C-annex-east night` 在 5 次采样下极差 **0.15pp**，**略超本卡 ≤0.05pp 的复测要求**。
- 该抖动量级与**判据统计本身的量化台阶**同阶：截断 = 亮像素数 / 内容像素数，1.3M 内容像素下 **0.07pp ≈ 900 px ≈ 一行量化**；两次实测值集中在 **2.89 / 2.96**（dusk）与 **3.72 / 3.81 / 3.87**（night）三个离散台阶，属**统计量化 + 掩码抖动**，不是判定翻转。
- **判定稳健性**：所有样本的最大值（3.87% / 2.96%）距 5% 阈值仍有 **≥1.13pp / ≥2.04pp** 余量；5 行在全部 17 次采样中**无一次超标**。
- 对照 t106 的金銮殿（同行同口径）极差为 0.00–0.01pp —— 差异来自小房间画面中亮像素占比更高、掩码边界更"硬"。

---

## 5. ≥6 行代表性回归（`t92` 已达标的 50 行抽样，BEFORE/AFTER 同口径）

| # | 行（`--interior=` / 时辰） | BEFORE | AFTER | Δ | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | `B-hall-main` dusk（金銮殿，t106 已验） | 1.81%（暗 0.00%） | **1.81%（暗 0.00%）** | **0（逐位）** | 大空间档未变 ⇒ t106 的格子**零回归** |
| 2 | `B-hall-main` night | 3.53%（0.00%） | **3.53%（0.00%）** | **0（逐位）** | 同上 |
| 3 | `C-hall-bed-main` dusk（寝殿） | 1.04%（0.00%） | **1.04%（0.00%）** | **0（逐位）** | 该内景面无 bounds ⇒ 走最松档，未受影响 |
| 4 | `C-annex-west` golden（同栋另一时辰） | 0.36%（0.00%） | **0.36%（0.03%）** | 截断 0；暗区 +0.03pp | 小房间白天本就远低于阈值 |
| 5 | `E-side-west-main` night（E 区） | 3.53%（0.00%） | **3.53%（0.00%）** | **0（逐位）** | E 区未受影响 |
| 6 | `F-gate-south` night（F 区，暗区较大样本） | 0.01%（暗 9.99%） | **0.01%（暗 10.00%）** | 暗区 +0.01pp | 无新暗区超标（上限 30%） |

⇒ **未把别处压暗到超阈**：大空间与其它区行**逐位不变**；小房间行只在"截断"侧下降，暗区变化 ≤0.03pp。

---

## 6. 与 t106 的分工与**统一口径**（避免两处各调一版）

| 卡 | 负责的行 | 机制 |
| --- | --- | --- |
| **t106** | 金銮殿（`B-hall-main`）dusk 5.67→1.81 / night 5.05→3.53；并首次引入"内景 Bloom 强度上限"（常量 `INTERIOR_BLOOM_STRENGTH_SCALE = 0.5`，外景逐位不变） | `bloomForState()` / `applyBloom()`（**唯一入口**） |
| **t120（本卡）** | t92 交回的 C/E 侧 5 行（`C-annex-west/east` dusk+night、`C-side-east-main` dusk） | **同一条 `bloomForState()` 入口**，只把 scale 由"常量"改为"**按房间净面积取的分档常量**"（`small 0.3` / `large 0.5`） |

**统一口径**：
- 只有**一个** bloom 上限入口（`bloomForState/applyBloom`），没有第二套逻辑；
- `large` 档 = t106 的 `INTERIOR_BLOOM_STRENGTH_SCALE = 0.5`，**逐位保留** ⇒ t106 已验证的格子（金銮殿/寝殿）**读数不变**（§5 第 1–3 行实测 0 变化）；
- 外景（`blend = 0`）在两种档位下都 `shrink = 1` ⇒ **外景 bloom 参数逐位等同预设**；
- §12 阈值（5%）与判据口径**一字未动**；config 预设与 `src/shared/**` 未改。

---

## 7. verify 真实输出（本卡 ROOT，5 条）

```text
$ node tests/kit.test.mjs          → 通过 896 / 896，失败 0            exit=0
$ node tests/core-environment.test.mjs → 通过 9 / 9                    exit=0
   （t114 后 8 → 9：新增 ⑦b「内景 Bloom 分档：小院房更紧（0.3）/ 大空间保持 t106 冻结值（0.5）」，
     断言分档表存在/单调/两档∈(0,1]、large=0.5、小院房命中 small、有效强度 = 预设×0.3）
$ node tests/zone-inner.test.mjs   → 通过 36 / 36                      exit=0
$ node tests/zone-east.test.mjs    → 通过 32 / 32                      exit=0
$ node scripts/audit.mjs --enforce → exit=0
   主场景绘制调用 333 / 上限 350 ✓ · 可见三角面 306737 / 上限 1500000 ✓
   结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```

（项目级 `run.mjs` 按任务卡**未运行**、不列入 verify。）

---

## 8. 未验证 / 边界（如实列出）

1. **未复测其余 ~38 处内景行**：本卡只测了 5 行目标 × 3–5 次 + 6 行回归；全矩阵归 verifier。
2. **离散度要求部分未达标**：2 行（`C-annex-east` dusk/night）极差 0.06–0.15pp > 0.05pp，已在 §4 量化归因（统计量化台阶 + 掩码抖动），判定余量 ≥1.13pp。
3. **未做浏览器目视**：小房间灯笼辉光更收敛（scale 0.5→0.3）的观感未人工确认。
4. **2 处内景面无 `bounds`**（`WK-C-hall-bed-main-interior`、`WK-E-side-west-main-interior` 实测 `area/bounds` 缺失）⇒ 其机位只能走**最松档 0.5**；作为数据侧待办登记（若补 bounds 可自动纳入分档，无需改代码）。实测这两处当前均达标（1.04% / 3.53%），故不构成缺陷。
5. **全局候选①未量化**：本卡未做 18→12 的全局试验（局部已达标，避免无谓改动）；如需评估请另派卡（§3.1 给了口径）。
6. **`?env=` 通道缺陷（t106-F1）仍存在**：本卡未使用该通道做归因（用的源级单变量/直接改动 + 分档实测），故不受影响。
