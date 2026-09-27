# t8 · E13 反向断言改数据推导（消除写死计数）

> 卡：`t8 [e13-derived] — E13 反向断言改数据推导（消除写死计数）`（attempt 1 · ui-engineer）
> 范围：`tests/interaction.test.mjs`（E13 反向断言 + 全文件写死计数盘点）、本回执。
> 纪律：**判据只增不减**（不删任何旧判据；旧基线降级为"历史快照下界"或不再参与判定）、口径三要素、先证后改。

---

## 0. 结论（一句话）

E13 的"整足迹阻挡者计数"从 **写死公式 `14 + 12 − 开槽数`**（现存 24，实际 22 ⇒ 陈旧红）改为
**两侧独立来源的双向集合相等**：左侧 = 运行时求解器列表，右侧 = layout 数据 + `sourceType` 语义（实心槽位 / `MOAT.rects` / `rockery` / 未开槽水体）。
计数直接用推导集合本身；并新增 **4 个突变对照**证明判据**真的会失败**（不假绿）。`tests/interaction.test.mjs` 由 **77/78（E13 红）→ 78/78 全绿**。

---

## 1. 修前是什么（先证）

```
✗ E13 四类糟糕阻挡审计（数字 + 位置）：整足迹阻挡者应为 24 条
  （既有 14 + t9 批量装饰 12 − t13 开槽水体 2；实际 22）：
  OB-F-tower-corner-{nw,ne,sw,se}、OB-F-bulk-{w,e}-{270,250}-{240,264,280}（12）、
  OB-MOAT-{south,north,west,east}、OB-SC-F-rockery-{west,east}
```

**为什么是 22 而不是 24**：公式里的"开槽水体 2"只算了 `LAYOUT.STONE_STEP_LANES`（D/E 两池），
但工作树里**御花园 F-east / F-west 两池也登记了门洞通道**（`exceptDoor` + `door`）⇒ 水体整足迹阻挡归零，
真实值 = **16 实心槽位（角楼 4 + 批量装饰 12）+ 4 护城河 + 2 山石 = 22**。
即：写死基线随布局演进必然腐烂 —— 这正是本卡要根治的东西。

---

## 2. 修后是什么（数据推导 + 双向相等）

### 2.1 判据本体（被抽成纯函数，便于突变对照）

```js
const auditBlockers = (list) => {
  const runtime = new Set(list.filter((o) => o.blocks === 'all').map((o) => o.id));
  const water = list.filter((o) => o.sourceType === 'water');
  const derived = new Set([
    ...solidSlots.map((s) => `OB-${s.id}`),                                       // ① SLOTS：visitable===false 且 hasDoor!==true
    ...moatRects.map((r) => `OB-${r.id}`),                                        // ② LAYOUT.MOAT.rects（唯一权威源）
    ...list.filter((o) => o.sourceType === 'rockery').map((o) => o.id),           // ③ 山石
    ...water.filter((o) => o.blocks === 'all' && !/^OB-MOAT/.test(o.id)).map((o) => o.id), // ④ 未开槽水体
  ]);
  return {
    runtime, derived,
    missing: [...derived].filter((id) => !runtime.has(id)),   // 漏登记 / 被静默改成可通行
    extra: [...runtime].filter((id) => !derived.has(id)),      // 多出成员
    illegalWater: water.filter((o) => o.blocks !== 'all' && (o.blocks !== 'exceptDoor' || !(o.door && Number.isFinite(o.door.width)))).map((o) => o.id),
  };
};
```

判据（**全部由数据推导，无字面量**）：
1. `missing.length === 0`、`extra.length === 0` ⇒ **两侧集合逐条相等**（不是"数量对上"就完事）；
2. `blockedAll.length === derived.size` ⇒ **计数用推导集合**（不再写死）；
3. `illegalWater.length === 0` ⇒ 水体只允许"整足迹阻挡"或"**有界开槽**（`exceptDoor` + 登记 `door`）"两态（新增判据）；
4. 每个整足迹阻挡者**逐条**必须有**非兜底**具名提示（`hintFor(id).title !== '此路不通'`）—— 原有判据保留；
5. 分组改为**逐组集合相等**：角楼 = `SLOTS.kind==='cornerTower'`、护城河 = `MOAT.rects`、山石 = `sourceType==='rockery'`、
   批量装饰 = `GARDEN_BULK_SLOTS` 派生 id 集合（取代旧的 `groups['角楼']===4 / 水体===4−开槽 / 其他===12`）；
6. **历史快照降级为单调下界**：`blockedAll.length >= 14`（旧基线 14 作为"计数塌陷"报警线；注释里保留
   `14 → +12 → −2 → 现值 22` 的来历，但**不参与判定**）。

### 2.2 三证（不假绿 / 不假红 / 可复跑）

| 证 | 证据 | 读数 |
| --- | --- | --- |
| ① **不假绿** | **4 个突变对照**（每个都是真实缺陷形态，判据必须各自转红） | 基线 `missing/extra/illegal = 0/0/0`；A 实心体块改可通行 → `missing 1`；B 护城河被开槽 → `missing 1`；C 水体开槽却不登记 `door` → `illegal 1`；D 凭空多出整足迹阻挡者 → `extra 1` |
| ② **不假红** | 真实数据基线必须全绿 | `tests/interaction.test.mjs` **78 / 78**（修前 77/78） |
| ③ **可复跑** | 读数由判据自己打印，可逐项核对 | `runner.info`：`整足迹阻挡者 22 条（推导集合 22；分组 角楼 4 / 批量装饰 12 / 护城河 4 / 山石 2）逐条提示齐备` |

---

## 3. 其余写死计数盘点（`tests/interaction.test.mjs` 全文件）

### 3.1 改为**数据推导**（写死 → 由 layout/config/DOM 清单推导）

| 位置 | 修前 | 修后（推导来源） |
| --- | --- | --- |
| C1 fp-spawn 数 | `spawns.length === 5` | `=== LAYOUT.ZONES.length` + 每区恰一个 + area 合法 |
| F 段视角按钮数 | `buttons.length === 8` | `=== CONFIG.CAMERA.viewModes.length` |
| ZONE_BUTTONS | `=== 7`（两处） | id 唯一 + **每个分区都有按钮**（`LAYOUT.ZONES` 逐区）+ `>= 7` 历史下界；DOM 处 `=== ZONE_BUTTONS.length`（与常量同源） |
| F6 小地图四类图元 | `walls 4 / moats 4 / ponds 4 / bridges 4 / courtyards 14` | 逐项由 `LAYOUT.WALLS(cityWall)` / `MOAT.rects` / `WATER_BODIES − MOAT` / `LAYOUT.BRIDGES` / `LAYOUT.COURTYARDS` 推导 |
| E16 内景机位数 | `=== 43` | `=== Object.keys(INTERIOR_BY_SLOT).length` **且** `=== SLOTS.filter(visitable).length`（三源交叉）+ `>= 43` 下界 |
| F30 内景面/通道面 | `interiors === 43`、`passages === 43` | `=== 可进入建筑数`（两处各自核对）+ `>= 43` 下界 |
| 净宽样本覆盖 | `widths.length >= 43` | `>= 通道面数` 且 `>= 带门洞障碍数` + `>= 43` 下界 |
| 亭数量 | `pavilionSlots.length === 10` | `>= 10`（历史快照下界）+ **逐座不变量**（`hasDoor` / `blocks==='exceptDoor'` / 提示文案）—— 实质判据在逐座 |
| 门洞走查"无遗漏" | `enteredCount + blockedNamed.length === 10` | `=== doorResults.length`（样本自身长度）+ `>= 10` 下界 |
| t7 G 段面板数 | `=== 13`（两处） | `=== 可折叠清单 9 + 非折叠清单 4`（与 CONTRACTS §11.3.1 登记同源） |

### 3.2 标注为**用例固有/历史快照**（不改语义，只注明来历，避免被误读为数据快照）

| 位置 | 值 | 标注 |
| --- | --- | --- |
| A 段 `rejected.length` | 6 | 本用例构造的非法输入条数（非数据快照） |
| B 段 `runningProblems === 1` / `modeProblems === 2` | 1 / 2 | 契约校验器**规则条数**（本用例构造的非法状态触发数） |
| F13/F14 `calls.length === 2 / 4` | 2 / 4 | 本用例构造的调用次数（2 帧 → 包装层 + 原实现；再走 2 帧） |
| E13 突变 `mutatedAirWalls === 1` | 1 | 本用例**主动注入**的突变数 |
| F4 `interior.length >= 10` | ≥10 | 面板齐备下界（t7 后实际 13；不写死具体值） |

> 结论：全文件已无"随布局演进必然腐烂"的**数据快照等值断言**；剩下的字面量要么是推导来源本身（config 常量、用例构造输入），要么是**单调下界**（可增长、不可塌陷）。

---

## 4. 回归与并行状态

| 命令 | 结果 |
| --- | --- |
| `node tests/interaction.test.mjs` | **78 / 78 全绿**（修前 77/78：E13 陈旧计数） |
| `node scripts/audit.mjs --enforce` | **exit 0**（未动任何预算/阈值） |
| `node tests/run.mjs` | **28 / 28 全绿，exit 0**（本卡修掉的是当时的最后一条红；`core-precision-consistency` 与 `verify-experience` 已由并发卡转绿） |

> 说明：本卡**只改 `tests/interaction.test.mjs`**（无产品代码改动）⇒ 对其它测试的影响仅限于"同一文件内的判据强度"，
> 不存在产品行为变更；全量 28/28 亦印证之。

---

## 5. 变更清单

| 文件 | 变更 |
| --- | --- |
| `tests/interaction.test.mjs` | E13 反向断言整体改为数据推导（`auditBlockers` 纯函数 + 双向集合相等 + 水体两态合法性 + 分组集合相等 + 历史下界）；新增 4 个突变对照；10 处写死计数改推导；6 处标注来历 |

---

## 6. 复跑命令

```bash
node tests/interaction.test.mjs      # 78/78（含 E13 突变对照，stdout 打印推导读数）
node scripts/audit.mjs --enforce     # exit 0
node tests/run.mjs                   # 全量
```
