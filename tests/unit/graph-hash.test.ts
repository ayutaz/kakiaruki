import { describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { creatureGraphHash } from "../../src/domain/creature/graph-hash.ts";
import { chain4, validFixtures, zigzag6 } from "../fixtures/creature-graphs.ts";

describe("creature graph fixtures", () => {
  it.each(validFixtures)("$name passes validation", ({ graph }) => {
    const result = validateCreatureGraph(graph);

    expect(result.ok, result.ok ? "" : JSON.stringify(result.errors)).toBe(true);
  });

  it("covers the 4 to 6 bone range required by M1", () => {
    for (const { graph } of validFixtures) {
      expect(graph.edges.length).toBeGreaterThanOrEqual(4);
      expect(graph.edges.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("creatureGraphHash", () => {
  it("is stable for the same graph", () => {
    expect(creatureGraphHash(chain4)).toBe(creatureGraphHash(chain4));
  });

  it("ignores node and edge declaration order", () => {
    const reordered = {
      ...chain4,
      nodes: [...chain4.nodes].reverse(),
      edges: [...chain4.edges].reverse()
    };

    expect(creatureGraphHash(reordered)).toBe(creatureGraphHash(chain4));
  });

  it("changes when geometry changes", () => {
    const moved = {
      ...chain4,
      nodes: chain4.nodes.map((node, index) =>
        index === 0
          ? { ...node, position: { x: node.position.x + 0.1, y: node.position.y } }
          : node
      )
    };

    expect(creatureGraphHash(moved)).not.toBe(creatureGraphHash(chain4));
    expect(creatureGraphHash(chain4)).not.toBe(creatureGraphHash(zigzag6));
  });
});
