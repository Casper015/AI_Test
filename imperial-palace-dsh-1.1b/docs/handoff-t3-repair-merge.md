# T3.4 修复回执 · 合批阴影守恒 + 台阶朝向 + bridge 可选拱券参数（t25）

> 归属：`kit-engineer`（t25）· 2026-09-26 · attempt 1
> 版本（当前有效组合）：`CONTRACTS v1.0.3` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`
> 改动（仅 inScope）：`src/kit/merge.js`、`src/kit/buildings.js`、`src/kit/geometry.js`、`tests/kit.test.mjs`、本文件
> **未改动**：`src/shared/**`、`src/core/**`、`src/zones/**`、`src/ui/**`、`src/kit/index.js`、`docs/handoff-kit.md`、`docs/ASSET_CREDITS.md`
> 依赖：t22（门洞解耦，已串行完成）；本任务在其之上继续。

---

## 0. 结论速览

| 项 | 事实 |
| --- | --- |
| **合批丢阴影** | **成立**。`src/kit/merge.js` 修复前 grep `castShadow` 零命中；`buildings.js` 构件为 `castShadow=true`，`mergeZone` 建的新网格回落 three 默认 `false` → 合批后建筑集体不投影 |
| audit 分区阴影（修复前 → 修复后） | B **6 → 58**、C **0 → 49**、E **3 → 39**、F **11 → 60**、小计 **56 → 242**；**主场景可见批次 254 不变**（阴影是独立 pass，未引入批次暴涨） |
| 守恒守护 | `tests/kit.test.mjs` §15：投影网格 178 → 64（合批合并所致）但**投影三角面 34656 逐位守恒**、**投影构件部位集合守恒**、接收侧同步守恒；水面按策略不投影但接收 |
| **台阶朝向反了** | **成立并已修**。修复前：最外端顶面 4.50m、贴台明端 0.90m（楔形）；修复后：贴台明端 **4.50m**、最外一级 **0.15m**，与丹陛御路（近端 4.747 / 远端 0.247）**同向** |
| B 区兜底 | `src/zones/forecourt.js:123 alignStairFlights()` 判据仍在；修复后它**不再触发**（区域自测 2 项断言因此失败，属预期的"应调整"项，见 §4.4） |
| C/D/E/F 影响 | **同样受影响、且已被本次修复统一纠正**（它们没有自行补偿；`kit.stairs` 的 2 处直接调用 + 各建筑内建台阶都走同一函数）。**未改任何区域文件** |
| bridge | 新增 6 个**可选**拱券参数，默认表达式与原实现同一行同式 → `metrics.arch` 与拱券顶点**逐位相同**；F 区（桥墩落地/水体零重叠）测试 **31/31 仍全绿** |
| verify | `node tests/kit.test.mjs` → **633/633，exit 0**（t22 基线 566 → +67 项）；`node scripts/audit.mjs` → **exit 0，全部预算与契约检查通过** |

---

## 1. 测量口径（先说清楚，避免误读）

- **audit 口径**：`node scripts/audit.mjs`（注入真 kit：`scripts/audit.mjs:74-75` 优先 `createKit`），
  质量档 **medium**、DPR 1、阴影贴图 1536px、Bloom on；表格里的「阴影批次」= **`castShadow === true` 的可绘制对象数**，
  按"主场景单次调用"统计；**阴影 pass 不计入可见批次**，单独一行报出（§8.2 要求分开回报）。视角为 config 注册的八视角 +
  最高可见批次取 `oblique`。
- **kit.test 口径**：Node 内场景图统计（无渲染器）；投影/接收对象数与三角面均为**几何层**计数（LOD 只计当前档、跳过不可见）。
- **"守恒"的定义**：合批会**减少对象数**（N 个构件 → M 个合批桶），因此对象数本身不可能相等；
  本任务把守恒定义为三条可机器复核的不变量：
  (a) **投影三角面守恒**（合批前后逐位相等）；(b) **投影构件部位集合守恒**（没有任何部位因合批而停止投影）；
  (c) 每个合批网格继承来源标志（`any(source.castShadow)`），且**投影/接收对象数不为 0**。

---

## 2. 修复 A：合批阴影守恒

### 2.1 缺陷复现（原始输出）

```text
$ grep -n "castShadow\|receiveShadow" src/kit/merge.js      # 修复前
（零命中）

$ grep -n "castShadow\|receiveShadow" src/kit/buildings.js  # 合批前的构件
473:    mesh.castShadow = true;
474:    mesh.receiveShadow = true;

$ node scripts/audit.mjs   # 修复前
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     58       6   80564      19       6      58       6
 C                     49       0   52016      19       6      49       0
 E                     40       3   43228      19       5      40       3
 F                     61      11   59020      20       5      61      11
 小计(区域)              247      56  241172      86      22
 阴影 pass        : 56 个投影对象；实时投影光源 1 盏（宫灯不投影）
```
→ B/C/E/F 的「阴影批次」= 各区 **InstancedMesh 数**（B 6 / E 3 / F 11），C 为 **0**：
**合批后的建筑网格一个都不投影**，只有实例化构件（由区域显式设过标志）还在投影。缺陷成立，且与主理人给的读数逐位一致。

### 2.2 修复内容

| 位置 | 改动 |
| --- | --- |
| `src/kit/merge.js` | 新增**单点**阴影策略 `shadowPolicy(config, part)`：全局开关 `config.LIGHTING.shadows.enabled`；水面（`water`）不投影但接收；其余构件投影+接收。新增 `inheritedShadowFlags(entries, config, part)`：合批网格 = `policy.castShadow && 任一来源 castShadow`（接收侧同理） |
| `mergeZone` | LOD 三档与固定组**两处**建网格都套用继承（`mesh.userData.shadow` 记录判定结果）；`bucketFor` 现在保留来源 `mesh` 引用（这是第一版实现漏掉的点：只存 geometry/matrix 时继承恒为 false——已修并复测） |
| `mergeByMaterial` | 同样继承（新增 `config` 选项） |
| `instanceMesh` / `instanceFromPoints` | 默认 `castShadow=true`、`receiveShadow=true`（与 kit 非实例构件一致），可用 options 显式关闭；`config` 关闭阴影时统一关闭 |
| `src/kit/buildings.js` | `groupFromParts` 的硬编码 `true/true` 改为同一 `shadowPolicy(env.config, part)`（**必须与合批路径同源，否则无法守恒**）；因此 `kit.water` 现在按策略只接收不投影 |

> 说明：`kit.mergeZone()` 的 wrapper 在 `src/kit/index.js`（**不在 t25 inScope**），无法给它透传 `config`。
> 因此 `merge.js` 直接 `import { CONFIG } from '../shared/config.js'` 作为**兜底配置**（只读依赖）：
> 不传 config 时也按同一份 config 策略执行；需要临时覆盖时用 `kit.mergeZone(root, { config })`（选项本就透传）。

### 2.3 守恒实测（`tests/kit.test.mjs` §15，新增 24 项断言）

```text
 · 阴影守恒：投影网格 178 → 64；投影三角面 34656 守恒；接收 179 → 65
```
断言明细（全部 passed）：合批前后投影对象数 > 0、接收对象数 > 0、**投影三角面逐位相等**、
**接收投影三角面逐位相等**、**投影部位集合相等**（roof/wall/column/truss… 一个都不少）、
水面 `castShadow=false` 且 `receiveShadow=true`、实例化构件保留投影标志、
`mergeByMaterial` 路径同样守恒且对象数确实下降、`shadowPolicy` 关闭时全不投影（含 `mergeZone(root,{config:off})` 后 0 投影）、
`kit.instance`/`instanceFromPoints` 默认投影且可显式关闭。

### 2.4 audit 分区阴影列前后对比（同一口径）

| 区域 | 批次（前→后） | **阴影批次（前→后）** | 三角面（前→后） |
| --- | --- | --- | --- |
| GREYBOX | 39 → 39 | 36 → 36 | 6344 → 6344 |
| B | 58 → 58 | **6 → 58** | 80564 → 80564 |
| C | 49 → 49 | **0 → 49** | 52016 → 52040（含 t22 台阶几何微调） |
| E | 40 → 40 | **3 → 39** | 43228 → 43228 |
| F | 61 → 61 | **11 → 60** | 59020 → 59020 |
| 小计(区域) | 247 → 247 | **56 → 242** | 241172 → 241196 |
| 环境系统 | 7 → 7 | 0 → 0 | 1757 → 1757 |
| **主场景合计** | **254 → 254** | **56 → 242 个投影对象** | 242929 → 242953 |

- **未引入批次暴涨**：主场景可见批次 254 不变（最高可见视角仍是 oblique 247/350 ✓，分区预算 B58/70、C49/50、E40/40、F61/80 全 ✓）。
- **整帧成本**：阴影 pass 现为 **242 个投影对象 + 1 盏主方向光**（`BUDGET.shadows.primaryDirectionalLights=1`，宫灯不投影）。
  修复前该 pass 只有 56 个对象（几乎空转）。**这一项成本必须由 t13 在浏览器内实测**（见 §7）。
- 若将来需要给阴影 pass 减负，`config.BUDGET.shadows.nearFieldHighQualityRadius = 180` 是现成的杠杆（近场高精度、远处不投影），
  但会破坏"合批前后一致"的守恒口径，须与主理人确认后再做（本任务未动）。

---

## 3. 修复 B：`buildStairs` 台阶递升方向

### 3.1 修复前实测（复现，原始输出）

```text
# 探针口径：近/中 LOD 对象，'stairs'/'imperialRamp' 构件按本地 z 分带取顶面 y
===== 修复前 =====
stairs        z[-34.20,-24.00]  远处(靠外)顶面 y=4.50  | 近处(贴台明)顶面 y=0.90   → 远端更高（楔形，反向 ✗）
imperialRamp  z[-34.31,-24.00]  远处(靠外)顶面 y=0.25  | 近处(贴台明)顶面 y=4.75   → 近端更高（正确 ✔）
```
即：**最高踏面 4.5m 落在离台明最远的 z=-34.2，最低 0.9m 紧贴台明 z=-24**，与同函数的丹陛御路（+Z 端最高）方向相反；
同一段台阶里"踏面"和"御路斜坡"互相穿插。根因在 `geometry.js` 的 `buildStairs`：`y1 = (done + i + 1) * actualStep` 随 `i`（随 −Z）递增。

### 3.2 修复

```js
// src/kit/geometry.js · buildStairs
- const y1 = (done + i + 1) * actualStep;
+ const y1 = Math.max(actualStep, rise - (done + i) * actualStep);   // 贴台明最高，向远端逐级递降
- h: done * actualStep                                                // 落地平台
+ h: Math.max(actualStep, rise - done * actualStep)
```
（远景质量块的台阶体量 `composeMass` 本来就是"沿坡向旋转的斜板、贴台明端最高"，与修复后的方向一致——这也是"只打在 far LOD 上看不出问题"的原因。）

### 3.3 修复后同一探针前后对比

```text
# 修复后（同一探针，near/mid/far 全档）
LOD near  stairs z[-34.2,-24]  远端=   0.3  近端(贴台明)=   4.5  最外一级= 0.15 | imperialRamp 远端=0.247  近端=4.747
LOD mid   stairs z[-34.2,-24]  远端=   0.3  近端(贴台明)=   4.5  最外一级= 0.15 | imperialRamp 远端=0.247  近端=4.747
LOD far   stairs z[-34.65,-24] 远端= 1.029 近端(贴台明)=   4.5  最外一级=1.029
```
| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 贴台明端顶面（near/mid） | 0.90 m | **4.50 m = 台基高**（断言 ±0.15m） |
| 最外一级踏面 | 4.50 m | **0.15 m = `MODULES.stairsStepHeight`**（断言 ±0.06m） |
| 与丹陛御路方向 | 相反 | **同向**（断言 sign 相等） |
| 多跑台阶（含休息平台，`runCount>1`） | 同向错误 | 贴台明最高（断言） |

`tests/kit.test.mjs` §16 新增 22 项断言：near/mid/far 三档的"贴台明一侧更高"、11 片采样单调不降、
最高踏面 = 台基高、最外一级 = 单级高、台阶与丹陛 sign 一致、30 级总数、多跑台阶（休息平台）仍同向。

### 3.4 B 区兜底与其余区域的只读核对结论

- **B 区（`src/zones/forecourt.js`）**：`alignStairFlights()` 判据（按几何实测的 y 最高/最低 25% 顶点 z 质心判定高端朝向）**仍在、且仍然正确**；
  修复后它**不再触发**（原生 kit 台阶已是正确朝向）。直接后果是 B 区自测有 **2 项断言失败**（属"应调整"项，原文如下）：

  ```text
  ✗ 台阶朝向规范化（回归 kit「台阶与丹陛斜坡反向」）：全部台阶本地高端在 +Z
     → kit 当前朝向需要翻转（若为 0 说明 kit 已修复，本用例应调整）
  ✗ 规范化工具本身：对未处理的原生 kit 台阶可检测并翻转，且幂等
     → 原生 kit 台阶朝向未检出（delta=5）
  ```
- **其余区域（只读核对，未改任何文件）**：
  | 区域 | 是否有"自行补偿台阶方向"的代码 | 直接调用 `kit.stairs` | 结论 |
  | --- | --- | --- | --- |
  | B | **有**（`alignStairFlights`） | 否（用 `kit.hall` 内建台阶 + 丹陛） | 兜底自动失效；测试需调整（1 处断言 + 1 处幂等用例） |
  | C | 无 | 有 1 处（`inner-palace.js:301`，`imperialRamp:true`） | 受影响，本次修复自动纠正 ✅ |
  | D | 无 | 无（用 `kit.hall` 内建台阶） | 同上 ✅ |
  | E | 无 | 有 1 处（`east-courts.js:331`，侧门踏道 `imperialRamp:false`） | 同上 ✅ |
  | F | 无 | 无（用 `kit.hall`/`kit.terrace` 内建台阶） | 同上 ✅（F 自测 31/31 仍全绿） |
- **建议**：仅需把 B 区那 2 条断言改为"原生 kit 台阶已正确 → `flipped=0`；对人为反向的样本仍可翻转 1 个"，即可保住幂等用例的判别力。

---

## 4. 附加：`kit.bridge` 可选拱券高程/净空参数

`src/kit/buildings.js · makeBridge` 新增（**全部可选，默认值与原表达式逐字同式**；API 说明同时写在函数 JSDoc 里）：

| 参数 | 含义 | 默认值（= 修复前行为） |
| --- | --- | --- |
| `archRadius` | 拱券水平半径（米） | `min(span × 0.18, deckY + max(1.2, |常水位| × 0.5))` |
| `archRise` | 拱券竖向矢高（米）；≠ 半径时对拱环做 Y 向缩放（可做扁拱） | `= archRadius`（半圆） |
| `archCrownY` | 拱顶标高（米） | `deckY − deckT + archTube`（`deckT = max(0.5, deckY×0.6)`） |
| `archClearance` | **净空**：拱顶到参考面的高度（给出时优先） | 不给出（crownY 走上一条） |
| `archSpringY` | 拱脚标高（米） | `archCrownY − archRise` |
| `referenceY` | 净空参考面 | `config.TERRAIN.moatWaterY` |

回显：`metrics.arch = { radius, rise, crownY, springY, clearance, referenceY, tube }`。

**默认几何不变的证据（三重）**：
1. 默认代码路径就是原来的表达式（`archRise === archRadius` 时跳过缩放分支）；
2. `tests/kit.test.mjs` §17（21 项断言）：默认 `crownY` 等于 `deckY − deckT + tube` 的同式复算；显式传入"与默认等价"的
   `archRadius/archRise/archCrownY` 后，`metrics.arch` 与**拱券顶点数组逐位相同**；
3. **修复前实测的绝对基线**（t22 时期同一参数）：三角面 **720**、`worldBounds.minY = −1.7`、`minZ = −508.9`、
   `maxZ = −469.1`、`maxY = 1.92` —— 修复后 §17 逐项断言仍相等。
   桥墩高度公式 `max(0.8, deckY − 常水位×0.4)` **未改**（F 区"桥墩落地、水体零重叠"继续成立：`zone-garden` 31/31 全绿）。
4. 新增参数生效示例：`archClearance: 4.5` → `crownY = 常水位 + 4.5`、`clearance` 回显 4.5、半径不变；
   `archRadius: 6, archRise: 1.2` → 扁拱，`springY = crownY − 1.2`。

> 文档落点说明：任务卡的 inScope **不含** `docs/handoff-kit.md`（kit 总文档），故参数说明写入
> `makeBridge` 的 JSDoc 与本回执 §4；若需并入 kit 总文档，请由该文件负责人（或后续任务）复制本节。

---

## 5. verify 真实输出

```text
$ node tests/kit.test.mjs
 · 分区 B: 220 → 31 draw calls / 42660 tri
 · 分区 C: 221 → 31 draw calls / 34784 tri
 · 分区 D: 242 → 28 draw calls / 30152 tri
 · 分区 E: 257 → 28 draw calls / 32128 tri
 · 分区 F: 269 → 31 draw calls / 51388 tri
 · 去内部面（测试殿）：4320 → 1149 三角形
 · 全 67 槽：近景三角面 191112，中景 114916，单栋最大 11596
 · totalHeight 偏差（kit 举架 vs layout 估值）：中位 26.7%，最大 38.6% (E-court1-hall)
 · 门洞解耦：layout 带 door 槽位 18 个全部获得开口，净宽最小 4.68m（门槛 0.7m）
 · 阴影守恒：投影网格 178 → 64；投影三角面 34656 守恒；接收 179 → 65
 通过 633 / 633，失败 0
exit=0        （t22 基线 566 项 → +67 项 t25 守卫，断言数只增不减）

$ node scripts/audit.mjs
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     58      58   80564      19       6      58       6
 C                     49      49   52040      19       6      49       0
 E                     40      39   43228      19       5      40       3
 F                     61      60   59020      20       5      61      11
 小计(区域)              247     242  241196      86      22
 环境系统                   7       0    1757       7       0
 主场景合计                254     242  242953
 最高可见批次：oblique = 247（预算 350） ✓
 阴影 pass        : 242 个投影对象；实时投影光源 1 盏（宫灯不投影）
 结论：全部预算与契约检查通过
exit=0

# 区域侧只读回归（**不属于 t25 verify**，仅为影响核对，未改任何区域文件）
zone-inner 32/32 ✓   zone-east 26/26 ✓   zone-garden 31/31 ✓   zones 34/34 ✓   core-walls 18/18 ✓
zone-forecourt 31/33 ✗（2 项即 §3.4 列出的"应调整"断言；run.mjs 按任务卡约定不列入 verify）
```

---

## 6. 未验证 / 边界（不得当作已验证）

1. **阴影的真实帧成本未测**：本任务只证明"投不投影"的标志与对象数（场景侧口径）。
   阴影 pass 从 56 → 242 个投影对象，**必须由 t13 在浏览器 1440×900 实测**（`avgFps/p95FrameMs` 含阴影与后处理，
   按 §8.2 分开回报主场景与整帧）。本机 headless 为 SwiftShader 软渲染，FPS 无参考价值。
2. **阴影贴图档位/偏差未调**：`mapSize`（1536/medium）与 `bias/normalBias` 仍取 config 现值，未做视觉校验；
   若出现 acne/peter-panning，属 t2 的环境系统与 t13 的验收范围（kit 只负责"投影标志正确"）。
3. **`nearFieldHighQualityRadius` 未启用**：近场高精度/远处不投影的降级策略未实现（会破坏守恒口径，需主理人裁定）。
4. **bridge 新参数的视觉验证未做**：只做了数值/几何等价与生效性断言；`archClearance` 的实际观感（拱券与水位关系）需区域作者或 t13 目视。
5. **B 区 2 项断言未由我修改**（`tests/zone-forecourt.test.mjs` 不在 inScope）：需 t6 或主理人调整；调整前 `node tests/run.mjs` 会因该套件为红（t25 的 verify 已按任务卡排除 run.mjs）。
6. **`KIT_VERSION` 仍为 `1.0.0`**：`src/kit/index.js` 不在 t25 inScope（t22 回执亦已登记该建议）；本次两处几何/合批行为变更建议一并递增为 `1.0.1`。

---

## 7. findings（交给主理人裁定/排期）

| id | severity | 问题 | 需要的修正 |
| --- | --- | --- | --- |
| t25-F1 | medium | `tests/zone-forecourt.test.mjs` 有 2 条断言依赖"kit 台阶朝向反了"这一缺陷（`:355` `fix.flipped > 0`、`:384` `first.flipped === 1`），修复后必失败；该文件不在 t25 inScope | 由 t6 改为"原生 kit 台阶 → `flipped=0`；人为反向样本 → 仍翻转 1 个"（保住幂等判别力），或由主理人改派 |
| t25-F2 | low | `KIT_VERSION` 未递增（`src/kit/index.js` 不在 inScope），而本次改了合批阴影与台阶几何 | 后续 kit 任务递增到 `1.0.1` 并同步 `docs/CONTRACTS.md` 版本对应表 |
| t25-F3 | low | `kit.mergeZone` 的 config 只能靠 `merge.js` 内的 `CONFIG` 兜底（wrapper 在 `index.js`，不在 inScope）；若将来 `CONFIG.LIGHTING.shadows.enabled` 改为 false，`kit.mergeZone(root)` 仍会按兜底 config 执行（行为正确），但无法从调用方覆盖为其他 config 除非显式传 `{ config }` | 若要让 wrapper 透传 config，需在 `src/kit/index.js` 增加 `config` 透传（另派任务） |
| t25-F4 | info | 阴影 pass 由 56 → 242 个投影对象（恢复应有的全城建筑投影），潜在帧成本上升 | t13 在浏览器实测；如超预算再讨论 `nearFieldHighQualityRadius` 降级 |
