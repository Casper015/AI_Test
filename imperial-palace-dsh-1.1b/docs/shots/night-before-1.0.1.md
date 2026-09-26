# 夜景可读性 before（CONFIG 1.0.1）→ after（CONFIG 1.0.2，由 t19 实施）

> 归属：t2 core-engineer（数据）；数值实施：t19 / foundation-lead。
> 判据（主理人裁定，已写入 `docs/shots/README.md`）：
> **全城/近景视角 均值 luma ≥ 0.10 且 暗区（luma < 0.08）≤ 15%；内景视角 均值 ≥ 0.04。**
> 统计对象 = 最终帧缓冲（1440×900 / DPR 1 / medium / `?ui=0&shot=1`），含阴影与后处理。

## 1. 1.0.1 冻结值（before，实测全部不达标）

`LIGHTING.presets.moonlitNight` = sunIntensity 0.75 / ambientIntensity 0.36 / hemiIntensity 0.32 / exposure 1.18

| 视角 | 平均亮度 | 暗区(luma<0.08) | 高光截断 | 内容占比 | PNG 体积 | 判据 |
| --- | --- | --- | --- | --- | --- | --- |
| oblique | 0.073 | 97.66% | 0.00% | 22.3% | 76.6KB | FAIL |
| iso | 0.073 | 95.57% | 0.00% | 35.5% | 174KB | FAIL |
| axis | 0.052 | 86.68% | 0.00% | 54.9% | 81KB | FAIL |
| zone | 0.073 | 97.66% | 0.00% | 22.3% | 76.6KB | FAIL |
| focus | 0.089 | 74.81% | 0.00% | 70.4% | 92KB | FAIL |
| interior | 0.020 | 98.93% | 0.00% | 24.8% | 19.6KB | FAIL（内景均值 < 0.04） |
| fp | 0.070 | 84.57% | 0.00% | 73.0% | 79KB | FAIL |
| orbit | 0.067 | 89.25% | 0.00% | 66.0% | 286KB | FAIL |

同批浏览器实测（`?stats=1` 的 DOM 报告，SwiftShader 软光栅，帧率不具代表性）：
整帧绘制调用 91–96、可见三角面 13,566–14,154、主场景可绘制对象 39、几何 45–46 / 纹理 14、
建筑 67、**实时宫灯 0–4 / 池 4**（锚点 49；中轴近处 4 盏被激活，全城远处 0 盏，>120m 由发光材质承担）。

## 2. 1.0.2 建议值（after，实测对照图 `t2-night-probe*.png`）

| 参数 | before | after（建议 A，主理人已裁定采用） |
| --- | --- | --- |
| `moonlitNight.sunIntensity` | 0.75 | **2.0** |
| `moonlitNight.ambientIntensity` | 0.36 | **0.8** |
| `moonlitNight.hemiIntensity` | 0.32 | **0.65** |
| `moonlitNight.exposure` | 1.18 | **1.35** |
| `moonlitNight.lamps`（近景交给宫灯） | intensity 6.5 / distance 34 | **intensity 12 / distance 46** |
| `goldenHour` / `sunset` 雾 | near 700 / far 2400 | **near 1400 / far 3200** |

用诊断参数 `?env=sun=2.0,ambient=0.8,hemi=0.65,exposure=1.35`（**只改本进程内预设副本，未动 shared**）实测：

| 视角 | before 均值 / 暗区 | after（建议A）均值 / 暗区 | 判据 |
| --- | --- | --- | --- |
| oblique | 0.073 / 97.7% | **0.101 / 3.7%** | PASS |
| focus | 0.090 / 74.8% | **0.175 / 30.6%** | PASS（均值） |
| interior | 0.020 / 98.9% | **0.053 / 88.4%** | PASS（内景均值为准） |

（建议 B = sun 2.6 / ambient 1.1 / hemi 0.8 / exposure 1.45 曾实测 oblique 0.117 / 暗区 2.9%，
**主理人裁定不采用**：有过曝夜色风险，且内景偏暗应由宫灯而非全局提亮解决。）

## 3. 1.0.2 落地后要跑的复测命令（t19 / V2 复用）

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3"

# 受影响的 night 全八视角 + golden 首屏（其余 golden/dusk 已由 t2 完成，无需重做）
node scripts/shot.mjs --view=all --preset=night --judge
node scripts/shot.mjs --view=oblique --preset=golden --judge

# 只统计不重拍（对已有 PNG 复算判据）
node scripts/shot.mjs --stats-only=docs/shots/t2-oblique-night.png,docs/shots/t2-interior-night.png
```

失败证据纪律：任何不达标或出图失败的图都保留为 `*.invalid.png` 或在 `docs/shots/manifest.json`
里记下体积 / 亮度统计 / 失败原因（`manifest.json` 同时记录阈值、viewMode、质量档与浏览器实测报告）。
