import { describe, expect, it } from "vitest";

import {
  createSineCommandSource,
  createZeroCommandSource,
  type SineCommandConfig
} from "../../src/domain/control/joint-command-source.ts";

const config: SineCommandConfig = {
  globalFrequency: 1,
  joints: [
    { amplitude: 0.5, phase: 0, bias: 0 },
    { amplitude: 0.5, phase: Math.PI, bias: 0 }
  ],
  proportionalGain: 10,
  derivativeGain: 0.4,
  maxMotorSpeed: 8
};

describe("createSineCommandSource", () => {
  it("drives two joints in opposite directions when their phases differ by pi", () => {
    const source = createSineCommandSource(config);
    const time = 0.25;

    const first = source.motorSpeed({ index: 0, angle: 0, angularVelocity: 0 }, time);
    const second = source.motorSpeed({ index: 1, angle: 0, angularVelocity: 0 }, time);

    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(0);
    expect(first).toBeCloseTo(-second);
  });

  it("follows the configured bias when the amplitude is zero", () => {
    const source = createSineCommandSource({
      ...config,
      joints: [{ amplitude: 0, phase: 0, bias: 0.4 }]
    });

    const towardsBias = source.motorSpeed({ index: 0, angle: 0, angularVelocity: 0 }, 3.1);
    const atBias = source.motorSpeed({ index: 0, angle: 0.4, angularVelocity: 0 }, 3.1);

    expect(towardsBias).toBeGreaterThan(0);
    expect(atBias).toBeCloseTo(0);
  });

  it("clamps the requested speed to the configured maximum", () => {
    const source = createSineCommandSource({ ...config, proportionalGain: 1000 });

    const speed = source.motorSpeed({ index: 0, angle: -1, angularVelocity: 0 }, 0.25);

    expect(speed).toBeCloseTo(config.maxMotorSpeed);
  });

  it("returns zero for a joint index the configuration does not cover", () => {
    const source = createSineCommandSource(config);

    expect(source.motorSpeed({ index: 9, angle: 0.3, angularVelocity: 0 }, 0.25)).toBe(0);
  });

  it("is a pure function of observation and time", () => {
    const source = createSineCommandSource(config);
    const observation = { index: 0, angle: 0.1, angularVelocity: 0.2 };

    expect(source.motorSpeed(observation, 1.5)).toBe(source.motorSpeed(observation, 1.5));
  });

  it("rejects a configuration that is not finite", () => {
    expect(() =>
      createSineCommandSource({ ...config, globalFrequency: Number.NaN })
    ).toThrow(/finite/);
    expect(() => createSineCommandSource({ ...config, maxMotorSpeed: -1 })).toThrow(
      /maxMotorSpeed/
    );
  });
});

describe("createZeroCommandSource", () => {
  it("never requests motor movement", () => {
    const source = createZeroCommandSource();

    expect(source.motorSpeed({ index: 0, angle: 1, angularVelocity: 1 }, 3)).toBe(0);
  });
});
