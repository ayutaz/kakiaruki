import { validateCreatureGraph } from "../domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "../domain/creature/creature-graph.ts";
import {
  genomeToCommandSource,
  DEFAULT_CONTROLLER_GAINS,
  type ControllerGains,
  type Genome
} from "../domain/evolution/genome.ts";
import { createCreature } from "../simulation/box2d/box2d-creature-factory.ts";
import { createPhysicsWorld, type PhysicsWorld } from "../simulation/box2d/box2d-world.ts";
import {
  DEFAULT_EPISODE_OPTIONS,
  type EpisodeResult
} from "../simulation/episode-tracker.ts";
import { FixedStepRunner } from "../simulation/fixed-step-runner.ts";
import { planLanes } from "../simulation/lane-allocator.ts";
import { PopulationRunner } from "../simulation/population-runner.ts";
import type { CreatureHandle, CreatureSnapshot } from "../simulation/ports/creature-port.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth
} from "../simulation/skeleton-plan.ts";

const SPAWN_CLEARANCE = 0.1;

export interface ObservationOptions {
  readonly episodeSeconds: number;
  readonly gains?: ControllerGains;
}

/**
 * 観察フェーズの物理資源をまとめて持つ。
 *
 * Worldは**セッション全体で1つ**だけ作り、作り直さない（D-006）。
 * `start` のたびに個体だけを入れ替え、`stop` / `dispose` で確実に片付ける。
 * 壁時計から固定stepへの変換もここが持ち、背景タブから戻ったときに
 * 時間を一気に消費しないよう1フレームのstep数へ上限を置く。
 */
export class ObservationSession {
  /** 1フレームで進める最大step数。60 fps換算で約2秒ぶん。 */
  static readonly MAX_STEPS_PER_FRAME = 120;

  #world: PhysicsWorld | null = null;
  #creatures: readonly CreatureHandle[] = [];
  #runner: PopulationRunner | null = null;
  readonly #stepRunner = new FixedStepRunner({
    stepSeconds: DEFAULT_EPISODE_OPTIONS.stepSeconds,
    maxStepsPerFrame: ObservationSession.MAX_STEPS_PER_FRAME
  });

  get stepCount(): number {
    return this.#runner?.stepCount ?? 0;
  }

  get finished(): boolean {
    return this.#runner === null ? true : this.#runner.finished;
  }

  get populationSize(): number {
    return this.#creatures.length;
  }

  /** 指定したGenomeたちを、同じ形の個体としてレーンへ並べる。 */
  start(
    graph: CreatureGraph,
    genomes: readonly Genome[],
    options: ObservationOptions
  ): void {
    if (genomes.length === 0) {
      throw new RangeError("observation needs at least one genome");
    }
    const validated = validateCreatureGraph(graph);
    if (!validated.ok) {
      const codes = validated.errors.map((error) => error.code).join(", ");
      throw new Error(`creature graph is invalid: ${codes}`);
    }

    this.stop();
    const world = this.#physicsWorld();
    const plan = buildSkeletonPlan(validated.graph);
    const clearance = computeSpawnOffset(plan, SPAWN_CLEARANCE);
    const creatures = planLanes(genomes.length, skeletonWidth(plan)).map((lane) =>
      createCreature(world, plan, {
        origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
        groupIndex: lane.groupIndex
      })
    );

    this.#creatures = creatures;
    this.#stepRunner.reset();
    this.#runner = new PopulationRunner({
      world,
      creatures,
      members: genomes.map((genome) => ({
        commands: genomeToCommandSource(genome, options.gains ?? DEFAULT_CONTROLLER_GAINS)
      })),
      options: { durationSeconds: options.episodeSeconds }
    });
  }

  /**
   * 壁時計 `wallSeconds` ぶんを `speed` 倍して固定stepへ変換する。
   * episodeの長さとfitnessの定義は変わらない。速く見えるだけ。
   */
  advance(wallSeconds: number, speed: number): void {
    const runner = this.#runner;
    if (!runner || runner.finished) {
      return;
    }
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new RangeError("speed must be finite and greater than zero");
    }
    this.#stepRunner.advance(Math.max(0, wallSeconds) * speed, () => {
      runner.step();
    });
  }

  snapshots(renderCount: number): readonly CreatureSnapshot[] {
    const runner = this.#runner;
    if (!runner) {
      return [];
    }
    const count = Math.min(Math.max(0, Math.trunc(renderCount)), this.#creatures.length);
    return runner.snapshots(Array.from({ length: count }, (_unused, index) => index));
  }

  results(): readonly EpisodeResult[] {
    return this.#runner?.results() ?? [];
  }

  /** Worldに残っているshape数。地面だけなら1。 */
  shapeCount(): number {
    return this.#world?.countShapes() ?? 0;
  }

  /** 個体だけを片付ける。Worldは残して使い回す。 */
  stop(): void {
    for (const creature of this.#creatures) {
      creature.destroy();
    }
    this.#creatures = [];
    this.#runner = null;
    this.#stepRunner.reset();
  }

  /** セッションを終える。Worldも破棄する。 */
  dispose(): void {
    this.stop();
    this.#world?.destroy();
    this.#world = null;
  }

  #physicsWorld(): PhysicsWorld {
    const world = this.#world ?? createPhysicsWorld();
    this.#world = world;
    return world;
  }
}
