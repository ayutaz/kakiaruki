# M4 単純な一筆入力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development`。Red → 失敗理由確認 → Green → refactor → 配線切断証明 → commit。

**Goal:** 直線・L字・ジグザグをPointerで描き、previewで確認し、そのGraphをM3の学習loopへ渡せるようにする。

**Architecture:** 変換パイプラインを純粋関数の連なりとして `src/domain/stroke/` に置く。DOM Pointerイベントは `src/game/input/` の薄いadapterで受け、domain には `{x, y, time}` の平面データしか渡さない。UIは `bench/stroke-input.html` の開発ページで、描く→確定→学習→リプレイまでを通す。

**Tech Stack:** TypeScript 7, Vitest 5（依存追加なし）

**Spec:** `docs/12-development-plan.md` §8、`docs/04-stroke-to-graph.md`

## Global Constraints

ロードマップの Global Constraints を継承。M4で特に効くもの:

- `src/domain/` は Phaser も Box2D も DOM も import しない。
- **RDP簡略化を全点列へ先に適用しない**（docs/04 §3）。位相を分割してから各Edge内部にだけ適用する。
- 上限を超えた入力を黙って別形状へ変えない。どの制約に触れたかを理由付きで返す。
- 不正入力は例外で全体を壊さず validation error にする。

## M4の範囲（docs/12 §8 非ゴール）

| 扱い | 形状 |
|---|---|
| **対応** | 直線、L字、ジグザグ、緩やかな曲線 |
| **理由付きで拒否** | 自己交差、閉ループ、戻り線（M5で対応） |
| **理由付きで拒否** | 短すぎる線、点が少なすぎる線、範囲外、上限超過 |

## 事前に固定する受入閾値

| 指標 | 閾値 |
|---|---|
| event頻度の非依存性 | 同一軌跡を1x / 3x / 10x の密度で入力して、Node数・Edge数が一致し、対応するNode座標が **0.05 m 以内**で一致 |
| ゼロ長Edge | **0本**（最小骨長未満のEdgeを生成しない） |
| preview と物理の対応 | preview の Node数・Edge数 = `SkeletonPlan` の joint数+1・bone数 |
| 学習接続 | 描いたGraphで `runEvolution` が規定世代数を完走する |

## File Structure

```text
src/domain/stroke/
  stroke-point.ts          新規: StrokePoint と平面ユーティリティ
  stroke-recorder.ts       新規: raw点列の記録（最小距離、上限、有限性）
  stroke-normalize.ts      新規: 画面座標 -> ワールド座標、等間隔resampling
  stroke-topology.ts       新規: 折れ曲がり検出、自己交差・閉ループ検出
  stroke-simplify.ts       新規: Edge内部だけのRDP
  stroke-graph-builder.ts  新規: パイプライン全体と StrokeGraphResult
src/game/input/
  pointer-stroke-source.ts 新規: DOM Pointerイベント -> StrokeRecorder の薄いadapter
bench/
  stroke-input.html        新規: 描く -> 確定 -> 学習 -> リプレイ の開発ページ
  stroke-input.ts          新規
tests/
  fixtures/strokes.ts          新規: 代表stroke fixture
  unit/stroke-recorder.test.ts
  unit/stroke-normalize.test.ts
  unit/stroke-topology.test.ts
  unit/stroke-graph-builder.test.ts
  unit/pointer-stroke-source.test.ts
  integration/stroke-to-evolution.test.ts
```

## 受入条件とタスクの対応

| 受入条件 | 担当タスク |
|---|---|
| 直線、L字、ジグザグ、短すぎる線、重複点をfixtureで検証する | Task 2, 5 |
| 入力event頻度が異なっても同等のGraphを得る | Task 5 |
| ゼロ長Edge、参照切れNode、上限超過を生成しない | Task 5 |
| 不正入力は拒否理由と直し方を画面へ表示する | Task 5, 7 |
| previewのNode／Edge数とBody／Joint数が対応する | Task 6 |
| 描いた単純GraphでM3の進化loopを開始・停止・再実行できる | Task 6, 7 |
| keyboardとpointerの基本操作をbrowser testで確認する | Task 4（自動）+ Task 7（人の確認） |
| `npm run verify` 成功 + 入力fixture一覧をdocsへ | Task 8 |

---

### Task 1: StrokeRecorder

**Files:** `src/domain/stroke/stroke-point.ts`, `src/domain/stroke/stroke-recorder.ts`, `tests/unit/stroke-recorder.test.ts`

```ts
export interface StrokePoint { readonly x: number; readonly y: number; readonly time: number }
export interface StrokeRecorderOptions {
  readonly minPointDistance: number;   // 画面px。既定 3
  readonly maxPoints: number;          // 既定 4000
  readonly maxDurationMs: number;      // 既定 30000
  readonly bounds: { readonly width: number; readonly height: number };
}
export type StrokeRecorderStatus = "idle" | "drawing" | "finished" | "cancelled";
export class StrokeRecorder {
  constructor(options: Partial<StrokeRecorderOptions> & { bounds: ... });
  get status(): StrokeRecorderStatus;
  get points(): readonly StrokePoint[];
  begin(point: StrokePoint): void;
  /** 記録したら true。間引き・範囲外・非有限は false。 */
  extend(point: StrokePoint): boolean;
  finish(): readonly StrokePoint[];
  cancel(): void;
  reset(): void;
}
```

試験: 最小距離未満の点を捨てる、非有限を捨てる、範囲外をclampせず捨てる、上限点数で打ち切る、`begin`前の`extend`は無視、`finish`後の`extend`は無視、cancelで破棄、同一点の連打で点が増えない。

- [ ] Red → Green → commit

---

### Task 2: 正規化と等間隔resampling

**Files:** `src/domain/stroke/stroke-normalize.ts`, `tests/fixtures/strokes.ts`, `tests/unit/stroke-normalize.test.ts`

```ts
export interface ViewportSize { readonly width: number; readonly height: number }
export interface NormalizeOptions {
  /** 画面短辺に対応させるワールド長 [m]。既定 6。 */
  readonly worldShortSide: number;
}
/** 画面座標(yは下向き)をワールド座標(yは上向き、原点は描線の重心)へ移す。 */
export function normalizeStroke(
  points: readonly StrokePoint[], viewport: ViewportSize, options?: Partial<NormalizeOptions>
): readonly Vector2[];
/** 等間隔re-sampling。形状は保ったまま点密度だけを揃える。 */
export function resampleByDistance(points: readonly Vector2[], spacing: number): readonly Vector2[];
export function polylineLength(points: readonly Vector2[]): number;
```

fixture（画面座標、640x480想定）: `straightStroke` / `lShapeStroke` / `zigzagStroke` / `curveStroke` / `tooShortStroke` / `repeatedPointStroke` / `selfIntersectingStroke` / `closedLoopStroke`、および各strokeを1x/3x/10x密度で生成するヘルパ。

試験: 重心が原点、短辺が `worldShortSide` に収まる、y軸が反転する、resampling後の間隔が一定（端点を除き誤差1e-9）、始点と終点が保存される、全長がresample前後でほぼ一致、spacing 0 は例外。

- [ ] Red → Green → commit

---

### Task 3: 位相検出（折れ曲がり・自己交差・閉ループ）

**Files:** `src/domain/stroke/stroke-topology.ts`, `src/domain/stroke/stroke-simplify.ts`, `tests/unit/stroke-topology.test.ts`

```ts
/** 進行方向が minTurnRadians 以上変わる点のindex。連続する候補は最も鋭い1点へまとめる。 */
export function detectCorners(
  points: readonly Vector2[], minTurnRadians: number, windowSize?: number
): readonly number[];
export function hasSelfIntersection(points: readonly Vector2[], ignoreSpan?: number): boolean;
export function isClosedLoop(points: readonly Vector2[], closeDistance: number): boolean;
/** Edge内部だけに適用するRDP。端点は必ず残す。 */
export function simplifySegment(points: readonly Vector2[], tolerance: number): readonly Vector2[];
```

試験: 直線でcornerが出ない、L字で1つ、ジグザグで本数どおり、緩い曲線では閾値以下なら出ない、隣接する候補が1つにまとまる、自己交差する線でtrue・しない線でfalse、隣接segment同士は交差扱いしない、閉ループ判定、RDPが端点を残し許容誤差内に収める。

- [ ] Red → Green → 配線切断証明（`detectCorners` の角度判定を常にtrueにするとL字/直線の試験が失敗）→ commit

---

### Task 4: Pointer adapter

**Files:** `src/game/input/pointer-stroke-source.ts`, `tests/unit/pointer-stroke-source.test.ts`

```ts
export interface StrokeInputTarget {
  addEventListener(type: string, listener: (event: never) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: never) => void): void;
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}
export interface StrokeInputHandlers {
  onChange?(points: readonly StrokePoint[]): void;
  onFinish?(points: readonly StrokePoint[]): void;
  onCancel?(): void;
}
export interface StrokeInputBinding { dispose(): void }
export function bindPointerStroke(
  target: StrokeInputTarget, recorder: StrokeRecorder, handlers?: StrokeInputHandlers
): StrokeInputBinding;
/** Ctrl+Z / Backspace / Escape / Enter を意味のあるコマンドへ写す。 */
export type StrokeCommand = "undo" | "clear" | "cancel" | "confirm" | null;
export function keyToStrokeCommand(event: {
  key: string; ctrlKey: boolean; metaKey: boolean;
}): StrokeCommand;
```

DOMを持ち込まずに済むよう、テストは最小のfake targetを使う。`pointerdown` で capture、`pointermove` で記録、`pointerup`/`pointercancel` で確定・破棄。座標は `getBoundingClientRect` を引いて要素ローカルへ直す。

試験: down→move×n→up で `onFinish` が点列を返す、downなしのmoveは無視、pointercancelで `onCancel`、`dispose` でlistenerが外れる、capture APIが無い環境でも動く、キー写像（Ctrl+Z/Cmd+Z→undo、Backspace→clear、Escape→cancel、Enter→confirm、その他→null）。

- [ ] Red → Green → commit

---

### Task 5: StrokeGraphBuilder

**Files:** `src/domain/stroke/stroke-graph-builder.ts`, `tests/unit/stroke-graph-builder.test.ts`

```ts
export type StrokeErrorCode =
  | "too-few-points" | "stroke-too-short" | "self-intersecting"
  | "closed-loop" | "too-many-edges" | "graph-invalid";
export interface StrokeError {
  readonly code: StrokeErrorCode;
  readonly message: string;   // 日本語。何がどう悪く、どう直すか。
}
export interface StrokePreview {
  readonly nodes: readonly { readonly id: string; readonly position: Vector2 }[];
  readonly edges: readonly { readonly id: string; readonly a: Vector2; readonly b: Vector2 }[];
}
export interface StrokeGraphOptions {
  readonly viewport: ViewportSize;
  readonly worldShortSide: number;
  readonly resampleSpacing: number;      // m。既定 0.12
  readonly cornerTurnRadians: number;    // 既定 0.5
  readonly simplifyTolerance: number;    // m。既定 0.08
  readonly minEdgeLength: number;        // 既定 0.35
  readonly maxEdgeLength: number;        // 既定 1.2
  readonly maxEdgeCount: number;         // 既定 10
  readonly boneRadius: number;           // 既定 0.11
  readonly closeDistance: number;        // 既定 0.25
}
export type StrokeGraphResult =
  | { readonly ok: true; readonly graph: CreatureGraph; readonly preview: StrokePreview }
  | { readonly ok: false; readonly errors: readonly StrokeError[] };
export function buildGraphFromStroke(
  points: readonly StrokePoint[], options: Partial<StrokeGraphOptions> & { viewport: ViewportSize }
): StrokeGraphResult;
```

パイプライン: normalize → resample → 自己交差/閉ループ判定（該当なら拒否）→ corner検出 → segmentごとにRDP → 節点列を作る → 長すぎるEdgeを分割 → 短すぎるEdgeを隣へ統合 → Edge数上限チェック → `CreatureGraph` 化 → `validateCreatureGraph` で最終検証。

試験: 直線が1 Edge、L字が2 Edge、ジグザグが本数どおり、点が少なすぎる/短すぎる/自己交差/閉ループを理由付きで拒否、ゼロ長Edgeを作らない、Edge数が上限内、`validateCreatureGraph` を必ず通る、1x/3x/10x密度で同等のGraphになる、同一入力で同一出力、エラーメッセージが10文字以上で直し方を含む。

- [ ] Red → Green → 配線切断証明（短Edge統合を外すと「ゼロ長Edgeを作らない」が失敗）→ commit

---

### Task 6: 描いたGraphから学習まで

**Files:** `tests/integration/stroke-to-evolution.test.ts`

試験:
- fixtureのL字strokeから作ったGraphで `buildSkeletonPlan` を作ると、**preview の Edge数 = bone数**、**preview の Node数 − 1 = joint数**。
- 同じGraphで `runEvolution`（少世代）が完走し、`bestEver` が得られる。
- 同じGraphで2回Runして結果が一致する（停止・再実行の再現性）。
- ジグザグstrokeでも同様に完走する。
- 拒否されたstrokeは学習へ渡らない（`ok: false` のまま）。

- [ ] Red → Green → commit

---

### Task 7: 開発ページ（描く→確定→学習→リプレイ）

**Files:** `bench/stroke-input.html`, `bench/stroke-input.ts`

- Pointerで描く。描線をリアルタイム表示。
- 離すとpreview（Node・Edge）を重ねて表示。拒否されたら**理由と直し方**を表示。
- 「この形で学習する」で `runEvolution` を実行し、世代統計を表示。
- 学習後、世代0ベストと選んだ世代ベストを並べて再生。
- Ctrl+Z / Backspace / Escape / Enter を `keyToStrokeCommand` 経由で処理。

ブラウザでの実操作確認は**人が行う**。自動E2Eフレームワークはこのリポジトリに無いため、導入の要否はユーザー判断として提起する。

- [ ] Step 1: ページを作り `npm run dev` で開けることを確認 → commit

---

### Task 8: M4検証記録

**Files:** `docs/17-m4-stroke-input-validation.md`、`docs/README.md`、`docs/09-...md`（R-01/R-02更新）

docs/13 §8 の9項目。fixture一覧と各fixtureの期待Graph、event頻度非依存の実測差、拒否理由の一覧、人が確認する手順、E2E framework未導入の扱いを記録する。

- [ ] Step 1: `npm run verify` の結果を記録 → commit

## Self-Review

- **Spec coverage:** docs/12 §8 の受入条件8項目すべてにタスクを割り当て済み。非ゴール（戻り線の枝分かれ、任意の自己交差、閉ループ、完成版Undo）は「理由付きで拒否」として扱い、対応はM5へ送る。
- **Placeholder scan:** 各タスクに完全な型定義と検証内容を記載。閾値は測定前に数値で固定した。
- **Type consistency:** `StrokePoint` はTask 1、`ViewportSize` はTask 2、`detectCorners`/`simplifySegment` はTask 3、`StrokeRecorder` はTask 1 で定義しTask 4が消費、`StrokeGraphResult`/`StrokePreview` はTask 5 で定義しTask 6・7が消費する。`CreatureGraph` / `Vector2` / `buildSkeletonPlan` / `runEvolution` はM1〜M3の既存名をそのまま使う。
