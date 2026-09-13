import { afterEach, describe, expect, it } from "vitest";

import {
  createP0PhysicsRig,
  type P0PhysicsRig
} from "../src/simulation/p0-physics-rig.ts";

const rigs: P0PhysicsRig[] = [];

function createRig(options: Parameters<typeof createP0PhysicsRig>[0]): P0PhysicsRig {
  const rig = createP0PhysicsRig(options);
  rigs.push(rig);
  return rig;
}

afterEach(() => {
  for (const rig of rigs.splice(0)) {
    rig.destroy();
  }
});

describe("P0 two-capsule physics rig", () => {
  it("moves the joint only when its motor is enabled", () => {
    const disabled = createRig({
      enableMotor: false,
      enableLimit: true,
      motorSpeed: 4
    });
    const enabled = createRig({
      enableMotor: true,
      enableLimit: true,
      motorSpeed: 4
    });

    disabled.runSteps(120);
    enabled.runSteps(120);

    expect(Math.abs(disabled.getJointAngle())).toBeLessThan(0.02);
    expect(Math.abs(enabled.getJointAngle())).toBeGreaterThan(0.2);
  });

  it("proves the angular limit is wired by comparing it with a disconnected limit", () => {
    const limited = createRig({
      enableMotor: true,
      enableLimit: true,
      lowerAngle: -0.35,
      upperAngle: 0.35,
      motorSpeed: 5
    });
    const unlimited = createRig({
      enableMotor: true,
      enableLimit: false,
      lowerAngle: -0.35,
      upperAngle: 0.35,
      motorSpeed: 5
    });

    const limitedResult = limited.runSteps(240);
    const unlimitedResult = unlimited.runSteps(240);

    expect(limitedResult.maxAbsJointAngle).toBeLessThan(0.5);
    expect(unlimitedResult.maxAbsJointAngle).toBeGreaterThan(1.0);
  });

  it("keeps body transforms and the joint angle finite for 10,000 steps", () => {
    const rig = createRig({
      enableMotor: true,
      enableLimit: true,
      motorSpeed: 5
    });

    const result = rig.runSteps(10_000);
    const snapshot = rig.snapshot();

    expect(result.steps).toBe(10_000);
    expect(result.allFinite).toBe(true);
    expect(snapshot.bodies).toHaveLength(2);
    expect(snapshot.bodies.flatMap((body) => [body.x, body.y, body.angle])).toSatisfy(
      (values: number[]) => values.every(Number.isFinite)
    );
    expect(snapshot.jointAngle).toSatisfy(Number.isFinite);
  });
});
