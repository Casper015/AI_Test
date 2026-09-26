# 交付回执 · 权威背景色接入 + 「无天空视角」口径固化（t46 / T1.12）

> 归属：t1 foundation-lead · 任务 t46 · attempt_id `3d7503c7-2807-49af-977f-2380ce41e9b3`
> 性质：**repair**（只改 `scripts/shot.mjs`、`tests/shot-mask.test.mjs`、`docs/CONTRACTS.md` 与本回执 + 两张证据图/manifest）
> 阈值 `15% / 30% / 5%` 与 `axis` 分类**未动**；**未用** `--allow-no-sky` 静默退回。

## 1. 接入：**权威背景色优先**，像素法降级为交叉校验

`?stats=1` 的 `<pre id="palace-stats-json">` 现含 t45 的 `backgroundColorHex`（已由 main.js 落地），`scripts/shot.mjs` 的消费链：

| 步骤 | 行为 |
| --- | --- |
| 1 | 渲染后读取 `?stats=1` 报告里的 `backgroundColorHex`（→ `hexToRgb`）并**按预设缓存**（同一预设背景恒定） |
| 2 | **权威口径**：掩码 = 与权威色距离 ≤ `--content-tol`(6) 的像素，`role` 一并记录 |
| 3 | **像素法（t44）** 同时跑，作为**交叉校验/兜底**，并报告 `Δ = max|Δrgb|`；`Δ > 8` ⇒ 打印「与权威不一致（像素法可能失效）」 |
| 4 | 权威字段缺失 ⇒ 回退像素法；两者都没有 ⇒ 防护告警（不静默通过） |

新增纯函数（可机器校验、已被单测覆盖）：`decideBackgroundPolicy()`、`hexToRgb()`。

## 2. 「无天空视角」正式口径（已写入 CONTRACTS §12.1.1）

若**权威背景色在画面中占比 < 0.5%**（`--no-sky-share`，默认 0.005）⇒ 该机位**看不到天空** ⇒ **整帧即内容**，
阈值与分类**一律不变**，输出必须标注依据；**禁止** `--allow-no-sky` 静默退回（该开关仅保留给"无权威字段且像素法也找不到天空"的兜底）。

## 3. 复算结果（CONFIG 1.0.6）

| 视角 | 口径 | 背景 | 内容占比 | **内容暗区** | clip | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| `fp`（夜） | **authoritative** | `rgb(23,31,47)` role=`skyNight`，画面占比 5.16% | 94.8% | **26.52%** | 0.14% | **PASS（≤30%）** |
| `axis`（夜） | **no-sky-view**（权威占比 0.44% < 0.5%） | 无天空可识别 | 100%（整帧即内容） | **15.10%** | 0.00% | **PASS（≤30%）** |

**原始输出（逐字）**

```text
$ node scripts/shot.mjs --view=fp --preset=night --keep-invalid        → exit 0
        内容掩码[near] 均值 0.1586 · 暗区 26.52%（上限 30%） · 高光截断 0.14%（上限 5%） · 内容像素 94.8% · 背景 rgb(23,31,47)@5%（容差 6、离散 ±0）
        ✓ 背景掩码防护：未触发（背景已识别，内容占比 94.8%）
        背景口径[authoritative]：权威背景 rgb(23,31,47) role=skyNight（画面占比 5.16%）
        像素法交叉校验：rgb(8,16,34)（整帧内容占比 71.5%、暗区 2.40%） ⚠️ 与权威不一致（>±8，像素法可能失效）
        PASS night   fp        [near] 内容均值 0.1586 内容暗区 26.52% 内容截断 0.14% | 整帧均值 0.156

$ node scripts/shot.mjs --view=axis --preset=night --keep-invalid      → exit 0
        内容掩码[near] 均值 0.1866 · 暗区 15.10%（上限 30%） · 高光截断 0.00%（上限 5%） · 内容像素 100.0% · 无背景色（全画面为内容）
        ✓ 背景掩码防护：未触发（背景未识别（内景或无天空画面，已按规则放行），内容占比 100.0%）
        ℹ️ 无天空视角（正式口径）：权威背景 rgb(23,31,47) role=skyNight 在画面中仅占 0.44% < 0.5% ⇒ **整帧即内容**（阈值与分类不变）（口径依据：渲染侧 ?stats=1 的 backgroundColorHex）
        像素法交叉校验：未找到真天空（以权威口径为准）
        PASS night   axis      [near] 内容均值 0.1866 内容暗区 15.10% 内容截断 0.00% | 整帧均值 0.1866
```

## 4. 开放项（如实登记，需裁定/派单）

**权威清屏色与画面实际天空像素存在 `Δ = 15`**：权威 `#171f2f` = `rgb(23,31,47)`，而像素法在 `fp`（夜）里测到的最大平坦带是 `rgb(8,16,34)`；
`axis` 的同预设帧同样以 `rgb(23,31,47)` 为权威值。两种口径**都 PASS**（权威 26.52% / 像素法 2.39%），因此本次结论不因该差异翻转，但**语义分歧必须收口**：
- 可能原因：清屏色虽标称 `toneMapped:false`，实际仍经过合成/输出变换（或帧首若干行的雾/渐晕使像素偏离）；
- 建议（**属 `src/core`，不在本任务 inScope**）：在 `?stats=1` 里**同时上报首帧首行的实际像素采样**（或提供 `backgroundPixelProbe`），让"上报色"和"落屏像素"在一次测量里对齐；
- 在收口前，**判据一律以权威色为准**（§12.1.1），像素法仅作交叉校验——这正是本次固化的口径。

## 5. 契约同步

- `docs/CONTRACTS.md` → **`CONTRACTS v1.0.8`**：新增 **§12.1.1「背景引用：权威背景色优先」**（含优先级表、交叉校验义务、**无天空视角**正式口径与禁令）；
  §11.4 追加**背景/雾权威字段表**（`backgroundColorHex/Linear/Space`、`backgroundToneMapped/Role`、`fogColorHex/Near/Far`，含"雾与背景是两个量、雾洗白远景属内容"的口径说明）；
  同时把头部版本表/映射行的 `CONFIG_VERSION` 从 **1.0.3 → 1.0.6**（t42 已递增，本次补齐；LAYOUT/KIT/STYLE 未动）。
- 修订记录**只追加** v1.0.8 条目，历史条目未改写。

## 6. verify（四条，原样）

```text
$ node tests/shot-mask.test.mjs
shot-mask.test.mjs：通过 37 项，失败 0 项                        → exit 0
（含雾夜语料、强梯度雾、精确像素案例、防护四例、真实 dusk/night/fp 自检）

$ node scripts/shot.mjs --view=fp --preset=night --keep-invalid   → exit 0（PASS，权威口径 26.52%）
$ node scripts/shot.mjs --view=axis --preset=night --keep-invalid → exit 0（PASS，无天空视角 15.10%）
$ node scripts/audit.mjs                                          → exit 0  「全部预算与契约检查通过」
```

证据已刷新：`docs/shots/t2-fp-night.png`、`docs/shots/t2-axis-night.png`、`docs/shots/manifest.json`；无 `*.invalid.png` 残留。

## 7. 未验证项

1. `Δ=15` 的成因未定位（属 `src/core` 上报/合成链，见 §4）；本任务只把它**登记并口径化**，未改渲染。
2. `--no-sky-share` 默认 0.5% 取自 `axis`（0.44%）与 `fp`（5.16%）的分界；更多机位（尤其 dusk/golden 的低空类）尚未复算，若出现 1%–5% 的边界机位需复核该阈值。
3. 未做真实 GPU 目视；本任务只关乎度量口径与判据引用。
4. 逐区（zone）视角的权威背景消费未验证（本次只覆盖 `fp`/`axis` 两个 inScope 证据图）。
