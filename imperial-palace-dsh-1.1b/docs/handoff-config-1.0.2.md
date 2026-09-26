# 交付回执 · CONFIG 1.0.2 环境预设校准（t19 / T1.3）

> 归属：t1 foundation-lead（`src/shared/**`、`docs/CONTRACTS.md`、`docs/STYLE_GUIDE.md`、`tests/layout.test.mjs` 唯一负责人）
> 任务：t19 — 夜景方案A + 宫灯加强 + 雾距修正（`CONFIG 1.0.2`）+ 三时辰可读性判据入库
> attempt_id：`e44ec581-92b3-4d82-bf9a-0b82c315ac39`
> 版本对应：**`CONFIG_VERSION 1.0.2` ⇄ `CONTRACTS v1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`**

## 1. 改动清单（全部 inScope）

| 文件 | 改动 |
| --- | --- |
| `src/shared/config.js` | `CONFIG_VERSION 1.0.1→1.0.2`；`moonlitNight`：sun `0.75→2.0`、ambient `0.36→0.8`、hemi `0.32→0.65`、exposure `1.18→1.35`；`lamps.intensity 6.5→12`、`lamps.distance 34→46`；`goldenHour.fogNear/Far 700/2400→1400/3200`；`sunset.fogNear/Far 600/2100→1400/3200`（每处带注释与来源） |
| `tests/layout.test.mjs` | 版本 pin 同步为 `1.0.2`（改值未删断言）；**新增 9 条** pin 断言（方案A 四项、宫灯两项、不改预算一项、雾距两项）→ 断言数 **1462 → 1471** |
| `docs/CONTRACTS.md` | 版本表 → `CONTRACTS v1.0.3` + `CONFIG_VERSION 1.0.2`；版本对应关系行同步；修订记录新增 `CONFIG 1.0.2 + CONTRACTS v1.0.3` 条目（含裁定依据数字）；**新增 §12 三时辰可读性与过曝判据**（固定口径 / 阈值 / 与 `scripts/shot.mjs` 参数映射 / 校准记录）。**t17 的 §11 完整保留（未回退）** |
| `docs/STYLE_GUIDE.md` | 版本表同步；§6 重写为三预设冻结值表（含实测定性）、宫灯承担内景/近景亮度的说明、判据指向 `CONTRACTS §12`、"待裁定"提示（goldenHour 均值超 0.6） |
| `docs/report-night-calibration.md` | **新建**：问题/BEFORE/AFTER/结论/复现命令 + 原始判定行（逐字） |
| `docs/shots/t1.3-*.png` | **新增 17 张**证据图（before 8 + after 8 + verify 单张 1），**不覆盖** t2 既有 `t2-*.png` |

**未触碰**：`src/shared/layout.js`（sha256 仍 `be9784b2…`，`LAYOUT_VERSION 1.0.0`）、`src/core/**`、`src/kit/**`、`src/zones/**`、`src/interaction/**`、`src/ui/**`、`index.html`。

## 2. 判据入库（`CONTRACTS §12`，供 V2 复用）

- 固定口径：`1440×900 / DPR 1 / medium / ?ui=0&shot=1`、最终帧缓冲、`luma` 不做线性化、暗区 `luma<0.08`、高光截断 `luma>0.9`。
- 阈值：夜景全城/区域/环绕/近景/第一人称 **均值 ≥0.10 且暗区 ≤15%**；夜景内景 **均值 ≥0.04**（且不得低于 `shot.mjs` 空白阈值 `--min-bytes=20000`）；三时辰通用 **均值 ≤0.6、高光截断 ≤5%**。
- 阈值与 `scripts/shot.mjs` 默认参数一一对应（`--dark-luma/--clip-luma/--city-min-luma/--city-max-dark/--interior-min-luma`），改判据必须同步改脚本并留修订记录。
- 纪律：失败图保留为 `*.invalid.png` + 写 manifest；不得靠删内容达标；报告必须给 均值/p05/p50/p95/暗区/高光/内容占比 + 命令原文。

## 3. 实测（1440×900 · DPR1 · medium · `?ui=0&shot=1`，本机 headless/SwiftShader）

**夜景 6 视角（均值 / 暗区 / 判据）**

| 视角 | BEFORE（1.0.1） | AFTER（1.0.2） | 判定 |
| --- | --- | --- | --- |
| `oblique` | 0.0741 / 94.03% | **0.1031 / 4.11%** | PASS |
| `iso` | 0.0748 / 90.80% | **0.1159 / 1.85%** | PASS |
| `orbit` | 0.0728 / 79.81% | **0.1616 / 8.57%** | PASS |
| `focus` | 0.0905 / 67.54% | 0.1849 / **24.92%** | **FAIL（仅暗区超 15%）** |
| `interior` | 0.0318 / 92.60% | **0.0733** / 72.90% | PASS（均值 ≥0.04，图片 268KB） |
| `fp` | 0.0645 / 89.32% | 0.1310 / **26.05%** | **FAIL（仅暗区超 15%）** |

**三时辰全城机位（`oblique`）**：`golden` BEFORE 0.7131 → AFTER 0.6654 / 暗区 0.80%（**均值超 0.6 上限**，见 §5）；`dusk` BEFORE 0.6001 → AFTER **0.5348 / 暗区 12.15%**（PASS）。
BEFORE 批次的 `--judge` 结论为 `6/6 张不达可读性判据`；AFTER 为 `2/6 张不达可读性判据`，且两张失败项**均值均已达标**（0.185 / 0.131 ≫ 0.10），只差"深阴影像素占比"。

完整表格、直方图、渲染侧/环境侧数字与**原始判定行（逐字）**见 `docs/report-night-calibration.md`。
`interior` 达标靠的是**宫灯加强**（intensity 12 / distance 46），**未动全局太阳**；实时点光上限仍 ≤8、仍不投影（`dynamicShadowBudget = 1`），§8.2 预算不变（`node scripts/audit.mjs` 复核：主场景 263/350、分区 B63/70、C48/50、E40/40、F66/80、三角 237313/1500000，结论"全部预算与契约检查通过"）。

## 4. 三条 verify 命令（原样）

```text
$ node tests/layout.test.mjs
layout.test.mjs：通过 1471 项，失败 0 项      （1462 → 1471，未删任何断言）
 - 槽位 67（B12/C12/D14/E15/F14）… 视角 20，导览点 10，走查点 9，config 1.0.2/v1.0.0

$ node tests/run.mjs
 PASS  tests/kit.test.mjs  2840ms           （496 / 496）
 PASS  tests/layout.test.mjs  227ms         （1471 项全绿）
 PASS  tests/zone-forecourt.test.mjs  3894ms
 PASS  tests/zone-garden.test.mjs  1414ms
 PASS  tests/zone-inner.test.mjs  1068ms
 PASS  tests/zones.test.mjs  4319ms
 FAIL  tests/core.test.mjs  432ms           ← 见 §5 第 1 条（与本次改动无关）
 通过 6 / 7，失败 1，总耗时 14196ms          → exit 1

$ node scripts/shot.mjs --view=oblique --preset=night --name=t1.3-oblique-night.png --keep-invalid
shot: ✓ t1.3-oblique-night.png  1440×900 · 135.2KB · 9818ms · GL [disable-gpu]
        亮度 均值 0.1036 · p05 0.0844 · p50 0.0884 · p95 0.1966 · 暗区 3.72% · 高光截断 0.00% · 内容占比 29.2%
        可读性判据 PASS
        浏览器实测：整帧调用 263 · 可见三角面 240582 · 实时宫灯 0/4（锚点 59） · 太阳 2 / 环境 0.8 / 半球 0.65 / 曝光 1.35 · 建筑 67
→ exit 0

$ node scripts/audit.mjs
 主场景绘制调用 : 263 / 上限 350 ✓ · 可见三角面 237313 / 1500000 ✓ · 阴影 pass 47 个投影对象 / 实时投影光源 1 盏
 结论：全部预算与契约检查通过                    → exit 0
```

## 5. 未达标项与需要裁定的三件事（如实上报）

1. **`node tests/run.mjs` 不是全绿（6/7）——根因是 `tests/core.test.mjs` 的静态源码扫描误报，与本次改动无关**：
   失败断言为「全仓只有 src/main.js 创建 Scene、挂载 scene、运行 requestAnimationFrame」，
   实际列出 `src/interaction/index.js, src/interaction/tour.js, src/main.js`。复核后确认：
   这两个文件里 `requestAnimationFrame` **只出现在文档注释**（"不调用 requestAnimationFrame" / "不使用 `setInterval` / `requestAnimationFrame`"），
   去掉注释行后真实调用数为 **0**；测试用的是裸字符串 `text.includes('requestAnimationFrame')`，因此把注释也算了进去。
   这是 **t2 的测试扫描缺陷**（触发者是 t9 的注释措辞），建议 t2 在扫描前剥离注释（或改为匹配调用形态 `requestAnimationFrame(`）；
   本任务 inScope 不含 `tests/core.test.mjs`，故**未改**，如实上报。
2. **`focus` / `fp` 夜景暗区超 15%（24.92% / 26.05%）**：均值均已达标（0.185 / 0.131），差距只在"深阴影铺地/柱间暗部"的像素占比。
   本次**不再加灯**是因为验收第 1 条把 `intensity 12 / distance 46` 与方案A 四项**逐值 pin 死**，加灯属超授权改动；
   建议三选一（详见报告 §5）：(a) 近景/第一人称类视角暗区上限放宽到 30%（推荐，成本最低，阈值须与 `shot.mjs --city-max-dark` 同步）；
   (b) 授权继续加灯（如 12→16 / 46→56）或加近景专属灯锚点；(c) 提升石材/铺地 `envMapIntensity`（属 t3 域）。
3. **`goldenHour` 全城 `oblique` 均值 0.6654（BEFORE 0.7131）> 判据 0.6 上限**：高光截断 0.00%、暗区 0.80%，71% 像素集中在最亮档（天空/雾占比大）。
   本次只改其雾距、未动亮度。建议把"均值上限"改为 ≤0.75（天空主导画面的机位天然偏亮）或授权下调 `goldenHour` 天空亮度/曝光，按 `CONFIG_VERSION` 递增流程处理。

## 6. 未验证项 / 已知限制

1. **真实 GPU 帧率/D 与 E 区**：D（`src/zones/west-courts.js`）尚未交付、E 刚落地；`oblique` 实测整帧调用 263、三角面 240582 会随 D 交付再变——**V2/t13 必须在全部区域落地后重跑本报告的全矩阵**。
2. 本机 headless 走 SwiftShader，帧率不具代表性（判据只用亮度/几何，不依赖帧率）。
3. 证据图的 before/after 是"同一内容、仅预设不同"的受控对比；但两次批次相隔约 6 分钟，`src/zones/**` 在此期间有并行写入（BEFORE 批次 07:10–07:12 / AFTER 07:14–07:19），
   **几何条数在 verify 单张时已变为 263 调用**（区域继续落地）——因此**亮度结论以此为准，几何条数不作跨批次对比**（已在报告表格中分别标注各批次实测值）。
4. `moonlitNight` 雾距（420/1800）未改：夜间保留暗色空气透视；若 V2 认为夜景远侧偏"雾化"，需另开版本裁定。

---

## 7. attempt 2 复核（2026-09-26 07:45，t19 重派）

attempt 1 曾因 `node tests/run.mjs` 非全绿（当时唯一失败者为 t9 进行中的 `tests/interaction.test.mjs`）被判 failed。
重派后本次**只做复核，未改任何交付内容**。

复核结论

1. **冻结值未变**（运行时回读）：`v1.0.2 | night 2 0.8 0.65 1.35 | lamps 12 46 max 8 | shadowBudget 1 | fog 1400 3200 / 1400 3200 | LAYOUT 1.0.0 slots 67`；
   `docs/CONTRACTS.md` 的 §11（t17）与 §12（t19）均仍完整，报告/回执/17 张 `t1.3-*` 证据图在位；`node tests/layout.test.mjs` 仍 **1471 项全绿**。
2. **verify 2（夜景单张）通过**，且**内容增长后校准依然成立**：本次 `t1.3-oblique-night.png` 均值 **0.1021**、暗区 **4.25%**、高光截断 0.00%、判据 PASS
   （attempt 1 时全城几何为 263 调用 / 240582 三角面；本次 D 区（west-courts）已落地，实测**511 调用 / 562470 三角面 / 灯位锚点 70**，
   亮度只从 0.1031/4.11% 微变到 0.1021/4.25% —— 说明方案A 的判据余量对内容增长稳健）。
3. **verify 3（`node scripts/audit.mjs`）通过**：主场景 293/350 ✓；分区 B 58/70 ✓、C 49/50 ✓、D 39/40 ✓、E 40/40 ✓、F 61/80 ✓；可见三角面 288609/1500000 ✓；实时投影光源 1 盏。
4. **verify 1 仍未全绿，但失败项与 t19 无关**：`node tests/run.mjs` → 10 / 11，唯一失败为 **t10 的 `tests/zone-west.test.mjs`**
   （mtime 07:45:15，同时 `src/zones/west-courts.js` mtime 07:45:34 = **正在写入**）。失败断言为 D 区自有的荷池细节
   （汀步终点 50±0.01 实测 54、池心岛被 `OB-D-court3-pavilion` 阻挡），属 t10 进行中的实现与自己的测试，不在 t19 inScope。
5. **最终复跑（07:49:06）：`node tests/run.mjs` → exit 0，「通过 11 / 11，失败 0，总耗时 28506ms」**
   （t10 的 `zone-west` 随后自行修复：PASS 3875ms）。三条 verify 至此全绿：

   ```text
   $ node tests/run.mjs
    PASS  core-walls · core · interaction · kit · layout · zone-east · zone-forecourt · zone-garden · zone-inner · zone-west · zones
    通过 11 / 11，失败 0，总耗时 28506ms                     → exit 0

   $ node scripts/shot.mjs --view=oblique --preset=night --name=t1.3-oblique-night.png --keep-invalid
    均值 0.1021 · 暗区 4.25% · 高光截断 0.00% · 可读性判据 PASS   → exit 0

   $ node scripts/audit.mjs
    主场景 293/350 ✓ · B 58/70 ✓ · C 49/50 ✓ · D 39/40 ✓ · E 40/40 ✓ · F 61/80 ✓ · 三角 288609/1500000 ✓
    结论：全部预算与契约检查通过                              → exit 0
   ```

   §7 第 4 条保留的是 07:45 时点（t10 正在写入）的真实观察；第 5 条是修复后的复核结果，两者均如实记录。
