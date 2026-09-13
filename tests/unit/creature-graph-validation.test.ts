import { describe, expect, it } from "vitest";

import type { CreatureGraph } from "../../src/domain/creature/creature-graph.ts";
import { DEFAULT_GRAPH_LIMITS } from "../../src/domain/creature/creature-graph.ts";
import {
  validateCreatureGraph,
  type GraphValidationCode
} from "../../src/domain/creature/creature-graph-validation.ts";

function codesOf(graph: CreatureGraph): GraphValidationCode[] {
  const result = validateCreatureGraph(graph);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

const chain: CreatureGraph = {
  rootNodeId: "n0",
  nodes: [
    { id: "n0", position: { x: 0, y: 0 } },
    { id: "n1", position: { x: 0.8, y: 0 } },
    { id: "n2", position: { x: 1.6, y: 0 } }
  ],
  edges: [
    { id: "e0", nodeA: "n0", nodeB: "n1", radius: 0.12 },
    { id: "e1", nodeA: "n1", nodeB: "n2", radius: 0.12 }
  ]
};

describe("validateCreatureGraph", () => {
  it("accepts a well formed chain and brands it as validated", () => {
    const result = validateCreatureGraph(chain);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.edges).toHaveLength(2);
    }
  });

  it("reports every broken invariant instead of throwing", () => {
    const broken: CreatureGraph = {
      rootNodeId: "missing",
      nodes: [
        { id: "n0", position: { x: 0, y: 0 } },
        { id: "n0", position: { x: 1, y: 0 } },
        { id: "far", position: { x: 999, y: 0 } },
        { id: "nan", position: { x: Number.NaN, y: 0 } }
      ],
      edges: [
        { id: "e0", nodeA: "n0", nodeB: "ghost", radius: 0.12 },
        { id: "e1", nodeA: "n0", nodeB: "n0", radius: 0.12 }
      ]
    };

    const codes = codesOf(broken);

    expect(codes).toContain("unknown-root-node");
    expect(codes).toContain("duplicate-node-id");
    expect(codes).toContain("missing-node-reference");
    expect(codes).toContain("self-loop-edge");
    expect(codes).toContain("non-finite-coordinate");
    expect(codes).toContain("coordinate-out-of-range");
  });

  it("rejects edges shorter than the minimum bone length", () => {
    const tiny: CreatureGraph = {
      rootNodeId: "n0",
      nodes: [
        { id: "n0", position: { x: 0, y: 0 } },
        { id: "n1", position: { x: DEFAULT_GRAPH_LIMITS.minEdgeLength / 2, y: 0 } }
      ],
      edges: [{ id: "e0", nodeA: "n0", nodeB: "n1", radius: 0.12 }]
    };

    expect(codesOf(tiny)).toContain("edge-too-short");
  });

  it("rejects a graph that is not a single connected component", () => {
    const split: CreatureGraph = {
      rootNodeId: "n0",
      nodes: [
        { id: "n0", position: { x: 0, y: 0 } },
        { id: "n1", position: { x: 0.8, y: 0 } },
        { id: "n2", position: { x: 3, y: 0 } },
        { id: "n3", position: { x: 3.8, y: 0 } }
      ],
      edges: [
        { id: "e0", nodeA: "n0", nodeB: "n1", radius: 0.12 },
        { id: "e1", nodeA: "n2", nodeB: "n3", radius: 0.12 }
      ]
    };

    expect(codesOf(split)).toContain("disconnected-graph");
  });

  it("rejects a node whose degree exceeds the limit", () => {
    const hub: CreatureGraph = {
      rootNodeId: "c",
      nodes: [
        { id: "c", position: { x: 0, y: 0 } },
        { id: "a", position: { x: 0.8, y: 0 } },
        { id: "b", position: { x: -0.8, y: 0 } },
        { id: "d", position: { x: 0, y: 0.8 } },
        { id: "e", position: { x: 0, y: -0.8 } },
        { id: "f", position: { x: 0.6, y: 0.6 } }
      ],
      edges: [
        { id: "e0", nodeA: "c", nodeB: "a", radius: 0.12 },
        { id: "e1", nodeA: "c", nodeB: "b", radius: 0.12 },
        { id: "e2", nodeA: "c", nodeB: "d", radius: 0.12 },
        { id: "e3", nodeA: "c", nodeB: "e", radius: 0.12 },
        { id: "e4", nodeA: "c", nodeB: "f", radius: 0.12 }
      ]
    };

    expect(codesOf(hub)).toContain("node-degree-exceeded");
  });

  it("rejects a duplicated edge between the same pair of nodes", () => {
    const doubled: CreatureGraph = {
      ...chain,
      edges: [
        ...chain.edges,
        { id: "e2", nodeA: "n1", nodeB: "n0", radius: 0.12 }
      ]
    };

    expect(codesOf(doubled)).toContain("duplicate-edge-pair");
  });

  it("rejects a node that no edge connects to", () => {
    const stray: CreatureGraph = {
      ...chain,
      nodes: [...chain.nodes, { id: "lonely", position: { x: 2.5, y: 1 } }]
    };

    expect(codesOf(stray)).toContain("isolated-node");
  });

  it("explains how to fix the graph in the error message", () => {
    const result = validateCreatureGraph({
      rootNodeId: "n0",
      nodes: [{ id: "n0", position: { x: 0, y: 0 } }],
      edges: []
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const [first] = result.errors;
      expect(first?.code).toBe("empty-graph");
      expect(first?.message.length).toBeGreaterThan(10);
    }
  });
});
