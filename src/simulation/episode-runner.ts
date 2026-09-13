import type { JointCommandSource } from "../domain/control/joint-command-source.ts";
import type { Vector2 } from "../shared/vector2.ts";

import type { CreatureHandle } from "./box2d/box2d-creature-factory.ts";

export interface EpisodeOptions {
  readonly stepSeconds: number;
  readonly subSteps: number;
  readonly durationSeconds: number;
  /** これを超える座標が現れた個体はinvalidとして打ち切る。 */
  readonly maxCoordinateMagnitude: number;
}

export const DEFAULT_EPISODE_OPTIONS: EpisodeOptions = {
  stepSeconds: 1 / 60,
  subSteps: 4,
  durationSeconds: 6,
  maxCoordinateMagnitude: 500
};

export type EpisodeStatus = "ready" | "running" | "completed" | "invalid";
export type EpisodeInvalidReason = "non-finite-state" | "out-of-bounds";

export interface EpisodeResult {
  readonly status: "completed" | "invalid";
  readonly invalidReason: EpisodeInvalidReason | null;
  readonly steps: number;
  readonly elapsedSeconds: number;
  readonly startCenterOfMass: Vector2;
  readonly endCenterOfMass: Vector2;
  /** 開始時の重心から見た、エピソード中の最大前進量。 */
  readonly maxForwardProgress: number;
  /** Σ |motorTorque| * dt。M3のenergy項の入力になる。 */
  readonly motorEffort: number;
}

export interface SteppableWorld {
  step(stepSeconds: number, subSteps: number): void;
}

export interface EpisodeDependencies {
  readonly world: SteppableWorld;
  readonly creature: CreatureHandle;
  readonly commands: JointCommandSource;
  readonly options?: Partial<EpisodeOptions>;
}

function resolveOptions(partial: Partial<EpisodeOptions> = {}): EpisodeOptions {
  const options: EpisodeOptions = { ...DEFAULT_EPISODE_OPTIONS, ...partial };
  if (!Number.isFinite(options.stepSeconds) || options.stepSeconds <= 0) {
    throw new RangeError("stepSeconds must be finite and greater than zero");
  }
  if (!Number.isInteger(options.subSteps) || options.subSteps < 1) {
    throw new RangeError("subSteps must be a positive integer");
  }
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) {
    throw new RangeError("durationSeconds must be finite and greater than zero");
  }
  if (
    !Number.isFinite(options.maxCoordinateMagnitude) ||
    options.maxCoordinateMagnitude <= 0
  ) {
    throw new RangeError("maxCoordinateMagnitude must be finite and greater than zero");
  }
  return options;
}

/**
 * 1個体・1エピソードを固定stepで進め、Fitnessの入力になる指標を集める。
 * PhaserにもrequestAnimationFrameにも依存しないため、headlessで実行できる。
 */
export class EpisodeRunner {
  readonly #world: SteppableWorld;
  readonly #creature: CreatureHandle;
  readonly #commands: JointCommandSource;
  readonly #options: EpisodeOptions;
  readonly #totalSteps: number;
  readonly #startCenterOfMass: Vector2;

  #status: EpisodeStatus = "ready";
  #invalidReason: EpisodeInvalidReason | null = null;
  #steps = 0;
  #motorEffort = 0;
  #maxForwardProgress = 0;
  #lastCenterOfMass: Vector2;

  constructor(dependencies: EpisodeDependencies) {
    this.#options = resolveOptions(dependencies.options);
    this.#world = dependencies.world;
    this.#creature = dependencies.creature;
    this.#commands = dependencies.commands;
    this.#totalSteps = Math.round(
      this.#options.durationSeconds / this.#options.stepSeconds
    );
    this.#startCenterOfMass = this.#creature.centerOfMass();
    this.#lastCenterOfMass = this.#startCenterOfMass;
  }

  get status(): EpisodeStatus {
    return this.#status;
  }

  get stepCount(): number {
    return this.#steps;
  }

  /** まだエピソードが続くなら true。 */
  step(): boolean {
    if (this.#status === "completed" || this.#status === "invalid") {
      return false;
    }
    this.#status = "running";

    const elapsedSeconds = this.#steps * this.#options.stepSeconds;
    for (let index = 0; index < this.#creature.jointCount; index += 1) {
      const state = this.#creature.jointState(index);
      const speed = this.#commands.motorSpeed(
        { index, angle: state.angle, angularVelocity: state.angularVelocity },
        elapsedSeconds
      );
      this.#creature.setMotorSpeed(index, speed);
    }

    this.#world.step(this.#options.stepSeconds, this.#options.subSteps);
    this.#steps += 1;

    for (let index = 0; index < this.#creature.jointCount; index += 1) {
      this.#motorEffort +=
        Math.abs(this.#creature.jointState(index).motorTorque) * this.#options.stepSeconds;
    }

    if (!this.#creature.hasFiniteState()) {
      this.#finishInvalid("non-finite-state");
      return false;
    }
    if (this.#creature.maxAbsCoordinate() > this.#options.maxCoordinateMagnitude) {
      this.#finishInvalid("out-of-bounds");
      return false;
    }

    this.#lastCenterOfMass = this.#creature.centerOfMass();
    this.#maxForwardProgress = Math.max(
      this.#maxForwardProgress,
      this.#lastCenterOfMass.x - this.#startCenterOfMass.x
    );

    if (this.#steps >= this.#totalSteps) {
      this.#status = "completed";
      return false;
    }
    return true;
  }

  run(): EpisodeResult {
    while (this.step()) {
      // 固定step。壁時計には従わない。
    }
    return this.result();
  }

  result(): EpisodeResult {
    if (this.#status !== "completed" && this.#status !== "invalid") {
      throw new Error("episode is not finished yet");
    }
    return {
      status: this.#status,
      invalidReason: this.#invalidReason,
      steps: this.#steps,
      elapsedSeconds: this.#steps * this.#options.stepSeconds,
      startCenterOfMass: this.#startCenterOfMass,
      endCenterOfMass: this.#lastCenterOfMass,
      maxForwardProgress: this.#maxForwardProgress,
      motorEffort: this.#motorEffort
    };
  }

  #finishInvalid(reason: EpisodeInvalidReason): void {
    this.#status = "invalid";
    this.#invalidReason = reason;
  }
}
