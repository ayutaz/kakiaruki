import { describe, expect, it } from "vitest";

import { calculateMotorSpeed } from "../../src/domain/control/joint-controller.ts";

describe("calculateMotorSpeed", () => {
  it("uses the shortest angular error and clamps the requested speed", () => {
    const speed = calculateMotorSpeed({
      targetAngle: Math.PI - 0.1,
      currentAngle: -Math.PI + 0.1,
      relativeAngularVelocity: 0,
      proportionalGain: 20,
      derivativeGain: 0,
      maxMotorSpeed: 3
    });

    expect(speed).toBeCloseTo(-3);
  });

  it("applies derivative damping", () => {
    const undamped = calculateMotorSpeed({
      targetAngle: 0.5,
      currentAngle: 0,
      relativeAngularVelocity: 2,
      proportionalGain: 10,
      derivativeGain: 0,
      maxMotorSpeed: 20
    });
    const damped = calculateMotorSpeed({
      targetAngle: 0.5,
      currentAngle: 0,
      relativeAngularVelocity: 2,
      proportionalGain: 10,
      derivativeGain: 1.5,
      maxMotorSpeed: 20
    });

    expect(undamped).toBeCloseTo(5);
    expect(damped).toBeCloseTo(2);
  });
});
