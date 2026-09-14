# M3 進化loop 検証結果

検証日: 2026-09-14

## 1. 結論

M3の受入条件（[開発計画](12-development-plan.md) §7）のうち、**自動試験と実験で検証できる7項目すべてに合格**しました。固定Seedの5試行すべてで進化群が generation 0 を上回り、進化なし対照群の中央値も明確に上回りました。

**残るのは人の確認だけです。** M3の判断ゲートは「数値だけでなく、世代変化を人が理解できるか」であり（[docs/13](13-milestone-quality-and-decision-gates.md) §6）、これは自動試験では判定できません。確認用のリプレイ画面を用意しました（§8）。

## 2. 対象成果物

| 項目 | 値 |
|---|---|
| commit | `6aa9406` |
| 実装計画 | `docs/superpowers/plans/2026-09-14-m3-evolution-loop.md` |

## 3. 実行環境

| 項目 | 値 |
|---|---|
| OS | macOS 26.2 (darwin arm64) |
| CPU | Apple M4 Max |
| Node.js | v25.2.0 |
| Phaser Box2D | 1.1.0 |

## 4. 実行commandと結果

```text
npm run verify
  Test Files  27 passed (27)
  Tests       183 passed (183)
  Type check  passed
  Build       passed

npm run experiment
  criterion 1 — improved seeds 5/5 (need 4): PASS
  criterion 2 — evolved median 17.911 > control median 4.167: PASS
  overall: PASS
```

## 5. 実験設定（測定開始前に固定）

| 項目 | 値 |
|---|---|
| 骨格 | `zigzag6`（6ボーン・5関節、骨長0.781 m、半径0.11 m） |
| Seed | 1, 2, 3, 5, 8 |
| 世代数 | 50 |
| Population | 32 |
| Elite | 4 |
| Tournament size | 3 |
| 1エピソード | 6秒（dt 1/60 s、substep 4） |
| Gene変異確率 | 15% |
| 変異σ | frequency 0.15 / amplitude 0.12 / phase 0.5 / bias 0.1 |
| Genome範囲 | frequency 0.25〜3.0 Hz、amplitude 0〜0.9 rad、bias ±0.5 rad |
| Fitness | 0.7×前進距離 + 0.3×最大前進距離 − 0.01×motorEffort − 1000×invalid |
| 対照群 | 選択・交叉・変異を行わず、初期Populationを毎世代再評価 |
| 合格条件1 | 5 Seed中**4 Seed以上**で generation 0 の best normalized distance を上回る |
| 合格条件2 | 進化群 best の中央値 > 対照群 best の中央値 |

閾値は実験開始前に固定し、結果を見てから変更していません。

## 6. Seed別の結果

距離の単位は**体長**（骨格幅3.82 mで正規化した前進量）。

| Seed | 世代0 距離 | 最終世代 距離 | best 距離 | best 世代 | 進化群 fitness | 対照群 fitness | invalid |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.907 | 5.126 | 5.481 | 46 | 17.911 | 5.052 | 0 |
| 2 | 1.652 | 4.745 | 5.094 | 41 | 18.225 | 4.167 | 0 |
| 3 | 1.404 | 4.975 | 5.324 | 42 | 17.374 | 2.764 | 0 |
| 5 | 3.768 | 3.824 | 5.609 | 10 | 20.126 | 13.353 | 0 |
| 8 | 1.231 | 4.551 | 5.224 | 44 | 17.776 | 3.315 | 0 |

- **改善したSeed: 5/5**（合格条件1は4以上）。
- **進化群 fitness 中央値 17.911 vs 対照群 4.167**（合格条件2）。
- invalid個体は1体も発生しませんでした。
- 1 Seedあたり進化群+対照群で約13.3秒。

各Seedのbest Genomeは `npm run experiment` のJSON出力に含まれます。

### 観察

- 5 Seedすべてが 5.1〜5.6 体長付近へ収束しました。この骨格・この関節コントローラ表現では、6秒で5.5体長あたりが上限に近い可能性があります。**探索が頭打ちなのか物理的な限界なのかは未確認**です。
- Seed 5 は generation 0 の時点で 3.768 体長と偶然良く、best も10世代目に出ています。初期値が良い場合は改善幅が小さくなります。
- Seed 5 の最終世代距離（3.824）は best（5.609）より小さく、best-ever を別に保持する設計（docs/05 §7）が効いています。

## 7. 自動試験で確認したこと

- Seed付き乱数が同一Seedで同一列、異なるSeedで異なる列を返し、一様分布と標準正規分布の統計を満たす。
- Genome生成が決定的で、常に範囲内に収まり、関節数と一致する。
- Genomeが `JointCommandSource` へ決定的に変換され、Genomeが違えば指令も違う。
- Fitnessが前進距離・最大前進距離・energy・invalidに分解され、各項が記録される。
- invalid個体は必ず全ての完走個体より低いfitnessになり、失格理由が残る。
- 転がる・引きずるような奇妙な解は罰せられない（数値的失敗だけを罰する）。
- Eliteがfitness降順の上位N、呼び出し側の配列を壊さない。
- Tournament selectionが高fitnessを選びやすく、サイズ1では一様選択に退化する。
- 一様交叉が第三の値を作らず、両親を混ぜる。骨格が違う親は拒否する。
- 突然変異が確率0で不変、確率1で全gene変化、500世代の連続変異でも範囲内。
- 世代交代で個体数が保たれ、eliteが必ず残り、同一Seedで同一結果になる。
- Run全体が同一Seed・同一設定で**完全一致**する。
- 対照群は全世代でbest fitnessが変化しない（選択圧がないことの確認）。
- 進化群と対照群の generation 0 が一致する（同じ初期Populationから始まっている）。
- invalidを誘発する設定でも規定世代数を完走し、`invalidCount` が記録される。
- best Genomeのリプレイfitnessが元の評価値と 1e-6 以内で一致する（レーン位置が違っても一致するため、評価がレーン位置に依存しないことも同時に示す）。
- 世代ごとのbest個体が保持され、世代番号と統計が一致する。

### 配線切断証明

| 外した配線 | 失敗した試験 |
|---|---|
| Tournamentの勝者判定（常に最初の候補を返す） | `picks better genomes far more often than worse ones` のみ |
| 突然変異（恒等関数にする） | `changes every gene when the mutation probability is one` のみ |
| Elite引き継ぎ | `carries the elite genomes into the next generation unchanged` のみ |

## 8. 人の確認が必要な項目（M3判断ゲート）

```bash
npm run dev
# ブラウザで http://127.0.0.1:5173/bench/replay.html を開く
```

1. Seed と世代数を選び「学習する」を押す（50世代・Population 32 で約7秒、その間画面は止まります）。
2. 学習が終わると**自動で再生**されます。上段が**世代0のベスト**、下段が**選んだ世代のベスト**です。縦線が開始位置、目盛りは1メートルです。
3. スライダーで比較する世代を変え、世代が進むにつれて動きがどう変わるかを見ます。スライダーを動かすとその世代で再生し直します。

確認すべきこと（[docs/08](08-test-quality-and-performance.md) §2 Manual review）:

- 世代間の変化が視認できるか。
- ベスト個体が選ばれた理由を移動結果から理解できるか。
- 奇妙な移動が魅力として残っているか。

このページは 2026-09-14 に World の使い回しへ修正しました（[M4検証結果](17-m4-stroke-input-validation.md) §11）。修正前はスライダーを一度ドラッグすると再生が止まり、再読み込みするまで回復しませんでした。

**この確認が終わるまでM3は「技術検証済み」であり「完了」ではありません。** 数値が改善していても動きの変化を理解できない場合は、M4より先に Fitness・episode時間・可視化を調整します（docs/12 §7 判断ゲート）。

## 9. 受入条件ごとの合否

| 受入条件 | 判定 | 根拠 |
|---|---|---|
| 同一Seed、Graph、設定から同じGenome列と世代統計を再生成できる | 合格 | `reproduces the whole run for the same seed and settings`（全世代・全Genome・RunRecordまで完全一致） |
| 異常個体をinvalidとして打ち切り、Run全体は規定数まで継続できる | 合格 | `finishes every generation even when individuals are disqualified` |
| 5 Seedで50世代を実行し、少なくとも4 Seedで generation 0 から改善する | 合格 | 5/5 Seed が改善（§6） |
| 5 Seedの進化群中央値が、進化なし対照群中央値を上回る | 合格 | 17.911 vs 4.167（§6） |
| SelectionまたはMutationの主要配線を切ると対応する回帰試験が失敗する | 合格 | §7 配線切断証明 |
| 保存したbest Genomeのリプレイ結果が元の評価値と許容誤差内で一致する | 合格 | `reaches the same fitness when the best genome is replayed`（1e-6以内） |
| Fitnessの各項と失格理由を記録できる | 合格 | `FitnessTerms`（前進距離・最大前進距離・正規化距離・energy・invalid理由） |
| `npm run verify` が成功し、Seed別結果をdocsへ追加する | 合格 | 本ドキュメント |
| 世代変化を人が理解できるか | **未確認** | §8 の手順で人が確認する |

## 10. 未確認事項と持ち越し

1. **世代変化の視認性**（M3判断ゲート、§8）。
2. **5.5体長付近での頭打ち**が探索の限界か物理の限界か。関節ごとのfrequencyやtorqueをGeneに含めるか（docs/09 未確定事項 11・12）は、この切り分けの後に判断する。
3. energy weight 0.01 の妥当性。現在はほぼ効いていない可能性がある（docs/09 未確定事項 13）。
4. 停滞時にmutation幅を変えるか（docs/09 未確定事項 14）。
5. 他の骨格（`chain4` / `lShape5` / `yBranch5`）での改善の再現性。現在の実験は `zigzag6` のみ。
6. ブラウザ上での学習時の p95 frame time（M2の持ち越しと同じ）。
7. ブラウザ／OSをまたいだ決定性。

## 11. その後の修正と再測定（2026-09-14）

§6 の数値は**地面の幅が足りない状態**で測ったものです。M4の手動確認をきっかけに欠陥を見つけ、修正しました（[M4検証結果](17-m4-stroke-input-validation.md) §11「原因4」）。

### 何が起きていたか

`planLanes` はPopulationを中央から左右へ並べます。`zigzag6`（骨格幅3.82 m）では間隔15.8 m、32個体で端が **±245 m** になります。一方、地面の半幅は **200 m** でした。

つまり **32個体のうち6個体が地面の外に生成され、6秒間そのまま落下**していました（終了時 y = −172.7 m）。落下した個体は前進量0のまま `completed` として扱われ、毎世代 GA の母集団に混ざっていました。

### 修正

地面の半幅を 200 m → **1000 m** にしました。Population 32 で最大骨格（1.2 m × 10本）を並べても端は ±378 m で、そこから `maxDisplacement` 200 m 進んでも地面が続きます。

### 再測定（修正後）

```text
npm run experiment
  criterion 1 — improved seeds 5/5 (need 4): PASS
  criterion 2 — evolved median 17.457 > control median 4.167: PASS
  overall: PASS
```

| Seed | 世代0 距離 | 最終世代 距離 | best 距離 | best 世代 | 進化群 fitness | 対照群 fitness | invalid |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.907 | 5.266 | 5.273 | 44 | 17.065 | 5.052 | 0 |
| 2 | 1.652 | 5.034 | 5.034 | 49 | 16.255 | 4.167 | 0 |
| 3 | 1.696 | 6.456 | 6.456 | 41 | 21.399 | 4.140 | 0 |
| 5 | 2.210 | 5.378 | 5.378 | 49 | 17.457 | 5.100 | 0 |
| 8 | 1.231 | 5.568 | 5.568 | 48 | 18.510 | 2.737 | 0 |

**受入条件の判定は変わりません**（改善Seed 5/5、進化群中央値 > 対照群中央値）。合格条件と閾値は測定前に固定したものから変更していません（[docs/13](13-milestone-quality-and-decision-gates.md) §4）。

変化の内訳:

| 項目 | 修正前 | 修正後 |
|---|---:|---:|
| 進化群 fitness 中央値 | 17.911 | 17.457 |
| 対照群 fitness 中央値 | 4.167 | 4.167 |
| 最終世代距離の中央値 | 4.745 体長 | 5.378 体長 |
| 有効に評価された個体 | 26 / 32 | 32 / 32 |

中央値の fitness はほぼ変わりませんが、**最終世代の距離は伸びました**。落下していた6個体が実際に評価されるようになり、探索に使える個体が増えたためです。

