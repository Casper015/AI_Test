# 紫禁天朝 · 完整皇宫 3D 项目

参照用户提供的宫城鸟瞰图，用 Three.js 程序化搭建的**完整皇宫 3D 交互项目**：中轴前朝、后宫、东西宫苑、御花园、城墙、城门、角楼、护城河与桥梁，**110 栋有顶建筑、24 个院落**，含金銮殿与乾清宫两处可进入内景，八种视角（含第一人称漫游）、分区跳转、建筑选中与信息、中轴导览、昼/夕/夜三时辰、小地图与加载状态。

- 实施计划：[imperial-palace-plan.md](imperial-palace-plan.md)
- 风格基线：[docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md)（style-baseline-v1，含参考截图索引 `docs/screenshots/`）
- 接口契约：[docs/CONTRACTS.md](docs/CONTRACTS.md)（layout-v1 / api-v1）
- 资源与许可：[docs/ASSET_CREDITS.md](docs/ASSET_CREDITS.md)
- 各任务回执：[docs/handoffs/](docs/handoffs/)
- 用户布局参考图：[assets/reference/palace-layout.png](assets/reference/palace-layout.png)

## 快速开始（已实测）

要求：Node.js ≥ 18（仅用于本地服务/构建/测试）；浏览器需支持 WebGL2 与 ES Module importmap（Chrome/Edge/Safari 16+/Firefox 110+）。**无需联网，无需 npm install**（three.js 已内置于 `public/vendor/`）。

```bash
node scripts/serve.mjs 5173        # 或：npm run dev
# 打开 http://localhost:5173/index.html
```

构建与预览：

```bash
npm run build                     # 复制运行时文件到 dist/（保持相对路径）
cd dist && node ../scripts/serve.mjs 5174   # 预览构建产物
```

测试（布局、连接器、水面、第一人称连通性、机位登记）：

```bash
npm test                          # node tests/layout.test.mjs，当前 63 项全绿
```

## 操作说明

| 操作 | 说明 |
| --- | --- |
| `1`–`8` / 左侧视角列表 | 切换八种视角：全城鸟瞰、等距沙盘、中轴透视、分区、建筑近景、室内、第一人称、自由环绕 |
| 鼠标左键拖动 / 滚轮 | 旋转 / 缩放（鸟瞰、沙盘、分区、近景、环绕、室内）；室内视角限制在殿内包围盒内 |
| 点击建筑 | 选中并高亮，右侧面板显示名称、类别、用途、可否进入，可直接“建筑近景 / 进入内景 / 走到附近” |
| `F` 或「第一人称」 | 进入第一人称：`WASD`/方向键行走、`Shift` 疾走、点击画面锁定鼠标环视（`Esc` 释放），再次按 `F` 或 `Esc` 退出并恢复原机位 |
| `T` | 中轴导览：南桥 → 午门 → 礼仪广场 → 三台 → 金銮殿内景 → 乾清门 → 寝殿内景 → 御花园；可暂停/继续/上一站/下一站/退出，手动操作相机自动暂停 |
| 右上：时辰 | 盛世金辉 / 落霞夕照 / 寒月宫灯 |
| 右上：质量 | 精细 / 均衡 / 流畅（DPR、阴影、Bloom、树量、装饰构件） |
| 左下小地图 | 点击任意位置定位到所属分区；金点表示当前位置与朝向 |
| 分区跳转 | 全城 / 前朝 / 主殿 / 后宫 / 西宫苑 / 东宫苑 / 御花园 |

窄屏与触屏：窄屏保持面板可读（左栏 156 px、面板 220 px）；触屏可鸟瞰、点选与使用第一人称左下虚拟摇杆，双指缩放由 OrbitControls 提供。

## 目录结构

```text
imperial-palace/
├── index.html                 # 开发入口（importmap → public/vendor）
├── package.json               # 仅脚本，无第三方依赖
├── src/
│   ├── main.js                # 组装与唯一 rAF 动画循环
│   ├── core/                  # renderer / environment / camera-rig / state / events
│   ├── shared/                # config（风格与预算） + layout（冻结布局数据）
│   ├── kit/                   # 材质、几何基元、构件、内景、实例化装配
│   ├── zones/                 # B–F 分区装配（含 zone-base 契约实现）
│   ├── interaction/           # 碰撞与第一人称、选中与高亮、导览
│   └── ui/                    # HUD、信息面板、小地图、样式
├── public/vendor/three/       # three r169 + OrbitControls/BufferGeometryUtils/后处理（MIT）
├── scripts/serve.mjs          # 零依赖静态服务
├── scripts/build.mjs          # 构建到 dist/
├── tests/layout.test.mjs      # 布局与连通性检查
├── docs/                      # 风格指南、接口契约、资源登记、任务回执、截图
├── assets/reference/          # 用户参考图（不进入运行时）
├── work/                      # 中间件与临时分析（空，不进入发布包）
└── dist/                      # 构建产物（npm run build 生成）
```

## 实测数据（Chrome 149 headless，ANGLE/Metal，1440×900，DPR 1，精细档）

| 指标 | 数值 | 预算 |
| --- | --- | --- |
| 主场景单次渲染（关阴影） | **348 draw / 25.1 万三角** | ≤350 draw / ≤150 万三角 |
| 整帧（含阴影 + Bloom 后处理） | **488 draw / 32.2 万三角** | — |
| 帧率 | 60 FPS（headless 采样 1 s 平均） | ≥60（弱机降档至 30） |
| 运行时资源 | ≈1.4 MB（本地，全部离线可用） | ≤25 MB 首屏 |
| 建筑 / 院落 / 墙段 / 台阶 / 桥 / 水面 / 树 | 110 / 24 / 182 / 54 / 9 / 16 / 182 | ≥50 / ≥12 |

建筑总数由 `LAYOUT.stats` 与 `npm test` 双重核对，未使用廊段或拆件虚增。

## 已实测的验收项

- **布局**：首屏全城鸟瞰可见完整宫墙、护城河、中轴与两侧院落群（`docs/screenshots/01-oblique-day.png`）。
- **八视角**：`1–8`、按钮、`F`、`Esc` 行为一致；进入与退出第一人称恢复原机位；室内视角限制在殿内。
- **第一人称走查**（页面内确定性走查 `window.__APP.routeTest()`）：南桥 → 御道桥 → 午门中门洞 → 奉天门 → 礼仪广场 → 三台丹陛 → 三层台基顶 → 金銮殿内景（绕宝座）→ 北门 → 中和殿/保和殿东侧 → 下三台 → 乾清门 → 乾清宫内景 → 出北门 → 坤宁宫东侧 → 顺贞门 → 御花园，**31/31 段全部通过**；侧苑路线（西苑两列院落 + 上林苑 + 太液桥、东苑院落 + 奉天楼 + 澄波池）**35/35**。
- **碰撞**：门洞可通行、台阶连续（落步带 ≥2.8 m）、水面不可行走、桥面可通行、殿内柱/宝座台/暖阁/床榻/龙案为障碍、宫城包络不可越出。
- **时辰**：昼/夕/夜三预设切换无报错，夜景宫灯自发光与 Bloom 生效（`02/03` 截图）。
- **测试**：`npm test` 63 项全绿（含栅格洪泛连通性：南桥↔御花园、广场↔东西苑）。

## 已知限制

- 东华门/西华门门洞按 90° 旋转生成障碍并通过栅格连通性检查，但未做人工第一人称逐门走查。
- 真实移动端设备（iOS Safari / 中端 Android GPU）未实测；性能数据来自桌面 headless Chrome。
- 建筑与院落数量、尺寸为项目设计目标，不是对真实紫禁城数量的考据声明；宫殿名为展示设定。
- 除金銮殿与乾清宫外，其余建筑外部完整、内部不开放（面板明确提示“此建筑不可进入”）。
