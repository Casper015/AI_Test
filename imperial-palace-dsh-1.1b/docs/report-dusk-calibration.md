# 夕照（dusk）阴影侧可读性校准报告（CONFIG 1.0.4 / t39）

> 归属：t1 foundation-lead · 任务 t39（T1.6） · attempt `065bae4c-6091-477a-920e-8ed8316b64c7`
> 判据口径：`docs/CONTRACTS.md` §12（`CONTRACTS v1.0.7`；`dusk` 的 `oblique/iso/zone` 属**俯瞰/环绕类：内容暗区 ≤15%、clip ≤5%**）
> 固定口径：`1440×900 / DPR 1 / medium / ?ui=0&shot=1`；工具：`scripts/shot.mjs`

## 1. 结论（先说结果）

- **三个视角全部达标**：`oblique` 15.46% → **0.63%**、`iso` 20.67% → **1.44%**、`zone` 15.46% → **0.63%**（工具口径，均 ≤15%，截断 0.00%）。
- 用**修正背景侦测**后的"真内容掩码"复核，同样达标且余量更大：`oblique` 51.20% → **2.15%**、`iso` 56.19% → **3.85%**、`zone` 51.20% → **2.15%**（见 §4）。
- **阈值一个字未动**、视角一个未删、分类未改（`axis`/`oblique` 等档位保持 t34 裁定）。
- **氛围未被洗白**：天空像素逐值不变（p50/p95 = 0.7019，补光不作用于背景）、色温 R/B 1.81→1.85（golden 1.08 / night 0.39）、饱和度 0.551→0.504（仍为 golden 的 4.1 倍）、整帧均值 0.55（仍明显暗于 golden 0.66）、clip 0.00%。
- **同时报告一个测量工具缺陷**（§5，**不在本任务 inScope**，需裁定）：`scripts/shot.mjs` 的背景侦测用"量化桶左下角 + 容差 6"，当天空色落在桶的上半区（dusk 恰好差 1 个量化单位）时会**静默退化为整帧口径**——这正是 t35 的 15.46% 与本次"真内容"51.20% 的差异来源。

## 2. 改动（唯一改动：`sunset` 预设的补光）

| 值 | 1.0.3（before） | 1.0.4（after） | 依据 |
| --- | --- | --- | --- |
| `sunset.ambientIntensity` | 0.5 | **1.1** | 抬升阴影侧：iso 的整帧暗区 20.67%→1.44%、真内容暗区 56.19%→3.85% |
| `sunset.hemiIntensity` | 0.55 | **1.15** | 同上（保持 hemi/ambient 比例 1.045 ≈ 原 1.1，天空/地面色比不变） |
| `CONFIG_VERSION` | 1.0.3 | **1.0.4** | 语义变更 |
| `sunset.sunIntensity` / `sunDirection` / `exposure` / `skyDusk` / `fogNear/Far` / 色板 | — | **全部未动** | 只补阴影侧，不碰太阳、曝光、天空与雾 |

**量级依据（探针实测，iso 视角）**：

| ambient / hemi | 工具口径暗区 | 真内容暗区 | 真内容均值 | 截断 |
| --- | --- | --- | --- | --- |
| 0.5 / 0.55（before） | 20.67% | 56.19% | 0.1282 | 0.00% |
| 0.8 / 0.85 | 6.31% | 17.15% | 0.1656 | 0.00% |
| **1.1 / 1.15（after）** | **1.44%** | **3.85%** | 0.1991 | 0.00% |
| 1.4 / 1.5（仅探针，未采用） | 0.97% | 2.64% | 0.2318 | 0.00% |

→ 选择 1.1/1.15：两种口径都留出 >10pp 余量，且比 1.4/1.5 更少压平对比（不追求"越亮越好"）。

## 3. before / after 判定行（工具原始输出，逐字）

**before（CONFIG 1.0.3，t35 图，`--stats-only` 复算）**

```text
 t2-oblique-dusk.png  1440×900 236.1KB 内容均值 0.5322 内容暗区 15.46% 内容截断 0.00% 内容像素 100.0% | 整帧 均值 0.5322 p05 0.065 p50 0.702 p95 0.702 暗区 15.46%
 t2-iso-dusk.png      1440×900 377.6KB 内容均值 0.4908 内容暗区 20.67% 内容截断 0.00% 内容像素 100.0% | 整帧 均值 0.4908 p05 0.040 p50 0.702 p95 0.702 暗区 20.67%
 t2-zone-dusk.png     1440×900 236.0KB 内容均值 0.5322 内容暗区 15.46% 内容截断 0.00% 内容像素 100.0% | 整帧 均值 0.5322 p05 0.065 p50 0.702 p95 0.702 暗区 15.46%
```

**after（CONFIG 1.0.4，本次重拍）**

```text
$ node scripts/shot.mjs --view=oblique --preset=dusk --name=t2-oblique-dusk.png --keep-invalid
shot: ✓ t2-oblique-dusk.png  1440×900 · 231.6KB · 5751ms · 请求 42 条 · GL [disable-gpu]
        内容掩码[city] 均值 0.5515 · 暗区 0.63%（上限 15%） · 高光截断 0.00%（上限 5%） · 内容像素 100.0% · 背景 rgb(208,168,120)@100%         整帧(诊断) 均值 0.5515 · p05 0.1121 · p50 0.7019 · p95 0.7024 · 暗区(luma<0.08) 0.63% · 高光截断(luma>0.9) 0.00% · 内容占比 30.0%
        直方图(暗→亮 8 档) 0.136 0.086 0.043 0.024 0.011 0.7 0 0 · 可读性判据 PASS

$ node scripts/shot.mjs --view=iso --preset=dusk --name=t2-iso-dusk.png --keep-invalid
shot: ✓ t2-iso-dusk.png  1440×900 · 376.3KB · 5492ms
        内容掩码[city] 均值 0.5169 · 暗区 1.44%（上限 15%） · 高光截断 0.00%（上限 5%） · 内容像素 100.0% · 背景 rgb(208,168,120)@99%
        直方图(暗→亮 8 档) 0.113 0.15 0.07 0.02 0.013 0.633 0.001 0 · 可读性判据 PASS

$ node scripts/shot.mjs --view=zone --preset=dusk --name=t2-zone-dusk.png --keep-invalid
shot: ✓ t2-zone-dusk.png  1440×900 · 231.6KB · 5610ms
        内容掩码[city] 均值 0.5515 · 暗区 0.63%（上限 15%） · 高光截断 0.00%（上限 5%） · 内容像素 100.0% · 背景 rgb(208,168,120)@100%
        直方图(暗→亮 8 档) 0.136 0.086 0.043 0.024 0.011 0.7 0 0 · 可读性判据 PASS
```

| 视角 | 类别 | before 暗区 | after 暗区 | after 内容均值 | after clip | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| `oblique` | 俯瞰 | 15.46% | **0.63%** | 0.5515 | 0.00% | PASS |
| `iso` | 俯瞰 | 20.67% | **1.44%** | 0.5169 | 0.00% | PASS |
| `zone` | 俯瞰 | 15.46% | **0.63%** | 0.5515 | 0.00% | PASS |

## 4. 双口径复核（工具口径 vs 真内容掩码）

工具口径的表已见 §3。为了不让"背景遮罩是否生效"影响结论，我用**独立脚本**（PIL，规则同 §12.1，但背景色取**量化桶中心**以覆盖整个桶）复算：

| 视角 | 内容像素占比 | before 内容均值/暗区 | **after 内容均值/暗区** | after clip | 判定（≤15%） |
| --- | --- | --- | --- | --- | --- |
| `oblique` | 30.1% | 0.1379 / 51.20% | **0.2025 / 2.15%** | 0.00% | PASS |
| `iso` | 36.8% | 0.1282 / 56.19% | **0.1991 / 3.85%** | 0.00% | PASS |
| `zone` | 30.1% | 0.1379 / 51.20% | **0.2025 / 2.15%** | 0.00% | PASS |

**结论：无论用哪种口径，三个视角都达标**——本次修光照不是"钻遮罩的空子"。

## 5. ⚠️ 测量工具缺陷（`scripts/shot.mjs`，**不在本任务 inScope**，需裁定）

**现象**：dusk 场景下工具报告"内容像素 100.0%"，即背景遮罩**没有生效**；night 部分视角同样（96.6%）。

**根因**（已定位到行）：`decodePngStats` 用 `bg = (bucketKey >> shift) << 3` 取**量化桶左下角**，再加 `--content-tol 6`。
dusk 的实际天空色是 **(210,175,127)**，落在 5bit 桶 (208,168,120) 内；比较上界 = 168+6 = 174，而 g=175 ⇒ **差 1 个量化单位**，全部天空像素被判为"内容"。
night 的实际天空色 (14,23,43) 同理（桶 (8,16,40)，g 上界 22 < 23）。

**影响（用修正后的口径复算既有证据图）**：

| 视角 | 预设 | 工具曾报"内容暗区" | 真内容暗区 | 阈值 | 修正后是否会翻盘 |
| --- | --- | --- | --- | --- | --- |
| `oblique`/`zone` | night | 3.57% | **15.61%** | 15%（俯瞰） | **是（超 0.61pp）** |
| `axis` | night | 29.31% | **40.47%** | 30%（低空） | **是（超 10.5pp）** |
| `oblique`/`iso`/`zone` | dusk | 15.46/20.67/15.46% | 51.20/56.19/51.20% | 15% | 是（**本次已修好**） |
| `orbit` | dusk | — | 25.93% | 15% | 是（未在本次任务范围） |
| `iso`/`orbit` | night | 1.34/8.37% | 3.77/11.51% | 15% | 否 |
| `oblique`/`iso`/`orbit` | golden | 3.57/1.34/8.37%（night 行）→ golden 实测 2.22/2.55/8.74% | 同 | 15% | 否 |

**最小修法（1 行）**：背景色取**桶中心**（`+4`）或把 `--content-tol` 默认从 6 提到 12。
**但不能只改这一行**：修好后 `night oblique/zone`（15.61%）与 `night axis`（40.47%，低空类上限 30%）会**新增不通过**，
需要一并与主理人裁定：是继续修光照（night 的补光已被 t38 诊断过：抬到 4.1/1.9 会让 clip 7.74% > 5%），
还是把 `axis` 的档位/阈值重新讨论（t34 的 29.31% 本身就来自这个有缺陷的口径——**这是必须回填的一条证据**）。

## 6. 复现命令

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3"
node scripts/shot.mjs --view=oblique --preset=dusk --name=t2-oblique-dusk.png --keep-invalid
node scripts/shot.mjs --view=iso     --preset=dusk --name=t2-iso-dusk.png     --keep-invalid
node scripts/shot.mjs --view=zone    --preset=dusk --name=t2-zone-dusk.png    --keep-invalid
node scripts/shot.mjs --stats-only=docs/shots/t2-oblique-dusk.png,docs/shots/t2-iso-dusk.png,docs/shots/t2-zone-dusk.png
node tests/layout.test.mjs      # 1484 项
node scripts/audit.mjs          # 预算与契约
# 真内容掩码复核（独立于 shot.mjs）：/tmp/t39-content2.py（背景取量化桶中心）
```

## 7. 未验证项 / 已知限制

1. 独立复核脚本在 `/tmp`（非仓库产物）；仓内口径仍以 `scripts/shot.mjs` 为准（其缺陷见 §5，未在本任务修复）。
2. 本次只重拍 `dusk` 的 `oblique/iso/zone`（inScope 明确列出的三个 PNG）；`dusk` 的 `orbit`（真内容 25.93%）、`axis` 与 `night`/`golden` 的其余视角**沿用旧图**，未重拍。
3. 未做真实 GPU 观感复核（本机 SwiftShader）；"氛围未洗白"以量化指标（R/B、饱和度、内容均值、整帧均值、clip、天空逐值不变）为准。
4. `dusk` 的 `focus/fp/interior`（低空/内景类 ≤30%）本次未重拍：低空类在旧图上分别为 focus 24.04%→ 工具口径、fp 25.82%（均为 t26 数据，且 dusk 未测）；如 V2 需要，需在 t38 的内景补光与新补光下重测。
