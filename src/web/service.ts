import { createSimulation, type Simulation, type SimulationOptions } from "../core/index.js";
import { WorldSimError } from "../errors.js";
import { ENGINE_VERSION, type RunManifest } from "../runner/index.js";
import {
  compileWorld,
  parseWorld,
  validateWorld,
  type CompiledWorld,
  type ResourceLimits,
  type Scalar,
} from "../spec/index.js";
import { RANDOM_MODEL } from "../spec/random.js";
import type {
  WebRunExport,
  WebRunResult,
  WebSimulationView,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

interface StoredRunOptions {
  seed: number;
  parameters?: Record<string, Scalar>;
  steps?: number;
  limits: ResourceLimits;
  trace: boolean;
}

export class WorldWorkerService {
  private compiled?: CompiledWorld;
  private simulation?: Simulation;
  private options?: StoredRunOptions;
  private runInProgress = false;
  private cancelRequested = false;

  async handle(request: WorkerRequest): Promise<WorkerResponse> {
    try {
      if (request.type === "cancel") {
        this.cancelRequested = true;
        return success(request, { cancelled: this.runInProgress });
      }

      if (this.runInProgress) {
        throw new WorldSimError(
          "SEMANTIC_ERROR",
          "A run is already in progress. Cancel it before issuing another command.",
        );
      }

      switch (request.type) {
        case "load":
          return success(request, this.load(request));
        case "reset":
          return success(request, this.reset(request));
        case "step":
          return success(request, this.step());
        case "run":
          return success(request, await this.run(request.chunkSize));
        case "getState":
          return success(request, this.requireSimulation().snapshot());
        case "getMetrics":
          return success(request, this.requireSimulation().metrics());
        case "exportRun":
          return success(request, this.exportRun());
      }
    } catch (error) {
      return failure(request, error);
    }
  }

  private load(request: Extract<WorkerRequest, { type: "load" }>): WebSimulationView {
    const parsed = parseWorld(request.source, { format: request.format });
    const validated = validateWorld(parsed, { limits: request.limits });
    this.compiled = compileWorld(validated);
    this.options = {
      seed: request.seed,
      ...(request.parameters ? { parameters: { ...request.parameters } } : {}),
      ...(request.steps === undefined ? {} : { steps: request.steps }),
      limits: { ...request.limits },
      trace: request.trace === true,
    };
    this.simulation = createSimulation(this.compiled, toSimulationOptions(this.options));
    this.cancelRequested = false;
    return this.view();
  }

  private reset(request: Extract<WorkerRequest, { type: "reset" }>): WebSimulationView {
    const compiled = this.requireCompiled();
    const previous = this.requireOptions();
    this.options = {
      seed: request.seed ?? previous.seed,
      parameters:
        request.parameters === undefined
          ? previous.parameters
            ? { ...previous.parameters }
            : undefined
          : { ...request.parameters },
      steps: request.steps ?? previous.steps,
      limits: request.limits ? { ...request.limits } : { ...previous.limits },
      trace: request.trace ?? previous.trace,
    };
    this.simulation = createSimulation(compiled, toSimulationOptions(this.options));
    this.cancelRequested = false;
    return this.view();
  }

  private step(): WebSimulationView {
    const simulation = this.requireSimulation();
    if (simulation.status() === "running") simulation.step();
    return this.view();
  }

  private async run(chunkSize = 64): Promise<WebRunResult> {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0 || chunkSize > 10_000) {
      throw new WorldSimError(
        "SCHEMA_ERROR",
        "run.chunkSize must be an integer in [1, 10000].",
      );
    }

    const simulation = this.requireSimulation();
    this.runInProgress = true;
    this.cancelRequested = false;

    try {
      while (simulation.status() === "running" && !this.cancelRequested) {
        for (
          let index = 0;
          index < chunkSize && simulation.status() === "running";
          index += 1
        ) {
          simulation.step();
        }

        if (simulation.status() === "running" && !this.cancelRequested) {
          await yieldToEventLoop();
        }
      }

      return {
        ...this.view(),
        cancelled: this.cancelRequested,
      };
    } finally {
      this.runInProgress = false;
      this.cancelRequested = false;
    }
  }

  private exportRun(): WebRunExport {
    const simulation = this.requireSimulation();
    const compiled = this.requireCompiled();
    const options = this.requireOptions();

    if (simulation.status() !== "completed") {
      throw new WorldSimError(
        "SEMANTIC_ERROR",
        "exportRun requires a completed simulation.",
      );
    }

    const manifest: RunManifest = {
      manifestVersion: "0.1",
      engine: {
        name: "WorldSimSeed",
        version: ENGINE_VERSION,
        randomModel: RANDOM_MODEL,
      },
      world: {
        id: compiled.spec.id,
        specVersion: compiled.spec.specVersion,
        specHash: compiled.specHash,
      },
      seed: simulation.seed,
      steps: simulation.targetSteps,
      parameters: simulation.parameters,
      observers: compiled.observers.map((observer) => observer.id),
      trace: {
        enabled: options.trace,
      },
      limits: { ...options.limits },
      result: {
        status: "completed",
      },
    };

    const trace = options.trace ? simulation.trace() : undefined;
    return {
      manifest,
      finalState: simulation.snapshot(),
      metrics: simulation.metrics(),
      ...(trace ? { trace } : {}),
    };
  }

  private view(): WebSimulationView {
    const compiled = this.requireCompiled();
    const simulation = this.requireSimulation();
    return {
      world: {
        id: compiled.spec.id,
        ...(compiled.spec.title ? { title: compiled.spec.title } : {}),
        specHash: compiled.specHash,
      },
      status: simulation.status(),
      state: simulation.snapshot(),
      metrics: simulation.metrics(),
    };
  }

  private requireCompiled(): CompiledWorld {
    if (!this.compiled) {
      throw new WorldSimError("SEMANTIC_ERROR", "No world has been loaded.");
    }
    return this.compiled;
  }

  private requireSimulation(): Simulation {
    if (!this.simulation) {
      throw new WorldSimError("SEMANTIC_ERROR", "No world has been loaded.");
    }
    return this.simulation;
  }

  private requireOptions(): StoredRunOptions {
    if (!this.options) {
      throw new WorldSimError("SEMANTIC_ERROR", "No world has been loaded.");
    }
    return this.options;
  }
}

function toSimulationOptions(options: StoredRunOptions): SimulationOptions {
  return {
    seed: options.seed,
    ...(options.parameters ? { parameters: { ...options.parameters } } : {}),
    ...(options.steps === undefined ? {} : { steps: options.steps }),
    limits: { ...options.limits },
    trace: { enabled: options.trace },
  };
}

function success(
  request: WorkerRequest,
  data: unknown,
): WorkerResponse {
  return {
    id: request.id,
    type: request.type,
    ok: true,
    data,
  };
}

function failure(
  request: WorkerRequest,
  error: unknown,
): WorkerResponse {
  if (error instanceof WorldSimError) {
    return {
      id: request.id,
      type: request.type,
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: { ...error.details } } : {}),
      },
    };
  }

  return {
    id: request.id,
    type: request.type,
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
