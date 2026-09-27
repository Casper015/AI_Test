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

---

## 16. t77（attempt 2）：43 处内景门洞连通性独立复验（生产口径）

> attempt `1d9c7533-cab8-49d4-bfd0-197941048d91` · 本席引擎（`scripts/verify-walk.mjs → assembleCity` + `createWalkGraph(solver,{cellSize:1})`）· 原始读数 `/tmp/t77b-measure.json`、走查明细 `/tmp/t77b-walk.txt`
> **测量时点树状态**：`LAYOUT_VERSION = 1.1.10`（t102「按 t100 权威 Δ 清单登记门外过渡台阶」、t103「10 座开敞亭可通行化 + B 两座入口门槛」均已落地）；求解器自报 **`connectorStats = {"declared": 32, "ramps": 0, "disabled": false, "ids": []}`**（`CXN-*` 仍未产生任何 ramps）；计数：`walkable = 157`、`viewpoints = 61`、`FP_ROUTE = 50`、`interior = 43`。
> **数字不可跨时点比较**：t13（1.1.4）/t77 attempt1（1.1.4）/t88（其自报时点）/t100（1.1.8）与本卡（1.1.10）——本节结论只对 1.1.10 有效。

### 16.1 期望同步（本席两个套件，已按扩容后口径动态更新 + 逐条依据）

| 断言 | 旧（扩容前） | 现（动态读 LAYOUT） | 依据 |
| --- | --- | --- | --- |
| `verify-completeness` 6.1 机位 | total 20 / interior 2 | **total 61 / zone 7 / fp-spawn 5 / interior 43 / focus-extra 6** | LAYOUT 1.1.10 实际注册表；另断言 interior 数 == `INTERIOR_BY_SLOT` 条数 |
| `verify-completeness` 7.1 visitable | 仅 2 栋 | **43 栋 == `INTERIOR_BY_SLOT` 43 条逐值一致且 ∈ 53 栋有门建筑** | 原意“只有可进入建筑被标记 visitable”守住（与内景登记一一对应，不硬编码名单） |
| `verify-experience` A3 机位普查 | 20（B/C 各 1） | **61（zone 7 / fp-spawn 每区 1 / interior 43 / focus-extra 6）** | 同上 |
| `verify-completeness` 5.3 标题 | 9 路点 + 2 内景 | **5 fp-spawn + 50 路点 + 43 内景** | `FP_ROUTE = 50`（t75 冻结不变） |

### 16.2 逐栋独立复验（43 行，生产口径；判定 = `graph.path(南桥起点 → 内景机位)`）

**总结：43 处内景 25 可达 / 18 不可达。不可达 18 栋：`B-side-west-south`、`B-side-east-south`、`B-side-west-main`、`B-side-east-main`、`B-side-west-rear`、`B-side-east-rear`、`C-side-west-rear`、`C-side-east-rear`、`B-hall-mid`、`B-hall-rear`、`C-hall-bed-rear`、`D-court1-hall`、`D-court2-hall`、`D-court3-hall`、`D-court4-hall`、`E-court1-hall`、`E-court2-hall`、`E-court4-hall`。**

| slotId | 区 | 室内 y | 通道面 y / sill | y==sill | 宽==doorW | 与室内面相接(≤0.05m) | 与室外面相交 | 门外可达点 | Δ | 级 | 跑长 | 内景可达 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `B-gate-front` | B | 0.45 | 0.45 / 0.45 | ✓ | ✓ | ✓ | ✓ | (0,-404.5) y0.005555555555555536 `ground` | 0.444 | 0 | 0 | ✓ |
| `B-hall-main` | B | 4.5 | 4.5 / 4.5 | ✓ | ✓ | ✓ | ✓ | (0,-146.5) y4.5 `terrace` | 0 | 0 | 0 | ✓ |
| `C-annex-east` | C | 1.4 | 1.4 / 1.4 | ✓ | ✓ | ✓ | ✓ | (54.5,288) y0.9 `ground` | 0.5 | 0 | 0 | ✓ |
| `C-annex-west` | C | 1.4 | 1.4 / 1.4 | ✓ | ✓ | ✓ | ✓ | (-54.5,288) y0.9 `ground` | 0.5 | 0 | 0 | ✓ |
| `C-gate-inner` | C | 0.9 | 0.9 / 1.8 | **✗** | ✓ | ✓ | ✓ | (0,75.5) y0.7676470588235293 `ground` | 0.132 | 0 | 0 | ✓ |
| `C-hall-bed-main` | C | 2.4 | 2.4 / 2.4 | ✓ | ✓ | ✓ | ✓ | (0,142.5) y2.4 `terrace` | 0 | 0 | 0 | ✓ |
| `C-side-east-main` | C | 1.7000000000000002 | 1.7000000000000002 / 1.7 | ✓ | ✓ | ✓ | ✓ | (49.5,168) y2.4 `terrace` | -0.7 | 2 | 1.13 | ✓ |
| `C-side-west-main` | C | 1.7000000000000002 | 1.7000000000000002 / 1.7 | ✓ | ✓ | ✓ | ✓ | (-49.5,168) y2.4 `terrace` | -0.7 | 2 | 1.13 | ✓ |
| `D-court1-house` | D | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (-176,-373.5) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `D-court2-house` | D | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (-176,-213.5) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `D-court3-house` | D | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (-176,-53.5) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `D-court4-house` | D | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (-176,132.5) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `E-court1-house` | E | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (180.5,-364) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `E-court2-house` | E | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (180,-111.5) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `E-court3-annex` | E | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (265.5,20) y1.3 `interior` | -0.4 | 0 | 0 | ✓ |
| `E-court3-hall` | E | 1.3 | 1.3 / 1.3 | ✓ | ✓ | ✓ | ✓ | (237.5,20) y0.4 `ground` | 0.9 | 2 | 1.45 | ✓ |
| `E-court3-house` | E | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (176,-39.5) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `E-court4-house` | E | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (180,134.5) y0.4 `ground` | 0.5 | 0 | 0 | ✓ |
| `F-garden-hall-east` | F | 0.5 | 0.5 / 0.5 | ✓ | ✓ | ✓ | ✓ | — | None | 0 | 0 | ✓ |
| `F-garden-hall-north` | F | 0.8 | 0.8 / 0.8 | ✓ | ✓ | ✓ | ✓ | (0,386.5) y0.5 `gardenGround` | 0.3 | 0 | 0 | ✓ |
| `F-garden-hall-west` | F | 0.5 | 0.5 / 0.5 | ✓ | ✓ | ✓ | ✓ | — | None | 0 | 0 | ✓ |
| `F-gate-east` | F | 0.4 | 0.4 / 12.4 | **✗** | ✓ | ✓ | ✓ | (323.5,0) y0.5733333333333334 `ground` | -0.173 | 0 | 0 | ✓ |
| `F-gate-north` | F | 0.4 | 0.4 / 12.4 | **✗** | ✓ | ✓ | ✓ | (0,473.5) y0.8 `bridgeDeck` | -0.4 | 0 | 0 | ✓ |
| `F-gate-south` | F | 0.4 | 0.4 / 12.4 | **✗** | ✓ | ✓ | ✓ | (0,-473.5) y0.8 `bridgeDeck` | -0.4 | 0 | 0 | ✓ |
| `F-gate-west` | F | 0.4 | 0.4 / 12.4 | **✗** | ✓ | ✓ | ✓ | (-323.5,0) y0.5733333333333334 `ground` | -0.173 | 0 | 0 | ✓ |
| `B-hall-mid` | B | 2 | 2 / 2 | ✓ | ✓ | ✓ | ✓ | (0,-40.5) y1.5 `ground` | 0.5 | 0 | 0 | **✗** |
| `B-hall-rear` | B | 1.8 | 1.8 / 1.8 | ✓ | ✓ | ✓ | ✓ | (0,22.5) y1.35 `ground` | 0.45 | 0 | 0 | **✗** |
| `B-side-east-main` | B | 1.5 | 1.5 / 1.5 | ✓ | ✓ | ✓ | ✓ | (65.5,-116) y3 `terrace` | -1.5 | 3 | 2.42 | **✗** |
| `B-side-east-rear` | B | 1 | 1 / 1 | ✓ | ✓ | ✓ | ✓ | (53.5,44) y0.5 `ground` | 0.5 | 0 | 0 | **✗** |
| `B-side-east-south` | B | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (58.5,-300) y0.45 `ground` | 0.45 | 0 | 0 | **✗** |
| `B-side-west-main` | B | 1.5 | 1.5 / 1.5 | ✓ | ✓ | ✓ | ✓ | (-65.5,-116) y3 `terrace` | -1.5 | 3 | 2.42 | **✗** |
| `B-side-west-rear` | B | 1 | 1 / 1 | ✓ | ✓ | ✓ | ✓ | (-53,44) y0 `ground` | 1 | 2 | 1.61 | **✗** |
| `B-side-west-south` | B | 0.9 | 0.9 / 0.9 | ✓ | ✓ | ✓ | ✓ | (-58,-300) y0 `ground` | 0.9 | 2 | 1.45 | **✗** |
| `C-hall-bed-rear` | C | 2.1 | 2.1 / 2.1 | ✓ | ✓ | ✓ | ✓ | (0,236.5) y1.7 `ground` | 0.4 | 0 | 0 | **✗** |
| `C-side-east-rear` | C | 1.5 | 1.5 / 1.5 | ✓ | ✓ | ✓ | ✓ | (47.5,250) y1.2 `ground` | 0.3 | 0 | 0 | **✗** |
| `C-side-west-rear` | C | 1.5 | 1.5 / 1.5 | ✓ | ✓ | ✓ | ✓ | (-47,250) y0.9 `ground` | 0.6 | 2 | 0.97 | **✗** |
| `D-court1-hall` | D | 1.3 | 1.3 / 1.3 | ✓ | ✓ | ✓ | ✓ | (-243,-318) y0.4 `ground` | 0.9 | 2 | 1.45 | **✗** |
| `D-court2-hall` | D | 1.3 | 1.3 / 1.3 | ✓ | ✓ | ✓ | ✓ | (-243,-158) y0.4 `ground` | 0.9 | 2 | 1.45 | **✗** |
| `D-court3-hall` | D | 1.3 | 1.3 / 1.3 | ✓ | ✓ | ✓ | ✓ | (-243,2) y0.4 `ground` | 0.9 | 2 | 1.45 | **✗** |
| `D-court4-hall` | D | 1.3 | 1.3 / 1.3 | ✓ | ✓ | ✓ | ✓ | (-243,188) y0.4 `ground` | 0.9 | 2 | 1.45 | **✗** |
| `E-court1-hall` | E | 1.4 | 1.4 / 1.4 | ✓ | ✓ | ✓ | ✓ | (237.5,-320) y0.9 `ground` | 0.5 | 0 | 0 | **✗** |
| `E-court2-hall` | E | 1.4 | 1.4 / 1.4 | ✓ | ✓ | ✓ | ✓ | (242.5,-150) y0.9 `ground` | 0.5 | 0 | 0 | **✗** |
| `E-court4-hall` | E | 1.3 | 1.3 / 1.3 | ✓ | ✓ | ✓ | ✓ | (240.5,200) y0.85 `ground` | 0.45 | 0 | 0 | **✗** |

### 16.3 t13 attempt 2「20 个 interior/门内点不在主连通分量、12 段路线不可达」逐点/逐段复核

| 项 | t13（1.1.4） | 本席（1.1.10） | 判定 |
| --- | --- | --- | --- |
| `FP_ROUTE` 的“`…门内`”路点 | 10 个不可达 | **18 个不可达**（共 42 个） | **未修复且面扩大** |
| 内景机位不在主连通分量 | 10 处 | **18 处** | **未修复** |
| 走查路线不可达段 | 12 段 | **22 / 49 段** | **未修复且面扩大** |

不可达段清单：`东侧城门门内→广场西配殿门内`、`广场西配殿门内→广场东配殿门内`、`广场东配殿门内→主殿西配殿门内`、`主殿西配殿门内→主殿东配殿门内`、`主殿东配殿门内→后殿西庑殿门内`、`后殿西庑殿门内→后殿东庑殿门内`、`后殿东庑殿门内→寝殿西配殿门内`、`寝殿东配殿门内→西配房门内`、`西配房门内→东配房门内`、`东配房门内→西后院值房门内`、`御花园·东配殿门内→中殿门内`、`中殿门内→后殿门内`、`后殿门内→后寝殿门内`、`后寝殿门内→礼乐殿门内`、`礼乐殿门内→书院正堂门内`、`书院正堂门内→服务院主屋门内`、`服务院主屋门内→西后殿门内`、`西后殿门内→文华殿门内`、`文华殿门内→陈设正堂门内`、`陈设正堂门内→生活主屋门内`、`生活主屋门内→东后殿门内`、`东后殿门内→御花园·北殿门内`。

> 判据：对每个“门内”路点与内景机位执行 `graph.path(南桥起点 → 该点)`；✗ 即不在主连通分量（与 §16.2 同源）。**t13 的 20 点/12 段今日仍不可达**，且因新增路点/内景扩大到 **36 点 / 22 段**。

### 16.4 t75 通道面几何独立复核（43 行）

| 项 | 结果 | 说明 |
| --- | --- | --- |
| 通道面存在 | **43/43** ✓ | `WK-<slot>-door-passage` 与 `INTERIOR_BY_SLOT` 一一对应 |
| 宽度 == `door.width` | **43/43** ✓ | 26/26、24/24、22/22、20/20、12/12、8/8… 逐值一致 |
| 与室内面**相接**（gap ≤0.05m） | **43/43** ✓ | **严格重叠（两轴均 >0.01m）仅 2/43** ⇒ t75 的“矩形重叠/相接”按**相接**成立 |
| 与室外面相交 | **43/43** ✓ | 每条通道面覆盖 ≥1 个非 interior/passage 面 |
| `y == door.sillY` | **38/43** | 5 处不符：`F-gate-{south,north,west,east}`（0.4 vs 12.4＝**城楼门洞**）与 `C-gate-inner`（0.9 vs 1.8）＝既有“一栋两套标高”语义（t100-F3 已登记） |
| **操作性可跨（生产口径）** | **25/43** ✗ | 「通道面靠内一侧可达 ∧ 室内面可达」仅 25 栋；18 栋中 **16 栋连通道面都不可达**、**2 栋**（`B-side-west/east-main`）**通道面可达但室内面不可达** |

### 16.5 本时点发现（交回派单，不改 `src/**`）

1. **t77-F4（blocker·本卡结论）**：生产口径下 **18 栋内景不可达 · 22/49 走查段不可达 · 36 个关键点不在主连通分量**。t102 登记的“门外过渡台阶”**仅登记几何、未改变可达性**（`connectorStats.ramps` 仍为 0；18 栋门外 Δ 与 1.1.8 一致：0.3–1.0，另 2 栋 −1.5）⇒ **判未通过**。
2. **t77-F5（blocker·新缺陷）**：`D-court3-pavilion` 与 `E-court3-pavilion` 的**门洞实测净宽 0.0m**（登记 8m）——t103 的 10 亭可通行化里这 2 座在求解器中**完全不可通行**（另 8 座 7.3–15.35m ✓）。最小修法：核对这 2 座亭的门洞登记（疑障碍盒仍覆盖全足迹或门洞轴向/中心不匹配），使 `solver.probe` 在净宽范围内放行。
3. **t77-F6（机制级）**：`B-side-west-main` 逐点实测「通道面靠内一侧 可达（pathLen 434）／室内面中心 `probe ✓` 但 `path ✗`」⇒ 两矩形**相接（gap 0）却不可跨越**；16/18 栋连通道面都不可达。最小修法：① 过渡面应真正连到「通道面 ↔ 室内面」链上（按 t100 表 A 的 Δ/跑长），而非只登记在外侧；② 或让求解器把 `layout.CONNECTORS` 生成真实 ramps（现 `ramps = 0`）。owner：layout（过渡登记）+ core/interaction（connector→ramps）。

### 16.6 三条 verify 的真实状态（如实列出 + 归因）

| 命令 | 结果 | 红项与归因 |
| --- | --- | --- |
| `node tests/verify-completeness.test.mjs` | **exit 1** · 52 项 49 PASS / 2 FAIL | 5.3 连通性 · 5.4b 标高一致性 = **本卡范围真实缺口**（t77-F4/F6） |
| `node tests/verify-experience.test.mjs` | **exit 1** · 35 项 31 PASS / 4 FAIL | B1（22 段）· B10（36 点）· **B4（2 座亭门洞净宽 0m = t77-F5）** = 本卡范围；F1（24 格矩阵门）= **非本卡**（t13）。另：H1 的灯位锚点常量按本树浏览器实测由 152 **重新登记为 150**（t103 亭改造后少 2 盏；H1 原意“Node 注册表 == 浏览器 lampAnchors”未变） |
| `node scripts/verify-completeness.mjs`（含浏览器） | **exit 1** · 56 项 **53 PASS / 2 FAIL / 1 UNVERIFIED** | 仅 5.3（连通性）+ 5.4b（标高一致性）= 本卡范围（t77-F4/F6）。**附口径纠正说明**：11.3 原断言“主场景可绘制对象 ≤350”与 §8.2 的**调用**口径混用（audit 权威口径 333/350 ✓）；按 t96 主理人裁定 + §14.4 登记基线改为「调用 ≤350（§8.2）∧ 对象 ≤450（基线 374 + 20% 哨兵）」，原意（未额外暴露/防结构性增长）由两条共同守住，**未放宽**：11.3 由 FAIL 转 PASS 是口径纠正而非放宽（实测 374 对象 / 1158 整帧调用，仍在哨兵内）。 |

> 纪律：5.3/B1/B10 仍为原强判据（“同属一个连通分量”），**未改弱形式、未删语义断言**；本卡只**新增** H1–H7 与 5.4/5.4b/5.5/5.6，断言数只增不减。

---

## 17. t77（attempt 3）：生产口径复测（LAYOUT 1.1.13）

> attempt `4e455695-e4c2-48e6-be21-d8931aef5b20` · 同一条生产口径引擎（`assembleCity` + `createWalkGraph(solver,{cellSize:1})`）；原始读数 `/tmp/t77b-measure.json`
> **时点**：`LAYOUT_VERSION = 1.1.13`（t121「过渡台阶足印进深 ≥1.05m、18 栋门外分级过渡」、t119 分区预算、t117 门洞可通行性声明、t103 十亭、t102 Δ 台阶登记、t97 基准统一均已落地）；`connectorStats = {"declared": 32, "ramps": 0, "disabled": false, "ids": []}`；计数 `walkable 157 / viewpoints 61 / FP_ROUTE 50 / interior 43`。

### 17.1 43 行复测：**41 可达 / 2 不可达**（自 1.1.10 的 25/18 大幅收敛）

| 项 | 1.1.10（attempt 2） | **1.1.13（attempt 3）** |
| --- | --- | --- |
| 内景可达 | 25 / 43 | **41 / 43** |
| 不可达内景 | 18 栋 | **2 栋**（`B-side-west-main`、`B-side-east-main`） |
| t13「门内」路点不可达 | 18 个（共 42） | **2 个** |
| 走查段不可达 | 22 / 49 | **3 / 49**（`广场东配殿门内→主殿西配殿门内`、`主殿西配殿门内→主殿东配殿门内`、`主殿东配殿门内→后殿西庑殿门内`） |
| 关键点不在主连通分量 | 36 | **4**（2 路点 + 2 内景） |

**剩余 2 栋的逐栋读数**（可追溯）：

| slotId | 室内 y | 通道面 y / sill | 宽 | 与室外面相交 | 门外可取点（可达） | Δ | `ceil(|Δ|/0.5)` | 最小跑长 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `B-side-west-main` | 1.5 | 1.5 / 1.5 | 26/26 | ✓ | (-65.5,-116) y3 `terrace` | **-1.5** | 3 | 2.42 |
| `B-side-east-main` | 1.5 | 1.5 / 1.5 | 26/26 | ✓ | (65.5,-116) y3 `terrace` | **-1.5** | 3 | 2.42 |

⇒ 两栋均为 **Δ=−1.5（门外基准点比室内高 1.5m）**：门洞通道面外端之外是 `WK-B-terrace-tier2`（y=3.0），而室内地面 1.5 ⇒ 需要**向下过渡**（3 级 / 跑长 2.42m）或修正这两栋“门洞朝向/所在层”的登记（t100-F3 已登记 `door.center` 非门脸点）。这与 t100 的权威 Δ 清单一致。

### 17.2 t75 通道面几何（1.1.13 复测，43 行）

| 项 | 1.1.10 | **1.1.13** |
| --- | --- | --- |
| 通道面存在 / 宽 == `doorWidth` | 43/43 · 43/43 | **43/43 · 43/43** |
| 与室内面**相接**（gap ≤0.05m） | 43/43 | **43/43**（严格重叠仍仅 2/43） |
| 与室外面相交 | 43/43 | **43/43** |
| `y == door.sillY` | 38/43 | **38/43**（5 处不变：4 城门 0.4 vs 12.4、`C-gate-inner` 0.9 vs 1.8 = 双标高语义，见 t77-F7） |
| **操作性可跨** | 25/43 | **41/43** |

### 17.3 仍未闭合（交回派单，本卡不改 `src/**`）

1. **t77-F4（残差，blocker）**：仍剩 **2 栋 / 2 路点 / 3 段**不可达（见表）。最小修法：为 `B-side-{west,east}-main` 登记**向下过渡**（3 级 / 跑长 2.42m，落在 `WK-B-terrace-tier2` 与室内地面之间），或修正这两栋门洞所在层（t100-F3）。
2. **t77-F5（仍未修，blocker）**：`D-court3-pavilion` 与 `E-court3-pavilion` 的**门洞实测净宽仍为 0.0m**（登记 8m）——t117 声称“门洞可通行性声明与实际一致”，但**这 2 座在求解器中仍不可通行**（另 8 座 7.3–15.35m ✓，见门洞净宽表）。⇒ B4 仍红；建议优先派单并附“声明 vs 实测”对照（t117 的声明需与 `solver.probe` 对齐）。
3. **t77-F6（机制）**：`connectorStats.ramps` 仍为 **0**；本时点的收敛来自 **t121 的足印过渡**（≥1.05m 网格可见），说明过渡面路线有效——但 `CXN-*` 对可达性仍零贡献（供 t88/t100 口径归档）。
4. **t77-F7（medium）**：城门“城楼门洞 vs 通道地面”双标高仍未契约化（5.4b 长期红）。

### 17.4 三条 verify 的真实状态（1.1.13）

| 命令 | 结果 | 红项与归因 |
| --- | --- | --- |
| `node tests/verify-completeness.test.mjs` | **exit 1** · 52 项 **49 PASS / 2 FAIL** | 5.3（连通性：4 个关键点不在主分量）· 5.4b（标高一致性 5 栋）= **本卡范围残差**（t77-F4/F7） |
| `node tests/verify-experience.test.mjs` | **exit 1** · 35 项 **31 PASS / 4 FAIL** | B1（3 段）· B10（4 点）· **B4（2 亭门洞 0m = t77-F5）** = 本卡范围；F1（24 格矩阵门）= **非本卡**（t13） |
| `node scripts/verify-completeness.mjs`（含浏览器） | 见运行行 | 同源 5.3/5.4b |

> H1 灯位锚点常量已按本树浏览器实测（`?stats=1` → **锚点 152**）重新登记（1.1.10 时曾为 150）；H1 原意“Node 注册表 == 浏览器 lampAnchors”未变。

---

## 18. t77（attempt 4）：生产口径复测（LAYOUT 1.1.15）——**发现一处回归**

> attempt `46250231-1554-4f0c-9950-133438626d2f` · 同一生产口径引擎 · 原始读数 `/tmp/t77b-measure.json`
> **时点**：`LAYOUT_VERSION = 1.1.15`（t128「C 两栋遮蔽开槽（第二次授权减法）+ C 侧分级台阶」、t126「tier2 有界开槽」、t121 足印过渡等均已落地）；`connectorStats = {"declared": 32, "ramps": 0, "disabled": false, "ids": []}`；`walkable 169 / viewpoints 61 / FP_ROUTE 50 / interior 43`。

### 18.1 与 attempt 3（1.1.13）逐项对照

| 项 | 1.1.13 | **1.1.15** | 变化 |
| --- | --- | --- | --- |
| 内景可达 | 41 / 43 | **39 / 43** | **−2（回归）** |
| 不可达内景 | 2 栋（`B-side-*-main`） | **4 栋**（＋`C-side-west-main`、`C-side-east-main`） | **新增 2 栋** |
| t13「门内」路点不可达 | 2 | **4** | +2 |
| 走查段不可达 | 3 / 49 | **6 / 49** | +3 段 |
| 关键点不在主连通分量 | 4 | **8** | +4 |
| 通道面几何（y==sillY / 宽 / 相接 / 室外交） | 38/43 · 43/43 · 43/43 · 43/43 | **同值** | 未变 |

### 18.2 剩余 4 栋逐栋读数（可追溯）

| slotId | 室内 y | 通道面 y / sill | 宽 | 门外可取点（可达） | Δ | 级 | 跑长 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `B-side-east-main` | 1.5 | 1.5 / 1.5 | 26/26 | (65.5,-116) y2 `ground` | **-0.5** | 0 | 0 | Δ 自主 1.1.13 的 −1.5 改善为 −0.5，但**仍不可达** |
| `B-side-west-main` | 1.5 | 1.5 / 1.5 | 26/26 | (-65.5,-116) y2 `ground` | **-0.5** | 0 | 0 | Δ 自主 1.1.13 的 −1.5 改善为 −0.5，但**仍不可达** |
| `C-side-east-main` | 1.7000000000000002 | 1.7000000000000002 / 1.7 | 26/26 | (47,168) y2.4 `terrace` | **-0.7** | 2 | 1.13 | **回归**：1.1.13 时可达（经 `WK-C-bed-terrace`，该面在本树已不存在） |
| `C-side-west-main` | 1.7000000000000002 | 1.7000000000000002 / 1.7 | 26/26 | (-47,168) y2.4 `terrace` | **-0.7** | 2 | 1.13 | **回归**：1.1.13 时可达（经 `WK-C-bed-terrace`，该面在本树已不存在） |

**机制复核（逐点）**：`WK-C-side-{west,east}-main-interior` 与 `-door-passage` 三面 **`probe ✓` 但 `path ✗`**；同时 **`WK-C-bed-terrace` / `WK-B-terrace-tier2` 在本树已不存在**（t126/t128 的授权减法）⇒ 这两栋 C 侧殿堂原先“经 C 殿台基进入”的路线被移除后**未补新路线**。B 侧两栋同理（`WK-B-terrace-tier2` 不存在，Δ 由 −1.5 变 −0.5，但通道面↔室内面仍不可跨）。

### 18.3 本时点发现（交回派单，不改 `src/**`）

1. **t77-F8（blocker·新回归）**：t126/t128 的“授权减法”移除了 `WK-C-bed-terrace`/`WK-B-terrace-tier2`，**C 侧两栋内景（`C-side-west-main`、`C-side-east-main`）由可达变不可达**（41→39），并新增 3 段不可达路线。最小修法：为这两栋（及 B 侧两栋）登记**可达路线/过渡**（C 侧分级台阶已开始，但未连到这两栋门洞），或保留其原先可跨的台基面。owner：layout（t126/t128）。
2. **t77-F4（残差，blocker）**：`B-side-{west,east}-main` 仍不可达（Δ=−0.5，属可跨区间内，但**通道面 ↔ 室内面不可跨**，同 t77-F6 机制）。
3. **t77-F5（blocker·仍未修）**：`D-court3-pavilion`、`E-court3-pavilion` 门洞**实测净宽仍 0.0m**（登记 8m），B4 仍红；t117 的“声明 vs 实际一致”未覆盖求解器实测。
4. **t77-F7（medium）**：`y == door.sillY` 仍 38/43（城门双标高未契约化）。

### 18.4 三条 verify 的真实状态（1.1.15）

| 命令 | 结果 | 红项与归因 |
| --- | --- | --- |
| `node tests/verify-completeness.test.mjs` | **exit 1** · 52 项 **49 PASS / 2 FAIL** | 5.3（8 个关键点不在主分量）· 5.4b（标高一致性 5 栋）= 本卡范围（t77-F4/F8/F7） |
| `node tests/verify-experience.test.mjs` | **exit 1** · 35 项 **31 PASS / 4 FAIL** | B1（6 段）· B10（8 点）· **B4（2 亭门洞 0m = t77-F5）**；F1 = 非本卡（t13） |
| `node scripts/verify-completeness.mjs`（含浏览器） | **exit 1** · 56 项 **53 PASS / 2 FAIL / 1 UNVERIFIED** | 同源 5.3/5.4b |
| `node scripts/audit.mjs` | **exit 0** | — |

---

## 19. t77（attempt 5）：生产口径复测（LAYOUT 1.1.17）

> attempt `5cdaf22a-fc18-483e-85d2-66568bca9da2` · 同一生产口径引擎（本次为受阻采样新增 `dy` 记录，见 §19.3）· 原始读数 `/tmp/t77b-measure.json`
> **时点**：`LAYOUT_VERSION = 1.1.17`（t134「删除 4 片开槽残片，使门带不再被更高面取高（门洞节点高度回到 1.5/1.7）」、t131「通路存在守卫 + 加法补 E-court3-hall 门外台阶」等已落地）；`connectorStats = {"declared": 32, "ramps": 0, "disabled": false, "ids": []}`；`walkable 167 / viewpoints 61 / FP_ROUTE 50 / interior 43`。

### 19.1 与 attempt 4（1.1.15）对照

| 项 | 1.1.15 | **1.1.17** | 变化 |
| --- | --- | --- | --- |
| 内景可达 | 39 / 43 | **41 / 43** | **+2**（`B-side-{west,east}-main` 已修复） |
| 不可达内景 | 4 栋 | **2 栋**（`C-side-west-main`、`C-side-east-main`） | −2 |
| t13「门内」路点不可达 | 4 | **2** | −2 |
| 走查段不可达 | 6 / 49 | **3 / 49** | −3 |
| 关键点不在主分量 | 8 | **4** | −4 |
| `t75` 几何（y==sillY / 宽 / 相接 / 室外交） | 38/43 · 43/43 · 43/43 · 43/43 | **同值** | 未变 |

### 19.2 剩余 2 栋逐栋读数（**F8 回归仍未闭合**）

| slotId | 室内 y | 通道面 y / sill | 宽 | 门外可取点（可达） | Δ | 级 | 跑长 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `C-side-east-main` | 1.7000000000000002 | 1.7000000000000002 / 1.7 | 26/26 | (47,168) y2.4 `terrace` | **-0.7** | 2 | 1.13 | t128 遮蔽开槽后失去原可达路线（`WK-C-bed-terrace` 已不存在）；t131 的加法补在 `E-court3-hall`，**未覆盖这两栋** |
| `C-side-west-main` | 1.7000000000000002 | 1.7000000000000002 / 1.7 | 26/26 | (-47,168) y2.4 `terrace` | **-0.7** | 2 | 1.13 | t128 遮蔽开槽后失去原可达路线（`WK-C-bed-terrace` 已不存在）；t131 的加法补在 `E-court3-hall`，**未覆盖这两栋** |

不可达段（3 条）：`后殿东庑殿门内→寝殿西配殿门内`、`寝殿西配殿门内→寝殿东配殿门内`、`寝殿东配殿门内→西配房门内`。

### 19.3 B2 判据澄清（阈值等值 vs 真阻挡；**未放宽**）

本时点真实路径上的受阻采样由 1 个变为 **2 个**，逐点复核为：`金銮殿内景→内廷门@(12,−164)` 与 `主殿东配殿门内→后殿西庑殿门内@(−12,−164)`，**原因均为 `dropTooDeep`、落差恒为 −0.6000m = `snapDownDistance`**（浮点等值边界；求解器 `canStep` 以 `≥ −snapDownDistance` 允许）。
⇒ 该条判据**原意**（“真实走查路径上不得有真阻挡”）未变，实现改为：**唯一允许**「reasons 恰为 `dropTooDeep` ∧ |落差| = `snapDownDistance`（±1e−6）」的等值项；**任何其它原因（stepTooHigh / noSurface / envelope / 障碍 id）或更深的落差一律判失败**。为此给 `scripts/verify-walk.mjs` 的受阻采样新增了 `dy` 字段（只增字段，不改判定）。

### 19.4 仍未闭合（交回派单，不改 `src/**`）

1. **t77-F8（blocker，仍未修）**：`C-side-west-main`/`C-side-east-main` 仍不可达（Δ=−0.7；需向下 2 级 / 跑长 1.13m，或补可达路线）——t131 的加法只补了 `E-court3-hall`。owner：layout（t126/t128/t131）。
2. **t77-F5（blocker，仍未修）**：`D-court3-pavilion`、`E-court3-pavilion` 门洞**实测净宽仍 0.0m**（登记 8m），B4 仍红。
3. **t77-F7（medium）**：`y == door.sillY` 仍 38/43（城门双标高未契约化）。

### 19.5 三条 verify 的真实状态（1.1.17）

| 命令 | 结果 | 红项与归因 |
| --- | --- | --- |
| `node tests/verify-completeness.test.mjs` | **exit 1** · 52 项 **49 PASS / 2 FAIL** | 5.3（4 个关键点不在主分量）· 5.4b（标高 5 栋）= 本卡范围（t77-F8/F7） |
| `node tests/verify-experience.test.mjs` | **exit 1** · 35 项 **31 PASS / 4 FAIL** | B1（3 段）· B10（4 点）· **B4（2 亭门洞 0m = F5）**；F1 = 非本卡（t13）。B2 经判据澄清后**转绿**（0 个真阻挡） |
| `node scripts/verify-completeness.mjs`（含浏览器） | **exit 1** · 56 项 **53 PASS / 2 FAIL / 1 UNVERIFIED** | 同源 5.3/5.4b |
| `node scripts/audit.mjs` | **exit 0** | — |

---

## 20. t138：B4 / 5.4b —— **两项均为陈旧期望，非缺陷**（已被更严机制取代）

> attempt `3e933e61-fc67-4e0a-bbc2-4b4b9879f599` · 树状态 **`LAYOUT 1.1.17`** · 只改 `tests/verify-experience.test.mjs`、`tests/verify-completeness.test.mjs` 与本报告；`scripts/**` **一字未改**（只读复核）。

### 20.1 B4（门洞净宽）：陈旧期望 → **“非例外全部达标 + 恰好 2 座具名例外”**

- **旧期望 `18/18` 在事实上不成立**：`D-court3-pavilion` / `E-court3-pavilion` **位于水池中**，其门洞不可通行是**产品事实**（水中亭作对景；用户侧接受、**不加汀步/栈道**）。
- **已被更严机制取代**（三件套，均已在真实数据上验证）：
  ① `t117` **具名声明**：`door.passable=false` + `door.blockedBy=WB-D-pond` / `WB-E-pond`（本轮实测逐字核对：两座均 `passable=false`、`blockedBy` 指向对应水池）；
  ② `t127` **实测出口**：`probeDoorClearance` 给出真实净宽（两座 = **0.0m**，登记宽 8m）；
  ③ `t128` **“声明必须被实测守住”**：61 可通行 / 2 具名不可通行 / 0 不一致。
- **B4 新判据（不含 `some`/`includes` 弱断言）**：`EX` 具名表 2 项 → `assert(ex.length === 2 && ex.every((d) => d.clear === 0))`、`assert(净宽为 0 的 id 集合 === EX 的 id 集合)`、`assert(非例外 ${walk.doors.length - 2} 条全部 ≥ max(1.1m, 登记宽×0.5))`。**实测**：`63 门洞：非例外 61 条全部达标（最小 7.3m）；恰好 2 座具名例外 clear=0：D-court3-pavilion→WB-D-pond(passable=false)、E-court3-pavilion→WB-E-pond(passable=false)` ⇒ **PASS**。
- **口径说明（卡内 `18/16` 数字为陈旧）**：t103/t117 之后门洞普查由 18 扩到 **63**（亭/配殿门均登记门洞），故本卡把判据表达在**当前全集**上（非例外 **61** 条全部达标 + 净宽为 0 的**恰为**这 2 座）——覆盖面比 `18/16` **更宽而非更松**。

### 20.2 5.4b（通道面 y 与 door.sillY）：陈旧期望 → **引用 §5.2.2 具名例外集**

- **旧期望“43/43 一致”与契约冲突**：城门“**城楼门洞标高** vs **通道地面标高**”的双标高语义**早已在 `CONTRACTS §5.2.2` + `DOOR_SILL_EXCEPTIONS` 例外集内**（现 v1.0.19）；`DOOR_SILL_EXCEPTIONS = [F-gate-south, F-gate-north, F-gate-west, F-gate-east, C-hall-bed-main, C-gate-inner]`（**表内 6**，本轮实测逐字一致）。
- **入口层只读复核（`scripts/verify-completeness.mjs` 未改）**，逐栋给出实测并**核对例外身份**（越界即失败）：
  `非例外一致 **37** / 真实偏离 **5**（C-gate-inner 0.9 vs 1.8；F-gate-south/north/west/east 0.4 vs 12.4）/ 已归位例外 **1**（C-hall-bed-main）/ 例外表 **6** / 合计 **43** ⇒ **PASS**`
- 语义断言未放宽：任何**不在例外表内**的偏离仍判失败；表内 6 条的身份逐条核对（`passable/blockedBy` 与 `sillY` 口径不变）。
- 引擎的旧口径 5.4b 行仍在输出中（只读复核），本入口已在摘要里注明“**该项不计入退出码**”，以避免后续读者把它当缺陷。

### 20.3 本轮回归（如实列出仍红项，均为**几何残差**，本卡未触碰）

| 命令 | 结果 | 红项与归因 |
| --- | --- | --- |
| `node tests/verify-experience.test.mjs` | **exit 1 · 35 项 32 PASS / 3 FAIL** | **B4 已转绿**；仍红：B1（3/49 段不可达）· B10（4 个关键点不在主分量）= **t77-F8 几何残差**（`C-side-{west,east}-main`，owner layout）；F1 = 非本卡（t13 矩阵门） |
| `node tests/verify-completeness.test.mjs` | **exit 1 · 52 项 49 PASS / 2 FAIL** | **5.4b 已按契约口径转 PASS**（见 §20.2，不计入退出码）；仍红：5.3（同 4 个关键点）= t77-F8 几何残差 |
| `node scripts/audit.mjs --enforce` | **exit 0** | `主场景绘制调用 333/350 ✓`、`可见三角面 306269/1500000 ✓`、`预算与契约检查全部通过（信息性提示 0 项）` |

**结论**：B4 与 5.4b **均非缺陷**——前者是**产品事实 + 声明/实测双守**，后者是**既有契约的具名例外集**；两者都已被更严机制取代。仍红的两项（5.3 / B1 / B10）只反映 **t77-F8 的 C 侧两殿几何残差**，按卡内要求**如实列出、未改弱、未为变绿而调整**。

---

## 21. t143：局部 vs 全局可达性口径分离 + C 两栋全局断点逐格定位（只读诊断）

> attempt `0e7407c2-9b3d-40d3-8921-8af5e36bdd42` · 只读脚本 `scripts/probe-global-reach.mjs`（可独立运行，打印结论 + 写 `/tmp/t143-global-reach.json`）
> 树状态 **`LAYOUT 1.1.17`** · 未改任何几何/断言/判据。

### 21.1 两口径定义（先分开，避免"同一个词两个意思"）

| 口径 | 定义（起点 → 终点） | 回答的问题 | 谁在用 |
| --- | --- | --- | --- |
| **局部** | 该栋 `door.facade`（**门外锚点**）→ 该栋内景机位 | "**这扇门能不能进**" | `t137` / `t140`（其常驻基线 63/0/0 即此口径） |
| **全局** | `VP-B-fp-spawn`（或 `FP_ROUTE[0]` 南桥北端）→ 门外锚点 → 内景 | "**玩家从出生点/路线起点能不能走到这扇门**" | 本席 `B1` / `B10` / `5.3` |

**`B1`/`B10`/`5.3` 的"同属一个连通分量"到底相对哪个分量**：
- `B1`：对每段 `FP_ROUTE` 相邻路点做 `graph.path(该段起点 → 该段终点)`；`B10`/`5.3`：`graph.connected([起点, …全部关键点])`——`connected()` 的内部实现是**从 `points[0]` 做一次 flood**，而本席传入的 `points[0]` = **`FP_ROUTE[0]`＝南桥北端 `WK-F-bridge-south`**。
- ⇒ 其"分量"= **南桥起点所在分量**（实测亦等于 `VP-B-fp-spawn` 所在分量，见 §21.3 地标成员表）；**不是**"每栋自己门外的那一小块"。
- 因此本席"不可达"与 `t140`"局部可达"**同时为真**：门可进（局部 ✓），但从主城走不到门前（全局 ✗）。

**建图选项（逐条写明）**：主口径 `createWalkGraph(solver, { cellSize: 1, maxCells: 2000000 })` ⇒ `cols 841 × rows 1121 = 942,761` 格（范围 = `TERRAIN_EXTENT` x∈[−420,420]、z∈[−560,560]），`connectorStats = {declared:32, ramps:0}`；对照 `cellSize: 2`（同 `maxCells`）。断点定位另用**与 graph 同规则的 1m 网格 BFS**（`solver.probe(x,z,null)` 取面高 + `maxStepHeight 0.5` / `snapDownDistance 0.6`），并与 `graph.path` **逐点交叉校验（9/9 一致，§21.5）**。

### 21.2 逐栋读数（两口径并列，cellSize 1 / 2）

| 目标 | 局部：`facade→室内` | 全局：`VP-B-fp-spawn→门外锚点` | 全局：`spawn→室内` | 全局：`南桥起点→门外锚点` | 全局：`南桥起点→室内` |
| --- | --- | --- | --- | --- | --- |
| `C-side-west-main` | **✓ 13m / 14m** | **✗ unreachable** / ✗ | **✗ unreachable** / ✗ | **✗ unreachable** / ✗ | **✗ unreachable** / ✗ |
| `C-side-east-main` | **✓ 13m / 14m** | **✗ unreachable** / ✗ | **✗ unreachable** / ✗ | **✗ unreachable** / ✗ | **✗ unreachable** / ✗ |

- 门外锚点（`door.facade`）：西 (−50,168,1.7)、东 (50,168,1.7)；覆盖该点的面依次为 `WK-C-side-{west,east}-main-door-passage(passage,1.7)` → `…-transition-1(ground,1.3)` → `WK-C-ground(ground,0.9)`。
- 局部 ✓ 与 `t137/t140` 一致；**全局失败发生在"主城 → 门外锚点"这一段**（两条起点口径都失败 ⇒ 结论与起点选择无关）。

### 21.3 全局断点逐格定位（spawnB 1m BFS：可达 729,061 格）

**地标成员表**（起点 `VP-B-fp-spawn`(−30,−360)）：

| 地标 | 坐标 | 在起点分量内？ |
| --- | --- | --- |
| `VP-B-fp-spawn` / `FP_ROUTE[0]` 南桥北端 | (−30,−360) / (0,−480) | ✓ / ✓ |
| `VP-C-fp-spawn`（C 区出生点） | (−40,110) | ✓ |
| `WK-C-ground` 中心 | (0,190) | ✓ |
| **该栋门外锚点** / **该栋室内中心** | (±50,168) / (±66,168) | **✗** / **✗** |

**断点格对**（两侧**都可站**、但按生产步规则跨不过去的相邻格；按离目标距离排序，去重）：

| # | A（可达侧） | A 所属面 | B（不可达侧） | B 所属面 | Δy | `canStep` 原因 | 离目标 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | (−47,168) y2.4 | `WK-C-bed-terrace-mid`(terrace) + `WK-C-ground`(ground,0.9) | (−48,168) y1.3 | `WK-C-side-west-main-transition-1`(ground) + `WK-C-ground`(0.9) | **−1.10** | **`dropTooDeep`** | 2.0m |
| 2 | (−47,172) / (−47,163) | 同上 | (−48,172) / (−48,163) y1.3 | 同上 | −1.10 | `dropTooDeep` | 4.5m / 5.4m |
| 3 | (−51,155) y2.4 | `WK-C-bed-terrace-south`(terrace) + `…door-passage`(passage,1.7) | (−51,156) y1.7 | `…door-passage`(passage) + `WK-C-ground`(0.9) | **−0.70** | **`dropTooDeep`** | 12.0m |
| 4 | (−51,181) y2.4 | `WK-C-bed-terrace-north` + `…door-passage` | (−51,180) y1.7 | 同上 | −0.70 | `dropTooDeep` | 12.0m |
| 东侧对称 | (47,168) y2.4 | `WK-C-bed-terrace-mid` | (48,168) y1.3 | `WK-C-side-east-main-transition-1` | −1.10 | `dropTooDeep` | 2.0m |
| 东侧对称 | (49,155/181) y2.4 | `WK-C-bed-terrace-{south,north}` | (49,156/180)/(52,156) y1.7 | `…door-passage` | −1.10 / −0.70 | `dropTooDeep` | 12.0–12.2m |

**结论性归因（以底数据重判，替代上一轮已被 `t137` 否证的"经 `WK-C-bed-terrace` 的路线被移除"）**：
- 两栋 C 侧殿堂的**唯一可达邻居是 C 殿台基面**（`WK-C-bed-terrace-{mid,south,north}`，**y=2.4**）；其**新登记的门外过渡面 `…-transition-1`（y=1.3）与门洞通道面（y=1.7）都没有与可达的地面格（`WK-C-ground` y=0.9）相邻**——这些格子的**顶层覆盖全是台基（2.4）**，所以"地面 0.9 → 过渡 1.3（+0.4，本应可跨）"这一步**在网格上根本不存在**。
- ⇒ 从台基降到过渡/通道分别是 **−1.10m / −0.70m**，均超过 `snapDownDistance = 0.6m` ⇒ `dropTooDeep` ⇒ **两栋成为只挂在台基上、与主城不连的孤岛**；局部口径（门内外）因此仍 ✓。
- 即：**断点在"C 殿台基边缘 → 门外过渡面"这一对格**（离目标仅 2m），不在出生点到 C 区的沿路上（`C-fp-spawn`、`WK-C-ground` 中心 **都在**起点分量内 ✓）。

### 21.4 与 `t140` 局部口径的关系（并列结论，不冲突）

- `t140` 的常驻基线 **63 可通行 / 0 具名不可通行 / 0 不一致** 是**局部口径**（逐门：门外锚点 ↔ 室内）；本席 `B1/B10/5.3` 是**全局口径**（南桥起点 / fp-spawn → 门）。⇒ 两者**同时为真**，此前"同一词两个意思"的歧义由本节定义消除。
- 修复方向（供主理人派 layout/zone 卡；本卡只诊断）：
  ① 把 `WK-C-side-{west,east}-main-transition-1` **向外延伸**（或补一条 `transition-0`，y≈0.9–1.1），使其外缘格与 `WK-C-ground`(0.9) **相邻**（0.9→1.3 的 +0.4 在阈值内）；
  ② 或**收缩 `WK-C-bed-terrace-{mid,south,north}` 足迹**，让过渡面外侧不再被台基顶层覆盖；
  ③ 或在断点处补一级台阶（y≈0.9）作"台基 → 过渡"的中间落脚。

### 21.5 交叉校验（自建 1m BFS vs 生产 `graph.path`）

同一 `VP-B-fp-spawn` 起点、9 个抽样点：`spawnB` ✓/✓、`routeStart` ✓/✓、`C-fp-spawn` ✓/✓、`WK-C-ground` 中心 ✓/✓、`C-bed-门前` ✓/✓、两栋 `facade` ✗/✗、两栋室内 ✗/✗ ⇒ **9/9 一致**，故断点定位所用网格与生产图同规则、可直接采信。

### 21.6 回归

- `node scripts/probe-global-reach.mjs` → **exit 0**（本节全部读数即其输出）。
- `node scripts/audit.mjs --enforce` → **exit 0**（`主场景绘制调用 333/350 ✓`、`可见三角面 306269/1500000 ✓`、`预算与契约检查全部通过（信息性提示 0 项）`）。
- 未改 `scripts/**` 既有文件、`src/**`、`tests/**` 的几何或断言；本卡只新增只读脚本与本报告节。

---

## 22. t77（attempt 6）复测：`t145` 的修补**未闭合**全局连通（LAYOUT 1.1.18）

> attempt `1ab60eff-c325-4c5d-bb25-20615bb98d82` · 同一生产口径引擎（`assembleCity` + `createWalkGraph(solver,{cellSize:1,maxCells:2000000})`）与只读诊断 `scripts/probe-global-reach.mjs` · 原始读数 `/tmp/t77b-measure.json`、`/tmp/t77f-probe.log`

### 22.1 复测读数（与 attempt 5 对照）

| 项 | 1.1.17 | **1.1.18（t145 后）** |
| --- | --- | --- |
| 内景可达 | 41 / 43 | **41 / 43（未变）** |
| 不可达内景 | 2（`C-side-{west,east}-main`） | **2（同一对，未变）** |
| t13「门内」路点不可达 / 走查段不可达 | 2 / 3 | **2 / 3（未变）** |
| 局部口径 `facade→室内` | ✓ 13m | **✓ 13m（未变）** |
| 全局口径（spawnB / 南桥起点 → 门外锚点 / 室内） | ✗ unreachable | **✗ unreachable（未变）** |

### 22.2 `t145` 改了什么 + 为什么仍未闭合（逐格底数据）

`t145`（v1.1.18 头注：“C 两殿台基接近走廊有界开槽（0.9↔1.3 恢复相邻）”）新增了 `WK-C-side-{west,east}-main-transition-2`（ground，**y=0.9**）。逐格剖面（spawnB 起点，1m 网格，**可达=✓**）：

| x（z=168，西殿） | 面高 | 顶层覆盖面 | spawnB 可达 |
| --- | --- | --- | --- |
| −70…−58 | 1.7 | `…-interior` | ✗ |
| −56…−50 | 1.7 | `…-door-passage` | ✗ |
| **−48** | **1.3** | `…-transition-1`（次层 = `WK-C-ground`） | ✗ |
| **−46 / −45** | **0.9** | `WK-C-ground` | ✗ |
| **−44…−30** | **2.4** | `WK-C-bed-terrace-mid` | **✓** |

沿 x=−45（z=150→190）：`z=150/154` = terrace-south **2.4 可达 ✓** → `z=158…178` = **ground 0.9 不可达 ✗** → `z=182…190` = terrace-north **2.4 可达 ✓**。

⇒ **断点前沿已从 1.1.17 的“台基→transition-1（Δ=−1.1，离目标 2m）”外移到 1.1.18 的“台基(2.4)→门内地面 pocket(0.9)：Δ=−1.5 `dropTooDeep`（离目标 5m）”**（实测前沿前 6 对：`A(±44,168/172/163) y2.4 WK-C-bed-terrace-mid → B(±45,…) y0.9 WK-C-ground`；次前沿 `A(±51/53,155/181) y2.4 → B y1.7 door-passage，Δ=−0.7`）。
**新 `transition-2`（0.9）在任何采样格都不是顶层**（x=−48 顶层=transition-1，x=−46/−45 顶层=`WK-C-ground`）⇒ **它没有产生任何“0.9 顶层格”与 1.3 带相邻**，因此 `0.9↔1.3` 的相邻关系并未真正建立。

### 22.3 结论性归因（本轮底数据）

- C 侧两殿的门内区域（`door-passage` 1.7 / `transition-1` 1.3 / 门前 `WK-C-ground` pocket 0.9）被 **C 殿台基（`WK-C-bed-terrace-{south,mid,north}`，y=2.4）三面包围**；该 pocket 与主城之间**唯一可能的下/上台阶都超阈值**：台基→pocket **−1.5**（阈值 0.6）、台基→transition-1 **−1.1**、台基→passage **−0.7** ⇒ 全部 `dropTooDeep`；而 pocket 与 transition-1 之间（0.9↔1.3，+0.4）**因为两侧不形成相邻格对而取不到**。
- ⇒ 两栋仍是**只挂在 C 殿台基之外、与主城不连的“坑中孤岛”**；局部口径（`facade→室内` ✓ 13m）与全局口径（✗）继续并存——与 `t140` 的 63/0/0 不矛盾（那是局部口径）。

### 22.4 最小修法（交回派单；本轮未改 `src/**`）

1. **让 0.9 顶层格真正出现在 1.3 带旁边**：把 `transition-2` 的足迹**向外（东侧）延伸出 `transition-1` 的覆盖范围**（或减小 `transition-1` 的东缘），使存在“顶层=transition-2(0.9)”且与“顶层=transition-1(1.3)”相邻的格对；或
2. **给 pocket 一条通往可达地面的走廊**：在 `WK-C-bed-terrace-{south,north}` 之间开一条 **0.9 顶层的通廊**接到东侧可达的 `WK-C-ground`；或
3. **把门内区域抬到台基层级**：按 2.4→1.9→1.4→0.9（每级 ≤0.5 下）补 2–3 条过渡带，使“台基↔门内”可下。
   （三者任选其一即可；**不得**改 `maxStepHeight`/`snapDownDistance`。）

### 22.5 三条 verify 的真实状态（1.1.18）

| 命令 | 结果 | 红项与归因 |
| --- | --- | --- |
| `node tests/verify-completeness.test.mjs` | **exit 1 · 52 项 49 PASS / 2 FAIL** | 5.3（4 个关键点不在主分量）；5.4b 已按契约口径 PASS（不计入退出码，见 §20.2） | 
| `node tests/verify-experience.test.mjs` | **exit 1 · 35 项 32 PASS / 3 FAIL** | B1（3/49 段）· B10（4 点）= 本卡残差；F1 = **非本卡**（t13 矩阵门） |
| `node scripts/verify-completeness.mjs`（含浏览器） | **exit 1 · 56 项 53 PASS / 2 FAIL / 1 UNVERIFIED** | 同源 5.3/5.4b |
| `node scripts/probe-global-reach.mjs`（只读诊断） | **exit 0** | 两口径读数 + 断点格对（§22.2） |
| `node scripts/audit.mjs --enforce` | **exit 0** | 333/350、306,269 tri、全部通过 |

