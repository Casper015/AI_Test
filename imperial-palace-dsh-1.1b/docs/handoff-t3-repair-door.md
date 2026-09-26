# T3.3 修复回执 · hall/courtyardGate 正面门洞复现与解耦（t22）

> 归属：`kit-engineer`（t22）· 2026-09-26
> 版本（当前有效组合）：`CONTRACTS v1.0.3` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`
> 改动范围：`src/kit/geometry.js`、`src/kit/buildings.js`、`tests/kit.test.mjs`、`docs/handoff-kit.md`、`docs/ASSET_CREDITS.md`、本文件
> **未改动**：`src/shared/**`、`src/core/**`、`src/zones/**`、`src/ui/**`、`docs/CONTRACTS.md`、`docs/STYLE_GUIDE.md`、`src/kit/index.js`（不在 t22 inScope）

---

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| C 区作者（t7）报告"hall/courtyardGate 正面无门洞" | **成立（已独立复现）**，且比报告更严重：`hall`/`courtyardGate` 的正面是**整面实心墙**，门洞净宽 0m |
| 复现方法 | 近/中 LOD 对象 + 门洞中心高度射线通道判定 + 门口宽度 201 点采样（**最宽连续通行段**；单点射线会被 x=0 处两块墙对接的零宽对缝骗过） |
| 修复 | 门洞 ⇄ 屋顶形制 ⇄ 窗 ⇄ 门扇开启比例 **四者解耦**（见 §2） |
| 重檐主殿 | `grade3 + doubleEaveHip` 的 hall **仍为重檐庑殿**（长正脊 + 四面坡 + 上层屋身 + 双檐口），且具备通行门洞 |
| 回归守卫 | `tests/kit.test.mjs` 新增 §14：**566/566 通过**（t22 前 496 → +70 项，断言数只增不减） |
| 预算 | 分区 C 绘制调用 **56（超预算 50）→ 49**；`node scripts/audit.mjs --enforce` **exit 0，全部预算与契约检查通过** |
| 文档 | `docs/handoff-kit.md` 的 `strictRoofGrade` 表述已改为"始终抛错"；本文件与 `ASSET_CREDITS.md` 版本戳已同步 |

---

## 1. 复现（先复现、后修改）——修复前原始输出

**探针定义**（与 `tests/kit.test.mjs` §14 的 `probeDoorChannel` 同一算法）：

- 取**近/中 LOD 对象**（`lod:'near'` / `'mid'`，普通 Group；不是 far 简化体块）；
- 射线高度 = `terraceH + min(1.6, doorHeight/2)`（门洞中心）；起点在屋身前表面外 1.6m，方向沿本地 +Z 经
  `rotationYDeg` 变换到世界（否则旋转过的建筑会打空——这是此前两次"未命中"的原因之一）；
- 命中点回到本地坐标，落于 `[前表面, 前表面+2.0m]` 视为"正面被挡"（背墙在其后 20m+，不会误判）；
- 在门口宽度上取 **201 个样本**（偏移 `(i+0.5)/n`，刻意避开 x=0），统计**最宽连续通行段**与遮挡率；
  另单独报 `x≈0` 处首个遮挡构件。

**修复前实测（原始输出，逐字）**

```text
===== 修复前 LOD near =====
hall(B-hall-main) door26        doorW= 26.00  最宽通行段=  0.13m  @x=  0.00  遮挡率=100%  x0命中=wall
hall(C-hall-bed-main) door26    doorW= 26.00  最宽通行段=  0.13m  @x=  0.00  遮挡率=100%  x0命中=wall
hall(B-hall-mid) 无door          doorW=  5.44  最宽通行段=  0.03m  @x=  0.00  遮挡率=100%  x0命中=wall
gateHall(F-gate-south)          doorW= 26.00  最宽通行段= 18.76m  @x=  9.31  遮挡率= 28%  x0命中=无
courtyardGate(C-gate-west) door12  doorW= 12.00  最宽通行段=  0.00m  @x=  0.00  遮挡率=100%  x0命中=wall
===== 修复前 LOD mid =====
（与 near 完全一致）
```

**单点射线诊断（证明"中心通路"是数值假象）**

```text
=== hall B-hall-main ===
  y=6.0 x=0    → wall@z=20.63        ← 只有 x=0 正好落在两块墙对接缝上，一路穿到背墙
  y=6.0 x=0.5  → wall@z=-21.38 , wall@z=20.63   ← 偏 0.5m 即被正面墙挡住
  y=6.0 x=3    → wall@z=-21.38 , door@z=-21.22 , wall@z=20.63
=== courtyardGate C-gate-west ===
  全部样本无正面命中 → 但最宽连续通行段 0.00m（正面墙在门口整宽范围连续）
```

**判定**：缺陷成立。`src/kit/geometry.js` 的正立面只在 `kind === 'gateHall'` 时留口，
`hall`/`courtyardGate` 落到 `else` 分支砌满整面（两块墙在 x=0 对接，形成一条零宽对缝，
所以**单点中心射线会误判为"通行"**——这正是此前两次实测"未命中"的原因）。
`courtyardGate` 的 12m 门洞同样被砌死。`gateHall` 正常（26m 开口，通行段 18.76m）。

> 证据强度说明：本结论由 `tests/kit.test.mjs` §14 的**最宽连续通行段**指标独立复现，
> 不再依赖单点射线；该指标已固化为永久守卫。

---

## 2. 修复：门洞 ⇄ 形制 ⇄ 窗 ⇄ 门扇比例，四者解耦

| 事项 | 修复前（耦合） | 修复后（解耦） |
| --- | --- | --- |
| **门洞** | 由 `kind === 'gateHall'` 决定（hall/courtyardGate 砌满整面） | 由 **`door`（layout 门数据）/ `doorOpening` / `openFront`** 决定：有门洞→门洞两侧砌墙；无门洞→整面**一块**实心墙（消除 x=0 对缝）；门洞内的前檐柱按"有门洞"跳过。门殿/院门（kind 本身是"门"）默认自带门洞，宽度按 `MODULES.gateOpeningRatio` |
| **屋顶形制** | `doubleEave = (roofSpec.doubleEave \|\| isTower) && !isPavilion && !isGate` → 门殿被**静默降级**（F-gate-south/north 槽位是 `doubleEaveHip`，实际建单檐） | `doubleEave = (roofSpec.doubleEave \|\| isTower) && !isPavilion` → **按槽位 roofType 建**，门殿重檐不再被吞 |
| **窗** | `windows && doorWidth > 0.2 && kind !== 'gateHall'` → 无门洞就没有窗 | **只由 kind 决定**（殿堂有、门殿/院门无、亭开敞）；窗顶与门顶同高线，无门洞时整面排列 |
| **门扇开启比例** | `kind === 'gateHall' ? 0.72 : 0.18` | 不变（门殿/院门 0.72、殿堂 0.18），并**显式注明**不因有无门洞而变；另按 `2×玩家半径 / 开启比例` 反推"显式开门时的最小默认门宽"，避免窄面阔建筑开出一个过不去的小洞 |
| **可通行性元数据** | 无 | `userData.kit.metrics.opening = { width, height, openFraction, clearWidth, playerClearWidth, source }`，供 t9/t2 的碰撞与第一人称走查直接消费（`clearWidth ≥ playerClearWidth`） |

**上层屋身（平座层）与下层同类构件沿用同名 part**（柱/额枋/斗栱/栏杆），下层腰檐只把**瓦面**改名为 `lowerRoof`：
几何完全不变，但重檐建筑不再额外占用合批桶 —— 这是把分区 C 从超预算拉回预算内的关键（§4）。

---

## 3. 修复后原始输出（同一探针）

```text
===== 修复后 LOD near =====
B-hall-main        doorW=    26 最宽通行段= 4.786m @x=  2.33 遮挡率=0.816 x≈0首挡=无
C-hall-bed-main    doorW=    26 最宽通行段= 4.786m @x=  2.33 遮挡率=0.816 x≈0首挡=无
B-hall-mid         doorW=     0 最宽通行段=     0m @x=     0 遮挡率=    1 x≈0首挡=wall
F-gate-south       doorW=    26 最宽通行段=18.756m @x=  9.31 遮挡率=0.279 x≈0首挡=无
C-gate-west        doorW=    12 最宽通行段= 8.657m @x=   4.3 遮挡率=0.279 x≈0首挡=无
===== 修复后 LOD mid =====
（与 near 完全一致）
```

解读：

- `hall + door.width=26`：通行段 **0.13m → 4.786m**（= 26 × 开启比例 0.18，门扇两侧各留 0.18 的净空），遮挡率 81.6% 即门扇本身，`x≈0` 无遮挡；
- `courtyardGate + door.width=12`：**0.00m → 8.657m**（12 × 0.72，院门常开）；`gateHall` 18.756m **与修复前逐位一致（现有行为不变）**；
- `hall 无 door`（B-hall-mid）：**正面仍然实心**（通行段 0，遮挡率 100%，首碰 = `wall`）——"无 door 就是实心正面"这一条被保留并固化为断言；
- 全 67 槽位：layout 中带 `door` 的 **18 个**槽位全部获得开口，门扇净宽最小 **4.68m**（门槛 = 2×玩家半径 = 0.7m）。

---

## 4. verify 真实输出

```text
$ cd ".../imperial-palace copy 3" && node tests/kit.test.mjs
 · 分区 B: 220 → 31 draw calls / 42660 tri
 · 分区 C: 221 → 31 draw calls / 34784 tri
 · 分区 D: 242 → 28 draw calls / 30152 tri
 · 分区 E: 257 → 28 draw calls / 32128 tri
 · 分区 F: 269 → 31 draw calls / 51388 tri
 · 去内部面（测试殿）：4320 → 1149 三角形
 · 全 67 槽：近景三角面 191112，中景 114916，单栋最大 11596
 · totalHeight 偏差（kit 举架 vs layout 估值）：中位 26.7%，最大 38.6% (E-court1-hall)
 · 门洞解耦：layout 带 door 槽位 18 个全部获得开口，净宽最小 4.68m（门槛 0.7m）
 通过 566 / 566，失败 0
exit=0

$ node tests/run.mjs
 PASS  tests/core-walls.test.mjs  166ms
 PASS  tests/core.test.mjs  390ms
 FAIL  tests/interaction.test.mjs  776ms
 PASS  tests/kit.test.mjs  1953ms
 PASS  tests/layout.test.mjs  113ms
 PASS  tests/zone-east.test.mjs  520ms
 PASS  tests/zone-forecourt.test.mjs  1633ms
 PASS  tests/zone-garden.test.mjs  603ms
 PASS  tests/zone-inner.test.mjs  432ms
 PASS  tests/zones.test.mjs  2015ms
 通过 9 / 10，失败 1，总耗时 8602ms
exit=1   ← 唯一失败项是 t9 在途的 tests/interaction.test.mjs（与 src/kit 无关，见 §5）

$ node scripts/audit.mjs            # 同一结果的 --enforce 也跑过
 主场景绘制调用   : 254 / 上限 350  ✓
 分区 B         : 58 / 预算 70  ✓
 分区 C         : 49 / 预算 50  ✓      ← 修复前 56 / 50 ✗
 分区 E         : 40 / 预算 40  ✓
 分区 F         : 61 / 预算 80  ✓
 可见三角面       : 242929 / 上限 1500000  ✓
 结论：全部预算与契约检查通过
exit=0
$ node scripts/audit.mjs --enforce  → exit=0（结论同上）
```

---

## 5. 未验证 / 归因边界（不得当作已验证）

1. **`node tests/run.mjs` 不是全绿：唯一失败项是 `tests/interaction.test.mjs`（t9 在途）**。归因证据（三重）：
   - 该文件**零处引用 `src/kit`**（`grep -c kit tests/interaction.test.mjs` → 0），且它用 `tests/harness.mjs` 的
     `makeTestCtx()` 时不注入真 kit（harness L151：`options.kit ?? greybox.createFallbackKit(...)`）→ **拿不到我的代码路径**；
   - 失败项全部是相机/键盘/导览/小地图状态（`A5 T/Y/Space/R 走同一条请求事件`、`B1 八视角逐一可切`、`B3 第一人称与导览互斥`…），与几何无关；
   - 第三方的历史记录已载明它在 t22 之前就失败：`docs/handoff-east-courts.md:179-181`（当次 run.mjs 原始输出）与 `:197-198`（失败项清单与归属 t9）。
   同理可说明：`tests/core-walls.test.mjs` 在本任务开始时尚为 FAIL（同上一处记录），在我完工前已由 t2/t21 修复为 PASS——与我的改动无关。
2. **第一人称实际走查未做**：本任务只做几何/通道判定（射线）+ 区域契约校验；"玩家能否真的走过去"需 t13（V2）在第一人称模式实测
   （本机 headless 为 SwiftShader 软渲染，不能代表交互体验）。
3. **`clearWidth` 只按几何净空计算**：未叠加门钉/门框/门槛厚度与玩家体积的滑动求解（属碰撞实现，归 t2/t9）。
4. **`KIT_VERSION` 仍为 `1.0.0`**：`src/kit/index.js` 不在 t22 的 inScope，本次几何行为已变（门洞解耦），
   建议由后续 kit 任务把 `KIT_VERSION` 递增到 `1.0.1` 并在 `docs/CONTRACTS.md` 版本表同步（我未越界修改）。
5. **`zone-*` 的区域侧适配不在本任务范围**：t7 先前用 `gateHall` 分支绕过本缺陷；修复后 `hall` 已可直接使用，
   其区域代码是否回归 `hall`（或保留 `gateHall`——它现在同样按槽位建重檐）由 t7 决定，两侧行为我都已用测试钉住。
6. **`node scripts/build.mjs` 未运行**（`dist/` 归属 t14，避免并发改写发布包）；本次改动只在 `src/kit/**` 与 `tests/kit.test.mjs`。

---

## 5b. attempt 2 复核（2026-09-26，重派后）

第一次提交时（attempt 1）三条 verify 中 `node tests/run.mjs` 为红：唯一失败项是 `tests/interaction.test.mjs`（t9 在途），
与 `src/kit` 无代码路径关联（详见 §5）。重派为 attempt 2 时，相关在途套件均已落地/修正，**三条 verify 现全绿**，
且本次复核**未再改动任何几何/测试代码**，只做了版本戳同步与本节记录。原始输出：

```text
$ node tests/kit.test.mjs
 通过 633 / 633，失败 0
exit=0        （t22 交付时为 566 项；其后 t25 追加 §15/§16/§17 共 +67 项，断言数只增不减）

$ node tests/run.mjs           # attempt 1 时为 9/10（interaction 红）
 PASS  tests/core-walls.test.mjs  607ms
 PASS  tests/core.test.mjs  1538ms
 PASS  tests/interaction.test.mjs  3924ms
 PASS  tests/kit.test.mjs  5381ms
 PASS  tests/layout.test.mjs  257ms
 PASS  tests/zone-east.test.mjs  1386ms
 PASS  tests/zone-forecourt.test.mjs  4853ms
 PASS  tests/zone-garden.test.mjs  1812ms
 PASS  tests/zone-inner.test.mjs  1442ms
 PASS  tests/zones.test.mjs  7132ms
 通过 10 / 10，失败 0
exit=0

$ node scripts/audit.mjs
 结论：全部预算与契约检查通过
exit=0
```

attempt 2 复核时**门洞通道探针重跑**（口径同 §1/§3：近/中 LOD、门洞中心高度、门口宽度 201 点采样）：

```text
===== attempt2 复核 LOD near（mid 完全一致）=====
B-hall-main       doorW=26  最宽通行段= 4.786m 遮挡率=0.816 x≈0首挡=无 | hasOpening=true opening={"w":26,"clear":4.68,"frac":0.18,"src":"door"} lowerRoof=true
C-hall-bed-main   doorW=26  最宽通行段= 4.786m 遮挡率=0.816 x≈0首挡=无 | hasOpening=true opening={"w":26,"clear":4.68,"frac":0.18,"src":"door"} lowerRoof=true
B-hall-mid        doorW= 0  最宽通行段=     0m 遮挡率=1.000 x≈0首挡=wall | hasOpening=false opening=null lowerRoof=false
F-gate-south      doorW=26  最宽通行段=18.756m 遮挡率=0.279 x≈0首挡=无 | hasOpening=true opening={"w":26,"clear":18.72,"frac":0.72,"src":"door"} lowerRoof=true
C-gate-west       doorW=12  最宽通行段= 8.657m 遮挡率=0.279 x≈0首挡=无 | hasOpening=true opening={"w":12,"clear":8.64,"frac":0.72,"src":"door"} lowerRoof=false
```

结论：与 §3 修复后逐位一致（hall 4.786m / gateHall 18.756m 保持不变 / courtyardGate 8.657m / 无 door 的 hall 仍实心），
且 `lowerRoof=true` 证明 grade3 `doubleEaveHip` 的 hall（含 F 城门楼）仍为**重檐**。

**attempt 2 期间的版本戳同步（同属本条验收）**：
- `docs/ASSET_CREDITS.md`：`KIT_VERSION` 由「当前 1.0.0，待递增」更正为「**当前 1.0.1**」（t30 已递增），并指向 `docs/handoff-t3-version.md` 的行为变更清单；
- `docs/handoff-kit.md`：版本组合行补 `KIT_VERSION 1.0.1`；并把 t30 回执 §3 的「待并入 kit 总文档」3 项
  （bridge 可选拱券参数 / 台阶递升方向 / mergeZone 选项与 config 覆盖语义）**真的并入本文件**（见该文件末尾「附」节，
  因为本任务卡的 inScope 恰好包含 `docs/handoff-kit.md`，属该文件负责人范围内的合并动作）。
  —— t30 当时因 inScope 不含该文件而只给出清单，未直接改；本节完成并入，t30-F3/§3 清单就此关闭。

---

## 6. 永久守卫清单（`tests/kit.test.mjs` §14，+70 项断言）

- `[near|mid] hall(B-hall-main)+door26 / hall(C-hall-bed-main)+door26 / gateHall(F-gate-south) / courtyardGate(C-gate-west)`
  → 最宽连续通行段 ≥ 2×玩家半径（0.7m）、`x≈0` 处正面不阻塞、遮挡率 < 100%；
- `[near|mid] hall 无 door` → 通行段 = 0、遮挡率 100%、`doorWidth = 0`、首碰构件 = `wall`（正面实心）；
- `gateHall` 近/中景通行段与遮挡率**逐位一致**（现有行为不变）；
- 门宽与 `layout.door.width` 一致（`metrics.doorWidth === min(slot.door.width, bodyW−2)`）；
- `opening` 元数据完整且 `clearWidth ≥ playerClearWidth`；开启比例由 kind 决定（殿堂 0.18 / 门殿·院门 0.72）；
- 显式 `doorOpening:true` / `openFront:true` / `doorOpening:4` 三种写法都能开门且通行；
- 窗只由 kind 决定（殿堂有/无门洞都有窗；门殿、院门无窗）；
- 重檐主殿不退化：`lowerRoof` + `roof` + 上层檐口 > 下层檐口 + **柱网顶面 ≥ 上层檐口 − 0.5m**（上层屋身几何证明）+ 长正脊 ≥ 0.3×面阔 + 四面坡；
- `gateHall(F-gate-south, doubleEaveHip)` 现在确实建成重檐（与 layout 注册表一致）；
- 全 67 槽：layout 中带 `door` 的 18 个槽位全部有开口且净宽 ≥ 0.7m。
