# handoff · T2.17 内核多内景支持：`interiorBoundsFor` 按机位解析 + `interiorViewpointId` 全链路（t65）

任务：`t65`（repair，attempt 1）· 执行者：core-engineer（attempt_id `b4d61303-f573-4c3a-9a7a-0c0178842d77`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
依赖：t72/t73/t74（LAYOUT **1.1.3**，全区 43 个内景：`WK-<slotId>-interior` / `VP-<slotId>-interior` / `WP-fp-*` / `visititble` / `INTERIOR_BY_SLOT` 显式映射）

---

## 0. 开工回执

```text
来源（内核缺口）：旧 `interiorBoundsFor(area)` 只按 `zone` 过滤 `WALKABLE(kind:'interior')` 取**第一个**面。
      t72/t73/t74 之后一区多内景（实测 zone B 10 个、C 9 个、D 8 个、E 9 个、F 7 个）⇒ 按区夹取会把相机
      夹到**别的建筑**的室内盒里（在 B 区实测：金銮殿机位被夹到 `WK-B-gate-front-interior` 的通道盒里）。
必做：① 按机位/地面显式寻址（同区多内景各自正确）；② `store.view.interiorViewpointId` 全链路（不按 area 猜，
      缺失/无效时明确回退 + 告警）；③ FP 从门洞进出任意内景、进出逐值恢复；④ 不变量与既有测试不退化。

可写范围（已严格遵守）：src/core/camera.js、src/core/layout-slice.js、src/core/state.js、
      tests/core-camera.test.mjs、tests/core-collision.test.mjs、docs/handoff-t2-interiors.md。
未触碰：src/shared/**、src/kit/**、src/zones/**、src/ui/**、src/interaction/**、src/main.js。
```

---

## 1. 交付

### 1.1 `src/core/layout-slice.js`（新增解析层，纯只读）

| 导出 | 作用 |
| --- | --- |
| `interiorRecordForViewpointId(id)` | `VP-…` → `{slotId, walkableId, viewpointId, fpId, groundY}` |
| `interiorRecordForSurfaceId(id)` | `WK-…` → 同一条记录 |
| `interiorRecordForSlot(slotId)` | 建筑 slotId → 记录 |
| `interiorSurfaceById(id)` / `interiorViewpointById(id)` | 精确取面/机位（不模糊匹配） |
| `interiorsForZone(zone)` / `interiorViewpointsForZone(zone)` | 该区的面/机位（**按 id 排序**，确定性） |
| `INTERIOR_SURFACE_COUNT` | 内景面总数（当前 **43**） |

### 1.2 `src/core/camera.js`

1. **`interiorBoundsFor(target)` 改为显式寻址**（顺序）：
   - `{ viewpointId }` / `{ surfaceId }` / `{ slotId }` ⇒ 该内景**自己的**盒；
   - 直接字符串 `'WK-…'` / `'VP-…'` ⇒ 同上；
   - **legacy** 字符串区名（`'B'`）⇒ 该区 legacy 别名机位（`VP-<area>-interior`）对应的内景；一区多内景时
     `ambiguous: true` + `console.warn`（**不再静默取第一个面**）；
   - 无效 id ⇒ **返回 `null`**（不静默换一个内景）。
   返回体新增 `resolvedBy` / `slotId` / `viewpointId` / `ambiguous`（便于断言与工具消费）。
2. **`interiorSpecFor(viewpoint)`**：先按 `{viewpointId: viewpoint.id}` 解析自己的盒，解析不到才退回按区（告警）。
3. **`defaultSpecFor('interior')`**：以 `store.view.interiorViewpointId` 为**唯一权威**；缺失/无效时按
   `interiorSlotId` → legacy 别名 → 该区首个内景的顺序回退，并 `console.warn` + 计数（`INTERIOR_ADDRESS_STATS`）。
4. **可观测**：`rig.describe()` 新增 `interiorViewpointId` / `interiorSlotId` / `interiorResolvedBy`；
   `exitFp()` 一并恢复寻址；导出 `INTERIOR_ADDRESS_STATS`（`byViewpointId/bySurfaceId/bySlotId/zoneLegacy/zoneAmbiguous/misses/fallbackNoId/fallbackBadId`）与 `describeInteriorTarget()`。

### 1.3 `src/core/state.js`

- `store.view` 新增 `interiorSlotId` / `interiorArea`（`interiorViewpointId` 原已存在）；
- `requestViewMode` 请求负载支持携带 `viewpointId` / `interiorViewpointId` / `slotId` / `buildingId` / `area`
  ⇒ 控制器只搬运**标识符**（不 import layout，保持"零 three/零 layout"），解析归相机 —— 这样键盘/UI/导览
  三条输入与相机之间是**同一条链路**，不存在"按 area 猜机位"的第二条路径。

---

## 2. 证据

### 2.1 同区两内景各自正确（新回归用例）

```text
$ node tests/core-camera.test.mjs
 通过 14 / 14        （t65 前 9 / 9；断言只增不减）
```
- `VP-B-interior`（金銮殿）→ `WK-B-hall-main-interior`（x −36..36、z −134..−98、y 4.5、slot `B-hall-main`）
- `VP-B-hall-mid-interior`（**同区 B**）→ `WK-B-hall-mid-interior`（x −25.4..25.4、z −33.4..−6.6、y 2、slot `B-hall-mid`）
- 两盒**不同**；各自机位在**自己**盒内，且 B-hall-mid 机位**不在**金銮殿盒内；
- `{slotId}` / `{surfaceId}` / `'WK-…'` / `'VP-…'` 四种寻址与 `{viewpointId}` **完全等价**；
- 无效 id → `null`。

### 2.2 旧实现必失败（突变证明，实跑）

把 `interiorBoundsFor` 临时替换回"按 zone 过滤取第一个面"，跑同一套用例：

```text
  ✗ 同一 zone 内两个内景：按 viewpointId 解析得到**不同且各自正确**的包围盒：
      同区两内景必须得到**不同**的盒（实际 hall=WK-B-hall-main-interior mid=WK-B-hall-main-interior）
  ✗ slotId / surfaceId / 直接 WK-/VP- id 三种显式寻址与 viewpointId 等价
  ✗ 全链路：interior 请求携带 viewpointId ⇒ …：盒应归属请求指定的建筑：期望 "B-hall-mid"，实际 undefined
  ✗ 次级来源：只给 slotId 时…：应按 layout 映射解析出该建筑的内景机位：期望 undefined，实际 "VP-C-interior"
 通过 10 / 14
```
还原后回到 **14 / 14** ✓（突变仅用于取证，未留在代码里）。

### 2.3 全链路与回退

| 用例 | 实测 |
| --- | --- |
| `requestViewMode {mode:'interior', viewpointId:'VP-B-hall-mid-interior'}` | `store.view.interiorViewpointId` 立即等于该 id；settle 后 `describe().interiorViewpointId` 相同、盒归属 `B-hall-mid`、位置/目标都在该盒内 |
| 只给 `slotId:'C-hall-bed-main'` | 解析出 `VP-C-interior`（layout 映射），盒 = `WK-C-bed-interior` |
| 缺 id | 回退到 legacy 别名（`fallback(area=B,legacy-alias)`），`fallbackNoId` 计数 +1，**明确 console.warn** |
| 无效 id（`VP-根本不存在`） | `fallbackBadId` +1、回退到已登记机位、**绝不把无效 id 当作实际机位** |

### 2.4 第一人称进出内景（真实碰撞数据）

```text
$ node tests/core-collision.test.mjs
  ✓ 同一 zone 两个内景：FP 从各自门洞进出，位置落在**自己**的室内盒内（不串到另一栋）
  ✓ 内景不可穿墙、不掉出：以真实碰撞数据四向行走，越出盒子的点必须落在门洞内
```
- 金銮殿 与 B-hall-mid（同区）各自：进入 FP（站在该内景室内中心）→ 退出 FP → `mode`/`interiorViewpointId`
  与 `position(x,y,z)`/`target(x,y,z)`/`fov` **逐值恢复（`assertClose(..., 1e-6)`）**；
- 四向各 40 步（共 160 步，`createFpSolver` + `registry.allObstacles()`）：**掉出可行走面 0 次**；
  走出室内盒的采样点**全部**落在门洞净空内（`insideObstacleDoor`），其余方向被墙拦住 ⇒ 不穿墙、不掉出。

### 2.5 verify（`run.mjs` + `audit`）—— **如实列出仍红项与外部归因**

```text
$ node tests/run.mjs    → exit=1；通过 7 / 20（失败 13）
    FAIL：core.test / core-collision / core-interior / core-walls / interaction /
          verify-completeness / verify-experience / zone-east（… 等）
$ node scripts/audit.mjs → exit=0，但结论行：**6 项未通过**；
    主场景绘制调用 293/350 ✓、可见三角面 288,789 ✓（预算项自身通过，与 t58 逐值相同）
```
**归因（非本卡）**：
1. **`kind:'passage'` 契约漂移（主导）**：layout 新注册的门洞通道面（`WK-*-door-passage`，实测 B 区 10 条）
   在 `src/core/context.js:71` 的 `WALKABLE_KINDS` 白名单之外 ⇒ 区域契约校验报
   `…kind 非法：passage（合法：ground/terrace/interior/bridgeDeck/gardenGround/outerTerrain）`；
   `core.test` 的 43 项问题、`core-collision` 的 4 条红、`zone-*` 的红都由此而来。
   **注意 `src/core/context.js` 不在本卡 inScope**（inScope 只有 camera/layout-slice/state + 两个 core 测试 + 回执）
   ⇒ 我未改，仅上报。修法很小：把 `'passage'` 加入 `WALKABLE_KINDS`（需 context.js 的负责人执行）。
2. **`core.test` 的"B/C 各 1 个 interior 机位"期望 2 / 实际 43**：测试里的旧硬编码期望与 1.1.3 的 43 内景冲突
   （`tests/core.test.mjs` 不在本卡 inScope）。
3. **`core-walls.test.mjs` / `core-audit.test.mjs` 直接 `MODULE_NOT_FOUND`**（import 的模块被并发重命名/删除）⇒ 环境态问题。
4. **`audit` 的 6 项未通过**：日志可见的失败集中在 **LOD/质量档**族
   （`相机距 60m/260m → 激活档 … 与单档逐值相等：✗`、`单档 near/mid/far = 264/252/72 批次`），
   属并行中的质量档/LOD 工作；本卡改动只涉及内景寻址与 state 视图记录，**不触及 LOD/质量档代码路径**。
5. `interaction.test` / `verify-*` / `zone-*` 的红同样指向 layout/zone 侧数据与 UI 面板内容（t58 已 A/B 归因过同类红）。

---

## 3. 未验证项 / 已知限制

1. **`core.test` 未回到 43/43**：阻塞在 `kind:'passage'`（context.js，inScope 之外）与测试内旧硬编码期望；
   本卡在 `tests/core-camera.test.mjs` / `tests/core-collision.test.mjs` 内的新增断言**全部通过**，且**未删除任何断言**。
2. **FP 进入用的是强制站位**（`enterFp({position: 室内中心})`）而非真实门洞行走：
   真实走查路径的连通性由 `verify-completeness`/`zone-*` 与 t66 端到端承担；本卡证明的是**进出与恢复语义**与
   **室内行走不穿墙/不掉出**。若要"从门洞一路走进内景"的端到端证据，建议由 t66 的浏览器走查卡承接。
3. **legacy 按区口径保留**（`interiorBoundsFor('B')` 等），仅为兼容既有调用与 `core.test`；一区多内景时会 warn + `ambiguous`。
   建议 CONTRACTS 明确"消费方必须传显式寻址"（见 §4）。
4. **未覆盖全部 43 个内景**逐一的盒正确性：用例覆盖 B（两个同区内景）、C（slotId 次优来源）+ 四种寻址等价性；
   其余由 layout 侧 `INTERIOR_BY_SLOT` 的交叉断言保证（t73/t74 已做）。
5. **`kind:'passage'` 的内景语义**（门洞通道面是否应算 `interior` 还是新 `passage` 类）未定：本卡按现状不改，
   若 context.js 采纳 `'passage'`，`interiorBoundsFor` 无需改动（它只消费 `kind === 'interior'`，通道面走 `WALKABLE` 供 FP 抽稀）。

---

## 4. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§6.4 / §12 补充：内景寻址必须显式**
> 1. `interiorBoundsFor` 的**唯一合法入参**为 `{ viewpointId }` / `{ surfaceId }` / `{ slotId }`；
>    区名入参仅作 legacy 兼容，一区多内景时必须告警且不得被消费方依赖。
> 2. `store.view.interiorViewpointId` 是 interior 模式的**唯一权威**来源；缺失/无效时相机必须回退**并告警/计数**，
>    不得静默按区取机位。
> 3. 一区多内景的回归必须包含"同区两内景盒不同且各自正确"的断言（本卡已加）。
> 4. `WALKABLE_KINDS` 与 layout 新增的可行走面 kind 必须同步（当前 `passage` 漂移即为反例）。

---

# 5. attempt 2 复核与补强（执行者 zone-forecourt · attempt_id `93a05d5f-a88b-477a-a0eb-19f2b6598dbd`）

> attempt 1（core-engineer）的实现与回执已在上面 §0–§4；本次接手时 `LAYOUT_VERSION` 已从 1.1.3 推进到 **1.1.10**
> （t97 门 `sillY` 与区域地坪统一、t102 门外过渡台阶登记、t103 10 座开敞亭可通行化），attempt 1 §2.5 记录的
> `kind:'passage'` 漂移、6 项审计未通过等**已由后续卡关闭**。本轮只做**独立复核 + 补强证据 + 如实归因**，未改共享数据。

## 5.1 开工复核（attempt 2 逐条实测，不引用 attempt 1 结论）

| 项 | 实测（本轮） |
| --- | --- |
| `interiorBoundsFor` 显式寻址 | `{viewpointId}`/`{surfaceId}`/`{slotId}`/裸 `'WK-…'`/裸 `'VP-…'` 五种入参等价；无效 id → `null`（不静默换内景） |
| 一区多内景 | B 区 10 个内景各自解析到自己的 `WK-*`；legacy `interiorBoundsFor('B')` 标 `ambiguous:true` 并告警 |
| `store.view.interiorViewpointId` | 请求 `viewpointId`/`slotId`/`buildingId` 三条 UI 负载都能落到该建筑自己的机位；缺失→`fallbackNoId`+warn，无效→`fallbackBadId`+warn |
| 43 栋映射 | `slotId ⇄ viewpointId ⇄ WK 面` 逐条一致（43/43，`ambiguous=false`） |
| 43 栋进出 | 可站立 43/43；自登记入口外 1.2m **真实走入** 41/43（2 栋例外见 §5.3）；四向 14,880 步 0 穿墙 0 掉出 |
| 不变量 | 唯一 renderer/composer/scene/循环由 `core.test` §1 静态扫描覆盖（43/43 ✓） |

## 5.2 本轮新增断言（**只增不减**：core-camera 20→**23**、core-collision 24→**26**）

1. `core-camera.test.mjs` · **突变证明（机器校验）**：在测试内**真实还原**旧实现（按 zone 过滤 `kind:'interior'` 取第一个面），
   断言旧实现给两个机位**同一个盒**、且"同区两内景盒必须不同"这条断言在旧实现下**实跑失败** ⇒ 不靠人工叙述。
2. `core-camera.test.mjs` · **43 栋全量映射**：每个 `slotId` 解析出的面/机位/归属与 `INTERIOR_BY_SLOT` 逐条一致，机位反查同一条记录。
3. `core-camera.test.mjs` · **UI 实际负载**：只给 `buildingId`（`interaction` 的进殿负载形状）⇒ 经 layout 映射进入该建筑自己的内景。
4. `core-collision.test.mjs` · **43 栋逐栋真实走入**：`createWalkSolver` + `createWalkGraph`（真实碰撞数据）从登记入口外 1.2m 走到室内中心；
   入径不得经过**任何其他内景的室内盒**（一区多内景最易错的"串栋"）；2 栋已知冲突**显式断言其确实走不进且原因是台基落差**（不得静默跳过）。
5. `core-collision.test.mjs` · **43 栋四向真实走查**：0.25m 小步 × 43 栋 × 4 向 = **14,880 步**，掉出室内面 0 次；
   越出室内盒的采样点**全部**落在门洞净空带内（其余方向被墙拦住）⇒ 不穿墙、不掉出。

## 5.3 证据（原样输出）

```text
$ node tests/core-camera.test.mjs
  · 突变证明：旧实现(B) → WK-B-hall-main-interior（两机位同盒，且 VP-B-hall-mid-interior 必错）；
    新实现 → WK-B-hall-main-interior / WK-B-hall-mid-interior；旧实现下"两盒不同"断言实跑失败=true
  · 43 栋 slotId ⇄ viewpointId ⇄ WK 面 三条寻址逐条一致；INTERIOR_SURFACE_COUNT=43
  · buildingId=D-court1-hall ⇒ VP-D-court1-hall-interior（box=WK-D-court1-hall-interior，
    resolvedBy=store.view.interiorSlotId(D-court1-hall)）
  · 回退链：缺 id→…（fallback(area=B,legacy-alias)）；无效 id→…（已登记机位，fallbackBadId 计数）
 通过 23 / 23        ← 本轮真实执行（exit 0）

$ node tests/core-collision.test.mjs
  · 真实走入内景 41/43（例外 B-side-west-main 阶差 1.5m / B-side-east-main 阶差 1.5m：layout 台基贴门洞，见 §2.4）
  · 43 栋 × 4 向 × 0.25m 小步 = 14880 步：无穿墙、无掉出（越出室内盒的采样点全部落在门洞净空内）
  · 同一 zone 两个内景：FP 从各自门洞进出，位置落在**自己**的室内盒内（不串到另一栋）
 通过 26 / 26        ← 本轮真实执行（exit 0）
```

### 5.3.1 源码级突变证明（临时改源码，跑完立即还原）

把 `src/core/camera.js` 的 `interiorBoundsFor` 临时替换为旧按区实现（按 zone 取第一个 `kind:'interior'` 面）：

```text
  ✗ 同一 zone 内两个内景：… 同区两内景必须得到**不同**的盒
      （实际 hall=WK-B-hall-main-interior mid=WK-B-hall-main-interior）
  ✗ 突变证明：…：新实现必须给出两个不同的盒
  ✗ slotId / surfaceId / 直接 WK-/VP- id 三种显式寻址与 viewpointId 等价：
      无效机位 id 应明确返回 null：期望 null，实际 {…"resolvedBy":"zone-legacy(OLD-MUTATION)"…}
  ✗ 全链路：…：盒应归属请求指定的建筑：期望 "B-hall-mid"，实际 null
  ✗ 次级来源：只给 slotId 时…：期望 undefined，实际 "VP-C-interior"
 通过 15 / 21
```

还原：`cp` 回备份 + `diff -q` 一致 + `shasum -a 256` = `c83047de8a9cd5eb453a8f7688929aeb8a437fe5dfe1764e20bc3f42728bb6dc`（与突变前**逐字节相同**），
`grep -c OLD-MUTATION src/core/camera.js` = **0**，重跑回到 **23 / 23** ✓。

## 5.4 不变量与门禁（本轮实测）

```text
core.test         exit=0  通过 43 / 43      （含 §1 唯一 renderer/composer/scene/循环 静态扫描）
core-camera       exit=0  通过 23 / 23
core-collision    exit=0  通过 26 / 26
core-walls        exit=0  通过 18 / 18
core-audit        exit=0  通过 10 / 10
node scripts/audit.mjs  exit=0
   主场景绘制调用   : 333 / 上限 350  ✓
   分区 B/C/D/E/F  : 62/70 ✓ · 55/60 ✓ · 49/56 ✓ · 49/56 ✓ · 72/80 ✓   （t84 重分配后的配额）
   可见三角面       : 306737 / 上限 1500000  ✓
   结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```

## 5.5 `node tests/run.mjs`：**14 / 22，8 条红灯 —— 全部非本卡（如实列出与归因）**

| 红灯 | 实测原因 | 归属 |
| --- | --- | --- |
| `zone-forecourt` | 测试内固定计数已过期：`可行走面数 期望 27，实际 51`（layout 1.1.10 为 B 区新增门槛/过渡台阶面）；另 1 条"从地坪可走入门内 ≥4 栋"实测 3 | **zone 卡**（t62 遗留固定值，需随 1.1.10 更新；t65 inScope 不含 zone 测试） |
| `zone-west` / `zone-east` / `zone-garden` / `zone-inner` | 同类固定计数/机位期望与 1.1.10 不一致 | zone 卡 |
| `kit.test` | ① 统一旧化 `roughnessBias` 期望值（`glazeTile 期望 0.46 实际 1` 等 6 条）；② 10 座亭现在 `no-opening`（t103 可通行化）与 t69 期的期望冲突 | kit/config 卡 |
| `verify-completeness` | §5.3 南桥起点→43 内景机位的**连通分量**仍不闭合（台明台阶数据缺口；本卡 §5.2-4 已证明"入口外 1.2m 可步入"41/43）；§5.4b `y ≠ door.sillY` 仅剩 5 栋（C-gate-inner + F 四城门，属 t72 通道口径） | layout 卡（t102 已登记门外过渡台阶，连通性未闭合） |
| `verify-experience` | F1 24 张渲染判据 + B1/B4/B10 走查路线连通性（与上同源） | 渲染/layout 卡 |

**本卡相关面全绿**：`core*` 五个测试套件 + `audit`；上表 8 条红灯的原因均在 `src/shared|kit|zones|ui|interaction`（本卡 out of scope）。
本轮**未触碰**任何 inScope 之外文件（`git`-less 环境下以 `shasum` 证明 `camera.js` 逐字节还原）。

## 5.6 遗留 / 未验证（不得当作已验证）

1. **"从院落地坪/南桥一路走进内景"**仍未闭合（台明台阶数据）：本轮证明的是"**入口外 1.2m 可真实步入**"41/43 与"门洞轴线↔室内连通"
   （`core-collision`），以及 2 栋已知冲突（B-side-west/east-main 阶差 1.5m）。端到端连续走查归 t66/t13。
2. **legacy 按区口径保留**（`interiorBoundsFor('B')`）：一区多内景时告警 + `ambiguous`，但仍是可调用路径；建议 CONTRACTS 明确消费方必须显式寻址（见 §4）。
3. **浏览器内实际进殿体验**（UI 点击 → `enterInterior`）未在本卡跑端到端截图；本卡证明的是同一事件链上的状态/机位/夹取与碰撞（core 层）。
4. **54 格以外的性能数字**：audit 报告主场景 333/350、可见三角面 306,737；帧率类指标归 t13/t14。
5. **`run.mjs` 的 8 条红灯**已逐条归因，但修复需各卡（zone/kit/layout/verify）执行；本卡未越界修改。
