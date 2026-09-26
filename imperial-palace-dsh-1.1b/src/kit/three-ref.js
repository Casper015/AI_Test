/**
 * three 解析（全库唯一一处）。
 * =============================================================================
 * 浏览器：index.html 的 import map 把裸标识符 'three' 映射到 './public/vendor/three/three.module.js'，
 *   本文件的相对导入 '../../public/vendor/three/three.module.js' 规范化后是**同一个绝对 URL**，
 *   因此 ES module 缓存返回**同一个命名空间对象**（不另装/另引一份，符合 CONTRACTS §3.4）。
 * Node：没有 import map，无法解析裸 'three'；本相对路径同样可用（three r169 是纯 ESM、几何/材质层不触 DOM），
 *   于是 tests/kit.test.mjs 能在 Node 内直接构建真实几何与材质。
 * 队列纪律：createKit(ctx) 优先使用 ctx.THREE（同一份 three），仅在没有 ctx 时退回本文件。
 */

import * as THREE from '../../public/vendor/three/three.module.js';

export { THREE };
export default THREE;

/** 解析规则自述，供 tests/kit.test.mjs 断言"只有一处导入"。 */
export const THREE_RESOLUTION = Object.freeze({
  specifier: '../../public/vendor/three/three.module.js',
  importMapTarget: './public/vendor/three/three.module.js',
  revision: THREE.REVISION,
});
