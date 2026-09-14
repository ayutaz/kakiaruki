# PoCロードマップと完了条件

更新日: 2026-09-14

## 全体方針

最も不確実な順に検証し、一筆UIを作り込む前に「物理と進化が面白いか」を確認します。各Phaseは、成果物が存在するだけでなく、受入条件と証拠が揃った時点で完了とします。

P0完了後の具体的な実装順序、目的、ゴール、成果物、判断ゲートは [P0完了後の開発計画](12-development-plan.md) を正とします。この文書のPhaseと実行Milestoneは次のように対応します。

| Phase | 実行Milestone | 状態 |
|---|---|---|
| P0 | M0: 技術検証 | **完了** |
| P1 | M1: Simulation基盤、M2: Population評価と性能 | **技術検証済み**（ブラウザ計測が未実施） |
| P2 | M3: 進化loop | **技術検証済み**（世代変化の視認確認が未実施） |
| P3 | M4: 単純な一筆入力 | **技術検証済み**（実ブラウザ操作の確認が未実施） |
| P4 | M5: 枝分かれと編集 | **技術検証済み**（ブラウザ操作の確認が未実施） |
| P5 | M6: 体験統合 | **技術検証済み**（体験確認とE2Eが未実施） |
| P6 | M7: 安定化と公開判断 | **技術検証済み**（ブラウザ確認と公開判断が未了） |

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

**状態: 技術検証済み（2026-09-14）。M1・M2として実施。**

### 目的

一筆入力なしで、4〜6本の固定骨格を安定して評価する。

### 実装

- CreatureGraph fixture。
- GraphからBody／Joint生成。
- JointController。
- 1 World内の複数レーン。
- episode開始、終了、cleanup。

### 完了条件

- [x] Population 1、8、32で評価完走。
- [x] 全個体の初期条件が同一。
- [x] 表示個体数0、1、8でFitness結果が許容誤差内で一致（実際は**完全一致**）。
- [x] 100世代相当の生成・破棄で資源増加が頭打ちになる（shape数がbaselineへ復帰）。
- [x] 対象PCでPopulation 32が少なくとも実時間相当以上に進む（headlessで**実時間の37倍**）。
- [ ] ブラウザ前景タブでの p95 frame time。**未計測**（[M2性能記録](15-m2-population-performance.md) §8）。

詳細は [M1検証結果](14-m1-simulation-validation.md) と [M2性能記録](15-m2-population-performance.md) を参照してください。

## P2: 遺伝的アルゴリズム

**状態: 技術検証済み（2026-09-14）。M3として実施。**

### 目的

固定骨格が前方移動を獲得することを確認する。

### 実装

- Seed付き初期Population。
- Fitness。
- Elite、Tournament、Crossover、Mutation。
- 世代統計とベストGenome。
- 進化なしの対照群。

### 完了条件

- [x] 同一Seedの再試行が許容誤差内で一致（全世代の統計とGenome列まで**完全一致**）。
- [x] MutationまたはSelectionの結線を切ると、改善試験が失敗する。
- [x] 複数Seedで、進化群が対照群よりFitness中央値を改善する（5 Seedで 17.46 vs 4.17）。
- [x] ベスト個体を再シミュレーションできる（元の評価値と 1e-6 以内で一致）。
- [x] Godot切替ゲートをこの時点で評価する（[docs/03](03-feasibility-and-engine-decision.md) §6。切替を示す結果なし）。
- [ ] 世代変化を人が理解できるか。**未確認**（[M3検証結果](16-m3-evolution-validation.md) §8）。

詳細は [M3検証結果](16-m3-evolution-validation.md) を参照してください。

## P3: 単純な一筆入力

**状態: 技術検証済み（2026-09-14）。M4として実施。**

### 目的

直線・折れ線をCreatureGraphへ変換する。

### 実装

- Pointer capture。
- 等間隔resampling。
- 位相分割後のedge simplification。
- 長さ／本数制約。
- Graph previewとValidation表示。

### 完了条件

- [x] 直線、L字、ジグザグ、短すぎる線のfixture試験が通る（緩い曲線・終端突起・自己交差・閉ループも追加）。
- [x] 不正入力が例外ではなく説明可能なerrorになる。
- [x] Pointerイベント頻度が異なっても近いGraphを得る（10倍の密度差で節点座標が**完全一致**）。
- [x] 描いたGraphでP2の学習loopを実行できる。
- [ ] 実ブラウザでのPointer／キーボード操作。**未確認**（[M4検証結果](17-m4-stroke-input-validation.md) §8）。

詳細は [M4検証結果](17-m4-stroke-input-validation.md) を参照してください。

## P4: 枝分かれ、Undo、単純ループ

**状態: 技術検証済み（[docs/18](18-m5-branching-validation.md)）。**

M4では戻り線・自己交差・閉ループを**理由付きで拒否**しています。P4で対応範囲を決めます。

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

**状態: 技術検証済み（[docs/19](19-m6-experience-review.md)）。**

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

**状態: 技術検証済み（[docs/20](20-m7-release-readiness.md)）。**

### 候補

- Render snapshotの間引き。
- typed array化。
- Worker化。
- mobile tuning。
- 保存・共有。
- 独自タイトル、アート、サウンド。

これらはMVP成立後に判断します。公開、ランキング、外部サービス連携は別承認とします。
