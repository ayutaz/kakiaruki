# PoCロードマップと完了条件

## 全体方針

最も不確実な順に検証し、一筆UIを作り込む前に「物理と進化が面白いか」を確認します。各Phaseは、成果物が存在するだけでなく、受入条件と証拠が揃った時点で完了とします。

## P0: 依存関係と最小物理スパイク

**状態: 完了（2026-09-14）**

### 目的

Phaser 4、Phaser Box2D、TypeScript、Viteの組み合わせが実プロジェクトで成立することを確認する。

### 実装

- 最小project setup。
- 2本のカプセルBody。
- 1つのRevolute Joint。
- 角度limit、motor、max torque。
- 明示的な固定step。
- debug drawまたは最小Phaser描画。

### 完了条件

- [x] 型検査、unit test、本番buildが成功する。
- [x] motor on/offで挙動が変わる自動試験がある。
- [x] 角度limitの有無で挙動差を検出する結線切断テストがある。
- [x] 10,000 stepで座標・角度が有限値を保つ。
- [x] import方法と固定したversionをdocsへ反映する。
- [x] ブラウザでmotor、limit、x8、resetを操作し、console error／warningがない。

実行結果、依存関係上の注意、ビルドサイズは [P0技術検証結果](11-p0-technical-validation.md) を参照してください。

## P1: 固定骨格のSimulation

### 目的

一筆入力なしで、4〜6本の固定骨格を安定して評価する。

### 実装

- CreatureGraph fixture。
- GraphからBody／Joint生成。
- JointController。
- 1 World内の複数レーン。
- episode開始、終了、cleanup。

### 完了条件

- Population 1、8、32で評価完走。
- 全個体の初期条件が同一。
- 表示個体数0、1、8でFitness結果が許容誤差内で一致。
- 100世代相当の生成・破棄で資源増加が頭打ちになる。
- 対象PCでPopulation 32が少なくとも実時間相当以上に進む。

## P2: 遺伝的アルゴリズム

### 目的

固定骨格が前方移動を獲得することを確認する。

### 実装

- Seed付き初期Population。
- Fitness。
- Elite、Tournament、Crossover、Mutation。
- 世代統計とベストGenome。
- 進化なしの対照群。

### 完了条件

- 同一Seedの再試行が許容誤差内で一致。
- MutationまたはSelectionの結線を切ると、改善試験が失敗する。
- 複数Seedで、進化群が対照群よりFitness中央値を改善する。
- ベスト個体を再シミュレーションできる。
- Godot切替ゲートをこの時点で評価する。

## P3: 単純な一筆入力

### 目的

直線・折れ線をCreatureGraphへ変換する。

### 実装

- Pointer capture。
- 等間隔resampling。
- 位相分割後のedge simplification。
- 長さ／本数制約。
- Graph previewとValidation表示。

### 完了条件

- 直線、L字、ジグザグ、短すぎる線のfixture試験が通る。
- 不正入力が例外ではなく説明可能なerrorになる。
- Pointerイベント頻度が異なっても近いGraphを得る。
- 描いたGraphでP2の学習loopを実行できる。

## P4: 枝分かれ、Undo、単純ループ

### 目的

原作の特徴である戻り線からの枝分かれに対応する。

### 実装

- 逆向き追跡を使う戻り検出。
- Nodeへの吸着。
- Edge単位Undoと全描き直し。
- 次数3〜4の関節生成。
- 単純閉ループの実験フラグ。

### 完了条件

- Y字、人型相当、意図しない近接、単純輪のfixtureが仕様どおりになる。
- Undo後のGraph不変条件が保たれる。
- 閉ループを許可しない設定では明示的な理由を返す。
- 許可する場合は長時間stepで数値爆発しない。

## P5: 体験統合

### 目的

「描く→学習→観察→描き直す」を一続きにする。

### 実装

- Drawing / Ready / Training / Replay状態。
- 個体数、表示個体数、速度UI。
- 世代・Fitness表示。
- ベスト個体のリプレイ。
- keyboard操作と最低限のアクセシビリティ。

### 完了条件

- 主要flowのブラウザE2Eが通る。
- speed変更で物理step数が変わり、結果の定義が変わらない。
- 例外時に停止・復帰できる。
- 人の手動確認で、進化の変化を観察できる。

## P6: 性能と公開判断

### 候補

- Render snapshotの間引き。
- typed array化。
- Worker化。
- mobile tuning。
- 保存・共有。
- 独自タイトル、アート、サウンド。

これらはMVP成立後に判断します。公開、ランキング、外部サービス連携は別承認とします。
