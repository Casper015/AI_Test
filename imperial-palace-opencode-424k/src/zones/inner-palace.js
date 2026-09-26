/**
 * 紫禁天朝 · C 内廷后宫（区域 Agent C）
 * 乾清门、后三宫、东西三宫与乾清宫内景。
 */

import { createZoneBase } from './zone-base.js';

export async function createZone(ctx) {
  const zone = createZoneBase('C', ctx);
  return zone;
}

export default createZone;
