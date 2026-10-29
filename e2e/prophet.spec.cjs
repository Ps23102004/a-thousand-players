// Recorded Super response + real offline CPU crowds. No live model endpoint is called.
const { test, expect } = require("playwright/test");
const sample = require("../data/samples/balance.json");

test("example tuning runs a paired crowd and displays measured archetype rates beside tuning", async ({ page }) => {
  await page.route("**/api/balance", (route) => route.fulfill({ json: sample.response }));
  await page.goto("/modes/balance");
  await page.getByRole("button", { name: "Use an example", exact: true }).click();
  await page.getByRole("button", { name: "Translate to tuning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tuning changes", exact: true })).toBeVisible();
  const response = page.waitForResponse((r) => r.url().endsWith("/api/prophet") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Run Patch Prophet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Running the crowd...", exact: true })).toBeDisabled();
  const res = await response;
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.before.rounds).toBe(body.personas);
  expect(body.after.rounds).toBe(body.personas);
  expect(body.cached).toBe(false);
  const panel = page.getByRole("region", { name: "Patch Prophet results" });
  await expect(panel).toContainText(`sample of ${body.personas} personas, 1 round each, not the full 1000`);
  await expect(panel).toContainText(`Bug rounds: ${body.before.bugRounds} before → ${body.after.bugRounds} after`);
  for (const row of body.before.byArchetype) {
    const after = body.after.byArchetype.find((r) => r.archetype === row.archetype);
    const tr = panel.getByRole("row").filter({ hasText: row.archetype });
    await expect(tr).toContainText(`${(100 * row.winRate).toFixed(1)}%`);
    await expect(tr).toContainText(`${(100 * after.winRate).toFixed(1)}%`);
  }
  test.info().annotations.push({ type: "prophet", description: JSON.stringify(body) });
});

test("busy example is cached and validation precedes CPU work", async ({ request }) => {
  expect((await request.post("/api/prophet", { data: { tuning: { "../evil": 1 } } })).status()).toBe(400);
  const first = request.post("/api/prophet", { data: { tuning: sample.response.tuning } });
  const replies = await Promise.all(Array.from({ length: 3 }, () => request.post("/api/prophet", { data: { tuning: sample.response.tuning } })));
  const bodies = await Promise.all(replies.map((r) => r.json()));
  expect(bodies.some((b) => b.cached === true && /cached offline/.test(b.cachedNotice))).toBe(true);
  expect((await first).status()).toBe(200);
});

test("cached crowd and errors are readable on phone width without losing tuning", async ({ page }) => {
  const cache = require("../data/prophet/example.json");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/balance", (route) => route.fulfill({ json: sample.response }));
  await page.route("**/api/prophet", (route) => route.fulfill({ json: { ...cache, cached: true, cachedNotice: "Prophet is busy. Showing the cached offline crowd result for this exact tuning." } }));
  await page.goto("/modes/balance");
  await page.getByRole("button", { name: "Use an example", exact: true }).click();
  await page.getByRole("button", { name: "Translate to tuning", exact: true }).click();
  await page.getByRole("button", { name: "Run Patch Prophet", exact: true }).click();
  await expect(page.getByRole("region", { name: "Patch Prophet results" })).toContainText("cached");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route("**/api/prophet", (route) => route.fulfill({ status: 429, json: { error: "No cached result matches this tuning." } }));
  await page.getByRole("button", { name: "Run Patch Prophet", exact: true }).click();
  await expect(page.locator(".notice-error[role=alert]")).toContainText("No cached result matches");
  await expect(page.getByRole("heading", { name: "Tuning changes", exact: true })).toBeVisible();
});
