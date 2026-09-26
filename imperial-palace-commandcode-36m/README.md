# 紫禁天朝 · 完整皇宫 3D 交互项目

一个可以俯瞰整座皇宫、分区游览、点选建筑查看信息、并以第一人称走查中轴的 Three.js 3D Web 项目。

- 全城：连续的南北中轴、前朝、后宫、东西宫苑、御花园、宫墙、四角角楼、四面城门、护城河与桥梁。
- 规模：**74 栋**可独立识别的有顶建筑、**18 处**院落，全部由统一的程序化建筑构件库生成，无第三方模型。
- 体验：全城鸟瞰、八种视角（含第一人称漫游）、分区跳转、建筑选中与信息面板、中轴导览、昼夕夜切换、小地图。
- 重点内景：金銮殿与后宫寝殿提供可进入、可观赏的室内陈设。

> 本项目为参考图启发的明清皇家宫城沙盘，建筑数量与尺寸是设计目标，不构成对真实紫禁城的考据声明。

## 运行环境

- 现代浏览器（需支持 ES Modules 与 importmap）；Three.js 已内置于 `public/vendor/three/`，**无需 npm install**。
- 本地预览需要 `python3`（用于 `npm run serve` / `npm run build` 后的静态服务）。
- 测试与构建需要 Node.js（建议 ≥ 18）。
- 无头截图需要 Google Chrome（默认路径 `/Applications/Google Chrome.app/...`，可用环境变量 `CHROME_BIN` 覆盖）。

## 命令（均已实测）

```bash
# 1) 本地预览（开发用），默认 http://127.0.0.1:8123/
npm run serve

# 2) 运行检查（布局 / 构件库 / 分区契约）
npm test

# 3) 构建发布包到 dist/（保持资源相对路径）
npm run build

# 4) 无头截图（view 见下方视角清单；结果写入 docs/shots/）
npm run shot -- oblique golden docs/shots/view-oblique-golden.png
```

构建产物预览：

```bash
cd dist && python3 -m http.server 8124 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8124/
```

URL 参数（便于验收与截图）：

| 参数 | 说明 |
| --- | --- |
| `?view=oblique\|iso\|axis\|zone\|focus\|interior\|fp\|orbit` | 初始视角模式 |
| `&id=<机位或建筑 id>` | `zone`/`interior` 用机位 id；`focus` 用建筑 id |
| `&spawn=<fp 出生点 id>` | 第一人称出生点 |
| `&preset=golden\|dusk\|night` | 时辰预设 |
| `&q=high\|medium\|low` | 画质档 |
| `&ui=0` | 隐藏 HUD（截图用） |
| `&stats=1` | 显示 fps / draw call / 三角面 |

## 操作

- **鼠标**：左键拖拽旋转 · 右键拖拽平移 · 滚轮缩放。
- **键盘**：`1`–`8` 切换八种视角 · `F` 进入/退出第一人称 · `Esc` 退出第一人称（或取消选中）。
- **第一人称**：`WASD` / 方向键移动 · `Shift` 加速 · 鼠标拖动（或点击锁定）转视角。
- **选中**：点击建筑查看名称、区域、用途与是否可入内；点击空白处取消。

八种视角：全城鸟瞰 `oblique`、等距沙盘 `iso`、中轴透视 `axis`、分区视角 `zone`、建筑近景 `focus`、室内视角 `interior`、第一人称 `fp`、自由环绕 `orbit`。

## 目录结构

```text
imperial-palace copy 2/
├── imperial-palace-plan.md      # 总计划
├── README.md                    # 本文件
├── index.html                   # 入口
├── package.json                 # 脚本（无外部依赖）
├── docs/
│   ├── STYLE_GUIDE.md           # 风格基线
│   ├── CONTRACTS.md             # 接口、所有权与验证
│   ├── TASK_BRIEF.md            # 分区/交互施工简要
│   ├── shots/                   # 验收截图（13 个视角）
│   └── handoffs/                # 各任务开工与交付回执
├── assets/reference/            # 用户布局参考图
├── public/vendor/three/         # 内置 Three.js 与 addons
├── src/
│   ├── main.js                  # 组装与唯一动画循环
│   ├── core/                    # 渲染、相机装置、环境、状态、注册表、地形、加载
│   ├── shared/                  # config / layout / events / rng（唯一数值来源）
│   ├── kit/                     # 统一建筑构件库与材质
│   ├── zones/                   # 六个分区实现（forecourt/inner-palace/west/east/garden-boundary）
│   ├── interaction/             # 拾取、高亮
│   └── ui/                      # HUD、切换器、信息面板、导览、小地图
├── scripts/                     # 预览、构建、截图
└── dist/                        # 构建产物
```

## 验收现状

| 项 | 状态 |
| --- | --- |
| `npm test`（布局 68 栋/18 院/14 连接/8 视角；构件库；六分区契约） | 通过 |
| `npm run build` | 通过 |
| `npm run serve` 与 `dist/` 预览 | 通过（HTTP 200） |
| 八视角 + 内景 + 第一人称截图 | `docs/shots/` 共 13 张 |
| 建筑 / 院落 / 障碍与可行走面登记 | 六分区均登记 |

## 已知限制

- 内景在「盛世金辉」预设下偏暗（无室内专属补光），夜景预设下灯笼点光会显著提亮。
- 城门/宫门为近似碰撞（门洞分块），台基边缘无栏杆碰撞；第一人称碰撞为世界坐标包围盒，不是精确网格。
- 宫墙与城台的衔接、廊庑与院墙的交叠为视觉近似，非严格对齐。
- `layout.js` 中 `rot` 的说明文字（90=东、270=西）与 Three.js 实际旋转方向相反；代码内几何与相机取景自洽，未改动冻结布局。
- 分区 B/C/F 中保留了少量「检测到 NaN 才生效」的防御分支；主 Agent 修复构件库根因后这些分支已不再触发（属可清理的惰性代码）。
- 无头截图工具使用 Chrome DevTools Protocol 等待场景就绪；本机存在并发会话时偶发超时，脚本会自动重试。
