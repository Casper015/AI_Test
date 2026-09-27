# t18 · 验收 V2：八视角 / 第一人称走查 / 性能与风格

> 归属：verifier · 任务 t18 · attempt 2。**只读终判**；不改任何 `src/**`、不改弱任何判据、不放宽任何阈值。
> 结论：**八视角（8/8 机位登记 + 8/8 视角预算达标）· 走查（49/49 段可达）· §12 矩阵（24/24 判定 PASS）· 性能（双 LOD 列全 ≥ 达标，真实 GPU 可用）**
> **均通过**；同时登记 **1 处护栏盲区**（F1 只认 `t2-*` 前缀，使 6 张 t1.3 旧内景语料的超限被静默排除）与 **1 处口径澄清**（若干格「整帧诊断」与「内容口径」差异较大，依 §12.1.1「真天空掩码为唯一依据」属合法口径差、非豁免放行；换整帧口径亦无格翻转）。

## 0. 口径三要素

| 要素 | 取值 |
| --- | --- |
| ① **视口/质量/URL** | `1440×900` / `DPR 1` / `quality medium` / `?ui=0&shot=1`（§12.1 定值，不叠加 `stats=1`）；判据对象 = **最终帧缓冲**（含阴影 pass + Bloom/Output）。 |
| ② **判据与阈值** | §12 三条主判据 + 第 4 条掩码防护：内容均值 ≥ `0.1`（`interior` ≥ `0.04`）；内容暗区 ≤ **15%**（city：oblique/iso/orbit/zone）或 **≤30%**（near：axis/focus/fp/interior）；高光截断 ≤ **5%**；`mask.guard.tripped` ⇒ 直接 FAIL。luma = `0.2126R+0.7152G+0.0722B`（**不线性化**）；暗区 `luma<0.08`；截断 `luma>0.9`；容差 `--content-tol=6`。 |
| ③ **背景引用** | **真天空掩码为唯一依据**（`?stats=1` 的 `backgroundDisplayedTopHex↔HorizonHex` 线段，容差 6）；band 与像素法**并列必报差**、超容差告警；「无天空视角」正式口径：权威背景占比 <0.5% ⇒ 整帧即内容、**阈值与分类一律不变**。 |

**档位表可复算**：`node scripts/shot.mjs --classes` ⇒ `city(≤15%,均值≥0.1)=oblique/iso/orbit/zone`、`near(≤30%,均值≥0.1)=axis/focus/fp`、`interior(≤30%,均值≥0.04)`；与 `shot.mjs:VIEW_CLASS_TABLE` 逐值一致。

## 1. 八视角（§12 矩阵 8×3 = 24 格逐格）

矩阵语料 = 本卡前一轮重生成的 `t2-*`（`docs/shots/manifest.json`，2026-09-27 09:2x；CONFIG 1.0.9 前一轮）；判据入口与 `verify-experience` F1 同源（`latestJudge/latestStat` 均取 `name.startsWith('t2-')` 的最新一条）。

| # | view/preset | 档 | 内容均值 | 下限 | 内容暗区 | 上限 | 暗区余量 | clip | 上限 | clip 余量 | 掩码防护 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | oblique/golden | city | 0.2932 | 0.1 | 1.67% | 15% | 13.33pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 2 | oblique/dusk | city | 0.2130 | 0.1 | 1.14% | 15% | 13.86pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 3 | oblique/night | city | 0.1569 | 0.1 | 9.66% | 15% | 5.34pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 4 | iso/golden | city | 0.2946 | 0.1 | 4.98% | 15% | 10.02pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 5 | iso/dusk | city | 0.2101 | 0.1 | 2.36% | 15% | 12.64pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 6 | iso/night | city | 0.2341 | 0.1 | 3.01% | 15% | 11.99pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 7 | orbit/golden | city | 0.2780 | 0.1 | 4.64% | 15% | 10.36pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 8 | orbit/dusk | city | 0.2084 | 0.1 | 2.80% | 15% | 12.20pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 9 | orbit/night | city | 0.2074 | 0.1 | 7.78% | 15% | 7.22pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 10 | zone/golden | city | 0.2932 | 0.1 | 1.67% | 15% | 13.33pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 11 | zone/dusk | city | 0.2130 | 0.1 | 1.14% | 15% | 13.86pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 12 | zone/night | city | 0.1569 | 0.1 | 9.66% | 15% | 5.34pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 13 | axis/golden | near | 0.3228 | 0.1 | 2.40% | 30% | 27.60pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 14 | axis/dusk | near | 0.2446 | 0.1 | 2.66% | 30% | 27.34pp | 0.00% | 5% | 5.00pp | false | **PASS** |
| 15 | axis/night | near | 0.1868 | 0.1 | 15.00% | 30% | 15.00pp | 0.01% | 5% | 4.99pp | false | **PASS** |
| 16 | focus/golden | near | 0.4242 | 0.1 | 4.10% | 30% | 25.90pp | 0.02% | 5% | 4.98pp | false | **PASS** |
| 17 | focus/dusk | near | 0.3451 | 0.1 | 5.61% | 30% | 24.39pp | 0.03% | 5% | 4.97pp | false | **PASS** |
| 18 | focus/night | near | 0.2817 | 0.1 | 23.90% | 30% | **6.10pp** | 0.03% | 5% | 4.97pp | false | **PASS** |
| 19 | fp/golden | near | 0.5505 | 0.1 | 0.00% | 30% | 30.00pp | 0.10% | 5% | 4.90pp | false | **PASS** |
| 20 | fp/dusk | near | 0.4772 | 0.1 | 0.00% | 30% | 30.00pp | 0.15% | 5% | 4.85pp | false | **PASS** |
| 21 | fp/night | near | 0.3713 | 0.1 | 0.02% | 30% | 29.98pp | 0.29% | 5% | 4.71pp | false | **PASS** |
| 22 | interior/golden | interior | 0.3231 | 0.04 | 5.49% | 30% | 24.51pp | 0.68% | 5% | 4.32pp | false | **PASS** |
| 23 | interior/dusk | interior | 0.3729 | 0.04 | 0.00% | 30% | 30.00pp | 2.05% | 5% | 2.95pp | false | **PASS** |
| 24 | interior/night | interior | 0.4292 | 0.04 | 0.00% | 30% | 30.00pp | **3.70%** | 5% | **1.30pp** | false | **PASS** |

**判定：24/24 PASS（FAIL = 0）。**

**最擦线项（`F2`「余量 ≤1pp 不作为通过证据」纪律适用）**：暗区最紧 = `focus/night` **6.10pp** · `oblique|zone/night` 5.34pp；clip 最紧 = `interior/night` **3.70% / 余量 1.30pp** · `interior/dusk` 2.95pp；均值最紧 = `oblique|zone/night` 余量 **0.0569**。**无 ≤1pp 的擦线项**；`axis/night` 暗区 **15.00%**（上限 30%，余量 15.00pp）——此前若按 15% 档会判 FAIL，现行 §12 档位表把它归入 near(≤30%)（`CONTRACTS v1.0.6` 明确 axis 档位），故为 PASS。

> 第 22–24 行取**内景重生成后**的读数（本卡实测，CONFIG 1.0.9）：`interior/golden 5.49% · dusk 0.00% · night 0.00%`，clip `0.68/2.05/3.70%`；与 `?view=interior --preset=all --judge` 的 `PASS ×3` 逐值一致。

**判定**：24/24 **PASS**；`verify-experience` F1 **✓ 24/24**（该套件整体 **exit 0**，35 ✓ / 0 ✗）。
**八视角机位登记**（A1–A3 ✓）：8 视角编号 1–8 与 `config` 顺序一致（oblique→iso→axis→zone→focus→interior→fp→orbit）；`iso` 正交、其余透视；过渡 1.2s；机位普查 `zone 7 / fp-spawn 5 / interior 43 / focus-extra 6 = 61`，与 `LAYOUT` 实测一致。

### 1.1 逐条分类（本卡要求的两个专门类别）

**A「三项达标却 FAIL」= 0 格。** 全 24 格中，前三项主判据（均值/暗区/clip）全达标、而第 4 条掩码防护触发的格 **不存在**；`mask.guard.tripped` 全为 `false`。

**B「被豁免却本该 FAIL」= 0 格。**（本卡逐格枚举取证，见下）

- **「无天空视角」正式口径（§12.1.1）放行的格：0 格** —— 24 格均**有**可识别天空/背景（`mask.guard.tripped` 全 `false`），无格走 `<0.5%` 豁免分支。
- **口径差枚举（整帧诊断 vs 内容口径）**：逐格比较"若强行改用整帧口径是否会翻转判定"——

| 格 | 内容暗区 | 档上限 | 整帧暗区（诊断） | 换整帧是否翻转 |
| --- | --- | --- | --- | --- |
| `fp/night` | 0.02% | 30% | **26.43%** | 否（26.43% ≤ 30%） |
| `focus/night` | 23.90% | 30% | 17.13% | 否 |
| `orbit/night` | 7.78% | 15% | 5.92% | 否 |
| `focus/dusk` | 5.61% | 30% | 4.02% | 否 |
| 其余 20 格 | ≤ 5.49% | 15%/30% | ≤ 15.00% | 否 |

> **结论**：**24/24 格在两种口径下判定一致，0 格翻转**（`max(整帧诊断) = fp/night 26.43% ≤ 30%`）⇒ 不存在"靠口径选择才通过"的格。`fp/night` 的 26.43%↔0.02% 差值来自 §12.1.1 的口径设计：该机位夜空（真天空掩码覆盖）被正当地剔出内容分母，而整帧口径把约 26% 的夜空计入"暗区"。§12.1.1 明文以**真天空掩码为唯一依据**、整帧数字**降为二级诊断**，故按内容口径判定为合法；**本卡不把它记作"豁免放行"**，因为豁免分支（背景占比 <0.5%）本轮**一次都没被用到**。

## 2. 护栏盲区（本卡新发现的真实问题，如实登记）

`verify-experience` F1 用 `name.startsWith('t2-')` 过滤 judge 条目。矩阵语料里存在**第二族内景语料** `t1.3-interior-{B,C}-{golden,dusk,night}`（**2026-09-26 / CONFIG 1.0.5 时代**，见 `docs/handoff-config-1.0.5.md:94` 声明"其余内景时辰（golden/dusk）证据图属 t38/t19 的命名（t1.3-interior-*），本次未重拍"），其 judge 值为：

| 条目 | 内容暗区 | 上限 | 判定 |
| --- | --- | --- | --- |
| `t1.3-interior-B-golden` | **66.03%** | 30% | FAIL |
| `t1.3-interior-B-dusk` | **48.96%** | 30% | FAIL |
| `t1.3-interior-B-night` | 1.36% | 30% | PASS |
| `t1.3-interior-C-golden` | **56.05%** | 30% | FAIL |
| `t1.3-interior-C-dusk` | **53.52%** | 30% | FAIL |
| `t1.3-interior-C-night` | **40.77%** | 30% | FAIL |

- **事实**：这 6 条**不在** §12 矩阵（矩阵按 `README §105` 的「八视角 × 三时辰」= 24 格，命名族为 `t2-*`），且**已被当前构建取代**——本卡重生成的 `t2-interior-{golden,dusk,night}` 全 PASS（5.49%/0.00%/0.00%）。
- **风险（盲区）**：F1 的前缀过滤使这 6 条**超限读数对 F1 不可见**；若将来矩阵命名族变更（`t2-`→其它）而旧条目留存，F1 会走「缺图」分支（该分支**会红**，见 `assert(missing.length === 0)`）⇒ **不会假绿**；但**同族内被新命名取代的旧条目**不会被复核。
- **建议（不在本卡 inScope，交回派单）**：① 把这 6 条显式标注为**历史快照/不参与判定**（adr 或 manifest 字段），或② 删除/重命名以消除双族歧义，或③ 把 F1 的过滤改为「按 view/preset 取最新**任意族**条目并断言族名一致」。**不得**直接放宽阈值或删图了事。

## 3. 第一人称走查（49 段逐段）

`verify-experience` B 段 **全绿**（`node tests/verify-experience.test.mjs` ⇒ **exit 0**）：

| 判据 | 读数 |
| --- | --- |
| **B1** 路线 8 段（实为 49 段子集）在 1m 真实可行走图全部可达 | **✓ 49/49 段**（南桥北端→南城门内 36m … 东后殿门内→御花园·北殿门内 467m）；与 t17 逐段表**逐值一致** |
| **B2** 沿真实路径无"真阻挡" | ✓ 受阻采样 **0**（唯一允许项 = 落差 = `snapDownDistance` 等值边界） |
| **B3** 台阶高差 | ✓ 路径最大上台阶 **0.5m** = 阈值上限（含界） |
| **B4** 门洞净宽 | ✓ **63/63** ≥ `max(1.1m, 登记宽×0.5)`（最小 7.3m），0 具名例外 |
| **B5** 院墙阻挡 | ✓ **60/60** 段墙实体段被阻挡（探针避开洞口） |
| **B6** 水面/桥面 | ✓ 8 水体全不可站 · 4/4 桥面可站 |
| **B7** 包络越界 | ✓ 四面越界全部被拒（`envelope`） |
| **B8** 抬高建筑/城门 | ✓ 台基内不可站（`stepTooHigh`）· 6/6 门洞在其真实地面高度可通行 |
| **B9** 东西宫苑侧门 | ✓ 6/6 侧门横断面可走 · 起点→5 区 fp-spawn 图路径全可达（151/769/323/321/1001m，blocked=0） |
| **B10** 全线连通 | ✓ **98 个关键点同一连通分量**（图 **725781** 可走格 @1m） |

## 4. 性能（§8.2）

### 4.1 预算（双 LOD 列，`audit --enforce --lod-reference=oblique --lod-reference-near=fp` ⇒ **exit 0**）

| 区/项 | 近场列（fp） | 远场列（oblique） | 预算 | 判定 |
| --- | --- | --- | --- | --- |
| 主场景绘制调用 | — | **342** | 350 | ✓ |
| 可见三角面 | — | **425317** | 1,500,000 | ✓ |
| B | 62 / 85848 | 62 / 85848 | 70 | ✓ |
| C | 56 / 56492 | 56 / 56492 | 60 | ✓ |
| D | 49 / 47660 | 49 / 47660 | 56 | ✓ |
| E | 49 / 45832 | 49 / 45832 | 56 | ✓ |
| F | 80 / 179700 | 80 / 179700 | 80 | ✓（用满） |
| GREYBOX | 39 / 6912 | 39 / 6912 | 350 | ✓ |

- **合批口径**：**激活 LOD 档**（`--lod=active`，t28 口径；`--lod=all` 为"诊断，不用于预算判定"）。合批后 `GREYBOX 704 体块→39 批次`、`F 1360 体块→80 批次`（区域×材质角色合并）；`C3 ✓` 逐区合批比 3.7–6.1×。
- **逐区调用（激活档，另一口径入口 `verify-experience C1`）**：B 65/70 · C 59/60 · D 51/56 · E 52/56 · F 80/80 ✓；`C2` 整城 **307/350** 调用 · **443828/1.5M** 三角面 ✓（与 audit 的 342 差异来自统计口径：audit 含阴影 pass / VE 为可见调用，两者各自与本口径预算对齐）。
- **单建筑**：逐槽位工厂 near 档单栋最大 **11932**（B-hall-main）/ 预算 24000 ✓。

### 4.2 八视角逐视角读数（audit，激活档）

| 视角 | 投影 | 可见批次 | 可见三角面 | 阴影批次 | 可见对象 | 机位(米) |
| --- | --- | --- | --- | --- | --- | --- |
| oblique | perspective | 335 | 422444 | 324 | 335 | (0,520,-1180) |
| iso | orthographic | 335 | 422444 | 324 | 335 | (367,755,367) |
| axis | perspective | 306 | 418748 | 300 | 306 | (0,46,-556) |
| zone | perspective | 335 | 422444 | 324 | 335 | (0,520,-1180) |
| focus | perspective | 331 | 421856 | 320 | 331 | (0,26,-230) |
| interior | perspective | 327 | 421616 | 316 | 327 | (0,6,-128) |
| fp | perspective | 333 | 422300 | 322 | 333 | (-30,2,-360) |
| orbit | perspective | 335 | 422444 | 324 | 335 | (341,444,-466) |

**最高可见批次 = oblique/orbit/zone 335 ≤ 350 ✓**（八视角全部在预算内）。

### 4.3 质量档性能（真实 GPU 可得 —— 如实标注来源）

- **真实 GPU 可得**：`--use-angle=metal` 取得 **ANGLE (Apple M5)、MAX_SAMPLES=8**（在制品 t16 实测，`docs/handoff-t2-antialias.md`）。
- **权威口径 = 忙碌渲染时间**（同步调生产 `renderSystem.render()`，每帧 `gl.readPixels(1×1)` 强制 GPU 同步；headless rAF 被节流到 ~15Hz ⇒ **rAF 间隔不可用**）：`low` **4.93ms**(203fps) / `medium` **6.78ms**(147fps) / `high` **8.62ms**(116fps)；调用 1052/1194/1494。
- **AA 隔离成本曲线**（固定 medium、只改 `?aa=`，调用/三角面逐值相同）：off 5.23 → 2 6.79(+30%) → 4 7.09(+36%) → 8 8.63ms(+65%)；**AA 不增加任何 draw call**。
- **软光栅场景的如实声明**：`--disable-gpu` 退 SwiftShader 时 **1.1s/帧**，**帧率不具代表性**；`shot.mjs` 自报行亦标注「SwiftShader 软光栅 → 帧率不具代表性；批次/三角面/灯数可参考」。故**本卡性能结论以上述真实 GPU 忙碌渲染时间为准**，软光栅数字仅作功能回归。

## 5. 退出码（原样）

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `node tests/verify-experience.test.mjs` | **0** | **35 ✓ / 0 ✗**（复核两次一致）；A1–A3（八视角）· B1–B10（走查）· C1–C4（性能/合批）· D1（风格/取景）· **F1（24/24）**全绿 |
| `node scripts/shot.mjs --view=interior --preset=all --judge --keep-invalid` | **0** | 第 2 次运行：`全部 3 张截图有效`；`PASS golden 5.48% / dusk 0.00% / night 0.00%`（第 1 次的非幂等事故见 §5.1） |
| `node scripts/audit.mjs --enforce --lod-reference=oblique --lod-reference-near=fp` | **0** | 主场景 342/350 · 逐区双列全 ✓ · 三角 425317/1.5M · `预算与契约检查全部通过` |
| `node scripts/shot.mjs --view=interior --preset=all --judge --keep-invalid` | **0** | `全部 3 张截图有效`；`PASS golden 5.49% / dusk 0.00% / night 0.00%` |
| `node scripts/shot.mjs --classes` | **0** | 档位表 8 行，与 `VIEW_CLASS_TABLE` 逐值一致 |

## 5.1 本卡对语料的操作与**一次非幂等事故**（如实留痕）

**本卡对 `docs/shots/**` 的操作**：
1. 前一轮（t19）已全量重生成 24 格矩阵（`t2-*`，2026-09-27 09:2x），使 F1 转绿；
2. **本卡**（t18）另跑 `node scripts/shot.mjs --view=interior --preset=all --judge --keep-invalid`（**内景子集**），用于判断 `t1.3-interior-*` 旧族是否只是旧构建产物。

**事故与修复（如实登记，不掩盖）**：**第 1 次**内景子集重生成后，`manifest.json` 里 `t2-interior-night.png` 的判据条目为 `ok:false / contentDark:null / reasons:['无图可统计']`，而 `imageStats` 侧同图数据正常（`meanLuma 0.4292`）⇒ **两侧不一致**，并立刻使 `verify-experience` F1 **由 0 转红**（`interior/night 暗区null%>null%`）。
- **影响面**：仅 `interior/night` 一格；其余 23 格不受影响。
- **修复**：**重跑同一条子集命令**（第 2 次）⇒ 同一路径条目被更新为 `ok:true / contentDark:0`，F1 复核 **exit 0（35 ✓ / 0 ✗）**；`t2-` 判据条目中 `contentDark` 为空者 **0 条**（残留 2 条空值属历史族 `t1.3-before-oblique-dusk` / `t1.3-oblique-night`，不参与 F1）。
- **性质判定**：这是 `scripts/shot.mjs` **子集重生成的非幂等/竞态**（同一次运行内"写图 / 统计 / 落 manifest"次序偶发不同步），**不是** §12 判据或几何的缺陷，也**不是**本卡引入的判据放宽。**本卡未改 `scripts/shot.mjs`**（不在 inScope）。
- **建议（交回派单）**：① `shot.mjs` 在写 manifest 的判据条目时，应**同一图两个条目（judge / imageStats）取自同一次统计**，两值不一致应直接报错而非落盘；② 子集重生成应先**失效同键旧条目**再写新值，避免"最新条目恰好为空"被 `latestJudge` 选中；③ 文档侧应提示"矩阵判据只能整组重生成，避免子集重生成造成的瞬时红"。

## 6. 仍红项 / 交回

1. **F1 护栏盲区（§2）**：`t1.3-interior-*` 6 条旧内景语料超限但被 `t2-` 前缀过滤排除 ⇒ 建议标注历史快照或改过滤口径；**不得**放宽阈值或删图规避。
2. **`t1.3-interior-{B,C}-*.invalid.png` 等历史遗留**（`docs/handoff-ledger-closeout.md:18` 已登记"保留不删"）：与 §2 同源，建议一并归入历史快照标注。
3. **最擦线项（余量 ≤2pp，`F2`「余量 ≤1pp 不作为通过证据」纪律适用）**：`interior/night` clip **3.70% / 余量 1.30pp**（最紧）· `interior/dusk` clip 2.05% / 余量 2.95pp。**均 >1pp，无 ≤1pp 的擦线项**。另：`axis/night` 暗区 **15.00%**，现行档位表把它归 **near(≤30%)**（`CONTRACTS v1.0.6` 明确 axis 档位），余量 15.00pp；**若按 city(≤15%) 档会判 FAIL** ⇒ 该格结论**依赖档位归属**，后续若改动 `VIEW_CLASS_TABLE` 必须同步复核并不得借机收紧/放宽。
4. **本卡未复核项**：真实 GPU 三档性能与 AA 成本曲线引自 t16 回执（本卡**只读复核**其口径与数字自洽性，未重跑真机性能）；`§12` 矩阵 `oblique/night` 的 `contentMean` 缺失（掩码全白，见下注）不参与均值判据。

> **注（判据失效保护缝，代码级已证、本轮未触发）**：`judgeShot()` 的均值判据写作 `content.meanLuma < meanFloor`；
> 当 `meanLuma` 为 `undefined`/`null` 时该比较为 `false` ⇒ **均值判据静默通过**。
> 本卡用合成输入实证：`judgeShot({view:'oblique', stats:{content:{meanLuma:undefined, darkRatio:0, brightRatio:0}, mask:{guard:{tripped:false,reasons:[]}}, darkRatio:0, meanLuma:0.5}})` ⇒ `{ok:true, reasons:[]}`（**缺失均值未被拦**）。
> **该缝在本卡真实触发过 1 次**（不是纯理论）：本卡第 1 次内景子集重生成后，`t2-interior-night` 的判据条目为
> `ok:false / contentDark:null / contentMean:null`（`reasons:['无图可统计']`）而被 `latestJudge` 选中 ⇒ F1 报 `interior/night 暗区null%>null%`；
> **该格恰好也带 `ok:false`**，故被 F1 拦下；**但若同一条目是 `ok:true` 而 `contentMean=null`**，则均值判据会**静默通过**（仅余暗区/clip 两条仍生效）。
> **最终状态**：修复后 24 格**均带有效** `contentMean`/`contentDark`（本卡按 F1 同一取法 `name.startsWith('t2-')` 复核：`oblique/night=0.1569`，空值 **0 条**；残留 2 条空值属历史族 `t1.3-before-oblique-dusk`/`t1.3-oblique-night`，不参与 F1）⇒ **本卡结论不受该缝影响**。
> **建议**：均值缺失应显式判 FAIL 或至少告警。**本卡未改**（`scripts/shot.mjs` 不在 inScope），**登记交回**。
>
> **附：本卡的一处自查纠错（留痕）**：首版提取脚本未加 `startsWith('t2-')` 过滤，从 `manifest.json` 取到了 `interior/*` 的**旧族条目**（`t1.3-interior-C-*`，2026-09-26），一度得出"interior/golden 56.05% FAIL、interior/night 40.77% FAIL"与"24 格中 2 格真实不达标"的**错误结论**。
> 改用与 F1 **同一取法**（前缀过滤 + 反向取最新）后更正为 **24/24 PASS**。该旧族超限**确实存在**但**不在 §12 矩阵内**，已作为**护栏盲区**单独登记于 §2（未掩盖、未删除）。

## 7. 原始证据

- §12 逐格表 + 分类：`work/t18/v2-table.txt`（探针 `work/t18/v2.mjs`）
- 内景重生成（CONFIG 1.0.9）：`work/t18/interior-regen.log`
- 双 LOD 列预算：`work/t18/audit-lod.log`
- 走查/八视角/风格断言：`work/t18/ve.log`
- 语料：`docs/shots/manifest.json`（本卡前一轮重生成 `t2-*`；本卡另重生成 `t2-interior-*`）

> **口径声明**：所有判定取自 `manifest.json` 的 judge 记录（**真天空掩码口径**、§12 原阈值）与 `audit --enforce`（§8.2 原阈值）；**未**放宽任何判据/阈值，**未**使用 `--allow-no-sky` 静默退回，**未**修改 `src/**`。
