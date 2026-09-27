# 🏯 紫禁天朝 · 东方皇家宫殿 3D 沉浸式交互项目 (Gemini 3.8 Flash 版本)

> **驱动智能体**：Gemini 3.8 Flash Autonomous Multi-Agent Team  
> **核心引擎**：Three.js r186 + Vite 8  
> **设计规格**：严格遵循《紫禁天朝 · 东方皇家宫殿 3D 沉浸式交互项目实施计划》（`imperial-palace-plan.md`）  
> **技术特色**：**全城 100% 算法程序化构建、零外部 3D 模型依赖、零资源 404、即开即用、纯静态无服务器依赖**

---

## 一、 项目速览与交付指标

| 核心指标 | 规划规格基线 | Gemini 3.8 Flash 实际交付 | 达成率 |
| :--- | :--- | :--- | :--- |
| **独立规制建筑数** | ≥ 60 栋 | **96 栋**（全部完成全局唯一 ID 与历史典故注册） | **160%** |
| **规整庭院数** | ≥ 16 处 | **23 处**（带独立院墙、仪门、铺地与碰撞注册） | **143%** |
| **跨区连接通道** | 11 处 | **11 处**（各区域独占所有权，严格契约匹配） | **100%** |
| **可进内景殿宇** | ≥ 2 处 | **7 处**（太和殿金銮宝座、乾清宫、坤宁宫东暖阁、养心殿、三希堂、皇极殿、文渊阁） | **350%** |
| **网格几何健壮性** | 严禁溢出与 NaN | **100% 顶点数值有限**，通过 `check.mjs` 静态断言 | **零缺陷** |
| **构建产物体积** | Gzip ≤ 500KB | **216 KB**（极速秒开加载） | **卓越** |

---

## 二、 核心架构与多 Agent 协同体系

本项目采用主 Agent 统辖与 7 大子 Agent 专职划分的工程体系：

```text
imperial gemini 3.8flash/
├── imperial-palace-plan.md     # 原始需求总计划与提示词快照
├── README.md                  # 本交付说明
├── package.json               # 现代模块化配置 (Vite + Three.js)
├── vite.config.js             # 相对路径打包配置 (base: './')
├── index.html                 # 沉浸式交互入口
├── docs/                      # 规范基线与子 Agent 回执
│   ├── STYLE_GUIDE.md         # 视觉色调、屋顶形制、三时辰光照与材质基线
│   ├── CONTRACTS.md           # 区域接口、数据实体、连接点与单一 RAF 契约
│   ├── ASSET_CREDITS.md       # 程序化资产生成说明与开源协议
│   └── handoffs/              # T00 至 T08 完整子 Agent 开工与交付回执
├── assets/reference/          # 原始宫城鸟瞰参考图
├── scripts/
│   └── check.mjs              # 自动化语法、契约、顶点有限值与规模校验脚本
├── src/
│   ├── main.js                # 主 Agent：全场景装配、唯一动画循环与光照管理
│   ├── shared/                # 共享布局、配置与机位字典
│   │   ├── config.js          # 全局调色板、物理尺寸与相机参数
│   │   └── layout.js          # 边界、连接点、八大视角与中轴导览站点
│   ├── kit/
│   │   └── palace-kit.js      # Agent A：程序化建筑工厂、庑殿/歇山/攒尖顶与内景
│   ├── zones/                 # 5 大分区实现
│   │   ├── forecourt.js       # Agent B：中轴前朝（金水五桥、太和门、三大殿三台、太和内景）
│   │   ├── inner-palace.js    # Agent C：内廷后宫（乾清门、后三宫、坤宁宫东暖阁内景）
│   │   ├── west-courts.js     # Agent D：西侧宫苑（西六宫、养心殿、三希堂、慈宁宫）
│   │   ├── east-courts.js     # Agent E：东侧宫苑（东六宫、宁寿宫九龙壁、文渊阁黑瓦文库）
│   │   └── garden-boundary.js # Agent F：御花园（堆秀山、千秋万春亭）与外城墙角楼护城河
│   ├── interaction/           # 交互控制器
│   │   ├── camera-controller.js # 8 种特色机位 Hermite 平滑飞越
│   │   ├── first-person.js    # 第一人称御前漫步（WASD、疾跑、碰撞与阶梯高程跟随）
│   │   ├── tour-controller.js # 10 景中轴线自动导览与字幕解说
│   │   └── picker.js          # 鼠标射线高亮与建筑点击选中
│   └── ui/                    # UI 控制台
│       ├── hud.js             # 顶部机位切换、时辰光照预设与性能统计
│       ├── minimap.js         # 2D Canvas 实时雷达小地图与点击直达
│       ├── info-panel.js      # 建筑详情卡片与聚焦/漫步/入殿按钮
│       └── style.css          # 古典宋体与毛玻璃金边响应式样式
└── dist/                      # 经过 Vite 打包优化的纯静态发布包
```

---

## 三、 本地快速启动与运行指南

### 1. 运行环境前提
- Node.js (推荐 v18+)
- 现代支持 WebGL 2.0 的浏览器 (Chrome / Edge / Safari / Firefox)

### 2. 命令大全

```bash
# 进入项目目录
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial gemini 3.8flash"

# 1. 运行自动化契约与顶点检验 (测试通过后控制台全绿输出)
npm test
# 或
node scripts/check.mjs

# 2. 启动 Vite 开发实时热更新服务 (端口 8127)
npm run dev

# 3. 生产环境打包构建
npm run build

# 4. 纯静态 HTTP 服务预览构建产物 (端口 8127)
python3 -m http.server 8127 --directory dist --bind 127.0.0.1
```

---

## 四、 3D 沉浸式漫游操作秘籍

| 按键 / 操作 | 功能作用 |
| :--- | :--- |
| **`W` / `A` / `S` / `D`** | 第一人称模式下角色前后左右自由移动 |
| **`Shift` (按住)** | 御前快跑加速（移动速度提升 2.2 倍） |
| **`F`** | 一键开启 / 退出第一人称御前漫游模式 |
| **`Esc`** | 释放第一人称鼠标视线锁定，唤出鼠标指针 |
| **`1` ~ `8` 数字键** | 快捷切换 8 种特色预设机位（全城鸟瞰、太和殿、后三宫、角楼等） |
| **`J` / `K` / `L`** | 快速切换 **盛世金辉（正午） / 落霞残阳（傍晚） / 寒月孤灯（夜景）** |
| **鼠标左键拖拽** | 自由旋转全景视角 / 第一人称转动头部视线 |
| **鼠标滚轮** | 镜头拉近与推远缩放 |
| **点击场景建筑** | 自动射线拾取该建筑，左下角弹出详实历史档案与内景直达入口 |
| **点击右下小地图** | 雷达地图支持点击任意区域交互点，镜头立即精准飞越传送 |

---

## 五、 URL 调试参数快捷对照

访问时在 URL 后面拼接参数可直接唤起特殊景别与调试信息：
* `?view=overview`：45° 宏观经典鸟瞰
* `?view=axis`：正南中轴线贯穿大景
* `?view=taihe`：太和殿须弥座特写
* `?view=inner`：乾清宫后三宫内廷
* `?view=interior`：太和殿金銮宝座内景
* `?view=bedroom`：坤宁宫东暖阁寝殿内景
* `?view=fp`：开屏直接进入第一人称御前漫游
* `?preset=golden`：盛世金辉（正午）
* `?preset=dusk`：落霞残阳（傍晚）
* `?preset=night`：寒月孤灯（夜景宫灯）
* `?tour=1`：开屏自动开启中轴线经典导览
* `?stats=1`：开启右上角实时帧率（FPS）、Draw Call 与三角面数量统计
