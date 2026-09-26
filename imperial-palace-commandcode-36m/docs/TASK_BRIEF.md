# TASK BRIEF · 分区实现与验收（主 Agent 发布 v0.9）

本文件是所有区域/交互子 Agent 的统一施工依据。开工前必须按顺序阅读：

1. `imperial-palace-plan.md`（总计划；重点 §3 风格、§5 各区域、§6 接口、§8 验收）
2. `docs/STYLE_GUIDE.md`（风格基线）
3. `docs/CONTRACTS.md`（接口与所有权）
4. `src/shared/config.js`、`src/shared/layout.js`（唯一数值来源）
5. `src/zones/_greybox.js`（现有灰盒参考实现，说明如何使用 kit 与登记数据）
6. `src/kit/index.js`（构件工厂 API）

## 1. 工作目录

项目根目录：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 2`

只允许写「文件所有权」表中属于你的文件。**禁止修改** `src/core/**`、`src/shared/**`、`src/kit/**`、`src/main.js`、`index.html`、`tests/**`、`scripts/**`、`package.json`。需要共享改动时写入你的交付回执，由主 Agent 处理。

## 2. 区域模块契约

```js
export async function createZone(ctx) { ... }
// 仅 garden 分区由 loader 调用 createGarden(ctx)；见各任务卡
```

`ctx` 字段：

```js
ctx = {
  THREE, config, layout, kit, rng, events, bus, state, registry, quality,
  zone,        // layout.ZONES[zoneId]，含 id/name/minX/maxX/minZ/maxZ
  slots,       // layout.SLOTS[zoneId]，必须全部落地为建筑
  corridors,   // layout.CORRIDORS[zoneId]
  roads        // layout.ROADS 中落在本区内的条目（已过滤）
}
```

返回值（缺一不可）：

```js
{
  root,          // THREE.Group（单位变换，内部已按世界坐标放置，不要挂到 scene）
  buildings,     // [{ id,name,category,zone,rot,visitable,info,entrance:[x,y,z],bounds:{min:[x,y,z],max:[x,y,z]} }]
  connectors,    // [{ id,position:[x,z],width,elevation,walkable:true }]，id 必须来自 layout.CONNECTORS 且 owner===zone.id
  colliders: {
    obstacles,   // [{ min:[x,y,z], max:[x,y,z] }] 墙/柱/建筑体块/栏杆/假山/水面
    surfaces     // [{ id,min:[x,0,z],max:[x,0,z],y,kind:'ground'|'terrace'|'stairs'|'bridge'|'interior' }]
  },
  viewpoints,    // [{ id,name,mode:'zone'|'interior'|'fp-spawn'|'focus-extra',position:[x,y,z],target:[x,y,z],fov?,area? }]
  lightAnchors,  // [{ id,type:'lantern'|'window'|'censer',position:[x,y,z],color,intensity }]
  update,        // (dt,elapsed,state)=>void，可空函数
  dispose        // ()=>void，只释放自有资源
}
```

### 硬性要求

- `buildings.length >= slots.length`：`layout.SLOTS[zoneId]` 的每个槽位都要有一个建筑条目。
- 每个建筑用 `kit.building(slot)` 生成几何，`root.add(res.group)`；`bounds` 取自 `res.bounds`；并为其推入一个 `obstacles` 包围盒。
- `obstacles`、`surfaces` 非空。
- `surfaces` 的 `y` 必须有限；`min[0]<=max[0]`、`min[2]<=max[2]`。台阶用 2–4 段递增 `surfaces` 表示，每级高差 ≤ `config.FP.step`。
- `viewpoints` 必须含 `mode:'zone'` 与 `mode:'fp-spawn'` 各一个；B、C 另外必须各含一个 `mode:'interior'`。
- 若某 CONNECTOR 的 `owner===zone.id`，必须登记到 `connectors`。
- 区域不得创建相机、renderer、requestAnimationFrame、第二个灯光系统或全局事件。灯位只登记 `lightAnchors`。
- 区外地面、护城河水面、地形由 `src/core/terrain.js` 与 `main.js` 提供，分区不要重复生成护城河水体。

## 3. 机位 id 约定（必须使用这些 id，否则预设视角/导览取不到）

| 分区 | zone 机位 id | fp-spawn id | interior id |
| --- | --- | --- | --- |
| forecourt B | `zone.main-hall` | `fp.forecourt` | `interior.main-hall` |
| inner C | `zone.inner` | `fp.inner` | `interior.inner` |
| west D | `zone.west` | `fp.west` | — |
| east E | `zone.east` | `fp.east` | — |
| garden F | `zone.garden` | `fp.garden` | — |
| boundary F | `zone.gate-south` | `fp.boundary` | — |

默认导览顺序为 `zone.gate-south → zone.main-hall → zone.inner → zone.garden`，这些机位必须存在。

## 4. Kit API 摘要（`src/kit/index.js`）

```js
kit.materials                 // 共享材质：roofGold/roofGoldDark/ridge/wallRed/wallRedDark/stone/stoneDark/stoneSide/
                              // paving/pavingWarm/goldFloor/caihuaGreen/caihuaBlue/wood/woodDark/dark/water/treeA/treeB/
                              // trunk/grass/rock/bronze/lanternRed/plaque/innerWall/roofUnderside
kit.building(slot) -> { group, bounds, height }   // 按 slot.kind 分发，已按 slot.rot 旋转、slot.x/z 平移
kit.hall(o) / sideHall / pavilion / gateHall / courtyardGate / cornerTower / roof / wall / corridor / bridge
kit.stairs({x,z,w,dir,steps,stepH,stepD}) / terraceBase(o) / railing(rects,y,opts)
kit.interior({ kind:'throne'|'chamber', x,z,w,d })   // 室内陈设，需自行包一层房间
kit.tree(kind,x,z,s) / treeCluster(list,kind)        // kind:'pine'|'broad'
kit.props({ kind:'rock'|'lantern'|'censer'|'lion'|'banner'|'pond', ... })
kit.slabRect({ x,z,w,d,kind:'axis'|'plaza'|'court'|'path' })   // 铺地
kit.boxAt(w,h,d,x,y,z,mat) / kit.cylAt(rt,rb,h,x,y,z,mat,seg)   // 图元
kit.instanced(geo, mat, list /* [{x,y,z,s,ry,...}] */)          // 实例化
kit.mergeStatic(root)         // 收尾合并同材质网格（区域最后调用一次）
```

- 所有构件返回的 `Group` 位于原点、朝南（`-Z`）；由调用方旋转/平移。
- 细节等级由 `slot.tier` 决定：`royal > major > minor`。
- 每栋建筑合并后 mesh 数应 ≤ 16。区域 `root` 三角面总数应 < 900000（测试阈值），实际目标远低于此。

## 5. 风格基线（详见 `docs/STYLE_GUIDE.md`）

- 单位米，Y 向上，X 向东，Z 向北；地面 `y=0`；建筑正面朝南。
- 色板只能取自 `config.PALETTE`（通过 `kit.materials`）。
- 主殿重檐庑殿顶、九开间、三层白石台基；次级单檐、五至七开间；亭为方形攒尖金顶；角楼三层重檐。
- 植物只用同两档：松（三层锥形冠）/阔叶（球冠）；旧化统一且轻；无写实照片贴图。
- 禁止把未经适配的低模/写实/异题材素材混入。

## 6. 验收命令（交付前必须实际执行并在回执中给出结果）

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 2"
node --check src/zones/<你的文件>.js
node tests/zones.test.mjs      # 六个分区都会被检查；你的分区必须通过且不得让其他分区失败
node tests/layout.test.mjs
```

注：`mergeByMaterial` 对个别缺法线的几何会打印 `computeBoundingBox NaN` 警告，属基线既有噪声，可忽略；但你生成的几何自身不得出现 NaN 包围盒。

## 7. 交付回执

写入 `docs/handoffs/<task-id>.md`，至少包含：任务 ID / 可写文件 / 只读依赖 / 使用的 kit 与材质 / 登记的建筑数·障碍数·可行走面数·机位 / 实际执行的命令与结果 / 未验证或已知问题。
