// Bug hunt A1, A9, A11: crafted replay tokens get a clean "not valid" message, never a 500 or a blank canvas.
const { test, expect } = require("playwright/test");

const tok = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const persona = { id: "p0001", name: "Mira", archetype: "turtle", skill: 0.6, reaction_ticks: 14, patience: 0.4, frustration_tolerance: 0.7, bio: "blocks", rules: [] };
const base = { seed: 634310, tuning: null, fighter: "kai", maxT: 20 };

const PAGE_CASES = {
  "A1 persona.skill object": { ...base, persona: { ...persona, skill: { a: 1 } } },
  "A1 persona.bio array": { ...base, persona: { ...persona, bio: ["x"] } },
  "A1 persona.id object": { ...base, persona: { ...persona, id: { a: 1 } } },
  "A10 tuning rules.__proto__": { ...base, tuning: { "rules.__proto__": 1 } },
};
for (const [name, token] of Object.entries(PAGE_CASES)) {
  test(`/replay with ${name} shows the invalid-link page, not a 500`, async ({ page }) => {
    const res = await page.goto(`/replay?t=${tok(token)}`);
    expect(res.status()).toBe(200);
    await expect(page.locator(".notice").first()).toContainText("This replay link is not valid.");
  });
}

test("A11: a 10,000-character token gets the invalid-link page, not a raw 431", async ({ page }) => {
  const res = await page.goto(`/replay?t=${"A".repeat(10_000)}`);
  expect(res.status()).toBe(200);
  await expect(page.locator(".notice").first()).toContainText("This replay link is not valid.");
});

const GAME_CASES = {
  "persona with no id": { ...base, persona: (({ id, ...p }) => p)(persona) },
  "null rules entry": { ...base, persona: { ...persona, rules: [null] } },
  "null inputs entry": { ...base, inputs: [null] },
};
for (const [name, token] of Object.entries(GAME_CASES)) {
  test(`A9: game/replay.html with a ${name} shows an error message instead of a blank canvas`, async ({ page }) => {
    await page.goto(`/game/replay.html?t=${tok(token)}`);
    await expect(page.locator("#err")).toBeVisible();
    await expect(page.locator("#err")).toContainText(/malformed|could not start/);
  });
}
