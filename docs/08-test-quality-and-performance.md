# テスト・品質・性能計画

## 1. テスト方針

実装は小さな振る舞い単位で、失敗するテストを先に置き、最小実装で通し、必要なrefactorを行う流れを提案します。単にcoverageを満たすだけでなく、主要配線を一時的に外したときに試験が失敗することを確認します。

```text
Red
  -> Green
  -> Refactor
  -> mutation / wiring-disconnection proof
```

P0ではこの順序を実行し、未実装moduleによるRedを確認してから実装しました。固定step、PD controller、motor／limitの結線、10,000 step安定性、UI初期状態を8件の自動試験で検証しています。

## 2. テスト層

### Unit

- resampling。
- 近接、交差、戻り方向判定。
- Node統合とEdge分割。
- Graph validation。
- Seed付き乱数。
- Crossover、Mutation、Selection。
- Fitnessの各項。
- 状態遷移。
- schema serialization。

### Property-based

ランダム点列やGraphに対して次を検証します。

- 出力座標が有限。
- Edge数とNode次数が上限以内。
- ゼロ長Edgeがない。
- Edgeが存在しないNodeを参照しない。
- Mutation後もGeneが範囲内。
- serialize/deserializeで意味が保存される。

### Contract

- Box2DAdapterがBodyとJointを正しい順序で生成・破棄する。
- motor commandの変更が観測角速度へ影響する。
- limitを越える入力でも関節が許容範囲へ留まる。
- episode resetで前世代の速度、力、contactが残らない。

### Integration

- fixture GraphからCreatureを生成し、固定stepを完走する。
- 同一Genomeの複数個体が近い結果になる。
- Population評価から次世代生成まで通る。
- 表示の有無がSimulation結果へ影響しない。
- 100世代の反復でBody／Joint数が基準へ戻る。

### Browser E2E

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

- `Math.random()`をdomainから禁止する。
- RunごとにSeedを記録する。
- fixed dt、substep、反復順序を固定する。
- GraphとGenomeの順序をIDで安定化する。
- exact float一致ではなく、位置・角度・Fitnessの許容誤差で比較する。
- ブラウザ／OSをまたぐ決定性は別項目として測る。
- bug reportにはRunRecordを添付できるようにする。

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

## 5. 初期性能マトリクス

| Bones | Population | Rendered | Speed | 用途 |
|---:|---:|---:|---:|---|
| 4 | 1 | 1 | x1 | 正しさ |
| 4 | 8 | 8 | x1 | 小規模統合 |
| 6 | 32 | 8 | x1 | MVP基準 |
| 6 | 32 | 8 | x4 | 高速学習 |
| 12 | 32 | 8 | x1 | 複雑形状 |
| 6 | 64 | 8 | x1 | stretch |

32体・64体が十分高速という記述は、実測前は予測に留めます。対象PC、ブラウザversion、電源状態、foreground/backgroundを記録します。

## 6. 品質ゲート

### Merge gate

- 型検査、unit、contract、integrationが成功。
- formatter／lintが成功。
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
