import { afterEach, describe, expect, it } from "vitest";

import {
  createSineCommandSource,
  createZeroCommandSource
} from "../../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { createCreature } from "../../src/simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
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

const POPULATION = 8;
const GENERATIONS = 100;
const HEAP_HEADROOM_BYTES = 256 * 1024 * 1024;

const worlds: PhysicsWorld[] = [];

function planForFixture(): SkeletonPlan {
  const result = validateCreatureGraph(zigzag6);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return buildSkeletonPlan(result.graph);
}

function spawnGeneration(world: PhysicsWorld, plan: SkeletonPlan): CreatureHandle[] {
  const clearance = computeSpawnOffset(plan, 0.1);
  return planLanes(POPULATION, skeletonWidth(plan)).map((lane) =>
    createCreature(world, plan, {
      origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
      groupIndex: lane.groupIndex
    })
  );
}

function commandsFor(index: number, generation: number, jointCount: number) {
  return createSineCommandSource({
    globalFrequency: 1.3,
    joints: Array.from({ length: jointCount }, (_unused, jointIndex) => ({
      amplitude: 0.6,
      phase: (index + generation) * 0.2 + (jointIndex * Math.PI) / 3,
      bias: 0
    })),
    proportionalGain: 12,
    derivativeGain: 0.5,
    maxMotorSpeed: 9
  });
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("population lifecycle", () => {
  it("spawns the whole population on the ground, not past its edge", () => {
    // レーンは中央から左右へ広がる。地面が足りないと外側の個体が落下し、
    // 前進量0のまま completed として世代に混ざる。
    const world = createPhysicsWorld();
    worlds.push(world);
    const plan = planForFixture();
    const clearance = computeSpawnOffset(plan, 0.1);
    const lanes = planLanes(32, skeletonWidth(plan));
    const creatures = lanes.map((lane) =>
      createCreature(world, plan, {
        origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
        groupIndex: lane.groupIndex
      })
    );
    const runner = new PopulationRunner({
      world,
      creatures,
      members: creatures.map(() => ({ commands: createZeroCommandSource() })),
      options: { durationSeconds: 2 }
    });

    runner.run();

    const fallen = runner
      .results()
      .filter((result) => result.endCenterOfMass.y < -1)
      .length;
    expect(fallen).toBe(0);

    for (const creature of creatures) {
      creature.destroy();
    }
  });

  it("returns one reused world to its baseline after 100 generations", () => {
    const plan = planForFixture();
    const world = createPhysicsWorld();
    worlds.push(world);
    const baseline = world.countShapes();
    const heapSamples: number[] = [];
    let creatureToCreatureContacts = 0;

    for (let generation = 0; generation < GENERATIONS; generation += 1) {
      const creatures = spawnGeneration(world, plan);
      expect(world.countShapes()).toBe(baseline + POPULATION * plan.bones.length);

      const runner = new PopulationRunner({
        world,
        creatures,
        members: creatures.map((creature, index) => ({
          commands: commandsFor(index, generation, creature.jointCount)
        })),
        options: { durationSeconds: 0.5 }
      });
      while (runner.step()) {
        creatureToCreatureContacts += world.drainContactEvents().creatureToCreatureCount;
      }
      const results = runner.results();
      expect(results).toHaveLength(POPULATION);

      for (const creature of creatures) {
        creature.destroy();
      }
      expect(world.countShapes()).toBe(baseline);

      if (generation % 10 === 0) {
        heapSamples.push(process.memoryUsage().heapUsed);
      }
    }

    expect(world.countShapes()).toBe(baseline);
    expect(creatureToCreatureContacts).toBe(0);

    const firstHeap = heapSamples[0] ?? 0;
    const maxHeap = Math.max(...heapSamples);
    expect(maxHeap - firstHeap).toBeLessThan(HEAP_HEADROOM_BYTES);
  });

  it("produces the same generation result whether or not earlier generations ran", () => {
    const plan = planForFixture();

    const runGeneration = (world: PhysicsWorld, generation: number) => {
      const creatures = spawnGeneration(world, plan);
      const results = new PopulationRunner({
        world,
        creatures,
        members: creatures.map((creature, index) => ({
          commands: commandsFor(index, generation, creature.jointCount)
        })),
        options: { durationSeconds: 1 }
      }).run();
      for (const creature of creatures) {
        creature.destroy();
      }
      return results;
    };

    const freshWorld = createPhysicsWorld();
    worlds.push(freshWorld);
    const isolated = runGeneration(freshWorld, 5);

    const reusedWorld = createPhysicsWorld();
    worlds.push(reusedWorld);
    for (let generation = 0; generation < 5; generation += 1) {
      runGeneration(reusedWorld, generation);
    }
    const afterReuse = runGeneration(reusedWorld, 5);

    for (const [index, result] of afterReuse.entries()) {
      expect(result.endCenterOfMass.x).toBeCloseTo(isolated[index]!.endCenterOfMass.x, 6);
      expect(result.motorEffort).toBeCloseTo(isolated[index]!.motorEffort, 6);
    }
  });
});
