import type { CreatureGraph } from "./creature-graph.ts";

const COORDINATE_DIGITS = 6;

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(COORDINATE_DIGITS) : "nan";
}

/**
 * 宣言順に依存しない正規化表現。Edge IDは含めないため、同じ形なら同じhashになる。
 */
function normalize(graph: CreatureGraph): string {
  const nodeParts = graph.nodes
    .map((node) => `${node.id}|${fixed(node.position.x)}|${fixed(node.position.y)}`)
    .sort();
  const edgeParts = graph.edges
    .map((edge) => {
      const [first, second] =
        edge.nodeA <= edge.nodeB ? [edge.nodeA, edge.nodeB] : [edge.nodeB, edge.nodeA];
      return `${first}~${second}|${fixed(edge.radius)}`;
    })
    .sort();
  return `n:${nodeParts.join(";")}\ne:${edgeParts.join(";")}\nr:${graph.rootNodeId}`;
}

function fnv1a32(text: string, offsetBasis: number): number {
  let hash = offsetBasis;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 16桁hex。FNV-1aを異なるoffset basisで2回計算して連結する。 */
export function creatureGraphHash(graph: CreatureGraph): string {
  const normalized = normalize(graph);
  const high = fnv1a32(normalized, 0x811c9dc5);
  const low = fnv1a32(`${normalized}#`, 0x9dc5811c);
  return `${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}
