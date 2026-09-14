# M1 Simulation基盤 検証結果

検証日: 2026-09-14

## 1. 結論

M1の受入条件（[開発計画](12-development-plan.md) §5）をすべて満たしました。Phaser Sceneを起動せずに、`CreatureGraph` の検証から Body／Joint 生成、地面上での episode 実行、metrics 収集、完全な cleanup までを実行できます。

この結果は**単一個体**の基盤が成立したことを示すものです。Population並列評価、遺伝的アルゴリズム、自由描画からのGraph生成、性能実測はまだ行っていません。

## 2. 対象成果物

| 項目 | 値 |
|---|---|
| commit | `856188f` |
| 実装計画 | `docs/superpowers/plans/2026-09-14-m1-simulation-foundation.md` |
| ロードマップ | `docs/superpowers/plans/2026-09-14-m1-to-m4-roadmap.md` |

## 3. 実行環境

| 項目 | 値 |
|---|---|
| OS | macOS 26.2 (arm64) |
| Node.js | v25.2.0 |
| npm | 11.6.2 |
| Phaser | 4.2.1 |
| Phaser Box2D | 1.1.0 |
| TypeScript | 7.0.2 |
| Vite | 8.2.2 |
| Vitest | 5.0.0 |

P0の検証はWindows／Node 24.15.0で行いました。M1はmacOS／Node 25.2.0です。**OSとNodeをまたいだ数値の一致は未確認**であり、決定性の検証は同一環境内の再実行に限られます。

## 4. 実行commandと結果

```text
npm run verify
  Test Files  15 passed (15)
  Tests       77 passed (77)
  Type check  passed
  Build       passed (dist/assets/index.js 1,541.04 kB / gzip 403.48 kB)
```

Viteの500 kB chunk警告は継続中です。M7で分割または受容を判断します。

## 5. 受入条件ごとの合否

| 受入条件 | 判定 | 根拠 |
|---|---|---|
| Red → Green → Refactor の順序で試験を作成する | 合格 | 全タスクで先に失敗テストを追加し、module解決エラーまたは期待値差のRedを確認してから実装 |
| 不正Graphは例外で全体を壊さず、理由付きvalidation errorになる | 合格 | `validateCreatureGraph` の8試験。`reports every broken invariant instead of throwing` で6種のcodeを同時収集 |
| fixtureに対してBody数、Joint数、接続先、limit、motor設定が一致する | 合格 | `creates one body per bone and one joint per plan joint` / `connects every joint to the bone pair the plan names` / `matches the fixture joint limits, motor flag and torque` |
| 同一fixtureと同一設定の再実行結果が数値許容誤差内で一致する | 合格 | `reproduces the same result for the same fixture and settings`（重心x/y・motorEffort・maxForwardProgressを相対誤差1e-6で比較） |
| 10,000 fixed stepsで座標、角度、速度、fitness入力値が有限値を保つ | 合格 | `keeps every state value finite across 10,000 fixed steps` |
| 100回の生成・終了・cleanup後にBody／Joint数が基準値へ戻る | 合格 | `returns the world to its baseline after 100 create and cleanup cycles`（各サイクルで `countShapes()` が baseline と baseline+5 を往復） |
| Phaserを起動せずにcontract／integration testを実行できる | 合格 | vitest `environment: "node"`。`src/simulation/` と `src/domain/` はPhaserを一切importしない |
| `npm run verify` が成功し、M1検証記録をdocsへ追加する | 合格 | 本ドキュメント |

## 6. 使用fixtureと設定値

`tests/fixtures/creature-graphs.ts`（骨の太さはすべて半径0.11 m）

| fixture | Edge数 | Joint数 | 形 |
|---|---:|---:|---|
| `chain4` | 4 | 3 | 直線、骨長0.8 m |
| `lShape5` | 5 | 4 | 途中で90度曲がるL字 |
| `zigzag6` | 6 | 5 | 上下交互、骨長0.781 m |
| `yBranch5` | 5 | 4 | 次数3のnode `c` を持つY字 |

既定値:

- `DEFAULT_GRAPH_LIMITS`: 骨長0.25〜2 m、最大12本、最大次数4、総延長16 m、座標±8 m、半径0.05〜0.4 m
- `DEFAULT_SKELETON_SETTINGS.joint`: limit ±0.9 rad、maxMotorTorque 40、limit/motorともに有効
- `DEFAULT_SKELETON_SETTINGS.body`: density 1、friction 0.8、linearDamping 0.02、angularDamping 0.05
- `DEFAULT_PHYSICS_WORLD_OPTIONS`: gravity −10 m/s²、地面 half extents 200×0.5 m（上面 y = 0）、friction 0.85、sleep無効
- `DEFAULT_EPISODE_OPTIONS`: dt 1/60 s、substep 4、6秒、座標上限 500 m（M1時点。**M2で `maxDisplacement` 200 m へ変更**。§11 参照）

## 7. 自動試験で確認したこと

- Graph不変条件17種を error code として表現し、複数違反を同時に報告する。
- 4〜6ボーンfixtureがすべてvalidationを通る。
- Graph hashが宣言順に依存せず、形が変われば変わる。
- Edge数と同数のBone、共有Nodeごとに（次数−1）個のJointを作る。Y字では1 nodeから2 jointができる。
- Jointのanchorが両側の骨から同じworld座標を指す。
- `referenceAngle` を静止姿勢に合わせるため、L字骨格でも初期joint角度が0になる。
- 骨格が地面より上に生成され、重力で落ちて地面上で静止する（重心yが0より大きい）。
- motorを駆動した個体だけが関節角度を変える。
- 駆動中の関節角度が limit + 0.15 rad 以内に留まる。
- destroy で Joint → Body の順に破棄し、Worldのshape数が地面だけに戻る。破棄後の操作は例外になる。
- episodeが `durationSeconds / stepSeconds` 回ちょうど進む。
- 座標が範囲外になった個体を例外ではなく `invalid` として打ち切る。
- 10,000 step後も全Body座標・角度・速度・全Joint角度・metricsが有限。
- 100サイクルの生成→実行→cleanupでshape数が基準へ戻る。
- 同一条件の再実行結果が一致する。
- 同一Worldを作り直さずに2世代連続で実行しても結果が一致する（許容誤差1e-3）。
- `src/domain/` からPhaser／Box2Dへ推移的にも到達しない（`tests/unit/layering.test.ts`）。

### 配線切断証明

各タスクで主要配線を一時的に外し、対象試験だけが失敗することを確認しました。

| 外した配線 | 失敗した試験 |
|---|---|
| 連結性チェック（union-find） | `rejects a graph that is not a single connected component` のみ |
| Joint anchorの符号（nodeA側を+へ） | `anchors every joint on the shared node from both bones` のみ |
| `referenceAngle` を0固定 | `starts a bent skeleton at joint angle zero` のみ |
| `setMotorSpeed` の呼び出し | `records centre of mass progress and motor effort` のみ |

## 8. 手動で確認したこと

なし。[マイルストーン品質・判断ゲート](13-milestone-quality-and-decision-gates.md) §5のマトリクスどおり、M1にbrowser確認と手動判断は必須ではありません。M1の成果物は画面へ接続していないため、P0のデモ画面（2ボーン）は変更していません。

## 9. 実装上の発見

1. **`b2World_GetCounters()` は空実装**で値を返しません。資源リーク検出には `b2World_OverlapAABB` による残存shape数の計測を使いました。既定のquery filterは `categoryBits = 1` のため、生物shape（`maskBits` が地面のみ）に当たりません。計測時は category/mask を全ビットにする必要があります。
2. **`CreateRevoluteJoint` は `referenceAngle` を設定しません**。曲がった骨格で初期joint角度を0にするには、`b2DefaultRevoluteJointDef()` に `referenceAngle` を設定して `jointDef` として渡します。
3. **`CreateCapsule` に `width`/`height` を渡すと全長が `height + 2 * radius`** になります。node間距離を正確に一致させるため、`center1`/`center2`/`radius` を明示しています。
4. 個体間および自己の衝突は `categoryBits`/`maskBits`（生物 0x0001、地面 0x0002、生物のmaskは地面のみ）で構造的に排除しました。M2のレーン分離では `groupIndex` を追加で使えます。

## 10. 未確認事項と持ち越し

1. Population 1／8／32 の throughput と p95 frame time（M2）。
2. 1 World内の複数レーンと個体間contactが0件であることの証明。shapeの `enableContactEvents` を有効にして begin event の相手を検査する（M2）。
3. 100世代相当の heap 傾向（M2）。M1で確認したのは shape 数のみ。
4. 表示個体数が評価結果へ影響しないことの試験（M2）。
5. ブラウザ上での動作。M1の成果物はまだ画面へ接続していない。
6. OS／Node／ブラウザをまたいだ決定性。
7. 背景tab復帰時のaccumulator処理。
8. build chunk分割の要否（M7）。
9. `EpisodeRunner` は現在 `maxForwardProgress` を0で初期化するため、後退しかしない個体の最大前進量は0になる。M3のFitness設計時に妥当性を再確認する。

## 11. その後の変更（2026-09-14、M2時点）

この記録はM1完了時点のものです。以後に変更した点を追記します。

| 項目 | M1時点 | 変更後 | 理由 |
|---|---|---|---|
| 暴走検出 | `maxCoordinateMagnitude` 500 m（world原点からの絶対座標） | `maxDisplacement` 200 m（スポーン時の重心からの距離） | レーン配置では個体の絶対座標がレーン位置に比例して大きくなり、遠いレーンの正常な個体を誤判定するため。[docs/15](15-m2-population-performance.md) §9 |
| `EpisodeRunner` の構造 | worldのstepを自分で持つ単一クラス | `EpisodeTracker`（進行とmetrics）と分離。`EpisodeRunner` はtracker + 自前のworld step | 1つのWorldで複数個体を同時に進める `PopulationRunner` と進行規則を共有するため |
| `CreatureHandle` の定義場所 | `src/simulation/box2d/box2d-creature-factory.ts` | `src/simulation/ports/creature-port.ts` | `EpisodeRunner` と domain がBox2D adapterを推移的にも参照しないようにするため（D-009） |
| `maxAbsCoordinate()` | 絶対座標の最大値 | `maxDistanceFrom(point)` へ置換 | 上記の暴走検出の変更に伴う |

M1の受入条件の判定はこれらの変更後も変わりません。
