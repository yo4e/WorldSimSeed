# World spec v0.1 draft

Status: design draft for Issue #2  
Security boundary: [security-model.md](security-model.md)

## Purpose

WorldSimSeed v0.1 describes small stochastic worlds as **data**, not executable host code.

The format is designed to be:

- readable and editable by humans and AI systems,
- schema-validatable before execution,
- deterministic when the same engine version, resolved spec, parameters, and seed are used,
- portable between browser and headless runtimes,
- small enough that unsupported behavior is rejected instead of silently interpreted.

This document defines the v0.1 authoring contract. It is intentionally not a general-purpose programming language.

## 1. Source format and canonical model

### Authoring format

YAML is the primary human-facing authoring format.

JSON containing the same data model is also valid input.

YAML input is restricted to a small JSON-compatible subset of YAML 1.2:

- block mappings and block sequences,
- flow-style sequences such as `[0, 1]`,
- strings, numbers, booleans, and null,
- indentation in multiples of two spaces,
- no flow-style mappings (`{ key: value }`) in the v0.1 parser,
- no multiline scalar syntax,
- no custom tags,
- no anchors or aliases,
- no merge keys,
- no executable or implementation-specific YAML extensions.

After parsing, the engine validates the resulting JSON-compatible value against the versioned schema and semantic validator.

### Canonical model

The canonical in-memory representation is the parsed JSON-compatible data model, not the original YAML text.

Comments and formatting do not affect simulation behavior.

For provenance, `specHash` should be computed from the canonical parsed model using a stable canonical JSON serialization. The implementation should use one documented canonicalization algorithm consistently across browser and headless runtimes.

## 2. Top-level shape

A v0.1 world may contain:

```yaml
specVersion: "0.1"
id: example-world
title: Example world
description: Optional human-readable description

parameters: {}
time:
  steps: 100

world:
  state: {}

agents:
  count: 1000
  state: {}

events: []
observers: []
```

Required fields:

- `specVersion`
- `id`
- `time`
- `events`
- `observers`

At least one of `world` or `agents` must be present.

Unknown top-level fields are rejected in v0.1.

Identifiers use:

```text
^[A-Za-z_][A-Za-z0-9_-]*$
```

State and parameter names additionally may not be `__proto__`, `prototype`, or `constructor`.

## 3. Parameters

Parameters describe host-overridable scalar inputs.

Example:

```yaml
parameters:
  opportunityRate:
    type: number
    default: 0.10
    min: 0
    max: 1
  enabled:
    type: boolean
    default: true
```

v0.1 parameter types:

- `number`
- `boolean`

The host may override `default`, but may not change the declared type or validation bounds.

Expressions reference parameters as `param.<name>`.

Resolved parameter values are recorded in the run manifest.

## 4. Time

v0.1 uses discrete ticks only.

```yaml
time:
  steps: 80
  label: half-year
```

- `steps` is a positive integer.
- `label` is optional metadata and has no execution semantics.
- Runtime/experiment configuration may request fewer steps than the spec default.
- A host may not run more steps than its active resource limit allows.

Execution state uses:

- `t = 0`: initialized state before any event processing,
- tick `0`: first event-processing tick,
- `t = 1`: state after tick 0,
- ...
- `t = steps`: final state.

## 5. State

### World state

```yaml
world:
  state:
    resource:
      type: number
      mutable: true
      init: 100
```

World state is a single shared record.

### Agent state

```yaml
agents:
  count: 1000
  state:
    talent:
      type: number
      mutable: false
      init:
        distribution: normal
        mean: 0.6
        sd: 0.1
        clamp: [0, 1]

    wealth:
      type: number
      mutable: true
      init: 10
```

Agent IDs are stable integers from `0` through `count - 1`.

v0.1 state types:

- `number`
- `boolean`

A state field is mutable by default only when `mutable: true` is explicitly declared. Omitting `mutable` is equivalent to `false`.

### Initialization

A field may use a literal value or a distribution.

Supported v0.1 distributions:

#### Uniform

```yaml
init:
  distribution: uniform
  min: 0
  max: 1
```

#### Normal

```yaml
init:
  distribution: normal
  mean: 0.6
  sd: 0.1
  clamp: [0, 1]
```

`clamp` is optional and applies after sampling.

#### Bernoulli

```yaml
init:
  distribution: bernoulli
  p: 0.25
```

Bernoulli initializes a boolean field.

Distribution arguments are literals in v0.1. They are not arbitrary expressions.

## 6. Expressions

v0.1 uses a deliberately small expression language.

Expressions are parsed by WorldSimSeed's own restricted parser or an equivalently restricted evaluator. They are never passed to `eval`, `Function`, or a host-language interpreter.

### Available references

Agent-scope expressions may read:

- `agent.<stateName>`
- `world.<stateName>` when world state exists
- `param.<parameterName>`
- `tick`

World-scope expressions may read:

- `world.<stateName>`
- `param.<parameterName>`
- `tick`

No expression may read another agent or enumerate agent collections.

### Operators

Allowed v0.1 operators:

- arithmetic: `+`, `-`, `*`, `/`
- comparison: `<`, `<=`, `>`, `>=`, `==`, `!=`
- boolean: `and`, `or`, `not`
- grouping: parentheses

### Pure functions

Allowed v0.1 functions:

- `min(a, b)`
- `max(a, b)`
- `abs(x)`
- `clamp(x, low, high)`

No random function exists inside expressions.

### Explicitly unsupported

Expressions cannot contain:

- assignment,
- property indexing such as `x[y]`,
- arbitrary property traversal,
- strings,
- arrays or objects,
- user-defined functions,
- loops,
- recursion,
- lambdas,
- method calls,
- dynamic imports,
- regular expressions,
- random-number functions,
- host globals.

### Numeric behavior

All numeric results must be finite.

Division by zero, NaN, Infinity, or an invalid numeric domain terminates the run with a structured numeric error. The engine must not silently coerce such values.

## 7. Randomness

Randomness is declarative.

v0.1 introduces randomness only through:

- initialization distributions,
- event `chance`.

There is no `random()` function in the expression language.

### Root seed

A run seed is an unsigned 32-bit integer:

```text
0 <= seed <= 4294967295
```

### Stable random coordinates

The runtime should derive random draws from the root seed and a stable semantic coordinate rather than relying on incidental object iteration order.

Conceptual coordinates include:

- initialization: `init / agentId / fieldName / drawIndex`
- agent event chance: `event / tick / eventId / agentId`
- world event chance: `event / tick / eventId / world`

The exact keyed PRNG/derivation algorithm belongs to the engine version and must be identical in browser and headless builds of that version.

This design prevents unrelated reordering of YAML mappings from silently shifting the entire random stream.

## 8. Events

Example:

```yaml
events:
  - id: lucky_opportunity
    scope: agent
    condition: "agent.wealth > 0"
    chance: "param.opportunityRate * agent.talent"
    effects:
      - target: agent.wealth
        op: multiply
        value: 2
```

Required event fields:

- `id`
- `scope`: `agent` or `world`
- `effects`

Optional fields:

- `condition`: boolean expression, default `true`
- `chance`: number or numeric expression in `[0, 1]`, default `1`

### Effect operations

v0.1 supports:

- `set`
- `add`
- `multiply`

Example:

```yaml
effects:
  - target: agent.wealth
    op: add
    value: -1

  - target: agent.wealth
    op: set
    value: "max(0, agent.wealth)"
```

Rules:

- the target field must exist and be `mutable: true`,
- `add` and `multiply` require a numeric target,
- `set` must evaluate to the target field's declared type,
- agent events may mutate only the current `agent.*`,
- world events may mutate only `world.*`,
- an agent event may read world state but may not mutate it in v0.1.

This avoids hidden order-dependent races between agents.

### Tick ordering

For each tick:

1. events are processed in the order listed in `events`,
2. a world event runs once,
3. an agent event visits agents in ascending stable agent ID,
4. for each event target, evaluate `condition`,
5. if true, evaluate `chance`,
6. compare the deterministic chance draw to the resolved probability,
7. if triggered, apply effects in listed order immediately.

Later events in the same tick see state changes made by earlier events.

This sequential ordering is part of the v0.1 contract.

## 9. Observers

Observers are declarative, read-only aggregations.

Every observer has an `id` and `type`.

Optional `record` values:

- `final` (default)
- `everyStep`

For `everyStep`, the engine records `t = 0` after initialization and `t = 1..steps` after each completed tick.

### Value

```yaml
- id: resource
  type: value
  source: world.resource
  record: everyStep
```

### Count

```yaml
- id: stressed_count
  type: count
  scope: agent
  condition: "agent.stress >= 0.8"
```

Without `condition`, `count` returns the number of agents.

### Numeric aggregates

Supported:

- `mean`
- `min`
- `max`
- `gini`

Example:

```yaml
- id: mean_wealth
  type: mean
  source: agent.wealth
```

### Histogram

```yaml
- id: wealth_histogram
  type: histogram
  source: agent.wealth
  bins: 20
```

### Percentile

```yaml
- id: p90_wealth
  type: percentile
  source: agent.wealth
  q: 0.90
```

### Correlation

```yaml
- id: talent_wealth_correlation
  type: correlation
  x: agent.talent
  y: agent.wealth
```

v0.1 correlation is defined only for two numeric agent fields with matching population membership.

The exact statistical formulas and edge-case handling must be documented before implementation is considered complete.

## 10. Validation layers

A world must pass all three layers before execution.

### Layer 1: parse

The YAML/JSON source must parse into the allowed JSON-compatible data model.

### Layer 2: schema

The parsed value must match the versioned JSON Schema.

This catches structural/type errors.

### Layer 3: semantic validation

The semantic validator must reject at least:

- unknown state/parameter references,
- duplicate IDs,
- illegal identifier names,
- reserved/dangerous property names,
- expression syntax outside the allowlist,
- type-invalid effects,
- writes to immutable fields,
- scope-invalid reads/writes,
- chance expressions that are statically invalid,
- observer references to incompatible fields,
- agent counts/steps beyond active host limits.

Schema validation alone is not sufficient.

## 11. Reproducibility contract

A run is reproducible only relative to all of:

- engine version,
- world-spec version,
- canonical spec hash,
- resolved parameter values,
- root seed,
- requested steps,
- observer configuration,
- active resource limits that could affect completion.

For the same supported engine version, resolved inputs, and seed, browser and headless execution must produce the same deterministic summary values required by the acceptance fixtures.

A provenance timestamp may be recorded but must never affect results.

See [run-manifest-v0.1.md](run-manifest-v0.1.md).

## 12. Explicit v0.1 non-goals

Not expressible in v0.1:

- agent-to-agent references or networks,
- spatial/GIS models,
- arbitrary JavaScript or Python,
- LLM calls,
- filesystem or network access,
- imports/includes,
- plugins loaded from a spec,
- recursion or user-defined loops,
- real-time wall-clock scheduling,
- continuous-time simulation,
- arbitrary user-defined observers,
- mutation of global world state from per-agent events,
- creation/deletion of agents during a run.

These can be reconsidered only through later versioned spec changes.

## 13. Sample worlds

The draft is stress-tested with three intentionally different examples:

- [Talent vs Luck-style world](../examples/talent-luck.world.yaml)
- [Threshold recovery world](../examples/threshold-recovery.world.yaml)
- [Resource decay world](../examples/resource-decay.world.yaml)

Together they exercise:

- agent and world state,
- constant and sampled initialization,
- agent and world events,
- conditions,
- parameterized chances,
- arithmetic/pure expression functions,
- set/add/multiply effects,
- final aggregates,
- correlation/Gini/histogram/count,
- every-step world observation.

## 14. Acceptance criteria for implementation

A v0.1 implementation is not accepted until:

1. all sample worlds pass schema + semantic validation,
2. invalid references and forbidden expression constructs are rejected before execution,
3. same resolved run + seed produces the same acceptance summary in browser and headless,
4. seed changes alter stochastic worlds,
5. a deterministic world without stochastic constructs is seed-independent,
6. configured resource limits terminate work with structured errors,
7. a run manifest records the resolved reproducibility inputs.
