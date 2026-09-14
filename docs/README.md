# one-stroke-evolution-web ドキュメント索引

更新日: 2026-09-14

## このプロジェクトについて

`one-stroke-evolution-web` は、公開されているゲーム『一筆進化』の体験を参考に、Web向けの独立した再現実装が技術的に成立するかを検証するためのプロジェクトです。

現時点では、事前調査とP0技術スパイクに加えて **M1 Simulation基盤**、**M2 Population評価**、**M3 進化loop**、**M4 単純な一筆入力** を技術検証済みです。描く → 骨格へ変換 → 複数個体を進化 → ベストをリプレイ、までが `bench/stroke-input.html` で一通り動きます。枝分かれ（M5）、体験統合（M6）、安定化と公開判断（M7）は未着手です。**人が行う確認が3件残っています**（§次に行うこと）。

## マイルストーンの状態

| Milestone | 内容 | 状態 | 検証記録 |
|---|---|---|---|
| M0 | P0技術スパイク | 完了 | [11](11-p0-technical-validation.md) |
| M1 | Simulation基盤 | 完了 | [14](14-m1-simulation-validation.md) |
| M2 | Population評価と性能 | 技術検証済み | [15](15-m2-population-performance.md) |
| M3 | 進化loop | 技術検証済み | [16](16-m3-evolution-validation.md) |
| M4 | 単純な一筆入力 | 技術検証済み | [17](17-m4-stroke-input-validation.md) |
| M5 | 枝分かれと編集 | 未着手 | - |
| M6 | 体験統合 | 未着手 | - |
| M7 | 安定化と公開判断 | 未着手 | - |

## 現在の結論

- **決定済み**: 最初の実装候補は `Phaser 4 + Phaser Box2D + TypeScript + Vite` とする。
- **決定済み**: Phaserは入力・描画・UIを担当し、物理シミュレーションと進化計算はフレームワークから分離する。
- **決定済み**: 最初から一筆入力を完成させず、固定骨格の物理・関節制御・進化を先に検証する。
- **確認済み**: Phaser Box2DのTypeScript統合、固定ステップ、2ボーンとRevolute Joint、motor、limitは最小構成で動作する。
- **確認済み**: 4〜6ボーンの単一個体が10,000 stepを有限値で完走し、100回の生成・cleanupでWorldのshape数が基準へ戻る。
- **確認済み**: 1 World内でPopulation 32を実時間の44倍の速さで評価でき、個体間contactは0件、100世代でshape数が基準へ戻る（headless計測）。
- **確認済み**: 5 Seed×50世代で進化群が5/5改善し、進化なし対照群の中央値（4.17）を大きく上回った（17.91）。移動距離は1.2〜3.8体長から5.1〜5.6体長へ。
- **確認済み**: 一筆の描線が、入力イベント密度に依存しない `CreatureGraph` へ変換され、そのGraphで学習loopが完走する。自己交差・輪・短すぎる線は理由付きで拒否する。
- **確認済み**: 自動試験266件、型検査、本番ビルドが成功した。
- **未確認**: ブラウザ前景タブでのp95 frame time、世代変化を人が視認できるか、実ブラウザでのPointer／キーボード操作。
- **未確定**: 製品名、見た目、公開方法、モバイル対応、ランキング、原作に対する再現度。
- **フォールバック**: 技術スパイクの合格条件を満たせない場合はGodotを再評価する。

## 状態ラベル

| ラベル | 意味 |
|---|---|
| **確認済み** | 公開ページ・公式技術資料、または本プロジェクトの自動試験・実測で裏付けが取れた事実 |
| **決定済み** | このプロジェクトで採用する方針 |
| **提案** | 実装開始前またはPoC後に承認・調整が必要な案 |
| **推定** | 公開仕様から合理的に推測したもの。原作内部の事実ではない |
| **未確認** | 実測、実装、手動確認がまだないもの |

マイルストーンの進行状態（未着手／Red／実装中／技術検証済み／手動確認待ち／完了／保留）は [マイルストーン品質・判断ゲート](13-milestone-quality-and-decision-gates.md) §2 に定義しています。**`技術検証済み` は「体験品質が良い」とも「公開可能」とも言いません。**

## ドキュメント一覧

1. [目的・範囲・境界](01-goals-and-scope.md)
2. [原作および関連事例の調査](02-source-research.md)
3. [実現可能性とエンジン選定](03-feasibility-and-engine-decision.md)
4. [一筆入力から物理グラフへの変換](04-stroke-to-graph.md)
5. [物理・関節制御・遺伝的アルゴリズム](05-physics-controller-and-ga.md)
6. [アーキテクチャとデータ境界](06-architecture.md)
7. [PoCロードマップと完了条件](07-poc-roadmap.md)
8. [テスト・品質・性能計画](08-test-quality-and-performance.md)
9. [リスク・未確定事項・意思決定記録](09-risks-open-questions-and-decisions.md)
10. [参考資料](10-references.md)
11. [P0技術検証結果](11-p0-technical-validation.md)
12. [P0完了後の開発計画](12-development-plan.md)
13. [マイルストーン品質・判断ゲート](13-milestone-quality-and-decision-gates.md)
14. [M1 Simulation基盤 検証結果](14-m1-simulation-validation.md)
15. [M2 Population評価と性能 検証結果](15-m2-population-performance.md)
16. [M3 進化loop 検証結果](16-m3-evolution-validation.md)
17. [M4 単純な一筆入力 検証結果](17-m4-stroke-input-validation.md)

実装計画は `superpowers/plans/` にあります。開発用のページと計測スクリプトは `bench/` にあります（`npm run dev` で `/bench/stroke-input.html` などを開けます）。

## 次に行うこと

M4まで技術検証済みです（[M4検証結果](17-m4-stroke-input-validation.md)）。

**人が行う確認（3件）**

1. ブラウザでの p95 frame time 計測 — [M2性能記録](15-m2-population-performance.md) §8（`/bench/frame-time.html`）
2. 世代変化を視認できるかの確認 — [M3検証結果](16-m3-evolution-validation.md) §8（`/bench/replay.html`）
3. 実ブラウザでのPointer／キーボード操作 — [M4検証結果](17-m4-stroke-input-validation.md) §8（`/bench/stroke-input.html`）

**ユーザー判断が必要**: browser E2Eフレームワーク（Playwright等）を導入するか（[M4検証結果](17-m4-stroke-input-validation.md) §8）。

次は [開発計画](12-development-plan.md) の M5 として、戻り線による枝分かれ、Node/Edgeへのsnap、Edge単位Undo、Y字・人型相当の形状を実装します。
