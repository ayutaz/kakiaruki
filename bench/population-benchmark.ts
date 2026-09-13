/**
 * Population評価のthroughputを測る。ブラウザを使わないheadless計測であり、
 * p95 frame time は測れない（それは `bench/frame-time.html` で測る）。
 *
 * 実行: npm run bench
 */
import { cpus, totalmem } from "node:os";

import { createSineCommandSource } from "../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph } from "../src/domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "../src/domain/creature/creature-graph.ts";
import { createCreature } from "../src/simulation/box2d/box2d-creature-factory.ts";
import { createPhysicsWorld } from "../src/simulation/box2d/box2d-world.ts";
import { DEFAULT_EPISODE_OPTIONS } from "../src/simulation/episode-tracker.ts";
import { planLanes } from "../src/simulation/lane-allocator.ts";
import { PopulationRunner } from "../src/simulation/population-runner.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth,
  type SkeletonPlan
} from "../src/simulation/skeleton-plan.ts";

const POPULATION_SIZES = [1, 8, 32] as const;
const REPEATS = 3;
const EPISODE_SECONDS = DEFAULT_EPISODE_OPTIONS.durationSeconds;

const RADIUS = 0.11;

/** tests/fixtures と同じ6ボーンのジグザグ。bench はテストコードへ依存しない。 */
const zigzag6: CreatureGraph = {
  rootNodeId: "n0",
  nodes: [
    [0, 0],
    [0.6, 0.5],
    [1.2, 0],
    [1.8, 0.5],
    [2.4, 0],
    [3, 0.5],
    [3.6, 0]
  ].map(([x, y], index) => ({ id: `n${index}`, position: { x: x!, y: y! } })),
  edges: Array.from({ length: 6 }, (_unused, index) => ({
    id: `e${index}`,
    nodeA: `n${index}`,
    nodeB: `n${index + 1}`,
    radius: RADIUS
  }))
};

interface Measurement {
  readonly populationSize: number;
  readonly worldSteps: number;
  readonly creatureSteps: number;
  readonly wallSeconds: number;
  readonly physicsStepsPerWallSecond: number;
  readonly creatureStepsPerWallSecond: number;
  readonly episodeWallSeconds: number;
  readonly realTimeRatio: number;
}

function planFor(graph: CreatureGraph): SkeletonPlan {
  const result = validateCreatureGraph(graph);
  if (!result.ok) {
    throw new Error(`benchmark fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return buildSkeletonPlan(result.graph);
}

function measure(plan: SkeletonPlan, populationSize: number): Measurement {
  const world = createPhysicsWorld();
  try {
    const clearance = computeSpawnOffset(plan, 0.1);
    const creatures = planLanes(populationSize, skeletonWidth(plan)).map((lane) =>
      createCreature(world, plan, {
        origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
        groupIndex: lane.groupIndex
      })
    );
    const runner = new PopulationRunner({
      world,
      creatures,
      members: creatures.map((creature, index) => ({
        commands: createSineCommandSource({
          globalFrequency: 1.4,
          joints: Array.from({ length: creature.jointCount }, (_unused, jointIndex) => ({
            amplitude: 0.6,
            phase: index * 0.3 + (jointIndex * Math.PI) / 3,
            bias: 0
          })),
          proportionalGain: 12,
          derivativeGain: 0.5,
          maxMotorSpeed: 9
        })
      })),
      options: { durationSeconds: EPISODE_SECONDS }
    });

    const started = performance.now();
    runner.run();
    const wallSeconds = (performance.now() - started) / 1000;

    for (const creature of creatures) {
      creature.destroy();
    }

    const worldSteps = runner.stepCount;
    return {
      populationSize,
      worldSteps,
      creatureSteps: worldSteps * populationSize,
      wallSeconds,
      physicsStepsPerWallSecond: worldSteps / wallSeconds,
      creatureStepsPerWallSecond: (worldSteps * populationSize) / wallSeconds,
      episodeWallSeconds: wallSeconds,
      realTimeRatio: EPISODE_SECONDS / wallSeconds
    };
  } finally {
    world.destroy();
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function main(): void {
  const plan = planFor(zigzag6);

  // JITを温める。計測には含めない。
  measure(plan, 8);

  const results = POPULATION_SIZES.map((size) => {
    const runs = Array.from({ length: REPEATS }, () => measure(plan, size));
    return {
      populationSize: size,
      worldSteps: runs[0]!.worldSteps,
      creatureSteps: runs[0]!.creatureSteps,
      episodeWallSecondsMedian: median(runs.map((run) => run.episodeWallSeconds)),
      physicsStepsPerWallSecondMedian: median(
        runs.map((run) => run.physicsStepsPerWallSecond)
      ),
      creatureStepsPerWallSecondMedian: median(
        runs.map((run) => run.creatureStepsPerWallSecond)
      ),
      realTimeRatioMedian: median(runs.map((run) => run.realTimeRatio))
    };
  });

  const environment = {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
    bones: plan.bones.length,
    joints: plan.joints.length,
    episodeSeconds: EPISODE_SECONDS,
    stepSeconds: DEFAULT_EPISODE_OPTIONS.stepSeconds,
    subSteps: DEFAULT_EPISODE_OPTIONS.subSteps,
    repeats: REPEATS
  };

  console.log("environment:", JSON.stringify(environment, null, 2));
  console.log("");
  console.log(
    "pop | world steps | episode wall s | physics steps/s | creature steps/s | real-time ratio"
  );
  console.log(
    "----|-------------|----------------|-----------------|------------------|----------------"
  );
  for (const result of results) {
    console.log(
      [
        String(result.populationSize).padStart(3),
        String(result.worldSteps).padStart(11),
        result.episodeWallSecondsMedian.toFixed(4).padStart(14),
        result.physicsStepsPerWallSecondMedian.toFixed(0).padStart(15),
        result.creatureStepsPerWallSecondMedian.toFixed(0).padStart(16),
        result.realTimeRatioMedian.toFixed(1).padStart(15)
      ].join(" | ")
    );
  }

  const largest = results.at(-1);
  if (largest) {
    const verdict = largest.realTimeRatioMedian >= 1 ? "PASS" : "FAIL";
    console.log("");
    console.log(
      `Population ${largest.populationSize} real-time ratio = ${largest.realTimeRatioMedian.toFixed(1)}x (threshold 1.0x): ${verdict}`
    );
  }

  console.log("");
  console.log("json:", JSON.stringify({ environment, results }));
}

main();
