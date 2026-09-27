# t47 回执 · AA 档位切换必须真正重建渲染目标（报告 4× 而 GPU 实际 2×）+ 跨区重复共面墙线归属唯一

> ROOT：`imperial-palace-dsh-1.1b`
> attempt 1 · `572900af-1201-4f25-bc12-004f6974f258`
> inScope：`src/core/renderer.js`、`src/zones/forecourt.js`（本卡未改，见 §3 归属判定）、`src/zones/inner-palace.js`、
> `tests/core-antialias.test.mjs`、`tests/core-environment.test.mjs`（本卡未改，见 §6 并发窗口）、
> `tests/zone-forecourt.test.mjs`、`docs/report-aa-rebuild.md`

## §0 结论（先说）

1. **缺陷① 复现成立**：`renderer.js` 的 `applyAntialias()` 只写 `composer.renderTarget1/2.samples`，
   **不触发 GL FBO 重建** ⇒ 档位切换后**计划值 ≠ 实际生效值**（实测 `high` 计划 4× / GPU 实际 2×；
   `low` 计划 0× / GPU 实际 2×——AA 关不掉）。真 Metal 读数（`--use-angle=metal`，`MAX_SAMPLES=8`）。
2. **已修**：新增纯判据 `antialiasApplyDecision()`；samples **变化**时 `dispose()` 两条 composer RT
   （three 唯一的重建触发点之一）并计数；`antialiasInfo()` / `getStats().quality.antialias` 改为上报
   **GL 侧读回**的 `effective`（不是计划值回显）。修后逐档 × `?aa=off|2|4|8` **20/20 行一致**。
3. **缺陷② 归属唯一化**：`z=80` 的 B/C 边界墙在 `layout.WALLS` 里有**两份共面声明**
   （B `CY-B-rear-wall-north(-east)` / C `CY-C-front-wall-south(-east)`）。core `deriveWallRuns()` 已归并为
   **`WALLRUN-B-x80.00`（owner=B）**，可视化（t48）也只由 B 建；但 **C 仍在另登一份碰撞**
   （`OB-CY-C-front-wall-south(-east)-span*`，运行时被 registry 的"几何重合"去重吃掉 ⇒ 隐性重复）。
   本卡把碰撞也统一到归属区：**C 不再登记这 2 份**，由 core 派生层 `OB-WALLRUN-B-x80.00-span1/2`
   承载（逐段覆盖 + 在 B/C 两侧地坪高度上都拦截，已实测）。

## §1 缺陷① 复现（修前原始读数）

探针：`work/probe-aa-rebuild.mjs`（自建静态服务 + headless Chrome + CDP；`?dpr=1`；页内 `store.patch({quality})` 逐档切换；读数取 `antialiasInfo().effective`）。

```
浏览器        : chrome-headless-shell（--use-angle=metal）
GL_RENDERER   : ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)
MAX_SAMPLES   : 8
```

**修前（不传 `?aa=`，档位驱动 samples —— 最小暴露矩阵）**：

| 档位 | 计划 samples | **实际读回（GL）** | 判定 | rebuilds |
| --- | --- | --- | --- | --- |
| low | 0 | **2** | ✗ 不一致（AA 关不掉） | 0 |
| medium | 2 | 2 | ✓ | 0 |
| high | 4 | **2** | ✗ **报告 4× 实际 2×**（审查 findings ① 原文） | 0 |
| resize(1100×700) | 4 | **4** | ✓（**只有尺寸变化触发的 RT 重建才生效**） | 0 |

原始 JSON（修前 high，节选）：

```json
{"mode":"msaa","samples":4,"reason":"tier","tier":"high",
 "effective":{"samples":2,"renderTarget1":{"samples":2,"fboSamples":2,"renderbufferSamples":2,"source":"gl-read"},
              "renderTarget2":{"samples":2,"fboSamples":2,"renderbufferSamples":2,"source":"gl-read"},
              "maxSamples":8,"glRenderer":"ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)",
              "matchesPlan":false},
 "rebuilds":0,"lastRebuildReason":null}
```

> 关键旁证：`resize` 之后 `effective` 才变成 4 —— 与审查结论"只有 `setSize()`/DPR 变化触发的 RT 克隆才会重建"逐字吻合。

**根因（three r169 源码）**：
- `RenderTarget.setSize(w,h)` **仅在尺寸变化时** `dispose()`（`three.module.js:3058`：`if (this.width !== width || …) { …; this.dispose(); }`）⇒ 尺寸不变时改 `samples` 什么也不会发生；
- `samples` 只是 JS 字段；GL 的 multisampled FBO/renderbuffer 在 `setupRenderTarget()` 里按当时的 `samples` 创建（`three.module.js:25914-25931`）；
- `deallocateRenderTarget()` 结尾 `properties.remove(renderTarget)`（`three.module.js:24504+`）⇒ **`dispose()` 后下一次绑定会按新 `samples` 重建** —— 这正是修法依据。

## §2 修法（只改 `src/core/renderer.js`，保持 bloom/output/色彩空间/`?aa=` 语义不变）

```js
// 纯判据（导出，可 Node 直测）
antialiasApplyDecision(prev, next):
  prev 缺省            → { writeSamples:true,  rebuild:false, reason:'init' }        // 首帧按新值创建
  prev.samples === next → { writeSamples:false, rebuild:false, reason:'unchanged' }   // 同档/resize/重复设置零开销
  否则                  → { writeSamples:true,  rebuild:true,  reason:'samples a→b' }  // 必须真重建
```

- `applyAntialias()` 按判据分支：写 `composer.renderTarget1/2.samples`（**仍是唯一写入点**，源码守门①不变）
  → `decision.rebuild` 时 `composer.renderTarget1.dispose(); composer.renderTarget2.dispose();` + `antialiasRebuilds += 1`；
- **没有**改 pass 链（`RenderPass → UnrealBloomPass → OutputPass`）、没有改绘制顺序、没有动 `depthTest`
  / 全局 `polygonOffset` / 隐藏 mesh、没有提高 MSAA；`?aa=` 语义与 §12 阈值、§8.2 预算门禁一字未改；
- 诊断新增（不改渲染行为）：`readRenderTargetSamples()` 用 `gl.getParameter(gl.SAMPLES)` 与
  `gl.getRenderbufferParameter(RENDERBUFFER, RENDERBUFFER_SAMPLES)` 读回**实际生效值**；
  `antialiasInfo()` 增 `effective/maxSamples/rebuilds/lastRebuildReason`，`getStats().quality.antialias`
  增 `effectiveSamples/maxSamples/matchesPlan/rebuilds` ⇒ `?stats=1` 的 `antialiasPlan` 通道随之带上真值。
- 口径：已上传的 RT 必须 `samples == 计划`；`not-uploaded`（尚未创建）记 `pending` 不判负，但计划 >0 时
  至少须有一条已上传（否则 `matchesPlan=null`，不静默通过）。

## §3 缺陷① 修后矩阵（`?dpr=1`，真 Metal）

**A. 不传 `?aa=`（档位驱动，暴露缺陷的矩阵）**

| 档位 | 计划 | 实际读回 | rt1_source | pending | rebuilds | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| low | 0 | 0 | not-uploaded（计划 0） | 2 | 1 | ✓ |
| medium | 2 | 2 | gl-read | 0 | 2 | ✓ |
| high | 4 | 4 | gl-read | 0 | 3 | ✓ |
| resize(1100×700) | 4 | 4 | gl-read | 0 | 3 | ✓ |

**B. `?aa=off|2|4|8` × 档位（覆盖路径，16 行）**：**全部 OK**

| aa | low | medium | high | resize |
| --- | --- | --- | --- | --- |
| off | 0/0 ✓ | 0/0 ✓ | 0/0 ✓ | 0/0 ✓ |
| 2 | 2/2 ✓ | 2/2 ✓ | 2/2 ✓ | 2/2 ✓ |
| 4 | 4/4 ✓ | 4/4 ✓ | 4/4 ✓ | 4/4 ✓ |
| 8 | 8/8 ✓ | 8/8 ✓ | 8/8 ✓ | 8/8 ✓ |

（`rebuilds=0` 属正确：`?aa=` 在**页面加载时**就决定了计划，全程 samples 不变 ⇒ 无需重建；
换档不改变 `?aa=` 覆盖下的 samples，符合既有语义。）

合计 **20/20 行一致**（修前 4 行中 2 行不一致）。

## §4 常驻断言 + 三证（突变证明）

`tests/core-antialias.test.mjs` 新增 **t47⑤**（**断言数只增不减**：8 → 9 项）：

- **纯判据**（行为级）：init 只写不重建 · unchanged 零开销 · `2→4 / 4→2 / 4→0 / 0→2 / 2→8 / 8→2` 六组必须 `rebuild:true`；
- **行为模拟**（模拟 three"只改 samples 不重建 ⇒ 不生效"的契约）：切换后**生效值必须跟上计划值**（2→4→0→0）；
- **消费点守门**：`applyAntialias` 必须消费 `antialiasApplyDecision`、写两条 RT、按 `decision.rebuild` 分支、
  `dispose()` 两条 RT、并计数；且除两条 composer RT 外**不得再有 samples 赋值**（禁止退回"只改 samples"）；
- **上报守门**：`antialiasInfo()` 必须 `effective: readComposerAntialias()` + `rebuilds`，`getStats` 必须
  `effectiveSamples`/`matchesPlan`，且生效值来自 `__webglMultisampledFramebuffer` / `getRenderbufferParameter`。

**三证（真实文件突变）**：

| 步骤 | md5（`src/core/renderer.js`） | 结果 |
| --- | --- | --- |
| ① 修后（原始） | `0ceda1c8521d28762bdad8074e718ef2`（53 300 B） | `node tests/core-antialias.test.mjs` → **通过 9/9，exit 0** |
| ② 突变：`applyAntialias` 退回"只改 samples 不重建"（历史实现） | `6078dcb20d9a3054d033a009a396b287` | **通过 8/9，exit 1** —— `✗ t47⑤ …applyAntialias 必须消费 antialiasApplyDecision`（**必红 ✓**） |
| ③ 逐字节恢复（`cp /tmp/renderer.t47.bak`） | `0ceda1c8521d28762bdad8074e718ef2`（与①**相同**，字节数 53 300 相同） | **通过 9/9，exit 0**（恢复依据：md5 与字节数逐值相同） |

## §5 缺陷② 逐段归属核实与删除登记

`work/probe-dup-walls.mjs`（只读）：

| 段 id | 起止（axis=x） | 高度 | 厚度 | 材质/类别 | 声明归属 |
| --- | --- | --- | --- | --- | --- |
| `CY-B-rear-wall-north` | x∈[-96,-14.6] @ z=80 | 4.2 | 1.2 | `courtWall`（院墙） | **B**（`owner:'B'`，院 `CY-B-rear`） |
| `CY-C-front-wall-south` | x∈[-96,-14.6] @ z=80 | 4.2 | 1.2 | `courtWall` | C（`owner:'C'`，院 `CY-C-front`） |
| `CY-B-rear-wall-north-east` | x∈[14.6,96] @ z=80 | 4.2 | 1.2 | `courtWall` | B |
| `CY-C-front-wall-south-east` | x∈[14.6,96] @ z=80 | 4.2 | 1.2 | `courtWall` | C |

- **归并段（唯一权威）**：`WALLRUN-B-x80.00`，`owner='B'`，`owners=['B','C']`，
  `wallIds=['CY-B-rear-wall-north','CY-B-rear-wall-north-east','CY-C-front-wall-south','CY-C-front-wall-south-east']`。
- **可视化**：t48 起已只由 B 建（C 只建 `seg.owner === 'C'` 的子区间）⇒ 视觉无重复。
- **判定"多余的那一份"= C 的碰撞登记**（`OB-CY-C-front-wall-south(-east)-span*`）：理由
  ① 归并段 owner 是 B；② 归属区 B 侧不登记院墙碰撞（B 的 `colliders.obstacles` 里 wall 类 = 0），
  实际承载一直是 **core 派生层** `OB-WALLRUN-B-x80.00-span1/2`；③ C 的那份被 registry 的
  "几何重合"规则去重（`wallDuplicate` rule='geometry'）⇒ 纯隐性重复（装配顺序一变归属就漂移）。
- **删除登记**：`CY-C-front-wall-south`、`CY-C-front-wall-south-east`（**只删这 2 份**）。
  实现是**数据驱动判据**（同轴 + 线位差 ≤0.05 + 厚度/高度差 ≤0.05 + 跨度重叠 ≥0.5m 的跨区共面重复），
  不是写死 id；与 B **共线但不共面重叠**的侧墙（`CY-C-front-wall-west/east` 等 6 条）**照旧登记**
  （`zone-forecourt.test.mjs` 有反向断言守着）。
- **覆盖不减少（实测）**：两条被删跨度的实心段均被 `OB-WALLRUN-B-x80.00-span1/2`（y ∈ [-0.15, 4.2]）
  逐段覆盖；B 侧地坪 0.0 与 C 侧地坪 0.9 的玩家区间（+1.8 身高）都落在该垂直带内 ⇒ 两侧都拦得住。

**数值对照**：C 区 `stats.wallObstacles` **28 → 26**、`colliders.obstacles` **40 → 38**；
B 区不变；F 区不变；**绘制调用 215 / 三角面 3 430 不变**（本卡不动可视化，删的是重复碰撞登记）。

## §6 verify 与回归

```console
$ node tests/core-antialias.test.mjs            → 通过 9 / 9      exit 0（原 8 项 + t47⑤）
$ node tests/zone-forecourt.test.mjs            → 通过 44 / 44    exit 0（原 43 项 + t47③ 归属唯一）
$ node scripts/audit.mjs --enforce              → exit 0
   主场景绘制调用 : 350 / 上限 350 ✓（本卡 0 新增绘制；350 已被并发窗口内其它卡占满）
   分区 B 63/70 · C 56/60 · D 51/56 · E 54/56 · **F 80/80** ✓   可见三角面 438 601 / 1 500 000 ✓
$ node tests/layout.test.mjs                    → 全部通过（四层护栏：t159 F3 双向 660 相邻对失败 0）
$ node tests/walk-reachability.test.mjs         → t140 结果：全部通过（细口径不可达 0；粗口径集合未新增）
$ node tests/run.mjs                            → 通过 25 / 28（3 条红线归因见下表）
```

**三条红线的归因（均为并发窗口 / 已登记项，已实测证否本卡因果）**

| 红线 | 归因与证据 |
| --- | --- |
| `tests/core.test.mjs` ← `verify-completeness` 3.2「6 段院墙实体化偏弱」：`CY-C-front-wall-{west,east}`(顶 0.333) / `CY-C-main-wall-{west,east}`(顶 0.143) / `CY-C-rear-wall-{west,east}`(顶 0.133) | **实测证否本卡因果**：把 `src/zones/inner-palace.js` 换成**改动前（HEAD）版本**（md5 `82ab8f1655764bd325b8519abd4960d4`）后 `3.2` **同样红、6 段逐值相同**；随即逐字节恢复本卡版本（md5 `15654457d059c431e7acc4c95bba012b`，恢复前后 md5 逐值相同），复核 `zone-forecourt 44/44` 与 C 区 `wallObstacles 26 / 跳过 2 份` 不变。⇒ 属并发窗口内**其它卡的院墙图形工作**（同一次运行里墙段数 60→72，树在动）；本卡只动**碰撞登记**，C 区 `drawCalls 215 / 三角面 3 430` 逐值不变。 |
| `verify-completeness` 5.4b（通道面 y ≠ `door.sillY` 5 栋） | §5.2.2 已登记的**数据集例外表**（t97；含 `F-gate-*` 双标高），与 AA/墙线无关。 |
| `verify-experience` F1（24 格 shot 暗区：focus/night、interior/golden、interior/dusk）+ H5（城门内景灯池 #1–#2） | shot / 灯池域（H5 与 t42 灯池架构在飞工作相关）。本卡未改环境、灯位、相机与绘制顺序。 |

> 并发窗口说明（如实登记）：本卡首次跑 `core-environment` 时曾见 ⑦b（期望 `zone-static`）红，根因是队友留在
> `src/shared/config.js` 的临时突变值 `LIGHTING.lamps.selectionMode: 'dynamic' // t42 mutation-control (temporary)`
>（`git diff` 可见）；该值随后由其主人恢复，**同一次全量 `run.mjs` 里 `core-environment` 已 PASS**。本卡全程未触碰 `config.js`。
> 另：`tests/interaction.test.mjs`（含 E13 整足迹阻挡者计数）与 `tests/core-precision-consistency.test.mjs` ⑤（指纹）
> 在本卡终态运行中**均 PASS**（并发窗口内已由对应负责人同步）。

## §7 未运行 / 未验证（如实报告）

1. **`--view=interior` 单拍间歇失败（约 6 次 4 成）未定位**：本卡只做了机制排查——shot 路径是
   **每个视角独立整页加载 + `--virtual-time-budget`（F1 矩阵 9 000ms）**，档位切换发生在启动阶段且之后仍有
   大量帧 ⇒ 与"档位切换瞬间抓拍"无关；未复现到 stack，**带证据交回**（建议在 `verify-experience` 的
   24 格矩阵上加"同一 URL 连拍 3 次一致性"探针定位）。
2. 未做像素级边缘指标（AA 1×/2×/4×/8× 的锯齿改善度量）：`?mask=sky` 之外的边缘度量需另建探针口径，
   超出本卡验收（验收允许"若可测则给"，本卡给的是**GL 侧生效值**这一更强读回）。
3. 未跑 `tests/verify-completeness.mjs`（含浏览器）与 24 格 shot 全量：属 shot/验收域，本卡未触发。
