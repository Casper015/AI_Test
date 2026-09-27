# F 御花园与外城边界交付回执

## 开工基线与文件归属

- 计划章节：第 2、3、5.5、6、7 章；共同基线 `STYLE_GUIDE v1`、`CONTRACTS v1`。
- 坐标采用米制世界坐标，Y 向上、北为 `+Z`；连接位置直接读取冻结的 `src/shared/layout.js`。
- 本任务仅负责 `src/zones/garden-boundary.js` 与本回执。共享配置、布局、kit、入口和其他区域均保持只读。
- 使用 `kit.materials` 以及 `kit.makeWall`、`kit.addBuilding`、`kit.makeTree`、`kit.makeLamp`；桥、开放式门架、地面和园林景观使用本区域的程序化网格。

## 范围与连接

- 外墙沿 `x = ±284`、`z = ±430` 闭合；南、北、西、东墙分别为实际分段门洞，使用 `gate-south`、`gate-north`、`gate-west`、`gate-east` 的冻结宽度。
- 四角角楼位于四隅墙线内侧；墙外护城河为四面连续水带，四座石桥穿越水面、对准各门洞。
- 南桥、南门和 `forecourt-south` 连接点沿中轴排列；北门与御花园主亭同轴，`inner-garden` 接后宫北口。
- 本区返回的连接 ID：`gate-south`、`forecourt-south`、`inner-garden`、`gate-north`、`gate-west`、`gate-east`。位置、宽度、目标区来自共享 layout，不复制改写其数值。
- 西/东宫苑由对应区域提供内部连接；本区不代建位于 `z=180` 的 `westNorth`、`eastNorth` 区间连接。

## 交付内容

- 4 座可穿行门架、4 座角楼、3 座御园亭阁；建筑 ID 使用稳定 `garden-` 前缀。
- 1 个注册御花园空间，左右草坪、轴线步道、双池水景、叠石、树群、灯具。
- 全城低位基底、四面闭合朱墙与垛口、护城河水带、外岸石沿、4 座桥和南门内侧轴线路面。
- 区域返回 `root`、`buildings`、`courtyards`、`connectors`、`update`、`dispose`，符合 v1 模块契约。

## 验收

- `node --check src/zones/garden-boundary.js`：通过。
- 使用真实 Three.js 与 `createPalaceKit(THREE)` 实例化 `createZone`：通过；登记 11 栋建筑、1 个御花园空间、6 个精确匹配 layout 的连接点，以及 4 座门架与 4 个对应桥组；场景根节点有 127 个对象。
- 四面墙均调用 kit 的分段 `makeWall` 且带对应 `gateWidth`，中央下部保持开放；四座桥与四门共享轴线/中心位置。南桥内端与南门—`forecourt-south` 轴线步道搭接，北门与中央御园步道同轴。
- 整城性能、浏览器视觉、碰撞漫游、与相邻区域最终连接需在主 Agent 集成后验证；本任务完成的是静态与模块实例化检查，没有进行浏览器截图验收。

## 未验证项

- 本任务不拥有主入口与交互/碰撞实现；桥面在视觉上连通，第一人称碰撞和可行走面需 G/主 Agent 接入后检查。
- 园林树石和屋顶采用程序化构件；若主 Agent 后续选定第三方资产，应继续按统一材质和模数调整。
