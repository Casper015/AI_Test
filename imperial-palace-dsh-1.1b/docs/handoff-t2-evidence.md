# handoff · T2.7 夜景/夕照证据矩阵的显式归属与复核（t35）

任务：`t35`（repair，attempt 1）· 执行者：core-engineer（attempt_id `f10539d6-5d9b-4fbc-bcaf-5f568590d1d4`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.6`（§12 三时辰可读性与过曝判据 / t34）⇄ `CONFIG_VERSION 1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 归属声明（本卡做什么、不做什么）

**本卡只承接两件事**：
1. **夜景/夕照证据矩阵的归属与复核**：在 `CONFIG 1.0.3` 下用 `scripts/shot.mjs` 重拍 night×8 + dusk×3，
   同步 `docs/shots/manifest.json`（追加不删除），逐张登记统计与口径；
2. **清结 t21 的 11 条未审计路径**：本卡 inScope **逐条列出**这 11 个具体文件名 + `manifest.json` + 本回执，
   因此 `changedPaths` 可以逐条声明它们。

**本卡不重复 t21 的代码修复**：`src/core/renderer.js`（`resolvePixelRatio()` 的 `Number.isFinite` 有限性校验）
与 `tests/core.test.mjs`（剥注释扫描 + 突变测试）**均未改动**，本卡只做**只读核验**并引用其输出（§5）。
本卡 changedPaths 内**不含**任何 `src/**` 或 `tests/**` 路径（任务卡规定 out of scope）。

**t21 失败归因（登记）**：t21 的交付（代码修复 + 11 张重拍）已完成并通过复核，其 `failed` 判定来自
**平台 attempt 窗口记账**：同一时间窗内队友并行写入的 out-of-scope 文件被计入该 attempt 的变更集合
（`docs/shots/t1.3-oblique-night.png` mtime 07:45:12 = t19；`tests/zone-west.test.mjs` 07:45:15 = t10；
`tests/interaction.test.mjs` 07:50:33 = t9），而 t21 的 inScope 写作**前缀** `docs/shots/t2-`，
平台按字面路径处理 → 本任务要声明的 11 张图当时**无法逐条声明**，形成死结。
本卡用显式路径列出全部 11 张图，正是为了证明"问题出在 inScope 写法，而不是交付内容"。

---

## 1. 重拍（CONFIG 1.0.3）

```text
node scripts/shot.mjs --view=all --preset=night --keep-invalid                    → exit 0；全部 8 张截图有效
node scripts/shot.mjs --view=oblique,iso,zone --preset=dusk --keep-invalid         → exit 0；全部 3 张截图有效
```

- 出图规格：**1440×900 / DPR 1 / quality medium**（脚本内置口径，manifest 顶层 `viewport/dpr/quality` 记录）。
- 脚本内置校验（每张都过）：PNG 尺寸、体积下限、HTTP 实际收到 `/src/main.js` 与 vendor three、
  页面就绪信号 `data-palace-ready="1"`、浏览器 stderr 无沙箱失败特征。
- **失败图纪律**：本轮 **11/11 全部是有效图**，因此**没有产生新的 `*.invalid.png`**（若失败脚本会保留并记入 manifest，
  本卡未删除任何文件）。目录内存量的 2 张 `t1.3-interior-C-{dusk,night}.invalid.png` **属于 t19 的 t1.3 矩阵**
  （本卡 out of scope），按纪律保留不动。
- 重拍时间：dusk 08:36:18–08:38:46；night 08:32:39–08:35:56（首轮）→ **08:43:46–08:47:04（verify 按任务卡原文复跑一轮，即当前在盘的时间戳）**；11 张体积 168,840–690,683 bytes。

**可读性判据（`CONTRACTS v1.0.6` §12 / t34，脚本内置 judge）**：
俯瞰/环绕类 `oblique,iso,orbit,zone` 内容暗区 ≤ 0.15；低空/近景类 `focus,fp,interior,axis` ≤ 0.30；
全城类内容均值 ≥ 0.10、内景 ≥ 0.04；高光截断 ≤ 0.05；整帧均值 ≤ 0.75 仅诊断。
逐张判定：**night 8/8 PASS**；**dusk 3/3 FAIL**（原因见 §6，属真实可读性发现，不是出图失败）。

---

## 2. 逐张统计与判定（重拍后，取自 `manifest.json`）

| 图 | 档位类 | 整帧均值 / 暗区 | 内容掩码 均值 / 暗区 / 截断 | 内容占比 | judge | 全帧绘制 / 可见三角面 / 实时灯 |
| --- | --- | --- | --- | --- | --- | --- |
| `t2-oblique-night.png` | city | 0.1021 / 4.25% | 0.1029 / 3.57% / 0.00% | 96.5% | **PASS** | 511 / 562,470 / 6(70) |
| `t2-iso-night.png` | city | 0.1162 / 1.40% | 0.1163 / 1.34% / 0.00% | 99.9% | **PASS** | 512 / 562,470 / 6(70) |
| `t2-axis-night.png` | **near（低空/近景）** | 0.1541 / 29.31% | 0.1541 / 29.31% / 0.00% | 100% | **PASS** | 483 / 558,658 / 6(70) |
| `t2-zone-night.png` | city | 0.1021 / 4.25% | 0.1029 / 3.57% / 0.00% | 96.5% | **PASS** | 511 / 562,470 / 6(70) |
| `t2-focus-night.png` | near | 0.1952 / 21.06% | 0.2126 / 23.98% / 0.02% | 86.4% | **PASS** | 509 / 562,006 / 6(70) |
| `t2-interior-night.png` | near | 0.2923 / 1.39% | 0.2923 / 1.39% / 2.35% | 100% | **PASS** | 504 / 561,838 / 6(70) |
| `t2-fp-night.png` | near | 0.1462 / 25.81% | 0.1462 / 25.81% / 0.13% | 100% | **PASS** | 505 / 570,754 / 6(70) |
| `t2-orbit-night.png` | city | 0.1607 / 8.75% | 0.1611 / 8.37% / 0.00% | 99.5% | **PASS** | 506 / 570,786 / 6(70) |
| `t2-oblique-dusk.png` | city | 0.5322 / 15.46% | 0.5322 / 15.46% / 0.00% | 100% | **FAIL**（暗区 15.46% > 15%） | 506 / 570,786 / 4(70) |
| `t2-iso-dusk.png` | city | 0.4908 / 20.67% | 0.4908 / 20.67% / 0.00% | 100% | **FAIL**（暗区 20.67% > 15%） | 507 / 570,786 / 4(70) |
| `t2-zone-dusk.png` | city | 0.5322 / 15.46% | 0.5322 / 15.46% / 0.00% | 100% | **FAIL**（暗区 15.46% > 15%） | 506 / 570,786 / 4(70) |

> `axis` 归**低空/近景类**（≤0.30）：其画面是沿中轴的贴地长焦，暗区天然高（29.31%），按 city 档（≤0.15）会误杀 ——
> 这正是 CONTRACTS §12 分档的意义，脚本 judge 行原文见 §1。

**manifest 同步（追加、不删除）**：
```text
重拍前：results 32 条、history 23 条（顶层 generatedAt 2026-09-26T15:29:02.950Z）
重拍后：results 32 条（merge-by-name：同名覆盖、其余保留）、history 27 条（追加 night/dusk/night/night 四条）
新增 history 末四条（UTC）：15:36:02Z（night×8）、15:38:53Z（dusk×3）、15:47:15Z（night×8）、15:57Z（night×8，最终 verify 复跑）
11 张目标图在 results 中全部在册：True（缺失 0）
```

---

## 3. 每个数字的口径（六项，与 t28 的审计口径对齐）

| 项 | 值 |
| --- | --- |
| 视角 / viewMode | `oblique / iso / axis / zone / focus / interior / fp / orbit`（night）与 `oblique / iso / zone`（dusk），每张单视角即时定位 |
| 质量档 | `medium`（DPR 1、阴影贴图 1536px、Bloom 开；manifest 顶层 `quality`/`dpr`） |
| 合批前后 | **合批后**（批次 = 合并后网格数；InstancedMesh 计 1；geometry.groups 逐组计数）——上表"全帧绘制"来自页面内 `__PALACE__.renderSystem.getStats()` 实测算值 |
| 是否含阴影 | **含**（整帧口径含主方向光阴影 pass；`shadowCastingLights=1`、宫灯不投影） |
| 是否含后处理 | **含**（Bloom 按时辰预设与质量档开启；色调映射 ACESFilmic、曝光按预设） |
| LOD 口径 | **按激活档**（t28 修复后：统计前对每个 `THREE.LOD` 调 `update(camera)`；页面实测口径与 `scripts/audit.mjs` 一致） |

像素统计口径（manifest `criteria` 原文）：统计基于**最终帧缓冲**（含阴影与后处理）；
暗区 = luma < 0.08；高光截断 = luma > 0.9；内容掩码 = 自动剔除背景（`auto-strict`，容差 6）。

---

## 4. `CONTRACTS v1.0.6` §12 档位表引用（判据归属 t34）

| 档位类 | 视角 | 内容暗区上限 | 内容均值下限 | 高光截断上限 |
| --- | --- | --- | --- | --- |
| 俯瞰 / 环绕类（city） | `oblique, iso, orbit, zone` | ≤ 0.15 | ≥ 0.10 | ≤ 0.05 |
| **低空 / 近景类（near）** | **`focus, fp, interior, axis`** | ≤ 0.30 | 内景 ≥ 0.04 | ≤ 0.05 |

本卡逐张按该表判定（§2），**未单方面修改判据**，也未改动 `scripts/shot.mjs` 与 `docs/CONTRACTS.md`（均 out of scope）。

---

## 5. 只读复核：t21 的两项代码修复仍在位且有效（本卡未改任何代码）

### 5.1 `src/core/renderer.js`：`?dpr` 非有限值不再产生 NaN

```text
$ node -e "const s=require('node:fs').readFileSync('src/core/renderer.js','utf8'); if(!/Number\.isFinite/.test(s)) { console.error('缺少有限性校验'); process.exit(1) } console.log('isFinite 校验存在')"
isFinite 校验存在
exit=0

$ grep -n "Number.isFinite" src/core/renderer.js
54:    if (!Number.isFinite(numeric)) reason = Number.isNaN(numeric) ? 'NaN' : 'non-finite';

$ grep -n "export function resolvePixelRatio" -A 12 src/core/renderer.js
42: export function resolvePixelRatio(wanted, { config, tier } = {}) {
43:   const q = config?.QUALITY?.tiers?.[tier] ?? { dpr: 1 };
44:   const max = config?.RENDERER?.maxPixelRatio ?? 2;
45:   const min = 0.5;
46:   let value = null;
47:   let reason = null;
48:   if (wanted === null || wanted === undefined) { reason = 'null'; }
49:   else if (typeof wanted === 'string' && wanted.trim() === '') { reason = 'empty-string'; }
50:   else {
51:     const numeric = typeof wanted === 'number' ? wanted : Number(wanted);
52:     if (!Number.isFinite(numeric)) reason = Number.isNaN(numeric) ? 'NaN' : 'non-finite';
```

### 5.2 `tests/core.test.mjs`：静态扫描已剥离注释（`interaction/*.js` 注释中的 rAF 字样不再误报）

```text
$ node tests/core.test.mjs | grep -E "剥注释|历史误报|扫描口径|通过 "
  · 历史误报语料 2 条：裸 include 会命中、剥注释后 0 命中（旧扫描把 t8 判 failed 的根因）
  · 扫描口径：朴素 include 命中 interaction 0 个文件；剥注释 + 真实调用语法命中 0 个（main.js 真实调用 2 处）
 通过 43 / 43
```

独立机制复现（本卡临时脚本，只读，不落盘；复刻 `stripCommentsAndStrings` 逐字符状态机）：

```text
interaction 文件数 10 ｜裸扫描命中（含注释） 0 ｜剥注释后命中（真实调用） 0
反例演示：含注释字样的样本 → 裸扫描 true ｜剥注释后 false
```

→ 该守卫既能"忽略注释里的字样"，又保留"真实调用必须命中"（t21 的突变测试：在非 main.js 注入真实 rAF 调用 → 断言失败）。

---

## 6. 复核发现（如实登记，非本卡可修范围）

1. **dusk（夕照）3/3 未过 CONTRACTS §12 的 city 档**：内容暗区 15.46%（oblique/zone）与 20.67%（iso）> 15%。
   数值与 t21 在 1.0.2 下的实测**完全一致**（0.532/15.46%、0.491/20.67%）⇒ 属**既有**问题，
   不是本次重拍或 t28/t31/t27 引入；根因方向是 goldenHour 预设下"阴影侧/背光面"面积偏大（内容均值 0.49–0.53 已很亮，
   高光截断 0% ⇒ 不是曝光不足，而是暗部占比）。修法归属：CONFIG 夕照预设/环境光（foundation-lead / t26 线）
   或阴影侧补光（B/F 区域作者），**不在 t35 inScope**（`src/**`、`CONFIG`、`docs/CONTRACTS.md` 均 out of scope）。
2. **夜景内景显著改善**：`t2-interior-night.png` 内容均值 **0.2923**（t21 在 1.0.2 下为 0.0373、暗区 89.0%），
   已稳过"内景 ≥0.04"；与 CONFIG 1.0.3 的宫灯改动（`lampIntensityScale` 0→0.45、`intensity` 12→18、`decay` 2→1、
   `distance` 46→60）一致 —— 说明 t26 的夜景补光方向有效，可作为 §12 判据下"内景可读"的正面证据。
3. **manifest 中另有 5 条 FAIL 属 t1.3 矩阵**（`t1.3-interior-{B,C}-{golden,dusk,night}.png`，近景暗区 40.77–66.03%），
   归 **t19/t26 线**；本卡未触碰这些文件（out of scope），仅指出避免混淆。
4. **`node tests/run.mjs` 收口过程（含归属登记）**：本卡执行窗口内一度为 **14/15、exit 1**，唯一红项是
   **`tests/kit.test.mjs`**（kit-engineer 的 in-flight 工作："内景采光：隔扇窗为真实洞口 + 窗扇透光"，
   失败项如 `每个窗位在前立面上都是真实洞口（0 ≠ 期望 6）`、`窗扇材质 emissiveIntensity = 0（1 ≠ 0）`、
   `[near] hall 无 door → 正面首碰是墙 — window`）——**归属 kit-engineer，与本卡改动无因果关系**
   （本卡只改 `docs/shots/**` 图与 manifest，changedPaths 不含 src/**、tests/**）。
   该成员落地后复跑即 **15/15、exit 0**（见 §9 末行），因此本卡终态两条 verify 全绿。
   `node scripts/audit.mjs` **exit 0**（主场景 293/350、全部预算与契约检查通过）。

---

## 7. 交付清单与任务卡验收对照

| 任务卡要求 | 结果 |
| --- | --- |
| 用 `scripts/shot.mjs` 在 CONFIG 1.0.3 重拍 night×8 + dusk×3，过内置校验、失败图保留 | ✅ 11/11 出图有效（内置校验全过）；无新增 `*.invalid.png`（本轮无失败图） |
| 同步 manifest（追加不删除）+ 回执逐张统计与口径 + 引用 §12 档位表（axis 属低空/近景） | ✅ §2 表 + §3 口径六项 + §4 §12 档位表（axis = near） |
| changedPaths 覆盖 11 张显式路径 + manifest + 回执 | ✅ 本卡 changedPaths 逐条列出 11 个 PNG 全路径 + `docs/shots/manifest.json` + `docs/handoff-t2-evidence.md` |
| 只读复核 t21 两项代码修复（不重复修改） | ✅ §5 两条命令真实输出；**未改** `src/**`、`tests/**` |
| 回执写明"只承接证据矩阵归属与复核 + 清结未审计路径" + t21 失败归因 | ✅ §0 |
| `node tests/run.mjs` / `node scripts/audit.mjs` 全绿（红项标注归属） | ✅ 终态两者均 exit 0：`run.mjs` **15/15**（窗口内曾因 kit-engineer in-flight 的 `tests/kit.test.mjs` 为 14/15，归属已登记于 §6.4，该成员落地后复跑即全绿）；`audit.mjs` exit 0 |
| 只改 inScope | ✅ 仅 11 张 PNG + `manifest.json` + 本回执 |

---

## 8. 未验证项

1. **dusk 暗区超标的修复**未做（out of scope，见 §6.1）：本卡只登记数据与归属。
2. **judge 未参与退出码**：`scripts/shot.mjs` 仅在 `--judge` 时对 FAIL 返回非零（源码 `if (JUDGE && judgeFailed.length > 0)`）；
   因此本卡的两条重拍命令 exit 0 表示"出图与内置校验通过"，**不等于** judge 全 PASS（dusk 3 张 FAIL 已如实列出）。
3. **浏览器实测性能**（fps）未测：manifest 的 `avgFps/p95FrameMs` 为 0（Node 驱动的 headless 截图不产出稳定帧时序）；
   帧率由 V2/t13 在真实浏览器按 §8.2 采样 ≥30s 负责（本卡只引用绘制调用/三角面）。
4. **`axis` 档位归属**按 t34 的 §12 表登记为"低空/近景类"；若 foundation-lead 后续调整档位定义，本表需同步引用（本卡不改判据）。
5. **manifest 并发写**：`scripts/shot.mjs` 的 manifest 是"读-改-写"，多人同时截图存在覆盖窗口（t21 已提过）；
   本卡单次串行执行（night → dusk 两次 run 间隔 1 分钟），且 merge-by-name 保证同名覆盖、其余保留 —— 已核对 11 张在册、history 23→25。


---

## 9. 本回执写入后的最终 verify 记录（按任务卡原文逐条执行）

```text
$ node scripts/shot.mjs --view=all --preset=night --keep-invalid
shot: 全部 8 张截图有效，输出目录 …/docs/shots
shot: 就绪信号检查 first（data-palace-ready="1"）
shot: 校验项：PNG 尺寸、体积下限、HTTP 收到 /src/main.js 与 vendor three、stderr 无沙箱失败特征
exit=0

$ node tests/run.mjs            ← 执行窗口内曾为 14/15（红项 tests/kit.test.mjs = kit-engineer in-flight）
 通过 14 / 15，失败 1，总耗时 115064ms    （失败项原文见 §6.4，归属已登记）

$ node tests/run.mjs            ← kit-engineer 落地后复跑（终态）
 通过 15 / 15，失败 0，总耗时 41278ms
exit=0

$ node scripts/audit.mjs        （证据引用，非本卡 verify 项）
 结论：全部预算与契约检查通过（主场景 293/350、可见三角面 288,609/1,500,000）
exit=0
```

**归属结论**：t35 的两条 verify **终态全绿** —— ① `shot.mjs --view=all --preset=night --keep-invalid` exit 0（8/8 有效、无 *.invalid.png）；
② `node tests/run.mjs` exit 0（15/15）。执行窗口内 run.mjs 曾因 kit-engineer 的 in-flight `tests/kit.test.mjs` 为 14/15，
归属已按任务卡要求登记（失败项原文见 §6.4），该成员落地后复跑即全绿；本卡自身改动（11 张 PNG + manifest + 本回执）
不涉及任何 `src/**`、`tests/**`。
