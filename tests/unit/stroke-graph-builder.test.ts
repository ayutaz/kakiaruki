import { describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "../../src/domain/creature/creature-graph.ts";
import {
  buildGraphFromStroke,
  DEFAULT_STROKE_GRAPH_OPTIONS,
  type StrokeGraphResult
} from "../../src/domain/stroke/stroke-graph-builder.ts";
import type { StrokePoint } from "../../src/domain/stroke/stroke-point.ts";
import { angleOf, distance, subtract, wrapSignedRadians } from "../../src/shared/vector2.ts";
import {
  STROKE_VIEWPORT,
  closedLoopStroke,
  curveStroke,
  lShapeStroke,
  repeatedPointStroke,
  selfIntersectingStroke,
  straightStroke,
  stubTailStroke,
  tooShortStroke,
  zigzagStroke
} from "../fixtures/strokes.ts";

function build(points: readonly StrokePoint[]): StrokeGraphResult {
  return buildGraphFromStroke(points, { viewport: STROKE_VIEWPORT });
}

function expectOk(result: StrokeGraphResult) {
  if (!result.ok) {
    throw new Error(`expected a graph but got: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

function codesOf(result: StrokeGraphResult): string[] {
  return result.ok ? [] : result.errors.map((error) => error.code);
}

function edgeLengths(graph: CreatureGraph): number[] {
  const positions = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return graph.edges.map((edge) =>
    distance(positions.get(edge.nodeA)!, positions.get(edge.nodeB)!)
  );
}

/** 隣り合うEdgeのなす角が閾値を超える節点の数。 */
function sharpCornerCount(graph: CreatureGraph, threshold = 0.5): number {
  const positions = graph.nodes.map((node) => node.position);
  let count = 0;
  for (let index = 1; index < positions.length - 1; index += 1) {
    const incoming = angleOf(subtract(positions[index]!, positions[index - 1]!));
    const outgoing = angleOf(subtract(positions[index + 1]!, positions[index]!));
    if (Math.abs(wrapSignedRadians(outgoing - incoming)) > threshold) {
      count += 1;
    }
  }
  return count;
}

describe("buildGraphFromStroke", () => {
  it("turns a straight stroke into a chain with no sharp corners", () => {
    const { graph } = expectOk(build(straightStroke()));

    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    expect(sharpCornerCount(graph)).toBe(0);
    expect(graph.nodes).toHaveLength(graph.edges.length + 1);
  });

  it("keeps exactly one sharp corner for an L shape", () => {
    const { graph } = expectOk(build(lShapeStroke()));

    expect(sharpCornerCount(graph)).toBe(1);
  });

  it("keeps one sharp corner per turn in a zigzag", () => {
    const { graph } = expectOk(build(zigzagStroke()));

    expect(sharpCornerCount(graph)).toBe(3);
  });

  it("follows a gentle curve with several bones instead of one straight bone", () => {
    const { graph } = expectOk(build(curveStroke()));

    expect(graph.edges.length).toBeGreaterThan(2);
    expect(sharpCornerCount(graph)).toBe(0);
  });

  it("never produces an edge outside the allowed bone length", () => {
    for (const stroke of [straightStroke(), lShapeStroke(), zigzagStroke(), curveStroke()]) {
      const { graph } = expectOk(build(stroke));

      for (const length of edgeLengths(graph)) {
        expect(length).toBeGreaterThanOrEqual(
          DEFAULT_STROKE_GRAPH_OPTIONS.minEdgeLength - 1e-9
        );
        expect(length).toBeLessThanOrEqual(DEFAULT_STROKE_GRAPH_OPTIONS.maxEdgeLength + 1e-9);
      }
    }
  });

  it("merges a stub shorter than the minimum bone instead of rejecting the stroke", () => {
    const { graph } = expectOk(build(stubTailStroke()));

    for (const length of edgeLengths(graph)) {
      expect(length).toBeGreaterThanOrEqual(
        DEFAULT_STROKE_GRAPH_OPTIONS.minEdgeLength - 1e-9
      );
    }
  });

  it("produces a graph that always passes creature validation", () => {
    for (const stroke of [straightStroke(), lShapeStroke(), zigzagStroke(), curveStroke()]) {
      const { graph } = expectOk(build(stroke));
      const validated = validateCreatureGraph(graph);

      expect(validated.ok, validated.ok ? "" : JSON.stringify(validated.errors)).toBe(true);
    }
  });

  it("stays within the bone count limit", () => {
    for (const stroke of [straightStroke(), lShapeStroke(), zigzagStroke(), curveStroke()]) {
      const { graph } = expectOk(build(stroke));

      expect(graph.edges.length).toBeLessThanOrEqual(
        DEFAULT_STROKE_GRAPH_OPTIONS.maxEdgeCount
      );
    }
  });

  it("chooses a root node that exists in the graph", () => {
    const { graph } = expectOk(build(zigzagStroke()));

    expect(graph.nodes.map((node) => node.id)).toContain(graph.rootNodeId);
  });

  it("gives the same graph for the same stroke sampled at very different rates", () => {
    const sparse = expectOk(build(lShapeStroke(30))).graph;
    const dense = expectOk(build(lShapeStroke(3))).graph;

    expect(dense.edges).toHaveLength(sparse.edges.length);
    expect(dense.nodes).toHaveLength(sparse.nodes.length);
    for (const [index, node] of dense.nodes.entries()) {
      expect(distance(node.position, sparse.nodes[index]!.position)).toBeLessThan(0.05);
    }
  });

  it("is deterministic for the same input", () => {
    expect(build(zigzagStroke())).toEqual(build(zigzagStroke()));
  });

  it("rejects a stroke with too few points and says how to fix it", () => {
    const result = build(repeatedPointStroke().slice(0, 1));

    expect(codesOf(result)).toContain("too-few-points");
    if (!result.ok) {
      expect(result.errors[0]!.message.length).toBeGreaterThan(10);
    }
  });

  it("rejects a stroke that never moved", () => {
    expect(codesOf(build(repeatedPointStroke()))).toContain("stroke-too-short");
  });

  it("rejects a stroke that is too short to make a bone", () => {
    expect(codesOf(build(tooShortStroke()))).toContain("stroke-too-short");
  });

  it("rejects a self intersecting stroke instead of guessing what it means", () => {
    expect(codesOf(build(selfIntersectingStroke()))).toContain("self-intersecting");
  });

  it("rejects a closed loop because M4 does not support it yet", () => {
    expect(codesOf(build(closedLoopStroke()))).toContain("closed-loop");
  });

  it("rejects a stroke that needs more bones than the limit allows", () => {
    const result = buildGraphFromStroke(straightStroke(), {
      viewport: STROKE_VIEWPORT,
      maxEdgeCount: 2
    });

    expect(codesOf(result)).toContain("too-many-edges");
  });

  it("explains every rejection in a way a person can act on", () => {
    for (const stroke of [
      tooShortStroke(),
      selfIntersectingStroke(),
      closedLoopStroke()
    ]) {
      const result = build(stroke);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        for (const error of result.errors) {
          expect(error.message.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("reports a preview that matches the graph exactly", () => {
    const { graph, preview } = expectOk(build(zigzagStroke()));

    expect(preview.nodes).toHaveLength(graph.nodes.length);
    expect(preview.edges).toHaveLength(graph.edges.length);
    for (const [index, node] of preview.nodes.entries()) {
      expect(node.position).toEqual(graph.nodes[index]!.position);
    }
  });
});
