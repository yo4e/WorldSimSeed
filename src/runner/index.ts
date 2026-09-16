import { createSimulation, type MetricsResult, type SimulationSnapshot, type TraceRecord } from "../core/index.js";
import type { CompiledWorld, ResourceLimits, Scalar } from "../spec/index.js";
import { RANDOM_MODEL } from "../spec/random.js";

export const ENGINE_VERSION = "0.1.0-dev.0";

export interface RunWorldOptions {
  seed: number;
  parameters?: Record<string, Scalar>;
  steps?: number;
  limits: ResourceLimits;
  trace?: {
    enabled: boolean;
  };
}

export interface RunManifest {
  manifestVersion: "0.1";
  engine: {
    name: "WorldSimSeed";
    version: string;
    randomModel: string;
  };
  world: {
    id: string;
    specVersion: "0.1";
    specHash: string;
  };
  seed: number;
  steps: number;
  parameters: Readonly<Record<string, Scalar>>;
  observers: string[];
  trace: {
    enabled: boolean;
  };
  limits: ResourceLimits;
  result: {
    status: "completed";
  };
}

export interface ObserverHistoryPoint {
  t: number;
  value: unknown;
}

export interface RunWorldResult {
  manifest: RunManifest;
  finalState: SimulationSnapshot;
  metrics: MetricsResult;
  history: Record<string, ObserverHistoryPoint[]>;
  trace?: TraceRecord[];
}

export function runWorld(
  compiled: CompiledWorld,
  options: RunWorldOptions,
): RunWorldResult {
  const simulation = createSimulation(compiled, options);
  const history: Record<string, ObserverHistoryPoint[]> = Object.create(null);
  const everyStepIds = new Set(
    compiled.observers
      .filter((observer) => observer.record === "everyStep")
      .map((observer) => observer.id),
  );

  if (everyStepIds.size > 0) {
    captureHistory(simulation.metrics(), everyStepIds, history);
  }

  while (simulation.status() === "running") {
    simulation.step();
    if (everyStepIds.size > 0) {
      captureHistory(simulation.metrics(), everyStepIds, history);
    }
  }

  const metrics = simulation.metrics();
  const trace = options.trace?.enabled ? simulation.trace() : undefined;

  const manifest: RunManifest = {
    manifestVersion: "0.1",
    engine: {
      name: "WorldSimSeed",
      version: ENGINE_VERSION,
      randomModel: RANDOM_MODEL,
    },
    world: {
      id: compiled.spec.id,
      specVersion: compiled.spec.specVersion,
      specHash: compiled.specHash,
    },
    seed: simulation.seed,
    steps: simulation.targetSteps,
    parameters: simulation.parameters,
    observers: compiled.observers.map((observer) => observer.id),
    trace: {
      enabled: options.trace?.enabled === true,
    },
    limits: { ...options.limits },
    result: {
      status: "completed",
    },
  };

  return {
    manifest,
    finalState: simulation.snapshot(),
    metrics,
    history,
    ...(trace ? { trace } : {}),
  };
}

function captureHistory(
  metrics: MetricsResult,
  ids: Set<string>,
  history: Record<string, ObserverHistoryPoint[]>,
): void {
  for (const id of ids) {
    const points = history[id] ?? [];
    points.push({
      t: metrics.t,
      value: cloneJsonCompatible(metrics.values[id]),
    });
    history[id] = points;
  }
}

function cloneJsonCompatible(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonCompatible);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = cloneJsonCompatible(child);
    }
    return result;
  }
  return value;
}
