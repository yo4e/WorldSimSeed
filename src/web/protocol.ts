import type { MetricsResult, SimulationSnapshot, TraceRecord } from "../core/index.js";
import type { RunManifest } from "../runner/index.js";
import type { ResourceLimits, Scalar } from "../spec/index.js";

export type WorldSourceFormat = "yaml" | "json";

export interface WebWorldMeta {
  id: string;
  title?: string;
  specHash: string;
}

export interface WebSimulationView {
  world: WebWorldMeta;
  status: "running" | "completed";
  state: SimulationSnapshot;
  metrics: MetricsResult;
}

export interface WebRunResult extends WebSimulationView {
  cancelled: boolean;
}

export interface WebRunExport {
  manifest: RunManifest;
  finalState: SimulationSnapshot;
  metrics: MetricsResult;
  trace?: TraceRecord[];
}

export interface SerializedWorkerError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface RequestBase {
  id: number;
}

export type WorkerRequest =
  | (RequestBase & {
      type: "load";
      source: string;
      format: WorldSourceFormat;
      seed: number;
      parameters?: Record<string, Scalar>;
      steps?: number;
      limits: ResourceLimits;
      trace?: boolean;
    })
  | (RequestBase & {
      type: "reset";
      seed?: number;
      parameters?: Record<string, Scalar>;
      steps?: number;
      limits?: ResourceLimits;
      trace?: boolean;
    })
  | (RequestBase & { type: "step" })
  | (RequestBase & { type: "run"; chunkSize?: number })
  | (RequestBase & { type: "cancel" })
  | (RequestBase & { type: "getState" })
  | (RequestBase & { type: "getMetrics" })
  | (RequestBase & { type: "exportRun" });

export interface WorkerSuccessResponse {
  id: number;
  type: WorkerRequest["type"];
  ok: true;
  data: unknown;
}

export interface WorkerErrorResponse {
  id: number;
  type: WorkerRequest["type"];
  ok: false;
  error: SerializedWorkerError;
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;
