# t12 · 判定不确定性（Float32/double 精度统一）：机制、最小修复与常驻守卫

> 卡：`t12 [precision] — 消除判定不确定性（Float32/double 精度统一）`，修 `t77-F16`
> 范围：`src/interaction/walk-graph.js`（一处取样返回值）+ 只读探针 + 常驻守卫 + 本报告。
> **阈值一字未改**：`maxStepHeight 0.5` / `snapDownDistance 0.6` / `BOUNDARY_EPS 1e-9` 全部逐值不变。

---

## 0. 结论（一句话）

`walk-graph.sample()` **首次**取样返回 `solver.probe` 的 **float64**、**缓存后**返回 `heights[i]`（`Float32Array`，float32）
⇒ 同一格对在不同调用历史下拿到不同高度；而 `canStep` 的含界判据只留 `BOUNDARY_EPS = 1e-9`，
float32 在 0.6/1.5 附近的 ulp ≈ **6e-8**（比容差大 **60 倍**）⇒ **判定随调用历史翻转**（整城实测 **35 对**）。
最小修复 = **让两条取样路径同精度**（统一为图侧 float32，即 `CONTRACTS §12.1.4.5` 声明的权威精度），
判定面校验和与修复前**逐值相同**（零判定位移），全部既有护栏保持绿。

---

## 1. 确切机制（file:line）

| # | 位置（修前 `git HEAD`） | 机制 |
| --- | --- | --- |
| ① | `src/interaction/walk-graph.js:40` `const heights = new Float32Array(cols * rows);` | 格高缓存为 **float32** |
| ② | `:57` `return { ok: result.ok, y: result.surfaceY, reasons: result.reasons };` | **首次**取样返回 `probe` 的 **float64** |
| ③ | `:51` `if (cells[i] !== -1) return { ok: cells[i] === 1, y: heights[i], reasons: [] };` | **缓存后**返回 **float32** ⇒ 与 ② 不同精度 |
| ④ | `:65-66` `if (b.y - a.y > step.maxStepHeight + BOUNDARY_EPS) return false;` / `if (a.y - b.y > step.snapDownDistance + BOUNDARY_EPS) return false;` | 含界判据只留 `1e-9`，**吸收不了 float32 的 6e-8** |
| ⑤ | `:18` `const BOUNDARY_EPS = 1e-9;` | 容差比图侧 ulp 小 60 倍 ⇒ 等值阈值处必然翻面 |

### 1.1 量化（真实 5 区装配 + `cellSize:1` 整城图，`scripts/probe-precision-consistency.mjs`）

| 读数 | 修前 | 修复后 |
| --- | --- | --- |
| 同一格「首次 vs 缓存」`y` 的最大差 | **9.537e-8**（> `BOUNDARY_EPS` **95 倍**） | **0** |
| 240 格中「首次 === 缓存」的比例 | 21/173 | **173/173** |
| **产品级**历史翻转（`canStep` 首次 vs 缓存） | **35 / 35 对相反** | **0 / 35** |
| 判定面校验和（细口径相邻可走对 1,425,588 条） | `c368beed`（可跨 1,423,122 / 不可跨 2,466） | **`c368beed`（逐值相同）** |

35 对全部是**设计好的 0.6 下行级差**（如 `y 1.5 ↔ 0.9`）：
`float64 Δ = 0.6` 恰好含界 ⇒ `canStep` **可跨**；`float32 Δ = 0.600000023842 > 0.6 + 1e-9` ⇒ **拒**。
这正是 `report-completeness.md` 登记的"同一棵树、同一判据，仅因调用历史不同而 ±1~2 项不稳定"。

---

## 2. 最小修复（实测择优：两个候选都测了）

卡面给出两个候选，**都实测**后择优：

| 候选 | 做法 | 判定面校验和 | 既有护栏 | 判定 |
| --- | --- | --- | --- | --- |
| **B（本次落地）** | 首次取样也返回 `heights[i]` ⇒ **统一为图侧 float32** | `c368beed`（**与修前逐值相同**） | 全绿 | **✅ 采纳** |
| A | `heights` 改 `Float64Array`（首次/缓存都 float64） | `0648c9f4`（可跨 +35 / 不可跨 −35） | `interaction.test` **F27 转红** | ❌ 暂不采纳（见 §2.1） |

**候选 B 的落地位置**：`src/interaction/walk-graph.js:82`
`return { ok: result.ok, y: heights[i], reasons: result.reasons };`（原为 `y: result.surfaceY`）。

**为何 B 是"统一同精度"而不是"降精度"**：`CONTRACTS §12.1.4.5` 明文规定
「**一切可跨/级差判定必须以 float32（图侧 `Float32Array` 的存储精度）为准，并留裕量**」——
即 float32 **就是**本库声明的权威判定精度；缺陷在于"两条路径精度不一致"，不在"精度是 float32"。
B 把首次取样也落到同一口径，**判定位移为零**（校验和逐值相同），符合"判据只增不减"。

**口径不变项**：`maxStepHeight 0.5`、`snapDownDistance 0.6`、`BOUNDARY_EPS 1e-9`（两侧同一 EPS）、
`heights` 仍 `Float32Array`、`WALKABLE`/几何/预算一律未动。

### 2.1 候选 A（Float64）的实测后果（**已上报，不在本卡授权内**）

把 `heights` 改为 `Float64Array` 后实测：
- 判定面校验和 `c368beed → 0648c9f4`：整城 **+35 条** 0.6 下行边由"双向拒"变"仅下行可跨"（可跨 1,423,122 → 1,423,157）；
- `tests/interaction.test.mjs` 的 **F27「过渡带不得存在单向」在 `cellSize:3` 粗口径上由绿转红**：
  `WK-C-side-{west,east}-rear-transition-1` 由「正/反向均不可达」变「正=false / 反=true」。
  根因是**粗网格跳过中间级**：C 侧两配房的门外梯链是 `1.5 → 1.2 → 0.9`（逐跳 0.3，细口径双向可跨），
  但 `cellSize:3` 的网格跳过 1.2 那一级 ⇒ 图上直接相邻成 `0.9 ↔ 1.5`（Δ=0.6）⇒ 变成"能下不能上"。
  修前 float32 把这条边**两个方向都拒**（Δ32 = 0.600000023842 > 0.6），于是 F27 的"单向 = 0"**空真通过**（假绿）。
  ⇒ 候选 A 会把一条**粗口径假绿**变成真红，需要先补几何/改粗口径登记（属几何卡与 F27 归属卡），
  故本卡不采纳 A，只如实登记该读数。

---

## 3. 确定性证据

### 3.1 ≥3 次独立运行逐值一致

| 证据 | 做法 | 结果 |
| --- | --- | --- |
| 探针 ①c | 同一次运行内 **3 次全新建图**跑 `connected()` | `724481/ok/0` × 3 **逐值相同** |
| 探针 ①b | 同图「冷 flood（`connected()` 内）→ 暖 flood（随后单独 flood）」 | `visited` 724481 → 724481（差 **0**） |
| 常驻守卫 ④ | 同一次运行内 **3 次全新建图**跑判定面指纹 | `{edgeHash, edgePass, edgeFail, walkable, mainComponent}` **逐值相同** |
| 跨进程 | `scripts/probe-precision-consistency.mjs` **3 次独立进程**（`after-run1/2/3.json`） | `{maxDeltaY=0, flips=0, hash=c368beed, pass/fail=1423122/2466, walkable=724481, main=724481}` **三者逐值一致 ✓** |

### 3.2 修复前不一致对照（同一棵树、同一判据）

| 对照 | 修前 | 修复后 |
| --- | --- | --- |
| `canStep(a,b)` 首次调用 | **可跨**（float64 Δ=0.6 含界） | **拒**（与缓存同判） |
| `canStep(a,b)` 缓存后调用 | **拒**（float32 Δ=0.600000023842） | **拒** |
| 结论 | **同一格对两个答案** | **唯一答案** |

---

## 4. 常驻守卫与三证

守卫：`tests/core-precision-consistency.test.mjs`（6 条断言）。

| # | 断言 |
| --- | --- |
| ① | 两条取样路径**同精度**：同一格「首次 `sample()`」=== 「缓存后 `sample()`」=== `Math.fround(probe.surfaceY)` |
| ② | **产品级历史翻转 = 0**：整城所有"精度决定性"格对「首次 `canStep`」=== 「缓存后 `canStep`」（要求 ≥20 对，防恒真） |
| ③ | **可复现突变对照**：真实格对 `1.5↔0.9` 上手工复算「float64 首次 ⇒ 可跨 / float32 缓存 ⇒ 拒」**必须相反**，且产品判定必须等于 float32 口径 |
| ④ | **跨构建逐值一致**：3 次独立建图指纹逐值相同 |
| ⑤ | **已登记指纹**（`§12.1.4.2`）：`edgeHash/edgePass/edgeFail/walkable/mainComponent` === 已登记基线（几何有意变更须本轮同步登记） |
| ⑥ | 阈值未放宽：`0.5 / 0.6 / BOUNDARY_EPS 1e-9 / Float32Array 图侧 / 首次取样同精度`（含源码形态断言） |

**三证**：
1. **修前必红（真实文件突变）**：把 `y: heights[i]` 退回 `y: result.surfaceY` ⇒ 守卫 **2/6，exit 1**（①②③⑥ 全红；
   ① 报 163/240 格两路径不同、② 报 **35/35** 对翻转）；恢复后 `shasum -c` 逐字节校验 + **6/6 exit 0**。
2. **修后全绿**：守卫 6/6 · `walk-reachability` 全绿 · `layout` 1844/0 · `interaction` **70/70（F27 绿）** ·
   `verify-completeness` PASS（5.3 逐值不变：841×1121@1m / 可走 724481 / 障碍 751）· `audit --enforce` exit 0 ·
   全量 `tests/run.mjs` **25/27**（两个红项均与本卡无因果，见下）。
3. **对照不假红**：`walk-reachability` 的细/粗双口径与 `t153 ⓪` 分量护栏全绿；候选 B 的判定面校验和与修前**逐值相同**
   ⇒ 未靠"改判据"回绿。

### 4.1 全量套件两个红项的非因果证明

全量 `tests/run.mjs` = **25/27**，两个红项：

| 套件 | 红项 | 非因果证明 |
| --- | --- | --- |
| `tests/interaction.test.mjs` | **B8**「G 不新增第二套相机/状态/循环（源码静态扫描）：`src/interaction/index.js` 的 `store.patch` 只允许写 view 记录」 | 把 `walk-graph.js` **换回修前版本**在同一棵树上重跑 ⇒ **同一 B8 红**（69/70，F27 仍绿）。`src/interaction/index.js` 的 mtime = **07:34:08**（并发成员正在改该文件），本卡只改 `walk-graph.js`（07:38:52）。**F27 绿** ⇒ 本卡的判定面未被改动 |
| `tests/verify-experience.test.mjs` | **F1**「24 张 8 视角×3 时辰截图」（interior/night、fp/golden、orbit/dusk、orbit/night 暗区/掩码） | 与 `walk-graph.js` 无关（截图/掩码口径）；本卡不触碰渲染路径。该红项在 t5 卡交付时已同样存在 |

⇒ 两红**均非本卡引入**；本卡相关的全部判据（F27 过渡带双向、`walk-reachability` 四层护栏、`verify-completeness` 5.3、
`layout` 全量、`audit --enforce`）在修复后**全绿**。

---

## 5. 复跑命令

```bash
cd imperial-palace-dsh-1.1b
# 常驻守卫（6 条断言；含突变对照与跨构建指纹）
node tests/core-precision-consistency.test.mjs
# 只读探针（真实装配 + 细口径整城图；三组读数）
node scripts/probe-precision-consistency.mjs --json work/precision-consistency/after.json
# 受影响护栏
node tests/run.mjs walk-reachability && node tests/run.mjs layout && node tests/run.mjs interaction
node tests/run.mjs verify-completeness && node scripts/audit.mjs --enforce
# 修前对照：把 git HEAD 的 walk-graph.js 换回即可（或看 work/precision-consistency/pre.json）
```

---

## 6. 交付物清单

| 路径 | 内容 |
| --- | --- |
| `src/interaction/walk-graph.js` | 最小修复（1 行返回值 + 机制注释）：首次取样返回图侧存储值 |
| `scripts/probe-precision-consistency.mjs` | 只读取证探针（历史敏感性 / 冷暖 flood / 精度决定性 / 产品级翻转 / 判定面校验和） |
| `tests/core-precision-consistency.test.mjs` | **常驻守卫**（6 条断言，含突变对照与已登记指纹） |
| `docs/reports/report-t12-precision-consistency.md` | 本报告 |
| `work/precision-consistency/*.json` | 修前 / 修复后 / 候选 A 的逐值读数 |

**未动**：`src/shared/config.js`（阈值）、`src/shared/layout.js`（几何）、`src/interaction/walk-solver.js`、任何区域/UI 文件。
