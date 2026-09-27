# 交付回执 · 账本收口（t107 / T1.39）：unaudited path 归属 + t33/t40 取代登记 + t65 复验

> ROOT：`imperial-palace-dsh-1.1b` · attempt `2872d03e-b450-43db-835e-8397d7497f31`
> 性质：**只做归属声明 + 只读复核 + 取代登记 + 复跑**；**未改写任何既有交付物内容**、**未回退 t78/t86/t91 的任何改动**、**未改 `src/**`、`tests/**`**。

## 0. 平台阻塞项 → 本卡处置（含无法闭合项）

| # | 平台标记 | 涉及对象 | 本卡处置 | 是否闭合 |
| --- | --- | --- | --- | --- |
| 1 | **unaudited path** | `docs/shots/**`（61 张 PNG + `manifest.json`） | 本卡 inScope **显式声明 `docs/shots/`**；逐份**只读复核**（存在性/字节/sha256，见 §1） | ✅ 闭合（声明层面） |
| 2 | **unaudited path** | `scripts/verify-completeness.mjs`（t77 交付，已如实披露） | 本卡 inScope **显式声明**该文件；**只读**给出字节 + sha256（见 §1.3），**内容未改** | ✅ 闭合（声明层面） |
| 3 | **failed without follow-up repair** | `t33`（内景白天/夕照可读性） | 取代登记：由 **t38 / t43** 承接；附当前实测（见 §2.1） | ✅ 取代已登记；**残余项**归 t106（非本卡） |
| 4 | **failed without follow-up repair** | `t40`（金砖反照率物理修正 + 内景余量转厚） | 取代登记：由 **t44 / t46 / t49** 承接；附当前实测（见 §2.2） | ✅ 取代已登记 |
| 5 | **failed without follow-up repair** | `t65`（内景机位显式寻址） | **当前树复跑**三条 verify + 能力探针（见 §3） | ✅ 闭合（能力仍成立，无回归） |

**本卡无法闭合的项**（如实登记，不夸大）：
- **t33 的残余可读性超标项**（若有）：属 **t106** 的在办范围（该卡持有逐视角读数）；本卡只复跑 `audit --enforce`（预算/契约）与声明，**未持逐视角可读性读数**，故不代其宣称闭合。
- **`docs/shots/**` 中历史遗留的 `.invalid.png`**（如 `t1.3-interior-C-dusk.invalid.png`、`t2-orbit-night.invalid.png`）：按既有纪律**保留不删**；它们不是本轮产物，本卡仅复核、未改动。

## 1. unaudited path 的只读复核（保留原值）

### 1.1 `docs/shots/` 总览
- 目录内 PNG **61 张** + `manifest.json`（**14743944 B**，sha256[:16] `4800899182598ef0`）。
- 其中 **夜景/夕照（`-night` / `-dusk`）共 49 张**；t21 系列（`t1.3-*`，含 before/after 对照）**27 张**。
- **保留原值**：本轮**未刷新 manifest、未重命名、未改写任何 PNG**（`manifest.json` 与全部 PNG 的 sha256 在复核前后一致）。
- **完整清单（文件名 | 字节 | sha256[:16]）**：
```
t1.3-after-focus-night.png | 521508 B | 27d2449da5b57f9e
t1.3-after-fp-night.png | 126384 B | c83c0c78378531a5
t1.3-after-interior-night.png | 274388 B | 22b99383469e5c00
t1.3-after-iso-night.png | 250878 B | cd65e640d8b642d9
t1.3-after-oblique-dusk.png | 149742 B | d27398df1d782d30
t1.3-after-oblique-golden.png | 138173 B | 5ce32cdece2a425a
t1.3-after-oblique-night.png | 136889 B | 08612962b67acb62
t1.3-after-orbit-night.png | 502268 B | 369cb3f8bcae7fdf
t1.3-axis-night.png | 363744 B | 25b844890fb77cdc
t1.3-before-focus-night.png | 396516 B | f778ba7cdd366b8f
t1.3-before-fp-night.png | 98866 B | 05fcdcd9b22f23a9
t1.3-before-interior-night.png | 164257 B | aa420d317d33479b
t1.3-before-iso-night.png | 205810 B | 89e0c2f9f841b76e
t1.3-before-oblique-dusk.png | 139970 B | bb8106dde34e34fe
t1.3-before-oblique-golden.png | 138776 B | ccbe5482677d4b61
t1.3-before-oblique-night.png | 103014 B | 43a3caaf8b0eb7cb
t1.3-before-orbit-night.png | 394299 B | 5b25a702b6048387
t1.3-focus-night.png | 645655 B | ec037270cf44c791
t1.3-interior-B-dusk.png | 461435 B | 0799b32c7298673e
t1.3-interior-B-golden.png | 406070 B | c532d64cdaf22594
t1.3-interior-B-night.png | 549600 B | b353badbf413e86e
t1.3-interior-C-dusk.invalid.png | 337069 B | 87b650879228dac5
t1.3-interior-C-dusk.png | 274094 B | 653c42f7bc17a5f2
t1.3-interior-C-golden.png | 244666 B | 3f57974345bf0b0c
t1.3-interior-C-night.invalid.png | 337069 B | 87b650879228dac5
t1.3-interior-C-night.png | 346811 B | d9a44c69de65b169
t1.3-oblique-night.png | 184873 B | f76cb8a2b467e3c7
t2-axis-dusk.png | 416871 B | a0b03982dde3594f
t2-axis-golden.png | 432183 B | 47394bdb8418ea96
t2-axis-night.png | 386607 B | 7a2186c098cd44dc
t2-focus-dusk.png | 755241 B | 6cc1ce72a89a88fd
t2-focus-golden.png | 740743 B | 9cae33a6ce358366
t2-focus-night.png | 690019 B | f73727baadecee0a
t2-fp-dusk.png | 146424 B | 4caeec6dfde986cc
t2-fp-golden.png | 133972 B | ae445939ef54df0e
t2-fp-night.png | 175116 B | 33e233566ac074d7
t2-interior-dusk.png | 595535 B | 0c9f3db4be4d3886
t2-interior-golden.png | 557296 B | 8c1afc5bcb24c88a
t2-interior-night.png | 612533 B | 130803a4b092b5e0
t2-interior-night.skymask.png | 6044 B | bf6e3c958cad7f6b
t2-iso-dusk.png | 384201 B | 81c51980e40fe3ba
t2-iso-golden.png | 424260 B | 6abbffd09b74ae26
t2-iso-night.png | 317407 B | 3f733bc3ff51bb1d
t2-night-probe-oblique.png | 78320 B | b064d3f1ad91f1a4
t2-night-probe2-focus.png | 120161 B | 38e55a3298a107ef
t2-night-probe2-interior.png | 22256 B | 88bce25b355693da
t2-night-probe2-oblique.png | 106593 B | 01297aa6bd625dba
t2-night-probe3-oblique.png | 116323 B | 01bba1cdef283397
t2-night-probe3-orbit.png | 411309 B | a6baaf43c1008979
t2-oblique-dusk.png | 237715 B | 9055c5a487cd08a9
t2-oblique-golden.png | 220741 B | 7f85620240a4f51d
t2-oblique-night.png | 187060 B | eeb60f4435ea53c1
t2-oblique-night.skymask.png | 7166 B | 4179a2b56e8faf10
t2-orbit-dusk.invalid.png | 7921 B | acd3f34234ddfa8b
t2-orbit-dusk.png | 727476 B | a5398ee7f47da818
t2-orbit-golden.png | 777142 B | 6d760fece6cdb0e7
t2-orbit-night.invalid.png | 13981 B | 615943e0acfb4d4c
t2-orbit-night.png | 695734 B | 1c1fc8c0313a49a6
t2-zone-dusk.png | 237702 B | fb67115489ff6c34
t2-zone-golden.png | 220744 B | 0eafdf1e0f417995
t2-zone-night.png | 187066 B | b9a4075c590ec4e9
```

### 1.2 与来源卡口径一致（抽样逐份核对）
| 文件 | 来源卡 | 口径 | 复核 |
| --- | --- | --- | --- |
| `t1.3-*-night/-dusk/-golden.png`（含 before/after 对照） | t21 | 夜景/夕照可读性对照（1440×900、同一 shot 工具） | 存在 ✓ 字节/sha 已记录 ✓ 未改动 ✓ |
| `t2-*-night/-dusk/-golden.png` | t2 / 后续统一口径卡 | 八视角 × 三时辰矩阵 | 同上 ✓ |
| `t2-*-night.skymask.png` | t5x 掩码系列 | 真天空掩码配对产物 | 同上 ✓ |
| `*.invalid.png` | 各卡失败图 | 纪律要求**保留** | 保留未删 ✓ |

### 1.3 t77 `scripts/verify-completeness.mjs`
- 存在 ✓ · **84582 B** · sha256[:16] **`b8fcc3a1df5310fe`** · **内容未改**（本卡只声明其归属；其失败/披露内容由 t77 回执承载）。

## 2. t33 / t40 取代登记（附当前实测，不只写“已被取代”）

### 2.1 t33（内景白天/夕照可读性）→ 由 **t38 / t43** 承接
- **承接内容**：t38 = `CORE_INTERIOR` 内景补光体系（室内体量入内点亮 + 三时辰系数）；t43 = 金辉/夕照系数的最终档（goldenHour 6.2/2.6、sunset 2.4/1.05、moonlitNight 1.0/0.42）。
- **当前实测（本卡复跑）**：`node scripts/audit.mjs --enforce` → **exit 0**，`结论：预算与契约检查全部通过（信息性提示 0 项，不计失败）`；分区 `B 62/70 · C 55/60 · D 49/56 · E 49/56 · F 72/80` 全绿；整城 `333/350`、可见三角面 `306,269/1,500,000`。
- **残余未闭合项**：**逐视角可读性读数（暗区/clip 的按视角判定）不属本卡 inScope/数据**；若仍有超标视角，由 **t106** 处置（其在办）。本卡**不代其宣称闭合**。

### 2.2 t40（金砖反照率物理修正 + 内景余量转厚）→ 由 **t44 / t46 / t49** 承接
- **承接内容**：t44 = 背景识别口径（真天空）；t46 = 权威背景色接入；t49 = **落屏天空带**作唯一依据 + Δ 监控。
- **当前实测（本卡复跑）**：`audit --enforce` 全绿（同上）；契约侧口径已由 `CONTRACTS v1.0.14` 固化（`door.sillY` 语义、内景地面三量相等、例外表）；`INTERIOR_BY_SLOT` 的 `groundY` 与 `WK.y` **0/43 不一致**（t97 pin）。
- **残余未闭合项**：**无**（本卡可见范围内）；若 t40 原卡还含“余量转厚”的几何厚度项，其验证在 kit/zone 套件（t46/t49 回执承载），本卡未重复。

## 3. t65 复验（当前树，三命令 verify + 能力探针）

### 3.1 三条 verify（真实输出）
```
$ node tests/core-camera.test.mjs        → exit 0  通过 20 / 20
$ node tests/core-collision.test.mjs     → exit 0  通过 24 / 24
$ node scripts/audit.mjs --enforce       → exit 0  预算与契约检查全部通过（信息性提示 0 项）
```

### 3.2 t65 核心能力探针（在 t78/t86/t91 之后仍成立）
```
内景栋数 43 | 解析到机位 43 | 机位 id 唯一 43
B 区内景机位（互不串栋）: VP-B-gate-front-interior, VP-B-interior, VP-B-hall-mid-interior,
 VP-B-hall-rear-interior, VP-B-side-east-main-interior, VP-B-side-east-rear-interior,
 VP-B-side-east-south-interior, VP-B-side-west-main-interior, VP-B-side-west-rear-interior,
 VP-B-side-west-south-interior
```
- **显式寻址**：43 栋各自解析到**自己的**机位，**机位 id 唯一 43**（无重复/无兜底共享）✓。
- **同区不串栋**：B 区 10 栋 → 10 个互不相同的机位 id（含 legacy `VP-B-interior` 经别名表正确归属 `B-hall-main`）✓。
- **FP 进出逐值恢复**：由 `core-camera 20/20` 与 `core-collision 24/24` 覆盖（含 t91 的 `?interior=` 引导用例）✓。
- **结论**：**t65 交付仍然成立，无回归**；本卡**未修改任何实现**，未回退 t78/t86/t91。

## 4. 纪律声明
- 本卡**只新增本文件**；`docs/shots/**` 与 `scripts/verify-completeness.mjs` **仅声明归属与只读复核**，**内容零改动**（sha256 已留证）。
- **未触碰** `src/**`、`tests/**`、`docs/CONTRACTS.md`、其他套件。
- **不夸大**：本表明确区分“已闭合（声明/取代/复验）”与“残余未闭合项（归 t106 / 历史 `.invalid.png` 保留）”。
