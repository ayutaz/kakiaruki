import { describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "../../src/domain/creature/creature-graph.ts";
import {
  mergeShortGraphEdges,
  removeLastEdge,
  splitLongGraphEdges
} from "../../src/domain/creature/graph-edit.ts";
import { distance } from "../../src/shared/vector2.ts";
import { chain4, yBranch5 } from "../fixtures/creature-graphs.ts";

function edgeLengths(graph: CreatureGraph): number[] {
  const at = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return graph.edges.map((edge) => distance(at.get(edge.nodeA)!, at.get(edge.nodeB)!));
}

function degrees(graph: CreatureGraph): Map<string, number> {
  const counts = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    counts.set(edge.nodeA, (counts.get(edge.nodeA) ?? 0) + 1);
    counts.set(edge.nodeB, (counts.get(edge.nodeB) ?? 0) + 1);
  }
  return counts;
}

describe("splitLongGraphEdges", () => {
  it("splits every edge longer than the limit into equal parts", () => {
    const split = splitLongGraphEdges(chain4, 0.3);

    for (const length of edgeLengths(split)) {
      expect(length).toBeLessThanOrEqual(0.3 + 1e-9);
    }
    expect(validateCreatureGraph(split).ok).toBe(true);
  });

  it("leaves a graph alone when every edge already fits", () => {
    expect(splitLongGraphEdges(chain4, 2)).toEqual(chain4);
  });

  it("keeps the branch structure of a Y shaped graph", () => {
    const split = splitLongGraphEdges(yBranch5, 0.3);

    expect(Math.max(...degrees(split).values())).toBe(3);
  });
});

describe("mergeShortGraphEdges", () => {
  it("removes a node that leaves an edge shorter than the limit", () => {
    const withStub: CreatureGraph = {
      nodes: [...chain4.nodes, { id: "stub", position: { x: 3.3, y: 0 } }],
      edges: [
        ...chain4.edges,
        { id: "stub-e", nodeA: "chain4-n4", nodeB: "stub", radius: 0.11 }
      ],
      rootNodeId: chain4.rootNodeId
    };

    const merged = mergeShortGraphEdges(withStub, 0.25);

    expect(merged.nodes).toHaveLength(chain4.nodes.length);
    expect(merged.edges).toHaveLength(chain4.edges.length);
    expect(validateCreatureGraph(merged).ok).toBe(true);
  });

  it("never removes a branch node", () => {
    // 分岐点に短い枝がぶら下がっている。畳むなら葉の側を消す。
    const at = new Map(yBranch5.nodes.map((node) => [node.id, node.position]));
    const branchId = "c";
    const stubPosition = {
      x: at.get(branchId)!.x + 0.05,
      y: at.get(branchId)!.y + 0.05
    };
    const withStub: CreatureGraph = {
      nodes: [...yBranch5.nodes, { id: "stub", position: stubPosition }],
      edges: [
        ...yBranch5.edges,
        { id: "stub-e", nodeA: branchId, nodeB: "stub", radius: 0.11 }
      ],
      rootNodeId: yBranch5.rootNodeId
    };

    const merged = mergeShortGraphEdges(withStub, 0.25);

    expect(merged.nodes.map((node) => node.id)).toContain(branchId);
    expect(merged.nodes.map((node) => node.id)).not.toContain("stub");
  });

  it("leaves a short edge between two branch nodes alone", () => {
    // 両端とも分岐点なので、どちらを消しても形が変わる。
    // 勝手に変えるより、validationで理由を返す方が良い（docs/04 §5）。
    const twoJunctions: CreatureGraph = {
      rootNodeId: "left",
      nodes: [
        { id: "left", position: { x: 0, y: 0 } },
        { id: "right", position: { x: 0.1, y: 0 } },
        { id: "lu", position: { x: -0.6, y: 0.5 } },
        { id: "ld", position: { x: -0.6, y: -0.5 } },
        { id: "ru", position: { x: 0.7, y: 0.5 } },
        { id: "rd", position: { x: 0.7, y: -0.5 } }
      ],
      edges: [
        { id: "e-lu", nodeA: "left", nodeB: "lu", radius: 0.11 },
        { id: "e-ld", nodeA: "left", nodeB: "ld", radius: 0.11 },
        { id: "e-mid", nodeA: "left", nodeB: "right", radius: 0.11 },
        { id: "e-ru", nodeA: "right", nodeB: "ru", radius: 0.11 },
        { id: "e-rd", nodeA: "right", nodeB: "rd", radius: 0.11 }
      ]
    };

    const merged = mergeShortGraphEdges(twoJunctions, 0.25);

    expect(merged).toEqual(twoJunctions);
    const validated = validateCreatureGraph(merged);
    expect(validated.ok).toBe(false);
    if (!validated.ok) {
      expect(validated.errors.map((error) => error.code)).toContain("edge-too-short");
    }
  });

  it("moves the root when the root node is the one merged away", () => {
    const rootStub: CreatureGraph = {
      rootNodeId: "stub",
      nodes: [...chain4.nodes, { id: "stub", position: { x: -0.05, y: 0 } }],
      edges: [
        { id: "stub-e", nodeA: "stub", nodeB: "chain4-n0", radius: 0.11 },
        ...chain4.edges
      ]
    };

    const merged = mergeShortGraphEdges(rootStub, 0.25);

    expect(merged.nodes.map((node) => node.id)).not.toContain("stub");
    expect(merged.rootNodeId).toBe("chain4-n0");
    expect(validateCreatureGraph(merged).ok).toBe(true);
  });
});

describe("removeLastEdge", () => {
  it("removes the last edge and any node it leaves isolated", () => {
    const undone = removeLastEdge(chain4);

    expect(undone.edges).toHaveLength(chain4.edges.length - 1);
    expect(undone.nodes).toHaveLength(chain4.nodes.length - 1);
    expect(validateCreatureGraph(undone).ok).toBe(true);
  });

  it("keeps a node that other edges still use", () => {
    const undone = removeLastEdge(yBranch5);

    expect(undone.edges).toHaveLength(yBranch5.edges.length - 1);
    expect(validateCreatureGraph(undone).ok).toBe(true);
  });

  it("gives the same graph when the same input is drawn again", () => {
    expect(removeLastEdge(chain4)).toEqual(removeLastEdge(chain4));
  });

  it("refuses to empty the graph", () => {
    const single: CreatureGraph = {
      nodes: chain4.nodes.slice(0, 2),
      edges: chain4.edges.slice(0, 1),
      rootNodeId: chain4.rootNodeId
    };

    expect(removeLastEdge(single)).toEqual(single);
  });
});
