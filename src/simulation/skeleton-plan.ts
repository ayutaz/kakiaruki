import type {
  CreatureEdge,
  ValidatedCreatureGraph
} from "../domain/creature/creature-graph.ts";
import {
  angleOf,
  distance,
  midpoint,
  subtract,
  wrapSignedRadians,
  type Vector2
} from "../shared/vector2.ts";

export interface JointSettings {
  readonly lowerAngle: number;
  readonly upperAngle: number;
  readonly maxMotorTorque: number;
  readonly enableLimit: boolean;
  readonly enableMotor: boolean;
}

export interface BodySettings {
  readonly density: number;
  readonly friction: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
}

export interface SkeletonSettings {
  readonly joint: JointSettings;
  readonly body: BodySettings;
}

export const DEFAULT_SKELETON_SETTINGS: SkeletonSettings = {
  joint: {
    lowerAngle: -0.9,
    upperAngle: 0.9,
    maxMotorTorque: 40,
    enableLimit: true,
    enableMotor: true
  },
  body: {
    density: 1,
    friction: 0.8,
    linearDamping: 0.02,
    angularDamping: 0.05
  }
};

export interface BonePlan {
  readonly edgeId: string;
  /** グラフ座標での骨の中心。 */
  readonly center: Vector2;
  /** nodeA -> nodeB のworld角。Bodyの回転角と一致し、骨のローカル+X軸がこの向きになる。 */
  readonly axisAngle: number;
  /** node間距離。カプセルの端点間の長さ。 */
  readonly length: number;
  readonly radius: number;
  readonly nodeA: string;
  readonly nodeB: string;
}

export interface JointPlan {
  readonly nodeId: string;
  readonly boneAIndex: number;
  readonly boneBIndex: number;
  /** boneAのローカル座標での接続点。 */
  readonly anchorA: Vector2;
  readonly anchorB: Vector2;
  /** 静止姿勢での相対角。これを基準にするため、曲がった骨格でも初期joint角度が0になる。 */
  readonly referenceAngle: number;
  readonly settings: JointSettings;
}

export interface SkeletonPlan {
  readonly bones: readonly BonePlan[];
  readonly joints: readonly JointPlan[];
  readonly body: BodySettings;
}

function localAnchor(bone: BonePlan, nodeId: string): Vector2 {
  const half = bone.length / 2;
  return { x: bone.nodeA === nodeId ? -half : half, y: 0 };
}

export function buildSkeletonPlan(
  graph: ValidatedCreatureGraph,
  settings: SkeletonSettings = DEFAULT_SKELETON_SETTINGS
): SkeletonPlan {
  const positions = new Map(graph.nodes.map((node) => [node.id, node.position]));
  const orderedEdges: CreatureEdge[] = [...graph.edges].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  );

  const bones: BonePlan[] = orderedEdges.map((edge) => {
    const a = positions.get(edge.nodeA);
    const b = positions.get(edge.nodeB);
    if (!a || !b) {
      throw new Error(`validated graph is missing a node for edge ${edge.id}`);
    }
    return {
      edgeId: edge.id,
      center: midpoint(a, b),
      axisAngle: angleOf(subtract(b, a)),
      length: distance(a, b),
      radius: edge.radius,
      nodeA: edge.nodeA,
      nodeB: edge.nodeB
    };
  });

  const boneIndexesByNode = new Map<string, number[]>();
  for (const [index, bone] of bones.entries()) {
    for (const nodeId of [bone.nodeA, bone.nodeB]) {
      const existing = boneIndexesByNode.get(nodeId);
      if (existing) {
        existing.push(index);
      } else {
        boneIndexesByNode.set(nodeId, [index]);
      }
    }
  }

  const joints: JointPlan[] = [];
  const orderedNodeIds = [...boneIndexesByNode.keys()].sort();
  for (const nodeId of orderedNodeIds) {
    const indexes = boneIndexesByNode.get(nodeId) ?? [];
    const [firstIndex, ...restIndexes] = indexes;
    if (firstIndex === undefined) {
      continue;
    }
    const boneA = bones[firstIndex];
    if (!boneA) {
      continue;
    }
    for (const otherIndex of restIndexes) {
      const boneB = bones[otherIndex];
      if (!boneB) {
        continue;
      }
      joints.push({
        nodeId,
        boneAIndex: firstIndex,
        boneBIndex: otherIndex,
        anchorA: localAnchor(boneA, nodeId),
        anchorB: localAnchor(boneB, nodeId),
        referenceAngle: wrapSignedRadians(boneB.axisAngle - boneA.axisAngle),
        settings: settings.joint
      });
    }
  }

  return { bones, joints, body: settings.body };
}

/** 骨格の水平方向の広がり（カプセル半径を含む）。レーン間隔の算出に使う。 */
export function skeletonWidth(plan: SkeletonPlan): number {
  if (plan.bones.length === 0) {
    return 0;
  }
  const bounds = plan.bones.flatMap((bone) => {
    const half = Math.abs(Math.cos(bone.axisAngle)) * (bone.length / 2) + bone.radius;
    return [bone.center.x - half, bone.center.x + half];
  });
  return Math.max(...bounds) - Math.min(...bounds);
}

/** 骨格の最下面が `clearance` だけ地面（y = 0）より上に来る平行移動量。 */
export function computeSpawnOffset(plan: SkeletonPlan, clearance: number): Vector2 {
  if (plan.bones.length === 0) {
    return { x: 0, y: clearance };
  }
  const lowest = Math.min(
    ...plan.bones.map(
      (bone) =>
        bone.center.y - Math.abs(Math.sin(bone.axisAngle)) * (bone.length / 2) - bone.radius
    )
  );
  return { x: 0, y: clearance - lowest };
}
