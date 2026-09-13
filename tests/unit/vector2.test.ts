import { describe, expect, it } from "vitest";

import {
  angleOf,
  distance,
  isFiniteVector,
  subtract,
  vec,
  wrapSignedRadians
} from "../../src/shared/vector2.ts";

describe("vector2", () => {
  it("measures distance and direction between two points", () => {
    const a = vec(1, 1);
    const b = vec(4, 5);

    expect(distance(a, b)).toBeCloseTo(5);
    expect(angleOf(subtract(b, a))).toBeCloseTo(Math.atan2(4, 3));
  });

  it("wraps angles into the signed half turn range", () => {
    expect(wrapSignedRadians(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapSignedRadians(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(wrapSignedRadians(0.3)).toBeCloseTo(0.3);
  });

  it("rejects non-finite components", () => {
    expect(isFiniteVector(vec(1, 2))).toBe(true);
    expect(isFiniteVector(vec(Number.NaN, 2))).toBe(false);
    expect(isFiniteVector(vec(1, Number.POSITIVE_INFINITY))).toBe(false);
  });
});
