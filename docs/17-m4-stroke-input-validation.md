# M4 単純な一筆入力 検証結果

検証日: 2026-09-14

## 1. 結論

M4の受入条件（[開発計画](12-development-plan.md) §8）のうち、**自動試験で検証できる7項目に合格**しました。直線・L字・ジグザグ・緩い曲線が安定した `CreatureGraph` へ変換され、そのGraphでM3の学習loopが完走します。

**ブラウザでの実操作確認は人が行う必要があります。** このリポジトリにはbrowser E2Eフレームワークがありません（§8）。Pointer操作とキー操作のロジックは fake target を使った自動試験で検証していますが、実ブラウザでの確認は別です。

## 2. 対象成果物

| 項目 | 値 |
|---|---|
| commit | `14a391f` |
| 実装計画 | `docs/superpowers/plans/2026-09-14-m4-stroke-input.md` |

## 3. 実行環境

| 項目 | 値 |
|---|---|
| OS | macOS 26.2 (darwin arm64) |
| Node.js | v25.2.0 |
| 依存追加 | **なし**（Vitest の node 環境のみで検証） |

## 4. 実行commandと結果

```text
npm run verify
  Test Files  33 passed (33)
  Tests       266 passed (266)
  Type check  passed
  Build       passed
```

## 5. 変換パイプライン

```text
生Pointer点列
  -> StrokeRecorder      最小距離間引き / 範囲外・非有限の除外 / 点数・時間の上限
  -> normalizeStroke     画面px -> ワールドm、y反転、線長重み付き重心を原点へ
  -> resampleByDistance  等間隔re-sampling（既定 0.12 m）
  -> isClosedLoop        該当すれば理由付きで拒否
  -> hasSelfIntersection 該当すれば理由付きで拒否
  -> detectCorners       進行方向が 0.5 rad 以上変わる点（連続候補は最鋭点へ集約）
  -> simplifySegment     **区間の内部だけ** RDP（許容 0.08 m）
  -> mergeShortEdges     最小骨長 0.35 m 未満のEdgeを統合
  -> splitLongEdges      最大骨長 1.2 m 超のEdgeを等分
  -> mergeShortEdges     分割後に生じた短Edgeを再統合
  -> 骨数上限チェック     10本超は理由付きで拒否
  -> CreatureGraph 化     rootは重心に最も近い節点（ID順に依存しない）
  -> validateCreatureGraph 最終検証。落ちたら理由を返す
```

**RDPを全点列へ先に適用していません**（docs/04 §3）。位相（折れ曲がり）で区切ってから各区間の内部にだけ適用します。

## 6. fixture一覧と変換結果

画面 640×480、ワールド短辺 6 m、骨半径 0.11 m。

| fixture | 形 | 結果 | Node | Edge | Body | Joint | 骨長の範囲 |
|---|---|---|---:|---:|---:|---:|---|
| `straight` | 水平な直線 | OK | 6 | 5 | 5 | 4 | 1.00〜1.00 m |
| `lShape` | 途中で90度 | OK | 7 | 6 | 6 | 5 | 1.13〜1.20 m |
| `zigzag` | 上下交互4回 | OK | 9 | 8 | 8 | 7 | 0.95〜0.97 m |
| `curve` | 緩い弧 | OK | 7 | 6 | 6 | 5 | 0.66〜1.15 m |
| `stubTail` | 終端に0.2 mの突起 | OK | 5 | 4 | 4 | 3 | 0.91〜0.91 m |
| `tooShort` | 12 pxだけの線 | **拒否** `stroke-too-short` | - | - | - | - | - |
| `repeatedPoint` | 同一点を40回 | **拒否** `stroke-too-short` | - | - | - | - | - |
| `selfIntersecting` | 自分と交差 | **拒否** `self-intersecting` | - | - | - | - | - |
| `closedLoop` | 始点へ戻る四角 | **拒否** `closed-loop` | - | - | - | - | - |

- 長い直線が5本の骨になるのは、**最大骨長1.2 m**（docs/04 §5「短辺の20%」）で分割されるためです。docs/04 §7 の「直線 → 1 Body」は短い線を前提にした表であり、物理制約と矛盾しません。
- `curve` は折れ曲がり点を持たないため、区間内部のRDPが弧に沿った6本の骨を作ります。1本の直線に潰れません。
- `stubTail` の0.2 m の突起は最小骨長0.35 m 未満なので、中間節点を落として隣へ統合しました。**ゼロ長Edgeも最小未満のEdgeも生成していません。**

## 7. 受入条件ごとの合否

| 受入条件 | 判定 | 根拠 |
|---|---|---|
| 直線、L字、ジグザグ、短すぎる線、重複点をfixtureで検証する | 合格 | §6 の表。加えて緩い曲線・終端突起・自己交差・閉ループも検証 |
| 入力event頻度が異なっても、同じ軌跡から同等のGraphを得る | 合格 | L字を 30 px / 12 px / 3 px 間隔で入力し、Node 7・Edge 6 が一致。**節点座標の最大差 0.0000 m**（固定した閾値は 0.05 m） |
| ゼロ長Edge、参照切れNode、上限超過を生成しない | 合格 | `never produces an edge outside the allowed bone length` / `stays within the bone count limit` / `produces a graph that always passes creature validation` |
| 不正入力は拒否理由と直し方を画面へ表示する | 合格（自動部分） | `explains every rejection in a way a person can act on`。表示自体は `bench/stroke-input.html` で行う（人の確認が必要） |
| previewのNode／Edge数とBody／Joint数が対応する | 合格 | `matches the preview counts to the bodies and joints the simulation builds`（bone = Edge数、joint = Edge数−1 = Node数−2） |
| 描いた単純GraphでM3の進化loopを開始、停止、再実行できる | 合格 | `learns from a hand drawn L shape` / `learns from a hand drawn zigzag` / `can stop and run the same drawing again with the same result` |
| keyboardとpointerの基本操作をbrowser testで確認する | **一部未確認** | fake targetによる自動試験10件は合格。**実ブラウザでの確認は未実施**（§8） |
| `npm run verify` が成功し、入力fixture一覧をdocsへ追加する | 合格 | 本ドキュメント |

## 8. 人の確認が必要な項目

```bash
npm run dev
# ブラウザで http://127.0.0.1:5173/bench/stroke-input.html を開く
```

1. キャンバスをドラッグして一筆で線を描く。離すと骨格preview（黄色の骨・白丸の節点）が出る。
2. 自己交差する線、輪、短すぎる線を描いて、**拒否理由と直し方**が読めるか確認する。
3. 「この形で学習する」で学習し、世代0と最良世代のリプレイを見比べる。
4. Backspace（消去）、Enter（学習開始）、Escape（取り消し）がキーボードだけで効くか確認する。

### browser E2E フレームワークについて

`docs/13` §5 のマトリクスはM4に browser 試験を「必須」としていますが、このリポジトリには E2E フレームワーク（Playwright 等）がありません。

- **現状**: Pointerイベントの座標変換・capture・多重Pointer・dispose、キー写像は fake target を使った node 上の自動試験で検証済み。
- **不足**: 実ブラウザでのPointer挙動、canvas描画、focus、実際のキーイベント。
- **判断が必要**: Playwright を devDependency として導入するか。ブラウザバイナリのダウンロードを伴い、CIと実行環境に影響します。**ユーザー判断として提起します**（docs/13 §7 の「対象環境の追加」に近い決定）。

導入しない場合、M4は「技術検証済み＋手動確認待ち」のままとし、E2EはM6の体験統合でまとめて判断します。

## 9. 自動試験で確認したこと

- 生Pointer点列の記録: 最小距離未満・非有限・範囲外の点を落とし、点数と時間の上限で打ち切り、cancelで破棄する（12件）。
- 正規化: 線長重み付き重心が原点、y軸反転、短辺が6 mに対応、形が歪まない（14件）。
- re-sampling: 端点保存、内部の間隔が一定、角を切る損失が spacing 未満、異なる密度の同一軌跡が同じ点数になる。
- 位相検出: 直線0・L字1・ジグザグ3のcorner、緩い曲線では0、連続候補の集約、端点を除外、自己交差の有無、閉ループ判定、RDPの端点保存（20件）。
- Pointer adapter: client座標→要素ローカル、down→move→upの一連、down前のmove無視、pointer capture、cancelでの破棄、多重Pointerの無視、dispose、capture非対応環境、キー写像（10件）。
- Graph変換: §6 の表、決定性、密度非依存、preview一致、拒否理由の可読性（19件）。
- 学習接続: preview↔Body/Joint対応、L字・ジグザグでの学習完走、再実行の一致、異なる形は異なるgraph hash、拒否されたstrokeは学習へ渡らない（6件）。

### 配線切断証明

| 外した配線 | 失敗した試験 |
|---|---|
| 折れ曲がり判定（常にcorner扱い） | 直線・ジグザグ・曲線の3試験 |
| 短Edge統合 | `merges a stub shorter than the minimum bone instead of rejecting the stroke` のみ |

## 10. 未確認事項と持ち越し

1. **実ブラウザでのPointer・キーボード操作**（§8）。
2. **browser E2E フレームワークを導入するか**（§8、ユーザー判断）。
3. 戻り線による枝分かれ、任意の自己交差、閉ループ（M5）。
4. Edge単位のUndo。現在の「消去」は全消去のみ（M5）。
5. 線の太さを物理半径へ反映するか（docs/09 未確定事項 9）。現在は固定 0.11 m。
6. `worldShortSide` 6 m と最小/最大骨長 0.35／1.2 m の妥当性。実際に描いて遊んだ後に再調整する。
7. 手描きGraphでの進化の有効性。M3の実験は `zigzag6` fixtureのみで、手描き形状での改善幅は未測定。
8. M2から持ち越しの p95 frame time、M3から持ち越しの世代変化の視認確認。
