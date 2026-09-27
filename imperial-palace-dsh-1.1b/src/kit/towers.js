/**
 * src/kit/towers.js —— 扩建工作流（t184，**新文件，未接线**）
 * =============================================================================
 * 用途：为"加入高层的塔楼、可以上去的塔楼"提供**可登多层塔楼**的构件工厂与**面序列规格**。
 *
 * 形制（参照见 `docs/handoff-bulk-expansion.md` §1）：中央实心塔身 + **外螺旋盘道**逐级升高
 *   （每级踏面 0.15m × 0.34m，即 `MODULES.stairsStepHeight/stairsStepDepth`）+ 顶层观景平
 *   台 + 攒尖顶。真实参照：沈阳故宫大政殿"八角重檐攒尖 + 八面出廊"、北京故宫角楼"台基楼梯分
 *   上下两层"、颐和园佛香阁"八角三层四重檐、坐落于高台基上"。
 *
 * 四条可机器判定的约束：
 *   ① **每跳 |Δy| ≤ 0.45m**：本模块实际取 `INTERACTION.step.maxStepHeight × 0.84 = 0.42`
 *      （刻意小于 0.45 且远离"刚好 0.50"，float32 安全）；**踏面增量**远小于该上限（0.15m）。
 *   ② **双向可走**：盘道是一条单调上行链，反向即下行链（同一链、同一阈值，无单向陷阱）。
 *   ③ **不被更高面取高**：所有可行走面**平面互不相交**（外螺旋的半径随高度外扩 ⇒ 不会自我叠压；
 *      中央塔身是障碍、不登记为面）。`faceOverlaps()` 逐对面做 O(n²) 平面相交检查。
 *   ④ **登记与几何同轮**：`makeTower()` 的 `{group, walkable, obstacles, viewpoints}` 由**同一 plan**
 *      生成 —— 每个可行走面都有对应实体踏面板，每根障碍柱都有对应几何，绝不造空气墙。
 *
 * 形制白名单（`config.GRADES[grade].roofTypes`）：塔顶一律 `pyramidal` ⇒ 仅用于 `grade ≤ 2`
 *   （`grade 3` 只允许 `doubleEaveHip`，需走 kit 的重檐屋顶构造 ⇒ 集成时另派，见回执 §5）。
 */

import { Parts, box, cone } from './geometry.js';
import { shadowPolicy } from './merge.js';

const round = (v) => Math.round(v * 1000) / 1000;

/** 跳变安全系数：`maxStepHeight(0.5) × 0.84 = 0.42` —— 小于 0.45，且远离"刚好 0.50"。 */
export const CLIMB_SAFETY = 0.84;
/** 单跳上限（米）。 */
export function climbStepMax(config) {
  return round(config.INTERACTION.step.maxStepHeight * CLIMB_SAFETY);
}

/**
 * 塔型表（**数据**，不是逐座字面量）：层数 × 塔身开间数 × 顶制。
 * 尺寸全部由 `config.MODULES` 令牌 + 这里的层数/开间数推导 ⇒ 新增塔型只加一行。
 */
export const TOWER_SPECS = Object.freeze([
  Object.freeze({ id: 'watchtower-3', label: '三层观景塔', levels: 3, bays: 3, roofType: 'pyramidal', grade: 2 }),
  Object.freeze({ id: 'watchtower-5', label: '五层瞭望塔', levels: 5, bays: 3, roofType: 'pyramidal', grade: 2 }),
  Object.freeze({ id: 'bell-tower-4', label: '四层钟楼', levels: 4, bays: 4, roofType: 'pyramidal', grade: 2 }),
]);

/** 取塔型；未知 id 回退到表内第一项（确定性）。 */
export function towerSpecFor(id) {
  return TOWER_SPECS.find((s) => s.id === id) ?? TOWER_SPECS[0];
}

/**
 * 塔楼**建造计划**（纯数据，无 THREE）：尺寸、盘道面序列、塔身障碍、观景台。
 * @param {{id?:string, spec?:string, x?:number, z?:number, baseY?:number, rotationYDeg?:number}} raw
 * @param {object} config CONFIG（只读）
 */
export function towerPlan(raw = {}, config) {
  const M = config.MODULES;
  const spec = towerSpecFor(raw.spec);
  const baseY = round(raw.baseY ?? 0);
  const x = round(raw.x ?? 0);
  const z = round(raw.z ?? 0);
  const id = raw.id ?? 'tower';

  const stepRise = round(M.stairsStepHeight); // 0.15 踏面高（与几何同一数值）
  const stepDepth = round(M.stairsStepDepth); // 0.34 踏面深（沿外廊弧长方向）
  const risePerLevel = round(M.terraceTierHeight * 1.8); // 2.7 层高（令牌推导）
  const shaftHalf0 = round((M.bayPitch * spec.bays) / 2); // 首层塔身半宽
  const ringW = round(M.plinthHeightMin * 4); // 1.8 外廊（= 每层向内收进步长）
  const slab = round(M.roofThickness * 0.3); // 平台板厚
  const entryRise = climbStepMax(config); // 0.42 入口第一级
  const baseH = round(entryRise * 2); // 0.84 台座（两级入口）
  const roofRise = round(M.roofRisePerBay * spec.bays * 5);
  const stepsPerLevel = Math.max(2, Math.round(risePerLevel / stepRise)); // 18
  const risePerStep = round(risePerLevel / stepsPerLevel); // 0.15
  const flightLen = round(stepDepth * stepsPerLevel); // 6.12 梯段水平长度（沿外廊）
  const levels = spec.levels;

  // 逐层：半宽逐层内收 ringW ⇒ 上一层的"外露环带"与下一层的走道**平面互不相交**（与
  // MODULES.terraceTierInset 的台基层内收同构：更高面不覆盖低面 ⇒ 不会被"取高"）。
  const faces = [];
  const towerHalf = (k) => round(shaftHalf0 + ringW - k * ringW);
  const levelY = (k) => round(baseY + baseH + k * risePerLevel);
  const topY = levelY(levels);

  for (let k = 0; k < levels; k += 1) {
    const y = levelY(k);
    const h = towerHalf(k);
    const hNext = towerHalf(k + 1);
    const laneCenter = round((h + hNext) / 2); // 该层外露环带的中线半径
    const laneW = round(h - hNext); // 环带宽度（= ringW）
    const spanInner = round(2 * hNext); // 被上一层覆盖的中央区域（本层不登记为面）
    // 四面环带：N/S 只取中央 spanInner 宽（角部由 E/W 覆盖）；E 侧再按梯段平面分成两段
    // ⇒ 四条环带 + 梯段彼此**平面互不相交**（"不被更高面取高"的结构保证）。
    const flightZ0 = round(z - h + stepDepth / 2 + ringW * 0.2);
    const flightZ1 = round(flightZ0 + (stepsPerLevel - 1) * stepDepth + stepDepth);
    const eNorthD = round(flightZ0 - stepDepth / 2 - (z - h));
    const eSouthD = round((z + h) - (flightZ1 + stepDepth / 2));
    faces.push(
      { id: `${id}-L${k + 1}-ringN`, kind: 'ring', level: k + 1, y, w: spanInner, d: laneW, x, z: round(z - laneCenter) },
      { id: `${id}-L${k + 1}-ringS`, kind: 'ring', level: k + 1, y, w: spanInner, d: laneW, x, z: round(z + laneCenter) },
      { id: `${id}-L${k + 1}-ringW`, kind: 'ring', level: k + 1, y, w: laneW, d: round(2 * h), x: round(x - laneCenter), z },
    );
    if (eNorthD > 0.05) faces.push({ id: `${id}-L${k + 1}-ringEn`, kind: 'ring', level: k + 1, y, w: laneW, d: eNorthD, x: round(x + laneCenter), z: round(z - h + eNorthD / 2) });
    if (eSouthD > 0.05) faces.push({ id: `${id}-L${k + 1}-ringEs`, kind: 'ring', level: k + 1, y, w: laneW, d: eSouthD, x: round(x + laneCenter), z: round(flightZ1 + stepDepth / 2 + eSouthD / 2) });
    // 该层 → 上一层（顶层那段通向观景台）：梯段沿 +X 侧环带推进（占 E 侧环带的一段，故把 E 环带拆开）
    const flightY0 = y;
    const fx0 = round(x + laneCenter);
    const fz0 = round(z - h + stepDepth / 2 + ringW * 0.2);
    for (let i = 0; i < stepsPerLevel; i += 1) {
      faces.push({
        id: `${id}-L${k + 1}-step-${String(i + 1).padStart(2, '0')}`,
        kind: 'step',
        level: k + 1,
        y: round(flightY0 + (i + 1) * risePerStep),
        w: laneW,
        d: stepDepth,
        x: fx0,
        z: round(fz0 + i * stepDepth),
      });
    }
  }

  // 入口两级（+Z 侧，位于首层环带之外）
  const entryW = round(M.bayPitch * spec.bays * 0.4);
  for (let i = 0; i < 2; i += 1) {
    faces.push({
      id: `${id}-entry-${i + 1}`,
      kind: 'entry',
      level: 0,
      y: round(baseY + entryRise * (i + 1)),
      w: entryW,
      d: round(stepDepth * 3),
      x,
      z: round(z + towerHalf(0) + (2 - i) * round(stepDepth * 3 + 0.05)),
    });
  }

  // 顶层观景台：最高一层的**内收中央平台**（在被覆盖区域内，故高一级、不与任何环带相交）
  const deck = {
    id: `${id}-deck`,
    kind: 'deck',
    level: levels + 1,
    y: round(topY),
    w: round(2 * towerHalf(levels)),
    d: round(2 * towerHalf(levels)),
    x,
    z,
  };
  faces.push(deck);

  // 尺寸自洽守卫：承载梯段的那一层，其边长必须 ≥ 梯段水平长 + 端部余量（否则梯段会绕回去压到环带）
  for (let k = 0; k < levels; k += 1) {
    const side = round(2 * towerHalf(k));
    if (side < flightLen + stepDepth) {
      throw new Error(`kit.towers(${id}): 第 ${k + 1} 层边长 ${side}m < 梯段 ${flightLen}m + 余量 —— 请增大 bays 或减少 levels`);
    }
  }

  /* 塔身（实心障碍：**中央内芯**，不登记为可行走面）。
     t37 修复（原实现会**生产级不可登**）：原来取 `2 × towerHalf(0)`（首层满宽）且 `y1 = topY + roofRise`
     ⇒ 该盒在 xz 上覆盖**全部 72 块面**（实测 70/72 落在盒内），且生产判定 `obstacleBlocksPoint` 用
     「玩家体段 [feetY, feetY+1.8] 与障碍 [y0,y1] 相交（含界）」⇒ 站在盘道/观景台上的玩家**全被挡住**
     （plan 级 `climbSequenceReport.ok` 只查面序列、不查障碍 ⇒ 会出现"计划绿、生产红"）。
     改为**中央内芯**：半宽 = 最内层 `towerHalf(levels)`、`y1 = topY − slab`（观景台板底）——
     · 环带/踏面/入口都在内芯之外（最近处 = 环带中线，距内芯边缘 0.9m ≫ 玩家半径 0.35m）✓；
     · 观景台面（y = topY）高于 `y1` ⇒ 含界判定也不拦 ✓（若取 `y1 = topY` 则含界会拦住观景台）；
     · 与可见几何同轮：逐层台体本就堆出这根内芯，`wallBody` 板与之同尺寸（不再是一个吞掉盘道的满宽实体）。 */
  const shafts = [{
    id: `${id}-shaft`,
    x,
    z,
    w: round(2 * towerHalf(levels)),
    d: round(2 * towerHalf(levels)),
    y0: round(baseY),
    y1: round(topY - slab),
    roofType: spec.roofType,
  }];

  // 显式行走路径（上行；反向即下行）——逐跳检查沿这条链，而不是"按 y 排序的全体面"
  const pathIds = [];
  pathIds.push(`${id}-entry-1`, `${id}-entry-2`);
  for (let k = 0; k < levels; k += 1) {
    const ring = faces.find((f) => f.id === `${id}-L${k + 1}-ringN`);
    if (ring) pathIds.push(ring.id);
    for (let i = 0; i < stepsPerLevel; i += 1) {
      pathIds.push(`${id}-L${k + 1}-step-${String(i + 1).padStart(2, '0')}`);
    }
  }
  pathIds.push(deck.id);
  const climb = climbSequenceReport(faces, config, baseY, pathIds);
  return {
    id,
    pathIds,
    label: spec.label,
    spec,
    grade: spec.grade,
    roofType: spec.roofType,
    x,
    z,
    baseY,
    rotationYDeg: raw.rotationYDeg ?? 0,
    tokens: { stepRise, stepDepth, risePerLevel, stepsPerLevel, risePerStep, flightLen, shaftHalf0, ringW, slab, baseH, roofRise, entryRise, levels, topHalf: towerHalf(levels) },
    topY,
    totalHeight: round(topY - baseY + roofRise),
    faces,
    shafts,
    deckFaceId: deck.id,
    viewpoint: {
      id: `VP-${id}-top`,
      position: { x, y: round(topY + 1.65), z },
      target: { x, y: round(topY + 1.1), z: round(z + 60) },
      fov: 62,
    },
    climb,
  };
}

/** 逐跳检查（纯数据；`.ok` 口径）：上行链 + 反向即下行链 + 平面不叠压。 */
export function climbSequenceReport(faces, config, baseY = 0, pathIds = null) {
  const maxHop = climbStepMax(config);
  const byId = new Map(faces.map((f) => [f.id, f]));
  const ups = pathIds && pathIds.every((fid) => byId.has(fid))
    ? pathIds.map((fid) => byId.get(fid))
    : [...faces].sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  const hops = [];
  for (let i = 1; i < ups.length; i += 1) hops.push({ from: ups[i - 1].id, to: ups[i].id, dy: round(ups[i].y - ups[i - 1].y) });
  const worst = hops.reduce((m, h) => (h.dy > m.dy ? h : m), { dy: -Infinity, from: null, to: null });
  const over = hops.filter((h) => h.dy > maxHop + 1e-6);
  const downs = hops.map((h) => ({ from: h.to, to: h.from, dy: round(-h.dy) }));
  const downOver = downs.filter((h) => h.dy > maxHop + 1e-6);
  const overlaps = faceOverlaps(faces);
  const top = ups[ups.length - 1] ?? null;
  return {
    ok: over.length === 0 && downOver.length === 0 && overlaps.length === 0,
    maxHop,
    hops: hops.length,
    maxHopMeasured: worst.dy,
    worstPair: [worst.from, worst.to],
    overHops: over.slice(0, 8),
    reverseOk: downOver.length === 0,
    reverseOverHops: downOver.slice(0, 8),
    overlaps: overlaps.slice(0, 8),
    overlapCount: overlaps.length,
    topFaceId: top?.id ?? null,
    topFaceY: top?.y ?? null,
    baseY,
    faceCount: faces.length,
  };
}

/** 平面相交且高度不同 ⇒ "被更高面取高"陷阱（逐对 O(n²)）。 */
export function faceOverlaps(faces) {
  const out = [];
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      const a = faces[i];
      const b = faces[j];
      if (Math.abs(a.y - b.y) < 1e-6) continue; // 同高共面不算"被更高面取高"
      const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
      const oz = Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2);
      if (ox > 1e-6 && oz > 1e-6) out.push({ a: a.id, b: b.id, dy: round(b.y - a.y) });
    }
  }
  return out;
}

/**
 * 建造塔楼几何（与 `towerPlan` **同源同轮**）。
 * @returns {{group:object, walkable:Array, obstacles:Array, viewpoints:Array, plan:object, metrics:object}}
 */
export function makeTower(env, raw = {}) {
  const T = env.THREE;
  const config = env.config;
  const M = config.MODULES;
  const plan = towerPlan(raw, config);
  const detail = raw.detail ?? 'near';
  const name = plan.id;
  const parts = new Parts();

  // ① 每个可行走面一块实体板（walkable ↔ 几何一一对应：环带 / 踏步 / 入口 / 观景台）
  for (const f of plan.faces) {
    const part = f.kind === 'step' ? 'stairs' : 'terraceCap';
    const material = f.kind === 'step' ? 'stoneWhiteShade' : 'stoneWhite';
    parts.add(part, material, box(T, { w: f.w, h: plan.tokens.slab, d: f.d, x: f.x - plan.x, y: f.y - plan.tokens.slab, z: f.z - plan.z, tile: 1 }));
  }
  // ② 逐层台体（几何与"面所在的层"同高：台体顶面 = 该层环带的立足面）
  for (let k = 0; k < plan.spec.levels; k += 1) {
    const y0 = round(plan.baseY + plan.tokens.baseH);
    const y1 = round(y0 + (k + 1) * plan.tokens.risePerLevel);
    const half = round(plan.tokens.shaftHalf0 + plan.tokens.ringW - k * plan.tokens.ringW);
    parts.add('terrace', 'stoneWhite', box(T, { w: round(2 * half), h: round(y1 - y0), d: round(2 * half), x: 0, y: y0, z: 0 }));
  }
  // ③ 台座 + 塔身障碍几何 + 攒尖顶 + 宝顶
  for (const s of plan.shafts) {
    // t37：与障碍**逐值同源**（内芯）——原为 `s.w/s.d`（当时是满宽）会吞掉盘道；现在 s 已是内芯
    parts.add('wallBody', 'plasterRed', box(T, { w: s.w, h: round(s.y1 - s.y0), d: s.d, x: s.x - plan.x, y: s.y0, z: s.z - plan.z }));
  }
  const roof = cone(T, { r: round(plan.tokens.topHalf * 2.4), h: plan.tokens.roofRise, seg: 4, x: 0, y: round(plan.topY), z: 0 });
  roof.rotateY(Math.PI / 4);
  parts.add('roof', 'glazeTile', roof);
  parts.add('finial', 'giltMetal', cone(T, { r: round(M.roofRisePerBay), h: round(M.roofRisePerBay * 2), seg: 8, x: 0, y: round(plan.topY + plan.tokens.roofRise), z: 0 }));

  const triangles = parts.triangleCount();
  const mergedParts = parts.merge(T);
  const group = new T.Group();
  group.name = name;
  for (const { part, material, geometry } of mergedParts) {
    const mesh = new T.Mesh(geometry, env.materials.get(material));
    mesh.name = `${name}:${part}`;
    mesh.userData.part = part;
    mesh.userData.materialKey = material;
    mesh.userData.kind = 'tower';
    const flags = shadowPolicy(config, part);
    mesh.castShadow = flags.castShadow;
    mesh.receiveShadow = flags.receiveShadow;
    group.add(mesh);
  }
  group.position.set(plan.x, 0, plan.z);
  group.rotation.y = ((plan.rotationYDeg ?? 0) * Math.PI) / 180;
  group.updateMatrixWorld(true);

  const bbox = new T.Box3().setFromObject(group);
  const metrics = {
    id: name,
    kind: 'tower',
    name: plan.label,
    detail,
    triangles,
    worldBounds: { minX: bbox.min.x, maxX: bbox.max.x, minY: bbox.min.y, maxY: bbox.max.y, minZ: bbox.min.z, maxZ: bbox.max.z },
    topY: plan.topY,
    totalHeight: plan.totalHeight,
    levels: plan.spec.levels,
    roofType: plan.roofType,
    grade: plan.grade,
    climb: plan.climb,
    parts: mergedParts.map((m) => m.part),
  };
  group.userData.kit = { id: name, kind: 'tower', name: plan.label, detail, metrics };

  // walkable / obstacles / viewpoints：由**同一 plan** 派生
  /* t37（P0 ①）：`kind` 由 `'towerStep'` 改为**既有白名单值 `'terrace'`** ——
     `WALKABLE_KINDS`（`src/core/context.js:80`）= `ground/terrace/interior/bridgeDeck/gardenGround/outerTerrain/passage`
     **不含 `towerStep`** ⇒ 原样接线会在 `validateZoneResult` 抛 `ZoneContractError`（`.kind 非法`）⇒ 全树 0 区装载。
     二选一的取舍：把 `towerStep` 纳入白名单需改 `src/core/context.js`（**不在 t37 inScope**），
     且新 kind 会牵动所有消费方（求解器/审计/计数）；故取**改用既有白名单 kind**：
     · `'terrace'` = "台面/平台级可行走面"，与本塔的环带/踏面/入口/观景台语义一致（每块面都是一块实体板）；
     · 该 kind 亦在 F 区花园填充的 `FILL_KEEP_KINDS`（`src/zones/garden-boundary.js:876`）内 ⇒ 不会被填充物压占；
     · **不使用** `-transition-N` 的 id 后缀（t102 的"过渡面只属 18 栋"守卫按 id 后缀判定，误用会转红）。 */
  const walkable = plan.faces.map((f) => ({
    id: `WK-${name}-${f.id.replace(`${name}-`, '')}`,
    zone: raw.zone ?? null,
    kind: 'terrace',
    y: f.y,
    bounds: { minX: round(f.x - f.w / 2), maxX: round(f.x + f.w / 2), minZ: round(f.z - f.d / 2), maxZ: round(f.z + f.d / 2) },
    enterable: true,
    level: f.level,
    sourceId: f.id,
  }));
  const obstacles = plan.shafts.map((s) => ({
    id: `OB-${name}-shaft`,
    zone: raw.zone ?? null,
    kind: 'towerShaft',
    buildingId: name,
    bounds: { minX: round(s.x - s.w / 2), maxX: round(s.x + s.w / 2), minZ: round(s.z - s.d / 2), maxZ: round(s.z + s.d / 2) },
    y0: s.y0,
    y1: s.y1,
    blocks: 'all',
    sourceType: 'tower',
    sourceId: s.id,
  }));
  /* t37（P0 ②）：塔顶机位由 `mode:'interior'` 改为 **`mode:'focus-extra'`** ——
     `interior` 机位是**冻结的 43 栋内景集合**（`INTERIOR_BY_SLOT` 43 条 / `VP` 内景 43 个 / `visitable` 43 栋）
     的一部分：新增一个 `interior` 机位会把 43 → 44，并触发「interior 机位必须落在 `kind==='interior'` 的面上」
     校验（塔顶是 `terrace` 面 ⇒ 直接判非法）与全部 43 条计数 pin。塔顶观景台**不是建筑内景**，
     故用既有合法 mode **`focus-extra`**（`VIEWPOINT_MODES` 白名单，`src/core/context.js:71`）：
     · 对 43 栋内景集合**零影响**（`INTERIOR_BY_SLOT` / `visitable` / interior 机位数一字不动）；
     · 只使 `VIEWPOINTS` 61 → 62（每座塔 +1）与 `focus-extra` 6 → 7 —— 接线时须同步 `layout.test` 的
       `VIEWPOINTS` pin 与 CONTRACTS §5.2.1（后者属他人 inScope，已列入交回清单）。 */
  const viewpoints = [{
    id: `VP-${name}-top`,
    zone: raw.zone ?? null,
    mode: 'focus-extra',
    name: `${plan.label}顶层观景台`,
    position: { ...plan.viewpoint.position },
    target: { ...plan.viewpoint.target },
    fov: plan.viewpoint.fov,
  }];

  return { group, walkable, obstacles, viewpoints, plan, metrics };
}

/** 释放塔楼自有几何（塔楼不共享材质/贴图 ⇒ 只释放 geometry）。幂等。 */
export function disposeTower(towers = []) {
  for (const item of towers) {
    try {
      item.group?.traverse?.((node) => { if (node.isMesh) node.geometry?.dispose?.(); });
    } catch { /* 幂等 */ }
  }
}
