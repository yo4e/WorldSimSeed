import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runWorld } from "../dist/src/runner/index.js";
import {
  compileWorld,
  parseWorld,
  validateWorld,
} from "../dist/src/spec/index.js";

const LIMITS = {
  maxAgents: 5_000,
  maxSteps: 5_000,
  maxEvents: 2_000_000,
  maxTraceRecords: 100_000,
  maxRuns: 1,
};

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
