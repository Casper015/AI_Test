# G2 场景完整性与跨区连接一致性 · 独立验证报告（t12 / V1）

> 验证人：`verifier`（独立评审员，只读交付代码；只写 tests/verify-completeness.test.mjs、scripts/verify-completeness.mjs、docs/report-completeness.md、docs/handoff-verifier.md）
> 门槛依据：`imperial-palace-plan.md` §8.1 G2 + §8.3 清单相关条目；契约 `CONTRACTS v1.0.6` ⇄ `CONFIG 1.0.3` ⇄ `LAYOUT 1.0.0` ⇄ `KIT 1.0.1` ⇄ three r169
> 方法要点：**不依赖任何实现者自述**——用 Node 直接装配 5 个区域 + core registry，对装配后的真实场景做**射线探测**（Raycaster，2m/32m 宽相位）与**碰撞体派生复核**，并用 t9 的 walk-solver/walk-graph 在**真实碰撞**下做连通性验证；浏览器侧自建静态服务 + headless Chrome 实测（含出图）。
> 结论：**G2 场景完整性通过**。全量（含浏览器）53 项：**51 PASS / 0 FAIL / 1 UNVERIFIED / 1 CONDITION**；`tests/verify-completeness.test.mjs`（Node 侧，验收入口）49 项：47 PASS / 0 FAIL / 1 UNVERIFIED（跳过浏览器）/ 1 CONDITION。CONDITION 与外部红灯均已定位 owner 与最小修法，见 §5。

---

## 1. 可复现命令与真实输出（逐字）

| # | 命令 | 退出码 | 真实输出（节选/全文摘要） |
| --- | --- | --- | --- |
| 1 | `cd "<ROOT>" && node tests/verify-completeness.test.mjs` | `0` | `检查项 49：PASS 47 / FAIL 0 / UNVERIFIED 1 / CONDITION 1`；`建筑 67 栋 / 院落 14 个 / 连接 32 条（区域返回，layout 32）/ 机位 20 个`；`整城 247 绘制调用 · 285608 三角面` |
| 2 | `cd "<ROOT>" && node tests/run.mjs` | `1`（外部在飞项） | `通过 14 / 15，失败 1`；唯一红项 `tests/kit.test.mjs`（`通过 648 / 653，失败 5`，全部属 §14 门洞解耦 / §18 内景采光，见 §5.3）；`tests/verify-completeness.test.mjs PASS (69246ms)` |
| 3 | `cd "<ROOT>" && node scripts/audit.mjs` | `0` | `主场景绘制调用 293 / 上限 350 ✓`；`分区 B 58/70 ✓ C 49/50 ✓ D 39/40 ✓ E 40/40 ✓ F 61/80 ✓`；`可见三角面 293841 / 上限 1500000 ✓`；`结论：全部预算与契约检查通过` |
| 4 | `cd "<ROOT>" && node scripts/verify-completeness.mjs`（含浏览器全量） | `0` | `检查项 53：PASS 51 / FAIL 0 / UNVERIFIED 1 / CONDITION 1`（浏览器段 11.1–11.4 全 PASS、11.5 目视项 UNVERIFIED）|

`node scripts/verify-completeness.mjs` 的 Node 段与 `tests/verify-completeness.test.mjs` 共用同一引擎（单一真相）；后者默认跳过浏览器是为了让 `tests/run.mjs` 保持确定性（本机 headless Chrome 首启偶发失败，需重试），`G2_VERIFY_BROWSER=1` 可补全。

## 2. 装配口径与可复现性（provenance）

- 装配方式：`buildZone(zoneId,{kit,registry,events})` → `createZone(ctx)` → `registry.registerZone(zoneId,result,{replace:true})`；**灰盒（GREYBOX）不参与统计**，仅单独做"可隐藏性"检查。城市级机位按 main.js 的路径 `registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS)` 登记。
- Node v26.10.0 · three r169 · KIT 1.0.1 · 射线 2276–3000 条（按需缓存）× 247 个可渲染网格。
- 本次验证对应的交付文件哈希（sha256，验证时刻）：

| 文件 | sha256（前 16 位） |
| --- | --- |
| `src/shared/config.js` | `6f78706c2deb5ad7` |
| `src/shared/layout.js` | `be9784b239ca16ee` |
| `src/kit/index.js` | `552cf389021d8b27` |
| `src/kit/buildings.js` | `2c61019fe39171f7` |
| `src/kit/geometry.js` | `41fb0c8c72a34df9` |
| `src/zones/forecourt.js` | `b95597c0cdd54949` |
| `src/zones/inner-palace.js` | `8b7f461018a5fbff` |
| `src/zones/west-courts.js` | `bf38a58a1ac4d959` |
| `src/zones/east-courts.js` | `60bad091911cd7cc` |
| `src/zones/garden-boundary.js` | `725195c380c94f70` |

> 说明：验证期间 `src/kit/{buildings,geometry}.js` 与 `tests/kit.test.mjs` 被队友并行修改（08:35:30），我在其后再跑了一遍 Node 全量（47 PASS / 0 FAIL），结论不变。

## 3. 逐项判定

### 3.1 建筑 ≥50（不得虚增）与逐区槽位一致 — **通过**

- `2.1` 注册建筑 **67** = `layout.SLOTS` 67（门槛 50）。`2.2` 67 个 id 全局唯一（无重复编号）。`2.3` 注册 id 集合与 layout **完全一致**（缺失 0 / 多出 0）。
- `2.4` 无廊段混入（`LAYOUT.CORRIDORS` 22 段 id 与建筑无交集；`kind` 全在 `hall/gateHall/sideHall/pavilion/cornerTower/courtyardGate` 内）→ 不存在"用廊段/拆件虚增"。
- `2.5` 逐区数量与集合：`B 12/12 · C 12/12 · D 14/14 · E 15/15 · F 14/14`（门槛 B≥8/C≥8/D≥8/E≥8/F≥10 全部满足）。
- `2.6` 逐字段回显：67 栋 × 15 字段（x/z/w/d/bays/terraceH/grade/name/kind/category/zone/roofType/facing/visitable/bounds）与 layout **全一致**（篡改即失败）。
- `2.7` **有顶**（几何级）：对每栋足迹 5×5 采样，要求①俯视每个采样点首先命中的是屋面（≥檐高−0.6m）覆盖 ≥90%、②檐上抬升 ≥1m、③脚下地面处有体量 ≥85%。结果 **67/67 通过**，檐上高度 4.30–14.92m（中位 7.33m）。
- `2.8` 每个区域都含 `roof`/`ridge`/`finial` 部件几何（合批后仍可辨识屋面部）：B/C/D/E/F 逐一列出。
- `2.9` kit 侧对 67 槽位全部产出可识别屋顶（庑殿/歇山/硬山有正脊；10 座攒尖为 4 面坡且**无正脊**、有顶点）。
- 方法学限制（如实声明）：区域普遍调用 `kit.mergeZone` 把逐栋几何合并成"区域×材质×部位"批次，**合并后无法按建筑逐一归属网格**；因此"有顶"由"足迹俯视覆盖 + 檐上高度 + 地面体量"三项几何证据 + kit 侧 67/67 形制证据共同证明，而不是逐栋网格归属。

### 3.2 院落 ≥12（有墙/门/廊道界定） — **通过**

- `3.1` **14 个院落**全部满足：≥3 面院墙 + `wallIds` 与 `WALLS` 一一对应 + ≥1 栋已注册建筑 + ≥1 处门洞。明细：
  `CY-B-plaza 墙4/建筑5/门洞8 · CY-B-throne 4/3/8 · CY-B-rear 4/4/6 · CY-C-front 4/3/4 · CY-C-main 4/3/4 · CY-C-rear 4/6/5 · CY-D-court1..4 4/3,3,4,4/1,1,2,3 · CY-E-court1..4 4/3,3,5,4/1,1,2,3`
- `3.2` **60 段墙（宫墙 4 + 院墙 56）在装配场景里实体化**：沿墙线 6m 步长采样（按 `openings.at` 扣除洞口），墙顶覆盖 ≥90% 且墙脚落地 ≥90% → 60/60 通过（墙顶最低 0.951、落地最低 1.000）。

### 3.3 宫墙闭环 / 角楼 / 城门层级 / 护城河与桥 — **通过**

- `4.1` 宫墙环闭合：三条环线（内外表面 ±0.5m + 中心线）4m 步长 **2282 点**，环上 3–35m 内存在几何 **2282/2282 = 100.00%** → 无断口。
- `4.1b` 主体墙身高度一致：中心线采样（扣除城门洞 ±48m 与角楼 ±12m）墙顶落在 10–16m 带内 → `南 58/58 · 北 58/58 · 西 88/88 · 东 88/88`。
- `4.2` 四段宫墙中心线**首尾相接成环**：4 段 × 2 端 = 8 个端点全部与相邻墙段相接（≤墙厚 8m）。
- `4.3` 四角角楼齐全且位于宫墙四角：`F-tower-corner-nw@(-304,454) · ne@(304,454) · sw@(-304,-454) · se@(304,-454)`，均有屋顶几何。
- `4.4` 城门层级：主门 `F-gate-south/north = grade3 + doubleEaveHip`，侧门 `F-gate-west/east = grade2 + gableHip`，主门等级严格更高。
- `4.5` 四座城门留出**可通行门洞**：门洞处 0.3–4.5m 净空内无 >0.55m 的障碍（地坪/坡道不计），门洞上方 8–26m 有城楼/墙体，两翼 6–20m 有墙 → 4/4 通过。
- `4.6` 护城河闭合成环：4 段相邻共边各 34m（`南+西/南+东/北+西/北+东`），环线 840 点 100% 落在河内，内岸 400 点 0 越界。
- `4.7`/`4.8` 水面几何：护城河环线 840 点（排除 4 桥投影）水面覆盖 100%；`WATER_BODIES` 8 个水体（护城河 4 + 水池 4）16 点采样全部命中水面。
- `4.9` 4 座桥：桥面与两端几何 ✓、跨满护城河 ✓、引道 `bridgeDeck` 与引坡 `bridgeRamp` 道路登记齐备 ✓（每桥 3 段）。
- `4.10` **无重墙**：同 owner 同线墙段零重叠；另有 4 处"跨院落共用墙"（`CY-B-plaza-wall-north≡CY-B-throne-wall-south` 等 192m），是同一道实体墙被两条院墙记录共享，core 已归并为单一碰撞盒 → 非缺陷，单独列出。
- `4.11` 派生墙体碰撞盒：83 个碰撞盒覆盖 **全部 60 段墙的每一段实体区间**（未覆盖 0）、平行重叠 0、角部相交 48 处（按厚度判定为允许）、悬空 0。

### 3.4 跨区连接一致性（32 条，唯一 owner） — **通过**

- `5.1` 32 条连接**每条由唯一 owner 区域返回**：返回 32/32，遗漏 0、重复 0；`owner/width/elevation/position.x/position.z/kind` 六字段与 layout 逐值一致（字段错误 0）。
- `5.2` 边界/标高/可走面/几何四项全通过：非"outside"连接落在两侧区域范围内；标高与连接点自身或 ±width 邻域地坪之一一致（丹陛/侧阶等"落点标高"语义）；两侧各有可行走面；连接处 3m 上下有几何 → 无断路、无悬空。
- `5.3` **真实碰撞下的连通性**：`createWalkSolver({registry})`（含 172 个障碍：core 派生墙 83 + 区域 85 + 去重 73）+ `cellSize=1` 栅格（841×1121，可走 711,227 格）→ 南桥起点 + 5 个 fp-spawn + 9 个 FP 走查路点 + 2 个内景机位**同属一个连通分量**。
- `5.4` 起点到各区出生点均有具体路径：`B 151m · C 769m · D 323m · E 321m · F 1001m`。
- **工具分辨率说明（重要）**：`cellSize≥2` 时丹陛/台阶每格抬升 0.88m+ 会被 `maxStepHeight=0.5` 判成不可跨 → 假阴性；本报告一律用 `cellSize=1`（每格抬升 0.44m）。这是测试工具分辨率问题，不是场景缺陷。

### 3.5 机位齐全性与内景可进入 — **通过**

- `6.1` 20 个机位全登记：`zone 7 / fp-spawn 5 / interior 2 / focus-extra 6`。`6.2` position/target/mode 20/20 逐字段回显。
- `6.3` 7 个 fp/interior 机位均落在 `layout.WALKABLE` 面内，视线高 = 面高 + 1.65m（±0.05）。
- `6.4` 金銮殿/寝殿 interior：夹在 CONTRACTS §5.3 室内包围盒内（B `x[-36,36] z[-134,-98]`、C `x[-27,27] z[154,182]`）、在所属建筑体量内、高于室内地面、**头顶有屋顶**（射线在机位上方命中屋面）。
- `6.5` 内景**确实可进入**（不是只有坐标）：南桥起点 → B 内景 **353m**、C 内景 **838m** 的实际路径存在。
- `7.1` 仅 `B-hall-main`/`C-hall-bed-main` 标记 `visitable`。`7.2` **67/67 栋**都有 `OB-<id>` 障碍登记（不可进入建筑不得可穿越）。
- `7.3` 障碍语义与门洞登记一致：18 栋有门洞 → `blocks='exceptDoor'` + `door` 记录（宽度逐栋一致）；49 栋无门洞 → `blocks='all'`。
- `7.4` 信息面板语义：65 栋不可进入建筑的 `info` 含「不可进入」，2 栋可进入建筑提示可进入 → 67/67 一致。

### 3.6 无遗留占位物 — **通过**

- `8.1` 5 个区域源码（**去注释后**）零 TODO/FIXME/placeholder/`_greybox` 依赖/骨架占位。
- `8.2` 注册表 67 栋建筑来源全为真实区域（无 GREYBOX / fallback / `GB-` 前缀）。
- `8.3` 灰盒可被 5 个区域**全部隐藏**：`setZoneVisible(B..F,false)` 全返回 true，隐藏后残留可见灰盒网格 **0**（灰盒自身部件：ground/terrace/wall/roof/roofRidge/courtWall/road/water/bridge，全部落在 5 个 zoneGroup 内 → 可整体隐藏）。
- `8.4` 源码核对：`main.js` 在真实区域装载后调用 `setZoneVisible(spec.zone,false)`，且灰盒装载受 `query.greybox` 开关控制。

### 3.7 资产/许可一致性与 404 风险 — **通过**

- `9.1` `docs/ASSET_CREDITS.md` 声明「无第三方素材」+ 9 字段登记表；`kit.assets.validate()` `{ok:true, checked:29, problems:0}`；运行时 `networkRequests=0`。
- `9.2` `public/assets/**` 非 README 文件 **0** 个。
- `9.3` 静态引用全解析：`index.html` 4 个引用（CSS/入口/import map）+ 47 个 `src/**`（相对 import、`three/addons/*` → import map 目标、CSS `url()`）**缺失 0**。
- `11.1` 运行时：42 条 HTTP 请求、**404 = 0**、`data-palace-ready="1"`、`zones=[GREYBOX,B,C,D,E,F]`、`buildings=67`、`kitSource=src/kit/index.js (t3)`、`主场景可绘制对象 286 ≤ 350`、`整帧调用 511`、`可见三角面 562,470`（含阴影 pass，与 audit 的 293,841 口径不同，均记录在案）。

### 3.8 浏览器侧与像素级项目

- 真实 headless Chrome（`chrome-headless-shell`，`--disable-gpu --enable-unsafe-swiftshader`）实测完成：**8 视角全部出图**，亮度/暗区（本脚本自带 PNG 解码，整帧口径）：`oblique 0.66/1% · iso 0.63/2% · axis 0.33/2% · zone 0.66/1% · focus 0.53/5% · interior 0.11/66% · fp 0.49/1% · orbit 0.41/4%`；全城机位 1440×900、均值 0.664、内容占比 30.0%、215.6KB。
- **图像写在系统临时目录**（`/var/folders/.../ip-verify-*`），按纪律不写入项目目录（`docs/shots/**` 属 t2/视觉任务）。
- `[UNVERIFIED] 11.5` **像素级目视项**（屋顶形制可辨识度 / 素材拼接感 / 院落疏密观感 / 水面接缝）需人眼判读，本次只提供机器可读指标与 8 视角出图；这是本报告唯一未验证项。
- 帧率仍未验证：环境为 SwiftShader 软光栅（`avgFps` 不具代表性），属 t13 范围。

## 4. 未验证 / 不确定性（不得当作已验证）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 像素级目视判读（形制可辨识度、拼接感、疏密、接缝） | 未验证 | 需人眼；已出 8 视角图但图在临时目录，未进项目 |
| 真实 GPU 帧率 / p95 帧耗时 / 显存 | 未验证 | SwiftShader 软光栅，`tests/verify-completeness` 不做帧率断言 |
| 合并后逐栋几何归属 | 方法限制 | 区域调用 `mergeZone` 后无法按建筑逐一归属网格；改用"足迹俯视覆盖 + 檐上高度 + 地面体量"三项几何证据（§3.1） |
| 逐栋"底面落地"毫米级对齐 | 依赖区域自测 | 本报告只验证"地面基准处有体量"；毫米级落地由各区自测断言（如 zone-garden `|底面−地坪| ≤ 0.0004m`）覆盖，本次未复算 |

## 5. 未通过/需上游处理项（含 file:line 与最小修法）

### 5.1 C-2（CONDITION，owner t2）：registry 不索引跨区连接

- 现象：区域共返回 32 条连接且字段与 layout 逐值一致（`5.1` 通过），但 `registry.stats().connectors = 0`、`registry.allConnectors() = []`（装配 5 个区域后仍为空）。
- 根因：`src/core/registry.js:379` 的连接登记循环位于 `registerColliders(zoneId, data)` 内、读取 `data.connectors`；而 `src/core/registry.js:544` 的 `registerZone` 只传入 `result.colliders`，`result.connectors` 从未进入该分支 → 连接索引恒空，连带「连接 id 唯一 owner」的重复校验也不生效（本次由本脚本独立复核通过）。
- 影响：`allConnectors()` 的任何消费方（导览/小地图/跨区提示/验收脚本）拿不到连接；不影响场景几何完整性。
- 最小修法：`registerZone` 中新增 `registerConnectors(zoneId, result.connectors ?? [])`（把 379 行循环抽成具名函数并在 replace 时清理），或临时改为 `registerColliders(zoneId, { ...result.colliders, connectors: result.connectors })`。

### 5.2 C-1：`openings.at` 语义在文档与实现之间的口径（已按实现核对，供 t20 落文档）

- 实现口径（`src/core/layout-slice.js` `wallSolidSpans`）：`openings[].at` 是**沿墙轴的世界绝对坐标**（`gap = [at−w/2, at+w/2]` 直接与墙的世界坐标区间做差）。
- `docs/CONTRACTS.md` §3.4（wall 工厂）写的是「`openings` 的 at = **相对墙中点的偏移**」——若按文档实现，`CY-D-court1-wall-east`（z −392…−244，门洞 at=−318）会把洞口算到 −636，院落门洞与实际碰撞盒错位。
- 本报告与脚本一律按**实现口径**核对并全部通过；文档口径需 t20 统一（否则 D/E/F 之后的重构会踩坑）。

### 5.2b 观察（owner t1/t20）：CONTRACTS 版本表内部不一致

`docs/CONTRACTS.md` 第 7 行标 `CONTRACTS v1.0.6`、第 9 行仍写 `CONFIG_VERSION 1.0.2`、第 13 行又写 `CONFIG_VERSION 1.0.3`（实现为 `CONFIG_VERSION = '1.0.3'`）。表格内三处版本戳需同步（与 t5/G1 报告 D-3 同类）。

### 5.3 外部红灯（不属于 G2 完整性，owner 见下）

- `node tests/run.mjs` 当前 `14/15`，唯一红项是 `tests/kit.test.mjs`（`648/653`），5 条失败全在 §14「门洞与形制解耦」与 §18「内景采光：隔扇窗为真实洞口 + 窗扇透光」：
  - `[near]/[mid] hall 无 door → 正面首碰是墙 — window`
  - `每个窗位在前立面上都是真实洞口（无 wall 遮挡）— 实际 0 ≠ 期望 6`
  - `门洞中心仍连通（与 §14 一致）— [{"part":"terrace"},{"part":"terrace"}]`
  - `窗扇材质 emissiveIntensity = 0 — 实际 1 ≠ 期望 0`
- 归属与状态：`src/kit/{buildings,geometry}.js` 与 `tests/kit.test.mjs` 在本次验证期间（08:32–08:35）被队友并行修改，属**在飞的 kit/内景采光改动**（非本任务文件、非场景完整性问题）。主理人此前告知的外部红灯（`tests/interaction.test.mjs` B3）在本次运行时已 **PASS**（t32 已完成同步）。
- 对 G2 的影响：无（建筑/院落/墙/门/水系/连接/内景几何与连通性均由本报告独立复核通过）。建议由该改动 owner 收口后重跑 `node tests/run.mjs`。

## 6. 纪律披露

- 本次评审曾一次性误用 `import('./scripts/shot.mjs')`（该文件顶层即 CLI），导致其在 08:10 以默认参数启动并写入 `docs/shots/t2-oblique-golden.png` 与 `docs/shots/manifest.json`（同一机位/时辰/质量档的一帧，判据 PASS）。发现后已**彻底改为自包含浏览器探针**（自建静态服务 + `chrome-headless-shell` + 自带 PNG 解码），后续所有出图一律写入系统临时目录。当时 `docs/shots/**` 正有队友在跑夜间批次，该次写入可能与其 manifest 更新竞争，特此披露；我未删除或编辑 `docs/shots/**` 任何文件。
- 本次只新增/修改 inScope 四个文件；未触碰 `src/**`、`public/**`、`index.html`、`main.js`、其他 imperial-palace* 目录。

## 7. 结论

- **G2 判定：通过。** 67 栋（逐区一致、无虚增、全部有顶）、14 个院落（墙/门/建筑齐备）、宫墙环 100% 闭合 + 四角楼 + 南北主门/东西侧门层级正确、护城河与 4 桥闭合成环、32 条连接唯一 owner 且字段一致、真实碰撞下南桥→五区→两处内景全部连通、无占位物残留、资产与许可一致且运行时 404 为 0。
- **需上游收口（不改变 G2 判定）**：C-2（t2，registry 连接索引，建议随下一次 core 改动一并修）；C-1（t20，`openings.at` 文档口径）；外部 kit.test §14/§18 红灯（对应改动 owner）。

---

## 8. attempt 3 复验（ROOT 被外部重命名之后）

> **重要环境事实（须团队知悉）**：本项目 ROOT 在本 attempt 期间被**外部重命名**——
> `…/AI_Test/imperial-palace copy 3` → `…/AI_Test/imperial-palace-dsh-1.1b`（同一棵树；`.git` 新建于 11:47，
> 我方 4 个 inScope 文件随重命名原样保留、mtime 不变 08:37–08:47）。任务卡里的旧路径已不存在；
> 本节测量均在**新路径**下重跑（脚本自身只读交付文件、出图写系统临时目录，未向仓库写入）。

### 8.1 三条契约 verify 命令（全部绿灯）

| 命令 | 退出码 | 真实输出 |
| --- | --- | --- |
| `node tests/verify-completeness.test.mjs` | `0` | `检查项 49：PASS 48 / FAIL 0 / UNVERIFIED 1`（跳过浏览器）；`建筑 67 栋 / 院落 14 个 / 连接 32 条（区域返回，layout 32）/ 机位 20 个`；`整城 247 绘制调用 · 285608 三角面` |
| `node tests/run.mjs` | `0` | `通过 19 / 19，失败 0，总耗时 46267ms`（含 `tests/kit.test.mjs` **653/653**、`tests/verify-completeness.test.mjs` PASS 24752ms） |
| `node scripts/audit.mjs` | `0` | `主场景绘制调用 293 / 上限 350 ✓`；`分区 B 58/70 ✓ C 49/50 ✓ D 39/40 ✓ E 40/40 ✓ F 61/80 ✓`；`可见三角面 293841 / 上限 1500000 ✓` |

### 8.2 全量（含浏览器）复跑

`node scripts/verify-completeness.mjs` → **exit 0**，`检查项 53：PASS 52 / FAIL 0 / UNVERIFIED 1 / CONDITION 0`：

- `11.1` ready=true、126 条请求、**404 = 0**；`11.2` 区域 `[GREYBOX,B,C,D,E,F]`、建筑 67、kit 来自 `src/kit/index.js`；`11.3` 主场景可绘制对象 286 ≤ 350（整帧 506 调用、可见三角面 570,786）。
- `11.4` 出图非空白：1440×900、均值 **0.664**、暗区 0.65%、内容占比 30.0%、215.6KB。
- 八视角机位：`oblique 0.66/1% · iso 0.63/2% · axis 0.33/2% · zone 0.66/1% · focus 0.54/3% · interior 0.30/4% · fp 本次未捕获成功（偶发）· orbit 0.41/4%`。
  （内景从上一版本的 0.11/66% 提升到 **0.30/4%**，与 t26/t31 的内景采光修复一致。）
- `11.5` 仍为唯一 UNVERIFIED：像素级目视判读需人眼。

### 8.3 上一 attempt 的 4 项上游/外部项：全部已修复并复验

| 项 | 复验证据 |
| --- | --- |
| `EXT-1` 外部红灯 `tests/kit.test.mjs` §14/§18 | 现为 **653/653 PASS**；`node tests/run.mjs` 19/19 exit 0 |
| `C-2` registry 不索引跨区连接 | 现为 `registry.allConnectors() = 32`、`stats().connectors = 32`；本脚本 `5.5` **PASS** |
| `C-1` `openings.at` 口径 | `docs/CONTRACTS.md` v1.0.7（t37）新增 §3.4.8：明确 `layout.WALLS[].openings[].at` = **沿墙轴世界绝对坐标**（权威 `layout-slice.js::wallSolidSpans`），并区分 `kit.wall(p)` 自身"相对墙中点"入参口径与换算，附正例/反例；本脚本 `3.2/4.1b/4.5/4.11` 按实现口径全部通过 |
| `OBS-2` CONTRACTS 版本表不一致 | 现为 `CONTRACTS v1.0.9` ⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT 1.0.0` ⇄ `KIT 1.0.1` ⇄ `STYLE_BASELINE 1.0.0`，头部表逐项与运行时读出值一致 |

### 8.4 观察（环境类，非场景缺陷）

- 在 ROOT 被重命名的那一刻，我的一次全量复跑出现 `11.4` **8 张纯白帧**（均值 1.000、内容 0.0%、6.9KB），同一批次的 DOM 报告却是健康的（区域/建筑/kit/可见三角面均正常）；随后在重命名后的树上复跑即恢复正常（均值 0.664）。判定为**重命名/移动期间 headless 捕获的环境抖动**，非场景回归；`fp` 视角偶发捕获失败同属此类。脚本已采用"每次尝试全新 `--user-data-dir` + 最多 5 次重试"，仍建议像素级验收在无并发移动的窗口内进行。

### 8.5 attempt 3 结论

**G2 判定维持通过**：三条契约 verify 命令全绿（exit 0 × 3），全量 53 项 52 PASS / 0 FAIL / 0 CONDITION，唯一 UNVERIFIED 为人类目视判读项；上一 attempt 的 4 项上游/外部项均已修复并逐条复验。

---

## 12. t77 追加：扩容后期望同步 + 43 处内景连通性独立复验（LAYOUT 1.1.4）

> 本席（verifier）用自己的引擎独立复验 t75 的 43 条门洞通道面与内景可达性，不引用 layout.test 的断言。
> 前置已确认：**F5 已修**（`src/core/context.js:79 WALKABLE_KINDS` 现含 `'passage'`），区域可正常装配。

### 12.1 期望值同步（本席两个套件，按 LAYOUT 1.1.4 实测）

| 断言 | 旧口径（扩容前） | 新口径（实测） | 依据 |
| --- | --- | --- | --- |
| `verify-completeness` 6.1 机位 | total 20 / interior 2 | **total 61 / zone 7 / fp-spawn 5 / interior 43 / focus-extra 6** | LAYOUT 1.1.4 实际注册表（t70/t72/t74 为每栋有门建筑派生内景机位；t75 加 43 条门洞通道面） |
| `verify-completeness` 7.1 visitable | 仅 2 栋（金銮殿/寝殿） | **43 栋 = `INTERIOR_BY_SLOT` 43 条逐值一致，且 ∈ 53 栋有门建筑** | 原意（"只有可进入建筑被标记 visitable"）守住：改为与内景登记一一对应，不硬编码名单 |
| `verify-experience` A3 机位普查 | 20（B/C 各 1 interior） | **61（zone 7 / fp-spawn 5（每区 1） / interior 43（按区 B10 C9 D4 E4 F4…）/ focus-extra 6）** | 同上；语义保持：zone 覆盖每区、fp-spawn 每区恰 1、B/C 必有 interior、interior 数 = `INTERIOR_BY_SLOT` 条数 |
| `verify-completeness` 5.3 走查点 | 9 路点 + 2 内景 | **50 路点 + 5 fp-spawn + 43 内景** | `FP_ROUTE` 50（t75 冻结不变）；判据未放宽（仍是"同属一个连通分量"） |

### 12.2 逐栋门洞通道面几何复核（43 行，不抽样）

- **通道面存在**：43/43（`WK-<slotId>-door-passage`，与 `INTERIOR_BY_SLOT` 43 条一一对应）。
- **宽度 == `door.width`**：**43/43** ✓（26/26、24/24、22/22、20/20、12/12 等逐值一致）。
- **`y == door.sillY`**：**38/43**；不符 5 栋 —— `C-hall-bed-main`（passage 2.4 vs sillY 1.5）、`F-gate-{south,north,west,east}`（passage 0.4 = 已登记通道地面 vs sillY/groundY 12.4 = **城楼门洞**标高）。属"一栋两套标高"的记录语义问题（最小修法见 §12.5-F10）。
- **`y == 该栋登记内景可行走面 y`**：**18/43**；**25 栋存在固定 0.4m 偏移**（例：`C-annex-east` 0.5 vs 1.4、`D-court1-hall` 0.9 vs 1.3、`E-court1-house` 0.5 vs 0.9）。即 t75 回执中"y = 该栋内景地面"对 25 栋并不字面成立：通道面取的是 `door.sillY`（门外门槛面），室内地面高出 0.4m（台明/门槛）。**好处**：0.4 ≤ 台阶阈值 0.5，因此这 25 栋反而**可通行**；**代价**：与回执表述不一致，且把"门槛→室内"的 0.4m 台阶留在了建筑内部。
- **与室内面 / 室外面相接**：**43/43 / 43/43** ✓（gap ≤ 0.05m；并记录室外最小标高差：**8 栋 > 0.5m 台阶阈值**：`B-hall-mid(Δ2) B-hall-rear(Δ1.8) B-side-{east,west}-rear(Δ1) B-side-{east,west}-south(Δ0.9) E-court{1,2}-hall(Δ0.6)`）。

### 12.3 生产口径连通性（本席引擎：walk-solver + walk-graph，cellSize=1，含 registry 障碍）

- 起点 `WK-F-bridge-south` → **43 处内景：33 可达 / 10 不可达**（逐栋结论）：
  **可达 33**：`B-gate-front`、`B-hall-main`、C 区 9 栋（含 `C-hall-bed-main`）、D 区 8 栋、E 区 `E-court{3,4}-*` 等、F 区 `F-gate-*` 4 座与 `F-garden-hall-*` 3 栋、`B-side-*` 中台明 ≤0.5m 的若干。
  **不可达 10**：`B-side-west-south`、`B-side-east-south`、`B-side-west-main`、`B-side-east-main`、`B-side-west-rear`、`B-side-east-rear`、`B-hall-mid`、`B-hall-rear`、`E-court1-hall`、`E-court2-hall`（对应 `FP_ROUTE` 的 10 个"…门内"路点）。
- **原因（实测定位）**：门洞通道面是**平面**且位于门内标高，室外地面比它低 **0.6–2.0m**（8 栋，见 §12.2），或内景位于 B 主殿**台基一层**（1.5m，2 栋）而其上台只能经**台基侧面台阶**；而**生产走查层（`src/interaction/walk-solver.js` / `walk-graph.js`）完全不消费 `layout.CONNECTORS`**（`grep -c connector` = 0），可行走面模型又没有坡道/台阶过渡 ⇒ 0.5m 台阶阈值把它们判为不可跨。
- **改动前对照（本席自建无 passage 布局重建求解器与图）**：**改动前 0/43 → 改动后 33/43**（净增 33）⇒ 通道面确实带来连通性，t75 的"改动前不连通"在本席口径下**复现**；但"43/43 全连通"在生产口径下**不成立**。

### 12.4 本卡判定

- 期望同步（准则 1）：**完成**（上表，含语义依据）。
- 连通性独立复验（准则 2）：**不通过** —— 43 处内景在生产口径下 33 可达 / **10 不可达**（逐栋已列，非抽样）。
- 不放宽判据（准则 3）：**满足** —— 5.3 仍为"同属一个连通分量"强判据；另新增 5.4/5.4b/5.5/5.6（逐栋几何 + 改动前对照），未改为"内景面存在"这类弱形式。
- 通道面几何（准则 4）：**部分不通过** —— 宽度 43/43 ✓、与室内外相接 43/43 ✓；但 `y == door.sillY` 38/43（5 栋不符，见 §12.2），`y == 内景地面` 18/43（25 栋 0.4m 偏移）。
- 三条 verify：`verify-completeness.test.mjs` → 48 PASS / 3 FAIL（5.3 / 5.4 / 5.4b）；`verify-experience.test.mjs` → 24 PASS / 4 FAIL（B1 / B10 / C1 / F1）；`scripts/verify-completeness.mjs` 同源（5.3/5.4/5.4b 红）。红项归因见 §12.5。

### 12.5 未通过项与最小修法（按 owner）

- **F8（blocker，owner：t1/layout + core-engineer）**：**10 处内景在生产走查口径下不可达**（8 处门内外落差 0.6–2.0m；2 处位于 B 主殿台基一层，仅台基侧阶可达）。最小修法（二选一或并用）：① layout 在这 10 处门外登记**可行走过渡**（`ROADS` 段带 `from.y→to.y` 线性插值，跑长 ≥ Δy/0.62；或在 WALKABLE 体系里增加坡道面）——这是既有 `CXN-*-danbi` 已验证有效的机制；② core/interaction 让走查层**消费 `layout.CONNECTORS`（`kind:'stairs'/'gate'`）并赋予坡道语义**（本卡实测：当前 `walk-solver.js`/`walk-graph.js` 对 connectors 零引用；若采纳②，还需 layout 为这 10 处补登记 connector）。修好后判据 5.3 应自然转绿。
- **F10（medium，owner：t1/layout）**：`door.sillY` 与内景地面/通道面标高的**双轨记录**未统一：25 栋通道面比室内地面低 0.4m（`door.sillY` 语义 = 门外门槛面），`C-hall-bed-main` 的 `door.sillY=1.5`/`INTERIOR_BY_SLOT.groundY=1.5` 与其实际内景面 2.4 冲突，`F-gate-*` 的 `sillY=12.4`（城楼门）与通道地面 0.4 并存。最小修法：在 CONTRACTS §4 明确 `door.sillY` = **门外门槛面**、内景地面另由 `INTERIOR_BY_SLOT.walkableId.y` 表达，并把 `C-hall-bed-main` 的 `sillY/groundY` 修正为 2.4（或通道面改为跟随门槛并补 0.4m 台阶说明）；城门保留双标高但需在文档标注"城楼门 ≠ 通道门"。
- **F11（blocker for G4，owner：各区域 + core；非本卡 inScope）**：本次内景扩容后**分区绘制调用超预算**：`C 58/50`、`D 51/40`、`E 52/40`（激活 LOD 档、质量 medium、Node 装配口径；audit --enforce 同源）。最小修法：区域内对新内景陈设与门洞构件扩大合批/实例化（`kit.mergeZone` 已调用，但新内景件可能逐件独立），或按 §8.2 走"主 Agent 复核+调整配额"流程。
- **F7（medium，owner：ui-engineer，与 t13 同源）**：信息面板仍以 layout 估值展示"脊高约 X m"（`src/ui/index.js:380`，数据 `src/interaction/catalog.js:205`）。
- **F1（t13 遗留，非本卡）**：24 格矩阵 3 格受此前 0 区域装载/掩码错配影响，需在 F8/F11 收口后由 t13 复跑。

### 12.6 过程记录（在飞状态，已恢复）

本轮期间观察到两次瞬时装配失败并已恢复：`src/zones/forecourt.js:693 config.deriveSeed is not a function`（B 区）与 `garden-boundary.js ZONE is not defined`（F 区）——两者均在随后复跑中恢复（本次最终复跑 5 区全部装配成功）。如实记录，供 owner 参考是否仍有残留。

---

## 15. t100：门外权威 Δ 清单（生产口径逐栋，供过渡登记）

> attempt `1fcde648-713e-43eb-a192-bb49f44ce26f` · 测量脚本 `/tmp/t100-delta4.mjs`（**只读**，未改 `src/**`）· 原始读数 `/tmp/t100-delta4.json`
> **测量时点树状态**：`LAYOUT_VERSION = 1.1.8`（t97「`door.sillY = 区域地坪 + 本地台基`」已落地）；走查层已引用 `layout.CONNECTORS`，但求解器自报 **`connectorStats = {"declared": 32, "ramps": 0, "disabled": false, "ids": []}`**（声明 32 条、**ramps 0**）。
> **时点不可比声明（主理人已采纳）**：t77 的「33/43 可达、10 不可达」测于 **LAYOUT 1.1.4**（t97/t88 之前）；t88 的「25/18」测于其各自时点；本卡测于 **1.1.8 + t88/t97 之后**。**三方数字不可直接比较**，本表全部为本时点实测。
> **并集覆盖**：t77 的 10 栋（`B-side-west/east-south|main|rear`、`B-hall-mid`、`B-hall-rear`、`E-court1-hall`、`E-court2-hall`）**∪ t87 报的 13 台** ⇒ 本时点不可达内景 **18 栋**（t77 的 10 栋全部在内，按现状超集逐栋给出）。总览：43 处内景 **25 可达 / 18 不可达**。

### 15.1 口径与方法（可复现，全部只读）

| 项 | 实现 |
| --- | --- |
| 装配 | `scripts/verify-walk.mjs → assembleCity()`（真 kit + registry 5 区） |
| 可行走图 | `createWalkGraph(solver, { cellSize: 1 })` — **生产求解器**（t86 子步进 / t88 connector 引用 / t97 基准统一），**不是采样估计** |
| 可达性 | `graph.connected([起点, …候选点])`（**单次 BFS**）；起点 = `FP_ROUTE[0]` = 南桥北端；内景可达 = `graph.path(起点 → 内景机位)` |
| 地面高度 | `layout.floorYAt(x,z)`；覆盖面 = `layout.walkableAt(x,z)[0]`；室内地面 = `INTERIOR_BY_SLOT[slot].walkableId` 面高 |
| **门外基准** | t75 通道面 `WK-<slotId>-door-passage` 的**进深轴**（= 通道面较短的一边，实测 6.6m）**外端**（两端中离室内面中心更远者）；候选点＝外端沿外法向 **+0.5 / 1 / 2 / 3 / 5 / 8 m** |
| 门外地面（主口径） | 候选中**从起点可达**的**最近**一个的 `floorYAt`；无可达候选 ⇒ 用几何口径并标注 |
| 门外地面（并列口径） | 候选中**首个「非 interior、非 passage」面**的 `floorYAt`（不看可达性） |
| 过渡参数 | `ceil(|Δ|/0.5)`（`maxStepHeight=0.5`）、最小跑长 `|Δ|/0.62`（`rampMaxSlope=0.62`）；`Δ<0` = 需**向下**过渡 |

> **为什么以「通道面进深轴外端」为基准**：① `SLOT.door.center` **不是门脸点**（`B-side-west-main`：door.center=(−80,−116)，建筑 x[−88,−72] 的东立面在 x=−72，通道面 x[−72.6,−66] ⇒ 从 door.center 沿 facing 取样会从建筑内部往外穿）；② 通道面的**长边 = 门宽（沿墙 26m）**、**短边 = 进深（6.6m）**，后者才是门外法向。v1/v2（door.center 起算）与 v3（误把长边当法向轴）的口径错误均已作废，最终以本节 v4 为准。

### 15.2 表 A：不可达内景 18 栋（t77 的 10 栋全部在内）

| slotId | 区 | 室内地面 y | **门前地面 y（可达外点）** | **归属面（id/kind）** | **门外点 (x, z)** | **Δ（可达口径）** | Δ（几何口径） | `ceil(|Δ|/0.5)` | 最小跑长 \|Δ\|/0.62 | t77 | 类型 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `B-hall-mid` | B | 2 | 0 | `ground:WK-B-ground-north` | (0, -40.5) | **2** | 2 | 4 | 3.23 | t77 | a-gap |
| `B-hall-rear` | B | 1.8 | 0 | `ground:WK-B-ground-north` | (0, 22.5) | **1.8** | 1.8 | 4 | 2.9 | t77 | a-gap |
| `B-side-east-main` | B | 1.5 | 3 | `terrace:WK-B-terrace-tier2` | (65.5, -116) | **-1.5** | -1.5 | 3 | 2.42 | t77 | a-gap(neg) |
| `B-side-east-rear` | B | 1 | 0 | `ground:WK-B-ground-north` | (53.5, 44) | **1** | 1 | 2 | 1.61 | t77 | a-gap |
| `B-side-east-south` | B | 0.9 | 0 | `ground:WK-B-plaza` | (58.5, -300) | **0.9** | 0.9 | 2 | 1.45 | t77 | a-gap |
| `B-side-west-main` | B | 1.5 | 3 | `terrace:WK-B-terrace-tier2` | (-65.5, -116) | **-1.5** | -1.5 | 3 | 2.42 | t77 | a-gap(neg) |
| `B-side-west-rear` | B | 1 | 0 | `ground:WK-B-ground-north` | (-53, 44) | **1** | 1 | 2 | 1.61 | t77 | a-gap |
| `B-side-west-south` | B | 0.9 | 0 | `ground:WK-B-plaza` | (-58, -300) | **0.9** | 0.9 | 2 | 1.45 | t77 | a-gap |
| `C-hall-bed-rear` | C | 2.1 | 0.9 | `ground:WK-C-ground` | (0, 236.5) | **1.2** | 1.2 | 3 | 1.94 |  | a-gap |
| `C-side-east-rear` | C | 1.5 | 0.9 | `ground:WK-C-ground` | (47.5, 250) | **0.6** | 0.6 | 2 | 0.97 |  | a-gap |
| `C-side-west-rear` | C | 1.5 | 0.9 | `ground:WK-C-ground` | (-47, 250) | **0.6** | 0.6 | 2 | 0.97 |  | a-gap |
| `D-court1-hall` | D | 1.3 | 0.4 | `ground:WK-D-ground` | (-243, -318) | **0.9** | 0.9 | 2 | 1.45 |  | a-gap |
| `D-court2-hall` | D | 1.3 | 0.4 | `ground:WK-D-ground` | (-243, -158) | **0.9** | 0.9 | 2 | 1.45 |  | a-gap |
| `D-court3-hall` | D | 1.3 | 0.4 | `ground:WK-D-ground` | (-243, 2) | **0.9** | 0.9 | 2 | 1.45 |  | a-gap |
| `D-court4-hall` | D | 1.3 | 0.4 | `ground:WK-D-ground` | (-243, 188) | **0.9** | 0.9 | 2 | 1.45 |  | a-gap |
| `E-court1-hall` | E | 1.4 | 0.4 | `ground:WK-E-ground` | (237.5, -320) | **1** | 1 | 2 | 1.61 | t77 | a-gap |
| `E-court2-hall` | E | 1.4 | 0.4 | `ground:WK-E-ground` | (242.5, -150) | **1** | 1 | 2 | 1.61 | t77 | a-gap |
| `E-court4-hall` | E | 1.3 | 0.4 | `ground:WK-E-ground` | (240.5, 200) | **0.9** | 0.9 | 2 | 1.45 |  | a-gap |

> 说明：`Δ<0` 表示门外基准点**比室内高**（需**向下**过渡），过渡参数按 `|Δ|` 给出（表中两处 `a-gap(neg)` 行：Δ=−1.5 ⇒ 3 级 / 跑长 2.42m）。

### 15.2b 表 A 的**全部门外候选点**（每栋 6 个，沿通道面进深轴外端向外；✓=该点从起点可达）

| slotId | 通道面 y | d=0.5 | d=1 | d=2 | d=3 | d=5 | d=8 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `B-hall-mid` | 2 | (0,-40.5) y0 `ground` ✓ | (0,-41) y0 `ground` ✓ | (0,-42) y0 `ground` ✓ | (0,-43) y0 `ground` ✓ | (0,-45) y0 `ground` ✓ | (0,-48) y0 `ground` ✓ |
| `B-hall-rear` | 1.8 | (0,22.5) y0 `ground` ✓ | (0,22) y0 `ground` ✓ | (0,21) y0 `ground` ✓ | (0,20) y0 `ground` ✓ | (0,18) y0 `ground` ✓ | (0,15) y0 `ground` ✓ |
| `B-side-east-main` | 1.5 | (65.5,-116) y3 `terrace` ✓ | (65,-116) y3 `terrace` ✓ | (64,-116) y3 `terrace` ✓ | (63,-116) y3 `terrace` ✓ | (61,-116) y3 `terrace` ✓ | (58,-116) y3 `terrace` ✓ |
| `B-side-east-rear` | 1 | (53.5,44) y0 `ground` ✓ | (53,44) y0 `ground` ✓ | (52,44) y0 `ground` ✓ | (51,44) y0 `ground` ✓ | (49,44) y0 `ground` ✓ | (46,44) y0 `ground` ✓ |
| `B-side-east-south` | 0.9 | (58.5,-300) y0 `ground` ✓ | (58,-300) y0 `ground` ✓ | (57,-300) y0 `ground` ✓ | (56,-300) y0 `ground` ✓ | (54,-300) y0 `ground` ✓ | (51,-300) y0 `ground` ✓ |
| `B-side-west-main` | 1.5 | (-65.5,-116) y3 `terrace` ✓ | (-65,-116) y3 `terrace` ✓ | (-64,-116) y3 `terrace` ✓ | (-63,-116) y3 `terrace` ✓ | (-61,-116) y3 `terrace` ✓ | (-58,-116) y3 `terrace` ✓ |
| `B-side-west-rear` | 1 | (-53.5,44) y0 `ground` ✗ | (-53,44) y0 `ground` ✓ | (-52,44) y0 `ground` ✓ | (-51,44) y0 `ground` ✓ | (-49,44) y0 `ground` ✓ | (-46,44) y0 `ground` ✓ |
| `B-side-west-south` | 0.9 | (-58.5,-300) y0 `ground` ✗ | (-58,-300) y0 `ground` ✓ | (-57,-300) y0 `ground` ✓ | (-56,-300) y0 `ground` ✓ | (-54,-300) y0 `ground` ✓ | (-51,-300) y0 `ground` ✓ |
| `C-hall-bed-rear` | 2.1 | (0,236.5) y0.9 `ground` ✓ | (0,236) y0.9 `ground` ✓ | (0,235) y0.9 `ground` ✓ | (0,234) y0.9 `ground` ✓ | (0,232) y0.9 `ground` ✓ | (0,229) y0.9 `ground` ✓ |
| `C-side-east-rear` | 1.5 | (47.5,250) y0.9 `ground` ✓ | (47,250) y0.9 `ground` ✓ | (46,250) y0.9 `ground` ✓ | (45,250) y0.9 `ground` ✓ | (43,250) y0.9 `ground` ✓ | (40,250) y0.9 `ground` ✓ |
| `C-side-west-rear` | 1.5 | (-47.5,250) y0.9 `ground` ✗ | (-47,250) y0.9 `ground` ✓ | (-46,250) y0.9 `ground` ✓ | (-45,250) y0.9 `ground` ✓ | (-43,250) y0.9 `ground` ✓ | (-40,250) y0.9 `ground` ✓ |
| `D-court1-hall` | 1.3 | (-243.5,-318) y0.4 `ground` ✗ | (-243,-318) y0.4 `ground` ✓ | (-242,-318) y0.4 `ground` ✓ | (-241,-318) y0.4 `ground` ✓ | (-239,-318) y0.4 `ground` ✓ | (-236,-318) y0.4 `ground` ✓ |
| `D-court2-hall` | 1.3 | (-243.5,-158) y0.4 `ground` ✗ | (-243,-158) y0.4 `ground` ✓ | (-242,-158) y0.4 `ground` ✓ | (-241,-158) y0.4 `ground` ✓ | (-239,-158) y0.4 `ground` ✓ | (-236,-158) y0.4 `ground` ✓ |
| `D-court3-hall` | 1.3 | (-243.5,2) y0.4 `ground` ✗ | (-243,2) y0.4 `ground` ✓ | (-242,2) y0.4 `ground` ✓ | (-241,2) y0.4 `ground` ✓ | (-239,2) y0.4 `ground` ✓ | (-236,2) y0.4 `ground` ✓ |
| `D-court4-hall` | 1.3 | (-243.5,188) y0.4 `ground` ✗ | (-243,188) y0.4 `ground` ✓ | (-242,188) y0.4 `ground` ✓ | (-241,188) y0.4 `ground` ✓ | (-239,188) y0.4 `ground` ✓ | (-236,188) y0.4 `ground` ✓ |
| `E-court1-hall` | 1.4 | (237.5,-320) y0.4 `ground` ✓ | (237,-320) y0.4 `ground` ✓ | (236,-320) y0.4 `ground` ✓ | (235,-320) y0.4 `ground` ✓ | (233,-320) y0.4 `ground` ✓ | (230,-320) y0.4 `ground` ✓ |
| `E-court2-hall` | 1.4 | (242.5,-150) y0.4 `ground` ✓ | (242,-150) y0.4 `ground` ✓ | (241,-150) y0.4 `ground` ✓ | (240,-150) y0.4 `ground` ✓ | (238,-150) y0.4 `ground` ✓ | (235,-150) y0.4 `ground` ✓ |
| `E-court4-hall` | 1.3 | (240.5,200) y0.4 `ground` ✓ | (240,200) y0.4 `ground` ✓ | (239,200) y0.4 `ground` ✓ | (238,200) y0.4 `ground` ✓ | (236,200) y0.4 `ground` ✓ | (233,200) y0.4 `ground` ✓ |

### 15.3 表 B：已可达内景 25 栋（**Δ≈0 / |Δ|≤0.5 ⇒ 无需过渡**，明确标出）

| slotId | 区 | 室内地面 y | 门前地面 y（可达外点） | 归属面（id/kind） | 门外点 (x, z) | Δ（可达口径） | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `B-gate-front` | B | 0.45 | 0.005555555555555536 | `ground:WK-F-belt-south` | (0, -404.5) | 0.444 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `B-hall-main` | B | 4.5 | 4.5 | `terrace:WK-B-terrace-tier3` | (0, -146.5) | 0 | **Δ=0（门外同高，已可达，无需过渡）** |
| `C-annex-east` | C | 1.4 | 0.9 | `ground:WK-C-ground` | (54.5, 288) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `C-annex-west` | C | 1.4 | 0.9 | `ground:WK-C-ground` | (-54.5, 288) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `C-gate-inner` | C | 0.9 | 0.7676470588235293 | `ground:WK-B-ground-north` | (0, 75.5) | 0.132 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `C-hall-bed-main` | C | 2.4 | 2.4 | `terrace:WK-C-bed-terrace` | (0, 142.5) | 0 | **Δ=0（门外同高，已可达，无需过渡）** |
| `C-side-east-main` | C | 1.7000000000000002 | 2.4 | `terrace:WK-C-bed-terrace` | (49.5, 168) | -0.7 | Δ 超阈但**已可达**（经其它侧/上层路线，见 §15.5-3） |
| `C-side-west-main` | C | 1.7000000000000002 | 2.4 | `terrace:WK-C-bed-terrace` | (-49.5, 168) | -0.7 | Δ 超阈但**已可达**（经其它侧/上层路线，见 §15.5-3） |
| `D-court1-house` | D | 0.9 | 0.4 | `ground:WK-D-ground` | (-176, -373.5) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `D-court2-house` | D | 0.9 | 0.4 | `ground:WK-D-ground` | (-176, -213.5) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `D-court3-house` | D | 0.9 | 0.4 | `ground:WK-D-ground` | (-176, -53.5) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `D-court4-house` | D | 0.9 | 0.4 | `ground:WK-D-ground` | (-176, 132.5) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `E-court1-house` | E | 0.9 | 0.4 | `ground:WK-E-ground` | (180.5, -364) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `E-court2-house` | E | 0.9 | 0.4 | `ground:WK-E-ground` | (180, -111.5) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `E-court3-annex` | E | 0.9 | 1.3 | `interior:WK-E-court3-hall-interior` | (265.5, 20) | -0.4 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `E-court3-hall` | E | 1.3 | 0.4 | `ground:WK-E-ground` | (237.5, 20) | 0.9 | Δ 超阈但**已可达**（经其它侧/上层路线，见 §15.5-3） |
| `E-court3-house` | E | 0.9 | 0.4 | `ground:WK-E-ground` | (176, -39.5) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `E-court4-house` | E | 0.9 | 0.4 | `ground:WK-E-ground` | (180, 134.5) | 0.5 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `F-garden-hall-east` | F | 0.5 | — | — | — | None | 门外候选全在室内/通道面内（几何 Δ=0）⇒ 门内外同高 |
| `F-garden-hall-north` | F | 0.8 | 0.5 | `gardenGround:WK-F-garden` | (0, 386.5) | 0.3 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `F-garden-hall-west` | F | 0.5 | — | — | — | None | 门外候选全在室内/通道面内（几何 Δ=0）⇒ 门内外同高 |
| `F-gate-east` | F | 0.4 | 0.5733333333333334 | `ground:WK-F-berm-east` | (323.5, 0) | -0.173 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `F-gate-north` | F | 0.4 | 0.8 | `bridgeDeck:WK-F-bridge-north` | (0, 473.5) | -0.4 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `F-gate-south` | F | 0.4 | 0.8 | `bridgeDeck:WK-F-bridge-south` | (0, -473.5) | -0.4 | |Δ|≤0.5：一步内（已可达，无需过渡） |
| `F-gate-west` | F | 0.4 | 0.5733333333333334 | `ground:WK-F-berm-west` | (-323.5, 0) | -0.173 | |Δ|≤0.5：一步内（已可达，无需过渡） |

### 15.4 分类：(a) 高差型 / (b) 口袋-通道型 / (c) 其它

**判据（精确、可复算；只对不可达内景分类）**：

- **(a) 高差型**：`|Δ(可达门外点)|` 超过求解器可跨阈值（`Δ>+0.5` 上台阶阈值 / `Δ<−0.6` 下台阶阈值）⇒ 需要过渡面（含**向下**过渡）。
- **(b) 口袋/通道型**：`|Δ|` 在可跨区间内 **但**内景仍不可达（门口同高却进不去 = 封闭/无口/单向）。
- **(c) 其它**：通道面外端 0.5–8m 内**找不到任何可达候选**（无法支撑该测量）。
- **同栋可属多类**：`gap` 与 `pocket` 两布尔**独立计算** ⇒ 理论可 `gap ∧ pocket`；**本时点 dual = 2**（两处 `a-gap(neg)`：门前高差 1.5m **且**通道面↔室内面不可跨，见表 A 与 §15.5-4）。

**每类栋数（本时点）**：(a) 高差型 **18 栋**（Δ>+0.5 的 **16** 栋、Δ=−1.5 的 **2** 栋）· (b) 口袋/通道型 **0 栋** · (c) 其它 **0 栋** · 双类 **2 栋**。

**Δ 范围**：不可达 18 栋 Δ ∈ [-1.5, 2] m。**16 栋需要向上过渡（Δ 0.6–2.0）· 2 栋需要向下过渡（Δ=−1.5）**。

**与 t88「封团者内/外地面同高」的分歧并列（不选边）**：
- 本表**几何口径**列（不看可达性、取首个非 interior/passage 面）在本时点也不产生 Δ≈0 的不可达行（射线自通道面外端起算，第一站就在室外地面/台基上）。
- t88 的“同高”若指**门内通道面与门外台基面**同高：`B-side-west-main/east-main` 的门内通道面 y=1.5，而通道面外端之外即 `WK-B-terrace-tier2`（y=**3.0**）⇒ 外面反而**高 1.5m**；真正与室内同高（1.5）的是 `WK-B-terrace-tier1`（中心 (0,−116)，实测**从起点可达 ✓**）——但它**不与门洞通道面相邻**（两处实测：通道面↔室内面不可跨、tier1 在另一侧）。这正是“两人都不完全对”的情形：**既不是单纯高差、也不是单纯口袋，而是两者叠加**（本卡按 dual 标注）。
- **两套口径的读数都给出**，裁定（过渡登记以谁为基准）交主理人；我不选边。

### 15.5 实测发现（交回派单，本卡不改 `src/**`）

1. **`connectorStats.ramps = 0`（声明 32 条）**：走查层已引用 `layout.CONNECTORS`，但求解器**未把任何 connector 变成坡道/台阶过渡面** ⇒ `CXN-*` 对可达性**零贡献**；“门已通、人进不去”的直接机制之一。
2. **`SLOT.door.center` 不是门脸点**（`B-side-west-main`：door.center=(−80,−116) vs 建筑东立面 x=−72 / 通道面 x[−72.6,−66]）⇒ 任何“沿 facing 从 door.center 取样”的工具都会从建筑内部往外穿、并可能取到室内/通道面而误判 Δ。**最小修法**：登记 `door.facade` 或在 CONTRACTS §4 写明“门外基准 = 通道面进深轴外端”，并补 `door.center` 的既有语义说明。
3. **Δ 不是可达性的充分条件**：`C-side-west-main`/`C-side-east-main`（Δ=−0.7）、`E-court3-hall`（Δ=0.9）**Δ 超阈但已可达**（经其它侧/上层路线）⇒ 过渡登记应以 **“内景不可达” ∧ “门级 Δ”** 共同判定。
4. **通道面 ↔ 室内面的跨越缺失**：v2 对 `B-side-west-main` 的逐点实测「通道面中心 可达(pathLen 434) / 室内面中心 probe ✓ 但 path ✗ / VP ✗」⇒ 两者之间缺乏可跨越的相邻格（通道面内伸 0.6m 与 1m 栅格的相对关系需 layout/core 复核）。

### 15.6 无法支撑的测量点 + 最小改法

- **口径迭代如实登记**：v1/v2 以 `door.center` 为基准（穿过建筑进深 14–21m）→ 作废；v3 误把通道面**长边**（门宽 26m）当门外法向 → 作废；**v4 以通道面进深轴（短边 6.6m）外端**为基准 ⇒ 43 栋全部得到可解释读数（本节表 A/B/15.2b 均为 v4）。
- **仍无法支撑的**：`B-hall-main`、`C-hall-bed-main`、`F-garden-hall-west/east/north` 的外端 0.5–8m 内候选点全部落在室内/通道面内 ⇒ 主口径无“可达门外点”，本表以**几何口径 Δ=0** 记录并标注（这几栋均已可达，不影响过渡清单）。**最小改法**：为每栋有门建筑登记**门外锚点**（或 `door.facade`），使门外点 ≤3m 内可确定。

### 15.7 sanity

- `node scripts/audit.mjs` → **exit 0**：`主场景绘制调用 333 / 上限 350 ✓`、`可见三角面 306269 / 上限 1500000 ✓`、`结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）`。
- 原始读数（逐栋全字段 + 6 个候选点的 x/z/y/面/可达）：`/tmp/t100-delta4.json`。

