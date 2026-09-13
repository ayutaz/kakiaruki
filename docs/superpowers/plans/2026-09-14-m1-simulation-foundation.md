# M1 Simulation基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` を使い、タスクごとに Red → 失敗理由確認 → Green → refactor → 配線切断証明 → commit を行います。Steps はチェックボックス (`- [ ]`) 形式です。
> 各タスクには **失敗テストの完全なコード**と**公開インターフェースの完全な型定義**を書いています。実装本体はアルゴリズム仕様として記述し、テストをGreenにする最小実装を各自書きます。

**Goal:** Phaser Scene に依存せず、4〜6ボーンの `CreatureGraph` から1個体を生成し、地面上で1 episode を固定step実行し、結果を記録して完全に cleanup できる simulation 基盤を作る。

**Architecture:** `CreatureGraph`（純粋domain）→ `SkeletonPlan`（純粋、Body/Jointの幾何記述）→ Box2D adapter（`PhysicsWorld` / `CreatureHandle`）→ `EpisodeRunner`（固定step、metrics、invalid検出）。Box2D固有IDは `src/simulation/box2d/` の外へ出ない。関節指令は `JointCommandSource` port 経由で注入し、M3のGenomeが差し替えられる接続点にする。

**Tech Stack:** TypeScript 7 (strict), Vitest 5 (node environment), Phaser Box2D 1.1.0 (`dist/PhaserBox2D.js` のみ)

**Spec:** `docs/12-development-plan.md` §5（M1受入条件）、`docs/06-architecture.md`、`docs/13-milestone-quality-and-decision-gates.md`

## Global Constraints

`docs/superpowers/plans/2026-09-14-m1-to-m4-roadmap.md` の Global Constraints をすべて含みます。特にM1で効くもの:

- `src/domain/` は Phaser も Box2D も import しない。
- Box2D import は `phaser-box2d/dist/PhaserBox2D.js` のみ。使う API は `src/phaser-box2d.d.ts` に宣言を追記する。
- 相対 import には `.ts` 拡張子を付ける。
- 不正Graphは例外を投げず、理由付き validation error を返す。
- 受入条件の数値（10,000 steps / 100 cycles / 許容誤差）は測定前に固定し、後から緩めない。

## 受入条件（docs/12 §5）とタスクの対応

| 受入条件 | 担当タスク |
|---|---|
| Red → Green → Refactor の順序で試験を作成する | 全タスク |
| 不正Graphは例外で全体を壊さず、理由付き validation error になる | Task 2 |
| fixtureに対してBody数、Joint数、接続先、limit、motor設定が一致する | Task 4, Task 6 |
| 同一fixtureと同一設定の再実行結果が数値許容誤差内で一致する | Task 8 |
| 10,000 fixed steps で座標・角度・速度・fitness入力値が有限値を保つ | Task 8 |
| 100回の生成・終了・cleanup後にBody/Joint数が基準値へ戻る | Task 8 |
| Phaserを起動せずに contract / integration test を実行できる | 全タスク（vitest node環境） |
| `npm run verify` が成功し、M1検証記録をdocsへ追加する | Task 10 |

## File Structure

```text
src/
  shared/
    vector2.ts                      新規: Vector2型と純粋なベクトル演算
  domain/
    creature/
      creature-graph.ts             新規: CreatureGraph/Node/Edge型、GraphLimits
      creature-graph-validation.ts  新規: validateCreatureGraph と error code
      graph-hash.ts                 新規: 正規化順序に依存しない安定hash
    control/
      joint-controller.ts           移動: src/simulation/joint-controller.ts から
      joint-command-source.ts       新規: JointCommandSource port と sine実装
    run/
      run-record.ts                 新規: RunRecord schema と serialize/parse
  simulation/
    skeleton-plan.ts                新規: Graph -> Bone/Joint幾何記述（純粋）
    episode-runner.ts               新規: episode lifecycle と metrics
    fixed-step-runner.ts            既存: 変更なし
    p0-physics-rig.ts               既存: P0デモ専用。M1では触らない
    box2d/
      box2d-world.ts                新規: World/地面の生成・破棄・shape計測
      box2d-creature-factory.ts     新規: SkeletonPlan -> Body/Joint、CreatureHandle
  phaser-box2d.d.ts                 変更: M1で使うBox2D APIの宣言を追加

tests/
  fixtures/
    creature-graphs.ts              新規: chain4 / lShape5 / zigzag6 / 不正graph群
  unit/
    fixed-step-runner.test.ts       移動
    joint-controller.test.ts        移動
    p0-control-state.test.ts        移動
    creature-graph-validation.test.ts  新規
    graph-hash.test.ts              新規
    skeleton-plan.test.ts           新規
    joint-command-source.test.ts    新規
    run-record.test.ts              新規
  contract/
    p0-physics-rig.test.ts          移動
    box2d-world.test.ts             新規
    box2d-creature-factory.test.ts  新規
  integration/
    episode-runner.test.ts          新規
    episode-lifecycle.test.ts       新規: 10,000 step / 100 cleanup / 決定性
```

---

### Task 1: テスト構成の再編と Vector2

**Files:**
- Create: `src/shared/vector2.ts`
- Create: `tests/unit/vector2.test.ts`
- Move: `tests/*.test.ts` → `tests/unit/` と `tests/contract/`

**Interfaces:**
- Produces: `Vector2 { readonly x: number; readonly y: number }`, `vec(x,y)`, `add(a,b)`, `subtract(a,b)`, `scale(a,k)`, `length(a)`, `distance(a,b)`, `angleOf(a)`, `wrapSignedRadians(angle)`, `isFiniteVector(a)`

- [ ] **Step 1: 既存テストを層別ディレクトリへ移動し、import を1階層深くする**

```bash
mkdir -p tests/unit tests/contract tests/integration tests/fixtures
git mv tests/fixed-step-runner.test.ts tests/unit/
git mv tests/joint-controller.test.ts tests/unit/
git mv tests/p0-control-state.test.ts tests/unit/
git mv tests/p0-physics-rig.test.ts tests/contract/
sed -i '' 's#"\.\./src/#"../../src/#' tests/unit/*.test.ts tests/contract/*.test.ts
npm run test
```

Expected: 4 files / 8 tests PASS（移動だけで挙動は変わらない）

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/vector2.test.ts
import { describe, expect, it } from "vitest";

import {
  angleOf,
  distance,
  isFiniteVector,
  subtract,
  vec,
  wrapSignedRadians
} from "../../src/shared/vector2.ts";

describe("vector2", () => {
  it("measures distance and direction between two points", () => {
    const a = vec(1, 1);
    const b = vec(4, 5);

    expect(distance(a, b)).toBeCloseTo(5);
    expect(angleOf(subtract(b, a))).toBeCloseTo(Math.atan2(4, 3));
  });

  it("wraps angles into the signed half turn range", () => {
    expect(wrapSignedRadians(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapSignedRadians(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(wrapSignedRadians(0.3)).toBeCloseTo(0.3);
  });

  it("rejects non-finite components", () => {
    expect(isFiniteVector(vec(1, 2))).toBe(true);
    expect(isFiniteVector(vec(Number.NaN, 2))).toBe(false);
    expect(isFiniteVector(vec(1, Number.POSITIVE_INFINITY))).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/vector2.test.ts`
Expected: FAIL — `Failed to load ../../src/shared/vector2.ts`

- [ ] **Step 4: 最小実装**

`src/shared/vector2.ts` に上記 Interfaces の関数を実装する。`wrapSignedRadians` は `Math.atan2(Math.sin(a), Math.cos(a))` を使う（`src/simulation/joint-controller.ts` の同名privateと同じ定義。Task 7で一本化する）。

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/vector2.test.ts` → PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(tests): split tests into unit/contract/integration layers and add Vector2"
```

---

### Task 2: CreatureGraph 型と validation

**Files:**
- Create: `src/domain/creature/creature-graph.ts`
- Create: `src/domain/creature/creature-graph-validation.ts`
- Create: `tests/unit/creature-graph-validation.test.ts`

**Interfaces:**
- Consumes: `Vector2`, `distance`, `isFiniteVector`（Task 1）
- Produces:

```ts
// src/domain/creature/creature-graph.ts
export interface CreatureNode { readonly id: string; readonly position: Vector2 }
export interface CreatureEdge {
  readonly id: string;
  readonly nodeA: string;
  readonly nodeB: string;
  readonly radius: number;
}
export interface CreatureGraph {
  readonly nodes: readonly CreatureNode[];
  readonly edges: readonly CreatureEdge[];
  readonly rootNodeId: string;
}
export interface GraphLimits {
  readonly minEdgeLength: number;
  readonly maxEdgeLength: number;
  readonly maxEdgeCount: number;
  readonly maxNodeDegree: number;
  readonly maxTotalLength: number;
  readonly maxCoordinateMagnitude: number;
  readonly minRadius: number;
  readonly maxRadius: number;
}
export const DEFAULT_GRAPH_LIMITS: GraphLimits = {
  minEdgeLength: 0.25,
  maxEdgeLength: 2,
  maxEdgeCount: 12,
  maxNodeDegree: 4,
  maxTotalLength: 16,
  maxCoordinateMagnitude: 8,
  minRadius: 0.05,
  maxRadius: 0.4
};
declare const validatedBrand: unique symbol;
export type ValidatedCreatureGraph = CreatureGraph & { readonly [validatedBrand]: true };

// src/domain/creature/creature-graph-validation.ts
export type GraphValidationCode =
  | "empty-graph" | "unknown-root-node" | "duplicate-node-id" | "duplicate-edge-id"
  | "missing-node-reference" | "self-loop-edge" | "duplicate-edge-pair"
  | "non-finite-coordinate" | "coordinate-out-of-range" | "radius-out-of-range"
  | "edge-too-short" | "edge-too-long" | "too-many-edges"
  | "node-degree-exceeded" | "total-length-exceeded" | "isolated-node" | "disconnected-graph";
export interface GraphValidationError {
  readonly code: GraphValidationCode;
  readonly message: string;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
}
export type GraphValidationResult =
  | { readonly ok: true; readonly graph: ValidatedCreatureGraph }
  | { readonly ok: false; readonly errors: readonly GraphValidationError[] };
export function validateCreatureGraph(
  graph: CreatureGraph,
  limits?: GraphLimits
): GraphValidationResult;
export function edgeLength(graph: CreatureGraph, edge: CreatureEdge): number;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/creature-graph-validation.test.ts
import { describe, expect, it } from "vitest";

import type { CreatureGraph } from "../../src/domain/creature/creature-graph.ts";
import { DEFAULT_GRAPH_LIMITS } from "../../src/domain/creature/creature-graph.ts";
import {
  validateCreatureGraph,
  type GraphValidationCode
} from "../../src/domain/creature/creature-graph-validation.ts";

function codesOf(graph: CreatureGraph): GraphValidationCode[] {
  const result = validateCreatureGraph(graph);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

const chain: CreatureGraph = {
  rootNodeId: "n0",
  nodes: [
    { id: "n0", position: { x: 0, y: 0 } },
    { id: "n1", position: { x: 0.8, y: 0 } },
    { id: "n2", position: { x: 1.6, y: 0 } }
  ],
  edges: [
    { id: "e0", nodeA: "n0", nodeB: "n1", radius: 0.12 },
    { id: "e1", nodeA: "n1", nodeB: "n2", radius: 0.12 }
  ]
};

describe("validateCreatureGraph", () => {
  it("accepts a well formed chain and brands it as validated", () => {
    const result = validateCreatureGraph(chain);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.edges).toHaveLength(2);
    }
  });

  it("reports every broken invariant instead of throwing", () => {
    const broken: CreatureGraph = {
      rootNodeId: "missing",
      nodes: [
        { id: "n0", position: { x: 0, y: 0 } },
        { id: "n0", position: { x: 1, y: 0 } },
        { id: "far", position: { x: 999, y: 0 } },
        { id: "nan", position: { x: Number.NaN, y: 0 } }
      ],
      edges: [
        { id: "e0", nodeA: "n0", nodeB: "ghost", radius: 0.12 },
        { id: "e1", nodeA: "n0", nodeB: "n0", radius: 0.12 }
      ]
    };

    const codes = codesOf(broken);

    expect(codes).toContain("unknown-root-node");
    expect(codes).toContain("duplicate-node-id");
    expect(codes).toContain("missing-node-reference");
    expect(codes).toContain("self-loop-edge");
    expect(codes).toContain("non-finite-coordinate");
    expect(codes).toContain("coordinate-out-of-range");
  });

  it("rejects edges shorter than the minimum bone length", () => {
    const tiny: CreatureGraph = {
      rootNodeId: "n0",
      nodes: [
        { id: "n0", position: { x: 0, y: 0 } },
        { id: "n1", position: { x: DEFAULT_GRAPH_LIMITS.minEdgeLength / 2, y: 0 } }
      ],
      edges: [{ id: "e0", nodeA: "n0", nodeB: "n1", radius: 0.12 }]
    };

    expect(codesOf(tiny)).toContain("edge-too-short");
  });

  it("rejects a graph that is not a single connected component", () => {
    const split: CreatureGraph = {
      rootNodeId: "n0",
      nodes: [
        { id: "n0", position: { x: 0, y: 0 } },
        { id: "n1", position: { x: 0.8, y: 0 } },
        { id: "n2", position: { x: 3, y: 0 } },
        { id: "n3", position: { x: 3.8, y: 0 } }
      ],
      edges: [
        { id: "e0", nodeA: "n0", nodeB: "n1", radius: 0.12 },
        { id: "e1", nodeA: "n2", nodeB: "n3", radius: 0.12 }
      ]
    };

    expect(codesOf(split)).toContain("disconnected-graph");
  });

  it("rejects a node whose degree exceeds the limit", () => {
    const hub: CreatureGraph = {
      rootNodeId: "c",
      nodes: [
        { id: "c", position: { x: 0, y: 0 } },
        { id: "a", position: { x: 0.8, y: 0 } },
        { id: "b", position: { x: -0.8, y: 0 } },
        { id: "d", position: { x: 0, y: 0.8 } },
        { id: "e", position: { x: 0, y: -0.8 } },
        { id: "f", position: { x: 0.6, y: 0.6 } }
      ],
      edges: [
        { id: "e0", nodeA: "c", nodeB: "a", radius: 0.12 },
        { id: "e1", nodeA: "c", nodeB: "b", radius: 0.12 },
        { id: "e2", nodeA: "c", nodeB: "d", radius: 0.12 },
        { id: "e3", nodeA: "c", nodeB: "e", radius: 0.12 },
        { id: "e4", nodeA: "c", nodeB: "f", radius: 0.12 }
      ]
    };

    expect(codesOf(hub)).toContain("node-degree-exceeded");
  });

  it("explains how to fix the graph in the error message", () => {
    const result = validateCreatureGraph({
      rootNodeId: "n0",
      nodes: [{ id: "n0", position: { x: 0, y: 0 } }],
      edges: []
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const [first] = result.errors;
      expect(first?.code).toBe("empty-graph");
      expect(first?.message.length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/creature-graph-validation.test.ts`
Expected: FAIL — module `creature-graph.ts` が存在しない

- [ ] **Step 3: 最小実装**

`creature-graph.ts` に型と `DEFAULT_GRAPH_LIMITS` を定義。`creature-graph-validation.ts` に以下の順で検査し、見つかったerrorをすべて配列へ集める（例外を投げない）:

1. `edges.length === 0` → `empty-graph`
2. node id / edge id の重複
3. `rootNodeId` が nodes に存在するか
4. 各 node 座標の有限性・範囲
5. 各 edge の参照解決、自己ループ、無向ペア重複
6. 各 edge の radius 範囲、長さ（min/max）
7. `edges.length > maxEdgeCount` → `too-many-edges`、総延長 → `total-length-exceeded`
8. 次数計算 → `node-degree-exceeded`、次数0 → `isolated-node`
9. 参照可能なedgeのみで union-find → 連結成分が2以上なら `disconnected-graph`

message は日本語で「何が・どの要素で・どう直すか」を書く。errorが0件なら `{ ok: true, graph: graph as ValidatedCreatureGraph }`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/creature-graph-validation.test.ts` → PASS

- [ ] **Step 5: 配線切断証明**

`disconnected-graph` の union-find 呼び出しを一時的にコメントアウトし、該当テストだけが失敗することを確認してから戻す。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(domain): add CreatureGraph model and validation with explained errors"
```

---

### Task 3: 代表 fixture と graph hash

**Files:**
- Create: `tests/fixtures/creature-graphs.ts`
- Create: `src/domain/creature/graph-hash.ts`
- Create: `tests/unit/graph-hash.test.ts`

**Interfaces:**
- Consumes: `CreatureGraph`, `validateCreatureGraph`
- Produces:

```ts
// tests/fixtures/creature-graphs.ts
export const chain4: CreatureGraph;   // 4ボーン直線
export const lShape5: CreatureGraph;  // 5ボーンL字
export const zigzag6: CreatureGraph;  // 6ボーンジグザグ
export const yBranch5: CreatureGraph; // 5ボーンY字（次数3のnodeを含む）
export const validFixtures: readonly { name: string; graph: CreatureGraph }[];

// src/domain/creature/graph-hash.ts
export function creatureGraphHash(graph: CreatureGraph): string; // 16桁hex
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/graph-hash.test.ts
import { describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import { creatureGraphHash } from "../../src/domain/creature/graph-hash.ts";
import { chain4, validFixtures, zigzag6 } from "../fixtures/creature-graphs.ts";

describe("creature graph fixtures", () => {
  it.each(validFixtures)("$name passes validation", ({ graph }) => {
    const result = validateCreatureGraph(graph);

    expect(result.ok, result.ok ? "" : JSON.stringify(result.errors)).toBe(true);
  });

  it("covers the 4 to 6 bone range required by M1", () => {
    for (const { graph } of validFixtures) {
      expect(graph.edges.length).toBeGreaterThanOrEqual(4);
      expect(graph.edges.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("creatureGraphHash", () => {
  it("is stable for the same graph", () => {
    expect(creatureGraphHash(chain4)).toBe(creatureGraphHash(chain4));
  });

  it("ignores node and edge declaration order", () => {
    const reordered = {
      ...chain4,
      nodes: [...chain4.nodes].reverse(),
      edges: [...chain4.edges].reverse()
    };

    expect(creatureGraphHash(reordered)).toBe(creatureGraphHash(chain4));
  });

  it("changes when geometry changes", () => {
    const moved = {
      ...chain4,
      nodes: chain4.nodes.map((node, index) =>
        index === 0 ? { ...node, position: { x: node.position.x + 0.1, y: node.position.y } } : node
      )
    };

    expect(creatureGraphHash(moved)).not.toBe(creatureGraphHash(chain4));
    expect(creatureGraphHash(chain4)).not.toBe(creatureGraphHash(zigzag6));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/graph-hash.test.ts`
Expected: FAIL — fixtures と `graph-hash.ts` が存在しない

- [ ] **Step 3: 最小実装**

fixture は骨長 0.7〜0.9 m、radius 0.10〜0.12 m の範囲で作る。`zigzag6` は上下交互、`lShape5` は途中で90度、`yBranch5` は中央nodeの次数を3にする。

`creatureGraphHash` は「宣言順に依存しない正規化 → FNV-1a 64bit 相当を32bit×2で計算 → 16桁hex」。正規化文字列は次で作る:
- node: `id|x.toFixed(6)|y.toFixed(6)` を id 昇順で連結
- edge: 端点idを昇順に並べた `idA-idB|radius.toFixed(6)` を、その文字列自体の昇順で連結（edge id は hash に含めない＝同じ形なら同じhash）
- `rootNodeId` を末尾に付ける

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/graph-hash.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add 4-6 bone creature fixtures and order-independent graph hash"
```

---

### Task 4: SkeletonPlan（Graph → Body/Joint幾何、純粋）

**Files:**
- Create: `src/simulation/skeleton-plan.ts`
- Create: `tests/unit/skeleton-plan.test.ts`

**Interfaces:**
- Consumes: `ValidatedCreatureGraph`, `Vector2`, `distance`, `angleOf`, `wrapSignedRadians`
- Produces:

```ts
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
  joint: { lowerAngle: -0.9, upperAngle: 0.9, maxMotorTorque: 40, enableLimit: true, enableMotor: true },
  body: { density: 1, friction: 0.8, linearDamping: 0.02, angularDamping: 0.05 }
};
export interface BonePlan {
  readonly edgeId: string;
  readonly center: Vector2;   // グラフ座標での骨の中心
  readonly axisAngle: number; // nodeA -> nodeB のworld角。Body回転角と一致する
  readonly length: number;    // node間距離
  readonly radius: number;
  readonly nodeA: string;
  readonly nodeB: string;
}
export interface JointPlan {
  readonly nodeId: string;
  readonly boneAIndex: number;
  readonly boneBIndex: number;
  readonly anchorA: Vector2;  // boneAのローカル座標
  readonly anchorB: Vector2;
  readonly referenceAngle: number;
  readonly settings: JointSettings;
}
export interface SkeletonPlan {
  readonly bones: readonly BonePlan[];
  readonly joints: readonly JointPlan[];
  readonly body: BodySettings;
}
export function buildSkeletonPlan(
  graph: ValidatedCreatureGraph,
  settings?: SkeletonSettings
): SkeletonPlan;
export function computeSpawnOffset(plan: SkeletonPlan, clearance: number): Vector2;
```

幾何規約: 骨のローカル+X軸が nodeA → nodeB 方向。したがって anchor は nodeA側 `(-length/2, 0)`、nodeB側 `(+length/2, 0)`。Body回転角 = `axisAngle`。

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/skeleton-plan.test.ts
import { describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import type { ValidatedCreatureGraph } from "../../src/domain/creature/creature-graph.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  DEFAULT_SKELETON_SETTINGS
} from "../../src/simulation/skeleton-plan.ts";
import { chain4, lShape5, yBranch5 } from "../fixtures/creature-graphs.ts";

function validated(graph: typeof chain4): ValidatedCreatureGraph {
  const result = validateCreatureGraph(graph);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return result.graph;
}

describe("buildSkeletonPlan", () => {
  it("creates one bone per edge and one joint per extra edge at a shared node", () => {
    const plan = buildSkeletonPlan(validated(chain4));

    expect(plan.bones).toHaveLength(chain4.edges.length);
    expect(plan.joints).toHaveLength(chain4.edges.length - 1);
  });

  it("creates degree minus one joints at a branching node", () => {
    const plan = buildSkeletonPlan(validated(yBranch5));
    const branchJoints = plan.joints.filter((joint) => joint.nodeId === "c");

    expect(branchJoints).toHaveLength(2);
    expect(plan.joints).toHaveLength(yBranch5.edges.length - 1);
  });

  it("places each bone at the edge midpoint along the node-to-node axis", () => {
    const plan = buildSkeletonPlan(validated(chain4));
    const [first] = plan.bones;

    expect(first).toBeDefined();
    expect(first?.center.x).toBeCloseTo(0.4);
    expect(first?.center.y).toBeCloseTo(0);
    expect(first?.axisAngle).toBeCloseTo(0);
    expect(first?.length).toBeCloseTo(0.8);
  });

  it("anchors a joint on the shared node from both bones", () => {
    const plan = buildSkeletonPlan(validated(chain4));
    const [joint] = plan.joints;

    expect(joint).toBeDefined();
    const boneA = plan.bones[joint!.boneAIndex]!;
    const boneB = plan.bones[joint!.boneBIndex]!;
    const worldA = {
      x: boneA.center.x + Math.cos(boneA.axisAngle) * joint!.anchorA.x
        - Math.sin(boneA.axisAngle) * joint!.anchorA.y,
      y: boneA.center.y + Math.sin(boneA.axisAngle) * joint!.anchorA.x
        + Math.cos(boneA.axisAngle) * joint!.anchorA.y
    };
    const worldB = {
      x: boneB.center.x + Math.cos(boneB.axisAngle) * joint!.anchorB.x
        - Math.sin(boneB.axisAngle) * joint!.anchorB.y,
      y: boneB.center.y + Math.sin(boneB.axisAngle) * joint!.anchorB.x
        + Math.cos(boneB.axisAngle) * joint!.anchorB.y
    };

    expect(worldA.x).toBeCloseTo(worldB.x);
    expect(worldA.y).toBeCloseTo(worldB.y);
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
      ...plan.bones.flatMap((bone) => {
        const halfY = Math.abs(Math.sin(bone.axisAngle)) * (bone.length / 2);
        return [bone.center.y + offset.y - halfY - bone.radius];
      })
    );

    expect(lowest).toBeCloseTo(0.05);
    expect(offset.x).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/skeleton-plan.test.ts`
Expected: FAIL — `skeleton-plan.ts` が存在しない

- [ ] **Step 3: 最小実装**

- bones: `graph.edges` を `edge.id` 昇順に並べ替えてから生成（宣言順非依存）。`center` = 両端nodeの中点、`axisAngle` = `angleOf(subtract(posB, posA))`、`length` = `distance`。
- joints: node ごとに接続 edge index を集め、`edge.id` 昇順に並べる。次数 d >= 2 の node で、先頭 edge と 2番目以降の各 edge の間に joint を1つ作る（d-1個）。
- anchor: その joint の node が boneA の `nodeA` なら `(-len/2, 0)`、`nodeB` なら `(+len/2, 0)`。boneB も同様。
- `referenceAngle` = `wrapSignedRadians(boneB.axisAngle - boneA.axisAngle)`。
- `computeSpawnOffset`: 各骨のワールドAABB下端 = `center.y - |sin(axisAngle)| * length/2 - radius` の最小値を求め、`y = clearance - minBottom`、`x = 0`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/skeleton-plan.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(simulation): derive bone and joint geometry from a validated creature graph"
```

---

### Task 5: Box2D World と地面の adapter

**Files:**
- Create: `src/simulation/box2d/box2d-world.ts`
- Create: `tests/contract/box2d-world.test.ts`
- Modify: `src/phaser-box2d.d.ts`

**Interfaces:**
- Produces:

```ts
export const CREATURE_CATEGORY = 0x0001;
export const GROUND_CATEGORY = 0x0002;
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
export interface PhysicsWorld {
  readonly worldId: b2WorldId;
  step(stepSeconds: number, subSteps: number): void;
  countShapes(): number;
  destroy(): void;
}
export function createPhysicsWorld(options?: Partial<PhysicsWorldOptions>): PhysicsWorld;
```

地面は静的Body、上面を `y = 0` に置く（`position.y = -groundHalfHeight`）。地面 shape は `categoryBits: GROUND_CATEGORY`, `maskBits: CREATURE_CATEGORY`。`countShapes()` は `b2World_OverlapAABB` に巨大AABBを渡して数える（`b2World_GetCounters()` は空実装なので使わない）。

`src/phaser-box2d.d.ts` に追加する宣言: `b2DestroyBody`, `b2DestroyJoint`, `b2Body_IsValid`, `b2Joint_IsValid`, `b2World_OverlapAABB`, `b2DefaultQueryFilter`, `b2AABB`, `b2QueryFilter`, `CreateBoxPolygon`, `b2DefaultRevoluteJointDef`, `b2RevoluteJointDef`, `b2RevoluteJoint_GetLowerLimit`, `b2RevoluteJoint_GetUpperLimit`, `b2RevoluteJoint_IsLimitEnabled`, `b2RevoluteJoint_IsMotorEnabled`, `b2RevoluteJoint_GetMaxMotorTorque`, `b2RevoluteJoint_GetMotorTorque`, `b2Body_GetMass`, `b2Body_GetWorldCenterOfMass`, `b2Body_GetLinearVelocity`, `b2Body_GetAngularVelocity`, `b2Joint_GetBodyA`, `b2Joint_GetBodyB`。

- [ ] **Step 1: Write the failing test**

```ts
// tests/contract/box2d-world.test.ts
import { afterEach, describe, expect, it } from "vitest";

import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";

const worlds: PhysicsWorld[] = [];

function makeWorld(options?: Parameters<typeof createPhysicsWorld>[0]): PhysicsWorld {
  const world = createPhysicsWorld(options);
  worlds.push(world);
  return world;
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("createPhysicsWorld", () => {
  it("starts with exactly one shape: the ground", () => {
    expect(makeWorld().countShapes()).toBe(1);
  });

  it("steps without throwing and stays valid", () => {
    const world = makeWorld();

    for (let index = 0; index < 60; index += 1) {
      world.step(1 / 60, 4);
    }

    expect(world.countShapes()).toBe(1);
  });

  it("is inert after destroy so a stale handle cannot corrupt a new world", () => {
    const world = createPhysicsWorld();
    world.destroy();

    expect(() => world.step(1 / 60, 4)).toThrow(/destroyed/);
    expect(() => world.countShapes()).toThrow(/destroyed/);
    expect(() => world.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/contract/box2d-world.test.ts`
Expected: FAIL — `box2d-world.ts` が存在しない

- [ ] **Step 3: 最小実装**

module 読み込み時に `b2CreateWorldArray()` を1度だけ呼ぶ（`src/simulation/p0-physics-rig.ts` と同じ方式。二重呼び出しに耐えることを確認する）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/contract/box2d-world.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(simulation): add Box2D world and ground adapter with shape counting"
```

---

### Task 6: SkeletonPlan → Box2D 生成と destroy 契約

**Files:**
- Create: `src/simulation/box2d/box2d-creature-factory.ts`
- Create: `tests/contract/box2d-creature-factory.test.ts`

**Interfaces:**
- Consumes: `PhysicsWorld`, `SkeletonPlan`, `computeSpawnOffset`
- Produces:

```ts
export interface BoneSnapshot {
  readonly x: number; readonly y: number; readonly angle: number;
  readonly length: number; readonly radius: number;
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
export interface CreatureHandle {
  readonly boneCount: number;
  readonly jointCount: number;
  jointState(index: number): JointState;
  setMotorSpeed(index: number, speed: number): void;
  centerOfMass(): Vector2;
  snapshot(): CreatureSnapshot;
  hasFiniteState(): boolean;
  maxAbsCoordinate(): number;
  destroy(): void;
}
export interface CreatureSpawnOptions {
  readonly origin: Vector2;
  readonly groupIndex: number; // M2のレーン分離で使う。M1は0
}
export function createCreature(
  world: PhysicsWorld,
  plan: SkeletonPlan,
  options?: Partial<CreatureSpawnOptions>
): CreatureHandle;
```

`destroy()` は **joint を先に、body を後に** 破棄し、二重呼び出しに耐える。破棄後のメソッド呼び出しは `Error(/destroyed/)`。

- [ ] **Step 1: Write the failing test**

```ts
// tests/contract/box2d-creature-factory.test.ts
import { afterEach, describe, expect, it } from "vitest";

import { validateCreatureGraph } from "../../src/domain/creature/creature-graph-validation.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  DEFAULT_SKELETON_SETTINGS
} from "../../src/simulation/skeleton-plan.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../../src/simulation/box2d/box2d-world.ts";
import {
  createCreature,
  type CreatureHandle
} from "../../src/simulation/box2d/box2d-creature-factory.ts";
import { chain4, lShape5 } from "../fixtures/creature-graphs.ts";

const worlds: PhysicsWorld[] = [];
const creatures: CreatureHandle[] = [];

function planFor(graph: typeof chain4) {
  const result = validateCreatureGraph(graph);
  if (!result.ok) {
    throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`);
  }
  return buildSkeletonPlan(result.graph);
}

function spawn(graph: typeof chain4) {
  const world = createPhysicsWorld();
  worlds.push(world);
  const plan = planFor(graph);
  const creature = createCreature(world, plan, {
    origin: computeSpawnOffset(plan, 0.1)
  });
  creatures.push(creature);
  return { world, plan, creature };
}

afterEach(() => {
  for (const creature of creatures.splice(0)) {
    try {
      creature.destroy();
    } catch {
      // already destroyed by the test
    }
  }
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("createCreature", () => {
  it("creates one body per bone and one joint per plan joint", () => {
    const { world, plan, creature } = spawn(chain4);

    expect(creature.boneCount).toBe(plan.bones.length);
    expect(creature.jointCount).toBe(plan.joints.length);
    expect(world.countShapes()).toBe(1 + plan.bones.length);
  });

  it("matches the fixture joint limits, motor flag and torque", () => {
    const { creature, plan } = spawn(chain4);

    expect(plan.joints[0]?.settings).toEqual(DEFAULT_SKELETON_SETTINGS.joint);
    for (let index = 0; index < creature.jointCount; index += 1) {
      expect(creature.jointState(index).angle).toBeCloseTo(0, 4);
    }
  });

  it("starts a bent skeleton at joint angle zero", () => {
    const { creature } = spawn(lShape5);

    for (let index = 0; index < creature.jointCount; index += 1) {
      expect(Math.abs(creature.jointState(index).angle)).toBeLessThan(1e-3);
    }
  });

  it("spawns above the ground and falls onto it", () => {
    const { world, creature } = spawn(chain4);
    const startY = creature.centerOfMass().y;

    for (let index = 0; index < 240; index += 1) {
      world.step(1 / 60, 4);
    }

    const restY = creature.centerOfMass().y;
    expect(startY).toBeGreaterThan(restY);
    expect(restY).toBeGreaterThan(0);
    expect(creature.hasFiniteState()).toBe(true);
  });

  it("drives the joint only through setMotorSpeed", () => {
    const idle = spawn(chain4);
    const driven = spawn(chain4);

    for (let index = 0; index < 120; index += 1) {
      driven.creature.setMotorSpeed(0, 4);
      idle.world.step(1 / 60, 4);
      driven.world.step(1 / 60, 4);
    }

    expect(Math.abs(driven.creature.jointState(0).angle)).toBeGreaterThan(
      Math.abs(idle.creature.jointState(0).angle) + 0.1
    );
  });

  it("removes every body and joint from the world on destroy", () => {
    const { world, creature } = spawn(chain4);

    creature.destroy();

    expect(world.countShapes()).toBe(1);
    expect(() => creature.snapshot()).toThrow(/destroyed/);
    expect(() => creature.destroy()).not.toThrow();
  });

  it("reports a renderable snapshot that matches the bone plan", () => {
    const { plan, creature } = spawn(lShape5);
    const snapshot = creature.snapshot();

    expect(snapshot.bones).toHaveLength(plan.bones.length);
    for (const [index, bone] of snapshot.bones.entries()) {
      expect(bone.length).toBeCloseTo(plan.bones[index]!.length);
      expect(bone.radius).toBeCloseTo(plan.bones[index]!.radius);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/contract/box2d-creature-factory.test.ts`
Expected: FAIL — `box2d-creature-factory.ts` が存在しない

- [ ] **Step 3: 最小実装**

- Body: `b2DefaultBodyDef()` に `type = DYNAMIC`、`position = center + origin`、`rotation = b2MakeRot(axisAngle)`、damping を設定。`CreateCapsule({ worldId, bodyDef, center1: {-len/2, 0}, center2: {+len/2, 0}, radius, density, friction, categoryBits: CREATURE_CATEGORY, maskBits: GROUND_CATEGORY, groupIndex })` で生成する（`width`/`height` は使わない）。
- Joint: `b2DefaultRevoluteJointDef()` に `referenceAngle` を設定してから `CreateRevoluteJoint({ jointDef, ... , collideConnected: false })` へ渡す。
- `centerOfMass()` は `b2Body_GetMass` で重み付けした `b2Body_GetWorldCenterOfMass` の平均。
- `hasFiniteState()` は全bodyの位置・角度・速度と全jointの角度が有限か。`maxAbsCoordinate()` は位置成分の絶対値最大。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/contract/box2d-creature-factory.test.ts` → PASS

- [ ] **Step 5: 配線切断証明**

`maskBits` を `0xFFFF` に変えると個体が地面以外とも衝突しうる設定になる。ここでは `collideConnected: false` を `true` に変えて「spawns above the ground and falls onto it」が不安定化することを確認し、戻す。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(simulation): build Box2D bodies and joints from a skeleton plan"
```

---

### Task 7: JointCommandSource port と joint-controller の domain 移動

**Files:**
- Move: `src/simulation/joint-controller.ts` → `src/domain/control/joint-controller.ts`
- Modify: `src/p0-scene.ts`（import path）
- Move: `tests/unit/joint-controller.test.ts` の import path
- Create: `src/domain/control/joint-command-source.ts`
- Create: `tests/unit/joint-command-source.test.ts`

**Interfaces:**
- Produces:

```ts
export interface JointObservation {
  readonly index: number;
  readonly angle: number;
  readonly angularVelocity: number;
}
export interface JointCommandSource {
  motorSpeed(observation: JointObservation, elapsedSeconds: number): number;
}
export interface SineCommandConfig {
  readonly globalFrequency: number;         // Hz
  readonly joints: readonly { readonly amplitude: number; readonly phase: number; readonly bias: number }[];
  readonly proportionalGain: number;
  readonly derivativeGain: number;
  readonly maxMotorSpeed: number;
}
export function createSineCommandSource(config: SineCommandConfig): JointCommandSource;
export function createZeroCommandSource(): JointCommandSource;
```

`motorSpeed` は `targetAngle = bias + amplitude * sin(2π * globalFrequency * t + phase)` を作り、`calculateMotorSpeed` へ渡す。M3ではGenomeから同じ port を実装する。

- [ ] **Step 1: joint-controller を domain へ移す**

```bash
mkdir -p src/domain/control
git mv src/simulation/joint-controller.ts src/domain/control/joint-controller.ts
sed -i '' 's#"./simulation/joint-controller.ts"#"./domain/control/joint-controller.ts"#' src/p0-scene.ts
sed -i '' 's#"../../src/simulation/joint-controller.ts"#"../../src/domain/control/joint-controller.ts"#' tests/unit/joint-controller.test.ts
npm run test
```

Expected: 既存テストが全てPASS

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/joint-command-source.test.ts
import { describe, expect, it } from "vitest";

import {
  createSineCommandSource,
  createZeroCommandSource
} from "../../src/domain/control/joint-command-source.ts";

const config = {
  globalFrequency: 1,
  joints: [
    { amplitude: 0.5, phase: 0, bias: 0 },
    { amplitude: 0.5, phase: Math.PI, bias: 0 }
  ],
  proportionalGain: 10,
  derivativeGain: 0.4,
  maxMotorSpeed: 8
};

describe("createSineCommandSource", () => {
  it("drives two joints in opposite directions when their phases differ by pi", () => {
    const source = createSineCommandSource(config);
    const time = 0.25;
    const first = source.motorSpeed({ index: 0, angle: 0, angularVelocity: 0 }, time);
    const second = source.motorSpeed({ index: 1, angle: 0, angularVelocity: 0 }, time);

    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(0);
    expect(first).toBeCloseTo(-second);
  });

  it("clamps the requested speed to the configured maximum", () => {
    const source = createSineCommandSource({ ...config, proportionalGain: 1000 });

    const speed = source.motorSpeed({ index: 0, angle: -1, angularVelocity: 0 }, 0.25);

    expect(speed).toBeCloseTo(config.maxMotorSpeed);
  });

  it("returns zero for a joint index the configuration does not cover", () => {
    const source = createSineCommandSource(config);

    expect(source.motorSpeed({ index: 9, angle: 0.3, angularVelocity: 0 }, 0.25)).toBe(0);
  });

  it("is a pure function of observation and time", () => {
    const source = createSineCommandSource(config);
    const observation = { index: 0, angle: 0.1, angularVelocity: 0.2 };

    expect(source.motorSpeed(observation, 1.5)).toBe(source.motorSpeed(observation, 1.5));
  });
});

describe("createZeroCommandSource", () => {
  it("never requests motor movement", () => {
    const source = createZeroCommandSource();

    expect(source.motorSpeed({ index: 0, angle: 1, angularVelocity: 1 }, 3)).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/joint-command-source.test.ts`
Expected: FAIL — `joint-command-source.ts` が存在しない

- [ ] **Step 4: 最小実装 → Green**

Run: `npx vitest run tests/unit/joint-command-source.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add JointCommandSource port with a sine controller"
```

---

### Task 8: EpisodeRunner と lifecycle / 決定性 / 資源の integration test

**Files:**
- Create: `src/simulation/episode-runner.ts`
- Create: `tests/integration/episode-runner.test.ts`
- Create: `tests/integration/episode-lifecycle.test.ts`

**Interfaces:**
- Consumes: `CreatureHandle`, `JointCommandSource`
- Produces:

```ts
export interface EpisodeOptions {
  readonly stepSeconds: number;
  readonly subSteps: number;
  readonly durationSeconds: number;
  readonly maxCoordinateMagnitude: number;
}
export const DEFAULT_EPISODE_OPTIONS: EpisodeOptions = {
  stepSeconds: 1 / 60,
  subSteps: 4,
  durationSeconds: 6,
  maxCoordinateMagnitude: 500
};
export type EpisodeStatus = "ready" | "running" | "completed" | "invalid";
export type EpisodeInvalidReason = "non-finite-state" | "out-of-bounds";
export interface EpisodeResult {
  readonly status: "completed" | "invalid";
  readonly invalidReason: EpisodeInvalidReason | null;
  readonly steps: number;
  readonly elapsedSeconds: number;
  readonly startCenterOfMass: Vector2;
  readonly endCenterOfMass: Vector2;
  readonly maxForwardProgress: number;
  readonly motorEffort: number;
}
export interface EpisodeDependencies {
  readonly world: { step(stepSeconds: number, subSteps: number): void };
  readonly creature: CreatureHandle;
  readonly commands: JointCommandSource;
  readonly options?: Partial<EpisodeOptions>;
}
export class EpisodeRunner {
  constructor(dependencies: EpisodeDependencies);
  get status(): EpisodeStatus;
  get stepCount(): number;
  step(): boolean;          // まだ続くなら true
  run(): EpisodeResult;
  result(): EpisodeResult;  // completed / invalid 以外では throw
}
```

1 step の順序: 各 joint の観測 → `commands.motorSpeed` → `setMotorSpeed` → `world.step` → metrics 更新 → 有限性・範囲チェック。`motorEffort` は `Σ |motorTorque| * stepSeconds`。

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/episode-runner.test.ts
import { afterEach, describe, expect, it } from "vitest";

import { createSineCommandSource, createZeroCommandSource }
  from "../../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph }
  from "../../src/domain/creature/creature-graph-validation.ts";
import { createCreature } from "../../src/simulation/box2d/box2d-creature-factory.ts";
import { createPhysicsWorld, type PhysicsWorld }
  from "../../src/simulation/box2d/box2d-world.ts";
import { EpisodeRunner, DEFAULT_EPISODE_OPTIONS }
  from "../../src/simulation/episode-runner.ts";
import { buildSkeletonPlan, computeSpawnOffset }
  from "../../src/simulation/skeleton-plan.ts";
import { zigzag6 } from "../fixtures/creature-graphs.ts";

const worlds: PhysicsWorld[] = [];

function makeEpisode(commands = createZeroCommandSource(), options = {}) {
  const result = validateCreatureGraph(zigzag6);
  if (!result.ok) {
    throw new Error("fixture is invalid");
  }
  const plan = buildSkeletonPlan(result.graph);
  const world = createPhysicsWorld();
  worlds.push(world);
  const creature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
  return {
    world,
    creature,
    runner: new EpisodeRunner({ world, creature, commands, options })
  };
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("EpisodeRunner", () => {
  it("runs exactly the number of fixed steps the duration implies", () => {
    const { runner } = makeEpisode(createZeroCommandSource(), { durationSeconds: 2 });

    const result = runner.run();

    expect(result.status).toBe("completed");
    expect(result.steps).toBe(Math.round(2 / DEFAULT_EPISODE_OPTIONS.stepSeconds));
    expect(result.elapsedSeconds).toBeCloseTo(2, 6);
    expect(runner.status).toBe("completed");
  });

  it("records centre of mass progress and motor effort", () => {
    const driven = makeEpisode(
      createSineCommandSource({
        globalFrequency: 1.5,
        joints: Array.from({ length: 5 }, (_unused, index) => ({
          amplitude: 0.7,
          phase: (index * Math.PI) / 3,
          bias: 0
        })),
        proportionalGain: 12,
        derivativeGain: 0.5,
        maxMotorSpeed: 9
      }),
      { durationSeconds: 4 }
    );
    const idle = makeEpisode(createZeroCommandSource(), { durationSeconds: 4 });

    const drivenResult = driven.runner.run();
    const idleResult = idle.runner.run();

    expect(drivenResult.motorEffort).toBeGreaterThan(idleResult.motorEffort);
    expect(Math.abs(drivenResult.endCenterOfMass.x - drivenResult.startCenterOfMass.x))
      .toBeGreaterThan(Math.abs(idleResult.endCenterOfMass.x - idleResult.startCenterOfMass.x));
    expect(drivenResult.maxForwardProgress).toBeGreaterThanOrEqual(
      drivenResult.endCenterOfMass.x - drivenResult.startCenterOfMass.x
    );
  });

  it("stops as invalid instead of throwing when the creature leaves the allowed range", () => {
    const { runner } = makeEpisode(createZeroCommandSource(), {
      durationSeconds: 4,
      maxCoordinateMagnitude: 0.05
    });

    const result = runner.run();

    expect(result.status).toBe("invalid");
    expect(result.invalidReason).toBe("out-of-bounds");
    expect(result.steps).toBeLessThan(Math.round(4 / DEFAULT_EPISODE_OPTIONS.stepSeconds));
  });

  it("refuses to report a result before the episode ends", () => {
    const { runner } = makeEpisode();

    expect(() => runner.result()).toThrow(/not finished/);
    expect(runner.step()).toBe(true);
    expect(runner.status).toBe("running");
  });
});
```

```ts
// tests/integration/episode-lifecycle.test.ts
import { afterEach, describe, expect, it } from "vitest";

import { createSineCommandSource } from "../../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph }
  from "../../src/domain/creature/creature-graph-validation.ts";
import { createCreature } from "../../src/simulation/box2d/box2d-creature-factory.ts";
import { createPhysicsWorld, type PhysicsWorld }
  from "../../src/simulation/box2d/box2d-world.ts";
import { EpisodeRunner } from "../../src/simulation/episode-runner.ts";
import { buildSkeletonPlan, computeSpawnOffset }
  from "../../src/simulation/skeleton-plan.ts";
import { lShape5 } from "../fixtures/creature-graphs.ts";

const worlds: PhysicsWorld[] = [];

function planForFixture() {
  const result = validateCreatureGraph(lShape5);
  if (!result.ok) {
    throw new Error("fixture is invalid");
  }
  return buildSkeletonPlan(result.graph);
}

function commandSource() {
  return createSineCommandSource({
    globalFrequency: 1.2,
    joints: Array.from({ length: 4 }, (_unused, index) => ({
      amplitude: 0.6,
      phase: (index * Math.PI) / 2,
      bias: 0
    })),
    proportionalGain: 12,
    derivativeGain: 0.5,
    maxMotorSpeed: 8
  });
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    world.destroy();
  }
});

describe("episode lifecycle", () => {
  it("keeps every state value finite across 10,000 fixed steps", () => {
    const plan = planForFixture();
    const world = createPhysicsWorld();
    worlds.push(world);
    const creature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
    const runner = new EpisodeRunner({
      world,
      creature,
      commands: commandSource(),
      options: { durationSeconds: 10_000 / 60 }
    });

    const result = runner.run();

    expect(result.steps).toBe(10_000);
    expect(result.status).toBe("completed");
    expect(creature.hasFiniteState()).toBe(true);
    expect(Number.isFinite(result.motorEffort)).toBe(true);
    expect(Number.isFinite(result.maxForwardProgress)).toBe(true);
    expect(Number.isFinite(result.endCenterOfMass.x)).toBe(true);
    expect(Number.isFinite(result.endCenterOfMass.y)).toBe(true);
  });

  it("returns the world to its baseline after 100 create and cleanup cycles", () => {
    const plan = planForFixture();
    const world = createPhysicsWorld();
    worlds.push(world);
    const baseline = world.countShapes();

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const creature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
      expect(world.countShapes()).toBe(baseline + plan.bones.length);
      new EpisodeRunner({
        world,
        creature,
        commands: commandSource(),
        options: { durationSeconds: 0.5 }
      }).run();
      creature.destroy();
      expect(world.countShapes()).toBe(baseline);
    }

    expect(world.countShapes()).toBe(baseline);
  });

  it("reproduces the same result for the same fixture and settings", () => {
    const plan = planForFixture();
    const runOnce = () => {
      const world = createPhysicsWorld();
      worlds.push(world);
      const creature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
      const result = new EpisodeRunner({
        world,
        creature,
        commands: commandSource(),
        options: { durationSeconds: 3 }
      }).run();
      creature.destroy();
      return result;
    };

    const first = runOnce();
    const second = runOnce();

    expect(second.steps).toBe(first.steps);
    expect(second.endCenterOfMass.x).toBeCloseTo(first.endCenterOfMass.x, 6);
    expect(second.endCenterOfMass.y).toBeCloseTo(first.endCenterOfMass.y, 6);
    expect(second.motorEffort).toBeCloseTo(first.motorEffort, 6);
  });

  it("reuses one world across generations without recreating it", () => {
    const plan = planForFixture();
    const world = createPhysicsWorld();
    worlds.push(world);
    const firstCreature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
    const firstResult = new EpisodeRunner({
      world, creature: firstCreature, commands: commandSource(), options: { durationSeconds: 2 }
    }).run();
    firstCreature.destroy();

    const secondCreature = createCreature(world, plan, { origin: computeSpawnOffset(plan, 0.1) });
    const secondResult = new EpisodeRunner({
      world, creature: secondCreature, commands: commandSource(), options: { durationSeconds: 2 }
    }).run();
    secondCreature.destroy();

    expect(secondResult.endCenterOfMass.x).toBeCloseTo(firstResult.endCenterOfMass.x, 3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/`
Expected: FAIL — `episode-runner.ts` が存在しない

- [ ] **Step 3: 最小実装 → Green**

Run: `npx vitest run tests/integration/` → PASS

「reuses one world across generations」が許容誤差内で一致しない場合は、**閾値を緩めず**、前世代の速度・力・contactが残っていないか（destroy順序、`b2Body_SetAwake`、地面の状態）を先に調べる。

- [ ] **Step 4: 配線切断証明**

`setMotorSpeed` の呼び出しを一時的に外し、「records centre of mass progress and motor effort」が失敗することを確認して戻す。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(simulation): add EpisodeRunner with lifecycle, metrics and invalid detection"
```

---

### Task 9: RunRecord（最小）

**Files:**
- Create: `src/domain/run/run-record.ts`
- Create: `tests/unit/run-record.test.ts`

**Interfaces:**

```ts
export const RUN_RECORD_SCHEMA_VERSION = 1;
export interface RunRecordSummary {
  readonly steps: number;
  readonly status: "completed" | "invalid";
  readonly invalidReason: string | null;
  readonly forwardProgress: number;
  readonly maxForwardProgress: number;
  readonly motorEffort: number;
}
export interface RunRecord {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly graph: CreatureGraph;
  readonly graphHash: string;
  readonly seed: number;
  readonly episode: EpisodeOptions;
  readonly skeleton: SkeletonSettings;
  readonly runtimeVersions: Readonly<Record<string, string>>;
  readonly summary: RunRecordSummary;
}
export function createRunRecord(input: {
  graph: CreatureGraph; seed: number; episode: EpisodeOptions;
  skeleton: SkeletonSettings; result: EpisodeResult; createdAt: string;
  runtimeVersions: Readonly<Record<string, string>>;
}): RunRecord;
export function serializeRunRecord(record: RunRecord): string;
export type RunRecordParseResult =
  | { readonly ok: true; readonly record: RunRecord }
  | { readonly ok: false; readonly reason: string };
export function parseRunRecord(json: string): RunRecordParseResult;
```

`parseRunRecord` は `schemaVersion` が未対応なら `{ ok: false, reason }` を返す（例外にしない。docs/06 §8）。

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/run-record.test.ts
import { describe, expect, it } from "vitest";

import { creatureGraphHash } from "../../src/domain/creature/graph-hash.ts";
import {
  createRunRecord,
  parseRunRecord,
  serializeRunRecord,
  RUN_RECORD_SCHEMA_VERSION
} from "../../src/domain/run/run-record.ts";
import { DEFAULT_EPISODE_OPTIONS } from "../../src/simulation/episode-runner.ts";
import { DEFAULT_SKELETON_SETTINGS } from "../../src/simulation/skeleton-plan.ts";
import { chain4 } from "../fixtures/creature-graphs.ts";

const result = {
  status: "completed" as const,
  invalidReason: null,
  steps: 360,
  elapsedSeconds: 6,
  startCenterOfMass: { x: 0, y: 0.3 },
  endCenterOfMass: { x: 1.25, y: 0.28 },
  maxForwardProgress: 1.4,
  motorEffort: 12.5
};

function record() {
  return createRunRecord({
    graph: chain4,
    seed: 12345,
    episode: DEFAULT_EPISODE_OPTIONS,
    skeleton: DEFAULT_SKELETON_SETTINGS,
    result,
    createdAt: "2026-09-14T00:00:00.000Z",
    runtimeVersions: { phaser: "4.2.1", phaserBox2d: "1.1.0" }
  });
}

describe("RunRecord", () => {
  it("captures the graph hash, seed and summary needed to reproduce a run", () => {
    const created = record();

    expect(created.schemaVersion).toBe(RUN_RECORD_SCHEMA_VERSION);
    expect(created.graphHash).toBe(creatureGraphHash(chain4));
    expect(created.seed).toBe(12345);
    expect(created.summary.forwardProgress).toBeCloseTo(1.25);
    expect(created.summary.maxForwardProgress).toBeCloseTo(1.4);
    expect(created.summary.status).toBe("completed");
  });

  it("survives a serialize and parse round trip", () => {
    const created = record();

    const parsed = parseRunRecord(serializeRunRecord(created));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.record).toEqual(created);
    }
  });

  it("refuses an unsupported schema version with a reason instead of throwing", () => {
    const future = serializeRunRecord({ ...record(), schemaVersion: 999 });

    const parsed = parseRunRecord(future);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toMatch(/999/);
    }
  });

  it("refuses malformed json with a reason instead of throwing", () => {
    expect(parseRunRecord("{ not json").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/run-record.test.ts`
Expected: FAIL — `run-record.ts` が存在しない

- [ ] **Step 3: 最小実装 → Green**

Run: `npx vitest run tests/unit/run-record.test.ts` → PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(domain): add versioned RunRecord with safe parsing"
```

---

### Task 10: M1検証記録と verify

**Files:**
- Create: `docs/14-m1-simulation-validation.md`
- Modify: `docs/README.md`（索引に14を追加、「次に行うこと」をM2へ更新）
- Modify: `docs/09-risks-open-questions-and-decisions.md`（R-06の状態更新、必要ならD-008を追加）

- [ ] **Step 1: `npm run verify` を実行し出力を控える**

```bash
npm run verify 2>&1 | tail -30
```

- [ ] **Step 2: 検証記録を書く**

`docs/14-m1-simulation-validation.md` に docs/13 §8 の9項目を書く。最低限:
1. 対象commit hash（`git rev-parse --short HEAD`）
2. 実行日と実行環境（OS、Node、npm、各依存版数）
3. docs/12 §5 の受入条件ごとの合否と根拠テスト名
4. 実行command（`npm run verify`）と結果要約（test files / tests / typecheck / build）
5. 使用fixture（chain4 / lShape5 / zigzag6 / yBranch5）と設定値
6. 性能値は **M2で測定**（M1では未測定と明記）
7. 自動試験で確認したこと
8. 手動で確認したこと（M1では不要＝docs/13 §5のマトリクス通り）
9. 未確認事項・持ち越し（Population、レーン分離、contact events、背景tab、build chunk）

- [ ] **Step 3: 索引を更新して commit**

```bash
git add -A
git commit -m "docs: record M1 simulation foundation validation results"
```

## Self-Review

- **Spec coverage:** docs/12 §5の受入条件8項目すべてに担当タスクを割り当て済み（上表）。非ゴール（Population並列、GA、自由描画、見た目）はM1のタスクに含めていない。
- **Placeholder scan:** 各タスクに実際のテストコードと完全な型定義を記載。実装本体はアルゴリズム仕様として具体的に記述している。
- **Type consistency:** `CreatureHandle` / `SkeletonPlan` / `EpisodeResult` / `Vector2` の名前と形が Task 1→9 で一貫していることを確認済み。`EpisodeResult` は Task 8 で定義し Task 9 で消費する。`SkeletonSettings` は Task 4 で定義し Task 6・9 で消費する。
