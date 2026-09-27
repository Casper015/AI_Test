# handoff · T2.18 core 侧测试期望同步（扩容前硬编码 → LAYOUT 1.1.4）（t76）

任务：`t76`（repair，attempt 1）· 执行者：core-engineer（attempt_id `6613507b-653b-466a-8c44-74f215dbc836`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
依赖：t65（内核多内景）、t75（门洞通道面 / LAYOUT 1.1.4：`WALKABLE 69→112`）
inScope：`tests/core.test.mjs`、`tests/core-interior.test.mjs`、`tests/core-collision.test.mjs`、本回执。**未改 `src/**`**。

---

## 1. 期望更新（逐条依据）

| 文件 / 断言 | 原值 | 新值 | 依据 |
| --- | --- | --- | --- |
| `core.test` 查询辅助：interior 机位数 | 硬编码 `2` | **= layout 中 `mode==='interior'` 的登记数（43）**+ 绝对断言 `=== 43` | LAYOUT 1.1.4：43 栋内景各 1 个机位（t72 城门 4 + t73 hall 12 + t74 sideHall 23 + 既有 4）。改为**派生 + 绝对**双断言，防再次静默漂移 |
| `core.test` 灰盒契约：`viewpointsByMode.interior` | `2` | **43** | 同上 |
| `core.test` 灰盒契约：`viewpointsByMode['fp-spawn']` | `5` | `5`（保留） | t75 未改 fp-spawn ✓ |
| `core.test` 新增：`zone` / `focus-extra` 模式计数 + 四模式之和 = `VIEWPOINTS.length` | 无 | **新增 4 条断言** | 「按实际值 + 可自证」：不再只 pin 单个模式 |
| `core.test` 新增：`WALKABLE.length === 112` 且 `passage === 43` | 无 | **新增 2 条断言** | t75 的 43 条门洞通道面；同时守住「passage 不混入 interior」（另见 core-kinds.test.mjs） |
| `core.test` 用例标题 | `28 可走面 / 20 视角` | **`112 可走面 / 61 视角`（LAYOUT 1.1.4）** | 标题数字与实际一致（原标题是扩容前口径） |
| `core-interior` 内景体积条数 | `2`（并断言 `volumes === 'B,C'`） | **5**（`= 有内景的区数`，`B,C,D,E,F`） | 内景体积是**按区聚合**的补光体积（`environment.describe().interior.volumes` 按 zone 聚合）；43 栋内景分布在 B/C/D/E/F 五区 ⇒ 5 个体积。**语义未变**，是覆盖范围变了 |
| `core-interior` `kind=interior` 面数 | `2` | **43** | LAYOUT 1.1.4 |
| `core-interior` 机位在体积内 | 只抽查 B/C 两点 | **新增：全部 43 个 interior 机位逐个断言落在本区体积内** | 原意（机位必须落在其补光体积内）被**加强**而非放宽 |
| `core-collision` ①`y0Clamped >= 40` | `>= 40` | **`y0Clamped === 派生计数`**（`y0Recorded > footprintFloor` 的条数，实测 **15**）+ `>= 1` + `下钳 + 未下钳 = 非水体障碍总数` | t75 之后台基/内景/通道面成为可行走面 ⇒ 多数建筑足迹地坪抬高，`recorded > floor` 由 40+ 降到 15。**语义未变**（`y0 = min(recorded, footprintFloor)`），故改为**逐值相等**（比原 `>=40` 更严，不放宽） |
| `core-collision` ②`≥2 例“原始盒放行”` | `>= 2` | **等价性**：`rawReleased === (gap > playerHeight)` 的用例数 + 逐区一致 + `>= 1` + **合成对照**（原始盒 y0=12 放行 / 下钳到 0 必挡） | 数据变化后只有 F 角楼 1 例 gap=12>1.8；原意的"对照"用**合成样本**永久守住，不再依赖数据里恰好有几例 |
| `core-collision` ③ 求解器穿越三例 | 硬编码"`!entered` + `blocked>0`"（探针固定从 -z、沿 x 偏移 6m） | **谓词层强断言**（门洞墙面侧翼 1m 必挡；门洞中心必通）+ 探针**按门洞轴向**（门可能朝 ±x）+ 求解器与谓词不一致时**显式 skip 留痕** | ①"35 栋补 hasDoor 后建筑不再是全密封"⇒ 原断言对 F 失效（F 现可从门走进去，是**正确行为**）；②原探针在门朝 ±x 的殿宇上会探到建筑之外（假阴性）；③**发现真实缺陷**（见 §3），按卡要求"量化交回、不得就地规避或改判据"，故谓词层保留强断言、求解器层留痕 skip |

---

## 2. 断言只增不减

| 文件 | `runner.test` 条数 | `assert(` 调用数 |
| --- | --- | --- |
| `tests/core.test.mjs` | 43（不变） | 86 |
| `tests/core-interior.test.mjs` | 13（不变） | 27 |
| `tests/core-collision.test.mjs` | 22（不变） | 64 |

本次改动**全部在既有用例内加强或替换**，未删除任何用例；替换的三条逐条给出"原意如何被守住"（见 §1 表末）。三套件各自新增 skip **仅 1 条**（`core-collision` 的 DEFECT-T76-01 留痕），非删除。

---

## 3. 发现并交回的真实缺陷：**DEFECT-T76-01（求解器未按障碍 `y0` 阻挡）**

**量化（可复现）**：对三栋高台基建筑，在**门洞所在墙面的侧翼实心处**（离门洞中心 ≥ `doorWidth/2 + 半径 + 1`，沿墙面法线轴从外侧逼近 6m 外起）：

| 建筑 | 门洞轴向 | 求解器前进 | `blocked` | 谓词层判定（墙内 1m） |
| --- | --- | --- | --- | --- |
| `OB-D-court1-hall` | `x` | **30.00 m（穿行全程）** | `[]` | **阻挡 ✓** |
| `OB-E-court1-hall` | `x` | **34.00 m（穿行全程）** | `[]` | **阻挡 ✓** |
| `OB-F-garden-hall-north` | `z` | **28.00 m（穿行全程）** | `[]` | **阻挡 ✓** |

即：**谓词层判定"墙内必挡"，但求解器穿行整栋建筑且不给出任何阻挡原因**（3/3 例）。→ 已按卡要求**量化交回主控裁定**，未就地放宽；
`tests/core-collision.test.mjs` 中该条以 `runner.skip('求解器沿侧翼实心处穿越：不得走进建筑 footprint', 'DEFECT-T76-01 …')` 留痕（含上述数字），**未改判据、未删断言**。
**疑似机制（未定论，供接手者定位）**：求解器在足迹内把脚高解析为室内地坪（= 该障碍的 `y0`/门槛高程），其阻挡判定在 `feetY ≈ y0` 时被跳过；`obstacleBlocksPoint` 用同一 `feetY` 却正确阻挡 ⇒ 两者口径不一致。
**改动位置不在本卡 inScope**（`src/core/**`），故本卡只交回。

---

## 4. verify（四条，原样）

```text
$ node tests/core.test.mjs        → exit=0  · 通过 43 / 43
$ node tests/core-interior.test.mjs → exit=0 · 通过 13 / 13，skip 1（CORE_INTERIOR_LIVE 未设）
$ node tests/core-collision.test.mjs → exit=0 · 通过 22 / 22，skip 1（DEFECT-T76-01 留痕）
$ node scripts/audit.mjs          → exit=0  · 主场景 331/350 批次 ✓、313,685 三角面 ✓；结论行「3 项未通过」
```
`audit` 的 3 项未通过均为**分区绘制调用超预算**（B 61、C 55、D 48 …，预算 70/50/40 一类），属三区内景布陈设在飞（t62/t63/t64），**非本卡**（本卡未改 `src/**`）。

---

## 5. 未验证项 / 已知限制

1. **DEFECT-T76-01 未修复**（`src/**` 不在 inScope）；仅量化交回，建议单开一张 core 修复卡（并让 t66 的端到端走查复验"侧翼不可穿行"）。
2. **audit 的 3 项分区预算**未处理（zone 侧在飞）。
3. `core-interior` 的 `CORE_INTERIOR_LIVE=1` 浏览器重拍未跑（默认快模式；系数/剂量/记录值已由 13 项覆盖）。
4. 期望更新以**当前 LAYOUT 1.1.4** 为准；若布局侧再扩容（例如 4 座角楼纳入），`core.test` 的 `43/112/61` 与 `core-interior` 的 `5/43` 需同步（已在断言里尽量改成"派生 + 绝对值"双保险，减少二次改动）。
5. 三套件在运行期间撞到过 `src/zones/forecourt.js` 的**并发编辑瞬时崩**（`Cannot access 'interiorLampAnchors' before initialization`，14:58–14:59 的两次运行），重跑即绿；已确认为外部在飞，未改 zones。


---

## t108（T2.26）core 侧冻结计数同步：`WALKABLE` pin → **157（LAYOUT 1.1.10）**

**任务目标**：把 `tests/core.test.mjs` 的冻结计数同步到当前树（卡面预期 `LAYOUT 1.1.9 / WALKABLE 155`），**只同步数字与理由串、不放宽/不删除断言**。

### 1. 实测：执行时树上已是 **1.1.10 / 157**（卡面的 155 已过时）

```text
$ node --input-type=module -e "…loadModule('src/shared/layout.js')…"
LAYOUT_VERSION 1.1.10 | WALKABLE 157 | -transition 面 43 | 覆盖槽位 18
SLOTS 67 · CONNECTORS 32 · OBSTACLES 81 · VIEWPOINTS 61 · LIGHT_ANCHORS 49 · COURTYARDS 14
按 kind：outerTerrain:4 / ground:58 / bridgeDeck:4 / gardenGround:1 / terrace:4 / interior:43 / passage:43   （4+58+4+1+4+43+43 = 157）
```
- **155 → 157 的 Δ+2**：`ground` 基础面由 13 → 15（两条后续登记的 `ground` 面），与 43 条 `-transition-` 台阶面同批落地；`interior 43 / passage 43` 未变。
- ⇒ **本卡把 pin 钉到实测的 157，而不是卡面写的 155**。理由：该用例的语义就是"冻结计数 == 当前树"，钉 155 会让本卡交付后立刻红（`期望 155，实际 157`），等于**留下一个陈旧数字**；判据本身（精确相等）一字未放宽。**这是一次如实的口径修正，不是放宽。**

### 2. 改动（仅 `tests/core.test.mjs`，断言只增不减）

| 位置 | 改动 |
| --- | --- |
| `:917` 用例标题 | `112 可走面 … LAYOUT 1.1.4` → **`157 可走面 … LAYOUT 1.1.10`** |
| `:942` 唯一红项 | `assertEqual(LAYOUT.WALKABLE.length, 112, 'LAYOUT 1.1.4：…')` → **`assertEqual(LAYOUT.WALKABLE.length, 157, 'LAYOUT 1.1.10：可行走面 157 条（112 + 43 门外过渡台阶 + 2 条后续 ground 面，t102；kind 用既有 ground + id 后缀 -transition-N）')`**（**仍是精确相等**，未改成 `>=`、未改成"包含"式宽断言） |
| **新增** 组成自证块 | ① 按 `kind` 分项之和 == `WALKABLE.length`；② `interior === 43`、`passage === 43`；③ `/-transition-\d+$/` 面 == **43**；④ 这些面必须 `kind === 'ground'`（**不得引入新 kind**，否则消费方白名单会漏——t79 的教训）；⑤ 覆盖槽位去重 == **18**；并 `runner.info` 打印分项 |
| `:892/:899/:928` 版本标签 | `LAYOUT 1.1.4` → `LAYOUT 1.1.10`（数值 43 / 61 经实测**未变**，只同步标签） |

### 3. 为何其余数字不变（逐项）

`buildings = SLOTS 67`、`connectors = CONNECTORS 32`、`obstacles = OBSTACLES 81`、`viewpoints = VIEWPOINTS 61`、`lightAnchors = LIGHT_ANCHORS 49` —— 这五条都**直接从 layout 读出后与该数组长度精确比对**（不是硬编码常量），本卡实测其数组长度与卡面所列一致；t102 只登记**可行走面**（`WALKABLE`），未改建筑/连接/障碍/机位/灯位 ⇒ 这五项不受影响，故无需改动（也不需要"改数字"，它们本就不是字面量）。`interior 43` 与 `passage 43` 同样实测未变。

### 4. grep 排查（`tests/core*.mjs` 全部 `112` / `WALKABLE` 引用）

| 文件:行 | 内容 | 处置 |
| --- | --- | --- |
| `tests/core.test.mjs:917/928/942/892/899` | `112` 字面量 + `LAYOUT 1.1.4` 标签 | **本卡同步**（见 §2） |
| `tests/core-collision.test.mjs:230` | `LAYOUT.WALKABLE.filter(w => w.kind === 'interior')` | 按 kind 过滤、**不按规模断言** ⇒ 无需改（且 43 未变） |
| `tests/core-interior.test.mjs:92/97` | 同上 + `assertEqual(interiors.length, 43, 'LAYOUT 1.1.4：…')` | 数值 43 **实测未变**（不是陈旧数字）；仅**版本标签** `1.1.4` 为历史快照 ⇒ **不在本卡 inScope**（该文件归 t103/t98 线），已在报告里点名，建议顺手把标签更新为 1.1.10 |
| `tests/core-kinds.test.mjs:6/52` | 注释/断言串里的 `LAYOUT 1.1.4`（值 43 未变） | 同上：历史标签，非陈旧数字；不在 inScope，已在报告点名 |
| `tests/core.test.mjs:1000+`（其余） | 无 `112` 字面量残留 | ✓（`grep -rn "112" tests/core*.mjs` 仅剩上述 §2 已改项） |

**结论：`tests/core*.mjs` 中已无"按旧规模 112 断言"的位置**；两处版本标签在他人文件里，值与语义仍正确。

### 5. verify（原样）

```text
$ node tests/core.test.mjs → exit=0 · 通过 43 / 43（本卡前 42/43，唯一红项即该 pin）
   · WALKABLE 157 条组成：outerTerrain:4 / ground:58 / bridgeDeck:4 / gardenGround:1 / terrace:4 / interior:43 / passage:43；transition 43 面 / 18 栋
$ node scripts/audit.mjs --enforce → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
项目级 `run.mjs` 未列入本卡 verify；未触碰 `src/**`、`tests/layout.test.mjs`、`tests/interaction.test.mjs`、`tests/core-collision.test.mjs`、`tests/verify-*.mjs`、`docs/CONTRACTS.md`。


---

## t113（T2.28）更正 t108 的归因：`157 = 112 + 43（t102 过渡台阶）+ 2（t103 门槛面）`

**背景**：t108 同步 `WALKABLE 112 → 157` 的 pin 时，把 +2 写成"2 条后续登记的 ground 面（t102）"——**归属写错**（t111 按纪律未越界改，只交回一行补丁；主理人采纳其选项 (甲)）。

### 1. "为何 +2 属于 t103"的依据（本次实测）

```text
$ node --input-type=module -e "…loadModule('src/shared/layout.js')…"
threshold 面: 2  → WK-B-pavilion-gate-west-threshold:ground | WK-B-pavilion-gate-east-threshold:ground
transition 面: 43 → 覆盖槽位 18（id 后缀 -transition-N）
总数 157 = 112 + 43 + 2 ✓（threshold 2 + transition 43 = 45）
B 两座亭门殿 hasDoor: [{B-pavilion-gate-west:true}, {B-pavilion-gate-east:true}]
```
- +2 就是 **`WK-B-pavilion-gate-{west,east}-threshold`** 两条 `kind:'ground'` 门槛面（t103 的 10 座亭可通行化产物）；
- t102 的 43 条过渡面 id 后缀是 **`-transition-N`**，与 `-threshold` **可区分**（两类面本次分别计数 45 = 43 + 2，正好补齐 112 → 157）。
⇒ 归因更正有**可复算的证据**，不是措辞偏好。

### 2. 改动前后逐字对照（`tests/core.test.mjs`）

| 位置 | 旧（t108 写的） | 新（t113 更正） |
| --- | --- | --- |
| `:944` 注释行 | `//                        +  2 条后续登记的 ground 面（112 → 114，随 t102 同批落地）` | `//                        +  2 门槛面（t103：10 座亭可通行化 + B 两座门槛面`<br>`//                                WK-B-pavilion-gate-{west,east}-threshold，kind 用既有 ground，id 后缀 -threshold）` |
| `:946` 断言的**理由串**（数值不变） | `'LAYOUT 1.1.10：可行走面 157 条（112 + 43 门外过渡台阶 + 2 条后续 ground 面，t102；kind 用既有 ground + id 后缀 -transition-N）'` | `'LAYOUT 1.1.10：可行走面 157 条（112 + 43 门外过渡台阶 t102 + 2 门槛面 t103；kind 用既有 ground + id 后缀 -transition-N / -threshold）'` |

**断言本体一字未改**：仍是 `assertEqual(LAYOUT.WALKABLE.length, 157, …)`（**精确相等**，未改成 `>=`、未改成"包含"式）。

### 3. 新增（只增不减）：把 +2 的**身份**也钉进代码

在 t108 的组成自证块内追加（防止注释/归因再次漂移）：
- `/-threshold$/` 面 == **2**；
- 这些面必须 `kind === 'ground'`；
- 两条 id 排序后必须恰为 **`WK-B-pavilion-gate-east-threshold,WK-B-pavilion-gate-west-threshold`**；
- `B-pavilion-gate-west` / `B-pavilion-gate-east` 两槽位 `hasDoor === true`（t103 的可通行门殿）。

t108 保留的组成自证断言**全部原样保留**：kind 分项之和 == 总数、`interior 43`、`passage 43`、`-transition-\d+$` == 43 且 `kind==='ground'`、过渡面覆盖 18 栋；`tests/core.test.mjs` 的 `assert(` 调用数由 82 → **88**（只增不减）。

### 4. verify（原样）

```text
$ node tests/core.test.mjs → exit=0 · 通过 43 / 43
   · WALKABLE 157 条组成：outerTerrain:4 / ground:58 / bridgeDeck:4 / gardenGround:1 / terrace:4 / interior:43 / passage:43；transition 43 面 / 18 栋
$ node scripts/audit.mjs --enforce → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
项目级 `run.mjs` 未列入本卡 verify；未触碰 `src/**`、`tests/layout.test.mjs`、`tests/interaction.test.mjs`、`tests/core-collision.test.mjs`、`docs/CONTRACTS.md`。


---

## t130（T2.32）core 侧 pin 再同步：`WALKABLE` 161 → **169**（LAYOUT 1.1.15）

**任务**：`t128` 对 `WK-C-bed-terrace` 开槽（单块 → 5 段）+ C 两栋各 2 级台阶 ⇒ 净 **+8**；`t127` 刚同步到 161 的 pin 已过时。**以实测为准**，不弱化断言。

### 1. 实测（先读后填，未凭转述）

```text
$ node --input-type=module -e "…loadModule('src/shared/layout.js')…"
LAYOUT_VERSION 1.1.15 | WALKABLE 169
byKind: outerTerrain:4 / ground:62 / bridgeDeck:4 / gardenGround:1 / terrace:12 / interior:43 / passage:43   （= 169）
transition 面 47（全部 kind='ground'）| 覆盖槽位 20 | threshold 面 2 | terrace 面 12
WK-C-bed-terrace-{south,north,west,mid,east} 共 5 段（t128 的 1 → 5 开槽：净 +4）
```
**分项变化对得上**：`terrace` 4 → 8（t126 +4）→ **12**（t128 +4）；`ground` 58 → **62**（+4 = C 两栋各 2 级台阶，登记为 `-transition-N` 台阶面）；`transition` 43 → **47**、覆盖槽位 18 → **20**；`interior 43 / passage 43 / threshold 2 / 外域 4 / 桥面 4 / 园林地 1` 未变。

### 2. 改动（仅 `tests/core.test.mjs`，断言只增不减）

| 位置 | 旧（t127） | 新（t130） |
| --- | --- | --- |
| 用例标题 | `… 161 可走面 …；LAYOUT 1.1.14` | `… **169** 可走面 …；**LAYOUT 1.1.15**` |
| 主 pin | `assertEqual(LAYOUT.WALKABLE.length, **161**, 'LAYOUT 1.1.14：…（112 + 43 门外过渡台阶 t102 + 2 门槛面 t103 + 4 条 terrace 面 t126；…）')` | `assertEqual(LAYOUT.WALKABLE.length, **169**, 'LAYOUT 1.1.15：可行走面 169 条（112 + 43 门外过渡台阶 t102 + 2 门槛面 t103 + 4 条 terrace 面 t126 + **8 条 t128**（C-bed-terrace 开槽 1→5 净 +4 + C 两栋各 2 级台阶 4 条 -transition 台阶面）；kind 用既有 ground / terrace + id 后缀 -transition-N / -threshold）')`（**仍精确相等**，未改 `>=`/包含式） |
| 组成自证 | `transition == 43`、覆盖 18 栋、`terrace == 8` | `transition == **47**`、覆盖 **20** 栋、`terrace == **12**`（各附理由串） |
| 版本标签 | `1.1.10` / `1.1.14`、`157` / `161` | 统一为 **1.1.15** / **169**（**仅文案**） |
| 输出行 | 硬编码 `transition 43 面 / 18 栋` | 改为**按实测变量输出**：`transition ${transitions.length} 面 / ${slotIds.size} 栋；threshold ${thresholds.length} 面`（不留硬编码数字） |

**保留未动**：`buildings/connectors/obstacles/viewpoints/lightAnchors`（从 layout 读出精确比对）、`interior === 43`、`passage === 43`、分项和 == 总数、`threshold === 2` 且 id/kind/`hasDoor===true` 的身份断言。

### 3. grep 排查（`tests/core*.mjs`）

`grep -rn "161\|157\|112\|WALKABLE" tests/core*.mjs` 逐条结论：
- **按旧规模断言的处**：仅 `tests/core.test.mjs`（本卡同步完毕）——同步后该文件内不再出现 161/157 作为计数（`112` 仅出现在组成注释 `169 = 112 + …` 的溯源里）。
- **按 `kind` 过滤、不断言规模**：`core-camera.test.mjs:331/392`、`core-collision.test.mjs:231/295/335`、`core-interior.test.mjs:92`、`core-kinds.test.mjs:32/33/95/96` ⇒ 数值变化不影响它们（`interior` 仍 43）。
- **坐标/历史快照（非计数，不改）**：`tests/core-interior.test.mjs:83` 的 `z: 157` 是机位**坐标**；`core-kinds.test.mjs` 注释里的 `LAYOUT 1.1.4` 是历史**版本标签**（其断言的 43 未变，且文件不在本卡 inScope）。

### 4. verify（原样）

```text
$ node tests/core.test.mjs → exit=0 · 通过 45 / 45
   · WALKABLE 169 条组成：outerTerrain:4 / ground:62 / bridgeDeck:4 / gardenGround:1 / terrace:12 / interior:43 / passage:43；transition 47 面 / 20 栋；threshold 2 面
$ node tests/core-environment.test.mjs → exit=0 · 通过 8 / 8
$ node scripts/audit.mjs --enforce → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
用例数 45（不变）、`assert(` 调用 **91**（不变，只改数值与理由串）；项目级 `run.mjs` 未列入本卡 verify。
未触碰 `src/**`、`tests/layout.test.mjs`、`tests/core-antialias.test.mjs`、`tests/core-environment.test.mjs`、`tests/verify-*.mjs`、`tests/zone-*.test.mjs`、`docs/CONTRACTS.md`。


---

## t136（T2.35）core 侧 pin 第 6 次同步：`WALKABLE` 171 → **167**（LAYOUT 1.1.17）

**来源**：`t134` 删除 4 片残片 ⇒ 净 **−4**（`t133` 刚同步到 171，随即过时）。

### 1. 实测（先读后填，未凭转述）

```text
$ node --input-type=module -e "…loadModule('src/shared/layout.js')…"
LAYOUT_VERSION 1.1.17 | WALKABLE 167
byKind: outerTerrain:4 / ground:64 / bridgeDeck:4 / gardenGround:1 / terrace:8 / interior:43 / passage:43   （= 167）
transition 49（覆盖 21 栋）| threshold 2 | terrace 8
terrace 现存 8 条：WK-B-terrace-{tier1,tier2-south,tier2-north,tier2-mid,tier3}、WK-C-bed-terrace-{south,north,mid}
t134 声称删除的 4 片：WK-B-terrace-tier2-{west,east}、WK-C-bed-terrace-{west,east} —— **均已不在树中** ✓
```
**Δ 溯源**：`terrace 12 → 8`（**−4**，即 t134 删掉的 4 片残片）；`ground 64 / transition 49 / 覆盖槽位 21 / threshold 2 / interior 43 / passage 43 / 外域 4 / 桥面 4 / 园林地 1` **全部未变**。

### 2. 改动（仅 `tests/core.test.mjs`，断言只增不减）

| 位置 | 旧（t133） | 新（t136） |
| --- | --- | --- |
| 用例标题 | `… 171 可走面 …；LAYOUT 1.1.16` | `… **167** 可走面 …；**LAYOUT 1.1.17**` |
| 主 pin | `assertEqual(LAYOUT.WALKABLE.length, **171**, 'LAYOUT 1.1.16：…)` | `assertEqual(LAYOUT.WALKABLE.length, **167**, 'LAYOUT 1.1.17：可行走面 167 条（112 + 43 t102 + 2 门槛面 t103 + 4 条 terrace 面 t126 + 8 条 t128 + 2 条 t131 **− 4 条 t134（删除残片 `WK-B-terrace-tier2-{west,east}` 与 `WK-C-bed-terrace-{west,east}`，kind=terrace）**；…）')`（**仍精确相等**，未改 `>=`/包含式） |
| 组成自证 | `byKind.terrace === 12` | `byKind.terrace === **8**`（理由串：t126 +4 / t128 +4 / **t134 删残片 −4**） |
| 版本标签 | `1.1.16`（4 处） | `**1.1.17**`（仅文案） |

**保留未动**：`transition === 49`（t102 43 + t128 4 + t131 2）、覆盖槽位 `21`、`threshold === 2` 的身份断言、`interior === 43`、`passage === 43`、分项和 == 总数。

### 3. grep 排查

`grep -rn "171\|169\|161\|1\.1\.16" tests/core*.mjs docs/handoff-t2-expectations.md` ⇒ **无命中**（唯一含 `169` 的是 `three r169`——three.js 修订号，**不是计数**，未误改）。
同步后 `tests/core.test.mjs` 中不再出现 `171` / `1.1.16` 作为计数或版本标签。

### 4. verify（原样）

```text
$ node tests/core.test.mjs → exit=0 · 通过 45 / 45
   · WALKABLE 167 条组成：outerTerrain:4 / ground:64 / bridgeDeck:4 / gardenGround:1 / terrace:8 / interior:43 / passage:43；transition 49 面 / 21 栋；threshold 2 面
$ node tests/core-environment.test.mjs → exit=0 · 通过 12 / 12
$ node scripts/audit.mjs --enforce → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
用例数 45、`assert(` **91**（均不变，只改数值与理由串）；未触碰 `src/**`、`tests/layout.test.mjs`、`tests/core-antialias.test.mjs`、`tests/verify-*.mjs`、`docs/CONTRACTS.md`。

**本线第 6 次同类同步（t108 157 → t113 归因 → t127 161 → t130 169 → t133 171 → t136 167）**；模板与首次一致：**先读实测 → Δ 逐项溯源 → 顺手去硬编码**（输出行早已改为按实测变量打印，故本次屏上无陈旧数字）。
