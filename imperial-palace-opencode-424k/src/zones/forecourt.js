/**
 * 紫禁天朝 · B 中轴前朝（区域 Agent B）
 * 午门内广场、礼仪广场、三层白石台基、金銮殿内景。
 */

import { createZoneBase } from './zone-base.js';

export async function createZone(ctx) {
  const zone = createZoneBase('B', ctx);
  return zone;
}

export default createZone;
