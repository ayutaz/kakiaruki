import { describe, expect, it } from "vitest";

import {
  evaluateFitness,
  DEFAULT_FITNESS_WEIGHTS
} from "../../src/domain/evolution/fitness.ts";
import type { EpisodeResult } from "../../src/simulation/episode-tracker.ts";

const SKELETON_WIDTH = 3.82;

function result(overrides: Partial<EpisodeResult> = {}): EpisodeResult {
  return {
    status: "completed",
    invalidReason: null,
    steps: 360,
    elapsedSeconds: 6,
    startCenterOfMass: { x: 0, y: 0.3 },
    endCenterOfMass: { x: 1, y: 0.3 },
    maxForwardProgress: 1.2,
    motorEffort: 10,
    ...overrides
  };
}

describe("evaluateFitness", () => {
  it("rewards an individual that travelled further", () => {
    const near = evaluateFitness(result({ endCenterOfMass: { x: 0.2, y: 0.3 } }), SKELETON_WIDTH);
    const far = evaluateFitness(result({ endCenterOfMass: { x: 2, y: 0.3 } }), SKELETON_WIDTH);

    expect(far.fitness).toBeGreaterThan(near.fitness);
  });

  it("records the forward and best progress separately", () => {
    const breakdown = evaluateFitness(
      result({ endCenterOfMass: { x: 1, y: 0.3 }, maxForwardProgress: 1.6 }),
      SKELETON_WIDTH
    );

    expect(breakdown.terms.forwardProgress).toBeCloseTo(1);
    expect(breakdown.terms.bestProgress).toBeCloseTo(1.6);
  });

  it("normalises the forward distance by the skeleton width", () => {
    const breakdown = evaluateFitness(
      result({ endCenterOfMass: { x: SKELETON_WIDTH * 2, y: 0.3 } }),
      SKELETON_WIDTH
    );

    expect(breakdown.terms.normalizedForwardProgress).toBeCloseTo(2);
  });

  it("prefers the cheaper of two individuals that travelled the same distance", () => {
    const cheap = evaluateFitness(result({ motorEffort: 5 }), SKELETON_WIDTH);
    const expensive = evaluateFitness(result({ motorEffort: 500 }), SKELETON_WIDTH);

    expect(cheap.fitness).toBeGreaterThan(expensive.fitness);
    expect(expensive.terms.energyPenalty).toBeGreaterThan(cheap.terms.energyPenalty);
  });

  it("puts an invalid individual below every finished one and keeps the reason", () => {
    const invalid = evaluateFitness(
      result({
        status: "invalid",
        invalidReason: "non-finite-state",
        endCenterOfMass: { x: 500, y: 0.3 },
        maxForwardProgress: 500
      }),
      SKELETON_WIDTH
    );
    const best = evaluateFitness(
      result({ endCenterOfMass: { x: 20, y: 0.3 }, maxForwardProgress: 20 }),
      SKELETON_WIDTH
    );

    expect(invalid.fitness).toBeLessThan(best.fitness);
    expect(invalid.terms.invalidPenalty).toBe(DEFAULT_FITNESS_WEIGHTS.invalidPenalty);
    expect(invalid.terms.invalidReason).toBe("non-finite-state");
  });

  it("keeps a strange but effective individual, only punishing numeric failure", () => {
    const rolling = evaluateFitness(
      result({ endCenterOfMass: { x: 4, y: 0.05 }, maxForwardProgress: 4.2 }),
      SKELETON_WIDTH
    );

    expect(rolling.fitness).toBeGreaterThan(0);
    expect(rolling.terms.invalidPenalty).toBe(0);
  });

  it("rejects a skeleton width that cannot normalise a distance", () => {
    expect(() => evaluateFitness(result(), 0)).toThrow(/skeletonWidth/);
    expect(() => evaluateFitness(result(), Number.NaN)).toThrow(/skeletonWidth/);
  });
});
