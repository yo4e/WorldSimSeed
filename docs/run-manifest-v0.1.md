# Run manifest v0.1 draft

Status: design draft for Issue #2  
World format: [world-spec-v0.1.md](world-spec-v0.1.md)

## Purpose

WorldSimSeed separates two related concepts:

1. an **experiment request**, which asks the engine to run one or more parameter/seed combinations,
2. a **run manifest**, which is the resolved immutable provenance record for one actual run.

The distinction prevents a human-authored request from pretending to know implementation-resolved facts such as the exact engine version or canonical spec hash.

## Experiment request

An experiment request is optional. A host application may construct the same request programmatically.

Example:

```yaml
experimentVersion: "0.1"
world: ./talent-luck.world.yaml

parameters:
  opportunityRate: [0.05, 0.10, 0.15]

runs:
  seeds:
    base: 42
    count: 100

trace:
  mode: selected
  seeds: [42, 43]

limits:
  maxAgents: 5000
  maxSteps: 500
  maxRuns: 1000
  maxEvents: 1000000
  maxTraceRecords: 100000
```

### Parameter matrix

A list-valued parameter in `parameters` defines alternatives.

The experiment runner expands parameter alternatives as a Cartesian product.

A scalar value fixes that parameter to one value.

Only declared world-spec parameters may be overridden.

### Seed set

v0.1 accepts either an explicit list:

```yaml
runs:
  seeds: [1, 7, 42]
```

or a contiguous sequence:

```yaml
runs:
  seeds:
    base: 42
    count: 100
```

Sequence derivation is:

```text
seed[i] = base + i
```

The request is invalid if any derived seed exceeds `4294967295`.

No implicit time-based seed exists in reproducible experiment mode.

Interactive hosts may offer a "random seed" button, but they must resolve it to a concrete uint32 before execution and record that value.

### Step override

An experiment request may optionally request a smaller/equal number of steps:

```yaml
steps: 40
```

The resolved value may not exceed the world's declared `time.steps` in v0.1.

### Trace policy

Trace is intentionally not collected for every batch run by default.

Modes:

- `none`
- `selected`

For `selected`, an explicit seed list identifies runs whose event trace/state snapshots may be retained.

A future version may add predicate-based outlier tracing, but v0.1 keeps the request deterministic and simple.

### Resource limits

The experiment request may lower host limits.

It cannot raise them above limits granted by the embedding host/runtime.

The effective limit is the stricter value.

## Run manifest

Each actual run emits a resolved manifest.

Conceptual example:

```yaml
manifestVersion: "0.1"

engine:
  name: WorldSimSeed
  version: 0.1.0
  randomModel: keyed-v1

world:
  id: talent-luck
  specVersion: "0.1"
  specHash: sha256:...

seed: 42
steps: 80

parameters:
  opportunityRate: 0.10
  misfortuneRate: 0.10

observers:
  - mean_wealth
  - wealth_gini
  - talent_wealth_correlation
  - wealth_histogram

trace:
  enabled: true

limits:
  maxAgents: 5000
  maxSteps: 500
  maxRuns: 1000
  maxEvents: 1000000
  maxTraceRecords: 100000

result:
  status: completed

provenance:
  timestamp: "2026-09-16T00:00:00Z"
```

Required resolved information:

- engine name/version,
- random model identifier,
- world ID,
- world-spec version,
- canonical spec hash,
- concrete uint32 seed,
- concrete step count,
- fully resolved parameter values,
- observer IDs/configuration,
- trace configuration,
- effective resource limits,
- terminal result status.

A timestamp is provenance only and is excluded from simulation semantics.

## Failed or limited runs

A run that stops because of validation, numeric, cancellation, or resource-limit failure must not be represented as a normal completed run.

Example status values:

- `completed`
- `validation_error`
- `numeric_error`
- `resource_limit`
- `cancelled`

The manifest should include a structured error code and safe diagnostic metadata when status is not `completed`.

Partial observer data may be retained for diagnostics, but must be clearly marked partial.

## Batch result index

A batch experiment should produce a small aggregate index that references the individual run manifests and aggregate observer summaries.

The index is not a replacement for per-run provenance.

For a matrix of 3 parameter sets × 100 seeds, the batch contains 300 resolved runs and therefore 300 run manifests, even if stored compactly.

## Browser/headless acceptance rule

Given:

- the same engine version,
- the same canonical world spec,
- the same resolved parameters,
- the same seed,
- the same step count,
- the same observer configuration,

browser and headless builds must produce the same deterministic acceptance summary.

Presentation formatting may differ. The underlying numeric/result data may not.
