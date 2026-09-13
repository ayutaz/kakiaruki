import { afterEach, describe, expect, it } from "vitest";

import {
  createSineCommandSource,
  createZeroCommandSource,
  type JointCommandSource
} from "../../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { createCreature } from "../../src/simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
import type { EpisodeOptions } from "../../src/simulation/episode-tracker.ts";
import { planLanes } from "../../src/simulation/lane-allocator.ts";
import { PopulationRunner } from "../../src/simulation/population-runner.ts";
import type { CreatureHandle } from "../../src/simulation/ports/creature-port.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth,
  type SkeletonPlan
} from "../../src/simulation/skeleton-plan.ts";
import { zigzag6 } from "../fixtures/creature-graphs.ts";

const worlds: PhysicsWorld[] = [];

function planForFixture(): SkeletonPlan {
  const result = validateCreatureGraph(zigzag6);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return buildSkeletonPlan(result.graph);
}

function walkingCommands(seedPhase: number, jointCount: number): JointCommandSource {
  return createSineCommandSource({
    globalFrequency: 1.4,
    joints: Array.from({ length: jointCount }, (_unused, index) => ({
      amplitude: 0.6,
      phase: seedPhase + (index * Math.PI) / 3,
      bias: 0
    })),
    proportionalGain: 12,
    derivativeGain: 0.5,
    maxMotorSpeed: 9
  });
}

function buildPopulation(
  size: number,
  commandsFor: (index: number, jointCount: number) => JointCommandSource,
  options: Partial<EpisodeOptions> = {}
) {
  const plan = planForFixture();
  const world = createPhysicsWorld();
  worlds.push(world);
  const clearance = computeSpawnOffset(plan, 0.1);
  const creatures: CreatureHandle[] = planLanes(size, skeletonWidth(plan)).map((lane) =>
    createCreature(world, plan, {
      origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
      groupIndex: lane.groupIndex
    })
  );
  const members = creatures.map((creature, index) => ({
    commands: commandsFor(index, creature.jointCount)
  }));
  return {
    world,
    plan,
    creatures,
    runner: new PopulationRunner({ world, creatures, members, options })
  };
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("PopulationRunner", () => {
  it.each([1, 8, 32])("evaluates a population of %i with the same episode definition", (size) => {
    const { runner } = buildPopulation(
      size,
      (index, jointCount) => walkingCommands(index * 0.3, jointCount),
      { durationSeconds: 2 }
    );

    const results = runner.run();

    expect(results).toHaveLength(size);
    for (const result of results) {
      expect(result.status).toBe("completed");
      expect(result.steps).toBe(120);
      expect(Number.isFinite(result.endCenterOfMass.x)).toBe(true);
    }
  });

  it("steps the shared world once per simulation step, not once per individual", () => {
    const { world, runner } = buildPopulation(
      8,
      (index, jointCount) => walkingCommands(index * 0.3, jointCount),
      { durationSeconds: 1 }
    );
    let worldSteps = 0;
    const originalStep = world.step.bind(world);
    world.step = (stepSeconds: number, subSteps: number) => {
      worldSteps += 1;
      originalStep(stepSeconds, subSteps);
    };

    runner.run();

    expect(worldSteps).toBe(60);
    expect(runner.stepCount).toBe(60);
  });

  it("produces identical results no matter how many individuals are rendered", () => {
    const commandsFor = (index: number, jointCount: number) =>
      walkingCommands(index * 0.3, jointCount);
    const resultsForRenderCount = (renderCount: number) => {
      const { runner } = buildPopulation(8, commandsFor, { durationSeconds: 2 });
      while (runner.step()) {
        runner.snapshots(Array.from({ length: renderCount }, (_unused, index) => index));
      }
      return runner.results();
    };

    const none = resultsForRenderCount(0);
    const one = resultsForRenderCount(1);
    const eight = resultsForRenderCount(8);

    expect(one).toEqual(none);
    expect(eight).toEqual(none);
  });

  it("gives different individuals different outcomes", () => {
    const { runner } = buildPopulation(
      4,
      (index, jointCount) =>
        index === 0
          ? createZeroCommandSource()
          : walkingCommands(index * 0.9, jointCount),
      { durationSeconds: 3 }
    );

    const results = runner.run();
    const progress = results.map(
      (result) => result.endCenterOfMass.x - result.startCenterOfMass.x
    );

    expect(new Set(progress.map((value) => value.toFixed(6))).size).toBeGreaterThan(1);
    expect(Math.abs(progress[0]!)).toBeLessThan(0.05);
  });

  it("reproduces the same results for the same population", () => {
    const commandsFor = (index: number, jointCount: number) =>
      walkingCommands(index * 0.3, jointCount);

    const first = buildPopulation(8, commandsFor, { durationSeconds: 2 }).runner.run();
    const second = buildPopulation(8, commandsFor, { durationSeconds: 2 }).runner.run();

    expect(second).toEqual(first);
  });

  it("keeps every individual inside its own lane for the whole episode", () => {
    const { plan, creatures, runner } = buildPopulation(
      8,
      (index, jointCount) => walkingCommands(index * 0.3, jointCount),
      { durationSeconds: 3 }
    );
    const spacing = skeletonWidth(plan) + 12;

    runner.run();
    const centres = creatures.map((creature) => creature.centerOfMass().x);

    for (let index = 1; index < centres.length; index += 1) {
      const gap = centres[index]! - centres[index - 1]!;
      expect(gap).toBeGreaterThan(spacing - skeletonWidth(plan));
      expect(gap).toBeLessThan(spacing + skeletonWidth(plan));
    }
  });

  it("returns snapshots only for the requested individuals", () => {
    const { runner } = buildPopulation(
      8,
      (index, jointCount) => walkingCommands(index * 0.3, jointCount),
      { durationSeconds: 0.5 }
    );

    const snapshots = runner.snapshots([0, 3]);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]!.centerOfMass.x).toBeLessThan(snapshots[1]!.centerOfMass.x);
    expect(() => runner.snapshots([99])).toThrow(/index/);
  });

  it("rejects a mismatch between creatures and members", () => {
    const plan = planForFixture();
    const world = createPhysicsWorld();
    worlds.push(world);
    const creature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });

    expect(
      () => new PopulationRunner({ world, creatures: [creature], members: [] })
    ).toThrow(/members/);
    expect(() => new PopulationRunner({ world, creatures: [], members: [] })).toThrow(
      /empty/
    );
  });
});
