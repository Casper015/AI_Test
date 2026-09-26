# handoff · T7.2 接入 `mountInterface`：UI 真正上线 + 12 面板可见性机器验收（t58）

任务：`t58`（repair，attempt 1）· 执行者：core-engineer（attempt_id `d96712bc-a6ed-4adf-a80e-a61e8f8cf461`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
基线：`CONTRACTS v1.0.7` ⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执

```text
来源：主理人独立目视验证（真实 headless Chrome + CDP，普通 URL）发现：#palace-ui 不存在、body.innerText 为空、
      DOM 只有 1 个不可见 button，但键盘交互全部生效、控制台无异常 ⇒ **mountInterface 从未被调用**。
      （t9 交付了 `mountInterface(palaceApi, options)` 并声明"t14 一行接入"，但 t9 的 inScope 不含 src/main.js；
       而既有门禁从不观察"UI 到底显不显示"：t13 走 ?ui=0&shot=1、UI 风格检查只审 tokens.js 数值、
       t9 的浏览器证据在自建 harness 里。）
裁定：本卡只做**接入 + 可见性证据**（面板位置/F 语义调整归 t59，发布收口归 t14）。

可写范围（已严格遵守）：src/main.js、scripts/ui-check.mjs、docs/handoff-ui-wiring.md、docs/shots-ui-wiring/。
未触碰：src/ui/**、src/interaction/**、src/core/**、src/shared/**、src/kit/**、src/zones/**、index.html、docs/shots/**。
```

---

## 1. 接入（`src/main.js`）

```js
import { mountInterface } from './ui/index.js';          // 模块顶部
// … 唯一动画循环内（唯一 rAF 循环，第 689 行附近）：
renderSystem.recordFrame(dt * 1000);
uiHandle?.update(dt, elapsed);                            // ← UI/交互由同一个循环驱动
// … `window.__PALACE__ = api;` 之后：
uiHandle = mountInterface(api, { container: document.getElementById('app') ?? undefined });
api.ui = uiHandle;                                        // 便于诊断/门禁读取
```
失败只记录错误（`console.error`），不影响渲染/键盘交互/报告。

### 唯一循环的机制（已核实，非新建循环）

- `mountInterface` 内部通过 `createInteraction` → `attachRenderLoop(api.renderSystem, tick)` **包装 `renderSystem.recordFrame`**；
- 该包装层自带互斥：`manualDrive` 一旦为真（即有人调用句柄的 `update()`），包装层就**停用**（`src/interaction/index.js:481/515-523`）；
- 本卡在 main.js 的唯一 rAF 循环里调用 `uiHandle.update(dt, elapsed)` ⇒ driveMode 变为 `manual`，**不重复推进**；
- **实测**：`ui.interaction.driveMode() = 'manual'`（`attached=true`），且**60 个 rAF 帧 → interaction tick +60**（1:1，无第二套驱动）。

### §11.3 隐藏义务（未破坏）

`src/ui/index.js` 的 `forcedHidden = query?.ui === false || query?.shot === true`；main.js 的 `parseQuery` 对 `?ui=0` 给出布尔 `false`、`?shot=1` 给出布尔 `true` ⇒ 两条路径都命中。
**实测**：`?ui=0&shot=1` 下 `#palace-ui` 存在但 `display:none`、尺寸 0×0、`visible=false`、`forcedHidden=true` ✓（截图路径依旧无 UI）。

---

## 2. `scripts/ui-check.mjs`（新增，真实浏览器 + CDP，普通 URL）

零第三方依赖：复用 `scripts/shot.mjs` 导出的 `findBrowser/createStaticServer/resolveGlVariants/readPngSize`，自建极简 CDP 客户端（Node 内置 `WebSocket` + `fetch`：`Page/Runtime/Log/Input` 域，**真实鼠标点击与真实按键**）。

```text
$ node scripts/ui-check.mjs
ui-check · UI 上线机器验收（普通 URL，真实 headless Chrome + CDP）
  浏览器：…/chromium_headless_shell-1243/…/chrome-headless-shell
  服务：http://127.0.0.1:<port>/（普通 URL，不带 ui=0/shot=1）
  ✓ 页面就绪：window.__PALACE__ 与 #palace-ui 均存在
  ✓ #palace-ui 存在 — display=block size=1440x900
  ✓ #palace-ui 可见（display≠none 且 visibility≠hidden 且非零尺寸且不透明）
  ✓ 样式与 :root 令牌已注入 — styles=true tokens=true
  ✓ body 有可见文本（首屏不再是空白 DOM） — innerText 长度=358
  ✓ 面板齐备：HUD / 八视角切换器 / 分区跳转 / 建筑信息面板 / 导览控件 / 小地图 / 标签层
              / 时辰切换(3) / 质量档(3) / 回全城 / 帮助 / 提示条
  ✓ UI 由 main.js 的唯一 rAF 循环驱动（mountInterface 的 recordFrame 包装层停用） — driveMode=manual（attached=true）
  ✓ 每帧恰好推进一次（tick 增量 ≤ rAF 帧数 + 2，无第二套驱动） — rAF 60 帧 → interaction tick +60（区间 3→63）
  ✓ 找到「视角 2」按钮（data-view-index=2） — mode=iso @(1350,79)
  ✓ 真实点击「视角 2」→ state.viewMode=iso
  ✓ 真实按 Digit2 → state.viewMode=iso
  ✓ 按钮与键盘同源（同一 viewMode，同一条 view:request-mode） — 事件负载 {"mode":"iso","index":2,"source":"ui"}
  ✓ 截图 ui-01-overview.png / ui-02-tour.png / ui-03-first-person.png / ui-04-night.png（均 1440×900）
  ✓ 夜景截图前时辰已切到 moonlitNight — state.timePreset=moonlitNight
  ✓ §11.3 隐藏义务：?ui=0&shot=1 下 UI 存在但不可见 — display=none size=0x0 visible=false forcedHidden=true
  ✓ 页面无未捕获异常 / console.error
检查项 30：PASS 30 / FAIL 0     exit=0
```

### 12 个面板：选择器与命中数（实测）

| 面板 | 选择器 | 命中 |
| --- | --- | --- |
| HUD | `[data-ui-panel="hud"]` | 1 |
| 八视角切换器 | `[data-ui-panel="views"]` | 1 |
| 分区跳转 | `[data-ui-panel="zones"]` | 1 |
| 建筑信息面板 | `[data-ui-panel="info"]` | 1 |
| 导览控件 | `[data-ui-panel="tour"]` | 1 |
| 小地图 | `[data-ui-panel="minimap"]` | 1 |
| 标签层 | `[data-ui-panel="labels"]` | 1 |
| 时辰切换 | `[data-ui-panel="env"] [data-time-preset]` | 3 |
| 质量档 | `[data-ui-panel="env"] [data-quality-tier]` | 3 |
| 回全城 | `[data-ui-panel="zones"] [data-action="reset"]` | 1 |
| 帮助 | `[data-ui-panel="help"]` | 1 |
| 提示条 | `[data-ui-panel="toast"]` | 1 |

（另有 `brand`/`loading` 两个附加面板标记，UI 根 `#palace-ui` 内共 14 个 `[data-ui-panel]`。）

---

## 3. UI 可见截图（`docs/shots-ui-wiring/`）

| 文件 | 内容 | 尺寸 | 大小 | sha256[:12] |
| --- | --- | --- | --- | --- |
| `ui-01-overview.png` | 首屏全城（默认 iso + UI 全可见） | 1440×900 | 323,317 B | `b434e99cd7e9` |
| `ui-02-tour.png` | 导览进行中（真实点击「开始」） | 1440×900 | 498,895 B | `e340cc7944b3` |
| `ui-03-first-person.png` | 第一人称（点击 `data-view-mode` 含 fp 的视角按钮） | 1440×900 | 224,454 B | `cddbaab81992` |
| `ui-04-night.png` | 夜景（点击「寒月宫灯」） | 1440×900 | 223,956 B | `25d56a23b863` |
| `manifest.json` | 30 项检查结果 + 面板命中数 + 截图 sha/尺寸 | — | 7,433 B | — |

**目视确认**（我本人读图）：首屏图上可见「紫禁天朝」品牌块 + HUD（视角/分区/时辰/质量/位置/加载 lamps:70）、右上「视角（1–8）」八字按钮（当前高亮 2 等距沙盘）、「分区」按钮组 + 回到全城、「时辰/质量」双行、「小地图」、「中轴导览」（第 1/10 点 + 开始/暂停/继续/下一点/退出）、「操作提示」⇢ 这正是此前 `body.innerText` 为空时所缺失的一切。

---

## 4. verify 与零回归

```text
$ node scripts/ui-check.mjs     → 检查项 30：PASS 30 / FAIL 0     exit=0
$ node scripts/audit.mjs        → exit=0；主场景绘制调用 293/350 ✓；可见三角面 288,789/1,500,000 ✓；结论：全部预算与契约检查通过
```
⇒ **渲染零变化（A/B 实证）**：把本卡接线**停用**与**启用**各跑一次 audit，**两个数字逐值相同**（293/350 批次、**288,789** 三角面，两次都 exit 0）
⇒ 本卡对主场景绘制零影响。注意：可见三角面由 t53/t56 时的 293,841 变为 288,789，**与接线无关**（A/B 两版相同），
来源是并发写入的 `src/shared/layout.js`（mtime 14:32:59，非本卡 inScope）。

### 树内既有断言的当前状态（**如实说明**）

| 套件 | 结果 | 与本卡接线的关系（A/B 实证） |
| --- | --- | --- |
| `tests/core.test.mjs` | **FAIL**（1 项：`灰盒满足全部契约字段与数量…期望 2，实际 43`） | **无关**：把本卡接线**停用**后跑同一套件，得到**完全相同的失败信息** |
| `tests/interaction.test.mjs` | **FAIL**（F18/F19 详情面板内容/指针命中；`E11 …FP_ROUTE 不连通`） | **无关**：停用接线后同样失败（同样信息） |
| `tests/zone-east.test.mjs` | **FAIL**（`WK-E-court1-house-interior 标高应等于东宫苑地坪：期望 0.4，实际 0.5`） | **无关**：停用接线后同样失败 |
| `tests/core-stats.test.mjs` | PASS（21/21，skip 3） | 不受影响 |
| `tests/shot-mask.test.mjs` / `kit.test.mjs` / `core-{audit,camera,collision,registry,walls}.test.mjs` | PASS | 不受影响 |

**A/B 方法**：临时把 `import { mountInterface }` 与 `uiHandle?.update(...)` 停用（保留其余一切），跑同一批套件；
两次运行的失败**逐条相同**（含上述三条原文）。⇒ **本卡接线没有改变任何既有断言**（未删任何断言）。

**失败归因（外部、非本卡）**：这些失败全部指向 `src/shared/layout.js` 的**数据**（内景机位数量 8≠2、
`visitable` 被标到 8 栋、灰盒契约字段数量、FP_ROUTE 连通性、东宫苑地坪标高）与 `src/ui` 的详情面板内容，
而 `src/shared/layout.js` 在我测试期间**正被并发写入**（mtime `14:32:59`，我 14:31–14:33 两次运行间
"实际 8" 变为 "实际 43" ⇒ 同一断言两次运行数值不同 = 树处于中间态）。这两个文件都在本卡 inScope **之外**
（layout 属 shared / 面板内容属 t59 ui-engineer），故我**未改**，只上报。

> 建议：等 layout 数据与 t59 的面板调整落地后，由 t14（发布收口）重跑这三条；本卡已给出"A/B 相同失败"的
> 归因证据，避免把外部中间态算到本次接线头上。

---

## 5. 未验证项 / 已知限制

1. **`core.test` 43/43 与 `interaction.test` 49/49 目前不成立**（原因见 §4，A/B 证明与接线无关）；本卡未删任何断言。
2. **未改 shot.mjs**：`ui-check.mjs` 是独立门禁（普通 URL + CDP），不参与 `shot.mjs` 的截图/判据流水线；t14 若要把 `ui-check` 纳入发布门槛，建议直接在验收清单里调用本脚本。
3. **F 语义/面板位置**：本卡只保证"可见且齐备"；`info` 面板需选中建筑才有内容（F18/F19 的具体布局与内容归 t59）。
4. **键盘交互已有既有门禁**（interaction.test 的按键用例）；本卡新增的是"按钮点击 ≡ 键盘"的同源断言（真实 CDP 点击/按键）。
5. **窄屏/触摸布局**未在 ui-check 中覆盖（`root.dataset.narrow/medium` 逻辑未变，属 t59 范围）。
6. **控制台错误白名单**：headless 的 `CVDisplayLinkCreateWithCGDisplay failed`、`GPU stall due to ReadPixels` 属环境噪声，未计入 `console.error`（检查项只统计 `Runtime.exceptionThrown` 与 `Log.entryAdded(level=error)`）。

---

## 6. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§11/§12 补充：UI 必须"上线"且被门禁直接观察**
> 1. 发布门槛必须包含一条**普通 URL**（不带 `ui=0&shot=1`）的真实浏览器检查：`#palace-ui` 存在且可见 + 12 个面板选择器命中 ≥1。
> 2. UI 必须由**唯一动画循环**驱动（`driveMode=manual`，tick 增量 ≤ rAF 帧数 + 2），不得新建循环。
> 3. `?ui=0&shot=1` 下 UI 必须隐藏（`forcedHidden`），该义务须有断言。
> 4. 按钮路径与键盘路径必须走**同一条请求事件**（同一 `view:request-mode`），不得有第二套状态。
