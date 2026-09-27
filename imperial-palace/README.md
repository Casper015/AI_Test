# 完整皇宫项目规划与双子工程归档

本目录保留了《紫禁天朝 · 东方皇家宫殿 3D 沉浸式交互项目》的统一提示词规格与参考资源，并归档了由 ChatGPT 会话自主交付的两个独立 3D 皇宫子项目：

- `imperial-palace-plan.md`：完整多 Agent 实施需求与阶段验收规划。
- `assets/reference/palace-layout.png`：配套全城空间布局参考图。

## 子工程目录

1. **`sol/` —— GPT-6 Sol（几何合批与漫游优化版）**
   - 包含 88 栋规制殿宇、20 座封闭庭院；
   - 采用静态网格合批（StaticBatching）优化，全城 Draw Call 仅 116（缩减 91.5%）；
   - 通过 `npm run check`（结构、漫游连通性与批处理测试全绿）；
   - 本地运行：`cd sol && npm ci && npm run dev`。

2. **`luna/` —— GPT-6 Luna（3D 交互沙盘巡游版）**
   - 完整护城河、金水桥、中轴御道与建筑导览；
   - 太和殿与乾清宫进入内景时屋顶支持半透明渐隐展示；
   - 支持中轴自动巡游、昼夕夜三时辰光影切换与全城小地图；
   - 本地运行：`cd luna && npm ci && npm run dev`。
