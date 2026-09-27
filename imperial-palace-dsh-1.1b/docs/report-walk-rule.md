# 报告 · t132 只读探针：同一平面位置"取高面"机制、全量影响面与两案量化

任务：`t132`（kind=work，attempt 1）· 执行者：core-engineer（attempt_id `c64e9beb-29c5-488e-9445-7bdff5a8be7c`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
交付物：**只读探针脚本** `scripts/probe-walk-rule.mjs` + 本报告。**未改动任何生产代码**（`src/**`、`tests/**`、`docs/CONTRACTS.md` 全部只读）。

**复现命令（第三方可复核）**
```bash
node scripts/probe-walk-rule.mjs            # 人类可读报告（1m 网格，全城）
node scripts/probe-walk-rule.mjs --json     # 全量机器可读（235 对 + 63 门洞逐条）
node scripts/probe-walk-rule.mjs --cell=2   # 换 2m 网格（与既有测试口径一致）
```

---

## 1. 机制证据（生产代码路径，不靠推断）

| 位置 | 事实 |
| --- | --- |
| `src/shared/layout.js` `floorYAt(x,z)` | 遍历 `WALKABLE` 取 `if (y === null || s.y > y) y = s.y` ⇒ **同一平面位置取最高面**；随后 `ROADS` 坡道同样取 `max` |
| `src/interaction/walk-graph.js` `sample(col,row)` | 节点高度 = `solver.probe(x,z,null).surfaceY`（即 `floorYAt` 的结果） |
| `src/interaction/walk-graph.js` `canStep(a,b)` | `b.y − a.y > maxStepHeight(0.5)` 拒；`< −snapDownDistance(0.6)` 拒（**有向**） |
| `src/interaction/walk-solver.js` `probe()` | `surfaceY = groundAt(x,z)` = `layout.floorYAt` |

⇒ 低面若在同格被高面盖住，该格节点高度就是**高面的 y**；从低面相邻格过去必然 `stepTooHigh`。**这就是 t131 的面级链完整而图仍不可达的原因。**

## 2. 全城扫描（1m 网格 · 20m 桶空间索引 · 全城范围）

```
访问格数 79,738 · "低面被高面压住"的 (格,高面) 命中次数 84,233 · (低面,高面) 对 235
其中低面属"已登记通路类"（passage/interior/threshold/transition/terrace）的对：34
```

（下为节选；**全量 235 对**见 `--json` 的 `scan.rows`，每行含 `coveredCells/ownCells`、`fullyCovered`。）

  | 低面 | kind | y | 高面（同位置） | kind | 高 y | 高差 | 覆盖格数 | 完全内含 | 通路类 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | `WK-B-terrace-tier1` | terrace | 1.5 | `WK-B-terrace-tier3` | terrace | 4.5 | 3 | 7345/14655 | 部分 | 是 |
  | `WK-B-ground-north` | ground | 0 | `WK-B-hall-mid-interior` | interior | 2 | 2 | 1377/6282 | 部分 | — |
  | `WK-B-ground-north` | ground | 0 | `WK-B-hall-mid-door-passage` | passage | 2 | 2 | 189/6282 | 部分 | — |
  | `WK-B-ground-north` | ground | 0 | `WK-B-hall-rear-interior` | interior | 1.8 | 1.8 | 1711/6282 | 部分 | — |
  | `WK-B-ground-north` | ground | 0 | `WK-B-hall-rear-door-passage` | passage | 1.8 | 1.8 | 189/6282 | 部分 | — |
  | `WK-B-terrace-tier2-mid` | terrace | 3 | `WK-B-terrace-tier3` | terrace | 4.5 | 1.5 | 3051/3375 | 部分 | 是 |
  | `WK-C-ground` | ground | 0.9 | `WK-C-bed-terrace-south` | terrace | 2.4 | 1.5 | 2755/16314 | 部分 | — |
  | `WK-C-ground` | ground | 0.9 | `WK-C-bed-terrace-north` | terrace | 2.4 | 1.5 | 2755/16314 | 部分 | — |
  | `WK-C-ground` | ground | 0.9 | `WK-C-bed-terrace-mid` | terrace | 2.4 | 1.5 | 2375/16314 | 部分 | — |
  | `WK-B-terrace-tier2-south` | terrace | 3 | `WK-B-terrace-tier3` | terrace | 4.5 | 1.5 | 2260/4350 | 部分 | 是 |

**读法（重要）**：绝大多数"被压"是**设计使然**（台地压地面、桥面压水面、室内面压地面）；只有那些**属于门洞链**且**图实测不可达**的才是缺陷 —— 见 §3。

## 3. 门洞链结论（63 个有门槽位，逐条 `probe` + `path`）

- **存在"链上面被同位置高面压住"的槽位：24**
- **`cellSize:1` 生产图上真正不可达（且未声明 `blockedBy`）：4** —— **`B-side-west-main` / `B-side-east-main` / `C-side-west-main` / `C-side-east-main`**（= t131 交回的 F4/F6/F8 集合）
- ⇒ **"被压 ≠ 必然不可达"：24 个被压槽位里只有 4 个真的断链**（其余 20 个图上仍能找到通路），这正是"必须先量后改"的证据。

受影响（被压 ∩ 不可达）逐条：

  | slotId | 门宽 | passable | 低面被压的链上面 | 覆盖者(高面) | probe(facade/门中/室内) | cellSize1 path | cellSize2 path |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `B-hall-mid` | 26 | true | WK-B-hall-mid-transition-1@1.5<br>WK-B-hall-mid-transition-2@1<br>WK-B-hall-mid-transition-3@0.5<br>WK-B-hall-mid-transition-4@0 | WK-B-hall-mid-door-passage@2<br>WK-B-hall-mid-transition-1@1.5<br>WK-B-hall-mid-transition-2@1<br>WK-B-hall-mid-transition-3@0.5 | 2 / 2 / 2 | ✓ (21) | ✓ (22) |
  | `B-hall-rear` | 26 | true | WK-B-hall-rear-transition-1@1.35<br>WK-B-hall-rear-transition-2@0.9<br>WK-B-hall-rear-transition-3@0.45<br>WK-B-hall-rear-transition-4@0 | WK-B-hall-rear-door-passage@1.8<br>WK-B-hall-rear-transition-1@1.35<br>WK-B-hall-rear-transition-2@0.9<br>WK-B-hall-rear-transition-3@0.45 | 1.8 / 1.8 / 1.8 | ✓ (22) | ✓ (24) |
  | `B-side-west-south` | 26 | true | WK-B-side-west-south-transition-1@0.45<br>WK-B-side-west-south-transition-2@0 | WK-B-side-west-south-door-passage@0.9<br>WK-B-side-west-south-transition-1@0.45 | 0.9 / 0.9 / 0.9 | ✓ (18) | ✓ (18) |
  | `B-side-east-south` | 26 | true | WK-B-side-east-south-transition-1@0.45<br>WK-B-side-east-south-transition-2@0 | WK-B-side-east-south-door-passage@0.9<br>WK-B-side-east-south-transition-1@0.45 | 0.9 / 0.9 / 0.9 | ✓ (18) | ✓ (20) |
  | `B-side-west-main` | 26 | true | WK-B-side-west-main-door-passage@1.5<br>WK-B-side-west-main-transition-1@2<br>WK-B-side-west-main-transition-2@2.5 | WK-B-terrace-tier2-south@3<br>WK-B-terrace-tier2-west@3<br>WK-B-terrace-tier2-north@3<br>WK-B-side-west-main-transition-2@2.5<br>WK-B-side-west-main-transition-3@3 | 3 / 1.5 / 1.5 | ✗ (—) | ✗ (—) |
  | `B-side-east-main` | 26 | true | WK-B-side-east-main-door-passage@1.5<br>WK-B-side-east-main-transition-1@2<br>WK-B-side-east-main-transition-2@2.5 | WK-B-terrace-tier2-south@3<br>WK-B-terrace-tier2-east@3<br>WK-B-terrace-tier2-north@3<br>WK-B-side-east-main-transition-2@2.5<br>WK-B-side-east-main-transition-3@3 | 3 / 1.5 / 1.5 | ✗ (—) | ✗ (—) |
  | `B-side-west-rear` | 20 | true | WK-B-side-west-rear-transition-1@0.5<br>WK-B-side-west-rear-transition-2@0 | WK-B-side-west-rear-door-passage@1<br>WK-B-side-west-rear-transition-1@0.5 | 1 / 1 / 1 | ✓ (17) | ✓ (18) |
  | `B-side-east-rear` | 20 | true | WK-B-side-east-rear-transition-1@0.5<br>WK-B-side-east-rear-transition-2@0 | WK-B-side-east-rear-door-passage@1<br>WK-B-side-east-rear-transition-1@0.5 | 1 / 1 / 1 | ✓ (17) | ✓ (18) |
  | `C-hall-bed-rear` | 26 | true | WK-C-hall-bed-rear-transition-1@1.7<br>WK-C-hall-bed-rear-transition-2@1.3<br>WK-C-hall-bed-rear-transition-3@0.9 | WK-C-hall-bed-rear-door-passage@2.1<br>WK-C-hall-bed-rear-transition-1@1.7<br>WK-C-hall-bed-rear-transition-2@1.3 | 2.1 / 2.1 / 2.1 | ✓ (22) | ✓ (24) |
  | `C-side-west-main` | 26 | true | WK-C-side-west-main-interior@1.7000000000000002<br>WK-C-side-west-main-door-passage@1.7000000000000002<br>WK-C-side-west-main-transition-1@1.3<br>WK-C-side-west-main-transition-2@0.9 | WK-C-bed-terrace-south@2.4<br>WK-C-bed-terrace-west@2.4<br>WK-C-bed-terrace-north@2.4<br>WK-C-side-west-main-door-passage@1.7000000000000002<br>WK-C-side-west-main-transition-1@1.3<br>WK-C-bed-terrace-mid@2.4 | 1.7000000000000002 / 2.4 / 2.4 | ✗ (—) | ✗ (—) |
  | `C-side-east-main` | 26 | true | WK-C-side-east-main-interior@1.7000000000000002<br>WK-C-side-east-main-door-passage@1.7000000000000002<br>WK-C-side-east-main-transition-1@1.3<br>WK-C-side-east-main-transition-2@0.9 | WK-C-bed-terrace-south@2.4<br>WK-C-bed-terrace-north@2.4<br>WK-C-bed-terrace-east@2.4<br>WK-C-side-east-main-door-passage@1.7000000000000002<br>WK-C-bed-terrace-mid@2.4<br>WK-C-side-east-main-transition-1@1.3 | 1.7000000000000002 / 2.4 / 2.4 | ✗ (—) | ✗ (—) |
  | `C-side-west-rear` | 24 | true | WK-C-side-west-rear-transition-1@1.2<br>WK-C-side-west-rear-transition-2@0.9 | WK-C-side-west-rear-door-passage@1.5<br>WK-C-side-west-rear-transition-1@1.2 | 1.5 / 1.5 / 1.5 | ✓ (17) | ✓ (18) |
  | `C-side-east-rear` | 24 | true | WK-C-side-east-rear-transition-1@1.2<br>WK-C-side-east-rear-transition-2@0.9 | WK-C-side-east-rear-door-passage@1.5<br>WK-C-side-east-rear-transition-1@1.2 | 1.5 / 1.5 / 1.5 | ✓ (17) | ✓ (18) |
  | `D-court1-hall` | 26 | true | WK-D-court1-hall-transition-1@0.85<br>WK-D-court1-hall-transition-2@0.4 | WK-D-court1-hall-door-passage@1.3<br>WK-D-court1-hall-transition-1@0.85 | 1.3 / 1.3 / 1.3 | ✓ (19) | ✓ (20) |
  | `D-court2-hall` | 26 | true | WK-D-court2-hall-transition-1@0.85<br>WK-D-court2-hall-transition-2@0.4 | WK-D-court2-hall-door-passage@1.3<br>WK-D-court2-hall-transition-1@0.85 | 1.3 / 1.3 / 1.3 | ✓ (19) | ✓ (20) |
  | `D-court3-hall` | 26 | true | WK-D-court3-hall-transition-1@0.85<br>WK-D-court3-hall-transition-2@0.4 | WK-D-court3-hall-door-passage@1.3<br>WK-D-court3-hall-transition-1@0.85 | 1.3 / 1.3 / 1.3 | ✓ (19) | ✓ (20) |
  | `D-court4-hall` | 26 | true | WK-D-court4-hall-transition-1@0.85<br>WK-D-court4-hall-transition-2@0.4 | WK-D-court4-hall-door-passage@1.3<br>WK-D-court4-hall-transition-1@0.85 | 1.3 / 1.3 / 1.3 | ✓ (19) | ✓ (20) |
  | `E-court1-hall` | 26 | true | WK-E-court1-hall-transition-1@0.9<br>WK-E-court1-hall-transition-2@0.4 | WK-E-court1-hall-door-passage@1.4<br>WK-E-court1-hall-transition-1@0.9 | 1.4 / 1.4 / 1.4 | ✓ (21) | ✓ (22) |
  | `E-court2-hall` | 26 | true | WK-E-court2-hall-transition-1@0.9<br>WK-E-court2-hall-transition-2@0.4 | WK-E-court2-hall-door-passage@1.4<br>WK-E-court2-hall-transition-1@0.9 | 1.4 / 1.4 / 1.4 | ✓ (20) | ✓ (22) |
  | `E-court3-hall` | 26 | true | WK-E-court3-hall-transition-1@0.85<br>WK-E-court3-hall-transition-2@0.4 | WK-E-court3-hall-door-passage@1.3<br>WK-E-court3-hall-transition-1@0.85 | 1.3 / 1.3 / 1.3 | ✓ (19) | ✓ (20) |
  | `E-court3-annex` | 22 | true | WK-E-court3-annex-door-passage@0.9 | WK-E-court3-hall-interior@1.3 | 1.3 / 0.9 / 0.9 | ✓ (15) | ✓ (16) |
  | `E-court4-hall` | 26 | true | WK-E-court4-hall-transition-1@0.85<br>WK-E-court4-hall-transition-2@0.4 | WK-E-court4-hall-door-passage@1.3<br>WK-E-court4-hall-transition-1@0.85 | 1.3 / 1.3 / 1.3 | ✓ (20) | ✓ (22) |
  | `F-gate-south` | 26 | true | WK-F-gate-south-door-passage@0.4 | WK-F-bridge-south@0.8 | 0.8 / 0.4 / 0.4 | ✓ (20) | ✓ (22) |
  | `F-gate-north` | 26 | true | WK-F-gate-north-door-passage@0.4 | WK-F-bridge-north@0.8 | 0.8 / 0.4 / 0.4 | ✓ (20) | ✓ (20) |

> 备查：`B-hall-mid` 等 20 个槽位**同样有链上面被压**，但 `path 门外→门中` ✓（21–22m），完整输出中可对照。

## 4. 最小复现（第三方可直接复核）

【④ 最小复现（可被第三方复核）】
  ── B-side-west-main ──
  门外锚点 facade = {"x":-66,"z":-116,"y":1.5,"outward":"east","note":"门外锚点 = 通道面进深轴外端中心（外墙面向外 6.0m）"}
  probe：门外 surfaceY=3 · 门中 surfaceY=1.5 · 室内中心 surfaceY=1.5
  面级链：WK-B-side-west-main-interior(interior)@1.5 → WK-B-side-west-main-door-passage(passage)@1.5 → WK-B-side-west-main-transition-1(ground)@2 → WK-B-side-west-main-transition-2(ground)@2.5 → WK-B-side-west-main-transition-3(ground)@3
  ⚠ 取高面：面 WK-B-side-west-main-door-passage 自身 y=1.5，但生产 probe 在该面中心解析到 **3**（取到了同位置更高的面）
  图节点高度（cellSize=1）：门外=3 · 门中=1.5 · 室内=1.5 · canStep(门外→门中)=false
  path 门外→门中（cellSize=1）=**不可达**；门外→室内=**不可达**；cellSize=2（门外→门中）=**不可达**
  ── C-side-west-main ──
  门外锚点 facade = {"x":-50,"z":168,"y":1.7,"outward":"east","note":"门外锚点 = 通道面进深轴外端中心（外墙面向外 6.0m）"}
  probe：门外 surfaceY=1.7000000000000002 · 门中 surfaceY=2.4 · 室内中心 surfaceY=2.4
  面级链：WK-C-side-west-main-interior(interior)@1.7000000000000002 → WK-C-side-west-main-door-passage(passage)@1.7000000000000002 → WK-C-side-west-main-transition-1(ground)@1.3 → WK-C-side-west-main-transition-2(ground)@0.9
  ⚠ 取高面：面 WK-C-side-west-main-interior 自身 y=1.7000000000000002，但生产 probe 在该面中心解析到 **2.4**（取到了同位置更高的面）
  图节点高度（cellSize=1）：门外=1.7000000476837158 · 门中=2.4000000953674316 · 室内=2.4000000953674316 · canStep(门外→门中)=false
  path 门外→门中（cellSize=1）=**不可达**；门外→室内=**不可达**；cellSize=2（门外→门中）=**不可达**

**判定**：`B-side-west-main` 的门外锚点解析到 **3.0**（那是 `WK-B-terrace-tier2@3`），而该门通道面自身是 **1.5** ⇒ 起点比门中高 1.5m，`canStep=false`（下台阶阈值 0.6）⇒ 门外进不到门洞；`C-side-west-main` 反过来：门外 1.7 ✓、**门中/室内被 `WK-C-bed-terrace@2.4` 顶到 2.4** ⇒ 1.7 → 2.4 = Δ0.7 > 0.5（上台阶阈值）⇒ 同样断链。两处都**不是几何缺失，而是取高面**。

## 5. 两案量化对比（**不实施，交回主理人裁定**）

### (a) 改「取高规则」（存在低面且该低面属于已登记通路时优先取低面 / 考虑全部重叠面）
| 项 | 实测 |
| --- | --- |
| 会改变取高结果的位置 | **21,670 个 1m 格** |
| 涉及面 | **13 个**（`WK-B-terrace-tier1/tier2-*`、`WK-B-side-{west,east}-main-door-passage`、`WK-C-side-{west,east}-main-interior`/`-door-passage`、`WK-E-court3-annex-door-passage`、`WK-F-gate-{south,north}-door-passage`） |
| 副作用风险代理：改规则后"站到低面即被孤立"的格 | **0 个**（这些低面在 1m 网格上均有同面相邻格） |
| 其它风险（裁定前需量化） | ①**穿台地/站在地形内**（规则是全局的：台地上的低面会被优先选中）；②**包络/碰撞复检**（脚高降低后需复跑 `probe` 的 `envelope/obstacles` 分支）；③`ROADS` 与 `WALKABLE` 的取高顺序语义 |
| 需要的新断言（建议 3 类） | ①「同一平面位置存在多个可行走面时，**站立解析必须与所在通路的登记面一致**」（逐格，覆盖门洞链）；②「取低面不得使玩家进入包络/地形内部」（逐格 AABB/包络复检）；③「**台地顶面在无通路时仍取高面**」（防回归到"穿台地"） |

### (b) 继续逐个开槽 / 补接近面
| 项 | 实测 |
| --- | --- |
| 仍需处理的槽位 | **4 个**：`B-side-west-main`、`B-side-east-main`、`C-side-west-main`、`C-side-east-main` |
| 几何改动量（按 t131 既有模式 = 门外补 2 级台阶） | 4 处 × **净 +2 面** ⇒ 合计 **+8** 个可行走面（`WALKABLE` 计数与 core pin 需再同步一次） |
| 影响面 | **局部**（只动这 4 栋门前台阶），不触碰取高规则 ⇒ 不改变"玩家能站在台地上"的既有能力 |
| 代价 | 布局变更 + 1 次 pin 同步 + 复跑布局/可达性守卫 |

**两案代价对比（供裁定，不预设倾向）**：(a) 一次改全局解析、可覆盖未来同类问题，但影响 **21,670 格**、需 3 类新断言并承担穿台地/包络风险；(b) 只 4 处几何、+8 面、影响局部，但属"逐例修"（新建筑同类问题需再派卡）。

## 6. 边界与交回（**本卡 inScope 不含 `tests/**` 与 `docs/CONTRACTS.md`**）

契约的 **Out of scope** 明确列出 `tests/` 与 `docs/CONTRACTS.md`（平台以该字段为准）⇒ 第 6 项（pin 同步）与第 7 项（§12.1 契约条款）**本卡未执行**，如实交回；现成材料如下。

**（6）core 侧 pin 同步（169 → 171，`LAYOUT_VERSION 1.1.16`）**
- 实测：`LAYOUT_VERSION 1.1.16`、`WALKABLE **171**`、`byKind: outerTerrain:4 / ground:64 / bridgeDeck:4 / gardenGround:1 / terrace:12 / interior:43 / passage:43`（= 171）；Δ = `ground 62→64`（t131：`E-court3-hall` 补 2 级台阶）。
- 现状对照：`tests/layout.test.mjs` **已**钉 `171`（`:503` `WALKABLE = 171（169 + t131…）`、`:73` 版本 `1.1.16`、`:765/:766/:773` 过渡台阶 49 级 / cellSize:1 逐级守卫 / 覆盖 21 栋）；**唯一陈旧处在 `tests/core.test.mjs`**（仍 169 / `LAYOUT 1.1.15`）⇒ 需一张最小 pin 卡（精确相等、不得改 `>=`/包含式）。

**（7）`docs/CONTRACTS.md §12.1` 成对不变式（草案，交回并入）**
> **§12.1 可行走面成对不变式（历史只追加）**
> ① **任何可行走面不得被更高可行走面完全内含（平面投影）** —— 承载断言：`tests/layout.test.mjs` 的 **t128 遮蔽守卫**（`tests/layout.test.mjs:688`「过渡面只属 t100 的 18 栋 ∪ t128 授权的 C 两栋（未登记多余几何）」；同文件 `:766`「t121/t128 逐级：cellSize:1 下每条台阶带至少含 1 个格心」）。
> ② **每处内景门洞的「门外接近面 → 通道面 → 室内面」链必须存在且相邻可跨** —— 承载断言：`tests/layout.test.mjs` 的 **t131 通路存在守卫**（**`:882`** 标题原文「`t131：通路存在守卫（门洞三段链：门外接近面 → 通道面 → 室内面）`」；配套 `:73` 版本 `1.1.16`、`:503` `WALKABLE = 171（169 + t131：E-court3-hall 门外 2 级台阶，加法）`、`:671`/`:765`「过渡面/台阶 49 级（18 栋 43 + C 两栋 4 + t131 的 E-court3-hall 2）」、`:773`「覆盖 21 栋（§11.2 的 18 栋 + t128 的 C 两栋 + t131 的 E-court3-hall）」）。
> 两条均为**常驻护栏**（不是建议）：违反即测试红；布局侧新增/修改面时必须先满足。

（探针只**只读**引用这两条不变式的对象；未改其断言与阈值。）

## 7. verify（原样）

```text
$ node scripts/probe-walk-rule.mjs  → exit=0（本报告全部数字即其输出；--json 另有全量）
$ node scripts/audit.mjs --enforce  → exit=0 · 结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）
```
探针**不参与生产路径**（只 import 生产模块做只读测量），未放宽 `maxStepHeight 0.5` / `snapDownDistance 0.6` / `cellSize` / 玩家体积 / 包络。

## 8. 探针自检与已知限制

1. **一次自检纠错（已修，值得记下）**：`graph.path(from,to)` 收**世界坐标**（内部自行 `nearestCell`）；初版误传 `{col,row}` ⇒ 63 门洞全判"不可达"（61 ✗）。修正后为 **4 ✗**，与 t131 独立结论一致 ⇒ 该数字经交叉验证。
2. **风险代理只是代理**：`isolatedLowCells=0` 只说明"低面在 1m 网格上不孤"，**不等于**改规则后无穿台地风险（那需真的改规则后复跑包络/碰撞；本卡按"不得先改代码"未做）。
3. **扫描覆盖**：门洞链在 `cellSize:1`（全城图，`maxCells` 提到 3e6）与 `cellSize:2` 两套图上均跑；全城"被压"枚举为**解析式**（面包围盒重叠），未逐格调用 `solver.probe`（性能取舍）。
4. **`ROADS` 坡道**未纳入"被压"枚举（只统计 `WALKABLE`），但其取高语义与 `floorYAt` 一致（同为 max）。
