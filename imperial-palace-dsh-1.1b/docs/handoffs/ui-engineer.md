# t9 · G 区交互与 UI（`src/interaction/**`、`src/ui/**`）交付回执

> 任务：t9（G 交互与 UI） · 执行者：`ui-engineer` · attempt：`fb420eab-a186-4ac2-8425-e27be3fa92e9`（attempt 1）
> 版本组合：`CONTRACTS v1.0.2` ⇄ `CONFIG 1.0.2` ⇄ `LAYOUT 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`
> 依据：计划 §6.2 / §6.4 / §3.1 / §8.3、`docs/CONTRACTS.md` §5/§6/§7/§11.3、`src/core/{state,camera,registry,loader,events}.js`、`src/shared/{config,layout}.js`

---

## 0. 开工回执（**补记，诚实标注**）

本回执的"开工回执"部分是**在交付阶段补写的**，不是开工前写入：本次 attempt 开工时先通读
计划 §6.2/§6.4/§3.1、`CONTRACTS` 全文、`core/{state,camera,registry,context,loader}.js` 与
`layout/config` 的冻结数据，随后直接进入实现，未在中途落盘开工回执（纪律要求"开工前写"，
此处如实记录偏差，供 V2 复核；内容与顺序不影响任何验收项）。

开工口径（当时确认的事实）：

```text
任务 ID / Agent：t9 / ui-engineer
已读版本：plan(§3.1/§6.1/§6.2/§6.4/§8.2/§8.3)、CONTRACTS v1.0.2、CONFIG 1.0.1→1.0.2、LAYOUT 1.0.0、STYLE_BASELINE v1.0.0
可写文件：src/interaction/**、src/ui/**、tests/interaction.test.mjs、docs/handoffs/ui-engineer.md
只读依赖：src/core/**（唯一 state / 唯一相机装置 / 注册表 / loader）、src/shared/**、index.html、src/main.js
要消费的接口：events.request（§7.2 十七事件）、store.state（§7.1 八字段）、store.view（内部视图记录）、
              registry（建筑/障碍/视角/fp-spawn）、rig（setCollisionSolver / setAxisIndex / applyInput / describe / isFp）
要提供的接口：mountInterface(palaceApi, options)（t14 一行接入）、createInteraction / createUI（分件装配）
验收方式：node tests/interaction.test.mjs + node tests/run.mjs + 真实浏览器 CDP 走查（本文第 5 节）
依赖齐备：core 就绪（t2）；kit 与五区域在交付期间由 t3/t6/t7/t8/t10/t11 并行迭代（不影响 G 的接口）
发现的冲突：见第 6 节"发现与裁定请求"（均为 core/数据侧，G 不越界修改）
```

---

## 1. 交付物清单（全部在 inScope 内；未触碰任何他人文件）

| 路径 | 行数 | 职责 |
| --- | --- | --- |
| `src/interaction/requests.js` | 225 | 请求网关（**唯一出口**）：八视角编号/分区按钮/时辰/质量/导览/选中全部翻译成 §7.2 事件；守卫非法输入 |
| `src/interaction/keymap.js` | 177 | 键位→请求的纯映射；Esc 优先级；`helpKeyList()`；触屏支持范围文案 |
| `src/interaction/walk-solver.js` | 352 | **唯一**碰撞/可行走面解算：`aabbGrid` 宽相位、门洞通道、台阶阈值、水面例外、包络夹取；`mergeObstacles()` |
| `src/interaction/walk-graph.js` | 178 | 可行走栅格图（BFS 连通性）：证明 `FP_ROUTE` 全程可通、校验 fp-spawn |
| `src/interaction/catalog.js` | 153 | 建筑/障碍只读目录：信息面板文案、悬停名称、**不可进入建筑的可见提示**文案 |
| `src/interaction/pick.js` | 111 | 射线拾取（`THREE.Raycaster` × 建筑包围盒），含 `hoverRadiusPx` 容差；`setEnabled(false)` 即完全退出命中检测 |
| `src/interaction/highlight.js` | 109 | 悬停/选中高亮（叠加层线框，**不改共享材质**，自己释放几何/材质） |
| `src/interaction/fp.js` | 299 | 第一人称辅助：指针锁定、进入朝向（自校准灵敏度）、出生点校验、阻挡提示 |
| `src/interaction/tour.js` | 250 | 中轴导览：开始/暂停/继续/退出/上下一点，dt 推进，用户接管即暂停，与第一人称互斥 |
| `src/interaction/index.js` | 593 | 装配：键盘 capture 层、指针层、状态订阅、提示条、每帧驱动（`attachRenderLoop`）、协作模式判定 |
| `src/ui/tokens.js` | 90 | UI 令牌（间距/圆角/过渡/字体/面板色）→ CSS 变量，附阶梯校验 |
| `src/ui/dom.js` | 106 | 极简 DOM 工具（可注入 ownerDocument，便于 Node 替身测试） |
| `src/ui/labels.js` | 102 | 标签显隐/排版规划（缩放层级、数量上限、防重叠、面板矩形避让） |
| `src/ui/minimap.js` | 176 | 小地图：纯函数 `planMinimap()` + `zoneAreaAt()` + `drawMinimap()` |
| `src/ui/index.js` | 724 | 全部面板装配（HUD/八视角/七分区/信息/导览/小地图/加载重试/提示/时辰/质量/回全城/标签/提示条）+ `mountInterface()` |
| `src/ui/styles.css` | 531 行（15KB） | 皮肤（中文衬线标题、朱红印章、暗金细线、深色半透明面板、4-8-12-16-24-32 间距、4px 圆角、180ms 过渡） |
| `tests/interaction.test.mjs` | 1514 | **49 项** Node 侧机器校验（含最小 DOM 替身，断言对象是真实 core/layout 数据） |

`index.html`、`src/main.js`、`src/core/**`、`src/shared/**`、`src/kit/**`、`src/zones/**`、`scripts/**` **零改动**（已用"最近修改文件"清单核对，见第 5.4 节）。

---

## 2. 接口与接入方式（t14 收口用）

### 2.1 一行接入

```js
// src/main.js（t2/t14 维护）装配完成、window.__PALACE__ 就绪之后：
import { mountInterface } from './ui/index.js';
...
apiRef = api;
window.__PALACE__ = api;
const iface = mountInterface(api, { container });   // ← 唯一的 G 接入点
// 可选：若在唯一循环里显式驱动，则包装层自动停用（不会重复推进）
// frameStep(){ ...; iface.update(dt, elapsed); }
```

- `mountInterface()` 会：注入 `src/ui/styles.css` + `:root` 令牌、构建 `#palace-ui`、把 G 的碰撞解算器
  装到唯一相机装置（`rig.setCollisionSolver`）、订阅 `state:change`、并**包装 `renderSystem.recordFrame`**
  让 UI/导览/高亮搭上 main.js 的**同一个**动画循环（不新建循环；t14 显式调用 `iface.update()` 后包装层自停）。
- `window.__PALACE_UI__` 暴露 `{ api, interaction, ui, update, setVisible, stats, dispose }`（诊断/自动化只读消费）。

### 2.2 键盘所有权（重要）

`main.js` 已经在 `window` 上绑定了 `rig.bindInput()`（1–8 / F / Esc / R）与 T / Y / Space。G 的键盘层注册在
**window 的 capture 阶段**，对"自己映射的键"调用 `stopPropagation()`，保证同一按键只有一个处理者：

| 事件路径 | 行为 |
| --- | --- |
| 真实用户按键 / CDP `Input.dispatchKeyEvent`（target = body/document） | G 的 capture 层先跑并阻止 core 的 bubble 层 → 每个键恰好 1 个请求（**实测**：`count('view:request-mode')===1`） |
| 合成事件 `window.dispatchEvent(new KeyboardEvent(...))`（target = window） | 浏览器在**同一 target** 按注册顺序调用监听器，core 先跑且 `stopImmediatePropagation()` 拦不住 → G 进入**协作模式**：不重复发同类请求，只执行 core 不负责的部分（Esc 的指针锁语义、H/M 面板） |

协作模式的判定只看"该类请求的计数相对本控制器上次处理完键盘时是否变化"，**不使用时间窗口**
（实测缺陷：最初用 50ms 窗口，间隔 > 50ms 的合成按键会漏判并重复请求，已修正并加回归用例 B6）。

### 2.3 Esc 语义（§6.4）

`handleEscape()` 三分支：① 仍在第一人称 → **只释放指针锁**（不退出）；② 合成事件路径下 core 已抢先退出
第一人称（`fp.recentExit()` 判定）→ 立刻用同一条 `view:request-mode('fp')` 回到第一人称，仍不退出；
③ 否则按优先级：暂停导览 > 退出导览 > 取消选中。**`Esc` 不会退出第一人称，`F` 才是切换**。

### 2.4 隐藏义务（CONTRACTS §11.3）

`?ui=0` 或 `?shot=1` 时：根层 `hidden` + `is-hidden` + `pointer-events:none`，`interaction.setPickEnabled(false)`
（`picker.pick()` 直接返回 `null`），并且**不再生成任何标签元素**（`#palace-ui .palace-label` 计数 = 0，
不是靠 CSS 透明度）。实测见第 5.3 节。

### 2.5 每帧驱动与"唯一循环"

```text
不调用 iface.update()  → 包装 renderSystem.recordFrame（main.js 每帧调用一次）驱动 interaction + ui
调用 iface.update(dt)  → 包装层自动停用（driveMode() === 'manual'），每帧只推进一次
```

`attachRenderLoop()` 只包一层函数、无定时器、无帧调度 API 调用（`src/interaction/**`、`src/ui/**` 全文
不含 `requestAnimationFrame` / `setInterval` 字面量，见用例 B8 的静态扫描）。

---

## 3. 用户可见能力（§6.2 逐项）

| §6.2 要求 | 实现位置 | 关键行为 |
| --- | --- | --- |
| 全城鸟瞰首屏 | core `oblique` + `src/ui` HUD | 首屏即 `VP-city-oblique`；HUD 实时显示视角/分区/时辰/质量/位置/加载 |
| 多角度模式（八种） | `view-switcher`（8 按钮，编号 1–8 + 中文名 + 投影类型） | 键盘 1–8 / 按钮 / `?view=` 同一 `view:request-mode`；统一 1.2s 过渡（iso 正交） |
| 分区跳转（七分区） | `ZONE_BUTTONS`：全城/前朝/主殿/后宫/西宫苑/东宫苑/御花园 | 前六者 `view:request-zone`；「主殿」= 金銮殿近景（`view:request-focus-building`）；全部平滑过渡 |
| 建筑信息（悬停/点选高亮 + 名称/用途/可入内） | `pick.js` + `highlight.js` + `info-panel` | 悬停高亮（含 8px 容差）、点选高亮 + 面板（名称/用途/形制/分区/院落/是否可入内）+「近景」「进入内景」「走过去（第一人称）」 |
| 标签按缩放层级显隐 | `labels.js` | 相机距离 > `labelMinZoomDistance(260m)` 隐藏；`labelMaxCount(40)` 上限；24px 防重叠；避开面板矩形；选中/悬停标签始终可见 |
| 中轴导览（南桥→花园 10 讲解点） | `tour.js` + `tour-controls` | 开始/暂停/继续/退出/下一点 + 讲解文本 + 进度点；驻留 4.8s（= 镜头时长 ×4，派生而非新常量）；用户拖动/滚轮/切视角 → 暂停并提示 |
| 第一人称 | `fp.js` + core `updateFp` | 最近 fp-spawn 出生、视线高 = 面高 + 1.65m、进入朝向中轴或选中建筑、WASD/方向键/Shift、拖动或指针锁定、Esc 释放、F 返回并恢复机位 |
| 小地图 | `minimap.js` | 宫墙（朱红）/区域/护城河/水池/院落/桥 + 当前位置标记（含朝向）+ 点按分区定位 |
| 加载 / 失败 / 重试 | `loading` 面板 + HUD 行 | 绑定 `assets:progress`、`assets:failed`、`zone:failed`、`zone:loaded`；失败显示原因 + 「重试」按钮 → core 的 `retryFailedZones()` |
| 操作提示 / 时辰 / 质量 / 回到全城 | `help`/`env` 面板 | H 键折叠、T/Y 轮转、3 时辰、3 质量档、R/按钮回全城；触屏支持范围明文说明 |
| 窄屏 / 触屏 | `styles.css` + `data-narrow` | ≤720px 标记窄屏，提示面板默认折叠；≥32px 触控目标；粗指针设备加大命中区；触屏可鸟瞰/点选/分区跳转，第一人称漫游仅桌面 |

---

## 4. 验收项逐条对照（含机器证据）

| # | 验收项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | §6.2 全部能力 | **通过** | 用例 F1/F2/F4/F6/F8/F9/F10 + 浏览器 15 项（面板 12 个、8 视角、7 分区、3 时辰、3 质量、小地图真实绘制、加载重试、提示条） |
| 2 | 1–8 / 按钮 / F / Esc 同一请求事件 + 同一 `state.viewMode`；无第二套相机/状态；统一 1.2s | **通过** | A1/A2/A3/A4/A5/B1/B2/B5/B6/B7/B8；`B8` 静态扫描禁止新建相机/状态/循环；`B5` 断言每个键恰好 1 个请求 |
| 3 | 第一人称符合 §6.4 | **通过** | C1（5 个 fp-spawn 视线高 = 面高 + 1.65，误差 1e-6）、C2（**真实相机朝向** dot > 0.999，含选中建筑）、C3（丹陛/桥面/室内地面视线高 + 单帧高度变化 ≤ 台阶阈值）、A4（Esc 不退出） |
| 4 | 碰撞正确、不掉出包络、不可进入建筑有可见提示、`near` 不代替碰撞 | **通过** | E1–E6/E9/E10：台阶阈值、丹陛/桥面/门洞可通、墙体/水面/假山/建筑体块不可穿、4000 步 × 8 方向不越界、`probe` 越界判定；`catalog.hintFor()` 给出中文提示（F9） |
| 5 | 第一人称与导览互斥、不争夺相机 | **通过** | B3（进第一人称 → 导览 `paused=true`）、D3（拖动/滚轮/Esc/切视角 → 暂停 + 提示，且**相机位置零变化**——用未绑定 core 输入的夹具隔离归因） |
| 6 | 标签缩放显隐；小地图基于 layout；UI 符合 §3.1 | **通过** | F5/F16/F17 + F12（令牌来自 `CONFIG.UI`；间距全部落在 4/8/12/16/24/32）；浏览器实测 `border-radius:4px`、`transition:0.18s`、`min-height:32px`、`rgba(26,25,23,0.82)` |
| 7 | 窄屏可读可操作；触屏鸟瞰/点选可用并说明漫游范围 | **通过（触屏实机未验证）** | F10（`data-narrow=1`、默认折叠、触屏文案含"鸟瞰/点按/第一人称仅桌面"）；`@media (pointer: coarse)` 规则；**真实触屏设备未验证** |
| 8 | `tests/interaction.test.mjs` 通过 | **通过** | 49/49（见第 5.1 节） |

---

## 5. 实测命令与真实输出

### 5.1 契约 verify 之一：`node tests/interaction.test.mjs`

```text
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3" && node tests/interaction.test.mjs
---------------------------------------------------------
 interaction.test.mjs · G 交互与 UI（键位 / 八视角 / 第一人称 / 导览 / 碰撞 / UI）
 node v26.10.0 · root /Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3
---------------------------------------------------------
[A. 键位映射（1–8 / F / Esc / T / Y / Space / R）]  7/7 ✓（含 A4 Esc 不退出第一人称）
[B. 八视角 / 唯一状态 / 唯一相机 / 互斥]            8/8 ✓（B6/B7 协作模式；B8 静态唯一性）
[C. 第一人称（§6.4）]                              3/3 ✓
[D. 中轴导览]                                      4/4 ✓
[E. 碰撞解算 / 可行走面 / 包络保护]                11/11 ✓
      · 碰撞口径抽样 5704 次；差异 208 例全部位于登记水面内
      · 栅格 421×561@2m，可走 180151 格；路线 9 点连通
[F. UI]                                            17/17 ✓（A7+B8+C3+D4+E11+F17 = 49）
---------------------------------------------------------
 通过 49 / 49
（exit=0）
```

要点（真实数字）：

- **E7 与 core 内置求解器逐点比对**：5704 次抽样中 208 例差异，**全部**位于 `layout.WATER_BODIES`
  矩形内（G 有意差异：水面改为"支撑面是否为桥面"判定），非水面处 0 例分歧。
- **E8 FP_ROUTE 连通性**：2m 栅格 421×561，可走 180151 格；南桥→南城门→广场→台基→金銮殿→内廷门→寝殿→御花园
  **9 个路点同属一个连通分量**，5 个 fp-spawn 亦在该分量内（段长分别为 36/148/112/46/38/518/72/234m，
  第 6 段 518m 是绕主殿台基的真实绕行路径——直线被建筑阻挡）。
- **E10 障碍合并回归**：core 侧 `registry.allObstacles()` 改为派生墙体碰撞盒（83 条）后，若只取注册表会
  **丢掉 81 条 layout 基线中的"不可进入建筑"**（第一人称可直接穿模）。现改为 `layout.OBSTACLES ∪ 注册表`
  合并（注册表优先），并以用例永久看住。

### 5.2 契约 verify 之二：`node tests/run.mjs`

```text
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3" && node tests/run.mjs
 PASS  tests/core-walls.test.mjs  432ms
 PASS  tests/core.test.mjs  1133ms
 PASS  tests/interaction.test.mjs  3041ms
 PASS  tests/kit.test.mjs  3709ms
 PASS  tests/layout.test.mjs  215ms
 PASS  tests/zone-east.test.mjs  1192ms
 PASS  tests/zone-forecourt.test.mjs  3697ms
 PASS  tests/zone-garden.test.mjs  1245ms
 PASS  tests/zone-inner.test.mjs  991ms
 PASS  tests/zone-west.test.mjs  3194ms
 PASS  tests/zones.test.mjs  4933ms
 通过 11 / 11，失败 0，总耗时 23785ms
（exit=0）
```

补充（非 verify 项，仅作集成佐证）：`node scripts/build.mjs` → exit 0，
`dist 就绪：62 个文件 / 2.21MB；绝对路径 0；关键文件齐全`（`dist/src/ui/styles.css` 等 6 个 UI 文件已随包）。

### 5.3 真实浏览器走查（CDP + `chrome-headless-shell`，15/15 通过）

环境：`~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`
（`--headless --disable-gpu --no-sandbox --remote-debugging-port=9333 --window-size=1440,900`），
页面 `http://127.0.0.1:8123/index.html?ui=1&preset=goldenHour`（`bash scripts/serve.sh`），
按键用 `Input.dispatchKeyEvent`（**受信事件**，与真人一致）+ 合成 `window.dispatchEvent` 两条路径。

```text
PASS  装配：12 面板 / 8 视角 / 7 分区 / 共用同一 rig+store
PASS  样式表生效（4px / 180ms / 32px / CONFIG.UI 变量）
PASS  真实按键 2 → iso，且只 1 个请求
PASS  真实 F → 第一人称：最近出生点 + 面高+1.65 + 真实朝向中轴（dot=1）
      :: {"spawn":"VP-B-fp-spawn","aim":{"target":{"x":0,"z":-190},"source":"route","yawDeg":10.01,
          "actualYawDeg":10.01,"rotated":true},"sens":0.0026}
PASS  真实 WASD 在第一人称移动（core 内核 + G 碰撞解算器）
PASS  真实 Esc 留在第一人称不动 mode（§6.4 只释放指针锁）
PASS  真实 F 返回并恢复进入前模式（zone）
PASS  合成 window-target 事件（间隔 300ms）：不重复请求 + F 单次切换 + Esc 不退出
      :: {"delta":1,"afterF":true,"afterEsc":true,"afterF2":false,"skips":3}
PASS  分区 / 时辰 / 质量按钮走同一请求事件
PASS  中轴导览：start → axis + tourState + 讲解点播报
      :: {"active":true,"index":0,"total":10,"name":"南桥","dwellSeconds":4.8}
PASS  导览中手动切视角 → 暂停 + 可见提示 + 继续按钮可用
PASS  选中建筑 → 信息面板（名称/用途/可入内）+ 三维高亮
PASS  小地图真实绘制 + 点按定位到 D 区
PASS  面板两两不重叠 + 标签不落在面板内
PASS  ui=0/shot=1：隐藏 + pointer-events:none + 拾取 null + 零标签 + 就绪/stats 契约不破
      :: {"hidden":true,"pe":"none","pickEnabled":false,"pick":null,"labels":0,"labelPool":0,
          "reason":"sync-frames","stats":true}
===== 浏览器终检：通过 15 / 15 =====
```

**目视核对（临时截图，不属于交付产物）**：`/tmp/ui-skin-iso.png`、`/tmp/ui-skin-zone.png`（1440×900）。
目视确认：中文衬线标题「紫禁天朝」+ 朱红印章；HUD 六行；视角切换器当前档朱红高亮；分区/时辰/质量同套控件；
小地图宫墙-区域-水体-院落与金点定位；中轴导览进度点与五个按钮；信息面板「金銮殿/可进入内景/用途/形制·分区·院落」；
三维建筑标签按缩放层级出现且不压面板；右下侧栏单列可滚动、面板互不重叠。
（两页当时正处在"区域 F 装载失败"的错误态，截图为看清 UI 皮肤临时隐藏了 core 的 `#loading-layer`
——仅运行时 DOM 操作，未改任何文件。）

### 5.4 范围核对

`find . -newermt "-70 minutes" -type f` 显示本次 attempt 我只写入：
`src/interaction/{requests,keymap,walk-solver,walk-graph,catalog,pick,highlight,fp,tour,index}.js`、
`src/ui/{tokens,dom,labels,minimap,index}.js`、`src/ui/styles.css`、`tests/interaction.test.mjs`、
`docs/handoffs/ui-engineer.md`。其余变动文件（`src/core/**`、`src/kit/**`、`src/zones/**`、`docs/**`、`work/**`）
均属并行任务（t2/t3/t6/t7/t8/t10/t11/t19/t21/t23），未被本任务触碰。

---

## 6. 发现与裁定请求（G 不越界修改，交 core/t1/V2）

1. **`src/core/state.js:355` 的 `validateStateShape` 与 core 自身的暂停语义不一致（中）**
   `viewMode === 'fp'` 且 `tourState.active === true` 被判为"互斥违规"，但 core 的 `setViewMode('fp')`
   正是"把导览暂停但保持 `active`"（§5.4）。因此进入第一人称后 `validateStateShape()` 恒返回 1 个问题。
   本次以用例 B3 **显式断言该不一致**（而不是绕过它），并保持 G 的行为与 §5.4 一致（暂停而非终止）。
   建议：校验改为 `tourState.active && !tourState.paused`，或 core 在进入第一人称时 `stop` 导览（需 t1/t2 裁定）。
2. **`layout.OBSTACLES` 宫墙门洞的 `door.axis` 语义偏宽（低）**
   南/北段宫墙写的是 `axis:'x'`，而核心与 G 的门洞判定把 `axis:'x'` 解释为"通道沿 z、横向受 |z-z0| 限制"
   （对建筑是正确的，对沿 x 延伸的宫墙段则偏宽：`z≈-454±13` 内整条墙都算门洞）。
   实际不可穿越靠的是"墙带内没有可行走面"（`noSurface`），实测 8 方向长距离冲撞均无法越墙（E5/E6）。
   建议：城墙段改用 `axis:'z'`（或在 layout 侧明确语义），以免未来补上墙带地坪后出现穿墙。
3. **`?dpr=` 非法值产生 NaN**：与 `CONTRACTS §11.5 风险 1` 同一问题，已由 t21 在 `src/core/renderer.js` 修复
   （G 不消费 `?dpr`，仅记录）。
4. **`registry.allObstacles()` 语义变更的连带影响（已修，见 E10）**：core 侧 t23 把宫墙/院墙碰撞改为派生图层后，
   注册表**不再包含** `layout.OBSTACLES` 的"不可进入建筑"。任何"只取注册表"的碰撞/提示消费方都会失去建筑阻挡。
   G 已改为合并（`mergeObstacles`），并建议其他消费方（如 t13 的走查脚本）注意同一口径。

---

5. **（t2 复核后的口径澄清，已并入本交付）** `core-engineer` 在 t21 中按 main.js 的真实装配顺序实测：灰盒后
   `allObstacles()` = 160（83 派生墙盒 + 81 layout 基线 − 4 条去重的 `OB-WALL-CITY-*`），B/C/E/F `replace` 后 = 163；
   `layout.OBSTACLES` 中缺失的只有 4 条 `OB-WALL-CITY-{south,north,west,east}`，且是**有意取代**（core 用 8 个实心
   span 盒 + 26m 门洞缺口表达，比 layout 那 4 条更严）。因此：
   - 我的 `mergeObstacles()`（registry ∪ layout，id 去重、registry 优先）被确认为**推荐做法**；
   - **不得**用条数启发式判断"注册表是否已完整"（我最初正是踩了这个坑：83 ≥ 81）；
   - 合并会带回那 4 条冗余墙盒，但在"任一障碍阻挡即阻挡"语义下只会更严，不会变松——本节新增用例 **E11** 专门
     锁定这个生产口径：164 条障碍（派生墙盒 ∪ 基线）下南城门门洞可通（穿门全程无墙盒阻挡）、墙带内偏离门洞
     `x=20` 仍被挡住、`FP_ROUTE` 9 点仍连通；
   - 判定"城门是否可通"时应以 core 的 span 盒缺口为准，**不要**依赖 layout 那 4 条的 `door` 字段（其 `axis`
     语义见第 2 条，t2 已把建议写进 `docs/handoff-t2-repair-walls.md` §3）。

## 7. 未验证项（如实标注）

1. **指针锁定（pointer lock）路径未验证**：本沙箱内 `chrome-headless-shell` 拒绝授权
   （实测 `lockRequests:1 / lockGranted:0 / lockDenied:1`，`document.pointerLockElement === null`），
   真 Chrome（`/Applications/Google Chrome.app`，`--headless=new --disable-gpu`）无法创建 WebGL 上下文
   （`Could not create a WebGL context ... GL_RENDERER = Disabled`），页面根本无法装配。
   → **已验证**：拖动转视角（真实按键 + core 的 pointer 输入）、Esc 的"释放指针锁后继续拖动/按 F 返回"分支逻辑、
   锁定失败时的可见降级提示；**未验证**：真实指针锁定下的 `movementX/Y` 转视角、锁定光标状态。
2. **真实 GPU 帧率/性能**：本任务不含性能门槛（属 t12/t13）；headless SwiftShader 下的 FPS 无代表性。
   G 侧只声明：UI 新增 2 个绘制对象（悬停/选中线框）+ 1 个 DOM 层，面板 12 个（无 canvas 动画），
   每帧开销为 O(标签候选数) 且节流到 0.36s 一次（非每帧重排）。
3. **真实触屏设备**：仅做 CSS `@media (pointer: coarse)` 与文案层面处理，未在触屏硬件上验证；
   触屏可用范围已在 UI 内明文说明（鸟瞰/点选/分区跳转可用，第一人称漫游仅桌面）。
4. **窄屏真机视觉**：仅验证 `data-narrow=1`、默认折叠、文案与命中尺寸（用例 F10），未做真机截图比对。
5. **进入第一人称后的完整步行录像**（南桥→花园全程实际行走）：G 侧只证明了**几何连通性**
   （E8 栅格 BFS 连通 + 各段可通行判定），未录制真实按键连续走查；该录像属 t13/G3 的验收范围。
6. **多标签密集场景的视觉密度**：已实现缩放层级显隐 + 40 条上限 + 24px 防重叠 + 面板避让，
   但未做多分辨率（1080p/2K/4K）逐档目视比对。
7. **UI 在 `?stats=1` 下的面板避让**已用 `data-stats-overlay` 与浏览器矩形判定确认（F16 + 浏览器项），
   但 `#palace-stats` 面板若未来改变位置/高度，需要同步调整该偏移量。

---

## 8. t32 同步记录（core 语义修正后，G 侧过期断言同步）

> 任务：t32（T7.1 同步 G 侧过期断言 B3） · 执行者：`ui-engineer` · attempt：`d1006ba4-ceee-4500-85a7-ca50b72b574f`
> 背景：t27 负责人实测 `node tests/run.mjs` = 13/14，唯一红项是本文件的 **B3** —— 该断言把 t31 **修正前**的
> core 缺陷写成了期望值（原文 `期望 1，实际 0`）。t31 已按主理人裁定把互斥判定改为
> `viewMode==='fp' && tourState.active && !tourState.paused`（§5.4：进 FP **暂停**导览，暂停 ≠ 停止）。
> 本任务只改 inScope 两个文件（`tests/interaction.test.mjs`、本回执），**未触碰 `src/**`**。

### 8.1 主项：B3 改为 canonical 语义（并反向锁定校验器仍有效）

- 用例改名：`B3 校验器与 §5.4 暂停语义一致：进第一人称 → 暂停导览且零冲突；真正互斥的是"导览推进中 + 第一人称"`。
- 删除把旧缺陷当期望值的写法（`validateStateShape(...).length === 1` + `includes('互斥')`）。
- 新断言（**零问题** + 双向锁定，避免"把校验器断言成永远为空"的放空式通过）：

| 断言 | 说明 |
| --- | --- |
| `validateStateShape(state).length === 0` | 进 FP 后"导览暂停 + viewMode fp"是**合法**状态（§5.4） |
| 把 `tourState` 改成 `{active:true, paused:false}`（导览推进中）→ 断言恰好 1 个问题且含"导览正在推进" | 证明互斥校验**仍然有效**，不是被放空 |
| 把 `mode` 改成 `'tour'`（viewMode 仍 fp）→ 断言恰好 2 个问题且都指向 mode 一致性 | 锁定 t31 新增的两条 mode 一致性规则 |
| 退出 FP 后 `paused` 仍为 true（不自动恢复）→ `resume()` 后零问题 → `start(2)` 后 `index===2` | §5.4 的暂停/恢复语义仍有覆盖 |

### 8.2 自查：同文件其它依赖 t31/t27 旧语义的期望（逐条给结论）

| # | 类别 | 结论 | 证据/处置 |
| --- | --- | --- | --- |
| 1 | **rotate 旧写读时序**（t31） | 有则同步（新增 canonical 断言） | 原用例只断言"真实相机朝向 dot>0.999"（该断言在新旧时序下都成立，属**不足以发现**旧缺陷的弱断言）。现于 C2 增加：`applyInput('rotate')` 之后**同一帧内** `describe().azimuthDeg` 必须已变化（`yawBeforeFrame → yawAfterFrame` 差值 > 0.01）。旧时序下该类被延迟到 `updateFp` 才写回，断言会失败 → 成为 t31 的回归守卫。<br>注：`src/interaction/fp.js` 仍保留防御式 `stepRig()`（先让装置走 1/240s 再读朝向），新旧时序下都正确；`src/**` 不在 t32 inScope，故未改，记为可选清理项。 |
| 2 | **`door.axis` 旧约定**（t27） | 有则同步（新增 canonical 断言） | E9 使用的门洞字面量 `axis:'z'`（朝南殿堂的面法线轴）本就 canonical；E10 新增两条：合并后的 `OB-WALL-CITY-south.door.axis === 'z'`（t27 翻正为面法线轴），而原始 `layout.OBSTACLES` 仍是 `'x'` → 显式断言"消费方必须用 registry 归一版本，不得依赖 layout 该字段"。 |
| 3 | **水体 / 障碍 y0 旧行为**（t27） | 有则同步（新增 canonical 断言） | E10 新增：合并结果采用 registry 归一版本 → `OB-WB-F-pond-west.y1 > 1`（"水体抬到可拦人"，原始 layout 为 0.05）、`OB-B-hall-mid.y0 === 0`（从记录的 2 下钳到足迹地坪）、且 `solver.probe(-200,355).ok === false`（真实行为，不是代理指标）。E5 的"水池不可踩"在 layout-only 口径下同样通过（我的求解器有独立的水面判定）。 |
| 4 | **`allObstacles()` 条数启发式 / `layout.OBSTACLES ∪ registry` 旧写法**（t27） | 有则同步（改写下界 + 新增幂等断言） | registry 现已内建 81 条归一基线（`stats.obstaclesBySource = {layoutBaseline:81, coreWalls:83}`）。原先 `assert(merged.length >= LAYOUT.OBSTACLES.length)` 的措辞容易被误读为"按条数选源"的旧启发式 → 改为显式下界 `merged.length >= live.length` 并注明"**不是**选源启发式"；另新增 `LAYOUT.OBSTACLES` 在 registry 中的缺失数 = 0、以及 `merged.length === live.length`（**合并幂等**：id 去重、registry 优先）两条断言。 |
| 5 | 其它 | 已核查，无需改动 | 全文件再扫一遍：无 `stepRig`/补帧依赖、无旧 `axis` 期望、无旧 y0 期望、无条数选源判断；E7 的"与 core 求解器口径一致（差异只允许在登记水面内）"在 t27 之后仍为 5704 抽样 / 208 例差异且**全部**落在登记水面矩形内（实测数字未变）。 |

### 8.3 计数（未删用例、未减少断言）

- 用例数：**49 → 49**（B3 改名保留，未删除任何用例）。
- 断言调用数：**353**（本次净增 ≥ 11 条，无删除；唯一"改写"是 E10 那条下界断言换了更精确的口径）。
- 改动文件：`tests/interaction.test.mjs`、本回执。`src/**`、`index.html`、其它任务文件零改动。

### 8.4 本次实测（真实输出）

```text
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3" && node tests/interaction.test.mjs
[B. 八视角 / 唯一状态 / 唯一相机 / 互斥]
  ✓ B1 / B2 / B3（新语义）/ B5 / B6 / B7 / B8
  ...
 通过 49 / 49
（exit=0）

$ … && node tests/run.mjs
 PASS  tests/core-audit.test.mjs  6136ms
 PASS  tests/core-camera.test.mjs  201ms
 PASS  tests/core-collision.test.mjs  1121ms
 PASS  tests/core-walls.test.mjs  307ms
 PASS  tests/core.test.mjs  629ms
 PASS  tests/interaction.test.mjs  2896ms
 PASS  tests/kit.test.mjs  1470ms
 PASS  tests/layout.test.mjs  90ms
 PASS  tests/zone-east.test.mjs  451ms
 PASS  tests/zone-forecourt.test.mjs  1805ms
 PASS  tests/zone-garden.test.mjs  907ms
 PASS  tests/zone-inner.test.mjs  700ms
 PASS  tests/zone-west.test.mjs  2173ms
 PASS  tests/zones.test.mjs  5413ms
 通过 14 / 14，失败 0，总耗时 24301ms
（exit=0）
```

**run.mjs 归属说明**：本轮 14/14 全绿，其红项（B3）已由本次同步消除；无其它任务的 in-flight 红项需要归因。

