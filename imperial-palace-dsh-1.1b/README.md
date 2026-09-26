# 紫禁天朝 · 完整皇宫 3D 项目

可俯瞰、可游览、可进入内景的完整皇宫 3D 交互项目（Three.js）。当前状态：**工程骨架与全队共享契约已冻结，区域与核心实现进行中**。

- 实施计划：[imperial-palace-plan.md](imperial-palace-plan.md)（§2.3 边界、§3.1 风格、§5 各区、§6 接口、§7.1 分工、§8 验收）
- 风格基线：[docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md)（`STYLE_BASELINE v1.0.0`）
- 接口契约：[docs/CONTRACTS.md](docs/CONTRACTS.md)（`CONTRACTS v1.0.1`：版本对应表、`createZone(ctx)` 契约、数据格式、文件归属表）
- 任务回执模板：[docs/handoffs/TEMPLATE.md](docs/handoffs/TEMPLATE.md)
- 用户布局参考图：[assets/reference/palace-layout.png](assets/reference/palace-layout.png)

**当前版本对应（下游按此开发，不匹配即旧产物）**：
`CONTRACTS v1.0.1` ⇄ `CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ three r169。
完整对照表与修订记录见 [docs/CONTRACTS.md](docs/CONTRACTS.md) 头部（`CONFIG 1.0.1` 为 `GRADES[2].roofTypes` 增补 `pyramidal` 的最小修订，布局数值零改动）。

## 1. 当前状态（实测，2026-09-26）

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 目录骨架 | ✅ 完成 | 见 §3 |
| 共享配置 `src/shared/config.js` | ✅ 冻结 `CONFIG_VERSION 1.0.1` | §3.1 全部风格参数 + §8.2 全部预算项；`tests/layout.test.mjs` 逐值断言。`1.0.1` = `GRADES[2].roofTypes` 增补 `pyramidal`（`GRADES[3]` 仍仅 `doubleEaveHip`），布局数值零改动 |
| 全城布局注册表 `src/shared/layout.js` | ✅ 冻结 `LAYOUT_VERSION 1.0.0` | 建筑槽位 **67**（B12/C12/D14/E15/F14）、院落 **14**（前朝3/后宫3/西4/东4）、连接 **32**、道路 **95** 段、墙 **60** 段、可行走面 **28**、障碍 **81**、视角 **20**、导览点 **10**、走查点 **9** |
| 入口 `index.html` + 启动壳 | ✅ 完成（`#app` + 加载层 + import map + 模块入口，全相对路径） | 截图 `work/shots/t1-shell-loading.png`（1440×900） |
| 本地服务 `scripts/serve.sh` | ✅ 实测可用 | `curl` 200：`index.html` / `config.js` / `three.module.js` / `OrbitControls.js` / `base.css` |
| 构建 `scripts/build.mjs` | ✅ 实测可用（产出 `dist/`，0 绝对路径，关键文件齐全） | `node scripts/build.mjs` → `dist` 32 个文件 / 1.66MB（2026-09-26 03:59 快照；随 `src/` 并行落地增长） |
| 测试入口 `tests/run.mjs` | ✅ 实测可用（顺序执行、失败即非零退出） | `node tests/run.mjs` → `PASS tests/layout.test.mjs (80ms)`，通过 1 / 1 |
| 共享契约机器校验 `tests/layout.test.mjs` | ✅ **1462 项**全绿（含等级-屋顶白名单守卫） | `node tests/layout.test.mjs` |
| three r169 + addons | ✅ 本地 vendored，经 import map 解析成功 | 浏览器探针：`three REVISION=169 / OrbitControls=function / PROBE_OK` |
| `src/main.js`（t2）、`src/core/`、`src/kit/`、`src/zones/`、`src/ui/`、`src/interaction/` | ⏳ 待实现（归属 t2/t3/t6/t7/t8/t9/t10/t11） | `dist` 构建会提示"暂缺入口 src/main.js"（告警，非错误） |
| 3D 场景、八视角、第一人称、整城性能实测 | ⏳ 未开始 | 未验证 |

**已知限制（如实说明）**：本机系统 Chrome 的 headless 模式在受限沙箱内会因 GPU/用户目录失败；
截图请用 Playwright 缓存的 `chrome-headless-shell`（`work/shot.mjs` 会自动优先寻找它）。

## 2. 快速开始（命令均已实测）

```bash
# 工作目录（路径含空格，必须加引号）
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3"

# 1) 启动本地静态服务（零依赖，使用系统 python3，默认 127.0.0.1:8123）
bash scripts/serve.sh            # 或： npm run serve
#   浏览器打开 http://127.0.0.1:8123/

# 2) 顺序跑全部测试，任一失败即非零退出
node tests/run.mjs               # 或： npm run test
node tests/layout.test.mjs       # 只跑共享契约机器校验

# 3) 构建发布包（复制 index.html/src/public → dist/，校验无绝对路径与关键文件）
node scripts/build.mjs           # 或： npm run build
SERVE_DIR=dist bash scripts/serve.sh 9000    # 预览 dist

# 4) 截图（需先起服务；自动寻找可用 headless 浏览器）
node work/shot.mjs http://127.0.0.1:8123/ work/shots/check.png
```

实测输出摘录（2026-09-26 03:59 实跑，原样粘贴）：

```text
$ node tests/layout.test.mjs
layout.test.mjs：通过 1462 项，失败 0 项
 - 槽位 67（B12/C12/D14/E15/F14）
 - 院落 14（前朝3/后宫3/西4/东4）
 - 连接 32，道路 95 段，墙 60 段，可行走面 28，障碍 81
 - 视角 20，导览点 10，走查点 9，config 1.0.1/v1.0.0
全部通过 ✓                                    # exit 0

$ node tests/run.mjs
▶ tests/layout.test.mjs
layout.test.mjs：通过 1462 项，失败 0 项
◀ tests/layout.test.mjs → PASS (80ms)
 通过 1 / 1，失败 0，总耗时 80ms               # exit 0

$ node scripts/build.mjs
  copy index.html → dist/index.html
  ok   importmap three → ./public/vendor/three/three.module.js
  ✓ dist 就绪：32 个文件 / 1.66MB；绝对路径 0；关键文件齐全
  warn  dist 暂缺入口 src/main.js（归属 t2 core-engineer / t14 集成）
```

> 断言数 1462 = 布局/config/启动壳断言 + t15 新增的 67 条逐槽位「等级-屋顶白名单」守卫 + 4 条汇总守卫 + 2 条版本 pin
> （`CONFIG 版本 = 1.0.1`、`LAYOUT 版本 = 1.0.0`）。`dist` 文件数在 `src/**` 并行落地期间会持续增长，
> 断言数固定但耗时随机器负载浮动（80–90ms 量级），两者都以自己实跑的输出为准。

**依赖前提**：零 npm 依赖（不执行 `npm install`），唯一运行时依赖是本地 `public/vendor/three`（three **r169**），
**不需要任何网络资源**。Node ≥20（实测 v26.10.0），Python 3 仅用于静态服务（实测 3.14.7）。

## 3. 目录结构

```text
imperial-palace copy 3/
├── imperial-palace-plan.md      # 总计划（只读）
├── README.md                    # 本文件
├── index.html                   # #app + 加载层 + import map + ./src/main.js（t1）
├── package.json                 # type=module，零依赖，serve/build/test/shot（t1）
├── docs/
│   ├── STYLE_GUIDE.md           # 风格基线 v1.0.0、比例/材质、6+2 验收视角（t1）
│   ├── CONTRACTS.md             # createZone 契约、数据格式、事件、文件归属（t1）
│   └── handoffs/                # TEMPLATE.md + 各任务回执（本人写本人）
├── assets/reference/palace-layout.png
├── public/
│   ├── vendor/three/            # three r169 + addons（只读，不得修改）
│   └── assets/{models,textures,environments,fonts}/   # 运行时资源（t3）
├── src/
│   ├── main.js                  # 组装与唯一动画循环（t2，待实现）
│   ├── core/                    # 渲染/加载/状态/环境/唯一相机装置（t2）
│   ├── shared/                  # config.js、layout.js、base.css（t1，已冻结）
│   ├── kit/                     # 构件工厂、材质、资产缓存、LOD（t3）
│   ├── zones/                   # forecourt(B)/inner-palace(C)/west-courts(D)/east-courts(E)/garden-boundary(F)
│   ├── interaction/             # 控制、选中、导览、碰撞（t9）
│   └── ui/                      # HUD、标签、信息面板、小地图（t9）
├── scripts/serve.sh, scripts/build.mjs     # t1
├── tests/run.mjs, tests/layout.test.mjs    # t1
├── work/                        # 中间产物与工具，**不进入发布包**（shot.mjs、校验脚本、截图）
└── dist/                        # 构建产物（全部相对路径）
```

## 4. 冻结的共享数值（下游只能从这里取值）

- 包络：宫墙内 `X∈[-300,300]`、`Z∈[-450,450]`；中央区 `X∈[-100,100]`；前朝 `Z∈[-400,80]`；后宫 `Z∈[80,300]`；花园 `Z∈[300,420]`。
- 区域：`B` 前朝（12 槽位）、`C` 后宫（12）、`D` 西宫苑（14）、`E` 东宫苑（15）、`F` 花园与边界（14：4 角楼 + 4 城门 + 6 花园建筑）。
  仅 `F` 的墙/角楼/城门可向包络外突出 `18m`（墙厚 8 + 角楼半宽 10）。
- 主殿台基三层总高 `4.5m`；其余标高分区各自取值（后宫 0.9、侧院 0.4、花园 0.5、桥面 0.8、河面 -3.0）。
- 色板：`#dfa112` 琉璃金 / `#962822` 宫红 / `#f0ece1` 暖白石 / `#1c4e40` 青绿彩画 / `#575652` 铺地 / `#1a1917` 金砖 / `#ffc83b` 鎏金。
- UI：间距 `4/8/12/16/24/32`、圆角 `4px`、镜头过渡 `1.2s`、UI 过渡 `180ms`、统一种子 `20240926`。
- 预算：参考视口 `1440×900 DPR1`、60/30 FPS、主场景 ≤350 绘制调用（B70/C50/D40/E40/F80 + 保留 70）、
  可见三角 ≤150 万、纹理 1K–2K、首屏 ≤25MB、单主方向光投影。
- 屋顶等级白名单（`CONFIG 1.0.1`）：每个槽位的 `roofType` 必须同时是 `config.ROOF_TYPES` 的合法键且属于
  `config.GRADES[grade].roofTypes`——grade 1：`gableHip/gable/pyramidal`；grade 2：`doubleEaveHip/hip/gableHip/pyramidal`；
  grade 3：仅 `doubleEaveHip`。该约束由 `tests/layout.test.mjs` 逐槽位 + 汇总守卫机器拦截。
- **高度语义（重要）**：`layout` 的 `eaveHeight` / `totalHeight` 是**估值，非硬约束**；实际几何以 kit 举架公式 +
  `config` 令牌为准（kit 不需回显，两侧差 10%–40% 属预期）。**相机取景、focus 机位自适应距离、信息面板与验收脚本
  不得把 `layout.totalHeight` 当作权威高度，必须使用实测场景包围盒**（`Box3.setFromObject` 或 kit 的实测 `bounds3`）。
  完整说明见 [docs/CONTRACTS.md §4.1](docs/CONTRACTS.md)「`eaveHeight` / `totalHeight` 的语义（估值，非硬约束）」。
- 可进入内景仅两处：`B-hall-main`（金銮殿）、`C-hall-bed-main`（寝殿）；其余建筑登记为障碍物。

## 5. 文件归属（唯一负责人）

完整表见 [docs/CONTRACTS.md §2](docs/CONTRACTS.md)。要点：`index.html`、`src/shared/**`、`docs/CONTRACTS.md`、`docs/STYLE_GUIDE.md`、`tests/*`、`scripts/*`、`README.md` 归 t1；
`src/main.js` + `src/core/**` 归 t2；`src/kit/**` + `public/assets/**` 归 t3；`src/zones/*.js` 归 t6/t7/t8/t10/t11；`src/interaction/**` + `src/ui/**` 归 t9。
改他人文件前先报告主理人。

## 6. 纪律

1. 不执行 `npm install`，不新增在线必需资源；`public/vendor/**` 只读。
2. 所有产物只写在本目录内；同级 `imperial-palace*/` 与 `AI_Test` 其他目录零改动。
3. 提交前跑 `node tests/run.mjs` 与 `node scripts/build.mjs`，未验证项写"未验证"。
