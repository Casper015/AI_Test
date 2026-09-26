# handoff · t2-repair-walls（T2.3 修复 `courtyardWalls` 恒空 + 宫墙/院墙碰撞收口到 core）

任务：`t23`（repair）· 执行者：core-engineer（attempt 1，attempt_id `97be037e-2509-4aeb-a308-ad8aca1bd33c`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线版本：`CONTRACTS v1.0.2` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ three r169

---

## 0. 开工回执

```text
来源（两条独立上报）：
  ① t7（C 区）：src/core/layout-slice.js 用 `w.zone === zoneId` 过滤院墙，而 layout.WALLS 只有 owner
     → 所有区域的 zoneLayout.courtyardWalls 恒空，B/C 各自绕过（B 从 WALLS 直取、C 同）。
  ② t5（G1 评审 D-5）：56 段院墙既不在 layout.OBSTACLES、灰盒也未登记
     → 第一人称不会被院墙阻挡，直接影响 G3（§6.4「墙、柱、栏杆不可穿越」）。

已核事实（本次实测）：
  layout.WALLS 60 条：owner 60/60、courtyardId 56/56、zone 0/60；cityWall 4、courtWall 56；
  owner 分布 F4 / B12 / C12 / D16 / E16；宫墙四段 openings 各 1 个 26m 城门；
  FP_ROUTE 9 站与 5 个 fp-spawn 均不落在墙体包围盒内。

裁定：碰撞归属收口到 core（layout.WALLS 是带 owner 的唯一真相源；5 个区域各自实现必然漏项）。
可写范围：src/core/layout-slice.js、src/core/registry.js、src/core/context.js、
          tests/core-walls.test.mjs（新增）、docs/handoff-t2-repair-walls.md（本文件）。
未修改：src/shared/**、docs/CONTRACTS.md、src/kit/**、src/zones/**、src/interaction/**、其他测试文件。
```

---

## 1. 修改点

### 1.1 `src/core/layout-slice.js`

| 改动 | 说明 |
| --- | --- |
| 修复过滤（**核心缺陷**） | `courtyardWalls: WALLS.filter(w => w.kind==='courtWall' && w.zone===zoneId)` → `wallsForZone(zoneId).filter(w => w.kind === 'courtWall')`（`wallsForZone` = `WALLS.filter(w => w.owner === zoneId)`） |
| 新增切片字段（附加，不破坏 §3.2） | `cityWalls`（本区宫墙，仅 F owner 4 段）、`walls`（本区全部墙体）、`wallColliders`（本区墙体碰撞盒，core 已派生，区域直接消费） |
| 新增 `wallSolidSpans(wall)` | 扣除 `openings` 门洞后的墙身区间（世界坐标，沿墙轴） |
| 新增 `deriveWallColliders(walls, { helpers })` | 由 `layout.WALLS` **统一派生**碰撞盒：按（轴向+墙线+厚度+墙高）归并共线墙 → 墙身并集 → 扣除门洞并集 → 每段出一个 `blocks:'all'` 碰撞盒；`y0 = 沿墙多点（两端+中点 × 墙两侧 ±(厚/2+0.6)）floorYAt 最低值 − 0.15 埋深`，`y1 = y0 + 墙高`；id `OB-WALLRUN-<owner>-<axis><line>-span<n>`；字段 `wallIds[]`（归并覆盖的墙段）、`zones[]`、`courtyardId`、`cityWall` |
| 新增 `wallCollidersForZone(zoneId)` / `deriveCityWallColliders()` | 按 `wallIds` 交集过滤本区盒；全城一份（registry 与 ctx.shared 共享同一份计算结果） |
| `cityLayout()` | 增加 `walls: WALLS` 与 `wallColliders: deriveWallColliders(WALLS)` |

归并的两个真实理由（都有实测）：① `CY-B-plaza-wall-north` 与 `CY-B-throne-wall-south` 同在 z=-180（共线重合）→ 不归并会得到 18 对不同 id 但完全同几何的盒子；② `CY-B-rear-wall-north`（B owner）与 `CY-C-front-wall-south`（C owner）同在 z=80，是同一道实体墙。

### 1.2 `src/core/registry.js`

| 改动 | 说明 |
| --- | --- |
| `createRegistry({ layout })` | 自动 `registerWallColliders(deriveWallColliders(layout.WALLS))`（可用 `deriveWallColliders: false` 关闭） |
| 独立图层 `wallObstacles` | 墙体碰撞**独立于区域注册**：`unregisterZone()` 不会删除它（否则区域 replace 会把墙抹掉）；`registerWallColliders()` 幂等 |
| 去重（rule: id / buildingId / geometry） | `registerColliders` 遇到与墙体图层重复的条目时不再登记，计数并记录 `dedupedObstacleReport()`（保留方、规则、说明）。`buildingId` 规则同时覆盖区域自定义 id 约定与 layout 的聚合宫墙条目（`buildingId='WALL-CITY'` → 前缀匹配 `WALL-CITY-south`） |
| 查询/统计 | `allObstacles()` = 墙体图层 + 区域条目（已去重）；`obstacleAt()` 两图层都查；`ids()/duplicateIds()` 含图层；`stats()` 新增 `obstaclesBySource{coreWalls,zones,deduped}`、`wallColliders`、`wallCollidersByZone`；新增 API `wallColliders()`、`dedupedObstacleReport()` |
| 惰性墙 id 集合 | 派生墙 id 集合按图层规模惰性缓存（图层在装配期才填充；写成定义期常量会导致 `WALL-CITY` 聚合 id 漏判 —— 这是本次实现过程中真实踩到并修掉的坑） |

### 1.3 `src/core/context.js`

| 改动 | 说明 |
| --- | --- |
| `ctx.shared.wallColliders` / `ctx.shared.zoneWallColliders` | 区域与 G 直接消费 core 派生结果（不再各自实现）；`zoneLayout.wallColliders` 与前者同源 |
| `validateZoneResult()` 新增非致命 `warnings` | 区域自报的 `sourceType:'wall'` 碰撞若与 core 派生重复 → 提示"registry 会去重，建议改消费 `zoneLayout.wallColliders`"；**不**算合约问题（合约仍成立）。`assertZoneResult` 通过 `options.onWarning` 上报 |

### 1.4 `tests/core-walls.test.mjs`（新增，18 项）

覆盖：字段事实与旧过滤反证、五区切片逐一对账、派生覆盖 60 段墙/无同几何重复、标高规则（复刻取样规则）、
门洞净空不侵占、registry 自动登记与区域 replace 不影响图层、查询命中、去重（id/buildingId/几何三种规则）、
纯数据不产生绘制、warning 通道、真实行走穿越判定、走查站点与 fp-spawn 不被封死、单帧位移 < 墙厚。

---

## 2. 真实输出（原样粘贴）

### 2.1 `node tests/core-walls.test.mjs`（exit 0，18/18）

```text
[1. 过滤修复：owner / courtyardId（不再恒空）]
  ✓ 字段事实：WALLS 60 条全部有 owner、56 条有 courtyardId、0 条有 zone
  ✓ 反证：旧过滤条件 `w.zone === zoneId` 对每个区域都恒为 0（这就是 t7 上报的缺陷）
  · B: 院墙 12 + 宫墙 0 → 碰撞盒 22
  · C: 院墙 12 + 宫墙 0 → 碰撞盒 19
  · D: 院墙 16 + 宫墙 0 → 碰撞盒 25
  · E: 院墙 16 + 宫墙 0 → 碰撞盒 25
  · F: 院墙 0 + 宫墙 4 → 碰撞盒 8
  ✓ 新过滤：每个区域的 courtyardWalls 与 owner 一致，且数量逐一对账
  ✓ 已交付的区域模块拿到的切片确实非空（B/C/E 有院墙、F 有宫墙）

[2. core 统一派生：宫墙 + 院墙碰撞盒（门洞净空 / floorYAt 标高）]
  · 全城墙体碰撞盒 83（宫墙 8 + 院墙 75）；含归属分区计数 {"F":8,"B":22,"C":19,"D":25,"E":25}
  ✓ 派生覆盖 60 段墙（wallIds 覆盖）+ 宫墙 8 盒；共线墙已归并（无同几何重复盒）
  · 可判定标高的盒体 83/83；其中跨不同地坪（底面取最低）的墙段 23 个
  ✓ 标高：底面 = 该段两端与中点 floorYAt 的**最低值** − 0.15 埋深，顶面 = 底面 + 墙高
  ✓ 门洞净空：实心盒不侵占 openings 区间；墙轴覆盖 = 实心段 ∪ 门洞（无丢失、无重叠加倍）
  ✓ registry 自动登记墙体图层；ctx.shared / zoneLayout 与图层是同一份派生结果
  ✓ 查询可用：墙体线上的点命中墙体盒，门洞中心点不命中墙体盒

[3. 去重：区域自补的院墙碰撞不产生双倍阻挡（量化 before/after）]
  · 去重 before/after：障碍总数 83 → 83；本次去重 E 25 + C 19 + 区域自定义 id 25 + layout 宫墙 4；累计 73 条（规则 {"id":44,"buildingId":29}）
  ✓ E 式自补（同 id）与 layout 式宫墙条目（buildingId=WALL-CITY）都会被去重，总数不变
  · 去重后 allObstacles() 共 83 条，同几何重复 0 条
  ✓ 去重后不存在"同一几何两份"：盒体两两不重合（去重规则兜底生效）
  ✓ 不产生额外绘制：墙体碰撞是纯数据（无 Object3D / 无 geometry / 无 material）
  · warning：E 自报了 25 条墙体碰撞盒，与 core 从 layout.WALLS 派生的结果重复；registry 会去重（保留 core 派生版本，不产生双倍阻挡/额外绘制）。建议区域改为消费 zoneLayout.wallColliders。
  ✓ 契约校验给出非致命 warning（区域自补同墙碰撞可被对账，但不算合约问题）

[4. 穿越判定（真实数据）：院墙阻挡 + 门洞通过]
  · 礼仪广场院南墙（CY-B-plaza-wall-south·owner B）沿 x=-94.5 跨墙：正向停于 z=-401.02、反向停于 z=-398.98，墙面 [-400.60, -399.40]，阻挡原因 ["CY-B-plaza-wall-south"]
  · 礼乐院南墙（CY-D-court1-wall-south·owner D）沿 x=-288.5 跨墙：正向停于 z=-393.02、反向停于 z=-390.98，墙面 [-392.60, -391.40]，阻挡原因 ["CY-D-court1-wall-south"]
  · 文华院南墙（CY-E-court1-wall-south·owner E）沿 x=113.5 跨墙：正向停于 z=-393.02、反向停于 z=-390.98，墙面 [-392.60, -391.40]，阻挡原因 ["CY-D-court1-wall-south"]
  · 礼仪广场院北墙（CY-B-plaza-wall-north·owner B）沿 x=-94.5 跨墙：正向停于 z=-181.02、反向停于 z=-178.98，墙面 [-180.60, -179.40]，阻挡原因 ["CY-B-plaza-wall-north"]
  · 内廷一进院北墙（CY-C-front-wall-north·owner C）沿 x=-94.5 跨墙：正向停于 z=140.98、反向停于 z=143.02，墙面 [141.40, 142.60]，阻挡原因 ["CY-C-front-wall-north"]
  ✓ ≥3 段院墙/宫墙两侧真实行走：全部被墙阻挡，绝不穿墙
  · 南段宫墙（WALL-CITY-south）门洞 at=0 净宽 26m：从 {"x":0,"z":-462} 穿到 {"x":0,"z":-448}（远侧墙面 -450.00）
  · 北段宫墙（WALL-CITY-north）门洞 at=0 净宽 26m：从 {"x":0,"z":446} 穿到 {"x":0,"z":460}（远侧墙面 458.00）
  · 西段宫墙（WALL-CITY-west）门洞 at=0 净宽 26m：从 {"x":-312,"z":0} 穿到 {"x":-298,"z":0}（远侧墙面 -300.00）
  · 东段宫墙（WALL-CITY-east）门洞 at=0 净宽 26m：从 {"x":296,"z":0} 穿到 {"x":310,"z":0}（远侧墙面 308.00）
  ✓ ≥3 个门洞两侧真实行走：门洞可通行（含南城门走查关键路径）
  · 走查 9 站均在墙体外（无站点被新碰撞盒封死）
  ✓ 走查路线完整性：FP_ROUTE 全部站点不落在任何墙体碰撞盒内
  ✓ 5 个 fp-spawn 出生点均不在墙体盒内（进入第一人称不会卡在墙里）
  · 单帧最大位移 0.73m < 院墙厚 1.2m（求解器只检查落点，此不等式是安全前提）
  ✓ 单帧最大位移远小于院墙厚度（dt 尖峰也不会穿墙）

---------------------------------------------------------
 通过 18 / 18
---------------------------------------------------------
```

> 说明：E 段的"阻挡原因"显示 `CY-D-court1-wall-south` 是因为 D 的礼乐院南墙与 E 的文华院南墙**同在 z=-392**（同一墙线、同厚度墙高），派生时已归并为一个组、两段实心盒；该盒的 `wallIds` 同时含 D 与 E 的墙 id，阻挡原因取代表墙（D）。物理正确，id 归并关系已在测试中断言。

### 2.2 量化对照（碰撞盒 / 双倍阻挡 / 绘制）

```text
旧：registry 障碍 = layout.OBSTACLES 81 条，院墙碰撞 0 条 → 第一人称可穿 56 段院墙（G1 D-5）
新：core 派生墙体碰撞盒 83 条（宫墙 8 + 院墙 75），覆盖 60/60 段墙；
    layout.OBSTACLES 81 条仍独立存在（不修改 shared），两者并集即 G 消费的障碍集合。
自补去重（实测，同一注册表）：
    C 自补 19 条 → 全部去重；E 自补 25 条 → 全部去重；layout 4 条宫墙条目 → 全部去重；
    allObstacles() before/after = 83 → 83（**不增加任何一条**，因此不存在双倍阻挡）
额外绘制：0 —— 墙体碰撞是纯数据对象（测试断言无 isObject3D / geometry / material），
    不进入任何区域 root，也不产生 InstancedMesh/合批项。
```

### 2.3 `node tests/run.mjs` / `node scripts/audit.mjs`

```text
node scripts/audit.mjs → exit 0（结论：全部预算与契约检查通过）
  主场景绘制调用 254 / 上限 350 ✓（B 58/70、C 49/50、E 40/40、F 61/80；D 未交付）
  可见三角面 242,929 / 上限 1,500,000 ✓；纹理 22 张 / 材质 86
  注：254 是 B/C/E/F 四个真实区域交付后的数字（t2 灰盒期为 46）；墙体碰撞盒不贡献任何批次。

node tests/run.mjs → 通过 10 / 10，失败 0，总耗时 22723ms（exit 0）
  PASS core-walls 495ms / core 1185ms / interaction 3665ms / kit 3867ms / layout 216ms /
       zone-east 1165ms / zone-forecourt 4077ms / zone-garden 1535ms / zone-inner 1152ms / zones 5365ms
  （收尾期间套件曾 9/10：红项在 core/interaction/kit/zone-forecourt 之间随成员并行工作转移，
   逐次核对均与本修复无关；成员测试落地后复跑即为上面的全绿。过程记录见 §4.5。）
```

---

## 3. 对 CONTRACTS §6.3 的补充建议（**未改 CONTRACTS**，交 foundation-lead 裁定）

1. **墙体碰撞归属**：建议在 §6.3 明确"宫墙/院墙的实心碰撞盒由 core 从 `layout.WALLS` 统一派生并进入 registry 的独立图层；
   区域返回的 `colliders.obstacles` **不得**再包含 `sourceType:'wall'` 的重复条目"（本修复按"允许但去重 + warning"实现，
   若定为硬约束，可在 `validateZoneResult` 把该 warning 升级为 problem，需 t1 递增 CONTRACTS 版本）。
2. **门洞语义**：建议明确"门洞 = 墙身缺口（`blocks:'all'` 的实心段之外的可通行区），
   不产生 `door` 字段、也不产生门楣碰撞盒"；本修复据此实现，避免与环境/第一人称对 `door.axis`
   的两种相反约定（建筑：正面法线轴；`layout.OBSTACLES` 的宫墙条目：墙的走向轴）互相冲突。
3. **`layout.OBSTACLES` 的 4 条宫墙条目**：其 `door.axis` 按"墙走向"书写，与第一人称求解器对建筑的解释相反
   （实测：按建筑语义解释时，整条 608m 宫墙在 26m 侧向带内都可穿越）。本修复用 core 派生盒替代其作用并去重掉这 4 条；
   建议 §6.3 补一句口径说明，或在后续 layout 版本中把该字段拆成 `wallAxis`/`doorLateralAxis`。
4. **墙脚标高**：建议明确"墙体碰撞盒底面取墙两侧 `floorYAt` 的最低值（并留埋深），
   避免①跨标高墙段漏缝、②B/C 交界（z=80）一侧悬空"。
5. **薄墙与单步位移**：第一人称求解器目前只检查**落点**（无扫掠检测）。安全前提是
   `fpMoveSpeed × fpRunMultiplier × dtMax(1/15s) = 0.73m < courtyardWallThickness 1.2m`。
   建议 §6.3 记下该不等式；若将来出现更薄的墙（如栏杆/影壁）或更大的 dt 上限，需要改成扫掠或保证厚度下限。
6. **`zoneLayout` 字段**：建议在 §3.2 的切片表补 `cityWalls / walls / wallColliders`（本修复已实现并测试），
   使区域作者不再自行从 `layout.WALLS` 反查（B/C/E 目前的绕过写法可逐步替换为消费 `zoneLayout.wallColliders`）。

---

## 4. 未验证项 / 已知限制

1. **浏览器内第一人称实走**：Node 侧用真实布局 + 求解器做了逐帧行走判定（5 段墙双向阻挡 + 4 个门洞通行，
   含南城门走查关键路径），但**没有**在浏览器里录制连续走查（属 t13/V2 的 G3 验收项）。
2. **D 区尚未交付**（`src/zones/west-courts.js`）：D 的院墙碰撞也已由 core 派生（25 盒，含 D 的 16 段院墙），
   但 D 区域的真实画面与"墙体视觉位置 vs 碰撞盒"一致性未验证（D 的探针在 Node 侧已通过）。
3. **区域自补墙盒的清理**：本修复采用"去重 + 警告"，B/C/E 源码里的自补逻辑仍然存在（未改他人文件）。
   建议后续由 t7/t11 改为消费 `zoneLayout.wallColliders`（或删除自补），届时 `dedupedObstacleReport()` 应归零。
4. **门楣碰撞**：门洞按"全高缺口"处理（不生成门楣盒）。若第一人称将来支持跳跃/俯仰头部检测，
   需要重新引入门楣盒（当前求解器不看障碍 `y0`，加门楣会误挡）。
5. **`tests/run.mjs` 全绿（收尾时已达成 10/10）**：套件里多名成员并行改测试，红项会随成员转移；最终复跑为 10/10 全绿。
   实测序列：`tests/core.test.mjs`（t9 的三处注释字面量误报，我已请 t9 修掉，现 PASS）→
   `tests/interaction.test.mjs`（ui-engineer 在建：先 30/43，后自绿 44/44）→ `tests/kit.test.mjs`（t22/t25 在建）
   → `tests/zone-forecourt.test.mjs`（t6 在建，稳定 31/33，两条失败均为"台阶朝向规范化 / kit 原生台阶翻转未检出"，
   与布局或碰撞无关）。已逐次核对：**没有任何一次失败涉及布局切片、registry 墙体图层或墙体碰撞**；
   唯一涉及注册表的断言 `assert(stats.obstacles >= 81)` 在本改动后仍成立且从未失败（墙体图层只会让该数字变大）。
   我自己的两条 verify 命令始终全绿（`node tests/core-walls.test.mjs` 18/18；`node scripts/audit.mjs` exit 0），
   并已直接与 ui-engineer 核对过其失败项；t6/t22/t9 的测试落地后复跑 `node tests/run.mjs` 即 10/10 全绿
   （本次修复的代码在此期间未做任何改动）。
6. **t21 文件争用**：t23 只改 `src/core/layout-slice.js`、`src/core/registry.js`、`src/core/context.js`
   与新增 `tests/core-walls.test.mjs`、本回执；未触碰 `src/core/renderer.js`、`tests/core.test.mjs`
   （t21 相关文件），也未触碰 `src/shared/**`、`src/zones/**`、`src/interaction/**`、`src/kit/**`。
