# 交付回执 · 契约递增：内景机位口径 + passage 语义（t81 / T1.28；F6 裁定 a）

> ROOT：`imperial-palace-dsh-1.1b` · attempt `7531b410-0a72-472f-aec0-1bb091dc9f00`
> 性质：**只改契约文本与版本**（`docs/CONTRACTS.md` + 本回执）。未触碰 `src/**`、`tests/**`、`docs/STYLE_GUIDE.md`。

## 1. 本次递增（`CONTRACTS v1.0.11 → v1.0.12`）
1. **§5.2 内景机位口径**：由「B 与 C 各额外 1 个 `interior`（金銮殿、寝殿）」→ **「每栋可进入建筑 1 个 `interior` 机位」**，并写明集合 **43 栋 = 殿 14 + 配殿/配房 23 + 门殿 6**（排除 4 角楼 Q3 / 10 亭 / 10 院门），映射由 `INTERIOR_BY_SLOT`（43 条）显式给出。
2. **§6.1 的 `passage`**：t79 已增补 kind 列表与 §6.1.1 语义（门洞通道面：连接室内外、宽 = `doorWidth`、`y = door.sillY`、**不参与内景相机包围盒**）——本卡**确认一致**，未重复改写；仅在本回执与 §5.2.1 引用。
3. **新增 §5.2.1 对照表**（与 `LAYOUT 1.1.4` 实测逐条对齐，含取代关系）。
4. **历史只追加**：旧口径保留并附**时点声明**（`LAYOUT 1.0.0`~`1.1.0` 期间为真值，自 `1.1.1`~`1.1.4`（t72/t73/t74）起被取代）；修订记录**只追加** v1.0.12 条目。

## 2. 运行时核对命令与真实输出（证明文本 = 数据）
```bash
$ node -e "import('./src/shared/layout.js').then(L=>console.log('LAYOUT',L.LAYOUT_VERSION,'walkable',L.WALKABLE.length,'vp',L.VIEWPOINTS.length,'interiors',Object.keys(L.INTERIOR_BY_SLOT||{}).length,'connectors',L.CONNECTORS.length,'walls',L.WALLS.length,'slots',L.SLOTS.length,'courtyards',L.COURTYARDS.length,'fp',L.FP_ROUTE.length,'par',L.WALKABLE.filter(w=>w.kind==='passage').length))"
LAYOUT 1.1.4 walkable 112 vp 61 interiors 43 connectors 32 walls 60 slots 67 courtyards 14 fp 50 par 43
```
⇒ 与 §5.2.1 对照表**逐值一致**；`passage` 43 条与 §6.1/§6.1.1 一致。

## 3. 不得夸大（与 t77 / t69 的边界）
- 本次只同步**契约文本与版本**；
- **“43 栋是否在真实碰撞图上可达”由 t77 按生产口径（含 connector 台阶）逐栋独立复验**，本卡**不宣称“43 栋均已可进入”**；
- **几何上是否真开门洞**仍归 **t69**（kit 正面门洞）+ **三区**落开 + **t66** 端到端复核。

## 4. 串行与范围
- 与 **t79**（同改 `docs/CONTRACTS.md`）**串行**：进入本卡时文件已是 v1.0.11（t79 的 §6.1/§6.1.1 已在），本卡在其上追加 v1.0.12；
- 改动仅 inScope 两路径：`docs/CONTRACTS.md`、`docs/handoff-contracts-interiors.md`。
