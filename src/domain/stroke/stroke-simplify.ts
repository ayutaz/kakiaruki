import type { Vector2 } from "../../shared/vector2.ts";

function perpendicularDistance(point: Vector2, from: Vector2, to: Vector2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  const numerator = Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x);
  return numerator / Math.sqrt(lengthSquared);
}

/**
 * Ramer-Douglas-Peucker。**Edgeの内部にだけ**適用すること。
 * 全点列へ先に適用すると、戻り線や近接イベントを消してしまう（docs/04 §3 Step 3）。
 */
export function simplifySegment(
  points: readonly Vector2[],
  tolerance: number
): readonly Vector2[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError("tolerance must be finite and non-negative");
  }
  if (points.length < 3) {
    return [...points];
  }

  const first = points[0]!;
  const last = points.at(-1)!;
  let worstIndex = 0;
  let worstDistance = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const candidate = perpendicularDistance(points[index]!, first, last);
    if (candidate > worstDistance) {
      worstDistance = candidate;
      worstIndex = index;
    }
  }

  if (worstDistance <= tolerance) {
    return [first, last];
  }

  const head = simplifySegment(points.slice(0, worstIndex + 1), tolerance);
  const tail = simplifySegment(points.slice(worstIndex), tolerance);
  return [...head.slice(0, -1), ...tail];
}
