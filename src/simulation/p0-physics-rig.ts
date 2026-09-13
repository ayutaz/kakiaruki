import {
  CreateCapsule,
  CreateRevoluteJoint,
  DYNAMIC,
  STATIC,
  b2Body_GetPosition,
  b2Body_GetRotation,
  b2CreateWorld,
  b2CreateWorldArray,
  b2DefaultBodyDef,
  b2DefaultWorldDef,
  b2DestroyWorld,
  b2MakeRot,
  b2RevoluteJoint_GetAngle,
  b2RevoluteJoint_SetMotorSpeed,
  b2Rot_GetAngle,
  b2Vec2,
  b2World_Step,
  type b2BodyId,
  type b2JointId,
  type b2WorldId
} from "phaser-box2d/dist/PhaserBox2D.js";

const DEFAULT_STEP_SECONDS = 1 / 60;
const DEFAULT_SUB_STEPS = 2;

b2CreateWorldArray();

export interface P0PhysicsRigOptions {
  readonly enableMotor: boolean;
  readonly enableLimit: boolean;
  readonly motorSpeed: number;
  readonly lowerAngle?: number;
  readonly upperAngle?: number;
  readonly maxMotorTorque?: number;
  readonly stepSeconds?: number;
  readonly subSteps?: number;
}

export interface BodySnapshot {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  readonly radius: number;
  readonly dynamic: boolean;
}

export interface P0RigSnapshot {
  readonly bodies: readonly BodySnapshot[];
  readonly jointAngle: number;
}

export interface RunStepsResult {
  readonly steps: number;
  readonly maxAbsJointAngle: number;
  readonly allFinite: boolean;
}

export interface P0PhysicsRig {
  step(): void;
  runSteps(count: number): RunStepsResult;
  setMotorSpeed(speed: number): void;
  getJointAngle(): number;
  snapshot(): P0RigSnapshot;
  destroy(): void;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

export function createP0PhysicsRig(options: P0PhysicsRigOptions): P0PhysicsRig {
  const lowerAngle = options.lowerAngle ?? -0.35;
  const upperAngle = options.upperAngle ?? 0.35;
  const maxMotorTorque = options.maxMotorTorque ?? 100;
  const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const subSteps = options.subSteps ?? DEFAULT_SUB_STEPS;

  for (const [name, value] of Object.entries({
    motorSpeed: options.motorSpeed,
    lowerAngle,
    upperAngle,
    maxMotorTorque,
    stepSeconds
  })) {
    assertFinite(value, name);
  }
  if (lowerAngle >= upperAngle) {
    throw new RangeError("lowerAngle must be less than upperAngle");
  }
  if (!Number.isInteger(subSteps) || subSteps < 1) {
    throw new RangeError("subSteps must be a positive integer");
  }

  const worldDefinition = b2DefaultWorldDef();
  worldDefinition.gravity = new b2Vec2(0, 0);
  worldDefinition.enableSleep = false;
  const worldId = b2CreateWorld(worldDefinition);
  if (worldId.index1 === 0) {
    throw new Error("Phaser Box2D did not allocate a world");
  }

  const parentDefinition = b2DefaultBodyDef();
  parentDefinition.type = STATIC;
  parentDefinition.position = new b2Vec2(0, 1);
  parentDefinition.rotation = b2MakeRot(0);
  const parent = CreateCapsule({
    worldId,
    bodyDef: parentDefinition,
    width: 0.3,
    height: 2,
    density: 1,
    friction: 0.4
  });

  const childDefinition = b2DefaultBodyDef();
  childDefinition.type = DYNAMIC;
  childDefinition.position = new b2Vec2(0, -1);
  childDefinition.rotation = b2MakeRot(0);
  childDefinition.angularDamping = 0.05;
  const child = CreateCapsule({
    worldId,
    bodyDef: childDefinition,
    width: 0.3,
    height: 2,
    density: 1,
    friction: 0.4
  });

  const { jointId } = CreateRevoluteJoint({
    worldId,
    bodyIdA: parent.bodyId,
    bodyIdB: child.bodyId,
    anchorA: new b2Vec2(0, -1),
    anchorB: new b2Vec2(0, 1),
    lowerAngle,
    upperAngle,
    enableLimit: options.enableLimit,
    enableMotor: options.enableMotor,
    motorSpeed: options.motorSpeed,
    maxMotorTorque,
    collideConnected: false
  });

  return new PhaserBox2DP0Rig(
    worldId,
    [parent.bodyId, child.bodyId],
    jointId,
    stepSeconds,
    subSteps
  );
}

class PhaserBox2DP0Rig implements P0PhysicsRig {
  readonly #worldId: b2WorldId;
  readonly #bodyIds: readonly [b2BodyId, b2BodyId];
  readonly #jointId: b2JointId;
  readonly #stepSeconds: number;
  readonly #subSteps: number;
  #destroyed = false;

  constructor(
    worldId: b2WorldId,
    bodyIds: readonly [b2BodyId, b2BodyId],
    jointId: b2JointId,
    stepSeconds: number,
    subSteps: number
  ) {
    this.#worldId = worldId;
    this.#bodyIds = bodyIds;
    this.#jointId = jointId;
    this.#stepSeconds = stepSeconds;
    this.#subSteps = subSteps;
  }

  step(): void {
    this.#assertAlive();
    b2World_Step(this.#worldId, this.#stepSeconds, this.#subSteps);
  }

  runSteps(count: number): RunStepsResult {
    this.#assertAlive();
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError("count must be a non-negative integer");
    }

    let maxAbsJointAngle = 0;
    let allFinite = true;

    for (let index = 0; index < count; index += 1) {
      this.step();
      const snapshot = this.snapshot();
      maxAbsJointAngle = Math.max(maxAbsJointAngle, Math.abs(snapshot.jointAngle));
      allFinite &&=
        Number.isFinite(snapshot.jointAngle) &&
        snapshot.bodies.every((body) =>
          [body.x, body.y, body.angle].every(Number.isFinite)
        );
    }

    return { steps: count, maxAbsJointAngle, allFinite };
  }

  setMotorSpeed(speed: number): void {
    this.#assertAlive();
    assertFinite(speed, "speed");
    b2RevoluteJoint_SetMotorSpeed(this.#jointId, speed);
  }

  getJointAngle(): number {
    this.#assertAlive();
    return b2RevoluteJoint_GetAngle(this.#jointId);
  }

  snapshot(): P0RigSnapshot {
    this.#assertAlive();
    return {
      bodies: this.#bodyIds.map((bodyId, index) => {
        const position = b2Body_GetPosition(bodyId);
        const rotation = b2Body_GetRotation(bodyId);
        return {
          x: position.x,
          y: position.y,
          angle: b2Rot_GetAngle(rotation),
          length: 2,
          radius: 0.15,
          dynamic: index === 1
        };
      }),
      jointAngle: this.getJointAngle()
    };
  }

  destroy(): void {
    if (!this.#destroyed) {
      b2DestroyWorld(this.#worldId);
      this.#destroyed = true;
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error("P0 physics rig has been destroyed");
    }
  }
}
