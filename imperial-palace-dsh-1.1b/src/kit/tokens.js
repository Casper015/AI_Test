/**
 * tokens.js — 令牌解析层（纯函数，不 import three）
 * =============================================================================
 * 纪律：本文件（以及整个 src/kit/）**不得出现任何十六进制色值字面量**。
 *   所有颜色必须经 colorOf() 从 config.COLOR_ROLES → config.COLORS / config.COLORS_DERIVED 解析；
 *   所有尺寸/模数必须经 moduleScale() / gradeOf() / roofOf() / qualityOf() 从 config 解析。
 * tests/kit.test.mjs 会对 src/kit/*.js 做源码扫描，出现 `#rrggbb` 即失败。
 */

/** 屋顶类型 id 白名单（来自 config.ROOF_TYPES 的键，顺序固定）。 */
export const ROOF_TYPE_IDS = Object.freeze(['doubleEaveHip', 'hip', 'gableHip', 'gable', 'pyramidal']);

/** 装饰等级白名单（config.GRADES 的键）。 */
export const GRADE_IDS = Object.freeze([1, 2, 3]);

/** 工厂公共「形制标识」：params 至少包含这些字段（CONTRACTS §3.4 / 计划 §5.1）。 */
export const REQUIRED_PARAM_FIELDS = Object.freeze([
  'id',
  'name',
  'bays',
  'w',
  'd',
  'terraceH',
  'roofType',
  'grade',
  'facing',
  'quality',
]);

/** 质量档（config.QUALITY.tiers）。 */
export function qualityOf(config, tier) {
  const t = config.QUALITY.tiers[tier] ?? config.QUALITY.tiers[config.QUALITY.default];
  if (!t) throw new Error(`kit: 未知质量档 ${String(tier)}`);
  return t;
}

/** 装饰等级（config.GRADES）。 */
export function gradeOf(config, grade) {
  const g = config.GRADES[grade];
  if (!g) throw new Error(`kit: 未知装饰等级 ${String(grade)}（只能是 1|2|3，见 config.GRADES）`);
  return g;
}

/** 屋顶形制（config.ROOF_TYPES）。 */
export function roofOf(config, roofType) {
  const r = config.ROOF_TYPES[roofType];
  if (!r) {
    throw new Error(
      `kit: 未知屋顶类型 ${String(roofType)}；只能是 ${Object.keys(config.ROOF_TYPES).join(' | ')}`,
    );
  }
  return r;
}

/**
 * 颜色令牌解析。接受三种名字，全部落到 config 内的值：
 *   1) COLOR_ROLES 的语义角色名（推荐，如 'roofPrimary' / 'terraceStone'）
 *   2) MATERIALS 的 id（取其 colorRole，如 'glazeTile' → 'roofPrimary'）
 *   3) 色板键名（'glazeGold' / 'glazeGoldRidge' / 'mossGreen' …）
 * 解析失败即抛错——不允许任何"随手写个颜色"的退路。
 */
export function colorOf(config, name) {
  const key = String(name);
  const roles = config.COLOR_ROLES;
  let paletteKey = key;

  if (Object.prototype.hasOwnProperty.call(roles, key)) paletteKey = roles[key];
  else if (Object.prototype.hasOwnProperty.call(config.MATERIALS, key)) paletteKey = roles[config.MATERIALS[key].colorRole];
  else if (!Object.prototype.hasOwnProperty.call(config.COLORS, key) && !Object.prototype.hasOwnProperty.call(config.COLORS_DERIVED, key)) {
    throw new Error(`kit: 未知颜色令牌 ${key}（不在 COLOR_ROLES/MATERIALS/COLORS/COLORS_DERIVED 中）`);
  }

  const value = config.COLORS[paletteKey] ?? config.COLORS_DERIVED[paletteKey];
  if (typeof value !== 'string') throw new Error(`kit: 颜色令牌 ${key} 未解析到色值`);
  return value;
}

/** 颜色令牌 → 解析链（供诊断/测试核对，不做任何隐式兜底）。 */
export function colorChain(config, name) {
  const roles = config.COLOR_ROLES;
  const key = String(name);
  if (Object.prototype.hasOwnProperty.call(roles, key)) return { token: key, role: key, paletteKey: roles[key] };
  if (Object.prototype.hasOwnProperty.call(config.MATERIALS, key)) {
    return { token: key, role: config.MATERIALS[key].colorRole, paletteKey: roles[config.MATERIALS[key].colorRole] };
  }
  return { token: key, role: null, paletteKey: key };
}

/**
 * 模数 × 等级：同类构件共用同一套模数，主次只靠 GRADES 的因子与 bays 区分（计划 §3.1）。
 * 返回的每一项都直接来自 config.MODULES / config.GRADES，禁止在下游再乘系数。
 */
export function moduleScale(config, grade) {
  const g = gradeOf(config, grade);
  const M = config.MODULES;
  return Object.freeze({
    grade: g.grade,
    detailing: g.detailing,
    bayPitch: M.bayPitch * g.bayPitchFactor,
    bayDepth: M.bayDepth,
    columnDiameter: M.columnDiameter * g.columnDiameterFactor,
    columnFootDiameter: M.columnFootDiameter * g.columnDiameterFactor,
    eaveHeight: M.eaveHeight * g.eaveHeightFactor,
    eaveOverhang: M.eaveOverhang * g.eaveOverhangFactor,
    roofSlope: M.roofSlope,
    roofRisePerBay: M.roofRisePerBay,
    eaveLift: M.eaveLift,
    eaveCurve: M.eaveCurve,
    eaveRiseAtCorner: M.eaveRiseAtCorner,
    ridgeHeightRatio: M.ridgeHeightRatio,
    roofThickness: M.roofThickness,
    eaveSoffitDepth: M.eaveSoffitDepth,
    bracketHeightRatio: M.bracketHeightRatio,
    plinthWidth: M.plinthWidth,
    terraceTierHeight: M.terraceTierHeight,
    terraceTierInset: M.terraceTierInset,
    stairsStepHeight: M.stairsStepHeight,
    stairsStepDepth: M.stairsStepDepth,
    stairsMaxRun: M.stairsMaxRun,
    corridorWidth: M.corridorWidth,
    corridorPostPitch: M.corridorPostPitch,
    gateOpeningRatio: M.gateOpeningRatio,
  });
}

/** 朝向 → rotationYDeg（config.ORIENTATION，默认正面朝南 -Z）。 */
export function rotationOf(config, facing, rotationYDeg) {
  if (typeof rotationYDeg === 'number' && Number.isFinite(rotationYDeg)) return rotationYDeg;
  const key = facing ?? 'south';
  const deg = config.ORIENTATION.rotationYDeg[key];
  if (typeof deg !== 'number') throw new Error(`kit: 未知朝向 ${String(key)}（south|east|north|west）`);
  return deg;
}

/**
 * 世界占地尺寸（w=X 向、d=Z 向，CONTRACTS §4）→ 本地建模尺寸。
 * 本库本地轴：面阔沿本地 X、进深沿本地 Z、正立面朝本地 -Z；旋转 rotationYDeg 后与 layout 的世界包围盒一致。
 * 因此 0/180° 时 localW=w、localD=d；±90° 时 localW=d、localD=w。
 */
export function localFootprint(w, d, rotationYDeg) {
  const rad = (rotationYDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { localW: w * c + d * s, localD: w * s + d * c };
}

/** 开间模数的实际值：布局给的是权威尺寸，bays 只决定分间与细节密度（不得反过来改 w/d）。 */
export function bayMetrics(localW, bays) {
  const n = Math.max(1, Math.round(bays || 1));
  return { bays: n, baySpan: localW / n, columns: n + 1 };
}

/**
 * 参数规范化 + 校验。
 * 返回 { params, errors, warnings }：errors 非空时工厂抛错；warnings 记入 kit.diagnostics（不阻断下游）。
 * 形状一致性检查（机器可验）：
 *   - roofType 必须在 config.ROOF_TYPES 内；
 *   - grade 必须在 config.GRADES 内；
 *   - GRADES[grade].roofTypes 必须包含 roofType（STYLE_GUIDE §3 要求 kit 校验）；
 *   - 尺寸/台基高必须为正的有限数，bays ≥ 1。
 */
export function normalizeParams(config, kind, raw = {}) {
  const errors = [];
  const warnings = [];
  const p = { ...raw };

  if (!p.id || typeof p.id !== 'string') errors.push({ code: 'missing-id', message: `${kind}: params.id 缺失或非字符串` });
  if (!p.name || typeof p.name !== 'string') warnings.push({ code: 'missing-name', message: `${kind}: params.name 缺失，已用 id 兜底` });

  const num = (key, fallback, { min = 0, allowZero = true } = {}) => {
    const v = p[key];
    if (v === undefined || v === null) {
      p[key] = fallback;
      return;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || (allowZero ? v < min : v <= min)) {
      errors.push({ code: 'bad-number', message: `${kind}: params.${key}=${String(v)} 非法（需 ≥ ${min} 的有限数）` });
    }
  };

  num('w', undefined);
  num('d', undefined);
  num('terraceH', 0);
  num('bays', 1, { min: 1 });
  if (p.w === undefined) errors.push({ code: 'missing-w', message: `${kind}: params.w 缺失` });
  if (p.d === undefined) errors.push({ code: 'missing-d', message: `${kind}: params.d 缺失` });

  p.grade = p.grade ?? 1;
  p.roofType = p.roofType ?? (kind === 'pavilion' || kind === 'cornerTower' ? 'pyramidal' : 'hip');
  p.facing = p.facing ?? 'south';
  p.quality = p.quality ?? config.QUALITY.default;
  p.rotationYDeg = rotationOf(config, p.facing, p.rotationYDeg);
  p.bays = Math.max(1, Math.round(p.bays || 1));

  let grade = null;
  let roof = null;
  try {
    grade = gradeOf(config, p.grade);
  } catch (error) {
    errors.push({ code: 'bad-grade', message: error.message });
  }
  try {
    roof = roofOf(config, p.roofType);
  } catch (error) {
    errors.push({ code: 'bad-roof-type', message: error.message });
  }
  if (grade && roof && !grade.roofTypes.includes(p.roofType)) {
    // STYLE_GUIDE §3「GRADES[grade].roofTypes 给出该等级允许的屋顶类型，kit 必须校验」。
    // 主理人裁定（2026-09-26，见 docs/handoff-t3.md）：风格类违规不允许默认放行，违规即抛错。
    errors.push({
      code: 'roof-grade-mismatch',
      message: `${kind}(${p.id}): grade ${p.grade} 允许的屋顶为 ${grade.roofTypes.join(' | ')}，不含 ${p.roofType}`,
    });
  }
  if (p.roofType === 'doubleEaveHip' && p.grade !== 3 && roof && grade && grade.roofTypes.includes('doubleEaveHip')) {
    warnings.push({
      code: 'double-eave-not-grade3',
      message: `${kind}(${p.id}): 重檐庑殿顶通常只用于 grade 3 主殿（STYLE_GUIDE §3），当前 grade=${p.grade}`,
    });
  }
  if (p.terraceH >= config.MODULES.terraceTierCount * config.MODULES.terraceTierHeight - 1e-6 && p.grade < config.MODULES.terraceTierCount) {
    warnings.push({
      code: 'terrace-tiers',
      message: `${kind}(${p.id}): terraceH=${p.terraceH} 达三层台基高度但 grade=${p.grade}，已按 terraceH 分层`,
    });
  }

  if (p.w !== undefined && p.d !== undefined && p.rotationYDeg !== undefined) {
    const fp = localFootprint(p.w, p.d, p.rotationYDeg);
    p.localW = fp.localW;
    p.localD = fp.localD;
  }
  p.facingVector = config.ORIENTATION.facingVectors[p.facing] ?? null;

  return { params: p, errors, warnings };
}

/** 把 errors 变成人话异常。 */
export function throwIfInvalid(kind, res) {
  if (res.errors.length > 0) {
    throw new Error(`kit.${kind}: 参数非法\n - ${res.errors.map((e) => e.message).join('\n - ')}`);
  }
  return res.params;
}

/**
 * 形制结构比例（**非色值**）：集中登记，禁止散落在各工厂里。
 * 全部是"同一形制内两段尺寸的比值"，与 config 的颜色/模数令牌无关；集中在这里便于评审逐条核对。
 * 说明：中文官式屋面的比例关系没有全部写进 config（config 给的是坡度/出檐/起翘/举架增量等可量化令牌），
 *      下列比例是把这些令牌串起来的"构图系数"，任何一条要改只需改这一处。
 */
export const PROPORTIONS = Object.freeze({
  /** 重檐：上层屋身平面尺寸 / 下层屋身（平座层收进）。 */
  doubleEaveUpperBody: 0.72,
  /** 重檐：下层腰檐（裙檐）内侧收进 / 通进深之半。 */
  doubleEaveApronWaist: 0.62,
  /** 重檐：下层腰檐举架相对主屋面坡度的折减（腰檐更平缓）。 */
  doubleEaveApronSlope: 0.5,
  /** 重檐：下层腰檐升高上限 / 上层屋身高（保证腰檐不穿出上层檐口）。 */
  doubleEaveApronMaxRise: 0.85,
  /** 重檐：下层腰檐出檐放大系数（下层檐口更远）。 */
  doubleEaveApronOverhang: 1.15,
  /** 重檐：上层屋身（平座层）高 / 上层檐口高。 */
  doubleEaveUpperStorey: 0.42,
  /** 屋身柱网：端柱到台明边的收进 / 柱径（保证台明外露）。 */
  columnInset: 3,
  /** 举架增量：每增加一间，屋面正脊再抬升 / MODULES.roofRisePerBay（0.42m）。 */
  perBayRise: 0.35,
  /** 举架坡度上限：ROOF_TYPES[*].riseRatio / MODULES.ridgeHeightRatio 的允许上限（防止攒尖顶过陡）。 */
  roofRiseCap: 1.15,
  /** 门洞高 / 有斗栱的屋身高（保证门洞低于额枋）。 */
  doorHeight: 0.8,
  /** 城门洞高 / 城墙高。 */
  gateOpeningHeight: 0.62,
  /** 额枋（彩画带）高 / 檐口高。 */
  architraveBand: 0.16,
  /** 斗栱层间距（米）的模数：每 MODULES.bayPitch/4 一组。 */
  bracketPerBayQuarter: 1,
  /** 正脊断面：高 / 通进深之半。 */
  ridgeSectionHeight: 0.09,
  /** 正脊断面：宽 / 正脊高。 */
  ridgeSectionWidth: 0.7,
  /** 台基：压地石（顶板）厚 / 台基高。 */
  terraceCapThickness: 0.16,
  /** 台基：每层收进 / MODULES.terraceTierInset（1 = 完全按 config 收进）。 */
  terraceTierInsetScale: 1,
  /** 栏杆：栏板高（米）的模数（每 MODULES.stairsStepHeight 的倍数）。 */
  railingHeightSteps: 3,
  /** 台阶：休息平台深 / MODULES.stairsStepDepth。 */
  stairLandingDepth: 4,
  /** 硬山：山墙出檐（挑出屋面厚度）/ MODULES.roofThickness。 */
  gableWallOverhang: 1,
});

/** 檐口高：terraceH + MODULES.eaveHeight × GRADES[grade].eaveHeightFactor。
 *  与 layout.SLOTS 的 eaveHeight 逐字段同源（t1 用同一公式），tests/kit.test.mjs 用它做交叉校验。 */
export function eaveHeightOf(config, terraceH, grade) {
  return terraceH + config.MODULES.eaveHeight * gradeOf(config, grade).eaveHeightFactor;
}

/**
 * 屋面几何计划（举架）：半深 × MODULES.roofSlope，再按 ROOF_TYPES[type].riseRatio / MODULES.ridgeHeightRatio 归一。
 * 这是 kit 的几何真值；layout.SLOTS.totalHeight 是估值（CONTRACTS §4 标注"非硬约束"），不作为取景/面板权威。
 */
export function roofPlanOf(config, { localW, localD, grade, roofType, overhang, roofRise }) {
  const M = config.MODULES;
  const g = gradeOf(config, grade);
  const roof = roofOf(config, roofType);
  const ov = overhang ?? M.eaveOverhang * g.eaveOverhangFactor;
  const halfDepth = localD / 2 + ov;
  const halfWidth = localW / 2 + ov;
  // 举架：以 MODULES.roofSlope 为基准坡度，ROOF_TYPES[*].riseRatio 只在 ±roofRiseCap 内微调（各类型仍有区分）
  const riseScale = Math.min(PROPORTIONS.roofRiseCap, roof.riseRatio / M.ridgeHeightRatio);
  const rise = roofRise ?? halfDepth * M.roofSlope * riseScale;
  return {
    roofType,
    label: roof.label,
    doubleEave: roof.doubleEave,
    slopes: roof.slopes,
    hasRidge: roof.ridge,
    overhang: ov,
    halfWidth,
    halfDepth,
    rise,
    riseScale,
    slope: M.roofSlope,
    riseRatio: roof.riseRatio,
    curvature: roof.curvature,
    eaveLift: M.eaveLift,
    eaveRiseAtCorner: M.eaveRiseAtCorner,
    eaveCurve: M.eaveCurve,
    roofThickness: M.roofThickness,
    ridgeHeightRatio: M.ridgeHeightRatio,
  };
}
