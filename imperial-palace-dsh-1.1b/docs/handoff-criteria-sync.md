# 交付回执 · 判据收口：`axis` 归入低空/近景类 + 口径同步（t34 / T1.5）

> 归属：t1 foundation-lead · 任务：t34 · attempt_id：`7e74150c-68f7-4224-ae87-d150cafcc26c`
> 版本对应：**`CONTRACTS v1.0.6` ⇄ `CONFIG_VERSION 1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0`**
> 性质：**repair**（只改契约/文档/截图脚本阈值，不改 `src/**`）

## 1. 改动清单（逐值，旧 → 新）

| # | 文件 / 位置 | 旧 | 新 | 依据 |
| --- | --- | --- | --- | --- |
| 1 | `CONTRACTS` 头部版本表 / 对应关系 | `v1.0.5` | **`v1.0.6`** | 档位明确（本次修订） |
| 2 | `CONTRACTS §12.2` 档位表 | 「全城/区域/环绕/**中轴**」= `oblique,iso,orbit,zone,axis`（15%） | **「俯瞰/环绕类」= `oblique,iso,orbit,zone`（≤15%）**、**「低空/近景类」= `focus,fp,interior,axis`（≤30%）** | 主理人裁定（见 §2） |
| 3 | `CONTRACTS §12.2` | 无分类依据说明 | 新增 **「`axis` 为何属低空/近景类」** 段（低空贴地序列机位；视野以暗地面/暗屋面为主；与 focus/fp/interior 同类；并说明 v1.0.5 只写分档未指定 axis 归属，属契约歧义） | 裁定要求"必须写明分类依据，避免被读成不达标就改分类" |
| 4 | `CONTRACTS §12.3` 参数表 | `--near-max-dark` 行写"近景/第一人称/内景类" | 写"**低空/近景类**（focus/fp/interior/**axis**）"；`--city-max-dark` 行写"俯瞰/环绕类" | 与档位表一致 |
| 5 | `CONTRACTS §12.4` | "`axis` 夜 29.31% > 15% …需裁定" 列为未通过项 | 改为**通过情况**（八视角夜景全部通过），未通过项收窄为**日/夕内景 49%–66% + 寝殿夜 40.77%** | 档位明确后的实际判定 |
| 6 | `scripts/shot.mjs` `NEAR_CLASS_VIEWS` | `['focus','fp','interior']` | **`['focus','fp','interior','axis']`** | 档位同步（验收要求） |
| 7 | `scripts/shot.mjs` 注释 / 判据打印行 | "近景(focus)/第一人称(fp)/内景(interior)"、"全城/区域/环绕/中轴类" | **低空/近景类(focus,fp,interior,axis)**、**俯瞰/环绕类(oblique,iso,orbit,zone)** + axis 归类说明 | 脚本与契约一致 |
| 8 | `scripts/shot.mjs` 新增 `--classes` | 无 | 打印档位表后退出（**用于复算"只有 axis 变档"**） | 可复算要求 |
| 9 | `scripts/shot.mjs` 新增导出 `VIEW_CLASS_TABLE` | 无 | `[{view,class,maxContentDark,minContentMean}×8]` | 同上 |
| 10 | `docs/STYLE_GUIDE.md` §6 | 契约 v1.0.5；判据段写"全城/区域/环绕/中轴类" | 契约 **v1.0.6**；判据段改为"**俯瞰/环绕类 ≤15%** / **低空/近景类（含 axis）≤30%**" + axis 归类依据 + 待裁定段改写 | 同步 |
| 11 | `docs/shots/README.md` | 统计口径只有整帧；判据为"全城/近景 均值≥0.10 且暗区≤15%；内景≥0.04"；参数表 5 项；亮度表停留在 1.0.1；L53 的 `lamps.intensity 12 → 14` 建议无标注 | **整帧降为二级诊断**；新增**内容掩码**定义行 + **严格背景侦测规则**（含"纯黑不得当背景"及其理由）；判据表改为两档（含 axis）；参数表补齐 `--near-max-dark`/`--clip-max`/`--diag-max-mean`/`--content-tol`/`--classes`；新增 **③ `CONFIG 1.0.3` 内容掩码实测表**（八视角 + 内景×三时辰）；L53 旧建议值与 ①② 两张历史表**加"时点记录、已被取代、数字保留不改"标注** | 验收第 2 条 |
| 12 | `docs/handoff-criteria-sync.md` | — | 本回执 | — |

**未改任何数字的时点记录**：`docs/reports/g1-baseline-review.md`、`docs/handoffs/**`、`docs/shots/night-before-1.0.1.md`、
`docs/handoff-config-1.0.2.md`、`docs/handoff-config-1.0.3.md` 全部**逐字未动**（见 §4 的 pointer 建议清单）。

## 2. `axis` 分类依据（裁定原文 + 可复算证据）

**裁定**：`axis`（中轴透视）归入**低空/近景类，内容暗区 ≤30%**。

**分类依据（写入 CONTRACTS §12.2 与 STYLE_GUIDE §6）**：`axis` 是**低空贴地序列机位**——沿中轴在低空向北推进、
视点接近地面高度，画面里大部分像素是**暗铺地与暗屋面**，而非俯瞰视角下的整城轮廓；在"视线高度、画面内容构成、
深阴影占比"三方面都与 `focus`/`fp`/`interior` 同类，与 `oblique`/`iso`/`orbit`（高位俯瞰/环绕）不同类。
**并写明：这不是"不达标就改分类"**——`CONTRACTS v1.0.5` 只写了"按类别分档"而**未指定 `axis` 属哪一档**
（原文把"中轴"与俯瞰类并列，属契约歧义）；v1.0.6 按机位性质明确档位，且**阈值本身未放宽**（15%/30%/5% 与 clip 主判据不变）。

### 2.1 复算：旧档位 vs 新档位（t26 同批实拍图，`docs/shots/t2-*-night.png`）

| 视角 | 内容掩码暗区（实测） | 旧档位 / 阈值 / 判定 | 新档位 / 阈值 / 判定 | 判定是否变化 |
| --- | --- | --- | --- | --- |
| `axis` | **29.31%** | 全城·中轴类 / 15% / **FAIL** | **低空·近景类 / 30% / PASS** | **变化（唯一）** |
| `focus` | 24.04% | 近景类 / 30% / PASS | 低空·近景类 / 30% / PASS | 不变 |
| `fp` | 25.82% | 近景类 / 30% / PASS | 低空·近景类 / 30% / PASS | 不变 |
| `interior` | 1.44% | 内景类 / 30% / PASS | 低空·近景类 / 30% / PASS | 不变 |
| （其余 4 视角） | oblique 3.57% / iso 1.34% / orbit 8.37% / zone 3.57% | 俯瞰类 / 15% / PASS | 俯瞰/环绕类 / 15% / PASS | 不变 |

**"旧档位"侧证据（t26 时点记录，逐字引用，未回改）**——t26 时 `axis` 属"全城/中轴类"，判定理由为：
```text
（docs/report-night-calibration.md §8.1 / docs/handoff-config-1.0.3.md §5 原文）
| `axis` | 中轴 | 0.1541 | **29.31%** | 0.00% | 100% | 0.1541 / 29.31% | **FAIL（>15%）** |
① `axis`（夜）内容暗区 **29.31%** > 15%（中轴类）……
```
（注：本次修复**不回改**上述时点记录的判定结论；旧档位下的 FAIL 是当时口径下的真实结论。）

**"新档位"侧复算输出（本任务实测，逐字）**：
```text
$ node scripts/shot.mjs --classes
视角档位表（CONTRACTS §12 / t34）
 oblique   类别 city 内容暗区上限 15% 内容均值下限 0.1
 iso       类别 city 内容暗区上限 15% 内容均值下限 0.1
 orbit     类别 city 内容暗区上限 15% 内容均值下限 0.1
 zone      类别 city 内容暗区上限 15% 内容均值下限 0.1
 axis      类别 near 内容暗区上限 30% 内容均值下限 0.1
 focus     类别 near 内容暗区上限 30% 内容均值下限 0.1
 fp        类别 near 内容暗区上限 30% 内容均值下限 0.1
 interior  类别 near 内容暗区上限 30% 内容均值下限 0.04

$ node scripts/shot.mjs --view=axis --preset=night --name=t1.3-axis-night.png --keep-invalid
shot: ✓ t1.3-axis-night.png  1440×900 · 355.2KB · 12491ms · 请求 42 条 · GL [disable-gpu]
        内容掩码[near] 均值 0.1541 · 暗区 29.31%（上限 30%） · 高光截断 0.00%（上限 5%） · 内容像素 100.0%
        直方图(暗→亮 8 档) 0.4 0.407 0.139 0.018 0.035 0 0 0 · 可读性判据 PASS
 可读性判据（CONTRACTS §12 / t34：暗区按**内容掩码**；俯瞰/环绕类(oblique,iso,orbit,zone) ≤0.15，
  低空/近景类(focus,fp,interior,axis) ≤0.3；内容均值 全城类 ≥0.1、内景 ≥0.04；过曝按高光截断 ≤0.05，
  整帧均值 ≤0.75 仅诊断）
```

**结论**：只有 `axis` 的归类从"全城/中轴类"变为"低空/近景类"，阈值 15% → 30%；其余七个视角的类别与阈值均**未变**，
判定全部保持 PASS；**没有任何阈值被放宽、没有视角被删除**（八视角仍全测）。

## 3. 给 t14 的 README 更新清单（具体行号 → 目标值）

> `README.md` 不在本任务 inScope（归 t14 收口）。以下行号基于**本任务执行时**的 README（t26 之后、t34 之前）。

| 行号 | 现状（旧） | 目标值 |
| --- | --- | --- |
| L7 | `（CONTRACTS v1.0.1：版本对应表…）` | `（CONTRACTS v1.0.6：版本对应表、createZone(ctx) 契约、数据格式、文件归属表；含 §11 查询参数与 §12 三时辰判据）` |
| L12 | `CONTRACTS v1.0.1 ⇄ CONFIG_VERSION 1.0.1 ⇄ LAYOUT_VERSION 1.0.0 ⇄ STYLE_BASELINE v1.0.0 ⇄ three r169` | `CONTRACTS v1.0.6 ⇄ CONFIG_VERSION 1.0.3 ⇄ LAYOUT_VERSION 1.0.0 ⇄ STYLE_BASELINE v1.0.0 ⇄ three r169` |
| L13 | `（CONFIG 1.0.1 为 GRADES[2].roofTypes 增补 pyramidal 的最小修订…）` | 改为简述版本链：`1.0.1 亭顶白名单 → 1.0.2 夜景方案A+雾距 → 1.0.3 判据收口（宫灯下限/decay/日景补光）` |
| L20 | `✅ 冻结 CONFIG_VERSION 1.0.1` + 只提 pyramidal | `✅ 冻结 CONFIG_VERSION 1.0.3`，并补一句 `1.0.2/1.0.3 = 夜景方案A、宫灯 intensity≥12/distance≥46/decay 1、goldenHour·sunset lampIntensityScale 0.45/0.6、雾距 1400/3200` |
| L26 | `✅ **1462 项**全绿` | `✅ **1478 项**全绿`（含等级-屋顶白名单 + §12 判据相关 pin） |
| L60 | 示例输出 `通过 1462 项` | `通过 1478 项`（并按当时实跑更新 dist 文件数/耗时） |
| L69 | 同上（第二处示例输出） | `通过 1478 项` |
| L80 | `断言数 1462 = 布局/config/启动壳断言 + t15 新增 67 条…` | `断言数 1478 = …（t15 +67 → t19/t26 累计；t26 增宫灯下限/decay/补光通道/medium 灯数 7 条）` |
| L127 | `屋顶等级白名单（CONFIG 1.0.1）` | 表述改为 `（CONFIG 1.0.1 起）`，如整段仍有效则仅改版本措辞 |
| 另建议 | 「冻结的共享数值」段未提 §12 判据 | 追加一行：三时辰判据见 `docs/CONTRACTS.md` §12（内容掩码口径、`node scripts/shot.mjs --classes` 可复算档位） |

> 建议 t14 一次性改完后跑 `node tests/layout.test.mjs`（1478 项）与会话内实际复跑 `node tests/run.mjs` 核对断言数。

## 4. 历史记录 pointer 建议（**本任务不改历史文件**）

以下文件的数字均为**时点记录**，按纪律**不回溯改写**；如需提示"已被取代"，由**其归属任务**追加一行 pointer（本任务不越界）。

| 文件 | 行 | 现状（时点） | 建议追加的 pointer（一行） |
| --- | --- | --- | --- |
| `docs/reports/g1-baseline-review.md` | L74 | `实时宫灯 0/0（锚点 53）` | 「> 以上为 CONFIG 1.0.1 时点数据；1.0.2（方案A）/1.0.3（宫灯 18/60/decay 1 + 日景补光）已取代，见 CONTRACTS §12 与 docs/report-night-calibration.md。」 |
| `docs/reports/g1-baseline-review.md` | L82 | `interior/goldenHour 均值 0.063、暗区 76.12%` | 同上（并注：1.0.3 下同机位为 0.1097 / 66.03%，仍 >30%，根因见 kit 待派单） |
| `docs/handoffs/zone-forecourt.md` | L155 | `lampIntensityScale = 0 → 已激活 0 盏` | 「> CONFIG 1.0.3 起 goldenHour.lampIntensityScale = 0.45，日景下已激活灯 ≠ 0。」 |
| `docs/handoffs/t2.md` | 夜景/亮度相关段 | 1.0.1 前数字 | 「> 已由 CONFIG 1.0.2/1.0.3 取代（CONTRACTS §12）。」 |
| `docs/handoff-config-1.0.2.md` | §3 表 | lamps 12/46、旧判据 | 「> 已被 CONFIG 1.0.3 + CONTRACTS v1.0.6 取代。」 |
| `tests/core.test.mjs` | L639 | `盛世金辉不激活实时宫灯（期望 0）` | 已由 t31 改为按 config 现算（`round(池 × lampIntensityScale)`）；若仍需 pointer 由 t2/t31 添加 |

## 5. verify（两条，原样）

```text
$ node tests/layout.test.mjs
layout.test.mjs：通过 1478 项，失败 0 项            → exit 0

$ node scripts/shot.mjs --view=axis --preset=night --name=t1.3-axis-night.png --keep-invalid
shot: ✓ t1.3-axis-night.png  1440×900 · 355.2KB · 12491ms · 请求 42 条 · GL [disable-gpu]
        内容掩码[near] 均值 0.1541 · 暗区 29.31%（上限 30%） · 高光截断 0.00%（上限 5%） · 内容像素 100.0%
        直方图(暗→亮 8 档) 0.4 0.407 0.139 0.018 0.035 0 0 0 · 可读性判据 PASS
                                                    → exit 0
```

补充（非契约 verify，用于复算）：`node scripts/shot.mjs --classes` → axis 类别 `near`、上限 30%（见 §2.1）。

## 6. 未验证项 / 已知限制

1. **日/夕内景仍未通过**（B golden 66.03% / B dusk 48.96% / C golden 56.05% / C dusk 53.52% / C night 40.77%）：最小修法属
   **kit 侧**（可透光窗扇 / 殿堂内补光灯位），本任务按裁定**未改 `src/**`**，请在 t3/t22 或 V2 复核后派单。
2. `axis` 的内容掩码为 **100% 内容**（该机位看不到背景/天空），故其内容数字与整帧数字相同——这一点已写入
   `docs/shots/README.md` 的 ③ 表，便于复核"是否被掩码美化"：**没有**（掩码对 axis 不起作用）。
3. 档位表复算依赖 `scripts/shot.mjs` 的导出 `VIEW_CLASS_TABLE` 与 `--classes`；若后续再调整档位，必须同步
   CONTRACTS §12、STYLE_GUIDE §6 与 README 的判据表（三处一处都不能少）。
4. 真实 GPU 帧率仍不可测（SwiftShader）；三时辰×八视角全矩阵只重算了夜景与内景 2×3，其余沿用旧图（V2 收口时重跑）。
