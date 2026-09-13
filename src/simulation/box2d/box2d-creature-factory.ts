import {
  CreateCapsule,
  CreateRevoluteJoint,
  DYNAMIC,
  b2Body_GetAngularVelocity,
  b2Body_GetLinearVelocity,
  b2Body_GetMass,
  b2Body_GetPosition,
  b2Body_GetRotation,
  b2Body_GetWorldCenterOfMass,
  b2DefaultBodyDef,
  b2DefaultRevoluteJointDef,
  b2DestroyBody,
  b2DestroyJoint,
  b2MakeRot,
  b2RevoluteJoint_GetAngle,
  b2RevoluteJoint_GetLowerLimit,
  b2RevoluteJoint_GetMaxMotorTorque,
  b2RevoluteJoint_GetMotorTorque,
  b2RevoluteJoint_GetUpperLimit,
  b2RevoluteJoint_IsLimitEnabled,
  b2RevoluteJoint_IsMotorEnabled,
  b2RevoluteJoint_SetMotorSpeed,
  b2Rot_GetAngle,
  b2Vec2,
  type b2BodyId,
  type b2JointId
} from "phaser-box2d/dist/PhaserBox2D.js";

import type { Vector2 } from "../../shared/vector2.ts";
import type { BonePlan, SkeletonPlan } from "../skeleton-plan.ts";

import {
  CREATURE_CATEGORY,
  GROUND_CATEGORY,
  type PhysicsWorld
} from "./box2d-world.ts";

export interface BoneSnapshot {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  readonly radius: number;
}

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

const DEFAULT_SPAWN_OPTIONS: CreatureSpawnOptions = {
  origin: { x: 0, y: 0 },
  groupIndex: 0
};

interface JointEntry {
  readonly jointId: b2JointId;
  readonly boneAIndex: number;
  readonly boneBIndex: number;
}

class Box2DCreature implements CreatureHandle {
  readonly #bodyIds: readonly b2BodyId[];
  readonly #bones: readonly BonePlan[];
  readonly #joints: readonly JointEntry[];
  #destroyed = false;

  constructor(
    bodyIds: readonly b2BodyId[],
    bones: readonly BonePlan[],
    joints: readonly JointEntry[]
  ) {
    this.#bodyIds = bodyIds;
    this.#bones = bones;
    this.#joints = joints;
  }

  get boneCount(): number {
    return this.#bodyIds.length;
  }

  get jointCount(): number {
    return this.#joints.length;
  }

  jointState(index: number): JointState {
    const joint = this.#joint(index);
    const bodyA = this.#bodyIds[joint.boneAIndex]!;
    const bodyB = this.#bodyIds[joint.boneBIndex]!;
    return {
      angle: b2RevoluteJoint_GetAngle(joint.jointId),
      angularVelocity:
        b2Body_GetAngularVelocity(bodyB) - b2Body_GetAngularVelocity(bodyA),
      motorTorque: b2RevoluteJoint_GetMotorTorque(joint.jointId)
    };
  }

  jointConfig(index: number): JointConfig {
    const joint = this.#joint(index);
    return {
      lowerAngle: b2RevoluteJoint_GetLowerLimit(joint.jointId),
      upperAngle: b2RevoluteJoint_GetUpperLimit(joint.jointId),
      maxMotorTorque: b2RevoluteJoint_GetMaxMotorTorque(joint.jointId),
      limitEnabled: b2RevoluteJoint_IsLimitEnabled(joint.jointId),
      motorEnabled: b2RevoluteJoint_IsMotorEnabled(joint.jointId)
    };
  }

  connectedBones(index: number): readonly [number, number] {
    const joint = this.#joint(index);
    return [joint.boneAIndex, joint.boneBIndex];
  }

  setMotorSpeed(index: number, speed: number): void {
    const joint = this.#joint(index);
    if (!Number.isFinite(speed)) {
      throw new RangeError("motor speed must be finite");
    }
    b2RevoluteJoint_SetMotorSpeed(joint.jointId, speed);
  }

  centerOfMass(): Vector2 {
    this.#assertAlive();
    let totalMass = 0;
    let x = 0;
    let y = 0;
    for (const bodyId of this.#bodyIds) {
      const mass = b2Body_GetMass(bodyId);
      const center = b2Body_GetWorldCenterOfMass(bodyId);
      totalMass += mass;
      x += center.x * mass;
      y += center.y * mass;
    }
    if (totalMass === 0) {
      return { x: 0, y: 0 };
    }
    return { x: x / totalMass, y: y / totalMass };
  }

  snapshot(): CreatureSnapshot {
    this.#assertAlive();
    const bones = this.#bodyIds.map((bodyId, index) => {
      const position = b2Body_GetPosition(bodyId);
      const plan = this.#bones[index]!;
      return {
        x: position.x,
        y: position.y,
        angle: b2Rot_GetAngle(b2Body_GetRotation(bodyId)),
        length: plan.length,
        radius: plan.radius
      };
    });
    return { bones, centerOfMass: this.centerOfMass() };
  }

  hasFiniteState(): boolean {
    this.#assertAlive();
    for (const bodyId of this.#bodyIds) {
      const position = b2Body_GetPosition(bodyId);
      const velocity = b2Body_GetLinearVelocity(bodyId);
      const values = [
        position.x,
        position.y,
        b2Rot_GetAngle(b2Body_GetRotation(bodyId)),
        velocity.x,
        velocity.y,
        b2Body_GetAngularVelocity(bodyId)
      ];
      if (!values.every(Number.isFinite)) {
        return false;
      }
    }
    return this.#joints.every((joint) =>
      Number.isFinite(b2RevoluteJoint_GetAngle(joint.jointId))
    );
  }

  maxAbsCoordinate(): number {
    this.#assertAlive();
    let maximum = 0;
    for (const bodyId of this.#bodyIds) {
      const position = b2Body_GetPosition(bodyId);
      maximum = Math.max(maximum, Math.abs(position.x), Math.abs(position.y));
    }
    return maximum;
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    // Jointを先に、Bodyを後に破棄する（docs/06 §6）。
    for (const joint of this.#joints) {
      b2DestroyJoint(joint.jointId);
    }
    for (const bodyId of this.#bodyIds) {
      b2DestroyBody(bodyId);
    }
    this.#destroyed = true;
  }

  #joint(index: number): JointEntry {
    this.#assertAlive();
    const joint = this.#joints[index];
    if (!joint) {
      throw new RangeError(
        `joint index ${index} is out of range (0..${this.#joints.length - 1})`
      );
    }
    return joint;
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error("creature has been destroyed");
    }
  }
}

export function createCreature(
  world: PhysicsWorld,
  plan: SkeletonPlan,
  options: Partial<CreatureSpawnOptions> = {}
): CreatureHandle {
  const resolved: CreatureSpawnOptions = { ...DEFAULT_SPAWN_OPTIONS, ...options };
  if (!Number.isFinite(resolved.origin.x) || !Number.isFinite(resolved.origin.y)) {
    throw new RangeError("spawn origin must be finite");
  }
  if (plan.bones.length === 0) {
    throw new RangeError("skeleton plan must contain at least one bone");
  }

  const bodyIds = plan.bones.map((bone) => {
    const bodyDefinition = b2DefaultBodyDef();
    bodyDefinition.type = DYNAMIC;
    bodyDefinition.position = new b2Vec2(
      bone.center.x + resolved.origin.x,
      bone.center.y + resolved.origin.y
    );
    bodyDefinition.rotation = b2MakeRot(bone.axisAngle);
    bodyDefinition.linearDamping = plan.body.linearDamping;
    bodyDefinition.angularDamping = plan.body.angularDamping;

    const half = bone.length / 2;
    const capsule = CreateCapsule({
      worldId: world.worldId,
      bodyDef: bodyDefinition,
      center1: new b2Vec2(-half, 0),
      center2: new b2Vec2(half, 0),
      radius: bone.radius,
      density: plan.body.density,
      friction: plan.body.friction,
      categoryBits: CREATURE_CATEGORY,
      maskBits: GROUND_CATEGORY,
      groupIndex: resolved.groupIndex
    });
    return capsule.bodyId;
  });

  const joints: JointEntry[] = plan.joints.map((joint) => {
    const definition = b2DefaultRevoluteJointDef();
    definition.referenceAngle = joint.referenceAngle;
    const { jointId } = CreateRevoluteJoint({
      worldId: world.worldId,
      jointDef: definition,
      bodyIdA: bodyIds[joint.boneAIndex]!,
      bodyIdB: bodyIds[joint.boneBIndex]!,
      anchorA: new b2Vec2(joint.anchorA.x, joint.anchorA.y),
      anchorB: new b2Vec2(joint.anchorB.x, joint.anchorB.y),
      lowerAngle: joint.settings.lowerAngle,
      upperAngle: joint.settings.upperAngle,
      enableLimit: joint.settings.enableLimit,
      enableMotor: joint.settings.enableMotor,
      motorSpeed: 0,
      maxMotorTorque: joint.settings.maxMotorTorque,
      collideConnected: false
    });
    return { jointId, boneAIndex: joint.boneAIndex, boneBIndex: joint.boneBIndex };
  });

  return new Box2DCreature(bodyIds, plan.bones, joints);
}
