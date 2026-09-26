# handoff · T2.4 碰撞语义修正：水体不可站立 + 障碍 y0 下钳 + 基线一等图层 + door 轴统一（t27）

任务：`t27`（repair，attempt 2）· 执行者：core-engineer（attempt_id `7ec2be37-0d35-4b1f-8231-62f88c7bd09d`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.4` ⇄ `CONFIG_VERSION 1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169
依赖：t23（同一批 core 文件，已串行）

---

## 0. 开工回执

```text
来源（三条独立上报，同一语义缺陷）：
  · E 区作者（t11）：layout.OBSTACLES.y0 是"按区域基准 0 估的台基顶"，而 E 地坪 0.4、主屋台基 0.9~1.0
    → 垂直判定放行"从建筑下方穿入"；OB-WB-E-pond 是水体本身（顶面 0.05 < 地坪 0.4）拦不住人，
    而 WK-E-ground 覆盖池面（floorYAt 给 0.4）⇒ 可"站在水上"。E 只好自行下钳 y0 并补 OB-E-pond-guard。
  · C 区作者（t7）：同一双基准现象，C 也自行兜底。
  · G 区作者（t9）：G 曾用"条数启发式"（fromRegistry.length ≥ layout.OBSTACLES.length）判断注册表是否完整，
    在未装配上下文里误判并一次性丢掉全部建筑阻挡（现以 E10 用例看住）。

可写范围（已严格遵守）：src/core/layout-slice.js、src/core/registry.js、src/core/context.js、
  tests/core-collision.test.mjs、docs/handoff-t2-repair-collision.md。
未触碰：src/zones/**、src/kit/**、src/interaction/**、src/shared/**、src/core/renderer.js、
  tests/core.test.mjs、tests/core-walls.test.mjs、docs/CONTRACTS.md。
verify 按任务卡只含本地两条命令（不含项目级 run.mjs）。
```

---

## 1. 修改点

### 1.1 `src/core/layout-slice.js`（语义收口，纯数据派生）

| 新增/改动 | 说明 |
| --- | --- |
| `footprintFloor(bounds)` | 足迹 5+ 点采样（中心 + 四角内缩 + 边中点）取**最低** `floorYAt`，即"建筑下方玩家可达的地面"。 |
| `normalizeObstacleY0()` / `normalizeObstacle()` | `y0 = min(记录值, 足迹地坪)`，保留 `y0Recorded` / `y0Source`；同时统一 door 轴语义。 |
| `normalizeDoorFields()` | **canonical 约定：`door.axis` = 面法线轴（穿越方向）、`door.lateralAxis` = 洞口横向轴（= 墙走向轴）**。按包围盒长边自动判走向轴：若 layout 记录值恰是走向轴 → 翻正为法线轴，并保留 `sourceAxis` / `axisFlipped`。 |
| `deriveWaterColliders()` | 由 `layout.WATER_BODIES` 派生 8 个水体阻挡盒（**id 与布局的 8 条水体障碍完全一致** `OB-<waterBodyId>`）：`y0 = min(水面, 岸边地坪) − 埋深`、`y1 = 岸边地坪 + 0.6m`（> 台阶阈值 0.5，必然拦人）。被桥面横跨的护城河改为 `blocks:'exceptDoor'` + 一条**桥面通道**（净宽 = 桥面宽、法线轴 = 过河方向）→ "桥可过、水不可进"。岸边采样**排除桥面地坪**，避免护城河顶面被桥抬高。 |
| `assembleBaselineObstacles()` | 组装 `layout.OBSTACLES` 的**一等基线图层**：81 条同 id 在册（8 条水体用派生版替换、73 条 y0 下钳 + door 归一），并给出对账统计 `{total, waterReplaced, y0Clamped, doorAxisFlipped}`。 |
| `waterBodiesForZone()` / `scenicObjectsForZone()` | 区域切片（区域不必再从障碍盒反推水池）。 |
| `obstacleBlocksPoint()` / `insideObstacleDoor()` | **共享的 canonical 阻挡判定**（足迹圆 ∩ 包围盒 + 玩家垂直区间 ∩ `[y0,y1]` + 门洞通道豁免），供所有消费方复用；旧判定只看 `y1`（不看 `y0`），本判定更严格且与求解器对"是否被阻挡"的结论一致。 |

### 1.2 `src/core/registry.js`（基线图层 + 去重 + 查询语义）

| 改动 | 说明 |
| --- | --- |
| `baselineObstacles` 图层 | `createRegistry({layout})` 时即由 core 派生入册（`registerBaselineObstacles()`），**不受 `unregisterZone` 影响**；`allObstacles()` = 基线 ∪ 墙层 ∪ 区域层 → **任何装配顺序**都含 81 条基线，消费方无需再自行 `union`，也不该再用条数启发式。 |
| 去重规则扩展 | ① `baseline-id`：与基线同 id 的区域回显（含各区自行 `y0` 下钳的副本）→ 以基线为准；② `water-contained`：被基线水体盒**包含**的水体拦阻盒（E 的 `OB-E-pond-guard`、D 的 5 段池面守卫）→ 冗余，去重；③ 几何全等兜底；④ **跨区冲突**：真实区域登记**别的区域**的基线 id → 抛 `RegistryError`（城市级装配器 GREYBOX/LAYOUT 回显全城基线仍允许）。 |
| `obstacleAt(x,z)` | 改为**语义查询**：门洞通道内的点被豁免（返回真正会阻挡该点的障碍），因此"城门/门洞中心不命中实心盒"的既有断言依旧成立且含义更准确。 |
| `stats()/ids()/duplicateIds()` | 合并三图层；新增 `obstaclesBySource.layoutBaseline` 与 `baseline` 对账统计；新增 `baselineColliders()` / `baselineStats()`。 |

### 1.3 `src/core/context.js`

| 改动 | 说明 |
| --- | --- |
| `ctx.shared.baselineObstacles` / `zoneWaterBodies` / `zoneScenicObjects` | 区域可直接消费基线图层与水体/点景切片。 |
| 非致命 warnings 扩展 | 区分三类区域补丁：回显基线但**自行改动包围盒**、自报水体拦阻盒（已被 core 派生盒覆盖）、自报墙体碰撞盒；**纯回显不再提示**（契约要求区域回显所分配的障碍）。 |

### 1.4 新增 `tests/core-collision.test.mjs`（20 项，覆盖 8 条验收）

y0 下钳与逐区"从下方穿入"反例、真实求解器穿越判定、水体派生与 E/D 池面反例、护城河"水不进/桥可过"、`waterBodies`/`scenicObjects` 切片、历史补丁去重与总数对账、基线图层逐条对账与装配顺序无关、`door.axis` 归一与旧约定反例、宫墙派生等价性证明、`allObstacles() == layout ∪ registry`。

---

## 2. 真实输出

### 2.1 `node tests/core-collision.test.mjs` → exit 0（20/20）

```text
[1. y0 基准统一：从足迹地坪起算（抬高台基不能"从下方穿入"）]
  · 基线 81 条：y0 下钳 41、水体派生替换 8、door 翻轴 4
  · B: OB-B-hall-mid 足迹地坪 0m、y0 记录 2 → 下钳 0（gap 2m）｜原始盒 y 判定=放行(缺陷)｜归一后=阻挡
  · C: OB-C-hall-bed-rear 足迹地坪 0.9m、y0 记录 1.2 → 下钳 0.9（gap 0.3m）｜原始盒=阻挡｜归一后=阻挡
  · D: OB-D-court1-hall 足迹地坪 0.4m、y0 记录 0.9 → 下钳 0.4（gap 0.5m）｜原始盒=阻挡｜归一后=阻挡
  · E: OB-E-court1-hall 足迹地坪 0.4m、y0 记录 1 → 下钳 0.4（gap 0.6m）｜原始盒=阻挡｜归一后=阻挡
  · F: OB-F-gate-south 足迹地坪 0m、y0 记录 12.4 → 下钳 0（gap 12.4m）｜原始盒 y 判定=放行(缺陷)｜归一后=阻挡
  ✓ 基线组装 / ✓ 每区 ≥1 栋高台基建筑阻挡 / ✓ 求解器穿越被挡（3 例）

[2. 水体不可站立（WATER_BODIES 派生；桥面仍可通行）]
  · 水体盒：OB-MOAT-south(y1=0.6,桥面通道16m) OB-MOAT-north(y1=0.6,16m) OB-MOAT-west(y1=0.6,12m) OB-MOAT-east(y1=0.6,12m)
            OB-WB-F-pond-west(y1=1.1) OB-WB-F-pond-east(y1=1.1) OB-WB-D-pond(y1=1) OB-WB-E-pond(y1=1)
  · E 池面 3 点：原始盒放行 3/3 → 派生盒全部阻挡
  · D 荷池：从 x=-191 朝池心走 6m → 停在 x=-191.00（池西缘 -188），原因 ["WB-D-pond","WB-D-pond"]
  · 南桥通行：从 z=-540 走到 z=-414.00（越过护城河 -472～-506 与城门 -454）；阻挡记录 0 次
  ✓ 5 项全绿（派生盒 id/顶面/桥面通道；E 池面；D 荷池；护城河）

[3. zoneLayout 补切片：waterBodies / scenicObjects]
  · 水体切片 F：MOAT-south/MOAT-north/MOAT-west/MOAT-east/WB-F-pond-west/WB-F-pond-east
  · 点景切片 F：SC-F-rockery-west/SC-F-rockery-east/SC-F-garden-screen；B：SC-B-plaza-drum/SC-B-plaza-bell
  ✓ 4 项全绿（每区切片数量与 owner 对账；E/D 可直接取到水体包围盒与水面标高）

[4. 与区域兜底兼容：去重策略 + 碰撞盒总数前后对比]
  · 历史补丁去重：E 17 + D 18 条；总数 164 → 164（不变）｜规则 {"baseline-id":31,"water-contained":4}
  · 真实装配：加载区域 5 个｜障碍 166 = 基线 81 + 墙 83 + 区域 2｜累计去重 237
    （区域净新增 2 条 = E 的两段影壁 OB-E-screenwall-CY-E-court2/3-span1，属真实新增内容，不参与去重）
  ✓ 三层之间无同几何重复盒；跨区登记他区基线 id 抛错 ✓ 装配后可量化、无冲突

[5. layout.OBSTACLES 81 条基线做成一等内建图层（任何装配顺序都在册）]
  · 全新 registry（未装配任何区域）：障碍 164（基线 81 + 墙 83）；基线缺失 0
  · 装配顺序无关：A(灰盒→B)=164 / B(B 障碍先登记→灰盒→B)=164；基线均为 81 条
  ✓ 4 项全绿（逐条 id/几何对账；水体同 id 派生版；顺序无关）

[6. door.axis 语义统一：面法线轴 + 沿 x 宫墙不得整条当门洞]
  · door 归一：翻正 4 条（OB-WALL-CITY-east/north/south/west）；其余 18 条建筑门洞保持原轴
  · 南段宫墙：旧约定 x=200 可穿（隐患）→ 归一后阻挡；城门净宽 26m 仍可通（|x| ≤ 12.65m）
  · 4 段宫墙：派生实心段与基线条目覆盖同一实体、26m 门洞净空一致、探针结论逐点一致
  · allObstacles() = 164 条，与 layout ∪ registry 的 164 条逐 id 一致（消费方无需再 union）
  ✓ 4 项全绿

---------------------------------------------------------
 通过 20 / 20
---------------------------------------------------------
```

### 2.2 `node scripts/audit.mjs` → exit 0

```text
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 B 58/70 ✓   C 49/50 ✓   D 39/40 ✓   E 40/40 ✓   F 61/80 ✓
 可见三角面       : 288609 / 上限 1500000  ✓
 结论：全部预算与契约检查通过
```

碰撞语义修正**不产生任何额外绘制**（纯数据：无 Object3D、无 geometry、无 material）—— 数字与 t28 修复后完全一致。

### 2.3 修复前后对比

| 维度 | 修复前 | 修复后 |
| --- | --- | --- |
| `allObstacles()` 内容 | 依赖装配顺序：全新 registry 只有 83 条墙盒（81 条基线全缺）；生产顺序下 164 条但少 4 条 `OB-WALL-CITY-*`（被 t23 派生盒替代） | **任何装配顺序**都 = 81 基线 + 83 墙盒（+区域真实新增）；81 条基线逐条在册（0 缺失），消费方**无需 union**、**不得**再用条数启发式 |
| 建筑下方可穿入 | B `OB-B-hall-mid`（gap 2m）、F 角楼/城门（gap 12~12.4m）在 y 区间判定下**完全放行**；C/D/E 的盒子悬空 0.3~0.6m | 全部 `y0` 下钳到足迹地坪（41 条），五区最不利建筑均被阻挡；求解器实测不进足迹 |
| 站在水上 | `OB-WB-E-pond`（y1=0.05）、`OB-WB-D-pond` 对地坪 0.4 的玩家**零阻挡**；E 池面 3/3 放行 | 由 `WATER_BODIES` 派生 8 盒（顶面 = 岸边 +0.6m），池面 100% 阻挡；求解器从池畔走入被挡；护城河"水不进、桥可过"（南桥实测走到 z=-414，0 次阻挡） |
| 区域自补补丁 | B/C/E/D 各自 `y0: Math.min(o.y0, groundY)` + E `OB-E-pond-guard` + D 5 段池面守卫（五份实现） | 全部在 registry 去重（`baseline-id` 162 条 + `water-contained` 6 条，总数 164 → 164 不变）；区域可改读 `ctx.shared.baselineObstacles` / `zoneLayout.waterBodies` |
| 宫墙 door 语义 | 南/北段 `axis:'x'` 被当法线轴 ⇒ **整条 608m 墙在 26m 侧向带内都是门洞**（实测 x=200 判定"可穿"，当时只靠墙带无可行走面兜住） | `door.axis` 翻正为法线轴（4 条）+ `lateralAxis` 显式给出；仅 `|x| ≤ 12.65m` 城门可通，x=200 阻挡；与 t23 派生实心段逐点结论一致（等价替代关系已证） |
| 查询语义 | `obstacleAt()` 只看包围盒 → 门洞中心也"命中" | 门洞通道豁免（返回真正阻挡该点的障碍）；"城门中心不命中实心盒"的既有断言依旧成立且含义更准 |

### 2.4 回归自查（非本任务 verify）

```text
node tests/core.test.mjs      → 43/43 PASS（未回退）
node tests/core-walls.test.mjs→ 18/18 PASS（t23 语义保持）
node tests/core-camera.test.mjs→ 9/9 PASS（t31 语义保持）
node tests/run.mjs            → 13/14；唯一红项为 G 的 tests/interaction.test.mjs B3，
   其断言把"core 校验器与暂停语义不一致"这一**旧缺陷**写成了期望值（期望 1，实际 0），
   现已被 t31 按主理人裁定修正为 `active && !paused` → 该断言需由 G 侧更新（该文件不在本任务 inScope），已上报。
```

---

## 3. 未验证项 / 已知限制

1. **浏览器内第一人称实测**：本任务的"不可站立/不可穿入"由 Node 侧 `obstacleBlocksPoint()` + `createFpSolver().step()` 判定；真实浏览器（指针锁定 + 帧循环 + 走查）由 t13/V2 复核（命令建议：进入 E 水池与 D 荷池区域按 W 前进，应被挡；南桥应可通行）。
2. **`src/interaction/walk-solver.js` 仍不看 `y0`**：它对"建筑"的阻挡靠 `y1` 判定（因此"从下方穿入"在**当前求解器**下恰好不会发生，但对任何按 y 区间判定的消费方是真缺陷）。canonical 判定已由 `layout-slice.obstacleBlocksPoint()` 提供并测试；是否让求解器改用该函数由 G 侧任务决定（本任务不改 interaction）。
3. **护城河桥面通道**：目前每个水体取**第一条**相交桥面作为通道（现数据下每段护城河恰有一座桥）。若将来一段护城河被多座桥跨越，需要改为多通道（已留 `door` 单通道结构，扩展点明确）。
4. **E 的 2 条影壁碰撞盒**（`OB-E-screenwall-*`）保留在区域图层：它们是 E 的真实新增内容（非 layout 基线），不参与去重；若将来 layout 收编影壁，应按 id 对齐以触发 `baseline-id` 去重。
5. **`OB-WB-F-pond-*` 顶面 1.1m**：F 地坪 0.5 + 0.6 = 1.1 ✓；若将来 F 地坪调整，水体顶面随 `floorYAt` 自动跟随（无硬编码）。
6. **区域自补代码尚未删除**（B/C/E/D 的 `y0` 下钳与水体守卫仍在区域文件里）：它们已被 registry 去重、不再产生双重阻挡，但**建议由各区自行删除**（改用切片），以免后续被误读为"core 未覆盖"。区域文件不在本任务 inScope。
7. **G 的 B3 断言**（见 §2.4）需随 t31 语义更新；该失败与本任务修改无因果关系（已用 t31 前的基线核对：B3 断言的目标是 `validateStateShape` 的导览/FP 互斥）。

---

## 4. 对 CONTRACTS §6.3（碰撞与不可进入区）的补充建议文本（供 foundation-lead 采纳，我未改 CONTRACTS）

> **§6.3.x 障碍（不可进入区）语义**
> 1. **基准**：障碍包围盒的 `y0` 一律**从足迹处地面起算**，即 `y0 = min(数据记录值, 足迹处 floorYAt 最低值)`；
>    数据里的 `y0` 只表示"实体在该处的底面"，消费方**不得**据此认为"地面到实体底面之间可以通行"。
> 2. **垂直判定**：玩家占据 `[feetY, feetY + INTERACTION.player.height]`，与障碍 `[y0, y1]` 相交即阻挡。
>    只比较 `y1`（不看 `y0`）的实现视为**不合规**（会在抬高台基建筑下方形成可穿通道）。
> 3. **水体**：`layout.WATER_BODIES` 是水体的唯一真相源；水体**永远不是可行走面**，即便 `floorYAt` 在池面给出可行走面
>    （如 `WK-<zone>-ground` 覆盖池面）也不得据此放行。水体的阻挡盒由 core 派生（`OB-<waterBodyId>`，顶面 = 岸边地坪 + 0.6m）；
>    被桥面横跨时用**门洞通道**（`blocks:'exceptDoor'`）表达"桥可过、水不可进"。
> 4. **区域职责**：区域**不得**自行给障碍下钳 `y0`、也不得自补水体拦阻盒（历史补丁已被 registry 去重并会给非致命 warning）；
>    水体/点景请直接消费 `zoneLayout.waterBodies` / `zoneLayout.scenicObjects`。
> 5. **基线图层**：`layout.OBSTACLES` 由 core 在 `createRegistry({layout})` 时登记为**一等图层**（81 条，id 与 layout 一致），
>    `registry.allObstacles()` 在**任何装配顺序**下都包含它。消费方**必须**直接使用 `allObstacles()`，
>    **禁止**用"条数启发式"判断注册表完整性，也**不必**再 `layout.OBSTACLES ∪ registry`。
> 6. **门洞轴语义**：`door.axis` = **面法线轴**（洞口穿越方向）；`door.lateralAxis`（= `door.wallAxis`）= 洞口横向轴（墙走向轴）。
>    对沿 x 延伸的墙段，`door.axis` 必须是 `'z'`。core 已按几何自动归一（保留 `sourceAxis`/`axisFlipped`），
>    消费方**只按归一后的字段**解释；若直接读原始 `layout.OBSTACLES[].door.axis`，其中 `sourceType:'wall'` 的 4 条是
>    **墙走向轴**（历史遗留），不得当法线轴使用。
> 7. **查询语义**：`registry.obstacleAt(x,z)` 返回"真正会阻挡该点"的障碍（门洞通道内的点被豁免）；
>    需要"该点是否被阻挡"的严格判定请用 `layout-slice.obstacleBlocksPoint()`（含垂直区间与门洞豁免）。
