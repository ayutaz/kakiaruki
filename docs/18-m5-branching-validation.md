# M5 枝分かれと編集 検証結果

検証日: 2026-09-14

## 1. 結論

M5の受入条件（[開発計画](12-development-plan.md) §9）のうち、**自動試験で検証できる7項目すべてに合格**しました。一筆を戻って別方向へ伸ばす操作が枝分かれGraphになり、Y字と人型相当の形を作れます。Edge単位のUndoも動きます。

**閉ループと自己交差は、M5でも理由付きで拒否したままです。** MVPへ含めるかは人の決定であり（[docs/13](13-milestone-quality-and-decision-gates.md) §7）、実験用のfeature flagも作っていません。§9 の判断項目を参照してください。

ブラウザでの操作確認は未実施です。M5は「技術検証済み」であり「完了」ではありません。

## 2. 対象成果物

| 項目 | 値 |
|---|---|
| commit | `0a07b18` |
| 新規module | `src/domain/stroke/stroke-retrace.ts`、`src/domain/creature/graph-edit.ts` |

## 3. 実行環境

| 項目 | 値 |
|---|---|
| OS | macOS 26.2 (arm64) |
| CPU | Apple M4 Max |
| Node.js | v25.2.0 |
| npm | 11.6.2 |
| TypeScript | 7.0.2 / Vite 8.2.2 / Vitest 5.0.0 |

## 4. 実行commandと結果

```text
npm run verify
  Test Files  35 passed (35)
  Tests       302 passed (302)
  Type check  passed
  Build       passed
```

## 5. 変換パイプライン（M5時点）

```text
生Pointer点列
  -> 正規化（線長重み付き重心が原点、短辺=6 m）
  -> 長さチェック
  -> 等間隔re-sampling（0.12 m）
  -> 閉ループ判定          始点へ戻る線は理由付きで拒否
  -> 戻り線検出            ★M5で追加。往路を逆向きになぞった区間を切り出す
  -> run分割 + 節点化      往路と各枝を、折れ曲がり + 区間内RDPで節点列にする
  -> 枝の接続              分岐位置の既存Nodeへ繋ぐ。無ければEdgeを分割して分岐Nodeを作る
  -> Graph単位のEdge長調整  短Edge統合 → 長Edge分割 → 短Edge統合
  -> 骨の交差判定          ★M5で移動。点列ではなく組み立てた骨どうしで見る
  -> 骨数上限チェック       14本超は理由付きで拒否
  -> validateCreatureGraph
```

### 戻り線の判定規則（測定前に固定）

点 `i` が `lookbackGap` より前の点 `j` から `snapDistance` 以内にあり、進行方向が逆向き（内積が負）なら「往路の上に戻っている」とみなします。これが `minRetraceLength` 以上続いた区間を1つの戻りとします。

| 設定 | 値 | 役割 |
|---|---:|---|
| `snapDistance` | 0.22 m | 往路と同じ位置とみなす距離 |
| `minRetraceLength` | 0.5 m | 戻りと認めるのに必要な長さ。鋭い折り返しを枝にしないため |
| `lookbackGap` | 4点（0.48 m） | 折り返しの頂点付近を除く幅。§8 で 6 から変更 |

**「近いだけ」「横切っただけ」「戻り」の区別**

| 入力 | 判定 | 理由 |
|---|---|---|
| 40 px離れて並走する折り返し（`nearMiss`） | 戻りではない | `snapDistance` より遠い |
| 15 px しか離れていないが同じ向き（`inwardSpiral`） | 戻りではない | 進行方向の内積が正 |
| 20度の鋭いV字（`hairpin`） | 戻りではない | 重なりが `minRetraceLength` 未満 |
| 往路を逆向きに1.1 mなぞる（`yBranch`） | 戻り | 3条件すべてを満たす |
| 骨どうしが交差（`selfIntersecting`） | 拒否 | 組み立てた骨の線分が交差 |

## 6. fixture一覧と変換結果

viewport 640×480、既定オプション。

| fixture | 戻り線 | Node | Edge | 最大次数 | 葉 | Body / Joint | 結果 |
|---|---:|---:|---:|---:|---:|---|---|
| `straight` | 0 | 6 | 5 | 2 | 2 | 5 / 4 | OK |
| `lShape` | 0 | 7 | 6 | 2 | 2 | 6 / 5 | OK |
| `zigzag` | 0 | 9 | 8 | 2 | 2 | 8 / 7 | OK |
| `shallowWave` | 0 | 6 | 5 | 2 | 2 | 5 / 4 | OK |
| `bigWave` | 0 | 15 | 14 | 2 | 2 | 14 / 13 | OK |
| `yBranch` | 1 | 6 | 5 | **3** | 3 | 5 / 4 | OK |
| `humanoid` | 2 | 8 | 7 | **4** | 4 | 7 / 6 | OK |
| `hairpin` | 0 | 7 | 6 | 2 | 2 | 6 / 5 | OK |
| `nearMiss` | 0 | 9 | 8 | 2 | 2 | 8 / 7 | OK |
| `inwardSpiral` | 0 | 13 | 12 | 2 | 2 | 12 / 11 | OK |
| `stubTail` | 0 | 4 | 3 | 2 | 2 | 3 / 2 | OK |
| `selfIntersecting` | 0 | - | - | - | - | - | 拒否 `self-intersecting` |
| `closedLoop` | 0 | - | - | - | - | - | 拒否 `closed-loop` |

`humanoid` は胴を下から上へ描き、肩まで戻って左腕、肩へ戻って右腕を伸ばした一筆です。肩が次数4の分岐点になり、**頭・足・左手・右手の4つが葉**になります。次数4は `DEFAULT_GRAPH_LIMITS.maxNodeDegree` の上限ちょうどです。

## 7. 枝分かれGraphでの学習

Population 32・20世代・episode 6秒・Seed 1。距離は体長（骨格幅で正規化した前進量）。

| fixture | 骨格幅 | 世代0 | best | invalid | 実時間 |
|---|---:|---:|---|---:|---:|
| `yBranch` | 2.10 m | 2.48 | 7.90（世代 18） | 0 / 640 | 2.4 秒 |
| `humanoid` | 3.18 m | 2.12 | 4.37（世代 18） | 0 / 640 | 3.3 秒 |

枝分かれGraphでも `invalid` は1体も出ず、実行後のWorldは地面だけに戻りました（shape 1）。

## 8. 受入条件ごとの合否

| 受入条件 | 判定 | 根拠 |
|---|---|---|
| Y字と人型相当のfixtureが期待するNode／Edge接続になる | 合格 | §6。`builds a branch from a stroke that goes back on itself` / `builds two arms from a humanoid stroke that goes back twice` |
| 近いだけの線、横切っただけの線、戻り線を仕様どおり区別する | 合格 | §5 の表。`nearMiss` / `inwardSpiral` / `hairpin` / `selfIntersecting` の4試験 |
| Undo後もGraphの不変条件が保たれ、やり直した入力と同じGraphになる | 合格 | `keeps a branching drawing valid after an edge is undone`、`gives the same graph when the same input is drawn again` |
| Node次数、骨数、最小骨長の上限違反を説明付きで拒否する | 合格 | `validateCreatureGraph` の既存17 code。両端が分岐点の短いEdgeは畳まず `edge-too-short` を返す |
| 閉ループ無効時は、暗黙に形を変更せず明示的な理由を返す | 合格 | `closedLoop` fixture が `closed-loop` で拒否 |
| 閉ループを実験する場合は、専用fixtureで長時間stepが安定した時だけMVP候補へ含める | **未実施** | feature flagを作っていません。§9 の人の決定待ち |
| 枝分かれGraphでM3の進化loopを完走する | 合格 | §7。`learns from a hand drawn humanoid with two arms` |
| `npm run verify` が成功し、曖昧入力の仕様例をdocsへ追加する | 合格 | §4、§5、本ドキュメント |

### 測定開始後に変更した設定

[docs/13](13-milestone-quality-and-decision-gates.md) §4 に従って記録します。**受入条件と閾値は変更していません。**

| 項目 | 変更前 | 変更後 | 理由 | 影響 | 再試験 |
|---|---:|---:|---|---|---|
| `lookbackGap` | 6点（0.72 m） | **4点（0.48 m）** | 人型の1本目の戻り（胴→肩、0.84 m）を取りこぼし、戻った区間がそのまま骨として残って胴に骨が二重に重なっていた | 人型が「肩が次数4、葉4つ」の正しい形になる。他のfixtureの結果は変わらない | 2以下ではY字の折れ曲がりを戻りと誤認、6以上では人型を取りこぼすことを確認 |

## 9. 自動試験で確認したこと

- 戻り線検出（6件）: 戻らない線では0件、Y字で1件、人型で2件。並走・同じ向き・鋭い折り返しは戻りにしない。
- Graph編集（11件）: 長いEdgeの等分、分岐点を消さない短Edge統合、両端とも分岐点なら畳まない、rootの付け替え、Edge単位Undo、孤立Nodeの削除、Undoの再現性、骨1本は残す。
- 変換（26件）: §6 の表、鎖のままの入力が鎖のままであること、骨の交差判定、上限、既存のM4試験すべて。
- 骨格変換（3件）: 次数 d の分岐点が (d−1) 個のJointになる。人型で bone 7 / joint 6。
- 進化接続（9件）: 枝分かれGraphで20世代完走、invalid 0、Undo後もvalid。

### 配線切断証明

| 外した配線 | 失敗した試験 |
|---|---|
| `snapDistance` を 0.22 → 2.0 | 戻り線検出の3件（戻らない線／Y字／並走） |
| `minRetraceLength` を 0.5 → 0.01 | `treats a sharp hairpin as a corner, not as a retrace` のみ |
| 進行方向の内積判定 | `does not call a line running the same way a retrace` のみ |
| `lookbackGap` を 4 → 2 | `finds one retrace in a Y shaped stroke` のみ |
| `lookbackGap` を 4 → 6 | 人型の2件のみ |
| 戻り線検出の呼び出し | `builds a branch from a stroke that goes back on itself` のみ |
| 枝接続時のEdge分割（既存Nodeへ寄せる） | 同上のみ |
| 分岐点の保護（短Edge統合） | `leaves a short edge between two branch nodes alone` のみ |
| rootの付け替え | `moves the root when the root node is the one merged away` のみ |
| 孤立Nodeの削除（Undo） | Undoの2件のみ |
| Edge等分（`parts = 1` 固定） | `splits every edge longer than the limit into equal parts` のみ |

## 10. 手動で確認したこと

なし。開発ページ `bench/stroke-input.html` に **Ctrl+Z で骨を1本戻す**操作を配線しましたが、**ブラウザでの確認は未実施**です。

### 人が実行する手順

```bash
npm run dev
# ブラウザで http://127.0.0.1:5173/bench/stroke-input.html を開く
```

1. 縦線を描き、途中まで**なぞって戻り**、別方向へ伸ばす。Y字の骨格になることを確認する。
2. 胴 → 肩へ戻る → 左腕 → 肩へ戻る → 右腕、の順で人型を描く。肩から4本出ることを確認する。
3. 鋭いV字を描き、**枝にならない**ことを確認する。
4. Ctrl+Z で骨が1本ずつ減ること、減らしすぎたら学習ボタンが無効になることを確認する。
5. 枝分かれした形で学習し、リプレイで動くことを確認する。

## 11. 判断ゲート（人の決定が必要）

[docs/12](12-development-plan.md) §9 と [docs/13](13-milestone-quality-and-decision-gates.md) §6 の項目です。**自動試験の結果だけでは決められません。**

| # | 項目 | 現状 | 備考 |
|---|---|---|---|
| 1 | 閉ループをMVPへ含めるか | **拒否のまま** | 循環拘束は木構造より不安定。実験用feature flagも未作成 |
| 2 | 自己交差をどこまで関節として扱うか | **拒否のまま** | 交差点をNode化する仕様は未設計 |
| 3 | 最大Node次数を確定するか | 暫定4 | 人型がちょうど4。5以上を許すかは未決 |

docs/12 §9 の判断ゲートは「安定性または説明可能性が不足する場合は、安全に拒否する仕様でM6へ進む」と定めています。**その規定に従い、拒否したままM6へ進みました。**

## 12. 未確認事項と持ち越し

1. **ブラウザでの枝分かれ操作**（§10）。
2. 閉ループ・自己交差・最大Node次数の決定（§11）。
3. 複数strokeの結合、自由なGraph editor（M5非ゴール）。
4. 戻り線の3設定（0.22 m / 0.5 m / 4点）が実際の手描きに合うか。fixtureは合成した点列で、人の手ぶれを含みません。
5. 次数4の分岐点を持つ骨格の物理的な安定性。20世代では invalid 0 でしたが、長時間runは未確認（M7）。
6. M2〜M4から持ち越しの人による確認3件（[docs/13](13-milestone-quality-and-decision-gates.md) §10）。
