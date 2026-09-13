import type { Vector2 } from "../../shared/vector2.ts";

/**
 * Fitness算出に必要な最小の結果。`EpisodeResult` は構造的にこれを満たすため、
 * domain層はsimulation層の型へ依存せずに済む。
 */
export interface EpisodeOutcome {
  readonly status: "completed" | "invalid";
  readonly invalidReason: string | null;
  readonly startCenterOfMass: Vector2;
  readonly endCenterOfMass: Vector2;
  readonly maxForwardProgress: number;
  readonly motorEffort: number;
}

export interface FitnessWeights {
  readonly forwardProgress: number;
  readonly bestProgress: number;
  readonly energy: number;
  readonly invalidPenalty: number;
}

export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = {
  // endProgressだけだと一時的な面白い動きを評価しにくく、bestProgressだけだと
  // 一瞬だけ部位を投げ出す個体が有利になるため、両方を見る（docs/05 §6）。
  forwardProgress: 0.7,
  bestProgress: 0.3,
  energy: 0.01,
  invalidPenalty: 1000
};

export interface FitnessTerms {
  readonly forwardProgress: number;
  readonly bestProgress: number;
  /** 骨格幅で割った体長倍の前進量。骨格の大きさが違っても比較できる。 */
  readonly normalizedForwardProgress: number;
  readonly energyPenalty: number;
  readonly invalidPenalty: number;
  readonly invalidReason: string | null;
}

export interface FitnessBreakdown {
  readonly fitness: number;
  readonly terms: FitnessTerms;
}

/**
 * 転がる・跳ねる・引きずるといった奇妙な解はこの体験の魅力なので残す。
 * 罰するのは数値的な失敗（NaN、すり抜け、爆発）だけ（docs/05 §6）。
 */
export function evaluateFitness(
  outcome: EpisodeOutcome,
  skeletonWidth: number,
  weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS
): FitnessBreakdown {
  if (!Number.isFinite(skeletonWidth) || skeletonWidth <= 0) {
    throw new RangeError("skeletonWidth must be finite and greater than zero");
  }

  const invalid = outcome.status === "invalid";
  const forwardProgress = invalid
    ? 0
    : outcome.endCenterOfMass.x - outcome.startCenterOfMass.x;
  const bestProgress = invalid ? 0 : outcome.maxForwardProgress;
  const energyPenalty = invalid ? 0 : weights.energy * outcome.motorEffort;
  const invalidPenalty = invalid ? weights.invalidPenalty : 0;

  const fitness =
    weights.forwardProgress * forwardProgress +
    weights.bestProgress * bestProgress -
    energyPenalty -
    invalidPenalty;

  return {
    fitness,
    terms: {
      forwardProgress,
      bestProgress,
      normalizedForwardProgress: forwardProgress / skeletonWidth,
      energyPenalty,
      invalidPenalty,
      invalidReason: outcome.invalidReason
    }
  };
}
