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
    baselineAgents.map((agent) => agent.self_permission),
    biasedAgents.map((agent) => agent.self_permission),
  );

  assert.ok(biased.eventCount > baseline.eventCount);
  assert.ok(
    Number(biased.metrics.values.mean_wealth) >
      Number(baseline.metrics.values.mean_wealth),
  );

  for (let index = 0; index < baselineAgents.length; index += 1) {
    assert.ok(
      Number(biasedAgents[index].wealth) >= Number(baselineAgents[index].wealth),
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
  // Scenario-specific paired analysis therefore reads per-run records instead.
  assert.equal(result.aggregates.mean_wealth?.count, 40);
  assert.equal(result.eventCount.count, 40);
});
