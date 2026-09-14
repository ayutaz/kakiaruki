# one-stroke-evolution-web

『一筆進化』の公開されている体験を参考にした、Web向け独立実装の技術検証プロジェクトです。原作のコード、アセット、非公開パラメータにはアクセスしておらず、内部設計はすべて独自案です。

プレイヤーが一筆で骨格を描き、同じ形の複数個体が関節の動かし方を進化させて移動能力を獲得する、という体験を目指しています。**形を決めるのはプレイヤーで、進化計算が探索するのは関節の動かし方です。**

## 現在地点

**M4（単純な一筆入力）まで技術検証済み**です。描く → 骨格へ変換 → 1つの物理Worldで複数個体を評価 → 遺伝的アルゴリズムで世代交代 → ベスト個体をリプレイ、までが動きます。

| Milestone | 内容 | 状態 |
|---|---|---|
| M0 | P0技術スパイク（2ボーン + Revolute Joint） | 完了 |
| M1 | Simulation基盤（Graph検証、Body／Joint生成、episode、cleanup） | 技術検証済み |
| M2 | Population評価と性能（レーン分離、Population 1／8／32） | 技術検証済み（p95 frame timeのみ未計測） |
| M3 | 進化loop（Seed付きGA、Fitness、対照群、リプレイ） | 技術検証済み（世代変化の視認確認が未実施） |
| M4 | 単純な一筆入力（Pointer、resampling、位相分割、Graph化） | 技術検証済み（実ブラウザ操作の確認が未実施） |
| M5 | 枝分かれと編集 | 未着手 |
| M6 | 体験統合 | 未着手 |
| M7 | 安定化と公開判断 | 未着手 |

`技術検証済み` は「自動試験・型検査・build・必要な実測が合格した」という意味で、**体験品質が良い**とも**公開可能**とも言いません。

### 主な実測結果

- Population 32 の6秒エピソードを **0.136秒**で評価（実時間の44倍、headless計測）。
- 個体間の接触 **0件**、100世代の生成・cleanup後もWorldのshape数が基準値へ復帰。
- 5 Seed × 50世代の進化実験で **5/5 Seed が改善**。進化群 fitness 中央値 17.91 に対し、進化なし対照群は 4.17。移動距離は 1.2〜3.8 体長から 5.1〜5.6 体長へ。
- 一筆の入力イベント密度を10倍変えても、生成される骨格の節点座標は **完全一致**。

## 必要環境

- Node.js 24以上
- npm 11以上

## コマンド

```bash
npm ci              # lockfile通りの再現インストール
npm run dev         # 開発サーバー http://127.0.0.1:5173/
npm run test        # 自動試験（Vitest、node環境）
npm run typecheck   # 型検査
npm run build       # 型検査 + 本番ビルド
npm run verify      # 自動試験 + 型検査 + 本番ビルド
npm run bench       # Population 1／8／32 の throughput 計測（headless）
npm run experiment  # 5 Seed × 50世代の進化判定実験（約70秒）
```

`npm run test` は型検査をしません。実装を変えたら `npm run typecheck` も実行してください。

## 開発用ページ

`npm run dev` の後、ブラウザで開けます。製品UIはM6で作ります。

| URL | 内容 |
|---|---|
| `/` | P0の2ボーンデモ（モーター、角度制限、速度の切替） |
| `/bench/stroke-input.html` | 一筆で描く → 骨格preview → 学習 → リプレイ |
| `/bench/replay.html` | 固定骨格で学習し、世代0と選んだ世代のベストを並べて再生 |
| `/bench/frame-time.html` | Population別の p50／p95／p99 frame time 計測 |

## 人による確認が残っているもの

自動試験では判定できない項目です。手順は各検証記録に書いています。

1. ブラウザ前景タブでの **p95 frame time** — [docs/15](docs/15-m2-population-performance.md) §8
2. **世代変化を人が理解できるか**（M3の判断ゲート） — [docs/16](docs/16-m3-evolution-validation.md) §8
3. 実ブラウザでの **Pointer／キーボード操作** — [docs/17](docs/17-m4-stroke-input-validation.md) §8

また、browser E2Eフレームワーク（Playwright等）を導入するかは**ユーザー判断**として保留しています。

## ドキュメント

設計、開発計画、完了条件、検証記録は [docs/README.md](docs/README.md) から参照してください。

- 現在地点と次工程: [docs/README.md](docs/README.md)
- 実行計画と受入条件: [docs/12-development-plan.md](docs/12-development-plan.md)
- 完了判定と承認の運用: [docs/13-milestone-quality-and-decision-gates.md](docs/13-milestone-quality-and-decision-gates.md)
- 検証記録: [docs/11](docs/11-p0-technical-validation.md)（P0）、[docs/14](docs/14-m1-simulation-validation.md)〜[docs/17](docs/17-m4-stroke-input-validation.md)（M1〜M4）
- 実装計画: `docs/superpowers/plans/`

## 再現とライセンスの境界

原作のソースコード、アセット、非公開パラメータは参照していません。遺伝子形式、Fitness、選択方式、物理設定はすべて本プロジェクト独自の再現案です。出荷時の名称・ロゴ・アセットは独自のものにし、原作の画像・音・文章・画面配置をコピーしません。詳細は [docs/01-goals-and-scope.md](docs/01-goals-and-scope.md) §3 を参照してください。
