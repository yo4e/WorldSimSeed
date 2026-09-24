# Resource benchmark and v0.1 defaults

Related: [Issue #16](https://github.com/yo4e/WorldSimSeed/issues/16)

This document records the benchmark method used to choose conservative v0.1 host defaults. The benchmark is a capacity probe, not a performance promise. Absolute timings vary by CPU, browser, Node.js version, thermal state, and surrounding workload.

## Release-candidate defaults

```ts
{
  maxAgents: 5_000,
  maxSteps: 500,
  maxEvents: 1_000_000,
  maxTraceRecords: 50_000,
  maxRuns: 100,
}
```

The browser `<world-sim>` component uses the same ceilings except `maxRuns: 1` because it does not expose batch execution.

These values are deliberately below the largest capacity probe. A host may choose smaller limits without changing world semantics. Raising them is an explicit host choice and is not available to the world spec itself.

## Benchmark harness

Run:

```bash
npm run benchmark:release
```

The harness builds the project, runs under Node with `--expose-gc`, and prints machine-readable lines prefixed with `WSS_BENCH`. It records wall time plus process RSS/heap snapshots. CI runs the same harness on Node 22 / `ubuntu-latest`.

Single-run probes:

- 1,000 agents × 100 steps, trace off
- 5,000 agents × 500 steps, trace off
- 10,000 agents × 100 steps, trace off as an upper-capacity probe
- 1,000 agents × 100 steps, trace on

The generated benchmark world has one numeric agent field, one probabilistic agent event, and one numeric observer. This intentionally exercises the engine rather than measuring an empty loop.

Batch probes use a 100-agent × 50-step world at 10, 50, and 100 runs. Batch results retain per-run manifests/metrics, so memory growth is relevant as well as CPU time.

## Browser probe

Playwright includes a browser-side workload of 2,000 agents × 200 steps through `<world-sim>`. The test records `WSS_BROWSER_BENCH` and verifies that main-thread timers continue to fire while the Worker is running. There is deliberately no millisecond threshold in the release gate.

The existing browser gate separately verifies same-seed headless ↔ Worker result parity and cooperative cancel/resume behavior.

## Recorded CI evidence

The authoritative evidence for this change is the CI run attached to the Issue #16 pull request. After that run completes, this section is updated with the observed environment and benchmark records before the PR is considered ready to merge.

| Probe | Duration | RSS end | Notes |
| --- | ---: | ---: | --- |
| 1,000 × 100, trace off | pending | pending | Node release benchmark |
| 5,000 × 500, trace off | pending | pending | Node release benchmark |
| 10,000 × 100, trace off | pending | pending | upper-capacity probe |
| 1,000 × 100, trace on | pending | pending | retained trace |
| batch 10 | pending | pending | 100 agents × 50 steps per run |
| batch 50 | pending | pending | 100 agents × 50 steps per run |
| batch 100 | pending | pending | 100 agents × 50 steps per run |
| browser 2,000 × 200 | pending | n/a | main-thread responsiveness checked |

## Why these defaults

`maxAgents: 5_000` keeps the default at the middle representative scale rather than treating the 10,000-agent probe as a promise.

`maxSteps: 500` matches the representative long-run probe and avoids the earlier development value of 5,000–10,000 steps, which multiplied with high agent counts too aggressively.

`maxEvents: 1_000_000` and `maxTraceRecords: 50_000` keep retained/event work finite while still leaving substantial room above the reference examples. Trace has a tighter ceiling because each retained record contains event/effect metadata and therefore has a higher memory cost than an event counter.

`maxRuns: 100` is intentionally much lower than the earlier development ceiling of 1,000. Batch results retain per-run manifests and metrics in memory in v0.1, so the default should favor bounded interactive/research batches over maximum throughput.

No default is a claim that every allowed combination has equal cost. The limits are independent safety ceilings, and a host serving untrusted workloads may need substantially lower values or an external wall-clock/process budget.
