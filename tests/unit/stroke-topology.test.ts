import { describe, expect, it } from "vitest";

import { createSeededRandom } from "../../src/domain/evolution/seeded-random.ts";
import { normalizeStroke, resampleByDistance } from "../../src/domain/stroke/stroke-normalize.ts";
import { simplifySegment } from "../../src/domain/stroke/stroke-simplify.ts";
import {
  detectCorners,
  hasCrossingSegments,
  isClosedLoop,
  type CrossingSegment
} from "../../src/domain/stroke/stroke-topology.ts";
import type { Vector2 } from "../../src/shared/vector2.ts";
import {
  STROKE_VIEWPORT,
  closedLoopStroke,
  curveStroke,
  lShapeStroke,
  sampleStroke,
  selfIntersectingStroke,
  shallowWaveStroke,
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

/** 折れ線を、隣どうしが端点を共有する線分列にする。 */
function polylineSegments(points: readonly Vector2[]): CrossingSegment[] {
  return points.slice(1).map((point, index) => ({
    a: points[index]!,
    b: point,
    endpoints: [`p${index}`, `p${index + 1}`] as const
  }));
}

function hasSelfIntersection(points: readonly Vector2[]): boolean {
  return hasCrossingSegments(polylineSegments(points));
}

describe("hasCrossingSegments", () => {
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

  it("is false for a straight run whose cross products are rounding noise", () => {
    // 浅い波線を re-sampling すると、まっすぐな部分の外積が 0 と 1e-18 に割れる。
    // 数学的には一直線なので、交差ではない。
    const straightRun: Vector2[] = [
      { x: -0.39092893581667476, y: -0.24563109436420086 },
      { x: -0.2891691393360642, y: -0.18203122156381926 },
      { x: -0.18740934285545363, y: -0.11843134876343767 },
      { x: -0.0856495463748431, y: -0.05483147596305606 },
      { x: 0.01611025010576747, y: 0.008768396837325537 },
      { x: 0.11787004658637802, y: 0.07236826963770714 }
    ];

    expect(hasSelfIntersection(straightRun)).toBe(false);
  });

  it("is false for a shallow wave that never crosses itself", () => {
    expect(hasSelfIntersection(prepared(shallowWaveStroke()))).toBe(false);
  });

  it("is false when the cross products straddle zero as rounding noise", () => {
    // 一直線に並ぶ2つのsegment。外積が ±1.4e-17 に割れるため、符号の比較だけでは
    // 「両端が反対側にある」と読めてしまう。
    const straightRun: Vector2[] = [
      { x: -1.0307486667158814, y: 1.1808214054763981 },
      { x: -0.973287847479552, y: 1.075473153223739 },
      { x: 0.0610068987743758, y: -0.8207953873241242 },
      { x: 0.11846771801070514, y: -0.9261436395767833 }
    ];

    expect(hasSelfIntersection(straightRun)).toBe(false);
  });

  it("is false for every stroke whose x only increases", () => {
    // xが単調に増える線は、定義上どこでも自分と交われない。
    // 丸め誤差で交差と誤判定していないかを、まとめて確かめる。
    const random = createSeededRandom(20260914);
    let falsePositives = 0;

    for (let trial = 0; trial < 300; trial += 1) {
      const path: [number, number][] = [];
      let x = random.nextInRange(40, 100);
      const corners = 2 + random.nextInt(5);
      for (let index = 0; index <= corners; index += 1) {
        path.push([x, random.nextInRange(60, 360)]);
        x += random.nextInRange(40, 160);
      }
      const stroke = sampleStroke(path, random.nextInRange(4, 12));
      if (hasSelfIntersection(prepared(stroke))) {
        falsePositives += 1;
      }
    }

    expect(falsePositives).toBe(0);
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
