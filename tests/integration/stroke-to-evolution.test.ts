import { describe, expect, it } from "vitest";

import { runEvolution, type EvolutionRunOptions } from "../../src/app/evolution-run.ts";
import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../../src/domain/evolution/evolution-engine.ts";
import {
  buildGraphFromStroke,
  type StrokeGraphResult
} from "../../src/domain/stroke/stroke-graph-builder.ts";
import type { StrokePoint } from "../../src/domain/stroke/stroke-point.ts";
import { buildSkeletonPlan } from "../../src/simulation/skeleton-plan.ts";
import {
  STROKE_VIEWPORT,
  lShapeStroke,
  selfIntersectingStroke,
  zigzagStroke
} from "../fixtures/strokes.ts";

function drawn(points: readonly StrokePoint[]): StrokeGraphResult {
  return buildGraphFromStroke(points, { viewport: STROKE_VIEWPORT });
}

function graphOf(points: readonly StrokePoint[]) {
  const result = drawn(points);
  if (!result.ok) {
    throw new Error(`stroke was rejected: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

function evolutionOptions(points: readonly StrokePoint[]): EvolutionRunOptions {
  return {
    graph: graphOf(points).graph,
    seed: 7,
    generations: 4,
    evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: 8, eliteCount: 2 },
    episode: { durationSeconds: 2 },
    createdAt: "2026-09-14T00:00:00.000Z"
  };
}

describe("stroke to evolution", () => {
  it("matches the preview counts to the bodies and joints the simulation builds", () => {
    for (const stroke of [lShapeStroke(), zigzagStroke()]) {
      const { graph, preview } = graphOf(stroke);
      const validated = validateCreatureGraph(graph);
      expect(validated.ok).toBe(true);
      if (!validated.ok) {
        return;
      }
      const plan = buildSkeletonPlan(validated.graph);

      // 鎖状Graphでは bone = Edge数、joint = Edge数 - 1 = Node数 - 2。
      expect(plan.bones).toHaveLength(preview.edges.length);
      expect(plan.joints).toHaveLength(preview.edges.length - 1);
      expect(plan.joints).toHaveLength(preview.nodes.length - 2);
    }
  });

  it("learns from a hand drawn L shape", () => {
    const run = runEvolution(evolutionOptions(lShapeStroke()));

    expect(run.generations).toHaveLength(4);
    expect(Number.isFinite(run.bestEver.fitness)).toBe(true);
    expect(run.bestEver.genome.joints).toHaveLength(
      graphOf(lShapeStroke()).graph.edges.length - 1
    );
  });

  it("learns from a hand drawn zigzag", () => {
    const run = runEvolution(evolutionOptions(zigzagStroke()));

    expect(run.generations).toHaveLength(4);
    expect(run.generations.every((stats) => Number.isFinite(stats.bestFitness))).toBe(true);
  });

  it("can stop and run the same drawing again with the same result", () => {
    const options = evolutionOptions(zigzagStroke());

    const first = runEvolution(options);
    const second = runEvolution(options);

    expect(second.generations).toEqual(first.generations);
    expect(second.bestEver.genome).toEqual(first.bestEver.genome);
  });

  it("gives a different drawing a different graph hash", () => {
    const lShape = runEvolution(evolutionOptions(lShapeStroke()));
    const zigzag = runEvolution(evolutionOptions(zigzagStroke()));

    expect(zigzag.graphHash).not.toBe(lShape.graphHash);
  });

  it("never passes a rejected stroke to the learning loop", () => {
    const rejected = drawn(selfIntersectingStroke());

    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.errors[0]!.code).toBe("self-intersecting");
    }
  });
});
