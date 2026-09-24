# Resource benchmark and v0.1 defaults

Related: [Issue #16](https://github.com/yo4e/WorldSimSeed/issues/16)  
Evidence: [PR #17 CI run 35977839945](https://github.com/yo4e/WorldSimSeed/actions/runs/35977839945)

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

The existing browser and Worker gates separately verify same-seed headless ↔ Worker result parity and cooperative cancel/resume behavior.

## Recorded CI evidence

The first release-candidate benchmark was recorded on 2026-09-24 in PR #17 CI. Environment:

- Ubuntu 24.04.5 (`ubuntu-24.04` hosted runner)
- Node.js `v22.23.2`, npm `10.9.8`
- x64, 4 exposed CPUs
- AMD EPYC 9V74 80-Core Processor
- about 15,990 MiB total memory visible to the runner

| Probe | Duration | RSS end | RSS delta | Notes |
| --- | ---: | ---: | ---: | --- |
| 1,000 × 100, trace off | 30.2 ms | 54.0 MiB | +5.5 MiB | 5,074 emitted events |
| 5,000 × 500, trace off | 521.0 ms | 62.2 MiB | +8.1 MiB | 125,140 emitted events |
| 10,000 × 100, trace off | 225.0 ms | 72.1 MiB | +9.9 MiB | upper-capacity probe; 49,885 events |
| 1,000 × 100, trace on | 29.0 ms | 72.6 MiB | +0.5 MiB | 5,074 retained trace records |
| batch 10 | 22.1 ms | 72.1 MiB | -0.5 MiB | 100 agents × 50 steps per run |
| batch 50 | 67.3 ms | 71.9 MiB | -0.2 MiB | 100 agents × 50 steps per run |
| batch 100 | 112.8 ms | 72.1 MiB | +0.1 MiB | 100 agents × 50 steps per run |
| browser 2,000 × 200 | 146.2 ms | n/a | n/a | main-thread timer fired 41 times; run completed |

RSS values are process snapshots, not peak-memory measurements. The negative deltas in some batch probes are expected GC noise and must not be interpreted as negative allocation. The benchmark is intentionally evidence for conservative defaults rather than a stable throughput SLA.

The same CI run also passed 21/21 Node tests, three Chromium E2E tests, production dependency audit, package dry-run, clean tarball install/import smoke, and both reference demos.

## Why these defaults

`maxAgents: 5_000` keeps the default at the middle representative scale rather than treating the successful 10,000-agent capacity probe as a promise.

`maxSteps: 500` matches the representative long-run probe and avoids the earlier development value of 5,000–10,000 steps, which multiplied with high agent counts too aggressively.

`maxEvents: 1_000_000` and `maxTraceRecords: 50_000` keep retained/event work finite while still leaving substantial room above the reference examples. Trace has a tighter ceiling because each retained record contains event/effect metadata and therefore has a higher memory cost than an event counter.

`maxRuns: 100` is intentionally much lower than the earlier development ceiling of 1,000. Batch results retain per-run manifests and metrics in memory in v0.1, so the default should favor bounded interactive/research batches over maximum throughput.

No default is a claim that every allowed combination has equal cost. The limits are independent safety ceilings, and a host serving untrusted workloads may need substantially lower values or an external wall-clock/process budget.
