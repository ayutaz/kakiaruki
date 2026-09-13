# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクトの目的

公開ゲーム『一筆進化』の体験を参考にした、**Web向け独立実装の技術検証プロジェクト**です。原作のコード・アセット・非公開パラメータにはアクセスしておらず、内部設計はすべて独自案です。

体験の中心は「プレイヤーが一筆で骨格を描く → 同じ形の複数個体に異なる関節制御パラメータを与える → 数秒の物理シミュレーションで移動能力を評価する → GAで世代交代する」。**形態は進化させず、関節の動かし方（controller）だけを進化させます**（D-003）。

現在地点は **M0（P0技術スパイク）完了**。実装済みなのは 2 ボーン + Revolute Joint の最小物理モデルと操作UIのみで、一筆入力・複数個体・GA はまだ存在しません。次工程は **M1: Simulation基盤**（4〜6ボーンの `CreatureGraph`、validation、Body/Joint生成、`EpisodeRunner`、cleanup契約）です。

## コマンド

Node.js 24以上 / npm 11以上が必要です（`node_modules` 未作成なら最初に `npm ci`）。

```bash
npm ci              # lockfile通りの再現インストール
npm run dev         # http://127.0.0.1:5173/ （strictPort）
npm run test        # vitest run（環境は node、tests/**/*.test.ts）
npm run test:watch
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + vite build
npm run verify      # test + build。マイルストーン完了判定の必須ゲート
```

単一テスト実行:

```bash
npx vitest run tests/joint-controller.test.ts
npx vitest run -t "applies derivative damping"
```

テストは Phaser を起動せず Node 上で動きます。物理 rig のテストも headless で実行できるため、**Box2D を使うコードは Phaser Scene から分離したままにしてください**。

## アーキテクチャ

### 層の境界（最重要・docs/06）

```text
Phaser UI / Scene   … 入力・描画・UIのadapterのみ
  ↓ commands
Application         … use case / 状態遷移
  ↓
Stroke domain (CreatureGraph) / Evolution domain (Genome, GA, Fitness)  … 純粋TypeScript
  ↓ Simulation port
Box2D adapter
```

守るべき不変条件:

- Phaser から直接 Box2D を叩かない。
- **Box2D固有ID（`b2BodyId` 等）を domain model へ漏らさない。** 現状は `src/simulation/p0-physics-rig.ts` が唯一の隔離点で、外へは `BodySnapshot` などの数値だけを返します。
- 物理時間と描画時間を分ける（`FixedStepRunner` の accumulator）。描画個体数を変えても評価結果が変わってはいけません。
- 乱数は注入可能な Seed付き generator のみ。**domain で `Math.random()` を使わない**。
- 保存・リプレイ形式には `schemaVersion` を持たせる。

`src/` は現在 P0 用の平坦な構成です。P1以降は docs/06 の `app/ domain/ simulation/ game/ ui/ shared/` 構成へ段階的に移行します。

### 現在のモジュール

| ファイル | 役割 |
|---|---|
| `src/simulation/fixed-step-runner.ts` | wall time → 固定step変換。上限超過分は破棄して UI freeze を避ける |
| `src/simulation/joint-controller.ts` | 角度誤差 → motor speed の PD制御。最短角度差を使い clamp する |
| `src/simulation/p0-physics-rig.ts` | Box2D World / Body / Joint の生成・step・破棄。Box2D APIはここだけ |
| `src/p0-scene.ts` | Phaser Scene。描画と DOM control の配線のみ |
| `src/p0-control-state.ts` | 「初期状態へ戻す」の単一定義（姿勢だけ戻る不整合の再発防止） |

### Phaser Box2D の取り扱い（D-007）

`phaser-box2d@1.1.0` は package root の entrypoint が実体と一致せず、型宣言も同梱されていません。したがって:

- import は **`phaser-box2d/dist/PhaserBox2D.js` に限定**する。
- 型は `src/phaser-box2d.d.ts` に、使う API だけを手書きで宣言する（新しい Box2D API を使うときはここへ追記）。
- vendor package 自体は変更しない。

`p0-physics-rig.ts` は module読み込み時に `b2CreateWorldArray()` を呼ぶ副作用を持ちます。World は `destroy()` で必ず破棄してください（テストでは `afterEach` で回収）。

P1以降は **World を作り直さず1つを再利用**し、Population は同一World内の分離レーンへ配置します（D-006 / 複数World・再作成の既知Issue回避）。

### TypeScript の癖

`strict` に加え `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax` / `allowImportingTsExtensions` が有効です。**相対importには `.ts` 拡張子を付けます**（例: `./p0-scene.ts`）。`skipLibCheck: true` は依存package の `.d.ts` と TypeScript 7 の組合せ由来で、意図的な境界です（docs/11 §7）。`src` と `tests` の strict 検査は有効のまま維持してください。

## 開発の進め方（docs/13 が規範）

- **TDD必須**: 受入条件を固定 → failing test → Redの失敗理由を確認 → 最小実装 → Green → refactor → **主要配線を外すと試験が落ちることの確認**（wiring-disconnection proof）。既存の `p0-physics-rig.test.ts` が motor/limit を「無効化した対照」と比較しているのがその型です。
- **受入条件の数値は測定開始前に固定**します。結果を見た後に閾値を緩めない。変更する場合は元の結果・理由・影響・再試験結果を残します。
- 「実装済み」「技術検証済み」「手動確認待ち」「完了」を混同しない。`技術検証済み` は体験品質・公開可能を意味しません。
- マイルストーン完了時は `docs/` に検証記録を1ファイル追加し、`docs/README.md` の索引を更新します（例: `docs/14-m1-simulation-validation.md`）。記録には commit/hash、実行環境、受入条件ごとの合否、Seed、性能値、未確認事項を含めます。
- 未完了・未確認・例外・既知の制約を隠さない。docs の状態ラベル（**確認済み / 決定済み / 提案 / 推定 / 未確認**）を使い分けます。
- **commit と push は別操作**として扱い、明示的な依頼があるまで push しません。

### 人の承認が必要（自動で進めない）

Godot等へのengine切替、GA以外への変更、閉ループのMVP必須化、mobile/Safari/オンライン保存の対象追加、製品名・アート・原作への言及方法、アカウント/ランキング/課金/外部API、外部hostへのdeployと一般公開。

### 知的財産の境界

出荷時の名称・ロゴ・アセットは独自のものにし、原作の画像・音・文章・画面配置をコピーしない。「同じアルゴリズム」と断定せず「公開された体験を参考にした独自実装」と表現します。

## ドキュメント

`docs/README.md` が索引です。作業前に該当するものを読んでください。

- 実行計画とマイルストーン受入条件: `docs/12-development-plan.md`
- 完了判定・証拠・承認の運用: `docs/13-milestone-quality-and-decision-gates.md`
- 層の責務とデータ境界: `docs/06-architecture.md`
- Genome / Fitness / GAパラメータ案: `docs/05-physics-controller-and-ga.md`
- 一筆入力→Graph変換（最大の実装難所）: `docs/04-stroke-to-graph.md`
- P0実測と既知の制約: `docs/11-p0-technical-validation.md`
- リスクと意思決定記録（D-001〜D-007）: `docs/09-risks-open-questions-and-decisions.md`

実装と docs が矛盾した場合は、実際のコードと試験結果を確認したうえで docs を最新化します。
