import type { CreatureGraph } from "../../src/domain/creature/creature-graph.ts";

const RADIUS = 0.11;

function chainGraph(
  id: string,
  points: readonly (readonly [number, number])[]
): CreatureGraph {
  const nodes = points.map(([x, y], index) => ({
    id: `${id}-n${index}`,
    position: { x, y }
  }));
  const edges = points.slice(1).map((_point, index) => ({
    id: `${id}-e${index}`,
    nodeA: `${id}-n${index}`,
    nodeB: `${id}-n${index + 1}`,
    radius: RADIUS
  }));
  return { nodes, edges, rootNodeId: `${id}-n0` };
}

/** 4ボーンの直線。骨長0.8m、水平。 */
export const chain4: CreatureGraph = chainGraph("chain4", [
  [0, 0],
  [0.8, 0],
  [1.6, 0],
  [2.4, 0],
  [3.2, 0]
]);

/** 5ボーンのL字。途中で90度曲がるため、静止姿勢での関節角度が0にならない検証に使う。 */
export const lShape5: CreatureGraph = chainGraph("lShape5", [
  [0, 0],
  [0.8, 0],
  [1.6, 0],
  [2.4, 0],
  [2.4, 0.8],
  [2.4, 1.6]
]);

/** 6ボーンのジグザグ。骨長0.781m。 */
export const zigzag6: CreatureGraph = chainGraph("zigzag6", [
  [0, 0],
  [0.6, 0.5],
  [1.2, 0],
  [1.8, 0.5],
  [2.4, 0],
  [3, 0.5],
  [3.6, 0]
]);

/** 5ボーンのY字。node "c" の次数が3で、1 nodeから2 jointが生まれる検証に使う。 */
export const yBranch5: CreatureGraph = {
  rootNodeId: "a0",
  nodes: [
    { id: "a0", position: { x: 0, y: 0 } },
    { id: "a1", position: { x: 0.8, y: 0 } },
    { id: "c", position: { x: 1.6, y: 0 } },
    { id: "up1", position: { x: 2.2, y: 0.6 } },
    { id: "up2", position: { x: 2.8, y: 1.2 } },
    { id: "down1", position: { x: 2.2, y: -0.6 } }
  ],
  edges: [
    { id: "y-e0", nodeA: "a0", nodeB: "a1", radius: RADIUS },
    { id: "y-e1", nodeA: "a1", nodeB: "c", radius: RADIUS },
    { id: "y-e2", nodeA: "c", nodeB: "up1", radius: RADIUS },
    { id: "y-e3", nodeA: "up1", nodeB: "up2", radius: RADIUS },
    { id: "y-e4", nodeA: "c", nodeB: "down1", radius: RADIUS }
  ]
};

export const validFixtures: readonly { name: string; graph: CreatureGraph }[] = [
  { name: "chain4", graph: chain4 },
  { name: "lShape5", graph: lShape5 },
  { name: "zigzag6", graph: zigzag6 },
  { name: "yBranch5", graph: yBranch5 }
];
