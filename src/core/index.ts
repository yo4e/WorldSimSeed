import { WorldSimError } from "../errors.js";
import {
  evaluateExpression,
  type CompiledEvent,
  type CompiledObserver,
  type CompiledWorld,
  type ResourceLimits,
  type Scalar,
  type StateField,
} from "../spec/index.js";
import { normal01, random01 } from "../spec/random.js";

export interface SimulationOptions {
  seed: number;
  parameters?: Record<string, Scalar>;
  steps?: number;
  limits: ResourceLimits;
  trace?: {
    enabled: boolean;
  };
}

export interface AgentSnapshot {
  id: number;
  state: Record<string, Scalar>;
}

export interface SimulationSnapshot {
  t: number;
  world?: Record<string, Scalar>;
  agents?: AgentSnapshot[];
}

export interface TraceEffect {
  target: string;
  before: Scalar;
  after: Scalar;
}

export interface TraceRecord {
  t: number;
  eventId: string;
  scope: "agent" | "world";
  agentId?: number;
  effects: TraceEffect[];
}

export interface StepResult {
  t: number;
  status: "running" | "completed";
  triggeredEvents: number;
}

export interface MetricsResult {
  t: number;
  values: Record<string, unknown>;
}

export interface Simulation {
  step(): StepResult;
  snapshot(): SimulationSnapshot;
  metrics(): MetricsResult;
  trace(): TraceRecord[];
  status(): "running" | "completed";
  readonly seed: number;
  readonly parameters: Readonly<Record<string, Scalar>>;
  readonly targetSteps: number;
}

interface AgentRuntime {
  id: number;
  state: Record<string, Scalar>;
}

export function createSimulation(
  compiled: CompiledWorld,
  options: SimulationOptions,
): Simulation {
  validateSeed(options.seed);

  const spec = compiled.spec;
  const parameters = resolveParameters(spec.parameters ?? {}, options.parameters ?? {});
  const targetSteps = options.steps ?? spec.time.steps;

  if (!Number.isInteger(targetSteps) || targetSteps <= 0) {
    throw new WorldSimError("SCHEMA_ERROR", "steps must be a positive integer.");
  }
  if (targetSteps > spec.time.steps) {
    throw new WorldSimError(
      "SEMANTIC_ERROR",
      "Run steps cannot exceed world time.steps in v0.1.",
    );
  }
  if (targetSteps > options.limits.maxSteps) {
    throw new WorldSimError("RESOURCE_LIMIT", "Run exceeds maxSteps.", {
      requested: targetSteps,
      limit: options.limits.maxSteps,
    });
  }
  if ((spec.agents?.count ?? 0) > options.limits.maxAgents) {
    throw new WorldSimError("RESOURCE_LIMIT", "Run exceeds maxAgents.", {
      requested: spec.agents?.count ?? 0,
      limit: options.limits.maxAgents,
    });
  }

  const worldState = spec.world
    ? initializeStateMap(
        spec.world.state,
        options.seed,
        "init/world",
      )
    : undefined;

  const agents: AgentRuntime[] | undefined = spec.agents
    ? Array.from({ length: spec.agents.count }, (_, id) => ({
        id,
        state: initializeStateMap(
          spec.agents!.state,
          options.seed,
          `init/agent/${id}`,
        ),
      }))
    : undefined;

  let t = 0;
  let emittedEvents = 0;
  const traceRecords: TraceRecord[] = [];
  const traceEnabled = options.trace?.enabled === true;

  function step(): StepResult {
    if (t >= targetSteps) {
      throw new WorldSimError("RUN_COMPLETE", "Simulation is already complete.");
    }

    let triggeredEvents = 0;

    for (const event of compiled.events) {
      if (event.scope === "world") {
        if (
          runEvent(event, undefined, `event/${t}/${event.id}/world`)
        ) {
          triggeredEvents += 1;
        }
        continue;
      }

      for (const agent of agents ?? []) {
        if (
          runEvent(
            event,
            agent,
            `event/${t}/${event.id}/agent/${agent.id}`,
          )
        ) {
          triggeredEvents += 1;
        }
      }
    }

    t += 1;
    return {
      t,
      status: t >= targetSteps ? "completed" : "running",
      triggeredEvents,
    };
  }

  function runEvent(
    event: CompiledEvent,
    agent: AgentRuntime | undefined,
    coordinate: string,
  ): boolean {
    const context = {
      tick: t,
      agent: agent?.state,
      world: worldState,
      param: parameters,
    };

    if (event.conditionExpression) {
      const condition = evaluateExpression(event.conditionExpression, context);
      if (typeof condition !== "boolean") {
        throw new WorldSimError(
          "EXPRESSION_ERROR",
          `Event '${event.id}' condition did not produce boolean.`,
        );
      }
      if (!condition) return false;
    }

    let chance = 1;
    if (typeof event.chance === "number") {
      chance = event.chance;
    } else if (event.chanceExpression) {
      const resolved = evaluateExpression(event.chanceExpression, context);
      if (typeof resolved !== "number") {
        throw new WorldSimError(
          "EXPRESSION_ERROR",
          `Event '${event.id}' chance did not produce number.`,
        );
      }
      chance = resolved;
    }

    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      throw new WorldSimError(
        "NUMERIC_ERROR",
        `Event '${event.id}' chance resolved outside [0, 1].`,
        { chance },
      );
    }

    if (chance < 1 && random01(options.seed, coordinate) >= chance) {
      return false;
    }

    emittedEvents += 1;
    if (emittedEvents > options.limits.maxEvents) {
      throw new WorldSimError("RESOURCE_LIMIT", "Run exceeds maxEvents.", {
        limit: options.limits.maxEvents,
      });
    }

    const traceEffects: TraceEffect[] = [];

    for (const effect of event.effects) {
      const targetState = event.scope === "agent" ? agent!.state : worldState!;
      const fieldName = effect.target.slice(effect.target.indexOf(".") + 1);
      const before = targetState[fieldName];
      if (before === undefined) {
        throw new WorldSimError(
          "SEMANTIC_ERROR",
          `Effect target '${effect.target}' is missing at runtime.`,
        );
      }

      const value = effect.expression
        ? evaluateExpression(effect.expression, {
            tick: t,
            agent: agent?.state,
            world: worldState,
            param: parameters,
          })
        : (effect.value as Scalar);

      const after = applyEffect(effect.op, before, value, effect.target);
      targetState[fieldName] = after;

      if (traceEnabled) {
        traceEffects.push({
          target: effect.target,
          before,
          after,
        });
      }
    }

    if (traceEnabled) {
      if (traceRecords.length >= options.limits.maxTraceRecords) {
        throw new WorldSimError(
          "RESOURCE_LIMIT",
          "Run exceeds maxTraceRecords.",
          { limit: options.limits.maxTraceRecords },
        );
      }
      traceRecords.push({
        t,
        eventId: event.id,
        scope: event.scope,
        ...(agent ? { agentId: agent.id } : {}),
        effects: traceEffects,
      });
    }

    return true;
  }

  return {
    seed: options.seed >>> 0,
    parameters: Object.freeze({ ...parameters }),
    targetSteps,
    step,
    snapshot: () => makeSnapshot(t, worldState, agents),
    metrics: () => computeMetrics(t, compiled.observers, worldState, agents, parameters),
    trace: () => traceRecords.map((record) => ({
      ...record,
      effects: record.effects.map((effect) => ({ ...effect })),
    })),
    status: () => (t >= targetSteps ? "completed" : "running"),
  };
}

function initializeStateMap(
  fields: Record<string, StateField>,
  seed: number,
  coordinateBase: string,
): Record<string, Scalar> {
  const state: Record<string, Scalar> = Object.create(null);

  for (const name of Object.keys(fields).sort()) {
    const field = fields[name]!;
    state[name] = initializeField(field, seed, `${coordinateBase}/${name}`);
  }

  return state;
}

function initializeField(
  field: StateField,
  seed: number,
  coordinate: string,
): Scalar {
  if (typeof field.init === "number" || typeof field.init === "boolean") {
    return field.init;
  }

  if (field.init.distribution === "uniform") {
    const u = random01(seed, coordinate);
    return field.init.min + (field.init.max - field.init.min) * u;
  }

  if (field.init.distribution === "normal") {
    let value = field.init.mean + field.init.sd * normal01(seed, coordinate);
    if (field.init.clamp) {
      value = Math.min(field.init.clamp[1], Math.max(field.init.clamp[0], value));
    }
    return finite(value);
  }

  return random01(seed, coordinate) < field.init.p;
}

function resolveParameters(
  definitions: Record<
    string,
    { type: "number"; default: number; min?: number; max?: number } |
    { type: "boolean"; default: boolean }
  >,
  overrides: Record<string, Scalar>,
): Record<string, Scalar> {
  const result: Record<string, Scalar> = Object.create(null);

  for (const key of Object.keys(overrides)) {
    if (!(key in definitions)) {
      throw new WorldSimError(
        "SEMANTIC_ERROR",
        `Unknown parameter override '${key}'.`,
      );
    }
  }

  for (const [name, definition] of Object.entries(definitions)) {
    const value = overrides[name] ?? definition.default;

    if (definition.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new WorldSimError(
          "SEMANTIC_ERROR",
          `Parameter '${name}' requires boolean.`,
        );
      }
      result[name] = value;
      continue;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new WorldSimError(
        "SEMANTIC_ERROR",
        `Parameter '${name}' requires finite number.`,
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
    result[name] = value;
  }

  return result;
}

function applyEffect(
  op: "set" | "add" | "multiply",
  before: Scalar,
  value: Scalar,
  target: string,
): Scalar {
  if (op === "set") {
    if (typeof before !== typeof value) {
      throw new WorldSimError(
        "SEMANTIC_ERROR",
        `Effect '${target}' set value has wrong type.`,
      );
    }
    return typeof value === "number" ? finite(value) : value;
  }

  if (typeof before !== "number" || typeof value !== "number") {
    throw new WorldSimError(
      "SEMANTIC_ERROR",
      `Effect '${target}' ${op} requires numbers.`,
    );
  }

  return finite(op === "add" ? before + value : before * value);
}

function makeSnapshot(
  t: number,
  worldState?: Record<string, Scalar>,
  agents?: AgentRuntime[],
): SimulationSnapshot {
  return {
    t,
    ...(worldState ? { world: { ...worldState } } : {}),
    ...(agents
      ? {
          agents: agents.map((agent) => ({
            id: agent.id,
            state: { ...agent.state },
          })),
        }
      : {}),
  };
}

function computeMetrics(
  t: number,
  observers: CompiledObserver[],
  worldState: Record<string, Scalar> | undefined,
  agents: AgentRuntime[] | undefined,
  parameters: Record<string, Scalar>,
): MetricsResult {
  const values: Record<string, unknown> = Object.create(null);

  for (const observer of observers) {
    switch (observer.type) {
      case "value": {
        const field = observer.source!.slice("world.".length);
        values[observer.id] = worldState![field];
        break;
      }

      case "count": {
        if (!observer.conditionExpression) {
          values[observer.id] = agents?.length ?? 0;
          break;
        }
        let count = 0;
        for (const agent of agents ?? []) {
          const result = evaluateExpression(observer.conditionExpression, {
            tick: t,
            agent: agent.state,
            world: worldState,
            param: parameters,
          });
          if (typeof result !== "boolean") {
            throw new WorldSimError(
              "EXPRESSION_ERROR",
              `Observer '${observer.id}' condition is not boolean.`,
            );
          }
          if (result) count += 1;
        }
        values[observer.id] = count;
        break;
      }

      case "correlation": {
        const xs = numericAgentField(agents, observer.x!);
        const ys = numericAgentField(agents, observer.y!);
        values[observer.id] = correlation(xs, ys);
        break;
      }

      default: {
        const data = numericAgentField(agents, observer.source!);
        if (observer.type === "mean") values[observer.id] = mean(data);
        else if (observer.type === "min") values[observer.id] = Math.min(...data);
        else if (observer.type === "max") values[observer.id] = Math.max(...data);
        else if (observer.type === "gini") values[observer.id] = gini(data);
        else if (observer.type === "percentile") {
          values[observer.id] = percentile(data, observer.q!);
        } else if (observer.type === "histogram") {
          values[observer.id] = histogram(data, observer.bins!);
        }
      }
    }
  }

  return { t, values };
}

function numericAgentField(
  agents: AgentRuntime[] | undefined,
  reference: string,
): number[] {
  const field = reference.slice("agent.".length);
  const values = (agents ?? []).map((agent) => agent.state[field]);
  if (values.length === 0 || values.some((value) => typeof value !== "number")) {
    throw new WorldSimError(
      "SEMANTIC_ERROR",
      `Observer source '${reference}' is not numeric agent data.`,
    );
  }
  return values as number[];
}

function mean(values: number[]): number {
  return finite(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return finite(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
}

function gini(values: number[]): number {
  if (values.some((value) => value < 0)) {
    throw new WorldSimError(
      "NUMERIC_ERROR",
      "v0.1 gini observer does not accept negative values.",
    );
  }

  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;

  let weighted = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    weighted += (i + 1) * sorted[i]!;
  }

  return finite((2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length);
}

function correlation(xs: number[], ys: number[]): number {
  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }

  const denominator = Math.sqrt(sumX * sumY);
  if (denominator === 0) return 0;
  return finite(numerator / denominator);
}

function histogram(
  values: number[],
  binCount: number,
): { min: number; max: number; bins: number[]; counts: number[] } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return {
      min,
      max,
      bins: [min, max],
      counts: [values.length],
    };
  }

  const width = (max - min) / binCount;
  const counts = Array.from({ length: binCount }, () => 0);
  for (const value of values) {
    const index = Math.min(
      binCount - 1,
      Math.floor((value - min) / width),
    );
    counts[index] = counts[index]! + 1;
  }

  return {
    min,
    max,
    bins: Array.from({ length: binCount + 1 }, (_, index) =>
      finite(min + width * index),
    ),
    counts,
  };
}

function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new WorldSimError(
      "SCHEMA_ERROR",
      "seed must be an unsigned 32-bit integer.",
    );
  }
}

function finite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new WorldSimError(
      "NUMERIC_ERROR",
      "Simulation produced non-finite number.",
    );
  }
  return value;
}
