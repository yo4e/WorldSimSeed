// @ts-nocheck
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WorldSimError } from "../src/errors.js";
import {
  compileWorld,
  parseExpression,
  parseWorld,
  sha256Hex,
  validateWorld,
} from "../src/spec/index.js";
import { runWorld } from "../src/runner/index.js";

const LIMITS = {
  maxAgents: 5000,
  maxSteps: 500,
  maxEvents: 1_000_000,
  maxTraceRecords: 100_000,
  maxRuns: 1000,
};

test("portable sha256 implementation matches known vector", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("restricted YAML parses and validates the reference world", async () => {
  const source = await readFile("examples/talent-luck.world.yaml", "utf8");
  const parsed = parseWorld(source, { format: "yaml" });
  const spec = validateWorld(parsed, { limits: LIMITS });
  const compiled = compileWorld(spec);

  assert.equal(spec.id, "talent-luck");
  assert.equal(spec.agents?.count, 1000);
  assert.match(compiled.specHash, /^sha256:[0-9a-f]{64}$/);
});

test("expression parser rejects random() and host globals", () => {
  assert.throws(
    () => parseExpression("random() < 0.5"),
    (error) =>
      error instanceof WorldSimError && error.code === "EXPRESSION_ERROR",
  );

  assert.throws(
    () => parseExpression("globalThis.process != 0"),
    (error) =>
      error instanceof WorldSimError && error.code === "EXPRESSION_ERROR",
  );
});

test("semantic validator rejects agent event mutation of world state", () => {
  const source = `
specVersion: "0.1"
id: illegal-world-write
time:
  steps: 1
world:
  state:
    resource:
      type: number
      mutable: true
      init: 10
agents:
  count: 1
  state:
    wealth:
      type: number
      mutable: true
      init: 1
events:
  - id: bad
    scope: agent
    effects:
      - target: world.resource
        op: add
        value: -1
observers: []
`;

  const parsed = parseWorld(source, { format: "yaml" });
  assert.throws(
    () => validateWorld(parsed, { limits: LIMITS }),
    (error) =>
      error instanceof WorldSimError && error.code === "SEMANTIC_ERROR",
  );
});

test("same spec and seed produce identical reference-world results", async () => {
  const source = await readFile("examples/talent-luck.world.yaml", "utf8");
  const compiled = compileWorld(
    validateWorld(parseWorld(source, { format: "yaml" }), { limits: LIMITS }),
  );

  const a = runWorld(compiled, {
    seed: 42,
    limits: LIMITS,
    trace: { enabled: false },
  });
  const b = runWorld(compiled, {
    seed: 42,
    limits: LIMITS,
    trace: { enabled: false },
  });
  const c = runWorld(compiled, {
    seed: 43,
    limits: LIMITS,
    trace: { enabled: false },
  });

  assert.deepEqual(a.metrics, b.metrics);
  assert.deepEqual(a.finalState, b.finalState);
  assert.notDeepEqual(
    a.finalState.agents?.slice(0, 20),
    c.finalState.agents?.slice(0, 20),
  );
  assert.equal(a.manifest.seed, 42);
  assert.equal(a.manifest.world.specHash, b.manifest.world.specHash);
});

test("threshold recovery sample parses and runs", async () => {
  const source = await readFile("examples/threshold-recovery.world.yaml", "utf8");
  const compiled = compileWorld(
    validateWorld(parseWorld(source, { format: "yaml" }), { limits: LIMITS }),
  );

  const result = runWorld(compiled, {
    seed: 99,
    steps: 5,
    limits: LIMITS,
  });

  assert.equal(result.finalState.t, 5);
  assert.equal(result.history.mean_stress?.length, 6);
  assert.equal(typeof result.metrics.values.high_stress_count, "number");
});

test("world-only sample records every-step history", async () => {
  const source = await readFile("examples/resource-decay.world.yaml", "utf8");
  const compiled = compileWorld(
    validateWorld(parseWorld(source, { format: "yaml" }), { limits: LIMITS }),
  );

  const result = runWorld(compiled, {
    seed: 7,
    steps: 10,
    limits: LIMITS,
  });

  assert.equal(result.finalState.t, 10);
  assert.equal(result.history.resource?.length, 11);
  assert.equal(result.history.resource?.[0]?.t, 0);
  assert.equal(result.history.resource?.[10]?.t, 10);
});

test("preflight resource limits reject oversized worlds", () => {
  const source = `
specVersion: "0.1"
id: too-many
time:
  steps: 1
agents:
  count: 10
  state:
    x:
      type: number
      init: 0
events: []
observers: []
`;

  const parsed = parseWorld(source, { format: "yaml" });
  assert.throws(
    () =>
      validateWorld(parsed, {
        limits: {
          ...LIMITS,
          maxAgents: 5,
        },
      }),
    (error) =>
      error instanceof WorldSimError && error.code === "RESOURCE_LIMIT",
  );
});

test("restricted YAML rejects anchors and aliases", () => {
  assert.throws(
    () =>
      parseWorld(
        `
specVersion: "0.1"
id: anchored
time: &clock
  steps: 1
events: []
observers: []
world:
  state: {}
`,
        { format: "yaml" },
      ),
    (error) =>
      error instanceof WorldSimError && error.code === "PARSE_ERROR",
  );
});
