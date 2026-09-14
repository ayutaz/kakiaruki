import { afterEach, describe, expect, it } from "vitest";

import {
  replayGenome,
  runEvolution,
  type EvolutionRunOptions
} from "../../src/app/evolution-run.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../../src/domain/evolution/evolution-engine.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
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

describe("runEvolution with a caller owned world", () => {
  const worlds: PhysicsWorld[] = [];

  const makeWorld = (
    options?: Parameters<typeof createPhysicsWorld>[0]
  ): PhysicsWorld => {
    const world = createPhysicsWorld(options);
    worlds.push(world);
    return world;
  };

  afterEach(() => {
    for (const world of worlds.splice(0)) {
      world.destroy();
    }
  });

  it("evaluates inside the given world instead of a fresh one", () => {
    // 渡したWorldを本当に使っているかは、重力を変えた World を渡して結果が変わることで示す。
    const earthLike = makeWorld();
    const floaty = makeWorld({ gravityY: -2 });

    const onEarth = runEvolution({ ...BASE, world: earthLike });
    const inSpace = runEvolution({ ...BASE, world: floaty });

    expect(inSpace.generations).not.toEqual(onEarth.generations);
  });

  it("leaves the given world alive and empty", () => {
    const world = makeWorld();

    const injected = runEvolution({ ...BASE, world });

    expect(injected.generations).toEqual(runEvolution(BASE).generations);
    expect(world.countShapes()).toBe(1);
  });

  it("runs more times than Box2D has world slots", () => {
    // phaser-box2d 1.1.0 の b2DestroyWorld は slot を解放しないため、毎回 World を
    // 作り直すと 32 回で "did not allocate a world" になる。長時間開いたページでも
    // 学習を繰り返せることを、この試験で固定する。
    const world = makeWorld();
    const tiny = {
      ...BASE,
      generations: 1,
      evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: 4, eliteCount: 1 },
      episode: { durationSeconds: 0.2 },
      world
    } satisfies EvolutionRunOptions;

    for (let index = 0; index < 40; index += 1) {
      expect(runEvolution(tiny).generations).toHaveLength(1);
    }

    expect(world.countShapes()).toBe(1);
  });

  it("reuses the given world for a replay as well", () => {
    const world = makeWorld();
    const run = runEvolution({ ...BASE, world });

    const replay = replayGenome({
      graph: BASE.graph,
      seed: BASE.seed,
      genome: run.bestEver.genome,
      episode: BASE.episode,
      createdAt: BASE.createdAt,
      world
    });

    expect(replay.fitness.fitness).toBeCloseTo(run.bestEver.fitness, 6);
    expect(world.countShapes()).toBe(1);
  });
});
