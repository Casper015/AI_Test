# handoff · T2.12 权威背景字段接入 compactReport + 接线用例转硬断言（t47）

任务：`t47`（repair，attempt 1）· 执行者：core-engineer（attempt_id `bdebe300-8d57-46e4-8ba3-6a9608a86a83`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.7`（§11 运行时查询参数与截图义务 / §12 判据）⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执

```text
来源：t45 已把权威背景/雾口径交付在 core（environment.describe().background + renderSystem.getStats().background），
      但 t45 的 inScope 不含 src/main.js ⇒ compactReport() 里没有这些字段，?stats=1 的 DOM 报告（shot.mjs 的读取路径）
      拿不到；t45 已终态、契约不可改，故由本卡补齐"接线"这一步。
（主理人已就其协调时序失误作了如实记录；本卡只做接线 + 把 t45 测试里那条 skip 用例转硬。）

可写范围（已严格遵守）：src/main.js、tests/core-stats.test.mjs、docs/handoff-t2-stats-wiring.md。
未触碰：src/core/**（t45 已交付，本卡一字未改）、src/shared/**、src/kit/**、src/zones/**、scripts/**（shot.mjs 未改）、
      docs/CONTRACTS.md。
```

---

## 1. 修改点

### 1.1 `src/main.js`：`compactReport()` 新增 8 个只读字段（纯新增，无渲染/逻辑副作用）

```js
      hemiIntensity: env.hemiIntensity,
      // t45/t47：权威背景/雾口径（由 environment.describe().background 只读上报；纯新增字段）
      // 口径：backgroundColorHex/Space 为 sRGB 显示参考空间实际像素值；Linear 为 three 线性工作空间（不可直接与像素比）；
      //       清屏色 toneMapped=false ⇒ 不受曝光/色调映射影响；雾色可与背景色不同，且可完全覆盖背景（t44）。
      backgroundColorHex: env.background.hex,
      backgroundColorLinear: env.background.linear,
      backgroundColorSpace: env.background.outputColorSpace,
      backgroundToneMapped: env.background.toneMapped,
      backgroundRole: env.background.role,
      fogColorHex: env.background.fog?.hex ?? null,
      fogNear: env.background.fog?.near ?? null,
      fogFar: env.background.fog?.far ?? null,
```

- 字段全部**只读**取自 `environment.describe().background`（t45 交付）；`compactReport()` 的其它字段与调用方零改动。
- `src/main.js` 报告字段数 33 → **41**（浏览器实读计数，见 §2.1）。
- **下游已就绪**：t46 已把 shot.mjs 的掩码策略切到权威口径，其读取点正是本卡写入的字段
  （`scripts/shot.mjs:1056` `report.backgroundColorHex` → `authoritativeByPreset`；注释见 `scripts/shot.mjs:93`）——
  即本卡是 t46 的直接上游，接上后权威背景真正进入判据。

### 1.2 `tests/core-stats.test.mjs`：接线用例 skip → **硬断言** + 新增 LIVE 浏览器实读

| 用例 | 变化 |
| --- | --- |
| `compactReport() 已接线 8 个背景/雾字段（?stats=1 的 DOM 报告）` | 由"无字段则 skip 并打印补丁"改为**硬断言**：逐字段正则校验存在 + 取值路径必须是 `env.background.*`（8 个字段 → 8 条映射），并反向校验 `environment.describe().background` 真的提供这些取值路径（`hex/linear/outputColorSpace/toneMapped/role` 与 `fog.{hex,near,far}`）。 |
| `接线后报告值 = 同口径实测值（LIVE：从 <pre id="palace-stats-json"> 实读，含切预设同步）` | 新增（`CORE_STATS_LIVE=1` 时执行）：spawn `scripts/shot.mjs --view=oblique --preset={golden|night}`（产物写临时目录），从 shot.mjs 写出的 `manifest.browserReports`（即它从 `<pre id="palace-stats-json">` 解析出的 JSON）读字段，断言：8 字段齐全、`hex/fog/toneMapped/space/near/far` 与 `environment.describe().background` 同口径逐值一致、**切预设后 `backgroundColorHex` 与 `fogColorHex` 同步变化**。未设置 env 时显式 skip 并打印强验证命令。 |

断言数：9 通过（+1 skip）→ **10 通过（+1 skip）**，只增不减。

---

## 2. 真实输出

### 2.1 浏览器侧实读证据（字段真的到达工具读取的 DOM 节点）

`?view=oblique&preset=…&ui=0&shot=1&stats=1` → shot.mjs 用 `--dump-dom` 打开页面并**从 `<pre id="palace-stats-json">` 解析 JSON**
（`scripts/shot.mjs:977` 正则、`:1056` 读取 `backgroundColorHex`），写入 `browserReports`：

```text
golden（报告 preset=goldenHour）：
  backgroundColorHex      "#c7cfd5"
  backgroundColorLinear   {"r":0.572363,"g":0.625706,"b":0.666336}
  backgroundColorSpace    "srgb"
  backgroundToneMapped    false
  backgroundRole          "skyDay"
  fogColorHex             "#d9d5ca"
  fogNear / fogFar        1400 / 3200
  （该行报告共 41 个字段）

night（报告 preset=moonlitNight）：
  backgroundColorHex      "#171f2f"
  backgroundColorLinear   {"r":0.008533,"g":0.013549,"b":0.028302}
  backgroundColorSpace    "srgb"
  backgroundToneMapped    false
  backgroundRole          "skyNight"
  fogColorHex             "#1b2333"
  fogNear / fogFar        420 / 1800
  （该行报告共 41 个字段）
```

- 命令：`node scripts/shot.mjs --view=oblique --preset={golden|night} --out-dir=/tmp/t47-dom-{golden|night} --keep-invalid`（两图均 PASS、exit 0）。
- 结论：字段**确实出现在工具读取的那个 DOM 节点**里，且**切预设同步变化**（背景 `#c7cfd5→#171f2f`、雾 `#d9d5ca→#1b2333`）。

### 2.2 测试输出

```text
$ node tests/core-stats.test.mjs
 通过 10 / 10，skip 1   exit=0
 （skip = LIVE 浏览器实读用例；设置 CORE_STATS_LIVE=1 时执行）

$ CORE_STATS_LIVE=1 node tests/core-stats.test.mjs
 · LIVE golden: #c7cfd5 / 雾 #d9d5ca (1400–3200)
 · LIVE night : #171f2f / 雾 #1b2333 (420–1800)
 通过 10 / 10   exit=0        （无 skip）

$ node scripts/audit.mjs
 主场景绘制调用   : 293 / 上限 350  ✓
 可见三角面       : 293841 / 上限 1500000  ✓
 结论：全部预算与契约检查通过   exit=0
```

未纳入 verify 的树内自查：`node tests/run.mjs` → **19 / 19 PASS**。

### 2.3 渲染零变化证据

方法：**同一时刻同一 shot.mjs（mtime 11:20:47，三次运行期间未变）**、只切换 main.js 是否含这 8 个字段：

| 运行 | 构建 | 整帧均值 | 内容均值 | 内容暗区 | 内容截断 |
| --- | --- | --- | --- | --- | --- |
| A1（11:24:28） | 有字段 | 0.6641 | 0.2854 | 2.16% | 0.00% |
| B（11:25:32） | **无字段**（等价 t47 之前） | 0.6641 | 0.2854 | 2.16% | 0.00% |
| A2（11:26:44） | 有字段 | 0.6641 | 0.2854 | 2.16% | 0.00% |

- **像素统计逐值一致**（4 位小数完全相同）；`node scripts/audit.mjs` 数字与改动前一致（293/350、293,841 三角面）。
- 逐像素比对（自写 PNG 解码）：
  - 有字段(A2) vs 无字段(B)：**1416 个像素不同 = 0.109%**，**集中在 2–3 条边缘行**（y=475 占 1221 个、y=301 占 155 个），最大通道差 245；
  - 同构建重跑（A1 vs A2，噪声基线）：**176 个像素不同 = 0.0136%**，同样是边缘行、最大通道差 246。
  - ⇒ 差异是**捕获期的亚像素/时序抖动**（整幅图的边缘线位移 1 像素；报告字段不参与渲染）。**判定：渲染输出零变化**
    （依据：像素统计逐值一致 + audit 逐值一致 + 代码 diff 只是 report 对象的只读字段）。
- 规格：1440×900 / DPR1 / medium / ui off / `?shot=1`（同步渲染 3 帧）；三图 mtime 11:24–11:26，均在 shot.mjs 最后修改（11:20:47）之后 ⇒ 不受工具并发编辑影响。

---

## 3. 未验证项 / 已知限制

1. **逐字节 PNG 一致性未达成**：A/B 存在 0.109% 的边缘像素 1 像素级抖动（同构建重跑也有 0.0136% 同类抖动）⇒ 属捕获期亚像素/时序抖动，不是内容变化；若门禁要求逐字节一致，需要渲染侧固定虚拟时间/同步帧断言（属 shot.mjs/渲染器，非本卡）。
2. **LIVE 用例默认 skip**：每次要起两个浏览器（≈1.5 分钟），故默认只在 `CORE_STATS_LIVE=1` 时执行；快模式已硬断言"字段存在 + 取值路径同口径"，足以在"字段被删/改名/换来源"时立刻变红。
3. **`--stats` 与 DOM-dump 两条路径的差异**：截图路径默认不带 `?stats=1`（只在 `--stats` 时带），而 DOM 报告抓取路径固定 `&stats=1`（`scripts/shot.mjs:963`）——因此 `?stats=1` 报告字段不影响任何截图渲染路径；本卡未改 shot.mjs。
4. **未在浏览器里断言 `__PALACE__.report()`**（同一份 `compactReport()`，DOM `<pre>` 已是其 JSON 化结果）：二者同源，DOM 实读已覆盖。
5. **雾区块字段（fogColorHex/near/far）** 目前只有 golden 与 night 的实读记录（dusk 与它们同源同代码路径）；如需三时辰全量实读，可再跑一次 `--preset=dusk`。
6. **观察（非本卡）**：本次 LIVE 期间曾遇到 shot.mjs 的瞬时 `ReferenceError: AUTHORITATIVE is not defined`（11:2x，t46 正在并发编辑该文件），随后复跑即通过；当前脚本已使用 `authoritativeByPreset`（`scripts/shot.mjs:927`）。该文件不在本卡 inScope，仅记录现象。

---

## 4. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§11（运行时查询参数与截图义务）补充：`?stats=1` 报告必须携带权威背景口径**
> 1. 报告字段（固定命名）：`backgroundColorHex`（sRGB 显示参考空间实际像素值）、`backgroundColorLinear`（线性工作空间）、
>    `backgroundColorSpace`、`backgroundToneMapped`（清屏色恒 `false`）、`backgroundRole`、`fogColorHex`、`fogNear`、`fogFar`。
> 2. 判据工具**必须**以该口径判定背景/雾（`±2` 量化容差），不得再以像素猜测；**禁止**用线性值直接比像素。
> 3. 这些字段**只读上报**（不得为测量方便改动背景/天空/雾/曝光）；`?stats=1` 报告是它们唯一的对外契约面，
>    任何改动都需同步 `tests/core-stats.test.mjs` 的接线硬断言（含 LIVE 实读）。
