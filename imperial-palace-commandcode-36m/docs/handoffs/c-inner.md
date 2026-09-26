# 交付回执 · C 后宫 / 内廷（`inner`）

## 1. 任务标识

- 任务 ID：`c-inner`
- 角色：子 Agent C（后宫 / 内廷）
- 可写文件（仅这两个）：
  - `src/zones/inner-palace.js`（11 行灰盒占位 → 306 行真实实现）
  - `docs/handoffs/c-inner.md`（本回执）
- 只读依赖（已实际阅读）：
  - `docs/TASK_BRIEF.md`、`imperial-palace-plan.md`（§3/§5.3/§6/§8）、`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`
  - `src/shared/config.js`、`src/shared/layout.js`、`src/shared/rng.js`
  - `src/zones/_greybox.js`（消费 kit 与登记数据的参考）
  - `src/kit/index.js`、`src/kit/materials.js`、`src/kit/merge.js`
  - `src/core/loader.js`、`src/core/registry.js`、`src/core/camera.js`、`src/main.js`、`tests/zones.test.mjs`
- 未修改任何 `src/core/**`、`src/shared/**`、`src/kit/**`、`src/main.js`、`index.html`、`tests/**`、`scripts/**`、`package.json`、其他分区文件。

## 2. 使用的 kit 与材质

- 构件工厂：`kit.building(slot)`（8 个槽位全覆盖）、`kit.slabRect`、`kit.corridor`、`kit.wall`、`kit.stairs`、`kit.interior({kind:'chamber'})`、`kit.treeCluster`、`kit.props({kind:'lantern'|'censer'|'lion'|'rock'})`、`kit.roof`、`kit.tier`、`kit.mergeStatic(root)`，图元/包围盒用 `ctx.THREE.Box3`。
- 材质：全部由 kit 内部提供，未自建材质；未直接引用 `kit.materials`。实际出现的共享材质有 `roofGold / roofGoldDark / ridge / wallRed / wallRedDark / stone / stoneDark / stoneSide / paving / pavingWarm / caihuaGreen / caihuaBlue / wood / woodDark / dark / bronze / lanternRed / plaque / goldFloor / innerWall / treeA / treeB / trunk / rock`（均取自 `config.PALETTE`）。
- 区域结构：中轴三进内廷（内廷门 `c.gate-inner` → 坤宁寝殿 `c.hall-1` → 内廷二门 `c.gate-2` → 后苑殿 `c.hall-2`），东西配房（`c.side-a-w/e`、`c.side-b-w/e`）；三进庭院按 `COURTYARDS`（`court.c.a/b/c`）用 `slabRect` 铺地；`CORRIDORS.inner` 四条生成廊庑；沿区内边界加低宫墙（南 `z=62`、北 `z=288`、东西 `x=±118`）强化围合，中间留内廷门/花园门/东西便门通道。

## 3. 登记数据（实测）

- 建筑：**8**（等于 `layout.SLOTS.inner` 槽位数）
  - `c.gate-inner`(courtyardGate) / `c.hall-1`(hall, royal, visitable) / `c.side-a-w` / `c.side-a-e`(sideHall) / `c.gate-2`(courtyardGate) / `c.hall-2`(hall, major) / `c.side-b-w` / `c.side-b-e`(sideHall)
- 障碍 `colliders.obstacles`：**31**（建筑体块、核心寝殿台基/殿身四壁含南门洞、门殿门洞两侧、廊顶、围合宫墙、假山）
- 可行走面 `colliders.surfaces`：**13**
  - `ground.inner`(y=0)、`c.hall-1.stair.0..9`(y=0.45…4.5, kind `stairs`)、`c.hall-1.terrace`(y=4.5, kind `terrace`)、`c.hall-1.interior`(y=4.8, kind `interior`)
  - 台阶每级高差 **0.45 m ≤ config.FP.step（0.55）**
- 机位 `viewpoints`（id 与 TASK_BRIEF §3 完全一致）：
  - `zone.inner`（mode `zone`，position `[0,118,-6]` target `[0,24,200]` fov 40，与 `ZONE_VIEWS['zone.inner']` 一致）
  - `fp.inner`（mode `fp-spawn`，position `[0,0,70]` target `[0,1.65,160]`）
  - `interior.inner`（mode `interior`，position `[0,6.9,168]` target `[0,6.1,148]` fov 58，含 `area`，位于寝殿室内包围盒内）
- 连接 `connectors`：**1** → `conn.inner-south` `{position:[0,62], width:30, elevation:0, walkable:true}`（`owner==='inner'` 的唯一项；`conn.garden-south` 归 F，未登记，但北向 `slabRect` 步道与北界墙缺口 x∈[-17,17] 已留通）
- 灯位 `lightAnchors`：**6** → 内廷门/寝殿/二门/后苑殿 各 1 盏 lantern、寝殿 `window` 1、香炉 `censer` 1
- `update` / `dispose`：空函数（不持有独立资源；`root` 由 loader 管理）

## 4. 实际执行的命令与原始结果

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 2"
node --check src/zones/inner-palace.js
node tests/zones.test.mjs
```

`node --check src/zones/inner-palace.js` → 无输出，退出码 0（语法通过）。

`node tests/zones.test.mjs`（stdout，已隐去 THREE 的 NaN 基线告警噪声）：

```
  forecourt: 建筑 13，障碍 19，可行走面 12，机位 3，三角面 23719
  inner: 建筑 8，障碍 31，可行走面 13，机位 3，三角面 17126
  west: 建筑 16，障碍 20，可行走面 13，机位 2，三角面 18789
  east: 建筑 16，障碍 20，可行走面 13，机位 2，三角面 18789
  garden: 建筑 7，障碍 19，可行走面 28，机位 2，三角面 21140
  boundary: 建筑 8，障碍 28，可行走面 69，机位 2，三角面 18245
zones 通过：实测 6 个区域，跳过 0 个（灰盒）
```

- **`inner` 全部断言通过**：建筑 8 ≥ 槽位 8、障碍/可行走面非空、含 `zone`/`fp-spawn`/`interior` 三种机位、三角面 17126 < 900000、所有可行走面 `y` 有限且 `min<=max`。
- 当时其他 5 个分区也全部通过（`zones` 退出码 0）。**首次执行时曾出现 3 项 `garden` 失败**（`f.hall-garden.terrace/step0/step1` 可行走面范围非法）——该 id 属于 `src/zones/garden-boundary.js`（F），与本次改动无关，且在后续复跑时已消失（F 侧改动生效），现无失败项。

补充自测（隔离 `inner` 单区，脚本置于会话 scratchpad）：

```
buildings = 8 | ids: c.gate-inner, c.hall-1, c.side-a-w, c.side-a-e, c.gate-2, c.hall-2, c.side-b-w, c.side-b-e
obstacles = 31 | surfaces = 13
viewpoints = zone.inner(zone), fp.inner(fp-spawn), interior.inner(interior)
connectors = [{"id":"conn.inner-south","position":[0,62],"width":30,"elevation":0,"walkable":true}]
lightAnchors = 6
triangles = 17126
meshes with NaN positions = 0          # 本区几何无 NaN 包围盒
building field problems = 0
bad surfaces = 0
stair ys = 0.45,0.9,1.35,1.8,2.25,2.7,3.15,3.6,4.05,4.5 | max riser = 0.450 (FP.step 0.55)
```

`node tests/layout.test.mjs`（附带执行）→ `layout 通过：建筑 68 栋、院落 18 处、连接 14 个、视角 8 种`，退出码 0。

## 5. 未验证 / 已知问题

1. **【需主 Agent / A 处理 · kit 缺陷】`kit.hall` 单檐分支漏传屋顶高度 `h`**
   `src/kit/index.js` 的 `hall()` 单檐分支为 `roof({ w: o.w + 3.4, d: o.d + 3 })`，未传 `h`；`roofGeometry` 里 `h: o.h` 为 `undefined`，导致整片屋面高度为 `NaN`、檐角锥体位置矩阵 `NaN`，进而使该栋 `res.bounds` 与障碍盒全为 `NaN`。影响**所有单檐 `hall`**，不只内廷：`inner c.hall-2`、`forecourt b.mid-hall/b.rear-hall`、`garden f.hall-garden` 均命中。
   建议一行修复：在单檐分支改为 `roof({ w: o.w + 3.4, d: o.d + 3, h: roofH })`。
   我在 `inner-palace.js` 内加了一段**仅在检测到 NaN 时生效**的兜底：剔除坏网格 → 用参数完整的 `kit.roof({...,h:t.roof})` 补一版屋顶 → 按修复后 group 重算 `bounds`。kit 修好后该段自动失效（不会叠加第二个屋顶）。自测本区 NaN 网格数已为 0。
2. **【需主 Agent / A 处理 · kit 限制】寝殿内景可见性**
   `kit.hall` 的 `body()` 用一整块不透明 `M.dark` 盒体填满殿身内部，因此 `kit.interior({kind:'chamber'})` 放在殿内会被该填充体遮挡。我已按契约把内景几何、室内地面（`kind:'interior'`）与南面门洞（x∈[-13,13]）碰撞都登记齐、第一人称可沿中轴台阶走进去；但**内景在视觉上要完全可见，需要 kit 支持“空心殿堂”**（B 的金銮殿内景同样受此限制）。已按“共享改动交给主 Agent”处理，未私改 kit。
3. **【kit 限制】门殿可通行**：`kit.courtyardGate` 是实心门墙块，我在碰撞上给南面正中留了门洞（内廷门/二门），使中轴第一人称可通；视觉上会穿过门板，属于同一类 kit 限制，未私改。
4. **视觉/交互层面未验证**：未在浏览器中实测第一人称整段走查（南桥→南城门→前朝广场→主殿台基→金銮殿内景→内廷门→寝殿内景→御花园）与三时辰光照、截图比对（无 headless 浏览器运行）；`zone.inner` 机位取景与 `interior.inner` 取景仅做了数值核对（在包围盒内、不穿墙不出顶）。
5. **刻意的取舍**：区内 `ROADS`（中轴御道）抬升 0.22 m 作为浅台，避免与庭院铺地共面 z-fighting；廊庑只登记廊顶遮挡（柱间可通行，保证东西便门可达）；树木未登记障碍（可穿行）。
