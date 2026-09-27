# handoff · t22 门洞贯穿语义：登记 `door.through`/`door.back`（16 门类）+ 收窄整进深豁免

任务：`t22`（repair，attempt 1）· 执行者：core-engineer（attempt_id `580f0682-31d9-4ce7-98dc-09385a6cb53a`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`src/core/layout-slice.js`、`src/shared/layout.js`、`tests/core-collision.test.mjs`、本回执。
依赖：t13（同改 `src/shared/layout.js`，串行）· 来源：t6（门洞两侧开口）交回 #1 / #2。

---

## 0. 结论（先读这段）

| 项 | 状态 |
| --- | --- |
| **① 数据侧登记**（`door.through` + `door.back`） | **已落地**（`LAYOUT 1.1.23 → 1.1.24`）。63 条建筑门**逐栋**登记布尔 `through` 与镜像锚点 `back`；**零行为改动**（谓词层未消费 `through` 时语义逐字不变）。 |
| **② 收窄整进深豁免**（修幻影通道） | **已落地（t35 闭环）**。t31 用三证证明收窄安全（A 现状 36/36 ｜ B 去掉开槽留石栈道 ≡ A ｜ C 去掉石栈道 0/36）并把两池改成"有界开槽 + 池上石栈道"（LAYOUT 1.1.25）⇒ 两栋配殿不再依赖幻影通道。t35 据此把收窄落到产品代码（`insideObstacleDoor` 只对 `through===false` 的门收窄到"止于后墙"）：**43/43 内景仍可达**、26 座贯穿类两侧皆可走、37 座非贯穿类后墙中线**全部被挡**；代价 = 失去 1,025 个 1m 可走格（**全部落在已登记室内面之外**）。详见 **§8**。 |
| ③ 逐栋实测 | 见 §3（口径三要素齐备） |
| ④ 护栏/门禁 | layout 四层护栏全绿 · walk-reachability **全绿** · interaction **78/78**（E13/F27 ✓）· `audit --enforce` **exit 0** · `core-collision` **29/29**（新增 3 条 t22 断言，旧断言一条未删） |
| ⑤ ripple | `LAYOUT_VERSION` 1.1.24；`WALKABLE`/SLOTS/OBSTACLES/内景/VP 计数**全部不变**。**跨 owner pin 待同步 1 处**：`tests/layout.test.mjs:76` 的版本 pin（见 §5） |

---

## 1. 逐栋台账（① 交付物）

### 1.1 16 座门类（gateHall 6 + courtyardGate 10）：`through = true`

| slotId | kind | through | door.width | 门脸朝向 | facade 门外锚点 | back 对面锚点 | 可进入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `B-gate-front` | gateHall | true | 26 | south | (0, -404) outward=south | (0, -368) outward=north | 是 |
| `C-gate-inner` | gateHall | true | 26 | south | (0, 76) outward=south | (0, 112) outward=north | 是 |
| `C-gate-west` | courtyardGate | true | 12 | west | (-102, 124) outward=west | (-78, 124) outward=east | 否 |
| `C-gate-east` | courtyardGate | true | 12 | east | (102, 124) outward=east | (78, 124) outward=west | 否 |
| `D-court1-gate` | courtyardGate | true | 12 | east | (-107, -318) outward=east | (-129, -318) outward=west | 否 |
| `D-court2-gate` | courtyardGate | true | 12 | east | (-107, -158) outward=east | (-129, -158) outward=west | 否 |
| `D-court3-gate` | courtyardGate | true | 12 | east | (-107, 2) outward=east | (-129, 2) outward=west | 否 |
| `D-court4-gate` | courtyardGate | true | 12 | east | (-107, 188) outward=east | (-129, 188) outward=west | 否 |
| `E-court1-gate` | courtyardGate | true | 12 | west | (107, -320) outward=west | (129, -320) outward=east | 否 |
| `E-court2-gate` | courtyardGate | true | 12 | west | (107, -150) outward=west | (129, -150) outward=east | 否 |
| `E-court3-gate` | courtyardGate | true | 12 | west | (107, 20) outward=west | (129, 20) outward=east | 否 |
| `E-court4-gate` | courtyardGate | true | 12 | west | (107, 200) outward=west | (129, 200) outward=east | 否 |
| `F-gate-south` | gateHall | true | 26 | south | (0, -473) outward=south | (0, -435) outward=north | 是 |
| `F-gate-north` | gateHall | true | 26 | north | (0, 473) outward=north | (0, 435) outward=south | 是 |
| `F-gate-west` | gateHall | true | 26 | west | (-323, 0) outward=west | (-285, 0) outward=east | 是 |
| `F-gate-east` | gateHall | true | 26 | east | (323, 0) outward=east | (285, 0) outward=west | 是 |

### 1.2 贯穿类全集 = **26 座**（含 10 座开敞亭，**必须**也是 `true`）

`gateHall` 6 + `courtyardGate` 10 + `pavilion` 10 =
`B-pavilion-gate-{west,east}`、`C-pavilion-rear`、`D-court{3,4}-pavilion`、`E-court{3,4}-pavilion`、
`F-garden-pavilion-{main,west,east}`。

> **为何亭也算贯穿类**：t103 已把 10 座开敞亭可通行化（`hasDoor→exceptDoor`），其**几何本来就没有墙**（四面皆通）。
> 若按"只有 16 座门类为 true"来收窄，亭会被当成"实心后墙"而**禁止穿行**——那是**回退 t103/F21 的既有语义**。
> 因此 `THROUGH_KINDS = ['gateHall','courtyardGate','pavilion']`（**登记是可以严格只增的**：16 门类逐条满足卡面要求，亭为同一语义的延伸）。

### 1.3 收窄候选 = **37 座**（hall 14 + sideHall 23），`through = false`

恰好等于卡面"37 栋非门类"（hall 14 + sideHall 23；另有 12 座 sideHall / 4 座 cornerTower **无门**，不涉及）。
37 座**全部**有 `INTERIOR_BY_SLOT` 室内面（收窄时用于算"室内进深"）。

### 1.4 `door.back` 口径（与 `facade` 互为镜像，测试逐值断言）

`back = { x, z, y, width, outward }`：
`x/z` = **对侧外墙面向外 6.0m 的中心**（与 `facade` 同源同精度，逐值 = `slot ± DIR_VEC[对侧] × (w/2 或 d/2 + 6.0)`）；
`y` = 与 `facade.y` 逐值相同；`width` = `door.width`；`outward` = `facade.outward` 的对侧。
断言：63 条门逐条核对"对侧 / 同宽 / 同 y / 落在 AABB 之外 / 与镜像公式逐值一致"（`tests/core-collision.test.mjs` 新节 7 · t22①）。

---

## 2. ② 收窄豁免：定位、改法、以及为何**未落地**

### 2.1 只读定位（缺陷所在）

| 位置 | 内容 |
| --- | --- |
| `src/core/layout-slice.js:800-808`（原） | `insideObstacleDoor(door, bounds, x, z, radius)`：横向只收 `door.width/2 − radius`，但**进深轴一律 `[lo − r, hi + r]` = 整进深** ⇒ 门洞带就是一条**贯穿整栋的走廊** |
| `src/core/layout-slice.js:824`（原） | `obstacleBlocksPoint()` → `if (blocks==='exceptDoor' && insideObstacleDoor(...)) return false;`（**唯一谓词层**） |
| `src/core/layout-slice.js:496 / :586` | 门带辅助（`blockedOnDoorBand` / 覆盖普查）同样经谓词层 |
| `src/core/registry.js:411` | `blockingObstaclesAt()` 同谓词 |
| `src/core/camera.js:554 / 1302` | FP 碰撞与落地校验 → `obstacleBlocksPoint`（**玩家实际能穿后墙**的路径） |
| `src/interaction/walk-solver.js:359` | `blocks()` 委托谓词层 ⇒ **走查图/求解器同源** |

⇒ 结论：`blocks:'exceptDoor'` 的建筑障碍在**数据侧**对"门洞带 × 整进深"放行，而 37 座 hall/sideHall 的**背墙是实心几何**
⇒ **幻影通道**（"空气墙"的镜像：数据说通、几何是墙）。玩家在 FP 下沿门带就能**穿过整栋从后墙出来**。

### 2.2 改法（**t35 已落地** —— 与下面的"复贴形状"同语义、实现更小；见 §8）

> 落地差异（**语义等价、机制更简**）：进深不再由 `normalizeObstacle` 预登记 + `obstacleBlocksPoint` 传 id，
> 而是**在谓词内部**由 `bounds → 唯一 SLOTS 条目 → INTERIOR_BY_SLOT → WALKABLE 室内面` 现算并**按 bounds 记忆化**
> （`registeredInteriorRect()` + `doorBandDepthOf()`，WeakMap 缓存）。**调用点零改动** ⇒
> `registry.js` / `walk-solver.js` / `camera.js` / 测试**共用同一个谓词**，不会出现"一处收窄、一处没收窄"。
> 解析失败（bounds 与槽位几何不逐值相等 / 室内面无登记 / 朝向缺字段）一律**回退整进深**（绝不因解析失败制造新阻挡）。
> 原始"复贴形状"存档如下（供对照）：

1. **`src/core/layout-slice.js`**：把 `insideObstacleDoor` 的进深轴判定抽出为 `insideDoorNormalSpan(door, bounds, coord, radius, bandDepth)`：
   `through === true` 或 **未登记 `through`** ⇒ 整进深（原式逐字不变）；
   `through === false` ⇒ `[门侧外沿 + radius, 室内面远边]`（`doorSide` 由 `door.facade.outward` + `CONFIG.ORIENTATION.facingVectors` 解析）。
2. 同文件新增 `attachDoorBand()` / `doorBandDepthOf()`：由 `INTERIOR_BY_SLOT → WALKABLE` 的登记矩形**现算**"室内进深"
   （`normalizeObstacle` 登记为 `door.bandDepth`；另有一条按障碍 id 记忆化的兜底，覆盖"裸 `layout.OBSTACLES`"路径）；
   `obstacleBlocksPoint` 把 `obstacle.id` 传给谓词层。**阈值一字未动**（只用 `radius` 与登记几何）。
3. 实测（`cellSize:1` 整城图、`assembleCity()`）：

| 口径 | 主分量 | 43 栋内景不可达 |
| --- | --- | --- |
| **整进深（现状）** | **724,481 格** | **0** |
| 收窄（t22 补丁） | **722,884 格（−1,597）** | **2：`F-garden-hall-west`、`F-garden-hall-east`** |

### 2.3 根因（量化）：F 御花园水池与两栋配殿的**门洞通道**重叠

```
OB-WB-F-pond-west  x[-250,-150] z[318,392]   y0/y1 = -0.4/1.1   blocks='all'（无 door）
OB-WB-F-pond-east  x[ 150, 250] z[318,392]   同上
WK-F-garden-hall-west-door-passage  x[-242,-228] z[387,393.6]   y=0.5
WK-F-garden-hall-east-door-passage  x[ 228, 242] z[387,393.6]   y=0.5
```
**重叠 = z∈[387,392] 共 5.0m ⇒ 通道整条被水面盖住**（逐格扫描：z=387..392 全 `.`＝不可走；仅 z=393/394 可走但**不在主分量**）。
⇒ 这两栋**正门从来进不去**；此前"可达"**完全依赖**从背面（z>415）穿过建筑内部的**幻影通道**。

**为何不在本卡修**：正解是把水池与通道解冲突（挪池 / 缩池 / 给门洞走廊**有界开槽**），属
`src/zones/garden-boundary.js` + `WATER_BODIES` 的几何改动；按 t13 立下的规矩"**登记与几何同轮**"，
开槽必须同轮补**可见石件**，而 `src/zones/**` 与 `src/kit/**` **均在本卡 out of scope**。
卡面 ③ 明确："若实测发现…⇒ **停手、量化、交回主理人**（不得猜）"——本卡据此**停手**。

### 2.4 交回的选项（供主理人派单）

| 选项 | 内容 | 代价 |
| --- | --- | --- |
| **A（推荐）** | 派一张 F 区卡：把 `WB-F-pond-{west,east}` 的 `maxZ` 由 392 收到 **≤386**（让开 z∈[387,393.6] 的通道带），或按 t13 先例给两池登记 `STONE_STEP_LANES` 有界开槽 + 同轮可见石件 | 需 F 区 owner + 面积守恒核算；随后 **重放 §2.2 补丁即闭环** |
| B | 把两栋配殿的门改到不被水池覆盖的一侧（`facing` 变更） | 动建筑朝向/立面，影响面更大 |
| C | 接受 41/43 并把两栋登记为"门外被水体封死"（`doorBlockedBy`） | 与"43 栋可进入"交付目标冲突，不建议 |

---

## 3. 逐栋实测（③ 口径三要素）

**口径**：`①` `cellSize:1` 整城图 + **显式提额** `maxCells: 2,000,000`（默认 40 万会抛错，t116 已证）；
范围 = `TERRAIN_EXTENT` 全域；`②` 锚点 = `(0,-480)`（南桥外，与 t140/t153 同源）；`③` 判据一律 **`.ok`**（`componentOf(...).ok` / `obstacleBlocksPoint(...) === false`），
**不得**用 `!= null`。

### 3.1 谓词层逐栋（本卡已实测，两种状态都跑过）

| 集合 | 断言 | 整进深（现状） | 收窄（t22 补丁） |
| --- | --- | --- | --- |
| 26 座贯穿类 | 门侧内 0.5m / 整进深中线 **放行**；背面外 1.5m 不由本栋阻挡 | ✓ | ✓ |
| 37 座收窄候选 | 门侧内 0.5m **放行**、室内远边内侧 0.2m **放行**；**后墙中线必须被挡**；背面外 1.5m 不由本栋阻挡 | ✗（后墙中线**放行** ⇒ 幻影通道） | **✓** |
| 6 条水体门洞（桥面/汀步走廊） | 未登记 `through` ⇒ 进深中点仍在通道内（语义不变） | ✓ | ✓ |

> 注：37 座"后墙中线"的探针点 = `(门侧外墙外沿 → 室内面远边) 之中线`，**不是** AABB 中线
> （AABB 中线落在室内，是该放行的）。这一点在首次实测中踩过（39 条假红），已修正。

### 3.2 生产图逐栋（`assembleCity()`，收窄状态）

| 集合 | 结果 |
| --- | --- |
| 26 座贯穿类 | 单侧门外 → 另一侧门外 **双向可走**（两门带均在主分量内） |
| 37 座收窄候选 | 门内 → 后墙外侧 **不可达**（后墙被挡）；室内仍可达（**除 §2.3 的 2 栋：其正门被水池封死 ⇒ 整栋不可达**） |
| 43 栋内景 | 整进深 43/43 → 收窄 **41/43**（正是交回项） |

### 3.3 `t86 ①` 探针点的**修正**（本卡已落地，两种状态都绿）

`tests/core-collision.test.mjs:352-364`（原）用固定 `edge = axis==='z' ? b.maxZ : b.maxX` 取"体块内 1m"，
对 **31/43 栋**取到的是**背面**（门在 min 侧、或门法线轴为 x）。改为由 `door.facade.outward` 解析**门侧外沿**再向内 1m：
判据强度不变（仍"43 栋门洞中轴必须放行 43/43"），但探针点变成**真门侧**——这是收窄补丁能否成立的前置（否则 2 栋深后墙建筑会假红）。

---

## 4. 护栏与门禁（实测）

| 门禁 | 结果 |
| --- | --- |
| `node tests/core-collision.test.mjs` | **29/29 PASS**（原 26 + 新增 t22①②③ 三条；**旧断言一条未删**） |
| `node tests/walk-reachability.test.mjs` | **全部通过 ✓**（细口径不可达 0 / 粗口径 === 已登记 2 项 / t153⓪ 分量护栏 细 0、粗 7） |
| `node tests/run.mjs layout` | 四层护栏**全绿**（遮蔽命中 0 · 通路缺失链 0 · 格级一致 · F3 双向失败 0）；**唯一红 = 版本 pin**（跨 owner，见 §5） |
| `node tests/run.mjs interaction` | **78/78 PASS**（E13 ✓ / F27 ✓） |
| `node scripts/audit.mjs --enforce` | **exit 0**（"预算与契约检查全部通过"；**未新增任何绘制调用**——本卡只改数据字段与测试） |

---

## 5. 跨 owner pin 待同步（交回）

| 文件:行 | 内容 | 需要的动作 |
| --- | --- | --- |
| `tests/layout.test.mjs:76` | `eq('LAYOUT 版本 = 1.1.23（t13：…）', L.LAYOUT_VERSION, '1.1.23')` | 版本 pin → `'1.1.24'`，标题补 t22 摘要（**该文件在本卡 out of scope**，故本卡不自行改） |

其余已知 pin 本卡**未触发**：`WORKABLE`/`SLOTS`/`OBSTACLES`/内景/VP 计数全部未变 ⇒
`tests/core.test.mjs` 的计数、`scripts/verify-completeness.mjs:1317` 的 67、`README.md:47` 均无需同步。

---

## 6. 本卡改动（跨域授权与 file:line 登记）

| 文件 | 改动 | 授权 |
| --- | --- | --- |
| `src/shared/layout.js:28` | `LAYOUT_VERSION` `1.1.23 → 1.1.24` + 摘要 | 卡面 ⑤ 要求递增 |
| `src/shared/layout.js:277-288` | 新增 `THROUGH_KINDS` / `OPPOSITE_FACING` | 卡面"本卡可改 `src/shared/layout.js`（登记数据）" |
| `src/shared/layout.js:364-381`（约） | `S()` 的 door 记录新增 `through` 与镜像锚点 `back` | 同上 |
| `tests/core-collision.test.mjs:352-372` | `t86 ①` 探针点由"max 边"改为"门侧外沿"（**修正**，强度不变） | 卡面 inScope |
| `tests/core-collision.test.mjs`（新节 7） | 新增 t22①②③ 三条逐栋断言（登记台账 / 未登记 through 语义不变 / 生产装配门侧放行） | 卡面"断言只增不减" |
| `src/core/layout-slice.js` | **净零改动**（收窄补丁实现后已按 ③ 规则回退；§2.2 留档可复贴） | — |

**未运行的命令（如实报告）**：本卡**未**跑 `node tests/run.mjs`（全量 28 套件，约 9–10 分钟）与
`node tests/verify-completeness.test.mjs`——因本卡对产品代码是**净零行为改动**（只加数据字段），
且受影响面已由 `core-collision` / `walk-reachability` / `layout` / `interaction` / `audit` 五道覆盖；
如需全量回归请在闭环（§2.4 选项 A 之后）再跑一次。

---

## 7. 闭环路径（给下一张卡）

1. F 区解冲突（§2.4 选项 A）；
2. 复贴 §2.2 的 `layout-slice.js` 补丁（3 处：`insideDoorNormalSpan` / `attachDoorBand`+`doorBandDepthOf` / `normalizeObstacle`+`obstacleBlocksPoint` 传 id）；
3. 把 t22③ 断言升级为"非贯穿类后墙中线**必须被挡**"（本卡已把探针点与口径准备好）；
4. 重跑 `walk-reachability`（应回到 43/43 且不可达 0）与 `interaction`/`audit`。

---

# §8 t35 · 收窄补丁**已落地**（core-engineer · attempt 1 · attempt_id `afa4465a-c66f-4805-88d7-6f884b0f0b56`）

> 闭环路径 §7 的 2、3 两步在本卡完成；1（F 区解冲突）由 t31 以"有界开槽 + 池上石栈道"落地（LAYOUT 1.1.25）。

## 8.1 落地内容（file:line）

| 文件:行 | 改动 |
| --- | --- |
| `src/core/layout-slice.js:797-822` | 新增 `registeredInteriorRect(bounds)`：`bounds` → **唯一** `SLOTS` 条目（几何逐值相等才算命中，0/多命中 ⇒ `null`，绝不猜）→ `INTERIOR_BY_SLOT` → `WALKABLE` 室内面 |
| `src/core/layout-slice.js:824-862` | 新增 **`doorBandDepthOf(door, bounds)`**（导出）：`through !== false` ⇒ `null`（**整进深**，原语义）；`through === false` ⇒ `|门侧外墙外沿 − 室内面远边|`；按 `bounds` 用 `WeakMap` 记忆化（基线条目 `bounds` 引用稳定，热路径零额外开销） |
| `src/core/layout-slice.js:864-879` | 新增 `insideDoorNormalSpan(door, bounds, coord, radius, bandDepth)`：门侧端 = **原式**（外墙外沿 ± `radius`），远端 = **室内面远边**；`bandDepth` 缺失 ⇒ **原式整进深** |
| `src/core/layout-slice.js:881-899` | `insideObstacleDoor()`：`bandDepth === null` 分支保留**逐字原式**；非 `null` 分支走收窄 span。**阈值（`radius`）一字未动**，`blocks` 语义一字未动 |

**判别性差异（零放宽）**：全城 75 条带 door 的障碍 × 半米格点遍历 ⇒ 新谓词相对旧谓词**只新增阻挡 4,292 点、新增放行 0 点**（新增放行恒为 0 是"收窄"的定义性判据）。

## 8.2 逐栋实测（生产装配 `assembleCity()` + 口径三要素）

口径：① `cellSize:1`（显式提额 `maxCells: 3,000,000`；`cellSize:2` 只用于非权威复核）；
② 锚点 = `(0,−480)`（南桥外，与 t140/t153/core-precision 同源）；③ 判据一律 **`.ok`**（`componentOf(...).ok === true` / `obstacleBlocksPoint(...) === false`）。

| 集合 | 断言（`tests/core-collision.test.mjs` 新节 8） | 结果 |
| --- | --- | --- |
| 进深登记 | 37 座非贯穿类**全部**解析出有限进深且 `进深 > 半进深`（⇒ 建筑中心仍在带内，`probeDoorClearance` 取样平面口径不变） | **37/37 .ok** |
| 整进深不变 | 38 条（26 贯穿类 + 8 水体门 + 4 宫城门）`doorBandDepthOf === null`，且门带全深 × 横向 ±(半宽+1m) **70,366 个采样点判定逐点未变** | **0 例外** |
| 26 座贯穿类 | **两侧皆可走**：门侧内 1m 与背面内 1m 都可站立 ∧ 与锚点同分量 ∧ 不被本栋门洞盒阻挡 | **52/52 点 .ok** |
| 37 座非贯穿类 | ① **后墙中线必须被挡**（法线坐标 = (室内面远边 + 该侧外墙外沿)/2、横向 = 门洞中心；`feetY = 该障碍 y0`）；② **突变对照**：同一批点在**旧整进深谓词**下**全部放行**（⇒ 断言不恒真）；③ 门侧内 1m 仍放行；④ 自室内中心向后墙 **0.25m 小步真实行走**，终点**全部止于室内面远边**（不穿后墙） | **37/37 四项全绿** |
| 43 栋内景 | 细口径 `cellSize:1` + 锚点：**43/43 与锚点同分量**（主分量 725,781 格） | **0 不可达** |
| 失去格归因 | 收窄失去的 1m 可走格 **恰 1,025 格**，**全部落在已登记室内面之外**（室内面内 **0** 格）；逐栋 **36 座**（`B-hall-mid` 为 0：进深 27.4 / 总深 28.0 ⇒ 后墙带仅 0.6m < 1m 格距） | **逐格可归因** |

**代表性读数**：`B-hall-main` 后墙中线 `(0,−95)` 新谓词**挡=true**（旧谓词放行=true）；自室内中心向后墙走 0.25m 小步**止于 −116.00**（室内面远边 −98）……

## 8.3 回归（四条 verify + 扩展）

| 门禁 | 结果 |
| --- | --- |
| `node tests/core-collision.test.mjs` | **34/34 PASS, exit 0**（t22 三条旧断言一条未删；新增 t35①–⑤ 五条） |
| `node tests/core-precision-consistency.test.mjs` | **6/6 PASS, exit 0**（`REGISTERED` 已同步 → §8.4） |
| `node tests/walk-reachability.test.mjs` | **全部通过 ✓ exit 0**（细口径不可达 0 · 分量 725,781 格 · 粗口径 === 已登记 2 项 · t153⓪ 细 0/粗 7） |
| `node tests/layout.test.mjs` | **全部通过 ✓ exit 0**（四层护栏 + 冻结 pin：WALKABLE 175 / SLOTS 79 / OBSTACLES 93 未动） |
| `node tests/interaction.test.mjs` | **78/78 PASS, exit 0**（E13 / F27 ✓） |
| `node scripts/audit.mjs --enforce` | **exit 0**（"预算与契约检查全部通过"，信息性提示 0 项） |
| `node tests/core.test.mjs` | **45/45 PASS**（t127 门洞净宽逐门实测未受影响——进深 > 半深是充分条件） |

## 8.4 指纹 ripple（t31 交回 + 本卡）

`tests/core-precision-consistency.test.mjs` 的 `REGISTERED` 按该文件自带"几何有意变更 ⇒ 本轮同步"流程更新：

| 来源 | edgeHash | edgePass | edgeFail | walkable | mainComponent |
| --- | --- | --- | --- | --- | --- |
| t12 落地时 | `c368beed` | 1,423,122 | 2,466 | 724,481 | 724,481 |
| **t31**（两池石栈道；交回同步） | `bda28509` | 1,427,678 | 2,466 | 726,806 | 726,806 |
| **t35（本卡后，实测）** | **`b8351ad5`** | **1,425,334** | **2,005** | **725,781** | **725,781** |

**归因（两个独立来源逐值对齐）**：
* t31 的 +2,325（两池包围盒内 1m 可走格 0 → 2,250 + 水体阻挡半径边缘格）**原样保留**；
* 本卡收窄 −1,025（726,806 → 725,781），与 t35⑤ 的**逐格计数 1,025 逐值相同**，且 1,025 格**全部在已登记室内面之外**。
* ⇒ **卡面给的期望值 `bda28509 / 1427678 / 726806 / 726806` 是"收窄前的实测值"**（本卡落地前先在 HEAD 上实测复现，与该四个值**逐值一致**，⑤ 恰红在"登记陈旧"上）。收窄本身**必然**再产生 −1,025 的 ripple（去掉 1,025 个"只在整进深豁免下才可走"的格），故 `REGISTERED` 按**收窄后实测**登记，否则 ⑤ 恒红。

**另一处随树变化的判据（已按更强形式改写）**：断言② 的"精度决定性格对"非空性下限原为 `>= 20`（t12 时实测 35 对）。
收窄去掉的 1,025 格里含 23 对边界格对 ⇒ 本树可找到 **12 对**。已把该**下限**换成**精确登记** `DECISIVE_PAIRS_REGISTERED = 12`
（**更强**：升或降都红；非空性由断言③"float64 首次 / float32 缓存必相反"的突变对照另行证明）。

## 8.5 突变对照（`§12.1.4.2`：修前必红、修后全绿、对照不假红）

| 步骤 | 结果 |
| --- | --- |
| 修前（本卡落地**前**在 HEAD 上跑 `core-precision`） | ⑤ **红**：实测 `bda28509/1427678/726806/726806` ≠ 登记 `c368beed/1423122/724481/724481`（登记陈旧） |
| 突变（把 `doorBandDepthOf` 临时改为恒 `null` ⇒ 恢复整进深） | `core-collision` **t35① 红**（37 座进深未解析）· **t35③ 红**（37/37 后墙中线**未被挡** ⇒ 幻影通道可复现）· **t35⑤ 红**（失去格 0）；而 t35② / t35④ **仍绿**（贯穿类与内景可达不受收窄影响 ⇒ 断言未过度） |
| 修后（恢复收窄） | 34/34 全绿（md5 复原校验：`545349f4547a3658bdfb7f4880d576e7`，突变残留 `0` 处） |

## 8.6 纪律、跨域授权与未运行项

* **只改 inScope 四处**：`src/core/layout-slice.js`、`tests/core-collision.test.mjs`（新增节 8 五条断言 + 顶部 `assembleCity` 导入）、`tests/core-precision-consistency.test.mjs`（`REGISTERED` 同步 + `DECISIVE_PAIRS_REGISTERED` 精确登记 + 文档注释）、本回执。
  **`tests/core-precision-consistency.test.mjs` 的改动属卡面显式跨域授权**（t12 产物，同属 core 域）：`REGISTERED`（`:56-79`）与 `DECISIVE_PAIRS_REGISTERED`（`:81-82`）+ 断言②（`:158-165`）+ 文件头注释。
* **阈值/语义未动**：`INTERACTION.player.radius`、`step` 0.5/0.6、`BOUNDARY_EPS 1e-9`、`blocks` 语义、`door.width/2 − radius` 横向收窄**逐值未变**；`LAYOUT`/`WALKABLE`/`SLOTS`/`OBSTACLES`/内景数**一个没动**（纯谓词层收窄）。
* **判据只增不减**：t22 三条断言、四层护栏、E13/F27、t153 分量护栏全部原样保留；新增 t35 五条（含两条突变对照）。
* **并发窗口纪律**：本卡期间树上有成员在改（t7/t34）。已按纪律先判"真缺陷 vs 窗口伪影"：本卡所有红都伴随**同一改动**（收窄 / 登记陈旧）或**同一文件**（layout-slice 突变对照）出现，且在**同一棵树上重跑可复现**；未把任何窗口伪影写成结论，也未为窗口伪影改过代码。
* **未运行（如实报告）**：`scripts/verify-completeness.mjs`（t31 §7 建议项）——见 §8.7 的补跑结果；浏览器内实测（帧率/观感）不属本卡（谓词层收窄不改绘制调用）。

## 8.7 全量套件（t31 §7 的建议项，已补跑）

```console
$ node tests/run.mjs
  通过 28 / 28，失败 0，总耗时 737549ms                    exit 0
  （含 verify-completeness 153s · verify-experience 80s · walk-reachability 83s · interaction 52s ·
    core-precision-consistency 217s · **core-collision 65s**）
```

⇒ 本卡落地后**全树 0 红**：t31 §7 建议的"全量 + 完整性"两项都在内。
**代价（如实登记）**：`core-collision` 由 6.8s → **65s** —— 新增的 t35 节要在**生产装配 + `cellSize:1` 细口径**
上建一次整城图（口径三要素要求用**权威口径**证明"两侧可走 / 43 栋可达"，故不用 `cellSize:2` 的非权威口径替代）。
