import { afterEach, describe, expect, it } from "vitest";

import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";

const worlds: PhysicsWorld[] = [];

function makeWorld(options?: Parameters<typeof createPhysicsWorld>[0]): PhysicsWorld {
  const world = createPhysicsWorld(options);
  worlds.push(world);
  return world;
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("createPhysicsWorld", () => {
  it("starts with exactly one shape: the ground", () => {
    expect(makeWorld().countShapes()).toBe(1);
  });

  it("keeps the ground surface at y = 0", () => {
    const world = makeWorld({ groundHalfHeight: 0.5 });

    expect(world.groundSurfaceY).toBeCloseTo(0);
  });

  it("steps without throwing and keeps the ground alive", () => {
    const world = makeWorld();

    for (let index = 0; index < 60; index += 1) {
      world.step(1 / 60, 4);
    }

    expect(world.countShapes()).toBe(1);
  });

  it("rejects a non-finite or non-positive step", () => {
    const world = makeWorld();

    expect(() => world.step(Number.NaN, 4)).toThrow(/stepSeconds/);
    expect(() => world.step(0, 4)).toThrow(/stepSeconds/);
    expect(() => world.step(1 / 60, 0)).toThrow(/subSteps/);
  });

  it("is inert after destroy so a stale handle cannot corrupt a new world", () => {
    const world = createPhysicsWorld();
    world.destroy();

    expect(() => world.step(1 / 60, 4)).toThrow(/destroyed/);
    expect(() => world.countShapes()).toThrow(/destroyed/);
    expect(() => world.destroy()).not.toThrow();
  });

  it("supports several independent worlds at the same time", () => {
    const first = makeWorld();
    const second = makeWorld();

    expect(first.countShapes()).toBe(1);
    expect(second.countShapes()).toBe(1);
    expect(first.worldId.index1).not.toBe(second.worldId.index1);
  });
});
