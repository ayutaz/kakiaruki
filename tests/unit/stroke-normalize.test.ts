import { describe, expect, it } from "vitest";

import {
  normalizeStroke,
  polylineLength,
  resampleByDistance,
  DEFAULT_NORMALIZE_OPTIONS
} from "../../src/domain/stroke/stroke-normalize.ts";
import { STROKE_VIEWPORT, lShapeStroke, straightStroke } from "../fixtures/strokes.ts";

function centroid(points: readonly { x: number; y: number }[]) {
  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

describe("normalizeStroke", () => {
  it("moves the stroke centroid to the origin", () => {
    const normalized = normalizeStroke(lShapeStroke(), STROKE_VIEWPORT);
    const centre = centroid(normalized);

    expect(centre.x).toBeCloseTo(0, 9);
    expect(centre.y).toBeCloseTo(0, 9);
  });

  it("flips the screen y axis so that up is positive", () => {
    const stroke = [
      { x: 320, y: 100, time: 0 },
      { x: 320, y: 300, time: 8 }
    ];

    const [first, second] = normalizeStroke(stroke, STROKE_VIEWPORT);

    expect(first!.y).toBeGreaterThan(second!.y);
  });

  it("maps the viewport short side onto the configured world length", () => {
    const stroke = [
      { x: 320, y: 0, time: 0 },
      { x: 320, y: STROKE_VIEWPORT.height, time: 8 }
    ];

    const normalized = normalizeStroke(stroke, STROKE_VIEWPORT);
    const extent = Math.abs(normalized[0]!.y - normalized[1]!.y);

    expect(extent).toBeCloseTo(DEFAULT_NORMALIZE_OPTIONS.worldShortSide, 9);
  });

  it("keeps the shape proportional, not stretched to the viewport", () => {
    const normalized = normalizeStroke(straightStroke(), STROKE_VIEWPORT);
    const screenLength = 400;
    const expected =
      (screenLength * DEFAULT_NORMALIZE_OPTIONS.worldShortSide) / STROKE_VIEWPORT.height;

    expect(polylineLength(normalized)).toBeCloseTo(expected, 6);
  });

  it("rejects an empty stroke or a viewport without area", () => {
    expect(() => normalizeStroke([], STROKE_VIEWPORT)).toThrow(/points/);
    expect(() => normalizeStroke(straightStroke(), { width: 0, height: 10 })).toThrow(
      /viewport/
    );
  });
});

describe("resampleByDistance", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 }
  ];

  it("keeps the first and last point", () => {
    const resampled = resampleByDistance(line, 0.25);

    expect(resampled[0]).toEqual(line[0]);
    expect(resampled.at(-1)!.x).toBeCloseTo(1, 9);
    expect(resampled.at(-1)!.y).toBeCloseTo(1, 9);
  });

  it("spaces every interior point evenly", () => {
    const resampled = resampleByDistance(line, 0.25);

    for (let index = 1; index < resampled.length - 1; index += 1) {
      const gap = Math.hypot(
        resampled[index]!.x - resampled[index - 1]!.x,
        resampled[index]!.y - resampled[index - 1]!.y
      );
      expect(gap).toBeCloseTo(0.25, 9);
    }
  });

  it("preserves the length up to the corner cutting the spacing implies", () => {
    const original = polylineLength(line);
    const resampled = polylineLength(resampleByDistance(line, 0.13));

    // サンプル点は折れ線上にあるため、角をまたぐ区間だけ弦の分だけ短くなる。
    expect(resampled).toBeLessThanOrEqual(original + 1e-9);
    expect(original - resampled).toBeLessThan(0.13);
  });

  it("never loses more than one spacing per corner, whatever the spacing", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 0.9, y: 0 },
      { x: 0.9, y: 0.9 }
    ];
    const original = polylineLength(corner);

    for (const spacing of [0.31, 0.25, 0.17, 0.07, 0.013]) {
      const loss = original - polylineLength(resampleByDistance(corner, spacing));
      expect(loss).toBeGreaterThanOrEqual(-1e-9);
      expect(loss).toBeLessThan(spacing);
    }
  });

  it("evens out the point density of the same path sampled differently", () => {
    const sparse = resampleByDistance(normalizeStroke(lShapeStroke(30), STROKE_VIEWPORT), 0.1);
    const dense = resampleByDistance(normalizeStroke(lShapeStroke(3), STROKE_VIEWPORT), 0.1);

    expect(Math.abs(sparse.length - dense.length)).toBeLessThanOrEqual(1);
  });

  it("returns a single point stroke unchanged", () => {
    expect(resampleByDistance([{ x: 2, y: 3 }], 0.5)).toEqual([{ x: 2, y: 3 }]);
  });

  it("rejects a spacing that cannot advance", () => {
    expect(() => resampleByDistance(line, 0)).toThrow(/spacing/);
    expect(() => resampleByDistance(line, -1)).toThrow(/spacing/);
  });
});

describe("polylineLength", () => {
  it("sums the segment lengths", () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 8 }
      ])
    ).toBeCloseTo(9);
  });

  it("is zero for a stroke that never moved", () => {
    expect(polylineLength([{ x: 1, y: 1 }])).toBe(0);
  });
});
