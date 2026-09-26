# 紫禁天朝 · 接口与资源契约（CONTRACTS）

版本：**layout-v1 / style-baseline-v1 / api-v1**（主 Agent 冻结；跨任务变更须递增版本）

## 1. 目录与文件归属

| 路径 | 负责人 | 说明 |
| --- | --- | --- |
| `index.html`、`src/main.js` | 主 Agent | 入口、组装、**唯一** rAF 动画循环 |
| `src/core/*` | 主 Agent | 渲染与后处理、环境、状态、事件、唯一相机装置 |
| `src/shared/*` | 主 Agent | 配置、布局登记器与各分区布局数据、坐标/连接器 |
| `src/kit/*` | A 资源与建筑库 | 材质、几何基元、构件、内景、实例化装配 |
| `src/zones/*` | B–F（此处由同一实现按分区装配） | 分区根节点装配，只读布局数据 |
| `src/interaction/*` | G | 碰撞与行走、选中、导览 |
| `src/ui/*` | G | HUD、面板、小地图、样式 |
| `scripts/*`、`tests/*` | 主 Agent | 本地服务、构建、布局与连通性测试 |
| `public/vendor/three/*` | 主 Agent | 本地依赖（three r169 + OrbitControls/BufferGeometryUtils/后处理） |
| `docs/*`、`README.md` | 主 Agent | 风格、契约、资源登记、回执与说明 |

## 2. 分区契约（`createZone(ctx) → ZoneModule`）

```js
export async function createZone(ctx) {
  // ctx: { THREE, layout, materials, quality, events, state }
  return {
    id,            // 'B' | 'C' | 'D' | 'E' | 'F'
    root,          // THREE.Group，保持单位变换，按登记世界坐标放置
    buildings,     // { id, name, category, zone, bounds, entrance, visitable, info }[]
    connectors,    // { id, a, b, position, width, elevation, kind }[]
    colliders,     // 区域自有碰撞体（世界坐标 AABB，见 §4）
    viewpoints,    // { id, name, mode, position, target, fov?, area? }[]
    lightAnchors,  // { id, position, type }[]（本实现按环境系统批量处理宫灯）
    update(dt, elapsed, state),  // 每帧一次，禁止自建循环
    dispose()      // 只释放本模块自有资源
  };
}
```

## 3. 事件与状态

- 事件（`src/core/events.js`）：`request-view`（oblique/iso/axis/zone/focus/interior/fp/orbit）、`request-select`（buildingId|null）、`request-focus`、`request-interior`（zone）、`request-fp`（buildingId）、`request-fp-toggle`、`request-zone`（all|B|B-main|C|D|E|F）、`request-zone-at`（{x,z}）、`request-time`（day|dusk|night）、`request-quality`（high|medium|low）、`request-tour`（start|pause|resume|next|prev|exit）、`tour-stop`、`state`、`camera`。
- 状态（`src/core/state.js`）：`mode`、`viewMode`、`selectedBuildingId`、`hoverBuildingId`、`timePreset`、`quality`、`tourState`、`fpActive`、`zone`、`ready`、`loading`、`error`、`stats`。UI 与键盘发送同一请求事件，控制器统一写状态；模块不得各自维护相机状态。

## 4. 碰撞与可行走面数据

- 可行走面 `surfaces[]`：`{ id, x0, x1, z0, z1, y, kind }`，`kind ∈ ground | terrain | terrace | step | bridge`。取该点所有面中的 **最大 y** 作为站立高度。
- 障碍 `obstacles[]`：`{ id, kind, x0, x1, z0, z1, y0, y1 }`，`kind ∈ building | wall | lintel | rock | monument | interior | column`。玩家为半径 0.36 m、身高 1.75 m 的圆柱。
- 水面 `waters[]`：`{ id, kind, x0, x1, z0, z1, y }`，`kind ∈ moat | lake | pond | deck`；`deck` 视为可行走面。
- 门洞生成：`gateObstacles()` 按局部开洞坐标 + 建筑旋转生成墙段与门楣；可进入建筑（金銮殿、乾清宫）使用 `hallShellObstacles()` 生成四面墙壳 + 前后门洞 + 门楣，另有室内柱、宝座台、暖阁、床榻、龙案等内部障碍。
- 台阶：每级生成一个 `step` 面；首级向后延 0.8 m、末级沿上行方向延 2.8 m（落步带），保证与台基顶面连续；相邻梯段须首尾相接，避免出现 >0.55 m 的台阶差。
- 行走规则（`src/interaction/collision.js`）：上台阶阈值 `WORLD.fp.stepUp = 0.55`；下落自由但落差 >3.2 m 拒绝；水面不可行走（桥面除外）；X/Z 轴分离求解实现贴墙滑动。

## 5. 建筑注册表字段

`{ id, name, category, archetype, zone, x, z, rot, w, d, h, base, level, courtyard, visitable, info, bounds{x0,x1,z0,z1}, opens?|interiorShell? }`

- `id` 前缀为分区号，全局唯一；`level` 1=最高等级（主殿/正门/角楼/高楼），2=门殿与园殿，3=院落主屋，4=厢房/院门。
- `visitable` 建筑须提供内景与前后门洞，并在 `info` 说明可进入方式；不可进入建筑在面板中提示。
- 建筑数量与院落数量由 `LAYOUT.stats` 与 `npm test` 双重核对，禁止用廊段或拆件虚增。

## 6. 材质与资源登记

- 材质唯一来源：`src/kit/materials.js` 的 `createMaterials()`；构件几何键 → 材质键映射见 `src/kit/batcher.js` 的 `MAT_OF_KEY`。
- 贴图全部程序化生成（Canvas），≤256²，色彩空间 SRGB（法线贴图为 NoColorSpace）；UV 以米为单位，保证全城密度一致。
- 资产登记（`docs/ASSET_CREDITS.md`）字段：`id、sourceUrl、author、license、localPath、normalization、bounds、lod、usedBy`。本项目除 three.js 与其 addons 外不引入第三方模型/贴图。
- 共享几何缓存：每构件几何只生成一次（`archetypeGeometry`），按 `分区 × 构件 × 材质` 聚类为 `InstancedMesh`；单区域卸载不得释放他区仍在使用的几何/材质。

## 7. 相机装置接口

`createCameraRig({ canvas, layout, events }) → { rig, perspective, ortho, controls, activeCamera, mode, setMode(mode, arg?), focusBuilding(id), setFp(player), exitFp(prevMode), nearestSpawn(from), update(dt), viewById(id), zoneView(zone), interiorView(zone), fpSpawn(zone) }`

- 八种视角共用该装置；`iso` 使用正交相机，其余透视；`focus` 由建筑 bounds 与朝向计算正前 3/4 取景；`interior` 限制在登记 `area` 盒内；`axis` 方位角限制 ±0.42 rad、极角 1.05–1.42。
- 第一人称由 `interaction/collision.js` 的 `createPlayer()` 驱动，`setFp(player)` 后由主循环写入相机位姿；进入时停靠最近 `fp-spawn`，退出恢复进入前模式与机位。

## 8. 质量与性能口径（api-v1）

- 报告中区分：**主场景单次渲染**（关闭阴影测量）与**含阴影 + 后处理的整帧**；均记录 draw call、三角面与 FPS。
- 初始预算：主场景 ≤350 draw、可见几何 ≤150 万三角面、首屏资源 ≤25 MB（本项目全部本地，gzip 前 ≈1.4 MB，含 three.js）。
- 降级路径：`quality` 档控制 DPR/阴影/Bloom/树量/装饰构件；禁止通过删除分区或院落达成指标。
