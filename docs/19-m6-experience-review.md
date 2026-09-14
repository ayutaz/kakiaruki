# M6 体験統合 検証結果

検証日: 2026-09-14

## 1. 結論

M6の受入条件（[開発計画](12-development-plan.md) §10）のうち、**自動試験で検証できる7項目に合格**しました。描く → 学習 → 観察 → 描き直しを、開発ページへ触れずに `index.html` だけで完走できます。

**2項目は未達です。**

- **browser E2E**: フレームワークを導入していません。導入可否は**ユーザー判断**として保留中です（[docs/17](17-m4-stroke-input-validation.md) §8）。
- **人による体験確認**: 未実施です。§8 の手順で人が行う必要があります。

したがって M6 は「**技術検証済み・手動確認待ち**」であり、完了ではありません。

## 2. 対象成果物

| 項目 | 値 |
|---|---|
| commit | `aa90f6a` |
| 実装計画 | `docs/superpowers/plans/2026-09-14-m6-experience.md` |
| 製品画面 | `index.html` + `src/main.ts` |
| 新規module | `src/ui/app-state.ts`、`src/app/observation-session.ts`、`src/game/rendering/scene-renderer.ts` |
| 退避 | P0デモを `bench/p0-demo.html` + `src/p0-main.ts` へ移動 |

## 3. 実行環境

| 項目 | 値 |
|---|---|
| OS | macOS 26.2 (arm64) / Apple M4 Max |
| Node.js | v25.2.0 / npm 11.6.2 |
| TypeScript | 7.0.2 / Vite 8.2.2 / Vitest 5.0.0 |

## 4. 実行commandと結果

```text
npm run verify
  Test Files  37 passed (37)
  Tests       323 passed (323)
  Type check  passed
  Build       passed

  dist/index.html                 4.96 kB │ gzip:  1.69 kB
  dist/assets/index-*.css         3.44 kB │ gzip:  1.41 kB
  dist/assets/index-*.js        215.16 kB │ gzip: 61.79 kB
```

**Viteの500 kB chunk警告が出なくなりました。** 製品画面がPhaserを読み込まなくなったためです。P0から持ち越していた課題（[docs/11](11-p0-technical-validation.md) §8）は、この形で解消しています。

| | P0〜M5 | M6 |
|---|---:|---:|
| JavaScript | 1,541 kB | **215 kB** |
| gzip後 | 403 kB | **62 kB** |
| chunk警告 | あり | **なし** |

Phaserは `bench/p0-demo.html`（P0技術デモ）だけが読み込みます。**製品画面の描画はCanvas 2Dです。** §9 の判断項目を参照してください。

## 5. 画面の構造

```text
index.html          … DOM。操作要素とキャンバス1枚
  src/main.ts       … 配線のみ。状態機械 ↔ DOM ↔ renderer ↔ session
    src/ui/app-state.ts             純粋。画面の判断すべて
    src/app/observation-session.ts  物理資源（World・個体・固定step）の寿命
    src/game/rendering/scene-renderer.ts  Canvas 2Dへ映すだけ
```

### 状態遷移

```text
drawing --strokeAccepted--> ready --learnStarted--> learning --learnFinished--> observing
   ^                          ^                         |                          |
   |                          +------learnFailed--------+                          |
   +--------------------------------- clear -------------------------------------- +
                              ^--------- strokeAccepted（描き直し）----------------+
```

| 状態 | 許す操作 |
|---|---|
| `drawing` | 描く、消す |
| `ready` | 描く、Undo、消す、学習開始 |
| `learning` | **なし。すべて拒否する** |
| `observing` | 再生、一時停止、世代選択、速さ、並べる世代数、描き直し |

### 観察画面の見せ方

選んだ世代までを**等間隔に取り出し、同じ地面へ並べて同時に走らせます**。古い世代ほど沈んだ青、新しい世代ほど明るい黄色です。縦線は1体長ごとの目盛りです。

headlessで同じ手順をなぞった結果（Population 32・20世代・episode 6秒・Seed 1）:

| 描いた形 | 骨 | 学習時間 | 並べた世代 | それぞれの移動量（体長） |
|---|---:|---:|---|---|
| 直線 | 4 | 1.8 秒 | 0, 5, 10, 15 | 0.19 → 0.25 → 0.60 → **0.78** |
| Y字 | 5 | 2.3 秒 | 0, 6, 11, 17 | 2.73 → 4.17 → 5.87 → **6.67** |
| 人型 | 7 | 3.3 秒 | 0, 6, 12, 18 | 2.37 → 2.77 → 4.11 → **4.90** |

3つとも世代が進むほど遠くへ行きます。**この並びが視認できるかどうかがM6の判断ゲート**です（§8）。

## 6. 受入条件ごとの合否

| 受入条件 | 判定 | 根拠 |
|---|---|---|
| 主要flowをbrowser E2Eで最後まで実行できる | **未達** | E2Eフレームワーク未導入。ユーザー判断待ち（§9）。headlessでの通し確認は §5 |
| 学習中にGraphを書き換えられず、古いWorldへUIがアクセスしない | 合格 | `refuses to change the drawing while learning`。学習中の `strokeAccepted` / `undo` / `clear` は状態を変えない |
| x1／x2／x4／x8で物理step数は変化するが、episodeとfitnessの定義は変わらない | 合格 | `advances more physics steps at x8 than at x1`、`reaches the same episode result whatever the speed was`（x1とx8で終端重心が1e-9以内で一致）、`keeps the episode definition when the speed changes` |
| background tab復帰時に大きな時間を一括消費しない | 合格 | `does not burn a long background pause in one frame`。30秒の空白でも1フレーム150 step以下 |
| 停止、再開、reset、描き直しが資源を残さない | 合格 | `returns the world to the ground after the observation stops`、`reuses one world across many observations`（40回）、`shares its world with the learning runs of the same screen`（学習40回） |
| error発生時に画面が停止し、原因と復帰方法を表示する | 合格 | `shows the reason and stays usable when learning fails`、`keeps the reason when a stroke is rejected`。画面は `role="alert"` で理由と直し方を出す |
| keyboardだけで主要操作へ到達できる | **一部** | Ctrl+Z（1本戻す）、Backspace（全消去）、Enter（学習開始）、accesskey（z / d / l / p）を配線。**実ブラウザでの到達確認は未実施** |
| 人の手動確認で「世代間の変化」「bestの理由」「描線と骨格の対応」を理解できる | **未実施** | §8 |
| `npm run verify` が成功し、E2E結果と手動確認結果を別々に記録する | 合格 | §4。E2Eと手動確認はいずれも未実施として本節に分けて記録 |

## 7. 自動試験で確認したこと

- 状態機械（13件）: 初期状態、受理と拒否、理由の保持と解除、学習中の全操作拒否、学習完了後の観察状態、速度変更が定義を変えないこと、速度の候補外を拒否すること、世代の範囲clamp、世代変更で再生し直すこと、描き直しで観察状態をリセットすること、学習失敗後も操作できること、全消去。
- 観察セッション（7件）: 40回のstartでWorldを作り直さない、stopで地面だけに戻る、x8はx1より多くstepを進める、背景タブ30秒でも1フレーム150 step以下、速度が違っても同じ結果、表示個体数の上限、学習40回とWorldを共有できる。
- 層の分離（4件）: `src/ui/` がPhaser・Box2D・DOMへ到達しない（新規）。既存3件は据え置き。

### 配線切断証明

| 外した配線 | 失敗した試験 |
|---|---|
| 学習中の操作拒否 | `refuses to change the drawing while learning` のみ |
| 速度候補の検証 | `only accepts a speed the screen offers` のみ |
| 世代のclamp | `keeps the selected generation inside the run` のみ |
| 描き直し時の観察リセット | `goes back to ready when the drawing is redone after observing` のみ |
| 1フレームのstep上限 | `does not burn a long background pause in one frame` のみ |
| Worldの使い回し（毎回作り直す） | 観察セッションの6件すべて |
| `stop()` での個体破棄 | 資源まわりの2件のみ |
| 速度倍率の適用 | 速度の1件のみ |
| 表示個体数のclamp | 表示の1件のみ |
| `src/ui/` からDOMを触る | 層の分離の1件のみ |

## 8. 人が行う体験確認（M6判断ゲート）

```bash
npm run dev
# ブラウザで http://127.0.0.1:5173/ を開く（開発ページではありません）
```

1. 一筆で生きものを描く。離すと黄色い骨と白い節点が出る。**描いた線と骨格が対応して見えるか。**
2. 線をなぞって戻り、枝を足す。Ctrl+Z で1本ずつ戻せるか。
3. 「この形で学習する」を押す。止まる時間が事前に伝わっているか。
4. 学習後、**古い世代と新しい世代が並んで走る**。世代が進むほど遠くへ行くと分かるか。
5. 世代スライダー、速さ（x1〜x8）、並べる世代数を動かす。**速さを変えても結果の距離が変わらない**ことを確認する。
6. 描き直して、もう一度学習する。数回繰り返しても壊れないか。
7. キーボードだけで 1〜6 を実行できるか。

確認すべきこと（[docs/08](08-test-quality-and-performance.md) §2 Manual review）:

- 初回利用者が説明なしで「描く → 学習 → 観察 → 描き直す」へ進めるか。
- 世代間の変化が視認できるか。
- ベスト個体が選ばれた理由を移動結果から理解できるか。
- 描線と骨格の対応が納得できるか。

**この確認が終わるまでM6は完了ではありません。** 技術試験がすべて通っていても、分かりにくければ完了にしません（[docs/12](12-development-plan.md) §10 判断ゲート）。

## 9. 判断ゲート（人の決定が必要）

| # | 項目 | 現状 | 備考 |
|---|---|---|---|
| 1 | browser E2Eフレームワークを導入するか | 未導入 | M6の受入条件1項目が未達のまま。M7の「Chromium と Firefox で完走」にも関わる |
| 2 | 製品画面でPhaserを使うか、Canvas 2Dで足りるか | **Canvas 2Dで実装** | Phaserは `bench/p0-demo.html` のみ。build出力が 1,541 kB → 215 kB になった。Phaserを外す判断は[docs/13](13-milestone-quality-and-decision-gates.md) §7 の「engine切替」に近いため、人の確認が要る |
| 3 | 閉ループ・自己交差・最大Node次数（M5から継続） | 拒否のまま | [docs/18](18-m5-branching-validation.md) §11 |

## 11. その後の変更（2026-09-14）

「骨が 20 本になり、上限の 14 本を超えます」で入り組んだ絵が描けないという報告があり、**長いというだけで拒否しない**よう変えました（[D-011](09-risks-open-questions-and-decisions.md)）。

| 項目 | 変更前 | 変更後 |
|---|---:|---:|
| 骨数上限 | 14 | **20** |
| `DEFAULT_GRAPH_LIMITS.maxEdgeCount` | 16 | **24** |
| `DEFAULT_GRAPH_LIMITS.maxTotalLength` | 24 m | **40 m** |
| 上限超過時 | 拒否 | **骨を粗くして収める** |

骨20本では学習が20世代で約9.5秒かかるため、`EvolutionRunner` を追加して**1世代ずつフレームに分けて**進めるようにしました。画面には「学習中… 7 / 20 世代」と進捗が出ます。`runEvolution` はこれを最後まで進めるだけの包みで、結果は完全に一致します（`gives the same result as running the whole thing at once`）。

骨数別の実測（Population 32・6秒episode・headless）:

| 骨数 | 1世代の評価 | 実時間比 | 20世代の合計 |
|---:|---:|---:|---:|
| 14 | 0.390 秒 | 15.4x | 7.8 秒 |
| 18 | 0.465 秒 | 12.9x | 9.3 秒 |
| 20 | 0.474 秒 | 12.6x | **9.5 秒** |
| 24 | 0.564 秒 | 10.6x | 11.3 秒 |

### 人が確認した範囲（2026-09-14）

ユーザーが実ブラウザで確認し、「確認できました」と回答しました。**確認された範囲は次の1点に限ります。**

| 確認できたこと | 確認していないこと |
|---|---|
| 入り組んだ一筆（従来 `too-many-edges` で拒否されていたもの）が受け入れられ、骨格になる | §8 の 1〜7 の体験確認全般。特に「世代間の変化が視認できるか」「描線と骨格の対応が納得できるか」「キーボードだけで完走できるか」 |

この1点だけでは **M6の判断ゲート（§8）は満たしません。** M6は引き続き「技術検証済み・手動確認待ち」です。

## 10. 未確認事項と持ち越し

1. **実ブラウザでの体験確認**（§8）。M6の完了条件。
2. **browser E2E の導入可否**（§9）。
3. **製品画面からPhaserを外した判断の追認**（§9）。`src/game/scenes/` は作っていません。
4. 学習中の同期処理。**1世代ずつフレームに分けて進めるようにしました**（D-011）。1世代は骨20本で約0.5秒かかるため、その間は止まります。世代内をさらに細かく分けるか、Web Worker化するかはM7以降。
5. 「世代0のベスト」表示と、観察に出る個体の対応（[docs/17](17-m4-stroke-input-validation.md) §11）。観察は世代ごとの fitness 最良を並べるため、`bestNormalizedForwardProgress` の表示とは別個体のことがあります。
6. 骨20本での p95 frame time は未測定です（M7）。
7. 表示は世代の代表個体のみで、**Population全体の同時表示はしていません**。原作の「表示個体数」に相当する体験は未実装です。
8. mobile / Safari は対象外のまま（[docs/13](13-milestone-quality-and-decision-gates.md) §7）。
9. M2〜M5から持ち越しの人による確認（[docs/13](13-milestone-quality-and-decision-gates.md) §10）。
