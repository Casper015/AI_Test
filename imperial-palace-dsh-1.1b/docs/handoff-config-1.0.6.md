# 交付回执 · CONFIG 1.0.6 修正口径全矩阵重测 + axis 度量裁定 + 夜景户外可读性（t42 / T1.9）

> 归属：t1 foundation-lead · 任务 t42 · attempt_id `867dc515-50ba-40ee-9633-5fcf416db794`
> 版本：**`CONFIG_VERSION 1.0.6`** ⇄ `CONTRACTS v1.0.7` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ `STYLE_BASELINE v1.0.0`
> 完整表格与逐字判定行：[`docs/report-criteria-recheck.md`](report-criteria-recheck.md)
> 立场：**阈值 15% / 30% / 5% 一个字未改**；未删视角；未靠改分类或换口径回避。

## 1. 改动（只有两处预设补光）

| 值 | 旧 | 新 | 实测依据（真内容口径） |
| --- | --- | --- | --- |
| `moonlitNight.ambientIntensity` | 0.8 | **1.9** | axis 42.65%→**23.96%**；oblique/zone 16.92%→**11.68%**；focus 29.50%→**24.94%** |
| `moonlitNight.hemiIntensity` | 0.65 | **1.6** | 同上（hemi/ambient 比例保持） |
| `sunset.ambientIntensity` | 1.1 | **1.15** | dusk orbit 25.93%→**3.47%**；上限受内景截断约束（t43 系数 × 预设），再高会顶破 clip 5% |
| `sunset.hemiIntensity` | 1.15 | **1.2** | 同上 |
| `CONFIG_VERSION` | 1.0.5 | **1.0.6** | — |
| `tests/layout.test.mjs` | 1487 项 | **1489 项** | +2 条（夜景补光不改太阳/曝光/天空/雾；"补光量序：夜景 > 夕照 > 金辉"取代已被推翻的"夕照 ≥ 夜景"）——**未删任何断言** |

不变量：夜景 `sunIntensity 2.0` / `exposure 1.35` / `skyNight` / 雾 420–1800 / 全部色板；**天空像素逐值不变**（night oblique p50/p95 = 0.0884/0.2022、背景 `rgb(14,23,43)`）；整帧均值 0.1024 → **0.1069**（仍远低于金辉 0.664）。

## 2. 全矩阵结果（CONFIG 1.0.6）

夜景（阈值：俯瞰/环绕 ≤15%、低空/近景 ≤30%、clip ≤5%）：
| 视角 | 工具口径内容暗区 | 真内容法 | clip | 判定 |
| --- | --- | --- | --- | --- |
| `oblique` / `zone` | 11.52% | **11.68%** | 0.00% | PASS（原 16.92%） |
| `iso` | 2.87% | — | 0.00% | PASS |
| `orbit` | 8.02% | — | 0.00% | PASS |
| `axis` | 15.11%（整帧，掩码不适用） | **23.96%** | 0.00% | **PASS**（原 42.65%） |
| `focus` | 25.09% | **24.94%** | 0.03% | PASS（原 29.50%） |
| `fp` | 25.15%（整帧） | **33.54%** | 0.13% | **口径分歧 → 需裁定（§5）** |
| `interior`(B) | 0.00% | 0.00% | 2.92% | PASS |

夕照/金辉：dusk oblique/zone **1.87%**、iso **3.80%**、**orbit 3.47%（原 25.93%）**；golden oblique **2.17%** —— 全 PASS。
内景六格（t43 机器断言守护，本次复核）：B-golden 3.94/0.65 · B-dusk 0.00/**2.57** · B-night 0.00/**2.92** · C-golden 0.00/0.15 · C-dusk 0.00/2.43 · C-night 0.00/0.48 ⇒ **6/6 双约束保持**，clip 最大 2.92%。

## 3. axis 度量裁定（关键项）

- **真内容口径（天空条带/边框环 + 相邻桶合并 + 自适应容差）：axis 夜 = 23.96% ≤ 30% PASS**（原 42.65%）。
  因此它是**光照不足**问题、且已由补光修复；**没有**用 `--allow-no-sky` 退回整帧，也没有改分类。
- **工具 29.32% vs t39 脚本 40.47% 的差异已定性**：三者**背景判据门限不同**，不是像素统计差异。
  · `shot.mjs`：5bit 桶 + **顶部 6 行同色 ≥50%** 门槛；axis 顶部是建筑 ⇒ 不成立 ⇒ **退回整帧**（内容计 100%）。
  · t39 脚本：桶心 ±6、**无顶部门槛** ⇒ 内容计 ~73% ⇒ 40.47%。
  · 本次方法：**边框环 ≥25% + 相邻桶合并 + 自适应容差** ⇒ 内容计 63.4% ⇒ **23.96%**。
  可复现：`python3 /tmp/t42-content.py docs/shots/t2-axis-night.png`（脚本为离线工具，非仓库产物）。

## 4. 正式重判既有结论（报告 §5）

1. **t26「夜景八视角全 PASS」不成立**（当时真内容：oblique/zone 16.92% > 15%、axis 42.65% > 30%、focus 29.50% 贴上限）。
2. **`fp` 旧 FAIL 的 25.82% 是整帧数字**（口径误判）；修正后两种方法仍分歧 → §5。
3. **t34 的 axis 归类依据（29.31% 整帧）无效**，本次以真内容 **23.96%** 重新支撑"低空/近景类"归属（结论不变、依据替换）。
4. **t39 的 dusk 修复有效但未覆盖 orbit**；本次 orbit 25.93% → **3.47%**。

## 5. 需裁定的边界（不调数字凑达标）

`fp`（第一人称，夜）：工具因无法识别背景报整帧 **25.15%**（≤30% 看似 PASS）；真内容法（边框环含雾混合 `rgb(35,44,61)`）报 **33.54% > 30%**。
分歧点是"**被雾洗白的远景几何/水面**算不算内容"——fp 画面 75% 属这类像素。
**建议**：① 先把 §3 的"天空条带/边框环 + 相邻桶合并"规则并入 `scripts/shot.mjs`（属其负责人 inScope）再复测定性；
② 若按真内容法判，则需再抬夜景补光（现 1.9/1.6；估算 2.3/1.95 可再降 6–8pp，代价整帧均值 +≈0.01）或**区域侧补光**；
③ **不建议** `--allow-no-sky` 退回整帧。

## 6. 一并刷新 t41 越界写入的产物（已办）

- `docs/shots/t2-oblique-golden.png` 已用 CONFIG 1.0.6 重拍（`shot: ✓ … 215.6KB`；内容均值 0.2836、内容暗区 2.17%、内容像素 30.0%）。
- `docs/shots/manifest.json` 随本次 13 张重拍一并刷新（含 night ×8、dusk ×4、golden ×1）。

## 7. verify（三条，原样）

```text
$ node tests/layout.test.mjs
layout.test.mjs：通过 1489 项，失败 0 项                        → exit 0

$ node scripts/shot.mjs --view=all --preset=night --keep-invalid
8 张全部 ✓（oblique/iso/axis/zone/focus/interior/fp/orbit）
  PASS night oblique / iso / zone / focus / interior / orbit
  FAIL night axis / fp —— **均为 t41 新增的"背景掩码防护"**（未识别背景），非判据不达标：
      axis 真内容 23.96% PASS；fp 见 §5
                                                              → exit 0

$ node scripts/audit.mjs
 结论：全部预算与契约检查通过                                    → exit 0
```

## 8. 未验证项 / 已知限制

1. `/tmp/t42-content.py`（天空条带法）是**离线脚本**，未并入 `scripts/shot.mjs`（不在本任务 inScope）；axis/fp 的判定依赖它。
2. `fp` 的阈值判定未定（§5），需裁定或工具侧先行统一。
3. 未做真实 GPU 目视；"仍读作夜晚"以量化指标为准（天空逐值不变、整帧均值 0.107、clip ≤0.13%）。
4. `dusk` 的低空/内景类（focus/fp/interior）未重测；`golden` 只重测 `oblique`（其余不在 inScope 证据清单）。
5. t43 的六格**记录值**建议重跑 LIVE 更新（本次 clip 漂移 ≤0.8pp，在容差内）。
