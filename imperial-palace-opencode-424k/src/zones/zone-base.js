/**
 * 紫禁天朝 · 分区装配基类（区域 Agent 共用；B/C 追加内景）
 * 契约见 docs/CONTRACTS.md：createZone(ctx) → { root, buildings, connectors, colliders, viewpoints, lightAnchors, update, dispose }
 */

import * as THREE from 'three';
import { buildArchitecture, buildDecoration, buildWaterAndPaths } from '../kit/batcher.js';
import { buildInterior } from '../kit/interior.js';

export function createZoneBase(zoneId, ctx) {
  const layout = ctx.layout;
  const scope = layout.scope[zoneId];
  const root = new THREE.Group();
  root.name = 'zone-' + zoneId;

  const buildings = layout.buildings.filter(b => b.zone === zoneId);
  buildArchitecture(THREE, zoneId, buildings, ctx.materials, ctx.quality).forEach(m => root.add(m));
  root.add(buildWaterAndPaths(zoneId, scope, ctx.materials, layout, ctx.quality));
  root.add(buildDecoration(zoneId, scope, ctx.materials, ctx.quality, layout));

  const colliders = [];
  const interiors = [];
  for (const b of buildings) {
    if (!b.visitable) continue;
    const kind = b.category === 'mainHall' ? 'mainHall' : 'bedChamber';
    const it = buildInterior(kind, b, ctx.materials);
    root.add(it.group);
    interiors.push(it.group);
    for (const c of it.colliders) colliders.push(c);
  }

  const viewpoints = scope.viewpoints.map(id => layout.viewpoints.find(v => v.id === id)).filter(Boolean);
  const connectors = scope.connectors.map(id => layout.connectors.find(c => c.id === id)).filter(Boolean);
  const lightAnchors = layout.lanterns.filter(l => l.zone === zoneId && l.y > 3).map(l => ({
    id: l.id, position: { x: l.x, y: l.y + 0.4, z: l.z }, type: 'lantern', zone: zoneId
  }));

  return {
    id: zoneId,
    root,
    buildings: buildings.map(b => ({
      id: b.id, name: b.name, category: b.category, zone: b.zone, bounds: b.bounds,
      entrance: { x: b.x, z: b.z + b.d / 2 }, visitable: b.visitable, info: b.info
    })),
    interiors,
    connectors,
    colliders,
    viewpoints,
    lightAnchors,
    update() { },
    dispose() { }
  };
}
