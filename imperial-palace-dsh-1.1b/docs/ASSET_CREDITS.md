# ASSET_CREDITS.md — 资源来源与许可登记

> 归属：`t3 kit-engineer`（计划 §4.2、`docs/CONTRACTS.md` §8、`config.ASSETS.requiredFields`）
> 版本：`ASSET_CREDITS v1.0.1`（版本戳同步 t22，2026-09-26）
> 当前有效组合：`CONTRACTS v1.0.3` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`；
> 本文件与 `src/kit/` 的对应关系：资源登记字段来自 `config.ASSETS.requiredFields`（CONFIG 1.0.2 未改动该段）；
> `KIT_VERSION` 见 `src/kit/index.js`（**当前 `1.0.1`**；由 t30 递增，行为变更清单见 `docs/handoff-t3-version.md` §1：合批阴影标志策略 / `buildStairs` 台阶方向 / 门洞与形制解耦 / `bridge` 可选拱券参数）。

---

## 1. 结论（先读这一条）

**本项目无第三方素材（no third-party asset）。** 全部建筑构件、摆件、贴图与材质都由 `src/kit/` 在运行时
程序化生成（参数化几何 + `DataTexture` 程序化贴图），因此：

- `public/assets/` 内**没有任何运行时资源文件**（目录为空，仅保留说明文件），不存在需要署名的作者或许可；
- 运行期**没有任何必需网络资源**：`ctx.assets.load()` 不发 HTTP 请求，`kit.assets.stats().networkRequests === 0`
  （`tests/kit.test.mjs` §12 机器断言，并由 `src/kit/*` 源码扫描"禁止出现 `http(s)://`"双保险）；
- 不存在热链、不存在重复下载：同一份几何/材质只由 `src/kit/materials.js` 的共享缓存与
  `src/kit/merge.js` 的合批结果各持有一份（`config.ASSETS.dedupe === true`）；
- 未使用外部字体、HDR 环境图、图片贴图或解码器；唯一外部依赖是本地 vendored `public/vendor/three`（three r169，
  项目自带，见 `index.html` 的 import map），不涉及内容素材许可。

---

## 2. 第三方素材登记表（当前为空）

登记字段 = `config.ASSETS.requiredFields`（9 个，逐字对齐）：

| id | sourceUrl | author | license | localPath | normalization | bounds | lod | usedBy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _（无）_ | _（无）_ | _（无）_ | _（无）_ | _（无）_ | _（无）_ | _（无）_ | _（无）_ | _（无）_ |

> 维护规则（计划 §4.2）：若将来引入任何第三方模型/贴图/HDR/字体，必须先落到本表，且
> **许可必须允许本项目使用与交付**（CC0 / CC-BY / OFL 等），需要署名的在此写明作者与许可原文；
> 单位/朝向/pivot/缩放/法线/色彩空间按 `config.ASSETS.normalizationDefaults` 统一加工，
> 转换在 `work/` 完成、运行时只保留 GLB/glTF、同一份资源只保留一份。
> 使用方式与 `ctx.assets` 登记结构完全一致（见 §3）。

---

## 3. 程序化资源登记表（运行时同一结构，来源标记为 `procedural://`）

`ctx.assets` 的登记结构与本表相同；`sourceUrl` 使用 `procedural://<id>` 前缀（非网络地址），
`localPath` 为 `null`（不落盘），`license` 为 `project-internal (procedural, no third-party asset)`。
下表为登记条目总览（完整条目由 `kit.assets.registry` 运行时给出，`kit.assets.validate()` 校验 9 字段完整性）：

| id | sourceUrl | author | license | localPath | normalization | bounds | lod | usedBy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `kit:hall` | `procedural://kit:hall` | kit-engineer（程序化生成） | project-internal | `null` | meter / Y-up / groundCenter / srgb | 运行时按参数生成（`metrics.worldBounds`） | 3 档（近/中/远） | B/C/D/E/F |
| `kit:gateHall` | `procedural://kit:gateHall` | 同上 | 同上 | `null` | 同上 | 同上 | 3 档 | B/C/F |
| `kit:sideHall` | `procedural://kit:sideHall` | 同上 | 同上 | `null` | 同上 | 同上 | 3 档 | B/C/D/E/F |
| `kit:pavilion` | `procedural://kit:pavilion` | 同上 | 同上 | `null` | 同上 | 同上 | 3 档 | B/C/D/E/F |
| `kit:cornerTower` | `procedural://kit:cornerTower` | 同上 | 同上 | `null` | 同上 | 同上 | 3 档 | F |
| `kit:wall` | `procedural://kit:wall` | 同上 | 同上 | `null` | 同上 | 由 from/to/height 决定 | 近/中/远（按 detail） | B/C/D/E/F |
| `kit:courtyardGate` | `procedural://kit:courtyardGate` | 同上 | 同上 | `null` | 同上 | 同上 | 3 档 | B/C/D/E/F |
| `kit:corridor` | `procedural://kit:corridor` | 同上 | 同上 | `null` | 同上 | 由 from/to/width 决定 | 近/中/远 | B/C/D/E/F |
| `kit:terrace` | `procedural://kit:terrace` | 同上 | 同上 | `null` | 同上 | 由 bounds/y0/y1 决定 | 近/中/远 | B/C |
| `kit:stairs` | `procedural://kit:stairs` | 同上 | 同上 | `null` | 同上 | 由 width/rise 决定 | 近/中/远 | B/C/D/E/F |
| `kit:bridge` | `procedural://kit:bridge` | 同上 | 同上 | `null` | 同上 | 由 width/span/deckY 决定 | 近/中/远 | F |
| `kit:tree` / `kit:rockery` / `kit:lantern` / `kit:railing` / `kit:bronze` / `kit:screenWall` / `kit:water` / `kit:paving` | `procedural://kit:<name>` | 同上 | 同上 | `null` | 同上 | 运行时按参数生成 | 近/中/远 | B/C/D/E/F |
| `kit:material:<MATERIALS id>`（9 条） | `procedural://kit:material:<id>` | 同上 | 同上 | `null` | srgb 色彩空间、材质令牌取色 | — | — | B/C/D/E/F |
| `kit:textures` | `procedural://kit:textures` | 同上 | 同上 | `null` | srgb / mipmap / repeat wrap | 1K–2K（`BUDGET.textures`） | — | B/C/D/E/F |

**贴图清单（程序化 `DataTexture`，中性灰度细节，颜色一律由材质令牌决定）**：
`glazeTile`（瓦垄）、`timberLacquer`（木纹）、`stoneWhite`（石材斑驳）、`pavingStone`（铺地分格）、
`interiorBrick`（金砖）、`plasterRed`（灰泥/旧化）；图案的物理覆盖尺度由 `kit.tileMeters()` 给出
（瓦垄取 `1 / MODULES.roofTileRowsPerMeter`，其余按 `MODULES.bayPitch` 的同一套分数），保证全城铺地尺度一致。

---

## 4. 资源加工与规范（计划 §4.2 第 2–4 条的落地）

| 步骤 | 本项目做法 | 可验证点 |
| --- | --- | --- |
| 单位/朝向 | 米；Y 向上、X 向东、Z 向北；面阔沿本地 X、正立面朝本地 −Z，按 `rotationYDeg` 摆放 | `kit.*(...).userData.kit.params.rotationYDeg`、`worldBounds` |
| 地面 pivot | `groundCenter`：本地原点在足迹中心的地面；`baseY` 语义为"台基顶（柱础标高）"，台基占 `[baseY−terraceH, baseY]` | `metrics.groundY`、`metrics.eaveHeightAbsolute` 与 `layout.SLOTS.eaveHeight` 交叉校验 |
| 缩放/法线 | 无外部模型；所有几何在生成时即为米制，法线由几何构造或 `computeVertexNormals` 生成 | `tests/kit.test.mjs` §5 几何取样 |
| 贴图色彩空间 | 颜色贴图 `SRGBColorSpace`，repeat 包裹、mipmap 生成、anisotropy 取质量档 | §2 材质段断言 |
| LOD | 近/中/远三档，距离 = `BUDGET.lod.nearDistance/midDistance × QUALITY[*].lodBias`；远景只保留台基+屋身+屋面轮廓 | §8 断言三角面单调下降、轮廓偏差 ≤12%、`update(camera)` 切档 |
| 去面与合批 | `pruneInteriorFaces`（重合面成对删除 + 被邻块遮挡面删除）、`mergeZone`（跨建筑按材质×部位合批）、`instanceFromPoints`（植被实例化） | §9/§10 断言绘制调用下降与三角面不变 |
| 去重 | 共享材质缓存（1 份/材质）+ 登记表按 id 去重 | §2/§12 断言 |

---

## 5. 未验证 / 边界

- 本章登记表为**运行时登记**；`public/assets/` 为空是本项目的有意状态（程序化路线），
  若后续任务引入真实素材（例如 t8 的水面法线贴图或 t6 的内景陈设模型），必须回到本文件 §2 新增条目，
  并同时在 `ctx.assets` 登记（9 字段一致）。
- 浏览器内的贴图显存占用、KTX2 压缩（`config.BUDGET.textures.useCompressedFormat`）**未实现、未验证**：
  当前贴图为未压缩 RGBA `DataTexture`，1K–2K，预算按 `BUDGET.textures.maxTextureMemoryMB = 320MB` 估算；
  由 t2/t13 在真实 GPU 上实测后决定是否启用压缩纹理。
