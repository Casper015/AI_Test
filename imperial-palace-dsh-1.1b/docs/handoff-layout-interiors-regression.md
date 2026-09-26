# 布局内景注册 · 回归与实测回执（t68 / 切片 2/2）

> ROOT：`imperial-palace-dsh-1.1b` · attempt `dbdcdbeb-ecbc-4b53-9b75-bcb96b6b2212`
> 实测基线：**`LAYOUT 1.1.3`，内景 43 处**（卡上写作“47 栋 / 1.1.0”是切分前口径；实际由 t70→t72→t73→t74 推进到 43 栋，**4 座角楼按 Q3 排除**）

## 0. 切片边界声明（先读）

本回执测的是**「内景地面/机位/走查点已注册、区域内尚未布陈设」的基线**：t62/t63/t64 的陈设未跑 ⇒ **这不是最终预算结论**，最终预算由各区自测 + t66 汇总。本卡**只写本文档**（未改 `src/**`、未改 `scripts/audit.mjs`、未改任何测试）。

## 1. 回归真实输出

### 1.1 `node tests/run.mjs` → **exit 1 · 通过 9 / 20，失败 11**（153649ms）
```
 FAIL tests/core-collision.test.mjs      FAIL tests/core-interior.test.mjs
 FAIL tests/core.test.mjs               FAIL tests/interaction.test.mjs
 FAIL tests/verify-completeness.test.mjs FAIL tests/verify-experience.test.mjs
 FAIL tests/zone-east.test.mjs          FAIL tests/zone-forecourt.test.mjs
 FAIL tests/zone-garden.test.mjs        FAIL tests/zone-inner.test.mjs
 FAIL tests/zone-west.test.mjs
 PASS core-audit / core-camera / core-registry / core-stats / core-walls /
      kit / layout / shot-mask / zones
 通过 9 / 20，失败 11，总耗时 153649ms
```

### 1.2 `node scripts/audit.mjs` → **exit 0 · 全部预算与契约检查通过**
```
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 B           : 58 / 预算 70   ✓     分区 E : 40 / 预算 40 ✓   分区 F : 61 / 预算 80 ✓
 可见三角面       : 288789 / 上限 1500000  ✓
 最高可见批次：oblique = 286（预算 350）✓
 阴影 pass        : 275 个投影对象；实时投影光源 1 盏（宫灯不投影）
 纹理数量         : 27 张（材质 104 个）
 结论：全部预算与契约检查通过
```

### 1.3 `node tests/layout.test.mjs` → **exit 0 · 通过 1736 项，失败 0 项 · 全部通过 ✓**
```
 连接 32，道路 95 段，墙 60 段，可行走面 69，障碍 81
 视角 61，导览点 10，走查点 50，config 1.0.6/v1.0.0
```

## 2. 逐条归因（11 个失败套件；**不得笼统归为“已知问题”**）

| # | 套件 | 断言（原文节选） | 归因 | 最小修法 | 归属 |
| --- | --- | --- | --- | --- | --- |
| 1 | `tests/core-interior.test.mjs` | 「内景体积由 layout 内景可行走面派生（B/C 两处）：**期望 2，实际 5**」 | 期望值**硬编码 2**（内景扩容前） | 期望值改为按 `INTERIOR_BY_SLOT` 派生（或 `WALKABLE.filter(kind==='interior').length`） | core 测试（**非本卡 inScope**） |
| 2 | `tests/core.test.mjs` | 「B/C 各 1 个 interior 机位：**期望 2，实际 43**」＋「灰盒数量（…**28 可走面 / 20 视角** / 49 灯位）：**期望 2，实际 43**」 | 台位与数量**硬编码**（28/20/2） | 同上：改为从 `LAYOUT_STATS`/映射派生 | core 测试 |
| 3-5 | `tests/core-collision.test.mjs` | ①「基线组装：41 条 y0 下钳…**应有 ≥40 条被下钳（实际 15）**」②「每区 ≥1 栋高台基建筑…**至少应复现 ≥2 例“原始盒放行”**」③「真实第一人称求解器：**`OB-F-garden-hall-north` 应给出阻挡原因**」 | **语义变更（设计内）**：t73/t74 为 35 栋补 `hasDoor` ⇒ 其障碍由 `blocks:'all'` 变为 `exceptDoor`（`layout.js:933+` 自动派生）⇒ 测试所依赖的“密封高台基建筑”样本集缩小/消失 | 测试应改为：只对**非 visitable 且非门洞类**建筑断言密封（与 t73 的 Q4 同一口径），其余断言“门洞可通” | core 测试 |
| 6 | `tests/interaction.test.mjs` | E8「FP_ROUTE 不连通（不可达路点诊断）」；E11「生产口径下 FP_ROUTE 不连通：`["广场西配殿门内","广场东配殿门内","主殿西配殿门内",…]`」 | ⚠️ **真实缺口（本卡最重要的发现）**：新注册的 43 处内景地面与既有走查图**不连通** —— 内景 `WK` 由 `inset(bounds,0.6)` 派生，**四周都被 `exceptDoor` 障碍盒包围**，而布局侧**没有生成“门洞通道”可行走面**把室内地面与室外地面连起来 ⇒ 数据侧“可进入”仍不成立 | 二选一：**(a) layout 侧**为每栋生成 `WK-<id>-door-passage`（门洞内侧 1.5m × 门宽，高度取 `door.sillY`，与室内地面及室外地面两端相接）；**(b) core 侧**让 `OB-*.blocks==='exceptDoor'` 的门洞成为连通口（碰撞图在门洞处打通内外）。**需主理人裁定归属**（layout 属本系列，core 属 core-engineer） | **需派单** |
| 7 | `tests/verify-completeness.test.mjs` | 「5.3 带真实区域碰撞的可行走图（cellSize=1）…**不连通**：广场西配殿门内, 主殿西配殿门内, 中殿门内, …」 | 同 #6（连通性） | 同 #6 | 需派单 |
| 8 | `tests/verify-experience.test.mjs` | F1（历史红，t13 登记，工具口径侧）＋「6.1 **20 个机位**全部登记（…interior 2…）— **共 61 个**：`{zone:7, fp-spawn:5, interior:43, focus-extra:6}`」 | 机位普查**硬编码 20/interior 2** | 期望值改为按 `VIEWPOINTS` 派生（或 `LAYOUT_STATS`） | 验证卡 |
| 9-13 | `tests/zone-east/forecourt/garden/inner/west.test.mjs`（5 个） | 同 #8 的机位/可行走面普查（`共 61 个`、`可行走面 69`） | 各区测试**硬编码**了扩容前的普查值 | 期望值改为从 layout 派生（`LAYOUT_STATS`、`INTERIOR_BY_SLOT`） | zone 测试 |

**汇总归因**：11 个失败中 **10 个是“期望值硬编码在扩容前口径”**（可机械修正，属各测试所有者）；**1 类（#6/#7）是真实功能缺口**——43 处内景**与走查图不连通**，“可进入”在数据侧也未闭环。

## 3. 性能与阴影（内景注册后的基线，合批口径）

| 口径 | 数值 | 预算 | 判定 |
| --- | --- | --- | --- |
| 主场景绘制调用（oblique、生产口径、含阴影批次分列） | **293** | ≤350 | ✓ |
| 最高可见批次（oblique） | 286 | 350 | ✓ |
| 可见三角面 | **288,789** | ≤1,500,000 | ✓ |
| 分区 B / E / F | 58 / 40 / 61 | 70 / 40 / 80 | ✓ |
| 阴影 pass 投影对象 | **275** | —（§8.2 要求单列） | 未见顶破 |
| 纹理 | 27 张 / 材质 104 | — | — |

**为什么内景注册几乎不动预算**：本轮改动是**布局数据**（`WALKABLE`/`VIEWPOINTS`/`FP_ROUTE`/门规格），**没有新增任何可见几何**（`src/zones`、`src/kit` 未改）；绘制调用与三角面与扩容前同量级。
**边界**：t62/t63/t64 的陈设（室内家具/宝座/屏风等）**尚未布**；它们才会真正增加室内可见几何 ⇒ **本表不是最终预算结论**。

## 4. 碰撞与可行走面自检

- **可站立性**：43 处内景地面全部在 `WALKABLE` 中且 `kind:'interior'`，`floorYAt(内景中心) ≥ wk.y`（无悬空：内景地面 y 取 `slot.baseY`，城门取通道面 0.4，均由实测探针确认）。
- **未被障碍覆盖**：43 处内景均**未被任何 `blocks:'all'` 的障碍盒覆盖**（内景所在建筑自身的障碍为 `exceptDoor`）。
- ⚠️ **不连通（阻断项）**：内景地面与室外可行走图**不同属一个连通分量**（`tests/interaction.test.mjs` E8/E11、`verify-completeness` 5.3 实测）；最小修法见 §2 #6。
- 另需注意：部分 sideHall 的 xz 与主殿台基重叠，`floorYAt` 取重叠面中 **y 最高**者（t74 已据此把走查点 y 改为 `floorYAt(点)+1.65`）；这属**正确行为**，但室内外连通时需按门洞实际地面接续。

## 5. 仍红项与处置

- **10 个“期望值硬编码”红项**：不属本卡 inScope（各测试所有者）；修法已逐条给出（§2）。
- **1 类真实缺口（内景不连通，影响 3 个套件）**：**阻断“可进入”闭环**，需主理人裁定修法归属（layout 生成门洞通道面 vs core 打通门洞连通）后派单。
- `audit.mjs` 全绿、`layout.test.mjs` 1736 项全绿 —— **预算与布局契约均未被本轮扩容破坏**。

## 6. 未实测项（不伪造）

- **渲染帧率 / DPR 实测**：只能在真实浏览器内测量（`scripts/shot.mjs` + `?stats=1`），本卡未跑。
- **逐区“近场/远场”明细**：`audit.mjs` 已给出激活档/全档/旧口径对照（本回执摘其汇总），逐区全表见 audit 原始输出。
- **室内陈设后的预算**：属 t62/t63/t64 + t66。
