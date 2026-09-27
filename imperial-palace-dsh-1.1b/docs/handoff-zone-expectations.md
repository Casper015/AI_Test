# handoff · T8.2 五套 zone 测试期望同步（t115）

- 任务：`t115`（repair，attempt 3；attempt_id `b3c4bc70-968a-4a47-89a6-f03693d3e6a7`）
- ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
- inScope：`tests/zone-forecourt.test.mjs`、`tests/zone-west.test.mjs`、`tests/zone-east.test.mjs`、`tests/zone-garden.test.mjs`、`tests/zone-inner.test.mjs`、本文件
- 交接版本（**实测**）：`LAYOUT_VERSION 1.1.20` · `CONFIG_VERSION 1.0.6` · 全城 `WALKABLE 171` · `VIEWPOINTS 61` · 内景 `43`

> 卡面写的「LAYOUT 1.1.10 / WALKABLE 112→157」是 **t65 调查时点**的数字；开工时按验收要求（"数值必须以当前树实测为准，不得凭转述"）
> 重新实测为 **1.1.20 / 171**（`tests/layout.test.mjs:503` 同口径钉住 `WALKABLE = 171`，含 t151 新增 C 两殿门外下坡带 4 级）。

## 1. 现状实测（本次开工逐一测量，非转述）

| 区 | 测试文件 | walkable（= 切片） | viewpoints（= 切片） | 障碍 | 坡道 | 灯位 | 建筑 | 批次/配额 | 本卡前状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B | `tests/zone-forecourt.test.mjs` | **53** | 13 | 12 | 8 | 44 | 12 | 65/70 | ✗ 38/39（定数 51 过期） |
| D | `tests/zone-west.test.mjs` | **25** | 11 | 42 | 1 | 29 | 14 | 52/56 | ✓ 31/31 |
| E | `tests/zone-east.test.mjs` | **27** | 12 | 41 | 2 | 26 | 15 | —/56 | ✓ 32/32 |
| F | `tests/zone-garden.test.mjs` | **29** | 11 | 26 | 14 | 21 | 14 | —/80 | ✓ 37/37 |
| C | `tests/zone-inner.test.mjs` | **37** | 12 | 40 | 5 | 32 | 12 | —/60 | ✓ 36/36 |

合计 = 53+25+27+29+37 = **171** = 全城 `WALKABLE`（与 `tests/layout.test.mjs:503` 逐值一致）。

### 1.1 逐 zone 组成（B 区为例，实测）

```
B 区 53 = 4 地面（WK-B-plaza / terrace-strip-west / -east / ground-north）
        + 24 门外过渡台阶与门槛（t102 的 22 级 `-transition-N` + t103 的 2 条 `-threshold`，kind 均为 'ground'）
        + 5 台基面（tier1 / tier2-south / tier2-north / tier2-mid / tier3）
        + 10 室内（每栋可进入建筑 1 个）+ 10 门洞通道（t75，kind:'passage'）
```
依据：`docs/handoff-layout-interiors.md` **§8（t102 门外过渡台阶）**：§8.2 登记规则、**§8.3 逐栋结果**、§8.7 跨 owner ripple（`WALKABLE 112 → 155`）、
**§8.8**（过渡面用**既有合法 kind `'ground'`** + id 后缀 `-transition-N` 标识，`audit --enforce` 首轮因新枚举 `transition` exit 1 的教训）；
`tests/layout.test.mjs:503`（总数 171）、`:382`（可行走面 ≥20）、`:383`（id 唯一）。

## 2. 逐条改动（file:line · 旧 → 新 · 依据 · 同义替换说明）

| # | file:line（改后行号） | 旧期望 | 新期望 | 依据（同口径） | 原意如何被守住 |
| --- | --- | --- | --- | --- | --- |
| 1 | `tests/zone-forecourt.test.mjs:265` | `stats.walkable === 51`（注释组成 = 8 原有 + 10 室内 + 10 通道 + 22 过渡 + 2 门槛） | `stats.walkable === 53`，注释改为准确组成（4 地面 + 24 过渡/门槛 + 5 台基面 + 10 室内 + 10 通道） | 实测切片 53；`tests/layout.test.mjs:503` 总数 171；`handoff-layout-interiors.md §8.3/§8.7/§8.8` | 仍是**精确相等**（不是 ≥/包含式），且总数仍同时与切片 `zoneLayout.walkable.length` 双向钉住（上一行保留） |
| 2 | `tests/zone-forecourt.test.mjs:266-271`（**新增**） | — | `wkByKind.ground === 28` / `terrace === 5` / `interior === 10` / `passage === 10` | 实测 kind 计数（本文件 §1.1） | **新增结构锚定**：把"53"拆成 4 个 kind 定数，任一来源变化必须显式更新（防未来静默漂移） |
| 3 | `tests/zone-forecourt.test.mjs:272-273`（**新增**） | — | `-transition-N` 面 = **22**；`-threshold` 面 = **2** | `handoff-layout-interiors.md §8.3`（t102 逐栋 43 级中 B 区 22 级）+ t103 门槛 2 条 | **新增**过渡面来源计数，直接锚到 layout 回执的逐栋表 |
| 4 | `tests/zone-forecourt.test.mjs:689-696`（原 `>=4` + 单点） | `walkIn.length >= 4` 且 `B-gate-front` 在列 | `walkIn` 集合 **精确等于** 7 栋（gate-front / side-west-south / side-east-south / side-west-main / side-east-main / side-west-rear / side-east-rear）；`blockedIn` 集合 **精确等于** 3 栋（hall-main / hall-mid / hall-rear） | 本文件 §3 实测（真实 walk-solver 图搜索） | **收紧而非放宽**：由"下界 + 单点"变为**双向精确集合**；被挡栋仍逐栋断言 `step > maxStepHeight` |

其余四套**本轮未改动**（原因见 §4），其定数/口径本身已是当前值且为精确断言。

## 3. `zone-forecourt` 专项（t62 交付、t65 点名）

### 3.1 `walkable 27 → 53`

t62 交付时为 27（8 原有 + 10 室内 + 10 通道）。t102 为 B 区登记 **22 级门外过渡台阶**、t103 登记 **2 条亭入口门槛**
（且台基面从 3 拆为 5 面）⇒ 27 → **53**。本轮改为精确 53 **并新增 §2 表 2/3 的结构锚定断言**（kind 组成 + 过渡/门槛计数），
使"数字同步"这件事本身带上可核对的依据，而不是继续钉一个裸数字。

### 3.2 「走入门内 ≥4」→ 双向精确集合（7 可走 / 3 被挡）

实测（`createWalkSolver` + `createWalkGraph`，cellSize 2，从"院落地坪探针"走到"门内 1.5m"）：

| 可走（7） | 阶差 | 被挡（3） | 阶差 | 原因 |
| --- | --- | --- | --- | --- |
| `B-gate-front` | 0.45 | `B-hall-main` | 4.5 | 台明 4.5m（经已注册丹陛三段上台，属"经台阶可达"，本表按最严口径记被挡） |
| `B-side-west-south` | 0.9 | `B-hall-mid` | 2.0 | 台明 2.0m，正面无注册台阶数据 |
| `B-side-east-south` | 0.9 | `B-hall-rear` | 1.8 | 台明 1.8m，正面无注册台阶数据 |
| `B-side-west-main` | 1.5 | | | |
| `B-side-east-main` | 1.5 | | | |
| `B-side-west-rear` | 1.0 | | | |
| `B-side-east-rear` | 1.0 | | | |

- **那 2 栋 dual（`B-side-west-main` / `B-side-east-main`）在本口径下已可走**：t102 登记的门外过渡台阶使 `floorYAt` 在门前形成 ≤0.5m 的连续落面。
- t65 的「从登记入口外 1.2m 可真实步入 **41/43**、2 栋例外」是**另一口径**（起点贴门口、终点取室内中心，t65 `core-collision` 用例），
  与本表的"从院落地坪走入门内"（起点在区地坪、终点在门内 1.5m）**不矛盾**；两者都不放宽判据。
- **生产 FP 口径（`src/interaction/walk-solver.js` 的子步进/谓词一致性）由 `t77` 复判定**（t86 已量化：该文件与 core 求解器同构缺陷、411 例口径不一致）。
  本卡只在 zone 测试内按**当前数据**记录，不宣称生产走查已闭合。

## 4. 其余四套为何"本轮不改"（实测确认已同步，不存在放宽）

| 文件 | 计数口径（实测行号） | 结论 |
| --- | --- | --- |
| `zone-inner`（C） | `:725 result.colliders.walkable.length === LAYOUT.WALKABLE.filter(w=>w.zone===ZONE).length`（=37）、`:597` 视角同形（=12） | **动态切片精确相等**，本身随 layout 演进，无需同步 |
| `zone-east`（E） | `:361`（=27）、`:324`（=12）同形 | 同上 |
| `zone-garden`（F） | `:821 result.colliders.walkable.length === F_WALKABLE.length`（=29）、`:746` 机位（=11） | 同上（F 无过渡面，29 = 4 outerTerrain + 6 ground + 4 bridgeDeck + 1 gardenGround + 7 interior + 7 passage） |
| `zone-west`（D） | `:179 contract.stats.walkable === 25`（=1 地面 + 8 室内 + 8 通道 + 8 t102 过渡）、`:181` 机位 `3+8`（=11） | 定数已是当前值（D 的 8 级过渡台阶已并入注释），精确相等 |

同时**扫描确认**五套中不存在"把计数期望改成 `>=`/包含式绕过"的写法：计数类断言一律 `assertEqual`；
仅有的宽松比较是**局部合理性下界**（如 `zone-inner:701 obstacles.length > slots.length`、`zone-east:381 ramps.length > 0`、`layout` 自身 `walkable >= 20`），与本卡期望同步无关。

## 5. "不得放宽、不得删断言"的机器证据

- `tests/zone-forecourt.test.mjs`：`assert*` 计数 **242 → 249**（+7：总数/结构锚定 6 + 走入门内精确集合净 +1）；用例数 **39 → 39**（未删用例）。
  - 原 `>=4` 与单点断言被**替换为双向精确集合**（同一用例内，断言数净 +1，严格更强）。
- 其余四套：**零改动**（本轮未写入），其断言数不变：`zone-west 211`、`zone-east 187`、`zone-garden 274`、`zone-inner 217`。
- 未删除任何断言；未把任何精确期望改写为区间/包含式（§4 末尾扫描）。

## 6. 回归（原样输出）

```text
$ node tests/zone-forecourt.test.mjs && node tests/zone-west.test.mjs && node tests/zone-east.test.mjs && node tests/zone-garden.test.mjs && node tests/zone-inner.test.mjs
  通过 39 / 39      ← zone-forecourt（exit 0）
  通过 31 / 31      ← zone-west
  通过 32 / 32      ← zone-east
  通过 37 / 37      ← zone-garden
  通过 36 / 36      ← zone-inner
（整条命令 exit=0）

  · B 区：74 网格 / 91104 三角面 / 65 绘制批次（≤70）
  · 从院落地坪走入门内：7/10 可走（B-gate-front(阶0.45) / B-side-west-south(阶0.9) / B-side-east-south(阶0.9) /
    B-side-west-main(阶1.5) / B-side-east-main(阶1.5) / B-side-west-rear(阶1) / B-side-east-rear(阶1)）；
    被台明落差挡住 3 栋：B-hall-main(阶4.5) / B-hall-mid(阶2) / B-hall-rear(阶1.8)

$ node scripts/audit.mjs --enforce
  main scene 333/350 ✓ · B 62/70 ✓ · C 55/60 ✓ · D 49/56 ✓ · E 49/56 ✓ · F 72/80 ✓
  可见三角面 306737 / 1500000 ✓
  结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）      ← exit 0
```

## 7. 发现 / 未验证

1. **卡面数字滞后**：卡面写 `LAYOUT 1.1.10 / WALKABLE 112→157`，实测已是 **1.1.20 / 171**（t151 又加了 C 两殿门外下坡带 4 级）。
   本卡按"以当前树实测为准"执行；后续同类卡建议直接引用 `tests/layout.test.mjs:503` 的 171 而非转述。
2. **B 区 3 栋台明仍无注册台阶**（金銮殿 4.5 / 中殿 2.0 / 后殿 1.8）：真实数据下不能从地坪直接走进门内。
   这是**数据缺口**而非陈旧数字 ⇒ 按验收要求**未放宽**断言，逐栋量化后交回主理人（与 `verify-completeness §5.3` 不连通清单、t77 生产口径同源）。
3. **未验证**：① 生产 FP（`src/interaction/walk-solver.js`）与本 zone 测试口径的一致性（t77 负责）；
   ② 浏览器端到端走查；③ 若 `LAYOUT` 再增面，五套中 3 套（inner/east/garden）因其动态切片口径会**自动跟随**，
   `zone-forecourt`/`zone-west` 的定数会再次变红（本卡已加结构锚定，便于定位）。
4. 本卡 **未触碰** `src/**`、`tests/layout.test.mjs`、`tests/core*.test.mjs`、`tests/interaction.test.mjs`、`tests/verify-*.mjs`、`docs/CONTRACTS.md`。
