# CONTRACTS.md — 接口、注册表、数据格式与文件归属

> 归属：`t1 foundation-lead`（本文件唯一负责人）。任何接口变更必须由 t1 递增版本并通知受影响任务（计划 §3.3 / §7.1）。
>
> | 项目 | 版本 |
> | --- | --- |
> | 契约版本 | `CONTRACTS v1.0.15` |
> | 风格基线 | `STYLE_BASELINE v1.0.0`（见 `docs/STYLE_GUIDE.md`） |
> | `src/shared/config.js` | `CONFIG_VERSION 1.0.6` |
> | `src/shared/layout.js` | `LAYOUT_VERSION 1.0.0` |
> | `src/kit/index.js` | `KIT_VERSION 1.0.1` |
> | 参考 | `imperial-palace-plan.md` §2.3 §3.1 §6.1 §6.2 §6.3 §6.4 §7.1 §8.2 |
>
> **版本对应关系（当前有效组合）**：`CONTRACTS v1.0.15` ⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ `STYLE_BASELINE v1.0.0`。
> 以上四项均以**运行时读出值**为准并用命令核对（见 §3.4.8 末尾与 `docs/handoff-contracts-fix.md`）：
> `node -e "Promise.all([import('./src/shared/config.js'),import('./src/shared/layout.js'),import('./src/kit/index.js')]).then(([c,l,k])=>console.log(c.CONFIG_VERSION,l.LAYOUT_VERSION,k.KIT_VERSION))"` → `1.0.3 1.0.0 1.0.1`。
> 下游回报必须写明这组版本；不匹配即视为旧版产物。
>
> **修订记录**
> - **v1.0.13（t82 / T2.21）**：新增 **§6.3.1 `y0` canonical 语义**（`y0 = min(记录值, 足迹地坪)`，含 `y0Recorded/y0Source` 与"下钳条数是数据相关量（实测 15/66）"的澄清，取代历史文档里的"73 条"快照）与 **§11.6 audit 输出口径**（预算违规 vs 信息性提示分开成段、退出码只由违规决定）。背景：t59 交回两处口径不一致（y0 代码 vs t27 文档；audit `--enforce` 下"6 项未通过"仍 exit 0）。
> - **v1.0.11（t79 / T2.20）**：§6.1 `kind` 白名单增补 **`passage`**（门洞通道面，LAYOUT 1.1.4 的 43 条 `WK-<slotId>-door-passage`），新增 §6.1.1 语义（宽 = `doorWidth`、`y = door.sillY`、**不参与内景相机包围盒**），并写明"新增 kind 必须同步 `src/core/context.js:WALKABLE_KINDS` 与本表"的纪律与常驻守卫（`tests/core-kinds.test.mjs`）。背景：该 kind 曾因未同步消费方白名单导致全树 0 区域装载。
> - `CONFIG 1.0.1`（2026-09-26，t15）：`GRADES[2].roofTypes` 增补 `'pyramidal'`（御花园中央主亭 = grade 2 + 攒尖顶；GRADES[3] 仍仅限 `doubleEaveHip`）。**布局数值零改动**，`LAYOUT_VERSION` 保持 `1.0.0`。
> - `CONTRACTS v1.0.1`：同上，并明确 `eaveHeight`/`totalHeight` 为**估值（非硬约束）**，见 §4.1。
> - `CONTRACTS v1.0.2`（2026-09-26，t17）：新增 **§11 运行时查询参数与 shot/截图模式义务**——把 t2 已实现的 `?view/?preset/?ui/?shot/?stats`（及 `?zone/?focus/?quality/?dpr/?greybox/?env`）写成契约，冻结 **UI 隐藏义务**（`ui=0`/`shot=1`）、**可轮询就绪信号**（`data-palace-ready` / `__PALACE_READY__` / `whenReady`）与 **`?stats=1` 字段名及与 `scripts/audit.mjs` 的口径差异**（含实现与任务卡的差异记录）。`src/shared/**` 数值零改动。
> - `CONFIG 1.0.2` + `CONTRACTS v1.0.3`（2026-09-26，t19）：**环境预设校准**（主理人裁定，依据 t2 实测 + 目视复核）：
>   ① 夜景方案A —— `moonlitNight` 由 `sun 0.75 / ambient 0.36 / hemi 0.32 / exposure 1.18` 改为 **`2.0 / 0.8 / 0.65 / 1.35`**
>   （旧值实测全城 `oblique` 均值 0.0741、暗区 94.03%，只剩黑色剪影；采用建议B（均值 0.187）被否决：过曝夜色风险，且内景问题不该用全局提亮掩盖）；
>   ② **宫灯加强** —— `LIGHTING.lamps.intensity 6.5→12`、`distance 34→46`，实时点光上限仍 ≤8、投影策略不变（§8.2 预算不变），内景/近景亮度由宫灯承担；
>   ③ **雾距修正** —— `goldenHour`/`sunset` 的 `fogNear 700/600→1400`、`fogFar 2400/2100→3200`（`VP-city-oblique` 距目标 ≈1222m，旧雾距在该处约 31% 雾混合导致远侧发白）；
>   ④ 新增 **§12 三时辰可读性与过曝判据**（固定口径 + 阈值 + 与 `scripts/shot.mjs` 参数映射），供 V2(t13) 与后续调整复用。
>   before/after 实测与命令原文见 [`docs/report-night-calibration.md`](report-night-calibration.md)；`src/shared/layout.js` 数值与 `LAYOUT_VERSION 1.0.0` **未动**。
> - `CONTRACTS v1.0.4`（2026-09-26，t20）：按 `src/kit/**` 的**实际导出**补全构件库操作契约——
>   ① §3.4 由「仅冻结工厂名称」扩写为完整操作契约（`createKit({THREE,config,quality})` 构造、LOD 返回类型与单档 `lod:'near|mid|far'`、
>   `params` 必需字段、摆位语义 `x/z/baseY/rotationYDeg/facing`、台明与台阶副作用、道具工厂与 21 角色 / 9 材质 id 引用、
>   `userData.kit.metrics/worldBounds/diagnostics`、组合与统计 API）；
>   ② 新增 **§3.5 区域合批与资源所有权**（`kit.mergeZone(root)` 的调用时机与后果、共享材质不得 dispose、`kit.dispose()` 归 t2 等）；
>   ③ 明确 `worldBounds` 为唯一权威轮廓（引用 §4.1 估值语义）；`roofType` 白名单在 `CONFIG 1.0.1` 起**严格抛错**；
>   ④ `docs/STYLE_GUIDE.md` 材质表 `roughness` 列补注「基础值（渲染时统一 +0.04 旧化偏置）」。
>   实测证据（`KIT_VERSION 1.0.0`：21 角色 / 9 id / 41 键 / 23 对象、`hall()` 返回 `THREE.LOD`、`lod:'far'` 返回 `Group`、
>   `worldBounds` 南向超槽位 ≈10.65m、11+8 工厂可调用）见 [`docs/handoff-contracts-kit.md`](handoff-contracts-kit.md)。`src/shared/**` 与 `LAYOUT_VERSION` 未动。
> - `CONFIG 1.0.3` + `CONTRACTS v1.0.5`（2026-09-26，t26）：**夜色判据收口**——暗区改为**内容掩码口径**（分母＝非背景像素，严格背景侦测，整帧数字降为诊断）、按视角类别分档（全城/区域/环绕/中轴 ≤15%；近景/第一人称/内景 ≤30%）、过曝改以**高光截断 ≤5%** 为主判据（整帧均值 ≤0.75 仅诊断）；同时 `lamps.intensity 12→18`、`distance 46→60`、`decay 2→1`，`goldenHour/sunset.lampIntensityScale 0→0.45 / 0.35→0.6`（日/夕内景补光通道），`QUALITY.tiers.medium.maxRealtimeLights 4→6`（仍 ≤8）。未通过项（`axis` 夜 29.31%、日/夕内景 49%–66%）已如实登记，最小修法见 `docs/handoff-config-1.0.3.md`。
>
> - `CONTRACTS v1.0.6`（2026-09-26，t34）：**明确 `axis` 档位**——归入**低空/近景类（内容暗区 ≤30%）**，依据是该机位为低空贴地序列机位、画面以暗地面/暗屋面为主，与 focus/fp/interior 同类（`v1.0.5` 只写分档未指定 axis 归属，属契约歧义）；两类改名为「俯瞰/环绕类」「低空/近景类」；**阈值未放宽**（15%/30%/5% + clip 主判据不变），档位表可用 `node scripts/shot.mjs --classes` 复算。同步 `scripts/shot.mjs` 与 `docs/shots/README.md`；**历史记录（g1 评审、各 handoff）不回改**。
> - `CONTRACTS v1.0.7`（2026-09-26，t37）：**① `openings[].at` 语义对齐实现**——新增 §3.4.8 明确 `layout.WALLS[].openings[].at` 是**沿墙轴的世界绝对坐标**（以 `src/core/layout-slice.js::wallSolidSpans` 为准），并给出正例 ①（`CY-D-court1-wall-east`：正确 → 实心段 `[[-392,-324],[-312,-244]]`；误按相对中点 → `at'=-636`、整墙实心）、正例 ②（`CY-D-court4-wall-east`：误读使实心段跑到墙外）、陷阱例（`CY-B-throne-wall-north` 中点=0，两种读法等价，不能用作口径回归）；同时区分 `kit.wall(p)` 自己的「相对墙中点」入参口径并给出换算。**② 版本表口径统一**——头部版本表逐项对齐运行时读出值：`CONTRACTS v1.0.7` ⇄ `CONFIG_VERSION 1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ `STYLE_BASELINE v1.0.0`（原头部表 `CONFIG_VERSION` 误写 1.0.2、缺 KIT 行）。
>   **时点声明（不修改上文任何历史条目）**：`v1.0.1`–`v1.0.6` 各条目里出现的 `CONFIG 1.0.1` / `CONFIG 1.0.2` 与 `KIT_VERSION 1.0.0` 均为**该条目发布时点**的真实值，现已被 `CONFIG 1.0.3`（t26）与 `KIT_VERSION 1.0.1` 取代；历史条目的数字与结论**保持原样**，此处仅追加取代说明。
> - `CONTRACTS v1.0.8`（2026-09-26，t46）：**背景引用改为“权威背景色优先”**——新增 §12.1.1：`?stats=1` 的 `backgroundColorHex`（渲染侧只读上报，t45）优先作为背景引用，t44 的像素法降级为**交叉校验/兜底**并报告 `Δ`；新增**「无天空视角」正式口径**（权威背景占比 <0.5% ⇒ 整帧即内容、阈值与分类不变、输出标注依据；**禁止** `--allow-no-sky` 静默退回）。§11.4 的 `?stats=1` 字段表新增背景/雾字段。实测：`fp`（夜）权威口径 26.52% PASS、`axis`（夜）走“无天空视角”15.10% PASS；像素法交叉校验 `Δ=15` 已登记为开放项。
> - `CONTRACTS v1.0.9`（2026-09-26，t49）：**背景引用改为「实际落屏天空带」**（`backgroundDisplayedTopHex ↔ HorizonHex`），配置清屏色降为仅参考并纳入 **Δ 监控**（Δ > `--content-tol` ⇒ 告警）；§12.1.1 更新优先级表；**关闭 t46 开放项**；复算 `fp`（夜）26.52% → **5.95%**（PASS）、`axis`（夜）走“无天空视角”**15.10%**（PASS）。阈值与分类未动。
> - **v1.0.12（t81 / T1.28；F6 裁定 (a)）**：§5.2 内景机位口径递增为「**每栋可进入建筑 1 个 `interior` 机位**」（集合 43 栋 = 殿 14 + 配殿/配房 23 + 门殿 6；排除 4 角楼 / 10 亭 / 10 院门），映射由 `INTERIOR_BY_SLOT` 显式给出；新增 §5.2.1「与 `LAYOUT 1.1.4` 实际值对照」表（interior 43 / walkable 112 / viewpoints 61 / FP_ROUTE 50 / CONNECTORS 32 / WALLS 60 / SLOTS 67 / COURTYARDS 14）并写明取代关系；**历史条目只追加、旧口径保留并附时点声明**；连通性归 t77、几何开门归 t69/三区/t66，**本版本不宣称“均已可进入”**。
> - **v1.0.14（t97 / T1.34）**：新增 §5.2.2 —— `door.sillY` = **门外门槛面标高**（`sillY = zoneGroundY(zone) + 本地台基`）；修复 24 栋 C/D/E 漏加区域地坪；`WK-*-interior.y` / `WK-*-door-passage.y` / `INTERIOR_BY_SLOT.groundY` 三者逐栋相等（43/43）；例外表 `DOOR_SILL_EXCEPTIONS` 3 类 6 条（F 四城门双标高 + `C-hall-bed-main` + `C-gate-inner` 绝对标高 wart）。LAYOUT 1.1.8。
> - **v1.0.15（t103 / T1.38）**：新增 §4.1.1（`door.center` 为建筑中心 / **`door.facade` 为门外锚点**，`y` 与 `sillY` 同源；贴门取地面一律用 `facade`）；§5.2.1 与 §6.4 的 `WALKABLE` 由 **112 → 157**（+43 门外过渡台阶 t102 + 2 亭入口门槛 t103）；**10 座开敞亭可通行化**（`hasDoor:true` ⇒ `OBSTACLES.blocks='exceptDoor'`，与院门同类）。
> **数值唯一来源**：所有色板、模数、间距、时长、标高、预算、种子只能取自 `src/shared/config.js`；
> 所有建筑槽位、院落、连接、道路、可行走面、障碍、视角只能取自 `src/shared/layout.js`。
> 禁止在区域/核心/UI 代码里散落硬编码数值；需要新数值时先登记（递增版本）再消费。

---

## 1. 技术前提

- 浏览器经 HTTP 访问（`bash scripts/serve.sh`，默认 `127.0.0.1:8123`）。`file://` 下 ES module 会被拦截。
- 唯一运行时依赖是本地 `public/vendor/three`（three **r169**），**禁止 `npm install`**、禁止新增在线资源。
- `index.html` 内置 import map（t1 维护），统一导入写法：

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../shared/config.js';
import { SLOTS, ZONES, floorYAt } from '../shared/layout.js';
```

- `src/shared/config.js` 与 `src/shared/layout.js` 是纯 ESM、零外部依赖、全部深冻结，可被 Node 直接 `import`（`tests/layout.test.mjs` 会断言）。

---

## 2. 文件归属表（唯一负责人，计划 §7.1）

| 路径 | 唯一负责人 | 说明 |
| --- | --- | --- |
| `index.html` | t1 foundation-lead | 仅 `#app` + 加载层 + import map + 模块入口 |
| `package.json` | t1 foundation-lead | `type=module`，零依赖，脚本 `serve/build/test/shot` |
| `src/shared/**` | t1 foundation-lead | `config.js`、`layout.js`、`base.css`（含本契约与风格数值） |
| `docs/CONTRACTS.md` | t1 foundation-lead | 本文件 |
| `docs/STYLE_GUIDE.md` | t1 foundation-lead | 风格基线、比例/材质对应、验收视角 |
| `docs/handoffs/**` | 各任务各写本人回执 | 模板见 `docs/handoffs/TEMPLATE.md` |
| `tests/run.mjs`、`tests/layout.test.mjs` | t1 foundation-lead | 顺序测试入口 + 共享契约机器校验 |
| `scripts/serve.sh`、`scripts/build.mjs` | t1 foundation-lead | 本地服务与 dist 构建 |
| `README.md` | t1 foundation-lead（t14 收口期可改实际状态段） | 实际状态、目录、实测命令 |
| `work/**` | 各任务 | 中间产物/工具，**不进入发布包** |
| `src/main.js` | t2 core-engineer | 组装与唯一动画循环 |
| `src/core/**` | t2 core-engineer | 渲染、加载、全局状态、环境系统、唯一相机装置 |
| `src/kit/**`、`public/assets/**`、`docs/ASSET_CREDITS.md` | t3 kit-engineer | 构件工厂、材质、资产缓存/LOD、资源登记 |
| `src/zones/forecourt.js` | t6 zone-forecourt | B 中轴前朝 |
| `src/zones/inner-palace.js` | t7 zone-inner | C 后宫 |
| `src/zones/garden-boundary.js` | t8 zone-garden | F 御花园与宫城边界 |
| `src/zones/west-courts.js` | t10 zone-forecourt | D 西侧宫苑 |
| `src/zones/east-courts.js` | t11 zone-inner | E 东侧宫苑 |
| `src/interaction/**`、`src/ui/**` | t9 ui-engineer | 控制/选中/导览/碰撞实现与 HUD、小地图 |
| `imperial-palace-plan.md` | 只读 | 任何任务不得修改 |
| `public/vendor/**` | 只读 | 不得修改 vendored three |

**跨文件修改规则**：只能改本人文件；需要改他人文件时先向主理人报告，由文件负责人改。不得同时改 `main.js`、布局、主题、依赖清单。

---

## 3. `createZone(ctx)` 契约（计划 §6.1）

```js
// src/zones/<zone>.js —— 每个区域同一入口；异步加载由共享 loader 管理。
export async function createZone(ctx) { /* ... */ }
export const ZONE_ID = 'B';          // 区域自述：'B' | 'C' | 'D' | 'E' | 'F'
export default createZone;
```

### 3.1 `ctx` 字段

| 字段 | 类型 | 内容 |
| --- | --- | --- |
| `ctx.THREE` | namespace | 同一份 `three`（`import * as THREE from 'three'`），不得另装/另引一份 |
| `ctx.config` | frozen object | `src/shared/config.js` 的 `CONFIG`（深冻结，只读） |
| `ctx.zoneLayout` | frozen object | 本区域的布局切片，见 §3.2 |
| `ctx.kit` | object | 构件工厂与共享材质（t3 提供；**操作契约见 §3.4，合批与资源所有权见 §3.5**） |
| `ctx.assets` | object | 资产管理器（t3 提供）：`{ get(id), load(list), stats(), used }` |
| `ctx.rng` | object | 确定性随机：`{ seed, next(), range(a,b), int(a,b), pick(arr), bool(p), fork(salt) }`；种子来自 `config.deriveSeed(zoneId, salt)` |
| `ctx.events` | object | 事件总线：`{ on(type, h), off(type, h), emit(type, payload), request(type, payload) }`，事件名只能用 §7 表 |
| `ctx.quality` | string | 当前质量档 `'high'|'medium'|'low'`（渲染细节分支用；不得改变布局/可走性） |
| `ctx.shared` | object | 预留：`{ materials, geometries, textures, disposeRegistry }`（只读引用，由 t2/t3 维护） |

### 3.2 `ctx.zoneLayout` 结构（由 `src/shared/layout.js` 派生）

```js
{
  id, name, area, owner, file,
  bounds,               // { minX, maxX, minZ, maxZ }
  tiles,                // [{ id, bounds, groundY }]
  groundY, drawCallBudget, boundaryZone,
  slots,                // 本人区域的全部建筑槽位（§4 字段）
  courtyards, courtyardWalls, corridors,
  connectors,           // 本人为 owner 的跨区通道（§5）
  roads, terraces, walkable, obstacles,
  viewpoints, lightAnchors, vegetation,
  neighbours: { north, south, east, west },   // 相邻区域 id 或 null
  helpers: { floorYAt, walkableAt, zoneAt, insideEnvelope, getSlot, getConnector }
}
```

### 3.3 返回对象（字段名与语义冻结）

```js
return {
  root,        // THREE.Group：保持单位变换（position/rotation/scale 不设），已按世界坐标摆好子物体；未挂 scene
  buildings,   // Building[]（§4），id 必须与 zoneLayout.slots 的 id 一致，字段值必须回显 layout 的数值
  connectors,  // Connector[]：仅本人 owner 的通道，回显 layout.CONNECTORS 的 position/width/elevation
  colliders,   // { obstacles: Obstacle[], walkable: Walkable[], ramps: Ramp[] }（§6）
  viewpoints,  // Viewpoint[]（§5）：至少 1 zone + 1 fp-spawn；B/C 额外 1 interior
  lightAnchors,// LightAnchor[]（§8.3）
  update,      // (dtSeconds, elapsedSeconds, state) => void
  dispose,     // () => void：只释放自有资源
};
```

**硬约束**

- `root` **不得**自行 `scene.add`；scene 挂载、renderer/composer、全局光照、相机裁剪、resize、状态、动画循环全部归 t2。
- 不得创建 `requestAnimationFrame`/`setInterval`/`renderer.render`；全场只有一个动画循环（计划 §8.3）。
- `update` 只能动自有对象；不得读写相机、不得改 `state`、不得 emit 除 §7 以外的事件。
- `dispose` 只能释放自己创建的 geometry/material/texture；共享 kit 资源由 t3 缓存管理，不得销毁他人仍在使用的对象。
- 同一份模型/贴图只保留一份运行时资源，各区域共享（计划 §4.2）。
- 区域不得扩张边界、不得新增建筑槽位、不得改共享参数；需要时报告 t1 递增版本。

### 3.4 `ctx.kit` 操作契约（t3 实现，名称与语义冻结）

> 权威来源：`src/kit/index.js`（`createKit`）与 `src/kit/buildings.js`、`src/kit/merge.js`、`src/kit/materials.js`。
> 本节由 t20（t1）逐条核对实现后编写；**实测证据**（测量时为 `KIT_VERSION 1.0.0`，现行为 `1.0.1`）见 `docs/handoff-contracts-kit.md`。
> 目标：区域作者**不必读 kit 源码**即可正确建模、摆位、合批与回收。

#### 3.4.1 构造与顶层字段

```js
import { createKit } from '../kit/index.js';
const kit = createKit({ THREE, config, quality });   // core 组装 ctx 时注入；区域直接用 ctx.kit，不要自建
// 可选项：textureSizeOverride / anisotropy / onDiagnostic / deriveSeed（默认取 shared/config 的 deriveSeed）
```

| 字段 | 含义 |
| --- | --- |
| `kit.version` | `KIT_VERSION`（当前 `'1.0.1'`） |
| `kit.THREE` / `kit.threeResolution` | 全场同一份 three（r169）与其解析来源 |
| `kit.config` / `kit.quality` / `kit.tier` | 冻结 config、质量档字符串与解析后的档位对象 |
| `kit.materials` | **共享材质库**（见 3.4.5） |
| `kit.assets` | 资源管理器（`get/load/stats/used`，9 字段登记；当前无第三方素材） |
| `kit.diagnostics` | 只读诊断数组（结构/风格告警；**不等于可以通过**，见 3.4.6） |
| `kit.tokens` | 令牌辅助：`gradeOf/roofOf/moduleScale/roofPlanOf/eaveHeightOf/localFootprint/bayMetrics` + `PROPORTIONS/roofTypes/grades/requiredParamFields` |
| `kit.budgetFor(area)` | 该分区预算：`{ drawCalls, triangles, perBuildingTriangles, textureSize, lodDistances }`（`'B'|'C'|'D'|'E'|'F'`） |

#### 3.4.2 构件工厂（11 个）

```js
kit.hall(p) kit.gateHall(p) kit.sideHall(p) kit.pavilion(p)
kit.cornerTower(p) kit.courtyardGate(p) kit.wall(p) kit.corridor(p)   // ⚠️ wall 的 openings[].at 口径见 §3.4.8（layout 与 kit 两种口径不同）
kit.terrace(p) kit.stairs(p) kit.bridge(p)
```

- **返回类型**：默认 `params.lod = 'auto'` → 返回 **`THREE.LOD`**（近/中/远三档，档位距离由 `config.BUDGET.lod` × 质量档 `lodBias` 决定）；
  `params.lod = 'near' | 'mid' | 'far'`（或 `0|1|2`）→ 只造该档并返回 **`THREE.Group`**（`lod:'none'` 等价于 near）。
  实测：`lod:'far'` → `Group` 且 `userData.kit.detail === 'far'`。
- **必需参数**（`kit.tokens.requiredParamFields` 冻结为）：
  `id, name, bays, w, d, terraceH, roofType, grade, facing, quality`。
- `params.roofType` 必须是 `config.ROOF_TYPES` 的键：`doubleEaveHip | hip | gableHip | gable | pyramidal`，
  **并且必须属于 `config.GRADES[grade].roofTypes` 白名单**（§4.2）；`CONFIG 1.0.1` 起 kit 对违规**直接抛错**（无开关、无"仅告警"模式）。
- `kit.courtyardGate` 未给 `roofType` 时默认 `'gable'`。
- `wall/corridor/terrace/stairs/bridge` 参数形态见 3.4.4。

#### 3.4.3 摆位契约（**务必整槽展开**）

```js
root.add(kit.hall({ ...slot, quality: ctx.quality }));   // ✅ 推荐：layout 槽位一行落地
```

| 参数 | 语义 | 默认 |
| --- | --- | --- |
| `x` / `z` | 世界坐标（米）——**组原点**位置 | `0` / `0`（漏传即全部堆在原点，这是"67 栋全在原点的"根因） |
| `baseY` | **台基顶（柱础）标高**；组原点 Y = `baseY − terraceH`（`groundLevelOf()`），因此台基恰好占 `[baseY−terraceH, baseY]` | `terraceH`（即原点贴地面 `y=0`） |
| `terraceH` | 台基高（米，相对地面） | 无默认，必需 |
| `rotationYDeg` | 绕 Y 轴旋转（度）；`facing` 只是 layout 侧的语义标签，**kit 只认 `rotationYDeg`**（映射见 `config.ORIENTATION.rotationYDeg`） | `0`（南向 `-Z`） |
| `facing` | `'south'|'east'|'north'|'west'`——**仅用于校验/诊断**，不参与摆位 | `'south'` |
| `w` / `d` | **世界 X/Z 占地**（含台明）；kit 内部按 `rotationYDeg` 换算 `localW/localD`（东/西向时 `localW = d`） | 必需 |
| `quality` | `'high'|'medium'|'low'`（决定细节档 near/mid/far） | `config.QUALITY.default`（`medium`） |
| `detail` | 显式细节档（覆盖 quality 推导） | 由 quality 推导 |

> **为什么整槽展开就够**：`layout.SLOTS` 的每个槽位已含 `x, z, w, d, bays, terraceH, roofType, grade, facing, rotationYDeg, baseY`
> （`baseY = terraceH`，墙上门楼再叠加 `CITY_WALL.height`），与 kit 的上述语义**逐字段对齐**。
> 因此 `{ ...slot, quality }` 即可正确摆位、取坡与台基标高；`layout.ORIENTATION`/`config.ORIENTATION.rotationYDeg` 同源。

#### 3.4.4 台明 / 台阶的副作用（**会超出槽位 footprint**）

- `terraceH > 0.2` 时，kit **自动**附带：台明（`plinth`，宽 `min(MODULES.plinthWidth, min(localW,localD)×0.12)`）与
  **正向台阶（`-Z` 方向）**；`grade ≥ 3` 且非亭时台阶中央带**丹陛御道**（`imperialRamp`）。
- 台阶水平长度 = `抬升 / MODULES.stairsStepHeight × MODULES.stairsStepDepth`，并按 `MODULES.stairsMaxRun` 分段设休息平台；
  **全部向南（`-Z`）延伸**，因此**实物轮廓比槽位 `w×d` 更大**。
  实测（B-hall-main 同参数）：`terraceH 4.5 → 30 级 × 0.34m ≈ 10.2m`，
  `userData.kit.worldBounds` 的 `minZ` 比槽位南边多 **≈10.65m**（t5 独立实测为 10.31m，差异来自丹陛/踏跺末端）。
- **与 `layout.TERRACES` 的关系**：`layout.TERRACES` 里的三层台基（1.5/3.0/4.5）是**区域级平台**，
  而 kit 的台明是**单栋自带**的。若某栋已落在区域自建的台基上，就会重叠。两种正确做法：
  1. 让该栋的 `terraceH` = 所在平台相对地面的**总高**（如 `B-hall-main` 用 `4.5`），**不要**再另建区域平台；
  2. 或区域自建多层台基（`kit.terrace({ tiers })`）并把该栋 `terraceH` 设为最上层的**局部高**。
- **当前没有"关闭台明/台阶"的开关**（代码只在 `terraceH ≤ 0.2` 时不生成台阶）。
  需要剔除时由区域在合批前对返回对象的子节点做筛选（`userData.part` 为 `'stairs'`/`'terrace'` 等，见 3.4.6），
  或把 `terraceH` 按上述语义调整；**不要**去改 kit 源码。
- 取景/碰撞/面板要覆盖"含台阶"的真实轮廓时，请用 `userData.kit.worldBounds`（3.4.6）。

#### 3.4.5 道具工厂与材质角色

```js
kit.tree(p) kit.rockery(p) kit.lantern(p) kit.railing(p) kit.bronze(p)
kit.screenWall(p) kit.water(p) kit.paving(p)      // 共 8 个摆件工厂
```

- 材质引用方式：**一律用角色名**，不要写 hex——
  - `kit.materials[role]`：`config.COLOR_ROLES` 的 **21 个语义角色**全部可用（如 `roofPrimary` / `wallPrimary` / `terraceStone` / `pavingPlaza` / `metalGilt` / `courtyardWall` / `water`…）；
  - `kit.materials[materialId]`：`config.MATERIALS` 的 **9 个材质 id**（`glazeTile`/`giltMetal`/`plasterRed`/`stoneWhite`/`pavingStone`/`interiorBrick`/`timberLacquer`/`paintingTeal`/`waterSurface`）；
  - 另有 **14 个派生材质**；`id` 与 `role` 指向**同一批对象**（实测 `kit.materials.map.size = 41` 个键、23 个对象）。
  - 其它 API：`kit.materials.get(name)`（未知名抛错）、`has(name)`、`color(token)`、`tileMeters(materialName)`（UV 米制换算）、`textureSize`、`stats()`。
- 工厂内传给摆件的 `material` / `stoneRole` 等字段同样只接受**角色名或材质 id**。

#### 3.4.6 返回对象的元数据（供注册、取景与验收）

所有工厂返回的对象都带 `userData.kit`（实测键：`id, kind, name, detail, params, metrics, diagnostics, worldBounds, version`），
并带 `userData.part`（构件类别）与 `userData.id`：

| 字段 | 用途 |
| --- | --- |
| `worldBounds` | **场景实测包围盒**（`{minX,maxX,minY,maxY,minZ,maxZ}`，含台明与台阶）——**取景、信息面板、碰撞与验收的唯一权威高度/轮廓来源**；与 §4.1 的关系见下 |
| `metrics` | 形制实测：`eaveHeight / eaveHeightAbsolute / groundY / roofRise / totalHeight / totalHeightAbsolute / ridge / baySpan / bodyW / bodyD / plinth / stairs / footprint / triangles / parts / lodDistances` 等 |
| `diagnostics` | 本构件的结构/风格告警（如形制比例异常） |
| `params` | 规范化后的入参快照（便于区域回显与排查） |

> **与 §4.1 的关系（重要）**：`layout` 的 `eaveHeight`/`totalHeight` 是**估值（非硬约束）**，`userData.kit.metrics.*Absolute`
> 与 `worldBounds` 才是**几何真值**。二者差值 10%–40% 属预期（差异根因见 `docs/handoff-kit.md` §2.4：kit 严格用
> `MODULES.roofSlope = 0.55`，layout 估值等效约 0.32）。**任何取景、focus 机位自适应距离、信息面板高度或验收脚本
> 必须使用 `worldBounds`（或 `metrics.*Absolute`），不得把布局侧 `totalHeight` 当权威值**——详见 §4.1 与 §11.4。

#### 3.4.7 组合 / 合批 / 统计 / 回收

```js
kit.mergeZone(root)          // 推荐：整区合批，见 §3.5（返回 { root, batch, stats }）
kit.mergeByMaterial(root)    // 仅按共享材质合并（不做 LOD 分档）
kit.pruneInterior(root)      // 去内部面（减三角面）
kit.instance(meshOrGeometry, count, matricesOrFn?, options?)
kit.lod(levels, options?)    // = makeLOD，自定义档位
kit.countDrawCalls(object) / kit.countTriangles(object) / kit.drawCallBuckets(object)
kit.stats(root?)             // { version, three, quality, materials, assets, diagnostics, factories, scene? }
kit.isOwned(material)        // 该材质是否由 kit 建造（dispose 边界判断用）
kit.disposeObject(root)      // 只释放带 kitOwned 标记的几何 + kit 自有材质/贴图；返回 { geometries, materials, meshes }
kit.dispose()                // 释放 kit 全部自有材质/贴图（**整场退出时由 t2 调用；区域不得调用**）
```

#### 3.4.8 墙段门洞 `openings[].at` 的两种口径（**易错点，务必区分**）

**`layout.WALLS[].openings[].at` = 沿墙轴的「世界绝对坐标」**（权威实现：`src/core/layout-slice.js` 的 `wallSolidSpans()`）：
它直接与墙段沿轴区间 `[lo, hi]` 比较，**不是**相对墙中点的偏移。

```js
// src/core/layout-slice.js::wallSolidSpans —— 权威口径（照此实现）
const horizontal = wall.axis === 'x';
const lo = horizontal ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z);
const hi = horizontal ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z);
const gaps = (wall.openings ?? []).map((o) => [o.at - o.width / 2, o.at + o.width / 2]); // ← o.at 是世界坐标
```

| 口径 | `at` 的含义 | 谁在用 |
| --- | --- | --- |
| **`layout.WALLS[].openings[].at`** | **沿墙轴的世界绝对坐标**：`axis:'x'` 时是 **x** 坐标，`axis:'z'` 时是 **z** 坐标 | `layout.js`、`core/layout-slice.js`（碰撞）、各区域（`west-courts.js`/`forecourt.js` 里都做了换算） |
| `kit.wall(p).openings[].at` | **相对墙中点的偏移**（kit 工厂自己的入参口径，见 `src/kit/buildings.js` 中 `makeWall` 的注释） | 只属于 `kit.wall` 工厂；区域调用它时**必须自己换算**（`at_kit = at_layout − mid_along_axis`） |

> ⚠️ **勿按「相对墙中点」理解 `layout` 的 `at`。** 两种口径对**中点恰为 0** 的墙段（如 `CY-B-throne-wall-north`，`x ∈ [-96, 96]`）
> 结果**完全一样**，因此这个错误可以被一部分场景掩盖；但一旦墙段中点不为 0（中轴两侧的院墙几乎全是这种），就会大面积错位。

**正例 ①（洞口恰在中点，最容易被误读）** `CY-D-court1-wall-east`（礼乐院东墙）：

```text
axis = 'z'  沿轴区间 = [-392, -244]  中点 = -318  opening: at=-318, width=12
① 正确（at 为世界坐标）           → 实心段 [[-392,-324], [-312,-244]]   ← 洞口落在 -324…-312，可通行
② 误按"相对墙中点"（at' = -318 + -318 = -636）→ 实心段 [[-392,-244]]   ← 洞口跑到墙外，整段墙变成实心，门被封死
```

**正例 ②（洞口不在中点，偏移会明显错位）** `CY-D-court4-wall-east`：

```text
axis = 'z'  沿轴区间 = [88, 290]  中点 = 189  openings: at=188/w=12、at=290/w=10
① 正确（at 为世界坐标）        → 实心段 [[88,182], [194,285]]
② 误按"相对墙中点"（at' = 377、479）→ 实心段 [[88,371], [383,474]]   ← 实心段跑到墙段区间之外，碰撞盒与视觉完全错位
```

**陷阱例（两种读法结果相同，不能用来验证口径）** `CY-B-throne-wall-north`（中点 = 0）：

```text
axis = 'x'  沿轴区间 = [-96, 96]  中点 = 0  openings: at=-88/w=10、at=0/w=16、at=88/w=10
① 正确 → 实心段 [[-96,-93], [-83,-8], [8,83], [93,96]]
② 误读（at' = mid + at = at）→ 完全相同的实心段     ← 中点=0 时两者等价，别用这类墙段做口径回归
```

**交叉验证命令**（真实输出见 [`docs/handoff-contracts-fix.md`](handoff-contracts-fix.md)）：

```bash
cd "<ROOT>"
node -e "import('./src/shared/layout.js').then(async m=>{const {wallSolidSpans}=await import('./src/core/layout-slice.js');
const w=m.WALLS.find(x=>x.id==='CY-D-court1-wall-east');
console.log(w.id,w.axis,JSON.stringify(w.openings),JSON.stringify(wallSolidSpans(w)))})"
# → CY-D-court1-wall-east z [{"at":-318,"width":12}] [[-392,-324],[-312,-244]]
```

> **为什么不改数据**（主理人裁定）：把 `layout.WALLS[].openings[].at` 改成"相对中点"需要递增 `LAYOUT_VERSION` 并回归
> 4 个区域（D/E 及中轴墙全部重新对位），代价远大于修正一句文档；因此**以实现为准**，文档对齐实现。

### 3.5 区域合批与资源所有权（t3 kit / 区域作者必读）

1. **合批是义务，不是优化**：区域把该区全部构件 `root.add(...)` 之后，**必须调用且只调用一次** `kit.mergeZone(root)`：
   ```js
   const { root, batch, stats } = kit.mergeZone(root);   // 内部会把合批结果作为 batch 挂到 root 下
   ```
   - 它做的是"**跨建筑 × 逐 LOD 档 × 同材质 × 同部件（`userData.part`）**"合并，并把原 LOD/网格从 root 移除
     （被移除的 `kitOwned` 几何会被释放）。
   - 返回 `stats = { before, after, reduction, levels, buckets, mergedMeshes, instanced }`，**请把 before/after 写进交付回执**。
   - 调用后 `root` 的结构已变（多一个 `batch` 子组），**不要在合批后再往里加建筑**；需要追加时先移除 `batch` 或重新组装。
   - **不合批的直接后果**：分区绘制调用会数倍超出 §8.2 分区预算（B70/C50/D40/E40/F80），
     进而使整城 `renderer.info.render.calls` 超出 350 上限——预算不达即验收不通过。
   - 可选参数：`kit.mergeZone(root, { name, prune, epsilon })`（`prune:true` 会顺带去掉内部面，代价是构建时间）。
2. **材质是共享的**：`kit.materials` 由 kit 缓存并跨区域共享（同一份材质对象被 67 栋复用）。
   - 区域 **不得** 修改共享材质的属性（颜色/粗糙度/贴图），也不得 `dispose()` 它们；
   - 区域 **不得** 调用 `kit.dispose()`（那是全场退出路径，由 t2 负责）；只允许 `kit.disposeObject(自己创建的对象)`；
   - 区域自建的几何/材质由区域自己在 `dispose()` 里释放（契约 §3.3 归属不变）；
   - 需要新材质角色时报告 t1 递增 `CONFIG_VERSION`，**不要**在区域里就地改材质。
3. **单位与坐标**：全部米制世界坐标；`root` 保持单位变换（不变换、不缩放），摆放由 kit 的 `x/z/baseY/rotationYDeg` 完成。
4. **可复现**：随机性一律来自 `ctx.rng`（由 `deriveSeed` 派生）或 `params.rngSeed`，不得用 `Math.random()`。

---

## 4. 建筑注册字段（`Building`）

`layout.SLOTS` 的每一条都是冻结契约；区域返回的 `buildings` 必须逐字段回显以下值（可另加 `mesh`/`group` 引用）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 全局唯一，区域前缀（`B-`/`C-`/`D-`/`E-`/`F-`），小地图/选中/导览/信息面板共用 |
| `name` | string | 展示名（中文） |
| `kind` / `category` | string | `hall｜gateHall｜sideHall｜pavilion｜cornerTower｜courtyardGate` |
| `zone` | string | `'B'|'C'|'D'|'E'|'F'` |
| `x`, `z` | number | 世界坐标（米），Y 向上，X 向东，Z 向北 |
| `w`, `d` | number | X/Z 方向占地尺寸（米，含台明） |
| `bays` | number | 开间数 |
| `terraceH` | number | 台基高（米，相对该 tile 地坪） |
| `roofType` | string | `config.ROOF_TYPES` 的键，**且必须属于 `config.GRADES[grade].roofTypes` 白名单**（机器守卫见 §4.2） |
| `grade` | 1｜2｜3 | 装饰等级（对应 `config.GRADES`） |
| `facing` / `rotationYDeg` | string / number | 正面朝向（默认 `south` = -Z）与对应 Y 轴角度 |
| `visitable` | boolean | 是否可进入内景；`true` 必须在 `viewpoints` 提供 `interior` 机位 |
| `bounds` | `{minX,maxX,minZ,maxZ}` | 世界坐标包围盒（障碍与拾取用） |
| `entrance` | `{x,y,z}` | 主入口（门前）世界坐标 |
| `door` | `{axis,center,width,height,sillY}` 或 `null` | 门洞；`null` 表示整体阻挡 |
| `baseY` / `bodyBaseY` | number | 地面基准 / 屋身基准（墙上门楼用） |
| `eaveHeight` / `totalHeight` | number | **估值**（非硬约束）：阴影/LOD/粗排布参考，真值见 §4.1 |
| `usage` / `info` | string | 用途 / 信息面板文案（含"是否可入内"） |
| `courtyard` | string｜null | 所属院落 id |
| `lodHint` | `'near'|'mid'|'far'` | 由 grade 推导的细节提示 |

### 4.1 `eaveHeight` / `totalHeight` 的语义（估值，非硬约束）

`layout.js` 里的 `baseY`、`bodyBaseY`、`eaveHeight`、`totalHeight` 是**由 config 令牌做的粗略估算**：

```
eaveHeight  = bodyBaseY + MODULES.eaveHeight × GRADES[grade].eaveHeightFactor
roofRise    = 进深跨度 × ROOF_TYPES[roofType].riseRatio × 0.5
totalHeight = eaveHeight + roofRise (+ 重檐抬升)
```

**几何真值以 kit 的举架公式 + `config` 令牌为准**（`MODULES.roofSlope`、`ROOF_TYPES.*.riseRatio`、
`GRADES[grade].eaveHeightFactor`、`MODULES.terraceTierHeight` 等）。因此：

- kit **不需要**回显 `layout.totalHeight`，也不得为了让数值对上而牺牲正确的举架；两侧差值 10%–40% 属于预期（例如 `B-hall-main` 估算 20.48 vs kit 实测约 22.5）。
- 任何**相机取景 / focus 机位自适应距离 / 信息面板高度 / 验收脚本**都**不得**把 `layout.totalHeight` 当作权威高度；
  必须使用**场景实测包围盒**（`new THREE.Box3().setFromObject(buildingGroup)` 或 kit 提供的实测 `bounds3`）。
- `layout.totalHeight` 只可用于：障碍盒高度初值、LOD 分档粗估计、预算估算；差异不由测试断言约束（测试只断言它是有限正数）。
- 若某处确实需要"精确到米"的高度（例如门洞净高、台基高），请从 `terraceH`、`door.height`、`MODULES` 取值，而不是 `totalHeight`。

### 4.1.1 `door.center` 与 `door.facade` 的区别（t102/F3，`CONTRACTS v1.0.15`）

- **`door.center` = 建筑中心**（**不是门脸点**）——实证：`B-side-west-main` 的 `door.center = (-80,-116)`，而其东立面在 `x = -72`、门洞通道面 `x ∈ [-72.6, -66]`。
- **`door.facade` = 门外锚点**（唯一门外基准）= **通道面进深轴（短边）外端中心** = 外墙面向外 **6.0m**，字段 `{ x, z, y, outward, note }`；`y` 与 `door.sillY` 同源（= 区域地坪 + 本地台基）。
- **纪律**：任何“贴门取地面 / 测量门外 Δ / 登记过渡”的工具**必须以 `facade` 为基准**；以 `center` 起算会穿过建筑进深 14–21m（t100 口径 v1/v2/v3 三次作废的根因，详见 `docs/report-completeness.md §15.6`）。
- **历史只追加**：本语义在 `LAYOUT ≤1.1.8` 不存在此字段，自 `1.1.9`（t102）起登记。

### 4.2 等级-屋顶白名单（机器守卫，`CONFIG 1.0.1` 起）

每个槽位必须同时满足：

1. `roofType` 是 `config.ROOF_TYPES` 的合法键；
2. `roofType ∈ config.GRADES[grade].roofTypes`。

允许列表（`CONFIG 1.0.1`）：

| grade | 允许的 roofType |
| --- | --- |
| 1 | `gableHip`、`gable`、`pyramidal` |
| 2 | `doubleEaveHip`、`hip`、`gableHip`、`pyramidal` |
| 3 | `doubleEaveHip`（最高等级继续受约束） |

该约束由 `tests/layout.test.mjs` 的"等级-屋顶白名单"断言（逐槽位 + 汇总）永久拦截，
不再依赖人工比对；`CONFIG 1.0.1` 的修订原因即此前 `F-garden-pavilion-main`（grade 2 + 攒尖顶）是人工发现的唯一冲突。

---

## 5. 八视角与 `viewpoints` 登记格式（计划 §6.4）

### 5.1 登记格式

```js
// 区域在返回值里提供；全局冻结表见 layout.js 的 VIEWPOINTS（区域必须按 id 回显这些值）
{
  id: 'VP-B-zone',            // 全局唯一
  name: '前朝分区机位',        // 展示名
  mode: 'zone',               // 'zone' | 'interior' | 'fp-spawn' | 'focus-extra'
  position: { x, y, z },      // 世界坐标（米）
  target:   { x, y, z },      // 注视点
  fov: 42,                    // 可选，默认 config.CAMERA.fov
  area: 'B',                  // 可选，归属区域/分区
  // 以下为 t1 追加的可选字段（不参与风格校验）：
  cameraMode: null,           // 'oblique'|'iso'|'axis'|'focus'，仅 focus-extra 用
  owner: 't6', note: ''
}
```

### 5.2 数量要求（机器校验）

- 每个区域（B/C/D/E/F）至少 **1 个 `zone` + 1 个 `fp-spawn`**；
- **每栋“可进入建筑”各 1 个 `interior` 机位**（**取代**旧口径“B 与 C 各额外 1 个 `interior`”，见下方时点声明）：
  当前集合 = **43 栋** = 殿 **14** + 配殿/配房 **23** + 门殿 **6**；**排除** 4 座角楼（Q3 裁定）、10 座开敞亭（`pavilion`）、10 座院门（`courtyardGate`）；
  机位与 `WK-<slotId>-interior` / 走查点 `WP-fp-<slotId>` 的一一对应关系由 **`layout.INTERIOR_BY_SLOT`**（43 条）显式给出，消费方**不得按区名猜机位**；
  > **时点声明（历史真值保留）**：旧口径「B 与 C 各额外 1 个 `interior`（金銮殿、寝殿）」在 `LAYOUT 1.0.0`~`1.1.0` 期间为真值；自 **`LAYOUT 1.1.1`~`1.1.4`（t72/t73/t74）** 起由本口径取代，历史条目不作删改。
- `fp-spawn` 必须落在 `layout.WALKABLE` 的可行走面上，且 `position.y = 面高 + config.CAMERA.fpEyeHeight (1.65m)`（±0.05）；
- `interior` 必须落在 `kind === 'interior'` 的可行走面内，且视线高同样为 `面高 + 1.65m`；
- 全局视图表由 t2 汇总，**G 只读消费，不得自行新增机位**。

#### 5.2.1 与 `LAYOUT 1.1.4` 实际值对照（t81 / F6 裁定 (a)）

| 量 | 旧文本口径 | **当前实测（`LAYOUT 1.1.4`）** | 取代关系 |
| --- | --- | --- | --- |
| `interior` 机位 | B/C 各 1（共 2） | **43**（每栋可进入建筑 1 个） | §5.2 已改，旧口径降为历史真值 |
| `WALKABLE` 条数 | 28 | **157**（112 + **43 门外过渡台阶 t102** + **2 亭入口门槛 t103**） | t103 按当前树实测更新（旧值 112 降为历史真值） |
| `VIEWPOINTS` | 20 | **61**（zone 7 / fp-spawn 5 / interior 43 / focus-extra 6） | 取代旧普查值 |
| `FP_ROUTE` | 9 | **50**（9 基础 + 41 门内走查点 + …由派生统一给出） | 取代旧普查值 |
| `CONNECTORS` | 32 | **32**（未变；**建筑自身的门不是 connector**） | 不变 |
| `WALLS` | 60 | **60** | 不变 |
| `SLOTS` | 67 | **67** | 不变 |
| `COURTYARDS` | 14 | **14** | 不变 |

**口径边界（不得夸大）**：本表只声明**数据侧**已注册的三件套（可行走面/机位/走查点）与计数；**“43 栋是否在真实碰撞图上可达”由 t77 按生产口径（含 connector 台阶）逐栋独立复验**，**本契约不宣称“43 栋均已可进入”**；**几何上是否真开门洞**仍归 t69（kit 正面门洞）+ 三区落开 + t66 端到端复核。

#### 5.2.2 `door.sillY` 语义与内景地面口径（`CONTRACTS v1.0.14`，t97）

- **`door.sillY` = 门外门槛面标高**（行人从室外迈进门槛时的地面高度）。派生公式（`src/shared/layout.js` 的 `S()`）：
  **`sillY = zoneGroundY(zone) + 本地台基(terraceH 等)`**。历史实现漏加 **区域地坪**（C 0.9 / D 0.4 / E 0.4），
  导致 24 栋 C/D/E 建筑的 `sillY` 与 `WK-<slot>-interior.y` 相差 0.4–0.9m（t89 定位、t97 修复；LAYOUT 1.1.7 → **1.1.8**）。
- **内景地面同源**：`WK-<slot>-interior.y`、`WK-<slot>-door-passage.y`、`INTERIOR_BY_SLOT[slot].groundY` 三者
  **必须逐栋相等**（43/43 机器断言），且对非例外栋等于 `sillY`。
- **例外表**（`DOOR_SILL_EXCEPTIONS`，逐条理由；例外集合必须**恰等于**该表键）：
  | 例外 | 值 | 理由 |
  | --- | --- | --- |
  | `F-gate-south/north/west/east` | 城楼门 `sillY=12.4` / **通道地面 0.4** | **双标高**：城楼门在墙顶、行人走墙下门洞通道；内景取通道面（t72 Q5 裁定 ①） |
  | `C-hall-bed-main` | `sillY=1.5`（=terraceH）/ 内景地面 2.4 | 无显式 door 字面量，遗留基准 wart（改 `terraceH` 会改建筑几何，属 kit 输入） |
  | `C-gate-inner` | `sillY=1.8` / 内景地面 0.9 | 该槽位 `baseY=0.9` 存的是**绝对标高**（其余为相对偏移）⇒ 绝对标高 wart（t83 登记、t97 并入例外表） |

> **历史只追加**：旧口径（`sillY = 本地台基`，无区域地坪）在 `LAYOUT ≤1.1.7` 期间为真值，自 `1.1.8`（t97）起由上式取代；历史条目保留不删改。

### 5.3 八种模式（同一相机装置，`config.CAMERA.viewModes`）

| 编号 | mode | 默认机位与约束 |
| --- | --- | --- |
| 1 | `oblique` 全城鸟瞰 | `VP-city-oblique`；极角 8°–78°，目标半径 ≤ 420m |
| 2 | `iso` 等距沙盘 | 方位 45°、仰角 35.264°，正交投影，机位固定在包络中心 |
| 3 | `axis` 中轴透视 | 沿中轴南→北分段推进，消费 `TOUR_POINTS` |
| 4 | `zone` 分区视角 | 消费 `config.CAMERA.zoneViewpointByArea` 与各区域 `zone` 机位 |
| 5 | `focus` 建筑近景 | 由 `building.bounds`、`facing` 计算正前 3/4 取景，距离随体量自适应 |
| 6 | `interior` 室内 | 使用 `interior` 机位，限制在室内包围盒内（B: `x[-36,36] z[-134,-98]`；C: `x[-27,27] z[154,182]`） |
| 7 | `fp` 第一人称 | 见 §5.4；`fp-spawn` + 视线高 `面高 + 1.65m` |
| 8 | `orbit` 自由环绕 | 环绕全城/当前焦点，限制极角、距离、目标半径，可复位 |

### 5.4 第一人称（模式 7）

- 进入：按钮或 `F`；停在最近的有效可行走点（优先最近的 `fp-spawn` 所在区域）；退出恢复进入前模式与机位（t2 保存/恢复）。
- 移动：`WASD`/方向键，`Shift` 加速（`config.CAMERA.fpRunMultiplier`），鼠标拖动或指针锁定转视角；`Esc` 释放指针锁后可继续拖动或按 `F` 返回。
- 视线高：`floorYAt(x,z) + 1.65`；上下台阶按 `config.INTERACTION.step.smoothSeconds` 平滑过渡。
- 必须可通路线（无法通行即验收失败）：见 `layout.FP_ROUTE`（南桥 → 南城门 → 礼仪广场 → 主殿丹陛 → 主殿台基 → 金銮殿内景 → 内廷门 → 寝殿内景 → 御花园）。
- 不可进入建筑给出可见提示（`config.EVENTS.blockedByBuilding`），不得穿模、卡死或悬空；`camera.near` 不能代替碰撞。
- 第一人称与导览互斥：进入时暂停导览；导览中用户接管相机则暂停并提示。

---

## 6. 碰撞与可行走面数据格式

### 6.1 可行走面 `Walkable`

```js
{ id, zone, kind, name, bounds: {minX,maxX,minZ,maxZ}, y, enterable, centerY, area }
// kind: 'ground' | 'terrace' | 'interior' | 'bridgeDeck' | 'gardenGround' | 'outerTerrain' | 'passage'
```

**`kind` 取值的权威白名单在 core**：`src/core/context.js` 的 `WALKABLE_KINDS`（`assertZoneResult` 逐条校验）。
**新增取值的纪律（t79 事故教训）**：布局侧每新增一个 `kind`，必须**同步 `WALKABLE_KINDS` 与本节列表**；
否则真实区域契约校验全部失败 ⇒ 浏览器 `装配完成：区域 [] · 注册建筑 0 栋` ⇒ 全树截图空白。
该跨模块不变式由 `tests/core-kinds.test.mjs` 常驻守卫（断言 `layout.WALKABLE[].kind ⊆ WALKABLE_KINDS`，含突变证明）。

#### 6.1.1 `passage`（门洞通道面，LAYOUT 1.1.4 / t75 起）

- 语义：**连接室内与室外的门洞通道面**，由 `door` / `facing` / `bounds` 派生，id 形如 `WK-<slotId>-door-passage`。
- 几何口径：沿 `door.axis`、**宽度 = `doorWidth`**、轴向跨 [外墙面向外 6.0m，向内 0.6m]（两栋既有内景内侧 6.6m，因其内景面内缩更大）；
  **`y = door.sillY`**（= 该栋出入口门槛高程）。
- **不参与内景相机包围盒**：内景夹取只消费 `kind:'interior'`（当前 43 条）；`passage` 只进 `WALKABLE` 供第一人称/碰撞使用。
- 目的：使 43 处内景在可行走图上与室外地面连通（此前内景四周被 `exceptDoor` 障碍盒围住、数据侧"可进入"但实际走不进去）。

- 查询：`layout.walkableAt(x,z)` 返回按 `y` 降序的全部覆盖面；**重叠时取最高面**作为支撑面。
- `layout.floorYAt(x, z)` 是权威地面高度函数：先取可行走面最高面，再叠加道路/坡道/台阶走廊的线性插值（仍取最高）。
- 高度差大于 `config.INTERACTION.step.maxStepHeight (0.5m)` 的两面之间**自动不可通行**（台基侧壁无需额外障碍盒）。

### 6.2 坡道/台阶 `Ramp`（由 `ROADS` 中 `from.y !== to.y` 的段派生）

```js
{ id, zone, name, from:{x,z,y}, to:{x,z,y}, width, slope, surface, connector }
// slope = |Δy| / 长度，必须 ≤ config.INTERACTION.step.rampMaxSlope (0.62)
```

台阶用同一记录表达，单级高 `MODULES.stairsStepHeight = 0.15m`、深 `0.34m`；三段丹陛合计抬升 4.5m。

### 6.3 障碍 `Obstacle`

```js
{
  id,                     // 'OB-<buildingId>' 或 'OB-<wallId>' / 'OB-<waterId>'
  sourceType,             // 'building' | 'wall' | 'water' | 'rockery'
  zone, buildingId,
  bounds: {minX,maxX,minZ,maxZ},   // 世界坐标包围盒（Y 轴由 y0/y1 给出）
  y0, y1,                 // y0 = min(记录值, 足迹地坪)——**canonical**，见下
  y0Recorded, y0Source,   // 记录值 / 归一来源：'layout'（min 为恒等）| 'floorYAt'（被下钳）
  blocks,                 // 'all'（整体阻挡）| 'exceptDoor'（仅门洞可通行）
  door,                   // blocks='exceptDoor' 时给出 {axis,center,width,height,sillY}
  note
}
```

- **不可进入的建筑登记为整体障碍**，不得成为可穿越空间；`visitable` 建筑的门洞可通行，其余体块阻挡。
- 宫墙四段、四城门门洞、护城河与水池水面、假山都在 `layout.OBSTACLES` 中登记。
- 碰撞实现（G）建议：`aabbGrid`（`config.INTERACTION.collision.cellSize = 20`），滑动迭代 3 次，`skin = 0.04m`。
- 玩家体积：圆柱半径 `0.35m`、高 `1.8m`、视高 `1.65m`（`config.INTERACTION.player`）。
- 台阶阈值：可跨 `0.5m`，下台阶吸附 `0.6m`，可走坡 ≤ `0.62`（tan）。
- 跳跃：**禁用**（`config.INTERACTION.jump.enabled = false`），避免掉出宫城；`clampToEnvelope = true`，玩家不得离开 `[±420, ±560]` 外侧地形范围，也不得越过城墙。
- 第一人称/相机：`camera.near` 不是碰撞替代品。

### 6.4 可行走面清单（权威来源 `layout.WALKABLE`，当前 **157 面**：ground/terrace/interior 43/bridgeDeck/gardenGround/outerTerrain/**passage 43**/**过渡台阶 43（t102）**/**亭门槛 2（t103）**）

外侧地形 4 段 + 墙外岸台 4 段 + 四桥桥面 + 南/北门内侧带 + 御花园地坪 + B 广场/主殿侧地面/三层台基顶/金銮殿内景地面/主殿北地面 + C 后宫地面/寝殿台基顶/寝殿内景地面 + D/E 侧院地坪。

---

> **§6.3.1 `y0` 的 canonical 语义（t82 定论；此前文档表述含糊，以本节为准）**
>
> - **权威定义（代码为准）**：`y0 = min( layout.OBSTACLES[].y0（记录值）, footprintFloor(该障碍足迹) )`，
>   实现见 `src/core/layout-slice.js` 的 `normalizeObstacleY0()`（并回写 `y0Recorded` 与 `y0Source`）。
>   `layout.OBSTACLES[].y0` 只是**记录值/设计基座标高**（如门洞门槛、台基顶），**不是**权威障碍底。
> - **足迹地坪 `footprintFloor(bounds)` = 该足迹内最高可行走面**（含台基顶、`kind:'interior'` 内景面、
>   `kind:'passage'` 门洞通道面）。因此"记录值 ≤ 足迹地坪"时 `min()` 为**恒等**（`y0Source='layout'`），
>   不表示"没有下钳规则"，只表示该条目的记录值本来就不高于地坪。
> - **下钳条数是数据相关量，不是常量**：t75 之后多数建筑足迹地坪抬高，实测下钳 **15 条 / 保持 66 条**
>   （共 81 条；`scripts/audit.mjs` 每次运行都会打印该自检行）。历史文档里"73 条下钳"是旧数据快照，已作废。
> - **消费方纪律**：碰撞/求解器/审计一律使用 `y0`；**不得**用记录值判断"底部"。
> - **常驻守卫**：`layout-slice.y0CanonicalProblems()` 逐条复算并要求 `y0` 与 `y0Source` 同时自洽；
>   `scripts/audit.mjs` 已把它作为一条**违规类**检查项（非空 ⇒ `--enforce` 失败）。

> **§11.6 `scripts/audit.mjs` 输出口径（t82 定论）**
>
> - 输出必须把两类条目**分开成段**，措辞固定：
>   · **`预算违规（会让 --enforce 退出码为 1）`** —— 真违规：主场景/分区绘制调用、可见三角面超预算、契约校验失败、LOD 口径回归失败等；
>   · **`信息性提示（不计失败）`** —— 仅供背景/口径说明的条目，**永不**影响退出码。
> - 结论行固定形如：`结论：预算违规 N 项（--enforce 时为失败）；信息性提示 M 项（不计失败）`；
>   两者皆 0 时输出 `结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）`。
> - 退出码只由**违规**决定（`--enforce` 且 N>0 ⇒ 1）。**禁止**把提示混入"未通过"计数。

## 7. `state` 与事件命名

### 7.1 `state` 字段（`config.STATE_DEFAULTS`）

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `mode` | `'browse'｜'tour'｜'fp'` | 顶层模式（导览/第一人称互斥） |
| `viewMode` | `'oblique'｜'iso'｜'axis'｜'zone'｜'focus'｜'interior'｜'fp'｜'orbit'` | 八视角之一 |
| `selectedBuildingId` | `string｜null` | 选中建筑（消费同一份建筑注册表） |
| `hoveredBuildingId` | `string｜null` | 悬停高亮 |
| `timePreset` | `'goldenHour'｜'sunset'｜'moonlitNight'` | 三时辰 |
| `quality` | `'high'｜'medium'｜'low'` | 质量档 |
| `tourState` | `{active,paused,index,id}` | 导览状态 |
| `loading` | `{progress,stage,failed}` | 加载/失败状态（失败必须有可见提示与重试） |

键盘 `1–8`、按钮、`F`、`Esc` 必须发送同一条请求事件；**不允许 UI 与键盘各自维护一套状态**。
运行时的第**三**个入口是 URL 查询参数（`?view/?preset/?zone/?focus/?quality/…`），同样走 `events.request`，
且有专为截图/自动化准备的 `?ui=0&shot=1&stats=1` 组合 —— 完整契约、就绪信号与统计字段见 **§11**。

### 7.2 事件表（`config.EVENTS`，`payload` 为约定字段）

| 常量 | 事件名 | payload |
| --- | --- | --- |
| `requestViewMode` | `view:request-mode` | `{ mode, source }` |
| `requestZoneFocus` | `view:request-zone` | `{ area, source }` |
| `requestFocusBuilding` | `view:request-focus-building` | `{ buildingId }` |
| `requestTour` | `tour:request` | `{ action: 'start'\|'pause'\|'resume'\|'stop', id }` |
| `requestTimePreset` | `env:request-time` | `{ preset }` |
| `requestQuality` | `env:request-quality` | `{ tier }` |
| `requestReset` | `view:request-reset` | `{}` |
| `stateChange` | `state:change` | `{ state, changed }` |
| `selectionChange` | `selection:change` | `{ buildingId, hovered }` |
| `zoneLoaded` | `zone:loaded` | `{ zone, stats }` |
| `zoneFailed` | `zone:failed` | `{ zone, error }` |
| `assetsProgress` | `assets:progress` | `{ loaded, total, stage, mb }` |
| `assetsFailed` | `assets:failed` | `{ url, error, retriable }` |
| `cameraSettled` | `camera:settled` | `{ mode, position }` |
| `fpEntered` | `fp:entered` | `{ position }` |
| `fpExited` | `fp:exited` | `{ restoredMode }` |
| `blockedByBuilding` | `interaction:blocked-building` | `{ buildingId, reason }` |

---

## 8. 资产登记字段（计划 §4.2）

`docs/ASSET_CREDITS.md`（t3 维护）与运行时资源管理器必须使用同一份登记结构：

```js
{
  id: 'palace-roof-glaze-01',
  sourceUrl: 'https://…',          // 来源链接
  author: '…',                     // 作者/来源方
  license: 'CC0-1.0 | CC-BY-4.0 | …', // 许可（必须允许本项目使用与交付）
  localPath: 'public/assets/models/roof-glaze-01.glb',
  normalization: {                 // §4.2 统一加工记录
    unit: 'meter', upAxis: 'Y', pivot: 'groundCenter',
    scale: 1, rotationYDeg: 0, groundOffsetY: 0, colorSpace: 'srgb'
  },
  bounds: { min:{x,y,z}, max:{x,y,z}, size:{x,y,z} },
  lod: [{ level: 0, triangles: 12000, file: '…' }, { level: 1, … }],
  usedBy: ['B', 'C', 'F'],         // 使用区域（同一资源只保留一份）
  notes: ''
}
```

必须字段（`config.ASSETS.requiredFields`）：`id, sourceUrl, author, license, localPath, normalization, bounds, lod, usedBy`。
禁止热链：运行资源随项目本地交付；确有在线资源时必须有失败提示并在 README 说明网络前提（当前项目 **无** 必需网络资源）。
运行时格式首选 `glb`、单位米、Y 轴向上、地面中心 pivot。

### 8.3 灯位 `LightAnchor`

```js
{ id, zone, kind: 'lantern'|'torch'|'windowGlow', position: { x, y, z }, height, role }
```

区域只声明灯位与类型；灯光由 t2 的统一环境系统按三时辰和距离激活（实时点光上限见 `config.LIGHTING.lamps.maxRealtimePointLights`，宫灯不投影）。
`layout.LIGHT_ANCHORS` 已登记 49 个基础灯位（中轴 + 侧院 + 花园），区域可按此实现，不得另建第二套灯光系统。

---

## 9. 性能预算与回报格式（计划 §8.2）

| 项目 | 预算（`config.BUDGET`） |
| --- | --- |
| 参考视口 | `1440×900`、DPR `1`（记录 GPU/浏览器/质量档） |
| 帧率 | 目标 60 FPS；低档争取 30 FPS；采样 ≥30s |
| 主场景绘制调用 | ≤ 350；分区 B70 / C50 / D40 / E40 / F80，保留 70 给集成 |
| 可见几何 | ≤ 150 万三角面；单建筑 ≤ 2.4 万 |
| 纹理 | 1K–2K（4K 仅重点近景确有收益） |
| 首屏资源 | ≤ 25MB 传输 |
| 动态阴影 | 仅一盏主方向光投影；宫灯不投影 |

回报必须分开列 **主场景单次调用** 与 **含阴影/后处理的整帧成本**，并附 `avgFps、p95FrameMs、drawCalls、visibleTriangles、transferMB`。
不得通过删除某个宫苑来达成指标。

---

## 10. 变更与占位协议（计划 §3.3）

1. 影响共同风格、区域连接或共享接口的冲突，先报告主理人；常规设计不重复确认。
2. 共享参数/接口变更由 t1 递增版本（`CONFIG_VERSION`/`LAYOUT_VERSION`/`CONTRACTS` 版本）并通知受影响任务；旧产物适配后才能合入。
3. 上游未完成时可用明确标注的占位接口开发独立部分（例如临时自建 geometry），但 **交付前必须替换真实依赖**，占位品不能标记为完成。
4. 每个任务开工前写 `docs/handoffs/<task-id>.md` 开工回执，完成后追加交付回执（模板见 `docs/handoffs/TEMPLATE.md`），未测内容明确写"未验证"。
5. 机器校验入口：`node tests/run.mjs`（顺序执行 `tests/*.test.mjs`，任一失败非零退出）。

---

## 11. 运行时查询参数与 shot / 截图模式义务（§ 引入版本 `v1.0.2`，现行契约 `CONTRACTS v1.0.7`；以 t2 实现为准）

> **权威来源**：`src/main.js` 的 `parseQuery()` / `applyQueryView()` / `markReady()`（t2 core-engineer）。
> 本文档由 t17（t1）**逐行核对实现后**编写；实现与任务卡描述不一致处一律**以实现为准**，差异集中记在 §11.5。
> 消费方：G（`src/ui/**`、`src/interaction/**`）实现 §11.3 的义务；`scripts/shot.mjs`、`scripts/audit.mjs`、
> V2（t13）验收按 §11.3/§11.4 取数。参数解析入口只有一处（`parseQuery`），区域与 UI **不得**另建解析。

### 11.1 参数表（默认值 = 不传该参数时的行为）

| 参数 | 取值 | 默认（不传） | 语义 | 非法 / 边界值的降级行为 |
| --- | --- | --- | --- | --- |
| `?view=<mode>` | `VIEW_MODES` 之一：`oblique｜iso｜axis｜zone｜focus｜interior｜fp｜orbit`（= `src/core/state.js` 导出 `VIEW_MODES` ← `config.CAMERA.viewModes[].mode`，与键盘 `1–8` 同一映射 `VIEW_MODE_BY_INDEX`） | 不请求视角 → 用 `state.viewMode` 默认值 `oblique` | 经 `EVENTS.requestViewMode` 请求八视角之一（与键盘/UI 同一入口） | **非法值**：`console.warn('[palace] ?view=xxx 非法（合法：…）')`，**不改变视角、不抛错**；`interior` 且同时给了 `?zone=` 时会把 `zone` 作为 `view.area` 传给相机（`?view=interior&zone=C` = 寝殿内景） |
| `?preset=<alias>` | 别名表（`PRESET_ALIASES`）：`golden｜goldenHour｜gold` → `goldenHour`；`sunset｜dusk` → `sunset`；`night｜moonlitNight｜moon` → `moonlitNight` | 不请求时辰 → `state.timePreset` 默认值 `goldenHour` | 经 `EVENTS.requestTimePreset` 切换三时辰；归一化后的 id 必须 ∈ `config.LIGHTING.timePresets` | **非法别名**：归一化为 `null` → **静默忽略（无 warn）** → 保持 `goldenHour`（与 `?view` 的 warn 行为不一致，见 §11.5 差异 1） |
| `?ui=0` | `1` 或 `0`（**只有字面 `0` 表示关闭**；`?ui=0.0`/`false` 均视为开启） | 开启（`params.get('ui') !== '0'`） | `ui=0`：**立即隐藏加载层**且此后不再显示（`showLoading()` 直接早退）；用于截图/自动化只留 3D 画面 | `?ui=`（空串）→ 非 `'0'` → 仍为开启；该参数**不影响** `?stats=1` 的数据面板（见 §11.3 注 3） |
| `?shot=1` | **只有字面 `1` 表示开启** | 关闭（`params.get('shot') === '1'`） | 截图/自动化模式：① 帧时长固定 `1/60`（不受挂起/rAF 抖动影响）；② 相机过渡**直接跳到终点**（`rig.update(transitionSeconds + 0.05, 0, state)`）；③ 装配后**同步渲染 3 帧**再 `markReady('sync-frames')`（因此 `--dump-dom` 这类不驱动 rAF 的 headless 也能拿到已渲染画面与报告）；④ rAF 循环第 3 帧再 `markReady('frame')`（幂等，首个 reason 保留） | `?shot`（空串）/`?shot=0` → 关闭（走正常 rAF 与真实 dt）；`shot=1` 与 `ui=1` 可叠加（此时加载层按正常流程隐藏） |
| `?stats=1` | **只有字面 `1` 表示开启** | 关闭 | 打开实测统计：注入可视面板 `#palace-stats`（左下角、`pointer-events:none`）与**机器可读**的 `<pre id="palace-stats-json">`（隐藏，每 ≥0.25s 更新为 `JSON.stringify(report)`），字段与口径见 §11.4 | `?stats=0`/空串 → 关闭；面板仅当 `stats=1` 时创建（与 `ui` 独立） |

**同一解析器同时支持的附加参数**（t2 已实现，一并冻结；任务卡未列，属实现超出，见 §11.5 差异 2）：

| 参数 | 取值 | 默认 | 语义 / 降级 |
| --- | --- | --- | --- |
| `?zone=<area>` | `config.CAMERA.zoneViewpointByArea` 的键：`city｜B｜C｜D｜E｜F` | 不请求分区 | `EVENTS.requestZoneFocus`；**非法值** → 控制器 `reject`：`console.warn('[state] 拒绝请求 view:request-zone：未知分区 "X"')`，`state` 不变 |
| `?focus=<buildingId>` | `layout.SLOTS` 的 `id`（如 `B-hall-main`） | 不请求近景 | `EVENTS.requestFocusBuilding` → `viewMode='focus'` + `selectedBuildingId`；**id 不存在**时控制器仍接受（只校验非空字符串），相机取景回落到 `VP-B-main-hall` 机位（`src/core/camera.js` focus 分支） |
| `?quality=<tier>` | `high｜medium｜low`（`config.QUALITY.order`） | `config.STATE_DEFAULTS.quality` = `medium` | 走 `EVENTS.requestQuality`；同时决定 renderer 初始化用的质量档 | 非法值：renderer 用默认档初始化，请求侧 `reject`（warn），**不崩** |
| `?dpr=<n>` | 数字 | `null` → 用质量档的 `QUALITY.tiers[tier].dpr`，并受 `config.RENDERER.maxPixelRatio` 与 `[0.5, max]` 夹取 | 覆盖 devicePixelRatio（截图固定 `1`） | ⚠ **非数字（如 `?dpr=abc`）→ `Number()` 得 `NaN`，夹取用的 `Math.max/min` 不拦 `NaN` → DPR 变 `NaN`**（`?stats=1` 报告里序列化为 `null`）。**已实测确认，实现未校验**，属 t2 待修项（见 §11.5 风险 1）；消费方必须传有限正数 |
| `?greybox=0` | 只有字面 `0` 关闭 | 开启 | 关闭全城灰盒 G0（真实区域替换后用于纯真实场景截图） | 非 `0` → 开启 |
| `?env=<k=v,...>` | `sun/ambient/hemi/exposure/lampIntensity/lampDistance/lampIntensityScale/fogNear/fogFar` | 无 | **诊断专用**：只改本进程内的预设副本（`presetOverrides`），使用时会 `console.warn` 提示 | 无法解析的键/非数字值被忽略；**绝不写回 `src/shared/config.js`**（`src/shared/**` 仍是唯一数值来源） |

**优先级与组合**：`?quality` 与 `?preset` 在 `bootstrap` 内以 `source:'query'` 发请求，与 UI/键盘共用同一控制器 → 后到的请求覆盖先到的（查询参数在装配期发出，通常早于用户操作）；`?view`/`?zone`/`?focus` 在 `applyQueryView()` 中按 `zone → focus → view` 顺序发出，因此**同时给 `view` 与 `zone`/`focus` 时以 `view` 为准**（`interior` 例外：`zone` 作为 `view.area` 参与）。

### 11.2 稳定 URL 示例（截图与回归基线）

```text
# 单张：等距沙盘 + 寒月宫灯 + 纯画面（无 UI）+ 机器可读报告
index.html?view=iso&preset=night&ui=0&shot=1&stats=1&quality=medium&dpr=1

# 主殿近景 / 寝殿内景
index.html?view=focus&focus=B-hall-main&ui=0&shot=1
index.html?view=interior&zone=C&ui=0&shot=1

# 带 UI 的人工检查（加载层可见）
index.html?view=oblique&preset=golden
```

### 11.3 shot 模式义务（**G 必须遵守**；V2 逐项验收）

1. **UI 隐藏义务**：当 `ui=0` **或** `shot=1` 时，HUD、建筑标签、小地图、信息面板、导览控件、视角切换器**必须全部隐藏**——
   并且**不得参与命中检测**：指针射线/悬停拾取必须跳过隐藏的 UI 元素（不要只靠 CSS `opacity:0`；`pointer-events:none`
   或"隐藏时直接不注册/不查询 DOM 层"均可，但必须在 V2 走查中可验证：`ui=0` 时鼠标点过 HUD 区域不应触发选中/悬停/面板）。
   **当前状态（诚实标注）**：`src/ui/**` 与 `src/interaction/**` 尚未交付（空目录），此刻页面里唯一的 UI 是 `index.html`
   的加载层 `#loading-layer`，`ui=0` 已实现"立即隐藏且不再显示"（实测 `#loading-layer` 带 `hidden=""`）。
   本条第 1 点其余部分是对 G 的**必做要求**，在其交付前属于**未实现/未验证**。
2. **就绪信号义务（可外部轮询，不得靠固定延时）**：`shot` 模式必须提供下列**任一即可**的信号，且**四者同时成立**
   （t2 已全部实现，实测见 §11.6）：
   - `window.__PALACE_READY__ === true`；`window.__PALACE_READY_REASON__` ∈ `'sync-frames'｜'frame'｜'grace-timer'`；
   - `<html data-palace-ready="1">`、`<body data-palace-ready="1">`，并带 `<html data-palace-ready-src="<reason>">`
     （`--dump-dom` 可直接读，`scripts/shot.mjs` 就靠它）；
   - **装配完成标记（早于就绪）**：`<html data-palace-loaded="1">`、`<body data-palace-loaded="1">`、`window.__PALACE_LOADED__ === true`
     ——表示场景与注册表已建好但可能还没渲染首帧；
   - `window.__PALACE__.whenReady`（Promise，resolve 后经 `window.__PALACE__` 取完整 API）与 `window.__PALACE__.ready`（布尔）。
   时序：`shot=1` → 同步 3 帧后立刻 `markReady('sync-frames')`（不依赖 rAF，headless `--dump-dom` 也能拿到）；
   `shot≠1` → rAF ≥2 帧 `markReady('frame')`，另有 **400ms `'grace-timer'` 兜底**（避免外部只靠固定延时）。
   `markReady` 幂等：首个 reason 保留。
   `scripts/shot.mjs` 的等待策略：先 `--dump-dom` 检查上述标记，**通过后才认这张图**（`--require-ready=first|all|none`，
   默认 `first`）；标记缺失 → 判失败并要求同方案重试，而不是"延时够了就算过"。
3. **`ui=0` 与 `stats=1` 相互独立**：`?ui=0&stats=1` 会隐藏加载层**但保留左下角统计面板**（`#palace-stats`，`pointer-events:none`）
   与隐藏的 `#palace-stats-json`。**需要纯画面交付图时不要叠加 `stats=1`**；`--stats` 只用于"把数据面板一起拍进图"的审计图。
   `#palace-stats-json` 是机器可读钩子，与画面互不干扰（`hidden`），V2/脚本应优先消费它而不是截图里的面板文字。
4. **`window.__PALACE__`**（t2 提供，只读消费）：`version{config,layout}`、`query`、`kitSource`、`events`、`store`、`state`、
   `registry`、`rig`、`renderSystem`、`environment`、`scene`、`sceneRoot`、`zones`、`zoneErrors`、`retryFailedZones()`、
   `applyQueryView()`、`countRenderables()`、`report()`（与 `?stats=1` 同一份数据）、`ready`、`whenReady`、
   `settle()`（把相机过渡推到终点并渲染一帧，供确定性截图）、`stats()`、`dispose()`。V2 走查可直接用它做断言，不必解析 DOM。

### 11.4 `?stats=1` 字段与 `scripts/audit.mjs` 的口径关系

**背景 / 雾的权威字段（t45 新增，t46 起为判据口径的唯一依据）**：

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `backgroundColorHex` | 清屏色（`scene.background`）的 **sRGB 显示空间**像素值（如月亮夜 `#171f2f`） | 8-bit 量化；**判据用它作背景引用**（§12.1.1） |
| `backgroundColorLinear` | 同一颜色的 **three 线性工作空间**数值 | **不可与像素值混用**（t41 教训） |
| `backgroundColorSpace` | 输出色彩空间（`srgb`） | — |
| `backgroundToneMapped` | `false` ⇒ 清屏色**不受曝光/色调映射影响** | 参数口径，不参与像素比较 |
| `backgroundRole` | 背景色角色（如 `skyNight` / `skyDusk` / `skyDay`） | 用于回显与复核 |
| `fogColorHex` / `fogNear` / `fogFar` | 雾色与雾距 | **雾与背景是两个量**；雾可完全覆盖背景（t44） ⇒ 被雾洗白的远景**属内容** |

> 机器可读入口：`?stats=1` 的 `<pre id="palace-stats-json">`；或 `window.__PALACE__.stats().environment.background`（含 `srgb255`/`linear`/`fog` 明细）。
> 工具消费：`scripts/shot.mjs` 用 `backgroundColorHex` 作背景引用（掩码 ±6），像素法仅作交叉校验并报 `Δ`。


`?stats=1` 写入 `<pre id="palace-stats-json">` 的 JSON = `window.__PALACE__.report()`（同一份数据，31 个字段）：

| 字段 | 来源 | 含义 / 口径 |
| --- | --- | --- |
| `mode` / `viewMode` / `projection` | `rig.mode` / `state.viewMode` / `rig.projection` | 相机装置当前模式、八视角之一、投影类型（`iso` = 正交） |
| `preset` / `quality` / `dpr` | `state` / renderer | 三时辰 id、质量档、**实际生效** DPR（`effectiveDpr()` 夹取后） |
| `viewport` | renderer | `"1440x900"` 形式的实际画布尺寸 |
| `frames` / `avgFps` / `p95FrameMs` | `renderSystem.recordFrame()` 窗口统计 | **浏览器实测**帧率与 P95 帧时长；headless+SwiftShader 下**不具代表性**，真实 GPU 需另测 ≥30s |
| `fullFrameDrawCalls` | `renderer.info.render.calls` | **整帧真实调用数**，含阴影 pass 与 EffectComposer pass（§8.2 要求与主场景分开回报） |
| `visibleTriangles` | `renderer.info.render.triangles` | 浏览器实际渲染的三角面（含阴影 pass 的重复绘制） |
| `mainSceneRenderables` | `main.js countRenderables(sceneRoot)` | 场景根下**可见** Mesh/Points/Line/Sprite 计数 = "主场景单次调用"的估算口径 |
| `geometries` / `textures` | `renderer.info.memory` | GPU 资源**对象计数**（`textures` 不是显存 MB） |
| `bloom` / `toneMapping` / `exposure` | renderer 质量档 | 后处理与色调映射是否生效 |
| `shadowMapSize` / `shadowCastingLights` | `environment.describe()` | 阴影贴图分辨率 / 投影主方向光数量（应为 1） |
| `lampAnchors` / `lampRealtime` / `lampActive` / `lampEmissiveIntensity` | `environment.describe()` | 灯位锚点总数（49）/ 实时点光池上限 / 当前激活数 / 远端发光材质强度 |
| `sunIntensity` / `ambientIntensity` / `hemiIntensity` | `environment.describe()` | 当前预设实际生效值（`?env=` 会改变本进程值） |
| `zones` / `buildings` | `registry.stats()` | 已装载区域 id 列表 / 已注册建筑数 |
| `ready` / `kitSource` | main.js | 是否已就绪；构件来源（`src/kit/index.js (t3)` 或 `fallback(greybox) — t3 的 src/kit/** 未就位`，**不得把灰盒当真实交付**） |

**与 `scripts/audit.mjs` 的口径关系（重要，别混着比）**：

| 量 | `?stats=1`（浏览器实测） | `scripts/audit.mjs`（Node 侧估计） |
| --- | --- | --- |
| 绘制调用 | `fullFrameDrawCalls` = `renderer.info.render.calls`（真实整帧，含阴影/后处理） | `drawCalls` = 场景图中可见可绘制对象数 × `geometry.groups` 数（`InstancedMesh` 计 1），**不做视锥剔除**，是"主场景单次调用"的确定性**上界估计**；另有 `shadowCalls` 单列与"按视角视锥剔除后"的口径 |
| 三角面 | `visibleTriangles` = `renderer.info.render.triangles`（含阴影重复绘制） | `triangles` = 几何索引数/3 求和（`InstancedMesh × count`，不含重复绘制） |
| 帧率 | `avgFps` / `p95FrameMs` 浏览器窗口统计（SwiftShader 下不可用） | **不产出**（真实帧率只能浏览器内测） |
| 视觉/亮度 | 无（需 PNG 解码，见 `scripts/shot.mjs` 与 `docs/shots/README.md`） | 无 |

结论：**两者不可直接比大小**；跨报告引用必须写明来源（`?stats=1` 浏览器实测 vs `audit.mjs` Node 上界估计）。
亮度/暗区/内容占比的唯一权威口径是 `scripts/shot.mjs` + `docs/shots/README.md`（最终帧缓冲，luma 定义与阈值均已写死）。
`?stats=1` 另可用于交叉校验：`mainSceneRenderables` 与 audit 的全量 `drawCalls` 同量级（audit 因乘 `groups` 会偏大）。

### 11.5 实现与任务卡的差异记录（以实现为准，供 V2 复核）

| # | 任务卡描述 | 实际实现 | 处置 |
| --- | --- | --- | --- |
| 1 | `?preset=<golden\|dusk\|night>` | 别名表更宽：同时接受全名 `goldenHour/sunset/moonlitNight` 与额外简写 `gold/moon`；**非法别名静默忽略且无 warn**（`?view` 非法会 warn） | 以实现为准；简写 `golden/dusk/night` 仍是稳定写法（截图与文档统一用它） |
| 2 | 只提 `?view=&preset=&ui=0&shot=1&stats=1` | 还实现 `?zone/?focus/?quality/?dpr/?greybox=0/?env=`（§11.1 附加表） | 一并冻结；`?env=` 明确标注为**诊断参数**，不属于产品规格 |
| 3 | "shot=1 → 提供可轮询就绪信号（DOM 标记或 window 标志）" | 实际同时提供**四种**（DOM 标记 + window 标志 + `whenReady` Promise + 装配完成标记 `__PALACE_LOADED__`），并带 `reason` 与 400ms 兜底 | 以实现的更严版本为准；`scripts/shot.mjs` 已按 `data-palace-ready="1"` 等待 |
| 4 | — | `?dpr=` 未做有限性校验：非数字 → `NaN`（报告里为 `null`） | **风险，t2 待修**（§11.1）；文档标注"必须传有限正数"，V2 若用 `?dpr=` 需先确认 |
| 5 | — | `?ui=0` 不隐藏 `?stats=1` 面板 | 有意行为，已写入 §11.3 注 3 |

### 11.6 本节的实测证据（2026-09-26，t17 复核）

本机 `chrome-headless-shell` + `--dump-dom`，URL `?view=iso&preset=night&ui=0&shot=1&stats=1&quality=medium&dpr=1`：

```text
data-palace-loaded="1"   ← 出现
data-palace-ready="1"    ← 出现
data-palace-ready-src="sync-frames"
#loading-layer ... hidden=""          ← ui=0 生效（加载层已隐藏）
#palace-stats-json 报告：31 个字段，dpr=1 · preset="moonlitNight"（night 别名归一） · viewMode="iso"
```

对照：`?dpr=abc` 时同一报告里 `dpr` 为 `null`（即 `NaN`）→ 印证 §11.1 的 `?dpr` 风险。
（本次探测受并行任务影响：`src/zones/*.js` 尚在写入，页面会打印区域装载失败；上述标记与报告字段不受影响。）

---

## 12. 三时辰可读性与过曝判据（引入 `v1.0.5`、`v1.0.6` 明确 `axis` 档位；现行契约 `CONTRACTS v1.0.7`）

> 依据：计划 §6.2「首屏呈现」、§6.3「昼景通过后再检查夕照和夜景」、§8.3「三个时辰都无明显过曝或不可读暗区」。
> **档位表可复算**：`node scripts/shot.mjs --classes`。
> 阈值与 `scripts/shot.mjs` 默认参数**一一对应**（改判据必须同时改本节与脚本默认值，并留修订记录）。
> 校准与 before/after 实测见 [`docs/report-night-calibration.md`](report-night-calibration.md)；本次修订的完整依据与未通过项见
> [`docs/handoff-config-1.0.3.md`](handoff-config-1.0.3.md)。

### 12.1 固定口径（保证跨报告可比）

| 项 | 值 |
| --- | --- |
| 视口 / DPR / 质量档 | `1440×900` / `1` / `medium` |
| URL 查询 | `?ui=0&shot=1`（纯画面；**不要**叠加 `stats=1`，见 §11.3 注 3） |
| 统计对象 | **最终帧缓冲**（含阴影 pass + Bloom/Output 后处理），即浏览器实际显示的那一帧 |
| `luma` | `0.2126·R + 0.7152·G + 0.0722·B`（sRGB 8bit 归一化到 0–1，**不做线性化**） |
| **内容掩码** | 排除**背景/天空**像素后的像素集合；分母 = 内容像素数（`content.pixels`）。背景色取**同一预设的 city 类视角**侦测结果并全批复用 |
| 背景侦测（严格） | 边框 8px 主色占比 ≥25% **且** 顶部 6 行该色占比 ≥50% **且** 该色 luma ≥0.03；**纯黑与暗区不得当作背景**（否则等于把"暗部"从分母里删掉＝变相放宽判据） |
| 容差 | `--content-tol`（默认 6/255） |
| 整帧数字 | **降为二级诊断**（`整帧(诊断)` 行；保留以便复核与跨报告对比） |
| 暗区 | `luma < 0.08`（`--dark-luma`） |
| 高光截断 | `luma > 0.9`（`--clip-luma`） |

**为什么改用内容掩码（t19 的原数字）**：整帧口径下夜景画面里"背景/天空"占 70%+（oblique 实测背景占 70.6%），
其亮度又恰好落在阈值附近，导致同一场景的暗区占比被背景**放大或稀释**：t19 报告里 `focus` 整帧暗区 24.92%、`fp` 26.05%
被判"不达 15%"，而 `orbit` 整帧 8.57% 却"通过"——两者都是同一批几何与光照，差别主要是背景占比。
改为内容掩码后（同一批图）：`focus` 28.95% / `fp` 26.05%（t26 加灯后 24.04% / 25.82%），`orbit` 8.37%；
数字更贴近"建筑本身有多暗"这件事。

**为什么不做"空场/地面"排除**：平滑的暗色地面与平滑的暗色墙面在像素上不可区分；把"大片平坦暗区"一律当非内容，
会同时把贴脸的暗墙体排除掉，**属于放宽判据**（本任务明令禁止）。因此本轮只排除**可严格判定**的背景/天空，
并在报告里同时给出内容掩码与整帧两组数字供 V2 复核。若 V2 需要更严的"空场"口径，必须先给出可判定的定义
（例如由 core 输出 stencil/depth 掩码——属 `src/core` 变更，需另行派单）。

### 12.1.1 背景引用：**权威背景色优先**（`CONTRACTS v1.0.8`，t46）

**背景 = 真正的天空区域**；且**以渲染侧上报的权威背景色为准**，不再依赖像素猜测：

| 优先级 | 来源 | 规则 |
| --- | --- | --- |
| 1（**唯一依据**） | **真天空掩码（`?stats=1` 的 `skyMaskPngBase64`，同一次 dump 取图）**：`?stats=1` 的 `backgroundDisplayedTopHex ↔ backgroundDisplayedHorizonHex`（t48；实机落屏的是天空网格顶点色渐变，**不是** `scene.background` 清屏色） | 掩码 = 像素到该带（RGB 线段）的最小距离 ≤ `--content-tol`(6)；带端点一并记录 |
| 1b（**交叉校验**） | 落屏天空带 `backgroundDisplayedTopHex↔HorizonHex` | 与掩码并列报告；**差超容差即告警**（Δ 监控）；不得作为唯一依据 |
| 1b（**仅参考**） | `backgroundColorHex` = 配置清屏色 | **不得**作为掩码依据；仅用于 **Δ 监控**（`backgroundDeltaMaxAbs`）：Δ > 容差 ⇒ 输出显式告警 |
| 2 | 像素法（t44 sky-only：顶部 10% 平坦种子 → 泛洪 → 占比/色散/漂移校验） | 仅当**权威字段缺失**时使用 |
| — | **交叉校验（必报）** | 存在权威色时，同时输出像素法找到的背景色与内容/暗区，并报告 `Δ = max|Δrgb|`；`Δ > 8` ⇒ 打印「与权威不一致（像素法可能失效）」 |

> **t46 开放项已关闭（`CONTRACTS v1.0.9`，t49）**：t46 曾以配置清屏色为引用（Δ=15），导致 `fp` 把约 23% 的夜空算成内容（26.52%，反向失真）。
> 最终处理：**引用改用落屏天空带**（`#0d1526↔#1b2333`，容差取 §12.1 的 6），配置色只作参考并纳入 **Δ 监控**（Δ=10 > 6 ⇒ 显式告警）。
> 复算 `fp`（夜）：**内容 56.3%、暗区 5.95% ≤ 30% ⇒ PASS**（配置色口径 26.52% → 落屏带口径 5.95%；与 t44 像素法 2.39% 的余差来自色带按线段覆盖了像素法未覆盖的渐变过渡像素，两者均 PASS）。
> 该口径自此**不再依赖像素猜测**：引用值全部来自渲染侧上报。

> **§12.1.1 定稿（`CONTRACTS v1.0.10`，t57 实测）**：判据优先级 = **真天空掩码（唯一依据）> band > 像素法**，三者并列、必报差、超容差告警。
> **F2 的确凿机制（t51/t52 两轮实证）**：`config.moonlitNight.fogColorRole='fogNight'` ⇒ `COLORS_DERIVED.fogNight = #1b2333`，与 t50 落屏天空带**下端色逐字节相同** ⇒ 任何“与带匹配”的阈值必然把雾洗白几何判成天空（直接违反 t44 规则），这就是 band 口径让 `oblique/night` 内容占比塌到 12.3%、暗区虚高到 **19.82% FAIL** 的原因。
> **掩码为何能根除**：掩码来自渲染侧**几何图层信号**（白天空/黑几何），**零颜色阈值**、与雾/夜空是否同色无关；且 t56 把它放进同一次 `?stats=1` 报告 ⇒ 位姿同源、无跨加载半帧。
> **t57 实测（oblique/night，CONFIG 1.0.6）**：`skyMaskPngShareByColor：白 0.69964 / 黑 0.30036，skyShare=0.69914 ⇒ 天空=白`，掩码图**唯一色 2、纯度 100%** ⇒ 判据行 **PASS**（内容均值 0.154、内容暗区 **10.36% ≤ 15%**、clip 0.00%）；band 口径同图 19.82% FAIL、整帧 2.88%（仅诊断）。

**「无天空视角」正式口径**：若**权威背景色在画面中占比 < 0.5%**（`--no-sky-share`，默认 0.005），
则判定该机位**看不到天空** ⇒ **整帧即内容**（阈值、分类**一律不变**），且输出必须标注依据：
`ℹ️ 无天空视角（正式口径）：权威背景 rgb(…) role=… 在画面中仅占 X% < 0.5% ⇒ 整帧即内容`。
**禁止**用 `--allow-no-sky` 静默退回整帧（那是规避，不是口径）；`--allow-no-sky` 仅保留给「没有权威字段且像素法也找不到天空」的兜底场景。

> 理由：背景识别口径 t39 → t41 → t44 连续三次导致结论翻转（像素无法区分"填满顶部的均匀雾"与天空）。
> 渲染器本身知道 `scene.background`，让工具猜是设计缺陷；`CONFIG 1.0.6` 下的 `fp`（夜）即为例证：
> 权威色 `#171f2f`、画面占比 5.16% ⇒ 内容 94.8%、**暗区 26.52% ≤30% PASS**；而像素法把 `rgb(8,16,34)`（Δ=15，非清屏色）当天空 ⇒ 2.39%（**偏乐观**）。
> 两种读法都 PASS，但**语义以权威口径为准**；`Δ=15` 的不一致已作为开放项登记（见 `docs/handoff-shot-mask-nosky.md`）。

### 12.2 判据阈值（按视角类别分档）

| 类别 | 适用视角 | 内容均值 | **内容暗区** | 内容高光截断 |
| --- | --- | --- | --- | --- |
| **俯瞰/环绕类** | `oblique`、`iso`、`orbit`、`zone` | ≥ 0.10（`--city-min-luma`） | **≤ 15%**（`--city-max-dark`） | ≤ 5%（`--clip-max`） |
| **低空/近景类** | `focus`、`fp`、`interior`、**`axis`** | ≥ 0.10；`interior` ≥ 0.04（`--interior-min-luma`） | **≤ 30%**（`--near-max-dark`） | ≤ 5% |
| 三时辰通用（过曝） | 全部 | 整帧均值 ≤ 0.75 **仅诊断**（`--diag-max-mean`） | — | **主判据：内容高光截断 ≤ 5%** |

**分档理由（原数字）**：夜景近景/内景的深阴影是**预期**而不是缺陷——金銮殿金砖 `#1a1917`、檐下、贴脸立面在夜景里必然偏暗；
用同一个 15% 门槛判 `focus`/`fp`/`interior` 等于逼实现方"删阴影"或把全局亮度提到不像夜晚。因此近景类放宽到 30%
（仍有硬约束：均值 ≥0.10、截断 ≤5%）。

**`axis` 为何属低空/近景类（`CONTRACTS v1.0.6`，t34 主理人裁定）**：`axis`（中轴透视）是**低空贴地序列机位**——沿中轴线在低空
向北推进，视点接近地面高度，画面里大部分像素是**暗铺地与暗屋面**，而不是俯瞰视角下的整城轮廓。它在"视线高度、画面内容构成、
深阴影占比"三方面都与 `focus`/`fp`/`interior` 同类，与 `oblique`/`iso`/`orbit`（高位俯瞰/环绕）不同类。
**这不是"不达标就改分类"**：`v1.0.5` 只写了"按类别分档"而**未指定 `axis` 属哪一档**（原文把"中轴"与俯瞰类并列，属契约歧义）；
本版按机位性质**明确档位**，并把两个类别改名为语义更准确的"俯瞰/环绕类"与"低空/近景类"。
判据阈值本身**未放宽**（15% / 30% / 5% 与 clip 主判据不变），档位表可由 `node scripts/shot.mjs --classes` 复算。

**过曝改按高光截断（原数字）**：`goldenHour` 全城机位实测整帧均值 **0.6654**、高光截断 **0.00%**、暗区 0.80%，
却因"整帧均值 > 0.6"被判过曝——这是口径错误（天空占比 70%+ 把均值推高，而画面并无截断）。
现改为：**高光截断 ≤5% 为主判据**，整帧均值降为诊断（≤0.75 提示），`goldenHour` 据此**不构成过曝**。

### 12.3 阈值与 `scripts/shot.mjs` 参数映射（默认值即判据）

| `scripts/shot.mjs` 参数 | 默认 | 对应本节 |
| --- | --- | --- |
| `--dark-luma` | `0.08` | 暗区定义 |
| `--clip-luma` | `0.9` | 高光截断定义 |
| `--content-tol` | `6` | 背景/天空掩码容差 |
| `--city-max-dark` | `0.15` | **俯瞰/环绕类**（`oblique`/`iso`/`orbit`/`zone`）的**内容**暗区上限 |
| `--near-max-dark` | `0.30` | **低空/近景类**（`focus`/`fp`/`interior`/`axis`）的**内容**暗区上限 |
| `--city-min-luma` | `0.10` | 全城/近景类内容均值下限 |
| `--interior-min-luma` | `0.04` | 内景内容均值下限 |
| `--clip-max` | `0.05` | **过曝主判据**（内容高光截断上限） |
| `--diag-max-mean` | `0.75` | 整帧均值诊断线（不决定通过与否） |
| `--min-bytes` | `20000` | 「不得近黑」的空白阈值 |

### 12.4 校准记录（`CONFIG 1.0.2` → `CONFIG 1.0.3`，t26）

| 值 | 1.0.2 | 1.0.3 | 依据（实测） |
| --- | --- | --- | --- |
| `LIGHTING.lamps.intensity` | 12（逐值 pin） | **18（下限 ≥12）** | 为 `focus`/`fp` 建立余量；内景 12/46 时暗区 72.90% |
| `LIGHTING.lamps.distance` | 46（逐值 pin） | **60（下限 ≥46）** | 同上 |
| `LIGHTING.lamps.decay` | 2 | **1** | `decay=2` 时 10m 外照度仅 1/100，室内无法照亮（内景夜 72.90% → **1.44%**） |
| `goldenHour.lampIntensityScale` | 0 | **0.45** | 日间内景补光通道：日景下原本"已激活实时灯 = 0" |
| `sunset.lampIntensityScale` | 0.35 | **0.6** | 夕照内景补光 |
| `QUALITY.tiers.medium.maxRealtimeLights` | 4 | **6** | 仍 ≤ `LIGHTING.lamps.maxRealtimePointLights = 8`（§8.2 硬约束不变） |
| 硬约束（不变） | — | 实时灯 ≤8、宫灯不投影、仅 1 盏主方向光投影 | §8.2 |

**通过情况（t26 内容掩码实测 + t34 档位明确后）**：夜景 `oblique` 3.57%、`iso` 1.34%、`orbit` 8.37%（俯瞰/环绕类 ≤15%），
`axis` **29.31%**、`focus` 24.04%、`fp` 25.82%、`interior` 1.44%（低空/近景类 ≤30%）——**八个夜景视角全部通过**。

**仍不通过项（如实登记，未放宽判据、未删视角）**：**日/夕内景**：`interior B golden` 66.03%、`B dusk` 48.96%、
`C golden` 56.05%、`C dusk` 53.52%、`C night` 40.77%（均 > 30%）——根因是 kit 的隔扇窗**不透光** + 金砖基色极暗，
室内拿不到日光；最小修法属 kit 侧（可透光/自发光窗扇 + 殿堂内补光灯位），详见 `docs/handoff-config-1.0.3.md`
与 `docs/handoff-criteria-sync.md`。
