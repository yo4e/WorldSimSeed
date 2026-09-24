import { createSimulation, type MetricsResult, type SimulationSnapshot, type TraceRecord } from "../core/index.js";
import { WorldSimError } from "../errors.js";
import type { CompiledWorld, ResourceLimits, Scalar } from "../spec/index.js";
import { RANDOM_MODEL } from "../spec/random.js";

export const ENGINE_VERSION = "0.1.0";

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
  eventCount: number;
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

  let eventCount = 0;

  while (simulation.status() === "running") {
    const stepResult = simulation.step();
    eventCount += stepResult.triggeredEvents;
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
    eventCount,
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


export type ExperimentParameterValue = Scalar | Scalar[];

export interface ExperimentRequest {
  experimentVersion: "0.1";
  world: string;
  parameters?: Record<string, ExperimentParameterValue>;
  runs: {
    seeds:
      | number[]
      | {
          base: number;
          count: number;
        };
  };
  steps?: number;
  trace?: {
    mode: "none" | "selected";
    seeds?: number[];
  };
  limits?: Partial<ResourceLimits>;
}

export interface BatchAggregate {
  count: number;
  mean: number;
  min: number;
  max: number;
}

export interface ExperimentRunRecord {
  manifest: RunManifest;
  metrics: MetricsResult;
  eventCount: number;
  trace?: TraceRecord[];
}

export interface ExperimentResult {
  experimentVersion: "0.1";
  world: {
    id: string;
    specHash: string;
  };
  runCount: number;
  runs: ExperimentRunRecord[];
  aggregates: Record<string, BatchAggregate>;
  eventCount: BatchAggregate;
}

export function validateExperimentRequest(value: unknown): ExperimentRequest {
  assertObject(value, "experiment request");
  rejectExperimentUnknownKeys(
    value,
    ["experimentVersion", "world", "parameters", "runs", "steps", "trace", "limits"],
    "experiment request",
  );

  if (value.experimentVersion !== "0.1") {
    experimentSchemaError("experimentVersion must be '0.1'.");
  }
  if (typeof value.world !== "string" || value.world.length === 0) {
    experimentSchemaError("world must be a non-empty string.");
  }

  let parameters: Record<string, ExperimentParameterValue> | undefined;
  if (value.parameters !== undefined) {
    assertObject(value.parameters, "parameters");
    const parsedParameters: Record<string, ExperimentParameterValue> =
      Object.create(null);
    for (const [name, raw] of Object.entries(value.parameters)) {
      if (Array.isArray(raw)) {
        if (raw.length === 0 || raw.some((item) => !isScalar(item))) {
          experimentSchemaError(
            `parameters.${name} must be a non-empty scalar array or scalar.`,
          );
        }
        parsedParameters[name] = [...raw] as Scalar[];
      } else if (isScalar(raw)) {
        parsedParameters[name] = raw;
      } else {
        experimentSchemaError(
          `parameters.${name} must be a scalar or scalar array.`,
        );
      }
    }
    parameters = parsedParameters;
  }

  assertObject(value.runs, "runs");
  rejectExperimentUnknownKeys(value.runs, ["seeds"], "runs");
  const seeds = validateSeedRequest(value.runs.seeds);

  let steps: number | undefined;
  if (value.steps !== undefined) {
    assertPositiveIntegerValue(value.steps, "steps");
    steps = value.steps as number;
  }

  let trace: ExperimentRequest["trace"];
  if (value.trace !== undefined) {
    assertObject(value.trace, "trace");
    rejectExperimentUnknownKeys(value.trace, ["mode", "seeds"], "trace");
    if (value.trace.mode !== "none" && value.trace.mode !== "selected") {
      experimentSchemaError("trace.mode must be none or selected.");
    }
    let traceSeeds: number[] | undefined;
    if (value.trace.seeds !== undefined) {
      if (!Array.isArray(value.trace.seeds)) {
        experimentSchemaError("trace.seeds must be an array.");
      }
      traceSeeds = value.trace.seeds.map((seed, index) => {
        assertSeed(seed, `trace.seeds[${index}]`);
        return seed as number;
      });
    }
    if (value.trace.mode === "selected" && !traceSeeds) {
      experimentSchemaError("trace.selected requires trace.seeds.");
    }
    if (value.trace.mode === "none" && traceSeeds) {
      experimentSchemaError("trace.seeds is not allowed when trace.mode is none.");
    }
    trace = {
      mode: value.trace.mode,
      ...(traceSeeds ? { seeds: traceSeeds } : {}),
    };
  }

  let limits: Partial<ResourceLimits> | undefined;
  if (value.limits !== undefined) {
    assertObject(value.limits, "limits");
    rejectExperimentUnknownKeys(
      value.limits,
      ["maxAgents", "maxSteps", "maxRuns", "maxEvents", "maxTraceRecords"],
      "limits",
    );
    limits = Object.create(null);
    for (const [name, raw] of Object.entries(value.limits)) {
      assertPositiveIntegerValue(raw, `limits.${name}`);
      (limits as Record<string, number>)[name] = raw as number;
    }
  }

  return {
    experimentVersion: "0.1",
    world: value.world,
    ...(parameters ? { parameters } : {}),
    runs: { seeds },
    ...(steps === undefined ? {} : { steps }),
    ...(trace ? { trace } : {}),
    ...(limits ? { limits } : {}),
  };
}

export function runExperiment(
  compiled: CompiledWorld,
  request: ExperimentRequest,
  hostLimits: ResourceLimits,
): ExperimentResult {
  const effectiveLimits = resolveExperimentLimits(hostLimits, request.limits);
  const seeds = resolveSeeds(request.runs.seeds);
  const parameterSets = expandParameterSets(
    compiled,
    request.parameters ?? Object.create(null),
  );
  const runCount = seeds.length * parameterSets.length;
  const maxRuns = effectiveLimits.maxRuns ?? 1;

  if (runCount > maxRuns) {
    throw new WorldSimError(
      "RESOURCE_LIMIT",
      "Experiment exceeds maxRuns.",
      { requested: runCount, limit: maxRuns },
    );
  }

  const selectedTraceSeeds = new Set(
    request.trace?.mode === "selected" ? request.trace.seeds ?? [] : [],
  );
  const runs: ExperimentRunRecord[] = [];
  const numericValues: Record<string, number[]> = Object.create(null);
  const eventCounts: number[] = [];

  for (const parameters of parameterSets) {
    for (const seed of seeds) {
      const traceEnabled = selectedTraceSeeds.has(seed);
      const result = runWorld(compiled, {
        seed,
        parameters,
        ...(request.steps === undefined ? {} : { steps: request.steps }),
        limits: effectiveLimits,
        trace: { enabled: traceEnabled },
      });

      for (const [observerId, value] of Object.entries(result.metrics.values)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const values = numericValues[observerId] ?? [];
        values.push(value);
        numericValues[observerId] = values;
      }

      eventCounts.push(result.eventCount);
      runs.push({
        manifest: result.manifest,
        metrics: result.metrics,
        eventCount: result.eventCount,
        ...(traceEnabled && result.trace ? { trace: result.trace } : {}),
      });
    }
  }

  const aggregates: Record<string, BatchAggregate> = Object.create(null);
  for (const [observerId, values] of Object.entries(numericValues)) {
    aggregates[observerId] = summarizeNumbers(values);
  }

  return {
    experimentVersion: "0.1",
    world: {
      id: compiled.spec.id,
      specHash: compiled.specHash,
    },
    runCount,
    runs,
    aggregates,
    eventCount: summarizeNumbers(eventCounts),
  };
}

function validateSeedRequest(
  value: unknown,
): ExperimentRequest["runs"]["seeds"] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      experimentSchemaError("runs.seeds must not be empty.");
    }
    return value.map((seed, index) => {
      assertSeed(seed, `runs.seeds[${index}]`);
      return seed as number;
    });
  }

  assertObject(value, "runs.seeds");
  rejectExperimentUnknownKeys(value, ["base", "count"], "runs.seeds");
  assertSeed(value.base, "runs.seeds.base");
  assertPositiveIntegerValue(value.count, "runs.seeds.count");

  const last = (value.base as number) + (value.count as number) - 1;
  if (last > 0xffffffff) {
    experimentSchemaError("Derived seed sequence exceeds uint32.");
  }

  return {
    base: value.base as number,
    count: value.count as number,
  };
}

function resolveSeeds(
  seeds: ExperimentRequest["runs"]["seeds"],
): number[] {
  if (Array.isArray(seeds)) return [...seeds];
  return Array.from({ length: seeds.count }, (_, index) => seeds.base + index);
}

function expandParameterSets(
  compiled: CompiledWorld,
  requestParameters: Record<string, ExperimentParameterValue>,
): Record<string, Scalar>[] {
  const definitions = compiled.spec.parameters ?? Object.create(null);
  const names = Object.keys(requestParameters).sort();

  for (const name of names) {
    if (!(name in definitions)) {
      throw new WorldSimError(
        "SEMANTIC_ERROR",
        `Unknown experiment parameter '${name}'.`,
      );
    }
  }

  if (names.length === 0) return [Object.create(null)];

  const choices = names.map((name) => {
    const raw = requestParameters[name]!;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      validateExperimentParameterValue(name, value, definitions[name]!);
    }
    return { name, values };
  });

  const result: Record<string, Scalar>[] = [];

  function visit(index: number, current: Record<string, Scalar>): void {
    if (index >= choices.length) {
      result.push({ ...current });
      return;
    }

    const choice = choices[index]!;
    for (const value of choice.values) {
      current[choice.name] = value;
      visit(index + 1, current);
    }
    delete current[choice.name];
  }

  visit(0, Object.create(null));
  return result;
}

function validateExperimentParameterValue(
  name: string,
  value: Scalar,
  definition:
    | { type: "number"; default: number; min?: number; max?: number }
    | { type: "boolean"; default: boolean },
): void {
  if (definition.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new WorldSimError(
        "SEMANTIC_ERROR",
        `Parameter '${name}' requires boolean values.`,
      );
    }
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WorldSimError(
      "SEMANTIC_ERROR",
      `Parameter '${name}' requires finite number values.`,
    );
  }
  if (definition.min !== undefined && value < definition.min) {
    throw new WorldSimError(
      "SEMANTIC_ERROR",
      `Parameter '${name}' is below min.`,
    );
  }
  if (definition.max !== undefined && value > definition.max) {
    throw new WorldSimError(
      "SEMANTIC_ERROR",
      `Parameter '${name}' exceeds max.`,
    );
  }
}

function resolveExperimentLimits(
  host: ResourceLimits,
  requested?: Partial<ResourceLimits>,
): ResourceLimits {
  const hostMaxRuns = host.maxRuns ?? 1;
  return {
    maxAgents: Math.min(host.maxAgents, requested?.maxAgents ?? host.maxAgents),
    maxSteps: Math.min(host.maxSteps, requested?.maxSteps ?? host.maxSteps),
    maxEvents: Math.min(host.maxEvents, requested?.maxEvents ?? host.maxEvents),
    maxTraceRecords: Math.min(
      host.maxTraceRecords,
      requested?.maxTraceRecords ?? host.maxTraceRecords,
    ),
    maxRuns: Math.min(hostMaxRuns, requested?.maxRuns ?? hostMaxRuns),
  };
}

function summarizeNumbers(values: number[]): BatchAggregate {
  if (values.length === 0) {
    throw new WorldSimError(
      "SEMANTIC_ERROR",
      "Cannot aggregate an empty numeric series.",
    );
  }

  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    sum += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return {
    count: values.length,
    mean: sum / values.length,
    min,
    max,
  };
}

function assertObject(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    experimentSchemaError(`${path} must be an object.`);
  }
}

function rejectExperimentUnknownKeys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!set.has(key)) {
      experimentSchemaError(`Unknown field '${path}.${key}'.`);
    }
  }
}

function assertPositiveIntegerValue(value: unknown, path: string): void {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    experimentSchemaError(`${path} must be a positive integer.`);
  }
}

function assertSeed(value: unknown, path: string): void {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 0xffffffff
  ) {
    experimentSchemaError(`${path} must be a uint32 integer.`);
  }
}

function isScalar(value: unknown): value is Scalar {
  return (
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function experimentSchemaError(message: string): never {
  throw new WorldSimError("SCHEMA_ERROR", message);
}
