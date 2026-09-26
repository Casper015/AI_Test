/**
 * 紫禁天朝 · F 御花园与边界（区域 Agent F）
 * 御花园、宫墙、四门、角楼、护城河与入城桥梁。
 */

import { createZoneBase } from './zone-base.js';

export async function createZone(ctx) {
  const zone = createZoneBase('F', ctx);
  return zone;
}

export default createZone;
