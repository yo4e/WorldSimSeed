# Known limitations v0.1

WorldSimSeed v0.1 deliberately keeps a narrow execution model. These limits are part of the current product boundary rather than hidden TODOs.

## World model

- State fields are numbers or booleans only.
- The expression language is allowlisted and intentionally small.
- Arbitrary JavaScript, custom functions, recursion, loops, imports, and host-object access are not supported.
- A world spec cannot perform network, filesystem, process, DOM, timer, Worker, or module I/O.
- YAML support is a restricted JSON-compatible subset, not general YAML. Anchors, aliases, custom tags, and executable extensions are rejected.
- Agent events cannot mutate world state in v0.1.
- A run cannot request more steps than the world declares in `time.steps`.
- Mid-run parameter intervention is not supported. Change parameters by reset/new run.

## Execution and resources

- Resource defaults are conservative safety ceilings, not performance guarantees.
- `maxEvents` counts emitted events. The engine does not yet expose a separate budget for every condition/effect evaluation.
- `maxTraceRecords` bounds retained trace records, not total process memory.
- Observer output is bounded indirectly by steps and agent limits; there is no independent byte-size quota for every observer result in v0.1.
- There is no hard wall-clock kill inside the portable core. Browser runs provide cooperative cancellation at Worker chunk boundaries. Node/headless hosts must enforce any external wall-clock policy themselves.
- Cancellation is cooperative, not preemptive. A single step must finish before cancellation is observed.
- The default limits are suitable starting ceilings for the included reference workloads, not a promise that every permitted combination will finish within a particular latency or memory budget.

## Batch runner

- Parameter expansion is an in-memory Cartesian product.
- Per-run manifests and metrics are retained in the returned batch result, so a high host-selected `maxRuns` increases memory use.
- Numeric aggregates are count/mean/min/max only.
- Selected trace retention is selected by seed, not by an arbitrary predicate over parameter combinations.
- There is no distributed execution, streaming result sink, checkpointing, or resume file format.

## Reproducibility

- Determinism is defined for the same validated spec, resolved parameters, engine version, random model, seed, and step count.
- Run manifests contain no provenance timestamp in v0.1. This is intentional: timestamps are host metadata and are excluded from simulation semantics.
- Failed or resource-limited runs do not produce a normal `completed` run manifest. Partial state may exist inside an interrupted host session, but it is not exported as a completed deterministic result.

## Browser embedding

- `<world-sim>` is a minimal execution component, not a visualization framework.
- The `src` attribute is fetched by host code. The world spec itself has no fetch capability.
- `src` requests use `credentials: "omit"`; authenticated cross-origin loading needs explicit host-side integration outside the component.
- Browser execution requires module Worker support.
- The web package entry is browser-only and should not be imported as a runtime module in Node.js.

## Package and release

- The repository version remains `0.1.0-dev.0` until the separate release operation.
- `package.json` deliberately remains `private: true` during Issue #16. This preserves an npm publish guard while still allowing `npm pack`, tarball inspection, clean tarball install, exports/type checks, tests, and demos.
- If npm publication is chosen later, changing `private` is an explicit release action performed only on the exact tested release candidate.
- Issue #16 does not publish to npm, create a `v0.1.0` tag, or create a GitHub Release.
- A committed npm lockfile is not currently part of the source policy. CI performs a fresh dependency resolution, production dependency audit, package dry run, and clean install of the generated tarball. A lockfile policy can be revisited if reproducible contributor-tooling resolution becomes a release requirement.
