# アーキテクチャとデータ境界

## 1. 設計原則

1. Phaserは入力・描画・UIのadapterとする。
2. StrokeGraph、Genome、GA、Fitnessを純粋なTypeScript領域に置く。
3. Box2D固有IDをdomain modelへ漏らさない。
4. 物理時間と描画時間を分ける。
5. 乱数は注入可能なSeed付きgeneratorだけを使う。
6. 保存・リプレイ形式にはschemaVersionを持たせる。
7. 描画個体数の変更が評価個体数やFitnessに影響しないようにする。

## 2. 論理構成

```text
Phaser UI / Scene
  | Pointer events, commands
  v
Application
  | use cases / state transitions
  +-------------------+
  v                   v
Stroke domain     Evolution domain
  | CreatureGraph     | Genome / GA / Fitness
  +---------+---------+
            v
      Simulation port
            v
      Box2D adapter
```

Phaserから直接Box2Dを操作せず、Application層のコマンドを通します。これにより、入力の単体テスト、headlessに近い物理試験、将来のGodot移植がしやすくなります。

## 3. ディレクトリ構成

M4時点の実構成です。当初のディレクトリ案から、実装に合わせて名前と粒度を調整しています。

```text
src/
  app/
    evolution-run.ts          GAと物理評価の結線、対照群、リプレイ、RunRecord生成
  domain/                     純粋TypeScript。Phaser / Box2D / DOM を import しない
    creature/                 CreatureGraph、validation、graph hash
    control/                  PD制御、JointCommandSource port と周期関数実装
    evolution/                Seed付き乱数、Genome、Fitness、選択・交叉・変異、世代交代
    stroke/                   一筆の点列 -> CreatureGraph の変換パイプライン
    run/                      schemaVersion付き RunRecord
  simulation/
    ports/                    CreatureHandle、SteppableWorld。物理実装への依存を遮断する
    box2d/                    Box2D adapter。Box2D APIを呼べるのはここだけ
    skeleton-plan.ts          Graph -> Bone/Joint の幾何記述（純粋）
    lane-allocator.ts         Populationのレーン配置（純粋）
    episode-tracker.ts        1個体のepisode進行。worldのstepは呼び出し側が持つ
    episode-runner.ts         単体評価（tracker + 自前のworld step）
    population-runner.ts      1 World / N個体の同時評価
    fixed-step-runner.ts      wall time -> 固定step
    p0-physics-rig.ts         P0デモ専用。例外的にBox2Dを直接使う
  game/
    input/                    DOM Pointer / キーの薄いadapter
  shared/
    vector2.ts
  main.ts, p0-scene.ts, p0-control-state.ts, style.css   P0デモ画面
  phaser-box2d.d.ts           vendorに無いTypeScript宣言（D-007）

tests/
  unit/          純粋ロジックと fake を使った境界試験
  contract/      Box2D adapterの契約試験
  integration/   Graph -> 物理 -> 評価 -> 進化 の通し試験
  fixtures/      CreatureGraph、stroke、fake CreatureHandle

bench/           開発用ページと計測スクリプト（製品UIではない）
```

未作成の層:

- `src/game/scenes/` `src/game/rendering/` `src/ui/`: M6の体験統合で作ります。現在の描画は `bench/` の開発ページがCanvas 2Dで行っています。
- `src/domain/replay/`: リプレイは `src/app/evolution-run.ts` の `replayGenome` と `RunRecord` で足りているため、独立モジュールにしていません。
- `tests/e2e/`: browser E2Eフレームワークが未導入のため存在しません（[M4検証結果](17-m4-stroke-input-validation.md) §8）。

### 層の依存を機械的に守る

`tests/unit/layering.test.ts` が次を検査します。新しいモジュールを追加するときはこの試験を壊さないでください。

- `src/domain/` のどのファイルからも、相対importを推移的に辿ってPhaser／Box2Dへ到達しない。
- `episode-runner.ts` / `skeleton-plan.ts` / `fixed-step-runner.ts` からもPhaser／Box2Dへ到達しない。
- `phaser-box2d` を import してよいのは `src/simulation/box2d/` と、P0デモ専用の `src/simulation/p0-physics-rig.ts` だけ。

## 4. 主要な責務

| Component | 責務 | 禁止する責務 |
|---|---|---|
| StrokeInputAdapter | PointerイベントをRawPointへ変換 | Graph判定、物理生成 |
| StrokeGraphBuilder | 点列を検証しGraphへ変換 | Phaser描画、Box2D API呼出し |
| CreatureValidator | 長さ・次数・連結性・上限の検証 | 自動で黙って仕様を変えること |
| GenomeFactory | 関節数に合うGenome生成 | 物理step |
| JointController | Genomeと観測値からmotor command生成 | GAの選択・交叉 |
| EvolutionEngine | 評価結果から次世代生成 | Phaser Scene操作 |
| FitnessEvaluator | 軌跡指標からFitness算出 | Body生成 |
| SimulationRunner | 固定step、episode、観測値の管理 | UI frame rateへの従属 |
| Box2DAdapter | Body／Jointの生成・破棄・step | ゲーム固有の進化判断 |
| ReplayStore | version付き再現情報の保存 | 原作データの取込み |

M4時点の実装対応:

| Component | 実装 |
|---|---|
| StrokeInputAdapter | `src/game/input/pointer-stroke-source.ts` |
| StrokeGraphBuilder | `src/domain/stroke/stroke-graph-builder.ts` |
| CreatureValidator | `src/domain/creature/creature-graph-validation.ts` |
| GenomeFactory | `src/domain/evolution/genome.ts` |
| JointController | `src/domain/control/joint-controller.ts`、`joint-command-source.ts` |
| EvolutionEngine | `src/domain/evolution/evolution-engine.ts`、`selection.ts` |
| FitnessEvaluator | `src/domain/evolution/fitness.ts` |
| SimulationRunner | `src/simulation/episode-tracker.ts`、`episode-runner.ts`、`population-runner.ts` |
| Box2DAdapter | `src/simulation/box2d/` |
| ReplayStore | `src/domain/run/run-record.ts`、`src/app/evolution-run.ts` の `replayGenome` |

## 5. 状態機械

```text
Drawing
  -> Validating
      -> Drawing (error / correction)
      -> Ready
Ready
  -> Training
Training
  -> Paused
  -> Replay
  -> Ready (stop)
Replay
  -> Training
  -> Drawing (redraw)
```

状態遷移を中央管理し、「学習中にGraphが書き換わる」「古いWorldへUIがアクセスする」といった競合を防ぎます。

**状態: 未実装（M6）。** M4時点の `bench/stroke-input.html` は、描く→変換→学習→リプレイを直列に実行するだけで、状態機械を持ちません。中央管理はM6の体験統合で実装します。

## 6. 複数個体の配置

複数Worldを個体ごとに作らず、1つのWorldを再利用します。**M2で実装・実測済み**です。

- 各個体を十分離れた仮想レーンへ配置する → `src/simulation/lane-allocator.ts`。**x方向**へ並べ、y方向には分けない（全個体が同じ地面高さになるように）。レーン間隔の既定は「骨格幅 + 12 m」。
- レーンごとに同一の地面条件を作る → 地面は幅400 mの単一の静的Body。
- 個体間の接触が起きない距離と境界を保証する → 距離に加えて `categoryBits`／`maskBits` で**構造的に**排除する。生物shapeは地面としか衝突しない。contact eventを分類して0件であることを検証済み。
- 表示時はworld座標をviewport座標へ写像し、選択した個体だけを描く → `PopulationRunner.snapshots(indexes)`。表示個体数0／1／8で評価結果が**完全一致**することを検証済み。
- 世代切替ではWorld自体を破棄せず、Jointを先に、Bodyを後に安全に破棄する → `CreatureHandle.destroy()`。100世代の反復後もshape数が基準値へ戻る。

この方針はPhaser Box2Dの複数WorldおよびWorld再作成に関する公開Issueの影響を避けるために採用しました。実測は [M2性能記録](15-m2-population-performance.md) を参照してください。

## 7. Worker化の将来境界

最初からWorker化はしません。M2の実測（Population 32 で実時間の44倍）からは、headlessの計算量に余裕があり現時点でWorker化の必要はありません。ブラウザ描画を含めた計測後に再判断します。

ただし次のmessage boundaryを保ちます。

```text
Main -> Worker
  StartRun { graph, parameters, seed }
  SetSpeed { multiplier }
  StopRun

Worker -> Main
  GenerationSummary
  RenderSnapshot
  RunCompleted
  SimulationError
```

Box2D IDやclass instanceではなく、構造化Clone可能な数値配列とplain objectだけを渡します。

## 8. 保存形式

M3で `schemaVersion: 1` として実装しました（`src/domain/run/run-record.ts`）。

```text
RunRecord
  schemaVersion      1
  createdAt          ISO 8601 文字列
  graph              CreatureGraph
  graphHash          宣言順に依存しない16桁hex
  seed               number
  episode            stepSeconds / subSteps / durationSeconds / maxDisplacement
  skeleton           joint設定（limit、torque）と body設定（density、friction、damping）
  runtimeVersions    phaser / phaserBox2d
  summary            steps / status / invalidReason / forwardProgress /
                     maxForwardProgress / motorEffort
```

`parseRunRecord` は、未対応の `schemaVersion` と壊れたJSONを**例外ではなく理由付きの失敗**として返します。

当初案の `bestGenome` と `evolutionParameters` はまだ含めていません。ベストGenomeは `runEvolution` の戻り値 `bestEver` で扱っており、保存形式へ含めるのはM6の保存・リプレイUI実装時に判断します。
