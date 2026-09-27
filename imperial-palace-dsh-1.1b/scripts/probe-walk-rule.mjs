#!/usr/bin/env node
/**
 * `scripts/probe-walk-rule.mjs` —— **只读探针**：同一平面位置上"取高面"导致的低面被压（t132）
 *
 * 背景（t131 的机制结论）：C 两栋 `通道面@1.7 ↔ 室内面@1.7` 与 B 两栋 `室内面@1.5` 的**面级链完整、
 * 每跳都在台阶带内**，但生产图在"同一平面位置"上取到**更高的面**（`tier2@3.0` / `C-bed-terrace@2.4`）
 * ⇒ 低面那一跳被拒。真因在 core 的**高程/站立解析**（`layout.floorYAt` 取最高面）。
 *
 * 本脚本**不做任何写入**：只 import 生产模块、只读 layout/config、只调用 `createWalkSolver` /
 * `createWalkGraph` 的**只读**接口，输出：
 *   ① 机制证据（file:line 级：`floorYAt` 的取高规则 + 图节点高度来自 `solver.probe`）
 *   ② 全城扫描：每一处"低面被同位置高面压住"的位置（含 `cellSize:1` 生产图的格集合/相邻格对/`canStep`）
 *   ③ 全部门洞链的 `probe` / `path` 结论（按"是否影响可达性"分类）
 *   ④ 最小复现（`B-side-west-main` / `C-side-west-main`）：失败跳 + 两侧解析高程
 *   ⑤ 两案量化对比（(a) 改取高规则的影响面/风险/需增断言；(b) 继续开槽的剩余位置与几何量）
 *
 * 用法：`node scripts/probe-walk-rule.mjs [--json] [--cell=1] [--area=all|doors]`
 * 退出码：0（探针本身成功）；若生产模块无法加载则 2。
 */

import { loadModule } from '../tests/harness.mjs';

const argv = process.argv.slice(2);
const argValue = (n, d = null) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const AS_JSON = argv.includes('--json');
const CELL = Number(argValue('cell', '1'));
const THOROUGHFARE_KINDS = ['passage', 'interior', 'threshold', 'transition', 'terrace', 'terraceStep'];
const EPS = 1e-6;

const LAYOUT = await loadModule('src/shared/layout.js');
const CONFIG = await loadModule('src/shared/config.js');
const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');

const out = [];
const say = (line = '') => {
  out.push(line);
  if (!AS_JSON) console.log(line);
};

/** 覆盖某点的所有可行走面（按 y 降序）。 */
function surfacesAt(x, z) {
  const hits = [];
  for (const s of LAYOUT.WALKABLE) {
    const r = s.bounds;
    if (x >= r.minX - 1e-9 && x <= r.maxX + 1e-9 && z >= r.minZ - 1e-9 && z <= r.maxZ + 1e-9) hits.push(s);
  }
  hits.sort((a, b) => b.y - a.y);
  return hits;
}

/* ------------------------------------------------------------------ *
 * ① 机制证据
 * ------------------------------------------------------------------ */
const solver = createWalkSolver({ config: CONFIG, layout: LAYOUT });
const graph1 = createWalkGraph(solver, { cellSize: CELL, layout: LAYOUT, config: CONFIG, maxCells: 3_000_000 }); // 全城 1m 图 > 默认 40 万格上限（只读使用）
const graph2 = createWalkGraph(solver, { cellSize: 2, layout: LAYOUT, config: CONFIG });

say('='.repeat(78));
say(`t132 只读探针 · 同一平面位置"取高面"机制 · LAYOUT ${LAYOUT.LAYOUT_VERSION} · cellSize=${CELL}`);
say('='.repeat(78));
say('');
say('【① 机制证据（生产代码路径）】');
say('  · `src/shared/layout.js` `floorYAt(x,z)`：遍历 WALKABLE，`if (y === null || s.y > y) y = s.y`');
say('    ⇒ **同一平面位置取最高面**（叠加 ROADS 坡道后同样取 max）。');
say('  · `src/interaction/walk-graph.js` `sample(col,row)`：节点高度 = `solver.probe(x,z,null).surfaceY`；');
say('    `canStep(a,b)`：`b.y - a.y > maxStepHeight(0.5)` 拒 / `< -snapDownDistance(0.6)` 拒。');
say('  · `src/interaction/walk-solver.js` `probe(x,z,feetY)`：`surfaceY = groundAt(x,z)`（= `layout.floorYAt`）。');
say('  ⇒ 低面若在同格被高面盖住，该格节点高度就是**高面的 y**，从低面相邻格过去必然 `stepTooHigh`。');

/* ------------------------------------------------------------------ *
 * ② 全城扫描："低面被同位置高面压住"
 *   做法：以 20m 桶做空间索引，逐桶在 CELL 网格上取点，聚合 (低面 → 高面) 对。
 * ------------------------------------------------------------------ */
const BUCKET = 20;
const ext = LAYOUT.TERRAIN_EXTENT;
const buckets = new Map();
const bkey = (bx, bz) => `${bx}:${bz}`;
for (const s of LAYOUT.WALKABLE) {
  const r = s.bounds;
  const bx0 = Math.floor(r.minX / BUCKET);
  const bx1 = Math.floor(r.maxX / BUCKET);
  const bz0 = Math.floor(r.minZ / BUCKET);
  const bz1 = Math.floor(r.maxZ / BUCKET);
  for (let bx = bx0; bx <= bx1; bx += 1) {
    for (let bz = bz0; bz <= bz1; bz += 1) {
      const k = bkey(bx, bz);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(s);
    }
  }
}
const pairCells = new Map(); // `${lowId}|${highId}` → Set("x:z")
const lowCoveredCells = new Map(); // lowId → total cells visited inside its own footprint
const lowCoveredBy = new Map(); // lowId → Set(highIds)
const cellsVisited = { total: 0, covered: 0 };
for (const [k, list] of buckets) {
  const [bx, bz] = k.split(':').map(Number);
  const x0 = Math.max(ext.minX, bx * BUCKET);
  const x1 = Math.min(ext.maxX, (bx + 1) * BUCKET);
  const z0 = Math.max(ext.minZ, bz * BUCKET);
  const z1 = Math.min(ext.maxZ, (bz + 1) * BUCKET);
  for (let x = Math.ceil(x0 / CELL) * CELL; x <= x1; x += CELL) {
    for (let z = Math.ceil(z0 / CELL) * CELL; z <= z1; z += CELL) {
      const hit = list.filter((s) => x >= s.bounds.minX - 1e-9 && x <= s.bounds.maxX + 1e-9 && z >= s.bounds.minZ - 1e-9 && z <= s.bounds.maxZ + 1e-9);
      if (hit.length < 2) continue;
      cellsVisited.total += 1;
      const hi = hit.reduce((m, s) => (m === null || s.y > m.y ? s : m), null);
      for (const s of hit) {
        if (s.id === hi.id || hi.y - s.y <= EPS) continue;
        cellsVisited.covered += 1;
        const key = `${s.id}|${hi.id}`;
        if (!pairCells.has(key)) pairCells.set(key, new Set());
        pairCells.get(key).add(`${x}:${z}`);
        if (!lowCoveredBy.has(s.id)) lowCoveredBy.set(s.id, new Set());
        lowCoveredBy.get(s.id).add(hi.id);
      }
      // 记录每个低面"自身足迹内被访问到的格数"，用于判"完全内含 / 部分重叠"
      for (const s of hit) {
        if (!lowCoveredCells.has(s.id)) lowCoveredCells.set(s.id, new Set());
        lowCoveredCells.get(s.id).add(`${x}:${z}`);
      }
    }
  }
}

const surfaceById = new Map(LAYOUT.WALKABLE.map((s) => [s.id, s]));
const rows = [];
for (const [key, cells] of pairCells) {
  const [lowId, highId] = key.split('|');
  const low = surfaceById.get(lowId);
  const high = surfaceById.get(highId);
  const own = lowCoveredCells.get(lowId) ?? new Set();
  const fullyCovered = own.size > 0 && [...own].every((c) => {
    const [x, z] = c.split(':').map(Number);
    return surfacesAt(x, z).some((s) => s.id !== lowId && s.y > low.y + EPS);
  });
  rows.push({
    lowId,
    lowKind: low.kind,
    lowY: low.y,
    lowZone: low.zone,
    highId,
    highKind: high.kind,
    highY: high.y,
    dy: +(high.y - low.y).toFixed(3),
    coveredCells: cells.size,
    ownCells: own.size,
    fullyCovered,
    thoroughfare: THOROUGHFARE_KINDS.includes(low.kind),
  });
}
rows.sort((a, b) => b.dy - a.dy || b.coveredCells - a.coveredCells);

say('');
say(`【② 全城扫描（${CELL}m 网格 · 20m 桶空间索引）】`);
say(`  访问格数 ${cellsVisited.total.toLocaleString()} · "低面被高面压住"的 (格,高面) 命中次数 ${cellsVisited.covered.toLocaleString()} · (低面,高面) 对 ${rows.length}`);
say(`  其中低面属"已登记通路类"（${THOROUGHFARE_KINDS.join('/')}）的对：${rows.filter((r) => r.thoroughfare).length}`);
say('');
say('  | 低面 | kind | y | 高面（同位置） | kind | 高 y | 高差 | 覆盖格数 | 完全内含 | 通路类 |');
say('  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows.slice(0, 40)) {
  say(`  | \`${r.lowId}\` | ${r.lowKind} | ${r.lowY} | \`${r.highId}\` | ${r.highKind} | ${r.highY} | ${r.dy} | ${r.coveredCells}/${r.ownCells} | ${r.fullyCovered ? '**是**' : '部分'} | ${r.thoroughfare ? '是' : '—'} |`);
}
if (rows.length > 40) say(`  （仅列前 40 行，全量 ${rows.length} 行见 --json 输出）`);

/* ------------------------------------------------------------------ *
 * ③ 门洞链：probe / path 结论（按是否影响可达性分类）
 * ------------------------------------------------------------------ */
const doors = LAYOUT.SLOTS.filter((s) => s.hasDoor && s.door);
const interiors = LAYOUT.WALKABLE.filter((w) => w.kind === 'interior');
const interiorOfSlot = new Map();
for (const w of interiors) {
  const slotId = w.id.replace(/^WK-/, '').replace(/-interior$/, '');
  interiorOfSlot.set(slotId, w);
}
function slotOfWalkable(w) {
  const base = w.id.replace(/^WK-/, '');
  const hit = doors.find((s) => base === s.id || base.startsWith(`${s.id}-`));
  return hit ? hit.id : null;
}
const results = [];
for (const slot of doors) {
  const interior = interiorOfSlot.get(slot.id) ?? null;
  const chain = LAYOUT.WALKABLE.filter((w) => slotOfWalkable(w) === slot.id);
  const passage = chain.find((w) => w.kind === 'passage') ?? null;
  const facade = slot.door.facade ?? null;
  const from = facade ? { x: facade.x, z: facade.z } : { x: slot.door.center.x, z: slot.door.center.z };
  const doorCentre = { x: slot.door.center.x, z: slot.door.center.z };
  const probeFrom = solver.probe(from.x, from.z, null);
  const probeDoor = solver.probe(doorCentre.x, doorCentre.z, null);
  const probeIn = interior ? solver.probe(interior.bounds.minX + (interior.bounds.maxX - interior.bounds.minX) / 2, interior.bounds.minZ + (interior.bounds.maxZ - interior.bounds.minZ) / 2, null) : null;
  const cellFrom = graph1.nearestCell(from.x, from.z);
  const cellDoor = graph1.nearestCell(doorCentre.x, doorCentre.z);
  const interiorCentre = interior ? { x: (interior.bounds.minX + interior.bounds.maxX) / 2, z: (interior.bounds.minZ + interior.bounds.maxZ) / 2 } : null;
  const cellIn = interiorCentre ? graph1.nearestCell(interiorCentre.x, interiorCentre.z) : null;
  const stepFacadeToDoor = cellFrom && cellDoor ? graph1.canStep(cellFrom.col, cellFrom.row, cellDoor.col, cellDoor.row) : null;
  const sampleFrom = cellFrom ? graph1.sample(cellFrom.col, cellFrom.row) : null;
  const sampleDoor = cellDoor ? graph1.sample(cellDoor.col, cellDoor.row) : null;
  const sampleIn = cellIn ? graph1.sample(cellIn.col, cellIn.row) : null;
  // 注意：`graph.path(from,to)` 收**世界坐标**（内部自己在做 nearestCell）——最初传 {col,row} 会全部判"不可达"（探针自检发现）
  const p = graph1.path({ x: from.x, z: from.z }, { x: doorCentre.x, z: doorCentre.z });
  const pIn = interiorCentre ? graph1.path({ x: from.x, z: from.z }, { x: interiorCentre.x, z: interiorCentre.z }) : null;
  const p2 = graph2.path({ x: from.x, z: from.z }, { x: doorCentre.x, z: doorCentre.z });
  const chainSurfaces = chain.map((w) => ({ id: w.id, kind: w.kind, y: w.y }));
  const covered = chain.filter((w) => (lowCoveredBy.get(w.id)?.size ?? 0) > 0).map((w) => ({ id: w.id, y: w.y, by: [...(lowCoveredBy.get(w.id) ?? [])] }));
  // 该格解析到的高程 vs 面自身 y（不一致即为"取高面"）
  const mismatch = [];
  for (const w of chain) {
    const cx = Math.max(w.bounds.minX, Math.min(w.bounds.maxX, (w.bounds.minX + w.bounds.maxX) / 2));
    const cz = Math.max(w.bounds.minZ, Math.min(w.bounds.maxZ, (w.bounds.minZ + w.bounds.maxZ) / 2));
    const resolved = solver.probe(cx, cz, null).surfaceY;
    if (resolved !== null && Math.abs(resolved - w.y) > EPS) mismatch.push({ id: w.id, ownY: w.y, resolvedY: resolved });
  }
  results.push({
    slotId: slot.id,
    doorWidth: slot.door.width,
    passable: slot.door.passable,
    facade,
    probe: { from: probeFrom.surfaceY, doorCentre: probeDoor.surfaceY, interior: probeIn?.surfaceY ?? null },
    graph: {
      cellSize: CELL,
      sampleFrom: sampleFrom?.y ?? null,
      sampleDoor: sampleDoor?.y ?? null,
      sampleInterior: sampleIn?.y ?? null,
      canStepFacadeToDoor: stepFacadeToDoor,
      pathOkFacadeToDoor: p?.ok ?? null,
      pathLengthFacadeToDoor: p?.length ?? null,
      pathOkFacadeToInterior: pIn?.ok ?? null,
      pathLengthFacadeToInterior: pIn?.length ?? null,
    },
    graph2: { pathOkFacadeToDoor: p2?.ok ?? null, pathLengthFacadeToDoor: p2?.length ?? null },
    chainSurfaces,
    covered,
    mismatch,
    reachableToDoor: Boolean(p?.ok),
    reachableToInterior: Boolean(pIn?.ok),
  });
}
const failing = results.filter((r) => !r.reachableToDoor && r.passable !== false);
const affected = results.filter((r) => r.covered.length > 0);
const affectedAndFailing = affected.filter((r) => !r.reachableToDoor && r.passable !== false);

say('');
say('【③ 门洞链 probe/path 结论（cellSize=' + CELL + ' 与 2 两套图）】');
say(`  有门槽位 ${results.length} · 图中不可达（且未声明 blockedBy）${failing.length} · 存在"低面被压"的面 ${affected.length} · 二者交集（**影响可达性**）${affectedAndFailing.length}`);
say('');
say('  | slotId | 门宽 | passable | 低面被压的链上面 | 覆盖者(高面) | probe(facade/门中/室内) | cellSize' + CELL + ' path | cellSize2 path |');
say('  | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of affected.length ? affected : results.filter((x) => !x.reachableToDoor)) {
  const lowSurfaces = r.covered.map((c) => `${c.id}@${c.y}`).join('<br>') || '—';
  const highs = [...new Set(r.covered.flatMap((c) => c.by))].map((h) => `${h}@${surfaceById.get(h)?.y}`).join('<br>') || '—';
  say(`  | \`${r.slotId}\` | ${r.doorWidth} | ${r.passable} | ${lowSurfaces} | ${highs} | ${r.probe.from} / ${r.probe.doorCentre} / ${r.probe.interior} | ${r.graph.pathOkFacadeToDoor ? '✓' : '✗'} (${r.graph.pathLengthFacadeToDoor ?? '—'}) | ${r.graph2.pathOkFacadeToDoor ? '✓' : '✗'} (${r.graph2.pathLengthFacadeToDoor ?? '—'}) |`);
}

/* ------------------------------------------------------------------ *
 * ④ 最小复现
 * ------------------------------------------------------------------ */
const REPRO = ['B-side-west-main', 'C-side-west-main'];
say('');
say('【④ 最小复现（可被第三方复核）】');
for (const id of REPRO) {
  const r = results.find((x) => x.slotId === id);
  if (!r) continue;
  say(`  ── ${id} ──`);
  say(`  门外锚点 facade = ${JSON.stringify(r.facade)}`);
  say(`  probe：门外 surfaceY=${r.probe.from} · 门中 surfaceY=${r.probe.doorCentre} · 室内中心 surfaceY=${r.probe.interior}`);
  say(`  面级链：${r.chainSurfaces.map((c) => `${c.id}(${c.kind})@${c.y}`).join(' → ')}`);
  if (r.mismatch.length) {
    for (const m of r.mismatch) say(`  ⚠ 取高面：面 ${m.id} 自身 y=${m.ownY}，但生产 probe 在该面中心解析到 **${m.resolvedY}**（取到了同位置更高的面）`);
  }
  say(`  图节点高度（cellSize=${CELL}）：门外=${r.graph.sampleFrom} · 门中=${r.graph.sampleDoor} · 室内=${r.graph.sampleInterior} · canStep(门外→门中)=${r.graph.canStepFacadeToDoor}`);
  say(`  path 门外→门中（cellSize=${CELL}）=${r.graph.pathOkFacadeToDoor ? '可达' : '**不可达**'}${r.graph.pathLengthFacadeToDoor ? ` 长度 ${r.graph.pathLengthFacadeToDoor}m` : ''}；门外→室内=${r.graph.pathOkFacadeToInterior ? '可达' : '**不可达**'}；cellSize=2（门外→门中）=${r.graph2.pathOkFacadeToDoor ? '可达' : '**不可达**'}`);
}

/* ------------------------------------------------------------------ *
 * ⑤ 两案量化
 * ------------------------------------------------------------------ */
// (a) 改规则：取高结果会改变的位置 = 低面属通路类且被高面压住的格数
const ruleChangeCells = rows.filter((r) => r.thoroughfare).reduce((n, r) => n + r.coveredCells, 0);
const ruleAffectedSurfaces = new Set(rows.filter((r) => r.thoroughfare).map((r) => r.lowId));
// 风险代理：这些低面在 CELL 网格上的"孤立格"（自身足迹内没有任何同面的相邻格）会出现"站到低面后被孤立"的情形
let isolatedLowCells = 0;
for (const lowId of ruleAffectedSurfaces) {
  const own = [...(lowCoveredCells.get(lowId) ?? [])].map((c) => c.split(':').map(Number));
  const set = new Set(own.map(([x, z]) => `${x}:${z}`));
  for (const [x, z] of own) {
    const nb = [`${x + CELL}:${z}`, `${x - CELL}:${z}`, `${x}:${z + CELL}`, `${x}:${z - CELL}`];
    if (!nb.some((k) => set.has(k))) isolatedLowCells += 1;
  }
}
// (b) 开槽：仍不可达且未被声明 blockedBy 的槽位，按 t128/t131 的既有模式估算几何量
const remainingSlotting = failing.map((r) => ({
  slotId: r.slotId,
  pattern: r.chainSurfaces.some((c) => c.kind === 'terrace') ? 't128 式（单块 → 5 段，净 +4 面）' : 't131 式（门外补 2 级台阶，净 +2 面）',
  walkableDelta: r.chainSurfaces.some((c) => c.kind === 'terrace') ? 4 : 2,
}));
say('');
say('【⑤ 两案量化对比（不实施，交回裁定）】');
say('  (a) 改「取高规则」（存在低面且属已登记通路时优先取低面 / 考虑全部重叠面）：');
say(`      · 会改变取高结果的位置：**${ruleChangeCells} 个 ${CELL}m 格**，涉及 ${ruleAffectedSurfaces.size} 个面`);
say(`      · 受影响面：${[...ruleAffectedSurfaces].map((i) => `${i}@${surfaceById.get(i)?.y}`).join(', ') || '（无）'}`);
say(`      · 副作用风险代理：这些低面在 ${CELL}m 网格上的**孤立格** ${isolatedLowCells} 个（改规则后可能"站到低面即被孤立/掉出通路"）`);
say('      · 需要的新断言（建议）：①「同一平面位置存在多个可行走面时，站立解析必须与所在通路的登记面一致」（逐格）；');
say('        ②「取低面不得使玩家进入包络/地形内部」（对改规则后的每个格做 AABB/包络复检）；③「台地顶面在无通路时仍取高面」（防回归到"穿台地"）');
say('  (b) 继续逐个开槽 / 补接近面：');
say(`      · 仍需处理的槽位：**${remainingSlotting.length} 个**${remainingSlotting.length ? `（前 10：${remainingSlotting.slice(0, 10).map((s) => s.slotId).join(', ')}${remainingSlotting.length > 10 ? ' …' : ''}）` : ''}`);
say(`      · 几何改动量（按既有模式估算）：${remainingSlotting.slice(0, 6).map((s) => `${s.slotId} ${s.pattern}`).join('；') || '（无）'}${remainingSlotting.length > 6 ? ` … 共 ${remainingSlotting.length} 项` : ''}`);
say(`      · 合计新增可行走面 ≈ **+${remainingSlotting.reduce((n, s) => n + s.walkableDelta, 0)}**（随之 WALKABLE 计数与 pin 需再同步）`);
say('');
say(`结论（探针，不含裁定）：影响面 ${affectedAndFailing.length} 个门洞；两案代价见上（(a) 改 ${ruleChangeCells} 格解析 + ${isolatedLowCells} 个孤立格风险 + 3 类新断言；(b) ${remainingSlotting.length} 个槽位 + 约 ${remainingSlotting.reduce((n, s) => n + s.walkableDelta, 0)} 个新面 + 计数 pin 再同步）。`);
say('（本探针未改动任何生产代码；src/**、tests/**、docs/CONTRACTS.md 均只读。）');

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify({ layoutVersion: LAYOUT.LAYOUT_VERSION, cell: CELL, mechanism: { floorYAt: 'max(covering surfaces)', graphHeight: 'solver.probe().surfaceY' }, scan: { cellsVisited: cellsVisited.total, coveredCells: cellsVisited.covered, pairs: rows.length, rows }, doors: results, twoOptions: { ruleChangeCells, ruleAffectedSurfaces: [...ruleAffectedSurfaces], isolatedLowCells, remainingSlotting } }, null, 2)}\n`);
} else {
  console.log('');
  console.log(`（提示：加 --json 可得到全量机器可读输出；本次 ${CELL}m 网格扫描已覆盖全城范围。）`);
}
process.exit(0);
