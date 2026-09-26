# G3 体验 / G4 风格与性能 · 独立验收报告（t13 / V2）

> 验收人：`verifier`（只读交付代码；本轮写入 inScope：`tests/verify-experience.test.mjs`、`scripts/verify-walk.mjs`、`docs/report-experience.md`、`docs/shots-verify/**`、`docs/shots/**`）
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`（任务卡旧路径 `imperial-palace copy 3` 已被外部重命名，本轮全部命令在新路径执行）
> 版本：`CONFIG 1.0.6` · `LAYOUT 1.0.0` · `KIT 1.0.1` · three r169 · 质量档 `medium`
> **结论：G3 体验通过；G4 部分不通过** —— 风格/性能/合批全部通过，但 **§12 三时辰判据在 `oblique/night` 与 `zone/night` 上不通过**（内容暗区 **19.82% > 15%**，余量 **−4.82pp**，远超 ≤1pp 运行噪声底，已两次复现），且同图存在**口径分歧**（像素法 10.36% PASS）——按现行权威口径（t49 落屏天空带）判 **FAIL**，最小修法见 §9。

---

## 1. 命令与真实输出

| # | 命令（新 ROOT 下） | 退出码 | 真实输出（节选） |
| --- | --- | --- | --- |
| 1 | `node tests/verify-experience.test.mjs` | `1` | `检查项 28：PASS 27 / FAIL 1`；唯一 FAIL = `F1 … oblique/night 暗区19.82%>15%, zone/night 暗区19.82%>15%` |
| 2 | `node scripts/audit.mjs --enforce` | `0` | `主场景绘制调用 293/350 ✓ · B58/70 ✓ C49/50 ✓ D39/40 ✓ E40/40 ✓ F61/80 ✓ · 可见三角面 293841/1500000 ✓ · 结论：全部预算与契约检查通过` |
| 3 | `node tests/run.mjs` | 见 §1.1 | 全仓测试套件（含本卡新增 `verify-experience`） |
| 4 | `node scripts/verify-walk.mjs` | `0` | 第一人称走查全量 JSON（§4 全部数字来源） |
| 5 | `node scripts/shot.mjs --view=all --preset=all --keep-invalid` | `0` | `全部 24 张截图有效，输出目录 docs/shots`（1440×900 / DPR1 / medium） |
| 6 | `node scripts/shot.mjs --view=oblique,zone --preset=night --keep-invalid`（复现） | `0` | 两张均 `内容掩码[city] 均值 0.1896 · 暗区 19.82%（上限 15%）· 内容像素 12.3%` + `可读性判据 FAIL（全城内容暗区 19.82% > 15%）` |

### 1.1 run.mjs

`node tests/run.mjs` 输出见 `/tmp/t13-run.log`（本报告以其中摘要为准）：**新增的 `tests/verify-experience.test.mjs` 因 §9-F1 的真实 FAIL 而非零退出**，这是本次验收的预期结果（判据不通过不得被粉饰）。

## 2. 方法与口径（可复现性前提）

- **装配方式**：`buildZone(zoneId, {kit, registry})` × 5 区（真 kit，灰盒不参与）→ `registry.registerZone` → `createWalkSolver({registry})`；走查/性能数字均来自这一份装配，未读任何实现者的走查结论。
- **玩家体积与阈值**（登记值，实测使用）：半径 `0.35m` / 高 `1.8m` / 视高 `1.65m`；可跨台阶 `0.5m`、下台阶吸附 `0.6m`、可走坡 ≤`0.62`（tan）。**全程不使用 `camera.near` 作为碰撞替代**。
- **LOD 口径**：预算数字一律按 **激活 LOD 档** 统计（t28 口径），主视角列（`oblique`）与**近场列**（`--lod-reference-near=fp`，默认）双列并列（§5）。
- **暗区/过曝口径**：一律用 `scripts/shot.mjs` 的**当前权威实现**（t41 掩码修复 + t44 sky-only 像素法 + t48/t49 落屏天空带 + Δ 监控）；分类阈值 `俯瞰/环绕类(oblique/iso/orbit/zone) ≤15%`、`低空/近景类(focus/fp/interior/axis) ≤30%`、`高光截断 ≤5%`，整帧均值仅诊断。
- **运行噪声底**：t43 实证 ≤≈`1pp`（实时灯池 + flicker 相位）。本报告对每个擦线项给出"距阈值余量 vs 1pp"，**余量 ≤1pp 一律标注为不构成通过**。
- **截图纪律（环境前提）**：沿用 t12 做法——每次尝试全新 `--user-data-dir` + 失败重试 + 失败图保留 `*.invalid.png` 不删除。本轮矩阵确实出现过启动抖动（`WebGL 方案 [disable-gpu] 第 1/2 次未通过：浏览器被判超时终止` / `未观察到场景就绪标记`），重试后 24/24 有效；**移动/重命名期间可能出现纯白帧**是本机已知环境抖动（t12 已归因：同批 DOM 报告健康、新路径复跑即恢复），本轮未再出现。
- **环境**：Node v26.10.0 · `chrome-headless-shell` + SwiftShader（`--disable-gpu --enable-unsafe-swiftshader`）。**真实 GPU 帧率不可得**（软光栅无参考价值），§8 单列未验证。

## 3. 八视角逐项（G3-1）

| 检查 | 结论 | 证据 |
| --- | --- | --- |
| A1 八视角登记与编号 | 通过 | `oblique → iso → axis → zone → focus → interior → fp → orbit`（config 顺序 = 键盘 1–8 = `requests.VIEW_MODES`） |
| A2 iso 正交 / 其余透视 / 过渡 1.2s | 通过 | `specForMode('iso').projection === 'orthographic'`，其余 7 个 `perspective`；`CAMERA.transitionSeconds = 1.2` |
| A3 分区机位齐全 | 通过 | `zone 7`（city+B/C/D/E/F）、`fp-spawn 5`（每区 1）、`interior 2`（B/C 各 1） |
| A4 1–8 / F / Esc 同一请求通道 | 通过 | `Digit1..8 → view:request-mode`（模式逐一对齐）；`F → view:request-mode{mode:'fp'}`；`Esc` 在 FP 内按 §6.4 **只释放指针锁**（`local:'exitPointerLock'`，非模式请求），非 FP 且有选中时走 `selection:change` |
| A5 唯一 state / 唯一相机 | 通过 | 8 个模式请求逐一驱动 `state.viewMode` 同步一致；全仓相机实例化仅 `src/core/camera.js` 两处（透视 + 正交） |
| A6 进出第一人称恢复机位 | 通过 | `zone → fp → zone`；`position/target/fov/projection` 逐值恢复（差值 <1e-6；进入后实际移动到出生点 820.5m 外并转向） |

**浏览器侧八视角证据**：24 张 1440×900 全出图（§6 表），每张含视口、内容掩码、背景口径、余量；`interior` 内景两张（B/C）在三时辰均判 PASS。

## 4. 第一人称 §6.4 路线几何走查（G3-2/3）

装配后 `solver.stats().obstacles = 166`（core 派生墙 + 区域自报 + 基线，去重后）。

### 4.1 逐段结果（真实可行走图寻路，`cellSize=1`，841×1121 格 / 711,227 可走格）

| 段 | 路径长 | 受阻采样 | 最大上/下台阶 | 面高区间 |
| --- | --- | --- | --- | --- |
| 南桥北端 → 南城门内 | 36m | 0 | 0 / −0.03 | 0.4–0.8 |
| 南城门内 → 礼仪广场 | 146m | 0 | 0 / −0.01 | 0–0.4 |
| 礼仪广场 → 主殿丹陛前 | 111m | 0 | 0 / 0 | 0–0 |
| 主殿丹陛前 → 主殿台基顶 | 45m | 0 | **0.15** / 0 | 0–4.5 |
| 主殿台基顶 → 金銮殿内景 | 37m | 0 | 0 / 0 | 4.5–4.5 |
| 金銮殿内景 → 内廷门 | 586m | 1（阈值边界） | **0.5** / −0.6 | 0–4.5 |
| 内廷门 → 寝殿内景 | 71m | 0 | 0.17 / 0 | 0.9–2.4 |
| 寝殿内景 → 御花园 | 336m | 0 | 0 / −0.55 | 0.5–2.4 |

- **8 段全部可达**（`graph.path` 寻路成功），路径最大上台阶 **0.50m = 登记阈值 0.5m**（丹陛/台基按坡道插值，未超阈值）。
- 唯一 1 个受阻采样在 `金銮殿内景 → 内廷门` 的 `(12,−164)`，原因 `dropTooDeep`，落差 **0.60m = 登记 `snapDownDistance` 上限**（图判定 `≥−0.6` 允许，我的严格不等式把它标为边界样本）→ 属**阈值等值边界**，非缺陷；如实记录。
- **直线插值假象说明**：若把相邻路点直接连直线采样（不走图），`金銮殿内景 → 内廷门` 会切过主殿台基北缘（4.5m 落差，243/821 采样受阻）、`寝殿内景 → 御花园` 会穿过 `C-hall-bed-rear`（197/701 采样受阻）。这两处是**直线穿越建筑/台基**的必然结果，实际路线绕行（北阶/侧路），故以上表（图寻路）为准；两类数字都已在 `scripts/verify-walk.mjs` 输出中保留（`route` 段与 `paths` 段），不隐藏。

### 4.2 专项探针

| 项 | 结果 |
| --- | --- |
| 门洞净宽（18 处） | **18/18 合格**，最小 **11.3m**：城门 `F-gate-west/east 14m`、`F-gate-south/north 18m`（墙洞 26m，可行走廊道更窄）、院门 10 处 `11.3m/12m`、两主殿 `25.3m/26m` |
| 墙面阻挡 | **60/60 段**（宫墙 4 + 院墙 56）实体段探针均被阻挡（探针已按 `openings.at` 绝对坐标避开洞口） |
| 水面不可站立 | **8/8 水体**不可站：护城河 4 段 `stepTooHigh`（水面低于岸台）、水池 4 处 `OB-WB-*` 障碍（含 D 区水池与 `OB-E-court3-pavilion` 交叠）；**4/4 桥面可站**（`bridgeDeck`） |
| 包络越界保护 | 东/西/南/北四面越界（±425 / ±565）**全部被拒**（`envelope`），0 泄漏 |
| 抬高建筑不可从下方穿入（t27 语义） | `B-hall-main`（台基 4.5m）、`C-hall-bed-main`（台基 1.5m）从地坪高度探针均 `stepTooHigh` 拒绝；**城门/门殿门洞 6/6 在其真实地面高度可通行**（`F-gate-*` 4 + `B-gate-front` + `C-gate-inner`） |
| 东西宫苑经侧门 | 6 条侧门连接横断面**全可走**（19–23 采样全通过）；起点→五区 fp-spawn 图路径全部可达且 0 受阻：`B 151m · C 769m · D 323m · E 321m · F 1001m` |
| 全线连通 | 9 个走查路点 + 5 个 fp-spawn + 2 个内景 = **16 个关键点同属一个连通分量** |
| 不可进入建筑的可见提示 | 见 §9-F4（config 事件 + 接线静态证据；**未由 V2 目视复现**） |

## 5. 性能与合批（G4）

### 5.1 预算对照（激活 LOD 档；质量 medium；`node scripts/audit.mjs --enforce` exit 0）

| 口径 | 主视角列（oblique） | 近场列（`--lod-reference-near=fp`） | 预算 | 判定 |
| --- | --- | --- | --- | --- |
| 整城主场景调用 | **293** | — | ≤350 | ✓ |
| 可绘制对象（Node 装配，含环境） | 286 对象 | — | ≤350 | ✓ |
| B | 58 | 58 | 70 | ✓ |
| C | 49 | 49 | 50 | ✓ |
| D | 39 | 39 | 40 | ✓ |
| E | 40 | 40 | 40 | ✓ |
| F | 61 | 61 | 80 | ✓ |
| 可见三角面 | **293,841** | 近场列三角面 81,980 / 52,976 / 46,676 / 44,524 / 59,452（B/C/D/E/F） | ≤1,500,000 | ✓ |
| 单建筑 | 最大 **11,932**（B-hall-main，逐槽位工厂 near 档） | — | ≤24,000 | ✓ |

- **含阴影/后处理的整帧成本**（浏览器实测，1440×900 DPR1 medium）：**整帧调用 506**、可见三角面 **570,786**、主场景可绘制对象 286、几何 261 / 纹理 23、灯位锚点 70（实时池 0/6 night、0/4 dusk）、阴影投影对象 275 + **1 盏**主方向光（宫灯不投影）、Bloom 由预设/质量档决定。口径：**整帧 = 主场景 + 阴影 pass + 后处理**，与上表"主场景单次调用"不同口径，两者都记录。
- **audit 的 kit 级对照**（12 栋同规格殿宇）出现 `与单档逐值相等：✗`：这是**多相机距离聚合**（不同距离的殿宇激活不同 LOD 档）与"单档逐值"的预期差异（单栋时 ✓）；门槛判定一律以上表激活档口径为准，已 exit 0 通过。此处如实记录该诊断的 ✗ 语义，避免被误读为回归。

### 5.2 合批运行时核对（CONTRACTS §3.5 强制点）

| 区域 | 逐槽位工厂（before，near 单档） | 区域实际产出（after，激活档） | 倍数 | 非实例网格带 `userData.part` 标签 |
| --- | --- | --- | --- | --- |
| B | 220 | **58** | 3.8× | 52/52 |
| C | 221 | **49** | 4.5× | 49/49 |
| D | 242 | **39** | 6.2× | 33/33 |
| E | 257 | **40** | 6.4× | 37/37 |
| F | 269 | **61** | 4.4× | 50/50 |

- 5 个区域的实际产出**全部远小于**"逐槽位工厂直接摆"的批次，且**全部非实例网格都带部位桶标签**（`userData.part`）→ 与"各区调用一次 `kit.mergeZone(root)`"的声明**自洽**；与 audit 分区数字逐值一致（58/49/39/40/61）。F 区另有 11 个 `InstancedMesh`（树木/灯具实例化）不带 part 标签，属实例化正常形态（不参与合批，本身即 1 次调用）。
- 结论：**合批义务已被运行时核对通过**（非仅文档声明）。

## 6. 风格一致性与三时辰判据（G4）

### 6.1 Node 可验证的风格一致性

| 检查 | 结论 | 证据 |
| --- | --- | --- |
| E1 材质共享 | 通过 | 247 个网格材质**全部命中** `kit.materials` 同一份缓存（23 材质 / 6 贴图 @1024px） |
| E2 铺地/瓦垄/石作尺度 | 通过 | 全部由 config 模数推导：`roof 0.8696m`（=1/`roofTileRowsPerMeter`）、`paving 3.2`（=`bayPitch/2`）、`stone 1.6`（=`bayPitch/4`）、`wood/brick 3.2`、`plaster 6.4` |
| E3 院墙连续 | 通过 | 14 院 × 4 面 = **56 段院墙全部落在院界上**且 `wallIds` 一致 |
| E4 树木同一风格 | 通过 | `canopyShapes = roundedCone/domedSphere/layeredUmbral`、尺度 `5.5/9/13.5m`、低饱和 `0.34`、微风 `0.045rad`；D 区树木部件 `trunk+canopy` 均走共享材质 |
| E5 UI 字体与间距 | 通过 | `spacingScale [4,8,12,16,24,32]`、`radius 4px`、`transitionMs 180` / `cameraTransitionMs 1200`、标题字体含 `Songti SC / Noto Serif SC`；`styles.css` 的**间距类属性**取值全部落在阶梯内（其余 px 为面板/小地图等布局尺寸，已单列） |

### 6.2 三时辰 × 八视角判据（权威口径 = 落屏天空带；本轮 24/24 真实出图）

| 视角 | 时辰 | 内容暗区 | 上限 | **余量(pp)** | clip | 判定 | 内容占比 | 背景来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| oblique | golden | 2.17% | 15% | +12.83 | 0% | PASS | 30.0% | sky-flood |
| oblique | dusk | 1.87% | 15% | +13.13 | 0% | PASS | 30.1% | sky-flood |
| **oblique** | **night** | **19.82%** | 15% | **−4.82** | 0% | **FAIL** | 12.3% | sky-flood |
| iso | golden | 6.45% | 15% | +8.55 | 0% | PASS | 36.8% | sky-flood |
| iso | dusk | 3.79% | 15% | +11.21 | 0% | PASS | 36.9% | sky-flood |
| iso | night | 5.30% | 15% | +9.70 | 0% | PASS | 18.8% | sky-flood |
| axis | golden | 2.44% | 30% | +27.56 | 0% | PASS | 100%（无天空视角） | — |
| axis | dusk | 3.35% | 30% | +26.65 | 0% | PASS | 100%（无天空视角） | — |
| axis | night | 15.11% | 30% | +14.89 | 0% | PASS | 100%（无天空视角） | — |
| **zone** | **night** | **19.82%** | 15% | **−4.82** | 0% | **FAIL** | 12.3% | sky-flood |
| zone | golden / dusk | 2.17% / 1.87% | 15% | +12.83 / +13.13 | 0% | PASS | 30.0% / 30.1% | sky-flood |
| focus | golden / dusk / night | 4.60% / 6.36% / **25.26%** | 30% | +25.40 / +23.64 / **+4.74** | ≤0.03% | PASS | 71.5% / 71.6% / 69.9% | sky-flood |
| interior | golden / dusk / night | 3.96% / 0% / 0% | 30% | +26.04 / +30 / +30 | ≤2.91% | PASS | 100% | — |
| fp | golden / dusk / night | 0.79% / 0.76% / **5.95%** | 30% | +29.21 / +29.24 / **+24.05** | ≤0.23% | PASS | 100% / 61.0% / 56.3% | — / sky-flood / sky-flood |
| orbit | golden / dusk / night | 4.97% / 3.47% / **13.41%** | 15% | +10.03 / +11.53 / **+1.59** | ≤0.01% | PASS | 76.0% / 76.1% / 41.9% | sky-flood |

- **余量 <1pp 噪声底的擦线项：无**。最薄的 PASS 是 `orbit/night +1.59pp`（>1pp 噪声底，但属"薄余量"，按纪律只能算"通过但需留意"）；`focus/night +4.74pp` 可接受；`axis/night +14.89pp`（无天空视角正式口径）。
- **独立复现核对**（与主理人转述对比）：`fp/night 5.95%`（t49 值 5.95% ✓ 逐值一致）、`axis/night 15.11%`（t46 值 15.10%，差 0.01pp ✓）、`focus/night 25.26%`（t42 值 24.94%，差 0.32pp，在 ≤1pp 噪声内 ✓）、`orbit/night 13.41%`（t42 值 8.02%？差 5.4pp——该视角在 t42 未覆盖/后经 t44–t49 改为落屏带口径，故不可直接比较，以本轮为准）。
- **与主理人转述不一致的一项（按要求报我的实测而不择一）**：`oblique/zone night` 主理人转述 **11.68%**，我本轮实测 **19.82%**（两次复现，余量 −4.82pp ≫ 1pp 噪声底）。差异远大于噪声，不是抖动；见 §9-F1/F2 的口径分歧分析。

## 7. totalHeight 消费方核查

`src/**` 中 `totalHeight` 的全部出现按类分列（命令行 + 类别，均可在 `tests/verify-experience.test.mjs` D1 复算）：

| 类别 | 位置 | 说明 |
| --- | --- | --- |
| 定义/估值导出 | `src/shared/layout.js`、`src/kit/**` | 布局冻结值与 kit metrics（估值语义已在 CONTRACTS §4.1） |
| 字段回显/校验/排序 | `src/core/context.js`（字段白名单 + 回显）、`src/core/registry.js`（排序键） | 数据管线，不参与取景/面板 |
| 灰盒体块高度 | `src/core/greybox.js`、`src/zones/_greybox.js` | §4.1 明确允许"障碍盒高度初值/粗估"，且属灰盒非成品 |
| **已标注的退化回退** | `src/core/camera.js`（`buildingWorldBounds`/`focusSpecFor`）、`src/interaction/catalog.js`（`worldBounds`） | **主路径一律优先 `userData.kit.worldBounds`（实测）**；仅当无实测包围盒时回退到估值并显式标注 `source:'layout.bounds（估值）'/'layout估算'` |

实测断言：① 传入 kit 实测包围盒时 `buildingWorldBounds().maxY = 33.3`（不是 `totalHeight` 20）；② 无实测时回退对象带"估值"标注；③ `focusSpecFor` 按实测高度 40m 计算取景（`target.y = 18`）。
**结论：没有取景/信息面板/验收脚本把 `layout.totalHeight` 当权威高度** —— 与 §4.1 要求一致。

## 8. 未验证 / 不确定项

| 项 | 状态 | 原因 |
| --- | --- | --- |
| 真实 GPU 帧率 / p95 帧耗时 / 显存 | **未验证** | 环境只有 SwiftShader 软光栅（`avgFps` 无参考价值）；需真实 GPU 机器（t13 契约允许标注） |
| "不可进入建筑有可见提示"的**可见性** | **未由 V2 独立复现** | 需要真实受信输入触发提示；本轮只验证了 config 事件（`interaction:blocked-building`）与接线（`src/interaction/**` 引用）静态一致；团队侧由 t9 的 CDP 15/15 覆盖（我不转述为我的结论） |
| 像素级目视判读（屋顶同色同光泽、拼接感、院墙接缝观感） | **未验证** | 24 张图已产出并保留在 `docs/shots/`（`t2-<view>-<preset>.png`）与 `docs/shots-verify/`（我的统计副本），但"观感"需人眼判读 |
| 移动/重命名期间纯白帧 | 已知环境抖动 | 本轮矩阵未再出现；保留重试与 `*.invalid.png` 纪律 |

## 9. 未通过项与最小修法（findings）

### F1（blocker，G4 §12 判据不通过）：`oblique/night` 与 `zone/night` 内容暗区 19.82% > 15%
- **实测**：`docs/shots/t2-oblique-night.png` 与 `t2-zone-night.png`（均 1440×900、182.7KB、同机位）`内容掩码[city] 均值 0.1896 · 暗区 19.82%（上限 15%）· 内容像素 12.3%`；`可读性判据 FAIL（全城内容暗区 19.82% > 15%）`。复现命令：`node scripts/shot.mjs --view=oblique,zone --preset=night --keep-invalid`（已跑两次，逐值一致）。
- **余量**：**−4.82pp**，远超 ≤1pp 运行噪声底 ⇒ **不是抖动，不能判通过**。
- **最小修法（二选一，均不得改阈值/分类）**：
  1. 若按现行权威口径认定"内容真的更暗"：修**夜景户外光照**（`src/core/environment.js` + `CONFIG.moonlitNight` 的 ambient/hemi/城市灯，或给中轴广场补一组不投影的暖色点光/发光材质），复测至 ≤15% 且余量 >1pp；**不得**通过提高曝光去洗亮天空。
  2. 若认定口径有误（见 F2）：先修口径（把"真天空"与"雾洗白"分开），再按统一口径重测全部 24 格。

### F2（high，与 F1 同源的口径分歧）：同一张 night 城景图三种口径给出相反结论
- 同一 `t2-oblique-night.png`：**权威落屏天空带** 87.65% → 内容 12.3% → **暗区 19.82% FAIL**；**t44 像素法（sky-flood）** → 内容 27.7% → **暗区 10.36% PASS**；**整帧诊断** → 暗区 2.88% PASS。
- 分歧像素 = 被 band 判为天空、被像素法判为内容的那 15.4pp 地平线过渡带。**关键证据**：落屏天空带的下端色 `#1b2333` 与 `CONFIG.LIGHTING.presets.moonlitNight` 的**雾色 `#1b2333` 完全相同**（见 t49 回执与本轮 `Δ 监控` 输出），而 t44 明确定过"**雾洗白几何属内容、不得当背景**"。因此现行 band 掩码在地平线处**必然**把雾色像素算作背景 —— 与 t44 的语义规则冲突。
- **最小修法**（口径问题，owner：foundation-lead + 主理人裁定）：用渲染侧"真天空"信号做掩码而非颜色带（例如 `?stats=1` 追加一层**天空 pass/深度掩码**或 `scene.background` 的可见性标记，t45/t48 已把渲染侧上报打通），或把 band 的上限收紧到不含雾色端点的区间；修好后重测 §6.2 全表。**不得**用 `--allow-no-sky` 静默退回整帧，也**不得**改 15%/30%/5% 阈值与视角分类。

### F3（low，口径说明，非缺陷）：audit 的 kit 级 12 栋诊断 `与单档逐值相等：✗`
- 该行比较多相机距离下**聚合激活档**与"单档逐值"，12 栋时不同殿宇激活不同档属预期差异（单栋时 ✓）；预算门槛以上表激活档口径为准（全部 ✓、exit 0）。建议在 audit 输出里把该行标注为"聚合诊断（非门槛）"，避免后续被误读为回归。

### F4（low，证据边界）：不可进入建筑的"可见提示"未由 V2 目视复现
- 本轮验证到：`CONFIG.EVENTS.blockedByBuilding = 'interaction:blocked-building'` 存在、`src/interaction/**` 已接线、单测（t9 的 `interaction.test.mjs`）覆盖事件路径。**可见性**（真实按键触发后 UI 出现提示）需 CDP 受信输入，属 t9 的 CDP 证据范围；本报告**不把它算作我的通过项**，建议在 G5 目视走查时一并确认。

## 10. 纪律与交付物

- 本轮只写入 inScope：`tests/verify-experience.test.mjs`（新增）、`scripts/verify-walk.mjs`（新增）、`docs/report-experience.md`（本文件）、`docs/shots-verify/`（我的统计副本）、`docs/shots/`（按主理人修订后的 inScope，`shot.mjs` 矩阵默认输出，24 张 + manifest 刷新）。**未触碰** `src/**`、`public/**`、`index.html`、`main.js`、`docs/handoffs/`、`docs/CONTRACTS.md`、`docs/STYLE_GUIDE.md` 及其他 `imperial-palace-*` 目录。
- 复跑：`node tests/verify-experience.test.mjs`（Node 侧 G3/G4 全量，读 `docs/shots/manifest.json` 判 F 段）、`node scripts/verify-walk.mjs`（走查明细）、`node scripts/shot.mjs --view=all --preset=all --keep-invalid`（矩阵）。

---

## 11. attempt 2 复验（post-fix 口径 + 在飞集成变更）

> 本 attempt 期间交付树发生了三次外部变更：`scripts/shot.mjs`（14:12，**口径改为渲染侧真天空掩码**）、
> `src/core/environment.js`（12:25）、`src/shared/layout.js`（14:40，**LAYOUT 1.0.0 → 1.1.4**：43 个 interior 机位、
> 43 栋 visitable、112 个可行走面，新增 `kind:'passage'`）。以下结论严格按"改动发生时刻"标注归属与适用范围。

### 11.1 attempt 1 的 F1/F2（night 城景 §12）—— **已解决，本轮独立复现**

- 同一批 `night` 城景图（`oblique` / `zone`）在**新口径**下：`内容掩码[city] 均值 0.154 · 暗区 10.36%（上限 15%）· 内容像素 27.7%` + `可读性判据 PASS`（zone 10.35%）。
- **余量 +4.64pp / +4.65pp**（> 1pp 噪声底）⇒ 通过；与 attempt 1 的 19.82%（余量 −4.82pp）对比，差值 9.5pp，属**口径修复**而非抖动。
- 修复机制（我逐字读出的新输出）：`✅ 真天空掩码（唯一依据，同 dump 取图）：skyMaskShareByColor：白 0.69964 / 黑 0.30036，skyShare=0.69914 ⇒ 天空=白｜唯一色 2、纯度 100.00%` ——
  渲染侧给出**二值真天空掩码**（2 个唯一色、纯度 100%），掩码只排除真天空、**雾洗白区域仍算内容**（内容占比 27.7%），这正是 F2 指出的"天空 vs 雾同色"问题的结构性解法（不再依赖颜色近似）。
- 全 24 格（含新口径下的其余组合）本轮**无余量 ≤1pp 的擦线 PASS**（最薄为 oblique/night +4.64pp）。

### 11.2 本轮 24 格矩阵：23/24 出新图，第 24 格被在飞改动阻断

- `node scripts/shot.mjs --view=all --preset=all --keep-invalid`（14:2x–15:0x）：**22 张成功**，第 23 张 `orbit/dusk` 起全部退化为空白（~7.9KB，判 `PNG 体积仅 7907B < 下限 20000B`），重试 4 种 GL 方案 + 单独重跑 3 次均复现。
- 根因（浏览器日志逐字）：`[palace] 装配完成：区域 [] · 注册建筑 0 栋 · 视角 61 个` +
  `colliders.walkable[25] (WK-F-gate-east-door-passage).kind 非法：passage（合法：ground/terrace/interior/bridgeDeck/gardenGround/outerTerrain）`（同类 4 条：`WK-F-gate-east/garden-hall-west/garden-hall-east/garden-hall-north-door-passage`）
  ⇒ **F 区（乃至全部真实区域）契约校验失败 → 0 区域装载 → 全屏只有背景**。

### 11.3 本轮 Node 侧检查结果（`node tests/verify-experience.test.mjs`：28 项 23 PASS / 5 FAIL）

| 检查 | attempt 2 结果 | 归属与说明 |
| --- | --- | --- |
| A1/A2/A4/A5/A6 | 通过 | 八视角编号/iso 正交/1.2s/同请求通道/唯一相机/FP 恢复机位 —— 与 attempt 1 一致 |
| **A3** | **FAIL** | "B 缺 interior"：布局现有 **43 个 interior** 机位（B 10 个、C 9 个），与 CONTRACTS §5.2「B/C 各额外 1 个」不符 → 属**契约-布局语义变更**，需 t20 同步或回退 |
| **B1 / B10** | **FAIL** | 12 段不可达；20 个新 interior/门内点不在主连通分量 —— 直接由 §11.2 的"0 区域装载"与新增 passage/内景面未连通导致 |
| B2–B9（门洞/墙/水/包络/t27/侧门） | 通过 | 走查探针结果与 attempt 1 逐值一致（在 14:40 变更前测得，见 `docs/shots-verify/walk-audit-attempt2.txt`） |
| C1–C4（预算/合批/单栋） | 通过 | `node scripts/audit.mjs --enforce` exit 0；293/350、B58/C49/D39/E40/F61、三角面 293,841/1.5M |
| **D1** | **FAIL** | **真实违规**：`src/ui/index.js:378 if (d.totalHeight) sizeParts.push(\`脊高约 ${d.totalHeight} m\`)` + `src/interaction/catalog.js:205 totalHeight: building.totalHeight ?? null` —— 信息面板把 layout **估值**（与 kit 举架中位差 26.7%、最大 38.6%）当权威高度展示 ⇒ 违反验收第 8 条 |
| E1–E5（风格/UI 令牌） | 通过 | 与 attempt 1 一致 |
| **F1** | **FAIL** | 24 格中 `orbit/dusk`、`orbit/night` 为**残缺/错配判定**（0% 暗区）、`fp/golden` 触发**掩码防护**（内容占比 0.01%）—— 全部由 §11.2 的"0 区域装载 + 旧图被新掩码重判"造成，非 §12 真实回归（§11.1 已给出新口径下 night 城景 PASS 的实测） |
| F2（余量 vs 噪声底） | 通过（信息） | 23 格余量明细见 `docs/shots-verify/attempt2-matrix-table.md`；无擦线 PASS |

### 11.4 attempt 2 的未通过项（最小修法）

- **F5（blocker，外部在飞，owner：14:40 改 layout 的 foundation-lead + core-engineer）**：`src/shared/layout.js`（LAYOUT 1.1.4）新增 43 个 `kind:'passage'` 可行走面，而 `src/core/context.js:71` 的 `WALKABLE_KINDS` 白名单未同步 ⇒ **区域契约校验失败、0 区域装载、所有截图空白**。最小修法：`WALKABLE_KINDS` 增补 `'passage'`（并同步 CONTRACTS §6.1 的 kind 列表），或 layout 改用既有 kind。修好后我可用一条命令重出 24 格。
- **F6（high，契约-布局语义，owner：t1/t20 + 相关区域）**：43 个 interior 机位 / 43 栋 visitable / 112 个可行走面相对 CONTRACTS §5.2 与 §6.1 是**破坏性变更**；内景面连通性（20 点不在主分量）与 A3 断言均随之失败。最小修法：t20 递增 CONTRACTS 并同步风格指南；各区域补齐新增内景的可行走面与门内通道连通；否则回退布局。
- **F7（medium，真实违规，owner：ui-engineer）**：见 §11.3 D1 —— 信息面板 `脊高约 X m` 用 layout 估值。最小修法：`catalog.js` 改传实测高度（`userData.kit.worldBounds.maxY − minY`，或 kit metrics 的 `totalHeightAbsolute`）并在面板标注"实测"；`ui/index.js` 不得直接消费 `building.totalHeight`。
- **F1 的 3 格**：待 F5/F6 修好后重跑矩阵即可消除（我判断为口径/装载问题的连带表现，非 §12 真实回归；若重跑后仍 FAIL，我会按新证据改判）。

### 11.5 attempt 2 结论

- **G3 体验**：attempt 1 的全部结论仍成立（八视角行为、走查几何、碰撞语义、越界、t27 语义、内景可进入）；但 **14:40 的布局变更尚未集成完成**，A3/B1/B10 因此失败 → **G3 暂判不通过**（等 F5/F6 收口后复测）。
- **G4 风格与性能**：**性能/合批/风格 Node 项全过**（audit --enforce exit 0；合批运行时核对一致；材质/尺度/院墙/树木/UI 令牌一致）；**§12 三时辰**中 attempt 1 的 night 城景 FAIL **已由 post-fix 口径解决**（10.36%/10.35%，余量 +4.6pp）—— 但矩阵第 24 格被 F5 阻断，且 **D1 发现信息面板误用估值高度（F7，真实违规）** → **G4 判不通过**（F5 阻断 + F7 违规）。
- 我未改动 `src/**`、`public/**`、`index.html`、`main.js`、`docs/handoffs/`、`docs/reports/`、`CONTRACTS.md`、`STYLE_GUIDE.md`；本轮新增的 inScope 证据：`docs/shots-verify/{experience-test-attempt2.txt, walk-audit-attempt2.txt, audit-enforce-attempt2.txt, manifest-attempt2.json, matrix-attempt2.log, attempt2-matrix-table.md}`。

### 11.6 全仓测试套件状态（15:0x，在飞迁移中）

`node tests/run.mjs` → **exit 1，通过 7 / 20**（其中 `tests/kit.test.mjs` 843/843、`layout.test.mjs`、`core-audit`、`core-registry`、`core-camera`、`core-stats`、`shot-mask` PASS）。13 个红项全部可归到 14:40 的 `LAYOUT 1.1.4` 迁移尚未集成完成（不是本卡新增的判据问题）：

| 典型红项 | 逐字证据 | 归属 |
| --- | --- | --- |
| core-collision | `基线组装：41 条 y0 下钳到足迹地坪…应有 ≥40 条被下钳（实际 15）` | 布局碰撞基准随 1.1.4 变化，core 测试未同步 |
| core-interior | `内景体积由 layout 内景可行走面派生…应有 2 个内景体积（实际 5）：期望 2，实际 5` | 布局新增多内景（43 个），core 内景体积派生策略未同步 |
| zones / zone-* | `B 契约 发现 10 个问题` / `模板区域 E 契约 发现 9 个问题` | 区域契约校验拒绝了新增 `kind:'passage'` 可行走面等 |
| interaction | 高台基"从下方穿入"与求解器期望 `OB-F-garden-hall-north 应给出阻挡原因` | 布局新增面/盒与求解器期望未同步 |
| verify-completeness | 与 t12 同批（本次未重跑；其红项亦来自同一迁移） | 同一迁移 |

**结论**：本卡（G3/G4）的判据在 14:12 的"真天空掩码"版本上已验证到位（§11.1–§11.3）；14:40 之后的迁移把整棵树带到"大面积红"，属**外部在飞迁移**，需其 owner 完成 core/zones/UI 同步后才能给出最终 G4 判定。我不把这段状态算作 G3/G4 的实现回归，但也不会在它未收口时宣布通过。
