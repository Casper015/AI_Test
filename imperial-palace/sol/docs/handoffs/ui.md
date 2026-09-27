# G / UI 交付回执

> 最终交付按用户指定迁至 `imperial-palace/sol/`；下方旧目录名是实施时记录。

- **基线**：视觉 v1、模块契约 v1、共享配置 `styleVersion: v1`。2026-09-26 阅读总计划、原参考图、STYLE_GUIDE、CONTRACTS、config/layout 和现有 UI；主 Agent 确认后才开始编辑。
- **文件归属**：仅编辑 `index.html`、`src/ui/style.css` 和本回执。`src/main.js`、共享配置、构件与各区域由主 Agent/对应负责人维护。
- **接口**：保留全部既有 DOM ID、`data-view`、`data-time`、`.active`、`.has-selection`、`.is-playing`、`.hidden`、`.visible` 等选择器。新增默认 `hidden` 的 `#visit-button`，由主 Agent 根据 `building.interiorView` 控制显隐与内景机位。地图仍由主逻辑更新 `#map-player`，加载失败使用原有 `#loading-caption` / `#retry-button`，画质由 `#quality-button` 文本显示。
- **表现**：桌面地图收至右侧窄幅，左下信息卡缩窄；手机地图变为可横向滑动的七分区按钮列，时辰、卡片、导览/漫游/总览操作和画质控制保持可点。手机提示触摸鸟瞰与点选可用，第一人称漫游需要键鼠。新增两处内景按钮的卡片样式、加载失败/重试样式和短屏布局。
- **检查**：`npm run check` 通过（88 栋建筑、20 座庭院、11 个连接点）；`npm run build` 通过。浏览器实际查看 1280×720、390×844、320×568、844×390；竖屏地图与信息卡没有覆盖中部主要殿群，横屏画质状态移至顶部且不盖地图。浏览器中确认 390×844 的顶部导航、提示与画质框互不重叠。UI 截图为临时浏览器预览，未保存文件；主 Agent 负责最终固定机位截图。
- **预算/限制**：本任务没有增加 WebGL 网格、动画循环或第三方资源，未单独采样 FPS、P95 和 UI 绘制开销。构建仍提示主 JS chunk 超过 500 kB，非 UI 样式产生的阻断错误。手机竖屏的相机适配与完整宫城取景由 `main.js` 负责人处理；本任务只保证 HUD 避让和控件可用。
