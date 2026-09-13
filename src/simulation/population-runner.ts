import type { JointCommandSource } from "../domain/control/joint-command-source.ts";

import {
  EpisodeTracker,
  resolveEpisodeOptions,
  type EpisodeOptions,
  type EpisodeResult
} from "./episode-tracker.ts";
import type { CreatureHandle, CreatureSnapshot } from "./ports/creature-port.ts";
import type { SteppableWorld } from "./ports/world-port.ts";

export interface PopulationMember {
  readonly commands: JointCommandSource;
}

export interface PopulationRunnerDependencies {
  readonly world: SteppableWorld;
  readonly creatures: readonly CreatureHandle[];
  readonly members: readonly PopulationMember[];
  readonly options?: Partial<EpisodeOptions>;
}

/**
 * 1つのWorld内の複数個体を同時に評価する。Worldは1 stepにつき1回だけ進めるため、
 * 個体数が増えても時間の進み方は全個体で同一になる。
 *
 * 描画は `snapshots()` で必要な個体だけを取り出す。描画の有無・個数は評価へ影響しない。
 */
export class PopulationRunner {
  readonly #world: SteppableWorld;
  readonly #creatures: readonly CreatureHandle[];
  readonly #trackers: readonly EpisodeTracker[];
  readonly #options: EpisodeOptions;
  #steps = 0;

  constructor(dependencies: PopulationRunnerDependencies) {
    if (dependencies.creatures.length === 0) {
      throw new RangeError("population must not be empty");
    }
    if (dependencies.creatures.length !== dependencies.members.length) {
      throw new RangeError(
        `members (${dependencies.members.length}) must match creatures (${dependencies.creatures.length})`
      );
    }
    this.#options = resolveEpisodeOptions(dependencies.options ?? {});
    this.#world = dependencies.world;
    this.#creatures = dependencies.creatures;
    this.#trackers = dependencies.creatures.map(
      (creature, index) =>
        new EpisodeTracker(creature, dependencies.members[index]!.commands, this.#options)
    );
  }

  get populationSize(): number {
    return this.#creatures.length;
  }

  get stepCount(): number {
    return this.#steps;
  }

  get finished(): boolean {
    return this.#trackers.every((tracker) => tracker.finished);
  }

  /** まだ評価が続くなら true。 */
  step(): boolean {
    if (this.finished) {
      return false;
    }
    for (const tracker of this.#trackers) {
      tracker.applyCommands();
    }
    this.#world.step(this.#options.stepSeconds, this.#options.subSteps);
    this.#steps += 1;
    for (const tracker of this.#trackers) {
      tracker.observe();
    }
    return !this.finished;
  }

  run(): readonly EpisodeResult[] {
    while (this.step()) {
      // 固定step。壁時計には従わない。
    }
    return this.results();
  }

  results(): readonly EpisodeResult[] {
    return this.#trackers.map((tracker) => tracker.result());
  }

  snapshots(indexes: readonly number[]): readonly CreatureSnapshot[] {
    return indexes.map((index) => {
      const creature = this.#creatures[index];
      if (!creature) {
        throw new RangeError(
          `population index ${index} is out of range (0..${this.#creatures.length - 1})`
        );
      }
      return creature.snapshot();
    });
  }
}
