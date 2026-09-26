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
