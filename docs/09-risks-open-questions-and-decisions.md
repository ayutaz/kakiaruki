# リスク・未確定事項・意思決定記録

## 1. リスク一覧

| ID | リスク | 影響 | 現在の対策 | 状態 |
|---|---|---|---|---|
| R-01 | 自由描線が短すぎる骨を大量生成 | 物理不安定、遅延 | resampling、位相分割、長さ・本数上限 | **提案** |
| R-02 | RDPが戻り線を消す | 枝が失われる | 位相イベント検出後にedge単位で簡略化 | **提案** |
| R-03 | 閉ループが過拘束になる | 発散、震え | P4まで保留、substepと質量比を実測 | **未確認** |
| R-04 | 多個体でブラウザが重い | 学習体験悪化 | 表示と計算を分離、32体から測定 | **headlessで余裕を確認（実時間44倍）・ブラウザ未確認** |
| R-05 | Phaser Box2DのTS import | build不能 | `dist/PhaserBox2D.js`を局所adapterからimportし、最小型宣言を管理 | **P0で対策確認済み** |
| R-06 | 複数World／再作成のIssue | 世代継続不能 | P1では1 World再利用、Body／Joint cleanupを採用 | **M2で100世代×8個体を確認・30分連続はM7** |
| R-07 | Fitness hackだけが増える | 意図しない解 | 数値バグだけ除外、創発性は残す | **M3で実装済み・人の視認確認は未実施** |
| R-08 | 進化が短時間で改善しない | 面白さ不足 | 小さいGenome、Seed群、対照実験 | **M3で5/5 Seed改善を確認（zigzag6のみ）** |
| R-09 | ブラウザ間でreplayがずれる | 共有不能 | runtime version記録、必要なら軌跡保存 | **未確認** |
| R-10 | 原作との見た目・名称の混同 | 公開上の問題 | 独自名称・UI・アセット、人手確認 | **決定済み** |
| R-11 | 高速stepでUIが固まる | 操作不能 | frame time budget、snapshot間引き | **提案** |
| R-12 | tabがbackgroundで時間を蓄積 | 復帰時に暴走 | visibility changeでpause／accumulator破棄 | **提案** |

## 2. 未確定事項

### 体験・製品

1. 最終タイトルは何にするか。
2. 原作への忠実な再現と、独自ゲームへの発展のどちらを優先するか。
3. ゴールは右方向移動だけか、ジャンプ・坂・障害物も含めるか。
4. 絵柄、音、演出の方向性。
5. ランキングやGenome共有が必要か。
6. 個人利用、限定公開、一般公開、収益化のどこまでを想定するか。

### 入力・Graph

7. 任意の交差を関節として扱うか、見た目の交差だけにするか。
8. 単純輪をMVP必須にするか。
9. 線の太さを物理半径へ反映するか。
10. Node次数や最大骨数をユーザー設定にするか。

### 進化

11. 1本のglobal frequencyで十分か。
12. torqueをGeneに含めるか、全関節共通にするか。
13. Energy penaltyをどの程度入れるか。
14. 一定世代停滞時にmutation幅を変えるか。
15. 進化中のbest-everを保存するか、現世代bestだけにするか。

### 配布・対応環境

16. Chromium以外を正式対象にするか。
17. touch／mobileを初期対象にするか。
18. Worker化に必要な性能閾値をどこに置くか。
19. 保存をlocal storage / IndexedDB / file downloadのどれにするか。

## 3. 意思決定記録

### D-001: Web技術から開始する

- 状態: **決定済み**
- 決定: Phaser + Phaser Box2D + TypeScript + ViteでPoCを開始する。
- 理由: Web公開を第一にし、入力・描画・物理・関節制御をブラウザ内で完結できる。
- 再評価: P0/P1の合格条件を満たせない場合。

### D-002: Matter.jsを第一候補にしない

- 状態: **決定済み**
- 決定: 関節motorと角度limitを直接扱えるPhaser Box2Dを優先する。
- 再評価: Phaser Box2Dの統合または保守性がP0で不合格の場合。

### D-003: 形態は進化させない

- 状態: **決定済み（MVP）**
- 決定: プレイヤーが描いたCreatureGraphをPopulation全体で固定し、controllerだけを進化させる。
- 理由: 公開体験と整合し、探索空間を小さく保てる。

### D-004: 固定骨格から検証する

- 状態: **決定済み**
- 決定: Stroke入力より先に、固定4〜6骨格で物理とGAを検証する。
- 理由: 失敗原因を「入力変換」と「進化」に分離するため。

### D-005: SimulationをPhaserから分離する

- 状態: **決定済み**
- 決定: Phaserはadapterとし、Graph／GA／Fitnessを純粋TypeScriptに置く。
- 理由: テスト、性能測定、Worker化、Godotへの方針転換を容易にする。

### D-006: P1以降は1 Worldを再利用する

- 状態: **決定済み**
- 決定: Populationを1 World内の分離レーンで評価し、世代ごとにWorldを作り直さない。
- 理由: 公開Issueで報告されている複数Worldと再作成のリスクを避ける。

### D-007: Phaser Box2Dは配布済みdistを局所adapter経由で使う

- 状態: **決定済み（P0）**
- 決定: `phaser-box2d@1.1.0` はpackage rootではなく `phaser-box2d/dist/PhaserBox2D.js` からimportし、必要最小限の型宣言をプロジェクト側に置く。
- 理由: npm packageの `main` が示すroot entryが実体と一致せず、公式packageにTypeScript宣言も含まれていないため。
- 再評価: upstream packageでentrypointと型宣言が整備された時。

### D-008: 資源リーク検出は OverlapAABB による残存shape計測で行う

- 状態: **決定済み（M1）**
- 決定: `b2World_GetCounters()` は空実装で値を返さないため、cleanup検証には `b2World_OverlapAABB` に巨大AABBと全ビットfilterを渡した残存shape数を使う。
- 理由: Body／Joint数の内部カウンタを公開APIから取得できないため。
- 再評価: upstreamで `b2World_GetCounters` が実装された時。

### D-009: 物理実装への依存は simulation port で遮断する

- 状態: **決定済み（M1）**
- 決定: `CreatureHandle` と `SteppableWorld` を `src/simulation/ports/` に置き、`EpisodeRunner` と `src/domain/` はBox2D adapterを直接参照しない。`tests/unit/layering.test.ts` が推移的依存を機械的に検査する。
- 理由: headless試験、性能測定、Worker化、Godotへの方針転換を容易にするため（D-005）。

## 4. 次の承認点

M3まで技術検証済みです（[M3検証結果](16-m3-evolution-validation.md)）。人が行う確認が2件残っています（p95 frame time、世代変化の視認）。次は [開発計画](12-development-plan.md) のM4（Pointer入力から `CreatureGraph` への変換）です。製品名、アート、ランキング、公開先は引き続き保留できます。
