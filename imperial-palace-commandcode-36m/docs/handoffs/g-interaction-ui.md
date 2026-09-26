# 交付回执 · G 交互与 UI

> 说明：本回执由主 Agent 在 G 子代理收尾阶段被中断后代为补写，内容依据实际入库代码与实测结果。

- 任务 ID：G（交互与 UI）
- 可写文件（实际新增）：
  - `src/interaction/index.js`（约 243 行）— 建筑悬停/选中拾取与高亮
  - `src/ui/index.js`（约 573 行）— HUD、视角/分区/时辰/画质切换器、信息面板、导览、小地图、提示与错误
- 只读依赖：`src/core/camera.js`（唯一相机装置）、`src/core/registry.js`、`src/core/state.js`、`src/shared/events.js`、`src/shared/config.js`、`src/shared/layout.js`、`src/main.js`（挂载点）、`index.html`（`#ui` 容器）
- 未修改任何共享/分区文件。

## 消费的接口与事件

- 相机装置 `rig`（只读消费）：`applyViewMode / setView / focusBuilding / enterFP / exitFP / startTour / stopTour / setPaused / getState / activeCamera`；不直接改 `camera.position`。
- 环境 `env.setPreset('golden'|'dusk'|'night')`。
- 事件总线（`EV`）：发送 `VIEW_MODE / ZONE_FOCUS / TOUR / SELECT / HOVER / TIME / QUALITY`；订阅 `HOVER / SELECT / TOUR / TOUR_TICK / FP_ENTER / FP_EXIT / LOAD_PROGRESS / READY / ERROR / STATS`。
- 注册表：`registry.buildings`（拾取与信息面板）、`registry.viewpoints`（分区机位与出生点名称）、`layout.ZONES/CITY_BOUNDS`（小地图）。

## 实现清单

- **建筑拾取**：`THREE.Raycaster` 对 `registry.buildings` 的世界 AABB 求交（区域网格已按材质合并，包围盒判定更稳），取最近命中；指针监听只挂在 renderer 画布上，避免面板点击误触；位移超过 5px 视为 OrbitControls 拖拽，不触发选中。
- **高亮**：琉璃金悬停线框 + 宫红选中线框与半透明体块；随 `state.selectedBuildingId` 更新，退出近景/第一人称时清理。
- **多角度模式切换器**：八视角按钮（`config.VIEW_MODES`，含「第一人称 F」），点击发 `EV.VIEW_MODE`；`focus` 未选中建筑时给出提示文案。
- **分区跳转**：全城/前朝/后宫/西宫苑/东宫苑/御花园/城门，点击发 `EV.ZONE_FOCUS`（`zone.*` 机位 id）。
- **建筑信息面板**：名称、区域、用途、是否可入内（不可入内明确标注「此建筑不可进入」）。
- **中轴导览**：开始/暂停/继续/退出，显示当前讲解点（`EV.TOUR_TICK`）。
- **时辰 / 画质**：三时辰调用 `env.setPreset` 并发 `EV.TIME`；三档画质发 `EV.QUALITY`。
- **小地图**：canvas 绘制护城河底色、各分区矩形、宫墙范围、选中建筑标记、相机位置与朝向；点击分区即可跳转。
- **加载/错误/提示**：订阅 `LOAD_PROGRESS / READY / ERROR`，失败给出可见提示与「重试」；提供操作说明（可折叠）。
- **截图契约**：`?ui=0`（`scripts/shot.mjs` 使用）时隐藏 HUD 并停掉刷新计时器，保证建筑画面无遮挡。

## 自查结果（实际执行）

```
node --check src/ui/index.js          -> OK
node --check src/interaction/index.js -> OK
grep "requestAnimationFrame" src/ui src/interaction -> 无（未新建渲染循环）
grep "camera.position"      src/ui src/interaction -> 无（未直接改相机）
```
UI 内部刷新使用 `setInterval(120ms)` 仅更新 DOM 与 2D canvas。

## 窄屏与触屏

- `max-width:820px` 时收窄左栏与信息面板、缩放小地图、隐藏操作说明；品牌栏提供「面板」折叠开关。
- 触屏可完成视角/分区/时辰/画质切换、小地图点击与（在装置允许范围内）漫游；第一人称转视角支持拖动与指针锁定。

## 未验证 / 已知问题

- 未在真实设备上逐项人工验收八视角与整段第一人称走查；主 Agent 已用无头 CDP 截图覆盖 oblique/iso/axis/focus/zone×6/interior×2/fp 共 13 个视角（见 `docs/shots/`）。
- HUD 的实时 fps/调用数显示依赖 `EV.STATS`，仅在 `?stats=1` 时有源数据，属可选项。
- 第一人称与导览互斥由相机装置实现，UI 仅做状态同步。
