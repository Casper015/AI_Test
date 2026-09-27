# 交付回执 · §8.2 分区配额重分配（t84 / T1.30）

> ROOT：`imperial-palace-dsh-1.1b` · attempt `582e2237-8be8-4bec-a4f3-084953dc9230`
> 实测基线：`LAYOUT 1.1.5` + `CONFIG 1.0.7`（本卡）；verify = `node scripts/audit.mjs --enforce`

## 1. 处置结论：**从预留重分配**（工程手段本卡不可达，见 §2）

| 区 | 实测（重分配前） | 旧配额 | 判定 | **新配额** |
| --- | --- | --- | --- | --- |
| B | 62 | 70 | ✓ | **70（不变）** |
| C | **55** | 50 | ✗ 超预算 | **60** |
| D | **49** | 40 | ✗ 超预算 | **56** |
| E | **49** | 40 | ✗ 超预算 | **56** |
| F | 72 | 80 | ✓ | **80（不变）** |
| **整城** | **333** | 350 | ✓ | **350（发布门禁不动）** |
| 最坏视角（oblique） | **326** | 350 | ✓ | **350（不动）** |
| 可见三角面 | **306,269** | 1,500,000 | ✓ | **1,500,000（不动）** |

- `perZone` 总和 322 + `reserve` 28 = 350 = `mainSceneMax`（算术不变式保持）。
- **理由（需求变更，非实现膨胀）**：用户授权的「47→43 栋可进入内景」使各区新增合批后桶数（t61 官方口径约 +9~12/区）；实测超出量 C +5 / D +9 / E +9 与该口径一致。
- **只放宽“分区诊断上限”**，**不放宽整城发布门禁**；**未删除任何建筑/院落/装饰/城墙**；分区检查**仍由 `--enforce` 强制**（未关闭、未弱化为提示）。

## 2. 「先工程手段」的如实交代（**未由本卡实测**）
本卡 inScope 只有 `src/shared/config.js` 与本文档；LOD 距离 / 合批 / 质量档的工程手段实现位于 `src/zones/**`、`src/kit/**`、`src/core/**`（**均不在本卡 inScope，且 t62/t63/t64 正在并行飞**）。因此：
- 我**没有**宣称“已尝试并失败”；
- 给出可核查的旁证：**合批后桶数已按激活档计**（audit 明确「预算判定一律以激活档为准」，并给出单档 near/mid/far 与旧全档口径对照，虚高 +455~+501 桶已被排除），且各区实测值已贴近整城门禁下的实际开销；
- 若要继续工程手段压缩，建议派给 zone 卡（限制室内陈设的合批粒度/LOD 档位）后**再复测**；若届时下降，可**回调**本次配额（本回执给出回调位点）。

## 3. 权威配额与「临时豁免」清单 + 精确改法（交回派单，本卡不改测试）

**最终权威配额（唯一真相源）**：`CONFIG.BUDGET.drawCalls.perZone = { B:70, C:60, D:56, E:56, F:80 }`，`reserve: 28`，`mainSceneMax: 350`。

| 文件:行 | 现状 | 改法（精确） |
| --- | --- | --- |
| `tests/zone-west.test.mjs:673` | `const D_BUDGET_APPROVED = 56;   // §8.2 重分配（captain 裁定 t84；以 config 落地为准）` | 改为 **从 config 读取**：`const D_BUDGET_APPROVED = CONFIG.BUDGET.drawCalls.perZone.D;`（现权威值 = 56，数值等价 ⇒ 只是把“临时常量”换成“权威来源”，可追溯、可再次同步） |
| 其余 `tests/zone-*.test.mjs`（凡硬编码 70/50/40/40/80 或局部 `budget` 常量者） | 见下方 grep 清单 | 一律改为 `CONFIG.BUDGET.drawCalls.perZone[<Z>]`，**不再写数值** |
| `tests/layout.test.mjs`（分区配额 pin，归 t85） | 见下方 grep 清单 | 把 pin 的旧值按 §1 表逐项替换为 `perZone` 的权威值（C 50→60 / D 40→56 / E 40→56；B/F 不变），**不得删除该断言** |

> 排查命令（可直接复跑）：`grep -rn "perZone\|drawCallBudget\|D_BUDGET_APPROVED" tests/*.mjs`
> **纪律**：临时常量必须显式可追溯（引用权威源），**不得留成永久豁免**。

## 4. 可直接粘贴的 CONTRACTS §8.2 文案（交由 **t89** 并入，本卡不改 CONTRACTS）

```markdown
#### 8.2.1 分区绘制调用配额（**v1.0.7 / t84 取代 v1.0.6 口径**）

| 项 | 旧口径（历史时点真值） | **现行权威值** |
| --- | --- | --- |
| `mainSceneMax` | 350 | **350（发布门禁，不变）** |
| 最坏视角 | 350 | **350（不变）** |
| 可见三角面 | 1,500,000 | **1,500,000（不变）** |
| `perZone` | `{B:70, C:50, D:40, E:40, F:80}` | **`{B:70, C:60, D:56, E:56, F:80}`** |
| `reserve` | 70 | **28**（`Σ perZone 322 + 28 = 350`） |

**取代关系与理由（需求变更，非实现膨胀）**：用户授权的「47→43 栋可进入内景」按 t61 官方口径每区新增约 +9~12 个合批后桶；
实测（`LAYOUT 1.1.5` / `CONFIG 1.0.7` 重分配前）C **55/50 ✗**、D **49/40 ✗**、E **49/40 ✗**，同时**整城门槛仍满足**（主场景 333/350、最坏视角 326/350、三角面 306,269/1.5M）。
故按 §8.2 **从预留重分配分区上限**（`reserve 70 → 28`），并**明确**：分区配额是**分区诊断上限**，整城 ≤350 调用 / ≤1.5M 三角面才是**发布门禁**；本次**未删除任何建筑/院落/装饰/城墙**，**未关闭或弱化分区检查**（`audit.mjs --enforce` 仍强制）。
历史条目（v1.0.6 的 `{70,50,40,40,80}` / `reserve 70`）作为时点真值保留，不删改。
```

## 5. verify（原样）
```
$ node scripts/audit.mjs --enforce            → exit 0
 主场景绘制调用   : 333 / 上限 350  ✓
 分区 B 62/70 ✓   分区 C 55/60 ✓   分区 D 49/56 ✓   分区 E 49/56 ✓   分区 F 72/80 ✓
 可见三角面       : 306269 / 上限 1500000  ✓
 最高可见批次：oblique = 326（预算 350） ✓
 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
**开工前违规项已全部归零**：B 61/60（旧文本；现行配额 70 ⇒ 本就通过）、**C 55/50 ✗ → 55/60 ✓**、**D 48~49/40 ✗ → 49/56 ✓**、**E 49/40 ✗ → 49/56 ✓**。

## 6. 未做/边界
- 工程手段（LOD/合批/档位）**未实测**（`src/zones|kit|core` 均不在本卡 inScope）；
- `docs/CONTRACTS.md` **未改**（待 t89 并入 §4 文案并递增契约版本）；
- `tests/**` **未改**（§3 清单交回派单：`zone-west:673` 临时常量、其余 zone 测试与 `layout.test` 的配额 pin 归 t85）；
- 未删除任何内容、未关闭任何检查。

## 6. t93（分区配额单一权威源）：zone 测试去除硬编码/临时豁免

### 6.1 首要目标：`D_BUDGET_APPROVED` 收口
| 位置 | 旧 | **新** |
| --- | --- | --- |
| `tests/zone-west.test.mjs:676` | `const D_BUDGET_APPROVED = 56;`（t62 的临时常量） | **`const D_BUDGET_APPROVED = BUDGET.drawCalls.perZone.D;`**（唯一权威源） |
| `tests/zone-west.test.mjs:677` | `const D_BUDGET_EFFECTIVE = Math.max(D_BUDGET_INITIAL, D_BUDGET_APPROVED);` | **`= BUDGET.drawCalls.perZone.D;`**（去掉 `max()` 临时余量，与 t92 对 E 区的收紧同口径） |
| `tests/zone-west.test.mjs:675` | `const D_BUDGET_INITIAL = BUDGET.drawCalls.perZone.D; // 40（初始诊断目标）` | `const D_BUDGET_DIAGNOSTIC_INITIAL = 40;`（**仅打印用**的历史诊断目标，不参与断言） |

**权威源**：`CONFIG.BUDGET.drawCalls.perZone = {B:70,C:60,D:56,E:56,F:80}`（`scripts/audit.mjs:649` 读同一处）。**未放宽任何断言**（`<= perZone.D` 严格比较，未写成 `<= 350` 之类恒真式；断言数只增不减）。

### 6.2 全量排查结论（`grep -rn "perZone|drawCallBudget|70|50|40|56" tests/zone-*.mjs`）
- **已就位（无需改）**：`zone-forecourt:50/907-912`（读 `perZone.B`）· `zone-inner:788`（`perZone[ZONE]`，t92 已收紧）· `zone-east:553`（`perZone[ZONE]`，t92 已收紧）· `zone-garden:44/727-738/1031-1036`（读 `perZone.F`）。
- **本次改为单一权威源**：`zone-west:675-677`（见 §6.1）。
- **非配额字面量（逐条说明）**：`zone-west:675` 的历史诊断值 40（仅打印）；`zone-forecourt:618` 与 `zone-west:604` 的 `radius <= 40`（**几何扫描半径**，非配额）；`zone-garden:1035` 的 `interiorTriangles <= 4000`（**内景三角面预算**，属 `BUDGET.triangles` 族，非分区绘制配额）。
- **随 t102/t103 演进的陈旧 pin（本次一并同步，均注明来源）**：
  | 位置 | 旧 | 新 | 依据 |
  | --- | --- | --- | --- |
  | `zone-forecourt:263` | 可行走面 **27** | **51**（+22 B 区过渡台阶 t102 +2 亭门槛 t103） | t102/t103 |
  | `zone-west:179` | 可行走面 **17** | **25**（+8 D 区过渡台阶 t102） | t102 |
  | `zone-garden:790` 起 | 「不可进入 → 不应有门洞」对亭亦成立 | **亭例外分支**：`hasDoor===true` + `blocks==='exceptDoor'` + `door!==null`（t103 开敞亭可通行但不可进入内景） | t103 |

### 6.3 回归现状（实测）
```
zone-west      31 / 31  ✓（exit 0）
zone-inner     36 / 36  ✓（exit 0）
zone-east      32 / 32  ✓（exit 0）
zone-garden    37 / 37  ✓（exit 0）
zone-forecourt 38 / 39  ✗ 仍有 1 项
node scripts/audit.mjs --enforce → exit 0（预算与契约检查全部通过）
```

### 6.4 **残余未闭合项（本卡不放大、不放宽）**
- **位置**：`tests/zone-forecourt.test.mjs:687` `assert(walkIn.length >= 4, '从地坪可走入门内至少应有 4 栋')` ⇒ **实测 3**。
- **归因**：该项衡量的是**经 `ROAD` 从院落地坪走入门内**（测试自带 info 写明“台明正面**无注册 ROAD**（layout 侧缺口，与 verify-completeness §5.3 不连通清单同源）”。t102 登记的是**可行走过渡台阶**（`WK-*-transition-*`），**不是 ROAD** ⇒ 不满足该口径。
- **为何不在本卡修**：修复需在 **`src/shared/layout.js` 注册台明正面 ROAD**，**不在 t93 的 inScope**（本卡 inScope 仅五个 zone 测试 + 本文件）。
- **纪律**：**未把 4 改小**（不静默放宽），如实留红并归因 ⇒ 建议单开一张"台明正面 ROAD 登记"卡（layout 侧）。
