import { describe, expect, it } from "vitest";

import { createSeededRandom } from "../../src/domain/evolution/seeded-random.ts";

function sample(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random.next());
}

describe("createSeededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    expect(sample(42, 20)).toEqual(sample(42, 20));
  });

  it("produces different sequences for different seeds", () => {
    expect(sample(1, 20)).not.toEqual(sample(2, 20));
  });

  it("stays inside the unit interval", () => {
    for (const value of sample(7, 5_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("spreads values roughly evenly across the unit interval", () => {
    const buckets = new Array<number>(10).fill(0);
    for (const value of sample(11, 10_000)) {
      buckets[Math.floor(value * 10)] = (buckets[Math.floor(value * 10)] ?? 0) + 1;
    }

    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1_300);
    }
  });

  it("maps into an arbitrary range", () => {
    const random = createSeededRandom(3);

    for (let index = 0; index < 1_000; index += 1) {
      const value = random.nextInRange(-2, 5);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThan(5);
    }
  });

  it("produces integers below the exclusive maximum", () => {
    const random = createSeededRandom(4);
    const seen = new Set<number>();

    for (let index = 0; index < 1_000; index += 1) {
      const value = random.nextInt(5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
      seen.add(value);
    }

    expect(seen.size).toBe(5);
  });

  it("produces a standard normal distribution", () => {
    const random = createSeededRandom(9);
    const values = Array.from({ length: 20_000 }, () => random.nextGaussian());
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const variance =
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;

    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.95);
    expect(Math.sqrt(variance)).toBeLessThan(1.05);
    expect(values.every(Number.isFinite)).toBe(true);
  });

  it("picks an element from a list", () => {
    const random = createSeededRandom(5);
    const values = ["a", "b", "c"] as const;
    const picks = new Set(Array.from({ length: 200 }, () => random.pick(values)));

    expect(picks).toEqual(new Set(values));
    expect(() => random.pick([])).toThrow(/empty/);
  });

  it("rejects a seed that is not a finite number", () => {
    expect(() => createSeededRandom(Number.NaN)).toThrow(/seed/);
    expect(() => createSeededRandom(Number.POSITIVE_INFINITY)).toThrow(/seed/);
  });
});
