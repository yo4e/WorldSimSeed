# Public API v0.1

This document defines the public package surface for the v0.1 world/manifest contract. The published baseline is v0.1.0; current main also documents unreleased API additions. `getTrace()` and batch `groups` were added after the v0.1.0 tag. See [release status](releases/next-release.md) for the distinction. Files below `dist/` that are not reachable through these package exports are implementation details.

## Package entry points

| Import | Purpose | Environment |
| --- | --- | --- |
| `worldsimseed` | Common errors, resource defaults, spec, core, and runner exports | Node.js or browser-capable bundlers |
| `worldsimseed/spec` | Parse, validate, compile, hash, expression and random-model primitives | Portable |
| `worldsimseed/core` | Deterministic simulation creation and stepping | Portable |
| `worldsimseed/runner` | Single-run and batch orchestration plus run manifests | Portable |
| `worldsimseed/web` | Worker client/service and `<world-sim>` Web Component | Browser only |

Every export has a matching generated `.d.ts` entry in `package.json`.

## Resource defaults

`DEFAULT_RESOURCE_LIMITS` is exported from the package root:

```ts
import { DEFAULT_RESOURCE_LIMITS } from "worldsimseed";
```

The v0.1 defaults are:

```ts
{
  maxAgents: 5_000,
  maxSteps: 500,
  maxEvents: 1_000_000,
  maxTraceRecords: 50_000,
  maxRuns: 100,
}
```

`<world-sim>` uses the same defaults except that `maxRuns` is `1`, because the component represents a single simulation session rather than a batch runner.

Hosts may set lower limits. Raising limits is an explicit host decision; a world or experiment spec cannot raise its host ceiling.

## Spec API

The normal world-loading path is:

```ts
import { compileWorld, parseWorld, validateWorld } from "worldsimseed/spec";
import { DEFAULT_RESOURCE_LIMITS } from "worldsimseed";

const parsed = parseWorld(source, { format: "yaml" });
const spec = validateWorld(parsed, { limits: DEFAULT_RESOURCE_LIMITS });
const compiled = compileWorld(spec);
```

`parseWorld()` only parses the supported JSON or restricted-YAML data form. `validateWorld()` performs structural and semantic checks. `compileWorld()` compiles the allowlisted expression subset and calculates the canonical spec hash.

The JSON Schema in `schemas/world-spec-v0.1.schema.json` is a structural artifact. Runtime validation remains authoritative for semantic checks. CI runs shared conformance fixtures through both systems so structural drift is detected.

## Core API

`createSimulation(compiled, options)` creates a deterministic simulation instance with:

- `step()`
- `snapshot()`
- `metrics()`
- `trace()`
- `status()`

A seed, effective parameters, step target, and host resource limits are explicit inputs. The core performs no network or filesystem I/O.

## Runner API

`runWorld(compiled, options)` executes a single simulation to completion and returns:

- a reproducibility manifest,
- final state,
- observer metrics and every-step history where requested,
- optional retained trace,
- emitted event count.

`validateExperimentRequest()` and `runExperiment()` implement batch execution. Batch expansion is parameter Cartesian product × seed sequence and is bounded by `maxRuns` before execution.

On current main, the additive `ExperimentGroup` / `ExperimentResult.groups` API provides summaries by the complete resolved parameter set, deterministic JSON keys, run indexes, and seeds. Top-level `aggregates` and `eventCount` remain pooled. Numeric per-run mean/Gini/correlation observers and event counts use count/mean/min/max summaries; simulation semantics and request syntax are unchanged. These groups are not present in the published v0.1.0 tag. See the [group contract](run-manifest-v0.1.md#grouped-summaries-issue-26).

## Web API

Importing `worldsimseed/web` registers `<world-sim>` when `customElements` exists. The web entry is not a Node.js runtime entry point.

Primary element methods:

```ts
await element.load();
await element.step();
await element.run();
await element.cancel();
await element.reset({ seed: 42 });
await element.getState();
await element.getMetrics();
await element.getTrace();
await element.exportRun();
```

Long runs execute in a module Worker. `cancel()` is cooperative at chunk boundaries; a cancelled run may be resumed from its current deterministic state. `src` fetching belongs to the embedding host and uses `credentials: "omit"`.

`getTrace()` returns a defensive snapshot of retained trace records at the current simulation state. Trace capture must be enabled before load/reset. `exportRun()` remains a completed-run export and still rejects incomplete simulations.

See [web embedding v0.1](web-embedding-v0.1.md) for Custom Events and host boundaries.

## Error contract

Expected engine failures use `WorldSimError` with a stable category in `error.code` and optional JSON-compatible `details`. Resource exhaustion uses `RESOURCE_LIMIT`. Browser errors emitted through `worldsim-error` are sanitized and do not expose stack traces.

The exact wording of human-readable error messages is not the primary compatibility contract; callers should branch on the typed code.

## What is not public in v0.1

Internal file paths, restricted-YAML parser internals, Worker protocol implementation details, and undocumented `dist/` files are not promised as stable API. Import through the package entry points above rather than deep-linking into generated files.
