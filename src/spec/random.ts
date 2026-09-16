export const RANDOM_MODEL = "keyed-fnv1a-mulberry32-v1";

export function random01(seed: number, coordinate: string): number {
  let hash = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;

  for (let i = 0; i < coordinate.length; i += 1) {
    hash ^= coordinate.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  let value = (hash + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function normal01(seed: number, coordinate: string): number {
  const u1 = Math.max(
    Number.EPSILON,
    random01(seed, `${coordinate}/u1`),
  );
  const u2 = random01(seed, `${coordinate}/u2`);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
