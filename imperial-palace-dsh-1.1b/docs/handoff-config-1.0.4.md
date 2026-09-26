# 交付回执 · CONFIG 1.0.4 夕照阴影侧可读性（t39 / T1.6）

> 归属：t1 foundation-lead · 任务 t39 · attempt_id `065bae4c-6091-477a-920e-8ed8316b64c7`
> 版本对应：**`CONFIG_VERSION 1.0.4` ⇄ `CONTRACTS v1.0.7` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ `STYLE_BASELINE v1.0.0`**
> 详细数据与原始判定行：[`docs/report-dusk-calibration.md`](report-dusk-calibration.md)

## 1. 改动清单（逐值，旧 → 新）

| # | 位置 | 旧 | 新 | 实测依据 |
| --- | --- | --- | --- | --- |
| 1 | `sunset.ambientIntensity` | `0.5` | **`1.1`** | iso 视角（最差）：整帧暗区 20.67% → **1.44%**；真内容暗区 56.19% → **3.85%** |
| 2 | `sunset.hemiIntensity` | `0.55` | **`1.15`** | 同上；hemi/ambient 比例 1.047（旧 1.1）保持，天空/地面色比不变 |
| 3 | `CONFIG_VERSION` | `1.0.3` | **`1.0.4`** | 语义变更 |
| 4 | `tests/layout.test.mjs` | 1478 项 | **1484 项** | +6：版本 pin + ambient/hemi 精确值 + 「不改太阳/曝光/天空雾距」三条守卫 + 「夕照补光为三时辰最高」设计意图断言（**未删任何断言**） |
| 5 | `docs/shots/t2-{oblique,iso,zone}-dusk.png` | 1.0.3 图 | **1.0.4 重拍** | 走 `scripts/shot.mjs` 真实渲染 + 内置判定（PASS） |
| 6 | `docs/shots/manifest.json` | — | 随 3 张重拍更新（09:50） | 由 shot.mjs 自动追加 |

**未改**（关键证据）：`sunset.sunIntensity 2.0`、`sunDirection(-0.82,0.2,-0.38)`、`exposure 1.06`、`backgroundRole skyDusk`、`fogNear/Far 1400/3200`、`sunColor #ffb571`、`lampIntensityScale 0.6`、全部色板与 `WEATHERING`；
**判据（`docs/CONTRACTS.md` §12）一个字未动**，未删视角、未改分类。

## 2. 结果（目标：dusk 的 oblique/iso/zone 内容暗区 ≤15%）

| 视角 | 类别 | before | **after** | after 内容均值 | clip | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| `oblique` | 俯瞰 | 15.46% | **0.63%** | 0.5515 | 0.00% | **PASS** |
| `iso` | 俯瞰 | 20.67% | **1.44%** | 0.5169 | 0.00% | **PASS** |
| `zone` | 俯瞰 | 15.46% | **0.63%** | 0.5515 | 0.00% | **PASS** |

**双口径复核**（独立脚本，背景取量化桶中心，见报告 §4）：真内容掩码下 `oblique` 51.20% → **2.15%**、`iso` 56.19% → **3.85%**、`zone` 51.20% → **2.15%** —— **两种口径都达标**，不是钻遮罩空子。

## 3. 氛围未被牺牲（量化证据）

| 指标 | dusk 1.0.3 | **dusk 1.0.4** | goldenHour | moonlitNight | 结论 |
| --- | --- | --- | --- | --- | --- |
| 天空像素 p50/p95 | 0.7019 / 0.7019 | **0.7019 / 0.7024（逐值不变）** | — | — | 背景不受补光影响 |
| 整帧均值 | 0.5322 / 0.4909 | 0.5515 / 0.5169 | 0.6645 | 0.1024 | 仍明显暗于金辉、亮于夜景 |
| 内容均值 | 0.1379 / 0.1282 | **0.2025 / 0.1991** | 0.2854 | 0.1425 | 仍暗于金辉约 30% |
| 色温 R/B | 1.81 / 1.81 | **1.81 / 1.85** | 1.08 | 0.39 | 暖调保持（与金辉/夜景差异显著） |
| 饱和度 | 0.551 / 0.551 | **0.504 / 0.527** | 0.122 | 0.638 | 仍为金辉的 4.1×，未变灰平光 |
| 高光截断 | 0.00% | **0.00%** | 0.00% | ≤2.46%（内景） | 无过曝风险 |

补光只作用于"被照物"，`scene.background` 是常量 ⇒ 夕照的**暖色天空、低仰角长阴影与曝光档位在像素级不变**，只有阴影侧被抬起。

## 4. verify（三条，原样）

```text
$ node tests/layout.test.mjs
layout.test.mjs：通过 1484 项，失败 0 项                      → exit 0

$ node scripts/shot.mjs --view=oblique --preset=dusk --name=t2-oblique-dusk.png --keep-invalid
shot: ✓ t2-oblique-dusk.png  1440×900 · 231.6KB · 5751ms · 请求 42 条 · GL [disable-gpu]
        内容掩码[city] 均值 0.5515 · 暗区 0.63%（上限 15%） · 高光截断 0.00%（上限 5%） · 内容像素 100.0% · 背景 rgb(208,168,120)@100%
        直方图(暗→亮 8 档) 0.136 0.086 0.043 0.024 0.011 0.7 0 0 · 可读性判据 PASS
                                                              → exit 0

$ node scripts/audit.mjs
 结论：全部预算与契约检查通过                                  → exit 0
```

## 5. ⚠️ 必须回填的测量工具缺陷（`scripts/shot.mjs`，**不在 t39 inScope，未改**）

- **现象**：dusk 场景下工具报"内容像素 100.0%"（遮罩静默失效），night 部分视角同理（96.6%）。
- **根因**：`decodePngStats` 的 `bg` 取**量化桶左下角** + `--content-tol 6`。dusk 实际天空色 **(210,175,127)** 在桶 (208,168,120) 内，g 上界 `168+6=174 < 175` → **差 1 个量化单位**，天空全被算作"内容"；night 的 (14,23,43) 同因（上界 22 < 23）。
- **影响（用修正口径复算既有证据图）**：`night oblique/zone` 真实内容暗区 **15.61%**（>15%，原报 3.57%）；**`night axis` 真实 40.47%**（>30%，原报 29.31%）——**t34 关于 axis 的裁定是基于这个有缺陷口径的，必须回填重判**；`dusk` 三视角原报 15.46/20.67/15.46% 实际为 51.20/56.19/51.20%（**本次已由光照修好到 2.15/3.85/2.15%**）。
- **最小修法**：背景色取桶中心（`+4`）或 `--content-tol` 默认 6→12（1 行）。
- **但不能只改这一行**：修好后 `night oblique/zone` 与 `night axis` 会**新增不通过**；t38 已诊断"night 补光抬到 4.1/1.9 会让内景 clip 7.74% > 5% FAIL"，因此需要主理人裁定路线（继续修夜景光照 / 重新讨论 axis 档位 / 其它）。

## 6. 未验证项 / 已知限制

1. 独立复核脚本在 `/tmp`（非仓库产物）；仓内口径仍以 `scripts/shot.mjs` 为准（缺陷见 §5）。
2. 本次仅重拍 inScope 明确列出的 3 张 dusk 图；`dusk orbit`（真内容 25.93%）、`dusk axis/focus/fp/interior`、`night`/`golden` 其余视角**沿用旧图**未重拍。
3. 未做真实 GPU 目视复核（SwiftShader）；氛围判断以量化指标（R/B、饱和度、内容/整帧均值、clip、天空逐值不变）为准。
4. `dusk` 的低空/内景类（focus/fp/interior，≤30%）本次未测——t38 已给内景补光，V2 收口时应在 dusk 下复测。
