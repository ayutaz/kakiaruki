# M2 Population評価と性能 検証結果

検証日: 2026-09-14

## 1. 結論

M2の受入条件（[開発計画](12-development-plan.md) §6）のうち、**自動試験で検証できる7項目すべてに合格**しました。1つのWorld内に互いに干渉しないレーンを作り、Population 1／8／32を完走させ、100世代相当の生成・cleanupで資源が基準へ戻ることを確認しています。

**p95 frame time はまだ未計測です。** headlessのNode環境ではrequestAnimationFrameを測れないため、計測ページ `bench/frame-time.html` を用意しました。人がブラウザで実行するまで、UI応答性は「未確認」とします。

## 2. 対象成果物

| 項目 | 値 |
|---|---|
| commit | `c97cccb` |
| 実装計画 | `docs/superpowers/plans/2026-09-14-m2-population-performance.md` |

## 3. 実行環境

| 項目 | 値 |
|---|---|
| OS | macOS 26.2 (darwin arm64) |
| CPU | Apple M4 Max（16コア） |
| メモリ | 64 GB |
| Node.js | v25.2.0 |
| Phaser Box2D | 1.1.0 |
| 電源状態 | 未記録（次回の計測時に記録する） |

## 4. 実行commandと結果

```text
npm run verify
  Test Files  21 passed (21)
  Tests       116 passed (116)
  Type check  passed
  Build       passed

npm run bench
  Population 32 real-time ratio = 44.1x (threshold 1.0x): PASS
```

## 5. 性能実測（headless / Node）

6ボーン・5関節の `zigzag6`、episode 6秒、dt 1/60 s、substep 4、各3回実行の中央値。

| Population | world steps | episode wall s | physics steps/s | creature steps/s | 実時間比 |
|---:|---:|---:|---:|---:|---:|
| 1 | 360 | 0.0067 | 54,078 | 54,078 | 901x |
| 8 | 360 | 0.0375 | 9,599 | 76,792 | 160x |
| 32 | 360 | 0.1360 | 2,648 | 84,730 | **44x** |

読み方:

- **実時間比** = episodeの模擬秒数 ÷ 実測wall秒数。1.0で実時間相当。Population 32で44倍の余裕があります。
- **creature steps/s** は個体数を増やしてもほぼ一定（77k〜85k）です。1 World内のレーン方式では、個体数に対して計算量がほぼ線形に増えるだけで、追加のオーバーヘッドは小さいことを示します。
- Population 32の1世代（6秒episode）の評価に **0.136秒**。50世代なら約7秒です。

閾値は測定前に「Population 32の実時間比 1.0以上」と固定し、変更していません。

## 6. 受入条件ごとの合否

| 受入条件 | 判定 | 根拠 |
|---|---|---|
| Population 1／8／32が同じepisode定義で完走する | 合格 | `evaluates a population of 1/8/32 with the same episode definition`（全個体が `completed`、各120 step） |
| 個体間または隣接レーン間のcontactが0件である | 合格 | `never lets two creatures touch each other while they all touch the ground`（8個体600 step）、`does not let a creature collide with itself at a shared joint`、100世代試験でも累計0件 |
| 表示個体数0／1／8で各個体の結果が許容誤差内で一致する | 合格 | `produces identical results no matter how many individuals are rendered`（許容誤差ではなく**完全一致**） |
| 100世代相当の生成・cleanupでBody数、Joint数、heap使用量が継続増加しない | 合格 | `returns one reused world to its baseline after 100 generations`（毎世代 shape数が 1 ⇄ 49 を往復、heap増加 < 256 MB） |
| Population 32を実時間相当以上に進められる | 合格（headless） | 実時間比 44x。**ブラウザ前景タブでの確認は未実施** |
| p95 frame timeとphysics steps / wall secondを記録する | **一部未確認** | physics steps/s は上表。p95 frame time は未計測 |
| `npm run verify` が成功し、M2性能記録をdocsへ追加する | 合格 | 本ドキュメント |

## 7. 自動試験で確認したこと

- レーン配置が決定的で、隣接レーン中心間距離が必要間隔以上あり、y方向には分けない（全個体が同じ地面高さ）。
- レーンごとに一意の負の collision group を割り当てる。
- 8個体を600 step動かしても個体同士のcontactが0件、地面とのcontactは発生する。
- 同一個体の骨同士も接触しない。
- contact eventは1 stepにつき1度だけ集計される（二重計上しない）。
- `PopulationRunner` はWorldを1 stepにつき1回だけ進める（個体数ぶん進めない）。
- 表示個体数0／1／8で全個体の結果が完全一致する。
- 同一構成の再実行結果が一致する。
- 個体ごとに異なる指令を与えると結果が変わる。静止指令の個体はほとんど前進しない。
- 1個体がinvalidになっても、残りの個体は規定step数まで評価が続く（fakeを使った単体試験）。
- 100世代を同一Worldで回してもshape数がbaselineへ戻る。
- 5世代を実行した後の6世代目の結果が、まっさらなWorldで実行した同じ世代の結果と一致する（前世代の状態が残らない）。

### 配線切断証明・positive control

| 操作 | 結果 |
|---|---|
| 生物shapeの `maskBits` を全ビットへ変更し、2個体を重ねて生成 | 個体間contactが検出された（隔離ONでは0件）。**検出器が常に0を返しているのではない**ことの証明 |
| `PopulationRunner` がWorldを個体数ぶんstepするよう変更 | Population 32／world step数／レーン維持の3試験が失敗 |
| 世代ごとの `creature.destroy()` を外す | 100世代試験がshape数 49（期待1）で失敗 |

## 8. 手動で確認したこと

なし。**ブラウザでのp95 frame time計測が未実施**のため、M2は「技術検証済み」であり「完了」ではありません（[マイルストーン品質・判断ゲート](13-milestone-quality-and-decision-gates.md) §2）。

### 人が実行する手順

```bash
npm run dev
# ブラウザで http://127.0.0.1:5173/bench/frame-time.html を開く
```

1. 前景タブで、電源接続状態とブラウザversionを記録する。
2. Population 32 ／ 表示個体数 8 ／ x1 で 30秒以上動かし、p50／p95／p99 と physics steps/s を読み取る。
3. 表示個体数 0／1／8、速度 x1／x4／x8 の組み合わせでも同様に記録する。
4. 画面下部の JSON をこのドキュメントへ貼り付ける。

この計測ページは物理と Canvas 2D 描画だけを含み、**Phaserのレンダリング負荷は含みません**。

## 9. M1記録の訂正

[M1検証結果](14-m1-simulation-validation.md) §6 に `DEFAULT_EPISODE_OPTIONS` の「座標上限 500 m」と記載しましたが、M2で設計を変更しました。

- **変更前**: `maxCoordinateMagnitude`（world原点からの絶対座標の上限）
- **変更後**: `maxDisplacement`（スポーン時の重心からの最大距離、既定 200 m）
- **理由**: レーン配置では個体の絶対座標がレーン位置に比例して大きくなるため、絶対座標での判定は遠いレーンの正常な個体を誤ってinvalidにします。Population 4のテストで実際に全個体が即座にinvalidになり、この欠陥が判明しました。
- **影響**: 暴走検出の意味が「world原点から遠い」から「自分のスポーン地点から遠い」へ変わり、レーン位置に依存しなくなりました。M1の受入条件の判定は変わりません。

## 10. 判断ゲート: Phaser Box2D の継続採用

[開発計画](12-development-plan.md) §6 の判断ゲートに対する現時点の材料です。

- **Population 32**: headlessで実時間の44倍。維持できます。
- **資源再利用**: 100世代でshape数が基準へ戻り、前世代の状態も残りません。
- **UI応答性**: **未計測**。

headlessの計算余裕が大きいため、Phaser Box2D を継続採用する材料は揃っています。ただしUI応答性の実測が終わるまで、この判断は暫定です。

**Godotまたは別engineへの切替はユーザー判断が必要**（[docs/13](13-milestone-quality-and-decision-gates.md) §7）であり、現時点でその必要を示す測定結果はありません。

## 11. 未確認事項と持ち越し

1. **p95 frame time**（ブラウザ前景タブ）。上記手順で人が計測する。
2. Phaserレンダリングを含めた場合の frame time。M6のUI統合時に再測定する。
3. 背景tab復帰時のaccumulator処理（M6）。
4. Population 64以上。M2の非ゴール。
5. モバイル性能。M2の非ゴール。
6. Worker化の要否。現時点の余裕からは不要に見えるが、Phaser描画を含めた実測後に再判断する。
7. build chunk分割の要否（M7）。
8. レーン間隔の既定値は「骨格幅 + 12 m」。episode 6秒で12 m以上移動する個体が現れた場合は再検討が必要。現在の個体の移動量は1 m未満。
