# 交付回执 · 掩码接线最小切片（t55 / T1.17）—— 未完成，坑已定位到根因

> 归属：t1 foundation-lead · 任务 t55 · attempt_id `b148a634-fc87-4d45-86d5-29c1b458b5ac`
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 结论：**`oblique/night` 单点未打通**（判据行仍为 band 口径 **19.82% FAIL**，按卡要求不作为结果提交）；但 **t54 的两处坑已定位到根因**，并给出可执行的最小修法。为不留坏工具，渲染接线再次回滚（函数层与新增校验**保留**）。

## 1. 本卡实际改动（保留部分）

| 项 | 状态 |
| --- | --- |
| `readPngPixels()`（复制式）+ `decodePngStats(color,{maskFile,…})` | **保留**（t54 成果，未改） |
| 同值证据 | `node scripts/shot.mjs --stats-only=docs/shots/t2-oblique-night.png` → 内容均值 0.1540 · **暗区 10.36%** · 截断 0.00% · **内容像素 27.7%** · 整帧 0.1066/2.88%（与 t52 基线逐值相同） |
| **覆盖保护**（新增，保留） | 掩码图为唯一依据时，**band / 单色 hint / 像素法候选均不得覆盖**：`if (backgroundBand && !noSkyView && options.__maskSource !== 'sky-mask-image')`、`else if (backgroundHint && …)`、`const skyCandidates = options.__maskSource === 'sky-mask-image' ? [] : […]` |
| **掩码校验收紧**（新增，保留） | 由「唯一色 ≤8 且纯度 ≥99%」改为 **「恰为 2 色」且纯度 ≥99%** —— **单色（全黑/全白）= 空白/未渲染**，与 >2 色（旧路径/半帧）一样必须**报错**，不得凑合计算 |
| `okVariant` 记录（新增，保留） | 在 `variantLoop`（`scripts/shot.mjs:1211`）内记录 `okVariant = variant`，供循环外的掩码调用复用 |
| 渲染接线 | **再次回滚**（原因见 §2），当前判据仍走 band 口径 |

## 2. t54 两处坑：定位到具体行与根因

### 坑① `variant is not defined` —— **已定位并修复**
- 位置：`variant` 只存在于 `variantLoop`（`scripts/shot.mjs:1211` 起的 `for (const variant of glVariants)`）；而统计段（`renameSync(tempPath, outPath)` 之后的 `let px = null; …`，约 `:1416+`）**在循环之外** ⇒ 该处引用 `variant` 必然 `ReferenceError`。
- 最小复现：t54 的 opt-in 接线 + 任意 `--sky-mask` 单帧渲染。
- 修法（本次已落地、保留）：循环内 `if (verdict === 'ok') okVariant = variant;`，调用点用 `okVariant`。

### 坑② opt-in 后多视角 exit 3 —— **根因已找到：掩码必须在"同一页面加载"内取得**
- 我的接线用**第二次 `runBrowser()`**（新的一次无头加载）渲染 `&mask=sky` 截图；实测该路径产出的掩码图**不可靠**：
  - 本次运行拿到 **唯一色 1（全黑）** 的掩码图 —— 与 t53 记录的"半帧"同源；
  - t53 的修法（离屏 RT + 单次 blit）保证的是**同一帧内**的原子性，但**跨页面加载**时相机过渡/掩码 blit 的就绪时点仍可能落在"未就绪"处 ⇒ 空白/半帧。
- 由此产生 exit 3：掩码图不合格时我的 `decodePngStats` 按卡要求**抛错**（正确行为），但抛错点与调用点的 try/catch 边界在多视角路径下没有覆盖干净（未逐行定位到行号——**这一点我不掩饰**）。
- **最小修法（建议交给下一手，一步到位）**：**不要在新加载里截掩码**。让页面在**同一次加载**里把掩码画布喂给 DOM——例如 `main.js` 在 `?stats=1` 的 `<pre id="palace-stats-json">` 中追加 `skyMaskPngBase64`（离屏 RT 的 `toDataURL()`，或 720×450 的 RLE/位图），`shot.mjs` 复用**已有的 `--dump-dom` 这一遍**取回并配对。这样：无第二次加载、无作用域问题、位姿与掩码**同源**。
  - 该字段属 `src/main.js`（core 的 inScope，不在本卡），需派单；`shot.mjs` 侧消费改动很小（新增一个 base64→Uint8Array 的解码 + `readPngPixels` 复用）。

## 3. 三口径对照：**本次未取得掩码口径真实数字**

| 口径 | oblique/night 内容占比 | 内容暗区 | 判定 | 说明 |
| --- | --- | --- | --- | --- |
| band（当前判据） | 12.3% | **19.82%** | FAIL | **不作为结果提交**（按卡要求） |
| 像素法 | 27.7% | 10.36% | （非判据） | 与我"掩码接线"运行中打印的数字同值 —— 因为**掩码被 band/hint/像素法覆盖**（已修覆盖保护） |
| 真天空掩码 | **未取得** | **未取得** | 预期 内容 30.09% ⇒ 暗区 ~9.5% PASS | 掩码图不可靠（全黑/半帧）⇒ 未能作为判据来源 |

**诚实说明**：接线尝试运行中打印出的 `10.36%` 是**像素法**的数字，不是掩码口径的数字；把它当成掩码结果提交会构成伪造，因此本卡**不提交**该数字。

## 4. verify（四条，现状：均 exit 0）

```text
$ node tests/shot-mask.test.mjs                                   → exit 0  通过 37 项，失败 0 项
$ node scripts/shot.mjs --view=oblique,zone --preset=night --keep-invalid → exit 0，2 张 ✓
    FAIL night oblique [city] 内容均值 0.1896 内容暗区 19.82% 内容截断 0.00%   ← band 口径（F1 未修）
$ node scripts/shot.mjs --view=interior --preset=night --keep-invalid     → exit 0，1 张 ✓ PASS 0.00%/clip 2.91%
$ node scripts/audit.mjs                                          → exit 0  「全部预算与契约检查通过」
```

## 5. 未动项（按卡要求）

- **未改 `docs/CONTRACTS.md` §12.1.1**（判据优先级定稿留到 24 格跑通后一次写入）；
- 阈值 `15%/30%/5%` 与 `axis` 类别未动；**未使用** `--allow-no-sky`；
- 未触碰 `src/**`、`public/**`、`index.html`、`tests/layout.test.mjs`、`tests/verify-*`、`docs/STYLE_GUIDE.md`、`docs/handoffs/`；
- `docs/shots/**` 未新增/未删除（`*.invalid.png` 保留在 `/tmp`）。
