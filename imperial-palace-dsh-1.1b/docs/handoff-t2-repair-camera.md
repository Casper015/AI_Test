# handoff · T2.6 core 语义修正：相机 rotate 写读时序 + 导览/FP 校验一致性（t31）

任务：`t31`（repair）· 执行者：core-engineer（attempt 1，attempt_id `08cbf778-d23d-4498-966a-a2b62b4f65f5`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.4` ⇄ `CONFIG_VERSION 1.0.3`（t26 于本 attempt 期间落盘）⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执

```text
来源（t9 / G 区在真实浏览器验收中发现，按纪律未越界改 core，只在 G 侧兜底并显式断言不掩盖）：
  ① camera.applyInput('rotate') 在 FP 下只改内部 yaw/pitch，target 要等下一帧 updateFp 才写回
     → 消费方同步读 describe().azimuthDeg / rig.target 恒为旧值（G 实测：朝向校准恒为 0，朝向被静默跳过）；
     且当时实测输出 aims:0/aimFailures:0（计数器全零）看起来"没失败"，实为"根本没尝试"。
  ② validateStateShape 把"导览暂停但 active"判为与 viewMode==='fp' 互斥，与 core 自身
     setViewMode('fp') 的语义（§5.4：进 FP 时暂停导览，暂停≠停止）自相矛盾（G 的 B3 用例如实断言了该不一致）。

可写范围（已严格遵守）：src/core/camera.js、src/core/state.js、tests/core-camera.test.mjs、docs/handoff-t2-repair-camera.md。
未触碰：src/interaction/**、src/ui/**、src/zones/**、src/kit/**、src/shared/**、tests/core.test.mjs、
  tests/core-walls.test.mjs、tests/core-collision.test.mjs、docs/CONTRACTS.md。
```

---

## 1. 修改点

### 1.1 `src/core/camera.js`（写读时序）

| 改动 | 说明 |
| --- | --- |
| 新增 `syncFpOrientation()`（**单一真相源**） | `yaw/pitch` → `target = position + 10 × dir` → `applyProjection()`（写入相机矩阵并 `lookAt(target)`）；任何改写 `yaw/pitch` 的入口都调用它。 |
| `applyInput()` 的 FP 分支 | rotate/其他输入处理完**立即** `syncFpOrientation()` 再 `return describe()` → 调用方之后同步读取 `describe()` / `rig.target` / `camera.getWorldDirection()` 全部是新值（不再需要"先走 1/240s 再读"）。 |
| `enterFp()` | 方向落位改为调用同一函数（原先内联 `target.set(...)`，与 `updateFp()` 的公式重复）；行为不变（同一公式，pitch=0）。 |
| `updateFp()` | 帧内朝向写回改为调用同一函数（去掉重复实现）。 |
| 新增 `viewDirection(out?)` | 返回单位视线向量：FP 由 `yaw/pitch` 决定，其它模式为 `(target − position)` 归一化；同步可读，供 G/UI 直接消费（不必再自己算 `target − position`）。 |
| `describe()` | 追加 `viewDirection: {x,y,z}`（附加字段，不破坏既有消费方）；`azimuthDeg` 语义保持不变（"机位相对 target 的方位角" = 视线方向的反向 bearing）。 |
| 对外 API | 暴露 `viewDirection`、`syncFpOrientation`。 |

### 1.2 `src/core/state.js`（校验一致性）

| 改动 | 说明 |
| --- | --- |
| `validateStateShape()` 互斥判定 | `viewMode === 'fp' && tourState.active` → **`viewMode === 'fp' && tourState.active && !tourState.paused`**：§5.4 要求"进 FP 时**暂停**导览（暂停 ≠ 停止）"，因此 `active && paused` 与第一人称**完全兼容**；只有"导览正在推进"才是真冲突。提示文案也改为"导览正在推进时不得处于第一人称（§5.4：进 FP 应暂停而非停止导览）"。 |
| 追加一致性断言 | ① `viewMode==='fp' && tourState.active && paused && mode!=='fp'` → 报错；② `mode==='fp' && viewMode!=='fp'` → 报错；③ `viewMode==='fp' && mode!=='fp'` → 报错（fp 与 mode 同进同出）。**未**采用"进 FP 就 stop 导览"的改法 —— 保留了"退出 FP 后可继续导览"的能力（见 §2.2 真机路径用例）。 |

### 1.3 `tests/core-camera.test.mjs`（新增，9 项）

1. FP rotate 后**同步**改变 target/describe/相机真实朝向 + 旋转量符合输入语义 + azimuth 与真实朝向一致；
2. pitch（dy）同样同步写回；
3. "朝向中轴"实战路径（按灵敏度算 dx → 一次 rotate → 真实朝向 dot > 0.999）；
4. G 侧"先走 1/240s 再读"的绕法在新语义下**幂等无副作用**（可保留）；
5. `validateStateShape`：暂停的导览 + FP = 零问题；推进中的导览 + FP = 冲突（提示含"暂停"）；
6. `mode/viewMode` 一致性（手工构造非法状态必须被检出）；
7. 真机路径：导览进行中 → 进 FP（暂停）→ 零问题 → 退出 FP 后仍可 `resume` 继续导览；
8. 非 FP 模式 rotate 仍是"轨道旋转"（target 不变、方位角变、距离不变）；
9. FP rotate 不移动位置，退出 FP 仍恢复原机位（t2 行为不回退）。

> **只断言真实结果**：所有朝向断言基于 `camera.getWorldDirection()`（真实相机朝向）与 `rig.viewDirection()`/`target`
> 的**向量点积**（dot > 0.999 / < 0.999），不依赖任何计数器；测试里还显式演示了"attempts=1/failures=0 这种计数器
> 在旧时序下同样成立"，因此不能作为验收依据（对应 t9 的 `aims:0/aimFailures:0` 教训）。

---

## 2. 真实输出

### 2.1 `node tests/core-camera.test.mjs`（exit 0，9/9）

```text
[1. FP：rotate 之后同步可读（真实朝向，无计数器）]
  ✓ 进入第一人称后，rotate 立即同步改变 target / describe / 相机真实朝向
  ✓ pitch（dy）同样同步写回：真实朝向的 y 分量与 target 同步变化
  ✓ "朝向中轴"实战路径：按灵敏度算出 dx → 一次 rotate → 同步读到的真实朝向 dot > 0.999
  ✓ G 侧"先走 1/240s 再读"的绕法在新语义下仍正确（幂等、无副作用）

[2. validateStateShape：导览"暂停但 active"不与第一人称互斥（§5.4）]
  ✓ 进 FP 暂停导览（active && paused）→ 校验零问题；真正推进中的导览才算冲突
  ✓ mode/viewMode 一致性：两者必须同进同出（fp ⇄ fp）
  ✓ 真机路径：导览进行中 → 进 FP（暂停）→ 校验零问题 → 退出 FP 仍可继续导览

[3. 回归护栏：rotate 不破坏其它模式与过渡]
  ✓ 非 FP 模式：rotate 保持"轨道旋转"语义（相机绕 target 转动，target 不变）
  ✓ FP 下 rotate 不改变位置；退出 FP 仍能恢复原机位（t2 行为不回退）

---------------------------------------------------------
 通过 9 / 9
---------------------------------------------------------
```

具体数值（同步读取，rotate dx=600，无任何 update）：
`dot(dirBefore, dirAfter) = -0.0108`（确实转过 ≈89.4°）、`dot(dirAfter, cameraForward) = 1.000000`、
`dot(targetDir, cameraForward) = 1.000000`、`|ΔazimuthDeg| = 89.40°`、
`dot(dirAfter, rotateY(dirBefore, -600×0.0026)) = 1.000000`（旋转量符合输入语义）。

"朝向中轴"实战：`perUnit = -0.0026`（旧时序下此处恒为 0，正是静默失效点）→ 一次 rotate 后
`dot(真实朝向, +Z) = 1.000000 > 0.999`，`dot(before, after) = 0.0891 < 0.999`（确实改变）。

### 2.2 前后对比（旧时序 vs 新时序）

| 场景 | 旧时序（`syncFpOrientation` 缺失） | 新时序 |
| --- | --- | --- |
| `applyInput('rotate')` 后立即读 `camera.getWorldDirection()` | 旧方向（未变） | 新方向（dot=1.000000 与期望一致） |
| `describe().azimuthDeg` 同步读数 | 旧值（Δ=0，G 实测校准恒为 0） | 新值（Δ=89.40°） |
| `rig.target` 方向 | 旧目标（下一帧才写回） | 与视线方向 dot=1.000000 |
| G 的 `aims/aimFailures` 计数器 | 1 / 0（看起来"成功"） | 1 / 0（同样是这两个数字 → **不能作为判据**） |
| "朝向中轴"真实结果 | dot ≈ 0.6~0.89（未对准） | dot = 1.000000 > 0.999 |

### 2.3 突变证明（旧时序必须失败）

```text
操作：把 src/core/camera.js 的 FP 分支还原为旧时序（rotate 后不写回 target，只改内部 yaw/pitch）
      —— 即删除 `syncFpOrientation();` 一行（其余代码不变）。
sha256(修复版) = 992cd93d85a73c76f009ec9f505be1d117681b3626ede25e5fd652ad34ce27cf

node tests/core-camera.test.mjs  → 通过 6 / 9，失败 3（exit 1）
  ✗ 进入第一人称后，rotate 立即同步改变 target / describe / 相机真实朝向
      装置报告方向必须等于相机真实朝向（dot=0.010796）
  ✗ pitch（dy）同样同步写回：真实朝向的 y 分量与 target 同步变化
      装置报告方向与相机真实朝向一致
  ✗ "朝向中轴"实战路径：按灵敏度算出 dx → 一次 rotate → 同步读到的真实朝向 dot > 0.999
      真实朝向必须对准中轴（dot=0.894427 > 0.999）
  ✗ G 侧"先走 1/240s 再读"的绕法在新语义下仍正确（幂等、无副作用）
      1/240s 步进不得改变朝向（dot=0.71091354）

还原后：sha256 = 992cd93d85a73c76f009ec9f505be1d117681b3626ede25e5fd652ad34ce27cf（逐位一致）、
        `MUTATION(t31` 标记不存在、`syncFpOrientation();` 存在
node tests/core-camera.test.mjs → 通过 9 / 9（exit 0）
```

结论：**"修好误报"没有变成"关掉守卫"** —— 真实朝向断言在旧时序下必然失败，且失败信息直接指出"装置报告方向 ≠ 相机真实朝向"这一根因。

### 2.4 `node tests/core.test.mjs` 的过期断言：按主理人授权参数化修复后 43/43

```text
node tests/core.test.mjs → 通过 42 / 43，失败 1
  ✗ 三预设：太阳方向/颜色/强度、天空、雾、曝光、色调映射全部来自 config 且互不相同
      盛世金辉不激活实时宫灯：期望 0，实际 4
  （tests/core.test.mjs:639  assertEqual(described[0].lamps.realtime, 0, '盛世金辉不激活实时宫灯');）
```

- **根因**：t26 在本 attempt 期间落盘 **CONFIG 1.0.3**（`src/shared/config.js` mtime 08:03:43），
  把 `goldenHour.lampIntensityScale` 由 `0` 改为 **`0.45`**（注释原文："日间内景补光：让宫灯在白天有限参与室内照明，不动全局曝光"）。
  于是金色档实时灯池 = `round(min(8, high档8) × 0.45) = 4`。该断言是我 t2 时期按 1.0.2 语义（金色不点灯）写的，**属预期过期**。
- **归属**：`tests/core.test.mjs` 按 t31 任务卡属 **out of scope**（我不能改），`src/shared/config.js` 属 t26/foundation-lead。
- **处置（主理人裁定：选项 a 授权扩写，已用 amend 把 `tests/core.test.mjs` 加入 t31 inScope）**：
  按"**必须参数化、不得只把 0 换成新的硬编码数字**"的硬要求，只改该条断言为**按 config 现算期望值**：

  ```js
  // 实时灯池按 config 现算（不写死数字 —— 语义常量 pin 死是过期断言的根源；t31 参数化修复）
  const tierLimit = Math.min(CONFIG.LIGHTING.lamps.maxRealtimePointLights, CONFIG.QUALITY.tiers.high.maxRealtimeLights);
  const expectedRealtime = (presetId) => {
    const scale = CONFIG.LIGHTING.presets[presetId].lampIntensityScale;
    return scale <= 0.02 ? 0 : Math.max(1, Math.round(tierLimit * Math.min(1, scale)));
  };
  assertEqual(described[0].lamps.realtime, expectedRealtime('goldenHour'),
    `盛世金辉实时灯池应为 round(min(config 上限, high 档上限) × goldenHour.lampIntensityScale) = ${expectedRealtime('goldenHour')}（当前 config: scale=…）`);
  ```

  - 该公式与 `src/core/environment.js` 的 `want = scale <= 0.02 ? 0 : max(1, round(tierMax × min(1, scale)))` 逐字一致，
    因此 config 再变（新增预设/改 scale/改上限）时断言自动跟随，不会再次过期；
  - **只动这一条**（未删除/未新增其它断言）：保留"夜景实时灯 > 0"（紧随其后）、"实时灯 ≤ min(config 上限, 质量档上限)"（下一个用例逐档断言）、
    "宫灯不投影 / 只一盏主方向光投影"等既有约束；
  - 实测：`node tests/core.test.mjs` → **通过 43 / 43**（exit 0）。

---

## 3. 未验证项 / 已知限制

1. **真实浏览器指针锁定下的 rotate**：本任务只在 Node 里用 `applyInput()` + 真实相机矩阵断言；浏览器内"鼠标拖动 → rotate → 同步读朝向"的端到端由 t13/V2 复核（G 侧已有 CDP 受信输入证据，本次语义变更使其绕法变为幂等可选）。
2. **G 侧代码未改动**（out of scope）：其 `stepRig()`（`rig.update(1/240)`）保留，已用用例证明其**幂等无副作用**（朝向不变、无位移）；`aimFailures` 留痕与真实朝向断言均在 G 侧文件里，未被本任务触碰。
3. **`describe().azimuthDeg` 的语义**：仍为"机位相对 target 的方位角"（= 视线方向的反向 bearing）；第一人称下的**视线方位角**请用新增的 `describe().viewDirection` 或 `rig.viewDirection()`（本回执 §2.1 已给出两者相差 180° 的断言）。若 V2 期望 `azimuthDeg` 直接等于视线 bearing，需要 CONTRACTS §6.4 明确后由 foundation-lead 统一（本任务不改语义以免破坏其它消费方）。
4. **`mode/viewMode` 一致性检查是防御性**：`state.patch()` 本身保证两者同步，因此该检查主要覆盖手工构造/外部注入的非法状态。
5. **过期断言的通用风险（建议）**：本次 L639 与 t19 改 config 时的 `layout.test.mjs` pin 是同一类问题 ——
   建议 CONTRACTS 增补："涉及 config 数值的断言必须**按 config 现算**，禁止把语义常量 pin 死在测试里"（§2.4 已按此改法落地）。

---

## 4. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

1. **§5.4 补一句口径**："进入第一人称时导览状态应为 `active === true && paused === true`（暂停≠停止）；`validateStateShape`
   对第一人称的互斥判定以 `active && !paused` 为准"。
2. **§6.4（相机装置交互）补**："`applyInput('rotate')` 必须在返回前把新方向**同步**写回 `target` 与相机矩阵；
   消费方可同步读取 `rig.viewDirection()` / `describe().viewDirection` / `camera.getWorldDirection()`，不得依赖'下一帧才生效'。"
3. **§8.3（验收）补一条通用纪律**："禁止用'尝试/失败计数器'代替真实结果断言（历史两次教训：rAF 裸字符串扫描误报、
   朝向校准计数器全零掩盖静默失效）；涉及相机朝向的验收必须以真实朝向向量点积（dot > 0.999）为准，并附还原旧实现的突变证明。"
