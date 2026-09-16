import { WorldSimError } from "../errors.js";
import {
  collectReferences,
  parseExpression,
  type ExpressionNode,
  type Scalar,
} from "./expression.js";
import { canonicalJson, sha256Hex } from "./hash.js";
import { parseRestrictedYaml } from "./yaml.js";

export interface ResourceLimits {
  maxAgents: number;
  maxSteps: number;
  maxEvents: number;
  maxTraceRecords: number;
  maxRuns?: number;
}

export interface NumberParameter {
  type: "number";
  default: number;
  min?: number;
  max?: number;
}

export interface BooleanParameter {
  type: "boolean";
  default: boolean;
}

export type ParameterDefinition = NumberParameter | BooleanParameter;

export interface UniformDistribution {
  distribution: "uniform";
  min: number;
  max: number;
}

export interface NormalDistribution {
  distribution: "normal";
  mean: number;
  sd: number;
  clamp?: [number, number];
}

export interface BernoulliDistribution {
  distribution: "bernoulli";
  p: number;
}

export type NumberInit = number | UniformDistribution | NormalDistribution;
export type BooleanInit = boolean | BernoulliDistribution;

export interface NumberStateField {
  type: "number";
  mutable?: boolean;
  init: NumberInit;
}

export interface BooleanStateField {
  type: "boolean";
  mutable?: boolean;
  init: BooleanInit;
}

export type StateField = NumberStateField | BooleanStateField;
export type StateMap = Record<string, StateField>;

export interface EffectDefinition {
  target: string;
  op: "set" | "add" | "multiply";
  value: Scalar | string;
}

export interface EventDefinition {
  id: string;
  scope: "agent" | "world";
  condition?: string;
  chance?: number | string;
  effects: EffectDefinition[];
}

export interface ObserverDefinition {
  id: string;
  type:
    | "value"
    | "count"
    | "mean"
    | "min"
    | "max"
    | "gini"
    | "histogram"
    | "percentile"
    | "correlation";
  source?: string;
  scope?: "agent";
  condition?: string;
  bins?: number;
  q?: number;
  x?: string;
  y?: string;
  record?: "final" | "everyStep";
}

export interface WorldSpec {
  specVersion: "0.1";
  id: string;
  title?: string;
  description?: string;
  parameters?: Record<string, ParameterDefinition>;
  time: {
    steps: number;
    label?: string;
  };
  world?: {
    state: StateMap;
  };
  agents?: {
    count: number;
    state: StateMap;
  };
  events: EventDefinition[];
  observers: ObserverDefinition[];
}

export interface CompiledEffect extends EffectDefinition {
  expression?: ExpressionNode;
}

export interface CompiledEvent extends EventDefinition {
  conditionExpression?: ExpressionNode;
  chanceExpression?: ExpressionNode;
  effects: CompiledEffect[];
}

export interface CompiledObserver extends ObserverDefinition {
  conditionExpression?: ExpressionNode;
}

export interface CompiledWorld {
  spec: WorldSpec;
  events: CompiledEvent[];
  observers: CompiledObserver[];
  specHash: string;
}

const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DANGEROUS_NAMES = new Set(["__proto__", "prototype", "constructor"]);

export function parseWorld(
  source: string,
  options: { format: "yaml" | "json" },
): unknown {
  if (options.format === "yaml") return parseRestrictedYaml(source);

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new WorldSimError("PARSE_ERROR", "Invalid JSON world spec.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function validateWorld(
  value: unknown,
  options: { limits: ResourceLimits },
): WorldSpec {
  assertRecord(value, "world spec");
  rejectUnknownKeys(
    value,
    [
      "specVersion",
      "id",
      "title",
      "description",
      "parameters",
      "time",
      "world",
      "agents",
      "events",
      "observers",
    ],
    "world spec",
  );

  if (value.specVersion !== "0.1") {
    schemaError("specVersion must be '0.1'.");
  }
  assertIdentifier(value.id, "world id");

  if (value.title !== undefined) assertString(value.title, "title");
  if (value.description !== undefined) {
    assertString(value.description, "description");
  }

  const parameters = validateParameters(value.parameters);
  const time = validateTime(value.time, options.limits);

  const world = value.world === undefined ? undefined : validateWorldState(value.world);
  const agents =
    value.agents === undefined
      ? undefined
      : validateAgents(value.agents, options.limits);

  if (!world && !agents) {
    schemaError("At least one of world or agents must be present.");
  }

  const events = validateEvents(value.events, {
    parameters,
    worldState: world?.state,
    agentState: agents?.state,
  });

  const observers = validateObservers(value.observers, {
    parameters,
    worldState: world?.state,
    agentState: agents?.state,
  });

  return {
    specVersion: "0.1",
    id: value.id as string,
    ...(value.title === undefined ? {} : { title: value.title as string }),
    ...(value.description === undefined
      ? {}
      : { description: value.description as string }),
    ...(Object.keys(parameters).length === 0 ? {} : { parameters }),
    time,
    ...(world ? { world } : {}),
    ...(agents ? { agents } : {}),
    events,
    observers,
  };
}

export function compileWorld(spec: WorldSpec): CompiledWorld {
  const events = spec.events.map<CompiledEvent>((event) => ({
    ...event,
    ...(event.condition
      ? { conditionExpression: parseExpression(event.condition) }
      : {}),
    ...(typeof event.chance === "string"
      ? { chanceExpression: parseExpression(event.chance) }
      : {}),
    effects: event.effects.map((effect) => ({
      ...effect,
      ...(typeof effect.value === "string"
        ? { expression: parseExpression(effect.value) }
        : {}),
    })),
  }));

  const observers = spec.observers.map<CompiledObserver>((observer) => ({
    ...observer,
    ...(observer.condition
      ? { conditionExpression: parseExpression(observer.condition) }
      : {}),
  }));

  return {
    spec,
    events,
    observers,
    specHash: `sha256:${sha256Hex(canonicalJson(spec))}`,
  };
}

function validateParameters(
  value: unknown,
): Record<string, ParameterDefinition> {
  if (value === undefined) return Object.create(null);
  assertRecord(value, "parameters");

  const result: Record<string, ParameterDefinition> = Object.create(null);

  for (const [name, raw] of Object.entries(value)) {
    assertSafeName(name, "parameter");
    assertRecord(raw, `parameter '${name}'`);

    if (raw.type === "number") {
      rejectUnknownKeys(raw, ["type", "default", "min", "max"], `parameter '${name}'`);
      assertFiniteNumber(raw.default, `parameter '${name}'.default`);
      if (raw.min !== undefined) assertFiniteNumber(raw.min, `parameter '${name}'.min`);
      if (raw.max !== undefined) assertFiniteNumber(raw.max, `parameter '${name}'.max`);
      if (
        raw.min !== undefined &&
        raw.max !== undefined &&
        (raw.min as number) > (raw.max as number)
      ) {
        schemaError(`parameter '${name}' min exceeds max.`);
      }
      if (
        raw.min !== undefined &&
        (raw.default as number) < (raw.min as number)
      ) {
        schemaError(`parameter '${name}' default is below min.`);
      }
      if (
        raw.max !== undefined &&
        (raw.default as number) > (raw.max as number)
      ) {
        schemaError(`parameter '${name}' default exceeds max.`);
      }
      result[name] = {
        type: "number",
        default: raw.default as number,
        ...(raw.min === undefined ? {} : { min: raw.min as number }),
        ...(raw.max === undefined ? {} : { max: raw.max as number }),
      };
      continue;
    }

    if (raw.type === "boolean") {
      rejectUnknownKeys(raw, ["type", "default"], `parameter '${name}'`);
      if (typeof raw.default !== "boolean") {
        schemaError(`parameter '${name}'.default must be boolean.`);
      }
      result[name] = { type: "boolean", default: raw.default as boolean };
      continue;
    }

    schemaError(`parameter '${name}' has unsupported type.`);
  }

  return result;
}

function validateTime(
  value: unknown,
  limits: ResourceLimits,
): WorldSpec["time"] {
  assertRecord(value, "time");
  rejectUnknownKeys(value, ["steps", "label"], "time");
  assertPositiveInteger(value.steps, "time.steps");
  if ((value.steps as number) > limits.maxSteps) {
    resourceError("World step count exceeds maxSteps.", {
      requested: value.steps,
      limit: limits.maxSteps,
    });
  }
  if (value.label !== undefined) assertString(value.label, "time.label");
  return {
    steps: value.steps as number,
    ...(value.label === undefined ? {} : { label: value.label as string }),
  };
}

function validateWorldState(value: unknown): NonNullable<WorldSpec["world"]> {
  assertRecord(value, "world");
  rejectUnknownKeys(value, ["state"], "world");
  return { state: validateStateMap(value.state, "world.state") };
}

function validateAgents(
  value: unknown,
  limits: ResourceLimits,
): NonNullable<WorldSpec["agents"]> {
  assertRecord(value, "agents");
  rejectUnknownKeys(value, ["count", "state"], "agents");
  assertPositiveInteger(value.count, "agents.count");
  if ((value.count as number) > limits.maxAgents) {
    resourceError("Agent count exceeds maxAgents.", {
      requested: value.count,
      limit: limits.maxAgents,
    });
  }
  return {
    count: value.count as number,
    state: validateStateMap(value.state, "agents.state"),
  };
}

function validateStateMap(value: unknown, path: string): StateMap {
  assertRecord(value, path);
  const result: StateMap = Object.create(null);

  for (const [name, raw] of Object.entries(value)) {
    assertSafeName(name, "state field");
    assertRecord(raw, `${path}.${name}`);
    rejectUnknownKeys(raw, ["type", "mutable", "init"], `${path}.${name}`);

    if (raw.mutable !== undefined && typeof raw.mutable !== "boolean") {
      schemaError(`${path}.${name}.mutable must be boolean.`);
    }

    if (raw.type === "number") {
      result[name] = {
        type: "number",
        ...(raw.mutable === undefined ? {} : { mutable: raw.mutable as boolean }),
        init: validateNumberInit(raw.init, `${path}.${name}.init`),
      };
      continue;
    }

    if (raw.type === "boolean") {
      result[name] = {
        type: "boolean",
        ...(raw.mutable === undefined ? {} : { mutable: raw.mutable as boolean }),
        init: validateBooleanInit(raw.init, `${path}.${name}.init`),
      };
      continue;
    }

    schemaError(`${path}.${name}.type must be number or boolean.`);
  }

  return result;
}

function validateNumberInit(value: unknown, path: string): NumberInit {
  if (typeof value === "number") {
    assertFiniteNumber(value, path);
    return value;
  }

  assertRecord(value, path);

  if (value.distribution === "uniform") {
    rejectUnknownKeys(value, ["distribution", "min", "max"], path);
    assertFiniteNumber(value.min, `${path}.min`);
    assertFiniteNumber(value.max, `${path}.max`);
    if ((value.min as number) > (value.max as number)) {
      schemaError(`${path}.min exceeds max.`);
    }
    return {
      distribution: "uniform",
      min: value.min as number,
      max: value.max as number,
    };
  }

  if (value.distribution === "normal") {
    rejectUnknownKeys(value, ["distribution", "mean", "sd", "clamp"], path);
    assertFiniteNumber(value.mean, `${path}.mean`);
    assertFiniteNumber(value.sd, `${path}.sd`);
    if ((value.sd as number) <= 0) {
      schemaError(`${path}.sd must be > 0.`);
    }

    let clamp: [number, number] | undefined;
    if (value.clamp !== undefined) {
      if (
        !Array.isArray(value.clamp) ||
        value.clamp.length !== 2 ||
        typeof value.clamp[0] !== "number" ||
        typeof value.clamp[1] !== "number" ||
        !Number.isFinite(value.clamp[0]) ||
        !Number.isFinite(value.clamp[1])
      ) {
        schemaError(`${path}.clamp must be [number, number].`);
      }
      if (value.clamp[0] > value.clamp[1]) {
        schemaError(`${path}.clamp lower bound exceeds upper bound.`);
      }
      clamp = [value.clamp[0], value.clamp[1]];
    }

    return {
      distribution: "normal",
      mean: value.mean as number,
      sd: value.sd as number,
      ...(clamp ? { clamp } : {}),
    };
  }

  schemaError(`${path} has unsupported distribution.`);
}

function validateBooleanInit(value: unknown, path: string): BooleanInit {
  if (typeof value === "boolean") return value;
  assertRecord(value, path);

  if (value.distribution !== "bernoulli") {
    schemaError(`${path} must be boolean or bernoulli distribution.`);
  }
  rejectUnknownKeys(value, ["distribution", "p"], path);
  assertProbability(value.p, `${path}.p`);
  return { distribution: "bernoulli", p: value.p as number };
}

interface ValidationContext {
  parameters: Record<string, ParameterDefinition>;
  worldState?: StateMap;
  agentState?: StateMap;
}

function validateEvents(
  value: unknown,
  context: ValidationContext,
): EventDefinition[] {
  if (!Array.isArray(value)) schemaError("events must be an array.");

  const ids = new Set<string>();
  return value.map((raw, index) => {
    assertRecord(raw, `events[${index}]`);
    rejectUnknownKeys(
      raw,
      ["id", "scope", "condition", "chance", "effects"],
      `events[${index}]`,
    );
    assertIdentifier(raw.id, `events[${index}].id`);
    if (ids.has(raw.id as string)) {
      semanticError(`Duplicate event id '${raw.id as string}'.`);
    }
    ids.add(raw.id as string);

    if (raw.scope !== "agent" && raw.scope !== "world") {
      schemaError(`events[${index}].scope must be agent or world.`);
    }

    if (raw.scope === "agent" && !context.agentState) {
      semanticError(`Agent event '${raw.id as string}' requires agents.`);
    }
    if (raw.scope === "world" && !context.worldState) {
      semanticError(`World event '${raw.id as string}' requires world state.`);
    }

    if (raw.condition !== undefined) {
      assertString(raw.condition, `events[${index}].condition`);
      validateExpressionReferences(
        raw.condition as string,
        raw.scope as "agent" | "world",
        context,
      );
    }

    if (raw.chance !== undefined) {
      if (typeof raw.chance === "number") {
        assertProbability(raw.chance, `events[${index}].chance`);
      } else {
        assertString(raw.chance, `events[${index}].chance`);
        validateExpressionReferences(
          raw.chance as string,
          raw.scope as "agent" | "world",
          context,
        );
      }
    }

    if (!Array.isArray(raw.effects) || raw.effects.length === 0) {
      schemaError(`events[${index}].effects must be a non-empty array.`);
    }

    const effects = raw.effects.map((effectRaw, effectIndex) =>
      validateEffect(
        effectRaw,
        raw.scope as "agent" | "world",
        context,
        `events[${index}].effects[${effectIndex}]`,
      ),
    );

    return {
      id: raw.id as string,
      scope: raw.scope as "agent" | "world",
      ...(raw.condition === undefined
        ? {}
        : { condition: raw.condition as string }),
      ...(raw.chance === undefined
        ? {}
        : { chance: raw.chance as number | string }),
      effects,
    };
  });
}

function validateEffect(
  value: unknown,
  scope: "agent" | "world",
  context: ValidationContext,
  path: string,
): EffectDefinition {
  assertRecord(value, path);
  rejectUnknownKeys(value, ["target", "op", "value"], path);
  assertString(value.target, `${path}.target`);

  if (value.op !== "set" && value.op !== "add" && value.op !== "multiply") {
    schemaError(`${path}.op is unsupported.`);
  }

  const target = resolveStateReference(value.target as string, context);
  if (scope === "agent" && target.root !== "agent") {
    semanticError("Agent events may mutate only current agent state.");
  }
  if (scope === "world" && target.root !== "world") {
    semanticError("World events may mutate only world state.");
  }
  if (target.field.mutable !== true) {
    semanticError(`Effect target '${value.target as string}' is immutable.`);
  }
  if (
    (value.op === "add" || value.op === "multiply") &&
    target.field.type !== "number"
  ) {
    semanticError(`${value.op as string} requires a numeric target.`);
  }

  if (
    typeof value.value !== "string" &&
    typeof value.value !== "number" &&
    typeof value.value !== "boolean"
  ) {
    schemaError(`${path}.value must be scalar or expression string.`);
  }

  if (typeof value.value === "number") {
    assertFiniteNumber(value.value, `${path}.value`);
  }

  if (typeof value.value === "string") {
    validateExpressionReferences(value.value, scope, context);
  } else if (value.op === "set" && typeof value.value !== target.field.type) {
    semanticError(`${path}.value type does not match target.`);
  }

  return {
    target: value.target as string,
    op: value.op as "set" | "add" | "multiply",
    value: value.value as Scalar | string,
  };
}

function validateObservers(
  value: unknown,
  context: ValidationContext,
): ObserverDefinition[] {
  if (!Array.isArray(value)) schemaError("observers must be an array.");

  const ids = new Set<string>();
  return value.map((raw, index) => {
    assertRecord(raw, `observers[${index}]`);
    rejectUnknownKeys(
      raw,
      ["id", "type", "source", "scope", "condition", "bins", "q", "x", "y", "record"],
      `observers[${index}]`,
    );
    assertIdentifier(raw.id, `observers[${index}].id`);
    if (ids.has(raw.id as string)) {
      semanticError(`Duplicate observer id '${raw.id as string}'.`);
    }
    ids.add(raw.id as string);

    if (
      ![
        "value",
        "count",
        "mean",
        "min",
        "max",
        "gini",
        "histogram",
        "percentile",
        "correlation",
      ].includes(raw.type as string)
    ) {
      schemaError(`observers[${index}].type is unsupported.`);
    }

    if (
      raw.record !== undefined &&
      raw.record !== "final" &&
      raw.record !== "everyStep"
    ) {
      schemaError(`observers[${index}].record is unsupported.`);
    }

    const type = raw.type as ObserverDefinition["type"];

    if (type === "count") {
      if (raw.scope !== "agent" || !context.agentState) {
        semanticError("count observer requires agent scope.");
      }
      if (raw.condition !== undefined) {
        assertString(raw.condition, `observers[${index}].condition`);
        validateExpressionReferences(raw.condition as string, "agent", context);
      }
    } else if (type === "correlation") {
      assertString(raw.x, `observers[${index}].x`);
      assertString(raw.y, `observers[${index}].y`);
      const x = resolveStateReference(raw.x as string, context);
      const y = resolveStateReference(raw.y as string, context);
      if (
        x.root !== "agent" ||
        y.root !== "agent" ||
        x.field.type !== "number" ||
        y.field.type !== "number"
      ) {
        semanticError("correlation requires two numeric agent fields.");
      }
    } else {
      assertString(raw.source, `observers[${index}].source`);
      const source = resolveStateReference(raw.source as string, context);

      if (type === "value" && source.root !== "world") {
        semanticError("value observer currently requires world state.");
      }

      if (
        ["mean", "min", "max", "gini", "histogram", "percentile"].includes(type) &&
        (source.root !== "agent" || source.field.type !== "number")
      ) {
        semanticError(`${type} observer requires a numeric agent field.`);
      }

      if (type === "histogram") {
        assertPositiveInteger(raw.bins, `observers[${index}].bins`);
      }
      if (type === "percentile") {
        assertProbability(raw.q, `observers[${index}].q`);
      }
    }

    return {
      id: raw.id as string,
      type,
      ...(raw.source === undefined ? {} : { source: raw.source as string }),
      ...(raw.scope === undefined ? {} : { scope: raw.scope as "agent" }),
      ...(raw.condition === undefined
        ? {}
        : { condition: raw.condition as string }),
      ...(raw.bins === undefined ? {} : { bins: raw.bins as number }),
      ...(raw.q === undefined ? {} : { q: raw.q as number }),
      ...(raw.x === undefined ? {} : { x: raw.x as string }),
      ...(raw.y === undefined ? {} : { y: raw.y as string }),
      ...(raw.record === undefined
        ? {}
        : { record: raw.record as "final" | "everyStep" }),
    };
  });
}

function validateExpressionReferences(
  expression: string,
  scope: "agent" | "world",
  context: ValidationContext,
): void {
  const ast = parseExpression(expression);

  for (const ref of collectReferences(ast)) {
    if (ref === "tick") continue;

    const [root, name] = ref.split(".");
    if (!root || !name) semanticError(`Invalid expression reference '${ref}'.`);

    if (root === "param") {
      if (!(name in context.parameters)) {
        semanticError(`Unknown parameter reference '${ref}'.`);
      }
      continue;
    }

    if (root === "agent") {
      if (scope !== "agent") {
        semanticError(`World-scope expression cannot read '${ref}'.`);
      }
      if (!context.agentState || !(name in context.agentState)) {
        semanticError(`Unknown agent reference '${ref}'.`);
      }
      continue;
    }

    if (root === "world") {
      if (!context.worldState || !(name in context.worldState)) {
        semanticError(`Unknown world reference '${ref}'.`);
      }
      continue;
    }

    semanticError(`Reference root '${root}' is not allowed.`);
  }
}

function resolveStateReference(
  reference: string,
  context: ValidationContext,
): { root: "agent" | "world"; name: string; field: StateField } {
  if (!/^(agent|world)\.[A-Za-z_][A-Za-z0-9_]*$/.test(reference)) {
    semanticError(`Invalid state reference '${reference}'.`);
  }

  const [root, name] = reference.split(".") as ["agent" | "world", string];
  assertSafeName(name, "state reference");

  const state = root === "agent" ? context.agentState : context.worldState;
  if (!state || !(name in state)) {
    semanticError(`Unknown state reference '${reference}'.`);
  }

  return { root, name, field: state[name]! };
}

function assertRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    schemaError(`${path} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (DANGEROUS_NAMES.has(key)) {
      semanticError(`Dangerous key '${key}' is not allowed in ${path}.`);
    }
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      schemaError(`Unknown field '${path}.${key}'.`);
    }
  }
}

function assertIdentifier(value: unknown, path: string): void {
  assertString(value, path);
  if (!ID_PATTERN.test(value as string) || DANGEROUS_NAMES.has(value as string)) {
    schemaError(`${path} is not a valid identifier.`);
  }
}

function assertSafeName(value: string, kind: string): void {
  if (!NAME_PATTERN.test(value) || DANGEROUS_NAMES.has(value)) {
    semanticError(`Invalid ${kind} name '${value}'.`);
  }
}

function assertString(value: unknown, path: string): void {
  if (typeof value !== "string" || value.length === 0) {
    schemaError(`${path} must be a non-empty string.`);
  }
}

function assertFiniteNumber(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    schemaError(`${path} must be a finite number.`);
  }
}

function assertProbability(value: unknown, path: string): void {
  assertFiniteNumber(value, path);
  if ((value as number) < 0 || (value as number) > 1) {
    schemaError(`${path} must be in [0, 1].`);
  }
}

function assertPositiveInteger(value: unknown, path: string): void {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    schemaError(`${path} must be a positive integer.`);
  }
}

function schemaError(message: string): never {
  throw new WorldSimError("SCHEMA_ERROR", message);
}

function semanticError(message: string): never {
  throw new WorldSimError("SEMANTIC_ERROR", message);
}

function resourceError(
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new WorldSimError("RESOURCE_LIMIT", message, details);
}

export { canonicalJson, sha256Hex } from "./hash.js";
export { parseExpression, evaluateExpression } from "./expression.js";
