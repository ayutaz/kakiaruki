import { distance, type Vector2 } from "../../shared/vector2.ts";

import type { CreatureEdge, CreatureGraph, CreatureNode } from "./creature-graph.ts";

function positionsOf(graph: CreatureGraph): Map<string, Vector2> {
  return new Map(graph.nodes.map((node) => [node.id, node.position]));
}

function degreesOf(graph: CreatureGraph): Map<string, number> {
  const counts = new Map<string, number>(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    counts.set(edge.nodeA, (counts.get(edge.nodeA) ?? 0) + 1);
    counts.set(edge.nodeB, (counts.get(edge.nodeB) ?? 0) + 1);
  }
  return counts;
}

/**
 * `maxEdgeLength` を超えるEdgeを等分し、中間Nodeを挿す。
 * 枝の形（どのNodeがどのNodeと繋がるか）は変えない。
 */
export function splitLongGraphEdges(
  graph: CreatureGraph,
  maxEdgeLength: number
): CreatureGraph {
  if (!Number.isFinite(maxEdgeLength) || maxEdgeLength <= 0) {
    throw new RangeError("maxEdgeLength must be finite and greater than zero");
  }

  const positions = positionsOf(graph);
  const nodes: CreatureNode[] = [...graph.nodes];
  const edges: CreatureEdge[] = [];
  let addedNodes = 0;
  let addedEdges = 0;

  for (const edge of graph.edges) {
    const from = positions.get(edge.nodeA)!;
    const to = positions.get(edge.nodeB)!;
    const parts = Math.max(1, Math.ceil(distance(from, to) / maxEdgeLength));
    if (parts === 1) {
      edges.push(edge);
      continue;
    }

    let previousId = edge.nodeA;
    for (let part = 1; part < parts; part += 1) {
      const id = `${edge.id}-s${part}`;
      nodes.push({
        id,
        position: {
          x: from.x + ((to.x - from.x) * part) / parts,
          y: from.y + ((to.y - from.y) * part) / parts
        }
      });
      addedNodes += 1;
      edges.push({ id: `${edge.id}-p${part}`, nodeA: previousId, nodeB: id, radius: edge.radius });
      addedEdges += 1;
      previousId = id;
    }
    edges.push({
      id: `${edge.id}-p${parts}`,
      nodeA: previousId,
      nodeB: edge.nodeB,
      radius: edge.radius
    });
    addedEdges += 1;
  }

  if (addedNodes === 0 && addedEdges === 0) {
    return graph;
  }
  return { nodes, edges, rootNodeId: graph.rootNodeId };
}

/**
 * `minEdgeLength` 未満のEdgeを畳む。
 *
 * 畳むときは必ず**次数の小さい側のNodeを消す**。分岐点（次数3以上）とrootは残す。
 * 両端とも消せない場合は畳まずに残し、validationで理由付きで拒否させる。
 * 勝手に枝の形を変えるより、描いた人へ理由を返す方が良いため（docs/04 §5）。
 */
export function mergeShortGraphEdges(
  graph: CreatureGraph,
  minEdgeLength: number
): CreatureGraph {
  if (!Number.isFinite(minEdgeLength) || minEdgeLength <= 0) {
    throw new RangeError("minEdgeLength must be finite and greater than zero");
  }

  let nodes: CreatureNode[] = [...graph.nodes];
  let edges: CreatureEdge[] = [...graph.edges];
  let rootNodeId = graph.rootNodeId;
  let changed = true;

  while (changed && edges.length > 1) {
    changed = false;
    const positions = new Map(nodes.map((node) => [node.id, node.position]));
    const degrees = degreesOf({ nodes, edges, rootNodeId });

    for (const edge of edges) {
      const from = positions.get(edge.nodeA)!;
      const to = positions.get(edge.nodeB)!;
      if (distance(from, to) >= minEdgeLength) {
        continue;
      }

      const candidates = [edge.nodeA, edge.nodeB]
        .filter((id) => (degrees.get(id) ?? 0) <= 2)
        .sort((left, right) => (degrees.get(left) ?? 0) - (degrees.get(right) ?? 0));
      const removed = candidates[0];
      if (removed === undefined) {
        continue;
      }
      const kept = removed === edge.nodeA ? edge.nodeB : edge.nodeA;
      if (removed === rootNodeId) {
        rootNodeId = kept;
      }

      nodes = nodes.filter((node) => node.id !== removed);
      edges = edges
        .filter((candidate) => candidate.id !== edge.id)
        .map((candidate) => ({
          ...candidate,
          nodeA: candidate.nodeA === removed ? kept : candidate.nodeA,
          nodeB: candidate.nodeB === removed ? kept : candidate.nodeB
        }));
      changed = true;
      break;
    }
  }

  if (nodes.length === graph.nodes.length && edges.length === graph.edges.length) {
    return graph;
  }
  return { nodes, edges, rootNodeId };
}

/**
 * 最後に追加されたEdgeを1本消す。Edge単位のUndo。
 * 消したことで次数0になったNodeも一緒に消す。骨1本は残す。
 */
export function removeLastEdge(graph: CreatureGraph): CreatureGraph {
  if (graph.edges.length <= 1) {
    return graph;
  }

  const edges = graph.edges.slice(0, -1);
  const used = new Set<string>();
  for (const edge of edges) {
    used.add(edge.nodeA);
    used.add(edge.nodeB);
  }
  const nodes = graph.nodes.filter((node) => used.has(node.id));
  const rootNodeId = used.has(graph.rootNodeId) ? graph.rootNodeId : nodes[0]!.id;

  return { nodes, edges, rootNodeId };
}
