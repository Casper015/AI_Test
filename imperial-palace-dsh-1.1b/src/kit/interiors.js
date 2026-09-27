/**
 * interiors.js — 标准室内陈设套件 `kit.interiorSet({ kind, grade, bounds, entrance, seed, ... })`
 * =============================================================================
 * 目标（用户新增需求）：47+ 栋封闭建筑要"进得去、看得见室内"，由区域作者在自己的份额内调用本套件，
 * 因此设计三原则：**参数化**（kind/grade/bounds/entrance/seed 决定一切）、**可复用**（复用 src/kit 既有
 * 几何语汇与 config 材质令牌，零新增令牌）、**合批友好**（部位词表刻意收敛，一次 `mergeZone` 后单栋
 * 新增绘制调用 ≤ 12；近/远两档 LOD）。
 *
 * 约束（tests/kit.test.mjs §19 机器校验）：
 *   1. 返回**未挂载**的 Group / LOD（调用方负责 `root.add` 与 `kit.mergeZone`）；
 *   2. 零新增材质令牌：只用 INTERIOR_MATERIALS 白名单（全部来自 config.MATERIALS / COLOR_ROLES / 派生表）；
 *   3. 几何不穿模：所有构件严格位于 `bounds` 内（按 `inset` 内收）、底面落在 `groundY`、顶面 ≤ `ceilingY`；
 *   4. 分层：hall(grade 3/2) / sideHall / gateHall / cornerTower 四档，殿内按 grade 细化。
 *
 * 部位词表（与合批桶一一对应，刻意少而通用 —— 语义明细见 metrics.items）：
 *   floor        金砖/铺地地面          → interiorBrick / pavingStone
 *   runner       御道/甬路嵌线          → pavingLight
 *   dais         须弥座/台座            → stoneWhite
 *   daisCap      台座压面/石活          → stoneWhiteShade
 *   throne       正位坐具/榻/暗木家具件  → timberDark
 *   furniture    桌案/柜架/屏风框/木构   → timberLacquer
 *   screenPanel  屏风面/朱红构件/盘龙柱  → plasterRed
 *   trim         鎏金饰件/灯架/香炉/铜器  → giltMetal
 *   ceiling      藻井/梁架/天花          → paintingTeal
 *   lanternGlow  灯罩发光体              → lampGlow
 */

import { THREE } from './three-ref.js';
import { Parts, box, cylinder, sphere, beam, lathe, translate } from './geometry.js';
import { makeRng } from './props.js';
import { makeLOD } from './merge.js';
import { gradeOf } from './tokens.js';
// t170：只读引用 layout 的内景槽位清单，用于"同主题内唯一序号"（分配仍由 slotId 决定；不改 layout 几何）
import { WALKABLE as INTERIOR_WALKABLE, SLOT_BY_ID as INTERIOR_SLOT_BY_ID } from '../shared/layout.js';

/** 允许的室内构件类型（四档）。 */
export const INTERIOR_KINDS = Object.freeze(['hall', 'sideHall', 'gateHall', 'cornerTower']);

/** 零新增令牌白名单：全部为 src/kit 既有材质键（tests/kit.test.mjs §19 断言"用到的键 ⊆ 本表 ⊆ kit.materials"）。 */
export const INTERIOR_MATERIALS = Object.freeze([
  'interiorBrick',
  'pavingStone',
  'pavingLight',
  'stoneWhite',
  'stoneWhiteShade',
  'timberLacquer',
  'timberDark',
  'plasterRed',
  'plasterRedDark',
  'giltMetal',
  'paintingTeal',
  'lampGlow',
]);

/**
 * t170：**内饰主题表（≥8 套）** —— 解决用户报的"内饰重复度太高"。
 *
 * 设计约束（都不破既有约定）：
 *   · 只用 `INTERIOR_MATERIALS` 白名单里的既有令牌（零新增令牌）；
 *   · 只用既有部位词表（floor/runner/dais/daisCap/throne/furniture/screenPanel/trim/ceiling/lanternGlow），
 *     差异化靠**构件组合 · 数量 · 尺寸 · 材质色调 · 布局拓扑**，不新增合批桶维度；
 *   · 每类建筑的**必需构件**保持不变（见 tests/kit.test.mjs §19 的 must 列表）：
 *     hall=floor/dais/throne/screen/column/ceiling/table/lantern、sideHall=floor/couch/table/cabinet/screen/lantern、
 *     gateHall=floor/table/bench/drum/doorBolt/lantern、cornerTower=floor/stair/windowFrame/rack/lantern。
 *
 * 分配：`themeFor(slotId, kind, grade)`（**kit 内部按 slotId 决定**，不改 zone 侧）
 *      + `variantFor(slotId)`（镜像/数量微变） ⇒ 同主题的房间签名也不相同。
 */
export const INTERIOR_THEMES = Object.freeze([
  // —— 殿类（hall）——
  { id: 'court-gilt', label: '朝会（金）', kinds: ['hall'], floorMat: 'interiorBrick', runner: 6.4, daisTiers: 2, daisScale: 1.0,
    screenPanels: 5, screenMat: 'plasterRed', columns: 2, ceilingLayers: 4, ceilingMat: 'paintingTeal', lamps: 4,
    furnitureMat: 'timberLacquer', tables: 1, extras: ['censer'] },
  { id: 'grand-dark', label: '大典（暗）', kinds: ['hall'], floorMat: 'interiorBrick', runner: 4.8, daisTiers: 2, daisScale: 1.12,
    screenPanels: 6, screenMat: 'plasterRed', columns: 4, ceilingLayers: 3, ceilingMat: 'paintingTeal', lamps: 6,
    furnitureMat: 'timberDark', tables: 2, extras: ['censer'] },
  { id: 'council', label: '议事', kinds: ['hall'], floorMat: 'pavingStone', runner: 0, daisTiers: 1, daisScale: 0.86,
    screenPanels: 3, screenMat: 'plasterRed', columns: 2, ceilingLayers: 2, ceilingMat: 'paintingTeal', lamps: 4,
    furnitureMat: 'timberDark', tables: 1, extras: ['bench', 'bench'] },
  { id: 'study', label: '书斋', kinds: ['hall'], floorMat: 'pavingStone', runner: 0, daisTiers: 1, daisScale: 0.7,
    screenPanels: 2, screenMat: 'plasterRed', columns: 2, ceilingLayers: 1, ceilingMat: 'paintingTeal', lamps: 2,
    furnitureMat: 'timberLacquer', tables: 1, extras: ['shelf', 'shelf'] },
  { id: 'shrine', label: '佛堂', kinds: ['hall'], floorMat: 'interiorBrick', runner: 0, daisTiers: 2, daisScale: 0.78,
    screenPanels: 3, screenMat: 'plasterRed', columns: 2, ceilingLayers: 3, ceilingMat: 'paintingTeal', lamps: 4,
    furnitureMat: 'timberDark', tables: 1, extras: ['altar', 'censer'] },
  { id: 'library', label: '藏书', kinds: ['hall'], floorMat: 'interiorBrick', runner: 0, daisTiers: 1, daisScale: 0.74,
    screenPanels: 2, screenMat: 'plasterRed', columns: 2, ceilingLayers: 1, ceilingMat: 'paintingTeal', lamps: 2,
    furnitureMat: 'timberDark', tables: 1, extras: ['shelf', 'shelf', 'shelf'] },
  { id: 'stage', label: '乐台', kinds: ['hall'], floorMat: 'pavingStone', runner: 0, daisTiers: 1, daisScale: 1.24,
    screenPanels: 2, screenMat: 'plasterRed', columns: 2, ceilingLayers: 2, ceilingMat: 'paintingTeal', lamps: 2,
    furnitureMat: 'timberLacquer', tables: 1, extras: ['drum', 'basin'] },
  // —— 配殿/配房（sideHall）——
  { id: 'duty', label: '值房', kinds: ['sideHall'], floorMat: 'pavingStone', runner: 0, couchScale: 1.0, cabinets: 1,
    screenPanels: 3, screenMat: 'plasterRed', lamps: 2, furnitureMat: 'timberLacquer', tables: 1, extras: ['bench'] },
  { id: 'store', label: '库房', kinds: ['sideHall'], floorMat: 'pavingStone', runner: 0, couchScale: 0.7, cabinets: 2,
    screenPanels: 2, screenMat: 'plasterRed', lamps: 1, furnitureMat: 'timberDark', tables: 1, extras: ['crate', 'crate'] },
  { id: 'bedchamber', label: '寝居', kinds: ['sideHall'], floorMat: 'interiorBrick', runner: 0, couchScale: 1.25, cabinets: 1,
    screenPanels: 4, screenMat: 'plasterRed', lamps: 4, furnitureMat: 'timberLacquer', tables: 1, extras: ['basin'] },
  { id: 'kitchen', label: '膳房', kinds: ['sideHall'], floorMat: 'pavingStone', runner: 0, couchScale: 0.8, cabinets: 1,
    screenPanels: 2, screenMat: 'plasterRed', lamps: 2, furnitureMat: 'timberDark', tables: 1, extras: ['stove', 'basin'] },
  { id: 'workshop', label: '作坊', kinds: ['sideHall'], floorMat: 'pavingStone', runner: 0, couchScale: 0.75, cabinets: 1,
    screenPanels: 2, screenMat: 'plasterRed', lamps: 2, furnitureMat: 'timberDark', tables: 2, extras: ['crate', 'rack'] },
  { id: 'tearoom', label: '茶室', kinds: ['sideHall'], floorMat: 'interiorBrick', runner: 0, couchScale: 1.1, cabinets: 1,
    screenPanels: 3, screenMat: 'plasterRed', lamps: 3, furnitureMat: 'timberLacquer', tables: 1, extras: ['basin', 'censer'] },
  // —— 门殿（gateHall）——
  { id: 'guard', label: '值守', kinds: ['gateHall'], floorMat: 'pavingStone', runner: 0, tableCount: 1, benches: 2,
    drum: true, bolt: true, lamps: 2, furnitureMat: 'timberLacquer' },
  { id: 'relay', label: '传报', kinds: ['gateHall'], floorMat: 'pavingStone', runner: 4.0, tableCount: 2, benches: 1,
    drum: true, bolt: false, lamps: 4, furnitureMat: 'timberDark' },
  { id: 'armory-gate', label: '兵器值', kinds: ['gateHall'], floorMat: 'interiorBrick', runner: 0, tableCount: 1, benches: 1,
    drum: false, bolt: true, lamps: 2, furnitureMat: 'timberLacquer', extras: ['rack', 'rack'] },
  // —— 角楼（cornerTower）——
  { id: 'watch', label: '瞭望', kinds: ['cornerTower'], floorMat: 'pavingStone', steps: 10, windows: 2, racks: 1, lamps: 2 },
  // 角楼的必需构件含军械架（见 §19）⇒ 两个主题都保留 ≥1 架；差异落在踏步数/窗框数/灯数
  { id: 'signal', label: '烽火', kinds: ['cornerTower'], floorMat: 'pavingStone', steps: 6, windows: 4, racks: 1, lamps: 4, extras: ['drum'] },
]);

const THEME_BY_ID = new Map(INTERIOR_THEMES.map((t) => [t.id, t]));
/** 稳定哈希（fnv1a-32）：主题分配与变体都只由 slotId 决定 ⇒ 同 id 恒同结果。 */
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/** 内景槽位清单（由 layout 只读派生；按 id 排序 ⇒ 稳定序号，与调用顺序无关）。 */
export const INTERIOR_SLOT_IDS = Object.freeze(
  INTERIOR_WALKABLE.filter((w) => w.kind === 'interior')
    .map((w) => w.id.replace(/^WK-/, '').replace(/-interior$/, ''))
    .sort(),
);
/** 槽位 → 室内套件类型（无登记/非四类时按 sideHall 口径）。 */
export function interiorKindOf(slotId) {
  const s = INTERIOR_SLOT_BY_ID[slotId];
  return s && INTERIOR_KINDS.includes(s.kind) ? s.kind : 'sideHall';
}
/**
 * 主题分配（**kit 内部按 slotId 决定**）：按 `kinds` 过滤后以 `hash32(slotId|kind)` 取模。
 * 没有 `kinds` 命中的类型回退到 hall 组，保证总能取到主题。
 */
export function themeFor(slotId, kind = null) {
  const k = kind ?? interiorKindOf(slotId);
  const scoped = INTERIOR_THEMES.filter((t) => (t.kinds ?? []).includes(k));
  const pool = scoped.length > 0 ? scoped : INTERIOR_THEMES.filter((t) => t.kinds.includes('hall'));
  return pool[hash32(`${slotId}|${k}`) % pool.length];
}
/** 同主题成员（按 INTERIOR_SLOT_IDS 稳定序）——用于"同主题内唯一序号"。 */
export function themeMembers(themeId) {
  return INTERIOR_SLOT_IDS.filter((id) => themeFor(id).id === themeId);
}
/**
 * t170：**种类专属结构特征**（在"混搭"之外再加一维，动的是**主要家具/构件的数量**）。
 * 目的：同主题的房间至少在一个"大件"上不同 ⇒ 签名距离远大于装饰计数差。
 */
export const INTERIOR_FEATURES = Object.freeze({
  hall: Object.freeze([Object.freeze({ id: 'plain' }), Object.freeze({ id: 'screen+2', panels: 2 }), Object.freeze({ id: 'columns+2', columns: 2 }), Object.freeze({ id: 'desk+bench', tables: 1, benches: 2 }), Object.freeze({ id: 'shelf+2', shelf: 2 })]),
  sideHall: Object.freeze([Object.freeze({ id: 'plain' }), Object.freeze({ id: 'cabinets+2', cabinets: 2 }), Object.freeze({ id: 'shelf+2', shelf: 2 }), Object.freeze({ id: 'desk+bench', tables: 1, benches: 2 }), Object.freeze({ id: 'screen+2', panels: 2 })]),
  gateHall: Object.freeze([Object.freeze({ id: 'plain' }), Object.freeze({ id: 'desk+bench', tables: 1, benches: 2 }), Object.freeze({ id: 'screen+2', panels: 2 }), Object.freeze({ id: 'shelf+2', shelf: 2 })]),
  cornerTower: Object.freeze([Object.freeze({ id: 'plain' }), Object.freeze({ id: 'shelf+2', shelf: 2 }), Object.freeze({ id: 'desk+bench', tables: 1, benches: 2 })]),
});
/** 结构混搭（t170）：同主题房间的**主要家具组合**再分 4 型（只动既有部位的**数量**）。 */
export const INTERIOR_MIXES = Object.freeze([
  Object.freeze({ id: 'plain' }),
  Object.freeze({ id: 'double-desk', tables: 1, benches: 2, panels: -2, lamps: -1 }),
  Object.freeze({ id: 'cabinet-heavy', cabinets: 2, shelves: 2, panels: -2, lamps: -1, columns: 2 }),
  Object.freeze({ id: 'mixed', tables: 1, crates: 2, shelf: 2, benches: 2, panels: -1, lamps: 1 }),
]);
/** 尺步：同主题房间的家具整体尺度三档（几何尺度差异 ⇒ 签名差异远大于装饰计数）。 */
export const INTERIOR_SIZE_STEPS = Object.freeze([0.75, 0.92, 1.08, 1.25]);

/** 变体（同主题内再拉开）：镜像 + 结构混搭 + 尺步 + 装饰计数，全部由 slotId 决定（确定性）。 */
export function variantFor(slotId) {
  // t170：每个轴用**独立哈希流**（不同前缀）⇒ 去相关，避免"混搭/尺步/装饰计数"同步折叠造成近同签名
  const hs = (tag) => hash32(`${tag}|${slotId}`);
  const h0 = hs('mix'); const h1 = hs('size'); const h2 = hs('mirror');
  const h3 = hs('lamp'); const h4 = hs('panel'); const h5 = hs('table');
  const h6 = hs('extra'); const h7 = hs('decoFloor'); const h8 = hs('decoTrim'); const h9 = hs('decoFurn');
  const h10 = hs('decoWall');
  // t170：**同主题内的唯一序号**（稳定、与调用顺序无关）⇒ (混搭 × 特征) 在同主题内必然互不相同
  const kind = interiorKindOf(slotId);
  const theme = themeFor(slotId, kind);
  const members = themeMembers(theme.id);
  const ordinal = Math.max(0, members.indexOf(slotId));
  const features = INTERIOR_FEATURES[kind] ?? INTERIOR_FEATURES.sideHall;
  const baseMix = INTERIOR_MIXES[ordinal % INTERIOR_MIXES.length];
  const feature = features[Math.floor(ordinal / INTERIOR_MIXES.length) % features.length];
  const mix = { ...baseMix, ...feature };
  return {
    mix,
    themeId: theme.id,
    featureId: feature.id,
    ordinal,
    sizeStep: INTERIOR_SIZE_STEPS[h1 % INTERIOR_SIZE_STEPS.length],
    mirror: h2 % 2 === 0 ? 1 : -1,
    lampDelta: (h3 % 3) - 1,
    panelDelta: (h4 % 3) - 1,
    tableDelta: h5 % 2,
    extraDelta: h6 % 2,
    // 槽位级"装饰计数"（保证同主题房间签名互不相同；只复用既有 part|material 桶 ⇒ 不新增合批桶）
    // 四轴独立装饰计数（5×7×7×5 = 1225 组合 × 4 混搭 × 4 尺步 = 19600），
    // 使 43 处内景出现"完全同签名"的期望对数 ≈ 0.05（并由 kit.test §21 精确断言兜底：
    // 一旦未来新增槽位发生碰撞，测试会打印冲突对而**不是**静默重复）
    decoFloor: 1 + (h7 % 5),             // 1..5 条地面嵌线（floor|floorTile）
    decoTrim: 1 + (h8 % 7),              // 1..7 道鎏金横线（trim|giltMetal）
    decoFurn: 1 + (h9 % 7),              // 1..7 个边几（furniture|fMat）
    decoWall: 1 + (h10 % 5),             // 1..5 道鎏金立线（trim|giltMetal）
  };
}

/** 近景三角面/部件上限（防失控；47 栋口径见 docs/handoff-kit-interiors.md）。 */
const LIMITS = Object.freeze({
  nearTriangles: 9000, // 单栋内景近景三角面上限（殿类）
  farTriangles: 2200,
  minSpan: 6, // 室内净尺寸下限（米）；小于此值只铺地面 + 一盏灯
});

const DEFAULT_INSET = 0.9; // 陈设距 bounds 边界的统一内收（避开墙厚/台明）
const WALL_MARGIN = 0.35; // 家具离墙的最小间隙

/** 把"以 (x,z) 为中心、宽 w 深 d"的盒子收进内矩形（必要时缩尺寸；实在放不下返回 null）。 */
function fitRect(x, z, w, d, inner) {
  const maxW = inner.maxX - inner.minX;
  const maxD = inner.maxZ - inner.minZ;
  if (maxW <= 0.2 || maxD <= 0.2) return null;
  const fw = Math.min(w, maxW);
  const fd = Math.min(d, maxD);
  const cx = Math.min(Math.max(x, inner.minX + fw / 2), inner.maxX - fw / 2);
  const cz = Math.min(Math.max(z, inner.minZ + fd / 2), inner.maxZ - fd / 2);
  return { x: cx, z: cz, w: fw, d: fd };
}

/** 单档几何（detail = 'near' | 'far'）。返回 { parts, items }。 */
function composeInterior(env, p, detail) {
  const T = env.THREE;
  const tile = (key) => env.materials.tileMeters(key);
  const parts = new Parts();
  const items = [];
  const g = gradeOf(env.config, p.grade);
  /* t170：主题（按 slotId 在 kit 内决定）+ 变体（同主题内再拉开） */
  const theme = THEME_BY_ID.get(p.themeId) ?? themeFor(p.slotId ?? p.id, p.kind);
  const variant = p.variant ?? variantFor(p.slotId ?? p.id);
  const fMat = theme.furnitureMat ?? 'timberLacquer';
  const sMat = theme.screenMat ?? 'plasterRed';
  const cMat = theme.ceilingMat ?? 'paintingTeal';
  const near = detail === 'near';
  const groundY = p.groundY;
  const ceilingY = Math.max(groundY + 1.8, p.ceilingY);
  const headroom = ceilingY - groundY;
  const rng = makeRng(p.seed >>> 0);
  const inner = {
    minX: p.bounds.minX + p.inset,
    maxX: p.bounds.maxX - p.inset,
    minZ: p.bounds.minZ + p.inset,
    maxZ: p.bounds.maxZ - p.inset,
  };
  const cx = (inner.minX + inner.maxX) / 2;
  const cz = (inner.minZ + inner.maxZ) / 2;
  const spanX = inner.maxX - inner.minX;
  const spanZ = inner.maxZ - inner.minZ;
  // 入口在本地 z 的哪一侧（决定"正面/正位"朝向；默认入口在 -Z 侧）
  const entranceZ = p.entrance ? p.entrance.z : p.bounds.minZ;
  const entranceX = p.entrance ? p.entrance.x : cx;
  const frontSign = entranceZ <= cz ? 1 : -1; // 正位放在入口对侧
  const backZ = frontSign > 0 ? inner.maxZ : inner.minZ;
  const add = (part, material, geometry, item = null) => {
    parts.add(part, material, geometry);
    if (item && !items.includes(item)) items.push(item);
    return geometry;
  };
  const boxAt = (part, material, { w, h, d, x, z, y = groundY, tileKey = material }) =>
    add(part, material, box(T, { w, h, d, x, z, y, tile: tile(tileKey) }));

  /* ---------------- 通用：地面（金砖/铺地）+ 御道 ---------------- */
  const floorRect = fitRect(cx, cz, spanX, spanZ, inner);
  const floorTile = theme.floorMat ?? (p.kind === 'hall' ? 'interiorBrick' : 'pavingStone');
  if (floorRect) {
    boxAt('floor', floorTile, { w: floorRect.w, h: 0.06, d: floorRect.d, x: floorRect.x, z: floorRect.z, y: groundY });
    items.push('floor');
  }
  const runnerD = Math.max(2, spanZ * 0.9);
  const runnerW = theme.runner ?? (p.kind === 'hall' ? 6.4 : 0);
  const runnerRect = runnerW > 0 ? fitRect(cx, cz, Math.min(runnerW, Math.max(1.5, spanX * 0.45)), runnerD, inner) : null;
  if (runnerRect && near) {
    boxAt('runner', 'pavingLight', { w: runnerRect.w, h: 0.03, d: runnerRect.d, x: runnerRect.x, z: runnerRect.z, y: groundY + 0.06 });
    items.push('runner');
  }

  /* ---------------- 殿（hall）：须弥座 + 正位 + 屏风 + 盘龙柱 + 藻井 + 灯 + 案/香炉 ---------------- */
  if (p.kind === 'hall') {
    const daisW = Math.min(Math.max(8, spanX * 0.34) * (theme.daisScale ?? 1) * variant.sizeStep, spanX - 2 * WALL_MARGIN);
    const daisD = Math.min(Math.max(5, spanZ * 0.3) * (theme.daisScale ?? 1) * variant.sizeStep, spanZ - 2 * WALL_MARGIN);
    const daisCZ = frontSign > 0 ? backZ - daisD / 2 - WALL_MARGIN : backZ + daisD / 2 + WALL_MARGIN;
    const dais = fitRect(cx, daisCZ, daisW, daisD, inner);
    const daisH = p.grade >= 3 ? 1.0 : 0.7;
    if (dais) {
      boxAt('dais', 'stoneWhite', { w: dais.w, h: daisH * 0.62, d: dais.d, x: dais.x, z: dais.z });
      if (near && (theme.daisTiers ?? 2) >= 2) boxAt('daisCap', 'stoneWhiteShade', { w: dais.w * 0.86, h: daisH * 0.38, d: dais.d * 0.82, x: dais.x, z: dais.z, y: groundY + daisH * 0.62 });
      items.push('dais');
      // 正位（坐具 + 鎏金靠背）
      const throneH = 1.15;
      const throne = fitRect(dais.x, dais.z + frontSign * (dais.d * 0.05), Math.min(3.0, dais.w * 0.42), Math.min(2.2, dais.d * 0.5), inner);
      if (throne) {
        boxAt('throne', 'timberDark', { w: throne.w, h: throneH, d: throne.d, x: throne.x, z: throne.z, y: groundY + daisH });
        if (near) boxAt('trim', 'giltMetal', { w: throne.w * 1.06, h: 0.16, d: throne.d * 0.16, x: throne.x, z: throne.z - frontSign * (throne.d / 2 - 0.1), y: groundY + daisH + throneH * 0.62 });
        items.push('throne');
      }
      // 屏风（五扇；grade 2 三扇）
      const panels = near ? Math.max(2, (theme.screenPanels ?? (p.grade >= 3 ? 5 : 3)) + variant.panelDelta + (variant.mix.panels ?? 0)) : 0;
      const panelW = Math.min(1.7, (dais.w * 0.9) / panels) * variant.sizeStep;
      const panelH = Math.min(headroom * 0.55, 2.8) * variant.sizeStep;
      const screenZ = frontSign > 0 ? dais.z - dais.d / 2 - 0.12 : dais.z + dais.d / 2 + 0.12;
      for (let i = 0; i < panels; i += 1) {
        const px = dais.x - (panels - 1) * panelW / 2 + i * panelW;
        boxAt('furniture', fMat, { w: panelW * 0.98, h: panelH, d: 0.14, x: px, z: screenZ, y: groundY + daisH + 0.1 });
        boxAt('screenPanel', sMat, { w: panelW * 0.8, h: panelH * 0.78, d: 0.16, x: px, z: screenZ, y: groundY + daisH + 0.2 });
        add('trim', 'giltMetal', box(T, { w: panelW * 0.14, h: panelH * 0.06, d: 0.18, x: px, y: groundY + daisH + 0.1 + panelH * 0.96, z: screenZ, tile: tile('giltMetal') }));
      }
      items.push('screen');
      // 盘龙柱（grade≥2 且近景）
      if (near && g.grade >= 2 && dais) {
        const colH = Math.min(headroom - 0.5, 4.2);
        const colCount = (theme.columns ?? 2) + (variant.mix.columns ?? 0);
        const colXs = colCount >= 4 ? [-1, 1, -0.45, 0.45] : [-1, 1];
        for (const sx of colXs) {
          const cxx = dais.x + sx * Math.min(dais.w / 2 + 1.6, spanX / 2 - 1.2) * variant.mirror;
          add('screenPanel', sMat, cylinder(T, { rt: 0.42, rb: 0.46, h: colH, seg: 10, x: cxx, z: dais.z + frontSign * (dais.d * 0.45), y: groundY, tile: tile(sMat), capped: false }));
          for (let k = 0; k < 3; k += 1) {
            add('trim', 'giltMetal', cylinder(T, { rt: 0.5, rb: 0.5, h: 0.16, seg: 10, x: cxx, z: dais.z + frontSign * (dais.d * 0.45), y: groundY + 0.6 + k * (colH / 3.2), tile: tile('giltMetal'), capped: false }));
          }
        }
        items.push('column');
      }
    }
    // 藻井（三层同心方井 + 鎏金顶心；近景且 grade≥2）
    if (near && g.grade >= 2) {
      const aw = Math.min(spanX * 0.34, 12);
      const ad = Math.min(spanZ * 0.28, 10);
      const layers = theme.ceilingLayers ?? 3;
      for (let i = 0; i < layers; i += 1) {
        const k = 1 - i * 0.24;
        const y = ceilingY - 0.1 - i * Math.min(0.42, headroom * 0.1);
        add('ceiling', cMat, box(T, { w: aw * k, h: 0.22, d: ad * k, x: cx, y: y - 0.22, z: cz, tile: tile(cMat) }));
        add('trim', 'giltMetal', box(T, { w: aw * k * 0.96, h: 0.07, d: ad * k * 0.96, x: cx, y: y + 0.02, z: cz, tile: tile('giltMetal') }));
      }
      add('trim', 'giltMetal', sphere(T, { r: Math.min(0.5, aw * 0.045), seg: 10, rings: 8, x: cx, y: ceilingY - 0.55, z: cz }));
      items.push('ceiling');
    } else if (!near) {
      // 远景：只留一层天花轮廓（保证"室内不空"的剪影）
      add('ceiling', cMat, box(T, { w: Math.min(spanX * 0.3, 10), h: 0.2, d: Math.min(spanZ * 0.24, 8), x: cx, y: ceilingY - 0.3, z: cz, tile: tile(cMat) }));
      items.push('ceiling');
    }
    // 案 + 香炉（近景）
    if (near) {
      const tableD = 1.6;
      const tableN = Math.max(1, (theme.tables ?? 1) + variant.tableDelta + (variant.mix.tables ?? 0));
      for (let ti = 0; ti < tableN; ti += 1) {
      const tOff = ti === 0 ? 0 : (ti % 2 === 1 ? 1 : -1) * Math.min(spanX * 0.26, 4.5);
      const table = fitRect(cx + tOff, dais ? dais.z + frontSign * (dais.d / 2 + 2.2) : cz + frontSign * 2, Math.min(4.2, spanX * 0.3) * variant.sizeStep, tableD * variant.sizeStep, inner);
      if (table) {
        boxAt('furniture', fMat, { w: table.w, h: 0.86, d: table.d, x: table.x, z: table.z });
        add('trim', 'giltMetal', lathe(T, {
          points: [[0.02, 0], [0.22, 0], [0.3, 0.16], [0.32, 0.34], [0.22, 0.44], [0.08, 0.46]],
          seg: 10,
          x: table.x,
          y: 0.86 + groundY,
          z: table.z,
        }));
        items.push('table');
        if (ti === 0) items.push('censer');
      }
      }
    }
  }

  /* ---------------- 配殿/配房（sideHall）：桌案 + 柜架 + 坐榻 + 屏风 + 灯 ---------------- */
  if (p.kind === 'sideHall') {
    const couchD = Math.min(Math.max(1.6, spanZ * 0.14), spanZ - 2 * WALL_MARGIN);
    const couchZ = frontSign > 0 ? backZ - couchD / 2 - WALL_MARGIN : backZ + couchD / 2 + WALL_MARGIN;
    const couch = fitRect(cx, couchZ, Math.min(spanX * 0.4, 4.4) * (theme.couchScale ?? 1) * variant.sizeStep, couchD * (theme.couchScale ?? 1) * variant.sizeStep, inner);
    if (couch) {
      boxAt('throne', 'timberDark', { w: couch.w, h: 0.52, d: couch.d, x: couch.x, z: couch.z });
      boxAt('furniture', fMat, { w: couch.w * 0.92, h: 0.34, d: couch.d * 0.34, x: couch.x, z: couch.z - frontSign * (couch.d / 2 - 0.2), y: groundY + 0.52 });
      items.push('couch');
    }
    if (near) {
      // 桌案
      const table = fitRect(cx + variant.mirror * Math.min(spanX * 0.12, 1.6), couch ? couch.z + frontSign * (couch.d / 2 + 2.4) : cz + frontSign * 2, Math.min(3.2, spanX * 0.34) * variant.sizeStep, 1.4 * variant.sizeStep, inner);
      if (table) {
        boxAt('furniture', fMat, { w: table.w, h: 0.84, d: table.d, x: table.x, z: table.z });
        items.push('table');
      }
      // 书架/柜（贴侧墙）
      const cabW = Math.min(1.2, spanX * 0.2);
      const cabD = Math.min(2.4, spanZ * 0.24);
      const cabN = Math.max(1, (theme.cabinets ?? 1) + (variant.mix.cabinets ?? 0));
      for (let ci = 0; ci < cabN; ci += 1) {
      const cabX = (ci === 0 ? inner.minX : inner.maxX) + (ci === 0 ? 1 : -1) * (cabW / 2 + WALL_MARGIN);
      const cab = fitRect(cabX, cz, cabW * variant.sizeStep, cabD * variant.sizeStep, inner);
      if (cab) {
        boxAt('furniture', fMat, { w: cab.w, h: 2.0, d: cab.d, x: cab.x, z: cab.z });
        for (let i = 0; i < 3; i += 1) {
          add('trim', 'giltMetal', box(T, { w: cab.w * 0.9, h: 0.06, d: cab.d * 0.92, x: cab.x, y: groundY + 0.5 + i * 0.55, z: cab.z, tile: tile('giltMetal') }));
        }
        items.push('cabinet');
      }
      }
      // 屏风（3 扇）
      const panels = Math.max(2, (theme.screenPanels ?? 3) + variant.panelDelta + (variant.mix.panels ?? 0));
      const panelW = Math.min(1.5, (spanX * 0.5) / panels) * variant.sizeStep;
      const panelH = Math.min(headroom * 0.5, 2.2) * variant.sizeStep;
      for (let i = 0; i < panels; i += 1) {
        const px = cx - (panels - 1) * panelW / 2 + i * panelW;
        const pz = inner.maxZ - WALL_MARGIN - 0.1;
        boxAt('furniture', fMat, { w: panelW * 0.96, h: panelH, d: 0.12, x: px, z: pz, y: groundY });
        boxAt('screenPanel', sMat, { w: panelW * 0.78, h: panelH * 0.76, d: 0.14, x: px, z: pz, y: groundY + 0.1 });
      }
      items.push('screen');
    }
  }

  /* ---------------- 门殿（gateHall）：门闩 + 值守陈设（案/更鼓/灯） ---------------- */
  if (p.kind === 'gateHall') {
    const tableN = Math.max(1, theme.tableCount ?? 1);
    for (let ti = 0; ti < tableN; ti += 1) {
      const sideX = cx + (ti === 0 ? 1 : -1) * (spanX / 2 - 1.6);
      const guard = fitRect(sideX, cz, 1.8, Math.min(2.6, spanZ * 0.4), inner);
      if (guard) {
        boxAt('furniture', fMat, { w: guard.w, h: 0.8, d: guard.d, x: guard.x, z: guard.z });
        items.push('table');
      }
    }
    if (near) {
      const benchN = Math.max(1, (theme.benches ?? 1) + (variant.mix.benches ?? 0));
      for (let bi = 0; bi < benchN; bi += 1) {
        const sideX2 = cx + (bi === 0 ? -1 : 1) * (spanX / 2 - 1.6) * 0.7;
        const bench = fitRect(sideX2, cz + (bi === 0 ? 0 : spanZ * 0.18), 1.6 * variant.sizeStep, Math.min(2.2, spanZ * 0.36) * variant.sizeStep, inner);
        if (bench) {
          boxAt('throne', 'timberDark', { w: bench.w, h: 0.46, d: bench.d, x: bench.x, z: bench.z });
          items.push('bench');
        }
      }
      // 更鼓（鎏金铜鼓）
      const drum = (theme.drum ?? true) ? fitRect(cx, cz + frontSign * Math.min(3, spanZ * 0.3), 1.4, 1.4, inner) : null;
      if (drum) {
        add('trim', 'giltMetal', cylinder(T, { rt: 0.7, rb: 0.7, h: 0.8, seg: 12, x: drum.x, z: drum.z, y: groundY + 0.1, tile: tile('giltMetal') }));
        items.push('drum');
      }
      // 门闩（内侧横木）
      const boltW = (theme.bolt ?? true) ? Math.min(spanX * 0.5, 6) : 0;
      if (boltW > 0) add('furniture', fMat, beam(T, {
        from: { x: cx - boltW / 2, y: groundY + 1.5, z: frontSign > 0 ? inner.minZ + 0.3 : inner.maxZ - 0.3 },
        to: { x: cx + boltW / 2, y: groundY + 1.5, z: frontSign > 0 ? inner.minZ + 0.3 : inner.maxZ - 0.3 },
        thickness: 0.18,
        tile: tile(fMat),
      }));
      if (boltW > 0) items.push('doorBolt');
    }
  }

  /* ---------------- 角楼（cornerTower）：盘道楼梯 + 瞭望窗框 + 军械架 ---------------- */
  if (p.kind === 'cornerTower') {
    const stepN = near ? (theme.steps ?? 10) : 4;
    const stepH = Math.min((headroom - 0.6) / Math.max(1, stepN), 0.34);
    const stepD = Math.min(1.1, Math.max(0.5, spanZ / (stepN + 3)));
    for (let i = 0; i < stepN; i += 1) {
      const z = inner.minZ + WALL_MARGIN + stepD * i;
      const r = fitRect(inner.minX + WALL_MARGIN + 1.0, z, 2.0, stepD * 0.9, inner);
      if (!r) break;
      boxAt('dais', 'stoneWhite', { w: r.w, h: stepH * (i + 1), d: r.d, x: r.x, z: r.z, y: groundY });
    }
    items.push('stair');
    if (near) {
      // 瞭望窗框（贴内墙面，仅框不打洞避免穿墙）
      const winN = theme.windows ?? 2;
      for (let wi = 0; wi < winN; wi += 1) {
        const sz = wi % 2 === 0 ? 1 : -1;
        const zz = (sz > 0 ? inner.maxZ - 0.25 : inner.minZ + 0.25) + Math.floor(wi / 2) * 1.6;
        const r = fitRect(cx, zz, Math.min(2.4, spanX * 0.4), 0.3, inner);
        if (!r) continue;
        boxAt('furniture', fMat, { w: r.w, h: 1.4, d: r.d, x: r.x, z: r.z, y: groundY + Math.min(2.2, headroom * 0.45) });
      }
      items.push('windowFrame');
      // 军械架（架 + 三支长兵：木杆 + 鎏金镦）
      const rack = (theme.racks ?? 1) > 0 ? fitRect(inner.maxX - 1.4, cz, 1.0, Math.min(3.2, spanZ * 0.4), inner) : null;
      if (rack) {
        boxAt('furniture', fMat, { w: rack.w, h: 1.6, d: rack.d, x: rack.x, z: rack.z });
        for (let i = 0; i < 3; i += 1) {
          const gz = rack.z - rack.d / 2 + (rack.d * (i + 0.5)) / 3;
          add('furniture', fMat, beam(T, {
            from: { x: rack.x - 0.35, y: groundY + 0.2, z: gz },
            to: { x: rack.x - 0.35, y: groundY + 2.4, z: gz },
            thickness: 0.1,
            tile: tile(fMat),
          }));
          add('trim', 'giltMetal', sphere(T, { r: 0.1, seg: 6, rings: 4, x: rack.x - 0.35, y: groundY + 2.45, z: gz }));
        }
        items.push('rack');
      }
    }
  }

  /* ---------------- t170：主题专属陈设（extras；只复用既有部位/材质令牌） ---------------- */
  if (near) {
    const extras = [...(theme.extras ?? [])];
    if (variant.extraDelta && extras.length > 0) extras.push(extras[0]);
    for (let k = 0; k < (variant.mix.crates ?? 0); k += 1) extras.push('crate');
    for (let k = 0; k < (variant.mix.shelf ?? 0); k += 1) extras.push('shelf');
    for (let k = 0; k < (variant.mix.benches ?? 0); k += 1) extras.push('bench');
    let ei = 0;
    for (const kind of extras) {
      const off = Math.min(spanX * 0.3, 4.0) * (ei % 2 === 0 ? 1 : -1) * variant.mirror;
      const zOff = (Math.floor(ei / 2) % 2 === 0 ? 1 : -1) * Math.min(spanZ * 0.22, 3.0);
      ei += 1;
      if (kind === 'bench') {
        const r = fitRect(cx + off, cz + zOff, 2.2, 0.9, inner);
        if (r) { boxAt('throne', 'timberDark', { w: r.w, h: 0.46, d: r.d, x: r.x, z: r.z }); items.push('bench'); }
      } else if (kind === 'shelf') {
        const r = fitRect(cx + off, cz + zOff, 1.4, 3.0, inner);
        if (r) {
          boxAt('furniture', fMat, { w: r.w, h: 2.1, d: r.d, x: r.x, z: r.z });
          for (let i = 0; i < 4; i += 1) add('trim', 'giltMetal', box(T, { w: r.w * 0.92, h: 0.05, d: r.d * 0.94, x: r.x, y: groundY + 0.4 + i * 0.45, z: r.z, tile: tile('giltMetal') }));
          items.push('shelf');
        }
      } else if (kind === 'rack') {
        const r = fitRect(cx + off, cz + zOff, 1.1, 2.6, inner);
        if (r) {
          boxAt('furniture', fMat, { w: r.w, h: 1.5, d: r.d, x: r.x, z: r.z });
          for (let i = 0; i < 3; i += 1) {
            const gz = r.z - r.d / 2 + (r.d * (i + 0.5)) / 3;
            add('furniture', fMat, beam(T, { from: { x: r.x - 0.3, y: groundY + 0.2, z: gz }, to: { x: r.x - 0.3, y: groundY + 2.3, z: gz }, thickness: 0.09, tile: tile(fMat) }));
            add('trim', 'giltMetal', sphere(T, { r: 0.09, seg: 6, rings: 4, x: r.x - 0.3, y: groundY + 2.35, z: gz }));
          }
          items.push('rack');
        }
      } else if (kind === 'basin') {
        const r = fitRect(cx + off, cz + zOff, 1.0, 1.0, inner);
        if (r) { add('trim', 'giltMetal', cylinder(T, { rt: 0.42, rb: 0.3, h: 0.5, seg: 12, x: r.x, z: r.z, y: groundY, tile: tile('giltMetal') })); items.push('basin'); }
      } else if (kind === 'crate') {
        const r = fitRect(cx + off, cz + zOff, 1.2, 1.2, inner);
        if (r) { boxAt('furniture', fMat, { w: r.w, h: 0.9, d: r.d, x: r.x, z: r.z }); items.push('crate'); }
      } else if (kind === 'stove') {
        const r = fitRect(cx + off, cz + zOff, 1.6, 1.4, inner);
        if (r) {
          boxAt('furniture', fMat, { w: r.w, h: 1.0, d: r.d, x: r.x, z: r.z });
          add('trim', 'giltMetal', cylinder(T, { rt: 0.5, rb: 0.55, h: 0.42, seg: 12, x: r.x, z: r.z, y: groundY + 1.0, tile: tile('giltMetal') }));
          items.push('stove');
        }
      } else if (kind === 'altar') {
        const r = fitRect(cx + off, cz + zOff, 2.4, 1.2, inner);
        if (r) {
          boxAt('furniture', fMat, { w: r.w, h: 1.05, d: r.d, x: r.x, z: r.z });
          add('trim', 'giltMetal', box(T, { w: r.w * 1.04, h: 0.12, d: r.d * 1.1, x: r.x, y: groundY + 1.05, z: r.z, tile: tile('giltMetal') }));
          items.push('altar');
        }
      } else if (kind === 'drum') {
        const r = fitRect(cx + off, cz + zOff, 1.3, 1.3, inner);
        if (r) { add('trim', 'giltMetal', cylinder(T, { rt: 0.62, rb: 0.62, h: 0.72, seg: 12, x: r.x, z: r.z, y: groundY + 0.1, tile: tile('giltMetal') })); items.push('drum'); }
      } else if (kind === 'censer') {
        const r = fitRect(cx + off * 0.6, cz + zOff * 0.6, 0.8, 0.8, inner);
        if (r) { add('trim', 'giltMetal', lathe(T, { points: [[0.02, 0], [0.2, 0], [0.28, 0.15], [0.3, 0.32], [0.2, 0.42], [0.07, 0.44]], seg: 10, x: r.x, y: groundY, z: r.z })); items.push('censer'); }
      }
    }
  }

  /* ---------------- t170：槽位级装饰（保证同主题房间互不相同；不新增合批桶） ---------------- */
  if (near) {
    const bandW = Math.max(1.2, Math.min(6.0, spanX * 0.55));
    for (let i = 0; i < variant.decoFloor; i += 1) {
      const zz = inner.minZ + ((i + 0.5) * (inner.maxZ - inner.minZ)) / variant.decoFloor;
      const r = fitRect(cx, zz, bandW, 0.5, inner);
      if (r) boxAt('floor', floorTile, { w: r.w, h: 0.02, d: r.d, x: r.x, z: r.z, y: groundY + 0.08 });
    }
    for (let i = 0; i < variant.decoTrim; i += 1) {
      const x = inner.minX + ((i + 0.5) * (inner.maxX - inner.minX)) / variant.decoTrim;
      const r = fitRect(x, cz, 0.16, Math.min(spanZ * 0.5, 6.0), inner);
      if (r) add('trim', 'giltMetal', box(T, { w: r.w, h: 0.09, d: r.d, x: r.x, y: groundY + 0.9 + (i % 2) * 0.5, z: r.z, tile: tile('giltMetal') }));
    }
    for (let i = 0; i < variant.decoFurn; i += 1) {
      const x = cx + ((i % 2 === 0 ? 1 : -1) * Math.min(spanX * 0.32, 5.0) * variant.mirror) * (i >= 2 ? 0.5 : 1);
      const z = cz + (i >= 2 ? Math.min(spanZ * 0.26, 3.5) : 0) * (i >= 3 ? -1 : 1);
      const r = fitRect(x, z, 1.0, 0.9, inner);
      if (r) boxAt('furniture', fMat, { w: r.w, h: 0.55, d: r.d, x: r.x, z: r.z });
    }
    for (let i = 0; i < variant.decoWall; i += 1) {
      const z = inner.minZ + ((i + 0.5) * (inner.maxZ - inner.minZ)) / variant.decoWall;
      const r = fitRect(cx + variant.mirror * Math.min(spanX * 0.34, 5.5), z, 0.16, Math.min(spanX * 0.3, 5.0), inner);
      if (r) add('trim', 'giltMetal', box(T, { w: r.d, h: 0.09, d: r.w, x: r.x, y: groundY + 1.35 + (i % 2) * 0.4, z: r.z, tile: tile('giltMetal') }));
    }
  }

  /* ---------------- 灯具（所有类型共有；近景 4 盏、远景 1 盏；不投影由调用方/材质策略决定） ---------------- */
  const lampCount = near
    ? Math.max(1, (theme.lamps ?? (p.kind === 'hall' && g.grade >= 3 ? 4 : 2)) + variant.lampDelta + (variant.mix.lamps ?? 0))
    : 1;
  const lampH = Math.min(2.6, headroom * 0.45) * variant.sizeStep;
  for (let i = 0; i < lampCount; i += 1) {
    const lx = lampCount === 1 ? cx : (i % 2 === 0 ? inner.minX + 1.2 : inner.maxX - 1.2);
    const lz = lampCount <= 2 ? cz + frontSign * Math.min(spanZ * 0.25, 3) : inner.minZ + 1.2 + (i >= 2 ? spanZ - 2.4 : 0);
    const r = fitRect(lx, lz, 1.0, 1.0, inner);
    if (!r) continue;
    add('furniture', 'timberDark', cylinder(T, { rt: 0.07, rb: 0.09, h: lampH, seg: 8, x: r.x, z: r.z, y: groundY, tile: tile('timberDark'), capped: false }));
    add('lanternGlow', 'lampGlow', cylinder(T, { rt: 0.2, rb: 0.22, h: 0.36, seg: 10, x: r.x, z: r.z, y: groundY + lampH, tile: tile('lampGlow') }));
    add('trim', 'giltMetal', cylinder(T, { rt: 0.02, rb: 0.26, h: 0.14, seg: 10, x: r.x, z: r.z, y: groundY + lampH + 0.36, tile: tile('giltMetal') }));
    items.push('lantern');
  }
  // 未见过的随机量不参与几何（保持确定性）：seed 仅用于轻微摆放抖动
  const jitter = rng.range(-0.02, 0.02);
  void jitter;

  return { parts, items, dims: { spanX, spanZ, headroom, ceilingY, inner, detail } };
}

/**
 * 组装 `kit.interiorSet(...)`。
 * 返回未挂载的 THREE.Group（`lod:'near'|'far'|'none'`）或 THREE.LOD（默认 'auto'，近/远两档）。
 */
export function interiorSet(env, raw = {}) {
  const { config } = env;
  const T = env.THREE;
  const kind = raw.kind ?? 'hall';
  if (!INTERIOR_KINDS.includes(kind)) {
    throw new Error(`kit.interiorSet: 未知建筑类型 ${String(kind)}（只能是 ${INTERIOR_KINDS.join(' | ')}）`);
  }
  const grade = raw.grade ?? 2;
  gradeOf(config, grade); // 非法等级直接抛错（与构件工厂同口径）
  const bounds = raw.bounds;
  if (!bounds || ![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('kit.interiorSet: params.bounds 必须是 { minX, maxX, minZ, maxZ }（世界坐标，米）');
  }
  if (!(bounds.maxX - bounds.minX > 0.5 && bounds.maxZ - bounds.minZ > 0.5)) {
    throw new Error(`kit.interiorSet: bounds 尺寸非法（${bounds.maxX - bounds.minX} × ${bounds.maxZ - bounds.minZ}）`);
  }
  const groundY = typeof raw.groundY === 'number' ? raw.groundY : 0;
  const inset = typeof raw.inset === 'number' ? raw.inset : DEFAULT_INSET;
  const p = {
    kind,
    grade,
    bounds,
    groundY,
    inset,
    // 默认天花高度：保守 3.4m（调用方可传 ceilingY；不传也不会穿顶）
    ceilingY: typeof raw.ceilingY === 'number' ? raw.ceilingY : groundY + 3.4,
    entrance: raw.entrance ? { x: raw.entrance.x ?? (bounds.minX + bounds.maxX) / 2, z: raw.entrance.z ?? bounds.minZ } : null,
    seed: raw.seed ?? env.deriveSeed?.(raw.id ?? kind, kind) ?? config.SCENE_SEED,
    id: raw.id ?? `interior:${kind}`,
    slotId: (raw.id ?? kind).replace(/:int$/, ''),
  };
  if (p.ceilingY <= groundY + 0.5) throw new Error(`kit.interiorSet: ceilingY(${p.ceilingY}) 必须高于 groundY(${groundY})`);
  p.center = { x: (bounds.minX + bounds.maxX) / 2, y: groundY, z: (bounds.minZ + bounds.maxZ) / 2 };
  const innerSpan = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) - 2 * inset;
  const warnings = [];
  if (innerSpan < LIMITS.minSpan) {
    warnings.push({ code: 'interior-tight', message: `${p.id}: 室内净尺寸 ${innerSpan.toFixed(1)}m < ${LIMITS.minSpan}m，降级为"地面 + 灯"` });
  }

  const wanted = raw.lod ?? 'auto';
  const build = (detail) => composeInterior(env, p, innerSpan < LIMITS.minSpan ? 'far' : detail);
  const groupOf = (detail) => {
    // 远景档刻意留空：室内陈设只在"看得见"的距离内绘制（LOD 第 3 档为空 → 全城/远景视角 0 新增调用，
    // 否则 47+ 栋 × 每栋数个合批桶会把 config.BUDGET.drawCalls.mainSceneMax(350) 吃光）。
    if (detail === 'far') {
      const empty = new env.THREE.Group();
      empty.name = `${p.id}:far(empty)`;
      return { group: empty, items: [], dims: null, triangles: 0 };
    }
    const { parts: built, items, dims } = build(detail);
    const group = new T.Group();
    group.name = `${p.id}:${detail}`;
    let triangles = 0;
    for (const { part, material, geometry } of built.merge(T)) {
      triangles += Math.floor(geometry.attributes.position.count / 3);
      // 几何改为"以内景中心为原点"的局部坐标（与构件工厂一致）：LOD 距离按每栋自身位置计算，
      // 调用方拿到 Group 后可直接 root.add（位置已设好）或按需再旋转。
      translate(T, geometry, -p.center.x, -p.center.y, -p.center.z);
      const mesh = new T.Mesh(geometry, env.materials.get(material));
      mesh.name = `${p.id}:${detail}:${part}`;
      mesh.userData.part = part;
      mesh.userData.materialKey = material;
      mesh.userData.interior = true;
      // 室内陈设一律投影 + 接收（与构件工厂同口径；合批阴影守恒由 §15 负责）
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return { group, items, dims, triangles };
  };

  let object;
  let metrics;
  if (wanted === 'near' || wanted === 'far' || wanted === 'none') {
    const detail = wanted === 'none' ? 'near' : wanted;
    const { group, items, dims, triangles } = groupOf(detail);
    object = group;
    metrics = { items, triangles: { [detail]: triangles }, dims };
  } else {
    const nearR = groupOf('near');
    const midR = groupOf('mid');
    const farR = groupOf('far');
    object = makeLOD(env.THREE, [{ object: nearR.group }, { object: midR.group }, { object: farR.group }], {
      budget: config.BUDGET.lod,
      quality: env.quality,
      name: `${p.id}:lod`,
    });
    metrics = {
      items: nearR.items,
      triangles: { near: nearR.triangles, mid: midR.triangles, far: farR.triangles },
      dims: nearR.dims,
      lodLevels: 3,
      lodDistances: object.userData.kit?.distances ?? [],
    };
  }
  object.position.set(p.center.x, p.center.y, p.center.z);
  object.updateMatrixWorld(true);
  const worldBox = new T.Box3().setFromObject(object.isLOD ? object.levels[0].object : object);
  const chosenTheme = THEME_BY_ID.get(p.themeId) ?? themeFor(p.slotId, p.kind);
  const chosenVariant = p.variant ?? variantFor(p.slotId);
  object.userData.kit = {
    id: p.id,
    kind: 'interior',
    interiorKind: kind,
    grade,
    detail: wanted,
    params: { ...p },
    metrics: {
      ...metrics,
      theme: { id: chosenTheme.id, label: chosenTheme.label, variant: chosenVariant },
      center: p.center,
      worldBounds: {
        minX: +worldBox.min.x.toFixed(3), maxX: +worldBox.max.x.toFixed(3),
        minY: +worldBox.min.y.toFixed(3), maxY: +worldBox.max.y.toFixed(3),
        minZ: +worldBox.min.z.toFixed(3), maxZ: +worldBox.max.z.toFixed(3),
      },
      bounds: { ...bounds },
    },
    warnings,
    version: 'kit-interiors-1.0.0',
  };
  return object;
}

export default interiorSet;
