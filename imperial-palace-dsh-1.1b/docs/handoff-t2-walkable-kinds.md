# handoff · T2.20 修复 `WALKABLE_KINDS` 缺 `'passage'` 导致的全树 0 区域装载 + 跨模块 kind 守卫（t79）

任务：`t79`（repair，attempt 1）· 执行者：core-engineer（attempt_id `a34424b9-a8ed-4752-aadf-06a573e4c1f8`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`

---

## 0. 开工回执

```text
来源（全树 blocker，t13 attempt 2 的 F5 + t59 的复现）：t75/LAYOUT 1.1.4 新增 43 条 `kind:'passage'`
      门洞通道面（`WK-<slotId>-door-passage`），但消费方白名单 `src/core/context.js` 的 `WALKABLE_KINDS`
      未同步 ⇒ `assertZoneResult` 报 `…kind 非法：passage` ⇒ 浏览器逐字
      `[palace] 装配完成：区域 [] · 注册建筑 0 栋` ⇒ 全树截图空白（~7.9KB）、run.mjs 7/20。
主理人责任认定：kind 新增只派了布局卡（verify 仅 layout.test.mjs，自洽但看不到下游）。
必做：① 白名单增补；② **常驻跨模块守卫** + 突变证明；③ CONTRACTS §6.1 语义 + 版本递增；
      ④ 端到端恢复证据（区域非空 + 67 栋 + 非空白 night 截图对照）。

可写范围（已严格遵守）：src/core/context.js、tests/core-kinds.test.mjs、docs/CONTRACTS.md、
      docs/handoff-t2-walkable-kinds.md。
未触碰：src/shared/**、src/kit/**、src/zones/**、src/ui/**、src/interaction/**、src/main.js、scripts/**。
```

---

## 1. 修复（两处，都在 `src/core/context.js`）

### 1.1 `WALKABLE_KINDS` 增补 `'passage'`（一行修复，恢复全树区域装载）

```js
export const WALKABLE_KINDS = Object.freeze([... 'outerTerrain', 'passage']);
```
（并加了纪律注释：本白名单是 layout `WALKABLE[].kind` 的消费方，新增 kind 必须同步，否则就是本次事故。）

### 1.2 `ctx.config` 补齐 shared/config 的**函数成员**（**发现并修掉的第二个下游断点**）

修复 1.1 之后 `audit.mjs` 立刻暴露一个**此前被"0 区域装载"掩盖**的真实崩溃：

```text
TypeError: config.deriveSeed is not a function
    at buildInteriorSets (src/zones/forecourt.js:693)
    at createZone (src/zones/forecourt.js:971)
    at assembleZone (scripts/audit.mjs:394)
```
根因：`createZoneContext({ config = CONFIG })` 传的是 `CONFIG` **对象**（只有常量），而 zone 侧按文档调用
`config.deriveSeed(slotId,'interior')`（`shared/config.js` 的**模块级导出**）。浏览器路径恰好能拿到函数成员，
Node（audit）路径不能 ⇒ 只在 audit 崩。
修法（加法合并，向后兼容）：`ctx.config = Object.freeze(Object.assign(Object.create(null), SHARED_CONFIG, { ...config }))`
（CONFIG 自身字段优先，缺失的模块级导出补上）。修后 `audit.mjs` 从 **TypeError 崩溃** 变为 **exit 0**。

---

## 2. 常驻跨模块守卫（本卡的核心价值）

新增 `tests/core-kinds.test.mjs`（5 项，零 three/零 DOM）：

| # | 断言 |
| --- | --- |
| ① | `layout.WALKABLE[].kind` 去重集合 **⊆** `core.WALKABLE_KINDS`（缺一即失败，并打印缺失项 + 各 kind 条数） |
| ② | `'passage'` 在白名单内，且 layout 确有 43 条 `WK-*-door-passage` |
| ③ | **契约校验器真的接受**：用 `assertZoneResult` 校验含 B 区 10 条 passage 的可行走面集合 ⇒ `kind 类问题 0`、含 `passage` 的问题 0 |
| ④ | passage **不参与内景包围盒**：`interior` 面仍 43 条、`passage ≠ interior` 两个取值、`VP-B-interior` 盒仍来自 `-interior` 面 |
| ⑤ | **突变自证**：把 `'passage'` 从白名单移除后，①③ 的判定必须失败（测试内复算一次并断言"确实报错"） |

```
$ node tests/core-kinds.test.mjs
 ✓ ①…✓ ⑤     通过 5 / 5   exit=0
  · layout kind {bridgeDeck:…, gardenGround:…, ground:…, interior:43, outerTerrain:…, passage:43, terrace:…} ⊆ core {…, passage}
  · B 区 27 条可行走面（含 10 条 passage）：kind 类问题 0；其它问题 26 条（合成样本未实现全部槽位，属预期）
  · interior 43 条 / passage 43 条；VP-B-interior 盒=WK-B-hall-main-interior
  · 突变复算：去掉 'passage' ⇒ 契约校验报 1 类 kind 问题
```

**源码级突变证明（实跑，非仅测试内复算）**：临时把 `'passage'` 从 `context.js` 白名单移除 →
`node tests/core-kinds.test.mjs` → **通过 1 / 5**（① ② ③ ④ 全红）→ 还原后 **5 / 5** ✓
⇒ 今后任何一次"布局新增 kind 未同步消费方"都会在本地测试立刻炸，而不是等到全树空白。

---

## 3. 端到端恢复证据（对照 F5）

| 项 | F5（修复前） | t79（修复后） |
| --- | --- | --- |
| 浏览器装配行 | `[palace] 装配完成：区域 [] · 注册建筑 0 栋` | **`[palace] 装配完成：区域 [GREYBOX, B, C, D, E, F] · 注册建筑 67 栋 · 视角 61 个`** ✓ |
| `?stats=1` DOM 报告 | 区域 0 / 报错 | `zones=["GREYBOX","B","C","D","E","F"]`、`zoneErrors=null`、主场景可绘制对象 304 |
| night 截图 | ~7.9KB 空白 | **`/tmp/t79/t2-oblique-night.png` = 187,229 B**，判据 **PASS**（内容均值 0.1541 / 暗区 10.32% / 截断 0.00% / 整帧均值 0.1066） |
| `node tests/run.mjs` | 7 / 20 | **9 / 21**（+2：`kit`/`shot-mask` 之外，`zones.test.mjs` 与 `zone-west` 一类恢复；剩余红项见 §4） |
| `node scripts/audit.mjs` | 崩溃（0 区域路径下未跑到） | **exit 0**；主场景 **322/350 批次**、**304,649 三角面**（数值上升 = 真实区域几何真正参与渲染，不再是灰盒独占） |

---

## 4. 仍红项与归属（如实列出，均非本卡）

| 红项 | 归属 |
| --- | --- |
| `audit` 内部 2 项未通过：**分区 E 绘制调用 49 / 预算 40**（另 1 项同类） | **zone-inner（t63 内景布陈设，在飞）** —— 与 t68 登记的"(A) 期望值硬编码/预算随扩容变化"同族；本卡未改 zones |
| `run.mjs` 仅 9/21：core.test / core-collision / core-interior / core-audit / verify-completeness / verify-experience / zone-east / zone-forecourt 红 | **期望值同步族**（t76 归我：core 侧测试期望；t77 归 verifier：验收套件），t75 已给出"按文件列出准确新期望值"的清单 |
| `tests/core.test.mjs` 的 `kind` 类问题已**清零**（本卡修复）；剩余为其"机位 2→43 / 灰盒 28→112"等硬编码 | t76（我，下一张） |

---

## 5. 未验证项 / 已知限制

1. **`audit` 的 2 项未通过**未由本卡修复（分区预算属 zone 侧）；本卡只保证 `audit` 不再崩溃且预算总账（322/350、304,649）在限内。
2. **`docs/CONTRACTS.md` 的其他过时数字**未全量清理：我已按卡要求更新 §6.1 kind 列表 + 新增 §6.1.1 passage 语义 + §6.4 计数（28→112，实测）+ 修订记录 v1.0.11；但**版本表里 `LAYOUT_VERSION 1.0.0` 一行仍是旧值**（实际 1.1.4）——该行与 t81（foundation-lead 的契约递增卡）职责重叠，我未改以免双写。
3. **`ctx.config` 合并口径**：本卡让 `ctx.config` 既含常量又含 shared/config 的模块级函数（`deriveSeed` 等）。CONTRACTS §6.1 未明确这一点，建议 t81 顺手写明（"`ctx.config` = CONFIG 常量 + shared/config 模块级导出"）。
4. **仅修复与守卫**：未改任何 zone/kit/ui；`'passage'` 的**几何开门**仍由 t69 + 三区 + t66 承接（本卡不宣称"已可进入"）。

---

## 6. 给 CONTRACTS 的建议（t81 采纳；本卡已先行写入 §6.1/§6.1.1）

> 1. **共享枚举新增取值的纪律**：任何"布局侧新增 `WALKABLE[].kind`"必须同步 `src/core/context.js:WALKABLE_KINDS`
>    与 §6.1 列表，且由 `tests/core-kinds.test.mjs` 常驻守卫（本次事故：43 条 passage 让**全树 0 区域装载**）。
> 2. `passage` 语义：门洞通道面，宽 = `doorWidth`、`y = door.sillY`、**不参与内景相机包围盒**。
> 3. `ctx.config` 必须同时暴露 shared/config 的常量与模块级函数（`deriveSeed` 等），否则 Node/audit 路径会与浏览器路径行为不一致。
