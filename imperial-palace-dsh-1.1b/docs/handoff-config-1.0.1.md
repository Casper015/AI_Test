# 交付回执 · CONFIG 1.0.1（t15 / T1.1 共享配置修订）

> 归属：t1 foundation-lead（`src/shared/*`、`docs/CONTRACTS.md`、`docs/STYLE_GUIDE.md`、`tests/*` 的唯一 owner）
> 任务：t15 — GRADES[2] 增补 `pyramidal` + 屋顶等级机器守卫 + `totalHeight` 估值语义
> attempt_id：`a4c324f6-c2fc-4bdb-b7eb-d083088b03b9`
> 版本对应：**`CONFIG_VERSION 1.0.1` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `CONTRACTS v1.0.1` ⇄ `STYLE_BASELINE v1.0.0`**

## 1. 问题与裁定

kit-engineer 上报：`layout.SLOTS` 中 `F-garden-pavilion-main = {kind:'pavilion', grade:2, roofType:'pyramidal'}`，
而 `config.GRADES[2].roofTypes` 不含 `pyramidal`；`STYLE_GUIDE` 又要求 kit 必须按等级校验屋顶类型。

**独立复核（本任务开始前实测，非引用他人结论）**：全 67 槽位仅 1 处不匹配 → `F-garden-pavilion-main`（grade 2 + pyramidal）；
其余 9 个亭均为 grade1 + pyramidal，合法。分布：

```text
g2/hip: 6   g3/doubleEaveHip: 4   g1/gableHip: 8   g2/gableHip: 18
g1/pyramidal: 9   g1/gable: 21   g2/pyramidal: 1   →  grade-roof mismatches: 1
```

**主理人裁定**：方案 (a) —— `GRADES[2].roofTypes` 增补 `'pyramidal'`；`GRADES[3]` 保持仅 `doubleEaveHip`。

## 2. 改动清单（最小爆炸半径）

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `src/shared/config.js` | `CONFIG_VERSION` `1.0.0` → `1.0.1`；`GRADES[2].roofTypes` 增补 `'pyramidal'`；GRADES 上方补修订记录注释 | 仅此两处语义改动；色板/模数/材质/旧化/光照/UI/预算/种子一律未动 |
| `tests/layout.test.mjs` | 新增逐槽位守卫（67 条）+ 汇总守卫 4 条 + 版本 pin 2 条 | 断言数 1389 → **1462**（+73） |
| `docs/CONTRACTS.md` | 版本表 → `CONTRACTS v1.0.1`/`CONFIG 1.0.1`；新增 §4.1「`eaveHeight`/`totalHeight` 估值语义」、§4.2「等级-屋顶白名单」；`roofType` 字段行补白名单要求；头部补版本对应关系与修订记录 | 明确取景/面板/验收脚本必须用**实测包围盒** |
| `docs/STYLE_GUIDE.md` | 版本表 → `CONFIG 1.0.1`/`CONTRACTS v1.0.1`；§3 补等级-屋顶白名单表 + 高度语义一句 | 与 CONTRACTS §4.1/§4.2 一致 |
| `docs/handoff-config-1.0.1.md` | 本文件 | — |
| `src/shared/layout.js` | **零改动**（`shasum -a 256` 与修订前基线逐字节一致） | `LAYOUT_VERSION` 保持 `1.0.0` |

零改动证明（同一会话内前后各取一次）：

```text
修订前: be9784b239ca16eef2cce040efea10dcfcae3998543f68a5b5bd93d551502586  src/shared/layout.js
修订后: be9784b239ca16eef2cce040efea10dcfcae3998543f68a5b5bd93d551502586  src/shared/layout.js
修订后: 6a75356f661e5f083acb5ba804fd4113ccb9709de31def80b9ed005aeeefaeb3  src/shared/config.js
```

任务验收中的布局计数全部未变（1462 项断言中含这些断言）：
`槽位 67（B12/C12/D14/E15/F14）· 院落 14（前朝3/后宫3/西4/东4）· 连接 32 · 道路 95 段 · 墙 60 段 · 可行走面 28 · 障碍 81`。

## 3. 机器守卫（本次新增，永久拦截该类冲突）

`tests/layout.test.mjs`：

1. **逐槽位**：`槽位 <id> 屋顶类型属 grade <g> 白名单` —— 断言 `roofType` 同时是 `config.ROOF_TYPES` 合法键
   且 ∈ `config.GRADES[grade].roofTypes`（覆盖全部 67 槽位）。
2. **汇总**：`全部 67 个槽位同时满足 ROOF_TYPES 合法键与等级白名单`（失败时一次列出所有冲突）。
3. `等级白名单本身只引用 ROOF_TYPES 合法键`（防止白名单里写错类型名）。
4. `GRADES[2] 已允许 pyramidal`、`GRADES[3] 仍仅限 doubleEaveHip`。
5. 版本 pin：`CONFIG 版本 = 1.0.1`、`LAYOUT 版本 = 1.0.0`（有意为之：任何版本递增都必须同步改断言）。

### 红→绿突变测试（证明守卫真的能拦住历史冲突）

把 `GRADES[2]` 白名单临时回退到修订前（去掉 `pyramidal`）后重跑测试，再恢复并校验哈希：

```text
config.js 修订后 hash (预期基线): 6a75356f661e5f083acb5ba804fd4113ccb9709de31def80b9ed005aeeefaeb3
--- MUTATION: 临时回退 GRADES[2] 白名单（去掉 pyramidal），期望测试变红 ---
layout.test.mjs：通过 1459 项，失败 3 项
失败明细：
 ✗ 槽位 F-garden-pavilion-main 屋顶类型属 grade 2 白名单 :: pyramidal ∉ [doubleEaveHip, hip, gableHip]
 ✗ 全部 67 个槽位同时满足 ROOF_TYPES 合法键与等级白名单 :: F-garden-pavilion-main: grade 2 不允许 "pyramidal"（允许：doubleEaveHip/hip/gableHip）
 ✗ GRADES[2] 已允许 pyramidal（CONFIG 1.0.1：中央主亭 grade2 + 攒尖顶）
mutated exit=1
--- RESTORED hash: 6a75356f661e5f083acb5ba804fd4113ccb9709de31def80b9ed005aeeefaeb3 ---
RESTORE_OK 与修订后基线一致
--- 恢复后重跑，期望变绿 ---
layout.test.mjs：通过 1462 项，失败 0 项
restored exit=0
```

## 4. `totalHeight` 语义（写入 CONTRACTS §4.1 + STYLE_GUIDE §3）

- `layout` 的 `baseY/bodyBaseY/eaveHeight/totalHeight` 是**由 config 令牌做的估值**，不是硬约束。
- **几何真值以 kit 举架公式 + `config` 令牌为准**（`MODULES.roofSlope`、`ROOF_TYPES.*.riseRatio`、
  `GRADES[grade].eaveHeightFactor`、`MODULES.terraceTierHeight`）。kit 不需要回显 `layout.totalHeight`；
  两侧差 10%–40% 属预期（示例：`B-hall-main` 估算 20.48 vs kit 实测约 22.5）。
- **取景 / focus 机位自适应距离 / 信息面板高度 / 验收脚本不得使用 `layout.totalHeight` 作为权威高度**，
  必须使用实测包围盒（`new THREE.Box3().setFromObject(group)` 或 kit 提供的实测 `bounds3`）。
- 仅可用于：障碍盒高度初值、LOD 分档粗估、预算估算。
- 需要"精确到米"的高度时取 `terraceH` / `door.height` / `MODULES`，而不是 `totalHeight`。

## 5. 三条 verify 命令（原样输出）

```text
$ cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3" && node tests/run.mjs
=========================================================
 紫禁天朝 · 顺序测试
 node      : v26.10.0
 root      : /Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3
 filter    : (none)
 test files: 1
=========================================================

---------------------------------------------------------
▶ tests/layout.test.mjs
---------------------------------------------------------
layout.test.mjs：通过 1462 项，失败 0 项
 - 槽位 67（B12/C12/D14/E15/F14）
 - 院落 14（前朝3/后宫3/西4/东4）
 - 连接 32，道路 95 段，墙 60 段，可行走面 28，障碍 81
 - 视角 20，导览点 10，走查点 9，config 1.0.1/v1.0.0
全部通过 ✓
◀ tests/layout.test.mjs → PASS (83ms)

=========================================================
 汇总
---------------------------------------------------------
 PASS  tests/layout.test.mjs  83ms
---------------------------------------------------------
 通过 1 / 1，失败 0，总耗时 83ms
=========================================================
EXIT=0

$ node tests/layout.test.mjs
layout.test.mjs：通过 1462 项，失败 0 项
 - 槽位 67（B12/C12/D14/E15/F14）
 - 院落 14（前朝3/后宫3/西4/东4）
 - 连接 32，道路 95 段，墙 60 段，可行走面 28，障碍 81
 - 视角 20，导览点 10，走查点 9，config 1.0.1/v1.0.0
全部通过 ✓
EXIT=0

$ node scripts/build.mjs
=== build: 紫禁天朝 ===
root : /Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3
  copy index.html → dist/index.html
  ok   index.html (2.2KB)
  ok   src/shared/config.js (28.7KB)
  ok   src/shared/layout.js (82.4KB)
  ok   src/shared/base.css (4.2KB)
  ok   public/vendor/three/three.module.js (1.24MB)
  ok   importmap three → ./public/vendor/three/three.module.js
  ok   importmap three/addons/ → ./public/vendor/three/addons/
  扫描 16 个自研文本文件（跳过 vendor 13 个），dist 共 29 个文件 / 1.60MB
=== 结果 ===
  warn  dist 暂缺入口 src/main.js（归属 t2 core-engineer / t14 集成；index.html 已在引用它）
  ✓ dist 就绪：29 个文件 / 1.60MB；绝对路径 0；关键文件齐全
EXIT=0
```

（`dist` 从 17 文件增至 29 文件，是因为 t2/t3 正在并行写入 `src/core/*`、`src/kit/*`；构建脚本自动纳入，且仍为"绝对路径 0"。）

## 6. 未触碰范围与遗留

- 未触碰：`src/shared/layout.js`、`src/kit/**`、`src/core/**`、`src/zones/**`、`src/ui/**`、`index.html`、
  以及同级 `imperial-palace/`、`imperial-palace copy/`、`imperial-palace copy 2/`（后者正由其他队伍并行开发，与本任务无关）。
- **遗留（需主理人决定，不在本任务 inScope）**：`README.md` 第 16 行仍写 `CONFIG_VERSION 1.0.0`、第 61 行示例输出仍是 `config 1.0.0/v1.0.0`。
  README 归 t1，但本任务 inScope 仅列 5 个文件，故**未改**；建议由 t14 收口或另开 t1 小任务同步（同时会把 config 1.0.1 的新断言数 1462 写入 README 实证段）。
- 未验证项：kit 实际举架结果与 `layout.totalHeight` 的具体差值（属 t3 实测范围）；本任务只固定语义，不做几何验证。
