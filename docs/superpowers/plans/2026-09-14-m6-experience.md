# M6 体験統合 実装計画

> **実装者向け:** 必須サブスキル: `superpowers:subagent-driven-development` または `superpowers:executing-plans`。手順はチェックボックス（`- [ ]`）で追跡します。

**Goal:** 個別に検証した描画・simulation・進化・リプレイを、開発者ツールへ触れずに完走できる一続きの体験へまとめる。

**Architecture:** 画面の判断をすべて**純粋な状態機械**（`src/ui/`）へ置き、DOMとCanvasは状態を映すだけのadapterにする。物理資源（World・個体・runner）の寿命は `src/app/observation-session.ts` が一括で持つ。これにより「学習中は描けない」「速度を変えても評価の定義は変わらない」「停止・再開で資源が残らない」をNode上の自動試験で押さえられる。

**Tech Stack:** TypeScript 7、Vitest 5（environment: node）、Canvas 2D、Vite 8。

**Spec:** [docs/12 §10](../../12-development-plan.md)、[docs/06](../../06-architecture.md)、[docs/13 §10](../../13-milestone-quality-and-decision-gates.md)

## Global Constraints

- 相対importには `.ts` 拡張子を付ける。
- `src/ui/` と `src/domain/` は DOM / Phaser / Box2D に触れない（`tests/unit/layering.test.ts` を拡張して検査する）。
- Worldは作り直さず1つを再利用する（D-006）。`runEvolution` には `world` を渡す。
- 学習中の同期処理はメインスレッドを止める。止まる時間を画面に予告する。
- 閉ループ・自己交差・骨数超過は M5 と同じく理由付きで拒否し、暗黙に形を変えない。
- 受入条件の数値は測定開始前に固定する。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/ui/app-state.ts`（新規） | 画面の状態と遷移。純粋。DOMを知らない |
| `src/app/observation-session.ts`（新規） | 観察フェーズの物理資源。World再利用、個体の生成と破棄、固定step |
| `src/game/rendering/scene-renderer.ts`（新規） | Canvas 2Dで描線preview・骨格・地面・世代を描く |
| `src/main.ts`（変更） | 製品画面の配線。状態機械 ↔ DOM ↔ renderer |
| `index.html`（変更） | 製品画面。P0デモは `bench/p0-demo.html` へ移す |
| `bench/p0-demo.html`（新規） | 既存のP0デモを退避 |
| `tests/unit/app-state.test.ts`（新規） | 状態遷移と禁止操作 |
| `tests/integration/observation-session.test.ts`（新規） | 資源の寿命、速度倍率、背景tab復帰 |

---

## Task 1: 画面の状態機械

**Files:** Create `src/ui/app-state.ts`, `tests/unit/app-state.test.ts`

**Interfaces:**
- Produces: `AppPhase`, `AppState`, `AppEvent`, `initialAppState`, `reduce(state, event): AppState`

**仕様（先に固定する）**

```text
phase: "drawing" -> "ready" -> "learning" -> "observing"
                      ^                          |
                      +--------------------------+  （描き直し）
```

| 状態 | 意味 | 許す操作 |
|---|---|---|
| `drawing` | まだ有効な形がない | 描く、消去 |
| `ready` | 形が確定し、学習できる | 描く、Undo、消去、学習開始 |
| `learning` | 学習中。画面が止まる | **なし**（すべて拒否する） |
| `observing` | 学習が終わり、観察・リプレイ中 | 再生、一時停止、世代選択、速度、表示個体数、描き直し |

- `learning` 中の `strokeFinished` / `undo` / `clear` は**状態を変えない**。古いWorldへUIが触れないようにするため。
- `speed` は 1／2／4／8 のみ。`episodeSeconds` と `populationSize` は `learning` 開始時に固定し、`observing` 中は変わらない。
- `error` を受け取ったら `phase` を `drawing` へ戻さず、`lastError` を保持したまま操作可能な状態へ戻す。

- [ ] **Step 1: 失敗する試験を書く**

```ts
it("refuses to change the drawing while learning", () => { ... });
it("keeps the episode definition when the speed changes", () => { ... });
it("goes back to ready when the drawing is redone after observing", () => { ... });
it("keeps the error message until the next successful stroke", () => { ... });
it("only accepts a speed the UI offers", () => { ... });
```

- [ ] **Step 2: Redを確認する** — module解決エラー。
- [ ] **Step 3: 実装する。**
- [ ] **Step 4: Greenを確認し、learning中の禁止を外すと該当試験だけが落ちることを確認する。**
- [ ] **Step 5: commit**

---

## Task 2: 観察セッション（物理資源の寿命）

**Files:** Create `src/app/observation-session.ts`, `tests/integration/observation-session.test.ts`

**Interfaces:**
- Produces: `ObservationSession`（`start(graph, genomes, options)`, `advance(wallSeconds, speed)`, `snapshots(count)`, `finished`, `dispose()`）

**仕様**

- Worldは**セッション全体で1つ**。`start` を繰り返しても作り直さない。
- `start` は前回の個体を破棄してから新しい個体を作る。
- `advance(wallSeconds, speed)` は `wallSeconds * speed` を固定stepへ変換する。**1回の呼び出しで進めるstepには上限がある**（背景tabから戻ったときに一気に消費しない）。
- `dispose()` の後、Worldのshape数は地面だけに戻る。

- [ ] **Step 1: 失敗する試験を書く**

```ts
it("reuses one world across many observations", () => { ... });   // 40回 start/dispose
it("returns the world to the ground after dispose", () => { ... });
it("advances more steps at x8 than at x1 for the same wall time", () => { ... });
it("does not burn a long background pause in one frame", () => { ... });
it("gives the same episode result whatever the speed was", () => { ... });
```

- [ ] **Step 2: Redを確認する。**
- [ ] **Step 3: 実装する。**
- [ ] **Step 4: Greenを確認し、step上限を外すと背景tabの試験だけが落ちることを確認する。**
- [ ] **Step 5: commit**

---

## Task 3: 製品画面

**Files:** Create `src/game/rendering/scene-renderer.ts`、`bench/p0-demo.html`; Modify `src/main.ts`, `index.html`, `src/style.css`

- [ ] **Step 1: P0デモを `bench/p0-demo.html` へ退避し、`docs/11` の参照を更新する。**
- [ ] **Step 2: `index.html` を製品画面にする。** キャンバス1つ、操作パネル、状態表示、error表示。すべての操作にキーボード到達手段を持たせる。
- [ ] **Step 3: `src/main.ts` で状態機械・セッション・rendererを配線する。**
- [ ] **Step 4: `npm run verify` と、devサーバーでの200応答を確認する。**
- [ ] **Step 5: layering試験を拡張し、`src/ui/` がDOM/Box2Dへ到達しないことを機械的に検査する。**
- [ ] **Step 6: commit**

---

## Task 4: 検証記録

**Files:** Create `docs/19-m6-experience-review.md`; Modify `docs/README.md`、`docs/12`、`docs/13`、`docs/06`、`CLAUDE.md`

- [ ] **Step 1: 受入条件9項目の合否を書く。E2E未導入の項目は「未達」と明記する。**
- [ ] **Step 2: 人が行う体験確認の手順を書く。**
- [ ] **Step 3: commit**

## Self-Review

docs/12 §10 の受入条件9項目への対応: E2E → **Task 4で未達として記録**（フレームワーク導入は人の決定）、学習中の書き換え禁止 → Task 1、速度と定義 → Task 1・2、背景tab → Task 2、資源 → Task 2、error表示 → Task 1・3、keyboard → Task 3、体験確認 → Task 4、verify+記録 → Task 4。
