import { distance, type Vector2 } from "../../shared/vector2.ts";
import { validateCreatureGraph } from "../creature/creature-graph-validation.ts";
import type { CreatureEdge, CreatureGraph, CreatureNode } from "../creature/creature-graph.ts";
import {
  mergeShortGraphEdges,
  splitLongGraphEdges
} from "../creature/graph-edit.ts";

import {
  normalizeStroke,
  polylineLength,
  resampleByDistance,
  type NormalizeOptions
} from "./stroke-normalize.ts";
import type { StrokePoint, ViewportSize } from "./stroke-point.ts";
import { simplifySegment } from "./stroke-simplify.ts";
import { detectRetrace, DEFAULT_RETRACE_OPTIONS } from "./stroke-retrace.ts";
import {
  detectCorners,
  hasCrossingSegments,
  isClosedLoop
} from "./stroke-topology.ts";

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
  /** 戻り線を往路と同じ位置とみなす距離 [m]。 */
  readonly retraceSnapDistance: number;
  /** 戻りと認めるのに必要な最小の長さ [m]。 */
  readonly minRetraceLength: number;
  /** 骨を粗くするときの、1本あたりの上限 [m]。 */
  readonly maxCoarseEdgeLength: number;
}

export const DEFAULT_STROKE_GRAPH_OPTIONS: Omit<StrokeGraphOptions, "viewport"> = {
  worldShortSide: 6,
  resampleSpacing: 0.12,
  cornerTurnRadians: 0.5,
  simplifyTolerance: 0.08,
  // docs/04 §5 の初期提案（短辺の2%〜20%）を worldShortSide 6 m に当てはめた値。
  minEdgeLength: 0.35,
  maxEdgeLength: 1.2,
  maxEdgeCount: 20,
  boneRadius: 0.11,
  closeDistance: 0.35,
  retraceSnapDistance: DEFAULT_RETRACE_OPTIONS.snapDistance,
  minRetraceLength: DEFAULT_RETRACE_OPTIONS.minRetraceLength,
  maxCoarseEdgeLength: 2
};

/** 骨を粗くし直す回数の上限。これを超えても収まらない線は拒否する。 */
const MAX_COARSENING_ATTEMPTS = 6;

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

/** docs/04 §6: rootはID順ではなく、重心に最も近い節点から決める。 */
function chooseRootNodeId(nodes: readonly CreatureNode[]): string {
  let sumX = 0;
  let sumY = 0;
  for (const node of nodes) {
    sumX += node.position.x;
    sumY += node.position.y;
  }
  const centre: Vector2 = { x: sumX / nodes.length, y: sumY / nodes.length };

  let bestId = nodes[0]!.id;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const candidate = distance(node.position, centre);
    if (candidate < bestDistance - 1e-12) {
      bestDistance = candidate;
      bestId = node.id;
    }
  }
  return bestId;
}

/** 点列を折れ曲がりで区切り、節点の座標列にする。 */
function runToNodePoints(
  run: readonly Vector2[],
  options: StrokeGraphOptions
): readonly Vector2[] {
  const corners = detectCorners(run, options.cornerTurnRadians);
  return buildNodePoints(run, corners, options.simplifyTolerance);
}

/** 線分 a-b 上で point に最も近い点。 */
function closestOnSegment(point: Vector2, a: Vector2, b: Vector2): Vector2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return a;
  }
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/**
 * 枝が分かれる位置に接続先のNodeを用意する。
 * 近くに既存Nodeがあればそれを使い、無ければ最も近いEdgeを分割して分岐Nodeを作る。
 */
class BranchingGraphBuilder {
  readonly #nodes: CreatureNode[] = [];
  readonly #edges: CreatureEdge[] = [];
  readonly #radius: number;
  #nextNode = 0;
  #nextEdge = 0;

  constructor(radius: number) {
    this.#radius = radius;
  }

  addNode(position: Vector2): string {
    const id = `n${this.#nextNode}`;
    this.#nextNode += 1;
    this.#nodes.push({ id, position });
    return id;
  }

  connect(fromId: string, toId: string): void {
    const id = `e${this.#nextEdge}`;
    this.#nextEdge += 1;
    this.#edges.push({ id, nodeA: fromId, nodeB: toId, radius: this.#radius });
  }

  /** 座標列を鎖として足す。`fromId` を指定するとその節点から伸ばす。 */
  appendChain(points: readonly Vector2[], fromId: string | null): void {
    let previousId = fromId ?? this.addNode(points[0]!);
    for (const position of points.slice(fromId === null ? 1 : 1)) {
      const id = this.addNode(position);
      this.connect(previousId, id);
      previousId = id;
    }
  }

  /** 分岐位置に最も近い接続先を返す。必要ならEdgeを分割する。 */
  attachmentFor(position: Vector2, snapDistance: number): string {
    let bestNodeId: string | null = null;
    let bestNodeDistance = Number.POSITIVE_INFINITY;
    for (const node of this.#nodes) {
      const candidate = distance(node.position, position);
      if (candidate < bestNodeDistance) {
        bestNodeDistance = candidate;
        bestNodeId = node.id;
      }
    }
    if (bestNodeId !== null && bestNodeDistance <= snapDistance) {
      return bestNodeId;
    }

    let bestEdgeIndex = -1;
    let bestEdgeDistance = Number.POSITIVE_INFINITY;
    let bestFoot: Vector2 = position;
    for (const [index, edge] of this.#edges.entries()) {
      const a = this.#positionOf(edge.nodeA);
      const b = this.#positionOf(edge.nodeB);
      const foot = closestOnSegment(position, a, b);
      const candidate = distance(foot, position);
      if (candidate < bestEdgeDistance) {
        bestEdgeDistance = candidate;
        bestEdgeIndex = index;
        bestFoot = foot;
      }
    }
    if (bestEdgeIndex < 0) {
      return bestNodeId ?? this.addNode(position);
    }

    // Edgeの途中から枝を出すため、その位置で1本を2本へ割る。
    const edge = this.#edges[bestEdgeIndex]!;
    const middleId = this.addNode(bestFoot);
    this.#edges.splice(bestEdgeIndex, 1);
    this.connect(edge.nodeA, middleId);
    this.connect(middleId, edge.nodeB);
    return middleId;
  }

  build(): CreatureGraph {
    return {
      nodes: [...this.#nodes],
      edges: [...this.#edges],
      rootNodeId: chooseRootNodeId(this.#nodes)
    };
  }

  #positionOf(id: string): Vector2 {
    return this.#nodes.find((node) => node.id === id)!.position;
  }
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
  // 戻り線で点列を「往路 → 枝1 → 枝2 …」へ切り分ける。戻りがなければ1本の鎖。
  const spans = detectRetrace(resampled, {
    snapDistance: resolved.retraceSnapDistance,
    minRetraceLength: resolved.minRetraceLength
  });

  /**
   * 指定の粗さで骨格を組む。粗さ1.0が既定の骨長。
   *
   * 粗くするのは骨の**上限長**と簡略化の許容誤差だけで、最小骨長は動かさない。
   * 最小骨長を上げると短い骨が次々に統合され、描いた形そのものが消えるため。
   */
  const buildAt = (coarseness: number): CreatureGraph => {
    const minEdgeLength = resolved.minEdgeLength;
    const maxEdgeLength = Math.min(
      resolved.maxEdgeLength * coarseness,
      resolved.maxCoarseEdgeLength
    );
    const options: StrokeGraphOptions = {
      ...resolved,
      minEdgeLength,
      maxEdgeLength,
      simplifyTolerance: resolved.simplifyTolerance * coarseness
    };

    const builder = new BranchingGraphBuilder(resolved.boneRadius);
    let runStart = 0;
    for (const [index, span] of [...spans, null].entries()) {
      const runEnd = span === null ? resampled.length - 1 : span.start;
      const run = resampled.slice(runStart, runEnd + 1);
      const previous = index === 0 ? null : spans[index - 1]!;

      if (run.length >= 2) {
        const nodePoints = runToNodePoints(run, options);
        if (previous === null) {
          builder.appendChain(nodePoints, null);
        } else {
          const branchPoint = resampled[previous.branchIndex]!;
          const attachId = builder.attachmentFor(branchPoint, minEdgeLength / 2);
          builder.appendChain(nodePoints, attachId);
        }
      }
      if (span !== null) {
        runStart = span.end;
      }
    }

    let candidate = builder.build();
    if (candidate.edges.length === 0) {
      return candidate;
    }
    candidate = mergeShortGraphEdges(candidate, minEdgeLength);
    candidate = splitLongGraphEdges(candidate, maxEdgeLength);
    return mergeShortGraphEdges(candidate, minEdgeLength);
  };

  // 長いというだけで拒否しない。骨の本数が上限を超えたら、骨を太く長くして
  // 描いた形のまま収める。何度粗くしても収まらないときだけ理由を返す。
  let graph = buildAt(1);
  let coarseness = 1;
  for (let attempt = 0; attempt < MAX_COARSENING_ATTEMPTS; attempt += 1) {
    if (graph.edges.length <= resolved.maxEdgeCount || graph.edges.length === 0) {
      break;
    }
    coarseness *= Math.max(1.15, graph.edges.length / resolved.maxEdgeCount);
    graph = buildAt(coarseness);
  }

  if (graph.edges.length === 0) {
    return failure(
      "stroke-too-short",
      "線が短すぎて骨を作れません。もっと長く描いてください。"
    );
  }

  const built = new Map(graph.nodes.map((node) => [node.id, node.position]));
  if (
    hasCrossingSegments(
      graph.edges.map((edge) => ({
        a: built.get(edge.nodeA)!,
        b: built.get(edge.nodeB)!
      }))
    )
  ) {
    return failure(
      "self-intersecting",
      "線が自分自身と交差しています。交差はまだ扱えません。交わらない一筆で描いてください。"
    );
  }

  const edgeCount = graph.edges.length;
  if (edgeCount > resolved.maxEdgeCount) {
    return failure(
      "too-many-edges",
      `線が長すぎます。骨を太くしても ${edgeCount} 本必要で、上限の ${resolved.maxEdgeCount} 本に収まりません。もっと短い線で描いてください。`
    );
  }

  const validated = validateCreatureGraph(graph, {
    minEdgeLength: resolved.minEdgeLength,
    maxEdgeLength: resolved.maxCoarseEdgeLength,
    maxEdgeCount: resolved.maxEdgeCount,
    maxNodeDegree: 4,
    maxTotalLength: resolved.maxCoarseEdgeLength * resolved.maxEdgeCount,
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

  const positions = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return {
    ok: true,
    graph,
    preview: {
      nodes: graph.nodes.map((node) => ({ id: node.id, position: node.position })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        a: positions.get(edge.nodeA)!,
        b: positions.get(edge.nodeB)!
      }))
    }
  };
}
