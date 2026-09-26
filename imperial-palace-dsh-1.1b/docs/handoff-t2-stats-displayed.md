# handoff · T2.13 上报"实际落屏背景像素值"并归因 Δ=15（t48）

任务：`t48`（repair，attempt 1）· 执行者：core-engineer（attempt_id `51120b73-cf6b-4beb-9c7b-c7900ad001b9`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.7`（§11/§12）⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执

```text
来源：t46 登记的开放项（主理人核算后判定为真问题）：像素法取到的天空 rgb(8,16,34) 占 28%，
      与权威配置清屏色 rgb(23,31,47) 相差约 15（掩码容差 ±6）⇒ 约 23% 真实天空被当内容，
      `fp` 的 26.52% 即此反向失真。要求：先解释 Δ，再决定工具用哪个值。

可写范围（已严格遵守）：src/core/renderer.js、src/core/environment.js、src/main.js、
      tests/core-stats.test.mjs、docs/handoff-t2-stats-displayed.md。
未触碰：src/shared/**、src/kit/**、src/zones/**、scripts/shot.mjs（**未改**，第 1056 行仍读 t47 的
      backgroundColorHex，向后兼容）、docs/CONTRACTS.md。
```

---

## 1. Δ 的归因结论（本任务核心）

**结论：实机落屏的"背景"根本不是 `scene.background`（配置清屏色），而是天空球网格的顶点色渐变；
且该渐变材质 `toneMapped:false`，不经色调映射/曝光。** 配置清屏色被半径 4200、`frustumCulled=false` 的天空球
**完全覆盖**，因此它只占画面的 ≈0.2%（剩余匹配是雾色附近像素的巧合），而**天空渐变带解释 ≈70–79% 的画面**。

**逐项排查（全部有实测数字）**：

| 假设 | 排查方式 | 结论 |
| --- | --- | --- |
| ① 色调映射（ACES + exposure）改变了清屏色 | 用 three 着色器同式复算 `applyOutputChain()`：`#171f2f`(linear 0.0283) 经 ACES(exp 1.35) → **rgb(8,25,35)** | **不是**（若清屏色可见，应看到 (8,25,35)，而实测背景像素是 (13,22,41)/(14,23,42)，落在天空原始渐变内） |
| ② `OutputPass` / 颜色空间转换 | 复算链：`RenderPass → Bloom → OutputPass`（ACES + sRGB OETF） | 是**管线存在**的环节，但清屏色不经过它可见（原因见 ④） |
| ③ Bloom / 后处理 | night 清屏色极暗、bloom 阈值 0.72 ⇒ 背景不产生 bloom；golden 天空带命中率 69.94%（几乎不受 bloom 影响） | 影响 < ±2，非 Δ 主因 |
| ④ **背景实为 skybox/渐变而非 clearing color** | **像素级命中统计**（1440×900，±2 容差，自写 PNG 解码）：night 清屏色命中 **0.24%**、天空渐变带 **79.18%**、雾 1.11%；golden 清屏色命中 **0.00%**、天空渐变带 **69.94%** | **✅ 这就是 Δ 的根因** |

**Δ 的量化（复算可查）**：

| 预设 | 配置清屏色 | 落屏带（天空渐变） | Δ(config vs top) | Δ(config vs horizon) | maxAbs |
| --- | --- | --- | --- | --- | --- |
| goldenHour | `#c7cfd5` (199,207,213) | `#9fc4e8` (159,196,232) ↔ `#d9d5ca` (217,213,202) | 40 | 18 | **40** |
| sunset | `#d29a65` (210,154,101) | `#e29a5c` (226,154,92) ↔ `#c99a6a` (201,154,106) | 16 | 9 | **16** |
| moonlitNight | `#171f2f` (23,31,47) | `#0d1526` (13,21,38) ↔ `#1b2333` (27,35,51) | 10 | 4 | **10** |

**t46 为什么把清屏色"匹配"到 5–7%？** 因为夜间**雾色 `#1b2333` = (27,35,51) 与清屏色 (23,31,47) 只差 4**，
在容差 7–8 下必然互相命中 —— 那 5–7% 是**雾/近地平像素**，不是真背景。这是"Δ=15"叙事的准确来源。

**端到端验证（LIVE，真实浏览器 + 工具自己的像素法读数）**：

```text
goldenHour:  工具像素法背景 rgb(212,211,207) → 到落屏带 **2** / 到配置清屏色 **13**
moonlitNight: 工具像素法背景 rgb(14,23,42)   → 到落屏带 **2** / 到配置清屏色 **9**
```
⇒ 用落屏带（±2）匹配命中；用配置清屏色匹配偏差 9–13（> ±6 容差）⇒ **配置色不可直接用作背景引用**。

**是否渲染链缺陷？** 不是缺陷，是**语义错配**：`scene.background` 只作兜底（本场景被天空全覆盖），
而设计关心的"天空颜色"由天空渐变承载。**本卡未改任何渲染行为**（不给修复，也不需要修复）；
若后续希望"清屏色与天空一致"，那属于美术/预设决策（把 `scene.background` 设为天空渐变中间值），可另行派单。

---

## 2. 新增字段（配置值 vs 落屏值并列，各带语义）

### 2.1 `environment.describe().background`（t45 字段保留，新增 t48 段落）

| 字段 | 含义 / 取值示例（moonlitNight） |
| --- | --- |
| `configured.{hex,srgb255,linear,semantic}` | **配置清屏色**：`#171f2f` / (23,31,47)；semantic = "配置清屏色（scene.background）" |
| `displayed.{kind,topHex,horizonHex,topSrgb255,horizonSrgb255,toneMapped,semantic}` | **实际落屏背景**：`kind='sky-gradient'`、`#0d1526`→`#1b2333`、`toneMapped:false`；semantic = "实际落屏背景（天空网格渐变，不经色调映射/曝光）" |
| `delta.{configVsSkyTop,configVsSkyHorizon,maxAbs,note}` | Δ 量化：`10 / 4 / 10` + 口径说明 |
| `candidates[]` | 四条候选（含语义与备注）：`clear-color(configured)`、`sky-top(displayed)`、`sky-horizon(displayed)`、`fog` |
| `semantics.{configured,displayed,matching}` | 三句话口径：哪个是设计值、哪个是实机落屏、像素判定该用哪个 |

### 2.2 `renderSystem`（`src/core/renderer.js`）

| 新增 | 说明 |
| --- | --- |
| `describeOutputChain()` | `{pass:'RenderPass → UnrealBloomPass → OutputPass（composer）', toneMapping:'ACESFilmic', exposure, outputColorSpace:'srgb', bloom, note}` |
| `applyOutputChain(linear, {toneMapping, exposure})` | **纯函数**复算 three 的输出链（ACES/Reinhard/Cineon/Neutral/Linear + sRGB OETF），供"配置值经管线会变成什么"的复核与测试 |

### 2.3 `?stats=1` 报告（`src/main.js` `compactReport()`，字段数 41 → **54**）

新增：`backgroundConfiguredHex` / `backgroundConfiguredSemantic` / `backgroundDisplayedKind` /
`backgroundDisplayedTopHex` / `backgroundDisplayedHorizonHex` / `backgroundDisplayedTopSrgb255` /
`backgroundDisplayedHorizonSrgb255` / `backgroundDisplayedToneMapped` / `backgroundDeltaMaxAbs` /
`backgroundDeltaConfigVsSkyTop` / `backgroundDeltaConfigVsSkyHorizon` / `backgroundOutputChain` / `backgroundCandidates`。
**t47 的 8 个字段原样保留**（`backgroundColorHex` 等）⇒ 下游 t46 的读取不破。

浏览器实读（`node scripts/shot.mjs --view=oblique --preset=night --out-dir=/tmp/t48-dom-night`，shot.mjs 从
`<pre id="palace-stats-json">` 解析）：

```json
{"preset":"moonlitNight","backgroundColorHex":"#171f2f","backgroundConfiguredHex":"#171f2f",
 "backgroundDisplayedKind":"sky-gradient","backgroundDisplayedTopHex":"#0d1526","backgroundDisplayedHorizonHex":"#1b2333",
 "backgroundDisplayedTopSrgb255":[13,21,38],"backgroundDeltaMaxAbs":10,
 "backgroundDeltaConfigVsSkyTop":10,"backgroundDeltaConfigVsSkyHorizon":4,"backgroundDisplayedToneMapped":false,
 "backgroundOutputChain":{"toneMapping":"ACESFilmic","exposure":1.35,"outputColorSpace":"srgb","bloom":true},
 "backgroundCandidates":[... 4 条 ...]}
```

---

## 3. 证据

### 3.1 渲染零变化

| 项 | before（t47 记录） | after（t48，本卡） |
| --- | --- | --- |
| `golden oblique` 内容均值/暗区/截断 | 0.2854 / 2.16% / 0.00% | **0.2854 / 2.16% / 0.00%**（逐值相同） |
| `night oblique` 内容均值/暗区/截断 | 0.1055 / 3.10% / 0.00% | **0.1055 / 3.10% / 0.00%**（逐值相同） |
| `node scripts/audit.mjs` | 293/350、293,841 三角面 | **293/350、293,841 三角面**（逐值相同） |

新增字段全部是 `compactReport()` 的只读派生量（`env.background.*` / `renderSystem.describeOutputChain()`），不触碰场景、灯光、天空、雾、曝光或后处理参数。

### 3.2 像素级归因（自写 PNG 解码，正确按 IHDR colorType 取 bpp=3）

```text
night  (1440x900)  ±2 命中：清屏色 #171f2f = 0.24% | 天空渐变带 #0d1526→#1b2333 = 79.18% | 雾 = 1.11%
                   采样：左上 (13,22,41) 上中 (13,23,42) 地平线附近 (14,23,43)
golden (1440x900)  ±2 命中：清屏色 #c7cfd5 = 0.00% | 天空渐变带 #9fc4e8→#d9d5ca = 69.94% | 雾 = 0.00%
                   采样：左上 (211,210,207) 上中 (211,211,207) 地平线附近 (213,211,206)
```

### 3.3 verify

```text
$ node tests/core-stats.test.mjs
 通过 15 / 15，skip 2   exit=0     （skip 2 = 两条 LIVE 用例，未设 CORE_STATS_LIVE；
                                    断言数 10 → 15，只增不减）

$ CORE_STATS_LIVE=1 node tests/core-stats.test.mjs
 · LIVE goldenHour:  像素 rgb(212,211,207) → 到落屏带 2 / 到配置色 13 ⇒ 用落屏带匹配
 · LIVE moonlitNight: 像素 rgb(14,23,42)   → 到落屏带 2 / 到配置色 9  ⇒ 用落屏带匹配
 通过 15 / 15   exit=0             （无 skip）

$ node scripts/audit.mjs
 主场景绘制调用 293/350 ✓ · 可见三角面 293,841/1,500,000 ✓ · 结论：全部预算与契约检查通过   exit=0
```

回归用例（新增 5 条，全部硬断言 / 2 条 LIVE）：
① 配置值 vs 落屏值并列存在且各带语义（`configured.semantic` / `displayed.semantic`）；
② Δ 可复核（`delta.*` 必须等于由 `configured.srgb255` 与 `displayed.{top,horizon}Srgb255` 复算的逐通道最大差，且 `maxAbs>0`）；
③ 落屏带 == t45 的天空端点，候选表覆盖四类；④ 切预设后配置值**与**落屏值同步变化；
⑤ LIVE：工具像素法背景落在落屏带内（≤3）且到配置色更远 ⇒ 用落屏带匹配。

---

## 4. 给工具侧的消费建议（供 t49 接入）

> **结论：背景引用请改用"落屏带"（`backgroundDisplayedTopHex` ↔ `backgroundDisplayedHorizonHex`），不要用清屏色。**

1. **判定规则（推荐）**：`min_t |pixel − lerp(top, horizon, t)| ≤ 2`（逐通道最大差）→ 判为背景/天空；
   落屏带之外的暗像素才是真内容。
2. **清屏色（`backgroundColorHex`）只作兜底**：仅当场景**没有**天空网格时才作为背景引用；
   本场景它的实测命中率 0.00–0.24%，用它匹配会把 23% 的天空算成内容（正是 `fp` 26.52% 的来源）。
3. **雾要单独处理**：`fogColorHex` 可能与清屏色接近（夜间 Δmax=4）⇒ 旧口径"清屏色 ±7"会误吞雾像素；
   建议顺序：先判落屏带 → 再判雾（`|pixel − fog| ≤ 2`，且只在 `fogNear..fogFar` 深度范围内适用）→ 其余按几何/材质。
4. **命令示例（t49 接入后）**：

```bash
# 从报告取落屏带（或先 dump DOM 再回填）
node scripts/shot.mjs --view=oblique --preset=night \
  --background-band=#0d1526,#1b2333 --fog=#1b2333 --out-dir=/tmp/shots
```
   （若 t49 更希望单一颜色：建议取**渐变带的中值** `lerp(top,horizon,0.5)`，本卡已在 `candidates` 中给出两端色，
   中值可由工具一行算出；直接给单色会让夜间误差重新变大 —— 夜间带跨 Δ≈14。）
5. **口径提醒**：`backgroundDisplayedToneMapped=false` ⇒ 落屏值**不需要**做色调映射反解；
   `backgroundOutputChain` 只用于解释"若清屏色可见会是什么值"（诊断用）。

---

## 5. 未验证项 / 已知限制

1. **天空占比未由 core 直接上报**：仍建议工具侧统计（它本就要解码 PNG）；本卡已把判定所需的两端色与 Δ 备齐。
2. **天空球覆盖假设**是几何事实（半径 4200、`frustumCulled=false`、相机在内），未做逐视锥证明；若将来出现"天空未覆盖"的视角（例如相机移到球外），清屏色会可见，此时应回落到 `backgroundColorHex`。
3. **`toneMapped:false` 在 composer 下生效**已由像素实测反证（落屏值＝原始端点色，非 ACES 复算值），但未逐 shader 断点验证（属渲染器细节）。
4. **Δ 的三组数（40/16/10）**是目前三时辰预设的值；任何预设/天空色调整都会改变它——测试已断言 Δ 为复算值（改预设即同步）。
5. **未跑 dusk（sunset）的 LIVE 像素验证**（只跑了 golden/night）；sunset 的 Δ=16 已由复算与快模式断言覆盖，若需实拍可再加一组。
6. **观察**：`scripts/shot.mjs` 在我执行期间被 t46 并发编辑过（曾出现瞬时 `ReferenceError`），本卡未改该文件；t46 当前仍读 `backgroundColorHex`，因此**在 t49 改用落屏带之前，掩码失真仍存在**（`fp` 26.52% 属该口径产物）。

---

## 6. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§11 补充：`?stats=1` 必须并列上报"配置值 / 落屏值"**
> 1. 字段：`backgroundConfiguredHex`（清屏色，设计值）与 `backgroundDisplayed{Kind,TopHex,HorizonHex,TopSrgb255,HorizonSrgb255,ToneMapped}`（落屏背景，天空渐变带），
>    以及 `backgroundDelta{MaxAbs,ConfigVsSkyTop,ConfigVsSkyHorizon}`、`backgroundOutputChain`、`backgroundCandidates`。
> 2. **判据工具必须以"落屏值"为背景引用**（渐变带、±2 容差），清屏色仅在无天空场景兜底；雾必须单独判定。
> 3. 上报**只读**：不得为测量方便改动清屏色/天空/雾/曝光；落屏值必须可由 `applyOutputChain()` 或像素统计复核。
