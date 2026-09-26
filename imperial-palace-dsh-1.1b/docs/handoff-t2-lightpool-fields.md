# handoff · T2.25 灯位池逐灯清单直读：`describe().lamps.pool`（t95）

任务：`t95`（repair，attempt 1）· 执行者：core-engineer（attempt_id `7ad907db-8097-4d1c-aeca-f59a17e95ef2`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope（已严格遵守）：`src/core/environment.js`、`tests/core-environment.test.mjs`、本回执。
**未触碰** `src/main.js`（归 t14）、`src/shared/**`、`src/kit/**`、`src/zones/**`、`src/ui/**`、`src/interaction/**`、`scripts/audit.mjs`。

---

## 1. 动机（t94 F12）：从"复算交叉校验"升级为"**直接读数**"

t94 只能做到 *真实计数 + 真实输入复算*（它如实标注了"不是直接读数"）：它能算出"若按 t90 的口径排序，池内 #1–#2 应是南/北城门的室内灯"，但**读不到**实际入选清单——
因为 `updateLampSelection()` 里构造的 `pool` 是**局部变量**，函数返回即丢弃，`?stats=1` 只有 4 个计数字段（无逐灯清单）。
本卡把池保留下来并暴露成可直读的清单，**下游（t66/验收/排障）无需再复算**。

## 2. 交付（`src/core/environment.js`）

| 位置 | 内容 |
| --- | --- |
| `lampState` | 新增 `pool: []`（最近一次入选池，直接读数） |
| `updateLampSelection()` | 选池后写 `lampState.pool = pool.map((r,i) => ({rank:i+1, id, role, distance(3位小数), score(**全精度**)}))`；**无灯位/无实时名额时把池清空**（避免读到上一帧的陈旧清单） |
| `describe().lamps` | **新增** `pool`（top-`capacity` 逐灯清单）、`capacity`（= `realtimeLights.length`，真机容量）、`qualityTier`、`preset`；**既有字段一个未删**（`anchors` / `realtime` / `active` / `emissiveOnly` / `emissiveIntensity` / `maxRealtimePointLights` / `poolByQuality` 原样保留） |

字段形状（每项）：`{ rank, id, role, distance, score }`，`rank` 从 1 递增、按 `score` 降序（与 `rankLampPool()` 同源）。

## 3. 真实浏览器内直读输出（`window.__PALACE__.environment.describe().lamps.pool`）

命令（单页加载 + CDP 直读；两种城门各一次独立加载）：
```text
index.html?interior=F-gate-south&preset=night&ui=0&shot=1&stats=1   与   …interior=F-gate-north…
```

**南城门内景**（机位 `VP-F-gate-south-interior`，mode=interior，preset=moonlitNight）：
```text
容量=6 · 已激活=6 · 灯位总数=152
#1 LA-F-int-F-gate-south-1          role=windowGlow            d= 16.441m score=0.511588
#2 LA-F-int-F-gate-south-2          role=windowGlow            d= 20.492m score=0.492549
#3 LA-001                           role=axisLantern           d= 69.545m score=0.426718
#4 LA-002                           role=axisLantern           d= 69.545m score=0.426718
#5 LA-B-interior-gate-front-xa      role=gardenOrCourtLantern  d= 73.908m score=0.278072
#6 LA-B-interior-gate-front-xb      role=gardenOrCourtLantern  d= 73.908m score=0.278072
```
**北城门内景**（机位 `VP-F-gate-north-interior`，同参数）：
```text
容量=6 · 已激活=6 · 灯位总数=152
#1 LA-F-int-F-gate-north-1          role=windowGlow            d= 15.055m score=0.517423
#2 LA-F-int-F-gate-north-2          role=windowGlow            d= 19.397m score=0.497956
#3 LA-F-int-F-garden-hall-north-1   role=windowGlow            d= 54.892m score=0.299404
#4 LA-F-int-F-garden-hall-north-2   role=windowGlow            d= 54.892m score=0.299404
#5 LA-041                           role=gardenOrCourtLantern  d= 72.960m score=0.282411
#6 LA-042                           role=gardenOrCourtLantern  d= 74.592m score=0.274990
```
**结论（直接读数，非复算）**：两个城门内景的 **#1–#2 就是 t94 预言的 `LA-F-int-F-gate-south-1/2` 与 `LA-F-int-F-gate-north-1/2`**（14–21m 的 `windowGlow`），
且 70m 级的 `axisLantern` 被压到 #3 之后（t90 的距离感知在真实浏览器里生效）；池容量 6 = 该时辰/质量档的真机容量（见 §5）。

> 探针备注（如实）：起初我在**同一页面内**用 `view:request-mode` 从南门切到北门后立即读池，读到的仍是南门的机位与池（`rig.describe().interiorViewpointId` 未更新）⇒ 那次是**探针时序**问题（请求尚未在相机上生效就读了池），随后改为**独立加载北门**得到上表。批量工具若要 in-page 切换，建议**先等 `rig.describe().interiorViewpointId` 变为目标再读池**。

## 4. 回归（断言只增不减）

```text
$ node tests/core-environment.test.mjs → exit=0 · 通过 7 / 7（t95 前 5/5；新增 2 用例）
   · 逐灯清单可直读：rank 升序 1..N、字段齐全、`score === lampScore(role, 精确距离)`（全精度）、`distance` 与机位重算一致（≤5mm）、按 score 降序、`active === pool.length`
   · 近处室内灯直取 #1–#2（夹具：机位附近只有 ≥90m 中轴灯 + 两盏 15m 室内灯）
   · 无灯位时池清空：`pool=[]`（不残留上一帧）
$ node scripts/audit.mjs → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）；主场景 333/350 ✓
```
**未放宽任何判据**：`LIGHTING.lamps.*`（8/60/120/18/1）、`ROLE_IMPORTANCE`、§12 阈值、池容量与距离上限一概未动。

## 5. 容量基线并列（t94 真机 vs t90 假设）

| 口径 | 数值 | 出处/原因 |
| --- | --- | --- |
| t90 假设（Node 夹具） | **8** | `LIGHTING.lamps.maxRealtimePointLights = 8`，且 Node 夹具默认质量档 `high` ⇒ `QUALITY.tiers.high.maxRealtimeLights = 8` ⇒ `realtimeLights.length = 8`、池可容 8 |
| t94 真机实测 | **golden 3 / dusk 4 / night 6** | 真机默认质量档为 `medium`（`QUALITY.tiers.medium.maxRealtimeLights = 6`） |
| 本卡浏览器直读 | **capacity = 6**（`qualityTier=medium`、`preset=moonlitNight`、`active=6`） | 与 t94 一致 |

**真实容量由什么决定**（代码路径，`src/core/environment.js`）：
```js
const tierMax = Math.min(config.LIGHTING.lamps.maxRealtimePointLights /*8*/, config.QUALITY.tiers[applied.quality].maxRealtimeLights /*mid=6*/);
const want = scale <= 0.02 ? 0 : Math.max(1, Math.round(tierMax * Math.min(1, scale)));   // scale = preset.lampIntensityScale
if (want !== realtimeLights.length) buildRealtimeLights(want);                            // ← 真正的"容量"
```
即 **容量 = round(min(8, 质量档上限) × 该时辰 `lampIntensityScale`)**：
`medium`(6) × golden `0.45` = **3**、× sunset `0.6` = **4**、× night `1.0` = **6** ⇒ 与 t94 的 3/4/6 **逐值吻合**；
`high`(8) 档下 night 会得到 8（即 t90 夹具的口径）。两个数字都保留、并不矛盾：**8 是配置上限，3/4/6 是真机默认（medium）容量**。

## 6. 交回：`compactReport` 转发补丁（供 **t14** 落地；本卡不改 `src/main.js`）

`main.js` 现在的 `compactReport()`（`src/main.js:474` 起，函数体内已取 `const s = renderSystem.getStats();`/`env`/`r`）已含 `lamps` 相关字段（`lampAnchors` 等在 kickoff 附近）。
建议**精确补丁**（`src/main.js`，`compactReport()` 的返回对象里，紧接现有灯位计数 `src/main.js:527-530`（`lampAnchors`/`lampRealtime`/`lampActive`/`lampEmissiveIntensity`）之后追加）：

```js
      // t95（转交 t14）：灯位池逐灯清单直读 —— 与 environment.describe().lamps.pool 同口径
      lampCapacity: env.lamps?.capacity ?? null,
      lampQualityTier: env.lamps?.qualityTier ?? null,
      lampPreset: env.lamps?.preset ?? null,
      lampsPoolTop8: (env.lamps?.pool ?? []).slice(0, 8),
```
（映射：`compactReport()` 内已有 `const env = environment.describe();`；字段名沿用既有 camelCase 风格；`lampsPoolTop8` 每项为 `{rank,id,role,distance,score}`。）
如需**只报 id** 的紧凑口径，可改为 `lampsPoolIds: (env.lamps?.pool ?? []).map((x) => x.id)`；无论哪种，`pool` 本身已在 `describe()` 里可直接读，报告只是转发。

## 7. 未验证项 / 已知限制

1. **`?stats=1` 的 DOM 报告尚未带该字段**（补丁见 §6，归 t14）；当前"直接读数"的路径是 `window.__PALACE__.environment.describe().lamps.pool`（本卡已在真实浏览器内验证可读）。
2. **只覆盖 night 时辰**的真实浏览器读取（南/北城门各一次）；三时辰的容量差异已由 §5 的代码路径 + Node 用例覆盖（`capacity=6` @ medium/night），未逐时辰出浏览器读数。
3. **in-page 切换时序**：同一页面内切换机位后需等 `describe().interiorViewpointId` 更新再读池（见 §3 备注）；独立加载无此问题。
4. **池内每项 `distance` 保留 3 位小数**（`score` 全精度）：消费者若要用 `distance` 反算 `score`，请按 ≤1e-5 容差，或直接用清单里的 `score`。
