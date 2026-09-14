# 実現可能性とエンジン選定

## 1. 結論

**Phaser 4 + Phaser Box2D + TypeScript + ViteでPoCを開始する価値は十分にあります。** Godotへの切替は現時点では行わず、明示した技術ゲートで判断します。

この結論は「完成が保証された」という意味ではありません。当初の最大の不確実性は、一筆から安定した物理グラフを作る処理と、多個体・高速ステップの実測性能でした。

**2026-09-14 更新**: M1〜M4の実装により、この2点は headless 計測の範囲で解消しました（§5）。残る不確実性は、ブラウザ上のUI応答性、体験としての面白さ、枝分かれを含む複雑な描線の扱いです。

## 2. 採用候補

| 要素 | 候補 | 状態 | 理由 |
|---|---|---|---|
| 描画・入力・UI | Phaser 4 | **決定済み** | Webを主対象とし、Pointer、Scene、Camera、Graphicsを利用できる |
| 物理 | Phaser Box2D | **決定済み** | Box2D v3系、カプセル、Revolute Joint、limit、motor、max torque |
| 言語 | TypeScript | **決定済み** | グラフ、遺伝子、シミュレーション境界を型で固定できる |
| ビルド | Vite | **決定済み** | 小さなWeb PoCを素早く構築でき、公式リポジトリにもVite例がある |
| テスト | Vitest 5 | **決定済み** | 純粋ロジックの高速単体テストと相性がよい。node環境でBox2Dのcontract試験まで実行できている |
| ブラウザE2E | Playwright系 | **保留（ユーザー判断）** | Pointer入力、UI、長時間実行、描画有無の結線を確認できる。M7時点でも未導入。M6・M7の受入条件が各1項目、未達のまま。判断材料は [M6検証結果](19-m6-experience-review.md) §9 |

2026-09-14時点で、Phaser公式GitHubの最新Releaseは4.2.1、Phaser Box2Dの最新Releaseは1.1.0です。実装時にはlockfileで実際に検証した版を固定します。文書上の最新版を、そのまま互換性確認なしで採用したとは扱いません。

## 3. Matter.jsではなくBox2Dを選ぶ理由

今回の中心は「関節を指定角度付近へ動かすこと」です。Phaser Box2DのRevolute Jointには、角度下限・上限、モーター有効化、目標速度、最大トルクが用意されています。

周期的な目標角度を作り、現在角との差からモーター速度を更新する制御を素直に構成できます。Matter.jsでも拘束やトルク操作による再現は可能ですが、今回必要な機能をより直接表現できるBox2Dを優先します。

## 4. PhaserとGodotの比較

| 評価軸 | Phaser + Box2D | Godot | 今回の判断 |
|---|---|---|---|
| ブラウザ配布 | Webネイティブ | Web exportが必要 | Phaser優位 |
| TypeScript | 直接利用 | 標準言語ではない | Phaser優位 |
| 2D物理関節 | 必要機能あり | 必要機能あり | 両方可 |
| 入力・自由描画 | 実装可能 | 実装可能 | 両方可 |
| 描画と計算の分離 | ライブラリ境界を作りやすい | PhysicsServer2Dでも可能 | ややPhaser優位 |
| Editor | 弱い | 強い | Godot優位 |
| Web Workerへの移行 | JS/TSの標準手段 | Web export条件に依存 | Phaser優位 |
| Webの配布制約 | 通常の静的ホスティング | thread利用時はcross-origin isolation等に注意 | Phaser優位 |
| 原作との同系統 | 異なる | 原作がGodot | Godot優位だが内部仕様は非公開 |

Godotでも十分実現可能です。GodotのPhysicsServer2Dにはカプセル形状、Pin Jointの角度制限とモーター速度があり、Nodeから独立して物理オブジェクトを扱えます。ただし本プロジェクトはWeb公開とTypeScriptを優先するため、Phaserから始めます。

## 5. Phaser Box2Dの検証状態

公式リポジトリのIssueには、TypeScriptからnpm packageをimportする際の報告、複数Worldで`WorldStep`のaccumulatorを共有するという報告、Worldを32回超作り直した場合の報告があります。これらは利用者報告であり、本プロジェクト環境で再現確認した事実ではありません。

P0で上2項目、M1〜M2で下2項目を確認しました。

- **確認済み（P0）**: `phaser-box2d`をlockfile付きで導入し、局所adapter経由でTypeScriptの型検査と本番buildが通る。
- **確認済み（P0）**: 高水準の`WorldStep` helperに依存せず、Box2Dの明示的な固定step APIで時間を管理できる。
- **確認済み（M1／M2）**: 世代ごとにWorldを破棄・作成せず、1つのWorldを再利用してBodyとJointだけを安全に入れ替えられる。100世代×8個体の反復後もWorldのshape数が基準値へ戻り、5世代実行後の結果がまっさらなWorldでの同条件実行と一致する。
- **確認済み（M2）**: 32個体を1 World内の離れたレーンへ置く方式で個体間干渉を防げる。`categoryBits`／`maskBits` で構造的に排除し、contact eventの分類で0件を確認した。隔離を外すと実際に接触が検出されることも確認済み。

### M1〜M2で判明した実装上の注意

- `b2World_GetCounters()` は**空実装**で値を返さない。資源計測は `b2World_OverlapAABB` の残存shape数で代替する（D-008）。
- `CreateRevoluteJoint` は `referenceAngle` を設定しない。曲がった骨格の初期joint角度を0にするには `b2DefaultRevoluteJointDef()` へ設定して渡す。
- `CreateCapsule` に `width`／`height` を渡すと全長が `height + 2 * radius` になる。node間距離を正確に合わせるには `center1`／`center2`／`radius` を明示する。

詳細は [P0技術検証結果](11-p0-technical-validation.md)、[M1検証結果](14-m1-simulation-validation.md)、[M2性能記録](15-m2-population-performance.md) を参照してください。

## 6. Godotへ切り替える判断ゲート

次のいずれかが、修正範囲を限定したP0/P1でも解消できない場合に切替を検討します。2026-09-14時点の判定を併記します。

| # | ゲート | 判定 |
|---|---|---|
| 1 | TypeScriptから公開APIを安定してimportできず、保守不能なvendor改変が必要 | **解消済み**。vendorは未改変。局所adapterと自前の型宣言で足りている（D-007） |
| 2 | 2〜6本の固定骨格でRevolute Jointのlimitとmotorを安定制御できない | **解消済み**。10,000 stepで有限値を維持し、駆動中の関節角度がlimit内に留まる |
| 3 | 32個体の固定骨格を、対象PCの前景タブで少なくとも実時間相当以上に進められない | **headlessでは解消済み**（実時間の37倍。観察フェーズは最大構成でも1 stepあたり0.29 ms）。**前景タブでの実測は未実施** |
| 4 | 世代切替の反復でWorld／Body／Joint資源が継続的に増え、再利用設計でも止められない | **解消済み**。100世代でshape数がbaselineへ復帰 |
| 5 | ブラウザ向け制約が、必要な公開環境や体験要件と衝突する | **未確認**。M6／M7で判断 |

現時点でGodotへの切替を示す測定結果はありません。ゲート3のブラウザ実測が終わるまで、この判定は暫定です。切替は[マイルストーン品質・判断ゲート](13-milestone-quality-and-decision-gates.md) §7 のとおり**ユーザー判断**です。

Godotへ切り替えても、StrokeGraph、Genome、GA、Fitness、Seed付き試験仕様はエンジン非依存として再利用できる設計にします。
