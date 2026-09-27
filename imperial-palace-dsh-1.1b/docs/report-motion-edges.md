# t40 · 第一人称**移动中**「建筑边缘异常」：移动协议取证 + 分类修复

任务：`t40`（work）· 执行者：core-engineer（attempt 3 · attempt_id `4355016c-1948-40d2-94b5-7ca59613c6a1`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
探针：`scripts/probe-motion-edges.mjs`（新增）· 守卫：`tests/core-antialias.test.mjs` ⑤ t40①–④（新增）
读数：`/tmp/t40-motion-final.json` · `docs/report-motion-edges/`（本卡自建报告目录，未覆盖 `docs/shots/**`）

---

## 0. 结论（先读这段）

| 类 | 读数（真实浏览器 · 环境冻结 ⇒ 逐帧差 = **纯移动效应**） | 判定 |
| --- | --- | --- |
| **对照：静止 + 环境冻结** | 不稳定像素 **0**（32 帧 0 变化） | 渲染**逐位确定** ⇒ 各臂的变化都归因于**相机运动** |
| **对照：静止 + 环境照常** | 39,352（时间动画：粒子/云/灯） | 时间动画基线（与移动无关） |
| **(a) 时间性边缘爬行** | 亚像素协议（0.64 px/帧旋转、0.87 cm/帧直行）：不稳定像素 6.5 万 / 14.4 万，其中**超局部斜坡的"硬台阶"仅 0.7% / 0.6%**；全速协议 4.7%–7.3% | **存在但量级小**；MSAA-2（空间 AA）已在起作用，剩余部分=**无时间 AA** 的固有走样 |
| **(b) Z-fighting** | 全部 9 臂：**可见几何共面双命中 = 0** | **未复现**（早期 2 处经查是**射线假象**：three 的 `Raycaster` 不看 `visible`，被 `setZoneVisible(false)` 藏起来的 greybox 地面仍被命中、深度差 0 ⇒ 已在探针里按可见性链过滤） |
| **(c) 近平面裁切/穿模** | 顶墙臂（60 帧推进 5.1 m）：**背景洞 0**；相机到最近几何 **3.19 m**（全程 ≥3.19 m），`near = 0.5 m` **从未贴近** | **未复现**；但见 §5 风险项（`near(0.5) == player.radius(0.5)`，靠"碰撞盒比可见几何更外扩"掩盖） |
| **(d) 阴影边缘闪** | 关阴影消融（同一相机运动、同一帧数）：主场景绘制调用 **605 → 315**；逐帧变化 **294,854 → 109,842（−63%）**（旋转臂 166,396 → 111,624，−33%） | **变化的**最大单一来源是阴影 pass（PCF 边缘随视点爬行 + 阴影贴图重投影）；其中"完全随阴影消失"的部分即 (d) |
| **【必查】t25 烟柱 LOD 跳变** | 把相机走到门限（点径 1.0 px）附近**往复行走 96 帧**：**修前（t25 单门限）逐柱 visible 翻转 = 1**；**修后（滞回）= 0**；同协议 Node 侧 40 帧 = **39 → 0** | **有跳变 ⇒ 已加滞回**（本卡落地） |

**一句话**：移动中"画面一直在变"的绝大部分是**合法图像运动**（剪影 + 阴影边界）；真正的**不稳定签名**（超局部斜坡硬台阶、A→B→C 翻面、共面翻面、近平面洞、LOD 跳变）里，只有 **t25 的 LOD 单门限跳变**能在本卡范围内修掉 —— **已修**（零新增绘制调用）。剩下的时间性走样只能靠 **TAA/FXAA 后处理 pass**（+1 绘制调用）⇒ 按卡面「后处理 pass 若必须新增 ⇒ 先量化并交回主裁定」**交回**（§5）。

---

## 1. 移动协议（口径三要素）

```
① 驱动：页面 rAF 冻结后由 __MOTION__.stepFrame(1/60) 逐帧复刻 main.js 的 frameStep
        （区域 update → rig.update → environment.update → render → recordFrame）
② 输入：**真实键盘事件路径** `window.dispatchEvent(new KeyboardEvent('keydown',{code}))`
        → interaction 键盘层 → core 相机装置 keys 集合 → updateFp()（不是直接改相机）
        旋转走生产输入入口 rig.applyInput('rotate',{dx})（0.5°/帧；亚像素协议 0.03°/帧）
③ 判据：相邻帧逐像素差（阈值 **0** = 任何位差都算）；分类见 §2；`--emu-prefix=1` = 运行时复现 t25 单门限规则做同轨迹对照
```

臂集合（每臂 ≥32 帧，烟柱臂 96 帧）：`static-frozen`（渲染确定性对照）· `static-live`（时间动画基线）·
`w-frozen` / `a-frozen` / `d-frozen` / `rot-frozen`（真速移动）· `rot-crawl` / `w-crawl`（**亚像素**移动）·
`wall-frozen`（顶墙）· `w-frozen-shadowoff` / `rot-frozen-shadowoff`（阴影消融）· `lod-live`（烟柱门限往复）。
**环境冻结**（`__FREEZE_ENV__`）是本协议的关键：相机照走、时间轴停住 ⇒ 逐帧差里只剩"移动"这一项。

## 2. 四类判定口径（都从帧数据现算）

| 类 | 口径 |
| --- | --- |
| (a) 边缘爬行 | 不稳定像素按帧 A 处梯度分档：`≥60` = 边缘型；**硬台阶** = 单帧变化幅度 > 局部灰度梯度×3×0.9+18（越过局部斜坡能允许的量）；**翻面** = A→B→C 中 C 回到 A（≤6）而 B 偏离 ≥30 |
| (b) Z-fighting | 对最不稳定像素做 2 次命中射线，**深度差 < 0.02 m** 记一处（并按可见性链过滤，只认在画的物体） |
| (c) 近平面 | 贴墙帧对（最近几何 ≤1.5 m）里"墙面像素变成背景色"的像素数 + 逐帧相机到最近几何距离（5×5 射线） |
| (d) 阴影 | 同运动、同帧数下 `castShadow=false` 的消融差（绘制调用数同步读） |

## 3. 【必查项】t25 烟柱 LOD 在移动中的跳变 —— 实测有、已加滞回

**修前（t25 单门限）**：把相机走到点径 ≈1.0 px 处（产品口径 `bandMetres.hideBeyondMetres = 495 m`，
由生产 `describe().smoke` 读数反解、闭环钉到 0.9982±0.0004），再按 W/S **往复行走**（每 12 帧换向）：

| | 同一条轨迹上的逐柱 visible 翻转 |
| --- | --- |
| **修前**（`--emu-prefix=1` 运行时复现 t25 单门限；不改产品代码） | **1**（96 帧；Node 侧同协议 40 帧 = **39**，见 §6） |
| **修后**（滞回，本卡落地） | **0**（96 帧逐帧读生产 `points.visible`） |

> 单条轨迹上"1 vs 0"看着小，是因为往复摆幅只有 ±0.004 px；**Node 守卫**把同一协议（0.98↔1.05 px 交替 40 帧）
> 跑成确定性读数：**39 → 0**（`tests/core-antialias.test.mjs` t40③），并同时断言"旧单门限复算必 ≥8 次"⇒ 断言不假绿。

## 4. 修复（**零新增绘制调用**）

| 文件:行 | 改动 |
| --- | --- |
| `src/shared/config.js:490-503` | 新增 `LIGHTING.atmosphere.smokeShowPointPx = 1.25`（滞回**上门限**；含机制/距离带/预算不动的理由注释）。等效距离带 = **495 m（隐藏）… 396 m（显示）** |
| `src/shared/config.js:13` | `CONFIG_VERSION '1.0.9' → '1.0.10'`（写明理由；`tests/layout.test.mjs:92` 只查"格式 + 不得回退 ≥1.0.8"⇒ **无需同步 pin**） |
| `src/core/environment.js:1137-1170` | 烟柱 LOD 改为**滞回**：`px < min(1.0)` ⇒ 隐藏；`px ≥ show(1.25)` ⇒ 显示；**带内保持上一帧状态**（用 `points.visible` 自身作状态位，不引入新结构）。`show` 未登记或 ≤`min` ⇒ 退化为 t25 单门限（配置缺失不制造新不稳定）。**粒子数/预算/材质规格/相位公式逐字未动** |
| `src/core/environment.js:611-625` + `describe().smoke` | 新增**权威读数**：`smoke.{enabled,minPointPx,showPointPx,bandMetres,systems[{index,anchor,visible,pointPx}]}`（`pointPx` 用生产同一式；`visible` 就是生产帧写进 `points.visible` 的值，不是复算） |

**不新增绘制调用**：只改 `points.visible` 布尔 ⇒ 主场景绘制调用读数不变（探针同臂 `renderer.info.render.calls` 前后同为 605@960×540；
权威口径 `node scripts/audit.mjs --enforce` **exit 0**，主场景 342/350、F 区 80/80 未动）。
**§12 阈值（15%/30%/5%）与台阶阈值（0.5/0.6）一字未动**（守卫 t40④ 逐值断言）。

## 5. 量化证明与**交回裁定**项

**平坦区对照（证明不是整体模糊）**：本卡**没有引入任何后处理/模糊**（只改可见性）⇒
`static-frozen` 臂 32 帧**逐像素变化 = 0**（0 与修复前同值）；`describe().smoke` 的 `bandMetres.drawH` 前后一致；
近景 20 m 点径 24.75 px ⇒ `visible=true`（守卫 t40④）。**平坦区逐值不变**成立（"逐值"= 静止且环境冻结时逐像素 0 差异）。

**交回裁定（卡面明令不得擅自加）**：(a) 的残余时间性走样，工程上只有两条路 ——
| 方案 | 收益（可预期） | 代价 | 
| --- | --- | --- |
| **FXAA/SMAA 后处理 pass** | 只能**空间**平滑，对"移动中的边缘爬行"改善有限（与 MSAA-2 同类） | **+1 全屏绘制调用**（342→343/350；F 区零余量不受影响，但仍是新增 pass）⇒ 卡面要求**先交回** |
| **TAA**（jitter + 历史缓冲） | 对时间性爬行**唯一有效**（可达 −60…−90%）；需速度缓冲/历史拒绝⇒ 有鬼影风险 | 新增 pass + 全屏 MRT/history RT（显存 + 绘制调用 + 与现有 Bloom/OutputPass 链的兼容） |
⇒ 本卡**不擅自加**，把量化读数与代价交回主理人裁定。若裁定"不加"，当前状态（MSAA-2 + 本卡滞回）即最优可行解。

**其他交回项（跨域，file:line 定点）**：
1. `src/shared/config.js:504` `CAMERA.near = 0.5` **恰等于** `INTERACTION.player.radius = 0.5`：本卡顶墙臂实测"最近几何 3.19 m"，说明当前靠**碰撞盒比可见几何更外扩**掩盖了这个零余量设计；一旦某处可见几何与碰撞盒齐平，就会在 `near` 平面上出现裁切。建议 owner 复核（缩小 `near` 到 0.3 会牺牲远场深度精度，需连带评估）——**本卡不改**（改 `near` 属"贴近淡出/近平面"方案的 (c) 类，卡面要求实测择优，而本卡未复现洞）。
2. `src/zones/_greybox.js`（out of scope）：被 `setZoneVisible(false)` 藏起来的 greybox 地面**仍在 `Raycaster` 命中集里**（three 不看 `visible`）——任何"像素归因/拾取"工具都会被它骗到（本卡实测 2 处 `gap=0` 假共面）。建议 owner 在 greybox 侧加 `layers` 或让工具层过滤；本卡已在探针侧按可见性链过滤。

## 6. 常驻守卫 + 三证（`tests/core-antialias.test.mjs` ⑤ t40①–④）

断言（判据只增不减）：① 登记与几何同轮（两门限值 / 等效距离 495…396 m / 逐柱锚点 = 槽位入口逐值一致）；
② 滞回语义逐帧（序列 `2.0→0.98→1.05→1.2→1.3→1.05→0.99` ⇒ `1,0,0,0,1,1,0`；并断言**旧的单门限复算**为 `1,0,1,1,1,1,0` 且两者不同）；
③ **不爆闪**：门限附近 0.98↔1.05 交替 40 帧 ⇒ 翻转 **0**，同一序列的**旧单门限复算 39 次**（断言 ≥8 ⇒ 不假绿）；
④ 特征保留与预算未动（20 m 可见 / 1500 m 不绘制 / budget 48 · size 1.1 · opacity 0.16 · 每柱 12 颗 / 台阶阈值 0.5·0.6）。

**三证（实测，`§12.1.4.2`）**：

| 证 | 操作 | 实测 |
| --- | --- | --- |
| ① **修前必红** | 把 `src/core/environment.js` 的滞回分支临时还原为 t25 单门限（真实文件突变，非模拟） | `node tests/core-antialias.test.mjs` ⇒ **6/8**：t40② 红（滞回序列实测 `1011110` ≠ 登记 `1000110`）· t40③ 红（绕门限往复翻转 **39** > 上限 1）——正是 t25 的爆闪缺陷 |
| ② **修后全绿** | `cp` 恢复（md5 `4416a4617974509f59346380faea8d25`，突变残留 `grep -c mutation-control` = **0**） | `node tests/core-antialias.test.mjs` ⇒ **8/8** |
| ③ **对照不假红** | ③ 内部用**同一序列**跑旧规则复算并断言 ≥8 次翻转 | 实测 **39** 次（≥8）⇒ 断言确实能抓到单门限爆闪，不是恒真 |

**验证命令（本卡 verify）**：

```console
$ node scripts/probe-motion-edges.mjs         # 11 臂移动协议 + 默认判据（见 §7 读数）
$ node tests/flicker-guard.test.mjs           # t25 守卫不得回退 ⇒ 通过 5 / 5
$ node scripts/audit.mjs --enforce            # 预算与契约 ⇒ exit 0（主场景 342/350 · F 区 80/80 · 未新增绘制调用）
```

## 7. 并发窗口纪律（9 处红 = 别人的窗口，不是本卡）

`node tests/run.mjs` 在本卡收尾时给出 **19/28**（9 红），逐项归因**全部落在别人的在飞改动**上，本卡零因果：

| 证据 | 内容 |
| --- | --- |
| 失败项本体 | 全部是 **layout/zone/kit 的冻结计数**，例：`tests/core.test.mjs`「灰盒满足全部契约字段与数量（79 栋 / … ／ LAYOUT **1.1.27**）… terrace 面应为 **8** 条…实际 **80**」——期望值对应**旧布局**，实际值来自**刚被改过的布局** |
| 数据源 mtime | `src/shared/layout.js` = **13:26:28**（本卡 13:00 起跑、14:0x 收尾）⇒ 期间被他人改动；`src/kit/*`、`src/zones/east-courts.js`、`tests/core.test.mjs`、`tests/interaction.test.mjs`、`tests/verify-experience.test.mjs` 均为**他人修改**（`git status` 可见），**不在本卡 changedPaths** |
| 直接读数 | `LAYOUT 1.1.27 · WALKABLE 247 · terrace 面 80`（本卡从未触碰 `layout.js` / `_greybox.js` / `zones/**` / `kit/**`） |
| 同一课目在本卡前全绿 | t35 交付时（11:2x，同一棵含 t25 LOD 的树）`node tests/run.mjs` = **28/28**；此后本卡只新增"可见性布尔 + 一个常量 + 探针 + 一条守卫" |
| 本卡 verify 全绿 | `scripts/probe-motion-edges.mjs` **exit 0** · `tests/flicker-guard.test.mjs` **5/5** · `scripts/audit.mjs --enforce` **exit 0** · `tests/core-environment.test.mjs` **12/12** · `tests/core-antialias.test.mjs` **8/8** |

> 处置：**不为窗口伪影改代码**（卡面纪律）；把"9 红 + 逐项归因"如实写进本节并交回主理人（涉及 `layout.js` 版本与 `tests/core.test.mjs` 冻结计数的 owner）。

## 8. 未运行项（如实报告）

* 浏览器内 `quality=high`（MSAA-4）与 `low`（AA 关）的移动协议对照**未跑**（每臂 ≈1 min，时间预算优先给了本卡验收项）；AA 档位差异由既有的 `core-antialias` / `docs/handoff-t2-antialias.md` 的静态与真机读数承担。
* `a-frozen` / `d-frozen`（横移）在本轮最终测定中被替换为 `w-frozen` + 亚像素臂（首次测量已跑过 A/D 与 W 数值同量级：29.1 万 / 29.2 万 / 29.3 万不稳定像素，位移同为 1.993 m）。
* 24 格 shot 人眼判读（观感）不属本卡（`scripts/shot.mjs` 在 out of scope）。
