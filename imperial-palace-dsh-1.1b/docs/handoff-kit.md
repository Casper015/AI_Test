<!-- 归档文件：正文由 t18（foundation-lead）从工作区逐字搬运；注释标记之外为归档说明与清单 -->
# t3 · 建筑构件库、材质体系、LOD/合批与资源许可登记 — 回执（发布包归档版）

> **归档说明**（由 t18 / foundation-lead 添加，**不属于** t3 原文）
>
> | 项目 | 值 |
> | --- | --- |
> | 来源文件 | `work/handoff-t3.md` |
> | 来源 sha256 | `408c4900b167d8b5b4636de09540bb227329fc7e5b307bf8b2c4c670a62b7467` |
> | 来源体积 | 172 行 / 14720 字节（源文件 mtime 2026-09-26 04:13:57） |
> | 归属任务 | `t3`（T3 建筑构件库、材质体系、LOD/合批与资源许可登记） |
> | 执行者 | `kit-engineer` |
> | 搬运人 / 时间 | `foundation-lead`（任务 t18）/ 2026-09-26 04:16:42 |
> | 归档原因 | `work/` 按计划 §1.2 **不进入发布包**（`scripts/build.mjs` 只复制 `index.html` / `src` / `public`），而计划 §8.3 要求"所有 Agent 有开工与交付回执"可查；t3 当时因 inScope 路径限制只能写在 `work/` |
> | 处理方式 | 下方整行注释标记之间的正文**逐字复制**，未删减、未改写、未美化：实测输出、未验证项、裁定引用与风险说明全部保留 |
> | 机械核验 | `LC_ALL=C awk '$0=="<!-- BEGIN VERBATIM COPY -->"{f=1;next} $0=="<!-- END VERBATIM COPY -->"{f=0} f' docs/handoff-kit.md \| diff - work/handoff-t3.md` → 无输出即完全一致（按整行相等匹配，故本表内的提及不会干扰） |
> | 维护提示 | 若 t3 之后更新 `work/handoff-t3.md`（sha256 变化），须重新搬运并更新本表；本文件不自动同步 |
>
> **未验证项与已知限制以正文 §2.6 为准，不得当作已验证**（浏览器整城性能、KTX2/WebP 压缩纹理、夜景可读性等）。

<!-- BEGIN VERBATIM COPY -->
# t3 · 建筑构件库、材质体系、LOD/合批与资源许可登记 — 回执

> **存放位置说明**：本回执放在 `work/`（CONTRACTS §2「work/** 各任务，中间产物，不进入发布包」），
> 因为 t3 任务卡的 inScope 只有 `src/kit/`、`tests/kit.test.mjs`、`docs/ASSET_CREDITS.md`、`public/assets/`、`work/`，
> `docs/handoff-*.md` 不在其中（任务状态机在完成时会把未声明的改动路径判为越界，故不写 docs/）。
> 若主理人希望归档到 `docs/handoffs/`，请由 docs/ 归属任务（t1）搬运，内容可直接复制。


> 归属任务：`t3 kit-engineer`（构件工厂 / 材质 / LOD 合批 / 资源登记 / 测试 ctx harness）
> 依赖（只读，不修改）：`src/shared/config.js`（CONFIG_VERSION **1.0.2**）、`src/shared/layout.js`（LAYOUT_VERSION 1.0.0）、
> `docs/CONTRACTS.md`（**v1.0.3**）、`docs/STYLE_GUIDE.md`（STYLE_BASELINE v1.0.0）、`imperial-palace-plan.md` §3.1 §4.2 §5.1 §8.2
>
> **版本戳同步（t22，2026-09-26；t22 attempt 2 补 KIT_VERSION）**：本文件的接口版本已同步到当前有效组合 `CONTRACTS v1.0.3` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ **`KIT_VERSION 1.0.1`**（唯一真相源见 `docs/CONTRACTS.md` 头部版本对应表；kit 行为变更清单见 `docs/handoff-t3-version.md`）。
> 本文件正文中出现的「CONFIG_VERSION 1.0.0 / CONTRACTS v1.0.0」等字样是 t3 开工当时（开工回执）的历史记录，其后的现状以本行与 `docs/CONTRACTS.md` 为准。

---

## 1. 开工回执（2026-09-26）

```text
任务 ID / Agent：t3 / kit-engineer
已读计划、风格与接口版本：imperial-palace-plan.md（§2.3 §3.1 §3.2 §4.1 §4.2 §5.1 §6.1 §8.2 §8.3）
  CONTRACTS v1.0.0（当时）· STYLE_BASELINE v1.0.0 · CONFIG_VERSION 1.0.0（当时）· LAYOUT_VERSION 1.0.0 · three r169（本地 vendor）
  ※ 现状（t22 同步）：CONTRACTS v1.0.3 · CONFIG_VERSION 1.0.2 · LAYOUT_VERSION 1.0.0 · STYLE_BASELINE v1.0.0
可写文件：src/kit/**、tests/kit.test.mjs、tests/harness.mjs（主理人在本人角色卡中指派）、
  docs/ASSET_CREDITS.md、public/assets/**、work/**、docs/handoff-t3.md
只读依赖：src/shared/**、public/vendor/**、src/zones/**、src/core/**、src/main.js、index.html、tests/run.mjs
区域边界 / 连接 ID / 使用的建筑 kit 与材质：B/C/D/E/F 全部槽位（SLOTS 67）通过 ctx.kit 消费本库；
  颜色一律走 config.COLOR_ROLES → COLORS/COLORS_DERIVED；模数一律走 config.MODULES/GRADES/ROOF_TYPES
要消费和返回的接口：ctx.kit（§3.4 冻结名称）与 ctx.assets（§3.1）；返回 THREE.Group / THREE.LOD（含 userData.kit）
验收方式 / 性能预算：tests/kit.test.mjs + tests/run.mjs；绘制调用 ≤350（分区 B70/C50/D40/E40/F80+70 保留）、
  可见三角 ≤150 万（单建筑 ≤2.4 万）、纹理 1K–2K、无 npm install、无必需网络资源
依赖齐备情况 / 发现的冲突：
  1) 【已报告主理人 · 已裁定并落地】layout 槽位 F-garden-pavilion-main = {kind:'pavilion', grade:2, roofType:'pyramidal'}，
     而当时 config.GRADES[2].roofTypes = ['doubleEaveHip','hip','gableHip'] 不含 pyramidal —— 二者冲突。
     **现状（实现与 CONTRACTS §4.2 / STYLE_GUIDE §3 一致）：屋顶类型与装饰等级失配一律抛错，没有任何放行开关**
     （不存在 `strictRoofGrade` 选项；`roofType` 必须是 `config.ROOF_TYPES` 的键且属于 `config.GRADES[grade].roofTypes`，
     否则 `kit.<factory>()` 直接抛错）。主理人裁定采用方案 (a)：foundation-lead 已交付 T1.1
     （`CONFIG_VERSION 1.0.1` 起 `GRADES[2].roofTypes` 增补 `pyramidal`，见 `docs/handoff-config-1.0.1.md`），
     因此该槽位现已合法；kit 自测对 67 槽位做全量校验：**违规 0、风格诊断 0**（`tests/kit.test.mjs` §11）。
     非致命交叉校验（例如 totalHeight 与 layout 估值的偏差）仍走 `kit.diagnostics`，不抛错。
  2) layout 槽位 w/d 是**世界** X/Z 占地尺寸（CONTRACTS §4），而 kit 本地轴以「面阔沿本地 X、正立面朝本地 -Z」建模，
     故本库按 rotationYDeg 做 localW/localD 换算（facing east/west 时 localW=layout.d）。
  3) layout 槽位 eaveHeight 与 kit 推导完全一致（terraceH + MODULES.eaveHeight × GRADES[g].eaveHeightFactor）；
     但 totalHeight 与 kit 的举架公式（檐口半深 × MODULES.roofSlope × riseRatio 归一）存在 10%–40% 差异
     （layout.totalHeight 在 CONTRACTS §4 中标注为"非硬约束"）。kit 以 config 令牌为唯一依据，并允许 params.roofRise 覆盖。
  4) work/ 与 docs/ 归各任务；按主理人补充裁定使用 docs/handoff-t3.md（不写 docs/handoffs/）。
```

---

## 2. 交付回执（t3 kit-engineer · attempt 1 · 2026-09-26）

### 2.1 文件清单（全部在 ROOT 内，未触碰 src/shared/**、src/core/**、src/zones/**、index.html、public/vendor/**）

| 路径 | 行数 | 说明 |
| --- | --- | --- |
| `src/kit/three-ref.js` | 22 | 全库唯一的 three 解析点；浏览器与 Node 解析到**同一个物理文件**（import map 目标一致） |
| `src/kit/tokens.js` | 335 | 令牌解析层（颜色/模数/等级/屋顶/质量档）、参数规范化与校验、`PROPORTIONS` 形制结构比例、举架计划 |
| `src/kit/materials.js` | 432 | 23 个共享材质（9 个 `config.MATERIALS` + 14 个派生）+ 6 张程序化 `DataTexture` + 缓存 + dispose 边界 |
| `src/kit/merge.js` | 663 | 几何合批 `mergeGeometries` / 整区合批 `mergeZone` / 材质合批 `mergeByMaterial` / LOD / 实例化 / 去内部面 / 统计 |
| `src/kit/geometry.js` | 795 | 基元 + 屋面曲面（庑殿/攒尖/硬山/歇山/重檐）+ 屋身 + 台基 + 栏杆 + 台阶 |
| `src/kit/props.js` | 276 | 树木/山石/宫灯/铜器/照壁/水面/铺地 |
| `src/kit/buildings.js` | 1006 | 11 个构件工厂 + 摆件工厂装配 + LOD/摆位/metrics |
| `src/kit/assets.js` | 142 | 资产登记与运行时管理器（`get/load/stats/used`，9 字段校验） |
| `src/kit/index.js` | 230 | `createKit(ctx)` 入口、`kit.materials`/`kit.tokens`/`stats`/`dispose`/`disposeObject` |
| `tests/kit.test.mjs` | 827 | 496 项机器校验（本任务唯一测试文件） |
| `docs/ASSET_CREDITS.md` | — | 资源与许可登记（明确声明**无第三方素材**，9 字段表头 + 程序化条目总览 + 未验证项） |
| `public/assets/README.md` | — | 说明该目录有意为空（程序化路线）；`public/assets/` 内无任何运行时资源 |
| `work/kit-sample.html` + `work/shots/t3-kit-sample-*.png` | — | 计划 §3.2 的构件库样板（三时辰 + 正殿近景 + 细部），**不进入发布包** |

### 2.2 接口（对区域作者与核心）

```js
import { createKit } from '../kit/index.js';
const kit = createKit({ THREE: ctx.THREE, config: ctx.config, quality: ctx.quality });
ctx.kit = kit;   // core 组装 ctx 时注入（t2 的 tests/harness.mjs 已支持 kit 注入）
kit.hall/gateHall/sideHall/pavilion/cornerTower/courtyardGate/wall/corridor/terrace/stairs/bridge(params)
kit.tree/rockery/lantern/railing/bronze/screenWall/water/paving(params)
kit.materials[role|materialId]        // 21 个 COLOR_ROLES 角色 + 9 个 MATERIALS id + 14 个派生 id
kit.mergeZone(root) → { root, stats } // 推荐：整区跨建筑合批（LOD 逐档）
kit.mergeByMaterial(root) / kit.pruneInterior(root) / kit.instance(...) / kit.lod(...) / kit.countDrawCalls(...)
kit.stats() / kit.budgetFor('B') / kit.disposeObject(root) / kit.dispose()
```

`params` 至少含 `id, name, w, d, bays, terraceH, roofType, grade, facing|rotationYDeg, quality`，另支持
`lod: 'auto'|'near'|'mid'|'far'|'none'`、`baseY`（台基顶标高）、`door:{width,height,openFraction}`、`roofRise`、
`detail`、`rngSeed`、`bounds/y0/y1/tiers`（terrace）、`from/to/openings`（wall/corridor/bridge）。
返回 **THREE.Group 或 THREE.LOD**，其 `userData.kit = { id, kind, name, detail, params, metrics, worldBounds, diagnostics, version }`。

### 2.3 实测命令与真实输出（逐字粘贴）

```text
$ node tests/kit.test.mjs
 · 分区 B: 247 → 38 draw calls / 44468 tri
 · 分区 C: 245 → 38 draw calls / 36228 tri
 · 分区 D: 262 → 29 draw calls / 31880 tri
 · 分区 E: 279 → 29 draw calls / 33892 tri
 · 分区 F: 302 → 38 draw calls / 45952 tri
 · 去内部面（测试殿）：4716 → 1149 三角形
 · 全 67 槽：近景三角面 192420，中景 113632，单栋最大 11652
 · totalHeight 偏差（kit 举架 vs layout 估值）：中位 26.7%，最大 38.6% (E-court1-hall)
 通过 496 / 496，失败 0
exit=0

$ node tests/run.mjs
 PASS  tests/core.test.mjs  156ms
 PASS  tests/kit.test.mjs  971ms
 PASS  tests/layout.test.mjs  86ms
 PASS  tests/zones.test.mjs  128ms
 通过 4 / 4，失败 0，总耗时 1341ms
exit=0

$ node work/shot.mjs "http://127.0.0.1:8123/work/kit-sample.html?preset=goldenHour" work/shots/t3-kit-sample-golden.png
 179374 bytes written to file …/work/shots/t3-kit-sample-golden.png
   （页面 HUD 实测：绘制调用 70（合批前 204）· 三角面 24832 · 材质 23 · 贴图 6@1024px · three r169）
$ … "?preset=sunset"        → work/shots/t3-kit-sample-sunset.png        171111 bytes
$ … "?preset=moonlitNight"  → work/shots/t3-kit-sample-moonlitNight.png  137444 bytes
$ … "&view=hall"            → work/shots/t3-kit-sample-hall.png          568973 bytes（正殿重檐庑殿近景）
$ … "&view=detail"          → work/shots/t3-kit-sample-detail.png        937970 bytes（斗栱/飞檐/台基细部）
```

额外交叉校验（已写入测试，非人工）：

- **与 layout 的 `eaveHeight` 逐槽位一致**：67/67 槽位 `|kit.eaveHeightAbsolute − layout.eaveHeight| ≤ 6mm`（layout 2 位小数取整误差）；
- **整城预算**：67 槽合批 `1309 → 37` 次绘制调用、近景三角面 192,420（预算 ≤350 / ≤150 万）；全城远景机位 6 次绘制调用；
- **与 t2 的 Node ctx harness 集成**（未改其文件）：`makeTestCtx({zoneId:'B', kit})` 中 `ctx.kit === kit`、`ctx.THREE === kit.THREE`（同一份 three）。

### 2.4 关键设计决定（供评审与后续任务）

1. **`baseY` 语义 = 台基顶（柱础标高）**，台基占 `[baseY−terraceH, baseY]`，组原点在 `baseY−terraceH`。这是与 layout 对齐的关键：
   `layout.SLOTS.eaveHeight = baseY + MODULES.eaveHeight × GRADES[grade].eaveHeightFactor`（67 槽吻合）。
2. **`w/d` 是含台明的世界 X/Z 占地**；本地轴"面阔沿 X、正立面朝 −Z"；facing east/west 时按 `rotationYDeg` 换算
   （`localW = d, localD = w`），否则 54m 进深的侧殿会算出 19m 的短脊。
3. **举架公式**：`rise = (进深/2 + 出檐) × MODULES.roofSlope × min(PROPORTIONS.roofRiseCap, ROOF_TYPES[*].riseRatio / MODULES.ridgeHeightRatio)
   + (bays−1) × MODULES.roofRisePerBay × PROPORTIONS.perBayRise`。与 `layout.totalHeight`（估值）偏差中位 26.7%、最大 38.6%；
   差异**全部来自这一项**：layout 估值等效坡度约 0.32（"三举"），kit 严格用冻结令牌 `MODULES.roofSlope = 0.55`（"五举"，与明清官式一致）。
   按主理人裁定：`totalHeight` 不作取景/面板权威，消费方用实测包围盒 `userData.kit.worldBounds`。
4. **重檐做法**：下檐口 = 台基顶 + `MODULES.eaveHeight×等级因子`；下层腰檐升高被 `PROPORTIONS.doubleEaveApronMaxRise` 限制在
   上层屋身高的 85% 内（否则腰檐穿出上层檐口）；上层屋身平面 = 下层 72%（`doubleEaveUpperBody`）。
5. **垂脊沿凹曲曲面分段生成**（与屋面共用 `roofSurfacePoint` 公式），不是"檐角→脊端"的架空直线（样板首轮目视发现的缺陷，已修）。
6. **歇山山花**是底边抬到 `rise×0.42` 的小三角竖板 + 博风板；硬山山墙与檐端齐平（否则会穿出前后坡）。
7. **合批推荐用法**：工厂默认返回 `THREE.LOD`（三档，距离 = `BUDGET.lod.nearDistance/midDistance × QUALITY[*].lodBias`），
   区域最后调一次 `kit.mergeZone(root)` 完成"跨建筑 × 逐档 × 同材质同部位"合批。

### 2.5 逐条验收对照

| 验收条目 | 结果 | 证据 |
| --- | --- | --- |
| `createKit(ctx)` 与全部构件/摆件工厂、参数含开间/尺寸/台基高/朝向/屋顶类型/等级/质量档 | 通过 | §4（11 + 8 工厂、10 必需参数、正反例抛错） |
| 形制一致性机器可检：庑殿长正脊+四面坡（禁尖顶）、同类共享坡度/飞檐/柱径/檐高/开间、主殿重檐庑殿 | 通过 | §5（法线象限、脊长 ≥0.3×面阔、顶部平台跨距、攒尖顶点、重檐双檐口）、§6（令牌级 + 几何实测） |
| 识别特征齐备；近中远 LOD 可用；实例化与去内部面 | 通过 | §7（16 构件 + 材质映射 + 色彩比对）、§8（单调下降、远景 ≤35%、轮廓 ≤12%、切档）、§9、§10 |
| 材质全部 config 令牌驱动、共享缓存、dispose 只释放自有资源 | 通过 | §1（零色值字面量）、§2（21 角色 + 材质；鎏金唯一高金属度；统一旧化）、§3（dispose 边界） |
| 资产登记与许可（9 字段；无第三方则声明；一份资源只留一份） | 通过 | §12（`validate()` 全绿、`thirdParty=0`、`networkRequests=0`、去重、ASSET_CREDITS 声明、`public/assets/` 空） |
| `tests/kit.test.mjs` Node 内通过（包围盒/屋顶/LOD/合批/材质） | 通过 | 496/496 + 67 槽扫描（§11） |
| 无 npm install、无必需网络资源 | 通过 | 仅本地 vendored three；源码扫描禁 `http(s)://`；`package.json` 未改 |

### 2.5b T1.1 落地后的状态（2026-09-26 复核）

foundation-lead 已按主理人裁定 (a) 交付 `docs/handoff-config-1.0.1.md`：`CONFIG_VERSION 1.0.1`，
`GRADES[2].roofTypes = doubleEaveHip | hip | gableHip | pyramidal`。因此：

- 我测试里的"待修告警位"已自动切换到**严格分支**：67/67 槽位构建成功、屋顶/等级违规 **0**、风格诊断 **0**（不再有 `roof-grade-mismatch`）；
- kit 仍保持"违规即抛错"（无开关），F-garden-pavilion-main（grade2 + pyramidal）现在合法构建；
- `layout.js` 数值零改动，`LAYOUT_VERSION` 仍 1.0.0。

### 2.6 未验证 / 已知限制（不得当作已验证）

1. **浏览器内整城性能未测**：绘制调用/三角面是 Node 场景侧统计；真实 FPS、显存、阴影/后处理整帧成本需 t13 在 1440×900 实测
   （本机 headless 走 SwiftShader 软渲染，FPS 无参考价值）。
2. **KTX2/WebP 压缩纹理未实现**：贴图为未压缩 RGBA `DataTexture`（1K–2K，6 张，medium 档约 25MB），
   `config.BUDGET.textures.useCompressedFormat` 尚未消费；是否引入解码器由 t2/t13 实测后决定。
3. **`disposeObject` 只覆盖 kit 自建几何**：区域自建几何/材质仍由区域自己释放（契约 §3.3 归属不变）。
4. **夜景可读性观察**（非缺陷，供裁定）：样板在冻结预设 `moonlitNight`（sunIntensity 0.75 / ambient 0.36 / exposure 1.18）下偏暗；
   样板已按 `config.LIGHTING.lamps`（medium 档 4 盏、不投影）加宫灯点光，仍偏暗。真实场景另有 bloom 与 49 个灯位锚点，
   请 t2 环境系统接入后复测；若要提亮须在 `config.LIGHTING.presets` 内改并递增 `CONFIG_VERSION`（本任务无权改）。
5. **`tests/harness.mjs` 不是我创建的**：该文件已由 core-engineer（t2）交付（Node 模块解析钩子 + `makeTestCtx`，kit 走灰盒替身且支持注入）。
   我**未修改它**，只做了集成验证。若主理人仍要求由我接管，需先明确 t2 的归属变更，否则会出现双负责人。
6. **`work/` 不进入发布包**：样板页与截图仅作风格比对与目视验收；发布包由 `scripts/build.mjs` 决定（只复制 `index.html`/`src`/`public`）。

<!-- END VERBATIM COPY -->

---

## 附：发布包内 §8.3「开工与交付回执」清单（t18 归档时快照，供 t14 收口核对）

> 计划 §8.3 要求"所有 Agent 有开工与交付回执，使用同一风格与接口版本"。
> 本清单只统计**发布包内**（`docs/`）可查的回执；`work/**` 不进入发布包，故不计入。
> 状态为 t18 归档（2026-09-26 04:16:42）时的快照，t14 收口时请按当时实际文件重新核对。

| 任务 | 角色 / 交付 | 发布包内回执路径 | 归档时状态 |
| --- | --- | --- | --- |
| t1 | 主 Agent 准备：骨架、`src/shared/**`、契约、测试与构建脚手架 | [`docs/handoffs/t1.md`](handoffs/t1.md)（开工 + 交付回执） | ✅ 已产出 |
| t2 | 核心引擎、唯一相机装置、统一环境、全城灰盒 | [`docs/handoffs/t2.md`](handoffs/t2.md) | ✅ 已产出 |
| t3 | 建筑构件库、材质、LOD/合批、资源许可登记 | **本文件** `docs/handoff-kit.md`（源：`work/handoff-t3.md`，正文见上） | ✅ 已归档（t18） |
| t6 | B 中轴前朝（zone-forecourt） | `docs/handoffs/t6.md` | ⏳ 待产出 |
| t7 | C 后宫（zone-inner） | `docs/handoffs/t7.md` | ⏳ 待产出 |
| t8 | F 御花园与边界（zone-garden） | `docs/handoffs/t8.md` | ⏳ 待产出 |
| t9 | G 交互与 UI（ui-engineer） | `docs/handoffs/t9.md` | ⏳ 待产出 |
| t10 | D 西侧宫苑（zone-forecourt） | `docs/handoffs/t10.md` | ⏳ 待产出 |
| t11 | E 东侧宫苑（zone-inner） | `docs/handoffs/t11.md` | ⏳ 待产出 |
| t12 | V1 G2 场景完整性与跨区连接独立验证（verifier） | `docs/handoffs/t12.md` 或 verifier 报告文件 | ⏳ 待产出 |
| t13 | V2 G3/G4 八视角、第一人称走查与性能验收（verifier） | `docs/handoffs/t13.md` 或 verifier 报告文件 | ⏳ 待产出 |
| t14 | T10 整城集成与发布收口（core-engineer） | `docs/handoffs/t14.md` | ⏳ 待产出 |
| t15 | T1.1 CONFIG 1.0.1 修订（foundation-lead） | [`docs/handoff-config-1.0.1.md`](handoff-config-1.0.1.md) | ✅ 已产出 |
| t16 | T1.2 README 同步（foundation-lead） | 无独立回执文件；实证写入 [`README.md`](../README.md) + 任务台账 | ✅ 已产出（以 README 为准） |
| t18 | T3.1 归档 kit 回执（foundation-lead） | 本文件 | ✅ 已产出 |

**模板**：[`docs/handoffs/TEMPLATE.md`](handoffs/TEMPLATE.md)（开工回执 + 交付回执字段）。
**版本要求**：回执须写明当次使用的 `CONTRACTS` / `CONFIG_VERSION` / `LAYOUT_VERSION` / `STYLE_BASELINE`；
当前有效组合见 [`docs/CONTRACTS.md`](CONTRACTS.md) 头部版本对应表。

---

## 附：t22 修复记录（2026-09-26，kit-engineer）

**修复主题**：门洞（是否有通行开口）与建筑形制（重檐/攒尖/歇山）、窗、门扇开启比例**解耦**。

- **复现（先复现、后修改）**：用近/中 LOD 对象在门洞中心高度做射线通道判定（门口宽度 201 点采样 + 最宽连续通行段；
  单点射线会被 x=0 处两块墙对接的零宽对缝骗过，故不采用）。修复前实测：
  `hall(B-hall-main, door.width=26)` 最宽通行段 **0.13m**、遮挡率 100%；`hall(C-hall-bed-main)` 同样；
  `courtyardGate(C-gate-west, door.width=12)` 最宽通行段 **0.00m**；`gateHall(F-gate-south)` 18.76m（通行）。
  原始输出见 `docs/handoff-t3-repair-door.md`。
- **修复**：`src/kit/geometry.js` 正立面墙由「kind === 'gateHall'」改为「是否有门洞」（有门洞→门洞两侧砌墙；
  无门洞→整面一块实心墙）；门洞内前檐柱按"有门洞"跳过；窗不再要求"有门洞"（只由 kind 决定）；
  `src/kit/buildings.js` 的 `doubleEave` 去掉 `!isGate`（门殿不再被静默降级），门洞只由 `door`/`doorOpening`/`openFront`
  决定（殿堂不再凭默认值开门），并在 `metrics.opening` 暴露 `{width,height,openFraction,clearWidth,playerClearWidth,source}`。
- **重檐不退化**：`grade3 + doubleEaveHip` 的 hall 仍为长正脊 + 四面坡 + 上层屋身 + 双檐口，同时具备门洞通道。
- **预算不退化**：上层屋身（平座层）与下层同类构件**沿用同名 part**（柱/额枋/斗栱/栏杆），下层腰檐只把瓦面改名为 `lowerRoof`；
  避免重檐建筑额外占用合批桶。分区 C 绘制调用由 56（超预算 50）回到 **49**，`node scripts/audit.mjs --enforce` 全绿。
- **永久守卫**：`tests/kit.test.mjs` §14（+70 项断言 → 566/566），覆盖 hall+door 通行、hall 无 door 正面实心、
  gateHall/courtyardGate 行为、门洞宽度与 layout.door.width 一致、净宽 ≥ 玩家净宽、重檐形制不退化的几何断言。

---

## 附（t22 attempt 2 并入，2026-09-26）：构件库行为与选项 · `KIT_VERSION 1.0.1`

> 来源：`docs/handoff-t3-version.md`（版本递升与变更清单）、`docs/handoff-t3-repair-merge.md`（阴影/台阶/bridge）、
> `docs/handoff-t3-repair-door.md`（门洞解耦）。以下 3 项此前只在实现文件的 JSDoc 与各自回执中，现并入本总文档。

### 1. 门洞与形制解耦（`KIT_VERSION 1.0.1` 起）

- **门洞**只由 `door`（layout 门数据）/`doorOpening`/`openFront` 决定：有门洞 → 正立面只砌门洞两侧墙段（净宽 = `layout.door.width`）；
  无门洞 → 整面单块实心墙（不再有"两块墙对接的零宽对缝"这种伪通道）。
- **屋顶形制**只由 `roofType`（+ 角楼/亭特例）决定，**不再因 kind 是"门"而降级**（F 城门楼的 `doubleEaveHip` 不再被吞）。
- **窗**只由 kind 决定（殿堂有、门殿/院门无、亭开敞）；**门扇开启比例**只由 kind 决定（殿堂 0.18 常闭、门殿/院门 0.72 常开）。
- 新增回显：`metrics.opening = { width, height, openFraction, clearWidth, playerClearWidth, source }`（`clearWidth` = 门扇打开后的真实净宽，
  显式开门时的默认门宽会保证 `clearWidth ≥ 2 × INTERACTION.player.radius`）。
- 典型用法：`kit.hall({ ...slot })`（layout 槽位自带 `door` 即可获得通行开口，无需改用 `gateHall`）。

### 2. 台阶递升方向约定

- `kit.stairs` 与建筑内建台阶的踏面**贴台明（本地 +Z）最高、向远端（本地 −Z）逐级递降至单级高**，与同函数的
  **丹陛御路（`imperialRamp`）同向**；远景质量块的台阶体量同向。
- 单级高/深取 `MODULES.stairsStepHeight / stairsStepDepth`；单跑超过 `MODULES.stairsMaxRun` 时自动插入休息平台（`runCount > 1`），
  平台顶面高度同样遵循"贴台明最高"。
- 区域**不需要**自行做朝向规范化（B 区 `alignStairFlights()` 在 1.0.1 起自动不再触发）。

### 3. 合批与 `mergeZone` 选项（含 `config` 覆盖语义）

- 合批网格（`mergeZone` / `mergeByMaterial`）**继承来源构件的 `castShadow`/`receiveShadow`**，并统一走
  `merge.shadowPolicy(config, part)`：全局开关 `config.LIGHTING.shadows.enabled`；**水面不投影但接收**；其余构件投影+接收。
  实例化构件（`instance` / `instanceFromPoints`）默认投影+接收。合批前后"投影三角面 / 投影部位集合"守恒
  （`tests/kit.test.mjs` §15 固化：投影网格 178 → 64，投影三角面 34656 逐位守恒）。
- 选项：`kit.mergeZone(root, { name='kit-zone-batch', prune=false, epsilon=0.02, config=null })`；
  `kit.mergeByMaterial(root, { includeLOD=true, config=null })`。
- **`config` 覆盖语义（易错点）**：wrapper 只把 `options` 原样透传给 `merge.js`，而 `merge.js` 以 `src/shared/config.js` 的
  `CONFIG` 作为兜底（wrapper 无法注入调用方的 config 实例）。因此
  · 不传 `config` → 用共享 `CONFIG`（默认行为）；
  · 需要按**自定义/覆盖后的 config** 执行时，必须显式写 `kit.mergeZone(root, { config })`；直接 `kit.mergeZone(root)` 不会读取调用方的 config。
- 返回值：`{ root, batch, stats: { before, after, reduction, levels, buckets, mergedMeshes, instanced } }`。

### 4. `kit.bridge` 可选拱券高程/净空参数（默认几何逐位不变）

| 参数 | 含义 | 默认值（= 修复前行为） |
| --- | --- | --- |
| `archRadius` | 拱券水平半径（米） | `min(span × 0.18, deckY + max(1.2, \|常水位\| × 0.5))` |
| `archRise` | 拱券竖向矢高（米）；≠ 半径时对拱环做 Y 向缩放（扁拱） | `= archRadius`（半圆） |
| `archCrownY` | 拱顶标高（米） | `deckY − deckT + archTube`（`deckT = max(0.5, deckY × 0.6)`） |
| `archClearance` | **净空**：拱顶到 `referenceY` 的高度（给出即优先） | 不给出 |
| `archSpringY` | 拱脚标高（米） | `archCrownY − archRise` |
| `referenceY` | 净空参考面 | `config.TERRAIN.moatWaterY` |

回显 `metrics.arch = { radius, rise, crownY, springY, clearance, referenceY, tube }`；桥墩高度公式
`max(0.8, deckY − 常水位 × 0.4)` 未改（F 区"桥墩落地、水体零重叠"不变）。

---

## 附：t27 修复记录 —— 重檐下檐脊饰归属（`lowerRidge`），2026-09-26

> 任务：`t27`（`kit-engineer`，inScope：`src/kit/**`、`tests/kit.test.mjs`、`docs/handoff-kit.md`）
> 症状（t24 交回）：`node scripts/verify-g1-baseline.mjs` §5.4 是**该脚本仅剩的唯一 FAIL** ——
> `B-hall-main` 重檐只有 `lowerRoof`、缺 `lowerRidge`（判据要求重檐建筑 ≥2 类"下檐部件"）。

### 1. 只读定位（file:line）

| 事实 | 位置 |
| --- | --- |
| 腰檐（下檐）由 `buildRoof(... roofType:'hip', detail, topHalfW/H=腰身 )` 生成，随后只把 **瓦面** 改名 `roof → lowerRoof` | `src/kit/buildings.js:176-204`（`apron.parts.rename('roof','lowerRoof')`） |
| `buildRoof` 的脊类部件名：`ridge`（正脊盒，所有非攒尖档都有）、`hipRidge`（垂脊梁，分档）、`ridgeBeast/ridgeEnd`（脊兽，grade≥2 且非 far） | `src/kit/geometry.js:418`、`~440-460`（hipRidge 段）、`:470/479` |
| 因此腰檐的 **正脊/垂脊** 与**上层**同名构件落进同一个合批桶 ⇒ "看不出两层脊饰" | 同上 |
| **合批键 = `material.uuid|part`** ⇒ 任何新部位名必然新增 1 个绘制调用 | `src/kit/merge.js:557-563` |
| B/C/F 三区均为**单档**建造：B=mid（`forecourt.js:66`）、F=mid（`garden-boundary.js:506`）、C 的 `C-hall-bed-main` 属 `NEAR_DETAIL_SLOTS` ⇒ near（`inner-palace.js:54,232`） | 见左列 |
| g1 判据 5.4 取 `lod:'near'` 的 `B-hall-main`，收集 `lowerRoof\|lowerRidge` 两类 | `scripts/verify-g1-baseline.mjs:330-338`（只读，未改） |

### 2. 最小改动（只改归属、不动几何）

```js
// src/kit/buildings.js（腰檐段，紧随 `apron.parts.rename('roof','lowerRoof')`）
if (detail === 'near') {
  apron.parts.rename('ridge', 'lowerRidge');
  apron.parts.rename('hipRidge', 'lowerRidge');
}
```

**为何只在近景档改名**——这是 §8.2 硬约束，不是形制取舍（实测，见 §3）：

| 方案 | 主场景 | B | C | D | E | **F** | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 改前 | 341/350 | 62/70 | 55/60 | 49/56 | 49/56 | **80/80** | — |
| 全档统一改名 | 344 | 63 | 56 | 49 | 49 | **81 ✗ 超预算** | 不可行（F 无余量） |
| **仅近景档改名（本卡）** | **342** | **62** | **56** | **49** | **49** | **80 ✓** | 可行 |

要点：B/F 按 `mid` 单档建成（改名的近景档不参与其建造）⇒ 逐值不变；C 的 `C-hall-bed-main` 按 `near`
建造 ⇒ 55→56（预算 60，余 4）；g1 §5.4 显式 `lod:'near'` ⇒ 转 PASS。
即：**可见三角面逐值不变、像素级 §12 判据逐值不变，唯一代价是 C 区 +1 个绘制调用**（合批键机制决定，
不是几何增量）。

若主理人要求"中档也统一归属"，需要 §8.2 裁定二选一：①F 80→81；②授权把两个既有脊饰部位名合并
（如 `ridgeEnd`+`ridgeBeast` → 一个名）以在 B/C/F 各腾出 1 个桶。**本卡未擅自做这两件事。**

### 3. A/B 实测（同一份代码副本，只切换上述 6 行；同机同参数）

```text
$ node scripts/verify-g1-baseline.mjs          # 改前 → 改后
 改前：exit 1     检查项 48 项：PASS 47 / FAIL 1
   [FAIL] 5.4 重檐另有下层腰檐 4 坡与下层正脊（apronRise>0，lowerRoof/lowerRidge 部件存在）
          — apronRise=2.22 上层 slopes=4 部件=lowerRoof
 改后：exit 0     检查项 48 项：PASS 48 / FAIL 0
   [PASS] 5.4 …… — apronRise=2.22 上层 slopes=4 部件=lowerRoof+lowerRidge
 （5.1/5.2/5.3/5.5/5.6 与 4.x 全部前后一致；等级-形制白名单未动：grade3 仅 doubleEaveHip、gable 仍非法）

$ node scripts/audit.mjs --enforce             # 改前 → 改后（exit 0 两次）
 主场景绘制调用 : 341 → 342 / 上限 350  ✓
 分区 B 62→62 · C 55→56 · D 49→49 · E 49→49 · F 80→80（✓）· 可见三角面 424401→424401（逐值相同 ✓）

$ 逐部位三角面 A/B（8 栋重檐：2 殿 + 4 角楼 + 2 城门；near 档，仅列差异部位）
 B-hall-main     total 11932 = 11932 | hipRidge 288→144; ridge 24→12; lowerRidge 0→156
 C-hall-bed-main total  9844 =  9844 | 同上
 F-gate-south    total  7648 =  7648 | 同上
 F-gate-north    total  7648 =  7648 | 同上
 F-tower-corner-{nw,ne,sw,se} 同上（角楼 `isTower` ⇒ 也是重檐，同样获得 lowerRidge）
 mid / far 档：**零差异**（改名只在近景档生效 ⇒ B/F 单档建造逐值不变）

$ §12 可读性 A/B（`--view=focus --focus=C-hall-bed-main --preset=golden`，1440×900/DPR1/medium）
 改前 内容均值 0.3079 · 内容暗区 9.43% · 高光截断 0.01% · 整帧均值 0.4457  PASS
 改后 内容均值 0.3079 · 内容暗区 9.43% · 高光截断 0.01% · 整帧均值 0.4457  PASS
 逐像素对比：1,296,000 像素中 4,165 个不同（0.321%），平均通道差 0.098/255 ⇒ 无回退
 （残留差异可能来自"脊饰拆桶后的绘制顺序"或两份代码副本间的其它并发写入；§12 四项统计逐值相同）
```

### 4. 判据（`tests/kit.test.mjs` §23，全部为**新增**断言）

```text
23.1 重檐集合按几何判定（upperEaveY > eaveHeight）= 2 殿 + 4 角楼 + 2 城门 = 8 栋
23.2 逐栋（8）近景档下檐 ≥2 类部件：lowerRoof > 0 ∧ lowerRidge > 0（= g1 §5.4 口径）
23.3 逐栋（8）形制完整：slopes == 4 ∧ apronRise > 0 ∧ metrics.ridge.length > 0
23.4 逐栋（8）归属守恒：lowerRidge == ridge + hipRidge（上层与下檐脊饰几何量相等；只改归属不改几何）
23.5 零几何改动：逐栋逐档三角面 = 改前实测值（near/mid 共 16 个钉值）
23.6 §8.2 守卫：**中档不得出现 lowerRidge**（B/F 单档建造、F 无余量；要统一归属需主理人裁定）
23.7 不外溢：非重檐槽位近景档不得出现 lowerRoof/lowerRidge
```

`node tests/kit.test.mjs`：**1723 → 1737 / 1737，失败 0**（+14 条，全部新增，旧断言一条未删）。

### 5. 未做 / 待裁定

1. **中档归属未统一**（见 §2 表）：F 80/80 无余量，需主理人 §8.2 裁定（F 81 / 或授权合并两个既有脊饰名腾桶）。
2. **未改任何几何**：`lowerRidge` 是归属拆分，几何量逐值不变（§3 的 total 列）；因此未新增任何脊饰几何，
   也没有为通过判据补造构件。
3. 角楼（4 座）同属重檐并按同一规则获得 `lowerRidge`；其 `roofType` 登记为 `gableHip`，但 `isTower`
   使其建成重檐 ⇒ §23.1 用**几何**而非 `roofType` 判定重檐集合（避免漏判）。
4. `metrics.parts` 在近景档会多一个 `lowerRidge` 键（下游若按 `parts` 穷举需知悉）；中/远档不变。

---

## 附：t46 修复记录 —— 红墙 × 白石墙基端面共面（走动时"红墙边缘闪缩"/Z-fighting），2026-09-26

> 任务：`t46`（`kit-engineer`）· inScope：`src/kit/buildings.js`、`tests/kit.test.mjs`、`docs/handoff-kit.md`
> 来源：外部代码审查（Codex）实测定位 **`src/kit/buildings.js:679-680`**（修前行号）：
> `wallBody`（红墙）与 `wallBase`（白石墙基）**同长度、同中心、同底部高度**，墙基只加厚 6%
> ⇒ 面向门洞的**红色端面与白色端面重叠共面** ⇒ 视角变化交替覆盖 ⇒ 走动时闪缩。
> 本卡**未**用提高 MSAA / 改绘制顺序 / 关闭深度检测掩盖（判据亦不接受这三类"修复"）。

### 1. 几何证据（先证后改）

**逐栋解析式盘点**（`work/probe-wall-inventory.mjs`，按修前两行公式复算，全表 `work/t46-wall-inventory.txt`）：

```text
修前：layout.WALLS 60 段 —— 有端面共面的墙 60/60 · 共面对数 424 · 共面面积 581.12 m² · 体块套叠 28742.08 m³
（每段：红墙端面 x ∈ {a,b} 与墙基端面 x ∈ {a,b} 完全相同 ⇒ 共面距离 0.000m < 1mm 判据；
  每段套叠体积 = 段长 × baseH × thickness，baseH = min(0.8, bodyH×0.2) = 0.8）
WALL-CITY-south  608×8×12   baseH 0.8  段数 2  端面共面对数 8  共面面积 51.2 m²  套叠 3724.8 m³
WALL-CITY-west   916×8×12   baseH 0.8  段数 2  端面共面对数 8  共面面积 51.2 m²  套叠 5696.0 m³
CY-B-plaza-wall-* / CY-*（院墙，58 段）… 共面对数 4/段 …（全表见 work/t46-wall-inventory.txt）
```

**实测（built geometry，`work/probe-wall-coplanar.mjs`，修前 `work/t46-probe-before.txt`）**：

| 样本 | 部位 | 中心 | 尺寸 (x×y×z) | y 范围 | 端面 x | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| WALL-CITY-south（含 26m 门洞） | 红墙 `wallBody` | (0, 5.45, −454) | 608 × 10.9 × 8 | [0, 10.9] | ±304、±13 | 与墙基端面**共面距离 0.000m** |
| ↑ | 墙基 `wallBase` | (0, 0.4, −454) | 608 × 0.8 × 8.48 | [0, 0.8] | ±304、±13 | 4 处共面 × 6.4 m²（门洞两侧 + 墙两端） |
| ↑ | 套叠 | — | — | — | — | x 608 × y 0.8 × z 8 = 3891 m³ 整段套叠 |
| 院墙（无门洞） | 红墙 / 墙基 | — | 1.2 × 4.2 × 140 | [0,4.2] / [0,0.8] | z=−180、−40 | 2 处共面 × 0.96 m² + 套叠 134 m³ |
| 合成 cityWall（两门洞） | 红墙 / 墙基 | — | 120 × 10.9 × 8 | [0,10.9] / [0,0.8] | ±60、±25、±15 | 6 处共面 × 6.4 m² + 套叠 725 m³ |

**机制**：两块在重叠区（y ∈ [baseY, baseY+baseH]）的端面 x 坐标完全相同、法线同向且面内重叠面积 > 0
⇒ 该区域内两三角面的**深度值相等** ⇒ 逐像素交替通过深度测试 ⇒ 移动视角时交替覆盖（"闪缩"）。

### 2. 修复（几何修复，非掩盖）

`src/kit/buildings.js:686-691`（现行行号；修前为 679-680）：

```js
const baseH = Math.min(0.8, bodyH * 0.2);            // 墙基高度（= 审查建议）
parts.add('wallBody', 'plasterRed', box(T, { w, h: bodyH - baseH, d: thickness,      x: (a+b)/2, y: baseY + baseH, ... }));
parts.add('wallBase', 'wallBase',   box(T, { w, h: baseH,          d: thickness*1.06, x: (a+b)/2, y: baseY,        ... }));
```

**配对守卫（逐值不变，A/B 实测）**：

| 指标 | 修前 | 修后 | 判据 |
| --- | --- | --- | --- |
| 红墙 y 范围（cityWall 南墙） | [0, 10.9] | **[0.8, 10.9]** | 红墙从墙基顶面开始 |
| 墙基 y 范围 | [0, 0.8] | [0, 0.8] | 不变（仍落地） |
| **装配总高**（最高面 y） | 12.0 | **12.0** | 逐值不变（baseH + (bodyH−baseH) = bodyH） |
| **门洞净宽**（两侧门垛端面实测） | 26.0 | **26.0** | 逐值不变（端面 x 坐标未动，只改竖向） |
| 其它部位 y 范围（门额/压顶/垛口/脊） | — | **逐值不变** | 见 `work/t46-probe-{before,after}.txt` |
| 可见侧共面（3 样本合计） | 18 处 | **0 处** | Z-fighting 本体消失 |
| 题干对体块套叠 | 是 | **否**（只 y=baseY+baseH 接触） | 法线相反 ⇒ 不闪 |
| 三角面（3 样本） | 1932 / 48 / 516 | **1932 / 48 / 516** | 不增 |

### 3. 同类普查（同一生成路径：勒脚/压顶/贴面/门额）

| 对 | 修前 | 处置 |
| --- | --- | --- |
| `wallBase × wallBody`（勒脚 × 红墙） | 可见侧共面 18 处 + 套叠 | **已修**（§2） |
| `wallBody × wallCoping`（院墙：红墙 × 瓦顶） | 可见侧共面 **8 处**（含**侧面** 2×25.2 m²：压顶与墙身同宽 1.2m 且竖向重叠 0.3cap） | **已修**：压顶略出挑 `1.06×墙厚`（与宫墙压顶 `1.15×` 同族做法）+ 两端各收进 4cm；`beam→box` 后**竖向跨度与中心高度逐值不变**（[4.02,4.62] 前后一致），三角面同为 12 |
| `wallCoping × wallCopingRidge`（瓦顶 × 脊） | 可见侧共面 2 处 × 0.018 m²（端面重合） | **已修**：脊再收进 8cm（落在压顶内部） |
| `wallBody × wallLintel`（红墙 × 门额） | 套叠（门额比墙宽 1.05×/厚 1.02×，包裹式） | **保留**：无同向共面 ⇒ 不闪；属贴面构造（已登记进 `ALLOWED_NESTING`） |
| `wallCoping × merlon`（压顶 × 垛口） | 套叠 + 仅**朝地(−y)** 的共面（可见半球外） | **保留**：无可见侧共面；仅登记（未改形制） |

**明确未做**：未提高 MSAA、未改绘制顺序、未关闭深度检测、未给所有墙统一加偏移；
只对**贴面装饰层**（院墙压顶/脊）做了 4–12cm 的小幅几何偏移（卡片允许）。

### 4. 新增常驻断言（`tests/kit.test.mjs` §24，+28 条）

```text
24.1 逐样本 × 逐部位对：**可见侧同向共面重叠 = 0**（法线同向、平面差 <1mm、面内重叠面积 >0；−y 朝地面排除）
     —— 失败打印双方与坐标（轴/平面/法线/面内区间/面积）
24.2 题干对（wallBase × wallBody）：体块**不套叠** + y 范围 = [baseY, baseY+baseH] / [baseY+baseH, baseY+bodyH]
24.3 配对守卫：装配底面 = baseY；**装配总高 = 修前公式值**；**门洞净宽（门垛端面实测）= 登记 width**
24.4 未登记的体块套叠 = 0（只允许 ALLOWED_NESTING 的四个"包裹式嵌套"对；新对出现即红）
24.5 三角面逐样本 = 修前值（1932/48/516）；部位名集合不变（合批桶不变）
```

### 5. verify（真实输出）

```text
$ node tests/kit.test.mjs
 · t46 体块守卫：3 个墙体样本 × 逐部位对 = 可见侧共面 0 处；题干对（红墙×白石墙基）体块不套叠、
   y 范围 = [baseY, baseY+baseH] / [baseY+baseH, baseY+bodyH]；门洞净宽与装配总高逐值不变；三角面与部位名不变
 通过 1765 / 1765，失败 0        （改前 1737 ⇒ 本卡 +28 条，全部新增）

$ node scripts/audit.mjs --enforce
 主场景绘制调用 : 342 / 上限 350  ✓     B 62/70 · C 56/60 · D 49/56 · E 49/56 · F 80/80 ✓
 可见三角面     : 425317 / 上限 1500000  ✓     结论：预算与契约检查全部通过      exit 0

$ node work/probe-wall-coplanar.mjs      # 只读探针（人读 work/t46-probe-{before,after}.txt）
 修前 → 修后：cityWall 可见侧共面 4→0 · 院墙 8→0 · 合成双门洞 6→0；三角面 1932/48/516 前后一致
```

### 6. 未运行 / 需人工目视的项

1. **浏览器侧"同位置走动对照"未自动完成**：本卡尝试 `--view=fp --preset=golden` 的 A/B 截图，
   该次 headless 运行超过 600s 未返回（本机浏览器资源被并发任务占用）⇒ 已中止（`job_kill`）并
   按 **sha256 校验**从备份恢复 `buildings.js`（恢复后哈希与修复版逐值一致：`44fe2255…`，
   见 `work/t46-hash.txt`）。**未伪造任何画面证据。**
   **人工目视步骤（建议 V3/用户执行）**：① 打开 `?view=fp&preset=golden&ui=0`，出生点在南桥北端；
   ② 沿中轴向北走进**南城门门洞**，贴着门垛（红墙/白石交界）左右微动视角；③ 观察门垛竖向交界处
   是否仍有细线闪缩（修前：红色端面与白色端面交替覆盖；修后：下段为白石墙基、上段为红墙，
   交界处无共面）; ④ 对照"修前"可通过反向补丁复现（把 §2 两行改回 `h: bodyH … y: baseY` 与
   `h: Math.min(0.8, bodyH*0.2) … y: baseY`，以及院墙压顶换回 `beam`）。
2. **§12 可读性**：本卡只改体块高度划分与院墙压顶的 4–12cm 贴面偏移，**未改材质/光照/后处理**；
   可见三角面与绘制调用逐值不变（§5），故 §12 判据的输入未变。未重跑八视角×三时辰矩阵（属 V3 全量复核）。
3. **交回（不在本卡 inScope，未改一行）**：`tests/zone-garden.test.mjs:901-909` 的
   `墙体网格底面未落地` 断言只取 `plasterRed` 的 `wallBody` 网格并断言 `box.min.y ≤ cityGroundY + 0.01`；
   修后红墙从墙基顶面开始（实测 `wallBody.min.y = baseY + 0.8`、`wallBase.min.y = baseY` = 落地）
   ⇒ 该断言需由 zone 归属方**配对更新**（推荐：把 `wallBase` 材质一并纳入并集，
   即 `wallMats.add(kit.materials.get('wallBase').uuid)` 且接受 `part ∈ {wallBody, wallBase}`，
   语义从"红墙落地"改为"墙体装配落地"；或改为 `≤ cityGroundY + baseH + 0.01`）。

---

## 附：t39 交付记录 —— 可登塔楼的城市级接线（导出 API + E 区建造 + layout 派生登记 + pins），2026-09-26

> 任务：`t39`（`kit-engineer`）· inScope：`src/kit/index.js`、`src/kit/towers.js`、`src/zones/east-courts.js`、
> `src/shared/layout.js`、`tests/layout.test.mjs`、`docs/CONTRACTS.md`、`docs/handoff-kit.md`
> 来源：t37 的 blocker（塔楼几何需在 kit 导出 + 在 zones 调用，两者均不在 t37 inScope）。
> 本卡完成 **导出 API → E 区建造 → layout 派生登记 → pins → 真实文件口径实测** 全链，**登记与几何同轮**。

### 1. file:line 登记（跨域授权的三处）

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `src/kit/index.js` | `KIT_VERSION`（1.0.1→**1.0.2** + 版本历史）、`TOWER_FACTORY_NAMES`、import `./towers.js`、`kit.makeTower/towerPlan/disposeTower`、`stats().factories.towers`、底部导出 | 导出塔楼 API（`makeTower`/`towerPlan`/`disposeTower` + `climbStepMax`/`climbSequenceReport`/`faceOverlaps`/`TOWER_SPECS`/`CLIMB_SAFETY`） |
| `src/shared/layout.js` | 第七·A-3 节（`CLIMB_STEP_SAFETY`/`climbStepMax`/`CLIMB_TOWER_SPECS`/`CLIMB_TOWERS`/`climbTowerPlan`/`CLIMB_TOWER_PLANS`/`CLIMB_TOWER_FACES`/`CLIMB_TOWER_SHAFTS`/`CLIMB_TOWER_VIEWPOINTS`/`climbTowerReport`/`CLIMB_TOWER_SUMMARY`/`CLIMB_TOWER_WALKABLE`/`CLIMB_TOWER_OBSTACLES`/`CLIMB_TOWER_VP_ENTRIES`）；`WALKABLE`/`OBSTACLES`/`VIEWPOINTS` 三处 `...spread` 并入；`LAYOUT_VERSION` 1.1.26→**1.1.27**；`LAYOUT_STATS.climbTowers` | 紧凑规格 + 派生 72 面/1 障碍/1 机位（**不手写 72 行**） |
| `src/zones/east-courts.js` | 导入 `CLIMB_TOWERS`；8b 节（`stats.bronzes` 之后、整区合批之前）建造 + 逐值核对守卫；`stats.towers/towerFaces/towerTriangles/towerFacts` | E 区 (226, 262.4) 建 `T-watchtower-3` 并把登记/几何逐值核对 |

### 2. 计数与 A/B（真实文件口径，`work/probe-t39-tower.mjs`）

```text
登记：WALKABLE 175 → 247（+72：入口 2 + 环带 15 + 踏步 54 + 观景台 1，kind 'terrace'）
      OBSTACLES 93 → 94（OB-T-watchtower-3-shaft，y∈[0.4, 9.214] = [baseY, topY−slab]，blocks:'all'）
      VIEWPOINTS 61 → 62（VP-T-watchtower-3-top，mode 'focus-extra'）；focus-extra 6 → 7
      SLOTS 79 / 内景 43 / 道路 97 / 墙 60 不变；LAYOUT 1.1.26 → 1.1.27；KIT_VERSION 1.0.1 → 1.0.2
E 区 A/B（同一探针：A = 真 kit；B = 置空 kit.makeTower 走"只登记不建几何"分支）：
      绘制调用 52 → 54（+2，预算 56）· 可见三角面 53628 → 54564（+936，单栋 tower 936）
主场景：342 → 344 / 350（+2）· 可见三角面 425317 → 426253（+936）· B/C/D/F 逐值不变（F 80/80）
```

### 3. 可登性实测（真实文件口径；内存 clone 无效）

```text
面序列（layout 派生）：ok=true · hops=59 · 实测最大单跳 0.42 ≤ climbStepMax 0.42 (<0.45) · 反向 ok · 平面叠压 0
生产求解器：72/72 个登记面中心 solver.probe().ok = true（中央内芯不吞盘道）· 顶层观景台 probe.ok = true
生产口径逐跳（面中心 probe.surfaceY，含反向）：59/59 通过
登记↔几何：layout 派生 72 面 vs kit.towerPlan 逐值漂移 = 0（id/y/w/d/x/z 全等；障碍 y0/y1、机位、topY/totalHeight 亦逐值相等）
```

**网格诊断（如实登记，t39-F3）**：`createWalkGraph(cellSize 1/0.5)` 的 flood 会把螺旋"看断"（观景台与入口不同分量）——
根因是**踏面进深 0.34m < 格距**，某些踏面上没有格心 ⇒ 网格口径**不能**作为塔楼可登的判据（生产移动是连续的
`solver.step1` + `probe`，每级 0.15m ≪ 0.5m 阈值）。任何用网格做塔楼可达性断言的卡片请改用
"面中心 `probe` 逐跳"或把窗口网格细到 ≤0.1m。

### 4. 判据（`tests/layout.test.mjs` t39 块，+26 条，只增不减）

```text
t39.1 规格：1 座塔、选址 (226,262.4)、zone E、baseY = TERRAIN.sideCourtY = groundYAt(226,262.4)、LAYOUT_VERSION ≥ 1.1.27
t39.2 面：72 个 · 分布 ring15/step54/entry2/deck1 · id 唯一且 WK-<towerId>- 前缀 · kind 全 'terrace'（未新增 kind）· 全在 E 区/包络内 · 已并入 WALKABLE
t39.3 障碍：1 条 · sourceType ∈ core 白名单（building）· blocks 'all' · door null · y0=baseY · y1=topY−slab(9.214)
      · 观景台面高于内芯顶 · **无任何面落在内芯之内**
t39.4 机位：1 个 · mode 'focus-extra'（不得 interior，保 43 栋冻结集）· y = topY+1.65 · focus-extra 总数 = 7
t39.5 逐跳自检：ok · hops 59 · 最大跳 ≤ 0.42 且 < 0.45（禁 0.5 等值）· 反向 ok · 平面叠压 0
t39.6 **登记↔几何同轮**：layout 72 面 vs kit.towerPlan 逐值相等（漂移 0）· 障碍/机位/topY/totalHeight 逐值相等 · 塔顶 pyramidal ∈ GRADES[2].roofTypes
t39.7 突变对照：扰动一个面 y ⇒ 逐值比较必须报漂移（判据非恒真）
（另同步 5 处旧 pin：WALKABLE 175→=175+CLIMB_TOWER_FACES、VIEWPOINTS 61→=61+CLIMB_TOWER_VIEWPOINTS、
  t9 批量装饰的两条计数同口径改数据推导、通道面不新增机位一条 —— 原意一字未变，只是把 t39 增量显式计入。）
```

### 5. verify（真实输出）

```text
$ node tests/layout.test.mjs                      → 全部通过 ✓（LAYOUT 1.1.27；含 t39 块 26 条）
$ node tests/walk-reachability.test.mjs           → exit 0 · t140 全部通过 ✓（细口径命中 0 / 粗口径已登记 7）
$ node scripts/audit.mjs --enforce                → exit 0 · 主场景 344/350 · B62/C56/D49/E51(≤56)/F80 · 三角面 426253 ✓
$ node tests/zone-east.test.mjs                   → 33 / 34（唯一红 = **t39-F1** 陈旧期望，见 §6；文件不在本卡 inScope）
$ node tests/interaction.test.mjs                 → 80 / 81（唯一红 = **t39-F2** 推导缺一类别，见 §6；文件不在本卡 inScope）
```

### 6. 交回（不在本卡 inScope，未改一行；两件都需**配对更新**才能全绿）

| id | 位置 | 现象（实测） | 建议改法 |
| --- | --- | --- | --- |
| **t39-F1** | `tests/zone-east.test.mjs` §"可行走面 1 面回显 layout、坡道斜率 ≤ rampMaxSlope" | 该断言要求 E 区所有可行走面 `y == 东宫苑地坪 0.4`，塔楼面 `WK-T-watchtower-3-L1-ringN@1.24`（… 至观景台 9.34）命中 ⇒ 红 | 按 `w.towerId`（或 `/^WK-T-watchtower-/`）**排除塔楼面**，并**追加更强断言**：塔楼面 y 单调递增、逐跳 ≤ `climbStepMax()`、顶层观景台唯一最高（把"地坪例外"变成"塔楼链自证"） |
| **t39-F2** | `tests/interaction.test.mjs` E13（`auditBlockers.derived` / `groupOf` / `residualIds`） | 该守卫用「实心槽位 ∪ 护城河 ∪ 假山 ∪ 未开槽水体」推导整足迹阻挡清单；塔身内芯 `OB-T-watchtower-3-shaft`（`sourceType:'building'`、`buildingKind:'towerShaft'`、`blocks:'all'`）不在推导式内 ⇒ `extra = 1` 红；`groupOf` 会把塔身归入"批量装饰"组而该组要求**集合等于** `GARDEN_BULK_SLOTS` | 在 `derived` 里加一类：`...list.filter((o) => o.buildingKind === 'towerShaft').map((o) => o.id)`；`groupOf` 加 `'塔楼'` 分支（`/^OB-T-watchtower-/`）并断言该组**集合等于** `layout.OBSTACLES.filter(o => o.buildingKind==='towerShaft').map(o=>o.id)`；如需更贴文案，`src/interaction/catalog.js` 的 `blockedHint` 加 `case 'towerShaft'`（当前走 default 分支给出"三层观景塔塔身 不可进入"，已是非兜底具名提示，故 catalog 非必需） |

### 7. 未运行 / 已知限制（如实）

1. **浏览器侧**未跑（本卡全部结论来自 Node 侧真实文件装配 + 生产求解器）；塔楼外观与登塔体感需 V3/人工目视
   （建议 `?view=focus&focus=T-watchtower-3` 与 `VP-T-watchtower-3-top` 机位各出一张）。
2. **网格可达性口径**见 §3（t39-F3）：不得用 `cellSize ≥ 0.5` 的 flood 判定塔楼可登。
3. `t39-F1/F2` 未修（文件不在 inScope）⇒ 五套件里 `zone-east`/`interaction` 各 1 红；本卡 inScope 内三条（layout/walk-reachability/audit）全绿。
4. 塔身内芯 `y1 = topY − slab`（9.214）刻意**低于观景台面**（9.34）：若取到 `topY`，`obstacleBlocksPoint` 的含界判定会把观景台拦住（t37 已记录，本卡沿用）。

---

## 附：t41 多层楼阁 —— 原型证伪 + 可落地蓝图（attempt 3/4，未接线；**树未改**）

> 任务 `t41`（`kit-engineer`）。本卡四次派单均因**几何不可行**或**inScope 冲突**停在取证阶段；
> 本节把「原型证伪证据 + 唯一在 inScope 内可行的设计蓝图」写清，供下一 attempt 直接实施。

### 1. 原型证伪（attempt 3 实测，补丁留档 `work/t41-gallery-prototype.patch`）

在 `src/kit/towers.js` 落过 `storeyGalleryPlan`/`makeStoreyGallery`（腰檐 + 平座外廊 + 逐层直跑梯，
只用既有桶 `stairs/terraceCap/lowerRoof/lowerRidge/railing`）。单栋（B-hall-main，levels 3）实测：

```text
levels 3 · faces 50 · floorRise 3.57 · maxHopMeasured 0.149 ≤ climbStepMax 0.42 · reverseOk true
但 climb.ok = false，overlapCount = 24   ← 被 faceOverlaps（"不被更高面取高"）判据当场证伪
```

根因：`kit.hall` 的屋身是**一体实心**（`src/kit/buildings.js` 不在本卡 inScope），檐下任意标高处墙面都在
x=±w/2 ⇒ ①平座只能挂在 x≥w/2 之外；②平座按层内收 ⇒ 埋进实心屋身；按层外挑 ⇒ **上层压住下层**（取高）；
③连接梯段无论放哪都会被更高层平座覆盖。

### 2. 蓝图（唯一在 inScope 内可行：**外侧不互压的 U 形平座 + 外向阶梯**）

关键约束（三条，缺一即被 `faceOverlaps`/取高判据打回）：
① 所有可走面组在 plan 上**互不重叠**（不同 y 也不行 —— 取高只看 plan）；② 每条梯段的 plan 不被任何更高面覆盖；
③ 每跳 |Δy| ≤ `climbStepMax()`。

B 区三栋（inScope 内可达的最大集：`B-hall-main` g3→3 层 / `B-hall-mid`、`B-hall-rear` g2→2 层）：

| 面组 | 位置（相对槽位中心） | 标高 | 说明 |
| --- | --- | --- | --- |
| L2 东廊 | x ∈ [w/2, w/2+2.6]，z ∈ [−d/2, d/2] | baseY + E/3 | 平座（板厚 slab，`terraceCap`） |
| L2 北桥 | z ∈ [d/2, d/2+2.6]，x ∈ [−w/2, w/2] | 同 L2 | 连接东廊↔西廊（**只在 3 层栋需要**） |
| L2 西廊 | x ∈ [−w/2−2.6, −w/2]，z ∈ [−d/2, d/2] | 同 L2 | 仅 3 层栋 |
| L2 东梯 | x ∈ [w/2+2.8, w/2+5.4]，z 自 (z−d/2+0.2) 起，步深 0.34 | baseY → baseY+E/3 | 22–36 级（E/3 ≈ 2.2–3.6m ⇒ run 7.5–12.2m ≤ d ✓） |
| L3 西廊 | x ∈ [−w/2−5.2, −w/2−2.6]，z ∈ [−d/2, d/2] | baseY + 2E/3 | **比 L2 西廊再外挑 2.6m** ⇒ 与 L2 面组 plan 不相交 |
| L3 西梯 | x ∈ [−w/2−7.8, −w/2−5.2]，z 自 (z−d/2+0.2) 起 | baseY+E/3 → baseY+2E/3 | 自 L2 西廊上行 |

· **层数按等级序**：`levels = grade === 3 ? 3 : 2`，与 t38 的 `eaveAbs` 降序一致（B-hall-main 10.71 > B-hall-mid 6.60 > B-hall-rear 6.40）。
· **eaveAbs/totalHeight 逐值不变**（楼层只是腰位分层，未改屋身/屋顶）⇒ t38 冻结口径与 R3–R6 读数不受影响。
· 面数估算：3 层栋 ≈ 62 面、2 层栋 ≈ 36 面 ⇒ 三栋 ≈ **134 面（WALKABLE 247 → 381）**；**OBSTACLES/VIEWPOINTS/内景 43 逐值不变**
  （楼身阻挡继续由槽位 `OB-<slotId>` 承担，平座在其包围盒之外）⇒ 跨 owner pin 只剩 WALKABLE 一类。
· 预算：新腰檐/栏杆并入既有桶（B 区已有 `lowerRoof/lowerRidge/railing/terraceCap/stairs`）⇒ 预期 **+0…+2** 调用（B 62/70）。

### 3. 落地顺序（下一 attempt，按 t39 已验证模式）

① `src/kit/towers.js`：`STOREY_GALLERY_SPEC` + `storeyGalleryPlan()`（纯数据，含 `climbSequenceReport` 自检 + `faceOverlaps` 必为 0）
  + `makeStoreyGallery()`（几何 + `walkable`，kind 取既有白名单 `terrace`，**不登记 obstacles/viewpoints**）；
② `src/shared/layout.js`：`STOREY_GALLERIES` 紧凑规格（slotId/x/z/w/d/baseY/eaveHeight/levels，全部由 `SLOTS`+`slotVolumeCaliber` 派生）
  + `storeyGalleryPlan()` 镜像 + `...spread` 并入 `WALKABLE` + `LAYOUT_STATS.storeyGalleries` + `LAYOUT_VERSION` 递增；
③ `src/zones/forecourt.js`：合批前建 3 座并 `root.add`，与 `zone.walkable` **逐值核对**（漂移抛错，防空气楼梯）；
④ `tests/layout.test.mjs`：t41 块（层数按 eaveAbs 序、面数派生、climb.ok/逐跳/反向/叠压 0、登记↔几何逐值、突变对照必红）
  + 把 WALKABLE pin 改为 `175 + CLIMB_TOWER_FACES + STOREY_GALLERY_FACES`（数据推导）；
⑤ `tests/zone-forecourt.test.mjs`：同族"面标高 = 区域地坪"类断言按 `galleryId` 排除并追加梯段链自证；
⑥ `work/probe-t41-storeys.mjs` 扩成真实文件口径探针（面中心 `probe` 逐跳 + 生产 `probe.ok` + 含量 A/B）。

### 4. 交回裁定（前置，非本 attempt 能自行决定）

1. **候选集**：前 5 候选里 2 栋属 C 区（`src/zones/inner-palace.js` **Out-of-scope**）、F 区 4 候选被预算（**80/80 零余量**）与 `onWall` 排除
   ⇒ inScope 内最多 **B 区 3 栋**。请裁定「授权 inner-palace.js」或「本卡仅 B 区 3 栋」。
2. **替代轻卡（建议优先）**：现状 B-hall-main / C-hall-bed-main / F-gate-south·north **已是重檐**；用户说"全是一层"很可能指
   **其余中轴栋皆单檐**。若接受「只做外观」，可改派一张轻卡：按 grade 给中轴 4–6 栋**加腰檐分层**（不改 eaveAbs/totalHeight、
   不新增计数、无取高争议），半天内可交付 —— 这比把塔楼环带/切段逻辑整套移植到矩形平面（方案 B）风险与成本都低得多。
3. 遗留：t39-F1（`tests/zone-east.test.mjs` 33/34）、t39-F2（`tests/interaction.test.mjs` 80/81）两件配对更新仍未派单。

---

## 附：t41 交付记录 —— 中轴楼阁**腰檐分层**（外观多层，2026-09-26，LAYOUT 1.1.27 → **1.1.28**）

> 需求（用户原话）：「把中轴的建筑高度改的高低有序，有的三层有的两层的 现在全是一层的楼」。
> inScope：`src/kit/towers.js`、`src/kit/index.js`、`src/shared/layout.js`、`src/zones/forecourt.js`、
> `tests/layout.test.mjs`、`tests/zone-forecourt.test.mjs`、`docs/handoff-kit.md`。

### 1. 先只读取证（台账 + 候选判定，不凭喜好挑）

`work/probe-t41-storeys.mjs` + `work/t41-ledger.txt`（真实文件只读）：中轴 11 栋逐栋
`{kind, grade, roofType, 占地 w×d, 台基层数, eaveAbs, totalHeight, 三角面, 是否双檐, onWall, 现层数=1}`。
**候选规则（数据推导）**：中轴（B/C 区）非 `onWall` 的 `hall`，按 `slotVolumeCaliber().eaveAbs` **降序**取前 5 ⇒
`B-hall-main 10.71(g3)` · `C-hall-bed-main 7.71(g3)` · `B-hall-mid 6.60(g2)` · `B-hall-rear 6.40(g2)` · `C-hall-bed-rear 5.80(g2)`。
**实际落地 = 候选里 zone B 的 3 栋**（`B-hall-main` 3 层、`B-hall-mid`/`B-hall-rear` 2 层）：另 2 栋由
`src/zones/inner-palace.js` 装配（**本卡 Out-of-scope**），以 `buildable:false` + 具名理由**逐条登记**在
`layout.STOREY_BAND_CANDIDATES`（台账不隐瞒、不删项）。F 区 4 候选被预算（**80/80 零余量**）与 `onWall` 排除。

### 2. 裁定说明：为何本卡**只做外观分层**（卡内「否则明确交回裁定说明」条款）

**上层「可达」在本卡 inScope 内被实测证伪**（attempt 3 原型，补丁留档 `work/t41-gallery-prototype.patch`）：
按卡内路线在 `src/kit/towers.js` 实现「腰檐 + 平座外廊 + 逐层直跑梯」后，单栋自检

```text
levels 3 · faces 50 · floorRise 3.57 · maxHopMeasured 0.149 ≤ climbStepMax 0.42 · reverseOk true
climb.ok = false · overlapCount = 24   ← faceOverlaps（不被更高面取高）当场打回
```

根因：`kit.hall` 屋身**一体实心**，而 `src/kit/buildings.js` **不在本卡 inScope** ⇒ 檐下任意标高处墙面恒在
x=±w/2：平座只能外挂；**按层内收 ⇒ 埋进实心屋身**；**按层外挑 ⇒ 上层压住下层**（玩家在低层被 `floorYAt` 吸到高层）。
唯一在 inScope 内的可达方案是把 `towerPlan` 的「环带按梯段切段 + 逐层外向」整套移植到矩形平面
（见本文件「附：t41 多层楼阁 —— 原型证伪 + 可落地蓝图」§2 的 U 形平座蓝图，估 ≈200 行 + layout 派生镜像
+ WALKABLE 247→381），属**一张完整卡**的工作量，本卡额度内不可交付。
⇒ 本卡交付**外观多层**（腰檐 + 檐脊分层，**不登记任何可行走面** ⇒ **无空气楼梯**），并把可达方案的**蓝图**留给下一卡。

### 3. 落地（登记与几何同轮）

| 层 | 位置 | 内容 |
| --- | --- | --- |
| kit | `src/kit/towers.js`（新增 `STOREY_BAND_SPEC` / `storeyBandPlan` / `makeStoreyBands`）· `src/kit/index.js`（`KIT_VERSION 1.0.2 → **1.0.3**` + 导出 + `stats().factories.towers`） | 按等级在屋身腰位加**腰檐（四边出挑 1.2m）+ 檐脊**；只用既有部位/材质 `lowerRoof`/`lowerRidge` × `glazeTile` ⇒ **并入既有合批桶** |
| layout | `src/shared/layout.js` 第二十节（`STOREY_BAND_SPEC`/`STOREY_BAND_CANDIDATES`/`STOREY_BANDS`/`storeyBandPlan()`/`STOREY_BAND_PLANS`/`STOREY_BAND_SUMMARY` + `LAYOUT_STATS.storeyBands`） | 口径 `bandY(k) = baseY + eaveHeight·(k−1)/levels`；`levels = grade===3 ? 3 : 2`；**eaveHeight/totalHeight/eaveAbs 一字未改**（t38 口径 R3–R6 读数不变） |
| zone | `src/zones/forecourt.js`（合批前建 3 座 + `root.add`） | **逐栋核对 `bandCount` 与每道 `bandY`（逐值，漂移即抛错）** ⇒ 登记↔几何同轮；灰盒无 `makeStoreyBands` 时跳过（不静默：`stats.storeyBands` 记 0） |

**计数（零变动）**：`WALKABLE 247` · `OBSTACLES 94` · `VIEWPOINTS 62` · 内景 43 · SLOTS 79 · 道路 97 **全部不变**；
`LAYOUT_VERSION 1.1.27 → 1.1.28`；**未动任何阈值**（0.5/0.6 一字未改）。

**实测（audit --enforce exit 0）**：主场景 **344 → 345 / 350**（+1）· B 区 **62 → 63 / 70**（+1）· C/D/E/F 逐值不变（F 80/80）·
可见三角面 425941/1.5M；腰檐几何 = 4 道 × 8 盒 = **768 三角面**（`kit.makeStoreyBands` 实测 192/栋·道）。

### 4. 判据（`tests/layout.test.mjs` t41 块，+16 条，只增不减）

候选 5 栋 / eaveAbs 降序 `/ 落地 3 栋并集` / 层数随等级（g3⇒3、g2⇒2）/ `ordered` 自检 / 不改 eaveHeight+eaveAbs /
**零计数变动 0/0/0** / 腰檐道数 4 / LAYOUT_VERSION ≥ 1.1.28 / **bandY 与 `kit.storeyBandPlan` 逐值相等** /
**突变对照（改 eaveHeight ⇒ bandY 必偏离）** / bandY 落在 (baseY, baseY+eaveHeight) 内。

### 5. 未运行 / 交回

1. **五套件**：`audit --enforce` exit 0 ✓；`tests/layout.test.mjs` 与 `tests/zone-forecourt.test.mjs` 现存
   **2 + 1 处红，全部来自并发落地的「院墙扩展」**（`WALLS 60 → 72`、院墙 68 段；断言 pin 仍是 60/6 段），
   本卡 diff **未触碰任何 WALLS/cityWall/courtWall 行**（`git diff` 计数 0）⇒ 属**并发写入窗口的陈旧 pin**，
   由该落地方更新（`tests/layout.test.mjs` 的「冻结计数 79/60/32/14/10」与 `tests/zone-forecourt.test.mjs` 的
   「院墙 6 段」两处）。
2. **浏览器侧未跑**：建议 V3 用 `?view=axis` 与 B 区 `--view=zone` 各出一图对照腰檐分层观感。
3. **可达多层的下一步**：见本文件「附：t41 多层楼阁 —— 原型证伪 + 可落地蓝图」（U 形平座 + 外向阶梯），
   或改由「拆屋身真楼层」（需 `src/kit/buildings.js` 授权）实现 —— 两者均需主理人裁定后再派卡。
