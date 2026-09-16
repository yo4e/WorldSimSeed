# WorldSimSeed v0.1 architecture draft

Status: design draft for Issue #3  
Depends on: Issue #2 / world spec v0.1 draft

## 1. Goal

WorldSimSeed v0.1 should be a small embeddable simulation engine, not a monolithic web application.

The architecture must preserve four boundaries:

1. world specs are untrusted data,
2. deterministic simulation semantics live outside UI code,
3. browser and Node use the same core semantics,
4. visualization and host capabilities do not leak into the simulation core.

## 2. Distribution strategy

v0.1 should begin as **one npm package** named conceptually `worldsimseed`, with explicit subpath exports.

Do not begin with five separately versioned npm packages.

Logical modules:

```text
worldsimseed/spec
worldsimseed/core
worldsimseed/runner
worldsimseed/web
worldsimseed/view
```

Possible repository layout:

```text
src/
  spec/
  core/
  runner/
  web/
  view/
```

The module boundaries are real even if the first release ships one package.

If independent release/versioning later becomes useful, the subpath boundaries can become separate packages without redesigning the public concepts.

## 3. Language and module format

Source language: **TypeScript**.

Published runtime format:

- ESM-first,
- browser-compatible modules for portable layers,
- Node-compatible ESM for headless use,
- generated type declarations.

The portable modules `spec`, `core`, and the portable part of `runner` must not import:

- DOM APIs,
- Node filesystem/process APIs,
- network/fetch APIs,
- UI frameworks.

Environment-specific adapters own those capabilities.

## 4. Module boundaries

### 4.1 `spec`

Responsibilities:

- parse YAML/JSON supplied by a host,
- enforce the JSON-compatible YAML subset,
- JSON Schema validation,
- semantic validation,
- parse restricted expressions into a safe internal AST,
- canonicalize the parsed spec for hashing,
- compile a validated world into an immutable runtime definition.

Does not:

- advance simulation time,
- draw runtime random events,
- fetch URLs,
- read files,
- render UI.

Conceptual API:

```ts
parseWorld(source, { format })
validateWorld(value, { limits })
compileWorld(validatedWorld)
hashWorld(validatedWorld)
```

The parser may use libraries for YAML/tokenization, but the accepted expression grammar and evaluator contract remain WorldSimSeed-owned and allowlisted.

### 4.2 `core`

Responsibilities:

- hold one simulation instance,
- initialize state from a compiled world,
- deterministic random draws,
- advance one tick,
- apply events/effects,
- compute declared observers,
- expose snapshots and per-step trace records.

Does not:

- parse raw YAML,
- perform network/filesystem I/O,
- own Web Workers,
- run UI,
- execute plugins or host callbacks,
- decide batch scheduling.

Conceptual API:

```ts
const sim = createSimulation(compiledWorld, {
  seed: 42,
  parameters,
  limits,
  trace
})

sim.step()
sim.snapshot()
sim.metrics()
sim.status()
```

`step()` is synchronous and deterministic.

Long-running loops belong to `runner` or an environment adapter so the core itself does not hide scheduling behavior.

### 4.3 `runner`

Responsibilities:

- run N steps,
- expand experiment parameter matrices,
- run seed sets,
- enforce run/batch resource limits,
- cancellation/abort handling,
- aggregate observer summaries,
- produce resolved run manifests,
- select runs for trace retention.

Conceptual API:

```ts
runWorld(compiledWorld, options)
runExperiment(compiledWorld, experimentRequest)
```

Runner results are data objects, not rendered output.

In Node, the runner may execute directly.

In browsers, long or batch execution should be hosted by the web adapter in a Worker.

### 4.4 `web`

Responsibilities:

- browser-only host adapter,
- Web Worker orchestration,
- `<world-sim>` custom element,
- optional `src` loading,
- DOM events,
- Shadow DOM UI shell,
- bridge between component methods and runner/core.

The web adapter may use `fetch` because the **host embedding layer** granted that capability.

A world spec itself still cannot request arbitrary fetches.

### 4.5 `view`

Responsibilities:

- transform snapshots/observer results into presentation models,
- charts and metric cards,
- optional agent/network visualization in later versions.

Does not mutate simulation state.

The first vertical slice does not require `view` implementation. It is an architectural boundary for later UI work.

## 5. v0.1 implementation order

For the first vertical slice in Issue #6:

1. `spec`
2. `core`
3. minimal `runner`
4. Node/headless acceptance path

After the vertical slice proves deterministic execution:

5. `web` + Worker
6. minimal Web Component
7. `view` as needed

This avoids building UI on top of unstable simulation semantics.

## 6. Internal state versus public snapshots

The core may use any internal representation that preserves the public contract.

For example, implementation may later choose:

- arrays of records,
- struct-of-arrays,
- typed arrays,
- optimized observer accumulators.

None of those internal choices are public API in v0.1.

### Public snapshot

`snapshot()` returns a detached JSON-compatible value.

Conceptual shape:

```json
{
  "t": 12,
  "world": {
    "resource": 73.4
  },
  "agents": [
    {
      "id": 0,
      "state": {
        "talent": 0.61,
        "wealth": 20
      }
    }
  ]
}
```

Rules:

- callers never receive a live mutable reference into core state,
- mutating a returned snapshot cannot mutate the simulation,
- absent world/agent sections are omitted,
- snapshot ordering of agents is stable by ascending ID.

Implementations may freeze snapshots in development builds, but semantic isolation is required regardless of `Object.freeze`.

## 7. Parameters and runtime mutation

Resolved parameters are **immutable during one v0.1 run**.

This is deliberate.

A `setParameter()` call that changes semantics mid-run would require an intervention timeline in the run manifest to preserve reproducibility. v0.1 does not introduce that complexity.

Therefore:

- parameters are supplied when creating/resetting a simulation,
- changing a parameter creates a new resolved run,
- dynamic interventions must be encoded as world events if they are part of the model,
- a future version may add a versioned host-intervention timeline.

This slightly narrows the early external-control API in exchange for a much cleaner reproducibility contract.

## 8. Step result and metrics

A step returns a small result object.

Conceptual shape:

```json
{
  "t": 13,
  "status": "running",
  "triggeredEvents": 27
}
```

Observer results are retrieved separately.

Conceptual metrics shape:

```json
{
  "t": 13,
  "values": {
    "mean_wealth": 14.2,
    "wealth_gini": 0.31,
    "wealth_histogram": {
      "bins": [0, 10, 20, 30],
      "counts": [10, 30, 25]
    }
  }
}
```

Observer values remain JSON-compatible.

The observer definition decides whether history is retained for `everyStep` output.

## 9. Trace model

Trace is optional and bounded.

The core emits data records for triggered events when trace is enabled.

Conceptual record:

```json
{
  "t": 12,
  "eventId": "lucky_opportunity",
  "scope": "agent",
  "agentId": 41,
  "effects": [
    {
      "target": "agent.wealth",
      "before": 10,
      "after": 20
    }
  ]
}
```

Rules:

- trace is off by default for large batch runs,
- trace retention is bounded by resource limits,
- the core returns trace records as data,
- the runner decides storage/streaming/retention,
- host callbacks do not execute inside event effects.

v0.1 does not promise a full trace of every failed condition/chance draw. It records triggered behavior needed for practical inspection.

Outlier inspection can rerun the same seed with trace enabled.

## 10. Run result

A completed single run returns conceptually:

```ts
{
  manifest,
  finalState,
  metrics,
  trace?
}
```

The resolved manifest follows `docs/run-manifest-v0.1.md`.

The final state and trace may be omitted by host configuration for large batch workloads, while summary metrics and manifest remain available.

## 11. Export boundary

Core/runner canonical exports:

- run manifest JSON,
- observer/summary JSON,
- optional final-state JSON,
- optional trace records as JSON-compatible values.

Adapter-level exports:

- JSON files,
- JSONL trace streams,
- CSV summaries.

CSV is not a core data model because nested observers such as histograms do not map cleanly to one universal table.

## 12. Web Component

Proposed v0.1 host element:

```html
<world-sim
  src="/worlds/talent-luck.world.yaml"
  seed="42">
</world-sim>
```

The `src` attribute is a host-page capability, not a capability granted to the loaded spec.

### Loading

The element supports either:

- `src` supplied by host markup,
- a parsed/spec value assigned through a JavaScript property.

Cross-origin loading follows browser CORS.

The web adapter should not send cross-origin credentials by default.

### Shadow DOM

Use Shadow DOM for the component shell to avoid host-page CSS collisions.

The component should expose a small styling surface through CSS custom properties/parts rather than leaking internal selectors.

### Proposed methods

```ts
element.load(...)
element.reset({ seed, parameters })
element.step()
element.run()
element.getState()
element.getMetrics()
element.exportRun()
```

`reset` may change seed/parameters because it creates a new run.

There is no mid-run `setParameter` in v0.1.

### Proposed DOM events

- `worldsim-ready`
- `worldsim-step`
- `worldsim-complete`
- `worldsim-error`

Event payloads contain data snapshots/metadata, never live core objects.

## 13. Browser execution

Interactive single-step execution may call core directly when bounded and small.

Long-running or batch execution should use a Web Worker.

The Worker owns:

- runner orchestration,
- long loops,
- cancellation checks,
- batch execution.

The main thread owns:

- DOM,
- presentation,
- user input.

Resource limits remain mandatory even inside a Worker.

A Worker prevents UI freezing; it is not a replacement for limits.

## 14. Node/headless execution

Node uses the same `spec`, `core`, and runner semantics.

A future CLI is an adapter around those modules, conceptually:

```bash
worldsimseed run examples/talent-luck.world.yaml --seed 42
worldsimseed experiment examples/talent-luck.experiment.yaml
```

The CLI must not introduce different simulation semantics.

Browser/headless equality is tested at the data result level.

## 15. Visualization boundary

Visualization consumes only public data:

- snapshots,
- metrics,
- run status,
- trace records.

Visualization cannot directly mutate core state.

Initial view types may include:

- metric cards,
- time-series chart,
- histogram,
- scatter plot.

Agent-dot/network views can be added later.

The visualization layer should be replaceable by a host project's own UI.

## 16. Plugin policy

No general plugin architecture in v0.1.

Reasons:

- arbitrary extension hooks enlarge the threat model,
- callbacks create browser/Node divergence risk,
- plugin lifecycle/versioning is premature before the core contract is proven.

Hosts may compose around public APIs.

A future plugin model, if needed, must define capability boundaries explicitly and cannot be smuggled in through world specs.

## 17. NOZOMI Beings integration example

WorldSimSeed remains NOZOMI-agnostic.

Conceptual integration:

```ts
import { parseWorld, validateWorld, compileWorld } from "worldsimseed/spec"
import { createSimulation } from "worldsimseed/core"

const raw = parseWorld(worldSource, { format: "yaml" })
const validated = validateWorld(raw, { limits: nozomiLimits })
const compiled = compileWorld(validated)

const sim = createSimulation(compiled, {
  seed: 42,
  parameters: {
    opportunityRate: 0.08
  },
  limits: nozomiLimits,
  trace: { enabled: false }
})

for (let i = 0; i < 10; i += 1) {
  sim.step()

  const state = sim.snapshot()
  const metrics = sim.metrics()

  nozomiWorld.observeSimulation({
    state,
    metrics
  })
}
```

NOZOMI can read simulation outputs and decide what its own higher layer does.

WorldSimSeed core does not know:

- NOZOMI identities,
- memories,
- prompts,
- LLMs,
- UI,
- network services.

If NOZOMI later needs mid-run interventions, that should become a separate versioned control contract rather than an arbitrary callback inserted into core.

## 18. API stability boundary

For v0.1, the stable concepts to protect are:

- validated/compiled world input,
- deterministic seed + resolved parameters,
- step execution,
- detached snapshots,
- declared observer metrics,
- bounded trace data,
- resolved run manifest.

Exact TypeScript function names may still change during implementation before v0.1.0.

The data and security boundaries matter more than prematurely freezing ergonomic naming.

## 19. Issue #3 Done mapping

- Package/module boundary: defined as one package with explicit subpath modules.
- Public API draft: defined conceptually for spec/core/runner/web.
- Web Component embedding: `src`/property loading, methods, DOM events, Shadow DOM.
- Browser/Node policy: same portable semantics; Worker for long browser execution.
- State/event log/metrics formats: JSON-compatible draft shapes defined.
- NOZOMI usage example: included without NOZOMI-specific core API.
