import { runEvolution, type BestEver, type EvolutionRunResult } from "../src/app/evolution-run.ts";
import type { CreatureGraph } from "../src/domain/creature/creature-graph.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "../src/domain/evolution/evolution-engine.ts";
import { genomeToCommandSource } from "../src/domain/evolution/genome.ts";
import {
  buildGraphFromStroke,
  type StrokePreview
} from "../src/domain/stroke/stroke-graph-builder.ts";
import type { StrokePoint } from "../src/domain/stroke/stroke-point.ts";
import { StrokeRecorder } from "../src/domain/stroke/stroke-recorder.ts";
import {
  bindPointerStroke,
  keyToStrokeCommand
} from "../src/game/input/pointer-stroke-source.ts";
import { createCreature } from "../src/simulation/box2d/box2d-creature-factory.ts";
import { createPhysicsWorld, type PhysicsWorld } from "../src/simulation/box2d/box2d-world.ts";
import { DEFAULT_EPISODE_OPTIONS } from "../src/simulation/episode-tracker.ts";
import { FixedStepRunner } from "../src/simulation/fixed-step-runner.ts";
import { planLanes } from "../src/simulation/lane-allocator.ts";
import { PopulationRunner } from "../src/simulation/population-runner.ts";
import type { CreatureSnapshot } from "../src/simulation/ports/creature-port.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth,
  type SkeletonPlan
} from "../src/simulation/skeleton-plan.ts";
import { validateCreatureGraph } from "../src/domain/creature/creature-graph-validation.ts";

const DRAW_WIDTH = 640;
const DRAW_HEIGHT = 420;
const WORLD_SHORT_SIDE = 6;
const REPLAY_ROW_HEIGHT = 180;
const REPLAY_PIXELS_PER_METER = 42;

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

interface ReplayLane {
  readonly label: string;
  readonly color: string;
  startX: number;
  snapshot: CreatureSnapshot | null;
}

class StrokeInputPage {
  readonly #drawCanvas = element<HTMLCanvasElement>("draw");
  readonly #drawContext: CanvasRenderingContext2D;
  readonly #replayCanvas = element<HTMLCanvasElement>("replay");
  readonly #replayContext: CanvasRenderingContext2D;
  readonly #recorder = new StrokeRecorder({
    bounds: { width: DRAW_WIDTH, height: DRAW_HEIGHT },
    minPointDistance: 3
  });
  readonly #stepRunner = new FixedStepRunner({
    stepSeconds: DEFAULT_EPISODE_OPTIONS.stepSeconds,
    maxStepsPerFrame: 120
  });

  #rawPoints: readonly StrokePoint[] = [];
  #graph: CreatureGraph | null = null;
  #preview: StrokePreview | null = null;
  #plan: SkeletonPlan | null = null;
  #run: EvolutionRunResult | null = null;
  #world: PhysicsWorld | null = null;
  #runner: PopulationRunner | null = null;
  #lanes: ReplayLane[] = [];
  #playing = false;
  #lastStamp = 0;

  constructor() {
    const drawContext = this.#drawCanvas.getContext("2d");
    const replayContext = this.#replayCanvas.getContext("2d");
    if (!drawContext || !replayContext) {
      throw new Error("2d canvas context is unavailable");
    }
    this.#drawContext = drawContext;
    this.#replayContext = replayContext;
    this.#replayCanvas.height = REPLAY_ROW_HEIGHT * 2;

    bindPointerStroke(this.#drawCanvas, this.#recorder, {
      onChange: (points) => {
        this.#rawPoints = points;
        this.#graph = null;
        this.#preview = null;
        this.#drawScene();
      },
      onFinish: (points) => {
        this.#rawPoints = points;
        this.#convert();
      },
      onCancel: () => this.clear()
    });

    window.addEventListener("keydown", (event) => {
      const command = keyToStrokeCommand(event);
      if (command === null) {
        return;
      }
      event.preventDefault();
      if (command === "undo" || command === "clear" || command === "cancel") {
        this.clear();
      } else if (command === "confirm") {
        void this.learn();
      }
    });

    element<HTMLButtonElement>("clear").addEventListener("click", () => this.clear());
    element<HTMLButtonElement>("learn").addEventListener("click", () => void this.learn());
    element<HTMLButtonElement>("play").addEventListener("click", () => {
      this.prepareReplay();
      this.play();
    });
    element<HTMLButtonElement>("pause").addEventListener("click", () => this.pause());
    element<HTMLInputElement>("generation").addEventListener("input", () =>
      this.prepareReplay()
    );

    this.clear();
  }

  clear(): void {
    this.#recorder.reset();
    this.#rawPoints = [];
    this.#graph = null;
    this.#preview = null;
    this.#plan = null;
    this.#playing = false;
    this.#world?.destroy();
    this.#world = null;
    this.#runner = null;
    this.#lanes = [];
    element("errors").textContent = "";
    element("shape").textContent = "-";
    element<HTMLButtonElement>("learn").disabled = true;
    element("status").textContent =
      "キャンバスの上でドラッグして一筆で描いてください。Backspaceで消去、Enterで学習。";
    this.#drawScene();
    this.#renderReplay();
  }

  #convert(): void {
    const result = buildGraphFromStroke(this.#rawPoints, {
      viewport: { width: DRAW_WIDTH, height: DRAW_HEIGHT },
      worldShortSide: WORLD_SHORT_SIDE
    });

    if (!result.ok) {
      this.#graph = null;
      this.#preview = null;
      this.#plan = null;
      element<HTMLButtonElement>("learn").disabled = true;
      element("errors").textContent = result.errors
        .map((error) => `・${error.message}`)
        .join("\n");
      element("shape").textContent = "-";
      element("status").textContent = "この形では学習できません。理由を読んで描き直してください。";
      this.#drawScene();
      return;
    }

    const validated = validateCreatureGraph(result.graph);
    this.#graph = result.graph;
    this.#preview = result.preview;
    this.#plan = validated.ok ? buildSkeletonPlan(validated.graph) : null;
    element("errors").textContent = "";
    element<HTMLButtonElement>("learn").disabled = false;
    element("shape").textContent =
      `Node ${result.preview.nodes.length} / Edge ${result.preview.edges.length}` +
      (this.#plan
        ? ` → Body ${this.#plan.bones.length} / Joint ${this.#plan.joints.length}`
        : "");
    element("status").textContent = "この形で学習できます。「この形で学習する」を押してください。";
    this.#drawScene();
  }

  async learn(): Promise<void> {
    const graph = this.#graph;
    if (!graph) {
      return;
    }
    element("status").textContent = "学習中… この間は画面が止まります";
    await new Promise((resolve) => setTimeout(resolve, 30));

    const started = performance.now();
    this.#run = runEvolution({
      graph,
      seed: numberValue("seed"),
      generations: numberValue("generations"),
      evolution: {
        ...DEFAULT_EVOLUTION_CONFIG,
        populationSize: numberValue("population")
      },
      episode: { durationSeconds: 6 },
      createdAt: new Date().toISOString()
    });
    const wallSeconds = (performance.now() - started) / 1000;

    const slider = element<HTMLInputElement>("generation");
    slider.max = String(this.#run.generations.length - 1);
    slider.value = String(this.#run.bestEver.generation);

    element("status").textContent =
      `学習完了 ${wallSeconds.toFixed(1)} 秒 / ${this.#run.generations.length} 世代`;
    element("gen0").textContent =
      `${this.#run.generations[0]!.bestNormalizedForwardProgress.toFixed(2)} 体長`;
    element("best").textContent =
      `${this.#run.bestEver.terms.normalizedForwardProgress.toFixed(2)} 体長 (世代 ${this.#run.bestEver.generation})`;
    element("hash").textContent = this.#run.graphHash;
    this.prepareReplay();
  }

  prepareReplay(): void {
    const run = this.#run;
    const plan = this.#plan;
    if (!run || !plan) {
      return;
    }
    this.#world?.destroy();
    this.#stepRunner.reset();
    this.#playing = false;

    const generation = Math.min(
      run.bestPerGeneration.length - 1,
      Math.max(0, numberValue("generation"))
    );
    const chosen: readonly BestEver[] = [
      run.bestPerGeneration[0]!,
      run.bestPerGeneration[generation]!
    ];

    const world = createPhysicsWorld();
    const clearance = computeSpawnOffset(plan, 0.1);
    const lanePlan = planLanes(chosen.length, skeletonWidth(plan));
    const creatures = lanePlan.map((lane) =>
      createCreature(world, plan, {
        origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
        groupIndex: lane.groupIndex
      })
    );

    this.#lanes = [
      { label: "世代 0 のベスト", color: "#7f9ab0", startX: creatures[0]!.centerOfMass().x, snapshot: null },
      {
        label: `世代 ${generation} のベスト`,
        color: "#ffd166",
        startX: creatures[1]!.centerOfMass().x,
        snapshot: null
      }
    ];
    this.#runner = new PopulationRunner({
      world,
      creatures,
      members: chosen.map((best) => ({ commands: genomeToCommandSource(best.genome) })),
      options: { durationSeconds: 6 }
    });
    this.#world = world;
    this.#refreshReplay();
  }

  play(): void {
    if (!this.#runner) {
      return;
    }
    this.#playing = true;
    this.#lastStamp = performance.now();
    requestAnimationFrame((stamp) => this.#frame(stamp));
  }

  pause(): void {
    this.#playing = false;
  }

  #frame(stamp: number): void {
    if (!this.#playing || !this.#runner) {
      return;
    }
    const elapsed = Math.min((stamp - this.#lastStamp) / 1000, 0.25);
    this.#lastStamp = stamp;
    const runner = this.#runner;
    let finished = false;
    this.#stepRunner.advance(elapsed, () => {
      if (!runner.step()) {
        finished = true;
      }
    });
    this.#refreshReplay();
    if (finished) {
      this.#playing = false;
      element("status").textContent = "再生終了。「最初から再生」でもう一度見られます。";
      return;
    }
    requestAnimationFrame((next) => this.#frame(next));
  }

  #refreshReplay(): void {
    const runner = this.#runner;
    if (!runner) {
      return;
    }
    const snapshots = runner.snapshots([0, 1]);
    for (const [index, lane] of this.#lanes.entries()) {
      lane.snapshot = snapshots[index]!;
    }
    this.#renderReplay();
  }

  #drawScene(): void {
    const context = this.#drawContext;
    context.fillStyle = "#07131f";
    context.fillRect(0, 0, DRAW_WIDTH, DRAW_HEIGHT);

    context.strokeStyle = "#132a3c";
    context.lineWidth = 1;
    for (let x = 0; x <= DRAW_WIDTH; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, DRAW_HEIGHT);
      context.stroke();
    }
    for (let y = 0; y <= DRAW_HEIGHT; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(DRAW_WIDTH, y);
      context.stroke();
    }

    if (this.#rawPoints.length > 1) {
      context.strokeStyle = this.#graph ? "#2f5d7f" : "#e76f51";
      context.lineWidth = 2;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(this.#rawPoints[0]!.x, this.#rawPoints[0]!.y);
      for (const point of this.#rawPoints.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    }

    const preview = this.#preview;
    if (!preview) {
      return;
    }
    const scale = Math.min(DRAW_WIDTH, DRAW_HEIGHT) / WORLD_SHORT_SIDE;
    const toScreen = (point: { x: number; y: number }) => ({
      x: DRAW_WIDTH / 2 + point.x * scale,
      y: DRAW_HEIGHT / 2 - point.y * scale
    });

    context.strokeStyle = "#ffd166";
    context.lineWidth = 6;
    for (const edge of preview.edges) {
      const a = toScreen(edge.a);
      const b = toScreen(edge.b);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const node of preview.nodes) {
      const point = toScreen(node.position);
      context.fillStyle = "#f5f9ff";
      context.beginPath();
      context.arc(point.x, point.y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  #renderReplay(): void {
    const context = this.#replayContext;
    const width = this.#replayCanvas.width;
    context.fillStyle = "#07131f";
    context.fillRect(0, 0, width, this.#replayCanvas.height);

    for (const [index, lane] of this.#lanes.entries()) {
      const top = index * REPLAY_ROW_HEIGHT;
      const groundY = top + REPLAY_ROW_HEIGHT - 36;

      context.fillStyle = "#0b1a27";
      context.fillRect(0, top, width, REPLAY_ROW_HEIGHT - 2);
      context.strokeStyle = "#1d3a52";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, groundY);
      context.lineTo(width, groundY);
      context.stroke();
      context.strokeStyle = "#2f5d7f";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(80, top + 14);
      context.lineTo(80, groundY);
      context.stroke();

      context.fillStyle = lane.color;
      context.font = "13px system-ui, sans-serif";
      context.fillText(lane.label, 12, top + 20);

      const snapshot = lane.snapshot;
      if (!snapshot) {
        continue;
      }
      context.fillText(
        `${(snapshot.centerOfMass.x - lane.startX).toFixed(2)} m`,
        width - 80,
        top + 20
      );
      context.strokeStyle = lane.color;
      context.lineCap = "round";
      for (const bone of snapshot.bones) {
        const half = bone.length / 2;
        const dx = Math.cos(bone.angle) * half * REPLAY_PIXELS_PER_METER;
        const dy = Math.sin(bone.angle) * half * REPLAY_PIXELS_PER_METER;
        const x = 80 + (bone.x - lane.startX) * REPLAY_PIXELS_PER_METER;
        const y = groundY - bone.y * REPLAY_PIXELS_PER_METER;
        context.lineWidth = bone.radius * 2 * REPLAY_PIXELS_PER_METER;
        context.beginPath();
        context.moveTo(x - dx, y + dy);
        context.lineTo(x + dx, y - dy);
        context.stroke();
      }
    }
  }
}

new StrokeInputPage();
