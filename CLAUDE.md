# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクトの目的

公開ゲーム『一筆進化』の体験を参考にした、**Web向け独立実装の技術検証プロジェクト**です。原作のコード・アセット・非公開パラメータにはアクセスしておらず、内部設計はすべて独自案です。

体験の中心は「プレイヤーが一筆で骨格を描く → 同じ形の複数個体に異なる関節制御パラメータを与える → 数秒の物理シミュレーションで移動能力を評価する → GAで世代交代する」。**形態は進化させず、関節の動かし方（controller）だけを進化させます**（D-003）。

現在地点は **M6（体験統合）まで技術検証済み**。描く → `CreatureGraph` へ変換（なぞって戻ると枝分かれ）→ 1 World内のレーンで複数個体を評価 → GAで世代交代 → 世代を並べて観察 → 描き直し、までを **`index.html`（製品画面）だけで完走できます**。次工程は **M7: 安定化と公開判断** です。

**人が行う確認が4件残っています**（`npm run dev` 後にブラウザで開く）:

| 何を | どこで | 記録先 |
|---|---|---|
| p95 frame time の計測 | `/bench/frame-time.html` | `docs/15` §8 |
| 世代変化を視認できるか | `/bench/replay.html` | `docs/16` §8 |
| Pointer / キーボード操作 | `/bench/stroke-input.html` | `docs/17` §8 |
| 枝分かれとCtrl+ZのUndo | `/bench/stroke-input.html` | `docs/18` §10 |
| **製品画面の体験（M6判断ゲート）** | `/` | `docs/19` §8 |

進捗は `docs/README.md`、実装計画は `docs/superpowers/plans/` を参照。

## コマンド

Node.js 24以上 / npm 11以上が必要です（`node_modules` 未作成なら最初に `npm ci`）。

```bash
npm ci              # lockfile通りの再現インストール
npm run dev         # http://127.0.0.1:5173/ が製品画面（strictPort）。開発ページは /bench/*.html
npm run test        # vitest run（環境は node、tests/**/*.test.ts）
npm run test:watch
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + vite build
npm run verify      # test + build。マイルストーン完了判定の必須ゲート
npm run bench       # Population 1/8/32 の throughput（headless）
npm run experiment  # 5 Seed × 50世代の進化判定実験（約70秒）
```

**`npm run test` は型検査をしません。** 実装を変えたら必ず `npm run typecheck` も回してください（vitest は型エラーを素通しします）。

単一テスト実行:

```bash
npx vitest run tests/unit/joint-controller.test.ts
npx vitest run tests/contract/            # 層まるごと
npx vitest run -t "applies derivative damping"
```

テストは Phaser を起動せず Node 上で動きます。物理 rig のテストも headless で実行できるため、**Box2D を使うコードは Phaser Scene から分離したままにしてください**。

## アーキテクチャ

### 層の境界（最重要・docs/06）

```text
game / bench ページ  … 入力・描画・UIのadapterのみ
  ↓ commands
src/app/             … use case（GAと物理評価の結線）
  ↓
src/domain/          … 純粋TypeScript。stroke / creature / control / evolution / run
  ↓ src/simulation/ports/
src/simulation/box2d/ … Box2D adapter
```

守るべき不変条件:

- Phaser から直接 Box2D を叩かない。
- **Box2D固有ID（`b2BodyId` 等）を domain model へ漏らさない。** 隔離点は `src/simulation/box2d/` で、外へは `src/simulation/ports/` の型（`CreatureHandle`、`CreatureSnapshot` など数値だけ）を返します。
- 物理時間と描画時間を分ける（`FixedStepRunner` の accumulator）。描画個体数を変えても評価結果が変わってはいけません。
- **Populationのレーンは必ず地面の上に収まること。** `planLanes` の間隔は「骨格幅 + 12 m」なので、Population 32 では端が最大 ±446 m になります（最大骨格 1.2 m × 14本）。地面 (`groundHalfWidth` 1000 m) が足りないと外側の個体が落下し、前進量0のまま `completed` として世代に混ざります（過去にM2・M3の実測値を歪めました。docs/17 §11）。
- 乱数は注入可能な Seed付き generator のみ。**domain で `Math.random()` を使わない**。
- 保存・リプレイ形式には `schemaVersion` を持たせる。

`src/` は docs/06 §3 の構成へ移行済みです。未作成は `game/scenes` だけで、製品画面の描画はCanvas 2D（`game/rendering`）で足りています。Phaserを読み込むのは P0デモのみです。

### 現在のモジュール

| ファイル | 役割 |
|---|---|
| `src/domain/creature/creature-graph.ts` | `CreatureGraph` 型と `DEFAULT_GRAPH_LIMITS`、`ValidatedCreatureGraph` ブランド型 |
| `src/domain/creature/creature-graph-validation.ts` | 17種の不変条件を error code で返す。例外は投げない |
| `src/domain/creature/graph-hash.ts` | 宣言順に依存しない形のhash |
| `src/domain/creature/graph-edit.ts` | Graphの純粋な編集。Edge分割・短Edge統合（分岐点は残す）・Edge単位Undo |
| `src/domain/control/joint-controller.ts` | 角度誤差 → motor speed の PD制御。最短角度差を使い clamp する |
| `src/domain/control/joint-command-source.ts` | 関節指令の port。M3のGenomeがこれを実装する差し替え点 |
| `src/domain/run/run-record.ts` | `schemaVersion` 付き再現記録。未対応versionは理由付きで拒否 |
| `src/domain/evolution/` | Seed付き乱数、Genome、Fitness、選択/交叉/変異、世代交代（すべて純粋） |
| `src/domain/stroke/` | 一筆の点列 → `CreatureGraph` の変換パイプライン（純粋）。`stroke-retrace.ts` が戻り線＝枝分かれを判定する。長い線は拒否せず骨を粗くして収める（D-011） |
| `src/game/input/pointer-stroke-source.ts` | DOM Pointer/キーの薄いadapter。判定はdomain側 |
| `src/app/evolution-run.ts` | GAと物理評価を結ぶApplication層。対照群とリプレイもここ。`world` を渡せば作り直さない。`EvolutionRunner` で1世代ずつ進められる |
| `src/app/observation-session.ts` | 観察フェーズの物理資源。Worldは画面の寿命で1つ。学習へも同じWorldを渡す |
| `src/ui/app-state.ts` | 画面の状態と遷移。純粋。DOM・物理を知らない。学習中の操作禁止もここ |
| `src/game/rendering/scene-renderer.ts` | Canvas 2Dへ映すだけのadapter |
| `src/main.ts` / `index.html` | 製品画面の配線とDOM |
| `src/p0-main.ts` / `bench/p0-demo.html` | P0技術デモ。Phaserを使うのはここだけ |
| `src/simulation/skeleton-plan.ts` | Graph → Bone/Joint の幾何記述（純粋）。Box2Dを知らない |
| `src/simulation/lane-allocator.ts` | Populationを1 World内のx方向レーンへ配置（純粋） |
| `src/simulation/episode-tracker.ts` | 1個体のepisode進行。worldのstepは呼び出し側が持つ |
| `src/simulation/episode-runner.ts` | 単体評価。tracker + 自前のworld step |
| `src/simulation/population-runner.ts` | 1 World / N個体の同時評価。描画個体数は結果に影響しない |
| `src/simulation/fixed-step-runner.ts` | wall time → 固定step変換。上限超過分は破棄して UI freeze を避ける |
| `src/simulation/ports/` | `CreatureHandle` / `SteppableWorld`。物理実装への依存はここで遮断する |
| `src/simulation/box2d/` | Box2D adapter。**Box2D APIを呼べるのはこのディレクトリだけ** |
| `src/simulation/p0-physics-rig.ts` | P0デモ専用の2ボーンrig（例外的にBox2Dを直接使う） |
| `src/p0-scene.ts` | Phaser Scene。P0デモの描画と DOM control の配線のみ |

`tests/unit/layering.test.ts` が「`src/domain/` からPhaser/Box2Dへ推移的にも到達しない」「Box2D importは adapter ディレクトリに限る」を機械的に検査します。新しいモジュールを足すときはこの試験を壊さないでください。

### Box2D で踏んだ落とし穴（M1〜M2で確認済み）

- `b2World_GetCounters()` は**空実装**。資源リーク検出は `b2World_OverlapAABB` の残存shape数で行う（D-008）。その際 query filter の category/mask を全ビットにしないと生物shapeに当たらない。
- `CreateRevoluteJoint` は `referenceAngle` を設定しない。曲がった骨格の初期joint角度を0にするには `b2DefaultRevoluteJointDef()` に設定して `jointDef` で渡す。
- `CreateCapsule` に `width`/`height` を渡すと全長が `height + 2*radius` になる。`center1`/`center2`/`radius` を明示する。
- 個体間・自己の衝突は `categoryBits`/`maskBits`（生物 0x0001 は地面 0x0002 としか衝突しない）で構造的に排除している。
- **`b2DestroyWorld` は world slot を解放しない**（`b2_worlds[i].inUse` が true のまま残る）。`B2_MAX_WORLDS` は32なので、**Worldを作り直す実装は33回目で `did not allocate a world` になります**。M4の開発ページで実際に踏みました（docs/17 §11）。Worldは必ず使い回してください。

### Phaser Box2D の取り扱い（D-007）

`phaser-box2d@1.1.0` は package root の entrypoint が実体と一致せず、型宣言も同梱されていません。したがって:

- import は **`phaser-box2d/dist/PhaserBox2D.js` に限定**する。
- 型は `src/phaser-box2d.d.ts` に、使う API だけを手書きで宣言する（新しい Box2D API を使うときはここへ追記）。
- vendor package 自体は変更しない。

`box2d-world.ts` と `p0-physics-rig.ts` は module読み込み時に `b2CreateWorldArray()` を呼ぶ副作用を持ちます。World は `destroy()` で必ず破棄してください（テストでは `afterEach` で回収）。

**World は作り直さず1つを再利用**し、Population は同一World内の分離レーンへ配置します（D-006 / 上記のslot解放漏れ回避）。M2で100世代×8個体の反復を確認済みです。

`runEvolution()` と `replayGenome()` は `world` を受け取れます。**渡した World は破棄されません**（破棄は呼び出し側の責任）。開発ページは学習・リプレイ・設定変更でWorldを作り直さず、個体だけを破棄します。

### TypeScript の癖

`strict` に加え `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax` / `allowImportingTsExtensions` が有効です。**相対importには `.ts` 拡張子を付けます**（例: `./p0-scene.ts`）。`skipLibCheck: true` は依存package の `.d.ts` と TypeScript 7 の組合せ由来で、意図的な境界です（docs/11 §7）。`src` と `tests` の strict 検査は有効のまま維持してください。

## 開発の進め方（docs/13 が規範）

- **TDD必須**: 受入条件を固定 → failing test → Redの失敗理由を確認 → 最小実装 → Green → refactor → **主要配線を外すと試験が落ちることの確認**（wiring-disconnection proof）。`tests/contract/p0-physics-rig.test.ts` が motor/limit を「無効化した対照」と比較しているのがその型です。過去に外した配線と落ちた試験は各検証記録（`docs/14`〜`docs/17`）に残しています。
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
- 層の責務とデータ境界と実ディレクトリ構成: `docs/06-architecture.md`
- Genome / Fitness / GAの設計と実装値: `docs/05-physics-controller-and-ga.md`
- 一筆入力→Graph変換（最大の実装難所）と実装値: `docs/04-stroke-to-graph.md`
- テスト層・決定性・性能指標: `docs/08-test-quality-and-performance.md`
- リスクと意思決定記録（D-001〜D-009）: `docs/09-risks-open-questions-and-decisions.md`
- 検証記録: `docs/11`（P0）、`docs/14`〜`docs/17`（M1〜M4）。**実測値・fixture・未確認事項はここが正**

実装と docs が矛盾した場合は、実際のコードと試験結果を確認したうえで docs を最新化します。
