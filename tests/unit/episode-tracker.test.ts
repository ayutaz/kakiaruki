import { describe, expect, it } from "vitest";

import type { JointCommandSource } from "../../src/domain/control/joint-command-source.ts";
import { EpisodeTracker } from "../../src/simulation/episode-tracker.ts";
import { FakeCreature } from "../fixtures/fake-creature.ts";

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
      maxDisplacement: 3
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
