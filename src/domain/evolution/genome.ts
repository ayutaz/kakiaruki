import {
  createSineCommandSource,
  type JointCommandSource
} from "../control/joint-command-source.ts";

import type { RandomSource } from "./seeded-random.ts";

const TAU = 2 * Math.PI;

export interface JointGene {
  readonly amplitude: number;
  readonly phase: number;
  readonly bias: number;
}

/**
 * 関節の動かし方だけを表す遺伝子。形態は進化させない（D-003）。
 * 周波数は探索空間を小さく保つため全関節で共有する（docs/05 §3）。
 */
export interface Genome {
  readonly globalFrequency: number;
  readonly joints: readonly JointGene[];
}

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface GenomeBounds {
  readonly frequency: Range;
  readonly amplitude: Range;
  readonly bias: Range;
}

export const DEFAULT_GENOME_BOUNDS: GenomeBounds = {
  frequency: { min: 0.25, max: 3 },
  // 関節limit ±0.9 rad の内側に収める。
  amplitude: { min: 0, max: 0.9 },
  bias: { min: -0.5, max: 0.5 }
};

export interface ControllerGains {
  readonly proportionalGain: number;
  readonly derivativeGain: number;
  readonly maxMotorSpeed: number;
}

export const DEFAULT_CONTROLLER_GAINS: ControllerGains = {
  proportionalGain: 12,
  derivativeGain: 0.5,
  maxMotorSpeed: 9
};

function clamp(value: number, range: Range): number {
  if (!Number.isFinite(value)) {
    return range.min;
  }
  return Math.min(range.max, Math.max(range.min, value));
}

export function wrapPhase(phase: number): number {
  if (!Number.isFinite(phase)) {
    return 0;
  }
  const wrapped = phase % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

export function createRandomGenome(
  random: RandomSource,
  jointCount: number,
  bounds: GenomeBounds = DEFAULT_GENOME_BOUNDS
): Genome {
  if (!Number.isInteger(jointCount) || jointCount < 1) {
    throw new RangeError("jointCount must be a positive integer");
  }
  return {
    globalFrequency: random.nextInRange(bounds.frequency.min, bounds.frequency.max),
    joints: Array.from({ length: jointCount }, () => ({
      amplitude: random.nextInRange(bounds.amplitude.min, bounds.amplitude.max),
      phase: random.nextInRange(0, TAU),
      bias: random.nextInRange(bounds.bias.min, bounds.bias.max)
    }))
  };
}

export function clampGenome(
  genome: Genome,
  bounds: GenomeBounds = DEFAULT_GENOME_BOUNDS
): Genome {
  return {
    globalFrequency: clamp(genome.globalFrequency, bounds.frequency),
    joints: genome.joints.map((gene) => ({
      amplitude: clamp(gene.amplitude, bounds.amplitude),
      phase: wrapPhase(gene.phase),
      bias: clamp(gene.bias, bounds.bias)
    }))
  };
}

/** Genome を M1 の `JointCommandSource` port の実装へ変換する。 */
export function genomeToCommandSource(
  genome: Genome,
  gains: ControllerGains = DEFAULT_CONTROLLER_GAINS
): JointCommandSource {
  return createSineCommandSource({
    globalFrequency: genome.globalFrequency,
    joints: genome.joints,
    proportionalGain: gains.proportionalGain,
    derivativeGain: gains.derivativeGain,
    maxMotorSpeed: gains.maxMotorSpeed
  });
}
