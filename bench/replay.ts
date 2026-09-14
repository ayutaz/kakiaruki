import { runEvolution, type BestEver, type EvolutionRunResult } from "../src/app/evolution-run.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../src/domain/evolution/evolution-engine.ts";
import type { CreatureGraph } from "../src/domain/creature/creature-graph.ts";
import { validateCreatureGraph } from "../src/domain/creature/creature-graph-validation.ts";
import { genomeToCommandSource } from "../src/domain/evolution/genome.ts";
import { createCreature } from "../src/simulation/box2d/box2d-creature-factory.ts";
import { createPhysicsWorld, type PhysicsWorld } from "../src/simulation/box2d/box2d-world.ts";
import { DEFAULT_EPISODE_OPTIONS } from "../src/simulation/episode-tracker.ts";
import { FixedStepRunner } from "../src/simulation/fixed-step-runner.ts";
import { planLanes } from "../src/simulation/lane-allocator.ts";
import { PopulationRunner } from "../src/simulation/population-runner.ts";
import type {
  CreatureHandle,
  CreatureSnapshot
} from "../src/simulation/ports/creature-port.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth,
  type SkeletonPlan
} from "../src/simulation/skeleton-plan.ts";

const RADIUS = 0.11;
const PIXELS_PER_METER = 46;
const ROW_HEIGHT = 190;

const zigzag6: CreatureGraph = {
  rootNodeId: "n0",
  nodes: (
    [
      [0, 0],
      [0.6, 0.5],
      [1.2, 0],
      [1.8, 0.5],
      [2.4, 0],
      [3, 0.5],
      [3.6, 0]
    ] as const
  ).map(([x, y], index) => ({ id: `n${index}`, position: { x, y } })),
  edges: Array.from({ length: 6 }, (_unused, index) => ({
    id: `e${index}`,
    nodeA: `n${index}`,
    nodeB: `n${index + 1}`,
    radius: RADIUS
  }))
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`missing element #${id}`);
  }
  return found as T;
}

function numberValue(id: string): number {
  return Number(element<HTMLSelectElement | HTMLInputElement>(id).value);
}

interface Lane {
  readonly label: string;
  readonly color: string;
  readonly best: BestEver;
  readonly originX: number;
  startX: number;
  currentX: number;
  snapshot: CreatureSnapshot | null;
}

class ReplayViewer {
  readonly #canvas = element<HTMLCanvasElement>("view");
  readonly #context: CanvasRenderingContext2D;
  readonly #stepRunner = new FixedStepRunner({
    stepSeconds: DEFAULT_EPISODE_OPTIONS.stepSeconds,
    maxStepsPerFrame: 120
  });
  #plan: SkeletonPlan | null = null;
  #run: EvolutionRunResult | null = null;
  #world: PhysicsWorld | null = null;
  #runner: PopulationRunner | null = null;
  #creatures: readonly CreatureHandle[] = [];
  #lanes: Lane[] = [];
  #playing = false;
  #lastStamp = 0;
  #frameHandle: number | null = null;

  constructor() {
    const context = this.#canvas.getContext("2d");
    if (!context) {
      throw new Error("2d canvas context is unavailable");
    }
    this.#context = context;
    this.#canvas.height = ROW_HEIGHT * 2;
  }

  /**
   * Worldは作り直さず1つを使い回す（D-006）。
   * phaser-box2d 1.1.0 の `b2DestroyWorld` は world slot を解放しないため、
   * 作り直す実装ではページを開いたまま32回で確保に失敗する。
   */
  #physicsWorld(): PhysicsWorld {
    const world = this.#world ?? createPhysicsWorld();
    this.#world = world;
    return world;
  }

  /** リプレイ個体だけを破棄する。Worldと地面はそのまま残す。 */
  #releaseCreatures(): void {
    this.#playing = false;
    if (this.#frameHandle !== null) {
      cancelAnimationFrame(this.#frameHandle);
      this.#frameHandle = null;
    }
    for (const creature of this.#creatures) {
      creature.destroy();
    }
    this.#creatures = [];
    this.#runner = null;
  }

  async learn(): Promise<void> {
    const validated = validateCreatureGraph(zigzag6);
    if (!validated.ok) {
      throw new Error("fixture is invalid");
    }
    this.#plan = buildSkeletonPlan(validated.graph);

    element("status").textContent = "学習中… この間は画面が止まります";
    await new Promise((resolve) => setTimeout(resolve, 30));

    // 前回のリプレイ個体を残したまま学習すると、同じWorldへ余分なBodyが積み上がる。
    this.#releaseCreatures();

    const started = performance.now();
    this.#run = runEvolution({
      graph: zigzag6,
      seed: numberValue("seed"),
      generations: numberValue("generations"),
      evolution: {
        ...DEFAULT_EVOLUTION_CONFIG,
        populationSize: numberValue("population")
      },
      episode: { durationSeconds: numberValue("episode") },
      createdAt: new Date().toISOString(),
      world: this.#physicsWorld()
    });
    const wallSeconds = (performance.now() - started) / 1000;

    const slider = element<HTMLInputElement>("generation");
    slider.max = String(this.#run.generations.length - 1);
    slider.value = String(this.#run.bestEver.generation);

    element("status").textContent =
      `学習完了 ${wallSeconds.toFixed(1)} 秒 / ${this.#run.generations.length} 世代。` +
      "そのまま再生します。スライダーで比べる世代を変えられます。";
    this.#reportStats();
    this.prepare();
    // 学習した結果は、押さなくても動いて見えるようにする。
    this.play();
  }

  prepare(): void {
    const run = this.#run;
    const plan = this.#plan;
    if (!run || !plan) {
      return;
    }
    this.#releaseCreatures();
    this.#stepRunner.reset();

    const comparedGeneration = Math.min(
      run.bestPerGeneration.length - 1,
      Math.max(0, numberValue("generation"))
    );
    const selected: readonly Lane[] = [
      {
        label: `世代 0 のベスト`,
        color: "#7f9ab0",
        best: run.bestPerGeneration[0]!,
        originX: 0,
        startX: 0,
        currentX: 0,
        snapshot: null
      },
      {
        label: `世代 ${comparedGeneration} のベスト`,
        color: "#ffd166",
        best: run.bestPerGeneration[comparedGeneration]!,
        originX: 0,
        startX: 0,
        currentX: 0,
        snapshot: null
      }
    ];

    const world = this.#physicsWorld();
    const clearance = computeSpawnOffset(plan, 0.1);
    const lanePlan = planLanes(selected.length, skeletonWidth(plan));
    const creatures = lanePlan.map((lane) =>
      createCreature(world, plan, {
        origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
        groupIndex: lane.groupIndex
      })
    );

    this.#lanes = selected.map((lane, index) => ({
      ...lane,
      originX: lanePlan[index]!.origin.x,
      startX: creatures[index]!.centerOfMass().x,
      currentX: creatures[index]!.centerOfMass().x
    }));

    this.#creatures = creatures;
    this.#runner = new PopulationRunner({
      world,
      creatures,
      members: selected.map((lane) => ({
        commands: genomeToCommandSource(lane.best.genome)
      })),
      options: { durationSeconds: numberValue("episode") }
    });
    this.#refreshSnapshots();
    this.#render();
  }

  play(): void {
    if (!this.#runner) {
      return;
    }
    this.#playing = true;
    this.#lastStamp = performance.now();
    this.#scheduleFrame();
  }

  pause(): void {
    this.#playing = false;
    if (this.#frameHandle !== null) {
      cancelAnimationFrame(this.#frameHandle);
      this.#frameHandle = null;
    }
  }

  /** 再生要求が重なっても進行は1本に保つ。2本走ると時間が倍速になる。 */
  #scheduleFrame(): void {
    if (this.#frameHandle !== null) {
      cancelAnimationFrame(this.#frameHandle);
    }
    this.#frameHandle = requestAnimationFrame((stamp) => {
      this.#frameHandle = null;
      this.#frame(stamp);
    });
  }

  #frame(stamp: number): void {
    if (!this.#playing || !this.#runner) {
      return;
    }
    const elapsed = Math.min((stamp - this.#lastStamp) / 1000, 0.25);
    this.#lastStamp = stamp;
    const runner = this.#runner;
    let finished = false;

    this.#stepRunner.advance(elapsed * numberValue("speed"), () => {
      if (!runner.step()) {
        finished = true;
      }
    });

    this.#refreshSnapshots();
    this.#render();

    if (finished) {
      this.#playing = false;
      element("status").textContent = "再生終了。もう一度見るには「最初から再生」を押してください。";
      return;
    }
    this.#scheduleFrame();
  }

  #refreshSnapshots(): void {
    const runner = this.#runner;
    if (!runner) {
      return;
    }
    const snapshots = runner.snapshots(this.#lanes.map((_unused, index) => index));
    for (const [index, lane] of this.#lanes.entries()) {
      lane.snapshot = snapshots[index]!;
      lane.currentX = snapshots[index]!.centerOfMass.x;
    }
    this.#reportDistances();
  }

  #reportDistances(): void {
    const width = this.#run?.skeletonWidth ?? 1;
    const [first, second] = this.#lanes;
    if (first) {
      element("distance-0").textContent =
        `${((first.currentX - first.startX) / width).toFixed(2)} 体長`;
    }
    if (second) {
      element("distance-1").textContent =
        `${((second.currentX - second.startX) / width).toFixed(2)} 体長`;
    }
  }

  #reportStats(): void {
    const run = this.#run;
    if (!run) {
      return;
    }
    const first = run.generations[0]!;
    const last = run.generations.at(-1)!;
    element("gen0-distance").textContent =
      `${first.bestNormalizedForwardProgress.toFixed(2)} 体長`;
    element("final-distance").textContent =
      `${last.bestNormalizedForwardProgress.toFixed(2)} 体長`;
    element("best-distance").textContent =
      `${run.bestEver.terms.normalizedForwardProgress.toFixed(2)} 体長 (世代 ${run.bestEver.generation})`;
    element("graph-hash").textContent = run.graphHash;

    const rows = run.generations
      .map(
        (stats) =>
          `${String(stats.generation).padStart(3)} | ${stats.bestFitness.toFixed(3).padStart(8)} | ` +
          `${stats.medianFitness.toFixed(3).padStart(8)} | ${stats.bestNormalizedForwardProgress.toFixed(3).padStart(7)} | ${String(stats.invalidCount).padStart(3)}`
      )
      .join("\n");
    element("table").textContent =
      `gen |     best |   median |    dist | inv\n----|----------|----------|---------|----\n${rows}`;
  }

  #render(): void {
    const context = this.#context;
    const width = this.#canvas.width;
    context.fillStyle = "#07131f";
    context.fillRect(0, 0, width, this.#canvas.height);

    for (const [index, lane] of this.#lanes.entries()) {
      const top = index * ROW_HEIGHT;
      const groundY = top + ROW_HEIGHT - 42;
      const cameraX = lane.startX;

      context.fillStyle = "#0b1a27";
      context.fillRect(0, top, width, ROW_HEIGHT - 2);

      // 1mごとの目盛りと開始線。
      context.strokeStyle = "#16293a";
      context.lineWidth = 1;
      for (let meter = 0; meter <= 20; meter += 1) {
        const x = 90 + (meter - 0) * PIXELS_PER_METER;
        if (x > width) {
          break;
        }
        context.beginPath();
        context.moveTo(x, groundY - 8);
        context.lineTo(x, groundY);
        context.stroke();
      }
      context.strokeStyle = "#2f5d7f";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(90, top + 16);
      context.lineTo(90, groundY);
      context.stroke();

      context.strokeStyle = "#1d3a52";
      context.beginPath();
      context.moveTo(0, groundY);
      context.lineTo(width, groundY);
      context.stroke();

      context.fillStyle = lane.color;
      context.font = "13px system-ui, sans-serif";
      context.fillText(lane.label, 12, top + 22);

      const snapshot = lane.snapshot;
      if (!snapshot) {
        continue;
      }
      context.strokeStyle = lane.color;
      context.lineCap = "round";
      for (const bone of snapshot.bones) {
        const half = bone.length / 2;
        const dx = Math.cos(bone.angle) * half * PIXELS_PER_METER;
        const dy = Math.sin(bone.angle) * half * PIXELS_PER_METER;
        const x = 90 + (bone.x - cameraX) * PIXELS_PER_METER;
        const y = groundY - bone.y * PIXELS_PER_METER;
        context.lineWidth = bone.radius * 2 * PIXELS_PER_METER;
        context.beginPath();
        context.moveTo(x - dx, y + dy);
        context.lineTo(x + dx, y - dy);
        context.stroke();
      }
    }
  }
}

const viewer = new ReplayViewer();

element<HTMLButtonElement>("learn").addEventListener("click", () => {
  void viewer.learn();
});
element<HTMLButtonElement>("play").addEventListener("click", () => {
  viewer.prepare();
  viewer.play();
});
element<HTMLButtonElement>("pause").addEventListener("click", () => viewer.pause());
element<HTMLInputElement>("generation").addEventListener("input", () => {
  viewer.prepare();
  viewer.play();
});
