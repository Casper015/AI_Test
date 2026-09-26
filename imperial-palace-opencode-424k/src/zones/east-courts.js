/**
 * 紫禁天朝 · E 东侧宫苑（区域 Agent E）
 * 六组侧院、奉天楼与澄波池。
 */

import { createZoneBase } from './zone-base.js';

export async function createZone(ctx) {
  const zone = createZoneBase('E', ctx);
  return zone;
}

export default createZone;
