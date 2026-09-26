/**
 * buildings.js — 构件工厂（hall / gateHall / sideHall / pavilion / cornerTower / wall /
 *   courtyardGate / corridor / terrace / stairs / bridge）
 * =============================================================================
 * 形制语言（计划 §5.1、STYLE_GUIDE §3）：
 *   - 主殿（grade 3）用重檐庑殿顶；次级殿堂用单檐庑殿/歇山；院门、值房用硬山；亭、角楼用攒尖/歇山。
 *   - 庑殿顶 = 长正脊 + 四面坡（buildRoof 的顶缘收成线段，禁止尖顶替代）；同类构件共用同一套
 *     MODULES 模数（坡度/出檐/起翘/柱径/檐高/开间）并由 GRADES 因子分档。
 *   - 全部几何在**本地坐标**生成：面阔沿本地 X、正立面朝本地 -Z、原点在足迹中心的地面；
 *     工厂按 params 的 x/z/baseY/rotationYDeg 摆好（rotationYDeg 语义见 config.ORIENTATION）。
 *   - 每栋建筑可返回 THREE.LOD 三档（近/中/远），远档保留屋顶与轮廓；也可用 params.lod='near|mid|far' 只造一档，
 *     便于区域作者用 kit.mergeByMaterial 做整区合批。
 * 返回对象 userData.kit 里带完整 dims/metrics（供区域回显、供 tests/kit.test.mjs 机器校验）。
 */

import { THREE } from './three-ref.js';
import {
  Parts, box, cylinder, beam, translate,
  buildRoof, buildBody, buildPlinth, buildRailing, buildStairs,
} from './geometry.js';
import { buildTree, buildRockery, buildLantern, buildBronze, buildScreenWall, buildWater, buildPaving, makeRng } from './props.js';
import { makeLOD, shadowPolicy } from './merge.js';
import {
  gradeOf, moduleScale, roofOf, roofPlanOf, normalizeParams, throwIfInvalid, PROPORTIONS,
} from './tokens.js';

/** 下檐口高（与 layout.SLOTS.eaveHeight 同源：baseY + terraceH + MODULES.eaveHeight×GRADES 因子）。 */
function lowerEaveHeights(scale, terraceH, doubleEave) {
  return terraceH + scale.eaveHeight * (doubleEave ? 1 + PROPORTIONS.doubleEaveUpperStorey : 1);
}

/** 透光构件（不投影）：隔扇窗（裱纸/棂条窗）。与 merge.shadowPolicy 的水面白名单同属"遮蔽口径"。 */
const NON_CASTING_PARTS = Object.freeze(['window']);

const DEFAULT_ROOF_BY_KIND = Object.freeze({
  hall: 'hip',
  gateHall: 'hip',
  sideHall: 'gableHip',
  pavilion: 'pyramidal',
  cornerTower: 'gableHip',
  courtyardGate: 'gable',
});

/** 台明 → 屋身：台明宽取 MODULES.plinthWidth，但不超过短边的 12%（小屋不至于把屋身吃掉）。 */
function bodyFootprint(scale, localW, localD) {
  const plinth = Math.min(scale.plinthWidth, Math.min(localW, localD) * 0.12);
  return {
    plinth,
    bodyW: Math.max(localW * 0.34, localW - plinth * 2),
    bodyD: Math.max(localD * 0.34, localD - plinth * 2),
  };
}

function tileMeters(materials) {
  return {
    roof: materials.tileMeters('glazeTile'),
    ridge: materials.tileMeters('glazeRidge'),
    stone: materials.tileMeters('stoneWhite'),
    wall: materials.tileMeters('plasterRed'),
    painting: materials.tileMeters('paintingTeal'),
    wood: materials.tileMeters('timberLacquer'),
    paving: materials.tileMeters('pavingStone'),
    brick: materials.tileMeters('interiorBrick'),
    water: materials.tileMeters('waterSurface'),
  };
}

/* ------------------------------------------------------------------ 殿堂通用 */

/**
 * 单档（detail = near|mid|far）建筑几何。
 * 返回 { parts, metrics }；metrics 全部由 config 令牌推出，可被机器复核。
 */
export function composeBuilding(env, p, kind, detail) {
  const T = env.THREE;
  const { config, materials } = env;
  const scale = moduleScale(config, p.grade);
  const roofSpec = roofOf(config, p.roofType);
  const M = config.MODULES;
  const tile = tileMeters(materials);
  const parts = new Parts();

  const localW = p.localW;
  const localD = p.localD;
  const terraceH = p.terraceH;
  const { plinth, bodyW, bodyD } = bodyFootprint(scale, localW, localD);
  const bays = p.bays;
  const baySpan = bodyW / bays;
  const grade = p.grade;
  const nearDetail = detail === 'near';
  const isPavilion = kind === 'pavilion';
  const isGate = kind === 'gateHall' || kind === 'courtyardGate';
  const isTower = kind === 'cornerTower';
  // 屋顶形制解耦：只由 roofType（+ 角楼/亭的形制特例）决定，**不再因"是门/有门洞"而降级**。
  // 修前 `!isGate` 会让 F-gate-south/north（槽位 roofType=doubleEaveHip, grade3）静默变成单檐，
  // 与 layout 注册表不一致；现在按槽位数据建重檐庑殿门楼。
  const doubleEave = (roofSpec.doubleEave || isTower) && !isPavilion;

  // 檐口（相对本组原点）：下檐口 = 台基顶 + MODULES.eaveHeight×GRADES 因子（与 layout.SLOTS.eaveHeight 同源）
  const lowerEaveY = terraceH + scale.eaveHeight;
  const upperBodyW = bodyW * PROPORTIONS.doubleEaveUpperBody;
  const upperBodyD = bodyD * PROPORTIONS.doubleEaveUpperBody;
  const upperStoreyH = doubleEave ? scale.eaveHeight * PROPORTIONS.doubleEaveUpperStorey : 0;
  const upperEaveY = lowerEaveY + upperStoreyH;
  const bayRise = (bays - 1) * M.roofRisePerBay * PROPORTIONS.perBayRise;

  // 门洞（解耦后：**只由 door / doorOpening / openFront 决定**）
  //   - 门殿/院门（kind 本身是"门"）：默认自带门洞（无 door 数据时按 MODULES.gateOpeningRatio 取宽）；
  //   - 殿堂（hall/sideHall）：只有显式给了 door / doorOpening / openFront 才开门，否则正面为实心墙（带窗）。
  const doorHeightDefault = Math.max(0.6, (lowerEaveY - terraceH) * (1 - PROPORTIONS.architraveBand) * PROPORTIONS.doorHeight);
  const explicitWidth = typeof p.doorOpening === 'number' && Number.isFinite(p.doorOpening) ? p.doorOpening : null;
  const declaredWidth = p.door?.width ?? explicitWidth;
  const wantsOpening = isGate
    || declaredWidth !== null
    || p.doorOpening === true
    || p.openFront === true;
  // 门扇开启比例由 kind 决定（殿堂 0.18 常闭、门殿/院门 0.72 常开）→ 据此反推"可通过的净宽"门槛：
  // 显式要开口时，默认门宽不得小于 2×玩家半径 / 开启比例（否则开口形同虚设）。
  const kindOpenFraction = isGate ? 0.72 : 0.18;
  const minUsableWidth = (2 * config.INTERACTION.player.radius) / kindOpenFraction;
  const defaultWidth = isGate
    ? Math.max(localW * M.gateOpeningRatio, minUsableWidth)
    : Math.max(Math.min(baySpan * 0.8, bodyD * 0.45), minUsableWidth);
  const doorWidthRaw = isPavilion ? 0 : (declaredWidth !== null ? declaredWidth : wantsOpening ? defaultWidth : 0);
  const doorWidthEffective = Math.max(0, Math.min(doorWidthRaw, bodyW - 2));
  const door = doorWidthEffective > 0.2
    ? {
      width: doorWidthEffective,
      height: p.door?.height ?? doorHeightDefault,
      openFraction: p.door?.openFraction,
      sillY: p.door?.sillY,
      source: p.door?.width > 0.2 ? 'door' : explicitWidth !== null ? 'doorOpening' : p.doorOpening === true || p.openFront === true ? 'flag' : 'kind-default',
    }
    : null;

  // 1) 台基（单层台明；多层台基交给 kit.terrace）
  const plinthResult = buildPlinth(T, { w: localW, d: localD, terraceH, baseY: 0, tile: tile.stone, cap: detail !== 'far' });
  parts.absorb(plinthResult.parts);

  // 2) 屋身
  const bodyResult = buildBody(T, {
    bodyW,
    bodyD,
    eaveTopY: doubleEave ? lowerEaveY : lowerEaveY,
    baseY: terraceH,
    grade,
    bays,
    detail,
    kind,
    columnDiameter: scale.columnDiameter,
    columnFootDiameter: scale.columnFootDiameter,
    bayPitch: scale.bayPitch,
    tile: tile.stone,
    door,
    windows: !isPavilion && !isGate, // 窗只由 kind 决定（殿堂有、门殿/院门无、亭全开敞）
    openFront: isPavilion, // 亭：四面全开敞（内部参数，不是"正面开门"开关；正面开门看 door）
  });
  parts.absorb(bodyResult.parts);

  // 3) 重檐下层腰檐（围脊）
  let apronPlan = null;
  if (doubleEave) {
    const apronHalfW = bodyW / 2 + scale.eaveOverhang * PROPORTIONS.doubleEaveApronOverhang;
    const apronHalfD = bodyD / 2 + scale.eaveOverhang * PROPORTIONS.doubleEaveApronOverhang;
    const apronWaistW = (bodyW / 2) * PROPORTIONS.doubleEaveApronWaist;
    const apronWaistD = (bodyD / 2) * PROPORTIONS.doubleEaveApronWaist;
    const apronRiseGeom = Math.max(apronHalfW - apronWaistW, apronHalfD - apronWaistD) * M.roofSlope * PROPORTIONS.doubleEaveApronSlope;
    const apronRise = Math.min(apronRiseGeom, upperStoreyH * PROPORTIONS.doubleEaveApronMaxRise);
    const apron = buildRoof(T, {
      halfW: apronHalfW,
      halfD: apronHalfD,
      rise: apronRise,
      roofType: 'hip',
      curve: roofSpec.curvature,
      eaveLift: scale.eaveLift,
      eaveRiseAtCorner: scale.eaveRiseAtCorner,
      roofThickness: scale.roofThickness * 0.8,
      ridgeRatio: M.ridgeHeightRatio,
      detail,
      tile: tile.roof,
      grade,
      baseY: lowerEaveY,
      topHalfW: apronWaistW,
      topHalfD: apronWaistD,
    });
    // 只把"下层腰檐的瓦面"改名（它与主屋面是两重不同的屋面，必须分开）；
    // 檐口封边（瓦口）与垂脊是同类构件，沿用同名——避免重檐建筑额外占用合批桶（§8.2 分区绘制预算）。
    apron.parts.rename('roof', 'lowerRoof');
    parts.absorb(apron.parts);
    apronPlan = apron.metrics;

    // 上层屋身（平座层）：柱 + 额枋 + 栏杆
    const upper = buildBody(T, {
      bodyW: upperBodyW,
      bodyD: upperBodyD,
      eaveTopY: upperEaveY,
      baseY: lowerEaveY,
      grade,
      bays: Math.max(2, bays - 2),
      detail,
      kind: 'upper',
      columnDiameter: scale.columnDiameter * 0.92,
      columnFootDiameter: scale.columnFootDiameter * 0.92,
      bayPitch: scale.bayPitch,
      tile: tile.stone,
      door: null,
      windows: false,
      openFront: true,
    });
    // 上层屋身（平座层）的柱/额枋/斗栱与下层同类同料，沿用同名（合批后可共用网格，不额外占绘制批次）
    parts.absorb(upper.parts);
    if (detail === 'near') {
      const rail = buildRailing(T, {
        w: upperBodyW * 1.06,
        d: upperBodyD * 1.06,
        baseY: lowerEaveY + M.stairsStepHeight * PROPORTIONS.railingHeightSteps,
        height: M.stairsStepHeight * PROPORTIONS.railingHeightSteps,
        tile: tile.stone,
        detail,
        material: 'stoneWhite',
      });
      parts.absorb(rail.parts);
    }
  }

  // 4) 主屋面
  const roofPlan = roofPlanOf(config, {
    localW: doubleEave ? upperBodyW : bodyW,
    localD: doubleEave ? upperBodyD : bodyD,
    grade,
    roofType: p.roofType,
    roofRise: p.roofRise,
  });
  const roofRise = (p.roofRise ?? roofPlan.rise) + bayRise;
  const roofBaseY = doubleEave ? upperEaveY : lowerEaveY;
  const roof = buildRoof(T, {
    halfW: roofPlan.halfWidth,
    halfD: roofPlan.halfDepth,
    rise: roofRise,
    roofType: p.roofType,
    curve: roofSpec.curvature,
    eaveLift: scale.eaveLift,
    eaveRiseAtCorner: scale.eaveRiseAtCorner,
    roofThickness: scale.roofThickness,
    ridgeRatio: M.ridgeHeightRatio,
    detail,
    tile: tile.roof,
    grade,
    baseY: roofBaseY,
    bays,
    roofRisePerBay: M.roofRisePerBay,
  });
  parts.absorb(roof.parts);

  // 5) 台基栏杆（grade ≥ 2；正面留台阶缺口）
  const railH = M.stairsStepHeight * PROPORTIONS.railingHeightSteps;
  const stairsWidth = Math.max(2, Math.min(localW * 0.45, baySpan * (isGate ? 1.6 : 2.4)));
  if (grade >= 2 && terraceH >= 0.6 && !isPavilion) {
    const rail = buildRailing(T, {
      w: localW,
      d: localD,
      baseY: terraceH,
      height: railH,
      tile: tile.stone,
      detail,
      gapFront: stairsWidth,
      material: 'stoneWhite',
    });
    parts.absorb(rail.parts);
  }

  // 6) 台阶（含丹陛）
  let stairsDims = null;
  if (terraceH > 0.2) {
    const st = buildStairs(T, {
      width: stairsWidth,
      rise: terraceH,
      stepHeight: M.stairsStepHeight,
      stepDepth: M.stairsStepDepth,
      maxRun: M.stairsMaxRun,
      tile: tile.stone,
      baseY: 0,
      imperialRamp: grade >= 3 && !isPavilion,
    });
    // 台阶从台基前沿向 -Z 下降
    for (const bucket of st.parts.buckets.values()) {
      for (const g of bucket.geometries) translate(T, g, 0, 0, -localD / 2);
    }
    parts.absorb(st.parts);
    stairsDims = st.dims;
  }

  // 7) 亭：坐凳栏杆（近景）
  if (isPavilion && nearDetail) {
    const benchH = M.stairsStepHeight * PROPORTIONS.railingHeightSteps;
    const rail = buildRailing(T, {
      w: bodyW * 0.92,
      d: bodyD * 0.92,
      baseY: terraceH,
      height: benchH,
      tile: tile.stone,
      detail,
      gapFront: stairsWidth,
      material: 'stoneWhite',
    });
    rail.parts.rename('railing', 'bench').rename('railingPanel', 'benchPanel');
    parts.absorb(rail.parts);
  }

  // 8) 院门 / 门殿：门枕石 + 门额
  if (isGate && nearDetail) {
    const stone = Math.max(0.3, scale.columnDiameter * 0.8);
    for (const sx of [-1, 1]) {
      parts.add('doorStone', 'stoneWhite', box(T, {
        w: stone,
        h: stone * 1.2,
        d: stone * 1.6,
        x: sx * (doorWidthEffective / 2),
        z: -bodyD / 2 + 0.6,
        y: terraceH,
        tile: tile.stone,
      }));
    }
  }

  const metrics = {
    kind,
    level: detail,
    roofType: p.roofType,
    doubleEave,
    eaveHeight: +lowerEaveY.toFixed(4),
    eaveHeightAbsolute: +((p.baseY ?? p.terraceH) + scale.eaveHeight).toFixed(4),
    groundY: +groundLevelOf(p).toFixed(4),
    upperEaveY: +upperEaveY.toFixed(4),
    roofBaseY: +roofBaseY.toFixed(4),
    roofRise: +roofRise.toFixed(4),
    bayRise: +bayRise.toFixed(4),
    totalHeight: +(roofBaseY + roofRise + (scale.roofRise ? 0 : 0)).toFixed(4),
    ridge: roof.metrics.ridge,
    apronRise: apronPlan?.rise ?? null,
    slopes: roof.metrics.slopes,
    topHalfW: roof.metrics.topHalfW,
    topHalfD: roof.metrics.topHalfD,
    bodyW: +bodyW.toFixed(4),
    bodyD: +bodyD.toFixed(4),
    plinth: +plinth.toFixed(4),
    bays,
    baySpan: +baySpan.toFixed(4),
    doorWidth: doorWidthEffective,
    doorHeight: door?.height ?? 0,
    hasOpening: Boolean(door),
    opening: door
      ? {
        width: doorWidthEffective,
        height: door.height,
        openFraction: door.openFraction ?? kindOpenFraction,
        // 门扇打开后的真实净宽（第一人称/碰撞消费；= 开启比例 × 门宽）
        clearWidth: +((door.openFraction ?? kindOpenFraction) * doorWidthEffective).toFixed(4),
        playerClearWidth: +(2 * config.INTERACTION.player.radius).toFixed(4),
        source: door.source,
      }
      : null,
    stairs: stairsDims,
    columnDiameter: scale.columnDiameter,
    eaveOverhang: scale.eaveOverhang,
    eaveHeightFactor: gradeOf(config, grade).eaveHeightFactor,
    roofSlope: M.roofSlope,
    parts: parts.partNames,
    triangles: parts.triangleCount(),
  };
  metrics.totalHeight = +(roofBaseY + roofRise).toFixed(4);
  metrics.totalHeightAbsolute = +(groundLevelOf(p) + metrics.totalHeight).toFixed(4);
  // 足迹（本地坐标）：取台明、腰檐与主屋面（含出檐/角部起翘余量）的较大者
  const thrustAllowance = scale.eaveLift;
  const apronHalf = doubleEave ? Math.max(bodyW / 2, bodyD / 2) + scale.eaveOverhang * PROPORTIONS.doubleEaveApronOverhang : 0;
  const roofHalfX = Math.max(roofPlan.halfWidth, apronHalf) + thrustAllowance;
  const roofHalfZ = Math.max(roofPlan.halfDepth, apronHalf) + thrustAllowance;
  metrics.footprint = {
    minX: -Math.max(localW / 2, roofHalfX),
    maxX: Math.max(localW / 2, roofHalfX),
    minZ: -Math.max(localD / 2, roofHalfZ),
    maxZ: Math.max(localD / 2, roofHalfZ),
    plinthHalf: { x: localW / 2, z: localD / 2 },
    roofHalf: { x: roofHalfX, z: roofHalfZ },
  };
  parts.dims.metrics = metrics;
  return { parts, metrics };
}

/** 远景质量块（LOD2）：只保留台基 + 屋身 + 屋面轮廓（约 100 面）。 */
export function composeMass(env, p, kind) {
  const T = env.THREE;
  const { config, materials } = env;
  const scale = moduleScale(config, p.grade);
  const roofSpec = roofOf(config, p.roofType);
  const M = config.MODULES;
  const tile = tileMeters(materials);
  const parts = new Parts();
  const { bodyW, bodyD } = bodyFootprint(scale, p.localW, p.localD);
  const terraceH = p.terraceH;
  const isPavilion = kind === 'pavilion';
  const doubleEave = (roofSpec.doubleEave || kind === 'cornerTower') && !isPavilion;
  const eaveY = terraceH + (doubleEave ? scale.eaveHeight * (1 + PROPORTIONS.doubleEaveUpperStorey) : scale.eaveHeight);

  if (terraceH > 0.001) parts.add('terrace', 'stoneWhite', box(T, { w: p.localW, h: terraceH, d: p.localD, y: 0, tile: tile.stone }));
  parts.add('wall', 'plasterRed', box(T, { w: bodyW, h: eaveY - terraceH, d: bodyD, y: terraceH, tile: tile.wall }));
  const plan = roofPlanOf(config, {
    localW: doubleEave ? bodyW * PROPORTIONS.doubleEaveUpperBody : bodyW,
    localD: doubleEave ? bodyD * PROPORTIONS.doubleEaveUpperBody : bodyD,
    grade: p.grade,
    roofType: p.roofType,
    roofRise: p.roofRise,
  });
  const rise = (p.roofRise ?? plan.rise) + (p.bays - 1) * M.roofRisePerBay * PROPORTIONS.perBayRise;
  const roof = buildRoof(T, {
    halfW: plan.halfWidth,
    halfD: plan.halfDepth,
    rise,
    roofType: p.roofType,
    curve: roofSpec.curvature,
    eaveLift: scale.eaveLift,
    eaveRiseAtCorner: scale.eaveRiseAtCorner,
    roofThickness: scale.roofThickness,
    ridgeRatio: M.ridgeHeightRatio,
    detail: 'far',
    tile: tile.roof,
    grade: p.grade,
    baseY: eaveY,
  });
  parts.absorb(roof.parts);
  // 远景同样保留台阶体量（轮廓与近景一致；第一人称远眺时台阶是御路的重要识别特征）
  if (terraceH > 0.2) {
    const steps = Math.max(1, Math.round(terraceH / M.stairsStepHeight));
    const run = steps * M.stairsStepDepth;
    const stairsWidth = Math.max(2, Math.min(p.localW * 0.45, (bodyW / p.bays) * 2.4));
    const angle = Math.atan2(terraceH, run);
    const g = box(T, { w: stairsWidth, h: Math.max(0.3, terraceH * 0.25), d: Math.hypot(terraceH, run), y: 0, z: 0, tile: tile.stone });
    g.applyMatrix4(new T.Matrix4().makeRotationX(-angle));
    translate(T, g, 0, terraceH / 2, -p.localD / 2 - run / 2);
    parts.add('stairs', 'stoneWhite', g);
  }
  const metrics = {
    kind,
    level: 'far',
    roofType: p.roofType,
    eaveHeight: +lowerEaveHeights(scale, terraceH, doubleEave).toFixed(4),
    totalHeight: +(eaveY + rise).toFixed(4),
    ridge: roof.metrics.ridge,
    slopes: roof.metrics.slopes,
    topHalfW: roof.metrics.topHalfW,
    topHalfD: roof.metrics.topHalfD,
    parts: parts.partNames,
    triangles: parts.triangleCount(),
  };
  metrics.eaveHeightAbsolute = +((p.baseY ?? p.terraceH) + (metrics.eaveHeight - p.terraceH)).toFixed(4);
  metrics.groundY = +groundLevelOf(p).toFixed(4);
  metrics.totalHeightAbsolute = +(groundLevelOf(p) + metrics.totalHeight).toFixed(4);
  parts.dims.metrics = metrics;
  return { parts, metrics };
}

/* ------------------------------------------------------------------ 装配 */

/** Parts → THREE.Group（每 part 一个 Mesh，共享材质）。 */
function groupFromParts(env, name, parts, kind) {
  const T = env.THREE;
  const group = new T.Group();
  group.name = name;
  for (const { part, material, geometry, dims } of parts.merge(T)) {
    const mesh = new T.Mesh(geometry, env.materials.get(material));
    mesh.name = `${name}:${part}`;
    mesh.userData.part = part;
    mesh.userData.materialKey = material;
    mesh.userData.kind = kind;
    if (dims) mesh.userData.dims = dims;
    // 阴影标志与合批路径共用同一 config 策略（否则 mergeZone 前后无法守恒）：
    // 构件投影 + 接收；水面只接收（见 merge.shadowPolicy）
    const flags = shadowPolicy(env.config, part);
    // 透光构件（t33）：隔扇窗为裱纸/棂条窗，几何上仍填在窗洞里（外观不变），但**不投影** ——
    // 天光因此能穿过窗洞进入室内（金銮殿/寝殿内景白天·夕照可读性）。这是"几何开口 + 透光遮蔽"，
    // 不是自发光贴片糊弄：材质与颜色仍是 config 令牌、几何仍完整、外立面外形不变。
    mesh.castShadow = flags.castShadow && !NON_CASTING_PARTS.includes(part);
    mesh.receiveShadow = flags.receiveShadow;
    group.add(mesh);
  }
  return group;
}

/**
 * 摆位：baseY 的语义是「台基顶（柱础所在标高）」，台基占 [baseY-terraceH, baseY]（与 layout.SLOTS 一致：
 * layout.eaveHeight = baseY + MODULES.eaveHeight×GRADES 因子，见 tests/kit.test.mjs 的交叉校验）。
 * 因此组原点（地面/台基底）落在 baseY - terraceH；只给 terraceH 时视为台基坐落在地面上（y=0）。
 */
function groundLevelOf(p) {
  const terraceH = p.terraceH ?? 0;
  return (p.baseY ?? terraceH) - terraceH;
}

function applyPlacement(env, object, p) {
  const T = env.THREE;
  object.position.set(p.x ?? 0, groundLevelOf(p), p.z ?? 0);
  object.rotation.y = (p.rotationYDeg * Math.PI) / 180;
  object.updateMatrixWorld(true);
  void T;
  return object;
}

function worldBoundsOf(env, object) {
  const T = env.THREE;
  object.updateMatrixWorld(true);
  const bb = new T.Box3().setFromObject(object);
  return {
    minX: +bb.min.x.toFixed(3),
    maxX: +bb.max.x.toFixed(3),
    minY: +bb.min.y.toFixed(3),
    maxY: +bb.max.y.toFixed(3),
    minZ: +bb.min.z.toFixed(3),
    maxZ: +bb.max.z.toFixed(3),
  };
}

/**
 * 建筑工厂主流程：参数校验 → 三档几何 → LOD 包装 / 单档输出 → 摆位 → metrics。
 * params.lod: 'auto'（默认，返回 THREE.LOD）| 'near' | 'mid' | 'far' | 0 | 1 | 2 | 'none'
 */
export function makeBuilding(env, kind, rawParams) {
  const { config } = env;
  const { params: p, errors, warnings } = normalizeParams(config, kind, {
    roofType: DEFAULT_ROOF_BY_KIND[kind],
    ...rawParams,
  });
  throwIfInvalid(kind, { errors, warnings });
  env.report(kind, warnings, p);

  const requested = p.lod ?? 'auto';
  const levelOf = { near: 'near', mid: 'mid', far: 'far', 0: 'near', 1: 'mid', 2: 'far' };
  const wanted = typeof requested === 'string' && requested in levelOf ? levelOf[requested] : requested === 'none' ? 'near' : 'auto';

  const cache = {};
  const build = (level) => {
    if (!cache[level]) cache[level] = level === 'far' ? composeMass(env, p, kind) : composeBuilding(env, p, kind, level);
    return cache[level];
  };

  let object;
  let metrics;
  if (wanted === 'auto') {
    const near = build('near');
    const mid = build('mid');
    const far = build('far');
    const gNear = groupFromParts(env, `${p.id}:near`, near.parts, kind);
    const gMid = groupFromParts(env, `${p.id}:mid`, mid.parts, kind);
    const gFar = groupFromParts(env, `${p.id}:far`, far.parts, kind);
    object = makeLOD(env.THREE, [{ object: gNear }, { object: gMid }, { object: gFar }], {
      budget: config.BUDGET.lod,
      quality: env.quality,
      name: `${p.id}:lod`,
    });
    metrics = {
      ...near.metrics,
      triangles: { near: near.metrics.triangles, mid: mid.metrics.triangles, far: far.metrics.triangles },
      parts: { near: near.metrics.parts, mid: mid.metrics.parts, far: far.metrics.parts },
      lodDistances: object.userData.kit.distances,
    };
  } else {
    const level = wanted;
    const result = build(level);
    object = groupFromParts(env, `${p.id}:${level}`, result.parts, kind);
    metrics = { ...result.metrics, triangles: { [level]: result.metrics.triangles } };
  }

  applyPlacement(env, object, p);
  const kit = {
    id: p.id,
    kind,
    name: p.name ?? p.id,
    detail: wanted,
    params: { ...p },
    metrics,
    diagnostics: warnings,
    worldBounds: worldBoundsOf(env, object),
    version: 'kit-1.0.0',
  };
  object.userData.kit = kit;
  object.userData.part = kind;
  object.userData.id = p.id;
  return object;
}

/* ------------------------------------------------------------------ 墙体 */

/**
 * 墙（宫墙 / 院墙）。
 * params: { id, name, from:{x,z}, to:{x,z}, thickness, height, battlementHeight, openings:[{at,width,height}],
 *           kind:'cityWall'|'courtWall', baseY, y, lod, quality }
 * openings 的 at = 相对墙中点的偏移；门洞上方补砌门额。
 */
export function makeWall(env, raw = {}) {
  const T = env.THREE;
  const { config, materials } = env;
  const M = config.MODULES;
  const tile = tileMeters(materials);
  const from = raw.from ?? { x: 0, z: 0 };
  const to = raw.to ?? { x: 0, z: 0 };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) throw new Error(`kit.wall(${raw.id}): from/to 重合，无法生成墙体`);
  const thickness = raw.thickness ?? (raw.kind === 'cityWall' || raw.cityWall ? M.wallThickness : M.courtyardWallThickness);
  const height = raw.height ?? (raw.kind === 'cityWall' || raw.cityWall ? M.wallHeight : M.courtyardWallHeight);
  const battlementH = raw.battlementHeight ?? (raw.kind === 'cityWall' || raw.cityWall ? M.wallBattlementHeight : 0);
  const baseY = raw.baseY ?? raw.y ?? 0;
  const detail = raw.quality ? (raw.quality === 'high' ? 'near' : raw.quality === 'medium' ? 'mid' : 'far') : (raw.detail ?? 'near');
  const isCity = raw.kind === 'cityWall' || raw.cityWall === true;
  const openings = [...(raw.openings ?? [])].sort((a, b) => a.at - b.at);
  const parts = new Parts();

  // 实体段（扣除门洞）
  const intervals = [];
  let cursor = -length / 2;
  for (const op of openings) {
    const half = (op.width ?? 0) / 2;
    const a = op.at - half;
    if (a > cursor) intervals.push([cursor, a]);
    cursor = op.at + half;
  }
  if (cursor < length / 2) intervals.push([cursor, length / 2]);
  const bodyH = height - battlementH;
  for (const [a, b] of intervals) {
    const w = b - a;
    if (w <= 0.01) continue;
    parts.add('wallBody', 'plasterRed', box(T, { w, h: bodyH, d: thickness, x: (a + b) / 2, y: baseY, tile: tile.wall }));
    parts.add('wallBase', 'wallBase', box(T, { w, h: Math.min(0.8, bodyH * 0.2), d: thickness * 1.06, x: (a + b) / 2, y: baseY, tile: tile.stone }));
  }
  for (const op of openings) {
    const w = op.width ?? 0;
    const h = op.height ?? bodyH * PROPORTIONS.gateOpeningHeight;
    const above = bodyH - h;
    if (above > 0.1) {
      parts.add('wallBody', 'plasterRed', box(T, { w, h: above, d: thickness, x: op.at, y: baseY + h, tile: tile.wall }));
    }
    parts.add('wallLintel', 'stoneWhite', box(T, { w: w * 1.05, h: Math.max(0.3, thickness * 0.12), d: thickness * 1.02, x: op.at, y: baseY + h - 0.2, tile: tile.stone }));
  }
  // 压顶
  if (battlementH > 0.01) {
    parts.add('wallCoping', 'stoneWhite', box(T, { w: length, h: battlementH * 0.35, d: thickness * 1.15, y: baseY + height - battlementH, tile: tile.stone }));
    // 垛口（内外两排）
    const merlonW = Math.max(1.2, M.wallSegmentPitch * 0.18);
    for (const sz of [-1, 1]) {
      const n = Math.max(2, Math.floor(length / (merlonW * 2.2)));
      for (let i = 0; i <= n; i += 1) {
        const x = -length / 2 + ((length * (i + 0.25)) / (n + 0.5));
        parts.add('merlon', 'plasterRed', box(T, { w: merlonW, h: battlementH, d: thickness * 0.32, x, z: sz * (thickness / 2 - thickness * 0.18), y: baseY + bodyH, tile: tile.wall }));
      }
    }
  } else {
    // 院墙：青灰瓦顶（硬山式压顶）
    const cap = Math.max(0.3, thickness * 0.5);
    parts.add('wallCoping', 'courtyardWallTop', beam(T, { from: { x: -length / 2, y: baseY + height + cap * 0.2, z: 0 }, to: { x: length / 2, y: baseY + height + cap * 0.2, z: 0 }, thickness: cap, tile: tile.paving }));
    if (detail !== 'far') {
      parts.add('wallCopingRidge', 'courtyardWallTop', box(T, { w: length, h: cap * 0.35, d: cap * 0.5, y: baseY + height + cap * 0.6, tile: tile.paving }));
    }
  }

  const group = groupFromParts(env, raw.id ?? 'wall', parts, 'wall');
  group.userData.kit = {
    id: raw.id ?? 'wall',
    kind: 'wall',
    name: raw.name ?? raw.id ?? 'wall',
    detail,
    metrics: {
      length: +length.toFixed(3),
      thickness,
      height,
      openingCount: openings.length,
      battlementHeight: battlementH,
      cityWall: isCity,
      source: raw.source ?? null,
    },
  };
  // 局部 X 沿墙长方向；摆到墙中点
  const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
  group.position.set((from.x + to.x) / 2, 0, (from.z + to.z) / 2);
  group.rotation.y = (yaw * Math.PI) / 180;
  group.updateMatrixWorld(true);
  const metrics = group.userData.kit.metrics;
  metrics.triangles = countMeshTriangles(group);
  metrics.parts = partNamesOf(group);
  metrics.worldBounds = worldBoundsOf(env, group);
  return group;
}

function countMeshTriangles(object) {
  let n = 0;
  object.traverse((node) => {
    if (node.isMesh && node.geometry?.attributes?.position) n += Math.floor(node.geometry.attributes.position.count / 3);
  });
  return n;
}

function partNamesOf(object) {
  const names = new Set();
  object.traverse((node) => {
    if (node.userData?.part) names.add(node.userData.part);
  });
  return [...names].sort();
}

/* ------------------------------------------------------------------ 廊庑 */

/** 廊庑（廊道）。params: { id, name, from, to, width, floors, detail, railing, x? } */
export function makeCorridor(env, raw = {}) {
  const T = env.THREE;
  const { config, materials } = env;
  const M = config.MODULES;
  const scale = moduleScale(config, raw.grade ?? 1);
  const roofSpec = roofOf(config, 'gable');
  const tile = tileMeters(materials);
  const from = raw.from ?? { x: 0, z: 0 };
  const to = raw.to ?? { x: 0, z: 0 };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) throw new Error(`kit.corridor(${raw.id}): from/to 重合`);
  const width = raw.width ?? M.corridorWidth;
  const floors = raw.floors ?? 1;
  const detail = raw.detail ?? 'near';
  const postH = scale.eaveHeight;
  const parts = new Parts();

  // 台明 + 地坪
  parts.add('floor', 'pavingStone', box(T, { w: length, h: 0.25, d: width + 1.4, y: 0, tile: tile.paving }));
  // 柱（两侧）+ 台明条石
  const pitch = M.corridorPostPitch;
  const n = Math.max(2, Math.round(length / pitch));
  const colR = scale.columnDiameter * 0.5;
  const colSeg = detail === 'far' ? 4 : detail === 'mid' ? 6 : 8;
  if (detail !== 'far') {
    for (let i = 0; i <= n; i += 1) {
      const x = -length / 2 + (length * i) / n;
      for (const sz of [-1, 1]) {
        parts.add('column', 'plasterRed', cylinder(T, { rt: colR * 0.9, rb: colR, h: postH - 0.3, seg: colSeg, x, y: 0.25 + 0.3, z: sz * (width / 2), tile: tile.stone, capped: false }));
        parts.add('columnFoot', 'stoneWhite', cylinder(T, { rt: colR * 1.25, rb: colR * 1.25, h: 0.3, seg: Math.min(colSeg, 6), x, y: 0.25, z: sz * (width / 2), tile: tile.stone, capped: false }));
      }
    }
    // 额枋彩画 + 座位栏杆（外侧）
    for (const sz of [-1, 1]) {
      parts.add('painting', 'paintingTeal', box(T, { w: length, h: postH * PROPORTIONS.architraveBand, d: colR * 1.4, z: sz * (width / 2), y: 0.25 + postH - postH * PROPORTIONS.architraveBand, tile: tile.painting }));
      parts.add('giltLine', 'giltMetal', box(T, { w: length, h: colR * 0.25, d: colR * 1.6, z: sz * (width / 2), y: 0.25 + postH - postH * PROPORTIONS.architraveBand - colR * 0.4, tile: tile.painting }));
    }
    if (raw.railing !== false) {
      const railH = M.stairsStepHeight * PROPORTIONS.railingHeightSteps;
      for (const sz of [-1, 1]) {
        const m = Math.max(2, Math.round(length / 2.4));
        for (let i = 0; i <= m; i += 1) {
          const x = -length / 2 + (length * i) / m;
          parts.add('railing', 'stoneWhite', box(T, { w: 0.2, h: railH, d: 0.2, x, z: sz * (width / 2 + 0.5), y: 0.25, tile: tile.stone }));
        }
        parts.add('railingTop', 'stoneWhite', box(T, { w: length, h: 0.16, d: 0.26, z: sz * (width / 2 + 0.5), y: 0.25 + railH, tile: tile.stone }));
      }
    }
  }
  // 屋面（沿本地 X 的硬山/卷棚）
  const rise = (width / 2 + scale.eaveOverhang * 0.7) * M.roofSlope * (roofSpec.riseRatio / M.ridgeHeightRatio);
  const roof = buildRoof(T, {
    halfW: length / 2,
    halfD: width / 2 + scale.eaveOverhang * 0.7,
    rise,
    roofType: 'gable',
    curve: roofSpec.curvature,
    eaveLift: scale.eaveLift * 0.6,
    eaveRiseAtCorner: scale.eaveRiseAtCorner * 0.5,
    roofThickness: scale.roofThickness * 0.7,
    ridgeRatio: M.ridgeHeightRatio,
    detail,
    tile: tile.roof,
    grade: raw.grade ?? 1,
    baseY: 0.25 + postH,
  });
  parts.absorb(roof.parts);
  parts.dims.corridor = { length, width, postH, floors, posts: n + 1, rise };

  const group = groupFromParts(env, raw.id ?? 'corridor', parts, 'corridor');
  const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
  group.position.set((from.x + to.x) / 2, raw.baseY ?? 0, (from.z + to.z) / 2);
  group.rotation.y = (yaw * Math.PI) / 180;
  group.updateMatrixWorld(true);
  group.userData.kit = {
    id: raw.id ?? 'corridor',
    kind: 'corridor',
    name: raw.name ?? raw.id ?? 'corridor',
    detail,
    metrics: {
      length: +length.toFixed(3),
      width,
      postHeight: postH,
      floors,
      roofRise: +rise.toFixed(3),
      triangles: countMeshTriangles(group),
      parts: partNamesOf(group),
      worldBounds: worldBoundsOf(env, group),
    },
  };
  return group;
}

/* ------------------------------------------------------------------ 台基 / 台阶 / 桥 */

/**
 * 台基（可多层）。params: { id, name, bounds:{minX,maxX,minZ,maxZ} | (x,z,w,d), y0, y1, tiers:[{bounds,y0,y1}],
 *   railing, stoneRole, detail, rotationYDeg }
 */
export function makeTerrace(env, raw = {}) {
  const T = env.THREE;
  const { config, materials } = env;
  const M = config.MODULES;
  const tile = tileMeters(materials);
  const detail = raw.detail ?? 'near';
  const stoneMat = raw.stoneRole === 'terraceStoneShade' ? 'stoneWhiteShade' : 'stoneWhite';
  const tiers = raw.tiers
    ? raw.tiers.map((t) => ({
      bounds: t.bounds,
      y0: t.y0 ?? 0,
      y1: t.y1,
      tier: t.tier ?? null,
      stoneRole: t.stoneRole ?? raw.stoneRole,
    }))
    : [{
      bounds: raw.bounds ?? {
        minX: (raw.x ?? 0) - (raw.w ?? 1) / 2,
        maxX: (raw.x ?? 0) + (raw.w ?? 1) / 2,
        minZ: (raw.z ?? 0) - (raw.d ?? 1) / 2,
        maxZ: (raw.z ?? 0) + (raw.d ?? 1) / 2,
      },
      y0: raw.y0 ?? 0,
      y1: raw.y1 ?? (raw.y0 ?? 0) + (raw.terraceH ?? 1),
      tier: raw.tier ?? 1,
      stoneRole: raw.stoneRole,
    }];

  const parts = new Parts();
  const center = {
    x: (tiers[0].bounds.minX + tiers[0].bounds.maxX) / 2,
    z: (tiers[0].bounds.minZ + tiers[0].bounds.maxZ) / 2,
  };
  const dims = [];
  for (const tier of tiers) {
    const w = tier.bounds.maxX - tier.bounds.minX;
    const d = tier.bounds.maxZ - tier.bounds.minZ;
    const h = tier.y1 - tier.y0;
    if (!(w > 0 && d > 0 && h > 0)) throw new Error(`kit.terrace(${raw.id}): 第 ${tier.tier} 层尺寸非法`);
    const cx = (tier.bounds.minX + tier.bounds.maxX) / 2 - center.x;
    const cz = (tier.bounds.minZ + tier.bounds.maxZ) / 2 - center.z;
    const capH = Math.max(0.1, h * PROPORTIONS.terraceCapThickness);
    parts.add('terrace', stoneMat, box(T, { w, h: h - capH, d, x: cx, y: tier.y0, z: cz, tile: tile.stone }));
    parts.add('terraceCap', 'stoneWhiteShade', box(T, { w: w + capH * 0.5, h: capH, d: d + capH * 0.5, x: cx, y: tier.y1 - capH, z: cz, tile: tile.stone }));
    dims.push({ tier: tier.tier, w, d, h, y0: tier.y0, y1: tier.y1 });
    if (raw.railing !== false && detail !== 'far') {
      const railH = M.stairsStepHeight * PROPORTIONS.railingHeightSteps;
      const rail = buildRailing(T, {
        w,
        d,
        baseY: tier.y1,
        height: railH,
        tile: tile.stone,
        detail,
        gapFront: tier.tier === tiers.length ? Math.min(w * 0.3, 24) : 0,
        material: 'stoneWhite',
      });
      for (const bucket of rail.parts.buckets.values()) {
        for (const g of bucket.geometries) translate(T, g, cx, 0, cz);
      }
      parts.absorb(rail.parts);
    }
  }
  const group = groupFromParts(env, raw.id ?? 'terrace', parts, 'terrace');
  group.position.set(center.x, 0, center.z);
  group.rotation.y = (((raw.rotationYDeg ?? 0) * Math.PI) / 180);
  group.updateMatrixWorld(true);
  group.userData.kit = {
    id: raw.id ?? 'terrace',
    kind: 'terrace',
    name: raw.name ?? raw.id ?? 'terrace',
    detail,
    metrics: { tiers: dims, center, triangles: countMeshTriangles(group), parts: partNamesOf(group), worldBounds: worldBoundsOf(env, group) },
  };
  return group;
}

/** 台阶/坡道。params: { id, width, rise, x, z, rotationYDeg, baseY, imperialRamp, detail } */
export function makeStairs(env, raw = {}) {
  const { config, materials } = env;
  const M = config.MODULES;
  const tile = tileMeters(materials);
  const detail = raw.detail ?? 'near';
  const width = raw.width ?? M.bayPitch * 2;
  const rise = raw.rise ?? M.terraceTotalHeight;
  const st = buildStairs(env.THREE, {
    width,
    rise,
    stepHeight: raw.stepHeight ?? M.stairsStepHeight,
    stepDepth: raw.stepDepth ?? M.stairsStepDepth,
    maxRun: raw.maxRun ?? M.stairsMaxRun,
    tile: tile.stone,
    baseY: 0,
    imperialRamp: raw.imperialRamp === true,
  });
  const group = groupFromParts(env, raw.id ?? 'stairs', st.parts, 'stairs');
  applyPlacement(env, group, { x: raw.x, z: raw.z, baseY: raw.baseY ?? 0, rotationYDeg: raw.rotationYDeg ?? 0 });
  group.userData.kit = {
    id: raw.id ?? 'stairs',
    kind: 'stairs',
    name: raw.name ?? raw.id ?? 'stairs',
    detail,
    metrics: { ...st.dims, parts: partNamesOf(group), triangles: countMeshTriangles(group), worldBounds: worldBoundsOf(env, group) },
  };
  return group;
}

/**
 * 桥（护城河/水景）。params: { id, width, span, deckY, x, z, rotationYDeg, arches, railings, detail }
 * 本地 X = 桥宽，本地 Z = 跨度。
 */
export function makeBridge(env, raw = {}) {
  const T = env.THREE;
  const { config, materials } = env;
  const M = config.MODULES;
  const tile = tileMeters(materials);
  const detail = raw.detail ?? 'near';
  const width = raw.width ?? M.bridgeDeckWidth;
  const span = raw.span ?? (raw.bounds ? raw.bounds.maxZ - raw.bounds.minZ : M.moatWidth + 4);
  const deckY = raw.deckY ?? config.TERRAIN.bridgeDeckY;
  const parts = new Parts();
  const deckT = Math.max(0.5, deckY * 0.6);
  parts.add('deck', 'stoneWhite', box(T, { w: width, h: deckT, d: span, y: deckY - deckT, tile: tile.stone }));
  parts.add('deckTop', 'pavingLight', box(T, { w: width, h: 0.12, d: span, y: deckY, tile: tile.paving }));
  // 拱券（两侧各一道半环）。
  // 可选拱券参数（**默认全部退化为修复前的表达式，默认调用的几何逐位不变**）：
  //   archRadius   拱券水平半径（默认 = min(span×0.18, deckY + max(1.2, |护城河常水位|×0.5))）
  //   archRise     拱券竖向矢高（默认 = archRadius，即半圆；≠ 时对环做 Y 向缩放）
  //   archCrownY   拱顶标高（默认 = deckY − deckT + archTube，与修复前一致）
  //   archClearance 净空 = 拱顶到参考面的高度（给出时优先：crownY = referenceY + archClearance）
  //   archSpringY  拱脚标高（给出且未给 crown/clearance 时：crownY = archSpringY + archRise）
  //   referenceY   净空参考面（默认 = config.TERRAIN.moatWaterY）
  const archTube = Math.max(0.4, width * 0.05);
  const referenceY = raw.referenceY ?? config.TERRAIN.moatWaterY;
  const archR = raw.archRadius ?? Math.min(span * 0.18, deckY + Math.max(1.2, Math.abs(config.TERRAIN.moatWaterY) * 0.5));
  const archRise = raw.archRise ?? archR;
  const archCrownY = raw.archClearance !== undefined && raw.archClearance !== null
    ? referenceY + raw.archClearance
    : raw.archCrownY ?? (raw.archSpringY !== undefined ? raw.archSpringY + archRise : deckY - deckT + archTube);
  const archSpringY = raw.archSpringY ?? (archCrownY - archRise);
  if (detail !== 'far') {
    for (const sx of [-1, 1]) {
      const ring = new T.TorusGeometry(archR, archTube, 6, 14, Math.PI).toNonIndexed();
      ring.applyMatrix4(new T.Matrix4().makeRotationY(Math.PI / 2));
      if (raw.archRise !== undefined && archRise !== archR) {
        ring.applyMatrix4(new T.Matrix4().makeScale(1, archRise / archR, 1));
      }
      translate(T, ring, sx * (width / 2 - archTube * 0.5), archCrownY - archRise, 0);
      parts.add('arch', 'stoneWhite', ring);
    }
    // 桥墩侧墙
    const wallH = Math.max(0.8, deckY - config.TERRAIN.moatWaterY * 0.4);
    for (const sx of [-1, 1]) {
      parts.add('pier', 'stoneWhite', box(T, { w: archTube * 1.4, h: wallH, d: span, x: sx * (width / 2 - archTube), y: deckY - deckT - wallH, tile: tile.stone }));
    }
  }
  // 栏杆（两侧）
  if (raw.railings !== false) {
    const railH = M.stairsStepHeight * PROPORTIONS.railingHeightSteps * 2;
    const n = Math.max(2, Math.round(span / 3));
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= n; i += 1) {
        const z = -span / 2 + (span * i) / n;
        parts.add('railing', 'stoneWhite', box(T, { w: 0.3, h: railH, d: 0.3, x: sx * (width / 2 - 0.2), z, y: deckY, tile: tile.stone }));
      }
      parts.add('railingTop', 'stoneWhiteShade', box(T, { w: 0.42, h: 0.22, d: span, x: sx * (width / 2 - 0.2), y: deckY + railH, tile: tile.stone }));
    }
  }
  // 两端桥台
  for (const sz of [-1, 1]) {
    parts.add('abutment', 'stoneWhite', box(T, { w: width + 2, h: deckT * 1.6, d: 3, z: sz * (span / 2 + 1.4), y: deckY - deckT * 1.6, tile: tile.stone }));
  }
  const group = groupFromParts(env, raw.id ?? 'bridge', parts, 'bridge');
  applyPlacement(env, group, { x: raw.x ?? 0, z: raw.z ?? 0, baseY: 0, rotationYDeg: raw.rotationYDeg ?? 0 });
  group.userData.kit = {
    id: raw.id ?? 'bridge',
    kind: 'bridge',
    name: raw.name ?? raw.id ?? 'bridge',
    detail,
    metrics: {
      width,
      span,
      deckY,
      archRadius: archR,
      arch: {
        radius: +archR.toFixed(4),
        rise: +archRise.toFixed(4),
        crownY: +archCrownY.toFixed(4),
        springY: +archSpringY.toFixed(4),
        clearance: +(archCrownY - referenceY).toFixed(4),
        referenceY: +referenceY.toFixed(4),
        tube: +archTube.toFixed(4),
      },
      arches: detail === 'far' ? 0 : 2,
      parts: partNamesOf(group),
      triangles: countMeshTriangles(group),
      worldBounds: worldBoundsOf(env, group),
    },
  };
  return group;
}

/* ------------------------------------------------------------------ 摆件工厂 */

function propFactory(env, kind, builder, defaults, { useYAsBase = true } = {}) {
  return (raw = {}) => {
    const { config, materials } = env;
    const seed = raw.rngSeed ?? (env.deriveSeed ?? (() => config.SCENE_SEED))(raw.id ?? kind, kind);
    const rng = makeRng(seed >>> 0);
    const tile = tileMeters(materials);
    const result = builder(env.THREE, { ...defaults, ...raw, tile: tile, rng, config, materials, plants: config.PLANTS });
    const group = groupFromParts(env, raw.id ?? kind, result.parts, kind);
    applyPlacement(env, group, {
      x: raw.x ?? 0,
      z: raw.z ?? 0,
      baseY: raw.baseY ?? (useYAsBase ? raw.y ?? 0 : 0),
      rotationYDeg: raw.rotationYDeg ?? 0,
    });
    group.userData.kit = {
      id: raw.id ?? kind,
      kind,
      name: raw.name ?? raw.id ?? kind,
      detail: raw.detail ?? 'near',
      dims: result.dims,
      seed,
      metrics: {
        ...result.dims,
        parts: partNamesOf(group),
        triangles: countMeshTriangles(group),
        worldBounds: worldBoundsOf(env, group),
      },
    };
    return group;
  };
}

export function makeProps(env) {
  return {
    tree: propFactory(env, 'tree', (T, o) => buildTree(T, {
      height: o.height ?? env.config.PLANTS.treeHeights[o.size ?? 'medium'],
      canopyShape: o.canopyShape ?? env.config.PLANTS.canopyShapes[0],
      blossom: o.blossom ?? false,
      detail: o.detail ?? 'near',
      rng: o.rng,
      tile: o.tile,
      plants: o.plants,
    }), {}),
    rockery: propFactory(env, 'rockery', (T, o) => buildRockery(T, { w: o.w ?? 12, d: o.d ?? 12, height: o.height ?? 6, detail: o.detail ?? 'near', rng: o.rng, tile: o.tile }), {}),
    lantern: propFactory(env, 'lantern', (T, o) => buildLantern(T, { height: o.height ?? 3.4, detail: o.detail ?? 'near', tile: o.tile, kind: o.kind ?? 'post' }), {}),
    bronze: propFactory(env, 'bronze', (T, o) => buildBronze(T, { kind: o.kind ?? 'vessel', size: o.size ?? 1.6, detail: o.detail ?? 'near', tile: o.tile }), {}),
    screenWall: propFactory(env, 'screenWall', (T, o) => buildScreenWall(T, { w: o.w ?? 40, height: o.height ?? 3.2, thickness: o.thickness ?? 1, detail: o.detail ?? 'near', tile: o.tile }), {}),
    water: propFactory(env, 'water', (T, o) => buildWater(T, { w: o.w ?? 20, d: o.d ?? 20, y: o.y ?? 0, detail: o.detail ?? 'near', tile: o.tile }), {}, { useYAsBase: false }),
    paving: propFactory(env, 'paving', (T, o) => buildPaving(T, { w: o.w ?? 20, d: o.d ?? 20, y: o.y ?? 0, thickness: o.thickness ?? 0.16, material: o.material ?? 'pavingStone', tile: o.tile }), {}, { useYAsBase: false }),
    railing: propFactory(env, 'railing', (T, o) => buildRailing(T, {
      w: o.w ?? 20,
      d: o.d ?? 20,
      baseY: 0,
      height: o.height ?? env.config.MODULES.stairsStepHeight * PROPORTIONS.railingHeightSteps,
      tile: o.tile,
      detail: o.detail ?? 'near',
      gapFront: o.gapFront ?? 0,
      material: o.material ?? 'stoneWhite',
    }), {}),
  };
}
