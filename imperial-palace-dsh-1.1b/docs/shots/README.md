# docs/shots —— 截图证据目录（t2 核心引擎）

> 本目录保存 **由 `node scripts/shot.mjs` 真实渲染** 出图（本地 HTTP + headless Chromium/SwiftShader，
> 1440×900、DPR 1、质量档 medium、`?ui=0&shot=1`），文件名格式 `t2-<view>-<preset>.png`：

- `view` = 八视角之一：`oblique | iso | axis | zone | focus | interior | fp | orbit`
- `preset` = 三时辰之一：`golden | dusk | night`（对应 `goldenHour / sunset / moonlitNight`）

## 本轮重拍（t21 · CONFIG 1.0.2 之后）

| 项 | 值 |
| --- | --- |
| 重拍时间（UTC） | 2026-09-26T14:48:18Z（night×8）、2026-09-26T14:50:09Z（dusk×3） |
| 随包配置 | `CONFIG_VERSION 1.0.2`（夜景方案A：sun 2.0 / ambient 0.8 / hemi 0.65 / exposure 1.35、宫灯 intensity 12 / distance 46、goldenHour·sunset 雾 near 1400 / far 3200） |
| 质量档 / 视口 | `medium` / `1440×900` / DPR 1 |
| 内容状态 | 灰盒 G0 + 已交付真实区域（B/C/E/F；D 未交付，其体块由灰盒承担） |
| 命令 | `node scripts/shot.mjs --view=all --preset=night --keep-invalid`、`node scripts/shot.mjs --view=oblique,iso,zone --preset=dusk --keep-invalid` |
| 出图校验 | 11/11 通过（PNG 尺寸/体积下限/HTTP 收到 main.js 与 vendor three/就绪信号 `data-palace-ready`/stderr 无沙箱特征）；本轮无失败图，故无 `*.invalid.png` |
| manifest | `docs/shots/manifest.json` 由 shot.mjs 合并写回（按文件名合并 + 追加 history），含逐张亮度统计与浏览器实测报告 |

**provenance 修正**：此前 `t2-{oblique,iso,zone}-dusk.png` 拍摄于"灯位锚点同步修复之前"（≤3 盏实时点光差异）；
本轮已用 CONFIG 1.0.2 重拍，provenance 与随包配置一致。`t2-night-probe*.png` 是 t2 在 1.0.1 时期用
`--env=` 诊断覆盖（只改进程内预设副本）拍下的**历史对照图**，保留作 before/after 证据，不代表当前配置。

## 夜景复核：整帧 vs 内容掩码（判据归属 t26）

> **重要**：下表的"整帧"数字与 `scripts/shot.mjs` 打印的 PASS/FAIL 只作**诊断**用途。
> 内容掩码口径的最终定义与判据由 **t26** 裁定；本目录不对夜景可读性单方面下 pass/fail 结论。

（同一批图，1440×900 / DPR 1 / medium / CONFIG 1.0.2）

| 视角 | 整帧均值 | 整帧暗区 | 旧口径判定（诊断） | 掩码A 非主色像素：占比 / 均值 / 暗区 | 掩码B 局部细节：占比 / 均值 / 暗区 |
| --- | --- | --- | --- | --- | --- |
| oblique | 0.102 | 4.3% | PASS | 19.5% / 0.154 / 14.9% | 5.5% / 0.176 / 26.8% |
| iso | 0.116 | 1.4% | PASS | 19.9% / 0.210 / 5.5% | 7.7% / 0.215 / 15.2% |
| axis | 0.154 | 29.3% | FAIL(暗区) | 65.9% / 0.163 / 44.5% | 6.3% / 0.218 / 29.5% |
| zone | 0.102 | 4.3% | PASS | 19.5% / 0.154 / 14.9% | 5.5% / 0.176 / 26.8% |
| focus | 0.175 | 25.5% | FAIL(暗区) | 59.4% / 0.233 / 38.7% | 14.3% / 0.245 / 25.9% |
| interior | 0.037 | 89.0% | FAIL(均值 0.0373<0.04) | 19.8% / 0.146 / 44.4% | 0.8% / 0.183 / 36.2% |
| fp | 0.131 | 26.0% | FAIL(暗区) | 56.4% / 0.173 / 3.9% | 2.2% / 0.243 / 24.4% |
| orbit | 0.161 | 8.8% | PASS | 64.2% / 0.177 / 13.6% | 15.5% / 0.225 / 24.7% |
| oblique-dusk | 0.532 | 15.5% | FAIL(暗区 15.46%) | 30.0% / 0.137 / 51.5% | 7.8% / 0.203 / 33.3% |
| iso-dusk | 0.491 | 20.7% | FAIL(暗区) | 36.8% / 0.128 / 56.2% | 8.7% / 0.197 / 39.3% |
| zone-dusk | 0.532 | 15.5% | FAIL(暗区 15.46%) | 30.0% / 0.137 / 51.5% | 7.8% / 0.203 / 33.3% |

- **掩码A**（临时口径）= 与该帧"最大面积量化主色"（背景/雾/暗剪影）差异 > 24/255 的像素；
- **掩码B**（临时口径）= 与 3×3 局部均值偏差 > 0.02 的像素（有结构/边缘的"内容"像素）。
- 两个临时口径给出的结论方向一致（内容像素均值 0.13–0.25，明显高于 1.0.1 的 0.05–0.09），
  但绝对值差异大（掩码A 偏悲观、掩码B 偏乐观）→ 这正是需要 t26 统一定义的原因。
- 整帧口径下"暗区偏大"的 axis/focus/fp 主要是**天空/雾/前景地形**占比大，不等于建筑不可读；
  内景 0.0373 与旧阈值 0.04 仅差 0.0027，若 t26 仍采用整帧口径，最小修法是给内景加 1–2 盏
  不投影的室内宫灯（`layout.LIGHT_ANCHORS` 属 frozen，需 foundation-lead 升版）或把
  `LIGHTING.lamps.intensity` 12 → 14；**t2 不自改 shared**。

> **⚠️ 上文（含本节的掩码 A/B 临时口径与 `lamps.intensity 12 → 14` 建议）是 t2 在 1.0.1 时期的**时点记录**，
> 已被后续修订取代，数字**保留不改****：口径由 t26 统一定义为**内容掩码**（见下），`lamps.intensity` 最终由 t26 定为
> **18**（下限 ≥12）、`distance 60`（≥46）、`decay 1`；`goldenHour.lampIntensityScale` 1.0.3 起为 `0.45`。
> 取代关系：`CONFIG 1.0.2`（t19 方案A）→ `CONFIG 1.0.3`（t26 判据收口）→ `CONTRACTS v1.0.6`（t34 明确 axis 档位）。

## 统计口径（跨报告可比，必须写死）

| 项 | 定义 |
| --- | --- |
| 统计对象 | **最终帧缓冲**（含阴影 pass 与 Bloom/Output 后处理之后的画面），即浏览器实际显示的那一帧 |
| 视口 / DPR / 质量档 | `1440×900` / `1` / `medium`（除非命令行显式覆盖；清单里逐张记录 `viewMode` 与 `quality`） |
| `luma` | `0.2126·R + 0.7152·G + 0.0722·B`（sRGB 8bit 归一化到 0–1，**不**做线性化） |
| **暗区** | `luma < 0.08`（`--dark-luma` 可改；清单里记录实际阈值 `darkThreshold`） |
| **高光截断** | `luma > 0.9`（`--clip-luma` 可改；清单记录 `clipThreshold`） |
| 内容占比 | `1 − (最常见量化颜色的像素数 / 总像素)`，用于判定"画面近似纯色/空白" |
| 分位 | p05/p50/p95 为 luma 分位（含全图像素） |
| **内容掩码**（`CONTRACTS §12` / t26） | 排除**背景/天空**像素后的像素集合；**分母 = 内容像素数**。背景色取**同一预设的 city 类视角**侦测结果并全批复用（环境里 `scene.background = lerp(fog, sky, 0.35)` 是**纯色**，故可严格判定） |
| 背景侦测（严格） | 边框 8px 主色占比 ≥25% **且** 顶部 6 行该色占比 ≥50% **且** 该色 luma ≥0.03。**纯黑与暗区不得当作背景**——否则等于把画面里最暗的那部分从分母里删掉，**是变相放宽判据**（这一条是口径能否可信的关键） |
| 容差 | `--content-tol`（默认 6/255） |
| **整帧数字** | **二级诊断**（`整帧(诊断)` 行）。整帧口径会被背景/天空占比放大或稀释，只用于跨报告对比与排查，**不决定通过与否** |

**可读性判据（`CONTRACTS §12`，`CONTRACTS v1.0.6` 起为最终口径；本节 ≤ t2 的旧判据已被取代）**：

| 类别 | 适用视角 | 内容均值 | **内容暗区** | 内容高光截断 |
| --- | --- | --- | --- | --- |
| 俯瞰/环绕类 | `oblique`、`iso`、`orbit`、`zone` | ≥ 0.10 | **≤ 15%** | ≤ 5% |
| 低空/近景类 | `focus`、`fp`、`interior`、**`axis`** | ≥ 0.10（`interior` ≥ 0.04） | **≤ 30%** | ≤ 5% |
| 过曝（通用） | 全部 | 整帧均值 ≤ 0.75 **仅诊断** | — | **主判据：内容高光截断 ≤ 5%** |

- `axis`（中轴透视）属**低空/近景类**：它是低空贴地序列机位，画面以暗地面/暗屋面为主，性质与 `focus`/`fp`/`interior` 同类
  （`CONTRACTS §12.2` 写明依据；**不是"不达标就改分类"**，`v1.0.5` 只写分档未指定 axis 归属）。
- 档位表可复算：`node scripts/shot.mjs --classes`。
- `--judge` 按上表判定并让退出码非零；**判定失败不删除图片**（保留为 `*.invalid.png` 并写入 manifest）。

## 失败证据纪律（主理人裁定）

1. 出图失败时，图片**保留**为 `<name>.invalid.png`（默认行为），连同体积、亮度统计与失败原因一起写入
   `docs/shots/manifest.json`；只有显式 `--no-keep-invalid` 才删除。
2. 阈值（`--min-bytes`、`--min-content`、`--min-luma`）**只决定"能不能出图"**，不决定"要不要留下失败记录"。
3. 删除的只是"交付名"，不是失败事实：`t2-interior-night.invalid.png` 就是 1.0.1 夜景过暗的真实证据
   （12.6KB / 均值 0.053 / 暗区 88.4%），按当时纪律被删过一次，现已按新纪律保留。

## 这些图是怎么来的（可复现命令）

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3"

# 单张（默认 oblique + 盛世金辉）
node scripts/shot.mjs

# 八视角 × 三时辰矩阵
node scripts/shot.mjs --view=all --preset=all

# 指定视角/时辰/命名；--stats 把 HUD 数据面板一起拍进图
node scripts/shot.mjs --view=iso --preset=night --name=t2-iso-night.png --stats
```

## 出图前的机器校验（`scripts/shot.mjs` 内置，任一不满足即删除该图并非零退出）

| 校验 | 说明 |
| --- | --- |
| 浏览器探测 | `CHROME_PATH` → Playwright 缓存 `chrome-headless-shell` → 系统 Chrome/Chromium/Edge；都找不到 → 退出码 2 |
| 就绪信号 | 先 `--dump-dom` 等 `data-palace-ready="1"`（t17 要求的可轮询标记），**不靠固定延时** |
| PNG 尺寸 | 解析 IHDR，必须等于 `--width×--height`（默认 1440×900） |
| 体积下限 | 默认 ≥ 20000B（空白图约 8–12KB） |
| HTTP 证据 | 静态服务必须收到 `/src/main.js` 与 `vendor/three/three.module.js` 请求 |
| stderr 特征 | 命中 `unique user data directory for headless` / `DevToolsActivePort` / `TargetClosed` 等沙箱特征 → 判定失败 |
| 亮度/内容 | 纯 Node 解码 PNG（zlib + 反滤波）输出均值/分位/暗区占比/直方图/内容占比，可用 `--min-luma`、`--min-content` 卡阈值 |

失败时会把「已尝试的 GL 方案、浏览器路径、退出码、URL、HTTP 请求清单、stderr 摘要」全部打印出来，
并**删除**无效 PNG（诊断模式 `--keep-invalid` 会保留为 `*.invalid.png` 以便人工查看）。

## 本机实测环境（用作图证据的可信度说明）

- 系统 Chrome 的 headless 在受限沙箱内失败；可用的是 Playwright 缓存的
  `chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`；
- WebGL 走 SwiftShader（软件光栅化）：`--disable-gpu --enable-unsafe-swiftshader`（脚本 `--gl=auto` 会依次尝试，
  并在每张图上打印实际生效的方案）；
- 因此**帧率不具代表性**（软件光栅化远低于真实 GPU）。真实帧率需在有 GPU 的机器上按 §8.2 采样 ≥30s；
  Node 侧与浏览器侧的批次/三角面数据见 `node scripts/audit.mjs` 与 `?stats=1` 面板。

## 当前覆盖

| 图 | 内容 |
| --- | --- |
| `t2-oblique-*.png` | 首屏 G0：完整宫城（宫墙/角楼/四城门/护城河/四桥/67 栋建筑/14 院落围墙） |
| `t2-iso-*.png` | 等距沙盘（正交投影、方位 45°、仰角 35.264°、机位固定于包络中心） |
| `t2-axis-*.png` | 中轴透视（消费 layout.TOUR_POINTS） |
| `t2-zone-*.png` | 分区机位（默认 city，可用 `?zone=B..F` 切分区） |
| `t2-focus-*.png` | 建筑近景（由包围盒 + 朝向算 3/4 取景；可用 `?focus=<buildingId>`） |
| `t2-interior-*.png` | 室内机位（金銮殿；`?view=interior&zone=C` 为寝殿） |
| `t2-fp-*.png` | 第一人称出生点视角（视线高 = 面高 + 1.65m） |
| `t2-orbit-*.png` | 自由环绕（极角/距离/目标半径受限、可复位） |

> 灰盒阶段（G0）只有体块与屋面形制；真实区域的细节由 t6/t7/t8/t10/t11 交付后替换，
> 替换后请用同一命令重跑同一批文件名，便于逐张比对（相机装置与机位由冻结注册表决定，不随内容变化）。

## 夜景亮度判据（客观数据，用于裁定 moonlitNight 预设）

`scripts/shot.mjs` 用纯 Node 解码 PNG（zlib + 反滤波）输出**内容掩码 + 整帧两组数字**（均值/分位/暗区占比/高光截断/直方图），
因此"夜景是否偏暗"是实测数字而不是感觉。

> **下面的三张表都是时点记录，数字不改**：① 1.0.1 前的实测（用于当时裁定方案A）；② 方案A 探针对照；③ 本轮新增的
> `CONFIG 1.0.3` 内容掩码实测（当前口径的权威数字）。

**① 1.0.1 时期（整帧口径，已被取代）** — 冻结预设 `moonlitNight`（sun 0.75 / ambient 0.36 / hemi 0.32 / exposure 1.18）实测：

| 视角 | 平均亮度 | 暗区(<0.08) | PNG 体积 |
| --- | --- | --- | --- |
| oblique（现状，即 `t2-night-probe-oblique.png`） | 0.073 | 97.7% | 76.5KB |
| orbit | 0.067 | 89.3% | 286KB |
| focus | 0.090 | 74.8% | 92KB |
| interior | **近黑 → 12.6KB，低于空白阈值被脚本删除** | — | — |

同一时刻的灯位事实（`node scripts/audit.mjs` 的三时辰×质量档表）：灯位锚点 49；
实时点光池 = min(config 8, 质量档 8/4/2)；中轴附近"已激活" = 6/4/2；>120m 的远端灯位由 1 个 InstancedMesh
发光材质承担（emissiveIntensity 3.20）。**灯位子系统按 §6.3 工作正常，偏暗来自预设本身。**

`t2-night-probe*.png` 是用**诊断参数** `--env=sun=..,ambient=..,hemi=..,exposure=..`（只改本进程内的预设副本，
**不改 src/shared/**）渲染的对照图，用于给 foundation-lead 提供提亮建议的实测依据：

| 方案 | oblique 平均亮度 | 暗区 | focus 平均亮度 | interior |
| --- | --- | --- | --- | --- |
| 现状 0.75/0.36/0.32/1.18 | 0.073 | 97.7% | 0.090 | 出不了图（近黑） |
| A: 2.0/0.8/0.65/1.35 | 0.101 | 3.7% | 0.175 | 0.053（可出图） |
| B: 2.6/1.1/0.8/1.45 | 0.117 | 2.9% | — | — |

> 数值最终由 foundation-lead 递增 `CONFIG_VERSION` 决定（t2 不自改 shared）。切换后请重跑
> `node scripts/shot.mjs --view=all --preset=all` 覆盖本目录截图。

### ③ `CONFIG 1.0.3` 内容掩码实测（当前口径的权威数字，t26/t34）

固定口径 `1440×900 / DPR 1 / medium / ?ui=0&shot=1`；分母=内容像素（非背景）；阈值见上表。

| 视角 | 类别 | 内容均值 | 内容暗区 | 内容截断 | 内容像素占比 | 整帧（诊断）均值/暗区 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `oblique` | 俯瞰 | 0.1029 | 3.57% | 0.00% | 96.5% | 0.1021 / 4.25% | PASS |
| `iso` | 俯瞰 | 0.1163 | 1.34% | 0.00% | 99.9% | 0.1162 / 1.40% | PASS |
| `orbit` | 环绕 | 0.1611 | 8.37% | 0.00% | 99.5% | 0.1607 / 8.75% | PASS |
| `zone` | 俯瞰 | 0.1029 | 3.57% | 0.00% | 96.5% | 0.1021 / 4.25% | PASS |
| `axis` | **低空** | 0.1541 | 29.31% | 0.00% | 100% | 0.1541 / 29.31% | PASS（≤30%） |
| `focus` | 低空 | 0.2122 | 24.04% | 0.02% | 86.4% | 0.1948 / 21.12% | PASS |
| `fp` | 低空 | 0.1462 | 25.82% | 0.13% | 100% | 0.1462 / 25.82% | PASS |
| `interior` | 内景 | 0.2918 | 1.44% | 2.35% | 100% | 0.2918 / 1.44% | PASS |

内景 × 三时辰（`?view=interior`；B=金銮殿、C=`?zone=C` 寝殿）：B `golden` 0.1097/**66.03%**、B `dusk` 0.1490/**48.96%**、
B `night` 0.2927/1.36% PASS、C `golden` 0.1176/**56.05%**、C `dusk` 0.1290/**53.52%**、C `night` 0.1833/**40.77%** ——
**日/夕内景仍未通过（>30%）**，根因是 kit 隔扇窗不透光 + 金砖基色极暗，最小修法属 kit 侧（见 `docs/handoff-config-1.0.3.md` §5）。

> 复现：`node scripts/shot.mjs --view=all --preset=night --keep-invalid`、`node scripts/shot.mjs --stats-only=<png,...> --judge`、
> `node scripts/shot.mjs --classes`（档位表）。

## 诊断参数（不属于产品规格，仅供排查）

| 参数 | 作用 |
| --- | --- |
| `--gl=auto\|disable-gpu\|swiftshader\|angle-swiftshader\|plain` | 切换 headless 的 GL 启动方案（默认 auto 依次尝试） |
| `--attempts=N` | 同一方案的失败重试次数（沙箱首启偶发挂起） |
| `--timeout-ms=N` / `--virtual-time-ms=N` | 单次超时与虚拟时间预算 |
| `--min-bytes=N` / `--min-luma=X` / `--min-content=X` | 空白图与亮度阈值 |
| `--no-keep-invalid` | 失败图**默认保留**为 `*.invalid.png`；此开关才会删除（不推荐） |
| `--judge` | 按可读性判据判定，不达标则退出码非零（图片保留） |
| `--dark-luma=X` / `--clip-luma=X` / `--city-min-luma=X` / `--city-max-dark=X` / `--interior-min-luma=X` | 判据阈值（默认 0.08 / 0.9 / 0.10 / 0.15 / 0.04） |
| `--near-max-dark=X` | **低空/近景类**（`focus`/`fp`/`interior`/**`axis`**）的内容暗区上限（默认 **0.30**） |
| `--clip-max=X` | **过曝主判据**：内容高光截断上限（默认 **0.05**） |
| `--diag-max-mean=X` | 整帧均值**诊断线**（默认 **0.75**；不决定通过与否） |
| `--content-tol=N` | 内容掩码容差（与背景/天空色的逐通道最大差值，默认 **6**/255） |
| `--classes` | 只打印视角档位表（哪个视角属哪一档、阈值多少）后退出，用于复算"只有 axis 变档" |
| `--browser=<path>` | 指定浏览器（用于自检"找不到浏览器"的失败路径：`--browser=/nonexistent` → exit 2） |
| `--stats-only=<png,...>` | 对已有截图离线输出亮度统计，不出图 |
| `--env=sun=..,ambient=..,hemi=..,exposure=..` | 诊断性提亮覆盖（不改 shared；页面侧同名参数 `?env=`） |
