# t2 · 第一人称操控：A/D 反号、空格跳跃、F 再按退出（复现 → 最小修复 → 常驻断言）

> 卡：`t2 [fp-controls] — FP：修 A/D 反向 + 空格跳跃 + F 再按退出`（attempt 1 · ui-engineer）
> 范围：`src/interaction/keymap.js`、`src/interaction/index.js`、`src/interaction/walk-solver.js`、`src/core/camera.js`（第一人称移动/碰撞内核所在文件）、
> `src/shared/config.js`（`INTERACTION.jump` 开关与本卡新增字段）、`tests/fp-controls.test.mjs`、`scripts/probe-fp-controls.mjs`、
> `docs/CONTRACTS.md`（§5.4 / §6.3 同步）、`docs/reports/t2-fp-controls-*.json`。
> 纪律：**先证后改**（先出原始读数）· 判据只增不减 · 口径三要素 · 预算与既有阈值逐值未动。

---

## 0. 结论（一句话）

| 项 | 修前（真实浏览器读数） | 修后 |
| --- | --- | --- |
| **A/D 方向** | `D` 位移点乘相机 right = **−5.2 m**（往左）、`A` = **+5.2 m**（往右）——**反号** | `D` = **+5.2 m**、`A` = **−5.2 m**（各自沿 right 正/反方向） |
| **空格** | 起导览、切到 `axis` 视角、相机 y 从 1.65 飞到 520（**Δy 518 m**） | 原地跳跃：顶点 **0.86 m**（≤1.0m 硬上限）、落地 y 逐值 `= 面高 + 1.65`、不触发导览 |
| **第一人称中再按 F（有选中）** | `fp → interior`（被判成"进入内景"，**按不出退出**） | `fp → oblique`（退出第一人称，恢复进入前机位） |

---

## 1. 口径三要素与复现（先证后改）

- **环境**：headless Chrome `chrome-headless-shell 1243`（`--disable-gpu` ⇒ SwiftShader WebGL2），视口 1440×900，dpr=1，`?view=oblique&quality=medium`。
- **协议**：`scripts/probe-fp-controls.mjs` —— 冻结页面 rAF 后由 `stepFrame(dt)` **复刻 `main.js` 的 `frameStep` 调用序列**（zones → rig → environment → render → recordFrame），`dt = 1/60`；
  按键由真实 `KeyboardEvent('keydown'/'keyup', { code })` 走**生产键盘层**（G 的 capture 层与 core 的 window 层都在），不直接改内部状态。
- **判据**：位移方向用**与相机 right/forward 向量的点乘**（不是"看起来对不对"）；跳跃用"顶点 / 逐值落地 / 逐帧障碍穿透 / HUD 帧数"四个可复算量。

复现读数（修前，`docs/reports/t2-fp-controls-before.json`）：

```
[read]  viewMode=fp  pos=(-30.00, 1.650, -360.00)  yaw=26.565°
        right=(-0.8944, +0.4472)  forward=(+0.4472, +0.8944)  面高=0  期望眼高=1.65（逐值一致 ✓）
[ad]    D：位移 5.2m  点乘 right = -5.2        ← 应为 +
        A：位移 5.2m  点乘 right = +5.2        ← 应为 −
        W：点乘 forward = +5.2 ✓   S：-5.2 ✓
[space] 导览 false→true；viewMode=fp→axis；Δy 顶点 518.35m（相机飞走）
[f]     fp → axis      （无选中：已能退出）
[fsel]  fp → interior  （有选中 B-hall-main：**进内景**，退不出第一人称）
```

---

## 2. 缺陷一：A/D 反号（`src/core/camera.js::updateFp`）

**机理**：three 右手系下，相机局部 +X（right）与视线 `f = (sin yaw, 0, cos yaw)` 的关系是
`right = -(up × f) = (-cos yaw, 0, sin yaw)`。旧实现

```js
let dirX = sin * forward + cos * strafe;   // strafe 项 = +cos
let dirZ = cos * forward - sin * strafe;   // strafe 项 = -sin  ⇒ 恰为 -right
```

`strafe = +1`（D / →）时移动方向是 `-right`，即**向左**，与实测 `D 点乘 right = −5.2` 完全一致。

**最小修复**（只改两个符号）：

```js
let dirX = sin * forward - cos * strafe;
let dirZ = cos * forward + sin * strafe;
```

前后分量与左右分量仍然正交（测试断言 `|dotForward(D)| < 1e-6`、`|dotRight(W)| < 1e-6`），W/S 语义未变（点乘 forward 仍 ±5.2）。

---

## 3. 缺陷二/新功能：空格跳跃（唯一内核 `src/core/camera.js`）

**修前**：`Space` 在键位表里只有"导览"一种语义 ⇒ 第一人称里按空格会**起导览并把视角切到 `axis`**（实测 Δy 518m）。

**实现**（`jump()` + `integrateJump()`，键位/交互层只做分发，不另建物理）：

| 卡面要求 | 实现 | 真机读数 |
| --- | --- | --- |
| 顶点 ≤1.0m | `h = clamp(INTERACTION.jump.maxHeight=0.9, ≤1.0)`；逐帧积分后**钳到 `起跳眼高 + h`**（双保险：即使配置被改成 3m 也 ≤1.0m） | 顶点 **0.8587 m** |
| 空中水平碰撞仍生效、不越墙 | 飞行中的水平位移仍调用**同一个** `solver.step(..., { airborne: true })`：包络 `clampToEnvelope`、障碍体块（含门洞）、可行走面存在、**子步进防隧穿**全部保留；`airborne` 只跳过"步行上/下台阶"两条阈值（飞行中脚底本就在地面上方，套用会被 `dropTooDeep` 全面拒绝） | 6 轮边跑边跳 240 帧：**进入障碍 0 帧** |
| 落地须可站立，否则回起跳点 | 下落穿过落脚面时按**唯一谓词层** `obstacleBlocksPoint`（落地脚高）重判一次，并检查落差 `≤ step.snapDownDistance`；不满足 ⇒ 位置**逐值**回到起跳点并记 `reverted` | ④a 落差 0.45m（收紧阈值）⇒ `notStandable:dropTooDeep`；④b 落点被低矮体块占据 ⇒ `notStandable:blockedAtFeet`；对照（无障碍）⇒ `ground` |
| 落地 y 逐值 = surfaceY + fpEyeHeight | 落地直接写 `floorYAt(x,z) + fpEyeHeight` 并同步 `smooth.y`（否则台阶平滑会把逐值关系变成插值） | 落地 y=**1.650000**，期望 1.65，**逐值差 0** |
| 不触发卡死 HUD | 跳跃是合法暂态：`noteStuckTick(..., { airborne })` 在滞空期间**清零计时**并如实标注 `source:'airborne-exempt'`；落地后"有意图 + 无位移"照常计时（判据不放宽） | 连续起跳 4s：卡死 HUD 出现 **0 帧**；单测：地面 1.5s 判卡死 ✓、空中 2s 恒 0 ✓ |

其它既有语义：**空中禁止再跳**（`reason:'airborne'`）、起跳冷却 `0.12s`（`reason:'cooldown'`）、退出/进入第一人称会清空滞空状态、滞空期间脚下若突然没有可行走面则立刻回起跳点（防守，不会无限悬停）。

**开关（唯一来源）**：沿用既有 `config.INTERACTION.jump`（补齐 `maxHeight/cooldownSeconds`，`enabled: false → true`），`rig.jump()` 在 `enabled === false` 时返回 `{ok:false, reason:'disabled'}`（单测覆盖）。

---

## 4. 缺陷三：F 再按一次退不出第一人称（`src/interaction/keymap.js` + `index.js`）

两处叠加：

1. **键位优先级**：`resolveKey('KeyF')` 旧顺序是「内景 → **有选中（进内景）** → 第一人称」。因此在第一人称里若恰好选中了可进入的建筑，按 F 被判成"进入该建筑内景"（实测 `fp → interior`）。
   修复：把 **`fpActive` 提到最高优先级** → `{kind:'view', label:'退出第一人称', request: view:request-mode {mode:'fp'}}`。
2. **协作路径重判**：事件 target 就是 window（合成事件）时，本层与 core 是**同一节点**的两个监听器、按注册顺序触发，`stopPropagation()` 拦不住同节点监听器 ⇒ core 先按 F 把第一人称切走，本层**再用已被改过的状态**解析一次，于是"有选中 ⇒ 进内景"。
   修复：识别"core 本轮已处理过该键"（`coreAlreadyRequested(view:request-mode)` **且** `fp.recentExit(50ms)`）后跳过本层分支。
   > 细节：不能用 `recentExit(ms,'toggle')` 过滤 —— `store.patch()` 会**同步**触发相机装置的 state 同步分支（`exitFp({reason:'state-change'})`），它先于 state 层显式那句 `reason:'toggle'` 完成退出，事件里登记的 reason 是 `state-change`（真机读数 `lastFpToggleReason.reason`）。

真实键盘（target=body）路径两条都无需协作分支：本层 capture 先跑并 `stopPropagation()`，core 收不到该事件。

---

## 5. 键位文案同步（与实现同源）

- `keymap.helpKeyList()`：`Space` 行 → ``第一人称：跳跃（顶点 ≤${CONFIG.INTERACTION.jump.maxHeight}m，落点须可站立）｜其他视角：开始 / 退出中轴导览``（数值取自 config，不写死）；`F` 行 → "第一人称中：再按一次即「退出第一人称」（优先于选中）…"；触屏说明同步加"空格跳跃"。
- `docs/CONTRACTS.md`：§5.4 移动/跳跃/F 优先级三条更新；§6.3 把"跳跃：**禁用**"改为 **启用 + 三条结构性约束**（顶点硬上限 / 空中水平碰撞 / 落地须可站立），并写明"原『避免掉出宫城』的隐患由结构性约束消除，而不是靠关闭功能"。

---

## 6. 常驻断言（判据只增不减）

`tests/fp-controls.test.mjs`（纯逻辑，Node 内真实 rig + 真实 layout + 真实求解器，**无需浏览器**）9/9：

| # | 断言 | 关键点 |
| --- | --- | --- |
| ① | A/D/W/S 位移与 right/forward 点乘符号 + 正交性 | 修前必红（D 为负） |
| ② | 跳跃顶点 ≤ `INTERACTION.jump.maxHeight` 且 ≤1.0m；落地 y **逐值**；`starts/landings/reverts` | 逐值用 `assertEqual`（非近似） |
| ②b | `enabled=false` ⇒ 拒绝起跳（`reason:'disabled'`）且不滞空；`maxHeight=3` ⇒ 实测仍 ≤1.0m | 开关与硬上限 |
| ③ | 4 轮"边跑边跳"：逐帧不进入任何障碍体块；空中再跳被拒；冷却拒绝；成功起跳计数逐值 | 用真实 `obstacleBlocksPoint` 判 |
| ④ | 非可站立落点 ⇒ 回起跳点：**④a** 真实台阶边（`WK-B-side-west-south-transition-1` 0.45m ⇒ `WK-B-plaza` 0m，收紧 `snapDownDistance` 复现 `dropTooDeep`）；**④b** 合成低矮体块盖住落点复现 `blockedAtFeet`，并给"撤掉体块 ⇒ 正常落地"的对照 | 两条机制各自可复现，逐值回退 |
| ⑤ | F 优先级：`fpActive` 最高（即使有选中且可进入）；内景/选中/默认分支不回退 | 修前必红 |
| ⑥ | Space 分流（FP=jump / 其它=tour）+ `KEY_KINDS` 含 jump + 文案同源 | |
| ⑦ | 接线守卫（源码级）：A/D 修复在位、`function jump(` 唯一、1.0m 钳制、`airborne:true` 求解、卡死豁免、协作路径 F 去重 | 防止被静默改回 |
| ⑦b | 卡死计时空中豁免的功能验证 + 落地后仍能判卡死（1.52s） | 判据不放宽 |

真机判据（`scripts/probe-fp-controls.mjs`）：

```bash
node scripts/probe-fp-controls.mjs --phases=read,ad,space,jump,jumpwall,jumpstuck,f,fsel --frames=60 \
  "--expect=adD:>=5.0,adA:<=-5.0,adW:>=5.0,adS:<=-5.0,spaceTourAfter:==0,apex:>=0.5,apex:<=1.0,\
jumpStarts:==1,jumpLandings:==1,jumpReverts:==0,landingIsGround:==1,landingDelta:==0,\
jumpInside:==0,jumpWallInside:==0,stuckHudFrames:==0,fExit:==1,fSelExit:==1,fSelNotInterior:==1"
```

> 判据演化（记录一次"差点伪绿"）：最初的跳跃判据只有 `landingDelta==0`，而**回退到起跳点**也满足它（起跳点本来就是 `面高+1.65`）。
> 是测试与探针先暴露出"原地跳也被判回退"（谓词双重否定缺陷），随后才把判据收紧为
> `landings==1 / reverts==0 / landingIsGround==1` 并补上 `dropTooDeep`、`blockedAtFeet` 两条例路与对照。**现在 0 不再可能是"回退造成的 0"。**

另：修前真机读数（`docs/reports/t2-fp-controls-before.json`）与修后读数（`docs/reports/t2-fp-controls-after.json`）都在盘，可逐值对照；
HUD「操作提示」面板的键位文案取证见 `docs/shots-t2-fp-controls/help-panel.png`（含 F/空格/触屏三条新文案）。

### 6.1 全量回归与**并行发现**（如实登记，非本卡引入）

| 测试 | 结果 |
| --- | --- |
| `tests/fp-controls.test.mjs`（本卡新增） | **9 / 9 通过** |
| `tests/interaction.test.mjs` | **70 / 70 通过**（修 B8 静态扫描被我注释里的 `store.patch(` 字面量误命中，已改注释措辞，测试本身未放宽） |
| `tests/core-camera`、`core-collision`、`core`、`kit`、`layout` | 全通过（camera.js / walk-solver.js / config.js 改动无回归） |
| `scripts/audit.mjs --enforce` | **exit 0**（未动任何预算/阈值） |
| `tests/core-stats.test.mjs` | ✗ **并行发现（非本卡）**：该用例把 `src/main.js::compactReport()` 截取 4000 字符窗口后要求字段出现在窗口内；工作树中 `backgroundCandidates` 现位于**第 4022 字符**（另一成员在制改动给 compactReport 增加了行），恰好越窗 ⇒ 断言落空。本卡未改 `src/main.js` 的任何背景字段。 |
| `tests/verify-experience.test.mjs` | ✗ 既存红（24 张 8 视角×3 时辰暗区判据），与第一人称操控无关。 |

---

## 7. 变更清单

| 文件 | 变更 |
| --- | --- |
| `src/core/camera.js` | A/D 符号修复；跳跃内核（`jump`/`integrateJump`/滞空状态机/落地判定/回退/冷却/无面回退）；求解器新增 `airborne` 模式（默认路径逐字未变，返回 `surfaceY` 供落地判定）；`describe().fpJump` 读数；`Space` 在 core 键盘层的同一入口；`rig.jump()`/`rig.isAirborne` |
| `src/interaction/keymap.js` | F 优先级（第一人称最高）；Space 第一人称=跳跃；`KEY_KINDS` 增 `jump`；帮助文案与触屏说明同步（数值取 config） |
| `src/interaction/index.js` | 本地动作 `jump` → `rig.jump()`；卡死计时如实接收 `airborne`；协作路径 F 去重（`coreHandledFpToggle`）；新增诊断读数 `lastKeySeen/lastKeyEffective/lastKeyCooperative` 与 `jumps` 等计数 |
| `src/interaction/walk-solver.js` | `noteStuckTick(..., { airborne })` 空中豁免（`source:'airborne-exempt'`，落地照常计时） |
| `src/shared/config.js` | `INTERACTION.jump`：`enabled: true`、新增 `maxHeight: 0.9`、`cooldownSeconds: 0.12`（保留 `velocity/gravity` 原字段，`gravity` 取绝对值使用） |
| `docs/CONTRACTS.md` | §5.4 移动/跳跃/F 优先级；§6.3 跳跃开关语义（禁用 → 启用 + 三条结构性约束） |
| `tests/layout.test.mjs` | 同轮登记：`碰撞/台阶/跳跃规则齐全` 由「`jump.enabled === false`」改为「启用 + `maxHeight ∈ (0,1.0]` + 重力非零 + 冷却 >0」（原 3 项保留，判据只增不减）；`CONFIG 版本` pin 同步 |
| `src/shared/config.js` | `CONFIG_VERSION 1.0.7 → 1.0.8`（config 变更登记纪律） |
| `tests/fp-controls.test.mjs` | 新增 9 组常驻断言 |
| `scripts/probe-fp-controls.mjs` | 新增真机读数探针（`--phases/--expect` 全部可复跑） |

**跨域说明（如实登记）**：第一人称移动/碰撞内核与 `INTERACTION.jump` 位于 `src/core/camera.js`、`src/shared/config.js`（core / foundation 域）。本卡要求"新增空格跳跃 + 空中水平碰撞仍生效 + 落地须可站立"，这些约束只能在**唯一内核**上实现（在 `src/interaction/` 里再造一套垂直运动必然绕开 core 的求解器，违反"不实现第二套相机/物理"的既有约定）。改动为此已全部登记，且默认（非 airborne）路径逐字未变；core-engineer 若正在改同一文件请以本回执的 hunk 为准合并。

---

## 8. 复跑命令

```bash
node tests/fp-controls.test.mjs                        # 9/9（无需浏览器）
node scripts/probe-fp-controls.mjs --phases=read,ad    # 方向读数（原始读数在 stdout / JSON）
node scripts/probe-fp-controls.mjs --phases=space,jump,jumpwall,jumpstuck --frames=60
node scripts/probe-fp-controls.mjs --phases=f,fsel     # F 退出（无选中 / 有选中）
node scripts/audit.mjs --enforce                       # 预算与契约（本卡未动任何阈值/预算）
```
