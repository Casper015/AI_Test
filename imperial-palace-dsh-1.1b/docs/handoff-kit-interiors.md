# T3.8 室内陈设套件 `kit.interiorSet` 交付回执（t61）

> 归属：`kit-engineer`（t61）· 2026-09-26 · attempt 1
> ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`（本卡指定的新工作区）
> 版本：`CONTRACTS v1.0.3` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ `KIT_VERSION 1.0.1`
> 改动（仅 inScope）：`src/kit/interiors.js`（新增）、`src/kit/index.js`（接线 + 导出）、`tests/kit.test.mjs`（§19）、本文件
> **未改动**：`src/shared/**`、`src/zones/**`、`src/core/**`、`src/ui/**`、`src/interaction/**`、其它 `imperial-palace-*` 工作区

---

## 0. 结论速览

| 验收项 | 结果 |
| --- | --- |
| API `kit.interiorSet({kind,grade,bounds,entrance,seed,...})` | ✅ 返回**未挂载**的 Group / 3 档 LOD；四档分层：`hall`（grade 3/2 细化）/ `sideHall` / `gateHall` / `cornerTower` |
| 复用既有构件与材质令牌、**零新增令牌** | ✅ 用到 **11 个材质键，全部来自既有令牌**；三条机器断言（白名单/既有库/构建前后材质与贴图数不变） |
| 合批友好（单栋 ≤12 call） | ✅ 合批后单栋新增 **殿 11 个 `(material|part)` 桶 ≤ 12**；配殿/门殿/角楼更少（5–6 个部位）；一次 `mergeZone` 后成立（见 §5）|
| LOD ≥2 档 | ✅ **3 档**：近景（全陈设）/ 中景（约 1/8 三角面）/ **远景=空组**（>300m 时 0 新增调用，保护整城预算） |
| 47+ 栋全布估算 | ✅ layout 口径 **55 栋封闭建筑**：全城远景机位 **+0 call / 0 tri**；中距离带（分区机位，不做视锥剔除的**上界**）+79 call / 1788 tri |
| 几何不穿模 | ✅ 四类逐栋实测：`worldBounds ⊆ bounds`、`minY == groundY`、`maxY ≤ ceilingY`（§4 表） |
| 回归 | ✅ `tests/kit.test.mjs` 断言 **653 → 801（+148，只增不减）**，801/801 exit 0；`node scripts/audit.mjs` exit 0 |

---

## 1. 给区域作者的用法（47+ 栋内景，后续卡直接调用）

```js
import { SLOTS } from '../shared/layout.js';
// 区域作者在自己的 createZone 里：
const slot = SLOT_BY_ID['D-court1-hall'];
root.add(kit.interiorSet({
  id: `${slot.id}:interior`,
  kind: slot.kind,                       // 'hall' | 'sideHall' | 'gateHall' | 'cornerTower'（院门请传 'gateHall'）
  grade: slot.grade,                     // 1|2|3（殿内按 grade 细化：grade3 五扇屏风 + 盘龙柱 + 四盏灯；grade2 三扇 + 两盏）
  bounds: slot.bounds,                   // 室内包围盒（世界坐标 {minX,maxX,minZ,maxZ}）；建议先用建筑台明/墙内面收紧
  groundY: slot.baseY,                   // 室内地面标高（台基顶）
  ceilingY: slot.bodyBaseY + 3.6,        // 可选；**强烈建议传**：用建筑实测的"屋身净高"（体块下沿/天花下沿）
  entrance: { x: slot.entrance.x, z: slot.entrance.z },  // 入口（决定"正位"朝向与门内值守方位）
  seed: ctx.rng.seed,                    // 可选：确定性（同一 seed → 同一几何）
}));
// ...最后照常：kit.mergeZone(root)
```

要点：

- 返回对象**已按内景中心摆好位置**（`object.position = {bounds 中心, groundY}`），几何是**以内景中心为原点的局部坐标**
  —— 与 `kit.hall()` 等构件工厂同族约定：直接 `root.add(...)` 即可；需要旋转时整组旋转，**不要**再平移（否则会离开 `bounds`）。
- 参数校验：未知 `kind` / 缺 `bounds` / 非法 `grade` / `ceilingY ≤ groundY+0.5` 一律**抛错**；室内净尺寸 < 6m 时自动降级为
  "地面 + 灯" 并在 `userData.kit.warnings` 记 `interior-tight`（不阻断）。
- `lod: 'auto'`（默认，3 档）/ `'near'` / `'mid'` / `'far'` / `'none'`（单档 Group，便于自测）。
- `metrics` 回显：`{ items, triangles:{near,mid,far}, center, worldBounds, bounds, dims, lodDistances }`；
  `items` 是**语义清单**（`floor/dais/throne/screen/column/ceiling/table/censer/lantern/couch/cabinet/bench/drum/doorBolt/stair/windowFrame/rack/runner`），
  部位词表（`part`）为合批友好刻意收敛（见 §2）。

---

## 2. 分层内容（四档）与部位词表

| kind | 内容（近景） | `items`（殿口径实测） |
| --- | --- | --- |
| **hall**（grade 3/2） | 金砖地面（`interiorBrick`）+ 御道嵌线、须弥座两级台座、正位与鎏金靠背、**五扇（grade3）/三扇（grade2）屏风**、**盘龙柱**（grade≥2，朱红柱身 + 3 道鎏金箍）、**三层藻井**（青绿 + 鎏金顶心）、案 + 香炉、**4 盏（grade3）/2 盏宫灯** | 13 项（floor, runner, dais, throne, screen, column, ceiling, table, censer, lantern…） |
| **sideHall** | 地面、坐榻（+ 鎏金压线）、桌案、书架/柜（带三层鎏金隔板）、三扇屏风、2 盏灯 | 7 项 |
| **gateHall** | 地面、值守案、长凳、**更鼓**（鎏金铜鼓）、**门闩横木**（内侧）、2 盏灯 | 7 项 |
| **cornerTower** | 地面、**盘道踏步**（10 级近景 / 4 级中景）、**瞭望窗框**（贴内墙面，不打洞以免穿墙）、**军械架**（架 + 3 支长兵 + 鎏金镦）、2 盏灯 | 6 项 |

部位词表（= 合批桶维度，刻意少而通用；语义明细看 `metrics.items`）：

| part | 含义 | 材质（config 令牌） |
| --- | --- | --- |
| `floor` / `runner` | 金砖地面 / 御道嵌线 | `interiorBrick` / `pavingLight`（院门与角楼用 `pavingStone`） |
| `dais` / `daisCap` | 须弥座 / 石活压面 | `stoneWhite` / `stoneWhiteShade` |
| `throne` | 正位坐具 / 长凳 / 坐榻主体 | `timberDark` |
| `furniture` | 桌案 / 柜架 / 屏风框 / 窗框 / 军械架 / 门闩 | `timberLacquer` |
| `screenPanel` | 屏风面 / 盘龙柱身 | `plasterRed` |
| `trim` | 鎏金饰件 / 灯架 / 香炉 / 铜鼓 / 长兵镦 | `giltMetal` |
| `ceiling` | 藻井 / 天花 | `paintingTeal` |
| `lanternGlow` | 灯罩发光体 | `lampGlow` |

> **不是自发光糊弄**：室内只有灯罩用 `lampGlow`（与既有 `kit.lantern` 同口径的发光几何），
> 其余全部是实体几何 + 既有材质；本套件**不新增任何灯光**（灯位仍由 `layout.LIGHT_ANCHORS` + t2 环境系统负责）。

---

## 3. 零新增令牌（机器断言，`tests/kit.test.mjs` §19.4）

```
 · 室内套件用到材质键 11 个：giltMetal, interiorBrick, lampGlow, paintingTeal, pavingLight,
   pavingStone, plasterRed, stoneWhite, stoneWhiteShade, timberDark, timberLacquer（全部来自既有令牌）
```

三条断言：

1. 内景用到的**每个** `materialKey` ∈ `INTERIOR_MATERIALS` 白名单；
2. 白名单的**每个**键都已存在于 `kit.materials`（即由 `config.MATERIALS` / `COLOR_ROLES` / 派生表产生，非新造）；
3. 构建全部四类内景**前后** `kit.materials.stats()` 的 `materials` 与 `textures` **逐值不变**（未新增材质/贴图）。

几何语汇也不新造：只用 `box / cylinder / sphere / beam / lathe`（与既有构件工厂同一批基元），未引入新形制。

---

## 4. 几何不穿模（逐类型实测）

`bounds` 取 layout 槽位的占地包围盒（世界坐标），`groundY = slot.baseY`，`ceilingY = baseY + 4.6/3.8/3.6/3.8`（保守天花）：

| kind | 槽位 | 三角面 near/mid/far | 近景合批桶 | `items` | 全在 bounds 内 | `minY` | `maxY ≤ ceilingY` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hall | `B-hall-main` | **1120 / 144 / 0** | 10 | 13 | ✅（x±41.1 ⊂ ±42；z ⊂ ±…） | 4.50 = 4.50 | 9.09 ≤ 9.10 |
| sideHall | `B-side-west-main` | 360 / 132 / 0 | 6 | 7 | ✅ | 1.50 = 1.50 | 3.71 ≤ 5.30 |
| gateHall | `B-gate-front` | 288 / 120 / 0 | 5 | 7 | ✅ | 0.45 = 0.45 | 2.57 ≤ 4.00 |
| cornerTower | `F-tower-corner-nw` | 504 / 156 / 0 | 5 | 6 | ✅ | 12.00 = 12.00 | 15.20 ≤ 15.80 |

断言口径（§19.2，逐类型）：`new Box3().setFromObject(object)`（**世界**包围盒，含摆位）满足
`minX/maxX/minZ/maxZ ∈ bounds`、`minY ∈ [groundY, groundY+0.07]`（落地不悬空/不下陷）、`maxY ≤ ceilingY`（不穿天花/屋面）。

---

## 5. 预算与合批（实测 + 47+ 栋口径）

| 项 | 实测 | 说明 |
| --- | --- | --- |
| 单栋内景·合批后新增绘制调用 | **殿 11**（配殿/门殿/角楼 ≤6） | 口径：`zoneRoot = 一栋 hall 建筑 + 该栋内景`（合批前 25 → 36 个可绘制对象）→ `kit.mergeZone(zoneRoot)` 后按内景 `part` 词表统计 `(material|part)` 桶；殿实测 11 桶 = 10 个部位（灯柱用 `timberDark`，故 `furniture` 占 2 桶）≤ **12**（验收目标）✅ |
| `mergeZone()` 一次合批后成立 | ✅ | 合批返回 `stats.after ≤ stats.before`，且内景几何仍在场景中（`countTriangles > 0`），非"合批即丢" |
| LOD 档数 | **3**（近/中/远） | 距离取 `BUDGET.lod.nearDistance/midDistance × QUALITY.medium.lodBias` = `[0, 90, 300]`（与构件工厂同源） |
| 三角面 | 殿 1120 / 中景 144 / **远景 0** | 单栋 ≤ 9000 上限（断言）；远景档为**空组**（刻意）→ 全城视角零成本 |
| **55 栋全布（layout 的封闭建筑口径）** | **远景机位 +0 call / +0 tri**；**中距离带 +79 call / +1788 tri** | 口径：`SLOTS.filter(!visitable && kind!=='pavilion')` = 55 栋（用户口径 47 栋；院门按 `gateHall` 口径计入）；两个机位分别取全城 oblique（0,520,−1180）与分区（0,150,−330）；**未做视锥剔除**，故 79 call 是上界 |
| 阴影预算 | 未受影响 | 内景构件 `castShadow=true/receiveShadow=true`（与构件工厂同口径），但 LOD 远景为空 + 室内被墙体遮挡；`audit` 主场景阴影列与 `mainSceneMax` 仍达标 |

> 为什么"远景档为空"：若 55 栋内景在远景也绘制，即使每栋只留 2–3 个桶，也会给全城视角增加 110+ 个绘制调用，
> 逼近 `config.BUDGET.drawCalls.mainSceneMax = 350`。室内陈设只在"看得见"的距离内（近/中档）绘制是标准做法，
> 也符合"进得去才看得见"的需求本身。

---

## 6. verify 真实输出（本卡指定 ROOT）

```text
$ cd ".../imperial-palace-dsh-1.1b" && node tests/kit.test.mjs
 · 室内套件用到材质键 11 个：giltMetal, interiorBrick, lampGlow, paintingTeal, pavingLight,
   pavingStone, plasterRed, stoneWhite, stoneWhiteShade, timberDark, timberLacquer（全部来自既有令牌）
 · 单栋（殿）内景：合批后新增 11 call；近景 1120 tri / 中景 144 / 远景 0
 · 内景全布口径：封闭建筑 55 栋（layout 口径；用户口径 47 栋）→ 远景机位新增 0 call /
   中距离带新增 79 call、1788 tri（远景档为空，故全城视角零成本）
 通过 801 / 801，失败 0
exit=0          （t61 之前 653 项 → +148 项 §19 断言，只增不减）

$ node scripts/audit.mjs
 主场景绘制调用   : 293 / 上限 350  ✓
 分区 B 58/70 ✓ · C 49/50 ✓ · D 39/40 ✓ · E 40/40 ✓ · F 61/80 ✓
 可见三角面       : 293841 / 上限 1500000  ✓
 结论：全部预算与契约检查通过
exit=0
```

（`audit` 中尚未出现内景数据：本卡只交付套件，**尚无区域调用**；区域接入后应按分区预算复核。）

---

## 7. 未验证 / 边界（不得当作已验证）

1. **尚无区域实际调用**：本卡只交付套件 + 守卫；47+ 栋的真实内景观感、与各区内景门窗/家具的配合、以及接入后的分区预算，
   需在后续区域卡里实测复核（本回执 §5 的 55 栋估算是**套件单独全布**的口径）。
2. **`ceilingY` 由调用方负责**：默认只给 `groundY + 3.4` 的保守天花（保证不穿顶），但**真实屋身净高**（尤其 grade3 重檐殿）
   需要调用方按建筑实测传入；不传不会穿模，但可能偏矮（藻井贴得太低）。
3. **`bounds` 语义**：套件把传入的 `bounds` 当**室内可用包围盒**（默认再内收 0.9m）。若调用方直接传 layout 的
   占地包围盒（含台明与墙厚），家具会偏保守（不会穿墙，但离墙略远）——建议区域作者用墙内面收紧后传入。
4. **不做自动旋转**：几何按 world 轴对齐生成（明清官式室内陈设本身即正交布置）；若建筑旋转（facing east/west），
   调用方应把 `bounds`/`entrance` 用世界坐标传入即可（本套件全部按世界坐标摆放，无需旋转）。
5. **不含灯光**：套件只给"灯罩发光体"几何，实时点光仍归 `layout.LIGHT_ANCHORS` + t2 环境系统；
   室内可读性（内景暗区判据）需按既有 t26/t33 口径另行实测（本卡不做渲染判定）。
6. **浏览器目视未做**：本卡为 Node 侧几何/预算/边界验证；真实浏览器内景截图由后续区域卡或 t13 验收补齐。
7. **`mergeZone` 后 `userData.interior` 标记不保留**：合批会重建网格（只继承 `part`/材质与阴影标志，见 `merge.js`），
   因此"哪些网格属于内景"请以 `part` 词表或 `metrics.items` 判断；如需保留标记，需改 `src/kit/merge.js`（不在本卡 inScope）。
