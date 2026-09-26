# 交付回执 · E 东宫苑（`east-courts`）

## 1. 任务信息

- **任务 ID / Agent**：E 东宫苑（分区 `east`）
- **可写文件**（本次只改这两个）：
  - `src/zones/east-courts.js`（由 11 行 greybox 占位替换为真实实现）
  - `docs/handoffs/e-east-courts.md`（本文件）
- **只读依赖**：`imperial-palace-plan.md`（§3 风格 / §5.4 东西宫苑 / §6 接口 / §8 验收）、`docs/TASK_BRIEF.md`、`docs/STYLE_GUIDE.md`、`docs/CONTRACTS.md`、`src/shared/config.js`、`src/shared/layout.js`、`src/kit/index.js`、`src/zones/forecourt.js`、`src/zones/inner-palace.js`
- **基线版本**：`STYLE_VERSION = v0.9`、`CONTRACTS v0.9`

## 2. 区域边界与接口

- 区域边界（`layout.ZONES.east`）：`X ∈ [115, 290]`、`Z ∈ [-340, 285]`
- 导出：`export async function createZone(ctx)`；`export const STUB = false;`
- 返回字段齐全：`{ root, buildings, connectors, colliders:{obstacles,surfaces}, viewpoints, lightAnchors, update, dispose }`
- 登记连接（`owner === 'east'`，与 `layout.CONNECTORS` 对齐）：
  - `conn.forecourt-east` @ `(112, -180)`
  - `conn.inner-east` @ `(117, 180)`
- 机位（id 与约定完全一致）：
  - `zone.east`（mode `zone`，参数取自 `layout.ZONE_VIEWS['zone.east']` = position `[430,158,-40]` / target `[205,8,-70]` / fov 40）
  - `fp.east`（mode `fp-spawn`，出生点 `[117,0,-100]`，站在西侧御道 `ground.east` 上，朝东面向院落）
- 灯位 `lightAnchors`（10 条）：四座正殿、两座方亭（lantern），四院铜炉（censer）。

## 3. 使用的 kit 与材质

- **构件工厂**：`kit.building(slot)`（分发 `hall`/`sideHall`/`courtyardGate`/`pavilion`）、`kit.wall`、`kit.corridor`、`kit.slabRect`、`kit.stairs`、`kit.treeCluster`、`kit.props({kind:'censers'|'lion'|'banner'|'lantern'|'rock'|'pond'})`、收尾 `kit.mergeStatic(root)`。
- **材质**：全部来自 `kit.materials`（= `config.PALETTE`）——`roofGold/roofGoldDark/ridge/wallRed/wallRedDark/stone/stoneDark/stoneSide/paving/pavingWarm/caihuaGreen/caihuaBlue/wood/woodDark/water/rock/bronze/lanternRed` 等，未自定义任何颜色或材质。
- **根因修复已信任**：主 Agent 已修复 `kit/index.js` 单檐 `hall()` 漏传 `h` 的 NaN 屋顶，以及 `merge.js` 实例父级变换丢失问题。因此本实现**未**写任何剔除 NaN 网格 / 补屋顶 / 手工烘焙实例世界变换的兜底代码，直接信任 `kit.building()` 与 `kit.mergeStatic()`。

## 4. 实现概述（东宫苑）

- **四组可识别院落**（`cz ∈ {-250,-100,50,200}`，对应 `COURTYARDS court.e1..e4`）：每院含 **院门**（`e.cN.gate`）、**正殿**（`e.cN.main`，major 单层白石台基）、**南北配房**（`e.cN.side-n` / `e.cN.side-s`）、西侧南北**御道**与进院石道；`layout.SLOTS.east` 的 **16 个槽位全部落地**，另加两座真实方亭（非拆件虚增），共 **18 栋**。
- **主题**（展示设定，不作史实断言）：一院「文华」、二院「陈设」、三院「起居」、四院「花木」。
- **院内墙与道路（本区负责）**：`kit.wall` 围合（北/南/东内墙 + 西院墙两段），院门处留东西向 6 m 门洞通道；`kit.slabRect` 铺出西侧南北御道、各院进院石道、便门衔接支路（分层 `y` 偏移避免共面闪烁）；`ctx.corridors` 四列南侧廊庑并登记廊顶障碍盒。
- **水景/陈设**：三院设水塘（`props pond` + 障碍盒），四院组合松柏与阔叶树（拒绝采样避让建筑/墙/路/水）、石灯、铜香炉、石狮、旗幡、假山。
- **正殿可走性**：正殿登记 `terrace` 可行走面（y=1.8，与 `kit.TIERS.major.terrace` 一致）并在西侧（朝向院落）加 **4 级台阶（每级 0.45 m ≤ `config.FP.step` 0.55）**，登记为 `stairs` 可行走面；殿身实体仅阻挡台基面以上，使台基可站立。

## 5. 登记数据统计

| 项目 | 数值 |
| --- | --- |
| 建筑数 `buildings` | **18**（16 槽位 + 2 方亭） |
| 障碍盒 `obstacles` | **63** |
| 可行走面 `surfaces` | **21**（`ground` 1 + `terrace` 4 + `stairs` 16） |
| 机位 `viewpoints` | **2**（`zone.east`、`fp.east`） |
| 灯位 `lightAnchors` | **10** |
| 三角面（标准测试口径） | **33670**（阈值 900000） |
| 台阶每级高差 | 0.45 m（0 处超限） |
| `surfaces.y` 非有限 | 0 |
| 建筑几何 NaN 网格 | 0（世界包围盒全部有限） |

## 6. 与西宫苑 D 的差异化说明

（D 并行开发；以下为 E 侧不依赖 D 成品的设计取向，避免机械镜像）

- **格局节奏**：E 以一条西侧南北**御道**串联四院，院落再**向东进深**展开；四院各设「院门—横路—正殿」的递进，并在院内叠加方亭/水塘形成次级空间，而非简单对称复制。
- **植物**：E 侧重**阔叶（文华/花木主题）为主、松柏为辅**（约 58% 阔叶），与西侧更庄重的松柏取向区分。
- **水景/亭廊**：E 在三院设院内**水塘**，在一/四院设**方亭**；廊庑仅置于各院南侧，方位与体量与常见西侧布局不同。
- **摆件组合**：E 采用「**石狮（院门）＋铜香炉（正殿台阶前）＋旗幡（院门）＋成列石灯＋假山（院东北/东南角）**」的固定组合，密度与位置自成一格。
- **统一约束**：色调、开间模数、屋顶等级、材质**全部**取自 `kit.materials`（`config.PALETTE`），与 B/C/D/F 完全一致——差异只体现在布局、植栽与陈设，不在风格语言。

## 7. 实际执行的命令与原始结果

```bash
cd "/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace copy 2"
node --check src/zones/east-courts.js
# → （无输出，退出码 0）

node tests/zones.test.mjs
# →   forecourt: 建筑 13，障碍 29，可行走面 35，机位 3，三角面 26632
#     inner: 建筑 8，障碍 31，可行走面 13，机位 3，三角面 17102
#     west: 建筑 20，障碍 61，可行走面 77，机位 2，三角面 33281
#     east: 建筑 18，障碍 63，可行走面 21，机位 2，三角面 33670
#     garden: 建筑 7，障碍 19，可行走面 28，机位 2，三角面 21116
#     boundary: 建筑 8，障碍 28，可行走面 69，机位 2，三角面 18245
#     zones 通过：实测 6 个区域，跳过 0 个（灰盒）
# → （退出码 0；全过程无 NaN 警告）
```

补充自检（临时脚本，仅本地运行，未写入项目）：对 `createZone` 输出做几何扫描，结果 `NaN meshes: 0`、`NaN world bbox: false`、`stair flights: 4 step violations: 0`、`surfaces nonFinite: 0`、`out-of-zone(+30): 0`，`fp.east` 出生点落在 `ground.east@0` 且未被障碍阻挡；6 个分区的自检项全部通过。

## 8. 未验证 / 已知问题

- **未做视觉/截图验收**：本任务未运行 `scripts/serve.sh` 与 `scripts/shot.mjs`（需浏览器与 HTTP 服务），因此 `zone.east` 机位取景、材质观感、昼夜表现**未做图像核对**，仅保证数据与几何正确。
- **朝向沿用冻结槽位**：`layout.SLOTS.east` 的 `rot=270` 经 three.js 语义解析为正面朝 **+X（东）**（`kit.building` 原样应用 `slot.rot`，layout/kit 为只读）。即东侧正殿的装饰性正面朝外宫墙一侧；本实现已在朝向院落（西）一侧补建台阶与台基可行走面，使院内保有完整的进入序列。此为冻结布局与 `CONTRACTS.md` 朝向描述（「270 朝西」）之间的既有差异，属**只读共享文件的范围**，已记录，未在 E 内改动。
- **G 的 FP 步态**：可行走面与障碍盒已按契约登记，但第一人称实际走查（穿越院门洞、上下台阶）依赖 G 的相机装置，本任务**未验证**。
- **灯位仅登记**：`lightAnchors` 只提供数据，实际点光由统一环境系统生成，夜景表现**未验证**。
- **F 边界**：外宫墙在 `x=300`、护城河在墙外，E 只在其东侧内院（`REAR_X=286`）以内造景；跨区视觉连续性需主 Agent/ F 集成核对。
