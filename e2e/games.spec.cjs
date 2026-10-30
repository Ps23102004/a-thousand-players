// /games: the multi-game results page loads clean, shows every game, and fits a phone.
const { test, expect } = require("playwright/test");
const { watch, shot } = require("./helpers.cjs");

test("games page loads clean with all three games", async ({ page }) => {
  const w = watch(page);
  const res = await page.goto("/games");
  expect(res.status(), "HTTP status").toBe(200);
  await expect(page.locator("h1")).toHaveText("Does it work beyond one game?");
  await expect(page.getByText(/Recorded run · /)).toBeVisible();
  for (const [id, name] of [["market-brawl", "Market Brawl"], ["homeground", "Homeground"], ["clean-getaway", "Clean Getaway"]]) {
    const card = page.locator(`article[data-game="${id}"]`);
    await expect(card.locator("h2")).toHaveText(name);
    await expect(card).toContainText(/replays \d+ of \d+ match/);
  }
  await expect(page.locator('article[data-game="homeground"]')).toContainText("seed 100135");
  await expect(page.getByText("Commercial games: not tested")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("GTA");
  await expect(page.locator("main")).not.toContainText("Bully");
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "route-games");
  expect(w.problems(), "console errors / failed requests").toEqual([]);
});

test("games page has no horizontal scroll at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/games");
  await expect(page.locator("h1")).toBeVisible();
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, "page wider than the viewport").toBeLessThanOrEqual(client);
  await shot(page, "games-mobile");
});
