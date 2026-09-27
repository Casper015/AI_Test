# 交付回执 · 契约登记 `door.passable` / `door.blockedBy`（t118 / T1.42）

> ROOT：`imperial-palace-dsh-1.1b` · attempt `7b93d910-52f4-42eb-8aab-28e99ac4b54c`
> 性质：**只做契约文本 + 版本**（`docs/CONTRACTS.md`）+ 本回执；**未触碰** `src/**`、`tests/**`、`scripts/**`；**未调整任何阈值或断言**。

## 1. 本次递增（`CONTRACTS v1.0.15 → v1.0.16`）
新增 **§5.2.3**，登记 t117 落地在门规范中的两个字段：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `door.passable` | `boolean` | 门洞**实际可通行性声明**（`false` 时必须同时有具名 `blockedBy`） |
| `door.blockedBy` | `string \| null` | **具名阻挡者 id**（默认 `null`；被阻断时 = 该整足迹障碍 id，如 `WB-D-pond`） |

**核心约束（写入契约）**：
1. **“门洞可通行性声明必须与实际一致”**：登记几何门洞（`door.width > 0`）**不等于**声明可通行；
2. 被具名障碍阻断时**必须**记 `blockedBy`，**不得**留“登记可通行、实际不可通行”的误导性数据；
3. **消费方（提示 / 验证 / 巡游 / 取景）一律读 `passable`/`blockedBy`，不得自行从几何推断**；
4. “不可通行”**不得**退化成静默整足迹阻挡（`blocks:'all'` 且无原因）——具名 `blockedBy` 即可见原因（与 §6.1 “未走进必须有具名原因”一致）。

## 2. 实例（t117，契约内已附表）
`D-court3-pavilion` / `E-court3-pavilion`：`door.width = 8m` 但 **`passable = false`**、**`blockedBy = WB-D-pond / WB-E-pond`**（亭体整体位于水池足迹内 ⇒ 实际净宽 0.0m）；其余 8 座亭 `passable = true`、`blockedBy = null`。

## 3. 运行时核对（真实输出，证明契约文本 = 运行时）
```bash
$ node -e "import('./src/shared/layout.js').then(L=>{const M=L.default??L;const tr=(M.WALKABLE||[]).filter(w=>String(w.id).includes('-transition')).length;console.log('LAYOUT',M.LAYOUT_VERSION,'WALKABLE',M.WALKABLE.length,'transition',tr);for(const id of ['D-court3-pavilion','E-court3-pavilion']){const s=M.SLOTS.find(x=>x.id===id);console.log(id,'passable=',s.door&&s.door.passable,'blockedBy=',s.door&&s.door.blockedBy,'width=',s.door&&s.door.width);}})"
LAYOUT 1.1.11 WALKABLE 157 transition 43
D-court3-pavilion passable= false blockedBy= WB-D-pond width= 8
E-court3-pavilion passable= false blockedBy= WB-E-pond width= 8
```
⇒ 与 §5.2.3 表**逐值一致**；**`WALKABLE 157` 未变**（本卡未动任何几何）。

## 4. 历史与纪律
- **历史只追加**：§5.2.3 明确记载“本字段自 `LAYOUT 1.1.11`（t117）起存在；`LAYOUT ≤1.1.10` 期间门规范无可通行性声明（当时下游只能自行推断，正是 t77-F5 的成因）”，旧条目保留未删改；修订记录只追加 v1.0.16。
- 本卡**未触碰** `src/**`、`tests/**`、`scripts/**`、`docs/STYLE_GUIDE.md`；**未调整任何阈值/断言**；契约前缀的 `CONTRACTS v1.0.15` 条目按历史保留。

## 5. verify（原样，两条）
```
$ grep -n "passable\|blockedBy" docs/CONTRACTS.md | head -8
  → 命中 §5.2.3 标题、字段表两行、核心约束三处、实例表两行、历史声明行
$ node -e "…（见 §3）"
  → LAYOUT 1.1.11 WALKABLE 157 transition 43；两座亭 passable=false / blockedBy=WB-{D,E}-pond / width=8
```
