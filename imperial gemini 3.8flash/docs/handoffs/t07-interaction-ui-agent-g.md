# 任务回执 T07 · 交互系统与 UI 控制台实现 (Agent G)

- **执行 Agent**：Agent G (Interaction & UI / Gemini 3.8 Flash)
- **负责文件**：
  - `src/interaction/camera-controller.js`
  - `src/interaction/first-person.js`
  - `src/interaction/tour-controller.js`
  - `src/interaction/picker.js`
  - `src/ui/minimap.js`
  - `src/ui/info-panel.js`
  - `src/ui/hud.js`
  - `src/ui/style.css`

---

## 交付功能清单

1. **八种特色机位一键平滑飞越 (`CameraController`)**：
   - 全城鸟瞰 (Overview)、中轴贯通 (Axis)、太和金銮 (Taihe)、乾清内廷 (Inner)、御苑角楼 (Garden)、西宫养心 (West)、东宫文华 (East)、金銮内景 (Interior) 与坤宁寝暖 (Bedroom)。
   - 采用三次 Hermite 缓动平滑插值，过渡时长 1.2 秒。
2. **第一人称御前漫步模式 (`FirstPersonController`)**：
   - 快捷键 `F` 或按钮即时开启/关闭；
   - 支持 `WASD` / 方向键四向移动，`Shift` 御前疾跑加速；
   - 鼠标 Pointer Lock 原生视角旋转，`Esc` 解除鼠标锁定；
   - 自动地形高度跟随（顺畅攀爬三层须弥座台阶、金水桥拱坡与堆秀山峰）；
   - 严格墙体与实心建筑包围盒碰撞检测。
3. **沉浸式中轴线语音/字幕导览系统 (`TourController`)**：
   - 精选从午门、内金水桥、太和殿直至神武门的 10 处核心景观；
   - 具备上一景、下一景、暂停/继续与退出控制；
   - 底部半透明金边字幕牌展示历史渊源与讲解词。
4. **建筑高亮拾取与详情面板 (`PalacePicker` & `InfoPanel`)**：
   - 鼠标悬停网格实时射线拾取，指针变化；
   - 点击弹出半透明毛玻璃建筑卡片，展示规制等级、历史典故与“可进入/外观可览”状态；
   - 提供“环视聚焦”、“御前漫步”、“步入内景”三大行动按钮。
5. **实时雷达小地图 (`MiniMap`)**：
   - 2D Canvas 实时绘制紫禁城城郭、筒子河、中轴线与各大殿宇投影；
   - 标注前朝、后宫、西宫苑、东宫苑、御花园五大区域互动点，点击地图点直接传送；
   - 漫游状态下实时展示角色所在坐标与视线扩散雷达扇形锥。
6. **三时辰切换与性能监控 (`PalaceHUD`)**：
   - 盛世金辉 (正午)、落霞残阳 (傍晚)、寒月孤灯 (夜景宫灯)；
   - 实时 FPS、三角面数与 Draw Call 计数看板；
   - Web Audio API 物理模拟编钟磬音。
