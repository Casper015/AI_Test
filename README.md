# 🏯 AI 3D 皇宫项目（Imperial Palace 3D）多 Agent 横向评测与交付档案

[![CI Automated Test & Build](https://github.com/Casper015/AI_Test/actions/workflows/ci.yml/badge.svg)](https://github.com/Casper015/AI_Test/actions/workflows/ci.yml)
[![Deploy Showcase to GitHub Pages](https://github.com/Casper015/AI_Test/actions/workflows/pages.yml/badge.svg)](https://github.com/Casper015/AI_Test/actions/workflows/pages.yml)
[![Live Demo Portal](https://img.shields.io/badge/Live%20Demo-Online%20Showcase-gold?style=flat&logo=safari)](https://casper015.github.io/AI_Test/)

> 🌐 **在线免安装体验大厅**：[https://casper015.github.io/AI_Test/](https://casper015.github.io/AI_Test/)  
> 任意设备浏览器点开即玩，无需配置本地服务器，一键畅游 4 款 AI 独立生成的 3D 紫禁城！

本项目记录了同一份高级复杂工程需求——**《紫禁天朝 · 东方皇家宫殿 3D 沉浸式交互项目》（`imperial-palace-plan.md`）**，在不同 AI Coding Agent（**OpenCode CLI**、**Command Code**、**DeepSeek Harness (DSH)**）环境下独立全自主执行的横向评测结果、执行对话记录与交付成果。

所有版本均严格遵循：**Three.js r169 内置零 npm 依赖、全城程序化构建、无第三方 3D 模型、支持全景鸟瞰与第一人称御前漫步**。

---

## 一、 8 个版本横向评测总览表

| 目录与 Git 仓库 | 在线试玩 (GitHub Pages) | 所用 AI 工具 / 框架 | 驱动模型 | 消耗 Token 统计 | 交付建筑 / 院落规模 | 核心工程特色与交付评级 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`imperial-palace-opencode-516k`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/opencode-516k/) | **OpenCode CLI** (v1) | `deepseek-v4.1-flash` (via OpenCode Go) | **516,452** tokens | 68 栋建筑<br>18 处院落 | • 自动将计划扩展为多角度视角与第一人称规范<br>• 三层内核架构（core/kit/zones）标准模块化<br>• 单元测试体系完备 |
| **`imperial-palace-opencode-424k`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/opencode-424k/) | **OpenCode CLI** (v2) | `deepseek-v4.1-flash` (via OpenCode Go) | **424,497** tokens | **110 栋建筑**<br>24 处院落 | • **超高密度还原**：182段宫墙、54处台阶、9座桥、182株树<br>• Token 利用效率极高，完整实现了金銮殿与寝殿内景 |
| **`imperial-palace-commandcode-36m`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/commandcode-36m/) | **Command Code** (v1.66.0) | `deepseek-v4.1-flash` (High Effort · Taste-1) | **35,900,000** tokens<br>(35.9M) | 74 栋建筑<br>18 处院落 | • **主-子 Agent 协同与根因修复**（耗时 36m 32s）<br>• 主动修复 4 大图形学底层 Bug（NaN屋面、变换丢失等）<br>• 重构 CDP 无头浏览器截图管线，版本规范升至 v1.0 |
| **`imperial-palace-dsh-1.1b`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/dsh-1.1b/) | **DeepSeek Harness** (DSH) | `deepseek-v4.1-flash` (Deep-Agent 架构) | **1,111,473,426** tokens<br>(1.11B) | 67 栋建筑<br>18 处院落 | • **超大规模纵深研发**：耗费 11 亿 Tokens<br>• 23 组严格的契约测试与真机环境探针<br>• 具有最严苛的工程交付回执与证据链 |
| **`imperial-palace-gpt6luna`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/gpt6luna/) | **ChatGPT (Codex Work)** | `GPT-6 Luna` (多子 Agent 分区协作) | 独立会话推进 | **88 栋建筑**<br>20 处院落 | • 5 大区域（前朝/后廷/东西苑/御花园）子 Agent 分工并行<br>• `check.mjs` 自动化边界、顶点有限值与唯一连接校验<br>• 现代化 Vite 构建，内置小地图定位与御前漫游 (F 键) |
| **`imperial gemini 3.8flash`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/gemini-3.8flash/) | **Gemini 3.8 Flash** | `gemini-3.8-flash` (7 专职子 Agent 协同) | 全程自主多智能体 | **96 栋建筑**<br>23 处院落 | • **160% 超额交付**：96 栋殿宇、23 处院落、**7 处可进殿堂**（金銮殿/东暖阁/三希堂/文渊阁等）<br>• 三大殿 y=4.5m 汉白玉基台，堆秀山御景亭 y=13.5m 极顶俯瞰<br>• 全程算法程序化，产物体积仅 216 KB |
| **`imperial-palace/luna`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/imperial-palace/) | **ChatGPT (Codex Work)** | `GPT-6 Luna (Tour)` | 交互沙盘巡游 | 68 栋建筑<br>16 处院落 | • 沉浸式中轴巡游沙盘，太和殿与乾清宫内景支持屋顶渐隐展示<br>• 支持昼/夕/夜三时辰光影与小地图定位 |
| **`imperial-palace/sol`** | [🏛️ 在线体验](https://casper015.github.io/AI_Test/gpt6-sol/) | **ChatGPT (Codex Work)** | `GPT-6 Sol` (几何合批优化) | 静态网格合批优化 | **88 栋建筑**<br>20 处院落 | • **网格数量削减 91.5%**（1372 → 116 组 Batch）<br>• 保留 88 栋建筑独立拾取与射线碰撞，帧率成倍提升，漫游连通全绿 |

---

## 二、 各版本详细对话记录与执行过程剖析

### 1. OpenCode 版本一：`imperial-palace-opencode-516k`
* **工程路径**：`AI_Test/imperial-palace-opencode-516k/`
* **记录来源**：从本地 OpenCode 数据库（`opencode.db` 会话 `ses_f23230f04ffeCc7yBX8R0GrxF5`）检索还原。

#### 核心对话与执行流：
```text
[USER @ 02:23:10]:
AI_Test/imperial-palace/ 阅读一下 这下面的这些计划 然后按照里面的计划启动子代理来处理这个计划 最后给我输出结果放在这个文件夹里面

[USER @ 02:23:40] (追加要求):
最后加入多角度模式，包含第一人称的计划

[USER @ 05:01:24] (调试反馈):
debug 然后接着完成 太多图片了

[ASSISTANT @ 05:08:18 (已完成交付)]:
已完成。项目在 /Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace/，可直接运行。

这一轮做的：
1. 计划补入「多角度模式（含第一人称）」：imperial-palace-plan.md 新增 §6.4（8 种视角表 + 第一人称深度行走要求 + 机位登记接口 + 验收），并同步 §1.1/§6.1/§6.2/§7.1–7.3/§8.1/§8.3 与 README。
2. 把项目从计划推进到可运行：三层内核（src/core 唯一相机装置/环境/注册表/地形/加载）、共享配置与布局（68 栋建筑、18 处院落、14 条连接、21 段道路、8 视角）、src/kit 构件库、六区实现（含庭院墙、铺地、绿化、道具、台基/台阶/城门隧道可行走面、金銮殿与寝殿内景）、交互与 UI（视角切换器、时辰/画质、建筑面板、小地图、导览、加载/错误态、第一人称提示）。
3. 调试过的问题（都已修复并回归）：屋顶法线方向导致屋面发黑、屋面高度缺失产生 NaN、相机缓动在无帧环境下不回位、截图管线竞态（改为页面内取 PNG + DOM 快照 + modulepreload）、院墙层组位移写错导致长墙叠置、桥梁/台阶可行走面步差超过 0.55m。
```
* **子 Agent 派发明细**：
  - `Kit A: 构件库与资产`（`ses_f22a25528ff...`，产出 `details.js`, `assets.js`, `kit-preview.html`）
  - `B 前朝区域实现`（`ses_f22914408ff...` 与重试会话 `ses_f2286ae0dff...`）
  - `G 交互与 UI 实现`（`ses_f2275b7c1ff...`）

---

### 2. OpenCode 版本二：`imperial-palace-opencode-424k`
* **工程路径**：`AI_Test/imperial-palace-opencode-424k/`
* **记录来源**：`opencode.db` 检索。
* **特点**：在 42.4 万 Tokens 的紧凑预算下，OpenCode 以极高的代码生成密度构建了**规模最大**的实体城郭体系。
* **交付指标**：
  - **110 栋独立有顶建筑**、24 个规整院落。
  - 182 段宫墙与夹道、54 处石台阶、9 座汉白玉金水桥、16 处水面、182 株松柳槐树。
  - 前朝完整轴线（午门 ➔ 奉天门 ➔ 礼仪大广场 ➔ 三层须弥座 ➔ 金銮殿 / 中和殿 / 保和殿）。
  - 后宫六组宫苑、御花园与堆秀山、四角角楼与四面城门。
  - 双可进入内景（金銮殿九龙宝座屏风 + 坤宁寝殿暖阁）。

---

### 3. Command Code 版本：`imperial-palace-commandcode-36m`
* **工程路径**：`AI_Test/imperial-palace-commandcode-36m/`
* **记录来源**：Command Code v1.66.0 控制台执行记录。
* **运行参数**：`deepseek-v4.1-flash with high effort · taste-1`，总耗时 36 分钟 32 秒，消耗 **35.9M Tokens**。

#### 核心执行流程与主 Agent 架构治理：
1. **Taste 学习与规范统领**：
   - 提取用户的工程品味偏好（Wants explicit permission before accessing outer paths）；
   - 在 `docs/TASK_BRIEF.md` 中为所有并行子 Agent 确立了统一的施工契约与坐标基准。
2. **两批次并发子 Agent 编排**：
   - **批次 1**：B 前朝（3,403k tokens）、C 后宫（3,920k tokens）、F 御花园与边界（2,616k tokens）并行。
   - **批次 2**：D 西宫苑（1,508k tokens）、E 东宫苑（1,565k tokens）、G 交互与 UI（906k tokens）并行。
3. **主 Agent 攻坚修复的 4 大核心根因 Bug**：
   - **单檐屋顶 NaN 缺陷**：`kit/index.js` 中 `hall()` 单檐分支调用 `roof({w, d})` 时漏传高度 `h`，导致所有单檐殿顶几何数据计算溢出为 NaN，主 Agent 彻底补齐。
   - **实例化网格变换丢失**：`kit/merge.js` 复制 `InstancedMesh` 时丢弃了父级世界矩阵变换，导致廊庑柱子、桥墩全部坍塌堆叠在世界原点 (0,0,0)，主 Agent 在合批逻辑中引入矩阵解算烘焙修复。
   - **内景全黑阻挡修复**：原生成逻辑将殿堂内部用实心暗色体块塞满，导致相机进入室内时全黑；主 Agent 改为“仅非 visitable 建筑填实”，让金銮宝座与天花藻井重见天日。
   - **内景相机距离越界校正**：修复了 `OrbitControls.minDistance=30` 强制将相机推到殿外的冲突。
4. **重构 CDP 无头截图管线**：
   - 使用 Node 内置 WebSocket 连接 Chrome DevTools Protocol，实时监听 `window.__PALACE__` 场景就绪状态，彻底杜绝无头抓拍在场景载入前截到空帧或白屏的问题。
5. **升级架构版本至 `v1.0`**，最终输出 74 栋建筑、18 处院落与 14 张全景多角度渲染快照。

---

### 4. DeepSeek Harness (DSH) 版本：`imperial-palace-dsh-1.1b`
* **工程路径**：`AI_Test/imperial-palace-dsh-1.1b/`
* **运行参数**：Deep-Agent 框架，消耗高达 **1,111,473,426 tokens（11.1 亿）**。
* **特点**：
  - 拥有 5 个版本中最庞大、严苛的测试与工程保障体系；
  - 建立了 23 组覆盖 Core、Kit、Zone、Interaction 的全量单元与集成测试（`tests/*.test.mjs`）；
  - 引入了完整的无头 Chrome 真实环境探针体系（`work/probe/`），对每一栋建筑的碰撞网格、行走步差（< 0.55m）、视锥剔除与内存指标进行了万级采样验证；
  - 配套完备的工程交接与证据链报告（`docs/reports/` 与 `docs/handoff-*.md`）。

---

### 5. ChatGPT (GPT-6 Luna) 版本：`imperial-palace-gpt6luna`
* **工程路径**：`AI_Test/imperial-palace-gpt6luna/`
* **驱动模型**：`GPT-6 Luna`（在独立 Codex 工作区环境中全自主执行）
* **开发策略**：
  - 针对计划进行重构，确立了**“每个子 Agent 开工前必须先阅读共享规范、共用建筑库与材质、提交开工回执”**的协作契约；
  - 划分为 5 大区域（前朝 `forecourt`、后廷 `inner-palace`、西苑 `west-courts`、东苑 `east-courts`、御花园及城墙 `garden-boundary`）；
  - 严谨编写 `scripts/check.mjs`，遍历所有网格顶点保证坐标有限性、建筑槽位唯一性与 11 处跨区连接点单向归属；
  - 引入现代化 Vite 8 打包流程与全景小地图导航。

#### 核心对话记录：
```text
[USER @ 02:11]:
修改一下这个 plan，把这个让其更适合分给多个子 agent 分工，并要求风格统一。
允许他们使用外部依赖和别人的模型，但是要一整个皇宫，具体结构类似参考图，最后单独开一个文件夹把这些放在单独的文件夹里面。

[ASSISTANT @ 02:21]:
已修改，并迁入独立 imperial-palace 文件夹，包含计划、参考图和 README。
- 改为参考图式的完整皇宫布局；
- 允许外部依赖、第三方模型和贴图；
- 按宫城区域分给子 agent，明确文件归属和接口；
- 每个 agent 开工前必读统一规范，共用建筑库与材质。

[USER @ 02:56]:
把你这个任务复制一份出来，我要让 gpt6luna 执行一下：单独开一个文件夹来做这个的一切。

[ASSISTANT (GPT-6 Luna) @ 02:57 - 04:13]:
- 完整宫城已整理在独立文件夹，整城登记了 88 栋建筑、20 座庭院和 11 个连接点。
- npm run check 与 npm run build 均全绿通过；
- 浏览器中检查了分区导航、导览、昼夜切换、建筑信息和小地图第一人称漫游 (F 键)。
```

---

### 6. Gemini 3.8 Flash 版本：`imperial gemini 3.8flash`
* **工程路径**：`AI_Test/imperial gemini 3.8flash/`（同名快捷软链接 `imperial/`、`imperial-gemini-3.8flash/`）
* **驱动模型**：`Gemini 3.8 Flash Autonomous Multi-Agent Team`（7 专职子 Agent 统辖协同）
* **工程特色**：
  - **交付达成率最高**：规制建筑达 **96 栋**（规划目标 ≥60，达成率 160%）；规整院落达 **23 处**（规划目标 ≥16，达成率 143%）；跨区连接 11 处全量契约对接；
  - **室内内景可进入殿宇最多（7 处）**：太和殿金銮宝座、乾清宫、坤宁宫东暖阁、养心殿正殿、三希堂、皇极殿、文渊阁黑瓦藏书阁；
  - **海拔严格分层**：三大殿坐落于 y = 4.5m 汉白玉台基之上，堆秀山顶御景亭拔高至 y = 13.5m 绝顶俯瞰，外城门门洞第一人称下物理真实可穿行；
  - **几何极度稳健**：全城网格 100% 顶点数值有限、零 NaN，自动化脚本 `check.mjs` 秒级静态断言全绿；生产构建产物 Gzip 仅 **216 KB**。

---

### 7. GPT-6 Luna 3D 导览交互沙盘：`imperial-palace/luna`
* **工程路径**：`AI_Test/imperial-palace/luna/`
* **工程特色**：
  - 聚焦中轴巡游与沉浸式沙盘交互，太和殿与乾清宫进入内景时屋顶支持优雅渐隐动画展示；
  - 提供金辉、落霞与寒月三时辰光影切换、全局小地图及相机定位。

---

### 8. GPT-6 Sol 几何合批优化版：`imperial-palace/sol`
* **工程路径**：`AI_Test/imperial-palace/sol/`
* **工程特色**：
  - **几何合批重构**：将全城 1372 块网格动态压缩合并为 20 组 116 个高效 Batch，Draw Call 锐减 91.5%；
  - 保证 88 栋建筑独立拾取与射线碰撞的同时，在低配显卡与移动端实现 60 FPS 流畅满帧，漫游连通与结构检查全绿。

---

## 三、 本地快速启动与对比指南

所有项目均支持本地静态服务器或开发服务器访问：

### 1. 启动命令（八个版本可同时在不同端口运行）

```bash
# 1. 启动 OpenCode 516k 版本 (端口 8121)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-opencode-516k"
python3 -m http.server 8121 --bind 127.0.0.1

# 2. 启动 OpenCode 424k 版本 (端口 8122)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-opencode-424k"
python3 -m http.server 8122 --bind 127.0.0.1

# 3. 启动 Command Code 36M 版本 (端口 8125)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-commandcode-36m"
python3 -m http.server 8125 --bind 127.0.0.1

# 4. 启动 DSH 1.11B 版本 (当前后台运行在端口 8123)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b"
python3 -m http.server 8123 --bind 127.0.0.1

# 5. 启动 GPT-6 Luna 版本 (端口 8126 或 Vite 开发服务器)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-gpt6luna"
python3 -m http.server 8126 --directory dist --bind 127.0.0.1

# 6. 启动 Gemini 3.8 Flash 版本 (端口 8127，支持 cd "imperial gemini 3.8flash" 或 cd imperial)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial gemini 3.8flash"
python3 -m http.server 8127 --directory dist --bind 127.0.0.1

# 7. 启动 GPT-6 Luna 导览沙盘版本 (端口 8128)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace/luna"
python3 -m http.server 8128 --directory dist --bind 127.0.0.1

# 8. 启动 GPT-6 Sol 静态合批版 (端口 8129)
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace/sol"
python3 -m http.server 8129 --directory dist --bind 127.0.0.1
```

### 2. URL 调试参数快捷对照

访问时在 URL 后面拼接参数可直接唤起特殊景别与调试信息：
* `?view=oblique`：45° 宏观经典鸟瞰
* `?view=axis`：正南中轴线贯穿视角
* `?view=fp`：第一人称御前漫游模式（`W/A/S/D` 移动，`Shift` 加速，`F` / `Esc` 退出）
* `?preset=golden`：盛世金辉（正午）
* `?preset=dusk`：落霞残阳（傍晚）
* `?preset=night`：寒月孤灯（夜景宫灯）
* `?stats=1`：开启右上角实时帧率（FPS）、Draw Call 与三角面数量统计

---

## 四、 Git 仓库规约与文件排除说明

4 个项目目录均已独立执行 `git init -b main` 并提交了 Initial Commit。统一配置了如下针对性的 [`.gitignore`](file:///Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b/.gitignore)：

* **严格排除**：
  - `dist/`（随手由 `scripts/build.mjs` 重新构建的输出产物）；
  - `work/`（完全排除了 DSH 运行时产生的 **211 MB** 无头 Chrome 缓存、WASM 引擎与 LevelDB 日志）；
  - `docs/shots/*.png` 与 `docs/screenshots/*.png`（自动化截图输出的巨量位图文件）；
  - `*.log`、`.DS_Store`、`node_modules/`。
* **严格保护**：
  - `public/vendor/three/`（本地内置的三方库，保障项目彻底脱离外部 CDN 离线运行）；
  - `assets/reference/`（规划原图）；
  - 核心源代码、测试套件与所有 Markdown 规范说明文档。
