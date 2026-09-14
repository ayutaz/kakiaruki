import { afterEach, describe, expect, it } from "vitest";

import { EvolutionRunner } from "../../src/app/evolution-run.ts";
import { ObservationSession } from "../../src/app/observation-session.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../../src/domain/evolution/evolution-engine.ts";
import { buildGraphFromStroke } from "../../src/domain/stroke/stroke-graph-builder.ts";
import { STROKE_VIEWPORT, humanoidStroke } from "../fixtures/strokes.ts";

const POPULATION = 32;
const GENERATIONS = 100;

const sessions: ObservationSession[] = [];

function makeSession(): ObservationSession {
  const session = new ObservationSession();
  sessions.push(session);
  return session;
}

function drawnGraph() {
  const result = buildGraphFromStroke(humanoidStroke(), { viewport: STROKE_VIEWPORT });
  if (!result.ok) {
    throw new Error(`stroke was rejected: ${JSON.stringify(result.errors)}`);
  }
  return result.graph;
}

afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.dispose();
  }
});

describe("long run", () => {
  it("keeps every statistic finite across 100 generations of a drawn creature", () => {
    const session = makeSession();
    const runner = new EvolutionRunner({
      graph: drawnGraph(),
      seed: 3,
      generations: GENERATIONS,
      evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: POPULATION },
      episode: { durationSeconds: 2 },
      createdAt: "2026-09-14T00:00:00.000Z",
      world: session.physicsWorld
    });

    while (runner.advance()) {
      // 1世代ずつ進める
    }
    const run = runner.result();

    expect(run).not.toBeNull();
    expect(run!.generations).toHaveLength(GENERATIONS);
    for (const stats of run!.generations) {
      expect(Number.isFinite(stats.bestFitness)).toBe(true);
      expect(Number.isFinite(stats.medianFitness)).toBe(true);
      expect(Number.isFinite(stats.meanFitness)).toBe(true);
      expect(Number.isFinite(stats.bestNormalizedForwardProgress)).toBe(true);
    }
    for (const best of run!.bestPerGeneration) {
      expect(Number.isFinite(best.episode.endCenterOfMass.x)).toBe(true);
      expect(Number.isFinite(best.episode.endCenterOfMass.y)).toBe(true);
      expect(Number.isFinite(best.episode.motorEffort)).toBe(true);
    }

    // 100世代まわしても、Worldは地面だけに戻る。
    expect(session.shapeCount()).toBe(1);
    // Population 32 × 100世代は既定の5秒では終わらない。長時間runの試験なので明示する。
  }, 120_000);

  it("survives many draw, learn and observe cycles on one world", () => {
    const session = makeSession();
    const graph = drawnGraph();

    for (let cycle = 0; cycle < 12; cycle += 1) {
      const runner = new EvolutionRunner({
        graph,
        seed: cycle + 1,
        generations: 2,
        evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: 8, eliteCount: 2 },
        episode: { durationSeconds: 0.5 },
        createdAt: "2026-09-14T00:00:00.000Z",
        world: session.physicsWorld
      });
      while (runner.advance()) {
        // 学習
      }
      const run = runner.result()!;

      session.start(graph, [run.bestEver.genome], { episodeSeconds: 0.5 });
      while (!session.finished) {
        session.advance(1 / 60, 8);
      }
      const [snapshot] = session.snapshots(1);
      expect(Number.isFinite(snapshot!.centerOfMass.x)).toBe(true);
      session.stop();
      expect(session.shapeCount()).toBe(1);
    }
  }, 60_000);
});
