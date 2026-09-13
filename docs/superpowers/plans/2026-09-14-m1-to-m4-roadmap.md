# M1〜M4 実装ロードマップ

> **For agentic workers:** 各マイルストーンの詳細計画は同ディレクトリの `2026-09-14-mN-*.md` にあります。実装は必ず `superpowers:test-driven-development` に従い、Red → 失敗理由確認 → Green → refactor → 配線切断証明 → commit の順で進めます。

**Goal:** 一筆入力から生成した骨格を、複数個体・遺伝的アルゴリズムで学習させる基盤をM4まで構築する。

**Spec:** `docs/12-development-plan.md`（受入条件）、`docs/13-milestone-quality-and-decision-gates.md`（完了判定）、`docs/06-architecture.md`（層の境界）

## Global Constraints

すべてのタスクに以下が暗黙に含まれます。

- Node.js >= 24.0.0 / npm 11.4.2。依存追加は `package-lock.json` を更新し `npm ci` で再現可能にする。
- Phaser 4.2.1 / Phaser Box2D 1.1.0 / TypeScript 7.0.2 / Vite 8.2.2 / Vitest 5.0.0（既存版数を勝手に上げない）。
- Box2D の import は `phaser-box2d/dist/PhaserBox2D.js` のみ。型は `src/phaser-box2d.d.ts` へ追記する（D-007）。
- Box2D固有ID（`b2BodyId` 等）を `src/domain/` へ漏らさない。domain は純粋TypeScriptで、Phaser も Box2D も import しない。
- domain で `Math.random()` を使わない。乱数は注入した Seed付き generator のみ。
- 相対 import には `.ts` 拡張子を付ける（`allowImportingTsExtensions`）。
- テストは Phaser を起動せず Node 環境（`vitest` の `environment: "node"`）で完走すること。
- 各タスクは `npm run verify`（test + typecheck + build）が通った状態で commit する。
- **push はしない**（明示依頼があるまで）。docs/13 §9。
- 受入条件の数値は測定開始前に固定し、結果を見てから緩めない。

## マイルストーンの並び

```text
M1 Simulation基盤      … CreatureGraph → Body/Joint → EpisodeRunner → cleanup契約
M2 Population評価と性能 … 1 World内レーン分離、Pop 1/8/32、表示と計算の分離、性能測定
M3 進化loop            … Seed付きPRNG、Genome、GA、Fitness、対照群比較、リプレイ
M4 単純な一筆入力       … Pointer取得、resampling、位相分割、Graph化、preview、UI接続
```

M1〜M3 は「物理と進化が成立するか」を一筆UIより先に判断するための順序です（docs/12 §12）。

## 各マイルストーンの成果物と完了証拠

| M | 主な新規モジュール | 完了証拠ドキュメント |
|---|---|---|
| M1 | `src/domain/creature/`, `src/simulation/skeleton-plan.ts`, `src/simulation/box2d/`, `src/simulation/episode-runner.ts`, `src/domain/run/run-record.ts` | `docs/14-m1-simulation-validation.md` |
| M2 | `src/simulation/population-runner.ts`, `src/simulation/lane-allocator.ts`, `bench/` | `docs/15-m2-population-performance.md` |
| M3 | `src/domain/evolution/`（rng, genome, fitness, selection, evolution-engine） | `docs/16-m3-evolution-validation.md` |
| M4 | `src/domain/stroke/`（resample, phase, graph-builder）, `src/game/input/` | `docs/17-m4-stroke-input-validation.md` |

各証拠ドキュメントには docs/13 §8 の9項目（対象commit、実行環境、受入条件ごとの合否、実行command、Seed/fixture、性能値、自動試験で確認したこと、手動で確認したこと、持ち越し）を書きます。

## マイルストーン間の判断ゲート

- **M2終了時**: Phaser Box2D を継続採用するか（Population 32 の実測後）。不成立なら Godot 再評価を**ユーザー判断**として提起する。
- **M3終了時**: 進化群が対照群を上回ったか。数値が改善しても世代変化を人が理解できない場合は M4 より先に Fitness/可視化を調整する。
- **M4終了時**: 単純な一筆入力だけで学習体験が成立するか。

判断ゲートは自動的に通過させず、結果を提示して人の確認を求めます（docs/13 §7）。

## 既知の技術制約（スパイクで確認済み・2026-09-14）

- `b2World_GetCounters()` は空実装のため資源数の取得に使えない。**代替**: `b2Body_IsValid` / `b2Joint_IsValid` と `b2World_OverlapAABB` による残存shape数の計測を使う。
- `CreateRevoluteJoint` は `referenceAngle` を設定しないため、曲がった骨格では初期joint角度が0にならない。**対策**: `b2DefaultRevoluteJointDef()` に `referenceAngle = angleB - angleA` を設定して `jointDef` として渡す。
- `CreateCapsule` は `width`/`height` を渡すと形状が `height + 2*radius` になる。**対策**: `center1`/`center2`/`radius` を明示して node間距離を正確に一致させる。
- 個体同士・自己の衝突は `categoryBits`/`maskBits`（生物 0x0001 / 地面 0x0002、生物のmaskは地面のみ）で構造的に排除する。
- shape の contact event は既定で無効。M2で「個体間contact 0件」を証明するには `enableContactEvents` を有効にして begin event の相手を検査する。
