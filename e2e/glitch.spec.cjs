const { test, expect } = require("playwright/test");
const results = require("../data/glitch-hunt/results.json");

test("/bugs shows the Glitch Hunter score block from its static results file", async ({ page }) => {
  await page.goto("/bugs");
  const block = page.locator("[data-testid=glitch-hunt-score]");
  await expect(block).toBeVisible();
  if (results.placeholder) await expect(block).toContainText("not run yet");
  else {
    const { hit, falseAlarm } = results.score.overall;
    await expect(block).toContainText(`${hit.yes}/${hit.total}`);
    await expect(block).toContainText(`${falseAlarm.yes}/${falseAlarm.total}`);
  }
  await expect(block).toContainText("engine is the detector");
});
