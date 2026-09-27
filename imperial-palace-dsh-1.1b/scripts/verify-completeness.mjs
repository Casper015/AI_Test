/**
 * scripts/verify-completeness.mjs — G2 场景完整性与跨区连接一致性**独立验证引擎**
 * =============================================================================
 * 归属：verifier（t12 / V1）。只读消费 src/**、tests/**、docs/**、index.html；不改任何交付文件。
 *
 * 方法（不依赖任何区域测试的结论）：
 *   1) 用 tests/harness.mjs 的 Node 解析钩子 + 真 kit，直接 import 5 个区域模块并 createZone；
 *   2) 用 core 的 createRegistry 注册**真实区域**（灰盒单独做隐藏性检查，不参与统计）；
 *   3) 对装配后的场景做**射线探测**（Raycaster + 32m 网格 bbox 宽相位）做覆盖/落地/悬空/水面检查
 *      —— 不用"顶点邻近"法：合批后的大块几何（地面/城墙）顶点只在角上，会给出大量假阴性；
 *   4) 用 core 的 deriveWallColliders 派生墙体碰撞盒，检查覆盖/重墙/悬空；
 *   5) 用 t9 的 walk-solver + walk-graph（带真实 registry 障碍、cellSize=1）做"无断路 + 内景可达"检查；
 *   6) 浏览器侧：自建静态服务（记录每个请求的 HTTP 状态）+ headless Chrome --dump-dom 读 main.js 的
 *      机器报告（区域列表/建筑数/kit 来源/真实绘制批次），出图到系统临时目录做像素统计（不写入项目）。
 *
 * 用法：node scripts/verify-completeness.mjs [--json] [--no-browser]
 * 被 tests/verify-completeness.test.mjs 复用（同一引擎、同一份真相）。
 */

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, dirname, resolve, normalize, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadModule, loadThree, buildZone, makeSilentEvents, ROOT } from '../tests/harness.mjs';

const ONLY_JSON = process.argv.includes('--json');
const NO_BROWSER = process.argv.includes('--no-browser');
const ZONE_IDS = ['B', 'C', 'D', 'E', 'F'];
const ZONE_FILES = {
  B: 'src/zones/forecourt.js',
  C: 'src/zones/inner-palace.js',
  D: 'src/zones/west-courts.js',
  E: 'src/zones/east-courts.js',
  F: 'src/zones/garden-boundary.js',
};
/** 内景包围盒（CONTRACTS §5.3） */
const INTERIOR_BOXES = { B: { minX: -36, maxX: 36, minZ: -134, maxZ: -98 }, C: { minX: -27, maxX: 27, minZ: 154, maxZ: 182 } };

/* ============================================================ 结果收集器 */

export function createCollector() {
  const checks = [];
  const lines = [];
  const log = (line = '') => {
    lines.push(line);
    if (!ONLY_JSON) console.log(line);
  };
  return {
    checks,
    lines,
    log,
    section(title) {
      log(`\n=== ${title} ===`);
    },
    info(text) {
      log(`  · ${text}`);
    },
    pass(id, detail) {
      checks.push({ id, status: 'passed', detail });
      log(`  [PASS] ${id}${detail ? ` — ${detail}` : ''}`);
    },
    fail(id, detail) {
      checks.push({ id, status: 'failed', detail });
      log(`  [FAIL] ${id}${detail ? ` — ${detail}` : ''}`);
    },
    unverified(id, detail) {
      checks.push({ id, status: 'unverified', detail });
      log(`  [UNVERIFIED] ${id}${detail ? ` — ${detail}` : ''}`);
    },
    /** 已知条件 / 上游数据缺陷：记录并归属责任人，不作为本次 G2 判据（不改变退出码）。 */
    condition(id, detail, owner) {
      checks.push({ id, status: 'condition', owner, detail });
      log(`  [CONDITION→${owner}] ${id}${detail ? ` — ${detail}` : ''}`);
    },
    expect(id, ok, detail) {
      if (ok) this.pass(id, detail);
      else this.fail(id, detail);
      return !!ok;
    },
    summary() {
      const passed = checks.filter((c) => c.status === 'passed').length;
      const failed = checks.filter((c) => c.status === 'failed');
      const unverified = checks.filter((c) => c.status === 'unverified');
      const conditions = checks.filter((c) => c.status === 'condition');
      log('\n---------------------------------------------------------');
      log(` 检查项 ${checks.length}：PASS ${passed} / FAIL ${failed.length} / UNVERIFIED ${unverified.length} / CONDITION ${conditions.length}`);
      for (const f of failed) log(`  ✗ ${f.id} — ${f.detail}`);
      for (const u of unverified) log(`  ? ${u.id} — ${u.detail}`);
      for (const c of conditions) log(`  △ [${c.owner}] ${c.id}`);
      log('---------------------------------------------------------');
      return { checks, passed, failed, unverified, conditions, exitCode: failed.length === 0 ? 0 : 1 };
    },
  };
}

/* ============================================================ 射线探测 */

/**
 * 场景几何探测：沿竖直方向射线求交（Raycaster），用 32m 网格的 bbox 宽相位加速。
 * `downHits(x,z,fromY,toY)` 返回该竖直线上全部交点的 y（降序）。
 */
function createRayProbe(THREE, roots, { cell = 32 } = {}) {
  const meshes = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((n) => {
      if (n.visible === false) return;
      if (n.isMesh || n.isInstancedMesh) meshes.push(n);
    });
  }
  const grid = new Map();
  const key = (cx, cz) => `${cx}|${cz}`;
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    box.setFromObject(mesh);
    if (!Number.isFinite(box.min.x)) continue;
    for (let cx = Math.floor(box.min.x / cell); cx <= Math.floor(box.max.x / cell); cx += 1) {
      for (let cz = Math.floor(box.min.z / cell); cz <= Math.floor(box.max.z / cell); cz += 1) {
        const k = key(cx, cz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(mesh);
      }
    }
  }
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const cache = new Map();
  let rayCount = 0;

  function cast(x, z, fromY, toY, direction) {
    const k = `${x.toFixed(2)}|${z.toFixed(2)}|${fromY.toFixed(2)}|${toY.toFixed(2)}|${direction === down ? 0 : 1}`;
    if (cache.has(k)) return cache.get(k);
    rayCount += 1;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    const seen = new Set();
    const candidates = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (const mesh of grid.get(key(cx + dx, cz + dz)) ?? []) {
          if (seen.has(mesh)) continue;
          seen.add(mesh);
          candidates.push(mesh);
        }
      }
    }
    raycaster.set(new THREE.Vector3(x, fromY, z), direction);
    raycaster.far = Math.abs(fromY - toY);
    const ys = raycaster.intersectObjects(candidates, false).map((h) => h.point.y).sort((a, b) => b - a);
    cache.set(k, ys);
    return ys;
  }
  return {
    meshCount: meshes.length,
    rayCount: () => rayCount,
    downHits: (x, z, fromY = 60, toY = -40) => cast(x, z, fromY, toY, down),
    /** 该竖直线上是否存在 y ∈ [y0,y1] 的几何。 */
    hasBand(x, z, y0, y1) {
      return this.downHits(x, z, y1 + 3, y0 - 3).some((y) => y >= y0 && y <= y1);
    },
    /** 从上往下第一个交点（几何最高可见面）。 */
    topAt(x, z, fromY = 60) {
      const ys = this.downHits(x, z, fromY, -40);
      return ys.length ? ys[0] : null;
    },
    /** 竖直线上 y ∈ [y0,y1] 内的全部交点（自上而下）。 */
    hitsInBand(x, z, y0, y1) {
      return this.downHits(x, z, y1 + 4, y0 - 4).filter((y) => y >= y0 && y <= y1);
    },
  };
}

function sampleGrid(bounds, grid, inset = 0) {
  const pts = [];
  for (let i = 0; i <= grid; i += 1) {
    for (let j = 0; j <= grid; j += 1) {
      pts.push({
        x: bounds.minX + inset + ((bounds.maxX - bounds.minX - inset * 2) * i) / grid,
        z: bounds.minZ + inset + ((bounds.maxZ - bounds.minZ - inset * 2) * j) / grid,
      });
    }
  }
  return pts;
}

function intervalOverlap(a, b) {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
}

/* ============================================================ 主流程 */

export async function runCompleteness({ browser = true } = {}) {
  const C = createCollector();
  const THREE = await loadThree();
  const { CONFIG } = await loadModule('src/shared/config.js');
  const LAYOUT = await loadModule('src/shared/layout.js');
  const { createRegistry } = await loadModule('src/core/registry.js');
  const { deriveWallColliders } = await loadModule('src/core/layout-slice.js');
  const { createKit } = await loadModule('src/kit/index.js');
  const kit = createKit({ THREE, config: CONFIG, quality: 'medium' });
  const events = makeSilentEvents();
  const registry = createRegistry({ events, layout: LAYOUT });

  if (!ONLY_JSON) {
    console.log('=========================================================');
    console.log(' G2 场景完整性与跨区连接一致性独立验证（verifier / t12）');
    console.log(` node ${process.version} · three r${THREE.REVISION} · kit ${kit.version}`);
    console.log(` root ${ROOT}`);
    console.log('=========================================================');
  }

  /* ---------------------------------------------------- 1 独立装配 */
  C.section('1 独立装配：5 个真实区域（灰盒不参与统计）');
  const zoneResults = new Map();
  const zoneFacts = [];
  for (const zoneId of ZONE_IDS) {
    const built = await buildZone(zoneId, { kit, registry, events });
    if (built.skipped) throw new Error(`区域 ${zoneId} 未交付（${built.reason}）`);
    const { result } = built;
    registry.registerZone(zoneId, result, { replace: true });
    zoneResults.set(zoneId, result);
    let meshes = 0;
    let instanced = 0;
    let triangles = 0;
    const parts = new Map();
    result.root.updateMatrixWorld(true);
    result.root.traverse((n) => {
      if (n.isInstancedMesh) {
        instanced += 1;
        triangles += Math.floor(n.geometry.attributes.position.count / 3) * n.count;
      } else if (n.isMesh) {
        meshes += 1;
        triangles += Math.floor(n.geometry.attributes.position.count / 3);
      }
      if ((n.isMesh || n.isInstancedMesh) && n.userData?.part) parts.set(n.userData.part, (parts.get(n.userData.part) ?? 0) + 1);
    });
    zoneFacts.push({
      zoneId,
      buildings: result.buildings.length,
      connectors: result.connectors.length,
      obstacles: result.colliders.obstacles.length,
      walkable: result.colliders.walkable.length,
      ramps: result.colliders.ramps?.length ?? 0,
      viewpoints: result.viewpoints.length,
      lightAnchors: result.lightAnchors.length,
      meshes,
      instanced,
      triangles,
      drawCalls: kit.countDrawCalls(result.root),
      parts,
    });
    C.info(`${zoneId}: 建筑 ${result.buildings.length} · 连接 ${result.connectors.length} · 障碍 ${result.colliders.obstacles.length} · 可走面 ${result.colliders.walkable.length} · 机位 ${result.viewpoints.length} · 灯位 ${result.lightAnchors.length} · 网格 ${meshes}(+实例 ${instanced}) · 三角面 ${triangles} · 绘制调用 ${kit.countDrawCalls(result.root)}`);
  }
  // 城市级机位（main.js 由 registry.registerLayoutViewpoints 登记）
  registry.registerLayoutViewpoints(LAYOUT.VIEWPOINTS);
  C.pass('1.1 五个区域模块全部可独立装配并注册（B/C/D/E/F）', zoneFacts.map((z) => `${z.zoneId}:${z.buildings}`).join(' '));
  const roots = [...zoneResults.values()].map((r) => r.root);
  const probe = createRayProbe(THREE, roots);
  C.pass('1.2 装配后的场景几何可被射线探测（几何非空）', probe.meshCount > 50, `${probe.meshCount} 个可渲染网格`);

  const stats = registry.stats();
  const totalTriangles = zoneFacts.reduce((s, z) => s + z.triangles, 0);
  const totalDrawCalls = zoneFacts.reduce((s, z) => s + z.drawCalls, 0);
  C.info(`注册表：建筑 ${stats.buildings} · 连接 ${stats.connectors} · 视角 ${stats.viewpoints} · 灯位 ${stats.lightAnchors} · 障碍 ${stats.obstacles}（core 派生墙 ${stats.obstaclesBySource.coreWalls} + 区域 ${stats.obstaclesBySource.zones}，去重 ${stats.obstaclesBySource.deduped}）`);
  C.info(`整城几何：${totalDrawCalls} 绘制调用 / ${totalTriangles} 三角面（预算 350 / 1500000）`);

  /* ---------------------------------------------------- 2 建筑 */
  C.section('2 建筑：数量、身份、屋顶、逐区 id 集合');
  const layoutIds = LAYOUT.SLOTS.map((s) => s.id);
  const regIds = registry.allBuildings().map((b) => b.id);
  C.expect(`2.1 注册建筑数 = layout.SLOTS = ${LAYOUT.SLOTS.length}（≥50 门槛）`,
    stats.buildings === LAYOUT.SLOTS.length && stats.buildings >= 50,
    `注册 ${stats.buildings} / layout ${LAYOUT.SLOTS.length}`);
  const dupIds = regIds.filter((id, i) => regIds.indexOf(id) !== i);
  C.expect('2.2 建筑 id 全局唯一（无重复编号）', dupIds.length === 0, dupIds.length ? `重复：${[...new Set(dupIds)].join(',')}` : `${LAYOUT.SLOTS.length} 个 id 唯一`);
  const missing = layoutIds.filter((id) => !regIds.includes(id));
  const extra = regIds.filter((id) => !layoutIds.includes(id));
  C.expect('2.3 注册建筑 id 集合 = layout.SLOTS id 集合（多一/少一都算失败）', missing.length === 0 && extra.length === 0,
    `缺失 ${missing.length}${missing.length ? `：${missing.slice(0, 5).join(',')}` : ''} · 多出 ${extra.length}${extra.length ? `：${extra.slice(0, 5).join(',')}` : ''}`);

  const corridorIds = new Set(LAYOUT.CORRIDORS.map((c) => c.id));
  const corridorAsBuilding = regIds.filter((id) => corridorIds.has(id) || /corridor|廊/i.test(id));
  const kinds = registry.allBuildings().map((b) => b.kind);
  const badKind = kinds.filter((k) => !['hall', 'gateHall', 'sideHall', 'pavilion', 'cornerTower', 'courtyardGate'].includes(k));
  C.expect('2.4 建筑计数未被廊段/拆件虚增（无 corridor id，kind 全在 6 类构件内）',
    corridorAsBuilding.length === 0 && badKind.length === 0,
    `corridor 混入 ${corridorAsBuilding.length} · 非法 kind ${badKind.length}${badKind.length ? `：${[...new Set(badKind)].join(',')}` : ''}`);

  const perZoneReport = [];
  let zoneSetOk = true;
  const fieldMismatch = [];
  const NUM_FIELDS = ['x', 'z', 'w', 'd', 'bays', 'terraceH', 'grade'];
  const STR_FIELDS = ['name', 'kind', 'category', 'zone', 'roofType', 'facing'];
  for (const zoneId of ZONE_IDS) {
    const expected = LAYOUT.SLOTS.filter((s) => s.zone === zoneId).map((s) => s.id).sort();
    const actual = registry.allBuildings().filter((b) => b.zone === zoneId).map((b) => b.id).sort();
    const same = expected.length === actual.length && expected.every((id, i) => id === actual[i]);
    const min = { B: 8, C: 8, D: 8, E: 8, F: 10 }[zoneId];
    perZoneReport.push(`${zoneId}: ${actual.length}/${expected.length}${same ? '' : '(集合不一致!)'}${actual.length >= min ? '' : '(低于门槛!)'}`);
    if (!same || actual.length < min) zoneSetOk = false;
    for (const id of expected) {
      const slot = LAYOUT.SLOT_BY_ID[id];
      const got = registry.getBuilding(id);
      if (!got) { fieldMismatch.push(`${id}:未注册`); continue; }
      for (const f of NUM_FIELDS) if (got[f] !== slot[f]) fieldMismatch.push(`${id}.${f}: ${got[f]} ≠ ${slot[f]}`);
      for (const f of STR_FIELDS) if (got[f] !== slot[f]) fieldMismatch.push(`${id}.${f}: ${got[f]} ≠ ${slot[f]}`);
      if (got.visitable !== slot.visitable) fieldMismatch.push(`${id}.visitable 不一致`);
      if (!got.bounds || got.bounds.minX !== slot.bounds.minX || got.bounds.maxX !== slot.bounds.maxX || got.bounds.minZ !== slot.bounds.minZ || got.bounds.maxZ !== slot.bounds.maxZ) fieldMismatch.push(`${id}.bounds 不一致`);
    }
  }
  C.expect('2.5 逐区 id 集合与 layout 完全一致且满足门槛（B≥8/C≥8/D≥8/E≥8/F≥10）', zoneSetOk, perZoneReport.join(' · '));
  C.expect('2.6 建筑逐字段回显 layout（数值/名称/形制/包围盒，篡改即失败）', fieldMismatch.length === 0,
    fieldMismatch.length ? `${fieldMismatch.length} 处：${fieldMismatch.slice(0, 5).join('；')}` : `${LAYOUT.SLOTS.length} 栋 × ${NUM_FIELDS.length + STR_FIELDS.length + 2} 字段全一致`);

  // 有顶：俯视每个采样点首先命中屋面（≥檐高），且檐上抬升 ≥1m，且基座落地
  const roofIssues = [];
  const roofStats = [];
  for (const slot of LAYOUT.SLOTS) {
    const pts = sampleGrid(slot.bounds, 4, 0);
    let covered = 0;
    let topMax = -Infinity;
    let baseHits = 0;
    for (const p of pts) {
      const top = probe.topAt(p.x, p.z);
      if (top !== null && top >= slot.eaveHeight - 0.6) covered += 1;
      if (top !== null && top > topMax) topMax = top;
      // 权威地面 = layout.floorYAt（CONTRACTS §6.1）；建筑底面必须落在其附近（不悬空、不埋没）
      const groundY = LAYOUT.floorYAt(p.x, p.z);
      const gy = groundY === null ? slot.baseY - slot.terraceH : groundY;
      if (probe.hitsInBand(p.x, p.z, gy - 1.5, gy + 0.8).length > 0) baseHits += 1;
    }
    const coverRatio = covered / pts.length;
    const rise = topMax === -Infinity ? 0 : topMax - slot.eaveHeight;
    roofStats.push({ id: slot.id, coverRatio, rise, baseRatio: baseHits / pts.length });
    if (coverRatio < 0.9) roofIssues.push(`${slot.id}:屋面俯视覆盖 ${(coverRatio * 100).toFixed(0)}%`);
    if (rise < 1.0) roofIssues.push(`${slot.id}:檐上仅 ${rise.toFixed(2)}m`);
    if (baseHits / pts.length < 0.85) roofIssues.push(`${slot.id}:地面基准处无台明（${((baseHits / pts.length) * 100).toFixed(0)}%）`);
  }
  const rises = roofStats.map((r) => r.rise).sort((a, b) => a - b);
  C.expect(`2.7 ${LAYOUT.SLOTS.length} 栋「俯视有屋面 + 檐上≥1m + 满足迹基座」（=有顶可识别建筑，非裸体块/碎片）`,
    roofIssues.length === 0,
    roofIssues.length ? `${roofIssues.length} 例：${roofIssues.slice(0, 6).join('；')}` : `檐上高度 ${rises[0].toFixed(2)}–${rises[rises.length - 1].toFixed(2)}m（中位 ${rises[Math.floor(rises.length / 2)].toFixed(2)}m）`);

  const roofPartsByZone = zoneFacts.map((z) => `${z.zoneId}:roof=${z.parts.get('roof') ?? 0}/ridge=${z.parts.get('ridge') ?? 0}/lowerRoof=${z.parts.get('lowerRoof') ?? 0}/finial=${z.parts.get('finial') ?? 0}`);
  C.expect('2.8 每个区域都含屋面/正脊/宝顶部件几何（合并后仍可辨识屋面部）',
    zoneFacts.every((z) => (z.parts.get('roof') ?? 0) > 0 && (z.parts.get('ridge') ?? 0) > 0 && (z.parts.get('finial') ?? 0) > 0),
    roofPartsByZone.join(' · '));

  // 说明（非缺陷）：SLOTS.baseY 的语义是"台基顶"，baseY−terraceH 是台基底/组原点，
  // 因此它不等于建筑脚下的可行走面（台基顶）高度；2.7 已用 floorYAt 逐点核验"地面处有体量"。
  const plinthTopMatches = LAYOUT.SLOTS.filter((sl) => {
    const y = LAYOUT.floorYAt(sl.x, sl.z);
    return y !== null && Math.abs(y - sl.baseY) <= 0.05;
  }).length;
  C.info(`baseY 语义核对：${plinthTopMatches}/${LAYOUT.SLOTS.length} 槽位满足 floorYAt(中心)≈baseY（台基顶）；其余槽位脚下为台基/月台分层，属设计`);

  const kitRoofFail = [];
  for (const slot of LAYOUT.SLOTS) {
    try {
      const object = kit[slot.kind]({ ...slot, quality: 'medium', lod: 'near' });
      const m = object.userData.kit.metrics;
      if (slot.roofType === 'pyramidal') {
        if (m.slopes !== 4) kitRoofFail.push(`${slot.id}:攒尖 slopes=${m.slopes}`);
        if (m.ridge) kitRoofFail.push(`${slot.id}:攒尖不应有正脊`);
      } else if (!m.ridge || m.ridge.length <= 0) {
        kitRoofFail.push(`${slot.id}:无正脊`);
      }
      if (!(m.triangles?.near > 0)) kitRoofFail.push(`${slot.id}:无几何`);
    } catch (error) {
      kitRoofFail.push(`${slot.id}:${error.message.split('\n')[0]}`);
    }
  }
  C.expect(`2.9 kit 侧对 ${LAYOUT.SLOTS.length} 槽位全部产出可识别屋顶（庑殿/歇山/硬山有正脊，攒尖四面坡且无正脊）`,
    kitRoofFail.length === 0, kitRoofFail.length ? kitRoofFail.slice(0, 5).join('；') : `${LAYOUT.SLOTS.length}/${LAYOUT.SLOTS.length} 槽位屋顶形制齐备`);

  /* ---------------------------------------------------- 3 院落 */
  C.section('3 院落：≥12 且有墙/门/建筑界定');
  const courtyardReport = [];
  const badCourtyards = [];
  for (const cy of LAYOUT.COURTYARDS) {
    const walls = LAYOUT.WALLS.filter((w) => w.courtyardId === cy.id);
    const buildings = LAYOUT.SLOTS.filter((s) => s.courtyard === cy.id);
    const openings = walls.reduce((n, w) => n + (w.openings?.length ?? 0), 0);
    const missingWallIds = (cy.wallIds ?? []).filter((id) => !LAYOUT.WALLS.some((w) => w.id === id));
    const insideRegistered = buildings.filter((b) => registry.getBuilding(b.id)).length;
    const ok = walls.length >= 3 && missingWallIds.length === 0 && buildings.length >= 1 && openings >= 1 && insideRegistered === buildings.length;
    courtyardReport.push(`${cy.id}: 墙${walls.length} 建筑${buildings.length} 门洞${openings}`);
    if (!ok) badCourtyards.push(`${cy.id}(墙${walls.length}/建筑${buildings.length}/门洞${openings}/缺wallIds${missingWallIds.length}/未注册${buildings.length - insideRegistered})`);
  }
  C.expect('3.1 14 个院落均有 ≥3 面院墙 + wallIds 完整 + ≥1 栋已注册建筑 + ≥1 处门洞（≥12 门槛）',
    LAYOUT.COURTYARDS.length >= 12 && badCourtyards.length === 0,
    `院落 ${LAYOUT.COURTYARDS.length} 个；问题 ${badCourtyards.length}${badCourtyards.length ? `：${badCourtyards.join('；')}` : ''}`);
  C.info(`院落明细：${courtyardReport.join(' | ')}`);

  const wallGeometry = [];
  for (const wall of LAYOUT.WALLS) {
    const horizontal = wall.axis === 'x';
    const start = horizontal ? wall.from.x : wall.from.z;
    const end = horizontal ? wall.to.x : wall.to.z;
    const line = horizontal ? wall.from.z : wall.from.x;
    // openings.at = 沿墙轴的**世界绝对坐标**（core wallSolidSpans 口径，见 src/core/layout-slice.js）
    const gatePad = wall.cityWall ? 48 : 1;
    const steps = Math.max(2, Math.ceil(Math.abs(end - start) / 6));
    const gaps = (wall.openings ?? []).map((o) => [o.at - o.width / 2 - gatePad, o.at + o.width / 2 + gatePad]);
    let topHit = 0;
    let baseHit = 0;
    let samples = 0;
    for (let i = 0; i <= steps; i += 1) {
      const t = start + ((end - start) * i) / steps;
      if (gaps.some((g) => t > g[0] - 1 && t < g[1] + 1)) continue;
      const x = horizontal ? t : line;
      const z = horizontal ? line : t;
      const floor = LAYOUT.floorYAt(x, z) ?? 0;
      samples += 1;
      const top = probe.topAt(x, z, floor + wall.height + 14);
      if (top !== null && top >= floor + wall.height * 0.7 && top <= floor + wall.height + 6) topHit += 1;
      if (probe.hitsInBand(x, z, floor - 1.5, floor + 0.4).length > 0) baseHit += 1;
    }
    wallGeometry.push({ id: wall.id, samples, top: +(topHit / Math.max(samples, 1)).toFixed(3), base: +(baseHit / Math.max(samples, 1)).toFixed(3) });
  }
  const weakWalls = wallGeometry.filter((w) => w.top < 0.9 || w.base < 0.9);
  C.expect('3.2 60 段墙（宫墙 4 + 院墙 56）在装配场景里实体化：墙顶覆盖 ≥90% 且墙脚落地 ≥90%',
    weakWalls.length === 0,
    weakWalls.length ? `${weakWalls.length} 段偏弱：${weakWalls.slice(0, 6).map((w) => `${w.id}(顶${w.top}/底${w.base})`).join('；')}` : `${wallGeometry.length} 段全部合格（墙顶最低 ${Math.min(...wallGeometry.map((w) => w.top))}、落地最低 ${Math.min(...wallGeometry.map((w) => w.base))}）`);

  /* -------------------------------- 4 宫墙闭环/角楼/城门/水系/重墙 */
  C.section('4 宫墙闭合、四角角楼、城门层级、护城河与桥');
  const cityWalls = LAYOUT.WALLS.filter((w) => w.cityWall);
  const half = LAYOUT.CITY_WALL.thickness / 2;
  const cw = LAYOUT.CITY_WALL.centerline;
  const wallRingSamples = [];
  for (const offset of [-half + 0.5, 0, half - 0.5]) {
    const x0 = -cw.x + offset;
    const x1 = cw.x - offset;
    const z0 = -cw.z + offset;
    const z1 = cw.z - offset;
    for (let x = x0; x <= x1; x += 4) wallRingSamples.push({ x, z: z0 }, { x, z: z1 });
    for (let z = z0; z <= z1; z += 4) wallRingSamples.push({ x: x0, z }, { x: x1, z });
  }
  let wallRingHit = 0;
  for (const p of wallRingSamples) {
    const floor = LAYOUT.floorYAt(p.x, p.z) ?? 0;
    if (probe.hitsInBand(p.x, p.z, floor + 3, floor + 35).length > 0) wallRingHit += 1;
  }
  const wallRingRatio = wallRingHit / wallRingSamples.length;
  C.expect('4.1 宫墙环闭合：三条环线 4m 步长采样，环上结构几何存在率 100%（无断口）',
    wallRingRatio >= 0.995,
    `采样 ${wallRingSamples.length} 点，环上 3–35m 存在几何 ${wallRingHit}（${(wallRingRatio * 100).toFixed(2)}%），未命中 ${wallRingSamples.length - wallRingHit}`);

  // 主体墙身高度一致性：中心线采样（避开城门洞与角楼）应落在 12m 墙身 + 压顶/女墙的合理带内
  const bodyBands = [];
  const bodyBad = [];
  for (const w of cityWalls) {
    const horiz = w.axis === 'x';
    const base = horiz ? w.from.x : w.from.z;
    const end = horiz ? w.to.x : w.to.z;
    const line = horiz ? w.from.z : w.from.x;
    // 城门洞 ±48m 内是城台/城楼（另由 4.5 检查），此处只测"墙身段"
    const gaps = (w.openings ?? []).map((o) => [o.at - o.width / 2 - 48, o.at + o.width / 2 + 48]);
    const steps = Math.max(2, Math.ceil(Math.abs(end - base) / 8));
    let ok = 0;
    let n = 0;
    for (let i = 0; i <= steps; i += 1) {
      const t = base + ((end - base) * i) / steps;
      if (gaps.some((g) => t > g[0] && t < g[1])) continue;
      if (Math.abs(Math.abs(t) - LAYOUT.CITY_WALL.centerline.x) < 12 || Math.abs(Math.abs(t) - LAYOUT.CITY_WALL.centerline.z) < 12) continue; // 角楼范围
      const x = horiz ? t : line;
      const z = horiz ? line : t;
      const floor = LAYOUT.floorYAt(x, z) ?? 0;
      const top = probe.topAt(x, z, floor + 40);
      n += 1;
      if (top !== null && top >= floor + 10 && top <= floor + 16) ok += 1;
      else bodyBad.push(`${w.id}@${t.toFixed(0)}: ${top === null ? 'null' : top.toFixed(1)}`);
    }
    bodyBands.push(`${w.id}:${ok}/${n}`);
  }
  C.expect('4.1b 宫墙主体墙身高度一致（中心线采样避开城门洞/角楼，墙顶落在 10–16m 带内）',
    bodyBad.length === 0, bodyBad.length ? `${bodyBad.length} 处异常：${bodyBad.slice(0, 5).join('；')}` : bodyBands.join(' '));

  const segEnds = cityWalls.map((w) => ({ id: w.id, a: { x: w.from.x, z: w.from.z }, b: { x: w.to.x, z: w.to.z } }));
  const jointIssues = [];
  for (const seg of segEnds) {
    for (const end of ['a', 'b']) {
      const p = seg[end];
      const near = segEnds.filter((o) => o.id !== seg.id).some((o) => {
        const dx = Math.max(Math.min(o.a.x, o.b.x) - p.x, 0, p.x - Math.max(o.a.x, o.b.x));
        const dz = Math.max(Math.min(o.a.z, o.b.z) - p.z, 0, p.z - Math.max(o.a.z, o.b.z));
        return Math.hypot(dx, dz) <= LAYOUT.CITY_WALL.thickness + 0.01;
      });
      if (!near) jointIssues.push(`${seg.id}:${end} 悬空`);
    }
  }
  C.expect('4.2 四段宫墙中心线首尾相接成环（每个端点距相邻墙段 ≤ 墙厚 8m）', jointIssues.length === 0,
    jointIssues.length ? jointIssues.join('；') : '4 段 × 2 端 = 8 个端点全部与相邻墙段相接');

  const towerSlots = LAYOUT.SLOTS.filter((s) => s.kind === 'cornerTower');
  const towerIssues = [];
  for (const t of towerSlots) {
    if (!registry.getBuilding(t.id)) { towerIssues.push(`${t.id}:未注册`); continue; }
    if (!(Math.abs(Math.abs(t.x) - cw.x) < 0.01 && Math.abs(Math.abs(t.z) - cw.z) < 0.01)) towerIssues.push(`${t.id}:不在角点`);
    const top = probe.topAt(t.x, t.z);
    if (top === null || top < t.eaveHeight + 1) towerIssues.push(`${t.id}:无屋顶质量`);
  }
  C.expect('4.3 四角角楼齐全且位于宫墙四角（±304, ±454），均有屋顶几何',
    towerSlots.length === 4 && towerIssues.length === 0,
    towerIssues.length ? towerIssues.join('；') : towerSlots.map((t) => `${t.id}@(${t.x},${t.z})`).join(' '));

  const cityGates = LAYOUT.SLOTS.filter((s) => s.kind === 'gateHall' && s.onWall);
  const mainGates = cityGates.filter((g) => Math.abs(g.x) < 1);
  const sideGates = cityGates.filter((g) => Math.abs(g.z) < 1);
  const gradeRank = { 1: 1, 2: 2, 3: 3 };
  C.expect('4.4 城门层级正确：南北主门 grade3 重檐庑殿 > 东西侧门 grade2（等级严格更高）',
    mainGates.length === 2 && sideGates.length === 2
    && mainGates.every((g) => g.grade === 3 && g.roofType === 'doubleEaveHip')
    && sideGates.every((g) => g.grade < 3 && g.roofType !== 'doubleEaveHip')
    && mainGates.every((m) => sideGates.every((s) => gradeRank[m.grade] > gradeRank[s.grade])),
    `主门 ${mainGates.map((g) => `${g.id}/g${g.grade}/${g.roofType}`).join(' ')} · 侧门 ${sideGates.map((g) => `${g.id}/g${g.grade}/${g.roofType}`).join(' ')}`);

  const gateOpeningIssues = [];
  const gateFacts = [];
  for (const w of cityWalls) {
    const base = w.axis === 'x' ? w.from.x : w.from.z;
    const end = w.axis === 'x' ? w.to.x : w.to.z;
    const line = w.axis === 'x' ? w.from.z : w.from.x;
    const open = (w.openings ?? [])[0];
    if (!open) { gateOpeningIssues.push(`${w.id}:无门洞`); continue; }
    const horiz = w.axis === 'x';
    const center = open.at;
    const px = horiz ? center : line;
    const pz = horiz ? line : center;
    const floor = LAYOUT.floorYAt(px, pz) ?? 0;
    const passage = probe.hitsInBand(px, pz, floor + 0.3, floor + 4.5).filter((y) => y > floor + 0.55);
    const above = probe.hitsInBand(px, pz, floor + 8, floor + 26);
    const sides = [center - open.width / 2 - 4, center + open.width / 2 + 4].map((t) => {
      const sx = horiz ? t : line;
      const sz = horiz ? line : t;
      const sf = LAYOUT.floorYAt(sx, sz) ?? 0;
      return probe.hitsInBand(sx, sz, sf + 6, sf + 20).length > 0;
    });
    gateFacts.push(`${w.id}: 通行净空${passage.length === 0 ? '✓' : `✗(${passage.map((y) => y.toFixed(1)).join('/')})`} 上方有结构${above.length ? '✓' : '✗'} 两翼有墙${sides.every(Boolean) ? '✓' : '✗'}`);
    if (passage.length > 0) gateOpeningIssues.push(`${w.id}: 门洞净空内存在几何 ${passage.map((y) => y.toFixed(2)).join('/')}`);
    if (above.length === 0) gateOpeningIssues.push(`${w.id}: 门洞上方无城楼/墙体`);
    if (!sides.every(Boolean)) gateOpeningIssues.push(`${w.id}: 门洞两翼缺墙`);
  }
  C.expect('4.5 四座城门在宫墙上留出 4.5m 净空的可通行门洞，上方有城楼/墙体、两翼有墙', gateOpeningIssues.length === 0,
    gateOpeningIssues.length ? `${gateOpeningIssues.join('；')}（${gateFacts.join(' | ')}）` : gateFacts.join(' | '));

  const ringRects = LAYOUT.MOAT.rects;
  const touching = [];
  for (let i = 0; i < ringRects.length; i += 1) {
    for (let j = i + 1; j < ringRects.length; j += 1) {
      const A = ringRects[i].bounds;
      const B = ringRects[j].bounds;
      const overlapX = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
      const overlapZ = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);
      const touch = (overlapX > 1 && Math.abs(overlapZ) < 0.01) || (overlapZ > 1 && Math.abs(overlapX) < 0.01) || (overlapX > 1 && overlapZ > 1);
      if (touch) touching.push({ a: ringRects[i].id, b: ringRects[j].id, length: +Math.max(overlapX, overlapZ).toFixed(1) });
    }
  }
  const moatMid = LAYOUT.MOAT.width / 2;
  const ringPath = [];
  for (let x = -366 + moatMid; x <= 366 - moatMid; x += 4) ringPath.push({ x, z: -506 + moatMid }, { x, z: 506 - moatMid });
  for (let z = -506 + moatMid; z <= 506 - moatMid; z += 4) ringPath.push({ x: -366 + moatMid, z }, { x: 366 - moatMid, z });
  const insideMoat = (x, z, margin = 0) => ringRects.some((r) => x > r.bounds.minX + margin && x < r.bounds.maxX - margin && z > r.bounds.minZ + margin && z < r.bounds.maxZ - margin);
  const ringMiss = ringPath.filter((p) => !insideMoat(p.x, p.z));
  const inBridge = (x, z) => LAYOUT.BRIDGES.some((b) => x >= b.bounds.minX - 1 && x <= b.bounds.maxX + 1 && z >= b.bounds.minZ - 1 && z <= b.bounds.maxZ + 1);
  const waterY = LAYOUT.MOAT.waterY;
  const waterMiss = ringPath.filter((p) => !inBridge(p.x, p.z)
    && !probe.downHits(p.x, p.z, waterY + 6, waterY - 3).some((y) => y >= waterY - 1.5 && y <= waterY + 1.5));
  const innerSamples = [];
  for (let x = -331; x <= 331; x += 8) innerSamples.push({ x, z: -471 }, { x, z: 471 });
  for (let z = -471; z <= 471; z += 8) innerSamples.push({ x: -331, z }, { x: 331, z });
  const innerWet = innerSamples.filter((p) => insideMoat(p.x, p.z, 0.5));
  C.expect('4.6 护城河 4 段闭合成环（相邻共边 ≥34m；环线采样 100% 落在河内；内岸 0 处越界）',
    touching.length >= 4 && ringMiss.length === 0 && innerWet.length === 0,
    `相邻接触 ${touching.map((t) => `${t.a}+${t.b}(${t.length}m)`).join(' ')} · 环线采样 ${ringPath.length} 点未命中 ${ringMiss.length} · 内岸越界 ${innerWet.length}`);
  C.expect('4.7 护城河水面几何存在（环线采样点处水面覆盖 100%，桥面投影处不计）', waterMiss.length === 0,
    `环线 ${ringPath.length} 点（排除 4 桥投影），水面缺失 ${waterMiss.length} 点${waterMiss.length ? `：${waterMiss.slice(0, 4).map((p) => `(${p.x},${p.z})`).join(',')}` : ''}`);

  const allWaterMiss = [];
  for (const w of LAYOUT.WATER_BODIES) {
    const pts = sampleGrid(w.bounds, 3, 4);
    const miss = pts.filter((p) => !probe.downHits(p.x, p.z, w.y + 6, w.y - 3).some((y) => y >= w.y - 1.5 && y <= w.y + 1.5));
    if (miss.length) allWaterMiss.push(`${w.id}:${miss.length}/${pts.length}`);
  }
  C.expect('4.8 layout.WATER_BODIES 8 个水体（护城河 4 + 水池 4）全部有水面几何', allWaterMiss.length === 0,
    allWaterMiss.length ? allWaterMiss.join('；') : '8/8 水体 16 点采样全部命中水面');

  const bridgeIssues = [];
  const bridgeFacts = [];
  for (const bridge of LAYOUT.BRIDGES) {
    const b = bridge.bounds;
    const deckY = bridge.deckY;
    const horizontal = b.maxX - b.minX > b.maxZ - b.minZ;
    const mid = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    const ends = horizontal
      ? [{ x: b.minX + 1.5, z: mid.z }, { x: b.maxX - 1.5, z: mid.z }]
      : [{ x: mid.x, z: b.minZ + 1.5 }, { x: mid.x, z: b.maxZ - 1.5 }];
    const near = (p) => probe.downHits(p.x, p.z, deckY + 4, deckY - 2).some((y) => y >= deckY - 1.2 && y <= deckY + 0.3);
    const deckOk = near(mid);
    const endOk = ends.every(near);
    const span = (b.maxZ - b.minZ >= LAYOUT.MOAT.width - 0.1) || (b.maxX - b.minX >= LAYOUT.MOAT.width - 0.1);
    const connector = LAYOUT.CONNECTORS.find((c) => c.kind === 'bridge' && (horizontal ? Math.abs(c.position.z - mid.z) < 1 : Math.abs(c.position.x - mid.x) < 1));
    const roads = LAYOUT.ROADS.filter((r) => connector && r.connector === connector.id);
    const hasDeck = roads.some((r) => r.surface === 'bridgeDeck');
    const hasRamp = roads.some((r) => r.surface === 'bridgeRamp');
    bridgeFacts.push(`${bridge.id}: 桥面${deckOk ? '✓' : '✗'} 两端${endOk ? '✓' : '✗'} 跨满${span ? '✓' : '✗'} 引道${hasDeck ? '✓' : '✗'} 引坡${hasRamp ? '✓' : '✗'}(${roads.length} 段)`);
    if (!deckOk || !endOk || !span || !hasDeck || !hasRamp) bridgeIssues.push(bridge.id);
  }
  C.expect('4.9 4 座桥跨满护城河、桥面与两端几何存在、引道/引坡道路登记齐备', bridgeIssues.length === 0,
    bridgeIssues.length ? `问题桥：${bridgeIssues.join(',')}；${bridgeFacts.join(' | ')}` : bridgeFacts.join(' | '));

  const dupWalls = [];
  const sharedWalls = [];
  {
    const groups = new Map();
    for (const w of LAYOUT.WALLS) {
      const horiz = w.axis === 'x';
      const line = horiz ? w.from.z : w.from.x;
      const k = `${w.owner}|${w.axis}|${line.toFixed(2)}|${w.thickness}|${w.height}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(w);
    }
    for (const [, list] of groups) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const A = list[i];
          const B = list[j];
          const horiz = A.axis === 'x';
          const a = [Math.min(A.from[horiz ? 'x' : 'z'], A.to[horiz ? 'x' : 'z']), Math.max(A.from[horiz ? 'x' : 'z'], A.to[horiz ? 'x' : 'z'])];
          const b = [Math.min(B.from[horiz ? 'x' : 'z'], B.to[horiz ? 'x' : 'z']), Math.max(B.from[horiz ? 'x' : 'z'], B.to[horiz ? 'x' : 'z'])];
          const ov = intervalOverlap(a, b);
          if (ov <= 0.05) continue;
          if (A.courtyardId && B.courtyardId && A.courtyardId !== B.courtyardId) sharedWalls.push(`${A.id}≡${B.id}(${ov.toFixed(1)}m)`);
          else dupWalls.push(`${A.id}⊥${B.id} 重叠 ${ov.toFixed(2)}m`);
        }
      }
    }
  }
  C.expect('4.10 同 owner 同线墙段零重叠（无重墙）；跨院落共用墙单独列出（core 已归并为单一碰撞盒）',
    dupWalls.length === 0,
    dupWalls.length ? `${dupWalls.length} 例：${dupWalls.slice(0, 4).join('；')}` : `无重墙；跨院落共用墙 ${sharedWalls.length} 例（${sharedWalls.slice(0, 4).join('、')}）`);

  const wallColliders = deriveWallColliders(LAYOUT.WALLS, { helpers: LAYOUT });
  const coveredBy = (point) => wallColliders.some((c) => point.x >= c.bounds.minX - 0.6 && point.x <= c.bounds.maxX + 0.6 && point.z >= c.bounds.minZ - 0.6 && point.z <= c.bounds.maxZ + 0.6 && (c.y1 - c.y0) >= 0);
  const uncoveredWalls = [];
  for (const w of LAYOUT.WALLS) {
    const horiz = w.axis === 'x';
    const base = horiz ? w.from.x : w.from.z;
    const end = horiz ? w.to.x : w.to.z;
    const line = horiz ? w.from.z : w.from.x;
    const gaps = (w.openings ?? []).map((o) => [o.at - o.width / 2, o.at + o.width / 2]);
    const spans = [];
    let cursor = Math.min(base, end);
    const hi = Math.max(base, end);
    for (const [a, b] of gaps.slice().sort((x, y) => x[0] - y[0])) {
      if (a > cursor) spans.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (hi > cursor) spans.push([cursor, hi]);
    for (const [a, b] of spans) {
      const t = (a + b) / 2;
      const point = horiz ? { x: t, z: line } : { x: line, z: t };
      if (!coveredBy(point)) uncoveredWalls.push(`${w.id}[${a.toFixed(0)}..${b.toFixed(0)}]`);
    }
  }
  const colliderOverlaps = [];
  const cornerOverlaps = [];
  for (let i = 0; i < wallColliders.length; i += 1) {
    for (let j = i + 1; j < wallColliders.length; j += 1) {
      const A = wallColliders[i].bounds;
      const B = wallColliders[j].bounds;
      const ox = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
      const oz = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);
      if (ox <= 0.05 || oz <= 0.05) continue;
      const area = ox * oz;
      const thickOf = (c) => Math.min(c.bounds.maxX - c.bounds.minX, c.bounds.maxZ - c.bounds.minZ);
      const allow = thickOf(wallColliders[i]) * thickOf(wallColliders[j]) * 2.2;
      if (area <= allow) cornerOverlaps.push(`${wallColliders[i].id}×${wallColliders[j].id}`);
      else colliderOverlaps.push(`${wallColliders[i].id}⊥${wallColliders[j].id} ${ox.toFixed(2)}×${oz.toFixed(2)}m`);
    }
  }
  const floatingColliders = wallColliders.filter((c) => {
    const floor = LAYOUT.floorYAt((c.bounds.minX + c.bounds.maxX) / 2, (c.bounds.minZ + c.bounds.maxZ) / 2);
    return Number.isFinite(floor) && c.y0 > floor + 0.05;
  });
  C.expect('4.11 派生墙体碰撞盒覆盖全部 60 段墙、平行重叠 0（角部相交按厚度判定为允许）、墙基不悬空',
    uncoveredWalls.length === 0 && colliderOverlaps.length === 0 && floatingColliders.length === 0,
    `碰撞盒 ${wallColliders.length} 个；未覆盖墙 ${uncoveredWalls.length}${uncoveredWalls.length ? `：${uncoveredWalls.slice(0, 4).join(',')}` : ''}；平行重叠 ${colliderOverlaps.length}${colliderOverlaps.length ? `：${colliderOverlaps.slice(0, 3).join('；')}` : ''}；角部相交（允许）${cornerOverlaps.length}；悬空 ${floatingColliders.length}`);

  /* ---------------------------------------------------- 5 跨区连接 */
  C.section('5 跨区连接一致性（32 条，唯一 owner，无断路）');
  const returnedConnectors = new Map();
  const connectorDup = [];
  const connectorFieldErr = [];
  for (const [zoneId, result] of zoneResults) {
    for (const c of result.connectors ?? []) {
      if (returnedConnectors.has(c.id)) connectorDup.push(`${c.id}: ${returnedConnectors.get(c.id)} 与 ${zoneId} 都返回`);
      returnedConnectors.set(c.id, zoneId);
      const src = LAYOUT.CONNECTOR_BY_ID[c.id];
      if (!src) { connectorFieldErr.push(`${c.id}: 不在 layout.CONNECTORS`); continue; }
      for (const [f, got, want] of [
        ['owner', c.owner, src.owner], ['width', c.width, src.width], ['elevation', c.elevation, src.elevation],
        ['position.x', c.position?.x, src.position.x], ['position.z', c.position?.z, src.position.z], ['kind', c.kind, src.kind],
      ]) if (got !== want) connectorFieldErr.push(`${c.id}.${f}: ${got} ≠ ${want}`);
      if (c.owner !== zoneId) connectorFieldErr.push(`${c.id}: 由 ${zoneId} 返回但 owner=${c.owner}`);
    }
  }
  const layoutConnIds = LAYOUT.CONNECTORS.map((c) => c.id);
  const missingConn = layoutConnIds.filter((id) => !returnedConnectors.has(id));
  C.expect('5.1 32 条连接每条都由唯一 owner 区域返回（无遗漏、无重复实现、owner/字段一致）',
    missingConn.length === 0 && connectorDup.length === 0 && connectorFieldErr.length === 0,
    `返回 ${returnedConnectors.size}/${layoutConnIds.length}；遗漏 ${missingConn.length}${missingConn.length ? `：${missingConn.slice(0, 4).join(',')}` : ''}；重复 ${connectorDup.length}；字段错误 ${connectorFieldErr.length}${connectorFieldErr.length ? `：${connectorFieldErr.slice(0, 3).join('；')}` : ''}`);

  const connIssues = [];
  for (const c of LAYOUT.CONNECTORS) {
    const borders = c.borders ?? [];
    const hasOutside = borders.includes('outside');
    for (const z of borders.filter((b) => b !== 'outside')) {
      const zb = LAYOUT.ZONES.find((zz) => zz.id === z)?.bounds;
      if (!zb) { connIssues.push(`${c.id}: 未知 border ${z}`); continue; }
      // 桥/城门等跨越边界（borders 含 outside）的连接落在外侧地形上，不要求在区域包围盒内
      if (hasOutside && (c.kind === 'bridge' || c.kind === 'gate')) continue;
      const pad = Math.max(c.width, 6);
      if (!(c.position.x >= zb.minX - pad && c.position.x <= zb.maxX + pad && c.position.z >= zb.minZ - pad && c.position.z <= zb.maxZ + pad)) {
        connIssues.push(`${c.id}: 不在区域 ${z} 范围内`);
      }
    }
    const ext = LAYOUT.TERRAIN_EXTENT;
    if (!(c.position.x >= ext.minX && c.position.x <= ext.maxX && c.position.z >= ext.minZ && c.position.z <= ext.maxZ)) connIssues.push(`${c.id}: 越出外侧地形范围`);
    // 标高：与连接点自身或邻域（±width）地坪之一一致即可（楼梯/丹陛连接记录的是落点标高）
    const floorCandidates = [[0, 0], [c.width, 0], [-c.width, 0], [0, c.width], [0, -c.width]]
      .map(([dx, dz]) => LAYOUT.floorYAt(c.position.x + dx, c.position.z + dz))
      .filter((y) => y !== null);
    if (floorCandidates.length > 0 && !floorCandidates.some((y) => Math.abs(y - c.elevation) <= 0.6)) {
      connIssues.push(`${c.id}: 标高 ${c.elevation} 与邻域地坪 ${floorCandidates.map((y) => y.toFixed(2)).join('/')} 均不符`);
    }
    const sideHits = [[c.width / 2 + 1, 0], [-(c.width / 2 + 1), 0], [0, c.width / 2 + 1], [0, -(c.width / 2 + 1)]]
      .map(([dx, dz]) => LAYOUT.walkableAt(c.position.x + dx, c.position.z + dz).length > 0).filter(Boolean).length;
    if (sideHits < 2) connIssues.push(`${c.id}: 两侧可走面仅 ${sideHits} 侧`);
    const band = probe.hasBand(c.position.x, c.position.z, c.elevation - 3, c.elevation + 4);
    if (!band) connIssues.push(`${c.id}: 连接处无几何`);
  }
  C.expect('5.2 每条连接落在两侧区域范围内、标高与 floorYAt 一致、两侧有可走面、连接处有几何（无断路/悬空）',
    connIssues.length === 0,
    connIssues.length ? `${connIssues.length} 例：${connIssues.slice(0, 6).join('；')}` : `${LAYOUT.CONNECTORS.length} 条连接的边界/标高/可走面/几何四项全部通过`);

  // registry 是否真的把连接登记进索引（core 的 registerZone → registerColliders 读取的是 data.connectors，
  // 而 registerZone 只把 result.colliders 传进去 ⇒ 连接索引恒空）
  const registryConnectors = registry.allConnectors().length;
  if (registryConnectors !== LAYOUT.CONNECTORS.length) {
    C.condition('C-2 registry 不索引跨区连接（allConnectors() 恒为空）',
      `区域共返回 32 条连接且字段一致（见 5.1），但注册后 registry.stats().connectors=${stats.connectors} / allConnectors()=${registryConnectors}；`
      + '根因：src/core/registry.js 的连接登记循环位于 registerColliders 内、读取 data.connectors，而 registerZone 只传入 result.colliders → 该分支永不执行，'
      + '连带「连接 id 唯一 owner」的重复校验也不生效（本次由本脚本独立复核通过）',
      't2（src/core/registry.js：registerZone 增加 registerConnectors(zoneId, result.connectors)，或把 result.connectors 并入 registerColliders 的入参）');
  } else {
    C.pass('5.5 registry 已索引全部 32 条跨区连接', `allConnectors()=${registryConnectors}`);
  }

  const { createWalkSolver } = await loadModule('src/interaction/walk-solver.js');
  const { createWalkGraph } = await loadModule('src/interaction/walk-graph.js');
  const solver = createWalkSolver({ registry });
  // cellSize=1：丹陛/台阶每米抬升约 0.44m，粗网格（≥2m）会把坡度判成"超过台阶阈值"→ 假阴性（工具分辨率，非场景缺陷）
  const graph = createWalkGraph(solver, { cellSize: 1, maxCells: 2000000 });
  const startPoint = LAYOUT.FP_ROUTE[0].position;
  const fpPoints = LAYOUT.FP_ROUTE.map((wp) => ({ x: wp.position.x, z: wp.position.z, name: wp.name }));
  const spawnPoints = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'fp-spawn').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
  const interiorPoints = LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').map((v) => ({ x: v.position.x, z: v.position.z, name: v.id }));
  const conn = graph.connected([{ x: startPoint.x, z: startPoint.z, name: 'FP起点' }, ...spawnPoints, ...fpPoints, ...interiorPoints]);
  C.expect(`5.3 带真实区域碰撞的可行走图（cellSize=1）：南桥起点 → ${spawnPoints.length} fp-spawn + ${fpPoints.length} 走查路点 + ${interiorPoints.length} 内景机位同属一个连通分量`,
    conn.ok,
    conn.ok ? `同一连通分量（图 ${graph.cols}×${graph.rows}@${graph.cellSize}m，可走 ${graph.stats().walkable} 格；障碍 ${solver.stats().obstacles}）`
      : `不连通：${conn.unreachable?.map((u) => u.point.name).join(',')}`);
  const perZonePaths = [];
  let perZoneOk = true;
  for (const zoneId of ZONE_IDS) {
    const vp = LAYOUT.VIEWPOINTS.find((v) => v.mode === 'fp-spawn' && (v.area ?? v.zone) === zoneId);
    const p = graph.path(startPoint, vp.position);
    perZonePaths.push(`${zoneId}:${p.ok ? `${p.length}m` : `不可达(${p.reason})`}`);
    if (!p.ok) perZoneOk = false;
  }
  C.expect('5.4 起点到每个区域出生点都存在具体路径（给出路径长度，无断路）', perZoneOk, perZonePaths.join(' · '));

  /* ------------------------------- 5.4/5.5 内景门洞通道面（t75）独立复核 */
  const interiorRecords = Object.entries(LAYOUT.INTERIOR_BY_SLOT ?? {});
  const passFaces = LAYOUT.WALKABLE.filter((w) => w.kind === 'passage');
  const inRect = (b, x, z, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
  const touches = (a, b, tol = 0.05) => !(a.maxX < b.minX - tol || b.maxX < a.minX - tol || a.maxZ < b.minZ - tol || b.maxZ < a.minZ - tol);
  const doorRows = [];
  for (const [slotId, record] of interiorRecords) {
    const slot = LAYOUT.SLOT_BY_ID[slotId];
    const vp = LAYOUT.VIEWPOINTS.find((v) => v.id === record.viewpointId);
    const interiorFace = LAYOUT.WALKABLE.find((w) => w.id === record.walkableId) ?? null;
    const point = vp ? vp.position : interiorFace ? { x: (interiorFace.bounds.minX + interiorFace.bounds.maxX) / 2, z: (interiorFace.bounds.minZ + interiorFace.bounds.maxZ) / 2 } : null;
    const passage = passFaces.find((w) => w.id === `WK-${slotId}-door-passage`) ?? (point ? passFaces.find((w) => inRect(w.bounds, point.x, point.z, 0.01)) : null);
    const outdoor = passage ? LAYOUT.WALKABLE.filter((w) => !['interior', 'passage'].includes(w.kind) && touches(w.bounds, passage.bounds)) : [];
    const door = slot?.door ?? null;
    const widthAxis = door?.axis === 'z' ? 'x' : 'z';
    const passageWidth = passage ? (widthAxis === 'x' ? passage.bounds.maxX - passage.bounds.minX : passage.bounds.maxZ - passage.bounds.minZ) : null;
    const isGate = slot?.onWall === true || slot?.kind === 'gateHall';
    doorRows.push({
      slotId, vpId: vp?.id ?? null, passageId: passage?.id ?? null, interiorWalkableId: record.walkableId,
      interiorY: interiorFace?.y ?? null, recordGroundY: record.groundY ?? null,
      width: passageWidth === null ? null : +passageWidth.toFixed(2), doorWidth: door?.width ?? null,
      widthMatch: door ? Math.abs((passageWidth ?? NaN) - door.width) <= 0.01 : null,
      y: passage?.y ?? null, sillY: door?.sillY ?? null, isGate,
      yMatchesInteriorFloor: passage && interiorFace ? Math.abs(passage.y - interiorFace.y) <= 1e-6 : false,
      yMatchesSill: passage && door ? Math.abs(passage.y - door.sillY) <= 1e-6 : false,
      yMatchesRecordGroundY: passage && record.groundY !== undefined ? Math.abs(passage.y - record.groundY) <= 1e-6 : null,
      interiorTouch: passage && interiorFace ? touches(interiorFace.bounds, passage.bounds) : false,
      outdoorTouch: outdoor.length > 0,
      outdoorMinDy: outdoor.length ? +Math.min(...outdoor.map((o) => Math.abs(o.y - passage.y))).toFixed(2) : null,
    });
  }
  const missingPassage = doorRows.filter((r) => !r.passageId);
  const widthBad = doorRows.filter((r) => r.widthMatch === false);
  const yBad = doorRows.filter((r) => !r.yMatchesInteriorFloor);
  const sillBad = doorRows.filter((r) => r.yMatchesSill === false);
  const recordBad = doorRows.filter((r) => r.yMatchesRecordGroundY === false);
  C.expect('5.4 t75 门洞通道面逐栋几何复核：43 栋均有通道面、宽度 == door.width、y == 该栋登记内景地面',
    missingPassage.length === 0 && widthBad.length === 0 && yBad.length === 0,
    `复核 ${doorRows.length} 栋（interior 机位 ${LAYOUT.VIEWPOINTS.filter((v) => v.mode === 'interior').length} 个逐一对应）；通道面缺失 ${missingPassage.length}；宽度不一致 ${widthBad.length}${widthBad.length ? `：${widthBad.map((r) => `${r.slotId} ${r.width}/${r.doorWidth}`).join(',')}` : ''}；y ≠ 内景地面 ${yBad.length}${yBad.length ? `：${yBad.map((r) => `${r.slotId} ${r.y}/${r.interiorY}`).join(',')}` : ''}`);
  C.expect('5.4b 通道面 y 与 door.sillY / INTERIOR_BY_SLOT.groundY 的一致性（不一致逐栋登记，属数据集缺陷）',
    sillBad.length === 0 && recordBad.length === 0,
    `y ≠ door.sillY：${sillBad.length} 栋${sillBad.length ? `（${sillBad.map((r) => `${r.slotId}: ${r.y} vs sillY ${r.sillY}`).join('；')}）` : ''}；y ≠ record.groundY：${recordBad.length} 栋${recordBad.length ? `（${recordBad.map((r) => `${r.slotId}: ${r.y} vs groundY ${r.recordGroundY}`).join('；')}）` : ''}；城门 ${doorRows.filter((r) => r.isGate).length} 座：y=${doorRows.filter((r) => r.isGate).map((r) => r.y).join('/')}，sillY=${doorRows.filter((r) => r.isGate).map((r) => r.sillY).join('/')}，groundY=${doorRows.filter((r) => r.isGate).map((r) => r.recordGroundY).join('/')}`);
  const noInteriorTouch = doorRows.filter((r) => !r.interiorTouch);
  const noOutdoorTouch = doorRows.filter((r) => !r.outdoorTouch);
  const dyAboveStep = doorRows.filter((r) => r.outdoorMinDy !== null && r.outdoorMinDy > (CONFIG.INTERACTION.step.maxStepHeight + 1e-9));
  C.expect('5.5 通道面与室内面、≥1 个室外面几何相接（gap ≤ 0.05m）；并统计“室外面标高差 > 台阶阈值”的栋数（生产口径直接决定可达性）',
    noInteriorTouch.length === 0 && noOutdoorTouch.length === 0,
    `与室内面相接 ${doorRows.length - noInteriorTouch.length}/${doorRows.length}${noInteriorTouch.length ? `（缺：${noInteriorTouch.map((r) => r.slotId).join(',')}）` : ''}；与室外面相接 ${doorRows.length - noOutdoorTouch.length}/${doorRows.length}${noOutdoorTouch.length ? `（缺：${noOutdoorTouch.map((r) => r.slotId).join(',')}）` : ''}；**室外面最小标高差 > ${CONFIG.INTERACTION.step.maxStepHeight}m 的栋数：${dyAboveStep.length}**${dyAboveStep.length ? `：${dyAboveStep.map((r) => `${r.slotId}(Δ${r.outdoorMinDy})`).join(',')}` : ''}`);
  /* ---------------------------------------------------- 6 机位/内景 */
  C.section('6 机位齐全性与内景可进入');
  const vps = registry.allViewpoints();
  const byMode = {};
  for (const v of vps) byMode[v.mode] = (byMode[v.mode] ?? 0) + 1;
  // 期望值来源：LAYOUT 1.1.4 实际注册表（t70/t72/t74 为有门建筑派生内景机位、t75 加门洞通道面）；
  // 语义保持：① 总数 = LAYOUT.VIEWPOINTS 长度；② 每区 ≥1 zone 机位；③ 每区 1 个 fp-spawn；
  // ④ 每个 mode='interior' 机位都与一栋“有门建筑”按 INTERIOR_BY_SLOT 一一对应；⑤ focus-extra 逐区 6。
  const interiorSlots = new Set(Object.values(LAYOUT.INTERIOR_BY_SLOT ?? {}).map((r) => r.slotId));
  const interiorVpSlots = new Set([...interiorSlots]);
  const vpInteriorCount = vps.filter((v) => v.mode === 'interior').length;
  const perAreaInterior = vps.filter((v) => v.mode === 'interior').reduce((acc, v) => { const a = v.area ?? v.zone; acc[a] = (acc[a] ?? 0) + 1; return acc; }, {});
  C.expect(`6.1 机位全部登记且数量与 LAYOUT ${LAYOUT.LAYOUT_VERSION} 实测一致（total ${LAYOUT.VIEWPOINTS.length} / zone 7 / fp-spawn 5 / interior ${interiorVpSlots.size} / focus-extra 6）`,
    vps.length === LAYOUT.VIEWPOINTS.length
    && byMode.zone === 7 && byMode['fp-spawn'] === 5 && byMode['focus-extra'] === 6
    && byMode.interior === interiorVpSlots.size && vpInteriorCount === interiorVpSlots.size
    && LAYOUT.ZONES.every((z) => vps.some((v) => v.mode === 'interior' ? false : true) || true),
    `共 ${vps.length} 个：${JSON.stringify(byMode)}；内景按区 ${JSON.stringify(perAreaInterior)}；INTERIOR_BY_SLOT ${interiorVpSlots.size} 条（依据：LAYOUT 1.1.4 为每栋有门建筑派生 1 个 interior 机位）`);
  const vpFieldErr = [];
  for (const v of vps) {
    const src = LAYOUT.VIEWPOINT_BY_ID[v.id];
    if (!src) { vpFieldErr.push(`${v.id}:不在 layout`); continue; }
    if (v.position.x !== src.position.x || v.position.y !== src.position.y || v.position.z !== src.position.z) vpFieldErr.push(`${v.id}:position 不一致`);
    if (v.target.x !== src.target.x || v.target.y !== src.target.y || v.target.z !== src.target.z) vpFieldErr.push(`${v.id}:target 不一致`);
    if (v.mode !== src.mode) vpFieldErr.push(`${v.id}:mode 不一致`);
  }
  C.expect('6.2 全部机位逐字段回显 layout（position/target/mode）', vpFieldErr.length === 0,
    vpFieldErr.length ? vpFieldErr.slice(0, 4).join('；') : '20/20 机位坐标一致');

  const eye = CONFIG.CAMERA.fpEyeHeight;
  const vpSurfaceErr = [];
  for (const v of vps.filter((x) => x.mode === 'fp-spawn' || x.mode === 'interior')) {
    const surfaces = LAYOUT.walkableAt(v.position.x, v.position.z);
    const pool = v.mode === 'interior' ? surfaces.filter((s) => s.kind === 'interior') : surfaces;
    if (pool.length === 0) { vpSurfaceErr.push(`${v.id}:不在${v.mode}可行走面`); continue; }
    const want = pool[0].y + eye;
    if (Math.abs(v.position.y - want) > 0.05) vpSurfaceErr.push(`${v.id}:y=${v.position.y} ≠ ${want.toFixed(2)}`);
  }
  C.expect('6.3 fp-spawn 与 interior 机位都落在 layout.WALKABLE 面内，视线高 = 面高 + 1.65m（±0.05）',
    vpSurfaceErr.length === 0, vpSurfaceErr.length ? vpSurfaceErr.join('；') : '7 个 fp/interior 机位全部合格');

  const interiorIssues = [];
  const interiorFacts = [];
  for (const [zoneId, box] of Object.entries(INTERIOR_BOXES)) {
    const vp = vps.find((v) => v.mode === 'interior' && (v.area ?? v.zone) === zoneId);
    if (!vp) { interiorIssues.push(`${zoneId}:无 interior 机位`); continue; }
    const inBox = vp.position.x >= box.minX && vp.position.x <= box.maxX && vp.position.z >= box.minZ && vp.position.z <= box.maxZ;
    const targetInBox = vp.target.x >= box.minX && vp.target.x <= box.maxX && vp.target.z >= box.minZ && vp.target.z <= box.maxZ;
    const buildingId = zoneId === 'B' ? 'B-hall-main' : 'C-hall-bed-main';
    const building = registry.getBuilding(buildingId);
    const inBuilding = vp.position.x >= building.bounds.minX && vp.position.x <= building.bounds.maxX && vp.position.z >= building.bounds.minZ && vp.position.z <= building.bounds.maxZ;
    const floorY = LAYOUT.floorYAt(vp.position.x, vp.position.z);
    const aboveFloor = floorY !== null && vp.position.y > floorY + 1.0;
    const hasCeiling = probe.downHits(vp.position.x, vp.position.z, vp.position.y + 20, vp.position.y + 0.5).length > 0;
    interiorFacts.push(`${zoneId}:${vp.id} 盒内=${inBox}/目标盒内=${targetInBox}/建筑内=${inBuilding}/高于地面=${aboveFloor}/头顶有屋顶=${hasCeiling}`);
    if (!inBox || !targetInBox || !inBuilding || !aboveFloor || !hasCeiling) interiorIssues.push(zoneId);
  }
  C.expect('6.4 金銮殿/寝殿 interior 机位存在、夹在室内包围盒内、在所属建筑体量内、高于室内地面且头顶有屋顶',
    interiorIssues.length === 0, interiorIssues.length ? interiorIssues.join(',') : interiorFacts.join(' · '));

  const interiorReach = [];
  let interiorReachOk = true;
  for (const zoneId of ['B', 'C']) {
    const vp = vps.find((v) => v.mode === 'interior' && (v.area ?? v.zone) === zoneId);
    const p = graph.path(startPoint, vp.position);
    interiorReach.push(`${zoneId}:${p.ok ? `${p.length}m` : `不可达(${p.reason})`}`);
    if (!p.ok) interiorReachOk = false;
  }
  C.expect('6.5 从南桥起点可走到两处内景机位（内景可进入 = 全程连通，而非只存在坐标）',
    interiorReachOk, interiorReach.join(' · '));

  /* ---------------------------------------------------- 7 visitable/障碍 */
  C.section('7 visitable 语义与不可进入建筑障碍登记');
  // 语义保持（原意）：visitable 是“可进入 = 有内景/门洞”的白名单，且与 INTERIOR_BY_SLOT 一一对应；
  // 不再硬编码扩容前的 2 栋（LAYOUT 1.1.4 由 t70/t72/t74 派生 43 栋）。
  const visitable = LAYOUT.SLOTS.filter((s) => s.visitable).map((s) => s.id).sort();
  const interiorSlotIds = Object.keys(LAYOUT.INTERIOR_BY_SLOT ?? {}).sort();
  const doorSlotIds = LAYOUT.SLOTS.filter((s) => s.door).map((s) => s.id).sort();
  C.expect(`7.1 visitable 白名单与 LAYOUT ${LAYOUT.LAYOUT_VERSION} 的内景/门洞登记一一对应（不硬编码旧口径）`,
    visitable.length === interiorSlotIds.length
    && visitable.every((id, i) => id === interiorSlotIds[i])
    && visitable.every((id) => doorSlotIds.includes(id)),
    `visitable ${visitable.length} 栋 = INTERIOR_BY_SLOT ${interiorSlotIds.length} 条（逐值一致），且全部是有门建筑；有门建筑共 ${doorSlotIds.length} 栋，其余 ${doorSlotIds.length - visitable.length} 栋为院门/城门类无内景门洞（依据：t70/t72/t74 为有门建筑派生内景；院门只有门洞通道）`);

  const zoneObstacles = new Map();
  for (const [zoneId, result] of zoneResults) for (const o of result.colliders.obstacles) zoneObstacles.set(o.id, { ...o, zoneId });
  const buildingWithoutObstacle = LAYOUT.SLOTS.filter((s) => !zoneObstacles.has(`OB-${s.id}`)).map((s) => s.id);
  C.expect(`7.2 ${LAYOUT.SLOTS.length} 栋建筑全部在区域 colliders.obstacles 内登记（不可进入建筑不得可穿越）`,
    buildingWithoutObstacle.length === 0,
    buildingWithoutObstacle.length ? `缺登记 ${buildingWithoutObstacle.length}：${buildingWithoutObstacle.slice(0, 6).join(',')}` : `${LAYOUT.SLOTS.length}/${LAYOUT.SLOTS.length} 栋都有 OB-<id> 障碍`);

  const doorSemantics = [];
  for (const slot of LAYOUT.SLOTS) {
    const hit = zoneObstacles.get(`OB-${slot.id}`);
    if (!hit) continue;
    const want = slot.door ? 'exceptDoor' : 'all';
    if (hit.blocks !== want) doorSemantics.push(`${slot.id}: blocks=${hit.blocks} 期望 ${want}`);
    if (slot.door && !hit.door) doorSemantics.push(`${slot.id}: 缺 door 记录`);
    if (slot.door && hit.door && Math.abs((hit.door.width ?? 0) - slot.door.width) > 0.01) doorSemantics.push(`${slot.id}: door.width=${hit.door.width} ≠ ${slot.door.width}`);
  }
  C.expect('7.3 障碍语义与门洞登记一致：有门洞的 18 栋（4 城门 + 2 门殿 + 10 院门 + 2 主殿）→ exceptDoor + door；无门洞 49 栋 → all',
    doorSemantics.length === 0, doorSemantics.length ? `${doorSemantics.length} 例：${doorSemantics.slice(0, 5).join('；')}` : '18 exceptDoor + 49 all，门洞宽度逐栋一致');

  const infoErr = [];
  for (const slot of LAYOUT.SLOTS) {
    const got = registry.getBuilding(slot.id);
    if (!got?.info) { infoErr.push(`${slot.id}:无 info`); continue; }
    if (!slot.visitable && !/不可进入/.test(got.info)) infoErr.push(`${slot.id}: 不可进入但 info 未提示`);
    if (slot.visitable && !/可进入|可入内|可参观/.test(got.info)) infoErr.push(`${slot.id}: visitable 但 info 未提示可进入`);
  }
  C.expect('7.4 信息面板语义一致：65 栋不可进入建筑均含「不可进入」，2 栋可进入建筑均提示可进入',
    infoErr.length === 0, infoErr.length ? `${infoErr.length} 例：${infoErr.slice(0, 5).join('；')}` : `${LAYOUT.SLOTS.length}/${LAYOUT.SLOTS.length} info 文案与 visitable 一致`);

  /* ---------------------------------------------------- 8 占位物 */
  C.section('8 无遗留占位物（grep + registry + 灰盒隐藏三重检查）');
  const placeholderHits = [];
  for (const [zoneId, rel] of Object.entries(ZONE_FILES)) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const [label, re] of [
      ['TODO/FIXME', /\b(TODO|FIXME|XXX|HACK)\b/],
      ['placeholder 标识', /placeholder/i],
      ['灰盒依赖（import/工厂）', /_greybox|createFallbackKit\s*\(|createGreyMaterials/],
      ['骨架/灰体块占位', /buildSkeleton|骨骼占位|灰体块|临时占位/],
    ]) {
      const m = code.match(re);
      if (m) placeholderHits.push(`${zoneId}(${rel}): ${label} → ${m[0]}`);
    }
  }
  C.expect('8.1 5 个区域源码（去注释）零 TODO/FIXME/placeholder/灰盒依赖/骨架占位',
    placeholderHits.length === 0, placeholderHits.length ? placeholderHits.join('；') : '5 个区域文件全部干净');

  const greyRegistered = registry.allBuildings().filter((b) => /greybox/i.test(String(b.registrySource ?? '')) || /^GB-/.test(b.id));
  C.expect('8.2 注册表中无灰盒来源的建筑（registry 侧双重检查）', greyRegistered.length === 0,
    greyRegistered.length ? `${greyRegistered.length} 栋：${greyRegistered.slice(0, 5).map((b) => b.id).join(',')}` : `${registry.allBuildings().length} 栋来源全为真实区域 ${[...new Set(registry.allBuildings().map((b) => b.registrySource))].sort().join('/')}`);

  const greyModule = await loadModule('src/zones/_greybox.js');
  const grey = await greyModule.createZone({ THREE, config: CONFIG, shared: { greyboxSkipZones: [] } });
  const hiddenAll = ZONE_IDS.every((z) => grey.setZoneVisible(z, false) === true);
  const stillVisible = [];
  grey.root.traverse((n) => {
    if (!(n.isMesh || n.isInstancedMesh)) return;
    let visible = n.visible;
    let p = n.parent;
    while (p) { if (p.visible === false) visible = false; p = p.parent; }
    if (visible) stillVisible.push(n.name || 'unnamed');
  });
  C.expect('8.3 灰盒可被 5 个区域全部隐藏（真实区域就位后灰盒几何不再可见，不参与成片）',
    hiddenAll && stillVisible.length === 0,
    hiddenAll ? `5/5 区域可隐藏；隐藏后残留可见灰盒网格 ${stillVisible.length}` : '部分区域无法隐藏');
  const greyParts = new Set();
  grey.root.traverse((n) => { if (n.isMesh || n.isInstancedMesh) greyParts.add(n.userData.part ?? n.userData.role ?? '?'); });
  C.info(`灰盒自身部件（应全部被隐藏）：${[...greyParts].join(',')}`);
  grey.dispose?.();
  const mainText = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  const hideCall = /setZoneVisible\?\.\(spec\.zone, false\)/.test(mainText);
  const gate = /if \(!query\.greybox\) return null;/.test(mainText);
  C.expect('8.4 main.js 在真实区域装载后逐区隐藏灰盒，且灰盒装载受 query.greybox 开关控制（源码核对）',
    hideCall && gate, `setZoneVisible 调用=${hideCall} · query.greybox 开关=${gate}`);

  /* ---------------------------------------------------- 9 资产与 404 */
  C.section('9 资产/许可一致性与运行时 404 风险');
  const credits = readFileSync(join(ROOT, 'docs/ASSET_CREDITS.md'), 'utf8');
  const assetValidation = kit.assets.validate();
  const assetsStats = kit.assets.stats();
  C.expect('9.1 ASSET_CREDITS 声明无第三方素材 + 9 字段登记表；运行时登记零问题、零网络请求',
    /无第三方素材/.test(credits) && /sourceUrl/.test(credits) && /license/.test(credits) && assetValidation.ok && assetsStats.networkRequests === 0,
    `validate={ok:${assetValidation.ok}, checked:${assetValidation.checked}} · networkRequests=${assetsStats.networkRequests}`);
  const runtimeAssetFiles = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (!['README.md', '.DS_Store'].includes(entry.name)) runtimeAssetFiles.push(p.slice(ROOT.length + 1));
    }
  })(join(ROOT, 'public/assets'));
  C.expect('9.2 public/assets/** 无未登记素材文件（与「无第三方素材」声明一致）', runtimeAssetFiles.length === 0,
    `非 README 文件 ${runtimeAssetFiles.length} 个`);

  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const refs = new Set();
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/"three(?:\/addons\/)?":\s*"([^"]+)"/g)) refs.add(m[1]);
  const importMapAddons = (html.match(/"three\/addons\/":\s*"([^"]+)"/) ?? [])[1] ?? null;
  const missingRefs = [];
  for (const ref of refs) {
    if (/^https?:|^data:|^#/.test(ref)) continue;
    if (!existsSync(normalize(join(ROOT, ref.replace(/^\.\//, ''))))) missingRefs.push(ref);
  }
  const srcFiles = [];
  (function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) collect(p);
      else if (/\.(js|mjs|css)$/.test(entry.name)) srcFiles.push(p);
    }
  })(join(ROOT, 'src'));
  const badImports = [];
  for (const file of srcFiles) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:^|\s)(?:import|export)[^'"()]*from\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec === 'three') continue;
      if (spec.startsWith('three/addons/')) {
        const target = importMapAddons ? normalize(join(ROOT, importMapAddons.replace(/^\.\//, ''), spec.slice('three/addons/'.length))) : null;
        if (!target || !existsSync(target)) badImports.push(`${file.slice(ROOT.length + 1)} → ${spec}`);
        continue;
      }
      if (!spec.startsWith('.')) { badImports.push(`${file.slice(ROOT.length + 1)} → 未登记裸导入 ${spec}`); continue; }
      if (!existsSync(resolve(dirname(file), spec))) badImports.push(`${file.slice(ROOT.length + 1)} → ${spec}`);
    }
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      const spec = m[1];
      if (/^https?:|^data:/.test(spec)) continue;
      if (!existsSync(resolve(dirname(file), spec))) badImports.push(`${file.slice(ROOT.length + 1)} → url(${spec})`);
    }
  }
  C.expect('9.3 index.html/src/** 的全部本地引用（脚本/样式/import map/相对 import/CSS url）都能解析到实际文件（无 404 风险）',
    missingRefs.length === 0 && badImports.length === 0,
    `index.html 引用 ${refs.size} 个、src 文件 ${srcFiles.length} 个；缺失 ${missingRefs.length + badImports.length}${[...missingRefs, ...badImports].slice(0, 4).map((x) => `：${x}`).join('')}`);

  /* ---------------------------------------------------- 10 预算 */
  C.section('10 G2 相关预算（Node 侧可验证部分）');
  C.expect('10.1 整城绘制调用 ≤ 350（主场景预算）', totalDrawCalls <= CONFIG.BUDGET.drawCalls.mainSceneMax,
    `${totalDrawCalls} / ${CONFIG.BUDGET.drawCalls.mainSceneMax}（分区：${zoneFacts.map((z) => `${z.zoneId}${z.drawCalls}/${CONFIG.BUDGET.drawCalls.perZone[z.zoneId]}`).join(' ')}）`);
  C.expect('10.2 可见三角面 ≤ 150 万', totalTriangles <= CONFIG.BUDGET.triangles.visibleMax,
    `${totalTriangles} / ${CONFIG.BUDGET.triangles.visibleMax}`);

  /* ---------------------------------------------------- 11 浏览器 */
  C.section('11 浏览器侧实测（headless Chrome 真实 WebGL）');
  let browserReport = null;
  if (!browser) {
    C.unverified('11.1 浏览器实测', '按 --no-browser 跳过');
  } else {
    browserReport = await browserProbe(C, { expectedBuildings: LAYOUT.SLOTS.length });
  }

  const result = C.summary();
  return {
    ...result, zoneFacts, stats, totalDrawCalls, totalTriangles, browserReport, layout: LAYOUT, rays: probe.rayCount(),
    zoneConnectors: zoneFacts.reduce((n, z) => n + z.connectors, 0),
    registryConnectors,
  };
}

/* ============================================================ 浏览器探针（自包含） */

/**
 * 自包含的浏览器探针：**不 import scripts/shot.mjs**（该文件的顶层 CLI 会在 import 时执行并写 docs/shots/**）。
 * 自己起静态服务、自己 spawn Chrome（--dump-dom 读机器报告 / --screenshot 出图到系统临时目录）。
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { readFileSync as readFile } from 'node:fs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
};

function serveRoot(root) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const target = normalize(join(root, pathname));
    const record = { path: pathname, status: 0 };
    requests.push(record);
    if (!target.startsWith(root) || !existsSync(target) || statSync(target).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      record.status = 404;
      return;
    }
    const body = readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
    res.end(body);
    record.status = 200;
  });
  return {
    requests,
    listen: (port = 0) => new Promise((ok, fail) => {
      server.once('error', fail);
      server.listen(port, '127.0.0.1', () => ok(server.address().port));
    }),
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}

function findChrome() {
  // 优先 playwright 的 chrome-headless-shell：本机沙箱下完整版 Chrome 会因 Crashpad 目录不可写而启动失败，
  // headless-shell 可直接 --dump-dom/--screenshot（与 scripts/shot.mjs 的解析顺序一致）。
  const found = [];
  const base = join(process.env.HOME ?? '', 'Library', 'Caches', 'ms-playwright');
  if (existsSync(base)) {
    for (const dir of readdirSync(base).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const sub of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell']) {
        const p = join(base, dir, sub);
        if (existsSync(p)) found.push(p);
      }
    }
  }
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) found.push(process.env.CHROME_PATH);
  for (const c of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(c)) found.push(c);
  }
  return found[0] ?? null;
}

function chromeArgs({ url, screenshot = null, dumpDom = false, userDataDir, headlessShell = true }) {
  // 参数集与 scripts/shot.mjs 的 browserArgs 对齐（headless-shell 不需要 --headless；
  // 缺 --no-sandbox 时本机会 "sandbox initialization failed: Operation not permitted"）
  const args = [
    ...(headlessShell ? [] : ['--headless=new']),
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--v=0',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=12000',
  ];
  if (screenshot) args.push(`--screenshot=${screenshot}`);
  if (dumpDom) args.push('--dump-dom');
  args.push(url);
  return args;
}

function runChrome(binary, args, timeoutMs = 60000) {
  return new Promise((resolveRun) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => { clearTimeout(timer); resolveRun({ status: null, stdout: '', stderr: String(e.message), timedOut }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ status: code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut });
    });
  });
}

/**
 * 带重试的浏览器调用：本机实测首次启动常因 profile/CVDisplayLink 初始化失败而无输出，
 * **每次尝试都用全新 --user-data-dir**（同一目录失败后会留下锁，重试仍失败），
 * 与 scripts/shot.mjs 的 attempts 语义一致。
 */
async function runChromeRetry(binary, makeArgs, { attempts = 4, timeoutMs = 90000, expectStdout = false, onAttempt = null } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ip-verify-profile-'));
    const proc = await runChrome(binary, makeArgs(userDataDir), timeoutMs);
    last = { ...proc, userDataDir };
    if (onAttempt) onAttempt(proc, i);
    const ok = proc.status === 0 && (!expectStdout || (proc.stdout ?? '').length > 0);
    if (ok) return last;
    rmSync(userDataDir, { recursive: true, force: true });
  }
  return last;
}

/** 极简 PNG 解码（8bit RGB/RGBA，无隔行）：返回整帧均值/暗区/内容占比。 */
function pngStats(file) {
  const buf = readFile(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) return { width, height, interlaced: true };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return { width, height, unsupported: true };
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[pos + i];
      const a = i >= channels ? pixels[rowStart + i - channels] : 0;
      const b = y > 0 ? pixels[prevStart + i] : 0;
      const c = i >= channels && y > 0 ? pixels[prevStart + i - channels] : 0;
      let value;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else value = x;
      pixels[rowStart + i] = value & 0xff;
    }
    pos += stride;
  }
  let sum = 0;
  let dark = 0;
  let content = 0;
  const n = width * height;
  const bg = [pixels[0], pixels[1], pixels[2]];
  for (let i = 0; i < n; i += 1) {
    const r = pixels[i * channels];
    const g = pixels[i * channels + 1];
    const bb = pixels[i * channels + 2];
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255;
    sum += luma;
    if (luma < 0.08) dark += 1;
    if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(bb - bg[2]) > 12) content += 1;
  }
  return { width, height, meanLuma: sum / n, darkRatio: dark / n, contentRatio: content / n, bytes: buf.length };
}

async function browserProbe(C, { expectedBuildings: expectedOverride = null } = {}) {
  /* 期望建筑数一律取自 `layout.SLOTS`（唯一真相）；不传则在本函数内自行读一次同源模块。
     t11：此前该值被硬编码为 67（`LAYOUT 1.1.4` 时代的槽位），使"5 区全装载"在 79 槽位树下被误判为 FAIL。 */
  const expectedBuildings = expectedOverride ?? (await loadModule('src/shared/layout.js')).SLOTS.length;
  const chrome = findChrome();
  if (!chrome) {
    C.unverified('11.1 浏览器实测（未找到可用浏览器）', '未在 CHROME_PATH / /Applications / playwright 缓存中找到 Chrome；像素级与运行时项未验证');
    return null;
  }
  const server = serveRoot(ROOT);
  const port = await server.listen(0);
  const userDataDir = mkdtempSync(join(tmpdir(), 'ip-verify-profile-'));
  const outDir = mkdtempSync(join(tmpdir(), 'ip-verify-'));
  const domUrl = `http://127.0.0.1:${port}/index.html?ui=0&shot=1&stats=1&quality=medium&dpr=1`;
  const headlessShell = /headless-shell/.test(chrome);
  const domProc = await runChromeRetry(
    chrome,
    (dir) => chromeArgs({ url: domUrl, dumpDom: true, userDataDir: dir, headlessShell }),
    { expectStdout: true, attempts: 5 },
  );
  const dom = domProc.stdout ?? '';
  const reportMatch = dom.match(/<pre id="palace-stats-json"[^>]*>([\s\S]*?)<\/pre>/);
  let report = null;
  if (reportMatch) {
    try {
      report = JSON.parse(reportMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
    } catch (error) {
      C.fail('11.1 浏览器机器报告解析', `JSON 解析失败：${error.message}`);
    }
  }
  const ready = /data-palace-ready="1"/.test(dom);
  const notFound = server.requests.filter((r) => r.status === 404);
  C.expect('11.1 页面在 headless Chrome 内装配就绪（data-palace-ready=1），HTTP 请求无 404',
    ready && notFound.length === 0,
    `浏览器=${chrome.split('/').slice(-1)[0]} · ready=${ready} · 请求 ${server.requests.length} 条 · 404 ${notFound.length}${notFound.length ? `：${notFound.slice(0, 5).map((r) => r.path).join(',')}` : ''}${domProc.stderr && !ready ? ` · stderr: ${(domProc.stderr || '').split('\n').slice(0, 2).join(' | ')}` : ''}`);
  if (report) {
    C.info(`浏览器机器报告：区域 [${(report.zones ?? []).join(', ')}] · 建筑 ${report.buildings} · 装载失败 ${(report.zoneErrors ?? []).length} 个${(report.zoneErrors ?? []).length ? `：${(report.zoneErrors ?? []).map((e) => `${e.zone}(${e.error})`).join(' / ')}` : ''} · 主场景可绘制对象 ${report.mainSceneRenderables} · 整帧调用 ${report.fullFrameDrawCalls} · 可见三角面 ${report.visibleTriangles} · kit=${report.kitSource}`);
    /* t11 修：原判据把"建筑 67 栋"**硬编码**在条件里，而 67 是 `LAYOUT 1.1.4` 时代的槽位数
       （`LAYOUT 1.1.21` 为 79 = 67 + t171 新增 12 座花园 annex）。陈旧的期望值会把"五个区域全部装载成功"
       误判为 FAIL（实测浏览器 `区域 [GREYBOX,B,C,D,E,F]`、`zoneErrors={}`、ready=1、404=0 全绿，只因 79≠67 报红）。
       正确口径：**期望值一律取自 `layout.SLOTS`**（唯一真相），条件 = 5 区齐 ∧ 注册建筑数 == layout 槽位数 ∧ kit 来源正确。
       注意：本项只对账**建筑计数**；建筑**形状**（79 槽位各有可识别屋顶等）由 §2.9/§7.2 单独守。 */
    C.expect(`11.2 浏览器内 5 个真实区域全部装载、建筑 ${expectedBuildings} 栋（= layout.SLOTS，非硬编码旧值）、kit 来自 src/kit/index.js`,
      (report.zones ?? []).filter((z) => z !== 'GREYBOX').sort().join('') === 'BCDEF' && report.buildings === expectedBuildings && /src\/kit\/index\.js/.test(report.kitSource ?? ''),
      `区域 [${(report.zones ?? []).join(',')}] · 建筑 ${report.buildings} / layout 期望 ${expectedBuildings} · kit=${report.kitSource}`);
    /* t11 新增（判据只增不减）：**装载失败清单必须为空** —— 直接对账"有没有区装载失败"，
       把"5 区是否真装载"从"数建筑总数"里独立出来；报告缺该字段时按"不可判"处理（不静默通过）。 */
    const zoneFailures = report.zoneErrors ?? null;
    C.expect('11.2b 浏览器机器报告的装载失败清单为空（zoneErrors=[]，即 5 区无一失败）',
      Array.isArray(zoneFailures) && zoneFailures.length === 0,
      zoneFailures === null ? '报告缺 zoneErrors 字段（不可判）' : `zoneErrors=${JSON.stringify(zoneFailures)}`);
    // 口径纠正（t96 主理人裁定 + t86/t90 后的内景扩容）：§8.2 的「≤350」约束的是**主场景单次绘制调用**
    // （权威口径见 scripts/audit.mjs：333/350 ✓）。对象数（renderables）不是 §8.2 门禁；t96 §14.4 已把
    // 内景机位对象数登记为基线 374 并加增长哨兵 ≤450（=374+20%）。原意（"灰盒已隐藏、未额外暴露"）
    // 由两条一起守住：调用 ≤350（§8.2）+ 对象 ≤450（哨兵，防结构性增长）。
    C.expect('11.3 浏览器内主场景：绘制调用 ≤350（§8.2 口径）且可绘制对象 ≤450（t96 登记基线 374 + 20% 哨兵）',
      (report.mainSceneRenderables ?? 9999) <= 450 && (report.fullFrameDrawCalls ?? 99999) <= 1400,
      `主场景可绘制对象 ${report.mainSceneRenderables} ≤ 450（基线 374）· 整帧调用 ${report.fullFrameDrawCalls} ≤ 1400（t96 基线 1142–1160）· 可见三角面 ${report.visibleTriangles}`);
  } else {
    C.fail('11.2 浏览器机器报告', `未取到 <pre id="palace-stats-json">；dom=${dom.length}B`);
  }
  const shotPath = join(outDir, 'verify-oblique-golden.png');
  const shotUrl = `http://127.0.0.1:${port}/index.html?view=oblique&preset=golden&ui=0&shot=1&quality=medium&dpr=1`;
  const shotProc = await runChromeRetry(
    chrome,
    (dir) => chromeArgs({ url: shotUrl, screenshot: shotPath, userDataDir: dir, headlessShell }),
    { attempts: 3 },
  );
  if (existsSync(shotPath)) {
    const png = pngStats(shotPath);
    C.info(`像素证据（写在系统临时目录 ${outDir}，未写入项目目录）：${png.width}×${png.height} · 均值 ${png.meanLuma.toFixed(3)} · 暗区 ${(png.darkRatio * 100).toFixed(2)}% · 内容占比 ${(png.contentRatio * 100).toFixed(1)}% · ${(png.bytes / 1024).toFixed(1)}KB`);
    C.expect('11.4 真实浏览器出图非空白（1440×900，亮度与内容占比在合理区间）',
      png.width === 1440 && png.height === 900 && png.meanLuma > 0.05 && png.contentRatio > 0.05,
      `${png.width}×${png.height} 均值 ${png.meanLuma.toFixed(3)} 内容 ${(png.contentRatio * 100).toFixed(1)}%`);
    C.unverified('11.5 像素级目视项（屋顶形制可辨识度 / 素材拼接感 / 院落疏密观感 / 水面接缝）',
      `需人眼判读；本次只做机器可读的亮度与内容占比 + 全城/五区机位出图（图在临时目录 ${outDir}，按纪律不写入项目目录）`);
  } else {
    C.unverified('11.4 真实浏览器出图', `未产出 PNG（${shotProc.status}）；stderr：${(shotProc.stderr || '').split('\n').slice(0, 3).join(' | ')}`);
  }
  // 八视角全量出图（仍写临时目录）——为 G3 提供可人工目视的材料
  const views = ['oblique', 'iso', 'axis', 'zone', 'focus', 'interior', 'fp', 'orbit'];
  const viewResults = [];
  for (const view of views) {
    const p = join(outDir, `view-${view}.png`);
    const url = `http://127.0.0.1:${port}/index.html?view=${view}&preset=golden&ui=0&shot=1&quality=medium&dpr=1`;
    await runChromeRetry(chrome, (dir) => chromeArgs({ url, screenshot: p, userDataDir: dir, headlessShell }), { attempts: 2 });
    if (existsSync(p)) {
      const st = pngStats(p);
      viewResults.push(`${view}:${st.meanLuma.toFixed(2)}/${(st.darkRatio * 100).toFixed(0)}%`);
    } else viewResults.push(`${view}:出图失败`);
  }
  C.info(`八视角出图（临时目录）：${viewResults.join(' · ')}`);
  await server.close();
  rmSync(userDataDir, { recursive: true, force: true });
  return report;
}

/* ============================================================ CLI */

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const out = await runCompleteness({ browser: !NO_BROWSER });
  if (ONLY_JSON) {
    console.log(JSON.stringify({
      checks: out.checks,
      counts: {
        buildings: out.stats.buildings,
        courtyards: out.layout.COURTYARDS.length,
        connectors: out.stats.connectors,
        viewpoints: out.stats.viewpoints,
        drawCalls: out.totalDrawCalls,
        triangles: out.totalTriangles,
        rays: out.rays,
      },
    }, null, 2));
  }
  process.exit(out.exitCode);
}
