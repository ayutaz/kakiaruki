import type { Vector2 } from "../../shared/vector2.ts";

export interface CreatureNode {
  readonly id: string;
  readonly position: Vector2;
}

export interface CreatureEdge {
  readonly id: string;
  readonly nodeA: string;
  readonly nodeB: string;
  readonly radius: number;
}

export interface CreatureGraph {
  readonly nodes: readonly CreatureNode[];
  readonly edges: readonly CreatureEdge[];
  readonly rootNodeId: string;
}

export interface GraphLimits {
  readonly minEdgeLength: number;
  readonly maxEdgeLength: number;
  readonly maxEdgeCount: number;
  readonly maxNodeDegree: number;
  readonly maxTotalLength: number;
  readonly maxCoordinateMagnitude: number;
  readonly minRadius: number;
  readonly maxRadius: number;
}

export const DEFAULT_GRAPH_LIMITS: GraphLimits = {
  minEdgeLength: 0.25,
  maxEdgeLength: 2,
  maxEdgeCount: 16,
  maxNodeDegree: 4,
  maxTotalLength: 24,
  maxCoordinateMagnitude: 8,
  minRadius: 0.05,
  maxRadius: 0.4
};

declare const validatedBrand: unique symbol;

/**
 * `validateCreatureGraph` だけが生成できる型。物理生成側はこの型しか受け取らないため、
 * 未検証のGraphがBody／Joint生成へ到達しない。
 */
export type ValidatedCreatureGraph = CreatureGraph & {
  readonly [validatedBrand]: true;
};
