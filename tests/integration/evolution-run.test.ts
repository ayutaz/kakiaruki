import { describe, expect, it } from "vitest";

import {
  replayGenome,
  runEvolution,
  type EvolutionRunOptions
} from "../../src/app/evolution-run.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../../src/domain/evolution/evolution-engine.ts";
import { chain4, zigzag6 } from "../fixtures/creature-graphs.ts";

const BASE = {
  graph: zigzag6,
  seed: 1,
  generations: 6,
  evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: 8, eliteCount: 2 },
  episode: { durationSeconds: 2 },
  createdAt: "2026-09-14T00:00:00.000Z"
} satisfies EvolutionRunOptions;

describe("runEvolution", () => {
  it("records one statistics entry per generation", () => {
    const run = runEvolution(BASE);

    expect(run.generations).toHaveLength(6);
    for (const [index, stats] of run.generations.entries()) {
      expect(stats.generation).toBe(index);
      expect(Number.isFinite(stats.bestFitness)).toBe(true);
      expect(Number.isFinite(stats.medianFitness)).toBe(true);
      expect(Number.isFinite(stats.bestNormalizedForwardProgress)).toBe(true);
    }
  });

  it("reproduces the whole run for the same seed and settings", () => {
    expect(runEvolution(BASE)).toEqual(runEvolution(BASE));
  });

  it("produces a different run for a different seed", () => {
    const first = runEvolution(BASE);
    const second = runEvolution({ ...BASE, seed: 2 });

    expect(second.generations).not.toEqual(first.generations);
    expect(second.seed).toBe(2);
  });

  it("keeps the best ever individual and the generation it appeared in", () => {
    const run = runEvolution(BASE);
    const bestPerGeneration = Math.max(
      ...run.generations.map((stats) => stats.bestFitness)
    );

    expect(run.bestEver.fitness).toBeCloseTo(bestPerGeneration, 9);
    expect(run.bestEver.generation).toBeGreaterThanOrEqual(0);
    expect(run.bestEver.generation).toBeLessThan(run.generations.length);
    expect(run.bestEver.genome.joints).toHaveLength(5);
  });

  it("reaches the same fitness when the best genome is replayed", () => {
    const run = runEvolution(BASE);

    const replay = replayGenome({
      graph: BASE.graph,
      seed: BASE.seed,
      genome: run.bestEver.genome,
      episode: BASE.episode,
      createdAt: BASE.createdAt
    });

    expect(replay.fitness.fitness).toBeCloseTo(run.bestEver.fitness, 6);
    expect(replay.fitness.terms.forwardProgress).toBeCloseTo(
      run.bestEver.terms.forwardProgress,
      6
    );
  });

  it("keeps the control group flat when evolution is switched off", () => {
    const control = runEvolution({ ...BASE, disableEvolution: true });
    const bests = control.generations.map((stats) => stats.bestFitness);

    expect(control.generations).toHaveLength(6);
    for (const best of bests) {
      expect(best).toBeCloseTo(bests[0]!, 9);
    }
  });

  it("starts the evolved run from the same generation zero as the control", () => {
    const evolved = runEvolution(BASE);
    const control = runEvolution({ ...BASE, disableEvolution: true });

    expect(control.generations[0]!.bestFitness).toBeCloseTo(
      evolved.generations[0]!.bestFitness,
      9
    );
  });

  it("finishes every generation even when individuals are disqualified", () => {
    const run = runEvolution({ ...BASE, episode: { durationSeconds: 2, maxDisplacement: 2 } });

    expect(run.generations).toHaveLength(6);
    expect(run.generations.some((stats) => stats.invalidCount > 0)).toBe(true);
  });

  it("keeps the best individual of every generation for inspection and replay", () => {
    const run = runEvolution(BASE);

    expect(run.bestPerGeneration).toHaveLength(6);
    for (const [index, best] of run.bestPerGeneration.entries()) {
      expect(best.generation).toBe(index);
      expect(best.fitness).toBeCloseTo(run.generations[index]!.bestFitness, 9);
      expect(best.genome.joints).toHaveLength(5);
    }
    expect(run.bestPerGeneration.at(-1)!.fitness).toBeLessThanOrEqual(
      run.bestEver.fitness + 1e-9
    );
  });

  it("writes a reproducible run record", () => {
    const run = runEvolution(BASE);

    expect(run.runRecord.seed).toBe(1);
    expect(run.runRecord.graphHash).toBe(run.graphHash);
    expect(run.runRecord.schemaVersion).toBe(1);
    expect(run.runRecord.createdAt).toBe("2026-09-14T00:00:00.000Z");
    expect(run.runRecord.summary.status).toBe("completed");
  });

  it("works for a different fixture with a different joint count", () => {
    const run = runEvolution({ ...BASE, graph: chain4, generations: 3 });

    expect(run.bestEver.genome.joints).toHaveLength(3);
    expect(run.generations).toHaveLength(3);
  });

  it("refuses an invalid graph with a readable reason", () => {
    expect(() =>
      runEvolution({
        ...BASE,
        graph: { nodes: [], edges: [], rootNodeId: "missing" }
      })
    ).toThrow(/empty-graph/);
  });

  it("refuses a non positive generation count", () => {
    expect(() => runEvolution({ ...BASE, generations: 0 })).toThrow(/generations/);
  });
});
