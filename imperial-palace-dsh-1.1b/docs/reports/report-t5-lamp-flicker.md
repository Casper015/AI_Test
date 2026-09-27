# t5 · 镜头旋转时的宫灯闪烁：机制、最小修复与常驻守卫

> 卡：`t5 [lights] — 单独修光和灯：镜头旋转时灯闪烁`
> 范围：**只动灯光**（`src/core/environment.js` 的灯位池选择/槽位绑定/强度输出层）+ 探针 + 守卫 + 本报告。
> 预算（`LIGHTING.lamps.*`、`§8.2` 实时灯上限、距离上限、节流窗口、评分公式）**逐值未动**。

---

## 0. 结论（一句话）

镜头旋转 ⇒ 每 0.35 s 重排灯位池；`rankLampPool` 的 `slice(0, size)` 是**无滞回的硬截断**，
且入选池按 `pool[i]` 直接写第 i 盏 PointLight ⇒
**池内次序一变就有多盏实时点光在同一帧"瞬移"到别的灯位**，**进出池则是单帧硬切**（无斜坡）。
两者合起来就是肉眼看到的"镜头一转，宫灯闪"。

最小修复 = **滞回 + 槽位按身份绑定 + 进出池/满强度限速斜坡**（三者各治一段，实测择优），
并落常驻守卫 `tests/core-lamp-stability.test.mjs`（8 条断言，含对照不假红与可复现突变证据）。

---

## 1. 确切机制（修前 `git HEAD` 的 file:line）

| # | 位置（修前） | 机制 |
| --- | --- | --- |
| ① | `src/core/environment.js:807` `.slice(0, size)` | 池截断**无滞回**：rank-size 与 rank-size+1 的分数只要近并列，截断线就随镜头来回跳 |
| ② | `src/core/environment.js:844-845` `realtimeLights.forEach((light, i) => { const hit = pool[i]; ... })` | 槽位按**排名位次**绑定 ⇒ 池内次序变化 = 多盏灯同帧换位置（"瞬移"） |
| ③ | `src/core/environment.js:850` `light.visible = true` | 进出池是**单帧硬切**（0 → 满强度），无淡入淡出 |
| ④ | `src/core/environment.js:824` `if (elapsed - lampState.lastReselect < 0.35) return;` | 0.35 s 节流 ⇒ 每 0.35 s 一次"整池重排"，事件成串出现（节流本身**未改**） |
| ⑤ | `src/core/environment.js:903` `light.userData.baseIntensity ??= light.intensity` | flicker 基准**只在首次缓存**、此后永不更新 ⇒ 换绑后强度基准与位置/距离脱钩（第二个隐性抖动源） |

### 1.1 量化：截断线有多近？

`rankLampPool` 用 `score = importance / (1 + (d/60)²)`。机位绕目标点转 0.5°/帧时，各灯位距离连续变化。
在 `VP-C-zone`（相机距目标 253 m）实测 **150 帧内 rank6↔rank7 的相对裕量 `(s6−s7)/s6`**：

- 最小 `9.99e-4`、中位数 `~1e-2`；
- **3/150 帧的裕量 < 1e-3**（即"谁进池"由千分之一量级的分数差决定）。

在这种近并列下，任何微小的机位变化都会翻转截断线。

### 1.2 量化：闪烁有多大？（同一生产入口 `environment.update`，14 机位 × 150 帧 × 0.5°/帧，夜/中档）

| 指标 | 基线（修前） | 修复后 | 说明 |
| --- | --- | --- | --- |
| 槽位"瞬移"次数（= 一盏实时点光换灯位） | **307**（单机位最多 35） | **93**（最多 18） | 物理上就是可见硬切 |
| 单帧强度变化率峰值 | **90.4 /s** | **69.2 /s** | 斜坡上界 = 满量程 18 / 0.3 s = **60 /s** |
| 不旋转对照（同一协议） | 0 次瞬移 / 8.2 /s | 0 次瞬移 / 8.2 /s | 对照不假红（8.2/s 是 flicker 呼吸的固有上限） |

> 阈值型判据的"修前必红/修后全绿/对照不假红"三证见 §4。

---

## 2. 最小修复（实测择优）

按卡面给出的候选逐一实测（同协议，14 机位 × 150 帧 × 0.5°/帧）：

| 候选 | 槽位瞬移合计 | 强度变化率峰值 | 判定 |
| --- | --- | --- | --- |
| ① 基线（无滞回/无斜坡） | 307 | 90.4 /s | 红 |
| ② 仅滞回 `margin=0.12` | ~290 | ~88 /s | **单独不够**（只治"近并列"这一段） |
| ③ 仅加大节流 0.35→1.0 s | 事件数减半 | 仍是一次硬切 | **不放宽节流**（会牺牲灯位跟随性，且卡面要求预算/口径不回退） |
| ④ 仅斜坡 0.3 s | 307 | 63 /s | 治硬切，不治"瞬移面" |
| ⑤ **滞回 + 槽位身份绑定 + 斜坡 0.3 s（本次落地）** | **93** | **69.2 /s** | 绿 |

三个手段各治一段，缺一不可：
- **滞回**（`selectLampPool`，`margin = 0.12`）：近并列时保留在位者 ⇒ 截断线不再随镜头抖；
- **槽位按身份绑定**：池内次序变化在画面上本是零效应（8 盏灯同色同参），按位次写槽位却让它变成"多盏灯同时瞬移" ⇒ 按身份保留原槽位，只有真进出池才动一盏；
- **限速斜坡**（`LAMP_FADE_SECONDS = 0.3`）：进出池与满强度变化都限速，**换绑帧强度精确连续**（连 flicker 相位突变也吸收）。

### 2.1 落地位置（修复后）

| 位置 | 内容 |
| --- | --- |
| `src/core/environment.js:815` `rankLampCandidates()` | 从 `rankLampPool` 抽出"全量排名"（排序与 slice 语义逐位不变） |
| `src/core/environment.js:852-853` `LAMP_HYSTERESIS_MARGIN` / `selectLampPool()` | 带滞回的生产选择器（纯函数，守卫直测） |
| `src/core/environment.js:925` `updateLampSelection()` | 用 `selectLampPool` 取代 `rankLampPool`；槽位按身份绑定（`slotBinding`） |
| `src/core/environment.js:1047-1058` `LAMP_FADE_SECONDS` / `updateLampOutput()` | 唯一的每帧灯光输出层：`intensity = lampBase × fade × flickerK`，三者都限速 |
| `src/core/environment.js:1339` `lampSlots()` | 只读诊断读数：槽位→灯位 id、强度、满强度/目标、斜坡位（供守卫与探针取证） |
| `src/core/environment.js:946` `describe().lamps.hysteresis` / `:966` `.fade` | 滞回与斜坡的直接读数（含跨帧累计 `totals.kept`） |

### 2.2 口径不变项（**不回退**）

- `LIGHTING.lamps`：`maxRealtimePointLights=8`、`distance=60`、`emissiveFallbackBeyond=120`、
  `intensity=18`、`decay=1`、`flickerAmplitude=0.05`、`flickerSpeed=1.7` —— **逐值未改**；
- 距离上限仍 `min(60×6, 120) = 120 m`；池容量仍 `min(8, 质量档上限)`（夜/中档 = 6）；
- 节流仍 `0.35 s`；评分公式仍 `importance / (1 + (d/60)²)`；
- **稳态强度逐值不变**：落稳态后 `intensity == LIGHTING.lamps.intensity × max(0.15, 1−min(0.85, d/60)) × lampIntensityScale × k`
  （与修复前同一解析式；守卫断言⑦逐灯核对）；
- `snapFade` 保证**时辰/质量/锚点重配置后的首次重选**与 **`dt ≤ 0` 的 `settle()`/截图路径**直接落稳态 ⇒
  §12 三时辰可读性读数与截图确定性不受斜坡影响。

---

## 3. 真实浏览器证据

### 3.0 结果（真实 headless Chrome，`zone`/`VP-C-zone`，120 帧 × 每帧 0.5°，夜/中档，1280×720）

| 臂 | 槽位"瞬移"（灯位身份变化） | 池集合变化 | 整帧亮度 | 灯致闪烁（逐格均值/峰值，/255） |
| --- | --- | --- | --- | --- |
| **修前** `rotate` | **56 次**（16 帧有变化） | 10 | 47.9928–51.5825 | 0.0136 / 0.0503 |
| **修后** `rotate` | **11 次**（7 帧有变化） | 7 | 47.9992–51.5664 | 0.0075 / 0.0291 |
| 修前 `static`（不旋转对照） | 0 | 0 | 48.3125–48.3241 | — |
| 修后 `static`（不旋转对照） | 0 | 0 | 48.3125–48.3238 | — |

- **瞬移 56 → 11（5.1×）**，池集合变化 10 → 7，整帧亮度区间几乎逐值相同（修复不改变整体曝光）；
- **不旋转对照 0 次瞬移、0 次集合变化** ⇒ 红只由"旋转"引起（对照不假红）；
- 灯致闪烁 = `grid_rotate(t) − grid_lampsoff(t)` 的相邻帧逐格平均差；不旋转噪声底 0.0017、纯运动基线 1.0772
  ⇒ 修复后的灯致闪烁（均值 0.0075）比运动基线低 **2 个数量级**，且比噪声底只高 4 倍。
- **轨迹一致性核对**：修前/修后/对照三臂逐帧方位角最大差 **0.000000°**、相机 xz 最大差 **0.000000 m**
  ⇒ 像素差分是同一轨迹的同帧对齐，不是"两条不同轨迹相减"。
- 修前基线**无法**用自身 `lampsoff` 臂做差分：基线把 `?env=` 的 `lampIntensity` 覆盖**静默忽略**
  （`updateLampFlicker` 用 `baseIntensity ??=` 的陈旧基准覆盖了 `updateLampSelection` 写入的 0，
  实测 lampsoff 臂池光功率仍为 50.9–55.9 而非 0）——这是缺陷⑤的又一实证；
  故修前的"灯致闪烁"用**同一轨迹的修后 `lampsoff` 臂**作无灯参考（几何/相机逐帧相同）。



协议（`scripts/probe-lamp-stability.mjs`）：

- 真实 headless Chrome（`chromium_headless_shell`）打开 `index.html`；
- 用**生产事件入口** `view:request-zone` 落位到 `zone` 模式的 `VP-C-zone`（该机位池非空：6/6 盏实时灯）；
- **在生产循环内部采样**：包一层生产自己的 `renderSystem.recordFrame`（每帧末尾恰好一次），
  在**该帧 `environment.update` 之后**读全部读数，再为下一帧用**生产输入入口** `rig.applyInput('rotate')` 推进 **0.5°**；
- 逐帧记录：激活灯集合（槽位→灯位 id）、池排名（`describe().lamps.pool`）、逐灯强度、整帧亮度（降采样 16×10 格）；
- 帧数 **120**（≥120 要求）；三条臂：`rotate`（正常）、`lampsoff`（`setActiveOverrides({lampIntensity:0})` ⇒ 纯运动基线）、`static`（不旋转）；
- **版本自检**：探针比对浏览器实际加载的 `environment.js` SHA-256 与磁盘一致，并校验 `lampSlots()` 含 `fade/baseTarget` 字段，不一致直接拒绝出结论。

> 踩坑记录（写进探针注释，避免复现）：① 探针若在页面 rAF 之外另起一套 `environment.update`，会与页面自身循环**抢时序**
> （同一轨迹下读数在 0.1 与 2.7 之间交替）；② Chrome 对无缓存头的 ES 模块做**启发式缓存**，配合复用的
> `--user-data-dir` 会静默加载**上一版**产品代码（实测读到缺 `fade` 字段的旧 `lampSlots`）。
> 探针已分别用"循环内采样"与"`cache-control: no-store` + 唯一 profile 目录 + SHA 自检"封死。

> 读数与差分结果见 `work/lamp-stability/*.json`；像素差分脚本 `scripts/compare-lamp-flicker.mjs`。

---

## 4. 常驻守卫与三证

守卫：`tests/core-lamp-stability.test.mjs`（灯位表**现场构建**：5 个区域真 kit 装配 ⇒ `registry.allLightAnchors()`
= 152 个，与浏览器实测逐 id 相同；不内嵌手抄清单）。

| # | 断言 |
| --- | --- |
| ① | 预算未放宽：上限/容量/距离上限/满量程/flicker 逐值不变；池长度恒 = min(容量, 候选数) |
| ② | 滞回在生产选择器上生效（近并列保留在位者）+ **可复现突变对照**（`margin=0` ⇒ 必须换绑） |
| ③ | 在位者出界必须让位（滞回不得变成"永久粘住"） |
| ④ | 生产路径 × 14 机位 × 150 帧 × 0.5°/帧：单帧强度变化率 ≤ **80 /s**（斜坡上界 60/s） |
| ⑤ | 同轨迹：每机位槽位瞬移 ≤ **22** 次 |
| ⑥ | **不旋转对照**：0 次瞬移、0 次超速（对照不假红） |
| ⑦ | 稳态逐值不回退：强度 = 修复前解析式 `base × k`，且 `fading == 0`（斜坡不残留变暗） |
| ⑧ | 节流窗口未放宽：0.35 s 内池清单必须恒定，且越窗后必须恢复重选 |

**三证**（阈值型判据的"护栏必须证活"）：
1. **修前必红** —— 见 §4.1（真实文件突变，守卫 exit ≠ 0，逐条列出红项）；
2. **修后全绿** —— `node tests/core-lamp-stability.test.mjs` 8/8，`node tests/run.mjs` 全绿；
3. **对照不假红** —— 守卫断言⑥（不旋转臂 0 瞬移 / 0 超速），且机位切换用 45 帧热身排除"瞬移换池"误算。

### 4.1 修前必红（**真实文件突变**证据）

按 §12.1.4.2（阈值型护栏必须给出可复现的突变证据）执行**真实文件突变 → 立即恢复 → 恢复后全绿**：

| 突变 | 做法 | 守卫结果 |
| --- | --- | --- |
| ① 斜坡退化 | `const LAMP_FADE_SECONDS = 0.3;` → `1e-9;` | **7/8，exit 1**：④「强度变化率 ≤ 80/s」必红 ✓ |
| ② 槽位退回按位次绑定 | 身份绑定块 → `slotBinding = realtimeLights.map((l, i) => pool[i]?.anchor.id ?? null)` | **7/8，exit 1**：⑤「瞬移 ≤ 22」必红（C-zone 31、D-zone 34、F-zone 27、B-main-hall 32、C-bed-hall 36、C-fp-spawn 23）✓ |
| 恢复后 | `shasum -c` 逐字节校验 + 重跑 | **8/8，exit 0** ✓ |

此外断言②自带**内存级突变对照**：同一夹具下 `margin = 0` 必须换绑、`margin` 生效值必须保留在位者
（`2.992e-2 < 0.12` 的近并列），证明"滞回生效"这条断言不是恒真。

---

## 4.2 不回退的既有验收（同条件对照）

| 验收 | 结果 |
| --- | --- |
| `tests/core-environment.test.mjs`（t90 灯位池距离感知，12 条） | **12/12 PASS**（含"预算未放宽"与"池清单逐值一致"） |
| `tests/verify-experience.test.mjs` · **H5（灯位池硬断言）** | **✓ PASS**（两城门内景三时辰池内 #1–#2 为真实室内灯，池长 == 真机容量 3/4/6） |
| `tests/verify-experience.test.mjs` 整体 | 修前/修后**同一失败集**（仅 `F1 24 张截图`，与本卡无关；逐项比对见下） |
| `node scripts/audit.mjs --enforce` | **exit 0**，"预算与契约检查全部通过"；灯表三时辰 × 三档 **152 灯位 / 池 4·3·1 / 5·4·1 / 8·6·2 / 发光强度 1.77·2.16·3.20** 与修前逐值相同 |
| `node tests/run.mjs`（全量） | **本卡守卫 PASS 8/8**、`core-environment` PASS 12/12、`core`/`kit`/`interaction`/`zones`/`verify-completeness`/`walk-reachability`/`shot-mask`/`core-*` 全 PASS；红项 5 个全部为并发几何改动与飞行中的 t1 卡（逐项非因果证明见上表） |

**非因果证明（逐项）**：把 `src/core/environment.js` 临时换回 `git HEAD` 版本，在**同一棵树上**重跑，
失败集与修复版**逐项相同**：

| 套件 | 修复版 | 换回修前版 |
| --- | --- | --- |
| `tests/verify-experience.test.mjs` | FAIL（仅 `F1 24 张截图`；H5 灯位池硬断言 ✓） | FAIL（**同一项**，仅 `F1 24 张截图`） |
| `tests/layout.test.mjs` | FAIL 1/1843 | FAIL 1/1843 |
| `tests/zone-west.test.mjs` | FAIL 28/31 | FAIL 28/31 |
| `tests/zone-east.test.mjs` | FAIL 30/32 | FAIL 30/32 |
| `tests/core-lamp-stability.test.mjs`（本卡守卫） | **PASS 8/8** | （修前版本无 `lampSlots`，无法运行——见 §4.1 突变证据） |
| `tests/core-environment.test.mjs`（t90 灯位池） | **PASS 12/12** | PASS |

⇒ 上表 4 项红**与本卡无因果**，成因是**并发成员正在改几何**：`src/shared/layout.js`（06:28:12）、
`src/zones/west-courts.js`（06:29:38）等，失败项全部落在几何/水池/门洞净宽/截图，无一涉及灯光。
`tests/flicker-guard.test.mjs` 是**另一张卡（t1 红色边缘闪烁）**在飞行中的文件，因缺
`docs/reports/t1-flicker-phases.json` 而 ENOENT，同样不在本卡范围。

---

## 5. 复跑命令

```bash
cd imperial-palace-dsh-1.1b
# 守卫（8 条断言）
node tests/core-lamp-stability.test.mjs
# 全量套件
node tests/run.mjs
# 浏览器探针（修复版，120 帧 × 0.5°/帧）
W=1280 H=720 FRAMES=120 DEG=0.5 MODE=zone AREA=C ARM=rotate \
  PRESET=moonlitNight QUALITY=medium LABEL=t5-after-rotate \
  node scripts/probe-lamp-stability.mjs
# 对照臂
W=1280 H=720 FRAMES=120 DEG=0.5 MODE=zone AREA=C ARM=lampsoff LABEL=t5-after-lampsoff node scripts/probe-lamp-stability.mjs
W=1280 H=720 FRAMES=120 DEG=0.5 MODE=zone AREA=C ARM=static   LABEL=t5-after-static   node scripts/probe-lamp-stability.mjs
# 修前基线（把 git HEAD 的 environment.js 当 /src/core/environment.js 提供）
BASELINE=1 SKIP_VERSION_CHECK=1 W=1280 H=720 FRAMES=120 DEG=0.5 MODE=zone AREA=C ARM=rotate \
  LABEL=t5-before-rotate node scripts/probe-lamp-stability.mjs --allow
# 像素差分（灯致图像 = rotate − lampsoff）
node scripts/compare-lamp-flicker.mjs work/lamp-stability/t5-after-rotate.json work/lamp-stability/t5-after-lampsoff.json work/lamp-stability/t5-after-static.json
```

---

## 6. 交付物清单

| 路径 | 内容 |
| --- | --- |
| `src/core/environment.js` | 最小修复（+297/−28）：`rankLampCandidates` / `selectLampPool` / 槽位身份绑定 / `updateLampOutput` / `lampSlots()` 只读读数 |
| `scripts/probe-lamp-stability.mjs` | 真实浏览器探针（生产循环内采样、三臂、版本自检、SHA 比对） |
| `scripts/compare-lamp-flicker.mjs` | 灯致闪烁像素差分（rotate − lampsoff，同帧对齐） |
| `tests/core-lamp-stability.test.mjs` | **常驻守卫**（8 条断言，灯位表现场构建） |
| `docs/reports/report-t5-lamp-flicker.md` | 本报告 |
| `work/lamp-stability/*.json` · `logs/*.log` | 逐帧读数与运行日志（修前/修后 × rotate/lampsoff/static） |
| `work/lamp-stability/baseline/environment-baseline.mjs` | `git HEAD` 版副本（供探针 `BASELINE=1` 复现"修前必红"） |

**未动**：`src/shared/config.js`（全部预算常量逐值未改）、`src/core/camera.js`、任何区域/几何/UI 文件。
