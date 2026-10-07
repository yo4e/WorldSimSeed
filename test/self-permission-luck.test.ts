// @ts-nocheck
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileWorld, parseData, parseWorld, validateWorld } from "../src/spec/index.js";
import { runExperiment, runWorld, validateExperimentRequest } from "../src/runner/index.js";

const LIMITS = {
  maxAgents: 5000,
  maxSteps: 500,
  maxEvents: 1_000_000,
  maxTraceRecords: 100_000,
  maxRuns: 1000,
};

async function loadWorld() {
  const source = await readFile("examples/self-permission-luck.world.yaml", "utf8");
  return compileWorld(
    validateWorld(parseWorld(source, { format: "yaml" }), { limits: LIMITS }),
  );
}

test("self-permission luck world runs as a paired counterfactual", async () => {
  const compiled = await loadWorld();
  const seed = 42;

  const baseline = runWorld(compiled, {
    seed,
    parameters: { permissionLuckBias: 0 },
    limits: LIMITS,
  });
  const replay = runWorld(compiled, {
    seed,
    parameters: { permissionLuckBias: 0 },
    limits: LIMITS,
  });
  const biased = runWorld(compiled, {
    seed,
    parameters: { permissionLuckBias: 0.001 },
    limits: LIMITS,
  });

  assert.deepEqual(baseline.metrics, replay.metrics);
  assert.deepEqual(baseline.finalState, replay.finalState);

  const baselineAgents = baseline.finalState.agents ?? [];
  const biasedAgents = biased.finalState.agents ?? [];
  assert.equal(baselineAgents.length, biasedAgents.length);

  assert.deepEqual(
    baselineAgents.map((agent) => agent.state.self_permission),
    biasedAgents.map((agent) => agent.state.self_permission),
  );

  assert.ok(biased.eventCount > baseline.eventCount);
  assert.ok(
    Number(biased.metrics.values.mean_wealth) >
      Number(baseline.metrics.values.mean_wealth),
  );

  for (let index = 0; index < baselineAgents.length; index += 1) {
    assert.ok(
      Number(biasedAgents[index].state.wealth) >=
        Number(baselineAgents[index].state.wealth),
    );
  }
});

test("experiment matrix pairs the same twenty seeds across baseline and biased scenarios", async () => {
  const compiled = await loadWorld();
  const source = await readFile(
    "examples/self-permission-luck.experiment.yaml",
    "utf8",
  );
  const request = validateExperimentRequest(parseData(source, { format: "yaml" }));
  const result = runExperiment(compiled, request, LIMITS);

  assert.equal(result.runCount, 40);

  const baselineSeeds = result.runs
    .filter((run) => run.manifest.parameters.permissionLuckBias === 0)
    .map((run) => run.manifest.seed);
  const biasedSeeds = result.runs
    .filter((run) => run.manifest.parameters.permissionLuckBias === 0.001)
    .map((run) => run.manifest.seed);

  assert.deepEqual(baselineSeeds, biasedSeeds);
  assert.equal(baselineSeeds.length, 20);

  // v0.1 batch aggregates intentionally summarize all parameter sets together.
  // Grouped summaries are additive; pooled counts remain unchanged.
  assert.equal(result.aggregates.mean_wealth?.count, 40);
  assert.equal(result.eventCount.count, 40);
  assert.equal(result.groups.length, 2);
  for (const group of result.groups) {
    assert.equal(group.runCount, 20);
    assert.equal(group.aggregates.mean_wealth.count, 20);
    assert.equal(group.aggregates.wealth_gini.count, 20);
    assert.equal(group.aggregates.permission_wealth_correlation.count, 20);
    assert.equal(group.eventCount.count, 20);
    assert.deepEqual(group.seeds, baselineSeeds);
  }
});


test("group summaries isolate every numeric observer and preserve run provenance", async () => {
  const compiled = await loadWorld();
  const request = validateExperimentRequest({ experimentVersion: "0.1", world: "unused",
    parameters: { permissionLuckBias: [0, 0.001] }, runs: { seeds: [42, 43] },
    steps: 3, trace: { mode: "selected", seeds: [42] } });
  const result = runExperiment(compiled, request, LIMITS);
  assert.equal(result.groups.length, 2);
  for (const group of result.groups) {
    assert.equal(group.runCount, 2);
    assert.deepEqual(group.seeds, [42, 43]);
    assert.deepEqual(JSON.parse(group.key), { ...group.parameters });
    const runs = group.runIndices.map((index) => result.runs[index]);
    for (const run of runs) {
      assert.deepEqual({ ...run.manifest.parameters }, { ...group.parameters });
      const single = runWorld(compiled, { seed: run.manifest.seed,
        parameters: group.parameters, steps: 3, limits: LIMITS,
        trace: { enabled: run.manifest.trace.enabled } });
      assert.deepEqual(run.metrics, single.metrics);
      assert.equal(run.eventCount, single.eventCount);
      assert.deepEqual(run.trace, single.trace);
    }
    for (const id of ["mean_wealth", "wealth_gini", "permission_wealth_correlation"]) {
      const values = runs.map((run) => run.metrics.values[id]);
      assert.deepEqual(group.aggregates[id], { count: 2,
        mean: values.reduce((a, b) => a + b, 0) / 2,
        min: Math.min(...values), max: Math.max(...values) });
    }
    assert.equal(group.aggregates.wealth_histogram, undefined);
    const events = runs.map((run) => run.eventCount);
    assert.deepEqual(group.eventCount, { count: 2,
      mean: events.reduce((a, b) => a + b, 0) / 2,
      min: Math.min(...events), max: Math.max(...events) });
  }
  assert.deepEqual(result, runExperiment(compiled, request, LIMITS));
  assert.equal(result.aggregates.mean_wealth.count, 4);
});

test("group identity uses defaults and is independent of parameter insertion order", async () => {
  const compiled = await loadWorld();
  const run = (parameters) => runExperiment(compiled,
    validateExperimentRequest({ experimentVersion: "0.1", world: "unused",
      parameters, runs: { seeds: [1] }, steps: 1 }), LIMITS);
  const defaults = run({});
  const explicit = run({ ...defaults.runs[0].manifest.parameters });
  assert.deepEqual(defaults.groups, explicit.groups);
  const first = run({ permissionLuckBias: [0, 0.001], opportunityRate: [0.01, 0.02] });
  const reversed = run({ opportunityRate: [0.02, 0.01], permissionLuckBias: [0.001, 0] });
  assert.deepEqual(first.groups.map((g) => g.key), reversed.groups.map((g) => g.key));
  assert.equal(first.groups.length, 4);
  const duplicate = run({ permissionLuckBias: [0, 0] });
  assert.equal(duplicate.groups.length, 1);
  assert.equal(duplicate.groups[0].runCount, 2);
  assert.deepEqual(duplicate.groups[0].runIndices, [0, 1]);
  assert.deepEqual(duplicate.groups[0].seeds, [1, 1]);
});
