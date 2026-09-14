# 物理・関節制御・遺伝的アルゴリズム

更新日: 2026-09-14

## 0. 実装状況

この文書の設計案はM1〜M3でほぼ実装済みです。**提案値と実装値が違う箇所は各節に併記**しています。実測は [M3検証結果](16-m3-evolution-validation.md) を参照してください。

| 節 | 状態 |
|---|---|
| §1 物理モデル | **実装済み（M1）** `src/simulation/skeleton-plan.ts`、`src/simulation/box2d/` |
| §2 関節コントローラ | **実装済み（M1）** `src/domain/control/` |
| §3 Genome | **実装済み（M3）** `src/domain/evolution/genome.ts`。`maxTorque` はGeneに含めなかった |
| §4 世代処理 | **実装済み（M3）** `src/domain/evolution/evolution-engine.ts` |
| §5 Crossover / Mutation | **実装済み（M3）** `src/domain/evolution/selection.ts` |
| §6 Fitness | **実装済み（M3）** `src/domain/evolution/fitness.ts` |
| §7 リプレイ | **実装済み（M3）** `src/app/evolution-run.ts` の `replayGenome` |

## 1. 物理モデル

### Body

- 各骨は動的なカプセルBody。
- 密度または総質量を一定方針で正規化する。
- 摩擦、反発、線形減衰、角減衰は全個体で共通。
- 同一形状の個体間で初期姿勢と物理パラメータを一致させる。
- 地面は静的Body。最初は平面のみとする。

### Joint

- 共有NodeはRevolute Joint。
- 角度limitを有効にし、極端な折れ返りを防ぐ。
- motorを有効にし、毎stepの目標速度をcontrollerが更新する。
- 最大motor torqueを遺伝子または共通設定で制限する。
- 接続されたBody同士は原則衝突させない。

### 時間

- 物理は固定`dt`で進め、描画の`requestAnimationFrame`と分離する。
- 初期案は`dt = 1/60秒`、Box2D substepは2。**実装値は `dt = 1/60秒`、substep 4**（M1で4へ増やした）。
- 学習速度は1描画frameあたりの固定step数を増減して表現する。→ `FixedStepRunner` が担当。
- 1 frameの計算時間に上限を設け、UIが長時間固まらないようにする。→ `maxStepsPerFrame` で上限を設け、超過分は破棄する。

**1エピソードの既定は6秒**（360 step）。座標が暴走した個体は、スポーン時の重心から200 m以上離れた時点で `invalid` として打ち切ります。当初は world原点からの絶対座標で判定していましたが、レーン配置では遠いレーンの正常な個体を誤判定するため、M2でスポーン地点からの変位へ変更しました。

## 2. 最小の関節コントローラ

各関節の目標角度を周期関数で作ります。

```text
targetAngle_i(t)
  = bias_i + amplitude_i * sin(globalFrequency * t + phase_i)
```

Box2DのRevolute Joint motorは目標角速度を受け取るため、角度誤差を速度へ変換します。

```text
angleError = shortestAngle(targetAngle - currentAngle)
targetMotorSpeed = clamp(Kp * angleError - Kd * relativeAngularVelocity)
```

この方式なら、関節ごとの振幅・位相・中心角と、全体の周波数を少数の連続値で探索できます。motor torqueの上限により、無限に強い関節を避けます。

## 3. Genome案

### 初期Genome

```text
Genome
  globalFrequency
  jointGenes[]

JointGene
  amplitude
  phase
  bias
  maxTorque
```

### 値域

| Gene | 範囲案 | M3の実装値 |
|---|---|---|
| globalFrequency | 0.25〜3.0 Hz | **0.25〜3.0 Hz** |
| amplitude | 0〜関節limit内 | **0〜0.9 rad**（関節limit ±0.9 rad の内側） |
| phase | 0〜2π | **0〜2π**（変異後もwrap） |
| bias | 関節limit内 | **±0.5 rad** |
| maxTorque | 骨格の質量スケールに応じた正規化範囲 | **Geneに含めない**。全関節共通の40 N·m 固定 |

関節ごとのfrequencyを最初から持たせると探索空間が広がるため、まずglobalFrequencyだけにします。`maxTorque` も同じ理由でGeneから外し、全関節共通の固定値にしました（docs/09 未確定事項 12）。

M3の実験では5 Seedすべてが 5.1〜5.6 体長付近へ収束しました。これが探索の限界か物理の限界かは**未確認**で、関節ごとのfrequencyや `maxTorque` をGeneへ加えるかは、その切り分けの後に判断します。

## 4. 世代処理

```text
初期Population生成
  -> 同一骨格で全個体を初期化
  -> 固定時間シミュレーション
  -> Fitness集計
  -> Elite保存
  -> Tournament selection
  -> Crossover
  -> Gaussian mutation + clamp
  -> 次世代へ置換
```

### 初期パラメータ

| 項目 | 提案値 | M3の実装値 |
|---|---:|---:|
| Population | 32 | **32** |
| Elite | 4 | **4** |
| Tournament size | 3 | **3** |
| 1エピソード | 6秒 | **6秒** |
| Geneごとのmutation確率 | 15% | **15%** |
| 変異σ | - | frequency 0.15 / amplitude 0.12 / phase 0.5 / bias 0.1 |
| 初期速度倍率 | x1 / x2 / x4 / x8 | 開発ページのみ実装。製品UIはM6 |

これらは原作値ではなくPoC開始値です。M3の実験ではこの値で5/5 Seedが改善したため、現時点で変更していません。

## 5. CrossoverとMutation

### Crossover

- 同じ関節index同士を対応させる。
- MVPはGene単位のuniform crossoverを使う。
- 親が同じ骨格を共有するため、構造不一致の処理は不要。

### Mutation

- 連続値へ平均0のGaussian noiseを加える。
- phaseは2πでwrapする。
- amplitude、bias、torque、frequencyは許容範囲へclampする。
- まれに大きな変化を入れるかは、停滞検出後の拡張とする。

## 6. Fitness案

前方への移動を、単一Bodyの先端ではなく、質量加重した生物全体の重心で測ります。

```text
forwardProgress = endCOM.x - startCOM.x
bestProgress    = maxCOM.x - startCOM.x
uprightBonus    = optional
energyPenalty   = normalized motor effort
invalidPenalty  = fall-through / NaN / out-of-bounds

fitness =
  0.7 * forwardProgress
  + 0.3 * bestProgress
  - energyWeight * energyPenalty
  - invalidPenalty
```

係数は提案です。`bestProgress`だけだと、一瞬だけ部位を前へ投げる個体が有利になりやすく、`endProgress`だけだと面白い一時動作を評価しにくいため、両方を記録します。

**M3の実装値**: `energyWeight = 0.01`（`motorEffort = Σ |motorTorque| * dt`）、`invalidPenalty = 1000`。`uprightBonus` は実装していません。

`FitnessTerms` として前進距離・最大前進距離・**骨格幅で正規化した前進量（体長倍）**・energy項・失格理由を個別に記録します。正規化距離は、骨格の大きさが違っても比較できるようにするためのものです。

`energyWeight = 0.01` は現状ほとんど効いていない可能性があり、妥当性は**未確認**です（docs/09 未確定事項 13）。

### 「バグ技」と創発性の境界

転がる、跳ねる、体を引きずるといった奇妙な解は、この体験の魅力です。次だけを禁止し、それ以外は可能な限り残します。

- NaNやInfinity。
- 地面をすり抜ける。
- 座標上限を超える数値爆発。
- 初期配置の重なりから得る不公平な衝撃。
- 個体同士の衝突を利用する。

## 7. リプレイ

完全な物理軌跡を全frame保存するのではなく、まず次を保存します。

- CreatureGraphの正規化表現とhash。
- Genome。
- Seed。
- 物理・進化パラメータ。
- Phaser、Phaser Box2D、ブラウザのバージョン情報。

同一環境の再シミュレーションでリプレイします。

**M3で実装済み**: `replayGenome` が保存したGenomeを同じ条件で再評価し、元の評価値と **1e-6以内**で一致することを検証しています。評価は個体が置かれたレーン位置に依存しないため、Population評価中の結果と単体リプレイの結果が一致します。

ブラウザやCPUをまたぐbit単位の決定性は引き続き **未確認**です。M1はmacOS／Node 25、P0はWindows／Node 24で検証しており、環境をまたいだ数値一致は測っていません。必要なら後にtransform軌跡の記録方式へ切り替えます。
