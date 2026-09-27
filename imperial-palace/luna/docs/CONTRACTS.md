# 模块与数据契约 v1.0.0

## 共享布局

`src/shared/config.js` 是相机、时辰、设计边界与视觉 token 的共享配置。`src/zones/catalog.js` 是建筑、院落、跨区连接的唯一登记表：建筑 ID 全局唯一，坐标为世界坐标，尺寸单位为米。修改 ID 或边界时同步调整小地图、导览、碰撞与数量检查。

## 建筑记录

每座建筑至少具有 `id、name、zone、x、z、width、depth、kind、platform、category、description、interior`。`createPalace()` 返回统一注册表、院落清单、连接点、可选中实例、屋顶实例索引与统计数据。选中通过 `InstancedMesh` 的 `instanceId` 映射回建筑记录。

## 所有权

- `src/kit/architecture.js`：共享几何/材质实例批次、标准殿堂和院墙。
- `src/zones/catalog.js`：布局清单与稳定标识。
- `src/zones/createPalace.js`：世界装配、全城边界、道路、水系与景观。
- `src/main.js`：唯一 renderer、场景、相机、光照、状态、选择、导览和漫游循环。
- `src/ui/`：HUD 样式与页面交互外观；业务状态由主入口维护。

区块不创建独立 renderer 或动画循环。后续拆分区域模块时仍消费相同建筑记录与连接 ID。
