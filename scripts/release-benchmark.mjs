import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import {
  compileWorld,
  validateWorld,
} from "../dist/src/spec/index.js";
import {
  runExperiment,
  runWorld,
} from "../dist/src/runner/index.js";

const PROBE_LIMITS = Object.freeze({
  maxAgents: 10_000,
  maxSteps: 500,
  maxEvents: 5_000_000,
  maxTraceRecords: 500_000,
  maxRuns: 100,
});

const mib = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

function benchmark(label, operation) {
  globalThis.gc?.();
  const before = process.memoryUsage();
  const started = performance.now();
  const result = operation();
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  const after = process.memoryUsage();

  const record = {
    label,
    durationMs,
    rssStartMiB: mib(before.rss),
    rssEndMiB: mib(after.rss),
    rssDeltaMiB: mib(after.rss - before.rss),
    heapUsedEndMiB: mib(after.heapUsed),
    ...result,
  };
  console.log(`WSS_BENCH ${JSON.stringify(record)}`);
  return record;
}

function makeAgentWorld({ id, agents, steps, chance = 0.05 }) {
  return {
    specVersion: "0.1",
    id,
    time: { steps },
    agents: {
      count: agents,
      state: {
        x: { type: "number", mutable: true, init: 0 },
      },
    },
    events: [
      {
        id: "increment",
        scope: "agent",
        chance,
        effects: [{ target: "agent.x", op: "add", value: 1 }],
      },
    ],
    observers: [{ id: "mean_x", type: "mean", source: "agent.x" }],
  };
}

function compile(spec) {
  return compileWorld(validateWorld(spec, { limits: PROBE_LIMITS }));
}

console.log(
  `WSS_BENCH_ENV ${JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model ?? "unknown",
    totalMemoryMiB: mib(totalmem()),
  })}`,
);

for (const scenario of [
  { agents: 1_000, steps: 100 },
  { agents: 5_000, steps: 500 },
  { agents: 10_000, steps: 100 },
]) {
  const compiled = compile(
    makeAgentWorld({
      id: `bench-${scenario.agents}-${scenario.steps}`,
      ...scenario,
    }),
  );

  benchmark(`single:${scenario.agents}x${scenario.steps}:trace-off`, () => {
    const result = runWorld(compiled, {
      seed: 42,
      limits: PROBE_LIMITS,
      trace: { enabled: false },
    });
    return {
      agents: scenario.agents,
      steps: scenario.steps,
      eventCount: result.eventCount,
    };
  });
}

{
  const agents = 1_000;
  const steps = 100;
  const compiled = compile(
    makeAgentWorld({ id: "bench-trace", agents, steps, chance: 0.05 }),
  );

  benchmark(`single:${agents}x${steps}:trace-on`, () => {
    const result = runWorld(compiled, {
      seed: 42,
      limits: PROBE_LIMITS,
      trace: { enabled: true },
    });
    return {
      agents,
      steps,
      eventCount: result.eventCount,
      traceRecords: result.trace?.length ?? 0,
    };
  });
}

{
  const compiled = compile(
    makeAgentWorld({ id: "bench-batch", agents: 100, steps: 50, chance: 0.1 }),
  );

  for (const runCount of [10, 50, 100]) {
    benchmark(`batch:${runCount}:100x50`, () => {
      const result = runExperiment(
        compiled,
        {
          experimentVersion: "0.1",
          world: "generated",
          runs: { seeds: { base: 1, count: runCount } },
          trace: { mode: "none" },
          limits: { maxRuns: runCount },
        },
        PROBE_LIMITS,
      );
      return {
        runs: result.runCount,
        perRunAgents: 100,
        perRunSteps: 50,
      };
    });
  }
}
