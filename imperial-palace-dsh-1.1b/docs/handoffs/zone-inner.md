# t7 · C 区后宫（内廷）—— 开工与交付回执

> 归属任务：`t7 zone-inner`（计划 §5.3 / §6.1 / §6.4 / §8.2；CONTRACTS §3–§6、§8.3；STYLE_GUIDE §3–§5）
>
> | 项目 | 值 |
> | --- | --- |
> | 契约版本 | `CONTRACTS v1.0.1` |
> | 配置版本 | `CONFIG_VERSION 1.0.1` |
> | 布局版本 | `LAYOUT_VERSION 1.0.0` |
> | 风格基线 | `STYLE_BASELINE v1.0.0` |
> | 构件库 | `src/kit/index.js`，`KIT_VERSION 1.0.0`（t3） |
> | 引擎 | three r169（本地 `public/vendor/three`，Node 经 `tests/harness.mjs` 解析钩子） |
> | 交付时间 | 2026-09-26（第 1 次执行，attempt 1） |

---

## 1. 开工回执（2026-09-26，实施前）

```text
任务 ID / Agent：t7 / zone-inner（C 区后宫）
已读文件与版本：
  - imperial-palace-plan.md：§2.3 边界与连接、§3 风格、§5.3 后宫、§6.1 接口契约、§6.4 机位登记、
    §7.1 文件归属、§8.2 预算、§8.3 回执纪律
  - docs/CONTRACTS.md：v1.0.1（§3 createZone/ctx、§4 建筑字段与估值语义、§5 机位、§6 碰撞、§8.3 灯位）
  - docs/STYLE_GUIDE.md：STYLE_BASELINE v1.0.0（含 6 个区域机位 + 2 个内景验收视角）
  - src/shared/config.js：CONFIG_VERSION 1.0.1（色板/模数/GRADES/ROOF_TYPES/TERRAIN/BUDGET/INTERACTION）
  - src/shared/layout.js：LAYOUT_VERSION 1.0.0（区域边界、槽位、院落、连接、道路、台基、可行走面、
    障碍、院墙、机位、灯位、绿化）
  - src/kit/index.js + src/kit/{buildings,geometry,tokens,materials,merge,props}.js：构件工厂与合批 API
  - docs/handoff-kit.md（t3 归档回执）：baseY 语义、w/d 换算、举架公式、mergeZone 用法
  - tests/harness.mjs（t2）：Node ctx 构造 + 契约校验入口
  - assets/reference/palace-layout.png：已读（空间关系与观感，不作为数值来源）
可写文件（inScope）：src/zones/inner-palace.js、tests/zone-inner.test.mjs、docs/handoffs/zone-inner.md
只读依赖：src/shared/**、src/core/**、src/kit/**、index.html、public/vendor/**、scripts/**、tests/*.mjs
区域边界 / 连接 ID / 使用的 kit 与材质：
  - 区域：id='C'，bounds x[-100,100] z[80,300]，groundY=TERRAIN.innerPalaceY=0.9，drawCallBudget=50
  - 本人 owner 的连接（5）：CXN-B-C-inner-gate、CXN-C-D-side-west、CXN-C-bed-terrace-danbi、
    CXN-C-bed-terrace-north-stairs、CXN-C-bed-hall-door
    （CXN-C-E-side-east 的 owner 是 E，C 不登记；CXN-C-F-garden-west/east 的 owner 是 F）
  - kit 构件：hall / gateHall / sideHall / pavilion / courtyardGate / wall / corridor / terrace / stairs
    摆件：tree / lantern / bronze / paving（t3 额外工厂）
  - 材质：全部走 kit.materials（区域零自建 geometry/material）
消费与返回接口：消费 ctx.THREE/config/zoneLayout/kit/rng/quality（+ ctx.layout 兜底读院墙）；
  返回 root/buildings/connectors/colliders/viewpoints/lightAnchors/update/dispose（CONTRACTS §3.3）
验收命令：node tests/zone-inner.test.mjs；node tests/run.mjs；node scripts/audit.mjs
性能预算：分区 C 绘制调用 ≤50；单栋三角面 ≤24000；全城可见三角面 ≤150 万
依赖齐备情况：t1（layout/config/contracts）、t2（core/ctx/harness）、t3（kit/合批）均已交付，可开工
开工时发现的冲突（详见 §2.8，均已按"不阻断下游"的方式处理并在交付回执逐条说明）：
  1. layout-slice.js 的 courtyardWalls 以 w.zone 过滤，而 layout.WALLS 院墙只有 owner 字段 → 切片恒空；
  2. kit 的屋身门洞只对 kind='gateHall' 开放，hall/courtyardGate 正面砌满实心墙 → 可进入建筑会穿模；
  3. registry.registerZone 只读 result.colliders，不读顶层 result.connectors → 连接进不了注册表；
  4. layout.OBSTACLES 未登记院墙 → 第一人称可穿过院墙。
```

---

## 2. 交付回执（t7 zone-inner · attempt 1 · 2026-09-26）

### 2.1 文件清单

| 路径 | 行数 | 职责 |
| --- | --- | --- |
| `src/zones/inner-palace.js` | 768 | C 区后宫：12 槽位建筑、三进院落地坪与御道、12 段院墙（含门洞）、6 段廊庑、
寝殿台基（TR-C-bed）与丹陛台阶、寝殿内景（金砖地面/天花藻井/床榻/屏风/铜器/宫灯）、14 株绿化、
18 座宫灯灯体、整区合批、碰撞与机位回显 |
| `tests/zone-inner.test.mjs` | 512 | 27 项专项校验（契约、槽位一致性、三进院落、竖直定位、内景包围盒、连接对齐、
院墙门洞净空、第一人称通路可通性、碰撞、预算、生命周期、源码纪律） |
| `docs/handoffs/zone-inner.md` | 本文件 | 开工 + 交付回执 |

未触碰：`src/shared/**`、`src/core/**`、`src/kit/**`、`index.html`、`public/**`、`scripts/**`、
其他区域文件（`forecourt.js` / `garden-boundary.js` / `west-courts.js` / `east-courts.js` / `_greybox.js` /
`_template.js`）、`tests/*.mjs`（t1/t2 的文件）。

### 2.2 对外接口

```js
export const ZONE_ID = 'C';
export const ZONE_VERSION = '1.0.0';
export async function createZone(ctx) -> {
  root,            // THREE.Group，单位变换、未挂载、世界坐标已烘焙（子节点含 building-anchor:<id>）
  buildings,       // 12 条，逐字段回显 layout.SLOTS（另带 anchor/worldBounds）
  connectors,      // 5 条本人 owner 的连接（逐字段回显）
  colliders,       // { obstacles: 37, walkable: 3, ramps: 5 }
  viewpoints,      // 4 条（zone / fp-spawn / interior / focus-extra），逐字段回显 layout.VIEWPOINTS
  lightAnchors,    // 18 条 = layout 的 14 条 C 区灯位 + 4 条室内灯位（LA-C-bed-01..04）
  update, dispose, // 契约回调
  stats            // 诊断快照：drawCalls / triangles / buildingFacts / wallOpenings / merge 统计
}
```

- 只消费 `ctx.THREE/config/zoneLayout/kit/rng/quality`（+ `ctx.layout` 兜底读院墙，见 §2.8 缺陷 1）。
- 区域**零自建** geometry/material：场景中 48 个网格的几何与材质全部来自 `ctx.kit`
  （测试断言 `geometry.userData.kitOwned === true` 与 `kit.materials.isOwned(material) === true`）。
- `dispose()` 只释放 `kitOwned` 几何；共享材质/贴图不动（测试用材质 `dispose` 事件断言为 0 次）。

### 2.3 竖直定位（本区唯一的自主决策，依据 + 自检）

layout 的口径在 C 区是**两套基准**：`SLOTS.baseY` / `OBSTACLES.y0` 按"区域基准 0"给值，
而 `WALKABLE` / `VIEWPOINTS` 按"后宫地坪 `TERRAIN.innerPalaceY = 0.9`"给值
（`VP-C-fp-spawn.y = 2.55 = 0.9 + 1.65`、`WK-C-bed-interior.y = 2.4`）。本区以**可行走面与机位**为准
（它们是第一人称与内景的权威），把建筑整体抬到后宫地坪上：

| 槽位 | kit `baseY`（台基顶） | kit `terraceH` | 组原点 | 依据 |
| --- | --- | --- | --- | --- |
| 其余 10 栋 | `0.9 + 槽位 terraceH` | 槽位原值 | 0.9 | 台基露在后宫地坪之上 |
| `C-hall-bed-main` 寝殿 | `TR-C-bed.y1 = 2.4` | 0（不重复造台明） | 2.4 | 槽位的 1.5m 台基**就是** `layout.TERRACES.TR-C-bed`（同高、跨度更大）；台基顶 = `WK-C-bed-interior.y` |
| `C-gate-inner` 内廷门 | `layout.baseY = 0.9` | 0（不重复造台明） | 0.9 | 槽位 `terraceH` 就是 B(0)→C(0.9) 的高差（由地坪 + `RD-B-axis-rear-inner` 引坡实现）；台基顶 = 后宫地坪，门洞地面与 `WK-C-ground` 齐平 |

自检（tests/zone-inner.test.mjs：「竖直定位自洽」）：11/12 栋 `|kit.eaveHeightAbsolute − (layout.eaveHeight + 0.9)| ≤ 6mm`，
内廷门与 `layout.eaveHeight` 逐字段相同（5.5 == 5.5）；寝殿 `baseY == WK-C-bed-interior.y == 2.4`。
> 代价与建议：渲染几何比 `layout.OBSTACLES` 的 `y0/y1` 高 0.9（门洞 `sillY` 仍低于地面 0.9，
> 玩家照常可通行）。建议 t1 在后续版本统一这两套基准，否则 G 的水平碰撞盒与视觉体量会差 0.9m。

### 2.4 与 layout 的逐项对照

- **建筑 12/12**（id 与 `layout.SLOTS` 逐一对应，字段逐条回显）：
  `C-gate-inner, C-hall-bed-main, C-hall-bed-rear, C-side-west-main, C-side-east-main, C-side-west-rear,
  C-side-east-rear, C-gate-west, C-gate-east, C-annex-west, C-annex-east, C-pavilion-rear`
- **院落 3/3**：`CY-C-front(80~142)`、`CY-C-main(142~216)`、`CY-C-rear(216~300)`；每院有门/正殿/配房与回廊。
- **连接 5/5**（本人 owner）：位置/宽度/标高逐字段回显；北接 F（北墙 z=300，x=±84 的 10m 门洞）、
  东西接侧院（侧墙 z=124 门洞）、南接 B（z=80，宽度 = 内廷门门洞净宽 26m）。
- **道路 15 段**（zone=C）：御道/横路/绕行路铺成 `pavingLight` 条带；丹陛 2 处按连接起止标高生成台阶；
  花园出坡 2 处（z>300 归 F，本区只铺到 z=300.6）。
- **院墙 12 段**（`layout.WALLS.kind='courtWall'`，owner=C）：门洞 13 处，与连接/道路完全对齐。
- **廊庑 6 段**（`CR-C-*`）、**台基 1 处**（`TR-C-bed`）、**绿化 14 株**（花树 4，`VEG-C-inner`）。
- **机位 4 条**：`VP-C-zone`、`VP-C-fp-spawn`、`VP-C-interior`、`VP-C-bed-hall`（坐标逐字段回显；
  fp-spawn 落在 `WK-C-ground` 上、视线高 2.55 = 0.9+1.65、目标点 x=0 朝中轴；interior 落在
  `WK-C-bed-interior` 的 `x[-27,27] z[154,182]` 内，视线高 4.05 = 2.4+1.65，且低于檐口、目标点在室内）。
- **灯位 18 条**：layout 的 14 条 C 区灯位原值回显 + 4 条室内灯位（`LA-C-bed-01..04`，立在内景地面 2.4 上）。

### 2.5 实测命令与真实输出

```text
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3"
$ node tests/zone-inner.test.mjs
（节选：仅保留 info(·) 与结果行，逐字未改；完整输出见终端）
    ✓ 模块导出 ZONE_ID="C"、createZone（含 default）
    ✓ 返回值含 §3.3 全部字段且类型正确
    ✓ 返回值通过 §3.3/§4/§5/§6/§8.3 全量契约校验（零问题）
    · C 区网格 48 个，几何 48 个，全部来自 kit（零自建 geometry/material）
    ✓ 只用 kit 构件与 kit 共享材质：每个几何/材质都归属 kit（区域零自建资源）
    ✓ 源码纪律：无十六进制色值 / Math.random / 渲染循环 / scene.add / 直接导入 three
    · C 区 12 栋：C-annex-east / C-annex-west / C-gate-east / C-gate-inner / C-gate-west / C-hall-bed-main / C-hall-bed-rear / C-pavilion-rear / C-side-east-main / C-side-east-rear / C-side-west-main / C-side-west-rear
    ✓ 建筑数量 = layout 分配给 C 的槽位数，且 id 集合逐一相等（不新增、不遗漏）
    ✓ 每栋建筑逐字段回显 layout（含 bounds/entrance/door 数值）
    · 院落：CY-C-front(80~142) CY-C-main(142~216) CY-C-rear(216~300)
    ✓ 三进内廷院落的要素齐备：内廷门 / 寝殿正殿 / 后寝殿 / 东西配殿配房 / 庭院亭
    · 寝殿面阔 64m < 金銮殿 84m；内廷门 56m < 前朝门殿 72m
    ✓ 尺度收敛：后宫建筑面阔/檐高整体小于前朝同类（计划 §5.3 第二条）
    ✓ 竖直定位自洽：kit 檐口 = layout 檐口估值 + 后宫地坪 0.9（容差 6mm）
    · 单栋最大三角面：C-hall-bed-main 4012（上限 24000）
    ✓ 逐栋三角面 ≤ config.BUDGET.triangles.perBuildingMax
    ✓ 可进入建筑唯一：C-hall-bed-main visitable=true + 门洞，其余全部 visitable=false
    ✓ interior 机位落在 WK-C-bed-interior 包围盒内，视线高 = 面高 + 1.65
    · 内景：地面 2.4m，陈设 C-bed-censer/C-bed-vessel-west/C-bed-vessel-east，室内灯位 4 座
    ✓ 内景陈设全部在室内包围盒内（床榻/屏风/铜器/宫灯由 kit 构件组成）
    ✓ 登记 ≥1 zone 机位 + ≥1 fp-spawn，且 fp-spawn 在可行走面上、朝向中轴
    · C 拥有的连接：CXN-B-C-inner-gate / CXN-C-D-side-west / CXN-C-bed-terrace-danbi / CXN-C-bed-terrace-north-stairs / CXN-C-bed-hall-door
    ✓ 本人 owner 的连接全部回显，且不越权登记他人连接（单一 owner）
    ✓ B→C 内廷门接口：位置在内廷地界首线 z=80，宽度 = 门洞净宽，标高 = 内廷台基
    ✓ C→F 御花园接口：北墙线 z=300、x=±84，且院墙确实开了同宽门洞
    ✓ C↔D / C↔E 侧院接口：一进院侧墙 z=124 开门洞，位置在中央区边界 x=±100
    · 院墙门洞 13 处；其中落在高台上（净空已抬高）2 处：CY-C-front-wall-north/CY-C-main-wall-south
    ✓ 院墙门洞净空 ≥ 玩家身高 + 一级台阶（含落在寝殿月台上的门洞）
    · 障碍 37 条：建筑 12 + 院墙实心段 25
    ✓ 不可进入建筑全部登记为障碍：12 栋槽位障碍 + 院墙实心段，id 全局唯一
    · 可行走面 3 面，坡道/台阶 5 段（最大斜率 0.1667）
    ✓ 可行走面 3 面回显 layout，坡道斜率 ≤ rampMaxSlope
    · 走查通路 8 个采样点全部可通；反例（门洞旁 + 实心院墙）判定为阻挡 ✓
    ✓ 第一人称走查通路可通：内廷门 → 一进院 → 丹陛 → 月台 → 穿院墙门洞 → 寝殿内景
    · C 区包围盒 x[-100.0,100.0] y[0.5,21.3] z[79.4,300.6]（最高建筑 C-hall-bed-main）
    ✓ 场景包围盒落在 C 区地界内（无飞散、无下沉几何）
    · C 区绘制调用 48/50（合批前 496 → 后 48），三角面 48260
    ✓ 合批后绘制调用 ≤ 分区预算；三角面在可见上限内
    ✓ update(dt, elapsed, state) 不改 state/相机，重复调用不抛错
    ✓ dispose() 只释放自有几何，不销毁 kit 共享材质/贴图，且幂等
   通过 27 / 27
exit=0

$ node tests/run.mjs
 PASS  tests/core.test.mjs  507ms
 PASS  tests/kit.test.mjs  3301ms
 PASS  tests/layout.test.mjs  226ms
 PASS  tests/zone-forecourt.test.mjs  3918ms
 PASS  tests/zone-garden.test.mjs  1563ms
 PASS  tests/zone-inner.test.mjs  1229ms
 PASS  tests/zones.test.mjs  2719ms
 通过 7 / 7，失败 0，总耗时 13465ms
exit=0
（说明：本区交付过程中的一次中间运行曾为 6/7，唯一失败项是 t6 的 `tests/zone-forecourt.test.mjs`
 （其自测报出 "B-interior-caisson-boss 穿出檐口 y=10.894 > 10.71"，与本区无关）；t6 修复后复跑
 即为上表 7/7 全绿。）

$ node scripts/audit.mjs
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 --------------------------------------------------------------------------
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     64       0   80900      19       6      64       0
 C                     48       0   48260      19       6      48       0
 F                     66      11   56416      20       5      66      11
 --------------------------------------------------------------------------
 小计(区域)              217      47  191920      67      17
 环境系统                   7       0    1685       7       0
 主场景合计                 224      47  193605
 ...
 最高可见批次：oblique = 217（预算 350） ✓
 主场景绘制调用   : 224 / 上限 350  ✓
 分区 B         : 64 / 预算 70  ✓
 分区 C         : 48 / 预算 50  ✓
 分区 D         : —（模块未交付，预算 40 留给真实区域）
 分区 E         : —（模块未交付，预算 40 留给真实区域）
 分区 F         : 66 / 预算 80  ✓
 可见三角面       : 193605 / 上限 1500000  ✓
 结论：全部预算与契约检查通过
exit=0
```

### 2.6 性能（Node 侧口径）与"为何不做逐栋 LOD"

- C 区分区：**48 / 50 绘制调用**（合批前 496 个网格 → 合批后 48），三角面 **48,260**，
  单栋最大 4,012（上限 24,000），纹理 6 张（1K–2K，材质库共享）。
- 合批：`kit.mergeZone(root)` 一次（跨建筑 × 同材质同部位）；`stats.merge` 记录 before/after。
- 未做逐栋三档 LOD 的理由（实测，非推断）——C 区 12 栋建筑单独合批后的"审计全量口径"：

  ```text
  $ node --input-type=module -e '…对 12 个 C 槽位分别以 lod=auto|near|mid|far 建造并 mergeZone，
     再按审计口径（不剔除 LOD 未选档）统计…'
  lod=auto  合批前  237 次（LOD 感知）→ 审计全量口径  62 次 / 三角面 32132
  lod=near  合批前  237 次（LOD 感知）→ 审计全量口径  30 次 / 三角面 32132
  lod=mid   合批前  215 次（LOD 感知）→ 审计全量口径  25 次 / 三角面 19840
  lod=far   合批前   72 次（LOD 感知）→ 审计全量口径   7 次 / 三角面 1484
  ```

  即：**逐栋三档 LOD 单建筑一项就会到 62 次（已超 C 区 50 的预算）**，而 C 区总三角面只有 4.8 万
  （全城上限 150 万）。因此按 §8.2「用最经济手段达成指标」采用**单档（重点建筑 near、其余 mid）
  + 整区合批**；`kit.lod()`/`kit.instance()` 在本区无收益（InstancedMesh 按"每材质每部位 1 次"计，
  与本口径下合批结果相同）。
- 预算余量：48/50（2 次余量）；为换取余量已把院墙与屏风取 `detail:'far'`（kit.wall 仅"压顶脊线"
  按 detail 分支，视觉代价仅为压顶小脊线）。

### 2.7 未验证项（不得当作已验证）

1. **浏览器内画面与帧率未测**：本区只做了 Node 侧几何/契约/预算验证。1440×900 实际渲染、
   `VP-C-zone` / `VP-C-interior` / `VP-C-bed-hall` 三张固定验收视角的画面、真实 FPS/p95FrameMs、
   GPU/显存、阴影与 Bloom 整帧成本——全部**未验证**（属 t13/V2 范围）。
2. **C 区截图未产出**：`work/**` 不在本任务 inScope，故未出图；风格检查（金顶同色同光泽、
   W-E 不像素镜像、院内疏密）需 t13 用固定机位截图判定。
3. **第一人称连续走查（键鼠实操）未验证**：测试只做"路径采样点 + 障碍盒可通行判定"的机器校验
   （8 个采样点 + 2 个反例）；真人连续走查的相机手感、台阶平滑（`INTERACTION.step.smoothSeconds`）
   与卡顿未验证。
4. **三时辰下的内景可读性未验证**：室内只登记 4 座宫灯灯位，未做夜景照度实测
   （`moonlitNight` 全局偏暗的问题已在 t3 回执登记）。
5. **与其他区域同时装载的合并画面未验证**：B/F 正在并行交付中（D/E 未交付）；本区与 B 的内廷门
   两侧、与 F 的花园入口在实际同屏时的接缝（铺装高差 0.9→0.5、院墙门洞对位）只按 layout 数值对齐，
   未做同屏目视。
6. **`layout.totalHeight` 与 kit 实测的偏差未用于任何取景**（按 CONTRACTS §4.1：取景/面板一律用
   `userData.kit.worldBounds`）；本区最高建筑实测 21.3m（寝殿），layout 估值 9.57m——差异属预期。

### 2.8 发现的上游缺陷 / 接口需求（已按不阻断下游的方式处理）

| # | 位置 | 问题 | 本区处理 | 建议 |
| --- | --- | --- | --- | --- |
| 1 | `src/core/layout-slice.js`（t2） | `courtyardWalls: WALLS.filter(w => w.kind === 'courtWall' && w.zone === zoneId)` —— `layout.WALLS` 院墙只有 `owner` 字段（`makeWall(id, owner, …)`），故**每个区域的 `zoneLayout.courtyardWalls` 恒为空** | 优先用切片，为空时按 `owner` 回退读 `ctx.layout.WALLS`（同一份冻结 layout，未改共享文件） | t2 改一个词：`(w.owner ?? w.zone) === zoneId` |
| 2 | `src/kit/geometry.js`（t3） | `buildBody` 的**门洞只对 `kind === 'gateHall'` 开放**；`hall` / `courtyardGate` 的正立面砌满实心墙 → 有门洞的槽位（gateHall/courtyardGate/visitable）走原 kind 时第一人称会**穿墙** | 可通行构件（`slot.hasDoor`）统一走 `gateHall` 屋身分支：门洞净宽 = `slot.door.width` = `layout.OBSTACLES` 的 `door.width`，几何与碰撞对齐 | 给屋身加 `doorOpening`（或让 `doorHalf > 0` 即开门洞）1 行条件改动；之后本区可改回原 kind |
| 3 | 同 #2 的副作用 | `gateHall` 分支 `doubleEave = (roofSpec.doubleEave || isTower) && !isPavilion && !isGate` → **寝殿（grade3, doubleEaveHip）渲染为单檐庑殿**，且该分支不生成隔扇窗 | 保留槽位 `roofType` 回显（`doubleEaveHip`），在文件头与本节显式登记该视觉代价 | t3 修复 #2 后本区恢复重檐与隔扇窗（本文件只需改一行常量 `PASSABLE_BODY_BRANCH`） |
| 4 | `src/core/registry.js`（t2） | `registerZone` 只把 `result.colliders` 交给 `registerColliders`，**顶层 `result.connectors` 从未入注册表** → `registry.allConnectors()` 恒空 | 未绕过（保持 `colliders={obstacles,walkable,ramps}` 的契约形状）；本区 `connectors` 已在返回值中回显，直连 layout 的消费方可用 | t2 在 `registerZone` 内补 `registerColliders(zoneId, { ...result.colliders, connectors: result.connectors })` |
| 5 | `src/shared/layout.js`（t1） | `OBSTACLES` 只登记建筑/宫墙/水面/假山，**未登记 12 段院墙** → 第一人称可穿过院墙（穿模） | C 按 owner 责任补登 25 段实心碰撞盒（id `OB-<wallId>-spanN`，门洞处断开）；并按 `floorYAt` 抬高落在月台上的门洞净空（否则玩家被 1.1m 门楣卡死） | t1 决定：各区域自补（现状）还是 G 统一从 `layout.WALLS.openings` 生成；若统一生成，本区可删除 `stats.wallObstacles` 段 |
| 6 | `src/shared/layout.js`（t1） | C 区两套基准：`SLOTS.baseY`/`OBSTACLES.y0` 按 0 给值，`WALKABLE`/`VIEWPOINTS` 按 0.9 给值 | 以 WALKABLE/VIEWPOINTS 为准（§2.3），建筑抬 0.9 | t1 统一基准；否则 G 的水平碰撞盒与视觉差 0.9m |
| 7 | `src/shared/layout.js`（t1） | `CY-C-main` 南墙（z=142）横穿 `TR-C-bed` 平台（z=137..199）；东西院墙（x=±96）与寝殿东西配殿足迹（x=∓76..∓56）无重叠但与平台（x=±72）相交 | 按 layout 原值建造（不自行移动），视觉上读作"平台与院墙交接"；已在 §2.7 列为未目视项 | t1 复核后如需调整，请递增 `LAYOUT_VERSION` |
| 8 | `src/shared/layout.js`（t1） | `CXN-C-bed-hall-door.width = 20`，而槽位 `C-hall-bed-main.door.width = 26`（同一门洞两种宽度） | 以槽位/`OBSTACLES` 的 26 为准（几何门洞 = 碰撞门洞），连接仍按原值回显 | t1 对齐两处宽度 |
| 9 | `src/kit/geometry.js`（t3） | 屋身墙高 = 檐高 ×0.72，墙顶与额枋带之间留约 0.75m 开放带（全城所有建筑），室外平视可从缝看到室内上部 | 不属本区可改范围；本区建筑均按 kit 建造 | t3 复核（若为有意为之，请在 STYLE_GUIDE 说明） |
| 10 | `src/shared/layout.js` + `src/core/environment.js`（t1/t2） | 灯位锚点 `position.y = 0` 表示"区域基准"，而 `environment.js` 的 `lampY = max(0.4, y) + height×0.6` 当作绝对标高 → C 区实时灯点比灯体低约 0.9m | 灯体立在 `floorYAt(x,z)` 的实际地坪上；锚点按 layout 原值回显（室内 4 条用绝对标高 2.4） | t1/t2 统一锚点 y 的语义（区域基准 vs 绝对标高） |

### 2.9 遗留风险

1. **接口需求 #2/#3 未修复前**，C 区寝殿屋顶是单檐庑殿（槽位数据仍是 `doubleEaveHip`）——
   属"已知且已登记的视觉代价"，不是数据错误；t13 做风格检查时会看到，请以本节为准。
2. 本区绘制调用 48/50，余量 2 次；若后续需要在 C 区增加新构件，请先递减其它档位细节或与 t1 讨论
   分区预算（`config.BUDGET.drawCalls.perZone.C`，放宽须递增 `CONFIG_VERSION`）。
3. 寝殿内景的**天花**是为遮"单面朝外的屋面向内可视"而加的一层平顶（`pavingLight`，位于檐口下
   `MODULES.eaveSoffitDepth`）；它由 kit 构件拼出而非真正的藻井木构——若后续 t3 提供
   `ceiling`/`caisson` 构件，本区应替换为专用构件（当前是"用现有构件达到可读性"的最小手段）。
4. `C-gate-inner` 因 terraceH 被认定由地坪高差实现，**没有可见台基**（台基顶 = 后宫地坪）；
   若评审要求内廷门必须露台基，则需把门洞地面与 `WK-C-ground` 解耦（涉及 layout 变更），
   本区不能自行调整。

---

## 3. 结论

- 任务卡 7 条验收全部满足：`node tests/zone-inner.test.mjs` **27/27 通过**（exit 0）、
  `node tests/run.mjs` **7/7 通过**（exit 0）、`node scripts/audit.mjs` **C 区 48/50 绘制调用**
  （exit 0，全城 224/350）；三条 verify 命令的原始输出见 §2.5。
- 未做/未测内容已在 §2.7 逐条写明，未作为已验证数据上报。

---

# 附：t24 · C 区寝殿恢复重檐庑殿（撤销以形制换门洞的绕过）—— 交付回执

> 归属任务：`t24 zone-inner`（修复类，依赖 t22 的 kit 解耦）。**本节为追加**，上文 §1–§3（t7 开工与交付回执）原样保留、未改动。
>
> | 项目 | 值 |
> | --- | --- |
> | 契约/配置/布局版本 | `CONTRACTS v1.0.1` · `CONFIG_VERSION 1.0.1` · `LAYOUT_VERSION 1.0.0` |
> | kit | `src/kit/index.js`（含 t22「门洞 / 屋顶形制 / 窗 / 门扇开合」解耦：`doubleEave = (roofSpec.doubleEave \|\| isTower) && !isPavilion`，门洞只由 `door/doorOpening/openFront` 决定） |
> | 改动文件 | `src/zones/inner-palace.js`、`tests/zone-inner.test.mjs`、本回执 |
> | 时间 | 2026-09-26（attempt 1） |

## A.1 撤销绕过（改动点）

| # | 位置 | 改动 |
| --- | --- | --- |
| 1 | `src/zones/inner-palace.js` 顶部 | **删除** `const PASSABLE_BODY_BRANCH = 'gateHall'` 及其"以形制换门洞"的说明注释 |
| 2 | 同文件 | **删除** `const HALL_DOOR_OPEN_FRACTION = 0.18` 与"寝殿门扇开启比覆盖"（改由 kit 按 kind 决定：殿堂 0.18 常闭、门殿/院门 0.72 常开） |
| 3 | 建楼循环 | `const factory = slot.hasDoor ? PASSABLE_BODY_BRANCH : slot.kind;` → **`const factory = slot.kind;`**（门洞靠 layout 的 `slot.door` 数据，形制靠 `roofType/grade`，两者互不牵连） |
| 4 | `buildingFacts` | 增加 geometry 事实留档：`eaveHeight / upperEaveY / apronRise / ridgeLength / slopes / bodyW / bodyD / doorHeight / partNames`（供测试与回执核对，**不是槽位回显**） |
| 5 | 丹陛台阶 | 增加 `stats.stairsPlacements`（南/北丹陛的高端 z、朝向、抬升），供"台阶方向"回归断言 |

**未触碰**：`src/kit/**`、`src/shared/**`、`src/core/**`、其他区域文件、其他 `tests/*.mjs`（含 `tests/core.test.mjs` / `tests/zones.test.mjs`）。

## A.2 自测新增的"几何事实"断言（6 项，全部不依赖槽位数据自证）

新增一节 `2b. 寝殿重檐庑殿的几何事实（t24）`，内容与实测信息行：

```text
  · 寝殿 kit 几何：下檐口 6.21m → 上檐口 8.8182m（上层屋身 2.61m）、腰檐举高 2.22m、正脊 18.72m / 面阔 59.6m、4 坡
  ✓ 本区实际建造：寝殿按槽位 kind 建为重檐庑殿（上/下檐口分离、腰檐、长正脊、四面坡）
  · 合批后绘制批次含：lowerRoof（腰檐）+ roof（主屋面）+ ridge（正脊）
  ✓ 已合批的渲染路径里确实含腰檐部件（lowerRoof）：重檐进入最终绘制批次
  · 屋面两层：腰檐 y[6.21,8.43] / 主屋面 y[8.82,17.94]；额枋 2 带（5.22~6.21 / 8.40~8.82）
  ✓ 几何事实（按本区同参数独立重建）：双屋面层分离 + 上下两层额枋
  · 正脊水平 38.22m、脊顶 18.68m；朝上三角形象限分布 [+Z,-X,-Z,+X]=278/76/278/76
  ✓ 几何事实：长正脊位于屋脊最高处 + 主屋面四面坡（方位象限）
  · 丹陛：南 z=137（rot 0°）、北 z=199（rot 180°），抬升 1.5m
  ✓ 丹陛台阶方向：高端贴台基、向院子递降（防 kit 台阶朝向变更回归）
  · 前墙洞口 x[-13.00,13.00]（净宽 26.00m，8 个前墙三角形参与测量）；门扇中央净空 4.68m；门洞净高 3.22m
  ✓ 几何事实：正立面门洞净宽 = layout.door.width，且门扇中央净空 ≥ 玩家直径
```

断言方法（避免"注册表说重檐、渲染是单檐"）：

| 断言 | 依据（几何/metrics 事实） |
| --- | --- |
| 本区实际建造 `fact.bodyBranch === 'hall'`、`doubleEave === true` | `object.userData.kit.metrics`（kit 由几何推导，非槽位字段） |
| 上层屋身存在 | `upperEaveY − eaveHeight = 2.61m` ∈ 檐高 20%~80%；且**额枋几何分成上下两带**（5.22~6.21 落于下檐口、8.40~8.82 落于上檐口） |
| 腰檐（下层裙檐）存在 | `apronRise = 2.22m > 0`；且 `lowerRoof` 部件包围盒 y[6.21,8.43] **低于** 主屋面 y[8.82,17.94]，水平出檐范围也更大 |
| 重檐进入最终绘制批次 | 合批后的 `root` 里存在 `userData.part === 'lowerRoof'` 的网格（该部位名只由 kit 的重檐分支产生） |
| 长正脊（非尖顶） | `ridge` 部件水平跨度 38.22m ≥ 0.3×面阔 59.6m，且脊顶 18.68m ≈ `totalHeight` 17.94（最高处） |
| 四面坡（庑殿） | 主屋面"朝上"三角形的**方位象限计数** [+Z,-X,-Z,+X] = 278/76/278/76 → 4 个非零象限 |
| 门洞净宽 = layout | 正立面墙在门洞净高带内的 X 覆盖缺口（顶点法）= 26.00m = `layout.door.width`；`metrics.doorWidth = 26`；`OB-C-hall-bed-main.door.width = 26` |
| 第一人称可通行、不穿模 | 门扇（`door` 部件）中央净空 4.68m ≥ 玩家直径 0.70m；门洞净高 3.22m ≥ 玩家身高 1.80m；另有既有用例"走查通路 8 采样点可通 + 2 反例阻挡"覆盖碰撞层 |
| 丹陛方向 | kit 台阶本体"高端在组原点、向本地 −Z 递降"（探测盒 max.z≈0、min.z<-1）；本区南丹陛 z=137=台基南沿、rot 0°，北丹陛 z=199=台基北沿、rot 180° |
| 槽位数据一致性 | `slot.roofType === 'doubleEaveHip'`、`slot.grade === 3`（仅作前提，不作为形制证据） |

## A.3 三条命令的真实输出

```text
$ node tests/zone-inner.test.mjs
（节选：2b 一节见 §A.2；其余为 t7 原有用例）
    ✓ 返回值通过 §3.3/§4/§5/§6/§8.3 全量契约校验（零问题）
    ✓ 每栋建筑逐字段回显 layout（含 bounds/entrance/door 数值）
    ✓ 第一人称走查通路可通：内廷门 → 一进院 → 丹陛 → 月台 → 穿院墙门洞 → 寝殿内景
    · C 区绘制调用 49/50（合批前 485 → 后 49），三角面 52040
    ✓ 合批后绘制调用 ≤ 分区预算；三角面在可见上限内
    ✓ dispose() 只释放自有几何，不销毁 kit 共享材质/贴图，且幂等
   通过 33 / 33
exit=0

$ node scripts/audit.mjs
 质量档 medium（Dpr 1、阴影 1536px、Bloom true）；本次视角 oblique/iso/axis/zone/focus/interior/fp/orbit
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     58      58   80564      19       6      58       6
 C                     49      49   52040      19       6      49       0     ← 本区
 E                     40      39   43228      19       5      40       3
 F                     61      60   59020      20       5      61      11
 小计(区域)              247     242  241196      86      22
 环境系统                   7       0    1757       7       0
 主场景合计                 254     242  242953
 按视角可见几何（视锥剔除后）：oblique 247 / iso 247 / axis 220 / zone 247 / focus 245 / interior 241 / fp 246 / orbit 247 批次
 主场景绘制调用   : 254 / 上限 350  ✓
 分区 C         : 49 / 预算 50  ✓
 可见三角面       : 242953 / 上限 1500000  ✓
 阴影 pass        : 242 个投影对象；实时投影光源 1 盏（宫灯不投影）
 后处理           : Bloom 由时辰预设与质量档决定，未计入上述批次
 结论：全部预算与契约检查通过
exit=0

$ node tests/run.mjs
 PASS  tests/core-walls.test.mjs  529ms
 PASS  tests/core.test.mjs  1515ms
 FAIL  tests/interaction.test.mjs  3316ms
 FAIL  tests/kit.test.mjs  3932ms
 PASS  tests/layout.test.mjs  229ms
 PASS  tests/zone-east.test.mjs  1131ms
 FAIL  tests/zone-forecourt.test.mjs  4364ms
 PASS  tests/zone-garden.test.mjs  1636ms
 PASS  tests/zone-inner.test.mjs  1334ms     ← 本任务文件
 PASS  tests/zones.test.mjs  6248ms
 通过 7 / 10，失败 3，总耗时 24236ms
exit=1
```

**run.mjs 3 项红灯的归因（均非本任务文件，本任务未触碰他人文件）**：

| 红灯 | 失败项（原文摘要） | 归因 |
| --- | --- | --- |
| `tests/kit.test.mjs`（631/633） | `[16 台阶递升方向…][near] 最外一级踏面 = 单级高 0.15m（修复前为 4.5m）— 实际 0.3 ≠ 期望 0.15` | t3/t22 的**台阶几何修复在飞过程**中的自身测试 |
| `tests/zone-forecourt.test.mjs`（31/33） | `台阶朝向规范化（回归 kit「台阶与丹陛斜坡反向」）：全部台阶本地高端在 +Z` | t6 的 B 区回归用例正跟随 kit 台阶变更调整 |
| `tests/interaction.test.mjs`（43/46） | `B6 合成事件以 window 为 target…`、`D3 用户接管相机 → 导览暂停并提示` | t9（ui-engineer）在研的交互/相机用例 |

## A.4 批次口径与瓶颈分析（如实报数，不删内容）

- **口径**：`scripts/audit.mjs`，质量档 `medium`（Dpr 1 / 阴影 1536px / Bloom on），本次视角
  `oblique/iso/axis/zone/focus/interior/fp/orbit`；表中为**全量口径**（不做视锥剔除，主场景单次调用的上界估计），
  另有"视角口径"（视锥剔除后：最高 247 批次）单列；**阴影批次单列**（C 区 49），**Bloom/后处理不计入上述批次**。
- **本区 C**：合批前 485 网格 → 合批后 **49 批次**（`kit.mergeZone(root)` 调用一次），三角面 **52,040**
  （单栋最大 `C-hall-bed-main` **8,044**，上限 24,000），材质/纹理 19/6（共享 kit 库）。**49 ≤ 初始配额 50 ✓**。
- **整城门槛**：主场景 **254 / 350 ✓**、可见三角面 **242,953 / 1,500,000 ✓**（分区 B 58、E 40、F 61 均各自在配额内）。
- **瓶颈分析（形态）**：C 区批次几乎全部是"材质 × 部位"组合（49 个即 49 种组合），主要成对来自
  重檐庑殿（`lowerRoof / roof / lowerRidge 类 / upperColumn 类 / hipRidge / eaveFascia / ridgeBeast`）、
  台基栏杆（`railing / railingPanel / railingTop`）、院墙（`wallBody / wallBase / wallCoping / wallLintel`）、
  铺装（`paving / floor`）与绿化灯位（`trunk / canopy / blossom / lantern*`）。
  本区已用"单档（重点 near、其余 mid）+ 整区合批 + 树群实例化"压到配额内；**未删除任何院落/建筑/装饰**。
  若后续再加重檐细节导致越线，处理优先级为：细节档 → 部位合并（如院墙压顶脊线）→ 与 t1 讨论配额，而不是删内容。

## A.5 未验证项（不得当作已验证）

1. **浏览器内 E/C 区实际画面与帧率未验证**：本节只做 Node 侧几何/契约/批次验证；"重檐在真实渲染里是否可见"
   由几何事实（`lowerRoof` 进入合批结果 + 双层面分离 + 上下两层额枋）间接证明，**未出图**（`work/**` 不在本任务 inScope）。
2. **第一人称连续走查（键鼠实操）未验证**：门洞净宽/净空/净高按几何事实断言 + 路径采样点机器判定；
   真人操作的相机手感与贴墙感未测。
3. **kit 台阶修复在飞**：`tests/kit.test.mjs` 与 `tests/zone-forecourt.test.mjs` 正因该修复而红。
   本区丹陛按"当前 kit 事实（高端在组原点、向本地 −Z 递降）"摆放并已加回归断言；
   **若 kit 后续改变台阶朝向语义，本区丹陛朝向需同步复核**（断言会先失败，属预期保护）。
4. **`layout.totalHeight` 与 kit 实测仍有偏差**（CONTRACTS §4.1 已冻结该语义）：寝殿实测包围盒顶 21.26m，
   layout 估值 9.57m；本节所有高度断言都用 kit 实测/metrics，不用 layout 估值取景。
5. **t22 解耦后的门扇开合比**：寝殿按 `hall` 取 0.18（虚掩），中央净空 4.68m；边角贴墙感未目视。

## A.6 结论（t24）

- 验收 1–3、5 由实测直接满足：绕过代码已删除（`slot.kind` 直建）、重檐庑殿有 6 项几何事实断言守着、
  批次如实报数（C 49/50、整城 254/350，口径与瓶颈见 §A.4）、回执为本节追加（原内容保留）。
- 验收 4（三条命令全绿）**未满足**：本任务文件 `tests/zone-inner.test.mjs` 33/33 通过、
  `scripts/audit.mjs` exit 0 且"全部预算与契约检查通过"，但 `tests/run.mjs` 为 7/10，
  3 项红灯全部来自他人正在开发的用例（kit / zone-forecourt / interaction，见 §A.3 归因）。

---

## A.7 attempt 2 复验（全局 run.mjs 门槛解除后）

第 1 次提交时按验收第 4 条的严格读法判 failed：`node tests/run.mjs` 当时因**他人正在开发的用例**（t6 的 `tests/zone-forecourt.test.mjs`、t9 的 `tests/interaction.test.mjs`）而红。
attempt 2 **未改动任何 C 区实现或测试文件**（`src/zones/inner-palace.js`、`tests/zone-inner.test.mjs` 与 attempt 1 逐字节相同），仅复验并追加本节：

```text
$ node tests/zone-inner.test.mjs
    ✓ 返回值通过 §3.3/§4/§5/§6/§8.3 全量契约校验（零问题）
    · C 区网格 49 个，几何 49 个，全部来自 kit（零自建 geometry/material）
    · 寝殿 kit 几何：下檐口 6.21m → 上檐口 8.8182m（上层屋身 2.61m）、腰檐举高 2.22m、正脊 18.72m / 面阔 59.6m、4 坡
    ✓ 本区实际建造：寝殿按槽位 kind 建为重檐庑殿（上/下檐口分离、腰檐、长正脊、四面坡）
    · 合批后绘制批次含：lowerRoof（腰檐）+ roof（主屋面）+ ridge（正脊）
    ✓ 已合批的渲染路径里确实含腰檐部件（lowerRoof）：重檐进入最终绘制批次
    · 屋面两层：腰檐 y[6.21,8.43] / 主屋面 y[8.82,17.94]；额枋 2 带（5.22~6.21 / 8.40~8.82）
    ✓ 几何事实（按本区同参数独立重建）：双屋面层分离 + 上下两层额枋
    · 正脊水平 38.22m、脊顶 18.68m；朝上三角形象限分布 [+Z,-X,-Z,+X]=278/76/278/76
    ✓ 几何事实：长正脊位于屋脊最高处 + 主屋面四面坡（方位象限）
    · 丹陛：南 z=137（rot 0°）、北 z=199（rot 180°），抬升 1.5m
    ✓ 丹陛台阶方向：高端贴台基、向院子递降（防 kit 台阶朝向变更回归）
    · 前墙洞口 x[-13.00,13.00]（净宽 26.00m，8 个前墙三角形参与测量）；门扇中央净空 4.68m；门洞净高 3.22m
    ✓ 几何事实：正立面门洞净宽 = layout.door.width，且门扇中央净空 ≥ 玩家直径
    · 走查通路 8 个采样点全部可通；反例（门洞旁 + 实心院墙）判定为阻挡 ✓
    · C 区绘制调用 49/50（合批前 485 → 后 49），三角面 52040
    ✓ update/dispose 契约、共享材质不被销毁、源码纪律（无 hex/Math.random/渲染循环）
   通过 33 / 33
exit=0

$ node tests/run.mjs
 PASS  tests/core-walls.test.mjs  550ms
 PASS  tests/core.test.mjs  1493ms
 PASS  tests/interaction.test.mjs  3652ms
 PASS  tests/kit.test.mjs  5027ms
 PASS  tests/layout.test.mjs  272ms
 PASS  tests/zone-east.test.mjs  1337ms
 PASS  tests/zone-forecourt.test.mjs  4611ms
 PASS  tests/zone-garden.test.mjs  1597ms
 PASS  tests/zone-inner.test.mjs  1293ms
 PASS  tests/zones.test.mjs  7117ms
 通过 10 / 10，失败 0，总耗时 26951ms
exit=0

$ node scripts/audit.mjs
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     58      58   80564      19       6      58       6
 C                     49      49   52040      19       6      49       0     ← 本区
 D                     39      38   45524      18       5      39       6
 E                     40      39   43228      19       5      40       3
 F                     61      60   59020      20       5      61      11
 小计(区域)              286     280  286720     104      27
 环境系统                   7       0    1889       7       0
 主场景合计                 293     280  288609
 按视角可见几何（视锥剔除后）：oblique 286 / iso 286 / axis 258 / zone 286 / focus 284 / interior 280 / fp 285 / orbit 286 批次
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 C         : 49 / 预算 50  ✓（B58/70 ✓ D39/40 ✓ E40/40 ✓ F61/80 ✓）
 可见三角面       : 288609 / 上限 1500000  ✓
 阴影 pass        : 280 个投影对象；实时投影光源 1 盏（宫灯不投影）
 后处理           : Bloom 由时辰预设与质量档决定，未计入上述批次
 结论：全部预算与契约检查通过
exit=0
```

口径与 §A.4 一致：质量档 `medium`（Dpr 1 / 阴影 1536px / Bloom on）、视角 `oblique/iso/axis/zone/focus/interior/fp/orbit`、
表为**全量口径**（不剔除视锥，主场景单次调用的上界估计）、阴影批次单列、Bloom 后处理不计入。
C 区 **49/50**、整城 **293/350**、可见三角面 **288,609/150 万**、单栋最大 `C-hall-bed-main` 8,044（上限 24,000），**未删任何院落/建筑/装饰**。

未验证项同 §A.5（浏览器内实际画面与帧率、固定验收视角截图、真人第一人称连续走查、kit 台阶朝向语义变更后的丹陛复核、`layout.totalHeight` 估值与 kit 实测差异）。

---

# 附：t63 · C/E 区 18 栋内景布陈设（复用 kit.interiorSet）—— 交付回执

> 归属任务：`t63 zone-inner`（用户在计划外新增需求：47 栋封闭建筑"进得去、看得见室内"；本卡负责 **C 9 + E 9 = 18 栋**）。
> 依赖：t60（layout 注册 47 栋内景）、t61（`kit.interiorSet`）、t70/t72/t73/t74（派生 WK/VP/FP 与通行语义）。
> **本节为追加**，上文 §1–§3（t7）与 §A（t24）原样保留。

## B.0 版本与口径

| 项目 | 值 |
| --- | --- |
| ROOT | `imperial-palace-dsh-1.1b` |
| 布局 | `LAYOUT_VERSION 1.1.x`（`INTERIOR_BY_SLOT` 43 栋 = 2 殿 + 2 门殿 + 4 城门 + 12 殿 + 23 配殿） |
| 构件库 | `kit.interiorSet`（t61，四档分层 hall/sideHall/gateHall/cornerTower；零新增令牌） |
| 内景判据 | `CONTRACTS §12`：低空/近景类（focus/fp/interior/axis）**内容暗区 ≤30%**、**内容高光截断 ≤5%**、内容均值 ≥0.04（`--interior-min-luma`） |
| 预算口径 | `scripts/audit.mjs`：质量档 `medium`（Dpr 1 / 阴影 1536px / Bloom on）；**LOD 激活档口径**（统计前对每个 LOD 调 `update(camera)`）；合批后；阴影批次单列；Bloom 后处理**不计入** |
| 测量工具 | 出图：`Page.captureScreenshot`（1440×900、DPR 1）驱动真应用；像素判据：`node scripts/shot.mjs --stats-only=<png...>`（同一份 luma/暗区/截断定义） |

## B.1 交付内容（18 栋，逐栋）

改动仅 5 个 inScope 文件：`src/zones/inner-palace.js`、`src/zones/east-courts.js`、`tests/zone-inner.test.mjs`、`tests/zone-east.test.mjs`、本回执。
两区各自新增一段"内景布景"逻辑，**尺寸/地坪只取自 layout 注册的 `WK-<slotId>-interior`（含 `WK-C-bed-interior` 别名，经 `ctx.layout.interiorFor()` 解析）**，不自行推断：

| 区 | 建筑 | kind | grade | 室内地面 y | 天花 y | kit 返回构件数 |
| --- | --- | --- | --- | --- | --- | --- |
| C | C-gate-inner（内廷门） | gateHall | 2 | 0.9 | 4.9 | 7 |
| C | C-hall-bed-main（寝殿正殿，既有别名 WK-C-bed-interior） | hall | 3 | 2.4 | 8.01 | 13 |
| C | C-hall-bed-rear（后寝殿） | hall | 2 | 1.2 | 5.89 | 11 |
| C | C-side-west-main / C-side-east-main | sideHall | 2 | 0.8 | 4.49 | 7 / 7 |
| C | C-side-west-rear / C-side-east-rear | sideHall | 1 | 0.6 | 3.69 | 7 / 7 |
| C | C-annex-west / C-annex-east | sideHall | 1 | 0.5 | 3.59 | 7 / 7 |
| E | E-court1/2/3/4-hall（文华殿/陈设正堂/生活主屋/东后殿） | hall | 2 | 1.4/1.4/1.3/1.3 | 6.09/6.09/5.99/5.99 | 11 ×4 |
| E | E-court1/2/3/4-house + E-court3-annex | sideHall | 1 | 0.9/0.9/0.9/0.9/0.9 | 4.09/4.09/4.09/4.09/4.09 | 7 ×5 |
| **排除** | C-pavilion-rear（亭）、C-gate-west/east（院门）、E-court3/4-pavilion（水榭/亭）、E-court1..4-gate（院门） | — | — | — | — | 0（layout 未注册内景） |

每栋同时：① 补一层**天花**（`kit.paving` + `pavingLight` 令牌，顶到墙、压住 kit 藻井）——kit 屋面为单面朝外，室内抬头会看见天空，必须补；
② 登记 **2 条室内灯位**（`LA-<ZONE>-<slotId>-01/02`，`role='interiorLantern'`）+ 2 座灯体（`kit.lantern`，`detail:'far'`）——供环境系统按距离激活，夜景/夕照内景照度所需；
③ 收紧内景 LOD 档距（`INTERIOR_LOD_DISTANCE_SCALE = 0.4` ⇒ 约 `[0, 36, 120]m`）：数十米外切到 kit 刻意留空的**空远景档** ⇒ 远景/全城视角 0 新增调用，而 `VP-<slotId>-interior` 机位（≤20m）仍取 near 全细节档。
（上述三项都用**已存在的**材质/部位桶：`pavingLight|paving`、`lanternBase/Post/Body`、`floor/ceiling/furniture/...`，不新增材质令牌。）

## B.2 碰撞与可达性（真实碰撞数据，逐栋结论）

区域返回的 `colliders` 来自 layout（可行走面 69 → C/E 的室内面 + t75 门洞通道面）+ 建筑障碍 `blocks:'exceptDoor'`。逐栋机器断言（`tests/zone-*.test.mjs` 的"碰撞可达性"用例，**不使用相机近平面**）：

| 判据 | 结论 |
| --- | --- |
| 室内可站立 | 9+9 栋：室内中心点（地面高度）不被任何障碍阻挡 ⇒ **全部可站立** ✓ |
| 可从入口门洞走入 | 9+9 栋：layout 的 `WP-fp-<slotId>`（门洞内侧 1.5m）所在可行走面存在且该点不被阻挡 ⇒ **全部可走入** ✓ |
| 不可从外部穿墙进入 | 9+9 栋：门洞旁外墙中线取点必须被阻挡（建筑障碍 `blocks='exceptDoor'` 且门洞净宽 = `layout.door.width`）⇒ **全部不可穿墙** ✓ |
| 不掉出 | 9+9 栋：室内可行走面 `kind='interior'`、`enterable=true`、`y` = layout 注册地面 ⇒ **不会掉出** ✓ |

## B.3 预算（47 内景全布后，含口径与配额申请）

`node scripts/audit.mjs`（LOD 激活档口径，质量档 medium）：

| 区域 | 绘制调用 | 分区初始配额 | 判定 | 三角面 | 阴影批次 |
| --- | --- | --- | --- | --- | --- |
| B | 61 | 70 | ✓ | 80,716 | 60 |
| **C（本卡）** | **55** | **50** | ✗ 超 5 | 57,656 | 54 |
| D（他卡同期） | 48 | 40 | ✗ 超 8 | 46,340 | 46 |
| **E（本卡）** | **49** | **40** | ✗ 超 9 | 47,008 | 47 |
| F | 72 | 80 | ✓ | 65,224 | 70 |
| **主场景合计** | **331** | **350** | **✓** | **305,753 / 1,500,000** ✓ | 313（1 盏主方向光投影） |

- **口径**：`audit.mjs` 输出的"批次(激活档)"= 合批后、按相机距离激活单一 LOD 档的可见网格数；阴影批次单列；Bloom 后处理不计入；可见三角面为视锥剔除后的视角口径（最高 `oblique` 324 批次）。
- **超配额原因（如实记录，未删任何内容）**：本卡带来的是**用户在计划外新增的需求**——47 栋封闭建筑要从"能进"变成"看得见室内"，`kit.interiorSet` 的内景部位词表（floor/runner/dais/daisCap/throne/furniture/screenPanel/trim/ceiling/lanternGlow）在区域里是**新增的材质×部位组合**，C 区净增 ~11 桶、E 区净增 ~9 桶（D 区同期同因 +8）。分区初始配额（C50/E40/D40）是在"只做外观"的假设下定的。
- **已做的优化（不牺牲内容）**：① 一次 `kit.mergeZone` 整区合批；② 内景 LOD 档距收紧 + kit 空远景档 ⇒ 远景/全城 0 新增调用；③ 天花/灯体复用既有桶（0 新增）；④ 树上实例化（E 区既有）。
- **配额申请（按 §8.2 提议，请主理人裁定）**：C 50 → **60**、E 40 → **50**、D 40 → **50**（各留 ~5 桶余量）；或改判"分区配额为诊断指标、以整城 ≤350 为硬门槛"（当前 331/350 ✓，若 B/D/F 后续再增内景，整城将接近上限，需统一复核）。**本卡未删除任何建筑/院落/装饰腾预算。**

## B.4 §12 三时辰可读性实测（逐栋逐时辰，原始判定行）

### B.4.1 方法（含工具缺口）

应用**没有"按机位/建筑出内景图"的查询参数**（`?view=interior` 只能按 `?zone=` 回退到该区 legacy/首个内景机位；`?focus=` 只影响 focus 模式）。因此本卡用一次性 CDP 驱动（`Page.navigate` → `window.__PALACE__.store.patch({view:{interiorViewpointId,area}})` + `rig.applyMode('interior',{instant:true})` + `settle()` → `Page.captureScreenshot`，1440×900 DPR1、质量档 medium），像素判据仍走**项目自己的** `node scripts/shot.mjs --stats-only=<png…>`（同一份 luma/暗区/截断定义，`viewFromFilename` 识别为 interior ⇒ 低空/近景类：内容暗区 ≤30%、内容截断 ≤5%、内容均值 ≥0.04）。

### B.4.2 goldenHour：18/18 逐栋实测（原始数字，PASS/FAIL 按 §12 阈值机械判定）

| 建筑 | 时辰 | 内容均值(≥0.04) | 内容暗区(≤30%) | 内容截断(≤5%) | 内容像素 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| C-annex-east | golden | 0.4476→0.4476 | 0.02% | **0.31%** | 100.0% | PASS |
| C-annex-west | golden | 0.4476→0.4463 | 0.05% | **0.31%** | 100.0% | PASS |
| C-gate-inner | golden | 0.4476→0.2465 | 0.98% | **0.08%** | 76.9% | PASS |
| C-hall-bed-main | golden | 0.4476→0.2859 | 0.90% | **0.06%** | 100.0% | PASS |
| C-hall-bed-rear | golden | 0.4476→0.4459 | 0.33% | **0.07%** | 86.3% | PASS |
| C-side-east-main | golden | 0.4476→0.4950 | 0.00% | **6.36%** | 82.9% | **FAIL** |
| C-side-east-rear | golden | 0.4476→0.4375 | 0.05% | **0.32%** | 78.0% | PASS |
| C-side-west-main | golden | 0.4476→0.4927 | 0.00% | **5.41%** | 82.9% | **FAIL** |
| C-side-west-rear | golden | 0.4476→0.4357 | 0.09% | **0.32%** | 78.0% | PASS |
| E-court1-hall | golden | 0.4476→0.4397 | 0.34% | **0.19%** | 83.7% | PASS |
| E-court1-house | golden | 0.4476→0.4510 | 0.04% | **0.31%** | 100.0% | PASS |
| E-court2-hall | golden | 0.4476→0.4365 | 0.03% | **0.20%** | 84.7% | PASS |
| E-court2-house | golden | 0.4476→0.4063 | 0.37% | **0.08%** | 76.9% | PASS |
| E-court3-annex | golden | 0.4476→0.4115 | 0.00% | **0.49%** | 78.1% | PASS |
| E-court3-hall | golden | 0.4476→0.4272 | 0.03% | **0.23%** | 87.5% | PASS |
| E-court3-house | golden | 0.4476→0.4038 | 0.36% | **0.08%** | 77.5% | PASS |
| E-court4-hall | golden | 0.4476→0.4316 | 0.03% | **0.19%** | 88.5% | PASS |
| E-court4-house | golden | 0.4476→0.4060 | 0.37% | **0.08%** | 76.9% | PASS |

（原始行可在 `/tmp/t63-shots/t63-interior-<slotId>-golden.png` + `--stats-only` 复现；图片不在 inScope 内故未入库。）

**结论（goldenHour）**：**18/18 内容暗区达标**（最大 0.98%）、**18/18 内容均值达标**（最小 0.2465）、**16/18 高光截断达标**；**2 栋不达标**：
- `C-side-west-main` 截断 **5.41% > 5%**；`C-side-east-main` 截断 **6.36% > 5%**（其余 E 区最大 0.49%）。

**最小修法（本次已实施其一，未复测）**：逐像素定位（自写 PNG 解码 + 亮度>230/255 的 12×8 网格分布）显示亮斑集中在**画面中下部**（行 y3–y7、列 1–4/8–9 一带；y0–y2 上部干净）⇒ **不是天花**，而是**室内自发光灯具 `lampGlow` + 受光石活/地面**：
1. ✅ 已实施：删除本卡为每栋额外增加的 2 座 `kit.lantern` 灯体（其 `lampGlow` 自发光体是室内画面里最亮的小面积高光源）——**灯位 `LA-…` 照旧登记**（环境系统按距离点亮），`kit.interiorSet` 自带灯具保留；两区测试仍全绿（C 35/35、E 31/31）。
2. ⏳ 待复测/待裁定：若仍超 5%，下一步最小修法是 **t61 给 `interiorSet` 的自发光体加亮度上限（或按 `grade` 降 `lampGlow` 强度）**，或对 grade 1/2 配殿把地面令牌从 `pavingStone` 换为更暗的 `pavingDark`——两者都**不动 §12 判据**。
3. ⏳ **dusk / night 两批逐栋实测未完成**（未验证）：本机 headless（SwiftShader）连续多页加载后渲染器会停滞/白屏——首批 18 golden + 12 dusk 成功，其后批次返回 5.7KB 纯白图（`--stats-only` 显示内容截断 100%）；项目自带 `scripts/shot.mjs --view=interior --zone=C/E --preset=all` 可稳定出图但**只能取到每区一个内景机位**（工具缺口见 B.5#2）。⇒ **C/E 18 栋 × dusk/night 的可读性判定为未验证**，不得当作通过。



## B.5 未验证项与发现

1. **未验证**：真人第一人称走查手感（进入 18 栋内景的移动/贴墙感）；三个时辰下 18 栋内景的**目视风格**（本卡只做 §12 像素判据与几何断言）；`?mask=sky` 真天空掩码口径下的内景（§12 对 interior 已豁免该防护）。
2. **工具缺口（建议另开卡）**：应用**没有"按机位 id / 建筑 id 出内景图"的查询参数**（`?view=interior` 只能按 `?zone=` 回退到该区 legacy/首个内景机位）。本卡为拿到 18×3 的真实像素判据，用 CDP（`Page.navigate` + `window.__PALACE__.store.patch/rig.applyMode/settle` + `Page.captureScreenshot`）自建一次性驱动（**临时脚本，未落库**）；建议在 `main.js`/`camera.js` 增加 `?interior=<slotId|vpId>` 或给 `scripts/shot.mjs` 加 `--interior=<slotId>`，否则 B/D/F 三卡都要重复这套一次性驱动。
3. **期间观察到的外部红灯**：`garden-boundary.js` 曾在运行中途抛 `ReferenceError: ZONE is not defined`（t65 在写盘的瞬时状态；现已被其修复，audit 可跑通）；`tests/zone-forecourt/zone-garden/zone-west/verify-*` 在当前 HEAD 下红（**非本卡文件**，属各区域/验收卡在飞过程中的自身用例），本卡未触碰。
4. **口径变更提醒**：本分支 `audit.mjs` 已改为 **LOD 激活档口径**，同一份内容在"全档口径"下会虚高 ~+12 桶/区；跨报告比较必须写明口径（本节已写明）。

## B.6 verify 四条（真实输出）

```text
$ node tests/zone-inner.test.mjs
  ✓ 内景登记与 layout 一致：C 区 9 栋（殿 2 + 门殿 1 + 配殿/配房 6），亭/院门排除
  ✓ 9 栋内景机位逐一落在各自室内包围盒内（视线高 = 面高 + 1.65、不出顶、目标在室内）
  ✓ 9 栋内景均调用 kit.interiorSet：几何事实（边界/落地/不穿顶/LOD 空远景档）
  ✓ 内景进入最终绘制批次（合批后含 kit 内景部位词表）且室内灯位在内景内
  ✓ 碰撞可达性（真实碰撞数据）：9 栋每栋可从门洞走入、可在室内站立、不可穿墙进入
  · 内景构件：C-gate-inner:gateHall:7件 | C-hall-bed-main:hall:13件 | C-hall-bed-rear:hall:11件 | C-side-*:sideHall:7件 ×6
 通过 35 / 35     exit=0

$ node tests/zone-east.test.mjs
  ✓ 内景登记与 layout 一致：E 区 9 栋（殿 4 + 配房 5），亭/水榭/院门排除
  ✓ 9 栋内景机位逐一落在各自室内包围盒内（视线高 = 面高 + 1.65、不出顶、目标在室内）
  ✓ 9 栋内景均调用 kit.interiorSet：几何事实（边界/落地/不穿顶/LOD 三档）
  ✓ 内景进入最终绘制批次 + 每栋 2 条室内灯位（均在室内包围盒内）
  ✓ 碰撞可达性（真实碰撞数据）：9 栋每栋室内可站立、门洞可走入、外墙不可穿
 通过 31 / 31     exit=0

$ node tests/run.mjs
 PASS  tests/core*.test.mjs（8 个）+ kit + layout + shot-mask + zones
 PASS  tests/zone-east.test.mjs  1155ms
 PASS  tests/zone-forecourt.test.mjs  2449ms
 PASS  tests/zone-garden.test.mjs  1741ms
 PASS  tests/zone-inner.test.mjs  706ms
 PASS  tests/zone-west.test.mjs  2996ms
 FAIL  tests/verify-completeness.test.mjs  52296ms
 FAIL  tests/verify-experience.test.mjs  15803ms
 通过 18 / 20，失败 2，EXIT=1

  ↓ 两项红均为**验收卡（V 系列）**的用例，逐条归因（含本卡相关的部分）：
  · B1/B10/5.3 连通性：43 内景机位中 24 栋的"门内走查点/内景机位"**不在主连通分量**——
    失败清单里属本区的有：VP-C-side-west-rear-interior、VP-C-hall-bed-rear-interior、
    VP-E-court1-hall-interior、VP-E-court2-hall-interior、后寝殿门内、文华殿门内、陈设正堂门内 等；
    验收卡同时给出根因数据「5.4/5.4b：**通道面 y ≠ 内景地面 24 栋**（C-annex-east 0.5 vs 1.4、C-hall-bed-rear 1.2 vs 2.1、
    C-side-*-main 0.8 vs 1.7、E-court*-hall 0.9~1.0 vs 1.3~1.4 …）」⇒ **t75 的门洞通道面（layout 数据）y 与内景地面不一致，
    导致真实可行走图上"室内 ↔ 室外"断开**。属 `src/shared/**`（本卡 out of scope，不得改）。
  · C1 逐区绘制调用：`超预算：C 58/50, D 52/40, E 52/40` —— 与本卡 B.3 的结论一致（新增内景需求的内景词表，
    D 区同期同因）；本卡已按要求"如实报数 + 优化 + 申请配额"。
  · F1 24 张判据：`fp/golden 暗区 0.01%>30%(掩码防护)`、`orbit/dusk|night 0%>15%` —— 属截图/掩码卡（t2/t13）口径问题，与本卡无关。

$ node scripts/audit.mjs
 主场景绘制调用   : 333 / 上限 350  ✓
 分区 B 61/70 ✓   C 55/50 ✗   D 48/40 ✗   E 49/40 ✗   F 72/80 ✓
 可见三角面       : 305,753 / 1,500,000  ✓
 阴影 pass        : 313 个投影对象；实时投影光源 1 盏（宫灯不投影）
 结论：3 项未通过（均为**分区诊断配额**：C/D/E）；整城门槛全绿     exit=0
```
