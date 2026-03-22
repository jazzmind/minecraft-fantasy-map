// 64-bit integer arithmetic utilities for cubiomes port.
// Adapted from niduy/minecraft-world-generator (MIT License).

export const MAX_UINT64 = 18_446_744_073_709_551_615n;
export const MAX_UINT32 = 4_294_967_295n;

const UINT64_WRAP = MAX_UINT64 + 1n;

export const lerp = (part: number, from: number, to: number) =>
  from + part * (to - from);

export function uint64ToInt64(x: bigint): bigint {
  const buf = new ArrayBuffer(8);
  new BigUint64Array(buf)[0] = x;
  return new BigInt64Array(buf)[0];
}

export const leftShift64 = (a: bigint, b: bigint) => (a << b) & MAX_UINT64;

export const rightShift64 = (a: bigint, b: bigint) =>
  (a & MAX_UINT64) >> b;

export const rotl64 = (a: bigint, b: bigint) =>
  (leftShift64(a, b) | rightShift64(a, 64n - b)) & MAX_UINT64;

export const xor64 = (a: bigint, b: bigint) => (a ^ b) & MAX_UINT64;

export const add64 = (a: bigint, b: bigint) => (a + b) % UINT64_WRAP;

export const multiply64 = (a: bigint, b: bigint) => (a * b) % UINT64_WRAP;

export function intToUint64(x: number | bigint): bigint {
  const v = BigInt(x);
  if (v < 0n) return v + UINT64_WRAP;
  return v;
}
