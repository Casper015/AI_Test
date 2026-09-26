# T3.5 回执 · KIT_VERSION → 1.0.1 与 mergeZone config 覆盖用法的文档化（t30）

> 归属：`kit-engineer`（t30）· 2026-09-26 · attempt 1
> 版本（当前有效组合）：`CONTRACTS v1.0.3` ⇄ `CONFIG_VERSION 1.0.2` ⇄ `LAYOUT_VERSION 1.0.0` ⇄ `STYLE_BASELINE v1.0.0` ⇄ **`KIT_VERSION 1.0.1`**
> 改动（仅 inScope）：`src/kit/index.js`（版本号 + JSDoc/注释，**零行为改动**）、本文件
> **未改动**：`src/kit/merge.js`、`src/kit/buildings.js`、`src/kit/geometry.js`、`tests/kit.test.mjs`、
> `docs/handoff-kit.md`、`docs/CONTRACTS.md`、`src/shared/**`、`src/zones/**`

---

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| `KIT_VERSION` | **1.0.0 → 1.0.1**（`export const KIT_VERSION = '1.0.1'`，`kit.version` / `kit.stats().version` 均随之） |
| 行为变更清单 | 已登记在实现文件的版本历史注释 + 本回执 §1（4 条：合批阴影标志、`buildStairs` 方向、门洞解耦（t22）、`bridge` 可选拱券参数） |
| `mergeZone(root, { config })` 覆盖用法 | 已写入 `src/kit/index.js` 的 JSDoc（`mergeZone` 与 `mergeByMaterial` 两处，见 §2） |
| 待并入 kit 总文档 | 3 项清单见 §3（**未直接改 `docs/handoff-kit.md`**，该文件不在 inScope） |
| 零行为改动证明 | `hall`/`stairs`/`bridge`/`courtyardGate` + 全城 67 槽 + 41 个材质键：**三角面/metrics/worldBounds/几何字节摘要逐位一致**，差异项 **0**（仅版本号变化），见 §4 |
| verify | `node tests/kit.test.mjs` → **633/633，exit 0**（≥633 ✔）；`KIT_VERSION` 打印 → **1.0.1**，exit 0 |
| 项目级 `run.mjs` | 按任务卡**不列入 verify**（并发期可能被他人 in-tree 测试染红；全绿由门禁 t12/t13/t14 负责） |

---

## 1. `KIT_VERSION 1.0.0 → 1.0.1` 行为变更清单（供 t14 与 CONTRACTS 版本表对齐）

> 说明：这 4 条**行为变更**发生在 t22/t25 两次修复中（当时 `src/kit/index.js` 不在它们的 inScope，故版本号未跟随）；
> t30 只做版本号与文档的补齐。**本次递升本身不改变任何几何/材质**（§4 逐位证明）。

| # | 变更 | 影响范围 | 证据（回执） |
| --- | --- | --- | --- |
| 1 | **合批网格阴影标志策略**：`mergeZone`/`mergeByMaterial` 的合批网格继承来源构件的 `castShadow`/`receiveShadow`，并统一走 `merge.shadowPolicy(config, part)`（全局开关 `LIGHTING.shadows.enabled`；水面不投影但接收）；`instance`/`instanceFromPoints` 默认投影+接收 | 全部区域（B/C/D/E/F）的建筑与摆件 | `docs/handoff-t3-repair-merge.md` §2；audit 阴影列 B 6→58 / C 0→49 / E 3→39 / F 11→60 |
| 2 | **`buildStairs` 台阶递升方向**：踏面 `(done+i+1)·stepHeight` → `rise − (done+i)·stepHeight`（贴台明最高、向远端递降），与丹陛御路同向 | 所有 `terraceH > 0.2` 的建筑内建台阶 + 直接调用 `kit.stairs` 的区域（C、E） | `docs/handoff-t3-repair-merge.md` §3（前后探针）；B 区 `alignStairFlights()` 不再触发 |
| 3 | **门洞与形制解耦**（t22，随 1.0.1 一并发布）：`hall`/`courtyardGate` 传入 `door`/`doorOpening`/`openFront` 即获得与 `layout.door.width` 一致的通行开口；`doubleEave` 不再因 kind 是"门"而降级；窗只由 kind 决定；新增 `metrics.opening = { width, height, openFraction, clearWidth, playerClearWidth, source }` | 全部带 `door` 的 18 个槽位 | `docs/handoff-t3-repair-door.md` §2/§3（前后探针 0.13m→4.786m 等） |
| 4 | **`kit.bridge` 新增可选拱券参数**：`archRadius`/`archRise`/`archCrownY`/`archClearance`/`archSpringY`/`referenceY`，默认值与原表达式逐位同式，回显 `metrics.arch` | 仅在使用新参数时生效（F 区未使用 → 几何完全不变） | `docs/handoff-t3-repair-merge.md` §4；§4 的 bridge 逐位一致证明 |

**供 t14 / CONTRACTS 对齐的一句话**：

> `KIT_VERSION 1.0.1`（对应 `CONFIG_VERSION 1.0.2` / `CONTRACTS v1.0.3` / `STYLE_BASELINE v1.0.0`）：构件库的几何与材质未变，
> 变的是**合批阴影标志继承**、**台阶递升方向**、**门洞与形制解耦**、**bridge 可选拱券参数**四项行为。

（同一份清单也已写入 `src/kit/index.js` 的 `KIT_VERSION` 版本历史注释，便于代码侧自解释。）

---

## 2. `mergeZone(root, { config })` 覆盖用法（已写入 `src/kit/index.js` JSDoc）

`src/kit/index.js` 中 `mergeZone` wrapper 的 JSDoc（原文，节选）：

```js
/**
 * 推荐：整区跨建筑合批（LOD 逐档合并，见 `src/kit/merge.js`）。
 *
 * 行为：把子树里所有普通 Mesh 按「材质 × 部位」合并，LOD 树**逐档**同样处理；
 * 合批网格**继承来源构件的 `castShadow`/`receiveShadow`**（并按阴影策略屏蔽水面投影），
 * 因此合批前后"投影三角面 / 投影部位集合"守恒（`tests/kit.test.mjs` §15 固化）。
 *
 * 选项：`{ name='kit-zone-batch', prune=false, epsilon=0.02, config=null }`
 *   - `config`：**阴影策略的覆盖入口**。本 wrapper 只把 `options` 原样透传给 `merge.js`，
 *     而 `merge.js` 内部以 `src/shared/config.js` 的 `CONFIG` 作为兜底（因为 wrapper 无法
 *     把调用方的 config 实例注入进去）。所以：
 *       · 不传 `config` → 用共享 `CONFIG`（默认行为，等价于 `config.LIGHTING.shadows.enabled = true`）；
 *       · 需要按**自定义/覆盖后的 config**（例如临时关闭阴影、或传入质量档相关的派生 config）执行时，
 *         必须显式写成 `kit.mergeZone(root, { config })`；直接 `kit.mergeZone(root)` 不会读取调用方的 config。
 *   - `prune`：合批后对每个网格做一次去不可见内部面（`removeInteriorFaces`）。
 *
 * @returns {{ root, batch, stats: { before, after, reduction, levels, buckets, mergedMeshes, instanced } }}
 */
```

`mergeByMaterial` 的 JSDoc 同步说明同一选项语义（`{ includeLOD=true, config=null }`，覆盖时写
`kit.mergeByMaterial(root, { config })`）；文件头用法示例也补了 `kit.mergeZone(root, { config })` 一行。

**行为验证**（t25 已固化在 `tests/kit.test.mjs` §15，本次未改测试）：
`kit.mergeZone(root, { config: {…shadows.enabled=false…} })` 后合批结果 **0 个投影对象**，
而默认 `kit.mergeZone(root)` 保留全部来源投影标志 —— 即"显式传 `config` 才生效，不传则用共享 `CONFIG`"。

---

## 3. 「待并入 kit 总文档 `docs/handoff-kit.md`」清单（**本次未改该文件**）

请主理人指派 `docs/handoff-kit.md` 的负责人并入以下 3 项（内容已就绪，可直接复制）：

| # | 待并入内容 | 建议落点 | 就绪来源 |
| --- | --- | --- | --- |
| 1 | **`kit.bridge` 可选拱券参数**：`archRadius`（水平半径，默认 `min(span×0.18, deckY + max(1.2, \|常水位\|×0.5))`）、`archRise`（矢高，默认=半径）、`archCrownY`（拱顶标高，默认 `deckY − deckT + archTube`）、`archClearance`（净空=拱顶到 `referenceY` 的高度，给出即优先）、`archSpringY`（拱脚，默认 `拱顶 − 矢高`）、`referenceY`（默认 `TERRAIN.moatWaterY`）；回显 `metrics.arch = { radius, rise, crownY, springY, clearance, referenceY, tube }`；**默认调用几何逐位不变** | §构件工厂参数表 / 新增「桥」小节 | `src/kit/buildings.js · makeBridge` JSDoc；`docs/handoff-t3-repair-merge.md` §4 |
| 2 | **台阶递升方向约定**：`kit.stairs`/内建台阶的踏面**贴台明（本地 +Z）最高、向远端（本地 −Z）逐级递降**，与同函数的丹陛御路同向；远景质量块的台阶体量同向；区域若自行做朝向规范化属冗余（B 区 `alignStairFlights()` 已自动不触发） | §形制/台阶小节（与 `MODULES.stairsStepHeight/stepsStepDepth` 同处） | `src/kit/geometry.js · buildStairs` 注释；`docs/handoff-t3-repair-merge.md` §3 |
| 3 | **`mergeZone`/`mergeByMaterial` 的选项与 `config` 覆盖语义**（含"wrapper 无法注入调用方 config，覆盖必须显式传 `{ config }`"）＋ **合批网格继承阴影标志**、合批后"投影三角面/部位集合守恒" | §合批/LOD 小节 | 本回执 §2；`tests/kit.test.mjs` §15 |

> 另建议在同一份总文档里把版本戳更新为 `KIT_VERSION 1.0.1`（当前总文档仍是 1.0.0 表述，属该文件负责人范围）。

---

## 4. 零行为改动证明（版本递增前后逐位一致）

### 4.1 方法学（可复现）

- **指纹对象**：`kit.hall`（B-hall-main 参数：w84/d48/bays9/terraceH4.5/doubleEaveHip/grade3/door26）、
  `kit.stairs`（width22/rise4.5/imperialRamp）、`kit.bridge`（width16/span34/deckY 取 config）、
  `kit.courtyardGate`（layout `C-gate-west` 全字段）；另加**全城 67 槽**与 **41 个材质键**（21 角色 + 9 MATERIALS id + 14 派生，含别名重复）。
- **摘要口径**：每个网格的 `part|materialKey|三角面|castShadow/receiveShadow|几何字节 SHA-256`（position+normal+uv 的 Float32 字节），
  逐行拼接后再取 SHA-256；`metrics` 与 `worldBounds` 做**整体 JSON 比较**（剔除 `version` 字段，版本号预期变化单独列出）。
- **排除项**：`material.uuid`、`geometry.uuid`、对象 `id`（每次运行不同）；**只剔除这三类**，颜色/粗糙度/金属度/clearcoat/envMap/贴图尺寸等全部计入。
- **确定性自检**：递增前连续跑两次指纹，`JSON.stringify` **完全相等**（说明摘要可复现，之后任何差异都可归因于改动）。
  指纹脚本本次以临时文件运行（`work/` 不在 t30 inScope，故未落盘），脚本原文附在 §4.4 便于复跑。

### 4.2 前后对比（真实输出）

```text
kitVersion: before= 1.0.0  after= 1.0.1

✓ hall           tri 11596 | meshes  54 | geoDigest 3289857f4af31f2a | drawCalls 25
✓ stairs         tri   372 | meshes   2 | geoDigest 497d7aea73062635 | drawCalls 2
✓ bridge         tri   720 | meshes   7 | geoDigest 6f7e63b5e89be09a | drawCalls 7
✓ courtyardGate  tri   852 | meshes  38 | geoDigest 47eebdd80ca6c66e | drawCalls 17

city 67 槽 digest: ee79b70be2680709 → ee79b70be2680709 (一致)
材质 digest: dd7cc4ae401642a9 → dd7cc4ae401642a9 (一致)
除版本号外的差异项总数: 0 → 几何/材质/统计零变化 ✓
版本字段（预期变化）: kit.version 1.0.0 → 1.0.1
```

| 对象 | 三角面（前→后） | drawCalls | 网格数 | 几何字节摘要（前→后） | worldBounds（前→后） |
| --- | --- | --- | --- | --- | --- |
| `kit.hall`（B-hall-main） | 11596 → 11596 | 25 → 25 | 54 → 54 | `3289857f4af31f2a` → 同 | `minX −44.052 / maxX 44.052 / minY 0 / maxY 25.635 / minZ −34.654 / maxZ 26.146` → **逐位相同** |
| `kit.stairs` | 372 → 372 | 2 → 2 | 2 → 2 | `497d7aea73062635` → 同 | `minX −11 / maxX 11 / minY 0 / maxY 4.747 / minZ −10.309 / maxZ 0` → **逐位相同** |
| `kit.bridge` | 720 → 720 | 7 → 7 | 7 → 7 | `6f7e63b5e89be09a` → 同 | `minX −9 / maxX 9 / minY −1.7 / maxY 1.92 / minZ −508.9 / maxZ −469.1` → **逐位相同** |
| `kit.courtyardGate`（C-gate-west） | 852 → 852 | 17 → 17 | 38 → 38 | `47eebdd80ca6c66e` → 同 | `minX −97.13 / maxX −82.97 / minY 0 / maxY 8.407 / minZ 113.1 / maxZ 134.9` → **逐位相同** |
| 全城 67 槽（几何+metrics 摘要） | 67 槽 digest `ee79b70be2680709` → **同** | — | — | — | — |
| 材质（41 键） | digest `dd7cc4ae401642a9` → **同** | — | — | — | — |

关键 `metrics` 抽样（前后一致，节选）：`hall.metrics.ridge = {length 25.920, y 24.711}`、
`hall.metrics.opening = {width 26, height 3.22, openFraction 0.18, clearWidth 4.68, playerClearWidth 0.7, source 'door'}`、
`stairs.steps = 30 / stepHeight 0.15 / runCount 1 / run 10.2`、
`bridge.metrics.arch = {radius 2.3, rise 2.3, crownY 1.1, springY −1.2, clearance 4.1, referenceY −3, tube 0.8}`、
`materials = 23 个共享材质 / 6 张贴图 / textureSize 32（测试覆盖值，默认仍 1K–2K）`。

### 4.3 唯一变化项

`KIT_VERSION`（`kit.version`、`kit.stats().version`、`KIT_VERSION` 导出）由 `1.0.0` → `1.0.1`；
`src/kit/index.js` 的另一处改动全部是**注释/JSDoc 文本**（版本历史块、`mergeZone`/`mergeByMaterial` 选项说明、文件头用法示例），
不含任何可执行逻辑分支。核对方式：`git diff` 不可用（本仓库无 VCS），改用"§4.2 指纹零差异 + 文件内仅注释与常量改动"双重证据；
读者可直接查看 `src/kit/index.js` 的 `KIT_VERSION` 区块与该文件的 diff 范围（仅 4 处文本块）。

### 4.4 指纹脚本原文（复跑用）

```js
// 用法：node <本脚本>.mjs   （脚本对同一个 kit 快照打印几何/材质逐位摘要；两次运行应完全相同）
import { createHash } from 'node:crypto';
const { createKit, THREE } = await import('<ROOT>/src/kit/index.js');
const { CONFIG } = await import('<ROOT>/src/shared/config.js');
const { SLOTS, SLOT_BY_ID } = await import('<ROOT>/src/shared/layout.js');

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const geoDigest = (mesh) => {
  const pos = mesh.geometry.attributes.position.array;
  const nor = mesh.geometry.attributes.normal?.array ?? new Float32Array(0);
  const uv = mesh.geometry.attributes.uv?.array ?? new Float32Array(0);
  return sha(Buffer.concat([
    Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength),
    Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength),
    Buffer.from(uv.buffer, uv.byteOffset, uv.byteLength),
  ]));
};
const objectDigest = (object) => {
  const rows = [];
  object.traverse((n) => {
    if (!n.isMesh && !n.isInstancedMesh) return;
    const t = Math.floor(n.geometry.attributes.position.count / 3);
    rows.push(`${n.userData.part ?? '-'}|${n.userData.materialKey ?? n.material?.name ?? '-'}|${t}|${n.castShadow ? 1 : 0}${n.receiveShadow ? 1 : 0}|${geoDigest(n)}`);
  });
  return { rows: rows.length, digest: sha(Buffer.from(rows.join('\n'))) };
};
const stripVersion = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.version; return c; };

const kit = createKit({ textureSizeOverride: 32 });
const objects = {
  hall: kit.hall({ id: 'B-hall-main', w: 84, d: 48, bays: 9, terraceH: 4.5, roofType: 'doubleEaveHip', grade: 3, facing: 'south', door: { width: 26, height: 3.22 }, quality: 'medium' }),
  stairs: kit.stairs({ id: 'ST-fp', width: 22, rise: 4.5, x: 0, z: 0, imperialRamp: true }),
  bridge: kit.bridge({ id: 'BRIDGE-south', width: 16, span: 34, deckY: CONFIG.TERRAIN.bridgeDeckY, x: 0, z: -489 }),
  courtyardGate: kit.courtyardGate({ ...SLOT_BY_ID['C-gate-west'], quality: 'medium' }),
};
const out = { kitVersion: kit.version, three: THREE.REVISION, objects: {} };
for (const [name, object] of Object.entries(objects)) {
  out.objects[name] = {
    ...objectDigest(object),
    triangles: kit.countTriangles(object),
    drawCalls: kit.countDrawCalls(object),
    metrics: stripVersion(object.userData.kit.metrics),
    worldBounds: object.userData.kit.worldBounds ?? null,
  };
}
const cityRows = SLOTS.map((slot) => {
  const o = kit[slot.kind]({ ...slot, quality: 'medium' });
  const m = o.userData.kit.metrics;
  return `${slot.id}|${slot.kind}|${m.roofType}|${m.triangles.near},${m.triangles.mid},${m.triangles.far}|${m.eaveHeight}|${m.totalHeight}|${JSON.stringify(o.userData.kit.worldBounds)}`;
});
out.city = { slots: cityRows.length, digest: sha(Buffer.from(cityRows.join('\n'))) };
const matRows = [];
for (const [key, mat] of kit.materials.map) {
  matRows.push(`${key}|${mat.name}|#${mat.color.getHexString()}|${mat.roughness.toFixed(6)}|${mat.metalness.toFixed(6)}|${(mat.clearcoat ?? 0).toFixed(6)}|${(mat.clearcoatRoughness ?? 0).toFixed(6)}|${mat.envMapIntensity}|${mat.map ? `${mat.map.image.width}x${mat.map.image.height}` : 'none'}`);
}
out.materials = { count: matRows.length, digest: sha(Buffer.from(matRows.join('\n'))) };
out.materialStats = kit.materials.stats();
console.log(JSON.stringify(out, null, 1));
```

---

## 5. verify 真实输出

```text
$ cd ".../imperial-palace copy 3" && node tests/kit.test.mjs
 · 分区 B: 220 → 31 draw calls / 42660 tri
 · 分区 C: 221 → 31 draw calls / 34784 tri
 · 分区 D: 242 → 28 draw calls / 30152 tri
 · 分区 E: 257 → 28 draw calls / 32128 tri
 · 分区 F: 269 → 31 draw calls / 51388 tri
 · 去内部面（测试殿）：4320 → 1149 三角形
 · 全 67 槽：近景三角面 191112，中景 114916，单栋最大 11596
 · totalHeight 偏差（kit 举架 vs layout 估值）：中位 26.7%，最大 38.6% (E-court1-hall)
 · 门洞解耦：layout 带 door 槽位 18 个全部获得开口，净宽最小 4.68m（门槛 0.7m）
 · 阴影守恒：投影网格 178 → 64；投影三角面 34656 守恒；接收 179 → 65
 通过 633 / 633，失败 0
exit=0            （断言数 633 ≥ 633 ✓，与 t25 交付时持平——本任务未删改任何断言）

$ node -e "import('./src/kit/index.js').then(m=>console.log('KIT_VERSION', m.KIT_VERSION ?? 'n/a'))"
KIT_VERSION 1.0.1
exit=0
```

（另一条辅助证据，非 verify 命令：`node scripts/audit.mjs` 仍为 exit 0「全部预算与契约检查通过」，
分区阴影列 B 58 / C 49 / E 39 / F 60，与 t25 交付时逐位一致 → 进一步证明本次是纯版本/文档改动。）

---

## 6. 未验证 / 边界

1. **`docs/handoff-kit.md` 未更新**（不在 t30 inScope）：其中的 `KIT_VERSION` 表述仍是 1.0.0，§3 的 3 项内容也尚未并入；
   需主理人指派该文件负责人（或后续任务）完成。**在此之前，kit 总文档的版本戳与实现不一致**，请勿据此判断构件行为版本。
2. **`docs/CONTRACTS.md` 未更新**（不在 t30 inScope）：契约 §3.4 只冻结 `ctx.kit` 的**名称**，未冻结 `KIT_VERSION`；
   §1 提供的"供 t14 对齐的一句话"可直接用于版本表补行。
3. **`metrics.opening`（t22 新增）与 `metrics.arch`（t25 新增）未写入 CONTRACTS**：它们不是 §3.4 冻结接口的一部分，
   属 kit 的附加字段；若下游（t9/t13）要依赖，建议由 t1 递增 CONTRACTS 版本后登记。
4. **浏览器实测未做**：本次是纯版本/文档改动，唯一的运行期可见差异是 `kit.version` 字符串；
   真实帧成本/阴影 pass 的实测仍归 t13（见 `docs/handoff-t3-repair-merge.md` §6）。
5. **`work/` 未新增文件**（不在 inScope）：§4.4 的指纹脚本以临时文件运行，原文已随本回执落盘，可按需复制到 `work/` 长期保留。
