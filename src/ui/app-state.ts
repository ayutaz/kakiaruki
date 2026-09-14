/**
 * 画面の状態と遷移。純粋な関数だけで書き、DOM・Canvas・物理を知らない。
 *
 * ここへ判断を集めることで、「学習中は形を変えられない」「速度を変えても評価の
 * 定義は変わらない」といった約束を、ブラウザを起動せずに試験できる。
 */

export type AppPhase = "drawing" | "ready" | "learning" | "observing";

/** 画面に出す形の要約。Graph本体はUIへ渡さない。 */
export interface GraphSummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly jointCount: number;
  readonly graphHash: string;
}

export const SPEED_CHOICES = [1, 2, 4, 8] as const;
export type Speed = (typeof SPEED_CHOICES)[number];

export interface AppState {
  readonly phase: AppPhase;
  readonly summary: GraphSummary | null;
  readonly errors: readonly string[];
  /** 学習開始時に固定し、観察中は変わらない。 */
  readonly generations: number;
  readonly populationSize: number;
  readonly episodeSeconds: number;
  readonly generationCount: number;
  /** 学習中に何世代終わったか。 */
  readonly learnedGenerations: number;
  readonly selectedGeneration: number;
  readonly bestGeneration: number;
  readonly speed: Speed;
  readonly playing: boolean;
  readonly canDraw: boolean;
  readonly canLearn: boolean;
}

export type AppEvent =
  | { readonly type: "strokeAccepted"; readonly summary: GraphSummary }
  | { readonly type: "strokeRejected"; readonly messages: readonly string[] }
  | { readonly type: "undo" }
  | { readonly type: "clear" }
  | {
      readonly type: "learnStarted";
      readonly generations: number;
      readonly populationSize: number;
    }
  | {
      readonly type: "learnFinished";
      readonly generationCount: number;
      readonly bestGeneration: number;
      readonly episodeSeconds: number;
    }
  | { readonly type: "learnProgress"; readonly completed: number }
  | { readonly type: "learnFailed"; readonly message: string }
  | { readonly type: "play" }
  | { readonly type: "pause" }
  | { readonly type: "replayFinished" }
  | { readonly type: "selectGeneration"; readonly generation: number }
  | { readonly type: "setSpeed"; readonly speed: number };

export function initialAppState(): AppState {
  return {
    phase: "drawing",
    summary: null,
    errors: [],
    generations: 0,
    populationSize: 0,
    episodeSeconds: 0,
    generationCount: 0,
    learnedGenerations: 0,
    selectedGeneration: 0,
    bestGeneration: 0,
    speed: 1,
    playing: false,
    canDraw: true,
    canLearn: false
  };
}

function isSpeed(value: number): value is Speed {
  return (SPEED_CHOICES as readonly number[]).includes(value);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function reduce(state: AppState, event: AppEvent): AppState {
  // 学習中はメインスレッドが止まっており、物理資源も入れ替わる途中にある。
  // ここで形を差し替えると、UIが古いWorldを触りに行く。
  if (state.phase === "learning") {
    switch (event.type) {
      case "learnProgress":
      case "learnFinished":
      case "learnFailed":
        break;
      default:
        return state;
    }
  }

  switch (event.type) {
    case "strokeAccepted":
      return {
        ...state,
        phase: "ready",
        summary: event.summary,
        errors: [],
        playing: false,
        generationCount: 0,
        selectedGeneration: 0,
        bestGeneration: 0,
        canDraw: true,
        canLearn: true
      };

    case "strokeRejected":
      return {
        ...state,
        phase: state.phase === "observing" ? "observing" : "drawing",
        summary: null,
        errors: [...event.messages],
        canLearn: false
      };

    case "undo":
      // Undoそのものは形の操作。呼び出し側が骨を1本外し、結果を
      // strokeAccepted / strokeRejected として投げ直す。
      // ここに置くのは「学習中は受け付けない」を上の guard で効かせるため。
      return state;

    case "clear":
      return initialAppState();

    case "learnStarted":
      return {
        ...state,
        phase: "learning",
        errors: [],
        generations: event.generations,
        populationSize: event.populationSize,
        learnedGenerations: 0,
        playing: false,
        canDraw: false,
        canLearn: false
      };

    case "learnProgress":
      return state.phase === "learning"
        ? { ...state, learnedGenerations: Math.max(0, Math.trunc(event.completed)) }
        : state;

    case "learnFinished":
      return {
        ...state,
        phase: "observing",
        generationCount: event.generationCount,
        selectedGeneration: clamp(event.bestGeneration, 0, event.generationCount - 1),
        bestGeneration: clamp(event.bestGeneration, 0, event.generationCount - 1),
        episodeSeconds: event.episodeSeconds,
        playing: true,
        canDraw: true,
        canLearn: true
      };

    case "learnFailed":
      return {
        ...state,
        phase: "ready",
        errors: [event.message],
        playing: false,
        canDraw: true,
        canLearn: true
      };

    case "play":
      return state.phase === "observing" ? { ...state, playing: true } : state;

    case "pause":
      return state.phase === "observing" ? { ...state, playing: false } : state;

    case "replayFinished":
      return state.phase === "observing" ? { ...state, playing: false } : state;

    case "selectGeneration": {
      if (state.phase !== "observing") {
        return state;
      }
      return {
        ...state,
        selectedGeneration: clamp(event.generation, 0, state.generationCount - 1),
        // 世代を変えたら、その世代を最初から見せる。
        playing: true
      };
    }

    case "setSpeed":
      return isSpeed(event.speed) ? { ...state, speed: event.speed } : state;
  }
}
