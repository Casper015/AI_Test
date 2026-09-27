# B · 中轴前朝交接记录

## 开工基线

- 风格基线：`STYLE_GUIDE v1`（`roofGold #d8a83c`、`vermilion #8f2d26`、`marble #d9d5c9`、米制、北为 `+Z`）。
- 模块契约：`CONTRACTS v1`；区域入口为同步 `createZone(ctx)`。
- 共享 kit：`makeBuilding` / `addBuilding`、`makeCourtyard`、`makeWall`、`makeTree`、`makeLamp`。
- 只写入 `src/zones/forecourt.js` 和本交接记录；未修改共享布局、接口、kit 或其他区域。

## 区域与接口

- 区域边界：`X ∈ [-100,100]`、`Z ∈ [-398,83]`，地坪 `Y=0`。全部几何使用世界坐标，区域根节点不做位移或缩放。
- `forecourt.js` 导出 `createZone(ctx)`，读取 `ctx.THREE`、`ctx.kit`、`ctx.layout`、`ctx.zoneKey`，返回 `root`、`buildings`、`courtyards`、`connectors`、`colliders`、`update`、`dispose`；`colliders` 由共享庭院构件注册。
- `forecourt-south`、`axial-inner`、`west-south`、`east-south` 均从 `layout.CONNECTORS` 原样读取 ID、坐标、宽度与目标区。南城门本体及 `gate-south` 属于 F；内廷门属于 C，B 只保留到连接点的通路。
- 所有可识别建筑通过共享 `kit.addBuilding` 创建，ID 使用 `forecourt-` 前缀；建筑记录附有 world-space bounds、南向入口坐标、用途介绍及 access 状态。公共装饰使用 kit 材质和共享树/灯构件。

## 已实现内容

- 连续南北中轴、四段礼仪庭院、主轴开口围墙，以及通往东西宫苑的南侧通道。
- `19` 栋登记建筑：两组前朝门阙、钟鼓楼、礼仪与主殿配殿、太和殿、中和殿、保和殿及前庭值房/侍从殿。
- `8` 座登记庭院：4 座轴线礼仪院 + 4 座由共享 courtyard factory 生成的侧院。
- 太和殿以 `width=76m`、`height=36m`、`tiers=2`、`kind=main` 作为全区最高等级建筑；补充三层白石台基、栏杆、宽阶和丹陛御道。
- 采用统一金瓦、朱墙、青绿与白石材质；配殿、门阙、主殿逐级缩小。

## 验收与限制

- `node --check src/zones/forecourt.js` 通过。
- 使用 Three.js `0.186.1`、真实 `createPalaceKit(THREE)` 和 `src/shared/layout.js` 执行模块构造烟测：成功返回 19 栋建筑、8 座登记庭院、4 个跨区连接和 20 条庭院墙体 collider；太和殿记录的 `category` 为 `main`；调用 `dispose()` 无异常。
- 模块根节点包含 132 个直属对象（包含围墙、庭院、灯、树、廊庑及建筑组）；这不是整帧 Draw Call 实测值。
- 初次区域交付时主殿内景尚未实现。集成阶段主 Agent 将太和殿登记为可入内，并调整共享 kit 的 `openFront` 构件以保留中央门洞；宝座与屏风仍为简化构件。
- 初次交付时 `forecourt-south.targetZone` 尚有语义冲突；集成阶段已由主 Agent 校正为 `forecourt`，当前唯一连接检查通过。
- 本交接记录反映区域 Agent 的初次交付。整城浏览器与构建验收见 `docs/INTEGRATION_CHECKS.md`；从广场完整步行进入主殿及墙体碰撞仍需验收。
