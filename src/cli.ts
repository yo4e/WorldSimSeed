// @ts-nocheck
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { WorldSimError } from "./errors.js";
import { DEFAULT_RESOURCE_LIMITS } from "./limits.js";
import {
  compileWorld,
  parseData,
  parseWorld,
  validateWorld,
} from "./spec/index.js";
import {
  runExperiment,
  runWorld,
  validateExperimentRequest,
} from "./runner/index.js";

const CLI_LIMITS = DEFAULT_RESOURCE_LIMITS;

async function main() {
  const [, , command, file, ...args] = process.argv;

  if (!file || (command !== "run" && command !== "experiment")) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (command === "run") {
    await runSingle(file, args);
    return;
  }

  await runBatch(file);
}

async function runSingle(file, args) {
  const seed = readIntegerFlag(args, "--seed", 42);
  const steps = readOptionalIntegerFlag(args, "--steps");
  const trace = args.includes("--trace");

  const source = await readFile(file, "utf8");
  const format = detectFormat(file);
  const parsed = parseWorld(source, { format });
  const validated = validateWorld(parsed, { limits: CLI_LIMITS });
  const compiled = compileWorld(validated);

  const result = runWorld(compiled, {
    seed,
    ...(steps === undefined ? {} : { steps }),
    limits: CLI_LIMITS,
    trace: { enabled: trace },
  });

  console.log(
    JSON.stringify(
      {
        manifest: result.manifest,
        metrics: result.metrics,
        eventCount: result.eventCount,
        ...(trace ? { traceRecords: result.trace?.length ?? 0 } : {}),
      },
      null,
      2,
    ),
  );
}

async function runBatch(file) {
  const source = await readFile(file, "utf8");
  const parsed = parseData(source, { format: detectFormat(file) });
  const request = validateExperimentRequest(parsed);

  const worldPath = resolve(dirname(file), request.world);
  const worldSource = await readFile(worldPath, "utf8");
  const worldParsed = parseWorld(worldSource, { format: detectFormat(worldPath) });
  const world = validateWorld(worldParsed, { limits: CLI_LIMITS });
  const compiled = compileWorld(world);

  const result = runExperiment(compiled, request, CLI_LIMITS);
  const tracedRuns = result.runs.filter((run) => run.trace !== undefined).length;

  console.log(
    JSON.stringify(
      {
        experimentVersion: result.experimentVersion,
        world: result.world,
        runCount: result.runCount,
        aggregates: result.aggregates,
        eventCount: result.eventCount,
        tracedRuns,
      },
      null,
      2,
    ),
  );
}

function detectFormat(file) {
  return extname(file).toLowerCase() === ".json" ? "json" : "yaml";
}

function readIntegerFlag(args, name, fallback) {
  const value = readOptionalIntegerFlag(args, name);
  return value ?? fallback;
}

function readOptionalIntegerFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const raw = args[index + 1];
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} requires an integer.`);
  }
  return value;
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  worldsimseed run <world.yaml|world.json> --seed <uint32> [--steps N] [--trace]",
      "  worldsimseed experiment <experiment.yaml|experiment.json>",
      "",
      "Runs are constrained by the conservative v0.1 host defaults documented in",
      "docs/resource-benchmark-v0.1.md. World specs cannot raise those limits.",
    ].join("\n"),
  );
}

main().catch((error) => {
  if (error instanceof WorldSimError) {
    console.error(
      JSON.stringify(
        {
          error: error.code,
          message: error.message,
          details: error.details,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
