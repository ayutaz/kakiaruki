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

  const { x: centreX, y: centreY } = strokeCentroid(points);

  return points.map((point) => ({
    x: (point.x - centreX) * scale,
    y: -(point.y - centreY) * scale
  }));
}

/**
 * 線長で重み付けした重心。点の単純平均だと入力イベント密度で位置が動いてしまうため、
 * 同じ軌跡なら密度が違っても同じ値になるこちらを使う。
 */
export function strokeCentroid(points: readonly StrokePoint[]): { x: number; y: number } {
  const first = points[0]!;
  if (points.length === 1) {
    return { x: first.x, y: first.y };
  }

  let weightedX = 0;
  let weightedY = 0;
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const segmentLength = Math.hypot(to.x - from.x, to.y - from.y);
    if (segmentLength === 0) {
      continue;
    }
    weightedX += ((from.x + to.x) / 2) * segmentLength;
    weightedY += ((from.y + to.y) / 2) * segmentLength;
    totalLength += segmentLength;
  }

  if (totalLength === 0) {
    return { x: first.x, y: first.y };
  }
  return { x: weightedX / totalLength, y: weightedY / totalLength };
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
