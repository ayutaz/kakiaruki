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
  -> 骨数上限チェック     14本超は理由付きで拒否
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
3. 「この形で学習する」で学習する。**学習が終わるとリプレイが自動で再生されます**（§11）。
4. 「比較する世代」スライダーを端から端まで動かし、世代0と選んだ世代の動きを見比べる。ドラッグの途中でも再生が止まらないこと（§11 原因2の回帰確認）。
5. Backspace（消去）、Enter（学習開始）、Escape（取り消し）がキーボードだけで効くか確認する。
6. 描き直して学習、を数回繰り返しても壊れないこと。

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

## 11. その後の修正（2026-09-14、§8の手動確認で発見）

§8 の手動確認で「一筆を描いて学習しても、リプレイのプレビューが動かない」という報告がありました。原因を2つ特定し、修正しました。

### 原因1: 学習後に自動再生していなかった（体験の不足）

`learn()` は `prepareReplay()` で**最初の1フレームだけ**を描き、`#playing` は false のままでした。動かすには「最初から再生」を押す必要がありますが、状態表示は「学習完了 …」としか出さず、その導線がありませんでした。

修正: 学習が終わったらそのまま再生する。世代スライダーを動かしたときも再生する。状態表示に、スライダーで世代を比べられることを書く。

### 原因2: Worldを作り直すと32回で確保に失敗する（不具合）

`prepareReplay()` は呼ばれるたびに `createPhysicsWorld()` でWorldを作り直していました。世代スライダーの `input` は1回のドラッグで数十回発火するため、**スライダーを1回動かすだけでWorldを使い切ります**。

`phaser-box2d@1.1.0` の `b2DestroyWorld` は末尾で次のように書かれています。

```js
const revision = world.revision;
world = new b2World();          // ローカル変数を差し替えているだけ
world.worldId = B2_NULL_INDEX;
world.revision = revision + 1;
```

`b2_worlds[i]` は書き換わらないため `inUse` が true のまま残り、**破棄したslotは二度と再利用されません**。`B2_MAX_WORLDS` は 32 です。33個目の `b2CreateWorld` は null id を返し、`createPhysicsWorld()` が `Phaser Box2D did not allocate a world` を投げます。

こうなると `prepareReplay()` は例外で中断し、`#runner` は破棄済みWorldを指したままになるため、以後「最初から再生」を押しても何も起きません。ページを再読み込みするまで回復しません。

修正前の実測（headless、World の生成と破棄の反復）:

```text
cycle 30: ok
cycle 33: FAILED -> Phaser Box2D did not allocate a world
```

修正:

| 対象 | 変更 |
|---|---|
| `src/app/evolution-run.ts` | `runEvolution()` / `replayGenome()` に `world` を渡せるようにした。渡した場合は作り直さず、破棄もしない（D-006）。渡さない場合の挙動は従来どおり |
| `bench/stroke-input.ts`、`bench/replay.ts`、`bench/frame-time.ts` | **ページの寿命でWorldを1つだけ**持ち、学習・リプレイ・設定変更では個体だけを破棄する |
| 同上 | 再生要求が重なっても `requestAnimationFrame` の連鎖が2本にならないようにした（2本走ると再生が倍速になる） |

### 追加した試験

`tests/integration/evolution-run.test.ts`（Red → Green の順）。

| 試験 | 何を固定したか |
|---|---|
| `evaluates inside the given world instead of a fresh one` | 重力を変えたWorldを渡すと結果が変わる。=渡したWorldで本当に評価している |
| `runs more times than Box2D has world slots` | 同じWorldで40回連続実行できる（修正前は33回目で `did not allocate a world`） |
| `reuses the given world for a replay as well` | `replayGenome` も同じWorldを使い、終了後は地面だけに戻る |

**配線切断証明**: `options.world` を無視する実装（修正前）では、この3件だけが失敗し、他の14件は通りました。1件目は「重力を変えても結果が同じ」、2件目・3件目は「World確保失敗」という、意図どおりの理由で落ちています。

修正後の headless 検証（1つのWorldで学習40回 + スライダー200回相当の再構築）:

```text
学習 40 回目: shapes=17 (地面1 + リプレイ2個体)
スライダー200回後: shapes=17
再生後の移動量: 世代0 1.13 m / 世代2 2.15 m
片付け後: shapes=1 (地面のみ)
```

`npm run verify`: Test Files 33 passed / Tests 270 passed、型検査・build ともに成功。

### 原因3: まっすぐな線を「自己交差」と誤判定していた（不具合）

「複雑な形が描けない」という報告から見つかりました。

`segmentsCross` は外積の符号で左右を判定していましたが、`(d1 > 0) !== (d2 > 0)` という書き方では **外積がちょうど0の点を「負の側」として数えます**。一直線に並ぶ点列では外積が 0 と ±1e-17（丸め誤差）に割れるため、**交差していない直線部分が交差と読まれます**。

実測（xが単調に増える＝定義上けっして自己交差しない線を3000本）:

| 判定式 | 誤って拒否した線 |
|---|---:|
| 修正前 `(d1 > 0) !== (d2 > 0)` | 244 / 3000（**8.1%**） |
| 符号0を除外（epsilon 0） | 16 / 3000（0.5%） |
| 符号0を除外 + epsilon 1e-9 | **0 / 3000** |

修正: 両端が**厳密に反対側**にあるときだけ交差とする（`sign(d1) * sign(d2) < 0`）。一直線上（符号0）は交差ではありません。さらに、丸め誤差が0をまたぐ場合のために `COLLINEAR_EPSILON = 1e-9`（直線から約 1e-8 m のずれに相当）を置きました。

追加した試験（`tests/unit/stroke-topology.test.ts`、`tests/unit/stroke-graph-builder.test.ts`）:

| 試験 | 何を固定したか |
|---|---|
| `is false for a straight run whose cross products are rounding noise` | 外積が 0 と 1e-18 に割れる直線6点 |
| `is false when the cross products straddle zero as rounding noise` | 外積が ±1.4e-17 に割れる直線4点（epsilonが要る場合） |
| `is false for a shallow wave that never crosses itself` | 浅い波線（人が普通に描く形） |
| `is false for every stroke whose x only increases` | Seed固定で300本生成し、誤判定0件 |
| `accepts a shallow wave instead of calling it self intersecting` | 変換パイプライン全体での受け入れ |

**配線切断証明**: 修正前の判定式へ戻すと上記5件だけが失敗。epsilonだけ0にすると、そのうち2件（±1.4e-17の4点と300本の生成試験）が失敗しました。どちらの変更も必要です。

### 原因4: Populationの一部が地面の外に生成されていた（不具合）

リプレイを調べる過程で見つけました。**M4だけでなくM2・M3の実測値にも影響します。**

`planLanes` はPopulationを中央から左右へ並べ、間隔は「骨格幅 + 12 m」です。一方 `DEFAULT_PHYSICS_WORLD_OPTIONS.groundHalfWidth` は 200 m でした。

| 骨格幅 | レーン間隔 | Population 32 の端 | 地面の外に出た個体 |
|---:|---:|---:|---:|
| 1.0 m | 13.0 m | ±202 m | 2 / 32 |
| 3.82 m（`zigzag6`、M2・M3で使用） | 15.8 m | ±245 m | **6 / 32** |
| 5.93 m（一筆で描いた形の例） | 17.9 m | ±278 m | **10 / 32** |

地面の外に生成された個体は6秒間落下し（終了時 y = −172.7 m）、前進量0のまま `completed` として世代へ混ざっていました。`maxDisplacement` 200 m にわずかに届かないため `invalid` にもならず、**静かに母集団の1/5〜1/3を無駄にしていました**。

修正: 地面の半幅を 200 m → **1000 m**。Population 32 で最大骨格（1.2 m × 14本）を並べても端は ±446 m、そこから `maxDisplacement` 200 m 進んでも地面が続きます。

追加した試験:

| 試験 | 何を固定したか |
|---|---|
| `spawns the whole population on the ground, not past its edge`（integration） | Population 32 を6秒動かし、落下した個体が0件 |
| `keeps every lane of a full population on the default ground`（unit） | 一筆が作れる最大骨格でも、全レーンが既定の地面に収まる |

**配線切断証明**: 地面を200 mへ戻すと、この2件だけが失敗しました。

再測定の結果は [docs/15](15-m2-population-performance.md) §12 と [docs/16](16-m3-evolution-validation.md) §11 に記録しました。**M2・M3の受入条件の判定は変わりません。**

### 原因5: 骨の本数上限10本では、キャンバスいっぱいに描けなかった（設計値）

「複雑なものが描けない」という報告の残り半分です。バグではなく設計値ですが、手動確認の妨げになっていたため、**ユーザー判断として上限を14本へ上げました**（[D-010](09-risks-open-questions-and-decisions.md)）。

| 設定 | 変更前 | 変更後 |
|---|---:|---:|
| `DEFAULT_STROKE_GRAPH_OPTIONS.maxEdgeCount` | 10 | **14** |
| `DEFAULT_GRAPH_LIMITS.maxEdgeCount` | 12 | **16** |
| `DEFAULT_GRAPH_LIMITS.maxTotalLength` | 16 m | **24 m** |

一筆側の上限と生物Graph側の上限は別々に定義されているため、**両方を上げないと「変換は成功したのに学習へ渡せないGraph」ができます**。この関係を試験で縛りました。

性能の実測（Population 32、6秒episode、headless）:

| 骨数 | 評価の実時間 | 実時間比 |
|---:|---:|---:|
| 6本 | 0.181 秒 | 33.2x |
| 10本 | 0.260 秒 | 23.1x |
| 12本 | 0.297 秒 | 20.2x |
| 14本 | 0.354 秒 | **16.9x** |

実用上の描ける長さ（640×420のキャンバス）。`splitLongEdges` が長いEdgeを等分するため、1本あたりは平均 0.9〜1.0 m になります。**上限は描線 約930 px（キャンバス幅の約1.5倍）**です。

| 描いた線 | 長さ | 骨数 | 結果 |
|---|---:|---:|---|
| 対角1本 | 655 px | 8 | OK |
| 波2山 | 930 px | 12 | OK |
| 波3山 | 1,147 px | 16 | 拒否 |

学習時間は骨数に比例して伸びます。20世代・Population 32 で、**骨5本なら1.6秒、骨12本なら6.0秒**（この間ページは止まります）。

追加した試験:

| 試験 | 何を固定したか |
|---|---|
| `keeps every stroke limit inside the creature graph limits` | 一筆側の上限がGraph側の上限を超えない（骨数・総延長・骨長・半径・座標範囲） |
| `accepts a stroke that fills the canvas and keeps it inside the graph limits` | 骨14本になる線が変換され、かつ `validateCreatureGraph` も通る |

**配線切断証明**: 一筆側を10本へ戻すと後者が失敗、Graph側を12本へ戻しても後者が失敗、総延長を16 mへ戻すと前者が失敗しました。3つの変更すべてが必要です。

### リプレイで何が見えるか

「上段が動かない」ように見える場合、多くは**世代0のベストが実際にほとんど動かない**ためです。ある一筆（骨10本・骨格幅5.93 m）での実測:

| レーン | 個体 | 6秒間の移動 |
|---|---|---:|
| 上段 | 世代0のベスト | 0.07 m |
| 下段 | 世代2のベスト | 8.02 m |

上段は「まだ学習していない状態」を見せるための対照です。下段だけが進むのが正常な見え方になります。

なお、画面上部の **「世代0 ベスト距離」は fitness 最良の個体ではなく、その世代で最も遠くまで進んだ個体の距離**です（`summarizeGeneration` は前進量の最大値を取ります）。リプレイに出るのは fitness 最良の個体なので、**表示距離とリプレイの見た目が一致しないこと**があります。上の例では表示が 1.00 体長、リプレイの上段は 0.01 体長でした。この不一致はM6のUI設計で解消します（§10 に持ち越し）。

### この修正で未確認のこと

- **ブラウザ上での確認は未実施**です。§8 の手順3・4・6がその確認にあたります。
- `b2DestroyWorld` のslot解放漏れは vendor 側の問題で、**回避しただけで直してはいません**。1ページで33個以上のWorldを必要とする実装は今後も失敗します。D-006（1 Worldを再利用）を守る限り起きません。
- 同じ理由で、1つのテストファイル内でWorldを32個より多く作ることもできません。現在の最大は `tests/integration/evolution-run.test.ts` の17個です。
- 「世代0 ベスト距離」とリプレイ上段の個体が別物である点は、表示の問題として残っています（上記）。
- 骨の本数上限は 10 → 14 本へ上げました（原因5）。それでも非常に長い線（描線1,000 px超・骨16本以上）は拒否されます。さらに広げるなら最大骨長 1.2 m の見直しが要ります。
- 骨14本の学習は20世代で約6秒かかります。ページが止まる時間として長いので、M6では進捗表示か非同期化が要ります。
