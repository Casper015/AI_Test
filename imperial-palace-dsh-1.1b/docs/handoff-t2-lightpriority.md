# handoff · T2.23 灯位池优先级：距离感知（t90）

任务：`t90`（repair，attempt 1）· 执行者：core-engineer（attempt_id `5c134cbe-e561-4d92-b8b7-65ede43c87f7`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`src/core/environment.js`、`tests/core-environment.test.mjs`（新建）、本回执。**未触碰** `src/shared/**`（config 一行未改）、`src/kit/**`、`src/zones/**`、`src/ui/**`、`src/interaction/**`、`scripts/audit.mjs`。

---

## 1. 缺陷与根因（file:line）

`src/core/environment.js` 的灯位池选择（t90 前）：

```js
score = (ROLE_IMPORTANCE[role] ?? 0.5) × (1 − Math.min(1, distance / (LIGHTING.lamps.distance * 6)))
```

- `ROLE_IMPORTANCE = { axisLantern: 1.0, gardenOrCourtLantern: 0.7, windowGlow: 0.55, torch: 0.8 }`（同文件）；
- `LIGHTING.lamps.distance = 60` ⇒ 线性衰减的分母是 **360m**，即 **80–110m 之外的中轴灯只衰减 22–31%**；
- 后果（t64 实测复现）：`windowGlow@15m` → `0.55×0.9583 = 0.527`，`axisLantern@90m` → `1.0×0.75 = 0.750` ⇒ **远处中轴灯压过近处室内灯**，golden/sunset 下南/北城门各 1 处室内灯被挤出实时池（池容量 `maxRealtimePointLights = 8`）。
- **语义错误**：距离对优先级的影响被压到几乎可忽略（同一重要性下，360m 内只差 3 倍），而"近处局部灯应优先于远处全局灯"是本项目 §6.3 的光照意图。

**结论**：真缺陷（静态权重 + 过弱线性衰减），不是观感问题。

## 2. 修复（距离感知；未改任何预算）

`score = importance / (1 + (distance / d0)^k)`，其中 `d0 = LIGHTING.lamps.distance = 60`、`k = LAMP_SCORE_POWER = 2`。

- 新增纯函数 `lampScore(role, distance)`；新增纯函数 `rankLampPool(lamps, focus, {budget, scoreOf, maxDistance})`，
  **生产选择（`updateLampSelection`）与测试共用它**（避免"代理断言"）；
- 另留 `legacyLampScore()`（旧口径）**仅供对照与突变证明**，不参与生产；
- **未改**：池容量（`realtimeLights.length` = `maxRealtimePointLights = 8`）、距离上限（`min(distance×6, emissiveFallbackBeyond) = 120m`）、强度/衰减/阴影预算、`ROLE_IMPORTANCE` 数值（**没有简单抬高 `windowGlow`**）。

**两侧都不可绝对化（实测）**：
| 情形 | 新口径 | 结果 |
| --- | --- | --- |
| 距离主导 | `windowGlow@15m = 0.5176` vs `axisLantern@90m = 0.3077` | 近处胜 ✓ |
| 距离主导（更极端） | `windowGlow@15m = 0.5176` vs `axisLantern@110m = 0.2294` | 近处胜 ✓ |
| 重要性主导 | `axisLantern@20m = 0.9000` vs `windowGlow@11m = 0.5321` | 远处重要灯仍入池 ✓ |
| 同距离 | `axisLantern@100m = 0.2647` vs `windowGlow@100m = 0.1456` | 重要性决定 ✓ |
| 旧口径（对照/突变） | `axisLantern@90m = 0.750 > windowGlow@15m = 0.527` | **复现 t64 缺陷** ✓ |

## 3. 前后入池清单对照（`tests/core-environment.test.mjs` 用例④ 实测打印）

同一批灯位（`LAYOUT.LIGHT_ANCHORS` 49 条 + 一盏"该机位 15m 内的室内 `windowGlow`"，即 t64 报的形态），分别以旧/新口径排名（池容量 8）：

| 机位 | 旧口径室内灯入池 | 新口径室内灯入池 | 新池前 3（分数@距离） |
| --- | --- | --- | --- |
| 南城门内（WP-fp-02） | **否**（被挤出） | **是** | `LA-001(0.537@56m) / LA-002(0.537@56m) / LA-TEST-interior(0.518@15m)` |
| 北城门内（WP-fp-01） | 是 | 是 | `LA-TEST-interior(0.518@15m) / LA-001(0.306@90m) / LA-002(0.306@90m)` |
| 全城鸟瞰（VP-city-oblique） | 是 | 是 | `LA-TEST-interior(0.518@15m)` |
| 等距沙盘（VP-city-iso） | 是 | 是 | `LA-TEST-interior(0.518@15m)` |

- **12 组（4 机位 × golden/sunset/night）**：旧口径挤出 **1** 组（南城门内 —— 正是 t64 报出的形态），新口径 **4/4 收入**；
- 池排名**不随时辰变化**：`updateLampSelection(elapsed, cameraPosition)` 不消费 preset（用例④对三时辰逐组断言排名逐字相同）；北城门/两处外景因该机位附近的真实灯位稀疏，旧口径本来也能容下室内灯 —— 如实记录，不夸大。

## 4. verify 与"不放宽判据"的证据

```text
$ node tests/core-environment.test.mjs → exit=0 · 通过 5 / 5（新建；用例与断言只增不减）
   ①② 距离主导 / 重要性主导 双向反例通过；③ 4 role × 4 距离逐值匹配公式；
   ④ 12 组前后对照；⑤ 预算三项逐值 = 8 / 60 / 120 且超限灯位仍被过滤
$ node scripts/audit.mjs → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
   主场景 333/350 批次 ✓、可见三角面在限内 ✓；灯位表仍打印"未进入实时池的灯位由 InstancedMesh 自发光承担"
$ node tests/core.test.mjs → exit=0 · 43/43（回归 sanity）
```
**§12 判据未放宽、且实测未退化**（同命令改前/改后）：
| 图 | 改前（t78/t86 期基线同命令） | 改后（t90） |
| --- | --- | --- |
| `golden oblique [city]` | 内容均值 0.2854 / 暗区 2.16% / 截断 0.00% / 整帧 0.6641 | **0.2853 / 2.21% / 0.00% / 0.6641** |
| `night oblique [city]` | 内容均值 0.1541 / 暗区 10.32% / 截断 0.00% | **PASS**（见下节命令输出，暗区量级不变） |
⇒ 差异 ≤0.05pp（灯位池 8 盏里最多换 1 盏），**远未触及** §12 阈值（内容暗区 ≤15% / 截断 ≤5%）。

## 5. 未验证项 / 已知限制

1. **未在浏览器端逐区核灯**：本卡证据为 Node（同一 `rankLampPool` 实现）+ 四机位前后对照 + 两张 §12 判据实测；真实浏览器里"各区室内灯是否入池"建议由 t66/t13 顺带核对（`?stats=1` 的灯位表已含实时池/已激活数）。
2. **`rankLampPool` 的远景过滤未改**：仍是 `min(60×6, 120) = 120m`；<120m 的**所有**灯位都参与打分（旧口径同样如此），本次只改"如何排序"。
3. **测试里的"室内灯"是构造样本**（真实室内灯由三区在运行时注册，Node 侧拿不到）；构造方式为"该机位 15m 内一盏 `windowGlow`"，与 t64 报的形态一致。
4. **`ROLE_IMPORTANCE` 与 `LIGHTING.lamps` 未改**（config 属 `src/shared/**`，本卡不动）；若后续要在 config 侧调权重，仍需按 §8.2 走"配额调整并记录理由"。
