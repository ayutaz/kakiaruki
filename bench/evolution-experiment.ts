/**
 * M3の判定実験。5 Seed × 50世代 × Population 32 を、進化群と
 * 「初期Populationを毎世代再評価するだけ」の対照群の両方で実行する。
 *
 * 合格条件（測定開始前に固定、docs/12 §7）:
 *   1. 5 Seedのうち4 Seed以上で、generation 0 の best normalized distance が改善する。
 *   2. 進化群 best の中央値が、対照群 best の中央値を上回る。
 *
 * 実行: npm run experiment
 */
import { cpus } from "node:os";

import { runEvolution, type EvolutionRunResult } from "../src/app/evolution-run.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../src/domain/evolution/evolution-engine.ts";
import type { CreatureGraph } from "../src/domain/creature/creature-graph.ts";

const SEEDS = [1, 2, 3, 5, 8] as const;
const GENERATIONS = 50;
const POPULATION_SIZE = 32;
const EPISODE_SECONDS = 6;
const IMPROVED_SEEDS_REQUIRED = 4;

const RADIUS = 0.11;

/** tests/fixtures の zigzag6 と同じ6ボーン骨格。benchはテストコードへ依存しない。 */
const zigzag6: CreatureGraph = {
  rootNodeId: "n0",
  nodes: (
    [
      [0, 0],
      [0.6, 0.5],
      [1.2, 0],
      [1.8, 0.5],
      [2.4, 0],
      [3, 0.5],
      [3.6, 0]
    ] as const
  ).map(([x, y], index) => ({ id: `n${index}`, position: { x, y } })),
  edges: Array.from({ length: 6 }, (_unused, index) => ({
    id: `e${index}`,
    nodeA: `n${index}`,
    nodeB: `n${index + 1}`,
    radius: RADIUS
  }))
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function run(seed: number, disableEvolution: boolean): EvolutionRunResult {
  return runEvolution({
    graph: zigzag6,
    seed,
    generations: GENERATIONS,
    evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: POPULATION_SIZE },
    episode: { durationSeconds: EPISODE_SECONDS },
    disableEvolution,
    createdAt: "2026-09-14T00:00:00.000Z"
  });
}

interface SeedOutcome {
  readonly seed: number;
  readonly generation0Distance: number;
  readonly finalGenerationDistance: number;
  readonly bestEverDistance: number;
  readonly improved: boolean;
  readonly evolvedBestFitness: number;
  readonly controlBestFitness: number;
  readonly bestEverGeneration: number;
  readonly totalInvalid: number;
  readonly wallSeconds: number;
  readonly bestGenome: unknown;
}

function main(): void {
  const outcomes: SeedOutcome[] = [];

  for (const seed of SEEDS) {
    const started = performance.now();
    const evolved = run(seed, false);
    const control = run(seed, true);
    const wallSeconds = (performance.now() - started) / 1000;

    const first = evolved.generations[0]!;
    const last = evolved.generations.at(-1)!;
    const bestEverDistance = Math.max(
      ...evolved.generations.map((stats) => stats.bestNormalizedForwardProgress)
    );

    outcomes.push({
      seed,
      generation0Distance: first.bestNormalizedForwardProgress,
      finalGenerationDistance: last.bestNormalizedForwardProgress,
      bestEverDistance,
      improved: bestEverDistance > first.bestNormalizedForwardProgress,
      evolvedBestFitness: Math.max(
        ...evolved.generations.map((stats) => stats.bestFitness)
      ),
      controlBestFitness: Math.max(
        ...control.generations.map((stats) => stats.bestFitness)
      ),
      bestEverGeneration: evolved.bestEver.generation,
      totalInvalid: evolved.generations.reduce(
        (total, stats) => total + stats.invalidCount,
        0
      ),
      wallSeconds,
      bestGenome: evolved.bestEver.genome
    });

    console.log(
      `seed ${seed}: gen0 ${first.bestNormalizedForwardProgress.toFixed(3)} -> best ${bestEverDistance.toFixed(3)} body lengths ` +
        `(gen ${evolved.bestEver.generation}), ${wallSeconds.toFixed(1)} s`
    );
  }

  const improvedSeeds = outcomes.filter((outcome) => outcome.improved).length;
  const evolvedMedian = median(outcomes.map((outcome) => outcome.evolvedBestFitness));
  const controlMedian = median(outcomes.map((outcome) => outcome.controlBestFitness));
  const criterion1 = improvedSeeds >= IMPROVED_SEEDS_REQUIRED;
  const criterion2 = evolvedMedian > controlMedian;

  console.log("");
  console.log(
    "seed | gen0 dist | final dist | best dist | best gen | evolved fit | control fit | invalid"
  );
  console.log(
    "-----|-----------|------------|-----------|----------|-------------|-------------|--------"
  );
  for (const outcome of outcomes) {
    console.log(
      [
        String(outcome.seed).padStart(4),
        outcome.generation0Distance.toFixed(3).padStart(9),
        outcome.finalGenerationDistance.toFixed(3).padStart(10),
        outcome.bestEverDistance.toFixed(3).padStart(9),
        String(outcome.bestEverGeneration).padStart(8),
        outcome.evolvedBestFitness.toFixed(3).padStart(11),
        outcome.controlBestFitness.toFixed(3).padStart(11),
        String(outcome.totalInvalid).padStart(7)
      ].join(" | ")
    );
  }

  console.log("");
  console.log(
    `criterion 1 — improved seeds ${improvedSeeds}/${SEEDS.length} (need ${IMPROVED_SEEDS_REQUIRED}): ${criterion1 ? "PASS" : "FAIL"}`
  );
  console.log(
    `criterion 2 — evolved median ${evolvedMedian.toFixed(3)} > control median ${controlMedian.toFixed(3)}: ${criterion2 ? "PASS" : "FAIL"}`
  );
  console.log(`overall: ${criterion1 && criterion2 ? "PASS" : "FAIL"}`);

  console.log("");
  console.log(
    "json:",
    JSON.stringify({
      environment: {
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        cpu: cpus()[0]?.model ?? "unknown"
      },
      settings: {
        seeds: SEEDS,
        generations: GENERATIONS,
        populationSize: POPULATION_SIZE,
        episodeSeconds: EPISODE_SECONDS,
        eliteCount: DEFAULT_EVOLUTION_CONFIG.eliteCount,
        tournamentSize: DEFAULT_EVOLUTION_CONFIG.tournamentSize,
        mutation: DEFAULT_EVOLUTION_CONFIG.mutation
      },
      outcomes,
      improvedSeeds,
      evolvedMedian,
      controlMedian,
      pass: criterion1 && criterion2
    })
  );
}

main();
