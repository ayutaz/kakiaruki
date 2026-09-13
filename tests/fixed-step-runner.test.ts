import { describe, expect, it, vi } from "vitest";

import { FixedStepRunner } from "../src/simulation/fixed-step-runner.ts";

describe("FixedStepRunner", () => {
  it("turns elapsed wall time into explicit fixed simulation steps", () => {
    const runner = new FixedStepRunner({
      stepSeconds: 1 / 60,
      maxStepsPerFrame: 8
    });
    const step = vi.fn();

    const result = runner.advance(1 / 30, step);

    expect(result.steps).toBe(2);
    expect(step).toHaveBeenCalledTimes(2);
    expect(step).toHaveBeenNthCalledWith(1, 1 / 60);
    expect(result.droppedSeconds).toBe(0);
  });

  it("drops excess accumulated time instead of freezing the UI", () => {
    const runner = new FixedStepRunner({
      stepSeconds: 1 / 60,
      maxStepsPerFrame: 4
    });
    const step = vi.fn();

    const result = runner.advance(1, step);

    expect(result.steps).toBe(4);
    expect(result.droppedSeconds).toBeGreaterThan(0.9);
    expect(step).toHaveBeenCalledTimes(4);
  });
});
