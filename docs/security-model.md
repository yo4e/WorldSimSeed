# WorldSimSeed v0.1 security model

Status: design constraint for v0.1  
Related issue: [#5](https://github.com/yo4e/WorldSimSeed/issues/5)

## 1. Security goal

WorldSimSeed should be able to load a world spec supplied by a user, another application, or an AI system without turning that document into a path for arbitrary host-code execution, network/file access, prototype escape, or unbounded computation.

The central rule is:

> **A world spec is untrusted data, not code.**

This document defines the minimum boundary that must be true before a v0.1 runtime is considered releasable.

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

The runtime must count work and stop when configured limits are reached.

### 4.4 Embedding

The host application owns any capability that reaches outside the pure simulation runtime.

A future capability such as loading a remote spec, resolving an include, or calling a host callback must be an explicit host API with its own allowlist and permission model. It is not implicitly granted by fields inside a world spec.

For v0.1, world specs themselves have **no network, filesystem, import/include, or arbitrary URL-fetch capability**.

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

The host-facing execution API must support explicit limits for at least:

- maximum agents,
- maximum steps/ticks per world,
- maximum batch runs,
- maximum emitted/processed events,
- maximum trace/event-log records or bytes,
- a wall-clock or cooperative abort mechanism.

If observers can allocate data proportional to runtime size, their retained output must also be bounded.

### 6.2 Defaults

v0.1 must ship with conservative finite defaults. **The numeric defaults are not fixed by this document.** They should be selected after benchmark work on representative browser and Node.js environments.

The illustrative numbers in Issue #5 are therefore treated as capacity hypotheses, not API promises.

Hosts may request lower limits. Raising limits above project defaults is an explicit host decision, never something a world spec can do for itself.

### 6.3 Preflight and runtime enforcement

Validation or a dry-run/estimate path should reject obviously impossible requests before execution when cost can be estimated.

Runtime counters remain authoritative because static estimates may be imperfect. Crossing a limit must terminate the run with a typed/structured limit error rather than silently truncating state.

### 6.4 Browser responsiveness

Potentially heavy execution must not assume unlimited browser main-thread time.

The eventual browser architecture should use a Worker and/or cooperative yielding for work that can exceed an interactive frame budget. Resource limits remain required even when a Worker is used.

## 7. Reproducibility and provenance

A successful export/run manifest should be able to record:

- engine version,
- world-spec version,
- stable spec hash,
- random seed or seed sequence,
- execution parameters,
- active resource-limit configuration,
- observer/trace configuration,
- timestamp as provenance metadata only.

A timestamp must not affect deterministic simulation results.

If a run terminates because of a limit or validation error, the result must not be presented as a normal completed deterministic run.

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
| SSRF / unwanted network access | No spec-driven fetch or URL capability |
| Local file/process access | No filesystem/process/module APIs in evaluator |
| CPU denial of service | Finite agents/steps/runs/events plus abort/time budget |
| Memory exhaustion | Bounded agents, traces, events, observer retention; fail with limit error |
| Main-thread freeze | Conservative defaults plus Worker/cooperative execution strategy |
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

v0.1 must not be released until executable implementation can demonstrate, with tests where applicable:

- no arbitrary-code path from world spec to host,
- invalid/unknown operations reject cleanly,
- prototype/property escape cases reject,
- network/filesystem/import capability is absent from spec execution,
- configured resource limits actually stop work,
- same spec + parameters + engine version + seed produces the expected deterministic result contract.

See [v0.1 release checklist](v0.1-release-checklist.md).
