# 回执 · 御花园“批量复制”装饰建筑（T1.71 / t172）—— **设计完成、已回退，E13 门禁拦住落地**

> 用户需求原话：*“花园的部分太空了 可以多复制几个批量的房子”*。
> **结论（先说）**：布局侧方案与实现**已写成并实测通过 layout/walk-reachability/audit**，但**新增后 `interaction.test` 的 E13 由绿转红**（t158 时为 ✓）⇒ 按本线“**不得留半红树**”与卡内“四层护栏 + E13/E15/E16/F27 必须全绿”的要求，**已回退到 t172 前状态**（`LAYOUT 1.1.20`、`SLOTS 67`、`OBSTACLES 81`），并把全部设计与证据交回。

## 1. 空置区量化（只读实测）
- 以 11×8 m 半尺寸在 **F 区（御花园/宫墙/边界）z∈[150,440]、|x|≤300** 上以 10 m 步长扫描，**避让** `SLOTS`/`WALLS`/`ROADS`/结构性可行走面（`interior`/`passage`/`terrace`/`threshold`/`bridgeDeck`/`gardenGround`）⇒ **空闲候选 436 个**。
- 其中**对称对**（镜像 |x|:z）可用示例：`280:430/440`、`270:240/250/260/270/280/430/440`、`260:150/240`。

## 2. 数据驱动方案（已实现并实测）
- **位置（6 对镜像 = 12 座，全部远离中轴必经路径 |x| ≥ 250）**：
  `|x|=270, z=240/264/288`（值房 22×14）· `|x|=250, z=240/264/288`（库房 18×12）
- **实现方式（数据驱动，无字面量堆叠）**：`GARDEN_BULK_ANNEX` 紧凑数组 + `flatMap` 生成器（`layout.js` 内 `GARDEN_BULK_SLOTS`），在 `SLOTS` 数组字面量中以 `...GARDEN_BULK_SLOTS` 展开。
- **实测（新增后）**：`SLOTS 67 → **79**` · `OBSTACLES 81 → **93**`（障碍由 SLOTS 统一派生 ✓ 登记完整）· **`INTERIOR_BY_SLOT` 仍 43** ✓（不设 `visitable`）· `WALKABLE` **仍 171** ✓（未增可行走面）· 新槽位 `hasDoor = **false**`（实心 ⇒ `blocks:'all'`，不可穿模）· **与既有槽位重叠 0** ✓。
- 样例：`F-bulk-w-270-240` bounds `x[-281,-259] z[233,247]`，`kind = sideHall`，`grade 2`，`roofType = gableHip`（**grade 白名单约束**：grade 3 仅允许 `doubleEaveHip`；grade 2 允许 `doubleEaveHip/hip/gableHip/pyramidal` —— 这两种是我实测撞到并修正的两处）。

## 3. 门禁实测（新增态）
| 命令 | 结果 |
| --- | --- |
| `node tests/layout.test.mjs` | **全部通过 ✓**（含四层护栏：遮蔽/通路/格级/双向；`障碍 93`） |
| `node tests/walk-reachability.test.mjs` | **`t140 结果：全部通过 ✓`** |
| `node scripts/audit.mjs --enforce` | **exit 0** |
| `node tests/interaction.test.mjs` | **exit 1** —— **`✗ E13 四类糟糕阻挡审计（数字 + 位置）：单向陷阱 / 净宽 / 空气墙 / 单向高差`**；E15 ✓ / E16 ✓ / F27 ✓；病因行仍列 `VP-B-side-west-main-interior`、`VP-B-side-east-main-interior`（`通道面相对外侧地面 -1.5m｜通道可走格 27｜病因 entrance-step`） |

⇒ **E13 在 t158 时是 ✓（同一命令）**，本轮新增 12 座后转 ✗ ⇒ **要么 E13 的期望数字对“障碍总数”敏感（陈旧期望），要么新增障碍确实触发了它的一条判据（空气墙/净宽）**。**两种都必须先定性再落地**，因此本卡不强行落地。

## 4. 跨 owner 计数 ripple 清单（**旧 → 新**，逐条归属）
| # | 位置 | 旧 → 新 | 归属 / 状态 |
| --- | --- | --- | --- |
| 1 | `tests/layout.test.mjs`（版本 pin） | `1.1.20 → 1.1.21` | **本卡可直接改**（已写过并随回退撤回） |
| 2 | `tests/layout.test.mjs:507`（冻结计数串） | `"67/60/32/14/10" → "79/60/32/14/10"` | 同上 |
| 3 | `tests/layout.test.mjs`（`SLOTS`/`OBSTACLES` pin） | `67 → 79`、`81 → 93` | 同上 |
| 4 | `tests/core.test.mjs:918` 标题 +（`:852` 注释「67 栋」） | `67 栋 / 81 障碍` → `79 栋 / 93 障碍` | **交回派单**（不在本卡 inScope） |
| 5 | `docs/CONTRACTS.md:515`（§5.2.1 表 `SLOTS 67`）、§6.4（`OBSTACLES 81`） | `67 → 79`、`81 → 93` | **交回派单**（不在本卡 inScope） |
| 6 | 五套 `tests/zone-*.test.mjs` | 若引用 `SLOTS`/障碍总数 ⇒ 同步 | **交回派单**（本轮回退，未触发） |
| 7 | `tests/walk-reachability.test.mjs` | 仅引用 `WALKABLE 171`（**未变**）⇒ 无需改 | 交回确认 |
| 8 | `tests/verify-*.test.mjs` | 同上（引用栋数/机位处需 grep 复核） | 交回确认 |

## 5. 交回：zone 侧建造清单（逐槽位）
| slotId（示例，西侧镜像为 `e`） | kind | 形制建议 | 尺寸（w×d） | zone |
| --- | --- | --- | --- | --- |
| `F-bulk-w-270-240/264/288` | `sideHall` | 单檐卷棚/歇山值房，无门（`hasDoor:false` ⇒ 实心） | 22×14 | **F 御花园** |
| `F-bulk-w-250-240/264/288` | `sideHall` | 硬山库房（略矮、无脊饰） | 18×12 | **F 御花园** |
| 东侧镜像 `F-bulk-e-270-*` / `F-bulk-e-250-*` | 同上 | 同形制（**建议与西侧同批合并/实例化**） | 同上 | F |

**预算建议（合批）**：12 座分 **2 个尺寸类**；若每类合并为 1 个合并网格 ⇒ **+2 次绘制调用**（333 → 335，余量 17 ✓）；若逐座独立 ⇒ **+12**（333 → 345 ≤ 350 ✓，但仅余 5）。**未动任何既有内容，未触碰 `src/zones/**`、`src/kit/**`。**

## 6. 纪律
- 本轮**最终净变更为 0**（新增已回退）；`docs/CONTRACTS.md`、`src/zones/**`、`src/kit/**`、`tests/interaction.test.mjs` 等**未改**；阈值/台阶判据**未动**。
- **如实报告**：`node tests/interaction.test.mjs` 在**新增态**为 **exit 1（E13 红）**；**回退态**下 E13 恢复 ✓（见下节复核命令）。
- 未运行：`tests/verify-*`、五套 `zone-*`（本轮未触发，因回退）。

---

# 回执 · t9 落地（`LAYOUT 1.1.21`）—— 12 座批量装饰建筑**已落地**，四道门禁全绿

> 结论（先说）：**已落地**。`GARDEN_BULK_ANNEX`（12 座）进入 `SLOTS`；`SLOTS 67 → 79`、`OBSTACLES 81 → 93`；
> `WALKABLE` 仍 **171**、`INTERIOR_BY_SLOT` 仍 **43**、`visitable` 仍 **43**、`VIEWPOINTS` 61 / `FP_ROUTE` 50 / `TOUR_POINTS` 10 不变。
> 四道门禁（`layout` / `walk-reachability` / `audit --enforce` / `interaction`）**全部 exit 0**；t172 卡住 E13 的原因**定性为“陈旧期望数字”**（非新增几何触发的判据）。

## 1. 落地内容（唯一权威源 `layout.GARDEN_BULK_SLOTS`）

| 槽位 id | kind | 尺寸 w×d | grade / roofType | 落点（世界坐标，西/东镜像） | zone |
| --- | --- | --- | --- | --- | --- |
| `F-bulk-{w,e}-270-{240,264,280}` | `sideHall` | 22×14 | **grade 2 / `gableHip`** | x=∓270，z=240/264/280 | F |
| `F-bulk-{w,e}-250-{240,264,280}` | `sideHall` | 18×12 | **grade 1 / `gable`**（硬山、略矮） | x=∓250，z=240/264/280 | F |

- **数据驱动**：`GARDEN_BULK_ANNEX`（2 条尺寸类规格）+ `GARDEN_BULK_Z`（3 进）+ `flatMap` 生成器 ⇒ `GARDEN_BULK_SLOTS`（12 条，`deepFreeze`）；在 `SLOTS` 字面量内以 `...GARDEN_BULK_SLOTS` 展开，无 12 行字面量堆叠。
- **`grade` 合法值**：`GRADES[2].roofTypes = [doubleEaveHip, hip, gableHip, pyramidal]`、`GRADES[1].roofTypes = [gableHip, gable, pyramidal]` ⇒ 实测撞到并避开了 t172 记录的两处（grade 3 仅 `doubleEaveHip`；grade 2 不含 `gable`）。
- **实心不可入**：全部 `visitable:false` + `hasDoor:false` + `door:null` ⇒ `OBSTACLES` 统一派生 `blocks:'all'`；提示链路自动生效（`catalog.hintFor('OB-F-bulk-…')` ⇒ 「值房（西宫苑·240） 不可进入」，**非兜底文案**）。

## 2. 与 t172 方案的**唯一实测偏离**（先证后改）

- t172 第三进取 `z=288`；实测该处 **`CY-D-court4-wall-north` / `CY-E-court4-wall-north`（`z∈[289.4,290.6]`，厚 1.2m、高 4.2m）穿过建筑足迹**（值房 z∈[281,295]）⇒ 视觉穿模（“贴院墙的值房”被院墙横穿）。
- 修法（最小）：第三进 `288 → 280` ⇒ 值房 `maxZ 287` / 库房 `maxZ 286`，距院墙南面 **≥2.4m**，与 264 进留 2m/4m 净距、仍互不重叠。前两进（240/264）与 t172 逐值一致。
- **该缺陷此前无任何断言覆盖**，已冻结为常驻判据（见 §3「不穿墙 / 不压路」两条）。

## 3. 判据（只增不减；三处登记同轮）

| 位置 | 变更 | 说明 |
| --- | --- | --- |
| `tests/layout.test.mjs:73` | 版本 pin `1.1.20 → 1.1.21` | — |
| `tests/layout.test.mjs:507` | 冻结计数 `67/60/32/14/10 → 79/60/32/14/10` | — |
| `tests/layout.test.mjs:509+` | **新增 12 条 t9 判据**（11 条 `check` + 1 条 `eq`） | 数据驱动清单 12 座 / zone-id 自洽 / 实心非 visitable / grade 白名单 / 尺寸 2 类且镜像成对 / 与既有槽位重叠 0 / 不进内景·机位·走查 / 障碍派生 `blocks:'all'` / 不新增可行走面 / 包络内且 \|x\| ≥ 250 / **不穿墙 + 不压道路·连接·门外锚点** |
| `tests/interaction.test.mjs:2248+`（E13） | 整足迹阻挡者 `14 → 14 + LAYOUT.GARDEN_BULK_SLOTS.length`；**既有 14 条分组计数逐条保持**（角楼 4 / 护城河 4 / 水体 4 / 山石 2）；**新增**「交叉项 `其它` = 12」与「批量装饰逐座在册（`blocks:'all'`、无门洞、非 visitable、具名提示）」 | 口径三要素写在断言旁；来源是布局权威源，**不是**审计输出的回声 |
| `docs/CONTRACTS.md`（`v1.0.23`） | §5.2.1 表：`SLOTS 79`（新增 `OBSTACLES 93` 行、`WALKABLE` 169→171 时点修正）；§6.4 `171 面`；§6.3.1 `15/78（共 93）`；头部四项版本对齐运行时读出值 | 历史条目只追加 |

`tests/kit.test.mjs:714-717` 由 kit-engineer 预先写成 `67 + layout.GARDEN_BULK_SLOTS.length`（数据推导）⇒ 本卡落地后自然转绿（落地前该行因 `GARDEN_BULK_SLOTS` 未定义会抛错）。

## 4. 四道门禁实测（本卡新增态，最终冻结树）

| 命令 | 结果 |
| --- | --- |
| `node tests/layout.test.mjs` | **exit 0** —— 通过 **1844** 项 / 失败 **0**（含四条既有护栏与 12 条 t9 新判据） |
| `node tests/walk-reachability.test.mjs` | **exit 0** —— `t140 结果：全部通过 ✓`；`LAYOUT 1.1.21`；t153 ⓪ 细口径命中 **0** / 粗口径命中 **7**（= 已登记伪影集合，未新增） |
| `node scripts/audit.mjs --enforce` | **exit 0** —— 主场景 **341 / 350**、分区 F **80 / 80**、可见三角面 **423,945 / 1,500,000**、`y0 canonical` 自检 **93 条障碍（下钳 15 / 保持 78）✓** |
| `node tests/interaction.test.mjs` | **exit 0** —— **70 / 70**；`✓ E13 四类糟糕阻挡审计`；③ 空气墙 0 座、整足迹阻挡者 26 条**逐条提示齐备** |

## 5. 预算口径（`+2 / +12` 两口径）—— A/B 实测

方法：同一快照**整树复制**（`/tmp/t9-abproj`，只含 src/tests/scripts/public/index.html），唯一变量 = 是否展开 `...GARDEN_BULK_SLOTS`：

| 口径 | F 区批次 | F 区合批几何 | 主场景绘制调用 | 判定 |
| --- | --- | --- | --- | --- |
| 含 12 座（现状） | **80** | 1284 | **341** | ✓ ≤ 80 / ≤ 350 |
| 去掉 12 座（对照） | **80** | 1086 | **341** | ✓ |

⇒ **本次落地的实测边际 = +0 批次**（「区域×材质角色」合批把 12 座吃进既有批次），比 t172 预估的「+2 合并 / +12 逐座」更省；**§8.2 未放宽一字**（分区配额仍 B70/C60/D56/E56/F80，`config.js` 未改）。
⚠️ **风险如实登记**：F 区 **80/80 已在预算线上（0 余量）**，且**去掉本卡 12 座后仍是 80**（余量已被本卡之前的其它变更吃掉）⇒ **F 区后续任何新增内容都会 `audit --enforce` 变红**，需在区域侧做合批/减法，不得改配额。另：若**不**合批（逐座独立网格）则 ≈ 341 + 12 = **353 > 350** ⇒ 对 F 区而言「合批」是**必需而非可选**。

## 6. 跨 owner 计数 ripple（**逐条给位置，本轮未改**）

| # | 位置 | 现状 | 归属 |
| --- | --- | --- | --- |
| 1 | `tests/core.test.mjs:852`（注释「全部 67 栋」）、`:918`（用例标题「67 栋 / 32 连接 / 81 障碍 … LAYOUT 1.1.19」） | **断言已数据推导 ⇒ 仍绿**；仅标题/注释文字陈旧 | core-engineer（或派单） |
| 2 | `scripts/verify-completeness.mjs:1317` | **硬 pin `report.buildings === 67`**（浏览器分支 11.2）⇒ 浏览器实测会报 79 而**假红**；2.1/2.2/2.6/2.7/2.9/7.2/9.x 的文字里也有 `67`（判据本身是数据推导的） | verifier（t12/V1，文件头已声明归属） |
| 3 | `scripts/verify-g1-baseline.mjs:444` | 硬 pin `LAYOUT.SLOTS.length === 67 && … && LAYOUT.VIEWPOINTS.length === 20` —— **`VIEWPOINTS` 早已是 61，即本卡之前就已红**（陈旧 G1 基线脚本，不在本卡门禁内） | 派单（G1 基线/验收卡） |
| 4 | `README.md:47`（「67 栋…B12/C12/D14/E15/**F14**」） | 本卡之前 F 就是 15 ⇒ 陈旧的对外文案 | t20 发布收口 |

## 7. 与本卡无关的既有红（**A/B 证明非本卡引入**，不得记在本卡账上）

- `tests/verify-completeness.test.mjs` → **5.3**「4 点不连通：文华殿门内、陈设正堂门内、`VP-E-court1-hall-interior`、`VP-E-court2-hall-interior`」（= 队内已知「内景 41/43（E 侧 4 点）」）。**A/B（真实 registry 口径，cellSize:1）**：含 12 座与去掉 12 座 → **不可达集合逐字相同**；另在**去掉 12 座的整树副本**上直接跑 `verify-completeness --no-browser`，5.3 的失败清单**逐字相同**。
- 同套件 **5.4b**「`y ≠ door.sillY` 5 栋 = `C-gate-inner` + 4 城门」= `DOOR_SILL_EXCEPTIONS` 登记的双标高/绝对标高例外，与 F 批量装饰无任何交叉（清单里无 `F-bulk-*`）。
- `tests/verify-experience.test.mjs` → **F1** 读 `docs/shots-verify/matrix/manifest.json`（既有浏览器截图的判据快照），**不依赖布局**（本卡未重出图）⇒ 与本卡无关。

## 8. 本轮命令清单（可复跑）

```
node tests/layout.test.mjs                    # exit 0 · 1844/0
node tests/walk-reachability.test.mjs         # exit 0 · t140 全部通过
node scripts/audit.mjs --enforce              # exit 0 · 341/350 · F 80/80
node tests/interaction.test.mjs               # exit 0 · 70/70 · E13 ✓
node tests/run.mjs                            # 22/24（2 项为 §7 既有红）
node -e "import('./src/shared/layout.js').then(m=>console.log(m.LAYOUT_VERSION,m.SLOTS.length,m.WALKABLE.length,m.OBSTACLES.length,Object.keys(m.INTERIOR_BY_SLOT).length))"   # 1.1.21 79 171 93 43
```

