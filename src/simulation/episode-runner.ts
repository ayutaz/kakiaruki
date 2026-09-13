import type { JointCommandSource } from "../domain/control/joint-command-source.ts";

import {
  EpisodeTracker,
  type EpisodeOptions,
  type EpisodeResult,
  type EpisodeStatus
} from "./episode-tracker.ts";
import type { CreatureHandle } from "./ports/creature-port.ts";
import type { SteppableWorld } from "./ports/world-port.ts";

export {
  DEFAULT_EPISODE_OPTIONS,
  EpisodeTracker,
  resolveEpisodeOptions
} from "./episode-tracker.ts";
export type {
  EpisodeInvalidReason,
  EpisodeOptions,
  EpisodeResult,
  EpisodeStatus
} from "./episode-tracker.ts";
export type { SteppableWorld } from "./ports/world-port.ts";

export interface EpisodeDependencies {
  readonly world: SteppableWorld;
  readonly creature: CreatureHandle;
  readonly commands: JointCommandSource;
  readonly options?: Partial<EpisodeOptions>;
}

/**
 * 1個体・1エピソードを固定stepで進める。Worldのstepもここが所有するため単体評価に使う。
 * 複数個体を1つのWorldで同時評価する場合は `PopulationRunner` を使う。
 */
export class EpisodeRunner {
  readonly #world: SteppableWorld;
  readonly #tracker: EpisodeTracker;

  constructor(dependencies: EpisodeDependencies) {
    this.#tracker = new EpisodeTracker(
      dependencies.creature,
      dependencies.commands,
      dependencies.options ?? {}
    );
    this.#world = dependencies.world;
  }

  get status(): EpisodeStatus {
    return this.#tracker.status;
  }

  get stepCount(): number {
    return this.#tracker.stepCount;
  }

  /** まだエピソードが続くなら true。 */
  step(): boolean {
    if (this.#tracker.finished) {
      return false;
    }
    const { stepSeconds, subSteps } = this.#tracker.options;
    this.#tracker.applyCommands();
    this.#world.step(stepSeconds, subSteps);
    return this.#tracker.observe();
  }

  run(): EpisodeResult {
    while (this.step()) {
      // 固定step。壁時計には従わない。
    }
    return this.result();
  }

  result(): EpisodeResult {
    return this.#tracker.result();
  }
}
