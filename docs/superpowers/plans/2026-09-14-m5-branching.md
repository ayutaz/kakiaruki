# M5 枝分かれと編集 実装計画

> **実装者向け:** 必須サブスキル: `superpowers:subagent-driven-development` または `superpowers:executing-plans` でタスク単位に実装します。手順はチェックボックス（`- [ ]`）で追跡します。

**Goal:** 一筆を戻って別方向へ伸ばす操作をGraphの枝として解釈し、Y字・人型相当の形を安全に作れるようにする。

**Architecture:** 既存の変換パイプライン（正規化 → re-sampling → 位相判定 → 節点化 → Edge長調整 → validation）の「位相判定」と「節点化」の間に**戻り線検出**を挟み、鎖ではなく木を作る。Edge長調整は配列操作からGraph操作へ置き換える。すべて `src/domain/stroke/` と `src/domain/creature/` の純粋TypeScriptで、Box2D・Phaser・DOMに依存しない。

**Tech Stack:** TypeScript 7（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）、Vitest 5（environment: node）。

**Spec:** [docs/12 §9](../../12-development-plan.md)、[docs/04](../../04-stroke-to-graph.md)、[docs/13 §10](../../13-milestone-quality-and-decision-gates.md)

## Global Constraints

- 相対importには `.ts` 拡張子を付ける。
- `src/domain/` から Phaser / Box2D / DOM へ到達しない（`tests/unit/layering.test.ts` が検査）。
- 乱数は注入可能なSeed付きgeneratorのみ。`Math.random()` を使わない。
- validationは例外を投げず、error codeと日本語の直し方メッセージを返す。
- 閉ループと自己交差は**M5でも拒否のまま**。MVPへ含めるかは人の決定（docs/13 §7）。
- 骨数上限14本（D-010）、Node最大次数4（`DEFAULT_GRAPH_LIMITS`）。
- 受入条件の数値は測定開始前に固定し、結果を見てから緩めない。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/domain/stroke/stroke-retrace.ts`（新規） | 戻り線phaseの検出。点列 → `RetraceSpan[]` |
| `src/domain/creature/graph-edit.ts`（新規） | Graphに対する純粋な編集操作：Edge分割、短Edge統合、末尾Edge削除 |
| `src/domain/stroke/stroke-graph-builder.ts`（変更） | 木を作るよう変更。配列版の split/merge をGraph版へ置換 |
| `tests/fixtures/strokes.ts`（変更） | Y字・人型相当・近接・戻り線なしのfixtureを追加 |
| `tests/unit/stroke-retrace.test.ts`（新規） | 戻り線検出の単体試験 |
| `tests/unit/graph-edit.test.ts`（新規） | Graph編集の単体試験 |
| `tests/unit/stroke-graph-builder.test.ts`（変更） | 枝分かれの変換結果 |
| `tests/integration/stroke-to-evolution.test.ts`（変更） | 枝分かれGraphで進化loopが完走する |

---

## Task 1: 戻り線の検出

**Files:**
- Create: `src/domain/stroke/stroke-retrace.ts`
- Create: `tests/unit/stroke-retrace.test.ts`
- Modify: `tests/fixtures/strokes.ts`

**Interfaces:**
- Produces: `RetraceOptions`, `RetraceSpan`, `DEFAULT_RETRACE_OPTIONS`, `detectRetrace(points, options): readonly RetraceSpan[]`

**仕様（先に固定する）**

等間隔 re-sampling 済みの点列を受け取る。点 `i` が、`lookbackGap` より前の点 `j` から `snapDistance` 以内にあり、かつ `i` と `j` の進行方向が逆向き（内積が負）なら「往路の上に戻っている」とみなす。この状態が `minRetraceLength` 以上続いた区間を1つの `RetraceSpan` とする。

```ts
export interface RetraceSpan {
  /** 戻りが始まった点index。ここまでが往路。 */
  readonly start: number;
  /** 戻りが終わった点index。ここから新しい枝が伸びる。 */
  readonly end: number;
  /** 枝が分かれる往路上の点index。 */
  readonly branchIndex: number;
}
```

- 戻り線: 逆向きに `minRetraceLength` 以上なぞる → span になる。
- 近いだけの線: 近くを通るが逆向きでない、または短い → span にならない。
- 横切っただけの線: 交差判定が先に拒否する（本タスクの対象外）。

- [ ] **Step 1: fixtureを追加する**

`tests/fixtures/strokes.ts` に次を足す。

```ts
/** Y字。縦棒を上へ描き、途中まで戻ってから右上へ伸ばす。 */
export const Y_BRANCH_PATH: ScreenPath = [
  [320, 400],
  [320, 200],
  [320, 260],
  [460, 160]
];

export const yBranchStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(Y_BRANCH_PATH, stepPx);

/** 戻らずに折り返しただけの線。近いが逆向きに重ならない。 */
export const NEAR_MISS_PATH: ScreenPath = [
  [120, 360],
  [420, 360],
  [420, 300],
  [140, 300]
];

export const nearMissStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(NEAR_MISS_PATH, stepPx);
```

- [ ] **Step 2: 失敗する試験を書く**

```ts
describe("detectRetrace", () => {
  it("finds no retrace in a stroke that never goes back", () => {
    expect(detectRetrace(prepared(straightStroke()))).toEqual([]);
    expect(detectRetrace(prepared(zigzagStroke()))).toEqual([]);
  });

  it("finds one retrace in a Y shaped stroke", () => {
    const spans = detectRetrace(prepared(yBranchStroke()));

    expect(spans).toHaveLength(1);
    expect(spans[0]!.branchIndex).toBeLessThan(spans[0]!.start);
  });

  it("does not call a parallel line a retrace", () => {
    expect(detectRetrace(prepared(nearMissStroke()))).toEqual([]);
  });
});
```

- [ ] **Step 3: Redを確認する**

`npx vitest run tests/unit/stroke-retrace.test.ts`
期待: module解決エラー（`stroke-retrace.ts` が存在しない）。

- [ ] **Step 4: 実装する**

```ts
export interface RetraceOptions {
  /** 往路とみなす距離 [m]。 */
  readonly snapDistance: number;
  /** 戻りと認めるのに必要な最小の長さ [m]。 */
  readonly minRetraceLength: number;
  /** 直前の何点を「往路」から除くか。折れ曲がりを戻りと誤認しないための幅。 */
  readonly lookbackGap: number;
}

export const DEFAULT_RETRACE_OPTIONS: RetraceOptions = {
  snapDistance: 0.22,
  minRetraceLength: 0.5,
  lookbackGap: 6
};

export function detectRetrace(
  points: readonly Vector2[],
  options: Partial<RetraceOptions> = {}
): readonly RetraceSpan[];
```

- [ ] **Step 5: Greenを確認し、配線切断証明を取る**

`minRetraceLength` を0にすると「近いだけの線」の試験だけが落ちること、方向の内積判定を外すと「折り返し」の試験だけが落ちることを確認する。

- [ ] **Step 6: commit**

```bash
git add src/domain/stroke/stroke-retrace.ts tests/unit/stroke-retrace.test.ts tests/fixtures/strokes.ts
git commit -m "feat(stroke): detect the return phase of a one stroke drawing"
```

---

## Task 2: Graphに対する編集操作

**Files:**
- Create: `src/domain/creature/graph-edit.ts`
- Create: `tests/unit/graph-edit.test.ts`

**Interfaces:**
- Produces: `splitLongGraphEdges(graph, maxEdgeLength)`, `mergeShortGraphEdges(graph, minEdgeLength)`, `removeLastEdge(graph)`

**仕様**

- `splitLongGraphEdges`: `maxEdgeLength` を超えるEdgeを等分し、中間Nodeを挿す。木の形は変えない。
- `mergeShortGraphEdges`: `minEdgeLength` 未満のEdgeを畳む。**次数3以上のNode（分岐点）は消さない**。両端とも分岐点なら畳まずに残す（validationで拒否される方が、勝手に形を変えるより良い）。
- `removeLastEdge`: 最後に追加されたEdge（id順の末尾）を消し、次数0になったNodeも消す。Edge単位Undo。

- [ ] **Step 1: 失敗する試験を書く**

```ts
it("splits an edge longer than the limit into equal parts", () => { ... });
it("keeps a branch node when a short edge touches it", () => { ... });
it("removes the last edge and any node it leaves isolated", () => { ... });
it("keeps the graph valid after undo", () => { ... });
```

- [ ] **Step 2: Redを確認する** — module解決エラー。
- [ ] **Step 3: 実装する。**
- [ ] **Step 4: Greenを確認し、分岐点保護の配線を外すと該当試験だけが落ちることを確認する。**
- [ ] **Step 5: commit**

---

## Task 3: 枝分かれGraphの生成

**Files:**
- Modify: `src/domain/stroke/stroke-graph-builder.ts`
- Modify: `tests/unit/stroke-graph-builder.test.ts`

**Interfaces:**
- Consumes: Task 1 の `detectRetrace`、Task 2 の Graph編集
- Produces: `buildGraphFromStroke` が木を返す（既存シグネチャのまま）

**仕様**

1. 戻り線spanで点列を run へ分ける。run 0 は `[0, span0.start]`、run k は `[span_{k-1}.end, span_k.start]`（最後は末尾まで）。
2. run 0 を今までどおり鎖として節点化する。
3. run k は `points[span_{k-1}.branchIndex]` に最も近い既存Nodeへ接続する。距離が `minEdgeLength / 2` を超えるなら、その位置で既存Edgeを分割して分岐Nodeを作る。
4. Graph全体へ `splitLongGraphEdges` → `mergeShortGraphEdges` を適用する。
5. 骨数上限・validation は既存のまま。

- [ ] **Step 1: 失敗する試験を書く**

```ts
it("builds a branch from a stroke that goes back on itself", () => {
  const result = expectOk(build(yBranchStroke()));
  const degrees = degreeOf(result.graph);

  expect(Math.max(...degrees.values())).toBe(3);
  expect(result.graph.edges.length).toBeGreaterThanOrEqual(3);
});

it("keeps a stroke without a retrace as a chain", () => {
  const result = expectOk(build(zigzagStroke()));
  expect(Math.max(...degreeOf(result.graph).values())).toBe(2);
});
```

- [ ] **Step 2: Redを確認する** — 現状は鎖しか作らないので最大次数2。
- [ ] **Step 3: 実装する。**
- [ ] **Step 4: Greenを確認し、`detectRetrace` の呼び出しを外すと枝の試験だけが落ちることを確認する。**
- [ ] **Step 5: commit**

---

## Task 4: 人型相当とUndo、進化loopの完走

**Files:**
- Modify: `tests/fixtures/strokes.ts`（人型fixture）
- Modify: `tests/unit/stroke-graph-builder.test.ts`
- Modify: `tests/integration/stroke-to-evolution.test.ts`

- [ ] **Step 1: 人型相当のfixtureと試験を足す**（胴 → 戻って左腕 → 戻って右腕 → 戻って脚）。次数3以上のNodeが2つ以上できること。
- [ ] **Step 2: 枝分かれGraphが `buildSkeletonPlan` で (次数−1) 個のJointになることを確認する。**
- [ ] **Step 3: 枝分かれGraphで `runEvolution` が完走し、invalid 0 件であることを確認する。**
- [ ] **Step 4: Undo後もGraphが有効で、同じ入力をやり直すと同じGraphになることを確認する。**
- [ ] **Step 5: `npm run verify` と `npm run typecheck`。**
- [ ] **Step 6: commit**

---

## Task 5: 検証記録

**Files:**
- Create: `docs/18-m5-branching-validation.md`
- Modify: `docs/README.md`、`docs/12-development-plan.md`、`docs/13-milestone-quality-and-decision-gates.md`、`docs/04-stroke-to-graph.md`、`CLAUDE.md`

- [ ] **Step 1: docs/13 §8 の9項目（commit、環境、受入条件ごとの合否、command、fixture、性能、自動試験、手動確認、持ち越し）を満たす記録を書く。**
- [ ] **Step 2: 判断ゲート（閉ループ・自己交差・最大Node次数）の現状と、人の決定が必要な点を明記する。**
- [ ] **Step 3: commit**

---

## Self-Review

- docs/12 §9 の受入条件8項目すべてにタスクが対応しているか: Y字/人型 → Task 4、近接・交差・戻りの区別 → Task 1、Undo → Task 2/4、上限違反の説明 → 既存validation + Task 3、閉ループ拒否 → 既存、閉ループ実験 → **非対象（人の決定）**、進化loop完走 → Task 4、verify + docs → Task 5。
- 後のタスクで使う型と関数名が前のタスクで定義されているか: `RetraceSpan`（Task 1）→ Task 3、`splitLongGraphEdges`/`mergeShortGraphEdges`（Task 2）→ Task 3。
