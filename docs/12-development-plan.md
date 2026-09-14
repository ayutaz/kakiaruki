# P0完了後の開発計画

- 更新日: 2026-09-14
- 状態: **実行計画**（M1〜M4 実施済み）
- 対象: P0技術検証完了後から、公開可否を判断できるMVP候補まで

## 1. この計画の位置づけ

この文書を、P0完了後の実装順序とマイルストーン完了判定の基準とします。各マイルストーンの受入条件は、対応する検証記録（[docs/14](14-m1-simulation-validation.md)〜[docs/20](20-m7-release-readiness.md)）が合否の根拠として参照します。

各マイルストーンは「コードを書き終えた」だけでは完了にしません。目的、到達ゴール、成果物、受入条件、非ゴール、検証証拠を揃えた時点で完了とします。受入条件を満たさずに次へ進む場合は、例外と理由を文書へ残します。

## 2. 現在地点

**M4まで技術検証済み。次はM5です。** 自動試験は 33 files / 266 tests。

### M0: 最小物理技術検証

- 状態: **完了**
- 確認済み: Phaser描画、Phaser Box2D、2 Body、Revolute Joint、motor、limit、固定step、TypeScript型検査、本番build。
- 手動確認: 内蔵ブラウザでmotor、limit、x8、resetを確認し、console error／warningは0件。
- 証拠: [P0技術検証結果](11-p0-technical-validation.md)。

### M1: Simulation基盤

- 状態: **完了**
- 確認済み: `CreatureGraph` validation、4〜6ボーンのBody／Joint生成、地面上のepisode、10,000 stepの有限値維持、100回のcleanupでshape数が基準へ復帰、同一条件の再実行一致。
- 証拠: [M1検証結果](14-m1-simulation-validation.md)。

### M2: Population評価と性能

- 状態: **技術検証済み**（p95 frame timeのブラウザ計測が未実施）
- 確認済み: 1 World内のレーン分離、Population 1／8／32の完走、個体間contact 0件、表示個体数0／1／8での結果完全一致、100世代のcleanup、Population 32 が headless で実時間の44倍。
- 未確認: ブラウザ前景タブでの p95 frame time。
- 証拠: [M2性能記録](15-m2-population-performance.md)。

### M3: 進化loop

- 状態: **技術検証済み**（世代変化の視認確認が未実施）
- 確認済み: Seed付き乱数、Genome、Fitness分解、Elite／Tournament／Crossover／Mutation、Run全体の完全再現、best Genomeのリプレイ一致、5 Seed × 50世代で5/5改善、進化群中央値 17.91 vs 対照群 4.17。
- 未確認: 世代変化を人が理解できるか（判断ゲート）。
- 証拠: [M3検証結果](16-m3-evolution-validation.md)。

### M4: 単純な一筆入力

- 状態: **技術検証済み**（実ブラウザ操作の確認が未実施）
- 確認済み: Pointer記録、正規化、等間隔resampling、折れ曲がり検出、区間内RDP、骨長・本数制約、自己交差・閉ループの理由付き拒否、入力密度10倍差での節点座標完全一致、描いたGraphからの学習完走。
- 未確認: 実ブラウザでのPointer／キーボード操作。browser E2Eフレームワーク導入の要否は**ユーザー判断**。
- 証拠: [M4検証結果](17-m4-stroke-input-validation.md)。

一筆入力から進化まで一通り動きますが、枝分かれ、体験としての統合、体験品質、公開判断はまだ完成していません。

## 3. 最終的に目指すMVP

ユーザーがブラウザ上で一筆の形を描き、その形を固定した複数個体が世代交代を繰り返し、移動能力を獲得する様子を観察できる状態をMVP候補とします。

MVP候補のゴールは次の通りです。

1. 一筆入力が説明可能な `CreatureGraph` に変換される。
2. 同じ形を持つ複数個体が、同じ初期条件で評価される。
3. Seed付き進化により、対照群より移動結果が改善する。
4. 描く、確定する、学習する、観察する、リプレイする、描き直す、が一続きで動く。
5. 自動試験と長時間検証を通り、既知の制約が文書化される。
6. 公開は自動的に行わず、名称・アート・ライセンス・対応環境を人が承認する。

## 4. マイルストーン一覧

| Milestone | 名称 | 目的 | 完了時のゴール | 対応Phase | 状態 |
|---|---|---|---|---|---|
| M1 | Simulation基盤 | 固定骨格を安定して評価する | 4〜6ボーンの1個体が繰り返しepisodeを完走する | P1前半 | **完了** |
| M2 | Population評価と性能 | 複数個体を公平かつ高速に評価する | 1 WorldでPopulation 32を測定可能にする | P1後半 | **技術検証済み** |
| M3 | 進化loop | Controllerが移動を学習できるか判断する | 複数Seedで進化群が対照群を上回る | P2 | **技術検証済み** |
| M4 | 単純な一筆入力 | 描線を安全な物理Graphへ変換する | 直線・L字・ジグザグから学習を開始できる | P3 | **技術検証済み** |
| M5 | 枝分かれと編集 | 一筆らしい複雑形状を扱う | Y字・人型相当・Undoが仕様どおり動く | P4 | 技術検証済み |
| M6 | 体験統合 | 個別機能を遊べる流れへまとめる | 描画からベスト個体のリプレイまで完走する | P5 | 技術検証済み |
| M7 | 安定化と公開判断 | MVP候補の品質と公開条件を確定する | 長時間・ブラウザ・権利確認を終え、公開可否を判断できる | P6 | 技術検証済み |

`技術検証済み` は自動試験・型検査・build・必要な実測が合格した状態で、人の確認が残っているものを含みます（[docs/13](13-milestone-quality-and-decision-gates.md) §2）。

## 5. M1: Simulation基盤

**状態: 完了。実施記録は [M1検証結果](14-m1-simulation-validation.md)。**

### 目的

Phaser Sceneに依存せず、4〜6本の固定骨格を生成、実行、停止、破棄できるsimulation基盤を作ります。以後の進化と入力変換が、物理実装の詳細へ直接依存しない状態にします。

### 到達ゴール

定義済みの `CreatureGraph` fixtureから1個体を生成し、地面上で1 episodeを固定step実行し、結果を記録して完全にcleanupできること。

### 主な成果物

- `CreatureGraph`、Node、Edge、Joint設定の型とvalidation。
- 4〜6ボーンの代表fixture。
- GraphからBox2D Body／Jointを生成するadapter。
- 地面、重力、collision category、初期姿勢。
- `EpisodeRunner` と開始・step・終了・cleanup lifecycle。
- 描画用snapshotと評価用状態の分離。
- Seed、Graph hash、設定、結果を保持する最小 `RunRecord`。

### 受入条件

- Red → Green → Refactorの順序で試験を作成する。
- 不正Graphは例外で全体を壊さず、理由付きvalidation errorになる。
- fixtureに対してBody数、Joint数、接続先、limit、motor設定が一致する。
- 同一fixtureと同一設定の再実行結果が、定めた数値許容誤差内で一致する。
- 10,000 fixed stepsで座標、角度、速度、fitness入力値が有限値を保つ。
- 100回の生成・終了・cleanup後にBody／Joint数が基準値へ戻る。
- Phaserを起動せずにcontract／integration testを実行できる。
- `npm run verify` が成功し、M1検証記録をdocsへ追加する。

### 非ゴール

- Population並列評価。
- 遺伝的アルゴリズム。
- 自由描画からのGraph生成。
- 見た目や演出の完成。

## 6. M2: Population評価と性能

**状態: 技術検証済み。p95 frame timeのブラウザ計測のみ未実施。実施記録は [M2性能記録](15-m2-population-performance.md)。**

### 目的

複数個体を同一条件で評価し、描画量に左右されずに世代処理を進められる基盤を作ります。同時にPhaser Box2D継続採用の性能判断を行います。

### 到達ゴール

1つのWorld内に互いに干渉しない評価レーンを作り、Population 1／8／32を完走させ、対象PCでthroughputとUI応答性を再現可能な形で測定できること。

### 主な成果物

- `PopulationRunner` とlane allocator。
- 個体間衝突を防ぐcollision設定。
- Worldを維持したBody／Jointの生成・cleanup。
- 計算個体数と表示個体数を分けるsnapshot境界。
- Population 1／8／32のbenchmark command。
- 実行環境、電源状態、ブラウザ、設定、結果を含む性能レポート。

### 受入条件

- Population 1／8／32が同じepisode定義で完走する。
- 個体間または隣接レーン間のcontactが0件である。
- 表示個体数0／1／8で、各個体の結果が許容誤差内で一致する。
- 100世代相当の生成・cleanupでBody数、Joint数、heap使用量が継続増加しない。
- Population 32を対象PCの前景タブで少なくとも実時間相当以上に進められる。
- p95 frame timeとphysics steps / wall secondを記録する。
- 性能不足の場合、計測根拠を残して最適化、Worker化、個体数変更、Godot再評価のいずれかを選ぶ。
- `npm run verify` が成功し、M2性能記録をdocsへ追加する。

### 非ゴール

- 実測前のWorker導入。
- Population 64以上の保証。
- モバイル性能の保証。

### 判断ゲート

M2終了時にPhaser Box2Dを継続するか判断します。Population 32、資源再利用、UI応答性のいずれかが限定的な修正でも成立しない場合は、Godotまたは別の物理実装を比較します。

**判定（2026-09-14）**: Population 32 は headless で実時間の44倍、資源再利用は100世代で問題なし。切替を示す測定結果はないため **Phaser Box2D を継続** します。UI応答性の実測が終わるまでこの判定は暫定です。

## 7. M3: 進化loop

**状態: 技術検証済み。世代変化の視認確認のみ未実施。実施記録は [M3検証結果](16-m3-evolution-validation.md)。**

### 目的

固定形状のControllerを遺伝的アルゴリズムで改善し、「世代を重ねると移動能力が高まる」という体験の中心が成立するか確認します。

### 到達ゴール

Seedを固定した複数試行で進化群と進化なし対照群を比較し、進化群の正規化前進距離が一貫して改善すること。ベストGenomeを保存し、同じ条件でリプレイできること。

### 主な成果物

- Seed付き疑似乱数generator。
- `Genome` とjoint controllerへの変換。
- Fitnessの分解値: 前進距離、転倒、安定性、必要に応じたenergy項。
- Elite、Tournament selection、Crossover、Mutation。
- generation loop、統計、best-ever保存。
- 進化なし対照群と比較レポート。
- `RunRecord` とベスト個体のリプレイ。

### 受入条件

- 同一Seed、Graph、設定から同じGenome列と世代統計を再生成できる。
- 異常個体をinvalidとして打ち切り、Run全体は規定数まで継続できる。
- 固定した5 Seedで50世代を実行し、少なくとも4 Seedでgeneration 0からbest normalized distanceが改善する。
- 5 Seedの進化群中央値が、同じ初期Populationを再評価する進化なし対照群中央値を上回る。
- SelectionまたはMutationの主要配線を切ると、対応する回帰試験が失敗する。
- 保存したbest Genomeのリプレイ結果が元の評価値と許容誤差内で一致する。
- Fitnessの各項と失格理由を記録できる。
- `npm run verify` が成功し、Seed別結果をdocsへ追加する。

50世代・5 Seedは最初の判定条件です。M2の実測で実行時間が過大な場合は、M3の計測開始前にだけ変更し、その理由を記録します。結果を見た後に合格条件を緩めません。

### 非ゴール

- 形態そのものの進化。
- 強化学習やneural network controller。
- 見栄えだけを理由にFitness hackを除外すること。

### 判断ゲート

M3終了時に、進化結果が観察可能な差になっているかを人が確認します。数値が改善しても動きの変化を理解できない場合は、Fitness、episode時間、可視化の調整をM4より先に行います。

**状態（2026-09-14）**: 数値上は5 Seedすべてが改善しました。**人の視認確認は未実施**です（[M3検証結果](16-m3-evolution-validation.md) §8）。M4の実装を先に進めていますが、この確認で問題が見つかった場合はFitnessと可視化の調整を優先します。

## 8. M4: 単純な一筆入力

**状態: 技術検証済み。実ブラウザ操作の確認のみ未実施。実施記録は [M4検証結果](17-m4-stroke-input-validation.md)。**

### 目的

ユーザーの描線を、数値的に安定した `CreatureGraph` へ変換します。まず枝分かれや閉ループを除いた単純形状に限定し、入力変換の正しさを独立して検証します。

### 到達ゴール

直線、L字、ジグザグをマウスまたはpointer入力で描き、previewで確認し、そのGraphをM3の学習loopへ渡せること。

### 主な成果物

- Pointer captureとraw stroke記録。
- 座標正規化、等間隔resampling、位相分割、edge simplification。
- 最小／最大骨長、最大骨数、座標範囲のvalidation。
- 描線preview、Node／Edge preview、修正方法を含むerror表示。
- 代表stroke fixtureと変換test。

### 受入条件

- 直線、L字、ジグザグ、短すぎる線、重複点をfixtureで検証する。
- 入力event頻度が異なっても、同じ軌跡から同等のGraphを得る。
- ゼロ長Edge、参照切れNode、上限超過を生成しない。
- 不正入力は拒否理由と直し方を画面へ表示する。
- previewのNode／Edge数と、simulationが生成するBody／Joint数が対応する。
- 描いた単純GraphでM3の進化loopを開始、停止、再実行できる。
- keyboardとpointerの基本操作をbrowser testで確認する。
- `npm run verify` が成功し、入力fixture一覧をdocsへ追加する。

### 非ゴール

- 戻り線による枝分かれ。
- 任意の自己交差。
- 閉ループ。
- 完成版のUndo履歴。

## 9. M5: 枝分かれと編集

**状態: 技術検証済み（[検証記録](18-m5-branching-validation.md)）。ブラウザ確認と判断ゲートが残っています。**

### 目的

一筆を戻って別方向へ伸ばす操作をGraphの枝として解釈し、Y字や人型相当の形を安全に作れるようにします。

### 到達ゴール

戻り線を含む一筆から意図した枝分かれGraphを生成し、Edge単位のUndoと全描き直しができること。曖昧な交差は勝手に関節化せず、previewまたはerrorで説明できること。

### 主な成果物

- 逆向き追跡による戻りphase検出。
- 既存Node／Edgeへのsnap規則。
- Node次数と骨数の上限。
- Edge単位Undo、全消去、Graph再validation。
- Y字、人型相当、意図しない近接、交差、単純輪のfixture。
- 閉ループを無効のまま拒否する設定と、実験用feature flag。

### 受入条件

- Y字と人型相当のfixtureが期待するNode／Edge接続になる。
- 近いだけの線、横切っただけの線、戻り線を仕様どおり区別する。
- Undo後もGraphの不変条件が保たれ、やり直した入力と同じGraphになる。
- Node次数、骨数、最小骨長の上限違反を説明付きで拒否する。
- 閉ループ無効時は、暗黙に形を変更せず明示的な理由を返す。
- 閉ループを実験する場合は、専用fixtureで長時間stepが安定した時だけMVP候補へ含める。
- 枝分かれGraphでM3の進化loopを完走する。
- `npm run verify` が成功し、曖昧入力の仕様例をdocsへ追加する。

### 非ゴール

- 複数strokeの結合。
- 自由なGraph editor。
- 閉ループのMVP必須化。

### 判断ゲート

閉ループ、自己交差、最大Node次数をMVPへ含めるか人が決定します。安定性または説明可能性が不足する場合は、安全に拒否する仕様でM6へ進みます。

## 10. M6: 体験統合

**状態: 技術検証済み（[検証記録](19-m6-experience-review.md)）。体験確認と判断ゲートが残っています。**

### 目的

個別に検証した描画、simulation、進化、リプレイを、一度も開発者ツールへ触れずに利用できる一続きの体験へまとめます。

### 到達ゴール

初めて触るユーザーが、描く、確認する、学習を開始する、世代変化を観察する、停止する、ベスト個体をリプレイする、描き直す、の全flowを画面上で完走できること。

### 主な成果物

- Drawing / Ready / Training / Paused / Replay / Error状態機械。
- 描線・Graph preview、世代、fitness、best-ever、進捗表示。
- Population、表示個体数、速度、停止、再開、reset操作。
- ベスト個体の保存とリプレイ。
- 例外時の安全停止、説明、復帰。
- keyboard操作、focus表示、最低限のscreen-reader label。
- 主要flowのbrowser E2E。

### 受入条件

- 主要flowをbrowser E2Eで最後まで実行できる。
- 学習中にGraphを書き換えられず、古いWorldへUIがアクセスしない。
- x1／x2／x4／x8で物理step数は変化するが、episodeとfitnessの定義は変わらない。
- background tab復帰時に大きな時間を一括消費しない。
- 停止、再開、reset、描き直しが資源を残さない。
- error発生時に画面が停止し、原因と復帰方法を表示する。
- keyboardだけで主要操作へ到達できる。
- 人の手動確認で「世代間の変化」「bestの理由」「描線と骨格の対応」を理解できる。
- `npm run verify` が成功し、E2E結果と手動確認結果を別々に記録する。

### 非ゴール

- ランキング、アカウント、オンライン共有。
- 公開deployment。
- 体験品質が自動試験だけで承認されたと扱うこと。

### 判断ゲート

M6の完了には人による体験確認が必要です。技術試験がすべて通っていても、進化の変化が分かりにくい、操作が理解しにくい、描いた形との対応が納得できない場合は完了にしません。

## 11. M7: 安定化と公開判断

**状態: 技術検証済み（[検証記録](20-m7-release-readiness.md)）。ブラウザ確認・体験品質・公開承認が残っています。**

### 目的

MVP候補を長時間利用、対応ブラウザ、性能、権利、配布サイズの観点で評価し、公開可能か、限定利用に留めるか、追加改修が必要かを判断できる状態にします。

### 到達ゴール

再現可能な検証記録と既知の制約を揃え、公開する／条件付きで公開する／公開を保留する、のいずれかを人が判断できること。

### 主な成果物

- 100世代および30分連続runの安定性記録。
- ChromiumとFirefoxの主要flow確認。
- build size、load時間、simulation throughput、p95 frame timeの最終測定。
- bundle分割または警告を受容する根拠。
- error recovery、context loss、resize、background復帰の確認。
- 名称、文章、アセット、ライセンス、クレジットの確認表。
- 対応環境と既知の制約。
- static buildと公開判断書。

### 受入条件

- 100世代と30分連続runで未処理例外、NaN、継続的な資源増加がない。
- ChromiumとFirefoxで描画からリプレイまでの主要flowを完走する。
- M2で確定したPopulation 32の性能基準を満たす、または変更理由を明記する。
- production buildの大きなchunk警告を解消するか、測定に基づき受容する。
- `npm audit` の結果と、非推奨推移依存の状態を再確認する。
- 独自名称、独自UI、使用アセット、クレジットを人が確認する。
- 技術的合格、体験品質、公開承認を別々に記録する。
- `npm run verify` が成功し、release candidateのhashを記録する。

### 非ゴール

- 人の承認なしでの外部公開。
- 初期MVPでのアカウント、ランキング、課金。
- 未決定のmobile／Safari対応を暗黙に含めること。

### 最終判断ゲート

外部公開、公開先、製品名、アート、収益化、ランキング、保存・共有機能はM7の技術完了とは別承認です。M7完了だけではdeploymentを行いません。

## 12. 実行順序と依存関係

```text
M0 完了
  -> M1 Simulation基盤        完了
  -> M2 Population評価と性能   技術検証済み
  -> M3 進化loop              技術検証済み
  -> M4 単純な一筆入力         技術検証済み   <- 現在地点
  -> M5 枝分かれと編集         次の工程
  -> M6 体験統合
  -> M7 安定化と公開判断
```

M1〜M3は「物理と進化が成立するか」を先に判断するため、一筆UIより優先します。M4〜M5で入力の複雑さを段階的に上げ、M6で初めて全体体験としてまとめます。

## 13. 直近の着手順

**実装のマイルストーンはM7まで終わりました。** 残っているのは、人にしかできない確認と決定です。

1. 製品画面での体験確認（M6判断ゲート、[docs/19](19-m6-experience-review.md) §8）。
2. ChromiumとFirefoxでの完走（[docs/20](20-m7-release-readiness.md) §8-1）。
3. ブラウザ前景タブでの p95 frame time（[docs/15](15-m2-population-performance.md) §8）。
4. 作品名・ロゴ・ライセンスの決定（[docs/20](20-m7-release-readiness.md) §8-3）。
5. 公開するか、条件付きで公開するか、保留するかの決定（[docs/13](13-milestone-quality-and-decision-gates.md) §7）。

技術側で残っている選択肢は、browser E2Eの導入、閉ループ・自己交差の対応、学習中のフリーズ解消（世代内分割かWorker化）です。いずれも人の判断が先です。

### 人が実施する確認の一覧

0. **製品画面での体験確認（M6判断ゲート）**（[docs/19](19-m6-experience-review.md) §8）。
1. ブラウザでの p95 frame time 計測（[docs/15](15-m2-population-performance.md) §8）。
2. 世代変化の視認確認（[docs/16](16-m3-evolution-validation.md) §8）。
3. 実ブラウザでのPointer／キーボード操作（[docs/17](17-m4-stroke-input-validation.md) §8）。
4. 枝分かれとUndoの操作確認（[docs/18](18-m5-branching-validation.md) §10）。
5. browser E2Eフレームワークを導入するかの判断（[docs/17](17-m4-stroke-input-validation.md) §8）。
6. 閉ループ・自己交差・最大Node次数の決定（[docs/18](18-m5-branching-validation.md) §11）。

マイルストーン共通の証拠、完了、承認の扱いは [マイルストーン品質・判断ゲート](13-milestone-quality-and-decision-gates.md) に定めます。
