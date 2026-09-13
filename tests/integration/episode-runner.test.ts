import { afterEach, describe, expect, it } from "vitest";

import {
  createSineCommandSource,
  createZeroCommandSource,
  type JointCommandSource
} from "../../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { createCreature } from "../../src/simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
import {
  DEFAULT_EPISODE_OPTIONS,
  EpisodeRunner,
  type EpisodeOptions
} from "../../src/simulation/episode-runner.ts";
import { buildSkeletonPlan, computeSpawnOffset } from "../../src/simulation/skeleton-plan.ts";
import { zigzag6 } from "../fixtures/creature-graphs.ts";

const worlds: PhysicsWorld[] = [];

function makeEpisode(
  commands: JointCommandSource = createZeroCommandSource(),
  options: Partial<EpisodeOptions> = {}
) {
  const result = validateCreatureGraph(zigzag6);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  const plan = buildSkeletonPlan(result.graph);
  const world = createPhysicsWorld();
  worlds.push(world);
  const creature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
  return {
    world,
    creature,
    runner: new EpisodeRunner({ world, creature, commands, options })
  };
}

function walkingCommands(jointCount: number): JointCommandSource {
  return createSineCommandSource({
    globalFrequency: 1.5,
    joints: Array.from({ length: jointCount }, (_unused, index) => ({
      amplitude: 0.7,
      phase: (index * Math.PI) / 3,
      bias: 0
    })),
    proportionalGain: 12,
    derivativeGain: 0.5,
    maxMotorSpeed: 9
  });
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("EpisodeRunner", () => {
  it("runs exactly the number of fixed steps the duration implies", () => {
    const { runner } = makeEpisode(createZeroCommandSource(), { durationSeconds: 2 });

    const result = runner.run();

    expect(result.status).toBe("completed");
    expect(result.steps).toBe(Math.round(2 / DEFAULT_EPISODE_OPTIONS.stepSeconds));
    expect(result.elapsedSeconds).toBeCloseTo(2, 6);
    expect(runner.status).toBe("completed");
  });

  it("records centre of mass progress and motor effort", () => {
    const driven = makeEpisode(walkingCommands(5), { durationSeconds: 4 });
    const idle = makeEpisode(createZeroCommandSource(), { durationSeconds: 4 });

    const drivenResult = driven.runner.run();
    const idleResult = idle.runner.run();

    expect(drivenResult.motorEffort).toBeGreaterThan(idleResult.motorEffort);
    expect(
      Math.abs(drivenResult.endCenterOfMass.x - drivenResult.startCenterOfMass.x)
    ).toBeGreaterThan(
      Math.abs(idleResult.endCenterOfMass.x - idleResult.startCenterOfMass.x)
    );
    expect(drivenResult.maxForwardProgress).toBeGreaterThanOrEqual(
      drivenResult.endCenterOfMass.x - drivenResult.startCenterOfMass.x - 1e-9
    );
  });

  it("stops as invalid instead of throwing when the creature leaves the allowed range", () => {
    const { runner } = makeEpisode(createZeroCommandSource(), {
      durationSeconds: 4,
      maxDisplacement: 0.05
    });

    const result = runner.run();

    expect(result.status).toBe("invalid");
    expect(result.invalidReason).toBe("out-of-bounds");
    expect(result.steps).toBeLessThan(Math.round(4 / DEFAULT_EPISODE_OPTIONS.stepSeconds));
  });

  it("refuses to report a result before the episode ends", () => {
    const { runner } = makeEpisode();

    expect(() => runner.result()).toThrow(/not finished/);
    expect(runner.step()).toBe(true);
    expect(runner.status).toBe("running");
    expect(runner.stepCount).toBe(1);
  });

  it("stops stepping once the episode is over", () => {
    const { runner } = makeEpisode(createZeroCommandSource(), { durationSeconds: 0.1 });

    runner.run();
    const stepsAfterRun = runner.stepCount;

    expect(runner.step()).toBe(false);
    expect(runner.stepCount).toBe(stepsAfterRun);
  });

  it("rejects episode options that cannot produce a fixed step schedule", () => {
    expect(() => makeEpisode(createZeroCommandSource(), { stepSeconds: 0 })).toThrow(
      /stepSeconds/
    );
    expect(() => makeEpisode(createZeroCommandSource(), { durationSeconds: -1 })).toThrow(
      /durationSeconds/
    );
  });
});
