# T9.3 金銮殿内景高光截断修复（dusk/night）· 回执（t106）

> 归属：`kit-engineer`（t106）· attempt 2 · 2026-09-26
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 改动（仅 inScope）：`src/core/environment.js`（**唯一生产代码改动**）、`tests/core-environment.test.mjs`（+1 用例）、`tests/kit.test.mjs`（t70 后布局新增亭 door 数据 → 门洞 sweep 按能力边界更新）、本文件
> `src/kit/**` **未改**（诊断证明 kit 侧三项嫌疑中两项零贡献、镜面项仅 −1.15pp；`src/kit/materials.js` 与诊断前逐位一致）
> **未触碰**：`src/shared/**`（含 `config.js` 预设与 §12 阈值）、`src/zones/**`、`src/ui/**`、`src/interaction/**`、`tests/verify-*`、`docs/CONTRACTS.md`

---

## 0. 结论

| 项 | 修复前（稳态） | 修复后（3 次复测） | 判据 |
| --- | --- | --- | --- |
| **金銮殿内景 `dusk` 内容高光截断** | **5.67 / 5.69%** ✗ | **1.81 / 1.80 / 1.80%** ✅ | ≤5% |
| **金銮殿内景 `night` 内容高光截断** | **5.05 / 5.06%** ✗ | **3.53 / 3.53 / 3.53%** ✅ | ≤5% |
| 离散度 | 0.01pp | **dusk 0.01pp / night 0.00pp** ✅ | ≤0.05pp |
| 内容暗区（不得回归） | 0.00% | dusk 0.00% / night 0.00% | ≤30% |
| 内容均值 | 0.416 / — | 0.367 / 0.424 | ≥0.04 |

**根因（实测，非推测）：高光截断 100% 来自 Bloom**，与 kit 材质自发光、环境灯自发光**几乎无关**。
**修法（最小、局部）**：在 `src/core/environment.js` 引入**内景 Bloom 强度上限系数** `INTERIOR_BLOOM_STRENGTH_SCALE = 0.5`
—— 相机进入内景体积（复用既有 t33 `interiorState.blend`）时 Bloom strength ×0.5，**外景 bloom 参数逐位不变**；
未改 `config` 预设、未改 §12 阈值（5%）、未改判据口径。

---

## 1. 逐项量化诊断（源级开关，**未用 `?env=`**，方法可复现）

方法：对每个嫌疑源做**单变量源级回退**（`cp` 备份 → `python` 精确替换 1 行 → 跑图 → `cp` 还原；脚本见 §6），
口径 `node scripts/shot.mjs --view=interior --zone=B --preset=dusk --judge`（1440×900/DPR1/medium）。

| # | 单变量回退 | 内容均值 | 内容暗区 | **内容高光截断** | Δpp（相对基线 5.67%） | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| — | 基线（无改动） | 0.4160 | 0.00% | **5.67%** | — | 复现 t96 ✔ |
| ① | `src/kit`：`lampGlow/highlight` `emissiveIntensity` 1 → 0 | 0.4154 | 0.00% | **5.68%** | **+0.01pp（≈0，无贡献）** | ❌ 排除 |
| ② | `environment`：灯自发光 `0.6+2.6*scale` → 0 | 0.4163 | 0.00% | **5.69%** | **+0.02pp（≈0，无贡献）** | ❌ 排除 |
| ③ | **Bloom 关闭**（`setBloom(null,false)`） | 0.0983 | 0.00% | **0.00%** | **−5.67pp（100% 来源）** | ✅ **主导项** |
| ④ | `src/kit`：**全材质 roughness → 1**（去镜面高光） | 0.3765 | 0.00% | **4.52%** | **−1.15pp（次要，不足达标）** | ⚠️ 次要项 |

补充（`?env=` 扫描，仅作旁证，见 §5-F1 的通道警告）：`lampIntensityScale=0`→截断 1.05%、
`lampIntensity=0`→1.12%、`lampIntensityScale=0.3`→2.21%（与灯相关，但该通道本身会改变 Bloom 路径，故**不作为定因依据**）。

**结论**：三项嫌疑中，① `src/kit` 金砖/金饰/彩画 `roughness·emissive` 仅有 ④ 的 −1.15pp（不足以达标且会显著改变材质观感）；
② `environment` 灯自发光 ~0；③ Bloom 是**全部**来源 ⇒ 最小改动应落在 **Bloom 的内景上限**，而非材质。

### 1b. 上限系数扫描（dusk / night，同一口径）

| `INTERIOR_BLOOM_STRENGTH_SCALE` | dusk 截断 | night 截断 | 余量（night） |
| --- | --- | --- | --- |
| 1.0（未缩放，原状） | 5.67–5.69% ✗ | 5.05–5.06% ✗ | — |
| 0.65 | 2.68% ✅ | 3.92% ✅ | 1.08pp |
| **0.5（采用）** | **1.80–1.81%** ✅ | **3.53%** ✅ | **1.47pp** |
| 0.35 | 1.40% ✅ | 3.20% ✅ | 1.80pp |

取 **0.5**：在"最小视觉扰动（保留一半辉光）"与"≥1.4pp 余量（含 high 档更亮时的安全垫）"之间折中。

---

## 2. 改动内容（`src/core/environment.js`，唯一生产代码改动）

1. 新增冻结常量（约 214 行，含完整诊断依据注释）：`const INTERIOR_BLOOM_STRENGTH_SCALE = 0.5;`
2. 新增 `bloomForState()` / `applyBloom()`（约 640–660 行）：`strength × (1 − (1−0.5) × interiorState.blend)`
   —— `blend = 0`（外景）时**逐位等同预设值**；
3. `applyPreset` 里原本直接 `rendererAdapter.setBloom?.(p.bloom, …)` 改为 `applyBloom(p, scale)`（约 696 行）；
4. `updateInteriorFill` 在 `blend` 变化 >1e-3 时重算 Bloom（约 253 行）—— 进出内景各一次，退出即恢复预设；
5. `describe()` 新增 `bloom` 权威读数块（约 948 行）：`{preset, baseStrength, effectiveStrength, interiorBlend, shrink, interiorStrengthScale}`。

> 为什么**不动 `src/kit`**：实测 kit 自发光零贡献；材质镜面项只有 −1.15pp（改 roughness 会明显改变金砖/金饰观感且仍不达标）。
> 为什么**不动 `config`**：Bloom 参数来自 `CONFIG.LIGHTING.presets[*].bloom`（config 不在 inScope），
> 而 `environment.js` 是**参数的下游调用者**，在调用处按"是否在内景"缩放即为最小落点。

---

## 3. 3 次复测（原始判定行 + 离散度）

```text
$ node scripts/shot.mjs --view=interior --zone=B --preset=dusk --judge      # 修复后
rep1-dusk   PASS dusk  interior [near] 内容均值 0.3669 内容暗区 0.00% 内容截断 1.81%
rep2-dusk   PASS dusk  interior [near] 内容均值 0.3668 内容暗区 0.00% 内容截断 1.80%
rep3-dusk   PASS dusk  interior [near] 内容均值 0.3668 内容暗区 0.00% 内容截断 1.80%
                                                → 离散度 0.01pp（≤0.05pp ✓），max 1.81% ≤ 5%

$ node scripts/shot.mjs --view=interior --zone=B --preset=night --judge     # 修复后
rep1-night  PASS night interior [near] 内容均值 0.4242 内容暗区 0.00% 内容截断 3.53%
rep2-night  PASS night interior [near] 内容均值 0.4244 内容暗区 0.00% 内容截断 3.53%
rep3-night  PASS night interior [near] 内容均值 0.4242 内容暗区 0.00% 内容截断 3.53%
                                                → 离散度 0.00pp（≤0.05pp ✓），max 3.53% ≤ 5%
```

修复前同一命令的原始判定行（本卡实测，与 t96 一致）：
`FAIL dusk interior [near] 内容均值 0.4164 内容暗区 0.00% 内容截断 5.69%`（另有 5.67% 一次）、
`FAIL night interior [near] 内容截断 5.06%`（t96：5.05 / 5.06 / 5.06）。

---

## 4. 其它代表性机位 ≥6 格（跨三时辰）修复前/后对照

脚本：先 `cp /tmp/env-pre-t106.js src/core/environment.js`（修复前态）跑 6 格，再换回修复态跑同样 6 格。

| # | 机位（命令要点） | 类别 | **修复前** | **修复后** | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | `--view=interior --zone=B --preset=golden` | 内景（同区、另一时辰） | 0.3249 / 暗 4.13% / 截断 0.68% PASS | 0.3169 / 暗 5.61% / **0.61%** PASS | ✔ 截断 −0.07pp；暗区 +1.48pp 仍远低于 30% |
| 2 | `--view=interior --zone=C --preset=dusk` | **内景（寝殿，同批材质）** | 0.4259 / 0.00% / 4.89% PASS（贴线 ⚠️） | 0.4007 / 0.00% / **0.97%** PASS | ✔ −3.92pp，**连带消除一处潜在擦线** |
| 3 | `--view=interior --zone=C --preset=night` | 内景（寝殿） | 0.3735 / 0.00% / 0.95% PASS | 0.3530 / 0.00% / **0.72%** PASS | ✔ −0.23pp |
| 4 | `--view=zone --zone=B --preset=dusk` | 同区机位（城市类） | 0.2432 / 3.85% / 0.01% FAIL* | 0.2432 / 3.85% / 0.01% FAIL* | ✔ **逐位不变**；*FAIL 原因为"背景掩码防护：未识别真天空"，与截断/暗区无关，修复前后完全一致（见 §5-F4） |
| 5 | `--view=oblique --preset=dusk` | **外景**（城市类） | 0.2071 / 1.80% / 0.00% PASS | 0.2071 / 1.81% / 0.00% PASS | ✔ 暗区 +0.01pp（噪声级）；外景 bloom 参数逐位未变 |
| 6 | `--view=focus --focus=B-hall-main --preset=golden` | 外景近景 | 0.3457 / 6.72% / 0.01% PASS | 0.3456 / 6.73% / 0.01% PASS | ✔ 噪声级不变 |

**未把别处压到超阈、未把暗区推高**：所有格子的截断要么下降、要么逐位/噪声级不变；暗区最大变化 +1.48pp（4.13%→5.61%，上限 30%）。
外景两格逐位一致（0.2071→0.2071、0.3457→0.3456）——与实现一致：`blend=0 ⇒ shrink=1`，**外景 bloom 参数逐位等同预设**。

---

## 5. 发现（交回主理人）

| id | severity | 问题 | 建议 |
| --- | --- | --- | --- |
| **t106-F1** | medium | **`?env=` 诊断覆盖会静默改变 Bloom 路径**：`--env=exposure=0.95` 得均值 0.6698 / 截断 0.18%、`--env=ambient=0,hemi=0` 得 0.6638 / 0.33%，而基线为 0.4164 / 5.69%（**降低曝光反而更亮**，物理上不可能）⇒ 该通道在覆盖存在时使 `p.bloom` 失效/绕过 Bloom，**不能用 `?env=` 做光照归因**。我因此改用源级单变量回退（§1）。 | 请 t2 修 `parseEnvOverride` 与预设合并（应保留未覆盖键，尤其是 `bloom`）；在该修复前，文档应提示"`?env=` 仅供亮度参数诊断，不得用于 Bloom/过曝归因"。 |
| **t106-F2** | low | **`src/kit` 侧嫌疑被实测排除**：t96 把 kit 金砖/金饰/彩画列为第①嫌疑，但实测自发光项 ±0.01pp、灯自发光 ±0.02pp、全材质 roughness 项仅 −1.15pp（且会明显改观感）。 | 后续若仍有内景过曝，请先量 Bloom/后期链路，再考虑材质；本卡已把这条写进 `INTERIOR_BLOOM_STRENGTH_SCALE` 的注释。 |
| **t106-F3** | info | 内景上限对**所有**内景生效（t70 后可进入建筑 43 栋）：寝殿 dusk 4.89%→0.97%，等于顺手消掉一处擦线；但若将来某些内景**偏暗**，本改动会让内景辉光更收敛（暗区可能小幅上升）。 | 若要"按内景分别设限"，需要 config 侧新增预设字段（不在本卡 inScope）——建议只在出现新的暗区/过曝回归时再评估。 |
| **t106-F4** | low | 同区机位 `--view=zone --zone=B --preset=dusk` **既有 FAIL**（原因：背景掩码防护未识别真天空，需 `--allow-no-sky`），与本卡改动无关（逐位不变）。 | 属 t2/shot 工具口径问题；建议在该机位加 `--allow-no-sky` 或在掩码候选逻辑上补"无天空机位"白名单。 |
| **t106-F5** | low | **并行布局变更**：本卡执行期间 `layout.js` 被改（door 槽位 53 → **63**，新增 **10 个亭**带 door 数据），导致 t69 的两条门洞 sweep 断言报红（亭四面开敞、`doorWidth` 恒为 0）。 | 已在 `tests/kit.test.mjs` 按 t69 能力边界修正（亭排除出"必须有开口"集合，并**新增 2 条断言**专门守护"亭即使带 door 数据也不开门洞"）：kit 断言 **843 → 845（只增不减）**。 |

---

## 6. verify 真实输出（本卡 ROOT）

```text
$ node tests/kit.test.mjs
 · 门洞能力边界：hall/sideHall/gateHall/courtyardGate 支持…；pavilion 四面开敞无墙、cornerTower 骑墙无正立面门，均不适用
 · 布局口径核对：53 个带 door 槽位净宽/朝向/轴全部一致（axis/facing 冲突 0）
 通过 845 / 845，失败 0                                   exit=0

$ node tests/core-environment.test.mjs
 通过 8 / 8                                              exit=0
 （t106 新增 ⑦：外景 bloom 逐位等同预设 0.3 → 内景 ×0.5 = 0.15 → 退出后恢复 0.3；
   并守护 `CONFIG.LIGHTING.presets.sunset.bloom.strength === 0.3` 未被修改）

$ node scripts/audit.mjs
 主场景绘制调用   : 333 / 上限 350  ✓
 分区 B 62/70 ✓ · C 55/60 ✓ · D 49/56 ✓ · E 49/56 ✓ · F 72/80 ✓
 可见三角面       : 306737 / 上限 1500000  ✓
 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）   exit=0
```

诊断脚本（可复现，落在 `/tmp`，未入库）：单变量回退 = `cp` 备份 → 精确替换 1 行 → 跑图 → 还原；
`tests/core-environment.test.mjs` ⑦ 直接断言"外景逐位等同预设 / 内景 ×0.5 / 退出恢复"。

---

## 7. 未验证 / 边界

1. **只测了 medium 档**（与 §12 判据口径一致）：`high` 档内景更亮、`low` 档 `bloom=false`（不受影响），未逐一复测；
   若 verifier 的全矩阵在 high 档发现新超阈，请回报（预期 0.5 的缩放同样生效）。
2. **未做浏览器目视**：内景辉光视觉变化（灯笼光晕更收敛）未人工确认，只做了像素统计判据。
3. **未覆盖全部内景机位**：本卡按验收要求测了金銮殿（dusk/night/golden）+ 寝殿（dusk/night）+ 外景 2 格 + 同区 1 格；
   其余 ~41 处内景未逐一测（全矩阵归 verifier）。
4. **未改任何阈值/判据口径**：§12 的 5% 与掩码口径、`config` 全部预设均未改动（core-environment 测试 ⑦ 内已加冻结值断言）。
5. **`?env=` 通道缺陷（F1）未修**（属 `src/main.js`/`src/core` 其他归属）：本卡仅记录并改用源级回退，避免误归因。
