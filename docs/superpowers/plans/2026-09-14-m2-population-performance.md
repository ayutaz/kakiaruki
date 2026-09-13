# M2 Population評価と性能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development`。Red → 失敗理由確認 → Green → refactor → 配線切断証明 → commit。

**Goal:** 1つのWorld内に互いに干渉しない評価レーンを作り、Population 1／8／32を完走させ、throughputとUI応答性を再現可能な形で測定できるようにする。

**Architecture:** `EpisodeRunner` から per-creature の指令適用とmetrics収集を `EpisodeTracker` として抽出し、`PopulationRunner` が1つのWorldを1回stepするごとに全個体のtrackerを進める。レーン配置は純粋な `LaneAllocator` が決める。個体間の衝突は category/mask で構造的に排除し、contact eventで0件であることを証明する。描画用snapshotは要求された個体だけを返し、評価結果に影響しない。

**Tech Stack:** TypeScript 7, Vitest 5, Phaser Box2D 1.1.0

**Spec:** `docs/12-development-plan.md` §6、`docs/13-milestone-quality-and-decision-gates.md` §5

## Global Constraints

ロードマップの Global Constraints を継承。M2で特に効くもの:

- **Worldを世代ごとに作り直さない**（D-006）。Body／Jointだけを入れ替える。
- Box2D APIを呼べるのは `src/simulation/box2d/` だけ（`tests/unit/layering.test.ts` が検査）。
- 性能の閾値は測定開始前に固定し、結果を見てから緩めない。
- 実測していない性能は「未確認」と書く。推定値を確認済みとして扱わない。

## 事前に固定する受入閾値

| 指標 | 閾値 | 根拠 |
|---|---|---|
| Population 1／8／32 の完走 | 全個体が `completed` または理由付き `invalid` | docs/12 §6 |
| 個体間・隣接レーン間のcontact | **0件** | docs/12 §6 |
| 表示個体数0／1／8での結果差 | 重心x/y・motorEffortが**完全一致**（同一計算のため誤差0） | docs/12 §6 |
| 100世代相当のcleanup後のshape数 | baselineへ復帰し、**単調増加しない** | docs/12 §6 |
| Population 32 の throughput | **実時間相当以上**（32個体×6秒のepisodeを6秒以内に評価できる = 32×360 step / 6 s 以上） | docs/12 §6 |
| 記録する指標 | physics steps / wall second、episode wall time、p95 frame time | docs/12 §6 |

p95 frame time はブラウザ計測が必要。headlessのNode benchmarkでは測れないため、専用の計測ページを用意する。

## File Structure

```text
src/simulation/
  lane-allocator.ts              新規: Population index -> レーン原点（純粋）
  episode-tracker.ts             新規: EpisodeRunnerから抽出した per-creature 進行と metrics
  episode-runner.ts              変更: EpisodeTracker を使う薄いラッパへ
  population-runner.ts           新規: 1 World / N個体の同時評価
  box2d/
    box2d-world.ts               変更: contact event の集計を追加
    box2d-creature-factory.ts    変更: shape の contact event を有効化、shape category を公開

bench/
  population-benchmark.ts        新規: Node上のthroughput計測
  frame-time.html                新規: ブラウザのp95 frame time計測ページ
  frame-time.ts                  新規: 上記のスクリプト

tests/
  unit/lane-allocator.test.ts        新規
  unit/episode-tracker.test.ts       新規
  contract/creature-isolation.test.ts 新規: contact 0件の証明
  integration/population-runner.test.ts 新規: Pop 1/8/32、表示分離、決定性
  integration/population-lifecycle.test.ts 新規: 100世代相当の資源
```

## 受入条件とタスクの対応

| 受入条件 | 担当タスク |
|---|---|
| Population 1／8／32が同じepisode定義で完走する | Task 3, 4 |
| 個体間または隣接レーン間のcontactが0件である | Task 2 |
| 表示個体数0／1／8で各個体の結果が許容誤差内で一致する | Task 4 |
| 100世代相当の生成・cleanupでBody数、Joint数、heap使用量が継続増加しない | Task 5 |
| Population 32を実時間相当以上に進められる | Task 6 |
| p95 frame timeとphysics steps / wall secondを記録する | Task 6, 7 |
| `npm run verify` が成功し、M2性能記録をdocsへ追加する | Task 8 |

---

### Task 1: LaneAllocator

**Files:** Create `src/simulation/lane-allocator.ts`, `tests/unit/lane-allocator.test.ts`

**Interfaces:**

```ts
export interface LaneLayout {
  readonly laneWidth: number;
  readonly laneSpacing: number;   // レーン中心間の距離
}
export interface LaneAllocation {
  readonly index: number;
  readonly origin: Vector2;       // その個体のspawn原点に加算する平行移動
  readonly groupIndex: number;    // Box2Dのcollision group（負値で同一レーン内の衝突を抑止）
}
export function planLanes(
  populationSize: number,
  skeletonWidth: number,
  layout?: Partial<LaneLayout>
): readonly LaneAllocation[];
export function requiredLaneSpacing(skeletonWidth: number, margin: number): number;
```

レーンは **y方向** に並べない（重力があるため）。**x方向**へ十分離して並べる。個体は前進するため、レーン間隔は「骨格の幅 + episode中の最大移動距離 + margin」を満たす必要がある。M2では `laneSpacing` を明示設定にし、既定値は `skeletonWidth + 12` m とする。

- [ ] Step 1: 失敗テストを書く（レーン数、間隔、決定性、原点の対称性、population 0 の拒否、groupIndex の一意性）
- [ ] Step 2: `npx vitest run tests/unit/lane-allocator.test.ts` → FAIL（module未解決）
- [ ] Step 3: 最小実装
- [ ] Step 4: PASS を確認
- [ ] Step 5: `git commit -m "feat(simulation): add deterministic lane allocation for population evaluation"`

---

### Task 2: 個体間contactが0件であることの証明

**Files:** Modify `src/simulation/box2d/box2d-world.ts`, `src/simulation/box2d/box2d-creature-factory.ts`, `src/phaser-box2d.d.ts`。Create `tests/contract/creature-isolation.test.ts`

**Interfaces:**

```ts
export interface ContactSummary {
  readonly beginCount: number;
  readonly creatureToCreatureCount: number;
  readonly creatureToGroundCount: number;
}
// PhysicsWorld に追加
drainContactEvents(): ContactSummary;
```

実装: 生物shapeを作った直後に `b2Shape_EnableContactEvents(shapeId, true)` を呼ぶ。`drainContactEvents()` は `b2World_GetContactEvents(worldId)` の begin event について、両shapeの `b2Shape_GetFilter().categoryBits` を見て分類する。

この試験は「構造的に衝突しない」ことの**証明**であり、`maskBits` を `0xffff` に戻すと `creatureToCreatureCount > 0` になることを配線切断証明として確認する。

- [ ] Step 1: 8個体をレーン配置して600 step進め、`creatureToCreatureCount === 0` かつ `creatureToGroundCount > 0` を期待する失敗テストを書く
- [ ] Step 2: FAIL を確認（`drainContactEvents` 未実装）
- [ ] Step 3: 実装 → PASS
- [ ] Step 4: 配線切断証明（`maskBits` を全ビットにすると contact が発生する）
- [ ] Step 5: commit

---

### Task 3: EpisodeTracker の抽出（refactor + 新規試験）

**Files:** Create `src/simulation/episode-tracker.ts`, `tests/unit/episode-tracker.test.ts`。Modify `src/simulation/episode-runner.ts`

**Interfaces:**

```ts
export class EpisodeTracker {
  constructor(creature: CreatureHandle, commands: JointCommandSource, options: EpisodeOptions);
  get status(): EpisodeStatus;
  get stepCount(): number;
  /** worldをstepする「前」に呼ぶ。motor指令を書き込む。 */
  applyCommands(): void;
  /** worldをstepした「後」に呼ぶ。metrics更新と終了判定。続くなら true。 */
  observe(): boolean;
  result(): EpisodeResult;
}
```

`EpisodeRunner` は tracker + 自前のworld stepへ置き換える。**既存のM1試験がすべてGreenのままであること**をrefactorの合格条件とする。tracker単体の試験では fake の `CreatureHandle` を使い、Box2Dなしで停止条件（非有限・範囲外・step数）を検証する。

- [ ] Step 1: tracker の失敗テストを書く（fake creatureで non-finite / out-of-bounds / 正常完了）
- [ ] Step 2: FAIL を確認
- [ ] Step 3: 実装、`EpisodeRunner` を tracker 利用へ書き換え
- [ ] Step 4: `npm run test` で M1 の全試験がGreenのままであることを確認
- [ ] Step 5: commit

---

### Task 4: PopulationRunner

**Files:** Create `src/simulation/population-runner.ts`, `tests/integration/population-runner.test.ts`

**Interfaces:**

```ts
export interface PopulationMember {
  readonly commands: JointCommandSource;
}
export interface PopulationRunnerDependencies {
  readonly world: ShapeCountingWorld;
  readonly creatures: readonly CreatureHandle[];
  readonly members: readonly PopulationMember[];
  readonly options?: Partial<EpisodeOptions>;
}
export class PopulationRunner {
  constructor(dependencies: PopulationRunnerDependencies);
  get populationSize(): number;
  get stepCount(): number;
  step(): boolean;
  run(): readonly EpisodeResult[];
  /** 描画対象だけのsnapshot。評価には一切影響しない。 */
  snapshots(indexes: readonly number[]): readonly CreatureSnapshot[];
}
```

1 stepの順序: 全trackerの `applyCommands()` → `world.step()` 1回 → 全trackerの `observe()`。全trackerが終了したら false。

試験:
- Population 1／8／32 が完走し、結果配列の長さが一致する。
- 表示個体数 0／1／8（`snapshots()` の呼び出し数）を変えても、全個体の結果が**完全一致**する。
- 同一構成の再実行結果が一致する。
- 個体ごとに異なる `JointCommandSource` を与えると結果が異なる。
- `invalid` になった個体があってもRun全体は規定step数まで継続する。

- [ ] Step 1〜5: TDDサイクル + commit

---

### Task 5: 100世代相当の資源検証

**Files:** Create `tests/integration/population-lifecycle.test.ts`

Population 8 を 100 回、同一Worldで生成→短いepisode→cleanup し、各サイクル後のshape数がbaselineへ戻ること、サイクル間で単調増加しないことを検証する。heap については `process.memoryUsage().heapUsed` を10サイクルごとに記録し、**最後の1/3の平均が最初の1/3の平均の1.5倍を超えない**ことを閾値とする（GCの非決定性を考慮し、shape数を主指標、heapを補助指標とする）。

- [ ] Step 1〜5: TDDサイクル + commit

---

### Task 6: Node throughput benchmark

**Files:** Create `bench/population-benchmark.ts`。Modify `package.json`（`"bench": "tsx bench/population-benchmark.ts"` は使わず、`vite-node` も追加しない。**依存を増やさないため** `vitest run bench/...` 形式ではなく、`node --experimental-strip-types` で実行する）

実行: `npm run bench`

出力（JSONとテキスト）:
- Population 1／8／32 それぞれについて: 総step数、wall time、physics steps / wall second、episode wall time、実時間比（simulated seconds / wall seconds）。
- 実行環境（Node version、OS、CPU）。

閾値判定: Population 32 の実時間比が **1.0 以上**なら合格。

- [ ] Step 1: benchmark を書き、`npm run bench` が数値を出すことを確認
- [ ] Step 2: 3回実行して中央値を記録
- [ ] Step 3: commit

---

### Task 7: ブラウザ p95 frame time 計測ページ

**Files:** Create `bench/frame-time.html`, `bench/frame-time.ts`。Modify `vite.config.ts`（複数entryのbuildは不要。dev serverで `/bench/frame-time.html` を開く）

requestAnimationFrame ごとに `PopulationRunner` を実時間ぶん進め、frame time を記録して p50／p95／p99 と physics steps / wall second を画面へ表示する。Population と表示個体数を切り替えられるようにする。

**この計測は人がブラウザで実行する必要がある。** 自動試験の合格だけでM2を完了扱いにしない（docs/13 §3）。計測できるまで p95 frame time は「未確認」とする。

- [ ] Step 1: ページを作り、`npm run dev` で開けることを確認
- [ ] Step 2: 計測してdocsへ記録（人の実行が必要）
- [ ] Step 3: commit

---

### Task 8: M2性能記録

**Files:** Create `docs/15-m2-population-performance.md`。Modify `docs/README.md`, `docs/09-risks-open-questions-and-decisions.md`（R-04、R-06の状態更新）

docs/13 §8 の9項目を記録する。特に:
- 実行環境（電源状態、foreground/background、ブラウザversion）
- Population 1／8／32 の実測値
- p95 frame time（未計測なら「未確認」と明記）
- **判断ゲート**: Phaser Box2D を継続採用するか。閾値を満たさない場合は測定根拠を残し、最適化・Worker化・個体数変更・Godot再評価のどれを選ぶかを**ユーザー判断として提起する**。

- [ ] Step 1: `npm run verify` と `npm run bench` の結果を記録
- [ ] Step 2: docs を書いて commit

## Self-Review

- **Spec coverage:** docs/12 §6 の受入条件7項目すべてにタスクを割り当て済み。非ゴール（実測前のWorker導入、Population 64以上の保証、モバイル性能）はタスクに含めていない。
- **Placeholder scan:** 各タスクにインターフェース定義と検証内容を具体的に記載。閾値は測定前に数値で固定した。
- **Type consistency:** `EpisodeOptions` / `EpisodeResult` / `CreatureHandle` / `CreatureSnapshot` / `ShapeCountingWorld` はM1で定義済みの名前をそのまま使う。`EpisodeTracker` はTask 3で定義しTask 4で消費する。
