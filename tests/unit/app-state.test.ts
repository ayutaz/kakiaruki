import { describe, expect, it } from "vitest";

import {
  initialAppState,
  reduce,
  SPEED_CHOICES,
  type AppState
} from "../../src/ui/app-state.ts";

const GRAPH_SUMMARY = { nodeCount: 6, edgeCount: 5, jointCount: 4, graphHash: "abc" };

function ready(): AppState {
  return reduce(initialAppState(), { type: "strokeAccepted", summary: GRAPH_SUMMARY });
}

function learning(): AppState {
  return reduce(ready(), { type: "learnStarted", generations: 20, populationSize: 32 });
}

function observing(): AppState {
  return reduce(learning(), {
    type: "learnFinished",
    generationCount: 20,
    bestGeneration: 13,
    episodeSeconds: 6
  });
}

describe("app state", () => {
  it("starts by asking for a drawing", () => {
    const state = initialAppState();

    expect(state.phase).toBe("drawing");
    expect(state.canLearn).toBe(false);
  });

  it("becomes ready once a stroke is accepted", () => {
    const state = ready();

    expect(state.phase).toBe("ready");
    expect(state.canLearn).toBe(true);
    expect(state.summary).toEqual(GRAPH_SUMMARY);
  });

  it("keeps the reason when a stroke is rejected", () => {
    const state = reduce(initialAppState(), {
      type: "strokeRejected",
      messages: ["線が自分自身と交差しています。"]
    });

    expect(state.phase).toBe("drawing");
    expect(state.canLearn).toBe(false);
    expect(state.errors).toEqual(["線が自分自身と交差しています。"]);
  });

  it("clears the reason once a later stroke is accepted", () => {
    const rejected = reduce(initialAppState(), {
      type: "strokeRejected",
      messages: ["短すぎます。"]
    });

    expect(reduce(rejected, { type: "strokeAccepted", summary: GRAPH_SUMMARY }).errors).toEqual([]);
  });

  it("refuses to change the drawing while learning", () => {
    const state = learning();

    // 学習中に形を差し替えると、古いWorldをUIが触りに行く。
    expect(reduce(state, { type: "strokeAccepted", summary: GRAPH_SUMMARY })).toBe(state);
    expect(reduce(state, { type: "undo" })).toBe(state);
    expect(reduce(state, { type: "clear" })).toBe(state);
    expect(state.canLearn).toBe(false);
    expect(state.canDraw).toBe(false);
  });

  it("moves to observing when learning finishes", () => {
    const state = observing();

    expect(state.phase).toBe("observing");
    expect(state.canDraw).toBe(true);
    expect(state.generationCount).toBe(20);
    expect(state.selectedGeneration).toBe(13);
    expect(state.playing).toBe(true);
  });

  it("keeps the episode definition when the speed changes", () => {
    const before = observing();

    const after = reduce(before, { type: "setSpeed", speed: 8 });

    expect(after.speed).toBe(8);
    expect(after.episodeSeconds).toBe(before.episodeSeconds);
    expect(after.populationSize).toBe(before.populationSize);
    expect(after.generationCount).toBe(before.generationCount);
  });

  it("only accepts a speed the screen offers", () => {
    const before = observing();

    expect(reduce(before, { type: "setSpeed", speed: 3 })).toBe(before);
    for (const speed of SPEED_CHOICES) {
      expect(reduce(before, { type: "setSpeed", speed }).speed).toBe(speed);
    }
  });

  it("keeps the selected generation inside the run", () => {
    const before = observing();

    expect(reduce(before, { type: "selectGeneration", generation: 99 }).selectedGeneration).toBe(19);
    expect(reduce(before, { type: "selectGeneration", generation: -4 }).selectedGeneration).toBe(0);
  });

  it("restarts the replay when another generation is chosen", () => {
    const paused = reduce(observing(), { type: "pause" });

    expect(paused.playing).toBe(false);
    expect(reduce(paused, { type: "selectGeneration", generation: 4 }).playing).toBe(true);
  });

  it("goes back to ready when the drawing is redone after observing", () => {
    const state = reduce(observing(), { type: "strokeAccepted", summary: GRAPH_SUMMARY });

    expect(state.phase).toBe("ready");
    expect(state.playing).toBe(false);
    expect(state.generationCount).toBe(0);
  });

  it("shows the reason and stays usable when learning fails", () => {
    const state = reduce(learning(), {
      type: "learnFailed",
      message: "物理Worldを確保できませんでした。ページを再読み込みしてください。"
    });

    expect(state.phase).toBe("ready");
    expect(state.errors).toEqual([
      "物理Worldを確保できませんでした。ページを再読み込みしてください。"
    ]);
    expect(state.canDraw).toBe(true);
  });

  it("clears everything back to the first screen", () => {
    expect(reduce(observing(), { type: "clear" })).toEqual(initialAppState());
  });
});
