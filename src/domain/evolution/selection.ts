import {
  clampGenome,
  wrapPhase,
  DEFAULT_GENOME_BOUNDS,
  type Genome,
  type GenomeBounds,
  type JointGene
} from "./genome.ts";
import type { RandomSource } from "./seeded-random.ts";

export interface ScoredGenome {
  readonly genome: Genome;
  readonly fitness: number;
}

export function selectElite(
  scored: readonly ScoredGenome[],
  eliteCount: number
): readonly Genome[] {
  if (!Number.isInteger(eliteCount) || eliteCount < 0) {
    throw new RangeError("eliteCount must be a non-negative integer");
  }
  return [...scored]
    .sort((left, right) => right.fitness - left.fitness)
    .slice(0, eliteCount)
    .map((entry) => entry.genome);
}

/**
 * Tournament selection。`tournamentSize` 体を無作為に選び、最良を返す。
 * サイズ1は一様選択と等価になるため、選択圧の有無を切り替えられる。
 */
export function tournamentSelect(
  random: RandomSource,
  scored: readonly ScoredGenome[],
  tournamentSize: number
): Genome {
  if (scored.length === 0) {
    throw new RangeError("cannot select from an empty population");
  }
  if (!Number.isInteger(tournamentSize) || tournamentSize < 1) {
    throw new RangeError("tournamentSize must be a positive integer");
  }

  let best = scored[random.nextInt(scored.length)]!;
  for (let round = 1; round < tournamentSize; round += 1) {
    const challenger = scored[random.nextInt(scored.length)]!;
    if (challenger.fitness > best.fitness) {
      best = challenger;
    }
  }
  return best.genome;
}

/** Gene単位の一様交叉。親が同じ骨格を共有するため構造不一致の処理は不要（docs/05 §5）。 */
export function uniformCrossover(
  random: RandomSource,
  parentA: Genome,
  parentB: Genome
): Genome {
  if (parentA.joints.length !== parentB.joints.length) {
    throw new RangeError("parents must share the same joint count");
  }
  return {
    globalFrequency:
      random.next() < 0.5 ? parentA.globalFrequency : parentB.globalFrequency,
    joints: parentA.joints.map((geneA, index) => {
      const geneB = parentB.joints[index]!;
      return {
        amplitude: random.next() < 0.5 ? geneA.amplitude : geneB.amplitude,
        phase: random.next() < 0.5 ? geneA.phase : geneB.phase,
        bias: random.next() < 0.5 ? geneA.bias : geneB.bias
      };
    })
  };
}

export interface MutationConfig {
  readonly geneMutationProbability: number;
  readonly frequencySigma: number;
  readonly amplitudeSigma: number;
  readonly phaseSigma: number;
  readonly biasSigma: number;
}

export const DEFAULT_MUTATION_CONFIG: MutationConfig = {
  geneMutationProbability: 0.15,
  frequencySigma: 0.15,
  amplitudeSigma: 0.12,
  phaseSigma: 0.5,
  biasSigma: 0.1
};

export function mutate(
  random: RandomSource,
  genome: Genome,
  config: MutationConfig = DEFAULT_MUTATION_CONFIG,
  bounds: GenomeBounds = DEFAULT_GENOME_BOUNDS
): Genome {
  const maybe = (value: number, sigma: number): number =>
    random.next() < config.geneMutationProbability
      ? value + random.nextGaussian() * sigma
      : value;

  const joints: JointGene[] = genome.joints.map((gene) => ({
    amplitude: maybe(gene.amplitude, config.amplitudeSigma),
    phase: wrapPhase(maybe(gene.phase, config.phaseSigma)),
    bias: maybe(gene.bias, config.biasSigma)
  }));

  return clampGenome(
    {
      globalFrequency: maybe(genome.globalFrequency, config.frequencySigma),
      joints
    },
    bounds
  );
}
