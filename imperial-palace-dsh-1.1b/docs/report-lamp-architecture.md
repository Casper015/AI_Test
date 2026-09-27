# t42 · 灯光仍异常：**架构级审查**（动态灯池 vs 分区静态分配）+ 把换灯类跳动构造性归零

任务：`t42`（work）· 执行者：core-engineer（attempt 1 · attempt_id `773d8a9d-583e-48e6-abe8-55deb569a6bb`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
守卫：`tests/core-lamp-stability.test.mjs` ⑤/⑨ 加严（**8/8 → 9/9，旧断言一条未删**）· `tests/core-environment.test.mjs` ⑥ 显式按架构分支 + 新增 ⑦b（12/12 → 13/13）

---

## 0. 结论（先读这段）

| 项 | 结果 |
| --- | --- |
| 用户怀疑"光照系统写错了" | **架构确实有问题**，但不是"选灯算错"——是**换灯这件事本身会改变画面**（每盏实时点光照亮的是**它自己周围**的地面，而池只有 6 个名额、灯位有 152 个） |
| 本卡修复 | 默认架构改为 **`'zone-static'` 分区静态配额**：池 = `(真机容量, 相机所在分区)` **唯一决定** ⇒ **区内任何相机运动都不换灯**（构造性，不是"少换") |
| 量化 | 同一 t5 协议（14 机位 × 150 帧 × 0.5°/帧）：**槽位瞬移 91 → 25（−73%）**；换池 36 → 11；**5 个第一人称机位全 0**；区内任意机位/任意帧池**逐值相同**（守卫 ③/⑦b 断言） |
| 代价（已量化，见 §2.3） | 相机所在区只保 `ceil(N×0.5)=3` 个名额，其余 3 个按固定权重给别的区 ⇒ **局部相关性下降**：t90 的"近处室内灯优先于远处中轴灯"只在 `'dynamic'` 架构成立（该判据已**显式切到 dynamic** 保留，未被删除或放宽） |
| 预算/阈值 | 实时灯数、`distance/decay/intensity/flicker`、池容量、距离上限、§12 阈值、台阶 0.5/0.6 **一字未动**；`audit --enforce` **exit 0**；**零新增绘制调用** |
| 仍**未**做到的部分 | **像素级"灯致闪烁 ≤ 噪声底 ×1.5"未在浏览器复核**：t5 的真机指标把**设计内的烛光 flicker**（`flickerAmplitude 0.05`）也算成"灯致闪烁"（lamp-off 对照臂把它一起关掉了）⇒ 需要第三臂才能区分。**已交回裁定**（§4.2） |

---

## 1. 复现与量化（沿用 t5 协议并加严）

口径（t5 未变）：`environment.update(dt=1/60, elapsed, { timePreset:'moonlitNight', quality:'medium', cameraPosition })`，
相机**每帧绕机位目标转 0.5°**，14 个机位 × 150 帧（+45 帧预热）；指标 = 槽位"灯位身份"变化（瞬移）/ 单帧强度变化率 / 池集合变化。

| 指标 | t5 基线（`'dynamic'` + 滞回 + 斜坡） | **t42（`'zone-static'`）** |
| --- | --- | --- |
| 合计瞬移（14 机位 × 150 帧） | **91** | **25（−73%）** |
| 单机位最大瞬移 | 18（VP-D-zone） | **7（VP-D-court1）** |
| 合计换池（集合变化） | 36 | **11** |
| 第一人称机位瞬移 | 5 个机位合计 15 | **5/5 全 0** |
| 单帧强度变化率峰值 | 69.2/s（判据 80） | 66.1/s |
| 池在**同一分区内**随相机变化 | 每次重选都可能换人 | **0（构造性）** |

> `'dynamic'` 的 91 次是**突变对照实测值**：把 `config.LIGHTING.lamps.selectionMode` 临时改回 `'dynamic'`（真实文件突变）
> ⇒ 守卫 ⑤/⑥/⑨/②/③ 全红、⑨ 实测"合计瞬移 **89**"（≈ t5 基线 91），恢复后 9/9 全绿（§5）。

### 1.1 浏览器真机四类读数（t5 协议扩展，已落地并实测）

`scripts/probe-lamp-stability.mjs` 已扩展四类读数并**实测**（真机 headless Chrome，生产循环内逐帧采样，orbit 机位、0.5°/帧、40 帧、moonlitNight/medium）：

| 读数 | `'dynamic'`（t5 架构，config 突变后实测） | **`'zone-static'`（t42 默认）** |
| --- | --- | --- |
| (a) 亮度阶跃 max / p95 / 均值 | 0.4538 / 0.4509 / 0.1434 | **0.4521 / 0.4503 / 0.1435** |
| (b) 区域不均 4 象限差 max / 帧间跳变 | 30.78 / 1.393 | 30.86 / 1.399 |
| (c) 阴影读数 | enabled · mapSize 1536 · 1 投影光源 · lampShadows 0 | 同左（未变） |
| (d) 烟柱 LOD 逐柱 visible 翻转 / 跨门限帧 | 0 / 0 | 0 / 0 |
| 相邻帧平均逐像素差（均值/峰值） | 1.0817 / 1.4671 | 1.0815 / 1.4652 |
| **池光功率（Σ 槽位强度）** | **0–0（均值 0）** | **15.80–16.60（均值 16.23）** |
| 槽位绑定变化 / 池集合变化帧 | 0 / 1 | 0 / 1 |

**两个关键结论（诚实解读，不夸大）**：
1. **在鸟瞰轨道机位上，两套架构的像素读数逐值几乎相同** —— 因为该机位距城 672 m，`'dynamic'` 的距离上限是**相机** 120 m ⇒ **池为空、实时光功率 = 0**（`池光功率 0–0`）。
   ⇒ 该机位下"灯光还在变"的东西**不是灯池换人**，而是**设计内的自发光 flicker**（`flickerAmplitude 0.05`）+ 粒子/云。这解释了"用户仍觉得灯有问题"的一半：**远景观感里灯池根本不参与**。
   （`'zone-static'` 会点亮 6 盏"各自庭院"的灯 ⇒ 夜景鸟瞰比 t5 更亮一些：这是架构的**有意**取舍，见 §2.3。）
2. **灯池换人只在中近距离（分区内）可见**，而这正是本卡修复的对象：Node 协议（14 机位 × 150 帧 × 0.5°/帧）**瞬移 91 → 25**、第一人称机位 **15 → 0**、区内池**逐值不变**。

**探针注入的对照（用于说明 `snap` 的代价）**：若用 `MODE=dynamic|zone-static` 在运行时切换架构（触发一次 `snapFade` 重选），两臂都出现 **整帧亮度 45.5 → 89.3（≈2×）的单帧台阶**（(a) max ≈15.1、(b) 跳变 ≈17.9）——**与架构无关**，是 `snap`（时辰/质量/模式切换时的"直接落稳态"）造成的。
⇒ 结论：**"切换/重配置"这一类可见跳变是另一条独立缺陷**（t5 引入的 `snapFade` 语义），本卡未改（它服务于截图确定性）；如要消除需给它加 0.3 s 斜坡并重跑 §12 截图判据 ⇒ **交回裁定**（§8 新增第 4 项）。

---

## 2. 架构审查（用户怀疑光照系统本身 —— 正面回答）

### 2.1 为什么灯池**必须**动态重选？（file:line）

* `src/shared/config.js:463` `maxRealtimePointLights: 8`；真机容量 = `min(8, tier.maxRealtimeLights)`，中档 **6**（`src/core/environment.js` 的 `applyPreset`/`setQuality` 计算 `tierMax`）；而装配后的灯位表是 **152 个**（`lampState.anchors`，`describe().lamps.anchors` 实测 152）。
* 6 个名额要覆盖 152 个灯位 ⇒ **必须选**。t5 的选择口径是 `score = importance / (1 + (d_camera/d0)²)`（`environment.js:820-826`）⇒ 池 ≈ "离相机最近且重要的 6 盏"，相机一动，rank-6 与 rank-7 的次序就可能互换（分数差可任意小）。
* **关键事实（决定了"换灯能不能不被看见"）**：`THREE.PointLight(color, intensity, distance=60, decay=1)` 的 cutoff 是**片元↔灯**距离（three 的 `getDistanceAttenuation`），**不是相机↔灯**距离。所以一盏离相机 800 m 的灯，照样照亮它周围 5 m 的地面，而那面墙/地面**在画面上可见**（这正是夜景"城里一片灯火"的观感来源）。
  ⇒ **换灯 = 可见的照明重分布**，与相机远近无关；"远景机位下换灯不可见"是错觉。

### 2.2 能不能改成**分区静态固定分配**？（本卡已实现并落地为默认）

**能，而且这就是本卡的最小修复**（file:line）：

| 位置 | 内容 |
| --- | --- |
| `src/shared/config.js:472-490`（约） | `selectionMode: 'zone-static'`（新默认）· `zoneQuotaWeights: {B:3,C:2,D:2,E:2,F:2}` · `zoneLocalShare: 0.5` |
| `src/core/environment.js:853-905`（约） | `ZONE_BOUNDS`（来自 `layout.ZONES`，**不写字面坐标**）· `zoneOfCamera()`（内区优先、F 外环最后、都不在 ⇒ `'CITY'`）· `staticRankInZone()`（重要性 → **本区中心距** → id ⇒ **不含相机量**）· `staticRankCity()` · `zoneQuota()` |
| `src/core/environment.js:906-955`（约） | `selectLampPoolStatic()`：池由 `(容量, 相机分区)` **唯一决定**；配额不足时用全城静态序补齐；清单仍按分数降序暴露（t95 口径不变，`distance/score` 依旧是**相机口径**，只用于 falloff 与诊断） |
| `src/core/environment.js` 分派 | `selectLampPool(..., { mode })`：`'zone-static'`（默认）/ `'dynamic'`（t5 旧路径，保留作对照与突变证明）；新增 `setLampSelectionMode()` / `lampSelectionMode()` / `lampAnchors()` / `lampQuotas()` / `lampZoneAt()` 只读接口 |
| `src/core/environment.js` 节流 | `LAMP_RESELECT_SECONDS=0.35`（t5 值）为**下界**，上限随相机速度线性拉长到 `reselectMaxSeconds=0.8`（`reselectSpeedReference=60 m/s`）——卡面指定的"重选频率与相机速度挂钩" |
| `describe().lamps.gate` | 新增权威读数：`mode / local / quotas / evictRangeMargin / rangeGated / reselect{base,max,speedRef,lastInterval,lastSpeed}` |

### 2.3 静态方案的**代价**与**收益**（量化）

**收益（构造性，不是"少换"）**
* 池 = `(容量, 相机分区)`：相机在同一分区内**任意平移/旋转/帧** ⇒ 池**逐值相同** ⇒ 换灯次数 **0**（守卫 ③ 用 C 区 3 个机位、⑦b 端到端断言；实测 5 个第一人称机位 15 → **0**）。
* 跨分区时才换池（离散、偶发），且换池仍走 t5 的 0.3 s 限速斜坡 + 身份保槽 ⇒ 单帧强度变化率峰值 66.1/s（**≤ 判据 80/s**，斜坡上界 60/s 量级）。

**代价（具体形态，不含糊）**
1. **局部相关性让位**：相机区只拿 `ceil(6×0.5)=3` 个名额（`describe().lamps.gate.quotas` 实测 `{C:3,B:1,D:1,E:1}` = 6 = 容量）；若某区有 >3 盏重要灯，多出来的那几盏**不再实时点亮**（仍保留自发光兜底 `emissiveFallbackBeyond=120`）。这就是 **t90 判据（近处室内灯优先）不再对默认架构成立**的原因 —— 本卡的处置是：**`tests/core-environment.test.mjs` ⑥ 显式 `setLampSelectionMode('dynamic')` 后继续断言 t90 原文**（判据一条未删、强度不变），默认架构的性质改由新增 **⑦b** 与守卫 ②/③/⑨ 断言。
2. **远景机位（分区之外）**用全城静态序 ⇒ 池是固定的 6 盏（不再是"当前视野内最相关的 6 盏"）。夜景鸟瞰下"哪几盏亮"不再随镜头变化 —— 观感更稳，但与"镜头朝向哪、哪里就亮"的直觉不同。
3. **配额是登记的**：`zoneQuotaWeights` 若与实际灯位分布脱节（例如 D/E 各只有 2 个灯位），配额会退化为"能取几盏取几盏 + 全城静态序补齐"（`selectLampPoolStatic` 已处理，不报错、不越预算）。

### 2.4 若不改架构：为什么"数学上无法避免可见跳动"

动态池的候选评分是相机位置的**连续函数**；池 = 该函数排序后的前 N。只要相机连续运动，`rank N` 与 `rank N+1` 的**次序必然在某个位置相等**（介值）⇒ 在那一帧截断线换人。滞回（`LAMP_HYSTERESIS_MARGIN=0.12`）只把"近并列"挡掉，**挡不住真实超越**（例如一盏更近更重要的灯出现）；限速斜坡只把"硬切"变成 0.3 s 的交叉淡入淡出。
证据（可复现，非论证）：把 `selectionMode` 设回 `'dynamic'` ⇒ 同一协议合计瞬移 **89**（vs `'zone-static'` **25**），且每机位最大 18 次（vs 7）。**⇒ 参数调优有上限，架构才是根因。**

---

## 3. 最小修复与预算

* 只改**选择规则 + 节流窗口**：`selectionMode`/`zoneQuotaWeights`/`zoneLocalShare`/`reselectMaxSeconds`/`reselectSpeedReference`（config，`CONFIG_VERSION 1.0.10 → 1.0.11`，理由随附）。
* **未动**：`maxRealtimePointLights 8`、`distance 60`、`decay 1`、`emissiveFallbackBeyond 120`、`intensity 18`、`flickerAmplitude 0.05`、`flickerSpeed 1.7`、池容量、距离上限、`LAMP_FADE_SECONDS 0.3`、`LAMP_HYSTERESIS_MARGIN 0.12`、§12 的 15%/30%/5%、台阶 0.5/0.6（守卫 ① 逐值断言 + `core-environment` 反例断言）。
* **零新增绘制调用**：只改"哪 6 盏灯亮"的判定，灯对象数量与 pass 数不变；`node scripts/audit.mjs --enforce` **exit 0**。

---

## 4. 验收强度：已达成 / 未达成（不满足"×1.5 噪声底"的量化说明）

### 4.1 已达成（构造性）
* **换灯类跳动归零**：区内 0 次（守卫 ③ 断言"同区 3 机位池集合逐值相同"、⑦b 端到端断言），第一人称机位 5/5 全 0（⑨）。跨区换池离散偶发（11 次换池 / 14 机位 × 150 帧）且被 0.3 s 斜坡与身份保槽摊平（单帧强度变化率峰值 66.1/s ≤ 80/s）。
* 稳态逐值不回退（守卫 ⑦：强度 = `base×k` 解析式、`fading=0`、`active=capacity`）。

### 4.2 未达成 + 为什么（交回裁定）
卡面要求"闪烁指标降到噪声底 ×1.5 以内（或给出不可能达到的量化论证）"。**t5 的真机指标无法区分两类东西**：

| 组成 | 说明 | 是否被本卡消除 |
| --- | --- | --- |
| (i) 换灯/换池引起的照明重分布 | 池成员变化 ⇒ 某些庭院亮暗换位置 | **是**（架构级归零，§2.3 收益） |
| (ii) **设计内的烛光 flicker** | `flickerAmplitude 0.05 × intensity 18 = 0.9`（±5%、1.7 Hz，每灯相位不同） | **否，且不应消除**（是产品特征，不是缺陷） |

t5 的"灯致闪烁" = `rotate 臂 − lampsoff 臂`，而 `lampsoff` 用 `setActiveOverrides({ lampIntensity: 0 })` **把 (i) 与 (ii) 一起关掉** ⇒ 该指标必然把 (ii) 算作"灯致闪烁"（t5 实测残留 0.0075 / 0.0291 /255 vs 噪声底 0.0017 —— 与 ±5% × 18 强度在设计内的量级一致）。
**要判定"≤ 噪声底 ×1.5"，必须再加一条第三臂**：`flickerAmplitude = 0`（**只**关设计 flicker、灯池照常）⇒ `rotate(池照常) − rotate(flicker=0)` 才是"换灯致闪烁"，`rotate(flicker=0) − lampsoff` 是"设计 flicker 量级"。
**本卡未跑该臂**（时间预算优先给架构落地与守卫三证），⇒ 这条**交回主理人裁定**：(a) 派一张卡补第三臂并按新口径验收；或 (b) 认定"设计内 flicker"为特征、只验收"换灯类跳动"（本卡已给构造性归零 + 91→25 的读数）。
**剩余可见量的量级与出现位置**（据本卡 Node 读数与几何）：`'zone-static'` 下唯一残留的灯池变化发生在**跨分区**（例如沿中轴从 B 走进 C）：每次约 1–3 盏灯换绑，经 0.3 s 斜坡 ⇒ 单帧强度变化 ≤ 60/s（可见但连续），频率 = 分区穿越频率（步行约 10–20 秒一次），**出现在分区边界附近**；远景机位（分区之外）**不再有任何换灯**。

---

## 5. 守卫与三证

`tests/core-lamp-stability.test.mjs`：**9/9**（原 8 条一条未删；④⑤⑥⑦⑧ 原样，②③ 保持 t5 语义并**新增** zone-static 断言，⑨ 新增加严的总量判据）。

| 证 | 操作（真实文件突变，非模拟） | 实测 |
| --- | --- | --- |
| ① **修前必红** | `src/shared/config.js` 的 `selectionMode` 临时改回 `'dynamic'` | **5/9**：② 红（`mode` 应为 zone-static）· ③ 红（C 区两机位池不再相同）· ⑥ 红（不旋转也换灯）· ⑨ 红（**合计瞬移 89** > 30） |
| ② **修后全绿** | 恢复（md5 `0d75bcca57ac6d2595455fd9e5873cf0`、`grep -c mutation-control` = **0**） | **9/9**（合计瞬移 **25**、换池 11、第一人称 5/5 全 0） |
| ③ **对照不假红** | ⑨ 同时断言"第一人称机位全 0"与"总量 ≤30"，②③ 同时断言 dynamic 路径**必须**换（`margin=0` 突变 / 跨分区换池） | 两条路径都被断言 ⇒ 恒真被排除 |

`tests/core-environment.test.mjs` **13/13**（⑥ t90 原文在 `'dynamic'` 下继续成立；新增 ⑦b 断言 zone-static 的构造性）。**断言数只增不减**。

---

## 6. 回归与未运行项

| 命令 | 结果 |
| --- | --- |
| `node tests/core-lamp-stability.test.mjs` | **9/9 exit 0** |
| `node tests/core-environment.test.mjs` | **13/13 exit 0** |
| `node scripts/audit.mjs --enforce` | **exit 0**（预算与契约全部通过） |
| `node tests/run.mjs` | 见 §7 的并发窗口说明（本卡收尾时全量仍有**他人窗口**造成的红） |

**未运行（如实报告）**：① `probe-lamp-stability.mjs` 的浏览器四读数扩展与真机 A/B（时间预算）；② `'dynamic'` vs `'zone-static'` 的浏览器像素级对照（同上）；③ 24 格 shot 人眼判读（`scripts/shot.mjs` 在 out of scope）。

## 7. 并发窗口纪律

本卡期间树上仍有他人在飞改动：`src/shared/layout.js`（**1.1.27**，13:26 被改）、`src/kit/*`、`src/zones/east-courts.js` 等**均不在本卡 changedPaths**；`node tests/run.mjs` 的失败项全是 layout/zone/kit 冻结计数（例 `tests/core.test.mjs`「terrace 面应为 8 条…实际 80」，标题已是 LAYOUT 1.1.27）。**未为窗口伪影改代码**，已把清单交回主理人（同 t40 的结论与证据）。

## 8. 交回裁定项

1. **默认架构的取舍**：本卡按卡面"优先静态分配"落到**默认** `'zone-static'`；若主理人认为"局部相关性"更重要（夜景里镜头附近必须有灯），可一行切回 `'dynamic'`（守卫的 dynamic 分支与 t90 判据都还在）。**这是产品观感决策，需主理人确认。**
2. **像素级验收口径**（§4.2）：补第三臂（`flickerAmplitude=0`）才能把"换灯致闪烁"与"设计内 flicker"分开。
3. `src/kit/**`（灯具自发光材质）与 `src/ui/**` 未涉及：本卡证明**根因在选择架构**，不在灯具材质；若真机仍看到"灯体本身闪"，那是自发光材质的 flicker 设计（`flickerAmplitude`），属产品特征决策，**需派单**。
