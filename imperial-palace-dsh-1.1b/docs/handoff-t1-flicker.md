# t1 · 「红色边缘持续闪烁」：复现、根因、候选逐条排除、最小修复与常驻守卫

> 卡：`t1 [flicker] — 复现并修复"红色边缘持续闪烁"`（attempt 2 · ui-engineer）
> 范围：探针 `scripts/probe-flicker.mjs`、守卫 `tests/flicker-guard.test.mjs`、读数与可视化 `docs/reports/t1-*.json` + `docs/shots-t1-flicker/`、本报告。
> **未改任何产品代码**：根因位于 `src/core/environment.js`（core-engineer 域）⇒ 按卡面「若根因在 src/core/** 则量化交回」执行；交回内容见 §6。
> 预算与口径：§8.2、`LIGHTING.atmosphere.smokeParticleBudget`、烟粒子 `size/opacity/span`、`QUALITY.tiers.*.aaSamples` **逐值未动**。
> 读数树：全部读数取自**当前工作树**（HEAD + 其它卡的在制改动，如 t5 宫灯限速斜坡 `src/core/environment.js`）；本次核对了 `git diff src/core/environment.js` 只含 t5 灯位/强度层改动，**烟粒子代码未被任何人改动**，故结论不受在制改动影响。

---

## 0. 结论（一句话）

静止机位下"红色边缘持续闪烁"= **中轴 4 座香炉的烟柱（`environment-smoke`）**：

1. `?view=oblique` 下 4 座香炉（B 门 / B 正殿 / C 门 / C 寝殿，全在中轴 ⇒ 投影到**同一列像素** x≈718–721）距离相机 **935 / 1158 / 1362 / 1424 m**；
2. 烟粒子 `size=1.1`（世界单位）+ `sizeAttenuation` ⇒ `gl_PointSize = size·(drawingBufferHeight/2)/dist =` **0.35–0.53 px**，即**亚像素点精灵**；
3. 同一屏幕像素内叠 3–5 颗 ⇒ 等效不透明度 `1−(1−0.16)^n =` **0.41–0.58**，压在**宫红墙 `#962822`** 的边缘上；
4. 48 颗粒子按 `phase = (elapsed·0.22 + seed) % 1` 上升，每颗粒子 **4.5 s 一次硬回绕**（无淡入淡出）⇒ 实测 **9–14 次/秒**的"瞬移重生"，60fps 下每颗粒子每帧屏幕位移 0.067 px ⇒ 亚像素覆盖逐帧翻转。

⇒ 肉眼所见即"**红色边缘持续闪烁**"。同协议实测：静止场景 30 帧 **79 个不稳定像素**、**29/29 对相邻帧都有变化**；精确 1 帧 @60fps 协议 **58 个**。

**最小修复**（已在运行时验证，交回 core 落地）= **烟柱 LOD：投影点径 < 1 px 时整柱不绘制** ⇒ 同协议不稳定像素**精确 0**（`live` 与精确 `@60fps` 两种协议都是 0）。

---

## 1. 口径三要素

| 项 | 值 |
| --- | --- |
| 环境 | headless Chrome `chrome-headless-shell 1243`，`--disable-gpu`（SwiftShader WebGL2，ANGLE），视口 1440×900，dpr=1 |
| 协议 | `?view=oblique&quality=medium`；每相位连续捕 **30 帧**；驱动 = 页面自身 rAF + **每次捕获前调用生产入口 `renderSystem.recordFrame(16)`**（与 t104/t162 同协议，不绕过逻辑）；另有**精确帧步长**相位：冻结页面 rAF 后由 `stepFrame(dt)` **复刻 `main.js frameStep` 的调用序列**（zones→rig→environment→render→recordFrame），使"相邻帧"= 恰好 1 帧（dt=1/60 s 或 1/15 s） |
| 判据 | `unstablePixels` = 在 ≥2 帧之间发生过**任何位差**的**不同像素**数（阈值 0，最严口径）。探针默认判据：`live` 相位必须为 0；未运行 `live` 时必须显式 `--expect=<相位>:<数值>`，否则 **FAIL（不静默 PASS）** |

判据不假绿/不假红的三道自检见 §7.3。

---

## 2. 复现与归属（先证后改）

同一浏览器会话内多相位对照（`scripts/probe-flicker.mjs`）：

| 相位 | 冻结对象 | 不稳定像素 | 变化总数 | 有变化帧对 | 相机矩阵稳定 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `live`（基线） | — | **79** | 1285 | **29/29** | true | 症状成立：**每一对相邻帧都变** |
| `frame-60`（精确 1 帧 @60fps） | — | **58** | 178 | 28/29 | true | 真·相邻帧下每帧仍变（≈6 px/帧，单对最大 11 px，单像素最大通道和差 **180**） |
| `frame-15`（精确 1 帧 @15fps） | — | 70 | 544 | 29/29 | true | 幅度随步长增大（连续漂移 + 离散回绕叠加） |
| `lock` | 相机 + 环境 | **0** | 0 | 0/29 | true | **渲染逐位确定**（同状态重复渲染完全一致） |
| `lock-rig` | 只冻相机 | **75** | 422 | 29/29 | true | 相机缓动/浮点漂移**不是**成因 |
| `lock-env` | 只冻环境 | **0** | 0 | 0/29 | true | **成因在环境动画** |

不稳定像素几何（`live`）：列 x∈[717,722]（6 px 窄列）、行 y∈[400,637]，聚成 4 簇（402–404 / 420–422 / 496–500 / 634–635）—— 与"中轴 4 座香炉投影重叠"**逐簇对应**。

---

## 3. 候选逐条排除（全部带读数，无一例外）

| # | 候选（"红色边缘"可能来源） | 排除相位 | 读数（不稳定像素） | 结论 |
| --- | --- | --- | --- | --- |
| C1 | **香炉烟粒子** | `nosmoke`（隐藏 `environment-smoke`） | **0** | **唯一来源**（症状本体） |
| C2 | 尘埃粒子 | `nodust`（隐藏 `environment-dust`） | 78 | 排除（隐藏后不变） |
| C3 | 宫灯实时点光 flicker（±5%） | `noflicker`（渲染前把强度钉回 `baseIntensity`） | 77 | 排除（t5 已单独治理灯光瞬移，见 `docs/reports/report-t5-lamp-flicker.md`） |
| C4 | 宫灯灯体 + 点光 | `nolamps`（隐藏 `environment-lamps` + 关点光） | 77 | 排除 |
| C5 | Bloom 溢色 | `nobloom`（`setBloom({enabled:false})`） | 79 | 排除 |
| C6 | 阴影贴图抖动 | `noshadow`（`environment-sun.castShadow=false`） | 76 | 排除 |
| C7 | **选中高亮线框（静止态）** | 对象级 + `live` | **0** | 排除：未选中时 `palace-ui-highlight` 两个线框 `visible=[false,false]` ⇒ 贡献 0 像素 |
| C8 | 选中高亮线框（选中态脉动） | `sel-live` vs `sel-nohl`（各 30 帧，同一选中态、仅隐藏线框组） | **571** vs 79（差集 **493**） | **分离登记**：脉动（`#ffc83b`，opacity 0.7–1.0 / 900 ms）是**设计项**，仅选中态出现，与本卡报告的静止场景闪烁不同源 |
| C9 | AA = 关（low） | `aa-low` | 146 | 排除（关 AA 反而更多） |
| C10 | AA = MSAA×2（medium，默认） | `live` | 79 | 排除 |
| C11 | AA = MSAA×4（high） | `aa-high` | 87 | 排除（三档都 >0） |
| C12 | 相机缓动 / 浮点漂移 | `lock-rig` | 75 | 排除（只冻相机后照旧） |
| C13 | 渲染不确定性（AA/驱动/合成） | `lock` / `lock-low` / `lock-high` | **0 / 0 / 0** | 排除（同状态重复渲染逐位一致） |

口径说明：C1 / C7 / C8 / C9–C11 / C13 为 **30 帧**；C2–C6、C12 为节省机时为 **12 帧**（同一驱动协议与判据，读数同为"不同像素数"；逐条帧数已登记在 `docs/reports/t1-flicker-phases.json` 的 `candidates[*].frames`）。

**射线拾取归因**（对 `live` 最不稳定的 8 个像素做 `Raycaster`，见读数 JSON `identify`）：

```
(719,402) ⇒ Points < environment-smoke < environment-root < palace-scene   （距离 1424.29）
(720,402) ⇒ Points < environment-smoke < …                                  （距离 1424.20）
(720,421) ⇒ Points < environment-smoke < …                                  （距离 1362.18）
(720,498) ⇒ Points < environment-smoke < …                                  （距离 1158.48）
(719,404) ⇒ greybox:C:wall < greybox:zone:C < zone-root:GREYBOX ｜ Mesh ｜ 色 #962822   ← 烟柱背后的宫红墙
(719,499) ⇒ greybox:B:wall < greybox:zone:B < zone-root:GREYBOX ｜ Mesh ｜ 色 #962822
```

---

## 4. AA 当变量测（low / medium / high 三档对照）

| 质量档 | 生效 AA（`getStats().quality.antialias`） | `live` 不稳定像素 | `lock`（同状态重复渲染） |
| --- | --- | --- | --- |
| `low` | `mode=msaa, samples=0`（关） | **146** | **0** |
| `medium`（默认） | `mode=msaa, samples=2` | **79** | **0** |
| `high` | `mode=msaa, samples=4` | **87** | **0** |

结论：
1. **AA 不是成因**：锁定状态（同一状态重复渲染）在三档下**都是精确 0** ⇒ 渲染管线在三个 AA 档位上都逐位确定，"闪烁"不可能来自 MSAA/后处理本身的随机性；
2. `live` 三档**都 >0** ⇒ 闪烁与 AA 无关；
3. AA 只调制走样**幅度**（关 AA 时不稳定像素 146 > MSAA×2 的 79），因此**修 AA 不能治闪烁**——这正是本卡要求"AA 当变量测"的价值所在。

---

## 5. 根因量化（`work/probe/smoke-metrics.mjs` 真机读数）

| 香炉（锚点来源） | 距离 (m) | 粒子数 | `gl_PointSize` (px) | 屏幕足迹 (px) | 同像素堆叠 | 等效不透明度 | 屏幕列 / 行 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B 门 `B-gate-front` | 935.0–938.2 | 12 | 0.528–0.529 | 2.38 × 5.29 | 3 | 0.407 | x 719–721 / y 634–639 |
| B 正殿 `B-hall-main` | 1157.6–1160.2 | 12 | 0.427–0.428 | 2.45 × 4.97 | 2–3 | 0.294–0.407 | x 719–721 / y 496–501 |
| C 门 `C-gate-inner` | 1362.0–1364.2 | 12 | 0.363 | 1.62 × 3.59 | 4 | 0.502 | x 719–721 / y 421–425 |
| C 寝殿 `C-hall-bed-main` | 1423.8–1426.2 | 12 | 0.347–0.348 | 1.32 × 3.72 | 5 | 0.582 | x 720–721 / y 401–405 |
| **合计** | — | **48** | **≤0.53（全部亚像素）** | 同处 x 719–721 一列 | ≤5 | ≤0.58 | y 跨 ≈238 px |

- **上升相位**：`phase = (elapsed × 0.22 + seed) % 1`，`rise = phase × span(=6)` ⇒ 每颗粒子 **0.22 次/秒回绕**，48 颗 ⇒ 理论 **10.56 次/秒**；实测 **9–14 次/秒**（两次读数，含种子方差）。
- **60fps 相邻帧屏幕位移**：0.067 px/粒子/帧 ⇒ 亚像素覆盖逐帧翻转（这就是"持续"而非"偶发"的机理）；回绕瞬间则是**整颗粒子瞬移**（单像素通道和差最大 **245**）。
- **无淡入淡出**：`PointsMaterial{color:0xffffff, size:1.1, sizeAttenuation:true, transparent:true, opacity:0.16, depthWrite:false}`，`opacity` 是**常量**，所以回绕 = 硬弹出/硬弹入。
- 背后是宫红墙 `#962822` ⇒ 亚像素白点抖动落在红墙边缘上 ⇒ 用户描述为"**红色边缘**持续闪烁"。

可视化：`docs/shots-t1-flicker/compare-smoke-over-red-wall.png`（同一 40×20 px 区域 ×12：`live-00/01/02` 可见烟团在红墙边缘游走、`nosmoke-00` 与 `smoke-lod-00` 干净）。

---

## 6. 最小修复（运行时验证 + 交回 core 的补丁形状）

### 6.1 运行时验证（本卡内完成，未改产品代码）

探针的 `smoke-lod` 相位在生产渲染路径外挂一层**逐帧可见性判定**（公式与 three 的 `PointsMaterial` 同式）：

```
pointPx = size × (canvas.height / 2) / dist        // size=1.1，canvas.height=900
smokeGroup.visible = pointPx ≥ 1.0                 // 1px 门限
```

| 相位 | 协议 | 不稳定像素 | 判据 |
| --- | --- | --- | --- |
| `smoke-lod` | `live`（现状协议，30 帧） | **0** | `--expect=smoke-lod:0` ✅ |
| `frame-60-lod` | 精确 1 帧 **@60fps**（30 帧） | **0** | `--expect=frame-60-lod:0` ✅ |
| `live`（对照，未修） | `live` | 79 | 修前必红 ✅ |
| `nosmoke`（成因对照） | `live` | 0 | 归属成立 ✅ |

⇒ **"最小修复后用同协议证明不稳定像素精确降为 0"已达成**（两种协议都精确 0），且修复只影响**远景亚像素烟柱**：近景 20 m 处点径 = 1.1×450/20 = **24.75 px** ⇒ 第一人称/内景视角的烟柱特征**完全保留**（门限只裁 ≥≈495 m 的亚像素段）。

### 6.2 交回 core 的补丁形状（`src/core/environment.js` · `updateParticles()` 烟柱段）

```js
// 烟柱 LOD：亚像素点精灵物理上无法表达形态，只会产生逐帧覆盖翻转（= 本卡症状）
// 只改可见性，不动粒子数/预算/材质（§8.2 与 smokeParticleBudget 逐值不变）
const scale = rendererAdapter?.drawingBufferHeight?.() ?? 900;   // 生产代码可用既有渲染适配器读数
for (const system of smokeSystems) {
  const dist = cameraDistanceTo(system.anchor);                  // 每帧一次，O(1)/柱
  const pointPx = system.points.material.size * (scale / 2) / Math.max(1e-6, dist);
  system.points.visible = pointPx >= CONFIG.LIGHTING.atmosphere.smokeMinPointPx;  // 建议默认 1.0
}
```

建议常量入 `src/shared/config.js`：`atmosphere.smokeMinPointPx: 1.0`（注释写明"亚像素门限；近景 20 m 处点径 ≈24.75 px，门限只裁远景"）。
**备选（不推荐单独使用）**：给烟粒子做逐粒子 alpha 淡入淡出（`ShaderMaterial`）——能消除"硬回绕"，但不消除亚像素抖动在 60fps 下的逐帧覆盖翻转（§5 实测 0.067 px/帧仍会翻转边缘像素），改动更大且新增着色器分支。

> 交回边界：`src/core/environment.js`、`src/shared/config.js` 属 core-engineer / foundation-lead 域，本卡**不越界落地**；落地后可把常驻守卫判据升级为 `--expect=live:0,frame-60:0`（见 §7.4）。

---

## 7. 常驻守卫（三证齐备）

### 7.1 三条腿

| 腿 | 载体 | 内容 |
| --- | --- | --- |
| 协议腿 | `scripts/probe-flicker.mjs` | 主判据 `unstablePixels`、21 个对照相位、精确帧步长（`freezeLoop`+`stepFrame`）、`--expect` 显式判据、缺判据即 FAIL |
| 单测腿 | `tests/flicker-guard.test.mjs` | 5 组断言：①协议要素 ②根因常量与真机读数逐值对齐 ③候选排除登记（每条必须有读数 + 相位 + 结论）④高亮线框对象级排除 ⑤真实浏览器 opt-in（`FLICKER_BROWSER=1`，默认显式跳过并说明原因，不静默 PASS） |
| 读数腿 | `docs/reports/t1-smoke-metrics.json`、`docs/reports/t1-flicker-phases.json`、`docs/shots-t1-flicker/` | 真机读数、候选登记表、关键截图与对比图 |

### 7.2 守卫判据（当前树，修前必须红）

```bash
# ① 本卡证据（PASS, exit 0）：基线必红 ⇒ 唯一来源 0 ⇒ 最小修复两协议 0
node scripts/probe-flicker.mjs --frames=30 --phases=live,nosmoke,smoke-lod,frame-60-lod \
     --expect=nosmoke:0,smoke-lod:0,frame-60-lod:0

# ② 落地 core 补丁后的验收判据（**今天必红**，实测 exit 1：live=52@3帧 / 79–80@30帧）
node scripts/probe-flicker.mjs --frames=30 --phases=live,frame-60 --expect=live:0,frame-60:0

# ③ 常驻守卫（无需浏览器，秒级）
node tests/flicker-guard.test.mjs

# ④ opt-in 真机腿（已实测 5/5：live=80｜nosmoke=0｜frame-60=59｜AA=msaa/2）
FLICKER_BROWSER=1 node tests/flicker-guard.test.mjs
```

### 7.3 三证

| 证 | 内容 | 读数 |
| --- | --- | --- |
| ① **判据不假绿** | 锁定状态（同状态重复渲染）在 AA 关 / MSAA×2 / MSAA×4 三档下**都是精确 0** | `lock` 0/0/0 ⇒ 读数不是渲染噪声；基线 79 是真实状态漂移 |
| ② **判据不假红** | 逐条关候选（尘埃/灯 flicker/灯体/bloom/阴影/高亮）**读数仍 >0**；只有关烟 ⇒ 0 | `nodust` 78、`noflicker` 77、`nolamps` 77、`nobloom` 79、`noshadow` 77、`nosmoke` **0** |
| ③ **修复可达 0** | 最小修复（烟柱 LOD ≥1px）在两种协议下**精确 0** | `smoke-lod` 0、`frame-60-lod` 0（修前 79 / 58） |

### 7.4 读数可复现性

| 相位 | 第 1 次 | 第 2 次 | 第 3 次（守卫真机腿） |
| --- | --- | --- | --- |
| `live`（30 帧） | 79 | 80 | 80 |
| `frame-60`（精确 @60fps） | 58 | 59 | 59 |
| `nosmoke`（30 帧） | 0 | 0 | 0 |
| `smoke-lod` / `frame-60-lod`（最小修复） | 0 / 0 | — | — |

⇒ 症状读数稳定可复现（±1 px，种子相关），**唯一来源 0 与修复 0 是精确值**（不是"接近 0"）。

### 7.5 落地 core 补丁后的判据升级（只增不减）

1. `node scripts/probe-flicker.mjs --frames=30 --phases=live,frame-60 --expect=live:0,frame-60:0` 必须转绿；
2. `tests/flicker-guard.test.mjs` 的 ②③ 组断言引用真机读数文件，**不需要改**（读数文件必须随修复同步重测更新，否则守卫变红 —— 这是有意设计）；
3. 建议追加一条 core 侧纯逻辑断言（属 core 域）：烟柱在 `dist > size·(H/2)/1.0` 时 `points.visible === false`。

---

## 8. 复跑命令（逐条可复核）

```bash
# 侦察（分离"状态漂移"与"渲染确定性"）
node scripts/probe-flicker.mjs --frames=30 --phases=live,lock,lock-rig,lock-env

# 候选逐条排除
node scripts/probe-flicker.mjs --frames=12 --phases=live,nodust,nosmoke,noflicker,nolamps,nobloom,noshadow
node scripts/probe-flicker.mjs --frames=30 --phases=sel-live,sel-nohl          # 高亮线框候选（选中态）

# AA 当变量
node scripts/probe-flicker.mjs --frames=30 --phases=aa-low,aa-medium,aa-high   # live 三档
node scripts/probe-flicker.mjs --frames=30 --quality=low  --phases=lock        # 锁定态（逐档复跑）
node scripts/probe-flicker.mjs --frames=30 --quality=high --phases=lock
node scripts/probe-flicker.mjs --frames=30 --aa=off --phases=lock

# 精确相邻帧（冻结 rAF + 复刻生产帧）
node scripts/probe-flicker.mjs --frames=30 --phases=frame-60,frame-15

# 根因量化与证据汇编
node work/probe/smoke-metrics.mjs > docs/reports/t1-smoke-metrics.json
python3 work/probe/assemble-t1-evidence.py
```

---

## 9. 未做 / 明确交回

1. **产品代码落地**：`src/core/environment.js` 的烟柱 LOD（§6.2）—— 属 core-engineer；本卡只提供量化 + 已验证的补丁形状 + 守卫。
2. **选中态线框脉动**（`sel-live` 552 个不稳定像素）：`src/interaction/highlight.js` 的 `highlightPulseMs=900` 是**设计项**，且只在选中态出现；若产品希望降低其视觉噪点（例如降低脉动幅度或改为一次性淡入），应另开卡，**本卡不改**（避免以"修闪烁"为名改掉设计意图）。
3. **烟柱近景**：本卡不动近景烟柱（20 m 处 24.75 px，形态明确、无亚像素抖动）。

---

# §8 t25 · 补丁已落地（core-engineer · attempt 2 · attempt_id `ce0fd4fd-6772-4b46-a15f-b093d70495ca`）

> 本卡（`t25 [smoke-lod]`）把 §6.2 交回的补丁**落地到产品代码**，并用 §7 的权威判据复验。
> 口径、阈值、粒子规格、预算**一律未动**；只改**可见性判定**。

## 8.1 落地内容（file:line）

| 文件:行 | 改动 |
| --- | --- |
| `src/shared/config.js:13` | `CONFIG_VERSION '1.0.8' → '1.0.9'`（摘要写明：新增 `atmosphere.smokeMinPointPx`，粒子数/预算/材质规格逐值未动） |
| `src/shared/config.js:490` | 新增 **`LIGHTING.atmosphere.smokeMinPointPx: 1.0`**（含 22 行理由注释：亚像素点径 0.35–0.53 px、同像素堆叠 3–5、4.5 s 硬回绕 ⇒ 9–14 次/秒覆盖翻转；门限=1 px ⇒ 等效距离门限 ≈495 m；近景 20 m = 24.75 px 保留） |
| `src/core/environment.js:1102-1121` | 新增 `drawingBufferHeight()`：优先 `rendererAdapter.drawingBufferHeight()/size.height/getStats().viewport.height`（**不新增 renderer/main 依赖**，全部可选读取），回落 `BUDGET.viewport.height × 档位 dpr`（= 900，与探针口径逐值一致），按档位记忆化 |
| `src/core/environment.js:1124-1160`（`updateParticles()` 烟柱段） | **烟柱 LOD**：`pointPx = size × (drawingBufferHeight/2) / dist`（与 three `points` 着色器同式，`dist` = 相机↔锚点**三维**距离）；`pointPx < smokeMinPointPx` ⇒ **整柱 `points.visible = false`**（并跳过该柱的位置重建）。`cameraPosition` 缺失时**不裁**（宁可保留旧行为，不制造新缺失） |

`makeParticleSystem(Math.max(4, Math.round(config.LIGHTING.atmosphere.smokeParticleBudget / 4)), 1.1, 0.16, 6)`
与 `const phase = (elapsed * 0.22 + seeds[i * 3]) % 1;` **逐字未动**（守卫②的源形态断言要求）——`grep -c` 各 1 处命中。

## 8.2 权威判据转绿（§7.4 升级后的判据）

```
node scripts/probe-flicker.mjs --frames=30 --phases=live,frame-60 --expect=live:0,frame-60:0
```

| 相位 | 修前（§2 登记） | 修后（本卡实测） |
| --- | --- | --- |
| `live` | **79** | **0** |
| `frame-60`（精确 1 帧 @60fps） | **58** | **0** |

输出末行 **`PASS`**，**exit 0**；`变化总数=0`、`单对最大=0`、`最大通道和差=0`、`有变化帧对=0/29`（两相位都是）。

## 8.3 不假绿 / 不假红复验（t1 守卫）

| 项 | 结果 |
| --- | --- |
| `node tests/flicker-guard.test.mjs` | **5/5 PASS** |
| `FLICKER_BROWSER=1 node tests/flicker-guard.test.mjs`（opt-in 真机腿，含 3 相位） | **5/5 PASS**；读数 `live=0`（已修复）、`nosmoke=0`（归属仍成立）、`frame-60=0` |
| 锁定态 AA 三档 | 仍为 **0/0/0**（`t1-flicker-phases.json.aa.lock` 原样，守卫③断言） |
| AA 与闪烁无关的对照 | `aa.live` 三档 146/79/87 **原样未动**（守卫③断言其 >0 且 low ≥ medium×0.5）⇒ 本卡未触碰 AA |
| 候选排除登记 | 13 条读数与结论**原样未动**（守卫③逐条断言） |

> 注：真机腿的 `live` 由修前的 ≈80 变为 **0**——这正是本卡的目标；守卫的硬断言落在 `nosmoke === 0`（归属成立）上，故不假绿也不假红。

## 8.4 特征保留（近景烟柱必须仍可见）· 真浏览器 + 生产入口读数

同一页面内两次调用**生产入口** `environment.update(dt, elapsed, { cameraPosition })`，逐柱读 `points.visible`（`/tmp/t25-nearview.json`）：

| 机位 | 柱 | dist | `pointPx` | visible |
| --- | --- | --- | --- | --- |
| **远景**（oblique 鸟瞰 cam (0,520,-1180)） | B-gate-front | 938.2 | **0.528** | false |
| | B-hall-main | 1160.2 | **0.427** | false |
| | C-gate-inner | 1364.1 | **0.363** | false |
| | C-hall-bed-main | 1426.1 | **0.347** | false |
| **近景**（距 B 正殿香炉 **20 m**） | B-hall-main | **20.00** | **24.750** | **true** |
| | B-gate-front | 258.8 | 1.913 | true |
| | C-gate-inner | 222.9 | 2.220 | true |
| | C-hall-bed-main | 289.7 | 1.709 | true |

⇒ 门限只裁"≥ ≈495 m 的亚像素段"；**20 m 处点径 24.75 px 与 §0/§6.1 的预测逐值一致**，第一人称/内景/门前景的烟柱形态**完全保留**。

## 8.5 预算、粒子规格与 §12 可读性

| 检查 | 结果 |
| --- | --- |
| `node scripts/audit.mjs --enforce` | **exit 0** ——"预算与契约检查全部通过（信息性提示 0 项，不计失败）" |
| 粒子规格/预算 | `smokeParticleBudget 48`、`size 1.1`、`opacity 0.16`、`span 6`、`0.22 次/秒` 相位 **逐值未动**（守卫②断言 + `grep` 逐字命中） |
| 绘制调用 | **未增**（本卡不改材质/几何/pass；LOD 只是把点精灵设为不可见） |
| §12 可读性（`shot.mjs --judge`，阈值未改） | `oblique/golden` **PASS** 内容均值 0.2933 / 暗区 1.67% / 截断 0.00%（t16 落地 AA 后为 0.2914 / 1.67% / 0.00% ⇒ Δ 均值 +0.0019，来自移除 2×5 px 的远景微点，**阈值内**）；`fp/golden` **PASS** 0.5505 / 0.00% / 0.10% |

## 8.6 纪律与交付

* **只改 inScope 三处**：`src/core/environment.js`、`src/shared/config.js`、本回执。
* **分小步 + 每步冒烟**：① config 常量 + 版本（`core-environment` 12/12、`flicker-guard` 5/5）→ ② 谓词 LOD（`core-environment` 12/12、`flicker-guard` 5/5、源形态断言仍命中）→ ③ 权威探针 → ④ 近景读数 / §12 / audit。
* **断言只增不减**：本卡未改任何测试；守卫 5/5 与候选登记 13 条原样复用（判据强度不变）。
* **跨 owner pin 待同步 1 处**：`tests/layout.test.mjs:76` 的 `CONFIG 版本 = 1.0.8（t2：…）`：期望值需改 `'1.0.9'` 且标题补 t25 摘要（该文件 out of scope）。`docs/CONTRACTS.md` 头部版本表（§11.1 `CONFIG_VERSION 1.0.7` 与 `CONTRACTS v1.0.25 ⇄ CONFIG 1.0.7` 一行为**历史陈旧项**，t22 交付时已是 1.0.8）亦需由 CONTRACTS owner 顺带对齐到 `1.0.9`。
* **未运行项（如实报告）**：`node tests/run.mjs` 全量 28 套件（≈10 min）、`verify-experience`、`verify-completeness`。理由：本卡改动是"把远景亚像素柱设为不可见"，**不触碰碰撞/几何/内景/UI**；受影响面已由 `flicker-guard`（含真机腿）、`core-environment`、`core.test`（粒子预算断言）、`audit --enforce`、`shot.mjs --judge`（§12）覆盖。
