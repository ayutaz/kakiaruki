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
    center1?: b2Vec2;
    center2?: b2Vec2;
    radius?: number;
    density?: number;
    friction?: number;
    restitution?: number;
    fixedRotation?: boolean;
    linearDamping?: number;
    categoryBits?: number;
    maskBits?: number;
    groupIndex?: number;
  }

  export interface BodyCapsule {
    bodyId: b2BodyId;
    shapeId: b2ShapeId;
    object: unknown;
  }

  export interface RevoluteJointConfig {
    worldId: b2WorldId;
    jointDef?: b2RevoluteJointDef;
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

  export interface b2AABB {
    lowerBound: b2Vec2;
    upperBound: b2Vec2;
  }

  export interface b2QueryFilter {
    categoryBits: number;
    maskBits: number;
  }

  export interface b2Filter {
    categoryBits: number;
    maskBits: number;
    groupIndex: number;
  }

  export interface b2ShapeDef {
    density: number;
    friction: number;
    restitution: number;
    filter: b2Filter;
    enableContactEvents: boolean;
    isSensor: boolean;
  }

  export interface BoxPolygonConfig {
    worldId: b2WorldId;
    bodyDef?: b2BodyDef;
    type?: number;
    position?: b2Vec2;
    size: number | b2Vec2;
    density?: number;
    friction?: number;
    restitution?: number;
    categoryBits?: number;
    maskBits?: number;
    groupIndex?: number;
  }

  export interface BodyPolygon {
    bodyId: b2BodyId;
    shapeId: b2ShapeId;
    object: unknown;
  }

  export interface b2RevoluteJointDef {
    bodyIdA: b2BodyId;
    bodyIdB: b2BodyId;
    localAnchorA: b2Vec2;
    localAnchorB: b2Vec2;
    referenceAngle: number;
    enableLimit: boolean;
    lowerAngle: number;
    upperAngle: number;
    enableMotor: boolean;
    maxMotorTorque: number;
    motorSpeed: number;
    collideConnected: boolean;
  }

  export function b2DefaultShapeDef(): b2ShapeDef;
  export function b2DefaultFilter(): b2Filter;
  export function b2DefaultQueryFilter(): b2QueryFilter;
  export function b2DefaultRevoluteJointDef(): b2RevoluteJointDef;

  export function CreateBoxPolygon(config: BoxPolygonConfig): BodyPolygon;

  export function b2World_OverlapAABB(
    worldId: b2WorldId,
    aabb: b2AABB,
    filter: b2QueryFilter,
    callback: (shapeId: b2ShapeId, context: unknown) => boolean,
    context: unknown
  ): void;
  export function b2World_IsValid(worldId: b2WorldId): boolean;

  export function b2DestroyBody(bodyId: b2BodyId): void;
  export function b2DestroyJoint(jointId: b2JointId): void;
  export function b2Body_IsValid(bodyId: b2BodyId): boolean;
  export function b2Joint_IsValid(jointId: b2JointId): boolean;
  export function b2Body_GetMass(bodyId: b2BodyId): number;
  export function b2Body_GetWorldCenterOfMass(bodyId: b2BodyId): b2Vec2;
  export function b2Body_GetLinearVelocity(bodyId: b2BodyId): b2Vec2;
  export function b2Body_GetAngularVelocity(bodyId: b2BodyId): number;

  export function b2RevoluteJoint_GetLowerLimit(jointId: b2JointId): number;
  export function b2RevoluteJoint_GetUpperLimit(jointId: b2JointId): number;
  export function b2RevoluteJoint_IsLimitEnabled(jointId: b2JointId): boolean;
  export function b2RevoluteJoint_IsMotorEnabled(jointId: b2JointId): boolean;
  export function b2RevoluteJoint_GetMaxMotorTorque(jointId: b2JointId): number;
  export function b2RevoluteJoint_GetMotorTorque(jointId: b2JointId): number;

  export interface b2ContactBeginTouchEvent {
    shapeIdA: b2ShapeId;
    shapeIdB: b2ShapeId;
  }

  export interface b2ContactEvents {
    beginEvents: readonly b2ContactBeginTouchEvent[];
    beginCount: number;
    endCount: number;
    hitCount: number;
  }

  export function b2World_GetContactEvents(worldId: b2WorldId): b2ContactEvents;
  export function b2Shape_GetFilter(shapeId: b2ShapeId): b2Filter;
  export function b2Shape_EnableContactEvents(shapeId: b2ShapeId, enabled: boolean): void;
}
