import { afterEach, describe, expect, it } from "vitest";

import { runEvolution } from "../../src/app/evolution-run.ts";
import { ObservationSession } from "../../src/app/observation-session.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../../src/domain/evolution/evolution-engine.ts";
import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { createRandomGenome } from "../../src/domain/evolution/genome.ts";
import { createSeededRandom } from "../../src/domain/evolution/seeded-random.ts";
import { buildSkeletonPlan } from "../../src/simulation/skeleton-plan.ts";
import { zigzag6 } from "../fixtures/creature-graphs.ts";

const sessions: ObservationSession[] = [];

function makeSession(): ObservationSession {
  const session = new ObservationSession();
  sessions.push(session);
  return session;
}

function genomes(count: number) {
  const validated = validateCreatureGraph(zigzag6);
  if (!validated.ok) {
    throw new Error("fixture is invalid");
  }
  const jointCount = buildSkeletonPlan(validated.graph).joints.length;
  const random = createSeededRandom(11);
  return Array.from({ length: count }, () => createRandomGenome(random, jointCount));
}

afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.dispose();
  }
});

describe("observation session", () => {
  it("reuses one world across many observations", () => {
    const session = makeSession();

    for (let index = 0; index < 40; index += 1) {
      session.start(zigzag6, genomes(2), { episodeSeconds: 1 });
    }

    expect(session.shapeCount()).toBe(1 + 2 * zigzag6.edges.length);
  });

  it("returns the world to the ground after the observation stops", () => {
    const session = makeSession();
    session.start(zigzag6, genomes(3), { episodeSeconds: 1 });

    session.stop();

    expect(session.shapeCount()).toBe(1);
  });

  it("advances more physics steps at x8 than at x1 for the same wall time", () => {
    const slow = makeSession();
    const fast = makeSession();
    slow.start(zigzag6, genomes(1), { episodeSeconds: 6 });
    fast.start(zigzag6, genomes(1), { episodeSeconds: 6 });

    slow.advance(0.1, 1);
    fast.advance(0.1, 8);

    expect(fast.stepCount).toBeGreaterThan(slow.stepCount);
    // 壁時計を8倍して固定stepへ割るため、丸めで1 stepずれることがある。
    expect(Math.abs(fast.stepCount - slow.stepCount * 8)).toBeLessThanOrEqual(1);
  });

  it("does not burn a long background pause in one frame", () => {
    const session = makeSession();
    session.start(zigzag6, genomes(1), { episodeSeconds: 60 });

    // 背景タブから30秒ぶりに戻ってきた状況。1フレームで30秒ぶん（1800 step）を
    // 一気に回すと画面が固まる。受入条件として「2.5秒ぶん = 150 step まで」を
    // 測定前に固定する。
    session.advance(30, 1);

    expect(session.stepCount).toBeGreaterThan(0);
    expect(session.stepCount).toBeLessThanOrEqual(150);
  });

  it("reaches the same episode result whatever the speed was", () => {
    const slow = makeSession();
    const fast = makeSession();
    slow.start(zigzag6, genomes(1), { episodeSeconds: 2 });
    fast.start(zigzag6, genomes(1), { episodeSeconds: 2 });

    while (!slow.finished) {
      slow.advance(1 / 60, 1);
    }
    while (!fast.finished) {
      fast.advance(1 / 60, 8);
    }

    expect(fast.stepCount).toBe(slow.stepCount);
    expect(fast.results()[0]!.endCenterOfMass.x).toBeCloseTo(
      slow.results()[0]!.endCenterOfMass.x,
      9
    );
  });

  it("shares its world with the learning runs of the same screen", () => {
    // 画面を開いたまま何度も学習し直しても、Worldを作り足さない（D-006）。
    // phaser-box2d は破棄したworld slotを再利用しないため、作り足すと32回で
    // 確保に失敗し、ページが二度と動かなくなる。
    const session = makeSession();

    for (let index = 0; index < 40; index += 1) {
      runEvolution({
        graph: zigzag6,
        seed: 1,
        generations: 1,
        evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: 4, eliteCount: 1 },
        episode: { durationSeconds: 0.2 },
        createdAt: "2026-09-14T00:00:00.000Z",
        world: session.physicsWorld
      });
    }

    expect(session.shapeCount()).toBe(1);
  });

  it("keeps the running observation when a new one cannot start", () => {
    // 壊れた形を渡されても、いま見ている観察を壊さない。
    // 画面は理由を出して、そのまま操作を続けられる必要がある。
    const session = makeSession();
    session.start(zigzag6, genomes(2), { episodeSeconds: 1 });
    const before = session.snapshots(2);

    const broken = { nodes: [], edges: [], rootNodeId: "missing" };
    expect(() => session.start(broken, genomes(1), { episodeSeconds: 1 })).toThrow(/invalid/);

    expect(session.populationSize).toBe(2);
    expect(session.snapshots(2)).toHaveLength(2);
    expect(session.snapshots(2)[0]!.centerOfMass.x).toBeCloseTo(before[0]!.centerOfMass.x, 9);
    expect(() => session.advance(1 / 60, 1)).not.toThrow();
  });

  it("can start again after a failed start", () => {
    const session = makeSession();

    expect(() => session.start(zigzag6, [], { episodeSeconds: 1 })).toThrow(/genome/);
    session.start(zigzag6, genomes(1), { episodeSeconds: 1 });

    expect(session.populationSize).toBe(1);
    expect(session.shapeCount()).toBe(1 + zigzag6.edges.length);
  });

  it("shows only the individuals the screen asks for", () => {
    const session = makeSession();
    session.start(zigzag6, genomes(4), { episodeSeconds: 1 });

    expect(session.snapshots(2)).toHaveLength(2);
    expect(session.snapshots(9)).toHaveLength(4);
  });
});
