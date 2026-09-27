# A · 统一建筑构件库回执

## 开工

- 基线：`imperial-palace-plan.md`、`assets/reference/palace-layout.png`、`docs/STYLE_GUIDE.md` v1、`docs/CONTRACTS.md` v1、`src/shared/config.js` 的 `styleVersion: v1` 和 `src/shared/layout.js` 已读；主任务确认后开工。最终工作目录为 `imperial-palace-2026-09-26-164358/`，旧同名目录的共享配置曾发生并行覆盖，已隔离，不再修改。
- 文件所有权：仅 `src/kit/palace-kit.js` 和本回执；`shared/`、`zones/`、`main.js`、依赖及布局均只读。
- 无区域坐标所有权或跨区连接 ID。消费 Three.js 0.186.1 与 `CONFIG.colors`；保持原有 `createPalaceKit(THREE)`、`kit.materials`、`makeBuilding`、`addBuilding`、`makeCourtyard`、`makeWall`、`makeTree`、`makeLamp`、建筑 record/group、墙体 collider 和每个可见建筑 mesh 的 `userData.buildingId`。

## 交付

- 在单栋建筑内部按共享材质合并网格、烘入本地位移/旋转/缩放；不跨建筑合批，保留每栋独立拾取 ID。门殿实心墙体仍是可由后宫 `hollowGate` 匹配和隐藏的直接 `BoxGeometry` child；门殿不在中央生成装饰门板/柱，避免隐藏实墙后堵住通道。
- 庑殿式四坡屋面保留长正脊并给檐角轻微上翘；檐下采用同模数青绿梁、简化斗栱，瓦面增加细肋。装饰数量依 `ornament` 调整；新增可选 `quality:'low'` 省去斗栱、瓦肋及脊兽，默认 `medium` 与现有调用兼容。共享屋顶材质仍可由全局昼夜系统修改 emissive。
- 同口径 Node 全区场景构造统计（88 栋，20 院，11 连接）：建筑 group 可见 mesh `1143 → 828`（-27.6%），全区 mesh `1945 → 1619`（-16.8%）；总三角面 `34,678 → 90,936`。主殿代表规格 `72×38×22m`、双层、装饰 2：medium `8 mesh / 2,456 triangles`，low `7 mesh / 936 triangles`。统计值是场景对象数/几何数，不等于实际视锥绘制调用或 GPU 帧率；相机、阴影、后处理及 30 秒性能采样由整城集成测量。
- 验证：`npm run check` 通过（88 buildings、20 courtyards、11 connectors）；`node --check src/kit/palace-kit.js` 通过；独立 Node 断言所有可见 kit 建筑 mesh 拾取 ID 正确、门殿实墙 direct child 保留、低档几何减少、顶点坐标有限。未在本任务单独测浏览器截图、GPU FPS/P95 或 1440×900 真正 draw calls；等待主任务整体验收。
- 无新增下载资产、纹理、许可证或包依赖。共享几何和材质继续由 kit 持有，区域不应释放其缓存；单楼合并网格只属于对应建筑，未来若频繁热卸载/重建区域，可补明确的 kit 资源生命周期管理。
