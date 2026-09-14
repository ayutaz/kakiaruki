import { describe, expect, it } from "vitest";

import { normalizeStroke, resampleByDistance } from "../../src/domain/stroke/stroke-normalize.ts";
import { simplifySegment } from "../../src/domain/stroke/stroke-simplify.ts";
import {
  detectCorners,
  hasSelfIntersection,
  isClosedLoop
} from "../../src/domain/stroke/stroke-topology.ts";
import type { Vector2 } from "../../src/shared/vector2.ts";
import {
  STROKE_VIEWPORT,
  closedLoopStroke,
  curveStroke,
  lShapeStroke,
  selfIntersectingStroke,
  straightStroke,
  zigzagStroke
} from "../fixtures/strokes.ts";

const TURN = 0.5;

function prepared(stroke: readonly { x: number; y: number; time: number }[]): readonly Vector2[] {
  return resampleByDistance(normalizeStroke(stroke, STROKE_VIEWPORT), 0.12);
}

describe("detectCorners", () => {
  it("finds no corner in a straight stroke", () => {
    expect(detectCorners(prepared(straightStroke()), TURN)).toEqual([]);
  });

  it("finds exactly one corner in an L shape", () => {
    expect(detectCorners(prepared(lShapeStroke()), TURN)).toHaveLength(1);
  });

  it("finds one corner per turn in a zigzag", () => {
    expect(detectCorners(prepared(zigzagStroke()), TURN)).toHaveLength(3);
  });

  it("does not turn a gentle curve into corners", () => {
    expect(detectCorners(prepared(curveStroke()), TURN)).toEqual([]);
  });

  it("collapses neighbouring candidates into the sharpest single point", () => {
    const corners = detectCorners(prepared(lShapeStroke(3)), TURN);

    expect(corners).toHaveLength(1);
  });

  it("never reports the endpoints as corners", () => {
    const points = prepared(zigzagStroke());
    const corners = detectCorners(points, TURN);

    for (const index of corners) {
      expect(index).toBeGreaterThan(0);
      expect(index).toBeLessThan(points.length - 1);
    }
  });

  it("returns corners in ascending order", () => {
    const corners = detectCorners(prepared(zigzagStroke()), TURN);

    expect([...corners].sort((left, right) => left - right)).toEqual([...corners]);
  });

  it("rejects a turn threshold that is not usable", () => {
    expect(() => detectCorners(prepared(straightStroke()), -1)).toThrow(/minTurnRadians/);
  });
});

describe("hasSelfIntersection", () => {
  it("is false for a stroke that never crosses itself", () => {
    expect(hasSelfIntersection(prepared(straightStroke()))).toBe(false);
    expect(hasSelfIntersection(prepared(lShapeStroke()))).toBe(false);
    expect(hasSelfIntersection(prepared(zigzagStroke()))).toBe(false);
  });

  it("is true for a stroke that crosses itself", () => {
    expect(hasSelfIntersection(prepared(selfIntersectingStroke()))).toBe(true);
  });

  it("does not treat neighbouring segments that share a point as a crossing", () => {
    const sharpV: Vector2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.01, y: 0.001 }
    ];

    expect(hasSelfIntersection(sharpV)).toBe(false);
  });

  it("is false for a stroke that is too short to cross", () => {
    expect(hasSelfIntersection([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe("isClosedLoop", () => {
  it("is true when the stroke comes back near its start", () => {
    expect(isClosedLoop(prepared(closedLoopStroke()), 0.4)).toBe(true);
  });

  it("is false for an open stroke", () => {
    expect(isClosedLoop(prepared(lShapeStroke()), 0.4)).toBe(false);
    expect(isClosedLoop(prepared(straightStroke()), 0.4)).toBe(false);
  });

  it("is false when the stroke is too short to be a loop", () => {
    expect(
      isClosedLoop(
        [
          { x: 0, y: 0 },
          { x: 0.05, y: 0 }
        ],
        0.4
      )
    ).toBe(false);
  });
});

describe("simplifySegment", () => {
  it("keeps both endpoints", () => {
    const points: Vector2[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.001 },
      { x: 1, y: 0 }
    ];

    const simplified = simplifySegment(points, 0.05);

    expect(simplified[0]).toEqual(points[0]);
    expect(simplified.at(-1)).toEqual(points.at(-1));
  });

  it("drops points that stay within the tolerance of the chord", () => {
    const points: Vector2[] = Array.from({ length: 20 }, (_unused, index) => ({
      x: index * 0.05,
      y: 0
    }));

    expect(simplifySegment(points, 0.02)).toHaveLength(2);
  });

  it("keeps a point that deviates further than the tolerance", () => {
    const points: Vector2[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.3 },
      { x: 1, y: 0 }
    ];

    expect(simplifySegment(points, 0.05)).toHaveLength(3);
  });

  it("leaves a two point segment untouched", () => {
    const points: Vector2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ];

    expect(simplifySegment(points, 0.1)).toEqual(points);
  });

  it("rejects a tolerance that is not usable", () => {
    expect(() => simplifySegment([{ x: 0, y: 0 }, { x: 1, y: 0 }], -1)).toThrow(/tolerance/);
  });
});
