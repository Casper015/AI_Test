# 报告 · 伪绿普查：恒真/恒假型判据（t149 / V2.1）

> **只读普查**（`src/**`、`tests/**`、`scripts/**`），**本卡未改任何文件**。
> 触发源：`t148-F1`（high）——`tests/walk-reachability.test.mjs` 旧护栏用 `path(...) != null` 判可达，
> 而 `src/interaction/walk-graph.js:126/129/…` 的 `path()` **总是返回对象**（`{ok:false,…}` / `{ok:true,…}`）⇒ **恒真**。

## 0. 实际执行的 grep 命令清单（供复核覆盖度）
```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b"
# ① 对象用 != null 当有效性（含 path/probe/sample/componentOf/nearestCell）
grep -rnE "\b(path|probe|sample|componentOf|nearestCell)\([^)]*\)\s*(!=|!==)\s*(null|undefined)" tests/*.mjs scripts/*.mjs src/**/*.js
grep -rnE "(!=|!==)\s*null" tests/*.mjs scripts/*.mjs | wc -l          # 计数：77
# ② assert(<裸标识符>)
grep -rnE "^\s*(assert|check)\([A-Za-z_$][A-Za-z0-9_$.]*\)" tests/*.mjs scripts/*.mjs
# ③ 恒真比较（length >= 0 / typeof === 'object'）
grep -rnE "\.length\s*>=\s*0|typeof\s+[A-Za-z0-9_.]+\s*===?\s*'object'" tests/*.mjs scripts/*.mjs src/**/*.js
# ④ 回退掩盖（?? true / || true / || []）
grep -rnE "\?\?\s*true|\|\|\s*true|\|\|\s*\[\]" tests/*.mjs scripts/*.mjs src/**/*.js
# ⑤ DOM「存在即可见」
grep -rnE "querySelector|getElementById" tests/*.mjs scripts/*.mjs
```

## 1. **确认的恒真判据（必须修，按归属另派）**

### ④-A `|| true` 使断言恒真 —— 4 处
| # | file:line | 原文 | 为何恒真 | 掩盖什么风险 | 正确写法 |
| --- | --- | --- | --- | --- | --- |
| 1 | `tests/interaction.test.mjs:582` | `assert(positions.get('axis') !== positions.get('focus') || true, '机位记录完整');` | `X \|\| true` 对任意 `X` 恒为 `true` | **“axis 与 focus 机位不同”这条从未生效**（同机位也能过） | 删掉 `\|\| true`：`assert(positions.get('axis') !== positions.get('focus'), '…')`（并补二者各自非空校验） |
| 2 | `tests/interaction.test.mjs:1467` | `assert(app.ui.refs.labels.size === 0 \|\| true);` | 同上 | **“本轮不应产生标签”从未生效**（泄漏标签也过） | `assertEqual(app.ui.refs.labels.size, 0)` |
| 3 | `tests/verify-experience.test.mjs:66` | `assert(CAM.viewModes.every((m, i) => m.index === i + 1 \|\| m.key === i + 1 \|\| true), 'index 字段缺失（按顺序断言已覆盖）');` | `every` 的回调恒 `true` | 该条**完全空转**；注释声称“按顺序断言已覆盖”**需核实**那张断言是否真的在 | 去掉 `\|\| true`；若确由他条覆盖，则**删除本条**而不是留一条恒真 |
| 4 | `scripts/verify-completeness.mjs:849` | `&& LAYOUT.ZONES.every((z) => vps.some((v) => v.mode === 'interior' ? false : true) \|\| true),` | `every` 回调恒 `true` | **“每区至少一个非 interior 机位”从未被检查** | 去掉 `\|\| true`，并明确意图（例：`zones.every(z => vps.some(v => v.zone === z.id && v.mode !== 'interior'))`） |

**覆盖度**：#1/#2 **完全无覆盖**（最危险）；#3 注释自称被他条覆盖 ⇒ **待核实**（若他条确实断言了顺序，本条应删而不是留恒真）；#4 **完全无覆盖**。

### ①-A 对象用 `!= null` / 真值当“可达/有效” —— 与 `t148-F1` 同类
| # | file:line | 原文 | 为何恒真 | 后果 |
| --- | --- | --- | --- | --- |
| 5 | `tests/walk-reachability.test.mjs`（**t140 版**，已由 t148 修正） | `const p1 = g.path(...); … if (broken(fine)) …`（`broken` 基于 `!r.p1` 判可达） | `path()` 返回对象、**永不为 null** ⇒ `!p1 === false` ⇒ `broken` 恒假 | **“全城门洞不可达 = 0”自 t140 起从未生效**；真相（t148 用 `componentOf().ok`）为**细口径 2 门不可达** |
| 6 | **`/tmp` 临时探针（我自己的）** `/tmp/t145-global.mjs:16-17` | `const p = g.path({x:s0.x,z:s0.z}, c); if (!p) bad.push(sid);` | 同上 | **t145 报的“全局口径 43/43”不可信**（同一恒真形态）——见 §3 点名 |
| 7 | （同类，非本仓提交物）`scripts/probe-walk-rule.mjs` 内 `graph.path(...)` 的真值/`!= null` 判定 | 同上机制 | `t132`/`t137` 基于该探针的“图中不可达 0”**同属此类**（`t143` 随后用逐格数据推翻了“全局已达”的印象） | 工具侧探针**需改用 `.ok`** |

**机制（源码证据）**：`src/interaction/walk-graph.js:126/129` —— `path()` 的所有分支都 `return { … }`（`{ok:false, reason:'noCell'|'unreachable', …}` 或 `{ok:true, …}`）⇒ **不存在返回 `null` 的路径**。
**正确写法**：`path(...).ok === true`（或 `componentOf(...).ok`；`t148` 已导出 `componentOf` 并自带 `PROOF=1` 交叉校验 `componentOf().ok ≡ path().ok`）。

## 2. 检查过、**确认无问题**（含 grep 误报）的分类说明
| 类别 | 位置样例 | 判定 |
| --- | --- | --- |
| `assert(<裸标识符>)` | `tests/interaction.test.mjs:447/653` `assert(app.rig.isFp)` | **无问题**：断言的是**布尔属性**（非对象/函数引用）⇒ 有意义；建议保留 |
| 恒真比较误报 | `tests/kit.test.mjs:441/983` `.length >= 0.3 * 48`、`tests/layout.test.mjs:376` `ratio >= 0.7` | **无问题**：grep 的 `\.length\s*>=\s*0` 误配 `>= 0.3…`；这些是**比例阈值** |
| 类型守卫（防御式） | `scripts/shot.mjs:1309/1339` `typeof report === 'object'`、`src/core/camera.js:377` `typeof target === 'object'` | **无问题**：**不是**“有效性声明”，而是**访问属性前的类型保护** |
| `?? true` 默认值 | `src/ui/index.js:784` `renderSystem: options.renderSystem ?? true` | **无问题**：**默认值语义**（非判据） |
| `!== null` 计数 77 处 | 例：`s.door !== null`、`getContext() !== null` | **绝大多数无问题**（真 null 检查）；**危险子类**只有“**返回对象的调用**用 null 判定当成功”⇒ 本报告 §1 已列全仓命中（仅 5/6/7），其余未命中该子类 |

## 3. ⚠️ 对外结论失效点名（该节必须点名）
1. **`t140` 的“结果级护栏”**：自 `t140` 至 `t147` 期间**恒真** ⇒ 其“不可达 = 0”**从未成立**；`t148` 用 `componentOf().ok` 复测得**细口径 2 门不可达** ⇒ **`t140`/`t141` 台账中的“63 / 0 / 0”应标注为无效读数**（`t141` 的耗时/发现/契约 §12.1.4 文案不受影响，但其中的“基线 63/0/0”需重测后更新）。
2. **`t137` 报的“全城门洞不可达 0 · 影响可达性 0”**：基于同一 `path()` 真值判定 ⇒ **不可信**；其“局部 43/43”亦需以 `.ok` 复测。
3. **`t145` 报的“全局口径 41/43 → 43/43”**：**我的临时探针 `/tmp/t145-global.mjs` 使用了 `if (!p)`** ⇒ **该 43/43 结论不可信**（属本类缺陷，由我在本次普查中自查发现并点名）。⇒ `t145` 的“全局断点已消除”**未被证明**；需用 `.ok` 重测（很可能仍存在，因为 `t148` 的细口径复测仍是 2 门不可达）。
4. **`t132`/`t137` 探针的“图中不可达 0”**：同机制 ⇒ 其结论需以 `.ok` 复核（这也解释了 `t143` 为何能用逐格数据推翻“全局已通”的印象）。

## 4. 建议（修法按归属分派，本卡不改）
| 归属 | 待修 |
| --- | --- |
| `tests/interaction.test.mjs`（其 owner） | §1 的 #1、#2（两条 `\|\| true` 恒真） |
| `tests/verify-experience.test.mjs`（其 owner） | §1 的 #3（先核实“按顺序断言”是否存在；若无 ⇒ **删除**该恒真条而非保留） |
| `scripts/verify-completeness.mjs`（其 owner） | §1 的 #4（`every(... \|\| true)` 恒真） |
| `scripts/probe-walk-rule.mjs` + 临时探针（工具/t77 owner） | §1 的 #7、§3 的 #2/#3：一律改 `path(...).ok === true` / `componentOf(...).ok` |
| `t140`/`t141` 台账（主理人） | §3 点名的“63/0/0”与“43/43”读数**加注无效**，复测后更新 |
