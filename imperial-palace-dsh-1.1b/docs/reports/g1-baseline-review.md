# G1 基线评审报告（t5 / R1 · 构件库与核心契约是否足以支撑全部区域实现）

> 评审人：`verifier`（独立评审员，只读交付代码）
> 评审对象：`t3`（`src/kit/**` 构件库，冻结于 2026-09-26 04:02–04:11）+ `t2` 核心契约（`src/core/**`、`docs/CONTRACTS.md` §3/§6/§7）
> 版本组合：`CONTRACTS v1.0.1` ⇄ `CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ `KIT_VERSION 1.0.0` ⇄ three `r169`
> 门槛定义：`imperial-palace-plan.md` §8.1 G1 ——「标准院落样板、统一资源库、风格指南、接口和文件归属已发布；外部资产有记录且已适配」
> 结论：**G1 通过（verdict = pass）**，前提是 5 项已登记欠账（4 项文档、1 项碰撞归属）按各自 owner 收口；其中 D-1 必须在 **G2 收口前**由 t20 关闭。

---

## 1. 可复现命令与真实结果

| # | 命令 | 退出码 | 关键真实输出 |
| --- | --- | --- | --- |
| 1 | `cd "<ROOT>" && node tests/run.mjs` | `0` | `通过 7 / 7，失败 0，总耗时 16186ms`（core / kit / layout / zone-forecourt / zone-garden / zone-inner / zones 全 PASS；`zones.test.mjs`：`已交付真实区域：B/C/F`，D/E skip） |
| 2 | `cd "<ROOT>" && node scripts/audit.mjs` | `0` | `主场景绘制调用 46 / 上限 350 ✓`、`可见三角面 7981 / 上限 1500000 ✓`、`最高可见批次：oblique = 39`、`结论：全部预算与契约检查通过` |
| 3 | `cd "<ROOT>" && node tests/kit.test.mjs`（单独跑，t3 自测原文） | `0` | `通过 496 / 496，失败 0`；`分区 B: 247→38 / C:245→38 / D:262→29 / E:279→29 / F:302→38`；`全 67 槽：近景三角面 192420，中景 113632，单栋最大 11652` |
| 4 | `cd "<ROOT>" && node scripts/verify-g1-baseline.mjs`（**本次新增的独立验证**） | `0` | `检查项 46 项：PASS 46 / FAIL 0，另有 DEBT 5 项（归属其它任务）`；原始输出全文见 `docs/reports/g1-verify-output.txt` |
| 5 | `cd "<ROOT>" && node scripts/shot.mjs --probe` | `0` | `probe: 浏览器可用（未出图）`（headless-shell 可用） |
| 6 | `cd "<ROOT>" && node scripts/shot.mjs --view=all --preset=golden --out-dir=docs/reports/g1-evidence/browser` | `0` | `全部 8 张截图有效`；8 视角均 1440×900、真实 WebGL、无 404/无沙箱失败特征；浏览器实测见 §4 |

> 说明：本机 **headless Chrome 实际可用**（`chrome-headless-shell-mac-arm64`，SwiftShader/`--disable-gpu` 软光栅）。任务卡中「沙箱阻止 headless 截图」的前提在当前环境下**不成立**，因此本报告不含「截图未验证」项，改为使用真实浏览器出图证据；仅**帧率**仍不可用（软光栅，见 §7）。

## 2. 独立验证脚本做了什么（`scripts/verify-g1-baseline.mjs`，46 项检查）

不依赖 t3 自己的 `tests/kit.test.mjs` 结论，全部为本次当场测量：

| 段 | 内容 | 关键实数 |
| --- | --- | --- |
| §1 | CONTRACTS §3.4 冻结名称逐一存在且可调用 | 11 构件 + 5 摆件 + 2 包装 + `materials` 全在；额外 `screenWall/water/paving` 不冲突 |
| §2 | 材质令牌驱动 | 21 个 `COLOR_ROLES` 角色全部可取；9 个 `MATERIALS` 逐色与 config 一致；23 材质 / 6 贴图 @1024px ≈24MB |
| §3 | 源码纪律 | `src/kit/**` 非注释代码 `#rrggbb` 命中 **0**、`http(s)://` 命中 **0**；`public/assets/` 运行时资源 **0** 个；`src/**` 外部模型/HDR/图片引用命中 **0** |
| §4 | 以 layout 为唯一输入构建 67 槽（两条用法） | **67/67 成功、0 抛错**（显式字段子集与「整槽展开 `{...slot}`」两条路径都成功）；`|kit.eaveHeightAbsolute − layout.eaveHeight|` 最大 **2.00mm**；包围盒无内缩；侧向外扩 0.18–2.05m（出檐 grade1 1.92 / grade3 2.88）；显式子集单栋最大 **11,676** / 合计 **192,468**；整槽展开单栋最大 **11,652** / 合计 **192,420**（与 t3 公布值逐字一致；**差 48 面全部来自 `params.door` 门洞几何**） |
| §5 | 庑殿顶几何（几何取样 + `geometry.buildRoof` 模块级） | `hip/gableHip/doubleEaveHip → slopes=4 + 非零长正脊`，`pyramidal → apex + ridge=null`，`gable → slopes=2`；B-gate-front 顶带 **48.769×0.769m**（长宽比 63.4，期望正脊 48.00m）；B-hall-main 顶带 **27.09m = 正脊 25.92m + 脊断面宽 1.17m**；5 个风格/参数反例全部抛错 |
| §6 | LOD 三档 | 默认返回 `THREE.LOD` 三档；距离 `[0, 90, 300]` = `BUDGET.lod × QUALITY.medium.lodBias`；三角面 `11652 → 6540 → 108` 单调下降；`lod:'near'` 单档可用 |
| §7 | 合批 / 实例化 | 全城 67 槽 `mergeZone`：绘制调用 **1335 → 38**（−97.2%），三角面守恒 192,468；38 ≤ 350；64 棵树实例化 = **1** 次调用 |
| §8 | three 单例与资产登记 | `kit.THREE === ctx.THREE === THREE(r169)`；产物 `instanceof` 同一份 THREE；`assets.validate()` `{ok:true, checked:29, problems:0}`、`networkRequests: 0`；`ASSET_CREDITS.md` 声明无第三方素材 + 9 字段表 |
| §9 | G0 前置 | 灰盒 **67/67 栋**（门槛 54）覆盖 B/C/D/E/F；障碍构成与 `layout.OBSTACLES` 逐 sourceType 一致（67 建筑 + 4 宫墙 + 8 水面 + 2 假山 = 81）；**14 院落共 56 面院墙、49 个门洞，每院四面墙都在院界上且至少一处门洞** |
| §11 | 风格基线对照 | STYLE_GUIDE §2/§3 的色板 9 值 + 模数 25 值 + 旧化 5 值 + 材质光泽 8 组共 **47 组逐值一致**；只有鎏金 metalness ≥ 0.9；roughness 统一 +`WEATHERING.roughnessBias` 0.04 |
| §13 | 真实区域消费实证 | B **12 栋 / 64 调用（预算 70）/ 80,900 面 / kit 材质网格 64/64 / 契约问题 0**；C **12 / 48（预算 50）/ 48,260 / 48/48 / 0**；F **14 / 66（预算 80）/ 56,416 / 66/66 / 0**；D/E 未交付；3 个区域源码硬编码色值 **0**、自建材质 **0** |

## 3. t3 验收逐条核对

| t3 验收项 | 判定 | 证据（本报告实测） |
| --- | --- | --- |
| 构件工厂集合完整（11 构件 + 树木/山石/灯具/石栏/铜器） | **符合** | §1.1：`hall/gateHall/sideHall/pavilion/cornerTower/wall/courtyardGate/corridor/terrace/stairs/bridge` + `tree/rockery/lantern/railing/bronze` 全部存在可调用，另有 `screenWall/water/paving` |
| 庑殿顶几何 = 长正脊 + 四面坡（非尖顶替代） | **符合** | §5.1 模块级 `slopes=4 / ridge` 非空；§5.2/5.3 顶点级顶带取样，长宽比 63.4 与 23.2；§5.5 攒尖顶点 x/z 均为 0 且无正脊（两类正确区分） |
| 材质令牌驱动、无散落硬编码 | **符合** | §2.1–2.4 全部色值可追溯到 config；§3.1 `src/kit/**` 零十六进制字面量；§11 47 组数值与 STYLE_GUIDE/config 一致；§13.2 区域侧也零私有材质 |
| LOD 三档与合批/实例化有效 | **符合** | §6 三档距离与三角面单调；§7 1335→38 次调用且三角面守恒；§7.4 实例化 64→1；§4.7 两条构建用法都成功且能复现 t3 公布的总量 |
| ASSET_CREDITS 登记完整 / 声明全部程序化 | **符合** | §8.3/8.4：9 字段结构零问题、29 条运行时登记、网络请求 0；`公开声明"本项目无第三方素材"` + `public/assets/` 仅 README |
| `tests/kit.test.mjs` 覆盖（496 项） | **符合** | 命令 #3 原文复现 496/496；本报告另以 46 项独立检查交叉验证（未复用其断言），并复现其公布的关键计数 |

**t3 实现侧无「不满足验收」项**，未发现需要 `needs_revision` 的实现缺陷。

## 4. 接口一致性（CONTRACTS §3.4 kit API / createZone 契约 ↔ 实现）

- **名称层：逐一对应。** §3.4 列出的 18 个冻结名称全部存在（§1.1）；`params` 描述的 `id/name/w/d/bays/terraceH/roofType/grade/facing|rotationYDeg/quality` 全部生效，`roofType` 取值严格来自 `config.ROOF_TYPES`，且 `GRADES[grade].roofTypes` 白名单违规即抛错（§5.6 五个反例）。
- **createZone 契约：core 注入路径已实测可用。** §8.5：`makeTestCtx({zoneId:'B', kit})` → `ctx.kit === kit`、`ctx.THREE === kit.THREE`、`zoneLayout.slots` 只含本区 12 槽且带 `x/z/baseY`。
- **实证：已有 3 个区域仅靠文档化 API 达标。** B/C/F 三个真实区域用真 kit 构建、契约问题 0、且 ≥95% 网格使用 kit 共享材质（§13），说明接口**在实践上足以支撑区域实现**。
- **操作契约不在 CONTRACTS §3.4 内**：`x/z/baseY`（否则 67 栋全部落在原点，§12 实测 `position=(0,0,0)`）、`lod:'near'` 单档、返回 `THREE.LOD`、`params.door` 记录（`{width,height,openFraction,sillY}`，直接展开 layout 槽位的 `door` 即可）、`mergeZone(root)` 合批义务、`materials` 共享所有权、摆件工厂与 role 引用方式，这些只写在 t3 的 `docs/handoff-kit.md`（§2.2/§2.4）与 `src/kit/index.js` 头注释里；其中「整槽展开 `{...slot}`」这一自然用法在 CONTRACTS 里完全没提（但它是 t3 自测与 B/C/F 区域的实际用法）。区域作者**不必读 kit 源码**（handoff 文档已写清），但**必须读 CONTRACTS 之外的第二份文档**，这违反「同一份契约」的组织约定 → 记为 D-1，owner t20。
- **提交前的实测偏差**：`docs/handoff-kit.md` §1 仍写「默认放行 + `createKit({strictRoofGrade:true})` 才抛错」，与实现（始终抛错、无该开关）相反 → D-2；该文档与 `ASSET_CREDITS.md` 的版本戳仍停在 `CONTRACTS v1.0.0 / CONFIG 1.0.0` → D-3。

## 5. 风格基线可用性

- STYLE_GUIDE §2/§3 的色板、模数、旧化、材质光泽共 47 组数值与 `config` **逐值一致**（§11.1）；材质实例的 roughness = config 基础值 + `WEATHERING.roughnessBias(0.04)`（materials.js 已声明「统一轻度旧化」），唯一金属反射材质是鎏金（§11.2）。
- 抽查 3 个以上构件在 Node 中实例化：`hall`(B-hall-main)、`gateHall`(B-gate-front)、`pavilion`(B-pavilion-gate-west)、`sideHall`(B-side-west-main) 等 67 槽全部实例化成功；尺度（开间模数经 `w/bays` 与 `MODULES.bayPitch` 体系一致）、材质令牌、LOD 档位三项均核对（§4/§5/§6）。
- **无异风格素材混入**：`public/assets/` 运行时资源 0 个、全仓无 GLTF/FBX/HDR/图片引用、无网络请求、只有一份 three r169（§3/§8）；`TextureLoader` 仅作为 core 的通用能力存在，无可加载素材。

## 6. G0 前置（灰盒覆盖）

- 灰盒注册 **67 栋**（≥54 门槛，`config.LAYOUT_CONSTRAINTS.minSlotCount = 54`）、覆盖 B/C/D/E/F 全部 5 区；障碍构成与 `layout.OBSTACLES` 逐 sourceType 一致（§9.1/9.3）。
- **14 院院落轮廓可机器核对**：56 面院墙（14×4）全部落在院界上、`wallIds` 与 `WALLS` 一一对应、共 49 个门洞、每院至少一处（§9.5）。
- 注册表数量：`SLOTS=67 / COURTYARDS=14 / WALLS=60 / CONNECTORS=32 / VIEWPOINTS=20 / LIGHT_ANCHORS=49`（§9.2，与 `LAYOUT_VERSION 1.0.0` 一致）。
- 浏览器侧（真实 WebGL，`docs/reports/g1-evidence/browser/`）：8 视角 1440×900 全部出图成功，场景 `建筑 67`、`主场景可绘制对象 218`、`整帧调用 207–240 / 可见三角面 194,770–199,866`、`实时宫灯 0/0（锚点 53）`、`kitSource: src/kit/index.js (t3)`。

## 7. 未验证 / 不确定性（不得当作已验证）

| 项 | 状态 | 原因与后续 |
| --- | --- | --- |
| 真实 GPU 帧率（avgFps / p95FrameMs） | **未验证** | 浏览器报告 `avgFps: 0 / p95FrameMs: 0`，GL 为 SwiftShader / `--disable-gpu` 软光栅，帧率不具代表性；须在有 GPU 的机器实测（t13） |
| D/E 两区能否用同一套 kit 达标 | **未验证（举例推断）** | D/E 模块尚未交付（`skip D/E`）。B/C/F 已实证；D/E 的构件类型（sideHall/pavilion/courtyardGate）与之同源，但不能替代实测。**风险提示**：D 区 14 槽预算 40、E 区 15 槽预算 40，而 C 区 12 槽未合批已占 48/50；D/E 必须依赖 `kit.mergeZone`（全城 67 槽合批实测 38 次调用）才能满足分区预算 → 交 t10/t11/t14 |
| 内景可读性余量 | **未验证（当前场景状态）** | 浏览器 `interior/goldenHour` 均值 0.063、暗区 76.12%，刚过主理人裁定门槛（氛围光 ≥0.04）但余量极小；须在 B 金銮殿内景内容落地后复测（G2/G4） |
| t3 自述的 `work/kit-sample.html` HUD 数字（70 调用 / 24,832 面） | **未复测** | 本次未运行 t3 的 work 样板页；主应用的浏览器实测（§4）已覆盖同类指标 |
| 首屏传输体积 / 纹理显存 | **未验证** | 无 npm 打包体积实测；`build.mjs` 报 dist 体积但非浏览器传输口径；KTX2 未实现（ASSET_CREDITS §5 已声明） |

## 8. 已登记欠账（DEBT，不阻断 G1；必须在对应阶段收口）

| ID | severity | 问题 | 最小修法 | owner |
| --- | --- | --- | --- | --- |
| D-1 | medium（文档） | `docs/CONTRACTS.md` §3.4 未写操作契约：`x/z/baseY`、`lod` 单档、返回 `THREE.LOD`、`params.door`、`mergeZone` 合批义务、`materials` 共享所有权/不得被区域 dispose、摆件工厂与 role 引用、以及「整槽展开」用法。实测仅用 §3.4 列出的 params 会让 67 栋全部落在原点（§12），且丢掉门洞记录（三角面 192,468 vs 192,420） | t20 在 §3.4 追加「操作契约」小节（可直接引自 `docs/handoff-kit.md` §2.2/§2.4 与 `src/kit/index.js` 头注释）并升 `CONTRACTS v1.1.0`，通知区域作者 | t20（t1 系列文件） |
| D-2 | medium（文档） | `docs/handoff-kit.md` §1 写「默认放行 + `createKit({strictRoofGrade:true})` 才抛错」，与实现（始终抛错、无该开关）及 CONTRACTS §4.2 相反 | 删除该行，改为「违规即抛错，无放行开关；正反例见 `tests/kit.test.mjs`」 | t3 |
| D-3 | low（文档） | `docs/handoff-kit.md` 与 `docs/ASSET_CREDITS.md` 版本戳仍为 `CONTRACTS v1.0.0 / CONFIG 1.0.0` | 同步为 `CONTRACTS v1.0.1 ⇄ CONFIG 1.0.1 ⇄ LAYOUT 1.0.0 ⇄ STYLE_BASELINE v1.0.0`（ASSET_CREDITS 再补 `KIT 1.0.0`） | t3 / t20 |
| D-4 | medium（约定） | 未文档化：`terraceH > 0.2` 的构件会自动附带台明 + 正面台阶（B-hall-main 因此南向超出槽位包围盒 **10.31m**；kit 无抑制开关）。`layout.TERRACES` 已为 B 主殿登记三层台基（z −168…−64），区域作者若同时用 `kit.terrace` + `kit.hall` 会出现台明/台阶重叠 | t20 在契约写明「带 TERRACES 的槽位如何组合」；t3 可选提供 `params.plinth=false / params.stairs=false` | t20（约定）+ t3（可选开关） |
| D-5 | medium（碰撞归属） | 56 段院墙（`layout.WALLS kind=courtWall`）既不在 `layout.OBSTACLES`（只有 4 段宫墙），灰盒 `colliders` 也未登记 → 当前第一人称不会被院墙阻挡；CONTRACTS §6.3 只承诺「宫墙四段」 | t20 明确院墙碰撞归属（区域 `colliders.obstacles` 或 layout 统一登记），并让灰盒与区域一致登记 56 段 | t20（归属）+ 各区域 / t9（碰撞） |
| OBS-1 | low（观察） | t3 的 roughness 相对 STYLE_GUIDE 表格值统一 +0.04（`WEATHERING.roughnessBias`），表格未标注这是「基础值」 | STYLE_GUIDE §2 补一句「渲染时统一 + `WEATHERING.roughnessBias`」 | t1 / t20 |

## 9. 纪律披露（本次评审唯一一次越界写操作，如实记录）

- 为取得真实浏览器证据，我运行了 **t2 拥有的工具** `node scripts/shot.mjs --view=zone --preset=golden`（未指定 `--out-dir`），其默认输出目录是 `docs/shots/`。该次运行：
  - 重新生成了 `docs/shots/t2-zone-golden.png`（同一机位/时辰/质量档，1440×900、111,669B，判据 `PASS`）；
  - 在 `docs/shots/manifest.json` 的 `results` 中更新了该条记录，并向 `history` 追加 `{"at":"2026-09-26T14:04:55.155Z","shots":["t2-zone-golden.png:ok"]}`；t2 此前的 18 条 results 记录与 history 条目均保留。
  - 我未编辑 `docs/shots/**` 的任何文本内容，也未删除任何文件。此后改用 `--out-dir=docs/reports/g1-evidence/...`，证据副本落在本次评审的 inScope 目录内。
- 未触碰：`src/**`、`public/**`、`index.html`、`imperial-palace-plan.md`、`tests/*.test.mjs`、`scripts/{audit,build,shot,serve}`。本次新增文件：`scripts/verify-g1-baseline.mjs`、`docs/reports/g1-verify-output.txt`、`docs/reports/g1-evidence/**`、本文件。

## 10. 结论

- **G1 判定：pass。** t3 构件库与 t2 核心在**实现层面**满足其全部验收：工厂集合完整、庑殿顶长正脊+四面坡（几何级验证）、材质 100% 令牌驱动且零散落硬编码、LOD 三档与合批/实例化实测有效（1335→38）、资源与许可登记完整（无第三方素材）；G0 前置的 67 槽与 14 院轮廓可机器核对；STYLE_GUIDE 47 组数值与 config 逐值一致；已有 B/C/F 三个真实区域仅靠同一套 kit 达成契约零问题。
- **不构成 t3 实现缺陷、但必须在后续阶段收口的欠账共 5 项**（D-1…D-5，另 OBS-1 观察），owner 分别为 t20（D-1/D-4/D-5）、t3（D-2/D-3）、t1（OBS-1）。其中 **D-1 若不关闭，D/E 区域作者将被迫从第二份文档或源码推断必需参数**，因此要求在 **G2 收口前**由 t20 完成；D-5 会直接影响 G3 第一人称「院墙阻挡」验收。
- **未验证项**（真实 GPU 帧率、D/E 实区达标、内景可读性余量、首屏传输/显存）已在 §7 逐条标注，均不作为 G1 通过的依据。
