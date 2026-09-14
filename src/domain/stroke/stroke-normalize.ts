import { distance, type Vector2 } from "../../shared/vector2.ts";

import type { StrokePoint, ViewportSize } from "./stroke-point.ts";

export interface NormalizeOptions {
  /** 画面の短辺に対応させるワールド長 [m]。 */
  readonly worldShortSide: number;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  worldShortSide: 6
};

/**
 * 画面座標（yは下向き）をワールド座標（yは上向き、原点は描線の重心）へ移す。
 * 縦横で別の倍率を使うと形が歪むため、短辺基準の一様スケールだけを使う。
 */
export function normalizeStroke(
  points: readonly StrokePoint[],
  viewport: ViewportSize,
  options: Partial<NormalizeOptions> = {}
): readonly Vector2[] {
  if (points.length === 0) {
    throw new RangeError("stroke must contain points");
  }
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new RangeError("viewport must have a positive finite width and height");
  }

  const { worldShortSide } = { ...DEFAULT_NORMALIZE_OPTIONS, ...options };
  const scale = worldShortSide / Math.min(viewport.width, viewport.height);

  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }
  const centreX = sumX / points.length;
  const centreY = sumY / points.length;

  return points.map((point) => ({
    x: (point.x - centreX) * scale,
    y: -(point.y - centreY) * scale
  }));
}

export function polylineLength(points: readonly Vector2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1]!, points[index]!);
  }
  return total;
}

/**
 * 等間隔re-sampling。デバイスごとのイベント密度差をここで吸収する。
 * 形状は保ち、戻り線や交差の情報を消さない（docs/04 §3 Step 2）。
 */
export function resampleByDistance(
  points: readonly Vector2[],
  spacing: number
): readonly Vector2[] {
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError("spacing must be finite and greater than zero");
  }
  if (points.length < 2) {
    return [...points];
  }

  const first = points[0]!;
  const resampled: Vector2[] = [first];
  let carried = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const segmentLength = distance(from, to);
    if (segmentLength === 0) {
      continue;
    }
    const directionX = (to.x - from.x) / segmentLength;
    const directionY = (to.y - from.y) / segmentLength;

    let travelled = spacing - carried;
    while (travelled <= segmentLength) {
      resampled.push({
        x: from.x + directionX * travelled,
        y: from.y + directionY * travelled
      });
      travelled += spacing;
    }
    carried = segmentLength - (travelled - spacing);
  }

  const last = points.at(-1)!;
  const tail = resampled.at(-1)!;
  if (distance(tail, last) > 1e-9) {
    resampled.push(last);
  }
  return resampled;
}
