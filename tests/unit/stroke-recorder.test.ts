import { describe, expect, it } from "vitest";

import { StrokeRecorder } from "../../src/domain/stroke/stroke-recorder.ts";

const VIEWPORT = { width: 640, height: 480 };

function recorder(overrides: Record<string, unknown> = {}): StrokeRecorder {
  return new StrokeRecorder({ bounds: VIEWPORT, ...overrides });
}

function point(x: number, y: number, time = 0) {
  return { x, y, time };
}

describe("StrokeRecorder", () => {
  it("starts idle and only records after the stroke begins", () => {
    const subject = recorder();

    expect(subject.status).toBe("idle");
    expect(subject.extend(point(10, 10))).toBe(false);
    expect(subject.points).toHaveLength(0);

    subject.begin(point(10, 10));

    expect(subject.status).toBe("drawing");
    expect(subject.points).toHaveLength(1);
  });

  it("drops points that are closer than the minimum spacing", () => {
    const subject = recorder({ minPointDistance: 5 });
    subject.begin(point(100, 100));

    expect(subject.extend(point(102, 100))).toBe(false);
    expect(subject.extend(point(110, 100))).toBe(true);
    expect(subject.points).toHaveLength(2);
  });

  it("does not grow when the same point is repeated", () => {
    const subject = recorder({ minPointDistance: 3 });
    subject.begin(point(50, 50));

    for (let index = 0; index < 100; index += 1) {
      subject.extend(point(50, 50, index));
    }

    expect(subject.points).toHaveLength(1);
  });

  it("drops points that are not finite instead of throwing", () => {
    const subject = recorder();
    subject.begin(point(10, 10));

    expect(subject.extend(point(Number.NaN, 20))).toBe(false);
    expect(subject.extend(point(20, Number.POSITIVE_INFINITY))).toBe(false);
    expect(subject.points).toHaveLength(1);
  });

  it("refuses to start from a point that is not finite", () => {
    const subject = recorder();

    subject.begin(point(Number.NaN, 10));

    expect(subject.status).toBe("idle");
    expect(subject.points).toHaveLength(0);
  });

  it("drops points outside the drawing area rather than clamping them", () => {
    const subject = recorder();
    subject.begin(point(10, 10));

    expect(subject.extend(point(-5, 100))).toBe(false);
    expect(subject.extend(point(700, 100))).toBe(false);
    expect(subject.extend(point(100, 500))).toBe(false);
    expect(subject.points).toHaveLength(1);
  });

  it("stops recording once the point budget is spent", () => {
    const subject = recorder({ minPointDistance: 1, maxPoints: 5 });
    subject.begin(point(0, 0));

    for (let index = 1; index < 20; index += 1) {
      subject.extend(point(index * 4, 0));
    }

    expect(subject.points).toHaveLength(5);
  });

  it("stops recording once the stroke has taken too long", () => {
    const subject = recorder({ minPointDistance: 1, maxDurationMs: 1_000 });
    subject.begin(point(0, 0, 0));

    expect(subject.extend(point(10, 0, 500))).toBe(true);
    expect(subject.extend(point(20, 0, 1_500))).toBe(false);
    expect(subject.points).toHaveLength(2);
  });

  it("finishes with the recorded points and ignores later input", () => {
    const subject = recorder();
    subject.begin(point(0, 0));
    subject.extend(point(40, 0));

    const finished = subject.finish();

    expect(finished).toHaveLength(2);
    expect(subject.status).toBe("finished");
    expect(subject.extend(point(80, 0))).toBe(false);
    expect(subject.points).toHaveLength(2);
  });

  it("throws away the stroke when it is cancelled", () => {
    const subject = recorder();
    subject.begin(point(0, 0));
    subject.extend(point(40, 0));

    subject.cancel();

    expect(subject.status).toBe("cancelled");
    expect(subject.points).toHaveLength(0);
  });

  it("can be reset and used again", () => {
    const subject = recorder();
    subject.begin(point(0, 0));
    subject.finish();

    subject.reset();

    expect(subject.status).toBe("idle");
    expect(subject.points).toHaveLength(0);
    subject.begin(point(5, 5));
    expect(subject.points).toHaveLength(1);
  });

  it("rejects a drawing area that cannot hold a stroke", () => {
    expect(() => new StrokeRecorder({ bounds: { width: 0, height: 100 } })).toThrow(/bounds/);
  });
});
