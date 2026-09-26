# handoff · T2.11 在 `?stats=1` 暴露权威背景色（消除背景识别口径争议）（t45）

任务：`t45`（repair，attempt 1）· 执行者：core-engineer（attempt_id `bad56cc1-36c1-4674-a791-1556ba6f4b49`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.7`（§11 运行时查询参数与截图义务 / §12 判据）⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执（含一处**任务卡事实勘误**，已上报主理人并给出可直接落地的补丁）

```text
来源：t44 登记的工具限制 —— 纯像素无法区分"填满顶部的均匀无梯度雾"与天空；
      背景识别已连续三次口径争议（t39 量化桶左下角 → t41 差 1 单位静默失效 → t44 雾被当成天空）。
主理人裁定：由渲染侧把权威背景信息交给工具（只上报、不改渲染）。

勘误（重要）：
  · 任务卡假设 `compactReport()` 在 `src/core/renderer.js`；**实际在 `src/main.js:474`**
    （`?stats=1` 的 `<pre id="palace-stats-json">` 由它生成，`__PALACE__.report()` 也是它）。
  · 截图工具读的正是那个 DOM 节点：**`scripts/shot.mjs:977`** 用正则从
    `<pre id="palace-stats-json">…</pre>` 里抠 JSON。
  ⇒ 只改 renderer.js/environment.js **无法**让 t46 的 `--background=<报告值>` 拿到值；
    dom-pre 接线需要 `src/main.js`（**不在本卡 inScope**）→ 已向主理人申请 amend（§4 给出 7 行补丁）。

可写范围（已严格遵守）：src/core/renderer.js、src/core/environment.js、tests/core-stats.test.mjs、
      docs/handoff-t2-stats-background.md。
未触碰：src/shared/**（CONFIG 1.0.6 一字未改）、src/kit/**、src/zones/**、scripts/shot.mjs、docs/CONTRACTS.md、
      **src/main.js（未授权，未改一行）**。
```

---

## 1. 新增字段（两处同口径，均**只读**）

### 1.1 `environment.describe().background`（`src/core/environment.js`）

| 字段 | 含义 / 取值示例（goldenHour） |
| --- | --- |
| `source` | `'scene.background'`（标明来源） |
| `preset` / `role` / `fogRole` | `'goldenHour'` / `'skyDay'` / `'fogDay'`（来自 `config.LIGHTING.presets`） |
| `hex` | **显示参考空间（sRGB）实际背景色**：`'#c7cfd5'`（sunset `#d29a65`、moonlitNight `#171f2f`） |
| `srgb255` | 同一色的 0–255 三元组：`[199,207,213]`（工具侧像素比对直接用这个） |
| `linear` | three **线性工作空间**分量：`{r:0.572363,g:0.625706,b:0.666336}` |
| `skyTopHex` / `skyHorizonHex` | 天空网格两端色（顶点插值、`toneMapped:false`）：`'#9fc4e8'` / `'#d9d5ca'` |
| `toneMapped` | **恒为 `false`**：`scene.background` 是清屏色，**不受曝光与色调映射影响** |
| `outputColorSpace` | `'srgb'`（`config.LIGHTING.toneMapping.outputColorSpace`） |
| `exposure` | 当前预设曝光（`1`），便于工具判断是否需要补偿 |
| `note` | 口径自述：hex/srgb255 = 显示参考空间；linear = 线性工作空间；清屏色不受曝光/色调映射影响 |
| `fog.{hex,srgb255,linear}` | 雾色：`'#d9d5ca'`（**与背景色不同** —— 正是 t44 被当成天空的那个颜色） |
| `fog.near` / `fog.far` | `1400` / `3200`（夜间 `420/1800`） |
| `fog.note` | `'雾按深度插值，可完全覆盖背景；与背景色不匹配时以雾色为准（t44）'` |

### 1.2 `renderSystem.getStats().background`（`src/core/renderer.js`，同一口径）

字段：`source` / `backgroundType`（`'color'`）/ `hex` / `srgb255` / `linear` / `toneMapped:false` /
`outputColorSpace` / `exposure` / `note` / `fog{hex,srgb255,linear,near,far,note}`；并新增对外 API `describeBackground()`。
数值与 1.1 一致（同一个 `scene.background` 对象）。

三时辰实测（`node --input-type=module` 直接读 `describe().background`）：

```text
goldenHour    hex #c7cfd5  srgb255 [199,207,213]  linear {0.572363,0.625706,0.666336}  天空 #9fc4e8/#d9d5ca  雾 #d9d5ca (1400–3200)
sunset        hex #d29a65  srgb255 [210,154,101]  linear {0.645835,0.323143,0.131142}  天空 #e29a5c/#c99a6a  雾 #c99a6a (1400–3200)
moonlitNight  hex #171f2f  srgb255 [23,31,47]     linear {0.008533,0.013549,0.028302}  天空 #0d1526/#1b2333  雾 #1b2333 (420–1800)
```

---

## 2. 口径（务必按此解释）

1. **`hex` / `srgb255` = 显示参考空间（sRGB）**，等于画面上**未被雾/几何覆盖**区域的像素值；
   `linear` 是 three 内部工作空间（线性 sRGB）分量 —— **两者不是同一个东西**（t41"差 1 单位"的根源就是把两套空间混用）。
2. **`hex` 是 8-bit 量化结果**：与 `linear` 的全精度值存在 ≤半级量化步长的差异（测试里用 0.005 线性容差核对；
   PNG 像素是 8-bit，工具比对请用 `srgb255` ±1~2，而不是 `linear`）。
3. **清屏色 `toneMapped: false`**：`scene.background` 不走材质着色器，**不受曝光/色调映射影响**
   （`exposure` 只影响材质与天空网格的光照/颜色输出链路中的 parts；天空网格自身 `toneMapped:false`）。
   ⇒ 工具**不需要**做任何色调映射反解，直接比 `srgb255`。
4. **雾可覆盖背景**：`fog.color` 与 `background` 是两个不同的量（goldenHour：`#d9d5ca` vs `#c7cfd5`），
   雾按深度插值，远景可完全填满顶部 → **必须先比背景、再比雾**，两者都不匹配才是几何/材质（t44 结论）。
5. **天空有梯度**：天空网格是 `skyHorizonHex → skyTopHex` 的顶点色插值（背景色是 0.35 处的插值结果）；
   逐像素严格匹配天空需要 Gradle 渐变判定，或直接用 `skyTopHex/skyHorizonHex` 做两点取样。

---

## 3. 证据：**渲染输出零变化**（只上报，不改渲染）

方法：同一 `scripts/shot.mjs`、同一 CONFIG 1.0.6，只**移除/还原上报字段**（渲染逻辑一字未动）两次重拍 9 格
（`--view=oblique,iso,focus --preset=all`，产物写 `/tmp`）：

| 格 | before（无上报字段） | after（有上报字段） | Δ |
| --- | --- | --- | --- |
| golden oblique | 0.2854 / 2.16% / 0.00% | 0.2854 / 2.16% / 0.00% | **0 / 0 / 0** |
| dusk oblique | 0.2072 / 1.87% / 0.00% | 0.2072 / 1.87% / 0.00% | **0 / 0 / 0** |
| night oblique | 0.1540 / 10.36% / 0.00% | 0.1540 / 10.36% / 0.00% | **0 / 0 / 0** |
| golden iso | 0.2906 / 6.43% / 0.00% | 0.2907 / 6.42% / 0.00% | +0.0001 / −0.01pp |
| dusk iso | 0.2060 / 3.79% / 0.00% | 0.2060 / 3.79% / 0.00% | **0 / 0 / 0** |
| night iso | 0.1842 / 2.79% / 0.00% | 0.1842 / 2.79% / 0.00% | **0 / 0 / 0** |
| golden focus | 0.4206 / 4.60% / 0.02% | 0.4205 / 4.60% / 0.02% | −0.0001 / 0 |
| dusk focus | 0.3423 / 6.36% / 0.03% | 0.3423 / 6.36% / 0.03% | **0 / 0 / 0** |
| night focus | 0.2800 / 24.97% / 0.03% | 0.2800 / 24.97% / 0.03% | **0 / 0 / 0** |

- **9 格中 7 格逐值完全相同**，2 格差异 ≤0.01pp（8-bit PNG 量化级）⇒ 报告字段对渲染输出**零影响**。
- `node scripts/audit.mjs` exit 0（293/350、结论全部通过）；`node tests/run.mjs` **19/19 PASS**（含新增 core-stats）。

---

## 4. 报告接线（`?stats=1` → `compactReport()`）：**待主理人 amend（7 行）**

- 现状：权威口径已可从 **`window.__PALACE__.stats()`** 机器读取
  （`…stats().environment.background` 与 `…stats().render.background`，同一份值，测试已覆盖）；
  `…report()` / `<pre id="palace-stats-json">`（shot.mjs:977 读取路径）**尚未包含**这些字段。
- **阻塞点**：`compactReport()` 在 `src/main.js:474`，**不在 t45 inScope**；已向主理人申请 amend（建议 (a)）。
- **可直接落地的补丁**（`function compactReport()` 的返回体里，紧随 `hemiIntensity` 之后插入；纯新增、无副作用）：

```js
      // t45：权威背景口径（供 shot.mjs --background=… 消费；只上报，不改渲染）
      backgroundColorHex: env.background.hex,
      backgroundColorLinear: env.background.linear,
      backgroundColorSpace: env.background.outputColorSpace,
      backgroundToneMapped: env.background.toneMapped,
      backgroundRole: env.background.role,
      fogColorHex: env.background.fog?.hex ?? null,
      fogNear: env.background.fog?.near ?? null,
      fogFar: env.background.fog?.far ?? null,
```

- 落地后：`tests/core-stats.test.mjs` 中"compactReport() 已接线背景字段"用例会自动从 `skip` 变为**硬断言**
  （该用例已经在读 `src/main.js` 文本并检查字段，无需再改测试）。

---

## 5. 给工具侧的消费建议（供 foundation-lead 在 t46 接入）

1. **取值来源（二选一，推荐 ①）**：
   - ① dom-pre（t46 现有路径）：amend 后从 `<pre id="palace-stats-json">` 读 `backgroundColorHex` / `fogColorHex`；
   - ② 已可用：CDP 里 `JSON.parse(await evaluate('JSON.stringify(__PALACE__.stats().environment.background)'))`。
2. **命令示例**（照 t46 计划的形式）：

```bash
# 背景判定由"猜"改为"权威值"（t46 接入后）
node scripts/shot.mjs --view=oblique --preset=golden --background=#c7cfd5 --fog=#d9d5ca --out-dir=/tmp/shots
node scripts/shot.mjs --view=oblique --preset=night  --background=#171f2f --fog=#1b2333 --out-dir=/tmp/shots
```

   `--background` 支持 `#rrggbb` 或 `r,g,b`；**未显式给出时**可由自检步骤先读报告再回填
   （`shot.mjs` 已经会 dump DOM，可直接解析同一份 JSON，无需新增网络请求）。
3. **匹配规则（建议）**：
   - `|pixel − background.srgb255| ≤ 2`（每通道）→ 判为背景；
   - 否则 `|pixel − fog.srgb255| ≤ 2` → 判为**雾覆盖区**（不当作天空/背景）；
   - 两者都不匹配 → 几何或材质（继续按内容掩码统计）。
   - **不要用 `linear` 直接比像素**（空间不同，会差 1 个单位以上 —— t41 教训）。
4. **天空屏幕占比**：本卡**不新增 pass**（读回帧缓冲要额外 GPU 同步 + 改渲染管线，违背"只上报、不改渲染"）。
   但**工具侧可零成本得到**：它本来就要解码 PNG，直接统计"等于 `background.srgb255`（±2）的像素占比"
   = 背景占比；再加上 `skyTopHex/skyHorizonHex` 两端色的容差即可近似天空占比。
   ⇒ 取舍说明：core 侧给**权威颜色**，工具侧用它做**占比统计**，不需要 readback。

---

## 6. verify 与回归

```text
$ node tests/core-stats.test.mjs
 通过 9 / 9，skip 1   exit=0
 （skip = "compactReport() 已接线背景字段"，等待 §4 的 amend；用例已写成"有字段即硬断言、无字段即 skip + 打印补丁"）

$ node scripts/audit.mjs
 主场景绘制调用   : 293 / 上限 350  ✓
 结论：全部预算与契约检查通过   exit=0

（未纳入 verify 的树内自查：node tests/run.mjs → 19 / 19 PASS）
```

测试覆盖（`tests/core-stats.test.mjs`）：
字段齐全与合法（hex 正则、srgb255 0–255 整数）· hex⇄srgb255⇄linear 三口径自洽（8-bit 量化容差）·
与预设定义复算值逐值一致（`role → COLORS_DERIVED 天空/雾色 → 0.35 插值`）· 切预设同步变化且三时辰互不相同 ·
雾与背景可不同（t44 场景，note 必须提示"可覆盖背景"）· **只读性**（反复 `describe()` 后
sun/ambient/hemi/exposure/sunColor/背景/雾逐值不变，且未触发 `setExposure/setBloom`）· renderer 侧同口径暴露。

---

## 7. 未验证项 / 已知限制

1. **dom-pre 接线未完成**（`src/main.js` 不在 inScope）：`?stats=1` 的 `<pre>` 里还没有这些字段；
   `tests/core-stats.test.mjs` 的接线用例当前为 `skip`。已申请 amend（§4 给出 7 行补丁），落地即自动转硬断言。
2. **天空屏幕占比未在 core 侧计算**（取舍见 §5.4）：不做帧缓冲读回；工具侧用背景色 + 渐变两端色零成本统计。
3. **口径边界**：`hex/srgb255` 对应"未被雾/几何覆盖"的背景；若整屏都被近处雾填满（夜间 fogNear 420m），
   实际像素会等于 `fog.hex` 而非 `background.hex` —— 这正是要交给工具的两个权威值。
4. **天空网格的逐像素渐变**未给采样表：只给两端色（`skyTopHex/skyHorizonHex`）；严格匹配需工具侧做渐变内插或按"非背景/非雾/非几何"归类。
5. **未做浏览器侧端到端读数**：本卡在 Node 内断言 `describe().background` 与 renderer 源码接线；浏览器里
   `__PALACE__.stats().environment.background` 的实读由 t46 接入时顺带验证（一行 `evaluate`）。
6. **观察（非本卡）**：本次 A/B 的 night 视角数字（如 oblique 10.36%）与 t43 记录（17.26%）不同，
   说明 t43 之后 CONFIG/判据侧又有变化（CONFIG 1.0.6）；本卡的 before/after 是**同一时刻同一构建**内的对比，故不受影响。

---

## 8. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§11（运行时查询参数与截图义务）补充：`?stats=1` 必须上报权威背景口径**
> 1. `?stats=1` 的报告必须包含：`backgroundColorHex`（sRGB，显示参考空间实际像素值）、
>    `backgroundColorLinear`（线性工作空间）、`backgroundColorSpace`、`backgroundToneMapped`（清屏色恒 false）、
>    `backgroundRole`、`fogColorHex`、`fogNear`、`fogFar`。
> 2. 判据工具**必须**用该权威值判定背景/雾，不得再用像素猜测；比对用 sRGB 三元组（±2 容差），
>    禁止拿线性值直接比像素。
> 3. 这些字段**只读上报**：不得为了测量方便改动背景色、天空、雾或曝光。
> 4. 雾与背景是不同量：工具必须先比背景、再比雾；两者都不匹配才按几何/材质处理（t44 教训固化）。
