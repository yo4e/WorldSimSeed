// @ts-nocheck
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runWorld } from "../src/runner/index.js";
import { compileWorld, parseWorld, validateWorld } from "../src/spec/index.js";
import { WorldWorkerService } from "../src/web/service.js";

const LIMITS = {
  maxAgents: 5_000,
  maxSteps: 5_000,
  maxEvents: 2_000_000,
  maxTraceRecords: 100_000,
  maxRuns: 10,
};

test("worker service matches headless result for the same seed", async () => {
  const source = await readFile("examples/talent-luck.world.yaml", "utf8");
  const compiled = compileWorld(
    validateWorld(parseWorld(source, { format: "yaml" }), { limits: LIMITS }),
  );
  const headless = runWorld(compiled, {
    seed: 42,
    limits: LIMITS,
    trace: { enabled: false },
  });

  const service = new WorldWorkerService();
  const loaded = await service.handle({
    id: 1,
    type: "load",
    source,
    format: "yaml",
    seed: 42,
    limits: LIMITS,
  });
  assert.equal(loaded.ok, true);

  const completed = await service.handle({
    id: 2,
    type: "run",
    chunkSize: 7,
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.data.status, "completed");
  assert.equal(completed.data.cancelled, false);
  assert.deepEqual(completed.data.metrics, headless.metrics);
  assert.deepEqual(completed.data.state, headless.finalState);
});

test("reset reproduces the same first step", async () => {
  const source = await readFile("examples/resource-decay.world.yaml", "utf8");
  const service = new WorldWorkerService();

  const loaded = await service.handle({
    id: 1,
    type: "load",
    source,
    format: "yaml",
    seed: 7,
    steps: 10,
    limits: LIMITS,
  });
  assert.equal(loaded.ok, true);

  const first = await service.handle({ id: 2, type: "step" });
  assert.equal(first.ok, true);

  const reset = await service.handle({ id: 3, type: "reset", seed: 7 });
  assert.equal(reset.ok, true);

  const replay = await service.handle({ id: 4, type: "step" });
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.data.state, first.data.state);
  assert.deepEqual(replay.data.metrics, first.data.metrics);
});

test("cancel interrupts a chunked run without corrupting the simulation", async () => {
  const source = `
specVersion: "0.1"
id: cancellable
parameters: {}
time:
  steps: 500
world:
  state:
    counter:
      type: number
      mutable: true
      init: 0
events:
  - id: increment
    scope: world
    effects:
      - target: world.counter
        op: add
        value: 1
observers:
  - id: counter
    type: value
    source: world.counter
`;

  const service = new WorldWorkerService();
  const loaded = await service.handle({
    id: 1,
    type: "load",
    source,
    format: "yaml",
    seed: 1,
    limits: LIMITS,
  });
  assert.equal(loaded.ok, true);

  const runPromise = service.handle({ id: 2, type: "run", chunkSize: 1 });
  const cancel = await service.handle({ id: 3, type: "cancel" });
  assert.equal(cancel.ok, true);
  assert.equal(cancel.data.cancelled, true);

  const run = await runPromise;
  assert.equal(run.ok, true);
  assert.equal(run.data.cancelled, true);
  assert.equal(run.data.status, "running");
  assert.ok(run.data.state.t > 0);
  assert.ok(run.data.state.t < 500);

  const resumed = await service.handle({ id: 4, type: "run", chunkSize: 32 });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.data.status, "completed");
  assert.equal(resumed.data.state.world.counter, 500);
});

test("exportRun is rejected before completion and works after completion", async () => {
  const source = await readFile("examples/resource-decay.world.yaml", "utf8");
  const service = new WorldWorkerService();
  await service.handle({
    id: 1,
    type: "load",
    source,
    format: "yaml",
    seed: 9,
    steps: 3,
    limits: LIMITS,
  });

  const early = await service.handle({ id: 2, type: "exportRun" });
  assert.equal(early.ok, false);
  assert.equal(early.error.code, "SEMANTIC_ERROR");

  await service.handle({ id: 3, type: "run", chunkSize: 2 });
  const exported = await service.handle({ id: 4, type: "exportRun" });
  assert.equal(exported.ok, true);
  assert.equal(exported.data.manifest.seed, 9);
  assert.equal(exported.data.manifest.result.status, "completed");
  assert.equal(exported.data.finalState.t, 3);
});
