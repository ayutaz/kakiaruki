export interface FixedStepRunnerOptions {
  readonly stepSeconds: number;
  readonly maxStepsPerFrame: number;
}

export interface FixedStepResult {
  readonly steps: number;
  readonly interpolationAlpha: number;
  readonly droppedSeconds: number;
}

export class FixedStepRunner {
  readonly #stepSeconds: number;
  readonly #maxStepsPerFrame: number;
  #accumulatorSeconds = 0;

  constructor(options: FixedStepRunnerOptions) {
    if (!Number.isFinite(options.stepSeconds) || options.stepSeconds <= 0) {
      throw new RangeError("stepSeconds must be finite and greater than zero");
    }
    if (!Number.isInteger(options.maxStepsPerFrame) || options.maxStepsPerFrame < 1) {
      throw new RangeError("maxStepsPerFrame must be a positive integer");
    }

    this.#stepSeconds = options.stepSeconds;
    this.#maxStepsPerFrame = options.maxStepsPerFrame;
  }

  advance(elapsedSeconds: number, step: (stepSeconds: number) => void): FixedStepResult {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      throw new RangeError("elapsedSeconds must be finite and non-negative");
    }

    this.#accumulatorSeconds += elapsedSeconds;
    let steps = 0;

    while (
      this.#accumulatorSeconds + Number.EPSILON >= this.#stepSeconds &&
      steps < this.#maxStepsPerFrame
    ) {
      step(this.#stepSeconds);
      this.#accumulatorSeconds -= this.#stepSeconds;
      steps += 1;
    }

    let droppedSeconds = 0;
    if (this.#accumulatorSeconds >= this.#stepSeconds) {
      droppedSeconds = this.#accumulatorSeconds;
      this.#accumulatorSeconds = 0;
    }

    return {
      steps,
      interpolationAlpha: this.#accumulatorSeconds / this.#stepSeconds,
      droppedSeconds
    };
  }

  reset(): void {
    this.#accumulatorSeconds = 0;
  }
}
