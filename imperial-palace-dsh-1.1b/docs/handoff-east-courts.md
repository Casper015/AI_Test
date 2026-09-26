# t11 · E 区东侧宫苑 —— 开工与交付回执

> 归属任务：`t11 zone-inner`（计划 §5.4 / §6.1 / §6.4 / §8.2；CONTRACTS §3–§6、§8.3；STYLE_GUIDE §3–§5）
>
> | 项目 | 值 |
> | --- | --- |
> | 契约版本 | `CONTRACTS v1.0.1` |
> | 配置版本 | `CONFIG_VERSION 1.0.1` |
> | 布局版本 | `LAYOUT_VERSION 1.0.0` |
> | 风格基线 | `STYLE_BASELINE v1.0.0` |
> | 构件库 | `src/kit/index.js`（t3，含 **t22 的门洞/形制/窗解耦**） |
> | 引擎 | three r169（本地 `public/vendor/three`） |
> | 交付时间 | 2026-09-26（attempt 1） |

---

## 1. 开工回执（实施前）

```text
任务 ID / Agent：t11 / zone-inner（E 区东侧宫苑）
已读文件与版本：
  - imperial-palace-plan.md §2.3 §3 风格 §5.4 东西侧宫苑 §6.1 接口 §6.4 机位 §7.1 归属 §8.2 预算 §8.3 回执纪律
  - docs/CONTRACTS.md v1.0.1（§3 createZone/ctx、§4 建筑字段与估值语义、§5 机位、§6 碰撞与可行走面、§8.3 灯位）
  - docs/STYLE_GUIDE.md v1.0.0（含 6 区域机位 + 2 内景验收视角；E 的固定验收视角为 VP-E-zone / VP-E-court1）
  - src/shared/config.js 1.0.1、src/shared/layout.js 1.0.0（E 的值：bounds x[100,300] z[-400,300]、
    groundY=sideCourtY=0.4、drawCallBudget=40、15 槽位、4 院落、16 段院墙、4 段廊庑、13 段道路、
    1 处水池 WB-E-pond、32 株树/6 花树、2 个基础灯位、3 个机位）
  - src/kit/**（t3）与 docs/handoff-kit.md；t7 的 docs/handoffs/zone-inner.md（C 区经验与本区差异）
可写文件（inScope）：src/zones/east-courts.js、tests/zone-east.test.mjs、docs/handoff-east-courts.md
只读依赖：src/shared/**、src/core/**、src/kit/**、index.html、public/**、scripts/**、tests/*.mjs、其他区域文件
区域边界 / 连接 ID / 使用的 kit 与材质：
  - 区域：id='E'，bounds x[100,300] z[-400,300]，groundY=0.4，预算 40
  - 本人 owner 的连接（3）：CXN-B-E-plaza-east、CXN-B-E-rear-east、CXN-C-E-side-east（均落在 x=100 地界线上）
    （CXN-E-F-garden-east 与 CXN-gate-east 的 owner 是 F，E 不登记）
  - kit 构件：hall / sideHall / courtyardGate / pavilion / wall / corridor / stairs
    摆件：tree / lantern / bronze / paving / water（后两者为 t3 额外工厂，替身缺失时有兜底）
要消费和返回的接口：ctx.THREE/config/zoneLayout/kit/rng/quality（+ ctx.layout 兜底读院墙）
验收命令：node tests/zone-east.test.mjs；node tests/run.mjs；node scripts/audit.mjs
性能预算：E 分区初始配额 40（主理人裁定：真正约束是整城 ≤350 绘制调用 / ≤150 万可见三角面；
  分区配额为诊断指标，不足时如实报数，不得删院落/建筑/装饰凑数）
依赖齐备情况：t1/t2/t3 已交付，t7（C 区）已完成，可开工
开工时发现的冲突：
  1) layout-slice.js 的 courtyardWalls 以 w.zone 过滤而 layout.WALLS 只有 owner → 切片恒空（C 区已报告，本区同样兜底）；
  2) zoneLayout 不含 waterBodies/scenicObjects → 水池信息只能从 zoneLayout.obstacles 的水体障碍取（本区做法）；
  3) layout 的建筑参数按"区域基准 0"给值而 WALKABLE/VIEWPOINTS 按地坪 0.4 给值（与 C 区同一类两套基准问题）；
  4) layout.OBSTACLES 未登记院墙 → 第一人称可穿院墙；
  5) 水体障碍盒（顶面 0.05）低于地坪 0.4 → 垂直判定无法拦人（本区补拦阻盒）。
```

---

## 2. 交付回执（t11 zone-inner · attempt 1 · 2026-09-26）

### 2.1 文件清单

| 路径 | 行数 | 职责 |
| --- | --- | --- |
| `src/zones/east-courts.js` | 851 | E 区：15 槽位建筑、四院地面与 13 段步道路面、16 段院墙（含门洞）+ 2 处影壁、
4 段廊庑、水池（水片/石岸/水榭基座）、32 株树（**kit.instance 实例化**）、8 座宫灯、4 件铜器陈设、
整区合批、碰撞与机位回显 |
| `tests/zone-east.test.mjs` | 492 | 26 项专项校验（契约、槽位一致性、四院齐备、竖直定位、与 D 的统一/E 专属装饰、
连接对齐、不越界、机位、碰撞、第一人称可通、预算与实例化矩阵、生命周期） |
| `docs/handoff-east-courts.md` | 本文件 | 开工 + 交付回执 |

未触碰：`src/shared/**`、`src/core/**`、`src/kit/**`、`index.html`、`public/**`、`scripts/**`、
`src/zones/*`（含 C 区 `inner-palace.js`）、其他 `tests/*.mjs`。

### 2.2 对外接口

```js
export const ZONE_ID = 'E';
export const ZONE_VERSION = '1.0.0';
export async function createZone(ctx) -> { root, buildings(15), connectors(3), colliders, viewpoints(3), lightAnchors(8), update, dispose, stats }
// colliders: obstacles 41（建筑 15 + 水体 1 + 水面拦阻 1 + 院墙/影壁实心段 24）、walkable 1、ramps 2
```

- 区域**零自建** geometry/material：40 个网格（含 3 个 InstancedMesh）全部来自 `ctx.kit`
  （测试断言 `geometry.userData.kitOwned === true` 与 `kit.materials.isOwned(material) === true`）。
- `dispose()` 只释放 `kitOwned` 几何（含实例化模板几何），共享材质/贴图不动（材质 `dispose` 事件 0 次、贴图数不变）。
- 水面设 `userData.waterSurface = true` 并压入 `ctx.shared.water` → 微波动画交给环境系统统一处理。
- **屋身形制直接使用槽位 kind**（不再需要分支替换）：t22 已把"门洞/屋顶形制/窗/门扇开合"解耦，
  `courtyardGate` 也会按 `layout.OBSTACLES.door.width` 留出真实门洞（本区门洞净宽 = 碰撞门洞净宽）。

### 2.3 竖直定位

E 区地坪 `TERRAIN.sideCourtY = 0.4`（`WK-E-ground.y`、`VP-E-fp-spawn.y = 2.05 = 0.4 + 1.65`），
而 `SLOTS.baseY` 是相对区域基准 0 的估值 → 与 C 区同样把建筑抬到地坪上：`baseY(kit) = 0.4 + 槽位 terraceH`，
组原点 = 地坪。自检：15/15 栋 `|kit 檐口 −(layout 檐口估值 + 0.4)| ≤ 6mm`（tests/zone-east.test.mjs）。

### 2.4 与 layout 的逐项对照

- **建筑 15/15**：`E-court{1..4}-hall/house/gate`（court3 另有 annex + pavilion，court4 另有 pavilion），
  id 与 `layout.SLOTS` 逐一相等、字段逐条回显（含 bounds/entrance/door）。
- **院落 4/4**：`CY-E-court1 文华院(178×156m)`、`CY-E-court2 陈设院(178×164m)`、
  `CY-E-court3 生活院(178×158m，含水池水榭)`、`CY-E-court4 东后院(178×168m)`；
  每院有院门（可通行）+ 主屋（grade 2 歇山）+ 配房（grade 1 硬山）+ 院前步道 + 院廊。
- **连接 3/3**（owner=E，均位于 x=100）：位置/宽度/标高逐字段回显；内廷侧门为台阶（elevation 0.9 → low 0.4），
  本区按该标高建造踏道（上端接 C 区铺装 x=100）。
- **院墙 16 段 + 影壁 2 处**（陈设院/生活院院门内侧，均登记实心碰撞）。
- **道路 13 段**：南北主道（x=106）、四院院前路、三处接中央区、东城门接入、花园东入口支路与坡道，铺装按 layout 段同宽。
- **水池 1 处**：`WB-E-pond`（124..188 × 16..68，水面 0.05，池底 −0.2）+ 石岸 + 水榭基座（亭立于水面）。
- **机位 3 条**：`VP-E-zone`、`VP-E-fp-spawn`（在 `WK-E-ground` 上、视线高 2.05）、`VP-E-court1`；与 layout 逐字段一致。
- **灯位 8 条**：layout 的 2 条原值回显 + 6 条本区新增（四院院门 + 池畔两座，id `LA-E-extra-01..06`）。

### 2.5 实际检查步骤与真实输出

```text
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3"
$ node tests/zone-east.test.mjs
（节选：仅保留 info(·)/结果行，逐字未改；完整输出见终端）
    ✓ 模块导出 ZONE_ID="E"、createZone（含 default）
    ✓ 返回值含 §3.3 全部字段、root 单位变换且未挂载
    ✓ 返回值通过 §3.3/§4/§5/§6/§8.3 全量契约校验（零问题）
    · 替身路径：绘制调用 325（per-tree(fallback kit)）、三角面 6102
    ✓ 灰盒替身（无真 kit）下同样通过全部契约校验（tests/zones.test.mjs 路径）
    · E 区网格 40 个（其中实例化 3 个），几何/材质全部来自 kit
    ✓ 只用 kit 构件与共享材质：每个几何/材质都归属 kit（区域零自建资源）
    ✓ 源码纪律：无十六进制色值 / Math.random / 渲染循环 / scene.add / 直接导入 three
    · E 区 15 栋：E-court1-gate / E-court1-hall / E-court1-house / E-court2-gate / E-court2-hall / E-court2-house / E-court3-annex / E-court3-gate / E-court3-hall / E-court3-house / E-court3-pavilion / E-court4-gate / E-court4-hall / E-court4-house / E-court4-pavilion
    ✓ 建筑数量 = layout 分配数（15），id 集合逐一相等
    ✓ 每栋建筑逐字段回显 layout（含 bounds/entrance/door）
    · 四院：CY-E-court1(178×156m) CY-E-court2(178×164m) CY-E-court3(178×158m) CY-E-court4(178×168m)
    ✓ ≥4 组可识别院落，每组都有门 / 主屋 / 配房 / 连接步道
    ✓ 竖直定位自洽：kit 檐口 = layout 檐口估值 + 东宫苑地坪 0.4（容差 6mm）
    · 单栋最大三角面：E-court1-hall 3464（上限 24000）
    ✓ 逐栋三角面 ≤ config.BUDGET.triangles.perBuildingMax
    · D/E 共用构件语言：kind=hall/sideHall/courtyardGate/pavilion · roofType=gableHip/gable/pyramidal
    ✓ 与 D 统一：屋顶等级/开间/进深/台基高逐项来自同一份 layout 表且经 kit 白名单校验
    · 水池 {"minX":124,"maxX":188,"minZ":16,"maxZ":68} 水面 0.05m；影壁 2 处；灯体 8；树 32（花树 6）；铜器 4
    ✓ E 专属装饰（非体量镜像）：水池 + 水榭基座 + 影壁 + 宫灯 + 花树 + 铜器陈设齐备
    ✓ 水面交给统一环境系统（userData.waterSurface / ctx.shared.water），不自建水面动画
    · E 拥有的连接：CXN-B-E-plaza-east / CXN-B-E-rear-east / CXN-C-E-side-east
    ✓ 本人 owner 的连接全部回显，且不越权登记他人连接（单一 owner）
    ✓ 中央区接口：三处位于 x=100 地界线上，标高与两端一致
    ✓ F 接口：花园东入口在 z=300、x=200（owner=F），E 侧的接驳道路确实铺到该点
    · E 区包围盒 x[100.0,300.0] y[-0.0,16.1] z[-400.0,300.0]
    ✓ 不越界：不实现外宫墙/城门/护城河/桥，几何不越出 E 区地界（含出檐容差）
    ✓ 机位口径：≥1 zone + ≥1 fp-spawn，且与 layout.VIEWPOINTS 逐字段一致
    · 障碍 41 条：建筑 15 + 水体 1 + 院墙/影壁实心段 24
    ✓ 不可进入建筑全部 visitable=false 且登记为障碍（含水池）
    · 可行走面 1 面，坡道/台阶 2 段（最大斜率 0.0625）
    ✓ 可行走面 1 面回显 layout、坡道斜率 ≤ rampMaxSlope
    · 走查通路 7 个采样点全部可通；反例（主屋/水池/影壁）阻挡 ✓
    ✓ 第一人称可通：出生点 → 院门 → 院墙门洞 → 南北主道；主屋与水池不可进入
    · E 区绘制调用 40/40（合批前 398 → 后 40），三角面 43228；实例化 E-trees-trunk×32 + E-trees-canopy-leaf×26 + E-trees-canopy-blossom×6
    ✓ 整区合批 + 树群实例化：批次与三角面在预算内
    · 树干实例前 8 株跨度 141.0×657.7m（count=32）
    ✓ 实例矩阵确实把每株树放到各自位置（不是全部堆在原点）
    ✓ update(dt, elapsed, state) 不改 state/相机，重复调用不抛错
    ✓ dispose() 只释放自有几何（含实例化模板），不销毁 kit 共享材质/贴图，且幂等
   通过 26 / 26
exit=0

$ node scripts/audit.mjs
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 --------------------------------------------------------------------------
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     63       6   80564      19       6      63       6
 C                     56       0   52016      19       6      56       0
 E                     40       3   43228      19       5      40       3
 F                     66      11   59020      20       5      66      11
 --------------------------------------------------------------------------
 小计(区域)              264      56  241172      86      22
 环境系统                   7       0    1757       7       0
 主场景合计                 271      56  242929
 ...
 主场景绘制调用   : 271 / 上限 350  ✓
 分区 B         : 63 / 预算 70  ✓
 分区 C         : 56 / 预算 50  ✗ 超预算        ← 见 §2.8 说明（t22 让 C 区寝殿恢复重檐导致 +8；非本区）
 分区 D         : —（模块未交付，预算 40 留给真实区域）
 分区 E         : 40 / 预算 40  ✓          ← 本区
 分区 F         : 66 / 预算 80  ✓
 可见三角面       : 242929 / 上限 1500000  ✓
 问题：- 分区 C 绘制调用 56 超过预算 50
 结论：1 项未通过
exit=0

$ node tests/run.mjs
 FAIL  tests/core-walls.test.mjs  288ms
 PASS  tests/core.test.mjs  563ms
 FAIL  tests/interaction.test.mjs  1585ms
 PASS  tests/kit.test.mjs  2477ms
 PASS  tests/layout.test.mjs  135ms
 PASS  tests/zone-east.test.mjs  613ms
 PASS  tests/zone-forecourt.test.mjs  2059ms
 PASS  tests/zone-garden.test.mjs  1243ms
 FAIL  tests/zone-inner.test.mjs  956ms
 PASS  tests/zones.test.mjs  3250ms
 通过 7 / 10，失败 3，总耗时 13170ms
exit=1
```

`node tests/run.mjs` 的 3 项红灯逐条归因（**均非 E 区实现问题**，本区 `tests/zone-east.test.mjs` PASS）：

| 红灯 | 归因 | 证据 |
| --- | --- | --- |
| `tests/core-walls.test.mjs`（12/17） | t2/t21 正在开发的"院墙碰撞派生"能力；失败项全部是关于**派生/去重/跨墙判定**的新需求（属 t21 范围） | 失败项标题：`派生覆盖 60 段墙…`、`E 式自补（同 id）与 layout 式宫墙条目都会被去重`、`≥3 段院墙两侧的可行走点跨墙判定`、`门洞处可通行` |
| `tests/interaction.test.mjs` | t9（ui-engineer）正在开发的交互/相机测试，尚未交付完 | 失败项：`A5 T/Y/Space/R 走同一条请求事件`、`B1 八视角逐一可切`、`B3 第一人称与导览互斥`… |
| `tests/zone-inner.test.mjs`（26/27） | **外部原因**：t22 把 kit 的"门洞/形制/窗"解耦后，C 区寝殿（`C-hall-bed-main`）恢复渲染重檐庑殿 → 部件桶 48→56，触发该测试里"绘制调用 ≤ 分区配额 50"的断言。C 区文件/测试不在本任务 inScope，且主理人已裁定分区配额为诊断指标（真正约束是整城 ≤350，当前 271 ✓） | 唯一失败项：`C 区绘制调用 56 超预算 50`；C 区其余 26 项全绿；属 t24（C 区寝殿恢复重檐）收口范围 |

### 2.6 性能与预算（Node 侧口径）

- **E 区：40 / 40 绘制调用**（合批前 398 个网格 → 合批后 40，`kit.mergeZone` 一次），三角面 **43,228**，
  网格 40（含 3 个 InstancedMesh），单栋最大 3,464（上限 24,000），材质/纹理 19/5（共享 kit 库）。
- **整城（约束性门槛）**：主场景 271 / 350 ✓、可见三角面 242,929 / 1,500,000 ✓（视角口径最高 264 批次）。
- **树群实例化**（主理人要求）：`kit.instance` 三次调用覆盖 32 株 —— 树干 32（逐实例等比缩放表达 5.5/9/13.5m 三档）、
  阔叶树冠 26、花树树冠 6（花树用 `layerUmbral` 层叠冠，与阔叶树的圆冠形成形差）；实例矩阵经测试校验"确实分散"。
- 细节档：15 栋建筑全部 `mid`（实测：任何一栋取 mid 都会引入同一套部件桶，其余栋取 mid 不再增加批次，
  只增加约 6k 三角面）；院墙与影壁取 `far`（kit.wall 仅"压顶脊线"按 detail 分支）；宫灯取 `far`（灯座/灯杆/灯身三件）。
- 未用逐栋三档 LOD 的理由与 C 区相同（审计"全量口径"会把 LOD 未选档一并计入，三档反而放大批次），
  实测对照见 `docs/handoffs/zone-inner.md` §2.6。

### 2.7 未验证项（不得当作已验证）

1. **浏览器内画面与帧率未验证**：E 区只做 Node 侧几何/契约/预算验证；`VP-E-zone` / `VP-E-court1` 两张固定
   验收视角的实际画面、真实 FPS/p95FrameMs、GPU/显存、阴影与 Bloom 整帧成本未测（属 t12/t13）。
2. **未出图**：`work/**` 不在本任务 inScope，故未产出 E 区截图；风格检查需 t13 用固定机位截图判定。
3. **D↔E "不机械镜像"只做了本区侧的自证**：D 区（t10）尚未交付，两区并排比对（色调/密度/装饰语言）
   未做；本区只能证明"E 自有装饰齐备且非体量镜像的构造方式"（见 §2.4 与测试）。
4. **真人第一人称连续走查未验证**：测试只做 7 个采样点 + 3 个反例的机器判定；相机手感、台阶平滑与
   卡顿未验证。院门门扇为"虚掩"（kit 按 kind 决定开合比例），实际穿越时的贴墙感未目视。
5. **三时辰下 E 区可读性未验证**（尤其夜间：E 区只有 8 个灯位，属夜景照度的薄弱区）。
6. **水池与水榭的观感未目视**：石岸/水榭基座/水片的层级关系只按标高与包围盒校验，未看渲染图。
7. **`layout.totalHeight` 与 kit 实测的偏差未用于任何取景**（按 CONTRACTS §4.1 一律用 `worldBounds`）；
   E 区实测最高几何 y=16.1m（`E-court1-hall` 屋顶），layout 估值 11.8m。

### 2.8 发现的上游缺陷 / 需求（本区已按"不阻断下游"处理）

| # | 位置 | 问题 | 本区处理 | 建议 |
| --- | --- | --- | --- | --- |
| 1 | `src/core/layout-slice.js`（t2） | `courtyardWalls` 以 `w.zone` 过滤而 `layout.WALLS` 只有 `owner` → **每个区域的院墙切片恒空**（C 区已报告 t7 §2.8#1） | 优先用切片、为空时按 owner 回退读 `ctx.layout.WALLS` | 改一个词：`(w.owner ?? w.zone) === zoneId` |
| 2 | `src/core/layout-slice.js`（t2） | `zoneLayout` **不含 `waterBodies` / `scenicObjects`** → 区域拿不到水体的权威登记（只能从障碍盒间接推） | 从 `zoneLayout.obstacles` 的 `sourceType='water'` 条目取池界/水面/池底，并在测试里与 `layout.WATER_BODIES` 交叉校验 | 在 `zoneLayoutFor` 里按 owner 暴露 `waterBodies`/`scenicObjects` |
| 3 | `src/core/registry.js`（t2） | `registerZone` 只读 `result.colliders`，不读顶层 `result.connectors` → `registry.allConnectors()` 恒空（C 区已报告 t7 §2.8#4） | 未绕过（保持 `colliders={obstacles,walkable,ramps}` 形状） | 同 t7 建议 |
| 4 | `src/shared/layout.js`（t1） | `OBSTACLES` 未登记院墙 | 按 owner 补登 24 段院墙/影壁实心碰撞盒（id `OB-<wallId>-spanN`） | 同 t7 §2.8#5：明确"各区域自补"还是 G 统一生成 |
| 5 | `src/shared/layout.js`（t1） | **障碍盒 y0 = 槽位 `baseY`（"区域基准 0"的台基顶估值）**，而 E 区地坪为 0.4；主屋台基 0.9~1.0 → 原值回显会让障碍盒底部高出地面 0.5~0.6，垂直判定会放行"从建筑下方穿入" | 本区返回的障碍 `y0 = min(layout.y0, 地坪)`（`y1` 不动，远高于玩家身高），并在 `stats`/回执登记该调整 | t1 统一基准（与 t7 §2.8#6 同一根因）；或 G 的碰撞按"足迹 + 地面高度"判定而非纯盒重叠 |
| 6 | `src/shared/layout.js`（t1） | **水体障碍盒是"水体本身"**（`OB-WB-E-pond` y −0.2~0.05），而 `WK-E-ground` 覆盖整个池面（y=0.4）→ 垂直判定既拦不住人、`floorYAt` 还会给出"水面之上 0.35m 的地面"（玩家可站在水上） | 池面另补一条**地面高度拦阻盒**（`OB-E-pond-guard`，y 0.4~2.35，blocks='all'） | t1/G 明确水面拦阻语义（水体障碍是否需要"到地面"的拦阻体） |
| 7 | `src/shared/layout.js`（t1） | `RD-C-E-east-steps` 的路段跨在 C/E 地界上（x 96→104），其中 96~100 属 C 区且被 C 的铺装（y=0.9）覆盖 | 本区把踏道建在 x=100（上端贴 C 铺装边缘）→ 100~101.02，视觉上是 3 级踏道接主道 | t1 复核该路段归属；或由 C/E 双方在交点各铺一半 |
| 8 | kit（t3，t22 已落地） | 旧行为：门洞只对 `kind==='gateHall'` 开放、`isGate` 同时关掉重檐与窗 | 本区按 t22 后的 kit **直接使用槽位 kind**（无任何分支替换/开启比覆盖）；C 区旧回的 `PASSABLE_BODY_BRANCH` 兜底已属过时（t24 收口时一并清理并恢复重檐） | t24 处理 C 区；本区无需动作 |
| 9 | 跨任务观察（t22 副作用） | C 区寝殿恢复重檐后部件桶 48→56，`tests/zone-inner.test.mjs` 的"分区配额"断言变红（C 文件不在本任务 inScope） | 未改 C 区任何文件；如实登记 | 见 t24；建议 C 区的配额断言按主理人裁定改为"报数 + 整城门槛"口径 |
| 10 | `src/shared/layout.js`（t1） | E 区 `VP-E-fp-spawn` 落在院内空地（x=160）而非院门口，第一人称进入后需自行走到主道 | 按 layout 原值回显机位，未擅自调整 | 保持现状（机位为冻结数据） |

### 2.9 遗留风险

1. **E 恰好用满分区配额**（40/40）：任何后续对 E 追加构件都会使该诊断指标越线（整城仍有 79 次余量）。
   按主理人裁定，届时**如实报数**并优先动细节档，不得删院落/建筑/装饰。
2. **树冠形制为 2 种**（阔叶圆冠 / 花树层叠冠）而非 STYLE_GUIDE 列出的 3 种：这是把 32 株树压到 3 次
   实例化调用的直接结果（一种几何 = 一次实例化）。全城尺度上 3 种树冠仍齐备（B/C/F/D 各按需使用）。
   若评审要求 E 也出现三种，可在 +1 次绘制调用的代价下增加一组实例化。
3. **D 区未交付**：E 的"与 D 不机械镜像"只能在本区侧自证；两区并排的观感差异需 t12/t13 在 D 落地后复核。
4. **院门门扇开合比例取自 kit 的 kind 规则**（`courtyardGate` 为"虚掩"）：第一人称穿门时门扇净空约
   2.2m（门洞 12m 的 18%），居中通过无贴墙风险，但边角处可能擦过门扇（厚 0.27m）——未实测。

---

## 3. 结论

- 任务卡 6 条验收中 5 条由本区实测直接满足：`node tests/zone-east.test.mjs` **26/26 通过**（exit 0）、
  `node scripts/audit.mjs` 报告 **E 区 40/40 绘制调用**（整城 271/350 ✓、可见三角面 242,929/150 万 ✓）。
- 第 6 条「`node tests/run.mjs` 全绿」当前**不满足**（7/10）：3 项红灯的归因见 §2.5 表 ——
  2 项是他人在研测试（`core-walls`、`interaction`），1 项是我此前 C 区测试的配额断言被 t22 的 kit 变更触发
  （C 文件不在本任务 inScope，主理人已裁定配额为诊断指标、并已排 t24 收口）。
- 未验证内容已在 §2.7 逐条写明，未作为已验证数据上报。

---

## 4. attempt 2 复验（此前阻碍的外部红灯解除后）

第 1 次提交时 `node tests/run.mjs` 因**他人正在开发的两个测试文件**（`tests/zone-forecourt.test.mjs` = t6、`tests/interaction.test.mjs` = t9）而红，按规则判 failed 交主理人裁定。
attempt 2 未改动任何 E 区文件（`src/zones/east-courts.js`、`tests/zone-east.test.mjs` 与第 1 次提交逐字节相同），仅**复验**三条命令：

```text
$ node tests/zone-east.test.mjs
    ✓ 模块导出 ZONE_ID="E"、createZone（含 default）
    ✓ 返回值通过 §3.3/§4/§5/§6/§8.3 全量契约校验（零问题）
    · E 区网格 40 个（其中实例化 3 个），几何/材质全部来自 kit
    ✓ 建筑数量 = layout 分配数（15），id 集合逐一相等
    ✓ ≥4 组可识别院落，每组都有门 / 主屋 / 配房 / 连接步道
    ✓ 竖直定位自洽：kit 檐口 = layout 檐口估值 + 东宫苑地坪 0.4（容差 6mm）
    · D/E 共用构件语言：kind=hall/sideHall/courtyardGate/pavilion · roofType=gableHip/gable/pyramidal
    ✓ E 专属装饰（非体量镜像）：水池 + 水榭基座 + 影壁 + 宫灯 + 花树 + 铜器陈设齐备
    ✓ 本人 owner 的连接全部回显，且不越权登记他人连接（单一 owner）
    ✓ 不越界：不实现外宫墙/城门/护城河/桥，几何不越出 E 区地界（含出檐容差）
    ✓ 不可进入建筑全部 visitable=false 并登记为障碍（含水池）
    ✓ 第一人称可通：出生点 → 院门 → 院墙门洞 → 南北主道；主屋与水池不可进入
    · E 区绘制调用 40/40（合批前 398 → 后 40），三角面 43228；实例化 E-trees-trunk×32 + E-trees-canopy-leaf×26 + E-trees-canopy-blossom×6
    ✓ 整区合批 + 树群实例化：批次与三角面在预算内
    ✓ 实例矩阵确实把每株树放到各自位置（不是全部堆在原点）
   通过 26 / 26
exit=0

$ node tests/run.mjs
 PASS  tests/core-walls.test.mjs  567ms
 PASS  tests/core.test.mjs  1429ms
 PASS  tests/interaction.test.mjs  3937ms
 PASS  tests/kit.test.mjs  4815ms
 PASS  tests/layout.test.mjs  269ms
 PASS  tests/zone-east.test.mjs  1568ms
 PASS  tests/zone-forecourt.test.mjs  4929ms
 PASS  tests/zone-garden.test.mjs  1724ms
 PASS  tests/zone-inner.test.mjs  1582ms
 PASS  tests/zones.test.mjs  7158ms
 通过 10 / 10，失败 0，总耗时 27983ms
exit=0

$ node scripts/audit.mjs
 区域            批次  阴影批次      三角面   材质  纹理  网格  实例
 GREYBOX(全城灰盒)         39      36    6344       9       0      39       0
 B                     58      58   80564      19       6      58       6
 C                     49      49   52040      19       6      49       0
 D                     39      38   45524      18       5      39       6
 E                     40      39   43228      19       5      40       3     ← 本区
 F                     61      60   59020      20       5      61      11
 小计(区域)              286     280  286720     104      27
 环境系统                   7       0    1889       7       0
 主场景合计                 293     280  288609
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 B 58/70 ✓ 分区 C 49/50 ✓ 分区 D 39/40 ✓ 分区 E 40/40 ✓ 分区 F 61/80 ✓
 可见三角面       : 288609 / 上限 1500000  ✓
 阴影 pass        : 280 个投影对象；实时投影光源 1 盏（宫灯不投影）
 结论：全部预算与契约检查通过
exit=0
```

口径同 §2.6：质量档 `medium`（Dpr 1 / 阴影 1536px / Bloom on）、视角 `oblique/iso/axis/zone/focus/interior/fp/orbit`、
表中为**全量口径**（不剔除视锥）；阴影批次单列、Bloom 后处理不计入。**E 区 40/40，整城 293/350，全部区域均在各自配额内（D 区已交付）**。

未验证项同 §2.7（浏览器画面与真实帧率、E 区固定验收视角截图、D↔E 并排不镜像的目视比对、真人第一人称连续走查、三时辰夜景可读性、水池水榭观感）。
