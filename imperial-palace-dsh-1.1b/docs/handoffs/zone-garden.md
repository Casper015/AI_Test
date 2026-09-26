# t8 zone-garden（F 区：御花园、宫墙、角楼、外城门、护城河与桥）交接回执

> 状态：**开工回执**（交付回执见本文件 §8 及以后，完成后追加）
> 版本对应：`CONTRACTS v1.0.1` ⇄ `CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ `KIT_VERSION 1.0.0`

## 1. 已读版本（开工前）

| 文件 | 版本/要点 |
| --- | --- |
| `imperial-palace-plan.md` | §2.2 布局示意、§2.3 坐标/边界/连接规则、§3.1 风格基线、§5.5 御花园与边界水系、§6.1 模块契约、§6.4 八视角与第一人称、§7.1 分工、§8.2 预算 |
| `docs/CONTRACTS.md` | `CONTRACTS v1.0.1`：§3 `createZone(ctx)`/§3.3 返回字段/§3.4 kit 名称、§4 建筑字段与 §4.2 等级-屋顶白名单、§5 视角格式、§6 碰撞格式、§8.3 灯位 |
| `docs/STYLE_GUIDE.md` | `STYLE_BASELINE v1.0.0` |
| `src/shared/config.js` | `CONFIG_VERSION 1.0.1`（`TERRAIN` 全城竖向基准、`MODULES` 模数、`BUDGET.drawCalls.perZone.F = 80`） |
| `src/shared/layout.js` | `LAYOUT_VERSION 1.0.0`（F 槽位 14、F tiles 8、`CITY_WALL`/`MOAT`/`BRIDGES`/`WALLS` 城墙 4 段、F owner 的 `CONNECTORS` 15、`ROADS`(F) 全部、F `WALKABLE` 15、F `OBSTACLES` 26、F `VIEWPOINTS` 4、F `LIGHT_ANCHORS` 7、`VEGETATION` F 104 株、`SCENIC_OBJECTS` F 3） |
| `src/core/context.js` | `validateZoneResult` 逐字段回显校验（含 roofType 白名单、fp-spawn 视线高） |
| `src/core/layout-slice.js` | `zoneLayoutFor('F')` 切片字段 |
| `tests/harness.mjs` | Node three 钩子、`makeTestCtx`、`createTestRunner` |
| `src/kit/index.js` + `src/kit/{buildings,props,merge,geometry,materials,tokens}.js` | 构件工厂返回 `THREE.LOD`/Group；`kit.mergeZone(root)` 跨建筑合批；`userData.kit.worldBounds` 为实测包围盒 |

## 2. 可写范围（严格遵守任务卡 inScope）

- `src/zones/garden-boundary.js`（唯一实现文件）
- `tests/zone-garden.test.mjs`（自测）
- `docs/handoffs/zone-garden.md`（本回执）

不改动 `src/shared/**`、`src/core/**`、`src/kit/**`、`B/C/D/E` 区域文件、`index.html`、同级其他项目目录。

## 3. 依赖与结论（开工判定）

- 依赖 t1（layout/config/CONTRACTS 冻结）✅、t2（core ctx/registry/harness/audit）✅、t3（kit 构件）✅，均已交付且版本与本文档表一致。
- 已知上游事实（照此施工）：
  1. `createKit({THREE, config, quality})`；建筑参数可展开 layout 槽位；`baseY` 语义 = 台基顶（台基占 `[baseY-terraceH, baseY]`）。
  2. 组装完成后必须调用一次 `kit.mergeZone(root)`；F 区预算 ≤80 绘制调用。
  3. 取景/信息/验收用 `userData.kit.worldBounds`，不得用 `layout.totalHeight`（估值）。

## 4. 冲突与风险（已识别，自行处理并回报）

1. **F 地坪标高 ≠ 0**：layout 的非墙上槽位 `baseY = terraceH`（隐含"地面 = 0"），而 F 的花园地坪是 `TERRAIN.gardenPathsY = 0.5`。因此 F 的 6 座花园建筑**几何落位** = `slot.baseY + 本地地坪`（否则台基半埋、台阶入地）。返回的 `buildings[]` 仍逐字段回显 layout（契约 §4），只额外附 `worldBounds`（实测）。`onWall` 的角楼/城门保持 layout 的 `baseY = wallHeight + terraceH`（落于墙顶，天然一致）。
2. **地坪标高以 `WALKABLE` 为准**：F 的"墙外岸台"（`WK-F-berm-*`, y=0）比 F tiles 的粗粒度 `outerTerrainY=-0.4` 覆盖范围更靠外（tiles 里 `T-F-wall-*` 只有 18m 宽）。墙体/护城河之间那条 24m 宽岸台按 `WALKABLE` 的 0 建，避免与已冻结的桥引坡（`RD-F-*-bridge-ramp-inner` 收在 0.4）冲突。
3. **两条登记的"水池畔步道"实际穿过水池**（`RD-F-garden-west-pond-walk` / `-east-pond-walk` 中心线 x=±200 正落在 `WB-F-pond-west/east`（x -250..-150 / 150..250, z 318..392）内）。道路坐标冻结不可改，故按**临水栈道**处理：道面抬到水面之上（底 = 水面 + 0.02），并加落地到池底的支墩（落地判据见 §9 自测），不做穿水。
4. **桥拱脚入水**：`kit.bridge` 内部拱券最低点低于护城河常水位（详见交付回执的实测数字）。处理：桥面/桥墩之外自行加"落底桥墩"（护城河河底 → 桥面下沿），拱脚多数被桥墩体量包住；该条作为**明确上报的已知条件**（不是"未发现"），并在自测里以数值给出"水下构件必须落地"的判据。
5. **城台（墙加厚）与城墙体量有意重叠**：城门处 76×26 / 角楼处 28×28 的城台是"墙的加厚段"，与墙段体量重叠属设计意图（"无重墙"判据按"平行墙段零重叠、垂直墙段仅角部 4×8m 交接"单独断言）。

## 5. 计划（施工顺序）

1. 地形与竖向：外侧地形 4 块（-0.4）、岸台环 4 块（0）、城门内带 2 块（0）、花园地坪（0.5，扣除水池）、池底、护城河河槽（4 段水体，-6→-3）、岸沿石。
2. 宫墙 4 段（`kit.wall` + layout 自动门洞）+ 城台 8 处（4 门 + 4 角）。
3. 四角角楼 + 四面外城门（`kit.cornerTower` / `kit.gateHall`，按 layout 落墙顶）。
4. 御花园：中央亭阁/北殿/东西亭/东西配殿、东西廊、假山 2、照壁 1、水池 2、曲折步道、树群（实例化）。
5. 道路 29 段（含桥引坡楔形、临水栈道）、四桥（`kit.bridge` + 落底桥墩）。
6. `kit.mergeZone(root)` → 水面 `userData.waterSurface` + `ctx.shared.water` → 统计。
7. 契约回显：buildings 14 / connectors 15 / colliders / viewpoints 4 / lightAnchors 7。
8. 自测 `tests/zone-garden.test.mjs`（墙闭合、角楼/城门数、河道闭合、连接对齐、机位、碰撞、预算）；`node tests/run.mjs`；`node scripts/audit.mjs`。

## 6. 交付回执

> 状态：**交付完成**（attempt 1 · `a4733851-b5a2-4a34-8762-3b3813c5a8e9`）
> 版本对应：`CONTRACTS v1.0.1` ⇄ `CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ `KIT_VERSION 1.0.0`

### 6.1 文件清单（严格 inScope，未动他人文件）

| 路径 | 行数 | 说明 |
| --- | --- | --- |
| `src/zones/garden-boundary.js` | 1136 | F 区唯一实现：地形/宫墙/城台/角楼/城门/护城河/桥/御花园 |
| `tests/zone-garden.test.mjs` | 927 | F 区专项自测 31 项（墙闭合、河道闭合、不穿插、落地、预算、机位、碰撞） |
| `docs/handoffs/zone-garden.md` | 本文件 | 开工 + 交付回执 |

未修改：`src/shared/**`、`src/core/**`、`src/kit/**`、`src/zones/{forecourt,inner-palace,west-courts,east-courts,_greybox,_template}.js`、`index.html`、`scripts/**`、`tests/run.mjs` 与同级其他项目目录。

### 6.2 接口（CONTRACTS §3.3 全字段 + 两个附加只读字段）

```js
createZone(ctx) -> {
  root,          // THREE.Group，单位变换，世界坐标已烘焙；含 1 个合批 Group + 11 个 InstancedMesh
  buildings,     // 14 栋，逐字段回显 layout.SLOTS（F 全部槽位），另附 group/mesh/worldBounds/groundY/geometryBaseY
  connectors,    // 15 条 F-owned 通道（4 门洞 / 4 桥 / 7 段 passage），position/width/elevation 回显 layout
  colliders,     // obstacles 26 / walkable 15 / ramps 14（全部来自 layout 的 F 切片）
  viewpoints,    // 4 个（VP-F-zone / VP-F-fp-spawn / VP-F-south-gate / VP-F-north-gate）
  lightAnchors,  // 7 个（layout.LIGHT_ANCHORS 的 F 条目）
  update(dt)     // 只累计自有计时；树/水/灯动画统一归 src/core/environment.js
  dispose()      // 只释放本区几何（kitOwned/zoneOwned），**不销毁 kit 共享材质**
  stats,         // 非契约：数量/绘制调用/合批前后/三角面/diagnostics
  audit,         // 非契约：施工记录（land/water/walls/platforms/roads/path/bridges/props/buildings/trees）
}
```

- `ZONE_ID = 'F'`，`ZONE_NAME = '御花园、宫墙与边界'`，`ZONE_VERSION = '1.0.0'`，`default = createZone`。
- kit 解析顺序：`ctx.kit`（真 kit 直接用）→ `ctx.kit.__fallback`（灰盒替身）时动态 `import('../kit/index.js')` 升级为 t3 真 kit → 都不可用时用与 kit 同材质的本地盒体兜底并记 `diagnostics`。本区**不自行挂 scene**、不建灯光、不建动画循环。

### 6.3 实现要点（与 plan §5.5 逐条对应）

| §5.5 要求 | 落地 |
| --- | --- |
| 中央亭阁 / 曲折步道 / 树群 / 假山 / 小型水景 / 廊道 | 6 栋花园建筑（含 `F-garden-pavilion-main` 攒尖顶，实测高 17.33m）、13 控制点 Catmull-Rom 曲折步道 72 段（累计转角 609.7°）、树 104 株（实例化）、假山 2 座、水池 2 个、廊道 2 道（`CR-F-garden-west/east`） |
| 与后宫相连、连接 ID 与 layout 一致 | `CXN-C-F-garden-west/east` 标高 0.5 = 花园地坪；C 侧坡道 0.9→0.5、F 侧步道 0.5→0.5 两端吻合 |
| 红墙完整闭合、四角角楼清楚、南北主门/东西侧门有层级 | 4 段宫墙（每段 1 个 26m 门洞）沿环中心线 **0.5m 采样 6100 点 100% 覆盖**；角楼 4 座（26m 见方，坐在 28m 见方城台上，底面 = 12m 墙顶，偏差 ≤0.0004m）；南/北门 grade3 重檐庑殿（实测高 15.65m、面阔 76m）＞东/西门 grade2 歇山（高 13.91m、面阔 64m） |
| 护城河与桥梁构成完整外边界 | 4 段护城河（34m 宽，常水位 −3m、河底 −6m）拼成闭合环，相邻段共边 ≥34m、环中心线采样 100% 落水；4 座入城桥（南/北 16m 桥面、东/西 12m），桥墩落河底、桥台落岸；南桥—南城门—门内带—B 入口标高链 0.8→0.4→0.0 与登记值一致 |
| 水体/陆地/墙基/道路不穿插 | 陆地 376 块与水体体积重叠 **0**；墙段与水体重叠 **0**；道路与水体重叠 **0**；道路沉入陆地 **0**；临水构件 46 处全部落地（桥墩→河底、栈道支墩→池底、水中灯座→池底） |
| 河道不无故终止 | 相邻水体共边 ≥34m + 环中心线 0.5m 采样 100% 落入水体（无终止点） |
| 全城鸟瞰无悬空/无底板截断/无穿模 | 整区 Box3 = x[−420,420] z[−560,560] y[−7.40,27.65]（= `TERRAIN_EXTENT`，无截断无越界）；14 栋建筑 \|底面−地坪\| 最大 0.0004m；合批后墙体网格 Box3 覆盖 ±304/±454 环且落于 y=0 |
| 树上/水面控制开销 | 树 104 株 → 2 个树干 + 3 个树冠实例批次（花树共享树干几何、只换材质）；宫灯 7 处 → 6 个实例批次；F 区绘制调用 **66 / 80** |

### 6.4 实测命令与真实输出（逐字粘贴，2026-09-26）

```console
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3" && node tests/zone-garden.test.mjs
---------------------------------------------------------
 zone-garden.test.mjs · F 区御花园/宫墙/角楼/城门/护城河/桥
 node v26.10.0 · root /Users/casper/.../imperial-palace copy 3
---------------------------------------------------------
  ✓ 导出符号：createZone + 字符串 ZONE_ID + default
  ✓ 返回值通过全部契约校验（逐字段回显 layout，0 问题）
  ✓ layout 归属 F 的槽位逐一实现（14 / ≥10）且带实测包围盒
  ✓ 4 段宫墙与 layout.WALLS(cityWall) 完全一致，且每段仅 1 个门洞
  ✓ 墙段首尾相接：沿环中心线 0.5m 采样 100% 被墙段/城台覆盖（无断口）
  ✓ 角部相接 + 无重墙：垂直墙段仅角部小重叠、平行墙段零重叠
  ✓ 墙基落地：墙下地坪标高（按 20m 采样、跳过城台）与墙底一致（无悬空/无沉降）
  ✓ 四角角楼：数量 4、位于环角、城台完全承托、无悬空
  ✓ 四面外城门：南/北主门（grade3 重檐庑殿）高于东/西侧门（grade2 歇山）
  ✓ 城门洞贯通：城台留出与门洞等宽的通道 + 门额，通道内无实体阻挡
  ✓ 水体登记：4 段护城河 + 2 个水池，矩形与常水位与 layout 逐一相等
  ✓ 河道闭合、不终止：相邻水体共边 ≥30m + 环中心线 0.5m 采样 100% 落在水体上
  ✓ 水体 / 陆地 / 墙基 / 道路三维互不穿插（体积重叠 0）
  ✓ 临水构件必须落地或完全在水面之上（不允许悬在水里）
  ✓ 入城桥 4 座：桥面标高 = 登记 deckY，桥墩落到河底，南桥连通南城门与外侧落脚点
  ✓ 连接对齐：15 条 F-owned 通道回显一致，且两端标高与实建路面/可行走面对齐
  ✓ 御花园含中央亭阁 / 北殿 / 东西亭 / 东西配殿（6 栋，形制与登记一致）
  ✓ 花园地面：地坪顶 = gardenPathsY、水池处被挖开（陆地不覆盖水面）
  ✓ 廊道 2 道 / 假山 2 座 / 照壁 1 座，与 layout 一致并落在花园地坪上
  ✓ 曲折步道：≥8 段、累计转角 ≥180°、全部落在花园内且不穿建筑/水池/照壁
  ✓ 与后宫相连：CXN-C-F-garden-west/east 标高 = 花园地坪，C 侧坡道收在 0.5
  ✓ 树群 104 株（64 花园 + 40 岸台）全部实例化，且不穿水池/建筑、间距 ≥5m
  ✓ 宫灯 7 处（layout F 条目）全部实例化，落在本地地坪上
  ✓ F 区绘制调用 ≤ 80（合批 + 实例化后），且合批确实生效
  ✓ 机位 4 个 = layout 登记：≥1 zone（花园取景）+ ≥1 fp-spawn + 2 focus-extra（城门取景）
  ✓ 碰撞：26 个 F 障碍（含 4 墙 / 4 河 / 2 池 / 2 假山 / 14 建筑），不可进入建筑为整体阻挡
  ✓ 整区实测 Box3 覆盖完整地形范围但不越界（无底板截断）
  ✓ 每栋建筑底面 = 本地地坪（无悬空、无沉降），门楼/角楼落于 12m 墙顶
  ✓ 合批后的实际几何自证：墙体网格覆盖宫墙环、水面网格 = 登记水体范围
  ✓ update 连续 60 帧不抛错、不改 state、不挂载 root
  ✓ dispose 只释放自有几何（不销毁 kit 共享材质），且幂等

[9. 汇总]
  · F 区：建筑 14（角楼 4 / 城门 4 / 花园 6）· 宫墙 4 段(4 门洞) · 城台 8 · 水体 6 · 地形块 376 · 桥 4 · 道路 296 块/37 段 · 树 104 · 灯 7 · 绘制调用 66/80 · 三角面 56416
  · kit 来源：ctx.kit
  · · 水体 6 段（护城河 4 + 水池 2）；河底 -6，常水位 -3
  · · 护城河岸沿石 16 段（桥位断开）
  · · 城台 8 处（4 门 + 4 角），每处是墙的加厚体量（与墙段体量有意重叠）
  · · 道路铺装 296 块（跨水栈道 32 块 + 桥面 4 块）；落底支墩 34 个
---------------------------------------------------------
 通过 31 / 31
$ echo $?
0
```

```console
$ node tests/run.mjs
 汇总
---------------------------------------------------------
 PASS  tests/core.test.mjs  412ms
 PASS  tests/kit.test.mjs  3007ms
 PASS  tests/layout.test.mjs  216ms
 PASS  tests/zone-forecourt.test.mjs  3739ms
 PASS  tests/zone-garden.test.mjs  1256ms
 PASS  tests/zone-inner.test.mjs  1060ms
 PASS  tests/zones.test.mjs  5164ms
---------------------------------------------------------
 通过 7 / 7，失败 0，总耗时 14856ms
$ echo $?
0
```

```console
$ node scripts/audit.mjs
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 --------------------------------------------------------------------------
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     64       0   80936      19       6      64       0
 C                     48       0   48260      19       6      48       0
 F                     66      11   56416      20       5      66      11
 --------------------------------------------------------------------------
 小计(区域)              217      47  191956      67      17
 环境系统                   7       0    1685       7       0
 主场景合计                224      47  193641
...
 最高可见批次：oblique = 217（预算 350） ✓
 F 合批：821 个体块几何 → 66 个绘制批次（区域×材质角色合并）
---------------------------------------------------------
 §8.2 预算对照（主场景单次调用）
---------------------------------------------------------
 主场景绘制调用   : 223 / 上限 350  ✓
 分区 B         : 64 / 预算 70  ✓
 分区 C         : 48 / 预算 50  ✓
 分区 D         : —（模块未交付，预算 40 留给真实区域）
 分区 E         : —（模块未交付，预算 40 留给真实区域）
 分区 F         : 66 / 预算 80  ✓
 可见三角面       : 193641 / 上限 1500000  ✓
 阴影 pass        : 47 个投影对象；实时投影光源 1 盏（宫灯不投影）
 结论：全部预算与契约检查通过
$ echo $?
0
```

> 过程记录：`node tests/run.mjs` 在本次施工窗口内先后出现两次"非 F 原因"的红灯，均非本任务文件：
> - 首次 6/7：`tests/zone-forecourt.test.mjs`（B 区）4 条断言失败 → B 区修复后复测 7/7 全绿（上表即该次全绿输出）。
> - 末次复测 6/7：`tests/core.test.mjs` 的静态扫描"全仓只有 src/main.js 运行 requestAnimationFrame"失败，实际命中 `src/interaction/index.js`、`src/interaction/tour.js`（**t9 ui-engineer 正在 07:13–07:20 写入的 in-flight 文件**，非本任务 inScope，F 无法也不应修改）。
>   ```
>   ✗ 全仓只有 src/main.js 创建 Scene、挂载 scene、运行 requestAnimationFrame
>     实际：src/interaction/index.js,src/interaction/tour.js,src/main.js
>   通过 39 / 40
>   ```
>   F 区自身无 `requestAnimationFrame/setInterval/renderer.render/scene.add`（已用源码扫描复核）。该项需 t9 自修或主理人裁定（t9 的 index.js/tour.js 若确需自建步进，应改为由 main.js 单一循环驱动）。
>
> 因此：**F 区所属的 3 条验收与全部 F 事实测均通过**；`tests/run.mjs` 是否绿灯取决于同期其他成员文件的稳定性，与本区交付物无关。

### 6.5 浏览器内视觉实测（补充证据，非验收命令）

用 t2 的 `scripts/shot.mjs`（headless Chrome + SwiftShader）渲染 1440×900 图，输出到 `/tmp/t8-shots/`（**故意写在 ROOT 之外**，避免触碰他人 inScope 的 `work/`、`docs/shots/`）：

| 图 | 视角 | 观察结论 |
| --- | --- | --- |
| `t2-oblique-golden.png` | 全城鸟瞰 | 宫墙环 + 四角楼 + 南北门 + 护城河环 + 4 桥 + 御花园均在位；宫城四周无悬空、外侧地形板完整无截断（判据 PASS，均值 0.713、暗区 0%） |
| `t8-F-zone.png` | 分区 F（`?view=zone&zone=F`） | 花园绿茵地坪 + 灰铺装花径 + 曲折步道成环、中央亭阁/北殿/东西亭殿、树群（含粉花树）、东西廊、照壁、宫墙与北门城楼 |
| `t8-F-gate-south.png` | 南城门近景 | 城台（石作）+ 重檐城楼 + 26m 门洞贯通 + 城墙垛口 + 南桥（栏杆/桥台）跨护城河，桥下桥墩入水、岸边石与岸台树在位 |
| `t8-F-pavilion.png` | 中央亭阁近景 | 攒尖顶 + 宝顶 + 石台基栏杆与红柱；花园地坪与曲折步道、照壁、宫墙衔接正确；树有树干落于地坪（无悬空） |
| `t8-F-pond.png` | 西亭近景 | 西水池（水面）、跨水池的临水栈道（道面在水面之上、支墩入水）、西廊、西假山一侧；树群避让水池 |

浏览器内 `?stats=1` 实测（同 t2 口径，SwiftShader 帧率不具代表性）：F 分区视角整帧调用 163、可见三角面 116486、实时宫灯 0/0（锚点 53）。

### 6.6 已知条件 / 有意设计（不是"未发现"）

1. **桥拱脚入水（`kit.bridge` 内部几何）**：4 座桥的拱券最低点 y 分别为 −3.5（南/北）、−3.7（东/西），低于护城河常水位 −3.0；本区另加落底桥墩（−6 → 桥面下沿 0.3）承托桥面，拱脚位于桥墩体量内部，且实体水盒会遮住水面以下部分。判据"临水构件必须落地"对本区自建结构 46 处全部通过。
2. **城台与墙段体量有意重叠**：城门城台（76×26 / 26×64）与角楼城台（28×28）是"墙的加厚段"，与墙段体量重叠属设计意图；"无重墙"判据按**平行墙段零重叠、垂直墙段仅角部 ≤8×8m 交接**独立断言（已通过）。城门城台在门洞净宽处留空并补门额（9.3m 净高）。
3. **两条登记道路穿过水池**：`RD-F-garden-west/east-pond-walk` 中心线（x=∓200）落在 `WB-F-pond-west/east` 内。道路坐标冻结不可改，故按**临水栈道**处理：道面抬到水面 +0.02m 之上，每 4m 一个落到池底（−0.4→−0.38）的支墩；判据"道路不沉入陆地/不与水体体积重叠"通过。
4. **两处宫灯登记在水池上**（`LA-039 (-200,356)`、`LA-040 (200,356)`）：用落到池底的 1m 见方石座承托，灯体立在水面之上 0.15m（避免灯座没入水体）。
5. **地形高差采用 `WALKABLE` 而非 tile 粗粒度值**：护城河内侧岸台环（x∈[−332,−308] 等）`layout.tileAt` 落到 `outerTerrainY=-0.4`，而登记可行走面 `WK-F-berm-*` 为 `cityGroundY=0`。本区按**可行走面**建（0m），因此与桥引坡（收在 0.4m）/城门地面（0.4m）连续；已通过"道路两端与 floorYAt 高差 ≤ 可跨台阶阈值 0.5m"断言。
6. **合批后阴影标记为 false（跨区发现，非本任务文件）**：`kit.mergeZone()` 新建的合批网格没有继承 `castShadow/receiveShadow`，实测 F 区 55 个合批网格 `castShadow=false`（audit"阴影批次"列：B 0 / C 0 / F 11 —— 仅 F 的 11 个 InstancedMesh 亮着）。属 `src/kit/merge.js` 的全局行为，建议 t3 在 `mergeZone` 补两行或由主理人裁定统一开启；本任务未在 F 内单方面打开（会造成"只有花园投影"的不一致）。
7. **水池水面偏暗（观察）**：golden 预设下 2 个水池水面比护城河更暗（水系材质 `roughness 0.08 + envMapIntensity 0.9` 且无环境贴图时以掠射反射为主，`t8-F-pond.png` 可见）。属 t3 材质 / t2 环境域，本区未改共享材质参数。

### 6.7 未验证项（不得当作已验证）

1. 真实 GPU 下的帧率/显存（本机 headless 走 SwiftShader，帧率不具代表性；t13 负责）。
2. 第一人称"是否真的走得通"：本区只保证**几何连续性与标高链**（floorYAt / 可行走面 / 无实体阻挡），实际行走由 t9 的碰撞实现 + t12 的走查验收。
3. 八视角中 F 区的全部取景质量（本轮只渲染 oblique / zone=F / focus×3 / fp 共 6 张）。
4. `sunset` / `moonlitNight` 下 F 区的观感与灯位效果（仅 golden 实测；夜景亮度属 t19 / CONFIG 1.0.2 议题）。
5. 纹理尺寸/首屏传输与 dist 发布包（F 未新增任何贴图，纹理沿用 t3 材质库；发布包由 t14 核验）。
6. 关于 `baseY` 偏移的说明：本区对非 onWall 槽位传 `baseY + 本地地坪`（花园 0.5m），这是**区域落位**而非改共享数值；返回的 `buildings[]` 仍逐字段回显 layout（契约 §4）。`tests/kit.test.mjs` 的 |eaveHeightAbsolute − layout.eaveHeight| ≤ 6mm 交叉校验作用于"kit 直传 layout 参数"的场景，与本区几何落位互不影响（两者均通过）。

### 6.8 交付判定

- 任务卡 8 条验收项：**全部满足**（数值证据见 §6.3/§6.4）。
- 3 条 verify 命令：`tests/zone-garden.test.mjs` exit 0（31/31）、`tests/run.mjs` exit 0（7/7）、`scripts/audit.mjs` exit 0（F 66/80，"全部预算与契约检查通过"）。
- 未验证项与已知条件已在 §6.6/§6.7 明确列出，供 V1（t12）独立复验时优先核对。

### 6.9 复验（attempt 2 · `07eb986c-bcf5-4c81-9857-fa307a3ba468`）

本 attempt 为**纯复验**：`src/zones/garden-boundary.js` 与 `tests/zone-garden.test.mjs` **零改动**，只复跑三条 verify 命令并记录同期上游变化。三条命令本次全部绿灯：

```console
$ node tests/zone-garden.test.mjs        # 通过 31 / 31        exit 0
$ node tests/run.mjs                     # 通过 11 / 11，失败 0  exit 0   （28.2s）
 PASS  tests/core-walls.test.mjs / core.test.mjs / interaction.test.mjs / kit.test.mjs /
       layout.test.mjs / zone-east.test.mjs / zone-forecourt.test.mjs / zone-garden.test.mjs /
       zone-inner.test.mjs / zone-west.test.mjs / zones.test.mjs
$ node scripts/audit.mjs                 # exit 0
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 B                     58      58   80564      19       6      58       6
 C                     49      49   52040      19       6      49       0
 D                     39      38   45524      18       5      39       6
 E                     40      39   43228      19       5      40       3
 F                     61      60   59020      20       5      61      11
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 F         : 61 / 预算 80  ✓
 可见三角面       : 288609 / 上限 1500000  ✓
 F 合批：789 个体块几何 → 61 个绘制批次（区域×材质角色合并）
 结论：全部预算与契约检查通过
```

- **F 数字变化（非本区改动所致）**：批次 66 → **61**、三角面 56416 → 59020、阴影批次 **11 → 60** —— 上游 t3 已修 `kit.mergeZone()` 不继承 `castShadow/receiveShadow` 的问题，§6.6 第 6 条跨区发现**已解决**（现五区阴影批次与批次基本 1:1）。F 预算余量由 14 增至 **19**。
- 本 attempt 期间区块全部交付（audit 显示「真实区域 B/C/D/E/F」），F 的 15 条连接对端（B/C/D/E）已就位，连接对齐断言仍在 F 侧独立通过（31/31）。
- 其余事实测数值（墙环 6100 点 100% 覆盖、河道闭合采样 100%、体积重叠 0、14 栋 |底面−地坪| ≤0.0004m、树 104 株 5 批次、灯 7 处 6 批次）与 §6.4 一致，未受上游变化影响。
- 未验证项与已知条件（§6.6 第 1–5 条桥拱脚/城台重叠/临水栈道/水中灯座/岸台标高口径、§6.7 全部）**仍然有效**，不因本次复验而改变。
- 复验窗口内 `tests/run.mjs` 曾两次因**同期其他成员正在写入的文件**短暂红灯：第一次命中 t9 的 `src/interaction/index.js`+`tour.js`（core.test.mjs 单一动画循环扫描），第二次命中 07:44 刚落地的 `tests/zone-west.test.mjs`（D 区 2 条断言）。两者均由对应负责人在数分钟内自行修复；F 区代码在这两次红灯期间**零改动**，最终稳定状态即上表 **11/11 全绿**（2026-09-26 07:49）。


---

# t64（T6.1）F 区 7 栋内景布陈设 —— 交付回执

> ROOT：`imperial-palace-dsh-1.1b`（LAYOUT **1.1.4**、CONFIG **1.0.6**）
> 版本对应：`CONTRACTS`（现 §12 可读性判据 v1.0.10）⇄ `CONFIG 1.0.6` ⇄ `LAYOUT 1.1.4` ⇄ `KIT_VERSION 1.0.0` + t61 `kit.interiorSet`
> attempt 1 · `e4ae0f6a-e03c-47f1-b88d-52d6dd7e1455`

## §1 本卡集合（以 layout 实测清单为准，未按旧卡文字扩展）

`LAYOUT.interiorsByZone('F')` 实测 **7 栋**，本卡逐一布陈设：

| slotId | 档位 | grade | 内景地面 y | 天花 y | 陈设项（套件实测 items） | 三角面 |
| --- | --- | --- | --- | --- | --- | --- |
| `F-gate-south` | gateHall | 3 | **0.4** | 3.6 | floor,table,bench,drum,doorBolt,lantern×2 | 288 |
| `F-gate-north` | gateHall | 3 | **0.4** | 3.6 | 同上 | 288 |
| `F-gate-west` | gateHall | 2 | **0.4** | 3.6 | 同上 | 288 |
| `F-gate-east` | gateHall | 2 | **0.4** | 3.6 | 同上 | 288 |
| `F-garden-hall-north` | hall | 2 | 0.8 | 4.8 | floor,runner,dais,throne,screen,column,ceiling,table,censer,lantern×2 | 856 |
| `F-garden-hall-west` | sideHall | 1 | 0.5 | 3.49 | floor,couch,table,cabinet,screen,lantern×2 | 360 |
| `F-garden-hall-east` | sideHall | 1 | 0.5 | 3.49 | 同上 | 360 |

- **角楼 4 座已按 Q3 排除**（`doorWidth=0`、`entrance` 与塔体中心重合、无门洞）；**3 座开敞亭**（中央亭阁 + 东西亭）本就不在集合内 → 全部**未**自行扩展。
- 地面一律取 `WK-<slotId>-interior.y`（layout 登记的**内景可行走面**）：城门 = t72 登记的**门洞通道面 0.4**（不是墙顶门房 12.4）；北殿 = 台基顶 0.8；配殿 = 0.5。
- 天花取 kit 实测举架：非墙上建筑 `组原点(baseY−terraceH) + metrics.eaveHeight − 0.6`，并与建筑实测包围盒取小（`maxY ≤ worldBounds.maxY − 0.8`）→ 实测无一穿顶（见 §3）。

## §2 城门按通道语义布陈设（本轮唯一有几何改动的部分）

要求「内景地面 = 门洞通道标高、陈设不得占用通行横断面（净宽 ≥ layout 门洞净宽 26m）」在 26m 宽的门洞里无法同时成立（套件会在洞中央放更鼓、并在 1.5m 高处横一道门闩）⇒ 做法：**把城台做成带"值房壁龛"的加厚体量**：

- 城台墩体由 2 块实心改为 **6 块**（龛前/龛后/龛外/龛上 + 对侧墩 + 龛地坪 0→0.4），在**洞壁之外**开一处 `8m 深 × 10m 长 × 3.2m 高`、龛口朝洞内的值房（龛地坪顶 = 通道面 0.4）；
- 陈设（`kind:'gateHall'`：值守案 / 长凳 / 更鼓 / 门闩 / 灯 ×2）全部落在壁龛 `inner` 内 → **洞内 26m 通行横断面零占用**；
- 几何断言（`tests/zone-garden.test.mjs` §9）：沿洞轴以 0.5m 步长扫过 `|v| ≤ 13` 全带，**被非门额实体挡住的采样点 = 0**；陈设 rect 距洞轴线 ≥ 13m；龛上补砌把 gate 城台 footprint 盖满（上部结构与角楼/门楼承托不受影响，原「城台承托 footprint」断言改为「各角/边中点/中心均被城台覆盖」仍全绿）。
- 壁龛**不在通行集合内**：`OB-F-gate-*` 的门洞通道仅 26m 宽（`blocks:'exceptDoor'`），故墩体处 `probe().ok === false`（真实碰撞数据，见 §5）——壁龛是"看得见的值房"，不是可走进的房间；门洞通道本身可从门外走入 ✓。

## §3 预算（内景全布后实测，对照 §8.2）

| 项目 | 实测 | 预算 | 判定 |
| --- | --- | --- | --- |
| **分区 F 绘制调用**（audit 合批后） | **72** | 80 | ✓（内景增量 +11 桶：floor/runner/dais/daisCap/throne/furniture/screenPanel/trim/ceiling/lanternGlow…） |
| F 三角面 | 65224（其中内景 **2728**） | — | ✓ |
| 主场景绘制调用（全城） | 333 | 350 | ✓ |
| 可见三角面 | 308861 | 1500000 | ✓ |

**LOD 档位决策（预算证据）**：`kit.interiorSet` 默认 `lod:'auto'`（近/中两档有几何、远档空组）。若用 `auto`，`audit` 的**全量口径**会把近/中两档各计一批（+24 调用）→ F 会到 **85 > 80 ✗**；故本区取 **`lod:'near'` 单档**（+11 调用）→ **72 ≤ 80 ✓**，真实渲染成本与 `auto` 的近档相同。t61 的"远档为空"语义在 F 不适用（区预算本身足够），已在此登记。

## §4 内景可读性实测（§12 双约束：内容暗区 ≤30%、高光截断 ≤5%；`interior` 类）

**测量口径与工具**：`scripts/shot.mjs` 的 `decodePngStats(..., {view:'interior'}) + judgeShot({view:'interior', stats})`（同源口径，原样判定行）。相机寻址走 app 自身入口 `__PALACE__.events.request('view:request-mode', {mode:'interior', interiorViewpointId})`（= UI/键盘同源），1440×900 / DPR1 / quality medium。脚本位于 `/tmp/t64-measure.mjs`（**故意写在 ROOT 之外**，遵守 inScope），过程图 21 张在 `/tmp/t64-interiors/`。

**21/21 PASS（7 栋 × 3 时辰），原始判定行**：

```
PASS goldenHour   interior [near] F-garden-hall-east     内容均值 0.4730 内容暗区 6.02% 内容截断 0.00% · 机位(235.0,2.15,399.8) 实时灯 3/3
PASS goldenHour   interior [near] F-garden-hall-north    内容均值 0.4569 内容暗区 0.29% 内容截断 0.00% · 机位(0.0,2.45,399.8) 实时灯 3/3
PASS goldenHour   interior [near] F-garden-hall-west     内容均值 0.4198 内容暗区 27.08% 内容截断 0.00% · 机位(-235.0,2.15,399.8) 实时灯 3/3
PASS goldenHour   interior [near] F-gate-east            内容均值 0.6357 内容暗区 0.00% 内容截断 0.00% · 机位(309.0,2.05,0.0) 实时灯 3/3
PASS goldenHour   interior [near] F-gate-north           内容均值 0.6929 内容暗区 0.11% 内容截断 0.02% · 机位(0.0,2.05,459.0) 实时灯 3/3
PASS goldenHour   interior [near] F-gate-south           内容均值 0.6963 内容暗区 0.00% 内容截断 0.06% · 机位(0.0,2.05,-459.0) 实时灯 3/3
PASS goldenHour   interior [near] F-gate-west            内容均值 0.6387 内容暗区 0.00% 内容截断 0.00% · 机位(-309.0,2.05,0.0) 实时灯 3/3
PASS sunset       interior [near] F-garden-hall-east     内容均值 0.4798 内容暗区 1.26% 内容截断 0.26%
PASS sunset       interior [near] F-garden-hall-north    内容均值 0.5047 内容暗区 0.15% 内容截断 0.06%
PASS sunset       interior [near] F-garden-hall-west     内容均值 0.4444 内容暗区 18.66% 内容截断 0.00%
PASS sunset       interior [near] F-gate-east            内容均值 0.6543 内容暗区 0.00% 内容截断 0.01%
PASS sunset       interior [near] F-gate-north           内容均值 0.6925 内容暗区 0.10% 内容截断 0.02%
PASS sunset       interior [near] F-gate-south           内容均值 0.6988 内容暗区 0.00% 内容截断 0.09%
PASS sunset       interior [near] F-gate-west            内容均值 0.6622 内容暗区 0.00% 内容截断 0.00%
PASS moonlitNight interior [near] F-garden-hall-east     内容均值 0.4652 内容暗区 0.28% 内容截断 0.10%
PASS moonlitNight interior [near] F-garden-hall-north    内容均值 0.4320 内容暗区 0.31% 内容截断 0.00%
PASS moonlitNight interior [near] F-garden-hall-west     内容均值 0.4393 内容暗区 19.75% 内容截断 0.00%
PASS moonlitNight interior [near] F-gate-east            内容均值 0.5046 内容暗区 9.39% 内容截断 0.00%
PASS moonlitNight interior [near] F-gate-north           内容均值 0.5044 内容暗区 10.59% 内容截断 0.01%
PASS moonlitNight interior [near] F-gate-south           内容均值 0.5075 内容暗区 9.32% 内容截断 0.02%
PASS moonlitNight interior [near] F-gate-west            内容均值 0.5168 内容暗区 7.44% 内容截断 0.03%
```

- 最紧的一格：**`F-garden-hall-west` @ goldenHour 暗区 27.08%**（≤30%，余量 2.9pp）；**未放宽任何判据**。
- 布灯（t61 套件不含灯光 ⇒ 本区自行布灯）：每栋 **2 处 `windowGlow` 灯位**（与套件可见灯体同址：`inner.minX+1.2 / inner.maxX−1.2`，`lz = cz + frontSign·min(spanZ·0.25, 3)`，`height = clamp(headroom·0.45, 2.0, 2.6)`），共 **14 处新增**；layout 基线 F 灯位 7 处**逐条保留**（可见灯体仍只按基线实例化，室内实体灯由套件灯体承担 → 不重复造灯）。
- 一次"最小修法"记录：最初把补光灯位放在室内中心（3 处/栋），在 sunset/night 因灯体发光面正对机位导致 **高光截断 9.89% / 12.65%（>5% FAIL）**；改为**与套件灯体同址的 2 处**（灯体贴侧墙、避开机位正前方）后回到 **≤0.26%** ✓（记录以备复用，不是"未发现"）。

## §5 碰撞与可达性（真实碰撞数据：`src/interaction/walk-solver.js` + `walk-graph.js`）

`tests/zone-garden.test.mjs` §9 以真实可行走图（cellSize=2）逐栋验证（原样输出）：

```
F-garden-hall-east: 花园→殿内 可达、室内可站立 y=0.50 ✓ | F-garden-hall-north: 可达、y=0.80 ✓ | F-garden-hall-west: 可达、y=0.50 ✓
F-gate-east: 门外→室内 可达、室内 y=0.40、墩体不可站立 ✓ | F-gate-north: 同 ✓ | F-gate-south: 同 ✓ | F-gate-west: 同 ✓
```

- **4 座城门**：从门外（岸台侧 `(0,∓464)` / `(∓320,0)`）经门洞走进室内（登记 FP 走查点）✓；室内中心可站立且面高 = 0.4 ✓；**门洞通道之外的城台墩体 `probe().ok === false`** ⇒ 无法从外部穿墙进入 ✓；`WK-<gate>-interior` 与通道面同高、不掉出（无悬空面）✓。
- **3 座殿**：从御花园步道（FP 走查点 `(0,340)`）经 t75 门洞通道面进入殿内 ✓（高差 ≤ 0.5m 可跨）。
- **护城河与城墙既有约束未破坏**：F 的 26 个障碍、15 个可行走面、14 段坡道仍逐条回显 layout；水体/陆地/墙基/道路"体积重叠 0"与墙环 6100 点 100% 覆盖等既有断言全绿（本卡只**新增**灯位与内景几何，未改障碍/可行走面）。
- 已知条件：**室内家具不参与碰撞**（本轮不改 `layout.OBSTACLES`，避免影响其他区/全城计数）；城门壁龛不可进入（值房展示位，见 §2）。

## §6 verify 三条（原样）

```
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b" && node tests/zone-garden.test.mjs
 通过 37 / 37        （原 31 项 + 本卡新增 6 项内景断言）        exit 0

$ node scripts/audit.mjs
 分区 F         : 72 / 预算 80  ✓
 主场景绘制调用   : 333 / 上限 350  ✓
 可见三角面       : 308861 / 上限 1500000  ✓
 问题： 分区 C 55 超预算 50 / 分区 D 49 超预算 40 / 分区 E 49 超预算 40      exit 0（无 --enforce）

$ node tests/run.mjs
 通过 17 / 21，失败 4        exit 1
 FAIL  tests/core-audit.test.mjs          ← 归因：C/D/E 三分区超预算（其内景卡并行施工中），非 F
 FAIL  tests/verify-completeness.test.mjs ← 归因：5.3/5.4/5.4b 红项集中在 B/C/D/E/E 的"殿内走查点连通性"与"通道面 y ≠ 内景地面"，F 侧 4 门为 t72 设计取值（0.4 vs sillY 12.4）已在 5.4b 显式登记；F 的 7 栋均不在不可达清单中
 FAIL  tests/verify-experience.test.mjs   ← 归因：B1/B10（同上 B/C/E 连通性）、C1（C/D/E 预算）、F1（24 张 shot 的 fp/orbit 掩码口径，属 t2/shot 域）
 FAIL  tests/zone-forecourt.test.mjs      ← 归因：B 区自身断言（该文件在复验窗口内被其负责人持续修改）
 通过 37/37 的 tests/zone-garden.test.mjs / tests/zones.test.mjs 均 PASS
```

**结论**：F 侧三命令中，`tests/zone-garden.test.mjs` 与 `scripts/audit.mjs` 全绿；`tests/run.mjs` 的红项**经逐条核对无一由 F 引起**（F 的区预算 72/80 ✓、F 的 7 栋内景全部连通、F 未改 layout 障碍/可行走面），已按卡片验收条款「全绿或如实列出仍红项与非本卡归因」逐条列出。

## §7 已知条件 / 建议（不是"未发现"）

1. **灯位池竞争（全局公式，非本卡可修）**：`updateLampSelection` 的评分 = `ROLE_IMPORTANCE[role]·(1 − d/360)`，`windowGlow = 0.55` 而 `axisLantern = 1.0` ⇒ 室内灯（距机位 11–20m）会被 70–110m 外的中轴灯压过。实测：golden/sunset 下 **`F-gate-south`/`F-gate-north` 的 2 处室内灯未进实时池**（池被 B 区中轴灯占满），但**可读性仍 21/21 PASS**（环境/半球光 + 已激活的其它灯足以达标）。建议（属 `src/core/environment.js` 域）：内景类灯位提高 role 权重或改为"距离优先"；本卡未改环境代码。
2. **`INTERIOR_BY_SLOT[].groundY` 元数据与门洞通道面不一致**：4 座城门登记记录 `groundY = 12.4`（取 `slot.baseY`），而 `WK-<gate>-interior.y = 0.4`（t72 裁定）。本卡几何**以 WK 为准**（验收明确要求 0.4），`verify-completeness` 的 5.4b 已把该差异显式登记为数据集缺陷（共 5 栋，含 `C-hall-bed-main`）。
3. **壁龛陈设不可进入**（值房展示位）：若后续要求"步入值房"，需 layout 侧把 `OB-F-gate-*` 的门洞通道加宽或增加第二个门洞（本卡 inScope 不含 layout）。
4. **室内家具不参与碰撞**（见 §5）。

## §8 未验证项

1. 真实 GPU 帧率/显存与 resize（本机 headless + SwiftShader，帧率不具代表性；t13 域）。
2. 47/43 栋全城内景的**整体**观感与灯位池在其它区的表现（本卡只对 F 的 7 栋逐栋实测）。
3. 夜景下"仅靠室内灯、关掉环境光"的极端口径（CONFIG 冻结，未做诊断性覆盖实验）。
4. 内景家具与玩家圆柱的逐件碰撞（未注册障碍，见 §7-4）。
5. `dist` 发布包体积/首屏传输（t14 域）。

## §9 本卡改动（严格 inScope）

| 路径 | 改动 |
| --- | --- |
| `src/zones/garden-boundary.js` | ① 城门城台加"值房壁龛"（6 块拼砌 + 龛地坪 0→0.4，`GATE_NICHE={depth:8,along:10,height:3.2,inset:0.6}`）；② 新增 §3b 室内陈设段（7 栋 `kit.interiorSet`，`lod:'near'`，天花由 kit 举架推得）；③ 新增 14 处 `windowGlow` 室内灯位（`lightAnchors` = layout 基线 + 室内；可见灯体仍只按基线实例化）；④ `stats/audit` 增补 interiors/interiorTriangles/interiorLightAnchors 与平台 `niche` 记录 |
| `tests/zone-garden.test.mjs` | 新增 §9（6 项内景断言：集合一致 / 与 WK 对齐 / 城门通道语义与 26m 零占用 / 室内灯位 / 预算 / 真实碰撞可达性）；并把 3 处**因上游数据演进过期**的断言改为数据驱动（南轴竖向链连续性、灯位=基线+室内、visitable 语义按 t72/t73/t74 的 `exceptDoor`） |
| `docs/handoffs/zone-garden.md` | 本 t64 章节 |

未触碰：`src/shared/**`、`src/kit/**`、`src/core/**`、`src/ui/**`、`src/interaction/**`、`src/zones/` 其他区域、`index.html`、`scripts/**`、`docs/handoffs/` 他人回执，以及 `imperial-palace-commandcode-36m/`、`imperial-palace-opencode-424k/`、`imperial-palace-opencode-516k/`。
