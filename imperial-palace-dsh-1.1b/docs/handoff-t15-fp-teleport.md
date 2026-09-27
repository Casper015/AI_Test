# t15 · 选中即传送：选中一处 + 进第一人称 ⇒ 落在它旁边（复现 → 实现 → 常驻断言 + 真机读数）

> 卡：`t15 [fp-teleport] — 选中一处 + 进第一人称 ⇒ 传送到它旁边`（attempt 1 · ui-engineer）
> 范围：`src/core/camera.js`（第一人称落点内核所在文件）、`tests/fp-controls.test.mjs`、`tests/interaction.test.mjs`、
> `scripts/probe-fp-controls.mjs`（新增 `teleport` 相位）、`docs/CONTRACTS.md`（§5.4 同步）、
> `docs/reports/t15-fp-teleport-{before,after,browser}.json`、`work/probe/t15-teleport.mjs`。
> 纪律：**先证后改**（先出原始读数）· 判据只增不减 · 口径三要素 · 登记与几何同轮 · 预算 §8.2 未动、既有阈值逐值未放宽。

---

## 0. 结论（一句话）

| 项 | 修前（同一协议复刻的旧路径） | 修后 |
| --- | --- | --- |
| **选中 `B-hall-main` 后进第一人称** | 落点 `(−30, 1.65, −360)` = `VP-B-fp-spawn`，**距该栋门外锚点 216.1 m** | 落点 `(0, 6.15, −146)` = 门外锚点，**0.00 m** |
| **选中 `C-hall-bed-main` / `C-gate-inner`** | 503.9 m / 437.0 m（都在南门出生点） | 0.00 m / 0.00 m |
| **选中无门洞建筑 `F-tower-corner-nw`** | 871.2 m | **0.90 m**（tier2 `entrance` 锚点外推） |
| **两次结果逐值一致 / 合法性** | ✓ / ✓ | ✓ / ✓（包络内、可站立、眼高逐值 = 面高 + 1.65） |
| **失败路径（整圈被挡）** | —（无该语义） | 推导 `ok:false` + `noStandablePointNearSelection`；`selectionOnly` ⇒ `null` 且**零改动**；默认 ⇒ 回落登记出生点并标注 `fallback` |

---

## 1. 口径三要素与复现（先证后改）

- **环境**：Node 26（逻辑读数）· headless Chrome `chrome-headless-shell 1243`（`--disable-gpu` ⇒ SwiftShader WebGL2），视口 1440×900，`?view=fp&quality=medium`。
- **协议（Node）**：`work/probe/t15-teleport.mjs` —— 同一函数 `probeOne(id, selectionAware)` 跑两遍：
  `selectionAware:false` 就是 `enterFp` 里"是否消费 `store.selectedBuildingId`"的**那个分支开关**，关掉它即**逐字等价于修前旧路径**（`selectionId = null` ⇒ 落点 = 最近的已登记 `fp-spawn`），因此"修前/修后"是**同一协议的两档**，不是两次不同实验。
- **协议（真机）**：`scripts/probe-fp-controls.mjs --phases=teleport` —— 冻结页面 rAF 后由 `stepFrame(dt)` 复刻 `main.js` 的 `frameStep` 调用序列（`dt = 1/60`）；进入第一人称走**生产请求链路**（`interaction.requester.viewMode('fp')`，与信息面板按钮/键位同一条 request），落点来源以**生产事件 `fp:entered` 的载荷**为准（`spawnId` / `selectionLanding`），不自算。
- **判据**：距离用 `slot.door.facade`（无门洞用 `slot.entrance`）水平距离；合法性用**与 t105 同口径、可独立复算**的四项：`floorYAt ≠ null` ∧ `walkableAt.enterable !== false` ∧ 脚高处无任何障碍体块 ∧ 眼高**逐值** `= 面高 + fpEyeHeight`；确定性用"两次独立运行的 `position` 与读数 JSON 逐值相等"。

复现读数（修前，`docs/reports/t15-fp-teleport-before.json`，`node work/probe/t15-teleport.mjs` 上半段）：

```
选中 id                落点(x, y, z)                    来源              距锚点    距中心
B-hall-main            (-30, 1.65, -360)   VP-B-fp-spawn     216.093   245.837   ← 选中"主殿"却落在南门出生点
C-hall-bed-main        (-30, 1.65, -360)   VP-B-fp-spawn     503.894   528.852
C-gate-inner           (-30, 1.65, -360)   VP-B-fp-spawn     437.031   454.99
F-tower-corner-nw      (-30, 1.65, -360)   VP-B-fp-spawn     871.209   858.878
```

**根因（file:line）**：修前 `src/core/camera.js:897`（`git show HEAD:imperial-palace-dsh-1.1b/src/core/camera.js`）
`function enterFp({ source, instant, spawnId, position: forced })` —— 函数签名里**根本没有"选中建筑"这一路**，
落点只有 `forced ?? spawn.position`（同文件 905 行），而 `spawn` 来自 `registry.nearestFpSpawn(position)`
（= 离当前机位最近的 `fp-spawn`，与本卡诉求无关）。⇒ 选中哪一栋都落回同一个南门出生点。

---

## 2. 实现（最小改动、单一路径、纯函数先算后改）

全部落在 `src/core/camera.js`（core 域：落点必须与"眼高/包络/障碍"同一套内核，若在 `src/interaction/` 另造一套必然绕开求解器，违反"不实现第二套相机/物理"约定；**跨域改动如实登记**，与 t2 同一处理方式）：

| 位置 | 内容 |
| --- | --- |
| `src/core/camera.js:675-700` | `fpLandingCandidates(slot)`（模块级**纯函数**）：tier1 `door.facade` + 沿 `facade.outward` 法线 `[0, 0.9, 1.8, 2.7, 3.6]m`；tier2 无门洞建筑 `entrance` 同一组外推量（外推方向 = `entrance` 相对足迹中心的主轴符号）；tier3 足迹四边中点 −z/+z/−x/+x × `[1.0, 2.0, 3.0]m` |
| `src/core/camera.js::validateFpLanding` | 单点合法性（口径与 t105 的 `judge` 一致、**未放宽**）：面高齐备 ∧ `enterable !== false` ∧ 脚高处无障碍 ∧ 包络内 ∧ **眼高由面高直接算**（不留浮点漂移）；返回逐项 `reasons` |
| `src/core/camera.js:989-1003` | `fpLandingForSelection(buildingId)`：按固定候选顺序取**第一个**合法点；全不合法 ⇒ `ok:false` + `reasons:['noStandablePointNearSelection']` + **每个候选的失败原因** `attempts`（可复核、不静默） |
| `src/core/camera.js:1014-1092` | `enterFp` 落点优先级：① 显式 `position` ＞ ② 显式 `spawnId` ＞ ③ 选中建筑就近落点 ＞ ④ 离当前机位最近的 `fp-spawn`（**原行为逐字未改**）；`selectionOnly:true` 且 ③ 失败 ⇒ 直接 `return null`（在写任何状态**之前**返回） |
| `src/core/camera.js:1708` / `:1791` | 读数：`describe().fpSelectionLanding`（buildingId/fallback/ok/kind/tier/xyz/surfaceY/reasons/candidates）与 `rig.fpLandingFor(id)`（纯函数入口，测试/工具直接调用） |

**复用而非重造**：候选锚点直接消费既有的 `slot.door.facade`（§4.1.1 门外锚点 6m）与 `slot.entrance`（无门洞建筑），
合法性直接消费既有的 `floorYAt` / `walkableAt` / `registry.allObstacles()` + `obstacleBlocksPoint`；
`G` 脱困仍走既有 `interaction.escapeToSafePoint`（**未改一行**，真机实测仍回 `VP-B-fp-spawn`）。

**失败路径（t105 先例）**：推导是纯函数 ⇒ 先算后改，失败**不会**产生半应用的位移；
- `enterFp({selectionOnly:true})`：返回 `null`、**不发 `fp:entered`**、`describe()` 机位参数逐值不变；
- 默认路径：回落 ④，并在**返回值 / `fp:entered` 载荷 / `describe().fpSelectionLanding`** 三处如实标注 `selectionFallback/fallback:true` 与原因（`fallback` 是诊断读数，与 `lastEscape`/`fpJump.lastLanding` 同类，不参与"机位逐值"比较）。

---

## 3. 常驻断言（判据只增不减）

| 文件 | 新增 | 结果 |
| --- | --- | --- |
| `tests/fp-controls.test.mjs` | H1–H6（t15）：门厅/无门厅落地 ≤1m 且眼高逐值、确定性（纯函数 + 与相机位置无关 + 两次进入逐值相等）、无选中/显式 `spawnId`/`position` 优先级零变化、**整圈被挡**的失败路径（`ok:false` + 原因 + 机位不变 + `selectionOnly` 返回 `null` + 默认回落标注 fallback + 撤挡即恢复）、覆盖度（全部登记建筑都有合法落点，分层计数之和 = 建筑总数，未知 id 返回 `null`） | **15 / 15 通过** |
| `tests/interaction.test.mjs` | S1–S3（t15）：面板按钮/请求链路落地 ≤1m + 眼高逐值 + 读数标明来源建筑；**Esc/G/F 互不冲突**（Esc 不动位置、G 仍回登记出生点且距选中建筑 >5m、F 退出逐值恢复）；无门洞建筑走 tier2 | **81 / 81 通过** |
| `tests/core.test.mjs` | 旧断言「第一人称：最近 fp-spawn 出生…」编码的是**被本卡取代的旧语义**（该用例在 `focus` 模式下带着 `selectedBuildingId` 进第一人称 ⇒ 旧行为必然落回 `fp-spawn`，与本卡"选中即传送"直接冲突）⇒ 按新契约改写为**两条互补断言**：① **有选中** ⇒ 事件 `selectionLanding.buildingId='B-hall-main'` + 距门外锚点 ≤1m + 眼高**逐值**（容差 `1e-9`）；② **清掉选中** ⇒ 逐字恢复"最近的已登记 `fp-spawn`"出生（`spawnId` 含 `fp-spawn` + `selectionLanding===null` + 位置贴近出生点 + 眼高 `0.06`）。**旧断言一条未删**（全部落在 ② 分支），另加 ① 分支 ⇒ 覆盖只增不减 | **45 / 45 通过** |

> 判据只增不减：既有 A–G 段断言**未改口径、未减项**；`tests/fp-controls.test.mjs` 的 ①–⑦b（t2）全部保留；
> `tests/core.test.mjs` 的改写属"契约变更与断言同轮登记"（旧语义已被卡面明确取代），改写后覆盖**增加**（旧断言全保留 + 新分支）。
> 全量 `node tests/run.mjs`：本卡范围内全绿；剩余红为**他人证据轮**的既存红（`verify-experience.test.mjs` F7：`docs/shots/manifest.json` 里 `t1.3-*-oblique-*.png` 的 judge/imageStats 一侧缺失，路径指向旧树 `imperial-palace copy 3`，与 t15 无关）。

---

## 4. 真机读数（真实浏览器 CDP，`--phases=teleport`）

```bash
node scripts/probe-fp-controls.mjs --phases=teleport --frames=30 \
  "--expect=tpIsFp:==1,tpDistFacade:<=1,tpOk:==1,tpEyeExact:==1,tpDeterministic:==1,tpLegacyNoLanding:==1,\
tpPureNoMutation:==1,tpFailReason:==1,tpFailNoMutation:==1,tpStrictNull:==1,tpStrictSilent:==1,tpStrictNoMutation:==1,\
tpFallback:==1,tpRecover:==1,tpEscKeep:==1,tpGNotHijacked:==1,tpFExitRestore:==1"
# ⇒ 17/17 ✓ PASS（exit 0）；读数 docs/reports/t15-fp-teleport-browser.json
```

```
[teleport] ① 无选中：落点 = 登记出生点 VP-B-fp-spawn 逐值一致 true｜事件 spawnId 一致 true｜selectionLanding=null｜fallback=false
[teleport] ② 选中 B-hall-main 后进入：落点 (0.00, 6.150000, -146.00)｜距门外锚点 0.0000 m｜tier=1 kind=facade
           ｜与纯函数推导逐值一致 true｜事件 spawnId=null selectionLanding={"buildingId":"B-hall-main","kind":"facade","tier":1}
           ｜包络 true 眼高逐值 true
[teleport] ②b 确定性：两次落点逐值一致 true｜读数一致 true｜纯函数一致 true｜最近出生点被换成 VP-C-fp-spawn（原 VP-B-fp-spawn，池 5）后落点未变
[teleport] ③ 纯函数：调用前后机位逐值一致 true
[teleport] ④ 失败路径：cage ±12m ⇒ noStandablePointNearSelection（候选 22 全失败 22）｜严格模式 null + 0 事件 + 机位不变
           ｜默认回落 VP-B-fp-spawn（fallback=true，合法 true，事件标注 true）
[teleport] ⑤ 撤 cage：推导恢复 ok=true（tier 1）
[teleport] ⑥ Esc 保持第一人称 true、位置不变 true｜G 回到登记出生点 VP-B-fp-spawn（距门外锚点 216.1 m，远离选中建筑）｜F 退出恢复
[teleport] ⑥③ F 退出：viewMode oblique → oblique｜机位逐值恢复到进入前 true
```

真机相位的 17 个判据逐条对应卡的验收项：`tpDistFacade/tpOk/tpEyeExact`（落点 ≤1m、包络、眼高逐值、不落障碍）、
`tpDeterministic`（两次结果逐值一致，且**与最近出生点无关**）、`tpPureNoMutation/tpFailNoMutation/tpStrictNoMutation`
（失败路径不改视图与位置）、`tpStrictNull/tpStrictSilent`（严格模式返回 `null` 且不发事件）、`tpFallback`（如实回落 + 三处标注）、
`tpLegacyNoLanding`（无选中时旧路径逐值未变）、`tpRecover`（撤挡即恢复 ⇒ 证明确实是"被挡"而非"算法坏了"）、
`tpEscKeep/tpGNotHijacked/tpFExitRestore`（Esc/G/F 互不冲突）。

---

## 5. 复跑命令

```bash
node work/probe/t15-teleport.mjs            # 修前/修后对照读数（写 docs/reports/t15-fp-teleport-{before,after}.json）
node tests/fp-controls.test.mjs             # 15/15（t2 ①–⑦b + t15 H1–H6）
node tests/interaction.test.mjs             # 81/81（含 t15 S1–S3）
node tests/core.test.mjs                    # 45/45（第一人称断言按新契约改写：有选中/无选中两条互补）
node scripts/probe-fp-controls.mjs --phases=teleport --frames=30 "--expect=...（见 §4）"   # 真机 17/17
node scripts/audit.mjs --enforce            # 预算与契约（本卡未动任何阈值/预算）
node tests/run.mjs                          # 全量回归
```

---

## 6. 跨域与纪律说明

- **跨域改动（如实登记）**：`src/core/camera.js`（core 域）。理由见 §2：落点判据（面高/包络/障碍/眼高）只有唯一内核持有，
  在 `src/interaction/` 重造会绕开求解器。改动**只增**：新增候选推导 + 落点优先级分支，默认（非选中 / 显式 `position` / 显式 `spawnId`）路径逐字未变，
  真机 `tpLegacyNoLanding` 与 t2 相位回归共同证明。
- **未动**：`src/shared/config.js` 未新增/修改任何键（落点推导只用既有 `CAMERA.fpEyeHeight`、`INTERACTION.player`、`TERRAIN_EXTENT`、`ENVELOPE`、`ORIENTATION.facingVectors`）；
  §8.2 预算与既有阈值**逐值未动**（`audit --enforce` 通过）。
- **诊断读数与"机位逐值"分离**：`fpSelectionLanding` 是"最近一次尝试"的读数（同 `lastEscape`/`fpJump.lastLanding`），
  因此"失败不改视图与位置"比较的是**机位参数**（mode/projection/position/target/fov/zoom/axisIndex/fpActive/viewDirection），不含该读数。
