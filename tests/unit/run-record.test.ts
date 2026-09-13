import { describe, expect, it } from "vitest";

import { creatureGraphHash } from "../../src/domain/creature/graph-hash.ts";
import {
  createRunRecord,
  parseRunRecord,
  serializeRunRecord,
  RUN_RECORD_SCHEMA_VERSION
} from "../../src/domain/run/run-record.ts";
import {
  DEFAULT_EPISODE_OPTIONS,
  type EpisodeResult
} from "../../src/simulation/episode-runner.ts";
import { DEFAULT_SKELETON_SETTINGS } from "../../src/simulation/skeleton-plan.ts";
import { chain4 } from "../fixtures/creature-graphs.ts";

const episodeResult: EpisodeResult = {
  status: "completed",
  invalidReason: null,
  steps: 360,
  elapsedSeconds: 6,
  startCenterOfMass: { x: 0, y: 0.3 },
  endCenterOfMass: { x: 1.25, y: 0.28 },
  maxForwardProgress: 1.4,
  motorEffort: 12.5
};

function record() {
  return createRunRecord({
    graph: chain4,
    seed: 12_345,
    episode: DEFAULT_EPISODE_OPTIONS,
    skeleton: DEFAULT_SKELETON_SETTINGS,
    result: episodeResult,
    createdAt: "2026-09-14T00:00:00.000Z",
    runtimeVersions: { phaser: "4.2.1", phaserBox2d: "1.1.0" }
  });
}

describe("RunRecord", () => {
  it("captures the graph hash, seed and summary needed to reproduce a run", () => {
    const created = record();

    expect(created.schemaVersion).toBe(RUN_RECORD_SCHEMA_VERSION);
    expect(created.graphHash).toBe(creatureGraphHash(chain4));
    expect(created.seed).toBe(12_345);
    expect(created.createdAt).toBe("2026-09-14T00:00:00.000Z");
    expect(created.summary.forwardProgress).toBeCloseTo(1.25);
    expect(created.summary.maxForwardProgress).toBeCloseTo(1.4);
    expect(created.summary.motorEffort).toBeCloseTo(12.5);
    expect(created.summary.status).toBe("completed");
    expect(created.summary.invalidReason).toBeNull();
    expect(created.episode).toEqual(DEFAULT_EPISODE_OPTIONS);
    expect(created.skeleton).toEqual(DEFAULT_SKELETON_SETTINGS);
  });

  it("records why an episode was rejected", () => {
    const invalid = createRunRecord({
      graph: chain4,
      seed: 1,
      episode: DEFAULT_EPISODE_OPTIONS,
      skeleton: DEFAULT_SKELETON_SETTINGS,
      result: { ...episodeResult, status: "invalid", invalidReason: "out-of-bounds" },
      createdAt: "2026-09-14T00:00:00.000Z",
      runtimeVersions: {}
    });

    expect(invalid.summary.status).toBe("invalid");
    expect(invalid.summary.invalidReason).toBe("out-of-bounds");
  });

  it("survives a serialize and parse round trip", () => {
    const created = record();

    const parsed = parseRunRecord(serializeRunRecord(created));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.record).toEqual(created);
    }
  });

  it("refuses an unsupported schema version with a reason instead of throwing", () => {
    const future = serializeRunRecord({ ...record(), schemaVersion: 999 });

    const parsed = parseRunRecord(future);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toMatch(/999/);
    }
  });

  it("refuses malformed json with a reason instead of throwing", () => {
    const parsed = parseRunRecord("{ not json");

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason.length).toBeGreaterThan(0);
    }
  });

  it("refuses json that is missing required fields", () => {
    expect(parseRunRecord(JSON.stringify({ schemaVersion: 1 })).ok).toBe(false);
  });
});
