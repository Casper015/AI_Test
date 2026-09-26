/**
 * 紫禁天朝 · 重点内景（B 金銮殿 / C 乾清宫）
 * 金砖地面、盘龙金柱、宝座屏风、藻井与暖阁陈设；返回可进入的室内组与碰撞体。
 */

import * as THREE from 'three';
import { boxGeo, cylGeo, coneGeo, merge, TILE } from './geom.js';
import { monumentParts, lanternParts } from './props.js';

function ring(r, h, y, seg) {
  const g = new THREE.CylinderGeometry(r, r, h, seg || 8, 1, true);
  g.translate(0, y, 0);
  return g;
}

export function buildInterior(kind, building, materials) {
  const group = new THREE.Group();
  group.name = building.id + '-interior';
  const colliders = [];
  const w = building.w, d = building.d;
  const y0 = building.base;

  const floor = boxGeo(w - 3, 0.16, d - 3, 3, 0, 0.08, 0);
  group.add(new THREE.Mesh(floor, materials.brickFloor));

  const ceil = boxGeo(w - 3, 0.2, d - 3, 4, 0, kind === 'mainHall' ? 12.8 : 10.6, 0);
  group.add(new THREE.Mesh(ceil, materials.interiorCeil));

  if (kind === 'mainHall') {
    const cols = [];
    for (const cz of [-9, 0, 9]) {
      for (const cx of [-13.5, 13.5]) cols.push(cylGeo(0.9, 1.0, 12.6, 12, 2.6, cx, 6.3, cz));
    }
    for (const cz of [-14, 14]) {
      for (const cx of [-27, -20, 20, 27]) cols.push(cylGeo(0.5, 0.56, 12.4, 10, 2.6, cx, 6.2, cz));
    }
    group.add(new THREE.Mesh(merge(cols), materials.interiorGold));

    const steps = [];
    for (let i = 0; i < 3; i++) {
      steps.push(boxGeo(22 - i * 4, 0.62, 13 - i * 3, 2.4, 0, 0.31 + i * 0.62, 6.5 - i * 1.5));
    }
    group.add(new THREE.Mesh(merge(steps), materials.marble));
    for (const cz of [-9, 0, 9]) {
      for (const cx of [-13.5, 13.5]) {
        colliders.push({ id: building.id + ':col' + cz + '_' + cx, kind: 'column', x0: building.x + cx - 1.05, x1: building.x + cx + 1.05, z0: building.z + cz - 1.05, z1: building.z + cz + 1.05, y0: y0, y1: y0 + 12.6 });
      }
    }
    colliders.push({ id: building.id + ':throne-platform', kind: 'interior', x0: building.x - 11, x1: building.x + 11, z0: building.z + 0.2, z1: building.z + 12.5, y0: y0, y1: y0 + 1.9 });

    const throne = [];
    throne.push(boxGeo(5.2, 1.7, 3.0, 2.2, 0, 2.7, 9));
    throne.push(boxGeo(5.4, 3.2, 0.5, 2.2, 0, 4.6, 10.4));
    throne.push(boxGeo(0.6, 1.2, 2.6, 2.2, -2.4, 3.2, 9));
    throne.push(boxGeo(0.6, 1.2, 2.6, 2.2, 2.4, 3.2, 9));
    group.add(new THREE.Mesh(merge(throne), materials.interiorGold));

    const screens = [];
    screens.push(boxGeo(13, 5.6, 0.36, 2.6, 0, 5.0, 14.4));
    const left = boxGeo(6, 4.6, 0.32, 2.6, 0, 0, 0);
    left.rotateY(-0.42);
    left.translate(-8.6, 4.5, 13.0);
    const right = boxGeo(6, 4.6, 0.32, 2.6, 0, 0, 0);
    right.rotateY(0.42);
    right.translate(8.6, 4.5, 13.0);
    screens.push(left, right);
    group.add(new THREE.Mesh(merge(screens), materials.screen));

    const caisson = [];
    caisson.push(ring(3.6, 0.7, 12.5, 8));
    caisson.push(ring(2.6, 0.7, 13.2, 8));
    caisson.push(ring(1.7, 0.7, 13.9, 8));
    caisson.push(ring(0.9, 0.5, 14.5, 8));
    caisson.push(new THREE.SphereGeometry(0.5, 10, 8).translate(0, 14.9, 0));
    caisson.push(boxGeo(0.36, 1.6, 0.36, 2, 0, 14.0, 0));
    const cg = merge(caisson);
    cg.translate(0, 0, 8.5);
    group.add(new THREE.Mesh(cg, materials.interiorGold));

    const lamps = [];
    for (const cx of [-20, 20]) {
      for (const cz of [-11, 6]) {
        lamps.push(new THREE.SphereGeometry(0.62, 10, 8).translate(cx, 9.4, cz));
        lamps.push(cylGeo(0.06, 0.06, 2.4, 5, 1, cx, 10.9, cz));
      }
    }
    group.add(new THREE.Mesh(merge(lamps), materials.lanternGlow));

    const dings = [];
    for (const cx of [-9, 9]) {
      const p = monumentParts('ding', 2.6, 1.1);
      dings.push(p.bronze.clone().translate(cx, 1.9, 13));
    }
    group.add(new THREE.Mesh(merge(dings), materials.bronze));
  } else {
    const cols = [];
    for (const cz of [-5, 5]) for (const cx of [-11, 11]) cols.push(cylGeo(0.72, 0.8, 10.4, 12, 2.6, cx, 5.2, cz));
    for (const cx of [-22, 22]) cols.push(cylGeo(0.42, 0.46, 10.2, 10, 2.6, cx, 5.1, 0));
    group.add(new THREE.Mesh(merge(cols), materials.interiorWood));

    for (const cx of [-11, 11]) {
      for (const cz of [-5, 5]) {
        colliders.push({ id: building.id + ':col' + cz + '_' + cx, kind: 'column', x0: building.x + cx - 0.85, x1: building.x + cx + 0.85, z0: building.z + cz - 0.85, z1: building.z + cz + 0.85, y0: y0, y1: y0 + 10.4 });
      }
    }
    const platform = boxGeo(21, 0.5, 15, 3, 13.5, 0.25, 1.5);
    group.add(new THREE.Mesh(platform, materials.interiorWood));
    colliders.push({ id: building.id + ':warm-room', kind: 'interior', x0: building.x + 3, x1: building.x + 24, z0: building.z - 6, z1: building.z + 9, y0: y0, y1: y0 + 0.5 });

    const bed = [];
    bed.push(boxGeo(7.2, 1.5, 3.8, 2.2, 13.5, 1.25, 1.5));
    bed.push(boxGeo(7.6, 0.5, 4.2, 2.2, 13.5, 2.15, 1.5));
    bed.push(boxGeo(7.8, 0.34, 4.4, 2.2, 13.5, 2.5, 1.5));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        bed.push(cylGeo(0.12, 0.14, 3.2, 6, 1.4, 13.5 + sx * 3.6, 2.1, 1.5 + sz * 2));
      }
    }
    bed.push(boxGeo(8.4, 0.24, 5.2, 2.2, 13.5, 3.8, 1.5));
    group.add(new THREE.Mesh(merge(bed.slice(0, 3)), materials.bedSilk));
    group.add(new THREE.Mesh(merge(bed.slice(3)), materials.interiorWood));
    colliders.push({ id: building.id + ':bed', kind: 'interior', x0: building.x + 8.4, x1: building.x + 18.6, z0: building.z - 1.4, z1: building.z + 4.4, y0: y0, y1: y0 + 1.6 });

    const scr = boxGeo(8, 4.2, 0.3, 2.6, 13.5, 2.6, -3.6);
    group.add(new THREE.Mesh(scr, materials.screen));

    const desk = [];
    desk.push(boxGeo(6.4, 0.3, 2.6, 2.2, -8, 1.9, -6));
    desk.push(boxGeo(0.4, 1.8, 2.2, 2.2, -10.6, 0.9, -6));
    desk.push(boxGeo(0.4, 1.8, 2.2, 2.2, -5.4, 0.9, -6));
    desk.push(boxGeo(6.0, 0.2, 2.4, 2.2, -8, 0.9, -6));
    desk.push(boxGeo(2.6, 0.24, 1.0, 2.2, -8, 1.3, -4.4));
    group.add(new THREE.Mesh(merge(desk), materials.interiorWood));
    colliders.push({ id: building.id + ':desk', kind: 'interior', x0: building.x - 11.4, x1: building.x - 4.6, z0: building.z - 7.4, z1: building.z - 3.6, y0: y0, y1: y0 + 2.1 });

    const table = [];
    table.push(boxGeo(2.6, 0.2, 1.6, 2.2, -7, 1.1, 4));
    table.push(boxGeo(0.26, 0.9, 0.26, 2.2, -8, 0.55, 4));
    table.push(boxGeo(0.26, 0.9, 0.26, 2.2, -6, 0.55, 4));
    table.push(boxGeo(1.1, 0.14, 1.1, 2, -7, 0.7, 6.6));
    table.push(boxGeo(0.2, 0.6, 0.2, 2, -7, 0.4, 6.6));
    group.add(new THREE.Mesh(merge(table), materials.interiorWood));

    const rug = boxGeo(18, 0.06, 13, 3, 0, 0.2, 0);
    group.add(new THREE.Mesh(rug, materials.carpet));

    const lamps = [];
    for (const cx of [-18, 18]) {
      for (const cz of [-8, 8]) {
        lamps.push(new THREE.SphereGeometry(0.46, 10, 8).translate(cx, 7.6, cz));
        lamps.push(cylGeo(0.05, 0.05, 2.0, 5, 1, cx, 8.9, cz));
      }
    }
    group.add(new THREE.Mesh(merge(lamps), materials.lanternGlow));
  }

  const lampA = new THREE.PointLight(0xffd9a0, 1100, 44, 2);
  lampA.position.set(0, kind === 'mainHall' ? 8.5 : 6.5, kind === 'mainHall' ? -10 : -4);
  group.add(lampA);
  const lampB = new THREE.PointLight(0xffe6bc, 760, 40, 2);
  lampB.position.set(0, kind === 'mainHall' ? 8.5 : 6.5, kind === 'mainHall' ? 8 : 8);
  group.add(lampB);
  group.position.set(building.x, y0, building.z);
  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, colliders };
}
