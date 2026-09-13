declare module "phaser-box2d/dist/PhaserBox2D.js" {
  export interface b2WorldId {
    readonly index1: number;
    readonly revision: number;
  }

  export interface b2BodyId {
    readonly index1: number;
    readonly world0: number;
    readonly revision: number;
  }

  export interface b2ShapeId {
    readonly index1: number;
    readonly world0: number;
    readonly revision: number;
  }

  export interface b2JointId {
    readonly index1: number;
    readonly world0: number;
    readonly revision: number;
  }

  export class b2Vec2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }

  export interface b2Rot {
    c: number;
    s: number;
  }

  export interface b2WorldDef {
    gravity: b2Vec2;
    enableSleep: boolean;
    enableContinuous: boolean;
  }

  export interface b2BodyDef {
    type: number;
    position: b2Vec2;
    rotation: b2Rot;
    linearDamping: number;
    angularDamping: number;
    fixedRotation: boolean;
  }

  export interface CapsuleConfig {
    worldId: b2WorldId;
    bodyDef?: b2BodyDef;
    type?: number;
    position?: b2Vec2;
    width?: number;
    height?: number;
    density?: number;
    friction?: number;
    restitution?: number;
    fixedRotation?: boolean;
    linearDamping?: number;
  }

  export interface BodyCapsule {
    bodyId: b2BodyId;
    shapeId: b2ShapeId;
    object: unknown;
  }

  export interface RevoluteJointConfig {
    worldId: b2WorldId;
    bodyIdA: b2BodyId;
    bodyIdB: b2BodyId;
    anchorA?: b2Vec2;
    anchorB?: b2Vec2;
    lowerAngle?: number;
    upperAngle?: number;
    enableLimit?: boolean;
    enableMotor?: boolean;
    motorSpeed?: number;
    maxMotorTorque?: number;
    collideConnected?: boolean;
  }

  export const STATIC: number;
  export const DYNAMIC: number;

  export function b2CreateWorldArray(): void;
  export function b2DefaultWorldDef(): b2WorldDef;
  export function b2CreateWorld(definition: b2WorldDef): b2WorldId;
  export function b2DestroyWorld(worldId: b2WorldId): void;
  export function b2World_Step(
    worldId: b2WorldId,
    timeStep: number,
    subStepCount: number
  ): void;

  export function b2DefaultBodyDef(): b2BodyDef;
  export function b2MakeRot(angle: number): b2Rot;
  export function b2Body_GetPosition(bodyId: b2BodyId): b2Vec2;
  export function b2Body_GetRotation(bodyId: b2BodyId): b2Rot;
  export function b2Rot_GetAngle(rotation: b2Rot): number;

  export function CreateCapsule(config: CapsuleConfig): BodyCapsule;
  export function CreateRevoluteJoint(
    config: RevoluteJointConfig
  ): { jointId: b2JointId };
  export function b2RevoluteJoint_GetAngle(jointId: b2JointId): number;
  export function b2RevoluteJoint_EnableMotor(
    jointId: b2JointId,
    enabled: boolean
  ): void;
  export function b2RevoluteJoint_SetMotorSpeed(
    jointId: b2JointId,
    speed: number
  ): void;
}
