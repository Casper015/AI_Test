# handoff · T2.15 掩码图极性与 skyShare 的一致性（t53）

任务：`t53`（repair，attempt 1）· 执行者：core-engineer（attempt_id `083f739e-5c1e-4d9b-9965-9afa22822cf2`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
基线：`CONTRACTS v1.0.7` ⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执

```text
来源：t52 逐像素统计 ?mask=sky 截图产物：唯一色 5、黑 71.67% + 白 28.19%、前二主色 99.86%
      ⇒ 与 t50 文档"天空=白、oblique 天空 69.98%"矛盾（黑 71.67% ≈ 天空 69.98%）⇒ 极性存疑。
裁定：这是必须先定性的真问题（极性若反，任何"内容=白/黑像素"的假定都会颠倒结论）；
      禁止留下"文档说白=天空、实测白=几何"的矛盾归档。

可写范围（已严格遵守）：src/core/renderer.js、src/core/environment.js、src/main.js、
      tests/core-stats.test.mjs、docs/handoff-t2-sky-mask-polarity.md。
未触碰：src/shared/**、src/kit/**、src/zones/**、scripts/**（shot.mjs 未改）、docs/CONTRACTS.md、docs/shots/**。
```

---

## 1. 定性结论：**极性没有反**，但**画布掩码曾经不可靠**（会产出"反向看起来"的撕裂帧）

| 事实 | 证据 |
| --- | --- |
| **天空色 = 白色**（当前实现，且可自证） | 修好后 `oblique/night` 两次运行**逐值一致**：白 69.91% / 黑 30.09%、**唯一色 2**；图像天空取样点（左上/上中/中左/下中）全为 `255,255,255`；报告 `skyShare = 0.69914` 与图白占比 **0.6991 一致**；`interior/night`：白 0.25% / 黑 99.75%，取样点全黑，`skyShare = 0.00251` 与白占比一致 |
| **t52 的 28.19%/71.67% 可复现，但只出现在修复前的构建上** | 修复前我用同一探针连跑两次 `oblique/night`：**一次白 69.84%/黑 30.00%，另一次白 28.25%/黑 71.73%**（后者与 t52 的 28.19/71.67 吻合）；同一次运行里 RT 探针（顶中部）说"白=天空"，而画布取样点在**同一图内既有白也有黑**（左列白、中部黑）⇒ 典型的**半帧撕裂**，不是极性反转 |

**根因**：修复前画布掩码由**两遍独立的 `renderer.render()`**顺序写成（① 白天空 → ② 黑几何）。
截图/`--dump-dom` 的截获点可能落在两遍之间（或与上一帧交错），于是拿到的是"半白半黑"的**拼接帧**——
按主色占比统计时看起来就像"极性反了"。这也解释了为什么它**时好时坏**（我 t50 期间先后测到 28.27% 与 69.97%）。

**修法（仅掩码诊断路径）**：把画布掩码收敛成**每帧一次写**：
1. 掩码两遍先渲进**无 MSAA 的离屏 RT**（唯一的掩码真相源；`NearestFilter`、无色带）；
2. 再把该 RT 贴到一块**正对相机的四边形**上，用同一场景 + 同一相机 + 图层隔离（`camera.layers.set(30)`）
   **一次 blit** 到画布 ⇒ 画布不可能出现"两遍之间"的中间态；
3. 该四边形由 `main.js` 挂载（唯一允许 `scene.add` 处），平时 `visible=false`，**常规渲染完全不参与**。
→ 结果：掩码图**严格二值（唯一色 2）**，且 `skyShare` 与图像占比**同源**（都来自那张 RT），二者恒一致。

---

## 2. 对照实测（同一视图/预设）

| 运行 | 图像白占比 | 图像黑占比 | 唯一色 | 图像天空取样点 | 图像白占比 vs `skyShare` |
| --- | --- | --- | --- | --- | --- |
| `oblique/night` 修复后 #1 | **0.6991** | 0.3009 | **2** | 左上/上中/中左/下中 = `255,255,255` | `skyShare=0.69914` ✓（差 0.00004） |
| `oblique/night` 修复后 #2 | **0.6991** | 0.3009 | **2** | 同上 | ✓（两次运行逐值一致） |
| `interior/night` 修复后 | **0.0025** | 0.9975 | **2** | 全为 `0,0,0` | `skyShare=0.00251` ✓（差 0.00001） |
| `oblique/night` 修复前 #1 | 0.6984 | 0.3000 | 5 | 全白 | ✓（偶然正确） |
| `oblique/night` 修复前 #2 | **0.2825** | **0.7173** | 5 | 左列白 / 中部黑（撕裂） | ✗ 与 `skyShare=0.69914` 矛盾（**t52 复现**） |

报告侧极性字段（浏览器实读，`?mask=sky&stats=1`）：

```json
{"skyMaskSkyColor":"#ffffff","skyMaskOtherColor":"#000000",
 "skyMaskProbe":{"topCenter":"white","topLeft":"white","centerLeft":"white","bottomCenter":"white"},
 "skyMaskSkyAtProbe":"white","skyMaskShareByColor":{"white":0.69914,"black":0.30086},
 "skyMaskPolarityConsistent":true,"skyShare":0.69914}
```
（`interior` 的 `skyMaskSkyAtProbe` = `"black"`：**该视角顶中部本来就不是天空**，见 §4 规则。）

---

## 3. 正常渲染零变化

| 证据 | 数值 |
| --- | --- |
| 常规（无 mask）`night oblique` 的**口径无关**统计：整帧均值 | **0.1066**（与 t48/t50 记录逐值相同） |
| `node scripts/audit.mjs` | **293/350 批次、293,841 三角面**（与 t50 逐值相同），结论全部通过 |
| 唯一渲染内核不变量 | `tests/core.test.mjs` **43/43**、`tests/interaction.test.mjs` **49/49**（renderer.js 仍零 `new Scene`、零相机实例、零 `scene.add`；blit 四边形由 main.js 挂载、平时 `visible=false`） |
| 掩码专属成本 | 仅 `?mask=sky` 时多一遍离屏 RT + 一次 blit（诊断模式，不进常规出图） |

---

## 4. 给工具侧的消费规则（**禁止假定 white=sky**）

1. **决定性规则（视角无关，唯一权威）**：读 `?stats=1` 报告的 `skyMaskShareByColor`（{white, black}）与 `skyShare`；
   **哪种颜色的占比等于 `skyShare`，哪种就是天空色**。例：oblique → `white=0.69914=skyShare` ⇒ 天空=白；
   interior → `white=0.0025=skyShare` ⇒ 天空=白（黑是几何）。
   等价做法：用图自身占比与该值比对（±0.02）——**不需要任何"白=天空"的先验**。
2. **视角相关的 sanity check（`skyMaskProbe`）**：有天空的视角（俯瞰/等轴/第一人称）`probe.topCenter` 应等于**天空色**；
   无天空视角（内景、俯视地面）`probe.topCenter` 等于 otherColor —— 这只用于交叉校验，**不得**据此反推极性。
3. **必须显式失败**：掩码图应**只有两种颜色**（`#ffffff` / `#000000`；实测唯一色 = 2）。
   若出现第三种颜色或主色纯度 <99%，说明掩码帧未生效/被撕裂 ⇒ **报错**，不得退回颜色猜测（本轮修复前正是这种情形）。
4. **分辨率口径**：画布掩码是 **720×450 RT 放大到画布尺寸**（1:1 场景覆盖，无平滑），像素级边缘精度为半分辨率；
   若 t49 需要像素精确的逐像素掩码，请提需求把 `skyMask.size` 提到画布全分辨率（成本：读回 4×）。
   `skyShare` 的统计精度与此一致（本轮 720×450 与全分辨率掩码占比差 ≤0.02）。
5. **与旧口径的关系**：t50 回执 §4 的"内容掩码 = 黑像素集合"仅在"天空=白"成立时等价；
   请按本卡规则**先定天空色再取内容**（当前实现天空=白 ⇒ 内容=黑，结论与 t50 相同，但现在**可自证**）。

---

## 5. 未验证项 / 已知限制

1. **仅验证 night**（三时辰共用同一掩码机制，preset 只改天空顶点色）；如需三时辰证据，换 `--preset` 重跑同样命令。
2. **掩码为半分辨率**（720×450 放大）：占比精确（≤0.02 差），但边缘像素精度减半；t49 若要逐像素精确可提需求。（§4.4）
3. **透明/粒子按遮挡处理**（保守，天空占比不会被高估），沿用 t50 口径，未改。
4. **`skyMaskPolarityConsistent` 语义**已收窄为"probe 取到确定颜色"（≠"顶中部一定是天空"）；
   `interior` 视角该字段仍为 `true`（probe 取到 black），避免误报。
5. **修复前后的归档矛盾**：t50 回执记录的"唯一色 5、纯色 99.83–99.96%"属**单次 blit 之前**的实现；
   本卡已把画布掩码改为严格二值（唯一色 2）——**本回执的数值取代 t50 的那两个数字**，t50 的"白=天空"结论不变且现在可自证。
6. **未改 shot.mjs**（`scripts/` 不在 inScope）：`--mask=sky` 的接线仍归 t49；本卡证据用自建 HTTP 服务 + shot.mjs 导出的浏览器助手在 `/tmp` 完成。

---

## 6. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§11/§12 补充：掩码极性必须自证、禁止假定颜色**
> 1. 掩码图必须是**严格二值**（仅 `#ffffff`/`#000000`，唯一色数 = 2）；出现第三色即视为"掩码未生效"，工具必须报错。
> 2. 天空色**只能**由报告字段判定：`skyMaskShareByColor` 中占比等于 `skyShare` 的颜色即天空色；
>    `skyMaskProbe` 仅作视角相关的 sanity check。**禁止假定 white=sky。**
> 3. 掩码图的占比必须与 `skyShare` 一致（±0.02），二者**同源**（同一张掩码 RT）——不得分别来自两次渲染。
> 4. 掩码不得引入新的 Scene/相机（复用 `camera.layers` 隔离 + 单次 blit）；常规渲染路径必须零变化（口径无关统计逐值一致）。
