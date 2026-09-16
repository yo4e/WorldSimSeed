// @ts-nocheck
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { WorldSimError } from "./errors.js";
import { compileWorld, parseWorld, validateWorld } from "./spec/index.js";
import { runWorld } from "./runner/index.js";

const CLI_LIMITS = Object.freeze({
  maxAgents: 10_000,
  maxSteps: 10_000,
  maxEvents: 10_000_000,
  maxTraceRecords: 100_000,
  maxRuns: 1,
});

async function main() {
  const [, , command, file, ...args] = process.argv;

  if (command !== "run" || !file) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const seed = readIntegerFlag(args, "--seed", 42);
  const steps = readOptionalIntegerFlag(args, "--steps");
  const trace = args.includes("--trace");

  const source = await readFile(file, "utf8");
  const format = extname(file).toLowerCase() === ".json" ? "json" : "yaml";
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
        ...(trace ? { traceRecords: result.trace?.length ?? 0 } : {}),
      },
      null,
      2,
    ),
  );
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
      "",
      "The CLI limits in this development vertical slice are provisional adapter limits,",
      "not the benchmark-derived v0.1 release defaults.",
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
