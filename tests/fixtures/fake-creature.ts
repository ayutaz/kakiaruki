import type {
  CreatureHandle,
  CreatureSnapshot,
  JointConfig,
  JointState
} from "../../src/simulation/ports/creature-port.ts";
import type { Vector2 } from "../../src/shared/vector2.ts";

export interface FakeCreatureOptions {
  readonly jointCount: number;
  /** 1 stepあたりのx方向の移動量。 */
  readonly advancePerStep: number;
  /** このstep数を超えると `hasFiniteState()` が false を返す。 */
  readonly finiteUntilStep: number;
  readonly motorTorque: number;
  readonly startX: number;
}

const DEFAULTS: FakeCreatureOptions = {
  jointCount: 2,
  advancePerStep: 0.01,
  finiteUntilStep: Number.POSITIVE_INFINITY,
  motorTorque: 3,
  startX: 0
};

/**
 * Box2Dを使わない `CreatureHandle`。物理そのものではなく、進行規則・停止条件・
 * 複数個体の扱いを検証するために使う。`advance()` をテスト側が呼んで物理stepを代行する。
 */
export class FakeCreature implements CreatureHandle {
  readonly boneCount = 1;
  readonly jointCount: number;
  readonly motorSpeeds: number[] = [];
  steps = 0;
  destroyed = false;
  #x: number;
  readonly #options: FakeCreatureOptions;

  constructor(options: Partial<FakeCreatureOptions> = {}) {
    this.#options = { ...DEFAULTS, ...options };
    this.jointCount = this.#options.jointCount;
    this.#x = this.#options.startX;
  }

  advance(): void {
    this.steps += 1;
    this.#x += this.#options.advancePerStep;
  }

  jointState(index: number): JointState {
    if (index < 0 || index >= this.jointCount) {
      throw new RangeError(`joint index ${index} is out of range`);
    }
    return {
      angle: 0.1 * index,
      angularVelocity: 0,
      motorTorque: this.#options.motorTorque
    };
  }

  jointConfig(): JointConfig {
    return {
      lowerAngle: -1,
      upperAngle: 1,
      maxMotorTorque: 10,
      limitEnabled: true,
      motorEnabled: true
    };
  }

  connectedBones(): readonly [number, number] {
    return [0, 0];
  }

  setMotorSpeed(index: number, speed: number): void {
    this.motorSpeeds[index] = speed;
  }

  centerOfMass(): Vector2 {
    return { x: this.#x, y: 0.3 };
  }

  snapshot(): CreatureSnapshot {
    return { bones: [], centerOfMass: this.centerOfMass() };
  }

  hasFiniteState(): boolean {
    return this.steps <= this.#options.finiteUntilStep;
  }

  maxDistanceFrom(point: Vector2): number {
    return Math.hypot(this.#x - point.x, 0.3 - point.y);
  }

  destroy(): void {
    this.destroyed = true;
  }
}
