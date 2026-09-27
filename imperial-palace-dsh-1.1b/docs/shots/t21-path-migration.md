# t21 证据路径迁移声明（只读复核记录，t111）

> **本文件是新增的声明记录，不修改 `docs/shots/` 下的任何既有产物（PNG / manifest / README 一律未改）。**
> 生成者：core-engineer · 任务 `t111`（repair 后继，`sourceTaskId = t21`）· 只做"存在性 + sha256"复核。

## 1. 路径迁移事实

平台 `Delivery: blocked` 记录的是 **`imperial-palace copy 3/docs/shots/t2-*-night|dusk.png`（11 条）**，
这是 **ROOT 目录重命名之前**的路径字符串：

- 旧：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 3`
- 新：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`

实测：**旧路径目录已不存在**（`ls -d "…/imperial-palace copy 3"` → `No such file or directory`），
而 11 张产物**全部存在于当前树**（下表，sha256 为本次实算，文件未被改动）。

## 2. 11 张产物的当前树核实（t21 交付：night×8 + dusk×3）

| 文件（当前树相对路径） | 字节 | sha256 | mtime |
| --- | --- | --- | --- |
| `docs/shots/t2-oblique-night.png` | 187,060 | `eeb60f4435ea53c17c40a8832d2a11ce6d575ab33ff2b6e43571c577bb51db9e` | 09-26 14:23 |
| `docs/shots/t2-iso-night.png` | 317,407 | `3f733bc3ff51bb1d00ac8ae3d38ced8384692d70031a236d886d3e02fc5f8472` | 09-26 14:25 |
| `docs/shots/t2-axis-night.png` | 386,607 | `7a2186c098cd44dccadf5c42c0124cc3c2cfae8bdbf1fed1af903ce194978638` | 09-26 14:26 |
| `docs/shots/t2-zone-night.png` | 187,066 | `b9a4075c590ec4e964624e6abb95e04adee7e309f839fec7ee9043da4bd73161` | 09-26 14:28 |
| `docs/shots/t2-focus-night.png` | 690,019 | `f73727baadecee0a7c8a7c96487caccdd36df0892d0a024cb91c748a6b94034d` | 09-26 14:30 |
| `docs/shots/t2-interior-night.png` | 612,533 | `130803a4b092b5e0920c5baf231d9e512bedfa56f0f5f0acdee0730bdcbaf2ac` | 09-26 14:35 |
| `docs/shots/t2-fp-night.png` | 175,116 | `33e233566ac074d7ff14ca78c9c70132cb9807d5493940cd7d489358a95452c9` | 09-26 14:38 |
| `docs/shots/t2-orbit-night.png` | 695,734 | `1c1fc8c0313a49a6a08ccb7e0079b40f5f08ced1763f9a8b5e09eca295697b2a` | 09-26 12:16 |
| `docs/shots/t2-oblique-dusk.png` | 237,715 | `9055c5a487cd08a9b71720c4df8b63c44d8f58efd44c1c8f185364c6f30d59d3` | 09-26 14:22 |
| `docs/shots/t2-iso-dusk.png` | 384,201 | `81c51980e40fe3bad14729042b415c73b0fa57185da2fff36a78d493c7ff1f52` | 09-26 14:24 |
| `docs/shots/t2-zone-dusk.png` | 237,702 | `fb67115489ff6c34fbd0c87433ed08991c72e85b58bff11b6afdd2d869a3b67e` | 09-26 14:28 |

（t21 回执原文：`night×8 + dusk×{oblique,iso,zone}` 共 **11 张**，与本表逐项一致。）

## 3. 旧路径记录为什么无法由本卡"声明覆盖"（机制解释，不作清除声明）

1. **平台账本记的是字符串快照**：`t21` 完成时写入的路径以当时的 ROOT 名（`imperial-palace copy 3/…`）为前缀，
   记录在团队状态的完成记录里（只读诊断可见 14 条旧路径字符串，含本卡 11 张 + 任务卡文本中提到的其它 dusk 名称）。
2. **新卡的 changedPaths 只能声明"当前树相对路径"**（`imperial-palace-dsh-1.1b/docs/shots/…`）——
   字符串与旧快照**不相等**，平台的 `unaudited path` 比对按**字符串/文件身份**匹配 ⇒ **无法匹配即无法消解**。
3. **`t21` 是终态 failed**：平台不会对终态任务重跑产物审计；后继卡（本卡）的声明只作用于**本卡自己的**路径集合。
4. ⇒ **本条记录在"不改平台账本/不改历史任务记录"的前提下无法被清除**，本卡**不作"已闭合"声称**。

**建议处置（交主理人裁定，任选其一）**：
- (a) 在账本收口卡（`docs/handoff-ledger-closeout.md` 所属线）里把 t21 的 11 条旧路径**逐条映射**到本表的当前树相对路径，并标注"ROOT 重命名导致的前缀迁移"；
- (b) 由平台/主理人侧对历史完成记录做**一次路径前缀重写**（旧 ROOT 名 → 新 ROOT 名），使后续审计可解析；
- (c) 明确以"历史快照不可重解析"归档该 11 条，并在最终交付说明里附本表作为**可复核替代证据**。
