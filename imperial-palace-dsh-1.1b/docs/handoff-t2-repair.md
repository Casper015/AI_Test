# handoff · T2.2 修复 `?dpr` NaN 健壮性缺陷并重拍夜景/夕照证据矩阵

任务：`t21`（repair）· 执行者：core-engineer（attempt 1，attempt_id `4a4c06e2-17c5-4a27-9794-5ce8dd5d1683`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.2` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ three r169

---

## 0. 开工回执

```text
来源：
  ① t17（CONTRACTS §11.5）：`?dpr=abc → NaN`；主理人读码确认 src/core/renderer.js effectiveDpr()
     `Math.min(maxPixelRatio, Math.max(0.5, NaN)) === NaN` → renderer.setPixelRatio(NaN)。
  ② 主理人裁定：tests/core.test.mjs 的静态守卫用裸 includes 扫全仓，把 src/interaction/{index,tour}.js
     注释里的 rAF 字样误判为真实调用，并因此把达标的 t8（F 区）判成 failed。
     （时间线注记：t9 的注释措辞在 t23 期间已被我请求改写，因此当前工作区不再自然复现该误报；
      本任务按要求**修测试**而非绕开，并固化历史语料 + 突变测试保证守卫不被关掉。）

可写范围（inScope，已严格遵守）：src/core/renderer.js、tests/core.test.mjs、
  docs/shots/t2-*（重拍图）、docs/shots/manifest.json、docs/shots/README.md、docs/handoff-t2-repair.md。
未触碰：src/shared/**、src/kit/**、src/zones/**、src/ui/**、src/interaction/**、docs/CONTRACTS.md、
  docs/shots/t1.3-*（t19 的证据图）、scripts/shot.mjs（它的行为已满足要求：默认保留失败图、自动合并 manifest）。

依赖：t19 已完成（CONFIG 1.0.2 落盘），本轮所有重拍均在 1.0.2 之上进行。
```

---

## 1. 修改点

| 文件 | 改动 |
| --- | --- |
| `tests/core.test.mjs` | 新增 `stripCommentsAndStrings(text)`（逐字符状态机：跳过行/块注释与单/双引号/模板字面量，保留换行与行结构）；三处静态源码扫描（renderer/composer、Scene+scene.add+rAF、OrbitControls/相机）全部改为**先剥注释再按真实调用语法匹配**（如 `/requestAnimationFrame\s*\(/`）；新增「静态扫描守卫自检」用例（行注释/块注释/字符串/模板样本 + 历史误报语料 + 真实调用混排 + 行结构保留 + 真实仓现状）。|
| `src/core/renderer.js` | 抽出纯函数 `resolvePixelRatio(wanted, { config, tier })`：仅当 `Number.isFinite(n) && n > 0` 时采用覆盖值，否则回落该质量档 `dpr`，返回 `{ ratio, fallback, reason }`；`effectiveDpr()` 改为调用它并对非法覆盖值 `console.warn` **一次**；新增 `dprInfo()` 诊断接口（返回 `{ ratio, fallback, reason, override, tier }`）。合法值行为不变（仍夹在 `[0.5, RENDERER.maxPixelRatio]`）。|
| `docs/shots/t2-*.png` | 重拍 night×8 与 dusk×{oblique,iso,zone}（真实渲染，1440×900 DPR1 medium，CONFIG 1.0.2）。|
| `docs/shots/manifest.json` | 由 `scripts/shot.mjs` 自动合并写回（按文件名合并 + 追加 history），逐张更新亮度统计与浏览器实测报告。|
| `docs/shots/README.md` | 新增「本轮重拍」与「夜景复核：整帧 vs 内容掩码（判据归属 t26）」两节：重拍时间/CONFIG 版本/质量档/命令/校验结果、provenance 修正、整帧与两套临时掩码口径数值表、以及"判据由 t26 裁定、t2 不下 pass/fail 结论"的显式声明。|

新增回归断言（断言数 40 → 43，未减少）：
1. `renderer.resolvePixelRatio：非法 dpr 回落质量档（有限正比率），合法 dpr 行为不变`
   —— 13 个非法样本 × 3 个质量档（39 组）+ 6 组合法样本 + 3 档 null 行为。
2. `?dpr=abc 的端到端路径：parseQuery → Number() → resolvePixelRatio 不再产生 NaN`
   —— 6 个非法查询串（abc / -3 / Infinity / 0 / 空 / 1e999）+ 2 组合法值。
3. `静态扫描守卫自检：注释里的 rAF 字样不误报、真实调用必被抓（含突变样本）`。

---

## 2. 真实输出

### 2.1 `node tests/core.test.mjs`（exit 0，43/43）

```text
  ✓ 全仓只有 src/main.js 创建 Scene、挂载 scene、运行 requestAnimationFrame
  · 历史误报语料 2 条：裸 include 会命中、剥注释后 0 命中（旧扫描把 t8 判 failed 的根因）
  · 扫描口径：朴素 include 命中 interaction 0 个文件；剥注释 + 真实调用语法命中 0 个（main.js 真实调用 2 处）
  ✓ 静态扫描守卫自检：注释里的 rAF 字样不误报、真实调用必被抓（含突变样本）
  · 非法 dpr 样本 13 个 × 3 档全部回落；合法样本 6 个行为不变
  ✓ renderer.resolvePixelRatio：非法 dpr 回落质量档（有限正比率），合法 dpr 行为不变
  ✓ ?dpr=abc 的端到端路径：parseQuery → Number() → resolvePixelRatio 不再产生 NaN
  ...
---------------------------------------------------------
 通过 43 / 43
---------------------------------------------------------
```

### 2.2 突变测试（守卫未被关掉）

```text
(a) 现状（interaction 注释保留/已改写，代码无真实调用）：
    ✓ 全仓只有 src/main.js 创建 Scene、挂载 scene、运行 requestAnimationFrame  → 43 / 43 PASS

(b) 在非 main.js 文件里临时写入**真实**调用（src/core/renderer.js 内 `if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => {});`）：
    ✗ 全仓只有 src/main.js 创建 Scene、挂载 scene、运行 requestAnimationFrame
        动画循环只能有一处（src/main.js），实际：src/core/renderer.js,src/main.js：期望 "src/main.js"，实际 "src/core/renderer.js,src/main.js"
    ✗ 静态扫描守卫自检：注释里的 rAF 字样不误报、真实调用必被抓（含突变样本）
        真实调用只允许出现在 main.js，实际：src/core/renderer.js,src/main.js
    通过 41 / 43，失败 2（exit 1）

(c) 还原后：src/core/renderer.js sha256 = d7b838385cbaaf90db53fae7792977314983ce68714b256403faa51d8ebd857a
    `mutationProbe present: False`（精确还原，无残留） → 复跑 43 / 43 PASS
```

### 2.3 `?dpr=abc` 端到端（修复前后）

```text
修复前：main.js 传 Number('abc') = NaN → effectiveDpr() = Math.min(2, Math.max(0.5, NaN)) = NaN
        → renderer.setPixelRatio(NaN)（画布像素比率非法）
修复后：resolvePixelRatio(NaN, {tier:'medium'}) = { ratio: 1, fallback: true, reason: 'dpr="abc"（NaN）' }
        并 warn 一次：“[renderer] 忽略非法 dpr="abc"（NaN）（需要有限正数）→ 回落质量档 medium 的 dpr=1；画布像素比率保持有限正值。”
        Infinity / -3 / 0 / '' / undefined / {} 同样回落；1 / '1' / 1.5 / 3 / 0.1 / 0.85 行为与修复前一致。
```

### 2.4 `node scripts/shot.mjs --view=all --preset=night --keep-invalid`（exit 0，8/8 有效）

```text
shot: ✓ t2-oblique-night.png  1440×900 · 180.5KB · 12080ms · 请求 42 条 · GL [disable-gpu]
        亮度 均值 0.1021 · p05 0.0844 · p50 0.0884 · p95 0.1856 · 暗区(luma<0.08) 4.25% · 高光截断 0.00% · 内容占比 29.0%
        可读性判据 PASS（旧口径，仅诊断）
        浏览器实测：整帧调用 511 · 可见三角面 562470 · 主场景可绘制对象 286 · 几何 254 / 纹理 20 · 实时宫灯 0/4（锚点 70） · 太阳 2 / 环境 0.8 / 半球 0.65 / 曝光 1.35 · 建筑 67
shot: ✓ t2-iso-night.png      均值 0.1162 · 暗区 1.40%  · 判据 PASS
shot: ✓ t2-axis-night.png     均值 0.1541 · 暗区 29.32% · 判据 FAIL(暗区) · 实时宫灯 0/4
shot: ✓ t2-zone-night.png     均值 0.1021 · 暗区 4.25%  · 判据 PASS
shot: ✓ t2-focus-night.png    均值 0.1745 · 暗区 25.47% · 判据 FAIL(暗区) · 实时宫灯 4/4
shot: ✓ t2-interior-night.png 均值 0.0373 · 暗区 89.01% · 判据 FAIL(内景均值<0.04) · 实时宫灯 4/4
shot: ✓ t2-fp-night.png       均值 0.1309 · 暗区 26.02% · 判据 FAIL(暗区) · 实时宫灯 4/4
shot: ✓ t2-orbit-night.png    均值 0.1607 · 暗区 8.75%  · 判据 PASS
night exit=0
```

（`node scripts/shot.mjs --view=oblique,iso,zone --preset=dusk --keep-invalid` → exit 0，3/3 有效：
 oblique 0.5322/15.46%、iso 0.4908/20.67%、zone 0.5322/15.46%。）

### 2.5 manifest 与失败图纪律

```text
docs/shots/manifest.json：rows 24，history 10 条；本轮追加
  {"at":"2026-09-26T14:48:18.157Z","shots":["t2-oblique-night.png:ok", … "t2-orbit-night.png:ok"]}
  {"at":"2026-09-26T14:50:09.078Z","shots":["t2-oblique-dusk.png:ok","t2-iso-dusk.png:ok","t2-zone-dusk.png:ok"]}
本轮 11/11 张通过出图校验，因此**没有**产生 *.invalid.png（若有失败会自动保留为 *.invalid.png 并进 manifest）；
历史失败证据仍保留：t2-night-probe*.png（1.0.1 时期的诊断覆盖对照图）。
```

### 2.6 夜景复核（整帧 vs 内容掩码）——**判据归 t26**

| 视角 | 整帧均值 | 整帧暗区 | 掩码A 非主色：占比/均值/暗区 | 掩码B 局部细节：占比/均值/暗区 |
| --- | --- | --- | --- | --- |
| oblique | 0.102 | 4.3% | 19.5% / 0.154 / 14.9% | 5.5% / 0.176 / 26.8% |
| iso | 0.116 | 1.4% | 19.9% / 0.210 / 5.5% | 7.7% / 0.215 / 15.2% |
| axis | 0.154 | 29.3% | 65.9% / 0.163 / 44.5% | 6.3% / 0.218 / 29.5% |
| zone | 0.102 | 4.3% | 19.5% / 0.154 / 14.9% | 5.5% / 0.176 / 26.8% |
| focus | 0.175 | 25.5% | 59.4% / 0.233 / 38.7% | 14.3% / 0.245 / 25.9% |
| interior | 0.037 | 89.0% | 19.8% / 0.146 / 44.4% | 0.8% / 0.183 / 36.2% |
| fp | 0.131 | 26.0% | 56.4% / 0.173 / 3.9% | 2.2% / 0.243 / 24.4% |
| orbit | 0.161 | 8.8% | 64.2% / 0.177 / 13.6% | 15.5% / 0.225 / 24.7% |

- 掩码A（临时）= 与"最大面积量化主色"（雾/天空/暗剪影）差异 > 24/255 的像素；
  掩码B（临时）= 与 3×3 局部均值偏差 > 0.02 的像素（有结构的内容像素）。
- 与 CONFIG 1.0.1 的整帧均值对比：oblique 0.073→0.102、iso 0.073→0.116、axis 0.052→0.154、
  zone 0.073→0.102、focus 0.089→0.175、interior 0.019→0.037、fp 0.070→0.131、orbit 0.067→0.161 —— 方案A 生效明显。
- **不下 pass/fail 结论**：整帧口径下 axis/focus/fp 的"暗区偏大"主要来自天空/雾/前景地形占比，
  内景整帧均值 0.0373 与旧阈值 0.04 仅差 0.0027；两套临时掩码方向一致但绝对值差异大
  （掩码A 偏悲观、掩码B 偏乐观）。最终判据与阈值由 t26 定义，我按其口径复核即可。
- 若 t26 最终仍采用整帧口径，最小修法（需 foundation-lead 升版，t2 不自改 shared）：
  给内景补 1–2 处不投影的室内宫灯锚点（`layout.LIGHT_ANCHORS`），或 `LIGHTING.lamps.intensity` 12 → 14。

### 2.7 `node scripts/audit.mjs`（exit 0）

```text
结论：全部预算与契约检查通过
主场景绘制调用 254 / 上限 350 ✓（B 58/70、C 49/50、E 40/40、F 61/80；D 未交付）
可见三角面 242,929 / 上限 1,500,000 ✓；纹理 22 张 / 材质 86
```

---

## 3. 未验证项 / 已知限制

1. **浏览器实测帧率**：SwiftShader 软光栅（headless shell），帧率不具代表性；真实 GPU 采样属 t13/V2。
2. **内容掩码口径未定**：本文两套掩码都是**临时**诊断口径，最终定义/阈值/判定属 t26；t2 未据此下结论。
3. **D 区未交付**：本轮截图内容为灰盒 G0 + B/C/E/F；D 交付后需重拍受影响的 view（oblique/iso/zone/axis/orbit）。
4. **`?dpr` 只在 Node 侧断言**：`resolvePixelRatio` 是纯函数，端到端（parseQuery→Number→解析）已在 Node 覆盖；
   **浏览器内**未验证 `?dpr=abc` 的实际画布尺寸（headless 截图固定 1440×900，未单独跑 dpr 变体）。
   建议 V2 用 `window.__PALACE__.renderSystem.getStats().quality.dpr` 在浏览器里复核（该字段已暴露）。
5. **t9 注释改写的历史**：误报修复前，src/interaction 的注释措辞已被改写（t23 期间），故工作区不再自然复现；
   本任务把**历史语料**固化进测试并在突变测试中证明守卫仍有效（见 §2.2），不依赖注释现状。
6. **`docs/shots/t2-night-probe*.png`**：1.0.1 时期的 `--env=` 诊断覆盖对照图，保留作 before/after 证据，
   README 已注明其不代表当前配置；如需清理应由 V2 统一裁剪。
7. **项目级 `node tests/run.mjs`**：按任务裁定**不作为本任务验收项**（并发期会被队友 in-flight 测试染红，
   全绿由 t12/t13/t14 门禁承担）；本任务只要求 `node tests/core.test.mjs` 与 `node scripts/audit.mjs` 全绿（均已达）。
