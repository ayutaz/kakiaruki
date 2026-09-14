/**
 * M7 長時間run。描く → 学習 → 観察 → 片付け、を指定時間くり返す。
 *
 *   node bench/soak.ts [分数]   既定30分
 *
 * 判定条件（測定開始前に固定）:
 *   1. 未処理例外が0件
 *   2. 統計値がすべて有限
 *   3. 片付け後にWorldのshape数が基準（地面だけ=1）へ戻る
 *   4. heapが単調増加しない（後半の使用量が前半比1.5倍以内）
 */
import { EvolutionRunner } from "../src/app/evolution-run.ts";
import { ObservationSession } from "../src/app/observation-session.ts";
import { buildGraphFromStroke } from "../src/domain/stroke/stroke-graph-builder.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../src/domain/evolution/evolution-engine.ts";
import type { StrokePoint } from "../src/domain/stroke/stroke-point.ts";

const VIEWPORT = { width: 960, height: 520 };
const POPULATION = 32;
const GENERATIONS = 20;
const EPISODE_SECONDS = 6;
const HEAP_GROWTH_LIMIT = 1.5;

const minutes = Number(process.argv[2] ?? 30);
if (!Number.isFinite(minutes) || minutes <= 0) {
  throw new RangeError("minutes must be finite and greater than zero");
}

/** 折れ線を等間隔にサンプリングして、生のPointer点列にする。 */
function sample(path: readonly (readonly [number, number])[], stepPx: number): StrokePoint[] {
  const points: StrokePoint[] = [];
  let time = 0;
  const push = (x: number, y: number): void => {
    points.push({ x, y, time });
    time += 8;
  };
  push(path[0]![0], path[0]![1]);
  for (let index = 1; index < path.length; index += 1) {
    const [ax, ay] = path[index - 1]!;
    const [bx, by] = path[index]!;
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / stepPx));
    for (let step = 1; step <= steps; step += 1) {
      push(ax + ((bx - ax) * step) / steps, ay + ((by - ay) * step) / steps);
    }
  }
  return points;
}

/** 周回ごとに違う形を描く。 */
const SHAPES: readonly (readonly (readonly [number, number])[])[] = [
  [[200, 400], [760, 400]],
  [[200, 440], [480, 120], [760, 440]],
  [[160, 420], [320, 140], [480, 420], [640, 140], [800, 380]],
  [[480, 460], [480, 140], [480, 250], [280, 170], [480, 250], [680, 170]],
  [[120, 430], [260, 110], [400, 430], [540, 110], [680, 430], [860, 180]]
];

function finite(...values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

const session = new ObservationSession();
const startedAt = Date.now();
const deadline = startedAt + minutes * 60_000;
const heapSamples: { readonly elapsedMinutes: number; readonly heapMb: number }[] = [];

let cycles = 0;
let generationsRun = 0;
let failures = 0;
let shapeAfterCleanup = -1;

console.log(
  `soak: ${minutes} 分 / Population ${POPULATION} / ${GENERATIONS}世代 / episode ${EPISODE_SECONDS}秒`
);

try {
  while (Date.now() < deadline) {
    const shape = SHAPES[cycles % SHAPES.length]!;
    const built = buildGraphFromStroke(sample(shape, 5), {
      viewport: VIEWPORT,
      worldShortSide: 6
    });
    if (!built.ok) {
      failures += 1;
      console.log(`  周回 ${cycles}: 変換に失敗 ${built.errors.map((e) => e.code).join(",")}`);
      cycles += 1;
      continue;
    }

    const runner = new EvolutionRunner({
      graph: built.graph,
      seed: (cycles % 7) + 1,
      generations: GENERATIONS,
      evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize: POPULATION },
      episode: { durationSeconds: EPISODE_SECONDS },
      createdAt: new Date().toISOString(),
      world: session.physicsWorld
    });
    while (runner.advance()) {
      generationsRun += 1;
    }
    generationsRun += 1;
    const run = runner.result();
    if (!run) {
      failures += 1;
      console.log(`  周回 ${cycles}: 結果を取り出せない`);
      cycles += 1;
      continue;
    }

    for (const stats of run.generations) {
      if (
        !finite(
          stats.bestFitness,
          stats.medianFitness,
          stats.meanFitness,
          stats.bestNormalizedForwardProgress
        )
      ) {
        failures += 1;
        console.log(`  周回 ${cycles}: 世代 ${stats.generation} に有限でない値`);
      }
    }

    // 観察フェーズ
    const picks = [0, Math.floor(GENERATIONS / 2), GENERATIONS - 1];
    session.start(
      built.graph,
      picks.map((generation) => run.bestPerGeneration[generation]!.genome),
      { episodeSeconds: EPISODE_SECONDS }
    );
    while (!session.finished) {
      session.advance(1 / 60, 4);
    }
    for (const snapshot of session.snapshots(picks.length)) {
      if (!finite(snapshot.centerOfMass.x, snapshot.centerOfMass.y)) {
        failures += 1;
        console.log(`  周回 ${cycles}: 観察中に有限でない重心`);
      }
    }
    session.stop();
    shapeAfterCleanup = session.shapeCount();
    if (shapeAfterCleanup !== 1) {
      failures += 1;
      console.log(`  周回 ${cycles}: 片付け後の shape が ${shapeAfterCleanup}`);
    }

    cycles += 1;
    const elapsedMinutes = (Date.now() - startedAt) / 60_000;
    const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
    heapSamples.push({ elapsedMinutes, heapMb });
    if (cycles % 5 === 0) {
      console.log(
        `  ${elapsedMinutes.toFixed(1)} 分 / ${cycles} 周 / ${generationsRun} 世代 / heap ${heapMb.toFixed(1)} MB / shape ${shapeAfterCleanup}`
      );
    }
  }
} finally {
  session.dispose();
}

const half = Math.floor(heapSamples.length / 2);
const average = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
const firstHalf = average(heapSamples.slice(0, half).map((sample) => sample.heapMb));
const secondHalf = average(heapSamples.slice(half).map((sample) => sample.heapMb));
const growth = firstHalf === 0 ? 1 : secondHalf / firstHalf;

const elapsed = (Date.now() - startedAt) / 60_000;
console.log("");
console.log(`経過 ${elapsed.toFixed(1)} 分 / ${cycles} 周 / ${generationsRun} 世代`);
console.log(`heap 前半平均 ${firstHalf.toFixed(1)} MB → 後半平均 ${secondHalf.toFixed(1)} MB（${growth.toFixed(2)}倍）`);
console.log(`片付け後の shape: ${shapeAfterCleanup}（地面だけなら1）`);
console.log("");
console.log(`条件1 未処理例外が0件: ${failures === 0 ? "PASS" : `FAIL (${failures} 件)`}`);
console.log(`条件2 統計値がすべて有限: ${failures === 0 ? "PASS" : "FAIL"}`);
console.log(`条件3 shape数が基準へ戻る: ${shapeAfterCleanup === 1 ? "PASS" : "FAIL"}`);
console.log(
  `条件4 heapが単調増加しない（${HEAP_GROWTH_LIMIT}倍以内）: ${growth <= HEAP_GROWTH_LIMIT ? "PASS" : `FAIL (${growth.toFixed(2)}倍)`}`
);
console.log(
  `overall: ${failures === 0 && shapeAfterCleanup === 1 && growth <= HEAP_GROWTH_LIMIT ? "PASS" : "FAIL"}`
);
console.log(
  `json: ${JSON.stringify({
    minutes: elapsed,
    cycles,
    generations: generationsRun,
    failures,
    shapeAfterCleanup,
    heapFirstHalfMb: firstHalf,
    heapSecondHalfMb: secondHalf,
    heapGrowth: growth,
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`
    }
  })}`
);
