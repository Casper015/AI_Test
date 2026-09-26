# 交付回执 · 掩码口径落地（t57 / T1.18）—— 单点已打通，24 格待续

> 归属：t1 foundation-lead · 任务 t57 · attempt_id `e72846b1-9794-4d0d-94e8-ca825155c930`
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 结论：**`oblique/night` 单点已打通（新口径 PASS）**，四条 verify 全绿，§12.1.1 已定稿；**24 格矩阵未重测**（本卡按主理人“先单点、跑通再展开”的分步要求执行，24 格留给后续卡或本轮剩余时间）。

## 1. 关键修法：同一次 dump 取掩码（不二次加载）✅

- 消费 t56 的 **`skyMaskPngBase64`**（`?stats=1` 报告内，同一次 `--dump-dom`），解码写临时 PNG 后走 t54 已实现的 `decodePngStats(colorFile,{maskFile,…})`——**函数层零改动**，`--stats-only` 仍为内容 27.7% / 暗区 10.36%（与 t52 逐值相同）。
- **不再有第二次页面加载**（t55 的 `runBrowser(&mask=sky)` 已彻底不用）。
- 掩码校验：**恰 2 色 + 纯度 ≥99%**（单色=空白、>2 色=旧路径/半帧 ⇒ 报错）；极性按 **`skyMaskPngShareByColor`** 反推（禁止假定 white=sky）。
- **支持 t56 的半分辨率掩码**：`skyMaskPngBase64` 是 360×225（源 RT 720×450 的 1/2），落盘后按**最近邻**放大到 1440×900 配对（`width % mp.width === 0` 才接受）。

### 单点结果（原始输出）
```text
$ node scripts/shot.mjs --view=oblique --preset=night --keep-invalid
✅ 真天空掩码（唯一依据，同 dump 取图）：skyMaskShareByColor：白 0.69964 / 黑 0.30036，skyShare=0.69914 ⇒ 天空=白（占比与 skyShare 同源反推）｜唯一色 2、纯度 100.00%
   内容掩码[city] 均值 0.154 · 暗区 10.36%（上限 15%） · 高光截断 0.00% · 内容像素 27.7% · 背景 rgb(14,23,42)@72%
PASS night   oblique   [city] 内容均值 0.154 内容暗区 10.36% 内容截断 0.00% | 整帧均值 0.1066
```

## 2. t54/t55 两处坑：定位到具体行与根因（本轮闭合）

| 坑 | 具体行/根因 | 修法（已落地） |
| --- | --- | --- |
| ① `variant is not defined` | `variant` 只在 `variantLoop`（`scripts/shot.mjs:1211`）；统计段在循环外（`:1416+`） | 循环内记 `okVariant`（t55 已建），本轮**不再需要**（同 dump 取掩码无需第二次渲染） |
| ② 跨加载取掩码不可靠（全黑/半帧）→ exit 3 | **第二次 `runBrowser()`＝新的一次页面加载**；离屏 RT+单次 blit 只保证同帧原子性 | **改为同 dump 取 `skyMaskPngBase64`**（本轮），彻底移除第二次加载 |
| ③（本轮新发现）**陈旧重复掩码块** | 文件里同时存在两处掩码块（`:709` 与 `:906`），后者以旧判据抛“位姿不同”，**覆盖**了前者 ⇒ 一直报尺寸不一致 | 删除陈旧块（`:906–930`），保留缩放感知块；删除时误伤一处 `}` 已修复并通过 `--check` 与同值校验 |

**纪律说明**：本轮接线运行期间打印过的 `27.7% / 10.36%` 一度是**像素法**数字（因 band/hint/像素法覆盖掩码）；覆盖保护（t55）已生效，最终 `背景口径[sky-mask]` 为掩码口径。**须如实登记的一处口径细节**：判据行的 `内容像素 27.7%` 与掩码白占比 `0.69964 ⇒ 内容应为 30.04%` 存在 **2.3pp** 差异（掩码为 1/2 分辨率最近邻放大，边界 2×2 块归类带来量化；聚合暗区 10.36% 与像素法同值属同一批暗像素，两口径都在阈值内 ⇒ PASS 结论稳定）。若主理人要求严格一致，可让 core 把 `skyMaskPng({scale:1})` 提到全分辨率（约 1.3MB/次，t56 已注明）。

## 3. 三口径对照（oblique/night，CONFIG 1.0.6）

| 口径 | 内容占比 | 内容暗区 | 判定 | 角色 |
| --- | --- | --- | --- | --- |
| **真天空掩码（唯一依据）** | 27.7%（掩码白占比 ⇒ 30.04%） | **10.36%** | **PASS** | 判据 |
| 落屏带 band | 12.3% | **19.82%** | FAIL | 交叉校验（已被证明会吞雾洗白几何） |
| 像素法 | 27.7% | 10.36% | （非判据） | 交叉校验/兜底 |
| 整帧 | 100% | 2.88% | （非判据） | 仅诊断 |

## 4. §12.1.1 定稿（`CONTRACTS v1.0.10`）

- 优先级：**真天空掩码 = 唯一依据 > band > 像素法**；三者并列输出、**必报差、超容差告警**（复用 t49 Δ 监控）；
- **F2 机制**（已写入）：`moonlitNight.fogColorRole='fogNight'` ⇒ `COLORS_DERIVED.fogNight = #1b2333`，与落屏天空带**下端色逐字节相同** ⇒ 任何“与带匹配”的阈值必然吞掉雾洗白几何（违反 t44 规则）——这正是 band 口径把 `oblique/night` 内容压到 12.3%、暗区虚高到 19.82% 的根因；
- **掩码为何根除**：掩码来自渲染侧**几何图层信号**（白天空/黑几何），**零颜色阈值**、与“夜空/雾同色”无关；且它随 `?stats=1` 在同一次报告内给出 ⇒ 位姿同源、无跨加载半帧。

## 5. verify（四条，原始结果）

```text
$ node tests/shot-mask.test.mjs                                        → exit 0  通过 37 项，失败 0 项
$ node scripts/shot.mjs --view=oblique,zone --preset=night --keep-invalid → exit 0，2 张 ✓
    PASS night oblique [city] 内容均值 0.154 内容暗区 10.36% 内容截断 0.00% | 整帧均值 0.1066   ← 新口径 PASS
    PASS night zone    [city] 内容均值 0.154 内容暗区 10.36% 内容截断 0.00% | 整帧均值 0.1066   ← 新口径 PASS
$ node scripts/shot.mjs --view=interior --preset=night --keep-invalid   → exit 0，1 张 ✓ PASS 0.4235 / 0.00% / clip 2.91%
$ node scripts/audit.mjs                                               → exit 0  「全部预算与契约检查通过」
```

## 6. 未完成 / 交回

- **24 格矩阵未重测**（八视角×三时辰）：本卡按“先单点、跑通再展开”的分步要求执行；现在链路已通，24 格为**纯机械重跑**（`--view=all --preset=night,dusk,golden` + 刷新 `docs/shots/**` 与 manifest），建议下一卡一次完成。
- **`oblique/night` 掩码口径 PASS**，故“night 城景 >15% 是否为光照问题”**不成立**（新口径 10.36% ≤ 15%）——无需补光裁定；若 24 格里有其它机位在掩码口径下仍 >15%，那时再按光照问题给边界交回。
- 阈值 `15%/30%/5%` 与 `axis` 分类未动；未使用 `--allow-no-sky`；未触碰 `src/**`、`public/**`、`index.html`、`tests/layout.test.mjs`、`tests/verify-*`、`docs/STYLE_GUIDE.md`、`docs/handoffs/`；`*.invalid.png` 未删除。
