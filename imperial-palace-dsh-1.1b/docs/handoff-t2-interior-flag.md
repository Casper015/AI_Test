# handoff · T2.24 逐栋内景取景入口：`?interior=<slotId>` + `shot.mjs --interior`（t91）

任务：`t91`（repair，attempt 1）· 执行者：core-engineer（attempt_id `ef0be978-208c-4cfe-b7ed-3323ca818d3c`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope（已严格遵守）：`src/core/camera.js`、`scripts/shot.mjs`、`tests/core-camera.test.mjs`、本回执。
**未触碰** `src/main.js`、`docs/CONTRACTS.md`、`src/shared/**`、`src/kit/**`、`src/zones/**`、`src/ui/**`、`src/interaction/**`、`scripts/audit.mjs`。

---

## 1. 解析位置（先查清后动手；file:line 证据）

| 项 | 位置 | 说明 |
| --- | --- | --- |
| 查询参数解析 | `src/main.js:46` `export function parseQuery(search = location.search)` | `?view/?focus/?zone/?preset/?ui/?shot/?stats/…` 全在此解析 |
| 查询 → **请求** | `src/main.js:434-447` `applyQueryView()`：`query.focus` → `events.request(EVENTS.requestFocusBuilding, {buildingId, source:'query'})`（:438-439）；`query.view` → `events.request(EVENTS.requestViewMode, {mode, source:'query'})`（:441-447）；`?view=interior&zone=X` 会先 `store.patch({view:{area:X}})`（:444） | ⇒ **既有 `?focus=`/`?view=` 的解析与请求都在 `src/main.js`**（本卡 inScope 不含它，避免与 t14 争用） |

**因此本卡没有改 `src/main.js`**：把引导逻辑放进**唯一相机装置** `src/core/camera.js`（`createCameraRig` 新增可选 `query`；浏览器内回落到 `location.search`），
并在 `update()` 首帧起**重试引导**（区域是异步注册的），成功后通过**同一条** `view:request-mode` 出口请求——**没有第二套取景/相机路径**。
（若主理人更希望"参数解析统一在 main.js"，补丁很小：`parseQuery` 加 `interior: params.get('interior')` + `applyQueryView()` 里加一行请求；本卡按范围收紧未做。）

## 2. 交付

| 位置 | 内容 |
| --- | --- |
| `src/core/camera.js` | `createCameraRig({…, query})`；新增 `interiorQueryState` 与 `interiorQueryValue()/interiorQueryExplicitView()/resolveInteriorQueryTarget()/bootstrapInteriorQuery()`；`update()` 每帧尝试直到 `done`（最多 900 帧）；`describe()` 新增 `interiorQuery:{requested, applied, reason}`。取值支持 **`VP-<…>-interior` 直写**、**建筑 slotId**（经 layout 显式映射 `interiorRecordForSlot`）、以及 `WK-<…>-interior` 面 id 兜底。 |
| `scripts/shot.mjs` | 新增 `--interior=<slotId|VP-…>`：URL 注入 `interior=<id>`（并显式 `view=interior`）；未显式给 `--view` 时视角列表收敛为 `['interior']`（`INTERIOR_MODE`，:1116-1119、:1170 附近）。内景无天空由既有豁免处理（`:921` `!isInteriorView`），无需 `--allow-no-sky`。 |
| `tests/core-camera.test.mjs` | 新增 4 条用例（见 §4）。 |

**兼容性**：与 `?focus=` 互不影响（两条独立请求）；URL 显式给了 `?view=<非 interior>` 时**引导不覆盖**（八视角优先，原因记为 `view=<x>-precedence`）；`?ui=0&shot=1` 下 UI 仍隐藏（shot.mjs 固定注入 `ui=0&shot=1`，本卡未改该义务）；`?stats=1` 报告里 `viewMode` 会显示 `interior`（`src/main.js:508`）；**内景机位 id** 由 `rig.describe().interiorViewpointId` / `interiorQuery` 暴露（报告若要直接带该 id，需 main.js 一行，属本卡范围之外）。

## 3. 稳定性证据（t63 的 blocker：多页加载后 headless 白屏/停滞）

### 3.1 正式入口（一条命令）
```text
$ node scripts/shot.mjs --interior=B-hall-mid --preset=all --out-dir=/tmp/t91-flag --keep-invalid   → exit=0
 PASS golden  interior  [near] 内容均值 0.4223 内容暗区 7.56% 内容截断 0.00%
 PASS dusk    interior  [near] 内容均值 0.4640 内容暗区 0.19% 内容截断 2.18%
 PASS night   interior  [near] 内容均值 0.4952 内容暗区 0.00% 内容截断 3.70%
 /tmp/t91-flag/t2-interior-golden.png 470,383B  ·  t2-interior-dusk.png 486,136B  ·  t2-interior-night.png 501,796B
```
（三张均为 `interior` 视角、按内景判据 PASS；对比 t63 遇到的白屏卡是 5.7KB 纯白 ⇒ 容量差 ~85×。）

### 3.2 连续 21 次取景（7 栋 × 3 时辰，单页面内切换机位+时辰，逐张判空）
判空阈值（与 t78 同口径、未放宽）：`bytes ≥ 60,000 且 std ≥ 8 且 采样色 ≥ 40`，且 `rig.describe().mode === 'interior'` 与机位 id 逐一匹配。

| 栋 | 时辰 | 文件 | 字节 | std | 采样色 | mode / 机位 |
| --- | --- | --- | --- | --- | --- | --- |
| B-hall-mid | golden/sunset/night | `/tmp/t91-sweep/interior-B-hall-mid-*.png` | 528,884 / 545,258 / 553,209 | 56.96 / 58.91 / 57.47 | 4929 / 6799 / 10023 | interior / `VP-B-hall-mid-interior` |
| B-gate-front | 同上 | `interior-B-gate-front-*.png` | 434,288 / 450,410 / 456,786 | 63.62 / 63.50 / 63.13 | 3131 / 4494 / 6567 | interior / `VP-B-gate-front-interior` |
| C-hall-bed-main | 同上 | `interior-C-hall-bed-main-*.png` | 494,614 / 493,714 / 509,142 | 47.13 / 49.75 / 50.25 | 4930 / 6734 / 6964 | interior / `VP-C-interior` |
| D-court1-hall | 同上 | `interior-D-court1-hall-*.png` | 613,069 / 652,510 / 647,816 | 29.10 / 31.11 / 29.43 | 3805 / 5756 / 6448 | interior / `VP-D-court1-hall-interior` |
| E-court1-hall | 同上 | `interior-E-court1-hall-*.png` | 574,022 / 588,209 / 595,148 | 39.21 / 42.26 / 47.44 | 8053 / 9538 / 10750 | interior / `VP-E-court1-hall-interior` |
| F-gate-south | 同上 | `interior-F-gate-south-*.png` | 229,983 / 232,837 / 250,349 | 58.87 / 55.99 / 64.47 | 2480 / 2783 / 4005 | interior / `VP-F-gate-south-interior` |
| F-garden-hall-north | 同上 | `interior-F-garden-hall-north-*.png` | 420,063 / 432,499 / 435,792 | 68.61 / 68.59 / 64.91 | 3217 / 4782 / 4165 | interior / `VP-F-garden-hall-north-interior` |

**合计 21 张：PASS 21 / FAIL 0**（逐张清单与阈值见 `/tmp/t91-sweep/manifest.json`；跨 7 栋 × 3 时辰 ⇒ 满足"≥5 栋 × ≥2 时辰、≥20 次"）。
说明：该扫描在**同一页面加载**内通过既有 `view:request-mode` / `env:request-time` 请求逐张切换（这正是 t63 需要的"逐栋逐时辰"），因此**完全绕开了"多次页面加载后 headless 白屏"**这一根因；§3.1 则证明了 `--interior` 的一次性命令路径同样可用。

## 4. 回归（断言只增不减）

```text
$ node tests/core-camera.test.mjs → exit=0 · 通过 20 / 20（t91 前 16/16；+4 用例）
   · ?interior=<slotId> 经显式映射解析机位并复用 view:request-mode 进入（store/describe/盒内 三重断言）
   · ?interior=<viewpointId> 直写等价；与 ?view=interior 同时给出时也生效
   · 兼容/失败路径：?view=iso 优先不覆盖（reason=view=iso-precedence）；未知 id → unresolved 且不静默切景
   · 一次性：成功后不再重复请求；无参数时零请求（reason=no-param）
$ node scripts/audit.mjs → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）；主场景 333/350 ✓
```

## 5. 交回：CONTRACTS §11.1 参数表文案（本卡**不改** `docs/CONTRACTS.md`，请 t89 并入）

| 参数 | 取值 | 语义 | 示例 |
| --- | --- | --- | --- |
| `?interior=` | `<slotId>`（建筑 id，如 `B-hall-mid`）或 `<viewpointId>`（`VP-<…>-interior`，也接受 `WK-<…>-interior` 面 id） | **直接进入指定建筑的内景机位**：由唯一相机装置解析（slotId 经 layout 显式映射）、**复用既有 `view:request-mode` 请求**，等价于"UI 点选该建筑 + F"。与 `?focus=` 互不冲突；若同时给出 `?view=<非 interior>`，**显式视角优先**（该参数被忽略）；与 `?ui=0&shot=1`（UI 隐藏）、`?stats=1`（报告 `viewMode=interior`）兼容。 | `index.html?interior=B-hall-mid&ui=0&shot=1` |
| `scripts/shot.mjs --interior=<id>` | 同上 | 逐栋内景出图的一条命令；未显式给 `--view` 时视角收敛为 `interior`，可与 `--preset=all`、`--stats`、`--query=…` 组合 | `node scripts/shot.mjs --interior=C-hall-bed-main --preset=all --out-dir=docs/shots` |

## 6. 未验证项 / 已知限制

1. **`?stats=1` 报告未直接带内景机位 id**（`viewMode` 能反映 `interior`；机位 id 在 `rig.describe().interiorViewpointId`/`interiorQuery`）。若要在 DOM 报告里直接可读，需要 `src/main.js` 加一行（本卡 inScope 之外）——建议随 t14 顺带。
2. **引导重试上限 900 帧**：区域异步注册通常 <1s 完成；若 900 帧内仍解析不到（例如传了未登记的 id），会以 `unresolved:<id>` 结束并 `console.warn`（不静默、不反复请求）。
3. **浏览器侧 21 张扫描用的是"单页面内既有请求路径"**（正是 t66/t63 需要的批量形态）；`--interior` 的一次性命令路径只跑了 B-hall-mid × 3 时辰（3/3 PASS）。若需"每栋一次独立进程加载"的全矩阵，命令已就绪，但**会重新暴露多页加载稳定性问题**（属 headless 环境特性，非本卡引入）。
4. **未改任何判据**：判空阈值、§12 暗区/截断阈值、灯位/阴影预算、UI 隐藏义务均未动；本卡只新增入口与断言。
