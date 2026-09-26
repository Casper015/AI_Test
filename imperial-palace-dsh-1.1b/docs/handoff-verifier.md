# docs/handoff-verifier.md — 独立评审员（verifier）任务回执

> 本文件是 `verifier` 的**开工/交付回执汇总**（模板见 `docs/handoffs/TEMPLATE.md`；本文件按 t12 任务卡 inScope 放在 `docs/`）。
> 只读消费 `src/**`、`tests/**`、`docs/**`、`index.html`；只写自己 inScope 的文件。

## 1. t12 / V1 — G2 场景完整性与跨区连接一致性独立验证（attempt 2）

- 状态：**完成**（G2 判定：通过；另有 1 项 CONDITION + 1 项版本戳观察 + 1 项外部红灯，均非本任务文件）
- 交付物：
  - `scripts/verify-completeness.mjs` — 独立验证引擎（Node 装配 + 射线探测 + 墙体碰撞复核 + 真实碰撞连通性 + 自包含浏览器探针）
  - `tests/verify-completeness.test.mjs` — 验收入口（复用同一引擎；默认 Node 侧确定性全量，`G2_VERIFY_BROWSER=1` 补浏览器）
  - `docs/report-completeness.md` — 逐项通过/未通过/未验证 + 命令 + 真实输出 + file:line 与最小修法
- 实测（真实输出见报告 §1）：
  - `node tests/verify-completeness.test.mjs` → exit 0，`检查项 49：PASS 47 / FAIL 0 / UNVERIFIED 1 / CONDITION 1`
  - `node scripts/verify-completeness.mjs`（含浏览器）→ exit 0，`检查项 53：PASS 51 / FAIL 0 / UNVERIFIED 1 / CONDITION 1`
  - `node tests/run.mjs` → exit 1，`通过 14 / 15`；唯一红项 `tests/kit.test.mjs`（§14/§18 在飞改动，非本任务文件，场景完整性无关；主理人此前告知的 interaction B3 已 PASS）
  - `node scripts/audit.mjs` → exit 0，`主场景 293/350 ✓、可见三角面 293841/1500000 ✓、分区 B58/C49/D39/E40/F61 全部在配额内`
- 关键结论（计数均可复现）：67 栋建筑（逐区 12/12/14/15/14 与 layout 完全一致、无廊段/重复编号虚增、67/67 有顶）· 14 院落（56 面院墙 + 49 门洞，全部落在院界）· 宫墙环 2282 点采样 100% 无断口 + 4 角楼 + 主门 grade3/侧门 grade2 · 护城河 4 段共边各 34m 闭合 + 8 水体水面齐备 + 4 桥跨满带引道引坡 · 32 条连接唯一 owner、六字段逐值一致 · `cellSize=1` 真实碰撞图 71.1 万可走格，南桥→5 区→2 内景同连通分量（B 内景 353m / C 内景 838m）· 67/67 建筑有障碍、18 exceptDoor + 49 all、info 文案一致 · 灰盒隐藏后残留可见网格 0 · 静态引用缺失 0 + 运行时 404 = 0 · 8 视角 1440×900 出图全成功
- 未验证（已标注）：像素级目视判读（形制可辨识度/拼接感/疏密/接缝）、真实 GPU 帧率（SwiftShader）、合并后逐栋网格归属（方法限制）、逐栋毫米级落地（依赖区域自测）
- 纪律：曾一次性误用 `import('./scripts/shot.mjs')`（其顶层即 CLI）导致 08:10 写入 `docs/shots/t2-oblique-golden.png` 与 `manifest.json`；发现后改为自包含探针，出图一律写系统临时目录。详见报告 §6。

## 2. t5 / R1 — G1 基线评审（上一任务，留档）

- 状态：完成，verdict = **pass**（46 项独立检查全绿；5 项文档/归属欠账 D-1…D-5 + OBS-1 已在 `docs/reports/g1-baseline-review.md` 登记并归属 t20/t3）
- 交付物：`scripts/verify-g1-baseline.mjs`、`docs/reports/g1-baseline-review.md`、`docs/reports/g1-verify-output.txt`、`docs/reports/g1-evidence/**`

## 3. 给后续任务的接口提示（可直接消费）

1. 复跑本报告全部结论：`node scripts/verify-completeness.mjs`（全量，含浏览器；约 3–4 分钟）；快速回归：`node tests/verify-completeness.test.mjs`（Node 侧，约 65 秒）。
2. `openings[].at` 是**沿墙轴的世界绝对坐标**（`src/core/layout-slice.js` `wallSolidSpans` 口径）；`docs/CONTRACTS.md` §3.4 目前写的是"相对墙中点"，两者不一致，按实现口径已通过验证（报告 §5.2）。
3. `cellSize ≥ 2` 的 walk-graph 会把丹陛/台阶判成不可跨（假阴性）；连通性检查请用 `cellSize=1`。
4. `registry.allConnectors()` 当前恒为空（报告 C-2，owner t2）；需要连接数据的消费方请暂时从 `layout.CONNECTORS` 或各区域返回值取。

## 4. attempt 3 复验（ROOT 重命名后）

- 环境：ROOT 被外部重命名为 `imperial-palace-dsh-1.1b`（同一棵树，我方 4 文件随转、未改）；旧路径 `imperial-palace copy 3` 已不存在，后续任何按旧路径的验证都会失败，请团队知悉。
- 三条契约 verify（全部 exit 0）：
  - `node tests/verify-completeness.test.mjs` → `49 项：PASS 48 / FAIL 0 / UNVERIFIED 1`（跳过浏览器）
  - `node tests/run.mjs` → `通过 19 / 19，失败 0`（kit.test 653/653）
  - `node scripts/audit.mjs` → `主场景 293/350 ✓、可见三角面 293841/1.5M ✓、五区配额全内`
- 全量（含浏览器）：`node scripts/verify-completeness.mjs` → exit 0，`53 项：PASS 52 / FAIL 0 / UNVERIFIED 1 / CONDITION 0`；出图 1440×900 均值 0.664、内容 30.0%；八视角除 fp 偶发未捕获外全出图；内景由 0.11/66% 改善到 0.30/4%。
- 上一 attempt 的 4 项上游/外部项全部已修复：kit.test §14/§18（653/653）、registry 连接索引（allConnectors()=32）、`openings.at` 文档口径（CONTRACTS v1.0.7 §3.4.8）、CONTRACTS 版本表（v1.0.9 ⇄ CONFIG 1.0.6）。
- 观察：重命名瞬间的一次复跑出现 8 张纯白帧（同批 DOM 报告健康），在新路径复跑恢复正常 → 判定为移动期间的环境抖动；脚本已用"全新 profile + 最多 5 次重试"缓解，仍建议像素验收避开并发移动窗口。
- 复跑命令：`node scripts/verify-completeness.mjs`（全量含浏览器 ~3–4 分钟）/ `node tests/verify-completeness.test.mjs`（Node 侧 ~25–65 秒）。
