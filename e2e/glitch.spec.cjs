const { test, expect } = require("playwright/test");

test("/bugs shows the Glitch Hunter not-run caveat from its static results file", async ({ page }) => {
  await page.goto("/bugs");
  const block = page.locator("[data-testid=glitch-hunt-score]");
  await expect(block).toBeVisible();
  await expect(block).toContainText("not run yet");
  await expect(block).toContainText("engine is the detector");
});
