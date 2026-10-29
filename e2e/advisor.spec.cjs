// /modes/advisor: the page loads clean, says what it is and is not, shows the crowd table, fits a phone. No test here reaches a model:
// the one that clicks the button answers /api/advisor with the recorded sample (data/samples/advisor.json) while the real frame capture runs.
const { test, expect } = require("playwright/test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { watch, shot } = require("./helpers.cjs");

const CAVEAT = "Not trained on viral or player-preference data. These are cited suggestions from a vision model, your crowd data and current web writeups. They are not measured; test gameplay ones with the crowd and visual ones with people. Code checks that cited evidence exists, not that it is relevant.";

test("advisor page loads clean with the live tag, the caveat box and the crowd table", async ({ page }) => {
  const w = watch(page);
  const res = await page.goto("/modes/advisor");
  expect(res.status(), "HTTP status").toBe(200);
  await expect(page.locator("h1")).toHaveText("What would a design reviewer change?");
  await expect(page.getByText(/Live model call · /)).toBeVisible();
  const box = page.getByRole("note").filter({ hasText: "Not trained on viral" });
  await expect(box).toBeVisible();
  await expect(box).toHaveText(CAVEAT);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Advisor" })).toBeVisible();
  const table = page.locator("table");
  await expect(table.locator("tr", { hasText: "quit.casual" })).toContainText("97%");
  await expect(table.locator("tr", { hasText: "sweepNerf.cheeser" })).toContainText("92% before, 82% after");
  await expect(table.locator("tr", { hasText: "bugs.total" })).toContainText("29 rounds");
  await expect(page.locator("iframe.game-frame")).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture 4 frames and get suggestions" })).toBeEnabled();
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "route-advisor");
  expect(w.problems(), "console errors / failed requests").toEqual([]);
});

test("an unknown round gets a readable notice, not a crash", async ({ page }) => {
  const w = watch(page);
  const res = await page.goto("/modes/advisor?round=hello%20world");
  expect(res.status()).toBe(200);
  await expect(page.locator(".notice-error")).toContainText("That round is not in the recorded data");
  await expect(page.getByRole("note").filter({ hasText: "Not trained on viral" })).toBeVisible();
  expect(w.problems()).toEqual([]);
});

test("a pasted replay link selects its round", async ({ page }) => {
  await page.goto("/modes/advisor?round=" + encodeURIComponent("/replay?key=p0009:3&t=ignored"));
  await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: "The round: p0009:3" })).toBeVisible();
});

test("advisor page has no horizontal scroll at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/modes/advisor");
  await expect(page.locator("h1")).toBeVisible();
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, "page wider than the viewport").toBeLessThanOrEqual(client);
  await shot(page, "advisor-mobile");
});

test("the run button captures 4 real frames, posts the round key and frames, and renders the cited answer", async ({ page }) => {
  const sample = JSON.parse(readFileSync(join(__dirname, "..", "data/samples/advisor.json"), "utf8")).response;
  let posted = null;
  await page.route("**/api/advisor", async (route) => { posted = route.request().postDataJSON(); await route.fulfill({ json: sample }); });
  const w = watch(page);
  await page.goto("/modes/advisor");
  await page.waitForTimeout(3000); // the replay iframe loads its physics engine
  await page.getByRole("button", { name: "Capture 4 frames and get suggestions" }).click();
  await expect(page.getByRole("heading", { name: "Suggestions" })).toBeVisible({ timeout: 60_000 });
  expect(posted.key).toBe("p0396:1");
  expect(posted.frames).toHaveLength(4);
  expect(Object.keys(posted).sort(), "the client sends only the key and frames").toEqual(["frames", "key"]);
  await expect(page.getByRole("img", { name: /^Frame \d at / })).toHaveCount(4);
  const cards = page.locator("article[aria-label^='Suggestion']");
  await expect(cards).toHaveCount(sample.recommendations.length);
  for (let i = 0; i < sample.recommendations.length; i++) {
    await expect(cards.nth(i).getByLabel("Evidence").locator("li").first()).toBeVisible();
    await expect(cards.nth(i)).toContainText("How to test:");
  }
  await expect(page.getByText(/passed validation/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources the searches returned" })).toBeVisible();
  await shot(page, "advisor-answer");
  expect(w.problems(), "console errors / failed requests").toEqual([]);
});
