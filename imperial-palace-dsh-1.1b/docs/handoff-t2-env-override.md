# handoff · t122 修复 F1：`?env=` 覆盖是否绕过 Bloom（T2.29）

任务：`t122`（repair，attempt 1）· 执行者：core-engineer（attempt_id `ad82d391-855a-4a58-925d-261ae42083db`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`src/core/environment.js`（**只读诊断，未改**）、`tests/core-environment.test.mjs`、本回执。**未触碰** `src/shared/**`、`src/kit/**`、`src/zones/**`、`src/interaction/**`、`src/ui/**`、`scripts/shot.mjs`、`tests/kit.test.mjs`、`docs/CONTRACTS.md`。

---

## 1. F1 结论：机制已定位，但**"物理上不可能的读数"在当前树无法复现**（如实上报）

### 1.1 机制（file:line）—— 预设合并是**逐键 spread**，不可能丢掉 `bloom`

| 位置 | 代码 | 说明 |
| --- | --- | --- |
| `src/main.js:67-82` | `parseEnvOverride(text)` | `?env=` 解析：`exposure → out.exposure = Number(value)`（NaN 直接 `continue`）；只造**显式键**的补丁对象 |
| `src/main.js:184` | `presetOverrides: envOverride ? { [store.state.timePreset]: envOverride } : null` | 覆盖只挂在**当前时辰**这一条预设上 |
| `src/core/environment.js:564` | `const presetOf = (id) => ({ ...presets[id], ...(overrides[id] ?? {}) });` | **逐键 spread = 深合并（浅层）**：没有出现在补丁里的键（含 `bloom`）**原样保留** |

⇒ 该通道的机制**不是**“全量替换预设对象”，因此**不具备**"覆盖存在 ⇒ `p.bloom` 失效/被绕过"的能力。

### 1.2 三组最小对照（Node，直接读 `describe()`）

| 组 | `describe().exposure` | `describe().bloom.baseStrength` / `effectiveStrength` |
| --- | --- | --- |
| ① 无覆盖 | **1.06**（= 预设） | **0.3 / 0.3** |
| ② 覆盖 `{exposure: 0.95}` | **0.95**（只此键变） | **0.3 / 0.3**（与①逐值相同） |
| ③ 覆盖 `{sunIntensity: 5}` | **1.06**（未变） | **0.3 / 0.3**（未变） |

### 1.3 真实浏览器 A/B/C（1440×900，`view=interior&preset=sunset&interior=C-hall-bed-main`）

| 组 | exposure | bloom base/eff | blend | 整帧均值 | 截断 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| **A 无覆盖** | 1.06 | 0.3 / **0.15** | 1（内景 ×0.5 档） | **0.4063** | 0% | 基线 |
| **B `?env=exposure=0.95`** | **0.95** | 0.3 / **0.15**（不变） | 1 | **0.3817（更暗 ✓）** | 0% | 物理方向**正确** |
| **C `?env=sunIntensity=5`** | 1.06（不变） | 0.3 / 0.15（不变） | 1 | 0.4064 | 0% | 只影响该键 |

⇒ **B 比 A 更暗**（0.4063 → 0.3817），Bloom 的 base/effective 完全不变 ⇒ **t106 报的“覆盖 exposure 反而更亮（0.6698 vs 0.4164）、截断掉到 0.18%”在当前树不可复现**；该现象**不能**归因于这条合并通道。

### 1.4 对 t106 那组读数的处置（假设，已标注为假设）
最可能是**对比基准错配**（本线已多次出现：before/after 拍在两次渲染/两个口径之间）：`0.6698` 与 `0.4164` 可能来自**不同格**（不同 `view`/`preset`/机位，或其中一次未进入内景体积 ⇒ bloom 未走 ×0.5 档）。**建议 t106 侧核对当时的命令与对照口径**；本卡不据此改写其结论之外的任何东西。

## 2. 本卡的交付（**未改生产代码**，改为把"不可能退化"钉成常驻断言）

`tests/core-environment.test.mjs` 新增 **3 条用例（12/12 通过，只增不减）**：
1. **三组最小对照**（无覆盖 / 覆盖 `exposure` / 覆盖其它键）：覆盖只改该键，`bloom.baseStrength/effectiveStrength/interiorTier` 与无覆盖**逐值相同**；并同时锁定预设常量（`sunset.exposure === 1.06`、`sunset.bloom.strength === 0.3` —— **未改**）；
2. **任意覆盖下“只有该键变化”**：8 组覆盖（`exposure / sunIntensity / ambientIntensity / hemiIntensity / lampDistance / lampIntensityScale / fogFar / 未知键`）逐一核对 `bloom` 的 **7 个字段逐值不变**、只有显式键变化、**未知键零影响**、`preset` 不被改；
3. **方向性铁律**：覆盖 `exposure=0.95`（< 预设 1.06）必须读出更小值、`1.5` 读出更大值 ⇒ 若哪天再出现"调低曝光反而更亮"的读数，只可能是**被测对象之外**的问题（该用例 + §1.3 的 A/B 命令即为自检入口）。

**没有放宽任何判据**：`§12` 阈值、`§11.3`、`--allow-no-sky` 禁令、`sunset.bloom.strength===0.3` 守护断言一概未动；也**没有**改 `?env=` 的语义（我把"只覆盖显式键"作为**既有语义**用断言锁住，而不是改行为）。

## 3. 排障指引（本轮实测依据，建议并入 CONTRACTS §12 的文字见 §4）

> **内景过曝：先量 Bloom，再怀疑材质。**
> 1. **bloom-off 对照**（源级单变量，最可靠）：把输出链的 bloom 关掉重拍同格 —— t106 实测 金銮殿内景 dusk **5.67% → 0.00%**（**−5.67pp = 100% 来源**）；对照：`src/kit` 自发光 ±0.01–0.02pp（**零贡献**）、环境灯自发光 ±0.02pp（零贡献）⇒ **先查 Bloom**。
> 2. **量上限档**：`environment.describe().bloom` 已是权威读数（`{baseStrength, effectiveStrength, interiorBlend, shrink, interiorTier, interiorArea, tiers}`）；内景按房间面积取档（小院房 0.3 / 大空间 0.5），`effectiveStrength = baseStrength × (1 − (1−scale)×blend)`。
> 3. **`?env=` 归因前自检**（防"测量通道改被测对象"）：同格跑 A/B 两组（`index.html?view=interior&preset=sunset&interior=C-hall-bed-main&ui=0&shot=1` 与再追加 `&env=exposure=0.95`），比较 `describe().exposure` 与 `describe().bloom.effectiveStrength`：**只有 exposure 变、bloom 与画面均值同向变化** 才算该通道可信（本卡 §1.3 已给出这条对照的真实读数）。
> 4. 可复现命令（浏览器）：`node scripts/shot.mjs --view=interior --preset=sunset --out-dir=docs/shots` 与 `node scripts/shot.mjs --view=interior --preset=sunset --env=exposure=0.95 --out-dir=/tmp/env-ab`（后者仅诊断，产物勿入交付目录）。

## 4. 交回：建议并入 `docs/CONTRACTS.md §12` 的文案（本卡不改该文件）

> **§12.x 诊断通道纪律与过曝排查顺序**
> 1. **诊断参数不得改变被测语义**：`?env=` 只覆盖显式给出的键（`sun/ambient/hemi/exposure/lampIntensity/lampDistance/lampIntensityScale/fogNear/fogFar`），其余预设字段（含 `bloom`）逐值保持；未知键被忽略。任何"调低曝光反而更亮"之类的读数，先按 §12.x-2 自检，再考虑归因。
> 2. **自检方法**：同格 A/B（有无该覆盖），比较 `environment.describe().bloom.effectiveStrength` 与画面均值/截断；两者必须同向。
> 3. **内景过曝排查顺序**：① bloom-off 对照 → ② `describe().bloom` 上限档 → ③ 材质自发光/镜面 → ④ 台基/台阶等几何。实测依据：bloom-off −5.67pp（100%）、kit 自发光 ±0.02pp（≈0）。

## 5. verify（原样）与**一个必须如实说明的外部红项**

```text
$ node tests/core-environment.test.mjs → exit=0 · 通过 12 / 12
$ node scripts/audit.mjs --enforce     → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
$ node tests/core.test.mjs             → exit=1 · 通过 44 / 45   ✗ ← 外部并发改动所致（非本卡）
   ✗ 灰盒满足全部契约字段与数量（… 169 可走面 … LAYOUT 1.1.15）：期望 169，实际 **171**
```
**归因（实测）**：在我做本卡期间，`src/shared/layout.js` 被**别的卡**改动（mtime 在数分钟内），`WALKABLE` 由 **169 → 171**（`LAYOUT_VERSION` 已随之升到 **1.1.16**；byKind: ground 62 → **64**）。`tests/core.test.mjs` 的 169 pin 由 **t130**（core 侧）维护，而**本卡 inScope 不含 `tests/core.test.mjs`** ⇒ 我**不越界改**，只如实上报并建议：**派最小 pin 卡（169 → 171，版本 1.1.16）**，或把 `tests/core.test.mjs` 加入下一张 core 卡的 inScope 一并同步。本卡自身两条 verify（`core-environment`、`audit --enforce`）均为绿。

## 6. 未验证项 / 已知限制

1. **t106 的 0.6698/0.4164 无法在我这边复现**（不是"已证伪其全部工作"，而是该组读数不能由本通道解释）；其原始命令与同批产物我未持有 ⇒ 建议由 t106 侧核对口径。
2. **`?env=` 未知键被静默忽略**（`parseEnvOverride` 的 `continue`），本卡只把该行为**锁进断言**，未改语义（改语义需派单）。
3. 本卡 A/B/C 只覆盖 **1 个内景格（C-hall-bed-main, sunset）**；跨时辰/跨机的 A/B 未跑（结论基于"合并机制 + 3 组 Node 对照 + 1 组真实浏览器 A/B/C"，足以判定本通道不具备所述能力）。
4. `src/core/environment.js` **本卡一字未改**（`git diff` 中该文件的改动来自 t106/t120 等既有卡）。
