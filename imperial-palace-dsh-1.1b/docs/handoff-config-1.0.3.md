# 交付回执 · CONFIG 1.0.3 夜色判据收口（t26 / T1.4）

> 归属：t1 foundation-lead · 任务：t26 · attempt_id：`b0c3fba4-53f9-402a-a816-31188ee078b3`
> 版本对应：**`CONFIG_VERSION 1.0.3` ⇄ `CONTRACTS v1.0.5` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`**
> 判据正文：[`docs/CONTRACTS.md`](CONTRACTS.md) §12 · 实测报告：[`docs/report-night-calibration.md`](report-night-calibration.md) §7–§10 · 风格：[`docs/STYLE_GUIDE.md`](STYLE_GUIDE.md) §6

## 1. 本轮改动的每一个数值（旧值 → 新值 + 实测依据）

| # | 位置 | 旧值 | 新值 | 实测依据 |
| --- | --- | --- | --- | --- |
| 1 | `CONFIG_VERSION` | `1.0.2` | **`1.0.3`** | 语义变更（判据口径 + 宫灯下限 + 内景补光通道） |
| 2 | `LIGHTING.lamps.intensity` | `12`（逐值 pin） | **`18`**（**下限 ≥12**，不设上限） | 内景夜：12/46 时内容暗区 72.90% → 18/60 时 **1.44%**；`focus` 28.95% → **24.04%** |
| 3 | `LIGHTING.lamps.distance` | `46`（逐值 pin） | **`60`**（**下限 ≥46**） | 同上（近景/内景余量） |
| 4 | `LIGHTING.lamps.decay` | `2` | **`1`** | `decay=2` 时 10m 外照度仅 1/100，室内根本照不亮；纯 `?env=` 提强度到 34/100 也只能到 64.95%（探针 `probe-i34-d100.png`），改 decay 后一步到位 |
| 5 | `LIGHTING.presets.goldenHour.lampIntensityScale` | `0` | **`0.45`** | 日间内景补光通道：日景原本"已激活实时灯 = 0"；B 金銮殿 `goldenHour` 内景均值 0.0638 → **0.1097**、暗区 76% → **66.03%** |
| 6 | `LIGHTING.presets.sunset.lampIntensityScale` | `0.35` | **`0.6`** | 夕照内景补光（B 内景 `sunset` 均值 0.1490、暗区 48.96%） |
| 7 | `QUALITY.tiers.medium.maxRealtimeLights` | `4` | **`6`** | 仍 ≤ `lamps.maxRealtimePointLights = 8`；§8.2 硬约束（实时灯 ≤8、宫灯不投影、1 盏主方向光投影）**不变** |
| 8 | `tests/layout.test.mjs` | 1471 项（宫灯逐值 pin） | **1478 项**（宫灯改**下限**断言 + decay/lampIntensityScale/medium 灯数断言） | `node tests/layout.test.mjs` → **通过 1478 项，失败 0 项**（旧断言改值未删） |
| 9 | `scripts/shot.mjs` | 整帧暗区 + 全城/近景同阈值 + 均值≤0.6 判过曝 | **内容掩码统计 + 分档阈值（`--near-max-dark 0.30`）+ 过曝按 `--clip-max 0.05` + 均值 ≤0.75 仅诊断 + `--content-tol 6`** | 见 §3 实测；严格背景侦测规则写入 §12.1 |

**未改**（按契约要求）：`layout.js` 数值与 `LAYOUT_VERSION 1.0.0`、fog（golden/sunset 1400/3200、night 420/1800 视为定值）、
`moonlitNight` 的 four 值（2.0/0.8/0.65/1.35 方案A 保持）、实时灯上限 8、投影策略。

## 2. 判据口径修订（写入 CONTRACTS §12 `v1.0.5` 与 STYLE_GUIDE §6）

1. **暗区按内容掩码评估**：分母＝非背景像素；背景由同预设 city 视角严格侦测（边框主色 ≥25% + 顶部 6 行 ≥50% + luma ≥0.03，
   **纯黑不得当背景**）；整帧数字降为二级诊断。
   *不做"空场/地面"排除*——平滑暗地面与平滑暗墙面不可区分，排除会同时排除贴脸暗墙，属放宽判据（已写明理由与原数字）。
2. **暗区按视角类别分档**：全城/区域/环绕/中轴 ≤15%；**近景(focus)/第一人称(fp)/内景(interior) ≤30%**
   （理由 + t19 原数字 24.92%/26.05% 已写入 §12.2）。
3. **过曝以内容高光截断 ≤5% 为主判据**，整帧均值 ≤0.75 仅诊断；`goldenHour` 均值 0.6654 / 截断 0.00% ⇒ **不构成过曝**。

## 3. 三条/五条 verify 的真实输出

```text
$ node tests/layout.test.mjs
layout.test.mjs：通过 1478 项，失败 0 项            → exit 0   （1471 → 1478，+7，未删断言）

$ node -e "import('./src/shared/config.js').then(m=>console.log('CONFIG',m.CONFIG_VERSION,'lamps',m.LIGHTING.lamps.intensity,m.LIGHTING.lamps.distance))"
CONFIG 1.0.3 lamps 18 60                             → exit 0

$ grep -n "内容掩码\|高光截断" docs/CONTRACTS.md | head -5
（命中 §12 的口径表/判据表/修订记录）                  → exit 0

$ node scripts/shot.mjs --view=focus --preset=night --name=t1.3-focus-night.png --keep-invalid
 内容掩码[near] 均值 0.2122 · 暗区 24.04%（上限 30%） · 高光截断 0.02%（上限 5%） · 内容像素 86.4%
 可读性判据 PASS                                     → exit 0

$ node scripts/audit.mjs
（§8.2 预算与契约检查：见 §5 的实测摘录）              → 见 §5
```

## 4. 实测结果（内容掩码口径，1440×900 / DPR1 / medium / `?ui=0&shot=1`）

**夜景矩阵（CONFIG 1.0.3，已刷新 `docs/shots/t2-*-night.png` 与 manifest）**

| 视角 | 类别 | 内容均值 | 内容暗区 | 内容截断 | 判定 |
| --- | --- | --- | --- | --- | --- |
| `oblique` | 全城 | 0.1029 | 3.57% | 0.00% | PASS |
| `iso` | 全城 | 0.1163 | 1.34% | 0.00% | PASS |
| `orbit` | 环绕 | 0.1611 | 8.37% | 0.00% | PASS |
| `axis` | 中轴 | 0.1541 | **29.31%** | 0.00% | **FAIL（>15%）** |
| `focus` | 近景 | 0.2122 | 24.04% | 0.02% | PASS（≤30%） |
| `fp` | 第一人称 | 0.1462 | 25.82% | 0.13% | PASS |
| `interior`（金銮殿） | 内景 | 0.2918 | 1.44% | 2.35% | PASS |

（1.0.2 同口径对照：oblique 3.33% / iso 1.82% / orbit 8.40% / focus 28.95% / fp 26.05% / interior **72.90%**。）

**内景两机位 × 三时辰**：金銮殿 golden 0.1097/66.03% **FAIL**、dusk 0.1490/48.96% **FAIL**、night 0.2927/1.36% PASS；
寝殿 golden 0.1176/56.05% **FAIL**、dusk 0.1290/53.52% **FAIL**、night 0.1833/40.77% **FAIL**。

## 5. 未通过项与最小修法（未放宽判据、未删视角）

1. **`axis`（夜）29.31% > 15%**：`axis` 是贴地高度的中轴序列机位，画面以暗铺地为主，性质接近 `fp`。
   建议主理人裁定：把 `axis` 归入近景类（≤30%）或单列阈值。**本轮未自行改分类**，按现行 §12 记 FAIL。
2. **日/夕内景四张 FAIL（49%–66%）——需派单给 kit（t3/t22）**：根因是 kit 的隔扇窗**不透光** + 金砖基色极暗，
   室内拿不到日光。**按契约要求未自行改 kit**，作为待派单需求登记：
   - **T-kit-1（推荐）**：窗扇改为可透光（`transmission` 或双面薄片）或自发光窗纸，让天光进入殿堂；
   - **T-kit-2**：在殿堂**内部**登记 `lightAnchors`（当前 49–70 个锚点主要在中轴/室外），并复用 `lampIntensityScale` 日景通道；
   - **T-kit-3（可选）**：金砖/金柱基色在夜景判据内做轻度提亮（不动色板主值，仅材质 `envMapIntensity`/`emissive` 微调，属 t3 域）。
   夜内景（寝殿 40.77%）同样受此限制，随上条一并处理。
3. **配置侧已做的部分缓解**（本轮落地，见 §1 第 5–7 条）：日/夕内景灯通道 +24%/25%、`decay` 线性化、中档实时灯 4→6。

## 6. **影响面登记**（主理人要求：列出本次语义变更影响到的不在 t26 inScope 的断言/文档）

| # | 文件 / 位置 | 受影响内容 | 现状与处置 |
| --- | --- | --- | --- |
| 1 | `tests/core.test.mjs` L639 | `assertEqual(described[0].lamps.realtime, 0, '盛世金辉不激活实时宫灯')` | **已过期**：`goldenHour.lampIntensityScale = 0.45` ⇒ 实时灯池 = round(池 × 0.45) ≠ 0。**我不在 inScope，未改**；主理人已授权 t31 改为按 config 现算的参数化断言 |
| 2 | `docs/shots/README.md` L53 / L141 / L172 | ① "`LIGHTING.lamps.intensity` 12 → 14"的旧建议；② 夜景亮度表（0.073/97.7% 等）为 1.0.1 前数据；③ 阈值参数表只列 `--city-max-dark 0.15 / --interior-min-luma 0.04`，**缺 `--near-max-dark / --clip-max / --diag-max-mean / --content-tol`，也未写内容掩码口径** | 需文档负责人（t2/t21）同步；**不在 t26 inScope**（t26 只覆盖 `docs/shots/t1.3-`、`docs/shots/t2-` 前缀的图片） |
| 3 | `docs/reports/g1-baseline-review.md` L74 / L82 | ① "实时宫灯 0/0（锚点 53）"；② "内景可读性余量：interior/goldenHour 均值 0.063、暗区 76.12%" | 旧数据，已被 1.0.3 取代（same view now 0.1097/66.03%）。verifier 文档需标注或刷新，**不在 t26 inScope** |
| 4 | `docs/handoffs/zone-forecourt.md` L155 | 引用"`goldenHour.lampIntensityScale = 0` → audit 实测已激活 0 盏" | 历史回执（点时刻记录），已被 1.0.3 取代；建议后续回执注明版本，**不改历史回执** |
| 5 | `README.md` L12/L13/L20/L26/L60/L69/L80/L127 | 版本对应表（CONTRACTS v1.0.1 ⇄ CONFIG 1.0.1）、断言数 **1462**、以及"屋顶等级白名单（CONFIG 1.0.1）" | **陈旧**：当前为 CONTRACTS v1.0.5 / CONFIG 1.0.3 / 1478 项。README 归 t1 但**不在 t26 inScope**，未改；建议 t14 收口或另开 t1 小任务同步（t16 已验证过一次同类问题） |
| 6 | `tests/kit.test.mjs` | 仅引用 `CONFIG.LIGHTING.lamps.color` | **不受影响**（读取现 config） |
| 7 | `tests/zone-*.test.mjs` | 引用各自区域自建灯位数量（如 forecourt `宫灯数量 = 24`） | **不受影响**（与 `LIGHTING.lamps` 参数无关） |
| 8 | `tests/interaction.test.mjs` / `core-walls` / `zones` | 无灯/判据引用（已 grep 核实） | **不受影响** |
| 9 | `scripts/audit.mjs` | 运行时读 config 打"三时辰 × 质量档"灯数表 | **无需改**（自动跟随），但其输出数值随 1.0.3 变化 |
| 10 | `scripts/shot.mjs` | 判据阈值、统计口径 | **本轮已同步**（内容掩码 + 分档 + 截断主判据 + 新参数），使脚本与 §12 一致 |
| 11 | `docs/handoff-config-1.0.2.md`（t19 回执） | 记录 1.0.2 的 lamps 12/46 与旧判据 | **点时刻回执，按纪律不改**；本次在回执中标注"1.0.2 参数已被 1.0.3 取代" |

> 目的（主理人说明）：把"改语义不清算下游断言"的返工风险一次看清。以上 1–5、11 为**已知需同步项**，6–9 为**核实不受影响项**，10 为**本轮已同步项**。

## 7. 未验证项 / 已知限制

1. 本机 headless 走 SwiftShader：帧率不具代表性（判据只用亮度/几何）。
2. `--stats-only` 已支持内容掩码与分档判定，但**背景侦测在个别视角会退回"全画面为内容"**（如 `fp` 内容像素 100%）——
   这是保守方向（不会把暗部当背景删除），已在 §12.1 写明判定规则与容差。
3. 内容掩码只排除天空/背景，**不含"空场/地面"**（理由见 §12.1）；若 V2 要求更严口径，需 core 侧 stencil/depth 掩码（另行派单）。
4. 三时辰全矩阵（八视角 × 三时辰）本轮只重算了 night 与两个内景 × 三时辰；其余组合沿用 t2/t19 旧图，
   V2 收口时应在全部区域落地后按 §12 重跑。
5. `axis` 分类与日/夕内景的 kit 修法**待裁定/待派单**（§5）。
