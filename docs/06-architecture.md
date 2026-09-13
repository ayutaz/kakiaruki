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

## 3. ディレクトリ案

P1以降へ段階的に移行する目標構成です。P0では技術成立を小さく検証するため、`src/simulation/` とPhaser Sceneを中心とした平坦な構成だけを作成しています。

```text
src/
  app/
    commands/
    state/
    services/
  domain/
    stroke/
    creature/
    evolution/
    replay/
  simulation/
    ports/
    box2d/
  game/
    scenes/
    rendering/
    input/
  ui/
  shared/

tests/
  unit/
  contract/
  integration/
  e2e/
  fixtures/
```

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

## 6. 複数個体の配置

P1では、複数Worldを個体ごとに作らず、1つのWorldを再利用します。

- 各個体を十分離れた仮想レーンへ配置する。
- レーンごとに同一の地面条件を作る。
- 個体間の接触が起きない距離と境界を保証する。
- 表示時はworld座標をviewport座標へ写像し、選択した個体だけを描く。
- 世代切替ではWorld自体を破棄せず、Jointを先に、Bodyを後に安全に破棄する。

この方針はPhaser Box2Dの複数WorldおよびWorld再作成に関する公開Issueの影響を避けるために採用しました。P0では単一Worldの最小モデルだけを確認済みであり、再利用と複数レーンの実測はP1で行います。

## 7. Worker化の将来境界

最初からWorker化はしません。ただし次のmessage boundaryを保ちます。

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

```text
RunRecord
  schemaVersion
  createdAt
  graph
  graphHash
  bestGenome
  seed
  simulationParameters
  evolutionParameters
  runtimeVersions
  summaryMetrics
```

破壊的なschema変更時はmigrationまたは明示的な非対応エラーを出します。
