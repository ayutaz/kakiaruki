# M7 安定化と公開判断 検証結果

検証日: 2026-09-14

## 1. 結論

**技術面は合格です。** 長時間の連続運転で壊れず、資源も増え続けません。依存の脆弱性は0件、production buildのchunk警告も解消しました。

**公開できる状態ではありません。** 次の3つは、いずれも人の確認・決定が必要で、まだ終わっていません。

| 区分 | 状態 |
|---|---|
| 技術的合格 | **合格**（§5 の判定条件1〜5、7、8） |
| 体験品質 | **未確認**。M6の体験確認（[docs/19](19-m6-experience-review.md) §8）が未了 |
| 公開承認 | **未決**。名称・ライセンス・公開先は人の決定（§8、§9） |

この3つは意図的に分けています。技術試験がすべて通っても、体験品質と公開承認の代わりにはなりません（[docs/13](13-milestone-quality-and-decision-gates.md) §3）。

## 2. 対象成果物

| 項目 | 値 |
|---|---|
| release candidate | §10 |
| 長時間run | `bench/soak.ts`（`npm run soak`） |
| 回帰試験 | `tests/integration/long-run.test.ts` |

## 3. 実行環境

| 項目 | 値 |
|---|---|
| OS | macOS 26.2 (arm64) / Apple M4 Max / 16 core / 64 GB |
| Node.js | v25.2.0 / npm 11.6.2 |
| Phaser | 4.2.1（**製品画面では使いません**。P0デモのみ） |
| Phaser Box2D | 1.1.0 |
| TypeScript | 7.0.2 / Vite 8.2.2 / Vitest 5.0.0 |

ブラウザでの測定は未実施です（§8）。

## 4. 測定開始前に固定した判定条件

| # | 条件 | 判定 |
|---|---|---|
| 1 | 100世代の連続実行で未処理例外が0件 | 例外が出たら不合格 |
| 2 | 100世代を通して統計値がすべて有限 | NaN/Infinityが1つでも出たら不合格 |
| 3 | 30分の連続運転で、片付け後のshape数が基準（地面だけ=1）へ戻る | 戻らなければ不合格 |
| 4 | 30分の連続運転で、heapの後半平均が前半比1.5倍以内 | 超えたら不合格 |
| 5 | Population 32 の実時間比が 1.0 以上 | M2で固定した基準 |
| 6 | production buildにchunk警告が出ない、または測定に基づき受容 | - |
| 7 | `npm audit` の高危険度が0件 | 出たら内容と対処を記録 |
| 8 | `npm run verify` 成功、release candidate hash を記録 | - |

**結果を見てから閾値を変えていません。**

## 5. 判定条件ごとの結果

| # | 条件 | 判定 | 実測 |
|---|---|---|---|
| 1 | 100世代で未処理例外0件 | **合格** | 自動試験100世代、長時間run 5,460世代とも0件 |
| 2 | 100世代を通して統計値がすべて有限 | **合格** | 全世代の fitness 4種、終端重心、motorEffort |
| 3 | 30分連続runで shape数が基準へ戻る | **合格** | 273周すべてで片付け後 shape 1 |
| 4 | 30分連続runで heap の後半平均が前半比1.5倍以内 | **合格** | 88.3 MB → 88.8 MB（**1.01倍**） |
| 5 | Population 32 の実時間比 ≥ 1.0 | **合格** | 37.4x |
| 6 | build に chunk 警告が出ない | **合格** | 警告なし。217 kB（gzip 62 kB） |
| 7 | `npm audit` の高危険度0件 | **合格** | 0 vulnerabilities |
| 8 | `npm run verify` 成功と RC hash 記録 | **合格** | §7、§10 |

**8条件すべて合格です。** ブラウザ確認・体験品質・公開承認はこの8条件に含まれません（§8、§9）。

## 6. 実測

### 6-1. 100世代の回帰試験（自動試験）

`tests/integration/long-run.test.ts`。手描きの人型骨格（骨7本）、Population 32、100世代、episode 2秒、Seed 3。

- 全100世代で `bestFitness` / `medianFitness` / `meanFitness` / `bestNormalizedForwardProgress` がすべて有限。
- 各世代のベスト個体の終端重心と `motorEffort` もすべて有限。
- 終了後、Worldのshape数が **1（地面だけ）** へ戻る。
- 描く → 学習 → 観察 → 片付け を12周しても、毎回shape数が1へ戻る。

### 6-2. 30分連続run

`npm run soak`。描く → 学習 → 観察 → 片付け を30分くり返します。1周ごとに5種類の形を順に描き、Seedも変えます（Population 32・20世代・episode 6秒）。

```text
経過 30.1 分 / 273 周 / 5460 世代
heap 前半平均 88.3 MB → 後半平均 88.8 MB（1.01倍）
片付け後の shape: 1（地面だけなら1）

条件1 未処理例外が0件: PASS
条件2 統計値がすべて有限: PASS
条件3 shape数が基準へ戻る: PASS
条件4 heapが単調増加しない（1.5倍以内）: PASS
overall: PASS
```

| 項目 | 実測 |
|---|---|
| 連続運転 | 30.1 分 |
| 周回 | 273 周（描く→学習→観察→片付け） |
| 世代 | 5,460 世代 |
| 個体評価 | 約 174,700 回（5,460 世代 × 32 個体） |
| 未処理例外 | **0 件** |
| 有限でない統計値 | **0 件** |
| 片付け後の shape 数 | **273周すべて 1** |
| heap | 前半 88.3 MB → 後半 88.8 MB（**1.01倍**）。25〜150 MBを往復し、単調増加なし |
| 進行速度 | 約9周/分。後半で落ちていません |

**Worldは30分間ずっと同じ1つを使い回しています**（D-006）。273回の学習と273回の観察を通して作り直していません。

この計測はNode上のheadlessです。**ブラウザでの30分運転は未実施**です（§8-1）。

### 6-3. 性能

`npm run bench`（headless、`zigzag6` 骨6本）:

| Population | world steps | episode wall s | physics steps/s | 実時間比 |
|---:|---:|---:|---:|---:|
| 1 | 360 | 0.0073 | 49,044 | 817.4x |
| 8 | 360 | 0.0422 | 8,534 | 142.2x |
| 32 | 360 | 0.1603 | 2,245 | **37.4x** |

M2の基準「Population 32 の実時間比 1.0 以上」を満たします（M2実測 38.8x → 今回 37.4x、測定ゆらぎの範囲）。

**観察フェーズ（製品画面）の1 stepあたりのコスト**。これが実際のframe予算を決めます。

| 形 | 骨 | 同時表示 | 1 step | 16.7 ms中の割合 |
|---|---:|---:|---:|---:|
| 単純な線 | 6 | 8 | 0.15 ms | 1% |
| 人型 | 10 | 8 | 0.22 ms | 1% |
| 入り組んだ線 | 14 | 8 | **0.29 ms** | **2%** |

最大構成でも1フレーム予算の2%です。描画とUIに十分な余裕があります。

**学習フェーズは別です。** 1世代の評価は骨20本で約0.47秒かかり、その間フレームは進みません。製品画面は1フレームに1世代だけ進め、進捗を出します（[D-011](09-risks-open-questions-and-decisions.md)）。**学習中に60 fpsは出ません。これは設計どおりです。**

| 骨数 | 1世代 | 20世代の合計 |
|---:|---:|---:|
| 14 | 0.390 秒 | 7.8 秒 |
| 20 | 0.474 秒 | 9.5 秒 |
| 24 | 0.564 秒 | 11.3 秒 |

### 6-4. build

```text
npm run build
  dist/index.html                 4.96 kB │ gzip:  1.69 kB
  dist/assets/index-*.css         3.44 kB │ gzip:  1.41 kB
  dist/assets/index-*.js        216.75 kB │ gzip: 62.20 kB
  ✓ built in 79ms
```

**chunk警告は出ません。** P0から持ち越していた500 kB警告（[docs/11](11-p0-technical-validation.md) §8）は、M6で製品画面からPhaserを外したことで解消しました。

| | P0〜M5 | M7 |
|---|---:|---:|
| JavaScript | 1,541 kB | **217 kB** |
| gzip後 | 403 kB | **62 kB** |
| chunk警告 | あり | **なし** |

### 6-5. 依存

```text
npm audit
  found 0 vulnerabilities

npm ci --dry-run
  up to date
```

| 依存 | version | 備考 |
|---|---|---|
| `phaser` | 4.2.1 | **製品画面では読み込みません**。P0デモのみ |
| `phaser-box2d` | 1.1.0 | 物理。`dist/PhaserBox2D.js` だけをimport（D-007） |
| `@types/node` / `typescript` / `vite` / `vitest` | 開発のみ | - |

- **脆弱性0件。** P0時点で見えていた非推奨の推移依存（ESLint 9系）は、現在の解決結果では非推奨警告が出ません。`phaser-box2d` が `eslint` を実行時依存として引き込む構成は変わっていませんが、**ブラウザへは出荷されません**（importは `dist/PhaserBox2D.js` に限定）。
- 更新可能: `vite` 8.2.2 → 8.3.0、`@types/node` 24 → 26。**M7では更新しません。** 安定化の最中にversionを動かすと、ここまでの実測値と対応が取れなくなるためです。公開前に更新する場合は、`npm run verify` と `npm run soak` を回し直します。

## 7. 自動試験で確認したこと

`npm run verify`: Test Files 38 / Tests 331、型検査・build ともに成功。

M7で追加したもの:

- 100世代の回帰（手描き骨格、Population 32、全統計値の有限性、World復帰）。
- 描く → 学習 → 観察 を12周しても資源が残らないこと。
- 観察の復帰: 壊れた形を渡されても、いま見ている観察を壊さず、理由を投げて操作を続けられる。

### 配線切断証明

| 外した配線 | 失敗した試験 |
|---|---|
| 観察開始時の検証を `stop()` の後ろへ動かす | `keeps the running observation when a new one cannot start` のみ |

## 8. 人が行う確認（未実施）

### 8-1. ブラウザでの完走（M7受入条件）

```bash
npm run dev   # http://127.0.0.1:5173/
```

**Chromium と Firefox の両方**で、描く → 学習 → 観察 → 描き直しを完走してください。E2Eフレームワークは未導入のため、自動試験では代替できません（§9）。

- console に error / warning が出ないこと。
- 学習中に進捗が進むこと（フリーズしたように見えないこと）。
- 30分ほど開いたまま操作を続けても、重くならないこと。

### 8-2. 体験品質（M6判断ゲート）

[docs/19](19-m6-experience-review.md) §8 の手順。**未了です。** これが終わるまで体験品質は「未確認」のままです。

### 8-3. 権利・表示の確認

出荷前に人が確認する項目です（[docs/01](01-goals-and-scope.md) §3）。現状を調べた結果を併記します。

| 項目 | 現状 | 要確認 |
|---|---|---|
| 作品名 | **「カキアルキ」（Kakiaruki）**（2026-09-14 決定）。「描き」＋「歩き」の造語で、原作名の要素を含みません | 決定済み |
| ロゴ | なし | 必要なら独自に用意する。文字だけで運用することもできます |
| 画像・音・フォントファイル | **1つも同梱していません**。描画はすべてCanvas 2D、文字はOS標準フォント | そのままで問題ないか |
| 配布物に含まれる第三者コード | **Phaser Box2D 1.1.0（MIT、Phaser Studio）**。Erin Catto 氏の Box2D v3 の移植。ビルド時にtree-shakeされて成果物へ入る。`THIRD-PARTY-NOTICES.md` に表示し、製品画面のfooterからも辿れる | 表示が十分か |
| 原作への言及 | 製品画面には原作名を書いていません。footerに「公開された体験を参考にした独自実装」の1文のみ | 表現が適切か |
| ライセンス | **Apache License 2.0**（Copyright 2026 ayutaz、2026-09-14 決定）。`LICENSE` / `NOTICE` / `THIRD-PARTY-NOTICES.md` を追加済み | 決定済み |
| リポジトリ | public | 公開範囲をこのままにするか |

2026-09-14 に `bench/p0-demo.html` のmeta descriptionから「一筆進化Web版」という表記を外しました。自作を原作の一版であるかのように書いていたためです。

## 9. 判断ゲート（人の決定が必要）

| # | 項目 | 現状 |
|---|---|---|
| 1 | browser E2E（Playwright等）を導入するか | 未導入。M6・M7の各1項目が未達のまま |
| 2 | 製品画面でPhaserを使うか、Canvas 2Dで足りるか | Canvas 2Dで実装済み。build 1,541 kB → 217 kB |
| 3 | 閉ループ・自己交差・最大Node次数をMVPへ含めるか | 拒否のまま（[docs/18](18-m5-branching-validation.md) §11） |
| 4 | ロゴ | 未作成。作品名は「カキアルキ」、ライセンスは Apache-2.0 で決定済み（§8-3） |
| 5 | 公開するか、条件付きで公開するか、保留するか | **未決**。M7の技術完了だけではdeploymentを行いません（[docs/13](13-milestone-quality-and-decision-gates.md) §7） |

## 10. release candidate

| 項目 | 値 |
|---|---|
| commit | `1356790`（`1356790a986a7f6e5174f72a56eaba7e7be125e7`） |
| branch | `main` |
| `npm run verify` | Test Files 38 / Tests 333、型検査・build 成功 |
| build出力 | `dist/index.html` 4.96 kB、`index-*.css` 3.44 kB、`index-*.js` 216.75 kB（gzip 62.20 kB） |
| 長時間run | 30.1 分 / 273 周 / 5,460 世代、overall PASS |

このhash以降の変更は、このhashを書き込んだ記録そのものだけです。コードとbuild出力は変わりません。

**これは「技術的に合格した候補」であり、公開して良いという意味ではありません。** 公開は §9 の決定を経てから行います。

## 11. 公開（2026-09-14）

ユーザーの明示的な依頼により、リポジトリを public にし、製品画面を GitHub Pages へ公開しました。[docs/13](13-milestone-quality-and-decision-gates.md) §7 の「外部hostへのdeploymentまたは一般公開」にあたる操作です。

| 項目 | 値 |
|---|---|
| 公開URL | <https://ayutaz.github.io/kakiaruki/> |
| リポジトリ | public（それまでは private） |
| 公開方法 | `main` への push で GitHub Actions がbuildして配信（`.github/workflows/deploy.yml`） |
| 公開前の関門 | `npm run verify`（自動試験 + 型検査 + build）。落ちたら公開されない |
| 公開対象 | 製品画面（`index.html`）のみ。`bench/` の開発ページは配信しません |
| 確認 | HTML・JS・CSS がいずれも200。`<title>` と asset のパスを確認 |

vite の `base` を相対パスにしてあります。リポジトリ名のサブパス配下でも、ルート直下でも同じ成果物が動きます。**リポジトリ名を変えてもビルド設定を触らずに済みます。**

### リポジトリ名の変更（2026-09-14）

作品名を「カキアルキ」に決めたあと、リポジトリ名を `one-stroke-evolution-web` → **`kakiaruki`** へ変更しました。旧名は原作の公開ページのスラッグ（`one-stroke-evo`）に近く、独自の作品として識別しづらかったためです。

| | 変更前 | 変更後 |
|---|---|---|
| リポジトリ | `ayutaz/one-stroke-evolution-web` | `ayutaz/kakiaruki` |
| 公開URL | `https://ayutaz.github.io/one-stroke-evolution-web/` | **`https://ayutaz.github.io/kakiaruki/`** |
| package名 | `one-stroke-evolution-web` | `kakiaruki` |

GitHubは旧URLから新URLへリダイレクトしますが、**恒久的な保証はありません**。共有するときは新しいURLを使ってください。

**公開した時点で未了だったもの**（§8、§9）:

- 体験品質の確認（[docs/19](19-m6-experience-review.md) §8）
- ChromiumとFirefoxでの完走（§8-1）
- 作品名とライセンスは公開後の 2026-09-14 に確定しました（「カキアルキ」／ Apache-2.0）

公開は「技術的に動く状態のものを見られるようにした」であって、体験品質の承認でも、権利面の確定でもありません。

## 12. 未確認事項と持ち越し

1. **ブラウザ（Chromium / Firefox）での完走**（§8-1）。
2. **体験品質の確認**（§8-2）。M6の判断ゲート。
3. **名称・ライセンス・公開判断**（§8-3、§9）。
4. ブラウザ前景タブでの p95 frame time（[docs/15](15-m2-population-performance.md) §8）。headlessの数値は §6-3 にありますが、描画を含む実測ではありません。
5. 学習中のフリーズ。1世代ずつに分けましたが、1世代あたり最大0.5秒は止まります。世代内の分割かWeb Worker化は未実施。
6. mobile / Safari は対象外のまま。
7. 依存の更新（vite 8.3.0 ほか）は公開前に判断。
