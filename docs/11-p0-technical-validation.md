# P0技術検証結果

検証日: 2026-09-14

## 1. 結論

P0の完了条件を満たしました。`Phaser 4 + Phaser Box2D + TypeScript + Vite` の組み合わせで、2本のカプセルBody、Revolute Joint、motor、角度limit、固定step、Phaser描画、操作UIが成立します。

この結果は、最小物理モデルの技術成立を示すものです。一筆入力、複数個体性能、遺伝的アルゴリズム、面白さ、長時間安定性はまだ確認していません。

## 2. 検証環境

| 項目 | 使用version |
|---|---:|
| OS | Windows |
| Node.js | 24.15.0 |
| npm | 11.4.2 |
| Phaser | 4.2.1 |
| Phaser Box2D | 1.1.0 |
| TypeScript | 7.0.2 |
| Vite | 8.2.2 |
| Vitest | 5.0.0 |

`package.json` と `package-lock.json` でversionと依存解決結果を固定しています。再現用の `npm ci` で182 packageを入れ直し、その直後にも全検証が成功しました。

## 3. 作成した技術スパイク

- 0重力Worldに固定カプセルBodyと動的カプセルBodyを1本ずつ生成。
- Revolute Jointで2本を接続。
- motor、max torque、角度limitを設定。
- 物理を `1 / 60 s` の固定step、2 substepで進行。
- 壁時計の遅延をaccumulatorへ蓄積し、1 frameあたり最大16 stepに制限。
- 目標角度へ追従するPD型motor speed controller。
- Phaserは物理状態の描画だけを担当し、物理処理は純粋TypeScript moduleへ分離。
- motor、limit、x1／x2／x4／x8、初期化を画面から操作可能。

## 4. TDDと自動試験

最初に存在しないsimulation moduleを参照するテストを追加し、3 test suiteがmodule解決エラーで失敗するRedを確認しました。最小実装後にGreenへ移行しています。

ブラウザ確認で「初期状態へ戻す」が姿勢しか戻さない不整合を検出した際も、全controlのdefaultを定義する失敗テストを追加してから修正しました。

最終結果:

```text
Test Files  4 passed (4)
Tests       8 passed (8)
Type check  passed
Build       passed
```

確認項目:

- wall timeを固定step数へ変換する。
- 過剰な蓄積時間を破棄し、UI freezeを避ける。
- 最短角度差を使い、motor speedを上限内へclampする。
- derivative項が角速度を減衰させる。
- motor ONだけが動的骨を駆動する。
- limit ON／OFFで最大角度に明確な差が出る。
- 10,000 step後もBody座標とJoint角度が有限値を保つ。
- 初期化時にmotor ON、limit ON、x1へ戻る。

## 5. ブラウザ操作確認

Codex内蔵ブラウザで `http://127.0.0.1:5173/` を開き、次を確認しました。

- 2本の骨と関節がcanvasへ描画される。
- 関節角度と目標角度が更新される。
- motor ONからOFFへの切替で状態表示が「停止」になる。
- limit OFFで制限なしの広い角度へ追従する。
- x8を選ぶと状態表示と選択値がx8になる。
- 初期化でmotor ON、limit ON、x1へ戻る。
- 確認中のbrowser console error／warningは0件。

これはP0操作の確認であり、主要ブラウザ間互換性や正式な体験品質レビューではありません。

## 6. Phaser Box2D統合上の注意

`phaser-box2d@1.1.0` のpackage metadataはrootの `index.js` をentrypointとして示しますが、取得したnpm packageにはそのfileがありません。またTypeScript宣言も同梱されていません。そのため、vendor package自体は変更せず、次の境界を置きました。

- 実行時importは `phaser-box2d/dist/PhaserBox2D.js` に限定。
- `src/phaser-box2d.d.ts` にP0で使うAPIだけを宣言。
- Box2D固有APIは `p0-physics-rig.ts` 内へ隔離。

upstreamのentrypointや型宣言が改善された場合は、この局所adapterだけを更新します。

## 7. TypeScript宣言の扱い

依存package内の一部宣言はTypeScript 7との組み合わせで診断が発生したため、`skipLibCheck: true` を設定しています。これは依存packageの `.d.ts` 検査を省略する境界であり、`src` と `tests` のstrict型検査は有効です。

TypeScript 6／Vitest 4への一時的な切替も試しましたが、この環境のnpm 11.4.2が依存木更新中に内部エラーを返したため採用していません。現在の固定versionではclean installと検証を行います。

## 8. Build結果と残課題

production buildのJavaScriptは約1,541 kB、gzip後約403 kBでした。Viteの500 kB chunk警告が出ていますが、P0の成立判定を妨げるものではありません。公開版ではPhaser／Box2Dの遅延読込またはcode splittingを検討します。

依存導入時の脆弱性報告は0件でした。一方、推移依存にdeprecated扱いのESLint 9系warningがありました。P0コードから直接使ってはいませんが、upstream更新時に再確認します。

## 9. P0完了判定

| 条件 | 判定 | 証拠 |
|---|---|---|
| TypeScriptからBox2Dを利用 | 合格 | adapter経由で型検査・build成功 |
| 2 Body + Revolute Joint | 合格 | 自動試験とcanvas表示 |
| motor ON／OFFの差 | 合格 | 結線試験とブラウザ操作 |
| limit ON／OFFの差 | 合格 | 結線試験とブラウザ操作 |
| 固定step | 合格 | runner unit testと実装 |
| 10,000 step安定性 | 合格 | 有限値検査 |
| production build | 合格 | Vite build成功 |
| P1へ進める | 合格 | ただし複数個体性能はP1で測定 |

## 10. P1へ持ち越す項目

この節はP0時点（2026-09-14）の記録です。その後の処理結果を併記します。

| # | 持ち越し項目 | その後 |
|---|---|---|
| 1 | 4〜6ボーンの `CreatureGraph` fixture | **M1で実施**（[docs/14](14-m1-simulation-validation.md) §6） |
| 2 | 1 World内のPopulation分離レーン | **M2で実施**（[docs/15](15-m2-population-performance.md) §7） |
| 3 | 世代ごとのBody／Joint cleanupと100世代相当の資源監視 | **M1・M2で実施**。shape数がbaselineへ復帰 |
| 4 | Population 1／8／32のthroughput測定 | **M2で実施**。Population 32 で実時間の44倍（headless） |
| 5 | 表示個体数がsimulation結果へ影響しないことの試験 | **M2で実施**。0／1／8で完全一致 |
| 6 | 背景tab復帰時のaccumulator処理 | **未実施**。M6の体験統合で扱う |
| 7 | build chunk分割の要否判断 | **未実施**。M7で判断。警告は継続中 |

