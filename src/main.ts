import { runEvolution, type BestEver, type EvolutionRunResult } from "./app/evolution-run.ts";
import { ObservationSession } from "./app/observation-session.ts";
import { validateCreatureGraph } from "./domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "./domain/creature/creature-graph.ts";
import { removeLastEdge } from "./domain/creature/graph-edit.ts";
import { DEFAULT_EVOLUTION_CONFIG } from "./domain/evolution/evolution-engine.ts";
import {
  buildGraphFromStroke,
  DEFAULT_STROKE_GRAPH_OPTIONS,
  type StrokePreview
} from "./domain/stroke/stroke-graph-builder.ts";
import type { StrokePoint } from "./domain/stroke/stroke-point.ts";
import { StrokeRecorder } from "./domain/stroke/stroke-recorder.ts";
import {
  drawObservationScene,
  drawStrokeScene,
  type ObservationLane
} from "./game/rendering/scene-renderer.ts";
import { bindPointerStroke, keyToStrokeCommand } from "./game/input/pointer-stroke-source.ts";
import { buildSkeletonPlan, type SkeletonPlan } from "./simulation/skeleton-plan.ts";
import {
  initialAppState,
  reduce,
  type AppEvent,
  type AppState
} from "./ui/app-state.ts";
import "./style.css";

const WORLD_SHORT_SIDE = DEFAULT_STROKE_GRAPH_OPTIONS.worldShortSide;
const EPISODE_SECONDS = 6;
const PIXELS_PER_METER = 44;
/** 世代が進むほど明るくする。古い世代は沈んだ青。 */
const LANE_COLORS = [
  "#4f6a80",
  "#5f88a6",
  "#6fa6c7",
  "#8ec4d8",
  "#b6d9d0",
  "#ddd9a8",
  "#ffd166",
  "#ffb703"
];

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

class Screen {
  readonly #canvas = element<HTMLCanvasElement>("stage");
  readonly #context: CanvasRenderingContext2D;
  readonly #recorder = new StrokeRecorder({
    bounds: { width: 960, height: 520 },
    minPointDistance: 3
  });
  readonly #session = new ObservationSession();

  #state: AppState = initialAppState();
  #rawPoints: readonly StrokePoint[] = [];
  #graph: CreatureGraph | null = null;
  #preview: StrokePreview | null = null;
  #plan: SkeletonPlan | null = null;
  #run: EvolutionRunResult | null = null;
  #lanes: ObservationLane[] = [];
  #lastStamp = 0;
  #frameHandle: number | null = null;

  constructor() {
    const context = this.#canvas.getContext("2d");
    if (!context) {
      throw new Error("2d canvas context is unavailable");
    }
    this.#context = context;

    bindPointerStroke(this.#canvas, this.#recorder, {
      onChange: (points) => {
        if (!this.#state.canDraw) {
          return;
        }
        this.#rawPoints = points;
        this.#preview = null;
        this.#render();
      },
      onFinish: (points) => {
        if (!this.#state.canDraw) {
          return;
        }
        this.#rawPoints = points;
        this.#convert();
      },
      onCancel: () => this.#clearDrawing()
    });

    window.addEventListener("keydown", (event) => {
      const command = keyToStrokeCommand(event);
      if (command === null) {
        return;
      }
      event.preventDefault();
      if (command === "undo") {
        this.#undo();
      } else if (command === "clear" || command === "cancel") {
        this.#clearDrawing();
      } else if (command === "confirm") {
        void this.#learn();
      }
    });

    element<HTMLButtonElement>("undo").addEventListener("click", () => this.#undo());
    element<HTMLButtonElement>("clear").addEventListener("click", () => this.#clearDrawing());
    element<HTMLButtonElement>("learn").addEventListener("click", () => void this.#learn());
    element<HTMLButtonElement>("play").addEventListener("click", () => {
      this.#dispatch({ type: "play" });
      this.#restartObservation();
    });
    element<HTMLButtonElement>("pause").addEventListener("click", () =>
      this.#dispatch({ type: "pause" })
    );
    element<HTMLInputElement>("generation").addEventListener("input", () => {
      this.#dispatch({ type: "selectGeneration", generation: numberValue("generation") });
      this.#restartObservation();
    });
    element<HTMLSelectElement>("speed").addEventListener("change", () =>
      this.#dispatch({ type: "setSpeed", speed: numberValue("speed") })
    );
    element<HTMLSelectElement>("shown").addEventListener("change", () =>
      this.#restartObservation()
    );

    window.addEventListener("beforeunload", () => this.#session.dispose());

    this.#syncControls();
    this.#render();
    this.#scheduleFrame();
  }

  #dispatch(event: AppEvent): void {
    const next = reduce(this.#state, event);
    if (next === this.#state) {
      return;
    }
    this.#state = next;
    this.#syncControls();
  }

  #convert(): void {
    const result = buildGraphFromStroke(this.#rawPoints, {
      viewport: { width: this.#canvas.width, height: this.#canvas.height },
      worldShortSide: WORLD_SHORT_SIDE
    });

    if (!result.ok) {
      this.#graph = null;
      this.#preview = null;
      this.#plan = null;
      this.#dispatch({
        type: "strokeRejected",
        messages: result.errors.map((error) => error.message)
      });
      this.#render();
      return;
    }
    this.#acceptGraph(result.graph, result.preview);
  }

  #acceptGraph(graph: CreatureGraph, preview: StrokePreview): void {
    const validated = validateCreatureGraph(graph);
    if (!validated.ok) {
      this.#dispatch({
        type: "strokeRejected",
        messages: validated.errors.map((error) => error.message)
      });
      this.#render();
      return;
    }
    this.#graph = graph;
    this.#preview = preview;
    this.#plan = buildSkeletonPlan(validated.graph);
    this.#dispatch({
      type: "strokeAccepted",
      summary: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        jointCount: this.#plan.joints.length,
        graphHash: ""
      }
    });
    this.#render();
  }

  #undo(): void {
    if (!this.#state.canDraw) {
      return;
    }
    const graph = this.#graph;
    if (!graph || graph.edges.length <= 1) {
      return;
    }
    const reduced = removeLastEdge(graph);
    const positions = new Map(reduced.nodes.map((node) => [node.id, node.position]));
    this.#acceptGraph(reduced, {
      nodes: reduced.nodes.map((node) => ({ id: node.id, position: node.position })),
      edges: reduced.edges.map((edge) => ({
        id: edge.id,
        a: positions.get(edge.nodeA)!,
        b: positions.get(edge.nodeB)!
      }))
    });
  }

  #clearDrawing(): void {
    if (!this.#state.canDraw) {
      return;
    }
    this.#recorder.reset();
    this.#rawPoints = [];
    this.#graph = null;
    this.#preview = null;
    this.#plan = null;
    this.#run = null;
    this.#lanes = [];
    this.#session.stop();
    this.#dispatch({ type: "clear" });
    this.#render();
  }

  async #learn(): Promise<void> {
    const graph = this.#graph;
    if (!graph || !this.#state.canLearn) {
      return;
    }
    const generations = numberValue("generations");
    const populationSize = numberValue("population");
    this.#session.stop();
    this.#dispatch({ type: "learnStarted", generations, populationSize });
    this.#render();
    // 学習は同期処理で画面が止まる。止まる前に状態表示を描かせる。
    await new Promise((resolve) => setTimeout(resolve, 32));

    try {
      const started = performance.now();
      this.#run = runEvolution({
        graph,
        seed: numberValue("seed"),
        generations,
        evolution: { ...DEFAULT_EVOLUTION_CONFIG, populationSize },
        episode: { durationSeconds: EPISODE_SECONDS },
        createdAt: new Date().toISOString()
      });
      const wallSeconds = (performance.now() - started) / 1000;

      const slider = element<HTMLInputElement>("generation");
      slider.max = String(this.#run.generations.length - 1);
      slider.value = String(this.#run.bestEver.generation);

      this.#dispatch({
        type: "learnFinished",
        generationCount: this.#run.generations.length,
        bestGeneration: this.#run.bestEver.generation,
        episodeSeconds: EPISODE_SECONDS
      });
      element("gen0").textContent =
        `${this.#run.generations[0]!.bestNormalizedForwardProgress.toFixed(2)} 体長`;
      element("best").textContent =
        `${this.#run.bestEver.terms.normalizedForwardProgress.toFixed(2)} 体長（世代 ${this.#run.bestEver.generation}）`;
      element("hash").textContent = this.#run.graphHash;
      element("status").textContent =
        `${wallSeconds.toFixed(1)} 秒で ${this.#run.generations.length} 世代を学習しました。下の線が古い世代、明るい線が新しい世代です。`;
      this.#restartObservation();
    } catch (error) {
      this.#dispatch({
        type: "learnFailed",
        message: `学習を完了できませんでした（${error instanceof Error ? error.message : String(error)}）。もう一度お試しください。直らない場合はページを再読み込みしてください。`
      });
      this.#render();
    }
  }

  /** 選んだ世代までを等間隔に取り出し、同じ地面へ並べて走らせる。 */
  #restartObservation(): void {
    const run = this.#run;
    const graph = this.#graph;
    if (!run || !graph || this.#state.phase !== "observing") {
      return;
    }
    const selected = this.#state.selectedGeneration;
    const wanted = Math.min(numberValue("shown"), selected + 1);
    const generations = Array.from({ length: wanted }, (_unused, index) =>
      wanted === 1 ? selected : Math.round((selected * index) / (wanted - 1))
    );
    const chosen: BestEver[] = generations.map((generation) => run.bestPerGeneration[generation]!);

    this.#session.start(
      graph,
      chosen.map((best) => best.genome),
      { episodeSeconds: EPISODE_SECONDS }
    );

    const snapshots = this.#session.snapshots(chosen.length);
    this.#lanes = chosen.map((_best, index) => ({
      label: `世代 ${generations[index]!}`,
      color: LANE_COLORS[Math.min(LANE_COLORS.length - 1, Math.round((index * (LANE_COLORS.length - 1)) / Math.max(1, wanted - 1)))]!,
      startX: snapshots[index]!.centerOfMass.x,
      snapshot: snapshots[index]!
    }));
    this.#lastStamp = performance.now();
    this.#render();
  }

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
    const elapsed = Math.max(0, (stamp - this.#lastStamp) / 1000);
    this.#lastStamp = stamp;

    if (this.#state.phase === "observing" && this.#state.playing) {
      this.#session.advance(elapsed, this.#state.speed);
      const snapshots = this.#session.snapshots(this.#lanes.length);
      this.#lanes = this.#lanes.map((lane, index) => ({
        ...lane,
        snapshot: snapshots[index] ?? lane.snapshot
      }));
      if (this.#session.finished) {
        this.#dispatch({ type: "replayFinished" });
      }
      this.#render();
    }
    this.#scheduleFrame();
  }

  #render(): void {
    const size = { width: this.#canvas.width, height: this.#canvas.height };
    if (this.#state.phase === "observing" && this.#lanes.length > 0) {
      drawObservationScene(this.#context, {
        size,
        lanes: this.#lanes,
        pixelsPerMeter: PIXELS_PER_METER,
        bodyLength: this.#run?.skeletonWidth ?? 1
      });
      return;
    }
    drawStrokeScene(this.#context, {
      size,
      rawPoints: this.#rawPoints,
      preview: this.#preview,
      worldShortSide: WORLD_SHORT_SIDE,
      accepted: this.#state.phase === "ready"
    });
  }

  #syncControls(): void {
    const state = this.#state;
    element<HTMLButtonElement>("learn").disabled = !state.canLearn;
    element<HTMLButtonElement>("undo").disabled = !state.canDraw || state.summary === null;
    element<HTMLButtonElement>("clear").disabled = !state.canDraw;
    element<HTMLButtonElement>("play").disabled = state.phase !== "observing";
    element<HTMLButtonElement>("pause").disabled = state.phase !== "observing" || !state.playing;
    element<HTMLInputElement>("generation").disabled = state.phase !== "observing";
    element<HTMLSelectElement>("shown").disabled = state.phase !== "observing";
    element("observe-group").hidden = state.phase !== "observing";
    element("generation-value").textContent = String(state.selectedGeneration);
    element("errors").textContent = state.errors.join("\n");
    element("shape").textContent = state.summary
      ? `Node ${state.summary.nodeCount} / 骨 ${state.summary.edgeCount} / 関節 ${state.summary.jointCount}`
      : "-";

    if (state.phase === "drawing") {
      element("status").textContent =
        state.errors.length > 0
          ? "この形では学習できません。理由を読んで描き直してください。"
          : "キャンバスをドラッグして、一筆で描いてください。";
    } else if (state.phase === "ready") {
      element("status").textContent =
        "この形で学習できます。「この形で学習する」を押してください（Enter）。";
    } else if (state.phase === "learning") {
      element("status").textContent =
        `学習中… ${state.generations} 世代 × ${state.populationSize} 個体。終わるまで画面が止まります。`;
    }
  }
}

new Screen();
