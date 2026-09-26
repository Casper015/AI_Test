# T3.9 kit 正面门洞几何能力（hall / sideHall）· 回执（t69）

> 归属：`kit-engineer`（t69）· 2026-09-26 · attempt 1
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
> 版本（本卡完成时）：`CONTRACTS v1.0.3` ⇄ `CONFIG_VERSION 1.0.2` ⇄ **`LAYOUT_VERSION 1.1.3`** ⇄ `STYLE_BASELINE v1.0.0` ⇄ `KIT_VERSION 1.0.1`
> 改动（仅 inScope）：`tests/kit.test.mjs`（§14 对照适配 + 新增 §20）、`docs/handoff-kit-doors.md`、`docs/shots-kit-doors/`
> **`src/kit/buildings.js`、`src/kit/geometry.js` 本次未改**（能力已具备，逐类实证即可，见 §1）
> **未改动**：`src/shared/**`、`src/zones/**`、`src/core/**`、`src/ui/**`、`src/interaction/**`、其它 `imperial-palace-*` 工作区

---

## 0. 结论速览

| 验收项 | 结果 |
| --- | --- |
| 正面门洞几何能力覆盖 hall / sideHall | ✅ **已具备**（t22 门洞解耦 + t33 窗洞共用同一"切点网格 + 洞"实现，kind-agnostic）；本卡**未改几何代码**，交付"逐类实证 + 全量核对 + 能力边界 + 回归守卫" |
| **逐类几何证据** | ✅ `hall`（B-hall-main / C-hall-bed-main）与 **`sideHall`（B-side-west-main facing east）** 实测：**洞口净宽 = 声明值 ±0.05m**、洞口中心带**无实心几何**、墙被切分（墙三角面 288–408 ≫ 单块 24）、净高 5.05–8.05m ≥ 通行净高、世界法线↔`facing` dot = **1.000** |
| 与布局口径一致 | ✅ **t70 已在本卡执行期间落地（LAYOUT 1.1.0 → 1.1.3）**：布局现在给 **53 个槽位**派生 `door`（含**全部 14 hall + 23 sideHall** + 6 gateHall + 10 courtyardGate）。全量逐槽核对：**几何真有洞且净宽 = min(layout.door.width, bodyW−2)**、门开在 `facing` 侧、`door.axis` 与 `facing` **冲突 0**、clamp 冲突 **0** |
| 真实渲染截图 | ✅ `docs/shots-kit-doors/`：**4 张有效**（hall ×2、**sideHall ×1（t70 落地后取得）**、门殿 ×1）+ 2 张失败留证（城门/院门 focus 空白，§5-F1） |
| 回归 | ✅ `tests/kit.test.mjs` 断言 **801 → 843（+42，只增不减）**，**843/843 exit 0**；`node scripts/audit.mjs` **exit 0** |
| 能力边界 | hall / sideHall / gateHall / courtyardGate **支持**；pavilion（四面开敞无墙）、cornerTower（骑墙）**不适用**（§4） |

---

## 1. 逐类几何实测（Node 口径）

**探针口径**：取 `part === 'wall'` 的合并几何，只看**墙最前 z 带**（`boundingBox.min.z + 1.0`），
在 **门带高度 = 台基顶 + 0.5m**（低于窗台，隔离 t33 的窗洞）沿本地 x 以 0.05m 步长扫描，
扫描范围收进墙端 `±(bodyW/2 − 0.6)`（避免把墙外空气计成洞口），统计"未被墙覆盖"的连续区间 = 洞口净宽。

| 样本 | 声明门宽 | `metrics.doorWidth` | **实测洞口净宽** | 门高 | 洞口净高 | 法线↔facing | 墙三角面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hall` B-hall-main（布局 door 26） | 26 | 26 | **26.00** | 3.22 | 5.05 | 1.000 ✓ | 408 |
| `hall` C-hall-bed-main（布局 door 26） | 26 | 26 | **26.00** | 3.22 | 5.05 | 1.000 ✓ | 408 |
| **`sideHall`** B-side-west-main（facing **east**，布局 door 26） | 26 | 26 | **26.00** | 3.22 | 8.00 | 1.000 ✓ | 384 |
| **`sideHall`** B-side-west-main（显式 door 4） | 4 | 4 | **4.00** | 3.22 | 8.00 | 1.000 ✓ | 384 |
| **`sideHall`** D-court1-hall 参数（`doorOpening:7`） | 7 | 7 | **7.00** | 3.09 | 8.05 | 1.000 ✓ | 288 |
| `hall` B-hall-mid（`doorOpening:true` 默认宽） | default | 5.44 | **5.45** | 3.09 | 7.95 | 1.000 ✓ | 384 |
| 合成边界：sideHall 声明 60m | 60 | **54.16**（= bodyW−2） | 54.15 | 3.22 | 8.00 | 1.000 ✓ | 384 |
| **对照**：合成无门殿堂（不传 door） | 0 | 0 | **0**（门带实心） | 0 | — | 1.000 ✓ | 216 |

要点：**hall 与 sideHall 都真正开门**、净宽与声明一致、**朝向随 `facing` 旋转**（facing east 的配殿实测 dot = 1.000）、
无 door 时门带实心（不假开门）；声明超宽时按 `bodyW − 2` 收窄（合成用例演示；布局实际数据中**未发生**，见 §2）。

---

## 2. 与布局口径一致（t70 落地后**全量**核对）

`tests/kit.test.mjs` §20 的机器断言（全部通过）：

1. **覆盖**：布局带 `door` 的槽位共 **53** 个 —— `{gateHall: 6, hall: 14, sideHall: 23, courtyardGate: 10}`，
   即 **t70 新纳入的 hall 与 sideHall 已全覆盖**（本卡执行期间 t70 落地，LAYOUT 1.1.0 → 1.1.3，`visitable` 4 → 43）；
2. **几何真有洞**：53/53 槽位在门带扫描到真实洞口且 `实测净宽 == metrics.doorWidth`（±0.06）；
3. **净宽口径**：`metrics.doorWidth === min(layout.door.width, bodyW − 2)`（53/53，差 < 1e-6）；
   **clamp 冲突 0 例**（布局派生门宽 26m，各槽位正立面 `bodyW − 2 ≥ 26`）；
4. **朝向**：53/53 门洞开在 `layout.facing` 侧（世界法线↔朝向 dot = 1.000）；
5. **轴自洽**：`door.axis`（z ↔ 南北、x ↔ 东西）与 `facing` **冲突 0**（53 槽位 + 22 条建筑型障碍门全查）；
6. **对照**：合成无门殿堂门带净宽 = 0。

> 结论：**kit 与布局口径完全一致**，无需"以布局为权威"纠正任何 kit 行为。唯一需数据方留意的是 **§5-F2**（派生门宽一律 26m 的设计问题）。

---

## 3. 真实渲染证据（`docs/shots-kit-doors/`，1440×900 / DPR1 / medium / goldenHour）

| 文件 | 机位（`?view=focus&focus=<槽位>`） | 内容 | 出图校验 |
| --- | --- | --- | --- |
| `hall-door-B-hall-main-golden.png` | `B-hall-main`（hall，门 26m） | 金銮殿正面，**26m 门洞**（门扇按布局 86% 开启） | ✓ 853KB，内容暗区 6.70%（≤30% ✓） |
| `hall-door-C-hall-bed-main-golden.png` | `C-hall-bed-main`（hall，门 26m） | 寝殿正面，26m 门洞 | ✓ 808KB，暗区 9.04% ✓ |
| **`sidehall-door-B-side-west-main-golden.png`** | `B-side-west-main`（**sideHall, facing east**，门 26m） | 配殿（东向立面）**门洞**—— t70 落地后才可能取得 | ✓ 832KB |
| `gateHall-door-B-gate-front-golden.png` | `B-gate-front`（gateHall，门 26m） | 前朝门殿贯通门洞 | ✓ 667KB |
| `cityGate-door-F-gate-south-golden.invalid.png` | `F-gate-south`（城门楼） | **出图失败**（9.5KB 空白）→ 按脚本纪律保留 | ✗ 见 §5-F1 |
| `courtyardGate-door-C-gate-west-golden.invalid.png` | `C-gate-west`（院门） | **出图失败**（9.7KB 空白）→ 按脚本纪律保留 | ✗ 见 §5-F1 |

出图命令：`node scripts/shot.mjs --view=focus --focus=<槽位 id> --preset=golden --out-dir=docs/shots-kit-doors --name=<名字>`
（脚本自带校验：PNG 尺寸 = 视口、体积下限、HTTP 收到 `/src/main.js` 与 vendor three、就绪标记 `data-palace-ready`；失败图保留为 `.invalid.png`，**不作为有效证据**）。

**取景限制（如实说明）**：真实 app 只支持八视角 + `?focus=<槽位 id>`，`focus` 是随体量自适应的 3/4 机位，
没有"贴近正立面"的参数，因此门洞在画面中呈现为立面上的**暗色洞口带**；
**"净宽/净高/洞口无实心几何"的权威证据是 §1/§2 的几何断言**，截图作为真实渲染旁证。

---

## 4. 能力边界（哪些 kind/grade 支持）

| kind | 正面门洞 | 说明 |
| --- | --- | --- |
| **hall**（grade 1/2/3） | ✅ 支持 | `door:{width,…}` / `doorOpening:<数值或 true>` / `openFront:true` 均可；`grade` 只影响形制（重檐/斗栱/屏风…），**不影响门洞能力** |
| **sideHall**（grade 1/2/3） | ✅ 支持 | 同上；facing east/west 时门洞随 `rotationYDeg` 转到世界对应面（实测 dot = 1.000） |
| **gateHall** | ✅ 支持 | 门殿默认自带门洞（`MODULES.gateOpeningRatio × 面阔`），也接受显式 `door.width` |
| **courtyardGate** | ✅ 支持 | 同上（院门默认自带门洞，`openFraction 0.72`） |
| **pavilion** | ❌ 不适用 | 四面开敞（无墙、`openFront`），没有"正面墙"可开洞 |
| **cornerTower** | ❌ 不适用 | 骑墙建筑（`onWall`），入口由**城墙门洞**承担，其自身正立面不开门 |

其它沿用能力（t22/t33 既定）：净宽 = `min(声明, bodyW − 2)`（`bodyW = localW − 2×台明`）；
门洞整高、窗洞在窗带，二者互不干扰；门扇开启比例由 kind 决定（殿堂 0.18 / 门殿·院门 0.72，可 `door.openFraction` 覆盖，B 区对可进入殿堂用 0.86）；
`metrics` 回显 `doorWidth/doorHeight/hasOpening/opening{width,height,openFraction,clearWidth,playerClearWidth,source}`，
区域作者可直接与 `layout.OBSTACLES.door`、碰撞盒对账。

---

## 5. 发现与待办（交回主理人）

| id | severity | 问题 | 需要的处理 |
| --- | --- | --- | --- |
| **t69-F1** | medium | `?view=focus&focus=F-gate-south`（城门楼）与 `focus=C-gate-west`（院门）**两次复现均为空白图**（9.5KB/9.7KB，shot.mjs 判失败）；同一命令对 `B-hall-main` / `C-hall-bed-main` / `B-side-west-main` / `B-gate-front` 均正常出图。故**不是 kit 几何问题**（聚焦视图取景/门类建筑在焦点模式下的可见性） | 请派 t2（core `focusSpecFor`/相机）或数据方（t70 派生门是否让门类建筑包围盒/焦点解析异常）定位；本卡只报现象与复现命令，未改 core |
| **t69-F2** | low | **t70 派生门一律 26m 宽**（53 槽位全部 `door.width = 26`）：对 84m 面阔的金銮殿合适，但对 16–26m 面阔的配殿/院门意味着"门洞几乎占满正立面"（净宽被 `bodyW − 2` 兜住，故**当前 0 例 clamp**，但形制上值得复核） | 建议 t70/t1 复核派生规则（或按 grade/面阔分档 4/8/12/26m）；kit 侧无需改动（已按 `min(声明, bodyW−2)` 实现并回显） |
| **t69-F3** | info | `door.axis` 未被 kit 消费（kit 以 `facing/rotationYDeg` 决定开洞面）；本卡核对 53 槽位 + 22 障碍门 **axis↔facing 冲突 0** | 若将来出现轴与朝向不一致的数据，kit 会按 `facing` 开洞，需数据方修正 |
| **t69-F4** | info | `LAYOUT_VERSION` 在**本卡执行期间**由 1.1.0 变为 1.1.3（t70 落地，`visitable` 4→43、`door` 18→53）：本卡因此把 §14 的"无门殿堂"对照改为**合成样本**，并新增 §20 全量核对 | 无需动作；提醒后续卡：布局已扩张，**"可进入"建筑现在全部有派生门数据** |

---

## 6. verify 真实输出（本卡指定 ROOT）

```text
$ cd ".../imperial-palace-dsh-1.1b" && node tests/kit.test.mjs
 · 布局派生门全量核对：53 槽（{"gateHall":6,"hall":14,"sideHall":23,"courtyardGate":10}）
   几何真洞/朝向全部通过；clamp 冲突 0 例
 · 门洞能力边界：hall/sideHall/gateHall/courtyardGate 支持（door 数据驱动，净宽=min(声明, bodyW−2)）；
   pavilion 四面开敞无墙、cornerTower 骑墙无正立面门，均不适用
 · 布局口径核对：53 个带 door 槽位净宽/朝向/轴全部一致（axis/facing 冲突 0）
 通过 843 / 843，失败 0
exit=0        （本卡前 801 项 → +42 项，只增不减；几何代码未改 → 三角面/绘制调用与 t61 同量级）

$ node scripts/audit.mjs
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 B 58/70 ✓ · C 49/50 ✓ · D 39/40 ✓ · E 40/40 ✓ · F 61/80 ✓
 阴影 pass        : 242 个投影对象；实时投影光源 1 盏
 结论：全部预算与契约检查通过
exit=0
```

（截图与 `.invalid.png` 仅存 `docs/shots-kit-doors/`，**不进入发布包**：`scripts/build.mjs` 只复制 `index.html`/`src`/`public`。）

---

## 7. 未验证 / 边界

1. **未做第一人称实走**：本卡证明"几何上真有洞且净宽/净高满足通行"，"玩家真的穿过去"需 t13/交互侧实走（kit 已提供 `metrics.opening.clearWidth`）。
2. **截图取景为 3/4 自适应机位**（无"贴立面"参数）：门洞呈现为立面暗色洞口带；权威证据是 §1/§2 的几何断言。
3. **城门/院门两张 focus 图空白（t69-F1）**：已保留为 `.invalid.png`，未作为有效证据；其几何能力由 §2 全量核对覆盖（F-gate-south / C-gate-west 均在其中且通过）。
4. **门扇遮挡**：殿堂门扇默认 18% 开启（B 区对可进入的 2 栋用 86%），故近景中门洞中央可见门扇；净宽口径指**洞口**而非门扇间隙（门扇间隙见 `opening.clearWidth`）。
5. **未验证 t70 派生门的碰撞/障碍一致性**：`layout.OBSTACLES.blocks='exceptDoor'` 与 `door` 是否逐栋对齐属数据侧（本卡只核对了 22 条建筑型障碍门的 axis/facing 自洽）。
