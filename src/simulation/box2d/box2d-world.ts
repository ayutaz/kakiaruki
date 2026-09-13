import {
  CreateBoxPolygon,
  STATIC,
  b2CreateWorld,
  b2CreateWorldArray,
  b2DefaultBodyDef,
  b2DefaultQueryFilter,
  b2DefaultWorldDef,
  b2DestroyWorld,
  b2Vec2,
  b2World_OverlapAABB,
  b2World_Step,
  type b2WorldId
} from "phaser-box2d/dist/PhaserBox2D.js";

import type { ShapeCountingWorld } from "../ports/world-port.ts";

/** 生物のBodyは地面としか衝突しない。個体間・自己の接触を構造的に排除する。 */
export const CREATURE_CATEGORY = 0x0001;
export const GROUND_CATEGORY = 0x0002;

const OVERLAP_BOUND = 1e6;
const ALL_BITS = 0xffffffff;

b2CreateWorldArray();

export interface PhysicsWorldOptions {
  readonly gravityY: number;
  readonly groundHalfWidth: number;
  readonly groundHalfHeight: number;
  readonly groundFriction: number;
  readonly enableSleep: boolean;
}

export const DEFAULT_PHYSICS_WORLD_OPTIONS: PhysicsWorldOptions = {
  gravityY: -10,
  groundHalfWidth: 200,
  groundHalfHeight: 0.5,
  groundFriction: 0.85,
  enableSleep: false
};

export interface PhysicsWorld extends ShapeCountingWorld {
  readonly worldId: b2WorldId;
  /** 地面の上面のy座標。骨格はこの高さを基準に配置する。 */
  readonly groundSurfaceY: number;
  step(stepSeconds: number, subSteps: number): void;
  /** Worldに残っているshape数。cleanup漏れの検出に使う。 */
  countShapes(): number;
  destroy(): void;
}

class Box2DPhysicsWorld implements PhysicsWorld {
  readonly worldId: b2WorldId;
  readonly groundSurfaceY = 0;
  #destroyed = false;

  constructor(worldId: b2WorldId) {
    this.worldId = worldId;
  }

  step(stepSeconds: number, subSteps: number): void {
    this.#assertAlive();
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      throw new RangeError("stepSeconds must be finite and greater than zero");
    }
    if (!Number.isInteger(subSteps) || subSteps < 1) {
      throw new RangeError("subSteps must be a positive integer");
    }
    b2World_Step(this.worldId, stepSeconds, subSteps);
  }

  countShapes(): number {
    this.#assertAlive();
    let count = 0;
    // 既定のquery filterは category 1 / mask 全ビットなので、生物shape（mask=地面のみ）に
    // 当たらない。cleanup検証では全shapeを数えたいので両方を全ビットにする。
    const filter = b2DefaultQueryFilter();
    filter.categoryBits = ALL_BITS;
    filter.maskBits = ALL_BITS;
    b2World_OverlapAABB(
      this.worldId,
      {
        lowerBound: new b2Vec2(-OVERLAP_BOUND, -OVERLAP_BOUND),
        upperBound: new b2Vec2(OVERLAP_BOUND, OVERLAP_BOUND)
      },
      filter,
      () => {
        count += 1;
        return true;
      },
      null
    );
    return count;
  }

  destroy(): void {
    if (!this.#destroyed) {
      b2DestroyWorld(this.worldId);
      this.#destroyed = true;
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error("physics world has been destroyed");
    }
  }
}

export function createPhysicsWorld(
  options: Partial<PhysicsWorldOptions> = {}
): PhysicsWorld {
  const resolved: PhysicsWorldOptions = { ...DEFAULT_PHYSICS_WORLD_OPTIONS, ...options };

  for (const [name, value] of Object.entries({
    gravityY: resolved.gravityY,
    groundHalfWidth: resolved.groundHalfWidth,
    groundHalfHeight: resolved.groundHalfHeight,
    groundFriction: resolved.groundFriction
  })) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must be finite`);
    }
  }
  if (resolved.groundHalfWidth <= 0 || resolved.groundHalfHeight <= 0) {
    throw new RangeError("ground half extents must be greater than zero");
  }

  const worldDefinition = b2DefaultWorldDef();
  worldDefinition.gravity = new b2Vec2(0, resolved.gravityY);
  worldDefinition.enableSleep = resolved.enableSleep;
  const worldId = b2CreateWorld(worldDefinition);
  if (worldId.index1 === 0) {
    throw new Error("Phaser Box2D did not allocate a world");
  }

  const groundDefinition = b2DefaultBodyDef();
  groundDefinition.type = STATIC;
  // 上面を y = 0 に合わせる。
  groundDefinition.position = new b2Vec2(0, -resolved.groundHalfHeight);
  CreateBoxPolygon({
    worldId,
    bodyDef: groundDefinition,
    size: new b2Vec2(resolved.groundHalfWidth, resolved.groundHalfHeight),
    density: 0,
    friction: resolved.groundFriction,
    categoryBits: GROUND_CATEGORY,
    maskBits: CREATURE_CATEGORY
  });

  return new Box2DPhysicsWorld(worldId);
}
