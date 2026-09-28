# Browser demo presentation

The public GitHub Pages demo is a presentation layer around the real v0.1 `<world-sim>` browser path. It does not replace the Worker or simulation core with a mock.

## What the page explains

The Talent × Luck reference world is introduced before the controls so a first-time visitor can answer:

1. what kind of world is being simulated;
2. what the seed controls;
3. what happened during the most recent Step or Run;
4. which important values changed; and
5. what to look for in the result.

The page gives human-readable context for:

- average wealth;
- wealth Gini coefficient;
- talent ↔ wealth correlation;
- 10th and 90th percentile wealth;
- the current wealth distribution.

Raw engine metrics remain available in a disclosure for inspection.

## Event summaries

The Pages shell enables the existing trace option for this bounded reference world. Issue #22 exposed one small browser-API gap: `exportRun()` intentionally requires a completed simulation, so it cannot explain a single Step while the world is still running. The browser adapter therefore exposes a read-only `getTrace()` method backed by the core's existing `simulation.trace()` snapshot.

The demo uses `getTrace()` after interactions and translates trace records into compact counts such as lucky opportunities and misfortunes. The world spec, event probabilities, effects, Worker run loop, resource limits, and deterministic seed semantics are unchanged.

The reference world stays comfortably below the v0.1 trace-record ceiling in ordinary runs. `exportRun()` keeps its completed-run-only contract.

## Why there is no time-series chart in this pass

The v0.1 `run()` API returns the final view rather than streaming observer metrics for every intermediate step. Building a chart by replacing Run with a presentation-owned step loop would make the hosted demo exercise a different execution pattern from the normal Worker run.

For Issue #22, metric deltas, event summaries, and the current wealth histogram provide the useful human-readable signal without changing execution semantics or adding a visualization dependency. A true time-series view can be revisited if the browser API later exposes intermediate observer samples as part of the normal run path.

## Deterministic replay

The seed control explicitly explains the invariant:

> same validated world + same seed = same deterministic result

Changing the seed selects another possible history. Returning to the previous seed and resetting/running reproduces the previous result.
