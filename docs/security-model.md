# WorldSimSeed v0.1 security model

Status: released security boundary for WorldSimSeed v0.1.0  
Related issues: [#5](https://github.com/yo4e/WorldSimSeed/issues/5), [#16](https://github.com/yo4e/WorldSimSeed/issues/16), [#20](https://github.com/yo4e/WorldSimSeed/issues/20)

## 1. Security goal

WorldSimSeed should be able to load a world spec supplied by a user, another application, or an AI system without turning that document into a path for arbitrary host-code execution, network/file access, prototype escape, or unbounded computation.

The central rule is:

> **A world spec is untrusted data, not code.**

This document defines the minimum boundary required by the v0.1 runtime.

## 2. Assets to protect

The v0.1 model is concerned with protecting:

- the browser page or Node.js process embedding the engine,
- host application state and credentials,
- the user's local files and network authority,
- runtime availability and responsiveness,
- deterministic/reproducible execution claims,
- exported run metadata and results from silent corruption.

It does not claim to sandbox malicious JavaScript that already runs with the host application's own authority.

## 3. Untrusted inputs

Treat the following as untrusted unless the embedding application explicitly establishes a stronger trust relationship:

- world spec files,
- AI-generated specs,
- user-edited parameters,
- batch-run parameters,
- observer declarations,
- expression text or AST-like expression structures,
- names and labels stored in the spec.

Validation applies equally to human-authored and AI-authored input.

## 4. Trust boundaries

### 4.1 Parse and schema validation

Raw JSON/YAML-like input must be parsed into ordinary data and validated against a versioned schema before execution.

Unknown or unsupported constructs fail closed. Implementations should not silently reinterpret invalid input.

The JSON Schema artifact captures the structural contract. Runtime structural + semantic validation remains authoritative for execution, and CI runs shared positive/negative fixtures through both paths to detect structural drift.

### 4.2 Expression evaluation

Expressions must run in a purpose-built, default-deny evaluator.

The evaluator may expose only the operators, pure functions, identifiers, and state paths explicitly defined by the world-spec version. The exact allowlist belongs to the world-spec v0.1 design, but the security boundary is fixed here.

Expressions must not have access to:

- `eval`, `Function`, dynamic import, or script/module loading,
- `window`, `document`, `globalThis`,
- Node.js `process`, filesystem, networking, environment variables, or module loaders,
- host callbacks or arbitrary host objects,
- object prototype traversal or reflective property access.

Identifiers and paths must be resolved against declared simulation state/parameters, not arbitrary JavaScript object graphs.

At minimum, the names `__proto__`, `prototype`, and `constructor` must be rejected wherever they could participate in property traversal or object construction.

### 4.3 Runtime

The runner executes validated internal structures only. A spec cannot create arbitrary loops, recursion, threads, timers, workers, subprocesses, or host callbacks.

The runtime counts work and stops when configured limits are reached.

### 4.4 Embedding

The host application owns any capability that reaches outside the pure simulation runtime.

A future capability such as loading a remote spec, resolving an include, or calling a host callback must be an explicit host API with its own allowlist and permission model. It is not implicitly granted by fields inside a world spec.

For v0.1, world specs themselves have **no network, filesystem, import/include, or arbitrary URL-fetch capability**.

The browser `<world-sim>` adapter may fetch its host-supplied `src` URL, but this is a host capability rather than a world-spec capability. The component uses `credentials: "omit"` so ambient credentials are not silently attached to that fetch.

## 5. v0.1 prohibited features

The following are out of bounds for v0.1:

- arbitrary JavaScript or TypeScript in a spec,
- user-defined executable functions,
- `eval` / `new Function`,
- dynamic imports or module/plugin loading from a spec,
- arbitrary URL fetch,
- filesystem paths or file reads/writes,
- import/include directives,
- unbounded `while` / `for` loops,
- recursion,
- arbitrary regular-expression execution supplied by a spec,
- prototype/property escape,
- direct DOM or host-object access.

A later version may add selected capabilities only behind a new documented security review.

## 6. Resource-limit policy

### 6.1 Required limits

The host-facing execution API supports explicit limits for at least:

- maximum agents,
- maximum steps/ticks per world,
- maximum batch runs,
- maximum emitted events,
- maximum retained trace/event-log records,
- a cooperative abort mechanism for browser Worker execution.

Observer retention is bounded indirectly by the finite step and agent ceilings. v0.1 does not claim a separate byte quota for every observer result; see [known limitations](known-limitations-v0.1.md).

### 6.2 Defaults

The v0.1 defaults are:

```text
maxAgents       5,000
maxSteps          500
maxRuns           100
maxEvents   1,000,000
maxTraceRecords 50,000
```

The `<world-sim>` component uses the same ceilings with `maxRuns = 1` because it represents one simulation session rather than a batch runner.

These values were selected after representative Node.js and Chromium probes. The method, environment, results, and rationale are recorded in [resource benchmark and v0.1 defaults](resource-benchmark-v0.1.md).

Hosts may request lower limits. Raising limits above project defaults is an explicit host decision, never something a world spec can do for itself.

### 6.3 Preflight and runtime enforcement

Validation rejects agent and declared-step requests that already exceed host ceilings. Batch expansion checks `maxRuns` before execution.

Runtime counters remain authoritative where cost depends on actual execution. Crossing `maxEvents` or `maxTraceRecords` terminates the run with a typed `RESOURCE_LIMIT` error rather than silently truncating state.

### 6.4 Browser responsiveness and abort

Potentially heavy browser execution runs in a module Worker rather than a long main-thread loop. Worker `run()` executes in chunks and yields between chunks so host cancellation can be observed.

Cancellation is cooperative, not preemptive: a current step/chunk boundary must be reached before the stop is observed. A cancelled Worker session can be resumed from its current deterministic state. Resource limits remain required even though a Worker is used.

Chromium CI includes a responsiveness probe that verifies main-thread timers continue to fire during a representative Worker run, plus a cancel/resume test at the Worker-service boundary.

Node/headless v0.1 does not provide an internal wall-clock kill switch. Hosts that require one must impose an external process/time budget; this is documented as a v0.1 limitation.

## 7. Reproducibility and provenance

A successful run manifest records:

- engine version,
- world-spec version,
- stable spec hash,
- concrete random seed,
- resolved execution parameters,
- active resource-limit configuration,
- observer IDs and trace configuration,
- completed terminal status.

The engine-generated v0.1 manifest deliberately omits wall-clock timestamps. A host may attach timestamp/provenance metadata outside the deterministic manifest, but it must not affect simulation semantics or the canonical spec hash.

If a run terminates because of a limit, validation, numeric error, or cancellation, it must not be presented as a normal completed deterministic run. In v0.1, failed runs throw typed errors and browser cancellation does not become exportable through `exportRun()` until a resumed run completes.

See [run manifest v0.1](run-manifest-v0.1.md).

## 8. AI-generated specs

AI-generated specs are not a privileged input class.

Recommended UX before execution:

1. schema validation,
2. semantic warnings,
3. complexity/cost estimate,
4. unsupported-operation rejection,
5. optional dry run,
6. execution under the same hard resource limits used for every other spec.

Warnings are advisory. Hard boundaries are enforced by the validator/evaluator/runtime.

## 9. Threats and mitigations

| Threat | v0.1 mitigation |
| --- | --- |
| Arbitrary code execution | Data-only spec, allowlisted evaluator, no JS escape hatches |
| Prototype/property escape | Declared paths only; reject dangerous property names; no reflective traversal |
| SSRF / unwanted network access | No spec-driven fetch or URL capability; host `src` fetch omits credentials |
| Local file/process access | No filesystem/process/module APIs in evaluator |
| CPU denial of service | Finite agents/steps/runs/events plus cooperative browser abort; external Node time budget where required |
| Memory exhaustion | Bounded agents, traces, events, steps/runs; fail with limit error |
| Main-thread freeze | Worker execution, chunk yielding, conservative defaults |
| Infinite loops/recursion | Not expressible in v0.1 world spec |
| Path traversal through includes | Includes/imports not supported in v0.1 |
| Malicious AI-generated spec | Same validation, allowlists, and limits as every untrusted spec |
| Reproducibility spoofing | Versioned spec + engine metadata + spec hash + seed + active limits |

## 10. Out of scope for the v0.1 threat model

This boundary does not attempt to solve:

- a compromised WorldSimSeed package or dependency,
- malicious code in the embedding host itself,
- browser/Node.js engine vulnerabilities,
- side-channel resistance,
- multi-tenant hostile-code isolation,
- the truth or ethics of the real-world assumptions encoded in a model.

Those may matter to deployments, but they require separate threat models.

## 11. Release gate

The v0.1 release gate requires executable implementation to demonstrate, with tests where applicable:

- no arbitrary-code path from world spec to host,
- invalid/unknown operations reject cleanly,
- prototype/property escape cases reject,
- network/filesystem/import capability is absent from spec execution,
- configured resource limits actually stop work,
- browser cancellation remains cooperative and resumable,
- same spec + parameters + engine version + seed produces the expected deterministic result contract,
- Node/headless and Chromium Worker acceptance fixtures agree.

These gates are exercised by the Node hardening tests, Worker-service tests, Chromium E2E, package smoke, and CI workflow. See [v0.1 release checklist](v0.1-release-checklist.md).
