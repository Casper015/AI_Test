# handoff · T2.16 `?stats=1` 内提供掩码 data URL（同一加载内取图）（t56）

任务：`t56`（repair，attempt 1）· 执行者：core-engineer（attempt_id `9caf68fe-eedb-4bd6-ae5d-f63a096de93c`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
基线：`CONTRACTS v1.0.7` ⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执

```text
来源：t55 判 failed 的坑②根因（定位准确）：工具用**第二次 runBrowser()（新一次页面加载）**去截 `&mask=sky`，
      拿到全黑（唯一色 1）——与 t53 的"半帧"同源：单次 blit 只保证**同一帧内**原子性，跨页面加载仍可能截到未就绪时刻。
裁定：采纳 t55 的一步到位修法 —— 由页面在**同一次加载内**把掩码转成 data URL 放进 `?stats=1` 报告，
      工具复用已有的 `--dump-dom` 取回 ⇒ 从机制上消除"跨加载取掩码"这一类别问题。
      t55 已留下的增量（okVariant 作用域、覆盖保护、恰 2 色校验）**未重复实现**。

可写范围（已严格遵守）：src/main.js、src/core/renderer.js、tests/core-stats.test.mjs、
      docs/handoff-t2-sky-mask-dataurl.md。
未触碰：src/shared/**、src/kit/**、src/zones/**、scripts/**（shot.mjs 未改）、docs/CONTRACTS.md、docs/shots/**。
```

---

## 1. 交付：报告新增 `skyMaskPngBase64`（同一加载内取图）

### 1.1 实现

| 位置 | 内容 |
| --- | --- |
| `src/core/renderer.js` | ① **模块级纯函数 PNG 编码器** `export function encodePngBase64(width, height, rgba)`（零依赖、零 DOM：8-bit RGB + 逐行 filter 0 + **store-only deflate** + CRC32/Adler32 ⇒ 确定性、Node 内可单测）；② `skyMaskPng({scale=2})`：把**最近一次掩码取图的像素快照**（`readSkyMaskShare` 同一缓冲）按 1/2 分辨率最近邻抽样后编码，**按位姿键缓存**（同一位姿不重复编码）。 |
| `src/main.js` | `compactReport()` 新增 5 字段（报告字段数 65 → **71**）：`skyMaskPngBase64` / `skyMaskPngSize` / `skyMaskPngSourceSize` / `skyMaskPngShareByColor` / `skyMaskPngNote`；**仅在 `ready` 之后编码**（不阻塞 `data-palace-ready` 与 `?shot=1` 的就绪信号），编码异常只影响该字段（try/catch + warn）。 |

### 1.2 时机与体积（实测）

| 项 | 数值 |
| --- | --- |
| 就绪信号 | `data-palace-ready="1"` 两种模式（带/不带 `&mask=sky`）都出现 ✓（字段写入在其后） |
| 报告字段数 | 71（原 65） |
| `<pre>` 字符数（带 data URL） | **327,282** |
| `<pre>` 字符数（不含 base64） | ≈ **2,870** ⇒ data URL 净增 **≈317KB（base64 324,412 字符）** |
| 分辨率取舍 | 掩码 RT 720×450 → data URL **360×225（1/2，最近邻、严格二值）**；全分辨率 720×450 约 **1.3MB**（会把每个 dump 撑到 MB 级）；1/4（180×112）约 80KB 但占比误差升到 1–2pp。默认取 1/2：占比误差 <0.5pp、体积 ~0.3MB。可配置（`skyMaskPng({scale})`），如需更小/更大档位可直接派单。 |

---

## 2. 实证：同一次 `--dump-dom` 内取图（本任务核心）

`CORE_STATS_LIVE=1 node tests/core-stats.test.mjs`（真实浏览器；**只做一次页面加载的 dump**，不做第二次加载截图）：

```text
 · LIVE oblique data URL:  360x225 唯一色 2、白 0.69964、skyShare 0.69914、纯度 100.00%
 · LIVE oblique:           掩码白=69.91%、唯一色=2、报告 skyShare=0.69914
 · LIVE interior data URL: 360x225 唯一色 2、白 0.00299、skyShare 0.00251、纯度 100.00%
 · LIVE interior:          掩码白=0.25%、唯一色=2、报告 skyShare=0.00251
 · LIVE 复用性：两次 dump 的 data URL 白占比 0.69964 / skyShare 0.69914（逐值一致）
 通过 21 / 21   exit=0
```

| 视图 | data URL 白占比 | `skyShare` | Δ | 唯一色 | 纯度 | 图像尺寸 |
| --- | --- | --- | --- | --- | --- | --- |
| `oblique/night` | **0.69964** | 0.69914 | **0.0005** ✓（≤0.02） | **2** | **100%** | 360×225 |
| `oblique/night`（第二次 dump） | **0.69964** | 0.69914 | 0.0005 ✓ | 2 | 100% | 360×225 |
| `interior/night` | **0.00299** | 0.00251 | **0.0005** ✓ | **2** | **100%** | 360×225 |

- 报告内 `skyMaskPngShareByColor.white` 与解码实测白占比**逐值一致**（测试断言）；
- **连续两次运行逐值一致**（0.69964 / 0.69914）⇒ 跨加载/半帧导致的"全黑/拼接帧"问题在报告路径上已消除；
- 报告里同时带 `skyMaskSampleSize`（来源 720×450）与 `skyMaskPngSize`（data URL 360×225）⇒ 工具可自行判断采样率。

---

## 3. 仅上报、正常渲染零变化

| 证据 | 数值 |
| --- | --- |
| 常规（无 mask/stats）`night oblique` 的**口径无关**统计：整帧均值 | **0.1066**（与 t48/t50/t53 记录逐值相同） |
| `node scripts/audit.mjs` | **293/350 批次、293,841 三角面**（与 t53 逐值相同），结论全部通过 |
| 唯一渲染内核不变量 | `tests/core.test.mjs` **43/43**、`tests/interaction.test.mjs` **49/49**（renderer.js 仍零 `new Scene`、零相机实例、零 `scene.add`） |
| 掩码路径成本 | 每 500ms 一次半分辨率掩码 RT + 读回（诊断）；PNG 编码**仅在 `?stats=1` 且位姿变化时**发生（缓存），不影响渲染帧 |

---

## 4. 给工具侧的消费规则（供下一张卡接入）

1. **一次 dump 拿全部**：`?stats=1`（可与 `&mask=sky` 同用，也可不用）→ 从 `<pre id="palace-stats-json">` 读：
   `skyMaskPngBase64`（base64 → 直接 `writeFileSync(Buffer.from(b64,'base64'))` 即得合法 PNG）、
   `skyMaskPngSize`（当前 `360x225`）、`skyMaskPngSourceSize`（`720x450`）、`skyMaskPngShareByColor`、`skyShare`、`skyMaskColors`、`skyMaskProbe`。
   **不需要**第二次页面加载，也不需要 `&mask=sky` 截图。
2. **极性（禁止假定 white=sky）**：用 `skyMaskPngShareByColor` 与 `skyShare` 互校 ——
   **哪种颜色的占比等于 `skyShare`（±0.02），哪种就是天空色**；`skyMaskProbe` 只作视角相关的 sanity check。
3. **必须显式失败**：解码后的掩码图应**恰为 2 色**（`#ffffff`/`#000000`）且纯度 ≥99%；
   单色（1 色）= 未渲染/空白，>2 色 = 旧路径/半帧 ⇒ **一律报错，不得退回颜色猜测**（t55 已实现的覆盖保护继续有效）。
4. **位置/尺寸口径**：data URL 是 1/2 分辨率（360×225）最近邻抽样；需要像素级精确掩码时请提需求把档位调到 1（720×450，体积约 1.3MB）。
5. **不要把它当"截图"**：data URL 来自**离屏掩码 RT**（与 `skyShare` 同一次取图），与浏览器截图路径完全独立 ⇒ 不再有跨加载时序问题。

---

## 5. 回归用例（`tests/core-stats.test.mjs`，断言数 20 → 21，只增不减）

1. **PNG 编码器单测（Node 内）**：合成二值 RGBA → `encodePngBase64` → 校验签名/IHDR（宽高、bitDepth 8、colorType 2、非交错）→ 写盘再解码 → **逐像素一致**、**恰 2 色**、纯度 100%、白占比 = 3/8（精确值）。
2. **静态接线**：`skyMaskPngBase64: maskPngInfo?.base64`、`if (ready)` 后再调 `renderSystem.skyMaskPng?.()`、`skyMaskPngSize`/`skyMaskPngShareByColor` 存在、`encodePngBase64` 为模块级导出、`skyMaskPng` 有 `pngKey` 缓存。
3. **LIVE**（原掩码用例内扩展）：解码报告内 data URL → 合法 PNG、尺寸 360×225、**恰 2 色**、纯度 ≥99%、`skyMaskPngShareByColor.white` == 解码白占比、占比与 `skyShare` ±0.02；**连续两次 dump 逐值一致**。

---

## 6. 未验证项 / 已知限制

1. **仅验证 night**（三时辰共用同一掩码机制；preset 只改天空顶点色）；需要三时辰证据时换 `--preset` 重跑。
2. **体积**：每个 `?stats=1` dump 的 `<pre>` 由 ~2.9KB 增到 ~327KB（data URL ≈317KB）。若下游 dump 管道对体积敏感，可派单把 `scale` 调到 3–4（≈40–80KB，占比误差 1–2pp）。
3. **编码器未做压缩**（store-only deflate）：PNG 体积 ≈ 原始像素 + 极小开销（360×225 二值图 317KB base64 ≈ 242KB 二进制 ≈ 像素数×3）。若需更小，可改用 RLE/真 deflate（会引入更多自研代码），当前按"确定性 + 零依赖 + 可单测"取舍。
4. **`skyMaskPngBase64` 只在 `?stats=1` 出现**（报告本身只在 stats 模式产出）✓；`?mask=sky` 截图路径未改。
5. **未做端到端 shot.mjs 接入**（`scripts/` 不在 inScope）：本卡只保证报告里有可靠数据；接入与"恰 2 色"校验归 t49/t55 线。
6. **`skyMaskProbe` 语义**沿用 t53：无天空视角（内景）顶中部为 otherColor 属正常，不得据此反推极性。

---

## 7. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§11 补充：`?stats=1` 必须提供同加载掩码 data URL**
> 1. 报告必须含 `skyMaskPngBase64`（同一次页面加载内由掩码 RT 编码的 PNG）、`skyMaskPngSize`、`skyMaskPngSourceSize`、
>    `skyMaskPngShareByColor`，与既有 `skyShare`/`skyMaskColors`/`skyMaskProbe` 并列。
> 2. **禁止**用"第二次页面加载截图"获取掩码（跨加载时序不可靠：全黑/半帧）；判据工具必须复用已有的 DOM dump。
> 3. 掩码 data URL 必须**恰 2 色**（`#ffffff`/`#000000`）且纯度 ≥99%；单色或多色一律视为无效输入并报错。
> 4. 天空色由 `skyMaskPngShareByColor`（占比等于 `skyShare` 的那个颜色）判定，**禁止假定 white=sky**。
> 5. 字段须在就绪信号之后写入，且不得改变常规渲染（口径无关统计逐值一致）。
