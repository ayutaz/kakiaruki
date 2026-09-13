import { distance, isFiniteVector, type Vector2 } from "../../shared/vector2.ts";

import {
  DEFAULT_GRAPH_LIMITS,
  type CreatureEdge,
  type CreatureGraph,
  type GraphLimits,
  type ValidatedCreatureGraph
} from "./creature-graph.ts";

export type GraphValidationCode =
  | "empty-graph"
  | "unknown-root-node"
  | "duplicate-node-id"
  | "duplicate-edge-id"
  | "missing-node-reference"
  | "self-loop-edge"
  | "duplicate-edge-pair"
  | "non-finite-coordinate"
  | "coordinate-out-of-range"
  | "radius-out-of-range"
  | "edge-too-short"
  | "edge-too-long"
  | "too-many-edges"
  | "node-degree-exceeded"
  | "total-length-exceeded"
  | "isolated-node"
  | "disconnected-graph";

export interface GraphValidationError {
  readonly code: GraphValidationCode;
  readonly message: string;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
}

export type GraphValidationResult =
  | { readonly ok: true; readonly graph: ValidatedCreatureGraph }
  | { readonly ok: false; readonly errors: readonly GraphValidationError[] };

function nodePositions(graph: CreatureGraph): Map<string, Vector2> {
  const positions = new Map<string, Vector2>();
  for (const node of graph.nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, node.position);
    }
  }
  return positions;
}

export function edgeLength(graph: CreatureGraph, edge: CreatureEdge): number {
  const positions = nodePositions(graph);
  const a = positions.get(edge.nodeA);
  const b = positions.get(edge.nodeB);
  if (!a || !b) {
    return Number.NaN;
  }
  return distance(a, b);
}

function undirectedKey(edge: CreatureEdge): string {
  return edge.nodeA < edge.nodeB
    ? `${edge.nodeA}--${edge.nodeB}`
    : `${edge.nodeB}--${edge.nodeA}`;
}

class DisjointSet {
  readonly #parent = new Map<string, string>();

  add(id: string): void {
    if (!this.#parent.has(id)) {
      this.#parent.set(id, id);
    }
  }

  find(id: string): string {
    let current = id;
    let parent = this.#parent.get(current);
    while (parent !== undefined && parent !== current) {
      current = parent;
      parent = this.#parent.get(current);
    }
    return current;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.#parent.set(rootA, rootB);
    }
  }

  componentCount(): number {
    const roots = new Set<string>();
    for (const id of this.#parent.keys()) {
      roots.add(this.find(id));
    }
    return roots.size;
  }
}

export function validateCreatureGraph(
  graph: CreatureGraph,
  limits: GraphLimits = DEFAULT_GRAPH_LIMITS
): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const report = (
    code: GraphValidationCode,
    message: string,
    ids: { nodeIds?: readonly string[]; edgeIds?: readonly string[] } = {}
  ): void => {
    errors.push({
      code,
      message,
      nodeIds: ids.nodeIds ?? [],
      edgeIds: ids.edgeIds ?? []
    });
  };

  if (graph.edges.length === 0) {
    report(
      "empty-graph",
      "骨が1本もありません。2つ以上のNodeをEdgeでつないでから確定してください。"
    );
  }

  const seenNodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (seenNodeIds.has(node.id)) {
      duplicateNodeIds.add(node.id);
    }
    seenNodeIds.add(node.id);
  }
  if (duplicateNodeIds.size > 0) {
    report(
      "duplicate-node-id",
      `Node IDが重複しています: ${[...duplicateNodeIds].join(", ")}。IDは一意にしてください。`,
      { nodeIds: [...duplicateNodeIds] }
    );
  }

  const seenEdgeIds = new Set<string>();
  const duplicateEdgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (seenEdgeIds.has(edge.id)) {
      duplicateEdgeIds.add(edge.id);
    }
    seenEdgeIds.add(edge.id);
  }
  if (duplicateEdgeIds.size > 0) {
    report(
      "duplicate-edge-id",
      `Edge IDが重複しています: ${[...duplicateEdgeIds].join(", ")}。IDは一意にしてください。`,
      { edgeIds: [...duplicateEdgeIds] }
    );
  }

  if (!seenNodeIds.has(graph.rootNodeId)) {
    report(
      "unknown-root-node",
      `rootNodeId "${graph.rootNodeId}" がNode一覧にありません。実在するNode IDを指定してください。`,
      { nodeIds: [graph.rootNodeId] }
    );
  }

  const positions = nodePositions(graph);
  for (const node of graph.nodes) {
    if (!isFiniteVector(node.position)) {
      report(
        "non-finite-coordinate",
        `Node "${node.id}" の座標が有限値ではありません。描き直してください。`,
        { nodeIds: [node.id] }
      );
      continue;
    }
    if (
      Math.abs(node.position.x) > limits.maxCoordinateMagnitude ||
      Math.abs(node.position.y) > limits.maxCoordinateMagnitude
    ) {
      report(
        "coordinate-out-of-range",
        `Node "${node.id}" が描画範囲（±${limits.maxCoordinateMagnitude} m）の外にあります。内側へ収めてください。`,
        { nodeIds: [node.id] }
      );
    }
  }

  const degrees = new Map<string, number>();
  const seenPairs = new Set<string>();
  const resolvedEdges: CreatureEdge[] = [];
  let totalLength = 0;

  for (const edge of graph.edges) {
    const missing: string[] = [];
    if (!positions.has(edge.nodeA)) {
      missing.push(edge.nodeA);
    }
    if (!positions.has(edge.nodeB)) {
      missing.push(edge.nodeB);
    }
    if (missing.length > 0) {
      report(
        "missing-node-reference",
        `Edge "${edge.id}" が存在しないNode（${missing.join(", ")}）を参照しています。`,
        { edgeIds: [edge.id], nodeIds: missing }
      );
      continue;
    }

    if (edge.nodeA === edge.nodeB) {
      report(
        "self-loop-edge",
        `Edge "${edge.id}" が同じNode "${edge.nodeA}" を両端にしています。自己ループは作れません。`,
        { edgeIds: [edge.id], nodeIds: [edge.nodeA] }
      );
      continue;
    }

    const key = undirectedKey(edge);
    if (seenPairs.has(key)) {
      report(
        "duplicate-edge-pair",
        `Edge "${edge.id}" は既に接続済みのNode間を二重につないでいます。片方を削除してください。`,
        { edgeIds: [edge.id], nodeIds: [edge.nodeA, edge.nodeB] }
      );
      continue;
    }
    seenPairs.add(key);

    if (
      !Number.isFinite(edge.radius) ||
      edge.radius < limits.minRadius ||
      edge.radius > limits.maxRadius
    ) {
      report(
        "radius-out-of-range",
        `Edge "${edge.id}" の太さ ${edge.radius} が許容範囲（${limits.minRadius}〜${limits.maxRadius} m）の外です。`,
        { edgeIds: [edge.id] }
      );
    }

    const a = positions.get(edge.nodeA);
    const b = positions.get(edge.nodeB);
    const length = a && b ? distance(a, b) : Number.NaN;
    if (Number.isFinite(length)) {
      totalLength += length;
      if (length < limits.minEdgeLength) {
        report(
          "edge-too-short",
          `Edge "${edge.id}" の長さ ${length.toFixed(3)} m が最小骨長 ${limits.minEdgeLength} m 未満です。もっと長く描いてください。`,
          { edgeIds: [edge.id] }
        );
      } else if (length > limits.maxEdgeLength) {
        report(
          "edge-too-long",
          `Edge "${edge.id}" の長さ ${length.toFixed(3)} m が最大骨長 ${limits.maxEdgeLength} m を超えています。短く分割してください。`,
          { edgeIds: [edge.id] }
        );
      }
    }

    resolvedEdges.push(edge);
    degrees.set(edge.nodeA, (degrees.get(edge.nodeA) ?? 0) + 1);
    degrees.set(edge.nodeB, (degrees.get(edge.nodeB) ?? 0) + 1);
  }

  if (graph.edges.length > limits.maxEdgeCount) {
    report(
      "too-many-edges",
      `骨の本数 ${graph.edges.length} が上限 ${limits.maxEdgeCount} 本を超えています。`,
      { edgeIds: graph.edges.map((edge) => edge.id) }
    );
  }

  if (totalLength > limits.maxTotalLength) {
    report(
      "total-length-exceeded",
      `骨の総延長 ${totalLength.toFixed(3)} m が上限 ${limits.maxTotalLength} m を超えています。`
    );
  }

  const overDegree = [...degrees.entries()]
    .filter(([, degree]) => degree > limits.maxNodeDegree)
    .map(([id]) => id);
  if (overDegree.length > 0) {
    report(
      "node-degree-exceeded",
      `Node（${overDegree.join(", ")}）につながる骨が上限 ${limits.maxNodeDegree} 本を超えています。`,
      { nodeIds: overDegree }
    );
  }

  const isolated = [...positions.keys()].filter((id) => (degrees.get(id) ?? 0) === 0);
  if (isolated.length > 0 && graph.edges.length > 0) {
    report(
      "isolated-node",
      `どの骨にもつながっていないNode（${isolated.join(", ")}）があります。削除するか接続してください。`,
      { nodeIds: isolated }
    );
  }

  if (resolvedEdges.length > 0) {
    const components = new DisjointSet();
    for (const edge of resolvedEdges) {
      components.add(edge.nodeA);
      components.add(edge.nodeB);
      components.union(edge.nodeA, edge.nodeB);
    }
    if (components.componentCount() > 1) {
      report(
        "disconnected-graph",
        "骨格が複数のかたまりに分かれています。一筆でつながる形にしてください。"
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, graph: graph as ValidatedCreatureGraph };
}
