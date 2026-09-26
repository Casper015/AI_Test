# A 资源与建筑库 · 回执

任务 ID / Agent：`A-kit`

已读版本：style-baseline-v1、layout-v1、CONTRACTS §6

可写文件 /只读依赖：`src/kit/*`、`public/vendor/*`（新增后处理 addons）、`docs/ASSET_CREDITS.md`；只读：`src/shared/*`

交付内容：`materials.js`（12 类程序化材质 + 时令联动）、`geom.js`（世界米 UV 基元与合并）、`parts.js`（庑殿/歇山/硬山/攒尖屋面、须弥座、栏杆、台阶、墙段、廊庑、桥）、`props.js`（树/石/陈设/宫灯/地形）、`kit.js`（18 种构件工厂 + 尺寸表）、`interior.js`（金銮殿与乾清宫内景）、`batcher.js`（分区 × 构件 × 材质实例化、阴影策略）

性能与预算：单构件几何一次生成、全城共享；实例化后主场景单次 348 draw（预算 350）、25.1 万三角（预算 150 万）

已知问题：`house5` 用于 24–26 m 厢房时存在 ≤8% 单向变形（已登记于 STYLE_GUIDE 变形上限内）；低质量档仅去装饰构件，未做几何级 LOD（以实例聚类 + 视锥剔除替代，已记录理由）
