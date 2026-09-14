import { describe, expect, it } from "vitest";

import { normalizeStroke, resampleByDistance } from "../../src/domain/stroke/stroke-normalize.ts";
import { detectRetrace } from "../../src/domain/stroke/stroke-retrace.ts";
import type { Vector2 } from "../../src/shared/vector2.ts";
import {
  STROKE_VIEWPORT,
  hairpinStroke,
  inwardSpiralStroke,
  lShapeStroke,
  nearMissStroke,
  straightStroke,
  yBranchStroke,
  zigzagStroke
} from "../fixtures/strokes.ts";

function prepared(stroke: readonly { x: number; y: number; time: number }[]): readonly Vector2[] {
  return resampleByDistance(normalizeStroke(stroke, STROKE_VIEWPORT), 0.12);
}

describe("detectRetrace", () => {
  it("finds no retrace in a stroke that never goes back", () => {
    expect(detectRetrace(prepared(straightStroke()))).toEqual([]);
    expect(detectRetrace(prepared(lShapeStroke()))).toEqual([]);
    expect(detectRetrace(prepared(zigzagStroke()))).toEqual([]);
  });

  it("finds one retrace in a Y shaped stroke", () => {
    const spans = detectRetrace(prepared(yBranchStroke()));

    expect(spans).toHaveLength(1);
    expect(spans[0]!.branchIndex).toBeLessThan(spans[0]!.start);
    expect(spans[0]!.end).toBeGreaterThan(spans[0]!.start);
  });

  it("does not call a line that merely runs alongside a retrace", () => {
    expect(detectRetrace(prepared(nearMissStroke()))).toEqual([]);
  });

  it("treats a sharp hairpin as a corner, not as a retrace", () => {
    // 頂点の近くだけ往路と重なる。重なりが短いものを枝にすると、
    // 鋭く折り返しただけの線が勝手にY字へ変わってしまう。
    expect(detectRetrace(prepared(hairpinStroke()))).toEqual([]);
  });

  it("does not call a line running the same way a retrace", () => {
    // 内側へ巻き込む線。距離は戻りの範囲内だが、進行方向が同じ。
    expect(detectRetrace(prepared(inwardSpiralStroke()))).toEqual([]);
  });
});
