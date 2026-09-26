# 交付回执 · CONTRACTS v1.0.2（t17 / T2.1 运行时查询参数与 shot 模式义务）

> 归属：t1 foundation-lead（`docs/CONTRACTS.md` 唯一负责人）
> 任务：t17 — 把 t2 实现的 `?view/?preset/?ui/?shot/?stats` 与 shot 模式义务正式写入 CONTRACTS
> attempt_id：`7511b716-f378-4c3c-b137-f7e8fd19b368`
> 版本对应：**`CONTRACTS v1.0.2` ⇄ `CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`**

## 1. 改动清单（仅 2 个 inScope 文件）

| 文件 | 改动 |
| --- | --- |
| `docs/CONTRACTS.md` | 头部版本表 → `CONTRACTS v1.0.2`；版本对应关系行同步；修订记录新增 v1.0.2 条目；§7 末尾加一行指向 §11 的"第三个请求入口"；**新增 §11 运行时查询参数与 shot / 截图模式义务**（11.1 参数表 / 11.2 稳定 URL / 11.3 shot 义务 / 11.4 stats 字段与 audit 口径 / 11.5 差异记录 / 11.6 实测证据） |
| `docs/handoff-contracts-query.md` | 本回执 |

`src/shared/**`、`src/core/**`、`src/main.js`、`index.html`、`tests/**`、`scripts/**` **零改动**（本次是纯文档任务）。
`src/shared/config.js` / `src/shared/layout.js` 的冻结数值与版本号未动（`CONFIG_VERSION` 仍 `1.0.1`、`LAYOUT_VERSION` 仍 `1.0.0`）。

## 2. 依据（逐行核对实现，不凭任务卡臆测）

| 事实 | 来源（本次实际阅读） |
| --- | --- |
| 参数解析（含别名表、默认值语义） | `src/main.js` `parseQuery()`（L34–63）、`parseEnvOverride()`（L66–82） |
| 参数如何生效（请求事件、非法值处理、shot 跳过渡、固定机位） | `src/main.js` `bootstrap()`（L110–207）、`applyQueryView()`（L418–435） |
| 就绪信号（四件套 + reason + 幂等 + 400ms 兜底） | `src/main.js` `markReady()`/`markLoaded()`（L545–569）、同步 3 帧路径（L616–629）、rAF 路径（L599–605）、`window.__PALACE__`（L632–707） |
| `VIEW_MODES` 精确取值 | `src/core/state.js` L20：`CAMERA.viewModes.map(m => m.mode)` → `oblique/iso/axis/zone/focus/interior/fp/orbit`；`VIEW_MODE_BY_INDEX` L21 |
| 请求校验与拒绝文本（view/zone/focus/tour/preset/quality） | `src/core/state.js` 控制器 L171–343（`reject()` L176、`VIEW_MODE_SET` L186、`TIME_PRESET_SET` L288、`QUALITY_SET` L299） |
| `?focus` 未命中建筑的相机回落 | `src/core/camera.js` focus 分支（`registry.getBuilding(id)` → 回落 `VP-B-main-hall`） |
| `?stats=1` 字段与值 | `src/main.js` `compactReport()`（L474–511）+ `ensureStatsPanel()`/`reportElement()`（L438–472） |
| 整帧/主场景口径 | `src/core/renderer.js` `getStats()`（`renderer.info.render.calls|triangles`、`recordFrame` 窗口统计） |
| shot 脚本如何消费这些参数与就绪信号 | `scripts/shot.mjs`（`USE_UI`/`WITH_STATS`/`REQUIRE_READY`、`?ui=0&shot=1` 拼装 L530–540、`data-palace-ready="1"` 等待 L614–672） |
| audit 口径（Node 上界估计） | `scripts/audit.mjs` 头部 L11–18 + `drawCalls` 计算 L101–144、按视角口径 L264–311 |
| 跨报告统计口径（亮度/暗区） | `docs/shots/README.md` |

## 3. 契约要点（详见 CONTRACTS §11）

**参数（11.1）**：`?view`（8 视角，非法 → `console.warn` 并忽略）· `?preset`（`golden|dusk|night` 及全名，非法别名 → 静默忽略）·
`?ui=0`（仅字面 `0`；立即隐藏加载层且不再显示）· `?shot=1`（仅字面 `1`；固定 dt + 相机直接到终点 + 同步 3 帧）·
`?stats=1`（仅字面 `1`；`#palace-stats` 面板 + `#palace-stats-json` 机器可读 JSON）。
附加（实现已支持，一并冻结）：`?zone`（`city|B|C|D|E|F`，非法 → 控制器 reject）、`?focus=<buildingId>`、
`?quality=high|medium|low`、`?dpr=<数字>`、`?greybox=0`、`?env=…`（**诊断专用**，不改 `src/shared/**`）。

**shot 模式义务（11.3，G 必须遵守）**：
1. `ui=0` 或 `shot=1` → HUD/标签/小地图/信息面板/导览控件/视角切换器**全部隐藏且不参与命中检测**（不得只 `opacity:0`）。
   **当前状态如实标注**：`src/ui/**`、`src/interaction/**` 尚未交付（空目录），此刻唯一 UI 是加载层，`ui=0` 已实现隐藏；
   其余是对 G 的必做要求，交付前属**未实现/未验证**。
2. 就绪信号必须可外部轮询：`window.__PALACE_READY__` + `data-palace-ready="1"`（html/body）+ `data-palace-ready-src` +
   更早的 `data-palace-loaded="1"` / `window.__PALACE_LOADED__` + `window.__PALACE__.whenReady`（Promise）/`.ready`；
   `shot=1` 走"同步 3 帧 → `sync-frames`"，`shot≠1` 走 rAF ≥2 帧 + 400ms `grace-timer` 兜底；`markReady` 幂等。
   `scripts/shot.mjs` 按 `data-palace-ready="1"` 等待（`--require-ready=first|all|none`，默认 `first`）。
3. `ui=0` 与 `stats=1` 独立：`?ui=0&stats=1` 仍保留左下角统计面板（`pointer-events:none`）；**纯画面交付图不要叠加 `stats=1`**。
4. `window.__PALACE__` 可供 V2 直接断言（`report()`/`settle()`/`stats()`/`whenReady`/`registry`/`rig`…）。

**`?stats=1` 与 audit 的口径关系（11.4）**：stats 是**浏览器实测**（`fullFrameDrawCalls = renderer.info.render.calls` 含阴影/后处理；
`visibleTriangles = renderer.info.render.triangles` 含阴影重复绘制；`avgFps/p95FrameMs` 为窗口统计，SwiftShader 下不具代表性）；
`audit.mjs` 是 **Node 侧上界估计**（可见对象 × `geometry.groups`，不做视锥剔除；另给"按视角视锥剔除后"口径）。
**两者不可直接比大小**；跨报告引用必须写明来源。亮度/暗区权威口径在 `scripts/shot.mjs` + `docs/shots/README.md`。

## 4. 差异与风险（CONTRACTS §11.5 同步记录，交 V2 复核）

| # | 差异 / 风险 | 处置 |
| --- | --- | --- |
| 1 | `?preset` 别名比任务卡宽（还接受 `goldenHour/sunset/moonlitNight/gold/moon`），且**非法别名静默忽略**（`?view` 非法会 warn） | 以实现为准；`golden/dusk/night` 为稳定写法 |
| 2 | 实现额外支持 `?zone/?focus/?quality/?dpr/?greybox/?env`（任务卡只列 5 个） | 一并冻结；`?env=` 明确为诊断参数 |
| 3 | 就绪信号实际有**四种**（任务卡只说"DOM 标记或 window 标志"） | 以实现（更严）为准 |
| 4 | ⚠ **`?dpr=<非数字>` → `Number()` 得 `NaN`，`Math.max/min` 夹取不拦 `NaN` → DPR 变 `NaN`**（`?stats=1` 报告里序列化为 `null`） | **实测确认，属 t2 待修**（`src/core/renderer.js` `effectiveDpr()` 未做 `Number.isFinite` 校验）；本次在 §11.1 标注"必须传有限正数"，**未自行修改 src/**（不在 inScope） |
| 5 | `?ui=0` 不隐藏 `?stats=1` 面板 | 有意行为，写入 §11.3 注 3 |

## 5. 实测证据（本节数字均为本次真实运行）

真实浏览器探测（`chrome-headless-shell` + `--dump-dom`，URL `?view=iso&preset=night&ui=0&shot=1&stats=1&quality=medium&dpr=1`）：

```text
data-palace-loaded="1"
data-palace-ready="1"
data-palace-ready-src="sync-frames"
#loading-layer ... hidden=""        ← ui=0 生效
#palace-stats-json：31 个字段；dpr=1 · preset="moonlitNight"（night 别名归一） · viewMode="iso"
```

对照 `?dpr=abc`：同一报告 `dpr` = `null`（即 `NaN`）→ 印证 §11.5 风险 4。
（探测期间并行任务正在写 `src/zones/*.js`，页面会打印区域装载失败日志；就绪标记与报告字段不受影响。）

契约 verify（原样）：

```text
$ node tests/run.mjs          # 07:08:04 复跑
 PASS  tests/core.test.mjs  213ms      （40 / 40）
 PASS  tests/kit.test.mjs   1714ms     （496 / 496）
 PASS  tests/layout.test.mjs  195ms
 PASS  tests/zones.test.mjs 2576ms     （28 / 28，skip D/E 未交付）
 通过 4 / 4，失败 0，总耗时 4698ms      → exit 0

$ grep -n "shot=1\|ui=0\|preset=\|stats=1" docs/CONTRACTS.md
（30 处命中：L19 修订记录、L343 §7 指针、L445–448 参数表、L457 dpr 风险、L467–474 URL 示例、
 L479–499 shot 义务、L508–538 stats 与 audit 口径、L544–548 差异表、L552–559 实测证据）
 exit 0   ·   grep -c → 30
```

> **诚实记录（两次瞬时红，均为并行写入的中间态，与 t17 无关）**
> 1. 首次跑到 `tests/zones.test.mjs` 曾 FAIL：`F: config.deriveSeed is not a function`。复核后确认是 t8 **正在写**
>    `src/zones/garden-boundary.js` 的中间态（该文件 L31 现为 `import { CONFIG, MODULES, TERRAIN, deriveSeed } from '../shared/config.js'`，已正确）；
>    单独复现 `createZone` 成功（F 区 14 栋建筑）。
> 2. 稍后一次 FAIL：失败点是 `B: createZone(ctx) …`，并伴随 `THREE.BufferGeometry … min/max have NaN values`
>    （`tests/zones.test.mjs` 被 SIGTERM，2702ms）——同样是 t6 **正在写** `src/zones/forecourt.js` 的中间态。
>    紧接着单独跑 `node tests/zones.test.mjs` → **28 / 28 通过（exit 0）**；再跑 `node tests/run.mjs` → **4 / 4 通过（exit 0）**。
> `grep` 已确认 `tests/**` **不读** `docs/`；本次改动仅两个 Markdown 文件，不可能影响测试结果。
> **附带事实（供契约准确性）**：`deriveSeed` 是 `src/shared/config.js` 的**顶层命名导出**，`CONFIG.deriveSeed` 为 `undefined`
> （`CONFIG` 聚合体 27 个键，不含该函数）——消费方须 `import { deriveSeed } from '../shared/config.js'`，或使用 core 提供的 `ctx.rng`。

## 6. 未验证项 / 已知限制

1. **G 的 UI 隐藏义务尚未实现**：`src/ui/**`、`src/interaction/**` 为空目录；§11.3 第 1 条中"HUD/标签/小地图/面板隐藏且不参与射线命中"
   目前**未验证**，须由 t9 交付后按 §11.3 在 V2（t13）逐项走查。
2. **`?shot=1` 与真实 GPU 帧率无关**：本机 headless 走 SwiftShader，`avgFps` 不具代表性；真实帧率仍属未验证（t13）。
3. **非法 `view/preset/zone` 的降级行为由代码核实**（warn/reject/静默忽略三条路径），未逐条做浏览器端断言
   （本机 headless 在并行写入期间频繁超时，探测不可靠；CONTRACTS §11.5 已注明以实现为准）。
4. `?env=` 诊断参数只影响本进程预设副本，**不改变** `src/shared/config.js`；若将来要固化提亮值，须走 §10 版本递增流程
   （已知 t19 计划以 `CONFIG 1.0.2` 处理夜景预设）。
