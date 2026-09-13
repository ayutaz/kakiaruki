import { afterEach, describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { createCreature } from "../../src/simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
import { planLanes } from "../../src/simulation/lane-allocator.ts";
import type { CreatureHandle } from "../../src/simulation/ports/creature-port.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
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

function skeletonWidth(plan: SkeletonPlan): number {
  const xs = plan.bones.flatMap((bone) => {
    const half = Math.abs(Math.cos(bone.axisAngle)) * (bone.length / 2) + bone.radius;
    return [bone.center.x - half, bone.center.x + half];
  });
  return Math.max(...xs) - Math.min(...xs);
}

function spawnPopulation(size: number): {
  world: PhysicsWorld;
  creatures: CreatureHandle[];
  plan: SkeletonPlan;
} {
  const plan = planForFixture();
  const world = createPhysicsWorld();
  worlds.push(world);
  const clearance = computeSpawnOffset(plan, 0.1);
  const creatures = planLanes(size, skeletonWidth(plan)).map((lane) =>
    createCreature(world, plan, {
      origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
      groupIndex: lane.groupIndex
    })
  );
  return { world, creatures, plan };
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("creature isolation", () => {
  it("never lets two creatures touch each other while they all touch the ground", () => {
    const { world } = spawnPopulation(8);
    let creatureToCreature = 0;
    let creatureToGround = 0;

    for (let step = 0; step < 600; step += 1) {
      world.step(1 / 60, 4);
      const summary = world.drainContactEvents();
      creatureToCreature += summary.creatureToCreatureCount;
      creatureToGround += summary.creatureToGroundCount;
    }

    expect(creatureToCreature).toBe(0);
    expect(creatureToGround).toBeGreaterThan(0);
  });

  it("does not let a creature collide with itself at a shared joint", () => {
    const { world } = spawnPopulation(1);
    let creatureToCreature = 0;

    for (let step = 0; step < 300; step += 1) {
      world.step(1 / 60, 4);
      creatureToCreature += world.drainContactEvents().creatureToCreatureCount;
    }

    expect(creatureToCreature).toBe(0);
  });

  it("drains the event buffer so the same contact is not counted twice", () => {
    const { world } = spawnPopulation(2);

    for (let step = 0; step < 120; step += 1) {
      world.step(1 / 60, 4);
    }
    const firstDrain = world.drainContactEvents();
    const secondDrain = world.drainContactEvents();

    expect(firstDrain.beginCount).toBeGreaterThanOrEqual(0);
    expect(secondDrain.beginCount).toBe(0);
  });

  it("keeps every individual inside its own lane", () => {
    const { creatures, plan } = spawnPopulation(8);
    const spacing = skeletonWidth(plan) + 12;
    const centres = creatures.map((creature) => creature.centerOfMass().x);

    for (let index = 1; index < centres.length; index += 1) {
      expect(centres[index]! - centres[index - 1]!).toBeCloseTo(spacing, 6);
    }
  });
});
