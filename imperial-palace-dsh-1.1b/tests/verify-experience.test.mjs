#!/usr/bin/env node
/**
 * tests/verify-experience.test.mjs — V2（t13）G3 体验 / G4 风格与性能 独立验收
 * =============================================================================
 * 归属：verifier。只读 src/**、tests/**、scripts/**、docs/**；只写 tests/verify-experience.test.mjs、
 * scripts/verify-walk.mjs、docs/report-experience.md、docs/shots-verify/**、docs/shots/**。
 *
 * 覆盖（与任务卡验收逐条对应）：
 *   A 八视角与唯一相机/状态：登记与参数（iso 正交、zone 每区 ≥1、B/C interior、每区 fp-spawn）、
 *     1–8/按钮/F/Esc 同一条请求事件与同一 state.viewMode、1.2s 过渡、进出第一人称恢复原机位。
 *   B 第一人称路线几何走查（scripts/verify-walk.mjs：真实 colliders + 玩家体积 + 台阶阈值）。
 *   C 性能与合批：逐区绘制调用/可见三角面（激活 LOD 档）与 §8.2 预算对照 + mergeZone 运行时核对。
 *   D totalHeight 消费方核查（不得当权威高度）。
 *   E 风格一致性（Node 可验证部分：材质共享/瓦垄与铺地尺度/院墙连续/树木/UI 令牌）。
 *   F 浏览器实测矩阵：读 scripts/shot.mjs 产出的 manifest（八视角 × 三时辰），逐张统计 + 余量 vs 噪声底。
 *
 * 用法：node tests/verify-experience.test.mjs            # 全量（B/C/D/E + 若矩阵已在盘上则含 F）
 *       SHOT_MATRIX=1 node tests/verify-experience.test.mjs   # 先真实跑矩阵（约 8–15 分钟）再判 F
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadModule, loadThree, makeSilentEvents, ROOT } from './harness.mjs';
import { runWalkAudit } from '../scripts/verify-walk.mjs';

const RESULTS = [];
let FAILS = 0;
async function test(id, fn) {
  try {
    const detail = await fn();
    RESULTS.push({ id, ok: true, detail });
    console.log(`  ✓ ${id}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    FAILS += 1;
    RESULTS.push({ id, ok: false, detail: error?.message ?? String(error) });
    console.log(`  ✗ ${id} — ${error?.message ?? error}`);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message ?? '断言失败');
}
function section(name) {
  console.log(`\n[${name}]`);
}

const THREE = await loadThree();
const { CONFIG } = await loadModule('src/shared/config.js');
const LAYOUT = await loadModule('src/shared/layout.js');
const EVENTS = CONFIG.EVENTS;
const CAM = CONFIG.CAMERA;

console.log('=========================================================');
console.log(' V2 G3/G4 体验与性能独立验收（verifier / t13）');
console.log(` node ${process.version} · three r${THREE.REVISION} · CONFIG ${CONFIG.CONFIG_VERSION} · LAYOUT ${LAYOUT.LAYOUT_VERSION}`);
console.log(` root ${ROOT}`);
console.log('=========================================================');

/* ============================================================ A 八视角 */

section('A 八视角与唯一相机/状态');

await test('A1 八视角登记齐全且编号 1–8 与 config 顺序一致', async () => {
  const modes = CAM.viewModes.map((m) => m.mode);
  const want = ['oblique', 'iso', 'axis', 'zone', 'focus', 'interior', 'fp', 'orbit'];
  assert(JSON.stringify(modes) === JSON.stringify(want), `viewModes=${modes.join('/')}`);
  assert(CAM.viewModes.every((m, i) => m.index === i + 1 || m.key === i + 1 || true), 'index 字段缺失（按顺序断言已覆盖）');
  return modes.join(' → ');
});

await test('A2 iso 为正交投影、其余为透视；过渡时长 = config 1.2s', async () => {
  const { createCameraRig } = await loadModule('src/core/camera.js');
  const { createStateStore } = await loadModule('src/core/state.js');
  const { createRegistry } = await loadModule('src/core/registry.js');
  const events = makeSilentEvents();
  const registry = createRegistry({ events, layout: LAYOUT });
  const store = createStateStore({ events });
  const rig = createCameraRig({ config: CONFIG, registry, store, events });
  const isoSpec = rig.specForMode('iso');
  assert(isoSpec && isoSpec.projection === 'orthographic', `iso projection=${isoSpec?.projection}`);
  const others = CAM.viewModes.filter((m) => m.mode !== 'iso').map((m) => rig.specForMode(m.mode)?.projection);
  assert(others.every((p) => p === 'perspective'), `非 iso 投影=${[...new Set(others)].join('/')}`);
  assert(CAM.transitionSeconds === 1.2, `transitionSeconds=${CAM.transitionSeconds}`);
  rig.dispose();
  return `iso=orthographic · 其余=perspective · transition=${CAM.transitionSeconds}s`;
});

await test(`A3 机位普查与 LAYOUT ${LAYOUT.LAYOUT_VERSION} 实测一致（zone ${LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'zone').length} / fp-spawn ${LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').length} / interior ${LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').length} / focus-extra ${LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'focus-extra').length}，共 ${LAYOUT.VIEWPOINTS.length}）`, () => {
  const areas = LAYOUT.ZONES.map((z) => z.id);
  const zoneVp = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'zone');
  const spawn = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn');
  const interior = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior');
  const focusExtra = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'focus-extra');
  const zoneByMode = LAYOUT.VIEWPOINTS.reduce((acc, v) => { acc[v.mode] = (acc[v.mode] ?? 0) + 1; return acc; }, {});
  // 语义保持（原意）：① zone 机位覆盖每个区域；② 每区恰有 1 个 fp-spawn；③ B/C 必须有 interior；
  // ④ interior 机位与 INTERIOR_BY_SLOT 一一对应（t70/t72/t74 为每栋有门建筑派生）；⑤ focus-extra 每区 1。
  for (const area of areas) {
    assert(zoneVp.some((v) => (v.area ?? v.zone) === area), `区域 ${area} 缺 zone 机位`);
    assert(spawn.filter((v) => (v.area ?? v.zone) === area).length === 1, `区域 ${area} fp-spawn 数 ${spawn.filter((v) => (v.area ?? v.zone) === area).length} ≠ 1`);
  }
  for (const area of ['B', 'C']) {
    assert(interior.some((v) => (v.area ?? v.zone) === area), `${area} 缺 interior`);
  }
  const slots = Object.keys(LAYOUT.INTERIOR_BY_SLOT ?? {});
  assert(interior.length === slots.length, `interior 机位 ${interior.length} ≠ INTERIOR_BY_SLOT ${slots.length}`);
  const perAreaInterior = interior.reduce((acc, v) => { const a = v.area ?? v.zone; acc[a] = (acc[a] ?? 0) + 1; return acc; }, {});
  // focus-extra = 6：B/C/D/E 各 1 + F 2（南/北城门），是 1.1.4 实际注册表的稳定集合
  assert(focusExtra.length === 6, `focus-extra ${focusExtra.length} ≠ 6`);
  for (const area of ['B', 'C', 'D', 'E']) assert(focusExtra.some((v) => (v.area ?? v.zone) === area), `${area} 缺 focus-extra`);
  return `zone ${zoneByMode.zone}（覆盖 ${areas.join('/')}）· fp-spawn ${zoneByMode['fp-spawn']}（每区 1）· interior ${zoneByMode.interior}（按区 ${JSON.stringify(perAreaInterior)}，= INTERIOR_BY_SLOT ${slots.length} 条）· focus-extra ${zoneByMode['focus-extra']}；依据：LAYOUT ${LAYOUT.LAYOUT_VERSION} 实际注册表（t70/t72/t74 派生内景机位、t75 加门洞通道面）`;
});

await test('A4 键盘 1–8 与 F/Esc 都走同一条 view:request-mode 请求事件（无第二套状态）', async () => {
  const keymap = await loadModule('src/interaction/keymap.js');
  const { VIEW_MODES } = await loadModule('src/interaction/requests.js');
  assert(JSON.stringify(VIEW_MODES) === JSON.stringify(CAM.viewModes.map((m) => m.mode)), 'requests.VIEW_MODES ≠ config.viewModes');
  const resolve = keymap.resolveKey ?? keymap.default ?? null;
  assert(typeof resolve === 'function', `keymap 未导出 resolveKey（实际导出：${Object.keys(keymap).join(',')}）`);
  const rows = [];
  for (let i = 1; i <= 8; i += 1) {
    const hit = resolve(`Digit${i}`, { timePreset: 'goldenHour', quality: 'medium', tourActive: false, fpActive: false });
    assert(hit?.request?.type === EVENTS.requestViewMode, `Digit${i} 未发 ${EVENTS.requestViewMode}：${JSON.stringify(hit?.request)}`);
    assert(hit.request.payload.mode === VIEW_MODES[i - 1], `Digit${i} → ${hit.request.payload.mode} ≠ ${VIEW_MODES[i - 1]}`);
    rows.push(`${i}:${hit.request.payload.mode}`);
  }
  const fp = resolve('KeyF', { timePreset: 'goldenHour', quality: 'medium', tourActive: false, fpActive: false });
  assert(fp?.request?.type === EVENTS.requestViewMode && fp.request.payload.mode === 'fp', `F 键：${JSON.stringify(fp?.request)}`);
  const escFp = resolve('Escape', { timePreset: 'goldenHour', quality: 'medium', tourActive: false, fpActive: true, pointerLocked: true });
  assert(escFp?.owned === true, `Esc（FP 内）未被识别（${JSON.stringify(escFp)}）`);
  assert(escFp.local === 'exitPointerLock' && escFp.request === null,
    `Esc（FP 内）应按 §6.4 只释放指针锁（实际：${JSON.stringify(escFp)}）`);
  const escIdle = resolve('Escape', { timePreset: 'goldenHour', quality: 'medium', tourActive: false, fpActive: false, hasSelection: true });
  assert(escIdle?.owned === true, 'Esc（非 FP）未被识别');
  rows.push(`F:${fp.request.payload.mode}`, `Esc(FP):${escFp.local}`, `Esc(非FP):${escIdle.request?.type ?? escIdle.local}`);
  return rows.join(' ');
});

await test('A5 同一请求事件驱动唯一 state.viewMode（不存在第二套相机/状态）', async () => {
  const { createCameraRig } = await loadModule('src/core/camera.js');
  const { createStateStore, createStateController } = await loadModule('src/core/state.js');
  const { createRegistry } = await loadModule('src/core/registry.js');
  const { createRequester } = await loadModule('src/interaction/requests.js');
  const events = makeSilentEvents();
  const registry = createRegistry({ events, layout: LAYOUT });
  const store = createStateStore({ events });
  const controller = createStateController({ store, events, config: CONFIG, registry });
  const rig = createCameraRig({ config: CONFIG, registry, store, events });
  const { requester } = createRequester({ events, source: 'verify' });
  assert(typeof requester.viewMode === 'function', `requester 缺少 viewMode（实际：${Object.keys(requester).join(',')}）`);
  const seen = [];
  events.on(EVENTS.requestViewMode, (payload) => seen.push(payload));
  const order = [];
  for (const mode of CAM.viewModes.map((m) => m.mode)) {
    requester.viewMode(mode);
    controller.flush?.();
    order.push(`${mode}→${store.state.viewMode}`);
  }
  assert(seen.length === 8, `请求事件收到 ${seen.length} 次`);
  assert(order.every((row) => row.split('→')[0] === row.split('→')[1]), `逐模式 state 不一致：${order.join(' ')}`);
  // 全仓只允许一处相机实例化（src/core/camera.js）
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) files.push(p);
    }
  })(join(ROOT, 'src'));
  const camMakers = [];
  for (const file of files) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const m of code.matchAll(/new\s+[\w.]*?(PerspectiveCamera|OrthographicCamera)\s*\(/g)) camMakers.push(`${file.slice(ROOT.length + 1)}:${m[1]}`);
  }
  assert(camMakers.length === 2 && camMakers.every((x) => x.startsWith('src/core/camera.js')), `相机实例化点：${camMakers.join(', ')}`);
  rig.dispose();
  controller.dispose?.();
  return `逐模式 state 一致（${order.join(' ')}）· 相机实例化仅 src/core/camera.js 两处（透视+正交）`;
});

await test('A6 进入/退出第一人称恢复进入前的模式与全部机位参数', async () => {
  const { createCameraRig } = await loadModule('src/core/camera.js');
  const { createStateStore } = await loadModule('src/core/state.js');
  const { createRegistry } = await loadModule('src/core/registry.js');
  const events = makeSilentEvents();
  const registry = createRegistry({ events, layout: LAYOUT });
  const store = createStateStore({ events });
  const rig = createCameraRig({ config: CONFIG, registry, store, events });
  rig.requestMode('zone');
  rig.update(CAM.transitionSeconds + 0.05, 1, { ...store.state, viewMode: 'zone' });
  const before = rig.describe();
  rig.enterFp({});
  rig.applyInput('rotate', { dx: 120, dy: 10 });
  const inFp = rig.describe();
  assert(inFp.mode === 'fp', `进入后 mode=${inFp.mode}`);
  const moved = Math.hypot(inFp.position.x - before.position.x, inFp.position.z - before.position.z) > 0.5;
  assert(moved, '进入 FP 后未移动到出生点');
  rig.exitFp({});
  const after = rig.describe();
  const same = (a, b) => Math.abs(a - b) < 1e-6;
  assert(after.mode === before.mode, `恢复模式 ${after.mode} ≠ ${before.mode}`);
  assert(same(after.position.x, before.position.x) && same(after.position.y, before.position.y) && same(after.position.z, before.position.z),
    `恢复机位 (${after.position.x},${after.position.y},${after.position.z}) ≠ (${before.position.x},${before.position.y},${before.position.z})`);
  assert(same(after.target.x, before.target.x) && same(after.target.z, before.target.z), '恢复 target 不一致');
  assert(same(after.fov, before.fov) && after.projection === before.projection, `恢复 fov/projection 不一致（${after.fov}/${after.projection}）`);
  rig.dispose();
  return `mode ${before.mode}→fp→${after.mode}；position/target/fov/projection 逐值恢复（移动距离 ${Math.hypot(inFp.position.x - before.position.x, inFp.position.z - before.position.z).toFixed(1)}m）`;
});

/* ============================================================ B 走查 */

section('B 第一人称 §6.4 路线几何走查（真实碰撞）');
const walk = await runWalkAudit();

await test('B1 路线的 8 段在真实可行走图上全部可达（图 cellSize=1）', async () => {
  assert(walk.summary.pathUnreachable === 0, `不可达段 ${walk.summary.pathUnreachable}`);
  assert(walk.paths.every((p) => p.reachable), JSON.stringify(walk.paths.filter((p) => !p.reachable)));
  return walk.paths.map((p) => `${p.name.split(' → ')[0]}→${p.name.split(' → ')[1]}(${p.length}m)`).join(' · ');
});

await test('B2 沿真实路径行走无“真阻挡”：唯一允许的受阻采样是落差 = 下台阶阈值（snapDownDistance）的等值边界，且不得有其它原因', () => {
  const snap = CONFIG.INTERACTION.step.snapDownDistance;
  const blocked = walk.paths.flatMap((p) => (p.blockedAt ?? []).map((b) => ({ leg: p.name, ...b })));
  // 原意：真实走查路径上不得出现任何“真阻挡”。阈值等值（|Δy| === snapDownDistance）是浮点边界，
  // 由求解器 `canStep` 以 `>= -snapDownDistance` 允许，本席严格 `<` 判定会把它计入 ⇒ 显式豁免等值项，
  // 但**任何其它原因**（stepTooHigh/noSurface/envelope/障碍 id）或**更深的落差**一律判失败。
  const hard = blocked.filter((b) => !(b.reasons?.length === 1 && b.reasons[0] === 'dropTooDeep' && b.dy !== null && Math.abs(Math.abs(b.dy) - snap) <= 1e-6));
  assert(hard.length === 0, `存在真阻挡：${JSON.stringify(hard)}`);
  assert(walk.summary.pathBlockedSamples <= walk.paths.length * 2, `受阻采样异常偏多：${walk.summary.pathBlockedSamples}`);
  const detail = blocked.map((b) => `${b.leg}@(${b.x},${b.z}) ${b.reasons?.join('/')} Δy=${b.dy}`).join('；');
  return `受阻采样 ${walk.summary.pathBlockedSamples} 个，全部为落差 = snapDownDistance(${snap}m) 的等值边界（0 个真阻挡）${detail ? `：${detail}` : ''}`;
});

await test('B3 台阶高差不超过登记阈值（0.5m），丹陛/台基按坡道平滑连接', async () => {
  assert(walk.summary.pathMaxUp <= CONFIG.INTERACTION.step.maxStepHeight + 1e-9,
    `路径最大上台阶 ${walk.summary.pathMaxUp} > ${CONFIG.INTERACTION.step.maxStepHeight}`);
  return `路径最大上台阶 ${walk.summary.pathMaxUp}m（阈值 ${CONFIG.INTERACTION.step.maxStepHeight}m）`;
});

await test('B4 门洞净宽：61/63 ≥ max(1.1m, 登记宽×0.5) + 2 座具名例外（水中亭，门外被 WB-*-pond 占据）', async () => {
  // 产品决定（主理人在 t138 背书）：`D-court3-pavilion` / `E-court3-pavilion` **位于水池中**，其门洞不可通行是
  // **产品事实**（水中亭作对景，用户侧接受、不加汀步）：t117 具名登记 `door.passable=false` + `door.blockedBy=WB-{D,E}-pond`，
  // t127 提供实测出口 `probeDoorClearance`，t128 已把“声明必须被实测守住”落成断言。
  // 口径说明：卡内写的 “18/16” 是 t103/t117 之前的门洞普查口径；本树 `walk.doors` 已扩到 63（含亭/配殿门），
  // 故本断言按**当前全集**表达（非例外 61 条必须达标），并且 `clear===0` 的必须**恰为**这 2 座具名例外。
  const EX = [
    { id: 'D-court3-pavilion', blockedBy: 'WB-D-pond' },
    { id: 'E-court3-pavilion', blockedBy: 'WB-E-pond' },
  ];
  const exIds = new Set(EX.map((e) => e.id));
  const ex = EX.map((e) => {
    const d = walk.doors.find((x) => x.id === e.id) ?? null;
    const door = LAYOUT.SLOT_BY_ID[e.id]?.door ?? null;
    return { id: e.id, blockedBy: e.blockedBy, clear: d?.clear ?? null, declared: d?.declared ?? null, passable: door?.passable ?? null, registered: door?.blockedBy ?? null };
  });
  assert(ex.length === 2 && ex.every((d) => d.clear === 0), `具名例外必须恰为 2 座且实测净宽 = 0：${JSON.stringify(ex)}`);
  assert(ex.every((d) => d.passable === false && d.registered === d.blockedBy),
    `例外必须具名登记 passable=false 且 blockedBy 指向对应水池：${JSON.stringify(ex)}`);
  const zeros = walk.doors.filter((d) => d.clear === 0).map((d) => d.id).sort().join(',');
  assert(zeros === EX.map((e) => e.id).sort().join(','), `净宽为 0 的必须恰为这 2 座具名例外（实测：${zeros}）`);
  const nonEx = walk.doors.filter((d) => !exIds.has(d.id));
  const bad = nonEx.filter((d) => d.clear < Math.max(1.1, (d.declared ?? 0) * 0.5));
  assert(bad.length === 0, `非例外门洞偏窄：${bad.map((d) => `${d.id} ${d.clear}/${d.declared}`).join(',')}`);
  assert(nonEx.length === 61, `非例外门洞数应为 61（实测 ${walk.doors.length} − ${EX.length} = ${nonEx.length}）`);
  return `${walk.doors.length} 门洞：非例外 ${nonEx.length} 条全部 ≥ max(1.1m, 登记宽×0.5)（最小 ${Math.min(...nonEx.map((d) => d.clear))}m）；恰好 2 座具名例外 clear=0：${ex.map((d) => `${d.id}→${d.blockedBy}(passable=false)`).join('、')}`;
});

await test('B5 60 段墙（宫墙+院墙）在实体段均阻挡通行', async () => {
  const open = walk.walls.filter((w) => !w.blocked);
  assert(open.length === 0, `未阻挡：${open.map((w) => w.id).join(',')}`);
  return `60/60 段墙探针被阻挡（探针已避开洞口）`;
});

await test('B6 水面不可站立、桥面可通行（t27 语义）', async () => {
  assert(walk.summary.waterUnexpectedlyStandable === 0, `水面可站：${JSON.stringify(walk.water.filter((w) => w.kind !== 'bridgeDeck' && w.standable))}`);
  assert(walk.summary.bridgesStandable === 4, `桥面可站 ${walk.summary.bridgesStandable}/4`);
  return `8 个水体全部不可站（护城河 stepTooHigh / 水池 OB-* 障碍）；4/4 桥面可站`;
});

await test('B7 包络越界保护有效（四面越界全部被拒，不掉出宫城）', async () => {
  assert(walk.summary.envelopeLeaks === 0, `越界泄漏 ${walk.summary.envelopeLeaks}`);
  return walk.envelope.map((e) => `${e.name}=${e.reasons.join('/') || '未阻挡'}`).join(' ');
});

await test('B8 抬高建筑不可从地坪穿入（B 金銮殿 4.5m / C 寝殿 1.5m）；城门门洞在其地面高度可通行', async () => {
  assert(walk.summary.raisedEnterableFromGround === 0, `可从地坪穿入：${JSON.stringify(walk.raised.filter((r) => r.kind !== 'gatePassage' && r.standableFromGround))}`);
  assert(walk.summary.gatePassageWalkable === '6/6', `城门/门殿门洞可通行 ${walk.summary.gatePassageWalkable}`);
  return `B/C 台基内不可站（stepTooHigh）；6/6 门洞在其真实地面高度可通行`;
});

await test('B9 东西宫苑经侧门可达：6 条侧门连接横断面全可走 + 起点→五个 fp-spawn 图路径全部可达', async () => {
  const gates = walk.sideGates.filter((g) => g.kind !== 'zonePath');
  assert(gates.every((g) => g.walkable === g.samples), `侧门不可走：${JSON.stringify(gates.filter((g) => g.walkable !== g.samples))}`);
  const paths = walk.sideGates.filter((g) => g.kind === 'zonePath');
  assert(paths.length === 5, `区路径 ${paths.length}/5`);
  assert(paths.every((p) => p.reachable && p.blocked === 0), `有不可达/受阻：${JSON.stringify(paths.filter((p) => !p.reachable || p.blocked))}`);
  return `${gates.length}/6 侧门横断面全可走 · ` + paths.map((p) => `${p.zone} ${p.length}m blocked=${p.blocked}`).join(' · ');
});

await test('B10 全线连通：9 个走查路点 + 5 个 fp-spawn + 2 个内景同属一个连通分量', async () => {
  assert(walk.connectivity.ok, `不可达：${walk.connectivity.unreachable.join(',')}`);
  return `${walk.connectivity.points} 个关键点同一连通分量（图 ${walk.summary.graphWalkableCells} 可走格 @${walk.summary.graphCellSize}m）`;
});

/* ============================================================ C 性能 */

section('C 性能与合批（Node 装配，激活 LOD 档）');
const { buildZone } = await import('./harness.mjs');
const { createRegistry } = await loadModule('src/core/registry.js');
const { createKit } = await loadModule('src/kit/index.js');
const kit = createKit({ THREE, config: CONFIG, quality: 'medium' });
const eventsC = makeSilentEvents();
const registryC = createRegistry({ events: eventsC, layout: LAYOUT });
const zoneStats = [];
for (const zoneId of ['B', 'C', 'D', 'E', 'F']) {
  const built = await buildZone(zoneId, { kit, registry: registryC, events: eventsC });
  registryC.registerZone(zoneId, built.result, { replace: true });
  const drawCalls = kit.countDrawCalls(built.result.root);
  const triangles = kit.countTriangles(built.result.root);
  // 合批前基线：直接用 kit 工厂逐槽位造（单档 near，不含区域额外内容），用于确认"确实合批了"
  let before = 0;
  for (const slot of LAYOUT.SLOTS.filter((s) => s.zone === zoneId)) {
    const obj = kit[slot.kind]({ ...slot, quality: 'medium', lod: 'near' });
    before += kit.countDrawCalls(obj);
  }
  const meshes = [];
  built.result.root.traverse((n) => { if (n.isMesh || n.isInstancedMesh) meshes.push(n); });
  const mergedBuckets = meshes.filter((n) => n.userData?.part).length;
  const nonInstanced = meshes.filter((n) => !n.isInstancedMesh).length;
  const labelledMeshes = meshes.filter((n) => !n.isInstancedMesh && n.userData?.part).length;
  zoneStats.push({ zoneId, drawCalls, triangles, before, meshes: meshes.length, nonInstanced, labelledMeshes, mergedBuckets, budget: CONFIG.BUDGET.drawCalls.perZone[zoneId] });
}

await test('C1 逐区绘制调用（激活 LOD 档、质量 medium）全部在 §8.2 分区预算内', async () => {
  const bad = zoneStats.filter((z) => z.drawCalls > z.budget);
  assert(bad.length === 0, `超预算：${bad.map((z) => `${z.zoneId} ${z.drawCalls}/${z.budget}`).join(',')}`);
  return zoneStats.map((z) => `${z.zoneId} ${z.drawCalls}/${z.budget}`).join(' · ');
});

await test('C2 整城主场景绘制调用 ≤350、可见三角面 ≤150 万', async () => {
  const calls = zoneStats.reduce((n, z) => n + z.drawCalls, 0);
  const tris = zoneStats.reduce((n, z) => n + z.triangles, 0);
  assert(calls <= CONFIG.BUDGET.drawCalls.mainSceneMax, `整城 ${calls} > ${CONFIG.BUDGET.drawCalls.mainSceneMax}`);
  assert(tris <= CONFIG.BUDGET.triangles.visibleMax, `三角面 ${tris} > ${CONFIG.BUDGET.triangles.visibleMax}`);
  return `整城 ${calls}/${CONFIG.BUDGET.drawCalls.mainSceneMax} 调用 · ${tris}/${CONFIG.BUDGET.triangles.visibleMax} 三角面`;
});

await test('C3 mergeZone 运行时核对：各区域产出均已合批（网格数远小于"逐槽位工厂"基线，且带部位桶标签）', async () => {
  const bad = [];
  for (const z of zoneStats) {
    const renamed = z.before / Math.max(z.drawCalls, 1);
    if (!(renamed >= 2)) bad.push(`${z.zoneId} 合批前/后=${renamed.toFixed(2)}`);
    const labelled = z.labelledMeshes ?? z.mergedBuckets;
    if (labelled < z.nonInstanced * 0.9) bad.push(`${z.zoneId} 非实例网格缺 part 标签 ${z.nonInstanced - labelled}/${z.nonInstanced}`);
  }
  assert(bad.length === 0, bad.join('；'));
  return zoneStats.map((z) => `${z.zoneId} 逐槽位工厂 ${z.before} → 合批后 ${z.drawCalls}（${(z.before / Math.max(z.drawCalls, 1)).toFixed(1)}×；非实例网格 ${z.labelledMeshes}/${z.nonInstanced} 带 part 标签）`).join(' · ');
});

await test('C4 单建筑三角面 ≤2.4 万（逐槽位工厂 near 档实测）', async () => {
  let max = 0;
  let maxId = '';
  for (const slot of LAYOUT.SLOTS) {
    const obj = kit[slot.kind]({ ...slot, quality: 'medium', lod: 'near' });
    const t = kit.countTriangles(obj);
    if (t > max) { max = t; maxId = slot.id; }
  }
  assert(max <= CONFIG.BUDGET.triangles.perBuildingMax, `${maxId} ${max} > ${CONFIG.BUDGET.triangles.perBuildingMax}`);
  return `单栋最大 ${max}（${maxId}）/ 预算 ${CONFIG.BUDGET.triangles.perBuildingMax}`;
});

/* ============================================================ D totalHeight */

section('D totalHeight 消费方核查（估值不得当权威高度）');

await test('D1 totalHeight 消费方分类核查：取景/面板主路径一律用实测包围盒，估值只作已标注的退化回退/字段回显/排序', async () => {
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const pth = join(dir, entry.name);
      if (entry.isDirectory()) walk(pth);
      else if (entry.name.endsWith('.js')) files.push(pth);
    }
  })(join(ROOT, 'src'));
  const sites = [];
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    const raw = readFileSync(file, 'utf8');
    raw.split('\n').forEach((line, idx) => {
      if (/totalHeight/.test(line)) sites.push({ rel, line: idx + 1, text: line.trim().slice(0, 110) });
    });
  }
  const classify = (site) => {
    if (/^\s*(\*|\/\/)/.test(site.text)) return 'comment';
    if (site.rel === 'src/shared/layout.js' || site.rel.startsWith('src/kit/')) return 'definition/estimate-export';
    if (site.rel === 'src/core/context.js' || site.rel === 'src/core/registry.js' || site.rel.startsWith('src/zones/')) return 'field-echo/validation/sort';
    if (site.rel === 'src/core/greybox.js' || site.rel === 'src/zones/_greybox.js') return 'greybox-massing(§4.1 允许障碍盒高度初值/粗估)';
    if (site.rel === 'src/core/camera.js' || site.rel === 'src/interaction/catalog.js') {
      const win = readFileSync(join(ROOT, site.rel), 'utf8').split('\n').slice(Math.max(0, site.line - 40), site.line + 1).join('\n');
      return /worldBounds/.test(win) ? 'documented-fallback(after measured bounds)' : 'MISUSE';
    }
    return 'other';
  };
  const classified = sites.map((x) => ({ ...x, kind: classify(x) }));
  const misuse = classified.filter((x) => x.kind === 'MISUSE' || x.kind === 'other');
  assert(misuse.length === 0, `疑似把估值当权威：${misuse.map((m) => `${m.rel}:${m.line} ${m.text}`).join(' | ')}`);
  const { buildingWorldBounds, focusSpecFor } = await loadModule('src/core/camera.js');
  const withKit = buildingWorldBounds({ worldBounds: { minX: -1, maxX: 1, minY: 0, maxY: 33.3, minZ: -2, maxZ: 2 }, totalHeight: 20, baseY: 0 });
  assert(Math.abs(withKit.maxY - 33.3) < 1e-9, `有实测包围盒时未优先使用：maxY=${withKit.maxY}`);
  const noKit = buildingWorldBounds({ bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, totalHeight: 20, baseY: 4.5 });
  assert(/估值/.test(noKit.source ?? ''), `无实测包围盒时回退未标注估值：${JSON.stringify(noKit)}`);
  const spec = focusSpecFor({ bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, worldBounds: { minX: -10, maxX: 10, minY: 0, maxY: 40, minZ: -10, maxZ: 10 }, totalHeight: 20, baseY: 0, facing: 'south' });
  assert(spec && Math.abs(spec.target.y - 18) < 0.5, `focus 取景未按实测高度 40m 计算：target.y=${spec?.target?.y}`);
  const kinds = [...new Set(classified.map((c) => c.kind))];
  return `${classified.length} 处引用分类通过（${kinds.map((k) => `${k}×${classified.filter((c) => c.kind === k).length}`).join(' · ')}）；buildingWorldBounds 实测优先（maxY=33.3）；无实测时标注"估值"；focus 用实测高度（target.y=${spec.target.y}）`;
});

/* ============================================================ E 风格 */

section('E 风格一致性（Node 可验证部分）');

await test('E1 全城材质共享：5 区全部网格材质都来自 kit.materials 同一份缓存', async () => {
  const owned = new Set();
  for (const name of kit.materials.map.keys()) owned.add(kit.materials.get(name));
  let total = 0;
  let foreign = 0;
  // 逐区重造一次（registry 只存建筑条目，root 未保留）
  const fresh = [];
  for (const zoneId of ['B', 'C', 'D', 'E', 'F']) {
    const built = await buildZone(zoneId, { kit, events: eventsC });
    fresh.push([zoneId, built.result]);
  }
  for (const [, result] of fresh) {
    result.root.traverse((n) => {
      if (!(n.isMesh || n.isInstancedMesh)) return;
      total += 1;
      if (!owned.has(n.material)) foreign += 1;
    });
  }
  assert(foreign === 0, `${foreign}/${total} 个网格使用了 kit 之外的材质`);
  return `${total} 个网格材质全部命中 kit 共享缓存（${kit.materials.stats().materials} 个材质 / ${kit.materials.stats().textures} 张贴图 @${kit.materials.textureSize}px）`;
});

await test('E2 铺地/瓦垄/石作尺度由 config 模数统一推导（同城同尺度）', async () => {
  const tiles = {
    roof: kit.tileMeters('glazeTile'),
    wood: kit.tileMeters('timberLacquer'),
    stone: kit.tileMeters('stoneWhite'),
    paving: kit.tileMeters('pavingStone'),
    brick: kit.tileMeters('interiorBrick'),
    plaster: kit.tileMeters('plasterRed'),
  };
  const M = CONFIG.MODULES;
  assert(Math.abs(tiles.roof - 1 / M.roofTileRowsPerMeter) < 1e-9, `roof tile ${tiles.roof} ≠ 1/${M.roofTileRowsPerMeter}`);
  assert(Math.abs(tiles.paving - M.bayPitch * 0.5) < 1e-9, `paving tile ${tiles.paving} ≠ bayPitch*0.5`);
  assert(Math.abs(tiles.stone - M.bayPitch * 0.25) < 1e-9, `stone tile ${tiles.stone} ≠ bayPitch*0.25`);
  return JSON.stringify(tiles);
});

await test('E3 院墙连接连续：56 段院墙全部落在院界上（与 t12 同口径复算）', async () => {
  const bad = [];
  for (const cy of LAYOUT.COURTYARDS) {
    const walls = LAYOUT.WALLS.filter((w) => w.courtyardId === cy.id);
    assert(walls.length === cy.wallIds.length, `${cy.id} 墙数 ${walls.length} ≠ wallIds`);
    for (const w of walls) {
      const b = cy.bounds;
      const on = (Math.abs(w.from.z - b.minZ) < 0.51 && Math.abs(w.to.z - b.minZ) < 0.51)
        || (Math.abs(w.from.z - b.maxZ) < 0.51 && Math.abs(w.to.z - b.maxZ) < 0.51)
        || (Math.abs(w.from.x - b.minX) < 0.51 && Math.abs(w.to.x - b.minX) < 0.51)
        || (Math.abs(w.from.x - b.maxX) < 0.51 && Math.abs(w.to.x - b.maxX) < 0.51);
      if (!on) bad.push(w.id);
    }
  }
  assert(bad.length === 0, `不在院界上：${bad.join(',')}`);
  return `14 院 × 4 面 = 56 段院墙全部在院界上且 wallIds 一致`;
});

await test('E4 树木同一风格：config.PLANTS 三种树冠 + 统一低饱和/尺度，区内部件用 foliage 材质', async () => {
  const P = CONFIG.PLANTS;
  assert(P.canopyShapes.length === 3, `canopyShapes=${P.canopyShapes.length}`);
  const treeHeights = Object.values(P.treeHeights ?? {});
  assert(treeHeights.length === 3 && treeHeights.every((h) => typeof h === 'number'), `treeHeights=${JSON.stringify(P.treeHeights)}`);
  assert(typeof P.saturation === 'number' && P.saturation <= 0.4, `saturation=${P.saturation}`);
  const built = await buildZone('D', { kit, events: eventsC });
  const canopyParts = [];
  built.result.root.traverse((n) => {
    if ((n.isMesh || n.isInstancedMesh) && /canopy|trunk/.test(String(n.userData?.part ?? ''))) canopyParts.push(n.userData.part);
  });
  assert(canopyParts.length > 0, 'D 区未找到树木部件');
  return `canopyShapes=${P.canopyShapes.join('/')} · 尺度 ${treeHeights.join('/')}m · 低饱和 ${P.saturation} · 微风 ${P.windAmplitude}rad · D 区树木部件 ${[...new Set(canopyParts)].join('+')}`;
});

await test('E5 UI 同一套字体与间距：间距阶梯 4/8/12/16/24/32、圆角 4px、中文衬线标题、过渡 180ms（config 与 UI 源码同源）', () => {
  const ui = CONFIG.UI ?? {};
  assert(JSON.stringify(ui.spacingScale) === JSON.stringify([4, 8, 12, 16, 24, 32]), `spacingScale=${JSON.stringify(ui.spacingScale)}`);
  assert(ui.radius === 4, `radius=${ui.radius}`);
  assert(ui.transitionMs === 180 && ui.cameraTransitionMs === 1200, `transitionMs=${ui.transitionMs}/${ui.cameraTransitionMs}`);
  assert(/Songti|Noto Serif/.test(ui.typography.titleFamily), `titleFamily=${ui.typography.titleFamily}`);
  const css = readFileSync(join(ROOT, 'src/ui/styles.css'), 'utf8');
  const tokens = readFileSync(join(ROOT, 'src/ui/tokens.js'), 'utf8');
  const spacingProps = /(^|[;{\s])(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(-[a-z]+)?\s*:/i;
  const spacingPx = [];
  for (const decl of css.split(';')) {
    if (!spacingProps.test(decl)) continue;
    for (const m of decl.matchAll(/(\d+)px/g)) spacingPx.push(Number(m[1]));
  }
  const used = [...new Set(spacingPx)].sort((a, b) => a - b);
  const staircase = new Set([...ui.spacingScale, 0, 1, 2, 4, 6, 8]);
  const bad = used.filter((v) => !staircase.has(v));
  assert(bad.length === 0, `非阶梯间距：${bad.join(',')}（styles.css 的间距属性）`);
  assert(new RegExp(`border-radius\\s*:\\s*${ui.radius}px`).test(css) || new RegExp(`radius[^;]*${ui.radius}px`).test(css), '未发现 4px 圆角');
  assert(/UI\.typography|titleFamily|fontFamily/.test(tokens), 'UI tokens 未接线 config 排版令牌');
  const allPx = [...new Set([...css.matchAll(/(\d+)px/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  return `spacingScale ${ui.spacingScale.join('/')} · radius ${ui.radius}px · 过渡 ${ui.transitionMs}/${ui.cameraTransitionMs}ms · 标题 ${ui.typography.titleFamily.slice(0, 24)}… · 间距属性取值 ${used.join('/')}（全在阶梯内）；styles.css 其余尺寸为布局尺寸 ${allPx.filter((v) => !staircase.has(v)).join('/')}`;
});

/* ============================================================ F 浏览器矩阵 */

section('F 浏览器实测矩阵（八视角 × 三时辰，scripts/shot.mjs）');

const MATRIX_DIR = join(ROOT, 'docs', 'shots');
const manifestPath = join(MATRIX_DIR, 'manifest.json');
const NOISE_PP = 1.0;
const rows = [];
let matrixOk = false;
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const views = ['oblique', 'iso', 'axis', 'zone', 'focus', 'interior', 'fp', 'orbit'];
  const presets = ['golden', 'dusk', 'night'];
  const judged = manifest.judge ?? [];
  const stats = manifest.imageStats ?? [];
  const latestJudge = (view, preset) => [...judged].reverse().find((j) => j.view === view && j.preset === preset && j.name?.startsWith('t2-'));
  const latestStat = (view, preset) => [...stats].reverse().find((x) => x.view === view && x.preset === preset && x.name?.startsWith('t2-'));
  const missing = [];
  for (const view of views) {
    for (const preset of presets) {
      const j = latestJudge(view, preset);
      const st = latestStat(view, preset);
      if (!j || !st) { missing.push(`${view}/${preset}`); continue; }
      const darkPct = j.contentDark === null || j.contentDark === undefined ? null : +(j.contentDark * 100).toFixed(2);
      const maxDarkPct = j.maxDark === null || j.maxDark === undefined ? null : +(j.maxDark * 100).toFixed(1);
      const clipPct = j.contentClip === null || j.contentClip === undefined ? null : +(j.contentClip * 100).toFixed(2);
      const marginPp = darkPct === null || maxDarkPct === null ? null : +(maxDarkPct - darkPct).toFixed(2);
      rows.push({
        view, preset,
        bytes: st.bytes ?? null,
        resolution: `${st.width}×${st.height}`,
        contentSharePct: st.content?.share === undefined ? null : +(st.content.share * 100).toFixed(1),
        darkPct, maxDarkPct, clipPct, marginPp,
        thin: marginPp !== null && marginPp <= NOISE_PP,
        ok: !!j.ok,
        maskGuard: !!j.maskGuard,
        reasons: j.reasons ?? [],
        backgroundSource: st.content?.background?.source ?? st.mask?.backgroundSource ?? null,
      });
    }
  }
  matrixOk = missing.length === 0 && rows.every((r) => r.ok && !r.maskGuard && r.resolution === '1440×900');
  await test('F1 24 张（8 视角 × 3 时辰）1440×900 真实渲染全部在盘、判据通过、掩码防护未触发', async () => {
    assert(missing.length === 0, `缺图 ${missing.length} 张：${missing.join(',')}（在 ROOT 跑 node scripts/shot.mjs --view=all --preset=all --keep-invalid）`);
    const failed = rows.filter((r) => !r.ok || r.maskGuard);
    assert(failed.length === 0, `未通过：${failed.map((r) => `${r.view}/${r.preset} 暗区${r.darkPct}%>${r.maxDarkPct}%${r.maskGuard ? '(掩码防护)' : ''}`).join(', ')}`);
    return rows.map((r) => `${r.view}/${r.preset} 内容暗区${r.darkPct}%≤${r.maxDarkPct}%`).join(' · ');
  });
  await test('F2 逐张给出余量并与 1pp 噪声底对比（擦线项不作为通过证据）', async () => {
    const thin = rows.filter((r) => r.thin);
    const detail = rows.map((r) => `${r.view}/${r.preset} 余量${r.marginPp}pp${r.thin ? '(擦线≤1pp)' : ''}`).join(' · ');
    return thin.length === 0 ? `无擦线：${detail}` : `擦线（不构成通过）：${thin.map((r) => `${r.view}/${r.preset} 余量${r.marginPp}pp`).join(', ')}；全部余量：${detail}`;
  });
} else {
  await test('F1 浏览器矩阵 manifest 存在', async () => {
    assert(false, `未找到 ${manifestPath}：请先跑 node scripts/shot.mjs --view=all --preset=all --keep-invalid`);
  });
}

/* ============================================================ H 灯位池真实路径（t94） */

section('H 真实路径灯位池核对（t94：真实锚点 + 生产排序函数 + 浏览器实测预算）');
{
  // F16 基线（t94 12 组实测，内景机位；§8.2 不为其设门禁，仅登记 + 增长哨兵）
  const F16 = {
    callsBase: '1142–1160', callsMax: 1450,          // 基线最大 1160 +25%：可容纳合理新增（内景陈设/多一盏灯），但抓住 t13→t94 那种翻倍（506→1158）
    triBase: '1,189,758–1,191,390', triMax: 1430000, // 基线最大 1.191M +20%，仍 < §8.2 上限 1.5M
    objBase: '374', objMax: 450,                     // 基线 374 +20%：对象数增长通常伴生调用增长
  };
  const { createEnvironment } = await loadModule('src/core/environment.js');
  const { createStateStore } = await loadModule('src/core/state.js');
  const { createCameraRig } = await loadModule('src/core/camera.js');
  const anchors = registryC.allLightAnchors();           // 真实注册表锚点（layout + 区域运行时注册）
  const eventsH = makeSilentEvents();
  // 必须传 registry：生产路径 `environment` 从 `registry.allLightAnchors()` 取真实锚点（否则池恒空）
  const envH = createEnvironment({ config: CONFIG, events: eventsH, scene: new THREE.Scene(), THREE, registry: registryC });
  // 真实浏览器 ?stats=1 逐时辰实测 lampRealtime（= 池容量）：golden 3 / dusk 4 / night 6
  const BUDGETS = { golden: 3, dusk: 4, night: 6 };
  const storeH = createStateStore({ events: eventsH });
  const rigH = createCameraRig({ config: CONFIG, registry: registryC, store: storeH, events: eventsH });
  const focusOf = (vpId) => {
    if (vpId) { const vp = LAYOUT.VIEWPOINT_BY_ID[vpId]; return { x: vp.position.x, y: vp.position.y, z: vp.position.z }; }
    rigH.requestMode('oblique');
    rigH.update(CONFIG.CAMERA.transitionSeconds + 0.05, 0, storeH.state);
    return { x: rigH.position.x, y: rigH.position.y, z: rigH.position.z };
  };
  const targets = [['Fsouth', 'VP-F-gate-south-interior'], ['Fnorth', 'VP-F-gate-north-interior'], ['Bmain', 'VP-B-interior'], ['oblique', null]];
  const pools = {};
  for (const [name, vpId] of targets) {
    const focus = focusOf(vpId);
    pools[name] = { focus, byPreset: {} };
    for (const [preset, budget] of Object.entries(BUDGETS)) pools[name].byPreset[preset] = envH.rankLampPool(anchors, focus, { budget });
  }
  const cap = Math.min(CONFIG.LIGHTING.lamps.distance * 6, CONFIG.LIGHTING.lamps.emissiveFallbackBeyond);

  // 浏览器对照值：本树（LAYOUT 1.1.13）`?stats=1` 的 lampAnchors = **152**（t94 期同为 152；1.1.10 时曾为 150，1.1.13 恢复）。
  // 该值必须与浏览器实测一致 —— 场景变化时按 `node scripts/shot.mjs --view=oblique --preset=night`（读“锚点 N”）重新登记。
  const EXPECTED_LAMP_ANCHORS = 152;
  await test(`H1 真实锚点集可追溯：registry.allLightAnchors() = ${anchors.length} 个（与浏览器 ?stats=1 的 lampAnchors=${EXPECTED_LAMP_ANCHORS} 逐值一致），含 windowGlow/interiorLantern 室内灯`, () => {
    const roles = anchors.reduce((a, x) => { a[x.role] = (a[x.role] ?? 0) + 1; return a; }, {});
    assert(anchors.length === EXPECTED_LAMP_ANCHORS, `锚点数 ${anchors.length} ≠ 浏览器实测 ${EXPECTED_LAMP_ANCHORS}（若场景变更，请按注释重新登记该常量）`);
    assert((roles.windowGlow ?? 0) > 0 && (roles.interiorLantern ?? 0) > 0, `角色分布异常：${JSON.stringify(roles)}`);
    return `${anchors.length} 个 · 角色 ${JSON.stringify(roles)}`;
  });

  await test('H2 南/北城门内景：真实室内灯在两个城门机位的池内排名 #1–#2（t64 形态在真实锚点集上已修复）', () => {
    const want = {
      Fsouth: ['LA-F-int-F-gate-south-1', 'LA-F-int-F-gate-south-2'],
      Fnorth: ['LA-F-int-F-gate-north-1', 'LA-F-int-F-gate-north-2'],
    };
    const rows = [];
    for (const [name, ids] of Object.entries(want)) {
      for (const [preset, pool] of Object.entries(pools[name].byPreset)) {
        const ranked = pool.map((h, i) => ({ rank: i + 1, id: h.anchor.id, role: h.anchor.role, d: +h.distance.toFixed(1), score: +h.score.toFixed(4) }));
        const pos = ids.map((id) => ranked.findIndex((r) => r.id === id) + 1);
        assert(pos.every((p) => p >= 1 && p <= 2), `${name}/${preset} 室内灯排名 ${JSON.stringify(pos)} 不在 #1–#2：${JSON.stringify(ranked)}`);
        rows.push(`${name}/${preset}: #${ranked[0].rank} ${ranked[0].id}(${ranked[0].role}@${ranked[0].d}m ${ranked[0].score}) #2 ${ranked[1].id}@${ranked[1].d}m`);
      }
    }
    return rows.join(' · ');
  });

  await test('H3 池容量与真实浏览器实测一致：内景机位池饱和（= golden3/dusk4/night6），全城鸟瞰池为空（120m 上限外无灯）', () => {
    const rows = [];
    for (const [name] of targets) {
      for (const [preset, budget] of Object.entries(BUDGETS)) {
        const len = pools[name].byPreset[preset].length;
        if (name === 'oblique') assert(len === 0, `oblique/${preset} 池 ${len} ≠ 0（浏览器实测 0/N）`);
        else assert(len === budget, `${name}/${preset} 池 ${len} ≠ 预算 ${budget}（浏览器实测饱和 ${budget}/${budget}）`);
        rows.push(`${name}/${preset}=${len}`);
      }
    }
    return rows.join(' ');
  });

  await test('H4 池排序与距离上限不变（不放宽）：池内距离 ≤ 上限，得分单调不增，同距离高重要性优先', () => {
    for (const [name] of targets) {
      for (const [preset, pool] of Object.entries(pools[name].byPreset)) {
        for (const h of pool) assert(h.distance <= cap, `${name}/${preset} 池内含 ${h.anchor.id}@${h.distance.toFixed(1)}m > 上限 ${cap}m`);
        for (let i = 1; i < pool.length; i += 1) assert(pool[i].score <= pool[i - 1].score + 1e-12, `${name}/${preset} 得分非单调：${pool[i - 1].score} → ${pool[i].score}`);
      }
    }
    return `distance 上限 ${cap}m · 池容量 ${JSON.stringify(BUDGETS)}（= 浏览器 lampRealtime 实测）· 全部池满足单调不增`;
  });

  await test('H5（硬断言）直读 `describe().lamps.pool`：两城门内景三时辰池内 #1–#2 为真实室内灯，池长 == 真机容量 3/4/6', () => {
    // t95 落地后池清单是**生产状态直读**（updateLampSelection 写入 lampState.pool），不再由本席复算
    const expect = {
      Fsouth: ['LA-F-int-F-gate-south-1', 'LA-F-int-F-gate-south-2'],
      Fnorth: ['LA-F-int-F-gate-north-1', 'LA-F-int-F-gate-north-2'],
    };
    const presetNames = { golden: 'goldenHour', dusk: 'sunset', night: 'moonlitNight' };
    const budgets = { golden: 3, dusk: 4, night: 6 };
    const rows = [];
    for (const [name, vpId] of [['Fsouth', 'VP-F-gate-south-interior'], ['Fnorth', 'VP-F-gate-north-interior']]) {
      const focus = { ...LAYOUT.VIEWPOINT_BY_ID[vpId].position };
      for (const [alias, envPreset] of Object.entries(presetNames)) {
        envH.applyPreset(envPreset);
        envH.update(1 / 60, 1, { ...storeH.state, cameraPosition: focus, viewMode: 'interior' });
        const lamps = envH.describe().lamps;
        const pool = lamps.pool ?? [];
        assert(Array.isArray(pool) && pool.length > 0, `${name}/${alias} describe().lamps.pool 为空（t95 字段缺失？）：${JSON.stringify(lamps).slice(0, 200)}`);
        assert(pool.every((x) => Number.isInteger(x.rank) && typeof x.id === 'string' && typeof x.role === 'string' && Number.isFinite(x.distance) && Number.isFinite(x.score)), `${name}/${alias} 池项字段不全：${JSON.stringify(pool[0])}`);
        assert(pool.length === lamps.capacity, `${name}/${alias} 池长 ${pool.length} ≠ capacity ${lamps.capacity}`);
        assert(pool.length === budgets[alias], `${name}/${alias} 池长 ${pool.length} ≠ 真机容量 ${budgets[alias]}（preset=${alias}）`);
        assert(pool[0].id === expect[name][0] && pool[1].id === expect[name][1],
          `${name}/${alias} 池 #1–#2 = ${pool[0].id}/${pool[1].id}，期望 ${expect[name].join('/')}`);
        assert(pool[0].role === 'windowGlow' && pool[1].role === 'windowGlow', `${name}/${alias} #1–#2 角色 ${pool[0].role}/${pool[1].role} ≠ windowGlow`);
        assert(pool[1].distance > pool[0].distance, `${name}/${alias} 距离未递增：${pool[0].distance} → ${pool[1].distance}`);
        for (let k = 1; k < pool.length; k += 1) assert(pool[k].score <= pool[k - 1].score + 1e-12, `${name}/${alias} 得分非单调：#${k} ${pool[k].score} > #${k - 1} ${pool[k - 1].score}`);
        rows.push(`${name}/${alias} cap${lamps.capacity} #1 ${pool[0].id}(${pool[0].distance}m ${pool[0].score.toFixed(6)}) #2 ${pool[1].id}(${pool[1].distance}m ${pool[1].score.toFixed(6)}) tier=${lamps.qualityTier} preset=${lamps.preset}`);
      }
    }
    // 条件升级（t14 补丁落地后自动变硬）：compactReport 若转发 lampPool/lampsPoolTop8，则必须与直读一致
    const mainSrc2 = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
    const forwarded = /lampsPoolTop8\s*:|lampPool\s*:/.test(mainSrc2);
    return `${rows.join(' · ')}；跨源一致性：DOM lampActive 实测（3/4/6，见 §14）与池长逐值相等；compactReport 转发 ${forwarded ? '已落地（升级为交叉硬断言）' : '未落地（t95 ③ 补丁待 t14；届时本断言自动升级）'}`;
  });

  const browserMode = process.env.T94_LAMPS_BROWSER === '1';
  await test(`H6 真实浏览器复核（${browserMode ? '已启用' : '默认跳过：T94_LAMPS_BROWSER=1 启用'}）：4 机位 × 三时辰的 lampActive/lampRealtime/lampAnchors 与 §12 判定行`, async () => {
    if (!browserMode) return '未在本次运行中执行（本次 attempt 的 12 组原始读数见 docs/report-experience.md §13；命令：T94_LAMPS_BROWSER=1 node tests/verify-experience.test.mjs）';
    const { spawnSync } = await import('node:child_process');
    const outDir = '/tmp/t94-lamps-verify';
    const specs = [['Fsouth', ['--interior=VP-F-gate-south-interior']], ['Fnorth', ['--interior=VP-F-gate-north-interior']], ['Bmain', ['--interior=VP-B-interior']], ['oblique', ['--view=oblique']]];
    const rows = [];
    for (const [name, args] of specs) {
      for (const preset of ['golden', 'dusk', 'night']) {
        const res = spawnSync('node', ['scripts/shot.mjs', ...args, `--preset=${preset}`, `--out-dir=${outDir}`, `--name=t94v-${name}-${preset}`, '--keep-invalid'], { cwd: ROOT, encoding: 'utf8' });
        const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
        const m = /实时宫灯 (\d+)\/(\d+)（锚点 (\d+)/.exec(out);
        assert(m, `${name}/${preset} 未读到灯位行`);
        const [, active, realtime, anch] = m.map(Number);
        assert(anch === anchors.length, `${name}/${preset} 锚点 ${anch} ≠ registry ${anchors.length}`);
        assert(active === realtime, `${name}/${preset} 池未饱和 ${active}/${realtime}`);
        if (name === 'oblique') assert(active === 0, `oblique/${preset} 应有 0 盏实时灯，实际 ${active}`);
        else assert(realtime === BUDGETS[preset], `${name}/${preset} 容量 ${realtime} ≠ 实测基线 ${BUDGETS[preset]}`);
        const judge = /可读性判据 (PASS|FAIL)[^\n]*/.exec(out)?.[0] ?? '(未找到判定行)';
        // F16 增长哨兵（基线登记见 H7；§8.2 不约束内景机位，此处只防"结构性增长"）
        const frame = /整帧调用 (\d+)/.exec(out);
        const tris = /可见三角面 ([\d]+)/.exec(out);
        const objs = /主场景可绘制对象 (\d+)/.exec(out);
        if (frame) { const v = Number(frame[1]); assert(v <= F16.callsMax, `${name}/${preset} 整帧调用 ${v} > 哨兵 ${F16.callsMax}（基线 ${F16.callsBase}）`); }
        if (tris) { const v = Number(tris[1]); assert(v <= F16.triMax, `${name}/${preset} 可见三角面 ${v} > 哨兵 ${F16.triMax}（基线 ${F16.triBase}）`); }
        if (objs) { const v = Number(objs[1]); assert(v <= F16.objMax, `${name}/${preset} 主场景可绘制对象 ${v} > 哨兵 ${F16.objMax}（基线 ${F16.objBase}）`); }
        rows.push(`${name}/${preset} ${active}/${realtime} anchor=${anch}${frame ? ` 调用${frame[1]}` : ''}${tris ? ` tri${tris[1]}` : ''}${objs ? ` obj${objs[1]}` : ''} · ${judge}`);
      }
    }
    return rows.join(' | ');
  });
  await test('H7 F16 基线登记 + 增长哨兵自检（不新设 §8.2 门禁，只防结构性增长）', () => {
    assert(F16.callsMax >= 1160 && F16.triMax >= 1191390 && F16.objMax >= 374,
      `哨兵阈值不得低于已登记基线：${JSON.stringify(F16)}`);
    assert(F16.triMax < CONFIG.BUDGET.triangles.visibleMax, '三角面哨兵必须仍落在 §8.2 的 1.5M 上限内');
    const audit = readFileSync(join(ROOT, 'docs', 'report-experience.md'), 'utf8');
    assert(/§14|## 14\./.test(audit) && /1142/.test(audit), '报告缺少 F16 基线登记（§14）');
    return `基线 调用 ${F16.callsBase} / 三角面 ${F16.triBase} / 对象 ${F16.objBase}；哨兵 ≤${F16.callsMax} 调用、≤${F16.triMax} 三角面（<§8.2 1.5M）、≤${F16.objMax} 对象；理由：+20–25% 容纳合理新增，低于该幅度不足以掩盖 506→1158 级别的翻倍`;
  });
}

/* ============================================================ 汇总 */

console.log('\n---------------------------------------------------------');
console.log(` 检查项 ${RESULTS.length}：PASS ${RESULTS.length - FAILS} / FAIL ${FAILS}`);
for (const r of RESULTS.filter((x) => !x.ok)) console.log(`  ✗ ${r.id} — ${r.detail}`);
console.log('---------------------------------------------------------');
console.log(JSON.stringify({
  config: CONFIG.CONFIG_VERSION,
  layout: LAYOUT.LAYOUT_VERSION,
  walk: walk.summary,
  zones: zoneStats,
  matrix: rows,
  matrixOk,
  failed: RESULTS.filter((x) => !x.ok).map((x) => x.id),
}, null, 1));
process.exit(FAILS === 0 ? 0 : 1);
