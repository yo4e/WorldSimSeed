// @ts-nocheck
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { WorldSimError } from "../src/errors.js";
import { DEFAULT_RESOURCE_LIMITS } from "../src/limits.js";
import {
  compileWorld,
  parseWorld,
  validateWorld,
} from "../src/spec/index.js";
import {
  runExperiment,
  runWorld,
  validateExperimentRequest,
} from "../src/runner/index.js";

const LIMITS = { ...DEFAULT_RESOURCE_LIMITS };

function compileYaml(source: string, limits = LIMITS) {
  return compileWorld(
    validateWorld(parseWorld(source, { format: "yaml" }), { limits }),
  );
}

function expectWorldSimError(code: string) {
  return (error: unknown) =>
    error instanceof WorldSimError && error.code === code;
}

async function schemaValidator() {
  const schema = JSON.parse(
    await readFile("schemas/world-spec-v0.1.schema.json", "utf8"),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

test("JSON Schema artifact and runtime validator agree on shared conformance fixtures", async () => {
  const validateSchema = await schemaValidator();

  for (const file of [
    "examples/talent-luck.world.yaml",
    "examples/threshold-recovery.world.yaml",
    "examples/resource-decay.world.yaml",
  ]) {
    const parsed = parseWorld(await readFile(file, "utf8"), { format: "yaml" });
    assert.equal(
      validateSchema(parsed),
      true,
      `${file} failed JSON Schema: ${JSON.stringify(validateSchema.errors)}`,
    );
    assert.doesNotThrow(() => validateWorld(parsed, { limits: LIMITS }));
  }

  const negativeFixtures = [
    {
      specVersion: "0.1",
      id: "unknown-field",
      time: { steps: 1 },
      world: { state: {} },
      events: [],
      observers: [],
      import: "./escape.js",
    },
    JSON.parse(`{
      "specVersion":"0.1",
      "id":"dangerous-name",
      "time":{"steps":1},
      "world":{"state":{"__proto__":{"type":"number","init":0}}},
      "events":[],
      "observers":[]
    }`),
    {
      specVersion: "0.1",
      id: "bad-agent-count",
      time: { steps: 1 },
      agents: {
        count: 0,
        state: { x: { type: "number", init: 0 } },
      },
      events: [],
      observers: [],
    },
    {
      specVersion: "0.1",
      id: "unsupported-op",
      time: { steps: 1 },
      world: {
        state: { x: { type: "number", mutable: true, init: 0 } },
      },
      events: [
        {
          id: "bad",
          scope: "world",
          effects: [{ target: "world.x", op: "divide", value: 2 }],
        },
      ],
      observers: [],
    },
  ];

  for (const fixture of negativeFixtures) {
    assert.equal(
      validateSchema(fixture),
      false,
      `JSON Schema unexpectedly accepted ${fixture.id}`,
    );
    assert.throws(
      () => validateWorld(fixture, { limits: LIMITS }),
      (error) => error instanceof WorldSimError,
      `runtime unexpectedly accepted ${fixture.id}`,
    );
  }
});

test("maxSteps and maxAgents reject before execution", () => {
  const source = `
specVersion: "0.1"
id: preflight-limits
time:
  steps: 2
agents:
  count: 2
  state:
    x:
      type: number
      init: 0
events: []
observers: []
`;
  const parsed = parseWorld(source, { format: "yaml" });

  assert.throws(
    () => validateWorld(parsed, { limits: { ...LIMITS, maxSteps: 1 } }),
    expectWorldSimError("RESOURCE_LIMIT"),
  );
  assert.throws(
    () => validateWorld(parsed, { limits: { ...LIMITS, maxAgents: 1 } }),
    expectWorldSimError("RESOURCE_LIMIT"),
  );
});

test("maxEvents stops a run with a structured resource error", () => {
  const compiled = compileYaml(`
specVersion: "0.1"
id: event-limit
time:
  steps: 3
world:
  state:
    x:
      type: number
      mutable: true
      init: 0
events:
  - id: increment
    scope: world
    effects:
      - target: world.x
        op: add
        value: 1
observers: []
`);

  assert.throws(
    () =>
      runWorld(compiled, {
        seed: 1,
        limits: { ...LIMITS, maxEvents: 1 },
      }),
    (error) =>
      error instanceof WorldSimError &&
      error.code === "RESOURCE_LIMIT" &&
      error.message === "Run exceeds maxEvents." &&
      error.details?.limit === 1,
  );
});

test("maxTraceRecords stops retained trace growth", () => {
  const compiled = compileYaml(`
specVersion: "0.1"
id: trace-limit
time:
  steps: 3
world:
  state:
    x:
      type: number
      mutable: true
      init: 0
events:
  - id: increment
    scope: world
    effects:
      - target: world.x
        op: add
        value: 1
observers: []
`);

  assert.throws(
    () =>
      runWorld(compiled, {
        seed: 1,
        limits: { ...LIMITS, maxTraceRecords: 1 },
        trace: { enabled: true },
      }),
    (error) =>
      error instanceof WorldSimError &&
      error.code === "RESOURCE_LIMIT" &&
      error.message === "Run exceeds maxTraceRecords." &&
      error.details?.limit === 1,
  );
});

test("batch rejects invalid request fields, derived seed overflow, and unknown parameters", () => {
  assert.throws(
    () =>
      validateExperimentRequest({
        experimentVersion: "0.1",
        world: "./world.yaml",
        runs: { seeds: [1] },
        command: "host-shell",
      }),
    expectWorldSimError("SCHEMA_ERROR"),
  );

  assert.throws(
    () =>
      validateExperimentRequest({
        experimentVersion: "0.1",
        world: "./world.yaml",
        runs: { seeds: { base: 0xffffffff, count: 2 } },
      }),
    expectWorldSimError("SCHEMA_ERROR"),
  );

  const compiled = compileYaml(`
specVersion: "0.1"
id: batch-unknown-parameter
time:
  steps: 1
world:
  state:
    x:
      type: number
      init: 0
events: []
observers:
  - id: x
    type: value
    source: world.x
`);

  const request = validateExperimentRequest({
    experimentVersion: "0.1",
    world: "./world.yaml",
    parameters: { nope: [1, 2] },
    runs: { seeds: [1] },
  });

  assert.throws(
    () => runExperiment(compiled, request, LIMITS),
    expectWorldSimError("SEMANTIC_ERROR"),
  );
});

test("batch replay is deterministic for Cartesian parameters and explicit seeds", () => {
  const compiled = compileYaml(`
specVersion: "0.1"
id: batch-replay
parameters:
  enabled:
    type: boolean
    default: true
time:
  steps: 4
agents:
  count: 4
  state:
    x:
      type: number
      mutable: true
      init: 0
events:
  - id: increment
    scope: agent
    condition: "param.enabled"
    chance: 0.5
    effects:
      - target: agent.x
        op: add
        value: 1
observers:
  - id: mean_x
    type: mean
    source: agent.x
`);

  const request = validateExperimentRequest({
    experimentVersion: "0.1",
    world: "./world.yaml",
    parameters: { enabled: [true, false] },
    runs: { seeds: [7, 9] },
    trace: { mode: "selected", seeds: [7] },
    limits: { maxRuns: 4 },
  });

  const a = runExperiment(compiled, request, LIMITS);
  const b = runExperiment(compiled, request, LIMITS);

  assert.equal(a.runCount, 4);
  assert.deepEqual(a, b);
  assert.equal(a.runs.filter((run) => run.trace !== undefined).length, 2);
  assert.deepEqual(
    a.runs.map((run) => [run.manifest.parameters.enabled, run.manifest.seed]),
    [
      [true, 7],
      [true, 9],
      [false, 7],
      [false, 9],
    ],
  );
});
