import { describe, expect, it } from "vitest";

import type { JointCommandSource } from "../../src/domain/control/joint-command-source.ts";
import { PopulationRunner } from "../../src/simulation/population-runner.ts";
import type { SteppableWorld } from "../../src/simulation/ports/world-port.ts";
import { FakeCreature } from "../fixtures/fake-creature.ts";

const constantCommands: JointCommandSource = {
  motorSpeed: (observation) => 1 + observation.index
};

function fakeWorld(creatures: readonly FakeCreature[]): SteppableWorld & { steps: number } {
  return {
    steps: 0,
    step(): void {
      this.steps += 1;
      for (const creature of creatures) {
        creature.advance();
      }
    }
  };
}

describe("PopulationRunner with fake creatures", () => {
  it("keeps stepping the world until the last individual finishes", () => {
    const creatures = [
      new FakeCreature({ advancePerStep: 0.01 }),
      // 2 stepで有限でなくなるので、この個体だけ早く invalid になる。
      new FakeCreature({ advancePerStep: 0.01, finiteUntilStep: 2 })
    ];
    const world = fakeWorld(creatures);
    const runner = new PopulationRunner({
      world,
      creatures,
      members: creatures.map(() => ({ commands: constantCommands })),
      options: { durationSeconds: 1, stepSeconds: 1 / 10 }
    });

    const results = runner.run();

    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("completed");
    expect(results[0]!.steps).toBe(10);
    expect(results[1]!.status).toBe("invalid");
    expect(results[1]!.invalidReason).toBe("non-finite-state");
    expect(results[1]!.steps).toBe(3);
    expect(world.steps).toBe(10);
    expect(runner.stepCount).toBe(10);
  });

  it("stops writing commands to an individual that has already finished", () => {
    const finishing = new FakeCreature({ finiteUntilStep: 1 });
    const surviving = new FakeCreature();
    const creatures = [finishing, surviving];
    const runner = new PopulationRunner({
      world: fakeWorld(creatures),
      creatures,
      members: creatures.map(() => ({ commands: constantCommands })),
      options: { durationSeconds: 1, stepSeconds: 1 / 10 }
    });

    runner.step();
    runner.step();
    finishing.motorSpeeds.length = 0;
    surviving.motorSpeeds.length = 0;
    runner.step();

    expect(finishing.motorSpeeds).toEqual([]);
    expect(surviving.motorSpeeds).toEqual([1, 2]);
  });

  it("stops once every individual is finished", () => {
    const creatures = [new FakeCreature(), new FakeCreature()];
    const world = fakeWorld(creatures);
    const runner = new PopulationRunner({
      world,
      creatures,
      members: creatures.map(() => ({ commands: constantCommands })),
      options: { durationSeconds: 0.3, stepSeconds: 1 / 10 }
    });

    runner.run();
    const stepsAfterRun = world.steps;

    expect(runner.step()).toBe(false);
    expect(world.steps).toBe(stepsAfterRun);
    expect(runner.finished).toBe(true);
  });
});
