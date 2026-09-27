/**
 * scripts/verify-walk.mjs — 第一人称几何走查引擎（t13 / V2 G3）
 * =============================================================================
 * 归属：verifier（只读 src/**，只写 tests/verify-experience.test.mjs、scripts/verify-walk.mjs、
 * docs/report-experience.md、docs/shots-verify/**、docs/shots/**）。
 *
 * 方法：用真 kit + core registry 装配 5 个区域 → 用 t9 的 walk-solver（**真实碰撞 + 登记玩家体积/台阶阈值**）
 *       对 §6.4 路线做**逐步行走模拟**与专项探针（门洞净宽、墙面阻挡、水面不可站立、抬高建筑不可从下方穿入、
 *       包络越界保护、东西宫苑侧门），全部数字当场实测。
 *       **不使用 camera.near**，也不读任何实现者自述的走查结论。
 *
 * 用法：node scripts/verify-walk.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule, loadThree, buildZone, makeSilentEvents, ROOT } from '../tests/harness.mjs';

const ZONE_IDS = ['B', 'C', 'D', 'E', 'F'];
const STEP = 0.25; // 行走采样步长（米）

/** 装配全城（真 kit + core registry，灰盒不参与）。 */
export async function assembleCity({ quality = 'medium' } = {}) {
  const THREE = await loadThree();
  const { CONFIG } = await loadModule('src/shared/config.js');
  const LAYOUT = await loadModule('src/shared/layout.js');
  const { createRegistry } = await loadModule('src/core/registry.js');
  const { createKit } = await loadModule('src/kit/index.js');
  const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
  const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
  const kit = createKit({ THREE, config: CONFIG, quality });
  const events = makeSilentEvents();
  const registry = createRegistry({ events, layout: LAYOUT });
  const zones = new Map();
  for (const zoneId of ZONE_IDS) {
    const built = await buildZone(zoneId, { kit, registry, events });
    if (built.skipped) throw new Error(`区域 ${zoneId} 未交付：${built.reason}`);
    registry.registerZone(zoneId, built.result, { replace: true });
    zones.set(zoneId, built.result);
  }
  const solver = createWalkSolver({ registry });
  return { THREE, CONFIG, LAYOUT, kit, registry, zones, solver, createWalkGraph, events };
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * 逐段行走模拟：沿折线以 STEP 采样，用 solver.probe(x,z,prevFeet) 判定"从上一落脚点能否走到该点"。
 * 记录：每段是否连通、最大单步上/下高差、首个受阻点与原因、路面高度区间。
 */
export function walkPolyline(solver, polylines, { label = '' } = {}) {
  const segments = [];
  for (const line of polylines) {
    const seg = { from: line.from, to: line.to, name: line.name ?? `${label}`, samples: 0, blocked: [], maxUp: 0, maxDown: 0, minY: Infinity, maxY: -Infinity, feet: [] };
    let prev = null;
    for (let i = 0; i <= Math.ceil(line.length / STEP) && i <= 20000; i += 1) {
      const t = Math.min(1, (i * STEP) / line.length);
      const p = lerp(line.from, line.to, t);
      const probe = solver.probe(p.x, p.z, prev === null ? null : prev.y);
      seg.samples += 1;
      if (!probe.ok) {
        seg.blocked.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), t: +t.toFixed(3), reasons: probe.reasons });
        // 受阻后仍继续采样（记录全部受阻点），但以受阻点为新的参考（避免连锁误报）
      }
      const y = probe.surfaceY ?? prev?.y ?? null;
      if (y !== null) {
        seg.minY = Math.min(seg.minY, y);
        seg.maxY = Math.max(seg.maxY, y);
        if (prev && prev.y !== null) {
          const d = y - prev.y;
          if (d > seg.maxUp) seg.maxUp = d;
          if (d < seg.maxDown) seg.maxDown = d;
        }
      }
      seg.feet.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: y === null ? null : +y.toFixed(3), ok: probe.ok, reasons: probe.reasons });
      prev = { y };
    }
    segments.push(seg);
  }
  return segments;
}

/** 生成 FP_ROUTE 的段列表（含每段长度）。 */
export function routepolylines(LAYOUT) {
  const out = [];
  for (let i = 0; i < LAYOUT.FP_ROUTE.length - 1; i += 1) {
    const a = LAYOUT.FP_ROUTE[i];
    const b = LAYOUT.FP_ROUTE[i + 1];
    const length = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    out.push({ name: `${a.name} → ${b.name}`, from: { x: a.position.x, z: a.position.z }, to: { x: b.position.x, z: b.position.z }, length });
  }
  return out;
}

/** 门洞净宽实测：沿门洞横向以 0.05m 步长探测"可通行连续段"，取最宽连续段。 */
let LAYOUT_FLOOR = () => null;
export function doorClearWidth(solver, door) {
  if (!door || !door.center) return { width: 0, samples: 0, reason: 'no-door' };
  const axis = door.axis === 'z' ? 'x' : 'z'; // 门洞横向 = 与墙轴垂直的水平轴
  const half = Math.max((door.width ?? 0) / 2 + 2, 3);
  // 落脚高度取**门洞处真实地面**（floorYAt）；layout 的 door.sillY 对城门/抬升建筑是别的标高
  const feet = LAYOUT_FLOOR(door.center.x, door.center.z);
  let best = 0;
  let run = 0;
  let samples = 0;
  for (let d = -half; d <= half; d += 0.05) {
    const x = door.center.x + (axis === 'x' ? d : 0);
    const z = door.center.z + (axis === 'z' ? d : 0);
    const probe = solver.probe(x, z, feet);
    samples += 1;
    if (probe.ok) {
      run += 0.05;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return { width: +best.toFixed(2), declared: door.width ?? null, samples, reason: 'ok' };
}

/** 主入口：跑完整套走查并返回结构化报告。 */
export async function runWalkAudit() {
  const city = await assembleCity();
  const { CONFIG, LAYOUT, solver, zones } = city;
  LAYOUT_FLOOR = (x, z) => LAYOUT.floorYAt(x, z);
  const player = CONFIG.INTERACTION.player;
  const stepCfg = CONFIG.INTERACTION.step;

  const report = {
    environment: {
      node: process.version,
      three: city.THREE.REVISION,
      kit: kitVersionOf(city),
      config: CONFIG.CONFIG_VERSION,
      layout: LAYOUT.LAYOUT_VERSION,
      quality: 'medium',
      solverObstacles: solver.stats().obstacles,
      player: { radius: player.radius, height: player.height, eyeHeight: player.eyeHeight },
      step: { maxStepHeight: stepCfg.maxStepHeight, snapDownDistance: stepCfg.snapDownDistance, rampMaxSlope: stepCfg.rampMaxSlope },
      assembly: 'buildZone(5 区,真 kit) → registry.registerZone → createWalkSolver({registry})；不含灰盒',
      sampleStep: STEP,
    },
    route: [],
    doors: [],
    walls: [],
    water: [],
    envelope: [],
    raised: [],
    sideGates: [],
    summary: {},
  };

  /* ---------------- 1. §6.4 路线逐步走查 ---------------- */
  const lines = routepolylines(LAYOUT);
  const segments = walkPolyline(solver, lines);
  report.route = segments.map((s) => ({
    name: s.name,
    samples: s.samples,
    blocked: s.blocked.length,
    blockedAt: s.blocked.slice(0, 3),
    maxUp: +s.maxUp.toFixed(3),
    maxDown: +s.maxDown.toFixed(3),
    minY: +s.minY.toFixed(2),
    maxY: +s.maxY.toFixed(2),
    length: +lines.find((l) => l.name === s.name).length.toFixed(1),
  }));

  /* ---------------- 1b. 按真实可行走图寻路的逐段走查（避免直线插值假象） ---------------- */
  const graph = city.createWalkGraph(solver, { cellSize: 1, maxCells: 2000000 });
  report.paths = [];
  for (let i = 0; i < LAYOUT.FP_ROUTE.length - 1; i += 1) {
    const a = LAYOUT.FP_ROUTE[i];
    const b = LAYOUT.FP_ROUTE[i + 1];
    const path = graph.path({ x: a.position.x, z: a.position.z }, { x: b.position.x, z: b.position.z });
    if (!path.ok) {
      report.paths.push({ name: `${a.name} → ${b.name}`, reachable: false, reason: path.reason });
      continue;
    }
    let blocked = 0;
    let maxUp = 0;
    let maxDown = 0;
    let prevY = null;
    const blockedAt = [];
    for (const p of path.path) {
      const probe = solver.probe(p.x, p.z, prevY);
      if (!probe.ok) {
        blocked += 1;
        // t77 attempt5：记录落差，供“阈值等值”与“真阻挡”区分（原意：路径上不得有真阻挡）
        if (blockedAt.length < 3) blockedAt.push({ x: p.x, z: p.z, reasons: probe.reasons, dy: probe.surfaceY !== null && prevY !== null ? +(probe.surfaceY - prevY).toFixed(4) : null });
      }
      const y = probe.surfaceY ?? prevY;
      if (prevY !== null && y !== null) {
        const d = y - prevY;
        if (d > maxUp) maxUp = d;
        if (d < maxDown) maxDown = d;
      }
      prevY = y;
    }
    report.paths.push({ name: `${a.name} → ${b.name}`, reachable: true, cells: path.path.length, length: path.length, blocked, blockedAt, maxUp: +maxUp.toFixed(3), maxDown: +maxDown.toFixed(3) });
  }

  /* ---------------- 2. 门洞净宽（18 栋带门槽位 + 4 城门） ---------------- */
  for (const slot of LAYOUT.SLOTS.filter((s) => s.door)) {
    const clear = doorClearWidth(solver, slot.door);
    report.doors.push({
      id: slot.id,
      kind: slot.kind,
      declared: slot.door.width,
      clear: clear.width,
      ratio: slot.door.width ? +(clear.width / slot.door.width).toFixed(2) : null,
      sillY: slot.door.sillY ?? null,
      note: slot.kind === 'gateHall' || slot.onWall ? '城门/门殿' : slot.kind === 'courtyardGate' ? '院门' : '可进入建筑',
    });
  }

  /* ---------------- 3. 墙面阻挡（院墙/宫墙实体段） ---------------- */
  for (const wall of LAYOUT.WALLS) {
    const horiz = wall.axis === 'x';
    const lo = horiz ? Math.min(wall.from.x, wall.to.x) : Math.min(wall.from.z, wall.to.z);
    const hi = horiz ? Math.max(wall.from.x, wall.to.x) : Math.max(wall.from.z, wall.to.z);
    const line = horiz ? wall.from.z : wall.from.x;
    const gaps = (wall.openings ?? []).map((o) => [o.at - o.width / 2, o.at + o.width / 2]);
    // 取墙段中点作为探针（若落在洞口则顺延）
    let t = (lo + hi) / 2;
    let guard = 0;
    while (gaps.some((g) => t > g[0] - 0.5 && t < g[1] + 0.5) && guard < 50) {
      t += 2;
      guard += 1;
    }
    const x = horiz ? t : line;
    const z = horiz ? line : t;
    const floor = LAYOUT.floorYAt(x, z);
    const probe = solver.probe(x, z, floor === null ? null : floor);
    report.walls.push({ id: wall.id, cityWall: !!wall.cityWall, x: +x.toFixed(1), z: +z.toFixed(1), blocked: !probe.ok, reasons: probe.reasons });
  }

  /* ---------------- 4. 水面不可站立 / 桥面可通行 ---------------- */
  for (const wb of LAYOUT.WATER_BODIES) {
    const cx = (wb.bounds.minX + wb.bounds.maxX) / 2;
    const cz = (wb.bounds.minZ + wb.bounds.maxZ) / 2;
    const probe = solver.probe(cx, cz, wb.y);
    report.water.push({ id: wb.id, kind: wb.kind, x: cx, z: cz, standable: probe.ok, reasons: probe.reasons });
  }
  for (const bridge of LAYOUT.BRIDGES) {
    const cx = (bridge.bounds.minX + bridge.bounds.maxX) / 2;
    const cz = (bridge.bounds.minZ + bridge.bounds.maxZ) / 2;
    const probe = solver.probe(cx, cz, bridge.deckY);
    report.water.push({ id: `bridge:${bridge.id}`, kind: 'bridgeDeck', x: cx, z: cz, standable: probe.ok, reasons: probe.reasons });
  }

  /* ---------------- 5. 包络越界保护 ---------------- */
  const ext = LAYOUT.TERRAIN_EXTENT;
  for (const p of [
    { name: '东越界', x: ext.maxX + 5, z: 0 },
    { name: '西越界', x: ext.minX - 5, z: 0 },
    { name: '南越界', x: 0, z: ext.minZ - 5 },
    { name: '北越界', x: 0, z: ext.maxZ + 5 },
  ]) {
    const probe = solver.probe(p.x, p.z, null);
    report.envelope.push({ name: p.name, x: p.x, z: p.z, blocked: !probe.ok, reasons: probe.reasons });
  }

  /* ---------------- 6. 抬高建筑不可从下方穿入（t27 语义） ---------------- */
  for (const id of ['B-hall-main', 'C-hall-bed-main']) {
    const slot = LAYOUT.SLOT_BY_ID[id];
    const cx = slot.x;
    const cz = slot.z;
    const ground = (LAYOUT.floorYAt(cx, cz) ?? 0) - (slot.terraceH || 0);
    const fromGround = solver.probe(cx, cz, ground);
    const fromTop = solver.probe(cx, cz, slot.baseY ?? slot.terraceH);
    report.raised.push({ id, terraceH: slot.terraceH, ground, surfaceY: fromGround.surfaceY, standableFromGround: fromGround.ok, reasonsFromGround: fromGround.reasons, standableFromTop: fromTop.ok, note: '从地坪高度进入台基内部必须被拒（stepTooHigh/障碍），从台基顶应可站（visitable 为真时）' });
  }

  // 门洞正向检查：城门/门殿的门洞在其真实地面高度必须可通行
  for (const id of ['F-gate-south', 'F-gate-north', 'F-gate-west', 'F-gate-east', 'B-gate-front', 'C-gate-inner']) {
    const slot = LAYOUT.SLOT_BY_ID[id];
    const floor = LAYOUT.floorYAt(slot.door.center.x, slot.door.center.z);
    const probe = solver.probe(slot.door.center.x, slot.door.center.z, floor);
    report.raised.push({ id: `${id}:passage`, kind: 'gatePassage', floor, standableAtFloor: probe.ok, reasons: probe.reasons, note: '城门/门殿的门洞在其真实地面高度应可通行' });
  }

  /* ---------------- 7. 东西宫苑侧门可达 ---------------- */
  const sideGateIds = ['CXN-B-D-plaza-west', 'CXN-B-D-rear-west', 'CXN-C-D-side-west', 'CXN-B-E-plaza-east', 'CXN-B-E-rear-east', 'CXN-C-E-side-east'];
  for (const id of sideGateIds) {
    const c = LAYOUT.CONNECTOR_BY_ID[id];
    if (!c) continue;
    const pts = [];
    const half = c.width / 2;
    for (let d = -half + 0.5; d <= half - 0.5; d += 0.5) {
      pts.push({ x: c.position.x + (c.kind === 'passage' || c.kind === 'gate' ? 0 : d), z: c.position.z + (c.kind === 'stairs' ? d : 0) });
    }
    const probes = pts.map((p) => solver.probe(p.x, p.z, c.elevation));
    const clear = probes.filter((p) => p.ok).length;
    report.sideGates.push({ id, kind: c.kind, width: c.width, elevation: c.elevation, samples: probes.length, walkable: clear, blockedReasons: [...new Set(probes.flatMap((p) => p.reasons))] });
  }
  // 起点 → 各区 fp-spawn 的真实图路径（含 D/E 经侧门）
  const startPoint = LAYOUT.FP_ROUTE[0].position;
  for (const zoneId of ZONE_IDS) {
    const vp = LAYOUT.VIEWPOINTS.find((v) => v.mode === 'fp-spawn' && (v.area ?? v.zone) === zoneId);
    const path = graph.path({ x: startPoint.x, z: startPoint.z }, { x: vp.position.x, z: vp.position.z });
    let blocked = 0;
    let prevY = null;
    let maxUp = 0;
    for (const pt of path.path ?? []) {
      const probe = solver.probe(pt.x, pt.z, prevY);
      if (!probe.ok) blocked += 1;
      const y = probe.surfaceY ?? prevY;
      if (prevY !== null && y !== null && y - prevY > maxUp) maxUp = y - prevY;
      prevY = y;
    }
    report.sideGates.push({ id: `path:${zoneId}-fp-spawn`, kind: 'zonePath', reachable: path.ok, length: path.length ?? null, cells: path.path?.length ?? 0, blocked, maxUp: +maxUp.toFixed(3), zone: zoneId, reason: path.ok ? null : path.reason });
  }
  // 整城连通分量：9 路点 + 5 fp-spawn + 2 内景
  const allPoints = [
    ...LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name })),
    ...LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id })),
    ...LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id })),
  ];
  const connected = graph.connected(allPoints);
  report.connectivity = { points: allPoints.length, ok: connected.ok, unreachable: (connected.unreachable ?? []).map((u) => u.point.name) };

  /* ---------------- 8. 汇总 ---------------- */
  const routeBlocked = report.route.reduce((n, s) => n + s.blocked, 0);
  const routeMaxUp = Math.max(...report.route.map((s) => s.maxUp));
  const routeMaxDown = Math.min(...report.route.map((s) => s.maxDown));
  const doorsOk = report.doors.filter((d) => d.clear >= Math.max(1.1, (d.declared ?? 0) * 0.5)).length;
  const waterBad = report.water.filter((w) => w.kind !== 'bridgeDeck' && w.standable).length;
  const bridgesOk = report.water.filter((w) => w.kind === 'bridgeDeck' && w.standable).length;
  const envelopeBad = report.envelope.filter((e) => !e.blocked).length;
  const raisedBad = report.raised.filter((r) => r.kind !== 'gatePassage' && r.standableFromGround).length;
  const gatePassageOk = report.raised.filter((r) => r.kind === 'gatePassage' && r.standableAtFloor).length;
  const gatePassageTotal = report.raised.filter((r) => r.kind === 'gatePassage').length;
  const sideOk = report.sideGates.filter((g) => g.walkable > 0).length;
  const pathBlocked = report.paths.reduce((n, p) => n + (p.blocked ?? 0), 0);
  const pathUnreachable = report.paths.filter((p) => p.reachable === false).length;
  const pathMaxUp = Math.max(...report.paths.map((p) => p.maxUp ?? 0));
  report.summary = {
    graphCellSize: graph.cellSize,
    graphWalkableCells: graph.stats().walkable,
    pathLegs: report.paths.length,
    pathUnreachable,
    pathBlockedSamples: pathBlocked,
    pathMaxUp,
    routeSegments: report.route.length,
    routeBlockedSamples: routeBlocked,
    routeMaxUp,
    routeMaxDown,
    stepThreshold: stepCfg.maxStepHeight,
    routeMaxUpOverThreshold: routeMaxUp > stepCfg.maxStepHeight + 1e-6,
    doors: report.doors.length,
    doorsOk,
    doorsMinClear: Math.min(...report.doors.map((d) => d.clear)),
    waterBodies: report.water.filter((w) => w.kind !== 'bridgeDeck').length,
    waterUnexpectedlyStandable: waterBad,
    bridgesStandable: bridgesOk,
    envelopeLeaks: envelopeBad,
    raisedEnterableFromGround: raisedBad,
    gatePassageWalkable: `${gatePassageOk}/${gatePassageTotal}`,
    connectivity: report.connectivity,
    sideGateProbes: report.sideGates.length,
    sideGateWalkable: sideOk,
    zones: [...zones.keys()],
  };
  return report;
}

function kitVersionOf(city) {
  try {
    return city.kit.version ?? 'n/a';
  } catch {
    return 'n/a';
  }
}

/* ---------------------------------------------------------------- CLI */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const report = await runWalkAudit();
  console.log('=== 第一人称几何走查（t13 / V2 G3） ===');
  console.log(JSON.stringify(report.environment, null, 1));
  console.log('\n--- §6.4 路线逐段 ---');
  for (const s of report.route) console.log(` ${s.name}: ${s.length}m · 采样 ${s.samples} · 受阻 ${s.blocked} · 上/下台阶 ${s.maxUp}/${s.maxDown} · 面高 ${s.minY}–${s.maxY}${s.blocked ? ` · 受阻点 ${JSON.stringify(s.blockedAt)}` : ''}`);
  console.log('\n--- 门洞净宽 ---');
  for (const d of report.doors) console.log(` ${d.id}(${d.note}): 登记 ${d.declared}m → 实测净宽 ${d.clear}m`);
  console.log('\n--- 墙面阻挡 ---');
  const wallBlocked = report.walls.filter((w) => w.blocked).length;
  console.log(` ${wallBlocked}/${report.walls.length} 段墙探针被阻挡（其余为洞口顺延/顶部可站）`);
  const wallMiss = report.walls.filter((w) => !w.blocked);
  if (wallMiss.length) console.log(`  未阻挡：${wallMiss.slice(0, 6).map((w) => `${w.id}@(${w.x},${w.z})`).join(', ')}`);
  console.log('\n--- 水面/桥面 ---');
  for (const w of report.water) console.log(` ${w.id}(${w.kind}): 可站=${w.standable} ${w.reasons.length ? JSON.stringify(w.reasons) : ''}`);
  console.log('\n--- 包络 ---');
  for (const e of report.envelope) console.log(` ${e.name}(${e.x},${e.z}): 阻挡=${e.blocked} ${JSON.stringify(e.reasons)}`);
  console.log('\n--- 抬高建筑（t27 语义） ---');
  for (const r of report.raised) console.log(` ${r.id}: terraceH=${r.terraceH} 地坪=${r.ground} 从地坪可站=${r.standableFromGround}(${JSON.stringify(r.reasonsFromGround)}) 从台基顶可站=${r.standableFromTop}`);
  console.log('\n--- 东西宫苑侧门 ---');
  for (const g of report.sideGates) console.log(` ${g.id}: 采样 ${g.samples} 可走 ${g.walkable} ${g.blockedReasons?.length ? JSON.stringify(g.blockedReasons) : ''}`);
  console.log('\n--- 汇总 ---');
  console.log(JSON.stringify(report.summary, null, 1));
  process.exit(0);
}
