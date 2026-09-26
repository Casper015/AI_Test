# CONTRACTS · 接口、所有权与验证

- 版本：`v1.0`（主 Agent 发布；签名变更需升版本并通知受影响任务）
- 唯一来源：`src/shared/config.js`、`src/shared/layout.js`、`src/shared/events.js`
- 本文件描述的所有函数签名与数据字段在 `v1.0` 内冻结；子 Agent 如需要新增字段，先向主 Agent 报备

## 1. 文件所有权

| 路径 | 所有者 | 说明 |
| --- | --- | --- |
| `index.html`、`src/main.js`、`src/core/**`、`src/shared/**`、`scripts/**`、`tests/**`、`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md` | 主 Agent | 其他 Agent 只读 |
| `src/kit/**`、`public/assets/**`、`kit-preview.html` | A | 构件、材质、资源登记与 LOD |
| `src/zones/forecourt.js` | B | 前朝 |
| `src/zones/inner-palace.js` | C | 后宫 |
| `src/zones/west-courts.js` | D | 西宫苑 |
| `src/zones/east-courts.js` | E | 东宫苑 |
| `src/zones/garden-boundary.js` | F | 御花园、宫墙、城门、角楼、护城河、地形、桥 |
| `src/interaction/**`、`src/ui/**` | G | 多角度模式交互、导览、选中、小地图、HUD、加载状态 |
| `docs/handoffs/<task>.md` | 各自 | 开工与交付回执 |

只写自己的文件；跨区或共享修改提交给主 Agent 分派。

## 2. 共享配置 `src/shared/config.js`

```js
export const STYLE_VERSION = 'v1.0';
export const PALETTE = { roofGold, roofGoldDark, ridge, wallRed, wallRedDark, stone, stoneDark,
  stoneSide, paving, pavingWarm, goldFloor, caihuaGreen, caihuaBlue, caihuaWhite, wood, woodDark,
  water, waterDeep, treeA, treeB, trunk, grass, rock, bronze, sky: {...} };
export const ROOF = { overhang: 0.18, lift: 0.55, curve: 1.25, ridgeH: 0.7, fasciaH: 0.35 };
export const VIEWS = {   // 八视角默认参数（位置为世界坐标，单位米）
  oblique: { position: [0, 520, -880], target: [0, 20, -40], fov: 42 },
  iso:     { position: [640, 760, 640], target: [0, 0, 0], fov: 34, ortho: true, orthoSize: 1180 },
  axis:    { position: [0, 46, -620], target: [0, 26, -60], fov: 46 },
  orbit:   { target: [0, 24, -120], radius: 760, polar: 1.05, azimuth: 0.6 }
};
export const ZONE_VIEWS = { /* id -> {position, target, fov} 由 layout.js 提供 */ };
export const QUALITY = { high: {...}, medium: {...}, low: {...} };
export const TIME_PRESETS = { golden: {...}, dusk: {...}, night: {...} };
export const UI_TOKENS = { spacing: [4, 8, 12, 16, 24, 32], radius: 4, transitionMs: 180, cameraMs: 1200 };
export const FP = { eye: 1.65, speed: 9, sprint: 22, step: 0.55, radius: 0.45, maxFall: 0.6 };
export const CITY = { halfX: 300, halfZ: 450, wallH: 10.5, wallT: 3, moatW: 42, moatDepth: 3.2 };
```

## 3. 布局 `src/shared/layout.js`

```js
export const ZONES = {            // 区域边界（世界坐标矩形）
  forecourt: { id, name:'前朝', minX:-110, maxX:110, minZ:-400, maxZ:60, color },
  inner:     { ... z 60..290 },
  west:      { x -290..-115, z -340..285 },
  east:      { x 115..290,  z -340..285 },
  garden:    { x -160..160, z 290..430 },
  boundary:  { x -345..345, z -495..495 }
};
export const CONNECTORS = [ { id:'conn.south-gate', x, z, w, elev, owner:'boundary', a:'outside', b:'forecourt' }, ... ];
export const SLOTS = { forecourt:[...], inner:[...], west:[...], east:[...], garden:[...], boundary:[...] };
export const CORRIDORS = { forecourt:[{x, z, len, axis:'x'|'z', h?}], ... };
export const ROADS = [ { x, z, w, d, kind:'axis'|'plaza'|'path'|'court' }, ... ];
export const PONDS = [ { x, z, r, kind:'moat'|'pond' } ];   // moat 由 F 处理
export const TREES = { forecourt:{count, areas:[{x,z,w,d}]}, ... };
```

`SLOTS` 条目（建筑槽）字段：

```js
{ id:'b.main-hall', zone:'forecourt', kind:'hall'|'gateHall'|'sideHall'|'pavilion'|'cornerTower'|'courtyardGate',
  name:'金銮殿', x:0, z:-120, w:104, d:50, bays:9, rot:0, tier:'royal'|'major'|'minor',
  double:true, drum:false, terrace:true, visitable:true, info:'...' }
```

`rot` 为建筑正面朝向：`0` 朝南（`-Z`）、`90` 朝东（`+X`）、`180` 朝北、`270` 朝西。

## 4. 区域模块契约

```js
export async function createZone(ctx) { ... return { root, buildings, connectors, colliders, viewpoints, lightAnchors, update, dispose }; }
```

`ctx = { THREE, config, layout, zone, slots, corridors, roads, kit, rng, events, state, quality }`

- `root`：`THREE.Group`，单位变换，内部已按世界坐标放置，不得挂到 `scene`。
- `buildings`：`[{ id, name, category, bounds:{min:[x,y,z], max:[x,y,z]}, entrance:[x,y,z]|null, visitable:bool, info:string, zone }]`
- `connectors`：`[{ id, position:[x,z], width, elevation, walkable:true }]`，`id` 必须来自 `layout.CONNECTORS`
- `colliders`：`{ obstacles:[{min:[x,y,z], max:[x,y,z]}], surfaces:[{min:[x,z], max:[x,z], y, id, kind:'ground'|'terrace'|'stairs'|'bridge'|'interior'}] }`
  - `obstacles` 用于墙、柱、建筑体块、栏杆、假山、水面；`surfaces` 是可行走面（含台阶平台），`y` 为该面高度
  - 台阶：用 2–4 个递增的 `surfaces` 片段表达，每级高差 ≤ `config.FP.step`
- `viewpoints`：`[{ id, name, mode:'zone'|'interior'|'fp-spawn'|'focus-extra', position:[x,y,z], target:[x,y,z], fov?, area?:{minX,maxX,minZ,maxZ} }]`
- `lightAnchors`：`[{ id, type:'lantern'|'window'|'censer', position:[x,y,z], color, intensity }]`
- `update(dt, elapsed, state)`：区域动画（可空函数）；`dispose()`：只释放自有资源
- 区域不得创建相机、`renderer`、`requestAnimationFrame`、第二个灯光系统或全局事件

## 5. 相机装置与多角度模式（`src/core/camera.js`）

```js
export function createCameraRig({ THREE, camera, fpCam, dom, config, state, registry, events }) -> {
  applyViewMode(mode, params?),   // 'oblique'|'iso'|'axis'|'zone'|'focus'|'interior'|'fp'|'orbit'
  setView(id, params?),           // 使用 VIEWS/ZONE_VIEWS 或注册表机位
  focusBuilding(id),              // 建筑近景
  enterFP(spawnId?), exitFP(),
  requestTour(list), pauseTour(), resumeTour(), stopTour(),
  update(dt),                     // 单一动画循环内调用
  getState()                      // { viewMode, orbitTarget, fpPosition, heading, ... }
}
```

- G 只通过该接口控制相机，并监听 `state.subscribe` 更新 UI；不得直接改 `camera.position`
- 视角切换过渡 `UI_TOKENS.cameraMs`；`fp` 与导览互斥：进入 `fp` 自动 `pauseTour()`
- 第一人称碰撞与可行走面判定由装置实现，数据来自 `registry.colliders`；`near` 值不参与碰撞

## 6. 注册表 `src/core/registry.js`

```js
registry.buildings           // Map<id, building>（全部区域合并，id 全局唯一）
registry.colliders           // { obstacles:[...], surfaces:[...] }（世界坐标合并，surfaces 按 y 排序）
registry.viewpoints          // Map<id, viewpoint>，含 view-<mode> 内置项
registry.lightAnchors        // [...]
registry.zoneOf(id) / nearestSurface(x, z) / resolveMove(from, to, radius) / boundsOfZone(zone)
```

## 7. Kit（`src/kit/index.js`，A 负责）

```js
export function createKit({ THREE, config, rng, assets }) -> {
  materials,                          // 共享材质（缓存、按 config.PALETTE）
  roof({ w, d, h, type:'hip'|'pyramid', overhang, lift, quality }) -> Group,
  hall(slot), gateHall(slot), sideHall(slot), pavilion(slot), cornerTower(slot),
  courtyardGate(slot), wall({ x, z, len, axis, h, t }), corridor({ x, z, len, axis, h }),
  terrace(slot), stairs({ x, z, w, dir, steps, stepH, stepD }), bridge({ x, z, len, axis, w }),
  interior({ kind:'throne'|'chamber', x, z, w, d, rot }),
  props:{ tree(kind), treeCluster(list, kind), rock(list), lantern(kind), railing(list, axis), censer(), lion(), banner(), pond({x,z,r}), path(rects) },
  building(slot, opts) -> { group, bounds, height }   // 依据 slot.kind 分发；group 已合并同材质网格
}
```

- 所有构件返回的 `Group` 位于原点、朝南；由调用方按 `slot.rot` 旋转、按 `slot.x/z` 平移
- `building()` 内部按材质合并网格（每栋 ≤ 8 个 draw call），同类塔楼/亭可实例化
- 构件必须接受 `tier` 影响细节等级：`royal > major > minor`（斗栱、栏杆、脊兽数量递减）

## 8. 事件（`src/shared/events.js`）

```js
export const EV = { VIEW_MODE:'view:mode', SELECT:'select', HOVER:'hover', TIME:'time',
  QUALITY:'quality', TOUR:'tour', ZONE_FOCUS:'zone:focus', FP_ENTER:'fp:enter', FP_EXIT:'fp:exit',
  READY:'ready', LOAD_PROGRESS:'load:progress', ERROR:'error' };
```

UI 与键盘发送相同事件（`bus.emit(EV.VIEW_MODE, { mode:'fp' })`），由 `core` 内的控制器处理。

## 9. 验证命令（每个 Agent 交付前必须实际执行）

```bash
node --check src/zones/<file>.js
node tests/layout.test.mjs
node tests/kit.test.mjs
node tests/zones.test.mjs          # 未实现的区域会被跳过，不报错
bash scripts/serve.sh 8123         # 本地预览（另一个终端）
node scripts/shot.mjs oblique golden docs/shots/view-oblique-golden.png
```

约定：未测试的内容必须在交付回执中写“未验证”。

## 10. 变更记录

| 版本 | 日期 | 变更 | 负责人 |
| --- | --- | --- | --- |
| v1.0 | 2026-09-26 | 六分区实现入库（B/C/D/E/F）与交互 UI（G）；主 Agent 修复构件库根因：单檐屋面缺 `h`、实例化网格丢失父级变换、可进入殿堂空心化；内景机位校正。接口签名未变。 | 主 Agent |
| v0.9 | 2026-09-26 | 初始接口：config/layout/zone/kit/camera/registry/events + 多角度模式契约 | 主 Agent |
