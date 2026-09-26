# handoff-west-courts（t10）· D 区西侧宫苑 —— 开工 + 交付回执

> 任务：`t10 — T8 D 区西侧宫苑：≥4 组院落、连接道路与完整装饰`
> 负责人：`zone-forecourt`；attempt：1（attempt_id `4dea6c32-766e-44eb-beb3-e5b4795cd17e`）
> 可写范围（inScope）：`src/zones/west-courts.js`、`tests/zone-west.test.mjs`、`docs/handoff-west-courts.md`
> 依赖：t1（layout/config/CONTRACTS 冻结）、t2（core/harness/audit）、t3（kit 构件），以及本人先完成的 t6（B 区）。
> 本文件同时包含**开工回执**（§1）与**交付回执**（§2 起）。

---

## 1. 开工回执（写代码之前）

### 1.1 已读版本（开工时逐一核对）

| 文件 | 版本 / 关键值 |
| --- | --- |
| `imperial-palace-plan.md` | §2.3 边界与连接规则、§3 风格、§5.4 西侧宫苑、§6.1/§6.4 契约与机位、§8.2 预算 |
| `docs/CONTRACTS.md` | `CONTRACTS v1.0.1` ⇄ `CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` |
| `src/shared/layout.js` | D 区槽位 14、院落 4、owner=D 连接 2、道路 11 段（1 段带标高差）、可行走面 1、障碍 15（14 建筑 + WB-D-pond）、机位 3、灯位 2、院墙 16 段、廊庑 4 段、植被 32 株（花树 6） |
| `src/shared/config.js` | `CONFIG_VERSION 1.0.1`；`TERRAIN.sideCourtY 0.4`、`BUDGET.drawCalls.perZone.D 40`、`MODULES.courtyardWallHeight 4.2` |
| `src/core/layout-slice.js` | `zoneLayoutFor('D')`（t2 已修 `courtyardWalls`，D 实测 16 条）；`rampsFromRoads` |
| `src/kit/index.js` | `KIT_VERSION 1.0.0`（含 t25 的台阶方向修复与 mergeZone 阴影标志修复） |
| `tests/harness.mjs` | `makeTestCtx({ kit })` 可注入真 kit；`validateZoneResult` 逐字段回显 |

### 1.2 开工时的判断（已按证据自行裁定，见 §3）

1. **竖直定位**：D 区地坪 `sideCourtY = 0.4`，而 `SLOTS.baseY` 是相对区域基准 0 的估值 →
   建筑必须抬到地坪（`baseY(kit) = 0.4 + terraceH`），檐口交叉校验相应变成 `layout.eaveHeight + 0.4`。
2. **分区预算 40 偏紧**：D 有 14 槽位（比 E 少 1 但院落更深），先做实测再定成批策略（见 §3.2）。
3. **院墙归属**：`layout.OBSTACLES` 只登记建筑与水体，院墙实心段需本区补进 `colliders.obstacles`
   （core 的 `deriveWallColliders` 会按 id/几何去重）。
4. **与 E 的差异**：体量来自同一份冻结布局（必然相近），差异必须落在**装饰语言**上（§3.3）。

---

## 2. 交付回执

### 2.1 文件清单（inScope 三文件；另见 §4.4 的跨任务联动）

| 文件 | 状态 | 内容 |
| --- | --- | --- |
| `src/zones/west-courts.js` | 新增（约 1,050 行） | D 区实现：14 槽位建筑、16 段院内墙、4 段院南廊、15 块铺装（含白石甬道）、荷池（池底/水面/池岸/环池石栏/汀步/池心岛）、13 处灯位、16 件铜器、32 株乔木（实例化）；`createZone(ctx)` + `ZONE_ID` + `default` |
| `tests/zone-west.test.mjs` | 新增（26 用例） | 契约 / 建筑与地坪抬升 / 四院落 / 荷池 / 连接对齐 / 碰撞与真实走查探针 / 机位灯位 / 预算与实例化 / 行为 / 灰盒兼容 |
| `docs/handoff-west-courts.md` | 本文件 | 开工 + 交付回执 |
| `tests/zone-forecourt.test.mjs` | **联动修改**（t6 的本人文件，非本卡 inScope） | 见 §4.4：kit t25 修复台阶方向后，t6 两条断言按 kit-engineer 书面要求改成"原生台阶零翻转 + 人为反向样本可翻转" |

未改动：`src/shared/**`、`src/core/**`、`src/kit/**`、`src/main.js`、`index.html`、`src/ui/**`、
`src/interaction/**`、`src/zones/forecourt.js`、其它任何区域文件。

### 2.2 交付内容对照 §5.4

| 计划 §5.4 要求 | 落地 |
| --- | --- |
| ≥4 组可识别院落，每组有门、主屋、配房及连接步道 | 4 组：`CY-D-court1` 礼乐院 / `court2` 书院院 / `court3` 服务院 / `court4` 西后院；每组 = 院门（12m 门洞）+ 主屋（24×56 歇山，朝东）+ 配房（40×18 硬山）+ 院南廊（3.6m 宽）+ 院前步道（`RD-D-courtN-path`）+ 四面内墙 |
| 体量足够，不是中轴旁几栋孤立小屋 | 院落 178×148…178×202m；建筑占地 24×56（主屋）与 40×18（配房），整体包围盒 x[-300,-100] z[-400,300]、最高 15.27m |
| 通过规模/植物/水池/亭廊/摆件与 E 区分，避免机械镜像 | 装饰语言 = **池石景 + 四院南廊 + 甬道列植**：荷池 64×52 配**池心岛 18×18 + 池上小亭 + 环池石栏 + 33m 汀步石桥（可走到池心）**（E 的水榭为纯观赏、无可走路径）；**不设影壁**（E 为"进门见屏"）；铜器 16 件用鼎（`vessel`）成对陈于主屋/院门之前；三带列植（甬道 / 池畔 / 院角）——E 为沿院墙内侧成列 |
| 与 E 色调/模数/屋顶等级统一 | 同一套 kit 构件 + config 令牌；形制集合 `hall/sideHall/courtyardGate/pavilion`、屋顶集合 `gableHip/gable/pyramidal` 与 E 完全同源（测试断言）；等级-屋顶白名单由 kit 强校验 |
| 自有内墙与道路负责；外宫墙/城门/水系不越界 | 16 段院内墙 + 4 廊 + 11 段道路铺装（含西城门内接 `x=-291`、花园西入口 `z=290…300` 路端）；源码与几何双向断言不得出现 `WALL-CITY`/`MOAT`/`BRIDGE-`/`cornerTower`/`F-` 槽位 |
| 边界通道按连接 ID 对齐 | 2 条 owner=D 连接（`CXN-B-D-plaza-west` / `CXN-B-D-rear-west`）position/width/elevation 逐值回显，且道路端点落在通道点上（≤1cm） |
| 14 槽位 id 逐一一致、不扩张边界 | 14/14 槽位 id 与注册表逐一相同；包围盒实测 x[-300,-99.98] z[-400,300]（2.5cm 为台明压顶外沿容差） |
| ≥1 zone 机位 + ≥1 fp-spawn；不可进入建筑登记障碍 | 3 机位（zone/fp-spawn/focus-extra，与 layout 逐字段一致）；fp-spawn y=2.05=地坪0.4+1.65；14 栋建筑全部登记障碍（院门 `exceptDoor` 12m、其余 `all`） |
| 预算 ≤40；树木与重复构件实例化/LOD | 实测 **39/40**（合批 386→39）；树 32 株 → 3 个 InstancedMesh、宫灯 13 座 → 3 个 InstancedMesh（共 6 个实例化网格 / 97 实例） |

### 2.3 关键数量（`createZone` 返回的 `stats`，实测）

```
buildings 14（hall 4 / sideHall 4 / courtyardGate 4 / pavilion 2）  courtyards 4
connectors 2   obstacles 42（layout 15 + 池体拦阻 5 + 院墙实心段 22）   walkable 1   ramps 1
viewpoints 3（zone 1 / fp-spawn 1 / focus-extra 1）   lightAnchors 13（layout 2 + 本区 11）
courtyardWalls 16   corridors 4   pavingSlabs 15   roadSegments 11
trees 32（花树 6，实例化）   lamps 13（实例化）   bronze 16
water：荷池 64×52 @0.05m，池岸 4 段 / 石栏 5 段 / 汀步 33m / 池心岛 18×18
drawCalls medium 39（合批前 386）· low 29        triangles medium 45,524 · low 28,044
单栋最大三角面 3,116（D-court1-hall，上限 24,000）
bounds x[-300,-99.975] y[-0.3,15.269] z[-400,300]
```

### 2.4 与 layout/kit 的交叉校验（均入测试）

- 14 槽位 id 逐一回显；`|kit.eaveHeightAbsolute − (layout.eaveHeight + 0.4)| ≤ 6mm`（14/14）。
- 4 院落 × 4 内墙覆盖（四边 `covers()` 断言）；院门开口落在门中心（净宽 12m ≥ 8m）；廊庑/步道按 id 与 layout 对应。
- 荷池池界/水面标高与 `layout.WATER_BODIES['WB-D-pond']` 逐值一致；汀步终点正好接岛南沿（不重叠不留缝）。
- 2 条连接逐值一致且与道路端点共享位置/标高；13 个灯位落在 `floorYAt` 地坪上且不在障碍内。
- 真实走查探针（用返回的 colliders 做几何判定）：池面阻挡 ✓、汀步 33m 可通 ✓、院墙阻挡 ✓、院门 12m 门洞可通 ✓、池心岛台面可站 ✓。

---

## 3. 三处关键裁定与证据

### 3.1 地坪抬升（`baseY(kit) = 0.4 + terraceH`）

`layout.WALKABLE['WK-D-ground'].y = 0.4`、`VP-D-fp-spawn.y = 2.05 = 0.4 + 1.65`，而 `SLOTS.baseY` 是按
"区域基准 0"估的台基顶。若不抬升，建筑会整体埋进 0.4m 地坪。故 kit 摆位统一 `groundY + terraceH`，
檐口交叉校验相应为 `layout.eaveHeight + groundY`（测 14/14 ≤6mm）；返回给契约的 `buildings` 仍逐字段回显 layout 原值。

### 3.2 分区预算 40 的成批策略（实测对照）

| 策略 | audit 口径批次 | 说明 |
| --- | --- | --- |
| 建筑单档 `mid` + 摆件 `mid` + 2 种铺地材质 + `censer` 铜器 | **47** | 超预算 7 |
| 摆件降到 `far`（宫灯只剩 base/post/body、铜器只剩器身） | 44 | −3 |
| 甬道由"第二种铺地材质"改为 `kit.terrace` 白石（复用 terrace 桶） | 42 | −2 |
| 铜器统一用 `vessel`（`censer` 的双手柄在 kit 里没有 detail 门槛，恒占 1 桶） | 41 | −1 |
| 池心岛/汀步改用既有 `terrace`/`paving` 桶（不再新增材质） | **39** | 达标（≤40） |

结论：**39/40**，且没有删任何建筑、院落或装饰；被"降档"的只有摆件的小件（望柱帽、铜器耳足）——
理由是分区机位 110m、第一人称视距 2m 下这些细节不改变识别性。质量档仍真实生效（low 档 29 批次 / 28,044 三角面）。
若后续需要摆件回到 `mid`（+6 批次），按主理人 t10 前的裁定走"调整配额并记录理由"，不在本区私自放宽。

### 3.3 与 E 的"统一但非镜像"（可机器核对的部分）

- **统一**（测试断言）：形制集合与屋顶集合与 E 完全同源；材质/模数/等级全部走 kit + config 令牌（kit 对等级-屋顶白名单强校验）。
- **差异**（测试断言 + 几何事实）：
  1. `D 区不设影壁`——源码断言 `!/screenWall/`，几何上也没有 `screenWall*` 部件桶；E 以两处影壁作"进门见屏"。
  2. `池心可走`——本区池面拦阻盒按"汀步走廊 ∪ 池心岛"扣出 5 段（`OB-D-pond-guard-*`），
     走查探针证明"池面阻挡 / 汀步 33m 可通 / 岛台可站"；E 的水榭是纯观赏（不可走）。
  3. `装饰语言`：16 件铜鼎成对陈于主屋与院门之前；32 株乔木按"甬道列植 / 池畔 / 院角"三带布置（E 为沿院墙内侧成列）。
  4. 院落进深不同（D 四院 178×202 / 148 / 148 / 148，E 为 178×168/158/164/156）——来自 layout 冻结数据，
     两区只在体量层相近，装饰层不共用脚本、不共用布置。

---

## 4. 实测命令与真实输出

### 4.1 `node tests/zone-west.test.mjs`（exit 0，26/26）

```
 通过 26 / 26
```
关键行（原文）：
```
  · D 区：39 网格 / 45524 三角面 / 39 绘制批次（≤40）
  · 单栋最大三角面 3116（D-court1-hall，上限 24000）
  · 形制 hall/sideHall/courtyardGate/pavilion · 屋顶 gableHip/gable/pyramidal
  · 四院 4 组：门 4 / 主屋 4 / 配房 4 / 亭 2
  · 四院南廊：CR-D-court1-south / CR-D-court2-south / CR-D-court3-south / CR-D-court4-south
  · 荷池 64×52m，水面 0.05m，池岸 4 段 / 石栏 5 段 / 拦阻 5 段
  · 连接 CXN-B-D-plaza-west / CXN-B-D-rear-west
  · 障碍 42 条 = layout 15 + 池体拦阻 5 + 院墙段 22
  · 走查探针：池面阻挡 ✓ / 汀步 33m 可通 ✓ / 院墙阻挡 ✓ / 院门 12m 门洞可通 ✓
  · 灯位 13：layout 2 + 本区 11（院门 8 / 池畔 2 / 后园 1）
  · 合批：386 → 39 批次（audit 口径 39）；三角面 45524
  · 实例化：6 个 InstancedMesh / 97 实例（树 32 株含花树 6，灯 13 座）
  · low 档 29 批次 / 28044 三角面（medium 39 / 45524）
  · fallback kit：376 网格 / 6572 三角面
```

### 4.2 `node scripts/audit.mjs`（exit 0）

```
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     58      58   80564      19       6      58       6
 C                     49      49   52040      19       6      49       0
 D                     39      38   45524      18       5      39       6
 E                     40      39   43228      19       5      40       3
 F                     61      60   59020      20       5      61      11
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 D         : 39 / 预算 40  ✓
 可见三角面       : 288609 / 上限 1500000  ✓
 结论：全部预算与契约检查通过
```
（阴影列已含 t25 的 `mergeZone` 阴影标志修复：B 58 / C 49 / D 38 / E 39 / F 60，小计 280。）

### 4.3 `node tests/run.mjs`（exit 0，11/11 全绿）

```
 PASS  tests/core-walls.test.mjs / core.test.mjs / interaction.test.mjs / kit.test.mjs
 PASS  tests/layout.test.mjs / zone-east.test.mjs / zone-forecourt.test.mjs
 PASS  tests/zone-garden.test.mjs / zone-inner.test.mjs / zone-west.test.mjs / zones.test.mjs
 通过 11 / 11，失败 0，总耗时 27727ms
```

### 4.4 跨任务联动（kit t25 台阶修复 → t6 断言调整）

kit-engineer 的 t25 修好了 `buildStairs` 的踏步方向（台阶与丹陛同向），并书面请我调整 t6 里两条
"依赖旧缺陷"的断言。已在 `tests/zone-forecourt.test.mjs`（本人文件）改为：
- `台阶朝向规范化`：原生 kit 台阶 **零翻转**（`flipped===0 && kept===flights`），判据不再依赖版本号；
- `规范化工具本身`：原生样本 **kept=1**（已正确不翻转）+ **人为反向样本**（把 `part==='stairs'` 几何绕自身
  包围盒中心 Y 旋转 180° 造样本）`flipped===1`、第二次 `flipped===0`（幂等）——保住判别力。
改后 `node tests/zone-forecourt.test.mjs` 33/33 全绿，`alignStairFlights` 保留为回归守卫。
`src/zones/forecourt.js` 未改动（仍属 t6 的 inScope，本卡只动测试）。

### 4.5 画面证据（1440×900、DPR1、medium、goldenHour；输出在 `work/shots/`，不进发布包）

| 图 | 视角 | 体积 | 亮度均值 / 暗区 | 判据 |
| --- | --- | --- | --- | --- |
| `t10-zone-D-final` | `?view=zone&zone=D`（`VP-D-zone`） | 535.4KB | 0.4643 / 4.81% | PASS |
| `t10-pond-final` | `?view=focus&focus=D-court3-pavilion`（荷池/池心亭/汀步/石栏） | 863.6KB | 0.3556 / 4.12% | PASS |
| `t10-fp-D` | `?view=fp&zone=D`（`VP-D-fp-spawn`） | 113.2KB | 0.4890 / 1.03% | PASS |

浏览器实测（SwiftShader 软光栅，帧率不具代表性）：`整帧调用 508 · 可见三角面 561,586 · 可绘制对象 286`。

---

## 5. 向 kit / t2 的发现与需求（本卡只上报，不改他人文件）

| # | 发现 | 影响 | 建议 |
| --- | --- | --- | --- |
| 1 | `kit.corridor` 的 `floor`（青砖）与 `kit.paving` 是两条互不相干的桶；廊庑地面无法与院面共用材质 | 每区多 1 个批次 | 可选优化，非缺陷 |
| 2 | `censer` 的双手柄（`bronzeHandle`）没有 `detail` 门槛，而 `vessel`/`drum` 的小件都有 | 用 censer 必多占 1 个绘制批次（本区因此统一用 `vessel`） | t3 给 censer 的手柄加 `detail !== 'far'` 门槛即可与其它铜器一致 |
| 3 | `layout.ROADS['RD-D-garden-spur']`（z=290）与 `CY-D-court4` 北墙（z=290）共线 | 铺装与墙体重叠 1.2m（墙脚压在甬道上）；玩家需绕北带 `z∈[291,300]` 才能到花园西入口 | 属布局层，交 t1/t8 决定是否错开 2m；本区按登记如实铺装并在回执标注 |
| 4 | `layout.OBSTACLES` 的水体条目的 `y1`（0.05）低于区域地坪（0.4） | 仅靠 layout 数据无法拦住"从水面走进去" | 本区按 §6.3 自补 5 段地面高度拦阻盒（E 亦有同类补丁）；建议 t1 在 layout 里给水体障碍补 `guardY` 字段 |

---

## 6. 未验证项（不得当作已验证）

1. **真实 GPU 帧率 / 整帧成本 / 首屏传输**：本机 headless 走 SwiftShader，帧率不具代表性（归 t13）。
2. **第一人称连续走查**：只做了出生点单帧与"数据级"走查探针（池面/汀步/院墙/门洞/岛台）；
   连续 WASD 走遍四院 + 过汀步上岛的录像未做（归 t9/t13）。
3. **三时辰逐张复核**：本卡只出 goldenHour 三张；sunset/moonlitNight 未逐张看（水面对光的变化未评）。
4. **水面与池岸的接缝观感**：只在 focus 机位目视确认，未做近景特写比对（池底颜色/水深对比未调）。
5. **摆件 far 档的观感**：宫灯在 far 档只有石座/灯柱/灯身（无鎏金顶与横枋），近景 2m 内会显得简；
   已按预算取舍并记录，若配额放宽可一行改回 `mid`。
6. **`work/probe-d*.mjs`、`work/shots/t10-*.png`**：中间产物，不进入发布包（CONTRACTS §2）。
