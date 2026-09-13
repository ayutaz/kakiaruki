# 物理・関節制御・遺伝的アルゴリズム

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
- 初期案は`dt = 1/60秒`、Box2D substepは2。
- 学習速度は1描画frameあたりの固定step数を増減して表現する。
- 1 frameの計算時間に上限を設け、UIが長時間固まらないようにする。

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

### 値域の初期提案

| Gene | 範囲案 |
|---|---|
| globalFrequency | 0.25〜3.0 Hz |
| amplitude | 0〜関節limit内 |
| phase | 0〜2π |
| bias | 関節limit内 |
| maxTorque | 骨格の質量スケールに応じた正規化範囲 |

関節ごとのfrequencyを最初から持たせると探索空間が広がるため、まずglobalFrequencyだけにします。PoCで表現力不足が確認された場合のみ拡張します。

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

### 初期パラメータ案

| 項目 | 提案値 |
|---|---:|
| Population | 32 |
| Elite | 4 |
| Tournament size | 3 |
| 1エピソード | 6秒 |
| Geneごとのmutation確率 | 15% |
| 初期速度倍率 | x1 / x2 / x4 / x8 |

これらは原作値ではなくPoC開始値です。性能と収束を測った後に変更します。

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

同一環境の再シミュレーションでリプレイします。ブラウザやCPUをまたぐbit単位の決定性は **未確認**であり、必要なら後にtransform軌跡の記録方式へ切り替えます。
