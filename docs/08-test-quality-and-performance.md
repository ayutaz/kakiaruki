# テスト・品質・性能計画

更新日: 2026-09-14

## 1. テスト方針

実装は小さな振る舞い単位で、失敗するテストを先に置き、最小実装で通し、必要なrefactorを行う流れを提案します。単にcoverageを満たすだけでなく、主要配線を一時的に外したときに試験が失敗することを確認します。

```text
Red
  -> Green
  -> Refactor
  -> mutation / wiring-disconnection proof
```

P0からM4まで、この順序を実行しています。M4時点の自動試験は **33 files / 266 tests** です。

| 層 | files | 主な対象 |
|---|---:|---|
| `tests/unit/` | 23 | 純粋ロジック（Graph validation、幾何、Genome、GA、stroke変換、Pointer adapter、層の依存） |
| `tests/contract/` | 4 | Box2D adapterの契約（World、Creature生成・破棄、個体隔離、P0 rig） |
| `tests/integration/` | 6 | Graph → 物理 → 評価 → 進化 → 一筆入力 の通し |
| `tests/fixtures/` | 3 | `CreatureGraph`、stroke、fake `CreatureHandle` |

**配線切断証明**は各マイルストーンで実施し、外した配線と失敗した試験を検証記録へ残しています（[docs/14](14-m1-simulation-validation.md) §7、[docs/15](15-m2-population-performance.md) §7、[docs/16](16-m3-evolution-validation.md) §7、[docs/17](17-m4-stroke-input-validation.md) §9）。

M2では「もし個体同士が重なれば実際に接触が検出される」ことを確認する **positive control** も実施しました。検出器が常に0を返しているだけではないことの証明です。

## 2. テスト層

### Unit

- resampling。**実装済み**
- 近接、交差、戻り方向判定。**交差は実装済み。戻り方向はM5**
- Node統合とEdge分割。**実装済み**
- Graph validation。**実装済み**
- Seed付き乱数。**実装済み**
- Crossover、Mutation、Selection。**実装済み**
- Fitnessの各項。**実装済み**
- 状態遷移。**未実装（M6）**
- schema serialization。**実装済み**（`RunRecord` の round trip と未対応version拒否）

加えて、当初計画になかった **層の依存検査**（`tests/unit/layering.test.ts`）を追加しました。`src/domain/` から Phaser／Box2D へ推移的にも到達しないことを機械的に確認します。

### Property-based

ランダム点列やGraphに対して次を検証します。

**状態: property-basedフレームワークは未導入。** 現在は代表fixtureと、fixtureを変形した決定的なケースで同等の性質を確認しています。

- 出力座標が有限。**fixtureで確認済み**
- Edge数とNode次数が上限以内。**fixtureで確認済み**
- ゼロ長Edgeがない。**fixtureで確認済み**（最小骨長未満のEdgeも作らない）
- Edgeが存在しないNodeを参照しない。**validationで確認済み**
- Mutation後もGeneが範囲内。**500世代の連続変異で確認済み**
- serialize/deserializeで意味が保存される。**確認済み**

fast-check等の導入は、M5で入力の組合せが増えた時点で再検討します。

### Contract

- Box2DAdapterがBodyとJointを正しい順序で生成・破棄する。**確認済み**（Jointを先、Bodyを後）
- motor commandの変更が観測角速度へ影響する。**確認済み**
- limitを越える入力でも関節が許容範囲へ留まる。**確認済み**（limit + 0.15 rad 以内）
- episode resetで前世代の速度、力、contactが残らない。**確認済み**（5世代実行後の結果が、まっさらなWorldでの同条件実行と一致）

### Integration

- fixture GraphからCreatureを生成し、固定stepを完走する。**確認済み**（10,000 step）
- 同一Genomeの複数個体が近い結果になる。**確認済み**（レーン位置に依存せず一致）
- Population評価から次世代生成まで通る。**確認済み**
- 表示の有無がSimulation結果へ影響しない。**確認済み**（表示0／1／8で完全一致）
- 100世代の反復でBody／Joint数が基準へ戻る。**確認済み**
- 描いた一筆から学習loopを完走する。**確認済み**（M4で追加）

### Browser E2E

**状態: フレームワーク未導入。ユーザー判断を待っています**（[M4検証結果](17-m4-stroke-input-validation.md) §8）。

M4時点では、Pointerイベントの座標変換・capture・多重Pointer・dispose、キー写像を **fake targetを使ったnode上の自動試験**で検証しています。実ブラウザでの確認は人が行います。

導入した場合に対象とするもの:

- 描く、確定、学習開始、停止、リプレイ、描き直し。
- Ctrl+Z／Backspaceとボタン操作。
- sliderの最小・最大。
- tab非表示／再表示時の時間処理。
- canvas resize。
- WebGL context lossからの復帰は公開要件に応じて追加。

### Manual review

自動試験では「面白い進化」に見えるか判断できません。人が次を確認します。

- 世代間の変化が視認できる。
- ベスト個体が選ばれた理由を移動結果から理解できる。
- 奇妙な移動が魅力として残っている。
- 描線previewと生成骨格の対応が納得できる。
- エラー文が形の直し方を説明している。

## 3. 決定性と再現性

- `Math.random()`をdomainから禁止する。**実装済み**。乱数は `createSeededRandom` のみ。
- RunごとにSeedを記録する。**実装済み**（`RunRecord.seed`）。
- fixed dt、substep、反復順序を固定する。**実装済み**（dt 1/60 s、substep 4）。
- GraphとGenomeの順序をIDで安定化する。**実装済み**。`buildSkeletonPlan` はEdge IDの昇順で並べ替えてから生成するため、宣言順に依存しない。
- exact float一致ではなく、位置・角度・Fitnessの許容誤差で比較する。**実装済み**。同一環境内では実際には完全一致するが、試験は許容誤差で比較している。
- ブラウザ／OSをまたぐ決定性は別項目として測る。**未確認**。P0はWindows／Node 24、M1以降はmacOS／Node 25で検証しており、環境間の数値一致は測っていない。
- bug reportにはRunRecordを添付できるようにする。**部分実装**。`RunRecord` は生成・serialize・parseできるが、UIからの出力口は未実装（M6）。

## 4. 性能指標

平均FPSだけではなく、Simulation throughputと応答性を分けます。

| 指標 | 意味 |
|---|---|
| physics steps / wall second | 学習そのものの速さ |
| episode wall time | 1世代の待ち時間 |
| p95 frame time | UIの引っかかり |
| active body / joint count | cleanup漏れの検出 |
| heap trend over generations | 長時間資源増加 |
| render snapshot cost | 描画対象数の影響 |
| generation improvement curve | 探索の有効性 |

## 5. 性能マトリクス

| Bones | Population | Rendered | Speed | 用途 | 実測 |
|---:|---:|---:|---:|---|---|
| 6 | 1 | - | x1 | 正しさ | **実時間の901倍**（headless） |
| 6 | 8 | - | x1 | 小規模統合 | **実時間の160倍**（headless） |
| 6 | 32 | - | x1 | MVP基準 | **実時間の44倍**（headless） |
| 6 | 32 | 0／1／8 | x1 | 表示分離 | 結果は表示個体数に依存せず**完全一致** |
| 6 | 32 | 8 | x1／x4／x8 | ブラウザ応答性 | **未計測**（`bench/frame-time.html`） |
| 12 | 32 | 8 | x1 | 複雑形状 | 未計測 |
| 6 | 64 | 8 | x1 | stretch | 未計測（M2の非ゴール） |

headless計測の条件: macOS 26.2 / Apple M4 Max / Node v25.2.0、6ボーン5関節の `zigzag6`、episode 6秒、dt 1/60 s、substep 4、各3回の中央値。`npm run bench` で再実行できます。

**ブラウザ上の p95 frame time は未計測**です。電源状態、ブラウザversion、foreground/backgroundは計測時に記録します（[M2性能記録](15-m2-population-performance.md) §8）。

## 6. 品質ゲート

### Merge gate

- 型検査、unit、contract、integrationが成功。→ `npm run verify`。**`npm run test` は型検査をしないため、`npm run typecheck` を別に実行すること。**
- formatter／lintが成功。→ **未導入**。ESLint／Prettierはこのリポジトリに設定されていません。導入するかはM6以降で判断します。
- 変更した重要分岐に回帰試験がある。
- 既知の未確認事項をdocsで更新。

### Phase gate

- 自動試験の成功。
- 受入条件の証拠。
- 性能値の測定結果。
- 未解決リスクの再評価。
- 必要なmanual reviewの記録。

### Release gate

- Chromiumに加えFirefoxで主要flowを確認。
- 目標に含める場合のみSafari／mobileを確認。
- 長時間runと停止／再開。
- ライセンス、名称、アセット、クレジットの人手確認。
- 「技術的に動く」と「体験品質が承認された」を別に記録。

## 7. 失敗時の扱い

NaN、座標発散、物理例外、time budget超過を個体単位で検出し、その個体をinvalidとして評価を打ち切ります。Run全体を可能な限り継続しつつ、再現に必要なSeed、Graph hash、Genome、step番号を記録します。同じ異常が一定数を超えた場合はRunを停止し、UIへ説明を返します。

**M3時点の実装**:

- 検出しているのは `non-finite-state`（非有限）と `out-of-bounds`（スポーン地点から200 m超）の2種類。
- invalid個体はその場で打ち切り、`invalidPenalty` により必ず完走個体より低いfitnessになる。
- Run全体は規定世代数まで継続し、世代ごとの `invalidCount` を記録する。
- **未実装**: time budget超過の検出、異常が一定数を超えた場合のRun停止、UIへの説明（M6）。
