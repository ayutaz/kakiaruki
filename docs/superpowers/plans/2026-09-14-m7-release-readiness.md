# M7 安定化と公開判断 実装計画

> **実装者向け:** 必須サブスキル: `superpowers:subagent-driven-development` または `superpowers:executing-plans`。

**Goal:** 長時間の連続運転で壊れないことを実測し、公開判断に必要な材料（性能・依存・権利・体験）を人が決められる形で揃える。

**Architecture:** 新しい機能は作らない。既存の `runEvolution` / `ObservationSession` を長時間まわす計測スクリプトを足し、結果を検証記録へ落とす。判断そのものは人が行う。

**Spec:** [docs/12 §11](../../12-development-plan.md)、[docs/13 §5・§6](../../13-milestone-quality-and-decision-gates.md)

## Global Constraints

- 受入条件の数値は測定開始前に固定する。結果を見てから緩めない。
- 公開・deploymentは人の承認なしに行わない（[docs/13](../../13-milestone-quality-and-decision-gates.md) §7）。
- 技術的合格・体験品質・公開承認を**別々に**記録する。
- 原作の画像・音・文章・画面配置をコピーしない。「同じアルゴリズム」と断定しない。

---

## 測定開始前に固定する判定条件

| # | 条件 | 判定 |
|---|---|---|
| 1 | 100世代の連続実行で未処理例外が0件 | 例外が出たら不合格 |
| 2 | 100世代を通して、統計値（fitness・距離・motorEffort）がすべて有限 | NaN/Infinityが1つでも出たら不合格 |
| 3 | 30分の連続運転で、Worldのshape数が基準値へ戻る | 学習と観察を繰り返し、片付け後に地面だけ（shape 1）へ戻ること |
| 4 | 30分の連続運転で、heapが単調増加しない | 後半20分の使用量が前半比で1.5倍を超えたら不合格 |
| 5 | Population 32 の実時間比が 1.0 以上 | M2で固定した基準。下回ったら理由を明記 |
| 6 | production buildにchunk警告が出ない、または測定に基づき受容 | 現状215 kB |
| 7 | `npm audit` の高危険度が0件 | 出たら内容と対処を記録 |
| 8 | `npm run verify` 成功、release candidate hash を記録 | - |

ブラウザ確認（Chromium / Firefox）と、名称・アート・クレジットの確認は**人が行う**項目です。自動試験では代替しません。

---

## Task 1: 長時間runの計測スクリプト

**Files:** Create `bench/soak.ts`; Modify `package.json`

- [ ] **Step 1: `npm run soak` を足す。** 引数で分数を受け取り、既定30分。
- [ ] **Step 2: 描く → 学習 → 観察 → 片付け、を繰り返す。** 1周ごとに shape数・heap・有限性を検査する。
- [ ] **Step 3: 例外は握りつぶさず、周回数とともに記録して終了する。**
- [ ] **Step 4: 判定条件 1〜4 をスクリプト自身が PASS/FAIL で出す。**
- [ ] **Step 5: commit**

## Task 2: 100世代の回帰試験

**Files:** Modify `tests/integration/population-lifecycle.test.ts` または新規

- [ ] **Step 1: 失敗する試験を書く。** Population 32 × 100世代で、全統計値が有限、shape数が基準へ戻る。
- [ ] **Step 2: Red（未実装なら）→ Green を確認する。**
- [ ] **Step 3: commit**

## Task 3: 依存とbuildの再確認

- [ ] **Step 1: `npm audit` を実行し、結果を記録する。**
- [ ] **Step 2: 非推奨の推移依存を確認する。**
- [ ] **Step 3: build出力とchunk警告の有無を記録する。**

## Task 4: 検証記録と公開判断の材料

**Files:** Create `docs/20-m7-release-readiness.md`; Modify `docs/README.md`、`docs/12`、`docs/13`、`CLAUDE.md`

- [ ] **Step 1: 判定条件ごとの合否を書く。**
- [ ] **Step 2: 技術的合格・体験品質・公開承認を別の節に分ける。**
- [ ] **Step 3: 権利チェックリスト（名称・ロゴ・アセット・原作への言及）を人が確認できる形で書く。**
- [ ] **Step 4: release candidate の commit hash を記録する。**
- [ ] **Step 5: commit**
