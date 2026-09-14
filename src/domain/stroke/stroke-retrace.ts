import type { Vector2 } from "../../shared/vector2.ts";

export interface RetraceOptions {
  /** 往路の上に戻っているとみなす距離 [m]。 */
  readonly snapDistance: number;
  /** 戻りと認めるのに必要な最小の長さ [m]。これ未満は折れ曲がりとして扱う。 */
  readonly minRetraceLength: number;
  /** 直前の何点を「往路」から除くか。折り返しの頂点付近を戻りと誤認しないための幅。 */
  readonly lookbackGap: number;
}

export const DEFAULT_RETRACE_OPTIONS: RetraceOptions = {
  snapDistance: 0.22,
  minRetraceLength: 0.5,
  lookbackGap: 6
};

export interface RetraceSpan {
  /** 戻りが始まった点index。ここまでが往路。 */
  readonly start: number;
  /** 戻りが終わった点index。ここから新しい枝が伸びる。 */
  readonly end: number;
  /** 枝が分かれる往路上の点index。 */
  readonly branchIndex: number;
}

function squaredDistance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** 点 `index` での進行方向。端では隣の向きを使う。 */
function directionAt(points: readonly Vector2[], index: number): Vector2 {
  const from = points[Math.max(0, index - 1)]!;
  const to = points[Math.min(points.length - 1, index + 1)]!;
  return { x: to.x - from.x, y: to.y - from.y };
}

/**
 * 一筆が往路を逆向きになぞって戻った区間を返す。
 *
 * 点 `i` が `lookbackGap` より前の点 `j` の `snapDistance` 以内にあり、かつ進行方向が
 * 逆向き（内積が負）なら「往路の上に戻っている」とみなす。これが `minRetraceLength`
 * 以上続いた区間を1つの戻りとする。
 *
 * 近くを通るだけの線（距離が離れている、または同じ向き）と、折れ曲がり（短い）は
 * 戻りにしない。勝手に枝へ変えると、描いた本人の意図と違う形になるため。
 */
export function detectRetrace(
  points: readonly Vector2[],
  options: Partial<RetraceOptions> = {}
): readonly RetraceSpan[] {
  const resolved: RetraceOptions = { ...DEFAULT_RETRACE_OPTIONS, ...options };
  if (!Number.isFinite(resolved.snapDistance) || resolved.snapDistance <= 0) {
    throw new RangeError("snapDistance must be finite and greater than zero");
  }
  if (!Number.isFinite(resolved.minRetraceLength) || resolved.minRetraceLength <= 0) {
    throw new RangeError("minRetraceLength must be finite and greater than zero");
  }
  if (!Number.isInteger(resolved.lookbackGap) || resolved.lookbackGap < 1) {
    throw new RangeError("lookbackGap must be a positive integer");
  }
  if (points.length < 2 * resolved.lookbackGap) {
    return [];
  }

  const snapSquared = resolved.snapDistance * resolved.snapDistance;
  /** points[i] が重なっている往路の点index。重なっていなければ -1。 */
  const matched = new Array<number>(points.length).fill(-1);

  for (let index = resolved.lookbackGap; index < points.length; index += 1) {
    const here = points[index]!;
    const heading = directionAt(points, index);
    let bestIndex = -1;
    let bestSquared = snapSquared;

    for (let past = 0; past <= index - resolved.lookbackGap; past += 1) {
      const candidate = squaredDistance(here, points[past]!);
      if (candidate > bestSquared) {
        continue;
      }
      const outbound = directionAt(points, past);
      // 逆向きに重なっているときだけ戻りとみなす。同じ向きの並走は別の線。
      if (heading.x * outbound.x + heading.y * outbound.y >= 0) {
        continue;
      }
      bestSquared = candidate;
      bestIndex = past;
    }
    matched[index] = bestIndex;
  }

  const spans: RetraceSpan[] = [];
  let runStart = -1;

  const closeRun = (endIndex: number): void => {
    if (runStart < 0) {
      return;
    }
    let travelled = 0;
    for (let index = runStart + 1; index <= endIndex; index += 1) {
      travelled += Math.hypot(
        points[index]!.x - points[index - 1]!.x,
        points[index]!.y - points[index - 1]!.y
      );
    }
    if (travelled >= resolved.minRetraceLength) {
      spans.push({ start: runStart, end: endIndex, branchIndex: matched[endIndex]! });
    }
    runStart = -1;
  };

  for (let index = 0; index < points.length; index += 1) {
    if (matched[index]! < 0) {
      closeRun(index - 1);
      continue;
    }
    if (runStart < 0) {
      runStart = index;
    }
  }
  closeRun(points.length - 1);

  return spans;
}
