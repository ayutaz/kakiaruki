import type { Vector2 } from "../../shared/vector2.ts";

export interface BoneSnapshot {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  readonly radius: number;
}

/** 描画用。評価に使う内部状態とは分けて渡す（docs/06 §1）。 */
export interface CreatureSnapshot {
  readonly bones: readonly BoneSnapshot[];
  readonly centerOfMass: Vector2;
}

export interface JointState {
  readonly angle: number;
  readonly angularVelocity: number;
  readonly motorTorque: number;
}

export interface JointConfig {
  readonly lowerAngle: number;
  readonly upperAngle: number;
  readonly maxMotorTorque: number;
  readonly limitEnabled: boolean;
  readonly motorEnabled: boolean;
}

/**
 * 1個体の物理表現に対する境界。実装はBox2D adapterだが、この型自体はBox2D固有IDを
 * 一切含まないため、EpisodeRunnerや評価側は物理実装へ直接依存しない。
 */
export interface CreatureHandle {
  readonly boneCount: number;
  readonly jointCount: number;
  jointState(index: number): JointState;
  jointConfig(index: number): JointConfig;
  connectedBones(index: number): readonly [number, number];
  setMotorSpeed(index: number, speed: number): void;
  centerOfMass(): Vector2;
  snapshot(): CreatureSnapshot;
  hasFiniteState(): boolean;
  maxAbsCoordinate(): number;
  destroy(): void;
}

export interface CreatureSpawnOptions {
  readonly origin: Vector2;
  /** M2のレーン分離で使う。0は「グループ指定なし」。 */
  readonly groupIndex: number;
}
