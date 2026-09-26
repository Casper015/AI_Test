# 主 Agent 回执（主 Agent / 集成）

## 开工回执
- 任务 ID / Agent：MAIN（主 Agent 统筹）
- 已读计划、风格与接口版本：`imperial-palace-plan.md`（含 6.4 多角度模式）、STYLE_GUIDE v0.9、CONTRACTS v0.9、config/layout v0.9
- 可写文件 / 只读依赖：`index.html`、`src/main.js`、`src/core/**`、`src/shared/**`、`scripts/**`、`tests/**`、`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`、`README.md`、`docs/handoffs/MAIN.md`；其余文件只读（A 拥有 `src/kit/**` 与资源登记）
- 区域边界 / 连接 ID / 使用的建筑 kit 与材质：全城包络 `X ∈ [-300,300]`、`Z ∈ [-450,450]`；`layout.CONNECTORS` 14 条；`layout.SLOTS` 68 栋、`layout.COURTYARDS` 18 处、`layout.ROADS` 21 段、`layout.PONDS` 4 处、`layout.TREES` 6 区
- 要消费和返回的接口：区域契约 `createZone/createGarden`（CONTRACTS §4）；相机装置（§5）；注册表（§6）；事件（§8）
- 验收方式 / 性能预算：`node tests/*.test.mjs` + `node scripts/shot.mjs`（DOM 快照校验）；预算 `≤350 主场景调用 / ≤150 万三角面`，实测记录见下
- 依赖齐备情况 / 发现的冲突：无

## 交付回执
- 文件：
  - 入口与内核：`index.html`、`src/main.js`、`src/core/{renderer,environment,state,registry,camera,terrain,loader}.js`
  - 共享层：`src/shared/{config,layout,rng,events}.js`
  - 区域：`src/zones/_builder.js`（通用区域/城门/花园构建器）、`forecourt.js`、`inner-palace.js`、`west-courts.js`、`east-courts.js`、`garden-boundary.js`（导出 `createZone` + `createGarden`）、`_greybox.js`（兜底）
  - 交互与 UI（主 Agent 接手实现）：`src/ui/index.js`、`src/interaction/index.js`
  - 工具与测试：`scripts/{serve.sh,build.mjs,shot.mjs}`、`tests/{layout,kit,zones,fp-route,kit-a.extra}.test.mjs`
- 接口：全部按 CONTRACTS v0.9；`createZone` 返回 `{ root, buildings, connectors, colliders:{obstacles,surfaces}, viewpoints, lightAnchors, update, dispose }`
- 基线版本：`STYLE_VERSION v0.9`（A 细化后仍为 v0.9，未破坏签名）
- 实测数据：
  - 场景构成（`tests/_budget` 一次性统计，Node 侧）：合并网格 106 个 + 实例化网格 283 个 ≈ **389 次主场景绘制**；三角面 **197,385**（≤150 万预算内）；建筑 68、机位 15、灯位锚点 101
  - headless SwiftShader 单帧实测（`?ui=1&stats=1`）：`calls 416（含阴影通道）、tris 260,018`（含阴影与重复统计）
  - 区域三角面：forecourt 39.5k / inner 23.2k / west 39.8k / east 39.6k / garden 32.1k / boundary 23.2k；主殿 3.8k（A 细化后实测 4.8k）
  - 预算说明：主场景调用估算 389 略高于计划初始目标 350，超出部分为实例化树/石灯与合并不经济的零散道具；可用 `?q=medium/low` 降档或后续按区域 LOD 优化，已记入已知问题
- 检查步骤与结果：
  1. `node tests/layout.test.mjs` → 通过：建筑 68 栋、院落 18 处、连接 14 个、视角 8 种
  2. `node tests/kit.test.mjs` → 通过：6 类建筑 + 廊/墙/桥/内景/树/水/铺地，主殿 3777 三角面
  3. `node tests/zones.test.mjs` → 通过：6 区实测（非灰盒），机位 zone 6 / interior 2 / fp-spawn 7，灯位 101
  4. `node tests/fp-route.test.mjs` → 通过：15 个路点连通（南桥 → 城门隧道 → 广场 → 三层台基 → 金銮殿内景 → 内廷门 → 寝殿内景 → 御花园）
  5. `node scripts/shot.mjs oblique golden docs/shots/ui-check.png "ui=1"` → 页面无错误，DOM 中含全部 UI 文案（全城鸟瞰/等距沙盘/第一人称/盛世金辉/中轴导览/画质/小地图 canvas）
  6. `node scripts/build.mjs` → dist 构建通过（相对路径、无绝对路径、关键文件存在）
  7. `node scripts/shot.mjs` 视角基线（1440×900，DPR 1，ui=0）：`view-oblique-{golden,dusk,night}.png`、`view-iso-golden.png`、`view-axis-golden.png`、`view-zone-mainhall.png`、`view-interior-mainhall.png`、`view-fp-south.png`、`view-focus-mainhall.png` 全部产出（62KB–906KB），同目录 `.dom.html` 无页面错误
  8. 修复记录：`makeWallRun` 曾把多段墙体的位移设到外层层组，导致院墙叠置成一长条（整城鸟瞰可见异常长墙）；已改为逐段定位，重出全部视角截图
- 已知问题：
  - 主场景调用 416 略高于初始预算 350；可通过 `q=medium/low`、减少灯位锚点或关闭部分小建筑阴影压到预算内（未做，留待整城收口）
  - `scripts/shot.mjs` 的整页 PNG（含 UI）抓帧在 headless 下不稳定，仅作 best-effort；权威校验用同目录 `.dom.html`
  - 区域模块由主 Agent 接手实现（B/C/D/E/F 子 Agent 两次返回空结果），因此各区域风格细节未按原计划由独立 Agent 精修
- 未验证项：
  - 真实 GPU 下的帧率、P95 帧耗时与真机手感（headless SwiftShader 数据不代表实机）
  - 夕照/夜景的观感仅经 DOM/统计校验，未做人眼比对
  - 子 Agent A 交付的 kit 预览页 `kit-preview.html` 未通过 `scripts/shot.mjs` 截图（脚本固定 index.html）
