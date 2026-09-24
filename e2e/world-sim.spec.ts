import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runWorld } from "../dist/src/runner/index.js";
import {
  compileWorld,
  parseWorld,
  validateWorld,
} from "../dist/src/spec/index.js";
import { DEFAULT_RESOURCE_LIMITS } from "../dist/src/limits.js";

const LIMITS = {
  ...DEFAULT_RESOURCE_LIMITS,
  maxRuns: 1,
};

test("Pages demo shell loads the real worker runtime and replays seed 42", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.getByRole("heading", { name: "WorldSimSeed" })).toBeVisible();
  const component = page.locator("world-sim");
  const status = component.locator("[data-status]");
  const runButton = component.locator('button[data-action="run"]');

  await expect(status).toContainText("running · t=0");
  await runButton.click();
  await expect(status).toContainText("completed · t=80");
  const firstMetrics = await component.locator("[data-metrics]").textContent();

  await page.locator("#seed").fill("7");
  await page.locator("#apply-seed").click();
  await expect(status).toContainText("running · t=0");

  await page.locator("#seed").fill("42");
  await page.locator("#apply-seed").click();
  await expect(status).toContainText("running · t=0");
  await runButton.click();
  await expect(status).toContainText("completed · t=80");
  const replayMetrics = await component.locator("[data-metrics]").textContent();

  expect(replayMetrics).toBe(firstMetrics);
});

test("world-sim Worker matches headless metrics for the same seed", async ({ page }) => {
  const source = await readFile("examples/talent-luck.world.yaml", "utf8");
  const compiled = compileWorld(
    validateWorld(parseWorld(source, { format: "yaml" }), { limits: LIMITS }),
  );
  const headless = runWorld(compiled, {
    seed: 42,
    limits: LIMITS,
    trace: { enabled: false },
  });

  await page.goto("/examples/web/index.html");

  const component = page.locator("world-sim");
  const status = component.locator("[data-status]");
  await expect(status).toContainText("running · t=0");

  await component.locator('button[data-action="run"]').click();
  await expect(status).toContainText("completed · t=80");

  const metricsText = await component.locator("[data-metrics]").textContent();
  expect(metricsText).not.toBeNull();
  expect(JSON.parse(metricsText!)).toEqual(headless.metrics.values);

  const exported = await component.evaluate(async (element) => {
    return await (element as unknown as { exportRun(): Promise<unknown> }).exportRun();
  });
  expect(exported).toMatchObject({
    manifest: {
      seed: 42,
      world: {
        id: "talent-luck",
        specHash: headless.manifest.world.specHash,
      },
      result: { status: "completed" },
    },
    finalState: { t: 80 },
  });
});

test("world-sim emits a safe error event for forbidden expressions", async ({ page }) => {
  await page.goto("/examples/web/index.html");

  const detail = await page.evaluate(async () => {
    const element = document.createElement("world-sim") as HTMLElement & {
      world?: string;
    };

    const error = new Promise<unknown>((resolve) => {
      element.addEventListener(
        "worldsim-error",
        (event) => resolve((event as CustomEvent).detail),
        { once: true },
      );
    });

    document.body.append(element);
    element.world = `
specVersion: "0.1"
id: bad-expression
time:
  steps: 1
agents:
  count: 1
  state:
    x:
      type: number
      mutable: true
      init: 0
events:
  - id: bad
    scope: agent
    condition: "random() < 0.5"
    effects:
      - target: agent.x
        op: add
        value: 1
observers: []
`;

    return await error;
  });

  expect(detail).toMatchObject({
    code: "EXPRESSION_ERROR",
  });
  expect(detail).not.toHaveProperty("stack");
});

test("world-sim component methods step, reset, inspect, cancel, resume, and export", async ({ page }) => {
  await page.goto("/examples/web/index.html");

  const result = await page.evaluate(async () => {
    type View = {
      status: string;
      cancelled?: boolean;
      state: { t: number; world?: Record<string, number> };
      metrics: { t: number; values: Record<string, unknown> };
    };
    type ElementApi = HTMLElement & {
      load(input: Record<string, unknown>): Promise<View>;
      step(): Promise<View>;
      run(chunkSize?: number): Promise<View & { cancelled: boolean }>;
      cancel(): Promise<{ cancelled: boolean }>;
      reset(options?: { seed?: number }): Promise<View>;
      getState(): Promise<View["state"]>;
      getMetrics(): Promise<View["metrics"]>;
      exportRun(): Promise<{ finalState: View["state"] }>;
    };

    const element = document.createElement("world-sim") as ElementApi;
    document.body.append(element);

    await element.load({
      specVersion: "0.1",
      id: "component-api",
      time: { steps: 500 },
      world: {
        state: {
          counter: { type: "number", mutable: true, init: 0 },
        },
      },
      events: [
        {
          id: "increment",
          scope: "world",
          effects: [{ target: "world.counter", op: "add", value: 1 }],
        },
      ],
      observers: [{ id: "counter", type: "value", source: "world.counter" }],
    });

    const stepped = await element.step();
    const stateAfterStep = await element.getState();
    const metricsAfterStep = await element.getMetrics();
    const reset = await element.reset({ seed: 42 });

    const runPromise = element.run(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cancel = await element.cancel();
    const interrupted = await runPromise;
    const resumed = await element.run(32);
    const exported = await element.exportRun();

    return {
      steppedT: stepped.state.t,
      stateT: stateAfterStep.t,
      metricsT: metricsAfterStep.t,
      resetT: reset.state.t,
      cancelAcknowledged: cancel.cancelled,
      interruptedCancelled: interrupted.cancelled,
      interruptedT: interrupted.state.t,
      resumedStatus: resumed.status,
      resumedT: resumed.state.t,
      exportedT: exported.finalState.t,
    };
  });

  expect(result.steppedT).toBe(1);
  expect(result.stateT).toBe(1);
  expect(result.metricsT).toBe(1);
  expect(result.resetT).toBe(0);
  expect(result.cancelAcknowledged).toBe(true);
  expect(result.interruptedCancelled).toBe(true);
  expect(result.interruptedT).toBeLessThan(500);
  expect(result.resumedStatus).toBe("completed");
  expect(result.resumedT).toBe(500);
  expect(result.exportedT).toBe(500);
});

test("world-sim src fetch is host-owned and omits ambient credentials", async ({ page }) => {
  await page.goto("/examples/web/index.html");

  const credentials = await page.evaluate(async () => {
    const target = "https://example.invalid/untrusted.world.yaml";
    const source = `
specVersion: "0.1"
id: host-fetch-boundary
time:
  steps: 1
world:
  state:
    x:
      type: number
      init: 1
events: []
observers: []
`;

    const originalFetch = window.fetch.bind(window);
    let captured: RequestCredentials | undefined;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === target) {
        captured = init?.credentials;
        return new Response(source, {
          status: 200,
          headers: { "content-type": "text/yaml" },
        });
      }
      return originalFetch(input, init);
    };

    try {
      const element = document.createElement("world-sim");
      element.setAttribute("src", target);
      const ready = new Promise<void>((resolve, reject) => {
        element.addEventListener("worldsim-ready", () => resolve(), { once: true });
        element.addEventListener(
          "worldsim-error",
          (event) => reject(new Error(JSON.stringify((event as CustomEvent).detail))),
          { once: true },
        );
      });
      document.body.append(element);
      await ready;
      return captured;
    } finally {
      window.fetch = originalFetch;
    }
  });

  expect(credentials).toBe("omit");
});

test("worker run keeps the browser main thread responsive", async ({ page }) => {
  await page.goto("/examples/web/index.html");

  const result = await page.evaluate(async () => {
    const element = document.createElement("world-sim") as HTMLElement & {
      load(input: Record<string, unknown>): Promise<unknown>;
      run(chunkSize?: number): Promise<{
        status: string;
        cancelled: boolean;
        state: { t: number };
      }>;
    };
    document.body.append(element);

    await element.load({
      specVersion: "0.1",
      id: "browser-benchmark",
      time: { steps: 200 },
      agents: {
        count: 2_000,
        state: {
          x: { type: "number", mutable: true, init: 0 },
        },
      },
      events: [
        {
          id: "increment",
          scope: "agent",
          chance: 0.05,
          effects: [{ target: "agent.x", op: "add", value: 1 }],
        },
      ],
      observers: [{ id: "mean_x", type: "mean", source: "agent.x" }],
    });

    let mainThreadTicks = 0;
    const timer = window.setInterval(() => {
      mainThreadTicks += 1;
    }, 0);
    const started = performance.now();
    const run = await element.run(8);
    const durationMs = Math.round((performance.now() - started) * 10) / 10;
    window.clearInterval(timer);

    return {
      durationMs,
      mainThreadTicks,
      status: run.status,
      cancelled: run.cancelled,
      t: run.state.t,
    };
  });

  console.log(`WSS_BROWSER_BENCH ${JSON.stringify(result)}`);
  expect(result.status).toBe("completed");
  expect(result.cancelled).toBe(false);
  expect(result.t).toBe(200);
  expect(result.mainThreadTicks).toBeGreaterThan(0);
});
