import { describe, expect, it } from "vitest";

import {
  planLanes,
  requiredLaneSpacing,
  DEFAULT_LANE_LAYOUT
} from "../../src/simulation/lane-allocator.ts";

describe("planLanes", () => {
  it("allocates one lane per individual", () => {
    expect(planLanes(1, 3).length).toBe(1);
    expect(planLanes(8, 3).length).toBe(8);
    expect(planLanes(32, 3).length).toBe(32);
  });

  it("keeps neighbouring lane centres at least the required spacing apart", () => {
    const skeletonWidth = 3;
    const lanes = planLanes(8, skeletonWidth);
    const spacing = requiredLaneSpacing(skeletonWidth, DEFAULT_LANE_LAYOUT.margin);

    for (let index = 1; index < lanes.length; index += 1) {
      const gap = lanes[index]!.origin.x - lanes[index - 1]!.origin.x;
      expect(gap).toBeGreaterThanOrEqual(spacing - 1e-9);
    }
  });

  it("separates lanes along x only, so every individual keeps the same ground height", () => {
    for (const lane of planLanes(8, 3)) {
      expect(lane.origin.y).toBe(0);
    }
  });

  it("centres the population around the origin", () => {
    const lanes = planLanes(4, 3);
    const sum = lanes.reduce((total, lane) => total + lane.origin.x, 0);

    expect(sum).toBeCloseTo(0, 9);
  });

  it("gives every lane its own negative collision group", () => {
    const lanes = planLanes(8, 3);
    const groups = new Set(lanes.map((lane) => lane.groupIndex));

    expect(groups.size).toBe(lanes.length);
    for (const lane of lanes) {
      expect(lane.groupIndex).toBeLessThan(0);
    }
  });

  it("is deterministic", () => {
    expect(planLanes(32, 3)).toEqual(planLanes(32, 3));
  });

  it("honours an explicit spacing override", () => {
    const lanes = planLanes(3, 3, { spacing: 50 });

    expect(lanes[1]!.origin.x - lanes[0]!.origin.x).toBeCloseTo(50);
  });

  it("rejects a population that cannot be laid out", () => {
    expect(() => planLanes(0, 3)).toThrow(/populationSize/);
    expect(() => planLanes(2.5, 3)).toThrow(/populationSize/);
    expect(() => planLanes(4, -1)).toThrow(/skeletonWidth/);
    expect(() => planLanes(4, 3, { spacing: 0 })).toThrow(/spacing/);
  });
});

describe("requiredLaneSpacing", () => {
  it("leaves room for the skeleton plus the travel margin", () => {
    expect(requiredLaneSpacing(3, 12)).toBeCloseTo(15);
  });

  it("rejects a non-finite input", () => {
    expect(() => requiredLaneSpacing(Number.NaN, 12)).toThrow(/finite/);
  });
});
