import { expect, test } from "@playwright/test";

test("Pages demo explains the Talent × Luck world and translates a step", async ({ page }) => {
  await page.goto("/index.html");

  await expect(
    page.getByRole("heading", {
      name: "1,000 people start equally wealthy. Then chance gets a vote.",
    }),
  ).toBeVisible();
  await expect(page.locator("#demo-status")).toHaveText("Ready");
  await expect(page.locator("#step-label")).toHaveText("Step 0 / 80");
  await expect(page.locator("#mean-wealth")).toHaveText("10");
  await expect(page.locator("#wealth-gini")).toHaveText("0");

  const component = page.locator("world-sim");
  await component.locator('button[data-action="step"]').click();

  await expect(page.locator("#step-label")).toHaveText("Step 1 / 80");
  await expect(page.locator("#activity-sub")).toContainText("Step 1");
  await expect(page.locator("#event-list")).toContainText("lucky opportunities");
  await expect(page.locator("#event-list")).toContainText("misfortunes");
  await expect(page.locator("#histogram span")).toHaveCount(20);
});

test("Pages demo keeps deterministic replay visible and understandable", async ({ page }) => {
  await page.goto("/index.html");

  const component = page.locator("world-sim");
  const runButton = component.locator('button[data-action="run"]');

  await expect(page.locator("#demo-status")).toHaveText("Ready");
  await runButton.click();
  await expect(page.locator("#demo-status")).toHaveText("Complete");
  await expect(page.locator("#step-label")).toHaveText("Step 80 / 80");
  const firstSummary = await page.locator("#raw-metrics").textContent();

  await page.locator("#seed").fill("7");
  await page.locator("#apply-seed").click();
  await expect(page.locator("#demo-status")).toHaveText("Ready");

  await page.locator("#seed").fill("42");
  await page.locator("#apply-seed").click();
  await expect(page.locator("#seed-note")).toContainText("reproduces the same deterministic history");
  await expect(page.locator("#demo-status")).toHaveText("Ready");

  await runButton.click();
  await expect(page.locator("#demo-status")).toHaveText("Complete");
  const replaySummary = await page.locator("#raw-metrics").textContent();

  expect(replaySummary).toBe(firstSummary);
});
