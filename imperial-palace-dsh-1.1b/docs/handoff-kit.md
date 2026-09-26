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
