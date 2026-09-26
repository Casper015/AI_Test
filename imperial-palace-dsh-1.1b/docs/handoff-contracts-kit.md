# 交付回执 · CONTRACTS v1.0.4 构件库操作契约补全（t20 / T3.2）

> 归属：t1 foundation-lead（`docs/CONTRACTS.md`、`docs/STYLE_GUIDE.md` 唯一负责人）
> 任务：t20 — 按 `src/kit/**` 实际导出补全 kit 操作契约（createKit / LOD / mergeZone / worldBounds / 摆位 / 台明台阶 / 道具与材质引用）
> attempt_id：`a87e93f1-c374-4848-b829-a124d9cdf694`
> 版本对应：**`CONTRACTS v1.0.4` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`**（t17 的 §11、t19 的 §12 均完整保留）

## 1. 改动清单（仅 3 个 inScope 文件）

| 文件 | 改动 |
| --- | --- |
| `docs/CONTRACTS.md` | 版本表 → `CONTRACTS v1.0.4` + 版本对应关系行 + 修订记录新增 v1.0.4 条目；§3.1 的 `ctx.kit` 行改为指向 §3.4/§3.5；**§3.4 由「仅冻结工厂名称」扩写为完整操作契约**（3.4.1 构造与顶层字段 / 3.4.2 工厂与 LOD / 3.4.3 摆位契约 / 3.4.4 台明与台阶副作用 / 3.4.5 道具与材质角色 / 3.4.6 元数据与 worldBounds / 3.4.7 组合·合批·统计·回收）；**新增 §3.5 区域合批与资源所有权** |
| `docs/STYLE_GUIDE.md` | 版本表同步为 `CONTRACTS v1.0.4`；§2 表头补 **OBS-1** 说明：`roughness/metalness/clearcoat` 为**基础值**，渲染统一叠加 `WEATHERING.roughnessBias = 0.04`（屏幕实际 = 表值 + 0.04） |
| `docs/handoff-contracts-kit.md` | 本回执（含逐条代码对应与实测输出） |

**未触碰**：`src/**`（未编辑任何源文件）、`tests/**`、`index.html`、`docs/shots/**`、`docs/reports/**`；`src/shared/config.js`、`src/shared/layout.js` 数值与版本未动（`CONFIG_VERSION 1.0.2`、`LAYOUT_VERSION 1.0.0`）。

## 2. 依据：逐条与代码/实测对应（不臆测）

阅读来源：`src/kit/index.js`（全文 230 行）、`src/kit/buildings.js`（`applyPlacement` L489–496、`groundLevelOf` L484–487、`userData.kit` L566–575、台阶 L264–286）、
`src/kit/merge.js`（`mergeZone` L504+、返回 L648–663）、`src/kit/materials.js`（角色/材质双键索引 L360–423）、`src/kit/tokens.js`（`REQUIRED_PARAM_FIELDS` L17–30）、
`src/kit/geometry.js`（`buildStairs` L754–781），以及 t3 回执 `docs/handoff-kit.md`。

**运行时实测（`node` 直跑，`KIT_VERSION 1.0.0`，quality `medium`）**：

```text
COLOR_ROLES: 21 | MATERIALS: 9 | WEATHERING.roughnessBias: 0.04
materials.map.size: 41 | 每 id 可用: true | 每 role 可用: true
role→材质示例: courtyardWall: kit-mat-plasterRed | roofPrimary: kit-mat-glazeTile
hall type: LOD isLOD: true                     ← 默认 lod:'auto' 返回 THREE.LOD
lod:'far' → type: Group isLOD: false | detail: far
userData.kit keys: id,kind,name,detail,params,metrics,diagnostics,worldBounds,version
worldBounds(B-hall-main 同参 @(0,-300)): {"minX":-44.052,"maxX":44.052,"minY":0,"maxY":25.635,"minZ":-334.654,"maxZ":-273.854}
  → 槽位 z∈[-324,-276]（d=48），台阶向南多出 10.65m（t5 独立实测 10.31m，截至踏跺末端）
metrics keys: kind,level,roofType,doubleEave,eaveHeight,eaveHeightAbsolute,groundY,upperEaveY,roofBaseY,roofRise,
  bayRise,totalHeight,ridge,apronRise,slopes,topHalfW,topHalfD,bodyW,bodyD,plinth,bays,baySpan,doorWidth,doorHeight,
  hasOpening,opening,stairs,columnDiameter,eaveOverhang,eaveHeightFactor,roofSlope,parts,triangles,
  totalHeightAbsolute,footprint,lodDistances
props(8): tree,rockery,lantern,railing,bronze,screenWall,water,paving → 均 function
api(11): mergeZone,mergeByMaterial,instance,lod,pruneInterior,disposeObject,countDrawCalls,stats,budgetFor,isOwned,dispose → 均 function
```

关键代码事实（写入契约的每一条都能指到行）：

| 契约条目 | 代码位置 |
| --- | --- |
| `createKit({ THREE, config, quality })` + 可选 `textureSizeOverride/anisotropy/onDiagnostic/deriveSeed`；未传时回落到本地 vendored three 与 config | `src/kit/index.js` L48–74 |
| 工厂返回 `THREE.LOD`（`lod:'auto'`）/ 单档 `Group`（`lod:'near'|'mid'|'far'|0|1|2`，`'none'`≡near） | `src/kit/buildings.js` L515–560 |
| 必需参数 10 项（`id,name,bays,w,d,terraceH,roofType,grade,facing,quality`） | `src/kit/tokens.js` L17–30 |
| 摆位 `position=(x??0, groundLevelOf(p), z??0)`、`rotation.y = rotationYDeg`；`groundLevelOf = (baseY ?? terraceH) − terraceH` | `src/kit/buildings.js` L484–496 |
| `terraceH > 0.2` 自动生成台明 + 正向台阶（`-Z`），`grade≥3 且非亭` 加丹陛；台阶总长 = 抬升/0.15×0.34（B-hall-main 4.5m → ≈10.2m） | `src/kit/buildings.js` L134、L254–286；`src/kit/geometry.js` L754–781 |
| 台明宽 `min(MODULES.plinthWidth, min(localW,localD)×0.12)` | `src/kit/buildings.js` L41–47 |
| `mergeZone(T, root, {name, prune, epsilon})` → `{ root, batch, stats:{before,after,reduction,levels,buckets,mergedMeshes,instanced} }`；把 `batch` 挂到 root、移除原 LOD/网格并释放被移除的 kitOwned 几何 | `src/kit/merge.js` L504、L648–663 |
| `userData.kit = {id,kind,name,detail,params,metrics,diagnostics,worldBounds,version}` | `src/kit/buildings.js` L566–575 |
| 材质双键索引：9 个 `MATERIALS` id + 21 个 `COLOR_ROLES` 角色（同一对象）+ 14 派生；`get/has/color/tileMeters/textureSize/stats/isOwned/dispose` | `src/kit/materials.js` L360–423 |
| `disposeObject` 只释放 `kitOwned` 几何 + kit 自有材质/贴图；`dispose()` 为整场退出路径（t2 调用） | `src/kit/index.js` L93–115、L204–211 |

## 3. 逐条验收对照

| 验收条目 | 结果 | 落点 |
| --- | --- | --- |
| §3.4 补全操作契约（构造签名 / LOD 与单档 / mergeZone 义务与时机 / instance·mergeByMaterial·lod·pruneInterior·disposeObject·countDrawCalls·stats 用途 / materials 共享且不得销毁） | 通过 | §3.4.1、§3.4.2、§3.4.7、§3.5 第 1–2 条 |
| **D-1 摆位契约**：`x/z/baseY/rotationYDeg/facing` 语义与默认值 + 整槽展开推荐用法与原因 | 通过 | §3.4.3（含 `baseY = 台基顶`、默认 `x/z=0`、`facing` 仅校验、`kit` 只认 `rotationYDeg`；并说明 `layout.SLOTS` 字段与 kit 逐字段对齐） |
| **D-4 台明与台阶副作用**：`terraceH>0.2` 自动台明+台阶、超出 footprint、与 `layout.TERRACES` 重叠及处理 | 通过 | §3.4.4（含 10.65m/10.31m 实测、两种正确做法、当前无关闭开关与替代手段） |
| 道具工厂 + 材质角色引用（21 角色 / 9 id） | 通过 | §3.4.5（8 个摆件工厂；`materials[role]`/`[id]`/`get/has/color/tileMeters`；41 键 / 23 对象） |
| 取景/面板/验收用 `worldBounds`、引用 §4.1；`roofType` 白名单严格抛错 | 通过 | §3.4.6（"与 §4.1 的关系"整段 + 引用 §11.4）、§3.4.2（`CONFIG 1.0.1` 起严格抛错、无开关） |
| **OBS-1**：STYLE_GUIDE roughness 列补注为基础值（+0.04） | 通过 | `docs/STYLE_GUIDE.md` §2 表头引用块（实测 `WEATHERING.roughnessBias = 0.04`） |
| 内容以 `src/kit/index.js` 实际导出与 `docs/handoff-kit.md` 为准；CONTRACTS 版本递增 + 修订记录 | 通过 | §2 依据表（行号级）+ 头部 v1.0.4 修订记录 |
| 只改 3 个 inScope 文件；不回退 t17 §11 / t19 §12 | 通过 | `grep '^## 1[12]\.' docs/CONTRACTS.md` = 2；`CONTRACTS v1.0.4` ⇄ `CONFIG 1.0.2`（未动） |

## 4. 两条 verify 命令（原样）

```text
$ grep -n "mergeZone\|worldBounds\|createKit" docs/CONTRACTS.md
（18 处命中，exit 0：修订记录 L28–35；§3.4 权威来源 L159、`createKit` 用法 L166–167；
 台明/台阶与 worldBounds L228/L236；§3.4.6 元数据 L254/L259；§3.5 mergeZone L31/…）

$ node tests/run.mjs
 PASS  tests/core-walls.test.mjs  177ms
 PASS  tests/core.test.mjs  399ms
 FAIL  tests/interaction.test.mjs  647ms        ← 见 §5（t9 进行中）
 PASS  tests/kit.test.mjs  1393ms
 PASS  tests/layout.test.mjs  88ms
 PASS  tests/zone-east.test.mjs  425ms
 PASS  tests/zone-forecourt.test.mjs  1432ms
 PASS  tests/zone-garden.test.mjs  586ms
 PASS  tests/zone-inner.test.mjs  611ms
 PASS  tests/zones.test.mjs  2841ms
 通过 9 / 10，失败 1，总耗时 8600ms               → exit 1
```

## 5. 说明：run.mjs 唯一失败项与本任务无关

- 失败文件：`tests/interaction.test.mjs`（**t9 ui-engineer** 的文件，mtime 07:26:33，`src/interaction/` mtime 07:28:04 —— 正在并行写入）。
  失败断言全部是 G 自己的功能项（A5 键盘请求事件、B1 八视角切换、B3 第一人称与导览互斥、B5 键盘唯一所有者、C3 视线高覆盖、D1 导览、
  F9 撞墙提示文案、F10/F11 窄屏与 H/M 本地命令），与本任务的文档改动**无因果关系**（本任务 only `docs/**`）。
- 其余 9 个测试全部 PASS（含 `core-walls`、`kit 496/496`、`layout`、`zone-*`、`zones`）。
- 本任务**未**修改 `tests/**` 或 `src/**`；按 inScope 不得代修，故如实上报。建议：t9 落地后复跑 `node tests/run.mjs` 即可复位。

## 6. 未验证项 / 已知限制

1. 本契约描述的是**接口语义**，不含"区域是否真的调用了 mergeZone"的运行时强制——V2(t12/t13) 应在整城审计时核对各区的
   `mergeZone` `stats.before/after`（回执里应给出这两个数），以及分区绘制调用是否落在 §8.2 预算内（`node scripts/audit.mjs`）。
2. 台明/台阶"无关闭开关"是**当前实现事实**；若 V2 认为必须提供开关，属 kit 变更（t3），需另开任务并递增 `KIT_VERSION`。
3. `docs/handoff-kit.md` 中 t3 记录的其它已知差异（压缩纹理未实现、moonlitNight 观感等）不在本任务范围，仍未验证/未变。

---

## 7. attempt 2 复核（2026-09-26 07:41，t20 重派）

attempt 1 曾因契约 verify `node tests/run.mjs` 非全绿被判 failed，当时唯一失败者是 **t9 进行中的 `tests/interaction.test.mjs`**（与本次 docs-only 改动无因果）。
t9 落地后重派本任务，**只做复核、未改任何交付内容**（CONTRACTS v1.0.4 / STYLE_GUIDE OBS-1 / 本回执均保持 attempt 1 的版本与哈希语义）。

复核结果（原样）：

```text
$ node tests/run.mjs
 PASS  tests/core-walls.test.mjs  645ms
 PASS  tests/core.test.mjs  1406ms
 PASS  tests/interaction.test.mjs  3788ms     ← attempt 1 的失败项已由 t9 修复
 PASS  tests/kit.test.mjs  4682ms
 PASS  tests/layout.test.mjs  258ms
 PASS  tests/zone-east.test.mjs  1377ms
 PASS  tests/zone-forecourt.test.mjs  5214ms
 PASS  tests/zone-garden.test.mjs  1757ms
 PASS  tests/zone-inner.test.mjs  1420ms
 PASS  tests/zones.test.mjs  7116ms
 通过 10 / 10，失败 0，总耗时 27664ms      → exit 0

$ grep -n "mergeZone\|worldBounds\|createKit" docs/CONTRACTS.md
（18 处命中，exit 0）
```

交付物完整性复核：`grep -c "CONTRACTS v1.0.4"` → CONTRACTS 3 处 / STYLE_GUIDE 1 处；`grep -c '^### 3\.4 \|^### 3\.5 '` → 2；`grep -c '^## 1[12]\.'` → 2（t17 §11、t19 §12 仍完整）。
本节为**追加**记录，不改变 §4/§5 中 attempt 1 当时的真实观察（9/10 · exit 1）。
