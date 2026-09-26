/**
 * 紫禁天朝 · D 西侧宫苑（区域 Agent D）
 * 六组侧院、上林苑、太液池与苑中亭榭。
 */

import { createZoneBase } from './zone-base.js';

export async function createZone(ctx) {
  const zone = createZoneBase('D', ctx);
  return zone;
}

export default createZone;
