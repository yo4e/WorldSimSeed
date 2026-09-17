import type { ResourceLimits, Scalar } from "../spec/index.js";
import {
  createBrowserWorkerClient,
  WorldSimWorkerClient,
  WorldWorkerClientError,
} from "./client.js";
import type {
  WebRunExport,
  WebRunResult,
  WebSimulationView,
  WorldSourceFormat,
} from "./protocol.js";

export const WEB_COMPONENT_LIMITS: ResourceLimits = Object.freeze({
  maxAgents: 5_000,
  maxSteps: 5_000,
  maxEvents: 2_000_000,
  maxTraceRecords: 100_000,
  maxRuns: 1,
});

export interface WorldSimResetOptions {
  seed?: number;
  parameters?: Record<string, Scalar>;
  steps?: number;
  limits?: ResourceLimits;
  trace?: boolean;
}

export class WorldSimElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "seed"];
  }

  limits: ResourceLimits = { ...WEB_COMPONENT_LIMITS };
  parameters?: Record<string, Scalar>;
  steps?: number;
  trace = false;

  private client?: WorldSimWorkerClient;
  private inlineWorld?: string | Record<string, unknown>;
  private loaded = false;
  private busy = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.button("step").addEventListener("click", () => {
      void this.step().catch(() => undefined);
    });
    this.button("run").addEventListener("click", () => {
      void this.run().catch(() => undefined);
    });
    this.button("reset").addEventListener("click", () => {
      void this.reset().catch(() => undefined);
    });
    this.button("cancel").addEventListener("click", () => {
      void this.cancel().catch(() => undefined);
    });

    this.updateControls();
  }

  connectedCallback(): void {
    this.ensureClient();
    if (this.inlineWorld !== undefined || this.hasAttribute("src")) {
      void this.load().catch(() => undefined);
    }
  }

  disconnectedCallback(): void {
    this.client?.terminate();
    this.client = undefined;
    this.loaded = false;
    this.busy = false;
    this.updateControls();
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue || !this.isConnected) return;

    if (name === "src" && newValue) {
      void this.load().catch(() => undefined);
    } else if (name === "seed" && this.loaded) {
      void this.reset({ seed: this.seed }).catch(() => undefined);
    }
  }

  get seed(): number {
    const raw = this.getAttribute("seed");
    if (raw === null) return 42;
    const seed = Number(raw);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error("world-sim seed must be an unsigned 32-bit integer.");
    }
    return seed;
  }

  set seed(value: number) {
    this.setAttribute("seed", String(value));
  }

  set world(value: string | Record<string, unknown> | undefined) {
    this.inlineWorld = value;
    if (this.isConnected && value !== undefined) {
      void this.load(value).catch(() => undefined);
    }
  }

  get world(): string | Record<string, unknown> | undefined {
    return this.inlineWorld;
  }

  async load(
    input?: string | Record<string, unknown>,
    format?: WorldSourceFormat,
  ): Promise<WebSimulationView> {
    return this.perform(async () => {
      const source = await this.resolveSource(input, format);
      const view = await this.ensureClient().load({
        source: source.source,
        format: source.format,
        seed: this.seed,
        ...(this.parameters ? { parameters: { ...this.parameters } } : {}),
        ...(this.steps === undefined ? {} : { steps: this.steps }),
        limits: { ...this.limits },
        trace: this.trace,
      });
      this.loaded = true;
      this.updateView(view);
      this.emit("worldsim-ready", view);
      return view;
    });
  }

  async reset(options: WorldSimResetOptions = {}): Promise<WebSimulationView> {
    return this.perform(async () => {
      if (!this.loaded) return this.load();
      const view = await this.ensureClient().reset({
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        ...(options.parameters === undefined
          ? {}
          : { parameters: { ...options.parameters } }),
        ...(options.steps === undefined ? {} : { steps: options.steps }),
        ...(options.limits === undefined
          ? {}
          : { limits: { ...options.limits } }),
        ...(options.trace === undefined ? {} : { trace: options.trace }),
      });
      this.updateView(view);
      this.emit("worldsim-ready", view);
      return view;
    });
  }

  async step(): Promise<WebSimulationView> {
    return this.perform(async () => {
      const view = await this.ensureLoaded().then((client) => client.step());
      this.updateView(view);
      this.emit("worldsim-step", view);
      if (view.status === "completed") this.emit("worldsim-complete", view);
      return view;
    });
  }

  async run(chunkSize?: number): Promise<WebRunResult> {
    return this.perform(async () => {
      this.busy = true;
      this.updateControls();
      try {
        const result = await this.ensureLoaded().then((client) =>
          client.run(chunkSize),
        );
        this.updateView(result);
        if (result.cancelled) {
          this.emit("worldsim-cancelled", result);
        } else if (result.status === "completed") {
          this.emit("worldsim-complete", result);
        }
        return result;
      } finally {
        this.busy = false;
        this.updateControls();
      }
    });
  }

  async cancel(): Promise<{ cancelled: boolean }> {
    return this.perform(async () => {
      const result = await this.ensureClient().cancel();
      return result;
    });
  }

  async getState() {
    return this.perform(async () => this.ensureLoaded().then((client) => client.getState()));
  }

  async getMetrics() {
    return this.perform(async () =>
      this.ensureLoaded().then((client) => client.getMetrics()),
    );
  }

  async exportRun(): Promise<WebRunExport> {
    return this.perform(async () =>
      this.ensureLoaded().then((client) => client.exportRun()),
    );
  }

  private async resolveSource(
    input?: string | Record<string, unknown>,
    format?: WorldSourceFormat,
  ): Promise<{ source: string; format: WorldSourceFormat }> {
    const candidate = input ?? this.inlineWorld;
    if (candidate !== undefined) {
      if (typeof candidate === "string") {
        return { source: candidate, format: format ?? "yaml" };
      }
      return { source: JSON.stringify(candidate), format: "json" };
    }

    const src = this.getAttribute("src");
    if (!src) {
      throw new Error("world-sim requires src or a world property before load().");
    }

    const response = await fetch(src, { credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Failed to load world spec (${response.status}).`);
    }

    const url = new URL(response.url || src, document.baseURI);
    const sourceFormat: WorldSourceFormat = url.pathname.endsWith(".json")
      ? "json"
      : "yaml";
    return {
      source: await response.text(),
      format: sourceFormat,
    };
  }

  private ensureClient(): WorldSimWorkerClient {
    this.client ??= createBrowserWorkerClient();
    return this.client;
  }

  private async ensureLoaded(): Promise<WorldSimWorkerClient> {
    if (!this.loaded) await this.load();
    return this.ensureClient();
  }

  private updateView(view: WebSimulationView): void {
    const shadow = this.shadowRoot!;
    const title = shadow.querySelector<HTMLElement>("[data-world-title]")!;
    const status = shadow.querySelector<HTMLElement>("[data-status]")!;
    const metrics = shadow.querySelector<HTMLElement>("[data-metrics]")!;

    title.textContent = view.world.title ?? view.world.id;
    status.textContent = `${view.status} · t=${view.state.t}`;
    metrics.textContent = JSON.stringify(view.metrics.values, null, 2);
    this.updateControls();
  }

  private updateControls(): void {
    const step = this.button("step");
    const run = this.button("run");
    const reset = this.button("reset");
    const cancel = this.button("cancel");

    step.disabled = !this.loaded || this.busy;
    run.disabled = !this.loaded || this.busy;
    reset.disabled = !this.loaded || this.busy;
    cancel.disabled = !this.busy;
  }

  private button(action: string): HTMLButtonElement {
    return this.shadowRoot!.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    )!;
  }

  private emit(name: string, detail: unknown): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async perform<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const detail = serializeElementError(error);
      this.emit("worldsim-error", detail);
      const status = this.shadowRoot?.querySelector<HTMLElement>("[data-status]");
      if (status) status.textContent = `error · ${detail.code}`;
      throw error;
    }
  }
}

export function registerWorldSimElement(tagName = "world-sim"): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, WorldSimElement);
  }
}

function serializeElementError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof WorldWorkerClientError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: { ...error.details } } : {}),
    };
  }

  return {
    code: "HOST_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

const TEMPLATE = `
<style>
  :host {
    display: block;
    font-family: system-ui, sans-serif;
    color: var(--worldsim-foreground, CanvasText);
    background: var(--worldsim-background, Canvas);
  }
  [part="shell"] {
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  [part="header"] {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  [part="controls"] {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  button {
    font: inherit;
    padding: 0.4rem 0.75rem;
  }
  pre {
    overflow: auto;
    margin: 0;
    padding: 0.75rem;
    background: color-mix(in srgb, currentColor 7%, transparent);
    border-radius: 0.5rem;
  }
  [data-status] {
    opacity: 0.72;
    font-size: 0.9em;
  }
</style>
<section part="shell">
  <header part="header">
    <strong data-world-title>WorldSimSeed</strong>
    <span data-status>idle</span>
  </header>
  <div part="controls">
    <button type="button" data-action="step">Step</button>
    <button type="button" data-action="run">Run</button>
    <button type="button" data-action="reset">Reset</button>
    <button type="button" data-action="cancel">Stop</button>
  </div>
  <pre part="metrics" data-metrics>{}</pre>
</section>
`;
