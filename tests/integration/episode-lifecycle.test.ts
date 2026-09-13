import { afterEach, describe, expect, it } from "vitest";

import {
  createSineCommandSource,
  type JointCommandSource
} from "../../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { createCreature } from "../../src/simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
import { EpisodeRunner } from "../../src/simulation/episode-runner.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  type SkeletonPlan
} from "../../src/simulation/skeleton-plan.ts";
import { lShape5 } from "../fixtures/creature-graphs.ts";

const worlds: PhysicsWorld[] = [];

function planForFixture(): SkeletonPlan {
  const result = validateCreatureGraph(lShape5);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return buildSkeletonPlan(result.graph);
}

function commandSource(): JointCommandSource {
  return createSineCommandSource({
    globalFrequency: 1.2,
    joints: Array.from({ length: 4 }, (_unused, index) => ({
      amplitude: 0.6,
      phase: (index * Math.PI) / 2,
      bias: 0
    })),
    proportionalGain: 12,
    derivativeGain: 0.5,
    maxMotorSpeed: 8
  });
}

function newWorld(): PhysicsWorld {
  const world = createPhysicsWorld();
  worlds.push(world);
  return world;
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("episode lifecycle", () => {
  it("keeps every state value finite across 10,000 fixed steps", () => {
    const plan = planForFixture();
    const world = newWorld();
    const creature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
    const runner = new EpisodeRunner({
      world,
      creature,
      commands: commandSource(),
      options: { durationSeconds: 10_000 / 60 }
    });

    const result = runner.run();

    expect(result.steps).toBe(10_000);
    expect(result.status).toBe("completed");
    expect(creature.hasFiniteState()).toBe(true);
    expect(Number.isFinite(result.motorEffort)).toBe(true);
    expect(Number.isFinite(result.maxForwardProgress)).toBe(true);
    expect(Number.isFinite(result.endCenterOfMass.x)).toBe(true);
    expect(Number.isFinite(result.endCenterOfMass.y)).toBe(true);
    for (let index = 0; index < creature.jointCount; index += 1) {
      const state = creature.jointState(index);
      expect(Number.isFinite(state.angle)).toBe(true);
      expect(Number.isFinite(state.angularVelocity)).toBe(true);
    }
  });

  it("returns the world to its baseline after 100 create and cleanup cycles", () => {
    const plan = planForFixture();
    const world = newWorld();
    const baseline = world.countShapes();

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const creature = createCreature(world, plan, {
        origin: computeSpawnOffset(plan, 0.1)
      });
      expect(world.countShapes()).toBe(baseline + plan.bones.length);
      new EpisodeRunner({
        world,
        creature,
        commands: commandSource(),
        options: { durationSeconds: 0.5 }
      }).run();
      creature.destroy();
      expect(world.countShapes()).toBe(baseline);
    }

    expect(world.countShapes()).toBe(baseline);
  });

  it("reproduces the same result for the same fixture and settings", () => {
    const plan = planForFixture();
    const runOnce = () => {
      const world = newWorld();
      const creature = createCreature(world, plan, {
        origin: computeSpawnOffset(plan, 0.1)
      });
      const result = new EpisodeRunner({
        world,
        creature,
        commands: commandSource(),
        options: { durationSeconds: 3 }
      }).run();
      creature.destroy();
      return result;
    };

    const first = runOnce();
    const second = runOnce();

    expect(second.steps).toBe(first.steps);
    expect(second.endCenterOfMass.x).toBeCloseTo(first.endCenterOfMass.x, 6);
    expect(second.endCenterOfMass.y).toBeCloseTo(first.endCenterOfMass.y, 6);
    expect(second.motorEffort).toBeCloseTo(first.motorEffort, 6);
    expect(second.maxForwardProgress).toBeCloseTo(first.maxForwardProgress, 6);
  });

  it("reuses one world across generations without recreating it", () => {
    const plan = planForFixture();
    const world = newWorld();

    const runGeneration = () => {
      const creature = createCreature(world, plan, {
        origin: computeSpawnOffset(plan, 0.1)
      });
      const result = new EpisodeRunner({
        world,
        creature,
        commands: commandSource(),
        options: { durationSeconds: 2 }
      }).run();
      creature.destroy();
      return result;
    };

    const first = runGeneration();
    const second = runGeneration();

    expect(second.endCenterOfMass.x).toBeCloseTo(first.endCenterOfMass.x, 3);
    expect(second.endCenterOfMass.y).toBeCloseTo(first.endCenterOfMass.y, 3);
  });
});
