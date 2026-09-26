# 交付回执 · D 西宫苑（`west`）

## 1. 任务标识

- 任务 ID：`d-west-courts`
- 角色：子 Agent D（西宫苑）
- 可写文件（仅这两个）：
  - `src/zones/west-courts.js`（11 行灰盒占位 → 约 390 行真实实现）
  - `docs/handoffs/d-west-courts.md`（本回执）
- 只读依赖（已实际阅读）：
  - `docs/TASK_BRIEF.md`、`imperial-palace-plan.md`（§3 风格 / §5.4 东西宫苑 / §6 接口 / §8 验收）、`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`
  - `src/shared/config.js`、`src/shared/layout.js`（`SLOTS.west`、`CORRIDORS.west`、`ROADS`、`CONNECTORS`、`PONDS`、`TREES.west`）、`src/shared/rng.js`
  - `src/zones/forecourt.js`、`src/zones/inner-palace.js`（消费 kit 与登记数据的参考写法）
  - `src/kit/index.js`、`src/kit/merge.js`、`src/core/loader.js`、`src/core/registry.js`、`src/core/camera.js`、`tests/zones.test.mjs`
- **未修改**任何 `src/core/**`、`src/shared/**`、`src/kit/**`、`src/main.js`、`index.html`、`tests/**`、`scripts/**`、`package.json` 或其它分区文件。
- 说明：主 Agent 已修复 kit 的两处根因缺陷（`kit/index.js` 单檐 `hall()` 漏传 `h` 导致 NaN 屋顶；`merge.js` 丢失实例化网格父级变换）。本实现**直接信任** `kit.building()` 与 `kit.mergeStatic()`，**未**写任何剔除 NaN 网格 / 补屋顶 / 手工烘焙实例世界变换的兜底代码（forecourt/inner 遗留的那类兜底在本区不存在）。

## 2. 使用的 kit 与材质

- 构件工厂：`kit.building(slot)`（16 个槽位 + 4 座附加亭，共 20 栋全部落地）；`kit.slabRect`（铺地）、`kit.corridor`（廊庑）、`kit.wall`（院墙，分段留门洞）、`kit.treeCluster`、`kit.props({kind:'pond'|'rock'|'lantern'|'lion'|'banner'|'censer'})`、`kit.mergeStatic(root)`；包围盒用 `ctx.THREE.Box3`（`res.bounds`）。
- 材质：全部由 kit 内部按 `config.PALETTE` 提供，未自建材质、未直接构造 `THREE.Material`。实际出现的共享材质：`roofGold / roofGoldDark / ridge / wallRed / wallRedDark / stone / stoneDark / stoneSide / paving / pavingWarm / caihuaGreen / caihuaBlue / wood / woodDark / dark / bronze / lanternRed / plaque / water / treeA / treeB / trunk / rock`。
- 模数与屋顶等级：完全沿用 `layout.SLOTS.west` 的 `tier`/`w`/`d`/`bays`/`rot`，未自行改尺寸或屋顶形制，与全场统一。

## 3. 登记数据（实测）

- 建筑 `buildings`：**20**（≥ 槽位 16）
  - 16 个 `layout.SLOTS.west` 槽位逐一到齐（无遗漏）
  - 4 个附加赏景亭：`d.c1.pav` … `d.c4.pav`（`kit.building`，`pavilion`/`minor`）
- 障碍 `colliders.obstacles`：**61**（建筑体块、院门门洞分段盒、廊顶、院墙、假山、水池）
- 可行走面 `colliders.surfaces`：**77**（`ground.west` + 各栋台基 `terrace` + 前檐台阶 `stairs`，`y` 全部有限、`min<=max`）
  - 台阶每级高差 ≤ `config.FP.step`（0.55）：major 台基 1.8m → 4 级（0.45）；minor 1.0m → 2 级（0.5）；pavilion 1.4m → 3 级（0.467）；courtyardGate 1.2m → 3 级（0.4）。实测最大阶梯面 y = 1.80（= major 台基顶）。
- 机位 `viewpoints`（**id 与 TASK_BRIEF §3 完全一致**）：
  - `zone.west`（mode `zone`）—— 取 `config.ZONE_VIEWS['zone.west']`：position `[-430,158,-40]`、target `[-205,8,-70]`、fov `40`
  - `fp.west`（mode `fp-spawn`，站立于本区可行走地面）—— position `[-121,0,-176]`、target `[-200,1.6,-180]`；位置落在东侧南北连通步道上（前朝西便门旁），无遮挡
- 连接 `connectors`：**2**（`layout.CONNECTORS` 中 `owner==='west'` 的全部）
  - `conn.forecourt-west` `{position:[-112,-180], width:16, elevation:0, walkable:true}`
  - `conn.inner-west` `{position:[-117,180], width:14, elevation:0, walkable:true}`
- 灯位 `lightAnchors`：**24**（正殿/院门/赏景亭各 1 盏 lantern、4 院门两侧石灯共 10 盏、便门石灯 2 盏、礼乐院与供御院铜香炉 2 座）
- `update` / `dispose`：空函数（不持有独立资源，`root` 由 loader 管理）。

## 4. 院落分组说明

区间 `x ∈ [-290,-115]`、`z ∈ [-340,285]`，四组并列院落，中心 z = `-250 / -100 / 50 / 200`（取自 `SLOTS.west` 各院 `main` 槽位）：

| 院 | 中心 z | 正殿（hall, major） | 北/南配房（sideHall） | 院门（courtyardGate） | 主题与差异化装饰 |
| --- | --- | --- | --- | --- | --- |
| 1 | -250 | `d.c1.main` x=-252 | `d.c1.side-n/-s` x=-196 | `d.c1.gate` x=-128 | 礼乐院：石狮、旗幡、铜香炉、松树 |
| 2 | -100 | `d.c2.main` | `d.c2.side-n/-s` | `d.c2.gate` | 书院：小水池（倒影池）、假山、石狮、阔叶树 |
| 3 | 50 | `d.c3.main` | `d.c3.side-n/-s` | `d.c3.gate` | 陈设院：小水池、假山、旗幡、阔叶树 |
| 4 | 200 | `d.c4.main` | `d.c4.side-n/-s` | `d.c4.gate` | 供御院：假山、铜香炉、松树 |

每院共有的自建元素：

- **院墙**（`kit.wall`，h=4.6、t=1.4）：西界 x=-276 整段；东界 x=-130 在院门处留洞（洞 z∈[cz±13]）；南（z=cz-66）/北（z=cz+64）墙在 x=-200 处留南北通门洞（洞宽 16），使四院与跨区便门首尾连通。
- **内院铺地**（`kit.slabRect` kind `plaza`，抬 0.14 避免与 `ROADS` 共面）：覆盖 x∈[-276,-130]、z∈[cz±63]。
- **廊庑**（`ctx.corridors`，4 条：x=-200、z=cz-62、len=150、axis `x`）：登记**檐顶遮挡盒**（y 3.3–4.6），柱间保持可通行，保证便门可达。
- **连接步道**：东侧南北连通步道（x=-121，抬 0.10）贯通四院院门与两处跨区便门；两处便门引导铺装（抬 0.16）。
- **树木**：按 `TREES.west`（count 130，area x=-205/z=-30、168×600）确定性散布，实际约 100 株（松 / 阔叶混排），避让建筑、院墙、廊庑、道路、水池、假山与小品。

## 5. 实际执行的命令与原始结果

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 2"
node --check src/zones/west-courts.js
node tests/zones.test.mjs
```

`node --check src/zones/west-courts.js` → 无输出，退出码 0（语法通过）。

`node tests/zones.test.mjs`（stdout 原文，**无任何 `NaN` 告警**）：

```
  forecourt: 建筑 13，障碍 29，可行走面 35，机位 3，三角面 26632
  inner: 建筑 8，障碍 31，可行走面 13，机位 3，三角面 17102
  west: 建筑 20，障碍 61，可行走面 77，机位 2，三角面 33281
  east: 建筑 16，障碍 20，可行走面 17，机位 2，三角面 18789
  garden: 建筑 7，障碍 19，可行走面 28，机位 2，三角面 21116
  boundary: 建筑 8，障碍 28，可行走面 69，机位 2，三角面 18245
zones 通过：实测 6 个区域，跳过 0 个（灰盒）
```

退出码 0。**`west` 断言全部通过**：建筑 20 ≥ 槽位 16、障碍/可行走面非空、含 `zone` 与 `fp-spawn` 机位、三角面 33281 < 900000、所有可行走面 `y` 有限且 `min<=max`。**六个分区无一项失败**（forecourt / inner / garden / boundary 与改动前基数一致，`east` 仍为灰盒，均未被本改动影响）。

补充自测（隔离 `west` 单区，脚本置于会话 scratchpad，不写入工程）：

```
buildings 20    missing slots: []                       # 16 槽位全部落地，无遗漏
obstacles 61    surfaces 77    lights 24
connectors conn.forecourt-west, conn.inner-west
viewpoints zone.west:zone, fp.west:fp-spawn
max stair y 1.80    step<=0.55? true                    # 无阶梯面超过台基顶 1.8
bad 0                                                   # building/obstacle/surface 均无 NaN、范围合法
```

附带执行 `node tests/layout.test.mjs` → `layout 通过：建筑 68 栋、院落 18 处、连接 14 个、视角 8 种`，退出码 0。

## 6. 未验证 / 已知问题

1. **未在浏览器中实测**：无 headless 浏览器运行，未做第一人称实走（经 `conn.forecourt-west` / `conn.inner-west` 进出四院）、`zone.west` 与 `fp.west` 取景截图、三时辰光照比对。机位坐标与可行走面仅做数值核对。
2. **`kit.courtyardGate` 视觉为实心门墙块**（与 inner 同类 kit 限制）：本区已在碰撞上给院门留出 z∈[cz±13] 的门洞，第一人称可穿行，但视觉上会“穿过门板”。属共享 kit 限制，未私改，交主 Agent 处理。
3. **廊庑与院墙轻微交叠**：`CORRIDORS.west` 的廊庑长 150（x 跨 -275…-125），东端略越过东院墙（x=-130）约 5 m；南墙置于 cz-66、廊庑位于 z=cz-62，二者不重叠，仅在东端与院墙有少量穿插。为遵守“按 `ctx.corridors` 生成”的约定未截断长度，属可接受的视觉小瑕疵。
4. **铺地抬升的刻意取舍**：内院铺地抬 0.14、东侧步道抬 0.10、便门铺装抬 0.16，均用于避免与 `ROADS`（不同 y 层）共面 z-fighting；`ROADS` 自身若有两条在数据上重叠（如 z=210 路径与 c4 院铺装带）仍可能共面闪烁，属 `layout.ROADS` 基线数据问题，与本次改动无关。
5. **`layout.PONDS` 中西区水系未采用**：西区仅有的一例 `PONDS`（x=-205、z=-100、r=22）正压在书院院落的 court 铺装带与中线上，直接落地会与道路/建筑穿插；因此本区改用自建的两处小水池（`kit.props({kind:'pond'})`，位于 r=6–7 的院内空地）作差异化，未登记该 `PONDS` 条目。若主 Agent 要求严格消费 `PONDS`，请回派。
6. **树木未登记障碍**（可穿行），与 forecourt/inner 处理一致，未单独建障碍盒。
