import { validateCreatureGraph } from "../domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "../domain/creature/creature-graph.ts";
import { creatureGraphHash } from "../domain/creature/graph-hash.ts";
import {
  createInitialPopulation,
  nextGeneration,
  summarizeGeneration,
  DEFAULT_EVOLUTION_CONFIG,
  type EvolutionConfig,
  type GenerationStats
} from "../domain/evolution/evolution-engine.ts";
import {
  evaluateFitness,
  DEFAULT_FITNESS_WEIGHTS,
  type FitnessBreakdown,
  type FitnessTerms,
  type FitnessWeights
} from "../domain/evolution/fitness.ts";
import {
  genomeToCommandSource,
  DEFAULT_CONTROLLER_GAINS,
  type ControllerGains,
  type Genome
} from "../domain/evolution/genome.ts";
import { createSeededRandom } from "../domain/evolution/seeded-random.ts";
import type { ScoredGenome } from "../domain/evolution/selection.ts";
import {
  createRunRecord,
  type RunRecord
} from "../domain/run/run-record.ts";
import { createCreature } from "../simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../simulation/box2d/box2d-world.ts";
import {
  resolveEpisodeOptions,
  type EpisodeOptions,
  type EpisodeResult
} from "../simulation/episode-tracker.ts";
import { planLanes } from "../simulation/lane-allocator.ts";
import { PopulationRunner } from "../simulation/population-runner.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth,
  DEFAULT_SKELETON_SETTINGS,
  type SkeletonPlan,
  type SkeletonSettings
} from "../simulation/skeleton-plan.ts";

const SPAWN_CLEARANCE = 0.1;

const RUNTIME_VERSIONS: Readonly<Record<string, string>> = {
  phaser: "4.2.1",
  phaserBox2d: "1.1.0"
};

export interface EvolutionRunOptions {
  readonly graph: CreatureGraph;
  readonly seed: number;
  readonly generations: number;
  readonly evolution?: EvolutionConfig;
  readonly episode?: Partial<EpisodeOptions>;
  readonly skeleton?: SkeletonSettings;
  readonly weights?: FitnessWeights;
  readonly gains?: ControllerGains;
  /** true にすると選択・交叉・突然変異を行わず、初期Populationを毎世代再評価する対照群になる。 */
  readonly disableEvolution?: boolean;
  readonly createdAt?: string;
  /**
   * 物理World。渡すと作り直さず再利用し、破棄もしない（D-006）。
   * 破棄は渡した側の責任。長時間開くページでは1つを使い回すこと。
   */
  readonly world?: PhysicsWorld;
}

export interface BestEver {
  readonly genome: Genome;
  readonly fitness: number;
  readonly generation: number;
  readonly terms: FitnessTerms;
  readonly episode: EpisodeResult;
}

export interface EvolutionRunResult {
  readonly seed: number;
  readonly graphHash: string;
  readonly skeletonWidth: number;
  readonly generations: readonly GenerationStats[];
  /** 世代ごとの最良個体。世代変化を人が見て確かめるためのリプレイ入力になる。 */
  readonly bestPerGeneration: readonly BestEver[];
  readonly bestEver: BestEver;
  readonly runRecord: RunRecord;
}

function planFor(graph: CreatureGraph, skeleton: SkeletonSettings): SkeletonPlan {
  const validated = validateCreatureGraph(graph);
  if (!validated.ok) {
    const codes = validated.errors.map((error) => error.code).join(", ");
    throw new Error(`creature graph is invalid: ${codes}`);
  }
  return buildSkeletonPlan(validated.graph, skeleton);
}

function evaluatePopulation(
  world: PhysicsWorld,
  plan: SkeletonPlan,
  genomes: readonly Genome[],
  gains: ControllerGains,
  episode: EpisodeOptions
): readonly EpisodeResult[] {
  const clearance = computeSpawnOffset(plan, SPAWN_CLEARANCE);
  const creatures = planLanes(genomes.length, skeletonWidth(plan)).map((lane) =>
    createCreature(world, plan, {
      origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
      groupIndex: lane.groupIndex
    })
  );
  try {
    return new PopulationRunner({
      world,
      creatures,
      members: genomes.map((genome) => ({
        commands: genomeToCommandSource(genome, gains)
      })),
      options: episode
    }).run();
  } finally {
    // Jointを先に、Bodyを後に。Worldは作り直さず再利用する（D-006）。
    for (const creature of creatures) {
      creature.destroy();
    }
  }
}

/**
 * 遺伝的アルゴリズムと物理評価を結ぶApplication層。
 * domain側は物理を知らず、simulation側は進化を知らない。
 *
 * 1世代ずつ進められるようにしてあるのは、画面が固まる時間を短く保つため。
 * 全世代を一度に回す `runEvolution` は、これを最後まで進めるだけの薄い包み。
 */
export class EvolutionRunner {
  readonly #options: EvolutionRunOptions;
  readonly #skeleton: SkeletonSettings;
  readonly #evolution: EvolutionConfig;
  readonly #weights: FitnessWeights;
  readonly #gains: ControllerGains;
  readonly #episode: EpisodeOptions;
  readonly #plan: SkeletonPlan;
  readonly #width: number;
  readonly #random: ReturnType<typeof createSeededRandom>;
  readonly #initialPopulation: readonly Genome[];
  readonly #world: PhysicsWorld;
  readonly #ownsWorld: boolean;
  readonly #generations: GenerationStats[] = [];
  readonly #bestPerGeneration: BestEver[] = [];

  #population: readonly Genome[];
  #bestEver: BestEver | null = null;
  #completed = 0;
  #disposed = false;

  constructor(options: EvolutionRunOptions) {
    if (!Number.isInteger(options.generations) || options.generations < 1) {
      throw new RangeError("generations must be a positive integer");
    }
    this.#options = options;
    this.#skeleton = options.skeleton ?? DEFAULT_SKELETON_SETTINGS;
    this.#evolution = options.evolution ?? DEFAULT_EVOLUTION_CONFIG;
    this.#weights = options.weights ?? DEFAULT_FITNESS_WEIGHTS;
    this.#gains = options.gains ?? DEFAULT_CONTROLLER_GAINS;
    this.#episode = resolveEpisodeOptions(options.episode ?? {});
    this.#plan = planFor(options.graph, this.#skeleton);
    this.#width = skeletonWidth(this.#plan);
    this.#random = createSeededRandom(options.seed);
    this.#initialPopulation = createInitialPopulation(
      this.#random,
      this.#plan.joints.length,
      this.#evolution
    );
    this.#population = this.#initialPopulation;
    this.#ownsWorld = options.world === undefined;
    this.#world = options.world ?? createPhysicsWorld();
  }

  get totalGenerations(): number {
    return this.#options.generations;
  }

  get completedGenerations(): number {
    return this.#completed;
  }

  get done(): boolean {
    return this.#completed >= this.#options.generations;
  }

  /** 1世代ぶんを評価して世代交代する。まだ続くなら true。 */
  advance(): boolean {
    if (this.#disposed) {
      throw new Error("evolution runner has been disposed");
    }
    if (this.done) {
      return false;
    }

    const generation = this.#completed;
    const genomes =
      this.#options.disableEvolution === true ? this.#initialPopulation : this.#population;
    const results = evaluatePopulation(
      this.#world,
      this.#plan,
      genomes,
      this.#gains,
      this.#episode
    );
    const breakdowns: FitnessBreakdown[] = results.map((result) =>
      evaluateFitness(result, this.#width, this.#weights)
    );
    const scored: ScoredGenome[] = genomes.map((genome, index) => ({
      genome,
      fitness: breakdowns[index]!.fitness
    }));
    const terms = breakdowns.map((breakdown) => breakdown.terms);

    this.#generations.push(summarizeGeneration(generation, scored, terms));

    let generationBest: BestEver | null = null;
    for (const [index, entry] of scored.entries()) {
      const candidate: BestEver = {
        genome: entry.genome,
        fitness: entry.fitness,
        generation,
        terms: terms[index]!,
        episode: results[index]!
      };
      if (generationBest === null || candidate.fitness > generationBest.fitness) {
        generationBest = candidate;
      }
    }
    this.#bestPerGeneration.push(generationBest!);
    if (this.#bestEver === null || generationBest!.fitness > this.#bestEver.fitness) {
      this.#bestEver = generationBest!;
    }

    if (this.#options.disableEvolution !== true) {
      this.#population = nextGeneration(this.#random, scored, this.#evolution);
    }

    this.#completed += 1;
    if (this.done) {
      this.#releaseWorld();
    }
    return !this.done;
  }

  /** 全世代が終わっていれば結果を返す。途中なら null。 */
  result(): EvolutionRunResult | null {
    const bestEver = this.#bestEver;
    if (!this.done || bestEver === null) {
      return null;
    }
    return {
      seed: this.#options.seed,
      graphHash: creatureGraphHash(this.#options.graph),
      skeletonWidth: this.#width,
      generations: this.#generations,
      bestPerGeneration: this.#bestPerGeneration,
      bestEver,
      runRecord: createRunRecord({
        graph: this.#options.graph,
        seed: this.#options.seed,
        episode: this.#episode,
        skeleton: this.#skeleton,
        result: bestEver.episode,
        createdAt: this.#options.createdAt ?? new Date().toISOString(),
        runtimeVersions: RUNTIME_VERSIONS
      })
    };
  }

  /** 途中で止める。自分で作ったWorldだけ破棄する。 */
  dispose(): void {
    this.#disposed = true;
    this.#releaseWorld();
  }

  #releaseWorld(): void {
    if (this.#ownsWorld) {
      this.#world.destroy();
    }
  }
}

export function runEvolution(options: EvolutionRunOptions): EvolutionRunResult {
  const runner = new EvolutionRunner(options);
  try {
    while (runner.advance()) {
      // 全世代を回しきる。
    }
  } catch (error) {
    runner.dispose();
    throw error;
  }
  const result = runner.result();
  if (result === null) {
    throw new Error("evolution produced no individuals");
  }
  return result;
}

export interface ReplayOptions {
  readonly graph: CreatureGraph;
  readonly seed: number;
  readonly genome: Genome;
  readonly episode?: Partial<EpisodeOptions>;
  readonly skeleton?: SkeletonSettings;
  readonly weights?: FitnessWeights;
  readonly gains?: ControllerGains;
  readonly createdAt?: string;
  /** 物理World。渡すと作り直さず再利用し、破棄もしない（D-006）。 */
  readonly world?: PhysicsWorld;
}

export interface ReplayResult {
  readonly result: EpisodeResult;
  readonly fitness: FitnessBreakdown;
  readonly runRecord: RunRecord;
}

/** 保存したGenomeを同じ条件で再評価する。元の評価値と一致することが再現性の証明になる。 */
export function replayGenome(options: ReplayOptions): ReplayResult {
  const skeleton = options.skeleton ?? DEFAULT_SKELETON_SETTINGS;
  const weights = options.weights ?? DEFAULT_FITNESS_WEIGHTS;
  const gains = options.gains ?? DEFAULT_CONTROLLER_GAINS;
  const episode = resolveEpisodeOptions(options.episode ?? {});
  const plan = planFor(options.graph, skeleton);
  const width = skeletonWidth(plan);

  const world = options.world ?? createPhysicsWorld();
  try {
    const [result] = evaluatePopulation(world, plan, [options.genome], gains, episode);
    if (!result) {
      throw new Error("replay produced no episode result");
    }
    const fitness = evaluateFitness(result, width, weights);
    return {
      result,
      fitness,
      runRecord: createRunRecord({
        graph: options.graph,
        seed: options.seed,
        episode,
        skeleton,
        result,
        createdAt: options.createdAt ?? new Date().toISOString(),
        runtimeVersions: RUNTIME_VERSIONS
      })
    };
  } finally {
    if (options.world === undefined) {
      world.destroy();
    }
  }
}
