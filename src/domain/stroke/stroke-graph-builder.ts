import { distance, type Vector2 } from "../../shared/vector2.ts";
import { validateCreatureGraph } from "../creature/creature-graph-validation.ts";
import type { CreatureEdge, CreatureGraph, CreatureNode } from "../creature/creature-graph.ts";

import {
  normalizeStroke,
  polylineLength,
  resampleByDistance,
  type NormalizeOptions
} from "./stroke-normalize.ts";
import type { StrokePoint, ViewportSize } from "./stroke-point.ts";
import { simplifySegment } from "./stroke-simplify.ts";
import { detectCorners, hasSelfIntersection, isClosedLoop } from "./stroke-topology.ts";

export type StrokeErrorCode =
  | "too-few-points"
  | "stroke-too-short"
  | "self-intersecting"
  | "closed-loop"
  | "too-many-edges"
  | "graph-invalid";

export interface StrokeError {
  readonly code: StrokeErrorCode;
  readonly message: string;
}

export interface StrokePreviewNode {
  readonly id: string;
  readonly position: Vector2;
}

export interface StrokePreviewEdge {
  readonly id: string;
  readonly a: Vector2;
  readonly b: Vector2;
}

export interface StrokePreview {
  readonly nodes: readonly StrokePreviewNode[];
  readonly edges: readonly StrokePreviewEdge[];
}

export interface StrokeGraphOptions extends NormalizeOptions {
  readonly viewport: ViewportSize;
  readonly resampleSpacing: number;
  readonly cornerTurnRadians: number;
  readonly simplifyTolerance: number;
  readonly minEdgeLength: number;
  readonly maxEdgeLength: number;
  readonly maxEdgeCount: number;
  readonly boneRadius: number;
  readonly closeDistance: number;
}

export const DEFAULT_STROKE_GRAPH_OPTIONS: Omit<StrokeGraphOptions, "viewport"> = {
  worldShortSide: 6,
  resampleSpacing: 0.12,
  cornerTurnRadians: 0.5,
  simplifyTolerance: 0.08,
  // docs/04 §5 の初期提案（短辺の2%〜20%）を worldShortSide 6 m に当てはめた値。
  minEdgeLength: 0.35,
  maxEdgeLength: 1.2,
  maxEdgeCount: 10,
  boneRadius: 0.11,
  closeDistance: 0.35
};

export type StrokeGraphResult =
  | { readonly ok: true; readonly graph: CreatureGraph; readonly preview: StrokePreview }
  | { readonly ok: false; readonly errors: readonly StrokeError[] };

function failure(code: StrokeErrorCode, message: string): StrokeGraphResult {
  return { ok: false, errors: [{ code, message }] };
}

/** 折れ曲がり点で区切り、各区間の内部だけをRDPで簡略化して節点列を作る。 */
function buildNodePoints(
  points: readonly Vector2[],
  cornerIndexes: readonly number[],
  tolerance: number
): Vector2[] {
  const keyIndexes = [0, ...cornerIndexes, points.length - 1];
  const nodePoints: Vector2[] = [];

  for (let index = 1; index < keyIndexes.length; index += 1) {
    const from = keyIndexes[index - 1]!;
    const to = keyIndexes[index]!;
    const simplified = simplifySegment(points.slice(from, to + 1), tolerance);
    // 区間の終点は次の区間の始点と重なるので、最後の1点だけ後で足す。
    nodePoints.push(...simplified.slice(0, -1));
  }
  nodePoints.push(points.at(-1)!);
  return nodePoints;
}

/** 最大骨長を超えるEdgeを等分する。 */
function splitLongEdges(nodePoints: readonly Vector2[], maxEdgeLength: number): Vector2[] {
  const result: Vector2[] = [nodePoints[0]!];
  for (let index = 1; index < nodePoints.length; index += 1) {
    const from = nodePoints[index - 1]!;
    const to = nodePoints[index]!;
    const length = distance(from, to);
    const parts = Math.max(1, Math.ceil(length / maxEdgeLength));
    for (let part = 1; part <= parts; part += 1) {
      result.push({
        x: from.x + ((to.x - from.x) * part) / parts,
        y: from.y + ((to.y - from.y) * part) / parts
      });
    }
  }
  return result;
}

/** 最小骨長に満たないEdgeを隣へ統合する。ゼロ長Edgeを残さないための処理。 */
function mergeShortEdges(nodePoints: readonly Vector2[], minEdgeLength: number): Vector2[] {
  const result = [...nodePoints];
  let changed = true;

  while (changed && result.length > 2) {
    changed = false;
    for (let index = 1; index < result.length; index += 1) {
      if (distance(result[index - 1]!, result[index]!) >= minEdgeLength) {
        continue;
      }
      // 端のEdgeが短い場合は端点を残し、内側の節点を落とす。
      const removeIndex = index === result.length - 1 ? index - 1 : index;
      if (removeIndex === 0 || removeIndex === result.length - 1) {
        break;
      }
      result.splice(removeIndex, 1);
      changed = true;
      break;
    }
  }
  return result;
}

/** docs/04 §6: rootはID順ではなく、重心に最も近い節点から決める。 */
function chooseRootIndex(nodePoints: readonly Vector2[]): number {
  let sumX = 0;
  let sumY = 0;
  for (const point of nodePoints) {
    sumX += point.x;
    sumY += point.y;
  }
  const centre: Vector2 = { x: sumX / nodePoints.length, y: sumY / nodePoints.length };

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, point] of nodePoints.entries()) {
    const candidate = distance(point, centre);
    if (candidate < bestDistance - 1e-12) {
      bestDistance = candidate;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * 一筆の点列を `CreatureGraph` へ変換する。
 * M4では枝分かれ・自己交差・閉ループを扱わず、理由付きで拒否する（docs/12 §8 非ゴール）。
 */
export function buildGraphFromStroke(
  points: readonly StrokePoint[],
  options: Partial<StrokeGraphOptions> & { viewport: ViewportSize }
): StrokeGraphResult {
  const resolved: StrokeGraphOptions = { ...DEFAULT_STROKE_GRAPH_OPTIONS, ...options };

  if (points.length < 2) {
    return failure(
      "too-few-points",
      "点が足りません。画面の上で指またはマウスを押したまま線を引いてください。"
    );
  }

  const normalized = normalizeStroke(points, resolved.viewport, resolved);
  const totalLength = polylineLength(normalized);
  if (totalLength < resolved.minEdgeLength) {
    return failure(
      "stroke-too-short",
      `線が短すぎます（${totalLength.toFixed(2)} m）。骨1本ぶんの ${resolved.minEdgeLength} m 以上の長さで描いてください。`
    );
  }

  const resampled = resampleByDistance(normalized, resolved.resampleSpacing);
  if (resampled.length < 2) {
    return failure(
      "stroke-too-short",
      "線が短すぎて骨を作れません。もっと長く描いてください。"
    );
  }

  if (isClosedLoop(resampled, resolved.closeDistance)) {
    return failure(
      "closed-loop",
      "線の終わりが始まりへ戻っています。輪はまだ扱えません。終点を始点から離して描いてください。"
    );
  }
  if (hasSelfIntersection(resampled)) {
    return failure(
      "self-intersecting",
      "線が自分自身と交差しています。交差はまだ扱えません。交わらない一筆で描いてください。"
    );
  }

  const corners = detectCorners(resampled, resolved.cornerTurnRadians);
  let nodePoints = buildNodePoints(resampled, corners, resolved.simplifyTolerance);
  nodePoints = mergeShortEdges(nodePoints, resolved.minEdgeLength);
  nodePoints = splitLongEdges(nodePoints, resolved.maxEdgeLength);
  nodePoints = mergeShortEdges(nodePoints, resolved.minEdgeLength);

  if (nodePoints.length < 2) {
    return failure(
      "stroke-too-short",
      "線が短すぎて骨を作れません。もっと長く描いてください。"
    );
  }

  const edgeCount = nodePoints.length - 1;
  if (edgeCount > resolved.maxEdgeCount) {
    return failure(
      "too-many-edges",
      `骨が ${edgeCount} 本になり、上限の ${resolved.maxEdgeCount} 本を超えます。もっと短いか、単純な形で描いてください。`
    );
  }

  const nodes: CreatureNode[] = nodePoints.map((position, index) => ({
    id: `n${index}`,
    position
  }));
  const edges: CreatureEdge[] = Array.from({ length: edgeCount }, (_unused, index) => ({
    id: `e${index}`,
    nodeA: `n${index}`,
    nodeB: `n${index + 1}`,
    radius: resolved.boneRadius
  }));
  const graph: CreatureGraph = {
    nodes,
    edges,
    rootNodeId: nodes[chooseRootIndex(nodePoints)]!.id
  };

  const validated = validateCreatureGraph(graph, {
    minEdgeLength: resolved.minEdgeLength,
    maxEdgeLength: resolved.maxEdgeLength,
    maxEdgeCount: resolved.maxEdgeCount,
    maxNodeDegree: 4,
    maxTotalLength: resolved.maxEdgeLength * resolved.maxEdgeCount,
    maxCoordinateMagnitude: resolved.worldShortSide,
    minRadius: 0.05,
    maxRadius: 0.4
  });
  if (!validated.ok) {
    return {
      ok: false,
      errors: validated.errors.map((error) => ({
        code: "graph-invalid" as const,
        message: error.message
      }))
    };
  }

  return {
    ok: true,
    graph,
    preview: {
      nodes: nodes.map((node) => ({ id: node.id, position: node.position })),
      edges: edges.map((edge, index) => ({
        id: edge.id,
        a: nodePoints[index]!,
        b: nodePoints[index + 1]!
      }))
    }
  };
}
