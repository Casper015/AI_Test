# handoff · T2.8 修复 registry 连接登记空转（allConnectors 恒空 / 唯一 owner 校验失效）（t36）

任务：`t36`（repair，attempt 1）· 执行者：core-engineer（attempt_id `4c30b085-6c6e-49da-9964-88d810d3b618`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
基线：`CONTRACTS v1.0.7`（本卡执行期间由 foundation-lead 递增；本卡只引用、未改） ⇄ `CONFIG_VERSION 1.0.3` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `KIT_VERSION 1.0.1` ⇄ three r169

---

## 0. 开工回执（含 V1 报告的 file:line 定位对齐）

```text
来源：V1（t12）独立验证报告 §5 C-2（medium，owner t2/core）：
  · file:line 定位（V1 报告原文）：src/core/registry.js:379（连接登记循环读 data.connectors）
                                 src/core/registry.js:544（registerZone 只传 result.colliders）
  · 现象：registry.allConnectors() 恒为空、stats().connectors === 0；
          "连接 id 唯一 owner"校验形同不存在（32/32 唯一性在本次由 V1 独立复核补上）。

根因（机器可证）：连接登记循环挂在 registerColliders() 里，读的是**入参 data.connectors**，
而 registerZone() 只把 result.colliders 交给 registerColliders()（connectors 是 zone 结果的**顶层字段**）
→ 该 for 循环的输入恒为 [] → 分支**永不执行** → 静默失效（接口恒空 + 校验永不触发 + 无任何报错）。

可写范围（已严格遵守）：src/core/registry.js、tests/core-registry.test.mjs、docs/handoff-t2-repair-connectors.md。
未触碰：src/zones/**、src/interaction/**、src/kit/**、src/shared/**、tests/core-walls.test.mjs、
  tests/core-collision.test.mjs、tests/core-audit.test.mjs、docs/CONTRACTS.md。
verify 按任务卡只含本地两条命令（不含项目级 run.mjs）。
```

---

## 1. 修改点（`src/core/registry.js`）

| 位置（修复后行号） | 改动 |
| --- | --- |
| `:465` 新增 `registerConnectors(zoneId, list, { replace })` | **连接登记的唯一入口**：字段校验（字符串 id、有限 `position.x/z`）+ **唯一 owner 双校验**（声明侧：真实区域的 `owner` 必须等于登记区域；登记侧：同一 id 不得被两个 owner 登记）→ 违规抛 `RegistryError`（含 `detail.existingOwner/declaredOwner`）；同区域重复登记 = 幂等去重（`stats().connectorsDeduped` 计数）。 |
| `:230` 新增 `registerLayoutConnectors(layout.CONNECTORS)` | 把全城 32 条连接登记为**冻结基线**（`registrySource:'layout'`、`ownerZone:'LAYOUT'`），与既有视角/灯位基线同一模式 → **任何装配顺序**下 `allConnectors()` 都非空（不再出现"未装配 ⇒ 空集"）。 |
| `:632` `registerZone()` 显式登记连接 | `connectors: registerConnectors(zoneId, result.connectors ?? [], { replace }).accepted.length` —— **本卡的核心修复**（原 :544 处只传了 `colliders`）。 |
| `:390` `registerColliders()` 内的历史分支 | 保留向后兼容（`colliders.connectors` 负载），但改为**调用同一个** `registerConnectors()` → 不再存在"第二套、可被绕过的校验"。 |
| `:295` `unregisterZone()` 连接回滚 | 与视角/灯位一致：区域卸载时，被它遮蔽的基线连接**回滚**（`connectorBase`）而不是消失；区域自带的额外连接删除。 |
| `stats()` | 新增 `connectorOwners`（按 ownerZone 计数）与 `connectorsDeduped`，便于对账与回归断言。 |

新增 `tests/core-registry.test.mjs`（11 项）：基线在册、逐字段对账、真实装配 owner 接管、三类唯一 owner 反例、
32 条唯一性、零连接方向、分支执行方向、幂等方向、兼容路径。

---

## 2. 真实输出

### 2.1 `node tests/core-registry.test.mjs` → exit 0（11/11）

```text
[1. 修复：连接被真正登记（32 条且与 layout.CONNECTORS 逐字段一致）]
  ✓ 全新 registry：连接基线即在册（任何装配顺序都有 32 条）
  · 对账字段：id/name/kind/owner/position/width/elevation/elevationLow/walkable/gate；32 条逐条一致
  ✓ 逐字段对账：32 条与 layout.CONNECTORS 的 id/owner/position/width/elevation 完全一致
  · 装配后 owners={"F":15,"C":5,"D":2,"E":3,"B":7}（B7/C5/D2/E3/F15 与 layout 分区一致）
  ✓ 真实装配（灰盒 + B/C/E/F）：32 条且 owner 被真实区域接管，数量不变

[2. 唯一 owner 校验真的会报错（不是空转）]
  · 原始输出：RegistryError: 跨区通道 id 重复："CXN-x"（唯一 owner 规则：已由 owner="B" 登记，现又被 owner="C"（C）登记）
  ✓ 反例：同一连接 id 被两个 owner 登记 → RegistryError（附原始输出）
  · 原始输出：RegistryError: 连接 CXN-y 声明 owner="B"，却由区域 C 登记（唯一 owner 规则：声明 owner 必须等于登记区域）
  ✓ 反例：连接声明 owner 与登记区域不一致 → RegistryError
  · 原始输出：RegistryError: 跨区通道 id 重复："CXN-w"（唯一 owner 规则：已由 owner="B" 登记，现又被 owner="B"（D）登记）
  ✓ 反例：两个真实区域抢同一 id（声明 owner 相同）→ RegistryError
  ✓ 当前 32 条全部唯一：id 唯一、每条恰好一个 owner 且 owner 与声明一致

[3. 双向回归：零连接方向 + 分支执行方向（防再次退化为空转）]
  · 零连接方向：Z0（connectors: []）与 Z1（无 connectors 字段）后均为 32 条
  ✓ 零连接方向：登记不含连接的区域后 allConnectors() 不得退化为空集
  ✓ 分支执行方向：registerZone 必须真正登记 result.connectors（owner 接管 + 可增可删）
  ✓ 幂等方向：同区域重复登记同一条 = 去重不报错，总数不变
  · 兼容路径唯一 owner 复检：RegistryError: 跨区通道 id 重复："CXN-compat"（唯一 owner 规则：已由 owner="B" 登记，现又被 owner="C"（C）登记）
  ✓ 兼容路径：把 connectors 塞进 colliders 负载也走同一套校验（不绕开唯一 owner）

---------------------------------------------------------
 通过 11 / 11
---------------------------------------------------------
```

### 2.2 关键量化（修复前 → 修复后）

| 指标 | 修复前（V1 §5 C-2 实测） | 修复后 |
| --- | --- | --- |
| `registry.allConnectors().length` | **0**（恒空） | **32**（= `layout.CONNECTORS`，逐字段一致） |
| `stats().connectors` | **0** | **32**（`connectorOwners`：装配前 `{LAYOUT:32}`；装配后 `{B:7,C:5,D:2,E:3,F:15}`） |
| "唯一 owner"校验 | **永不执行**（无输入 ⇒ 无报错）——静默失效 | 三类违规均抛 `RegistryError`（见 §2.1 原始输出） |
| 区域新增连接 | 无法登记（分支空转） | 32 → 33 可增；`unregisterZone` 回滚 → 32 |
| 区域卸载后 | —（本来就空） | 被遮蔽的基线连接**回滚为 LAYOUT**（32 条不减） |

### 2.3 `node scripts/audit.mjs` → exit 0

```text
 主场景绘制调用   : 293 / 上限 350  ✓
 结论：全部预算与契约检查通过
```

（连接登记是纯数据，不产生 Object3D / 绘制批次；审计数字与 t28/t35 一致。）

### 2.4 突变证明（把缺陷还原 ⇒ 回归必须失败）

```text
操作：把 registerZone() 里的 `connectors: registerConnectors(zoneId, result.connectors ?? [], { replace }).accepted.length,`
      一行删除（即还原 V1 报告描述的"只传 colliders"缺陷）。
sha256(修复版) = a18233db3cb9f19466dfe60dcc5f19e08ff99c1d0076444ae5055e9981b4c9c1

node tests/core-registry.test.mjs  → 通过 9 / 11，失败 2（exit 1）
  ✗ 真实装配（灰盒 + B/C/E/F）：32 条且 owner 被真实区域接管，数量不变
      B 应接管 7 条连接：期望 7，实际 0
  ✗ 分支执行方向：registerZone 必须真正登记 result.connectors（owner 接管 + 可增可删）
      B 的 7 条必须被登记到 B 名下（若分支再次空转，这里会是 0 → 本断言即守卫）：期望 7，实际 0

还原后：sha256 = a18233db3cb9f19466dfe60dcc5f19e08ff99c1d0076444ae5055e9981b4c9c1（逐位一致）
node tests/core-registry.test.mjs → 通过 11 / 11（exit 0）
```

→ 说明回归用例锁的是"**登记分支真的执行**"，不是"接口恰好返回了数据"。

### 2.5 影响面自查（非本卡 verify）

```text
core.test 43/43 · core-walls 18/18 · core-collision 20/20 · core-camera 9/9 · core-audit 10/10
zones.test 40/40 · interaction.test 49/49 · audit.mjs exit 0
```

---

## 3. 为什么长期未暴露（静默失效的成因，供 CONTRACTS/复核参考）

1. **无输入 ⇒ 无输出、无报错**：连接登记循环的判据来自入参 `data.connectors`，而 `registerZone` 从未传它。
   一个"只在有数据时才做校验"的分支，在数据源接错的情况下表现与"一切正常"完全相同 —— 不会有异常、不会有日志、不会有非零退出码。
2. **没有任何调用方读 `allConnectors()`**：G 的导览/小地图若改用 registry 取连接会立刻拿到空集（本卡前未发生，属侥幸）；
   区域自身是从 `zoneLayout.connectors` 直接取切片，因此装配链路"看起来完全正常"。
3. **唯一 owner 校验的唯一入口就是那个分支**：分支不执行 ⇒ 校验等于不存在，而"没有报错"被误读为"没有冲突"。
4. **回归用例方向单一**：此前没有"零连接"与"重复 owner"两个方向的断言，也就没有任何测试能在分支空转时变红。
   本卡补齐两个方向（§2.1 第 3 节）+ 突变证明（§2.4）。

---

## 4. 未验证项 / 已知限制

1. **消费方接入未做**：G（t9）的导览/小地图/跨区提示若要从 registry 取连接，请改用 `registry.allConnectors()`
   （32 条、带 `ownerZone`）；本卡不改 `src/interaction/**`（out of scope），仅保证数据可用。
2. **`replace` 选项对连接的效果**：`registerZone(..., { replace: true })` 会先 `unregisterZone`（连接回滚到基线）再登记，
   因此"区域热替换"后连接 owner 正确归属于新登记方；未单测"replace 时区域自带新连接被删除"的极端组合（当前无消费方）。
3. **城市级装配器回显语义**：`GREYBOX`/`LAYOUT` 回显一条**已被真实区域接管**的连接时按幂等处理（保留更具体的 owner，不报错）；
   真实区域之间抢同一 id 仍报错。若将来有"城市级覆盖真实区域"的需求，需要显式 increase 语义（当前无此需求）。
4. **`connectorsDeduped` 计数**：累加在 registry 级别（`stats().connectorsDeduped`），非每次调用重置（与 `counter.rejected` 同风格）。
5. **性能**：连接登记为纯数据（32 条），审计/绘制批次零变化（§2.3）。

---

## 5. 给 CONTRACTS 的建议（正文由 foundation-lead 采纳，我未改 CONTRACTS）

> **§3 区域契约补充（连接登记）**
> 1. `createZone()` 返回值中的 `connectors` 必须在 `registerZone()` 内被登记（`registry.allConnectors()` / `stats().connectors`），
>    不得只登记 `colliders`；`layout.CONNECTORS`（当前 32 条）由 core 作为**冻结基线**登记，区域注册时接管 owner，卸载时回滚。
> 2. **唯一 owner 规则**（强制）：同一 `connector.id` 只能有一个 owner；真实区域不得登记 `owner !== zoneId` 的连接；
>    违规必须抛 `RegistryError`（含 `existingOwner`/`declaredOwner` 明细），禁止静默忽略或静默覆盖。
> 3. **静默失效防御**：任何"只在有数据时才执行的校验"都必须配套"数据确实流入"的断言（本卡的双向回归：零连接方向 + 分支执行方向），
>    并在装配后对**总数**做对账（`stats().connectors === layout.CONNECTORS.length`）。
