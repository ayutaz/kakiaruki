import { angleOf, distance, subtract, wrapSignedRadians, type Vector2 } from "../../shared/vector2.ts";

/** 自己交差判定で無視する、隣接しすぎたsegmentの間隔。 */
const DEFAULT_IGNORE_SPAN = 2;

/**
 * 進行方向が `minTurnRadians` 以上変わる点を折れ曲がりとして返す。
 * 隣り合う候補が続く場合は、最も鋭い1点へまとめる。
 */
export function detectCorners(
  points: readonly Vector2[],
  minTurnRadians: number,
  windowSize = 2
): readonly number[] {
  if (!Number.isFinite(minTurnRadians) || minTurnRadians <= 0) {
    throw new RangeError("minTurnRadians must be finite and greater than zero");
  }
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    throw new RangeError("windowSize must be a positive integer");
  }
  if (points.length < 2 * windowSize + 1) {
    return [];
  }

  const turns = new Map<number, number>();
  for (let index = windowSize; index < points.length - windowSize; index += 1) {
    const before = points[index - windowSize]!;
    const at = points[index]!;
    const after = points[index + windowSize]!;
    const incoming = angleOf(subtract(at, before));
    const outgoing = angleOf(subtract(after, at));
    const turn = Math.abs(wrapSignedRadians(outgoing - incoming));
    if (turn >= minTurnRadians) {
      turns.set(index, turn);
    }
  }

  // 連続した候補を1つにまとめる。
  const corners: number[] = [];
  let runStart: number | null = null;
  let runBestIndex = 0;
  let runBestTurn = 0;

  const closeRun = (): void => {
    if (runStart !== null) {
      corners.push(runBestIndex);
      runStart = null;
      runBestTurn = 0;
    }
  };

  for (let index = 0; index < points.length; index += 1) {
    const turn = turns.get(index);
    if (turn === undefined) {
      closeRun();
      continue;
    }
    if (runStart === null) {
      runStart = index;
      runBestIndex = index;
      runBestTurn = turn;
    } else if (turn > runBestTurn) {
      runBestIndex = index;
      runBestTurn = turn;
    }
  }
  closeRun();

  return corners;
}

function segmentsCross(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number): number =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);

  const d1 = cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const d2 = cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  const d3 = cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const d4 = cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);

  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * 描線が自分自身を横切るか。隣接するsegmentは端点を共有するため除外する。
 * M4では交差を対応外として拒否するための判定に使う。
 */
export function hasSelfIntersection(
  points: readonly Vector2[],
  ignoreSpan = DEFAULT_IGNORE_SPAN
): boolean {
  for (let i = 0; i + 1 < points.length; i += 1) {
    for (let j = i + ignoreSpan; j + 1 < points.length; j += 1) {
      if (segmentsCross(points[i]!, points[i + 1]!, points[j]!, points[j + 1]!)) {
        return true;
      }
    }
  }
  return false;
}

/** 終点が始点付近へ戻っているか。M4では閉ループを対応外として拒否する。 */
export function isClosedLoop(points: readonly Vector2[], closeDistance: number): boolean {
  if (points.length < 4) {
    return false;
  }
  const first = points[0]!;
  const last = points.at(-1)!;
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    travelled += distance(points[index - 1]!, points[index]!);
  }
  // 短い線が「始点の近くにある」だけで閉ループ扱いにならないようにする。
  if (travelled < closeDistance * 4) {
    return false;
  }
  return distance(first, last) <= closeDistance;
}
