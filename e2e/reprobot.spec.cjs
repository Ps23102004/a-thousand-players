const { test, expect } = require('@playwright/test');
const results = require('../data/reprobot/results.json');

test('fresh-play block reflects the committed results', async ({ page }) => {
  await page.goto('/modes/repro');
  const block = page.getByRole('region', { name: 'Fresh-play experiment' });
  await expect(block).toBeVisible();
  if (results.placeholder) {
    await expect(block).toContainText('Not yet run');
  } else {
    await expect(block).toContainText(`${results.reproduced} of ${results.rounds.filter(r => r.completed).length} completed fresh rounds`);
    await expect(block).toContainText('not a success rate');
    for (const round of results.rounds) await expect(block).toContainText(String(round.seed));
    if (results.model === 'fake') await expect(block).toContainText('fake-model');
    if (results.totals.nanoCalls && results.totals.fallbacks / results.totals.nanoCalls >= 0.25) await expect(block).toContainText('High fallback rate');
  }
});
