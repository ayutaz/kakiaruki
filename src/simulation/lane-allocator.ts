import type { Vector2 } from "../shared/vector2.ts";

export interface LaneLayout {
  /** 骨格の幅に上乗せする余裕。episode中の移動距離を吸収する。 */
  readonly margin?: number;
  /** 明示指定するとレーン中心間距離を固定する。 */
  readonly spacing?: number;
}

export const DEFAULT_LANE_LAYOUT: { readonly margin: number } = {
  margin: 12
};

export interface LaneAllocation {
  readonly index: number;
  /** この個体のspawn原点へ加算する平行移動。 */
  readonly origin: Vector2;
  /** Box2Dのcollision group。レーンごとに異なる負値にする。 */
  readonly groupIndex: number;
}

export function requiredLaneSpacing(skeletonWidth: number, margin: number): number {
  if (!Number.isFinite(skeletonWidth) || !Number.isFinite(margin)) {
    throw new RangeError("skeletonWidth and margin must be finite");
  }
  if (skeletonWidth < 0 || margin < 0) {
    throw new RangeError("skeletonWidth and margin must be non-negative");
  }
  return skeletonWidth + margin;
}

/**
 * Populationを1つのWorld内のx方向レーンへ並べる。重力方向へは分けないため、
 * すべての個体が同じ地面高さ・同じ初期条件で評価される。
 */
export function planLanes(
  populationSize: number,
  skeletonWidth: number,
  layout: LaneLayout = DEFAULT_LANE_LAYOUT
): readonly LaneAllocation[] {
  if (!Number.isInteger(populationSize) || populationSize < 1) {
    throw new RangeError("populationSize must be a positive integer");
  }
  if (!Number.isFinite(skeletonWidth) || skeletonWidth < 0) {
    throw new RangeError("skeletonWidth must be finite and non-negative");
  }

  const margin = layout.margin ?? DEFAULT_LANE_LAYOUT.margin;
  const spacing = layout.spacing ?? requiredLaneSpacing(skeletonWidth, margin);
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError("spacing must be finite and greater than zero");
  }

  const centreOffset = ((populationSize - 1) * spacing) / 2;
  return Array.from({ length: populationSize }, (_unused, index) => ({
    index,
    origin: { x: index * spacing - centreOffset, y: 0 },
    // 0 は「グループ指定なし」なので使わない。
    groupIndex: -(index + 1)
  }));
}
