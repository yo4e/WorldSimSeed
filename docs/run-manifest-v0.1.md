# Run manifest v0.1

Status: release-candidate contract for Issue #16  
World format: [world-spec-v0.1.md](world-spec-v0.1.md)

## Purpose

WorldSimSeed separates two related concepts:

1. an **experiment request**, which asks the engine to run one or more parameter/seed combinations,
2. a **run manifest**, which is the resolved immutable record for one successfully completed run.

The distinction prevents a human-authored request from pretending to know implementation-resolved facts such as the exact engine version, canonical spec hash, resolved parameters, or effective host limits.

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
  maxRuns: 100
  maxEvents: 1000000
  maxTraceRecords: 50000
```

### Parameter matrix

A list-valued parameter in `parameters` defines alternatives. The experiment runner expands parameter alternatives as a Cartesian product. A scalar value fixes that parameter to one value.

Only parameters declared by the world spec may be overridden. Unknown parameters or values outside the declared type/range fail before the affected run begins.

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

No implicit time-based seed exists in reproducible experiment mode. Interactive hosts may offer a "random seed" button, but they must resolve it to a concrete uint32 before execution and record that value.

### Step override

An experiment request may optionally request a smaller/equal number of steps:

```yaml
steps: 40
```

The resolved value may not exceed the world's declared `time.steps` or the host `maxSteps` limit in v0.1.

### Trace policy

Trace is intentionally not collected for every batch run by default.

Modes:

- `none`
- `selected`

For `selected`, an explicit seed list identifies runs whose event trace is retained. Selection is by seed in v0.1; predicate-based outlier tracing is not implemented.

### Resource limits

The experiment request may lower host limits. It cannot raise them above limits granted by the embedding host/runtime. The effective limit is the stricter value.

The release-candidate defaults and benchmark evidence are documented in [resource-benchmark-v0.1.md](resource-benchmark-v0.1.md).

## Run manifest

Every successfully completed `runWorld()` call emits a resolved manifest. The development build records `0.1.0-dev.0`; the separate release operation will set the package/engine version to `0.1.0`.

Representative manifest:

```yaml
manifestVersion: "0.1"

engine:
  name: WorldSimSeed
  version: 0.1.0-dev.0
  randomModel: keyed-fnv1a-mulberry32-v1

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
  - wealth_p10
  - wealth_p90
  - wealth_histogram

trace:
  enabled: false

limits:
  maxAgents: 5000
  maxSteps: 500
  maxEvents: 1000000
  maxTraceRecords: 50000
  maxRuns: 100

result:
  status: completed
```

Required resolved information:

- engine name/version,
- random model identifier,
- world ID,
- world-spec version,
- canonical validated-spec hash,
- concrete uint32 seed,
- concrete step count,
- fully resolved parameter values,
- active observer IDs,
- trace enabled/disabled state,
- effective resource limits,
- completed terminal status.

The complete observer definitions are part of the canonical hashed world spec. The manifest therefore records the active observer IDs plus the spec hash rather than duplicating every observer definition.

## Provenance timestamp policy

The engine-generated v0.1 manifest deliberately contains **no timestamp**. This keeps the manifest itself deterministic for identical simulation inputs and makes exact replay comparisons straightforward.

A host that needs wall-clock provenance may wrap the manifest with host metadata such as `createdAt`, log a timestamp alongside it, or add it in a storage envelope. That metadata must not feed back into simulation semantics or the canonical spec hash.

## Failed, limited, and cancelled runs

In v0.1, an engine failure does not mint a manifest that looks like a completed run.

- validation/expression/numeric/resource failures throw a typed `WorldSimError`, such as `RESOURCE_LIMIT`;
- browser Worker cancellation returns a cancelled, still-running view at a cooperative chunk boundary;
- that Worker session may resume deterministically from the partial state;
- `exportRun()` is rejected until the run has actually completed.

Accordingly, `RunManifest.result.status` has only `completed` in v0.1. Future versions may add a separate structured partial/failure artifact, but no such artifact is claimed by this contract.

## Batch result

`runExperiment()` returns:

- the world ID and canonical spec hash,
- resolved run count,
- each completed run's manifest, metrics, event count, and optional selected trace,
- count/mean/min/max aggregates for numeric observers,
- aggregate emitted-event count.

The runner expands parameter alternatives × seed sequence deterministically, checks the total against `maxRuns` before executing, and preserves deterministic replay ordering.

## Browser/headless acceptance rule

Given:

- the same engine version,
- the same canonical world spec,
- the same resolved parameters,
- the same seed,
- the same step count,
- the same observer configuration,

browser Worker and headless execution must produce the same deterministic acceptance summary. Presentation formatting may differ. The underlying state/metric data may not.

This parity is an automated Chromium/Node release gate.
