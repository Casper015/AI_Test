# handoff · T2.19 focus 取景空白（城门楼/院门）（t78）

任务：`t78`（repair，attempt 1）· 执行者：core-engineer（attempt_id `263aa302-0eb8-4a38-bbf6-d11ac4faf5c0`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`src/core/camera.js`、`src/core/layout-slice.js`、`src/core/state.js`、`tests/core-camera.test.mjs`、`docs/handoff-t2-focus-blank.md`、`docs/shots-focus/`。
**未改** `src/shared/**`、`src/kit/**`、`src/zones/**`、`src/ui/**`、`src/interaction/**`、`src/main.js`。

---

## 1. 复现结论：**在当前树上不可复现**（含量化与对照）

| 槽位 | t69 实测 | 本次实测（`?view=focus&focus=<id>&ui=0&shot=1`，1440×900） |
| --- | --- | --- |
| `F-gate-south`（城门楼） | **空白 9.5KB** | **519,334B**、像素 std **69.62**、采样色 **2934** ✓ 正常 |
| `C-gate-west`（院门） | **空白 9.7KB** | **852,748B**、std **62.54**、采样色 **3331** ✓ 正常 |
| `B-gate-front`（对照） | 正常（667–853KB 一类） | 704,194B、std 67.82、采样色 4072 ✓ |
| `B-hall-main`（对照） | 正常 | 870,132B、std 69.16、采样色 3722 ✓ |

判空阈值（本卡全程未放宽）：**< 60KB 或 std < 8 或 采样色 < 40** 判为空白（t69 的空白图是 9.5KB / 近单色）。
⇒ 两个被报空白槽位现在都产出**真实、非单色**画面；同一命令、同一浏览器路径、同一 GL 方案（disable-gpu/SwiftShader）。

**因此：缺陷不可复现 ⇒ 其"当时的根因"无法直接确认**。为不"止于复现"，下面给出**机制分析**（为什么这类缺陷会发生）+ **我方把它变成不可能的那个修复**。

## 2. 机制分析（空白这一类缺陷的两个入口）

`focusSpecFor(building)` 旧实现：

```js
const distance = Math.max(w, d) * 1.7 + height * 1.55;   // ① 体量退化时距离塌缩
const lift = height * 0.5 + distance * 0.22;
position = center + dir * distance;                       // ② 没有"必须在建筑外"的不变量
```

- **① 退化包围盒**：院门/城门是"嵌在院墙/宫墙里的薄片建筑"，其 `bounds`（或 `kit.worldBounds`）在某类状态下会退化为
  零厚度或 NaN（`buildingWorldBounds()` 只判 `typeof minX === 'number'`，**NaN 也是 number** ⇒ 会原样透传）。
  此时 `max(w,d)` → 0，`distance` 只剩 `height*1.55`（8m 的院门 ≈ 12–20m），**相机贴脸甚至落进体量内部**，
  画面被单色背面/内壁填满 ⇒ PNG 只有 ~9.5KB ⇒ `shot.mjs` 判空白。这与"hall/sideHall 正常"的高度一致：
  后两者体量正常，不会触发塌缩。
- **② 缺少"相机必须在盒外"的不变量**：即便距离不算极小，只要 `facing` 与极扁的进深组合使
  `|Δx| < w/2 && |Δz| < d/2`，相机就落在建筑的平面范围内 ⇒ 同样可能出现近距单色帧。
- 这也解释了为什么**同一命令只对这两类槽位**出问题：它们的共同点是"薄片 + 可能退化"。

## 3. 修复（`src/core/camera.js`，仅此一处，加法式）

1. **退化识别**：`w/d/height` 任一非有限或 ≤1e-6 ⇒ `degenerate=true`，回落到安全体量（20/20/20），
   **且该包围盒不再参与中心点计算**（否则 NaN 会一路传到机位 ⇒ 整帧空白）。
2. **最小入镜距离**：`fitDistance = radius / tan(fov/2) * 1.35`（`radius` = 包围球半径，fov 取 `CONFIG.CAMERA.fov`），
   `distance = max(旧经验值, fitDistance, 24m)` ⇒ **任何体量/退化体量都能完整入镜**。
3. **盒外不变量**：若机位仍落在（略放宽的）平面包围盒内，沿 `dir` 继续外推（最多 6 次）直至出门。
4. **诊断字段**：`spec.framing = { distance, fitDistance, radius, degenerate, w, d, height, rawW, rawD, rawH, boundsSource }`
   ⇒ 回归守卫与排障可机器判定"是否退化/是否贴脸"。

## 4. 常驻回归守卫（`tests/core-camera.test.mjs`，断言只增不减）

- **新增用例 1（53 槽位全覆盖）**：对**全部 53 个有门槽位**逐一 `focusSpecFor` 并断言取景不变量：
  距离 ≥ `fitDistance`、距离 ≥ 24m、相机在平面包围盒之外、坐标全部有限、`radius ≥ 4`。
  实测：**53/53 通过；退化 0、距离 < 入镜距离 0、相机在盒内 0、不合格 0；距离范围 44.5–173.5m**
  （按类型：`gateHall 6 / hall 14 / sideHall 23 / courtyardGate 10`）。
- **新增用例 2（突变证明 + NaN 防护）**：
  ① 合成"零进深院门"（进深 0）⇒ 被识别为 `degenerate`，且仍满足全部不变量；
  ② **突变对照**：同一输入用旧公式得 `32.18m < fitDistance 56.451m` ⇒ 证明"旧公式在退化输入上必塌缩"（该断言失败即样本失去区分力）；
  ③ `worldBounds` 含 NaN 的输入 ⇒ `degenerate=true` 且机位**仍有限**（旧实现在此会产出 NaN 机位 ⇒ 整帧空白）。
- 断言数：`core-camera.test.mjs` 用例数 **14 → 16**、`assert` 调用数 **+23**，无删除。

## 5. 出图证据（`docs/shots-focus/`）

| 文件 | 槽位 | 字节 | sha256[:12] |
| --- | --- | --- | --- |
| `focus-F-gate-south.png` | 城门楼（t69 报空白） | **519,334** | 见 manifest |
| `focus-C-gate-west.png` | 院门（t69 报空白） | **852,748** | 见 manifest |
| `focus-B-gate-front.png` | 对照组 | 694,133 | 见 manifest |
| `manifest.json` | 阈值、Node 53 槽位汇总、浏览器样本统计 | — | — |

## 6. verify

```text
$ node tests/core-camera.test.mjs  → exit=0 · 通过 16 / 16
   · 53 槽位 focus 取景：距离 44.5–173.5m；退化包围盒 0 个
   · 退化样本：thin-gate 距离 65（旧公式 32.18 < 入镜 56.451）；NaN 输入机位有限 ✓
$ node scripts/audit.mjs           → exit=0 · 主场景 333/350 批次 ✓、308,861 三角面 ✓；结论行「3 项未通过」（分区 B/C/D 绘制调用超预算，zone 侧在飞，非本卡）
```

## 7. 未验证项 / 已知限制（如实）

1. **原始空白的根因未直接确认**（不可复现）：本卡给的是**机制分析 + 让该类缺陷不可能发生的修复 + 不变量守卫**；
   若 t69 能提供当时那两张 `.invalid.png` 的**完整复现命令与时刻的树状态**（或那时的 `rig.describe()`），可进一步坐实。
2. **浏览器 53 槽位逐一扫描未跑完**：本机逐槽位渲染每张约 6s + 首屏 30–60s（六区 + 内景几何）⇒ 预估 >30min，
   已中止；**53/53 的确定性覆盖由 Node 取景不变量给出**，浏览器侧保留 4 张真实渲染样本（含两个被报空白槽位与两个对照）。
   如需"53 张真实浏览器图"，建议单独开一张**批量出图卡**（可用 `shot.mjs --focus=` 串行或加大超时）。
3. **阈值未放宽**：判空阈值仍是"<60KB 或 std<8 或 采样色<40"，与 t69 观测到的空白形态（9.5KB 近单色）区分度充分。
4. **无槽位被排除**：53 个有门槽位全部保留 focus 能力，未静默排除任何槽位（也无需论证排除——全部通过）。
5. **数据侧边界**：本次未发现 `src/shared/**` 的 `bounds`/`baseY` 退化实例（53/53 合格）；但代码已对"将来出现退化/NaN"设防，
   若数据侧后续真出现退化槽位，守卫会直接报出槽位 id（`degenerate` + `rawW/rawD/rawH` 字段）便于派单。
