# handoff · t127 门洞净宽实测出口 `probeDoorClearance` + core pin 161（T2.30）

任务：`t127`（repair，attempt 1）· 执行者：core-engineer（attempt_id `828bee64-8de3-4979-9bf7-fdbdf643e4fb`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`src/core/layout-slice.js`、`tests/core.test.mjs`、本回执。**未触碰** `src/shared/**`、`src/core/environment.js`、`src/kit/**`、`src/zones/**`、`src/interaction/**`、`tests/layout.test.mjs`、`tests/verify-*.mjs`、`tests/zone-*.test.mjs`、`docs/CONTRACTS.md`。

---

## 1. 交付：`probeDoorClearance(slotId)`（公开导出）

`src/core/layout-slice.js` 新增两个导出（**复用谓词层 `obstacleBlocksPoint()`，没有第二套判定**）：

| 导出 | 返回 |
| --- | --- |
| `probeDoorClearance(slotId, opts)` | `number` = **门洞本体最长连续未阻挡净宽（米）**；无门/非 `exceptDoor` ⇒ `0`；**无效 slotId ⇒ `null`**（不静默当 0） |
| `probeDoorClearanceReport(slotId, opts)` | 逐项诊断：`{slotId, found, reason, doorWidth, doorAxis, bandHalfWidth, clearWidth, samples, blockedSamples, passable, blockedBy, facade, declaredBlockerResolved, approachBlockedAt, points[]}` |

口径（与 `insideObstacleDoor()` 的门带完全一致）：
- 门带横向 = **垂直于 `door.axis`** 的方向；带宽 = `door.width/2 − INTERACTION.player.radius`（`axis==='z'` ⇒ 横向 x）；
- 在 `door.center` 平面自 `−half … +half` **逐 `step`（默认 0.1m）** 采样，脚高取该点 `floorYAt()`（无面退 `door.sillY` ⇒ `y0`）；
- 每点用 `obstacleBlocksPoint()` 判阻挡，返回**最长连续未阻挡段长度**；
- **关键实现细节（本次踩到并写进代码）**：判定与“声明阻挡者”解析都必须用**基线障碍列表**（`assembleBaselineObstacles()` 的派生水体，进程内缓存一次）——raw `OBSTACLES` 里水体记录没有派生版 `bounds`，用它会把“被水体挡住的门”误读成可通行（我第一次实测 D/E-court3 因此得过错数 7.2m，改用基线后为 0）。

## 2. 真实读数（本次实测；`t77` 批评的“声明 vs 实测”现在两边都可测）

| slotId | door.width | 声明 passable | 实测门洞净宽 | blockedBy | 阻挡者可在碰撞层解析 | 门外接近路径实测阻挡位 |
| --- | --- | --- | --- | --- | --- | --- |
| `D-court3-pavilion` | 8 | **false** | **0** | `WB-D-pond` | ✓（`OB-WB-D-pond`） | ✓ 首个阻挡 z=**51** |
| `E-court3-pavilion` | 8 | **false** | **0** | `WB-E-pond` | ✓（`OB-WB-E-pond`） | ✓ 首个阻挡 z=**35** |
| `D-court4-pavilion` | 8 | true | **7.2**（≥ max(1.1, 4) ✓） | — | — | — |
| `B-pavilion-gate-west` | 8 | true | **7.4**（≥ 4 ✓） | — | — | — |

**全量逐条（63 个有门槽位，`core.test` 内自动跑）**：可通行声明 **61** 条全部满足 `净宽 ≥ max(1.1, width×0.5)`；显式声明不可通行 **2** 条（D/E-court3-pavilion）**同时**满足“门洞净宽 == 0”与“声明的阻挡者在门外接近路径上实测到阻挡”；**声明与实测不一致 0 例**。净宽区间 **0 – 25.4m**；全量耗时 ~0.4s（基线缓存后）。
> 说明：`t77` 报的 7.3–15.35 量级与本次一致口径（`door.width − 2×radius`：width 8 ⇒ 7.3、width 16 ⇒ 15.3），本卡 width 8 实测 7.2/7.4（含 0.1m 采样步长的量化差）。

## 3. core 侧冻结计数 pin 同步（LAYOUT 1.1.14 / `WALKABLE` 161）

- `tests/core.test.mjs` 的 pin：`assertEqual(LAYOUT.WALKABLE.length, 161, 'LAYOUT 1.1.14：可行走面 161 条（112 + 43 门外过渡台阶 t102 + 2 门槛面 t103 + 4 条 terrace 面 t126；kind 用既有 ground / terrace + id 后缀 -transition-N / -threshold）')`（**仍精确相等**，未改 `>=`/包含式）。
- 用例标题：`… 161 可走面 …；LAYOUT 1.1.14`。
- 组成自证同步：`byKind` 实测 `outerTerrain:4 / ground:58 / bridgeDeck:4 / gardenGround:1 / **terrace:8** / interior:43 / passage:43 = 161`；新增 `terrace === 8` 断言（t126 的 −1+5 净 +4 落在这里）；t108/t113 的组成自证（分项和 == 总数、`interior 43`、`passage 43`、`transition 43` 且 `kind==='ground'`、覆盖 18 栋、`threshold 2` 且 id/kind/`hasDoor`）**全部保留**。
- 版本标签同步（**仅文案，数值断言未动**）：`1.1.10` → `1.1.14`、`157` → `161`。
- grep 排查：`tests/core*.mjs` 中不再有按旧规模断言的 112/157；`tests/core-interior.test.mjs:83` 的 `z: 157` 是**坐标**不是计数（历史快照、非陈旧数字，且不在本卡 inScope）。

## 4. 断言只增不减

`tests/core.test.mjs`：用例 **43 → 45**（新增两条 t127 用例），`assert(` 调用 **88 → 91**；无删除、无弱化。
新增用例：
1. **探针语义**：无效 id ⇒ `null`、空串 ⇒ `TypeError`、真实无门槽位（`F-tower-corner-nw`）⇒ `0`；
2. **全量逐条实测**：63 个有门槽位，声明 `passable:true` ⇒ 净宽 ≥ 阈值；声明 `passable:false` ⇒ 净宽 0 **且** 阻挡者可解析 **且** 接近路径实测到阻挡；任一处不符即红（**把 t77 的批评落成断言：声明可被实测推翻**）。

## 5. verify（原样）

```text
$ node tests/core.test.mjs             → exit=0 · 通过 45 / 45
   · 语义：无效=null｜空串=TypeError｜无门(F-tower-corner-nw)=0 ✓
   · 63 类逐条：可通行 61 / 声明不可通行 2 / 共 63；净宽 0–25.4m
   · D-court3-pavilion width=8 passable=false 净宽=0 blockedBy=WB-D-pond 接近阻挡@51
$ node tests/core-environment.test.mjs → exit=0 · 通过 8 / 8
$ node scripts/audit.mjs --enforce     → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
项目级 `run.mjs` 未列入本卡 verify。

## 6. 未验证项 / 已知限制

1. **净宽 ≠ 可达性**：探针给的是“门洞本体净宽 + 门外接近是否被声明的阻挡者挡住”两项**几何/谓词**实测；`t77` 的端到端可达性（台阶高差/坡道）仍归 t77 与各区。
2. **脚高口径**：默认取采样点 `floorYAt()`（无面退 `door.sillY` ⇒ `y0`）；调用方可传 `feetY` 覆盖。若将来“门内地面/门外地面”高差被单独建模，需传入门内脚高才是“站在门里的净宽”。
3. **采样步长 0.1m**：净宽按步长量化（D-court4 实测 7.2 = 7.3 − 0.1 量化），未做亚步长插值。
4. **基线缓存**：`baselineObstacles()` 进程内缓存一次（布局为静态数据）；若未来支持运行时改布局，需加失效接口。
5. **本卡未改 `docs/CONTRACTS.md`**（契约文案归其持有卡）；探针的公开签名已在本回执 §1 写明，可由后续契约卡并入。
