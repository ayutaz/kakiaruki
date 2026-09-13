import { calculateMotorSpeed } from "./joint-controller.ts";

export interface JointObservation {
  readonly index: number;
  readonly angle: number;
  readonly angularVelocity: number;
}

/**
 * 関節ごとのmotor目標速度を決める境界。M1では周期関数、M3ではGenomeがこれを実装する。
 * 物理実装には依存せず、観測値と経過時間だけから決まる純粋関数であること。
 */
export interface JointCommandSource {
  motorSpeed(observation: JointObservation, elapsedSeconds: number): number;
}

export interface SineJointGene {
  readonly amplitude: number;
  readonly phase: number;
  readonly bias: number;
}

export interface SineCommandConfig {
  /** 全関節で共有する周波数 [Hz]。探索空間を小さく保つため関節ごとには持たせない。 */
  readonly globalFrequency: number;
  readonly joints: readonly SineJointGene[];
  readonly proportionalGain: number;
  readonly derivativeGain: number;
  readonly maxMotorSpeed: number;
}

function assertFiniteConfig(config: SineCommandConfig): void {
  const scalars = {
    globalFrequency: config.globalFrequency,
    proportionalGain: config.proportionalGain,
    derivativeGain: config.derivativeGain,
    maxMotorSpeed: config.maxMotorSpeed
  };
  for (const [name, value] of Object.entries(scalars)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must be finite`);
    }
  }
  if (config.maxMotorSpeed < 0) {
    throw new RangeError("maxMotorSpeed must be non-negative");
  }
  for (const [index, gene] of config.joints.entries()) {
    for (const [name, value] of Object.entries(gene)) {
      if (!Number.isFinite(value)) {
        throw new RangeError(`joint ${index} ${name} must be finite`);
      }
    }
  }
}

export function createSineCommandSource(config: SineCommandConfig): JointCommandSource {
  assertFiniteConfig(config);
  const genes = [...config.joints];

  return {
    motorSpeed(observation: JointObservation, elapsedSeconds: number): number {
      const gene = genes[observation.index];
      if (!gene) {
        return 0;
      }
      const targetAngle =
        gene.bias +
        gene.amplitude *
          Math.sin(2 * Math.PI * config.globalFrequency * elapsedSeconds + gene.phase);
      return calculateMotorSpeed({
        targetAngle,
        currentAngle: observation.angle,
        relativeAngularVelocity: observation.angularVelocity,
        proportionalGain: config.proportionalGain,
        derivativeGain: config.derivativeGain,
        maxMotorSpeed: config.maxMotorSpeed
      });
    }
  };
}

/** 進化なしの対照群や、重力だけで落とす検証に使う。 */
export function createZeroCommandSource(): JointCommandSource {
  return {
    motorSpeed(): number {
      return 0;
    }
  };
}
