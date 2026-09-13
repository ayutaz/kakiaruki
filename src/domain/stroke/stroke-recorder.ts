import {
  isFiniteStrokePoint,
  isInsideViewport,
  strokePointDistance,
  type StrokePoint,
  type ViewportSize
} from "./stroke-point.ts";

export interface StrokeRecorderOptions {
  /** 画面px。これ未満しか動いていない点は記録しない。 */
  readonly minPointDistance: number;
  readonly maxPoints: number;
  readonly maxDurationMs: number;
  readonly bounds: ViewportSize;
}

export type StrokeRecorderStatus = "idle" | "drawing" | "finished" | "cancelled";

const DEFAULTS = {
  minPointDistance: 3,
  maxPoints: 4_000,
  maxDurationMs: 30_000
} as const;

/**
 * 生のPointer点を安全な範囲に収めて記録する。範囲外・非有限・過密な点は
 * 黙って形を変えるのではなく「記録しない」ことで落とす（docs/04 §3 Step 1）。
 */
export class StrokeRecorder {
  readonly #options: StrokeRecorderOptions;
  #points: StrokePoint[] = [];
  #status: StrokeRecorderStatus = "idle";
  #startTime = 0;

  constructor(options: Partial<StrokeRecorderOptions> & { bounds: ViewportSize }) {
    const resolved: StrokeRecorderOptions = { ...DEFAULTS, ...options };
    if (
      !Number.isFinite(resolved.bounds.width) ||
      !Number.isFinite(resolved.bounds.height) ||
      resolved.bounds.width <= 0 ||
      resolved.bounds.height <= 0
    ) {
      throw new RangeError("bounds must have a positive finite width and height");
    }
    if (resolved.minPointDistance < 0) {
      throw new RangeError("minPointDistance must be non-negative");
    }
    if (!Number.isInteger(resolved.maxPoints) || resolved.maxPoints < 2) {
      throw new RangeError("maxPoints must be an integer of at least 2");
    }
    this.#options = resolved;
  }

  get status(): StrokeRecorderStatus {
    return this.#status;
  }

  get points(): readonly StrokePoint[] {
    return this.#points;
  }

  begin(point: StrokePoint): void {
    if (!this.#accepts(point)) {
      return;
    }
    this.#points = [point];
    this.#startTime = point.time;
    this.#status = "drawing";
  }

  /** 記録したら true。 */
  extend(point: StrokePoint): boolean {
    if (this.#status !== "drawing" || !this.#accepts(point)) {
      return false;
    }
    if (this.#points.length >= this.#options.maxPoints) {
      return false;
    }
    if (point.time - this.#startTime > this.#options.maxDurationMs) {
      return false;
    }
    const last = this.#points.at(-1);
    if (last && strokePointDistance(last, point) < this.#options.minPointDistance) {
      return false;
    }
    this.#points.push(point);
    return true;
  }

  finish(): readonly StrokePoint[] {
    if (this.#status === "drawing") {
      this.#status = "finished";
    }
    return this.#points;
  }

  cancel(): void {
    this.#points = [];
    this.#status = "cancelled";
  }

  reset(): void {
    this.#points = [];
    this.#status = "idle";
    this.#startTime = 0;
  }

  #accepts(point: StrokePoint): boolean {
    return isFiniteStrokePoint(point) && isInsideViewport(point, this.#options.bounds);
  }
}
