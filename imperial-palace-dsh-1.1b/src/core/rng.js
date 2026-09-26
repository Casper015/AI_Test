/**
 * 确定性随机数（CONTRACTS §3.1 `ctx.rng`）—— 全队同一套接口与同一颗种子。
 *
 * 算法：mulberry32（32 位、可复现、无外部依赖）。同一 `config.deriveSeed(zoneId, salt)` 必得同一序列，
 * 保证截图可比对、区域布局可复现（计划 §3.1 随机性）。
 *
 * 零 three / 零 DOM，可在 Node 直接 import。
 */

import { deriveSeed } from '../shared/config.js';

/** 由 32 位整数种子构造一个 rng（mulberry32）。 */
export function createRng(seed, salt = 0) {
  let state = (Number.isFinite(seed) ? seed : 0) >>> 0;
  const seedUsed = state;
  let calls = 0;

  function nextUint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** [0, 1) */
  function next() {
    calls += 1;
    return nextUint32() / 4294967296;
  }

  const rng = {
    /** 该 rng 的初始种子（可复现记录用）。 */
    seed: seedUsed,
    salt,
    /** 已被调用的次数（诊断用，不影响序列）。 */
    get callCount() {
      return calls;
    },
    next,
    /** [a, b) —— 与区间顺序无关 */
    range(a, b) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return lo + (hi - lo) * next();
    },
    /** 整数 [a, b] 闭区间 */
    int(a, b) {
      const lo = Math.ceil(Math.min(a, b));
      const hi = Math.floor(Math.max(a, b));
      if (hi < lo) return lo;
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    /** 均匀取一个元素 */
    pick(arr) {
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('rng.pick: 需要非空数组');
      return arr[Math.floor(next() * arr.length)];
    },
    /** 以概率 p 返回 true */
    bool(p = 0.5) {
      return next() < p;
    },
    /** 派生一个独立子序列（同一父种子 + 同一 salt 必得同一子种子）。 */
    fork(salt) {
      return createRng((seedUsed ^ deriveSeed(`rng:${String(salt)}`)) >>> 0, salt);
    },
    /** 区间内取 n 个互不重复的整数 */
    sampleInts(a, b, n) {
      const lo = Math.ceil(Math.min(a, b));
      const hi = Math.floor(Math.max(a, b));
      const pool = [];
      for (let v = lo; v <= hi; v += 1) pool.push(v);
      const out = [];
      const take = Math.min(n, pool.length);
      for (let i = 0; i < take; i += 1) {
        const idx = Math.floor(next() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
      }
      return out;
    },
  };

  return Object.freeze(rng);
}

/** 区域标准 rng：种子来自 `config.deriveSeed(zoneId, salt)`。 */
export function rngForZone(zoneId, salt = 0) {
  return createRng(deriveSeed(zoneId, salt), salt);
}

export default createRng;
