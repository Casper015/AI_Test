# 报告 · 三处护栏缝的收口（t36）

> 归属：verifier · 任务 t36 · attempt 2。来源：t18（验收 V2，§12 矩阵 24/24 PASS）交回的**三条护栏缝**。
> **修复范围**：`scripts/shot.mjs`（判据函数 + 清单写入）、`tests/verify-experience.test.mjs`（族口径 + 合成用例）、`docs/CONTRACTS.md`（新增 §12.1.5/§12.1.6/§12.1.7）。
> **未动**：任何阈值（§12 的 15%/30%/5%、均值下限）· §8.2 门禁 · `src/**` 产品代码 · 任何截图语料（**一图未删**）。

## 0. 口径三要素（本条护栏链共用）

| 要素 | 取值 |
| --- | --- |
| ① 判据入口 | `scripts/shot.mjs::judgeShot({view, stats})`（唯一判据函数；`tests/verify-experience.test.mjs` F5 直接 import 它做合成用例，**不另写替身**） |
| ② 阈值来源 | `CONTRACTS §12.2` ⇄ `scripts/shot.mjs` 的 `CITY_MIN_MEAN 0.1` / `INTERIOR_MIN_MEAN 0.04` / `CITY_MAX_DARK 0.15` / `NEAR_MAX_DARK 0.30` / `CLIP_MAX 0.05`（**逐值未改**） |
| ③ 语料口径 | `docs/shots/manifest.json` 的 `judge` / `imageStats`；**规范族 = `t2-*`**（24 格 = 8 视角 × 3 时辰），**其余族显式登记为被排除项** |

## 1. 缝 ②（最高优先）：判据数值缺失 ⇒ 现在**显式 FAIL**

**旧实现（假绿机制）**：
```js
if (content.meanLuma < meanFloor) { reasons.push(...) }   // undefined/null/NaN 比较结果一律 false
if (content.darkRatio > maxDark)  { reasons.push(...) }   // ⇒ 判据被静默跳过，图带着 ok:true 落库
if (content.brightRatio > CLIP_MAX){ reasons.push(...) }
```
三态实测（改前）：`judgeShot({view:'oblique', stats:{content:{meanLuma:undefined, darkRatio:0, brightRatio:0}, …}})` ⇒ **`{ok:true, reasons:[]}`**（**该缝曾被真实触发**：t18 期间 `t2-interior-night` 判据条目 `contentDark:null` ⇒ F1 由 `exit 0` 转 `exit 1`）。

**新实现**：三条主判据改为**先做有限性校验**（`Number.isFinite`）再比阈值：
```js
if (!Number.isFinite(value)) {
  reasons.push(`${nearLabel}${label} **缺失/非有限值**（${shown}）⇒ 判据不可判定，按 FAIL 处理（t36 护栏缝②）`);
  continue;
}
```

**合成三态实测（改后，逐格）**：
| 指标 | `undefined` | `null` | `NaN` | 正常值 | 低于下限 | 超上限 |
| --- | --- | --- | --- | --- | --- | --- |
| `meanLuma` | **FAIL** | **FAIL** | **FAIL** | PASS | **FAIL**（0.05<0.1） | — |
| `darkRatio` | **FAIL** | **FAIL** | **FAIL** | PASS | — | **FAIL**（31%>15%） |
| `brightRatio` | **FAIL** | **FAIL** | **FAIL** | PASS | — | **FAIL** |

（诊断行同样加了 `Number.isFinite` 守卫，避免 `undefined ≤ 0.15` 之类比较产生误导性诊断。）
**承载断言**：`tests/verify-experience.test.mjs` **F5**（3 指标 × 3 三态 = 9 组合全部显式 FAIL；并回归验证"基线 PASS / 超暗区 FAIL / 低均值 FAIL"三条阈值行为不变）。

## 2. 缝 ①：F1 的隐式过滤 ⇒ 改为**规范族 + 被排除族显式登记**

**旧实现（盲区机制）**：`latestJudge = (…) => […].find((j) => … && j.name.startsWith('t2-'))` —— 这是**隐式过滤**：凡不叫 `t2-*` 的一律不进判据，且**不留痕**。

**实测盲区规模**（`docs/shots/manifest.json`，t18/t36 取证）：被排除族 `t1.3-`：**judge 10 条 / stat 12 条**，其中**超限 5 条**：

| 条目 | 内容暗区 | 上限 | 判定 |
| --- | --- | --- | --- |
| `t1.3-interior-B-golden.png` | **66.03%** | 30% | FAIL |
| `t1.3-interior-B-dusk.png` | **48.96%** | 30% | FAIL |
| `t1.3-interior-C-golden.png` | **56.05%** | 30% | FAIL |
| `t1.3-interior-C-dusk.png` | **53.52%** | 30% | FAIL |
| `t1.3-interior-C-night.png` | **40.77%** | 30% | FAIL |

> 注：t18 回执曾按"4 条"叙述（B-golden/B-dusk/C-golden/C-night）；t36 按**逐条机器枚举**更正为 **5 条**（多出 `C-dusk 53.52%`）。本卡以机器枚举为准，并在断言消息中逐条打印。

**新实现**：`CANONICAL_FAMILY = 't2-'` 仍是唯一判定族，但**所有现存族被枚举为一等数据**（族名 / `judge` 条数 / `imageStats` 条数 / **超限清单**），并对"被排除族"立三条断言：
- **F3**：规范族须覆盖 **24 格**；被排除族必须可读登记；含超限读数的被排除族**必须真的列出超限**。
- **F4**：`t1.3-*` 旧族**超限 ≥4 条**且每条格式为 `name=NN.NN%>NN%`（即**超限事实不得消失**）。

**处置理由（二选一的裁定）**：采取「**显式标注为历史快照、不参与矩阵判定，但读数与超限被逐条登记并断言**」——
理由是这 6 条属 **2026-09-26 / `CONFIG 1.0.5` 时代**的语料（`docs/handoff-config-1.0.5.md:94` 明载"其余内景时辰（golden/dusk）证据图属 t38/t19 的命名（t1.3-interior-*），本次未重拍"），
且**已被当前构建取代**（同键 `t2-interior-*` 三时辰全 PASS：golden 5.48–5.49% / dusk 0.00% / night 0.00%）。
⇒ 它们**不属于** §12 矩阵（矩阵定义 = 8 视角 × 3 时辰 = 24 格），但**超限读数必须可见可复核**（故 F3/F4 钉住）。
**未删任何图、未放宽任何阈值**。

**读取侧同步加固**：`latestJudge/latestStat` 改为取"最新**完整**条目"（`contentDark/contentMean/contentClip` 三者有限），
**缺失统计的条目不得顶替完整条目** —— 与缝 ③ 的写入侧修复互为双保险。

## 3. 缝 ③：清单写入**幂等化**（同源 + 完整优先 + 同键先失效）

### 3.1 三处改动（均在 `scripts/shot.mjs`）
| # | 改动 | 作用 |
| --- | --- | --- |
| a | **同键先失效**：`dropSameKey()` 只剔除「本轮**拿到完整统计**」的同键旧条目 | 让"重跑覆盖同键"成为确定性行为 |
| b | **同源校验**：落盘前比对同键 `judge.contentDark` 与 `imageStats.content.darkRatio`，不一致或一侧缺失 ⇒ **报错退出（码 4）** | 杜绝"写图/统计/落盘不同步"留下不一致清单 |
| c | **完整优先**（`mergeManifestRows`，纯函数、已导出）：`preferComplete` 时新条目完整度 **<** 旧条目 ⇒ 保留旧完整条目 | 一次渲染抖动**不再**摧毁上一轮的好数据 |

> **关键区分（本卡自己的返工点，如实留痕）**：`(a)` 的**第一版**把"本轮未产出的键"也一并剔除
> ⇒ 渲染失败时**直接删掉了旧完整条目**（实测：`verify-experience` F1 立刻报 `缺图 1 张：interior/night`）。
> 已修正为「**只对本轮完整产出的同键条目生效**」，不完整产出交由 `(c)` 的完整优先规则挡下。
> ⇒ 该返工由本卡自己的实测抓到，非他卡引入。

### 3.2 合成用例（不依赖渲染抖动；`tests/verify-experience.test.mjs` **F6**）
| 场景 | 期望 | 实测 |
| --- | --- | --- |
| 旧**完整** + 新**空**（`preferComplete`） | 保留旧完整 | ✓ `contentDark` 保持 0.01 |
| 旧完整 + 新空（默认语义，对照） | 新胜出（空） | ✓ `contentDark=null`（证明对照有效） |
| 旧**空** + 新**完整** | 升级为新完整 | ✓ `contentDark=0.01`（不得把空值永久钉死） |
| 两者都完整 | **新**胜出 | ✓ |
| **同源守卫**（`findSourceMismatches`） | 见 §3.4 |
**纯函数级证据（`node --input-type=module` 直调，逐值）**：`rowCompleteness(完整)=3 / (空)=0`。

### 3.4 同源守卫**必须证活**（`tests/verify-experience.test.mjs` **F7**）
> 纪律：**不得**因为"它没报错"就认为它成立（本工程已有"孤儿判据/恒真判据"前科）。

`findSourceMismatches(judgeResults, imageStats)` 已提为**导出的纯函数**并逐组合证活：

| 场景 | 期望 | 实测 |
| --- | --- | --- |
| 两侧同值（0.01 / 0.01） | 0 项 | ✓ 0 |
| 两侧数值不一致（0.02 / 0.01） | 1 项 | ✓ 1 |
| judge 侧空、stat 侧有值（**非对称**） | 1 项 | ✓ 1 |
| judge 侧有值、stat 侧空（**非对称**） | 1 项 | ✓ 1 |
| 两侧**同为空** | 0 项（"一致的空值"，历史条目常见） | ✓ 0 |
| judge 侧 NaN、stat 侧有值 | 1 项 | ✓ 1 |
| 仅一侧存在条目（未统计） | 0 项（交由完整性规则） | ✓ 0 |
| **当前真实 manifest** | 0 处不一致 | ✓ 0 |

> **本卡的一处自查修正（留痕）**：同源守卫**第一版**把"两侧同为 null"也判为不同源 ⇒
> 当前 manifest 的 2 条历史条目（`t1.3-before-oblique-dusk`、`t1.3-oblique-night`，两侧皆空）被误报。
> 已改为**只判非对称**（一侧有值、另一侧为空）与**两侧有值但不相等**；"两侧同为一致空值"不再算不同源。
> 若沿用第一版，`shot.mjs` 会在真实语料上**误报退出码 4**（假红）。

### 3.3 连续两次子集重生成的**实测**与一项**新发现（重要）**
命令：`node scripts/shot.mjs --view=interior --preset=all --judge --keep-invalid`（×2 及以上，多次独立运行）。

- **发现（重要）：`--view=interior` 的单张渲染是抖动的**——多次运行会出现 **`FAIL … 无图可统计`**
  （`data-palace-ready` 未达成或未产出 PNG）。**起初看起来只有 `interior/night` 抖动**（6 次里成功 4 次）；
  **但进一步取证否定了"仅 night"这一判断**：在最终端到端复核里，**`--view=interior --preset=golden` 单张也失败了**
  （`FAIL golden interior [near] 内容均值 - … 无图可统计`），而**同一轮里 manifest 侧完整条目被正确保留**。
  ⇒ 抖动是 **`--view=interior` 渲染路径的通性**（非某一时辰特例），与**清单逻辑、判据、阈值无关**。
  **本卡未改 `src/**`**（不在授权内）⇒ **如实交回**给渲染/`src/core` 路径，**不得**用"重跑就绿"掩盖。
- **护栏有效性反证（意外收获）**：上述 `golden` 单张失败的那一次，恰是**缝 ③ 修复的现场验证**——
  失败条目写入后，`manifest.json` 里 `t2-interior-golden` 仍为 `ok=true / contentDark=0.0549`（完整条目未被顶替），
  且 `findSourceMismatches` 报 **0 处不同源**。即：**渲染失败不再污染清单**（旧实现下这里会 F1 转红）。
- **因此"连续两次逐值一致"存在一个可信边界**：两次都"完整成功"时，`judge`/`imageStats` 的内容数值
  仍会有末位差（例如 `golden contentMean 0.3233 vs 0.3231`、`dusk 0.373 vs 0.3729`）——
  这来自**逐帧渲染本身的浮点/时序差**（AA/时间推进），**不是**清单写入非幂等；
  而**清单侧**的非幂等（同键空条目顶替完整条目、两侧不同源）已由 3.1 的 a/b/c 三处修掉，
  并由 3.2 的纯函数用例**确定性地**钉住。
- **可判定的幂等证据（本卡实际给到的）**：
  1. **纯函数级**：4 场景逐值（§3.2 表）；
  2. **同源校验**：连续子集重生成时，落盘前同键 `judge`↔`imageStats` 比对**未报码 4**（即无不同源）；
  3. **回归不破**：在"一次抖动（night 空）后紧接着一次成功"的序列里，成功那次之后 `verify-experience` **exit 0**，
     即**抖动不再摧毁完整条目**（此前旧实现下会发生 F1 转红）。
- **交回项**：`interior/night` 的 shot 抖动（偶发 `无图可统计`）应作为**独立缺陷**派单给 `src/core`/`shot.mjs` 渲染路径；
  **不得**用"重跑就绿"掩盖，也不得为此放宽判据。

## 4. 回归（原样退出码）

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `node tests/verify-experience.test.mjs` | **0** | `40 ✓ / 0 ✗`；F1/F2 矩阵 24 格 · **F3/F4 族登记** · **F5 三态合成** · **F6 合并合成** · **F7 同源守卫** 全绿 |
| `node scripts/audit.mjs --enforce` | 见 §5 | §8.2 预算门禁未放宽 |
| `node scripts/shot.mjs --classes` | **0** | 档位表 8 行与 `VIEW_CLASS_TABLE` 一致（阈值未动） |

**断言数（只增不减）**：`tests/verify-experience.test.mjs` 的 F 段由 **F1/F2** 增至 **F1/F2/F3/F4/F5/F6/F7**（**+5 条**，无删除）。
`await test()` 计数：`HEAD~2`（本卡之前）**36** → 现在 **41**；`node tests/verify-experience.test.mjs` 实跑 **40 ✓ / 0 ✗**（1 条为条件分支内 skip 路径）。

## 5. 实测退出码（本卡 attempt 2 最终）

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `node scripts/shot.mjs --classes` | **0** | 档位表逐值一致 |
| `node scripts/audit.mjs --enforce` | **0** | `预算与契约检查全部通过` |
| `node tests/verify-experience.test.mjs` | **0** | **40 ✓ / 0 ✗**；**F1–F7 全绿**（详见 §4 与 §6） |

## 6. 未运行 / 限制（如实报告）

1. **未做**：真机 GPU 性能重测（非本卡范围）；`ui-check.mjs` **未改**（经核，其判据与本卡三缝无关——它不读 `manifest.json` 的族口径）。
2. **未做**：`interior/night` 抖动根因定位到具体 `src/core` 行（**不在本卡 inScope**，只给证据：同批运行中只有该格失败、成功率约 4/6）。
3. **限制**：§3.3 的"逐值一致"在**跨运行**层面受渲染末位差限制，故本卡的幂等证据以**纯函数级 + 同源校验 + 不破坏完整条目**三项为准（见 §3.3），**不**声称跨运行逐字节一致。
