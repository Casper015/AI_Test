# 交付回执 · CONTRACTS 修正：`openings[].at` 语义 + 版本表口径统一（t37 / T3.7）

> 归属：t1 foundation-lead · 任务：t37 · attempt_id：`07d8f69e-284c-4f61-966e-41c4148f1a6a`
> 版本对应（本次修正后）：**`CONTRACTS v1.0.7` ⇄ `CONFIG_VERSION 1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ `STYLE_BASELINE v1.0.0`**
> 性质：**repair**（只改 `docs/CONTRACTS.md` 与本回执；未改 `src/**`、`tests/**`、`docs/reports/**`、`docs/handoffs/**`、`docs/STYLE_GUIDE.md`）

## 1. C-1：`openings[].at` 语义（改文档对齐实现）

### 1.1 权威口径（实现）

`layout.WALLS[].openings[].at` = **沿墙轴的世界绝对坐标**（`axis:'x'` → x 坐标；`axis:'z'` → z 坐标）。
权威实现与本次引用一致：

```js
// src/core/layout-slice.js::wallSolidSpans()（原文节选）
const lo = horizontal ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z);
const hi = horizontal ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z);
const gaps = (wall.openings ?? []).map((o) => [o.at - o.width / 2, o.at + o.width / 2]); // ← o.at 直接与世界坐标 lo/hi 比较
```

### 1.2 一个必须澄清的事实（诚实记录）

**本次修改前，`docs/CONTRACTS.md` 全文并不存在"相对墙中点"这句话**：
`grep -ni "opening\|walls\b" docs/CONTRACTS.md` 在修正前**零命中**（§3.4 只冻结了工厂名与参数名，未写 `openings` 的语义）。
"`openings` 的 at = 相对墙中点的偏移"这句实际写在：

| 位置 | 原文 | 是否正确的口径 |
| --- | --- | --- |
| `src/kit/buildings.js`（`makeWall` 注释） | 「openings 的 at = 相对墙中点的偏移」 | **对 `kit.wall(p)` 正确**（kit 工厂自己的入参） |
| `src/zones/forecourt.js:452` | 「`layout.WALLS` 的 `openings[].at` 是**世界坐标**，`kit.wall` 需要**相对墙中点**的偏移，这里换算」 | 正确（区域作者已在换算） |
| `src/zones/west-courts.js:245` | 「kit.wall 的 openings.at 是相对墙中点的偏移；layout 的 openings.at 是世界坐标」 | 正确 |

V1(t12) 报告 §5 与 `docs/handoff-verifier.md:30` 把该措辞归到了 CONTRACTS §3.4（可能源自早期修订或 kit 注释的串读）。
结论不变：**契约此前确实缺少 `at` 语义的权威定义**（这是真正的缺口），本次以新增 §3.4.8 补齐，并把 **layout 与 kit 两种口径并列写清**，
避免后来者把 `kit.wall` 的口径套到 `layout.WALLS` 上——这正是"按文档实现会把洞口算到 −636"的机制。

### 1.3 新增的 §3.4.8（含正例/反例/陷阱例 + 警告）

- **警告措辞**：「⚠️ **勿按「相对墙中点」理解 `layout` 的 `at`。**」+ 两种口径对照表（谁在用）。
- **正例 ①** `CY-D-court1-wall-east`（洞口恰在中点，最易误读）
- **正例 ②** `CY-D-court4-wall-east`（洞口不在中点，误读会让实心段跑到墙外）
- **陷阱例** `CY-B-throne-wall-north`（中点 = 0 ⇒ 两种读法**结果相同**，不能用作口径回归）
- **换算公式**（区域调用 `kit.wall` 时）：`at_kit = at_layout − mid_along_axis`
- **不改数据的理由**（主理人裁定）已写入：改数据需递增 `LAYOUT_VERSION` 并回归 4 个区域，代价远大于修正文档。

### 1.4 交叉验证（真实输出，脚本 `/tmp/t37-verify-at.mjs`）

```text
[CY-D-court1-wall-east] axis=z  沿轴区间=[-392, -244]  中点=-318  openings: at=-318/w=12
  ① 实现口径（at = 世界绝对坐标）      → 实心段 [[-392,-324],[-312,-244]]
  ② 若误按"相对墙中点"（at' = mid+at = -636）→ 实心段 [[-392,-244]]

[CY-D-court4-wall-east] axis=z  沿轴区间=[88, 290]  中点=189  openings: at=188/w=12 + at=290/w=10
  ① 实现口径（at = 世界绝对坐标）      → 实心段 [[88,182],[194,285]]
  ② 若误按"相对墙中点"（at' = mid+at = 377,479）→ 实心段 [[88,371],[383,474]]

[CY-B-throne-wall-north] axis=x  沿轴区间=[-96, 96]  中点=0  openings: at=-88/w=10 + at=0/w=16 + at=88/w=10
  ① 实现口径（at = 世界绝对坐标）      → 实心段 [[-96,-93],[-83,-8],[8,83],[93,96]]
  ② 若误按"相对墙中点"（at' = mid+at = -88,0,88）→ 实心段 [[-96,-93],[-83,-8],[8,83],[93,96]]   ← 与①完全相同（中点=0 掩盖错误）
```

**读法**：正例 ① 复现了报告里的 **−636**（洞口跑到墙外 → 实心段变成整墙 `[[-392,-244]]`，**门被封死**）；
正例 ② 的误读让实心段落到 `[88,371],[383,474]`——**超出墙段区间本身**（视觉墙体与碰撞体彻底错位）；
陷阱例说明为什么这个错误能"骗过"一部分回归（中点=0 的墙两种读法等价）。

契约内可直接复现的最小命令（§3.4.8 已收录）：

```bash
cd "<ROOT>"
node -e "import('./src/shared/layout.js').then(async m=>{const {wallSolidSpans}=await import('./src/core/layout-slice.js');
const w=m.WALLS.find(x=>x.id==='CY-D-court1-wall-east');
console.log(w.id,w.axis,JSON.stringify(w.openings),JSON.stringify(wallSolidSpans(w)))})"
# → CY-D-court1-wall-east z [{"at":-318,"width":12}] [[-392,-324],[-312,-244]]
```

## 2. OBS-2：版本表口径统一（对齐运行时读出值）

### 2.1 修正前后（头部版本表）

| 行 | 修正前 | 修正后 |
| --- | --- | --- |
| 契约版本 | `CONTRACTS v1.0.6` | **`CONTRACTS v1.0.7`** |
| 风格基线 | `STYLE_BASELINE v1.0.0` | 不变 |
| `src/shared/config.js` | **`CONFIG_VERSION 1.0.2`** ← 陈旧（三处并存不一致的根因） | **`CONFIG_VERSION 1.0.3`** |
| `src/shared/layout.js` | `LAYOUT_VERSION 1.0.0` | 不变 |
| `src/kit/index.js` | （缺行） | **新增 `KIT_VERSION 1.0.1`** |
| 版本对应关系 | `CONTRACTS v1.0.6 ⇄ CONFIG 1.0.3 ⇄ LAYOUT 1.0.0 ⇄ STYLE_BASELINE v1.0.0` | **`CONTRACTS v1.0.7` ⇄ `CONFIG_VERSION 1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ `STYLE_BASELINE v1.0.0`** + 一行运行时核对命令 |

### 2.2 全文逐处核对（其余引用点）

| 位置 | 处理 |
| --- | --- |
| §3.4 前言「实测证据（`KIT_VERSION 1.0.0`）」 | 改为「测量时为 `KIT_VERSION 1.0.0`，现行为 `1.0.1`」（**不是**改写历史，而是补明现状） |
| §3.4.1 `kit.version` 行「当前 `'1.0.0'`」 | → **「当前 `'1.0.1'`」**（现状陈述） |
| §3.4.2 工厂清单 `kit.wall(p)` | 追加指针「⚠️ wall 的 `openings[].at` 口径见 §3.4.8」 |
| §11 标题「（`CONTRACTS v1.0.2`）」 | → 「（§ 引入版本 `v1.0.2`，现行契约 `CONTRACTS v1.0.7`）」——保留史料、消除"当前就是 v1.0.2"的误读 |
| §12 标题「（`CONTRACTS v1.0.6`）」 | → 「（引入 `v1.0.5`、`v1.0.6` 明确 `axis` 档位；现行契约 `CONTRACTS v1.0.7`）」 |
| §12.4「`CONFIG 1.0.2` → `CONFIG 1.0.3`（t26）」 | 不改：这是**变更过程**的记录，本就写的是新旧两个值 |
| §4.2 / §2 等处「`CONFIG 1.0.1` 起 / 白名单（`CONFIG 1.0.1`）」 | 不改：表示"自 1.0.1 起生效"，至今有效 |
| 修订记录 L21–L43（v1.0.1–v1.0.6） | **逐字未改**（见 §3） |

### 2.3 运行时读出值一致性（真实输出）

```text
CONFIG_VERSION=1.0.3  LAYOUT_VERSION=1.0.0  KIT_VERSION=1.0.1  (config.LIGHTING.lamps: 18/60/decay 1)

$ node -e "Promise.all([import('./src/shared/config.js'),import('./src/shared/layout.js'),import('./src/kit/index.js')]).then(([c,l,k])=>console.log(c.CONFIG_VERSION,l.LAYOUT_VERSION,k.KIT_VERSION))"
1.0.3 1.0.0 1.0.1
```

契约头部四项与上述读出值逐项一致；`STYLE_BASELINE v1.0.0` 由 `docs/STYLE_GUIDE.md` 头部版本表给出（该文件不在本任务 inScope，未改）。

## 3. 历史修订记录**零改写**（只追加）

- 新增 **`CONTRACTS v1.0.7`（t37）** 条目（追加在 v1.0.6 之后），内容为本次两项修正 + 取代声明。
- 该条目内含一句**时点声明**：
  「`v1.0.1`–`v1.0.6` 各条目里出现的 `CONFIG 1.0.1` / `CONFIG 1.0.2` 与 `KIT_VERSION 1.0.0` 均为**该条目发布时点**的真实值，
  现已被 `CONFIG 1.0.3`（t26）与 `KIT_VERSION 1.0.1` 取代；历史条目的数字与结论**保持原样**，此处仅追加取代说明。」
- 未改写、未删除任何既有条目的数字、结论或链接（`docs/reports/**`、`docs/handoffs/**` 也逐字未动——不在本任务 inScope）。

## 4. verify（两条，原样）

```text
$ node tests/layout.test.mjs
layout.test.mjs：通过 1478 项，失败 0 项                 → exit 0

$ grep -n "openings" docs/CONTRACTS.md | head -8
42:> - `CONTRACTS v1.0.7`（…）：**① `openings[].at` 语义对齐实现**——新增 §3.4.8 …
193:kit.cornerTower(p) kit.courtyardGate(p) kit.wall(p) kit.corridor(p)   // ⚠️ wall 的 openings[].at 口径见 §3.4.8 …
291:#### 3.4.8 墙段门洞 `openings[].at` 的两种口径（**易错点，务必区分**）
293:**`layout.WALLS[].openings[].at` = 沿墙轴的「世界绝对坐标」**（权威实现：`src/core/layout-slice.js` 的 `wallSolidSpans()`）：
301:const gaps = (wall.openings ?? []).map((o) => [o.at - o.width / 2, o.at + o.width / 2]); // ← o.at 是世界坐标
306:| **`layout.WALLS[].openings[].at`** | **沿墙轴的世界绝对坐标** …
307:| `kit.wall(p).openings[].at` | **相对墙中点的偏移** …
323:axis = 'z'  沿轴区间 = [88, 290]  中点 = 189  openings: at=188/w=12、at=290/w=10
                                                          → exit 0
```

## 5. 未验证项 / 已知限制

1. `docs/STYLE_GUIDE.md` 头部仍有 `CONTRACTS v1.0.6`（该文件不在本任务 inScope，主理人明确排除）；**建议**由后续任务同步为 `v1.0.7`，
   否则两文档头部版本会再次不一致（本次已在 CONTRACTS 侧统一，STYLE_GUIDE 侧遗留一处）。
2. `README.md` 版本表（仍为 `CONTRACTS v1.0.1` / `CONFIG 1.0.1` / 1462 项）不在本任务 inScope；t34 回执 §3 已给 t14 行号清单，
   本次新增影响：`CONTRACTS v1.0.6 → v1.0.7`、并需补 `KIT_VERSION 1.0.1`。
3. 本任务**未**修改 `src/kit/buildings.js` 的注释（`kit.wall` 的"相对墙中点"口径本身正确）；区域换算代码也已正确。
   若后续希望在 kit 侧注释加一句"勿与 layout 口径混用"，属 `src/kit/**` 变更（不在 inScope）。
4. 交叉验证脚本在 `/tmp`（非仓库产物）；契约 §3.4.8 内已给出等价的单行可复现命令。
