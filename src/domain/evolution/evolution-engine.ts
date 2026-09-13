import type { FitnessTerms } from "./fitness.ts";
import {
  createRandomGenome,
  DEFAULT_GENOME_BOUNDS,
  type Genome,
  type GenomeBounds
} from "./genome.ts";
import type { RandomSource } from "./seeded-random.ts";
import {
  mutate,
  selectElite,
  tournamentSelect,
  uniformCrossover,
  DEFAULT_MUTATION_CONFIG,
  type MutationConfig,
  type ScoredGenome
} from "./selection.ts";

export interface EvolutionConfig {
  readonly populationSize: number;
  readonly eliteCount: number;
  readonly tournamentSize: number;
  readonly mutation: MutationConfig;
  readonly bounds: GenomeBounds;
}

/** docs/05 §4 のPoC開始値。実測後に変更する。 */
export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  populationSize: 32,
  eliteCount: 4,
  tournamentSize: 3,
  mutation: DEFAULT_MUTATION_CONFIG,
  bounds: DEFAULT_GENOME_BOUNDS
};

export interface GenerationStats {
  readonly generation: number;
  readonly bestFitness: number;
  readonly medianFitness: number;
  readonly meanFitness: number;
  /** その世代で最も遠くまで進んだ個体の、骨格幅で正規化した前進量。 */
  readonly bestNormalizedForwardProgress: number;
  readonly invalidCount: number;
}

function assertConfig(config: EvolutionConfig): void {
  if (!Number.isInteger(config.populationSize) || config.populationSize < 1) {
    throw new RangeError("populationSize must be a positive integer");
  }
  if (!Number.isInteger(config.eliteCount) || config.eliteCount < 0) {
    throw new RangeError("eliteCount must be a non-negative integer");
  }
  if (config.eliteCount >= config.populationSize) {
    throw new RangeError("eliteCount must be smaller than populationSize");
  }
}

export function createInitialPopulation(
  random: RandomSource,
  jointCount: number,
  config: EvolutionConfig = DEFAULT_EVOLUTION_CONFIG
): readonly Genome[] {
  assertConfig(config);
  return Array.from({ length: config.populationSize }, () =>
    createRandomGenome(random, jointCount, config.bounds)
  );
}

/**
 * Elite保存 → Tournament selection → 一様交叉 → Gaussian mutation + clamp（docs/05 §4）。
 */
export function nextGeneration(
  random: RandomSource,
  scored: readonly ScoredGenome[],
  config: EvolutionConfig = DEFAULT_EVOLUTION_CONFIG
): readonly Genome[] {
  assertConfig(config);
  if (scored.length === 0) {
    throw new RangeError("cannot evolve an empty population");
  }

  const population: Genome[] = [...selectElite(scored, config.eliteCount)];
  while (population.length < config.populationSize) {
    const parentA = tournamentSelect(random, scored, config.tournamentSize);
    const parentB = tournamentSelect(random, scored, config.tournamentSize);
    population.push(
      mutate(random, uniformCrossover(random, parentA, parentB), config.mutation, config.bounds)
    );
  }
  return population;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function summarizeGeneration(
  generation: number,
  scored: readonly ScoredGenome[],
  terms: readonly FitnessTerms[]
): GenerationStats {
  if (scored.length !== terms.length) {
    throw new RangeError("scored genomes and fitness terms must have the same length");
  }
  if (scored.length === 0) {
    throw new RangeError("cannot summarize an empty generation");
  }

  const fitnesses = scored.map((entry) => entry.fitness);
  return {
    generation,
    bestFitness: Math.max(...fitnesses),
    medianFitness: median(fitnesses),
    meanFitness: fitnesses.reduce((total, value) => total + value, 0) / fitnesses.length,
    bestNormalizedForwardProgress: Math.max(
      ...terms.map((entry) => entry.normalizedForwardProgress)
    ),
    invalidCount: terms.filter((entry) => entry.invalidReason !== null).length
  };
}
