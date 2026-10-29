// Fixture swaps are confined to this worktree's dev server on port 3164.
const { test, expect } = require('playwright/test');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const file = resolve(__dirname, '../data/tutor/results.json');
const base = new URL(process.env.E2E_BASE_URL || 'http://localhost:3140');
test.describe('Tutorial Director static states', () => {
  test.describe.configure({mode:'serial'});
  test.skip(!['localhost','127.0.0.1'].includes(base.hostname) || base.port !== '3164', 'Fixture swaps require this worktree server on port 3164');
  test('placeholder displays recorded evidence and not run yet', async ({page}) => {
    const saved = readFileSync(file);
    try {
      const data = JSON.parse(saved); writeFileSync(file,JSON.stringify({...data,placeholder:true,aids:[]}));
      await expect(async()=>{await page.goto('/modes/onboarding'); await expect(page.getByTestId('tutor-placeholder')).toContainText('Not run yet');}).toPass({timeout:60000});
      await expect(page.getByRole('rowheader',{name:'casual'})).toBeVisible();
    } finally { writeFileSync(file,saved); }
  });
  test('measured result displays all archetypes and limits', async ({page}) => {
    const saved = readFileSync(file);
    try {
      const data = JSON.parse(saved);
      const row = (archetype,wins) => ({archetype,rounds:2,wins,winRate:wins/2,bugRounds:0});
      const before={rounds:4,wins:1,winRate:.25,bugRounds:1,byArchetype:[row('casual',0),row('learner',1)]};
      const after={rounds:4,wins:2,winRate:.5,bugRounds:0,byArchetype:[row('casual',1),row('learner',1)]};
      data.placeholder=false; data.source='imported'; data.aids=[{aid:{title:'Guard',playerFacingText:'Hold away to guard.',rationale:'Casual struggles',archetype:'casual',tuningOverrides:{'anim.JAB.damage':12}},measurement:{before,after,personas:4,roundsEach:1,seed:1,wallMs:100,tuning:{'anim.JAB.damage':12},baselineTuning:{}}}];
      writeFileSync(file,JSON.stringify(data));
      await expect(async()=>{await page.goto('/modes/onboarding'); await expect(page.getByTestId('tutor-results')).toContainText('Hold away to guard.');}).toPass({timeout:60000});
      await expect(page.locator('article')).toContainText('50.0 percentage points');
      await expect(page.locator('article')).toContainText('learner');
      await expect(page.getByText('the quit/frustration model is NOT re-simulated',{exact:false})).toBeVisible();
      await page.setViewportSize({width:375,height:812});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { writeFileSync(file,saved); }
  });
});
