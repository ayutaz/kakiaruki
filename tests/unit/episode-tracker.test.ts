import { describe, expect, it } from "vitest";

import type { JointCommandSource } from "../../src/domain/control/joint-command-source.ts";
import { EpisodeTracker } from "../../src/simulation/episode-tracker.ts";
import type {
  CreatureHandle,
  CreatureSnapshot,
  JointConfig,
  JointState
} from "../../src/simulation/ports/creature-port.ts";
import type { Vector2 } from "../../src/shared/vector2.ts";

interface FakeOptions {
  readonly jointCount: number;
  readonly advancePerStep: number;
  readonly finiteUntilStep: number;
  readonly motorTorque: number;
}

class FakeCreature implements CreatureHandle {
  readonly boneCount = 1;
  readonly jointCount: number;
  readonly motorSpeeds: number[] = [];
  steps = 0;
  #x = 0;
  readonly #options: FakeOptions;

  constructor(options: Partial<FakeOptions> = {}) {
    this.#options = {
      jointCount: 2,
      advancePerStep: 0.01,
      finiteUntilStep: Number.POSITIVE_INFINITY,
      motorTorque: 3,
      ...options
    };
    this.jointCount = this.#options.jointCount;
  }

  /** EpisodeTrackerはworldをstepしないので、テスト側が物理の進行を代行する。 */
  advance(): void {
    this.steps += 1;
    this.#x += this.#options.advancePerStep;
  }

  jointState(index: number): JointState {
    if (index < 0 || index >= this.jointCount) {
      throw new RangeError(`joint index ${index} is out of range`);
    }
    return { angle: 0.1 * index, angularVelocity: 0, motorTorque: this.#options.motorTorque };
  }

  jointConfig(): JointConfig {
    return {
      lowerAngle: -1,
      upperAngle: 1,
      maxMotorTorque: 10,
      limitEnabled: true,
      motorEnabled: true
    };
  }

  connectedBones(): readonly [number, number] {
    return [0, 0];
  }

  setMotorSpeed(index: number, speed: number): void {
    this.motorSpeeds[index] = speed;
  }

  centerOfMass(): Vector2 {
    return { x: this.#x, y: 0.3 };
  }

  snapshot(): CreatureSnapshot {
    return { bones: [], centerOfMass: this.centerOfMass() };
  }

  hasFiniteState(): boolean {
    return this.steps <= this.#options.finiteUntilStep;
  }

  maxAbsCoordinate(): number {
    return Math.abs(this.#x);
  }

  destroy(): void {
    // nothing to release in the fake
  }
}

const constantCommands: JointCommandSource = {
  motorSpeed: (observation) => 2 + observation.index
};

function runToEnd(creature: FakeCreature, tracker: EpisodeTracker): void {
  let running = true;
  while (running) {
    tracker.applyCommands();
    creature.advance();
    running = tracker.observe();
  }
}

describe("EpisodeTracker", () => {
  it("writes a motor speed for every joint before the world steps", () => {
    const creature = new FakeCreature();
    const tracker = new EpisodeTracker(creature, constantCommands, { durationSeconds: 1 });

    tracker.applyCommands();

    expect(creature.motorSpeeds).toEqual([2, 3]);
    expect(creature.steps).toBe(0);
  });

  it("completes after the number of steps the duration implies", () => {
    const creature = new FakeCreature();
    const tracker = new EpisodeTracker(creature, constantCommands, {
      durationSeconds: 0.5,
      stepSeconds: 1 / 100
    });

    runToEnd(creature, tracker);

    expect(tracker.stepCount).toBe(50);
    expect(tracker.status).toBe("completed");
    expect(tracker.result().steps).toBe(50);
  });

  it("accumulates motor effort from the observed torque", () => {
    const creature = new FakeCreature({ jointCount: 2, motorTorque: 3 });
    const tracker = new EpisodeTracker(creature, constantCommands, {
      durationSeconds: 1,
      stepSeconds: 1 / 10
    });

    runToEnd(creature, tracker);

    expect(tracker.result().motorEffort).toBeCloseTo(10 * 2 * 3 * (1 / 10), 9);
  });

  it("tracks forward progress from the starting centre of mass", () => {
    const creature = new FakeCreature({ advancePerStep: 0.02 });
    const tracker = new EpisodeTracker(creature, constantCommands, {
      durationSeconds: 1,
      stepSeconds: 1 / 10
    });

    runToEnd(creature, tracker);
    const result = tracker.result();

    expect(result.startCenterOfMass.x).toBeCloseTo(0);
    expect(result.endCenterOfMass.x).toBeCloseTo(0.2);
    expect(result.maxForwardProgress).toBeCloseTo(0.2);
  });

  it("stops as invalid when the state stops being finite", () => {
    const creature = new FakeCreature({ finiteUntilStep: 3 });
    const tracker = new EpisodeTracker(creature, constantCommands, { durationSeconds: 10 });

    runToEnd(creature, tracker);
    const result = tracker.result();

    expect(result.status).toBe("invalid");
    expect(result.invalidReason).toBe("non-finite-state");
    expect(result.steps).toBe(4);
  });

  it("stops as invalid when the creature leaves the allowed range", () => {
    const creature = new FakeCreature({ advancePerStep: 1 });
    const tracker = new EpisodeTracker(creature, constantCommands, {
      durationSeconds: 10,
      maxCoordinateMagnitude: 3
    });

    runToEnd(creature, tracker);
    const result = tracker.result();

    expect(result.status).toBe("invalid");
    expect(result.invalidReason).toBe("out-of-bounds");
    expect(result.steps).toBe(4);
  });

  it("ignores further commands once it has finished", () => {
    const creature = new FakeCreature();
    const tracker = new EpisodeTracker(creature, constantCommands, {
      durationSeconds: 0.1,
      stepSeconds: 1 / 10
    });

    runToEnd(creature, tracker);
    creature.motorSpeeds.length = 0;
    tracker.applyCommands();

    expect(creature.motorSpeeds).toEqual([]);
    expect(tracker.observe()).toBe(false);
  });

  it("refuses to report a result before it has finished", () => {
    const tracker = new EpisodeTracker(new FakeCreature(), constantCommands, {
      durationSeconds: 1
    });

    expect(() => tracker.result()).toThrow(/not finished/);
  });
});
