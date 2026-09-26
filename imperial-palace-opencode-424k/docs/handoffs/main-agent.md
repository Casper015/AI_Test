# 主 Agent 开工与交付回执

任务 ID / Agent：`main-agent`（入口、core、shared、集成、验收）

已读计划、风格与接口版本：imperial-palace-plan.md（全篇）、style-baseline-v1、layout-v1、CONTRACTS api-v1

可写文件 / 只读依赖：`index.html`、`src/main.js`、`src/core/*`、`src/shared/*`、`scripts/*`、`tests/*`、`docs/*`、`README.md`、`package.json`、`public/vendor/*`；只读依赖：three r169 与其 addons

区域边界 / 连接 ID / 入口与标高：宫城包络 X∈[-300,300]、Z∈[-420,420]，护城河 322/366、442/486；13 个连接器（南桥、午门、奉天门、乾清门、顺贞门、东西华门、东西侧路各 3）全部登记于 `src/shared/layout/boundary.js`

使用的建筑 kit 与材质：`src/kit/`（`hall11/hall9/hall9b/hall7/hall5/house3/house5/square3/pav2/pav1/gate3/gate1/gateMain/towerCorner/towerTall/wallSeg` + 台基/台阶/栏杆/廊庑/桥/树/石/陈设/宫灯）

要消费和返回的接口：`createZone(ctx)`（见 CONTRACTS §2）、事件与状态（§3）、碰撞数据（§4）、相机装置（§7）

验收方式 / 性能预算：`npm test`（63 项，含布局、连接器、水面、栅格连通性、机位登记）、无头 Chrome 走查主路线 31/31 与侧苑 35/35、1440×900 DPR1 记录主场景单次 348 draw / 25.1 万三角、含阴影与后处理整帧 488 draw / 32.2 万三角、60 FPS

**交付内容**

- 入口与组装：`index.html`、`src/main.js`（唯一 rAF 循环、分区装配、输入、导览、UI 联动）
- 渲染与后处理：`src/core/renderer.js`（EffectComposer + UnrealBloom + OutputPass，质量档切换）
- 统一环境：`src/core/environment.js`（渐进天空、单主光阴影、雾、三时辰预设）
- 唯一相机装置：`src/core/camera-rig.js`（八视角 + 1.2 s 过渡 + 第一人称驱动 + 室内包围盒限制）
- 布局冻结：`src/shared/layout/*`（110 建筑、24 院落、182 墙段、54 台阶、9 桥、16 水面、182 树、410 障碍、13 连接器、16 机位）
- 集成验收：`npm test` 全绿；主路线（南桥 → 午门 → 奉天门 → 礼仪广场 → 三台丹陛 → 金銮殿内景 → 中轴 → 乾清门 → 乾清宫内景 → 坤宁宫 → 顺贞门 → 御花园）31/31 通过；侧苑路线 35/35

**已知问题 / 未验证**

- E/W 侧门（东华门/西华门）门洞按 90° 旋转生成障碍，人工走查未覆盖（连接器 `conn-west-gate`/`conn-east-gate` 已登记且栅格连通性通过）。
- 真实设备（移动端 Safari / 中端 GPU）未实测；性能数据来自 Chrome 149 headless（ANGLE/Metal）。
