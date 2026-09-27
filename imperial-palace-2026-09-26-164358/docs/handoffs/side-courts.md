# D/E 西宫苑与东宫苑交接记录

## 基线与文件归属

- 已阅读实施计划的布局、风格协议、D/E、模块接口、分工与验收章节，以及 README、布局参考图、`STYLE_GUIDE.md`、`CONTRACTS.md`、共享配置/布局和 `palace-kit.js`。
- 按视觉基线与模块接口 v1 实现；只新增 `src/zones/west-courts.js`、`src/zones/east-courts.js` 和本交接记录。
- 西区世界坐标范围为 X `[-280,-104]`、Z `[-300,300]`；东区为 X `[104,280]`、Z `[-300,300]`。两个区域根节点均保持单位变换。

## 区域内容

- 西区 4 座围合庭院：梨园礼乐庭、藏书清院、清音水庭、尚仪内务院；登记 20 栋建筑，包括院门、正堂、配房、亭阁。
- 东区 4 座围合庭院：文华讲院、御用陈设庭、海棠生活苑、听雨别院；登记 20 栋建筑，包括院门、正殿、配殿、亭阁。
- 两区统一使用共享 `kit.materials` 与 `makeBuilding`/`makeWall`/`makeTree`/`makeLamp`。院落尺度、布置、命名主题和水景位置不同；没有为区域另造色板。
- 院墙留出南北门及侧门，侧向石路穿过院墙门洞连接院群；东西向接道贯通至 X 边界 `±104`，Z `±180` 横路与中轴接合，Z `0` 通路通往 F 管理的东西城门门道。

## 共享连接归属

D/E 对齐以下固定通道，但不重复登记连接对象：`west-south`、`west-north`、`east-south`、`east-north`、`gate-west`、`gate-east`。当前分别由前朝、后宫和花园边界模块登记，保证每个连接 ID 全局只有一个所有者；F 仍负责外宫墙及城门实体。

## 模块接口与验收

两个文件均导出同步 `createZone(ctx)`，返回 `root`、`buildings`、`courtyards`、`connectors`、`colliders`、`update()` 和 `dispose()`。建筑和庭院 ID 使用 `west-`/`east-` 前缀，记录坐标为世界坐标。`connectors` 为空是有意的：冻结连接已由相邻区域唯一登记。

已运行 `node --check src/zones/west-courts.js`、`node --check src/zones/east-courts.js` 和 `npm run check`。结果通过：全项目 88 栋建筑、20 座庭院、11 个唯一登记连接。

尚未验证：浏览器中的区域近景与全城截图、第一人称实地通行、在最终集成场景中逐段核对玩家碰撞。请主 Agent 集成后检查这三项及和 A 共享样板的最终色调/比例匹配。
