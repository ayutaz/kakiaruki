import type { EpisodeOptions, EpisodeResult } from "../../simulation/episode-runner.ts";
import type { SkeletonSettings } from "../../simulation/skeleton-plan.ts";
import type { CreatureGraph } from "../creature/creature-graph.ts";
import { creatureGraphHash } from "../creature/graph-hash.ts";

export const RUN_RECORD_SCHEMA_VERSION = 1;

export interface RunRecordSummary {
  readonly steps: number;
  readonly status: "completed" | "invalid";
  readonly invalidReason: string | null;
  /** 開始重心から終了重心までの前進量。 */
  readonly forwardProgress: number;
  readonly maxForwardProgress: number;
  readonly motorEffort: number;
}

export interface RunRecord {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly graph: CreatureGraph;
  readonly graphHash: string;
  readonly seed: number;
  readonly episode: EpisodeOptions;
  readonly skeleton: SkeletonSettings;
  readonly runtimeVersions: Readonly<Record<string, string>>;
  readonly summary: RunRecordSummary;
}

export interface CreateRunRecordInput {
  readonly graph: CreatureGraph;
  readonly seed: number;
  readonly episode: EpisodeOptions;
  readonly skeleton: SkeletonSettings;
  readonly result: EpisodeResult;
  readonly createdAt: string;
  readonly runtimeVersions: Readonly<Record<string, string>>;
}

export function createRunRecord(input: CreateRunRecordInput): RunRecord {
  return {
    schemaVersion: RUN_RECORD_SCHEMA_VERSION,
    createdAt: input.createdAt,
    graph: input.graph,
    graphHash: creatureGraphHash(input.graph),
    seed: input.seed,
    episode: input.episode,
    skeleton: input.skeleton,
    runtimeVersions: input.runtimeVersions,
    summary: {
      steps: input.result.steps,
      status: input.result.status,
      invalidReason: input.result.invalidReason,
      forwardProgress:
        input.result.endCenterOfMass.x - input.result.startCenterOfMass.x,
      maxForwardProgress: input.result.maxForwardProgress,
      motorEffort: input.result.motorEffort
    }
  };
}

export function serializeRunRecord(record: RunRecord): string {
  return JSON.stringify(record);
}

export type RunRecordParseResult =
  | { readonly ok: true; readonly record: RunRecord }
  | { readonly ok: false; readonly reason: string };

const REQUIRED_KEYS = [
  "schemaVersion",
  "createdAt",
  "graph",
  "graphHash",
  "seed",
  "episode",
  "skeleton",
  "runtimeVersions",
  "summary"
] as const;

/** 破壊的なschema変更では例外ではなく理由付きの非対応を返す（docs/06 §8）。 */
export function parseRunRecord(json: string): RunRecordParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      reason: `RunRecordのJSONを解釈できません: ${(error as Error).message}`
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "RunRecordはオブジェクトである必要があります。" };
  }

  const candidate = parsed as Record<string, unknown>;
  const missing = REQUIRED_KEYS.filter((key) => !(key in candidate));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `RunRecordに必須項目がありません: ${missing.join(", ")}`
    };
  }

  if (candidate["schemaVersion"] !== RUN_RECORD_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `schemaVersion ${String(candidate["schemaVersion"])} は未対応です。対応版は ${RUN_RECORD_SCHEMA_VERSION} です。`
    };
  }

  return { ok: true, record: candidate as unknown as RunRecord };
}
