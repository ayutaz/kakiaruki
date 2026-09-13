import { afterEach, describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "../../src/domain/creature/creature-graph.ts";
import {
  createCreature,
  type CreatureHandle
} from "../../src/simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  DEFAULT_SKELETON_SETTINGS,
  type SkeletonPlan
} from "../../src/simulation/skeleton-plan.ts";
import { chain4, lShape5, yBranch5 } from "../fixtures/creature-graphs.ts";

const worlds: PhysicsWorld[] = [];
const creatures: CreatureHandle[] = [];

function planFor(graph: CreatureGraph): SkeletonPlan {
  const result = validateCreatureGraph(graph);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return buildSkeletonPlan(result.graph);
}

function spawn(graph: CreatureGraph) {
  const world = createPhysicsWorld();
  worlds.push(world);
  const plan = planFor(graph);
  const creature = createCreature(world, plan, {
    origin: computeSpawnOffset(plan, 0.1)
  });
  creatures.push(creature);
  return { world, plan, creature };
}

afterEach(() => {
  for (const creature of creatures.splice(0)) {
    try {
      creature.destroy();
    } catch {
      // the test destroyed it already
    }
  }
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("createCreature", () => {
  it("creates one body per bone and one joint per plan joint", () => {
    const { world, plan, creature } = spawn(chain4);

    expect(creature.boneCount).toBe(plan.bones.length);
    expect(creature.jointCount).toBe(plan.joints.length);
    expect(world.countShapes()).toBe(1 + plan.bones.length);
  });

  it("connects every joint to the bone pair the plan names", () => {
    const { plan, creature } = spawn(yBranch5);

    for (const [index, joint] of plan.joints.entries()) {
      expect(creature.connectedBones(index)).toEqual([joint.boneAIndex, joint.boneBIndex]);
    }
  });

  it("matches the fixture joint limits, motor flag and torque", () => {
    const { creature } = spawn(chain4);
    const expected = DEFAULT_SKELETON_SETTINGS.joint;

    for (let index = 0; index < creature.jointCount; index += 1) {
      const config = creature.jointConfig(index);
      expect(config.lowerAngle).toBeCloseTo(expected.lowerAngle, 5);
      expect(config.upperAngle).toBeCloseTo(expected.upperAngle, 5);
      expect(config.maxMotorTorque).toBeCloseTo(expected.maxMotorTorque, 5);
      expect(config.limitEnabled).toBe(expected.enableLimit);
      expect(config.motorEnabled).toBe(expected.enableMotor);
    }
  });

  it("starts a bent skeleton at joint angle zero", () => {
    const { creature } = spawn(lShape5);

    expect(creature.jointCount).toBeGreaterThan(0);
    for (let index = 0; index < creature.jointCount; index += 1) {
      expect(Math.abs(creature.jointState(index).angle)).toBeLessThan(1e-3);
    }
  });

  it("spawns above the ground and settles onto it", () => {
    const { world, creature } = spawn(chain4);
    const startY = creature.centerOfMass().y;

    for (let index = 0; index < 240; index += 1) {
      world.step(1 / 60, 4);
    }

    const restY = creature.centerOfMass().y;
    expect(startY).toBeGreaterThan(restY);
    expect(restY).toBeGreaterThan(0);
    expect(creature.hasFiniteState()).toBe(true);
  });

  it("drives a joint only through setMotorSpeed", () => {
    const idle = spawn(chain4);
    const driven = spawn(chain4);

    for (let index = 0; index < 120; index += 1) {
      driven.creature.setMotorSpeed(0, 4);
      idle.world.step(1 / 60, 4);
      driven.world.step(1 / 60, 4);
    }

    expect(Math.abs(driven.creature.jointState(0).angle)).toBeGreaterThan(
      Math.abs(idle.creature.jointState(0).angle) + 0.1
    );
  });

  it("keeps a driven joint inside its angular limit", () => {
    const { world, creature } = spawn(chain4);
    const limit = DEFAULT_SKELETON_SETTINGS.joint.upperAngle;
    let maxAbsAngle = 0;

    for (let index = 0; index < 600; index += 1) {
      creature.setMotorSpeed(0, 6);
      world.step(1 / 60, 4);
      maxAbsAngle = Math.max(maxAbsAngle, Math.abs(creature.jointState(0).angle));
    }

    expect(maxAbsAngle).toBeGreaterThan(limit / 2);
    expect(maxAbsAngle).toBeLessThan(limit + 0.15);
  });

  it("reports a renderable snapshot that matches the bone plan", () => {
    const { plan, creature } = spawn(lShape5);
    const snapshot = creature.snapshot();

    expect(snapshot.bones).toHaveLength(plan.bones.length);
    for (const [index, bone] of snapshot.bones.entries()) {
      expect(bone.length).toBeCloseTo(plan.bones[index]!.length, 9);
      expect(bone.radius).toBeCloseTo(plan.bones[index]!.radius, 9);
    }
    expect(Number.isFinite(snapshot.centerOfMass.x)).toBe(true);
  });

  it("removes every body and joint from the world on destroy", () => {
    const { world, creature } = spawn(chain4);

    creature.destroy();

    expect(world.countShapes()).toBe(1);
    expect(() => creature.snapshot()).toThrow(/destroyed/);
    expect(() => creature.destroy()).not.toThrow();
  });

  it("rejects an out of range joint index instead of returning nonsense", () => {
    const { creature } = spawn(chain4);

    expect(() => creature.jointState(creature.jointCount)).toThrow(/joint index/);
    expect(() => creature.setMotorSpeed(-1, 1)).toThrow(/joint index/);
    expect(() => creature.setMotorSpeed(0, Number.NaN)).toThrow(/finite/);
  });
});
