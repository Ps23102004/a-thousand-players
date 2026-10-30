const { test, expect } = require('playwright/test');
const results = require('../data/reprobot/results.json');
const resultsCommon = require('../data/reprobot/results-common.json');

test('fresh-play block reflects the committed results', async ({ page }) => {
  await page.goto('/modes/repro');
  const block = page.getByRole('region', { name: 'Fresh-play experiment' });
  await expect(block).toBeVisible();
  if (results.placeholder) {
    await expect(block).toContainText('Not yet run');
  } else if (results.arms && Array.isArray(results.arms)) {
    await expect(block).toContainText(results.model || results.chooser || 'local');
    await expect(block).toContainText('not a success rate');
    await expect(block).toContainText('recorded build');
    await expect(block).toContainText('shipped build');
    await expect(block).toContainText('scripted control');
    await expect(block).toContainText('4 of 2,831');
    for (const arm of results.arms) {
      await expect(block).toContainText(`${arm.reproduced} of ${arm.completed}`);
    }
  } else {
    await expect(block).toContainText(`${results.reproduced} of ${results.rounds.filter(r => r.completed).length} completed fresh rounds`);
    await expect(block).toContainText(`${results.rounds.length} of ${results.requestedRounds} planned rounds`);
    await expect(block).toContainText('not a success rate');
    for (const round of results.rounds) await expect(block).toContainText(String(round.seed));
    if (results.model === 'fake') await expect(block).toContainText('fake-model');
    if (results.totals.nanoCalls && results.totals.fallbacks / results.totals.nanoCalls >= 0.25) await expect(block).toContainText('High fallback rate');
  }

  if (resultsCommon.placeholder) {
    await expect(block).toContainText('Not run yet');
  } else if (resultsCommon.arms && Array.isArray(resultsCommon.arms)) {
    await expect(block).toContainText('Common report');
    for (const arm of resultsCommon.arms) {
      await expect(block).toContainText(`${arm.reproduced} of ${arm.completed}`);
    }
  }
});
