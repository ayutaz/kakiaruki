/** 画面座標系の生のPointer点。yは下向き。 */
export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  /** 入力時刻 [ms]。実装は `performance.now()` を想定するが、domainは値だけを見る。 */
  readonly time: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export function isFiniteStrokePoint(point: StrokePoint): boolean {
  return (
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.time)
  );
}

export function strokePointDistance(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function isInsideViewport(point: StrokePoint, bounds: ViewportSize): boolean {
  return point.x >= 0 && point.x <= bounds.width && point.y >= 0 && point.y <= bounds.height;
}
