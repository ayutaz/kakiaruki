# M3 進化loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development`。Red → 失敗理由確認 → Green → refactor → 配線切断証明 → commit。

**Goal:** 固定形状のControllerを遺伝的アルゴリズムで改善し、「世代を重ねると移動能力が高まる」が成立するかを、Seed固定の対照実験で判定できるようにする。

**Architecture:** 乱数・Genome・Fitness・選択・交叉・突然変異はすべて `src/domain/evolution/` の純粋関数に置き、物理を一切知らない。`src/app/evolution-run.ts` が domain のGAと `PopulationRunner` を結び付ける Application 層になる。50世代×5 Seedの本実験は `bench/evolution-experiment.ts` で実行し、試験スイートには小規模な回帰版を置く。

**Tech Stack:** TypeScript 7, Vitest 5

**Spec:** `docs/12-development-plan.md` §7、`docs/05-physics-controller-and-ga.md`

## Global Constraints

ロードマップの Global Constraints を継承。M3で特に効くもの:

- `src/domain/` は Phaser も Box2D も import しない（`tests/unit/layering.test.ts` が検査）。
- **domain で `Math.random()` を使わない。** 乱数は注入した Seed付き generator のみ。
- 受入条件の数値（5 Seed／50世代／4 Seed以上で改善）は測定開始前に固定し、結果を見てから緩めない。
- 「奇妙だが有効な移動」は残す。除外するのは NaN・すり抜け・数値爆発・初期重なり・個体間衝突だけ（docs/05 §6）。

## 事前に固定する受入閾値

| 指標 | 閾値 |
|---|---|
| 再現性 | 同一Seed・Graph・設定で、全世代のGenome列と統計が**完全一致** |
| 改善 | 5 Seed × 50世代で、**4 Seed以上**が generation 0 の best normalized distance を上回る |
| 対照群比較 | 5 Seedの進化群 best の中央値が、進化なし対照群 best の中央値を**上回る** |
| リプレイ | 保存したbest Genomeの再評価fitnessが元の値と **1e-6 以内**で一致 |
| 異常処理 | invalid個体が出てもRunは規定世代数まで継続 |

Population 32 / episode 6秒 / 50世代 = 約7秒（M2実測 0.136 s/世代）。5 Seedで約35秒。実行時間は問題になりません。

## File Structure

```text
src/domain/evolution/
  seeded-random.ts        新規: mulberry32ベースのSeed付き乱数
  genome.ts               新規: Genome/JointGene、範囲、生成、JointCommandSourceへの変換
  fitness.ts              新規: Fitnessの分解値と合成
  selection.ts            新規: elite / tournament / uniform crossover / gaussian mutation
  evolution-engine.ts     新規: 世代交代と統計、best-ever
src/app/
  evolution-run.ts        新規: GAとPopulationRunnerの結線、対照群、RunRecord生成
bench/
  evolution-experiment.ts 新規: 5 Seed × 50世代の本実験
tests/
  unit/seeded-random.test.ts
  unit/genome.test.ts
  unit/fitness.test.ts
  unit/selection.test.ts
  unit/evolution-engine.test.ts
  integration/evolution-run.test.ts
```

## 受入条件とタスクの対応

| 受入条件 | 担当タスク |
|---|---|
| 同一Seed、Graph、設定から同じGenome列と世代統計を再生成できる | Task 1, 5, 6 |
| 異常個体をinvalidとして打ち切り、Run全体は規定数まで継続できる | Task 3, 6 |
| 5 Seed×50世代で4 Seed以上が改善する | Task 7 |
| 進化群中央値が対照群中央値を上回る | Task 6, 7 |
| Selection/Mutationの配線を切ると回帰試験が失敗する | Task 4, 5 |
| best Genomeのリプレイ結果が許容誤差内で一致する | Task 6 |
| Fitnessの各項と失格理由を記録できる | Task 3, 6 |
| `npm run verify` 成功 + Seed別結果をdocsへ | Task 8 |

---

### Task 1: Seed付き乱数

**Files:** `src/domain/evolution/seeded-random.ts`, `tests/unit/seeded-random.test.ts`

```ts
export interface RandomSource {
  next(): number;                        // [0, 1)
  nextInRange(min: number, max: number): number;
  nextInt(maxExclusive: number): number;
  nextGaussian(): number;                // 平均0・標準偏差1
  pick<T>(values: readonly T[]): T;
}
export function createSeededRandom(seed: number): RandomSource;
```

試験: 同一seedで同一列、異なるseedで異なる列、[0,1)の範囲、`nextInt` の範囲と分布の粗い一様性、Gaussianの平均・標準偏差が10,000サンプルで概ね0/1、空配列の `pick` は例外。

- [ ] Red → Green → commit

---

### Task 2: Genome と JointCommandSource への変換

**Files:** `src/domain/evolution/genome.ts`, `tests/unit/genome.test.ts`

```ts
export interface JointGene {
  readonly amplitude: number;
  readonly phase: number;
  readonly bias: number;
}
export interface Genome {
  readonly globalFrequency: number;
  readonly joints: readonly JointGene[];
}
export interface GenomeBounds {
  readonly frequency: { readonly min: number; readonly max: number };
  readonly amplitude: { readonly min: number; readonly max: number };
  readonly bias: { readonly min: number; readonly max: number };
}
export const DEFAULT_GENOME_BOUNDS: GenomeBounds;   // freq 0.25-3.0 Hz, amplitude 0-0.9, bias -0.5..0.5
export function createRandomGenome(
  random: RandomSource, jointCount: number, bounds?: GenomeBounds
): Genome;
export function clampGenome(genome: Genome, bounds?: GenomeBounds): Genome;
export interface ControllerGains {
  readonly proportionalGain: number;
  readonly derivativeGain: number;
  readonly maxMotorSpeed: number;
}
export const DEFAULT_CONTROLLER_GAINS: ControllerGains;
export function genomeToCommandSource(
  genome: Genome, gains?: ControllerGains
): JointCommandSource;
```

phaseは 0〜2π で wrap、amplitude/bias/frequency は clamp。`genomeToCommandSource` は `createSineCommandSource` を再利用する。

試験: 決定性、範囲内、jointCount一致、clampが範囲外を戻す、phaseのwrap、変換後の指令が同一Genomeで同一。

- [ ] Red → Green → commit

---

### Task 3: Fitness

**Files:** `src/domain/evolution/fitness.ts`, `tests/unit/fitness.test.ts`

```ts
export interface FitnessWeights {
  readonly forwardProgress: number;   // 0.7
  readonly bestProgress: number;      // 0.3
  readonly energy: number;            // 0.01
  readonly invalidPenalty: number;    // 1000
}
export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights;
export interface FitnessTerms {
  readonly forwardProgress: number;
  readonly bestProgress: number;
  readonly normalizedForwardProgress: number;  // 骨格幅で正規化した体長倍
  readonly energyPenalty: number;
  readonly invalidPenalty: number;
  readonly invalidReason: string | null;
}
export interface FitnessBreakdown {
  readonly fitness: number;
  readonly terms: FitnessTerms;
}
export function evaluateFitness(
  result: EpisodeResult,
  skeletonWidth: number,
  weights?: FitnessWeights
): FitnessBreakdown;
```

`fitness = w.forward * forwardProgress + w.best * bestProgress - w.energy * motorEffort - (invalid ? w.invalidPenalty : 0)`。

試験: 前進した個体が静止個体より高い、invalid個体が必ず低い、失格理由が残る、energy項が効く（同じ距離ならmotorEffortが小さい方が高い）、正規化距離が骨格幅で割られる、骨格幅0は例外。

- [ ] Red → Green → commit

---

### Task 4: 選択・交叉・突然変異

**Files:** `src/domain/evolution/selection.ts`, `tests/unit/selection.test.ts`

```ts
export interface ScoredGenome { readonly genome: Genome; readonly fitness: number }
export function selectElite(scored: readonly ScoredGenome[], eliteCount: number): readonly Genome[];
export function tournamentSelect(
  random: RandomSource, scored: readonly ScoredGenome[], tournamentSize: number
): Genome;
export function uniformCrossover(random: RandomSource, a: Genome, b: Genome): Genome;
export interface MutationConfig {
  readonly geneMutationProbability: number;  // 0.15
  readonly frequencySigma: number;           // 0.15
  readonly amplitudeSigma: number;           // 0.12
  readonly phaseSigma: number;               // 0.5
  readonly biasSigma: number;                // 0.1
}
export const DEFAULT_MUTATION_CONFIG: MutationConfig;
export function mutate(
  random: RandomSource, genome: Genome, config?: MutationConfig, bounds?: GenomeBounds
): Genome;
```

試験:
- elite は fitness 降順の上位N、元配列を壊さない、Nが個体数を超えたら全件。
- tournament は高fitnessを選びやすい（固定Seedで統計的に検証）、tournamentSize 1 は一様選択。
- crossover は各geneをどちらかの親から取る（第三の値を作らない）、jointCountが異なる親は例外。
- mutation は確率0で不変、確率1で全geneが変化、範囲内にclamp、phaseはwrap。
- **配線切断証明**: `mutate` を恒等関数にすると「確率1で全geneが変化」が失敗し、`tournamentSelect` を先頭固定にすると選択圧の試験が失敗する。

- [ ] Red → Green → 配線切断証明 → commit

---

### Task 5: EvolutionEngine（世代交代と統計）

**Files:** `src/domain/evolution/evolution-engine.ts`, `tests/unit/evolution-engine.test.ts`

```ts
export interface EvolutionConfig {
  readonly populationSize: number;   // 32
  readonly eliteCount: number;       // 4
  readonly tournamentSize: number;   // 3
  readonly mutation: MutationConfig;
  readonly bounds: GenomeBounds;
}
export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig;
export interface GenerationStats {
  readonly generation: number;
  readonly bestFitness: number;
  readonly medianFitness: number;
  readonly meanFitness: number;
  readonly bestNormalizedForwardProgress: number;
  readonly invalidCount: number;
}
export function createInitialPopulation(
  random: RandomSource, jointCount: number, config?: EvolutionConfig
): readonly Genome[];
export function nextGeneration(
  random: RandomSource, scored: readonly ScoredGenome[], config?: EvolutionConfig
): readonly Genome[];
export function summarizeGeneration(
  generation: number, scored: readonly ScoredGenome[], terms: readonly FitnessTerms[]
): GenerationStats;
```

`nextGeneration` = elite をそのまま残し、残りを tournament 2親 → uniform crossover → mutate で埋める。

試験: 個体数が保たれる、eliteが必ず次世代へ残る、同一Seed・同一入力で同一出力、統計値（best/median/mean/invalidCount）が正しい、eliteCount ≥ populationSize は例外。**配線切断証明**: eliteの引き継ぎを外すと「eliteが残る」試験が失敗する。

- [ ] Red → Green → 配線切断証明 → commit

---

### Task 6: EvolutionRun（物理との結線、対照群、リプレイ）

**Files:** `src/app/evolution-run.ts`, `tests/integration/evolution-run.test.ts`

```ts
export interface EvolutionRunOptions {
  readonly graph: CreatureGraph;
  readonly seed: number;
  readonly generations: number;
  readonly evolution?: EvolutionConfig;
  readonly episode?: Partial<EpisodeOptions>;
  readonly skeleton?: SkeletonSettings;
  readonly weights?: FitnessWeights;
  readonly gains?: ControllerGains;
  /** true にすると選択・交叉・突然変異を行わず、初期Populationを毎世代再評価する対照群になる。 */
  readonly disableEvolution?: boolean;
}
export interface EvolutionRunResult {
  readonly seed: number;
  readonly graphHash: string;
  readonly generations: readonly GenerationStats[];
  readonly bestEver: { readonly genome: Genome; readonly fitness: number; readonly generation: number; readonly terms: FitnessTerms };
  readonly runRecord: RunRecord;
}
export function runEvolution(options: EvolutionRunOptions): EvolutionRunResult;
export function replayGenome(
  options: Omit<EvolutionRunOptions, "generations" | "disableEvolution"> & { genome: Genome }
): { readonly result: EpisodeResult; readonly fitness: FitnessBreakdown };
```

1世代の流れ: Genome列 → `genomeToCommandSource` → 1 Worldに Population 個体を生成 → `PopulationRunner.run()` → `evaluateFitness` → 統計 → cleanup → `nextGeneration`。Worldは全世代で1つを再利用する。

試験（小規模・高速。本実験はTask 7）:
- 同一Seed・同一設定の2回のRunが**完全一致**する。
- `disableEvolution: true` の対照群でも規定世代数を完走する。
- 10世代のRunで `generations` の長さが10、各世代の `populationSize` ぶんのfitnessが集計される。
- best-ever が全世代の最大fitnessと一致し、その世代番号を持つ。
- `replayGenome` の fitness が元の評価値と 1e-6 以内で一致する。
- `runRecord` に seed / graphHash / summary が入る。
- invalidを誘発する設定（`maxDisplacement` を極小）でもRunが完走し、`invalidCount > 0` が記録される。

- [ ] Red → Green → commit

---

### Task 7: 本実験（5 Seed × 50世代）

**Files:** `bench/evolution-experiment.ts`。`package.json` に `"experiment": "node bench/evolution-experiment.ts"`

5 Seed（`[1, 2, 3, 5, 8]`）× 50世代 × Population 32 を、進化群と対照群の両方で実行し、次を出力する:

- Seedごとの generation 0 best と generation 49 best（normalized forward progress と fitness）
- 改善したSeed数
- 進化群 best の中央値 vs 対照群 best の中央値
- 各Seedのbest Genome
- 合否判定（4 Seed以上の改善、かつ進化群中央値 > 対照群中央値）

- [ ] Step 1: 実験を書く
- [ ] Step 2: 実行して結果を保存
- [ ] Step 3: commit

---

### Task 8: M3検証記録

**Files:** `docs/16-m3-evolution-validation.md`、`docs/README.md`、`docs/09-...md`（R-07/R-08更新）

docs/13 §8 の9項目。Seed別の統計、best Genome、対照群比較、判断ゲート（世代変化を人が理解できるか＝**人の確認が必要**）を記録する。

- [ ] Step 1: `npm run verify` と `npm run experiment` の結果を記録 → commit

## Self-Review

- **Spec coverage:** docs/12 §7 の受入条件8項目すべてにタスクを割り当て済み。非ゴール（形態進化、強化学習、Fitness hackの除外）はタスクに含めていない。
- **Placeholder scan:** 各タスクに完全な型定義と検証内容を記載。閾値は測定前に数値で固定した。
- **Type consistency:** `EpisodeResult` / `EpisodeOptions` / `SkeletonSettings` / `RunRecord` / `CreatureGraph` はM1・M2で定義済みの名前を使う。`RandomSource` はTask 1、`Genome`/`GenomeBounds`/`ControllerGains` はTask 2、`FitnessTerms`/`FitnessWeights` はTask 3、`ScoredGenome`/`MutationConfig` はTask 4 で定義し、以降のタスクが消費する。
