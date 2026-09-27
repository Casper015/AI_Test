/**
 * `scripts/probe-fp-controls.mjs` —— 第一人称操控的**真机读数探针**（t2）。
 * =============================================================================
 * 复现/验收四项：
 *   ① A/D 位移方向 vs 相机 right 向量（给原始读数：起始位置 / 朝向 / right / 逐键位移增量）
 *   ② Space：现状是否起导览 / 修复后跳跃（顶点 ≤1.0m、落地 y 逐值 = surfaceY+fpEyeHeight）
 *   ③ 空中水平碰撞（飞行途中从不进入障碍体块）+ 非可站立落点回起跳点
 *   ④ F 再按一次是否退出第一人称（无选中 / 有选中两种上下文）
 *   ⑤ `teleport` 相位（t15）：选中一处 + 进第一人称 ⇒ 落在它旁边（门外锚点/入口锚点 ≤1m、眼高逐值、
 *      两次结果逐值一致且与"最近出生点"无关、纯函数不动机位、整圈被挡时如实失败且不改视图、
 *      严格模式返回 null、默认模式回落登记出生点、撤挡即恢复、Esc/G/F 互不冲突）
 *
 * 协议（与 t104/t162/t1 同源）：真实 headless Chrome + CDP；**冻结页面 rAF** 后由
 * `stepFrame(dt)` 复刻 `main.js frameStep` 的调用序列（zones→rig→environment→render→recordFrame），
 * 因此"一帧"是精确的 dt，且按键由真实 `KeyboardEvent` 走生产键盘层（capture 层 + core 层都在）。
 *
 * 用法：
 *   node scripts/probe-fp-controls.mjs                                   # 全部相位，打印读数
 *   node scripts/probe-fp-controls.mjs --phases=read,ad --expect=adD:>=0.5
 *   node scripts/probe-fp-controls.mjs --phases=jump,jumpwall,jumpstuck --frames=90
 * 判据：`--expect=<指标><比较符><数值>`（逗号分隔，全部满足才 exit 0）。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const hit = argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '1';
};
const PHASES = (arg('phases', 'read,ad,space,f,fsel') || '').split(',').map((s) => s.trim()).filter(Boolean);
const FRAMES = Number(arg('frames', 60));
const VIEW = arg('view', 'fp');
const QUALITY = arg('quality', 'medium');
const EXPECT = (arg('expect', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const JSON_OUT = arg('json', '/tmp/t2-fp-controls.json');
const CHROME = process.env.CHROME_PATH
  ?? '/Users/casper/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/* --------------------------- 静态服务 + CDP --------------------------- */
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') p = join(ROOT, 'index.html');
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p)); }
  catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const DBG = 9600 + (process.pid % 300);
const url = `http://127.0.0.1:${port}/index.html?view=${VIEW}&quality=${QUALITY}`;
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DBG}`, `--user-data-dir=/tmp/t2-fp-${process.pid}`, '--window-size=1440,900', url], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i += 1) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null; } catch { /* wait */ }
  if (!wsUrl) await sleep(300);
}
if (!wsUrl) { console.error('未找到 CDP 目标'); process.exit(2); }
const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
for (let i = 0; i < 120; i += 1) { if (await evaluate('!!(window.__PALACE__ && window.__PALACE__.ready)')) break; await sleep(300); }
await evaluate('window.__PALACE__.settle && window.__PALACE__.settle()');
await sleep(500);

/* --------------------------- 页内助手 --------------------------- */
const HELPERS = `(async () => {
  const a = window.__PALACE__;
  if (a.__fpp) return 'already';
  const LAYOUT = await import('/src/shared/layout.js');
  const LS = await import('/src/core/layout-slice.js');
  const CFGMOD = await import('/src/shared/config.js');
  const CFG = CFGMOD.CONFIG;
  const EVENTS = CFGMOD.EVENTS;
  const H = {
    config: CFG,
    events: CFGMOD.EVENTS,
    helpers: { LAYOUT, LS },
    /** 冻结页面 rAF（之后的每一帧完全由 stepFrame 驱动） */
    freezeLoop() { if (window.__RAF_FROZEN__) return 'already'; window.__RAF_FROZEN__ = true; window.__RAF_NATIVE__ = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; return 'frozen'; },
    /** 精确推进一帧：复刻 main.js frameStep 的调用序列 */
    stepFrame(dt) {
      if (!window.__RAF_FROZEN__) H.freezeLoop();
      if (window.__STEP_EL__ === undefined) window.__STEP_EL__ = window.__EL__ ?? 0;
      window.__STEP_EL__ += dt;
      const el = window.__STEP_EL__;
      const st = a.store.state;
      for (const entry of a.zones.values()) { try { entry.result.update(dt, el, st); } catch (e) { /* 同生产循环 */ } }
      a.rig.update(dt, el, st);
      a.environment.update(dt, el, { ...st, cameraPosition: a.rig.position });
      a.renderSystem.render(a.scene, a.rig.camera);
      a.renderSystem.recordFrame(dt * 1000);
      const ui = window.__PALACE_UI__;
      if (ui && typeof ui.update === 'function') { try { ui.update(dt, el); } catch (e) { /* UI 非关键 */ } }
      return { elapsed: el };
    },
    key(code, down = true) {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
      return true;
    },
    tap(code) { H.key(code, true); H.key(code, false); return true; },
    /** 相机设备坐标系（世界）：right = 矩阵第一列；forward = 视线方向 */
    axes() {
      const m = a.rig.camera.matrixWorld.elements;
      const v = a.rig.viewDirection();
      return { right: { x: m[0], y: m[1], z: m[2] }, up: { x: m[4], y: m[5], z: m[6] }, forward: { x: v.x, y: v.y, z: v.z } };
    },
    pos() { const p = a.rig.position; return { x: p.x, y: p.y, z: p.z }; },
    /** 幂等进入第一人称（已在内则原样返回；否则按 F 并推进帧让状态落到相机） */
    ensureFp() {
      if (a.rig.isFp) return { already: true };
      H.tap('KeyF');
      H.stepFrame(1 / 60);
      for (let i = 0; i < 30 && !a.rig.isFp; i += 1) H.stepFrame(1 / 60);
      return { already: false, fp: a.rig.isFp };
    },
    /** 幂等退出第一人称 */
    ensureNotFp() {
      if (!a.rig.isFp) return { already: true };
      H.tap('KeyF');
      H.stepFrame(1 / 60);
      for (let i = 0; i < 30 && a.rig.isFp; i += 1) H.stepFrame(1 / 60);
      return { already: false, fp: a.rig.isFp };
    },
    /** 清场：停导览 + 松开所有移动键 */
    resetContext() {
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']) H.key(c, false);
      if (a.store.state.tourState && a.store.state.tourState.active) a.events.request('tour:request', { action: 'stop', source: 'probe' });
      H.stepFrame(1 / 60);
      return { viewMode: a.store.state.viewMode, tour: !!(a.store.state.tourState && a.store.state.tourState.active) };
    },
    /** 起跳：优先走相机装置公开 API（与生产路径同一条），否则按 Space 键 */
    jump() { if (typeof a.rig.jump === 'function') { a.rig.jump('probe'); return { via: 'rig.jump' }; } H.tap('Space'); return { via: 'key:Space' }; },
    /** 按住某键走 frames 帧，返回位移读数 */
    hold(code, frames, dt, { sampleEvery = 1 } = {}) {
      const from = H.pos();
      const axes = H.axes();
      H.key(code, true);
      const ys = [];
      const inside = [];
      for (let i = 0; i < frames; i += 1) {
        H.stepFrame(dt);
        if (i % sampleEvery === 0) { const p = H.pos(); ys.push(+p.y.toFixed(6)); inside.push(H.insideObstacle()); }
      }
      H.key(code, false);
      const to = H.pos();
      const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
      const horiz = { x: d.x, z: d.z };
      const len = Math.hypot(horiz.x, horiz.z);
      return {
        code, frames, from, to, delta: d, horizontal: +len.toFixed(4),
        dir: len > 1e-9 ? { x: +(horiz.x / len).toFixed(4), z: +(horiz.z / len).toFixed(4) } : { x: 0, z: 0 },
        dotRight: +(horiz.x * axes.right.x + horiz.z * axes.right.z).toFixed(4),
        dotForward: +(horiz.x * axes.forward.x + horiz.z * axes.forward.z).toFixed(4),
        distinctY: [...new Set(ys)].length,
        yMin: Math.min(...ys), yMax: Math.max(...ys),
        insideObstacleFrames: inside.filter(Boolean).length,
      };
    },
    insideObstacle() {
      const obstacles = a.registry && a.registry.allObstacles ? a.registry.allObstacles() : [];
      const p = H.pos();
      const feetY = p.y - H.config.CAMERA.fpEyeHeight;
      for (const o of obstacles) {
        try { if (LS.obstacleBlocksPoint(o, { x: p.x, z: p.z, feetY, height: 1.7, radius: 0.25 })) return true; } catch (e) { /* 谓词签名不符时不计 */ }
      }
      return false;
    },
    surfaceAt() { const p = H.pos(); return LAYOUT.floorYAt(p.x, p.z); },
    snapshot() {
      const d = a.rig.describe();
      const axes = H.axes();
      const inter = window.__PALACE_UI__?.interaction;
      const st = inter && typeof inter.stats === 'function' ? inter.stats() : null;
      const tra = inter && typeof inter.traversalState === 'function' ? inter.traversalState() : null;
      const panel = document.querySelector('[data-ui-panel="stuck"]');
      return {
        viewMode: a.store.state.viewMode,
        fpActive: d.fpActive,
        mode: d.mode,
        position: d.position,
        yawDeg: +(Math.atan2(axes.forward.x, axes.forward.z) / Math.PI * 180).toFixed(3),
        axes,
        tourActive: !!(a.store.state.tourState && a.store.state.tourState.active),
        selectedBuildingId: a.store.state.selectedBuildingId ?? null,
        stuck: tra ? { seconds: tra.stuckSeconds, stuck: tra.stuck === true, intent: st?.stuckIntent ?? null, movedValue: st?.stuckMoved ?? null, intentSource: st?.stuckIntentSource ?? null } : null,
        stuckHudVisible: panel ? panel.hidden === false : null,
        fpStats: a.rig.stats ? { ...a.rig.stats } : null,
        fpJump: d.fpJump ?? null,
        airborne: d.fpJumping === true,
      };
    },
    /* --------------------- t15：选中即传送（读数助手） ---------------------
     * 全部只做"读"或"经生产入口请求"，不自造落点算法：判定用 layout 数据独立复算。
     */
    /** 建筑锚点：门外锚点 / 入口锚点 / 足迹中心（缺项为 null） */
    slotAnchor(id) {
      const s = LAYOUT.SLOT_BY_ID[id];
      if (!s) return null;
      const b = s.bounds;
      return {
        id,
        name: s.name ?? null,
        enterable: s.enterable !== false,
        doorless: !(s.door && s.door.facade) && !!s.entrance,
        facade: s.door && s.door.facade ? { x: s.door.facade.x, y: s.door.facade.y, z: s.door.facade.z } : null,
        entrance: s.entrance ? { x: s.entrance.x, y: s.entrance.y, z: s.entrance.z } : null,
        center: b ? { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 } : null,
      };
    },
    /** 选中（走 interaction 生产入口；null = 清空） */
    select(id) {
      const api = window.__PALACE_UI__ && window.__PALACE_UI__.interaction;
      if (!api || typeof api.select !== 'function') return { ok: false, reason: 'no-select-api' };
      api.select(id ?? null, 'probe');
      return { ok: true, selected: a.store.state.selectedBuildingId ?? null };
    },
    /** 走生产请求链路进入第一人称（与面板按钮/键位同一条 request），
     *  并捕获 fp:entered 事件载荷 ⇒ 落点来源（spawnId / selectionLanding）以**生产事件**为准，不是自算。 */
    fpRequest() {
      const api = window.__PALACE_UI__ && window.__PALACE_UI__.interaction;
      if (!api || !api.requester || typeof api.requester.viewMode !== 'function') return { ok: false, reason: 'no-requester' };
      const captured = [];
      const onEntered = (payload) => captured.push(payload);
      const bus = a.events;
      const subscribed = !!(bus && typeof bus.on === 'function');
      if (subscribed) bus.on(EVENTS.fpEntered, onEntered);
      api.requester.viewMode('fp');
      for (let i = 0; i < 30 && !a.rig.isFp; i += 1) H.stepFrame(1 / 60);
      H.stepFrame(1 / 60);
      if (subscribed && typeof bus.off === 'function') bus.off(EVENTS.fpEntered, onEntered);
      const entered = captured.length > 0 ? captured[captured.length - 1] : null;
      return { ok: true, fp: a.rig.isFp === true, subscribed, entered, enteredCount: captured.length };
    },
    /** 在"监听 fp:entered"的窗口里执行一次调用（读数以**生产事件**为准） */
    withFpEvents(fn) {
      const captured = [];
      const onEntered = (payload) => captured.push(payload);
      const bus = a.events;
      const sub = !!(bus && typeof bus.on === 'function');
      if (sub) bus.on(EVENTS.fpEntered, onEntered);
      let value = null; let err = null;
      try { value = fn() ?? null; } catch (e) { err = String(e && e.message ? e.message : e); }
      if (sub && typeof bus.off === 'function') bus.off(EVENTS.fpEntered, onEntered);
      return { value, entered: captured.length > 0 ? captured[captured.length - 1] : null, enteredCount: captured.length, err };
    },
    /** 严格模式（selectionOnly）：失败必须返回 null、不发 fp:entered、不动机位 */
    enterFpStrict() { return H.withFpEvents(() => a.rig.enterFp({ source: 'probe', selectionOnly: true, instant: true })); },
    /** 默认模式：失败应回落既有出生点并标注 fallback（事件载荷同样标注） */
    enterFpDefault() { return H.withFpEvents(() => a.rig.enterFp({ source: 'probe', instant: true })); },
    isFp() { return a.rig.isFp === true; },
    /** 最近一次"选中就近落点"读数 */
    landing() { const d = a.rig.describe(); return d.fpSelectionLanding ? { ...d.fpSelectionLanding } : null; },
    /** 落点推导（纯函数）读数：候选数/失败数/首个失败候选一并带回，便于复核 */
    plan(id) {
      const p = a.rig.fpLandingFor(id);
      if (!p) return null;
      const att = p.attempts ?? [];
      return {
        ok: p.ok === true, buildingId: p.buildingId ?? null, kind: p.kind ?? null, tier: p.tier ?? null,
        x: p.x ?? null, y: p.y ?? null, z: p.z ?? null, surfaceY: p.surfaceY ?? null, surfaceId: p.surfaceId ?? null,
        reasons: p.reasons ?? [], candidateCount: att.length, failedCount: att.filter((c) => c.ok !== true).length,
        firstFail: att.find((c) => c.ok !== true) ?? null,
      };
    },
    /** 机位参数（视图与位置）：诊断读数不参与逐值比较（同 t105 口径） */
    viewState() {
      const d = a.rig.describe();
      return { mode: d.mode, projection: d.projection, position: d.position, target: d.target, fov: d.fov, zoom: d.zoom, axisIndex: d.axisIndex, fpActive: d.fpActive === true, viewDirection: d.viewDirection };
    },
    /** 落点合法性：与 t105 判据同口径、可独立复算（包络 + 面高齐备 + 可站立 + 眼高逐值） */
    judgeLanding(point) {
      const p = point ?? H.pos();
      const surface = LAYOUT.floorYAt(p.x, p.z);
      const E = LAYOUT.TERRAIN_EXTENT;
      const inBounds = p.x >= E.minX && p.x <= E.maxX && p.z >= E.minZ && p.z <= E.maxZ;
      const eyeOk = surface !== null && Math.abs(p.y - (surface + H.config.CAMERA.fpEyeHeight)) < 1e-9;
      const walk = typeof LAYOUT.walkableAt === 'function' ? LAYOUT.walkableAt(p.x, p.z) : null;
      return { ok: inBounds && eyeOk && (walk === null || walk !== false), surface, inBounds, eyeOk, walkable: walk, x: p.x, y: p.y, z: p.z };
    },
    /** 已登记出生点：给定位置处的最近者（不改语义，只消费结果） */
    spawnOf(pos) {
      const n = a.registry.nearestFpSpawn(pos ?? H.pos());
      return n && n.viewpoint ? { id: n.viewpoint.id, position: n.viewpoint.position } : null;
    },
    /** 把"最近出生点"换成另一处登记出生点（证明选中落点不依赖它）；mode='restore' 复原 */
    stubSpawn(mode) {
      if (mode === 'restore') { if (window.__SPAWN_ORIG__) a.registry.nearestFpSpawn = window.__SPAWN_ORIG__; return { restored: true }; }
      if (!window.__SPAWN_ORIG__) window.__SPAWN_ORIG__ = a.registry.nearestFpSpawn;
      const real = window.__SPAWN_ORIG__(H.pos());
      const pool = a.registry.viewpointsByMode('fp-spawn').filter((v) => v.position);
      const realId = real && real.viewpoint ? real.viewpoint.id : null;
      const other = pool.find((v) => v.id !== realId) ?? pool[0] ?? null;
      a.registry.nearestFpSpawn = () => (other ? { viewpoint: other, distance: 9999, stubbed: true } : null);
      return { stubbedId: other ? other.id : null, realId, pool: pool.length };
    },
    /** 注入"整圈被挡"：建筑 ±r 米全部记为整足迹障碍（只替换 registry 只读口径，不改产品代码） */
    cage(id, radius) {
      const s = LAYOUT.SLOT_BY_ID[id];
      if (!s || !s.bounds) return null;
      if (!window.__OBST_ORIG__) window.__OBST_ORIG__ = a.registry.allObstacles;
      const r = radius ?? 12;
      const box = { id: 'PROBE-t15-cage', buildingId: 'PROBE-t15-cage', blocks: 'all', door: null, y0: 0, y1: 60, bounds: { minX: s.bounds.minX - r, maxX: s.bounds.maxX + r, minZ: s.bounds.minZ - r, maxZ: s.bounds.maxZ + r } };
      const orig = window.__OBST_ORIG__;
      a.registry.allObstacles = () => [...orig(), box];
      return { radius: r, bounds: box.bounds };
    },
    uncage() { if (window.__OBST_ORIG__) a.registry.allObstacles = window.__OBST_ORIG__; return { restored: true }; },
  };
  a.__fpp = H;
  window.__PALACE_FPP__ = H;
  return 'ok';
})()`;

await evaluate(HELPERS);

const report = { url, frames: FRAMES, phases: [] };
const metrics = {};
const note = (name, value) => { metrics[name] = value; };
const phase = async (id, fn) => {
  const out = await fn();
  report.phases.push({ id, ...out });
  return out;
};

/* --------------------------- 相位 --------------------------- */
const read = async () => phase('read', async () => {
  await evaluate('window.__PALACE_FPP__.resetContext()');
  const entry = await evaluate('window.__PALACE_FPP__.ensureFp()');
  const s = await evaluate('window.__PALACE_FPP__.snapshot()');
  const surface = await evaluate('window.__PALACE_FPP__.surfaceAt()');
  const eye = await evaluate('window.__PALACE_FPP__.config.CAMERA.fpEyeHeight');
  const r = { ...s, entry, surfaceY: surface, fpEyeHeight: eye, expectedY: surface === null ? null : +(surface + eye).toFixed(6) };
  console.log(`[read] viewMode=${s.viewMode} fp=${s.fpActive} pos=(${s.position.x.toFixed(2)}, ${s.position.y.toFixed(3)}, ${s.position.z.toFixed(2)}) yaw=${s.yawDeg}°`);
  console.log(`       right=(${s.axes.right.x.toFixed(4)}, ${s.axes.right.z.toFixed(4)}) forward=(${s.axes.forward.x.toFixed(4)}, ${s.axes.forward.z.toFixed(4)})｜面高=${surface} 期望眼高=${r.expectedY}`);
  note('entryYawDeg', s.yawDeg);
  note('rightX', +s.axes.right.x.toFixed(4));
  note('rightZ', +s.axes.right.z.toFixed(4));
  return r;
});

const ad = async () => phase('ad', async () => {
  const dt = 1 / 60;
  const d = await evaluate(`window.__PALACE_FPP__.hold('KeyD', ${FRAMES}, ${dt})`);
  const a = await evaluate(`window.__PALACE_FPP__.hold('KeyA', ${FRAMES}, ${dt})`);
  const w = await evaluate(`window.__PALACE_FPP__.hold('KeyW', ${FRAMES}, ${dt})`);
  const s = await evaluate(`window.__PALACE_FPP__.hold('KeyS', ${FRAMES}, ${dt})`);
  console.log(`[ad] D：位移 ${d.horizontal} m｜点乘 right=${d.dotRight}｜点乘 forward=${d.dotForward}`);
  console.log(`     A：位移 ${a.horizontal} m｜点乘 right=${a.dotRight}｜点乘 forward=${a.dotForward}`);
  console.log(`     W：位移 ${w.horizontal} m｜点乘 forward=${w.dotForward}（应 >0）｜S：${s.horizontal} m｜点乘 forward=${s.dotForward}（应 <0）`);
  note('adD', d.dotRight); note('adA', a.dotRight); note('adW', w.dotForward); note('adS', s.dotForward);
  note('adDdist', d.horizontal); note('adAdist', a.horizontal);
  note('adDdistinctY', d.distinctY); note('adDinside', d.insideObstacleFrames); note('adAinside', a.insideObstacleFrames);
  return { D: d, A: a, W: w, S: s };
});

const space = async () => phase('space', async () => {
  await evaluate('window.__PALACE_FPP__.resetContext()');
  const before = await evaluate('window.__PALACE_FPP__.snapshot()');
  const y0 = before.position.y;
  const jumpVia = await evaluate('window.__PALACE_FPP__.jump()');
  let yMax = y0; let yMin = y0;
  for (let i = 0; i < FRAMES; i += 1) {
    await evaluate('window.__PALACE_FPP__.stepFrame(1/60)');
    const p = await evaluate('window.__PALACE_FPP__.pos()');
    yMax = Math.max(yMax, p.y); yMin = Math.min(yMin, p.y);
  }
  const after = await evaluate('window.__PALACE_FPP__.snapshot()');
  const out = {
    tourBefore: before.tourActive, tourAfter: after.tourActive, viewModeAfterSpace: after.viewMode,
    y0, yMax, yMin, apex: +(yMax - y0).toFixed(4), dive: +(y0 - yMin).toFixed(4),
    surfaceY: await evaluate('window.__PALACE_FPP__.surfaceAt()'),
    fpEyeHeight: await evaluate('window.__PALACE_FPP__.config.CAMERA.fpEyeHeight'),
    jumpEnabled: await evaluate('window.__PALACE_FPP__.config.INTERACTION.jump.enabled'),
    jumpMaxHeight: await evaluate('window.__PALACE_FPP__.config.INTERACTION.jump.maxHeight'),
    jumpVia,
  };
  console.log(`[space] 起跳入口 ${JSON.stringify(jumpVia)}：导览 ${before.tourActive} → ${after.tourActive}｜viewMode=${after.viewMode}｜Δy 顶点 ${out.apex} m / 下沉 ${out.dive} m`);
  await evaluate('window.__PALACE_FPP__.resetContext()');
  note('spaceTourAfter', out.tourAfter ? 1 : 0);
  note('spaceApex', out.apex);
  note('spaceDive', out.dive);
  return out;
});

const fAgain = async (withSelection) => phase(withSelection ? 'fsel' : 'f', async () => {
  // 先回到第一人称（若已退出）
  await evaluate('window.__PALACE_FPP__.resetContext()');
  await evaluate('window.__PALACE_FPP__.ensureFp()');
  if (withSelection) {
    const sel = await evaluate(`(() => {
      const a = window.__PALACE__.rig; const ids = window.__PALACE__.registry.ids().buildings;
      const pick = ids.includes('B-hall-main') ? 'B-hall-main' : ids[0];
      const api = window.__PALACE_UI__ && window.__PALACE_UI__.interaction;
      if (api && typeof api.select === 'function') api.select(pick, 'probe'); else window.__PALACE__.events.request('selection:change', { buildingId: pick, hovered: false });
      return { pick };
    })()`);
    await sleep(200);
    report.selectInfo = sel;
  }
  const before = await evaluate('window.__PALACE_FPP__.snapshot()');
  await evaluate('window.__PALACE_FPP__.tap("KeyF")');
  let after = await evaluate('window.__PALACE_FPP__.snapshot()');
  for (let i = 0; i < 30 && after.viewMode === 'fp'; i += 1) { await evaluate('window.__PALACE_FPP__.stepFrame(1/60)'); after = await evaluate('window.__PALACE_FPP__.snapshot()'); }
  const out = { withSelection, before: { viewMode: before.viewMode, fpActive: before.fpActive, selected: before.selectedBuildingId }, after: { viewMode: after.viewMode, fpActive: after.fpActive }, restoredMode: after.mode };
  console.log(`[${withSelection ? 'fsel' : 'f'}] 第一人称中再按 F（${withSelection ? '有选中 ' + before.selectedBuildingId : '无选中'}）：viewMode ${before.viewMode} → ${after.viewMode}｜fp ${before.fpActive} → ${after.fpActive}`);
  note(withSelection ? 'fSelExit' : 'fExit', after.viewMode !== 'fp' ? 1 : 0);
  note(withSelection ? 'fSelNotInterior' : 'fNotInterior', after.viewMode === 'interior' ? 0 : 1);
  note(withSelection ? 'fSelModeAfter' : 'fModeAfter', after.viewMode);
  return out;
});

const jump = async () => phase('jump', async () => {
  // 重置到干净第一人称：退出 → 再进入（消除上一步的按键/位移）
  await evaluate('window.__PALACE_FPP__.resetContext()');
  await evaluate('window.__PALACE_FPP__.ensureFp()');
  const before = await evaluate('window.__PALACE_FPP__.snapshot()');
  const surface = await evaluate('window.__PALACE_FPP__.surfaceAt()');
  const y0 = before.position.y;
  const inside = [];
  const jumpVia = await evaluate('window.__PALACE_FPP__.jump()');
  let yMax = y0; const ys = [];
  for (let i = 0; i < FRAMES; i += 1) {
    const r = await evaluate('window.__PALACE_FPP__.stepFrame(1/60)');
    const p = await evaluate('window.__PALACE_FPP__.pos()');
    ys.push(+p.y.toFixed(6)); yMax = Math.max(yMax, p.y);
    inside.push(await evaluate('window.__PALACE_FPP__.insideObstacle()'));
    void r;
  }
  const after = await evaluate('window.__PALACE_FPP__.snapshot()');
  const surfaceEnd = await evaluate('window.__PALACE_FPP__.surfaceAt()');
  const eye = await evaluate('window.__PALACE_FPP__.config.CAMERA.fpEyeHeight');
  const js = after.fpJump ?? null;
  const js0 = before.fpJump ?? null;
  const out = {
    jumpVia,
    // 本相位增量（rig 上的计数是会话累计；跳一次要看"这一段"增加了多少）
    jumpStarts: js && js0 ? js.starts - js0.starts : null,
    jumpLandings: js && js0 ? js.landings - js0.landings : null,
    jumpReverts: js && js0 ? js.reverts - js0.reverts : null,
    jumpStartsTotal: js?.starts ?? null,
    jumpLandingsTotal: js?.landings ?? null,
    landingKind: js?.lastLanding?.kind ?? null,
    landingReason: js?.lastLanding?.reason ?? null,
    takeoff: before.position, y0, yMax, apex: +(yMax - y0).toFixed(4),
    landingY: after.position.y, landingSurfaceY: surfaceEnd,
    landingExpectedY: surfaceEnd === null ? null : +(surfaceEnd + eye).toFixed(6),
    landingDelta: surfaceEnd === null ? null : +(after.position.y - (surfaceEnd + eye)).toFixed(9),
    returnToTakeoff: +(Math.hypot(after.position.x - before.position.x, after.position.z - before.position.z)).toFixed(4),
    airborneFrames: ys.filter((y, i) => i > 0 && Math.abs(y - ys[i - 1]) > 1e-9).length,
    withinLimit: (yMax - y0) <= 1.0 + 1e-6,
    insideObstacleFrames: inside.filter(Boolean).length,
    jumpState: after.fpStats && after.fpStats.jump ? after.fpStats.jump : null,
  };
  console.log(`[jump] 顶点 ${out.apex} m（判据 ≤1.0：${out.withinLimit}）｜落地 y=${out.landingY.toFixed(6)}，面高 ${surfaceEnd} ⇒ 期望 ${out.landingExpectedY}，逐值差 ${out.landingDelta}`);
  console.log(`       空中水平位移后距起跳点 ${out.returnToTakeoff} m｜飞行中进入障碍的帧数 ${out.insideObstacleFrames}｜起跳前面高 ${surface}`);
  console.log(`       跳跃内核读数：starts=${out.jumpStarts} landings=${out.jumpLandings} reverts=${out.jumpReverts}｜落地类型=${out.landingKind}${out.landingReason ? '／' + out.landingReason : ''}`);
  note('apex', out.apex); note('landingDelta', out.landingDelta); note('jumpInside', out.insideObstacleFrames);
  note('jumpStarts', out.jumpStarts ?? NaN); note('jumpLandings', out.jumpLandings ?? NaN);
  note('jumpReverts', out.jumpReverts ?? NaN); note('landingIsGround', out.landingKind === 'ground' ? 1 : 0);
  return out;
});

const jumpWall = async () => phase('jumpwall', async () => {
  // 朝最近障碍方向反复起跳并推进：全程不得进入障碍体块（= 空中水平碰撞仍生效）
  await evaluate('window.__PALACE_FPP__.resetContext()');
  await evaluate('window.__PALACE_FPP__.ensureFp()');
  const inside = [];
  const blockedFrames = [];
  const startStats = (await evaluate('window.__PALACE_FPP__.snapshot()')).fpJump ?? { starts: 0, landings: 0, reverts: 0 };
  for (let j = 0; j < 6; j += 1) {
    await evaluate('window.__PALACE_FPP__.jump()');
    await evaluate('window.__PALACE_FPP__.key("KeyW", true)');
    for (let i = 0; i < 40; i += 1) {
      await evaluate('window.__PALACE_FPP__.stepFrame(1/60)');
      inside.push(await evaluate('window.__PALACE_FPP__.insideObstacle()'));
    }
    await evaluate('window.__PALACE_FPP__.key("KeyW", false)');
    blockedFrames.push(await evaluate('window.__PALACE_FPP__.snapshot()'));
  }
  const end = await evaluate('window.__PALACE_FPP__.snapshot()');
  const out = {
    rounds: 6, framesPerRound: 40, insideObstacleFrames: inside.filter(Boolean).length,
    jumpStarts: end.fpJump ? end.fpJump.starts - startStats.starts : null,
    jumpLandings: end.fpJump ? end.fpJump.landings - startStats.landings : null,
    jumpReverts: end.fpJump ? end.fpJump.reverts - startStats.reverts : null,
    end,
  };
  console.log(`[jumpwall] 6 轮跳跃推进（每轮 40 帧）：飞行中进入障碍的帧数 ${out.insideObstacleFrames}（判据 =0）｜本段起跳 ${out.jumpStarts}／落地 ${out.jumpLandings}／回退 ${out.jumpReverts}`);
  note('jumpWallInside', out.insideObstacleFrames);
  note('jumpWallStarts', out.jumpStarts ?? NaN);
  note('jumpWallLandings', out.jumpLandings ?? NaN);
  note('jumpWallReverts', out.jumpReverts ?? NaN);
  return out;
});

const jumpStuck = async () => phase('jumpstuck', async () => {
  // 连续起跳 ≥2.5 s：不得弹出"好像卡住了" HUD（阈值 1.5 s）
  await evaluate('window.__PALACE_FPP__.resetContext()');
  await evaluate('window.__PALACE_FPP__.ensureFp()');
  const seen = { hud: 0, stuckSecondsMax: 0, starts: 0 };
  for (let j = 0; j < 8; j += 1) {
    await evaluate('window.__PALACE_FPP__.jump()');
    seen.starts += 1;
    for (let i = 0; i < 30; i += 1) {
      await evaluate('window.__PALACE_FPP__.stepFrame(1/60)');
      const snap = await evaluate('window.__PALACE_FPP__.snapshot()');
      if (snap.stuckHudVisible) seen.hud += 1;
      if (snap.stuck) seen.stuckSecondsMax = Math.max(seen.stuckSecondsMax, snap.stuck.seconds);
    }
  }
  const end = await evaluate('window.__PALACE_FPP__.snapshot()');
  const out = { rounds: 8, frames: 240, seconds: 4, hudVisibleFrames: seen.hud, stuckSecondsMax: seen.stuckSecondsMax, stuckFlag: end.stuck?.stuck ?? null, stuckHudVisible: end.stuckHudVisible, jumpStarts: seen.starts };
  console.log(`[jumpstuck] 连续起跳 4 s：卡死 HUD 出现帧数 ${out.hudVisibleFrames}（判据 =0）｜卡死计时峰值 ${out.stuckSecondsMax}s｜末端 stuck=${out.stuckFlag}`);
  note('stuckHudFrames', out.hudVisibleFrames);
  return out;
});

/* t15：选中即传送 —— 落点来源、确定性、失败路径（不改机位）、Esc/G/F 互不冲突 */
const teleport = async () => phase('teleport', async () => {
  const ID = 'B-hall-main';
  const anchor = await evaluate(`window.__PALACE_FPP__.slotAnchor('${ID}')`);
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const step = (n = 1) => evaluate(`(() => { for (let i = 0; i < ${n}; i += 1) window.__PALACE_FPP__.stepFrame(1/60); return true; })()`);
  const out = { id: ID, anchor };

  // ① 无选中 ⇒ 既有出生点路径（逐值不变）
  await evaluate('window.__PALACE_FPP__.resetContext()');
  await evaluate('window.__PALACE_FPP__.ensureNotFp()');
  await evaluate('window.__PALACE_FPP__.select(null)');
  const legacySpawn = await evaluate('window.__PALACE_FPP__.spawnOf()');
  const legacyEntry = await evaluate('window.__PALACE_FPP__.fpRequest()');
  const legacyPos = await evaluate('window.__PALACE_FPP__.pos()');
  const legacyLanding = await evaluate('window.__PALACE_FPP__.landing()');
  out.legacy = {
    spawn: legacySpawn, entry: legacyEntry, position: legacyPos, landing: legacyLanding,
    sameAsSpawn: legacySpawn ? eq(legacyPos, legacySpawn.position) : false,
    spawnIdMatched: legacyEntry.entered ? legacyEntry.entered.spawnId === (legacySpawn ? legacySpawn.id : null) : false,
    selectionLanding: legacyEntry.entered ? legacyEntry.entered.selectionLanding ?? null : null,
  };
  note('tpLegacyNoLanding', out.legacy.sameAsSpawn && out.legacy.spawnIdMatched && legacyLanding.buildingId === null && legacyLanding.ok === false && legacyLanding.fallback === false && out.legacy.selectionLanding === null ? 1 : 0);
  console.log(`[teleport] ① 无选中：落点 = 登记出生点 ${legacySpawn ? legacySpawn.id : 'null'} 逐值一致 ${out.legacy.sameAsSpawn}｜事件 spawnId 一致 ${out.legacy.spawnIdMatched}｜selectionLanding=${JSON.stringify(out.legacy.selectionLanding)}｜fallback=${legacyLanding.fallback}`);

  // ② 选中 + 请求进入 ⇒ 落在门外锚点 1m 内（眼高逐值）
  await evaluate('window.__PALACE_FPP__.resetContext()');
  await evaluate('window.__PALACE_FPP__.ensureNotFp()');
  const sel = await evaluate(`window.__PALACE_FPP__.select('${ID}')`);
  const planBefore = await evaluate(`window.__PALACE_FPP__.plan('${ID}')`);
  const beforeEntry = await evaluate('window.__PALACE_FPP__.viewState()');
  const entry = await evaluate('window.__PALACE_FPP__.fpRequest()');
  const pos = await evaluate('window.__PALACE_FPP__.pos()');
  const landing = await evaluate('window.__PALACE_FPP__.landing()');
  const judge = await evaluate('window.__PALACE_FPP__.judgeLanding()');
  const dist = Math.hypot(pos.x - anchor.facade.x, pos.z - anchor.facade.z);
  const ev = entry.entered;
  const matchesPlan = planBefore.ok === true && landing.ok === true && landing.tier === planBefore.tier && landing.kind === planBefore.kind
    && pos.x === planBefore.x && pos.y === planBefore.y && pos.z === planBefore.z && landing.surfaceY === planBefore.surfaceY;
  out.entry = { selection: sel, planBefore, entry, position: pos, landing, judge, distToFacade: +dist.toFixed(4), matchesPlan, before: beforeEntry, eventPayload: ev };
  note('tpIsFp', entry.fp === true && (await evaluate('window.__PALACE_FPP__.isFp()')) === true ? 1 : 0);
  note('tpDistFacade', +dist.toFixed(4));
  note('tpOk', matchesPlan && landing.buildingId === ID && ev && ev.spawnId === null && ev.selectionLanding && ev.selectionLanding.buildingId === ID && ev.selectionLanding.kind === landing.kind ? 1 : 0);
  note('tpEyeExact', judge.eyeOk === true ? 1 : 0);
  console.log(`[teleport] ② 选中 ${ID} 后进入：落点 (${pos.x.toFixed(2)}, ${pos.y.toFixed(6)}, ${pos.z.toFixed(2)})｜距门外锚点 ${dist.toFixed(4)} m｜tier=${landing.tier} kind=${landing.kind}｜与纯函数推导逐值一致 ${matchesPlan}｜事件 spawnId=${ev ? JSON.stringify(ev.spawnId) : 'null'} selectionLanding=${ev ? JSON.stringify(ev.selectionLanding) : 'null'}｜包络 ${judge.inBounds} 眼高逐值 ${judge.eyeOk}`);

  // ②b 确定性：两次推导/两次进入逐值一致，且**与"最近出生点"无关**（把最近出生点换成另一处）
  await evaluate('window.__PALACE_FPP__.ensureNotFp()');
  const pure1 = await evaluate(`window.__PALACE_FPP__.plan('${ID}')`);
  const stub = await evaluate('window.__PALACE_FPP__.stubSpawn()');
  const pure2 = await evaluate(`window.__PALACE_FPP__.plan('${ID}')`);
  const entry2 = await evaluate('window.__PALACE_FPP__.fpRequest()');
  const pos2 = await evaluate('window.__PALACE_FPP__.pos()');
  const landing2 = await evaluate('window.__PALACE_FPP__.landing()');
  await evaluate('window.__PALACE_FPP__.stubSpawn("restore")');
  const samePos = eq(pos, pos2); const sameLanding = eq(landing, landing2); const samePure = eq(pure1, pure2);
  out.determinism = { pure1, pure2, pos2, landing2, stub, samePos, sameLanding, samePure, entry2 };
  note('tpDeterministic', samePos && sameLanding && samePure && entry2.fp === true && stub.stubbedId && stub.stubbedId !== stub.realId ? 1 : 0);
  console.log(`[teleport] ②b 确定性：两次落点逐值一致 ${samePos}｜读数一致 ${sameLanding}｜纯函数一致 ${samePure}｜最近出生点被换成 ${stub.stubbedId}（原 ${stub.realId}，池 ${stub.pool}）后落点未变`);

  // ③ 推导是纯函数：不在第一人称时调用不得改动视图/位置
  await evaluate('window.__PALACE_FPP__.ensureNotFp()');
  const beforePure = await evaluate('window.__PALACE_FPP__.viewState()');
  const pure3 = await evaluate(`window.__PALACE_FPP__.plan('${ID}')`);
  const afterPure = await evaluate('window.__PALACE_FPP__.viewState()');
  out.purity = { beforePure, afterPure, pure3 };
  note('tpPureNoMutation', eq(beforePure, afterPure) && pure3.ok === true ? 1 : 0);
  console.log(`[teleport] ③ 纯函数：调用前后机位逐值一致 ${eq(beforePure, afterPure)}`);

  // ④ 失败路径：整圈被挡 ⇒ 如实失败、**不改视图与位置**；严格模式返回 null；默认模式回落登记出生点
  const cage = await evaluate(`window.__PALACE_FPP__.cage('${ID}')`);
  const beforeFail = await evaluate('window.__PALACE_FPP__.viewState()');
  const failPlan = await evaluate(`window.__PALACE_FPP__.plan('${ID}')`);
  const afterFail = await evaluate('window.__PALACE_FPP__.viewState()');
  note('tpFailReason', failPlan.ok === false && failPlan.reasons.join(',') === 'noStandablePointNearSelection' && failPlan.candidateCount > 0 && failPlan.failedCount === failPlan.candidateCount ? 1 : 0);
  note('tpFailNoMutation', eq(beforeFail, afterFail) ? 1 : 0);
  const strict = await evaluate('window.__PALACE_FPP__.enterFpStrict()');
  const afterStrict = await evaluate('window.__PALACE_FPP__.viewState()');
  note('tpStrictNull', strict.value === null && strict.err === null ? 1 : 0);
  note('tpStrictSilent', strict.enteredCount === 0 ? 1 : 0);
  note('tpStrictNoMutation', eq(afterStrict, beforeFail) && afterStrict.fpActive === false ? 1 : 0);
  const preFallbackSpawn = await evaluate('window.__PALACE_FPP__.spawnOf()');
  const fallbackRaw = await evaluate('window.__PALACE_FPP__.enterFpDefault()');
  const fallback = fallbackRaw.value;
  const fallbackEntered = fallbackRaw.entered;
  const fbPos = await evaluate('window.__PALACE_FPP__.pos()');
  const fbLanding = await evaluate('window.__PALACE_FPP__.landing()');
  const fbJudge = await evaluate('window.__PALACE_FPP__.judgeLanding()');
  out.failure = { cage, failPlan, strict, afterStrict, preFallbackSpawn, fallbackRaw, fallback, fallbackEntered, fbPos, fbLanding, fbJudge };
  note('tpFallback', fallback && fallback.selectionFallback === true && fbLanding.fallback === true && fallback.spawnId === preFallbackSpawn.id && fallback.selectionLanding === null && fbJudge.ok === true
    && fallbackEntered && fallbackEntered.spawnId === fallback.spawnId && fallbackEntered.selectionLanding === null ? 1 : 0);
  console.log(`[teleport] ④ 失败路径：cage ±${cage.radius}m ⇒ ${failPlan.reasons.join(',')}（候选 ${failPlan.candidateCount} 全失败 ${failPlan.failedCount}）｜严格模式 ${strict.value === null ? 'null + 0 事件 + 机位不变' : '异常'}｜默认回落 ${fallback.spawnId}（fallback=${fbLanding.fallback}，合法 ${fbJudge.ok}，事件标注 ${fallbackEntered ? fallbackEntered.selectionLanding === null : 'n/a'}）`);

  // ⑤ 撤掉注入 ⇒ 立刻恢复选中落点（对照，证明确实是"被挡"而非"算法坏了"）
  await evaluate('window.__PALACE_FPP__.uncage()');
  await evaluate('window.__PALACE_FPP__.ensureNotFp()');
  const recPlan = await evaluate(`window.__PALACE_FPP__.plan('${ID}')`);
  out.recovery = { recPlan };
  note('tpRecover', recPlan.ok === true ? 1 : 0);
  console.log(`[teleport] ⑤ 撤 cage：推导恢复 ok=${recPlan.ok}（tier ${recPlan.tier}）`);

  // ⑥ Esc / G / F 与"选中传送"互不冲突（都在同一次传送进入的实例上做）
  await evaluate('window.__PALACE_FPP__.resetContext()');
  await evaluate('window.__PALACE_FPP__.ensureNotFp()');
  const beforeEntry2 = await evaluate('window.__PALACE_FPP__.viewState()');
  await evaluate(`window.__PALACE_FPP__.select('${ID}')`);
  await evaluate('window.__PALACE_FPP__.fpRequest()');
  const landed2 = await evaluate('window.__PALACE_FPP__.pos()');
  // ⑥① Esc：只释放指针锁，不退出、不动位置
  await evaluate('window.__PALACE_FPP__.tap("Escape")');
  await evaluate('window.__PALACE_FPP__.stepFrame(1/60)');
  await step(3);
  const escState = await evaluate('window.__PALACE_FPP__.viewState()');
  note('tpEscKeep', escState.fpActive === true && eq(escState.position, landed2) ? 1 : 0);
  // ⑥② G：脱困仍回"最近的已登记出生点"，不得被选中传送劫持
  const preG = await evaluate('window.__PALACE_FPP__.pos()');
  const preGSpawn = await evaluate('window.__PALACE_FPP__.spawnOf()');
  await evaluate('window.__PALACE_FPP__.tap("KeyG")');
  await evaluate('window.__PALACE_FPP__.stepFrame(1/60)');
  await step(5);
  const gPos = await evaluate('window.__PALACE_FPP__.pos()');
  const gState = await evaluate('window.__PALACE_FPP__.viewState()');
  const gEscape = await evaluate('window.__PALACE_UI__.interaction.stats().lastEscape');
  const gJudge = await evaluate('window.__PALACE_FPP__.judgeLanding()');
  const distG = Math.hypot(gPos.x - anchor.facade.x, gPos.z - anchor.facade.z);
  note('tpGNotHijacked', gState.fpActive === true && eq(gPos, preGSpawn.position) && distG > 5 && gEscape && gEscape.ok === true && gJudge.ok === true ? 1 : 0);
  console.log(`[teleport] ⑥ Esc 保持第一人称 ${escState.fpActive}、位置不变 ${eq(escState.position, landed2)}｜G 回到登记出生点 ${preGSpawn.id}（距门外锚点 ${distG.toFixed(1)} m，远离选中建筑）｜F 退出恢复`);
  // ⑥③ F：再按一次退出，并逐值恢复到进入前机位
  await evaluate('window.__PALACE_FPP__.tap("KeyF")');
  await evaluate('window.__PALACE_FPP__.stepFrame(1/60)');
  await step(5);
  const afterF = await evaluate('window.__PALACE_FPP__.viewState()');
  note('tpFExitRestore', afterF.fpActive === false && afterF.mode === beforeEntry2.mode && eq(afterF.position, beforeEntry2.position) ? 1 : 0);
  out.conflict = { beforeEntry2, landed2, escState, preG, preGSpawn, gPos, gState, gEscape, distG: +distG.toFixed(4), afterF };
  console.log(`[teleport] ⑥③ F 退出：viewMode ${beforeEntry2.mode} → ${afterF.mode}｜机位逐值恢复到进入前 ${eq(afterF.position, beforeEntry2.position)}`);

  void step; void anchor;
  return out;
});

const RUNNERS = { read, ad, space, jump, jumpwall: jumpWall, jumpstuck: jumpStuck, teleport, f: () => fAgain(false), fsel: () => fAgain(true) };
for (const id of PHASES) {
  const fn = RUNNERS[id];
  if (!fn) { console.error(`未知相位：${id}（可用：${Object.keys(RUNNERS).join(', ')}）`); process.exit(2); }
  await fn();
}
writeFileSync(JSON_OUT, JSON.stringify({ ...report, metrics }, null, 1));
console.log(`读数 ⇒ ${JSON_OUT}`);

/* --------------------------- 判据 --------------------------- */
let ok = true;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
if (EXPECT.length === 0) {
  console.error('判据缺失：未给 --expect=<指标><比较符><数值>，本次仅产出读数、不作通过判定（不静默 PASS）');
  console.log('FAIL');
  ws.close(); chrome.kill(); server.close();
  process.exit(2);
}
for (const spec of EXPECT) {
  const m = /^([A-Za-z0-9_.]+):?(==|<=|>=|<|>)(-?[0-9.]+)$/.exec(spec);
  if (!m) { console.error(`判据格式错误：${spec}`); ok = false; continue; }
  const [, name, op, raw] = m;
  const want = Number(raw);
  const got = num(metrics[name]);
  const pass = op === '==' ? Math.abs(got - want) < 1e-9
    : op === '<=' ? got <= want
      : op === '>=' ? got >= want
        : op === '<' ? got < want : got > want;
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}=${metrics[name]} ${op} ${want}`);
  if (!pass) ok = false;
}
console.log(ok ? 'PASS' : 'FAIL');
ws.close(); chrome.kill(); server.close();
process.exit(ok ? 0 : 1);
