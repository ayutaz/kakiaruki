import { describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import type {
  CreatureGraph,
  ValidatedCreatureGraph
} from "../../src/domain/creature/creature-graph.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth,
  DEFAULT_SKELETON_SETTINGS,
  type BonePlan,
  type JointPlan
} from "../../src/simulation/skeleton-plan.ts";
import { chain4, lShape5, yBranch5 } from "../fixtures/creature-graphs.ts";

function validated(graph: CreatureGraph): ValidatedCreatureGraph {
  const result = validateCreatureGraph(graph);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return result.graph;
}

function anchorInWorld(bone: BonePlan, anchor: { x: number; y: number }) {
  return {
    x: bone.center.x + Math.cos(bone.axisAngle) * anchor.x - Math.sin(bone.axisAngle) * anchor.y,
    y: bone.center.y + Math.sin(bone.axisAngle) * anchor.x + Math.cos(bone.axisAngle) * anchor.y
  };
}

describe("buildSkeletonPlan", () => {
  it("creates one bone per edge and one joint per extra edge at a shared node", () => {
    const plan = buildSkeletonPlan(validated(chain4));

    expect(plan.bones).toHaveLength(chain4.edges.length);
    expect(plan.joints).toHaveLength(chain4.edges.length - 1);
  });

  it("creates degree minus one joints at a branching node", () => {
    const plan = buildSkeletonPlan(validated(yBranch5));
    const branchJoints = plan.joints.filter((joint: JointPlan) => joint.nodeId === "c");

    expect(branchJoints).toHaveLength(2);
    expect(plan.joints).toHaveLength(yBranch5.edges.length - 1);
  });

  it("places each bone at the edge midpoint along the node-to-node axis", () => {
    const plan = buildSkeletonPlan(validated(chain4));
    const first = plan.bones[0];

    expect(first).toBeDefined();
    expect(first?.center.x).toBeCloseTo(0.4);
    expect(first?.center.y).toBeCloseTo(0);
    expect(first?.axisAngle).toBeCloseTo(0);
    expect(first?.length).toBeCloseTo(0.8);
    expect(first?.radius).toBeCloseTo(0.11);
  });

  it("anchors every joint on the shared node from both bones", () => {
    const plan = buildSkeletonPlan(validated(yBranch5));

    for (const joint of plan.joints) {
      const boneA = plan.bones[joint.boneAIndex];
      const boneB = plan.bones[joint.boneBIndex];
      expect(boneA).toBeDefined();
      expect(boneB).toBeDefined();
      const worldA = anchorInWorld(boneA!, joint.anchorA);
      const worldB = anchorInWorld(boneB!, joint.anchorB);

      expect(worldA.x).toBeCloseTo(worldB.x, 9);
      expect(worldA.y).toBeCloseTo(worldB.y, 9);
    }
  });

  it("uses the rest pose as the joint reference angle so bent skeletons start at zero", () => {
    const plan = buildSkeletonPlan(validated(lShape5));

    for (const joint of plan.joints) {
      const boneA = plan.bones[joint.boneAIndex]!;
      const boneB = plan.bones[joint.boneBIndex]!;
      expect(joint.referenceAngle).toBeCloseTo(boneB.axisAngle - boneA.axisAngle, 5);
    }
  });

  it("carries the joint settings onto every joint", () => {
    const plan = buildSkeletonPlan(validated(chain4));

    for (const joint of plan.joints) {
      expect(joint.settings).toEqual(DEFAULT_SKELETON_SETTINGS.joint);
    }
    expect(plan.body).toEqual(DEFAULT_SKELETON_SETTINGS.body);
  });

  it("is deterministic for the same graph regardless of edge declaration order", () => {
    const shuffled = validated({ ...chain4, edges: [...chain4.edges].reverse() });

    expect(buildSkeletonPlan(shuffled)).toEqual(buildSkeletonPlan(validated(chain4)));
  });
});

describe("computeSpawnOffset", () => {
  it("lifts the lowest capsule surface to the requested clearance above y = 0", () => {
    const plan = buildSkeletonPlan(validated(lShape5));
    const offset = computeSpawnOffset(plan, 0.05);
    const lowest = Math.min(
      ...plan.bones.map(
        (bone) =>
          bone.center.y +
          offset.y -
          Math.abs(Math.sin(bone.axisAngle)) * (bone.length / 2) -
          bone.radius
      )
    );

    expect(lowest).toBeCloseTo(0.05);
    expect(offset.x).toBeCloseTo(0);
  });
});

describe("skeletonWidth", () => {
  it("measures the horizontal extent including the capsule radius", () => {
    const plan = buildSkeletonPlan(validated(chain4));

    // 4本×0.8m = 3.2m の骨の両端に半径0.11mずつ。
    expect(skeletonWidth(plan)).toBeCloseTo(3.2 + 0.22, 6);
  });

  it("accounts for bones that are not axis aligned", () => {
    const plan = buildSkeletonPlan(validated(lShape5));

    expect(skeletonWidth(plan)).toBeCloseTo(2.4 + 0.22, 6);
  });
});
