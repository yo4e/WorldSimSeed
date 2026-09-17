import type { MetricsResult, SimulationSnapshot } from "../core/index.js";
import type { ResourceLimits, Scalar } from "../spec/index.js";
import type {
  SerializedWorkerError,
  WebRunExport,
  WebRunResult,
  WebSimulationView,
  WorkerRequest,
  WorkerResponse,
  WorldSourceFormat,
} from "./protocol.js";

export interface WorkerTransport {
  postMessage(message: WorkerRequest): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void;
  addEventListener(
    type: "error",
    listener: (event: ErrorEvent) => void,
  ): void;
  terminate?(): void;
}

export class WorldWorkerClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(error: SerializedWorkerError) {
    super(error.message);
    this.name = "WorldWorkerClientError";
    this.code = error.code;
    this.details = error.details;
  }
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
}

export class WorldSimWorkerClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly worker: WorkerTransport) {
    worker.addEventListener("message", (event) => this.onMessage(event.data));
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "WorldSimSeed worker failed.");
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
  }

  load(options: {
    source: string;
    format: WorldSourceFormat;
    seed: number;
    parameters?: Record<string, Scalar>;
    steps?: number;
    limits: ResourceLimits;
    trace?: boolean;
  }): Promise<WebSimulationView> {
    return this.request<WebSimulationView>({ type: "load", ...options });
  }

  reset(options: {
    seed?: number;
    parameters?: Record<string, Scalar>;
    steps?: number;
    limits?: ResourceLimits;
    trace?: boolean;
  } = {}): Promise<WebSimulationView> {
    return this.request<WebSimulationView>({ type: "reset", ...options });
  }

  step(): Promise<WebSimulationView> {
    return this.request<WebSimulationView>({ type: "step" });
  }

  run(chunkSize?: number): Promise<WebRunResult> {
    return this.request<WebRunResult>({
      type: "run",
      ...(chunkSize === undefined ? {} : { chunkSize }),
    });
  }

  cancel(): Promise<{ cancelled: boolean }> {
    return this.request<{ cancelled: boolean }>({ type: "cancel" });
  }

  getState(): Promise<SimulationSnapshot> {
    return this.request<SimulationSnapshot>({ type: "getState" });
  }

  getMetrics(): Promise<MetricsResult> {
    return this.request<MetricsResult>({ type: "getMetrics" });
  }

  exportRun(): Promise<WebRunExport> {
    return this.request<WebRunExport>({ type: "exportRun" });
  }

  terminate(): void {
    this.worker.terminate?.();
    const error = new Error("WorldSimSeed worker terminated.");
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  private request<T>(
    request: Omit<WorkerRequest, "id">,
  ): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.worker.postMessage({ ...request, id } as WorkerRequest);
    });
  }

  private onMessage(response: WorkerResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.data);
    } else {
      pending.reject(new WorldWorkerClientError(response.error));
    }
  }
}

export function createBrowserWorkerClient(): WorldSimWorkerClient {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
    name: "worldsimseed",
  });
  return new WorldSimWorkerClient(worker);
}
