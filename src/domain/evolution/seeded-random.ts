/**
 * Seed付き疑似乱数。`Math.random()` を domain から締め出すための唯一の乱数源。
 * 同一Seedなら同一列を返すため、Runの再現とbug reportの再生に使える（docs/08 §3）。
 */
export interface RandomSource {
  /** [0, 1) */
  next(): number;
  /** [min, max) */
  nextInRange(min: number, max: number): number;
  /** [0, maxExclusive) の整数 */
  nextInt(maxExclusive: number): number;
  /** 平均0・標準偏差1の正規乱数 */
  nextGaussian(): number;
  pick<T>(values: readonly T[]): T;
}

/** mulberry32。状態32bit、周期2^32、実装が短く決定的。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createSeededRandom(seed: number): RandomSource {
  if (!Number.isFinite(seed)) {
    throw new RangeError("seed must be a finite number");
  }
  const next = mulberry32(Math.trunc(seed));
  let spareGaussian: number | null = null;

  return {
    next,

    nextInRange(min: number, max: number): number {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new RangeError("range bounds must be finite");
      }
      return min + next() * (max - min);
    },

    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new RangeError("maxExclusive must be a positive integer");
      }
      return Math.floor(next() * maxExclusive);
    },

    /** Box-Muller法。2値作れるので片方を次回へ持ち越す。 */
    nextGaussian(): number {
      if (spareGaussian !== null) {
        const value = spareGaussian;
        spareGaussian = null;
        return value;
      }
      let u = 0;
      while (u === 0) {
        u = next();
      }
      const v = next();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      spareGaussian = magnitude * Math.sin(2 * Math.PI * v);
      return magnitude * Math.cos(2 * Math.PI * v);
    },

    pick<T>(values: readonly T[]): T {
      if (values.length === 0) {
        throw new RangeError("cannot pick from an empty list");
      }
      return values[Math.floor(next() * values.length)]!;
    }
  };
}
