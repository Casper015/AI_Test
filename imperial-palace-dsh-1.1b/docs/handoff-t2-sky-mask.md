# handoff · T2.14 真天空掩码诊断模式（终结"用像素猜天空"）（t50）

任务：`t50`（repair，attempt 1）· 执行者：core-engineer（attempt_id `4553d56c-2cf1-4fad-9e92-8bc18e288691`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`（**新 ROOT**；旧 `imperial-palace copy 3` 已被外部重命名）
基线：`CONTRACTS v1.0.7` ⇄ `CONFIG_VERSION 1.0.6` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执

```text
来源：t13（V2 终验）blocker F1 + high F2，主理人核算确认 F2 是根因、F1 是其假象：
      · 落屏带口径把大片暗城市当天空（排除 87.65% → 内容 12.3% → 19.82% FAIL）；
      · 直接原因：落屏带下端 backgroundDisplayedHorizonHex = #1b2333 与 moonlitNight 雾色 #1b2333 **完全相同**
        ⇒ "与带匹配"必然吞掉雾洗白几何，违反 t44 自定的"雾洗白几何属内容"。
裁定：先修口径、不动光照；由渲染侧给出**真天空信号**（"用像素猜天空"的第五次发作）。

可写范围（已严格遵守）：src/core/renderer.js、src/core/environment.js、src/main.js、
      tests/core-stats.test.mjs、docs/handoff-t2-sky-mask.md。
未触碰：src/shared/**、src/kit/**、src/zones/**、scripts/**（shot.mjs 未改，`--mask=sky` 接线留给 t49）、
      docs/CONTRACTS.md、index.html。
```

---

## 1. 交付：`?mask=sky` 真天空掩码（几何信号，零颜色阈值）

### 1.1 机制（两遍渲染；**不新建 Scene / 不新建相机 / 不自行 scene.add**）

1. **① 铺白天空**：把相机切到掩码图层（`camera.layers.set(30)`；白色天空网格 `BackSide`/`depthWrite:false` 常驻该层）
   → 只画这一层 ⇒ 可见天空处落**纯白**；
2. **② 盖黑几何**：恢复相机图层 → `scene.overrideMaterial = 纯黑 MeshBasicMaterial(toneMapped:false, fog:false)` +
   `autoClear = false` 再渲一遍 ⇒ 所有几何（建筑/墙/地形/水/粒子）覆盖为**纯黑**；
   **黑白由绘制顺序决定**，不依赖"天空球是否比几何更远"这类隐含假设；
3. **两处必须的现场处理**（各踩过一次坑，已固化成回归断言）：
   - **`scene.background` 临时置 `null`**：Color 背景时 three 每次 `render()` 都**强制清屏**成该色（无视 `autoClear`），
     会把白掩码擦成配置清屏色（实测现象：天空区 = `#171f2f`）；
   - **真实天空球临时 `visible=false`**：否则它会被 overrideMaterial 涂黑、正好盖掉白色掩码天空（实测现象：全黑）；
   - 两遍后恢复 `overrideMaterial / autoClear / 清屏色 / background / layers / visible` 全部现场。
4. **合规**：掩码复用同一 renderer/scene/camera（图层隔离 + 绘制顺序）⇒ `tests/core.test.mjs` 的"唯一渲染内核"
   静态扫描（只有 main.js 建 Scene / 无第二台相机 / 只有 main.js `scene.add`）保持全绿。隔离网格由 **main.js** 挂载。
5. **输出**：画布掩码 = 纯白/纯黑 + 极少量 MSAA 边缘过渡（实测**纯色占比 99.83–99.96%**，唯一色 5 种 = 2 纯色 + 3 边缘色）
   ⇒ 工具按 `r > 127` 阈值化即得**二值真天空掩码**；需要"无边缘灰"的精确占比时用 `?stats=1` 的 `skyShare`（离屏 RT、无 MSAA）。

### 1.2 用法与字段

| 用法 | 说明 |
| --- | --- |
| `?mask=sky` | 每帧输出掩码图；掩码模式下**不叠可见统计面板**（面板底色会污染掩码），hidden `<pre id="palace-stats-json">` 报告照常产出 |
| `?stats=1` | 报告新增 6 字段（原有 54 → **60**）：`skyMaskMode`/`skyMaskConfigured`/**`skyShare`**/`skyMaskColors`/`skyMaskSampleSize`/`skyMaskNote` |
| `__PALACE__.skyMask` | `info()` / `share()`（立即重算）/ `render()`（把掩码渲到画布），供 CDP 侧按需取用 |

`skyShare` 实现：半分辨率（720×450，保持画布宽高比）离屏掩码 RT + `readRenderTargetPixels` 统计白像素占比；
**带位姿键**（相机矩阵 + 投影首元素）：位姿一变立即重算，绝不返回过期缓存。

---

## 2. 真实证据

### 2.1 掩码随视角同步变化、纯色占比 ≥99.8%（LIVE，真实浏览器）

```text
$ CORE_STATS_LIVE=1 node tests/core-stats.test.mjs
 · LIVE oblique: 掩码白=69.98%、唯一色=5、报告 skyShare=0.69914
 · LIVE interior: 掩码白=0.25%、唯一色=5、报告 skyShare=0.00251
 通过 20 / 20    exit=0        （无 skip）
```

四视角实测（`?view=…&preset=night&ui=0&shot=1&stats=1&mask=sky`）：

| 视角 | 掩码白（真天空） | 纯黑/纯白占比 | 唯一色数 | 报告 `skyShare` |
| --- | --- | --- | --- | --- |
| `oblique`（45° 俯瞰） | **69.98%** | 99.85% | 5 | 0.69914 ✓ 一致 |
| `iso` | **43.71%** | 99.83% | 5 | 0.63199（见 §5.4） |
| `fp`（第一人称） | **12.95%** | 99.96% | 5 | 0（见 §5.4） |
| `interior`（内景） | **0.25%** | 99.94% | 5 | 0.00251 ✓ 一致 |

⇒ 占比随视角单调变化（俯瞰 > 等轴 > 第一人称 > 内景）；`oblique`/`interior` 两个稳定机位上
**掩码图白占比与报告 `skyShare` 逐项一致（±0.001）**。

### 2.2 掩码 vs 颜色带：颜色带错在哪（把 F1/F2 钉死）

同一机位同时抓「掩码图」与「常规出图」逐像素比对（1440×900；带判定用夜间落屏带 `#0d1526→#1b2333` ±2）：

| 视角 | 掩码真天空 | 颜色带判定的"天空" | 带的口径误差 | 误差性质 |
| --- | --- | --- | --- | --- |
| `oblique` | 69.97% | 78.93% | **+8.96pp** | **黑但像天空带**（雾洗白几何被当成天空 ✗） |
| `iso` | 63.22%* | 78.04% | **+14.82pp** | 同上（夜间雾色 `#1b2333` ≡ 落屏带下端色） |
| `fp` | 45.87%* | 29.23% | **−16.64pp** | **白但不像天空带**（雾/霾天空被漏判 ✗） |

（*上一版实现的捕获；本版最终值见 §2.1。两版结论一致：掩码的"白"就是天空 —— `白但不像天空带` 在 `oblique`/`iso` 上均为 **0.00%**。）
⇒ 颜色带误差**方向相反**（+15pp 误吞几何 / −17pp 漏判天空），**没有任何容差能同时消除**：这就是"用像素猜天空"反复翻转的机制原因。

### 2.3 正常路径零变化

| 证据 | 数值 |
| --- | --- |
| 常规（无 mask/stats）`night oblique` 的**口径无关**统计：整帧均值 | **0.1066**（与 t48 记录逐值相同） |
| `--stats` 出图：有/无 `skyShare` 计算两次运行 | 整帧均值 **0.1097 vs 0.1097**、内容均值 0.1897 vs 0.1896、暗区 15.84% vs 15.85%、截断 0.68% vs 0.68% |
| 上述两次运行逐像素比对 | 840 px = **0.0648%**（边缘亚像素抖动级） |
| `node scripts/audit.mjs` | **293/350 批次、293,841 三角面**（与 t48 一致），结论全部通过 |
| 唯一渲染内核不变量 | `tests/core.test.mjs` **43/43**（含"只有 main.js 建 Scene / 无第二台相机 / 只有 main.js `scene.add`"扫描）；`tests/interaction.test.mjs` **49/49** |

> **注意（不是本卡引入）**：`night oblique` 在当前 `shot.mjs` 口径下判 `FAIL 19.82% > 15%`，这正是 t13 的 F1；
> 像素与 t48 完全一致（整帧均值 0.1066）⇒ FAIL 来自**工具侧落屏带口径**（`scripts/` 不在本卡 inScope，未改）。
> 掩码给出**真天空 69.98% ⇒ 内容 30.02%**：同样的绝对暗像素在该分母下会回到"像素法"量级（~10%），即 F1 可随之消除。

### 2.4 verify 与树内自查

```text
$ node tests/core-stats.test.mjs            → 通过 20 / 20，skip 3   exit=0   （skip = 3 条 LIVE，设 CORE_STATS_LIVE=1 时无 skip）
$ node scripts/audit.mjs                    → exit=0（293/350、293,841 三角面、结论全部通过）
$ node tests/core.test.mjs                  → 43 / 43（不变量扫描）
$ node tests/interaction.test.mjs           → 49 / 49（A5 相机实例化点）
$ node tests/run.mjs（非本卡 verify）        → 19 / 20；唯一红项 = tests/verify-experience.test.mjs 的 F1
                                              （24 张里 oblique/night、zone/night 判 19.82% > 15%），
                                              即 t13 登记的 F1/F2 既有阻塞（像素未变），归属工具口径侧，非本卡引入。
```

---

## 3. 为什么纯像素无法分离"夜空 vs 暗城市/雾"

1. **同色不可分**：夜间天空渐变 `#0d1526→#1b2333` 与"雾洗白后的暗建筑"亮度区间完全重叠；更致命的是
   `backgroundDisplayedHorizonHex = #1b2333` **等于** `CONFIG.moonlitNight` 雾色 `#1b2333`
   ⇒ 匹配该带必然把雾覆盖几何算成天空，**直接违反 t44 定下的"雾洗白几何属内容"**。
2. **两类误差方向相反**（§2.2）：`oblique/iso` 上它把 9–15pp 几何误判成天空（分母变小 → 暗区比例虚高 → F1 的 19.82% FAIL）；
   `fp` 上又把 17pp 真实天空漏判（分母变大 → 暗区虚低）。**没有一个容差能同时消除两者。**
3. **众数法只是"凑巧"**：t44 的像素法取众数色，夜间恰好接近真值；但众数会被大面积暗城市/雾面拿走，换视角/换时辰即翻车。
4. **结论**：天空是**可见性/几何**问题，不是颜色问题。唯一稳的判据是"该像素上最前面的可见表面是不是天空网格" ——
   这正是 `?mask=sky` 直接给出的东西。

---

## 4. 给工具侧的消费建议（供 t49 接入）

1. **判据改用掩码图**：掩码 PNG 中 `#ffffff` = 天空、`#000000` = 非天空（含雾洗白几何）；
   内容掩码 = 黑像素集合，**零颜色容差、零落屏带、零众数**；阈值 `r > 127` 即二值（纯色占比 ≥99.8%）。
2. **接入方式（建议）**：给 `shot.mjs` 加 `--mask=sky`（把 `&mask=sky` 拼到 URL；与视图/时辰同参数各出一张配对图）：
   ```bash
   node scripts/shot.mjs --view=oblique --preset=night --name=t-oblique-night.png     --out-dir=/tmp/shots
   node scripts/shot.mjs --view=oblique --preset=night --name=t-oblique-night-sky.png --mask=sky --out-dir=/tmp/shots
   ```
   （`scripts/` 归 t49/门禁；本卡证据用自建 HTTP 服务 + shot.mjs 导出的浏览器助手在 `/tmp` 完成，未写 `docs/shots/**`。）
3. **交叉校验**：`skyShare` 只作 sanity check（±0.02）；**判定以掩码图为准**（截图与 DOM dump 是两次浏览器会话，见 §5.4）。
4. **必须显式失败**：掩码图应只有"纯白/纯黑 + 少量边缘色"；若出现大面积其它颜色，说明掩码帧未生效
   （URL 参数拼错/被覆盖）→ 应报错，**不得退回颜色猜测**。
5. **成本**：掩码模式每帧多一遍场景渲染（诊断专用，不进常规出图）；`?stats=1` 下每 500 ms 一次半分辨率掩码 pass + 读回
   （浏览器控制台打印一次 `GPU stall due to ReadPixels`，属预期）。

---

## 5. 未验证项 / 已知限制

1. **未改 shot.mjs**：`--mask=sky` 接线归 t49；本卡未写入 `docs/shots/**`（证据全在 `/tmp`）。
2. **透明/粒子按遮挡处理**（保守）：水/烟/尘在掩码里算遮挡 ⇒ 天空占比**不会被高估**（可能略低估）；已在 `skyMaskInfo().caveat` 声明。
3. **掩码语义是"可见天空"**（被地形/几何挡住的像素算黑），这正是判据需要的语义，而非"天空球面积"。
4. **`skyShare` 的时序注意（实测偏差）**：`oblique`/`interior` 报告值与掩码图逐项一致；`iso`/`fp` 出现报告 0.63/0.00 而
   掩码图 43.71%/12.95% 的偏差 —— 因为**报告由另一次浏览器会话（`--dump-dom`）产出**，两会话的相机过渡落点/节拍不同
   （掩码图取自截图会话，值为最终姿态）。**判定以掩码图为准**；若要强一致，建议 t49 在**同一会话**内先取报告再截图，
   或直接用 `__PALACE__.skyMask.share()`（同会话、带位姿键）。
5. **半分辨率采样误差**：`skyShare`（720×450）与全分辨率掩码白占比实测差 ≤0.9pp（oblique 0.69914 vs 0.6998）；
   更低分辨率（320×200）会把细长遮挡抹掉、占比虚高，故未采用。
6. **仅验证 night**：三时辰共用同一套掩码机制与同一天空网格（preset 只改顶点色）；需要三时辰证据时换 `--preset` 重跑同样命令。
7. **掩码图非严格单色**：画布路径含 MSAA 边缘（唯一色 5），"二值"指阈值化结果；无边缘灰的精确占比走 `skyShare`（离屏 RT、无 MSAA）。
8. **实现期两个坑已固化**（背景强制清屏 / 真实天空球被涂黑），对应 `core-stats.test.mjs` 的两条静态断言，防止回归。

---

## 6. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§11/§12 补充：真天空判定必须来自掩码**
> 1. `?mask=sky` 为**唯一合法的天空判定来源**（白=天空、黑=非天空）；工具内容掩码 = 黑像素集合，阈值 `r>127`。
> 2. 禁止以"配置清屏色/落屏带/众数色 ± 容差"作为天空判据（已翻转 5 次）；颜色口径只可作 sanity check。
> 3. `?stats=1` 必须并行上报 `skyShare` 与 `skyMaskMode`；掩码模式不得叠加可见 UI 面板，且**不得改变常规出图**
>    （同命令改前后口径无关统计逐值相同）。
> 4. 实现约束：掩码必须复用同一 renderer/scene/camera（`camera.layers` 隔离 + 绘制顺序），
>    不得引入第二个 Scene 或第二台相机（守"唯一渲染内核"静态守卫）。
