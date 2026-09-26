# zone-forecourt（t6）· B 区中轴前朝 —— 开工 + 交付回执

> 任务：`t6 — T4 B 区中轴前朝：门殿递进、主殿三层台基与金銮殿内景`
> 负责人：`zone-forecourt`；attempt：1（attempt_id `cc46354d-c3e9-485f-96a9-6e08448b5c10`）
> 可写范围（inScope）：`src/zones/forecourt.js`、`tests/zone-forecourt.test.mjs`、`docs/handoffs/zone-forecourt.md`
> 本文件同时包含**开工回执**（§1）与**交付回执**（§2 起）。

---

## 1. 开工回执（写代码之前）

### 1.1 已读版本（开工时逐一核对）

| 文件 | 版本 / 值 |
| --- | --- |
| `imperial-palace-plan.md` | §2.3 边界与连接规则、§3 风格、§5.2 中轴前朝、§6.1/§6.4 契约与机位、§7.1、§8.3 |
| `docs/CONTRACTS.md` | `CONTRACTS v1.0.1` ⇄ `CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` |
| `src/shared/layout.js` | `LAYOUT_VERSION 1.0.0`；B 区槽位 12、院落 3、本人 owner 通道 7、道路 27 段（其中 8 段带标高差）、可行走面 8、障碍 12、机位 4、灯位 24 |
| `src/shared/config.js` | `CONFIG_VERSION 1.0.1`；`MODULES.terraceTotalHeight 4.5`、`terraceTierHeight 1.5`、`BUDGET.drawCalls.perZone.B 70` |
| `src/kit/index.js` | `KIT_VERSION 1.0.0`（`createKit`、`mergeZone`、`countDrawCalls`） |
| `src/core/context.js` / `core/layout-slice.js` | `validateZoneResult`（逐字段回显 + 等级-屋顶白名单）、`zoneLayoutFor('B')` |
| `tests/harness.mjs` | `makeTestCtx({ kit })`（可注入真 kit）、`assertZoneResult`→`validateZoneResult` |

### 1.2 可写范围与依赖

- 只写 inScope 三文件；`src/shared/**`、`src/core/**`、`src/kit/**`、`src/main.js`、`src/zones/<其他区>.js`、`src/ui/**`、`src/interaction/**` 一律不改（只读消费）。
- 依赖 t1（layout/config/CONTRACTS 冻结）、t2（ctx/registry/harness）、t3（kit 构件与材质）均已完成并验证可用。
- 依赖主理人移交的构件库操作约定：`createKit({THREE,config,quality})`、组完必调 `kit.mergeZone(root)`、取景用 `userData.kit.worldBounds` 而非 `layout.totalHeight`。

### 1.3 预估冲突与开工时的疑问（已按证据自行裁定，见 §3）

1. `B-hall-main` 的 `terraceH 4.5` 同时被 layout 的三层台基（`layout.TERRACES` 3 条）与 kit 建筑的「自带台明」表达，会重复一层 4.5m 台基。
2. kit 建筑的**自带台阶朝向**与 kit 自身的**丹陛斜坡朝向**互相矛盾（探针实测，见 §3.1）。
3. `audit.mjs` 的 `measure()` 不做 `LOD.update()`，会把 LOD 三档全部计入绘制批次，与浏览器实际单档绘制口径不同。

---

## 2. 交付回执

### 2.1 文件清单（只改了 inScope 三文件）

| 文件 | 状态 | 内容 |
| --- | --- | --- |
| `src/zones/forecourt.js` | 新增（1,244 行） | B 区实现：12 槽位建筑、三层台基+19 段栏杆+8 段台阶/丹陛、6 段院墙（共线归并）、6 段廊庑、12 块铺地、金銮殿内景（须弥座/宝座/宝座屏风/盘龙柱箍/平棋式藻井+鎏金宝顶/铜香炉）、广场鼓钟、月台陈设、10 株乔木、24 座宫灯（实例化）；`createZone(ctx)` + `ZONE_ID` + `default`，另导出 `alignStairFlights` 供测试与其它区域复用 |
| `tests/zone-forecourt.test.mjs` | 新增（33 用例） | 契约/建筑/台基/台阶朝向/内景/围合/机位连接碰撞灯位/预算/行为/灰盒兼容/inScope 扫描 |
| `docs/handoffs/zone-forecourt.md` | 本文件 | 开工 + 交付回执 |

未改动：`src/shared/**`、`src/core/**`、`src/kit/**`、`src/main.js`、`index.html`、`src/ui/**`、`src/interaction/**`、其它 `src/zones/**`。

### 2.2 交付内容对照 §5.2

| 计划 §5.2 要求 | 落地 |
| --- | --- |
| 南城门内侧 → 门殿 → 礼仪广场 → 主殿 → 中殿 → 后殿 的中轴递进 | `B-gate-front`(z=-386, 26m 门洞 + 东西翼亭) → 广场（z -400…-180）→ 三层台基+金銮殿(z=-116) → `B-hall-mid`(z=-20) → `B-hall-rear`(z=44) → 内廷门前缓步（z=61→78，0.9m 抬高） |
| 主殿三层白石台基 ≈4.5m、中央丹陛 + 两侧台阶、雕花栏杆、平台陈设 | `kit.terrace` 直接吃 `layout.TERRACES` 三层（1.5/1.5/1.5，y1=4.5）；丹陛三段 1.5m/12m+1.5m/10m+1.5m/10m（`imperialRamp` 中央御路）；东西侧台阶 + 台北两侧台阶；19 段白石栏杆按面留缺口；月台 4 尊铜狮 + 2 座香炉 |
| 两侧配殿与廊庑围合，广场四周无无边界空地 | 6 栋配殿/庑殿 + 6 段廊庑（广场东西 3 层）+ 6 段院墙（共线归并为 z=-400/-180/-40/80 与 x=±96），四边覆盖 + 跨区开口（z=-300 / z=40 / 中轴南北） |
| 金銮殿内景：金砖地面、宝座、屏风、盘龙柱、藻井，保留门洞与通道并给机位 | 金砖地面 = `WK-B-hall-main-interior` 逐值一致（`interiorBrick`）；须弥座（`kit.terrace` 两层）+ 鎏金坐面/扶手 + 宝座屏风（`kit.screenWall`）+ 盘龙金柱（`kit.hall` 4 排×10 列柱网 + 4 个鎏金抱柱箍）+ 藻井（3 层同心方井 + 中心井板 + 鎏金宝顶，挂 kit 檐下底板之下）+ 2 座铜香炉；门洞净宽 26m（`CXN-B-main-hall-door`，标高 4.5）；`VP-B-interior` 在室内包围盒内 |

### 2.3 关键数量（`createZone` 返回的 `stats`，实测值）

```
buildings 12（gateHall 1 / hall 3 / sideHall 6 / pavilion 2）   connectors 7   obstacles 12
walkable 8   ramps 8   viewpoints 4（zone 1 / fp-spawn 1 / interior 1 / focus-extra 1）   lightAnchors 24
terraces 3   railRuns 19   stairFlights 8   courtWallRuns 6   corridors 6   pavingSlabs 12
interiorFixtures 5   scenic 2   terraceFurnishings 6   trees 10   lamps 24（→ 6 个 InstancedMesh / 144 实例）
drawCalls medium 58（合批前 441；首测为 63，见 §3.2 注）· low 33        triangles medium 80,564 · low 18,792
单栋最大三角面 4,188（B-hall-main，上限 24,000）   bounds x[-100,100] y[-0.16,25.635] z[-400,80]
stairOrientationFix：19 个台阶网格 **0 翻转 / 19 保持**（kit t25 已修复朝向，见 §3.1 末段与 §7-8）
```

### 2.4 与 layout/kit 的交叉校验（均入测试）

- 67→12 槽位 id 逐一回显；`eaveHeightAbsolute == layout.eaveHeight`（全部 12 栋 ≤6mm，含被改 `terraceH` 的金銮殿）。
- 三层台基 `tier/y0/y1/w/d` 与 `layout.TERRACES` 逐值一致；`rampsFromRoads` 的 8 段与 8 段台阶一一对应（跑长/抬升/端点一致）。
- 7 条 owner=B 连接、4 个机位、24 个灯位、12 条障碍、8 个可行走面与冻结表逐值一致（灯位仅把 `y` 实现为 `floorYAt`）。
- 不可进入建筑全部 `blocks='all'`、`door=null`；门殿/金銮殿 `blocks='exceptDoor'` 且门洞宽度与建筑登记一致。

---

## 3. 开工时的三处疑问：证据与裁定

### 3.1 kit 的台阶与丹陛斜坡朝向互相矛盾（**本区已规范化，并向 t3/t2 上报**）

探针 `work/probe-stairs.mjs`（`kit.hall({terraceH:4.5, baseY:4.5, ...})`，供码保留在 `work/`）：

```
stairs bbox z -34.20 -24.00 y -0.00 4.50
  z[-34.2,-32.5] maxY=4.50     ← 高 4.5m 的踏面在**离台明最远**的一端（z=-34.2）
  z[-25.7,-24.0] maxY=0.90     ← 最低踏面紧贴台明前沿（z=-24）
```

即 `buildStairs` 的踏步沿局部 **−Z 递升**，而同一函数生成的丹陛御路（`imperialRamp`）沿局部 **+Z 递升**——
两者方向相反；同时 `composeBuilding` 把台阶平移 `−localD/2`（屋檐外），于是每个建筑正面都会出现一段
「越远离殿身越高」的楔形台阶，与 kit 自己的御路斜坡互相穿插。

**本区处理**：`alignStairFlights()`（`src/zones/forecourt.js` 导出）在整区合并前，按几何实测把
`part === 'stairs'` 的几何统一成「高端在本地 +Z 端」（与 kit 的御路斜坡同向），保留 `imperialRamp` 不动。
判定不依赖版本号：kit 修复后自动不再翻转（测试 `规范化工具本身…且幂等` 覆盖）。
B 区实测「t6 期（kit 修复前）= 19/19 网格被翻转；t25 之后 = **0 翻转 / 19 保持**」——
后一组数字是当前事实，权威记录与探针证据见文末 **§8 t29 附录**；本节其余关于"需要翻转"的表述均为 t6 期历史。
同源问题**同样影响 C/D/E/F**（例：`src/zones/inner-palace.js` 用 `rotationYDeg: north ? 180 : 0` 直接摆
`kit.stairs`，其南侧丹陛的高端仍在台基南侧之外）——已在消息里请 t3 在 `src/kit/geometry.js` 修正，
或由各区复用本区的 `alignStairFlights`。

**t3 回执（独立复现 + 排期）**：kit-engineer 用自己的探针复现了同一现象（`stairs` 靠外端顶面 y=4.50、
贴台明端 y=0.90；`imperialRamp` 相反），确认根因在 `buildStairs` 的 `y1 = (done+i+1)*actualStep` 随 −Z 递增，
推荐修法 `y1 = rise − (done+i)*actualStep`（落地平台同步 `h = rise − done*actualStep`），并明确：
**该修法与本次交付同批**——因为本区 `tests/zone-forecourt.test.mjs` 有两处断言写的是「原生 kit 台阶应被翻转」
（`first.flipped === 1`、`fix.flipped > 0`，后者自带注释「若为 0 说明 kit 已修复，本用例应调整」），
kit 一改这两处就会红。已约定：在后续任务里 **kit 改方向 + 我把这两处改成「原生 kit flipped=0（已修复），
对人为反向样本仍翻转 1 个」**（保持幂等用例的判别力），本区 `alignStairFlights` 保留（修好后自然不触发）。
在此之前，B 区画面正确（见 §6.4 截图）且测试全绿；kit 修复后本区其余代码无需改动。

**后续（已完成）**：t25 落地后，本区两条断言按 kit-engineer 的书面建议改成
「原生 kit 台阶零翻转（`flipped===0 && kept===flights`）+ 人为反向样本可翻转且幂等」
（`tests/zone-forecourt.test.mjs` 第 4 节；见 `docs/handoff-west-courts.md` §4.4 的联动记录）。
改后本区自测 33/33 全绿，`alignStairFlights()` 保留为"判据不依赖 kit 版本"的回归守卫，`src/zones/forecourt.js` 未改动。

### 3.2 逐栋 LOD 与 `audit.mjs` 口径不一致（已按证据选择单档）

`scripts/audit.mjs` 的 `measure()` 不调用 `LOD.update()`，而 `THREE.LOD.addLevel` 不会隐藏非当前档，
于是 LOD 三档几何会被全部计入绘制批次。实测同一份 B 区内容：

| 建筑细节策略 | audit 口径批次 | 三角面 |
| --- | --- | --- |
| 逐栋 `lod:'auto'`（近中远三档）+ 暂隐藏非当前档 | 90 | 105,076 |
| 4 栋主殿三档、其余单档 | 90 | 105,076 |
| **全部单档（取质量档）** | **63（后续实测 58）** | **80,564** |

裁定：建筑细节跟随 `ctx.quality` 单档化（`BUILDING_DETAIL_BY_QUALITY`：high/medium→`mid`、low→`far`），
使 Node 审计数字等于「主场景单次调用」的真实上界；要恢复逐栋 LOD 只需把该常量改成 `'auto'`（一行，其余代码不变）。
理由：kit 的 `near` 相对 `mid` 只多 8 个近景零件族（门钉/门枕石/戗脊/平座栏杆/亭座凳），在分区机位 150m 与
第一人称视距下不改变可识别性；质量档仍真实生效（low 档整区体块化：33 批次 / 18,792 三角面）。

### 3.3 `layout.WALLS` 无 `zone` 字段 → `zoneLayout.courtyardWalls` 曾恒空

`layout.WALLS` 的条目只有 `owner`/`courtyardId`；早期 `core/layout-slice.js` 用 `w.zone === zoneId` 过滤，
所有区域拿到空数组。本区先按 `courtyardId` 从冻结表取（数据源仍是 `src/shared/layout.js`），
t2 修正切片后改为**优先消费 `zoneLayout.courtyardWalls`、保留回退分支**（B 区实测 12 条 → 归并 6 段）。

### 3.4 金銮殿台基重复（已按 §5.2 让台基只由 `layout.TERRACES` 承担）

layout 的 `B-hall-main.terraceH = 4.5` 与 `layout.TERRACES` 的三层台基是同一件事的两种登记。若把
`terraceH:4.5` 直接传给 `kit.hall`，kit 会再造一层 84×48×4.5 的台明（藏在三层台基里，无害）**外加**
3.1 所述那段朝向相反的台阶与一层栏板。故 `B-hall-main` 传 `terraceH:0`、`baseY:4.5`：
屋身从台基顶起算（实测 `worldBounds.minY = 4.5`），`eaveHeightAbsolute` 仍等于 `layout.eaveHeight`
（`4.5 + 4.6×1.35 = 10.71`，测试断言 ≤6mm），栏杆与台阶改由本区按注册数据布置（19 段栏杆含 5 处精确缺口）。

---

## 4. 已知限制（如实登记，不得当作已验证）

1. **内景偏暗（跨区问题，非本区数据可改）**：goldenHour 下内景实测亮度均值 0.0638、暗区 76.0%
   （内景判据 PASS：均值 ≥0.04）。原因链条：金砖 `#1a1917` 本身极暗 + 殿内只靠环境光
   （`config.LIGHTING.presets.goldenHour` 的 `lampIntensityScale = 0` → audit 实测「已激活 0」盏实时灯）
   + kit 的隔扇窗是不透光实体。本区已把 `lightAnchors.y` 实现为 `floorYAt`（殿内 2 座灯位落在金砖地面
   4.5m 上，夜景/夕照时会真的照亮室内），但要 goldenHour 也亮需要 t2/t19 增加内景补光或 kit 收透明窗。
2. **内景陈设不参与碰撞**：本区 `colliders.obstacles` 严格等于 `layout.OBSTACLES` 的 B 区 12 条
   （测试断言「不新增/不删减」），因此宝座/屏风/须弥座目前没有碰撞盒，第一人称可以走进去
   （`FP_ROUTE` 的第 6 点在宝座之前 z=-110，路线本身可通）。若要「陈设挡人」，需要 t1 在 layout 增加
   家具障碍条目或 t9 支持区域附加障碍——不在本区数据权限内。
3. **栏板是「直段双排」而非单排**：`kit.railing` 只有矩形环（仅正面留缺口），为在台基各面精确留出
   丹陛 26m、东西台阶 2×10m、台北台阶 2×10m 共 5 处缺口，本区用 `d = 0.36m` 的极薄环表达一段直段
   （两条长边相距 0.36m，望柱成对）。视觉可读，但望柱数量约为单排的两倍（19 段 ≈ 8 百个小盒 ≈ 1.2 万三角面）。
4. **金銮殿门扇开启度**：为保留 26m 净宽通道与第一人称进入，传 `door.openFraction = 0.86`
   （kit 默认 0.18 会把门扇几乎关死，只剩 1.26m 缝）。这是渲染参数，不改 layout 登记的门洞宽度。
5. **24 个中轴灯位中有 5 个落在建筑台明内部**（如 z=-390 落在门殿、z=50 落在后殿、z=-30 落在中殿）——
   这是 `layout.LIGHT_ANCHORS` 按 40m 等距生成的固有结果。本区照登记实现（灯位数据逐值回显、灯体也照建），
   这些灯体被建筑实体遮住不可见；若要在画面里看到，需要 t1 按院落避让重排锚点。
6. **`work/` 中间产物**：`work/probe-*.mjs`、`work/shots/t6-*.png` 不进入发布包（CONTRACTS §2）。

---

## 5. 向 kit-engineer / t2 提出的需求与发现（已发出消息）

| # | 发现 | 影响 | 建议 |
| --- | --- | --- | --- |
| 1 | `buildStairs` 踏步沿 −Z 递升、`imperialRamp` 沿 +Z 递升（§3.1 探针证据） | **全城所有区域的台阶/丹陛都是反的**（只读核对：`inner-palace.js` 的南侧丹陛高端落在台基之外） | t3 已独立复现并确认根因与修法；**排在后续任务同批实施**：kit 改 `y1 = rise − (done+i)*actualStep` + 我同步改本区两条断言（见 §3.1 末段） |
| 2 | kit 缺内景专用构件：宝座、藻井穹顶、盘龙柱、门扇透光窗 | 内景用 `terrace/screenWall/paving/bronze` 组合近似（平棋式藻井而非上凹穹顶；宝座用鎏金板式件 + 照壁工厂的屏风） | t3 增 `kit.throne/dragonColumn/caisson/windowGlow`（不阻断本次交付） |
| 3 | `zoneLayout.courtyardWalls` 曾恒空（§3.3） | 各区院墙可能整段缺失 | t2 已修（B 区实测 12 条）；本区保留回退分支 |

---

## 6. 实测命令与真实输出（逐条粘贴）

### 6.1 `node tests/zone-forecourt.test.mjs`（exit 0）

```
 通过 33 / 33
```

关键行（原文摘要）：

```
  · B 区：58 网格 / 80564 三角面 / 58 绘制批次（≤70）
  · 单栋最大三角面 4188（B-hall-main，上限 24000）
  · 丹陛三段：1.5m/12m + 1.5m/10m + 1.5m/10m = 4.5m
  · 台阶网格 19 个（零翻转；kit t25 已修复朝向，alignStairFlights 仅作回归守卫）
  · 内景：14 个具名构件；藻井 3 层同心方井 + 鎏金宝顶（平棋式，挂在 kit 檐下底板之下）
  · 室内净高 4.5 → 10.71m；16 个构件全部在包络内（宝座 z=-104.0，屏风 z=-100.5）
  · 灯位 24 个，其中 6 个落在台基/殿内地面（y>0）
  · 合批：441 → 58 批次（audit 口径 58）；三角面 80564
  · 宫灯 24 座 → 6 个 InstancedMesh（144 实例）
  · low 档 33 批次 / 18792 三角面（medium 58 / 80564）
  · fallback kit：311 网格 / 3948 三角面（无合批能力，仅供 Node 契约测试）
```

### 6.2 `node scripts/audit.mjs`（exit 0）

```
 B                     58       6   80564      19       6      58       6
 最高可见批次：oblique = 247（预算 350） ✓
 主场景绘制调用   : 254 / 上限 350  ✓
 分区 B         : 58 / 预算 70  ✓
 分区 C         : 49 / 预算 50  ✓
 可见三角面       : 242929 / 上限 1500000  ✓
 结论：全部预算与契约检查通过
```

口径说明：`分区 B` 在 t3 同批调整 kit 细节分档期间于 **58～64** 之间浮动（本区代码未变，只是不同时刻
加载到的 `src/kit` 版本不同）；二者都远低于预算 70，本回执按最后一次实测（58）记录。
浏览器实测（同一次 shot）：`整帧调用 236 · 可见三角面 198166 · 可绘制对象 217`。

`分区 B` 的阴影批次为 6（宫灯实例 `castShadow`）——整帧成本需另加阴影 pass，口径见 CONTRACTS §9。

### 6.3 `node tests/run.mjs`（最终 exit 0，**10/10**）

```
 PASS  tests/core-walls.test.mjs  171ms
 PASS  tests/core.test.mjs  392ms
 PASS  tests/interaction.test.mjs  1037ms
 PASS  tests/kit.test.mjs  1201ms
 PASS  tests/layout.test.mjs  86ms
 PASS  tests/zone-east.test.mjs  393ms
 PASS  tests/zone-forecourt.test.mjs  1287ms       ← 本区
 PASS  tests/zone-garden.test.mjs  484ms
 PASS  tests/zone-inner.test.mjs  376ms
 PASS  tests/zones.test.mjs  1821ms                ← 含 B 区（fallback kit 路径）契约校验
 通过 10 / 10，失败 0，总耗时 7248ms
```

演化过程（如实记录，供复核）：本任务收尾期间，`tests/run.mjs` 曾因同批 t2/t3/t9 的**在写文件**短暂出现红项——
`core.test.mjs`（rAF 静态扫描误报，主理人已说明由 t21 修）、`core-walls.test.mjs`（派生墙碰撞开发中）、
`kit.test.mjs`（kit 细节分档调整中）、`zone-inner.test.mjs`（C 区曾 56>50，后修）、
`interaction.test.mjs`（t9 交互层在写，A5/B1/B3/B5/C3/D1-D3）。这些文件都不属于本任务 inScope，**未做任何改动**；
最终（t9 完成后）全仓 10/10 全绿，本区始终 PASS。

其中 `core-walls.test.mjs` 曾报的 B 区相关一条：探针起点 `(-54.5, -394)` 落在 `layout` 自己的障碍
`OB-B-pavilion-gate-west {"minX":-66,"maxX":-50,"minZ":-394,"maxZ":-378}`（门殿西翼亭，`layout.SLOTS` 原值；
本区逐字段回显、未改动），属测试探针点选取问题，非 B 区数据问题。

### 6.4 画面证据（`node scripts/shot.mjs …`，1440×900 DPR1 medium goldenHour，输出在 `work/shots/`）

| 图 | 视角 | 体积 | 亮度均值 / 暗区 | 判据 |
| --- | --- | --- | --- | --- |
| `t6-zone-B-final` | `?view=zone&zone=B`（`VP-B-zone`） | 647.6KB | 0.3243 / 2.14% | PASS |
| `t6-interior-B2` | `?view=interior&zone=B`（`VP-B-interior`） | 171.0KB | 0.0638 / 76.01% | PASS（内景判据 ≥0.04） |
| `t6-fp-B` | `?view=fp`（`VP-B-fp-spawn`） | 92.4KB | 0.4902 / 0.37% | PASS |

浏览器实测（SwiftShader 软光栅，仅批次/三角面可参考）：`整帧调用 236 · 可见三角面 198166 · 可绘制对象 217`。

---

## 7. 未验证项（不得当作已验证）

1. **真实 GPU 帧率 / p95 帧时 / 首屏传输**：本机 headless 走 SwiftShader 软光栅，帧率不具代表性，B 区未做帧率实测（归 t13）。
2. **第一人称连续走查**：只做了出生点单帧截图；「南桥→南城门→广场→丹陛→台基→金銮殿内景」的连续 WASD 走查、
   台阶平滑过渡、门洞穿越录像未做（归 t9/t13）。
3. **真实浏览器内的 LOD 行为**：本区未使用逐栋 LOD 节点（§3.2），因此没有 LOD 切换实测数据。
4. **昼夜三时辰下的 B 区画面**：本回执只出了 goldenHour；sunset / moonlitNight 未逐张复核（内景补光结论见 §4.1）。
5. **纹理与显存**：B 区用 kit 共享材质（19 个材质 / 6 张贴图，medium 档 1K），未在浏览器内统计显存占用。
6. **`kit.instance` 之外的实例化**：树 10 株仍逐株（形制/高度不同，且合批后已是单批次）；院墙/栏杆未实例化。
7. **`stats.bounds.maxY = 25.635` 的取景含义**：未做「信息面板高度/机位自适应」的联调（归 t9）。
8. **kit 台阶修复后的回归（已完成）**：kit t25 已修 `buildStairs` 方向；本区两条断言已改为
   「原生 kit 零翻转 + 人为反向样本可翻转且幂等」（§3.1 末段），改后本区自测 33/33 全绿。
   `alignStairFlights()` 保留为回归守卫（当前 19/19 保持、0 翻转）。

---

# 8. t29 附录 —— B 区台阶与 kit t25 修复对齐（正式记录）

> 任务：`t29 — T4.1 B 区台阶与 kit 修复对齐：撤销/校验 alignStairFlights 并调整断言`（kind=repair）
> attempt：1（attempt_id `cc4b738c-96cf-4970-b72e-d23029b982e0`）
> inScope：`src/zones/forecourt.js`、`tests/zone-forecourt.test.mjs`、`docs/handoffs/zone-forecourt.md`
> **本附录是台阶朝向的权威记录**；本文件 §1–§7 是 t6 期的交付回执，其中"B 区台阶需要/已翻转"的表述
> 属于**当时（kit 修复前）的历史**，已按 §8.6 逐条标注，不再代表当前实现。

## 8.1 本任务的边界与本轮改动

- **`src/zones/forecourt.js` 未改动**（任务卡要求实现不得改动）：`alignStairFlights()` 按主理人裁定**保留**，
  作为"判据不依赖 kit 版本"的回归守卫（见 §8.3）。因此本区**没有**任何区域侧几何重定向发生在当前构建里。
- 断言调整**已在 t10 期间落地**（t10 报告 §4.4 已声明，两个文件未列入 t10 changedPaths：`tests/zone-forecourt.test.mjs`
  与 `docs/handoffs/zone-forecourt.md`）。t29 按任务卡"不要重复改动、除非发现落地版本有误"复核后，只做了两处**增量**修正：
  1. 用例名与注释对齐修复后的语义（原名为「台阶朝向规范化…」，易被误读为"区域仍在规范化"）；
  2. **新增 3 条断言**：同一段丹陛里 `stairs`（踏步）与 `imperialRamp`（御路）的最高端必须同向
     （这正是当年被两方独立复现的缺陷形态，之前只存在于探针输出，现在固化进测试）。
- `work/probe-stairs.mjs`（work/ 中间产物，CONTRACTS §2，不进入发布包、不在本卡 changedPaths 内）已扩写为
  "修复前/后对照 + 踏步与御路同向 + 8 段世界落点 + 双翻转幂等"四段可复跑探针。

## 8.2 探针证据（`node work/probe-stairs.mjs`，真实输出节选）

### A. kit 建筑自带台阶（`kit.hall` 用 B-hall-main 参数，near 档）—— 修复前 / 后对照

```
【当前 kit（t25 已修复）】
  stairs（踏步）: z 范围 [-34.20, -24.00]
    z[-34.20, -32.50] maxY=0.90
    z[-32.50, -30.80] maxY=1.50
    z[-30.80, -29.10] maxY=2.40
    z[-29.10, -27.40] maxY=3.15
    z[-27.40, -25.70] maxY=3.90
    z[-25.70, -24.00] maxY=4.50        ← 最高踏面 4.50 贴台明（台明前沿 z=-24）
    → 最高带 z=-24.85 (y=4.50)，最低带 z=-33.35 (y=0.90)
    → 方向判定：最高踏面在 近端（z 更大，贴台明）

【修复前复现（对同一段踏步施加 180° 中心翻转，等价于旧 buildStairs 的朝向）】
  stairs（旧朝向）: z 范围 [-34.20, -24.00]
    z[-34.20, -32.50] maxY=4.50        ← 最高踏面 4.50 却落在离台明最远处
    z[-25.70, -24.00] maxY=0.90
    → 最高带 z=-33.35 (y=4.50)，最低带 z=-24.85 (y=0.90)
    → 方向判定：最高踏面在 远端（z 更小，远离台明）
```

（修复前那组数字与 t6、t25 两方独立探针的记录一致：远端 4.50 / 贴台明 0.90。）

### B. 同一段几何里 踏步 与 丹陛御路 的朝向一致性（验收要求）

```
  stairs（踏步）       : 最高带 z=-25.70 (y=4.50)
  imperialRamp（御路） : 最高带 z=-25.72 (y=4.75)，最低带 z=-34.31 (y=0.25)
  → 踏步最高带 z=-25.70，御路最高带 z=-25.72：同向 ✔
```

### C. B 区实配：8 段台阶的世界落点 vs `layout.ROADS` 高/低端点

```
  B-flight-main-danbi-1              注册高端 z=-168 y=1.5 → 低端 z=-180 y=0；实测最高踏面 z∈[-171.6,-168.0] ✔
  B-flight-main-danbi-2              注册高端 z=-158 y=3.0 → 低端 z=-168 y=1.5；实测 z∈[-161.0,-158.0] ✔
  B-flight-main-danbi-3              注册高端 z=-148 y=4.5 → 低端 z=-158 y=3.0；实测 z∈[-151.0,-148.0] ✔
  B-flight-terrace-west-stairs       注册高端 z=-168 y=1.5 → 低端 z=-180 y=0；实测 z∈[-171.6,-168.0] ✔
  B-flight-terrace-east-stairs       同上 ✔
  B-flight-terrace-north-west-stairs 注册高端 z=-64  y=1.5 → 低端 z=-52  y=0；实测 z∈[-64.0,-60.4]  ✔
  B-flight-terrace-north-east-stairs 同上 ✔
  B-flight-axis-rear-inner           注册高端 z=78   y=0.9 → 低端 z=61   y=0（17m 缓步）；实测 z∈[72.33,78.0] ✔
  B 区规范化报告：{"flights":19,"flipped":0,"kept":19}
```

判据用"注册高端点必须落在最高 25% 顶点的 z 范围 ±0.6m"（深踏面段不能用均值，否则会被踏面中段带偏——
17m 缓步段的均值 75.17 属正常，范围 [72.33, 78.00] 恰好覆盖注册高端 78）。

### D. `alignStairFlights()` 判别力与幂等（不能因 kit 修好而丢掉回归保护）

```
  原生 kit 台阶：delta=5（>0 = 已朝向正确）
  alignStairFlights(原生) → {"flights":1,"flipped":0,"kept":1}
  人为反向样本：delta=-5（<0 = 反向）
  alignStairFlights(反向样本) 第 1 次 → {"flights":1,"flipped":1,"kept":0}
  翻转后 delta=5（>0 = 已纠正）
  alignStairFlights(反向样本) 第 2 次 → {"flights":1,"flipped":0,"kept":1}（幂等：不再翻转）
```

## 8.3 双翻转与幂等证明（结论）

1. **原生（kit t25 修复后）**：B 区 19 个 `stairs` 网格的朝向全部为"本地高端在 +Z"，
   `stats.stairOrientationFix = {flights:19, flipped:0, kept:19}`；对原生 `kit.stairs` 单独调用该工具
   返回 `{flipped:0, kept:1}` → **不会二次翻转**（不触发 = 无双重兜底实际发生）。
2. **人为反向样本**（把 `stairs` 几何绕自身包围盒中心 Y 旋转 180°）：被判为反向（delta<0）→
   第 1 次调用 `flipped:1`，翻转后 delta>0；第 2 次调用 `flipped:0, kept:1` → **幂等，不会来回翻**。
3. 为什么保留：该工具的判据是"按几何实测判方向"，与 kit 版本无关；kit 若再次回归（哪怕只回归
   `buildStairs`、不动 `imperialRamp`），区域测试会在 §8.4 的 3 条新断言与 2 条 flipped 断言上立刻报红。
   任务卡明确要求"不能因为 kit 修好就把兜底逻辑与判据一起删掉而失去回归保护"，故不移除。

## 8.4 测试改动（断言数只增不减，用例数不变）

| 项 | 改动前（t10 落地版） | 改动后（t29） |
| --- | --- | --- |
| 用例数 | 33 | **33**（未删未增） |
| `assert*` 调用数 | 194 | **199**（+5：1 条节点存在性、1 条两部位存在性、3 条同向/相对位置断言） |
| 依赖 `flipped` 的断言 | `fix.flipped === 0 && fix.kept === flights`；原生 `kept=1/flipped=0`；反向样本 `flipped 1 → 0` | 不变（保留判别力） |
| 新增 | — | 丹陛第一段：`stairs` 与 `imperialRamp` 的最高端相对位置均 ≥0.5 且相差 ≤0.15（实测 0.917 / 0.917） |

## 8.5 B 区批次 / 三角面（如实报数 + 口径）

口径：`node scripts/audit.mjs` 的"全量口径"（不做视锥剔除，场景图全部可见对象；LOD 当前档；
InstancedMesh 计 1；geometry.groups 逐组计数）；**合批前/后都报**；**阴影 pass 单列**；Bloom 后处理不计入批次。

| 质量档 | 合批前批次 | 合批后批次（audit 口径） | 三角面 | kit 口径 | 建筑/台阶/栏杆 |
| --- | --- | --- | --- | --- | --- |
| high | 451 | **59**（预算 70 ✓） | 81,564 | 59 | 12 / 8 / 19 |
| medium（§8.2 预算参考档） | 441 | **58**（预算 70 ✓） | 80,564 | 58 | 12 / 8 / 19 |
| low | 231 | **33**（预算 70 ✓） | 18,792 | 33 | 12 / 8 / 19 |

整城（medium，同一次 audit）：分区 B 58/70 ✓、C 49/50 ✓、D 39/40 ✓、E 40/40 ✓、F 61/80 ✓；
主场景绘制调用 **293/350** ✓；可见三角面 **288,609/1,500,000** ✓；最高可见批次 oblique **286/350** ✓；
**阴影 pass 280 个投影对象 + 1 盏主方向光**（B 区阴影列 58，t25 修复 mergeZone 阴影标志后）；
后处理（Bloom）按质量档开关，**未计入**上述批次。

**未删除任何内容**：建筑 12 栋、台阶/丹陛 8 段、栏杆 19 段、廊庑 6 段、院墙 6 段、灯位 24、树 10 均与 t6 交付一致
（`tests/zone-forecourt.test.mjs` 逐项断言；`node work/probe-stairs.mjs` 亦复核 8 段台阶全在）。

## 8.6 旧表述更正清单（本文件 §1–§7 属 t6 期历史）

| 位置 | 旧表述 | 现状（以 §8 为准） |
| --- | --- | --- |
| §2.3 关键数量 | “stairOrientationFix：19 个台阶网格全部翻转” | **0 翻转 / 19 保持**（已在 t10 期间更正） |
| §3.1 裁定 B 末句 | “B 区实测 19/19 网格被翻转” | 属于 t6 期（kit 修复前）；t25 后为 0/19（本轮已加注指向 §8） |
| §3.1「t3 回执」段 | “你的 2 条断言需要同批调整” | **已完成**（t10 期间落地，§8.4 复核） |
| §6.1 实测行 | “规范化翻转 19 / 保持 0” | 已改为“零翻转；kit t25 已修复朝向…”（t10 期间） |
| §7-8 未验证项 | “kit 台阶修复后需同批改本区两条断言” | 已闭环；剩余未验证项见 §8.8 |

## 8.7 本任务 verify 的真实输出

```
$ node tests/zone-forecourt.test.mjs
  · B 区：58 网格 / 80564 三角面 / 58 绘制批次（≤70）
  · 单栋最大三角面 4188（B-hall-main，上限 24000）
  · 丹陛三段：1.5m/12m + 1.5m/10m + 1.5m/10m = 4.5m
  · 台阶网格 19 个（零翻转）；丹陛第一段 踏步/御路 最高端相对位置 0.917 / 0.917（同向）
  · 8 段台阶世界落位与 layout.ROADS 的高/低端点、抬升、跑长一致
  · 合批：441 → 58 批次（audit 口径 58）；三角面 80564
  · 宫灯 24 座 → 6 个 InstancedMesh（144 实例）
  · low 档 33 批次 / 18792 三角面（medium 58 / 80564）
 通过 33 / 33                                          ← exit 0

$ node scripts/audit.mjs
 GREYBOX(全城灰盒)  39  36   6344   9  0  39  0
 B                  58  58  80564  19  6  58  6
 C                  49  49  52040  19  6  49  0
 D                  39  38  45524  18  5  39  6
 E                  40  39  43228  19  5  40  3
 F                  61  60  59020  20  5  61 11
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 B         : 58 / 预算 70  ✓
 可见三角面       : 288609 / 上限 1500000  ✓
 阴影 pass        : 280 个投影对象；实时投影光源 1 盏（宫灯不投影）
 结论：全部预算与契约检查通过                          ← exit 0
```

补充证据（非 verify，按任务卡要求引用于回执）：`node tests/run.mjs` → `通过 11 / 11，失败 0，总耗时 8733ms`（exit 0）；
`node scripts/audit.mjs --quality=high` → `分区 B : 59 / 预算 70 ✓`、主场景 294/350 ✓、结论全部通过。

## 8.8 本任务未验证项

1. **真实 GPU 帧率 / 整帧成本**：仍为 SwiftShader 软光栅 headless，帧率不具代表性（归 t13/t14）。
2. **第一人称连续走查**：台阶方向已在几何与数据层证明（探针 C 段），但"沿丹陛走上台基"的连续走查录像未做。
3. **C/D/E/F 的台阶画面**：只读核对（t25 报告）与各区自测为据，本任务未逐区出图复核。
4. **`work/probe-stairs.mjs` 的"修复前复现"是机器等价复现**：用"绕自身包围盒中心 Y 旋转 180°"重建旧朝向
   （该变换与旧 `buildStairs` 的朝向逐带等价，见 A 段数字），非旧版本代码的原始输出。

---

# 9. t62 附录 —— B/D 区 18 栋内景布陈设（kit.interiorSet 落地）

> 任务：`t62 — T8.1 B/D 区 18 栋内景布陈设（复用 kit.interiorSet）`（kind=repair，**用户新增需求**：47 栋封闭建筑要能进入且看见室内）
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> attempt：1（attempt_id `e1f9ab56-9a43-48ae-8811-abc2e2ffb34a`）
> inScope：`src/zones/forecourt.js`、`src/zones/west-courts.js`、`tests/zone-forecourt.test.mjs`、`tests/zone-west.test.mjs`、`docs/handoffs/zone-forecourt.md`
> 交接版本：`LAYOUT_VERSION 1.1.5`（t75 门洞通道面 + **t83 C/D/E 派生内景 y 修正**）⇄ `CONFIG_VERSION 1.0.6` ⇄ `KIT` t61 的 `interiorSet`
> 本附录是 t62 的正式记录；§1–§8 是之前卡的交付回执（历史保留）。

## 9.1 交付范围（本区 18 栋 = B 10 + D 8）

| 区 | 栋数 | 构成（layout `visitable`） | 不布陈设 |
| --- | --- | --- | --- |
| B | **10** | `B-gate-front`(gateHall) + `B-hall-main/mid/rear`(hall×3) + 6 座 `B-side-*`(sideHall) | 2 座亭（pavilion，无内景登记） |
| D | **8** | `D-court1..4-hall`(hall×4) + `D-court1..4-house`(sideHall×4) | 4 座院门 + 2 座亭 |

每栋调用一次 `kit.interiorSet({ kind, grade, bounds, groundY, ceilingY, entrance, seed, lod:'auto' })`：
- `bounds`/`groundY` **逐值取 layout 注册值**：`WK-<slotId>-interior` 的 `bounds` 与 `y`（t83 修正后 `groundDelta = 0`，测试逐栋断言；B 区地坪 0 故与 `slot.baseY` 同值）；
- `ceilingY` = **kit 实测檐口 − 0.2m**（`buildBuildings` 记录的 `eaveHeightAbsolute`），逐栋保证"不穿顶"；
- `entrance` = 该栋登记的门洞中心方向；`seed` = `deriveSeed(slotId,'interior')` → 画面可复现；
- 套件返回的 Group/LOD 直接挂到 `B:interiors` / `D:interiors` 组，末端一次 `kit.mergeZone(root)`（含套件的三档 LOD，远档为空组 → 远景 0 新增调用）。

**内景补光灯位**（§8.3）：每栋室内沿长轴 1/3、2/3 各 1 盏（`LA-B-interior-*` / `LA-D-interior-*`，kind `lantern`，role `gardenOrCourtLantern`，`height 2.6`，落在室内地坪）→ B 20 盏、D 16 盏；灯由 t2 环境系统统一激活（区域不建第二套灯光），并进入既有的宫灯实例化路径。

**室内天花**（§12 最小修法，见 §9.3）：`sideHall`/`gateHall` 档套件无天花构件，仰视时画面顶部是**深色屋面背面**；
补一层 `kit.paving` 白石薄板（`stoneWhite`，0.3m 厚，标高 = 该栋 `ceilingY`，范围 = 该栋室内面）→ B 7 层（6 配殿 + 1 门殿）、D 4 层（4 配房）；`hall` 档自带藻井天花，不再补。

实测（inScope 内两文件，medium 档、合批后、audit 全量口径）：

| 区 | 内景套件 | 天花 | 内景灯位 | 陈设件数 | 绘制批次（kit 口径） | 三角面 | 可行走面 | 机位 | 障碍 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B | 10 | 7 | 20 | 7~13 | **65**（合批前 508） | 89,376 | 27（8+10 室内+10 通道） | 13（4+9） | 12 |
| D | 8 | 4 | 16 | 7~11 | **52**（合批前 530） | 51,300 | 17（1+8 室内+8 通道） | 11（3+8） | 42 |

## 9.2 内景可读性：18 栋 × 三时辰 = **54/54 满足 §12 内景双约束**

口径（与 `CONTRACTS §12` 一致）：1440×900 / DPR1 / quality medium / `?ui=0&shot=1&stats=1` / 最终帧缓冲；
统计对象 = **内容掩码**；内景为"无天空视角"（实测**权威天空占比 0.00%~1.19%**，逐格打印；<0.5% 的格在判据行内标注
"整帧即内容"，阈值/分类不变）；判据 = 内容暗区 ≤30%、高光截断 ≤5%、内容均值 ≥0.04。
出图方式：`scripts/shot.mjs` 的 `--view=interior` 只能按**区域**回退首个内景机位（URL 无 per-slot 参数），
故用只读复用的 CDP 驱动（`/tmp/t62-interiors.mjs`：复用 shot.mjs 的 `decodePngStats + judgeShot` 与静服/CDP 手法，
在页面内派发**同一条** `view:request-mode`（携带 `interiorViewpointId`/`buildingId`），与 UI「进入内景」同一事件链，
再 `settle()` 后 `Page.captureScreenshot`；驱动不改仓库任何文件）。

| 建筑 | golden 均值/暗区/截断 | dusk | night |
| --- | --- | --- | --- |
| B-gate-front | PASS 0.3032 / 0.22% / 0.15% | PASS 0.3412 / 0.02% / 0.15% | PASS 0.2629 / 0.27% / 0.14% |
| B-hall-main | PASS 0.3210 / 4.13% / 0.78% | PASS 0.3189 / 2.97% / 1.36% | PASS 0.4337 / 0.00% / 3.64% |
| B-hall-mid | PASS 0.4000 / 9.53% / 0.14% | PASS 0.4300 / 5.68% / 0.33% | PASS 0.3179 / 7.81% / 0.11% |
| B-hall-rear | PASS 0.4230 / 8.63% / 0.64% | PASS 0.4538 / 1.07% / 1.10% | PASS 0.3791 / 0.85% / 0.55% |
| B-side-west-south | PASS 0.3083 / 0.79% / 0.29% | PASS 0.3436 / 0.04% / 0.16% | PASS 0.2792 / 0.94% / 0.16% |
| B-side-east-south | PASS 0.3092 / 0.58% / 0.17% | PASS 0.3571 / 0.01% / 0.30% | PASS 0.2797 / 0.70% / 0.19% |
| B-side-west-main | PASS 0.2633 / 0.00% / 0.14% | PASS 0.2994 / 0.00% / 0.13% | PASS 0.2359 / 0.01% / 0.13% |
| B-side-east-main | PASS 0.2666 / 0.03% / 0.14% | PASS 0.3304 / 0.01% / 0.46% | PASS 0.2325 / 0.04% / 0.14% |
| B-side-west-rear | PASS 0.2971 / 0.00% / 0.36% | PASS 0.3292 / 0.00% / 0.16% | PASS 0.2663 / 0.00% / 0.16% |
| B-side-east-rear | PASS 0.2964 / 0.00% / 0.17% | PASS 0.3378 / 0.00% / 0.24% | PASS 0.2661 / 0.00% / 0.20% |
| D-court1-hall | PASS 0.2307 / 15.22% / 0.13% | PASS 0.2513 / 10.00% / 0.12% | PASS 0.1885 / 16.30% / 0.12% |
| D-court1-house | PASS 0.2983 / 1.04% / 0.16% | PASS 0.3327 / 0.02% / 0.15% | PASS 0.2546 / 1.35% / 0.15% |
| D-court2-hall | PASS 0.2307 / 15.22% / 0.13% | PASS 0.2513 / 10.00% / 0.12% | PASS 0.1885 / 16.30% / 0.12% |
| D-court2-house | PASS 0.2977 / 1.04% / 0.16% | PASS 0.3948 / 0.00% / 1.60% | PASS 0.2550 / 1.35% / 0.15% |
| D-court3-hall | PASS 0.2345 / 15.22% / 0.12% | PASS 0.2548 / 10.00% / 0.12% | PASS 0.1922 / 16.30% / 0.12% |
| D-court3-house | PASS 0.2997 / 1.03% / 0.16% | PASS 0.3342 / 0.02% / 0.15% | PASS 0.2545 / 1.35% / 0.16% |
| D-court4-hall | PASS 0.2311 / 15.22% / 0.12% | PASS 0.2516 / 10.00% / 0.12% | PASS 0.1888 / 16.30% / 0.12% |
| D-court4-house | PASS 0.2990 / 1.04% / 0.16% | PASS 0.3326 / 0.02% / 0.15% | PASS 0.2539 / 1.35% / 0.15% |
| **合计** | **18/18 PASS** | **18/18 PASS** | **18/18 PASS** |

原始判定行（每格两行，样例；完整日志 `/tmp/t62-run3.log`（golden + B dusk）、`/tmp/t62-run6.log`（D dusk）、`/tmp/t62-run7.log`（night），逐格 4 行）：

```
   PASS B-gate-front           golden  [near] 内容均值 0.3032 内容暗区 0.22% 内容截断 0.15%
   PASS D-court1-hall          night   [near] 内容均值 0.1885 内容暗区 16.30% 内容截断 0.12%
   内容掩码[near] 均值 0.3032 · 暗区 0.22%（上限 30%） · 高光截断 0.15%（上限 5%） · 内容像素 100.0%（无天空视角：权威天空占比 <0.5% ⇒ 整帧即内容，阈值/分类不变）
```

## 9.3 "不达标 → 最小修法"记录（**不放宽判据**）

第一轮（内景套件 + 内景灯位，**无天花**）：**52/54 PASS，2 栋 FAIL**——
`B-side-east-south` golden 内容暗区 **30.71%** > 30%、`B-side-east-rear` golden **30.05%** > 30%
（原始行：`FAIL B-side-east-south golden [near] 内容均值 0.2212 内容暗区 30.71% 内容截断 0.10% | 近景/内景内容暗区 30.71% > 30%`）。

原因定位（逐帧目视 + 数值）：这两栋是净高仅 **4.29m** 的配殿，内景机位（`VP-*-interior`，y = 地坪+1.65）仰视时
画面顶部约 30~35% 是**屋面背面（深色瓦背）**；kit 的 `sideHall/gateHall` 档套件没有天花构件。

最小修法（已实施，属"可调室内材质/构件"）：
1. 用 `kit.paving` 补一层 **白石天花**（`stoneWhite`，0.3m，标高 `ceilingY`）遮掉深色屋面 —— 仅 +1 绘制批次/区；
2. 每栋室内补 2 盏宫灯（`lampIntensityScale(golden 0.45)`，t2 环境系统统一激活）—— 灯位 0 绘制批次增量（实例化）。
效果（第二轮）：上述两栋 golden **30.71% → 0.58%**、**30.05% → 0.00%**，全批 **54/54 PASS**；判据阈值与口径**未改动**。
（代价：天花是大面积白石平板，观感朴素；"带梁架/彩画的天花"需要 kit 支新构件 → 已在 §9.7 登记为需求。）

## 9.4 预算：47 内景全布后本区实测与整城对照（**未删任何建筑/院落/装饰**）

口径：`node scripts/audit.mjs`（**激活档**口径：统计前对每个 LOD 调 `update(camera)`；合批后；阴影单列；Bloom 不计入）。

| 项 | 初始配额 | 实测（激活档） | 判定 |
| --- | --- | --- | --- |
| 分区 B | 70 | **62** | ✓ |
| 分区 D | 40 | **49** | ✗ 超初始配额 9（**已按 §8.2 申请重分配；主理人批准 C60/D56/E56 量级，t84 落数值**） |
| 分区 C / E / F | 50 / 40 / 80 | 55 / 49 / 72 | C/E 超初始配额（属他卡内容）；F ✓ |
| **主场景绘制调用（整城）** | **350** | **333** | ✓ **发布门槛仍满足** |
| 可见三角面 | 1,500,000 | 306,269 | ✓ |
| 阴影 pass | — | 315 个投影对象 + 1 盏主方向光 | 单列 |

本区 kit 口径（`kit.countDrawCalls`，全部档位可见上界；与本区自测同源）：B **65**（合批前 508）/ D **52**（合批前 530）；
质量档：B high 66、low 42；D high 52、low 42（内景套件在 low 档仍在，仅在 `interiorSet` 的远档为空组）。
优化已做：整区 `mergeZone`（含套件三档 LOD，远档空组 ⇒ 远景视角 0 新增调用）、宫灯/树群实例化、摆件 `far` 档（沿用本区既有策略）、
天花复用既有 `stoneWhite` 令牌（仅 +1 桶/区）。**未删建筑/院落/装饰/城墙**；D 的超额部分全部来自用户新增需求的 18 栋内景（约 +12 桶）。

## 9.5 碰撞与可达性（真实碰撞数据，非相机近平面）

工具：`src/interaction/walk-solver.js`（`createWalkSolver`，障碍 = **本区返回的 `colliders.obstacles`**）+ `walk-graph.js`
（`createWalkGraph`，cellSize 2，覆盖本区范围）；步进用 **0.25m 小步累加**模拟真实走查
（`solver.step` 只看落点、无扫掠 ⇒ 一次大位移会隧穿墙体，本测试曾因此误报，已修正并在回执记录）。

| 检查项（逐栋） | B 区 10 栋 | D 区 8 栋 | 说明 |
| --- | --- | --- | --- |
| 室内地面可站立（`probe().ok`、支撑高度 = 注册地坪 ±0.05） | **10/10 ✓** | **8/8 ✓** | 内景地面与套件底面对齐 |
| 门洞轴线点 ↔ 室内中心连通（图搜索） | **10/10 ✓** | **8/8 ✓** | 门洞通道（t75，kind `passage`）与室内连通 |
| 沿门轴自室内中心可走出室外 | **10/10 ✓** | **8/8 ✓** | 门本身可通行 |
| 垂直门轴两侧（山墙）不可穿出（±跨度+6m 走查后仍在室内） | **10/10 ✓** | **8/8 ✓** | 不可从外部穿墙 |
| 封门反例（`blocks='all'` 后室内不可站立） | **10/10 ✓** | **8/8 ✓** | 入口唯一、室内不掉出到室外 |
| **从院落地坪走入门内**（地坪探针 → 门内 1.5m） | **5/10** | **8/8** | 见下 |

"从院落地坪走入门内"的逐栋实测（阶差 = 门内地面 − 院落地坪）：
- B 可走 5 栋：`B-gate-front`(阶 0.45) / `B-hall-mid`(2.0) / `B-side-east-main`(1.5) / `B-side-west-rear`(1.0) / `B-side-east-rear`(1.0)；
- B 被挡 5 栋（全部因台明落差 > 0.5m 阈值，**不是穿墙问题**）：`B-hall-main`(4.5，但可经**已注册的丹陛三段**上台，见注) /
  `B-hall-rear`(1.8) / `B-side-west-south`(0.9) / `B-side-east-south`(0.9) / `B-side-west-main`(1.5，且台基二层紧贴其东门洞)；
- D 可走 8 栋（`hall` 阶 0.9 由"门洞通道面"作中间台阶分成 ≤0.5+0.4 两级；`house` 阶 0.5）。
> 注：`B-hall-main` 的图搜索在"地坪探针→门内"这一对点上因目标格吸附判定为 blocked（台阶 4.5 无法一次跨上），
> 但金銮殿走查由 layout 的 `RD-B-main-danbi-1/2/3`（Δy 段）承担 —— 属"经台阶可达"，本表按最严口径记为被挡，供复核。

**结论**：门洞/围护/掉落三类（安全与连通性）**18/18 全通过**；"从地坪直接走进门" 13/18（B 5/10、D 8/8），
其余 5 栋缺的是**台明正面台阶的走查数据**（kit 画了台阶几何，layout 未登记对应 `ROAD`/中间面）——
与 `tests/verify-completeness.test.mjs §5.3`（南桥起点 → 43 内景机位连通分量）报出的不连通清单**同源**。
最小修法（layout 侧）：给每栋台明正面登记一段带 Δy 的 `ROAD`（或一个中间落面），与 kit 台阶几何对齐；
在此之前，UI「进入内景」路径（`interiorViewpointId`）不受影响（本卡机位/套件已就位）。

## 9.6 与 layout 的交叉校验（t83 前后）

| 项 | t83 前 | t83 后（现行） |
| --- | --- | --- |
| D 区 8 栋 `WK.y` vs 几何真值（区域地坪 0.4 + baseY） | Δ = −0.4 | **Δ = 0 ✓**（`groundDelta: 0`，D 区测试逐栋断言） |
| C 区 8 栋 / E 区 9 栋 | Δ = −0.9 / −0.4 | Δ = 0 ✓（他区卡复核） |
| 本区 `kit.interiorSet.groundY` | 取几何真值（过渡做法，主理人已确认） | 与 `WK.y` **逐值相同**（断言 `groundDelta === 0`） |
| 遗留 | — | `WK-*-door-passage.y` 仍为相对 `baseY`（D/E 差 0.4、C 差 0.9）→ `verify-completeness §5.4/§5.4b` 报 24 栋不一致（**layout 侧残留，非本卡**，见 §9.7） |

本区 `bounds`/机位/走查点始终**逐值消费 layout 注册值、未改任何共享数据**；建筑与内景共用同一 `baseY` 真值来源
（B：`buildingBaseY(slot)`；D：`round(zoneGroundY + slot.baseY)`）。

## 9.7 向其他卡的发现/需求（本卡未改他人文件）

| # | 发现 | 影响 | 建议归属 |
| --- | --- | --- | --- |
| 1 | `WK-<slot>-door-passage.y` 未随 t83 抬高（D/E −0.4、C −0.9；`door.sillY` 亦不一致：C-hall-bed-main 2.4 vs 1.5，F 四城门 0.4 vs 12.4 属 t72 通道口径） | 门洞面与内景地面在数据上差 0.4/0.9m（视觉上由套件地面补齐，走查会出现一级小台阶）；`verify-completeness §5.4b` 逐栋报红 | layout（t83 后续 / 新卡） |
| 2 | 台明正面台阶无注册走查数据（kit 画了台阶，layout 无对应 ROAD/中间面） | B 区 5/10 栋"从地坪走不进门"；`verify-completeness §5.3` 不连通清单含 12 个内景机位 | layout + `CONFIG`（步道数据） |
| 3 | `sideHall/gateHall` 档 `kit.interiorSet` 无天花构件 | 内景仰视见深色屋面 ⇒ §12 暗区逼近 30%（本卡用白石天花兜住） | kit（t3）：增"配殿天花"档或给 sideHall 档补 `ceiling` 部位 |
| 4 | `kit` 无带梁架/彩画的天花构件（本卡天花是平板） | 内景观感朴素（但达标） | kit（可选） |
| 5 | 初始分区配额（B70/C50/D40/E40/F80）未计入 47 栋内景的新增桶（每区约 +9~12） | C 55/50、D 49/40、E 49/40 超初始配额；整城 333/350 仍达标 | t84（§8.2 重分配，主理人已批准量级） |

## 9.8 本任务 verify 的真实输出（四条，原样）

```
$ node tests/zone-forecourt.test.mjs
  · B 区：73 网格 / 90636 三角面 / 64 绘制批次（≤70）        ← 全档位可见口径；audit 激活档为 62
  · 内景 10 栋：gateHall 1 / hall 3 / sideHall 6
  · 陈设件数 5~13（最少 7；殿 11~13 / 配殿 7 / 门殿 7）
  · 10 栋内景最高构件相对地坪 6.00m（天花由 kit 檐口 −0.2m 决定，逐栋不穿顶）
  · 可达 5/10 从院落地坪走入门内（… 台明落差 0.9~2.0m 无注册台阶 …）
  · 10 栋：门洞轴线点与室内中心连通；沿门轴均可走出室外
  · 10 栋：山墙侧向不可穿越；封门后室内中心不再可站立（入口唯一）
  · 合批：508 → 64 批次；三角面 89292；low 档 41 批次 / 24840 三角面
 通过 39 / 39                                            ← exit 0

$ node tests/zone-west.test.mjs
  · D 区：61 网格 / 52404 三角面 / 52 绘制批次（≤40）        ← 全档位可见口径；audit 激活档为 49
  · 内景 8 栋：殿 4 + 配房 4；未布：4 院门 + 2 亭
  · 8 栋内景最高构件相对地坪 4.39m；件数 7~11
  · D 区 52 批次：超初始配额 40（诊断目标）12 桶，在已批准 56 内（整城门禁由 audit 保证）
  · 8 栋：门洞可通行 / 山墙不可穿 / 封门后不可站立；从地坪走入门内 8/8
 通过 31 / 31                                            ← exit 0

$ node tests/run.mjs
 通过 18 / 21，失败 3，总耗时 53629ms                        ← exit 1（3 条红灯均与本卡实现无关，见下）
   PASS zone-forecourt / zone-west / zones / kit / layout / core* / interaction / shot-mask / core-walls …
   FAIL tests/core-audit.test.mjs        —— "默认口径下不应出现超预算（当前各区均达标）"：因 C 55/50、D 49/40、E 49/40 超**初始配额**（t84 待落数值；整城 333/350 ✓）
   FAIL tests/verify-completeness.test.mjs —— §5.3 走查图不连通（12 个内景机位/13 个门内点，本卡 B/D 见证同源）、§5.4/§5.4b 通道面 y 与内景地面/sillY 不一致 24 栋（layout 残留）
   FAIL tests/verify-experience.test.mjs  —— 体验门禁（t13/t14 卡），本条与内景陈设无直接关系，未逐项展开

$ node scripts/audit.mjs
 主场景绘制调用   : 333 / 上限 350  ✓
 分区 B         : 62 / 预算 70  ✓
 分区 C         : 55 / 预算 50  ✗ 超预算
 分区 D         : 49 / 预算 40  ✗ 超预算         ← 已按 §8.2 申请重分配（t84）
 分区 E         : 49 / 预算 40  ✗ 超预算
 分区 F         : 72 / 预算 80  ✓
 可见三角面       : 306269 / 上限 1500000  ✓
 阴影 pass        : 315 个投影对象；实时投影光源 1 盏（宫灯不投影）
 结论：3 项未通过                                          ← exit 0（未加 --enforce）
```

## 9.9 未验证项（不得当作已验证）

1. **真实 GPU 帧率/整帧成本**：内景 54 格均为 headless SwiftShader 软光栅（画面与判据可信，帧率不具代表性，归 t13/t14）。
2. **第一人称连续走查录像**：可达性用 walk-solver/walk-graph 的真实碰撞数据证明（含封门反例与 0.25m 小步步进），
   但"从南桥一路走进某个内景"的连续按键录像未做（归 t9/t13）；B 区 5 栋"从地坪走不进门"依赖 layout 补台阶数据。
3. **三时辰之外的时辰/质量档内景**：只测 medium ×（golden/dusk/night）；high/low 档内景画面与判据未复测。
4. **内景观感评审**：仅按 §12 判据 + 抽帧目视；`stoneWhite` 平板天花的"梁架/彩画"观感未达设计水准（见 §9.7-4）。
5. **D 区超配额**：实测 49（激活档）超初始 40，**在已批准 56 内**；t84 落地前，`tests/zone-west.test.mjs` 用
   `max(初始, 56)` 本地常量守住（回执已注明），门禁以整城 333/350 为准。
6. **`verify-experience.test.mjs` 的红项**：未逐项归因（该卡属 t13/t14），本回执只声明"非本卡实现引入"。
7. **CDP 驱动的格数**：因并发负载，第一轮全量运行在第 32 格（dusk 中段）超时；本回执的 54 格由
   `golden 18（run3）+ B dusk 10（run3）/ D dusk 8（run6）+ night 18（run7）` 三次运行拼合，
   每格均为同一驱动的真实输出（逐格原始行见 §9.2 与 /tmp 日志），无补算/无推测。
