import { angleOf, distance, subtract, wrapSignedRadians, type Vector2 } from "../../shared/vector2.ts";

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

/**
 * 外積を0とみなす幅。座標はメートルで、segmentは `resampleSpacing` 程度の長さなので、
 * この値は「直線から約 1e-8 m ずれている」に相当する。
 * これより小さい値は丸め誤差であり、符号の違いを交差と読んではいけない。
 */
const COLLINEAR_EPSILON = 1e-9;

function crossSign(value: number): number {
  if (value > COLLINEAR_EPSILON) {
    return 1;
  }
  return value < -COLLINEAR_EPSILON ? -1 : 0;
}

function segmentsCross(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number): number =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);

  const d1 = crossSign(cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y));
  const d2 = crossSign(cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y));
  const d3 = crossSign(cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y));
  const d4 = crossSign(cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y));

  // 両端が厳密に反対側にある場合だけを交差とする。
  // 一直線上（符号0）は交差ではなく、戻り線としてM5で扱う対象。
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export interface CrossingSegment {
  readonly a: Vector2;
  readonly b: Vector2;
}

/**
 * 骨どうしが交差しているか。
 *
 * 戻り線は同じ線を重ねてなぞるため、点列のまま交差を見ると必ず誤検出になる
 * （重なった2本の折れ線は、re-samplingのずれで何度も交わる）。
 * 骨格を組み立てた後の線分どうしで判定する。
 *
 * 端点を共有する骨に特別扱いは要りません。共有点は相手の直線上にあるので外積が
 * ちょうど0になり、`segmentsCross` の「両端が厳密に反対側」を満たさないためです。
 */
export function hasCrossingSegments(segments: readonly CrossingSegment[]): boolean {
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const left = segments[i]!;
      const right = segments[j]!;
      if (segmentsCross(left.a, left.b, right.a, right.b)) {
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
