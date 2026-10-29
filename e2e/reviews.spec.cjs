// Offline fixture corpus only. No public review claims are made by these invented test quotes.
const { test, expect } = require("playwright/test");
const { watch } = require("./helpers.cjs");

const fixtureCorpus = { version: 1, placeholder: false, entries: [{
  text: "Fixture opinion: the camera is frustrating and hides the action.",
  url: "https://www.pcgamer.com/fixture-review/", domain: "pcgamer.com",
  query: "fixture camera review", retrievedAt: "2026-10-29T00:00:00.000Z", theme: "camera",
}] };

test("review-grounded recommendation shows its exact quote and attributed link at phone width", async ({ page }) => {
  const review = fixtureCorpus.entries[0];
  await page.setViewportSize({ width: 375, height: 812 });
  // Fail closed if anything tries to reach a live service from the browser.
  await page.route(/https:\/\/(?:api\.tavily\.com|api\.tokenfactory\.nebius\.com)\//, (route) => route.abort());
  let posted;
  await page.route("**/api/advisor", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ json: {
      frameNotes: "Fixture frame notes.", frameTimes: [1, 2, 3, 4],
      sources: [{ kind: "review", title: "Fixture review", url: review.url, snippet: review.text, query: review.query, review }],
      searches: { run: 0, failed: 0 },
      recommendations: [{ area: "camera", suggestion: "Players dislike the camera; try clearer framing.",
        evidence: [{ type: "review", url: review.url, quote: review.text, domain: review.domain, retrievedAt: review.retrievedAt, theme: review.theme }],
        howToTest: "Human playtesters.", strength: "suggestion" }],
      proposed: 1, dropped: { recommendations: 0, evidence: 0, reasons: [] },
      models: { vision: "fixture", synthesis: "fixture" }, generatedAt: review.retrievedAt,
    } });
  });
  const w = watch(page);
  await page.goto("/modes/advisor");
  await expect(page.getByText(/public review quotes in the committed corpus/)).toBeVisible();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Capture 4 frames and get suggestions" }).click();
  const card = page.getByRole("article", { name: "Suggestion 1: camera" });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText("Player opinion (public reviews)")).toBeVisible();
  await expect(card.locator("blockquote")).toHaveText(review.text);
  await expect(card.getByRole("link", { name: review.domain })).toHaveAttribute("href", review.url);
  await expect(card).toContainText("topic (keyword guess): camera");
  await expect(card.locator("time")).toHaveAttribute("datetime", review.retrievedAt);
  expect(Object.keys(posted).sort()).toEqual(["frames", "key"]);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  expect(w.problems()).toEqual([]);
});
