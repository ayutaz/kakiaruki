import {
  CreateBoxPolygon,
  STATIC,
  b2CreateWorld,
  b2CreateWorldArray,
  b2DefaultBodyDef,
  b2DefaultQueryFilter,
  b2DefaultWorldDef,
  b2DestroyWorld,
  b2Shape_GetFilter,
  b2World_GetContactEvents,
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
  // Population 32 をレーンへ並べると、最大骨格（1.2 m × 10本）で端が ±378 m になる。
  // そこから `maxDisplacement` 200 m まで進んでも地面が続くよう、余裕を持たせる。
  // 地面が足りないと外側の個体が落下し、前進量0のまま completed として世代へ混ざる。
  groundHalfWidth: 1000,
  groundHalfHeight: 0.5,
  groundFriction: 0.85,
  enableSleep: false
};

export interface ContactSummary {
  readonly beginCount: number;
  /** 個体同士（または同一個体の別の骨同士）が触れた回数。設計上は常に0。 */
  readonly creatureToCreatureCount: number;
  readonly creatureToGroundCount: number;
}

export interface PhysicsWorld extends ShapeCountingWorld {
  readonly worldId: b2WorldId;
  /** 直前のstepで発生したbegin contactを分類して返す。同じstepで2回目以降は0件。 */
  drainContactEvents(): ContactSummary;
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
  #stepIndex = 0;
  #drainedStepIndex = -1;

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
    this.#stepIndex += 1;
  }

  drainContactEvents(): ContactSummary {
    this.#assertAlive();
    const empty = {
      beginCount: 0,
      creatureToCreatureCount: 0,
      creatureToGroundCount: 0
    };
    if (this.#drainedStepIndex === this.#stepIndex) {
      return empty;
    }
    this.#drainedStepIndex = this.#stepIndex;

    const events = b2World_GetContactEvents(this.worldId);
    let creatureToCreatureCount = 0;
    let creatureToGroundCount = 0;
    for (const event of events.beginEvents ?? []) {
      const categoryA = b2Shape_GetFilter(event.shapeIdA).categoryBits;
      const categoryB = b2Shape_GetFilter(event.shapeIdB).categoryBits;
      const creatureCount =
        (categoryA === CREATURE_CATEGORY ? 1 : 0) + (categoryB === CREATURE_CATEGORY ? 1 : 0);
      if (creatureCount === 2) {
        creatureToCreatureCount += 1;
      } else if (creatureCount === 1) {
        creatureToGroundCount += 1;
      }
    }
    return {
      beginCount: events.beginCount ?? 0,
      creatureToCreatureCount,
      creatureToGroundCount
    };
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
